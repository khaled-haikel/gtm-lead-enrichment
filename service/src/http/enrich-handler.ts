// POST /api/enrich: check the bearer token, validate the body, enrich, map errors to statuses.

import { hasValidBearerToken } from "../auth";
import { type Config, loadConfig } from "../config";
import { enrich } from "../enrichment/enrich";
import { enrichRequestSchema } from "../enrichment/request";
import { ConfigurationError, EnrichmentValidationError, ProviderError } from "../errors";
import { createExtractionModel } from "../llm";
import type { ExtractionModel } from "../llm/model";
import { log } from "../log";

export type EnrichHandlerDeps = {
  loadConfig: () => Config;
  createModel: (config: Config["model"]) => ExtractionModel;
};

function errorResponse(status: number, error: string, details?: string[]): Response {
  return Response.json(details ? { error, details } : { error }, { status });
}

export function createEnrichHandler(deps: EnrichHandlerDeps) {
  return async function POST(request: Request): Promise<Response> {
    let config: Config;
    try {
      config = deps.loadConfig();
    } catch (err) {
      log.error("enrich: invalid configuration", { err });
      return errorResponse(500, "Service is misconfigured");
    }

    if (!hasValidBearerToken(request.headers.get("authorization"), config.enrichApiToken)) {
      return errorResponse(401, "Missing or invalid bearer token");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "Request body is not valid JSON");
    }
    const parsed = enrichRequestSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`,
      );
      return errorResponse(400, "Invalid request body", details);
    }

    const leadId = parsed.data.lead.id;
    try {
      const result = await enrich(parsed.data, deps.createModel(config.model));
      log.info("lead enriched", {
        leadId,
        tier: result.score.tier,
        score: result.score.value,
        signalsKept: result.evidence.kept.length,
        signalsDropped: result.evidence.dropped.length,
        ...result.usage,
      });
      return Response.json(result);
    } catch (err) {
      if (err instanceof EnrichmentValidationError) {
        log.warn("model output failed validation twice", { leadId, issues: err.issues, ...err.usage });
        return errorResponse(422, "Model output failed validation after one retry", err.issues);
      }
      if (err instanceof ProviderError) {
        log.error("model provider error", { leadId, err });
        return errorResponse(502, "Model provider error");
      }
      if (err instanceof ConfigurationError) {
        log.error("enrich: invalid configuration", { leadId, err });
        return errorResponse(500, "Service is misconfigured");
      }
      log.error("enrich: unexpected error", { leadId, err });
      return errorResponse(500, "Internal error");
    }
  };
}

// Production dependencies. The model client is created once per server instance.
let model: ExtractionModel | undefined;
export const defaultDeps: EnrichHandlerDeps = {
  loadConfig: () => loadConfig(),
  createModel: (config) => (model ??= createExtractionModel(config)),
};
