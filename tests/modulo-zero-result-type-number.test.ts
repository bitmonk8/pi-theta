import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { Block, Expr, Stmt, ThetaDocument } from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import {
  checkCompatible,
  displayType,
  type Compatibility,
  type CompatType,
  type TypeEnv,
} from "../src/parser/type-compat";
import { executeBody } from "../src/runtime/statement-executor";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0152 — `#typeBinary` (src/parser/static-type-inference.ts:437) carries a
// per-operator arm for `/` (:465) and none for `%`, so `1 % 0` falls to the
// operand-common reduction (:470) and types as `integer` against the spec
// sentence that widens an `integer % 0` result to `number`
// (docs/bugs/0152-modulo-zero-result-type-not-number.md).
//
// THE SPEC SENTENCE. docs/spec_topics/expressions.md:234, §"Other arithmetic"
// (heading at :232), states a general rule and a value-keyed exception to it,
// in that order: "`%` follows the same `integer ⊑ number` widening: two
// `integer` operands produce `integer`, and either operand being `number`
// widens the result to `number`" … "Modulo by zero (`n % 0`) likewise produces
// `NaN` and does not panic; because `NaN` is a `number`, an `integer % 0`
// result widens to `number`". The specific governs the general on the inputs it
// names.
//
// THE ROUTE UNDER TEST — ROUTE A of the bug's §Fix (a), the adjudication this
// run took, and NOT one step wider. `<divisor is statically zero>` admits a
// LITERAL INTEGER-TYPED ZERO NODE and nothing else: the right operand, after
// the parser's transparent parentheses (src/parser/theta-document.ts:138–141
// carries `text` / `numericType`; no value), is `{ kind: "number",
// numericType: "integer" }` with `Number(text) === 0`. The arm sits in
// `#typeBinary` AFTER the `/` arm (:465) and BEFORE the `#commonType` call
// (:470), returns `{ kind: "prim", name: "number" }`, and — like the `/` arm —
// does NOT consult the LEFT operand. §Fix (c) settles as MIRROR:
// `collectProvableArgTypes` (src/extension/invoke-static-checks.ts:505) gains
// the same-guarded `return [pass.typeOf(expr, env)]` after its own `/` arm
// (:551) and before `collectArmUnion` (:572), so the collector cannot render
// differently from the type the pass assigns (its header invariant, :495–499).
//
// ROUTE A'S RESIDUALS ARE PINNED, NOT OMITTED (group R below). Route B
// (constant folding) and route C (provably-zero bindings) were enumerated and
// NOT taken, so three input classes keep binding `NaN` into an
// `integer`-annotated position with no diagnostic, by decision:
//   `1 % -0`        — `parseUnary` models unary minus as a binary with a
//                     synthetic `null` left, so the divisor is a `binary` node,
//                     not a `NumberExpr` (t12 / D4 / b11 / h8).
//   `1 % (2 - 2)`   — no constant folder runs at parse time (t11 / D5 / b7 / h7).
//   `let z = 0` …   — `bindings` maps a name to a `CompatType`, never to a
//     `1 % z`         value (D6 / b8 / b9 / h9).
// Each row asserts the SILENCE, so the scope taken is a measured fact rather
// than an omission and a later route-B / route-C fix has a starting inventory.
//
// THE POST-FIX CONTRACT THIS FILE PINS, cell by cell:
//
//   t1, t5, t6,   the raw `typeOf` read on a `%` node with a literal
//   t13–t17       integer-zero divisor is `number` — including through the
//                 transparent parentheses (t13), the `00` spelling (t17), the
//                 chained `1 % 2 % 0` (t16) and the two carriers that take the
//                 answer outward through `+` and unary `-` (t14, t15).
//   t2            `3 % 2` does NOT move — every non-zero divisor keeps the
//                 operand-common widening (§Fix (b), the pin a route that
//                 tested the OPERATOR rather than the DIVISOR reds on).
//   t3, t4, t18   `1.0 % 0`, `1 % 0.0` and `1 % 0e0` already read `number`
//                 through the operand widening, and must keep reading it — an
//                 arm ahead of the reduction must return the same token, not a
//                 different one.
//   t7–t10        `/`, `-`, `*`, `+` are untouched (§Non-goals).
//   t11, t12      the route-A residuals at the raw read.
//   D1–D9         the divisor-spelling table: the scope boundary pinned from
//                 BOTH sides in one table, so neither half can drift alone.
//   b1–b14        the typed-`let` sink, with its `1.5` / `1.0 % 0` / `3 / 2`
//                 controls and its four must-not-move rows.
//   a1–a22        the `fn`-argument, schema-field, `array<integer>`-element and
//                 `par for … max` sinks with their controls, the annotation-free
//                 `let` launder (a8), the §Non-goals `fn`-return pair (a15/a16),
//                 and — MANDATORY — a17 / a21, the only rows that separate a
//                 RETURNED PROOF from a WITHHOLD: both fire at this HEAD and
//                 after, and the observable that moves is the rendered
//                 `<actual>`, `integer` → `number`.
//   E1–E5         the non-numeric-LEFT emission class. The arm returns before
//                 either operand is typed, so it answers `number` for a
//                 `string` / `boolean` left too. Measured in BOTH directions at
//                 the direct sinks with `-` controls.
//   h1–h11        the runtime half. The parse-time refusal is the ONLY defence
//                 — all three shipped `%` implementations are plain IEEE-754
//                 remainder (src/runtime/statement-executor.ts:899,
//                 src/runtime/expression-evaluator.ts:524,
//                 src/extension/production-theta-producer.ts:6654) and none
//                 validates against an annotation — so each cell pins the VALUE
//                 (unchanged in both directions) beside the REFUSAL.
//   g1            the committed-corpus GOV-15 sweep, by measurement.
//   r1–r5, reg1   the extension-layer MIRROR at the `invoke`-argument sink, and
//                 the registration consequence measured through the shipped
//                 composition root.
//
// RED AT THIS HEAD (v0.183.0, offline, deterministic), each because the pass
// answers `integer` where the spec says `number`: t1, t5, t6, t13–t17 (raw
// read); D1–D3 (the admitted spellings); b1, b6, b12, b13, b14; a1, a6, a8, a9,
// a11, a13, a17 (rendering), a21 (rendering); E1–E5 (all five render or
// withhold the operand-common answer instead of `number`); the refusal half of
// h1, h2, h4, h5, h10; r1 (the collector renders `got integer`); reg1 (the
// theta REGISTERS). GREEN at this HEAD and required to stay green: every
// control, every §Non-goals row, every route-A residual, the corpus sweep, and
// every runtime VALUE.
//
// COORDINATION — two cells in a witness another report shipped. Bug 0142's
// `tests/division-result-type-number.test.ts` pinned the current reading as
// cell `t9` (`1 % 0` reads `integer|compatible`) and as the `b8` row of its
// `b3, b4, b8, b9` cell (`let n: integer = 1 % 0` produces `[]`). Both are
// RETAKEN in place by this report's adjudication — not deleted, and not routed
// around. The other 43 cells of that file stay green, which is the proof this
// arm did not reach `/`, `-`, `*`, `+` or a non-zero `%`.
//
// TIER — unit, offline, provider-free, deterministic. Every parse row settles
// inside one `parseThetaDocument` call through the house driver `parseDoc`
// (tests/helpers/e2e-s1.ts), every raw-type row inside one
// `StaticTypeInferencePass.typeOf` call over the shipped `checkCompatible`,
// every runtime row inside one `executeBody` on the production executor deps,
// and the mirror / registration rows inside one `discoverAndComposeFixtures`
// load of one planted `.pi/theta/` workspace — the two harness shapes
// tests/division-result-type-number.test.ts and
// tests/division-result-type-number-invoke.test.ts establish. Nothing on this
// path crosses a provider, a model, a child process or the network, so neither
// an integration nor a live tier reaches a seam this tier cannot.
//
// NO SILENT SKIPPING (CLAUDE.md). A missing registry row throws naming the
// registry page; every fixture's node anchor is located through a loud
// precondition that throws naming the cell; every absence cell first asserts
// the fixture actually contains the `%` whose silence it is measuring; the
// corpus sweep asserts both globs contributed before concluding; and the
// mirror cells call a shared positive control proving the row fires at all in
// the planted workspace before any absence is read.
//
// SPEC ANCHORS (every line re-derived against the tree at this HEAD):
//   - docs/spec_topics/expressions.md:232 — the §"Other arithmetic" heading;
//     :234 — the paragraph carrying the general `%` widening, the `n % 0`
//     carve-out with its `NaN`-is-a-`number` reason, the `-` / `*` rules this
//     fix must not move, `/`'s unconditional rule (bug 0142's, shipped), and
//     the closing safe-integer sentence that has work to do only because some
//     `%` results are not typed by the plain widening.
//   - docs/spec_topics/type-system.md:36 — TYPE-2, the one-way `integer ⊑
//     number` widening whose reverse every `integer-narrowing` cell reports;
//     :48 §"Unresolvable operands", the deferral NO row here engages (both
//     operands of `1 % 0` are literals in the source text); :52 — TYPE-9,
//     which routes the typed-`let` and `fn`-argument failures.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 — DIAG-4: the
//     *Message* column is normative and a test MUST source the string from it.
//     Every expected message below is read through `registryMessage`; :72 —
//     DIAG-2, which this fix does not engage: no registry row is added,
//     removed or edited, and each owed code is already emitted from the same
//     call site on its `1.5`-literal control.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:27 —
//     `theta/parse/integer-narrowing`; :43 —
//     `theta/parse/array-element-type-mismatch`; :49 —
//     `theta/parse/object-field-type-mismatch`; :59 —
//     `theta/parse/let-rhs-type-mismatch`; :134 —
//     `theta/parse/invoke-arg-type-mismatch`; :136 —
//     `theta/parse/fn-arg-type-mismatch`, whose *Trigger* also records that
//     "no runtime AJV safety net applies", which is what makes group (h) the
//     measurement of an undefended position.
//   - docs/spec_topics/diagnostics/code-registry-runtime.md — modulo by zero is
//     deliberately outside the panic catalogue, which is why group (h)'s VALUE
//     half does not move in either direction.
//   - docs/spec_topics/governance/source-language-stability.md:5 — GOV-15; :9 —
//     the loads-cleanly predicate; :25 — the diagnostic-registry carve-out
//     whose ADDITION arm cell g1 discharges by measurement.

// ===========================================================================
// DIAG-4 — every expected Message is read from the registry, never copied.
// ===========================================================================

