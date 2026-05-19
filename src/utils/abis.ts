/**
 * Minimal ABI fragments for the Axelar contracts used by this plugin.
 * Using inline ABIs avoids pulling in @axelar-network/axelar-cgp-solidity as a runtime dep.
 */

export const GATEWAY_ABI = [
  {
    name: "callContract",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "destinationChain", type: "string" },
      { name: "contractAddress", type: "string" },
      { name: "payload", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const GAS_SERVICE_ABI = [
  {
    name: "payNativeGasForContractCall",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "sender", type: "address" },
      { name: "destinationChain", type: "string" },
      { name: "destinationAddress", type: "string" },
      { name: "payload", type: "bytes" },
      { name: "refundAddress", type: "address" },
    ],
    outputs: [],
  },
] as const;

export const ITS_ABI = [
  {
    name: "interchainTransfer",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "tokenId", type: "bytes32" },
      { name: "destinationChain", type: "string" },
      { name: "destinationAddress", type: "bytes" },
      { name: "amount", type: "uint256" },
      { name: "metadata", type: "bytes" },
      { name: "gasValue", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
