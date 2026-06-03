import { BaseTool, type Context, handleTransaction } from "@hashgraph/hedera-agent-kit";
import {
  Client,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  Hbar,
} from "@hiero-ledger/sdk";
import { z } from "zod";
import { readContextConfig, resolveNetworkDefaults } from "../utils/config.js";
import { encodeEvmAddress, hexToBytes32, safeUint256 } from "../utils/units.js";

const SendTokenSchema = z.object({
  interchainTokenId: z
    .string()
    .min(1)
    .describe(
      "The Axelar ITS token ID (bytes32 hex string, with or without 0x prefix). " +
        "This is the token registry ID, NOT the ERC-20 contract address. " +
        "Find token IDs via the Axelar ITS registry or the token deployer.",
    ),
  destinationChain: z
    .string()
    .min(1)
    .describe(
      'Axelar chain name for the destination (e.g. "ethereum", "base", "arbitrum"). ' +
        "The token must be registered on this chain in the ITS registry.",
    ),
  destinationAddress: z
    .string()
    .min(1)
    .describe(
      "EVM address of the token recipient on the destination chain (0x-prefixed hex, 20 bytes).",
    ),
  amount: z
    .string()
    .min(1)
    .describe(
      "Token amount to bridge in base units (smallest denomination). " +
        "Example: to send 1 USDC (6 decimals), pass '1000000'.",
    ),
  gasTinybars: z
    .string()
    .min(1)
    .describe(
      "HBAR amount in tinybars to pay for Axelar relay execution on the destination chain. " +
        "This HBAR is forwarded to AxelarGasService via the ITS contract. " +
        "Use axelar_get_message_fee to estimate. Example: '5000000' = 0.05 HBAR.",
    ),
  metadata: z
    .string()
    .optional()
    .default("0x")
    .describe('ABI-encoded ITS metadata as hex string. Pass "0x" or omit for standard transfer.'),
  network: z
    .enum(["mainnet", "testnet"])
    .optional()
    .describe('Override network. Defaults to AXELAR_NETWORK env var or "mainnet".'),
});

type SendTokenInput = z.infer<typeof SendTokenSchema>;

interface SendTokenPayload {
  transaction: ContractExecuteTransaction;
  extras: {
    interchainTokenId: string;
    destinationChain: string;
    destinationAddress: string;
    amount: string;
    gasTinybars: string;
  };
}

interface ErrorResult {
  success: false;
  error: string;
}

interface SendTokenResult {
  success: boolean;
  txId?: string;
  sourceTxHash?: string;
  interchainTokenId: string;
  destinationChain: string;
  destinationAddress: string;
  amount: string;
  gasTinybars: string;
  axelarScanUrl?: string;
  error?: string;
}

export class SendTokenTool extends BaseTool<SendTokenInput, SendTokenInput> {
  method = "axelar_send_token";
  name = "Axelar Send Interchain Token";
  description =
    "Bridges a registered ITS (Interchain Token Service) token from Hedera to another chain " +
    "via Axelar Network. Calls InterchainTokenService.interchainTransfer() in a single transaction, " +
    "paying gas in HBAR. " +
    "IMPORTANT: The token must be registered in the Axelar ITS registry. " +
    "Classic axlUSDC deposit-address bridging is NOT supported on Hedera (Amplifier architecture). " +
    "The recipient must have associated the HTS token on Hedera before receiving it back.";
  parameters = SendTokenSchema;

  async normalizeParams(
    params: SendTokenInput,
    _context: Context,
    _client: Client,
  ): Promise<SendTokenInput> {
    return SendTokenSchema.parse(params);
  }

