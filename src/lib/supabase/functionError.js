export async function resolveFunctionError(error) {
  const response = error?.context;
  const detail = await readFunctionResponse(response);
  if (!detail) return error;

  const message = detail.error || detail.message || detail.msg || detail;
  if (typeof message === "string") return new Error(message);
  return new Error(JSON.stringify(message));
}

async function readFunctionResponse(response) {
  if (!response || typeof response.clone !== "function") return "";

  const clone = response.clone();
  try {
    const json = await clone.json();
    return json;
  } catch {
    try {
      return await response.clone().text();
    } catch {
      return "";
    }
  }
}
