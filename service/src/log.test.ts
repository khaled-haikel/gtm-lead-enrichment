import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "./log";

const NOW = "2026-01-01T00:00:00.000Z";

// Runs fn and returns the one JSON line it wrote to stdout.
function captureLine(fn: () => void): Record<string, unknown> {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  fn();
  expect(write).toHaveBeenCalledTimes(1);
  const line = String(write.mock.calls[0][0]);
  expect(line.endsWith("\n")).toBe(true);
  return JSON.parse(line);
}

const circular: Record<string, unknown> = {};
circular.self = circular;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("log", () => {
  it("keeps message, stack and cause when serializing errors", () => {
    const cause = new TypeError("socket closed");
    const err = new Error("provider failed", { cause });

    const entry = captureLine(() => log.error("enrich failed", { err }));

    expect(entry.err).toEqual({
      name: "Error",
      message: "provider failed",
      stack: err.stack,
      cause: { name: "TypeError", message: "socket closed", stack: cause.stack },
    });
  });

  it("does not let fields overwrite time, level or msg", () => {
    const entry = captureLine(() =>
      log.warn("rate limited", { time: 0, level: "debug", msg: "other", leadId: "L1" }),
    );

    expect(entry).toEqual({ time: NOW, level: "warn", msg: "rate limited", leadId: "L1" });
  });

  it.each([
    ["a circular reference", { circular }],
    ["a BigInt", { count: BigInt(10) }],
  ])("does not throw on %s", (_, fields) => {
    const entry = captureLine(() => {
      expect(() => log.info("odd data", fields)).not.toThrow();
    });

    expect(entry).toEqual({
      time: NOW,
      level: "info",
      msg: "odd data",
      logError: expect.any(String),
    });
  });
});
