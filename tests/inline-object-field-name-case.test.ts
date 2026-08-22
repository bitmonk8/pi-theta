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
//     source never closes spells no inline object type). Row g1
//     (`array<{ Ys: string }>`) MUST fire regardless of nesting beneath a
//     generic type argument: the identifier rule judges the SOURCE's
//     field-name position, which exists whether or not anything is lowered
//     from it, and §Expected behaviour names g1 among the rows owed a
//     diagnostic. Since bug 0233 (which dropped the two raw-key rules'
//     narrower `!insideGenericArgument` gate half at `walkType`'s object arm)
//     all six rules at that arm answer alike on this ground.
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
//     for `binding-case-mismatch` specifically, but since bug 0160 (0.172.0)
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
//     stays silent (the cause below), but since bug 0160 (0.172.0) the row is
//     no longer `[]` overall: the inline rename clause draws
//     `theta/parse/renamed-inline-field-name` beside that silence.
//   - (H) THE RESIDUE VERDICT (bug 0227 element 2), the cells this file's own
//     code does NOT draw: h1–h7 and h8/h9. Each source spells a field-name key
//     whose FIRST character is outside the `Ident` alphabet and whose ASCII
//     TAIL is uppercase-first; the tail is text the author never wrote as a
//     field name, so it is no rule's subject and only the honest raw-key
//     refusal stands (under a generic argument that refusal is itself
//     withheld, leaving the list empty). Every cell asserts the whole
//     unfiltered list, so the absence of `binding-case-mismatch` is asserted
//     positionally. h10 is the boundary: a `,` at a field-name position closes
//     an EMPTY entry, which produces no residue, so the FOLLOWING entry's own
//     field name is judged normally and `binding-case-mismatch` stands alone.
//   - (I) THE 0227 TRIPWIRES, byte-unchanged: t1–t3 (the ASCII
//     uppercase-first spellings this file's own code still owns, including
//     under a generic argument, where group (A)'s g1 gate is what separates
//     this pass from its raw-key neighbours), t4–t7 (the four refusals the
//     raw-key readers and the declaration surface already carry for the same
//     non-ASCII bytes) and t8 (a non-`Ident` key whose tail is LOWERCASE, so
//     no residue verdict exists to remove and the honest refusal stands
//     alone).
//   - (J) THE UNCLOSED INTERIOR, measured: j1–j4. `ObjectType` spells a
//     closing `}`, so an interior the source never closes is already silent
//     for BOTH passes at this arm — including for the ASCII control j4, which
//     is what proves the silence is the closing-brace gate and not the
//     residue. Pinned so a fix that removes the residue verdict cannot be
//     read as having created a new silence here.
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
// presence before the template is used. 39 of the 62 cells (31 of the 43 `it`
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
    // THE GATE ROW. The identifier rule judges the SOURCE's field-name
    // position, which exists regardless of what the lowering divides into
    // fields, so it fires here as it does at every other field-name position
    // — its own no-move control, unaffected by bug 0233's widening of its two
    // raw-key neighbours to the same ground.
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
    // but that rename is a SCHEMA-DECLARATION-ONLY clause (bug 0160, 0.172.0):
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
    // adjudication. Bug 0160 (0.172.0) refuses the rename spelling outright
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

// ===========================================================================
// (H) BUG 0227 ELEMENT 2 — THE RESIDUE VERDICT MUST GO.
//
// THE ALPHABET DECISION THIS GROUP ENCODES, quoted from the report's own
// §Non-goals (docs/bugs/0227-non-ascii-inline-object-field-name-admitted.md:396):
// "**Widening the theta identifier alphabet.** `lexical.md:13` is ASCII by
// letter. Whether theta admits non-ASCII identifiers at all is a spec question
// for theta 2.0, not a defect; this report is about what happens to a name that
// the current alphabet excludes." So `docs/spec_topics/lexical.md:13`'s
// `[A-Za-z_][A-Za-z0-9_]*` stands, `tokeniseType`'s ASCII `isIdentStart`
// (src/parser/type-grammar.ts:387) is CORRECT and is NOT widened, and route 2 of
// the report's §Fix is what ships: no diagnostic's subject may be the ASCII
// residue of a name the author wrote.
//
// WHAT PRODUCED THE RESIDUE. A first character outside that alphabet matches no
// scanner arm and is emitted as a one-character `punct` token by the fallback at
// `type-grammar.ts:436`. `TypeParser.parseObject`'s field loop peeks the
// field-name token and, when its kind is not `ident`, sets `entryTainted` to
// whether that token's own text is not the entry separator `,` (`:686–692`)
// — so a genuine non-`ident` name token latches it, while a `,` closing an
// empty entry clears it instead (h10's boundary below) — before the loop
// advances one token and `continue`s. The NEXT token — the ASCII tail, when
// the tainted token was a genuine junk name — is still read as the field
// name, but the latch now suppresses its retention (`:703–704`) instead of
// letting bug 0154's identifier pass (`:1001–1027`, the `first >= "A" &&
// first <= "Z"` test at `:1027`) judge it. `entryTainted` clears at the
// entry-separating `,` (`:724`), so only the tainted entry's own tail is
// affected.
//
// WHAT CARRIES THESE INPUTS INSTEAD. `theta/parse/inline-field-name-not-
// identifier` (bug 0228), which reads the RAW pre-colon key and therefore names
// the author's own spelling — and which is withheld under a generic argument by
// its registered carve-out (code-registry-parse.md's row), so h8/h9 are
// silent there: nothing refuses an inline object reached through a generic
// type argument at that row, and this pass must not substitute for it by
// judging a residue.
//
// Every cell below carries the raw-key refusal alone; none carries a
// `binding-case-mismatch` line judging the ASCII tail.
// ===========================================================================

