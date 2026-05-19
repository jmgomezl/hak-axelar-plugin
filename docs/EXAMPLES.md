# Examples — hak-axelar-plugin

Concrete TypeScript examples using the HAK agent pattern. All examples assume the plugin has been registered with a `HederaAgentKit` instance named `kit`.

---

## Setup (used by all examples)

```typescript
import "dotenv/config";
import { HederaAgentKit } from "@hashgraph/hedera-agent-kit";
import { axelarPlugin } from "hak-axelar-plugin";

const kit = new HederaAgentKit({
  accountId: process.env.HEDERA_ACCOUNT_ID!,   // e.g. "0.0.12345"
  privateKey: process.env.HEDERA_PRIVATE_KEY!,  // DER or PEM encoded
  network: "mainnet",
});

kit.registerPlugin(axelarPlugin);
```

---

## Example 1: Fee estimation before sending

Always estimate the gas fee before sending a message so the agent can provide an accurate `gasTinybars` value.

```typescript
async function estimateFee() {
  const result = await kit.runTool("axelar_get_message_fee", {
    destinationChain: "ethereum",
    gasLimit: 300000, // Custom gas limit for a more complex contract call
  });

  if (!result.success) {
    console.error("Fee estimation failed:", result.error);
    return;
  }

  console.log("Fee breakdown (all values in tinybars):");
  console.log("  Base fee:                    ", result.baseFee);
  console.log("  Execution fee:               ", result.executionFee);
  console.log("  Execution fee with multiplier:", result.executionFeeWithMultiplier);
  console.log("  Gas multiplier:              ", result.gasMultiplier);
  console.log("  Express supported:           ", result.isExpressSupported);

  // Use executionFeeWithMultiplier for safety; it includes Axelar's buffer
  return result.executionFeeWithMultiplier;
}

const recommendedGas = await estimateFee();
// Output example:
// Fee breakdown (all values in tinybars):
//   Base fee:                     5000000
//   Execution fee:                12000000
//   Execution fee with multiplier: 13200000
//   Gas multiplier:               1.1
//   Express supported:            false
```

---

## Example 2: Sending a GMP ping message (empty payload) to an Ethereum contract

A "ping" sends an empty payload to trigger the `execute()` function on an `AxelarExecutable` contract. Useful for heartbeats, cross-chain triggers, and testing connectivity.

The destination contract must implement `AxelarExecutable` from `@axelar-network/axelar-gmp-sdk-solidity`.

```typescript
async function sendPing() {
  // Step 1: estimate the fee
  const feeResult = await kit.runTool("axelar_get_message_fee", {
    destinationChain: "ethereum",
    gasLimit: 200000,
  });

  if (!feeResult.success) {
    throw new Error(`Fee estimation failed: ${feeResult.error}`);
  }

  const gasTinybars = feeResult.executionFeeWithMultiplier;

  // Step 2: send the ping
  const sendResult = await kit.runTool("axelar_send_message", {
    destinationChain: "ethereum",
    destinationContract: "0xYourAxelarExecutableContractOnEthereum",
    payload: "0x",           // Empty payload — pure ping
    gasTinybars,
  });

  if (!sendResult.success) {
    console.error("Send failed:", sendResult.error);
    return;
  }

  console.log("Ping sent successfully!");
  console.log("Gas payment tx:  ", sendResult.transaction.gasPaymentTxId);
  console.log("Gateway call tx: ", sendResult.transaction.gatewayTxId);
  console.log("Payload hash:    ", sendResult.extras.payloadHash);
}

await sendPing();
```

---

## Example 3: Bridging an ITS token from Hedera to Base

This example bridges a token registered with Axelar Interchain Token Service to a recipient on Base.

