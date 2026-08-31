import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseExpressionSource,
  parseThetaDocument,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { lexQueryTemplate } from "../src/render/query-render";
import { executeBody } from "../src/runtime/statement-executor";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import { parseDoc, parseDeps } from "./helpers/e2e-s1";

// Bug 0122 — every parse-phase diagnostic raised for the expression inside a
// `@`-query `${…}` interpolation is discarded.
//
// Three mechanisms compose (all re-derived at HEAD fdcb0835 / 0.144.0):
//   - the whole-document parser never parses an interpolation: `parseQuery`
//     collects the tokens between the backticks as text and recovers the
//     template as a verbatim slice, so no diagnostic can arise there;
//   - `parseExpressionSource` (src/parser/theta-document.ts:1274) returns
//     `Expr | null` and never reads its `BodyParser`'s diagnostics array
//     (`public readonly diagnostics: Diagnostic[] = []`, :1774);
//   - `parseSingleExpression` (:3367) is `return this.parseExpression()` with
//     NO end-of-input check, so a source whose prefix parses yields that prefix
//     and the residue is dropped — the truncation half of the defect.
// The load-time interpolation walk `checkQueryTemplateInterpolations` (:7326)
// therefore reports exactly two forms, via `firstForbiddenInterpolationToken`
// (:7380) / `firstForbiddenInterpolationForm` (:7406): `match` and a nested
// `@`-query.
//
// SPEC ANCHORS.
//   - docs/spec_topics/expressions.md:3 — "Theta expressions are a bounded
//     subset of TypeScript. The same grammar applies wherever an expression is
//     expected: the RHS of `let`, `if` / `match` scrutinees, function
//     arguments, and inside `${...}` template interpolations." The sentence
//     that makes the interpolation silence a defect rather than an unspecified
//     gap.
//   - docs/spec_topics/expressions.md:19 — "`${...}` inside them takes any
//     expression listed above"; :25 the `## Not supported` heading; :27 "(Parse
//     error — `theta/parse/unsupported-feature` unless a more specific code
//     below applies.)"; :40 the ONE position-qualified entry, which qualifies in
//     the opposite direction (`match` / nested `@`-query are refused *only*
//     inside `${...}`).
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:71 — DIAG-1: "tests are
//     entitled to assert on the specific code at every documented diagnostic
//     site". :74 — DIAG-4, the *Message* column is normative and this file's
//     only message oracle. :44–46 — the located-site classification, which
//     fixes every `theta/parse/*` row as **Located**: both `file` and `range`.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:27
//     (`theta/parse/unsupported-feature`, Phase `parse`), :33
//     (`theta/parse/increment-decrement`, Phase `parse`), :23
//     (`theta/parse/block-comment`, Phase `lex` — the row that DOES fire from
//     inside `${…}` today and must keep firing).
//
// THE SETTLED RULE this file locks (the orchestrator's route settlement,
// .pi/tmp/fixes/0122-route-brief.md — bug doc §Fix (a) route 1):
//
//     an expression inside a @-query ${…} interpolation draws exactly the
//     parse-PARSER-phase diagnostics the same text draws at let-RHS level,
//     relocated to the enclosing @-query's range.
//
// Two consequences the cells below encode:
//   - the RANGE is the enclosing `@`-query expression's range, and the `file` is
//     the parsed document's path. `QueryTemplatePart` (src/render/query-render.ts:134)
//     carries no per-interpolation offsets, so this is the only locatable site —
//     the same choice `checkQueryTemplateInterpolations` and bug 0079's
//     `checkQueryInterpolationResults` already document. If per-interpolation
//     spans ever arrive, {@link soleQueryRange} is the one thing to narrow.
//   - parity is by CONSTRUCTION: the residue after the interpolation's
//     expression parse drains through the same `parseForms` statement loop the
//     whole-file body drives, whose stray-token push is
//     src/parser/theta-document.ts:1893. That is why `c - -` (residue `- -`,
//     which heads a legal statement) stays silent while `c = 1` / `1 === 1` /
//     `1 & 2` / `5 >> 1` draw the identical `stray '<t>' in statement position`
//     message their `let`-RHS controls draw.
//
// WHAT IS OUT OF THE SETTLED ROUTE'S REACH, and pinned rather than left
// unstated (the brief's §Residuals; group (a)'s pinned-silence cells name the
// residual number in a comment):
//   residual 1 — the four type-phase codes (`mixed-plus-operands`,
//     `non-indexable-receiver`, `question-on-non-result`, `unknown-method`) and
//     the two scope-aware parse codes (`unknown-identifier`, `unknown-method`).
//     Measured: none of them is in `BodyParser.diagnostics` at all; they are
//     computed by later scope-aware / type-aware walks over the whole-document
//     AST against a `bindings` map, which never contains the interpolation's
//     expression. Route 3 (type-layer descent) is declined for this fix.
//   residual 2 — `?.` and `??` and `=>` silently REWRITTEN inside an
//     interpolation. Position-independent: the `let`-RHS control draws no
//     `unsupported-feature` for any of them either, so this is the same class as
//     the bug doc's §Non-goals spread row.
//   residual 3 — §Non-goals' two `lexQueryTemplate` rows
//     (`illegal-template-escape`, `unterminated-template`), untouched.
//
// MEASURED AT THIS HEAD (fdcb0835 / 0.144.0), offline, provider-free. Every
// pre-fix observation quoted in a cell comment was produced by scratch probes
// over `parseDoc`, `parseExpressionSource` and the prompt-mode drive below, run
// and deleted. Inside `${…}` EVERY inventory row draws `[]`; the `let`-RHS
// controls and the rendered turns are as the per-cell comments record.
//
// HARNESS. The bug doc's §Fix "Witness — offline, provider-free" paragraph names
// the two mechanisms this file must EXTEND rather than replace:
// `tests/helpers/e2e-s1.ts`'s `parseDoc` (groups (a)–(e), (g)) and
// `tests/interpolated-result-gate.test.ts`'s prompt-mode drive over the session
// double (group (f), reproduced here because that file is a LOCK and is not on
// this diff). tests/interpolated-result-gate.test.ts and
// tests/increment-decrement-wiring.test.ts are UNMODIFIED: every group-(a)/(p)–(u)
// fixture of the former interpolates an expression that parses whole, so the
// residue drain never runs and no fixture's diagnostics array grows; the
// latter's cell s5 pins `--` in template PROSE, which is not an interpolation.
//
// No silent skipping: every unmet precondition below throws naming itself.

// ===========================================================================
// The DIAG-4 oracle: the registry Message column, read from the spec corpus.
// ===========================================================================

const REGISTRY_TEXT = readFileSync(
  fileURLToPath(
    new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
  ),
  "utf8",
);

interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

const INCREMENT_DECREMENT_CODE = "theta/parse/increment-decrement";
const UNSUPPORTED_FEATURE_CODE = "theta/parse/unsupported-feature";
const BLOCK_COMMENT_CODE = "theta/parse/block-comment";
const LITERAL_NEWLINE_CODE = "theta/parse/literal-newline-in-string";
const ILLEGAL_ESCAPE_CODE = "theta/parse/illegal-escape";
const UNKNOWN_IDENTIFIER_CODE = "theta/parse/unknown-identifier";
const UNKNOWN_METHOD_CODE = "theta/parse/unknown-method";
const MIXED_PLUS_CODE = "theta/parse/mixed-plus-operands";
const NON_INDEXABLE_CODE = "theta/parse/non-indexable-receiver";
const QUESTION_NON_RESULT_CODE = "theta/parse/question-on-non-result";
const LET_WITHOUT_INITIALISER_CODE = "theta/parse/let-without-initialiser";

