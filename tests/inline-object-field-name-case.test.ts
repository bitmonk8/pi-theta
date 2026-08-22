import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0154 — the INLINE OBJECT TYPE's field name is a schema field name, so the
// lowercase-first identifier rule reaches it, and nothing enforces it there
// (docs/bugs/0154-inline-object-type-field-name-rules-unenforced.md). This file
// is that report's witness.
//
// THE RULE. docs/spec_topics/lexical.md's lowercase-first bullet requires "a
// lowercase letter, or `_`" for "`let` and `let mut` bindings, function
// parameters, function names, and schema field names", and scopes the field
// clause to the author's own identifier: "The lowercase-first rule applies to
// the **theta-side** field identifier; the field's *wire* name … may be any
// string via the `as \"WireName\"` rename clause". The violation sentence on the
// same page states the disposition with no qualifier: "Violating either rule is
// a parse error: … `theta/parse/binding-case-mismatch`".
//
// THE PRODUCTION-LEVEL EQUIVALENCE THAT REACHES THIS SLOT. The type grammar's
// `ObjectType` production (docs/spec_topics/grammar.md) is
// `ObjectType ::= "{" Field ("," Field)* ","? "}"` with the comment "inline
// anonymous object type; Field per Schema Declarations", and its "**Inline
// object types.**" paragraph says an `ObjectType`'s "fields reuse the same
// `Field` form as an object-schema body and carry the same field semantics".
// The user-facing mirror bullet (docs/reference/grammar.md, "`ObjectType`
// fields reuse the object-schema `Field` form") says it in one clause. An
// inline object type's field name is therefore a schema field name, at every
// `Type` position and every nesting depth.
//
// THE REGISTERED *Trigger*. `theta/parse/binding-case-mismatch`
// (docs/spec_topics/diagnostics/code-registry-parse.md, severity `E`, namespace
// `parse`) fires on an "Identifier in a binding / parameter / fn-name /
// field-name position [that] does not start with a lowercase letter or `_`" —
// no spelling qualifier and no position qualifier beyond that list. DIAG-2
// (diagnostic-shape.md) makes a *Trigger* a spec-level statement of the inputs
// a code fires on, so nothing here widens the registry and no registry edit is
// owed: the rows below assert the implementation onto the set the *Trigger*
// already names.
//
// THE SETTLED ROUTE, RANGE AND DISPOSITION this file encodes, with the grounds
// each rests on:
//
//   - ROUTE — the check reads `TypeNode.fieldNames`, the theta-side IDENTIFIER
//     retention on the object variant, inside `walkType`'s `object` arm, joining
//     the `"inline-object-shape"` rule set exactly as its three neighbours
//     (`empty-schema-body`, `duplicate-inline-field-name`,
//     `quoted-inline-field-name`) do. Grounds: that arm is the single walk every
//     `Type` position funnels through, so the rule needs no new call site and
//     runs under every `rules` value; and `fieldNames` is a list of identifier
//     TOKENS, which is the string an identifier rule must judge. The
//     alternative key at this arm — the raw pre-colon entry text
//     `inlineObjectFieldKeys` derives from `TypeNode.interiorSource` — is
//     deliberately NOT an identifier (it can be `"a"`, `'a'`, `""` or
//     `a as "w"`), so reading the case rule off it would test the wrong string.
//
//   - RANGE — DECLARATION-RANGED, at the caller's `site.range`. Route 1 (a
//     field-name-precise range) is NOT available: `TypeToken.start` is an offset
//     into the STRING `parseType` returns, and that stringification collapses
//     whitespace (`a as "w"` re-emerges as the raw key `aas"w"`), so a range
//     reconstructed from it cannot be exact. A declaration-ranged emission is
//     also the established convention at this exact seam — `empty-schema-body`,
//     `void-in-non-return-position`, `result-in-schema-position`,
//     `unresolved-named-type` and both inline key rules all range at
//     `site.range` there (group (E) measures four of them). The cost is priced
//     and pinned: two ill-cased fields in one declaration produce two
//     diagnostics at ONE range (rows r8, deep), so the ordered whole-list
//     assertions below are the only thing separating them.
//
//   - RESERVED SPELLINGS — DISPOSITION A: a reserved spelling at this slot stays
//     SILENT, excluded by membership in the lexer's own `reservedKeywords()`
//     (src/lexer/lexer.ts). It must NOT draw `binding-case-mismatch`. Grounds:
//     at every position where these rules are enforced the keyword arm claims
//     the spelling first, and the inline tokeniser classifies every
//     identifier-shaped run as `ident` with no keyword kind at all, so `Ok`,
//     `Err` and `Result` present here exactly as `Ys` does. Without the set
//     membership the case rule would draw the WRONG code on `{ Ok: string }`.
//     The reserved-keyword class at this slot stays with its own open report;
//     group (D) pins the silence AND its cost (a `params:` `{ let: string }`
//     still lowers the property key `let`).
//
//   - REGISTRY — no registry edit and no spec edit. The *Trigger* above already
//     reads "field-name position", and Disposition A involves no
//     reserved-keyword row.
//
//   - GATES — the emission is gated on `node.closingBraceSpelled` (the grammar's
//     own requirement: `ObjectType` spells a closing `}`, so an interior the
//     source never closes spells no inline object type). It is NOT gated on
//     `insideGenericArgument`: row g1 (`array<{ Ys: string }>`) MUST fire. The
//     generic-argument carve-out its two key-rule neighbours carry is grounded
//     in the LOWERING never dividing that interior into fields, so no property
//     name is minted there; the identifier rule judges the SOURCE's field-name
//     position, which exists whether or not anything is lowered from it, and
//     §Expected behaviour names g1 among the rows owed a diagnostic.
//
// THE LEDGER — what each group pins:
//   - (A) THE PIN, the inline positions that MUST fire: i1 (fn parameter), i2
//     (schema body field), i3 (fn return), a1 (alias RHS), g1 (generic
//     argument), u1 (union arm), f7 (a `by`-discriminated alias's two arms, two
//     lines), tl1 (the `.thetalib` route), n1 (a PascalCase spelling that is not
//     a reserved word), r8 (two distinct ill-cased fields, two lines at one
//     range), deep (two nesting levels, two lines at one range), n9 (ORDER — see
//     below) and q1 (the WIRE axis: the query response-schema root reached
//     through an ordinary binding annotation on the ordinary load path).
//   - (B) CONFORMANT CONTROLS, `[]` before and after: i1c, i2c, i3c, a1c, f7c,
//     p2c — the same shapes with a conformant spelling — plus `us` (the leading
//     `_` the rule's own predicate admits, which a `[a-z]` test would red).
//     w3 (a conformant field carrying an inline `as "w"` rename) stays `[]`
//     for `binding-case-mismatch` specifically, but since bug 0160 (X.Y.Z)
//     it is no longer a `[]` cell overall: the inline rename clause draws
//     `theta/parse/renamed-inline-field-name`, an orthogonal row this file
//     pins beside the case rule's own silence. Paired with (A) these are the
//     whole discriminator: each pair differs in one character's case.
//   - (C) THE `params:` FACE: p2 and L3. Both assert the diagnostics AND
//     `doc.frontmatter === null` — the SEPARATE frontmatter gate withholds the
//     whole frontmatter object on any error-severity frontmatter diagnostic, so
//     at this one face nothing lowers.
//   - (D) THE RESERVED-SPELLING BOUNDARY, Disposition A: c1, c3 (`Ok`, `Err`,
//     `Result`), c4 (`void`, the one reserved spelling this file also probes at
//     the TYPE slot, so the pair pins one spelling drawing two dispositions by
//     slot) and c2, all `[]`, plus c2's lowered `$defs` bytes — the cost of
//     Disposition A, pinned rather than left implied.
//   - (E) OVER-REACH TRIPWIRES, byte-unchanged: r1, r3, r5 and n1b (the field's
//     TYPE slot, a different report's subject), n2 (a non-identifier field name
//     the field loop skips outright), n3, n7, n8 (the rules already reaching this
//     leaf, and the four measurements that make the chosen range the
//     established one).
//   - (F) THE QUOTED-KEY NEIGHBOUR: a quoted key draws its own row's line ONLY.
//     A quoted key is a `str` token, so it never enters `fieldNames` — there is
//     no double report. This row is what makes the route choice falsifiable: a
//     check keyed on the raw entry text instead would draw two lines here.
//   - (G) THE MEASURED DEVIATION, pinned with its cause: w2. `binding-case-mismatch`
//     stays silent (the cause below), but since bug 0160 (X.Y.Z) the row is
//     no longer `[]` overall: the inline rename clause draws
//     `theta/parse/renamed-inline-field-name` beside that silence.
//
// ORDERING IS PART OF THE ASSERTION. Every diagnostic in this file is
// declaration-ranged, so `assembleDiagnostics`' `(file, line, col)` stable sort
// cannot separate any two of them by column: same-range diagnostics keep
// EMISSION order. Row n9 is where that is load-bearing — the identifier pass
// over `fieldNames` emits BEFORE the raw-key pass over `inlineObjectFieldKeys`,
// so `{ Ys: string, Ys: string }` reads as two `binding-case-mismatch` lines
// THEN one `duplicate-inline-field-name` line. Rows r8, deep and f7 pin
// multiplicity at one range on the same footing. Every assertion is an ordered
// whole-list `toEqual` over the UNFILTERED `doc.diagnostics`, so neither an
// extra diagnostic, nor a right diagnostic at a wrong range, nor a right
// diagnostic in a wrong order can hide inside a containment check.
//
// DIAG-4 (diagnostic-shape.md) — no asserted message string is written out
// here. Each is READ from the registry's *Message* column through
// `parseRegistry` / `registryMessage` (tools/code-registry/index.js), so a
// reworded template reds by naming the registry rather than by a bare string
// mismatch.
//
// TIER: unit, offline, deterministic, provider-free. Every observable settles
// inside one `parseThetaDocument` call over a source string (`parseDoc`,
// tests/helpers/e2e-s1.ts, the shipped load path wrapped in the standard inert
// `parseDeps` double) plus one read of the settled document's own frontmatter
// object. An integration tier would add a session round-trip to a parse-time
// value and buy no reach — including on the wire axis, which row q1 closes on
// the ordinary load path because the refusal is what makes the lowering
// unreachable. A live tier would make a fully determined value stochastic.
//
// ANTI-VACUITY / NO SILENT SKIPPING: nothing here early-returns, branches on
// the environment or conditionally skips. The registry lookup asserts its row's
// presence before the template is used. 22 of the 39 cells (20 of the 30 `it`
// blocks) expect a non-empty ordered list, so a harness that stopped reaching
// the parser fails loudly here rather than turning the `toEqual([])` rows into
// silent passes.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

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
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
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