The `interchainTokenId` is a 32-byte identifier visible in the [Axelar ITS Portal](https://interchain.axelar.dev) or returned by calling `interchainTokenId()` on the ITS contract. It is **not** the ERC-20 token address.

```typescript
async function bridgeTokenToBase() {
  // The ITS token ID — look this up on https://interchain.axelar.dev
  // for your specific token. This is NOT the ERC-20 address.
  const INTERCHAIN_TOKEN_ID =
    "0xa411c60f4d5e2d0de5e4e2e5a7b6c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3";

  // Recipient on Base
  const RECIPIENT_ON_BASE = "0xYourRecipientAddressOnBase";

  // Amount: 10 tokens with 6 decimals = 10_000_000 base units
  const AMOUNT = "10000000";

  // Step 1: estimate gas
  const feeResult = await kit.runTool("axelar_get_message_fee", {
    destinationChain: "base",
    gasLimit: 200000,
  });

  if (!feeResult.success) {
    throw new Error(`Fee estimation failed: ${feeResult.error}`);
  }

  // Step 2: bridge the token
  const bridgeResult = await kit.runTool("axelar_send_token", {
    interchainTokenId: INTERCHAIN_TOKEN_ID,
    destinationChain: "base",
    destinationAddress: RECIPIENT_ON_BASE,
    amount: AMOUNT,
    gasTinybars: feeResult.executionFeeWithMultiplier,
    // metadata: "0x" is the default — omit unless the token requires it
  });

  if (!bridgeResult.success) {
    console.error("Bridge failed:", bridgeResult.error);
    return;
  }

  console.log("Token bridge initiated!");
  console.log("Hedera tx ID:", bridgeResult.transaction.txId);
  console.log(
    "Track on AxelarScan: https://axelarscan.io/gmp/",
    bridgeResult.transaction.txId
  );
}

await bridgeTokenToBase();
```

---

## Example 4: Checking message delivery status

After sending a message or token bridge, poll the Axelar GMP API to check delivery progress.

```typescript
async function checkStatus(txHash: string) {
  const result = await kit.runTool("axelar_get_message_status", {
    txHash,
  });

  if (!result.success) {
    console.error("Status check failed:", result.error);
    return;
  }

  console.log(`Status for ${result.txHash}:`);
  console.log("  Status:           ", result.status);
  console.log("  Source chain:     ", result.sourceChain);
  console.log("  Destination chain:", result.destinationChain);
  console.log("  Is executed:      ", result.isExecuted);
  console.log("  Is error:         ", result.isError);
  console.log("  AxelarScan URL:   ", result.axelarScanUrl);

  if (result.isError && result.errorMessage) {
    console.log("  Error message:    ", result.errorMessage);
  }

  return result.status;
}

// Example output for a successfully executed message:
// Status for 0xabc...123:
//   Status:            executed
//   Source chain:      hedera
//   Destination chain: ethereum
//   Is executed:       true
//   Is error:          false
//   AxelarScan URL:    https://axelarscan.io/gmp/0xabc...123
```

---

## Example 5: Full end-to-end — estimate, send, then poll status

This example combines all the pieces: estimate the fee, send the message, then poll until the message is executed or an error occurs.

```typescript
import { setTimeout } from "timers/promises";

async function sendAndAwaitExecution(
  destinationChain: string,
  destinationContract: string,
  payload: string,
  gasLimit = 200000,
  pollIntervalMs = 15_000,
  maxAttempts = 40
) {
  // --- Step 1: Estimate fee ---
  console.log(`Estimating fee for ${destinationChain}...`);
  const feeResult = await kit.runTool("axelar_get_message_fee", {
    destinationChain,
    gasLimit,
  });

  if (!feeResult.success) {
    throw new Error(`Fee estimation failed: ${feeResult.error}`);
  }

  const gasTinybars = feeResult.executionFeeWithMultiplier;
  console.log(`Gas estimate: ${gasTinybars} tinybars`);

  // --- Step 2: Send the GMP message ---
  console.log("Sending GMP message...");
  const sendResult = await kit.runTool("axelar_send_message", {
    destinationChain,
    destinationContract,
    payload,
    gasTinybars,
  });

  if (!sendResult.success) {
    throw new Error(`Send failed: ${sendResult.error}`);
  }

  const gatewayTxId = sendResult.transaction.gatewayTxId;
  console.log(`Message sent. Gateway tx: ${gatewayTxId}`);
  console.log(`AxelarScan: https://axelarscan.io/gmp/${gatewayTxId}`);

  // --- Step 3: Poll until executed or error ---
  console.log("Polling for execution...");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Allow a short window for indexing on the first attempt
    if (attempt === 1) {
      await setTimeout(30_000);
    } else {
      await setTimeout(pollIntervalMs);
    }

    const statusResult = await kit.runTool("axelar_get_message_status", {
      txHash: gatewayTxId,
    });

    if (!statusResult.success) {
      console.warn(`Attempt ${attempt}: status check failed — ${statusResult.error}`);
      continue;
    }

    const { status, isExecuted, isError } = statusResult;
    console.log(`Attempt ${attempt}/${maxAttempts}: status = ${status}`);

    if (isExecuted) {
      console.log("Message successfully executed on destination chain.");
      return { success: true, status, txId: gatewayTxId };
    }

    if (isError) {
      console.error(
        "Execution failed on destination chain:",
        statusResult.errorMessage ?? "(no details)"
      );
      return { success: false, status, txId: gatewayTxId };
    }
  }

  console.warn("Max poll attempts reached. Message may still be in transit.");
  return { success: false, status: "timeout", txId: gatewayTxId };
}

// Usage
const result = await sendAndAwaitExecution(
  "ethereum",
  "0xYourAxelarExecutableContract",
  "0x",     // Empty ping payload
  200000
);

console.log("Final result:", result);
// Example output:
// Estimating fee for ethereum...
// Gas estimate: 13200000 tinybars
// Sending GMP message...
// Message sent. Gateway tx: 0.0.12345@1716000000.000000000
// AxelarScan: https://axelarscan.io/gmp/0.0.12345@1716000000.000000000
// Polling for execution...
// Attempt 1/40: status = gas_paid
// Attempt 2/40: status = called
// Attempt 3/40: status = approved
// Attempt 4/40: status = executed
// Message successfully executed on destination chain.
// Final result: { success: true, status: 'executed', txId: '0.0.12345@...' }
```

---

## Notes on gas estimation timing

- GMP message status may take 30–60 seconds to appear in the Axelar GMP API after the Hedera transaction is confirmed.
- Cross-chain execution typically completes within 3–10 minutes, depending on destination chain finality and executor capacity.
- For time-sensitive applications, check `isExpressSupported` in the fee result — Express provides significantly faster execution on supported routes.
