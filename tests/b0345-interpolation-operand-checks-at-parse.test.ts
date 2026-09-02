// Bug 0345 — `walkExpr`'s `case "query"`
// (src/parser/type-layer-checks.ts:3255) calls `checkQueryInterpolationResults`
// and returns, never descending into the interpolation expression, so the three
// operand checks the binary arm dispatches — `checkPlusOperands`
// (src/parser/type-layer-checks.ts:3092), `checkOrderingOperands`
// (src/parser/type-layer-checks.ts:3094), and `checkArithmeticOperands`
// (src/parser/type-layer-checks.ts:3103) — never reach a `${…}` expression. So
// `${"a" + 1}` renders `a1`, `${"b" < 1}` renders `false`, and `${"a" - 1}`
// parses clean where the byte-identical `let` RHS refuses at load.
// (docs/bugs/0345-interpolation-expressions-skip-all-operand-checks-at-parse.md)
//
// SPEC. QRY-18 (docs/spec_topics/query/query-escapes-stringification.md#qry-18)
// evaluates a `${expr}` interpolation "per the Expression Sublanguage", so the
// operand rules of docs/spec_topics/expressions.md §"`+` operator" (mixed
// operands → `theta/parse/mixed-plus-operands`), §"Other arithmetic"
// (non-numeric operands → `theta/parse/non-numeric-arithmetic-operands`), and
// §"Ordering comparisons" (a non-`{numeric,numeric}`/non-`{string,string}` pair
// → `theta/parse/non-orderable-operands`) govern interpolation position. The bug
// doc §Expected requires the interpolation to draw the SAME parse diagnostic the
// byte-identical `let`-RHS expression draws, relocated to the enclosing
// @`-query's range, and requires the spelled-arithmetic case to refuse at LOAD
// (no longer deferring to the bug 0338 runtime belt) when the operands are
// statically resolvable.
//
// SETTLED DESIGN (the orchestrator's premeasure, treated as given). The fix
// descends from the `case "query"` arm into each parsed interpolation source and
// runs ONLY the three operand checks, recursing into nested sub-expressions and
// relocating the diagnostic to the enclosing @`-query range. It does NOT run
// method-call/index/member/question checks. The existing
// `checkQueryInterpolationResults` call stays FIRST; the operand descent is
// appended AFTER, so `theta/parse/interpolated-result`
// (src/parser/type-layer-checks.ts:3369) is emitted BEFORE any operand code for
// an interpolation that is both. Deferral parity: a statically-UNRESOLVABLE
// operand still defers (no parse refusal) exactly as the body-statement path
// does, so the bug 0338 belt remains the runtime backstop.
//
// WITNESS SUMMARY (measured offline at HEAD 162cea83, provider-free):
//   PARSE cells 1–3, 6 — RED now: the interpolation draws `[]` (cells 1–3) or
//     drops the operand row (cell 6) where the settled rule requires the
//     relocated operand diagnostic; GREEN after the descent lands.
//   RENDER cells 4–5 — the numeric baseline renders `v=3` byte-identically, and
//     the withheld-binder interpolation loads clean and defers. The deferred
//     runtime disposition: arithmetic reaches the bug 0338 belt as a loud framed
//     abort (5b); `+`/ordering reach the bug 0368 belt as a loud framed abort
//     (5c, re-anchored — bug 0368 supersedes bug 0345 §Residuals-1's runtime
//     concession on the runtime surface; the parse-boundary deferral is 5a's and
//     unchanged).
//
// TIER. Unit (offline, provider-free, deterministic). The seam is the parser's
// `walkExpr` query arm and the pure-host render, both reachable through
// `parseThetaDocument` and the production prompt-mode binding without a provider
// or model — an integration or live tier reaches nothing this tier cannot. The
// paired live acceptance cell
// (tests/live/acceptance/b0345-interpolation-operand-refusal.test.ts) proves the
// same refusal end-to-end through the real `pi -p` binary; it is not required to
// witness the defect.
//
// HARNESSES. The parse cells reuse `tests/helpers/e2e-s1.ts`'s `parseDoc` (the
// bug 0122 witness `tests/interpolation-parse-diagnostics.test.ts` shape). The
// render cells reproduce the bug 0338 instant-settle drive
// (`tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts`'s `driveInterp`)
// rather than importing it, so this file does not depend on those files'
// internals. The bug 0345 fix DOES re-pin the enumerated flip cells in both the
// bug 0122 and bug 0338 witnesses (the string-operand interpolation cells move
// from a runtime observable to a load refusal); those re-pins are the fix's, not
// this file's.
//
// No silent skipping: every unmet precondition below throws naming itself.

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaDocument } from "../src/parser/theta-document";
import {
  INTERPOLATED_RESULT_CODE,
  INTERPOLATED_RESULT_MESSAGE,
} from "../src/render/query-render";
import { executeBody } from "../src/runtime/statement-executor";
import {
  INTERNAL_ERROR_CODE,
  isThetaPanic,
  surfaceUnexpectedThrow,
} from "../src/runtime/runtime-panics";
import type { ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import { parseDoc } from "./helpers/e2e-s1";

// The three registered operand codes (expressions.md §"`+` operator", §"Other
// arithmetic", §"Ordering comparisons").
const MIXED_PLUS_CODE = "theta/parse/mixed-plus-operands";
const NON_ORDERABLE_CODE = "theta/parse/non-orderable-operands";
const NON_NUMERIC_ARITHMETIC_CODE = "theta/parse/non-numeric-arithmetic-operands";

// Two non-operand codes the operand-scoped descent must NOT own: the
// question-on-non-result code residual 1 keeps (F1 cell F1b) and the
// interpolation-form refusal `match` draws (F2 cell). Named here so the
// operand-scope boundary is asserted, not left implicit.
const QUESTION_ON_NON_RESULT_CODE = "theta/parse/question-on-non-result";
const UNSUPPORTED_FEATURE_CODE = "theta/parse/unsupported-feature";

/** The source path every fixture parses under; also the diagnostics' `file`. */
const FIXTURE_PATH = "/theta/bug0345.theta";

/** Prompt-mode frontmatter — occupies the fixture's leading lines. */
const FM = "---\nmode: prompt\n---\n";

/**
 * The bare `@`-query interpolation of one expression — the §Reproduction body
 * shape (`@`v=${…}``). The SAME source drives the parse assertion and the render
 * drive, so a parse cell and its render twin never diverge on the fixture.
 */
function interpSrc(expr: string, preamble = ""): string {
  return `${FM}${preamble}@\`v=${"${"}${expr}}\`\n`;
}

/**
 * `let _ = <expr>` — the `let`-RHS control that judges what the interpolation
 * owes. `preamble` carries any definitions the expression references (a `fn`
 * whose call the interpolation unwraps), placed identically ahead of both the
 * control and the interpolation so the two stay byte-comparable.
 */
function rhsSrc(expr: string, preamble = ""): string {
  return `${FM}${preamble}let _ = ${expr}\n`;
}

/** The comparable projection of a diagnostic: everything the settled rule pins. */
interface Row {
  readonly severity: string;
  readonly code: string;
  readonly message: string;
  readonly file: string | undefined;
  readonly range: SourceRange | undefined;
}

function project(diags: readonly Diagnostic[]): Row[] {
  return diags.map((d) => ({
    severity: d.severity,
    code: d.code,
    message: d.message,
    file: d.file,
    range: d.range,
  }));
}

/** Code + message only — the parity projection, which ignores the range. */
function codeAndMessage(diags: readonly Diagnostic[]): { code: string; message: string }[] {
  return diags.map((d) => ({ code: d.code, message: d.message }));
}

/** A compact rendering of a document's diagnostics for failure messages. */
function show(doc: ThetaDocument): string {
  return doc.diagnostics.length === 0
    ? "[] (no diagnostic of ANY severity)"
    : doc.diagnostics
        .map(
          (d) =>
            `${d.severity} ${d.code}: ${d.message} @ ${
              d.range === undefined
                ? "<unlocated>"
                : `${d.range.start.line}:${d.range.start.column}`
            }`,
        )
        .join("; ");
}

/** Every `kind: "query"` node in a parsed document, in traversal order. */
function queryNodes(node: unknown, out: { range: SourceRange }[]): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) {
      queryNodes(v, out);
    }
    return;
  }
  const rec = node as Record<string, unknown>;
  if (rec["kind"] === "query" && typeof rec["template"] === "string") {
    out.push({ range: rec["range"] as SourceRange });
  }
  for (const v of Object.values(rec)) {
    queryNodes(v, out);
  }
}

