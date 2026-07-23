class HumiRequestError extends Error {
  constructor(status = 0, code = "request_failed", details = {}) {
    super(code);
    this.name = "HumiRequestError";
    this.status = Number(status) || 0;
    this.code = code;
    this.retryable = details.retryable ?? (this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500);
    this.latestStateVersion = details.latestStateVersion || null;
    this.latestEnvelope = details.latestEnvelope || null;
  }
}

module.exports = { HumiRequestError };
