import { describe, expect, it } from "vitest";
import { CREATOR_SIGNALS, type CreatorSignal, type Extraction } from "./contract";
import { type Evidence, checkEvidence } from "./evidence";
import { RULES_VERSION, SCORING, type Tier, scoreLead, tierFor } from "./scoring";

// An extraction on which no rule fires.
const NOTHING: Extraction = {
  company_type: "Unknown",
  employee_band: "Unknown",
  industry: "Unknown",
  sells_to: "unknown",
  creator_signals: [],
  summary: "",
};

const NO_EVIDENCE: Evidence = { kept: [], dropped: [] };

// Evidence with `count` kept signals, each of a different type (up to 5).
function keptSignals(count: number): Evidence {
  const kept: CreatorSignal[] = Array.from({ length: count }, (_, i) => ({
    signal: CREATOR_SIGNALS[i % CREATOR_SIGNALS.length],
    quote: `quote ${i}`,
  }));
  return { kept, dropped: [] };
}

function score(overrides: Partial<Extraction>, evidence: Evidence = NO_EVIDENCE) {
  return scoreLead({ ...NOTHING, ...overrides }, evidence);
}

describe("scoreLead", () => {
  it("stamps the rules version", () => {
    expect(RULES_VERSION).toBe("2026.10.1");
    expect(score({}).rulesVersion).toBe("2026.10.1");
  });

  it("scores 0, tier C, with no reasons when no rule fires", () => {
    expect(score({})).toEqual({ value: 0, tier: "C", reasons: [], rulesVersion: RULES_VERSION });
  });

  describe("company_type", () => {
    it.each<[Extraction["company_type"], number]>([
      ["Brand", 30],
      ["Agency", 25],
      ["Platform", 10],
    ])("%s adds %i", (companyType, points) => {
      const result = score({ company_type: companyType });
      expect(result.value).toBe(points);
      expect(result.reasons).toEqual([`${companyType} (+${points})`]);
    });

    it.each<Extraction["company_type"]>(["Other", "Unknown"])("%s adds nothing", (companyType) => {
      expect(score({ company_type: companyType })).toMatchObject({ value: 0, reasons: [] });
    });
  });

  describe("sells_to", () => {
    it.each<[Extraction["sells_to"], string]>([
      ["consumers", "Sells to consumers (+20)"],
      ["both", "Sells to consumers and businesses (+20)"],
    ])("%s adds 20", (sellsTo, reason) => {
      expect(score({ sells_to: sellsTo })).toMatchObject({ value: 20, reasons: [reason] });
    });

    it.each<Extraction["sells_to"]>(["businesses", "unknown"])("%s adds nothing", (sellsTo) => {
      expect(score({ sells_to: sellsTo })).toMatchObject({ value: 0, reasons: [] });
    });
  });

  describe("employee_band", () => {
    it.each<[Extraction["employee_band"], number]>([
      ["51-200", 10],
      ["201-1000", 20],
      ["1001-5000", 20],
      ["5000+", 20],
    ])("%s adds %i", (band, points) => {
      expect(score({ employee_band: band })).toMatchObject({
        value: points,
        reasons: [`${band} employees (+${points})`],
      });
    });

    it.each<Extraction["employee_band"]>(["1-10", "11-50", "Unknown"])(
      "%s adds nothing",
      (band) => {
        expect(score({ employee_band: band })).toMatchObject({ value: 0, reasons: [] });
      },
    );
  });

  describe("creator signals", () => {
    it.each<[number, number, string]>([
      [1, 10, "1 creator signal (+10)"],
      [2, 20, "2 creator signals (+20)"],
      [3, 30, "3 creator signals (+30)"],
      [4, 30, "4 creator signals (+30, capped)"],
      [5, 30, "5 creator signals (+30, capped)"],
    ])("%i kept adds %i", (count, points, reason) => {
      expect(score({}, keptSignals(count))).toMatchObject({ value: points, reasons: [reason] });
    });

    it("caps at the configured maximum", () => {
      expect(SCORING.creatorSignalsCap).toBe(30);
      expect(score({}, keptSignals(5)).value).toBe(SCORING.creatorSignalsCap);
    });

    const quote = (signal: CreatorSignal["signal"], n: number): CreatorSignal => ({
      signal,
      quote: `${signal} quote number ${n}`,
    });

    it("counts several quotes for the same signal type once", () => {
      const evidence: Evidence = {
        kept: [
          quote("mentions_influencers", 1),
          quote("mentions_influencers", 2),
          quote("mentions_influencers", 3),
        ],
        dropped: [],
      };
      expect(score({}, evidence)).toMatchObject({ value: 10, reasons: ["1 creator signal (+10)"] });
    });

    it("counts distinct types when some repeat", () => {
      const evidence: Evidence = {
        kept: [
          quote("mentions_ugc", 1),
          quote("mentions_affiliate", 1),
          quote("mentions_ugc", 2),
          quote("mentions_affiliate", 2),
          quote("mentions_ugc", 3),
        ],
        dropped: [],
      };
      expect(score({}, evidence)).toMatchObject({ value: 20, reasons: ["2 creator signals (+20)"] });
    });
  });

  it("adds the rules up, with one reason per rule in a fixed order", () => {
    const result = score(
      { company_type: "Brand", sells_to: "both", employee_band: "5000+" },
      keptSignals(3),
    );
    expect(result).toEqual({
      value: 100,
      tier: "A",
      reasons: [
        "Brand (+30)",
        "Sells to consumers and businesses (+20)",
        "5000+ employees (+20)",
        "3 creator signals (+30)",
      ],
      rulesVersion: RULES_VERSION,
    });
  });

  it("is deterministic and does not modify its inputs", () => {
    const extraction = Object.freeze({ ...NOTHING, company_type: "Agency" as const });
    const evidence = Object.freeze(keptSignals(2));
    expect(scoreLead(extraction, evidence)).toEqual(scoreLead(extraction, evidence));
  });
});

