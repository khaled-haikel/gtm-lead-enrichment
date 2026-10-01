import { describe, expect, it } from "vitest";
import { ConfigurationError } from "../errors";
import { PRICING_SOURCE, SONNET_4_5_PRICES, costUsd, priceFor } from "./pricing";

describe("pricing", () => {
  it("records where and when the prices were read", () => {
    expect(PRICING_SOURCE).toEqual({
      url: "https://aws.amazon.com/bedrock/pricing/",
      readOn: "2026-10-01",
    });
  });

  it.each([
    ["a global inference profile", "global.anthropic.claude-sonnet-4-5-20250929-v1:0", SONNET_4_5_PRICES.global],
    ["a US inference profile", "us.anthropic.claude-sonnet-4-5-20250929-v1:0", SONNET_4_5_PRICES.geoOrInRegion],
    ["the in-region model ID", "anthropic.claude-sonnet-4-5-20250929-v1:0", SONNET_4_5_PRICES.geoOrInRegion],
    [
      "a global inference profile ARN",
      "arn:aws:bedrock:us-east-1:000000000000:inference-profile/global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      SONNET_4_5_PRICES.global,
    ],
  ])("prices %s", (_, modelId, expected) => {
    expect(priceFor(modelId)).toEqual(expected);
  });

  it.each([
    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "anthropic.claude-sonnet-4-20250514-v1:0",
    "arn:aws:bedrock:us-east-1:000000000000:application-inference-profile/abc123",
  ])("refuses to guess a price for %s", (modelId) => {
    expect(() => priceFor(modelId)).toThrow(ConfigurationError);
  });

  it("computes cost from usage", () => {
    expect(costUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, SONNET_4_5_PRICES.global)).toBe(18);
    expect(costUsd({ inputTokens: 4_000, outputTokens: 500 }, SONNET_4_5_PRICES.global)).toBe(0.0195);
    expect(costUsd({ inputTokens: 4_000, outputTokens: 500 }, SONNET_4_5_PRICES.geoOrInRegion)).toBe(0.02145);
  });

  it("rounds to a millionth of a dollar", () => {
    expect(costUsd({ inputTokens: 1, outputTokens: 0 }, SONNET_4_5_PRICES.geoOrInRegion)).toBe(0.000003);
    expect(costUsd({ inputTokens: 0, outputTokens: 0 }, SONNET_4_5_PRICES.global)).toBe(0);
  });
});
