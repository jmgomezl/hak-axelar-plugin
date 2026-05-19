import type { Context } from "@hashgraph/hedera-agent-kit";
import { NETWORK_DEFAULTS, type AxelarConfig, type AxelarNetworkDefaults } from "../networks.js";

/**
 * Reads Axelar plugin config from the HAK context.
 * HAK stores plugin config under context.pluginConfig (keyed by plugin name).
 */
export function readContextConfig(context: Context): Partial<AxelarConfig> {
  const ctx = context as Record<string, unknown>;
  for (const key of ["pluginConfig", "config", "agentConfig"]) {
    const bucket = ctx[key];
    if (bucket && typeof bucket === "object") {
      const b = bucket as Record<string, unknown>;
      if (b["hak-axelar-plugin"] && typeof b["hak-axelar-plugin"] === "object") {
        return b["hak-axelar-plugin"] as Partial<AxelarConfig>;
      }
      if (b.axelar && typeof b.axelar === "object") {
        return b.axelar as Partial<AxelarConfig>;
      }
    }
  }
  return {};
}

/**
 * Parses a network string into "mainnet" | "testnet" | undefined.
 */
export function readNetwork(value: string | undefined): "mainnet" | "testnet" | undefined {
  if (value === "mainnet" || value === "testnet") return value;
  return undefined;
}

/**
 * Resolves the full network defaults for a given context + env, applying
 * any per-field overrides from ctxConfig or env vars.
 *
 * Precedence (highest → lowest): ctxConfig > env var > network default
 */
export function resolveNetworkDefaults(ctxConfig: Partial<AxelarConfig>): AxelarNetworkDefaults {
  const network =
    ctxConfig.network ??
    readNetwork(process.env.AXELAR_NETWORK) ??
    "mainnet";

  const defaults = NETWORK_DEFAULTS[network];

  return {
    ...defaults,
    gatewayAddress:
      ctxConfig.gatewayAddress ??
      process.env.AXELAR_GATEWAY_ADDRESS ??
      defaults.gatewayAddress,
    gasServiceAddress:
      ctxConfig.gasServiceAddress ??
      process.env.AXELAR_GAS_SERVICE_ADDRESS ??
      defaults.gasServiceAddress,
    itsAddress:
      ctxConfig.itsAddress ??
      process.env.AXELAR_ITS_ADDRESS ??
      defaults.itsAddress,
    apiBaseUrl:
      ctxConfig.apiBaseUrl ??
      defaults.apiBaseUrl,
    gmpApiBaseUrl:
      ctxConfig.gmpApiBaseUrl ??
      defaults.gmpApiBaseUrl,
    nestServerUrl:
      ctxConfig.nestServerUrl ??
      defaults.nestServerUrl,
  };
}
