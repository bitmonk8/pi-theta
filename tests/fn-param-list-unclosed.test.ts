import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { FnDecl, FnParam, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0151 — an unclosed `fn` parameter list draws no structural diagnostic
// (docs/bugs/0151-unclosed-fn-parameter-list-accepted.md).
//
// THE RULE. `FnDecl ::= "fn" Ident "(" FnParams? ")" (":" ReturnType)? FnBody`
// (docs/spec_topics/grammar.md:138 — the spec production now carries `SubagentMod?`
// and `WithClause?` too, theta-1.2 slots the fn-unclosed rule does not exercise) makes the closing `)` a
// required terminal with no alternative, `FnParams ::= FnParam ("," FnParam)*
// ","?` (grammar.md:144 / docs/reference/grammar.md:295), with
// `FnParam ::= Ident ":" Type` (grammar.md:145), derives no `{`, no
// `let`, no `fn` and no numeric literal at a `FnParam` position, and
// grammar.md:148 restates it in prose ("The parameter list is parenthesised in
// every case"). FN-1 (docs/spec_topics/functions.md:20) makes that production
// normative for the surface form.
//
// THE DEFECT AT HEAD. `parseFn` (src/parser/theta-document.ts:2324) enforces
// the OPENING paren (`:2332–2341`, pushing `theta/parse/unsupported-feature`
// with the `fn parameter list must be parenthesised` tail) and not the closing
// one: the parameter loop is `while (!this.isPunct(")") && !this.atEnd())`
// (`:2353`) and its `)`-consuming epilogue is conditional (`:2416–2418`), so
// reaching EOF without a `)` is indistinguishable from finding one. The lexer
// removes the boundary that would otherwise stop the loop —
// `collapseContinuations` swallows a newline run while bracket depth is open
// (its `swallow = depth > 0 || …` test, `src/lexer/lexer.ts`), which is the
// spec's own first continuation trigger and is correct for a bracket that
// CLOSES — so the file's remainder joins the parameter list. Measured at HEAD:
// `fn h(p: string { 1 }` loads with ZERO diagnostics, records the function's
// own body `{`, `1` and `}` as three further parameters, and REGISTERS.
//
// THE CONTRACT THIS FILE PINS — the settled route, one emission per unclosed
// list, plus resynchronisation at the body brace:
//   1. `parseFn` captures the opening `(` and marks the list unclosed on BOTH
//      arms — a `{` at a parameter-NAME position (a block-open brace derives
//      from no `FnParam`, and a `)` before it would have exited the loop) and
//      the loop's EOF exit — pushing exactly ONE diagnostic after the loop.
//   2. The `{` break leaves the cursor ON the brace, so `parseBlock` takes it
//      as the `FnBody` and `parseForms` re-enters at the following statement:
//      the absorbed statements return to the top-level statement list.
//   3. The emission carries a NEW registered row (a DIAG-2 addition landing in
//      the same commit, docs/spec_topics/diagnostics/diagnostic-shape.md:72):
//      `theta/parse/fn-param-list-unclosed`, severity E, phase parse,
//      placeholder-free *Message* `fn parameter list is not closed by ')'`,
//      scoped to `fn` parameter lists, ranged on the OPENING `(`.
//   4. WITHHELD where a parameter TYPE capture absorbed the author's `)` (the
//      captured type text contains `)` — bug 0124's declined `<`/`>` over-run
//      class): both the verdict and the recovery are withheld and the input
//      keeps HEAD's exact behaviour.
// The code is `E`, so `hasLoadParseError`
// (`src/extension/production-composition.ts`) denies registration — the
// `registered` predicate asserted per row below is that gate's own
// `!diagnostics.some(d => d.severity === "error")`.
//
// THE LEDGER — what each group pins:
//   - NEWLY REFUSED, `{` present (a1, a2, a4–a9): the emission on the
//     brace-break arm, the recovered single parameter, the recovered `FnBody`,
//     and the returned following statement (a5, a6). a7 is the `.thetalib`
//     route, a8 the `subagent fn` form, a9 the three-code ordered pile.
//   - NEWLY REFUSED at EOF (b1, b2, b3, b5, c6, c7): the loop's EOF-exit arm,
//     beside the lexer's pre-existing `single-line-if` (which fires for its own
//     unrelated reason and names neither the list nor the missing `)`).
//   - c8: the Decision-4 side effect — exactly ONE
//     `theta/parse/binding-case-mismatch` where HEAD emits TWO, because the
//     resync removes the parser-side arm (the `X` is no longer a parameter).
//   - e4: a disposition change no committed test asserts (`array<string { 1 }`
//     captures the brace INTO the type, so the loop still exits at EOF).
//   - MUST NOT MOVE (g1–g8, the `mut` and `let` parameter-slot boundaries, and
//     the three WITHHELD rows): every one of these is asserted with its HEAD
//     behaviour, unchanged. c3/c4/d1 below no longer belong to this list —
//     bug 0225's route reaches them.
//
// THE FOREIGN-`)` ROWS, UPDATED BY BUG 0225. c3, c4 and d1 exit this route's
// loop on a `)` that belongs to something else, so this file's own route
// still says nothing about the closed/unclosed distinction on them — but bug
// 0225 (docs/bugs/0225-fn-param-list-foreign-close-paren-silent.md) adds a
// second predicate, judged at every parameter-name position regardless of how
// the list closes, and it reaches all three: each row gains one
// `theta/parse/fn-param-not-identifier` diagnostic at the first swallowed
// token this file's own codes do not already refuse (the `=` in c3, the `(`
// in c4, the `=` in d1), ranged and ordered after this file's rows. The
// recorded parameter arrays are unmoved — bug 0225's route defers its
// emission to the list's own `)` arm without breaking or resyncing, so
// nothing here recovers. d1's duplicate `binding-case-mismatch` also
// persists: measured, not assumed, because a route that resynchronised at the
// swallowed statement would have removed it (as c8 does), and this route does
// not resynchronise anything.
//
// DIAG-4 (diagnostic-shape.md:74) — no asserted message string is written out.
// Every one is READ from the registry's *Message* column through
// `parseRegistry` / `registryMessage` (tools/code-registry/index.js) via the
// `msg` helper, INCLUDING the new row's: until the implementer adds the
// `theta/parse/fn-param-list-unclosed` row to
// docs/spec_topics/diagnostics/code-registry-parse.md (and its
// docs/reference/diagnostics.md mirror), `msg` reds by naming the registry.
// That red is intended: DIAG-2 makes the row part of the same commit.
//
// ANTI-VACUITY. Every row asserts an ORDERED WHOLE-LIST equality over the
// UNFILTERED `doc.diagnostics` — never containment — so neither an extra
// diagnostic nor one emitted at the wrong position can hide. Twenty-five of
// the thirty-three rows expect a non-empty list, so a harness that stopped
// reaching the parser fails loudly rather than turning the eight empty-list
// rows into silent passes. The structural (severity, code, range) list is asserted
// BEFORE the registry-message list in each row, so a missing structural
// diagnostic reds as a missing diagnostic rather than as a missing registry
// row.
//
// TIER: unit, offline, deterministic, provider-free. Every observable settles
// inside one `parseThetaDocument` call over a source string — no session, no
// host, no model — so an integration tier would add a round trip to a
// parse-time value and buy no reach, and a live tier would make a fully
// determined value stochastic. The load-refusal consequence is separately
// witnessed live in tests/live/fn-param-list-unclosed-live-cell.test.ts.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. `msg` asserts its registry row's presence before the
// template is used, and `fnOf` asserts the `fn` declaration's presence before
// its parameters are read.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row — the state of `theta/parse/fn-param-list-unclosed` until the
 * DIAG-2 addition lands — reds by naming the registry rather than by a bare
 * `undefined` comparison.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

/** The new row this bug's fix adds under DIAG-2 (absent at HEAD). */
const UNCLOSED = "theta/parse/fn-param-list-unclosed";
/** Bug 0225's row (fires on c3/c4/d1 below; this file does not own it). */
const NOTID = "theta/parse/fn-param-not-identifier";
const CASE = "theta/parse/binding-case-mismatch";
/** Bug 0131's row (arm (2)) — fires on g4's missing argument, not on the closed list. */
const TOO_FEW = "theta/parse/fn-arity-too-few";
const MUT_IMMUTABLE = "theta/parse/mut-on-immutable-context";
const RESERVED = "theta/parse/reserved-keyword-as-identifier";
const SINGLE_LINE_IF = "theta/parse/single-line-if";
const UNSUPPORTED = "theta/parse/unsupported-feature";
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";
const BARE_OBJECT = "theta/parse/bare-object-literal";
const ANNOT_NOT_TYPE = "theta/parse/annotation-type-not-expression";

// ===========================================================================
// Parse harness — the same shape as tests/fn-param-name-case.test.ts.
// ===========================================================================
//
// `parseDoc` (tests/helpers/e2e-s1.ts:39) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is
// stubbed: the lexer and parser under assertion are the production ones.

/** Frontmatter for every row — occupies lines 1–3, so body line 1 is file line 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` under the standard frontmatter, at `path` (default `.theta`). */
function theta(body: string, path = "test.theta"): ThetaDocument {
  return parseDoc(FM + body, path);
}

/** One diagnostic reduced to its structural triple — severity, code, span. */
interface Triple {
  readonly severity: string;
  readonly code: string;
  readonly at: string;
}

/** `l:c-l:c`, 1-indexed, end-column exclusive; `-` for an unlocated diagnostic. */
function at(r: SourceRange | undefined): string {
  return r === undefined
    ? "-"
    : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** The structural triples of every diagnostic, in report order. */
function triples(doc: ThetaDocument): Triple[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    at: at(d.range),
  }));
}

