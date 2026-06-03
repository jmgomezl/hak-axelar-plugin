import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMessageStatusTool } from "../src/tools/get-message-status.js";

const mockContext = {} as never;
const mockClient = {} as never;
const FAKE_TX_HASH = "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1";

describe("GetMessageStatusTool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns executed status for a completed message", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            status: "executed",
            sourceChain: "hedera",
            destinationChain: "ethereum",
            call: { destinationContractAddress: "0xDEAD000000000000000000000000000000000001" },
            executed: { transactionHash: "0xexec999" },
            gasPaid: true,
          },
        ],
      }),
    } as Response);

    const result = await getMessageStatusTool.coreAction(
      { txHash: FAKE_TX_HASH, network: "mainnet" },
      mockContext,
      mockClient,
    );

    expect(result).toMatchObject({
      success: true,
      status: "executed",
      isExecuted: true,
      isError: false,
      destinationChain: "ethereum",
      executionTxHash: "0xexec999",
      gasPaid: true,
    });
    expect((result as { axelarScanUrl: string }).axelarScanUrl).toContain("axelarscan.io/gmp/");
  });

  it("returns not_found when API returns empty data", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    const result = await getMessageStatusTool.coreAction(
      { txHash: FAKE_TX_HASH },
      mockContext,
      mockClient,
    );

    expect(result).toMatchObject({
      success: true,
      status: "not_found",
      isExecuted: false,
    });
  });

  it("marks error status correctly", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            status: "insufficient_fee",
            sourceChain: "hedera",
            destinationChain: "base",
          },
        ],
      }),
    } as Response);

    const result = await getMessageStatusTool.coreAction(
      { txHash: FAKE_TX_HASH },
      mockContext,
      mockClient,
    );

    expect(result).toMatchObject({
      success: true,
      status: "insufficient_fee",
      isError: true,
    });
  });

  it("uses testnet scan URL when network is testnet", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ status: "called", sourceChain: "hedera" }],
      }),
    } as Response);

    const result = await getMessageStatusTool.coreAction(
      { txHash: FAKE_TX_HASH, network: "testnet" },
      mockContext,
      mockClient,
    );

    expect((result as { axelarScanUrl: string }).axelarScanUrl).toContain("testnet.axelarscan.io");
  });

  it("returns error on HTTP failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    const result = await getMessageStatusTool.coreAction(
      { txHash: FAKE_TX_HASH },
      mockContext,
      mockClient,
    );
    expect(result).toMatchObject({ success: false });
  });

  it("shouldSecondaryAction returns false for status result", async () => {
    const statusResult = { success: true, status: "executed" };
    expect(await getMessageStatusTool.shouldSecondaryAction(statusResult, mockContext)).toBe(false);
  });
});
