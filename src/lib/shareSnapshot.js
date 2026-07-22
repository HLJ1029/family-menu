export function createAsyncSnapshotCache() {
  const entries = new Map();

  return {
    getOrCreate(key, create) {
      if (entries.has(key)) return entries.get(key);
      const pending = Promise.resolve().then(create);
      entries.set(key, pending);
      pending.catch(() => {
        if (entries.get(key) === pending) entries.delete(key);
      });
      return pending;
    },

    clear() {
      entries.clear();
    },
  };
}

export function buildShareSnapshotKey(type, householdId, snapshot) {
  const surface = String(type || "share").trim() || "share";
  const household = String(householdId || "guest").trim() || "guest";
  return `${surface}:${household}:${fingerprint(stableSerialize(snapshot))}`;
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function fingerprint(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
