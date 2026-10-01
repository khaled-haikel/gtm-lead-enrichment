// Amazon Bedrock on-demand prices for Claude Sonnet 4.5 in US East (N. Virginia), in USD per
// million tokens.
//
// Source: https://aws.amazon.com/bedrock/pricing/ (On-Demand and Batch pricing, Anthropic
// models), read 2026-10-01. The page fills its table cells from AWS's pricing data file,
// published 2026-09-30; these are the values it shows for us-east-1:
//   Global Cross-region Inference:            $3.00 input, $15.00 output
//   Geo and In-region Cross-region Inference: $3.30 input, $16.50 output
//
// Bedrock bills by how the model is invoked, so the rate follows the ID in LLM_MODEL_ID: a
// "global." inference profile gets the global rate; a geographic profile (such as "us.") or
// the in-region model ID gets the geo and in-region rate. Any other model has no price here
// and is rejected rather than guessed.

import { ConfigurationError, type TokenUsage } from "../errors";

export const PRICING_SOURCE = {
  url: "https://aws.amazon.com/bedrock/pricing/",
  readOn: "2026-10-01",
} as const;

export type Price = { inputPerMTok: number; outputPerMTok: number };

export const SONNET_4_5_PRICES = {
  global: { inputPerMTok: 3, outputPerMTok: 15 },
  geoOrInRegion: { inputPerMTok: 3.3, outputPerMTok: 16.5 },
} as const satisfies Record<string, Price>;

export function priceFor(modelId: string): Price {
  // An inference profile ARN ends with ".../<profile id>"; a plain ID has no slash.
  const id = modelId.slice(modelId.lastIndexOf("/") + 1);
  if (!id.includes("anthropic.claude-sonnet-4-5")) {
    throw new ConfigurationError(
      `No price is recorded for model "${modelId}". Add it to llm/pricing.ts from the official pricing page.`,
    );
  }
  return id.startsWith("global.") ? SONNET_4_5_PRICES.global : SONNET_4_5_PRICES.geoOrInRegion;
}

// Rounded to a millionth of a dollar, which is finer than any single request costs.
export function costUsd(usage: TokenUsage, price: Price): number {
  const dollars =
    (usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1_000_000;
  return Math.round(dollars * 1_000_000) / 1_000_000;
}