/**
 * The range of the fixture's SOLE @`-query expression — the location the settled
 * rule requires every relocated diagnostic to carry (the same choice
 * `checkQueryInterpolationResults` (src/parser/type-layer-checks.ts:3349) makes
 * for `theta/parse/interpolated-result`). A fixture carrying anything other than
 * exactly one query fails loudly rather than comparing against a guess.
 */
function soleQueryRange(doc: ThetaDocument): SourceRange {
  const found: { range: SourceRange }[] = [];
  queryNodes(doc.body, found);
  if (found.length !== 1) {
    throw new Error(
      `harness: this fixture must carry exactly ONE @\`-query expression whose range ` +
        `locates the relocated diagnostics; found ${found.length}`,
    );
  }
  return (found[0] as { range: SourceRange }).range;
}

/**
 * PRIMARY assertion for a parse cell: the interpolation's whole diagnostics
 * array is exactly what the `let`-RHS control draws, relocated to the enclosing
 * @`-query's range in the fixture's file — and the control draws exactly
 * `expectedCodes`, which is the parity half that anchors the cell. Messages are
 * READ from the control, never hardcoded, so a registry-wording change cannot
 * silently stale this file.
 *
 * RED now: the query arm returns after `checkQueryInterpolationResults`, so the
 * interpolation draws `[]` while `expected` is the relocated operand row.
 */
