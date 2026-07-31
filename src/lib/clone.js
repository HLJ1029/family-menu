export function cloneData(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return clonePlainData(value);
}

function clonePlainData(value) {
  if (Array.isArray(value)) return value.map(clonePlainData);
  if (value instanceof Date) return new Date(value.getTime());
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, clonePlainData(entry)]),
    );
  }
  return value;
}
