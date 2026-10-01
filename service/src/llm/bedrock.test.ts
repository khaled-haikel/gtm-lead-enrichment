import type AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractionJsonSchema } from "../enrichment/contract";
import { ProviderError } from "../errors";
import { BedrockExtractionModel, createBedrockClient } from "./bedrock";
import type { ExtractionInput } from "./model";
import { SYSTEM_PROMPT, TOOL_NAME, buildUserMessage } from "./prompt";

const MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const INPUT: ExtractionInput = {
  companyName: "Acme Goods",
  websiteUrl: "https://acme.example",
  websiteText: "Join our creator program and earn commission.",
};

// A stand-in for the SDK client: only messages.create is used.
function fakeClient(create: (params: unknown) => Promise<unknown>) {
  const spy = vi.fn(create);
  return { spy, client: { messages: { create: spy } } as unknown as AnthropicBedrock };
}

function message(content: unknown[], stopReason = "tool_use") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: MODEL_ID,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1_234, output_tokens: 210 },
  };
}

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("BedrockExtractionModel", () => {
  it("forces a call to the extraction tool, whose input schema is the contract", async () => {
    const { spy, client } = fakeClient(async () =>
      message([{ type: "tool_use", id: "toolu_1", name: TOOL_NAME, input: { any: "thing" } }]),
    );
    await new BedrockExtractionModel(MODEL_ID, client).extract(INPUT);

    expect(spy).toHaveBeenCalledTimes(1);
    const params = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(params).toMatchObject({
      model: MODEL_ID,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: buildUserMessage(INPUT) }],
    });
    expect(params.tools).toEqual([
      { name: TOOL_NAME, description: expect.any(String), input_schema: extractionJsonSchema },
    ]);
    expect(params.max_tokens).toBeGreaterThanOrEqual(1_024);
  });

  it("uses the model ID it was given, never a hardcoded one", async () => {
    const { spy, client } = fakeClient(async () => message([]));
    await new BedrockExtractionModel("some-configured-profile", client).extract(INPUT);
    expect(spy.mock.calls[0][0]).toMatchObject({ model: "some-configured-profile" });
  });

  it("returns the tool input as raw output, with token usage", async () => {
    const input = { company_type: "Brand" };
    const { client } = fakeClient(async () =>
      message([
        { type: "text", text: "Recording." },
        { type: "tool_use", id: "toolu_1", name: TOOL_NAME, input },
      ]),
    );
    expect(await new BedrockExtractionModel(MODEL_ID, client).extract(INPUT)).toEqual({
      raw: input,
      usage: { inputTokens: 1_234, outputTokens: 210 },
    });
  });

  it("returns undefined raw output when the model made no tool call", async () => {
    const { client } = fakeClient(async () => message([{ type: "text", text: "No." }], "end_turn"));
    const result = await new BedrockExtractionModel(MODEL_ID, client).extract(INPUT);
    expect(result.raw).toBeUndefined();
    expect(result.usage).toEqual({ inputTokens: 1_234, outputTokens: 210 });
  });

  it("wraps SDK and network failures in ProviderError, keeping the cause", async () => {
    const cause = new Error("AccessDeniedException: not authorized to perform bedrock:InvokeModel");
    const { client } = fakeClient(async () => {
      throw cause;
    });
    const error = await new BedrockExtractionModel(MODEL_ID, client).extract(INPUT).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).cause).toBe(cause);
    expect((error as ProviderError).message).toContain("AccessDeniedException");
  });
});

describe("createBedrockClient", () => {
  it("uses only the configured region and keys: no session token, no Bedrock API key", () => {
    const client = createBedrockClient({
      provider: "bedrock",
      modelId: MODEL_ID,
      region: "us-east-1",
      accessKeyId: "test-access-key-id",
      secretAccessKey: "test-secret",
    });
    expect(client).toMatchObject({
      awsRegion: "us-east-1",
      awsAccessKey: "test-access-key-id",
      awsSecretKey: "test-secret",
      awsSessionToken: null,
    });
  });
});
