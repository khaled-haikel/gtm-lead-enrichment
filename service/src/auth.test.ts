import { describe, expect, it } from "vitest";
import { hasValidBearerToken } from "./auth";

const TOKEN = "a".repeat(40);

describe("hasValidBearerToken", () => {
  it("accepts the right token", () => {
    expect(hasValidBearerToken(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it("accepts the scheme in any case and trailing whitespace", () => {
    expect(hasValidBearerToken(`bearer ${TOKEN}  `, TOKEN)).toBe(true);
  });

  it.each<[string, string | null]>([
    ["a missing header", null],
    ["an empty header", ""],
    ["a wrong token", `Bearer ${"b".repeat(40)}`],
    ["a token that is a prefix", `Bearer ${TOKEN.slice(0, 39)}`],
    ["a token that is longer", `Bearer ${TOKEN}x`],
    ["a different scheme", `Basic ${TOKEN}`],
    ["a bare token", TOKEN],
    ["a token with a space inside", `Bearer ${TOKEN} extra`],
  ])("rejects %s", (_, header) => {
    expect(hasValidBearerToken(header, TOKEN)).toBe(false);
  });
});
