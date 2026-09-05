import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// b0456 — the src/parser/imports.ts citation-content-anchor gate.
//
// Bug 0456 (docs/bugs/0456-imports-and-lpa-stale-line-cites.md) records that
// src/parser/imports.ts was grown by six fixes since fifteen line-citations
// into it were written (most recently 6619f85d +17 and f8eb6286 +8, the two
// shifts that moved `checkImportDanglingAlias` from the cited line 437 to line 462).
// Every one of those cites now names a line holding a DIFFERENT construct than
// the citing sentence describes — including one assertion message
// (import-export-from-clause-required.test.ts:650) a future red would hand its
// debugger. Separately, bug 0421's carved-out LPA cite (grammar.md:175 → grammar.md:184)
// survives in the line-pinned live-production-acceptance.test.ts at line 2342.
//
// WHY content-anchored (the 0405/0421 shape, inverted target): the bug's fix is
// a mechanical re-pin of the citing COMMENT/MESSAGE strings only — imports.ts
// and grammar.md do NOT move. So this gate locates each named construct by
// CONTENT in the cited source, and for each test-file cite reads the line the
// cite currently points at and asserts it holds the construct the sentence
// names. At the fork the stale numbers point at the wrong content (RED); after
// the re-pin the numbers point at the current content (GREEN); and any FUTURE
// imports.ts insertion that moves a construct without re-sweeping the cite reds
// here first, before the drift compounds silently again.
//
// Cell groups:
//   TRUTH-ANCHOR (green now AND after the fix) — locate each construct by
//     content in src/parser/imports.ts and pin its line; assert the STALE cited
//     line does NOT hold that construct. These are the fact base proving the
//     cites lie, and they guard the truth numbers the RED cells re-pin toward.
//     imports.ts is untouched by the fix, so they never flip.
//   CONTENT-ANCHOR (RED now, GREEN after) — for each test-file cite, extract the
//     line number the cite currently carries, read that line of imports.ts, and
//     assert it holds the named construct. Stale cite → wrong content → RED.
//   FRESHNESS (RED now, GREEN after) — the literal stale `imports.ts:<N>` token
//     is ABSENT. This is the cell the mechanical re-pin turns green.
//   LPA (RED now, GREEN after) — read-only on the line-pinned LPA: its line-2342
//     cite must read `(grammar.md:184)` (AliasRhs) and no longer `(grammar.md:175)`
//     (the statement-in-arm-body prose). This gate NEVER edits the LPA.

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so an
 * absent source cannot let a cell pass vacuously (the b0405/b0421 readCorpus
 * pattern this file mirrors; CLAUDE.md "no silent test skipping").
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a source this gate scores for the bug 0456 imports.ts / LPA cite sweep — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}

/** Line splitting tolerates a CRLF terminator; imports.ts and the test files are LF. */
const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);

const IMPORTS = "src/parser/imports.ts";
const GRAMMAR = "docs/spec_topics/grammar.md";
const LPA = "tests/live/live-production-acceptance.test.ts";
const LIST = "tests/import-specifier-list-production-required.test.ts";
const SEP = "tests/import-specifier-separator-production-required.test.ts";
const FROM = "tests/import-export-from-clause-required.test.ts";
const INLINE = "tests/inline-slug-name-reservation.test.ts";
const REEXPORT = "tests/reexport-chain-resolution.test.ts";

/**
 * The 1-based line of `file` where exactly one line matches `matches`. Zero or
 * many is a loud harness failure: a construct this gate anchors on moved out from
 * under a cell, so it must fail rather than score vacuously.
 */
function uniqueLine(file: string, what: string, matches: (line: string) => boolean): number {
  const lines = linesOf(readCorpus(file));
  const hits: number[] = [];
  lines.forEach((line, index) => {
    if (matches(line)) hits.push(index + 1);
  });
  if (hits.length !== 1) {
    throw new Error(
      `harness precondition unmet: ${file} carries ${hits.length} lines matching the ${what}, expected exactly one${hits.length > 1 ? ` (lines ${hits.join(", ")})` : ""} — bug 0456 names this construct as a cite target, so a cell that cannot locate it must fail loudly`,
    );
  }
  return hits[0] as number;
}

/** The 1-based `n`th line of `file`, or a loud failure if `n` is out of range. */
function lineOf(file: string, n: number): string {
  const lines = linesOf(readCorpus(file));
  if (n < 1 || n > lines.length) {
    throw new Error(
      `harness precondition unmet: ${file} has ${lines.length} lines; cite names line ${n}, out of range — a cite pointing past EOF is a loud failure, not a skip`,
    );
  }
  return lines[n - 1] as string;
}

