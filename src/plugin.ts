import type { Context, Plugin } from "@hashgraph/hedera-agent-kit";
import { getMessageFeeTool } from "./tools/get-message-fee.js";
import { getMessageStatusTool } from "./tools/get-message-status.js";
import { getSupportedChainsTool } from "./tools/get-supported-chains.js";
import { sendMessageTool } from "./tools/send-message.js";
import { sendTokenTool } from "./tools/send-token.js";

export const axelarPlugin: Plugin = {
  name: "hak-axelar-plugin",
  version: "1.0.0",
  description:
    "Axelar Network cross-chain plugin for Hedera Agent Kit — bridge tokens and send GMP messages between Hedera and 60+ chains",
  tools: (_context: Context) => [
    getSupportedChainsTool,
    getMessageFeeTool,
    sendMessageTool,
    sendTokenTool,
    getMessageStatusTool,
  ],
};
