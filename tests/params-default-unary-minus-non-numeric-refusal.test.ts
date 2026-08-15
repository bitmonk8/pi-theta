import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";

// Bug 0166 — the `params:`-default literal sublanguage derives `"-" NUMBER` and
// no other unary form, so `firstNonLiteral`'s `neg` arm
// (src/parser/literal-sublanguage.ts:513–519) refuses `-true`, `-false`,
// `-null`, `-"x"`, `-'x'` and `- true` as the `neg` node itself — at the top
// level and, through the container recursion, as array elements and object
// field values. The narrowing predicate is `isNumericLiteralOperand` (:493),
// which reads the operand's own span through `literalPrimitiveOf` and admits it
// only as `integer` or `number`. Bug 0066's compat reader
// `primitiveLiteralType` (:696) applies that same predicate, so a refused form
// establishes no static type, no declared-type pairing binds a number the
// source never spells, and the invocation-time recovery never evaluates those
// bytes as JS numeric negation
// (docs/bugs/0166-unary-minus-default-admits-non-numeric-literal.md).
//
// THIS FILE IS THE WHOLE WITNESS for §Fix (e)(7): the load-time half over
// `parseDoc` (groups A, B, D, E and the mirror contract C read directly off the
// two module readers) and the runtime half over one real
// `ProductionThetaProducer.runBinder` pass per §Reproduction (e) row (group F).
//
// THE SETTLED ROUTE is §Fix (a) + (b) TOGETHER: `firstNonLiteral`'s `neg` arm
// and `primitiveLiteralType`'s `neg` arm both narrow to a NUMERIC primitive
// operand — the test `literalPrimitiveOf` already performs, a span that is
// neither quote-led nor `true` / `false` / `null` — so the is-literal check
// returns the `neg` node as the offending sub-expression and the compat reader
// establishes no type for it. §Fix (e)(2)'s mirror contract is that both readers
// move together; group C is the cell that reds if only one of them does.
//
// SPEC ANCHORS (the contract, not the shipped code):
//   - docs/spec_topics/grammar.md:20–24 — the closed production set:
//     `PrimitiveLit ::= STRING | NUMBER | "-" NUMBER | BOOLEAN | NULL`, the third
//     alternative carrying the inline comment "unary minus on a numeric literal
//     counts as a literal". There is no `"-" BOOLEAN`, `"-" STRING` or
//     `"-" NULL` alternative. :9 states the mechanism ("the parser performs an
//     'is-literal' check after parsing the AST in that position … the diagnostic
//     names the offending sub-expression"); :51 (§Forbidden inside a literal)
//     states the bound with its operand restriction in one clause: "Operators
//     other than the unary `-` carve-out for numeric literals".
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:60 (§Defaults) —
//     "Primitive literals (including unary-`-` on numeric literals) … are all
//     admitted. Operators … are not; violations are
//     `theta/parse/default-not-literal`".
//   - docs/spec_topics/expressions.md:232 (§Other arithmetic) — "`-`, `*`, `/`,
//     `%` accept only numeric operands", which is why no reading of `-true`
//     yields a boolean and the recovery's `-(value as number)` produces `-1`.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:48 — the
//     `theta/parse/default-not-literal` row (*Sev* `E`, *Phase* `parse`), whose
//     *Trigger* claims "a form outside the [Theta literal sublanguage] (operator,
//     …)" and whose *Message* interpolates the offending sub-expression. :49 —
//     `theta/parse/params-default-type-mismatch`, whose decided default set
//     names only "a unary-`-` numeric literal" among the unary shapes, and whose
//     SECOND precedence rule states where a refused default belongs: "a field
//     whose default half already drew `theta/parse/literal-newline-in-string` or
//     `theta/parse/default-not-literal` keeps that diagnostic alone — this row
//     does not run for either." :24 — `theta/parse/integer-narrowing`, the row
//     the numeric controls in group D keep.
//   - docs/spec_topics/diagnostics/code-registry-load.md:19 —
//     `theta/load/params-type-not-expression` and its third precedence rule, the
//     bug-0059 type-half suppression group E holds.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2 — the registry
//     is closed, so the *Trigger* edit in group R lands with the fix) and :74
//     (DIAG-4 — the *Message* column is normative, which is why every expected
//     message below is READ from the registry rather than restated).
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate every silent row below satisfies at this HEAD) and
//     :25 (the diagnostic-registry carve-out, which admits a code addition
//     within a 1.x minor exactly on the inputs it newly claims — the enumeration
//     §Fix (e)(5) requires is groups A and B).
//   - docs/spec_topics/binder/binder-bypass-and-envelope.md:142 (*Default-literal
//     rendering*) — the `default=<literal>` token "MUST be the field's default
//     value rendered in the [Theta literal sublanguage] surface syntax", which
//     `default=-true` is not.
//   - docs/spec_topics/binder/defaulting-system-note-echo.md:9 (fill-if-absent:
//     "when the wire name is absent, the field takes its declared default") and
//     :11 (the post-default-merge AJV hook that admits the coerced number
//     whenever the lowered fragment admits a number).
//
// MEASURED SIGNATURES AT HEAD `d2cc1fca` (offline, deterministic, provider-free;
// re-derived by scratch probe before this file was written, then deleted per
// probe policy). Every row of groups A and F loads with ZERO diagnostics and
// records its default verbatim; the six rows of group B draw exactly one
// `theta/parse/params-default-type-mismatch`; `checkLiteralSublanguage` returns
// `[]` and `defaultLiteralStaticType` returns the OPERAND's primitive for all
// six spellings of group C; and every row of groups D and E already carries the
// verdict asserted for it. The seven group-F fixtures each register, spend one
// binder model call and bind `p` to `-1`, `-0`, `-0`, `-1`, `-1`, `NaN` and
// `-1` in row order, behind the `Running /<name>: … (default)` success echo —
// the two `-0` rows reading back `0` through `String`, the negative-zero render
// divergence the bug doc's §Non-goals records.
//
// WHAT IS RED HERE AND WHY: groups A (the refusal table), B (the code flip), C
// (the two readers' agreement on the six spellings), F's six §Reproduction (e)
// rows (refused at load rather than bound) and R's *Trigger* cell. GREEN AT
// HEAD AND REQUIRED TO STAY GREEN: group D (the five over-refusal controls of
// §Fix (e)(4)), group E (the two precedence rows of §Fix (e)(3) plus bug 0165's
// boundary row), F's numeric fence, and R's *Message* cell.
//
// TIER: unit, offline, deterministic, provider-free — both halves. The load-time
// half settles inside one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts, the shipped front end wrapped in the standard inert
// deps double) plus one read of the committed registry corpus. The runtime half
// settles inside one `ProductionThetaProducer.runBinder()` call with the
// off-session pi-ai `complete()` mocked and the production `AjvSchemaValidator`
// wired (the harness pattern of tests/binder-post-merge-ajv-enforcement.test.ts),
// which is what makes "the theta does not register, so no binder pass exists"
// an observable rather than an inference. An integration tier would re-drive
// discovery to reach the same diagnostics and witness nothing further; a live
// tier adds a real binder model, and a load-time refusal is upstream of every
// model interaction — a refused theta does not register at all, so a live drive
// could not distinguish this refusal from any other load error.
//
// NO SILENT SKIPPING: `registryMessageOf` and `registryRowOf` THROW naming the
// registry page when the row they need is absent; the group-F fixture
// filesystem REJECTS an unregistered path rather than reading empty; and
// `driveIfRegistered` reports "registered" as a value that reds, never as a
// skipped drive. Every primary assertion runs BEFORE its message oracle so a
// red names the missing refusal rather than a missing registry row.

