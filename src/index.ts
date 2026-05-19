export { axelarPlugin } from "./plugin.js";

export const axelarPluginToolNames = {
  AXELAR_GET_SUPPORTED_CHAINS: "axelar_get_supported_chains",
  AXELAR_GET_MESSAGE_FEE: "axelar_get_message_fee",
  AXELAR_SEND_MESSAGE: "axelar_send_message",
  AXELAR_SEND_TOKEN: "axelar_send_token",
  AXELAR_GET_MESSAGE_STATUS: "axelar_get_message_status",
} as const;

export { AXELAR_MAINNET, AXELAR_TESTNET, NETWORK_DEFAULTS } from "./networks.js";
export type { AxelarNetworkDefaults, AxelarConfig } from "./networks.js";

export { axelarPlugin as default } from "./plugin.js";
