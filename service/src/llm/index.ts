import type { ModelConfig } from "../config";
import { BedrockExtractionModel, createBedrockClient } from "./bedrock";
import type { ExtractionModel } from "./model";

// Picks the provider named in LLM_PROVIDER. Only Bedrock is implemented; another provider is
// a new ExtractionModel plus a case here.
export function createExtractionModel(config: ModelConfig): ExtractionModel {
  switch (config.provider) {
    case "bedrock":
      return new BedrockExtractionModel(config.modelId, createBedrockClient(config));
  }
}