// The scripted off-session binder reply for group F. `vi.hoisted` so the
// `vi.mock` factory (hoisted above the imports) can close over a mutable holder.
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
  calls: [] as unknown[],
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export (types, helpers) passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (_model: unknown, context: unknown) => {
      scripted.calls.push(context);
      return scripted.replyFor?.(context);
    }),
  };
});

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  checkLiteralSublanguage,
  defaultLiteralStaticType,
  type LiteralPosition,
} from "../src/parser/literal-sublanguage";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// ===========================================================================
// The codes and their normative messages (DIAG-2 / DIAG-4).
// ===========================================================================

/** The refusal `grammar.md:9` names for a form outside the sublanguage. */
const NOT_LITERAL_CODE = "theta/parse/default-not-literal";

/** The type-stage row bug 0066 registered; §Fix (a) moves two inputs off it. */
const MISMATCH_CODE = "theta/parse/params-default-type-mismatch";

/** The row the numeric controls of §Fix (e)(4) keep. */
const NARROWING_CODE = "theta/parse/integer-narrowing";

/** bug 0102's rule in the same per-field loop, which owns the raw-break span. */
const NEWLINE_CODE = "theta/parse/literal-newline-in-string";

/** bug 0059's type-half refusal, which precedes every default-side check. */
const TYPE_TEXT_CODE = "theta/load/params-type-not-expression";

/** bug 0165's refusal: an empty or whitespace-only default RHS has no literal to type at all. */
const EMPTY_DEFAULT_CODE = "theta/parse/default-without-literal";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
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
 * A registry row's normative *Message* (DIAG-4), read rather than restated.
 * THROWS naming the registry page when the row is absent, so a registry drift
 * can never degrade an assertion into a comparison against `undefined`.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/** One registry row, or a loud failure naming the code. */
function registryRowOf(code: string): RegistryRow {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(
      `harness: the parsed registry holds no structured row for ${code} — DIAG-2 closes the registry, so a missing row is a harness failure, never a skip`,
    );
  }
  return row;
}

/**
 * The refusal message for one offending sub-expression. The replacement is a
 * function so a `$`-bearing span can never be read as a `String.replace`
 * substitution pattern.
 */
function notLiteralMessage(expr: string): string {
  return registryMessageOf(NOT_LITERAL_CODE).replace("<expr>", () => expr);
}

// ===========================================================================
// Fixtures and the loud readers (load-time half).
// ===========================================================================

/**
 * The declarations the deferring-declared-half rows reference. `Count` is the
 * alias whose lowered fragment admits a number — the shape §Reproduction (e)
 * measures binding `-1`, `-1` and `NaN`; `Flags` is the array-typed alias that
 * carries the same deferral into the array-element position; `Sev` and `S` are
 * the enum and schema names whose declared halves answer `"unknown"` against
 * `parseParams`'s empty compat `TypeEnv`.
 */
const BODY = [
  "enum Sev { A, B }",
  "schema Count = number",
  "schema Flags = array<boolean>",
  "schema S { a: boolean }",
  "let z = 1",
].join("\n");

/** A `mode: prompt` theta whose `params:` block is `paramsBlock`. */
function src(paramsBlock: string): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${BODY}\n`;
}

/**
 * A `params:` right-hand side wrapped as a YAML single-quoted scalar.
 * Theta-side literals carry theta-side quotes, and an unquoted spelling of a
 * text carrying a `:`, a `#` or a `{` breaks the YAML frame outright, which
 * collapses the load to a different diagnostic entirely.
 */