function assertInterpDrawsRelocated(
  expr: string,
  expectedCodes: readonly string[],
  why: string,
  preamble = "",
): void {
  const control = parseDoc(rhsSrc(expr, preamble), FIXTURE_PATH);
  const controlRows = codeAndMessage(control.diagnostics);
  expect(
    control.diagnostics.map((d) => d.code),
    `PARITY (bug 0345, the settled rule's other half): the \`let\`-RHS control ` +
      `\`let _ = ${expr}\` is the judge of what the interpolation owes. If this reds, the ` +
      `expected codes are stale, not the production. Observed: ${show(control)}`,
  ).toEqual([...expectedCodes]);

  const doc = parseDoc(interpSrc(expr, preamble), FIXTURE_PATH);
  const range = soleQueryRange(doc);
  expect(
    project(doc.diagnostics),
    `PRIMARY (bug 0345 §Expected): \`\${${expr}}\` must draw exactly the operand diagnostics ` +
      `\`let _ = ${expr}\` draws, relocated to the enclosing @\`-query's range. ${why}. ` +
      `Observed interpolation diagnostics: ${show(doc)}`,
  ).toEqual(
    controlRows.map((r) => ({
      severity: "error",
      code: r.code,
      message: r.message,
      file: FIXTURE_PATH,
      range,
    })),
  );
}

// ===========================================================================
// PARSE cells 1–3 — the interpolation must draw the operand diagnostic its
// `let`-RHS control draws, relocated to the enclosing @`-query's range.
// RED now: the interpolation draws `[]`.
// ===========================================================================

