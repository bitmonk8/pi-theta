import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
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
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0142 — `#typeBinary`'s arithmetic arm (src/parser/static-type-inference.ts)
// reduces the two operands to their common type with no per-operator rule, so
// `3 / 2` types as `integer` against the spec sentence that fixes `/`'s result
// type unconditionally
// (docs/bugs/0142-division-result-type-not-number.md).
//
// THE SPEC SENTENCE. docs/spec_topics/expressions.md:232, §"Other arithmetic"
// (heading at :230), states the rule twice in one paragraph: "`/` always
// produces `number` (no integer-division operator in theta 1.0)" and "`/`
// already produces `number` and is outside this rule". The same paragraph
// assigns `-`, `*` and `%` the operand-common `integer ⊑ number` widening that
// the arm implements.
// docs/spec_topics/future-considerations/model-changes-and-non-goals.md:14
// restates it. The rule is on the OPERATOR: it consults no operand and carries
// no exception for an exactly-divisible pair.
//
// THE ROUTE UNDER TEST — the bug's §Fix, and not one step wider. One
// per-operator arm is added to `#typeBinary` after the `BOOLEAN_BINARY_OPS`
// gate and before the `#commonType` call, returning `{ kind: "prim", name:
// "number" }` for `/` unconditionally. Every parse sink below reads that answer
// through the single `StaticTypeInferencePass.typeOf` seam, which
// `TypeLayerWalk`'s own `typeOf` delegate (src/parser/type-layer-checks.ts)
// forwards to, so one arm supplies all of them and each sink is measured
// separately because each has its own narrowing step.
//
// THE POST-FIX CONTRACT THIS FILE PINS, cell by cell:
//
//   t1, t6–t8   the raw `typeOf` read on a `/` node over two `integer`
//               literals is `number`, for the ordinary, the divide-by-zero,
//               the non-terminating and the exactly-divisible pair alike.
//   t2–t4       `-`, `*` and `%` keep the operand-common `integer` — the pin
//               that a per-operator table did not widen the other three.
//   t5          a `number` operand already reads `number` and must keep doing
//               so, by the operator rule rather than by the widening.
//   t9          `1 % 0` reads `number` — RETAKEN by bug 0152 route A (this
//               cell pinned the opposite reading while that disposition was
//               open; see tests/modulo-zero-result-type-number.test.ts).
//   t10         `+` does NOT move (§Non-goals; bug 0072 owns it).
//   oi          `/` types `number` for EVERY operand pair, driven from a
//               table, so a fix that special-cases two `integer` literals reds.
//   a1, a5–a7,  the `fn`-argument sink fires, ranged on the argument node,
//   a9, a13     with the registry-sourced Message.
//   a2, a3, a8  the controls that establish the sink is live on the same body.
//   a4          the spec-correct `number` parameter keeps loading clean.
//   a10–a12     `-`, `%`, `*` at the same sink stay silent.
//   aPlus       `+` at the same sink stays silent.
//   aStr        `g("a" / "b")` stays WITHHELD against an `n: integer` param
//               that a wrongly-admitted proof would mismatch, with the guard
//               that withholds it named, because that guard moves under this
//               fix.
//   aRender     the `<actual>` rendering at a sink that fires in BOTH
//               directions moves `integer` → `number`.
//   b1, b7      the typed-`let` sink fires, ranged on the `let` statement.
//   b2, b5, b6  the controls that establish that sink is live.
//   b3, b4, b9  the rows at that sink that must not move: the spec-correct
//               annotation, `-` and `+`.
//   b8          `let n: integer = 1 % 0` draws `integer-narrowing` — RETAKEN
//               by bug 0152 route A, in the same cell (see that report's
//               witness file for the residual spellings it declines).
//   c1–c16      the six remaining narrowing steps — schema-constructor field,
//               `array<integer>` element, index element, ternary, `match`,
//               unary negation, `par for … max`, array common type — each with
//               its `1.5`-literal control on the same body.
//   c17, c18    pinned as UNRELATED SILENCE (§Non-goals): the `fn`-return
//               annotation is checked at no parse seam in EITHER direction, so
//               this fix is not credited with it.
//   L1–L4       a non-numeric `/` operand pair flips these direct sinks: a
//               `string`/`boolean` typed `let`, a `string` schema field and an
//               `array<string>` element refuse it, because every `/` yields a JS
//               number (`"a" / "b"` is `NaN`); each paired with a `-` control
//               keying the flip to the operator, not the operand kinds.
//   g1          the committed corpus carries no `/` at all — the GOV-15
//               addition discharge by measurement.
//   h1, h2, h4, the runtime half: the value that reaches the `integer`-annotated
//   h6, h7      position, and the parse refusal that is its only defence.
//   h3, h8      the runtime controls — the exactly-divisible value the runtime
//               does not round, and the spec-correct annotation.
//   h5          the runtime companion of c17/c18, silent in both directions.
//
// RED / GREEN AT THIS HEAD (d11aef29, offline, deterministic). RED: t1, t6, t7,
// t8, oi (five of its eight rows), a1, a5, a6, a7, a9, a13, aRender, b1, b7, c1,
// c3, c5, c7, c9, c11, c13, c15, L1, L2, L3, L4, and the parse half of h1, h2,
// h3, h4, h6, h7 — each because the pass answers `integer` (or, for L1–L4, the
// operands' own common type) where the spec says `number`, so the sink decides
// `compatible` and emits nothing (or, at aRender, emits the wrong `<actual>`).
// Every other cell is GREEN at this HEAD and required to stay green: they are
// the controls that prove each sink is live, the three operators whose widening
// must survive, the §Non-goals rows, the corpus sweep, and the runtime VALUES,
// which this fix does not touch. TWO EXCEPTIONS, both RETAKEN by bug 0152 and
// therefore RED at this HEAD until that report's fix lands: cell t9 and the b8
// row of the `b3, b4, b8, b9` cell, which pinned the `%`-by-literal-zero
// reading while that disposition was open.
//
// TIER — unit, offline, provider-free, deterministic. Every parse row settles
// inside one `parseThetaDocument` call through the house driver `parseDoc`
// (tests/helpers/e2e-s1.ts), every raw-type row inside one
// `StaticTypeInferencePass.typeOf` call over the shipped `checkCompatible`, and
// every runtime row inside one `executeBody` on the production executor deps —
// the harness shape tests/non-object-receiver-gate.test.ts establishes. Nothing
// on this path crosses a provider, a model, a child process or the network, so
// neither an integration nor a live test reaches a seam a unit test cannot.
//
// NO SILENT SKIPPING (CLAUDE.md). A missing registry row throws naming the
// registry page; every fixture's node anchor is located through a loud
// precondition that throws naming the fixture; every absence cell first asserts
// the fixture actually contains the division it is measuring the silence of;
// and the corpus sweep asserts both globs contributed before concluding the
// corpus is clean.
//
// SPEC ANCHORS (re-derived against the tree at this HEAD):
//   - docs/spec_topics/expressions.md:230 — the §"Other arithmetic" heading;
//     :232 — the paragraph carrying both statements of the `/` rule, the
//     `-` / `*` / `%` widening, the `n % 0` widening this report excludes, and
//     the IEEE-754 non-finite dispositions t6 / h6 / h7 measure.
//   - docs/spec_topics/future-considerations/model-changes-and-non-goals.md:14
//     — the restatement, as the reason there is no truncating-division operator.
//   - docs/spec_topics/type-system.md:36 — TYPE-2, the one-way `integer ⊑
//     number` widening whose reverse every `integer-narrowing` cell reports;
//     :48 §"Unresolvable operands", the deferral no row here engages because
//     the result type is a constant function of the operator; :50 — TYPE-9,
//     which routes the typed-`let` and `fn`-argument failures.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 — DIAG-4: the
//     *Message* column is normative and a test MUST source the string from it.
//     Every expected message below is read through `registryMessage`; :72 —
//     DIAG-2, which this fix does not engage: no registry row is added,
//     removed or edited, and each owed code is already emitted from the same
//     call site on its `1.5`-literal control.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:24 —
//     `theta/parse/integer-narrowing`; :40 —
//     `theta/parse/array-element-type-mismatch`; :116 —
//     `theta/parse/fn-arg-type-mismatch`, whose *Trigger* also records that
//     "no runtime AJV safety net applies", which is what makes group (h) the
//     measurement of an undefended position.
//   - docs/spec_topics/governance/source-language-stability.md:5 — GOV-15; :9
//     — the loads-cleanly predicate; :25 — the diagnostic-registry carve-out
//     whose addition arm cell g1 discharges by measurement.

