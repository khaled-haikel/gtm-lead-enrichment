import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config";
import { ConfigurationError, ProviderError } from "../errors";
import { FakeModel, VALID_EXTRACTION, enrichRequest } from "../testing/fake-model";
import { createEnrichHandler } from "./enrich-handler";

const TOKEN = "test-token-".padEnd(48, "x");

const CONFIG: Config = {
  enrichApiToken: TOKEN,
  model: {
    provider: "bedrock",
    modelId: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
    region: "us-east-1",
    accessKeyId: "test-access-key-id",
    secretAccessKey: "test-secret",
  },
};

function setup(outputs: unknown[] = [VALID_EXTRACTION], loadConfig: () => Config = () => CONFIG) {
  const model = new FakeModel(outputs);
  const POST = createEnrichHandler({ loadConfig, createModel: () => model });
  return { model, POST };
}

function post(body: unknown, authorization: string | null = `Bearer ${TOKEN}`): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization !== null) headers.set("authorization", authorization);
  return new Request("http://localhost/api/enrich", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// The code under test logs JSON lines; keep them out of the test output.
beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/enrich", () => {
  it("returns 200 with exactly the response shape from CLAUDE.md", async () => {
    const { POST } = setup();
    const res = await POST(post(enrichRequest()));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Object.keys(body)).toEqual(["leadId", "extraction", "evidence", "score", "usage"]);
    expect(Object.keys(body.evidence)).toEqual(["kept", "dropped"]);
    expect(Object.keys(body.score)).toEqual(["value", "tier", "reasons", "rulesVersion"]);
    expect(Object.keys(body.usage)).toEqual([
      "model",
      "inputTokens",
      "outputTokens",
      "costUsd",
      "latencyMs",
    ]);
    expect(body).toMatchObject({ leadId: "00Q000000000001AAA", score: { tier: "A", value: 90 } });
  });

  it("accepts null for optional fields, as Salesforce sends them", async () => {
    const { POST } = setup();
    const request = enrichRequest();
    const body = { ...request, lead: { ...request.lead, title: null, website: null }, websiteUrl: null };
    expect((await POST(post(body))).status).toBe(200);
  });

  describe("401", () => {
    it.each<[string, string | null]>([
      ["a missing token", null],
      ["a wrong token", `Bearer ${"y".repeat(48)}`],
      ["the wrong scheme", `Basic ${TOKEN}`],
    ])("on %s, without calling the model", async (_, authorization) => {
      const { model, POST } = setup();
      const res = await POST(post(enrichRequest(), authorization));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Missing or invalid bearer token" });
      expect(model.calls).toHaveLength(0);
    });
  });

  describe("400", () => {
    it("on a body that is not JSON", async () => {
      const { model, POST } = setup();
      const res = await POST(post("{not json"));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Request body is not valid JSON" });
      expect(model.calls).toHaveLength(0);
    });

    it.each<[string, unknown]>([
      ["no lead", { websiteText: "x" }],
      ["a lead without an id", { lead: { ...enrichRequest().lead, id: "" } }],
      ["an invalid email", { lead: { ...enrichRequest().lead, email: "not-an-email" } }],
      ["an unknown key", { ...enrichRequest(), tier: "A" }],
      ["websiteText that is not a string", { ...enrichRequest(), websiteText: 42 }],
      ["an array body", [enrichRequest()]],
    ])("on a malformed body: %s", async (_, body) => {
      const { model, POST } = setup();
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid request body");
      expect(json.details.length).toBeGreaterThan(0);
      expect(model.calls).toHaveLength(0);
    });
  });

  it("returns 422 with the issues when the model output fails twice", async () => {
    const { model, POST } = setup([{ company_type: "Retailer" }, { company_type: "Retailer" }]);
    const res = await POST(post(enrichRequest()));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Model output failed validation after one retry");
    expect(body.details).toEqual(expect.arrayContaining([expect.stringContaining("company_type")]));
    expect(model.calls).toHaveLength(2);
  });

  it("returns 502 on a provider error, without leaking its details", async () => {
    const { POST } = setup([new ProviderError("Bedrock request failed: AccessDeniedException")]);
    const res = await POST(post(enrichRequest()));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Model provider error" });
  });

  it("returns 500 when the service is misconfigured, before checking the token", async () => {
    const { POST } = setup(undefined, () => {
      throw new ConfigurationError("Invalid configuration: ENRICH_API_TOKEN is required");
    });
    const res = await POST(post(enrichRequest()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Service is misconfigured" });
  });

  it("returns 500 for an unexpected error", async () => {
    const { POST } = setup([new Error("bug")]);
    const res = await POST(post(enrichRequest()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });
});
