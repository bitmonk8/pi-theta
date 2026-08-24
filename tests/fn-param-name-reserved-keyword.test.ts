import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0148 — the `fn` PARAMETER-NAME position of the reserved-keyword rule, and
// the diagnostic it draws
// (docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md).
//
// THE RULE, written with no position qualifier.
// docs/spec_topics/lexical.md:20 lists 32 reserved spellings — `let`, `mut`,
// `fn`, `if`, `else`, `for`, `in`, `while`, `break`, `continue`, `return`,
// `match`, `schema`, `enum`, `import`, `export`, `from`, `as`, `by`, `invoke`,
// `true`, `false`, `null`, `Ok`, `Err`, `Result`, `string`, `number`,
// `integer`, `boolean`, `array`, `void` — and states the consequence without a
// scope list: "Using one of these in identifier position is
// `theta/parse/reserved-keyword-as-identifier`". The registry row
// (docs/spec_topics/diagnostics/code-registry-parse.md:21, severity `E`)
// carries the same shape: *Trigger* "Reserved keyword used in an identifier
// position", naming no position — unlike `:19`'s four-entry enumeration for the
// case code. A `fn` parameter name is an identifier position by the grammar:
// `FnParam ::= Ident ":" Type` (docs/reference/grammar.md:254,
// docs/spec_topics/grammar.md:140), the same `Ident` terminal the rule's own
// rationale invokes when it says keeping the spellings reserved "is what stops
// them matching `NamedType ::= Ident`". lexical.md:3 applies every rule on that
// page to `.theta` and `.thetalib` alike.
//
// WHERE THE CODE IS ENFORCED. `contextualDiagnostics` (`src/lexer/lexer.ts`)
// owns the lexer half through its `checkName` worker, whose FIRST arm is this
// code: a `keyword`-kind token draws it and returns, ahead of the non-`ident`
// bail and the first-letter case tests later in `checkName`. Everything
// positional lives in the caller, and the caller is a keyword scan with
// exactly three branches — the identifier after `let` (past the `mut` skip),
// after `fn`, and after `schema` / `enum`. A parameter name's predecessor is
// `(` or `,`, punctuation, so no call reaches it: the SHAPE of the scan
// excludes the position, not an omitted branch. `contextualDiagnostics`'s own
// doc comment hands the remainder over in terms — "full identifier-position
// coverage (every reserved word in every identifier slot) is a parser-leaf
// obligation".
//
// WHY THE PARSER LEAF IS THE SITE. `parseFn`'s parameter loop
// (src/parser/theta-document.ts:2151, loop `:2180–2242`) captures the name
// token at `:2193` with its `kind` and its `range` in hand, and already
// reports a per-parameter registered code eleven lines earlier — `mut`'s
// `checkMutModifier` verdict at the modifier's own range (`:2181–2192`).
// `parseFn` serves the `subagent fn` form through its flag and both file
// extensions through one call, so one branch there covers rows a10 and a11.
// The `ident` guard at `:2211` is the classification's second arm: reserved
// spellings lex as `kind: "keyword"` (the `reserved.has(value) ? "keyword" :
// "ident"` tagging in `scanTokens`, `src/lexer/lexer.ts`, against the
// 32-member set at `src/lexer/lexer.ts:159–166`), so the one token kind this
// code exists for is the one kind that guard excludes. The guard is correct
// for the code it guards — `binding-case-mismatch`'s *Trigger*
// (code-registry-parse.md:19) reads "**Identifier** in a binding / parameter /
// fn-name / field-name position" — which is why the keyword arm sits BESIDE it
// in `checkName`'s own keyword-first order rather than inside it. `FnParam`
// (src/parser/theta-document.ts:409–412) carries no range of its own, so the
// name token's range is the only one a diagnostic at this position can carry,
// which is what makes the range assertions below load-bearing.
//
// THE CONTRACT THIS FILE PINS — bug 0148 §Expected behaviour, one emission and
// no more: for a `fn` parameter whose name is one of the 32 reserved
// spellings, exactly one additional `theta/parse/reserved-keyword-as-identifier`,
// severity `error`, the registry *Message* with the keyword interpolated,
// ranged on the PARAMETER NAME TOKEN. The code is `E`, so `hasLoadParseError`
// (src/extension/production-composition.ts:2047–2054, applied at `:2094`)
// refuses to register the theta — that refusal is the emission's practical
// consequence and the reason the spelling reaching the runtime is an S1 cell.
//
// THE LEDGER — what each group of rows pins:
//   - MUST FIRE, exactly one `theta/parse/reserved-keyword-as-identifier`:
//     a1 (the pin, with its range), a2–a6 (the spelling groups: a primitive
//     name, the two `Result` constructors, the `Result` type itself, a
//     statement head), a7 (the SECOND parameter, with its range — a diagnostic
//     ranged on the declaration head passes every code-only check and fails
//     here), a8 (trailing comma), a9 (no annotation), a10 (`subagent fn`),
//     a11 (the `.thetalib` route), a12 (a call site adds no second emission).
//   - MUST REPORT BOTH CODES, ordered by column: b3, where the `mut` modifier
//     and the reserved parameter name each draw their own registered code at
//     their own range; and the coexistence row, where bug 0139's case code and
//     this one land on two different parameters of one list. `checkName`'s
//     order is keyword-first with an early return, so ONE parameter is never
//     both — the uppercase-first reserved spellings `Ok` / `Err` / `Result`
//     are claimed by the keyword arm (row a3) — which makes two parameters
//     side by side the only form in which the two codes can be observed
//     together.
//   - MUST STAY EXACTLY ONE: b2 (`fn h(mut: string)`), which keeps
//     `mut-on-immutable-context` ALONE. The modifier check consumes `mut`
//     before the name is read, so what re-enters the loop in the name slot is
//     the recovery artefact `:` — a position no author wrote an identifier at.
//     A classification that fires on it widens the code to parser recovery
//     state and reds here.
//   - MUST REPORT BOTH, ordered by line: c4, where the type layer's
//     `fn-arg-type-mismatch` verdict is unchanged and the new lexical
//     diagnostic is appended ahead of it. The fix reaches no judgement.
//   - MUST NOT MOVE: a13 (a conformant parameter stays clean), a14 (bug 0139's
//     case emission at the SAME loop iteration, code, message and range
//     @4:6-4:7), a15–a21 (the three enforced keyword adjacencies, including the
//     `let mut` skip and both the `schema` and `enum` arms — they are what make
//     a red above attributable to the parameter position rather than to a dead
//     code or a broken harness), e11 and e12 (bug 0044's type-position
//     emissions). Row e14 is no longer a must-not-move row: bug 0153 retook it
//     once to the two-element misfire list, and bug 0242
//     (docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md)
//     retook it again to the single correct diagnostic at the `for` variable's
//     own range, once the lexer stopped judging the `in` beside it.
//   - REGISTRATION: d1 (the pin does not register), d2 (bug 0139's spelling
//     still does not), d3 (a conformant parameter still does).
//
// OVER-REACH TRIPWIRES. lexical.md:20 bounds itself by no position list, so a
// classification widened past `parseFn`'s parameter loop reaches positions
// this report does not claim. Rows e7 and e10 below are still that: the
// disposition bug 0148 §Fix (b) records, where a reader finding one red should
// widen the fix's scope question rather than the row. Rows e4, e4p, e5, e6,
// e8, e9a, e9b and e14 are no longer dispositions — they are DELIVERIES,
// RETAKEN by bug 0153
// (docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md), which
// claimed all six of the positions 0148 left out and closed each at its own
// parser leaf. Each retaken row now pins the code, the interpolated subject
// and the RANGE of that delivery, so a fix that lands the emission at the
// wrong token still reds here; the whole 32-spelling picture at each of the
// six positions lives in 0153's own witness,
// tests/reserved-keyword-remaining-identifier-positions.test.ts:
//   - e4 / e4p — the `for` and `par for` iteration variable, emitted at
//     `parseFor` / `parseParFor`'s variable capture. Bug 0153's claim.
//   - e5 — the schema field NAME, emitted at `parseSchemaObjectBody`'s
//     name token. Bug 0153's claim; bug 0046's §Non-goals and bug 0149 cover
//     the casing half of that position only.
//   - e6 — the `params:` frontmatter field NAME, emitted from
//     `extractParsedParams` on the YAML key. Bug 0153's claim.
//   - e7 — the `match` pattern binder. OWNED BY BUG 0141
//     (docs/bugs/0141-capitalised-bare-match-pattern-binds-identifier.md) §Fix
//     (a) half 2, which enforces the same code at a disjoint site:
//     `parsePattern`'s tail arm against `parseFn`'s parameter loop. The row
//     records that delivery: the emission there is 0141's, sourced from
//     `lexical.md`'s restatement for `match` patterns, NOT this report's
//     parameter-position rule widening. A fix HERE that changes the range,
//     the count or the site of that emission is over-reach.
//   - e8 — the `enum` variant name, emitted at `parseEnumVariants`'s name
//     capture. Bug 0153's claim. The variant-name CASE rule at that position
//     remains unclaimed by any report.
//   - e9a / e9b — both `import` specifier binding forms, emitted in
//     `parseImportExport`'s specifier loop at the SOURCE and ALIAS slots. Bug
//     0153's claim.
//   - e14 — a `for` variable spelled `let`. Bug 0153 §Fix (c) route (i)
//     accepted the lexer's `let`-adjacency misfire beside its own correct
//     diagnostic and pinned both; bug 0242 §Fix ROUTE A removed the misfire by
//     teaching `contextualDiagnostics` that the token behind a `for` is an
//     iteration variable and not a declarator head. The row pins ONE
//     diagnostic: the refusal naming `let` at @5:5-5:8.
//   - e10 — a keyword in a `fn` parameter's TYPE slot. Bug 0044's family (a
//     `Type` position governed by `NamedType ::= Ident`), whose four shipped
//     parser-leaf callers reach the schema-body and `params:` field types
//     (rows e11, e12) and not this one. Orthogonal to the NAME slot.
//   - ck1 / ck2 / ck3 — `par`, `with` and `subagent` at the parameter name.
//     They are CONTEXTUAL keywords, absent from `reservedKeywords()`
//     (src/lexer/lexer.ts:159–166), and their non-firing is separately pinned
//     at other positions (tests/par-for.test.ts:175–183,
//     tests/subagent-fn.test.ts:404–421). A classification reading the shipped
//     set keeps these silent by construction; one minting a second list reds
//     here.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74) — no asserted
// message string is written out here. Each one is READ from the registry's
// *Message* column through `parseRegistry` / `registryMessage`
// (tools/code-registry/index.js) and the `msg` helper below. This code's
// template carries a `<keyword>` placeholder, which the helper fills and
// asserts the presence of, so a copied string would be brittle twice over —
// once against a reworded template and once against a renamed slot.
// DIAG-2 (`:72`) is not engaged: every code asserted below is registered, and
// this one's *Trigger* names no position at all, so the emission the a-rows
// require sits inside the already-registered set and no table is edited.
// Row r1 pins the row's `E` severity, which is what ties the emission to the
// registration refusal the d-rows measure.
//
// ANTI-VACUITY. Twenty-seven of the forty diagnostic-list rows expect a
// non-empty ordered code list, so a harness that stopped reaching the lexer or
// the parser fails loudly here rather than turning the thirteen `toEqual([])`
// rows into silent passes. Every code assertion is an ordered whole-list
// equality over the UNFILTERED `doc.diagnostics`, so neither an extra
// diagnostic nor a diagnostic emitted at the wrong position can hide inside a
// containment check.
//
// TIER: unit, offline, deterministic, provider-free. Every observable settles
// inside one `parseThetaDocument` call over a source string — there is no
// session, no host, and no model on this path, so an integration tier would add
// a round-trip to a parse-time value and buy no reach, and a live tier would
// make a fully determined value stochastic. The one thing this tier cannot
// reach is the composition root's registration decision, which the d-rows
// mirror by construction and an additive H8a cell
// (tests/live/live-production-acceptance.test.ts) exercises end to end.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. The registry lookups assert their row's presence and
// their template's placeholder before either is used, and the range readers
// assert their diagnostic's presence and locatedness before reading it.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* and *Sev* columns.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
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

