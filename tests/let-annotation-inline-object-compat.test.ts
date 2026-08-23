// Bug 0130 — an inline object type written in a `let` annotation converts to an
// unresolvable pseudo-`named` reference, so `theta/parse/let-rhs-type-mismatch`
// declines to fire at that position for EVERY initialiser form, and where an
// `array<…>` wrapper does make the check fire the type renders non-conformantly
// (docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md).
//
// THE DEFECT SITE, at HEAD `85717fa8` (v0.155.0):
// `annotationToCompatType`'s final arm, `src/parser/type-layer-checks.ts:886`
// (`return { kind: "named", name: text };`), reached from `walkStmt`'s
// `case "let"` at `:1194`. The "name" is the token-joined annotation source
// text (`{a:integer}`), which no `TypeEnv` resolves, so `decide`'s
// unresolvable-`named`-sub arm (`src/parser/type-compat.ts:276–278`) answers
// `"unknown"` and `checkLetRhsCompat`'s deferral
// (`src/parser/type-compat.ts:421–424`) returns no diagnostic through the arm
// reserved for `docs/spec_topics/type-system.md:48` *Unresolvable operands* —
// an input class this one is not: the whole field set TYPE-8
// (`docs/spec_topics/type-system.md:42`) needs is written in the source, at the
// position the check reads.
//
// THE ROUTE THIS FILE ENCODES (chosen; the bug doc's §Fix is constraint-pinned,
// not settled — the three decisions below are R1/R2/R3 of that route and every
// expected value in this file was MEASURED against the route's prototype, never
// assumed):
//
//   R1  A NEW conversion is used at the `let`-annotation site ONLY
//       (`walkStmt` case "let", src/parser/type-layer-checks.ts:1345). It mints
//       `{kind:"object", fields}` — `CompatType`'s documented TYPE-8 arm,
//       src/parser/type-compat.ts:61–64 — for a WELL-FORMED, NON-EMPTY inline
//       object type, recursing through union arms and `array<…>` elements.
//       `annotationToCompatType` itself is UNCHANGED, so its other four
//       consumers (`collectSchemaFields` → `object-field-type-mismatch`,
//       `invoke-static-checks.ts` → `tool-arg-type-mismatch`,
//       `query-schema-resolve.ts`'s `checkLetMismatch`, `compatToInferred`) and
//       the alias-RHS (`type-layer-checks.ts:369`) / `fn`-param-binding
//       (`:1783`) sites are HELD. §Fix (f) permits holding with a stated reason;
//       the reason is that other bugs' LANDED bounds pin those directions —
//       e.g. tests/member-access-declared-field-type.test.ts's four cells over
//       the same conversion. Group (c)'s alias row is that hold's recorded
//       residual, pinned SILENT here rather than left to be discovered.
//   R2  §Fix (a) decision: `{}` (empty interior) does NOT convert. It stays the
//       deferred pseudo-`named`, so `let x: {} = 1` and `let x: {} | null = 1`
//       keep EXACTLY bug 0045's single `theta/parse/empty-schema-body` line and
//       bug 0129's open question (a second `E` line for one written mistake) is
//       untouched. Malformed interiors also do NOT convert — `{ a }`, `{ a: }`,
//       `{"a": string}`, a duplicate field name, and any interior carrying a
//       `void` atom — so no bogus field set is minted from text the type grammar
//       does not spell. `{a: void}` in particular: `void` is not a `Type`
//       (docs/spec_topics/grammar.md:89 — `ReturnType ::= Type | "void"`,
//       "admitted here and nowhere else"), and declining it keeps bug 0093's
//       freshly-landed lock (tests/let-annotation-query-double-emission.test.ts
//       cell b2) byte-identical.
//   R3  §Fix (b) decision: the TYPE-8 arm of `decide`
//       (src/parser/type-compat.ts:245) gains the SAME sub-side deferral
//       TYPE-7's array arm already carries at `:219–221` (inside the arm at
//       `:218–226`, whose comment at `:210–217` states the reason) — an unresolvable
//       `named` sub against an `object` sup answers `"unknown"`. Without it,
//       every expression that types as a pseudo-`named`
//       (src/parser/static-type-inference.ts's `call` / `invoke` / `query` /
//       bare-object-literal arms) would start refusing under an inline-object
//       annotation, including the QRY-22 typed query the annotation form exists
//       for and the ONE committed corpus source that spells it
//       (tests/live/acceptance/fixtures/acc-typed-inline.theta:14). R3 keeps
//       that fixture loading with `[]`, which is the GOV-15
//       (docs/spec_topics/governance/source-language-stability.md:5) exposure
//       §Fix (c) names. A schema CTOR initialiser `S { a: 1 }` still REFUSES,
//       because `S` RESOLVES — TYPE-10's cross-form rule
//       (docs/spec_topics/type-system.md:52), which §Expected behaviour requires.
//
// RED AT HEAD, for the right reason: every cell expecting a
// `let-rhs-type-mismatch` line observes `[]` (or the single 0045 line alone),
// and the two rendering cells observe the pseudo-name's raw text
// (`array<{a:integer}>`) where `placeholder-rendering-a.md:27` fixes
// `array<{ a: integer }>`. Both are exactly the two elements the bug document
// files.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74) makes the
// registry *Message* column normative, so every expected message below is READ
// from the four sharded registry pages at run time and none is transcribed.
//
// HARNESS: `parseDoc` (tests/helpers/e2e-s1.ts:39) over the real
// `parseThetaDocument` behind the shipped inert `parseDeps` double, plus direct
// calls to the exported `annotationToCompatType` / `checkCompatible` /
// `displayType`. The fixture shape (frontmatter + statement + `let a = 1` / `a`
// tail) mirrors tests/brace-rooted-union-arm-capture.test.ts:189–194.
//
// EXISTING LANDED PINS THAT ENCODE THE BUGGY CONTRACT and are the IMPLEMENTER's
// to flip (this file does not touch them):
//   tests/brace-rooted-union-arm-capture.test.ts:517–539 (bug 0095 cell 2a),
//   :541–557 (cell 2b) — `let x: {a: integer} | null = 1` → `diagnostics: []`;
//   tests/inline-empty-object-type.test.ts:403–413 (bug 0045 cell a7),
//   :876–923 (cell g3) — unchanged under R2, but a7's "stays silent" comment
//   now holds by DECISION rather than by accident;
//   tests/annotation-nontype-text-refusal.test.ts (groups g4 / p2);
//   tests/let-annotation-query-double-emission.test.ts:293–305 (bug 0093 cell
//   b2) is byte-PRESERVED by R2, re-asserted independently as cell e5 below;
//   tests/generic-argument-shredded-group-refusal.test.ts (cell d1).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import * as typeLayerChecks from "../src/parser/type-layer-checks";
import { annotationToCompatType } from "../src/parser/type-layer-checks";
import {
  checkCompatible,
  displayType,
  type CompatType,
  type Compatibility,
} from "../src/parser/type-compat";
import { parseDoc } from "./helpers/e2e-s1";