// ===========================================================================
// DIAG-4 — every expected Message is read from the registry, never copied.
// ===========================================================================

const FN_ARG_CODE = "theta/parse/fn-arg-type-mismatch";
const NARROWING_CODE = "theta/parse/integer-narrowing";
const ARRAY_ELEMENT_CODE = "theta/parse/array-element-type-mismatch";
// Finding F3 (round-1 review of bug 0142): the two direct-sink codes a
// non-numeric `/` operand pair reaches at the typed-`let` and
// schema-constructor-field sinks, where the mismatch is outright incompatible
// rather than an `integer`-narrowing.
const LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";
const OBJECT_FIELD_CODE = "theta/parse/object-field-type-mismatch";

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
 * pass so a substituted value is never re-scanned.
 *
 * The placeholder set is derived from the TEMPLATE, not assumed: an unsupplied
 * placeholder and an unused substitution both throw, so a registry row that
 * changes shape fails loudly here instead of quietly producing a string no
 * emission can equal.
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

// ===========================================================================
// Parse harness — the house driver, plus AST anchors that double as the loud
// precondition every cell runs first.
// ===========================================================================

const FILE = "bug0142.theta";

/** Frontmatter for every fixture — occupies lines 1–3, body starts at line 4. */
const FM = "---\nmode: prompt\n---\n";

/** An empty `TypeEnv`: no fixture in group (t) or (oi) declares a named type. */
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
  readonly divisions: readonly SourceRange[];
}

/**
 * Every anchor this file's assertions range against, collected in one walk.
 *
 * The walk covers the node kinds these fixtures use; a fixture whose node it
 * cannot reach fails one of the loud preconditions below rather than letting an
 * absence assertion pass while measuring nothing. `divisions` is what makes the
 * silence cells non-vacuous: a cell that asserts "`3 / 2` at this sink draws
 * nothing" first asserts the parsed fixture actually holds a `/` node.
 */
function anchorsOf(doc: ThetaDocument): Anchors {
  const calls: Array<{ callee: string; args: SourceRange[] }> = [];
  const lets: Array<{ name: string; range: SourceRange; init: SourceRange | undefined }> = [];
  const objectFields: Array<{ name: string; value: SourceRange }> = [];
  const parForMaxes: SourceRange[] = [];
  const divisions: SourceRange[] = [];
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
        if (e.op === "/") divisions.push(e.range);
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
  return { calls, lets, objectFields, parForMaxes, divisions };
}

/**
 * The fixture holds exactly `count` `/` nodes.
 *
 * This is the precondition that makes a "draws nothing" cell mean something: a
 * fixture that stopped parsing its division (or stopped parsing at all) must
 * fail here rather than satisfy an absence assertion vacuously.
 */
