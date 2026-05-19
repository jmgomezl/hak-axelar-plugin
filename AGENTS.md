# AGENTS.md — hak-axelar-plugin

Contributor and AI-agent guide for the `hak-axelar-plugin` codebase. Read this before writing code or submitting PRs.

---

## Project structure

```
hak-axelar-plugin/
├── src/
│   ├── index.ts                    # Public package entry point — re-exports plugin + tools
│   ├── plugin.ts                   # Plugin registration object (axelarPlugin)
│   ├── config.ts                   # Network defaults, config resolution, env var reading
│   ├── tools/
│   │   ├── get-supported-chains.ts # AxelarGetSupportedChainsTool
│   │   ├── get-message-fee.ts      # AxelarGetMessageFeeTool
│   │   ├── send-message.ts         # AxelarSendMessageTool
│   │   ├── send-token.ts           # AxelarSendTokenTool
│   │   └── get-message-status.ts   # AxelarGetMessageStatusTool
│   └── utils/
│       ├── to-uint256.ts           # toUint256() helper for Long → bytes32
│       ├── hex.ts                  # isHexAddress(), isHexBytes(), normalizeHex()
│       └── api.ts                  # fetchAxelarScan(), fetchGmpApi() wrappers
├── tests/
│   ├── get-supported-chains.test.ts
│   ├── get-message-fee.test.ts
│   ├── send-message.test.ts
│   ├── send-token.test.ts
│   ├── get-message-status.test.ts
│   └── utils/
│       └── to-uint256.test.ts
├── docs/
│   ├── TOOLS.md                    # Per-tool parameter reference
│   ├── CONFIGURATION.md            # Env vars, precedence, examples
│   └── EXAMPLES.md                 # Concrete TypeScript usage examples
├── AGENTS.md                       # This file
├── README.md                       # Package overview and quick start
├── LICENSE                         # MIT
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── biome.json
```

---

## Build, test, and lint commands

| Task | Command |
|---|---|
| Build (ESM output) | `npm run build` → `tsup` |
| Type-check (no emit) | `npm run typecheck` → `tsc --noEmit` |
| Run tests | `npm test` → `vitest run` |
| Run tests in watch mode | `npm run test:watch` → `vitest` |
| Lint + format check | `npm run lint` → `biome check .` |
| Auto-fix lint issues | `npm run lint:fix` → `biome check --write .` |
| Format only | `npm run format` → `biome format --write .` |

Run `npm run typecheck && npm run lint && npm test` before every commit.

---

## Coding conventions

### Module system

- **ESM only.** The package is `"type": "module"`. Never write `require()` or `module.exports`.
- All imports use explicit `.js` extensions (required by Node ESM even when the source is `.ts`):
  ```typescript
  import { toUint256 } from "../utils/to-uint256.js";
  ```

### TypeScript

- Strict mode is enabled (`"strict": true` in `tsconfig.json`). No `any` unless absolutely unavoidable — prefer `unknown` + type narrowing.
- Prefer explicit return types on all exported functions and class methods.
- Use `Long` from `@hiero-ledger/sdk` for all HBAR and token amounts that may exceed `Number.MAX_SAFE_INTEGER`. Use the `toUint256()` helper when encoding amounts for EVM contract calls.

### Dependencies

| Dependency | Package |
|---|---|
| Hedera SDK | `@hiero-ledger/sdk` (NOT `@hashgraph/sdk`) |
| HAK | `@hashgraph/hedera-agent-kit` |
| Axelar GMP SDK | `@axelar-network/axelar-gmp-sdk-solidity` (types only, if needed) |

Never import `@hashgraph/sdk` directly.

### Tool class structure

Every tool follows this pattern:

```typescript
import { BaseTool } from "@hashgraph/hedera-agent-kit";

export class AxelarMyTool extends BaseTool {
  name = "axelar_my_tool" as const;
  description = "...";

  schema = {
    type: "object" as const,
    properties: {
      // zod or JSON Schema properties
    },
    required: ["requiredParam"],
  };

  async coreAction(params: MyParams, ctx: HakContext): Promise<MyResult> {
    // Validate params
    // Never throw — return { success: false, error: "message" } instead
    try {
      // ... do work ...
      return { success: true, /* result */ };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// Export singleton
export const axelarMyTool = new AxelarMyTool();
```

### Return shapes

- **Query tools** (no transaction): return data directly in the result object alongside `success: true`.
- **Transaction tools**: return `{ success: true, transaction: { txId, ... }, extras: { ... } }`.
- **Errors**: always return `{ success: false, error: "human-readable message" }`. Never throw from `coreAction`. Never return `undefined`.

### Error messages

- Start with the field name when a parameter is invalid: `"destinationChain is required"`, not `"Missing required parameter"`.
- Include actionable context: `"interchainTokenId must be a 32-byte hex string (66 chars including 0x prefix)"`.
- Prefix API errors with the service name: `"AxelarScan API request failed: 503"`.

### Formatting

- Biome, 2-space indentation, 100-character line limit.
- No semicolons are not enforced — follow Biome's defaults as configured in `biome.json`.
- Run `npm run lint:fix` to auto-fix all auto-fixable issues before committing.