/**
 * A registered code's normative *Message* template (DIAG-4,
 * docs/spec_topics/diagnostics/diagnostic-shape.md:74). Fails LOUDLY naming the
 * registry page when the row is absent, so registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column is this file's only message oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/** Substitute a registry Message template's sole `<…>` placeholder. */
function rendered(code: string, placeholder: string, value: string): string {
  const out = registered(code).replaceAll(`<${placeholder}>`, value);
  expect(
    out,
    `${code}: an unsubstituted <…> placeholder remains — the registry row's Message template changed shape and this file's substitution is stale`,
  ).not.toMatch(/<[a-z]+>/);
  return out;
}

/** `'<op>' operator is not supported` — code-registry-parse.md:33. */
function incDecMessage(op: "++" | "--"): string {
  return rendered(INCREMENT_DECREMENT_CODE, "op", op);
}

/**
 * `illegal escape sequence: \\<char>` — code-registry-parse.md:11. The registry
 * cell spells the backslash as the markdown escape `\\`, which renders as one
 * backslash, so the substitution unescapes it before filling `<char>`.
 */
function illegalEscapeMessage(ch: string): string {
  const template = registered(ILLEGAL_ESCAPE_CODE).replaceAll("\\\\", "\\");
  const out = template.replaceAll("<char>", ch);
  expect(
    out,
    `${ILLEGAL_ESCAPE_CODE}: an unsubstituted <…> placeholder remains — the registry row's Message template changed shape and this file's substitution is stale`,
  ).not.toMatch(/<[a-z]+>/);
  return out;
}

/** `unsupported syntactic feature: <construct>` — code-registry-parse.md:27. */
function unsupportedMessage(construct: string): string {
  return rendered(UNSUPPORTED_FEATURE_CODE, "construct", construct);
}

/**
 * The `<construct>` rendering the shipped statement loop already uses for an
 * unconsumed token in statement position (src/parser/theta-document.ts:1893).
 * The settled route reaches these rows through that very loop, so the string is
 * the shipped one, not a new vocabulary entry (the brief's DIAG-2
 * determination: no widening owed, no registry edit).
 */
function strayMessage(token: string): string {
  return unsupportedMessage(`stray '${token}' in statement position`);
}

/**
 * The `<construct>` rendering the load-time interpolation walk already uses
 * (src/parser/theta-document.ts:7350, :7365).
 */
function interpolationFormMessage(form: string): string {
  return unsupportedMessage(`${form} inside \${...} interpolation`);
}

// ===========================================================================
// Fixtures and the parse harness (tests/helpers/e2e-s1.ts's `parseDoc`).
// ===========================================================================

/** The source path every fixture parses under; also the diagnostics' `file`. */
const FIXTURE_PATH = "/theta/bug0122.theta";

/** Prompt-mode frontmatter — occupies source lines 1–3. */
const FM = "---\nmode: prompt\n---\n";

/** The §Reproduction prologue bindings, verbatim — source lines 4–7. */
const PROLOGUE = 'let c = 5\nlet s = "a"\nlet a = [1]\nlet o = 1\n';

/** `let _ = @`x ${<expr>}`` — the interpolated form of one inventory row. */
function interpSrc(expr: string): string {
  return `${FM}${PROLOGUE}let _ = @\`x \${${expr}}\`\n`;
}

/** `let _ = <expr>` — the `let`-RHS control of one inventory row. */
function rhsSrc(expr: string): string {
  return `${FM}${PROLOGUE}let _ = ${expr}\n`;
}

function parse(src: string): ThetaDocument {
  return parseDoc(src, FIXTURE_PATH);
}

/** The comparable projection of a diagnostic: everything DIAG-1/DIAG-4 pins. */
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
function queryNodes(node: unknown, out: { template: string; range: SourceRange }[]): void {
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
    out.push({ template: rec["template"], range: rec["range"] as SourceRange });
  }
  for (const v of Object.values(rec)) {
    queryNodes(v, out);
  }
}

/**
 * The range of the fixture's SOLE `@`-query expression — the location the
 * settled rule requires every relocated diagnostic to carry, wherever the query
 * sits (document tail, `let` RHS, `fn` body, typed query). A fixture carrying
 * anything other than exactly one `QueryExpr` is a harness defect and fails
 * loudly rather than silently comparing against a guess.
 */
function soleQueryRange(doc: ThetaDocument): SourceRange {
  const found: { template: string; range: SourceRange }[] = [];
  queryNodes(doc.body, found);
  if (found.length !== 1) {
    throw new Error(
      `harness: this fixture must carry exactly ONE @\`-query expression whose range locates the relocated diagnostics; found ${found.length} (${found.map((f) => JSON.stringify(f.template)).join(", ")})`,
    );
  }
  return (found[0] as { range: SourceRange }).range;
}

/**
 * PRIMARY assertion for a row the settled route REACHES: the interpolation's
 * whole diagnostics array is exactly `expected`, each row located at the
 * enclosing `@`-query's range in the fixture's file — and the `let`-RHS control
 * draws the same code and message, which is the parity half of the settled rule.
 *
 * `hint` is deliberately NOT projected: the settled route relocates the shipped
 * diagnostics, and whether a relocated row keeps its registry Hint is not part
 * of the rule the brief settles.
 */
function assertInterpDraws(
  expr: string,
  expected: readonly { readonly code: string; readonly message: string }[],
  why: string,
): void {
  const doc = parse(interpSrc(expr));
  const range = soleQueryRange(doc);
  expect(
    project(doc.diagnostics),
    `PRIMARY (bug 0122, settled rule): \`\${${expr}}\` must draw exactly the parse-parser-phase diagnostics \`let _ = ${expr}\` draws, relocated to the enclosing @\`-query's range. ${why}. Observed: ${show(doc)}`,
  ).toEqual(
    expected.map((e) => ({
      severity: "error",
      code: e.code,
      message: e.message,
      file: FIXTURE_PATH,
      range,
    })),
  );
  const control = parse(rhsSrc(expr));
  expect(
    codeAndMessage(control.diagnostics),
    `PARITY (the settled rule's other half): the \`let\`-RHS control \`let _ = ${expr}\` is the judge of what the interpolation owes. If this reds, the expected rows above are stale, not the production. Observed: ${show(control)}`,
  ).toEqual(expected.map((e) => ({ code: e.code, message: e.message })));
}

/**
 * PINNED SILENCE for a row the settled route does NOT reach: the interpolation
 * stays `[]`, and the `let`-RHS control's codes are pinned so the residual is
 * stated rather than left implicit. Green now, green after the fix.
 */
function assertInterpSilentWithControl(
  expr: string,
  controlCodes: readonly string[],
  residual: string,
): void {
  const doc = parse(interpSrc(expr));
  expect(
    project(doc.diagnostics),
    `PINNED SILENCE (bug 0122, ${residual}): \`\${${expr}}\` draws nothing under the settled route, because the code its \`let\`-RHS control draws is not a parse-parser-phase code. Observed: ${show(doc)}`,
  ).toEqual([]);
  const control = parse(rhsSrc(expr));
  expect(
    control.diagnostics.map((d) => d.code),
    `PINNED RESIDUAL (bug 0122, ${residual}): the \`let\`-RHS control \`let _ = ${expr}\` must keep drawing exactly these codes, so the gap the settled route leaves open is recorded rather than unstated. Observed: ${show(control)}`,
  ).toEqual([...controlCodes]);
}