const RESERVED = "theta/parse/reserved-keyword-as-identifier";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const MUT_IMMUTABLE = "theta/parse/mut-on-immutable-context";
const FN_ARG_MISMATCH = "theta/parse/fn-arg-type-mismatch";

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row or a reworded template reds by naming the registry rather than
 * by a bare `undefined` comparison.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
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

/** The registry *Message* for this code with `<keyword>` filled by `keyword`. */
function reservedMsg(keyword: string): string {
  return msg(RESERVED, [["<keyword>", keyword]]);
}

// ===========================================================================
// Parse harness.
// ===========================================================================
//
// `parseDoc` (tests/helpers/e2e-s1.ts:39) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is
// stubbed: the lexer and parser under assertion are the production ones.

/** Frontmatter for every `.theta` row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` as a `.theta` under the standard frontmatter. */
function theta(body: string): ThetaDocument {
  return parseDoc(FM + body);
}

/** The aggregated diagnostic codes, in report order. */
function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => d.code);
}

/** Every diagnostic rendered `severity code @l:c-l:c: message` — failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      const at =
        r === undefined
          ? "-"
          : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
      return `${d.severity} ${d.code} @${at}: ${d.message}`;
    }),
  );
}

/** A 1-indexed, end-exclusive-column source range literal. */
function range(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): SourceRange {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  };
}

