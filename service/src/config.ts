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

// Bedrock settings use their own BEDROCK_* names, never the AWS_* ones: Vercel runs on AWS
// and can inject AWS_* values that are not this service's credentials.
const bedrockSchema = z.object({
  BEDROCK_REGION: required,
  BEDROCK_ACCESS_KEY_ID: required,
  BEDROCK_SECRET_ACCESS_KEY: required,
  // The Bedrock SDK reads this from the environment and prefers it over explicit keys, which
  // would silently bypass the IAM user this service is meant to run as.
  AWS_BEARER_TOKEN_BEDROCK: z
    .never({
      error:
        "must not be set: the service signs with BEDROCK_ACCESS_KEY_ID and BEDROCK_SECRET_ACCESS_KEY",
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
      region: bedrock.BEDROCK_REGION,
      accessKeyId: bedrock.BEDROCK_ACCESS_KEY_ID,
      secretAccessKey: bedrock.BEDROCK_SECRET_ACCESS_KEY,
    },
  };
}
