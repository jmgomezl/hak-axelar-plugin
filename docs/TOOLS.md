# Tool Reference — hak-axelar-plugin

This document provides a complete reference for all five tools exported by `hak-axelar-plugin`. Each tool is a class that extends `BaseTool` from Hedera Agent Kit and is exported as a singleton instance.

---

## Table of contents

1. [axelar_get_supported_chains](#1-axelar_get_supported_chains)
2. [axelar_get_message_fee](#2-axelar_get_message_fee)
3. [axelar_send_message](#3-axelar_send_message)
4. [axelar_send_token](#4-axelar_send_token)
5. [axelar_get_message_status](#5-axelar_get_message_status)

---

## 1. axelar_get_supported_chains

**Tool class:** `AxelarGetSupportedChainsTool`
**Tool name:** `axelar_get_supported_chains`
**Type:** Query (no Hedera transaction)

### Description

Lists all blockchain networks that are reachable from Hedera via Axelar Network. Internally calls the AxelarScan REST API (`GET /chains`) and filters for active chains. Returns an array of chain descriptor objects with display name, chain ID, native asset, and whether ITS is supported.

Use this tool before sending a message or bridging a token to verify the destination chain name string that Axelar expects (e.g., `"ethereum"`, `"base"`, `"avalanche"`).

### Parameters

This tool takes no parameters.

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| network | `"mainnet" \| "testnet"` | No | Plugin-level network default | Override the network for this call only. |

### Return shape

```typescript
interface SupportedChain {
  chainName: string;          // Axelar chain identifier, e.g. "ethereum"
  displayName: string;        // Human-readable name, e.g. "Ethereum"
  chainId: number | null;     // EVM chain ID, null for non-EVM chains
  nativeAsset: string;        // Native token symbol, e.g. "ETH"
  itsSupported: boolean;      // Whether Interchain Token Service is available
  isActive: boolean;          // Whether the chain is currently active on Axelar
}

// Tool response
interface GetSupportedChainsResult {
  success: true;
  chains: SupportedChain[];
  count: number;
  network: "mainnet" | "testnet";
}

// On error
interface ErrorResult {
  success: false;
  error: string;
}
```

### Example LLM prompts

- "What chains can I bridge to from Hedera using Axelar?"
- "List all Axelar-supported destination chains."
- "Which chains support Interchain Token Service from Hedera?"

### Error behavior

| Error | Cause |
|---|---|
| `"AxelarScan API request failed: <status>"` | The AxelarScan API returned a non-2xx HTTP status. |
| `"Failed to fetch supported chains: <message>"` | Network error, DNS failure, or unexpected response shape. |

---

## 2. axelar_get_message_fee

**Tool class:** `AxelarGetMessageFeeTool`
**Tool name:** `axelar_get_message_fee`
**Type:** Query (no Hedera transaction)

### Description

Estimates the HBAR fee required to pay for GMP message execution on a given destination chain. Internally calls the Axelar GMP API's gas estimation endpoint. Returns the fee broken down into base fee, execution fee, and a multiplied execution fee that includes Axelar's recommended safety buffer.

Always call this tool before `axelar_send_message` so the agent can pass an accurate `gasTinybars` value and avoid under-funded transactions.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `destinationChain` | `string` | Yes | — | Axelar chain name of the destination (e.g., `"ethereum"`, `"base"`). Case-insensitive. |
| `gasLimit` | `number` | No | `200000` | Gas limit for execution on the destination chain. Higher values increase the fee estimate. |
| `network` | `"mainnet" \| "testnet"` | No | Plugin default | Override the Axelar network for this call. |

### Return shape

```typescript
interface GetMessageFeeResult {
  success: true;
  baseFee: string;                    // Tinybars, bigint-safe string
  executionFee: string;               // Tinybars, bigint-safe string
  executionFeeWithMultiplier: string; // Tinybars with safety buffer applied
  gasMultiplier: number;              // Multiplier applied (e.g. 1.1 = 10% buffer)
  isExpressSupported: boolean;        // Whether Axelar Express (fast-path) is available
  destinationChain: string;           // Echo of the requested destination chain
  gasLimit: number;                   // Echo of the gas limit used
}

// On error
interface ErrorResult {
  success: false;
  error: string;
}
```

### Example LLM prompts

- "How much HBAR do I need to send a GMP message to Ethereum?"
- "Estimate the Axelar gas fee to call a contract on Base with gas limit 500000."
- "What's the fee to send a cross-chain message to Polygon from Hedera?"

### Error behavior

| Error | Cause |
|---|---|
| `"destinationChain is required"` | The parameter was omitted or empty. |
| `"Unsupported destination chain: <chain>"` | The chain name is not recognized by the Axelar GMP API. |
| `"Gas estimation API error: <status>"` | The Axelar GMP API returned a non-2xx HTTP status. |
| `"Failed to estimate message fee: <message>"` | Network error or unexpected response shape. |

---

## 3. axelar_send_message

**Tool class:** `AxelarSendMessageTool`
**Tool name:** `axelar_send_message`
**Type:** Transaction (submits two Hedera transactions)

### Description

Sends a GMP (General Message Passing) message from a Hedera account to a contract on a destination chain. This is the primary tool for cross-chain smart contract calls.

Internally, it submits **two sequential Hedera transactions**:

1. **Gas payment** — calls `payNativeGasForContractCall()` on the AxelarGasService contract, attaching `gasTinybars` HBAR as payment. This funds the executor that will relay and execute the message on the destination chain.
2. **Gateway call** — calls `callContract()` on the AxelarGateway contract, encoding the destination chain, destination address, and payload.

The destination contract must implement the `AxelarExecutable` interface. Plain EOAs will not receive the message.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `destinationChain` | `string` | Yes | — | Axelar chain name of the destination (e.g., `"ethereum"`). |
| `destinationContract` | `string` | Yes | — | EVM hex address of the `AxelarExecutable` contract on the destination chain. Must be checksummed or lowercase hex. |
| `payload` | `string` | No | `"0x"` | ABI-encoded hex bytes to deliver to the destination contract. Use `"0x"` for a ping/heartbeat with no data. |
| `gasTinybars` | `string` | Yes | — | HBAR gas payment in tinybars (bigint-safe string). Use `axelar_get_message_fee` to estimate. |
| `network` | `"mainnet" \| "testnet"` | No | Plugin default | Override the Axelar network for this call. |

### Return shape

```typescript
interface SendMessageResult {
  success: true;
  transaction: {
    gasPaymentTxId: string;   // Hedera transaction ID for the gas payment tx
    gatewayTxId: string;      // Hedera transaction ID for the gateway call tx
  };
  extras: {
    destinationChain: string;
    destinationContract: string;
    payloadHash: string;      // keccak256 of the payload, for status lookup
    gasTinybars: string;
  };
}

// On error
interface ErrorResult {
  success: false;
  error: string;
}
```

### Example LLM prompts

- "Send a GMP ping to contract 0xABC...123 on Ethereum, paying 5000000 tinybars for gas."
- "Call the cross-chain receiver at 0xDEF...456 on Base with ABI-encoded payload 0x1234 and 8000000 tinybars gas."
- "Send an empty message to our Polygon contract to trigger a heartbeat."

### Error behavior

| Error | Cause |
|---|---|
| `"destinationChain is required"` | Parameter omitted. |
| `"destinationContract is required"` | Parameter omitted. |
| `"gasTinybars is required"` | Parameter omitted. |
| `"destinationContract must be a valid EVM address"` | Address does not match the hex address pattern. |
| `"payload must be a hex string starting with 0x"` | Payload is not valid hex. |
| `"Gas payment transaction failed: <message>"` | The first Hedera transaction (gas payment) was rejected. Check HBAR balance and fee estimate. |
| `"Gateway call transaction failed: <message>"` | The second Hedera transaction (callContract) was rejected. |
| `"Failed to send GMP message: <message>"` | Unexpected error during transaction construction or submission. |

---

## 4. axelar_send_token

**Tool class:** `AxelarSendTokenTool`
**Tool name:** `axelar_send_token`
**Type:** Transaction (submits one Hedera transaction)

### Description

Bridges an ITS-registered token from Hedera to a destination chain and address. Internally calls `interchainTransfer()` on the Axelar Interchain Token Service (ITS) contract, attaching the specified HBAR amount as payable gas.

**Important constraints:**

- Only tokens registered with Axelar ITS can be bridged via this tool. The `interchainTokenId` is a 32-byte identifier assigned by the ITS contract — it is not the ERC-20/HTS token address.
- Native HBAR cannot be bridged directly. Use WHBAR (`0xb1F616b8134F602c3Bb465fB5b5e6565cCAd37Ed`) instead.
- Classic `axlUSDC` deposit-address bridging does not work on Hedera (Amplifier architecture).
- The destination address must be a recipient that can receive the token on the destination chain.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `interchainTokenId` | `string` | Yes | — | 32-byte hex token ID assigned by Axelar ITS (e.g., `"0xabcd...1234"`). NOT the ERC-20 address. |
| `destinationChain` | `string` | Yes | — | Axelar chain name of the destination (e.g., `"base"`). |
| `destinationAddress` | `string` | Yes | — | EVM hex address of the recipient on the destination chain. |
| `amount` | `string` | Yes | — | Token amount in base units (smallest denomination), as a bigint-safe string. |
| `gasTinybars` | `string` | Yes | — | HBAR gas payment in tinybars (bigint-safe string). |
| `metadata` | `string` | No | `"0x"` | Optional metadata bytes for ITS, hex-encoded. |
| `network` | `"mainnet" \| "testnet"` | No | Plugin default | Override the Axelar network. |

### Return shape

```typescript
interface SendTokenResult {
  success: true;
  transaction: {
    txId: string;             // Hedera transaction ID for the ITS interchainTransfer call
  };
  extras: {
    interchainTokenId: string;
    destinationChain: string;
    destinationAddress: string;
    amount: string;
    gasTinybars: string;
  };
}

// On error
interface ErrorResult {
  success: false;
  error: string;
}
```

### Example LLM prompts

- "Bridge 100 units of ITS token 0xabc...def from Hedera to Base, recipient 0x123...456, with 6000000 tinybars gas."
- "Send 50 interchain tokens (ID: 0x111...222) to my Ethereum address 0x999...aaa."
- "Transfer 1000 base units of the Axelar ITS token to Polygon."

### Error behavior

| Error | Cause |
|---|---|
| `"interchainTokenId is required"` | Parameter omitted. |
| `"destinationChain is required"` | Parameter omitted. |
| `"destinationAddress is required"` | Parameter omitted. |
| `"amount is required"` | Parameter omitted. |
| `"gasTinybars is required"` | Parameter omitted. |
| `"interchainTokenId must be a 32-byte hex string (66 chars including 0x prefix)"` | The token ID is not the correct length. |
| `"destinationAddress must be a valid EVM address"` | Address pattern mismatch. |
| `"interchainTransfer transaction failed: <message>"` | The Hedera transaction was rejected. Check token balance, HTS association, and HBAR balance. |
| `"Failed to send token: <message>"` | Unexpected error during transaction construction. |

---

## 5. axelar_get_message_status

**Tool class:** `AxelarGetMessageStatusTool`
**Tool name:** `axelar_get_message_status`
**Type:** Query (no Hedera transaction)

### Description

Checks the current delivery status of a cross-chain GMP message by looking up the source transaction hash in the Axelar GMP API. Returns the canonical Axelar status string, convenience boolean flags, and a direct link to the AxelarScan explorer page for the message.

Typical status lifecycle: `gas_paid` → `called` → `approved` → `executing` → `executed`. The `error` status indicates a failed execution on the destination chain.

### Parameters

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `txHash` | `string` | Yes | — | The Hedera source transaction hash (or EVM-format hash) from the `axelar_send_message` or `axelar_send_token` call. |
| `network` | `"mainnet" \| "testnet"` | No | Plugin default | Override the Axelar network for this call. |

### Return shape

```typescript
type AxelarMessageStatus =
  | "called"
  | "gas_paid"
  | "approved"
  | "executing"
  | "executed"
  | "error"
  | "unknown";

interface GetMessageStatusResult {
  success: true;
  txHash: string;
  status: AxelarMessageStatus;
  isExecuted: boolean;        // true when status === "executed"
  isError: boolean;           // true when status === "error"
  sourceChain: string;        // e.g. "hedera"
  destinationChain: string;   // e.g. "ethereum"
  axelarScanUrl: string;      // Direct link to AxelarScan for this message
  errorMessage?: string;      // Present when isError === true
}

// On error
interface ErrorResult {
  success: false;
  error: string;
}
```

### Example LLM prompts

- "What's the status of my cross-chain message with tx hash 0xabc...123?"
- "Check if the Axelar GMP message from transaction 0xdef...456 has been delivered."
- "Has the token bridge transfer 0x789...abc been executed on the destination chain yet?"

### Error behavior

| Error | Cause |
|---|---|
| `"txHash is required"` | Parameter omitted. |
| `"txHash must be a hex string"` | The hash does not start with `0x` or contains non-hex characters. |
| `"Message not found for txHash: <hash>"` | The GMP API has no record of this transaction hash. The hash may be wrong, or the transaction may not yet be indexed (allow ~30 seconds after submission). |
| `"GMP status API error: <status>"` | The Axelar GMP API returned a non-2xx HTTP status. |
| `"Failed to get message status: <message>"` | Network error or unexpected response shape. |
