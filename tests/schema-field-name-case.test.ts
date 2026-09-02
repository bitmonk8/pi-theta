import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0149 — the FIELD-NAME positions of the lowercase-first identifier rule,
// and the diagnostic they draw
// (docs/bugs/0149-field-name-case-positions-unenforced.md).
//
// THE RULE, written three times over. docs/spec_topics/lexical.md:16 requires
// lowercase-first (a lowercase letter, or `_`) for "`let` and `let mut`
// bindings, function parameters, function names, and schema field names", and
// scopes the field clause to the author's identifier: "The lowercase-first rule
// applies to the theta-side field identifier; the field's *wire* name … may be
// any string via the `as \"WireName\"` rename clause". `:18` states the
// disposition without qualification — "Violating either rule is a parse error:
// … `theta/parse/binding-case-mismatch`". docs/spec_topics/schemas.md:34
// repeats it on the page that owns the position ("the lowercase-first rule
// still applies to it") and `:39` calls the rename clause "the only mechanism"
// for a property name that is not theta-identifier-compatible, PascalCase
// among them. The registry row
// (docs/spec_topics/diagnostics/code-registry-parse.md:19, severity `E`) names
// the position in its *Trigger*: "Identifier in a binding / parameter /
// fn-name / field-name position does not start with a lowercase letter or
// `_`." DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md:72) makes a
// *Trigger* a spec-level statement of the inputs a code fires on, so nothing
// here widens the registry: the rows below assert the implementation onto the
// set the *Trigger* already names.
//
// WHY THE POSITION IS SILENT AND WHERE THE FIX LANDS. `contextualDiagnostics`
// (src/lexer/lexer.ts) enforces the rule through its `checkName` worker at
// three KEYWORD ADJACENCIES — the identifier after `let` (past the `mut`
// skip), after `fn`, and after `schema` / `enum`. A field name follows `{` or
// `,`, so a keyword scan cannot reach it; bug 0139 moved the `fn` PARAMETER
// position to the parser leaf for the same reason. The field-name token and
// its range exist at exactly one place per face: `parseSchemaObjectBody`
// (src/parser/theta-document.ts) holds `nameTok` across its whole loop body,
// and `extractParsedParams` (src/parser/frontmatter.ts) holds the YAML
// `item.key`. Neither `SchemaFieldSource` nor the recorded `params:` field
// range can supply one — `checkObjectSchema`
// (src/parser/schema-declarations.ts) ranges every per-field diagnostic it
// already emits on the WHOLE DECLARATION for want of a field range (row w1
// measures `@4:1-4:32` against a field at `@4:12-4:14`), and
// `extractParsedParams` records the VALUE node's range, not the key's (row q1).
// That is why the range assertions below are the load-bearing half of rows e1
// and e5: a diagnostic on the `schema` keyword or on the field's type is the
// low-effort wrong answer they refuse.
//
// THE CONTRACT THIS FILE PINS — bug 0149 §Expected behaviour and §Fix (e), one
// emission per ill-cased field name and no more: exactly one additional
// `theta/parse/binding-case-mismatch`, severity `error`, the registry *Message*
// byte-exact, ranged on the FIELD-NAME token itself. The code is `E`, so
// `hasLoadParseError` (src/extension/production-composition.ts) refuses to
// register the theta — that refusal is the emission's shipped consequence and
// rows e1 / e5 assert it directly against their conformant twins e2 / e6.
//
// THE LEDGER — what each group pins:
//   - (a) FACE 1 MUST FIRE — the `schema X { … }` field name: e1 (the pin, with
//     its range), e3, f1 (both fields, each at its own range), f2 (the second
//     field only), f4 (the theta-side half of an `as` rename), f9 (the
//     `.thetalib` route).
//   - (a) FACE 1 MUST STAY CLEAN: e2, f3 (the `_` prefix the rule admits), f5
//     (the conformant `xs as "Xs"` rename, whose wire half lexical.md:16 leaves
//     free).
//   - (k) ENFORCED-POSITION CONTROLS: k1–k6. The four lowercase-first positions
//     the tree already enforces, the `schema`-name twin under the other code,
//     and k6, the reserved-keyword PRECEDENCE control. They are what makes a
//     red in (a) attributable to the FIELD position rather than to a broken
//     harness or a moved message, and what makes the keyword arm's precedence a
//     measured fact rather than an assertion.
//   - (b) FACE 1 BOUNDARIES: f6 and f14 (a reserved keyword at the field
//     position stays `[]` — a different registered code under lexical.md:20,
//     unclaimed here; f14 is the uppercase-first spelling f6's lowercase `let`
//     cannot discriminate), f7 (an alias right-hand side's inline arms, now
//     enforced by bug 0154's fix — see below).
//   - (c) OVER-REACH TRIPWIRES: o4, o5, g2. They red if enforcement widens past
//     lexical.md:16's list.
//   - (d) DOWNSTREAM RE-PINS: f10, f12, f13, o3, w1, w2. The fix adds a lexical
//     diagnostic and moves no type judgement, so each keeps its current list
//     with the new code inserted in sort order where a declaration is ill-cased.
//   - (e) FACE 2 MUST FIRE — the `params:` frontmatter key: e5 (the pin, with
//     its range), p1, p6, b1, b3, b4, q1, q2 (bug 0380: a params key that is
//     not an identifier at all draws its own registered code,
//     `theta/parse/params-key-not-identifier` — a `params:` key is a
//     field-name position twice over, so the identifier rule now applies here
//     too), q3, q4 (a quoted but identifier-shaped key — q2's partner across
//     the spelling test).
//   - (e) FACE 2 MUST STAY CLEAN: e6, p3, p4 (the reserved keyword again), p7
//     and p8 (its uppercase-first spellings, `Ok` and `Result` — the shapes p4
//     cannot reach, and f14's face-2 twins); b5 is the `let` spelling of b1's
//     binding and must keep the diagnostic it already draws.
//   - (f) THE COMPANION CONTROLS: c1, c2, c3 — GREEN both before and after the
//     fix. See their group comment.
//
// WHY FACE 2 IS IN SCOPE. A `params:` key is a field name AND a body binding:
// docs/spec_topics/frontmatter/frontmatter-fields-a.md:57 makes `params`
// "exposed as typed variables in the theta body", and lexical.md:18 reserves
// the uppercase-first reading of a body identifier for "an existing schema,
// enum, or constructor in scope". Rows b1 and b5 are the same identifier
// entering the same namespace by two spellings; the rule cannot hold for one
// and not the other.
//
// FACE 3, the inline object type (`parseObject`, src/parser/type-grammar.ts),
// reachable in any `Type` position — `fn h(p: { Ys: string })`,
// `schema S { a: { Ys: string } }`, a `params:` right-hand side — is now
// ENFORCED, closed by bug 0154
// (docs/bugs/0154-inline-object-type-field-name-rules-unenforced.md):
// `walkType`'s `object` arm (src/parser/type-grammar.ts) tests
// `TypeNode.fieldNames` and draws `theta/parse/binding-case-mismatch`,
// declaration-ranged at the caller's `site.range` (route 2 of that report's
// §Fix (b) — `TypeToken.start` is an offset into the STRING `parseType`
// returns, whose stringification collapses whitespace, so a field-name-precise
// range there is not exact without a structural change). Face 3's own witness
// rows live in `tests/inline-object-field-name-case.test.ts`, not here — this
// file stays 0149's, and bug 0154 authorised exactly one re-pin: row f7 below.
// `schema S by Kind = …` reaches the ALIAS right-hand side, whose inline arms
// are parsed by `parseObject`, which is why f7 now draws two declaration-
// ranged lines (one per arm) while f1's braced body — face 1's own position —
// is unaffected.
//
// ORDERING IS PART OF THE ASSERTION. Every group funnels through
// `assembleDiagnostics` (src/diagnostics/diagnostic.ts:123–142), which sorts by
// `(file, line, col)` with a stable sort. That is what puts the
// declaration-ranged `redundant-wire-name` (`@4:1`) AHEAD of the field-ranged
// `binding-case-mismatch` (`@4:12`) in row w1, and the frontmatter-ranged code
// ahead of the body-ranged one in rows b1 and q1. The ordered `toEqual` below
// pins that order rather than tolerating it.
//
// DIAG-4 (diagnostic-shape.md:74) — no asserted message string is written out
// here. Each one is READ from the registry's *Message* column through
// `parseRegistry` / `registryMessage` (tools/code-registry/index.js) and the
// `msg` helper below, so a reworded template reds by naming the registry rather
// than by a bare string mismatch. The four sharded pages are concatenated
// because row q1 asserts a `theta/load/*` code alongside the `theta/parse/*`
// ones.
//
// ANTI-VACUITY. 38 of the 46 rows expect a non-empty ordered list, so a harness
// that stopped reaching the lexer, the parser or the frontmatter fails loudly
// here rather than turning the 8 `toEqual([])` rows into silent passes. Every
// assertion is an ordered whole-list equality over the UNFILTERED
// `doc.diagnostics` rendered `severity code: message @l:c-l:c`, so neither an
// extra diagnostic, nor a right diagnostic at the wrong range, nor a right
// diagnostic in the wrong order can hide inside a containment check.
//
// TIER: unit, offline, deterministic, provider-free. Every observable settles
// inside one `parseThetaDocument` call over a source string — no session, no
// host, no model on this path — so an integration tier would add a round-trip
// to a parse-time value and buy no reach, and a live tier would make a fully
// determined value stochastic.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. The registry lookup asserts its row's presence before
// the template is used.

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
    `DIAG-4 anchor: the sharded registry under docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
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
const SCHEMA_CASE = "theta/parse/schema-case-mismatch";
const EXTRA_FIELD = "theta/parse/extra-object-field";
const MISSING_FIELD = "theta/parse/missing-object-field";
const FIELD_TYPE_MISMATCH = "theta/parse/object-field-type-mismatch";
const REDUNDANT_WIRE = "theta/parse/redundant-wire-name";
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";
const RESERVED_KEYWORD = "theta/parse/reserved-keyword-as-identifier";
const TIMEOUT_REJECTED = "theta/parse/timeout-field-rejected";
const PARAMS_NOT_EXPR = "theta/load/params-type-not-expression";
const PARAMS_KEY_NOT_IDENT = "theta/parse/params-key-not-identifier";
/** The pattern-grammar refusal, sourced from expressions.md, not lexical.md:16. */
const PATTERN_HEAD = "theta/parse/capitalised-pattern-head";

// ===========================================================================
// Parse harness.
// ===========================================================================
//
// `parseDoc` (tests/helpers/e2e-s1.ts:39) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is
// stubbed: the lexer, the parser and the frontmatter reader under assertion are
// the production ones.

/** Frontmatter for every `.theta` body row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` as a `.theta` under the standard frontmatter. */
function theta(body: string): ThetaDocument {
  return parseDoc(FM + body);
}