/** A control that must draw NOTHING at either level. */
function assertSilentBothLevels(src: string, what: string): void {
  const doc = parse(src);
  expect(
    project(doc.diagnostics),
    `CONTROL (bug 0122 §Fix "The controls any route preserves"): ${what} is measured silent today and must stay silent after the fix. Observed: ${show(doc)}`,
  ).toEqual([]);
}

// ===========================================================================
// (a) THE INVENTORY — the same expression inside `${…}` and at `let`-RHS level.
// Thirteen rows from the bug doc's §Reproduction table plus `5 >> 1`, `c ?? 1`
// and `a?.b`. Six are inside the settled route's reach; ten are pinned silences
// naming their residual; one (`( `) pins the unparsable arm.
// ===========================================================================

describe("bug 0122 (a) — the inventory: rows the settled route REACHES", () => {
  it("RED (a1): `${c--}` draws theta/parse/increment-decrement at the query's range", () => {
    // Measured inside `${…}`: []. Measured at `let`-RHS:
    //   error theta/parse/increment-decrement | '--' operator is not supported
    // The emitter is `checkIncrementDecrement` (src/parser/bindings.ts:179,
    // Message template :188) wired into `parsePostfix`
    // (src/parser/theta-document.ts:3701), which CONSUMES the pair — so the
    // diagnostic is computed inside the interpolation's parse today and
    // discarded by `parseExpressionSource`'s `Expr | null` signature (:1274).
    // Pre-fix rendered turn: "x 5" — the value of `c`, an expression the author
    // did not write.
    assertInterpDraws(
      "c--",
      [{ code: INCREMENT_DECREMENT_CODE, message: incDecMessage("--") }],
      "bug 0084's residual (ii), the origin of this report",
    );
  });

  it("RED (a2): `${c++}` draws theta/parse/increment-decrement at the query's range", () => {
    // Measured inside `${…}`: []. At `let`-RHS: '++' operator is not supported.
    // Pre-fix rendered turn: "x 5".
    assertInterpDraws(
      "c++",
      [{ code: INCREMENT_DECREMENT_CODE, message: incDecMessage("++") }],
      "the prefix/postfix twin of (a1)",
    );
  });

  it("RED (a3): `${c = 1}` draws the stray-'=' unsupported-feature at the query's range", () => {
    // Measured inside `${…}`: []. At `let`-RHS:
    //   error theta/parse/unsupported-feature
    //   | unsupported syntactic feature: stray '=' in statement position
    // DOC-WAS-WRONG: the bug doc's table records this row's control as
    // `theta/parse/assignment-as-expression`. At this HEAD it is
    // `unsupported-feature` (stray '='), so §Expected's "the same registered
    // code its `let`-RHS control draws" selects THIS row.
    // Pre-fix rendered turn: "x 5" — `c = 1` truncates to `c`.
    assertInterpDraws(
      "c = 1",
      [{ code: UNSUPPORTED_FEATURE_CODE, message: strayMessage("=") }],
      "expressions.md:29 (assignment in expression position); the residue ` = 1` drains through the statement loop at src/parser/theta-document.ts:1893",
    );
  });

  it("RED (a4): `${1 === 1}` draws the stray-'=' unsupported-feature at the query's range", () => {
    // Measured inside `${…}`: []. At `let`-RHS: stray '=' in statement position
    // (ONE row, at the third `=`). MEASURED RESIDUE TOKEN NAME: `'='`, not
    // `'=='` — the equality parse consumes the `==` and leaves the trailing
    // single `=` for the statement loop. Pre-fix rendered turn: "x 1".
    assertInterpDraws(
      "1 === 1",
      [{ code: UNSUPPORTED_FEATURE_CODE, message: strayMessage("=") }],
      "expressions.md:35 (`===` / `!==`)",
    );
  });

  it("RED (a5): `${1 & 2}` draws the stray-'&' unsupported-feature at the query's range", () => {
    // Measured inside `${…}`: []. At `let`-RHS: stray '&' in statement position.
    // MEASURED RESIDUE TOKEN NAME: `'&'`. Pre-fix rendered turn: "x 1".
    assertInterpDraws(
      "1 & 2",
      [{ code: UNSUPPORTED_FEATURE_CODE, message: strayMessage("&") }],
      "expressions.md:36 (bitwise operators)",
    );
  });

  it("RED (a6): `${5 >> 1}` draws the stray-'>' unsupported-feature at the query's range", () => {
    // Measured inside `${…}`: []. At `let`-RHS: stray '>' in statement position
    // (ONE row, at the SECOND `>`). MEASURED RESIDUE TOKEN NAME: `'>'`, not
    // `'>>'` — `>>` lexes as two `>` tokens and the comparison parse consumes
    // the first.
    assertInterpDraws(
      "5 >> 1",
      [{ code: UNSUPPORTED_FEATURE_CODE, message: strayMessage(">") }],
      "expressions.md:36 (bitwise shift), the row the bug doc's table omits",
    );
  });
});

