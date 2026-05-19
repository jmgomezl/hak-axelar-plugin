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
import { hexToBytes } from "../utils/units.js";

const SendMessageSchema = z.object({
  destinationChain: z
    .string()
    .min(1)
    .describe(
      'Axelar chain name for the destination (e.g. "ethereum", "base", "arbitrum"). ' +
        "Use axelar_get_supported_chains to confirm the chain is reachable.",
    ),
  destinationContract: z
    .string()
    .min(1)
    .describe(
      "EVM address of the destination contract. It MUST implement AxelarExecutable " +
        "(inherit from @axelar-network/axelar-gmp-sdk-solidity AxelarExecutable.sol).",
    ),
  payload: z
    .string()
    .optional()
    .default("0x")
    .describe(
      "ABI-encoded payload bytes as a hex string (with or without 0x prefix). " +
        'Use "0x" or omit for an empty payload (e.g. a ping).',
    ),
  gasTinybars: z
    .string()
    .min(1)
    .describe(
      "HBAR amount in tinybars (1 HBAR = 100,000,000 tinybars) to pay for Axelar relay execution. " +
        "Use axelar_get_message_fee to estimate the required amount. " +
        "Example: '5000000' = 0.05 HBAR.",
    ),
  network: z
    .enum(["mainnet", "testnet"])
    .optional()
    .describe('Override network. Defaults to AXELAR_NETWORK env var or "mainnet".'),
});

type SendMessageInput = z.infer<typeof SendMessageSchema>;

interface SendMessagePayload {
  transaction: ContractExecuteTransaction;
  extras: {
    callContractTx: ContractExecuteTransaction;
    destinationChain: string;
    destinationContract: string;
    payloadHex: string;
    gasTinybars: string;
  };
}

interface ErrorResult {
  success: false;
  error: string;
}

interface SendMessageResult {
  success: boolean;
  sourceTxHash?: string;
  gasTxId?: string;
  callTxId?: string;
  destinationChain: string;
  destinationContract: string;
  payloadHex: string;
  gasTinybars: string;
  axelarScanUrl?: string;
  error?: string;
}

export class SendMessageTool extends BaseTool<SendMessageInput, SendMessageInput> {
  method = "axelar_send_message";
  name = "Axelar Send Cross-Chain Message";
  description =
    "Sends a GMP (General Message Passing) message from Hedera to a contract on another chain " +
    "via Axelar Network. The destination contract must implement AxelarExecutable. " +
    "Submits two Hedera transactions: (1) gas payment to AxelarGasService, " +
    "(2) callContract on AxelarGateway. " +
    "Use axelar_get_message_fee first to estimate gasTinybars. " +
    "Track delivery with axelar_get_message_status.";
  parameters = SendMessageSchema;

  async normalizeParams(
    params: SendMessageInput,
    _context: Context,
    _client: Client,
  ): Promise<SendMessageInput> {
    return SendMessageSchema.parse(params);
  }

