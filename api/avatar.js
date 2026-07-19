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
  if (bytes.length < 33) return false;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const hasIhdr = bytes.subarray(0, 8).equals(signature)
    && bytes.readUInt32BE(8) === 13
    && bytes.subarray(12, 16).toString("ascii") === "IHDR";
  const hasIend = bytes.readUInt32BE(bytes.length - 12) === 0
    && bytes.subarray(bytes.length - 8, bytes.length - 4).toString("ascii") === "IEND";
  return hasIhdr && hasIend;
}

function isStructurallyValidJpeg(bytes) {
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  for (let index = 2; index < bytes.length - 1; index += 1) {
    if (bytes[index] === 0xff && startOfFrameMarkers.has(bytes[index + 1])) return true;
  }
  return false;
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
