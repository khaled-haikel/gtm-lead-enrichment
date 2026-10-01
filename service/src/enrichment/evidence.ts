// Checks the model's creator signals against the website text. A signal survives only if its
// quote really appears on the page; the model saying so is not evidence.

import type { CreatorSignal, Extraction } from "./contract";

// Shorter quotes ("our team") appear on almost any page, so they prove nothing.
export const MIN_QUOTE_WORDS = 4;

export const DROP_REASONS = {
  noWebsiteText: "no website text to check against",
  tooShort: "quote too short to count as evidence",
  notFound: "quote not found in website text",
} as const;

export type DropReason = (typeof DROP_REASONS)[keyof typeof DROP_REASONS];
export type DroppedSignal = CreatorSignal & { reason: DropReason };
export type Evidence = { kept: CreatorSignal[]; dropped: DroppedSignal[] };

// Makes text comparable regardless of how it was typeset: NFKC (ligatures, full-width forms,
// non-breaking spaces), straight quotes for curly ones, a hyphen for every dash, every
// whitespace run collapsed to one space, trimmed and lowercased.
export function normalise(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Counts tokens with at least one letter or digit, so a lone dash or "&" is not a word.
export function countWords(normalised: string): number {
  return normalised.split(" ").filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

export function checkEvidence(extraction: Extraction, websiteText: string | undefined): Evidence {
  const page = normalise(websiteText ?? "");
  const kept: CreatorSignal[] = [];
  const dropped: DroppedSignal[] = [];

  for (const { signal, quote } of extraction.creator_signals) {
    const needle = normalise(quote);
    const reason =
      page === ""
        ? DROP_REASONS.noWebsiteText
        : countWords(needle) < MIN_QUOTE_WORDS
          ? DROP_REASONS.tooShort
          : page.includes(needle)
            ? undefined
            : DROP_REASONS.notFound;

    if (reason) dropped.push({ signal, quote, reason });
    else kept.push({ signal, quote });
  }

  return { kept, dropped };
}