/**
 * Parse a `.theta` whose frontmatter carries a `params:` block. `block` is the
 * indented key lines, so the FIRST key sits on source line 4 at column 3 —
 * `---` (1), `mode: prompt` (2), `params:` (3), first key (4).
 */
function withParams(block: string, body: string): ThetaDocument {
  return parseDoc(`---\nmode: prompt\nparams:\n${block}---\n${body}`);
}

/** Every diagnostic rendered `severity code: message @l:c-l:c`, in report order. */
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

/** The registry-sourced `binding-case-mismatch` line at a field-name span. */
function bcm(line: number, startColumn: number, endColumn: number): string {
  return diag("error", BINDING_CASE, msg(BINDING_CASE, []), line, startColumn, endColumn);
}

/**
 * `hasLoadParseError`'s predicate (src/extension/production-composition.ts),
 * restated over a parsed document: a theta registers unless some diagnostic is
 * an error-severity `theta/load/*` or `theta/parse/*`. Warnings never block
 * registration, which is why row w2 registers and row w1 does not.
 */
function registers(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some(
    (d: Diagnostic) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}

// ===========================================================================
// (a) Face 1 — the `schema X { … }` field name.
// ===========================================================================

describe("0149 (a) — an uppercase-first schema field name is a parse error", () => {
  it("e1: `schema S { Xs: string }` reports one binding-case-mismatch, ranged on `Xs`", () => {
    // THE PIN. Grammar-conformant (`SchemaShape ::= \"{\" Field (\",\" Field)*
    // \",\"? \"}\"`, docs/reference/grammar.md:312), one rule violated, so
    // lexical.md:18's disposition applies with nothing else in the way.
    //
    // The RANGE is the row's real subject. `SchemaFieldSource` carries no range
    // of its own, so every diagnostic `checkObjectSchema` emits about a field
    // lands on the whole declaration (row w1 measures `@4:1-4:32`); a
    // diagnostic on the `schema` keyword or on the declaration head would
    // satisfy a code-only assertion and point the author at the wrong token.
    //
    // Derivation. The frontmatter occupies lines 1–3, so the body is line 4.
    // Within `schema S { Xs: string }`: `schema` is 1–6, ` ` 7, `S` 8, ` ` 9,
    // `{` 10, ` ` 11, `Xs` 12–13. Columns are 1-indexed and the end column is
    // exclusive, so a two-character name spans 12→14.
    const doc = theta("schema S { Xs: string }\n");
    expect(
      rendered(doc),
      "lexical.md:16 puts schema field names in the lowercase-first list and code-registry-parse.md:19's Trigger names the field-name position",
    ).toEqual([bcm(4, 12, 14)]);

    // Registration denial is the emission's shipped consequence: the code is
    // `E`, so `hasLoadParseError` drops the theta.
    expect(
      registers(doc),
      "an error-severity theta/parse/* code denies registration",
    ).toBe(false);
  });

  it("e2: `schema S { xs: string }` reports nothing (control)", () => {
    // The conformant spelling of e1's fixture. Paired with e1 this is the whole
    // discriminator: the two sources differ in one character's case.
    const doc = theta("schema S { xs: string }\n");
    expect(
      rendered(doc),
      "a lowercase-first field name satisfies lexical.md:16",
    ).toEqual([]);
    expect(registers(doc), "a clean theta registers").toBe(true);
  });

  it("e3: an `array<string>` field type does not excuse the field name", () => {
    // The rule reads the NAME, not the type, and a `fn` consuming the schema
    // adds no second field position. A second diagnostic here would mean the
    // check runs over type occurrences rather than over declared fields.
    const doc = theta("schema S { Xs: array<string> }\nfn h(s: S): integer { 1 }\n");
    expect(
      rendered(doc),
      "the field's type is not the judged token",
    ).toEqual([bcm(4, 12, 14)]);
  });

  it("f1: both fields of a two-field body report, each at its own range", () => {
    // Per-field coverage. A check that stopped at the first field, or that
    // ranged every violation on the declaration head, passes a code-only
    // assertion and fails here.
    //
    // Derivation, body line 4: `{` 10, `Xs` 12–13, `,` 22, `Ys` 24–25.
    const doc = theta("schema S { Xs: string, Ys: integer }\n");
    expect(
      rendered(doc),
      "the loop must not stop at the first field, and each diagnostic carries its own field's range",
    ).toEqual([bcm(4, 12, 14), bcm(4, 24, 26)]);
  });

  it("f2: only the SECOND field violates, and the range is that field's own", () => {
    // The silence at HEAD is per-field, not an artifact of the first position.
    // Derivation, body line 4: `a` 12, `,` 21, `Ys` 23–24.
    const doc = theta("schema S { a: string, Ys: integer }\n");
    expect(
      rendered(doc),
      "the conformant first field is silent and the second is not",
    ).toEqual([bcm(4, 23, 25)]);
  });

  it("f4: an `as \"wire\"` rename does not excuse the theta-side name", () => {
    // lexical.md:16 splits this field in two: the theta-side identifier the
    // rule constrains, and the wire name it leaves free ("may be any string").
    // The diagnostic belongs to `Xs` and says nothing about `"wire"`, which is
    // what the single entry ranged at 12→14 asserts.
    const doc = theta('schema S { Xs as "wire": string }\n');
    expect(
      rendered(doc),
      "the rename clause frees the wire half only; schemas.md:34 keeps the rule on the theta-side identifier",
    ).toEqual([bcm(4, 12, 14)]);
  });

  it("f9: a `.thetalib` field is held to the same rule", () => {
    // lexical.md:3 applies every rule on that page to `.theta` and `.thetalib`
    // alike, and both extensions reach the same `parseSchemaObjectBody` through
    // the same parse. A `.thetalib` carries no frontmatter, so the body is
    // line 1 here and the field name spans 12→14 on it.
    const doc = parseDoc("schema S { Xs: string }\n", "lib.thetalib");
    expect(
      rendered(doc),
      "the rule is extension-independent",
    ).toEqual([bcm(1, 12, 14)]);
  });
});

// ===========================================================================
// (a) The conformant spellings — the predicate's negative side.
// ===========================================================================

describe("0149 (a) — a conformant field name stays clean", () => {
  // The predicate is lexical.md:16's — a lowercase letter OR `_` — which is
  // `checkName`'s existing first-letter test (src/lexer/lexer.ts), not a
  // `[a-z]` test. f3 reds against a third spelling that forgets the underscore.

  it("f3: an `_`-prefixed field name reports nothing (control)", () => {
    const doc = theta("schema S { _x: string }\n");
    expect(rendered(doc), "lexical.md:16 admits a leading underscore").toEqual([]);
  });

  it("f5: `xs as \"Xs\"` — the sanctioned route to a PascalCase wire name — reports nothing (control)", () => {
    // schemas.md:39 calls the rename clause "the only mechanism for expressing
    // schemas whose property names are not theta-identifier-compatible —
    // PascalCase (`\"FirstName\"`) …". This row is that mechanism. A fix that
    // reds it removes the route the spec directs authors to.
    const doc = theta('schema S { xs as "Xs": string }\n');
    expect(
      rendered(doc),
      "the wire half is free; only the theta-side identifier is judged",
    ).toEqual([]);
  });
});

// ===========================================================================
// (k) The enforced-position controls — the rule is live elsewhere.
// ===========================================================================

describe("0149 (k) — the already-enforced positions keep their behaviour", () => {
  // These five rows are what makes a red in group (a) attributable to the FIELD
  // position: they prove the code, the registry message, the ranges and the
  // harness all work on the same HEAD. They also fence the fix — the emission
  // it adds must not double or move any of them.

  it("k1: `schema p = string` reports schema-case-mismatch (control)", () => {
    // The PascalCase twin under lexical.md:15 and the other registered code
    // (code-registry-parse.md:20), held here because it shares `checkName`.
    const doc = theta("schema p = string\n");
    expect(rendered(doc), "the schema-NAME position must not move").toEqual([
      diag("error", SCHEMA_CASE, msg(SCHEMA_CASE, []), 4, 8, 9),
    ]);
  });

  it("k2: `let P = 1` reports binding-case-mismatch (control)", () => {
    const doc = theta("let P = 1\n");
    expect(rendered(doc), "the enforced `let` position must not move").toEqual([
      bcm(4, 5, 6),
    ]);
  });

  it("k3: `fn h(P: string): number { 1 }` reports binding-case-mismatch (control)", () => {
    // Bug 0139's shipped emission, at the parser leaf. It is the template this
    // fix follows and the proof that a non-keyword-adjacent position is
    // reachable.
    const doc = theta("fn h(P: string): number { 1 }\n");
    expect(rendered(doc), "the `fn` PARAMETER position must not move").toEqual([
      bcm(4, 6, 7),
    ]);
  });

  it("k4: `fn H(): number { 1 }` reports binding-case-mismatch (control)", () => {
    const doc = theta("fn H(): number { 1 }\n");
    expect(rendered(doc), "the `fn` NAME position must not move").toEqual([
      bcm(4, 4, 5),
    ]);
  });

  it("k5: `let mut P = 1` reports binding-case-mismatch (control)", () => {
    const doc = theta("let mut P = 1\n");
    expect(rendered(doc), "the `let mut` position must not move").toEqual([
      bcm(4, 9, 10),
    ]);
  });

  it("k6: `let Ok = 1` reports reserved-keyword-as-identifier, not the case code (control)", () => {
    // THE PRECEDENCE CONTROL, on a path this fix does not touch. `checkName`
    // (src/lexer/lexer.ts) refuses a reserved spelling and RETURNS before it
    // reaches its first-letter test, so the keyword arm owns `Ok` and the case
    // arm never sees it. Measuring that is what licenses rows f14, p7 and p8 to
    // expect `[]` at the two field positions rather than asserting the
    // precedence: the reserved-keyword arm at a field-name position is a
    // different registered code under a different spec sentence (lexical.md:20)
    // and is NOT closed by this fix, so a reserved spelling must draw nothing
    // from it at either face. Derivation, body line 4: `let` 1–3, ` ` 4, `Ok`
    // 5–6, so the span is 5→7 end-exclusive.
    const doc = theta("let Ok = 1\n");
    expect(
      rendered(doc),
      "the reserved-keyword arm claims the spelling ahead of the case arm",
    ).toEqual([
      diag(
        "error",
        RESERVED_KEYWORD,
        msg(RESERVED_KEYWORD, [["<keyword>", "Ok"]]),
        4,
        5,
        7,
      ),
    ]);
  });
});

// ===========================================================================
// (b) Face 1 boundaries — what the emission must NOT reach.
// ===========================================================================

describe("0149 (b) — the field position's two boundaries", () => {
  it("f6: a reserved keyword at the field position now draws reserved-keyword-as-identifier (bug 0153)", () => {
    // `parseSchemaObjectBody` admits a `keyword` token as a field name
    // deliberately, so a keyword-shaped field name CAN be captured rather than
    // mis-parsed — but bug 0153 closed the field-NAME identifier position
    // under lexical.md:20's separate reserved-keyword rule, a different
    // registered code from THIS file's `binding-case-mismatch`
    // (lexical.md:16). This row pins that closed position's firing row. The
    // `ident` guard keeping bug 0133's twelve non-`ident` recovery token
    // classes out of the case-mismatch arm is untouched by it — the two arms
    // sit side by side, keyed on `nameTok.kind`.
    const doc = theta("schema S { let: string }\n");
    expect(
      rendered(doc),
      "bug 0153 (lexical.md:20) now refuses a keyword-shaped field name at declaration",
    ).toEqual([diag("error", RESERVED_KEYWORD, msg(RESERVED_KEYWORD, [["<keyword>", "let"]]), 4, 12, 15)]);
  });

  it("f14: an UPPERCASE-first reserved keyword at the field position also now fires (bug 0153)", () => {
    // f6's discriminating twin. `Ok` is one of the three uppercase-first
    // reserved words (`Ok`, `Err`, `Result` — `reservedKeywords`,
    // src/lexer/lexer.ts), the shape where a token-kind guard and a
    // first-letter-only guard would have diverged. Bug 0153's keyword arm
    // reads `nameTok.kind`, not the first letter, so `Ok` fires exactly like
    // `let` does in f6 — the same code k6 measures owning `Ok` ahead of the
    // case arm at the `let`-binding position, now also true here.
    const doc = theta("schema S { Ok: string }\n");
    expect(
      rendered(doc),
      "an uppercase-first reserved keyword is still a reserved keyword first",
    ).toEqual([diag("error", RESERVED_KEYWORD, msg(RESERVED_KEYWORD, [["<keyword>", "Ok"]]), 4, 12, 14)]);
  });

  it("f7: an alias right-hand side's inline arms now draw the code, closed by bug 0154", () => {
    // `schema S by Kind = …` is an ALIAS right-hand side, not an object body:
    // its brace-rooted arms are parsed by `parseObject`
    // (src/parser/type-grammar.ts), which is face 3 of the 0149 fix. Bug 0154
    // closed that face and authorised exactly this one re-pin
    // (docs/bugs/0154-inline-object-type-field-name-rules-unenforced.md §Fix
    // (e)): each of the two arms is its own inline object type, so each draws
    // its own `binding-case-mismatch` line, both at the whole declaration's
    // range — the settled declaration-ranged answer, since the two arms
    // cannot be told apart by column at one range. Face 3's full row set lives
    // in `tests/inline-object-field-name-case.test.ts`; this row records only
    // the boundary this file's own contract touches.
    const doc = theta('schema S by Kind = { Kind: "a" } | { Kind: "b" }\n');
    expect(
      rendered(doc),
      "each inline arm is its own object type, so each ill-cased field name draws its own declaration-ranged line",
    ).toEqual([bcm(4, 1, 49), bcm(4, 1, 49)]);
  });
});

// ===========================================================================
// (c) The over-reach tripwires — positions outside lexical.md:16's list.
// ===========================================================================

describe("0149 (c) — binder classes and the enum variant stay outside the rule", () => {
  // TRIPWIRES, not incidental coverage. lexical.md:16's list is `let` /
  // `let mut` bindings, function parameters, function names, and schema field
  // names. A `for` / `par for` variable and a `match` pattern binder are absent
  // from it, and `WITHHELD_BINDER_TYPE_NAME`'s doc comment
  // (src/parser/type-layer-checks.ts) reasons from exactly that exclusion when
  // it rejects a casing rule as a source of unspellable binder names. An `enum`
  // variant is governed by the OTHER bullet (lexical.md:15) and the OTHER code
  // (code-registry-parse.md:20's "schema / enum / variant / type-alias
  // position"), so reaching g2 would emit the wrong code under the wrong rule.
  // A later reader finding o4 or g2 red, or finding this rule's codes at o5,
  // should narrow the fix, not the rows. o5 does carry
  // `theta/parse/capitalised-pattern-head`: a capitalised pattern HEAD names no
  // admitted pattern production (expressions.md's pattern-grammar
  // disambiguation — lowercase identifiers bind, capitalised ones refer to
  // constructors or schema names — restated for `match` patterns in
  // lexical.md), a different sentence enforced at a different site
  // (`parsePattern`'s tail arm) that leaves lexical.md:16's list untouched.

  it("o4: `for Y in xs { Y }` reports nothing", () => {
    const doc = theta('let xs: array<string> = ["a"]\nfor Y in xs { Y }\n');
    expect(rendered(doc), "a `for` variable is not in lexical.md:16's list").toEqual(
      [],
    );
  });

  it("o5: a `match` pattern binder `Q` draws only the pattern-head refusal, never this rule's codes", () => {
    const doc = theta("let v: integer = 3\nlet r = match v { Q => 1 }\nr\n");
    expect(
      rendered(doc),
      "a `match` pattern binder is not in lexical.md:16's list, so the sole code here is expressions.md's pattern-grammar refusal from `parsePattern`",
    ).toEqual([diag("error", PATTERN_HEAD, msg(PATTERN_HEAD, [["<name>", "Q"]]), 5, 19, 20)]);
  });

  it("g2: a lowercase `enum` variant reports nothing", () => {
    // Measured, not endorsed: bug 0149 §Non-goals records the variant position
    // as separately unenforced and unfiled. It is rowed here so a fix cannot
    // fold the other bullet's gap into this one.
    const doc = theta("enum E { a, b }\n");
    expect(
      rendered(doc),
      "an enum variant is governed by lexical.md:15 and schema-case-mismatch, not by this code",
    ).toEqual([]);
  });
});

// ===========================================================================
// (d) The downstream re-pins — every other check that reads the field name.
// ===========================================================================

describe("0149 (d) — the field name stays live in every downstream check", () => {
  // The fix adds a LEXICAL diagnostic at the declaration and moves no type
  // judgement and no runtime path, so each row keeps the list it already
  // reports with the new code inserted in `assembleDiagnostics`' sort order.
  // These rows also carry the report's bound: nothing downstream is corrupted,
  // so what is added is the missing refusal, not a changed verdict.

  it("f10: a conformant constructor over an ill-cased declaration reports only the declaration", () => {
    const doc = theta('schema S { Xs: string }\nlet s = S { Xs: "v" }\ns\n');
    expect(
      rendered(doc),
      "the constructor matches the declaration, so the declaration's case is the only fault",
    ).toEqual([bcm(4, 12, 14)]);
  });

  it("f12: a mismatched constructor keeps both of its codes, after the declaration's", () => {
    // The uppercase field name participates in every declared-field check —
    // nothing treats it as malformed. Sort order puts the line-4 declaration
    // diagnostic ahead of the two line-5 constructor ones.
    const doc = theta('schema S { Xs: string }\nlet s = S { Ys: "v" }\ns\n');
    expect(
      rendered(doc),
      "the constructor's presence checks are untouched; the declaration's case diagnostic is added ahead of them",
    ).toEqual([
      bcm(4, 12, 14),
      diag(
        "error",
        EXTRA_FIELD,
        msg(EXTRA_FIELD, [
          ["<field>", "Ys"],
          ["<schema>", "S"],
        ]),
        5,
        9,
        22,
      ),
      diag(
        "error",
        MISSING_FIELD,
        msg(MISSING_FIELD, [
          ["<field>", "Xs"],
          ["<schema>", "S"],
        ]),
        5,
        9,
        22,
      ),
    ]);
  });

  it("f13: a field-type mismatch keeps its code, after the declaration's", () => {
    const doc = theta("schema S { Xs: string }\nlet s = S { Xs: 3 }\ns\n");
    expect(
      rendered(doc),
      "the type judgement is untouched; the case diagnostic is added ahead of it",
    ).toEqual([
      bcm(4, 12, 14),
      diag(
        "error",
        FIELD_TYPE_MISMATCH,
        msg(FIELD_TYPE_MISMATCH, [
          ["<field>", "Xs"],
          ["<schema>", "S"],
          ["<expected>", "string"],
          ["<actual>", "integer"],
        ]),
        5,
        17,
        18,
      ),
    ]);
  });

  it("o3: an ill-cased CONSTRUCTOR over a conformant declaration is unchanged (control)", () => {
    // The construction site is already governed by the declaration, so a case
    // rule at the declaration propagates without a second check at the
    // constructor. This row must not gain a `binding-case-mismatch`: `Xs` here
    // is a constructor key, not a field DECLARATION.
    const doc = theta('schema S { xs: string }\nlet s = S { Xs: "v" }\ns\n');
    expect(
      rendered(doc),
      "a constructor key is not a field-name declaration position",
    ).toEqual([
      diag(
        "error",
        EXTRA_FIELD,
        msg(EXTRA_FIELD, [
          ["<field>", "Xs"],
          ["<schema>", "S"],
        ]),
        5,
        9,
        22,
      ),
      diag(
        "error",
        MISSING_FIELD,
        msg(MISSING_FIELD, [
          ["<field>", "xs"],
          ["<schema>", "S"],
        ]),
        5,
        9,
        22,
      ),
    ]);
  });

  it("w1: the declaration-ranged wire warning sorts AHEAD of the field-ranged case error", () => {
    // The ordering row. `checkObjectSchema`'s `redundant-wire-name` is ranged
    // at the whole declaration (`@4:1`) for want of a field range, while the
    // new code is ranged at the field (`@4:12`) — so `assembleDiagnostics`'
    // `(file, line, col)` sort puts the WARNING first even though the error is
    // the one this file is about. The row also proves severity does not
    // reorder, and that the pre-existing warning is neither suppressed nor
    // duplicated.
    const doc = theta('schema S { Xs as "Xs": string }\n');
    expect(
      rendered(doc),
      "assembleDiagnostics sorts by (file, line, col); column 1 precedes column 12",
    ).toEqual([
      diag(
        "warning",
        REDUNDANT_WIRE,
        msg(REDUNDANT_WIRE, [["<name>", "Xs"]]),
        4,
        1,
        32,
      ),
      bcm(4, 12, 14),
    ]);

    // A warning alone never blocks registration (row w2 registers); the added
    // error does.
    expect(
      registers(doc),
      "the added error-severity code denies registration where the warning alone did not",
    ).toBe(false);
  });

  it("w2: the same warning on a conformant field is unchanged, and still registers (control)", () => {
    const doc = theta('schema S { xs as "xs": string }\n');
    expect(
      rendered(doc),
      "the wire-name rules are untouched by the case rule",
    ).toEqual([
      diag(
        "warning",
        REDUNDANT_WIRE,
        msg(REDUNDANT_WIRE, [["<name>", "xs"]]),
        4,
        1,
        32,
      ),
    ]);
    expect(registers(doc), "warnings never block registration").toBe(true);
  });
});

// ===========================================================================
// (e) Face 2 — the `params:` frontmatter field name.
// ===========================================================================

describe("0149 (e) — an uppercase-first `params:` key is a parse error", () => {
  it("e5: a `params:` key `Topic: string` reports one binding-case-mismatch, ranged on the KEY", () => {
    // THE FACE-2 PIN. A `params:` key is a field name whose block lowers to an
    // object schema, and frontmatter-fields-a.md:57 also makes it a body
    // binding ("exposed as typed variables in the theta body"), so the position
    // is inside code-registry-parse.md:19's *Trigger* on both readings.
    //
    // The RANGE is again the row's subject, and for a sharper reason than at
    // face 1: the per-field range `extractParsedParams` already records is the
    // VALUE node's, not the key's (row q1 measures `@5:5-5:8` for a value on
    // the next line). A diagnostic reusing that recorded range would point at
    // the type and satisfy a code-only assertion.
    //
    // Derivation. `---` (1), `mode: prompt` (2), `params:` (3), `  Topic: …`
    // (4). The two-space YAML indent puts `Topic` at columns 3–7, so the span
    // is 3→8 end-exclusive.
    const doc = withParams("  Topic: string\n", "1\n");
    expect(
      rendered(doc),
      "the key is a field name and a body binding; lexical.md:16 governs both",
    ).toEqual([bcm(4, 3, 8)]);
    expect(
      registers(doc),
      "an error-severity theta/parse/* code denies registration",
    ).toBe(false);
  });

  it("e6: a `params:` key `topic: string` reports nothing (control)", () => {
    const doc = withParams("  topic: string\n", "1\n");
    expect(rendered(doc), "a lowercase-first key satisfies lexical.md:16").toEqual([]);
    expect(registers(doc), "a clean theta registers").toBe(true);
  });

  it("p1: a key carrying a default reports it once", () => {
    // The default right-hand side is a value, not a second binder position, so
    // the emission does not double.
    const doc = withParams('  Topic: string = "x"\n', "1\n");
    expect(rendered(doc), "a default introduces no second field name").toEqual([
      bcm(4, 3, 8),
    ]);
  });

  it("p3: an `_`-prefixed `params:` key reports nothing (control)", () => {
    // lexical.md:16's predicate is "a lowercase letter, or `_`", so face 2's
    // test must be the same one face 1 applies, not a `[a-z]` test.
    const doc = withParams("  _topic: string\n", "1\n");
    expect(rendered(doc), "lexical.md:16 admits a leading underscore").toEqual([]);
  });

  it("p4: a reserved keyword as a `params:` key now draws reserved-keyword-as-identifier (bug 0153)", () => {
    // Face 2's boundary, f6's twin. A keyword-shaped key is not an Identifier
    // under code-registry-parse.md:19's *Trigger*, so `isIdentifierShaped`
    // (src/parser/frontmatter.ts) admitting `let` as identifier-SHAPED never
    // reaches the case arm here — bug 0153's keyword arm, keyed on the same
    // `RESERVED_KEYWORDS` set, claims it first. This row pins that closed
    // position's firing row, ranged on the YAML key (`rangeOf(item.key, …)`),
    // the same range the case arm above uses for the same key.
    const doc = withParams("  let: string\n", "1\n");
    expect(
      rendered(doc),
      "bug 0153 (lexical.md:20) now refuses a keyword-shaped `params:` key",
    ).toEqual([diag("error", RESERVED_KEYWORD, msg(RESERVED_KEYWORD, [["<keyword>", "let"]]), 4, 3, 6)]);
  });

  it("p7: an UPPERCASE-first reserved keyword as a `params:` key also now fires (bug 0153)", () => {
    // p4's discriminating twin and f14's face-2 partner. `Ok` is one of the
    // three uppercase-first reserved words (`Ok`, `Err`, `Result` —
    // `reservedKeywords`, src/lexer/lexer.ts), the shape that would separate a
    // token-kind-only guard from a set-membership guard; bug 0153's `params:`
    // face reads `RESERVED_KEYWORDS.has(name)` directly (there is no token to
    // read a `kind` from), so `Ok` fires exactly like `let` does in p4 — the
    // same precedence k6 measures at the `let`-binding position, now also
    // true at both field-name faces.
    const doc = withParams("  Ok: string\n", "1\n");
    expect(
      rendered(doc),
      "a reserved keyword now fires identically at both field-name faces",
    ).toEqual([diag("error", RESERVED_KEYWORD, msg(RESERVED_KEYWORD, [["<keyword>", "Ok"]]), 4, 3, 5)]);
  });

  it("p8: a SECOND uppercase-first reserved keyword as a `params:` key also now fires (bug 0153)", () => {
    // p7 with `Result`, so the pair pins the SET rather than one spelling: the
    // guard reads the lexer's own `reservedKeywords()` (src/lexer/lexer.ts)
    // instead of a hand-written list, so a fix that special-cased `Ok` alone
    // would leave this row red.
    const doc = withParams("  Result: string\n", "1\n");
    expect(
      rendered(doc),
      "the closed set is the lexer's keyword set, not one spelling",
    ).toEqual([diag("error", RESERVED_KEYWORD, msg(RESERVED_KEYWORD, [["<keyword>", "Result"]]), 4, 3, 9)]);
  });

  it("p6: a body interpolating the param reports only the declaration", () => {
    // The reference inside a query template is not a declaration position.
    const doc = withParams("  Topic: string\n", "@`t ${Topic}`\n");
    expect(
      rendered(doc),
      "the key is declared once, so the rule fires once",
    ).toEqual([bcm(4, 3, 8)]);
  });

  it("b1: a body reference reports the key's case AND the pre-existing unknown-identifier", () => {
    // THE SHARPEST ROW, paired with b5: the same identifier entering the same
    // body namespace, refused when written `let Topic = 1` and admitted at HEAD
    // when written as a `params:` key.
    //
    // The SECOND diagnostic is not this fix's. `parseFrontmatter`'s `registered`
    // gate (src/parser/frontmatter.ts:1515) returns NO frontmatter object at all
    // once any frontmatter diagnostic is error-severity, so every body
    // reference to a `params:` field then draws `unknown-identifier`. That is
    // the shipped frontmatter contract, measured at HEAD by the c1 / c2 / c3
    // controls in group (f) below on all-lowercase sources. The whole-list
    // assertion carries the companion rather than filtering it, so a fix that
    // suppressed or duplicated it reds here.
    //
    // Derivation: `---` (5) closes the frontmatter, so the body `Topic` is
    // line 6, columns 1–5, span 1→6.
    const doc = withParams("  Topic: string\n", "Topic\n");
    expect(
      rendered(doc),
      "the case error is the fix's; the unknown-identifier is the `registered` gate's, pre-existing",
    ).toEqual([
      bcm(4, 3, 8),
      diag("error", UNKNOWN_IDENT, msg(UNKNOWN_IDENT, [["<name>", "Topic"]]), 6, 1, 6),
    ]);
  });

  it("b3: a `match` pattern over the param reports the declaration and the pattern head, each under its own rule", () => {
    // Two rules, two sites. The `params:` key draws this fix's field-name case
    // error; the pattern head draws expressions.md's pattern-grammar refusal
    // from `parsePattern` (row o5) because a capitalised bare head names no
    // admitted pattern production. A match pattern binder is NOT a field-name
    // position, so `binding-case-mismatch` must stay at the declaration alone.
    //
    // Derivation: `---` (5) closes the frontmatter, so `Topic` in the pattern
    // is line 6, columns 19–23, span 19→24.
    const doc = withParams("  Topic: string\n", "let r = match 3 { Topic => 1 }\nr\n");
    expect(
      rendered(doc),
      "the case error is the field-name rule's; the pattern-head refusal is the pattern grammar's (row o5)",
    ).toEqual([
      bcm(4, 3, 8),
      diag("error", PATTERN_HEAD, msg(PATTERN_HEAD, [["<name>", "Topic"]]), 6, 19, 24),
    ]);
  });

  it("b4: a `schema Topic` colliding with the param key reports the key's case", () => {
    // The collision the rule exists to prevent: an uppercase-first VALUE
    // binding and a `schema` of the same name coexisting. lexical.md:18
    // reserves the uppercase-first reading of a body identifier for "an
    // existing schema, enum, or constructor in scope".
    //
    // The SECOND diagnostic is not this fix's either, and it arrives for the
    // same reason b1's companion does. `parseFrontmatter`'s `registered` gate
    // returns NO frontmatter object once a frontmatter diagnostic is
    // error-severity, so no `params:` field claims the name `Topic` as a value
    // binding — the only declaration left holding it is `schema Topic`, and the
    // trailing `Topic` is the theta's TAIL, i.e. its final value rather than a
    // discarded statement. A `schema` declaration introduces a named type
    // (docs/spec_topics/schemas.md:3) and matches no arm of the four-arm
    // resolution list (docs/spec_topics/expressions.md:46–49), so the tail
    // draws `theta/parse/type-as-value` — bug 0140's value-position refusal,
    // whose own witness pins this exact position as row a7
    // (tests/type-name-as-value-refusal.test.ts). Following b1's convention, the
    // whole-list assertion carries the companion rather than filtering it, so a
    // fix that suppressed or duplicated it reds here.
    const doc = withParams("  Topic: string\n", "schema Topic { a: string }\nTopic\n");
    expect(
      rendered(doc),
      "the params key is the ill-cased declaration; the schema name is conformant under lexical.md:15",
    ).toEqual([
      bcm(4, 3, 8),
      diag(
        "error",
        "theta/parse/type-as-value",
        msg("theta/parse/type-as-value", [["<name>", "Topic"]]),
        7,
        1,
        6,
      ),
    ]);
  });

  it("b5: `let Topic = 1` reports binding-case-mismatch (control)", () => {
    // b1's contrast. The `let` spelling of the same binding already draws the
    // code at HEAD, from the lexer's `let` adjacency.
    const doc = theta("let Topic = 1\nTopic\n");
    expect(
      rendered(doc),
      "the `let` spelling of b1's binding must keep its diagnostic",
    ).toEqual([bcm(4, 5, 10)]);
  });

  it("q1: a key whose value is a block sequence reports the case error BEFORE the load error", () => {
    // The existing per-field `params:` refusal is ranged on the VALUE node
    // (`@5:5-5:8`, the `- a` line), which is exactly why face 2 cannot reuse
    // that recorded range for a diagnostic about the KEY. Sort order therefore
    // separates them: line 4 column 3 (the key) precedes line 5 column 5 (the
    // value). Both codes are registered and both survive.
    const doc = withParams("  Topic:\n    - a\n", "1\n");
    expect(
      rendered(doc),
      "the key's case and the value's shape are two independent registered faults",
    ).toEqual([
      bcm(4, 3, 8),
      diag(
        "error",
        PARAMS_NOT_EXPR,
        msg(PARAMS_NOT_EXPR, [["<param>", "Topic"]]),
        5,
        5,
        8,
      ),
    ]);
  });

  it("q2: a `params:` key that is not an identifier is refused (bug 0380)", () => {
    // Bug 0380 closed this control: a `params:` key is a field-name position
    // twice over (schema property + body binding), so the identifier rule
    // every sibling field-name position already enforces now applies here
    // too, under its own registered code (not a reuse of `binding-case-mismatch`,
    // which judges only the first letter's case of an already identifier-shaped
    // key). `"my topic"` cooks to a non-identifier value and draws
    // `theta/parse/params-key-not-identifier`, ranged on the key.
    const doc = withParams('  "my topic": string\n', "1\n");
    expect(
      rendered(doc),
      "a non-identifier key draws its own registered refusal",
    ).toEqual([
      diag(
        "error",
        PARAMS_KEY_NOT_IDENT,
        msg(PARAMS_KEY_NOT_IDENT, []),
        4,
        3,
        13,
      ),
    ]);
  });

  it("q4: a quoted but identifier-shaped `params:` key reports binding-case-mismatch", () => {
    // `isIdentifierShaped` judges the PARSED key string, so a quoted
    // `"Topic"` yields the theta-side binding `Topic` identically to the
    // unquoted spelling and is inside the registered *Trigger*'s "Identifier
    // in a … field-name position"; q2 is its partner, pinning the key that is
    // not identifier-shaped at all and therefore outside the *Trigger*.
    // Together the two rows measure both sides of the spelling test §Fix (b)
    // requires, rather than leaving one side assumed.
    const doc = withParams('  "Topic": string\n', "1\n");
    expect(
      rendered(doc),
      "a quoted but identifier-shaped key is inside the Trigger's Identifier clause",
    ).toEqual([bcm(4, 3, 10)]);
  });

  it("q3: two ill-cased keys report twice, each at its own key range", () => {
    // Per-key coverage, face 2's counterpart to f1: the walk over the YAML
    // mapping's items must not stop at the first key. Derivation: the second
    // key sits on line 5 at the same two-space indent, `Other` spanning 3→8.
    const doc = withParams("  Topic: string\n  Other: integer\n", "1\n");
    expect(
      rendered(doc),
      "the key walk must not stop at the first item",
    ).toEqual([bcm(4, 3, 8), bcm(5, 3, 8)]);
  });
});

// ===========================================================================
// (f) The `unknown-identifier` companion is the `registered` gate's, not this
//     fix's — three all-lowercase controls, GREEN before AND after.
// ===========================================================================

describe("0149 (f) — the frontmatter `registered` gate already voids body params", () => {
  // These three rows carry NO ill-cased identifier, so this fix cannot reach
  // them: they report the same lists before and after it lands. That is the
  // point of them. They prove that row b1's second diagnostic is produced by
  // `parseFrontmatter`'s `registered` gate (src/parser/frontmatter.ts:1515) —
  // which returns no frontmatter object once ANY frontmatter diagnostic is
  // error-severity, leaving every body reference to a `params:` field
  // unresolved — and not by an over-reach of the emission this file pins. c1
  // reaches the gate through the existing per-field load refusal, c3 through an
  // unrelated frontmatter error, and c2 is the clean control that shows the
  // reference resolves when the gate does not trip.

  it("c1: an existing per-field `params:` refusal already voids the body reference", () => {
    const doc = withParams("  topic:\n    - a\n", "topic\n");
    expect(
      rendered(doc),
      "the `registered` gate withholds the whole frontmatter, so the body reference is unknown",
    ).toEqual([
      diag(
        "error",
        PARAMS_NOT_EXPR,
        msg(PARAMS_NOT_EXPR, [["<param>", "topic"]]),
        5,
        5,
        8,
      ),
      diag("error", UNKNOWN_IDENT, msg(UNKNOWN_IDENT, [["<name>", "topic"]]), 7, 1, 6),
    ]);
  });

  it("c2: with no frontmatter error the same body reference resolves (control)", () => {
    const doc = withParams("  topic: string\n", "topic\n");
    expect(
      rendered(doc),
      "a `params:` key in scope resolves the body reference",
    ).toEqual([]);
  });

  it("c3: an UNRELATED frontmatter error voids the body reference the same way", () => {
    // `timeout: 5` is refused by its own registered row and has nothing to do
    // with `params:`, which isolates the companion to the gate rather than to
    // any particular frontmatter field.
    const doc = parseDoc("---\nmode: prompt\ntimeout: 5\nparams:\n  topic: string\n---\ntopic\n");
    expect(
      rendered(doc),
      "any error-severity frontmatter diagnostic trips the same gate",
    ).toEqual([
      diag(
        "error",
        TIMEOUT_REJECTED,
        msg(TIMEOUT_REJECTED, []),
        3,
        1,
        8,
      ),
      diag("error", UNKNOWN_IDENT, msg(UNKNOWN_IDENT, [["<name>", "topic"]]), 7, 1, 6),
    ]);
  });
});
