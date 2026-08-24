import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";

// Bug 0175 — the literal sublanguage's parser has no end-of-input requirement,
// so a `params:` default RHS is judged on its LEADING expression alone.
// `ExprParser.parse()` (src/parser/literal-sublanguage.ts:286–290) tests only
// `this.peek() === undefined` and then returns `parseTernary()`'s node; every
// loop below it breaks on a token it cannot consume — `parseBinary` on a
// non-`punct` token or a `punct` with no precedence (:321),
// `parsePostfix` on anything but `.`, `(`, `[` (:353),
// `parseArray` / `parseObjectBody` at their closing bracket (:457, :474). The
// cursor's final position (`pos`, :265) is tracked and read by the shared
// `residueOf` helper: `checkLiteralSublanguage` (:54) returns one
// `default-not-literal` diagnostic naming the residue, and
// `defaultLiteralStaticType` (:706) returns
// `undefined`, for sources whose remaining tokens the position's grammar does
// not derive — the contract this file's 100 cells lock:
// `integer = 1 2` must not bind `1`, `string = "a" "b"` must not bind `"a"`,
// `array<integer> = [1] x` must not bind `[1]`, `S = { a: 1 } x` must not bind `{a: 1}`, and
// `integer = 0x10` must not bind `16` — a hex form lexical.md:28 assigns to
// `theta/parse/unsupported-feature`
// (docs/bugs/0175-literal-sublanguage-parser-ignores-trailing-tokens.md).
//
// THIS FILE IS THE WHOLE OFFLINE WITNESS for §Fix (e)(7): the direct-seam half
// (groups A and B, the two default-position readers), the load-time half over
// `parseDoc` (group C), the over-refusal fence (group D) and the runtime half
// over one real `ProductionThetaProducer.runBinder` pass per §Reproduction (e)
// row (group E).
//
// THE SETTLED ROUTE IS §Fix (a): one shared module-local end-of-input predicate
// in src/parser/literal-sublanguage.ts, applied at BOTH default-position entry
// points — `checkLiteralSublanguage` (:54) emits
// `theta/parse/default-not-literal` naming the RESIDUE, and
// `defaultLiteralStaticType` (:706) returns `undefined`.
// `ExprParser.parse()` (:286) is NOT changed, so
// `isBareObjectLiteral` (:98) keeps its four
// committed verdicts and `{ a: 1 } x` stays `true` (group D); `tokeniseExpr`
// (:130) is NOT changed, so bug 0102's shared-scanner fence holds by
// construction. The diagnostic's `<expr>` placeholder renders THE RESIDUE SPAN
// — from the first unconsumed token's start through the end of source, trimmed
// — and the *Message* column does not move (DIAG-4), which is why every
// expected message below is READ from the registry row rather than restated.
//
// SPEC ANCHORS (the contract, not the shipped code):
//   - docs/spec_topics/grammar.md:14, :20–24 — `Literal` and `PrimitiveLit` are
//     a closed production set (`PrimitiveLit ::= STRING | NUMBER | "-" NUMBER |
//     BOOLEAN | NULL`). A production derives a terminal string, not a prefix of
//     one: no alternative derives `NUMBER NUMBER`, `STRING STRING`,
//     `BOOLEAN BOOLEAN`, `ArrayLit Ident` or `NUMBER Ident`, and no container
//     production (`ArrayLit`, :28) admits a suffix after its closing bracket.
//   - docs/spec_topics/grammar.md:9 — the mechanism: "the parser performs an
//     'is-literal' check after parsing the AST in that position … the
//     diagnostic names the offending sub-expression". The check is specified
//     over the AST of the RHS, singular; a parse covering a prefix and leaving
//     the rest unexamined does not discharge it. :48, :51 (§Forbidden inside a
//     literal) — the forbidden set includes operators outside the unary-`-`
//     carve-out, calls, `${...}` interpolation and `@`...`` templates, forms
//     that appear as measured residues (`1 foo(2)`, `1 ${x}`, `` 1 @`q` ``).
//   - docs/spec_topics/lexical.md:28 (§Number literals) — "Decimal only", so
//     `PrimitiveLit ::= NUMBER` derives neither `0x10` nor `1_000`; those forms
//     "surface as `theta/parse/unsupported-feature`" in the position that lexes
//     with the theta lexer, which is why admitting them here as a value is a
//     refusal the source-language owes and not a leniency.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:60 (§Defaults) — the
//     RHS "is parsed by the **Theta literal sublanguage** … restricted to the
//     production set normatively defined in [Grammar Appendix]". The RHS is the
//     literal, whole; the sentence provides no reading under which a suffix is
//     ignored.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:48 — the
//     `theta/parse/default-not-literal` row (*Sev* `E`, *Phase* `parse`), whose
//     *Message* interpolates the offending sub-expression. :50 —
//     `theta/parse/params-default-type-mismatch`, whose SECOND precedence rule
//     states where a residue-carrying default belongs: a field whose default
//     half already drew `theta/parse/default-not-literal` "keeps that
//     diagnostic alone — this row does not run for either". That rule is the
//     code flip in group C. :24 — `theta/parse/integer-narrowing`, the row the
//     numeric controls in group D keep.
//   - docs/spec_topics/diagnostics/code-registry-load.md:19 —
//     `theta/load/params-type-not-expression` and its third precedence rule,
//     the bug-0059 type-half suppression group D holds.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2 — the
//     registry is closed, so any *Trigger* widening lands with the fix) and :74
//     (DIAG-4 — the *Message* column is normative and does not move here).
//   - docs/spec_topics/governance/source-language-stability.md:5 (GOV-15), :9
//     (the loads-cleanly predicate every residue row below satisfies at this
//     HEAD) and :25 (the diagnostic-registry carve-out, which admits the
//     addition direction exactly on the inputs newly claimed — the enumeration
//     §Fix (e)(5) requires is groups A and C).
//   - docs/spec_topics/binder/binder-bypass-and-envelope.md:142 (*Default-literal
//     rendering*) — the `default=<literal>` token "MUST be the field's default
//     value rendered in the [Theta literal sublanguage] surface syntax", which
//     `default=1 2` and `default=0x10` are not.
//   - docs/spec_topics/binder/defaulting-system-note-echo.md:9 (fill-if-absent)
//     and :11 (the post-default-merge AJV hook, which admits every truncated
//     value its lowered fragment admits — the reason group E's rows bind rather
//     than fail).
//
// MEASURED SIGNATURES AT HEAD `e5d760bd` (v0.139.0; offline, deterministic,
// provider-free; re-derived by scratch probe before this file was written, then
// deleted per probe policy):
//   - every residue spelling in `RESIDUE_ROWS` returns `check []` from
//     `checkLiteralSublanguage`, including the two nested spellings `[1 2]` and
//     `{ a: 1 2 }`, which are admitted exactly as the top-level ones are;
//   - `defaultLiteralStaticType` returns the LEADING literal's primitive for
//     every row except the two object-literal spellings (`{ a: 1 } x`,
//     `{ a: 1 2 }`), where the object arm defers and `undefined` is already the
//     answer;
//   - every load row loads with ZERO diagnostics and records its
//     residue-carrying span verbatim, EXCEPT `string = 1x` (which draws
//     `params-default-type-mismatch: expected string, got integer`) and
//     `integer = null null` (`expected integer, got null`) — the two code-flip
//     cells;
//   - the residue spans this file pins are derived from `tokeniseExpr`'s own
//     boundaries: `0x10` scans as the number `0` plus the identifier `x10` and
//     `1_000` as `1` plus `_000` (the numeric scan takes `[0-9.eE]` only,
//     :207–215), so their residues are `x10` and `_000`; the two nested
//     spellings stop inside their container and their residues carry the
//     unconsumed closing bracket (`2]`, `2 }`);
//   - group E's seven fixtures each register, spend one binder model call and
//     bind `1`, `"a"`, `true`, `[1]`, `{a: 1}`, `16` and `-1` in row order.
//
// WHAT IS RED HERE AND WHY: group A (the is-literal check admits every residue
// spelling), group B (the compat reader types 24 of the 26), group C (every
// load row is silent, and two draw the wrong code), and group E (the
// §Reproduction (e) rows register and bind instead of being refused at load).
// GREEN AT HEAD AND REQUIRED TO STAY GREEN: group B's two object-literal cells,
// group D in its entirety (§Fix (e)(4)'s over-refusal fence, the bug-0059
// suppression of §Fix (e)(3), `isBareObjectLiteral`'s four verdicts and the
// three fence spans), group E's conformant control, and group R.
//
// TIER: unit, offline, deterministic, provider-free — both halves. The
// direct-seam and load-time halves settle inside one `checkLiteralSublanguage`
// / `defaultLiteralStaticType` call over a string and one `parseThetaDocument`
// call over a source (`parseDoc`, tests/helpers/e2e-s1.ts, the shipped front end
// wrapped in the standard inert deps double), plus one read of the committed
// registry corpus. The runtime half settles inside one
// `ProductionThetaProducer.runBinder()` call with the off-session pi-ai
// `complete()` mocked and the production `AjvSchemaValidator` wired, which is
// what makes "the theta does not register, so no binder pass exists" an
// observable rather than an inference. An integration tier would re-drive
// discovery to reach the same diagnostics and witness nothing further; a live
// tier adds a real binder model, and a load-time refusal is upstream of every
// model interaction — a refused theta does not register at all, so a live drive
// could not distinguish this refusal from any other load error.
//
// NO SILENT SKIPPING: `registryMessageOf` and `registryRowOf` THROW naming the
// registry page when the row they need is absent; the group-E fixture
// filesystem REJECTS an unregistered path rather than reading empty; and
// `driveIfRegistered` reports "registered" as a value that reds, never as a
// skipped drive.