/**
 * Every distinct number captured by `re` (a global regex whose group 1 is the
 * cited line number) over `src`. Zero matches is a loud failure: the citing
 * sentence changed shape, so the cell cannot score and must not pass vacuously.
 */
function citedNumbers(file: string, what: string, src: string, re: RegExp): number[] {
  const out: number[] = [];
  for (const m of src.matchAll(re)) {
    out.push(Number(m[1]));
  }
  if (out.length === 0) {
    throw new Error(
      `harness precondition unmet: ${file} carries no cite matching the ${what} anchor — the citing sentence changed, so this cell cannot score; failing loudly rather than passing vacuously`,
    );
  }
  return out;
}

describe("bug 0456 — the src/parser/imports.ts line-cites (and the carved-out LPA grammar.md cite) content-anchor onto their current lines", () => {
  // =========================================================================
  // TRUTH-ANCHOR cells. Green at the fork AND after the fix — imports.ts is
  // untouched by the (comment/message-only) fix. They pin each construct's
  // current line by content and prove the stale cited line holds other content.
  // =========================================================================

  it("cell T1 (TRUTH-ANCHOR) — the imports.ts constructs sit at their re-derived lines; the stale cited lines hold other content", () => {
    // Located-by-content == pinned number: fails loudly if imports.ts drifts,
    // guarding every RED cell's re-pin target below.
    const pins: ReadonlyArray<readonly [string, number, (l: string) => boolean]> = [
      ["checkImportReservedSynthesisedName", 353, (l) => l.startsWith("export function checkImportReservedSynthesisedName")],
      ["IMPORT_MISSING_FROM_CLAUSE_MESSAGE", 372, (l) => l.startsWith("export const IMPORT_MISSING_FROM_CLAUSE_MESSAGE")],
      ["checkImportMalformedSpecifierList", 430, (l) => l.startsWith("export function checkImportMalformedSpecifierList")],
      ["checkImportDanglingAlias", 462, (l) => l.startsWith("export function checkImportDanglingAlias")],
      ["ImportSpecifier interface", 536, (l) => l.startsWith("export interface ImportSpecifier")],
      ["ImportSpecifier.local field", 540, (l) => l.trim() === "readonly local: string;"],
      ["checkImportUnknownSymbols", 564, (l) => l.startsWith("export function checkImportUnknownSymbols")],
      ["checkImportNameCollisions", 597, (l) => l.startsWith("export function checkImportNameCollisions")],
      ["computeThetaLibExports", 814, (l) => l.startsWith("export function computeThetaLibExports")],
      ["thetalibLocalBindings", 832, (l) => l.startsWith("export function thetalibLocalBindings")],
      ["computeThetaLibExports contract sentence", 809, (l) => l.includes("Every top-level declaration is auto-exported")],
    ];
    for (const [what, pin, matches] of pins) {
      const located = uniqueLine(IMPORTS, what, matches);
      expect(
        located,
        `cell T1: expected \`${what}\` at ${IMPORTS}:${pin} (bug 0456 re-derived truth), found it at :${located}. If imports.ts moved, every b0456 re-pin target below is stale.`,
      ).toBe(pin);
    }
    // The stale cited lines hold DIFFERENT constructs — the fact that makes every
    // cite below a lie (bug 0456 §Reproduction).
    const stale: ReadonlyArray<readonly [number, string, string]> = [
      [328, "checkImportReservedSynthesisedName", "sep:845 cites line 328"],
      [437, "export function checkImportDanglingAlias", "list:26/755 & sep:28 cite line 437"],
      [302, "export interface ImportSpecifier", "inline:348 cites line 302"],
      [515, "export function checkImportNameCollisions", "list:815 cites line 515"],
      [614, "export function computeThetaLibExports", "from:22/473 cite line 614"],
      [609, "Every top-level declaration is auto-exported", "from:650 assertion message cites line 609"],
    ];
    for (const [n, symbol, who] of stale) {
      expect(
        lineOf(IMPORTS, n).includes(symbol),
        `cell T1: ${IMPORTS}:${n} must NOT hold \`${symbol}\` — that is exactly why ${who} is stale (line ${n} today is \`${lineOf(IMPORTS, n).trim()}\`).`,
      ).toBe(false);
    }
  });

  it("cell T2 (GREEN-CONTROL) — current imports.ts symbols sit where bug 0456 re-derived them", () => {
    // Byte-identical control the RED cells lean on; passes now and after the fix.
    expect(lineOf(IMPORTS, 462).startsWith("export function checkImportDanglingAlias")).toBe(true);
    expect(lineOf(IMPORTS, 814).startsWith("export function computeThetaLibExports")).toBe(true);
    expect(lineOf(IMPORTS, 832).startsWith("export function thetalibLocalBindings")).toBe(true);
  });

  // =========================================================================
  // CONTENT-ANCHOR cells. RED at the fork (the cite points at the wrong
  // content); GREEN after the mechanical re-pin; re-reds on any future
  // imports.ts insertion that moves a construct without re-sweeping the cite.
  // =========================================================================

  // Each entry: the citing file, a human label, a global regex whose group 1 is
  // the cited imports.ts line number, and the marker(s) the construct's current
  // line must contain. The gate reads imports.ts at the CITED number and asserts
  // the marker — so a stale number reds and a re-pinned number greens.
  const anchors: ReadonlyArray<{
    file: string;
    label: string;
    re: RegExp;
    markers: readonly string[];
  }> = [
    {
      file: LIST,
      label: "checkImportMalformedSpecifierList (list:25)",
      re: /checkImportMalformedSpecifierList` \(src\/parser\/imports\.ts:(\d+)/g,
      markers: ["export function checkImportMalformedSpecifierList"],
    },
    {
      file: LIST,
      label: "checkImportNameCollisions (list:815)",
      re: /checkImportNameCollisions`, src\/parser\/imports\.ts:(\d+)/g,
      markers: ["export function checkImportNameCollisions"],
    },
    {
      file: LIST,
      label: "computeThetaLibExports (list:873)",
      re: /computeThetaLibExports` publishes it \(src\/parser\/imports\.ts:(\d+)/g,
      markers: ["export function computeThetaLibExports"],
    },
    {
      file: LIST,
      label: "IMPORT_MISSING_FROM_CLAUSE_MESSAGE (list:73)",
      re: /path literal", src\/parser\/imports\.ts:(\d+)/g,
      markers: ["IMPORT_MISSING_FROM_CLAUSE_MESSAGE"],
    },
    {
      file: SEP,
      label: "checkImportDanglingAlias (sep:28, bare continuation cite)",
      re: /checkImportDanglingAlias`, :(\d+)/g,
      markers: ["export function checkImportDanglingAlias"],
    },
    {
      file: SEP,
      label: "checkImportReservedSynthesisedName (sep:845)",
      re: /\(src\/parser\/imports\.ts:(\d+)\) refuses a name/g,
      markers: ["export function checkImportReservedSynthesisedName"],
    },
    {
      file: SEP,
      label: "checkImportUnknownSymbols (sep:916)",
      re: /checkImportUnknownSymbols` \(src\/parser\/imports\.ts:(\d+)/g,
      markers: ["export function checkImportUnknownSymbols"],
    },
    {
      file: FROM,
      label: "computeThetaLibExports (from:22)",
      // Anchored on stable context, NOT the range-high: the fix moves both ends
      // (614–619 -> 814–819), so a trailing-number anchor could not go green.
      re: /computeThetaLibExports` \(src\/parser\/imports\.ts:(\d+)/g,
      markers: ["export function computeThetaLibExports"],
    },
    {
      file: FROM,
      label: "computeThetaLibExports (from:473)",
      re: /src\/parser\/imports\.ts:(\d+)[\u2013-]\d+\) unions declarations/g,
      markers: ["export function computeThetaLibExports"],
    },
    {
      file: FROM,
      label: "computeThetaLibExports contract sentence (from:650 assertion message)",
      re: /neither of the two sources src\/parser\/imports\.ts:(\d+)/g,
      markers: ["Every top-level declaration is auto-exported"],
    },
    {
      file: INLINE,
      label: "ImportSpecifier.local (inline:348)",
      re: /ImportSpecifier\.local`, src\/parser\/imports\.ts:(\d+)/g,
      // The §Fix re-pins line 302 to line 540 (the field) OR line 536 (the interface); accept
      // either so the cell is direction-reachable regardless of the fixer's choice.
      markers: ["export interface ImportSpecifier", "readonly local: string"],
    },
    {
      file: REEXPORT,
      label: "thetalibLocalBindings (reexport:79)",
      // The symbol and its cite wrap across two comment lines; `[\s\S]*?` spans
      // the line break non-greedily so it binds to the nearest imports.ts cite.
      re: /thetalibLocalBindings`,[\s\S]*?src\/parser\/imports\.ts:(\d+)/g,
      markers: ["export function thetalibLocalBindings"],
    },
  ];

  for (const { file, label, re, markers } of anchors) {
    it(`cell C:${label} (CONTENT-ANCHOR-RED) — the cite points at the construct it names`, () => {
      const src = readCorpus(file);
      const cited = citedNumbers(file, label, src, new RegExp(re.source, re.flags));
      for (const n of cited) {
        const line = lineOf(IMPORTS, n);
        const held = markers.some((m) => line.includes(m));
        expect(
          held,
          `cell C: ${file} cites ${IMPORTS}:${n} for ${label}, but line ${n} holds \`${line.trim()}\` — expected one of [${markers.join(" | ")}]. At the fork the cite names a pre-shift line; the mechanical re-pin (bug 0456 §Fix) points it at the construct's current line.`,
        ).toBe(true);
      }
    });
  }

  // =========================================================================
  // FRESHNESS cells. RED at the fork (the literal stale token is present);
  // GREEN after the mechanical re-pin removes it — the cell the fix turns green.
  // =========================================================================

  const freshness: ReadonlyArray<readonly [string, readonly string[]]> = [
    [LIST, ["imports.ts:413", "imports.ts:347", "imports.ts:437", "imports.ts:515", "imports.ts:723", "checkImportDanglingAlias` (" + ":437"]],
    [SEP, ["imports.ts:413", "imports.ts:328", "imports.ts:539", "checkImportDanglingAlias`, " + ":437"]],
    [FROM, ["imports.ts:614", "imports.ts:609"]],
    [INLINE, ["imports.ts:302"]],
    [REEXPORT, ["imports.ts:741"]],
  ];

  for (const [file, tokens] of freshness) {
    it(`cell F:${file} (FRESHNESS-RED) — carries no pre-shift imports.ts line token`, () => {
      const src = readCorpus(file);
      for (const token of tokens) {
        expect(
          src.includes(token),
          `cell F: ${file} still carries the stale token \`${token}\` — imports.ts grew past it; the re-pin (bug 0456 §Fix) replaces it with the construct's current line.`,
        ).toBe(false);
      }
    });
  }

  // =========================================================================
  // LPA cell. RED at the fork; GREEN after the one-line 175->184 refresh
  // (0336 same-line precedent). READ-ONLY — this gate never edits the LPA.
  // =========================================================================

  it("cell L (LPA-RED, read-only) — the LPA line-2342 alias-RHS cite points at grammar.md's AliasRhs line, not the arm-body prose", () => {
    // Content truth: line 184 is the AliasRhs production; line 175 is the
    // statement-in-arm-body prose. Green now and after — grammar.md is untouched.
    const g184 = lineOf(GRAMMAR, 184);
    const g175 = lineOf(GRAMMAR, 175);
    expect(
      g184.includes("AliasRhs"),
      `cell L: ${GRAMMAR} line 184 must hold the AliasRhs production (the LPA's re-pin target); found \`${g184.trim()}\`.`,
    ).toBe(true);
    expect(
      g175.includes("AliasRhs"),
      `cell L: ${GRAMMAR} line 175 must NOT hold AliasRhs — it is the statement-in-arm-body prose, which is exactly why the LPA's line-175 cite is stale (found \`${g175.trim()}\`).`,
    ).toBe(false);
    // The stale cite lives on LPA line 2342. Read the actual line (not a fixed
    // offset) so the cell survives incidental LPA line drift; assert the cite.
    const lpaLine = lineOf(LPA, 2342);
    expect(
      lpaLine.includes("(grammar.md:184)"),
      `cell L: ${LPA} line 2342 must cite (grammar.md:184) (AliasRhs). At the fork it reads \`${lpaLine.trim()}\`; bug 0421 R1 / 0456 §Fix apply the same-line 175->184 refresh under the 0336 precedent.`,
    ).toBe(true);
    expect(
      lpaLine.includes("(grammar.md:175)"),
      `cell L: ${LPA} line 2342 must no longer cite (grammar.md:175) — that grammar line is the statement-in-arm-body prose, not the alias right-hand side the sentence names.`,
    ).toBe(false);
  });
});