function paramsDoc(rhs: string): ThetaDocument {
  return parseDoc(src(`  p: '${rhs.replace(/'/g, "''")}'`), "bug0166.theta");
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** The recorded default half of field `p`, or `undefined` when the load withheld it. */
function recordedDefault(doc: ThetaDocument): string | undefined {
  return doc.frontmatter?.params?.fields.find((f) => f.wireName === "p")?.defaultSource;
}

/** The lowered `properties.p` fragment, or `undefined` when the load withheld it. */
function loweredP(doc: ThetaDocument): unknown {
  const lowered = doc.frontmatter?.params?.loweredSchema as
    | { readonly properties?: Record<string, unknown> }
    | undefined;
  return lowered?.properties?.["p"];
}

/**
 * The whole refusal contract for one offending field: EXACTLY ONE diagnostic,
 * `theta/parse/default-not-literal` at error severity, its message the
 * registry's with `<expr>` rendered as the offending sub-expression, the
 * frontmatter collapsed and the lowered document withheld.
 *
 * The count/code assertion runs FIRST so a red names the symptom bug 0166
 * reports — an operator on a non-numeric literal admitted at a position whose
 * grammar derives `"-" NUMBER` alone — rather than a downstream message shape.
 *
 * The last two expectations are the reachability link to a theta that does not
 * register: `hasLoadParseError` (src/extension/production-composition.ts) drops
 * a theta exactly when some diagnostic carries error severity and a code in the
 * `theta/load/` or `theta/parse/` namespace, and `parseParams`'s error gate
 * withholds the lowered document for the same input.
 */
function expectRefusedAsNonLiteral(label: string, doc: ThetaDocument, expr: string): void {
  expect(
    diagCodes(doc),
    `${label}: grammar.md:20–24 derives \`"-" NUMBER\` and no other unary alternative, and :51 bounds the carve-out to numeric literals, so this RHS is an operator outside the sublanguage and code-registry-parse.md:48 claims it for ${NOT_LITERAL_CODE} at a count of one. Rendered: ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([`error ${NOT_LITERAL_CODE}`]);
  const diagnostic = doc.diagnostics[0];
  if (diagnostic === undefined) {
    throw new Error(`${label}: diagnostics[0] absent after a one-element count assertion`);
  }
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's template with \`<expr>\` rendered as the offending sub-expression, which for a nested spelling is the INNER \`neg\` span the container recursion returns, not the container`,
  ).toBe(notLiteralMessage(expr));
  expect(
    diagnostic.severity,
    `${label}: the drop gate reads error severity, so a warning would leave the theta registered with a default the position's grammar does not derive`,
  ).toBe("error");
  expect(
    doc.frontmatter,
    `${label}: an error-severity params diagnostic withholds the frontmatter, which is what un-registers the theta — the observable that keeps the coerced number out of body scope`,
  ).toBeNull();
  expect(
    loweredP(doc),
    `${label}: no lowered \`params:\` fragment may survive the refusal — a surviving one is what the post-default-merge AJV hook then judges the coerced value against`,
  ).toBeUndefined();
}

// ===========================================================================
// (R) THE REGISTERED ROW (DIAG-2 / DIAG-4).
// ===========================================================================

describe("bug 0166 (R) — the row that claims the refusal", () => {
  it(`GREEN (R1): ${NOT_LITERAL_CODE} keeps its Sev / Phase / Message`, () => {
    // DIAG-4 (diagnostic-shape.md:74) defers every *Message* reword to theta
    // 2.0, so the route's spec edit must leave this column untouched. Pinning it
    // here makes a silent reword visible as one red rather than as drift across
    // every rendered message in groups A and B, which read this same template.
    const row = registryRowOf(NOT_LITERAL_CODE);
    expect(row.severity, "the drop gate acts on the Sev column; a `W` row would leave the theta registered").toBe("E");
    expect(
      row.phase,
      "the defect is that the RHS is not a literal of this sublanguage — a parse-stage fact independent of the declared half, which is why §Fix (c)'s type-layer route is disfavoured",
    ).toBe("parse");
    expect(
      registryMessageOf(NOT_LITERAL_CODE),
      "DIAG-4 — the normative template every expected message in groups A and B is rendered from",
    ).toBe(
      "params default RHS must be a literal-sublanguage form; offending sub-expression: <expr>",
    );
  });

  it(`RED (R2): the ${NOT_LITERAL_CODE} Trigger states the carve-out's numeric bound`, () => {
    // §Fix (e)(1) leaves the DIAG-2 question open and the settled route answers
    // it: the *Trigger*'s operator parenthetical states the bound the
    // sublanguage's own §Forbidden-inside-a-literal clause states
    // (grammar.md:51, "Operators other than the unary `-` carve-out for numeric
    // literals"), so the row's enumeration reads as the emission set it now
    // claims. DIAG-2 (diagnostic-shape.md:72) makes that a spec change landing
    // in the same commit; the *Message* column does not move (R1).
    expect(
      registryRowOf(NOT_LITERAL_CODE).trigger,
      `code-registry-parse.md:48's Trigger enumerates the forms outside the sublanguage but writes the operator alternative bare, so the row's own text does not say that unary \`-\` over a NUMERIC literal is the one operator inside it. Observed: ${JSON.stringify(registryRowOf(NOT_LITERAL_CODE).trigger)}`,
    ).toContain("other than the unary `-` carve-out for numeric literals");
  });
});

// ===========================================================================
// (A) THE REFUSAL TABLE (§Fix (e)(7), first clause).
// The six admitted spellings at three nesting positions, under a decidable and
// a deferring declared half. RED at HEAD: every row loads with ZERO
// diagnostics, registers, and carries a recorded default the position's grammar
// does not derive.
// ===========================================================================

/** Each row as `[label, params RHS, offending sub-expression]`. */
type RefusalRow = readonly [string, string, string];

/**
 * Top level, DECIDABLE declared half: a primitive or a union of primitives,
 * which `paramsDeclaredCompatType` resolves against the empty environment.
 * Each of these pairs an operand primitive the declared type ADMITS with an
 * operator the sublanguage does not, which is why the compat gate is silent on
 * them and the is-literal check is the only load-time judge available.
 */
const TOP_DECIDABLE: readonly RefusalRow[] = [
  ["a1 (`-true` under `boolean`)", "boolean = -true", "-true"],
  ["a2 (`-false` under `boolean`)", "boolean = -false", "-false"],
  ["a3 (`-null` under `null`)", "null = -null", "-null"],
  ['a4 (`-"x"` under `string`)', 'string = -"x"', '-"x"'],
  ["a5 (`-'x'` under `string`)", "string = -'x'", "-'x'"],
  ["a6 (`- true` — whitespace between operator and operand)", "boolean = - true", "- true"],
  ["a7 (`-true` under a union of primitives)", "integer | boolean = -true", "-true"],
  ["a8 (`-true` under a nullable boolean)", "boolean | null = -true", "-true"],
];

/**
 * Top level, DEFERRING declared half: a `NamedType`, an alias, an enum name, an
 * inline object type and a literal union all answer `"unknown"` against
 * `parseParams`'s empty compat `TypeEnv` (`paramsDeclaredCompatType`'s `named`
 * fallthrough), so the compat gate judges none of them by design. The
 * is-literal check is the position's only load-time judge for this whole half
 * of the table.
 */
const TOP_DEFERRING: readonly RefusalRow[] = [
  ["a9 (`-true` under a numeric alias)", "Count = -true", "-true"],
  ["a10 (`-false` under a numeric alias)", "Count = -false", "-false"],
  ["a11 (`-null` under a numeric alias)", "Count = -null", "-null"],
  ['a12 (`-"x"` under a numeric alias)', 'Count = -"x"', '-"x"'],
  ["a13 (`-'x'` under a numeric alias)", "Count = -'x'", "-'x'"],
  ["a14 (`- true` under a numeric alias)", "Count = - true", "- true"],
  ["a15 (`-true` under an enum name)", "Sev = -true", "-true"],
  ["a16 (`-true` under a schema name)", "S = -true", "-true"],
  ["a17 (`-true` under an inline object type)", "{ a: boolean } = -true", "-true"],
  ['a18 (`-true` under a literal union)', '"a" | "b" = -true', "-true"],
];

/**
 * ARRAY-ELEMENT position, decidable declared half. The admission rides
 * `firstNonLiteral`'s array recursion, which re-decides nothing, so the element
 * inherits the top-level verdict — and the offending sub-expression the
 * diagnostic names is the INNER `neg` span, not the container literal.
 */
const ARRAY_DECIDABLE: readonly RefusalRow[] = [
  ["a19 (`[-true]` under `array<boolean>`)", "array<boolean> = [-true]", "-true"],
  ["a20 (`[-false]` under `array<boolean>`)", "array<boolean> = [-false]", "-false"],
  ["a21 (`[-null]` under `array<null>`)", "array<null> = [-null]", "-null"],
  ['a22 (`[-"x"]` under `array<string>`)', 'array<string> = [-"x"]', '-"x"'],
  ["a23 (`[-'x']` under `array<string>`)", "array<string> = [-'x']", "-'x'"],
  ["a24 (`[- true]` under `array<boolean>`)", "array<boolean> = [- true]", "- true"],
];

/** ARRAY-ELEMENT position, deferring declared half (an array-typed alias). */
const ARRAY_DEFERRING: readonly RefusalRow[] = [
  ["a25 (`[-true]` under an array alias)", "Flags = [-true]", "-true"],
  ["a26 (`[-false]` under an array alias)", "Flags = [-false]", "-false"],
  ["a27 (`[-null]` under an array alias)", "Flags = [-null]", "-null"],
  ['a28 (`[-"x"]` under an array alias)', 'Flags = [-"x"]', '-"x"'],
  ["a29 (`[-'x']` under an array alias)", "Flags = [-'x']", "-'x'"],
  ["a30 (`[- true]` under an array alias)", "Flags = [- true]", "- true"],
];

/**
 * OBJECT-FIELD-VALUE position. Both declared-half shapes that accept an object
 * literal default — a schema name and an inline object type — defer by
 * construction, and `defaultLiteralStaticType` defers on an object literal as
 * well, so no decidable pairing exists at this nesting position and the
 * is-literal check is the only judge for every row. The offending
 * sub-expression is the field VALUE the object recursion returns.
 */
const OBJECT_FIELD: readonly RefusalRow[] = [
  ["a31 (`{ a: -true }` under a schema name)", "S = { a: -true }", "-true"],
  ["a32 (`{ a: -false }` under a schema name)", "S = { a: -false }", "-false"],
  ["a33 (`{ a: -null }` under a schema name)", "S = { a: -null }", "-null"],
  ['a34 (`{ a: -"x" }` under a schema name)', 'S = { a: -"x" }', '-"x"'],
  ["a35 (`{ a: -'x' }` under a schema name)", "S = { a: -'x' }", "-'x'"],
  ["a36 (`{ a: - true }` under a schema name)", "S = { a: - true }", "- true"],
  [
    "a37 (`{ a: -true }` under an inline object type)",
    "{ a: boolean } = { a: -true }",
    "-true",
  ],
  [
    "a38 (`{ a: -null }` under an inline object type)",
    "{ a: boolean } = { a: -null }",
    "-null",
  ],
];

const REFUSAL_GROUPS: ReadonlyArray<readonly [string, readonly RefusalRow[]]> = [
  ["top level, decidable declared half", TOP_DECIDABLE],
  ["top level, deferring declared half", TOP_DEFERRING],
  ["array element, decidable declared half", ARRAY_DECIDABLE],
  ["array element, deferring declared half", ARRAY_DEFERRING],
  ["object field value, deferring declared half", OBJECT_FIELD],
];

for (const [groupLabel, rows] of REFUSAL_GROUPS) {
  describe(`bug 0166 (A) — unary \`-\` on a non-numeric literal is refused (${groupLabel})`, () => {
    for (const [label, rhs, expr] of rows) {
      it(`RED (${label}): \`${rhs}\` draws exactly one ${NOT_LITERAL_CODE}`, () => {
        expectRefusedAsNonLiteral(label, paramsDoc(rhs), expr);
      });
    }
  });
}

describe("bug 0166 (A) — the refusal is per offending field", () => {
  it("RED (a39): two offending fields draw two diagnostics, each naming its own span", () => {
    // One diagnostic per offending FIELD, the cardinality this position already
    // holds for its other default-side refusals. Declaration order is legal —
    // both fields are defaulted, so `non-trailing-default` cannot fire and the
    // count is the per-field emission alone.
    const doc = parseDoc(
      src(`  p: 'boolean = -true'\n  q: 'string = -"x"'`),
      "bug0166.theta",
    );
    expect(
      diagCodes(doc),
      `a39: the per-field default loop judges each field's own recorded default, so two offending fields draw two. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${NOT_LITERAL_CODE}`, `error ${NOT_LITERAL_CODE}`]);
    expect(
      diagLines(doc),
      `a39: each field's diagnostic names that field's own offending sub-expression. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([
      `error ${NOT_LITERAL_CODE}: ${notLiteralMessage("-true")}`,
      `error ${NOT_LITERAL_CODE}: ${notLiteralMessage('-"x"')}`,
    ]);
  });
});

// ===========================================================================
// (B) THE CODE FLIP (§Fix (a)'s stated consequence).
// RED at HEAD: each row draws `theta/parse/params-default-type-mismatch` — a
// type-incompatibility verdict on a form the position's grammar does not
// derive, and an emission the row's own Trigger does not describe (it
// enumerates "a unary-`-` numeric literal" among the unary shapes it decides).
// ===========================================================================

/**
 * The pairings whose operand primitive is `⋢` the declared type, so bug 0066's
 * compat gate fires on the mirrored static type today. The ordering that
 * replaces it is `code-registry-parse.md:49`'s SECOND precedence rule — "a
 * field whose default half already drew … `theta/parse/default-not-literal`
 * keeps that diagnostic alone — this row does not run for either" — implemented
 * by the one-diagnostic-per-field guard at src/parser/params.ts:402–404, which
 * stops the compat check once the default half has drawn an error.
 */
const FLIPPED: readonly RefusalRow[] = [
  ["b1 (`-true` under `integer`)", "integer = -true", "-true"],
  ["b2 (`-null` under `integer`)", "integer = -null", "-null"],
  ["b3 (`-true` under `number`)", "number = -true", "-true"],
  ["b4 (`-false` under a nullable number)", "number | null = -false", "-false"],
  ["b5 (`-true` under a nullable integer)", "integer | null = -true", "-true"],
  ["b6 (`[-true]` under `array<number>`)", "array<number> = [-true]", "-true"],
];

describe(`bug 0166 (B) — a refused default half keeps ${NOT_LITERAL_CODE} alone`, () => {
  for (const [label, rhs, expr] of FLIPPED) {
    it(`RED (${label}): \`${rhs}\` moves from ${MISMATCH_CODE} to ${NOT_LITERAL_CODE}`, () => {
      const doc = paramsDoc(rhs);
      // The refusal contract first: the code, the count, the rendered span and
      // the withheld registration.
      expectRefusedAsNonLiteral(label, doc, expr);
      // The other direction of the flip, asserted explicitly rather than left
      // implicit in the count: the type-stage row does not co-fire, and it does
      // not survive alone either.
      expect(
        diagCodes(doc).filter((c) => c.endsWith(MISMATCH_CODE)),
        `${label}: code-registry-parse.md:49's second precedence rule makes ${MISMATCH_CODE} silent for a field whose default half already drew ${NOT_LITERAL_CODE}; naming an incompatible TYPE for a form with no type at this position reports the wrong defect`,
      ).toEqual([]);
    });
  }
});

// ===========================================================================
// (C) THE MIRROR CONTRACT (§Fix (e)(2)).
// The position's two readers of the same bytes must agree: a form the
// is-literal check refuses establishes no static type, and a form it admits
// types as its numeric primitive. RED at HEAD: `checkLiteralSublanguage`
// returns `[]` for all six spellings and `defaultLiteralStaticType` hands back
// the OPERAND's own primitive with the sign discarded.
// ===========================================================================

const LITERAL_SITE_RANGE: SourceRange = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 2 },
};
const LITERAL_SITE = { file: "bug0166.theta", range: LITERAL_SITE_RANGE };
const LITERAL_POSITION: LiteralPosition = "default";

