import { describe, expect, it } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import { averageTurnOutputTokensPerSecond, defineExtension, extensionRegistry } from "./index.ts";

describe("extension registry", () => {
  const make = (id: string, order = 0) =>
    defineExtension({
      id,
      title: id,
      order,
      icon: "workflow",
      load: async () => ({ default: () => null }),
    });
  it("rejects duplicate and reserved IDs without loading screens", () => {
    expect(() => extensionRegistry([make("issues"), make("issues")])).toThrow("Duplicate");
    expect(() => make("more")).toThrow("Invalid");
    expect(() => make("../outside")).toThrow("Invalid");
  });
  it("preserves registration order within a menu position", () => {
    expect(
      extensionRegistry([make("issues", 2), make("workflow"), make("metrics")]).map(
        (item) => item.id,
      ),
    ).toEqual(["workflow", "metrics", "issues"]);
  });
});

describe("turn average output rate", () => {
  const start = DateTime.makeUnsafe("2026-01-01T00:00:00Z");
  const end = DateTime.makeUnsafe("2026-01-01T00:00:02Z");
  const complete = {
    usageStatus: "complete",
    usageScope: "main_agent",
    inputTokens: 20,
    outputTokens: 100,
    hasSubagents: false,
  } as const;
  it("uses complete per-turn output and total turn duration", () => {
    expect(
      averageTurnOutputTokensPerSecond({
        startedAt: start,
        completedAt: end,
        turnTokenUsage: complete,
      }),
    ).toBe(50);
  });
  it("does not substitute partial or cumulative usage", () => {
    expect(averageTurnOutputTokensPerSecond({ startedAt: start, completedAt: end })).toBeNull();
    expect(
      averageTurnOutputTokensPerSecond({
        startedAt: start,
        completedAt: end,
        turnTokenUsage: { ...complete, usageStatus: "partial" },
      }),
    ).toBeNull();
    expect(
      averageTurnOutputTokensPerSecond({
        startedAt: start,
        completedAt: start,
        turnTokenUsage: complete,
      }),
    ).toBeNull();
    expect(
      averageTurnOutputTokensPerSecond({
        startedAt: end,
        completedAt: start,
        turnTokenUsage: complete,
      }),
    ).toBeNull();
  });
});

it("keeps provider turns separate rather than averaging cumulative totals", () => {
  const first = {
    startedAt: { epochMilliseconds: 0 },
    completedAt: { epochMilliseconds: 1000 },
    turnTokenUsage: { usageStatus: "complete" as const, outputTokens: 20 },
  };
  const second = {
    ...first,
    completedAt: { epochMilliseconds: 2000 },
    turnTokenUsage: { usageStatus: "complete" as const, outputTokens: 30 },
  };
  expect([first, second].map(averageTurnOutputTokensPerSecond)).toEqual([20, 15]);
  expect(averageTurnOutputTokensPerSecond({ ...first, startedAt: null })).toBeNull();
});
