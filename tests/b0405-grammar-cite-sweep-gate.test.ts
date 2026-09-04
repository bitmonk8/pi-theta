import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// b0405 — the bare-form grammar.md citation-sweep gate.
//
// Bug 0405 (docs/bugs/0405-bare-form-spec-grammar-cites-stale-after-0389-shift.md)
// records that bug 0389's +9-line insertion into docs/spec_topics/grammar.md
// (the `#fn-declarations` block, 223 -> 232 lines) re-pinned only the ratified
// PREFIX-form `docs/spec_topics/grammar.md:N` cites. Bare `grammar.md:N` and
// continuation-form cites in three committed test files were left at pre-shift
// values, so today a cite of grammar.md:N names line N's CURRENT content — the
// wrong normative sentence — including inside two assertion messages a future
// red would hand its debugger.
//
// THE SETTLED FIX this file scores, from bug 0405 §Fix (a mechanical re-pin of
// an enumerated instance list; no verdict/assertion logic moves):
//   - fn-param-not-identifier.test.ts: two line-139 cites (a comment
//     and an assertion message) name `FnParams`, but line 139 now holds
//     `SubagentMod`; both move to FnParams' current line. A third cite (the
//     A1 assertion message) names the `FnParam` element rule and moves the
//     same fn-block distance. The reference-side
//     `docs/reference/grammar.md:300` half is out of scope (bug 0405 §Non-goals).
//   - ctor-field-type-check.test.ts: the sink-rule cites at lines 216-221,
//     the exhaustive/constructor-field pair, and the line-220
//     assertion message move onto the current sink-rule lines.
//   - nested-array-element-sink-descent.test.ts: the sink-set-exhaustive-anchored
//     continuation and eight line-221 recursive-descent cites move onto
//     the current recursive-descent line.
//
// Two directions, as the sibling b0404 oracle scores:
//
//   SPEC-TRUTH cells are green at the fork AND after the fix. They compute, by
//   content search over grammar.md, where each cited production/sentence now
//   lives — locking the re-pin TARGETS so a later grammar-appendix edit that
//   moves them reds here before the enumerated test cites drift again.
//
//   RE-PIN cells are RED at the fork and GREEN after the fix. Each asserts the
//   SPECIFIED end state (the file cites the current line and no longer carries
//   the pre-shift number), not the fork's bytes. The stale numbers are not
//   hard-coded: the FnParams stale anchor is the current `SubagentMod` line
//   (bug 0405's exact symptom — line 139 now names `SubagentMod`), and every sink
//   stale number is its computed truth minus the 0389 insertion size, so the
//   gate stays valid under further shifts.
//
// Every cite this file builds is the ratified ADJACENT form `grammar.md:<n>`,
// assembled by interpolation from a content-derived line number — never a
// hard-coded bare `:<n>` continuation (which the bug 0134 citation-symbol-form
// gate refuses) and never a literal line index in an assertion.

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so
 * an absent source cannot let a cell pass vacuously (the b0265 `readCorpus`
 * pattern this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a source this oracle scores for the bug 0405 sweep — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}

/** Line splitting tolerates a CRLF terminator. */
const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);

const GRAMMAR = "docs/spec_topics/grammar.md";
const FN_PARAM = "tests/fn-param-not-identifier.test.ts";
const CTOR = "tests/ctor-field-type-check.test.ts";
const NESTED = "tests/nested-array-element-sink-descent.test.ts";

// The 0389 fix inserted 9 lines at the `#fn-declarations` block (223 -> 232);
// the `array<T>` sink rules all sit past the insertion, so each moved +9. The
// FnParams cite target moved less (a sibling was inserted between the block head
// and the production), so its pre-shift anchor is derived by content instead.
const SINK_SHIFT = 9;

/**
 * The 1-based grammar.md line where exactly one line satisfies `matches`. Zero
 * or many is a loud harness failure: the sweep target moved out from under a
 * cell, so it must fail rather than score vacuously.
 */
function grammarLine(what: string, matches: (line: string) => boolean): number {
  const lines = linesOf(readCorpus(GRAMMAR));
  const hits: number[] = [];
  lines.forEach((line, index) => {
    if (matches(line)) hits.push(index + 1);
  });
  if (hits.length !== 1) {
    throw new Error(
      `harness precondition unmet: ${GRAMMAR} carries ${hits.length} lines matching the ${what}, expected exactly one${hits.length > 1 ? ` (lines ${hits.join(", ")})` : ""} — bug 0405 names this line as a re-pin target, so a cell that cannot locate it must fail loudly`,
    );
  }
  return hits[0] as number;
}

/** The `FnParams` production the fn-param cites point at (spec truth). */
const fnParamsLine = (): number =>
  grammarLine("`FnParams` production", (l) => /^FnParams\s*::=/.test(l));

/** The `FnParam` element production — the A1 assertion message's re-pin target. */
const fnParamProductionLine = (): number =>
  grammarLine("`FnParam` production", (l) => /^FnParam\s*::=/.test(l));

