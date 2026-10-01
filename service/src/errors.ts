// Errors the enrichment API maps to HTTP status codes (see api/enrich-handler.ts).

export type TokenUsage = { inputTokens: number; outputTokens: number };

// The model's output failed the contract twice (the first try and one retry). Maps to 422.
export class EnrichmentValidationError extends Error {
  override readonly name = "EnrichmentValidationError";

  constructor(
    readonly issues: string[],
    readonly usage: TokenUsage,
  ) {
    super(`Model output failed validation after a retry: ${issues.join("; ")}`);
  }
}

// The model provider could not be reached or rejected the request. Maps to 502.
export class ProviderError extends Error {
  override readonly name = "ProviderError";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

// Missing or invalid environment configuration. Messages name variables, never values.
export class ConfigurationError extends Error {
  override readonly name = "ConfigurationError";
}
