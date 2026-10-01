import { describe, expect, it } from "vitest";
import type { CreatorSignal, Extraction } from "./contract";
import { DROP_REASONS, MIN_QUOTE_WORDS, checkEvidence, countWords, normalise } from "./evidence";

const WEBSITE_TEXT = `
  Welcome to Acme Goods.

  Join our   Creator
  Program\tand earn commission on every sale.
  Tag us\u00A0#AcmeGoods to be featured on our page.
`;

// The same kind of page as a CMS typesets it: curly quotes, dashes, a ligature, a full-width
// "@" and non-breaking spaces.
const TYPESET_TEXT =
  "We\u2019re building a \u201Ccreator\u201D collective \u2014 apply today.\n" +
  "Find your \uFB01rst brand deal with us.\u00A0Free\u202Fshipping on orders\u2013today.\n" +
  "Follow \uFF20acmegoods for weekly drops.";

function withSignals(...creatorSignals: CreatorSignal[]): Extraction {
  return {
    company_type: "Brand",
    employee_band: "51-200",
    industry: "Retail",
    sells_to: "consumers",
    creator_signals: creatorSignals,
    summary: "Online goods store.",
  };
}

const real: CreatorSignal = {
  signal: "has_creator_program",
  quote: "Join our Creator Program and earn commission",
};
const invented: CreatorSignal = {
  signal: "mentions_influencers",
  quote: "We partner with 500 influencers",
};

describe("normalise", () => {
  it("collapses whitespace runs, trims and lowercases", () => {
    expect(normalise("  Join\n\tOUR\u00A0 Creator  ")).toBe("join our creator");
  });

  it.each<[string, string, string]>([
    ["curly single quotes and apostrophes", "\u2018It\u2019s\u2019 \u201Aok\u201B", "'it's' 'ok'"],
    ["curly double quotes", "\u201CHi\u201D \u201Elow\u201F", '"hi" "low"'],
    ["en dashes", "2019\u20132024", "2019-2024"],
    ["em dashes", "brands\u2014and creators", "brands-and creators"],
    ["other dash characters", "a\u2010b\u2011c\u2012d\u2015e", "a-b-c-d-e"],
    ["non-breaking and narrow spaces", "a\u00A0b\u202Fc\u2007d", "a b c d"],
    ["ligatures (NFKC)", "\uFB01nd \uFB02ow", "find flow"],
    ["full-width forms (NFKC)", "\uFF23\uFF32\uFF25\uFF21\uFF34\uFF2F\uFF32 \uFF20x", "creator @x"],
  ])("normalises %s", (_, input, expected) => {
    expect(normalise(input)).toBe(expected);
  });
});

describe("countWords", () => {
  it.each<[string, number]>([
    ["", 0],
    ["join our creator program", 4],
    ["tag - us & now", 3],
    ["we're 100% in", 3],
    ["\u00E9t\u00E9 \u00E0 paris", 3],
  ])("counts %j as %i words", (text, words) => {
    expect(countWords(text)).toBe(words);
  });
});

