import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupportedChainsTool } from "../src/tools/get-supported-chains.js";

const mockContext = {} as never;
const mockClient = {} as never;

describe("GetSupportedChainsTool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns chain list on successful API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: "ethereum", name: "Ethereum", chain_type: "evm", chain_id: 1 },
          { id: "base", name: "Base", chain_type: "evm", chain_id: 8453 },
          { id: "xrpl", name: "XRPL", chain_type: "non-evm" },
        ],
      }),
    } as Response);

    const result = await getSupportedChainsTool.coreAction(
      { network: "mainnet" },
      mockContext,
      mockClient,
    );

    expect(result).toMatchObject({
      success: true,
      sourceChain: "hedera",
      count: 3,
    });

    const r = result as { chains: { id: string }[] };
    expect(r.chains).toHaveLength(3);
    expect(r.chains.map((c) => c.id)).toContain("ethereum");
    expect(r.chains.map((c) => c.id)).toContain("xrpl");
  });

  it("filters out hedera itself from the list", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: "hedera", name: "Hedera", chain_type: "evm" },
          { id: "ethereum", name: "Ethereum", chain_type: "evm" },
        ],
      }),
    } as Response);

    const result = await getSupportedChainsTool.coreAction({}, mockContext, mockClient);
    const r = result as { chains: { id: string }[] };
    expect(r.chains.map((c) => c.id)).not.toContain("hedera");
    expect(r.chains).toHaveLength(1);
  });

  it("returns error on HTTP failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response);

    const result = await getSupportedChainsTool.coreAction({}, mockContext, mockClient);
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/503/);
  });

  it("returns error on network exception", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await getSupportedChainsTool.coreAction({}, mockContext, mockClient);
    expect(result).toMatchObject({ success: false, error: "ECONNREFUSED" });
  });

  it("shouldSecondaryAction returns false for query result", async () => {
    const queryResult = { success: true, chains: [], count: 0 };
    expect(await getSupportedChainsTool.shouldSecondaryAction(queryResult, mockContext)).toBe(
      false,
    );
  });

  it("shouldSecondaryAction returns false for error result", async () => {
    const errorResult = { success: false, error: "oops" };
    expect(await getSupportedChainsTool.shouldSecondaryAction(errorResult, mockContext)).toBe(
      false,
    );
  });
});