const BINDING_CASE = "theta/parse/binding-case-mismatch";
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";
const RESERVED_KEYWORD = "theta/parse/reserved-keyword-as-identifier";
const UNRESOLVED_NAMED = "theta/parse/unresolved-named-type";
const EMPTY_BODY = "theta/parse/empty-schema-body";
const VOID_POSITION = "theta/parse/void-in-non-return-position";
const RESULT_POSITION = "theta/parse/result-in-schema-position";
const NOT_IDENTIFIER = "theta/parse/inline-field-name-not-identifier";

// ===========================================================================
// Parse harness. `parseDoc` (tests/helpers/e2e-s1.ts) is the shipped whole-file
// entry point `parseThetaDocument` wrapped in the standard inert deps — an
// in-band no-op system-note channel and a resolving `model:` matcher. No
// behaviour is stubbed: the lexer, the parser and the frontmatter reader under
// assertion are the production ones.
// ===========================================================================

/** Frontmatter for every `.theta` body row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: subagent\n---\n";

/** Parse `body` as a `.theta` under the standard frontmatter. */
function theta(body: string): ThetaDocument {
  return parseDoc(`${FM}${body}\n`);
}

/**
 * Parse a `.theta` whose frontmatter carries a `params:` block. `block` is the
 * indented key line, so the key sits on source line 4 — `---` (1),
 * `mode: subagent` (2), `params:` (3), the key (4) — and its VALUE node starts
 * at column 6 under a two-space indent and a one-character name.
 */