/** An expected structural triple (severity is `error` for every row here). */
function e(code: string, span: string): Triple {
  return { severity: "error", code, at: span };
}

/** One diagnostic reduced to the full quadruple, message included. */
interface Quad extends Triple {
  readonly message: string;
}

/** The full quadruples of every diagnostic, in report order. */
function quads(doc: ThetaDocument): Quad[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    at: at(d.range),
    message: d.message,
  }));
}

/** An expected quadruple whose message is read from the registry (DIAG-4). */
function q(
  code: string,
  span: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): Quad {
  return { severity: "error", code, at: span, message: msg(code, fills) };
}

/** Every diagnostic rendered for a failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(quads(doc));
}

/**
 * The single `fn` declaration of `doc`. Presence and uniqueness are asserted
 * before the read, so a row whose declaration vanished reds by naming that
 * rather than by dereferencing `undefined`.
 */
function fnOf(doc: ThetaDocument): FnDecl {
  const decls = doc.body.statements.filter((s) => s.kind === "fn") as FnDecl[];
  expect(
    decls.length,
    `exactly one \`fn\` declaration is expected; statements=${JSON.stringify(topKinds(doc))}`,
  ).toBe(1);
  const only = decls[0];
  if (only === undefined) {
    throw new Error(`no \`fn\` declaration to read; diagnostics=${render(doc)}`);
  }
  return only;
}