describe("bug 0122 (a) — the inventory: rows the settled route does NOT reach", () => {
  it("(a7): `${zzz}` stays [] — residual 1 (scope-aware parse code)", () => {
    // Pre-fix rendered turn: "x null".
    assertInterpSilentWithControl(
      "zzz",
      [UNKNOWN_IDENTIFIER_CODE],
      "residual 1 — `unknown-identifier` is computed by a later scope-aware walk against a `bindings` map, not by `BodyParser`",
    );
  });

  it("(a8): `${typeof 1}` stays [] — residual 1, and the residue is LEGAL", () => {
    // Two reasons this row is out of reach, and both matter: `unknown-identifier`
    // is residual 1, AND the residue after `typeof` parses as the ident `typeof`
    // is ` 1`, which heads a legal statement — so the drain is silent by
    // construction, exactly as it is for the `c - -` control.
    // Pre-fix rendered turn: "x null".
    assertInterpSilentWithControl(
      "typeof 1",
      [UNKNOWN_IDENTIFIER_CODE],
      "residual 1 (+ a legal residue: `typeof` parses as an identifier and ` 1` drains as a statement)",
    );
  });

  it("(a9): `${s.frobnicate()}` stays [] — residual 1 (type-aware method check)", () => {
    // Pre-fix: the drive ABORTS after zero turns were sent, under an uncoded
    // JavaScript `Error: unknown string stdlib member: frobnicate` (measured,
    // sent=[]). The settled route does not close this: `unknown-method` is
    // computed by the type-aware walk, not by `BodyParser`. See group (f).
    assertInterpSilentWithControl(
      "s.frobnicate()",
      [UNKNOWN_METHOD_CODE],
      "residual 1 — `unknown-method` is type-aware; the pre-fix observable is an uncoded runtime `Error` after zero turns",
    );
  });

  it("(a10): `${a.map(v => v)}` stays [] — residual 1 and residual 2", () => {
    // Measured at `let`-RHS: unknown-method + unknown-identifier ×2 (the two
    // `v` reads of the dropped arrow). Inside `${…}` the source parses WHOLE as
    // a two-argument `map` call with the `=>` dropped (measured: method-call
    // covering all 13 columns), so there is no residue for the drain to see —
    // the arrow rewriting is residual 2. Pre-fix: the drive aborts under an
    // uncoded `Error: unknown array stdlib member: map`, sent=[].
    assertInterpSilentWithControl(
      "a.map(v => v)",
      [UNKNOWN_METHOD_CODE, UNKNOWN_IDENTIFIER_CODE, UNKNOWN_IDENTIFIER_CODE],
      "residual 1 (type-aware) + residual 2 (`=>` silently dropped, so the parse leaves no residue)",
    );
  });

  it('(a11): `${1 + "a"}` draws theta/parse/mixed-plus-operands at the query range', () => {
    // The QRY-18 row (docs/spec_topics/query/query-escapes-stringification.md:16):
    // pre-fix this rendered "x 1a" — the JavaScript coercion the rule's own
    // preamble says "would silently corrupt prompts without any diagnostic for
    // the author". Bug 0122 pinned this as residual 1 (type-phase,
    // out of THIS route's reach) and explicitly declined route 3 (the
    // type-layer descent) to close it. Bug 0345 lands route 3 for the operand
    // checks specifically: `walkExpr`'s query arm now descends into the parsed
    // interpolation and runs `checkPlusOperands`, so this cell moves from a
    // pinned silence to a drawn row, relocated to the query's range.
    assertInterpDraws(
      '1 + "a"',
      [{ code: MIXED_PLUS_CODE, message: '\'+\' has mixed operand types: integer and string' }],
      "bug 0345 §Fix: the operand descent closes residual 1's `mixed-plus-operands` member",
    );
  });

  it("(a12): `${o[0]}` stays [] — residual 1 (type-phase `non-indexable-receiver`)", () => {
    // Pre-fix: the drive aborts with `NonObjectReceiverError: non-object
    // receiver: cannot read [0] on a number`, sent=[] — a registered runtime
    // panic standing in for a parse-time rejection the registry assigns to the
    // `type` phase.
    assertInterpSilentWithControl(
      "o[0]",
      [NON_INDEXABLE_CODE],
      "residual 1 — type-phase; pre-fix observable is a runtime panic after zero turns",
    );
  });

  it("(a13): `${s?}` stays [] — residual 1 (type-phase `question-on-non-result`)", () => {
    // Pre-fix rendered turn: "x null".
    assertInterpSilentWithControl(
      "s?",
      [QUESTION_NON_RESULT_CODE],
      "residual 1 — type-phase",
    );
  });

  it("(a14): `${s?.len}` stays [] — residual 1 (two type-phase codes)", () => {
    // Pre-fix rendered turn: "x null".
    assertInterpSilentWithControl(
      "s?.len",
      [UNKNOWN_METHOD_CODE, QUESTION_NON_RESULT_CODE],
      "residual 1 — two type-phase codes",
    );
  });

  it("(a15): `${a?.b}` stays [] — residual 1 and residual 2 (`?.` rewritten)", () => {
    // Inside `${…}` `a?.b` parses WHOLE as the member access `a.b` (measured:
    // member covering all 4 columns), so no residue reaches the drain — the
    // optional-chaining rewriting is residual 2, position-independent.
    assertInterpSilentWithControl(
      "a?.b",
      [UNKNOWN_METHOD_CODE, QUESTION_NON_RESULT_CODE],
      "residual 1 (type-phase) + residual 2 (`?.` silently rewritten to `.`)",
    );
  });

  it("(a16): `${c ?? 1}` stays [] — MEASURED: its residue is LEGAL, so the drain is silent", () => {
    // DISAGREEMENT WITH THE BRIEF, reported rather than silently adopted. The
    // task brief lists "`c ?? 1`'s residue" among the rows the settled route
    // reaches. Measured at this HEAD it is NOT reached:
    //   parseExpressionSource("c ?? 1") => try, covering cols 1..4 of 6
    // i.e. BOTH `?` are consumed as a nested `?`-unwrap `(c?)?`, leaving the
    // residue " 1" — a legal statement, which drains silently. The `let`-RHS
    // control agrees: `let _ = c ?? 1` draws `question-on-non-result` ×2 (both
    // type-phase, residual 1) and NO stray-token row. So there is no residue
    // token name to report for this row: the drain sees a legal `1`.
    assertInterpSilentWithControl(
      "c ?? 1",
      [QUESTION_NON_RESULT_CODE, QUESTION_NON_RESULT_CODE],
      "residual 1 (type-phase ×2) + residual 2 (`??` rewritten to a nested `?`); MEASURED residue ` 1` is legal, so the drain adds nothing",
    );
  });

  it("(a17): `${( }` stays [] — the unparsable arm, with `let _ = ( ` as its control", () => {
    // MEASURED CONTROL, as the task requires: `let _ = ( ` draws
    //   error theta/parse/let-without-initialiser
    //   | let binding '_' has no initialiser
    // which is a STATEMENT-shape diagnostic, not an expression-sublanguage one —
    // so it has no interpolation analogue and the settled route leaves the
    // unparsable arm exactly as it is. `parseExpressionSource("( ")` returns
    // `null` (measured) and `BodyParser.diagnostics` is `[]` for it, so the
    // route adds nothing here; the render still substitutes the literal "null"
    // (src/extension/production-theta-producer.ts's `stringifyInterpolation`
    // `null` arm). Bug doc §Fix's "what happens to an interpolation that does
    // not parse" question is answered: nothing changes.
    const doc = parse(interpSrc("( "));
    expect(
      project(doc.diagnostics),
      `PINNED (bug 0122): the unparsable arm is untouched by the settled route. Observed: ${show(doc)}`,
    ).toEqual([]);
    const control = parse(`${FM}${PROLOGUE}let _ = ( \n`);
    expect(
      control.diagnostics.map((d) => d.code),
      `MEASURED CONTROL for the unparsable arm: \`let _ = ( \` draws a statement-shape diagnostic. Observed: ${show(control)}`,
    ).toEqual([LET_WITHOUT_INITIALISER_CODE]);
  });

  it("(a18): `${= 1}` stays [] — the unparsable arm's drain-DOES-collect boundary (F1)", () => {
    // This is the row (a17) cannot be: `${( }`'s drain collects NOTHING, so it
    // cannot distinguish "collected and dropped" from "nothing to drop". `= 1`
    // parses to `null` (a stray '=' starts no expression, so `parsePrimary`
    // returns `null` WITHOUT consuming) and then DRAINS THE WHOLE remaining
    // source through the statement loop, which DOES collect a diagnostic for
    // it — the null arm's `continue` drops that collected diagnostic by the
    // settled disposition (route settlement: the unparsable arm is UNCHANGED
    // from before this fix), not because there was nothing to drop.
    // MEASURED CONTROL, as the task requires: `let _ = = 1` draws TWO rows —
    //   error theta/parse/let-without-initialiser | let binding '_' has no initialiser
    //   error theta/parse/unsupported-feature
    //   | unsupported syntactic feature: stray '=' in statement position
    // A future change that starts reporting on the null arm must red this
    // cell deliberately, not by accident.
    const doc = parse(interpSrc("= 1"));
    expect(
      project(doc.diagnostics),
      `PINNED (bug 0122, F1 boundary): the unparsable arm's \`continue\` drops what the drain collected for \`\${= 1}\`. Observed: ${show(doc)}`,
    ).toEqual([]);
    const control = parse(rhsSrc("= 1"));
    expect(
      codeAndMessage(control.diagnostics),
      `MEASURED CONTROL for the F1 boundary: \`let _ = = 1\` draws let-without-initialiser AND the stray-'=' unsupported-feature the drain would have collected inside \${...}. Observed: ${show(control)}`,
    ).toEqual([
      { code: LET_WITHOUT_INITIALISER_CODE, message: rendered(LET_WITHOUT_INITIALISER_CODE, "name", "_") },
      { code: UNSUPPORTED_FEATURE_CODE, message: strayMessage("=") },
    ]);
  });
});

