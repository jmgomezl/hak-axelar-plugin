# Configuration Reference — hak-axelar-plugin

## Overview

`hak-axelar-plugin` ships with built-in mainnet and testnet defaults for all Axelar contract addresses and API endpoints. In most cases you do not need to configure anything — just register the plugin and the defaults derived from the HAK network setting are used.

Configuration is needed when:

- You want to target testnet vs mainnet explicitly.
- You are running against a local Axelar deployment or a forked network.
- You need to override individual contract addresses without changing the network-wide defaults.

---

## Environment variables

| Variable | Description | Example |
|---|---|---|
| `AXELAR_NETWORK` | Force the plugin to use `"mainnet"` or `"testnet"` regardless of the HAK network setting. | `mainnet` |
| `AXELAR_GATEWAY_ADDRESS` | Override the AxelarGateway contract address. | `0xe432150cce91c13a887f7D836923d5597adD8E31` |
| `AXELAR_GAS_SERVICE_ADDRESS` | Override the AxelarGasService contract address. | `0x2d5d7d31F671F86C782533cc367F14109a082712` |
| `AXELAR_ITS_ADDRESS` | Override the Interchain Token Service contract address. | `0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C` |

All variables are optional. Unset variables fall back to the network default.

---

## Configuration precedence

When resolving an address or network setting, the plugin applies the following precedence (highest to lowest):

```
ctxConfig (per-call context config)
  > environment variable
    > network default (derived from HAK network setting)
```

This means:

1. A value passed in the HAK context's `pluginConfig` always wins.
2. An environment variable overrides the built-in default but not a context-level override.
3. If neither is set, the built-in mainnet or testnet default is used based on the HAK network setting.

---

## Passing config via HAK context

The plugin reads its configuration from the HAK context object under two possible keys (checked in order):

- `pluginConfig.axelar`
- `pluginConfig["hak-axelar-plugin"]`

Both are equivalent; use whichever fits your project's naming conventions.

### Context config shape

```typescript
interface AxelarPluginConfig {
  network?: "mainnet" | "testnet";
  gatewayAddress?: string;        // Override AxelarGateway
  gasServiceAddress?: string;     // Override AxelarGasService
  itsAddress?: string;            // Override ITS
}
```

---

## Code examples

### Approach 1: Environment variables (recommended for CI/CD)

Set environment variables in your shell or `.env` file:

```bash
# .env
AXELAR_NETWORK=testnet
AXELAR_GAS_SERVICE_ADDRESS=0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6
```

Then load them before starting the agent:

```typescript
import "dotenv/config";
import { HederaAgentKit } from "@hashgraph/hedera-agent-kit";
import { axelarPlugin } from "hak-axelar-plugin";

const kit = new HederaAgentKit({
  accountId: process.env.HEDERA_ACCOUNT_ID!,
  privateKey: process.env.HEDERA_PRIVATE_KEY!,
  network: "testnet",
});

kit.registerPlugin(axelarPlugin);

// Plugin automatically reads AXELAR_NETWORK and AXELAR_GAS_SERVICE_ADDRESS
// from environment. No additional code required.
```

### Approach 2: Context config (recommended for multi-tenant apps)

Pass config inline when building the HAK context. This is useful when you serve multiple users with different network settings from a single process.

```typescript
import { HederaAgentKit } from "@hashgraph/hedera-agent-kit";
import { axelarPlugin } from "hak-axelar-plugin";

const kit = new HederaAgentKit({
  accountId: process.env.HEDERA_ACCOUNT_ID!,
  privateKey: process.env.HEDERA_PRIVATE_KEY!,
  network: "mainnet",
  pluginConfig: {
    // Either key works — use the one that fits your codebase style
    axelar: {
      network: "mainnet",
      gatewayAddress: "0xe432150cce91c13a887f7D836923d5597adD8E31",
      gasServiceAddress: "0x2d5d7d31F671F86C782533cc367F14109a082712",
      itsAddress: "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C",
    },
  },
});

kit.registerPlugin(axelarPlugin);
```

Using the namespaced key:

```typescript
const kit = new HederaAgentKit({
  accountId: process.env.HEDERA_ACCOUNT_ID!,
  privateKey: process.env.HEDERA_PRIVATE_KEY!,
  network: "mainnet",
  pluginConfig: {
    "hak-axelar-plugin": {
      network: "mainnet",
    },
  },
});
```

### Approach 3: Mixed (env vars + selective context override)

You can use environment variables as the baseline and override only specific values in the context:

```bash
# .env — baseline network
AXELAR_NETWORK=mainnet
```

```typescript
const kit = new HederaAgentKit({
  accountId: process.env.HEDERA_ACCOUNT_ID!,
  privateKey: process.env.HEDERA_PRIVATE_KEY!,
  network: "mainnet",
  pluginConfig: {
    axelar: {
      // Only override the gateway; other addresses come from env or defaults
      gatewayAddress: "0xYourCustomGateway",
    },
  },
});
```

---

## Built-in network defaults

These values are embedded in the plugin and used when no override is present.

### Mainnet (Hedera chainId 295, axelarChainName "hedera")

| Setting | Value |
|---|---|
| Gateway | `0xe432150cce91c13a887f7D836923d5597adD8E31` |
| GasService | `0x2d5d7d31F671F86C782533cc367F14109a082712` |
| ITS | `0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C` |
| WHBAR | `0xb1F616b8134F602c3Bb465fB5b5e6565cCAd37Ed` |
| GMP API | `https://api.gmp.axelarscan.io` |
| AxelarScan | `https://axelarscan.io` |

### Testnet (Hedera chainId 296, axelarChainName "hedera")

| Setting | Value |
|---|---|
| Gateway | `0xe432150cce91c13a887f7D836923d5597adD8E31` |
| GasService | `0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6` |
| ITS | `0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C` |
| GMP API | `https://testnet.api.gmp.axelarscan.io` |
| AxelarScan | `https://testnet.axelarscan.io` |

---

## Links

- [Axelar contract deployment registry](https://github.com/axelar-network/axelar-contract-deployments)
- [Axelar developer documentation](https://docs.axelar.dev)
- [Axelar Amplifier architecture](https://docs.axelar.dev/dev/amplifier/introduction)
- [Interchain Token Service documentation](https://docs.axelar.dev/dev/send-tokens/interchain-tokens/intro)