### Tests

- Use `vitest`. Test files live in `tests/` mirroring the `src/` structure.
- Mock all external HTTP calls (AxelarScan API, GMP API) using `vi.mock` or `msw`.
- Mock Hedera SDK transaction submissions — never hit a real node in unit tests.
- Each tool must have tests covering: happy path, missing required params, API error response, and unexpected error shape.

---

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

### Format

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Allowed types

| Type | When to use |
|---|---|
| `feat` | New tool, new capability, new config option |
| `fix` | Bug fix in existing behavior |
| `docs` | Documentation only changes (README, TOOLS.md, examples) |
| `chore` | Dependency updates, build config, tooling, CI |
| `test` | Adding or fixing tests with no production code change |
| `refactor` | Code restructuring with no behavior change |
| `perf` | Performance improvement |

### Examples

```
feat(send-message): add support for express fee estimation
fix(get-message-fee): handle 404 from GMP API for unknown chains
docs(examples): add end-to-end polling example
chore(deps): bump @hiero-ledger/sdk to 2.x
test(send-token): add test for invalid interchainTokenId length
```

---

## PR conventions

- PRs should be focused: one feature or bug fix per PR.
- Title must follow Conventional Commits format (same as commit messages).
- PR description must include:
  - **What**: one-sentence summary of the change.
  - **Why**: motivation or issue reference.
  - **How**: brief explanation of the implementation approach.
  - **Testing**: what was tested and how.
- All CI checks (build, typecheck, lint, tests) must pass before merging.
- Squash merges are preferred to keep the main branch history clean.

---

## Known gotchas

### 1. HBAR decimal duality

Hedera exposes HBAR in two denominations:

- **Tinybars (8 decimals)** — the native Hedera SDK unit. 1 HBAR = 100,000,000 tinybars. Used throughout this plugin's API (`gasTinybars` parameter, fee results).
- **Weibars (18 decimals)** — used in EVM `msg.value` contexts and when interacting with smart contracts via the JSON-RPC mirror node.

When encoding HBAR as `msg.value` in a contract call (e.g., attaching gas to `payNativeGasForContractCall`), convert tinybars to weibars by multiplying by `10^10`. Failing to do so will result in drastically under-funded gas payments that appear to succeed but result in `error` status on AxelarScan.

```typescript
// Wrong: passing tinybars as msg.value
const msgValue = BigInt(gasTinybars); // 13200000 tinybars

// Correct: convert to weibars for EVM context
const msgValue = BigInt(gasTinybars) * 10n ** 10n;
```

### 2. ITS token ID vs ERC-20 address

`axelar_send_token` requires an `interchainTokenId` — a 32-byte (`bytes32`) identifier assigned by the Axelar Interchain Token Service. This is **not** the same as the ERC-20 token contract address or the HTS token ID on Hedera.

To find the `interchainTokenId` for a token:
- Look it up on [https://interchain.axelar.dev](https://interchain.axelar.dev).
- Call `interchainTokenId(address tokenAddress)` on the ITS contract.
- Check the token deployment event logs on AxelarScan.

Passing an ERC-20 address where a token ID is expected will result in a revert with no clear error message.

### 3. AxelarExecutable requirement

Contracts that receive GMP messages via `axelar_send_message` must implement the `AxelarExecutable` interface:

```solidity
// From @axelar-network/axelar-gmp-sdk-solidity
abstract contract AxelarExecutable {
    function execute(
        bytes32 commandId,
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload
    ) external;
}
```

Sending a message to a contract that does not implement this interface will cause the relayer to fail to execute, resulting in an `error` status. The gas paid is consumed. There is no refund mechanism for mis-addressed GMP messages.

### 4. Amplifier architecture — no classic bridging

Hedera is connected to Axelar via the **Amplifier** gateway architecture, which is distinct from the classic Axelar gateway used by most other EVM chains.

Consequences:
- Classic `axlUSDC` deposit-address bridging (send USDC to an Axelar deposit address and get axlUSDC on the destination) **does not work** from Hedera.
- Only ITS tokens can be bridged. USDC can only be bridged if USDC has been deployed as an ITS token on Hedera specifically.
- The gateway contract address (`0xe432150cce91c13a887f7D836923d5597adD8E31`) is the same for both mainnet and testnet on Hedera — this is expected and intentional.
- Do not assume that functionality described in general Axelar documentation applies to Hedera. Always test against Hedera testnet first.

### 5. HTS token association

Hedera accounts must explicitly associate with an HTS token before they can receive it. If a bridge brings tokens back to a Hedera account that has not associated with the HTS token, the transaction will fail on the Hedera side, and the tokens may be stuck in the gateway.

Always ensure the recipient Hedera account has associated with the target HTS token before initiating a bridge that returns tokens to Hedera.

### 6. Indexing delay in status checks

After a Hedera transaction is confirmed, there is typically a 20–60 second delay before the Axelar GMP API indexes it. Calling `axelar_get_message_status` immediately after `axelar_send_message` will return `"Message not found"`. In polling loops, always wait at least 30 seconds before the first status check.
