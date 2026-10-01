// A scripted ExtractionModel for tests: no network, records every call.

import type { ExtractionInput, ExtractionModel } from "../llm/model";
import type { Extraction } from "../enrichment/contract";
import type { EnrichRequest } from "../enrichment/request";

export const TEST_MODEL_ID = "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
export const USAGE_PER_CALL = { inputTokens: 2_000, outputTokens: 300 };

export class FakeModel implements ExtractionModel {
  readonly calls: ExtractionInput[] = [];

  constructor(
    private readonly outputs: unknown[],
    readonly modelId: string = TEST_MODEL_ID,
  ) {}

  async extract(input: ExtractionInput) {
    this.calls.push(input);
    if (this.calls.length > this.outputs.length) throw new Error("FakeModel: no output scripted");
    const output = this.outputs[this.calls.length - 1];
    if (output instanceof Error) throw output;
    return { raw: output, usage: { ...USAGE_PER_CALL } };
  }
}

export const WEBSITE_TEXT = `Acme Goods makes everyday sneakers for runners and walkers.
Join our creator program and earn commission on every sale.
Tag us #AcmeGoods to be featured on our page. Over 300 employees across three countries.`;

export const VALID_EXTRACTION: Extraction = {
  company_type: "Brand",
  employee_band: "201-1000",
  industry: "Apparel",
  sells_to: "consumers",
  creator_signals: [
    { signal: "has_creator_program", quote: "Join our creator program and earn commission" },
    { signal: "mentions_ugc", quote: "Tag us #AcmeGoods to be featured" },
    { signal: "mentions_influencers", quote: "We partner with 500 top influencers" },
  ],
  summary: "Sneaker brand selling to consumers, with a creator program.",
};

export function enrichRequest(overrides: Partial<EnrichRequest> = {}): EnrichRequest {
  return {
    lead: {
      id: "00Q000000000001AAA",
      firstName: "Maya",
      lastName: "Okafor",
      company: "Acme Goods",
      email: "maya.okafor@acme.example",
      title: "Head of Influencer Marketing",
      website: "https://www.acme.example",
    },
    websiteUrl: "https://www.acme.example",
    websiteText: WEBSITE_TEXT,
    ...overrides,
  };
}