function withParams(block: string): ThetaDocument {
  return parseDoc(`---\nmode: subagent\nparams:\n${block}\n---\n1\n`);
}

/** Every diagnostic rendered `severity code: message @l:c-l:c`, in emission order. */
function rendered(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => {
    const r = d.range;
    const at =
      r === undefined
        ? "-"
        : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    return `${d.severity} ${d.code}: ${d.message} @${at}`;
  });
}

/**
 * One expected diagnostic in `rendered`'s form. Every span this file asserts is
 * single-line, so the row reads `line, startColumn, endColumn` with the end
 * column exclusive.
 */
function diag(
  severity: "error" | "warning",
  code: string,
  message: string,
  line: number,
  startColumn: number,
  endColumn: number,
): string {
  return `${severity} ${code}: ${message} @${line}:${startColumn}-${line}:${endColumn}`;
}

/**
 * The registry-sourced `binding-case-mismatch` line at a DECLARATION span —
 * the settled range answer. `bcm(4, 38)` is the whole body statement of a
 * 37-character line 4.
 */
function bcm(line: number, endColumn: number, startColumn = 1): string {
  return diag("error", BINDING_CASE, msg(BINDING_CASE, []), line, startColumn, endColumn);
}

/**
 * `hasLoadParseError`'s predicate (src/extension/production-composition.ts),
 * restated over a parsed document: a theta registers unless some diagnostic is
 * an error-severity `theta/load/*` or `theta/parse/*`. This is the refusal
 * predicate for every `.theta` BODY row of group (A) — the emission's shipped
 * consequence, and what makes the silence measured today a registration of a
 * spelling the spec refuses.
 */
