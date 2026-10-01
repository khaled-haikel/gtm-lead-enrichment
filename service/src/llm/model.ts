// The seam between the enrichment core and a model provider. Providers only return the raw
// tool input and token usage; validation, evidence and scoring happen in enrichment/.

import type { TokenUsage } from "../errors";

export type ExtractionInput = {
  companyName: string;
  websiteUrl?: string;
  // Already truncated to MAX_WEBSITE_TEXT_CHARS; empty when there is no website text.
  websiteText: string;
  // Set on the one retry after the first output failed validation.
  retry?: { previousOutput: unknown; errors: string[] };
};

export interface ExtractionModel {
  // The provider's model or inference profile ID, as configured in LLM_MODEL_ID.
  readonly modelId: string;
  extract(input: ExtractionInput): Promise<{ raw: unknown; usage: TokenUsage }>;
}
