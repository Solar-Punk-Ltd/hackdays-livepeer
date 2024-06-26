import crypto from "crypto";

export function convertTo16HexString(num) {
  let hexString = num.toString(16);
  hexString = hexString.padStart(16, "0");
  return hexString;
}

export function remove0xPrefix(hexString) {
  return hexString.startsWith("0x") ? hexString.slice(2) : hexString;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateRandomData(size) {
  const randomData = crypto.randomBytes(size);
  return new Uint8Array(
    randomData.buffer,
    randomData.byteOffset,
    randomData.byteLength
  );
}

export function bytesToHex(bytes, len) {
  const hexByte = (n) => n.toString(16).padStart(2, "0");
  const hex = Array.from(bytes, hexByte).join("");
  if (len && hex.length !== len) {
    throw new Error(
      `Resulting HexString does not have expected length ${len}: ${hex}`
    );
  }
  return hex;
}
