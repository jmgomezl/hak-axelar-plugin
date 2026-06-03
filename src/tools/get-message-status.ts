import { BaseTool, type Context } from "@hashgraph/hedera-agent-kit";
import type { Client } from "@hiero-ledger/sdk";
import { z } from "zod";
import { readContextConfig, resolveNetworkDefaults } from "../utils/config.js";

const GetMessageStatusSchema = z.object({
  txHash: z
    .string()
    .min(1)
    .describe(
      "The Hedera transaction hash of the axelar_send_message or axelar_send_token call " +
        "(the callContract transaction, not the gas payment transaction).",
    ),
  network: z
    .enum(["mainnet", "testnet"])
    .optional()
    .describe('Override network. Defaults to AXELAR_NETWORK env var or "mainnet".'),
});

type GetMessageStatusInput = z.infer<typeof GetMessageStatusSchema>;

// Axelar GMP status stages
type GmpStatus =
  | "called"
  | "gas_paid"
  | "gas_paid_enough"
  | "confirming"
  | "confirmed"
  | "approved"
  | "executing"
  | "executed"
  | "error"
  | "insufficient_fee"
  | "not_found";

interface MessageStatus {
  success: true;
  status: GmpStatus;
  txHash: string;
  sourceChain: string;
  destinationChain?: string;
  destinationContract?: string;
  executionTxHash?: string;
  gasPaid?: boolean;
  isExecuted: boolean;
  isError: boolean;
  axelarScanUrl: string;
}

interface ErrorResult {
  success: false;
  error: string;
}

export class GetMessageStatusTool extends BaseTool<GetMessageStatusInput, GetMessageStatusInput> {
  method = "axelar_get_message_status";
  name = "Axelar Get Message Status";
  description =
    "Checks the delivery status of a cross-chain message sent via Axelar from Hedera. " +
    "Tracks all five stages: called → gas_paid → approved → executing → executed. " +
    "Pass the Hedera transaction hash from axelar_send_message or axelar_send_token.";
  parameters = GetMessageStatusSchema;

  async normalizeParams(
    params: GetMessageStatusInput,
    _context: Context,
    _client: Client,
  ): Promise<GetMessageStatusInput> {
    return GetMessageStatusSchema.parse(params);
  }

  async coreAction(
    args: GetMessageStatusInput,
    context: Context,
    _client: Client,
  ): Promise<MessageStatus | ErrorResult> {
    const ctxConfig = readContextConfig(context);
    if (args.network) ctxConfig.network = args.network;
    const net = resolveNetworkDefaults(ctxConfig);

    try {
      const url =
        `${net.gmpApiBaseUrl}/?method=searchGMP` +
        `&sourceTransactionHash=${encodeURIComponent(args.txHash)}`;

      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return {
          success: false,
          error: `Axelar GMP API returned HTTP ${res.status}`,
        };
      }

      const body = (await res.json()) as Record<string, unknown>;
      const items = Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [];

      if (items.length === 0) {
        return buildStatus(args.txHash, "not_found", null, net);
      }

      const item = items[0] as Record<string, unknown>;
      return buildStatus(args.txHash, resolveStatus(item), item, net);
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  override async shouldSecondaryAction(coreResult: unknown, _context: Context): Promise<boolean> {
    return typeof coreResult === "object" && coreResult !== null && "transaction" in coreResult;
  }

  async secondaryAction(): Promise<never> {
    throw new Error("GetMessageStatusTool has no secondary action");
  }
}

function resolveStatus(item: Record<string, unknown>): GmpStatus {
  const status = String(item.status ?? item.simplified_status ?? "").toLowerCase();
  const map: Record<string, GmpStatus> = {
    called: "called",
    gas_paid: "gas_paid",
    gas_paid_enough: "gas_paid_enough",
    confirming: "confirming",
    confirmed: "confirmed",
    approved: "approved",
    executing: "executing",
    executed: "executed",
    error: "error",
    insufficient_fee: "insufficient_fee",
  };
  return map[status] ?? "called";
}

function buildStatus(
  txHash: string,
  status: GmpStatus,
  item: Record<string, unknown> | null,
  net: { gmpApiBaseUrl: string; chainName: string },
): MessageStatus {
  const call = (item?.call as Record<string, unknown>) ?? {};
  const execute = (item?.executed as Record<string, unknown>) ?? {};
  const isMainnet = net.gmpApiBaseUrl.includes("testnet") ? false : true;
  const scanBase = isMainnet ? "https://axelarscan.io" : "https://testnet.axelarscan.io";

  return {
    success: true,
    status,
    txHash,
    sourceChain: String(item?.sourceChain ?? net.chainName),
    destinationChain: item?.destinationChain ? String(item.destinationChain) : undefined,
    destinationContract: call.destinationContractAddress
      ? String(call.destinationContractAddress)
      : undefined,
    executionTxHash: execute.transactionHash ? String(execute.transactionHash) : undefined,
    gasPaid: Boolean(item?.gasPaid ?? item?.gas_paid),
    isExecuted: status === "executed",
    isError: status === "error" || status === "insufficient_fee",
    axelarScanUrl: `${scanBase}/gmp/${txHash}`,
  };
}

export const getMessageStatusTool = new GetMessageStatusTool();