/** The line the stale `FnParams` cite now wrongly names — bug 0405's symptom. */
const subagentModLine = (): number =>
  grammarLine("`SubagentMod` production", (l) => /^SubagentMod\s*::=/.test(l));

/** The `array<T>` sink-set header sentence (spec truth). */
const exhaustiveLine = (): number =>
  grammarLine("`array<T>` sink-set-exhaustive sentence", (l) =>
    l.includes("The sink set is exhaustive:"),
  );

/** The constructor-field sink bullet (spec truth). */
const ctorFieldLine = (): number =>
  grammarLine("constructor-field sink bullet", (l) =>
    l.includes("The declared type of a surrounding constructor field"),
  );

/** The recursive-descent sink bullet (spec truth). */
const recursiveLine = (): number =>
  grammarLine("recursive-descent sink bullet", (l) =>
    l.includes(
      "The element type of an array-typed sink that this literal is itself an element of",
    ),
  );

/** Non-overlapping occurrences of `needle` in `hay`. */
function countOccurrences(hay: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}

/** A prefix-form grammar.md cite of `line`, assembled from a content-derived number. */
const grammarCite = (line: number): string => `grammar.md:${line}`;

/** A backticked continuation cite `` `:<n>` `` as the sink-anchor comments spell it. */
const continuationCite = (line: number): string => `\`:${line}\``;

/** The two dash spellings of a grammar.md line-range cite. */
function grammarRange(from: number, to: number): readonly string[] {
  return [`grammar.md:${from}\u2013${to}`, `grammar.md:${from}-${to}`];
}