/** The recorded `{name, type}` parameter pairs of the single `fn`. */
function paramsOf(doc: ThetaDocument): FnParam[] {
  return fnOf(doc).params.map((p) => ({ name: p.name, type: p.type }));
}

/** The top-level statement kinds, in source order. */
function topKinds(doc: ThetaDocument): string[] {
  return doc.body.statements.map((s) => s.kind);
}

/** The `fn` body's statement kinds, in source order. */
function bodyKinds(doc: ThetaDocument): string[] {
  return fnOf(doc).body.statements.map((s) => s.kind);
}

/** The `fn` body's tail expression kind, or `null` when there is none. */
function tailKind(doc: ThetaDocument): string | null {
  return fnOf(doc).body.tail?.kind ?? null;
}

/**
 * The composition root's own registration gate
 * (`hasLoadParseError`, `src/extension/production-composition.ts`):
 * `!diagnostics.some(d => d.severity === "error")`.
 */
function registered(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}

// ===========================================================================
// The DIAG-2 addition itself.
// ===========================================================================

describe("0151 registry — the new row is a DIAG-2 addition in the fix's own commit", () => {
  it("code-registry-parse.md carries `theta/parse/fn-param-list-unclosed` with a placeholder-free Message", () => {
    // DIAG-1 (diagnostic-shape.md:71) requires every emission to carry a
    // registered code and DIAG-2 (`:72`) requires the row to land in the same
    // commit as the site. The Message is placeholder-free BY DESIGN: the
    // diagnostic names the list, not a binder, so the closed `<construct>`
    // table at placeholder-rendering-a.md is not engaged (which is the whole
    // point of adding a row rather than reusing
    // `theta/parse/unsupported-feature`, whose over-statement is bug 0063's
    // open subject).
    const template = registryMessage(REGISTRY, UNCLOSED) as string | undefined;
    expect(
      template,
      `DIAG-2: the fix adds the ${UNCLOSED} row to docs/spec_topics/diagnostics/code-registry-parse.md (and the docs/reference/diagnostics.md mirror) in its own commit`,
    ).toBe("fn parameter list is not closed by ')'");
  });
});

// ===========================================================================
// (a) Newly refused — the `{` break arm, resynchronising at the body brace.
// ===========================================================================