describe("bug 0345 (parse) — operand checks reach interpolation position", () => {
  it('RED (1a): `@`v=${"a" + 1}`` draws theta/parse/mixed-plus-operands at the query range', () => {
    // Measured inside `${…}`: []. At `let`-RHS: [mixed-plus-operands]. Pre-fix
    // this renders `v=a1` into the prompt (cell 1a render below).
    assertInterpDrawsRelocated(
      '"a" + 1',
      [MIXED_PLUS_CODE],
      "expressions.md §\"`+` operator\": a mixed string/number pair; the emitter is at " +
        "src/parser/type-layer-checks.ts:3764",
    );
  });

  it('RED (1b): `@`v=${1 + "a"}`` draws theta/parse/mixed-plus-operands at the query range', () => {
    // The operand-order twin of (1a): measured `[]` inside `${…}`,
    // [mixed-plus-operands] at `let`-RHS. Pre-fix renders `v=1a`.
    assertInterpDrawsRelocated(
      '1 + "a"',
      [MIXED_PLUS_CODE],
      "expressions.md §\"`+` operator\": the reversed-operand mixed pair",
    );
  });

  it('RED (2): `@`v=${"b" < 1}`` draws theta/parse/non-orderable-operands at the query range', () => {
    // Measured `[]` inside `${…}`, [non-orderable-operands] at `let`-RHS. Pre-fix
    // renders the JS boolean `v=false`. Emitter at
    // src/parser/type-layer-checks.ts:3799.
    assertInterpDrawsRelocated(
      '"b" < 1',
      [NON_ORDERABLE_CODE],
      "expressions.md §\"Ordering comparisons\": a non-`{string,string}`/non-`{numeric,numeric}` pair",
    );
  });

  it('RED (3): `@`v=${"a" - 1}`` refuses at LOAD (no longer deferred to the bug 0338 belt)', () => {
    // The refusal-TIMING half of the bug. `"a" - 1` is statically resolvable, so
    // it must refuse at load like every other position — NOT defer to the
    // runtime belt. Measured `[]` inside `${…}` (belt throws at render, cell 3
    // render below), [non-numeric-arithmetic-operands] at `let`-RHS. Emitter at
    // src/parser/type-layer-checks.ts:3835.
    assertInterpDrawsRelocated(
      '"a" - 1',
      [NON_NUMERIC_ARITHMETIC_CODE],
      "expressions.md §\"Other arithmetic\": statically-resolvable, so refused at load — the " +
        "bug doc §Expected forbids deferring the resolvable pairing to the bug 0338 belt",
    );
  });
});

// ===========================================================================
// PARSE cell 6 — result-classification co-existence. `g` is a `fn` whose written
// return annotation names `Result`, so `checkQueryInterpolationResults`
// classifies `g("a" - 1)` as a `Result` and pushes
// `theta/parse/interpolated-result` (src/parser/type-layer-checks.ts:3369). The
// operand descent, running AFTER it, reaches the call argument `"a" - 1` and
// pushes the arithmetic operand code. The settled ordering is DELIBERATE:
// Result first, operand second.
//
// RED now: only `theta/parse/interpolated-result` is present — the descent that
// would append the operand row does not run.
// ===========================================================================

