// Offline checks for the registry renderer options used by live fragment readers.
import { describe, expect, it } from "vitest";
import { registryMessageOf } from "./helpers/load-row-harness";

describe("registryMessageOf live-fragment guards", () => {
  const code = "fixture";
  const page = "fixture-registry.md";

  it("keeps single replacement by default and replaces every occurrence when requested", () => {
    const rows = [{ code, message: "<name> / <name>" }];
    const fills = [["<name>", "value"]] as const;
    expect(registryMessageOf(rows, page, code, fills)).toBe("value / <name>");
    expect(registryMessageOf(rows, page, code, fills, {
      replaceAll: true,
      unfilledPattern: /<[a-z]+>/,
    })).toBe("value / value");
  });

  it("retains ordered substitution and JavaScript replacement-string semantics", () => {
    expect(registryMessageOf(
      [{ code, message: "<first> / <second>" }], page, code,
      [["<first>", "<second>"], ["<second>", "$$"]],
      { replaceAll: true, unfilledPattern: /<[a-z]+>/ },
    )).toBe("$ / $");
  });

  it("rejects an absent row and an absent fill slot", () => {
    expect(() => registryMessageOf([], page, code)).toThrow(page);
    expect(() => registryMessageOf(
      [{ code, message: "unchanged" }], page, code, [["<name>", "value"]],
    )).toThrow("must carry the <name> placeholder");
  });

  it.each([
    ["<new>", /<[a-z]+>/],
    ["<new-slot>", /<[a-z-]+>/],
    ["<X>", /<[a-zA-Z]+>/],
    ["<X-2>", /<[a-zA-Z][a-zA-Z0-9-]*>/],
  ])("rejects the caller's unfilled placeholder %s even with no fills", (message, unfilledPattern) => {
    expect(() => registryMessageOf(
      [{ code, message }], page, code, [], { unfilledPattern },
    )).toThrow("an unsubstituted placeholder remains");
  });

  it("checks the filled result while leaving the drift guard opt-in for other readers", () => {
    const rows = [{ code, message: "got <actual>" }];
    const fills = [["<actual>", "array<string>"]] as const;
    expect(registryMessageOf(rows, page, code, fills)).toBe("got array<string>");
    expect(() => registryMessageOf(rows, page, code, fills, {
      unfilledPattern: /<[a-z]+>/,
    })).toThrow("an unsubstituted placeholder remains");
    expect(registryMessageOf(rows, page, code, [["<actual>", "array<T>"]], {
      unfilledPattern: /<[a-z]+>/,
    })).toBe("got array<T>");
  });
});