describe("0151 (a) — an unclosed list whose `{` follows is refused, and the brace becomes the FnBody", () => {
  it("a2: `fn h(p: string { 1 }` reports the unclosed list, keeps ONE parameter, and does not register", () => {
    // THE ROOT ROW. At HEAD this is the report's claim in one line: zero
    // diagnostics on every channel and `registered=true`, with the body's `{`,
    // `1` and `}` recorded as three further parameters.
    //
    // Range derivation. The frontmatter occupies lines 1–3, so the body is line
    // 4; within `fn h(p: string { 1 }` the characters are `f`=1, `n`=2, ` `=3,
    // `h`=4, `(`=5, and the end column is exclusive, so the opening `(` spans
    // 5→6. The `(` is the range because the diagnostic's subject is the list
    // that was opened and never closed.
    const doc = theta("fn h(p: string { 1 }\n");
    expect(
      triples(doc),
      `grammar.md:138 makes the closing \`)\` a required terminal and grammar.md:144 derives no \`{\` at a FnParam position; diagnostics=${render(doc)}`,
    ).toEqual([e(UNCLOSED, "4:5-4:6")]);
    expect(quads(doc), "DIAG-4 — the rendered prose is the registry's Message column").toEqual([
      q(UNCLOSED, "4:5-4:6"),
    ]);

    // Decision 2's observable: the `{` break leaves the cursor ON the brace, so
    // the recovered declaration has ONE parameter and the brace is its FnBody
    // (the `1` its tail), not three more parameters and an empty body — which
    // at HEAD makes FN-4 (functions.md) hand back `null` where the author
    // wrote `1`.
    expect(
      paramsOf(doc),
      `the brace, the 1 and the closing brace are the function's BODY, not parameters; diagnostics=${render(doc)}`,
    ).toEqual([{ name: "p", type: "string" }]);
    expect(bodyKinds(doc), "the recovered FnBody carries no statements").toEqual([]);
    expect(tailKind(doc), "the recovered FnBody's tail is the author's `1`").toBe("number");
    expect(
      registered(doc),
      `an error-severity parse diagnostic denies registration (hasLoadParseError); diagnostics=${render(doc)}`,
    ).toBe(false);
  });

  it("a1: `fn h(P: string { 1 }` reports the unclosed list and the case rule, ordered by column", () => {
    // The uppercase twin. Bug 0139's parser-side arm (theta-document.ts:2470)
    // is the only code this input draws at HEAD; the structural diagnostic
    // joins it and sorts ahead of it, since `assembleDiagnostics`
    // (src/diagnostics/diagnostic.ts) sorts by (file, line, column) and the
    // `(` at column 5 precedes the name at column 6.
    const doc = theta("fn h(P: string { 1 }\n");
    expect(
      triples(doc),
      `both registered codes fire, ordered by column; diagnostics=${render(doc)}`,
    ).toEqual([e(UNCLOSED, "4:5-4:6"), e(CASE, "4:6-4:7")]);
    expect(quads(doc)).toEqual([q(UNCLOSED, "4:5-4:6"), q(CASE, "4:6-4:7")]);
    expect(paramsOf(doc)).toEqual([{ name: "P", type: "string" }]);
    expect(registered(doc)).toBe(false);
  });

  it("a4: `fn h(p { 1 }` — an unannotated parameter is refused for THIS report's reason", () => {
    // The annotation-less spelling is bug 0150's subject (the optional `fn`
    // parameter annotation) and is silent for THAT reason before and after
    // this fix; the recorded type stays `""`. What changes here is only the
    // unclosed list.
    const doc = theta("fn h(p { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(UNCLOSED, "4:5-4:6")]);
    expect(quads(doc)).toEqual([q(UNCLOSED, "4:5-4:6")]);
    expect(
      paramsOf(doc),
      "bug 0150's `\"\"` type is untouched; the brace is the body",
    ).toEqual([{ name: "p", type: "" }]);
    expect(registered(doc)).toBe(false);
  });

  it("a5: the following `let` statement RETURNS to the top level", () => {
    // Decision 2's severity payoff. At HEAD `let y = 2` is absent from the AST
    // the interpreter walks — its four tokens are recorded as parameters five
    // through eight — and the theta REGISTERS with the statement deleted.
    // After the brace break, `parseForms` re-enters at the `let`.
    const doc = theta("fn h(p: string { 1 }\nlet y = 2\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(UNCLOSED, "4:5-4:6")]);
    expect(quads(doc)).toEqual([q(UNCLOSED, "4:5-4:6")]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "string" }]);
    expect(
      topKinds(doc),
      `the author's statement must survive in the top-level statement list; diagnostics=${render(doc)}`,
    ).toEqual(["fn", "let"]);
    expect(registered(doc)).toBe(false);
  });

  it("a6: a following call site returns to the top level too", () => {
    // The same recovery over the call-site spelling (HEAD: ten parameters, the
    // call gone, `registered=true`).
    const doc = theta('fn h(p: string { 1 }\nlet z = h("q")\n');
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(UNCLOSED, "4:5-4:6")]);
    expect(quads(doc)).toEqual([q(UNCLOSED, "4:5-4:6")]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "string" }]);
    expect(topKinds(doc)).toEqual(["fn", "let"]);
    expect(registered(doc)).toBe(false);
  });

  it("a7: the `.thetalib` route reports it identically", () => {
    // lexical.md applies to `.theta` and `.thetalib` alike and both extensions
    // reach the same `parseFn`, so the rule is enforced at one site rather than
    // two. The frontmatter is kept here so the ranges are the same line-4 spans
    // as a2's, isolating the path argument as the only difference.
    const doc = theta("fn h(p: string { 1 }\n", "lib.thetalib");
    expect(
      triples(doc),
      `the emission is extension-independent; diagnostics=${render(doc)}`,
    ).toEqual([e(UNCLOSED, "4:5-4:6")]);
    expect(quads(doc)).toEqual([q(UNCLOSED, "4:5-4:6")]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "string" }]);
    expect(registered(doc)).toBe(false);
  });

  it("a8: `subagent fn g(p: string { 1 }` reports it, ranged on ITS opening `(`", () => {
    // `parseFn` serves both declaration forms through its `subagent` flag
    // (theta-document.ts:2324), so one loop and one emission cover both. The
    // range shifts with the `subagent ` prefix: nine characters, so the `(`
    // that was column 5 in a2 is column 14 here.
    const doc = theta("subagent fn g(p: string { 1 }\n");
    expect(
      triples(doc),
      `the subagent modifier moves the range and nothing else; diagnostics=${render(doc)}`,
    ).toEqual([e(UNCLOSED, "4:14-4:15")]);
    expect(quads(doc)).toEqual([q(UNCLOSED, "4:14-4:15")]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "string" }]);
    expect(registered(doc)).toBe(false);
  });

  it("a9: `fn h(mut P: string { 1 }` reports three codes, each at its own range", () => {
    // The three-code pile, ordered by column: the list's `(` at 5, the `mut`
    // modifier at 6–9 (`checkMutModifier`'s verdict, theta-document.ts:2415–2421),
    // and the parameter name at 10–11 (bug 0139's arm). Each carries the range
    // of the thing it judges, which is what orders them.
    const doc = theta("fn h(mut P: string { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(UNCLOSED, "4:5-4:6"),
      e(MUT_IMMUTABLE, "4:6-4:9"),
      e(CASE, "4:10-4:11"),
    ]);
    expect(quads(doc)).toEqual([
      q(UNCLOSED, "4:5-4:6"),
      q(MUT_IMMUTABLE, "4:6-4:9"),
      q(CASE, "4:10-4:11"),
    ]);
    expect(paramsOf(doc)).toEqual([{ name: "P", type: "string" }]);
    expect(registered(doc)).toBe(false);
  });
});

// ===========================================================================
// (b) Newly refused — the loop's EOF exit.
// ===========================================================================

