import { BaseTool, type Context } from "@hashgraph/hedera-agent-kit";
import type { Client } from "@hiero-ledger/sdk";
import { z } from "zod";
import { readContextConfig, resolveNetworkDefaults } from "../utils/config.js";

const GetMessageFeeSchema = z.object({
  destinationChain: z
    .string()
    .min(1)
    .describe(
      'Axelar chain name for the destination (e.g. "ethereum", "base", "arbitrum", "xrpl"). ' +
        "Use axelar_get_supported_chains to list valid names.",
    ),
  gasLimit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(200_000)
    .describe("Gas limit for the destination contract execution (default: 200000)."),
  network: z
    .enum(["mainnet", "testnet"])
    .optional()
    .describe('Override network. Defaults to AXELAR_NETWORK env var or "mainnet".'),
});

type GetMessageFeeInput = z.infer<typeof GetMessageFeeSchema>;

interface FeeEstimate {
  success: true;
  network: string;
  sourceChain: string;
  destinationChain: string;
  gasLimit: number;
  baseFee: string;
  executionFee: string;
  executionFeeWithMultiplier: string;
  gasMultiplier: number;
  isExpressSupported: boolean;
  unit: string;
}

interface ErrorResult {
  success: false;
  error: string;
}

export class GetMessageFeeTool extends BaseTool<GetMessageFeeInput, GetMessageFeeInput> {
  method = "axelar_get_message_fee";
  name = "Axelar Get Message Fee";
  description =
    "Estimates the HBAR fee required to send a cross-chain GMP message from Hedera via Axelar. " +
    "Returns baseFee, executionFee, and total fee with multiplier, all denominated in tinybars. " +
    "Call this before axelar_send_message to determine the gasTinybars parameter.";
  parameters = GetMessageFeeSchema;

  async normalizeParams(
    params: GetMessageFeeInput,
    _context: Context,
    _client: Client,
  ): Promise<GetMessageFeeInput> {
    return GetMessageFeeSchema.parse(params);
  }

  async coreAction(
    args: GetMessageFeeInput,
    context: Context,
    _client: Client,
  ): Promise<FeeEstimate | ErrorResult> {
    const ctxConfig = readContextConfig(context);
    if (args.network) ctxConfig.network = args.network;
    const net = resolveNetworkDefaults(ctxConfig);

    try {
      const fee = await fetchGasFee(
        net.nestServerUrl,
        net.chainName,
        args.destinationChain,
        args.gasLimit,
      );

      return {
        success: true,
        network: ctxConfig.network ?? process.env.AXELAR_NETWORK ?? "mainnet",
        sourceChain: net.chainName,
        destinationChain: args.destinationChain,
        gasLimit: args.gasLimit,
        baseFee: fee.baseFee,
        executionFee: fee.executionFee,
        executionFeeWithMultiplier: fee.executionFeeWithMultiplier,
        gasMultiplier: fee.gasMultiplier,
        isExpressSupported: fee.isExpressSupported,
        unit: "tinybars",
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  override async shouldSecondaryAction(coreResult: unknown, _context: Context): Promise<boolean> {
    return typeof coreResult === "object" && coreResult !== null && "transaction" in coreResult;
  }

  async secondaryAction(): Promise<never> {
    throw new Error("GetMessageFeeTool has no secondary action");
  }
}

interface RawFeeResponse {
  baseFee: string;
  executionFee: string;
  executionFeeWithMultiplier: string;
  gasMultiplier: number;
  isExpressSupported: boolean;
}

async function fetchGasFee(
  nestServerUrl: string,
  sourceChain: string,
  destinationChain: string,
  gasLimit: number,
): Promise<RawFeeResponse> {
  const res = await fetch(`${nestServerUrl}/getGasFee`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sourceChainName: sourceChain,
      destinationChainName: destinationChain,
      sourceTokenSymbol: "HBAR",
      gasLimit: gasLimit.toString(),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(
      `Axelar fee API returned HTTP ${res.status}: ${await res.text().catch(() => "")}`,
    );
  }

  const body = (await res.json()) as Record<string, unknown>;

  // Normalise response — the nest-server wraps results differently across versions
  const result = (body.result ?? body) as Record<string, unknown>;

  return {
    baseFee: String(result.baseFee ?? result.base_fee ?? "0"),
    executionFee: String(result.executionFee ?? result.execution_fee ?? "0"),
    executionFeeWithMultiplier: String(
      result.executionFeeWithMultiplier ?? result.executionFee ?? "0",
    ),
    gasMultiplier: Number(result.gasMultiplier ?? result.gas_multiplier ?? 1),
    isExpressSupported: Boolean(result.isExpressSupported ?? false),
  };
}

export const getMessageFeeTool = new GetMessageFeeTool();