const FN_ARG_CODE = "theta/parse/fn-arg-type-mismatch";
const NARROWING_CODE = "theta/parse/integer-narrowing";
const ARRAY_ELEMENT_CODE = "theta/parse/array-element-type-mismatch";
const LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";
const OBJECT_FIELD_CODE = "theta/parse/object-field-type-mismatch";
const INVOKE_ARG_CODE = "theta/parse/invoke-arg-type-mismatch";

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — the DIAG-4 oracle for this file. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * A registered code's normative *Message* template. Throws naming the registry
 * page when the row is absent, so a registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * Interpolate a registered template's `<…>` placeholders from `subs`, in one
 * pass so a substituted value is never re-scanned. The placeholder set is
 * derived from the TEMPLATE, not assumed: an unsupplied placeholder and an
 * unused substitution both throw, so a registry row that changes shape fails
 * loudly here instead of quietly producing a string no emission can equal.
 */
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const template = registered(code);
  const used = new Set<string>();
  const message = template.replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(
        `harness: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(
        `harness: this file substitutes ${token} into the ${code} Message, which no longer carries it — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
  }
  return message;
}

/** `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`. */
function fnArgMessage(
  fnName: string,
  index: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fill(
    FN_ARG_CODE,
    new Map([
      ["<name>", fnName],
      ["<i>", String(index)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `cannot narrow number to integer` — a placeholder-free registered Message. */
function narrowingMessage(): string {
  return fill(NARROWING_CODE, new Map());
}

/** `array element type mismatch at index <i>: expected <expected>, got <actual>`. */
function arrayElementMessage(index: number, expected: string, actual: string): string {
  return fill(
    ARRAY_ELEMENT_CODE,
    new Map([
      ["<i>", String(index)],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `let binding '<name>' initialiser type mismatch: expected <expected>, got <actual>`. */
function letRhsMessage(name: string, expected: string, actual: string): string {
  return fill(
    LET_RHS_CODE,
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `field '<field>' on schema '<schema>' type mismatch: expected <expected>, got <actual>`. */
function objectFieldMismatchMessage(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return fill(
    OBJECT_FIELD_CODE,
    new Map([
      ["<field>", field],
      ["<schema>", schema],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `invoke argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`. */
function invokeArgMessage(
  slot: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fill(
    INVOKE_ARG_CODE,
    new Map([
      ["<i>", String(slot)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

// ===========================================================================
// Parse harness — the house driver, plus AST anchors that double as the loud
// precondition every cell runs first.
// ===========================================================================

const FILE = "bug0152.theta";

/** Frontmatter for every fixture — occupies lines 1–3, body starts at line 4. */
const FM = "---\nmode: prompt\n---\n";

/** An empty `TypeEnv`: no fixture in group (t) or (D) declares a named type. */
const EMPTY_ENV = {} as TypeEnv;

function parse(src: string): ThetaDocument {
  return parseDoc(FM + src, FILE);
}

function at(r: SourceRange | undefined): string {
  return r === undefined
    ? "-"
    : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** Every diagnostic rendered `severity code @l:c-l:c: message` — failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map(
      (d: Diagnostic) => `${d.severity} ${d.code} @${at(d.range)}: ${d.message}`,
    ),
  );
}

/** The whole aggregated diagnostic list as comparable `severity code message @range` strings. */
function allHits(doc: ThetaDocument): string[] {
  return doc.diagnostics.map(
    (d: Diagnostic) => `${d.severity} ${d.code} ${d.message} @${at(d.range)}`,
  );
}

/** One expected entry of `allHits`, built from a registry-sourced message. */
function hit(code: string, message: string, anchor: SourceRange): string {
  return `error ${code} ${message} @${at(anchor)}`;
}

interface Anchors {
  readonly calls: ReadonlyArray<{ readonly callee: string; readonly args: readonly SourceRange[] }>;
  readonly lets: ReadonlyArray<{
    readonly name: string;
    readonly range: SourceRange;
    readonly init: SourceRange | undefined;
  }>;
  readonly objectFields: ReadonlyArray<{ readonly name: string; readonly value: SourceRange }>;
  readonly parForMaxes: readonly SourceRange[];
  /** Every `{ kind: "binary", op: "%" }` node — the non-vacuity channel. */
  readonly modulos: readonly SourceRange[];
  /** The right operand of every `%` node, in the same order — group (D) reads it. */
  readonly moduloDivisors: readonly Expr[];
}

/**
 * Every anchor this file's assertions range against, collected in one walk.
 *
 * The walk covers the node kinds these fixtures use; a fixture whose node it
 * cannot reach fails one of the loud preconditions below rather than letting an
 * absence assertion pass while measuring nothing. `modulos` is what makes the
 * silence cells non-vacuous: a cell asserting "`1 % -0` at this sink draws
 * nothing" first asserts the parsed fixture actually holds a `%` node.
 */
function anchorsOf(doc: ThetaDocument): Anchors {
  const calls: Array<{ callee: string; args: SourceRange[] }> = [];
  const lets: Array<{ name: string; range: SourceRange; init: SourceRange | undefined }> = [];
  const objectFields: Array<{ name: string; value: SourceRange }> = [];
  const parForMaxes: SourceRange[] = [];
  const modulos: SourceRange[] = [];
  const moduloDivisors: Expr[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        calls.push({ callee: e.callee, args: e.args.map((a) => a.range) });
        for (const a of e.args) walkExpr(a);
        return;
      case "invoke":
        calls.push({ callee: "invoke", args: e.args.map((a) => a.range) });
        for (const a of e.args) walkExpr(a);
        return;
      case "method-call":
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "array":
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        for (const f of e.fields) {
          objectFields.push({ name: f.name, value: f.value.range });
          walkExpr(f.value);
        }
        return;
      case "ternary":
        walkExpr(e.condition);
        walkExpr(e.consequent);
        walkExpr(e.alternate);
        return;
      case "binary":
        if (e.op === "%") {
          modulos.push(e.range);
          moduloDivisors.push(e.right);
        }
        walkExpr(e.left);
        walkExpr(e.right);
        return;
      case "member":
        walkExpr(e.target);
        return;
      case "index":
        walkExpr(e.target);
        walkExpr(e.index);
        return;
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
      case "result-ctor":
        walkExpr(e.arg);
        return;
      case "par-for":
        walkExpr(e.iterand);
        if (e.max !== null) {
          parForMaxes.push(e.max.range);
          walkExpr(e.max);
        }
        walkBlock(e.body);
        return;
      default:
        return;
    }
  };
  const walkBlock = (b: Block): void => {
    for (const s of b.statements) walkStmt(s);
    if (b.tail !== null) walkExpr(b.tail);
  };
  const walkStmt = (s: Stmt): void => {
    switch (s.kind) {
      case "let":
        lets.push({ name: s.name, range: s.range, init: s.init?.range });
        if (s.init !== null) walkExpr(s.init);
        return;
      case "reassign":
        walkExpr(s.value);
        return;
      case "expr":
        walkExpr(s.expr);
        return;
      case "tool-call":
        walkExpr(s.call);
        return;
      case "invoke":
        walkExpr(s.invoke);
        return;
      case "return":
        if (s.operand !== null) walkExpr(s.operand);
        return;
      case "fn":
        walkBlock(s.body);
        return;
      case "for":
        walkExpr(s.iterand);
        walkBlock(s.body);
        return;
      case "while":
        walkExpr(s.condition);
        walkBlock(s.body);
        return;
      case "if":
        walkExpr(s.condition);
        walkBlock(s.then);
        return;
      default:
        return;
    }
  };
  walkBlock(doc.body);
  return { calls, lets, objectFields, parForMaxes, modulos, moduloDivisors };
}

/**
 * The fixture holds exactly `count` `%` nodes.
 *
 * This is the precondition that makes a "draws nothing" cell mean something: a
 * fixture that stopped parsing its modulo (or stopped parsing at all) must fail
 * here rather than satisfy an absence assertion vacuously.
 */
function expectModulos(doc: ThetaDocument, count: number, cell: string): void {
  expect(
    anchorsOf(doc).modulos.length,
    `PRECONDITION (${cell}): the fixture must parse to exactly ${count} \`%\` node(s), or the assertion below measures a source that does not take a remainder. Diagnostics: ${render(doc)}`,
  ).toBe(count);
}

/** The range of argument `index` of the fixture's sole call of `callee`. */
function argRange(doc: ThetaDocument, callee: string, index: number): SourceRange {
  const calls = anchorsOf(doc).calls.filter((c) => c.callee === callee);
  expect(
    calls,
    `PRECONDITION: the fixture must hold exactly one call of '${callee}'; the parse found ${calls.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  const args = calls[0]!.args;
  expect(
    args.length,
    `PRECONDITION: the call of '${callee}' must carry an argument at index ${index}; it carries ${args.length}. Diagnostics: ${render(doc)}`,
  ).toBeGreaterThan(index);
  return args[index]!;
}

/**
 * The range of the fixture's sole `let` named `name` — the anchor
 * `checkLetRhsCompat` (src/parser/type-compat.ts:429) reports its narrowing on,
 * which its `1.5`-literal control measures on the same shape.
 */
function letRange(doc: ThetaDocument, name: string): SourceRange {
  const hits = anchorsOf(doc).lets.filter((l) => l.name === name);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`let ${name}\`; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.range;
}

/** The range of that `let`'s initialiser — the array-element sink's anchor. */
function letInitRange(doc: ThetaDocument, name: string): SourceRange {
  const hits = anchorsOf(doc).lets.filter((l) => l.name === name);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`let ${name}\`; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  const init = hits[0]!.init;
  expect(
    init,
    `PRECONDITION: \`let ${name}\` must carry an initialiser. Diagnostics: ${render(doc)}`,
  ).toBeDefined();
  return init as SourceRange;
}

/** The range of the sole schema-constructor field value named `field`. */
function objectFieldRange(doc: ThetaDocument, field: string): SourceRange {
  const hits = anchorsOf(doc).objectFields.filter((f) => f.name === field);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one constructor field '${field}'; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.value;
}

/** The range of the sole `par for … max` operand — that sink's own anchor. */
function parForMaxRange(doc: ThetaDocument): SourceRange {
  const hits = anchorsOf(doc).parForMaxes;
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`par for … max\` operand; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!;
}

// ===========================================================================
// Raw-type harness — the pass in isolation, over the shipped `⊑` engine.
// ===========================================================================

interface RawRead {
  readonly display: string;
  readonly vsInteger: Compatibility;
  readonly raw: string;
}

/**
 * `StaticTypeInferencePass.typeOf` on the fixture's body tail.
 *
 * The read is reported as `displayType` plus `checkCompatible(t, integer)`
 * rather than as the raw `CompatType` object: those two are what every sink in
 * groups (b), (a) and (E) consumes, and the `literal`-versus-`prim` distinction
 * the object carries is a §Non-goal of this report (a fix returning
 * `{ kind: "prim", name: "number" }` changes the raw shape with no observable
 * consequence, as bug 0142's `t5` recorded for `/`). The raw object rides along
 * in the failure payload so a red names the shape that produced it.
 */
function typeOfTail(src: string, cell: string): RawRead {
  const doc = parse(src);
  expect(
    doc.diagnostics.filter((d: Diagnostic) => d.severity === "error").map((d) => d.code),
    `PRECONDITION (${cell}): the raw-read fixture must parse without an error-severity diagnostic, or the type read below is about a parse failure. Diagnostics: ${render(doc)}`,
  ).toEqual([]);
  const tail = doc.body.tail;
  expect(
    tail,
    `PRECONDITION (${cell}): the fixture must end in a trailing expression, which is the node the read is taken on. Diagnostics: ${render(doc)}`,
  ).not.toBeNull();
  const type = new StaticTypeInferencePass({ checkCompatible, enumNames: new Set() }).typeOf(
    tail as Expr,
    EMPTY_ENV,
  );
  return {
    display: displayType(type),
    vsInteger: checkCompatible(type, { kind: "prim", name: "integer" }, EMPTY_ENV),
    raw: JSON.stringify(type),
  };
}

/** `display|vs-integer` — one comparable string per raw read. */
function reading(src: string, cell: string): string {
  const r = typeOfTail(src, cell);
  return `${r.display}|${r.vsInteger}`;
}

/** The reading a zero-divisor `%` node is owed, and the reading the widening produces. */
const NUMBER_READING = "number|integer-narrowing";
const INTEGER_READING = "integer|compatible";

// ===========================================================================
// Runtime harness — the production executor deps, the shape
// tests/division-result-type-number.test.ts establishes. Offline: every fixture
// is query-free, so no model and no provider is reached.
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: {
      checkpoint: NOOP_CHECKPOINT,
      idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    } as unknown as RuntimeRoot,
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

interface RunOutcome {
  /** Every parse-time code, in emission order — the refusal channel. */
  readonly codes: readonly string[];
  /** The final value rendered, and whether it is an integer. */
  readonly value: string;
  readonly isInteger: boolean;
}

/**
 * Parse and execute one fixture, reporting both halves.
 *
 * Unlike the parse cells this does NOT reject an error-severity parse: after
 * the fix these fixtures refuse, and the point of the runtime half is that the
 * refusal is the ONLY defence — the executor runs the same body to the same
 * `NaN` either way. A witness pinning only the diagnostic would not red if the
 * refusal were later removed while the runtime stayed as it is.
 */
async function runFixture(
  src: string,
  cell: string,
  moduloCount: number,
): Promise<RunOutcome> {
  const doc = parse(src);
  expectModulos(doc, moduloCount, cell);
  const theta: ThetaCompositionInput = {
    slashName: "bug0152",
    sourcePath: "/theta/bug0152.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  expect(
    execution.outcome,
    `PRECONDITION (${cell}): the body must run to completion, or the value assertion below measures an abort rather than the value that reached the annotated position`,
  ).toBe("success");
  const value = execution.result.value;
  return {
    codes: doc.diagnostics.map((d: Diagnostic) => d.code),
    value: String(value),
    isInteger: Number.isInteger(value),
  };
}

// ===========================================================================
// Fixtures — the bug doc's §Reproduction rows verbatim.
// ===========================================================================

/** `fn g(n: integer)` — the annotated sink most of group (a) drives. */
const G_INT = "fn g(n: integer): number { 1 }\n";
/** The spec-correct parameter annotation for a zero-divisor `%` result. */
const G_NUM = "fn g(n: number): number { 1 }\n";
/** A sink that fires on an `integer` and on a `number` alike (cells a17–a20). */
const G_STR = "fn g(s: string): number { 1 }\n";
/** The `integer`-declared schema field of cells a11 / a12 / h4. */
const S_INT = "schema S { n: integer }\n";
/** The `string`-declared schema field of cells E3 / E3c. */
const S_STR = "schema S { s: string }\n";

// ===========================================================================
// (t) — the raw inference read. The measurement that separates this report from
// bug 0081: five expressions reach one line and produce one answer, and
// expressions.md:234 assigns four of them that answer.
// ===========================================================================

describe("bug 0152 — a zero-divisor `%` types `number` at the inference pass", () => {
  it("t1, t5, t6, t13, t14, t15, t16, t17: every literal-integer-zero divisor reads `number`", () => {
    // The route-A predicate is on the DIVISOR NODE: a `NumberExpr`
    // (src/parser/theta-document.ts:138–141) whose `numericType` is `"integer"`
    // and whose `text` denotes zero. It does NOT consult the left operand, so
    // `0 % 0` (t5) and `-1 % 0` (t6) read the same as `1 % 0` (t1).
    //
    // t13 is the parenthesis row: `parsePrimary` returns the inner expression,
    // so `1 % (0)` carries the SAME divisor node as t1 and the predicate must
    // see through the parentheses without special-casing them.
    // t17 is the §Fix (a) open sub-question, answered: `00` lexes as
    // `{ numericType: "integer", text: "00" }`, so `Number(text) === 0` admits
    // it and a `text === "0"` test would not. Measured at this HEAD, `00` is
    // the only integer-typed non-`0` spelling of zero the lexer accepts —
    // `0x0` / `0b0` / `0_0` are already a `theta/parse/unsupported-feature`
    // refusal, and `0.0` / `0e0` lex as `numericType: "number"` (t4, t18).
    // t16 is the chained `1 % 2 % 0` — left-associative, so the OUTER `%` is
    // the one whose divisor is the literal zero.
    // t14 and t15 are the carriers: `+` and unary `-` reproduce the operand
    // reduction, so the widened answer must travel outward through them.
    const rows = [
      ["t1  1 % 0     ", "1 % 0\n"],
      ["t5  0 % 0     ", "0 % 0\n"],
      ["t6  -1 % 0    ", "-1 % 0\n"],
      ["t13 1 % (0)   ", "1 % (0)\n"],
      ["t14 (1 % 0)+1 ", "(1 % 0) + 1\n"],
      ["t15 -(1 % 0)  ", "-(1 % 0)\n"],
      ["t16 1 % 2 % 0 ", "1 % 2 % 0\n"],
      ["t17 1 % 00    ", "1 % 00\n"],
    ] as const;
    expect(
      rows.map(([cell, src]) => `${cell} -> ${reading(src, cell)}`),
      `t1/t5/t6/t13–t17 — expressions.md:234 states the carve-out with its reason: "because \`NaN\` is a \`number\`, an \`integer % 0\` result widens to \`number\`". Bug 0152 §Fix (a) added a fourth \`op\` read to \`#typeBinary\` (src/parser/static-type-inference.ts:437) — after the synthetic-\`null\` unary shapes, \`BOOLEAN_BINARY_OPS\` (:459) and \`/\` (:465) — that tests \`op === "%"\` against a statically-zero integer divisor (:475) and returns \`number\` before the \`#commonType\` reduction (:480) ever sees the literal on the LEFT`,
    ).toEqual(rows.map(([cell]) => `${cell} -> ${NUMBER_READING}`));
  });

  it("t2: `3 % 2` does NOT move — every non-zero divisor keeps the operand-common widening", () => {
    // The must-not-move pin §Fix (b) names first, and the one a route testing
    // the OPERATOR rather than the DIVISOR reds on. expressions.md:234's
    // general rule gives a both-`integer` pair `integer` for every divisor but
    // zero, and bug 0142's witness pins this same row as its cell `t3`.
    expect(
      reading("3 % 2\n", "t2"),
      "t2 — the carve-out names its input class (`n % 0`); a fix that widens every `%` has widened past the sentence it implements",
    ).toBe(INTEGER_READING);
  });

  it("t3, t4, t18: a `number` operand already reads `number` and must keep doing so", () => {
    // These three reach `number` through the operand widening, NOT through the
    // carve-out, and they bound the defect to an `integer` divisor spelled
    // zero. An arm placed AHEAD of the reduction must return the same token for
    // t4 and t18 (whose divisors are `numericType: "number"`, so the route-A
    // predicate declines them and the reduction answers as it does today) and
    // must not reach t3 at all (whose divisor is a literal zero but whose LEFT
    // operand is a `number` — the arm ignores the left operand, so the answer
    // is the same either way and this row cannot distinguish the two paths;
    // it is pinned so a fix cannot move it in the other direction).
    const rows = [
      ["t3  1.0 % 0   ", "1.0 % 0\n"],
      ["t4  1 % 0.0   ", "1 % 0.0\n"],
      ["t18 1 % 0e0   ", "1 % 0e0\n"],
    ] as const;
    expect(
      rows.map(([cell, src]) => `${cell} -> ${reading(src, cell)}`),
      "t3/t4/t18 — the widening already produces the spec's answer here; the fix must return the same token, not a different one",
    ).toEqual(rows.map(([cell]) => `${cell} -> ${NUMBER_READING}`));
  });

  it("t7, t8, t9, t10: `/`, `-`, `*` and `+` are untouched — §Non-goals", () => {
    // t7 is bug 0142's shipped arm (src/parser/static-type-inference.ts:465),
    // which is what makes the `%` gap a gap rather than a shared posture; a fix
    // here does not edit it. t8/t9/t10 carry the operand-common rule that IS
    // expressions.md:234's answer for `-` and `*`, and `+`'s own rule (bug
    // 0072 owns it) makes a both-`integer` pair `integer` by construction.
    const rows = [
      ["t7  3 / 2", "3 / 2\n", NUMBER_READING],
      ["t8  3 - 2", "3 - 2\n", INTEGER_READING],
      ["t9  3 * 2", "3 * 2\n", INTEGER_READING],
      ["t10 3 + 2", "3 + 2\n", INTEGER_READING],
    ] as const;
    expect(
      rows.map(([cell, src]) => `${cell} -> ${reading(src, cell)}`),
      "t7/t8/t9/t10 — the arm is placed after the `/` arm and before the reduction, so it must reach neither the operator above it nor the three operators below it",
    ).toEqual(rows.map(([cell, , owed]) => `${cell} -> ${owed}`));
  });

  it("t11, t12: the ROUTE-A RESIDUALS at the raw read — still `integer`", () => {
    // Route A was taken and routes B and C were not, so these two keep reading
    // `integer` BY DECISION. t11's divisor is an unfoldable `binary` node (no
    // constant folder runs at parse time); t12's divisor is a `binary`
    // negation node, because `parseUnary` models unary minus as a binary with a
    // synthetic `null` left operand rather than folding it into the literal.
    // Both evaluate to `NaN` at runtime (h7, h8) and both stay silent at every
    // sink (b7, b11). Asserting them here makes the scope taken a measured
    // fact; a later route-B fix reds this cell deliberately, which is the
    // signal that the scope moved.
    const rows = [
      ["t11 1 % (2 - 2)", "1 % (2 - 2)\n"],
      ["t12 1 % -0     ", "1 % -0\n"],
    ] as const;
    expect(
      rows.map(([cell, src]) => `${cell} -> ${reading(src, cell)}`),
      "t11/t12 — route A admits a LITERAL integer-typed zero node only; these two divisors are `binary` nodes and the pass has no value channel to fold them",
    ).toEqual(rows.map(([cell]) => `${cell} -> ${INTEGER_READING}`));
  });
});

// ===========================================================================
// (D) — the divisor-spelling table. Group (t) alone states the boundary one row
// at a time; this table states it from BOTH sides in one place, so neither half
// can drift without the other reding.
// ===========================================================================

describe("bug 0152 — the divisor-spelling boundary, from both sides", () => {
  it("D1–D9: exactly the literal integer-typed zero spellings widen", () => {
    // Driven from a table rather than written out, so a fix that keys on
    // something other than the divisor node — the operator alone, or the
    // expression's runtime value — reds on one half or the other.
    //
    //   ADMITTED (route A): `0`, `00`, `(0)` — a `NumberExpr` with
    //   `numericType: "integer"` and `Number(text) === 0`, parentheses being
    //   transparent (src/parser/theta-document.ts, `parsePrimary`).
    //   DECLINED, and each for its own recorded reason:
    //     `-0`      a `binary` negation node, not a literal (route B/C residual)
    //     `(2 - 2)` an unfoldable `binary` node (route B residual)
    //     `z`       an `ident`; `bindings` maps a name to a `CompatType`, never
    //               to a value (route C residual)
    //     `0.0`     `numericType: "number"` — already `number` via the widening
    //     `0e0`     `numericType: "number"` — likewise
    //     `2`       a non-zero divisor, the general rule's own input
    const rows = [
      ["D1 divisor `0`      ", "1 % 0\n", NUMBER_READING],
      ["D2 divisor `00`     ", "1 % 00\n", NUMBER_READING],
      ["D3 divisor `(0)`    ", "1 % (0)\n", NUMBER_READING],
      ["D4 divisor `-0`     ", "1 % -0\n", INTEGER_READING],
      ["D5 divisor `(2 - 2)`", "1 % (2 - 2)\n", INTEGER_READING],
      ["D6 divisor `z` (= 0)", "let z = 0\n1 % z\n", INTEGER_READING],
      ["D7 divisor `0.0`    ", "1 % 0.0\n", NUMBER_READING],
      ["D8 divisor `0e0`    ", "1 % 0e0\n", NUMBER_READING],
      ["D9 divisor `2`      ", "1 % 2\n", INTEGER_READING],
    ] as const;

    // The loud precondition for the table: each fixture must actually parse a
    // `%` whose divisor is the node kind the row claims, or the reading below
    // is about some other shape. This is what stops a lexer change (say, `00`
    // ceasing to be `integer`-typed) from silently turning an admitted row into
    // a declined one that still passes for the wrong reason.
    const shapes = rows.map(([cell, src]) => {
      const doc = parse(src);
      const divisors = anchorsOf(doc).moduloDivisors;
      expect(
        divisors.length,
        `PRECONDITION (${cell}): the fixture must parse exactly one \`%\` node whose divisor this row describes. Diagnostics: ${render(doc)}`,
      ).toBe(1);
      const d = divisors[0] as unknown as Record<string, unknown>;
      return `${cell} -> ${String(d.kind)}/${String(d.numericType)}/${JSON.stringify(d.text)}`;
    });
    expect(
      shapes,
      "D1–D9 (precondition) — the divisor node shapes the route-A predicate reads. A change here is a lexer or parser change and must be adjudicated before the readings below mean anything",
    ).toEqual([
      'D1 divisor `0`       -> number/integer/"0"',
      'D2 divisor `00`      -> number/integer/"00"',
      'D3 divisor `(0)`     -> number/integer/"0"',
      "D4 divisor `-0`      -> binary/undefined/undefined",
      "D5 divisor `(2 - 2)` -> binary/undefined/undefined",
      "D6 divisor `z` (= 0) -> ident/undefined/undefined",
      'D7 divisor `0.0`     -> number/number/"0.0"',
      'D8 divisor `0e0`     -> number/number/"0e0"',
      'D9 divisor `2`       -> number/integer/"2"',
    ]);

    expect(
      rows.map(([cell, src]) => `${cell} -> ${reading(src, cell)}`),
      "D1–D9 — the boundary route A draws, stated from both sides. D1–D3 are the widening; D4–D6 are the residuals route A deliberately leaves (each binds `NaN` at runtime, h7–h9); D7–D8 reach `number` through the operand widening instead; D9 is the general rule's own input",
      ).toEqual(rows.map(([cell, , owed]) => `${cell} -> ${owed}`));
  });
});

// ===========================================================================
// (b) — the typed-`let` sink. `checkLetRhsCompat` (src/parser/type-compat.ts:429)
// routes a `number ⊑ integer` outcome to `integer-narrowing` and anchors it on
// the `let` statement.
// ===========================================================================

describe("bug 0152 — the typed-`let` sink judges a zero-divisor `%` initialiser", () => {
  it("b1: `let n: integer = 1 % 0` fires once, on the `let`", () => {
    const doc = parse("let n: integer = 1 % 0\nn\n");
    expectModulos(doc, 1, "b1");
    expect(
      allHits(doc),
      `b1 — the headline row. The sink is reached (b2, b3 and b10 fire from the same call site on the same shape) and answers \`compatible\` on a read that should be \`number\`; the binding holds \`NaN\` at runtime (h1). Diagnostics: ${render(doc)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "n"))]);
  });

  it("b6: `let n: integer = 0 % 0` fires — the arm ignores the left operand", () => {
    const doc = parse("let n: integer = 0 % 0\nn\n");
    expectModulos(doc, 1, "b6");
    expect(
      allHits(doc),
      `b6 — like the \`/\` arm above it, the route-A arm returns before either operand is typed, so a zero LEFT operand changes nothing. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "n"))]);
  });

  it("b12, b13, b14: the ternary, index-element and chained carriers fire", () => {
    // Three reductions the widened answer has to survive: the ternary's
    // branch common type, the index-element narrowing
    // (src/parser/static-type-inference.ts, the `index` arm) and a nested `%`
    // whose OUTER divisor is the literal zero. Each is measured separately
    // because each reaches the typed-`let` sink through a different node kind.
    const rows = [
      ["b12 ternary  ", "let n: integer = true ? 1 % 0 : 1\nn\n", 1],
      ["b13 index    ", "let xs = [1 % 0]\nlet m: integer = xs[0]\nm\n", 1],
      ["b14 chained  ", "let n: integer = 1 % 2 % 0\nn\n", 2],
    ] as const;
    const verdicts = rows.map(([cell, src, mods]) => {
      const doc = parse(src);
      expectModulos(doc, mods, cell);
      return `${cell} -> ${JSON.stringify(allHits(doc))}`;
    });
    expect(
      verdicts,
      "b12/b13/b14 — the wrong answer travels outward through every reduction the pass owns; each carrier must report at the annotation that receives it",
    ).toEqual(
      rows.map(([cell, src]) => {
        const doc = parse(src);
        const name = cell.startsWith("b13") ? "m" : "n";
        return `${cell} -> ${JSON.stringify([
          hit(NARROWING_CODE, narrowingMessage(), letRange(doc, name)),
        ])}`;
      }),
    );
  });

  it("b2, b3, b10: the controls that establish the sink is live", () => {
    // b3 is the exact diagnostic b1 is owed, drawn on the same operator one
    // token over: a `number` LEFT operand already widens through the reduction.
    // b10 is the same position on bug 0142's shipped `/` arm.
    const rows = [
      ["b2  let n: integer = 1.5    ", "let n: integer = 1.5\nn\n"],
      ["b3  let n: integer = 1.0 % 0", "let n: integer = 1.0 % 0\nn\n"],
      ["b10 let n: integer = 3 / 2  ", "let n: integer = 3 / 2\nn\n"],
    ] as const;
    const verdicts = rows.map(([cell, src]) => {
      const doc = parse(src);
      return `${cell} -> ${JSON.stringify(allHits(doc))}`;
    });
    expect(
      verdicts,
      "b2/b3/b10 — a `number` on the RHS of an `integer` annotation reports TYPE-2's one-way widening failing (type-system.md:36), and must keep reporting it identically",
    ).toEqual(
      rows.map(([cell, src]) => {
        const doc = parse(src);
        return `${cell} -> ${JSON.stringify([hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "n"))])}`;
      }),
    );
  });

  it("b4, b5: the rows at this sink whose SILENCE is correct", () => {
    // b4 is the non-zero divisor, whose `integer` answer IS expressions.md:234's
    // (§Fix (b) — a fix that reds it has widened past the carve-out). b5 is the
    // spec-correct annotation for a zero-divisor result: after the fix the read
    // is `number` and `number ⊑ number` holds, so this row must stay silent in
    // BOTH directions — it is the row that proves the fix adds no emission at a
    // correctly-annotated position.
    const rows = [
      ["b4 let n: integer = 3 % 2", "let n: integer = 3 % 2\nn\n"],
      ["b5 let n: number  = 1 % 0", "let n: number = 1 % 0\nn\n"],
    ] as const;
    const verdicts = rows.map(([cell, src]) => {
      const doc = parse(src);
      expectModulos(doc, 1, cell);
      expect(
        letRange(doc, "n"),
        `PRECONDITION (${cell}): the \`let n\` statement must be reachable, or the absence below measures nothing`,
      ).toBeDefined();
      return `${cell} -> ${JSON.stringify(allHits(doc))}`;
    });
    expect(
      verdicts,
      "b4/b5 — the two rows this fix must leave alone: the general rule's own input, and the annotation the spec says a zero-divisor result satisfies",
    ).toEqual(rows.map(([cell]) => `${cell} -> []`));
  });

  it("b7, b8, b9, b11: the ROUTE-A RESIDUALS at this sink — still silent", () => {
    // Route A was taken; routes B and C were enumerated and NOT taken. Each of
    // these four binds `NaN` into an `integer`-annotated position with no
    // diagnostic (h7, h8, h9) and CONTINUES to after this fix. The assertion is
    // the record of that decision: a later route-B or route-C fix reds this
    // cell deliberately and retakes it, exactly as this report retakes bug
    // 0142's `t9` and `b8`.
    const rows = [
      ["b7  1 % (2 - 2)         ", "let n: integer = 1 % (2 - 2)\nn\n"],
      ["b8  let z = 0 / 1 % z   ", "let z = 0\nlet n: integer = 1 % z\nn\n"],
      ["b9  let z: integer = 0  ", "let z: integer = 0\nlet n: integer = 1 % z\nn\n"],
      ["b11 1 % -0              ", "let n: integer = 1 % -0\nn\n"],
    ] as const;
    const verdicts = rows.map(([cell, src]) => {
      const doc = parse(src);
      expectModulos(doc, 1, cell);
      expect(
        letRange(doc, "n"),
        `PRECONDITION (${cell}): the \`let n\` statement must be reachable, or the absence below measures nothing`,
      ).toBeDefined();
      return `${cell} -> ${JSON.stringify(allHits(doc))}`;
    });
    expect(
      verdicts,
      "b7/b8/b9/b11 — the residual inventory route A leaves. Each binds `NaN` today and after; the silence is a taken decision, not an omission, and this cell is where a later route change has to argue with it",
    ).toEqual(rows.map(([cell]) => `${cell} -> []`));
  });
});

// ===========================================================================
// (a) — the other parse sinks, and the two rows that show a PROOF was returned.
// `checkFnArgCompat` (src/parser/type-compat.ts:478) routes a `number ⊑ integer`
// narrowing through `fn-arg-type-mismatch` rather than through
// `integer-narrowing`, which is why every control here reports `got number`.
// ===========================================================================

describe("bug 0152 — the `fn`-argument sink judges a zero-divisor `%` argument", () => {
  it("a1: `g(1 % 0)` against `n: integer` fires once, on the argument", () => {
    const doc = parse(G_INT + "let r = g(1 % 0)\nr\n");
    expectModulos(doc, 1, "a1");
    expect(
      allHits(doc),
      `a1 — both operands are numeric literals in the source text and the operator is a token, so type-system.md:48 licenses no deferral; control a3 decides the identical position on the same body. The parameter binds \`NaN\` at runtime (h2) and \`fn-arg-type-mismatch\`'s registered Trigger (${REGISTRY_PAGE}:136) states no runtime AJV net applies. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "n", "integer", "number"), argRange(doc, "g", 0)),
    ]);
  });

  it("a6: `g(0 % 0)` fires — the left operand is not consulted", () => {
    const doc = parse(G_INT + "let r = g(0 % 0)\nr\n");
    expectModulos(doc, 1, "a6");
    expect(
      allHits(doc),
      `a6 — the same arm as a1, with a zero on the left as well. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "n", "integer", "number"), argRange(doc, "g", 0)),
    ]);
  });

  it("a8: the remainder laundered through an UNANNOTATED `let` still fires", () => {
    // `let q = 1 % 0` records the initialiser's inferred type, so the binding
    // read carries whatever `#typeBinary` assigned and the sink decides on it
    // one statement later. A binding does not launder the read.
    const doc = parse(G_INT + "let q = 1 % 0\nlet r = g(q)\nr\n");
    expectModulos(doc, 1, "a8");
    expect(
      allHits(doc),
      `a8 — the annotation-free \`let\` does not repair the read; the recorded type is the initialiser's inferred type. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "n", "integer", "number"), argRange(doc, "g", 0)),
    ]);
  });

  it("a2, a3, a5: the controls that establish this sink is live on this body", () => {
    const literal = parse(G_INT + "let r = g(1.5)\nr\n");
    expect(
      allHits(literal),
      `a2 — a \`1.5\` literal one token over. Diagnostics: ${render(literal)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "n", "integer", "number"), argRange(literal, "g", 0)),
    ]);

    const numberLeft = parse(G_INT + "let r = g(1.0 % 0)\nr\n");
    expectModulos(numberLeft, 1, "a3");
    expect(
      allHits(numberLeft),
      `a3 — the exact diagnostic a1 is owed, drawn on the SAME operator by a \`number\` left operand reaching it through the reduction. Diagnostics: ${render(numberLeft)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "n", "integer", "number"), argRange(numberLeft, "g", 0)),
    ]);

    const quotient = parse(G_INT + "let r = g(3 / 2)\nr\n");
    expect(
      allHits(quotient),
      `a5 — the same position on bug 0142's shipped \`/\` arm, which this fix does not edit. Diagnostics: ${render(quotient)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "n", "integer", "number"), argRange(quotient, "g", 0)),
    ]);
  });

  it("a4, a7: the two silences at this sink that are correct", () => {
    // a4 is the non-zero divisor (§Fix (b)); a7 is the spec-correct `number`
    // parameter, which accepts the widened result and must gain no emission.
    const rows = [
      ["a4 g(3 % 2) at n: integer", G_INT + "let r = g(3 % 2)\nr\n"],
      ["a7 g(1 % 0) at n: number ", G_NUM + "let r = g(1 % 0)\nr\n"],
    ] as const;
    const verdicts = rows.map(([cell, src]) => {
      const doc = parse(src);
      expectModulos(doc, 1, cell);
      expect(
        argRange(doc, "g", 0),
        `PRECONDITION (${cell}): the argument node must be reachable, or the absence below measures nothing`,
      ).toBeDefined();
      return `${cell} -> ${JSON.stringify(allHits(doc))}`;
    });
    expect(
      verdicts,
      "a4/a7 — the general rule's own input, and the annotation the carve-out says the result satisfies",
    ).toEqual(rows.map(([cell]) => `${cell} -> []`));
  });
});

describe("bug 0152 — the schema-field, array-element and `par for … max` sinks", () => {
  it("a9 / a10: the `array<integer>` element", () => {
    // This position reports BOTH codes: the typed-`let` reports the narrowing
    // on the statement and the element sink reports
    // `array-element-type-mismatch` on the array literal. Control a10 draws the
    // identical pair, which is what makes the two-code expectation a
    // measurement rather than a guess.
    const doc = parse("let xs: array<integer> = [1 % 0]\nxs\n");
    expectModulos(doc, 1, "a9");
    expect(
      allHits(doc),
      `a9 — both registered codes, in the order control a10 already produces. The element holds \`NaN\` at runtime (h10). Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "xs")),
      hit(
        ARRAY_ELEMENT_CODE,
        arrayElementMessage(0, "integer", "number"),
        letInitRange(doc, "xs"),
      ),
    ]);

    const control = parse("let xs: array<integer> = [1.5]\nxs\n");
    expect(
      allHits(control),
      `a10 (control) — the same two codes on the same two anchors. Diagnostics: ${render(control)}`,
    ).toEqual([
      hit(NARROWING_CODE, narrowingMessage(), letRange(control, "xs")),
      hit(
        ARRAY_ELEMENT_CODE,
        arrayElementMessage(0, "integer", "number"),
        letInitRange(control, "xs"),
      ),
    ]);
  });

  it("a11 / a12: the schema-constructor field", () => {
    const doc = parse(S_INT + "let s = S { n: 1 % 0 }\ns\n");
    expectModulos(doc, 1, "a11");
    expect(
      allHits(doc),
      `a11 — \`checkObjectFieldCompat\` (src/parser/type-compat.ts:526) routes a narrowing outcome to \`integer-narrowing\` and anchors it on the field VALUE, which control a12 measures one token over. The field stores \`NaN\` (h4). Diagnostics: ${render(doc)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), objectFieldRange(doc, "n"))]);

    const control = parse(S_INT + "let s = S { n: 1.5 }\ns\n");
    expect(
      allHits(control),
      `a12 (control) — the same field, the same anchor, a \`1.5\` literal. Diagnostics: ${render(control)}`,
    ).toEqual([
      hit(NARROWING_CODE, narrowingMessage(), objectFieldRange(control, "n")),
    ]);
  });

  it("a13 / a14: the `par for … max` integer sink", () => {
    const doc = parse("let xs = [1, 2]\npar for x in xs max 1 % 0 { x }\n");
    expectModulos(doc, 1, "a13");
    expect(
      allHits(doc),
      `a13 — a registered integer sink whose own implementation comment (src/parser/type-layer-checks.ts:2829) names the diagnostic a fractional / \`number\` operand narrows to. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), parForMaxRange(doc))]);

    const control = parse("let xs = [1, 2]\npar for x in xs max 1.5 { x }\n");
    expect(
      allHits(control),
      `a14 (control) — the same operand position with a \`1.5\` literal. Diagnostics: ${render(control)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), parForMaxRange(control))]);
  });

  it("a15 / a16: the `fn`-return annotation is UNRELATED SILENCE — §Non-goals", () => {
    // Pinned as a PAIR because the pair is the argument: `fn g(): integer { 1.5 }`
    // is silent too, so no parse seam checks a `fn` body's tail against its
    // return annotation for any initialiser form. a15's silence measures that
    // gap and not this one, and a fix here leaves it silent — which is what
    // stops this fix from being credited with a position it did not reach. Bug
    // 0142 measured the same pair for `/` (its cells c17 / c18 / h5).
    const remainder = parse("fn g(): integer { 1 % 0 }\nlet r = g()\nr\n");
    expectModulos(remainder, 1, "a15");
    const literal = parse("fn g(): integer { 1.5 }\nlet r = g()\nr\n");
    expect(
      literal.body.statements.length,
      "PRECONDITION (a16): the control fixture must parse its `fn` declaration and its `let`, or the paired silence proves nothing",
    ).toBeGreaterThan(1);
    expect(
      [
        `a15 -> ${JSON.stringify(allHits(remainder))}`,
        `a16 -> ${JSON.stringify(allHits(literal))}`,
      ],
      "a15/a16 — both directions are silent at this HEAD and both stay silent after; a fix that reds only a15 has closed a different report",
    ).toEqual(["a15 -> []", "a16 -> []"]);
  });
});

// ===========================================================================
// a17 / a21 — MANDATORY. These are the only rows that separate a RETURNED PROOF
// from a WITHHOLD. `provableArgType` (src/parser/type-layer-checks.ts:2386)
// exists to withhold `checkFnCallArgs`'s judgement wherever the pass's read is
// not a proof of the runtime value's type. For `1 % 0` its three tests all pass
// — the operands are literals, each is `⊑ integer`, and `classifyOperand`
// (:128) calls the reduction numeric — so it ANSWERS rather than deferring.
// Silence at an `integer` parameter cannot tell a proof from a withhold, so the
// measurement is taken at sinks that fire in BOTH directions: the only
// observable that moves is the rendered `<actual>`, `integer` → `number`, which
// is the DIAG-4 string a reader acts on.
// ===========================================================================

describe("bug 0152 — the rendering that proves the type layer certified rather than deferred", () => {
  it("a17, a18, a19, a20: the `fn`-argument sink at a `string` parameter", () => {
    const remainder = parse(G_STR + "let r = g(1 % 0)\nr\n");
    expectModulos(remainder, 1, "a17");
    expect(
      allHits(remainder),
      `a17 — a \`string\` parameter refuses an \`integer\` and a \`number\` alike, so this row can never be vacuous: it fires at this HEAD and after. A withheld read produces no message at all, so a message rendering \`got integer\` is the type layer ASSERTING \`integer\` — the type expressions.md:234 calls \`number\`. Diagnostics: ${render(remainder)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "s", "string", "number"),
        argRange(remainder, "g", 0),
      ),
    ]);

    const nonZero = parse(G_STR + "let r = g(3 % 2)\nr\n");
    expect(
      allHits(nonZero),
      `a18 (control) — the SAME operator with a non-zero divisor keeps rendering \`integer\`, which keys the move to the divisor and not to \`%\`. Diagnostics: ${render(nonZero)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "s", "string", "integer"), argRange(nonZero, "g", 0)),
    ]);

    const quotient = parse(G_STR + "let r = g(3 / 2)\nr\n");
    expect(
      allHits(quotient),
      `a19 (control) — bug 0142's arm already renders \`number\` at this position, which is the shape this report reproduces. Diagnostics: ${render(quotient)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "s", "string", "number"), argRange(quotient, "g", 0)),
    ]);

    const plain = parse(G_STR + "let r = g(1)\nr\n");
    expect(
      allHits(plain),
      `a20 (control) — a bare \`integer\` literal renders \`integer\`, which is what the rendered token means when it is correct. Diagnostics: ${render(plain)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "s", "string", "integer"), argRange(plain, "g", 0)),
    ]);
  });

  it("a21, a22: the typed-`let` sink at a `string` annotation", () => {
    // The typed-`let` sink does not consult `provableArgType` at all — it reads
    // the pass directly — so this row shows the same certification at a second,
    // independent seam.
    const remainder = parse("let s: string = 1 % 0\ns\n");
    expectModulos(remainder, 1, "a21");
    expect(
      allHits(remainder),
      `a21 — the sink fires in both directions and interpolates the pass's answer into an author-visible message; \`got integer\` tells the author to change a value that is not an integer. Diagnostics: ${render(remainder)}`,
    ).toEqual([
      hit(LET_RHS_CODE, letRhsMessage("s", "string", "number"), letRange(remainder, "s")),
    ]);

    const quotient = parse("let s: string = 3 / 2\ns\n");
    expect(
      allHits(quotient),
      `a22 (control) — the same position on the shipped \`/\` arm. Diagnostics: ${render(quotient)}`,
    ).toEqual([
      hit(LET_RHS_CODE, letRhsMessage("s", "string", "number"), letRange(quotient, "s")),
    ]);
  });
});

// ===========================================================================
// (E) — the NON-NUMERIC-LEFT emission class, measured in BOTH directions.
//
// The route-A arm is placed AHEAD of the reduction and returns before either
// operand is typed, so it answers `number` for a `string` or `boolean` left
// operand too. That is spec-correct: `"a" % 0` evaluates to the JS number `NaN`
// (`applyBinaryScalar`, src/runtime/statement-executor.ts:899), so a `string`
// annotation is genuinely violated. It mirrors the L1–L4 class bug 0142's fix
// discovered for `/` after its own §Fix failed to anticipate it.
//
// DRIFT vs the bug document, recorded here because the document predates it.
// §Fix (e) predicts `"a" % 0` "reads `string` today". It does NOT: `#commonType`
// now UNIONS (bug 0081's fix shipped), so `"a" % 0` reads `string | integer` at
// this HEAD and `let s: string = "a" % 0` ALREADY fires with
// `got string | integer`. The class is therefore a MESSAGE CHANGE at the
// `string`-shaped sinks (E1, E3, E4, E5: `string | integer` → `number`), not a
// lost emission — and a genuine WITHDRAWAL at a `number`-annotated sink (E2:
// fires today with `got string | integer`, SILENT after, because
// `number ⊑ number`). Both directions are asserted. Every `-` control keys the
// move to the OPERATOR-AND-DIVISOR pair: `-`'s reduction stays the operands'
// own common type, so its rendering does not move.
// ===========================================================================

describe("bug 0152 — a non-numeric LEFT operand under a zero divisor", () => {
  it("E1 / E1c: the typed-`let` sink under a `string` annotation", () => {
    const doc = parse('let s: string = "a" % 0\ns\n');
    expectModulos(doc, 1, "E1");
    expect(
      allHits(doc),
      `E1 — the arm returns before either operand is typed, so the answer is \`number\` for a \`string\` left operand exactly as it is for an \`integer\` one at b1; \`checkLetRhsCompat\` decides \`number ⊑ string\` outright incompatible, not an \`integer\`-narrowing. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(LET_RHS_CODE, letRhsMessage("s", "string", "number"), letRange(doc, "s"))]);

    const control = parse('let s: string = "a" - "b"\ns\n');
    expect(
      letRange(control, "s"),
      "PRECONDITION (E1c): the `let s` statement must be reachable, or the absence below measures nothing",
    ).toBeDefined();
    expect(
      allHits(control),
      `E1c (control) — \`-\`'s reduction is the operands' own common type (\`literal string\`), which stays \`⊑ string\` in both directions. Diagnostics: ${render(control)}`,
    ).toEqual([]);
  });

  it("E2 / E2c: the WITHDRAWAL direction — a `number` annotation goes silent", () => {
    // The one row of this class where the fix REMOVES an emission rather than
    // rewording one. At this HEAD `"a" % 0` reads the union `string | integer`,
    // which is not `⊑ number`, so the sink fires. After the fix it reads
    // `number` and the annotation is satisfied. Its `-` control keeps firing,
    // which is what proves the silence is the operator rule and not the sink
    // going dead.
    const doc = parse('let n: number = "a" % 0\nn\n');
    expectModulos(doc, 1, "E2");
    expect(
      allHits(doc),
      `E2 — \`"a" % 0\` evaluates to \`NaN\`, which IS a \`number\`, so a \`number\` annotation is satisfied and this emission is withdrawn. Diagnostics: ${render(doc)}`,
    ).toEqual([]);

    const control = parse('let n: number = "a" - "b"\nn\n');
    expect(
      allHits(control),
      `E2c (control) — \`-\` at the same annotation keeps firing with the operands' own type, so E2's silence is attributable to the zero-divisor arm and not to a dead sink. Diagnostics: ${render(control)}`,
    ).toEqual([
      hit(LET_RHS_CODE, letRhsMessage("n", "number", "string"), letRange(control, "n")),
    ]);
  });

  it("E3 / E3c: the schema-constructor field sink", () => {
    const doc = parse(S_STR + 'let o = S { s: "a" % 0 }\no\n');
    expectModulos(doc, 1, "E3");
    expect(
      allHits(doc),
      `E3 — \`checkObjectFieldCompat\` routes the same outright-incompatible verdict E1 does, anchored on the field VALUE the way a11/a12 anchor the narrowing case. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(
        OBJECT_FIELD_CODE,
        objectFieldMismatchMessage("s", "S", "string", "number"),
        objectFieldRange(doc, "s"),
      ),
    ]);

    const control = parse(S_STR + 'let o = S { s: "a" - "b" }\no\n');
    expect(
      objectFieldRange(control, "s"),
      "PRECONDITION (E3c): the constructor field 's' must be reachable, or the absence below measures nothing",
    ).toBeDefined();
    expect(
      allHits(control),
      `E3c (control) — \`-\`'s reduction stays \`⊑ string\`. Diagnostics: ${render(control)}`,
    ).toEqual([]);
  });

  it("E4 / E4c: the `array<string>` element sink, both codes it draws", () => {
    const doc = parse('let xs: array<string> = ["a" % 0]\nxs\n');
    expectModulos(doc, 1, "E4");
    expect(
      allHits(doc),
      `E4 — both registered codes, in the order the \`let\` arm produces them (the whole-binding check runs before the element-sink check), as a9/a10 already establish for the \`array<integer>\` shape. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(
        LET_RHS_CODE,
        letRhsMessage("xs", "array<string>", "array<number>"),
        letRange(doc, "xs"),
      ),
      hit(
        ARRAY_ELEMENT_CODE,
        arrayElementMessage(0, "string", "number"),
        letInitRange(doc, "xs"),
      ),
    ]);

    const control = parse('let xs: array<string> = ["a" - "b"]\nxs\n');
    expect(
      letInitRange(control, "xs"),
      "PRECONDITION (E4c): the `let xs` initialiser must be reachable, or the absence below measures nothing",
    ).toBeDefined();
    expect(
      allHits(control),
      `E4c (control) — \`-\`'s reduction stays \`⊑ string\` at both the whole-binding and the element sink. Diagnostics: ${render(control)}`,
    ).toEqual([]);
  });

  it("E5 / E5c: a `boolean` left operand reaches the same answer", () => {
    // The second non-numeric kind, included because the arm's independence from
    // the left operand is a claim about EVERY left operand, not about `string`.
    const doc = parse("let b: boolean = true % 0\nb\n");
    expectModulos(doc, 1, "E5");
    expect(
      allHits(doc),
      `E5 — the rule is on the operator and its divisor and consults no left operand: a \`boolean\` left under a zero divisor reads \`number\` exactly as an \`integer\` one does at b1. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(LET_RHS_CODE, letRhsMessage("b", "boolean", "number"), letRange(doc, "b"))]);

    const control = parse("let b: boolean = true - false\nb\n");
    expect(
      letRange(control, "b"),
      "PRECONDITION (E5c): the `let b` statement must be reachable, or the absence below measures nothing",
    ).toBeDefined();
    expect(
      allHits(control),
      `E5c (control) — \`-\`'s reduction is the operands' own common type (\`literal boolean\`), which stays \`⊑ boolean\`. Diagnostics: ${render(control)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (g) — GOV-15. The change makes currently-clean programs refuse, so it is an
// ADDITION under the diagnostic-registry carve-out
// (docs/spec_topics/governance/source-language-stability.md:25). Discharged by
// measurement, not prediction.
// ===========================================================================

describe("bug 0152 — the committed corpus", () => {
  it("g1: no tracked `.theta` or `.thetalib` file carries a `%` binary operator", () => {
    // Both globs are named explicitly. Bug 0132 records that the
    // committed-fixture parse gate (tests/committed-fixture-parse-gate.test.ts)
    // filters `.theta` only, so a sweep that inherited that filter would report
    // a clean `.thetalib` half it never looked at — which is why the
    // precondition below asserts each glob contributed at least one file before
    // the emptiness claim is read.
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const tracked = execFileSync("git", ["ls-files", "--", "*.theta", "*.thetalib"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    expect(
      tracked.filter((p) => p.endsWith(".theta")).length,
      `PRECONDITION (g1): the sweep must see at least one tracked \`.theta\`; it listed ${tracked.length} files in total`,
    ).toBeGreaterThan(0);
    expect(
      tracked.filter((p) => p.endsWith(".thetalib")).length,
      `PRECONDITION (g1): the sweep must see at least one tracked \`.thetalib\` — the half bug 0132's gate is blind to; it listed ${tracked.length} files in total`,
    ).toBeGreaterThan(0);

    const remaindering = tracked.filter((rel) => {
      const src = readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
      const doc = parseDoc(src, rel);
      return anchorsOf(doc).modulos.length > 0;
    });
    expect(
      remaindering,
      `g1 — GOV-15's diagnostic-registry carve-out admits an addition for inputs that did not previously emit the added code. A shipped example, fixture or \`.thetalib\` taking a remainder is an in-scope input this fix could newly refuse, and it must be repaired in the same commit rather than accepted. Swept ${tracked.length} tracked files`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (h) — the runtime half. The parse-time refusal is the ONLY defence: all three
// shipped `%` implementations are plain IEEE-754 remainder
// (src/runtime/statement-executor.ts:899,
// src/runtime/expression-evaluator.ts:524 — whose own comment carries the
// non-panic half of the spec sentence and not the widening half —
// src/extension/production-theta-producer.ts:6654) and none validates against
// an annotation. Each cell pins the VALUE (unchanged by this fix, in both
// directions) beside the REFUSAL (the observable that moves), so a witness
// cannot be satisfied by a tree that reports and then stops computing, nor by
// one that computes and stops reporting.
// ===========================================================================

describe("bug 0152 — the `NaN` that reaches the `integer`-annotated position", () => {
  it("h1: `let n: integer = 1 % 0` binds NaN, and the binding is refused", async () => {
    const outcome = await runFixture("let n: integer = 1 % 0\nn\n", "h1", 1);
    expect(
      `${outcome.value} isInteger=${outcome.isInteger}`,
      "h1 (value) — `Number.isInteger(NaN)` is false, so the annotation's declared constraint is violated by the value it holds; this fix changes no runtime behaviour, so the value must read the same before and after",
    ).toBe("NaN isInteger=false");
    expect(
      outcome.codes,
      "h1 (refusal) — the parse-time report is the whole defence at this position; a witness pinning only the value could not tell a fixed tree from a broken one",
    ).toEqual([NARROWING_CODE]);
  });

  it("h2: an `integer`-annotated `fn` parameter binds NaN, and the call is refused", async () => {
    const outcome = await runFixture(
      "fn g(n: integer): number { n }\nlet r = g(1 % 0)\nr\n",
      "h2",
      1,
    );
    expect(
      `${outcome.value} isInteger=${outcome.isInteger}`,
      "h2 (value) — `fn-arg-type-mismatch`'s registered Trigger states no runtime AJV safety net applies at this position, and nothing else refuses the value either",
    ).toBe("NaN isInteger=false");
    expect(outcome.codes, "h2 (refusal)").toEqual([FN_ARG_CODE]);
  });

  it("h4: an `integer`-declared schema field stores NaN, and the constructor is refused", async () => {
    const outcome = await runFixture(
      "schema S { n: integer }\nlet s = S { n: 1 % 0 }\ns.n\n",
      "h4",
      1,
    );
    expect(
      `${outcome.value} isInteger=${outcome.isInteger}`,
      "h4 (value) — no AJV path stands between a `%` result and a declared `integer` field",
    ).toBe("NaN isInteger=false");
    expect(outcome.codes, "h4 (refusal)").toEqual([NARROWING_CODE]);
  });

  it("h5: `0 % 0` binds NaN, and is refused", async () => {
    const outcome = await runFixture("let n: integer = 0 % 0\nn\n", "h5", 1);
    expect(
      `${outcome.value} isInteger=${outcome.isInteger}`,
      "h5 (value) — a zero left operand changes neither the value nor the rule",
    ).toBe("NaN isInteger=false");
    expect(outcome.codes, "h5 (refusal)").toEqual([NARROWING_CODE]);
  });

  it("h10: an `array<integer>` element holds NaN, and both codes fire", async () => {
    const outcome = await runFixture(
      "let xs: array<integer> = [1 % 0]\nxs[0]\n",
      "h10",
      1,
    );
    expect(
      `${outcome.value} isInteger=${outcome.isInteger}`,
      "h10 (value) — the element reads back out of the array as `NaN`, the fourth annotated position this report measures",
    ).toBe("NaN isInteger=false");
    expect(
      outcome.codes,
      "h10 (refusal) — the same two codes cell a9 pins at the parse seam, in the same order",
    ).toEqual([NARROWING_CODE, ARRAY_ELEMENT_CODE]);
  });

  it("h3, h11: the non-zero controls — the runtime is not rounding", async () => {
    // The divergence is PER-VALUE, so it is not reproducible from the source
    // alone: `5 % 3` binds 2 and `1 % 0` binds NaN (h1) from the same static
    // type at the same sink. Both stay silent in both directions.
    const one = await runFixture("let n: integer = 3 % 2\nn\n", "h3", 1);
    expect(
      `${one.value} isInteger=${one.isInteger} codes=${JSON.stringify(one.codes)}`,
      "h3 (control) — the general rule's own input: a correct value under a correct annotation, silent before and after",
    ).toBe("1 isInteger=true codes=[]");

    const two = await runFixture("let n: integer = 5 % 3\nn\n", "h11", 1);
    expect(
      `${two.value} isInteger=${two.isInteger} codes=${JSON.stringify(two.codes)}`,
      "h11 (control) — the same source shape as h1 with a different divisor, correct on this input and corrupt on h1's",
    ).toBe("2 isInteger=true codes=[]");
  });

  it("h6: the spec-correct `number` annotation runs clean, on the identical value", async () => {
    const outcome = await runFixture("let n: number = 1 % 0\nn\n", "h6", 1);
    expect(
      `${outcome.value} isInteger=${outcome.isInteger} codes=${JSON.stringify(outcome.codes)}`,
      "h6 (control) — the runtime never differed; the annotation is the only thing that changes, which is what places the whole defect in the inference pass",
    ).toBe("NaN isInteger=false codes=[]");
  });

  it("h7, h8, h9: the ROUTE-A RESIDUALS at runtime — NaN, still unrefused", async () => {
    // The three input classes routes B and C would have reached. Each binds
    // `NaN` into an `integer`-annotated binding with no diagnostic on any
    // channel, today and after this fix. Pinning the pair (value NaN, codes [])
    // is what makes the residual an inventory a later route change can work
    // from rather than a gap someone rediscovers.
    const folded = await runFixture("let n: integer = 1 % (2 - 2)\nn\n", "h7", 1);
    expect(
      `${folded.value} isInteger=${folded.isInteger} codes=${JSON.stringify(folded.codes)}`,
      "h7 — route B (a parse-time constant folder) was enumerated and NOT taken; no folder runs, so this divisor is opaque to the arm",
    ).toBe("NaN isInteger=false codes=[]");

    const negated = await runFixture("let n: integer = 1 % -0\nn\n", "h8", 1);
    expect(
      `${negated.value} isInteger=${negated.isInteger} codes=${JSON.stringify(negated.codes)}`,
      "h8 — `parseUnary` models unary minus as a binary with a synthetic `null` left, so this divisor is a `binary` node and not the `NumberExpr` route A tests",
    ).toBe("NaN isInteger=false codes=[]");

    const bound = await runFixture("let z = 0\nlet n: integer = 1 % z\nn\n", "h9", 1);
    expect(
      `${bound.value} isInteger=${bound.isInteger} codes=${JSON.stringify(bound.codes)}`,
      "h9 — route C (a provably-zero value channel beside the type channel) was enumerated and NOT taken; `bindings` maps a name to a `CompatType`, never to a value",
    ).toBe("NaN isInteger=false codes=[]");
  });
});

// ===========================================================================
// (r) + (reg) — the extension-layer MIRROR (§Fix (c)) at the invoke-argument
// sink, and the registration consequence, both through one shipped
// `discoverAndComposeFixtures` load of one planted `.pi/theta/` workspace.
//
// WHY THESE CELLS LIVE HERE and not in
// tests/division-result-type-number-invoke.test.ts: that file is bug 0142's
// §Fix (c) witness, its planted workspace and its two finding classes (F1 (i)
// rendering, F1 (ii) withheld→fires) are keyed to `/`, and its `beforeAll`
// loads ONE workspace whose stem set is that report's. Extending it would
// entangle two reports' fixtures in one load and put 0152 cells behind 0142's
// preconditions. This file therefore copies its harness SHAPE — planted
// workspace, production compose helper, the two production observables
// (registered slash names, and the no-UI stderr mirror's per-caller channel) —
// and plants its own stems, exactly as that file itself did from
// tests/invoke-arg-type-mismatch-wired.test.ts.
//
// `collectProvableArgTypes` (src/extension/invoke-static-checks.ts:505) is the
// ONE consumer of a `%` expression's type that does not route through
// `#typeBinary`: its `binary` arm dispatches in `#typeBinary`'s own order — the
// synthetic-`null` `-`, the `!` / `BOOLEAN_BINARY_OPS` set, then the `/` arm
// (:551) — and `%` falls past all of them to the arithmetic union (:572), so
// `collectProvableArgTypes(1 % 0)` is the union of the operand sets, `{integer}`,
// whatever `#typeBinary` answers. The mirror closes that, keeping the function's
// header invariant (:495–499) true: it "mirrors `#typeExpr` / `#typeBinary`
// shape for shape, so a collected member can never render differently from the
// type the pass itself assigns".
// ===========================================================================

interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/** A `mode: subagent` callee declaring one `params: x: string` field. */
function calleeStr(): string {
  return theta("---", "mode: subagent", "params:", "  x: string", "---", "@`hi`");
}

/** A `mode: subagent` caller with no `tools:` — the `invoke(...)` literal surface. */
function invokeCaller(...body: readonly string[]): string {
  return theta("---", "mode: subagent", "---", ...body, "@`hi`");
}

/** A `mode: subagent` theta whose body is a typed binding — the registration rows. */
function bindingTheta(...body: readonly string[]): string {
  return theta("---", "mode: subagent", "---", ...body, "@`hi`");
}

const THETAS: readonly PlantedTheta[] = [
  { stem: "cstr", text: calleeStr() },
  // r1: the mirror's own row — renders `got integer` at this HEAD.
  { stem: "modzero", text: invokeCaller('invoke("./cstr.theta", 1 % 0)?') },
  // r2–r4: the controls that key the move to the zero divisor.
  { stem: "modnonzero", text: invokeCaller('invoke("./cstr.theta", 3 % 2)?') },
  { stem: "subplain", text: invokeCaller('invoke("./cstr.theta", 3 - 2)?') },
  { stem: "divplain", text: invokeCaller('invoke("./cstr.theta", 3 / 2)?') },
  // r5: the route-A residual at this sink.
  { stem: "modnegzero", text: invokeCaller('invoke("./cstr.theta", 1 % -0)?') },
  // r6: the withheld->fires class the mirror shares with the pass (E1-E5) but
  // that group never drives through this sink; a regression that keyed the
  // mirror's guard to a numeric left operand would revert this row silently
  // while r1-r5 (all numeric lefts) stayed green.
  { stem: "modleftstr", text: invokeCaller('invoke("./cstr.theta", "a" % 0)?') },
  // r6c: the `-` control — its arithmetic fallback unions {string, integer},
  // not disjoint from the callee's `x: string` param, so it stays withheld.
  { stem: "subleftstr", text: invokeCaller('invoke("./cstr.theta", "a" - 0)?') },
  // reg1: the registration consequence.
  { stem: "regmod", text: bindingTheta("let n: integer = 1 % 0") },
  { stem: "reggood", text: bindingTheta("let n: number = 1 % 0") },
  { stem: "regctl", text: bindingTheta("let n: integer = 1.5") },
];

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  readonly diagnosticLines: readonly string[];
}

let outcome: LoadOutcome;
let workspaceDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });

  return {
    registered: fixtures.map((f) => f.slashName),
    notifications,
    diagnosticLines: chunks
      .join("")
      .split(/\r?\n/)
      .filter((line) => line.length > 0),
  };
}

beforeAll(async () => {
  // No stem may be a suffix of another: the per-caller channel filter matches
  // `<separator><stem>.theta`, so a suffix pair would let one caller's
  // diagnostic satisfy or defeat another caller's assertion.
  const stems = THETAS.map((t) => t.stem);
  for (const stem of stems) {
    const shadowed = stems.filter((other) => other !== stem && other.endsWith(stem));
    expect(
      shadowed,
      `harness: planted stem '${stem}' is a suffix of ${JSON.stringify(shadowed)}, so per-caller diagnostic attribution below is ambiguous`,
    ).toEqual([]);
  }

  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0152-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(join(projectThetaDir, `${planted.stem}.theta`), planted.text, "utf8");
  }
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

/** Diagnostic lines the load attributed to one planted `.theta`. */
function linesFor(stem: string): readonly string[] {
  const attributed = new RegExp(`[\\\\/]${stem}\\.theta[:\\s]`);
  return outcome.diagnosticLines.filter((line) => attributed.test(line));
}

/** Diagnostic lines attributing `code` to one planted `.theta`. */
function linesForCode(stem: string, code: string): readonly string[] {
  return linesFor(stem).filter((line) => line.includes(code));
}

/**
 * The shared positive control every mirror cell calls first: THIS workspace and
 * THIS load produced `INVOKE_ARG_CODE` at least once, on the per-caller channel
 * the cells read. Without it an absence assertion could pass because the row
 * never fires in this workspace at all — which would measure nothing.
 * `divplain` is the control chosen for it: bug 0142's mirror is shipped, so its
 * firing is independent of anything this report changes.
 */
function assertRowSurfaceLive(): void {
  expect(
    linesForCode("divplain", INVOKE_ARG_CODE).length,
    `unmet precondition: ${INVOKE_ARG_CODE} never surfaced for the divplain caller (a \`/\` argument at a \`params: x: string\` callee, which bug 0142's shipped mirror already fires on), so this workspace produces no instance of the row and nothing below measures anything. Lines for that caller: ${JSON.stringify(linesFor("divplain"))}`,
  ).toBeGreaterThan(0);
}

describe("bug 0152 §Fix (c) — the `collectProvableArgTypes` mirror at the invoke sink", () => {
  it("r1: `invoke(\"./cstr.theta\", 1 % 0)` renders `<actual>` = number", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("modzero", INVOKE_ARG_CODE).some((line) =>
        line.includes(invokeArgMessage(0, "x", "string", "number")),
      ),
      `r1 — the collector must not render differently from the type the pass assigns (its header invariant, src/extension/invoke-static-checks.ts:495–499). Bug 0152 §Fix (c) added a same-guarded \`%\`-zero-divisor arm (:565–570) mirroring \`#typeBinary\`'s own arm, placed after the \`/\` arm (:552) and before the arithmetic union (:583) — so the collected set for this row is \`{number}\`, not the operand union \`{integer}\`, and this row renders \`number\` rather than \`got integer\`: no longer byte-identical to the \`3 - 2\` control r3, and now matching the \`3 / 2\` control r4. Lines for this caller: ${JSON.stringify(linesFor("modzero"))}`,
    ).toBe(true);
    expect(
      outcome.registered,
      "r1 — the row is E-severity, so the mistyped invoke caller must not register",
    ).not.toContain("modzero");
  });

  it("r2, r3, r4: the controls that key the move to the zero divisor", () => {
    assertRowSurfaceLive();
    const rows = [
      ["r2 modnonzero 3 % 2", "modnonzero", "integer"],
      ["r3 subplain   3 - 2", "subplain", "integer"],
      ["r4 divplain   3 / 2", "divplain", "number"],
    ] as const;
    const verdicts = rows.map(([cell, stem, actual]) => {
      const fired = linesForCode(stem, INVOKE_ARG_CODE).some((line) =>
        line.includes(invokeArgMessage(0, "x", "string", actual)),
      );
      return `${cell} -> ${fired}`;
    });
    expect(
      verdicts,
      `r2/r3/r4 — a non-zero \`%\` divisor and a \`-\` keep rendering \`integer\`; \`/\` already renders \`number\` through bug 0142's shipped mirror. The three together key r1's move to the DIVISOR, not to the operator and not to the sink. Lines: ${JSON.stringify([linesFor("modnonzero"), linesFor("subplain"), linesFor("divplain")])}`,
    ).toEqual(rows.map(([cell]) => `${cell} -> true`));
  });

  it("r5: the route-A residual at this sink keeps rendering `integer`", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("modnegzero", INVOKE_ARG_CODE).some((line) =>
        line.includes(invokeArgMessage(0, "x", "string", "integer")),
      ),
      `r5 — \`1 % -0\`'s divisor is a \`binary\` negation node, which route A declines, so the mirror declines it too and the collector keeps answering the operand union. The mirror must reproduce route A's boundary exactly, not a wider one. Lines for this caller: ${JSON.stringify(linesFor("modnegzero"))}`,
    ).toBe(true);
  });

  it("r6 / r6c: a non-numeric LEFT operand at the invoke sink — the withheld->fires transition", () => {
    // Bug 0152 §Fix (c)'s mirror arm (src/extension/invoke-static-checks.ts,
    // the `%` zero-divisor guard) does not consult the left operand, matching
    // `#typeBinary`'s own arm — same as E1-E5 pin at the parse-time sinks, but
    // that group never drives the claim through THIS collector. Pre-fix, the
    // collector's arithmetic fallback unions the operand kinds
    // (`{string, integer}` for `"a" % 0`), which is not disjoint from the
    // callee's `x: string` param, so the row was WITHHELD. Post-fix the guard
    // returns the pass's own `{number}`, disjoint from `string`, so the row
    // FIRES. The `-` control never enters the guard — its own arithmetic
    // fallback still unions `{string, integer}` — so it stays withheld in
    // both directions and keys the move to the `%`-zero-divisor pair, not to
    // the sink or the left operand's kind.
    assertRowSurfaceLive();
    expect(
      linesForCode("modleftstr", INVOKE_ARG_CODE).some((line) =>
        line.includes(invokeArgMessage(0, "x", "string", "number")),
      ),
      `r6 — \`"a" % 0\` collects \`{number}\` through the mirror's zero-divisor guard, disjoint from the callee's \`x: string\` param, so the row fires post-fix where it was withheld pre-fix (the collector's arithmetic fallback would have unioned \`{string, integer}\`). Lines for this caller: ${JSON.stringify(linesFor("modleftstr"))}`,
    ).toBe(true);
    expect(
      outcome.registered,
      "r6 — the row is E-severity, so the mistyped invoke caller must not register",
    ).not.toContain("modleftstr");

    expect(
      linesForCode("subleftstr", INVOKE_ARG_CODE).length,
      `r6c (control) — \`"a" - 0\` never reaches the \`%\`-zero-divisor guard, so the collector's arithmetic fallback unions \`{string, integer}\`, not disjoint from \`string\`, and this row stays withheld in both directions. Lines for this caller: ${JSON.stringify(linesFor("subleftstr"))}`,
    ).toBe(0);
    expect(
      outcome.registered,
      "r6c (control) — withheld means no E-severity diagnostic, so the caller registers",
    ).toContain("subleftstr");
  });
});

describe("bug 0152 — the registration consequence through the shipped composition root", () => {
  it("reg1: `let n: integer = 1 % 0` no longer registers, beside its two controls", () => {
    // `hasLoadParseError` (src/extension/production-composition.ts) drops a
    // theta carrying an error-severity `theta/load/*` or `theta/parse/*`. Every
    // code this report is owed is `E`, so at this HEAD there is nothing for it
    // to act on and the affected theta REGISTERS AND RUNS — measured end to end
    // rather than inferred. The `1.5` control (regctl) is the row that proves
    // the drop mechanism is live in this same load, and `reggood` (the
    // spec-correct `number` annotation) is the row that proves the fix drops
    // the mistyped theta rather than the shape.
    expect(
      outcome.registered.includes("regctl"),
      `reg1 (precondition) — the \`1.5\` control must be DROPPED in this load, or the drop mechanism is not live here and reg1's own claim measures nothing. Registered: ${JSON.stringify(outcome.registered)}`,
    ).toBe(false);
    expect(
      [
        `regmod  registered=${outcome.registered.includes("regmod")}`,
        `reggood registered=${outcome.registered.includes("reggood")}`,
      ],
      `reg1 — \`let n: integer = 1 % 0\` binds \`NaN\` into an \`integer\`-annotated position (h1) and must not survive the load, while the spec-correct \`let n: number = 1 % 0\` must. Registered: ${JSON.stringify(outcome.registered)}; notifications: ${JSON.stringify(outcome.notifications)}`,
    ).toEqual(["regmod  registered=false", "reggood registered=true"]);
  });
});