/** The registry-sourced `inline-field-name-not-identifier` line (bug 0228's row). */
function nid(field: string, line: number, endColumn: number): string {
  return diag(
    "error",
    NOT_IDENTIFIER,
    msg(NOT_IDENTIFIER, [["<field>", field]]),
    line,
    1,
    endColumn,
  );
}

describe("0227 (H) — no diagnostic's subject is the ASCII residue of a field name", () => {
  it("h1: `{ éLan: string }` draws the raw-key refusal ALONE, not a verdict on `Lan`", () => {
    // The report's row m2. `é` is a `punct` token, the retained name is `Lan`,
    // and `Lan` is uppercase-first — so this file's own code fires on text the
    // author never wrote as a field name, at a range that names nothing.
    const doc = theta("schema S { a: { éLan: string } }");
    expect(
      rendered(doc),
      "the honest refusal names the whole key `éLan`; the case rule must have no subject here because the author wrote no ASCII-first field name",
    ).toEqual([nid("éLan", 4, 33)]);
    expect(registers(doc), "the raw-key refusal still denies registration").toBe(false);
  });

  it("h2: `{ ÉLan: string }` — the uppercase spelling of the same key behaves alike", () => {
    // The report's row m3. The pair h1/h2 is the discriminator for the residue:
    // the two keys differ in the case of the character the tokeniser SPLITS OFF,
    // so a rule reading the key cannot tell them apart, while a rule reading the
    // tail cannot tell them apart either — both are handed `Lan`. Only the
    // tail's absence from every verdict makes the two agree for the right reason.
    const doc = theta("schema S { a: { ÉLan: string } }");
    expect(
      rendered(doc),
      "the split character's own case is not part of any judgement; the key is refused as a key",
    ).toEqual([nid("ÉLan", 4, 33)]);
    expect(registers(doc), "the raw-key refusal still denies registration").toBe(false);
  });

  it("h3: a WELL-FORMED sibling field does not change the verdict", () => {
    // The report's row d6. `b: string` is conformant, so the only judgement in
    // this interior is on the second entry's key; the range widens with the
    // declaration and nothing else moves.
    const doc = theta("schema S { a: { b: string, éLan: string } }");
    expect(
      rendered(doc),
      "one diagnostic per offending key; a conformant sibling adds nothing and removes nothing",
    ).toEqual([nid("éLan", 4, 44)]);
  });

  it("h4: an ASCII-punct first character produces the same residue and must behave alike", () => {
    // THE ASCII ANALOGUE, and why this cell is not redundant with h1: the defect
    // is `parseObject` retaining an identifier that follows a non-`ident` token,
    // NOT anything about non-ASCII bytes. `*` is plain ASCII and reaches the
    // same `punct` fallback, so a fix that special-cased a non-ASCII code point
    // instead of the token sequence reds here.
    const doc = theta("schema S { a: { *Lan: string } }");
    expect(
      rendered(doc),
      "the subject is the token sequence `punct ident \":\"`, not the byte width of the first character",
    ).toEqual([nid("*Lan", 4, 33)]);
  });

  it("h5: the `fn` PARAMETER position carries the same pair", () => {
    // Reach: the residue verdict is not specific to the schema-body call site.
    // The report's §Fix (c) requires the disposition at every `Type` position.
    const doc = theta("fn h(p: { éLan: string }): number { 1 }");
    expect(
      rendered(doc),
      "every `Type` position funnels through the same `walkType` arm, so the residue verdict must be gone at all of them",
    ).toEqual([nid("éLan", 4, 40)]);
    expect(registers(doc), "the raw-key refusal still denies registration").toBe(false);
  });

  it("h6: a REPEATED residue key draws the duplicate row alone — neither tail is a subject", () => {
    // MULTIPLICITY. Both entries carry a residue tail, so a rule judging tails
    // would draw one line per entry ahead of the neighbour's duplicate line (the
    // emission order row n9 pins). Neither tail is a subject, and the raw-key
    // precedence gives a repeating key to `duplicate-inline-field-name` alone,
    // so exactly one line stands.
    const doc = theta("schema S { a: { éLan: string, éLan: string } }");
    expect(
      rendered(doc),
      "a repeating key is the duplicate row's subject alone; neither entry's tail is any rule's subject",
    ).toEqual([
      diag(
        "error",
        DUPLICATE_INLINE,
        msg(DUPLICATE_INLINE, [["<field>", "éLan"]]),
        4,
        1,
        47,
      ),
    ]);
  });

  it("h7: the residue verdict goes even when the DECLARATION's own brace is unspelled", () => {
    // The gates at this arm read the INLINE object's `}` (group (J)'s subject),
    // not the declaration's, so an unterminated `schema` body whose inline
    // interior IS closed still reaches both passes. This cell keeps the fix from
    // being gated on the outer declaration parsing cleanly.
    const doc = theta("schema S { a: { éLan: string }");
    expect(
      rendered(doc),
      "the inline interior closed, so the raw-key refusal holds; the tail is still nobody's subject",
    ).toEqual([nid("éLan", 4, 31)]);
  });

  it("h8/h9: under a GENERIC ARGUMENT the raw-key refusal now fires beside the residue pass's silence (bug 0233)", () => {
    // THE RECORDED FLIP, named per this comment's own instruction: bug 0233
    // (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md)
    // widened the raw-key gate in `walkType`'s `object` arm (the gate reads
    // `node.closingBraceSpelled` alone now, by symbol rather than by absolute
    // line — bug 0134's do-not-chase class) so it answers alike at every depth
    // beneath a generic argument, the same as bug 0154's identifier pass
    // (group (A)'s g1) already did. `éLan` and `*Lan` are non-`Ident` raw keys
    // (`lexical.md:13`), so `theta/parse/inline-field-name-not-identifier` now
    // names them here exactly as it does at every bare position in this file;
    // the residue pass still has no lawful subject and contributes nothing.
    const cells: readonly string[] = [
      "schema S { a: array<{ éLan: string }> }",
      "schema S { a: array<{ *Lan: string }> }",
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {
      "schema S { a: array<{ éLan: string }> }": [nid("éLan", 4, 40)],
      "schema S { a: array<{ *Lan: string }> }": [nid("*Lan", 4, 40)],
    };
    for (const src of cells) {
      actual[src] = rendered(theta(src));
    }
    expect(
      actual,
      "bug 0233: the raw-key gate no longer withholds a generic argument's interior, so the byte-identical bare refusal fires here too; a red reporting `[]` is the carve-out returning",
    ).toEqual(expected);
  });

  it("h10: an EMPTY entry's separator produces no residue, so the next name is judged", () => {
    // THE BOUNDARY OF THE PER-ENTRY EXCLUSION. A `,` at a field-name position is
    // the token that CLOSES an empty entry, not the first token of one, so it
    // spells no key and leaves no residue behind it: the name that follows is
    // the author's own and this file's own code owns it. A per-entry exclusion
    // that treated any non-`ident` token alike would suppress `Bad` here.
    const cells: ReadonlyArray<readonly [string, string[]]> = [
      // A leading separator: the interior's first entry is empty.
      ["schema S { a: { , Bad: string } }", [bcm(4, 34)]],
      // A doubled separator behind a conformant entry: the empty entry sits
      // between two spelled ones.
      ["schema S { a: { b: string,, Bad: string } }", [bcm(4, 44)]],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [src, want] of cells) {
      actual[src] = rendered(theta(src));
      expected[src] = want;
    }
    expect(
      actual,
      "an empty entry's separator is not a residue-producing token, so the following entry's field name reaches the case rule intact",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (I) THE 0227 TRIPWIRES — byte-unchanged by the fix.
//
// t1–t3 are the ASCII uppercase-first spellings this file's own code owns: the
// fix removes a verdict on a RESIDUE, so it must not narrow the pass's real
// subject. t4–t7 are the four refusals already carried for the same non-ASCII
// bytes by the raw-key readers and the declaration surface. GREEN now and after.
// ===========================================================================

describe("0227 (I) — the real subjects of every rule at this seam do not move", () => {
  it("t1/t2/t3: an ASCII uppercase-first field name still draws this file's code, generic argument included", () => {
    const cells: ReadonlyArray<readonly [string, string[]]> = [
      // t1 — the inline slot, the pass's own subject: one `ident` token with no
      // preceding `punct`, so nothing about the residue fix reaches it.
      ["schema S { a: { Elan: string } }", [bcm(4, 33)]],
      // t2 — the `schema` DECLARATION field name, whose range is the field's own
      // (the outer lexer's site, not this arm's declaration-ranged convention).
      ["schema S { b: string, Elan: string }", [bcm(4, 27, 23)]],
      // t3 — under a generic argument, where group (A)'s g1 gate is the whole
      // difference between this pass and its raw-key neighbours. A fix that
      // reached the withholding gate instead of the retention reds here.
      ["schema S { a: array<{ Elan: string }> }", [bcm(4, 40)]],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [src, want] of cells) {
      actual[src] = rendered(theta(src));
      expected[src] = want;
    }
    expect(
      actual,
      "the pass keeps every name the author actually wrote as an ASCII identifier in a field-name position",
    ).toEqual(expected);
  });

  it("t4/t5/t6/t7: the same non-ASCII bytes keep the refusals the other rows already carry", () => {
    const cells: ReadonlyArray<readonly [string, string[]]> = [
      // t4 — the lowercase-tail spelling: the case predicate admits `lan`, so
      // even a rule reading the tail would be silent here and the raw-key
      // refusal stands alone for a second, independent reason.
      ["schema S { a: { Élan: string } }", [nid("Élan", 4, 33)]],
      // t5 — precedence: a repeating key is the duplicate row's subject alone.
      [
        "schema S { a: { Élan: string, Élan: string } }",
        [
          diag(
            "error",
            DUPLICATE_INLINE,
            msg(DUPLICATE_INLINE, [["<field>", "Élan"]]),
            4,
            1,
            47,
          ),
        ],
      ],
      // t6 — precedence: a quote-led key is the quoted row's subject alone, and
      // a `str` token never enters `fieldNames` at all (group (F)'s argument).
      [
        'schema S { a: { "Élan": string } }',
        [
          diag(
            "error",
            QUOTED_INLINE,
            msg(QUOTED_INLINE, [["<field>", '"Élan"']]),
            4,
            1,
            35,
          ),
        ],
      ],
      // t7 — the DECLARATION spelling of the same key, refused by the row that
      // owns a body whose first token is not a plain `ident: Type` field list.
      // This is the footing the inline refusal is measured against.
      [
        "schema S { Élan: string }",
        [diag("error", EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "S"]]), 4, 1, 26)],
      ],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [src, want] of cells) {
      actual[src] = rendered(theta(src));
      expected[src] = want;
    }
    expect(
      actual,
      "the rows reading the RAW key already name the author's spelling; the fix touches the identifier retention only",
    ).toEqual(expected);
  });

  it("t8: a non-`Ident` key with a LOWERCASE tail is already the raw-key row's alone", () => {
    // The control for group (H): the same `punct ident ":"` token sequence with
    // a tail the case predicate happens to admit. No case verdict is available
    // on this tail at all — which is what separates group (H)'s silences from
    // the token sequence merely being refused.
    const doc = theta("schema S { a: { *lan: string } }");
    expect(
      rendered(doc),
      "a tail the case predicate admits would draw nothing even if it were a subject, so this cell isolates the token sequence from the verdict",
    ).toEqual([nid("*lan", 4, 33)]);
  });
});

// ===========================================================================
// (J) THE UNCLOSED INTERIOR — measured, and pinned as already silent.
//
// `ObjectType` spells a closing `}`, so both passes at this arm are withheld
// when the source never closes the interior. j4 is the ASCII control that makes
// the cause unambiguous: it too is silent, so the silence is the gate and not
// the residue. Pinned so that removing the residue verdict cannot be mistaken
// for creating a new silence here. GREEN now and after.
// ===========================================================================

describe("0227 (J) — an inline interior the source never closes stays silent at this arm", () => {
  it("j1/j2/j3/j4: an unspelled closing `}` withholds both passes, residue or not", () => {
    const cells: readonly string[] = [
      "fn h(p: { éLan: string ): number { 1 }",
      "fn h(p: { ÉLan: string ): number { 1 }",
      "fn h(p: { *Lan: string ): number { 1 }",
      "fn h(p: { Elan: string ): number { 1 }",
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const src of cells) {
      actual[src] = rendered(theta(src));
      expected[src] = [];
    }
    expect(
      actual,
      "the closing-brace gate withholds this file's own code from j4 exactly as it withholds every row from j1–j3, so no diagnostic here is the fix's to add or remove",
    ).toEqual(expected);
  });
});
