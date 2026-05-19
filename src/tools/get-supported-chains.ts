import { BaseTool, type Context } from "@hashgraph/hedera-agent-kit";
import type { Client } from "@hiero-ledger/sdk";
import { z } from "zod";
import { readContextConfig, resolveNetworkDefaults } from "../utils/config.js";

const GetSupportedChainsSchema = z.object({
  network: z
    .enum(["mainnet", "testnet"])
    .optional()
    .describe('Override network selection. Defaults to AXELAR_NETWORK env var or "mainnet".'),
});

type GetSupportedChainsInput = z.infer<typeof GetSupportedChainsSchema>;

interface ChainInfo {
  id: string;
  name: string;
  chainId?: number;
  type: string;
  status?: string;
}

interface GetSupportedChainsResult {
  success: true;
  network: string;
  sourceChain: string;
  chains: ChainInfo[];
  count: number;
}

interface ErrorResult {
  success: false;
  error: string;
}

export class GetSupportedChainsTool extends BaseTool<
  GetSupportedChainsInput,
  GetSupportedChainsInput
> {
  method = "axelar_get_supported_chains";
  name = "Axelar Get Supported Chains";
  description =
    "Returns all chains reachable from Hedera via Axelar Network. " +
    "Includes chain IDs, names, and type (EVM / non-EVM). " +
    "Use this before sending tokens or messages to confirm the destination chain is supported.";
  parameters = GetSupportedChainsSchema;

  async normalizeParams(
    params: GetSupportedChainsInput,
    _context: Context,
    _client: Client,
  ): Promise<GetSupportedChainsInput> {
    return GetSupportedChainsSchema.parse(params);
  }

  async coreAction(
    args: GetSupportedChainsInput,
    context: Context,
    _client: Client,
  ): Promise<GetSupportedChainsResult | ErrorResult> {
    const ctxConfig = readContextConfig(context);
    if (args.network) ctxConfig.network = args.network;
    const net = resolveNetworkDefaults(ctxConfig);

    try {
      const url = `${net.apiBaseUrl}/api/getChains`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return { success: false, error: `Axelar API returned HTTP ${res.status}` };
      }

      const data = (await res.json()) as unknown;
      const chains = parseChains(data);

      return {
        success: true,
        network: ctxConfig.network ?? process.env.AXELAR_NETWORK ?? "mainnet",
        sourceChain: net.chainName,
        chains,
        count: chains.length,
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
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

  async secondaryAction(): Promise<never> {
    throw new Error("GetSupportedChainsTool has no secondary action");
  }
}

function parseChains(data: unknown): ChainInfo[] {
  if (!data || typeof data !== "object") return [];

  // AxelarScan returns { data: Chain[] } or { result: Chain[] } or Chain[]
  let raw: unknown[] = [];
  if (Array.isArray(data)) {
    raw = data;
  } else {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.data)) raw = d.data;
    else if (Array.isArray(d.result)) raw = d.result;
  }

  return raw
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      id: String(c.id ?? c.chain_id ?? c.axelarId ?? ""),
      name: String(c.name ?? c.chain_name ?? c.id ?? ""),
      chainId: typeof c.chain_id === "number" ? c.chain_id : undefined,
      type: String(c.chain_type ?? (c.evm ? "evm" : "non-evm")),
      status: typeof c.status === "string" ? c.status : undefined,
    }))
    .filter((c) => c.id !== "hedera" && c.id !== "");
}

export const getSupportedChainsTool = new GetSupportedChainsTool();