describe("0151 (b) — an unclosed list truncated at EOF is refused, beside the lexer's own code", () => {
  // The pre-existing code on these rows is the lexer's `single-line-if` scan
  // (src/lexer/lexer.ts), which found no `{` before EOF. It is correct for its
  // own *Trigger* — the fn body is not a braced block, because there is no
  // body — and it names neither the parameter list nor the missing `)`, which
  // is why it is not the emission this bug asks for. It stays, and the
  // structural code joins it; comparing b2 with a2 isolates the mechanism the
  // fix removes: at HEAD the same unclosed list is refused when no `{` follows
  // and accepted when one does.

  it("b1: `fn h(P: string` at EOF reports all three, ordered by column", () => {
    const doc = theta("fn h(P: string");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(SINGLE_LINE_IF, "4:1-4:3"),
      e(UNCLOSED, "4:5-4:6"),
      e(CASE, "4:6-4:7"),
    ]);
    expect(quads(doc)).toEqual([
      q(SINGLE_LINE_IF, "4:1-4:3"),
      q(UNCLOSED, "4:5-4:6"),
      q(CASE, "4:6-4:7"),
    ]);
    expect(paramsOf(doc)).toEqual([{ name: "P", type: "string" }]);
    expect(registered(doc)).toBe(false);
  });

  it("b2: `fn h(p: string` at EOF adds the structural code to the lexer's", () => {
    const doc = theta("fn h(p: string");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(SINGLE_LINE_IF, "4:1-4:3"),
      e(UNCLOSED, "4:5-4:6"),
    ]);
    expect(quads(doc)).toEqual([q(SINGLE_LINE_IF, "4:1-4:3"), q(UNCLOSED, "4:5-4:6")]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "string" }]);
    expect(registered(doc)).toBe(false);
  });

  it("b3: `fn h(` — an empty unclosed list is refused with zero parameters", () => {
    // The degenerate row: the loop body never runs, so the emission cannot be
    // attached to a parameter and must belong to the LIST. The captured `(`
    // is the only range available.
    const doc = theta("fn h(");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(SINGLE_LINE_IF, "4:1-4:3"),
      e(UNCLOSED, "4:5-4:6"),
    ]);
    expect(quads(doc)).toEqual([q(SINGLE_LINE_IF, "4:1-4:3"), q(UNCLOSED, "4:5-4:6")]);
    expect(paramsOf(doc), "no parameter was written").toEqual([]);
    expect(registered(doc)).toBe(false);
  });

  it("b5: `fn h(a: string,` — a trailing comma at EOF is refused", () => {
    // `FnParams` admits the trailing comma (grammar.md:144), so the fault here
    // is the missing `)` alone and the recorded parameter list stays at one.
    const doc = theta("fn h(a: string,");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(SINGLE_LINE_IF, "4:1-4:3"),
      e(UNCLOSED, "4:5-4:6"),
    ]);
    expect(quads(doc)).toEqual([q(SINGLE_LINE_IF, "4:1-4:3"), q(UNCLOSED, "4:5-4:6")]);
    expect(paramsOf(doc)).toEqual([{ name: "a", type: "string" }]);
    expect(registered(doc)).toBe(false);
  });

  it("c6: `fn h(a: string,` + `42` — a swallowed numeric literal still ends at the EOF exit", () => {
    // A number at a `FnParam` position derives from no `Ident`
    // (lexical.md gives `Ident` as `[A-Za-z_][A-Za-z0-9_]*`), and it is not the
    // `{` the break arm tests, so this row exits at EOF and is refused there.
    const doc = theta("fn h(a: string,\n42");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(SINGLE_LINE_IF, "4:1-4:3"),
      e(UNCLOSED, "4:5-4:6"),
    ]);
    expect(quads(doc)).toEqual([q(SINGLE_LINE_IF, "4:1-4:3"), q(UNCLOSED, "4:5-4:6")]);
    expect(registered(doc)).toBe(false);
  });

  it("c7: `fn h(a: string` + `let x = 1` — the `stringletx` capture is unchanged, and now reported", () => {
    // The one point where this defect reaches bug 0124's function: with the
    // `stmt-sep` suppressed at depth > 0 (`collapseContinuations`'s `swallow`
    // test, `src/lexer/lexer.ts`), `parseType`'s first stop is unreachable and
    // the capture runs through the keyword `let` and the ident `x` to the
    // depth-0 `=`, yielding the parameter type `stringletx`. That capture is
    // 0124's business and is NOT changed here (bug 0151 §Non-goals); what
    // changes is that the unclosed list is now named.
    const doc = theta("fn h(a: string\nlet x = 1");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(SINGLE_LINE_IF, "4:1-4:3"),
      e(UNCLOSED, "4:5-4:6"),
    ]);
    expect(quads(doc)).toEqual([q(SINGLE_LINE_IF, "4:1-4:3"), q(UNCLOSED, "4:5-4:6")]);
    expect(
      paramsOf(doc),
      `bug 0124's capture is untouched by this fix; diagnostics=${render(doc)}`,
    ).toEqual([
      { name: "a", type: "stringletx" },
      { name: "=", type: "" },
      { name: "1", type: "" },
    ]);
    expect(registered(doc)).toBe(false);
  });
});

// ===========================================================================
// (c8) Decision 4's measured side effect — the duplicate that disappears.
// ===========================================================================

describe("0151 (c8) — the resync removes the parser-side half of the duplicate", () => {
  it("c8: `fn h(a: string { 1 }` + `let X = 2` reports the unclosed list and exactly ONE case diagnostic", () => {
    // At HEAD this input draws TWO `theta/parse/binding-case-mismatch` at the
    // identical range `5:5-5:6`: the lexer's `let` adjacency judges the
    // swallowed `X` (src/lexer/lexer.ts's `contextualDiagnostics` / `checkName`)
    // and the parameter loop's own case arm (theta-document.ts:2470) lands on
    // the same token, because at HEAD the `X` is BOTH a swallowed `let` binder
    // and a recorded parameter. Decision 4 changes nothing about the duplicate
    // directly; the resync removes its parser-side arm as a consequence,
    // because after the brace break `X` is no longer a parameter. That
    // consequence is measured, so it is pinned rather than left to drift.
    const doc = theta("fn h(a: string { 1 }\nlet X = 2\n");
    expect(
      triples(doc),
      `the parser-side arm of the duplicate is gone because \`X\` is no longer a parameter; diagnostics=${render(doc)}`,
    ).toEqual([e(UNCLOSED, "4:5-4:6"), e(CASE, "5:5-5:6")]);
    expect(quads(doc)).toEqual([q(UNCLOSED, "4:5-4:6"), q(CASE, "5:5-5:6")]);
    expect(
      paramsOf(doc),
      `the "let X = 2" tokens are not parameters after the resync; diagnostics=${render(doc)}`,
    ).toEqual([{ name: "a", type: "string" }]);
    expect(registered(doc)).toBe(false);
  });
});

