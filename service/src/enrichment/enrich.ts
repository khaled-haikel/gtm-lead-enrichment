// One enrichment: ask the model for facts, hold them to the contract, check the evidence, score.

import type { z } from "zod";
import { EnrichmentValidationError, type TokenUsage } from "../errors";
import { costUsd, priceFor } from "../llm/pricing";
import type { ExtractionInput, ExtractionModel } from "../llm/model";
import { truncateWebsiteText } from "../llm/prompt";
import { log } from "../log";
import { type Extraction, extractionSchema } from "./contract";
import { type Evidence, checkEvidence } from "./evidence";
import type { EnrichRequest } from "./request";
import { type Score, scoreLead } from "./scoring";

export type EnrichResponse = {
  leadId: string;
  extraction: Extraction;
  evidence: Evidence;
  score: Score;
  usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
  };
};

function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

// Calls the model once, and once more with the validation errors if the first output fails
// the contract. Usage from every attempt counts toward the cost.
async function extractValidated(
  model: ExtractionModel,
  input: ExtractionInput,
  usage: TokenUsage,
  leadId: string,
): Promise<Extraction> {
  let retry: ExtractionInput["retry"];
  for (let attempt = 1; ; attempt++) {
    const result = await model.extract({ ...input, retry });
    usage.inputTokens += result.usage.inputTokens;
    usage.outputTokens += result.usage.outputTokens;

    const parsed = extractionSchema.safeParse(result.raw);
    if (parsed.success) return parsed.data;

    const errors = describeIssues(parsed.error);
    if (attempt === 2) throw new EnrichmentValidationError(errors, { ...usage });
    log.warn("model output failed validation, retrying once", { leadId, errors });
    retry = { previousOutput: result.raw, errors };
  }
}

export async function enrich(request: EnrichRequest, model: ExtractionModel): Promise<EnrichResponse> {
  const started = performance.now();
  const leadId = request.lead.id;
  // Resolved before calling the model, so an unpriced model fails before it costs anything.
  const price = priceFor(model.modelId);

  // The evidence check uses the same truncated text the model saw: it can only quote that.
  const websiteText = truncateWebsiteText(request.websiteText ?? "");
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  // No personal data reaches the model: of the lead, only the company name and website are
  // sent. First name, last name, email and title stay in this service (enrich.test.ts pins it).
  const extraction = await extractValidated(
    model,
    {
      companyName: request.lead.company,
      websiteUrl: request.websiteUrl ?? request.lead.website,
      websiteText,
    },
    usage,
    leadId,
  );

  const evidence = checkEvidence(extraction, websiteText);
  const score = scoreLead(extraction, evidence);

  return {
    leadId,
    extraction,
    evidence,
    score,
    usage: {
      model: model.modelId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: costUsd(usage, price),
      latencyMs: Math.round(performance.now() - started),
    },
  };
}
