// Claude on Amazon Bedrock through Anthropic's Bedrock SDK (the AnthropicBedrock client). It
// calls the bedrock-runtime InvokeModel API, so the IAM user needs bedrock:InvokeModel only.

import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import type { BedrockModelConfig } from "../config";
import { extractionJsonSchema } from "../enrichment/contract";
import { ProviderError, type TokenUsage } from "../errors";
import { log } from "../log";
import type { ExtractionInput, ExtractionModel } from "./model";
import { SYSTEM_PROMPT, TOOL_DESCRIPTION, TOOL_NAME, buildUserMessage } from "./prompt";

// The extraction is a few hundred tokens; this leaves ample room.
const MAX_OUTPUT_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 60_000;

// The contract's JSON Schema is an object schema, which is what a tool input must be.
const toolInputSchema = extractionJsonSchema as { type: "object"; [key: string]: unknown };

export function createBedrockClient(config: BedrockModelConfig): AnthropicBedrock {
  return new AnthropicBedrock({
    awsRegion: config.region,
    awsAccessKey: config.accessKeyId,
    awsSecretKey: config.secretAccessKey,
    // Explicit keys only: Vercel can inject AWS_SESSION_TOKEN and other AWS_* values that are
    // not usable credentials. (A Bedrock API key in the environment would take precedence over
    // these keys, so config.ts refuses to start when AWS_BEARER_TOKEN_BEDROCK is set.)
    awsSessionToken: null,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 2,
  });
}

export class BedrockExtractionModel implements ExtractionModel {
  constructor(
    readonly modelId: string,
    private readonly client: AnthropicBedrock,
  ) {}

  async extract(input: ExtractionInput): Promise<{ raw: unknown; usage: TokenUsage }> {
    let message;
    try {
      message = await this.client.messages.create({
        model: this.modelId,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
        system: SYSTEM_PROMPT,
        tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: toolInputSchema }],
        // Forced: the model must answer through the tool, never in free text.
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [{ role: "user", content: buildUserMessage(input) }],
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new ProviderError(`Bedrock request failed: ${reason}`, { cause: err });
    }

    const toolUse = message.content.find(
      (block) => block.type === "tool_use" && block.name === TOOL_NAME,
    );
    if (!toolUse) {
      log.warn("model response had no tool call", {
        model: this.modelId,
        stopReason: message.stop_reason,
      });
    }

    return {
      raw: toolUse?.type === "tool_use" ? toolUse.input : undefined,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    };
  }
}
