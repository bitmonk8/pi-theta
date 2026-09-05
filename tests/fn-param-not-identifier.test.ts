import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { FnDecl, FnParam, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0225 — `parseFn`'s parameter loop records whatever token it advanced over
// as a `FnParam`, and a list that exits on a `)` belonging to something else is
// accepted as closed
// (docs/bugs/0225-fn-param-list-foreign-close-paren-silent.md).
//
// THE RULE. `FnParam ::= Ident (":" Type)?` — symbol `FnParam`, the third line of
// the `fn`-declarations production block at docs/spec_topics/grammar.md:145,
// mirrored as `FnParam` at docs/reference/grammar.md:301 — makes the FIRST
// element of every parameter an `Ident`. `FnParams ::= FnParam ("," FnParam)*
// ","?` (symbol `FnParams`, grammar.md:144 / docs/reference/grammar.md:300)
// admits no other element, and `FnDecl ::= "fn" Ident "(" FnParams? ")" (":"
// ReturnType)? FnBody` (symbol `FnDecl`, grammar.md:138 /
// docs/reference/grammar.md:294) is the whole surface. `Ident` is
// `[A-Za-z_][A-Za-z0-9_]*` (the `**Identifiers.**` paragraph,
// docs/spec_topics/lexical.md:13), so a `punct` token (`=`, `,`), a `number`
// token (`1`, `42`, `3`), a `string` token (`"q"`) and a `template` token are
// derivable from `Ident` under no reading. FN-1 (the `<a id="fn-1">` rule,
// docs/spec_topics/functions.md:20) delegates the parameter list's surface form
// to that production normatively.
//
// THE DEFECT AT HEAD. `parseFn` (src/parser/theta-document.ts:2346) ran its
// parameter loop at the `while (!this.isPunct(")") && !this.atEnd())` test
// (theta-document.ts:2399), took the next token unconditionally at
// `const pTok = this.advance();` (theta-document.ts:2423), and pushed it at
// `params.push({ name: pTok.text, type: pType })` (theta-document.ts:2486).
// The only two `pTok.kind` tests between them were emission guards, not
// control: the `pTok.kind === "keyword" && atParamStart` guard that emits
// `theta/parse/reserved-keyword-as-identifier` (bug 0148,
// theta-document.ts:2450) and the `code: "theta/parse/binding-case-mismatch"`
// push under the `isUpper` branch (bug 0139, theta-document.ts:2470). A token
// that is neither `keyword` nor `ident` matched neither and reached the push
// in silence. Bug 0151's landed refusal did not reach this exit: the
// `unclosed` flag (`let unclosed = false;`, theta-document.ts:2373) was set
// at the block-open-`{` check (`if (this.isPunct("{") &&
// !closeParenAbsorbed)`, theta-document.ts:2405) and at the epilogue's
// no-`)` `else` arm (theta-document.ts:2513) alone, so a region that ends at
// a `)` the author wrote for the list itself satisfied the epilogue's
// `)`-present arm (`if (this.isPunct(")"))`, theta-document.ts:2494), the
// epilogue consumed that token, and the emission gated on
// `unclosed && !closeParenAbsorbed` (theta-document.ts:2515) did not run.
// The lexer's
// `collapseContinuations` (its `const swallow = depth > 0 || …` test,
// `src/lexer/lexer.ts`) joins the following lines into the open list, so whole
// author statements are consumed token by token — but it is not necessary to
// the defect (A4 and A5 below are single physical lines). Measured at HEAD
// (v0.163.0, `3b11f739`): `fn h(a: string,` + `x = 1` + `) { 1 }` reports `[]`,
// records four parameters (`a:string`, `x`, `=`, `1`), drops the `x = 1`
// reassignment from `doc.body.statements`, and REGISTERS.
//
// THE CONTRACT THIS FILE PINS — five decisions, in the order they bind:
//   1. A NARROW PREDICATE. At a parameter-name position, a captured token whose
//      `kind` is neither `"ident"` nor `"keyword"` — a `punct`, `number`,
//      `string` or `template` token — is refused. An annotation-less legal
//      `Ident` is NOT refused: `x` in A1 and `p` in A11 stay recorded exactly
//      as HEAD records them, because the missing `":" Type` is bug 0150's open
//      adjudication (docs/bugs/0150-fn-parameter-annotation-optional-against-grammar.md)
//      and is not decided here. A `keyword` at that position keeps bug 0148's
//      emission alone (A12), unjoined by this file's code on the keyword itself.
//   2. A DEFERRED EMISSION AT THE `)` ARM — no break, no recovery. The FIRST
//      refused token of the list is recorded, and the emission fires ONLY in
//      the epilogue's `)`-present arm (`if (this.isPunct(")"))`,
//      theta-document.ts:2494). Breaking at the token would
//      leave the cursor short of the list's own `)`, which collapses the
//      closed/unclosed distinction bug 0151 settled and reds that witness's
//      group (b) cells c6/c7 — forbidden by bug 0225 §Fix constraint 2. So the
//      `{`-break exit (X6) and the EOF exit (X7) keep bug 0151's emission
//      ALONE, with this file's code suppressed on both.
//   3. A NEW REGISTERED ROW, not a *Trigger* widening of
//      `theta/parse/fn-param-list-unclosed`: `theta/parse/fn-param-not-identifier`,
//      severity E, phase parse, placeholder-free *Message*
//      `fn parameter name must be an identifier`, ranged on the FIRST refused
//      token. The existing row's *Message* is normative under DIAG-4
//      (docs/spec_topics/diagnostics/diagnostic-shape.md:74) and is FALSE on
//      this class — the author DID write the `)` — and its *Trigger*
//      (docs/spec_topics/diagnostics/code-registry-parse.md:24) names the EOF
//      and `{` exits with a recovery that does not happen here, so the existing
//      row stays byte-exact and a second row lands beside it (a DIAG-2
//      addition, diagnostic-shape.md:72, in the fix's own commit). The
//      *Message* is placeholder-free BY DESIGN, so the closed `<construct>`
//      token-name table (docs/spec_topics/diagnostics/placeholder-rendering-a.md:73)
//      is not engaged and bug 0063's open surface is not widened — bug 0151
//      Decision 3 / bug 0042's precedent.
//   4. WITHHELD UNDER BUG 0124's `closeParenAbsorbed` (`let closeParenAbsorbed
//      = false;`, theta-document.ts:2382; set to `true` at
//      `closeParenAbsorbed = true;`, theta-document.ts:2483, from
//      `unmatchedCloseParens`, theta-document.ts:1897). An input whose
//      parameter TYPE capture consumed the author's `)` keeps its previous
//      disposition
//      byte-for-byte, this file's new emission included (X8).
//   5. EXEMPT WHERE A `mut` MODIFIER WAS CONSUMED IN THE SAME LOOP ITERATION
//      (`if (this.isKeyword("mut"))`, theta-document.ts:2410). That consume
//      shifts the annotation `:` into the name slot and the type token into
//      the slot after it — the recovery artefact the
//      in-loop `atParamStart` comment (theta-document.ts:2390–2397) names — so `fn h(mut:
//      string)` keeps `theta/parse/mut-on-immutable-context` ALONE (bug 0148
//      §Fix (d), X2), while the NEXT iteration's token is judged normally (X3).
// The new code is `E`, so `hasLoadParseError`
// (`src/extension/production-composition.ts`) denies registration, and the
// per-row `registered` predicate below mirrors the composition root's own gate
// inside `resolveThetaToolsAtLoad` (same file), which registers a theta iff no
// error-severity diagnostic was raised.
//
// THE LEDGER — what each group pins:
//   - (a) THE CLASS, newly refused (A1–A9): the deferred emission on the
//     `)`-present arm, ranged on the first refused token. A1 is the report's
//     pin; A2 and A3 are its `number` and `string` spellings; A4 and A5 are
//     the ONE-LINE members that engage no newline continuation at all; A6 is
//     the two-statement swallow (seven parameters, one diagnostic — the FIRST
//     refused token, not one per token); A7 carries the surviving call site;
//     A8 is the `.thetalib` route and A9 the `subagent fn` form.
//   - (b) THE SIBLING-CODE BOUNDARIES (A12, A13): bug 0148's keyword emission
//     keeps its code, range and message and this file's code JOINS it at the
//     first non-`Ident` token of the same swallowed statement (A12); a
//     swallowed region carrying its own balanced `(…)` keeps the stray-`)`
//     tail and the bare-object tail it already draws, with this file's code
//     ahead of them in position order (A13).
//   - (c) THE PREDICATE'S OWN EDGES (X3, X4, X5): the `mut` exemption applies
//     to ONE iteration and not to the next (X3); a doubled separator's second
//     `,` is a refused `punct` at a parameter-name position (X4); and X5
//     (`fn h(3): number { 1 }`) is the `Ident`-half row bug 0150 §Non-goals
//     disclaims in terms and this report claims.
//   - (d) MUST NOT MOVE (A10, A11, A14, X2, X6, X7, X8, X9): the closed-list
//     control that still carries its `reassign` (A10); bug 0150's
//     annotation-less `Ident`, still recorded and still registering (A11); the
//     missing-`(` end of the same production, four diagnostics unchanged
//     (A14); the `mut` recovery artefact (X2); bug 0151's two settled exits
//     with this file's code suppressed (X6, X7); bug 0124's withhold on a
//     legal-`Ident` capture (X8); and the same withhold where the `)`-present
//     arm's own guard has BOTH conjuncts true at once — a refused name token
//     alongside an absorbed closer in the same list (X9).
//
// STATED RESIDUAL — the non-recovery, so it is not read as an oversight.
// Decision 2 emits and does NOT resynchronise: the refused tokens stay in the
// recorded parameter array and the author's swallowed statements do NOT return
// to `doc.body.statements`. A1 therefore still reports `["fn"]` where the
// closed control A10 reports `["fn", "reassign"]`, and A1's parameter array is
// still the four HEAD records — `a:string`, `x`, `=`, `1`. Two separate reasons
// hold that line: recovering would have to break at the refused token, which
// bug 0225 §Fix constraint 2 forbids (see Decision 2 above); and the narrow
// predicate of Decision 1 leaves `x` recorded whatever the recovery does,
// because an annotation-less legal `Ident` at a parameter-name position is bug
// 0150's open subject. Every row below ASSERTS that residual explicitly — the
// `params` array whole and the top-level statement kinds — so it cannot drift
// in either direction unobserved. Bug 0225 §Expected behaviour's
// "author statements are not silently deleted" clause is therefore only
// PARTLY discharged here: the silence is closed, the deletion is not, and
// closing the deletion is bug 0150's route to take.
//
// DIAG-4 (diagnostic-shape.md:74) — no asserted message string is written out.
// Every one is READ from the registry's *Message* column through
// `parseRegistry` / `registryMessage` (tools/code-registry/index.js) via the
// `msg` helper, INCLUDING the new row's: until the implementer adds the
// `theta/parse/fn-param-not-identifier` row to
// docs/spec_topics/diagnostics/code-registry-parse.md (and its
// docs/reference/diagnostics.md mirror), `msg` reds by naming the registry.
// That red is INTENDED: DIAG-2 (diagnostic-shape.md:72) makes the row part of
// the same commit as the emission site.
//
// ANTI-VACUITY. Every row asserts an ORDERED WHOLE-LIST equality over the
// UNFILTERED `doc.diagnostics` — never containment — so neither an extra
// diagnostic nor one emitted at the wrong position can hide, and the structural
// (severity, code, range) list is asserted BEFORE the registry-message list so
// a missing structural diagnostic reds as a missing diagnostic rather than as a
// missing registry row. Eighteen of the twenty-two source rows expect a
// NON-EMPTY list, so a harness that stopped reaching the parser fails loudly
// rather than turning the four empty-list rows (A10, A11, X8, X9, and no
// other) into silent passes. Every row additionally asserts the exact `params` array whole, the
// top-level statement kinds, and the registration gate, so a route that emitted
// the right diagnostic while moving the recorded parameters or the statement
// list reds here too.
//
// TIER: unit, offline, deterministic, provider-free. Every observable settles
// inside one `parseThetaDocument` call over a source string — the diagnostic
// list, the recorded `FnParam` array, `doc.body.statements` and the
// registration predicate are all parse-time values — so an integration tier
// would add a round trip to a value already fully determined, and a live tier
// would make a determined value stochastic. The one thing an offline parse
// cannot reach is the real discovery → registration → note-channel path; that
// is witnessed separately in
// tests/live/fn-param-not-identifier-live-cell.test.ts, following bug 0151's
// precedent (tests/live/fn-param-list-unclosed-live-cell.test.ts), because
// this route changes a registration outcome.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. `msg` asserts its registry row's presence before the
// template is used, and `fnOf` asserts the `fn` declaration's presence and
// uniqueness before its parameters are read — an unmet precondition reds by
// naming itself.

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
 * a missing row — the state of `theta/parse/fn-param-not-identifier` until the
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
const NOTID = "theta/parse/fn-param-not-identifier";
/** Bug 0151's row (0.163.0) — byte-exact, and NOT widened by this route. */
const UNCLOSED = "theta/parse/fn-param-list-unclosed";
const MUT_IMMUTABLE = "theta/parse/mut-on-immutable-context";
const RESERVED = "theta/parse/reserved-keyword-as-identifier";
const SINGLE_LINE_IF = "theta/parse/single-line-if";
const UNSUPPORTED = "theta/parse/unsupported-feature";
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";
const BARE_OBJECT = "theta/parse/bare-object-literal";

// ===========================================================================
// Parse harness — the same shape as tests/fn-param-list-unclosed.test.ts.
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

/** The top-level statement kinds, in source order — `doc.body.statements`. */
function topKinds(doc: ThetaDocument): string[] {
  return doc.body.statements.map((s) => s.kind);
}

/**
 * The composition root's own registration gate
 * (`hasLoadParseError`, `src/extension/production-composition.ts`):
 * `resolveThetaToolsAtLoad`'s `registered` predicate registers a theta iff no
 * error-severity diagnostic was raised.
 */
function registered(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}

// ===========================================================================
// The DIAG-2 addition itself.
// ===========================================================================

describe("0225 registry — the new row is a DIAG-2 addition in the fix's own commit", () => {
  it("code-registry-parse.md carries `theta/parse/fn-param-not-identifier` with a placeholder-free Message", () => {
    // DIAG-1 (diagnostic-shape.md:71) requires every emission to carry a
    // registered code; DIAG-2 (`:72`) requires the row to land in the same
    // commit as the site. A NEW row rather than a *Trigger* widening of
    // `theta/parse/fn-param-list-unclosed`: that row's *Message* is normative
    // under DIAG-4 (`:74`) and is false on this class, because the author DID
    // close the list. Placeholder-free BY DESIGN — the diagnostic names the
    // position, not the token — so the closed `<construct>` table at
    // placeholder-rendering-a.md:73 is not engaged and bug 0063's open surface
    // is not widened.
    const template = registryMessage(REGISTRY, NOTID) as string | undefined;
    expect(
      template,
      `DIAG-2: the fix adds the ${NOTID} row to docs/spec_topics/diagnostics/code-registry-parse.md (and the docs/reference/diagnostics.md mirror) in its own commit`,
    ).toBe("fn parameter name must be an identifier");
  });

  it("bug 0151's `theta/parse/fn-param-list-unclosed` Message stays byte-exact", () => {
    // Bug 0225 §Fix constraint 5, shape 2's whole point: the existing row is
    // not touched, so bug 0151's pinned cells and its withhold prose keep
    // their bytes.
    expect(
      registryMessage(REGISTRY, UNCLOSED) as string | undefined,
      `the ${UNCLOSED} row is not re-worded by this route (DIAG-4)`,
    ).toBe("fn parameter list is not closed by ')'");
  });
});

// ===========================================================================
// (a) The class — newly refused, emitted at the epilogue's `)`-present arm.
// ===========================================================================

describe("0225 (a) — a parameter-name position holding a token no `Ident` derives is refused", () => {
  it("A1: `fn h(a: string,` + `x = 1` + `) { 1 }` names the `=` and does not register", () => {
    // THE PIN. At HEAD this input is the report's claim entire: `[]` on every
    // channel, four recorded parameters, the `x = 1` reassignment absent from
    // `doc.body.statements`, and `registered=true`.
    //
    // Range derivation. The frontmatter occupies lines 1–3, so the body starts
    // at line 4 and the swallowed statement is line 5, `x = 1`: `x`=1, ` `=2,
    // `=`=3, and the end column is exclusive, so the `=` spans 5:3→5:4. The
    // `x` at 5:1 is a legal `Ident` and is NOT refused (Decision 1's narrow
    // predicate; bug 0150 owns the missing annotation), so the FIRST refused
    // token of the list is that `=`.
    const doc = theta("fn h(a: string,\nx = 1\n) { 1 }\n");
    expect(
      triples(doc),
      `grammar.md:145 makes the first element of a FnParam an \`Ident\` and lexical.md:13 gives \`Ident\` as [A-Za-z_][A-Za-z0-9_]*, which no punct token derives; diagnostics=${render(doc)}`,
    ).toEqual([e(NOTID, "5:3-5:4")]);
    expect(quads(doc), "DIAG-4 — the rendered prose is the registry's Message column").toEqual([
      q(NOTID, "5:3-5:4"),
    ]);

    // THE STATED RESIDUAL, asserted so it cannot drift. Decision 2 emits and
    // does not resynchronise, so the swallowed tokens stay recorded and the
    // author's `x = 1` does NOT return to the statement list. Compare A10,
    // the same two lines with the `)` in place, which carries the `reassign`.
    expect(
      paramsOf(doc),
      `the emission is deferred to the \`)\` arm and recovers nothing, so the swallowed tokens stay recorded; diagnostics=${render(doc)}`,
    ).toEqual([
      { name: "a", type: "string" },
      { name: "x", type: "" },
      { name: "=", type: "" },
      { name: "1", type: "" },
    ]);
    expect(
      topKinds(doc),
      `the non-recovery is this route's recorded residual — bug 0150 owns the \`x\` half; diagnostics=${render(doc)}`,
    ).toEqual(["fn"]);
    expect(
      registered(doc),
      `an error-severity parse diagnostic denies registration (hasLoadParseError); diagnostics=${render(doc)}`,
    ).toBe(false);
  });

  it("A2: a swallowed `number` token is refused at its own range", () => {
    // Line 5 is `42`: two characters, so the token spans 5:1→5:3. Here the
    // first token of the swallowed region is itself the refused one.
    const doc = theta("fn h(a: string,\n42\n) { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(NOTID, "5:1-5:3")]);
    expect(quads(doc)).toEqual([q(NOTID, "5:1-5:3")]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "42", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("A3: a swallowed `string` token is refused at its own range", () => {
    // Line 5 is `"q"`: three characters including both quotes, so 5:1→5:4.
    // The recorded parameter name at HEAD is the token TEXT, quotes included.
    const doc = theta('fn h(a: string,\n"q"\n) { 1 }\n');
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(NOTID, "5:1-5:4")]);
    expect(quads(doc)).toEqual([q(NOTID, "5:1-5:4")]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: '"q"', type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("A4: the ONE-LINE spelling `fn h(a: string, = 1) { 1 }` is refused — no newline continuation involved", () => {
    // This row removes the lexer from the argument. One physical line, so
    // `collapseContinuations` (`src/lexer/lexer.ts`) suppresses nothing: the defect is
    // the unconditional capture at theta-document.ts:2423, not the newline
    // rule. Columns on line 4: `f`=1, `n`=2, ` `=3, `h`=4, `(`=5, `a`=6,
    // `:`=7, ` `=8, `string`=9–14, `,`=15, ` `=16, `=`=17 → 4:17–4:18.
    const doc = theta("fn h(a: string, = 1) { 1 }\n");
    expect(
      triples(doc),
      `the newline suppression widens the class but does not create it; diagnostics=${render(doc)}`,
    ).toEqual([e(NOTID, "4:17-4:18")]);
    expect(quads(doc)).toEqual([q(NOTID, "4:17-4:18")]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "=", type: "" },
      { name: "1", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("A5: the ONE-LINE numeric spelling `fn h(a: string, 42) { 1 }` is refused", () => {
    // Same columns as A4 up to the `,`; the `42` occupies 17–18, so 4:17–4:19.
    const doc = theta("fn h(a: string, 42) { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(NOTID, "4:17-4:19")]);
    expect(quads(doc)).toEqual([q(NOTID, "4:17-4:19")]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "42", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("A6: two swallowed statements draw exactly ONE diagnostic, at the FIRST refused token", () => {
    // The swallow is per token — seven parameters at HEAD — and the emission is
    // per LIST: the first refused token is recorded and the epilogue emits once.
    // A route that emitted per refused token would report three times here and
    // reds on the whole-list equality.
    const doc = theta("fn h(a: string,\nx = 1\ny = 2\n) { 1 }\n");
    expect(
      triples(doc),
      `one emission per list, ranged on the first refused token; diagnostics=${render(doc)}`,
    ).toEqual([e(NOTID, "5:3-5:4")]);
    expect(quads(doc)).toEqual([q(NOTID, "5:3-5:4")]);
    expect(
      paramsOf(doc),
      `the swallow is per token and the non-recovery keeps all seven; diagnostics=${render(doc)}`,
    ).toEqual([
      { name: "a", type: "string" },
      { name: "x", type: "" },
      { name: "=", type: "" },
      { name: "1", type: "" },
      { name: "y", type: "" },
      { name: "=", type: "" },
      { name: "2", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("A7: the surviving call site is refused with the declaration, not silently mis-arity'd", () => {
    // The runtime reach. At HEAD `let z = h("q")` survives with ONE argument
    // against FOUR recorded parameters and draws nothing, because no
    // parse-time arity check exists (bug 0131) — `evalUserFnCall`
    // (src/runtime/statement-executor.ts:436) is the next thing that runs and
    // throws `ThetaFnArityError`, routed to `theta/runtime/internal-error`
    // (src/runtime/tool-call.ts:443). The arity check is NOT added here (bug
    // 0131's), so what changes is that the declaration itself is refused and
    // the theta does not register — the call site is never reached.
    const doc = theta('fn h(a: string,\nx = 1\n) { 1 }\nlet z = h("q")\nz\n');
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([e(NOTID, "5:3-5:4")]);
    expect(quads(doc)).toEqual([q(NOTID, "5:3-5:4")]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "x", type: "" },
      { name: "=", type: "" },
      { name: "1", type: "" },
    ]);
    expect(
      topKinds(doc),
      `the call site survives (bug 0131's silence is untouched); diagnostics=${render(doc)}`,
    ).toEqual(["fn", "let"]);
    expect(registered(doc)).toBe(false);
  });

  it("A8: the `.thetalib` route reports it identically", () => {
    // lexical.md and grammar.md apply to `.theta` and `.thetalib` alike, and
    // both extensions reach the same `parseFn`, so the rule is enforced at one
    // site rather than two (bug 0225 §Fix constraint 9). The frontmatter is
    // kept so the ranges are A1's exact spans, isolating the path argument as
    // the only difference.
    const doc = theta("fn h(a: string,\nx = 1\n) { 1 }\n", "lib.thetalib");
    expect(
      triples(doc),
      `the emission is extension-independent; diagnostics=${render(doc)}`,
    ).toEqual([e(NOTID, "5:3-5:4")]);
    expect(quads(doc)).toEqual([q(NOTID, "5:3-5:4")]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "x", type: "" },
      { name: "=", type: "" },
      { name: "1", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("A9: the `subagent fn` form reports it identically", () => {
    // `parseFn` serves both declaration forms through its `subagent` flag
    // (theta-document.ts:2346), so one loop and one predicate cover both. The
    // refused token is on line 5 at the same columns as A1's, because the
    // `subagent ` prefix moves only line 4.
    const doc = theta("subagent fn s(a: string,\nx = 1\n) { 1 }\n");
    expect(
      triples(doc),
      `the subagent modifier changes nothing about the parameter predicate; diagnostics=${render(doc)}`,
    ).toEqual([e(NOTID, "5:3-5:4")]);
    expect(quads(doc)).toEqual([q(NOTID, "5:3-5:4")]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "x", type: "" },
      { name: "=", type: "" },
      { name: "1", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });
});

// ===========================================================================
// (b) The sibling-code boundaries — bug 0148's row, and the own-`(` row.
// ===========================================================================

describe("0225 (b) — the codes already firing on the same swallow keep their bytes", () => {
  it("A12: a swallowed `let x = 1` keeps bug 0148's emission and gains this route's at the `=`", () => {
    // Bug 0148's arm (theta-document.ts:2450) refuses the reserved spelling
    // `let` at 5:1–5:4 and this route's predicate does NOT judge a `keyword`
    // (Decision 1), so that emission stands unmodified. The swallowed
    // statement's `x` is a legal `Ident` (bug 0150's half), so the first
    // refused token is the `=`: line 5 `let x = 1` gives `l`=1, `e`=2, `t`=3,
    // ` `=4, `x`=5, ` `=6, `=`=7 → 5:7–5:8. `assembleDiagnostics`
    // (src/diagnostics/diagnostic.ts) sorts by (file, line, column), so the
    // keyword code at column 1 precedes it. At HEAD this row draws the
    // reserved-keyword code ALONE — pinned as such by
    // tests/fn-param-list-unclosed.test.ts's c3 cell, which the fix's
    // authorised assertion edit moves.
    const doc = theta("fn h(a: string,\nlet x = 1\n) { 1 }\n");
    expect(
      triples(doc),
      `bug 0148's code keeps its range and this route's joins it, ordered by column; diagnostics=${render(doc)}`,
    ).toEqual([e(RESERVED, "5:1-5:4"), e(NOTID, "5:7-5:8")]);
    expect(quads(doc)).toEqual([
      q(RESERVED, "5:1-5:4", [["<keyword>", "let"]]),
      q(NOTID, "5:7-5:8"),
    ]);
    expect(
      paramsOf(doc),
      `the swallowed statement's five tokens stay recorded (the non-recovery); diagnostics=${render(doc)}`,
    ).toEqual([
      { name: "a", type: "string" },
      { name: "let", type: "" },
      { name: "x", type: "" },
      { name: "=", type: "" },
      { name: "1", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("A13: a swallowed region carrying its own balanced `(…)` keeps its existing two-diagnostic tail", () => {
    // Bug 0225 §Reproduction A13's boundary. The swallowed `q = f(1)` opens a
    // paren of its own, so the loop's `)` exit takes the CALL's closer and the
    // list's own `)` becomes a stray at statement position on line 6 — which
    // already draws `theta/parse/unsupported-feature` with the `stray ')' in
    // statement position` tail and, for the trailing `{ 1 }`,
    // `theta/parse/bare-object-literal`. Both keep their bytes; this route's
    // code joins them ahead of both in position order, ranged on the `=` at
    // line 5 (`q`=1, ` `=2, `=`=3 → 5:3–5:4).
    const doc = theta("fn h(a: string,\nq = f(1)\n) { 1 }\n");
    expect(
      triples(doc),
      `the existing tail is unmoved and this route's code sorts ahead of it; diagnostics=${render(doc)}`,
    ).toEqual([e(NOTID, "5:3-5:4"), e(UNSUPPORTED, "6:1-6:2"), e(BARE_OBJECT, "6:3-6:8")]);
    expect(quads(doc)).toEqual([
      q(NOTID, "5:3-5:4"),
      q(UNSUPPORTED, "6:1-6:2", [["<construct>", "stray ')' in statement position"]]),
      q(BARE_OBJECT, "6:3-6:8"),
    ]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "q", type: "" },
      { name: "=", type: "" },
      { name: "f", type: "" },
      { name: "(", type: "" },
      { name: "1", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });
});

// ===========================================================================
// (c) The predicate's own edges.
// ===========================================================================

describe("0225 (c) — the predicate's edges: the `mut` exemption's scope, a doubled separator, a bare literal name", () => {
  it("X3: `fn h(mut = 1) { 1 }` exempts the `mut` iteration's shifted token and judges the NEXT one", () => {
    // Decision 5's scope, stated by measurement rather than by prose. The
    // `mut` consume at theta-document.ts:2410 shifts the `=` into the name
    // slot of the SAME iteration, so that `=` is exempt (or X2 would gain a
    // second diagnostic, which bug 0148 §Fix (d) forbids). The next iteration
    // is judged normally, and its token is the `1`: line 4 columns are `f`=1,
    // `n`=2, ` `=3, `h`=4, `(`=5, `mut`=6–8, ` `=9, `=`=10, ` `=11, `1`=12 →
    // 4:12–4:13.
    const doc = theta("fn h(mut = 1) { 1 }\n");
    expect(
      triples(doc),
      `the exemption covers one iteration, not the rest of the list; diagnostics=${render(doc)}`,
    ).toEqual([e(MUT_IMMUTABLE, "4:6-4:9"), e(NOTID, "4:12-4:13")]);
    expect(quads(doc)).toEqual([q(MUT_IMMUTABLE, "4:6-4:9"), q(NOTID, "4:12-4:13")]);
    expect(
      paramsOf(doc),
      `the \`mut\` recovery artefacts stay recorded as at HEAD; diagnostics=${render(doc)}`,
    ).toEqual([
      { name: "=", type: "" },
      { name: "1", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("X4: `fn h(a: string,,) { 1 }` refuses the doubled separator's second `,`", () => {
    // The first `,` is consumed as the separator at theta-document.ts:2487, so
    // the second one arrives at a parameter-NAME position and is a `punct`
    // token there. Columns: `,`=15 (the separator), `,`=16 → 4:16–4:17.
    const doc = theta("fn h(a: string,,) { 1 }\n");
    expect(
      triples(doc),
      `\`FnParams\` admits ONE trailing comma (grammar.md:144), not a comma at a name position; diagnostics=${render(doc)}`,
    ).toEqual([e(NOTID, "4:16-4:17")]);
    expect(quads(doc)).toEqual([q(NOTID, "4:16-4:17")]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: ",", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("X5: `fn h(3): number { 1 }` — the `Ident`-half row bug 0150 disclaims and this report claims", () => {
    // Bug 0150 §Non-goals records this exact input as "a measurement of the
    // loop's coverage, not claimed here"; bug 0225 claims it. A single
    // well-formed-looking declaration whose one parameter is literally named
    // `3`: the list IS closed, so the emission fires on the epilogue's
    // `)`-present arm exactly as A1's does. Columns: `(`=5, `3`=6 → 4:6–4:7.
    const doc = theta("fn h(3): number { 1 }\n");
    expect(
      triples(doc),
      `a number token derives from no \`Ident\` (lexical.md:13); diagnostics=${render(doc)}`,
    ).toEqual([e(NOTID, "4:6-4:7")]);
    expect(quads(doc)).toEqual([q(NOTID, "4:6-4:7")]);
    expect(paramsOf(doc)).toEqual([{ name: "3", type: "" }]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });
});

// ===========================================================================
// (d) Must not move — the controls this route is bounded by.
// ===========================================================================

describe("0225 (d) — the rows this route must leave byte-identical", () => {
  it("A10: the closed control `fn h(a: string) { 1 }` + `x = 1` keeps its `reassign`; bug 0370 refuses the UNDECLARED target", () => {
    // The sharpest control against A1: the same two lines with the `)` where
    // the author put it. This route's own subject is PRESERVED byte-for-byte:
    // one recorded parameter, and the reassignment PRESENT in
    // `doc.body.statements` (not swallowed into the parameter list, the way A1
    // proves it is when the `)` is misplaced). Bug 0225's fn-param-not-identifier
    // route stays silent on this well-formed list — its predicate never fires
    // here.
    //
    // What bug 0370 (§Fix layer 1) adds is orthogonal to this route: `x` is an
    // UNDECLARED top-level reassignment target, and the target-scope walk now
    // refuses it with `theta/parse/unknown-identifier` (spanning the whole
    // statement, `5:1-5:6`) exactly as it refuses an undeclared write inside an
    // `fn` body — the walk is unconditional on statement position. That error
    // consequently denies registration. Both are 0370 collateral, NOT this
    // route firing; the `paramsOf` and `topKinds` pins below are the byte-
    // identical observables that still guard bug 0225's route.
    const doc = theta("fn h(a: string) { 1 }\nx = 1\n");
    expect(
      triples(doc),
      `the reassign survives; bug 0370 refuses its undeclared target; diagnostics=${render(doc)}`,
    ).toEqual([e(UNKNOWN_IDENT, "5:1-5:6")]);
    expect(paramsOf(doc)).toEqual([{ name: "a", type: "string" }]);
    expect(
      topKinds(doc),
      `the author's reassignment is present when the list closes; diagnostics=${render(doc)}`,
    ).toEqual(["fn", "reassign"]);
    // 0370's undeclared-target refusal is error-severity, so it denies
    // registration; bug 0225's route contributed nothing to this.
    expect(registered(doc)).toBe(false);
  });

  it("A11: `fn h(p): number { 1 }` — an annotation-less legal `Ident` is NOT refused (bug 0150's, open)", () => {
    // Decision 1's boundary, asserted rather than described. `p` is
    // `[A-Za-z_][A-Za-z0-9_]*` (lexical.md:13) and its missing `":" Type` is
    // bug 0150's open adjudication, whose route 1 would red twelve committed
    // cells across five files. This route does not decide it: the row stays
    // silent and still registers, and the recorded type stays `""` (the
    // `if (this.isPunct(":"))` guard at theta-document.ts:2478 is untouched).
    const doc = theta("fn h(p): number { 1 }\n");
    expect(
      triples(doc),
      `the missing annotation is bug 0150's subject and is not decided here; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "" }]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(true);
  });

  it("A14: the missing-`(` end of the same production keeps all four diagnostics", () => {
    // `parseFn`'s missing-`(` arm (theta-document.ts:2354–2363, whose
    // `unsupported syntactic feature: fn parameter list must be parenthesised`
    // tail is at `:2361`) is the enforced other end of `FnDecl`, and its
    // four-diagnostic tail is separately pinned through the registry oracle by
    // tests/reserved-keyword-type-position.test.ts:483. This route adds a row
    // for a bad parameter NAME and does not unify the two ends, so nothing
    // here moves.
    const doc = theta("fn h p: string { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(UNSUPPORTED, "4:6-4:7"),
      e(UNKNOWN_IDENT, "4:6-4:7"),
      e(UNSUPPORTED, "4:7-4:8"),
      e(BARE_OBJECT, "4:16-4:21"),
    ]);
    expect(quads(doc)).toEqual([
      q(UNSUPPORTED, "4:6-4:7", [["<construct>", "fn parameter list must be parenthesised"]]),
      q(UNKNOWN_IDENT, "4:6-4:7", [["<name>", "p"]]),
      q(UNSUPPORTED, "4:7-4:8", [["<construct>", "stray ':' in statement position"]]),
      q(BARE_OBJECT, "4:16-4:21"),
    ]);
    expect(
      paramsOf(doc),
      `no parameter list was parsed at all; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("X2: `fn h(mut: string) { 1 }` keeps `mut-on-immutable-context` ALONE", () => {
    // Decision 5, the row it exists for (bug 0148 §Fix (d), and the boundary
    // the in-loop `atParamStart` comment names at theta-document.ts:2393–2398).
    // Consuming `mut` shifts the annotation `:` into the name slot of the same
    // iteration; the exemption keeps it unjudged, and the token after it
    // (`string`) is a reserved spelling and therefore `kind: "keyword"`, which
    // Decision 1's predicate does not judge either. So exactly one diagnostic,
    // with both recovery artefacts recorded as at HEAD.
    const doc = theta("fn h(mut: string) { 1 }\n");
    expect(
      triples(doc),
      `neither shifted token may draw a second diagnostic; diagnostics=${render(doc)}`,
    ).toEqual([e(MUT_IMMUTABLE, "4:6-4:9")]);
    expect(quads(doc)).toEqual([q(MUT_IMMUTABLE, "4:6-4:9")]);
    expect(paramsOf(doc)).toEqual([
      { name: ":", type: "" },
      { name: "string", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("X6: the `{`-break exit keeps bug 0151's emission ALONE, with this route's code suppressed", () => {
    // Decision 2's other half. `fn h(a: string, 42 { 1 }` records the refused
    // `42` and then breaks at the `{` (theta-document.ts:2405–2407), so the
    // list is UNCLOSED and bug 0151's row is the correct verdict — its
    // *Message* is true here and this route's would be a second, weaker
    // statement about the same fault. The emission fires only on the
    // epilogue's `)`-present arm, so nothing joins it. Bug 0225 §Fix
    // constraint 2: bug 0151's settled exits do not move.
    const doc = theta("fn h(a: string, 42 { 1 }\n");
    expect(
      triples(doc),
      `the unclosed verdict owns this exit; diagnostics=${render(doc)}`,
    ).toEqual([e(UNCLOSED, "4:5-4:6")]);
    expect(quads(doc)).toEqual([q(UNCLOSED, "4:5-4:6")]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "42", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("X7: the EOF exit keeps bug 0151's pair ALONE, with this route's code suppressed", () => {
    // The same suppression at the other settled exit (theta-document.ts:2513).
    // The lexer's `single-line-if` scan fires for its own unrelated reason —
    // there is no braced body, because there is no body — and bug 0151's row
    // names the unclosed list. Both keep their bytes; this is
    // tests/fn-param-list-unclosed.test.ts's c6 cell in substance, and it must
    // stay green.
    const doc = theta("fn h(a: string,\n42");
    expect(
      triples(doc),
      `the EOF exit is bug 0151's, not this route's; diagnostics=${render(doc)}`,
    ).toEqual([e(SINGLE_LINE_IF, "4:1-4:3"), e(UNCLOSED, "4:5-4:6")]);
    expect(quads(doc)).toEqual([q(SINGLE_LINE_IF, "4:1-4:3"), q(UNCLOSED, "4:5-4:6")]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "42", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(false);
  });

  it("X8: bug 0124's withhold keeps its input byte-for-byte, new emission included", () => {
    // Decision 4. `parseType`'s unfloored `<` / `>` depth counter consumed the
    // author's `)` into the annotation, which sets `closeParenAbsorbed`
    // (theta-document.ts:2482–2484, via `unmatchedCloseParens` at `:1897`), so
    // the author DID write the closer and the fault is the capture's. Bug
    // 0151 withholds its verdict and its recovery there; this route withholds
    // its emission too, or the body's `{`, `1` and `}` — recorded as
    // parameters BY the withhold — would each be a refused `punct` token and
    // the input would change disposition. The three withhold cells at
    // tests/fn-param-list-unclosed.test.ts and the sibling assertions in
    // tests/annotation-nontype-text-refusal.test.ts and
    // tests/nested-inline-enum-generic-argument-refusal.test.ts keep their
    // bytes because of this row.
    const doc = theta('fn h(p: array<enum["a", "b">) { 1 }\n');
    expect(
      triples(doc),
      `the withhold covers this route's emission as well; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(
      paramsOf(doc),
      `the absorbed-closer capture and its recorded artefacts are unchanged; diagnostics=${render(doc)}`,
    ).toEqual([
      { name: "p", type: 'array<enum["a","b">)' },
      { name: "{", type: "" },
      { name: "1", type: "" },
      { name: "}", type: "" },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(true);
  });

  it("X9: the withhold covers the `)`-present arm's own guard, `refusedTok !== null && closeParenAbsorbed`, together", () => {
    // Decision 4's guard (`if (refusedTok !== null && !closeParenAbsorbed)`,
    // theta-document.ts:2503) is a conjunction over two flags this loop sets
    // independently — a bad parameter-name token and an absorbed list-closer
    // can both arise in the SAME list, and X8 alone does not show it: X8's
    // one parameter is a legal `Ident`, so `refusedTok` there stays `null` and
    // the cell exits through the OTHER guarded check
    // (`unclosed && !closeParenAbsorbed`) rather than this arm at all. Here
    // the FIRST parameter is the punct `=` (`refusedTok` set, non-null) and
    // the SECOND parameter's type is X8's own absorbing spelling
    // (`closeParenAbsorbed` set), and the type capture's stray `)` leaves a
    // second `)` in the source to close the list — so this input reaches the
    // `)`-present arm with both flags true at once, and the withhold decides
    // it exactly as bug 0124 decided X8: the input keeps its prior
    // disposition byte-for-byte, this route's emission included.
    const doc = theta('fn h(=, x: array<enum["a", "b">) ) { 1 }\n');
    expect(
      triples(doc),
      `both halves of the conjunction hold at once, and the withhold covers this route's emission too; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(
      paramsOf(doc),
      `the refused \`=\` and the absorbing capture's recorded type are unchanged by the withhold; diagnostics=${render(doc)}`,
    ).toEqual([
      { name: "=", type: "" },
      { name: "x", type: 'array<enum["a","b">)' },
    ]);
    expect(topKinds(doc)).toEqual(["fn"]);
    expect(registered(doc)).toBe(true);
  });
});