/** The rendered `<code>: <message>` list for one direct is-literal call. */
function checkLines(source: string): string[] {
  return checkLiteralSublanguage(source, LITERAL_POSITION, LITERAL_SITE).map(
    (d) => `${d.code}: ${d.message}`,
  );
}

/** Every spelling the two readers must AGREE to refuse and leave untyped. */
const MIRROR_REFUSED: ReadonlyArray<readonly [string, string, string]> = [
  ["c1", "-true", "-true"],
  ["c2", "-false", "-false"],
  ["c3", "-null", "-null"],
  ["c4", '-"x"', '-"x"'],
  ["c5", "-'x'", "-'x'"],
  ["c6", "- true", "- true"],
  // The container arms carry the same verdict: the offending span is the inner
  // `neg` node, and `flatArrayStaticType` composes `primitiveLiteralType`, so a
  // refused element leaves the whole array default untyped.
  ["c7 (array element)", "[-true]", "-true"],
  ["c8 (object field value)", "{ a: -true }", "-true"],
];

/** Every spelling the two readers must AGREE to admit, with its primitive. */
const MIRROR_ADMITTED: ReadonlyArray<readonly [string, string, string]> = [
  ["c9", "-1", "integer"],
  ["c10", "-1.5", "number"],
  ["c11", "-5", "integer"],
];