// The scripted off-session binder reply for group E. `vi.hoisted` so the
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
  isBareObjectLiteral,
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

/** bug 0059's type-half refusal, which precedes every default-side check. */
const TYPE_TEXT_CODE = "theta/load/params-type-not-expression";

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
 * function so a `$`-bearing span (`${x}`) can never be read as a
 * `String.replace` substitution pattern.
 */
function notLiteralMessage(expr: string): string {
  return registryMessageOf(NOT_LITERAL_CODE).replace("<expr>", () => expr);
}

// ===========================================================================
// The residue table — one row per spelling, with the span the diagnostic names.
// ===========================================================================

/**
 * A residue row as `[label, default RHS as written, residue span]`.
 *
 * The residue span is the settled route's rendering of `<expr>`: from the first
 * unconsumed token's start through the end of source, trimmed. Every span below
 * is derived from `tokeniseExpr`'s own boundaries
 * (src/parser/literal-sublanguage.ts:130 — bug 0175 §Fix (a)
 * added the residue predicate ahead of it in the file) and the point at which
 * the descent stops, which is why the numeric-tail rows carry a residue the
 * theta lexer would not produce (`x10`, `b101`, `o17`, `_000`): this module's
 * numeric scan accepts `[0-9]`, `.`, `e`, `E` only (:215–224), so `0x10` is the
 * number `0` followed by the identifier `x10`.
 */
