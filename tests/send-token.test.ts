import { describe, expect, it } from "vitest";
import { sendTokenTool } from "../src/tools/send-token.js";

const mockContext = {} as never;
const mockClient = {} as never;

const VALID_TOKEN_ID = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
const VALID_DEST_ADDR = "0xDEAD000000000000000000000000000000000001";

describe("SendTokenTool — coreAction", () => {
  it("returns transaction payload on valid input", async () => {
    const result = await sendTokenTool.coreAction(
      {
        interchainTokenId: VALID_TOKEN_ID,
        destinationChain: "base",
        destinationAddress: VALID_DEST_ADDR,
        amount: "1000000",
        gasTinybars: "5000000",
        network: "testnet",
      },
      mockContext,
      mockClient,
    );

    expect(result).toHaveProperty("transaction");
    expect(result).toHaveProperty("extras");

    const r = result as { extras: Record<string, unknown> };
    expect(r.extras.destinationChain).toBe("base");
    expect(r.extras.amount).toBe("1000000");
    expect(r.extras.gasTinybars).toBe("5000000");
  });

  it("accepts token ID without 0x prefix", async () => {
    const tokenIdNoPrefix = VALID_TOKEN_ID.slice(2);
    const result = await sendTokenTool.coreAction(
      {
        interchainTokenId: tokenIdNoPrefix,
        destinationChain: "ethereum",
        destinationAddress: VALID_DEST_ADDR,
        amount: "500",
        gasTinybars: "2000000",
      },
      mockContext,
      mockClient,
    );
    expect(result).toHaveProperty("transaction");
  });

  it("accepts default empty metadata", async () => {
    const result = await sendTokenTool.coreAction(
      {
        interchainTokenId: VALID_TOKEN_ID,
        destinationChain: "arbitrum",
        destinationAddress: VALID_DEST_ADDR,
        amount: "100",
        gasTinybars: "1000000",
        // metadata omitted — should default to "0x"
      },
      mockContext,
      mockClient,
    );
    expect(result).toHaveProperty("transaction");
  });

  it("returns error on invalid destination address (wrong length)", async () => {
    const result = await sendTokenTool.coreAction(
      {
        interchainTokenId: VALID_TOKEN_ID,
        destinationChain: "ethereum",
        destinationAddress: "0xBAD",
        amount: "1000000",
        gasTinybars: "5000000",
      },
      mockContext,
      mockClient,
    );
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/destinationAddress/i);
  });

  it("returns error on invalid gasTinybars", async () => {
    const result = await sendTokenTool.coreAction(
      {
        interchainTokenId: VALID_TOKEN_ID,
        destinationChain: "ethereum",
        destinationAddress: VALID_DEST_ADDR,
        amount: "1000000",
        gasTinybars: "0",
      },
      mockContext,
      mockClient,
    );
    expect(result).toMatchObject({ success: false });
  });

  it("returns error on non-numeric gasTinybars", async () => {
    const result = await sendTokenTool.coreAction(
      {
        interchainTokenId: VALID_TOKEN_ID,
        destinationChain: "ethereum",
        destinationAddress: VALID_DEST_ADDR,
        amount: "1000000",
        gasTinybars: "abc",
      },
      mockContext,
      mockClient,
    );
    expect(result).toMatchObject({ success: false });
  });
});

describe("SendTokenTool — shouldSecondaryAction", () => {
  it("returns true when coreResult has transaction", async () => {
    const payload = { transaction: {}, extras: {} };
    expect(await sendTokenTool.shouldSecondaryAction(payload, mockContext)).toBe(true);
  });

  it("returns false for error result (no transaction property)", async () => {
    const error = { success: false, error: "failed" };
    expect(await sendTokenTool.shouldSecondaryAction(error, mockContext)).toBe(false);
  });

  it("returns false for null", async () => {
    expect(await sendTokenTool.shouldSecondaryAction(null, mockContext)).toBe(false);
  });
});