describe("bug 0166 (C) — the is-literal check and the compat reader agree", () => {
  for (const [label, source, expr] of MIRROR_REFUSED) {
    it(`RED (${label}): \`${source}\` is refused AND establishes no static type`, () => {
      expect(
        checkLines(source),
        `${label}: \`firstNonLiteral\`'s \`neg\` arm (src/parser/literal-sublanguage.ts:513–519) admits \`"-" NUMBER\` and nothing else, so a string, boolean or \`null\` operand is refused as the \`neg\` node itself — grammar.md:20–24 derives no other unary alternative, and §"Forbidden inside a literal" bounds it as "Operators other than the unary \`-\` carve-out for numeric literals"`,
      ).toEqual([`${NOT_LITERAL_CODE}: ${notLiteralMessage(expr)}`]);
      expect(
        defaultLiteralStaticType(source),
        `${label}: \`primitiveLiteralType\`'s design note (the doc-comment above src/parser/literal-sublanguage.ts:696) binds this reader to the is-literal verdict, and both \`neg\` arms narrow through the one shared \`isNumericLiteralOperand\` (:493), so a refused form must carry no type — this cell reds if the two readers ever narrow apart`,
      ).toBeUndefined();
    });
  }

  for (const [label, source, primitive] of MIRROR_ADMITTED) {
    it(`GREEN (${label}): \`${source}\` is admitted AND types as \`${primitive}\``, () => {
      expect(
        checkLines(source),
        `${label}: \`"-" NUMBER\` is the carve-out grammar.md:20–24 derives; a refusal here is over-refusal on the one unary form the sublanguage admits`,
      ).toEqual([]);
      expect(
        defaultLiteralStaticType(source),
        `${label}: the admitted form keeps the static type the compat gate pairs with the declared half (\`literalPrimitiveOf\`, src/parser/literal-sublanguage.ts:754, splits \`integer\` from \`number\` on the fractional part)`,
      ).toEqual({ kind: "literal", typesAs: primitive });
    });
  }
});