type ResidueRow = readonly [string, string, string];

/** Residue after a numeric literal whose tail this module's scanner splits off. */
const NUMERIC_TAIL: readonly ResidueRow[] = [
  ["r1 (`-1x`)", "-1x", "x"],
  ["r2 (`1x`)", "1x", "x"],
  ["r3 (`-1 x`)", "-1 x", "x"],
  ["r4 (`1.5x`)", "1.5x", "x"],
  ["r5 (`0x10` — hex, lexical.md:28)", "0x10", "x10"],
  ["r6 (`0b101` — binary)", "0b101", "b101"],
  ["r7 (`0o17` — octal)", "0o17", "o17"],
  ["r8 (`1_000` — underscore separator)", "1_000", "_000"],
];

/** Residue that is itself a second literal — the shapes with no operator at all. */
const SECOND_LITERAL: readonly ResidueRow[] = [
  ["r9 (`1 2`)", "1 2", "2"],
  ["r10 (`-1 2`)", "-1 2", "2"],
  ['r11 (`"a" "b"`)', '"a" "b"', '"b"'],
  ["r12 (`true false`)", "true false", "false"],
  ["r13 (`null null`)", "null null", "null"],
  ["r14 (`-1 true`)", "-1 true", "true"],
];

/** Residue after a container literal's closing bracket. */
const AFTER_CONTAINER: readonly ResidueRow[] = [
  ["r15 (`[1] x`)", "[1] x", "x"],
  ["r16 (`{ a: 1 } x`)", "{ a: 1 } x", "x"],
];

/** Residue that is one of the forms `grammar.md:51` names as forbidden. */
const FORBIDDEN_FORM: readonly ResidueRow[] = [
  ["r17 (`1 foo(2)` — a call)", "1 foo(2)", "foo(2)"],
  ['r18 (`"a" junk here` — identifiers)', '"a" junk here', "junk here"],
  ["r19 (`` 1 @`q` `` — a query template)", "1 @`q`", "@`q`"],
  ["r20 (`1 ${x}` — an interpolation)", "1 ${x}", "${x}"],
];

/** Residue that is stray punctuation or a comment-like tail. */
const STRAY_TAIL: readonly ResidueRow[] = [
  ["r21 (`-5 # trailing`)", "-5 # trailing", "# trailing"],
  ["r22 (`1;`)", "1;", ";"],
  ["r23 (`-1)`)", "-1)", ")"],
  ["r24 (`-1]`)", "-1]", "]"],
];

/**
 * Residue at a NESTED position: the descent stops INSIDE the container, so the
 * container's own closing bracket is itself unconsumed and rides in the
 * residue span. `parseArray` breaks when the token after an element is neither
 * `,` nor `]` (:457) and `parseObjectBody` likewise (:474), each returning a
 * node whose `end` is the last element's end — which is why these two rows are
 * admitted at HEAD exactly as the top-level ones are, and why their residue is
 * `2]` / `2 }` rather than `2`.
 */
const NESTED: readonly ResidueRow[] = [
  ["r25 (`[1 2]` — array element)", "[1 2]", "2]"],
  ["r26 (`{ a: 1 2 }` — object field value)", "{ a: 1 2 }", "2 }"],
];

const RESIDUE_GROUPS: ReadonlyArray<readonly [string, readonly ResidueRow[]]> = [
  ["a numeric tail this module's scanner splits off", NUMERIC_TAIL],
  ["a second literal", SECOND_LITERAL],
  ["a suffix after a container literal", AFTER_CONTAINER],
  ["a form §Forbidden inside a literal names", FORBIDDEN_FORM],
  ["stray punctuation or a comment-like tail", STRAY_TAIL],
  ["a nested position, container bracket unconsumed", NESTED],
];

const ALL_RESIDUE_ROWS: readonly ResidueRow[] = RESIDUE_GROUPS.flatMap(([, rows]) => rows);

// ===========================================================================
// Direct-seam readers.
// ===========================================================================

const LITERAL_SITE_RANGE: SourceRange = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 2 },
};
const LITERAL_SITE = { file: "bug0175.theta", range: LITERAL_SITE_RANGE };
const LITERAL_POSITION: LiteralPosition = "default";

