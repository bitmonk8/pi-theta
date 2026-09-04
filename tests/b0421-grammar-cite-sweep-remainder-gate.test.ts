import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// b0421 — the grammar.md citation-sweep REMAINDER gate.
//
// Bug 0421 (docs/bugs/0421-0389-shift-stale-cites-outside-0405-enumeration.md)
// records that bug 0389's insertion into docs/spec_topics/grammar.md (+5 through
// the `fn`-declarations block, +9 from the SubagentMod/WithClause prose onward)
// re-pinned only the prefix-form cites, and bug 0405's follow-up sweep re-pinned
// only the THREE example files 0389's §Residuals had offered ("e.g."). The
// identical bare/continuation-form stale class survives at the fork in eleven
// more test files plus three `src/` comments: a cite of `grammar.md:N` names
// line N's CURRENT content — the wrong normative sentence — including inside a
// dozen assertion-message strings a future red would hand its debugger, and one
// SEMANTIC contrast comment that affirmatively misstates the current spec.
//
// This file MIRRORS the sibling tests/b0405-grammar-cite-sweep-gate.test.ts
// (correct at pin; NOT edited here) over the remainder set. Two directions:
//
//   SPEC-TRUTH cells are green at the fork AND after the fix. They compute, by
//   content search over grammar.md, WHERE each cited production/sentence now
//   lives, and lock the structure (uniqueness + ordering) so a later
//   grammar-appendix edit that moves a target reds this gate before the
//   enumerated cites silently drift again. No truth line NUMBER is hard-coded:
//   the anchors are located by content, per the bug-0405 grammarLine pattern.
//
//   RE-PIN cells are RED at the fork and GREEN after bug 0421's §Fix. Each
//   asserts the SPECIFIED end state — the citing file names the current line and
//   no longer carries the pre-shift number — not the fork's bytes. Stale numbers
//   are not hard-coded literals: each is derived either as the content now
//   occupying the pre-shift slot (the with-block productions 0389 inserted, the
//   newline-closes sentence, the schema-block opening fence) or as
//   (content-derived truth − the 0389 insertion size), so the gate stays valid
//   under further shifts rather than pinning a volatile index.
//
// CARVE-OUT: tests/live/live-production-acceptance.test.ts is line-count-pinned
// and forbidden to edit on this lane, so its stale alias-RHS cite stays and is
// NOT a target here. The already-current cites bug 0421 §Fix protects
// (schema-alias-union-decl.test.ts:29, blockexpr-production.test.ts:153, the
// FnDecl half of brace-rooted-union-arm-capture.test.ts:658, every
// docs/reference/grammar.md half) are never asserted stale — the spec-only
// matcher below excludes the reference side, and the protected spec cites are
// left standing by construction.
//
// Every grammar.md cite THIS file builds is the ratified ADJACENT form
// `grammar.md:<n>`, assembled by interpolation from a content-derived number —
// never a hard-coded bare `:<n>` continuation, which the bug 0134
// citation-symbol-form gate refuses.

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so an
 * absent source cannot let a cell pass vacuously (the bug-0405 readCorpus pattern
 * this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a source this gate scores for the bug 0421 remainder sweep — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
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

// Sources carrying the remainder set (bug 0421 §Affected). The line-pinned LPA
// is deliberately absent (its stale alias-RHS cite is carved out on this lane).
const NESTED_LIVE = "tests/live/nested-array-element-sink-descent-live-cell.test.ts";
const FN_PARAM_UNCLOSED = "tests/fn-param-list-unclosed.test.ts";
const B0357 = "tests/b0357-doc-comment-field-variant-anchors.test.ts";
const B0358 = "tests/b0358-doc-comment-descriptions-lower.test.ts";
const BLOCKEXPR = "tests/blockexpr-production.test.ts";
const B0387 = "tests/b0387-block-expr-tail-query-consumption.test.ts";
const SCHEMA_UNION = "tests/schema-alias-union-decl.test.ts";
const BRACE_ROOTED = "tests/brace-rooted-union-arm-capture.test.ts";
const SCHEMA_RHS_MALFORMED = "tests/schema-alias-rhs-malformed.test.ts";
const INLINE_EMPTY = "tests/inline-empty-object-type.test.ts";
const THETA_DOCUMENT = "src/parser/theta-document.ts";
const TYPE_LAYER_CHECKS = "src/parser/type-layer-checks.ts";

// The size of bug 0389's total insertion. The alias/schema/lowering/statement/
// sink region all sits past the whole insertion, so each moved +9; a pre-shift
// number in that zone is its content-derived truth minus this. (The `fn`-block
// zone moved less, +5, derived below from the gap the with-block opened.)
const MAIN_SHIFT = 9;

/**
 * The 1-based grammar.md line where exactly one line satisfies `matches`. Zero or
 * many is a loud harness failure: the sweep target moved out from under a cell,
 * so it must fail rather than score vacuously.
 */
function grammarLine(what: string, matches: (line: string) => boolean): number {
  const lines = linesOf(readCorpus(GRAMMAR));
  const hits: number[] = [];
  lines.forEach((line, index) => {
    if (matches(line)) hits.push(index + 1);
  });
  if (hits.length !== 1) {
    throw new Error(
      `harness precondition unmet: ${GRAMMAR} carries ${hits.length} lines matching the ${what}, expected exactly one${hits.length > 1 ? ` (lines ${hits.join(", ")})` : ""} — bug 0421 names this line as a re-pin target, so a cell that cannot locate it must fail loudly`,
    );
  }
  return hits[0] as number;
}

/** The first bare ```` ``` ```` fence at a line strictly greater than `after`. */
function nextBareFence(after: number): number {
  const lines = linesOf(readCorpus(GRAMMAR));
  for (let idx = after; idx < lines.length; idx += 1) {
    if ((lines[idx] ?? "").trim() === "```") return idx + 1;
  }
  throw new Error(
    `harness precondition unmet: ${GRAMMAR} has no closing \`\`\` fence after line ${after}`,
  );
}

// --- Content anchors (spec truth), located by search, never by fixed number. --

const fnDeclLine = (): number => grammarLine("`FnDecl` production", (l) => /^FnDecl\s*::=/.test(l));
const fnParamsLine = (): number =>
  grammarLine("`FnParams` production", (l) => /^FnParams\s*::=/.test(l));
const fnParamLine = (): number =>
  grammarLine("`FnParam` production", (l) => /^FnParam\s*::=/.test(l));
const subagentModLine = (): number =>
  grammarLine("`SubagentMod` production", (l) => /^SubagentMod\s*::=/.test(l));
const withClauseLine = (): number =>
  grammarLine("`WithClause` production", (l) => /^WithClause\s*::=/.test(l));
const withValueLine = (): number =>
  grammarLine("`WithValue` production", (l) => /^WithValue\s*::=/.test(l));
const parenProseLine = (): number =>
  grammarLine("parenthesised-parameter-list prose", (l) =>
    l.includes("parameter list is parenthesised in every case"),
  );
const armBodyLine = (): number =>
  grammarLine("`ArmBody ::= Expr` production", (l) => /^ArmBody\s*::=\s*Expr/.test(l));
const armBodySecondLine = (): number =>
  grammarLine("`| BlockExpr` arm-body alternative", (l) => l.includes("| BlockExpr"));
const matchExampleLine = (): number =>
  grammarLine("`match` worked-example header", (l) => l.includes("match result {"));
const fallbackLine = (): number =>
  grammarLine("`\"fallback\"` worked-example tail", (l) => l.includes('    "fallback"'));
const aliasRhsLine = (): number =>
  grammarLine("`AliasRhs` production", (l) => /^AliasRhs\s*::=/.test(l));
const schemaDeclLine = (): number =>
  grammarLine("`SchemaDecl` production", (l) => /^SchemaDecl\s*::=/.test(l));
const byOnObjectLine = (): number =>
  grammarLine("by-on-object rejection prose", (l) => l.includes("clause is admitted"));
const enumVariantBulletLine = (): number =>
  grammarLine("enum-variant doc-comment anchor bullet", (l) => l.includes("variant within an"));
const fnAliasLoweringLine = (): number =>
  grammarLine("fn/alias `///`-lowering sentence", (l) => l.includes("lowers nowhere"));
const statementSepLine = (): number =>
  grammarLine("statement-separator prose", (l) =>
    l.includes("Statements are separated by newlines"),
  );
const newlineClosesLine = (): number =>
  grammarLine("newline-closes-statement prose", (l) => l.includes("the newline closes the statement"));
const recursiveLine = (): number =>
  grammarLine("recursive-descent sink bullet", (l) =>
    l.includes("element type of an array-typed sink that this literal is itself an element of"),
  );

/** The ```` ``` ```` fence that opens the schema-by-form grammar block (before `SchemaDecl`). */
const schemaBlockOpenLine = (): number => schemaDeclLine() - 1;
/** The ```` ``` ```` fence that closes the schema-by-form grammar block (after `AliasRhs`). */
const schemaBlockCloseLine = (): number => nextBareFence(aliasRhsLine());
/** The ```` ```theta ```` fence that opens the `match` worked example (before its header). */
const matchFenceOpenLine = (): number => matchExampleLine() - 1;
/** The ```` ``` ```` fence that closes the `match` worked example (after the `"fallback"` tail). */
const matchFenceCloseLine = (): number => nextBareFence(fallbackLine());

// --- Spec-only cite matchers. Every one excludes the reference side, so a
//     docs/reference/grammar.md half (bug 0421 §Non-goals) can never intercept.

/** A spec-side `grammar.md:<n>` cite (bare or spec_topics-prefixed), not a longer number. */
function citesSpecLine(src: string, n: number): boolean {
  return new RegExp(`(?<!reference/)grammar\\.md:${n}(?![0-9])`).test(src);
}

/**
 * A spec-side bare `grammar.md:<n>` cite that is NOT the low end of a range — used
 * where a protected range cite shares the number with a stale bare cite (line-29's
 * `grammar.md:179–186` must not shadow the stale bare `grammar.md:179`).
 */
function citesSpecLineStrict(src: string, n: number): boolean {
  return new RegExp(`(?<!reference/)grammar\\.md:${n}(?![0-9\\u2013-])`).test(src);
}

/** A spec-side `grammar.md:<from>–<to>` range cite (en-dash or hyphen spelling). */
function citesSpecRange(src: string, from: number, to: number): boolean {
  return new RegExp(`(?<!reference/)grammar\\.md:${from}[\\u2013-]${to}(?![0-9])`).test(src);
}

/** A spec-side `grammar.md:<any>–<high>` range cite ending at `high`. */
function citesSpecRangeEndingAt(src: string, high: number): boolean {
  return new RegExp(`(?<!reference/)grammar\\.md:\\d+[\\u2013-]${high}(?![0-9])`).test(src);
}

/** A backtick, so the continuation-form matcher below can bound a bare `:<n>`. */
const BACKTICK = "\u0060";

/**
 * A CONTINUATION-form range cite `:<from>-<to>` whose high end is `high`: a bare
 * colon-range with no path prefix, attributed to grammar.md by the enclosing
 * paragraph (the bug 0421 F2 twins in the blockexpr `Spec:` list and cell-(a)
 * comment). The alphanumeric lookbehind keeps an adjacent `<file>:<from>-<to>`
 * cite from intercepting, so this scores the bare continuation alone. The number
 * is interpolated, never a hard-coded bare `:<n>` — the bug 0134 adjacent-form
 * rule this witness keeps for its OWN cites.
 */
function citesBareRangeEndingAt(src: string, high: number): boolean {
  return new RegExp(`(?<![A-Za-z0-9]):\\d+[\\u2013-]${high}(?![0-9])`).test(src);
}

/**
 * A CONTINUATION-form single-line cite spelled as a backticked `:<n>`, attributed
 * to grammar.md by the enclosing prose (schema-alias-union's SPEC ANCHORS
 * comment, the bug 0421 F2 twin at its line 32). The backtick bound separates it
 * from the protected `grammar.md:<n>-<m>` range that shares the number; the
 * number is interpolated, per the bug 0134 rule above.
 */
function citesBareBacktick(src: string, n: number): boolean {
  return src.includes(`${BACKTICK}:${n}${BACKTICK}`);
}

describe("bug 0421 — the grammar.md spec cites outside 0405's three-file enumeration re-pin onto the post-0389 lines", () => {
  // =========================================================================
  // SPEC-TRUTH cells. Green at the fork AND after the fix — they lock the
  // re-pin targets by content (uniqueness + ordering) so a later grammar shift
  // reds here first. No truth line number is hard-coded.
  // =========================================================================

  it("cell S1 (SPEC-TRUTH) — the `fn`-declaration block: FnDecl now carries both slots; FnParam directly follows FnParams; the parenthesised-list prose follows both", () => {
    const grammar = readCorpus(GRAMMAR);
    const fnDecl = fnDeclLine();
    const decl = linesOf(grammar)[fnDecl - 1] ?? "";
    // The semantic cell below rests on this: 0389 added both slots to the SPEC
    // production, so the `FnDecl` line itself must show them.
    expect(
      decl.includes("SubagentMod?") && decl.includes("WithClause?"),
      `cell S1: the spec FnDecl production (grammar.md:${fnDecl}) must carry SubagentMod? and WithClause? — the fact that falsifies fn-param-list-unclosed's "reference mirror adds" contrast comment.`,
    ).toBe(true);
    const fnParams = fnParamsLine();
    const fnParam = fnParamLine();
    expect(
      fnParam,
      `cell S1: FnParam (grammar.md:${fnParam}) must sit one line below FnParams (grammar.md:${fnParams}).`,
    ).toBe(fnParams + 1);
    expect(
      parenProseLine() > fnParam,
      `cell S1: the parenthesised-parameter-list prose must sit below the FnParam production.`,
    ).toBe(true);
    // The with-block 0389 inserted sits between FnDecl and FnParams — the reason
    // the fn-block cites moved and the source of their derived stale numbers.
    for (const [name, at] of [
      ["SubagentMod", subagentModLine()],
      ["WithClause", withClauseLine()],
      ["WithValue", withValueLine()],
    ] as const) {
      expect(
        at > fnDecl && at < fnParams,
        `cell S1: the inserted ${name} production (grammar.md:${at}) must sit between FnDecl and FnParams.`,
      ).toBe(true);
    }
  });

  it("cell S2 (SPEC-TRUTH) — the arm-body production and the `match` worked example are a well-formed, ordered block", () => {
    const armBody = armBodyLine();
    const armSecond = armBodySecondLine();
    expect(
      armSecond,
      `cell S2: the \`| BlockExpr\` alternative (grammar.md:${armSecond}) must sit one line below \`ArmBody ::= Expr\` (grammar.md:${armBody}).`,
    ).toBe(armBody + 1);
    const open = matchFenceOpenLine();
    const fallback = fallbackLine();
    const close = matchFenceCloseLine();
    expect(
      (linesOf(readCorpus(GRAMMAR))[open - 1] ?? "").trim().startsWith("```"),
      `cell S2: the worked-example fence must open at grammar.md:${open}.`,
    ).toBe(true);
    expect(
      open < fallback && fallback < close,
      `cell S2: the \`"fallback"\` tail (grammar.md:${fallback}) must sit inside the worked-example fence grammar.md:${open}\u2013${close}.`,
    ).toBe(true);
  });

  it("cell S3 (SPEC-TRUTH) — the schema-by-form block, the by-on-object prose, and the appendix sentences are ordered", () => {
    const open = schemaBlockOpenLine();
    const schemaDecl = schemaDeclLine();
    const aliasRhs = aliasRhsLine();
    const close = schemaBlockCloseLine();
    expect(
      open < schemaDecl && schemaDecl < aliasRhs && aliasRhs < close,
      `cell S3: the schema block must run open(grammar.md:${open}) < SchemaDecl(grammar.md:${schemaDecl}) < AliasRhs(grammar.md:${aliasRhs}) < close(grammar.md:${close}).`,
    ).toBe(true);
    // The appendix sentences the +9 cites point at, in file order.
    const ordered = [
      ["by-on-object prose", byOnObjectLine()],
      ["enum-variant bullet", enumVariantBulletLine()],
      ["fn/alias lowering", fnAliasLoweringLine()],
      ["statement-separator prose", statementSepLine()],
      ["newline-closes prose", newlineClosesLine()],
      ["recursive-descent bullet", recursiveLine()],
    ] as const;
    expect(
      byOnObjectLine() > close,
      `cell S3: the by-on-object rejection prose must sit below the schema block.`,
    ).toBe(true);
    for (let i = 1; i < ordered.length; i += 1) {
      const [prevName, prev] = ordered[i - 1] as readonly [string, number];
      const [name, at] = ordered[i] as readonly [string, number];
      expect(
        at > prev,
        `cell S3: the ${name} (grammar.md:${at}) must sit below the ${prevName} (grammar.md:${prev}).`,
      ).toBe(true);
    }
  });

  // =========================================================================
  // RE-PIN cells. RED at the fork; bug 0421 §Fix makes each GREEN.
  // =========================================================================

  it("cell R1 (RE-PIN-RED) — the nested-sink LIVE cell cites the recursive-descent bullet at its current line, not the newline-closes sentence", () => {
    const truth = recursiveLine();
    const stale = truth - MAIN_SHIFT; // the newline-closes sentence now at that slot
    const src = readCorpus(NESTED_LIVE);
    // RED at fork: the stale number is present. GREEN after: re-pinned away.
    expect(
      citesSpecLine(src, stale),
      `cell R1: ${NESTED_LIVE} must no longer carry grammar.md:${stale} — that line is the newline-closes-statement sentence, not the sink bullet. At the fork five cites (incl. two assertion messages) still say it.`,
    ).toBe(false);
    expect(
      citesSpecLine(src, truth),
      `cell R1: ${NESTED_LIVE} must cite the recursive-descent sink bullet at grammar.md:${truth} (its own line 1 already does).`,
    ).toBe(true);
  });

  it("cell R2 (RE-PIN-RED) — fn-param-list-unclosed cites the current fn-block lines, and drops the falsified 'reference mirror adds' contrast", () => {
    const src = readCorpus(FN_PARAM_UNCLOSED);
    const fnParams = fnParamsLine();
    const fnParam = fnParamLine();
    const prose = parenProseLine();
    // Stale = the with-block production now occupying each pre-shift slot.
    const staleFnParams = subagentModLine();
    const staleFnParam = withClauseLine();
    const staleProse = withValueLine();
    // RED at fork: each stale with-block number is present. GREEN after: re-pinned.
    expect(
      citesSpecLine(src, staleFnParams),
      `cell R2: ${FN_PARAM_UNCLOSED} must no longer carry grammar.md:${staleFnParams} — that line is now SubagentMod, not FnParams (three sites: a comment, an assertion message, a trailing-comma comment).`,
    ).toBe(false);
    expect(
      citesSpecLine(src, staleFnParam),
      `cell R2: ${FN_PARAM_UNCLOSED} must no longer carry grammar.md:${staleFnParam} — that line is now WithClause, not FnParam.`,
    ).toBe(false);
    expect(
      citesSpecLine(src, staleProse),
      `cell R2: ${FN_PARAM_UNCLOSED} must no longer carry grammar.md:${staleProse} for the prose — that line is now WithValue.`,
    ).toBe(false);
    expect(
      citesSpecLine(src, fnParams),
      `cell R2: ${FN_PARAM_UNCLOSED} must cite FnParams at grammar.md:${fnParams}.`,
    ).toBe(true);
    expect(
      citesSpecLine(src, fnParam),
      `cell R2: ${FN_PARAM_UNCLOSED} must cite FnParam at grammar.md:${fnParam}.`,
    ).toBe(true);
    expect(
      citesSpecLine(src, prose),
      `cell R2: ${FN_PARAM_UNCLOSED} must cite the parenthesised-list prose at grammar.md:${prose}.`,
    ).toBe(true);
    // SEMANTIC: 0389 added both slots to the SPEC FnDecl, so the contrast comment
    // that still tells the reader "the reference mirror adds SubagentMod? and
    // WithClause?" (treating them as reference-only) affirmatively misstates the
    // current spec. The §Fix rewrites the clause to state the spec production now
    // carries them; the witness locks that the reference-only framing is gone.
    expect(
      src.includes("the reference mirror adds"),
      `cell R2: ${FN_PARAM_UNCLOSED} must no longer claim "the reference mirror adds" SubagentMod?/WithClause? — the spec FnDecl production carries both (grammar.md:${fnDeclLine()}).`,
    ).toBe(false);
  });

  it("cell R3 (RE-PIN-RED) — b0357 cites the enum-variant doc-comment bullet at its current line, not a code-fence line", () => {
    const truth = enumVariantBulletLine();
    const stale = truth - MAIN_SHIFT;
    const src = readCorpus(B0357);
    expect(
      citesSpecLine(src, stale),
      `cell R3: ${B0357} must no longer carry grammar.md:${stale} — that line is a code-fence, not the enum-variant bullet (an assertion message).`,
    ).toBe(false);
    expect(
      citesSpecLine(src, truth),
      `cell R3: ${B0357} must cite the enum-variant doc-comment bullet at grammar.md:${truth}.`,
    ).toBe(true);
  });

  it("cell R4 (RE-PIN-RED) — b0358 cites the fn/alias `///`-lowering sentence at its current line, not a blank line", () => {
    const truth = fnAliasLoweringLine();
    const stale = truth - MAIN_SHIFT;
    const src = readCorpus(B0358);
    expect(
      citesSpecLine(src, stale),
      `cell R4: ${B0358} must no longer carry grammar.md:${stale} — that line is blank (five sites).`,
    ).toBe(false);
    expect(
      citesSpecLine(src, truth),
      `cell R4: ${B0358} must cite the fn/alias lowering sentence at grammar.md:${truth}.`,
    ).toBe(true);
  });

  it("cell R5 (RE-PIN-RED) — blockexpr-production cites the arm-body production, the worked-example range, and the `\"fallback\"` line at current lines", () => {
    const src = readCorpus(BLOCKEXPR);
    const armBody = armBodyLine();
    const armSecond = armBodySecondLine();
    const staleArm = armSecond - MAIN_SHIFT; // `ArmBody ::= Expr | BlockExpr` cite at 211/289
    const fallback = fallbackLine();
    const staleFallback = fallback - MAIN_SHIFT; // the `"fallback"` cite at 157
    const fenceOpen = matchFenceOpenLine();
    const fenceClose = matchFenceCloseLine();
    const staleRangeHigh = fenceClose - MAIN_SHIFT; // the worked-example range at 218 ends here pre-shift
    // Stale-absent (RED at fork).
    expect(
      citesSpecLine(src, staleArm),
      `cell R5: ${BLOCKEXPR} must no longer carry grammar.md:${staleArm} for the arm-body production (lines 211, 289).`,
    ).toBe(false);
    expect(
      citesSpecLine(src, staleFallback),
      `cell R5: ${BLOCKEXPR} must no longer carry grammar.md:${staleFallback} for the \`"fallback"\` tail (line 157).`,
    ).toBe(false);
    expect(
      citesSpecRangeEndingAt(src, staleRangeHigh),
      `cell R5: ${BLOCKEXPR} must no longer carry a worked-example range ending at grammar.md line ${staleRangeHigh} (line 218's pre-shift range).`,
    ).toBe(false);
    // Truth-present (green after; line 153's protected single `grammar.md:164`
    // is not a range and does not satisfy these).
    expect(
      citesSpecLine(src, armBody) || citesSpecLine(src, armSecond) || citesSpecRange(src, armBody, armSecond),
      `cell R5: ${BLOCKEXPR} must cite the arm-body production at grammar.md:${armBody}\u2013${armSecond}.`,
    ).toBe(true);
    expect(
      citesSpecRange(src, fenceOpen, fenceClose),
      `cell R5: ${BLOCKEXPR} must cite the worked example as grammar.md:${fenceOpen}\u2013${fenceClose}.`,
    ).toBe(true);
    expect(
      citesSpecLine(src, fallback),
      `cell R5: ${BLOCKEXPR} must cite the \`"fallback"\` tail at grammar.md:${fallback}.`,
    ).toBe(true);
    // Continuation-form (bare `:from-to`) twins re-pinned this round (bug 0421
    // F2): the top `Spec:` cite list and the cell-(a) comment attribute their
    // bare ranges to grammar.md by the enclosing paragraph. The adjacent-form
    // asserts above cannot see them, so lock the pre-shift range HIGHs gone and
    // the current ones present. Highs are content-derived (truth minus the shift,
    // and the fence bounds), never fixed literals.
    const staleArmHigh = armSecond - MAIN_SHIFT; // pre-shift ArmBody range high
    const staleExampleHigh = fenceClose - MAIN_SHIFT; // pre-shift worked-example high
    expect(
      citesBareRangeEndingAt(src, staleArmHigh),
      `cell R5: ${BLOCKEXPR} must no longer carry a bare continuation range ending at grammar.md line ${staleArmHigh} — the pre-shift ArmBody range.`,
    ).toBe(false);
    expect(
      citesBareRangeEndingAt(src, staleExampleHigh),
      `cell R5: ${BLOCKEXPR} must no longer carry a bare continuation range ending at grammar.md line ${staleExampleHigh} — the pre-shift worked-example range.`,
    ).toBe(false);
    expect(
      citesBareRangeEndingAt(src, armSecond),
      `cell R5: ${BLOCKEXPR} must carry the bare ArmBody continuation range ending at grammar.md:${armSecond}.`,
    ).toBe(true);
    expect(
      citesBareRangeEndingAt(src, fenceClose),
      `cell R5: ${BLOCKEXPR} must carry the bare worked-example continuation range ending at grammar.md:${fenceClose}.`,
    ).toBe(true);
  });

  it("cell R6 (RE-PIN-RED) — b0387 cites the block-expr's second admitted position at its current line", () => {
    const truth = armBodySecondLine();
    const stale = truth - MAIN_SHIFT;
    const src = readCorpus(B0387);
    expect(
      citesSpecLine(src, stale),
      `cell R6: ${B0387} must no longer carry grammar.md:${stale} (line 327).`,
    ).toBe(false);
    expect(
      citesSpecLine(src, truth),
      `cell R6: ${B0387} must cite the block-expr second admitted position at grammar.md:${truth}.`,
    ).toBe(true);
  });

  it("cell R7 (RE-PIN-RED) — schema-alias-union cites the schema block, the by-on-object prose at current lines; the protected line-29 range survives", () => {
    const src = readCorpus(SCHEMA_UNION);
    const blockOpen = schemaBlockOpenLine();
    const blockClose = schemaBlockCloseLine();
    const staleBlockLow = blockOpen - MAIN_SHIFT;
    const staleBlockHigh = blockClose - MAIN_SHIFT;
    const byOnObject = byOnObjectLine();
    const staleByOnObject = byOnObject - MAIN_SHIFT; // the schema-block opening fence now sits at this slot
    // Stale-absent (RED at fork): the pre-shift block range (511, 525), the bare
    // pre-shift schema-block-close cite reworded away (820), the bare by-on-object
    // cite (889, 905). citesSpecLineStrict excludes line 29's protected range.
    expect(
      citesSpecRange(src, staleBlockLow, staleBlockHigh),
      `cell R7: ${SCHEMA_UNION} must no longer carry the pre-shift block range grammar.md:${staleBlockLow}\u2013${staleBlockHigh} (lines 511, 525).`,
    ).toBe(false);
    expect(
      citesSpecLineStrict(src, staleBlockHigh),
      `cell R7: ${SCHEMA_UNION} must no longer carry the bare grammar.md:${staleBlockHigh} (line 820: now a section heading, re-pinned onto the block).`,
    ).toBe(false);
    expect(
      citesSpecLineStrict(src, staleByOnObject),
      `cell R7: ${SCHEMA_UNION} must no longer carry the bare grammar.md:${staleByOnObject} for the by-on-object prose — that line is the block's opening fence (lines 889, 905).`,
    ).toBe(false);
    // Truth-present: the current block range is already cited at the protected
    // line 29 (green at fork and after); the by-on-object prose is green after.
    expect(
      citesSpecRange(src, blockOpen, blockClose),
      `cell R7: ${SCHEMA_UNION} must cite the schema-by-form block as grammar.md:${blockOpen}\u2013${blockClose} (protected line 29).`,
    ).toBe(true);
    expect(
      citesSpecLine(src, byOnObject),
      `cell R7: ${SCHEMA_UNION} must cite the by-on-object rejection prose at grammar.md:${byOnObject}.`,
    ).toBe(true);
    // Continuation-form twin re-pinned this round (bug 0421 F2): the SPEC ANCHORS
    // comment carries a bare backtick `:<n>` for the by-on-object rule, attributed
    // to grammar.md by the paragraph. The adjacent-form asserts above do not see
    // it (and the protected line-29 range shares the pre-shift number), so lock
    // the pre-shift number gone and the current one present. staleByOnObject is
    // (truth minus the shift); byOnObject is content-derived.
    expect(
      citesBareBacktick(src, staleByOnObject),
      `cell R7: ${SCHEMA_UNION} must no longer carry the bare backtick :${staleByOnObject} for the by-on-object rule — that line is the schema-block opening fence.`,
    ).toBe(false);
    expect(
      citesBareBacktick(src, byOnObject),
      `cell R7: ${SCHEMA_UNION} must carry the bare backtick :${byOnObject} for the by-on-object rule.`,
    ).toBe(true);
  });

  it("cell R8 (RE-PIN-RED) — brace-rooted cites FnParam and AliasRhs at current lines; the protected FnDecl half of line 658 survives", () => {
    const src = readCorpus(BRACE_ROOTED);
    const fnParam = fnParamLine();
    const staleFnParam = withValueLine(); // the content now occupying the pre-shift FnParam slot
    const aliasRhs = aliasRhsLine();
    const staleAliasRhs = aliasRhs - MAIN_SHIFT;
    const fnDecl = fnDeclLine();
    // Stale-absent (RED at fork): the bare FnParam cite (653), the AliasRhs cites
    // (1088, 1101), and the grammar.md:138 continuation at 658 whose FnDecl half
    // stays and whose FnParam half is stale.
    expect(
      citesSpecLine(src, staleFnParam),
      `cell R8: ${BRACE_ROOTED} must no longer carry grammar.md:${staleFnParam} for FnParam — that line is now WithValue (line 653).`,
    ).toBe(false);
    expect(
      citesSpecLine(src, staleAliasRhs),
      `cell R8: ${BRACE_ROOTED} must no longer carry grammar.md:${staleAliasRhs} for AliasRhs (lines 1088, 1101).`,
    ).toBe(false);
    expect(
      src.includes(`grammar.md:${fnDecl}/:${staleFnParam}`),
      `cell R8: ${BRACE_ROOTED} must no longer carry the grammar.md:${fnDecl}/:${staleFnParam} continuation — the FnParam half re-pins to :${fnParam}, the FnDecl :${fnDecl} half stays (line 658).`,
    ).toBe(false);
    expect(
      citesSpecLine(src, fnParam),
      `cell R8: ${BRACE_ROOTED} must cite the FnParam pair at grammar.md:${fnParam} (line 653).`,
    ).toBe(true);
    expect(
      citesSpecLine(src, aliasRhs),
      `cell R8: ${BRACE_ROOTED} must cite AliasRhs at grammar.md:${aliasRhs} (its own line 39 already does).`,
    ).toBe(true);
    // Continuation-form twin re-pinned this round (bug 0421 F2): the SPEC ANCHORS
    // comment carries the `:<FnDecl>/:<FnParam>` continuation, attributed to
    // grammar.md by the paragraph. The bare FnParam half shares the pre-shift
    // WithValue slot, so lock the pre-shift pair gone and the current one present.
    // This catches BOTH line 42 (the F2 twin) and line 658's already-handled
    // continuation — both spell `:<FnDecl>/:<FnParam>`.
    expect(
      src.includes(`:${fnDecl}/:${staleFnParam}`),
      `cell R8: ${BRACE_ROOTED} must no longer carry the :${fnDecl}/:${staleFnParam} continuation — the FnParam half re-pins to :${fnParam}.`,
    ).toBe(false);
    expect(
      src.includes(`:${fnDecl}/:${fnParam}`),
      `cell R8: ${BRACE_ROOTED} must carry the :${fnDecl}/:${fnParam} continuation (the FnDecl half stays, the FnParam half current).`,
    ).toBe(true);
  });

  it("cell R9 (RE-PIN-RED) — schema-alias-rhs-malformed cites AliasRhs and the statement-separator prose at current lines", () => {
    const src = readCorpus(SCHEMA_RHS_MALFORMED);
    const aliasRhs = aliasRhsLine();
    const staleAliasRhs = aliasRhs - MAIN_SHIFT;
    const statementSep = statementSepLine();
    const staleStatementSep = statementSep - MAIN_SHIFT; // the EnumDecl anchor bullet now sits here
    expect(
      citesSpecLine(src, staleAliasRhs),
      `cell R9: ${SCHEMA_RHS_MALFORMED} must no longer carry grammar.md:${staleAliasRhs} for AliasRhs (line 518).`,
    ).toBe(false);
    expect(
      citesSpecLine(src, staleStatementSep),
      `cell R9: ${SCHEMA_RHS_MALFORMED} must no longer carry grammar.md:${staleStatementSep} for the statement-separator prose — that line is the EnumDecl anchor bullet (line 1387).`,
    ).toBe(false);
    expect(
      citesSpecLine(src, aliasRhs),
      `cell R9: ${SCHEMA_RHS_MALFORMED} must cite AliasRhs at grammar.md:${aliasRhs} (line 518).`,
    ).toBe(true);
    expect(
      citesSpecLine(src, statementSep),
      `cell R9: ${SCHEMA_RHS_MALFORMED} must cite the statement-separator prose at grammar.md:${statementSep}.`,
    ).toBe(true);
    // The line-26 continuation names the statement-separator prose twice (two
    // stale numbers, now one line); §Fix re-pins the pair onto the current line
    // (or drops the trigger-table row). Lock the "<stale> and <row>" continuation
    // shape gone without pinning the trigger-table-row literal.
    expect(
      src.includes(`:${staleStatementSep} and :`),
      `cell R9: ${SCHEMA_RHS_MALFORMED} must no longer carry the ":${staleStatementSep} and :<row>" statement-separator continuation (line 26).`,
    ).toBe(false);
  });

  it("cell R10 (RE-PIN-RED) — inline-empty-object-type cites the alias-RHS position at its current line", () => {
    const truth = aliasRhsLine();
    const stale = truth - MAIN_SHIFT;
    const src = readCorpus(INLINE_EMPTY);
    expect(
      citesSpecLine(src, stale),
      `cell R10: ${INLINE_EMPTY} must no longer carry grammar.md:${stale} (line 84).`,
    ).toBe(false);
    expect(
      citesSpecLine(src, truth),
      `cell R10: ${INLINE_EMPTY} must cite the alias-RHS position at grammar.md:${truth} (line 84).`,
    ).toBe(true);
  });

  it("cell R11 (RE-PIN-RED) — the two `src/` parser comments cite the alias-form lowering and the recursive-descent bullet at current lines", () => {
    const loweringTruth = fnAliasLoweringLine();
    const loweringStale = loweringTruth - MAIN_SHIFT;
    const doc = readCorpus(THETA_DOCUMENT);
    expect(
      citesSpecLine(doc, loweringStale),
      `cell R11: ${THETA_DOCUMENT} must no longer carry grammar.md:${loweringStale} — that line is blank (line 818).`,
    ).toBe(false);
    expect(
      citesSpecLine(doc, loweringTruth),
      `cell R11: ${THETA_DOCUMENT} must cite the alias-form lowering sentence at grammar.md:${loweringTruth} (line 818).`,
    ).toBe(true);

    const sinkTruth = recursiveLine();
    const sinkStale = sinkTruth - MAIN_SHIFT;
    const checks = readCorpus(TYPE_LAYER_CHECKS);
    expect(
      citesSpecLine(checks, sinkStale),
      `cell R11: ${TYPE_LAYER_CHECKS} must no longer carry grammar.md:${sinkStale} — that line is the newline-closes sentence (lines 2298, 2343).`,
    ).toBe(false);
    expect(
      citesSpecLine(checks, sinkTruth),
      `cell R11: ${TYPE_LAYER_CHECKS} must cite the recursive-descent sink bullet at grammar.md:${sinkTruth} (lines 2298, 2343).`,
    ).toBe(true);
  });
});
