import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function decodeAvatarPayload(payload = {}, maxBytes = 512 * 1024) {
  const mimeType = String(payload.mimeType || "").toLowerCase();
  if (!["image/jpeg", "image/png"].includes(mimeType)) return null;
  const bytes = Buffer.from(String(payload.dataBase64 || ""), "base64");
  if (bytes.length === 0 || bytes.length > maxBytes) return null;
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((mimeType === "image/png" && !png) || (mimeType === "image/jpeg" && !jpeg)) return null;
  return { format: png ? "png" : "jpg", bytes };
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