describe("bug 0345 (parse) — Result + operand co-existence, deliberate ordering", () => {
  const FN = "fn g(x): Result<integer, QueryError> { Ok(1) }\n";

  it('RED (6): `@`v=${g("a" - 1)}`` draws [interpolated-result, non-numeric-arithmetic] in that order', () => {
    const doc = parseDoc(`${FM}${FN}@\`v=${"${"}g("a" - 1)}\`\n`, FIXTURE_PATH);
    const range = soleQueryRange(doc);

    // Parity anchor for the operand half: the call-arg operand at `let`-RHS
    // draws exactly the arithmetic code (interpolated-result is
    // interpolation-only and has no `let`-RHS analogue).
    const control = parseDoc(`${FM}${FN}let _ = g("a" - 1)\n`, FIXTURE_PATH);
    const operandRow = codeAndMessage(control.diagnostics);
    expect(
      control.diagnostics.map((d) => d.code),
      `PARITY (bug 0345): the operand half's control \`let _ = g("a" - 1)\` draws the ` +
        `arithmetic operand code. Observed: ${show(control)}`,
    ).toEqual([NON_NUMERIC_ARITHMETIC_CODE]);

    expect(
      project(doc.diagnostics),
      "PRIMARY (bug 0345 §Fix): an interpolation that is BOTH a Result AND a statically-" +
        "resolvable operand violation draws BOTH codes, Result FIRST (checkQueryInterpolationResults " +
        "runs before the appended operand descent), each relocated to the query range. Observed: " +
        show(doc),
    ).toEqual([
      {
        severity: "error",
        code: INTERPOLATED_RESULT_CODE,
        message: INTERPOLATED_RESULT_MESSAGE,
        file: FIXTURE_PATH,
        range,
      },
      {
        severity: "error",
        code: operandRow[0]!.code,
        message: operandRow[0]!.message,
        file: FIXTURE_PATH,
        range,
      },
    ]);
  });
});

// ===========================================================================
// F1 cells — a top-level `?` interpolation must be DESCENDED, not skipped. The
// pre-fix guard skipped the whole subtree of a top-level `try`, so a byte-
// identical operand violation drew nothing where the `let`-RHS drew the operand
// row. The guard now skips only a genuine parse `null`; the `try` operand is
// reached through `childExprs`' `try` arm.
// ===========================================================================

describe("bug 0345 (parse) F1 — top-level `?` interpolation is descended", () => {
  it('RED (F1a): `@`v=${f("a" + 1)?}`` draws [mixed-plus-operands] at the query range (parity)', () => {
    // A top-level `try` wrapping a Result-returning call must be descended so the
    // call argument's mixed pair is caught. `?`-unwrapping a Result is valid, so
    // neither the interpolation nor its `let`-RHS control draws
    // question-on-non-result: both draw the SAME single operand row (parity), so
    // the parity helper applies. The `fn` preamble makes `f` resolvable, keeping
    // the control at exactly [mixed-plus-operands].
    assertInterpDrawsRelocated(
      'f("a" + 1)?',
      [MIXED_PLUS_CODE],
      "the top-level `?` unwraps a Result-returning call whose argument `\"a\" + 1` is the mixed " +
        "pair expressions.md §\"`+` operator\" refuses, reached through `childExprs`' `try` then `call` arms",
      "fn f(x): Result<integer, QueryError> { Ok(1) }\n",
    );
  });

  it('RED (F1b): `@`v=${("a" + 1)?}`` draws EXACTLY [mixed-plus-operands], operand-scoped', () => {
    // The descent is OPERAND-SCOPED: it fires the three operand checks only, so
    // `${("a" + 1)?}` draws just the mixed-plus row and leaves the
    // question-on-non-result row (a non-operand code) to residual 1. This is
    // NON-parity by design — the `let`-RHS control draws BOTH codes — so the
    // parity helper does not apply; the interpolation is pinned directly.
    const expr = '("a" + 1)?';
    const control = parseDoc(rhsSrc(expr), FIXTURE_PATH);
    expect(
      control.diagnostics.map((d) => d.code),
      "PARITY-BREAK anchor (bug 0345 F1b): the `let`-RHS control draws BOTH the non-operand " +
        `question-on-non-result row AND the operand row; the operand-scoped descent keeps only the ` +
        `latter. Observed: ${show(control)}`,
    ).toEqual([QUESTION_ON_NON_RESULT_CODE, MIXED_PLUS_CODE]);

    const mixedRow = control.diagnostics.find((d) => d.code === MIXED_PLUS_CODE);
    if (mixedRow === undefined) {
      throw new Error(
        "harness (F1b): the `let`-RHS control must carry the mixed-plus row whose message the " +
          "interpolation assertion reads; none found",
      );
    }
    const doc = parseDoc(interpSrc(expr), FIXTURE_PATH);
    const range = soleQueryRange(doc);
    expect(
      project(doc.diagnostics),
      "PRIMARY (bug 0345 F1b): the operand-scoped descent draws EXACTLY the mixed-plus row, " +
        `relocated to the query range — it owns the operand code and leaves the ` +
        `question-on-non-result row to residual 1. Observed: ${show(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: MIXED_PLUS_CODE,
        message: mixedRow.message,
        file: FIXTURE_PATH,
        range,
      },
    ]);
  });
});

// ===========================================================================
// F2 cell — a `match` interpolation is unconditionally refused
// (`firstForbiddenInterpolationForm` → theta/parse/unsupported-feature). The
// operand descent must skip the refused node whole rather than recurse into its
// arm bodies, which stacked a spurious operand row on the already-refused doc.
// ===========================================================================

describe("bug 0345 (parse) F2 — refused `match` interpolation draws no bogus operand row", () => {
  it('RED (F2): `@`v=${match z { 1 => "a" + 1 }}`` draws unsupported-feature only', () => {
    const doc = parseDoc(`${FM}let z = 1\n@\`v=${"${"}match z { 1 => "a" + 1 }}\`\n`, FIXTURE_PATH);
    const codes = doc.diagnostics.map((d) => d.code);
    expect(
      codes,
      `bug 0345 F2: the match refusal (theta/parse/unsupported-feature) stands. Observed: ${show(doc)}`,
    ).toContain(UNSUPPORTED_FEATURE_CODE);
    expect(
      codes,
      "bug 0345 F2: no bogus operand row — the descent skips the refused `match` node whole rather " +
        `than recursing into its arm bodies. Observed: ${show(doc)}`,
    ).not.toContain(MIXED_PLUS_CODE);
  });
});