// ===========================================================================
// (D) THE OVER-REFUSAL CONTROLS (§Fix (e)(4)). GREEN at HEAD and required to
// stay green: the numeric carve-out keeps its exact verdicts.
// ===========================================================================

describe("bug 0166 (D) — the numeric carve-out keeps its verdicts", () => {
  it("GREEN (d1): `integer = -1` loads clean, records `-1` and lowers `{\"type\":\"integer\"}`", () => {
    const doc = paramsDoc("integer = -1");
    expect(
      diagLines(doc),
      "d1: `\"-\" NUMBER` is the sublanguage's own carve-out; refusing it would refuse the production grammar.md:20–24 derives",
    ).toEqual([]);
    expect(
      recordedDefault(doc),
      "d1: the recorded default half is what `binderPromptParamField` renders after `default=` and what `#recoverDeclaredDefaults` re-parses at invocation",
    ).toBe("-1");
    expect(loweredP(doc), "d1: the lowered fragment the post-merge AJV hook validates against").toEqual({
      type: "integer",
    });
  });

  it("GREEN (d2): `number = -1.5` loads clean", () => {
    expect(
      diagLines(paramsDoc("number = -1.5")),
      "d2: a unary-minus decimal is a `number` literal of the carve-out and its declared half admits it",
    ).toEqual([]);
  });

  it(`GREEN (d3): \`integer = -1.5\` draws exactly one ${NARROWING_CODE}`, () => {
    // The direction frontmatter-fields-a.md:60 names by code, pinned as a
    // unary-minus row by cell b2 of tests/params-default-type-compat.test.ts:396,
    // whose label states the premise this file narrows ("the sublanguage admits
    // it"). The premise survives for a NUMERIC operand, so that cell stays green
    // and the compat gate keeps reaching this row.
    const doc = paramsDoc("integer = -1.5");
    expect(
      diagCodes(doc),
      `d3: the operand is numeric, so the is-literal check admits and the compat gate is still the judge. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${NARROWING_CODE}`]);
    expect(
      doc.diagnostics[0]?.message,
      "d3: DIAG-4 — the registered row's Message, which carries no placeholder",
    ).toBe(registryMessageOf(NARROWING_CODE));
  });

  it(`GREEN (d4): \`checkLiteralSublanguage("-5", …)\` draws no ${NOT_LITERAL_CODE}`, () => {
    // The carve-out's positive control, held identically by
    // tests/e2e-s1-grammar-literal-sublang.test.ts:26–32 (REQ-GRAM-2). Restated
    // here so a narrowing that over-reached reds inside its own witness file.
    expect(
      checkLines("-5"),
      "d4: REQ-GRAM-2 — `PrimitiveLit` admits `-NUMBER`, so the one unary form the sublanguage derives must stay admitted",
    ).toEqual([]);
  });

  it(`GREEN (d5): \`array<integer> = [1.5]\` draws exactly one ${NARROWING_CODE}`, () => {
    // TYPE-7's element-wise covariance through `flatArrayStaticType`, pinned by
    // cell b3 of tests/params-default-type-compat.test.ts:397. A narrowing that
    // reached `primitiveLiteralType` for NUMERIC operands would collapse the
    // element type and silence this row.
    const doc = paramsDoc("array<integer> = [1.5]");
    expect(
      diagCodes(doc),
      `d5: the element is a numeric literal, so the flat-array reader still establishes \`array<number>\` and the narrowing direction is decided. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${NARROWING_CODE}`]);
  });

  it("GREEN (d6): a flat array of unary-minus numerics loads clean", () => {
    // The array arm of the carve-out: the container recursion must keep
    // admitting numeric `neg` elements, which is the direction cell d5 cannot
    // show because its element carries no operator.
    expect(
      diagLines(paramsDoc("array<integer> = [-1, -2]")),
      "d6: every element is `\"-\" NUMBER`, the production the sublanguage derives",
    ).toEqual([]);
  });
});

// ===========================================================================
// (E) PRECEDENCE AND BOUNDARY (§Fix (e)(3)). GREEN at HEAD and required to
// stay green: the new refusal sits BEHIND the position's existing guards.
// ===========================================================================

