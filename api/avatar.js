import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function decodeAvatarPayload(payload = {}, maxBytes = 512 * 1024) {
  const mimeType = String(payload.mimeType || "").toLowerCase();
  if (!["image/jpeg", "image/png"].includes(mimeType)) return null;
  const bytes = Buffer.from(String(payload.dataBase64 || ""), "base64");
  if (bytes.length === 0 || bytes.length > maxBytes) return null;
  const png = isStructurallyValidPng(bytes);
  const jpeg = isStructurallyValidJpeg(bytes);
  if ((mimeType === "image/png" && !png) || (mimeType === "image/jpeg" && !jpeg)) return null;
  return { format: png ? "png" : "jpg", bytes };
}

function isStructurallyValidPng(bytes) {
  if (bytes.length < 45) return false;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) return false;
  let offset = 8;
  let hasIhdr = false;
  let hasIdat = false;
  while (offset + 12 <= bytes.length) {
    const dataLength = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > bytes.length) return false;
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + dataLength);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + dataLength);
    if (crc32(Buffer.concat([typeBytes, data])) !== expectedCrc) return false;
    if (offset === 8) {
      if (type !== "IHDR" || dataLength !== 13) return false;
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const allowedBitDepths = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (!width || !height || !allowedBitDepths[colorType]?.includes(bitDepth)) return false;
      if (data[10] !== 0 || data[11] !== 0 || ![0, 1].includes(data[12])) return false;
      hasIhdr = true;
    } else if (type === "IHDR") {
      return false;
    }
    if (type === "IDAT") {
      if (!hasIhdr || dataLength === 0) return false;
      hasIdat = true;
    }
    if (type === "IEND") {
      return dataLength === 0 && hasIhdr && hasIdat && chunkEnd === bytes.length;
    }
    offset = chunkEnd;
  }
  return false;
}

function isStructurallyValidJpeg(bytes) {
  if (bytes.length < 20 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  let hasStartOfFrame = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x00 || marker === 0xd9) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length - 2) return false;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2) return false;
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > bytes.length - 2) return false;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 8) return false;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      const components = bytes[offset + 7];
      if (!width || !height || components < 1 || components > 4) return false;
      hasStartOfFrame = true;
    }
    if (marker === 0xda) {
      return hasStartOfFrame && segmentLength >= 6 && segmentEnd < bytes.length - 2;
    }
    offset = segmentEnd;
  }
  return false;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function writeAvatarFile({ directory, bytes, format }) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const token = randomBytes(24).toString("base64url");
  const path = join(directory, `${token}.${format}`);
  await writeFile(path, bytes, { mode: 0o600 });
  return { token, format, bytes: bytes.length, path };
}

export async function readAvatarFile({ directory, token, format }) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token) || !["jpg", "png"].includes(format)) return null;
  const path = join(directory, `${token}.${format}`);
  const fileInfo = await stat(path).catch(() => null);
  if (!fileInfo?.isFile()) return null;
  return { bytes: await readFile(path), size: fileInfo.size };
}