describe("tiers", () => {
  // With the current weights, 39 and 69 cannot be reached by any extraction, so the exact
  // boundaries are tested on tierFor and the reachable neighbours through scoreLead.
  it.each<[number, Tier]>([
    [0, "C"],
    [39, "C"],
    [40, "B"],
    [69, "B"],
    [70, "A"],
    [100, "A"],
  ])("%i is tier %s", (value, tier) => {
    expect(tierFor(value)).toBe(tier);
  });

  it.each<[string, Partial<Extraction>, number, Tier]>([
    ["Agency, 51-200", { company_type: "Agency", employee_band: "51-200" }, 35, "C"],
    ["Brand, 51-200", { company_type: "Brand", employee_band: "51-200" }, 40, "B"],
    [
      "Agency, consumers, 201-1000",
      { company_type: "Agency", sells_to: "consumers", employee_band: "201-1000" },
      65,
      "B",
    ],
    [
      "Brand, consumers, 201-1000",
      { company_type: "Brand", sells_to: "consumers", employee_band: "201-1000" },
      70,
      "A",
    ],
  ])("%s scores %i, tier %s", (_, overrides, value, tier) => {
    expect(score(overrides)).toMatchObject({ value, tier });
  });
});

describe("evidence and scoring together", () => {
  const websiteText = "Join our creator program. Tag us to be featured.";
  const extraction: Extraction = {
    ...NOTHING,
    company_type: "Brand",
    creator_signals: [
      { signal: "has_creator_program", quote: "Join our creator program" },
      { signal: "mentions_influencers", quote: "We work with 300 influencers" },
      { signal: "mentions_affiliate", quote: "Earn 20% with our affiliate program" },
    ],
  };

  it("does not count signals the evidence check dropped", () => {
    const evidence = checkEvidence(extraction, websiteText);
    expect(evidence.kept).toHaveLength(1);
    expect(evidence.dropped).toHaveLength(2);
    expect(scoreLead(extraction, evidence)).toMatchObject({
      value: 40,
      reasons: ["Brand (+30)", "1 creator signal (+10)"],
    });
  });

  it("counts no signals at all when there is no website text", () => {
    const evidence = checkEvidence(extraction, undefined);
    expect(scoreLead(extraction, evidence)).toMatchObject({ value: 30, reasons: ["Brand (+30)"] });
  });

  it("never reads creator_signals from the extraction itself", () => {
    expect(scoreLead(extraction, NO_EVIDENCE)).toMatchObject({ value: 30, reasons: ["Brand (+30)"] });
  });
});

describe("extra keys", () => {
  it("ignores a tier or score smuggled into the extraction", () => {
    const base: Extraction = { ...NOTHING, company_type: "Platform" };
    const smuggled = { ...base, tier: "A", score: 100, value: 100 } as unknown as Extraction;
    const result = scoreLead(smuggled, NO_EVIDENCE);
    expect(result).toEqual(scoreLead(base, NO_EVIDENCE));
    expect(result).toMatchObject({ value: 10, tier: "C" });
  });
});
