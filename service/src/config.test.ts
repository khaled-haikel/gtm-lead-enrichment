import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { ConfigurationError } from "./errors";

const ENV = {
  ENRICH_API_TOKEN: "t".repeat(64),
  LLM_PROVIDER: "bedrock",
  LLM_MODEL_ID: "us.anthropic.claude-sonnet-4-5-example",
  AWS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "test-access-key-id",
  AWS_SECRET_ACCESS_KEY: "secret-value-that-must-not-leak",
};

function configError(env: Record<string, string | undefined>): ConfigurationError {
  try {
    loadConfig(env);
  } catch (err) {
    if (err instanceof ConfigurationError) return err;
    throw err;
  }
  throw new Error("expected loadConfig to throw");
}

describe("loadConfig", () => {
  it("maps a valid environment to the config", () => {
    expect(loadConfig(ENV)).toEqual({
      enrichApiToken: ENV.ENRICH_API_TOKEN,
      model: {
        provider: "bedrock",
        modelId: ENV.LLM_MODEL_ID,
        region: "us-east-1",
        accessKeyId: ENV.AWS_ACCESS_KEY_ID,
        secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY,
      },
    });
  });

  it.each(Object.keys(ENV))("names %s when it is missing", (name) => {
    const env: Record<string, string | undefined> = { ...ENV, [name]: undefined };
    expect(configError(env).message).toContain(`${name} is required`);
  });

  it("rejects a blank model ID", () => {
    expect(configError({ ...ENV, LLM_MODEL_ID: "   " }).message).toContain("LLM_MODEL_ID is required");
  });

  it("rejects a provider that is not implemented", () => {
    expect(configError({ ...ENV, LLM_PROVIDER: "anthropic" }).message).toContain("LLM_PROVIDER");
  });

  it("refuses a Bedrock API key, which would take precedence over the IAM keys", () => {
    expect(configError({ ...ENV, AWS_BEARER_TOKEN_BEDROCK: "bearer-value" }).message).toContain(
      "AWS_BEARER_TOKEN_BEDROCK must not be set",
    );
  });

  it("rejects a short API token", () => {
    expect(configError({ ...ENV, ENRICH_API_TOKEN: "short" }).message).toContain(
      "ENRICH_API_TOKEN must be at least 32 characters",
    );
  });

  it("never puts values in the error message", () => {
    const message = configError({ ...ENV, ENRICH_API_TOKEN: "short-token", LLM_PROVIDER: "x" }).message;
    expect(message).not.toContain("short-token");
    expect(message).not.toContain(ENV.AWS_SECRET_ACCESS_KEY);
  });
});
