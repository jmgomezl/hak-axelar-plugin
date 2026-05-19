import Long from "long";

export const toUint256 = (value: string | number): Long =>
  typeof value === "string" ? Long.fromString(value) : Long.fromNumber(value);

/**
 * Converts a tinybars (8-decimal HBAR) amount to weibar (18-decimal EVM representation).
 * Hedera EVM uses 18 decimals; native Hedera uses 8 decimals.
 * tinybars × 10^10 = weibar
 */
export const tinybarsToWeibar = (tinybars: string | number): Long => {
  const tb = typeof tinybars === "string" ? Long.fromString(tinybars) : Long.fromNumber(tinybars);
  return tb.multiply(Long.fromNumber(10_000_000_000));
};

/**
 * Safe cast for passing numeric strings to ContractFunctionParameters.addUint256().
 *
 * The Hedera SDK's addUint256 runtime accepts strings via its internal isString()
 * check, but the TypeScript type only declares Long | BigNumber | number.
 * This helper avoids the Long ESM/CJS module-instance mismatch that breaks the
 * instanceof isLong() check when the `long` package loads different files for ESM
 * vs CJS consumers.
 */
export const safeUint256 = (value: string | bigint): Long =>
  String(value) as unknown as Long;

/**
 * Converts hex string to Uint8Array. Handles optional 0x prefix.
 * Throws if the string contains non-hex characters.
 */
export const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length > 0 && !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`Invalid hex string: "${hex}"`);
  }
  return Uint8Array.from(Buffer.from(clean, "hex"));
};

/**
 * Encodes an EVM address as a 20-byte Uint8Array (no padding).
 * Used as ITS destinationAddress for EVM destination chains.
 */
export const encodeEvmAddress = (address: string): Uint8Array => {
  const clean = address.replace(/^0x/i, "");
  if (clean.length !== 40) {
    throw new Error(`Invalid EVM address length: ${address}`);
  }
  return hexToBytes(clean);
};

/**
 * Pads a bytes32 hex string to exactly 32 bytes.
 * Used for ITS tokenId parameter.
 */
export const hexToBytes32 = (hex: string): Uint8Array => {
  const clean = hex.replace(/^0x/i, "").padStart(64, "0");
  return hexToBytes(clean);
};