describe("bug 0405 — the bare-form grammar.md spec cites in three test files re-pin onto the post-0389 lines", () => {
  // =========================================================================
  // SPEC-TRUTH cells. Green at the fork AND after the fix — they lock the
  // re-pin targets by content so a later grammar shift reds here first.
  // =========================================================================

  it("cell A1 (SPEC-TRUTH) — `FnParams` sits at grammar line 144, `SubagentMod` (the stale anchor) at 139", () => {
    expect(
      fnParamsLine(),
      `cell A1: the \`FnParams\` production is the re-pin target for fn-param-not-identifier.test.ts; if it is not at grammar.md line 144 the sweep numbers below are stale.`,
    ).toBe(144);
    expect(
      subagentModLine(),
      `cell A1: line 139 must still hold \`SubagentMod\` — the content the fork's line-139 cites wrongly name (bug 0405 symptom).`,
    ).toBe(139);
  });

  it("cell A2 (SPEC-TRUTH) — the `array<T>` sink-rule anchors sit at 225 / 229 / 230", () => {
    expect(
      exhaustiveLine(),
      "cell A2: the sink-set-exhaustive sentence is the re-pin target for the ctor/nested sink-set-exhaustive cites.",
    ).toBe(225);
    expect(
      ctorFieldLine(),
      "cell A2: the constructor-field bullet is the re-pin target for the ctor constructor-field cites.",
    ).toBe(229);
    expect(
      recursiveLine(),
      "cell A2: the recursive-descent bullet is the re-pin target for the eight nested recursive-descent cites.",
    ).toBe(230);
  });

  // =========================================================================
  // RE-PIN cells. RED at the fork; bug 0405 §Fix makes each GREEN.
  // =========================================================================

  it("cell B1 (RE-PIN-RED) — fn-param-not-identifier cites `FnParams` at its current line, not the pre-shift `SubagentMod` line", () => {
    const target = fnParamsLine();
    const stale = subagentModLine();
    const src = readCorpus(FN_PARAM);
    // Two sites (a comment near the top, an assertion message near the trailing
    // -comma case) must name FnParams' current line; the `SubagentMod` line must
    // be gone. The reference-side `docs/reference/grammar.md:300` half is left
    // alone (bug 0405 §Non-goals) and this check does not touch it.
    expect(
      src.includes(grammarCite(target)),
      `cell B1: ${FN_PARAM} must cite \`FnParams\` at ${grammarCite(target)} (comment + assertion message). At the fork both sites still say ${grammarCite(stale)}, which now names \`SubagentMod\`.`,
    ).toBe(true);
    expect(
      src.includes(grammarCite(stale)),
      `cell B1: ${FN_PARAM} must no longer carry ${grammarCite(stale)} — line ${stale} is \`SubagentMod\`, not \`FnParams\`.`,
    ).toBe(false);
    // ALSO lock the `FnParam` element cite (the A1 assertion message, the same
    // 0389 fn-block shift as the FnParams cite above). The stale anchor is
    // `FnParam`'s current line minus that fn-block shift — the gap the +9
    // insertion opened between `SubagentMod` and `FnParams` — so the gate holds
    // under further shifts rather than pinning the literal pre-shift number.
    const fnParamTarget = fnParamProductionLine();
    const fnBlockShift = fnParamsLine() - subagentModLine();
    const staleFnParam = fnParamTarget - fnBlockShift;
    expect(
      src.includes(grammarCite(fnParamTarget)),
      `cell B1: ${FN_PARAM} must cite \`FnParam\` at ${grammarCite(fnParamTarget)} (the A1 assertion message). At the fork it says ${grammarCite(staleFnParam)}, which now names \`WithClause\`.`,
    ).toBe(true);
    expect(
      src.includes(grammarCite(staleFnParam)),
      `cell B1: ${FN_PARAM} must no longer carry ${grammarCite(staleFnParam)} — line ${staleFnParam} is \`WithClause\`, not \`FnParam\`.`,
    ).toBe(false);
  });

  it("cell B2 (RE-PIN-RED) — ctor-field-type-check cites the current sink lines, not the pre-shift lines 216/220/216-221", () => {
    const exhaustive = exhaustiveLine();
    const ctorField = ctorFieldLine();
    const recursive = recursiveLine();
    const staleExhaustive = exhaustive - SINK_SHIFT;
    const staleCtorField = ctorField - SINK_SHIFT;
    const staleRange = grammarRange(staleExhaustive, recursive - SINK_SHIFT);
    const currentRange = grammarRange(exhaustive, recursive);
    const src = readCorpus(CTOR);
    // The primary red: the constructor-field bullet's current line must appear
    // (the fork's line-220 assertion message re-pins onto it).
    expect(
      src.includes(grammarCite(ctorField)),
      `cell B2: ${CTOR} must cite the constructor-field sink bullet at ${grammarCite(ctorField)}. At the fork the assertion message says ${grammarCite(staleCtorField)}, a blank line.`,
    ).toBe(true);
    // The sink-set-exhaustive line and the sink-rule range are already present
    // in the header half 0389 re-pinned; they must survive the sweep.
    expect(
      src.includes(grammarCite(exhaustive)),
      `cell B2: ${CTOR} must cite the sink-set-exhaustive sentence at ${grammarCite(exhaustive)}.`,
    ).toBe(true);
    expect(
      currentRange.some((r) => src.includes(r)),
      `cell B2: ${CTOR} must cite the sink-rule range as ${currentRange[0]}.`,
    ).toBe(true);
    // Scoped to the `grammar.md`-prefixed form so an unrelated `expressions.md`
    // line number cannot false-match: the stale sink cites must all be gone.
    expect(
      src.includes(grammarCite(staleCtorField)),
      `cell B2: ${CTOR} must not carry ${grammarCite(staleCtorField)} — line ${staleCtorField} is blank.`,
    ).toBe(false);
    expect(
      src.includes(grammarCite(staleExhaustive)),
      `cell B2: ${CTOR} must not carry ${grammarCite(staleExhaustive)} — line ${staleExhaustive} is blank.`,
    ).toBe(false);
    expect(
      staleRange.some((r) => src.includes(r)),
      `cell B2: ${CTOR} must not carry the pre-shift range ${staleRange[0]} — it now spans blank/statement-continuation lines.`,
    ).toBe(false);
  });

  it("cell B3 (RE-PIN-RED) — nested-array-element-sink-descent cites the current recursive-descent line, not the pre-shift lines 221/216", () => {
    const recursive = recursiveLine();
    const exhaustive = exhaustiveLine();
    const staleRecursive = recursive - SINK_SHIFT;
    const staleExhaustive = exhaustive - SINK_SHIFT;
    const src = readCorpus(NESTED);
    // Bug 0405 enumerates eight recursive-descent cites; after the sweep the
    // recursive-descent line is cited at least that many times (plus the two
    // header cites 0389 already re-pinned). At the fork only the two re-pinned
    // header cites carry it.
    const recursiveHits = countOccurrences(src, grammarCite(recursive));
    expect(
      recursiveHits,
      `cell B3: ${NESTED} must cite ${grammarCite(recursive)} at least 8 times (the eight recursive-descent sites bug 0405 enumerates). Found ${recursiveHits}; at the fork the eight sites still say ${grammarCite(staleRecursive)}, a statement-continuation line.`,
    ).toBeGreaterThanOrEqual(8);
    // The SPEC-ANCHORS continuation cite must name the sink-set-exhaustive line.
    expect(
      src.includes(continuationCite(exhaustive)),
      `cell B3: ${NESTED}'s SPEC-ANCHORS comment must anchor the sink-set-exhaustive sentence at line ${exhaustive}. At the fork it says line ${staleExhaustive}, a blank line.`,
    ).toBe(true);
    // The pre-shift cites must all be gone.
    expect(
      src.includes(grammarCite(staleRecursive)),
      `cell B3: ${NESTED} must not carry ${grammarCite(staleRecursive)} — line ${staleRecursive} is a statement-continuation sentence, not the recursive-descent bullet.`,
    ).toBe(false);
    expect(
      src.includes(continuationCite(staleExhaustive)),
      `cell B3: ${NESTED} must not carry the ${continuationCite(staleExhaustive)} sink anchor — line ${staleExhaustive} is blank.`,
    ).toBe(false);
  });
});