function expectDivisions(doc: ThetaDocument, count: number, cell: string): void {
  expect(
    anchorsOf(doc).divisions.length,
    `PRECONDITION (${cell}): the fixture must parse to exactly ${count} \`/\` node(s), or the assertion below measures a source that does not divide. Diagnostics: ${render(doc)}`,
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
 * `checkLetRhsCompat` (src/parser/type-compat.ts) reports its narrowing on,
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
 * groups (a), (b) and (c) consumes, and the `literal`-versus-`prim` distinction
 * the object carries is a §Non-goal of this report. The raw object rides along
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

/** The reading a `/` node is owed, and the reading the widening produces. */
const NUMBER_READING = "number|integer-narrowing";
const INTEGER_READING = "integer|compatible";

// ===========================================================================
// Runtime harness — the production executor deps, the shape
// tests/non-object-receiver-gate.test.ts establishes. Offline: every fixture is
// query-free, so no model and no provider is reached.
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
 * value either way. A witness pinning only the diagnostic would not red if the
 * refusal were later removed while the runtime stayed as it is.
 */
async function runFixture(src: string, cell: string): Promise<RunOutcome> {
  const doc = parse(src);
  expectDivisions(doc, 1, cell);
  const theta: ThetaCompositionInput = {
    slashName: "bug0142",
    sourcePath: "/theta/bug0142.theta",
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

/** `fn g(n: integer)` — the annotated sink group (a) and half of group (c) drive. */
const G_INT = "fn g(n: integer): number { 1 }\n";
/** The spec-correct parameter annotation for a `/` result. */
const G_NUM = "fn g(n: number): number { 1 }\n";
/** A sink that fires on an `integer` and on a `number` alike (cell aRender). */
const G_STR = "fn g(s: string): number { 1 }\n";
/** The `integer`-declared schema field of cells c1 / c2 / h4. */
const S_INT = "schema S { n: integer }\n";
/** The `string`-declared schema field of cells L3 / L3c (finding F3). */
const S_STR = "schema S { s: string }\n";

// ===========================================================================
// (t) — the raw inference read. The measurement that separates this report from
// bug 0081: four operators reach one line and produce one answer, and only
// three of them are owed it.
// ===========================================================================

describe("bug 0142 — `/` types `number` at the inference pass", () => {
  it("t1, t6, t7, t8: `/` over two `integer` literals reads `number`, whatever the pair", () => {
    // The rule is a constant function of the operator, so the ordinary pair,
    // the IEEE-754 `Infinity` pair, the non-terminating quotient and the
    // exactly-divisible pair all read the same. t8 is the row that decides
    // between "the operator produces `number`" and "a fractional result
    // produces `number`": §Expected behaviour states the rule "has no exception
    // for an exactly-divisible pair (t8, h3)".
    const rows = [
      ["t1  3 / 2", "3 / 2\n"],
      ["t6  1 / 0", "1 / 0\n"],
      ["t7  1 / 3", "1 / 3\n"],
      ["t8  4 / 2", "4 / 2\n"],
    ] as const;
    expect(
      rows.map(([cell, src]) => `${cell} -> ${reading(src, cell)}`),
      `t1/t6/t7/t8 — expressions.md:232 fixes \`/\`'s result type without qualification. At this HEAD \`#typeBinary\` reads \`op\` twice (the synthetic-\`null\` unary shapes, then \`BOOLEAN_BINARY_OPS\`) and never again, so \`/\` falls to the \`#commonType\` reduction and answers the type of the literal \`3\``,
    ).toEqual(rows.map(([cell]) => `${cell} -> ${NUMBER_READING}`));
  });

  it("t2, t3, t4: `-`, `*` and `%` keep the operand-common `integer`", () => {
    // The must-not-move pin for the other three operators the same line serves.
    // expressions.md:232 assigns binary `-` and `*` the operand-common
    // `integer ⊑ number` widening and gives `%` the same rule, so a route that
    // moves the per-operator decision into a table has to reproduce the
    // widening here exactly.
    const rows = [
      ["t2  3 - 2", "3 - 2\n"],
      ["t3  3 % 2", "3 % 2\n"],
      ["t4  3 * 2", "3 * 2\n"],
    ] as const;
    expect(
      rows.map(([cell, src]) => `${cell} -> ${reading(src, cell)}`),
      "t2/t3/t4 — a per-operator arm for `/` must leave the reduction that serves `-`, `*` and `%` untouched",
    ).toEqual(rows.map(([cell]) => `${cell} -> ${INTEGER_READING}`));
  });

  it("t5: `3.0 / 2` reads `number` in both directions", () => {
    // The widening already produces the spec's answer here, for the wrong
    // reason. After the fix the operator produces it directly; the observable
    // is the same either way, which is what makes this the row that bounds the
    // defect to `integer ÷ integer`.
    expect(
      reading("3.0 / 2\n", "t5"),
      "t5 — a `number` operand reaches `number` through the widening today and through the operator rule after; the reading must not move",
    ).toBe(NUMBER_READING);
  });

  it("t9: `1 % 0` reads `number` — RETAKEN by bug 0152", () => {
    // RETAKEN. This cell pinned the OPPOSITE reading while bug 0142's own
    // §Non-goals left the disposition open: expressions.md:234 states a second
    // widening the same arm misses — "because `NaN` is a `number`, an
    // `integer % 0` result widens to `number`" — whose static decidability
    // depends on the DIVISOR'S VALUE, where `/`'s rule consults nothing. That
    // made it a different sentence with its own adjudication, which bug 0142
    // did not carry and this cell recorded as deliberately untaken.
    //
    // docs/bugs/0152-modulo-zero-result-type-not-number.md TAKES it, on ROUTE A
    // of its §Fix (a): `#typeBinary` gains an arm after the `/` arm
    // (src/parser/static-type-inference.ts:465) and before the `#commonType`
    // call (:480) that answers `{ kind: "prim", name: "number" }` when the
    // divisor is a LITERAL integer-typed zero NODE. So this row moves, by
    // decision and not by accident, and its full witness — including the
    // residual spellings route A deliberately declines (`1 % -0`,
    // `1 % (2 - 2)`, a provably-zero binding) — is
    // tests/modulo-zero-result-type-number.test.ts. This report's own rows are
    // unaffected: `3 % 2` (cell t3 above) still reads `integer`.
    expect(
      reading("1 % 0\n", "t9"),
      "t9 — RETAKEN by bug 0152 route A: a literal integer-zero divisor widens the `%` result to `number` (expressions.md:234). If this row reads `integer`, bug 0152's arm is absent or does not see through to the divisor node",
    ).toBe(NUMBER_READING);
  });

  it("t10: `+` does NOT move — §Non-goals", () => {
    // `+`'s own rule in expressions.md makes a both-`integer` pair produce
    // `integer`, which the common-type reduction already gives: the one
    // arithmetic operator for which this line is right by construction. Bug
    // 0072 owns the `+` operand rules.
    expect(
      reading("3 + 2\n", "t10"),
      "t10 — `+`'s result type IS its operands' common type, so the per-operator arm must not reach it",
    ).toBe(INTEGER_READING);
  });
});

// ===========================================================================
// (oi) — the operand-independence table. Group (t) alone cannot separate "the
// operator produces `number`" from "two `integer` literals produce `number`".
// ===========================================================================

describe("bug 0142 — `/`'s result type does not consult its operands", () => {
  it("oi: every operand pair under `/` reads `number`", () => {
    // Driven from a table rather than written out, so a fix that special-cases
    // the pair group (t) measures reds on the rest of it.
    //
    // The NON-NUMERIC pairs are in the table deliberately. expressions.md:232
    // opens "`-`, `*`, `/`, `%` accept only numeric operands", but no parse
    // seam refuses a non-numeric `/` operand at this HEAD — `"a" / "b"` loads
    // clean (cell aStr) — so the type the pass assigns such a node is still
    // read by every consumer downstream. The sentence that fixes the result
    // type is written on the OPERATOR and states no operand precondition for
    // it, so a fix that keys on operand numericity instead reds here; and that
    // same distinction is what moves the guard withholding cell aStr.
    //
    // The unresolved-operand pair is the same point at the other end: `typeOf`
    // types a free identifier as a nominal self-reference (its own contract at
    // the `typeOf` seam), so this row reads `a` at this HEAD. A result-fixed
    // operator needs no operand to be resolvable — the reasoning
    // `collectProvableArgTypes` (src/extension/invoke-static-checks.ts) already
    // records for the result-fixed BOOLEAN operators, whose set is "exact even
    // where an operand is statically unresolvable".
    const rows = [
      ["integer / integer", "3 / 2\n"],
      ["integer / number ", "3 / 2.0\n"],
      ["number  / integer", "3.0 / 2\n"],
      ["number  / number ", "3.0 / 2.0\n"],
      ["string  / string ", '"a" / "b"\n'],
      ["boolean / boolean", "true / false\n"],
      ["unresolved pair  ", "let a = 1\nlet b = 2\na / b\n"],
      ["nested quotient  ", "1 / (3 / 2)\n"],
    ] as const;
    expect(
      rows.map(([cell, src]) => `${cell} -> ${reading(src, cell)}`),
      "oi — `/` always produces `number` (expressions.md:232). The rule takes no operand argument, so every row of this table carries the same answer",
    ).toEqual(rows.map(([cell]) => `${cell} -> ${NUMBER_READING}`));
  });
});

// ===========================================================================
// (a) — the `fn`-argument sink. `checkFnArgCompat` routes a `number ⊑ integer`
// narrowing through this code rather than through `integer-narrowing` (its own
// comment records why), which is why every control here reports `got number`.
// ===========================================================================

describe("bug 0142 — the `fn`-argument sink judges a `/` argument", () => {
  it("a1: `g(3 / 2)` against `n: integer` fires once, on the argument", () => {
    const doc = parse(G_INT + "let r = g(3 / 2)\nr\n");
    expectDivisions(doc, 1, "a1");
    expect(
      allHits(doc),
      `a1 — the headline row. Both operands are numeric literals in the source text and the operator is a token, so type-system.md:48 licenses no deferral; control a3 decides the identical position on the same body. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "n", "integer", "number"),
        argRange(doc, "g", 0),
      ),
    ]);
  });

  it("a2, a3: the controls that establish the sink is live on this body", () => {
    const stringArg = parse(G_INT + 'let r = g("a")\nr\n');
    expect(
      allHits(stringArg),
      `a2 — a \`string\` under the same declared \`integer\` parameter. Diagnostics: ${render(stringArg)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "n", "integer", "string"),
        argRange(stringArg, "g", 0),
      ),
    ]);

    const numberArg = parse(G_INT + "let r = g(1.5)\nr\n");
    expect(
      allHits(numberArg),
      `a3 — the exact diagnostic a1 is owed, drawn by a \`1.5\` literal one token over. Diagnostics: ${render(numberArg)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "n", "integer", "number"),
        argRange(numberArg, "g", 0),
      ),
    ]);
  });

  it("a4: the spec-correct `n: number` parameter keeps loading clean", () => {
    const doc = parse(G_NUM + "let r = g(3 / 2)\nr\n");
    expectDivisions(doc, 1, "a4");
    expect(
      allHits(doc),
      `a4 — a \`number\` parameter accepts \`/\`'s result under either rule, so the fix must add nothing here. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("a5: `g(4 / 2)` — the exactly-divisible pair fires too", () => {
    // §Expected behaviour: the rule "has no exception for an exactly-divisible
    // pair (t8, h3)". The §Fix's arm returns `number` before either operand is
    // typed, so it cannot consult the values; the runtime binds `2` here and
    // `1.5` at a1 from one static type at one call site (h3 against h1), which
    // is the divergence that makes the value-blind rule the sound one.
    const doc = parse(G_INT + "let r = g(4 / 2)\nr\n");
    expectDivisions(doc, 1, "a5");
    expect(
      allHits(doc),
      `a5 — a per-value exception would make the same source correct on some inputs and corrupt on others. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "n", "integer", "number"),
        argRange(doc, "g", 0),
      ),
    ]);
  });

  it("a6: the quotient laundered through an UNANNOTATED `let` still fires", () => {
    // `let q = 3 / 2` records the initialiser's inferred type, so the binding
    // read carries whatever `#typeBinary` assigned the division and the sink
    // decides on it one statement later.
    const doc = parse(G_INT + "let q = 3 / 2\nlet r = g(q)\nr\n");
    expectDivisions(doc, 1, "a6");
    expect(
      allHits(doc),
      `a6 — a binding does not launder the read: the recorded type is the initialiser's inferred type. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "n", "integer", "number"),
        argRange(doc, "g", 0),
      ),
    ]);
  });

  it("a7: the quotient laundered through an ANNOTATED `let` fires at the `let`, not at the call", () => {
    // `let q: integer = 3 / 2` makes the recorded binding type the author's
    // `integer` claim, so the argument slot reads `integer` and stays silent —
    // and the annotation itself becomes the mismatch, which the typed-`let`
    // sink reports one statement earlier. The report lands once, at the
    // position that states the untrue claim.
    const doc = parse(G_INT + "let q: integer = 3 / 2\nlet r = g(q)\nr\n");
    expectDivisions(doc, 1, "a7");
    expect(
      allHits(doc),
      `a7 — the annotation makes the binding \`integer\` by fiat while the runtime value is 1.5; the diagnostic belongs on the annotation, and the call slot reads the recorded claim. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "q"))]);
  });

  it("a8: the `number`-operand control keeps its verdict", () => {
    const doc = parse(G_INT + "let r = g(3.0 / 2)\nr\n");
    expectDivisions(doc, 1, "a8");
    expect(
      allHits(doc),
      `a8 — the row that bounds the defect to \`integer ÷ integer\` at this HEAD, and which must keep firing identically after. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "n", "integer", "number"),
        argRange(doc, "g", 0),
      ),
    ]);
  });

  it("a9: a nested quotient `g(1 / (3 / 2))` fires", () => {
    const doc = parse(G_INT + "let r = g(1 / (3 / 2))\nr\n");
    expectDivisions(doc, 2, "a9");
    expect(
      allHits(doc),
      `a9 — the outer operator decides the argument's type, so a nested division does not need its own inner rule to reach the sink. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "n", "integer", "number"),
        argRange(doc, "g", 0),
      ),
    ]);
  });

  it("a13: `g(1 / 0)` fires — `Infinity` is a `number`", () => {
    // expressions.md:232 names `Infinity` / `-Infinity` / `NaN` as `/`'s
    // IEEE-754 results and does not panic on them; each is a `number`, so the
    // annotated `integer` position is a mismatch like any other quotient.
    const doc = parse(G_INT + "let r = g(1 / 0)\nr\n");
    expectDivisions(doc, 1, "a13");
    expect(
      allHits(doc),
      `a13 — the operand pair is two literals and the result is \`Infinity\`; the static answer is \`number\` for the same reason as every other quotient. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "n", "integer", "number"),
        argRange(doc, "g", 0),
      ),
    ]);
  });

  it("a10, a11, a12, aPlus: `-`, `%`, `*` and `+` at the same sink stay silent", () => {
    // The proof the arm did not widen the other four operators. Each of these
    // is a both-`integer` pair whose spec answer IS `integer`, so each stays
    // compatible with the declared parameter and draws nothing.
    const rows = [
      ["a10   g(3 - 2)", "let r = g(3 - 2)\nr\n"],
      ["a11   g(3 % 2)", "let r = g(3 % 2)\nr\n"],
      ["a12   g(3 * 2)", "let r = g(3 * 2)\nr\n"],
      ["aPlus g(3 + 2)", "let r = g(3 + 2)\nr\n"],
    ] as const;
    const verdicts = rows.map(([cell, body]) => {
      const doc = parse(G_INT + body);
      expect(
        argRange(doc, "g", 0),
        `PRECONDITION (${cell}): the argument node must be reachable, or the absence below measures nothing`,
      ).toBeDefined();
      return `${cell} -> ${JSON.stringify(allHits(doc))}`;
    });
    expect(
      verdicts,
      "a10/a11/a12/aPlus — these four operators' silence at this sink is CORRECT, and their staying silent is what proves the per-operator arm reached only `/`",
    ).toEqual(rows.map(([cell]) => `${cell} -> []`));
  });
});

// ===========================================================================
// The withheld row and the rendering row — the two places §Fix (b) says the
// mechanism moves while the observable does or does not.
// ===========================================================================

describe("bug 0142 — the rows whose withholding must survive the fix", () => {
  it("aStr: `g(\"a\" / \"b\")` stays WITHHELD against `n: integer`, and so does its `-` control", () => {
    // The observable does not move; the GUARD that produces it does, which is
    // why the row needs a pin. `provableArgType`
    // (src/parser/type-layer-checks.ts) withholds this argument at its
    // `classifyOperand` numeric test today, because the reduction is `string`.
    // Once `/` reads `number` the reduction is numeric, and the withhold moves
    // one test earlier to `isProvenReduction`: a `literal string` operand is
    // not `⊑ prim number`, so the reduction is not exact and the predicate
    // answers `undefined` rather than a proof.
    //
    // The param has to be one a dropped `isProvenReduction` would actually
    // mismatch, or the drop is unwitnessed by construction: against
    // `n: number` a dropped `isProvenReduction` still answers `[]`, because
    // `checkFnArgCompat(number, number)` is `compatible` regardless of which
    // guard withheld it — the same silence for the right reason and for the
    // wrong one. Against `n: integer` the two reasons diverge:
    // `checkFnArgCompat(integer, number)` mismatches, so a dropped
    // `isProvenReduction` would fire `expected integer, got number` here where
    // it stays silent today.
    const division = parse(G_INT + 'let r = g("a" / "b")\nr\n');
    expectDivisions(division, 1, "aStr");
    expect(
      argRange(division, "g", 0),
      "PRECONDITION (aStr): the argument node must be reachable, or the absence below measures nothing",
    ).toBeDefined();
    expect(
      allHits(division),
      `aStr — a non-numeric operand pair is not a proof of the value the operator produces, under either guard. Diagnostics: ${render(division)}`,
    ).toEqual([]);

    const control = parse(G_INT + 'let r = g("a" - "b")\nr\n');
    expect(
      argRange(control, "g", 0),
      "PRECONDITION (aStr control): the argument node must be reachable",
    ).toBeDefined();
    expect(
      allHits(control),
      `aStr (control) — the same shape under \`-\`, which this fix does not touch, so the pair separates the operator rule from the withhold. Diagnostics: ${render(control)}`,
    ).toEqual([]);
  });

  it("aRender: the `<actual>` rendering at a sink that fires in BOTH directions moves to `number`", () => {
    // A `string` parameter refuses an `integer` and a `number` alike, so this
    // cell can never be vacuous: it fires at this HEAD and after, and the only
    // thing that moves is the rendered `<actual>` — which is the DIAG-4
    // observable a reader acts on. Its `-` control on the next assertion holds
    // `integer`, so the pair separates the operator rule from the sink.
    const doc = parse(G_STR + "let r = g(3 / 2)\nr\n");
    expectDivisions(doc, 1, "aRender");
    expect(
      allHits(doc),
      `aRender — the mismatch is reported either way; a report naming \`integer\` tells the author to change a value that is not an integer. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "s", "string", "number"),
        argRange(doc, "g", 0),
      ),
    ]);

    const control = parse(G_STR + "let r = g(3 - 2)\nr\n");
    expect(
      allHits(control),
      `aRender (control) — \`-\` over the same pair keeps rendering \`integer\`. Diagnostics: ${render(control)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "s", "string", "integer"),
        argRange(control, "g", 0),
      ),
    ]);
  });
});

// ===========================================================================
// (b) — the typed-`let` sink. `checkLetRhsCompat` routes a `number ⊑ integer`
// outcome to `integer-narrowing` and anchors it on the `let` statement.
// ===========================================================================

describe("bug 0142 — the typed-`let` sink judges a `/` initialiser", () => {
  it("b1: `let n: integer = 3 / 2` fires once, on the `let`", () => {
    const doc = parse("let n: integer = 3 / 2\nn\n");
    expectDivisions(doc, 1, "b1");
    expect(
      allHits(doc),
      `b1 — the sink is reached (b2, b5 and b6 fire from the same call site on the same shape) and answers \`compatible\` on a read that should be \`number\`. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "n"))]);
  });

  it("b7: `let n: integer = 1 / 0` fires — `Infinity` in an `integer` binding", () => {
    const doc = parse("let n: integer = 1 / 0\nn\n");
    expectDivisions(doc, 1, "b7");
    expect(
      allHits(doc),
      `b7 — the binding holds \`Infinity\` at runtime (h6); nothing between the annotation and the value refuses it but this report. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "n"))]);
  });

  it("b2, b5, b6: the controls that establish the sink is live", () => {
    const rows = [
      ["b2 let n: integer = 1.5    ", "let n: integer = 1.5\nn\n"],
      ["b5 let n: integer = 3.0 / 2", "let n: integer = 3.0 / 2\nn\n"],
      ["b6 let n: integer = 3.0 - 2", "let n: integer = 3.0 - 2\nn\n"],
    ] as const;
    const verdicts = rows.map(([cell, src]) => {
      const doc = parse(src);
      return `${cell} -> ${JSON.stringify(allHits(doc))}`;
    });
    expect(
      verdicts,
      "b2/b5/b6 — a `number` on the RHS of an `integer` annotation reports TYPE-2's one-way widening failing, and must keep reporting it identically",
    ).toEqual(
      rows.map(([cell, src]) => {
        const doc = parse(src);
        return `${cell} -> ${JSON.stringify([hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "n"))])}`;
      }),
    );
  });

  it("b3, b4, b9 must NOT move; b8 RETAKEN by bug 0152", () => {
    // b3 is the spec-correct annotation for a quotient; b4 is `-`, whose
    // both-`integer` answer is correct; b9 is `+`, which bug 0072 owns. Those
    // three must not move.
    //
    // b8 is RETAKEN. It pinned `let n: integer = 1 % 0` as SILENT while bug
    // 0142's §Non-goals left the `%`-by-literal-zero disposition open — a
    // different sentence, decidable only from the divisor's VALUE.
    // docs/bugs/0152-modulo-zero-result-type-not-number.md takes that decision
    // on ROUTE A of its §Fix (a) (a LITERAL integer-typed zero divisor node),
    // so this row now draws the `integer-narrowing` its `1.5` control (b2
    // above) has always drawn, anchored on the same `let` statement. The
    // binding holds `NaN` at runtime, which is what the row is about; the full
    // witness, including the residual spellings route A declines, is
    // tests/modulo-zero-result-type-number.test.ts. `3 % 2` at this same sink
    // (that file's cell b4) stays silent, which is the pin that this arm did
    // not widen past the carve-out.
    const rows = [
      ["b3 let n: number  = 3 / 2", "let n: number = 3 / 2\nn\n"],
      ["b4 let n: integer = 3 - 2", "let n: integer = 3 - 2\nn\n"],
      ["b8 let n: integer = 1 % 0", "let n: integer = 1 % 0\nn\n"],
      ["b9 let n: integer = 3 + 2", "let n: integer = 3 + 2\nn\n"],
    ] as const;
    const verdicts = rows.map(([cell, src]) => {
      const doc = parse(src);
      expect(
        letRange(doc, "n"),
        `PRECONDITION (${cell}): the \`let n\` statement must be reachable, or the absence below measures nothing`,
      ).toBeDefined();
      if (cell.startsWith("b3 ")) {
        // b3 is the one row in this block measuring a division's silence (the
        // spec-correct `number` annotation): the header's own claim — every
        // absence cell first asserts the fixture holds the division it
        // measures — binds this row. b4/b8/b9 measure `-`, `%` and `+`, which
        // this fixture never divides, so the claim does not reach them.
        expectDivisions(doc, 1, "b3");
      }
      return `${cell} -> ${JSON.stringify(allHits(doc))}`;
    });
    expect(
      verdicts,
      "b3/b4/b9 — a fix that reds any of these three has widened past `/`. b8 is no longer among them: bug 0152 route A retook it, so it draws the same `integer-narrowing` its `1.5` control does",
    ).toEqual(
      rows.map(([cell, src]) => {
        if (!cell.startsWith("b8 ")) {
          return `${cell} -> []`;
        }
        const doc = parse(src);
        return `${cell} -> ${JSON.stringify([
          hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "n")),
        ])}`;
      }),
    );
  });
});