// ===========================================================================
// (e4) A disposition change no committed test asserts.
// ===========================================================================

describe("0151 (e4) — the `array<string { 1 }` row is refused, with its capture untouched", () => {
  it("e4: `fn h(p: array<string { 1 }` reports the unclosed list and keeps the `array<string{1}` capture", () => {
    // `parseType`'s unfloored `<` / `>` depth counter absorbs the brace INTO
    // the annotation, so the loop never sees a `{` at a parameter-name
    // position and exits at EOF. The captured text carries no `)`, so the
    // WITHHOLD below does not apply and the list is reported. The capture
    // itself is bug 0124 §Reproduction (e)'s class, declined by both reports'
    // §Non-goals. Since bug 0228's fix the `{ 1 }` group is a raw slice of
    // the author's source bytes rather than a joined `{1}`, so the interior
    // spacing the author wrote now survives into this capture too — the
    // capture is still untouched by THIS report, and no longer lossy.
    const doc = theta("fn h(p: array<string { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(UNCLOSED, "4:5-4:6")]);
    expect(quads(doc)).toEqual([q(UNCLOSED, "4:5-4:6")]);
    expect(
      paramsOf(doc),
      `bug 0124's declined \`<\`/\`>\` capture is untouched; diagnostics=${render(doc)}`,
    ).toEqual([{ name: "p", type: "array<string{ 1 }" }]);
    expect(registered(doc)).toBe(false);
  });
});

// ===========================================================================
// (g) The closed-list controls — the `)`-present path stays byte-identical.
// ===========================================================================

describe("0151 (g) — a closed parameter list keeps its exact HEAD behaviour", () => {
  // §Fix shared constraint 1: every closed-list row keeps its exact diagnostic
  // list, its parameter count and its registration outcome. These rows red if
  // the emission fires on a list that IS closed — the single most likely
  // over-reach of a `)`-checking route.

  it("g1: `fn h(p: string): number { 1 }` reports nothing and registers", () => {
    const doc = theta("fn h(p: string): number { 1 }\n");
    expect(triples(doc), `a closed list is conformant; diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "string" }]);
    expect(tailKind(doc)).toBe("number");
    expect(registered(doc)).toBe(true);
  });

  it("g2: `fn h(p: string) { 1 }` reports nothing and registers", () => {
    const doc = theta("fn h(p: string) { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "string" }]);
    expect(registered(doc)).toBe(true);
  });

  it("g3: a two-parameter closed list reports nothing and registers", () => {
    const doc = theta("fn h(a: string, b: string) { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "b", type: "string" },
    ]);
    expect(registered(doc)).toBe(true);
  });

  it("g4: a closed list plus a wrong-arity in-document call draws bug 0131's arity row", () => {
    // The arity control. This cell's silence WAS bug 0131's own defect: no
    // parse-time arity check ran for an in-document `fn` call, which is why a
    // swallow-corrupted arity reached only the runtime at HEAD. Bug 0131's fix
    // mints `theta/parse/fn-arity-too-few` at the call-expression range, so the
    // correct contract here is one arity diagnostic, not `[]` — this file's own
    // subject (the closed-list recovery) still contributes nothing beside it.
    const doc = theta("fn h(a: string) { 1 }\nlet z = h()\n");
    expect(triples(doc), `bug 0131's arity row now fires here; diagnostics=${render(doc)}`).toEqual([
      e(TOO_FEW, "5:9-5:12"),
    ]);
    expect(quads(doc)).toEqual([
      q(TOO_FEW, "5:9-5:12", [
        ["<name>", "h"],
        ["<required>", "1"],
        ["<provided>", "0"],
      ]),
    ]);
    expect(topKinds(doc)).toEqual(["fn", "let"]);
    expect(registered(doc)).toBe(false);
  });

  it("g5: `fn h(): number { 1 }` — the empty CLOSED list reports nothing", () => {
    // The sharpest control against b3: the same zero parameters, the `)`
    // present. Any route that reported on an empty list rather than on an
    // UNCLOSED one reds here.
    const doc = theta("fn h(): number { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([]);
    expect(registered(doc)).toBe(true);
  });

  it("g6: `fn h(P: string) { 1 }` keeps bug 0139's emission ALONE", () => {
    // §Fix shared constraint 1 names this row specifically: the case code at
    // `4:6-4:7` and nothing else, so no structural code may join it on a
    // closed list.
    const doc = theta("fn h(P: string) { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(CASE, "4:6-4:7")]);
    expect(quads(doc)).toEqual([q(CASE, "4:6-4:7")]);
    expect(registered(doc)).toBe(false);
  });

  it("g7: the `subagent fn … with { … }` form over a closed list reports nothing", () => {
    const doc = theta('subagent fn g(p: string) with { model: "x" } { 1 }\n');
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "string" }]);
    expect(registered(doc)).toBe(true);
  });

  it("g8: the MISSING-`(` tail is unchanged — the two ends of the production report separately", () => {
    // §Fix shared constraint 2. `parseFn`'s missing-`(` arm
    // (theta-document.ts:2332–2341) already draws
    // `theta/parse/unsupported-feature` with the `fn parameter list must be
    // parenthesised` tail, pinned through the registry oracle by
    // tests/reserved-keyword-type-position.test.ts:483 as well. The settled
    // route adds a SEPARATE row for the missing `)` and does not unify the two
    // ends, so this whole four-diagnostic tail must not move.
    const doc = theta("fn h p: string { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(UNSUPPORTED, "4:6-4:7"),
      e(UNKNOWN_IDENT, "4:6-4:7"),
      e(UNSUPPORTED, "4:7-4:8"),
      e(BARE_OBJECT, "4:16-4:21"),
    ]);
    expect(quads(doc)).toEqual([
      q(UNSUPPORTED, "4:6-4:7", [
        ["<construct>", "fn parameter list must be parenthesised"],
      ]),
      q(UNKNOWN_IDENT, "4:6-4:7", [["<name>", "p"]]),
      q(UNSUPPORTED, "4:7-4:8", [["<construct>", "stray ':' in statement position"]]),
      q(BARE_OBJECT, "4:16-4:21"),
    ]);
    expect(registered(doc)).toBe(false);
  });

  it("the `mut`-as-parameter-name boundary keeps `mut-on-immutable-context` ALONE", () => {
    // The boundary the in-loop `atParamStart` comment names
    // (theta-document.ts:2390–2398, bug 0148 §Fix (d)): consuming `mut` shifts
    // the annotation `:` into the name slot and the type token into the slot
    // after it, and neither shifted token may draw a second diagnostic. The
    // list here is CLOSED, so this route adds nothing — the recovery artefacts
    // `":"` and `"string"` stay recorded as they are at HEAD.
    const doc = theta("fn h(mut: string) { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(MUT_IMMUTABLE, "4:6-4:9"),
    ]);
    expect(quads(doc)).toEqual([q(MUT_IMMUTABLE, "4:6-4:9")]);
    expect(paramsOf(doc)).toEqual([
      { name: ":", type: "" },
      { name: "string", type: "" },
    ]);
    expect(registered(doc)).toBe(false);
  });

  it("the reserved-keyword parameter name keeps bug 0148's emission ALONE", () => {
    const doc = theta("fn h(let: string) { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(RESERVED, "4:6-4:9")]);
    expect(quads(doc)).toEqual([q(RESERVED, "4:6-4:9", [["<keyword>", "let"]])]);
    expect(registered(doc)).toBe(false);
  });
});