describe("bug 0166 (E) — the refusal sits behind the position's guards", () => {
  it(`GREEN (e1): junk TYPE text with a \`-true\` default keeps ${TYPE_TEXT_CODE} alone`, () => {
    // bug 0059's suppression guard (src/parser/params.ts:349, `typeRefused`;
    // code-registry-load.md:19's third precedence rule): a field whose type half
    // spells no type expression is reported as such, "not by whatever its
    // default half's literal check makes of the same field's recovered bytes".
    // The guard `continue`s before the default-side checks run, so a refusal
    // added inside that loop cannot join it — and the count must stay one, as
    // cell f1 of tests/params-scalar-nontype-text-refusal.test.ts:1075 holds
    // through `expectTextRefused` (:312).
    const doc = paramsDoc("lol wut = -true");
    expect(
      diagCodes(doc),
      `e1: the type half is judged first and alone; a second diagnostic here would give the author two reports for one mistake. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${TYPE_TEXT_CODE}`]);
  });

  it(`GREEN (e2): a raw break inside a negated string span keeps ${NEWLINE_CODE} first`, () => {
    // bug 0102's rule owns the string SPAN and runs BEFORE the is-literal check
    // in the same per-field loop (src/parser/params.ts:380 then :390), so its
    // diagnostic keeps the position it holds today. The two rules are
    // independent pushes — only the compat row at :405–413 sits behind the
    // one-diagnostic guard — so this cell pins the ORDER and the compat row's
    // absence, not a total count the settled route does not bound.
    const doc = parseDoc(src('  p: |\n    string = -"a\n    b"'), "bug0166.theta");
    expect(
      diagCodes(doc)[0],
      `e2: the raw-break refusal keeps priority where it applies. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(`error ${NEWLINE_CODE}`);
    expect(
      diagCodes(doc).filter((c) => c.endsWith(MISMATCH_CODE)),
      `e2: code-registry-parse.md:49's second precedence rule names ${NEWLINE_CODE} as well, so the type-stage row does not run for this field either. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([]);
  });

  it("GREEN (e3): an EMPTY default half draws bug 0165's refusal, not this file's own code — the disjoint arm, restated", () => {
    // WHY THIS CELL CHANGED: bug 0166's own coordination note on bug 0165's
    // doc names this cell as one "a route here reds … knowingly" — bug 0165's
    // fix is that route (per the 0056/0059 discipline). The separating
    // observable is unchanged: `ExprParser.parse()` yields NO node for an
    // empty default, so `checkLiteralSublanguage` returns before
    // `firstNonLiteral` runs and this file's `neg`-arm narrowing is never
    // reached for it. What changed is that the declaration is now refused ONE
    // SEAM EARLIER, at the declaration position, before the is-literal check
    // this file's own code depends on ever runs — so `NOT_LITERAL_CODE` stays
    // absent for empty text exactly as it did before bug 0165's fix, and the
    // load is no longer silent. Cell c7 of
    // tests/params-default-type-compat.test.ts pins the same row's new
    // verdict.
    const doc = paramsDoc("string = ");
    expect(
      diagCodes(doc),
      `e3: bug 0165's fix refuses the declaration before the is-literal check runs. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${EMPTY_DEFAULT_CODE}`]);
    expect(
      diagLines(doc),
      "e3: DIAG-4 — the rendered message is the registry row's template with `<field>` rendered as the field's own name",
    ).toEqual([`error ${EMPTY_DEFAULT_CODE}: ${registryMessageOf(EMPTY_DEFAULT_CODE).replace("<field>", () => "p")}`]);
    expect(
      diagCodes(doc).some((c) => c.endsWith(NOT_LITERAL_CODE)),
      "e3: this file's own code must not co-fire — the no-node arm never reaches `firstNonLiteral` whichever code now claims the input",
    ).toBe(false);
    expect(
      recordedDefault(doc),
      "e3: an error-severity params diagnostic withholds the WHOLE frontmatter object (src/parser/frontmatter.ts:1271-1273), the same disposition this file's own `expectRefusedAsNonLiteral` already asserts for its own refusals — so the field record does not survive either; the row's recorded default is no longer readable, which is a stronger disposition than 'a different spelling' and is the correct contract now that the declaration itself is refused",
    ).toBeUndefined();
  });
});

// ===========================================================================
// Group F harness — the runtime tier (the
// tests/binder-post-merge-ajv-enforcement.test.ts production-producer pattern).
// ===========================================================================

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

/** A captured `pi.sendMessage` custom message. */
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
}

/**
 * The drive fixtures' body. `Count` is the alias whose lowered `{"type":
 * "number"}` fragment admits every coerced value the recovery produces —
 * including `NaN`, which AJV accepts as a number and `JSON.stringify` renders
 * `null`.
 */
const DRIVE_BODY = ["schema Count = number", "@`t=${topic} p=${p}`", ""].join("\n");

/**
 * A `mode: prompt` theta with one REQUIRED field and one defaulted field — the
 * shape that forces a genuine binder pass (two params, so
 * `classifyBinderBypass` returns `binder`) and leaves the defaulted field out of
 * the lowered `required`, which is why the binder's `ok` arm may omit it and the
 * post-default-merge hook is the only place the filled value is judged.
 */
function driveTheta(rhs: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: binder-model",
    "params:",
    "  topic: string",
    `  p: '${rhs.replace(/'/g, "''")}'`,
    "---",
    DRIVE_BODY,
  ].join("\n");
}

/** Each drive row as `[label, slash name, params RHS]`. */
type DriveRow = readonly [string, string, string];

/** The six rows §Reproduction (e) measures BINDING a value the source never spells. */
const BOUND_ROWS: readonly DriveRow[] = [
  ["f1 (`-true` under a union with a numeric arm)", "b166a", "integer | boolean = -true"],
  ["f2 (`-null` under a nullable number)", "b166b", "number | null = -null"],
  ["f3 (`-null` under a nullable integer)", "b166c", "integer | null = -null"],
  ["f4 (`-true` under a numeric alias)", "b166d", "Count = -true"],
  ["f5 (`- true` under a numeric alias)", "b166e", "Count = - true"],
  ['f6 (`-"x"` under a numeric alias)', "b166f", 'Count = -"x"'],
];

/** The over-fire fence: a conformant numeric default that must keep binding. */
const NUMERIC_FENCE: DriveRow = ["f7 (the numeric control)", "b166g", "integer = -1"];

const DRIVE_ROWS: readonly DriveRow[] = [...BOUND_ROWS, NUMERIC_FENCE];

/** `sourcePath` → source, backing the root double's in-memory `fileSystem`. */
const FIXTURE_SOURCES: ReadonlyMap<string, string> = new Map(
  DRIVE_ROWS.map(([, name, rhs]) => [`/theta/${name}.theta`, driveTheta(rhs)] as const),
);