/** The message reported for `code`, or `undefined` when no diagnostic carries it. */
function messageFor(doc: ThetaDocument, code: string): string | undefined {
  return doc.diagnostics.find((d: Diagnostic) => d.code === code)?.message;
}

/** The severity reported for `code`, or `undefined` when no diagnostic carries it. */
function severityFor(doc: ThetaDocument, code: string): string | undefined {
  return doc.diagnostics.find((d: Diagnostic) => d.code === code)?.severity;
}

/**
 * The range of the single diagnostic carrying `code`. Uniqueness and
 * locatedness are asserted before the read, so an absent, duplicated, or
 * location-less diagnostic reds by naming the row rather than by comparing
 * against `undefined`.
 */
function soleRange(doc: ThetaDocument, code: string): SourceRange {
  const hits = doc.diagnostics.filter((d: Diagnostic) => d.code === code);
  expect(
    hits.length,
    `exactly one ${code} is expected before its range is read; diagnostics=${render(doc)}`,
  ).toBe(1);
  const only = hits[0];
  if (only === undefined) {
    throw new Error(`no ${code} diagnostic to range; diagnostics=${render(doc)}`);
  }
  const r = only.range;
  if (r === undefined) {
    throw new Error(
      `the ${code} diagnostic must be located on the offending token; diagnostics=${render(doc)}`,
    );
  }
  return r;
}

/**
 * Whether `diagnostics` blocks registration. This replicates `hasLoadParseError`
 * (src/extension/production-composition.ts:2047–2054) by construction: that
 * function is module-private — `rg -n 'export.*hasLoadParseError' src/` matches
 * nothing — so it cannot be imported, and the predicate is mirrored here
 * instead, the same way and for the same reason
 * `tests/index-element-alias-runtime-disposition.test.ts:185` mirrors it. Its
 * clauses are the whole of the original: error severity, and a code in the
 * `theta/load/` or `theta/parse/` namespace. `parseDiscoveredTheta` applies it
 * at `:2094` and drops the theta.
 */
function blocksRegistration(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      (diagnostic.code.startsWith("theta/load/") ||
        diagnostic.code.startsWith("theta/parse/")),
  );
}

// ===========================================================================
// (r) The registry row — the oracle every message and the d-rows depend on.
// ===========================================================================

describe("0148 (r) — the registered row this file asserts against", () => {
  it("r1: the code is registered `E`, which is what makes its emission block registration", () => {
    // DIAG-2: the registry is closed, so the row's existence is the licence for
    // every a-row. The *Sev* column is what ties the emission to the
    // registration refusal `blocksRegistration` mirrors — an `E` row is what
    // `hasLoadParseError` acts on, and a `W` row would leave the d1 pin
    // registering with a diagnostic attached.
    const row = REGISTRY.find((r) => r.code === RESERVED);
    expect(
      row,
      `DIAG-2: docs/spec_topics/diagnostics/code-registry-parse.md:21 must carry the row for ${RESERVED}`,
    ).toBeDefined();
    expect(
      (row as RegistryRow).severity,
      `${RESERVED} is no longer an E-severity row, so the registration refusal the d-rows assert no longer follows from the emission`,
    ).toBe("E");
    expect(
      (row as RegistryRow).message,
      "DIAG-4: the Message template carries the `<keyword>` slot the emission interpolates",
    ).toContain("<keyword>");
  });
});

// ===========================================================================
// (a) The defect — a reserved keyword at the `fn` parameter name.
// ===========================================================================