// ===========================================================================
// (c3, c4, d1) The foreign-`)` rows — bug 0225's route reaches them.
// ===========================================================================

describe("0225 — a list that exits on a `)` belonging to something else now also draws fn-param-not-identifier", () => {
  // These three rows find a `)` — not their own. This file's own two marks
  // (the `{` break, the EOF exit) are still both unset here, so its OWN
  // codes say nothing new about the closed/unclosed distinction — that half
  // of bug 0225 §Fix constraint 2 holds. But bug 0225
  // (docs/bugs/0225-fn-param-list-foreign-close-paren-silent.md) adds a
  // second, independent predicate at every parameter-name position, judged
  // regardless of how the list closes, and it reaches all three rows: each
  // gains one `theta/parse/fn-param-not-identifier` diagnostic, deferred to
  // the epilogue's `)`-present arm with no break and no recovery, so the
  // recorded parameter arrays stay exactly as HEAD recorded them.

  it("c3: `fn h(a: string,` + `let x = 1` + `) { 1 }` gains fn-param-not-identifier at the swallowed `=`", () => {
    const doc = theta("fn h(a: string,\nlet x = 1\n) { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(RESERVED, "5:1-5:4"),
      e(NOTID, "5:7-5:8"),
    ]);
    expect(quads(doc)).toEqual([
      q(RESERVED, "5:1-5:4", [["<keyword>", "let"]]),
      q(NOTID, "5:7-5:8"),
    ]);
    expect(
      paramsOf(doc),
      `bug 0225's emission recovers nothing, so the swallowed statement's five tokens stay recorded as parameters; diagnostics=${render(doc)}`,
    ).toEqual([
      { name: "a", type: "string" },
      { name: "let", type: "" },
      { name: "x", type: "" },
      { name: "=", type: "" },
      { name: "1", type: "" },
    ]);
    expect(registered(doc)).toBe(false);
  });

  it("c4: `fn h(a: string,` + a following `fn g(): number { 2 }` gains fn-param-not-identifier at the swallowed `(`", () => {
    const doc = theta("fn h(a: string,\nfn g(): number { 2 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(RESERVED, "5:1-5:3"),
      e(NOTID, "5:5-5:6"),
    ]);
    expect(quads(doc)).toEqual([
      q(RESERVED, "5:1-5:3", [["<keyword>", "fn"]]),
      q(NOTID, "5:5-5:6"),
    ]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "fn", type: "" },
      { name: "g", type: "" },
      { name: "(", type: "" },
    ]);
    expect(registered(doc)).toBe(false);
  });

  it("d1: the duplicated `binding-case-mismatch` PERSISTS on the foreign-`)` row, and fn-param-not-identifier joins it (Decision 4, re-measured)", () => {
    // Decision 4 is "do nothing about the duplicate", and it still holds:
    // two `binding-case-mismatch` at the identical range `5:5-5:6` — the
    // lexer's `let` adjacency and the parameter loop's own case arm judging the
    // same `X`, which on this row IS still a recorded parameter. Compare c8,
    // where the resync removes the parser-side arm; bug 0225's route performs
    // no such resync, so the duplicate is measured to survive rather than
    // assumed to. The first token bug 0225's own predicate refuses beyond what
    // the two case-mismatch rows already name is the `=` at `5:7-5:8`.
    const doc = theta("fn h(a: string,\nlet X = 1\n) { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(RESERVED, "5:1-5:4"),
      e(CASE, "5:5-5:6"),
      e(CASE, "5:5-5:6"),
      e(NOTID, "5:7-5:8"),
    ]);
    expect(quads(doc)).toEqual([
      q(RESERVED, "5:1-5:4", [["<keyword>", "let"]]),
      q(CASE, "5:5-5:6"),
      q(CASE, "5:5-5:6"),
      q(NOTID, "5:7-5:8"),
    ]);
    expect(registered(doc)).toBe(false);
  });
});