function registers(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some(
    (d: Diagnostic) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}

// ===========================================================================
// (A) THE PIN — every inline `Type` position must draw the code.
//
// One `describe` per shape family, each asserting the whole ordered unfiltered
// list. RED at HEAD: every cell here reports `[]` (or, at n9, the duplicate
// line alone) and every `.theta` body row REGISTERS.
// ===========================================================================

describe("0154 (A) — an ill-cased inline object field name is a parse error at every Type position", () => {
  it("i1: an `fn` PARAMETER's inline object field name draws one line, declaration-ranged", () => {
    // THE PIN. The `fn` parameter type is one of the four call sites that hand
    // `walkType` a `site.range`, and the range it hands is the whole `fn`
    // statement — which is the settled answer here, not an approximation of a
    // field-name range that the re-tokenised type string cannot support.
    const doc = theta("fn h(p: { Ys: string }): number { 1 }");
    expect(
      rendered(doc),
      "the inline field name is a schema field name (grammar.md's `ObjectType` production and its Inline-object-types paragraph), so lexical.md's lowercase-first bullet governs it",
    ).toEqual([bcm(4, 38)]);
    expect(
      registers(doc),
      "an error-severity theta/parse/* code denies registration; the silence at HEAD is what lets the spelling load",
    ).toBe(false);
  });

  it("i2: a `schema` BODY field's inline object field name draws one line", () => {
    // The position whose OUTER field name is already enforced. One brace deeper
    // the same identifier is admitted at HEAD, which is the discontinuity the
    // report's "same field semantics" argument rests on.
    const doc = theta("schema S { a: { Ys: string } }");
    expect(
      rendered(doc),
      "the outer field name and the inline one are the same `Field` production",
    ).toEqual([bcm(4, 31)]);
    expect(registers(doc), "the theta must not register").toBe(false);
  });

  it("i3: an `fn` RETURN type's inline object field name draws one line", () => {
    const doc = theta("fn h(): { Ys: string } { 1 }");
    expect(rendered(doc), "the return-type call site reaches the same walk").toEqual([
      bcm(4, 29),
    ]);
    expect(registers(doc), "the theta must not register").toBe(false);
  });

  it("a1: an ALIAS right-hand side's inline object field name draws one line", () => {
    const doc = theta("schema S = { Ys: string }");
    expect(rendered(doc), "the alias RHS is a `Type` position").toEqual([bcm(4, 26)]);
    expect(registers(doc), "the theta must not register").toBe(false);
  });

  it("g1: an inline object inside a GENERIC ARGUMENT draws one line", () => {
    // THE GATE ROW. The two raw-key rules at this arm are withheld under
    // `insideGenericArgument` because the lowering never divides that interior
    // into fields, so no property name is minted there to name. The identifier
    // rule judges the SOURCE's field-name position, which exists regardless of
    // what is lowered — so it must NOT inherit that carve-out. A fix that
    // copied both of its neighbours' gates reds here.
    const doc = theta("schema S { a: array<{ Ys: string }> }");
    expect(
      rendered(doc),
      "the generic-argument carve-out is grounded in the lowering, not in the source's field-name position",
    ).toEqual([bcm(4, 38)]);
    expect(registers(doc), "the theta must not register").toBe(false);
  });

  it("u1: an inline object in a UNION ARM draws one line", () => {
    const doc = theta("schema S { a: { Ys: string } | null }");
    expect(rendered(doc), "the union arms are descended at every depth").toEqual([
      bcm(4, 38),
    ]);
    expect(registers(doc), "the theta must not register").toBe(false);
  });

  it("f7: a `by`-discriminated alias's TWO inline arms draw two lines at one range", () => {
    // The one theta-source occurrence of this shape in the tracked corpus. Both
    // arms are separate `object` nodes under one declaration, so the settled
    // declaration range cannot separate them and the ordered list is the only
    // thing asserting there are two.
    const doc = theta('schema S by Kind = { Kind: "a" } | { Kind: "b" }');
    expect(
      rendered(doc),
      "each arm is its own inline object type, so each ill-cased field name draws its own line",
    ).toEqual([bcm(4, 49), bcm(4, 49)]);
    expect(registers(doc), "the theta must not register").toBe(false);
  });

  it("tl1: the `.thetalib` route is held to the same rule", () => {
    // lexical.md opens by applying every rule on the page to `.theta` and
    // `.thetalib` alike, and both extensions reach the same walk through the
    // same parse. A `.thetalib` carries no frontmatter, so the source is line 1.
    const doc = parseDoc("fn h(p: { Ys: string }): number { 1 }\n", "lib.thetalib");
    expect(rendered(doc), "the rule is extension-independent").toEqual([bcm(1, 38)]);
  });

  it("n1: a PascalCase field name that is NOT a reserved word draws one line", () => {
    // `Cat` names no reserved keyword and no declared type, which separates the
    // rule under assertion from the reserved-keyword arm of group (D) and from
    // the named-type resolution of row n1b: the SAME spelling one slot to the
    // right draws `unresolved-named-type` instead (row n1b).
    const doc = theta("schema S { a: { Cat: string } }");
    expect(
      rendered(doc),
      "the judged token is the field NAME; nothing about `Cat` needs to resolve",
    ).toEqual([bcm(4, 32)]);
  });

  it("r8: TWO distinct ill-cased fields in one interior draw two lines at one range", () => {
    // The priced cost of the declaration range, pinned rather than tolerated:
    // both lines carry the identical span, so multiplicity is only observable
    // as list length and order.
    const doc = theta("schema S { a: { Ys: string, Zs: number } }");
    expect(
      rendered(doc),
      "one diagnostic per ill-cased field name, in source order, both at the declaration range",
    ).toEqual([bcm(4, 43), bcm(4, 43)]);
  });

  it("deep: an ill-cased name at TWO nesting levels draws two lines at one range", () => {
    // The walk descends field types, so the inner interior is reached from the
    // outer one. Emission order is the outer body's own name before the nested
    // body's.
    const doc = theta("schema S { a: { Xs: { Ys: string } } }");
    expect(
      rendered(doc),
      "the rule runs at every nesting depth reachable through inline object fields",
    ).toEqual([bcm(4, 39), bcm(4, 39)]);
  });

  it("n9: the identifier pass emits BEFORE the raw-key pass — order is the assertion", () => {
    // THE ORDER ROW. `{ Ys: string, Ys: string }` is ill-cased twice AND
    // repeated once, so three lines share one declaration range and
    // `assembleDiagnostics`' `(file, line, col)` sort cannot order them: they
    // keep EMISSION order. The settled order inside the `object` arm is the
    // identifier pass over `fieldNames` first, then the raw-key pass over
    // `inlineObjectFieldKeys`. A fix that appended its emission after the
    // existing key rules reds here with the right codes in the wrong order.
    const doc = theta("schema S { a: { Ys: string, Ys: string } }");
    expect(
      rendered(doc),
      "two identifier lines then the neighbour's duplicate line; same-range diagnostics keep emission order",
    ).toEqual([
      bcm(4, 43),
      bcm(4, 43),
      diag(
        "error",
        DUPLICATE_INLINE,
        msg(DUPLICATE_INLINE, [["<field>", "Ys"]]),
        4,
        1,
        43,
      ),
    ]);
  });

  it("q1: the query response-schema root, reached through an ordinary binding annotation", () => {
    // THE WIRE AXIS, closed on the ORDINARY LOAD PATH. The typed query's
    // response schema is the annotation on the binding it feeds, so this cell
    // is the position at which an ill-cased theta-side name would otherwise
    // become a provider-facing JSON Schema property key with no `as "WireName"`
    // rename written — the mechanism schemas.md names as the only one for a
    // property name that is not theta-identifier-compatible. The refusal makes
    // that lowering unreachable rather than sanitised, which is why no lowered
    // bytes are asserted here: a refused theta lowers nothing.
    const doc = parseDoc("---\nmode: prompt\n---\nlet r: { Ys: boolean } = @`hi`?\n");
    expect(
      rendered(doc),
      "the response-schema root is a `Type` position like any other",
    ).toEqual([bcm(4, 32)]);
    expect(
      registers(doc),
      "the wire leak is gated by the load refusal, not by a sanitising lowerer",
    ).toBe(false);
  });
});

// ===========================================================================
// (B) THE CONFORMANT CONTROLS — `[]` before the fix and after.
//
// Paired with group (A) these are the whole discriminator: each pair differs in
// one character's case. GREEN now and after.
// ===========================================================================

describe("0154 (B) — a conformant inline field name stays clean", () => {
  it("i1c/i2c/i3c/a1c/f7c: the group (A) shapes with a conformant spelling report nothing", () => {
    const cells: readonly string[] = [
      "fn h(p: { ys: string }): number { 1 }",
      "schema S { a: { ys: string } }",
      "fn h(): { ys: string } { 1 }",
      "schema S = { ys: string }",
      'schema S by kind = { kind: "a" } | { kind: "b" }',
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const src of cells) {
      const doc = theta(src);
      actual[src] = rendered(doc);
      expected[src] = [];
      expect(registers(doc), `a clean theta registers: ${src}`).toBe(true);
    }
    expect(
      actual,
      "a lowercase-first inline field name satisfies lexical.md's bullet; a red here means the emission judges something other than the first letter",
    ).toEqual(expected);
  });

  it("p2c: the conformant `params:` right-hand side reports nothing and keeps its frontmatter", () => {
    const doc = withParams("  p: { ys: string }");
    expect(rendered(doc), "the `params:` face's conformant twin").toEqual([]);
    expect(
      doc.frontmatter === null,
      "with no error-severity frontmatter diagnostic the gate hands back the frontmatter object",
    ).toBe(false);
  });

  it("us: a leading `_` is admitted — the rule's predicate is not `[a-z]`", () => {
    // lexical.md's bullet reads "a lowercase letter, or `_`". `_Ys` starts with
    // the underscore the rule admits and carries an uppercase letter right
    // after it, so a fix testing `[a-z]` on the first character, or testing the
    // name for any uppercase letter at all, reds here.
    const doc = theta("fn h(p: { _Ys: string }): number { 1 }");
    expect(rendered(doc), "the predicate is the first character only, `_` included").toEqual(
      [],
    );
  });

  it('w3: a conformant field carrying an inline `as "w"` rename draws bug 0160\'s row, not the case rule', () => {
    // lexical.md's bullet frees the WIRE half of a rename from the case rule,
    // but that rename is a SCHEMA-DECLARATION-ONLY clause (bug 0160, X.Y.Z):
    // the inline `Field` form admits none, so this text is refused outright
    // rather than reaching either diagnostic that reads a wire name. The
    // theta-side identifier is conformant, so `binding-case-mismatch` still
    // does not fire — the row this cell now measures is orthogonal to the case
    // rule, not a route around it.
    const doc = theta('schema S { a: { ys as "w": string } }');
    expect(
      rendered(doc),
      "the rename is refused inline (bug 0160); `binding-case-mismatch` stays silent because the identifier itself is conformant",
    ).toEqual([
      diag(
        "error",
        RENAMED_INLINE,
        msg(RENAMED_INLINE, [["<field>", "ys"]]),
        4,
        1,
        38,
      ),
    ]);
  });
});

// ===========================================================================
// (C) THE `params:` FACE — the one position whose refusal withholds the whole
// frontmatter object.
//
// The diagnostic ranges here are the YAML VALUE node's, not the declaration's:
// this call site passes the `params:` field's own range, which is narrower than
// the other three positions' and still not the field name. RED at HEAD: both
// cells report `[]` and both hand back a frontmatter object.
// ===========================================================================

describe("0154 (C) — the `params:` right-hand side draws the code, and the frontmatter gate withholds", () => {
  it("p2: `p: { Ys: string }` draws one line at the VALUE node's range, and nothing lowers", () => {
    const doc = withParams("  p: { Ys: string }");
    expect(
      rendered(doc),
      "the `params:` field type is a `Type` position; its call site's range is the YAML value node",
    ).toEqual([bcm(4, 20, 6)]);
    expect(
      doc.frontmatter === null,
      "the frontmatter gate withholds the WHOLE frontmatter object on any error-severity frontmatter diagnostic, so the ill-cased key reaches no `$defs`",
    ).toBe(true);
  });

  it("L3: the same key at TWO nesting levels draws two lines, and still nothing lowers", () => {
    // The wire leak at depth: at HEAD the uppercase key appears at both levels
    // of the lowered document. The refusal removes the whole artefact rather
    // than sanitising either level, which is what the withheld frontmatter
    // asserts.
    const doc = withParams("  p: { Xs: { Ys: string } }");
    expect(
      rendered(doc),
      "one line per ill-cased field name at every depth, both at the value node's range",
    ).toEqual([bcm(4, 28, 6), bcm(4, 28, 6)]);
    expect(
      doc.frontmatter === null,
      "nothing lowers from a withheld frontmatter object",
    ).toBe(true);
  });
});

// ===========================================================================
// (D) THE RESERVED-SPELLING BOUNDARY — Disposition A, and its cost.
//
// A reserved spelling at this slot stays SILENT: it is excluded by membership in
// the lexer's own `reservedKeywords()`, so it draws no `binding-case-mismatch`.
// `Ok`, `Err` and `Result` are the three uppercase-first reserved words and
// therefore the only shapes where the case reading and the keyword reading
// diverge — a fix guarding on identifier SHAPE alone would draw the wrong code
// on all three. GREEN now and after.
// ===========================================================================

describe("0154 (D) — a reserved spelling at the inline field-name slot draws nothing", () => {
  it("c1/c3: `let`, `Ok`, `Err` and `Result` at the inline field-name slot report nothing", () => {
    const cells: readonly string[] = [
      "schema S { a: { let: string } }",
      "fn h(p: { Ok: string }): number { 1 }",
      "fn h(p: { Err: string }): number { 1 }",
      "fn h(p: { Result: string }): number { 1 }",
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const src of cells) {
      actual[src] = rendered(theta(src));
      expected[src] = [];
    }
    expect(
      actual,
      "the inline tokeniser has no keyword kind, so the exclusion must be set membership against the lexer's own reservedKeywords(); a red here means the case rule claimed a spelling the keyword arm owns everywhere else",
    ).toEqual(expected);
  });

  it("c4: `void` at the inline field-NAME slot reports nothing — the exclusion, not lowercase-first, is why", () => {
    // `void` is already lowercase-first, so it would be silent even without
    // the reserved exclusion; it earns its own cell because it is the one
    // reserved spelling this file also probes at the TYPE slot (row n7,
    // `theta/parse/void-in-non-return-position`). Pinning it here at the NAME
    // slot pins the same spelling drawing two different dispositions depending
    // on which slot of one inline field it occupies.
    const doc = theta('fn h(p: { void: string }): number { 1 }');
    expect(
      rendered(doc),
      "the NAME slot excludes every reservedKeywords() member regardless of case; void's own silence would hold even without the exclusion, so this cell is about the slot, not the spelling",
    ).toEqual([]);
  });

  it("c2: the `params:` reserved spelling reports nothing AND still lowers its key", () => {
    // DISPOSITION A'S COST, pinned. The reserved-keyword class at this slot
    // stays with its own open report, so `let` continues to reach the
    // provider-facing `$defs` as a property key. Asserting the bytes is what
    // keeps that cost a recorded fact rather than an unnoticed consequence.
    const doc = withParams("  p: { let: string }");
    expect(rendered(doc), "Disposition A: silent at this slot").toEqual([]);
    expect(
      JSON.stringify(doc.frontmatter?.params?.loweredSchema ?? null),
      "the reserved spelling still lowers verbatim; this is what Disposition A leaves open",
    ).toBe(
      '{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_c3f6969a1b27dbfa"}},"required":["p"],"additionalProperties":false,"$defs":{"__inline_c3f6969a1b27dbfa":{"type":"object","properties":{"let":{"type":"string"}},"required":["let"],"additionalProperties":false}}}',
    );
  });
});

// ===========================================================================
// (E) THE OVER-REACH TRIPWIRES — the field's TYPE slot, and the rules already
// at this leaf.
//
// These cells are byte-unchanged by the fix. They are also the measurement that
// makes the chosen declaration range the ESTABLISHED one rather than a novel
// precision loss: n3, n7, n8 and n1b all carry `@4:1`. GREEN now and after.
// ===========================================================================

describe("0154 (E) — the field's TYPE slot and the leaf's existing rules do not move", () => {
  it("r1: a reserved keyword in the field's TYPE slot keeps its own code and range", () => {
    // A different report's shipped sink, reached through the LOWERING of the
    // field's type. The NAME slot and the TYPE slot of one inline field are two
    // different rules' subjects; a fix at the NAME slot that widened into the
    // TYPE slot reds here.
    const doc = theta("schema S { a: { ys: let } }");
    expect(rendered(doc), "the TYPE slot's rule is untouched").toEqual([
      diag(
        "error",
        RESERVED_KEYWORD,
        msg(RESERVED_KEYWORD, [["<keyword>", "let"]]),
        4,
        1,
        28,
      ),
    ]);
  });

  it("r3: the same TYPE slot at the `params:` position keeps its code and value-node range", () => {
    const doc = withParams("  p: { ys: let }");
    expect(rendered(doc), "the `params:` lowering sink is untouched").toEqual([
      diag(
        "error",
        RESERVED_KEYWORD,
        msg(RESERVED_KEYWORD, [["<keyword>", "let"]]),
        4,
        6,
        17,
      ),
    ]);
  });

  it("r5: the `fn` parameter position has no lowering sink, so its TYPE slot stays silent", () => {
    // Measured, not endorsed: the TYPE slot's asymmetry between positions
    // belongs to the reports that own it. This row exists so a fix at the NAME
    // slot cannot quietly close it.
    const doc = theta("fn h(p: { ys: let }): number { 1 }");
    expect(rendered(doc), "no sink at this position, so no emission").toEqual([]);
  });

  it("n1b: a PascalCase name in the field's TYPE slot draws the named-type code, not this one", () => {
    // Row n1's contrast over the identical spelling: `Cat` in the NAME slot is
    // this file's subject, `Cat` in the TYPE slot is a type resolution.
    const doc = theta("schema S { a: { ys: Cat } }");
    expect(rendered(doc), "the TYPE slot resolves names; the NAME slot judges them").toEqual([
      diag(
        "error",
        UNRESOLVED_NAMED,
        msg(UNRESOLVED_NAMED, [["<name>", "Cat"]]),
        4,
        1,
        28,
      ),
    ]);
  });

  it("n2: a non-identifier field name stays silent at THIS rule — the field loop still skips it outright", () => {
    // `3` is neither an identifier nor a quoted key, so the tolerant field loop
    // consumes and skips it and nothing enters `fieldNames` or the quoted-key
    // list: this cell's own subject, 0154's identifier PASS OVER `fieldNames`,
    // is unmoved by bug 0228 — the skipped field name still enters no rule
    // reading that list. What changed is that a different rule reads the raw
    // pre-colon text directly rather than a token list: bug 0228's fourth-in-
    // precedence row now names the honest key `3` as not `Ident`-shaped, so
    // the shape is refused, but not by this file's rule.
    const doc = theta("schema S { a: { 3: string } }");
    expect(
      rendered(doc),
      "a skipped field name still enters no rule reading `fieldNames`; the new row reads the raw key instead",
    ).toEqual([
      diag("error", NOT_IDENTIFIER, msg(NOT_IDENTIFIER, [["<field>", "3"]]), 4, 1, 30),
    ]);
  });

  it("n3/n7/n8: the three rules already at this leaf keep their codes and their `@4:1` ranges", () => {
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    const cells: ReadonlyArray<readonly [string, string[]]> = [
      [
        "schema S { a: {} }",
        [diag("error", EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "{}"]]), 4, 1, 19)],
      ],
      [
        "schema S { a: { ys: void } }",
        [diag("error", VOID_POSITION, msg(VOID_POSITION, []), 4, 1, 29)],
      ],
      [
        "schema S { a: { ys: Result<string, string> } }",
        [diag("error", RESULT_POSITION, msg(RESULT_POSITION, []), 4, 1, 47)],
      ],
    ];
    for (const [src, want] of cells) {
      actual[src] = rendered(theta(src));
      expected[src] = want;
    }
    expect(
      actual,
      "every rule that reaches this leaf ranges at the whole declaration, which is the convention the chosen range follows",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (F) THE QUOTED-KEY NEIGHBOUR — one line, not two.
//
// GREEN now and after, and the cell that makes the route choice falsifiable.
// ===========================================================================

describe("0154 (F) — a quoted inline field name keeps its own row's line alone", () => {
  it("a quoted key draws the quoted-name line ONLY — it never enters the identifier list", () => {
    // The two rules at this arm read two different subjects. A quoted key is a
    // `str` token, so it is not an identifier and contributes nothing to
    // `TypeNode.fieldNames`; the identifier rule therefore has no subject here
    // and there is no double report. A fix that keyed the case rule on the raw
    // pre-colon entry text instead would see `"Ys"`, judge its first character
    // `"` as not lowercase-first, and draw a second line — which is exactly
    // what this cell refuses.
    const doc = theta('schema S { a: { "Ys": string } }');
    expect(
      rendered(doc),
      "one subject per rule: the raw-key rule owns the quoted spelling, the identifier rule owns identifier tokens",
    ).toEqual([
      diag(
        "error",
        QUOTED_INLINE,
        msg(QUOTED_INLINE, [["<field>", '"Ys"']]),
        4,
        1,
        33,
      ),
    ]);
  });
});

// ===========================================================================
// (G) THE MEASURED DEVIATION — pinned with its cause.
// ===========================================================================

describe("0154 (G) — an ill-cased field carrying an `as` rename: only `binding-case-mismatch` stays silent, the rename itself is refused", () => {
  it('w2: `{ Ys as "w": string }` draws bug 0160\'s row; `binding-case-mismatch` stays silent, and the cause is the field loop', () => {
    // MEASURED, AND DELIBERATELY NOT CLOSED for `binding-case-mismatch`. The
    // 0154 report's §Expected behaviour lists this shape among the rows owed
    // that diagnostic; it is not, and the cause is upstream of every rule at
    // the `object` arm. `TypeParser.parseObject` reads the name token and then
    // REQUIRES a `:`; the `as` rename skip sits after the field's type parses,
    // so `Ys as "w":` breaks the field loop as a malformed field (the loop
    // stops to stay tolerant) and `Ys` never enters `TypeNode.fieldNames`. The
    // rename mis-split is bug 0160's subject and 0154's §Non-goals leaves it
    // there, so this cell records the boundary rather than asserting the
    // identifier-case shape stays silent forever. A fix scoped to the field
    // NAME must not try to make `binding-case-mismatch` fire here — doing so
    // means the rename parse moved, which is a different report's
    // adjudication. Bug 0160 (X.Y.Z) refuses the rename spelling outright
    // instead, over the raw key rather than over `fieldNames`, so it draws its
    // own row here without touching either fact.
    const doc = theta('schema S { a: { Ys as "w": string } }');
    expect(
      rendered(doc),
      "the rename mis-split still withholds the name from the identifier retention, so `binding-case-mismatch` stays silent; the raw-key refusal (bug 0160) does not depend on that retention and fires beside it",
    ).toEqual([
      diag(
        "error",
        RENAMED_INLINE,
        msg(RENAMED_INLINE, [["<field>", "Ys"]]),
        4,
        1,
        38,
      ),
    ]);
  });
});