// ===========================================================================
// (c) — the six remaining narrowing steps, each measured separately because
// each carries the pass's answer through a different reduction.
// ===========================================================================

describe("bug 0142 — every other sink that reads a `/` result", () => {
  it("c1 / c2: the schema-constructor field", () => {
    const doc = parse(S_INT + "let s = S { n: 3 / 2 }\ns\n");
    expectDivisions(doc, 1, "c1");
    expect(
      allHits(doc),
      `c1 — \`checkObjectFieldCompat\` routes a narrowing outcome to \`integer-narrowing\` and anchors it on the field VALUE, which control c2 measures one token over. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), objectFieldRange(doc, "n"))]);

    const control = parse(S_INT + "let s = S { n: 1.5 }\ns\n");
    expect(
      allHits(control),
      `c2 (control) — the same field, the same anchor, a \`1.5\` literal. Diagnostics: ${render(control)}`,
    ).toEqual([
      hit(NARROWING_CODE, narrowingMessage(), objectFieldRange(control, "n")),
    ]);
  });

  it("c3 / c4: the `array<integer>` element", () => {
    // This position reports BOTH codes: the element sink reports
    // `array-element-type-mismatch` on the array literal, and the typed-`let`
    // reports the narrowing on the statement. Control c4 draws the identical
    // pair, which is what makes the two-code expectation a measurement rather
    // than a guess.
    const doc = parse("let xs: array<integer> = [3 / 2]\nxs\n");
    expectDivisions(doc, 1, "c3");
    expect(
      allHits(doc),
      `c3 — both registered codes, in the order control c4 already produces. Diagnostics: ${render(doc)}`,
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
      `c4 (control) — the same two codes on the same two anchors. Diagnostics: ${render(control)}`,
    ).toEqual([
      hit(NARROWING_CODE, narrowingMessage(), letRange(control, "xs")),
      hit(
        ARRAY_ELEMENT_CODE,
        arrayElementMessage(0, "integer", "number"),
        letInitRange(control, "xs"),
      ),
    ]);
  });

  it("c5 / c6: the index-element narrowing", () => {
    // The quotient is stored in an array literal and read back through an
    // index, so the element narrowing carries the type to the typed `let`.
    const doc = parse("let xs = [3 / 2]\nlet m: integer = xs[0]\nm\n");
    expectDivisions(doc, 1, "c5");
    expect(
      allHits(doc),
      `c5 — the index-element narrowing preserves the element type, so the wrong answer survives the round trip. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "m"))]);

    const control = parse("let xs = [1.5]\nlet m: integer = xs[0]\nm\n");
    expect(
      allHits(control),
      `c6 (control) — the identical route with a \`1.5\` element. Diagnostics: ${render(control)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), letRange(control, "m"))]);
  });

  it("c7 / c8: the ternary common type", () => {
    const doc = parse(G_INT + "let r = g(true ? 3 / 2 : 1)\nr\n");
    expectDivisions(doc, 1, "c7");
    expect(
      allHits(doc),
      `c7 — the ternary reduces its branches to a common type, so a \`number\` branch widens the whole read. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "n", "integer", "number"), argRange(doc, "g", 0)),
    ]);

    const control = parse(G_INT + "let r = g(true ? 1.5 : 1)\nr\n");
    expect(
      allHits(control),
      `c8 (control) — the same reduction with a \`1.5\` branch. Diagnostics: ${render(control)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "n", "integer", "number"),
        argRange(control, "g", 0),
      ),
    ]);
  });

  it("c9 / c10: the `match` arm common type", () => {
    const doc = parse(G_INT + "let r = g(match 1 { 1 => 3 / 2, _ => 1 })\nr\n");
    expectDivisions(doc, 1, "c9");
    expect(
      allHits(doc),
      `c9 — the arm reduction is the ternary's, reached through a different node kind. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "n", "integer", "number"), argRange(doc, "g", 0)),
    ]);

    const control = parse(G_INT + "let r = g(match 1 { 1 => 1.5, _ => 1 })\nr\n");
    expect(
      allHits(control),
      `c10 (control) — the same arms with a \`1.5\` body. Diagnostics: ${render(control)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "n", "integer", "number"),
        argRange(control, "g", 0),
      ),
    ]);
  });

  it("c11 / c12: unary negation over a quotient", () => {
    // Unary `-` is parsed as a binary with a synthetic `null` left operand and
    // types as its operand, so it carries the quotient's type through unchanged.
    const doc = parse(G_INT + "let r = g(-(3 / 2))\nr\n");
    expectDivisions(doc, 1, "c11");
    expect(
      allHits(doc),
      `c11 — negation reproduces its operand's type, so the operator rule must already have applied underneath it. Diagnostics: ${render(doc)}`,
    ).toEqual([
      hit(FN_ARG_CODE, fnArgMessage("g", 0, "n", "integer", "number"), argRange(doc, "g", 0)),
    ]);

    const control = parse(G_INT + "let r = g(-1.5)\nr\n");
    expect(
      allHits(control),
      `c12 (control) — the same negation over a \`1.5\` literal. Diagnostics: ${render(control)}`,
    ).toEqual([
      hit(
        FN_ARG_CODE,
        fnArgMessage("g", 0, "n", "integer", "number"),
        argRange(control, "g", 0),
      ),
    ]);
  });

  it("c13 / c14: the `par for … max` integer sink", () => {
    const doc = parse("let xs = [1, 2]\npar for x in xs max 3 / 2 { x }\n");
    expectDivisions(doc, 1, "c13");
    expect(
      allHits(doc),
      `c13 — a registered integer sink whose own implementation comment names the diagnostic a fractional operand narrows to. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), parForMaxRange(doc))]);

    const control = parse("let xs = [1, 2]\npar for x in xs max 1.5 { x }\n");
    expect(
      allHits(control),
      `c14 (control) — the same operand position with a \`1.5\` literal. Diagnostics: ${render(control)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), parForMaxRange(control))]);
  });

  it("c15 / c16: the array common type reaching a typed `let`", () => {
    const doc = parse("let xs = [3 / 2, 1]\nlet ys: array<integer> = xs\nys\n");
    expectDivisions(doc, 1, "c15");
    expect(
      allHits(doc),
      `c15 — the array's own common type is the sixth reduction the wrong answer travels through. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), letRange(doc, "ys"))]);

    const control = parse("let xs = [1.5, 1]\nlet ys: array<integer> = xs\nys\n");
    expect(
      allHits(control),
      `c16 (control) — the same array with a \`1.5\` element. Diagnostics: ${render(control)}`,
    ).toEqual([hit(NARROWING_CODE, narrowingMessage(), letRange(control, "ys"))]);
  });

  it("c17 / c18: the `fn`-return annotation is UNRELATED SILENCE — §Non-goals", () => {
    // Pinned as a PAIR because the pair is the argument: `fn g(): integer { 1.5 }`
    // is silent too, so no parse seam checks a `fn` body's tail against its
    // return annotation for any initialiser form. c17's silence measures that
    // gap and not this one, and a fix to this report leaves it silent — which
    // is what stops this fix from being credited with a position it did not
    // reach. Its runtime companion is cell h5.
    const quotient = parse("fn g(): integer { 3 / 2 }\nlet r = g()\nr\n");
    expectDivisions(quotient, 1, "c17");
    const literal = parse("fn g(): integer { 1.5 }\nlet r = g()\nr\n");
    expect(
      literal.body.statements.length,
      "PRECONDITION (c18): the control fixture must parse its `fn` declaration and its `let`, or the paired silence proves nothing",
    ).toBeGreaterThan(1);
    expect(
      [`c17 -> ${JSON.stringify(allHits(quotient))}`, `c18 -> ${JSON.stringify(allHits(literal))}`],
      "c17/c18 — both directions are silent at this HEAD and both stay silent after; a fix that reds only c17 has closed a different report",
    ).toEqual(["c17 -> []", "c18 -> []"]);
  });
});