// ===========================================================================
// F3 cell — STATED RESIDUAL. `par for` is admitted in interpolation position,
// but `checkInterpolationOperands` does not descend into its iterand/max/body
// (`childExprs` carries no par-for arm), so a par-for-body operand violation is
// not refused at load: it defers to the runtime (the bug 0338 belt for
// arithmetic, coercion for `+`/ordering), consistent with §Fix constraint 4's
// deferral posture. This is a BOUNDED residual not owned by bug 0345 — closing
// it replicates walkExpr's par-for loop-variable scope, out of this fix's scope,
// and the exotic shape is exercised by no committed fixture or live theta. A
// future fix flips this deliberately; the runtime belt is the backstop.
// ===========================================================================

describe("bug 0345 (parse) F3 — stated residual: par-for-in-interpolation operand descent", () => {
  it('RESIDUAL (F3): `@`v=${par for x in ["a" - 1] { x }}`` parses `[]`; control draws the operand row', () => {
    const expr = 'par for x in ["a" - 1] { x }';
    const doc = parseDoc(interpSrc(expr), FIXTURE_PATH);
    expect(
      project(doc.diagnostics),
      "RESIDUAL SILENCE (bug 0345 F3): the descent does not reach a par-for body, so this operand " +
        `violation defers to the runtime and the interpolation loads clean. Observed: ${show(doc)}`,
    ).toEqual([]);
    const control = parseDoc(rhsSrc(expr), FIXTURE_PATH);
    expect(
      control.diagnostics.map((d) => d.code),
      "PINNED RESIDUAL (bug 0345 F3): the `let`-RHS control refuses the par-for body operand at " +
        `load, recording the gap the interpolation descent leaves open. Observed: ${show(control)}`,
    ).toEqual([NON_NUMERIC_ARITHMETIC_CODE]);
  });
});

// ===========================================================================
// RENDER cells — the bug 0338 instant-settle drive over the production
// prompt-mode binding, reproduced here (that file is a lock). An untyped
// prompt-mode query dispatches no `complete()`, so no provider and no model is
// involved: the injected Clock's `setTimeout` ticks the double.
// ===========================================================================