// ===========================================================================
// (b) THE REQUIRED CONTROLS — bug doc §Fix "The controls any route preserves".
// Every one measured silent today and required silent after. These are what
// make the drain-through-the-statement-loop route admissible at all: a bespoke
// "first unconsumed token" scan reds (b1).
// ===========================================================================

describe("bug 0122 (b) — the controls that must stay silent inside `${…}`", () => {
  it("CONTROL (b1): `${c - -}` — bug 0084's own control, the reason the route drains", () => {
    // `c - -` parses to `ident c` with `- -` unconsumed (measured). A bespoke
    // residue scan would emit a stray diagnostic here, where the `let`-RHS
    // control is SILENT (measured: `let _ = c - -` draws []). Draining through
    // the shipped `parseForms` loop is silent by construction, because a leading
    // `-` heads a legal statement.
    assertSilentBothLevels(interpSrc("c - -"), "`${c - -}` (subtraction of a negation)");
    assertSilentBothLevels(rhsSrc("c - -"), "`let _ = c - -`, the parity control for it");
  });

  it("CONTROL (b2): `${1 == 1 ? 2 : 3}` — a legal ternary", () => {
    // Pre-fix rendered turn: "x 2". Legal at both levels, and must stay so.
    assertSilentBothLevels(interpSrc("1 == 1 ? 2 : 3"), "a legal ternary inside `${…}`");
  });

  it("CONTROL (b3): `${[...a]}` — spread, silent at BOTH levels (§Non-goals)", () => {
    // `let _ = [...a]` is ALSO silent (measured), so the interpolation's silence
    // is a pre-existing, position-independent gap against expressions.md:32 and
    // is fenced out by the bug doc's §Non-goals. The settled route must not
    // start flagging it: parity with the `let`-RHS control forbids it.
    assertSilentBothLevels(interpSrc("[...a]"), "`${[...a]}` (spread — §Non-goals)");
    assertSilentBothLevels(rhsSrc("[...a]"), "`let _ = [...a]`, its parity control");
  });

  it("CONTROL (b4): `\\${x}` — the escape suppresses the interpolation entirely", () => {
    // QRY-17 (docs/spec_topics/query/query-escapes-stringification.md:12): `\$`
    // suppresses interpolation, so `lexQueryTemplate` produces no `interp` part
    // and there is no expression to diagnose. `x` is unbound on purpose: if a
    // route ever parsed the escaped text, `unknown-identifier` would appear.
    assertSilentBothLevels(
      `${FM}${PROLOGUE}let _ = @\`literal \\\${x}\`\n`,
      "an escape-suppressed `\\${x}`",
    );
  });

  it("CONTROL (b5): `--` / `++` inside template PROSE (bug 0084 cell s5)", () => {
    // Text between the backticks is prose, not code. This is the shape bug
    // 0084's cell s5 pins (tests/increment-decrement-wiring.test.ts:379); that
    // file is NOT modified by this diff and its cell stays correct, because
    // prose is not an interpolation.
    assertSilentBothLevels(
      `${FM}${PROLOGUE}let _ = @\`do x -- then y ++ z \${c}\`\n`,
      "`--` / `++` in template prose beside a legal interpolation",
    );
  });

  it("CONTROL (b6): `--` / `++` inside a `//` comment INSIDE the interpolation", () => {
    // src/lexer/lexer.ts's template state machine leaves prose on `${` and
    // resumes ordinary code lexing until the matching `}` — "comments ARE valid
    // inside `${...}`". Comment text is discarded during scanning, ahead of any
    // operator recognition, so the pair never becomes a token.
    assertSilentBothLevels(
      `${FM}${PROLOGUE}let _ = @\`x \${c // a -- b and c++\n}\`\n`,
      "`--` / `++` inside a `//` comment inside `${…}`",
    );
  });

  it("CONTROL (b7): `--` / `++` inside a `//` comment at document level (bug 0084 cell s6)", () => {
    assertSilentBothLevels(
      `${FM}${PROLOGUE}// a -- b and c++\nlet _ = @\`x \${c}\`\n`,
      "`--` / `++` in a document-level `//` comment",
    );
  });

  it("CONTROL (b8): `--` / `++` inside STRING LITERALS inside the interpolation (bug 0084 cell s7)", () => {
    // String bodies are scanned as literal data. This is also the hazard the
    // declined route 2 (extending `firstForbiddenInterpolationToken`'s token
    // set) would re-open: `=` and `-` are not reserved the way `match` and `@`
    // are, so a token scan over a source containing string literals can
    // false-positive. The settled route cannot, because the parser decides.
    assertSilentBothLevels(
      `${FM}${PROLOGUE}let _ = @\`x \${"a--b"}\`\n`,
      '`--` inside a string literal inside `${…}`',
    );
    assertSilentBothLevels(
      `${FM}${PROLOGUE}let _ = @\`x \${"c++"}\`\n`,
      '`++` inside a string literal inside `${…}`',
    );
  });
});

// ===========================================================================
// (c) THE TWO WALK MEMBERS AT EXACTLY ONE DIAGNOSTIC EACH — the
// leading-offence-precedence lock. The pre-existing forbidden-form /
// forbidden-token check runs FIRST; when it fires, that diagnostic is the ONLY
// one pushed for that part and the collected parser diagnostics are dropped.
// Green now, and required green after: these four committed cells
// (tests/e2e-s1-expr-diagnostics.test.ts:114–130, :155–171) must not gain a
// second row.
// ===========================================================================