// ===========================================================================
// The registry, read not restated (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry — the same input tests/code-registry.test.ts reconciles. */
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
 * A row's normative *Message* template. THROWS naming the missing code, so a
 * registry rename can never degrade an assertion below into a comparison
 * against `undefined` and can never be replaced by a hard-coded fallback.
 */
function templateOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code}; DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md:74) makes that column this file's ` +
        `only oracle, so a missing row is a loud failure, never a skip`,
    );
  }
  return template;
}

/** One rendered `<severity> <code>: <message>` line, by explicit slot substitution. */
function line(
  severity: "error" | "warning",
  code: string,
  subs: ReadonlyArray<readonly [string, string]>,
): string {
  const template = templateOf(code);
  let out = template;
  for (const [slot, value] of subs) {
    expect(
      template,
      `DIAG-4: the ${code} row's Message must still carry the ${slot} slot this file renders; ` +
        `observed template ${JSON.stringify(template)}`,
    ).toContain(slot);
    out = out.replaceAll(slot, value);
  }
  return `${severity} ${code}: ${out}`;
}

const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const EMPTY_SCHEMA = "theta/parse/empty-schema-body";
const OBJECT_INDEX = "theta/parse/non-string-object-index";
const ARRAY_JOIN = "theta/parse/non-string-array-join";
const BARE_OBJECT = "theta/parse/bare-object-literal";
const DUP_FIELD = "theta/parse/duplicate-inline-field-name";
const VOID_POSITION = "theta/parse/void-in-non-return-position";
const REASSIGN_RHS = "theta/parse/reassign-rhs-type-mismatch";
const GENERIC_ARITY = "theta/parse/generic-arity-mismatch";
const NON_ARRAY_ITERAND = "theta/parse/non-array-iterand";
const ARRAY_NO_COMMON = "theta/parse/array-no-common-type";
const ARRAY_ELEMENT = "theta/parse/array-element-type-mismatch";
const MALFORMED_FIELD = "theta/parse/malformed-schema-field";

/** The row this report owns: `let binding '<name>' … expected <expected>, got <actual>`. */
function mismatch(name: string, expected: string, actual: string): string {
  return line("error", LET_RHS, [
    ["<name>", name],
    ["<expected>", expected],
    ["<actual>", actual],
  ]);
}

/** Bug 0045's line for an empty inline object type in any `Type` position. */
function emptyInline(): string {
  return line("error", EMPTY_SCHEMA, [["<X>", "{}"]]);
}

/** Bug 0244 (operator adjudication)'s refusal for a discarded keyless entry. */
function malformedField(): string {
  return line("error", MALFORMED_FIELD, []);
}

