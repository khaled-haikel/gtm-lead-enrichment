// Deterministic ICP scoring. The model supplies facts; these rules decide what they are worth.

import type { Extraction } from "./contract";
import type { Evidence } from "./evidence";

// Bump whenever a weight, threshold or rule changes, so stored scores stay explainable.
export const RULES_VERSION = "2026.10.1";

type ScoringConfig = {
  readonly companyType: Readonly<Partial<Record<Extraction["company_type"], number>>>;
  readonly sellsToConsumers: number;
  readonly employeeBand: Readonly<Partial<Record<Extraction["employee_band"], number>>>;
  readonly perCreatorSignal: number;
  readonly creatorSignalsCap: number;
  readonly tierA: number;
  readonly tierB: number;
};

export const SCORING: ScoringConfig = {
  companyType: { Brand: 30, Agency: 25, Platform: 10 },
  // Applies when sells_to is "consumers" or "both".
  sellsToConsumers: 20,
  employeeBand: { "51-200": 10, "201-1000": 20, "1001-5000": 20, "5000+": 20 },
  // Per distinct signal type among the kept signals.
  perCreatorSignal: 10,
  creatorSignalsCap: 30,
  // Tier A at tierA or more, B from tierB up to tierA, C below tierB.
  tierA: 70,
  tierB: 40,
};

export type Tier = "A" | "B" | "C";
export type Score = { value: number; tier: Tier; reasons: string[]; rulesVersion: string };

export function tierFor(value: number): Tier {
  if (value >= SCORING.tierA) return "A";
  if (value >= SCORING.tierB) return "B";
  return "C";
}

// Creator signals come only from evidence.kept: extraction.creator_signals is deliberately
// never read, so a signal the evidence check dropped cannot add points. Each distinct signal
// type counts once: three quotes for the same signal are one piece of evidence, not three.
export function scoreLead(extraction: Extraction, evidence: Evidence): Score {
  let value = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    value += points;
    reasons.push(reason);
  };

  const typePoints = SCORING.companyType[extraction.company_type];
  if (typePoints) add(typePoints, `${extraction.company_type} (+${typePoints})`);

  if (extraction.sells_to === "consumers") {
    add(SCORING.sellsToConsumers, `Sells to consumers (+${SCORING.sellsToConsumers})`);
  } else if (extraction.sells_to === "both") {
    add(
      SCORING.sellsToConsumers,
      `Sells to consumers and businesses (+${SCORING.sellsToConsumers})`,
    );
  }

  const bandPoints = SCORING.employeeBand[extraction.employee_band];
  if (bandPoints) add(bandPoints, `${extraction.employee_band} employees (+${bandPoints})`);

  const signals = new Set(evidence.kept.map((kept) => kept.signal)).size;
  if (signals > 0) {
    const uncapped = signals * SCORING.perCreatorSignal;
    const points = Math.min(uncapped, SCORING.creatorSignalsCap);
    const noun = signals === 1 ? "creator signal" : "creator signals";
    add(points, `${signals} ${noun} (+${points}${uncapped > points ? ", capped" : ""})`);
  }

  return { value, tier: tierFor(value), reasons, rulesVersion: RULES_VERSION };
}