describe("bug 0122 (c) — leading-offence precedence: the walk's two members stay at ONE", () => {
  it("LOCK (c1): `${match c { _ => 1 }}` draws EXACTLY one diagnostic", () => {
    // expressions.md:40 — `match` is admitted at `let`-RHS level (its control is
    // silent, measured) and refused inside `${…}`. The `=> 1` arm is an arrow
    // token the parser also sees, so a route that pushed the collected parser
    // diagnostics ALONGSIDE the walk's own row would land here first.
    const doc = parse(interpSrc("match c { _ => 1 }"));
    const range = soleQueryRange(doc);
    expect(
      project(doc.diagnostics),
      `LOCK (bug 0122, leading-offence precedence): the walk's \`match\` member must stay at EXACTLY ONE diagnostic — the four committed cells in tests/e2e-s1-expr-diagnostics.test.ts depend on it. Observed: ${show(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: UNSUPPORTED_FEATURE_CODE,
        message: interpolationFormMessage("match"),
        file: FIXTURE_PATH,
        range,
      },
    ]);
    // And its control really is legal at `let`-RHS level, which is what proves
    // the walk is reachable and position-qualified rather than accidental.
    assertSilentBothLevels(
      rhsSrc("match c { _ => 1 }"),
      "`let _ = match c { _ => 1 }` (legal at `let`-RHS level, expressions.md:40)",
    );
  });

  it("LOCK (c2): a nested @`y` inside `${…}` draws EXACTLY one interpolation-attributed diagnostic", () => {
    // MEASURED DISAGREEMENT with the task's "diagnostics array has length
    // exactly 1" for this row: the whole array CANNOT be length 1 at this HEAD.
    // The whole-file lexer terminates the OUTER template at the nested
    // backtick, so `let _ = @`x ${@`y`}`` also draws, unavoidably:
    //   error theta/parse/unknown-identifier | unknown identifier 'y'
    //   error theta/parse/unsupported-feature
    //     | unsupported syntactic feature: backtick template in value position
    //       (query templates must be @-prefixed)
    // (the shipped committed cell at tests/e2e-s1-expr-diagnostics.test.ts:123
    // asserts only `hasCode` for exactly this reason, and its bare-tail shape
    // draws a fourth row, `theta/parse/discarded-query-result`). The lock this
    // cell can carry — and the one leading-offence precedence is about — is that
    // exactly ONE diagnostic is attributed to the interpolation itself.
    const doc = parse(interpSrc("@`y`"));
    const range = soleQueryRange(doc);
    const attributed = doc.diagnostics.filter((d) =>
      d.message.includes("inside ${...} interpolation"),
    );
    expect(
      project(attributed),
      `LOCK (bug 0122, leading-offence precedence): the walk's nested-@\`-query member must stay at EXACTLY ONE interpolation-attributed diagnostic. Observed (whole array): ${show(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: UNSUPPORTED_FEATURE_CODE,
        message: interpolationFormMessage("@-query template"),
        file: FIXTURE_PATH,
        range,
      },
    ]);
    // Pinned so the outer-template mis-nesting above is a stated measurement
    // rather than a silent tolerance: exactly three rows, no more.
    expect(
      doc.diagnostics.map((d) => d.code),
      "MEASURED at this HEAD: the two extra rows come from the outer template terminating at the nested backtick, NOT from the interpolation walk. If the count changes, re-derive before relaxing.",
    ).toEqual([
      UNSUPPORTED_FEATURE_CODE,
      UNKNOWN_IDENTIFIER_CODE,
      UNSUPPORTED_FEATURE_CODE,
    ]);
  });

  it("LOCK (c3): `${match c { _ => 1 } = 2}` pins the leading-offence `continue` itself", () => {
    // (c1) cannot witness the `continue` after the `firstForbiddenInterpolationForm`
    // push: `match c { _ => 1 }` parses WHOLE (`parseInterpolationSource`'s
    // `collected` is `[]`), so there is nothing for the guard to be dropping and
    // removing the `continue` leaves (c1) green regardless. Appending ` = 2`
    // keeps the same forbidden `match` form (still trips
    // `firstForbiddenInterpolationForm`) but leaves residue (` = 2`) that the
    // `parseSingleExpressionWithResidue` drain DOES collect a diagnostic for —
    // MEASURED: with the `continue` in place the interpolation draws exactly the
    // one `match` row below; with the `continue` removed (verified by a
    // temporary inline removal, restored byte-exactly) the array GROWS to two
    // rows, the second being the stray-'=' row the `let`-RHS control also draws.
    // This cell therefore reds if that `continue` is ever removed.
    const doc = parse(interpSrc("match c { _ => 1 } = 2"));
    const range = soleQueryRange(doc);
    expect(
      project(doc.diagnostics),
      `LOCK (bug 0122, leading-offence precedence \`continue\`): a forbidden form whose residue the drain WOULD collect a diagnostic for must still stay at exactly one diagnostic. Observed: ${show(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: UNSUPPORTED_FEATURE_CODE,
        message: interpolationFormMessage("match"),
        file: FIXTURE_PATH,
        range,
      },
    ]);
    // Parity control: `let _ = match c { _ => 1 } = 2` draws the stray-'='
    // row the drain would have collected inside `${…}` had the `continue` not
    // dropped it.
    const control = parse(rhsSrc("match c { _ => 1 } = 2"));
    expect(
      codeAndMessage(control.diagnostics),
      `MEASURED CONTROL for (c3): \`let _ = match c { _ => 1 } = 2\` draws the stray-'=' row. Observed: ${show(control)}`,
    ).toEqual([{ code: UNSUPPORTED_FEATURE_CODE, message: strayMessage("=") }]);
  });
});

// ===========================================================================
// (d) THE LEX-PHASE ROWS — unaffected by this defect and required unchanged.
// src/lexer/lexer.ts's template state machine leaves prose on `${` and resumes
// ordinary code lexing until the matching `}`, so a lex diagnostic raised inside
// an interpolation reaches `doc.diagnostics` through the whole-file lex. This is
// the report's scope boundary: a fix reaching for the lexer aims at the wrong
// pass. Green now, green after.
// ===========================================================================

describe("bug 0122 (d) — the lex-phase rows keep firing from inside `${…}`", () => {
  function assertLexRow(src: string, code: string, message: string, what: string): void {
    const doc = parse(src);
    expect(
      codeAndMessage(doc.diagnostics),
      `LOCK (bug 0122 §Expected): ${what} must keep firing from inside \`\${…}\` exactly as measured — the lex phase is NOT affected by this defect. Observed: ${show(doc)}`,
    ).toEqual([{ code, message }]);
  }

  it("LOCK (d1): a block comment inside `${…}` draws theta/parse/block-comment", () => {
    assertLexRow(
      `${FM}${PROLOGUE}let _ = @\`x \${/* z */ c}\`\n`,
      BLOCK_COMMENT_CODE,
      registered(BLOCK_COMMENT_CODE),
      "a `/* … */` block comment inside an interpolation (code-registry-parse.md:23)",
    );
  });

  it("LOCK (d2): a literal newline in a string inside `${…}` draws theta/parse/literal-newline-in-string", () => {
    assertLexRow(
      `${FM}${PROLOGUE}let _ = @\`x \${"abc\n}\`\n`,
      LITERAL_NEWLINE_CODE,
      registered(LITERAL_NEWLINE_CODE),
      "an unterminated string literal inside an interpolation",
    );
  });

  it("LOCK (d3): an illegal escape inside `${…}` draws theta/parse/illegal-escape", () => {
    assertLexRow(
      `${FM}${PROLOGUE}let _ = @\`x \${"a\\q"}\`\n`,
      ILLEGAL_ESCAPE_CODE,
      illegalEscapeMessage("q"),
      "an illegal escape sequence inside an interpolation",
    );
  });
});

// ===========================================================================
// (e) POSITION INDEPENDENCE. `parseQuery` is the only producer of a `QueryExpr`
// and every route to one converges on the same two walks, so the silence does
// not depend on where the query sits — and neither may the fix. (e3) settles the
// bug doc §Fix (b) question "whether that is two diagnostics or one": TWO, one
// per offence, both located at the enclosing query's range.
// ===========================================================================