describe("checkEvidence", () => {
  it("keeps a quote that appears in the website text", () => {
    expect(checkEvidence(withSignals(real), WEBSITE_TEXT)).toEqual({ kept: [real], dropped: [] });
  });

  it("drops a quote the website does not contain, with a reason", () => {
    expect(checkEvidence(withSignals(invented), WEBSITE_TEXT)).toEqual({
      kept: [],
      dropped: [{ ...invented, reason: DROP_REASONS.notFound }],
    });
  });

  it("matches across line breaks, tabs, repeated and non-breaking spaces in the page", () => {
    const signal: CreatorSignal = { signal: "mentions_ugc", quote: "Tag us #AcmeGoods to be featured" };
    expect(checkEvidence(withSignals(signal), WEBSITE_TEXT).kept).toEqual([signal]);
  });

  it("matches regardless of case", () => {
    const signal: CreatorSignal = {
      signal: "has_creator_program",
      quote: "JOIN OUR CREATOR PROGRAM",
    };
    expect(checkEvidence(withSignals(signal), WEBSITE_TEXT).kept).toEqual([signal]);
  });

  it("normalises the quote too, but returns it as the model wrote it", () => {
    const signal: CreatorSignal = {
      signal: "has_creator_program",
      quote: "  join OUR\ncreator   program ",
    };
    expect(checkEvidence(withSignals(signal), WEBSITE_TEXT).kept).toEqual([signal]);
  });

  it("does not accept a quote that is only close to the text", () => {
    const close: CreatorSignal = { signal: "has_creator_program", quote: "Join our creators program" };
    expect(checkEvidence(withSignals(close), WEBSITE_TEXT).dropped).toEqual([
      { ...close, reason: DROP_REASONS.notFound },
    ]);
  });

  describe("typeset text", () => {
    it.each<[string, string]>([
      ["straight quotes against curly ones on the page", "We're building a \"creator\" collective"],
      ["a hyphen against an em dash on the page", 'a "creator" collective - apply today'],
      ["an em dash against an en dash on the page", "Free shipping on orders\u2014today"],
      ["plain letters against a ligature on the page", "Find your first brand deal"],
      ["a plain @ against a full-width one on the page", "Follow @acmegoods for weekly drops"],
      ["regular spaces against non-breaking ones on the page", "with us. Free shipping on"],
    ])("matches %s", (_, quote) => {
      const signal: CreatorSignal = { signal: "has_creator_program", quote };
      expect(checkEvidence(withSignals(signal), TYPESET_TEXT)).toEqual({ kept: [signal], dropped: [] });
    });

    it("matches a curly quote from the model against straight quotes on the page", () => {
      const page = "We're hiring creators for our summer campaign.";
      const signal: CreatorSignal = { signal: "has_creator_program", quote: "We\u2019re hiring creators for" };
      expect(checkEvidence(withSignals(signal), page).kept).toEqual([signal]);
    });
  });

  describe("minimum quote length", () => {
    it(`requires ${MIN_QUOTE_WORDS} words`, () => {
      expect(MIN_QUOTE_WORDS).toBe(4);
    });

    it("drops a three-word quote even though the page contains it", () => {
      const short: CreatorSignal = { signal: "has_creator_program", quote: "Join our Creator" };
      expect(checkEvidence(withSignals(short), WEBSITE_TEXT)).toEqual({
        kept: [],
        dropped: [{ ...short, reason: "quote too short to count as evidence" }],
      });
    });

    it("keeps a four-word quote", () => {
      const four: CreatorSignal = { signal: "has_creator_program", quote: "Join our Creator Program" };
      expect(checkEvidence(withSignals(four), WEBSITE_TEXT).kept).toEqual([four]);
    });

    it("does not count punctuation as words", () => {
      const padded: CreatorSignal = { signal: "has_creator_program", quote: "collective \u2014 apply today" };
      expect(checkEvidence(withSignals(padded), TYPESET_TEXT).dropped).toEqual([
        { ...padded, reason: DROP_REASONS.tooShort },
      ]);
    });

    it.each(["", "   ", "\n\t"])("drops an empty quote (%j), which any text would contain", (quote) => {
      const empty: CreatorSignal = { signal: "mentions_affiliate", quote };
      expect(checkEvidence(withSignals(empty), WEBSITE_TEXT)).toEqual({
        kept: [],
        dropped: [{ ...empty, reason: DROP_REASONS.tooShort }],
      });
    });
  });

  it.each<[string, string | undefined]>([
    ["empty", ""],
    ["whitespace only", " \n\t\u00A0 "],
    ["missing", undefined],
  ])("drops every signal when the website text is %s", (_, text) => {
    expect(checkEvidence(withSignals(real, invented), text)).toEqual({
      kept: [],
      dropped: [
        { ...real, reason: DROP_REASONS.noWebsiteText },
        { ...invented, reason: DROP_REASONS.noWebsiteText },
      ],
    });
  });

  it("keeps and drops in one pass, preserving order", () => {
    const second: CreatorSignal = { signal: "mentions_ugc", quote: "featured on our page" };
    const result = checkEvidence(withSignals(invented, real, second), WEBSITE_TEXT);
    expect(result.kept).toEqual([real, second]);
    expect(result.dropped).toEqual([{ ...invented, reason: DROP_REASONS.notFound }]);
  });

  it("returns empty lists when the model reported no signals", () => {
    expect(checkEvidence(withSignals(), WEBSITE_TEXT)).toEqual({ kept: [], dropped: [] });
  });

  it("does not modify the extraction", () => {
    const extraction = withSignals(real, invented);
    const before = structuredClone(extraction);
    const result = checkEvidence(extraction, WEBSITE_TEXT);
    expect(extraction).toEqual(before);
    expect(result.kept[0]).not.toBe(extraction.creator_signals[0]);
  });
});
