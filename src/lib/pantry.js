export function getExpiryState(expiresOn) {
  if (!expiresOn) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(`${expiresOn}T00:00:00`);
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 3) return "soon";
  return "fresh";
}

export function formatPantryCount(count, summary = {}) {
  if (summary.expiredCount > 0) return `${count} 项 · ${summary.expiredCount} 日期已过`;
  if (summary.expiringCount > 0) return `${count} 项 · ${summary.expiringCount} 临期`;
  return `${count} 项`;
}

export function formatExpiry(value, state) {
  if (state === "expired") return `日期已过 ${value.slice(5)}`;
  if (state === "soon") return `临期 ${value.slice(5)}`;
  return `至 ${value.slice(5)}`;
}