  async coreAction(
    args: SendMessageInput,
    context: Context,
    client: Client,
  ): Promise<SendMessagePayload | ErrorResult> {
    const hederaClient = client;
    const ctxConfig = readContextConfig(context);
    if (args.network) ctxConfig.network = args.network;
    const net = resolveNetworkDefaults(ctxConfig);

    // Resolve caller EVM address for gas payment sender / refund
    let senderEvmAddress: string;
    try {
      senderEvmAddress = hederaClient.operatorPublicKey?.toEvmAddress() ?? "";
    } catch {
      senderEvmAddress = "";
    }
    if (!senderEvmAddress) {
      return {
        success: false,
        error:
          "Could not derive operator EVM address. " +
          "Ensure the Hedera operator key is ECDSA-compatible (not Ed25519).",
      };
    }

    let payloadBytes: Uint8Array;
    try {
      payloadBytes = hexToBytes(args.payload ?? "0x");
    } catch (e) {
      return { success: false, error: `Invalid payload hex: ${(e as Error).message}` };
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

    try {
      const gatewayId = ContractId.fromEvmAddress(0, 0, net.gatewayAddress);
      const gasServiceId = ContractId.fromEvmAddress(0, 0, net.gasServiceAddress);

      // Tx 1: pay gas to AxelarGasService (payable, sends HBAR)
      const gasPaymentTx = new ContractExecuteTransaction()
        .setContractId(gasServiceId)
        .setGas(400_000)
        .setPayableAmount(Hbar.fromTinybars(gasTinybarsNum))
        .setFunction(
          "payNativeGasForContractCall",
          new ContractFunctionParameters()
            .addAddress(senderEvmAddress)
            .addString(args.destinationChain)
            .addString(args.destinationContract)
            .addBytes(payloadBytes)
            .addAddress(senderEvmAddress), // refundAddress
        );

      // Tx 2: callContract on AxelarGateway
      const callContractTx = new ContractExecuteTransaction()
        .setContractId(gatewayId)
        .setGas(400_000)
        .setFunction(
          "callContract",
          new ContractFunctionParameters()
            .addString(args.destinationChain)
            .addString(args.destinationContract)
            .addBytes(payloadBytes),
        );

      return {
        transaction: gasPaymentTx,
        extras: {
          callContractTx,
          destinationChain: args.destinationChain,
          destinationContract: args.destinationContract,
          payloadHex: args.payload ?? "0x",
          gasTinybars: args.gasTinybars,
        },
      };
    } catch (e) {
      return { success: false, error: `Failed to build transaction: ${(e as Error).message}` };
    }
  }

  override async shouldSecondaryAction(
    coreResult: unknown,
    _context: Context,
  ): Promise<boolean> {
    return (
      typeof coreResult === "object" &&
      coreResult !== null &&
      "transaction" in coreResult
    );
  }

  async secondaryAction(
    payload: SendMessagePayload,
    client: Client,
    context: Context,
  ): Promise<SendMessageResult> {
    const hederaClient = client;
    const ctxConfig = readContextConfig(context);
    const net = resolveNetworkDefaults(ctxConfig);
    const isMainnet = !net.gmpApiBaseUrl.includes("testnet");
    const scanBase = isMainnet ? "https://axelarscan.io" : "https://testnet.axelarscan.io";

    // Submit gas payment transaction first
    let gasTxId: string | undefined;
    try {
      const gasResult = await handleTransaction(payload.transaction, hederaClient, context);
      gasTxId = (gasResult as Record<string, unknown>).transactionId as string | undefined;
    } catch (e) {
      return {
        success: false,
        error: `Gas payment transaction failed: ${(e as Error).message}`,
        destinationChain: payload.extras.destinationChain,
        destinationContract: payload.extras.destinationContract,
        payloadHex: payload.extras.payloadHex,
        gasTinybars: payload.extras.gasTinybars,
      };
    }

    // Submit callContract transaction
    let callResult: Record<string, unknown>;
    try {
      callResult = (await handleTransaction(
        payload.extras.callContractTx,
        hederaClient,
        context,
      )) as Record<string, unknown>;
    } catch (e) {
      return {
        success: false,
        error: `callContract transaction failed: ${(e as Error).message}`,
        gasTxId,
        destinationChain: payload.extras.destinationChain,
        destinationContract: payload.extras.destinationContract,
        payloadHex: payload.extras.payloadHex,
        gasTinybars: payload.extras.gasTinybars,
      };
    }

    const callTxId = callResult.transactionId as string | undefined;
    const callTxHash = callTxId?.replace(/[@/]/g, "-") ?? "";

    return {
      success: true,
      gasTxId,
      callTxId,
      sourceTxHash: callTxHash,
      destinationChain: payload.extras.destinationChain,
      destinationContract: payload.extras.destinationContract,
      payloadHex: payload.extras.payloadHex,
      gasTinybars: payload.extras.gasTinybars,
      axelarScanUrl: callTxHash ? `${scanBase}/gmp/${callTxHash}` : undefined,
    };
  }
}

export const sendMessageTool = new SendMessageTool();
