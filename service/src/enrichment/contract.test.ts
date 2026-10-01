import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPANY_TYPES,
  CREATOR_SIGNALS,
  EMPLOYEE_BANDS,
  INDUSTRY_VALUES,
  SELLS_TO,
  extractionJsonSchema,
  extractionSchema,
} from "./contract";

const FIELDS = [
  "company_type",
  "employee_band",
  "industry",
  "sells_to",
  "creator_signals",
  "summary",
] as const;

function valid() {
  return {
    company_type: "Brand",
    employee_band: "201-1000",
    industry: "Apparel",
    sells_to: "consumers",
    creator_signals: [{ signal: "has_creator_program", quote: "Join our creator program" }],
    summary: "Athletic apparel brand with an ambassador program.",
  };
}

function accepts(input: unknown): boolean {
  return extractionSchema.safeParse(input).success;
}

function signals(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    signal: CREATOR_SIGNALS[i % CREATOR_SIGNALS.length],
    quote: `quote ${i}`,
  }));
}

describe("extractionSchema", () => {
  it("accepts a valid extraction and returns it unchanged", () => {
    const input = valid();
    expect(extractionSchema.parse(input)).toEqual(input);
  });

  it("accepts an extraction where nothing is known", () => {
    expect(
      accepts({
        company_type: "Unknown",
        employee_band: "Unknown",
        industry: "Unknown",
        sells_to: "unknown",
        creator_signals: [],
        summary: "",
      }),
    ).toBe(true);
  });

  it("accepts every allowed value of each enum field", () => {
    for (const value of COMPANY_TYPES) expect(accepts({ ...valid(), company_type: value })).toBe(true);
    for (const value of EMPLOYEE_BANDS) expect(accepts({ ...valid(), employee_band: value })).toBe(true);
    for (const value of INDUSTRY_VALUES) expect(accepts({ ...valid(), industry: value })).toBe(true);
    for (const value of SELLS_TO) expect(accepts({ ...valid(), sells_to: value })).toBe(true);
    expect(accepts({ ...valid(), creator_signals: signals(CREATOR_SIGNALS.length) })).toBe(true);
  });

  it.each<[string, unknown]>([
    ["company_type", "Retailer"],
    ["company_type", "brand"],
    ["employee_band", "200-1000"],
    ["employee_band", 500],
    ["industry", "Software"],
    ["industry", "unknown"],
    ["sells_to", "everyone"],
    ["sells_to", "Consumers"],
    ["creator_signals", "has_creator_program"],
    ["creator_signals", {}],
    ["summary", 42],
    ["summary", "x".repeat(401)],
  ])("rejects %s = %j", (field, value) => {
    expect(accepts({ ...valid(), [field]: value })).toBe(false);
  });

  it.each(FIELDS)("rejects a missing %s", (field) => {
    const input: Record<string, unknown> = valid();
    delete input[field];
    expect(accepts(input)).toBe(false);
  });

  it.each(FIELDS)("rejects a null %s", (field) => {
    expect(accepts({ ...valid(), [field]: null })).toBe(false);
  });

  it("allows a summary of exactly 400 characters", () => {
    expect(accepts({ ...valid(), summary: "x".repeat(400) })).toBe(true);
  });

  describe("creator_signals", () => {
    it("allows 5 signals and rejects 6", () => {
      expect(accepts({ ...valid(), creator_signals: signals(5) })).toBe(true);
      expect(accepts({ ...valid(), creator_signals: signals(6) })).toBe(false);
    });

    it("allows a 200-character quote and rejects 201", () => {
      const withQuote = (quote: string) => ({
        ...valid(),
        creator_signals: [{ signal: "mentions_ugc", quote }],
      });
      expect(accepts(withQuote("q".repeat(200)))).toBe(true);
      expect(accepts(withQuote("q".repeat(201)))).toBe(false);
    });

    it.each<[string, unknown]>([
      ["an unknown signal", { signal: "mentions_tiktok", quote: "We love TikTok" }],
      ["a missing quote", { signal: "mentions_ugc" }],
      ["a missing signal", { quote: "Share your photos" }],
      ["a non-string quote", { signal: "mentions_ugc", quote: 7 }],
      ["an extra key", { signal: "mentions_ugc", quote: "Share your photos", weight: 10 }],
      ["a bare string", "mentions_ugc"],
    ])("rejects a signal with %s", (_, item) => {
      expect(accepts({ ...valid(), creator_signals: [item] })).toBe(false);
    });
  });

  it.each<[string, unknown]>([
    ["tier", "A"],
    ["score", 100],
    ["icp_score", 99],
  ])("rejects the extra key %s instead of passing it along", (key, value) => {
    const result = extractionSchema.safeParse({ ...valid(), [key]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.code)).toEqual(["unrecognized_keys"]);
  });
});

describe("extractionJsonSchema", () => {
  // A JSON round trip also proves the schema is plain JSON, as a tool definition must be.
  const schema = JSON.parse(JSON.stringify(extractionJsonSchema));

  it("has no $schema key, which tool definitions do not need", () => {
    expect(extractionJsonSchema).not.toHaveProperty("$schema");
    expect(schema).not.toHaveProperty("$schema");
  });

  it("is a strict object that requires every field", () => {
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual([...FIELDS]);
    expect(Object.keys(schema.properties)).toEqual([...FIELDS]);
  });

  it("lists the same enum values as the zod schema", () => {
    expect(schema.properties.company_type.enum).toEqual([...COMPANY_TYPES]);
    expect(schema.properties.employee_band.enum).toEqual([...EMPLOYEE_BANDS]);
    expect(schema.properties.industry.enum).toEqual([...INDUSTRY_VALUES]);
    expect(schema.properties.sells_to.enum).toEqual([...SELLS_TO]);
    expect(schema.properties.creator_signals.items.properties.signal.enum).toEqual([
      ...CREATOR_SIGNALS,
    ]);
  });

  it("carries the length and count limits", () => {
    const signal = schema.properties.creator_signals;
    expect(signal.maxItems).toBe(5);
    expect(signal.items.additionalProperties).toBe(false);
    expect(signal.items.required).toEqual(["signal", "quote"]);
    expect(signal.items.properties.quote.maxLength).toBe(200);
    expect(schema.properties.summary.maxLength).toBe(400);
  });
});

// The service writes these values into restricted picklists, which reject anything else.
describe("Salesforce picklists", () => {
  function picklist(field: string): string[] {
    const path = `../../../salesforce/force-app/main/default/objects/Lead/fields/${field}.field-meta.xml`;
    const xml = readFileSync(new URL(path, import.meta.url), "utf8");
    return [...xml.matchAll(/<value>\s*<fullName>([^<]+)<\/fullName>/g)].map((m) =>
      m[1].replaceAll("&amp;", "&"),
    );
  }

  it("Company_Type__c matches company_type", () => {
    expect(picklist("Company_Type__c")).toEqual([...COMPANY_TYPES]);
  });

  it("Employee_Band__c matches employee_band", () => {
    expect(picklist("Employee_Band__c")).toEqual([...EMPLOYEE_BANDS]);
  });

  it("Industry_Detected__c matches industry", () => {
    expect(picklist("Industry_Detected__c")).toEqual([...INDUSTRY_VALUES]);
  });
});