// ===========================================================================
// F3 (round-1 review of bug 0142) — the settled `#typeBinary` arm answers
// `number` for `/` UNCONDITIONALLY, before either operand is typed, so a
// NON-NUMERIC operand pair flips these direct sinks exactly as a numeric pair
// does: `"a" / "b"` evaluates to the JS number `NaN` (`applyBinaryScalar`,
// src/runtime/statement-executor.ts), so a `string` / `boolean` /
// `array<string>` annotation is genuinely violated and the sink that already
// judges a `1.5`-literal control judges this identically. None of groups (a),
// (b) or (c) above drives a non-numeric operand through a DIRECT sink (`aStr`
// and `oi` drive one through the `fn`-argument and raw-inference reads only),
// so this flip was unwitnessed before this finding. Every `-` control proves
// the flip is keyed to the OPERATOR, not to the operand kinds: `-`'s reduction
// is still the operands' own common type (a `literal string`), which stays
// compatible with the same annotation.
// ===========================================================================

describe("bug 0142 F3 — a non-numeric `/` operand pair flips the direct sinks too", () => {
  it("L1 / L1c: the typed-`let` sink under a `string` annotation", () => {
    const doc = parse('let s: string = "a" / "b"\ns\n');
    expectDivisions(doc, 1, "L1");
    expect(
      allHits(doc),
      `L1 — \`checkLetRhsCompat\` decides \`number ⊑ string\` outright incompatible (not the \`integer-narrowing\` case b1/b7 pin), so the code is the generic mismatch rather than the narrowing row. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(LET_RHS_CODE, letRhsMessage("s", "string", "number"), letRange(doc, "s"))]);

    const control = parse('let s: string = "a" - "b"\ns\n');
    expect(
      letRange(control, "s"),
      "PRECONDITION (L1c): the `let s` statement must be reachable, or the absence below measures nothing",
    ).toBeDefined();
    expect(
      allHits(control),
      `L1c (control) — \`-\`'s reduction is the operands' own common type (\`literal string\`), which stays \`⊑ string\`. Diagnostics: ${render(control)}`,
    ).toEqual([]);
  });

  it("L2 / L2c: the typed-`let` sink under a `boolean` annotation", () => {
    const doc = parse("let b: boolean = true / false\nb\n");
    expectDivisions(doc, 1, "L2");
    expect(
      allHits(doc),
      `L2 — the rule is on the operator and consults no operand: a \`boolean\` pair under \`/\` reads \`number\` exactly as an \`integer\` pair does at b1. Diagnostics: ${render(doc)}`,
    ).toEqual([hit(LET_RHS_CODE, letRhsMessage("b", "boolean", "number"), letRange(doc, "b"))]);

    const control = parse("let b: boolean = true - false\nb\n");
    expect(
      letRange(control, "b"),
      "PRECONDITION (L2c): the `let b` statement must be reachable, or the absence below measures nothing",
    ).toBeDefined();
    expect(
      allHits(control),
      `L2c (control) — \`-\`'s reduction is the operands' own common type (\`literal boolean\`), which stays \`⊑ boolean\`. Diagnostics: ${render(control)}`,
    ).toEqual([]);
  });

  it("L3 / L3c: the schema-constructor field sink", () => {
    const doc = parse(S_STR + 'let o = S { s: "a" / "b" }\no\n');
    expectDivisions(doc, 1, "L3");
    expect(
      allHits(doc),
      `L3 — \`checkObjectFieldCompat\` routes the same outright-incompatible verdict L1 does, anchored on the field VALUE the way c1/c2 anchor the \`integer-narrowing\` case. Diagnostics: ${render(doc)}`,
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
      "PRECONDITION (L3c): the constructor field 's' must be reachable, or the absence below measures nothing",
    ).toBeDefined();
    expect(
      allHits(control),
      `L3c (control) — \`-\`'s reduction is the operands' own common type (\`literal string\`), which stays \`⊑ string\`. Diagnostics: ${render(control)}`,
    ).toEqual([]);
  });

  it("L4 / L4c: the `array<string>` element sink, both diagnostics the sink draws", () => {
    // Two codes, as c3/c4 already establish for the `array<integer>` shape: the
    // whole-array read is outright incompatible with `array<string>` (not an
    // `integer-narrowing`, so `checkLetRhsCompat` reports the generic mismatch),
    // and the element sink separately reports the one failing index.
    const doc = parse('let xs: array<string> = ["a" / "b"]\nxs\n');
    expectDivisions(doc, 1, "L4");
    expect(
      allHits(doc),
      `L4 — both registered codes, in the order the \`let\` arm produces them (the whole-binding check runs before the element-sink check). Diagnostics: ${render(doc)}`,
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
      "PRECONDITION (L4c): the `let xs` initialiser must be reachable, or the absence below measures nothing",
    ).toBeDefined();
    expect(
      allHits(control),
      `L4c (control) — \`-\`'s reduction is the operands' own common type (\`literal string\`), which stays \`⊑ string\` at both the whole-binding and the element sink. Diagnostics: ${render(control)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (g) — GOV-15. The change makes currently-clean programs refuse, so it is an
// ADDITION under the diagnostic-registry carve-out
// (source-language-stability.md:25). Discharged by measurement, not prediction.
// ===========================================================================

describe("bug 0142 — the committed corpus", () => {
  it("g1: no tracked `.theta` or `.thetalib` file carries a `/` binary operator", () => {
    // Both globs are named explicitly. Bug 0132 records that the
    // committed-fixture parse gate filters `.theta` only, so a sweep that
    // inherited that filter would report a clean `.thetalib` half it never
    // looked at — which is why the precondition below asserts each glob
    // contributed at least one file before the emptiness claim is read.
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

    const dividing = tracked.filter((rel) => {
      const src = readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
      const doc = parseDoc(src, rel);
      return anchorsOf(doc).divisions.length > 0;
    });
    expect(
      dividing,
      `g1 — GOV-15's diagnostic-registry carve-out admits an addition for inputs that did not previously emit the added code. A shipped example, fixture or \`.thetalib\` that divides is an in-scope input this fix would newly refuse, and it must be repaired in the same commit rather than accepted. Swept ${tracked.length} tracked files`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (h) — the runtime half. The parse-time refusal is the ONLY defence: all three
// shipped `/` implementations are plain IEEE-754 division and validate nothing
// against an annotation, and `fn-arg-type-mismatch`'s registered Trigger
// (code-registry-parse.md:116) states outright that "no runtime AJV safety net
// applies". Each cell pins the VALUE (unchanged by this fix, in both
// directions) and the REFUSAL (the observable that moves).
// ===========================================================================

describe("bug 0142 — the value that reaches the `integer`-annotated position", () => {
  it("h1: `fn g(n: integer): number { n }` called `g(3 / 2)` binds 1.5, and the call is refused", async () => {
    const outcome = await runFixture(
      "fn g(n: integer): number { n }\nlet r = g(3 / 2)\nr\n",
      "h1",
    );
    expect(
      `${outcome.value} isInteger=${outcome.isInteger}`,
      "h1 (value) — the parameter is annotated `integer` and holds 1.5; this fix changes no runtime behaviour, so the value must read the same before and after",
    ).toBe("1.5 isInteger=false");
    expect(
      outcome.codes,
      "h1 (refusal) — the parse-time report is the whole defence at this position; a witness pinning only the value could not tell a fixed tree from a broken one",
    ).toEqual([FN_ARG_CODE]);
  });

  it("h2: `let n: integer = 3 / 2` binds 1.5, and the binding is refused", async () => {
    const outcome = await runFixture("let n: integer = 3 / 2\nn\n", "h2");
    expect(
      `${outcome.value} isInteger=${outcome.isInteger}`,
      "h2 (value) — the annotation is the author's declared constraint and the binding holds 1.5 regardless",
    ).toBe("1.5 isInteger=false");
    expect(outcome.codes, "h2 (refusal)").toEqual([NARROWING_CODE]);
  });

  it("h4: an `integer`-declared schema field stores 1.5, and the constructor is refused", async () => {
    const outcome = await runFixture(
      "schema S { n: integer }\nlet s = S { n: 3 / 2 }\ns.n\n",
      "h4",
    );
    expect(
      `${outcome.value} isInteger=${outcome.isInteger}`,
      "h4 (value) — no AJV path stands between a `/` result and a declared `integer` field",
    ).toBe("1.5 isInteger=false");
    expect(outcome.codes, "h4 (refusal)").toEqual([NARROWING_CODE]);
  });

  it("h6, h7: `Infinity` and `NaN` land in `integer` bindings, and both are refused", async () => {
    const infinite = await runFixture("let n: integer = 1 / 0\nn\n", "h6");
    expect(
      `${infinite.value} isInteger=${infinite.isInteger}`,
      "h6 (value) — expressions.md:232 names `±Infinity` as `/`'s division-by-zero result and states it does not panic",
    ).toBe("Infinity isInteger=false");
    expect(infinite.codes, "h6 (refusal)").toEqual([NARROWING_CODE]);

    const notANumber = await runFixture("let n: integer = 0 / 0\nn\n", "h7");
    expect(
      `${notANumber.value} isInteger=${notANumber.isInteger}`,
      "h7 (value) — `0 / 0` is `NaN`, which the same sentence classifies as a `number`",
    ).toBe("NaN isInteger=false");
    expect(notANumber.codes, "h7 (refusal)").toEqual([NARROWING_CODE]);
  });

  it("h3: the exactly-divisible control binds 2 — the runtime does not round", async () => {
    // The value half is the control and does not move: it is what makes the
    // divergence PER-VALUE rather than per-source. `g(4 / 2)` binds 2 and
    // `g(3 / 2)` binds 1.5 (h1) from one static type at one call site, so a
    // theta correct on its test inputs corrupts on others. The refusal half
    // moves with cell a5, because the rule is on the operator.
    const outcome = await runFixture(
      "fn g(n: integer): number { n }\nlet r = g(4 / 2)\nr\n",
      "h3",
    );
    expect(
      `${outcome.value} isInteger=${outcome.isInteger}`,
      "h3 (value, control) — an exactly-divisible pair produces an integral value, and this fix must not change it",
    ).toBe("2 isInteger=true");
    expect(
      outcome.codes,
      "h3 (refusal) — §Expected behaviour: the rule has no exception for an exactly-divisible pair, so the static answer is `number` here as well",
    ).toEqual([FN_ARG_CODE]);
  });

  it("h8: the spec-correct `number` annotation runs clean, on the identical value", async () => {
    const outcome = await runFixture("let n: number = 3 / 2\nn\n", "h8");
    expect(
      `${outcome.value} isInteger=${outcome.isInteger} codes=${JSON.stringify(outcome.codes)}`,
      "h8 (control) — the runtime never differed; the annotation is the only thing that changes, which is what places the whole defect in the inference pass",
    ).toBe('1.5 isInteger=false codes=[]');
  });

  it("h5: the `fn`-return annotation stays undefended in both directions — §Non-goals", async () => {
    // The runtime companion of c17 / c18: `fn g(): integer { 3 / 2 }` returns
    // 1.5 with no parse-time report, and it keeps doing so after this fix
    // because no seam checks a `fn` body's tail against its return annotation.
    const outcome = await runFixture(
      "fn g(): integer { 3 / 2 }\nlet r = g()\nr\n",
      "h5",
    );
    expect(
      `${outcome.value} isInteger=${outcome.isInteger} codes=${JSON.stringify(outcome.codes)}`,
      "h5 — this position is out of scope; a fix that reds it has closed a different report",
    ).toBe('1.5 isInteger=false codes=[]');
  });
});