  async coreAction(
    args: SendTokenInput,
    context: Context,
    _client: Client,
  ): Promise<SendTokenPayload | ErrorResult> {
    const ctxConfig = readContextConfig(context);
    if (args.network) ctxConfig.network = args.network;
    const net = resolveNetworkDefaults(ctxConfig);

    let tokenIdBytes: Uint8Array;
    try {
      tokenIdBytes = hexToBytes32(args.interchainTokenId);
    } catch (e) {
      return { success: false, error: `Invalid interchainTokenId: ${(e as Error).message}` };
    }

    let destAddressBytes: Uint8Array;
    try {
      destAddressBytes = encodeEvmAddress(args.destinationAddress);
    } catch (e) {
      return { success: false, error: `Invalid destinationAddress: ${(e as Error).message}` };
    }

    let metadataBytes: Uint8Array;
    try {
      const rawMeta = args.metadata ?? "0x";
      metadataBytes =
        rawMeta === "0x" || rawMeta === "" ? new Uint8Array(0) : hexToBytes32(rawMeta);
    } catch (e) {
      return { success: false, error: `Invalid metadata: ${(e as Error).message}` };
    }

    let gasTinybarsNum: number;
    try {
      gasTinybarsNum = Number(args.gasTinybars);
      if (!Number.isFinite(gasTinybarsNum) || gasTinybarsNum <= 0) {
        return { success: false, error: "gasTinybars must be a positive integer string" };
      }
    } catch {
      return { success: false, error: "gasTinybars must be a positive integer string" };
    }

    // gasValue in weibar (18-decimal EVM representation of HBAR): tinybars × 10^10
    // Use BigInt to avoid Long's ESM/CJS module-instance issue with addUint256
    const gasValueWei = (BigInt(args.gasTinybars) * BigInt(10_000_000_000)).toString();

    try {
      const itsId = ContractId.fromEvmAddress(0, 0, net.itsAddress);

      const tx = new ContractExecuteTransaction()
        .setContractId(itsId)
        .setGas(800_000)
        .setPayableAmount(Hbar.fromTinybars(gasTinybarsNum))
        .setFunction(
          "interchainTransfer",
          new ContractFunctionParameters()
            .addBytes32(tokenIdBytes)
            .addString(args.destinationChain)
            .addBytes(destAddressBytes)
            .addUint256(safeUint256(args.amount))
            .addBytes(metadataBytes)
            .addUint256(safeUint256(gasValueWei)),
        );

      return {
        transaction: tx,
        extras: {
          interchainTokenId: args.interchainTokenId,
          destinationChain: args.destinationChain,
          destinationAddress: args.destinationAddress,
          amount: args.amount,
          gasTinybars: args.gasTinybars,
        },
      };
    } catch (e) {
      return { success: false, error: `Failed to build transaction: ${(e as Error).message}` };
    }
  }

  override async shouldSecondaryAction(coreResult: unknown, _context: Context): Promise<boolean> {
    return typeof coreResult === "object" && coreResult !== null && "transaction" in coreResult;
  }

  async secondaryAction(
    payload: SendTokenPayload,
    client: Client,
    context: Context,
  ): Promise<SendTokenResult> {
    const hederaClient = client;
    const ctxConfig = readContextConfig(context);
    const net = resolveNetworkDefaults(ctxConfig);
    const isMainnet = !net.gmpApiBaseUrl.includes("testnet");
    const scanBase = isMainnet ? "https://axelarscan.io" : "https://testnet.axelarscan.io";

    let result: Record<string, unknown>;
    try {
      result = (await handleTransaction(payload.transaction, hederaClient, context)) as Record<
        string,
        unknown
      >;
    } catch (e) {
      return {
        success: false,
        error: (e as Error).message,
        ...payload.extras,
      };
    }

    const txId = result.transactionId as string | undefined;
    const sourceTxHash = txId?.replace(/[@/]/g, "-") ?? "";

    return {
      success: true,
      txId,
      sourceTxHash,
      ...payload.extras,
      axelarScanUrl: sourceTxHash ? `${scanBase}/gmp/${sourceTxHash}` : undefined,
    };
  }
}

export const sendTokenTool = new SendTokenTool();
