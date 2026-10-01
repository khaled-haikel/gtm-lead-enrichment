// The contract for what the model extracts from a company's website. The model only reports
// facts; scoring decides what they are worth (see scoring.ts).

import { z } from "zod";
import { INDUSTRIES } from "./industries";

export const COMPANY_TYPES = ["Brand", "Agency", "Platform", "Other", "Unknown"] as const;
export const EMPLOYEE_BANDS = [
  "1-10",
  "11-50",
  "51-200",
  "201-1000",
  "1001-5000",
  "5000+",
  "Unknown",
] as const;
export const INDUSTRY_VALUES = [...INDUSTRIES, "Unknown"] as const;
export const SELLS_TO = ["consumers", "businesses", "both", "unknown"] as const;
export const CREATOR_SIGNALS = [
  "has_creator_program",
  "mentions_influencers",
  "mentions_ugc",
  "mentions_affiliate",
  "mentions_social_commerce",
] as const;

export const MAX_CREATOR_SIGNALS = 5;
export const MAX_QUOTE_LENGTH = 200;
export const MAX_SUMMARY_LENGTH = 400;

// Strict objects: unknown keys (a "tier" or "score" from the model, for example) fail
// validation instead of being passed along.
export const creatorSignalSchema = z.strictObject({
  signal: z.enum(CREATOR_SIGNALS),
  quote: z.string().max(MAX_QUOTE_LENGTH),
});

export const extractionSchema = z.strictObject({
  company_type: z.enum(COMPANY_TYPES),
  employee_band: z.enum(EMPLOYEE_BANDS),
  industry: z.enum(INDUSTRY_VALUES),
  sells_to: z.enum(SELLS_TO),
  creator_signals: z.array(creatorSignalSchema).max(MAX_CREATOR_SIGNALS),
  summary: z.string().max(MAX_SUMMARY_LENGTH),
});

export type CreatorSignal = z.infer<typeof creatorSignalSchema>;
export type Extraction = z.infer<typeof extractionSchema>;

// JSON Schema form of the contract, for the provider's tool definition. Tool schemas do not
// need the "$schema" key, so it is left out; the model's output is still validated with zod.
const jsonSchema = z.toJSONSchema(extractionSchema);
delete jsonSchema.$schema;
export const extractionJsonSchema = jsonSchema;