describe("bug 0122 (e) — the fix is position-independent", () => {
  it("RED (e1): the same offence inside a `fn` body draws the row at the fn's query range", () => {
    // Measured inside `${…}` in a `fn` body: []. The query is not the document
    // tail here, which is why {@link soleQueryRange} walks the AST rather than
    // reading `body.tail`.
    const src = `${FM}${PROLOGUE}fn f(k: integer): string {\n  @\`x \${k--}\`\n}\nlet _ = f(1)\n`;
    const doc = parse(src);
    const range = soleQueryRange(doc);
    expect(
      project(doc.diagnostics),
      `PRIMARY (bug 0122): the silence is position-independent, so the fix must be too — a query inside a \`fn\` body draws the same row. Observed: ${show(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: INCREMENT_DECREMENT_CODE,
        message: incDecMessage("--"),
        file: FIXTURE_PATH,
        range,
      },
    ]);
  });

  it("RED (e2): the same offence inside a TYPED query `@<integer>`…`` draws the row", () => {
    // A typed query reaches `QueryExpr` through the same `parseQuery`; measured
    // silent today.
    const doc = parse(`${FM}${PROLOGUE}let _ = @<integer>\`x \${c--}\`\n`);
    const range = soleQueryRange(doc);
    expect(
      project(doc.diagnostics),
      `PRIMARY (bug 0122): a typed query is the same \`QueryExpr\` and draws the same row. Observed: ${show(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: INCREMENT_DECREMENT_CODE,
        message: incDecMessage("--"),
        file: FIXTURE_PATH,
        range,
      },
    ]);
  });

  it("RED (e3): TWO interpolations in one template draw TWO diagnostics, both at the query's range", () => {
    // Bug doc §Fix (b): "several diagnostics from one interpolation, or from
    // several interpolations in one template, then collapse onto one range …
    // Whether that is two diagnostics or one must be stated." SETTLED: two —
    // one per offence, in template order, both located at the enclosing query's
    // range, because the settled rule is per-interpolation-part parity with the
    // `let`-RHS position and each part is judged on its own.
    const doc = parse(`${FM}${PROLOGUE}let _ = @\`\${c--} and \${c++}\`\n`);
    const range = soleQueryRange(doc);
    expect(
      project(doc.diagnostics),
      `PRIMARY (bug 0122 §Fix (b), settled): BOTH offences surface, one per offending interpolation, both at the enclosing @\`-query's range. Observed: ${show(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: INCREMENT_DECREMENT_CODE,
        message: incDecMessage("--"),
        file: FIXTURE_PATH,
        range,
      },
      {
        severity: "error",
        code: INCREMENT_DECREMENT_CODE,
        message: incDecMessage("++"),
        file: FIXTURE_PATH,
        range,
      },
    ]);
  });
});

// ===========================================================================
// (f) THE RENDERED-TURN HALF — the wire-facing observable. The prompt-mode drive
// over the session double, the harness the bug doc's §Fix witness paragraph
// names (tests/interpolated-result-gate.test.ts's group-(b)/(c) drive,
// reproduced here because that file is a LOCK and is not on this diff). An
// UNTYPED prompt-mode query never dispatches `complete()`, so no provider and no
// model is involved: the injected Clock's `setTimeout` ticks the double.
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** The user session's selected model (`ctx.model`) — provider derivation only. */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

class LiveSessionDouble {
  /** Every text handed to `pi.sendUserMessage` — the wire-facing observable. */
  readonly sentQueryTexts: string[] = [];
  #idle = true;

  sendUserMessage(content: string): void {
    this.sentQueryTexts.push(content);
    this.#idle = false;
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /** Complete the in-flight streamed turn. */
  tick(): void {
    this.#idle = true;
  }
}

function livePi(session: LiveSessionDouble): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    sendMessage: (): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}

function rootLive(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}

function registryDouble(): ModelRegistry {
  return {
    getAvailable: () => [ANTHROPIC_MODEL],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

function ctxLive(session: LiveSessionDouble): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** The post-fix disposition: refused at load, so nothing is ever rendered. */
const REFUSED = "REFUSED AT LOAD — no turn rendered";

/**
 * One fixture's whole-pipeline disposition as a single comparable string, so a
 * pre-fix/post-fix pair IS one assertion: either the load refuses the source
 * (post-fix) or the drive proceeds and the string carries the exact turn the
 * model receives (pre-fix). A drive that throws reports the throw and the empty
 * send list, which is the third measured pre-fix disposition.
 */
async function disposition(src: string): Promise<string> {
  const doc = parse(src);
  const errs = doc.diagnostics.filter((d) => d.severity === "error");
  if (errs.length > 0) {
    return REFUSED;
  }
  const session = new LiveSessionDouble();
  const deps = createProductionProducerDeps({
    pi: livePi(session),
    root: rootLive(session),
    modelRegistry: registryDouble(),
  });
  const theta: ThetaCompositionInput = {
    slashName: "bug0122",
    sourcePath: FIXTURE_PATH,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxLive(session) });
  if (binding.drivenAgainst !== "prompt-user-session") {
    throw new Error(
      `harness: expected the LIVE prompt-mode drive, got ${String(binding.drivenAgainst)}`,
    );
  }
  try {
    await executeBody(doc.body, binding.executeDeps);
  } catch (thrown) {
    return `THREW ${String(thrown)} — sent=${JSON.stringify(session.sentQueryTexts)}`;
  }
  return `RENDERED ${JSON.stringify(session.sentQueryTexts)}`;
}

describe("bug 0122 (f) — the rendered turn: a refused source renders nothing", () => {
  it("RED (f1): `${c = 1}` is refused at load, so the prompt never carries `x 5`", async () => {
    // MEASURED PRE-FIX: RENDERED ["x 5"] — the value of `c`. The prompt carries
    // an expression the author did not write, with nothing on any channel
    // recording the substitution. POST-FIX: the source is refused at load (see
    // cell (a3) for the exact row), so no turn is rendered at all.
    expect(
      await disposition(interpSrc("c = 1")),
      "PRIMARY (bug 0122 §Why it matters): `${c = 1}` must not reach the wire. Pre-fix measured disposition: RENDERED [\"x 5\"]",
    ).toBe(REFUSED);
  });

  it("RED (f2): `${1 === 1}` is refused at load, so the prompt never carries `x 1`", async () => {
    // MEASURED PRE-FIX: RENDERED ["x 1"] — `1 === 1` truncates to `1`.
    // POST-FIX: refused at load (cell (a4)).
    expect(
      await disposition(interpSrc("1 === 1")),
      "PRIMARY (bug 0122 §Why it matters): `${1 === 1}` must not reach the wire. Pre-fix measured disposition: RENDERED [\"x 1\"]",
    ).toBe(REFUSED);
  });

  it("RED (f3): `${c--}` is refused at load — the origin row's rendered turn", async () => {
    // MEASURED PRE-FIX: RENDERED ["x 5"] — bug 0084's residual (ii) observable.
    expect(
      await disposition(interpSrc("c--")),
      "PRIMARY (bug 0122): the origin row. Pre-fix measured disposition: RENDERED [\"x 5\"]",
    ).toBe(REFUSED);
  });

  it("PINNED (f4): the three out-of-reach render dispositions, measured", async () => {
    // Residual 1's wire-facing cost, pinned so it is stated rather than implied.
    // `1 + "a"` used to render the JavaScript coercion QRY-18 exists to refuse;
    // bug 0345's operand descent now closes that member of residual 1, so this
    // source refuses at load (cell (a11)) and never reaches the wire. The other
    // two abort the drive after ZERO turns under an uncoded JavaScript `Error` /
    // a runtime panic — non-operand checks bug 0345 does not own — and stay as
    // measured.
    expect(
      await disposition(interpSrc('1 + "a"')),
      'PRIMARY (bug 0345): `${1 + "a"}` now refuses at load instead of rendering the JS coercion',
    ).toBe(REFUSED);
    expect(
      await disposition(interpSrc("s.frobnicate()")),
      "PINNED RESIDUAL 1: an uncoded JavaScript `Error`, after zero turns were sent",
    ).toBe("THREW Error: unknown string stdlib member: frobnicate — sent=[]");
    expect(
      await disposition(interpSrc("o[0]")),
      "PINNED RESIDUAL 1: a runtime panic standing in for a type-phase parse rejection",
    ).toBe(
      "THREW NonObjectReceiverError: non-object receiver: cannot read [0] on a number — sent=[]",
    );
  });
});

// ===========================================================================
// (g) THE CORPUS CENSUS AS A GATE (bug doc §Fix witness list: "the corpus census
// as a gate rather than a note"; GOV-15 blast radius). Every committed
// `.theta` / `.thetalib` is swept, every `@`-template extracted, and every
// interpolation checked against the settled rule: it must parse, consume its
// whole source (nothing for the residue drain to see) and contain no member of
// the rejected token classes. 0 truncated / 0 flagged.
//
// The committed-file enumeration mechanism is read off
// tests/committed-fixture-parse-gate.test.ts (`git ls-files -z -- '*.theta'
// '*.thetalib'`, less the seeded-invalid directory, NUL-separated so a path
// byte containing a newline cannot split into two entries), not hard-coded.
// ===========================================================================

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SEEDED_INVALID_DIR = "tests/fixtures/h7b-invalid/";

/** Measured at HEAD fdcb0835: bump in the SAME commit that adds/removes a file. */
const EXPECTED_SHIPPED_THETA = 31;
const EXPECTED_SHIPPED_THETALIB = 2;
/** Measured at HEAD fdcb0835: 38 `@`-templates carrying 37 interpolations. */
const EXPECTED_TEMPLATES = 38;
const EXPECTED_INTERPOLATIONS = 37;

/**
 * The token classes expressions.md:25–40 refuses, as raw substrings. A committed
 * interpolation containing one would be newly refused by the settled rule (or,
 * for the residual-2 members, silently rewritten), so the census scans for them
 * directly — the range-based truncation check below cannot see a postfix `--`,
 * whose token IS consumed by `parsePostfix` even though the node's range stops
 * before it (measured: `parseExpressionSource("c--")` yields an `ident` whose
 * range ends at column 2).
 */
const REJECTED_TOKEN_CLASSES = [
  "--",
  "++",
  "===",
  "!==",
  "?.",
  "??",
  "...",
  "=>",
  "/*",
  "&",
  "|",
  "^",
  "<<",
  ">>",
];

function discoverShippedFixtures(): string[] {
  const result = spawnSync("git", ["ls-files", "-z", "--", "*.theta", "*.thetalib"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      "bug 0122's census corpus is the git index (`git ls-files '*.theta' '*.thetalib'`), " +
        "not the working tree: the unmet precondition is a working `git` executable plus a " +
        `repository checkout at the test root. status=${String(result.status)} ` +
        `error=${result.error?.message ?? "none"} stderr=${result.stderr}`,
    );
  }
  return result.stdout
    .split("\0")
    .filter((p) => p.length > 0)
    .filter((p) => !p.startsWith(SEEDED_INVALID_DIR))
    .sort();
}

const shippedFixtures = discoverShippedFixtures();

interface Census {
  readonly templates: number;
  readonly interpolations: number;
  readonly findings: string[];
}

function census(): Census {
  let templates = 0;
  let interpolations = 0;
  const findings: string[] = [];
  for (const rel of shippedFixtures) {
    const bytes = new Uint8Array(readFileSync(join(REPO_ROOT, rel)));
    const doc = parseThetaDocument({ path: rel, bytes }, parseDeps());
    if (doc.diagnostics.length > 0) {
      findings.push(`${rel}: FLAGGED ${doc.diagnostics.map((d) => d.code).join(",")}`);
    }
    const found: { template: string; range: SourceRange }[] = [];
    queryNodes(doc.body, found);
    templates += found.length;
    for (const q of found) {
      for (const part of lexQueryTemplate(q.template).parts) {
        if (part.kind !== "interp") {
          continue;
        }
        interpolations += 1;
        const src = part.exprSource;
        for (const cls of REJECTED_TOKEN_CLASSES) {
          if (src.includes(cls)) {
            findings.push(`${rel}: REJECTED-CLASS ${JSON.stringify(cls)} in ${JSON.stringify(src)}`);
          }
        }
        const expr = parseExpressionSource(src);
        if (expr === null) {
          findings.push(`${rel}: UNPARSABLE ${JSON.stringify(src)}`);
          continue;
        }
        if (expr.range.end.line !== 1 || expr.range.end.column !== src.length + 1) {
          findings.push(
            `${rel}: TRUNCATED ${JSON.stringify(src)} — parsed range ends at ` +
              `${expr.range.end.line}:${expr.range.end.column} of ${src.length + 1}`,
          );
        }
      }
    }
  }
  return { templates, interpolations, findings };
}

describe("bug 0122 (g) — the corpus census as a GATE: no committed interpolation is flagged", () => {
  it("GATE (g1): the census corpus is the whole committed set — a shrunken sweep fails loudly", () => {
    expect(
      {
        theta: shippedFixtures.filter((p) => p.endsWith(".theta")).length,
        thetalib: shippedFixtures.filter((p) => p.endsWith(".thetalib")).length,
      },
      "the census scores every committed theta source of BOTH extensions, less the " +
        "seeded-invalid directory. Adding or removing one is deliberate: bump " +
        "EXPECTED_SHIPPED_THETA / EXPECTED_SHIPPED_THETALIB in the SAME commit.",
    ).toEqual({
      theta: EXPECTED_SHIPPED_THETA,
      thetalib: EXPECTED_SHIPPED_THETALIB,
    });
    expect(
      shippedFixtures.filter((p) => p.startsWith(".pi/")),
      "`.pi/` is gitignored, so a corpus member under it is untracked working-tree state no commit records",
    ).toEqual([]);
  });

  it("GATE (g2): 0 committed interpolations gain a diagnostic under the settled rule", () => {
    const { templates, interpolations, findings } = census();
    expect(
      { templates, interpolations },
      "a vacuous census is worse than none: the sweep must actually reach the " +
        "committed interpolations. Bump EXPECTED_TEMPLATES / " +
        "EXPECTED_INTERPOLATIONS in the SAME commit that adds or removes one.",
    ).toEqual({
      templates: EXPECTED_TEMPLATES,
      interpolations: EXPECTED_INTERPOLATIONS,
    });
    expect(
      findings,
      "GOV-15 blast radius (bug 0122 §Fix (d)): the settled rule only fires where an " +
        "interpolation leaves tokens unconsumed or contains a refused construct, and the " +
        "committed corpus contains neither. Each finding above is a committed theta the fix " +
        "would newly refuse — which is a spec-versioning decision, not a test failure to relax.",
    ).toEqual([]);
  });
});