function parseDepsForDrive(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/**
 * The production AJV validator, wired with the same JSON.stringify
 * content-addressing the shipped composition root uses, so the envelope AJV at
 * the routing step and the post-default-merge hook validate exactly as
 * production does.
 */
function realAjvValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

/**
 * A runtime-root double sufficient for a binder pass: noop checkpoint,
 * deterministic ids, wall-clock zero, the REAL AJV validator, and an in-memory
 * fs resolving the fixture sources by `sourcePath`. An unregistered path REJECTS
 * loudly — a silent empty read would make a defaults-recovery failure look like
 * a clean merge and hide the very fill this group measures.
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: realAjvValidator(),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> => {
        const source = FIXTURE_SOURCES.get(path);
        return source !== undefined
          ? Promise.resolve(new TextEncoder().encode(source))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`));
      },
    },
  } as unknown as RuntimeRoot;
}

/** A production producer wired with a capturing `pi.sendMessage`. */
function producerWithCapture(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote[];
} {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [
      {
        id: "binder-model",
        provider: "anthropic-messages",
        api: "anthropic-messages",
        strictCapable: true,
      },
    ],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}

/**
 * Script a ToolCall reply carrying the `ok` envelope the binder's own system
 * prompt asks for — the defaulted field OMITTED — naming whatever forced tool
 * production attached on the captured call, so the reply matches the slug
 * production derives for this fixture's envelope schema.
 */
function scriptOkEnvelopeOmittingDefault(): void {
  scripted.replyFor = (context) => {
    const tools = (context as { readonly tools?: ReadonlyArray<{ readonly name?: unknown }> })
      .tools;
    const toolName = tools?.[0]?.name;
    if (typeof toolName !== "string") {
      throw new Error(
        "the binder call attached no forced tool, so no ToolCall reply can name it — the harness cannot script an envelope",
      );
    }
    return {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tc-1",
          name: toolName,
          arguments: { envelope: { kind: "ok", args: { topic: "hello" } } },
        },
      ],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}

/** What one fixture did when the shipped load path and binder were handed it. */
interface DriveOutcome {
  /** The one-line disposition: the assertion subject of every cell in group F. */
  readonly summary: string;
  readonly diagnostics: readonly string[];
  readonly binderCalls: number;
  readonly notes: readonly string[];
}

/**
 * Parse a fixture through the shipped whole-file parser and, ONLY when it
 * registers, drive one real binder pass over it.
 *
 * The registration verdict is a VALUE in `summary`, never a skipped drive: a
 * fixture that registers is driven and reports what it bound, which is what
 * makes a red name the coerced value rather than an absent test.
 */
async function driveIfRegistered(name: string, source: string): Promise<DriveOutcome> {
  scripted.calls = [];
  scriptOkEnvelopeOmittingDefault();
  const thetaSource: ThetaSource = {
    path: `${name}.theta`,
    bytes: new TextEncoder().encode(source),
  };
  const doc = parseThetaDocument(thetaSource, parseDepsForDrive());
  const diagnostics = doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
  if (doc.frontmatter === null) {
    return { summary: "refused at load", diagnostics, binderCalls: 0, notes: [] };
  }
  const { deps, notes } = producerWithCapture();
  const theta: ThetaCompositionInput = {
    slashName: name,
    sourcePath: `/theta/${name}.theta`,
    frontmatter: doc.frontmatter,
    body: doc.body,
    binderModel: "binder-model",
  };
  const result = await deps.runBinder({
    theta,
    args: "hello",
    ctx: {} as unknown as ExtensionCommandContext,
  });
  const channel = notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL).map((n) => n.content);
  return {
    summary: `registered and driven; bound=${String(result.bound)}; p=${String(
      result.args?.["p"],
    )}; binder calls=${scripted.calls.length}`,
    diagnostics,
    binderCalls: scripted.calls.length,
    notes: channel,
  };
}

// ===========================================================================
// (F) THE RUNTIME TIER (§Fix (e)(7), second half).
// RED at HEAD for the six §Reproduction (e) rows: each registers, spends one
// binder model call and binds a numeric negation of a source the position's
// grammar does not derive, behind a `default=-true` prompt token and a
// `p=-1 (default)` success echo. The refusal-at-load observable is what makes
// this S1.
// ===========================================================================

describe("bug 0166 (F) — the bound rows do not reach the binder at all", () => {
  for (const [label, name, rhs] of BOUND_ROWS) {
    it(`RED (${label}): \`${rhs}\` is refused at load, so no binder pass exists`, async () => {
      const outcome = await driveIfRegistered(name, driveTheta(rhs));

      // THE PRIMARY ASSERTION. `defaulting-system-note-echo.md:9` says the field
      // "takes its declared default" when the wire name is absent; the recovery
      // evaluates unary `-` as JS numeric negation, so the value that arrives is
      // a number for every spelling in this class. Refusing the DECLARATION is
      // what removes the record the recovery re-reads, and
      // `binder-bypass-and-envelope.md:142` says the same about the prompt token:
      // `default=-true` is not a literal-sublanguage rendering of anything.
      expect(
        outcome.summary,
        `${label}: the theta must not register, so the merged args never carry a value the source does not spell`,
      ).toBe("refused at load");

      // The load-time observable the refusal rests on, and the binder-side one
      // it produces. Both hold in either direction of the fix, so they are
      // secondary rather than the subject.
      expect(
        outcome.diagnostics,
        `${label}: the refusal is the parse-stage row that claims the form (code-registry-parse.md:48)`,
      ).toEqual([`error ${NOT_LITERAL_CODE}`]);
      expect(
        outcome.binderCalls,
        `${label}: a theta that does not register spends no binder model call — the cost this class pays today for a defect that is decidable at load`,
      ).toBe(0);
      expect(
        outcome.notes,
        `${label}: no \`Running /<name>: …\` success echo, because there is no invocation to echo`,
      ).toEqual([]);
    });
  }

  it(`GREEN (${NUMERIC_FENCE[0]}): \`${NUMERIC_FENCE[2]}\` still binds \`-1\` with the \`(default)\` echo`, async () => {
    // The over-fire fence. Without it, every red above could be explained by
    // "no fixture in this harness ever binds" rather than by the refusal under
    // test. `"-" NUMBER` is the carve-out the sublanguage derives, so this row
    // must keep loading, keep spending its one binder call, and keep filling the
    // declared default (defaulting-system-note-echo.md:9).
    const [label, name, rhs] = NUMERIC_FENCE;
    const outcome = await driveIfRegistered(name, driveTheta(rhs));

    expect(
      outcome.summary,
      `${label}: a conformant numeric default registers, binds and echoes; a refusal here is over-refusal on the one unary form grammar.md:20–24 derives`,
    ).toBe("registered and driven; bound=true; p=-1; binder calls=1");
    expect(
      outcome.diagnostics,
      `${label}: the fixture loads with no diagnostic at all`,
    ).toEqual([]);
    expect(
      outcome.notes,
      `${label}: the BND-1 success echo is the only note on a clean merge, with the \`(default)\` tag firing exactly when the wire name was absent`,
    ).toEqual([`Running /${name}: topic=hello, p=-1 (default)`]);
  });
});
