import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMessageFeeTool } from "../src/tools/get-message-fee.js";

const mockContext = {} as never;
const mockClient = {} as never;

describe("GetMessageFeeTool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns fee estimate on successful API response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          baseFee: "1000000",
          executionFee: "4000000",
          executionFeeWithMultiplier: "5000000",
          gasMultiplier: 1.25,
          isExpressSupported: false,
        },
      }),
    } as Response);

    const result = await getMessageFeeTool.coreAction(
      { destinationChain: "ethereum", gasLimit: 200_000, network: "mainnet" },
      mockContext,
      mockClient,
    );

    expect(result).toMatchObject({
      success: true,
      sourceChain: "hedera",
      destinationChain: "ethereum",
      gasLimit: 200_000,
      baseFee: "1000000",
      executionFee: "4000000",
      executionFeeWithMultiplier: "5000000",
      gasMultiplier: 1.25,
      isExpressSupported: false,
      unit: "tinybars",
    });
  });

  it("normalises flat response without result wrapper", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        baseFee: "500000",
        executionFee: "2000000",
        executionFeeWithMultiplier: "2500000",
        gasMultiplier: 1.0,
        isExpressSupported: true,
      }),
    } as Response);

    const result = await getMessageFeeTool.coreAction(
      { destinationChain: "base", gasLimit: 150_000 },
      mockContext,
      mockClient,
    );

    expect(result).toMatchObject({
      success: true,
      baseFee: "500000",
      isExpressSupported: true,
    });
  });

  it("returns error on HTTP failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    } as Response);

    const result = await getMessageFeeTool.coreAction(
      { destinationChain: "ethereum", gasLimit: 200_000 },
      mockContext,
      mockClient,
    );

    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/400/);
  });

  it("returns error on network exception", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("timeout"));
    const result = await getMessageFeeTool.coreAction(
      { destinationChain: "ethereum", gasLimit: 200_000 },
      mockContext,
      mockClient,
    );
    expect(result).toMatchObject({ success: false, error: "timeout" });
  });

  it("shouldSecondaryAction returns false for fee result", async () => {
    const feeResult = { success: true, baseFee: "1000000" };
    expect(await getMessageFeeTool.shouldSecondaryAction(feeResult, mockContext)).toBe(false);
  });
});
