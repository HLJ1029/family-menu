const configuredAssetBaseUrl = String(import.meta.env?.VITE_HUMI_ASSET_BASE_URL || "").replace(/\/$/, "");

export function publicAssetUrl(path) {
  const value = String(path || "");
  if (!value || /^(?:https?:|data:|blob:)/i.test(value) || !configuredAssetBaseUrl) return value;
  return `${configuredAssetBaseUrl}/${value.replace(/^\/+/, "")}`;
}
