// Environment configuration, validated with zod. Errors name the variables at fault and never
// echo their values.

import { z } from "zod";
import { ConfigurationError } from "./errors";

const required = z.string({ error: "is required" }).trim().min(1, "is required");

const baseSchema = z.object({
  ENRICH_API_TOKEN: z
    .string({ error: "is required" })
    .min(32, "must be at least 32 characters"),
  LLM_PROVIDER: z.enum(["bedrock"], {
    error: (issue) =>
      issue.input === undefined ? "is required" : 'must be "bedrock" (the only provider implemented)',
  }),
  LLM_MODEL_ID: required,
});

const bedrockSchema = z.object({
  AWS_REGION: required,
  AWS_ACCESS_KEY_ID: required,
  AWS_SECRET_ACCESS_KEY: required,
  // The Bedrock SDK prefers a bearer token from the environment over explicit keys, which
  // would silently bypass the IAM user this service is meant to run as.
  AWS_BEARER_TOKEN_BEDROCK: z
    .never({
      error: "must not be set: the service signs with AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY",
    })
    .optional(),
});

export type BedrockModelConfig = {
  provider: "bedrock";
  modelId: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type ModelConfig = BedrockModelConfig;

export type Config = {
  enrichApiToken: string;
  model: ModelConfig;
};

function parse<T>(schema: z.ZodType<T>, env: Record<string, string | undefined>): T {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`);
    throw new ConfigurationError(`Invalid configuration: ${problems.join("; ")}`);
  }
  return result.data;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const base = parse(baseSchema, env);
  const bedrock = parse(bedrockSchema, env);
  return {
    enrichApiToken: base.ENRICH_API_TOKEN,
    model: {
      provider: base.LLM_PROVIDER,
      modelId: base.LLM_MODEL_ID,
      region: bedrock.AWS_REGION,
      accessKeyId: bedrock.AWS_ACCESS_KEY_ID,
      secretAccessKey: bedrock.AWS_SECRET_ACCESS_KEY,
    },
  };
}