/** The rendered `<code>: <message>` list for one direct is-literal call. */
function checkLines(source: string): string[] {
  return checkLiteralSublanguage(source, LITERAL_POSITION, LITERAL_SITE).map(
    (d) => `${d.code}: ${d.message}`,
  );
}

// ===========================================================================
// Load-time fixtures and the loud readers.
// ===========================================================================

/**
 * The declarations the deferring-declared-half rows reference. `Count` is the
 * numeric alias, `Sev` the enum and `S` the inline-object schema — each answers
 * `"unknown"` against `parseParams`'s empty compat `TypeEnv`, so the compat gate
 * declines by design and the is-literal check is the position's only load-time
 * judge of the default's form.
 */
const BODY = [
  "enum Sev { A, B }",
  "schema Count = number",
  "schema S { a: integer }",
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
  return parseDoc(src(`  p: '${rhs.replace(/'/g, "''")}'`), "bug0175.theta");
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
 * registry's with `<expr>` rendered as the residue span, the frontmatter
 * collapsed and the lowered document withheld.
 *
 * The count/code assertion runs FIRST so a red names the symptom bug 0175
 * reports — a default RHS whose parse leaves tokens unconsumed, admitted — and
 * not a downstream message shape.
 *
 * The last two expectations are the reachability link to a theta that does not
 * register: the registration gate (src/parser/frontmatter.ts:1489–1491) withholds
 * the whole frontmatter object once any diagnostic carries error severity, which
 * removes the `defaultSource` record `#recoverDeclaredDefaults` re-reads at
 * invocation and the lowered fragment the post-default-merge AJV hook validates
 * against.
 */
function expectRefusedAsResidue(label: string, doc: ThetaDocument, residue: string): void {
  expect(
    diagCodes(doc),
    `${label}: grammar.md:14 and :20–24 are a closed production set and a production derives a terminal string, not a prefix of one, so a RHS whose parse leaves tokens unconsumed is outside the sublanguage and code-registry-parse.md:48 claims it for ${NOT_LITERAL_CODE} at a count of one. Rendered: ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([`error ${NOT_LITERAL_CODE}`]);
  const diagnostic = doc.diagnostics[0];
  if (diagnostic === undefined) {
    throw new Error(`${label}: diagnostics[0] absent after a one-element count assertion`);
  }
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's template with \`<expr>\` rendered as the RESIDUE span, the text the parse never examined; naming the whole RHS instead would report the author's conformant prefix as the offence`,
  ).toBe(notLiteralMessage(residue));
  expect(
    diagnostic.severity,
    `${label}: the drop gate reads error severity, so a warning would leave the theta registered with a default whose value is a truncation of its own source`,
  ).toBe("error");
  expect(
    doc.frontmatter,
    `${label}: an error-severity params diagnostic withholds the frontmatter, which is what un-registers the theta — the observable that keeps the truncated value out of body scope`,
  ).toBeNull();
  expect(
    loweredP(doc),
    `${label}: no lowered \`params:\` fragment may survive the refusal — a surviving one is what the post-default-merge AJV hook then judges the truncated value against`,
  ).toBeUndefined();
}

// ===========================================================================
// (R) THE REGISTERED ROW (DIAG-2 / DIAG-4).
// ===========================================================================

describe("bug 0175 (R) — the row that claims the refusal", () => {
  it(`GREEN (R1): ${NOT_LITERAL_CODE} keeps its Sev / Phase / Message`, () => {
    // DIAG-4 (diagnostic-shape.md:74) defers every *Message* reword to theta
    // 2.0, and the settled route changes only which SPAN is interpolated, not
    // the template. Pinning the column here makes a reword visible as one red
    // rather than as drift across every rendered message in groups A and C,
    // which read this same template.
    const row = registryRowOf(NOT_LITERAL_CODE);
    expect(
      row.severity,
      "the drop gate acts on the Sev column; a `W` row would leave the theta registered with a residue-carrying default",
    ).toBe("E");
    expect(
      row.phase,
      "the defect is that the RHS is not a whole literal of this sublanguage — a parse-stage fact independent of the declared half, which is why the type-stage row is the wrong home for it (group C's flip cells)",
    ).toBe("parse");
    expect(
      registryMessageOf(NOT_LITERAL_CODE),
      "DIAG-4 — the normative template every expected message in groups A and C is rendered from",
    ).toBe(
      "params default RHS must be a literal-sublanguage form; offending sub-expression: <expr>",
    );
  });
});

// ===========================================================================
// (A) THE DIRECT-SEAM REFUSAL (§Fix (a), the is-literal arm). RED at HEAD:
// `checkLiteralSublanguage` returns `[]` for every residue spelling because
// `ExprParser.parse()` never asks whether tokens remain.
// ===========================================================================

for (const [groupLabel, rows] of RESIDUE_GROUPS) {
  describe(`bug 0175 (A) — a default RHS with unconsumed tokens is refused (${groupLabel})`, () => {
    for (const [label, source, residue] of rows) {
      it(`RED (${label}): \`${source}\` draws one ${NOT_LITERAL_CODE} naming \`${residue}\``, () => {
        expect(
          checkLines(source),
          `${label}: \`ExprParser.parse()\` (src/parser/literal-sublanguage.ts:286–290) tests emptiness where exhaustiveness belongs, so this source is judged on its leading expression alone; grammar.md:9 specifies the is-literal check over the AST of the RHS, singular, and the residue ${JSON.stringify(residue)} is text no reader in the chain examined`,
        ).toEqual([`${NOT_LITERAL_CODE}: ${notLiteralMessage(residue)}`]);
      });
    }
  });
}

// ===========================================================================
// (B) THE MIRROR CONTRACT (§Fix (e)(2)). The position's two readers of the same
// bytes must agree: a form the is-literal check refuses establishes no static
// type. RED at HEAD for every spelling whose leading literal is a primitive or
// a flat array — `defaultLiteralStaticType` hands back that prefix's own
// primitive. This is the group that reds if either arm narrows alone.
// ===========================================================================

/**
 * The two spellings whose leading node is an OBJECT literal.
 * `defaultLiteralStaticType` (:706) already returns `undefined` for an object
 * node — the compat reader defers on bare-key objects by construction — so
 * these two cells are green at HEAD and hold the direction rather than the
 * defect: a route that made the object arm answer something would red here.
 */
const OBJECT_LEADING = new Set(["{ a: 1 } x", "{ a: 1 2 }"]);

describe("bug 0175 (B) — the is-literal check and the compat reader agree", () => {
  for (const [label, source] of ALL_RESIDUE_ROWS) {
    const state = OBJECT_LEADING.has(source) ? "GREEN" : "RED";
    it(`${state} (${label}): \`${source}\` establishes no static type`, () => {
      expect(
        defaultLiteralStaticType(source),
        `${label}: \`primitiveLiteralType\`'s design note (the doc-comment above src/parser/literal-sublanguage.ts:736) binds this reader to the is-literal verdict — it shares this module's tokeniser and parser precisely so it can never disagree — and §Fix (e)(2) makes both readers move together through one shared end-of-input predicate. A type here would be the primitive of a PREFIX of the field's own source, which is what routes \`string = 1x\` to a type-mismatch verdict (group C). This cell reds if the two readers ever narrow apart.`,
      ).toBeUndefined();
    });
  }
});

// ===========================================================================
// (C) THE LOAD-TIME REFUSAL TABLE (§Fix (e)(7), first clause). RED at HEAD:
// every row but the two flip cells loads with ZERO diagnostics, registers, and
// records a residue-carrying default verbatim.
// ===========================================================================

/** A load row as `[label, params RHS, residue span]`. */
type LoadRow = readonly [string, string, string];

/**
 * DECIDABLE declared half: a primitive or `array<T>` over one, which
 * `paramsDeclaredCompatType`, called from `parseParams` (`src/parser/params.ts`),
 * resolves against the empty environment. Each pairing below is silent at HEAD because the compat
 * relation holds over the LEADING literal's type — the residue is judged by
 * nothing.
 */
const LOAD_DECIDABLE: readonly LoadRow[] = [
  ["c1", "integer = -1x", "x"],
  ["c2", "integer = 1x", "x"],
  ["c3", "integer = 0x10", "x10"],
  ["c4", "integer = 0b101", "b101"],
  ["c5", "integer = 0o17", "o17"],
  ["c6", "integer = 1_000", "_000"],
  ["c7", "number = 1.5x", "x"],
  ["c8", "integer = 1 2", "2"],
  ["c9", "integer = -1 2", "2"],
  ["c10", "boolean = true false", "false"],
  ["c11", 'string = "a" "b"', '"b"'],
  ["c12", "array<integer> = [1] x", "x"],
  ["c13", "integer = -1 true", "true"],
  ["c14", "integer = 1 foo(2)", "foo(2)"],
  ["c15", "integer = 1 ${x}", "${x}"],
  ["c16", "integer = 1 @`q`", "@`q`"],
  ["c17", "integer = 1;", ";"],
  ["c18", "integer = -1)", ")"],
  ["c19", "integer = -1]", "]"],
  ["c20", "integer = -5 # trailing", "# trailing"],
  ["c21", 'string = "a" junk here', "junk here"],
];

/**
 * DEFERRING declared half: an alias, an enum name, a schema name and an inline
 * object type each answer `"unknown"` against the empty compat `TypeEnv`
 * (`paramsDeclaredCompatType`'s `named` fallthrough), so the compat gate judges
 * none of these rows by design and the is-literal check is the position's ONLY
 * load-time judge for this whole half of the table.
 */
const LOAD_DEFERRING: readonly LoadRow[] = [
  ["c22 (numeric alias)", "Count = -1x", "x"],
  ["c23 (enum name)", "Sev = 1x", "x"],
  ["c24 (schema name)", "S = { a: 1 } x", "x"],
  ["c25 (inline object type)", "{ a: integer } = { a: 1 } x", "x"],
];

/**
 * NESTED positions, the two §Fix (e)(5) enumerates beside the top level: the
 * residue sits where an array ELEMENT or an object FIELD VALUE should be
 * followed by `,` or the closing bracket. Both are admitted at HEAD exactly as
 * the top-level rows are, and the residue carries the unconsumed bracket.
 */
const LOAD_NESTED: readonly LoadRow[] = [
  ["c26 (array element)", "array<integer> = [1 2]", "2]"],
  ["c27 (object field value)", "S = { a: 1 2 }", "2 }"],
];

const LOAD_GROUPS: ReadonlyArray<readonly [string, readonly LoadRow[]]> = [
  ["decidable declared half", LOAD_DECIDABLE],
  ["deferring declared half", LOAD_DEFERRING],
  ["nested position", LOAD_NESTED],
];

for (const [groupLabel, rows] of LOAD_GROUPS) {
  describe(`bug 0175 (C) — the load refuses a residue-carrying default (${groupLabel})`, () => {
    for (const [label, rhs, residue] of rows) {
      it(`RED (${label}): \`${rhs}\` draws exactly one ${NOT_LITERAL_CODE}`, () => {
        expectRefusedAsResidue(label, paramsDoc(rhs), residue);
      });
    }
  });
}

/**
 * The two pairings whose LEADING literal's type is `⋢` the declared type, so
 * bug 0066's compat gate fires today on a type read off a prefix of the source.
 * The ordering that replaces it is `code-registry-parse.md:50`'s SECOND
 * precedence rule — a field whose default half already drew
 * `theta/parse/default-not-literal` "keeps that diagnostic alone" — implemented
 * by `parseParams`'s one-diagnostic-per-field guard (`src/parser/params.ts`),
 * which stops the compat check once the default half has drawn an error.
 */
const LOAD_FLIPPED: readonly LoadRow[] = [
  ["c28 (`1x` under `string`)", "string = 1x", "x"],
  ["c29 (`null null` under `integer`)", "integer = null null", "null"],
];

describe(`bug 0175 (C) — a refused default half keeps ${NOT_LITERAL_CODE} alone`, () => {
  for (const [label, rhs, residue] of LOAD_FLIPPED) {
    it(`RED (${label}): \`${rhs}\` moves from ${MISMATCH_CODE} to ${NOT_LITERAL_CODE}`, () => {
      const doc = paramsDoc(rhs);
      // The refusal contract first: the code, the count, the rendered residue
      // and the withheld registration.
      expectRefusedAsResidue(label, doc, residue);
      // The other direction of the flip, asserted explicitly rather than left
      // implicit in the count: the type-stage row does not co-fire, and it does
      // not survive alone either. Its `<actual>` today is the type of a
      // FRAGMENT of the source — `integer` for two of the four characters of
      // `1x` — an emission `code-registry-parse.md:50`'s own *Trigger* does not
      // describe, since it enumerates literals and homogeneous arrays of them
      // among the default shapes it decides.
      expect(
        diagCodes(doc).filter((c) => c.endsWith(MISMATCH_CODE)),
        `${label}: naming an incompatible TYPE for a source the position's grammar does not derive reports the wrong defect, and the row's second precedence rule makes it silent once the default half is refused`,
      ).toEqual([]);
    });
  }
});

describe("bug 0175 (C) — the refusal is per offending field", () => {
  it("RED (c30): two offending fields draw two diagnostics, each naming its own residue", () => {
    // One diagnostic per offending FIELD, the cardinality this position already
    // holds for its other default-side refusals. Declaration order is legal —
    // both fields are defaulted, so `non-trailing-default` cannot fire and the
    // count is the per-field emission alone.
    const doc = parseDoc(src(`  p: 'integer = 1 2'\n  q: 'string = "a" junk here'`), "bug0175.theta");
    expect(
      diagCodes(doc),
      `c30: the per-field default loop judges each field's own recorded default, so two offending fields draw two. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${NOT_LITERAL_CODE}`, `error ${NOT_LITERAL_CODE}`]);
    expect(
      diagLines(doc),
      `c30: each field's diagnostic names that field's own residue. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([
      `error ${NOT_LITERAL_CODE}: ${notLiteralMessage("2")}`,
      `error ${NOT_LITERAL_CODE}: ${notLiteralMessage("junk here")}`,
    ]);
  });
});

// ===========================================================================
// (D) THE OVER-REFUSAL FENCE (§Fix (e)(4)) AND THE GUARDS (§Fix (e)(3)).
// GREEN at HEAD and required to stay green.
// ===========================================================================

describe("bug 0175 (D) — a conformant default keeps its verdict", () => {
  it('GREEN (d1): `integer = -1` loads clean, records `-1` and lowers `{"type":"integer"}`', () => {
    const doc = paramsDoc("integer = -1");
    expect(
      diagLines(doc),
      "d1: `\"-\" NUMBER` is the production grammar.md:20–24 derives and its parse consumes every token, so an end-of-input requirement must not reach it",
    ).toEqual([]);
    expect(
      recordedDefault(doc),
      "d1: the recorded default half is what `binderPromptParamField` renders after `default=` and what `#recoverDeclaredDefaults` re-parses at invocation",
    ).toBe("-1");
    expect(
      loweredP(doc),
      "d1: the lowered fragment the post-default-merge AJV hook validates against",
    ).toEqual({ type: "integer" });
  });

  it("GREEN (d2): `number = -1.5` loads clean", () => {
    expect(
      diagLines(paramsDoc("number = -1.5")),
      "d2: a unary-minus decimal is a `number` literal of the carve-out and its declared half admits it",
    ).toEqual([]);
  });

  it(`GREEN (d3): \`integer = -1.5\` draws exactly one ${NARROWING_CODE}`, () => {
    // The direction frontmatter-fields-a.md:60 names by code, pinned as a
    // unary-minus row by cell b2 of tests/params-default-type-compat.test.ts.
    // Its premise is that the sublanguage ADMITS the source, so an end-of-input
    // requirement that mis-measured a fully consumed parse would silence this
    // row by refusing it first.
    const doc = paramsDoc("integer = -1.5");
    expect(
      diagCodes(doc),
      `d3: the parse consumes every token, so the is-literal check admits and the compat gate is still the judge. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${NARROWING_CODE}`]);
    expect(
      doc.diagnostics[0]?.message,
      "d3: DIAG-4 — the registered row's Message, which carries no placeholder",
    ).toBe(registryMessageOf(NARROWING_CODE));
  });

  it("GREEN (d4): the conformant container and carve-out spellings load clean", () => {
    // The container arms of the fence: `parseArray` and `parseObjectBody`
    // consume their closing bracket for a well-formed literal, so the residue
    // predicate must see an empty tail for these rows. Without them, group C's
    // nested cells could be satisfied by a predicate that refuses every
    // container.
    for (const rhs of ["array<integer> = [1, 2]", "S = { a: 1 }", "integer = 1"]) {
      expect(
        diagLines(paramsDoc(rhs)),
        `d4: \`${rhs}\` is a whole literal of the sublanguage; a refusal here is over-refusal`,
      ).toEqual([]);
    }
  });

  it(`GREEN (d5): the direct seam admits every fully-consumed literal`, () => {
    // The positive control of the direct seam, held identically for `-5` by
    // tests/e2e-s1-grammar-literal-sublang.test.ts (REQ-GRAM-2). Restated here
    // so a predicate that over-reached reds inside its own witness file.
    for (const source of ["-5", "-1", "1", "-1.5", "[1, 2]", "{ a: 1 }", "Severity.High"]) {
      expect(
        checkLines(source),
        `d5: \`${source}\` parses to a node covering the whole source, so no residue exists to name`,
      ).toEqual([]);
    }
  });

  it("GREEN (d6): the three refused fence spans keep their CURRENT offending sub-expression", () => {
    // The fence that makes this a residue defect rather than a general
    // leniency: residue the parser CAN use is consumed and judged, so these
    // three keep naming the node `firstNonLiteral` (:509) returns — the whole
    // binary for `{ a: 1 } + 1` and `a + b`, the member chain for `a.b.c`, the
    // inner call for `{ k: f(x) }`. A residue predicate that ran BEFORE
    // `firstNonLiteral` and reported a tail instead would red here.
    const SPANS: ReadonlyArray<readonly [string, string]> = [
      ["{ a: 1 } + 1", "{ a: 1 } + 1"],
      ["a + b", "a + b"],
      ["a.b.c", "a.b.c"],
      ["{ k: f(x) }", "f(x)"],
    ];
    for (const [source, expr] of SPANS) {
      expect(
        checkLines(source),
        `d6: \`${source}\` is consumed whole by the parser, so its verdict is the is-literal walk's and its span is unchanged`,
      ).toEqual([`${NOT_LITERAL_CODE}: ${notLiteralMessage(expr)}`]);
    }
  });

  it("GREEN (d7): `isBareObjectLiteral` keeps all four committed verdicts and its residue tolerance", () => {
    // §Fix (a) leaves `ExprParser.parse()` alone precisely so this second
    // consumer does not move: the Pi-tool argument SHAPE rule reads this
    // predicate alone (src/runtime/tool-call.ts) and its four answers are
    // pinned by tests/params-default-string-literal-raw-newline.test.ts group
    // (e). The fifth row is the blast-radius fact the route commits to: a
    // residue-carrying object literal stays `true` here, because the residue
    // check belongs at the two default-position entry points and not in the
    // shared parser.
    const SHAPES: ReadonlyArray<readonly [string, boolean]> = [
      ['{ path: "a",\nmode: "b" }', true],
      ['{ path: "a" }', true],
      ['{ path: "a\nb" }', true],
      ["args", false],
      ["{ a: 1 } x", true],
    ];
    for (const [source, expected] of SHAPES) {
      expect(
        isBareObjectLiteral(source),
        `d7: the tool-argument shape rule reads this predicate alone, so the residue refusal must land at the default-position entry points and leave it byte-stable; source ${JSON.stringify(source)}`,
      ).toBe(expected);
    }
  });

  it(`GREEN (d8): junk TYPE text with a residue-carrying default keeps ${TYPE_TEXT_CODE} alone`, () => {
    // bug 0059's suppression guard in `parseParams` (`src/parser/params.ts`),
    // `typeRefused`; code-registry-load.md:19's third precedence rule): a field whose type half
    // spells no type expression is reported as such, not by whatever its default
    // half's literal check makes of the same field's recovered bytes. The guard
    // `continue`s before the default-side checks run, so a refusal added inside
    // that loop cannot join it — and the count must stay one, as cell f1 of
    // tests/params-scalar-nontype-text-refusal.test.ts holds.
    const doc = paramsDoc("lol wut = 1 2");
    expect(
      diagCodes(doc),
      `d8: the type half is judged first and alone; a second diagnostic here would give the author two reports for one mistake. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${TYPE_TEXT_CODE}`]);
  });

  it("GREEN (d9): a default half whose LEADING node is already non-literal keeps its own span", () => {
    // Cell f2 of tests/params-scalar-nontype-text-refusal.test.ts pins this
    // row's message as interpolating `totally` alone, with the residue `junk`
    // absent: the offending node is the leading identifier, and
    // `firstNonLiteral` faults it before any residue exists to report. The
    // settled route's predicate must therefore run AFTER the is-literal walk,
    // not before it, or this committed message changes.
    const doc = paramsDoc("string = totally junk");
    expect(
      diagCodes(doc),
      `d9: exactly one diagnostic, the is-literal refusal. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
    expect(
      doc.diagnostics[0]?.message,
      "d9: the leading node is the offence, so the span is `totally` and the residue `junk` never appears — the committed contract of bug 0059's cell f2",
    ).toBe(notLiteralMessage("totally"));
  });
});

// ===========================================================================
// Group E harness — the runtime tier (the shipped production-producer pattern).
// ===========================================================================

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

/** A captured `pi.sendMessage` custom message. */
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
}

/**
 * The drive fixtures' body. `S` is the schema whose lowered `$ref` fragment
 * admits the object literal the `{ a: 1 } x` row truncates to.
 */
const DRIVE_BODY = ["schema S { a: integer }", "@`t=${topic} p=${p}`", ""].join("\n");

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

/** The seven rows §Reproduction (e) measures BINDING a value the source never spells. */
const BOUND_ROWS: readonly DriveRow[] = [
  ["e1 (`1 2` binds `1`)", "b175a", "integer = 1 2"],
  ['e2 (`"a" "b"` binds `"a"`)', "b175b", 'string = "a" "b"'],
  ["e3 (`true false` binds `true`)", "b175c", "boolean = true false"],
  ["e4 (`[1] x` binds `[1]`)", "b175d", "array<integer> = [1] x"],
  ["e5 (`{ a: 1 } x` binds `{a: 1}`)", "b175e", "S = { a: 1 } x"],
  ["e6 (`0x10` binds `16` — a value NEITHER reader read)", "b175f", "integer = 0x10"],
  ["e7 (`-1 true` binds `-1`)", "b175g", "integer = -1 true"],
];

/** The over-fire fence: a conformant numeric default that must keep binding. */
const NUMERIC_FENCE: DriveRow = ["e8 (the conformant control)", "b175h", "integer = -1"];

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
  /** The one-line disposition: the assertion subject of every cell in group E. */
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
 * makes a red name the truncated value rather than an absent test.
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
    summary: `registered and driven; bound=${String(result.bound)}; p=${JSON.stringify(
      result.args?.["p"],
    )}; binder calls=${scripted.calls.length}`,
    diagnostics,
    binderCalls: scripted.calls.length,
    notes: channel,
  };
}

// ===========================================================================
// (E) THE RUNTIME TIER (§Fix (e)(7), second half).
// RED at HEAD for the seven §Reproduction (e) rows: each registers, spends one
// binder model call and binds a truncation (or a re-lex) of its own source,
// behind a `default=1 2` prompt token and a `p=1 (default)` success echo. The
// refusal-at-load observable — `binderCalls: 0` — is what makes this S1.
// ===========================================================================

describe("bug 0175 (E) — the bound rows do not reach the binder at all", () => {
  for (const [label, name, rhs] of BOUND_ROWS) {
    it(`RED (${label}): \`${rhs}\` is refused at load, so no binder pass exists`, async () => {
      const outcome = await driveIfRegistered(name, driveTheta(rhs));

      // THE PRIMARY ASSERTION. `defaulting-system-note-echo.md:9` says the field
      // "takes its declared default" when the wire name is absent; here it takes
      // a PREFIX of that default, or — for `0x10` — a value neither load-time
      // reader read, because `#recoverDeclaredDefaults` re-lexes the recorded
      // bytes with the theta lexer and `Number("0x10")` is `16`. Refusing the
      // DECLARATION is what removes the record the recovery re-reads, and
      // `binder-bypass-and-envelope.md:142` says the same about the prompt
      // token: `default=1 2` is not a literal-sublanguage rendering of anything.
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
    // test. `-1` parses to a node covering its whole source, so this row must
    // keep loading, keep spending its one binder call, and keep filling the
    // declared default (defaulting-system-note-echo.md:9).
    const [label, name, rhs] = NUMERIC_FENCE;
    const outcome = await driveIfRegistered(name, driveTheta(rhs));

    expect(
      outcome.summary,
      `${label}: a conformant numeric default registers, binds and echoes; a refusal here is over-refusal on a fully-consumed parse`,
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