describe("0148 (a) — a reserved keyword as a `fn` parameter name is a parse error", () => {
  it("a1: `fn h(let: string): number { 1 }` reports one reserved-keyword-as-identifier, ranged on `let`", () => {
    // The pin. Grammar-conformant in shape (`FnParam ::= Ident \":\" Type`,
    // docs/reference/grammar.md:254, with the annotation present), one rule
    // violated, so lexical.md:20's disposition applies with nothing else in the
    // way.
    const doc = theta("fn h(let: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `lexical.md:20 bars all 32 reserved spellings from identifier position and code-registry-parse.md:21's Trigger names no position, so the parameter name is inside it; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(
      messageFor(doc, RESERVED),
      "DIAG-4 — the rendered prose is the registry's *Message* column with `<keyword>` interpolated",
    ).toBe(reservedMsg("let"));
    expect(
      severityFor(doc, RESERVED),
      "code-registry-parse.md:21's Sev column is `E`, which is what `hasLoadParseError` acts on",
    ).toBe("error");

    // The range is the row's real subject: `FnParam` carries no range of its
    // own (src/parser/theta-document.ts:409–412), so a diagnostic at this
    // position must carry the NAME TOKEN's range, and one pointing at the `fn`
    // keyword or at the whole declaration is the low-effort wrong answer this
    // assertion refuses.
    //
    // Derivation. The frontmatter occupies lines 1–3 (`---`, `mode: prompt`,
    // `---`), so the body is line 4. Within `fn h(let: string): number { 1 }`
    // the characters are `f`=1, `n`=2, ` `=3, `h`=4, `(`=5, `l`=6, and columns
    // are 1-indexed on the normalised stream (lexical.md §"Diagnostic spans").
    // The end column is exclusive, so the three-character name spans 6→9.
    expect(
      soleRange(doc, RESERVED),
      `the diagnostic covers the parameter NAME token, not the \`fn\` keyword; diagnostics=${render(doc)}`,
    ).toEqual(range(4, 6, 4, 9));
  });

  it("a2: the primitive spelling `string` reports it", () => {
    // `string` is one of the five primitive type names lexical.md:20 reserves,
    // and it is the spelling whose acceptance is most misleading: the parameter
    // and its annotation read identically, so the declaration looks well-formed.
    const doc = theta("fn h(string: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `a primitive type name is a reserved spelling at an identifier position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("string"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 6, 4, 12));
  });

  it("a3: the `Ok` constructor spelling reports it", () => {
    // An uppercase-first reserved spelling. It is also the group that proves
    // the two parameter-position codes are disjoint: bug 0139's case rule reads
    // the first letter and would judge `Ok` a violation if it saw it, and
    // `checkName`'s keyword-first order with its early return
    // (`src/lexer/lexer.ts`) is why exactly one code lands.
    const doc = theta("fn h(Ok: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `the keyword arm precedes the case arm, so an uppercase reserved spelling draws one code and not two; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("Ok"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 6, 4, 8));
  });

  it("a4: the `Err` constructor spelling reports it", () => {
    const doc = theta("fn h(Err: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `\`Err\` is in lexical.md:20's list; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("Err"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 6, 4, 9));
  });

  it("a5: the `Result` spelling reports it", () => {
    // lexical.md:20 carves `array` and `Result` out to be reachable "in type
    // position" only. The carve-out is about the TYPE slot; the name slot is an
    // identifier position, so the reservation applies here undiminished.
    const doc = theta("fn h(Result: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `the \`Result\` carve-out admits the spelling in type position, not at a binder; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("Result"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 6, 4, 12));
  });

  it("a6: the statement-head spelling `match` reports it", () => {
    // The spelling the code's only other positional witness uses
    // (tests/lexer-core.test.ts:164–175 pins `let match = 1`), so a1 and this
    // row differ in position and in nothing else.
    const doc = theta("fn h(match: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `the same spelling the \`let\` adjacency already refuses; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("match"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 6, 4, 11));
  });

  it("a7: the SECOND parameter of a list reports it, ranged on its own name", () => {
    // Per-parameter coverage, and the row bug 0148 §Fix (d) names in terms. A
    // classification that runs once per declaration, or that ranges every
    // violation on the declaration head, passes the code list and fails here.
    //
    // Derivation. Body on line 4 as in a1. Within
    // `fn h(a: string, let: string): number { 1 }` the prefix `fn h(a: string, `
    // is 16 characters, so `let` occupies columns 17, 18, 19 and spans 17→20
    // end-exclusive.
    const doc = theta("fn h(a: string, let: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `the conformant first parameter is silent and the second is not; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(
      soleRange(doc, RESERVED),
      `the diagnostic covers the offending parameter's own name token; diagnostics=${render(doc)}`,
    ).toEqual(range(4, 17, 4, 20));
  });

  it("a8: a trailing comma in the parameter list changes nothing", () => {
    // `parseFn`'s loop consumes an optional trailing `,` at the end of each
    // iteration and then sees `)` (src/parser/theta-document.ts:2236–2241), so
    // the trailing comma must mint no diagnostic for a parameter that is not
    // there.
    const doc = theta("fn h(let: string,): number { 1 }\n");
    expect(
      codesOf(doc),
      `a trailing comma introduces no second parameter; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 6, 4, 9));
  });

  it("a9: the unannotated parameter reports it", () => {
    // Separately non-conformant against `FnParam ::= Ident \":\" Type`'s
    // mandatory annotation, which is why a1 and not this row is the pin (bug
    // 0148 §Non-goals). The reserved rule reads the name, not the annotation:
    // the token is in binder position either way.
    const doc = theta("fn h(let): number { 1 }\n");
    expect(
      codesOf(doc),
      `the reserved rule reads the name token, not the annotation; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 6, 4, 9));
  });

  it("a10: the `subagent fn` form reports it", () => {
    // `parseFn` serves both declaration forms through its `subagent` flag
    // (src/parser/theta-document.ts:2151), so the two spellings share one
    // parameter list and one disposition.
    //
    // Derivation. `subagent ` is 9 characters and `fn s(` is 5, so `let`
    // occupies columns 15, 16, 17 and spans 15→18.
    const doc = theta("subagent fn s(let: string) { @`hi` }\n");
    expect(
      codesOf(doc),
      `the subagent modifier does not change the parameter position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 15, 4, 18));
  });

  it("a11: a `.thetalib` parameter is held to the same rule", () => {
    // lexical.md:3 applies every rule on that page to `.theta` and `.thetalib`
    // alike, and both extensions reach the same `contextualDiagnostics` call
    // inside `lexTheta` (src/lexer/lexer.ts:125) and the same `parseFn`, so the
    // rule is enforced at one pair of sites rather than two. A `.thetalib`
    // carries no frontmatter, so the body is line 1 here.
    const doc = parseDoc('fn t(let: string): string { "a" }\n', "lib.thetalib");
    expect(
      codesOf(doc),
      `the rule is extension-independent; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(1, 6, 1, 9));
  });

  it("a12: a call site adds nothing to the declaration's single diagnostic", () => {
    // The rule is on the declaration. A well-typed call binding the result
    // introduces no second binder position, so the whole-list equality pins one
    // diagnostic and not two.
    const doc = theta('fn h(let: string): number { 1 }\nlet z = h("a")\nz\n');
    expect(
      codesOf(doc),
      `a call site is not a binder position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 6, 4, 9));
  });
});

// ===========================================================================
// (a13)–(a21) The must-not-move controls.
// ===========================================================================

describe("0148 (a13)–(a21) — the conformant spelling and the enforced positions keep their behaviour", () => {
  it("a13: `fn h(x: string): number { 1 }` reports nothing", () => {
    // The predicate's negative side at the site under change: a parameter name
    // outside `reservedKeywords()` (src/lexer/lexer.ts:159–166) is silent.
    const doc = theta("fn h(x: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `a non-reserved parameter name satisfies the rule; diagnostics=${render(doc)}`,
    ).toEqual([]);
  });

  it("a14: `fn h(P: string): number { 1 }` still reports binding-case-mismatch alone, unmoved", () => {
    // The sharpest control: the SAME loop iteration, the SAME token slot, the
    // other code. Bug 0148 §Fix (d) requires this row unchanged byte for byte —
    // code, message and range @4:6-4:7 — because the classification widening
    // that adds the keyword arm runs immediately beside bug 0139's `ident` arm
    // (src/parser/theta-document.ts:2203–2229).
    const doc = theta("fn h(P: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `bug 0139's case emission at this position must not move; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
    expect(messageFor(doc, BINDING_CASE)).toBe(msg(BINDING_CASE, []));
    expect(soleRange(doc, BINDING_CASE)).toEqual(range(4, 6, 4, 7));
  });

  it("a15: `let match = 1` reports it (control — the `let` adjacency)", () => {
    // `contextualDiagnostics`'s `let` branch (`src/lexer/lexer.ts`). This row
    // and its five siblings prove the code, its message, its `E` severity and
    // the harness work, so a group (a) red is the parameter POSITION's alone.
    const doc = theta("let match = 1\n");
    expect(
      codesOf(doc),
      `the enforced \`let\` position must not move; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("match"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 5, 4, 10));
  });

  it("a16: `let let = 1` reports it (control)", () => {
    // The pin's own spelling at an enforced position, so a1 and this row differ
    // in position and in nothing else.
    const doc = theta("let let = 1\n");
    expect(
      codesOf(doc),
      `the enforced \`let\` position must not move; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 5, 4, 8));
  });

  it("a17: `let mut match = 1` reports it (control — past the `mut` skip)", () => {
    // The same `let` adjacency (`contextualDiagnostics`, `src/lexer/lexer.ts`).
    const doc = theta("let mut match = 1\n");
    expect(
      codesOf(doc),
      `the \`let mut\` position must not move; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("match"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 9, 4, 14));
  });

  it("a18: `fn match(): number { 1 }` reports it (control — the `fn` NAME adjacency)", () => {
    // `contextualDiagnostics`'s `fn` branch (`src/lexer/lexer.ts`) — the position
    // immediately beside the parameter list yet enforced at the other site, and
    // the reason the split is invisible from the spec: which keyword precedes
    // the identifier is the whole discriminator for the lexer's scan.
    const doc = theta("fn match(): number { 1 }\n");
    expect(
      codesOf(doc),
      `the enforced \`fn\` NAME position must not move; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("match"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 4, 4, 9));
  });

  it("a19: `fn let(): number { 1 }` reports it (control)", () => {
    const doc = theta("fn let(): number { 1 }\n");
    expect(
      codesOf(doc),
      `the enforced \`fn\` NAME position must not move; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 4, 4, 7));
  });

  it("a20: `schema Ok = string` reports it (control — the `schema` adjacency)", () => {
    // `checkName`'s `\"type\"` call (`src/lexer/lexer.ts`). Its keyword arm is
    // the same one, ahead of the PascalCase test, so a reserved spelling draws
    // this code and not `schema-case-mismatch`.
    const doc = theta("schema Ok = string\n");
    expect(
      codesOf(doc),
      `the enforced \`schema\` NAME position must not move; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("Ok"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 8, 4, 10));
  });

  it("a21: `enum Result { A }` reports it (control — the `enum` adjacency)", () => {
    const doc = theta("enum Result { A }\n");
    expect(
      codesOf(doc),
      `the enforced \`enum\` NAME position must not move; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("Result"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 6, 4, 12));
  });
});

// ===========================================================================
// (b) The `mut` interaction — the loop's other per-parameter code.
// ===========================================================================

describe("0148 (b) — `mut` at the parameter position keeps its own disposition", () => {
  it("b2: `fn h(mut: string)` reports mut-on-immutable-context ALONE", () => {
    // The binding constraint bug 0148 §Fix (d) states. The loop's modifier
    // check consumes the `mut` token before the name is read
    // (src/parser/theta-document.ts:2181–2192), so what re-enters the name slot
    // is the `:` the annotation opens with — a recovery artefact, not a token
    // an author wrote in identifier position. A classification that fires on it
    // widens the code past `lexical.md:20`'s subject to parser recovery state,
    // and reds here.
    const doc = theta("fn h(mut: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `\`mut\` draws the modifier code and nothing about an identifier; diagnostics=${render(doc)}`,
    ).toEqual([MUT_IMMUTABLE]);
    expect(messageFor(doc, MUT_IMMUTABLE)).toBe(msg(MUT_IMMUTABLE, []));
    expect(soleRange(doc, MUT_IMMUTABLE)).toEqual(range(4, 6, 4, 9));
  });

  it("b3: `fn h(mut let: string)` reports the mut code then the reserved code, in source order", () => {
    // The modifier and a real reserved name after it: each code carries the
    // range of the thing it judges, and both are reported. The ORDER is a
    // decision, not an accident — every group funnels through
    // `assembleDiagnostics` (src/diagnostics/diagnostic.ts:107–127), which
    // sorts by (file, line, column) with a stable sort, so the `mut` token's
    // column places it ahead of the parameter name's.
    //
    // Derivation. Within `fn h(mut let: string): number { 1 }`, `mut` occupies
    // columns 6–8 and spans 6→9; `let` occupies 10–12 and spans 10→13.
    const doc = theta("fn h(mut let: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `both registered codes fire on this parameter, ordered by column; diagnostics=${render(doc)}`,
    ).toEqual([MUT_IMMUTABLE, RESERVED]);
    expect(soleRange(doc, MUT_IMMUTABLE)).toEqual(range(4, 6, 4, 9));
    expect(
      soleRange(doc, RESERVED),
      `the reserved diagnostic sits on the name, to the right of \`mut\`, which is what orders the pair; diagnostics=${render(doc)}`,
    ).toEqual(range(4, 10, 4, 13));
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
  });
});

// ===========================================================================
// (c) The downstream verdict, and the two-code coexistence form.
// ===========================================================================

describe("0148 (c) — the type layer's verdict is unchanged and the two parameter-position codes coexist", () => {
  it("c4: a mistyped argument keeps fn-arg-type-mismatch, with the reserved code ahead of it", () => {
    // The parameter is first-class downstream: the type check binds it
    // positionally, judges it against its annotation, and renders the reserved
    // spelling back to the author inside another registered code's message
    // (code-registry-parse.md:116). This row pins that the fix adds a lexical
    // diagnostic and reaches no judgement — the declaration is on line 4, the
    // call on line 5, so `assembleDiagnostics`'s line ordering puts the new
    // code first.
    const doc = theta("fn h(let: string): number { 1 }\nlet z = h(1)\nz\n");
    expect(
      codesOf(doc),
      `no type-layer verdict moves; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED, FN_ARG_MISMATCH]);
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 6, 4, 9));
    expect(
      messageFor(doc, FN_ARG_MISMATCH),
      "DIAG-4 — the type layer's own message, with the reserved spelling in its `<param>` slot",
    ).toBe(
      msg(FN_ARG_MISMATCH, [
        ["<name>", "h"],
        ["<i>", "0"],
        ["<param>", "let"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    );
    expect(soleRange(doc, FN_ARG_MISMATCH)).toEqual(range(5, 11, 5, 12));
  });

  it("coexistence: an uppercase parameter beside a reserved one draws both codes, ordered by column", () => {
    // The only form in which the two parameter-position codes can be observed
    // together. `checkName`'s order is keyword-first with an early return
    // (`src/lexer/lexer.ts`), so ONE parameter is never both: the three
    // uppercase-first reserved spellings `Ok` / `Err` / `Result` are claimed
    // by the keyword arm (row a3) before the case test runs. Two parameters
    // side by side is therefore the coexistence proof.
    //
    // Derivation. Within `fn h(P: string, let: string): number { 1 }`, `P`
    // occupies column 6 and spans 6→7; the prefix `fn h(P: string, ` is 16
    // characters, so `let` spans 17→20.
    const doc = theta("fn h(P: string, let: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `the case rule and the reserved rule are separate emissions at separate parameters; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE, RESERVED]);
    expect(soleRange(doc, BINDING_CASE)).toEqual(range(4, 6, 4, 7));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 17, 4, 20));
    expect(messageFor(doc, BINDING_CASE)).toBe(msg(BINDING_CASE, []));
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
  });
});

// ===========================================================================
// (d) The registration consequence.
// ===========================================================================

describe("0148 (d) — the theta stops registering", () => {
  it("d1: the pin blocks registration", () => {
    // The S1 cell: `hasLoadParseError` drops a theta carrying any
    // error-severity `theta/load/*` or `theta/parse/*` diagnostic
    // (src/extension/production-composition.ts:2047–2054, applied at `:2094`),
    // so the emission the a-rows require is exactly what stops the spelling
    // lexical.md:20 refuses from loading, registering and running.
    const doc = theta("fn h(let: string): number { 1 }\n");
    expect(
      blocksRegistration(doc.diagnostics),
      `a spelling the spec refuses must not register; diagnostics=${render(doc)}`,
    ).toBe(true);
  });

  it("d2: bug 0139's uppercase spelling still blocks registration (control)", () => {
    const doc = theta("fn h(P: string): number { 1 }\n");
    expect(
      blocksRegistration(doc.diagnostics),
      `bug 0139's registration refusal at the same slot must not move; diagnostics=${render(doc)}`,
    ).toBe(true);
  });

  it("d3: a conformant parameter still registers (control)", () => {
    // Without this row d1 could be satisfied by a classification that refuses
    // every `fn` declaration.
    const doc = theta("fn h(x: string): number { 1 }\n");
    expect(
      blocksRegistration(doc.diagnostics),
      `a conformant declaration must keep registering; diagnostics=${render(doc)}`,
    ).toBe(false);
  });
});

// ===========================================================================
// (e) The over-reach tripwires — identifier positions bug 0148 leaves out.
// ===========================================================================

describe("0148 (e) — the other identifier positions stay silent", () => {
  // TRIPWIRES, not incidental coverage. Each row is a position lexical.md:20's
  // unqualified sentence reaches and bug 0148 §Fix (b) declares out of scope. A
  // later reader finding one red should widen the fix's scope question, and —
  // for e7 — coordinate with the report that claims it, not edit the row.

  it("e4: a `for` iteration variable named `string` draws bug 0153's refusal, ranged on the variable", () => {
    // RETAKEN by bug 0153
    // (docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md),
    // which claims this position and five siblings. What the row NOW records
    // is a delivery, not a disposition: the emission is 0153's parser-leaf one
    // at `parseFor`'s variable capture (src/parser/theta-document.ts:2341),
    // under lexical.md:20's unqualified sentence, and NOT bug 0148's
    // `atParamStart`-guarded parameter arm widening out of `parseFn`. The
    // range is the load-bearing half: `for ` is four characters on line 5, so
    // the variable spans 5→11 end-exclusive. A SECOND diagnostic here, a range
    // covering the whole statement, or a subject other than `string` is
    // over-reach by a fix at either report's site.
    const doc = theta("let xs = [1]\nfor string in xs { 1 }\n1\n");
    expect(
      codesOf(doc),
      `the \`for\` variable is bug 0153's claimed position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("string"));
    expect(soleRange(doc, RESERVED)).toEqual(range(5, 5, 5, 11));
  });

  it("e4p: a `par for` iteration variable named `string` draws bug 0153's refusal, ranged on the variable", () => {
    // RETAKEN by bug 0153, the same claim at the second parse site
    // (`parseParFor`, src/parser/theta-document.ts:4722). `par for ` is eight
    // characters, so the variable spans 9→15. Over-reach here would be a
    // diagnostic ranged on the `par` or `for` keyword rather than the name.
    const doc = theta("let xs = [1]\npar for string in xs { 1 }\n1\n");
    expect(
      codesOf(doc),
      `the \`par for\` variable is the same claimed position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("string"));
    expect(soleRange(doc, RESERVED)).toEqual(range(5, 9, 5, 15));
  });

  it("e5: a schema field NAME spelled `let` draws bug 0153's refusal, ranged on the name token", () => {
    // RETAKEN by bug 0153. Bug 0046's §Non-goals and bug 0149 cover the CASING
    // half of this position; this is the KEYWORD half, emitted at
    // `parseSchemaObjectBody`'s field-name token
    // (src/parser/theta-document.ts:2909–2910). `schema S { ` is eleven
    // characters, so the name spans 12→15. Over-reach would be the WHOLE
    // declaration range rows e11 / e12 carry — that range belongs to bug
    // 0044's TYPE-slot emission, whose `SchemaFieldSource` has no range of its
    // own; the NAME slot has a token, so it must use it.
    const doc = theta("schema S { let: string }\n1\n");
    expect(
      codesOf(doc),
      `the schema field NAME is bug 0153's claimed position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 12, 4, 15));
  });

  it("e6: a `params:` frontmatter field NAME spelled `let` draws bug 0153's refusal, ranged on the YAML key", () => {
    // RETAKEN by bug 0153. This is the face with no token: the name is a YAML
    // scalar key (src/parser/frontmatter.ts:840), so the predicate is string
    // membership in that module's `RESERVED_KEYWORDS` (`:569`,
    // `= reservedKeywords()`) and the range comes from `rangeOf(item.key, …)`,
    // the shape bug 0149's `binding-case-mismatch` emission in the SAME loop
    // already uses. The code is the REGISTERED `theta/parse/*` one and not a
    // `theta/load/` twin — DIAG-2 closes the registry and the `load`
    // namespace carries no reserved-keyword row at all. The two-space YAML
    // indent puts the key at columns 3–5 of line 4, so it spans 3→6. Over-reach would be the
    // VALUE node's range — that range is row e12's, bug 0044's TYPE-slot
    // emission at the same field.
    const doc = parseDoc("---\nmode: prompt\nparams:\n  let: string\n---\n1\n");
    expect(
      codesOf(doc),
      `the \`params:\` field NAME is bug 0153's claimed position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 3, 4, 6));
  });

  it("e7: a `match` pattern binder spelled `match` draws bug 0141's reserved-keyword refusal, not this report's", () => {
    // The load-bearing tripwire, now recording a delivery. The single code
    // here is bug 0141 §Fix (a) half 2's, emitted from `parsePattern`'s tail
    // arm under `lexical.md`'s restatement of the reserved set for `match`
    // patterns. This report's rule — lexical.md:16's lowercase-first NAMING
    // list of `let` / parameter / fn-name / field-name positions — still does
    // not reach a pattern binder, so a SECOND code, a different range, or an
    // emission from `parseFn`'s loop is over-reach by a fix here.
    const doc = theta("let v = 1\nlet r = match v { match => 1 }\nr\n");
    expect(
      codesOf(doc),
      `the pattern binder's refusal is bug 0141's, from \`parsePattern\`'s tail arm, not this report's parameter-position rule; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
  });

  it("e8: an `enum` variant named `let` draws bug 0153's refusal, ranged on the variant token", () => {
    // RETAKEN by bug 0153, emitted at `parseEnumVariants`'s name capture
    // (src/parser/theta-document.ts:3090). `enum E { ` is nine characters, so
    // the variant spans 10→13. The variant-name CASE rule (lexical.md:15,
    // schemas.md:78) is a different code and unclaimed by any report; a
    // `theta/parse/schema-case-mismatch` appearing here would be over-reach.
    const doc = theta("enum E { let }\n1\n");
    expect(
      codesOf(doc),
      `the enum variant NAME is bug 0153's claimed position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 10, 4, 13));
  });

  it("e9a: an `import` specifier named `let` draws bug 0153's refusal, ranged on the SOURCE name", () => {
    // RETAKEN by bug 0153, emitted in `parseImportExport`'s specifier loop at
    // the SOURCE name slot (src/parser/theta-document.ts:3221–3222, `:3230`).
    // `import { ` is nine characters, so the name spans 10→13. Over-reach
    // would be a diagnostic ranged over the whole statement — that range
    // belongs to `theta/parse/import-malformed-specifier-list`, whose subject
    // is a list that spells no specifier at all.
    const doc = theta('import { let } from "./lib.thetalib"\n1\n');
    expect(
      codesOf(doc),
      `the import specifier's SOURCE slot is bug 0153's claimed position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 10, 4, 13));
  });

  it("e9b: an `import ... as let` alias draws bug 0153's refusal, ranged on the ALIAS", () => {
    // RETAKEN by bug 0153 — the alias branch
    // (src/parser/theta-document.ts:3241–3242) and the fully live half of the
    // position: `a` is a legitimate export and the local binding becomes
    // `let`. `import { a as ` is fourteen characters, so the alias spans
    // 15→18. A diagnostic on the SOURCE name `a` here would be the
    // wrong-subject over-reach.
    const doc = theta('import { a as let } from "./lib.thetalib"\n1\n');
    expect(
      codesOf(doc),
      `the aliased import binding is the same claimed position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 15, 4, 18));
  });

  it("e10: a keyword in a `fn` parameter's TYPE slot reports nothing", () => {
    // Bug 0044's family — a `Type` position governed by `NamedType ::= Ident`,
    // whose four shipped parser-leaf callers reach the schema-body and
    // `params:` field types (rows e11, e12) and not this one. The NAME slot and
    // the TYPE slot of the same parameter are different rules' subjects, so
    // widening one must not reach the other.
    const doc = theta("fn h(x: let): number { 1 }\n");
    expect(
      codesOf(doc),
      `the parameter's TYPE slot is bug 0044's family, not this position; diagnostics=${render(doc)}`,
    ).toEqual([]);
  });

  it("e11: a schema field TYPE spelled `let` still reports it, unmoved", () => {
    // Bug 0044's shipped emission, rendered by
    // `reservedKeywordAsIdentifierDiagnostic`
    // (src/parser/theta-document.ts:5117) from the schema-body caller at
    // `:6294`. It ranges on the whole DECLARATION because
    // `SchemaFieldSource` carries no range of its own (`:6281–6285`), so this
    // row also pins that the parameter-name emission — which does have a token
    // range — is a separate site and not a widening of this one.
    const doc = theta("schema X { f: let }\n1\n");
    expect(
      codesOf(doc),
      `bug 0044's type-position emission must not move; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 1, 4, 20));
  });

  it("e12: a `params:` field TYPE spelled `let` still reports it, unmoved", () => {
    const doc = parseDoc("---\nmode: prompt\nparams:\n  x: let\n---\n1\n");
    expect(
      codesOf(doc),
      `bug 0044's \`params:\` type emission must not move; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("let"));
    expect(soleRange(doc, RESERVED)).toEqual(range(4, 6, 4, 9));
  });

  it("e14: `for let in xs { 1 }` names `let` at its own range, and names nothing else", () => {
    // RETAKEN TWICE. Bug 0153 §Fix (c) route (i) took this row to a
    // two-element list: the lexer's `let` adjacency
    // (`contextualDiagnostics`, `src/lexer/lexer.ts`, the `let` arm past its
    // `mut` skip) treats any `let` keyword token as a `let`-statement head, so
    // it inspected the token AFTER the for-variable and named the grammar's
    // own `in` — and 0153 left `src/lexer/lexer.ts` unedited on the ground
    // that open bugs 0051 and 0135 hold live citations in it.
    //
    // Bug 0242
    // (docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md) is
    // the authority for this retake. Its §Expected behaviour 1 states the
    // rule: `in` is a `ForStmt` terminal (docs/reference/grammar.md:272), not
    // an identifier position, so `theta/parse/reserved-keyword-as-identifier`'s
    // registered *Trigger* — "Reserved keyword used in an identifier position"
    // (docs/spec_topics/diagnostics/code-registry-parse.md:21) — does not hold
    // of it. Its §Fix ROUTE A gives `contextualDiagnostics` enough context to
    // tell a declarator head from a name: the token behind a `for` is at the
    // iteration-variable slot, and at a name slot both the declarator arms and
    // the `controlHeads` scan are skipped. The row keeps its subject and its
    // ordered-whole-list form and loses ONLY the misfire entry.
    //
    // What is still OVER-REACH, and still reds elsewhere in this file: any
    // narrowing that also silences a genuine declarator name — row a16
    // `let let = 1` must keep firing, and bug 0242's own witness
    // (tests/reserved-keyword-misfire-faces.test.ts group (R)) carries the
    // same tripwires for `let in = 1`, `fn in(): number {…}` and the inline
    // block `fn g(): number { let in = 1 }`.
    const doc = theta("let xs = [1]\nfor let in xs { 1 }\n1\n");
    expect(
      codesOf(doc),
      `bug 0242: the \`for\` variable draws the refusal once, and the grammar's own \`in\` draws nothing; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(
      doc.diagnostics.map((d: Diagnostic) => d.message),
      `the sole diagnostic names the offending variable \`let\`, not the \`in\` the author had no choice about; diagnostics=${render(doc)}`,
    ).toEqual([reservedMsg("let")]);
    expect(
      doc.diagnostics.map((d: Diagnostic) => d.range),
      `the diagnostic covers the loop variable @5:5-5:8; diagnostics=${render(doc)}`,
    ).toEqual([range(5, 5, 5, 8)]);
  });
});

// ===========================================================================
// (ck) The contextual keywords — the second-list tripwire.
// ===========================================================================

describe("0148 (ck) — a contextual keyword at the parameter name stays silent", () => {
  // `subagent`, `with` and `par` are CONTEXTUAL: they are absent from
  // `reservedKeywords()` (src/lexer/lexer.ts:159–166) and lex as `ident`, so
  // they are outside lexical.md:20's list by construction. Their non-firing is
  // already pinned at other positions (tests/par-for.test.ts:175–183,
  // tests/subagent-fn.test.ts:404–421); these rows pin it at the parameter
  // name, which is the position that changes. A classification reading the
  // shipped set keeps them silent for free; one minting a second list reds
  // here.

  it("ck1: `fn h(par: string): number { 1 }` reports nothing", () => {
    const doc = theta("fn h(par: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `\`par\` is contextual, not reserved; diagnostics=${render(doc)}`,
    ).toEqual([]);
  });

  it("ck2: `fn h(with: string): number { 1 }` reports nothing", () => {
    const doc = theta("fn h(with: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `\`with\` is contextual, not reserved; diagnostics=${render(doc)}`,
    ).toEqual([]);
  });

  it("ck3: `fn h(subagent: string): number { 1 }` reports nothing", () => {
    const doc = theta("fn h(subagent: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `\`subagent\` is contextual, not reserved; diagnostics=${render(doc)}`,
    ).toEqual([]);
  });
});