// ===========================================================================
// Fixtures and observation.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` followed by a tail expression. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/** The document's WHOLE ordered diagnostic list, unfiltered, rendered as lines. */
function diags(src: string): string[] {
  return parseDoc(src).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** The whole ordered diagnostic list for one body statement. */
function stmtDiags(stmt: string): string[] {
  return diags(body(stmt));
}

// ===========================================================================
// The `let`-side conversion seam (R1), read defensively off its module.
// ===========================================================================

/**
 * R1's new export: the `let`-annotation-only conversion that mints TYPE-8's
 * `object` arm. Read off the module NAMESPACE rather than as a named import so
 * its absence at HEAD is a loud failure INSIDE the cells that need it, not a
 * collection-time abort that would take this file's green anti-widening fences
 * (groups (d), (e), and the controls) down with it.
 */
function letAnnotationConversion(): (src: string) => CompatType | undefined {
  const fn = (typeLayerChecks as Record<string, unknown>)["letAnnotationToCompatType"];
  if (typeof fn !== "function") {
    throw new Error(
      "R1: src/parser/type-layer-checks.ts exports no `letAnnotationToCompatType` — the " +
        "let-annotation-only conversion this route mints TYPE-8's `object` arm from " +
        "(docs/bugs/0130-…md §Fix (a)/(f)). `annotationToCompatType` is deliberately left " +
        "UNCHANGED by this route, so the new behaviour cannot be read off it",
    );
  }
  return fn as (src: string) => CompatType | undefined;
}

// ===========================================================================
// (a) Block A — the boundary across annotation shapes, one initialiser (`1`).
//
// WHY: the annotation shape is the ONLY variable across these ten cells. The
// primitive unions refuse today, which proves the check is live at this
// position for this initialiser; the brace-carrying spellings are silent, which
// is the defect. `integer | null` must stay silent (TYPE-5 admits an arm).
// ===========================================================================

describe("bug 0130 (a) — the annotation-shape boundary under the integer initialiser `1`", () => {
  it("a1: `let x: {a: integer} | null = 1` refuses, rendering `{ a: integer } | null`", () => {
    // The bug document's headline fixture. RED at HEAD: `[]`. TYPE-5
    // (type-system.md:39) reduces `1 ⊑ {a: integer} | null` to the two arms and
    // no rule in the closed TYPE-1…TYPE-8 list relates `integer` to either, so
    // `1 ⋢ {a: integer} | null`. The rendering is
    // placeholder-rendering-a.md:23 (` | ` join) over `:27` (the inline-object
    // form) — MEASURED under the route's prototype, byte for byte.
    expect(
      stmtDiags("let x: {a: integer} | null = 1"),
      "a1 — code-registry-parse.md:57's Trigger covers this input on its own words: a typed " +
        "binding, an RHS type that is statically resolvable (`integer`, TYPE-3), and no " +
        "compatibility rule admitting the pair. The resolvability clause governs the RHS, " +
        "not the annotation",
    ).toEqual([mismatch("x", "{ a: integer } | null", "integer")]);
  });

  it("a2: `let x: {a: integer} = 1` refuses — union-ness is irrelevant", () => {
    // Bug 0095's fixture happened to be a union because that is where its
    // capture defect lived; the bare inline object is equally silent at HEAD,
    // so the disposition is not about unions.
    expect(
      stmtDiags("let x: {a: integer} = 1"),
      "a2 — the bare `ObjectType` annotation (grammar.md:109 admits it in any `Type` " +
        "position) is TYPE-8's own operand shape",
    ).toEqual([mismatch("x", "{ a: integer }", "integer")]);
  });

  it("a3: `let x: string | null = 1` refuses — the primitive twin, unchanged", () => {
    // The liveness control: the check fires at this position for this
    // initialiser today, so a1/a2's silence cannot be a dead check.
    expect(
      stmtDiags("let x: string | null = 1"),
      "a3 — the primitive union with the same shape must keep its byte-identical line",
    ).toEqual([mismatch("x", "string | null", "integer")]);
  });

  it("a4: `let x: boolean | null = 1` refuses — the second primitive twin", () => {
    expect(
      stmtDiags("let x: boolean | null = 1"),
      "a4 — a second primitive-armed union, byte-frozen as the anti-perturbation fence",
    ).toEqual([mismatch("x", "boolean | null", "integer")]);
  });

  it("a5 CONTROL: `let x: integer | null = 1` stays silent", () => {
    // TYPE-5 (type-system.md:39) admits `1 ⊑ integer`. This must not move: a
    // route that keys on union-ness rather than on compatibility would red here.
    expect(
      stmtDiags("let x: integer | null = 1"),
      "a5 — TYPE-5 admits an arm, so the row has no subject; a fix that refuses here has " +
        "widened the relation, which §Non-goals forbids",
    ).toEqual([]);
  });

  it("a6: `let x: {} = 1` keeps bug 0045's single line ONLY (R2)", () => {
    // R2: `{}` does NOT convert. The annotation is already refused for its
    // emptiness at the type-grammar walk (code-registry-parse.md:91, bug
    // 0045's widening), and whether a SECOND `E` line is owed for one written
    // mistake is bug 0129's open question. This route declines to answer it, so
    // this cell is byte-identical to
    // tests/inline-empty-object-type.test.ts:403–413's cell a7.
    expect(
      stmtDiags("let x: {} = 1"),
      "a6 — R2 holds `{}` at the deferred pseudo-`named`, so bug 0129's question is untouched",
    ).toEqual([emptyInline()]);
  });

  it("a7: `let x: {} | null = 1` keeps bug 0045's single line ONLY (R2)", () => {
    // Bug 0095 cell 2a's subject, unchanged under R2 — the union spelling of a6.
    expect(
      stmtDiags("let x: {} | null = 1"),
      "a7 — the empty arm's emptiness line stands alone; R2 mints no field set from `{}`",
    ).toEqual([emptyInline()]);
  });

  it("a8: `let x: {} | string = 1` and `let x: string | {} = 1` are position-symmetric (R2)", () => {
    // The brace arm's POSITION in the union is irrelevant, before and after.
    expect(
      stmtDiags("let x: {} | string = 1"),
      "a8 — leading empty arm: 0045's line alone",
    ).toEqual([emptyInline()]);
    expect(
      stmtDiags("let x: string | {} = 1"),
      "a8 — trailing empty arm: the same single line, so no ordering artefact was introduced",
    ).toEqual([emptyInline()]);
  });

  it("a9: `let x: array<{a: integer}> = 1` refuses, rendering `array<{ a: integer }>`", () => {
    // The one shape where the check ALREADY fires at HEAD: TYPE-7's arm
    // (type-compat.ts:218–226) refuses a non-array sub before the element type
    // is consulted, so the inline object's collapse is never reached. What is
    // RED at HEAD is the RENDERING — `array<{a:integer}>`, the pseudo-name's
    // raw text through `displayType`'s `named` arm (type-compat.ts:333–334).
    expect(
      stmtDiags("let x: array<{a: integer}> = 1"),
      "a9 — element 2: placeholder-rendering-a.md:27 fixes the inline-object form with a " +
        "single space after each `:` and each `,`, and `:5` binds the comparison to byte identity",
    ).toEqual([mismatch("x", "array<{ a: integer }>", "integer")]);
  });

  it("a10: the ONE grammar-admitted trailing comma draws its comma-less twin's emission", () => {
    // MEASURED, not assumed. `ObjectType ::= "{" Field ("," Field)* ","? "}"`
    // (docs/spec_topics/grammar.md:101) admits one optional trailing comma, so
    // `{a: integer,}` spells the SAME type as a2's `{a: integer}` and owes the
    // same disposition — two spellings of one type reaching two dispositions is
    // the defect this report files. HEAD (pre-fix) baseline for both rows: `[]`.
    expect(
      stmtDiags("let x: {a: integer,} = 1"),
      "a10.1 — byte-identical to a2's line: the comma is grammar, not malformation",
    ).toEqual([mismatch("x", "{ a: integer }", "integer")]);
    expect(
      stmtDiags("let x: {a: integer, b: string,} = 1"),
      "a10.2 — and after a multi-field list, rendered per placeholder-rendering-a.md:27",
    ).toEqual([mismatch("x", "{ a: integer, b: string }", "integer")]);
  });
});

// ===========================================================================
// (b) Block B — the annotation shape, not the initialiser form, decides.
//
// WHY: this group is what REDS if a route keys on the RHS expression form
// instead of on the annotation. Five initialiser forms that all refuse under a
// primitive annotation must all refuse under the inline object one. The schema
// CTOR row is TYPE-10's cross-form rule in terms (type-system.md:52), and it
// survives R3 precisely because `S` RESOLVES.
// ===========================================================================

describe("bug 0130 (b) — five initialiser forms under an inline-object annotation", () => {
  it("b1 CONTROL: the primitive column is byte-unchanged", () => {
    // The five RHS forms the check resolves elsewhere in the same run. If any
    // of these moves, the route has perturbed the ordinary path.
    expect(stmtDiags("let r: string = 1"), "b1.1").toEqual([
      mismatch("r", "string", "integer"),
    ]);
    expect(stmtDiags("let r: string = true"), "b1.2").toEqual([
      mismatch("r", "string", "boolean"),
    ]);
    expect(stmtDiags('let r: integer = "s"'), "b1.3").toEqual([
      mismatch("r", "integer", "string"),
    ]);
    expect(stmtDiags("let r: string = [1]"), "b1.4").toEqual([
      mismatch("r", "string", "array<integer>"),
    ]);
    expect(
      diags(`${FM}schema S { a: integer }\nlet r: string = S { a: 1 }\n${TAIL}`),
      "b1.5 — the ctor's static type is the nominal `S`",
    ).toEqual([mismatch("r", "string", "S")]);
  });

  it("b2: every initialiser form refuses under `{a: integer}`", () => {
    expect(stmtDiags("let r: {a: integer} = 1"), "b2.1 — integer literal").toEqual([
      mismatch("r", "{ a: integer }", "integer"),
    ]);
    expect(stmtDiags("let r: {a: integer} = true"), "b2.2 — boolean literal").toEqual([
      mismatch("r", "{ a: integer }", "boolean"),
    ]);
    expect(stmtDiags('let r: {a: integer} = "s"'), "b2.3 — string literal").toEqual([
      mismatch("r", "{ a: integer }", "string"),
    ]);
    expect(stmtDiags("let r: {a: integer} = [1]"), "b2.4 — array literal").toEqual([
      mismatch("r", "{ a: integer }", "array<integer>"),
    ]);
  });

  it("b3: the schema CTOR refuses under `{a: integer}` — TYPE-10 cross-form", () => {
    // MEASURED, and the reason matters: R3's new sub-side deferral keys on an
    // UNRESOLVABLE `named` sub, and `S` is declared in the same document, so it
    // resolves and TYPE-8's `sub.kind !== "object"` arm still answers
    // `incompatible`. type-system.md:52 makes this the row's own case: "an
    // inline-object value is not `⊑` a named schema with the same field shape"
    // and the converse — the cross-form pair is `⋢` regardless of field shape,
    // even with the identical field list `{a: integer}`.
    expect(
      diags(`${FM}schema S { a: integer }\nlet r: {a: integer} = S { a: 1 }\n${TAIL}`),
      "b3 — TYPE-10's cross-form mismatch must surface HERE, on this row (TYPE-9)",
    ).toEqual([mismatch("r", "{ a: integer }", "S")]);
  });

  it("b4: the union column refuses too — one deferring arm no longer swallows the verdict", () => {
    // TYPE-5 on the right (type-compat.ts:195–208) returns `"unknown"` when no
    // arm is compatible and one answered `"unknown"`; with the brace arm now an
    // `object`, no arm defers and the union answers `incompatible`.
    expect(stmtDiags('let r: {a: integer} | null = "s"'), "b4.1 — `| null`").toEqual([
      mismatch("r", "{ a: integer } | null", "string"),
    ]);
    expect(stmtDiags('let r: {a: integer} | integer = "s"'), "b4.2 — `| integer`").toEqual([
      mismatch("r", "{ a: integer } | integer", "string"),
    ]);
  });
});

// ===========================================================================
// (c) Block C — the same type, three spellings, plus the resolvability control.
//
// WHY: two spellings of one type must not get two dispositions
// (grammar.md:109 + type-system.md:15 state position and spelling invariance).
// The ALIAS row is this route's RECORDED RESIDUAL, not an oversight.
// ===========================================================================

describe("bug 0130 (c) — named / inline / alias spellings of one type", () => {
  it("c1 CONTROL: the named spelling refuses, unchanged", () => {
    expect(
      diags(`${FM}schema S { a: integer }\nlet x: S | null = 1\n${TAIL}`),
      "c1 — the named twin's byte-identical line, the contrast a1 is measured against",
    ).toEqual([mismatch("x", "S | null", "integer")]);
  });

  it("c2: the inline spelling refuses the same way", () => {
    expect(
      diags(`${FM}schema S { a: integer }\nlet x: {a: integer} | null = 1\n${TAIL}`),
      "c2 — same type, second spelling, same disposition",
    ).toEqual([mismatch("x", "{ a: integer } | null", "integer")]);
  });

  it("c3 RESIDUAL: the ALIAS spelling stays SILENT under this route (the hold is stated)", () => {
    // MEASURED under the prototype: `[]`, unchanged from HEAD. R1 scopes the
    // new conversion to the `let`-ANNOTATION site, and an alias declaration's
    // RHS is built by `collectTypeEnv` through the UNCHANGED
    // `annotationToCompatType` (src/parser/type-layer-checks.ts:369), so
    // TYPE-11's unfold still reproduces the pseudo-name and the union still
    // defers. §Fix (f) permits holding a consumer "with a stated reason"; the
    // reason is that the other four consumers of that conversion carry other
    // bugs' landed bounds. This cell PINS the residual so the gap is a recorded
    // decision rather than a discovery — and so that a later fix widening the
    // alias RHS reds here and must update this comment deliberately.
    expect(
      diags(`${FM}schema X = {a: integer} | null\nlet x: X = 1\n${TAIL}`),
      "c3 — held: the alias-RHS conversion site is outside R1's scope",
    ).toEqual([]);
  });

  it("c4 CONTROL: the primitive-armed alias keeps refusing", () => {
    // TYPE-11 transparency over an unaffected arm set — proves c3's silence is
    // the object arm's, not the alias machinery's.
    expect(
      diags(`${FM}schema X = string | null\nlet x: X = 1\n${TAIL}`),
      "c4 — the alias unfold itself works; c3's silence is the held conversion",
    ).toEqual([mismatch("x", "X", "integer")]);
  });

  it("c5 CONTROL: `let x: Nope = 1` stays silent — type-system.md:48's real subject", () => {
    // The carve-out this defect mis-applies: `Nope` is a name whose declaration
    // may sit outside the parser's view, so the parse-time check is skipped and
    // the runtime AJV check is the net. A written `{a: integer}` is NOT this
    // input class, and this cell fences the difference in both directions.
    expect(
      stmtDiags("let x: Nope = 1"),
      "c5 — an unresolvable NAME must keep deferring; a route that refuses here has widened " +
        "the *Unresolvable operands* carve-out instead of narrowing it",
    ).toEqual([]);
  });
});

// ===========================================================================
// (d) The deferral controls (R3) and the committed-corpus fixture.
//
// WHY: R3's sub-side deferral is what keeps the QRY-22 typed-query surface and
// the one committed inline-object source loading clean. Without it, §Fix (b)'s
// naive route turns every initialiser under an inline-object annotation into a
// refusal and GOV-15 observable (b) moves on a shipped fixture.
// ===========================================================================

describe("bug 0130 (d) — the R3 deferral controls and the GOV-15 corpus fixture", () => {
  it("d1 CONTROL: `let x: {a: integer} | null = null` stays silent (TYPE-5)", () => {
    // TYPE-5 admits the `null` arm. A route that refuses here has broken the
    // nullability spelling `T | null` (grammar.md's "nullability is written
    // `T | null`").
    expect(stmtDiags("let x: {a: integer} | null = null"), "d1").toEqual([]);
  });

  it("d2 CONTROL: `let x: integer | null = 1` stays silent", () => {
    // Bug 0095's control 2c (tests/brace-rooted-union-arm-capture.test.ts:
    // 559–574), mirrored here: the ordinary primitive union is untouched.
    expect(stmtDiags("let x: integer | null = 1"), "d2").toEqual([]);
  });

  it("d3: a typed QUERY initialiser DEFERS under an inline-object annotation (R3)", () => {
    // The QRY-22 surface the annotation form exists for. A `query` types as a
    // pseudo-`named` naming its schema source
    // (src/parser/static-type-inference.ts's query arm), which R3's new arm
    // sends to `"unknown"` — so the model response is AJV-validated against the
    // lowered annotation at run time and no parse refusal is minted.
    expect(
      stmtDiags("let r: { ok: boolean, label: string } = @`x`?"),
      "d3 — R3: an unresolvable `named` sub against an `object` sup defers, exactly as " +
        "TYPE-7's array arm already does at type-compat.ts:219–221",
    ).toEqual([]);
  });

  it("d4: a `call` initialiser DEFERS under an inline-object annotation (R3)", () => {
    // `f()` types as `named <callee>` (static-type-inference.ts's `call` arm) —
    // unresolvable as a TYPE ENV entry, so R3 defers. §Non-goals scopes the
    // correctness of that pseudo-`named` inference out of this report.
    expect(
      stmtDiags("fn f(): integer { 1 }\nlet r: {a: integer} = f()"),
      "d4 — the RHS side's pseudo-`named` inference is §Non-goals; R3 keeps it deferring",
    ).toEqual([]);
  });

  it("d5: an `invoke` initialiser DEFERS under an inline-object annotation (R3)", () => {
    expect(
      stmtDiags('let r: {a: integer} = invoke("./x.theta")'),
      "d5 — an `invoke` against an unresolved callee is type-system.md:48's own second example",
    ).toEqual([]);
  });

  it("d6 CONTROL: a bare object literal keeps its OWN refusal alone", () => {
    // The one expression form that could denote an inline object VALUE is
    // refused at this position by `theta/parse/bare-object-literal`
    // (code-registry-parse.md:48). R3 keeps the mismatch row from co-firing on
    // top of it — one written mistake, one line.
    expect(
      stmtDiags("let x: {a: integer} = { a: 1 }"),
      "d6 — no second line beside the bare-object-literal refusal",
    ).toEqual([line("error", BARE_OBJECT, [])]);
  });

  it("d7 GOV-15: the committed corpus fixture still parses with `[]`", () => {
    // tests/live/acceptance/fixtures/acc-typed-inline.theta:14 is the ONLY
    // inline object type in a `Type` position across the tracked corpus, and it
    // is H9a acceptance area (c)'s fixture with `noErrorExit: true` and
    // `permittedCodesSubset: true` (tests/live/acceptance/harness.ts). Its
    // annotation is `{ ok: boolean, label: string }` and its initialiser is a
    // typed query, so R3 carries it. This is §Fix (c)'s corpus exposure,
    // discharged in the refusing direction: NO new code reaches
    // tests/fixtures/h7a/permitted-codes.json.
    const fixture = readFileSync(
      fileURLToPath(
        new URL("./live/acceptance/fixtures/acc-typed-inline.theta", import.meta.url),
      ),
      "utf8",
    );
    expect(
      diags(fixture),
      "d7 — GOV-15 observable (b) (source-language-stability.md:5) must not move on a " +
        "shipped fixture; if this reds, permitted-codes.json and H9a area (c) are both in play",
    ).toEqual([]);
  });
});

// ===========================================================================
// (e) R2's boundary — the `{}` and malformed-interior declines.
//
// WHY: bug 0045's own key enumerates the interiors the capture admits
// (`{ a }`, `{ a: }`, `{ "a": string }`), and a fix must not mint a bogus field
// set from text the type grammar does not spell. Every cell here is silent, or
// carries ONLY the line another rule already owns.
// ===========================================================================

describe("bug 0130 (e) — R2: `{}` and malformed interiors do not convert", () => {
  it("e1: `let x: { a } = 1` now draws bug 0244's keyless-entry refusal", () => {
    // A name with no type is no `Field`, so R2 still declines to convert this
    // interior into a field set (it invents no type for `a`). Bug 0244
    // (operator adjudication) is a SEPARATE, earlier refusal: the entry `a`
    // spells no top-level `:` and carries no stray close token, so
    // `TypeParser.parseObject` refuses it at the loop before R2 ever runs.
    // ADDED line, not a substitute for R2's own silence.
    expect(
      stmtDiags("let x: { a } = 1"),
      "e1 — bug 0244 refuses the colon-less entry `a`; R2 itself still declines to convert it " +
        "into a field set",
    ).toEqual([malformedField()]);
  });

  it("e2: `let x: { a: } = 1` stays silent — empty field type", () => {
    expect(stmtDiags("let x: { a: } = 1"), "e2 — R2 declines an empty field type").toEqual(
      [],
    );
  });

  it("e3: `let x: {\"a\": string} = 1` draws bug 0176's quoted-key refusal alone — a quoted key is no `Ident`", () => {
    // The field name grammar is `Ident` (schemas.md's `Field` form, reused by
    // `ObjectType` per grammar.md:109), so a JSON-style quoted key is not one.
    // WHY THIS LIST MOVED (at the 0176 merge): bug 0176 §Fix route A refuses a
    // quoted inline field-name key at parse (`theta/parse/quoted-inline-field-name`),
    // and this cell's fixture is exactly that class. The cell's subject is
    // preserved by the whole-list assertion: R2 still declines the conversion —
    // no `let-rhs-type-mismatch` line appears — and the one line present is
    // 0176's own row (its `<field>` is the raw pre-colon text after trim()).
    expect(
      stmtDiags('let x: {"a": string} = 1'),
      "e3 — R2 declines a non-identifier key rather than treating `\"a\"` as a field name",
    ).toEqual([
      line("error", "theta/parse/quoted-inline-field-name", [["<field>", '"a"']]),
    ]);
  });

  it("e4: a duplicate field name keeps its OWN line alone", () => {
    // `theta/parse/duplicate-inline-field-name` (code-registry-parse.md:92)
    // already refuses this interior. R2 declines to convert it, so no mismatch
    // line co-fires: one written mistake, one line.
    expect(
      stmtDiags("let x: {a: integer, a: string} = 1"),
      "e4 — the duplicate-key row stands alone; TYPE-8's exact-field-set rule has no " +
        "well-defined operand when one key is declared twice",
    ).toEqual([line("error", DUP_FIELD, [["<field>", "a"]])]);
  });

  it("e5: `let x: {a: void} = 1` keeps the void-position line alone", () => {
    // `void` is not a `Type` (grammar.md:89 — `ReturnType ::= Type | "void"`,
    // "admitted here and nowhere else"), so an interior carrying a `void` atom
    // spells no field set. Declining it also keeps bug 0093's freshly-landed
    // lock (tests/let-annotation-query-double-emission.test.ts cell b2)
    // byte-identical.
    expect(
      stmtDiags("let x: {a: void} = 1"),
      "e5 — the void-in-non-return-position row stands alone",
    ).toEqual([line("error", VOID_POSITION, [])]);
  });

  it("e7: a field TYPE tail that no `Type` alternative derives declines the whole interior", () => {
    // MEASURED, not assumed. The KEY side alone is not enough: the annotation
    // capture is LENIENT (bug 0124 — trailing punctuation is joined into the
    // captured source), so a tail such as `integer>` reaches this conversion. A
    // minted field set must spell exactly what the source spells, and
    // `<expected>` must render a real static type (placeholder-rendering-a.md
    // category 1 has no rendering for `{ a: integer> }`), so an unrecognised
    // tail declines back to the deferring pseudo-`named` — the SAFE direction,
    // status-quo silence, which also keeps GOV-15 still on inputs outside the
    // premeasured set.
    //
    // ROWS e7.1–e7.4 NOW DRAW A REFUSAL, and THIS ROUTE'S DECLINE IS UNCHANGED
    // by that. Bug 0252
    // (docs/bugs/0252-brace-and-angle-annotation-junk-exempt-from-refusal.md)
    // measured that `annotationSourceIsNotTypeExpression`
    // (src/parser/type-layer-checks.ts) DECLINED to judge any annotation text
    // carrying both a brace and an angle bracket, so junk it refuses when
    // written with braces alone (`{a: integer--}`) was admitted here — the four
    // interiors below are that exemption's own spellings. Under 0252's route
    // the recogniser judges them (§Expected behaviour 1: refused "whatever
    // brackets its text happens to carry") and each draws
    // `theta/parse/annotation-type-not-expression` for its `let` binder.
    //
    // WHAT DID NOT MOVE: this route's conversion decline. The interior still
    // declines to the deferring pseudo-`named` for an unrecognised tail — R2's
    // direction is untouched and no bogus field set is minted from text the
    // type grammar does not spell. What moved is ORDER: the refusal now runs
    // BEFORE that deferral is ever read, so the silence these rows recorded is
    // replaced by a registered refusal rather than by a mismatch line. The
    // flip is a strengthening — silence to a diagnostic — and the theta no
    // longer registers.
    //
    // e7.5 and e7.6 are UNMOVED, and deliberately so: e7.5's
    // `{a: Result<integer>}` is this report's *Residuals* item 4 set (a
    // grammar-admitted interior the converter declines) and a §Non-goal of bug
    // 0252, whose annotation walk already draws the arity row alone; e7.6
    // spells no angle bracket at all, so 0252's conjunct never reached it.
    expect(
      stmtDiags("let x: {a: integer>} = 1"),
      "e7.1 — a stray `>`: bug 0252 refuses it at the recogniser",
    ).toEqual([line("error", "theta/parse/annotation-type-not-expression", [["<name>", "x"]])]);
    expect(
      stmtDiags("let x: {a: b>c} = 1"),
      "e7.2 — punctuation between two atoms",
    ).toEqual([line("error", "theta/parse/annotation-type-not-expression", [["<name>", "x"]])]);
    expect(
      stmtDiags("let x: {a: array<b>c>} = 1"),
      "e7.3 — recursion: an `array<…>` element must itself be recognised",
    ).toEqual([line("error", "theta/parse/annotation-type-not-expression", [["<name>", "x"]])]);
    expect(
      stmtDiags("let x: {a: {b: integer>}} = 1"),
      "e7.4 — recursion: a nested brace interior must itself convert",
    ).toEqual([line("error", "theta/parse/annotation-type-not-expression", [["<name>", "x"]])]);
    expect(
      stmtDiags("let x: {a: Result<integer>} = 1"),
      "e7.5 — a generic application is not an identifier-shaped `NamedType`; the arity row " +
        "stands alone, with no mismatch line rendering `Result<integer>` as a field type",
    ).toEqual([
      line("error", GENERIC_ARITY, [
        ["<ctor>", "Result"],
        ["<expected>", "2"],
        ["<actual>", "1"],
      ]),
    ]);
    expect(
      stmtDiags("let x: {a: integer,,} = 1"),
      "e7.6 — a SECOND trailing comma is not grammar-admitted (grammar.md:101 admits one), " +
        "so the empty part it leaves still declines — the boundary a10 is measured against",
    ).toEqual([]);
  });

  it("e6: the `{}` spellings mint no field set (R2 restated at the seam)", () => {
    // Read at the CONVERSION, not only at the diagnostic list: R2's decision is
    // that `{}` keeps the deferred pseudo-`named`, which is what leaves bug
    // 0129's question untouched.
    const convert = letAnnotationConversion();
    expect(convert("{}"), "e6.1 — `{}` stays a `named`, so `decide` still defers").toEqual({
      kind: "named",
      name: "{}",
    });
    expect(
      convert("{}|null"),
      "e6.2 — and inside a union, so TYPE-5's `sawUnknown` accumulation still swallows it",
    ).toEqual({
      kind: "union",
      arms: [
        { kind: "named", name: "{}" },
        { kind: "prim", name: "null" },
      ],
    });
  });
});

// ===========================================================================
// (f) Element 2 — the BYTE renderings against placeholder-rendering-a.md:27.
//
// WHY: `:5` binds the comparison basis to GOV-15 byte identity, and `:27` fixes
// the inline-object form as `{ f₁: T₁, f₂: T₂ }` — "fields in declaration
// order, single space after each `:` and after each `,`". `:23` fixes the union
// join as ` | `. Both reachable sites are covered: `<expected>` on this report's
// row, and `<element>` at `theta/parse/non-string-array-join`, reached through
// bug 0083's recorded declared binding type.
// ===========================================================================

describe("bug 0130 (f) — element 2: the rendered bytes", () => {
  it("f1: `<expected>` renders `{ a: integer } | null`, `{ a: integer }`, `array<{ a: integer }>`", () => {
    // At HEAD these render the token-joined pseudo-name (`{a:integer}`), which
    // `parseType`'s join has already stripped the interior spaces from — the
    // raw text, through `displayType`'s `named` arm.
    expect(
      stmtDiags("let x: {a: integer} | null = 1"),
      "f1.1 — union join per :23 over the inline form per :27",
    ).toEqual([mismatch("x", "{ a: integer } | null", "integer")]);
    expect(stmtDiags("let x: {a: integer} = 1"), "f1.2 — the bare inline form").toEqual([
      mismatch("x", "{ a: integer }", "integer"),
    ]);
    expect(
      stmtDiags("let x: array<{a: integer}> = 1"),
      "f1.3 — `array<T>` per the angle-bracket rule, with the element recursing :27",
    ).toEqual([mismatch("x", "array<{ a: integer }>", "integer")]);
  });

  it("f2: a two-field annotation renders `{ ok: boolean, label: string }`", () => {
    // The `,` half of `:27`'s rule (a single space after each `,`) and the
    // declaration-order requirement, over the corpus fixture's own shape.
    expect(
      stmtDiags("let x: { ok: boolean, label: string } = 1"),
      "f2 — fields in DECLARATION order, single space after each `:` and after each `,`",
    ).toEqual([mismatch("x", "{ ok: boolean, label: string }", "integer")]);
  });

  it("f3: `<element>` at `non-string-array-join` renders `array<{ a: integer }>`", () => {
    // Element 2's SECOND reachable site (src/runtime/stdlib-array.ts's
    // `checkArrayJoin`), reached through the declared binding type bug 0083's
    // fix records (`src/parser/type-layer-checks.ts:1411–1416`, whose final arm
    // is `unfoldAlias(annotation, this.env)` at `:1416`). Under R1 that record is now the
    // `object`, so both the mismatch line and the join line render conformantly
    // in one document — the ordered pair is the assertion.
    expect(
      diags(body('let x: array<{a: integer}> = 1\nlet y = x.join(",")')),
      "f3 — the recorded binding type carries the object into the join gate, and its " +
        "`<element>` slot renders per :27 (bug 0083's recorded-type binding is what makes " +
        "this site reachable at all)",
    ).toEqual([
      mismatch("x", "array<{ a: integer }>", "integer"),
      line("error", ARRAY_JOIN, [["<element>", "{ a: integer }"]]),
    ]);
  });

  it("f4: the conversion and `displayType`, at the seam", () => {
    // The same rendering read one layer down, so a red names the conversion
    // rather than the diagnostic plumbing.
    const convert = letAnnotationConversion();
    expect(
      convert("{a:integer}"),
      "f4.1 — R1 mints CompatType's documented `object` arm (type-compat.ts:61–64)",
    ).toEqual({
      kind: "object",
      fields: [{ name: "a", type: { kind: "prim", name: "integer" } }],
    });
    expect(
      displayType(convert("{a:integer}") as CompatType),
      "f4.2 — `displayType`'s object arm was unreachable from production code before R1",
    ).toBe("{ a: integer }");
    expect(
      displayType(convert("array<{a:integer}>") as CompatType),
      "f4.3 — the `array<…>` element recursion",
    ).toBe("array<{ a: integer }>");
    expect(
      displayType(convert("{ok:boolean,label:string}") as CompatType),
      "f4.4 — the `,` join",
    ).toBe("{ ok: boolean, label: string }");
    // R1's hold, at the seam: `annotationToCompatType` is UNCHANGED, which is
    // what keeps the other four consumers and the alias-RHS site (c3) still.
    expect(
      annotationToCompatType("{a:integer}"),
      "f4.5 — the shared conversion still returns the pseudo-`named`; R1 adds a second " +
        "entry point rather than moving this one (§Fix (f), held with a stated reason)",
    ).toEqual({ kind: "named", name: "{a:integer}" });
  });
});

// ===========================================================================
// (g) Block G — downstream of bug 0083's recorded declared binding type.
//
// WHY: §Fix (g)'s constraint is to DISPOSITION the newly-reachable gates, not
// to preserve a byte. The disposition below was MEASURED against the route's
// prototype, not assumed.
// ===========================================================================

describe("bug 0130 (g) — the recorded declared binding type's downstream gates", () => {
  it("g1: `let x: {a: integer} = 1` ⏎ `let y = x[0]` now ALSO draws the index row (MEASURED)", () => {
    // MEASURED under the route's prototype, not assumed: the recorded declared
    // type (src/parser/type-layer-checks.ts:1411–1416) becomes the `object`, so
    // `classifyIndexReceiver` (src/parser/type-compat.ts:392–418) answers
    // `"object"` where it answered `"unknown"` at HEAD, and
    // `theta/parse/non-string-object-index` (code-registry-parse.md:40) fires
    // on the integer index — the SAME pair the named twin g2 draws today. That
    // is §Fix (g)'s newly-reachable gate, dispositioned: it fires, because the
    // declared type is now a genuine object type and an object index must be a
    // string theta-side name. The ORDER is the assertion too: the initialiser
    // row precedes the index row.
    expect(
      diags(body("let x: {a: integer} = 1\nlet y = x[0]")),
      "g1 — bug 0083's fix delivers at this annotation shape for the first time; the pair " +
        "must match the named twin's (g2), which is the invariance grammar.md:109 and " +
        "type-system.md:15 assert",
    ).toEqual([
      mismatch("x", "{ a: integer }", "integer"),
      line("error", OBJECT_INDEX, [["<type>", "integer"]]),
    ]);
  });

  it("g2 CONTROL: the named twin's pair is byte-unchanged", () => {
    expect(
      diags(`${FM}schema S { a: integer }\nlet x: S = 1\nlet y = x[0]\n${TAIL}`),
      "g2 — the contrast g1 is measured against, frozen",
    ).toEqual([
      mismatch("x", "S", "integer"),
      line("error", OBJECT_INDEX, [["<type>", "integer"]]),
    ]);
  });

  it("g3: the reassignment position ALSO gains reach at this annotation shape (MEASURED)", () => {
    // THE BUG DOCUMENT'S BLOCK G ROWS 4–5 ARE STALE, and this cell records the
    // correction rather than repeating them. They were measured at 0.74.0, when
    // bindings.md:12's obligation on a reassignment's RHS had no emitter and no
    // registry row (bug 0115's subject, listed under §Non-goals) — both rows
    // read `[]`. Since then bug 0115 has LANDED:
    // `theta/parse/reassign-rhs-type-mismatch` is registered
    // (code-registry-parse.md:58) and fires for the primitive spelling at HEAD
    // `85717fa8`. MEASURED under this route's prototype: it now fires for the
    // inline-object spelling too, because bug 0083's recorded declared binding
    // type (src/parser/type-layer-checks.ts:1411–1416) is the `object` the write
    // check reads. That is a THIRD newly-reachable gate under §Fix (g), and it
    // is dispositioned here as firing — the same invariance g1/g2 assert.
    expect(
      diags(body('let mut x: {a: integer} = 1\nx = "s"')),
      "g3.1 — the initialiser row (this report) and the WRITE row (bug 0115, landed) both " +
        "fire, in source order, and both render per placeholder-rendering-a.md:27",
    ).toEqual([
      mismatch("x", "{ a: integer }", "integer"),
      line("error", REASSIGN_RHS, [
        ["<name>", "x"],
        ["<expected>", "{ a: integer }"],
        ["<actual>", "string"],
      ]),
    ]);
    expect(
      diags(body('let mut x: integer = 1\nx = "s"')),
      "g3.2 CONTROL — the primitive spelling's write row is byte-unchanged by this route",
    ).toEqual([
      line("error", REASSIGN_RHS, [
        ["<name>", "x"],
        ["<expected>", "integer"],
        ["<actual>", "string"],
      ]),
    ]);
  });

  it("g4: the `for` iterand contract's `<type>` slot renders conformantly (MEASURED)", () => {
    // MEASURED, not assumed. §Fix (g) names the `for` / `par for` iterand
    // contract as a gate that reads the recorded declared binding type by
    // `kind`. Under R1 that record is the `object`, so the gate's `<type>` slot
    // renders through `displayType`'s object arm instead of the pseudo-name's
    // raw text. HEAD (pre-fix) baseline, measured on this exact document:
    //   `error theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got {a:integer}`
    // — the token-joined pseudo-name, which placeholder-rendering-a.md's
    // category 1 does not admit. The initialiser stays `f()`, whose pseudo-
    // `named` type R3 keeps deferred, so this cell isolates the message-byte
    // change at the gate and nothing else.
    expect(
      diags(body("fn f(): integer { 1 }\nlet o: {a: integer} = f()\nfor v in o { let q = 1 }")),
      "g4 — one line, the iterand refusal, now rendering `{ a: integer }`",
    ).toEqual([line("error", NON_ARRAY_ITERAND, [["<type>", "{ a: integer }"]])]);
  });

  it("g5: an array literal mixing that binding with an integer now refuses (MEASURED)", () => {
    // MEASURED, not assumed. HEAD (pre-fix) baseline for this document: `[]` —
    // the element types were the unresolvable pseudo-name and `integer`, and no
    // common type could be RULED OUT either. With the recorded type an
    // `object`, the no-common-type gate decides and refuses. Dispositioned as
    // firing: an object element and an integer element have no common type, and
    // the row's own remedy (annotate `array<A | B>`) is the author's answer.
    expect(
      diags(body("fn f(): integer { 1 }\nlet o: {a: integer} = f()\nlet z = [o, 1]")),
      "g5 — `theta/parse/array-no-common-type` at the array literal",
    ).toEqual([line("error", ARRAY_NO_COMMON, [])]);
  });

  it("g6: `let x: array<{a: integer}> = [1]` draws BOTH the initialiser and element rows (MEASURED)", () => {
    // MEASURED, not assumed. HEAD (pre-fix) baseline: `[]`. Two gates become
    // reachable at once, and the ORDER is part of the assertion: the initialiser
    // row (this report's) precedes the element row, which fires because the
    // annotation's element sink is now an `object` a literal `1` is not `⊑`.
    // Both `<expected>` slots render per placeholder-rendering-a.md:27.
    expect(
      diags(body("let x: array<{a: integer}> = [1]")),
      "g6.1 — the initialiser row at the `array<…>` sink, then the per-index element row",
    ).toEqual([
      mismatch("x", "array<{ a: integer }>", "array<integer>"),
      line("error", ARRAY_ELEMENT, [
        ["<i>", "0"],
        ["<expected>", "{ a: integer }"],
        ["<actual>", "integer"],
      ]),
    ]);
    expect(
      diags(body("fn f(): integer { 1 }\nlet x: array<{a: integer}> = [f()]")),
      "g6.2 — the deferring twin: an element whose static type is a pseudo-`named` is past " +
        "the parser's static view, so R3's deferral holds BOTH rows silent",
    ).toEqual([]);
  });
});

// ===========================================================================
// (h) Block E — the engine's branch order, over the exported functions.
//
// WHY: these rows pin §Fix (b)'s ordering decision (R3) directly, so a red here
// names `decide`'s arm order rather than any diagnostic plumbing. Row h3 FLIPS
// the bug document's measured value, and the flip is R3 itself.
// ===========================================================================

/** A hand-built inline object type — TYPE-8's operand shape. */
function obj(...fields: ReadonlyArray<readonly [string, CompatType]>): CompatType {
  return { kind: "object", fields: fields.map(([name, type]) => ({ name, type })) };
}

const INTEGER: CompatType = { kind: "prim", name: "integer" };
const NUMBER: CompatType = { kind: "prim", name: "number" };
const INTEGER_LITERAL: CompatType = { kind: "literal", typesAs: "integer" };
const UNRESOLVABLE: CompatType = { kind: "named", name: "Nope" };

function decideOn(sub: CompatType, sup: CompatType): Compatibility {
  return checkCompatible(sub, sup, {});
}

describe("bug 0130 (h) — `decide`'s branch order over TYPE-8's arm", () => {
  it("h1: `literal integer ⊑ {a: integer}` is incompatible", () => {
    // The row that settles what code-registry-parse.md:57's *Trigger* asks:
    // `1 ⋢ {a: integer}`, decided statically, with no AJV involved. This holds
    // at HEAD too — the engine has always been able to answer; nothing ever
    // handed it the operand.
    expect(decideOn(INTEGER_LITERAL, obj(["a", INTEGER])), "h1").toBe("incompatible");
  });

  it("h2: `prim null ⊑ {a: integer}` is incompatible", () => {
    // §Fix (c)'s second named GOV-15 arrival, at the relation level: TYPE-8
    // refuses a `null` sub. (`{a: integer} | null` still admits `null` through
    // TYPE-5 — cell d1.)
    expect(decideOn({ kind: "prim", name: "null" }, obj(["a", INTEGER])), "h2").toBe(
      "incompatible",
    );
  });

  it("h3: `named UNRESOLVABLE ⊑ {a: integer}` is UNKNOWN post-fix (R3 flips it)", () => {
    // PRE-FIX BASELINE, measured in the bug document's block E row 3:
    // `incompatible`, because TYPE-8's arm (src/parser/type-compat.ts:231)
    // precedes the sub-side `named` deferral (`:276–278`).
    // POST-FIX, by R3: the TYPE-8 arm gains the SAME sub-side deferral TYPE-7's
    // array arm already carries at `:219–221`, so an unresolvable `named` sub
    // against an `object` sup answers `"unknown"`. This single value is what
    // holds cells d3/d4/d5 and the GOV-15 corpus fixture d7 silent, and it is
    // the ONLY relation-level change this route makes.
    expect(
      decideOn(UNRESOLVABLE, obj(["a", INTEGER])),
      "h3 — R3: the sup-side structural test must not decide a sub past the parser's static " +
        "view (type-system.md:48), which is exactly the reason type-compat.ts:210–217 " +
        "already states for the array arm at :218–226",
    ).toBe("unknown");
  });

  it("h4: `named UNRESOLVABLE ⊑ {a: integer} | null` is unknown", () => {
    // Unchanged in both directions — the union spelling always deferred through
    // TYPE-5's `sawUnknown` accumulation. Included so h3's flip cannot be
    // mistaken for a change here.
    expect(
      decideOn(UNRESOLVABLE, { kind: "union", arms: [obj(["a", INTEGER]), { kind: "prim", name: "null" }] }),
      "h4",
    ).toBe("unknown");
  });

  it("h5: `{a: integer} ⊑ {a: integer}` is compatible (TYPE-8 reflexive)", () => {
    expect(decideOn(obj(["a", INTEGER]), obj(["a", INTEGER])), "h5").toBe("compatible");
  });

  it("h6: `{a: integer} ⊑ {a: number}` is compatible (TYPE-2 inside a field)", () => {
    expect(decideOn(obj(["a", INTEGER]), obj(["a", NUMBER])), "h6").toBe("compatible");
  });

  it("h7 CONTROL: `named UNRESOLVABLE ⊑ string` is unknown", () => {
    // The carve-out working as intended against a primitive sup — the control
    // that h3's new deferral did not have to be invented, only extended.
    expect(decideOn(UNRESOLVABLE, { kind: "prim", name: "string" }), "h7").toBe("unknown");
  });

  it("h8: the `let`-side conversion feeds TYPE-8 end to end", () => {
    // The composition h1 and the conversion cells assert separately: the
    // annotation source text, converted at the `let` site, is an operand the
    // relation refuses. Before R1 no production conversion ever produced this
    // shape, so TYPE-8 had unit coverage and no end-to-end reach at all
    // (tests/type-compat.test.ts was the only place a `kind: "object"`
    // `CompatType` existed in the repo).
    const convert = letAnnotationConversion();
    expect(
      decideOn(INTEGER_LITERAL, convert("{a:integer}") as CompatType),
      "h8 — one relation, one operand shape, one refusal",
    ).toBe("incompatible");
  });
});
