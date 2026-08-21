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
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type {
  Block,
  Expr,
  PatternNode,
  Stmt,
  ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { ThetaValue } from "../src/runtime/value";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0145 — `StaticTypeInferencePass`'s `#typeExpr` has no arm-scope concept.
// Its `case "match"` arm maps every arm body through the `bindings` map it was
// handed, unchanged, and never reads `arm.pattern` — so an arm body's read of
// its OWN pattern binder resolves to a same-named ENCLOSING binding's record.
// The runtime does the opposite: `evalMatch` (src/runtime/statement-executor.ts)
// installs the selected arm's pattern bindings into a child environment before
// evaluating the body, and `matchPattern`'s identifier arm
// (src/runtime/match-result.ts) binds the scrutinee value under the pattern's
// name unconditionally. `let x = 1` + `let m: string = match "hi" { x => x }`
// therefore RUNS to `"hi"` and is REFUSED at parse as `expected string, got
// integer` (docs/bugs/0145-inference-pass-no-match-arm-scope.md).
//
// ── THE PROPERTY THIS FILE ASSERTS ──────────────────────────────────────────
// The bug's §Expected behaviour, stated so a fix has a target: AN ARM BODY
// READS ITS OWN BINDER, NEVER A SAME-NAMED ENCLOSING BINDING. The spec sentences
// are docs/spec_topics/expressions.md:168 (the identifier pattern "binds the
// value to `x`"), :53 (a `match` pattern binding binds locals) and :51 ("Local
// bindings (1) shadow everything else lexically, the same as in Rust or
// TypeScript"). A static pass that answers with a different binding's type is
// judging a different program.
//
// ── SCOPE: GROUP (b) ONLY ───────────────────────────────────────────────────
// Group (a) of the report — the `unprovableBindings` marking-identity leak — is
// DISCHARGED, by bug 0199 at 0.120.0, which re-keyed the mark in `walkStmt`'s
// `let` arm to the binding it was recorded for. This file does not re-state
// that defect: rows a1/a2 below are REGRESSION PINS on 0199's emissions, and
// bug 0199, NOT this bug, is their authority.
//
// The live subject is group (b) — the six `E`-severity registered rows that
// refuse a spec-legal theta — plus the three wrong-`<type>`-placeholder rows of
// §(c) and the §(d)/§(e) fences.
//
// ── THE SETTLED ROUTE ───────────────────────────────────────────────────────
// §Fix (a) ROUTE 1 with §Fix (b)'s first answer, THE WITHHELD SENTINEL: give
// `#typeExpr`'s `case "match"` a scope in which each arm's pattern binders are
// recorded as the withheld sentinel the type layer already uses
// (`WITHHELD_BINDER_TYPE_NAME` / `recordWithheldBinders` /`matchArmScope`, all
// src/parser/type-layer-checks.ts), and arm-scope `checkMatchArmTypes`'s
// `armTypes` mapping in `walkExpr`'s `case "match"` — which the pass fix alone
// does not reach, because that mapping calls `typeOf(arm.body, bindings)`
// directly with the ENCLOSING map. Route 2 is moot: it closed group (a) only,
// and group (a) is already closed.
//
// Under that route every group-(b) / (c) / (e) sink returns to its control's
// verdict, because an unresolvable operand makes the check defer
// (docs/spec_topics/type-system.md:48, *Unresolvable operands*). That is the
// direction every RED row below asserts: an emission DISAPPEARS from a legal
// program.
//
// ── DIRECTIONS, PER GROUP ───────────────────────────────────────────────────
// RED at HEAD, green under the fix (a false refusal removed):
//   b1 b3 b5 b7 b9 b11 b13 b15 b17; c1 c3 c5; d2 (in the d1/d2 pair); d3; d7;
//   e1 e3; and the STRUCTURAL row.
// EMISSION-REMOVAL on inputs that are NOT group-(b) refusals — the fix's
// permissive side effect, asserted at its post-fix value:
//   c4, d6.
// GREEN in both directions (the fences and the falsity proof):
//   b2 b4 b6 b8 b10 b12 b14 b16 b18; c2 c6; d1 d4 d5 d8; e2 e4;
//   a1 a2 (bug 0199's pins); f1–f10 (the runtime).
//
// ── WHY THE CONTROLS MUST STAY SILENT ───────────────────────────────────────
// With no same-named enclosing binding the arm body's read falls to the `ident`
// arm's `??` branch, which mints a `named` from the identifier's own spelling;
// that resolves to nothing, so every sink defers (type-system.md:48). The ten
// silent controls b2, b4, b6, b8, b10, b12, b16, b18, e2 and e4 ARE that rule
// working, and §Fix (c) makes preserving them a constraint on any route.
//
// ── TIER: unit, offline, provider-free, deterministic ───────────────────────
// Every parse row settles inside one `parseThetaDocument` call: the defect is a
// missing scope in a pure inference pass, and its only observable is the
// document's aggregated `diagnostics` list. The runtime rows settle inside one
// `executeBody` over the production producer deps, no model and no provider —
// the fixtures carry no `@`-query at all. An INTEGRATION tier would add a
// session round-trip that observes neither the recorded `CompatType` nor the
// diagnostic list. A LIVE tier would put a stochastic model between a fixture
// and a fully determined parse-time verdict; the ONE question that is genuinely
// live — an error-severity `theta/parse/*` denying registration through the real
// composition root (`hasLoadParseError`, src/extension/production-composition.ts)
// — is a registration-only cell in tests/live/live-production-acceptance.test.ts
// carrying the token CELL-D, and it spends zero tokens.
//
// ── HARNESS ─────────────────────────────────────────────────────────────────
// The shared house driver `parseDoc` (tests/helpers/e2e-s1.ts:39), unmodified —
// the real `parseThetaDocument` behind inert offline seams, the entry point the
// report's §Reproduction measured through. Every fixture carries
// `---\nmode: prompt\n---` (so a body line N is source line N+3) and a trailing
// expression supplying the final value. The runtime rows use the production
// executor harness shape of tests/non-object-receiver-gate.test.ts (its
// `probeSource` / `rootDouble` / `producer` helpers).
//
// ── THE DIAGNOSTIC ORACLE: DIAG-4 ───────────────────────────────────────────
// docs/spec_topics/diagnostics/diagnostic-shape.md:74 makes the registry's
// *Message* column normative and requires an asserting test to source its
// expected strings from it. Every message below is read through `parseRegistry`
// + `registryMessage` (tools/code-registry/index.js) and interpolated in ONE
// pass; an unsupplied or unused placeholder throws. Registry rows are cited by
// CODE, never by line.
//
// ── NO SILENT SKIPPING (CLAUDE.md) ──────────────────────────────────────────
// Nothing here early-returns, branches on the environment, or skips. A missing
// registry row throws NAMING the row and the page. EVERY row — the `[]` rows
// above all — first asserts its whole ordered BINDER-AND-ARM site list, which
// carries each `match` node's range and each arm's binder spelling and body
// range, so a fixture that stopped parsing, lost the `match`, lost the
// shadowing outer binding or drifted a line fails its own `PRECONDITION`
// naming what it found instead of letting an absence row pass while measuring
// nothing. Each row then asserts its WHOLE ordered code list AND its whole
// ordered message list AND (where it carries a verdict) its whole ordered
// range list, so an absent emission, a spurious extra emission and a
// reordering all red.
//
// ── CITATION POSTURE ────────────────────────────────────────────────────────
// `src/` is cited by SYMBOL throughout, header included — the report's own line
// citations are from 0.77.0 and have all shifted. Sibling tests are cited by
// FILE and CELL ID, spec pages by line, registry rows by code.

// ===========================================================================
// The DIAG-4 oracle.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — this file's message oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * A registered code's normative *Message* template. Throws naming the row and
 * the page when it is absent, so a registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column (diagnostic-shape.md:74) is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * Interpolate a registered template's lowercase `<…>` placeholders from `subs`,
 * in one pass so a substituted value is never re-scanned — `<expected>`
 * legitimately expands to text carrying angle brackets (`array<string>`). The
 * pattern is lowercase-only on purpose: `non-array-iterand`'s *Message* carries
 * the literal `array<T>`, which is prose and not a placeholder.
 *
 * The placeholder set is derived from the TEMPLATE: an unsupplied placeholder
 * and an unused substitution both throw, so a registry row that changes shape
 * fails loudly here instead of quietly producing a string no emission equals.
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

const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const ARM_MISMATCH = "theta/parse/match-arm-type-mismatch";
const MIXED_PLUS = "theta/parse/mixed-plus-operands";
const ARRAY_ELEMENT = "theta/parse/array-element-type-mismatch";
const OBJECT_FIELD = "theta/parse/object-field-type-mismatch";
const INTEGER_NARROWING = "theta/parse/integer-narrowing";
const NON_BOOLEAN = "theta/parse/non-boolean-condition";
const NON_ARRAY_ITERAND = "theta/parse/non-array-iterand";
const UNKNOWN_METHOD = "theta/parse/unknown-method";
const FN_ARG = "theta/parse/fn-arg-type-mismatch";
const SCHEMA_CASE = "theta/parse/schema-case-mismatch";

/** `let binding '<name>' initialiser type mismatch: expected <expected>, got <actual>` */
function letRhs(name: string, expected: string, actual: string): string {
  return fill(
    LET_RHS,
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `'+' has mixed operand types: <left> and <right>` */
function mixedPlus(left: string, right: string): string {
  return fill(
    MIXED_PLUS,
    new Map([
      ["<left>", left],
      ["<right>", right],
    ]),
  );
}

/** `array element type mismatch at index <i>: expected <expected>, got <actual>` */
function arrayElement(index: number, expected: string, actual: string): string {
  return fill(
    ARRAY_ELEMENT,
    new Map([
      ["<i>", String(index)],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `field '<field>' on schema '<schema>' type mismatch: expected <expected>, got <actual>` */
function objectField(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return fill(
    OBJECT_FIELD,
    new Map([
      ["<field>", field],
      ["<schema>", schema],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `condition must be boolean; got <type>` */
function nonBoolean(type: string): string {
  return fill(NON_BOOLEAN, new Map([["<type>", type]]));
}

/** `'for' expects array<T> after 'in'; got <type>` */
function nonArrayIterand(type: string): string {
  return fill(NON_ARRAY_ITERAND, new Map([["<type>", type]]));
}

/** `unknown method '<method>' on type <type>` */
function unknownMethod(method: string, type: string): string {
  return fill(
    UNKNOWN_METHOD,
    new Map([
      ["<method>", method],
      ["<type>", type],
    ]),
  );
}

/** `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>, got <actual>` */
function fnArg(
  name: string,
  index: number,
  param: string,
  expected: string,
  actual: string,
): string {
  return fill(
    FN_ARG,
    new Map([
      ["<name>", name],
      ["<i>", String(index)],
      ["<param>", param],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** Placeholder-free *Message*s — the template IS the rendered text. */
const NARROWING_MESSAGE = registered(INTEGER_NARROWING);
const ARM_MISMATCH_MESSAGE = registered(ARM_MISMATCH);
const SCHEMA_CASE_MESSAGE = registered(SCHEMA_CASE);

// ===========================================================================
// Parse harness.
// ===========================================================================

const FILE = "bug0145.theta";

/** Frontmatter occupies lines 1–3; every fixture body therefore starts at 4. */
const FM = "---\nmode: prompt\n---\n";

/**
 * The `params:`-bearing frontmatter rows d7 / d8 need: five lines, so their
 * bodies start at 6. `params:` is the one binding source the report recorded as
 * unreachable from `bindings` — see row d7's comment for why that is now false.
 */
const FM_PARAMS = "---\nmode: prompt\nparams:\n  topic: string\n---\n";

function at(r: SourceRange): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** Every diagnostic rendered `severity code @range: message` — failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}: ${d.message}`;
    }),
  );
}

/**
 * A pattern rendered as its binder structure — the shape
 * `collectPatternBinderNames` (src/parser/match-result.ts) walks. This is
 * what makes each row's precondition name the SHADOWING SPELLING: if a fixture
 * drifted so its arm binder no longer collides with the outer binding, the
 * precondition fails naming the binder it found instead of letting the row's
 * expectation pass for the wrong reason.
 */
function binders(p: PatternNode): string {
  switch (p.kind) {
    case "identifier":
      return p.name;
    case "constructor":
      return `${p.ctor}(${binders(p.inner)})`;
    case "object":
      return `{${p.fields.map((f) => `${f.name}:${binders(f.pattern)}`).join(",")}}`;
    case "array":
      return `[${p.elements.map(binders).join(",")}]`;
    case "wildcard":
      return "_";
    default:
      return JSON.stringify(p.value);
  }
}

/**
 * Every binding site, every `match` node and every arm of `doc` in source
 * order: `let <name>@<stmt range>`, `for <var>@<iterand range>`,
 * `fn <name>(<params>)`, `if@<condition range>`, `arg <callee>#<i>@<arg
 * range>`, `match@<range>` and `arm <binders>@<body range>`.
 *
 * This is the loud precondition every row runs FIRST. Most rows below expect an
 * EMPTY diagnostic list — either as a control that must stay silent or as the
 * post-fix value of a removed refusal — so a fixture that stopped parsing, lost
 * its `match`, lost its shadowing outer binding, or drifted a line would let
 * such a row pass while measuring nothing. The `match` node's own range and each
 * arm's body range are in the list because those are the ranges the group (b) /
 * (c) verdicts are anchored on, so a row's `[]` is measured at a node the pass
 * demonstrably visited.
 */
function armSites(doc: ThetaDocument): string[] {
  const out: string[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "match":
        out.push(`match@${at(e.range)}`);
        walkExpr(e.scrutinee);
        for (const arm of e.arms) {
          out.push(`arm ${binders(arm.pattern)}@${at(arm.body.range)}`);
          walkExpr(arm.body);
        }
        return;
      case "call":
        e.args.forEach((a: Expr, i: number) => {
          out.push(`arg ${e.callee}#${i}@${at(a.range)}`);
        });
        for (const a of e.args) walkExpr(a);
        return;
      case "par-for":
        out.push(`par-for ${e.variable}@${at(e.iterand.range)}`);
        walkExpr(e.iterand);
        if (e.max !== null) walkExpr(e.max);
        walkBlock(e.body);
        return;
      case "invoke":
        for (const a of e.args) walkExpr(a);
        return;
      case "method-call":
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
        return;
      case "member":
        walkExpr(e.target);
        return;
      case "index":
        walkExpr(e.target);
        walkExpr(e.index);
        return;
      case "binary":
        walkExpr(e.left);
        walkExpr(e.right);
        return;
      case "ternary":
        walkExpr(e.condition);
        walkExpr(e.consequent);
        walkExpr(e.alternate);
        return;
      case "array":
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "result-ctor":
        walkExpr(e.arg);
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
        out.push(`let ${s.name}@${at(s.range)}`);
        if (s.init !== null) walkExpr(s.init);
        return;
      case "for":
        out.push(`for ${s.variable}@${at(s.iterand.range)}`);
        walkExpr(s.iterand);
        walkBlock(s.body);
        return;
      case "fn":
        out.push(`fn ${s.name}(${s.params.map((p) => p.name).join(",")})`);
        walkBlock(s.body);
        return;
      case "while":
        walkExpr(s.condition);
        walkBlock(s.body);
        return;
      case "if": {
        out.push(`if@${at(s.condition.range)}`);
        walkExpr(s.condition);
        walkBlock(s.then);
        // `otherwise` is a chained `IfStmt`, an `else` `Block`, or none; only
        // the statement form carries a `kind` discriminator.
        const otherwise = s.otherwise;
        if (otherwise !== null) {
          if ("kind" in otherwise) walkStmt(otherwise);
          else walkBlock(otherwise);
        }
        return;
      }
      case "tool-call":
        walkExpr(s.call);
        return;
      case "invoke":
        walkExpr(s.invoke);
        return;
      case "expr":
        walkExpr(s.expr);
        return;
      case "reassign":
        walkExpr(s.value);
        return;
      case "return":
        if (s.operand !== null) walkExpr(s.operand);
        return;
      default:
        return;
    }
  };
  const body = doc.body;
  if (body === null) {
    throw new Error(
      `harness: the fixture produced no parsed body, so its diagnostic set is about a parse failure rather than the arm-scope defect under test. Diagnostics: ${render(doc)}`,
    );
  }
  walkBlock(body);
  return out;
}

interface Expectation {
  readonly codes: readonly string[];
  readonly msgs: readonly string[];
}

/** The empty contract — no diagnostic at all. */
const CLEAN: Expectation = { codes: [], msgs: [] };

function one(code: string, message: string): Expectation {
  return { codes: [code], msgs: [message] };
}

function two(first: Expectation, second: Expectation): Expectation {
  return {
    codes: [...first.codes, ...second.codes],
    msgs: [...first.msgs, ...second.msgs],
  };
}

interface Row {
  readonly label: string;
  /** The fixture body; frontmatter is prepended by `expectRow`. */
  readonly src: string;
  /** `FM` (3 lines) unless the row needs `params:` (`FM_PARAMS`, 5 lines). */
  readonly frontmatter?: string;
  readonly sites: readonly string[];
  readonly expected: Expectation;
  /** Why the spec owes this verdict, which group, which direction. */
  readonly reason: string;
  /** Optional `severity code @range` list, pinning WHICH node carries a verdict. */
  readonly located?: readonly string[];
}

/**
 * One row: the site precondition, then the WHOLE ordered code list, then the
 * whole ordered message list, then (when supplied) the whole ordered located
 * form. Whole-list ordered equality throughout and unfiltered — a containment
 * matcher would let an over-correction's spurious extra emission hide, and half
 * the rows in this file assert an EMPTY list.
 */
function expectRow(row: Row): ThetaDocument {
  const doc = parseDoc((row.frontmatter ?? FM) + row.src, FILE);
  expect(
    armSites(doc),
    `${row.label} PRECONDITION: the fixture's binding, \`match\` and arm sites must be exactly these — the arm's binder spelling must still collide with the outer binding's, and the \`match\` node must still be at the asserted range. A drifted or unparsed fixture fails HERE instead of letting the assertions below measure nothing. Diagnostics: ${render(doc)}`,
  ).toEqual([...row.sites]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.code),
    `${row.label} — ${row.reason}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.codes]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.message),
    `${row.label} — DIAG-4 (diagnostic-shape.md:74): the rendered messages are the registry *Message* column interpolated\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.msgs]);
  const located = row.located;
  if (located !== undefined) {
    expect(
      doc.diagnostics.map((d: Diagnostic) => {
        const r = d.range;
        return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}`;
      }),
      `${row.label} — the verdict's range and severity. Diagnostics: ${render(doc)}`,
    ).toEqual([...located]);
  }
  return doc;
}

// ===========================================================================
// (b) The six registered `E`-severity rows that refuse a spec-legal theta.
//
// Each subject differs from its control by ONE LINE — the outer `let` (or, at
// b15/b16, the `fn` parameter name) that the refused construct does not
// mention. The refused value is `"hi"` in every case, measured in group (f)
// below through the production executor: these are FALSE refusals, of programs
// the runtime executes correctly, at `E` severity, so `hasLoadParseError`
// (src/extension/production-composition.ts) denies the theta registration and
// the author has no runtime to check the claim against.
//
// Every code here carries `E` in the registry, and every one of these inputs
// sits OUTSIDE its own registered *Trigger*: `let-rhs-type-mismatch`'s trigger
// is an initialiser "static type that is not compatible with" the annotation,
// and b1's initialiser produces `"hi"`.
// ===========================================================================

describe("bug 0145 (b) — six registered `E` rows refuse a spec-legal theta", () => {
  it("RED b1: a `string`-annotated `let` over `match \"hi\" { x => x }` is refused because `x` reads the outer `let x = 1`", () => {
    expectRow({
      label: "b1 [let annotation]",
      src: 'let x = 1\nlet m: string = match "hi" { x => x }\nm\n',
      sites: ["let x@4:1-4:10", "let m@5:1-5:38", "match@5:17-5:38", "arm x@5:35-5:36"],
      expected: CLEAN,
      reason:
        "GROUP (b), REFUSAL-REMOVAL direction. expressions.md:168 binds the identifier pattern's value to `x` and :51 makes that binding shadow everything else lexically, so the arm body's `x` is `\"hi\"` — compatible with the `string` annotation, which puts this input outside let-rhs-type-mismatch's registered *Trigger*. Row f1 below runs the control and measures `\"hi\"`. Under §Fix (a) route 1 with the withheld sentinel the arm binder is unresolvable, so type-system.md:48 (*Unresolvable operands*) makes the sink defer and this list is empty",
    });
  });

  it("PIN b2 [CTL]: the same `let` without the outer `let x = 1` is silent", () => {
    expectRow({
      label: "b2 [CTL no shadow]",
      src: 'let m: string = match "hi" { x => x }\nm\n',
      sites: ["let m@4:1-4:38", "match@4:17-4:38", "arm x@4:35-4:36"],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint: with no same-named enclosing record the arm body's read mints a `named` from its own spelling, which resolves to nothing, and type-system.md:48 makes every sink defer. Green in both directions — a route that makes an unrecorded binder resolvable to anything breaks this",
    });
  });

  it("RED b3: two arms that both evaluate to strings draw `match-arm-type-mismatch`", () => {
    expectRow({
      label: "b3 [arm LUB]",
      src: 'let x = 1\nlet m = match "hi" { x => x, "b" => "z" }\nm\n',
      sites: [
        "let x@4:1-4:10",
        "let m@5:1-5:42",
        "match@5:9-5:42",
        "arm x@5:27-5:28",
        'arm "b"@5:37-5:40',
      ],
      expected: CLEAN,
      reason:
        "GROUP (b). code-registry-parse.md's trigger for match-arm-type-mismatch is \"a `match` arm's body type is not assignable to the common type of the other arms\"; these arms produce `\"hi\"` and `\"z\"`, both strings, and expressions.md:180's common-upper-bound rule is being applied to types no arm has. This row reaches `checkMatchArmTypes` through `walkExpr`'s `case \"match\"` — whose `armTypes` mapping calls `typeOf(arm.body, bindings)` with the ENCLOSING map — so closing the inference pass alone does NOT green it; the STRUCTURAL row below pins that second half",
    });
  });

  it("PIN b4 [CTL]: the same two arms without the outer `let x = 1` are silent", () => {
    expectRow({
      label: "b4 [CTL no shadow]",
      src: 'let m = match "hi" { x => x, "b" => "z" }\nm\n',
      sites: ["let m@4:1-4:42", "match@4:9-4:42", "arm x@4:27-4:28", 'arm "b"@4:37-4:40'],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint: `leastUpperBound` (src/parser/match-result.ts) does not let an `\"unknown\"` compatibility answer block a candidate, so an unresolvable arm type defers. Green in both directions",
    });
  });

  it("RED b5: `match \"hi\" { x => x } + \"a\"` draws `mixed-plus-operands`", () => {
    expectRow({
      label: "b5 [plus operands]",
      src: 'let x = 1\nlet s = match "hi" { x => x } + "a"\ns\n',
      sites: ["let x@4:1-4:10", "let s@5:1-5:36", "match@5:9-5:30", "arm x@5:27-5:28"],
      expected: CLEAN,
      reason:
        "GROUP (b). Both operands are strings — the runtime returns `\"hia\"` (row f3) — so mixed-plus-operands' registered trigger (`+` applied to a number/integer and a string) does not hold. The `integer` it names is the type of `let x = 1`, a line the `+` does not read",
    });
  });

  it("PIN b6 [CTL]: the same `+` without the outer `let x = 1` is silent", () => {
    expectRow({
      label: "b6 [CTL no shadow]",
      src: 'let s = match "hi" { x => x } + "a"\ns\n',
      sites: ["let s@4:1-4:36", "match@4:9-4:30", "arm x@4:27-4:28"],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint: type-system.md:48's deferral at the `+` operand gate. Green in both directions",
    });
  });

  it("RED b7: an `array<string>`-annotated `let` over `[match \"hi\" { x => x }]` draws two rows", () => {
    expectRow({
      label: "b7 [array element]",
      src: 'let x = 1\nlet xs: array<string> = [match "hi" { x => x }]\nxs\n',
      sites: ["let x@4:1-4:10", "let xs@5:1-5:48", "match@5:26-5:47", "arm x@5:44-5:45"],
      expected: CLEAN,
      reason:
        "GROUP (b), and the one subject that draws TWO registered rows from one source — array-element-type-mismatch at the element and let-rhs-type-mismatch at the annotation. The value is `[\"hi\"]` (row f4), so neither trigger holds. Asserting the whole list unfiltered is what makes a route that closes one and leaves the other visible as such",
    });
  });

  it("PIN b8 [CTL]: the same array literal without the outer `let x = 1` is silent", () => {
    expectRow({
      label: "b8 [CTL no shadow]",
      src: 'let xs: array<string> = [match "hi" { x => x }]\nxs\n',
      sites: ["let xs@4:1-4:48", "match@4:26-4:47", "arm x@4:44-4:45"],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint: the array-element sink and the `let` annotation sink both defer on an unresolvable element. Green in both directions",
    });
  });

  it("RED b9: a schema constructor field over `match \"hi\" { x => x }` draws `object-field-type-mismatch`", () => {
    expectRow({
      label: "b9 [object field]",
      src: 'schema P { s: string }\nlet x = 1\nlet p = P { s: match "hi" { x => x } }\np\n',
      sites: ["let x@5:1-5:10", "let p@6:1-6:39", "match@6:16-6:37", "arm x@6:34-6:35"],
      expected: CLEAN,
      reason:
        "GROUP (b). object-field-type-mismatch's registered trigger requires a field value \"whose static type is not compatible with the schema's declared type\"; the value is `\"hi\"` and the field is `s: string` — the constructed object is `{\"s\":\"hi\"}` (row f5)",
    });
  });

  it("PIN b10 [CTL]: the same constructor without the outer `let x = 1` is silent", () => {
    expectRow({
      label: "b10 [CTL no shadow]",
      src: 'schema P { s: string }\nlet p = P { s: match "hi" { x => x } }\np\n',
      sites: ["let p@5:1-5:39", "match@5:16-5:37", "arm x@5:34-5:35"],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint: the registered trigger's own \"statically resolvable\" qualifier is what makes this deferral correct rather than accidental. Green in both directions",
    });
  });

  it("RED b11: an `integer`-annotated `let` over a string-valued `match` draws `integer-narrowing`", () => {
    expectRow({
      label: "b11 [integer narrowing]",
      src: 'let x = 1.5\nlet m: integer = match "hi" { x => x }\nm\n',
      sites: ["let x@4:1-4:12", "let m@5:1-5:39", "match@5:18-5:39", "arm x@5:36-5:37"],
      expected: CLEAN,
      reason:
        "GROUP (b), and the sharpest of the six: the message `cannot narrow number to integer` names a `number` that appears nowhere in the judged expression — it is `let x = 1.5`'s type, read through the shadowed binder. The arm's value is a string, so integer-narrowing's registered trigger (a `number` value used where `integer` is expected) does not hold at all",
    });
  });

  it("PIN b12 [CTL]: the same annotation without the outer `let x = 1.5` is silent", () => {
    expectRow({
      label: "b12 [CTL no shadow]",
      src: 'let m: integer = match "hi" { x => x }\nm\n',
      sites: ["let m@4:1-4:39", "match@4:18-4:39", "arm x@4:36-4:37"],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint AND an acknowledged OWED emission this route does not pay: a string against an `integer` annotation is a real mismatch, and §Fix (b)'s withheld-sentinel bullet states plainly that the route \"leaves c2, c4, c6 and b12 missing owed emissions, which is the deferral the controls already exhibit and not a new loss\". Paying it needs the scrutinee's type at the binder, which §Non-goals places outside this report. Green in both directions",
    });
  });

  it("RED b13: a COMPOSITE arm body carries the erased read outward", () => {
    expectRow({
      label: "b13 [composite arm body]",
      src: 'let x = 1\nlet m: string = match "hi" { x => x + "a" }\nm\n',
      sites: ["let x@4:1-4:10", "let m@5:1-5:44", "match@5:17-5:44", "arm x@5:35-5:42"],
      expected: CLEAN,
      reason:
        "GROUP (b). The leak is not confined to a bare binder read: `x + \"a\"` types as the union `integer | string` and the `let` sink refuses it, where the runtime concatenates two strings. This row is why a fix cannot be a special case for a single-identifier arm body — the scope has to be in place for the whole body expression",
    });
  });

  it("PIN b14: a NESTED `match` reaching the outer LUB row is silent at HEAD and stays silent", () => {
    expectRow({
      label: "b14 [nested match]",
      src: 'let x = 1\nlet m = match "hi" { x => match "b" { "a" => x, _ => "z" }, "q" => "w" }\nm\n',
      sites: [
        "let x@4:1-4:10",
        "let m@5:1-5:73",
        "match@5:9-5:73",
        "arm x@5:27-5:59",
        "match@5:27-5:59",
        'arm "a"@5:46-5:47',
        "arm _@5:54-5:57",
        'arm "q"@5:68-5:71',
      ],
      expected: CLEAN,
      reason:
        "DRIFT vs the bug document, which records `match-arm-type-mismatch` @5:9 for this source; at this HEAD it is `[]`. The document's row predates the reductions that now dominate here, so `[]` is the pre-fix BASELINE this cell pins, not a claim the document makes. Asserted as a fence in both directions so a route that changes `#commonType`'s candidate set (bug 0081's neighbourhood) cannot quietly ADD an emission at a nested arm",
    });
  });

  it("RED b15: an `fn` PARAMETER is as good a shadowed outer as a `let`", () => {
    expectRow({
      label: "b15 [fn parameter shadowed]",
      src: 'fn f(x: integer): string { let m: string = match "hi" { x => x }  m }\nlet r = f(1)\nr\n',
      sites: [
        "fn f(x)",
        "let m@4:28-4:65",
        "match@4:44-4:65",
        "arm x@4:62-4:63",
        "let r@5:1-5:13",
        "arg f#0@5:11-5:12",
      ],
      expected: CLEAN,
      reason:
        "GROUP (b). `walkFn` records an annotated parameter as a resolvable `CompatType`, so a parameter name is a shadowable outer exactly like a `let` — which widens the input class from \"a file with a stray same-named `let`\" to \"any `fn` whose parameter shares a spelling with an arm binder\". Row f7 runs b16 and measures `\"hi\"`",
    });
  });

  it("PIN b16 [CTL]: the same `fn` with the parameter renamed `y` is silent", () => {
    expectRow({
      label: "b16 [CTL param renamed]",
      src: 'fn f(y: integer): string { let m: string = match "hi" { x => x }  m }\nlet r = f(1)\nr\n',
      sites: [
        "fn f(y)",
        "let m@4:28-4:65",
        "match@4:44-4:65",
        "arm x@4:62-4:63",
        "let r@5:1-5:13",
        "arg f#0@5:11-5:12",
      ],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint, and the exact one-token delta that makes b15 a shadowing defect rather than a property of the `fn` body. Green in both directions",
    });
  });

  it("RED b17: the CONSTRUCTOR pattern's binder behaves identically, and draws two rows", () => {
    expectRow({
      label: "b17 [Ok(x) binder]",
      src: 'let x = 1\nlet m: string = match Ok("a") { Ok(x) => x, Err(e) => "z" }\nm\n',
      sites: [
        "let x@4:1-4:10",
        "let m@5:1-5:60",
        "match@5:17-5:60",
        "arm Ok(x)@5:42-5:43",
        "arm Err(e)@5:55-5:58",
      ],
      expected: CLEAN,
      reason:
        "GROUP (b). `collectPatternBinderNames` (src/parser/match-result.ts) binds for the `constructor` pattern class as well as `identifier`, and both registered rows fire on one source: the `let` annotation sink and `checkMatchArmTypes`. The runtime value is `\"a\"` (row f6). Two rows means BOTH halves of the fix are needed here — the pass for the `let` sink and the arm-scoped `armTypes` mapping for the LUB row",
    });
  });

  it("PIN b18 [CTL]: the same `Ok(x)` pattern without the outer `let x = 1` is silent", () => {
    expectRow({
      label: "b18 [CTL no shadow]",
      src: 'let m: string = match Ok("a") { Ok(x) => x, Err(e) => "z" }\nm\n',
      sites: [
        "let m@4:1-4:60",
        "match@4:17-4:60",
        "arm Ok(x)@4:42-4:43",
        "arm Err(e)@4:55-4:58",
      ],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint: both the `let` sink and the LUB row defer on an unresolvable constructor-payload binder. Green in both directions",
    });
  });
});

// ===========================================================================
// (c) Three rows with the right code and the wrong `<type>`.
//
// The `match` in each row evaluates to `"hi"`. A string is not a boolean, not
// an `array<T>` (control-flow.md:13), and has no `frobnicate` member, so all
// three codes are OWED. Each names `integer` — the type of a binding the
// construct does not read — in a `<type>` placeholder DIAG-4
// (diagnostic-shape.md:74) makes normative and whose rendering rule
// (placeholder-rendering-a.md:19) is "Render the Theta static type". The
// rendering is well-formed; the type is another binding's.
//
// Under the settled route these three become deferrals, which is the same
// silence their controls already show. c2 and c6 are those controls. c4 is the
// one row in this group whose control EMITS, and the fix removes that emission
// — see its cell.
// ===========================================================================

describe("bug 0145 (c) — the right code naming a type the operand does not have", () => {
  it("RED c1: `if match \"hi\" { x => x }` renders `got integer` for a string condition", () => {
    expectRow({
      label: "c1 [condition]",
      src: 'let x = 1\nif match "hi" { x => x } { let z = 1 }\n"t"\n',
      sites: [
        "let x@4:1-4:10",
        "if@5:4-5:25",
        "match@5:4-5:25",
        "arm x@5:22-5:23",
        "let z@5:28-5:37",
      ],
      expected: CLEAN,
      reason:
        "GROUP (c). non-boolean-condition is owed — a string is not a boolean — but the type it renders belongs to `let x = 1`. Under the settled route the operand is unresolvable and type-system.md:48 defers, matching c2; §Fix (b)'s withheld-sentinel bullet names c2 among the rows left \"missing owed emissions\", the acknowledged cost of the smallest step",
    });
  });

  it("PIN c2 [CTL]: the same condition without the outer `let x = 1` is silent", () => {
    expectRow({
      label: "c2 [CTL no shadow]",
      src: 'if match "hi" { x => x } { let z = 1 }\n"t"\n',
      sites: ["if@4:4-4:25", "match@4:4-4:25", "arm x@4:22-4:23", "let z@4:28-4:37"],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint: the condition gate defers on an unresolvable operand. Green in both directions, and the post-fix target c1 converges on",
    });
  });

  it("RED c3: `for y in match \"hi\" { x => x }` renders `got integer` for a string iterand", () => {
    expectRow({
      label: "c3 [iterand]",
      src: 'let x = 1\nfor y in match "hi" { x => x } { y }\n"t"\n',
      sites: ["let x@4:1-4:10", "for y@5:10-5:31", "match@5:10-5:31", "arm x@5:28-5:29"],
      expected: CLEAN,
      reason:
        "GROUP (c). control-flow.md:13's `for` iterand contract is owed a verdict here — the iterand is a string — but the rendered `integer` is `let x = 1`'s. Its control c4 EMITS with a different rendering, which is what makes this row's fix-produced silence a measurable pair",
    });
  });

  it("REMOVAL c4 [CTL]: the same iterand without the outer `let x = 1` emits `got x` today, and nothing after the fix", () => {
    // ADJUDICATION. §Fix (c) asks for c4's rendered `got x` to be asserted
    // UNCHANGED, "so a route that closes this defect and leaves the mint is
    // visible as such". §Fix (b)'s own withheld-sentinel bullet contradicts
    // that: it predicts exactly this loss — the route "leaves c2, c4, c6 and
    // b12 missing owed emissions". The two sentences cannot both hold, because
    // `got x` IS the spelling mint the withheld sentinel replaces: once the
    // binder is recorded as `<withheld>` there is no `x` nominal for the
    // iterand gate to name, and an unresolvable operand defers under
    // type-system.md:48. Measurement settles it in favour of §Fix (b), which is
    // the more specific of the two statements and the one attached to the route
    // this witness implements. This cell therefore asserts the POST-FIX value.
    //
    // Direction: PERMISSIVE / REMOVAL. This input is not a group-(b) false
    // refusal — it is an owed emission on an unresolvable operand, and the
    // silence is the deferral floor the ten group-(b) controls already sit on.
    // GOV-15 (source-language-stability.md:5) is engaged in the removal
    // direction only, which :9's loads-cleanly predicate does not promise.
    expectRow({
      label: "c4 [CTL — REMOVAL]",
      src: 'for y in match "hi" { x => x } { y }\n"t"\n',
      sites: ["for y@4:10-4:31", "match@4:10-4:31", "arm x@4:28-4:29"],
      expected: CLEAN,
      reason:
        "GROUP (c) control, REMOVAL direction. At HEAD this emits non-array-iterand @4:10 rendering `got x` — the binder's own spelling, minted by the `ident` arm's `??` fallback (bug 0136's family). The withheld sentinel is unspellable, so the mint no longer happens and the gate defers",
    });
  });

  it("RED c5: `match \"hi\" { x => x }.frobnicate()` renders `on type integer`", () => {
    expectRow({
      label: "c5 [method receiver]",
      src: 'let x = 1\nlet m = match "hi" { x => x }.frobnicate()\nm\n',
      sites: ["let x@4:1-4:10", "let m@5:1-5:43", "match@5:9-5:30", "arm x@5:27-5:28"],
      expected: CLEAN,
      reason:
        "GROUP (c). unknown-method is owed — a string has no `frobnicate` — and the rendered receiver type is `let x = 1`'s. This is the PASS half of the d1/d2 divergence pair below: the same identifier under the same pattern, taken as the `match`'s own type",
    });
  });

  it("PIN c6 [CTL]: the same method call without the outer `let x = 1` is silent", () => {
    expectRow({
      label: "c6 [CTL no shadow]",
      src: 'let m = match "hi" { x => x }.frobnicate()\nm\n',
      sites: ["let m@4:1-4:43", "match@4:9-4:30", "arm x@4:27-4:28"],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint: the method-receiver gate defers on an unresolvable receiver. Green in both directions — and, like c2 and b12, an owed emission §Fix (b) names as this route's acknowledged cost",
    });
  });
});

// ===========================================================================
// (d) The two channels on ONE node, and the four non-leak fences.
//
// The d1/d2 pair is asserted in ONE cell, which §Fix's Witness section requires
// explicitly ("asserted together in one cell so a fix cannot close one and
// leave the other"). d1 goes through `walkExpr`'s arm-body WALK, which is
// already arm-scoped (`matchArmScope`), and defers. d2 goes through the PASS,
// which is not, and reports. One identifier, one pattern, one document, two
// answers.
// ===========================================================================

describe("bug 0145 (d) — the divergence pair and the non-leak fences", () => {
  it("RED d1+d2 [PAIR]: `x.frobnicate()` INSIDE the arm defers while `x` AS the arm's value reports — both must defer", () => {
    // THE DIVERGENCE PAIR, in one cell by §Fix's explicit requirement. d1's
    // read is walked through `matchArmScope` (src/parser/type-layer-checks.ts,
    // `walkExpr`'s `case "match"`), which records the binder WITHHELD; d2's is
    // taken as `typeOf(match)` through `#typeExpr`'s `case "match"`
    // (src/parser/static-type-inference.ts), which has no arm scope. Splitting
    // the two into separate cells would let a route close the pass and leave a
    // future reader on that node taking the enclosing map again.
    expectRow({
      label: "d1 [walk, arm-scoped — green at HEAD, stays green]",
      src: 'let x = 1\nlet m = match "hi" { x => x.frobnicate() }\nm\n',
      sites: ["let x@4:1-4:10", "let m@5:1-5:43", "match@5:9-5:43", "arm x@5:27-5:41"],
      expected: CLEAN,
      reason:
        "the WALK half of the pair: already correct, and the posture the pass must join. `matchArmScope`'s own doc comment states the contract — the arm-body walk and `provableArgType`'s reduction \"both resolve it through here — the two disagreeing about which binding an arm body reads is the scope mismatch this exists to close\"",
    });
    expectRow({
      label: "d2 [pass, enclosing-scoped — RED at HEAD]",
      src: 'let x = 1\nlet m = match "hi" { x => x }.frobnicate()\nm\n',
      sites: ["let x@4:1-4:10", "let m@5:1-5:43", "match@5:9-5:30", "arm x@5:27-5:28"],
      expected: CLEAN,
      reason:
        "the PASS half of the pair, and the whole defect in two source lines an author cannot distinguish. Same fixture as c5, asserted here as the pair's second half so a route that closes one channel and not the other reds inside this single cell",
    });
  });

  it("RED d3: an arm binder shadowing a `for` variable now leaks — DRIFT vs the document", () => {
    // DRIFT. The bug document records `[]` here, on the reasoning that a plain
    // `for` variable is recorded WITHHELD, so the arm binder's shadow reads a
    // withheld twin and draws nothing. That reasoning expired: bugs 0194 /
    // 0199 landed `bindLoopElement` (src/parser/type-layer-checks.ts), which
    // records a REAL element type for the `for` variable when the iterand's
    // element is resolvable — and `[1]`'s is. The arm binder's shadow therefore
    // reads a TYPED outer record and the row emits, exactly like b1.
    //
    // Which makes this a GROUP-(b)-CLASS ROW, not the fence the document filed
    // it as: a spec-legal theta whose value is `"hi"`, refused at `E`. It is
    // asserted here as `[]` on the same authority every other group-(b) row is.
    expectRow({
      label: "d3 [for-variable shadow — DRIFT, group-(b)-class]",
      src: 'for x in [1] { let m: string = match "hi" { x => x } }\n"t"\n',
      sites: ["for x@4:10-4:13", "let m@4:16-4:53", "match@4:32-4:53", "arm x@4:50-4:51"],
      expected: CLEAN,
      reason:
        "GROUP (b) class, by measurement rather than by the document's row. At this HEAD this emits let-rhs-type-mismatch @4:16 `expected string, got integer`, because `bindLoopElement` gives the `for` variable `[1]`'s element type; the document's `[]` was measured before that landed. The `match` reads `\"hi\"` under either reading, so the refusal is false on exactly b1's grounds",
    });
  });

  it("PIN d4: a shadowed outer that HAPPENS to satisfy the position stays silent — for a different reason after the fix", () => {
    // §Fix (c) requires this cell's mechanism change to be written into it.
    //
    // BEFORE: the arm binder's read resolves to `let x = "s"`'s record, which
    // is `string`, which the `string` annotation accepts. The check PASSES —
    // and it passes for the wrong reason, on a type the arm body does not have.
    // AFTER: the binder is the withheld sentinel, the operand is unresolvable,
    // and type-system.md:48 makes the sink DEFER.
    //
    // Observationally identical in both directions; a wholly different path
    // through the checker. This row is in the file because it is the *deferral
    // floor* in its benign direction — the reason a shadow can only ever ADD a
    // refusal at these sinks and never remove one, which is what bounds the
    // whole channel to the inadmissible direction.
    expectRow({
      label: "d4 [benign shadow — mechanism changes, observable does not]",
      src: 'let x = "s"\nlet m: string = match "hi" { x => x }\nm\n',
      sites: ["let x@4:1-4:12", "let m@5:1-5:38", "match@5:17-5:38", "arm x@5:35-5:36"],
      expected: CLEAN,
      reason:
        "green in both directions with a changed mechanism: a PASS on a coincidentally-compatible outer record becomes a DEFERRAL on an unresolvable binder. §Fix (c) makes recording that here a constraint on the route",
    });
  });

  it("PIN d5: a pattern binding NOTHING allocates no scope and changes nothing", () => {
    expectRow({
      label: "d5 [wildcard binds nothing]",
      src: 'let x = 1\nlet m: string = match "hi" { _ => "z" }\nm\n',
      sites: ["let x@4:1-4:10", "let m@5:1-5:40", "match@5:17-5:40", "arm _@5:35-5:38"],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint. `collectPatternBinderNames` binds nothing for the wildcard and literal classes, and `matchArmScope`'s empty-name branch returns the caller's map unchanged rather than copying it. A route that copies a map per arm unconditionally is measurably wasteful and this row is where that shows up as intent; green in both directions",
    });
  });

  it("REMOVAL d6: a `schema` whose name matches the binder's spelling is adopted today and is not after the fix", () => {
    // Bug 0136's boundary row, and the one place this fix changes a rendered
    // type rather than removing a whole verdict. At HEAD the binder `xs` is
    // unshadowed, so the `ident` arm's `??` fallback mints `named xs`, the
    // declaration `schema xs = array<integer>` resolves it, and the `let` sink
    // refuses with `got xs`. Under the withheld sentinel the binder's spelling
    // is never minted — `WITHHELD_BINDER_TYPE_NAME` is unspellable, which is
    // the property bug 0143 owns — so no declaration is adopted and the sink
    // defers.
    //
    // The `schema-case-mismatch` on the lowercase declaration name is
    // INDEPENDENT of this defect and must survive; asserting the whole list
    // unfiltered is what pins that.
    //
    // Direction: PERMISSIVE / REMOVAL, like c4 — not a group-(b) refusal.
    expectRow({
      label: "d6 [schema-name collision — REMOVAL]",
      src: 'schema xs = array<integer>\nlet m: string = match "hi" { xs => xs }\nm\n',
      sites: ["let m@5:1-5:40", "match@5:17-5:40", "arm xs@5:36-5:38"],
      expected: one(SCHEMA_CASE, SCHEMA_CASE_MESSAGE),
      located: [`error ${SCHEMA_CASE} @4:8-4:10`],
      reason:
        "REMOVAL direction. At HEAD this draws schema-case-mismatch @4:8 AND let-rhs-type-mismatch @5:1 `expected string, got xs`; after the fix the second is gone because the withheld sentinel is unspellable and mints no `named xs` for the declaration to satisfy. The lexical case verdict is not this defect's and stays",
    });
  });

  it("RED d7: a frontmatter `params:` field IS a shadowable outer now — DRIFT vs the document", () => {
    // DRIFT. The bug document records `[]` here and gives the mechanism: "a
    // frontmatter `params:` field is not in `bindings` at all, so it cannot be
    // the shadowed outer". That is false at this HEAD — bug 0192's fix put
    // declared `params:` types into the type layer's bindings map — so the arm
    // binder `topic` shadows a resolvable `string` record and the `integer`
    // annotation refuses it.
    //
    // The document files this as a FENCE; measurement makes it a
    // GROUP-(b)-CLASS ROW, and a materially worse one than b1, because the
    // shadowed outer is now declared in FRONTMATTER — a different file region
    // from the body the diagnostic points at.
    expectRow({
      label: "d7 [params: shadow — DRIFT, group-(b)-class]",
      frontmatter: FM_PARAMS,
      src: "let m: integer = match 7 { topic => topic }\nm\n",
      sites: ["let m@6:1-6:44", "match@6:18-6:44", "arm topic@6:37-6:42"],
      expected: CLEAN,
      reason:
        "GROUP (b) class, by measurement rather than by the document's row. At this HEAD this emits let-rhs-type-mismatch @6:1 `expected integer, got string` — the `string` is the frontmatter `params: topic` declaration's, read through the shadowed binder, and the arm's own value is the integer `7`. d8 is its one-token control",
    });
  });

  it("PIN d8 [CTL]: the same `params:`-bearing theta with a NON-shadowing binder is silent", () => {
    expectRow({
      label: "d8 [CTL params, no shadow]",
      frontmatter: FM_PARAMS,
      src: "let m: integer = match 7 { other => other }\nm\n",
      sites: ["let m@6:1-6:44", "match@6:18-6:44", "arm other@6:37-6:42"],
      expected: CLEAN,
      reason:
        "d7's control: renaming the arm binder off the `params:` field's spelling restores silence, so d7's refusal is the shadow and not the annotation. Green in both directions",
    });
  });
});

// ===========================================================================
// (e) The other two binder classes.
//
// `collectPatternBinderNames` (src/parser/match-result.ts) binds for four
// pattern classes — `identifier`, `constructor`, `object` and `array`. Group
// (b) covers the first two (b1, b17); these rows cover the other two, so the
// fix's scope construction is measured over the whole binder grammar rather
// than over the identifier case a naive route might special-case.
//
// The top-level runtime disposition of an array / object pattern on a
// non-`Result` scrutinee is a `theta/runtime/match-error` (expressions.md:178).
// That is a separate matter this witness does not claim: e1 and e3 are cited
// for their PARSE verdict only, which is why there is no group-(f) runtime row
// for either.
// ===========================================================================

describe("bug 0145 (e) — the array and object pattern binder classes leak identically", () => {
  it("RED e1: the ARRAY pattern's binder", () => {
    expectRow({
      label: "e1 [array pattern binder]",
      src: 'let a = 1\nlet m: string = match ["s"] { [a] => a }\nm\n',
      sites: ["let a@4:1-4:10", "let m@5:1-5:41", "match@5:17-5:41", "arm [a]@5:38-5:39"],
      expected: CLEAN,
      reason:
        "GROUP (b) class at a third binder class. expressions.md:168's binding rule is not identifier-specific and :51's lexical shadowing is not either, so the array pattern's `a` denotes the element, never the enclosing `let a = 1`",
    });
  });

  it("PIN e2 [CTL]: the same array pattern without the outer `let a = 1` is silent", () => {
    expectRow({
      label: "e2 [CTL no shadow]",
      src: 'let m: string = match ["s"] { [a] => a }\nm\n',
      sites: ["let m@4:1-4:41", "match@4:17-4:41", "arm [a]@4:38-4:39"],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint at the array binder class. Green in both directions",
    });
  });

  it("RED e3: the OBJECT pattern's binder", () => {
    expectRow({
      label: "e3 [object pattern binder]",
      src: 'schema P { a: string }\nlet a = 1\nlet m: string = match (P { a: "s" }) { P { a } => a }\nm\n',
      sites: ["let a@5:1-5:10", "let m@6:1-6:54", "match@6:17-6:54", "arm {a:a}@6:51-6:52"],
      expected: CLEAN,
      reason:
        "GROUP (b) class at the fourth and last binder class. The object pattern's shorthand field `a` binds the field's value — the declared `a: string` — and the annotation accepts it; the refused `integer` is `let a = 1`'s",
    });
  });

  it("PIN e4 [CTL]: the same object pattern without the outer `let a = 1` is silent", () => {
    expectRow({
      label: "e4 [CTL no shadow]",
      src: 'schema P { a: string }\nlet m: string = match (P { a: "s" }) { P { a } => a }\nm\n',
      sites: ["let m@5:1-5:54", "match@5:17-5:54", "arm {a:a}@5:51-5:52"],
      expected: CLEAN,
      reason:
        "§Fix (c) constraint at the object binder class, and the last of the ten silent controls the route must preserve. Green in both directions",
    });
  });
});

// ===========================================================================
// (a) REGRESSION PINS for bug 0199 — NOT this bug's claim.
//
// Group (a) of bug 0145 — the `unprovableBindings` marking-identity leak that
// WITHHELD a true `fn-arg-type-mismatch` — is DISCHARGED by bug
// 0199 (0.120.0), whose fix keys `walkStmt`'s `let`-arm mark to the binding it
// was recorded for instead of to whatever object `typeOf` returned. THE
// AUTHORITY FOR THESE TWO ROWS IS BUG 0199, NOT BUG 0145.
//
// They are in this file because a fix to the arm scope lands on the same
// substrate — a route that makes `typeOf(match)` stop returning the outer
// binding's own object also changes what that mark can reach — and 0199's
// emission must be measured to still be there afterwards. Cell `u13e` of
// tests/fn-arg-type-mismatch-wired.test.ts is 0199's own restated pin on row
// a1; this pair is this file's local copy, not a replacement for it, and that
// cell is left untouched.
// ===========================================================================

describe("bug 0199 regression pins (this file's group (a)) — the marking-channel discharge must stay", () => {
  it("PIN a1: a shadowing arm binder no longer suppresses the later `g(x)` verdict", () => {
    expectRow({
      label: "a1 [0199's discharge]",
      src: 'fn g(s: string): number { 1 }\nlet x = 1\nlet m = match "hi" { x => x }\nlet r = g(x)\nr\n',
      sites: [
        "fn g(s)",
        "let x@5:1-5:10",
        "let m@6:1-6:30",
        "match@6:9-6:30",
        "arm x@6:27-6:28",
        "let r@7:1-7:13",
        "arg g#0@7:11-7:12",
      ],
      expected: one(FN_ARG, fnArg("g", 0, "s", "string", "integer")),
      located: [`error ${FN_ARG} @7:11-7:12`],
      reason:
        "REGRESSION PIN, authority bug 0199 (0.120.0). type-system.md:27 lists a function-argument slot among the positions `⊑` governs and :50 (TYPE-9) routes a static failure there to fn-arg-type-mismatch; the argument is the integer `1` and the parameter is `string`. Before 0199 this was `[]` because the mark landed on the outer binding's own record by identity. Green in both directions, and it must STAY green through any arm-scope route",
    });
  });

  it("PIN a2 [CTL]: the same call with no `match` in the file emits identically", () => {
    expectRow({
      label: "a2 [CTL no match]",
      src: 'fn g(s: string): number { 1 }\nlet x = 1\nlet r = g(x)\nr\n',
      sites: ["fn g(s)", "let x@5:1-5:10", "let r@6:1-6:13", "arg g#0@6:11-6:12"],
      expected: one(FN_ARG, fnArg("g", 0, "s", "string", "integer")),
      located: [`error ${FN_ARG} @6:11-6:12`],
      reason:
        "REGRESSION PIN, authority bug 0199. a1's differentiator: the same slot with no `match` anywhere, so the verdict is a property of the argument and not of the marking channel. Green in both directions",
    });
  });
});

// ===========================================================================
// STRUCTURAL — the two readers on ONE node must resolve the SAME scope.
//
// §Fix's Witness section requires one row no behavioural group supplies: "an
// assertion that `checkMatchArmTypes`'s `armTypes` mapping and `walkExpr`'s arm
// walk resolve the same scope for the same node, so a future reader added to
// that arm cannot silently take the enclosing map again."
//
// Row b3 and the second half of row b17 are the behavioural half of that
// requirement — both reach `checkMatchArmTypes`, which the inference-pass fix
// alone does not touch. This row is its structural half, and it is here because
// the behavioural rows cannot distinguish "the mapping was arm-scoped" from "the
// mapping's operand happened to become unresolvable upstream": a THIRD reader
// added to the same arm tomorrow would take `bindings` again and no cell above
// would notice.
//
// The check is over source TEXT, the house pattern
// tests/proto-named-binder-write-sites.test.ts and
// tests/tools-entry-closed-grammar-lockstep.test.ts already use for exactly
// this class of "no call site may be spelled this way" invariant. It reaches no
// private: `walkExpr` and `matchArmScope` are private methods and this asserts
// nothing about their behaviour, only about which scope expression each arm-body
// read is written with.
// ===========================================================================

const TYPE_LAYER_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/parser/type-layer-checks.ts", import.meta.url)),
  "utf8",
);

/**
 * The body of `walkExpr`'s `case "match"` block — from the `case "match":`
 * label that precedes the sole `checkMatchArmTypes` call site to the next
 * `case` label in the same switch.
 */
function walkExprMatchArm(): string {
  const call = TYPE_LAYER_SOURCE.indexOf("...checkMatchArmTypes({");
  if (call < 0) {
    throw new Error(
      "harness: src/parser/type-layer-checks.ts no longer spreads `checkMatchArmTypes`'s diagnostics — `walkExpr`'s `case \"match\"` was restructured and this row's extraction is stale, which is a harness failure and never a skip",
    );
  }
  const label = TYPE_LAYER_SOURCE.lastIndexOf('case "match":', call);
  if (label < 0) {
    throw new Error(
      "harness: no `case \"match\":` label precedes the `checkMatchArmTypes` call site in src/parser/type-layer-checks.ts — the extraction anchor is stale",
    );
  }
  const next = TYPE_LAYER_SOURCE.indexOf("      case ", call);
  if (next < 0) {
    throw new Error(
      "harness: no following `case` label bounds `walkExpr`'s `match` arm in src/parser/type-layer-checks.ts — the extraction anchor is stale",
    );
  }
  return TYPE_LAYER_SOURCE.slice(label, next);
}

describe("bug 0145 STRUCTURAL — every arm-body read on the `match` node takes the ARM scope", () => {
  it("RED: no arm-body read in `walkExpr`'s `case \"match\"` may be spelled with the ENCLOSING `bindings` map", () => {
    const arm = walkExprMatchArm();

    // PRECONDITIONS. Each names what is unmet rather than skipping, so the
    // assertion below can never pass over an arm that no longer holds either
    // reader.
    expect(
      arm.includes("checkMatchArmTypes"),
      "PRECONDITION: the extracted `walkExpr` `case \"match\"` block must contain the `checkMatchArmTypes` call — the LUB reader row b3 and row b17's second emission come through it. Block:\n" +
        arm,
    ).toBe(true);
    expect(
      arm.includes("matchArmScope"),
      "PRECONDITION: the extracted block must contain a `matchArmScope` call — the arm-body walk is already scoped through it, and it is the scope the second reader must join. Block:\n" +
        arm,
    ).toBe(true);
    const armBodyReads = arm.match(/arm\.body/g) ?? [];
    expect(
      armBodyReads.length,
      "PRECONDITION: the extracted block must hold at least TWO `arm.body` reads — the `armTypes` mapping and the arm-body walk. Found " +
        String(armBodyReads.length) +
        ". Block:\n" +
        arm,
    ).toBeGreaterThanOrEqual(2);

    // THE INVARIANT. `arm.body, bindings` is the enclosing-scoped spelling —
    // the one `checkMatchArmTypes`'s `armTypes` mapping still uses and the one
    // the arm-body walk stopped using when bug 0050's fix introduced
    // `matchArmScope`. Zero occurrences means both readers, and any third added
    // later, resolve the arm body through a scope derived from `arm.pattern`.
    // Matched over the WHOLE extracted block rather than line by line: the
    // enclosing-scoped read is the same read wherever a formatter breaks it,
    // so `this.typeOf(arm.body,\n  bindings)` must not pass for being spelled
    // across two lines.
    const enclosingScoped = (arm.match(/arm\.body\s*,\s*bindings\b/g) ?? []).map((read) =>
      read.replace(/\s+/g, " "),
    );
    expect(
      enclosingScoped,
      "bug 0145 §Fix, Witness: `checkMatchArmTypes`'s `armTypes` mapping and `walkExpr`'s arm-body walk must resolve the SAME scope for the same node. `matchArmScope`'s own doc comment states the contract — \"the two disagreeing about which binding an arm body reads is the scope mismatch this exists to close\" — and the read(s) below still take an arm body through the ENCLOSING `bindings` map, which is what rows b3 and b17 measure behaviourally. Full block:\n" +
        arm,
    ).toEqual([]);
  });
});

// ===========================================================================
// (f) THE RUNTIME — what makes the group-(b) refusals FALSE.
//
// A parse-only witness cannot say a refusal is wrong. These rows execute the
// CONTROL of each group-(b) subject (f1–f7) and of the group-(c) rows whose
// control is silent (f8 for c2, f9 for c6) — the refused variant does not
// register, so the value it would have produced is measured on the source it
// differs from by one line — through the production executor. Each group-(b)
// value satisfies the position the parse rejected it for.
//
// Harness: the shape of tests/non-object-receiver-gate.test.ts's `probeSource`
// — `parseThetaDocument` → `createProductionProducerDeps` →
// `bindPromptConversation` → `executeBody`. No `@`-query appears in any
// fixture, so no model is built and no provider is reached: this whole group is
// offline and spends zero tokens.
//
// GREEN IN BOTH DIRECTIONS. These are the falsity proof, not a red. Row f10 is
// the sharpest: the arm scope does not leak OUTWARD either — the outer `x` is
// still `1` after the `match` — so a route that installs an arm scope must not
// be a route that mutates the enclosing map.
//
// f9 is the one row here that does NOT run to a value: c6's source reaches
// `applyStdlibMethod`'s string arm with a member no string carries and the
// theta aborts. That disposition belongs to bug 0136 (the parse refusal
// `expressions.md:122` owes arriving as a runtime throw instead), and the bug
// document records it "only as the control's cost" — not as this fix's
// subject. It is asserted here because the group-(c) claim is that these
// controls are silent at parse for a reason, and a row that quietly declined
// to run would hide a control that stopped parsing clean.
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/**
 * Parse + run a query-free prompt-mode body, returning its final value.
 *
 * The parse must be CLEAN: every fixture here is a control, which the report
 * and the cells above measure as `[]`. An error-severity diagnostic therefore
 * means the control drifted into the refused form, and this throws naming the
 * diagnostics rather than skipping — a skipped runtime row would report success
 * while proving nothing about the refusals' falsity.
 *
 * Returns the pending execution rather than its value so row f9, whose control
 * ABORTS, can assert the rejection through `expect(…).rejects` without a catch
 * of its own. The parse precondition is synchronous and therefore still fails
 * loudly on the caller's stack, before any rejection matcher is reached.
 */
function startRun(label: string, body: string): Promise<BodyExecution> {
  const doc = parseDoc(FM + body, FILE);
  const errors = doc.diagnostics.filter((d: Diagnostic) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `${label} PRECONDITION: the control fixture must parse clean before it can be run — it drew ${render(doc)}`,
    );
  }
  const theta: ThetaCompositionInput = {
    slashName: "bug0145",
    sourcePath: "/theta/bug0145.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  return executeBody(theta.body, binding.executeDeps);
}

/** `startRun` plus the loud requirement that the body ran to completion. */
async function runValue(label: string, body: string): Promise<ThetaValue | undefined> {
  const execution = await startRun(label, body);
  expect(
    execution.outcome,
    `${label} PRECONDITION: the body must run to completion for its value to witness anything; outcome was ${String(execution.outcome)}`,
  ).toBe("success");
  return execution.result.value;
}

describe("bug 0145 (f) — the runtime disposition of each refused row's control", () => {
  it("PIN f1: b2's source (b1's control) evaluates to `\"hi\"`", async () => {
    expect(
      await runValue("f1", 'let m: string = match "hi" { x => x }\nm\n'),
      "b1 refuses this shape as `expected string, got integer` when a `let x = 1` precedes it. The identifier pattern binds the scrutinee (expressions.md:168) and `evalMatch` evaluates the body in a child environment carrying that binding, so the value is the string `\"hi\"` — which the `string` annotation accepts. Green in both directions",
    ).toBe("hi");
  });

  it("PIN f2: b4's source (b3's control) evaluates to `\"hi\"`", async () => {
    expect(
      await runValue("f2", 'let m = match "hi" { x => x, "b" => "z" }\nm\n'),
      "b3 refuses these two arms as a `match-arm-type-mismatch`; both bodies evaluate to strings and the first arm matches, so expressions.md:180's common upper bound is `string` and the value is `\"hi\"`. Green in both directions",
    ).toBe("hi");
  });

  it("PIN f3: b6's source (b5's control) evaluates to `\"hia\"`", async () => {
    expect(
      await runValue("f3", 'let s = match "hi" { x => x } + "a"\ns\n'),
      "b5 refuses this `+` as `integer and string`; both operands are strings and the runtime concatenates them. Green in both directions",
    ).toBe("hia");
  });

  it("PIN f4: b8's source (b7's control) evaluates to `[\"hi\"]`", async () => {
    expect(
      await runValue("f4", 'let xs: array<string> = [match "hi" { x => x }]\nxs\n'),
      "b7 refuses this literal as `array<integer>` against `array<string>`; the element is the string `\"hi\"`. Green in both directions",
    ).toEqual(["hi"]);
  });

  it("PIN f5: b10's source (b9's control) evaluates to `{\"s\":\"hi\"}`", async () => {
    expect(
      await runValue(
        "f5",
        'schema P { s: string }\nlet p = P { s: match "hi" { x => x } }\np\n',
      ),
      "b9 refuses the field `s` as `expected string, got integer`; the constructed object carries the string `\"hi\"` at `s`, which the declared field type accepts. Green in both directions",
    ).toEqual({ s: "hi" });
  });

  it("PIN f6: b18's source (b17's control) evaluates to `\"a\"`", async () => {
    expect(
      await runValue("f6", 'let m: string = match Ok("a") { Ok(x) => x, Err(e) => "z" }\nm\n'),
      "b17 refuses this as `expected string, got integer | string`; the `Ok` pattern's binder is the payload `\"a\"` and the first arm matches. Green in both directions",
    ).toBe("a");
  });

  it("PIN f7: b16's source (b15's control) evaluates to `\"hi\"`", async () => {
    expect(
      await runValue(
        "f7",
        'fn f(y: integer): string { let m: string = match "hi" { x => x }  m }\nlet r = f(1)\nr\n',
      ),
      "b15 refuses the same `fn` body when its parameter is named `x`; the body's value does not depend on the parameter's spelling. Green in both directions",
    ).toBe("hi");
  });

  it("PIN f8: c2's source (c1's control) runs to success with the value `\"t\"`", async () => {
    expect(
      await runValue("f8", 'if match "hi" { x => x } { let z = 1 }\n"t"\n'),
      "c1 refuses this condition as `condition must be boolean; got integer` when a `let x = 1` precedes it. The bug document's group-(f) row for c2 records that the condition row is not a runtime failure either way: the body runs to completion and the theta's final value is the trailing `\"t\"`. Green in both directions",
    ).toBe("t");
  });

  it("PIN f9: c6's source (c5's control) ABORTS on the string receiver — bug 0136's cost, not this fix's subject", async () => {
    // The disposition `expressions.md:122` assigns to this input is a PARSE
    // refusal ("Anything not on this list is `theta/parse/unknown-method`
    // rather than a runtime failure"); it arrives as a runtime abort instead,
    // which is bug 0136's subject. The bug document records f9 "only as the
    // control's cost", so this cell asserts the abort as the measured status
    // quo and claims nothing about where the verdict belongs.
    await expect(
      startRun("f9", 'let m = match "hi" { x => x }.frobnicate()\nm\n'),
      "c5 refuses this receiver as `unknown method 'frobnicate' on type integer` when a `let x = 1` precedes it, and c6 — this source — is silent at parse. The run therefore reaches the string receiver at runtime and aborts naming the member. Green in both directions: this fix changes neither the parse silence nor the abort",
    ).rejects.toThrow("unknown string stdlib member: frobnicate");
  });

  it("PIN f10: the arm scope does not leak OUTWARD — the enclosing `x` is still `1`", async () => {
    expect(
      await runValue("f10", 'let x = 1\nlet m = match "hi" { x => x }\nx\n'),
      "the fence on the fix's own direction: `evalMatch` installs the arm's bindings into `env.child()`, so the enclosing binding is untouched and the theta's final value is the integer `1`. A route that installs the arm scope by MUTATING the caller's bindings map would contradict this. Green in both directions",
    ).toBe(1);
  });
});