// ===========================================================================
// The WITHHOLD class — a parameter TYPE capture that absorbed the `)`.
// ===========================================================================

describe("0151 withhold — a type capture carrying the author's `)` keeps HEAD's behaviour exactly", () => {
  // The settled route withholds BOTH the verdict and the recovery when the type
  // capture CONSUMED more punct `)` tokens than punct `(` tokens — it took a
  // closer that was not its own, which is bug 0124's declined `<` / `>`
  // over-run class, where the author DID write the list's closing paren and
  // `parseType`'s unfloored angle-bracket depth counter swallowed it. Emitting
  // there would report a list the author closed, and recovering there would
  // move rows two other bugs' committed witnesses own.
  //
  // These three cells assert the withhold. The same three inputs are already
  // asserted from the other direction by
  // tests/annotation-nontype-text-refusal.test.ts (bug 0124 (e), rows e1/e2)
  // and tests/nested-inline-enum-generic-argument-refusal.test.ts (bug 0217
  // (h), row h1); those files are NOT edited — these cells exist so a route
  // that widened into the class reds HERE, naming bug 0151, rather than
  // reddening a sibling bug's file.

  it("`fn f(n: integer<): integer { 1 }` keeps `annotation-type-not-expression` ALONE, and the following statements stay absorbed", () => {
    const doc = theta("fn f(n: integer<): integer { 1 }\nlet a = 1\na\n");
    expect(
      triples(doc),
      `the captured type carries the author's \`)\`, so the verdict is withheld; diagnostics=${render(doc)}`,
    ).toEqual([e(ANNOT_NOT_TYPE, "4:1-7:1")]);
    expect(quads(doc)).toEqual([q(ANNOT_NOT_TYPE, "4:1-7:1", [["<name>", "n"]])]);
    expect(
      topKinds(doc),
      `the recovery is withheld too, so the following statements stay absorbed; diagnostics=${render(doc)}`,
    ).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("`fn f(n: integer>): integer { 1 }` stays silent and registering", () => {
    const doc = theta("fn f(n: integer>): integer { 1 }\nlet a = 1\na\n");
    expect(
      triples(doc),
      `HEAD's silence is preserved by the withhold; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(true);
  });

  it("`fn f(n: array<enum[\"a\", \"b\">) { 1 }` stays silent and registering (bug 0217 (h) h1's cell)", () => {
    const doc = theta('fn f(n: array<enum["a", "b">) { 1 }\n');
    expect(
      triples(doc),
      `HEAD's silence is preserved by the withhold; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(registered(doc)).toBe(true);
  });
});

// ===========================================================================
// The withhold's own boundary — shapes a `)`-in-the-type-TEXT test would miss.
// ===========================================================================

describe("0151 withhold boundary — a `)` the capture did not consume does not withhold", () => {
  // The withhold is keyed on the tokens the capture CONSUMED, not on the text
  // it produced. These two rows both carry a `)` character in the captured type
  // text while the list's own closer is genuinely absent, so both are this
  // bug's class and both must be refused.

  it("a `)` inside a string token of the type is not a consumed closer", () => {
    // The `)` here lives inside the string token `"a)"`, which the capture
    // consumed as ONE token: no punct `)` was taken, so nothing was swallowed.
    const doc = theta('fn h(p: enum["a)"] { 1 }\n');
    expect(
      triples(doc),
      `the \`)\` is a string-token character, not a consumed closer; diagnostics=${render(doc)}`,
    ).toEqual([e(UNCLOSED, "4:5-4:6")]);
    expect(quads(doc)).toEqual([q(UNCLOSED, "4:5-4:6")]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: 'enum["a)"]' }]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("a balanced `(...)` the author's own type carries is not a consumed closer", () => {
    // `(string)` consumes one punct `(` and one punct `)` — balanced, so the
    // capture took no closer of the list's. The list is unclosed, and the
    // following `let` returns to the top level under the ordinary recovery.
    const doc = theta("fn h(a: (string), b { 1 }\nlet y = 2\n");
    expect(
      triples(doc),
      `a balanced paren pair inside the type withholds nothing; diagnostics=${render(doc)}`,
    ).toEqual([e(ANNOT_NOT_TYPE, "4:1-4:26"), e(UNCLOSED, "4:5-4:6")]);
    expect(quads(doc)).toEqual([
      q(ANNOT_NOT_TYPE, "4:1-4:26", [["<name>", "a"]]),
      q(UNCLOSED, "4:5-4:6"),
    ]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "(string)" },
      { name: "b", type: "" },
    ]);
    expect(
      topKinds(doc),
      `the recovery fires, so the following \`let\` returns to the top level; diagnostics=${render(doc)}`,
    ).toEqual(["fn", "let"]);
    expect(registered(doc)).toBe(false);
  });
});
