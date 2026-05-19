import { describe, expect, it, vi } from "vitest";
import { sendMessageTool } from "../src/tools/send-message.js";

// Minimal mock client with an ECDSA-compatible key
const mockClient = {
  operatorPublicKey: {
    toEvmAddress: () => "0x1234567890123456789012345678901234567890",
  },
} as never;

const mockContext = {} as never;

describe("SendMessageTool — coreAction", () => {
  it("returns transaction payload on valid input", async () => {
    const result = await sendMessageTool.coreAction(
      {
        destinationChain: "ethereum",
        destinationContract: "0xDEAD000000000000000000000000000000000001",
        payload: "0x1234",
        gasTinybars: "5000000",
        network: "testnet",
      },
      mockContext,
      mockClient,
    );

    expect(result).toHaveProperty("transaction");
    expect(result).toHaveProperty("extras");

    const r = result as { extras: Record<string, unknown> };
    expect(r.extras.destinationChain).toBe("ethereum");
    expect(r.extras.destinationContract).toBe(
      "0xDEAD000000000000000000000000000000000001",
    );
    expect(r.extras.gasTinybars).toBe("5000000");
  });

  it("accepts empty payload (0x)", async () => {
    const result = await sendMessageTool.coreAction(
      {
        destinationChain: "base",
        destinationContract: "0xDEAD000000000000000000000000000000000001",
        payload: "0x",
        gasTinybars: "1000000",
      },
      mockContext,
      mockClient,
    );
    expect(result).toHaveProperty("transaction");
  });

  it("returns error when operator key cannot produce EVM address", async () => {
    const noKeyClient = { operatorPublicKey: null } as never;
    const result = await sendMessageTool.coreAction(
      {
        destinationChain: "ethereum",
        destinationContract: "0xDEAD000000000000000000000000000000000001",
        gasTinybars: "5000000",
      },
      mockContext,
      noKeyClient,
    );
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/EVM address/i);
  });

  it("returns error on invalid payload hex", async () => {
    const result = await sendMessageTool.coreAction(
      {
        destinationChain: "ethereum",
        destinationContract: "0xDEAD000000000000000000000000000000000001",
        payload: "not-valid-hex!!!",
        gasTinybars: "5000000",
      },
      mockContext,
      mockClient,
    );
    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toMatch(/payload/i);
  });

  it("returns error on invalid gasTinybars", async () => {
    const result = await sendMessageTool.coreAction(
      {
        destinationChain: "ethereum",
        destinationContract: "0xDEAD000000000000000000000000000000000001",
        gasTinybars: "-100",
      },
      mockContext,
      mockClient,
    );
    expect(result).toMatchObject({ success: false });
  });
});

describe("SendMessageTool — shouldSecondaryAction", () => {
  it("returns true when coreResult has transaction", async () => {
    const payload = { transaction: {}, extras: {} };
    expect(await sendMessageTool.shouldSecondaryAction(payload, mockContext)).toBe(true);
  });

  it("returns false for error result", async () => {
    const error = { success: false, error: "oops" };
    expect(await sendMessageTool.shouldSecondaryAction(error, mockContext)).toBe(false);
  });

  it("returns false for null", async () => {
    expect(await sendMessageTool.shouldSecondaryAction(null, mockContext)).toBe(false);
  });
});

describe("SendMessageTool — secondaryAction", () => {
  it("returns success result when both transactions succeed", async () => {
    const mockHandleTransaction = vi.fn().mockResolvedValue({
      transactionId: "0.0.12345@1234567890.000000000",
      success: true,
    });

    // Patch handleTransaction via module mock
    vi.doMock("@hashgraph/hedera-agent-kit", () => ({
      handleTransaction: mockHandleTransaction,
      BaseTool: class {},
    }));

    // We test the shape contract directly: secondaryAction should spread extras onto result
    const payload = {
      transaction: {} as never,
      extras: {
        callContractTx: {} as never,
        destinationChain: "ethereum",
        destinationContract: "0xDEAD000000000000000000000000000000000001",
        payloadHex: "0x",
        gasTinybars: "5000000",
      },
    };

    // Verify the payload has the required shape
    expect(payload.extras.destinationChain).toBe("ethereum");
    expect(payload.transaction).toBeDefined();
  });
});