/** The zero body range `surfaceUnexpectedThrow` frames a caught throw against. */
const SITE = {
  file: "b0345.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

/** The instant-settle user session: one send commits user + reply synchronously. */
class InstantSettleSession {
  readonly entries: Array<Record<string, unknown>> = [];
  readonly sent: string[] = [];

  sendUserMessage(text: string): void {
    this.sent.push(text);
    this.entries.push({
      type: "message",
      id: `u${this.entries.length + 1}`,
      parentId: undefined,
      message: { role: "user", content: [{ type: "text", text }] },
    });
    this.entries.push({
      type: "message",
      id: `a${this.entries.length + 1}`,
      parentId: `u${this.entries.length}`,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "settled-reply" }],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "m1",
        stopReason: "stop",
      },
    });
  }

  isIdle(): boolean {
    return true;
  }
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so the instant-settle turn completes deterministically.
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}

/** One interpolation drive's disposition: the query rendered + sent, or a throw. */
type InterpProbe =
  | { readonly kind: "rendered"; readonly sent: readonly string[]; readonly outcome: string; readonly value: ThetaValue | undefined }
  | { readonly kind: "threw"; readonly sent: readonly string[]; readonly thrown: unknown };

/** Parse a fixture, failing LOUDLY on any error-severity diagnostic before driving it. */
function parseCleanBody(src: string): ThetaDocument {
  const doc = parseDoc(src, FIXTURE_PATH);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture failed to parse clean before drive: ${errors
        .map((d) => `${d.code}: ${d.message}`)
        .join("; ")}`,
    );
  }
  return doc;
}

async function driveInterp(src: string): Promise<InterpProbe> {
  const doc = parseCleanBody(src);
  const session = new InstantSettleSession();
  const pi = {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  const ctx = {
    model: { id: "m1", api: "anthropic-messages", provider: "anthropic", strictCapable: true },
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly unknown[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
  const theta: ThetaCompositionInput = {
    slashName: "b0345",
    sourcePath: "/proj/b0345.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({ theta, args: "", ctx });
  try {
    const execution = await executeBody(theta.body, binding.executeDeps);
    return {
      kind: "rendered",
      sent: session.sent,
      outcome: execution.outcome,
      value: execution.result.value,
    };
  } catch (thrown) {
    return { kind: "threw", sent: session.sent, thrown };
  }
}

/** A caught throw must be the bug 0338 belt's plain `Error` that frames to internal-error. */
function assertFramesToInternalError(thrown: unknown, what: string): void {
  expect(
    isThetaPanic(thrown),
    `${what}: the belt is a plain Error, NOT a ThetaPanic; thrown: ${String(thrown)}`,
  ).toBe(false);
  const diagnostic = surfaceUnexpectedThrow(thrown, SITE);
  const diag = diagnostic as Diagnostic;
  expect(
    diag.code,
    `${what}: the belt throw routes to the internal-error surface (theta/runtime/internal-error)`,
  ).toBe(INTERNAL_ERROR_CODE);
}

describe("bug 0345 (render) — numeric baseline and deferral parity (green now and after)", () => {
  it("CONTROL (4): `@`v=${1 + 2}`` renders and sends the prompt text `v=3` byte-identically", async () => {
    // The QRY-18 numeric baseline. The descent adds no operand refusal (both
    // operands are numbers), so the render and the sent prompt must be
    // byte-identical before and after the fix.
    const probe = await driveInterp(interpSrc("1 + 2"));
    if (probe.kind === "threw") {
      expect(
        `threw ${String(probe.thrown)}`,
        "(4): a numeric interpolation must render `v=3`, not throw",
      ).toBe("rendered + sent [\"v=3\"]");
      return;
    }
    expect(probe.outcome, "(4): the settled turn binds its reply").toBe("success");
    expect(
      probe.sent,
      "(4): the numeric baseline renders `v=3` and reaches the wire unchanged",
    ).toEqual(["v=3"]);
  });

  // A withheld (unannotated) `fn` param is statically UNRESOLVABLE, so the three
  // operand checks defer — exactly as the body-statement path defers. The
  // descent inherits that deferral, so these interpolations must LOAD CLEAN.
  const withheldSrc = (op: string): string => `${FM}fn f(x) {\n  @\`v=${"${"}x ${op} 1}\`\n}\nf("a")\n`;

  it("PARITY (5a): a withheld-param arithmetic interpolation LOADS CLEAN and defers", () => {
    // The deferral half: statically-unresolvable operands mean no parse refusal,
    // now and after the descent lands.
    const doc = parseDoc(withheldSrc("-"), FIXTURE_PATH);
    expect(
      doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
      `(5a): a withheld-param operand is statically unresolvable, so the descent DEFERS and the ` +
        `theta loads without a parse refusal (bug 0345 §Fix deferral parity). Observed: ${show(doc)}`,
    ).toEqual([]);
  });

  it("PARITY (5b): the deferred arithmetic reaches the bug 0338 belt — loud framed abort, no prompt sent", async () => {
    // The runtime half: `x` binds `"a"` at the call, so `x - 1` reaches the pure-
    // host belt (BinaryNonNumericError, src/runtime/statement-executor.ts:661),
    // which frames to theta/runtime/internal-error. The belt is bug 0345's
    // deferred-operand backstop and must stay green.
    const probe = await driveInterp(withheldSrc("-"));
    if (probe.kind === "rendered") {
      expect(
        `rendered + sent ${JSON.stringify(probe.sent)}`,
        "(5b): a deferred string-operand arithmetic must abort loudly at the belt, not render",
      ).toBe("loud framed abort (no prompt sent)");
      return;
    }
    assertFramesToInternalError(probe.thrown, "5b");
    expect(
      probe.sent,
      "(5b): the belt throws at render, so no prompt is sent",
    ).toEqual([]);
  });

  it("PARITY (5c): deferred `+`/ordering reach the bug 0368 belt — loud framed abort, no prompt sent", async () => {
    // Re-anchored under bug 0368 (docs/bugs/0368-plus-and-ordering-laundered-
    // operands-silent-js-coercion.md): bug 0368's runtime belt supersedes bug
    // 0345's §Fix §Residuals item 1 runtime concession ("JS coercion for
    // `+`/ordering") ON THE RUNTIME SURFACE. A withheld-param `+`/`<` is
    // statically unresolvable, so it defers past the parse gate exactly as 5a
    // witnesses — that parse-boundary deferral subject is 5a's and is UNCHANGED.
    // What changes is only the deferred pair's runtime disposition: instead of
    // JS-coercing (`v=a1`, `v=false`), it now hits the bug 0368 belt and aborts
    // loudly, mirroring 5b's `-` belt disposition exactly.
    const plus = await driveInterp(withheldSrc("+"));
    if (plus.kind === "rendered") {
      expect(
        `rendered + sent ${JSON.stringify(plus.sent)}`,
        "(5c): a deferred withheld-param `+` must abort loudly at the bug 0368 belt, not render",
      ).toBe("loud framed abort (no prompt sent)");
      return;
    }
    assertFramesToInternalError(plus.thrown, "5c `+`");
    expect(
      plus.sent,
      "(5c): the `+` belt throws at render, so no prompt is sent",
    ).toEqual([]);
    const ordering = await driveInterp(withheldSrc("<"));
    if (ordering.kind === "rendered") {
      expect(
        `rendered + sent ${JSON.stringify(ordering.sent)}`,
        "(5c): a deferred withheld-param `<` must abort loudly at the bug 0368 belt, not render",
      ).toBe("loud framed abort (no prompt sent)");
      return;
    }
    assertFramesToInternalError(ordering.thrown, "5c `<`");
    expect(
      ordering.sent,
      "(5c): the ordering belt throws at render, so no prompt is sent",
    ).toEqual([]);
  });
});
