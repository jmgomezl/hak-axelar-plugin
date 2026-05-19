# hak-axelar-plugin

**Axelar Network cross-chain plugin for Hedera Agent Kit (HAK)**

Lets AI agents bridge tokens and send general-message-passing (GMP) messages from Hedera to 60+ chains using the Axelar Network protocol. Built as a first-class HAK plugin — drop it in, register it, and your agent gains five new cross-chain tools with no additional setup required.

---

## Strategic positioning: Axelar vs LayerZero

This plugin complements [`hak-layerzero-plugin`](https://github.com/hedera-agent-kit/hak-layerzero-plugin) and addresses different use cases:

| Concern | hak-axelar-plugin | hak-layerzero-plugin |
|---|---|---|
| Security model | Proof-of-Stake validator set | Decentralized Verifier Network (DVN) |
| Token standard | Interchain Token Service (ITS) | Omnichain Fungible Token (OFT) |
| Confirmed Hedera routes | Ethereum, Base, Arbitrum, Avalanche, Optimism, Polygon, BSC, XRPL, Monad, Berachain, Flow EVM, Scroll | Ethereum, Base, Arbitrum, Avalanche, Optimism, Polygon, BSC |
| XRPL support | Yes (confirmed live GMP txs) | No |
| Bridge architecture | Axelar Amplifier | LayerZero V2 |

Choose Axelar when you need XRPL, Berachain, Flow EVM, or Monad destinations, or when your token is already registered with Axelar ITS.

---

## Installation

```bash
npm install hak-axelar-plugin
```

### Peer dependencies

```bash
npm install @hashgraph/hedera-agent-kit @hiero-ledger/sdk
```

---

## Quick start

```typescript
import { HederaAgentKit } from "@hashgraph/hedera-agent-kit";
import { axelarPlugin } from "hak-axelar-plugin";

// Register the plugin with HAK
const kit = new HederaAgentKit({
  accountId: process.env.HEDERA_ACCOUNT_ID!,
  privateKey: process.env.HEDERA_PRIVATE_KEY!,
  network: "mainnet",
});

kit.registerPlugin(axelarPlugin);

// The agent now has access to all 5 Axelar tools.
// Example: ask the agent to list supported chains
const result = await kit.runTool("axelar_get_supported_chains", {});
console.log(result);

// Example: estimate the fee to send a GMP message to Ethereum
const fee = await kit.runTool("axelar_get_message_fee", {
  destinationChain: "ethereum",
  gasLimit: 200000,
});
console.log(fee);
// { baseFee: "5000000", executionFee: "...", executionFeeWithMultiplier: "...", gasMultiplier: 1.1, isExpressSupported: false }
```

---

## Tools

| Tool name | Description | Type |
|---|---|---|
| `axelar_get_supported_chains` | Lists all chains reachable from Hedera via Axelar. Calls the AxelarScan API — no transaction required. | Query |
| `axelar_get_message_fee` | Estimates the HBAR fee (in tinybars) needed to pay for GMP message execution on a destination chain. | Query |
| `axelar_send_message` | Sends a GMP message from Hedera to a destination chain contract. Submits two Hedera transactions: gas payment + gateway call. | Transaction |
| `axelar_send_token` | Bridges an ITS-registered token from Hedera to any supported destination chain. Single Hedera transaction. | Transaction |
| `axelar_get_message_status` | Checks the delivery status of a cross-chain message by source transaction hash. | Query |

See [`docs/TOOLS.md`](docs/TOOLS.md) for full per-tool parameter reference and examples.

---

## Supported chains (confirmed mainnet routes from Hedera)

| Chain | Status | Notes |
|---|---|---|
| Ethereum | Confirmed | High liquidity, many ITS tokens |
| Base | Confirmed | Low fees |
| Arbitrum | Confirmed | |
| Avalanche | Confirmed | |
| Optimism | Confirmed | |
| Polygon | Confirmed | |
| BSC | Confirmed | Binance Smart Chain |
| XRPL EVM | Confirmed | Unique to Axelar vs LayerZero |
| Monad | Confirmed | |
| Berachain | Confirmed | |
| Flow EVM | Confirmed | |
| Scroll | Confirmed | |
| Solana | Partial | Technically supported by Axelar; 0 confirmed GMP txs from Hedera as of research |
| 50+ others | Via Axelar | Query `axelar_get_supported_chains` for the live list |

Use `axelar_get_supported_chains` at runtime for the authoritative list — the Axelar network continues to add new chains.

---

## Network defaults

### Contract addresses

| Contract | Mainnet (chainId 295) | Testnet (chainId 296) |
|---|---|---|
| AxelarGateway | `0xe432150cce91c13a887f7D836923d5597adD8E31` | `0xe432150cce91c13a887f7D836923d5597adD8E31` |
| AxelarGasService | `0x2d5d7d31F671F86C782533cc367F14109a082712` | `0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6` |
| ITS (Interchain Token Service) | `0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C` | `0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C` |
| WHBAR | `0xb1F616b8134F602c3Bb465fB5b5e6565cCAd37Ed` | — |

### API endpoints

| Network | GMP API |
|---|---|
| Mainnet | `https://api.gmp.axelarscan.io` |
| Testnet | `https://testnet.api.gmp.axelarscan.io` |

No API keys required.

---

## Important notes

### Amplifier architecture

Hedera is connected to Axelar via the **Axelar Amplifier** architecture, not the classic gateway. This means:

- Classic `axlUSDC` deposit-address bridging **does not work** on Hedera.
- Only tokens registered with the **Interchain Token Service (ITS)** can be bridged via `axelar_send_token`.
- To bridge HBAR, use **WHBAR** (`0xb1F616b8134F602c3Bb465fB5b5e6565cCAd37Ed`) — native HBAR cannot be bridged directly.

### ITS token requirement

`axelar_send_token` requires an `interchainTokenId` (a 32-byte hex identifier assigned by the ITS contract). This is **not** the same as the ERC-20 token address. Look up the token ID via the [Axelar ITS Portal](https://interchain.axelar.dev) or by calling the ITS contract's `interchainTokenId()` view function.

### AxelarExecutable requirement

Destination contracts that receive GMP messages via `axelar_send_message` must implement the `AxelarExecutable` interface from `@axelar-network/axelar-gmp-sdk-solidity`. Plain EOAs and contracts that do not implement this interface will not receive messages correctly.

### HBAR decimal duality

Hedera has two decimal representations for HBAR:

- **Tinybars (8 decimals)** — native Hedera SDK denomination, used throughout this plugin's API.
- **Weibars (18 decimals)** — used in EVM / `msg.value` contexts.

All HBAR amounts in this plugin (gas fees, `gasTinybars` parameter) are expressed in **tinybars**. 1 HBAR = 100,000,000 tinybars.

### HTS token association

Before a Hedera account can receive bridged tokens, the account must be **associated** with the HTS token. This is a Hedera-specific requirement not present on EVM chains. Use `hak-hts` or the Hedera SDK to associate before initiating a bridge that returns tokens to Hedera.

---

## Links

- [Axelar Documentation](https://docs.axelar.dev)
- [AxelarScan Explorer](https://axelarscan.io)
- [Axelar Amplifier Overview](https://docs.axelar.dev/dev/amplifier/introduction)
- [Interchain Token Service](https://interchain.axelar.dev)
- [Hedera Agent Kit](https://github.com/hedera-agent-kit/hedera-agent-kit)
- [hak-layerzero-plugin](https://github.com/hedera-agent-kit/hak-layerzero-plugin)
- [Axelar GMP SDK (Solidity)](https://github.com/axelar-network/axelar-gmp-sdk-solidity)
