import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { Block, Expr, Stmt, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0131 — a `<name>(args)` call whose callee resolves to a top-level `fn` in
// the same file is subject to no argument-COUNT check at any parse seam: the
// whole declared × provided matrix draws `[]`, and the only enforcement anywhere
// is the runtime `ThetaFnArityError` that surfaces an ordinary authoring mistake
// through `theta/runtime/internal-error`
// (docs/bugs/0131-in-document-fn-call-arity-unchecked.md).
//
// THE ROUTE THIS FILE WITNESSES — the report's §Fix is a set of eight open
// QUESTIONS, so it is not the spec here. The spec is the orchestrator's settled
// adjudication, `.pi/tmp/fixes/0131-adjudication.md`, whose decisions this file
// encodes verbatim and nothing wider:
//
//   §(a) MINT two rows rather than widen the two `invoke-arity-*` rows (their
//        *Message* templates open with the literal `invoke ` and the too-few
//        *Hint* prescribes defaulting a `params:` field, a repair `grammar.md`
//        forbids at a `fn` parameter — DIAG-4 defers a reword past 1.x):
//          `theta/parse/fn-arity-too-few`  — Sev E, phase `type`
//          `theta/parse/fn-arity-too-many` — Sev E, phase `type`
//        Message, both arms:
//          `fn '<name>' passes too …  arguments: expected <required>, got <provided>`
//        `<required>` is the callee's DECLARED parameter count in BOTH arms —
//        required equals total at a `fn` callee, since no `fn` parameter carries
//        a default — so the two arms differ only in direction and *Hint*.
//   §(b) Resolution ARM (2) at PARSE — a same-file top-level `fn`, `subagent fn`
//        included. ARM (3), an imported `.thetalib` symbol, is judged too, but
//        at a different SEAM: bug 0138 §Fix Route 2 closed the residual this
//        file originally deferred by wiring `checkImportedFnCallArgs`
//        (src/extension/invoke-static-checks.ts) into `checkThetaImports`
//        (src/extension/import-static-checks.ts), where the resolved library
//        already exists as a parsed document — the parser itself still holds
//        no cross-file `fn` signature and never will under this route. Cell
//        `e-imported-arm3` below stays green for that reason: the PARSE tier's
//        silence on arm (3) is now the pinned, correct answer, not a stand-in
//        for future work, and the load-pass positive coverage lives in
//        tests/imported-thetalib-fn-call-args-checked.test.ts.
//   §(c) Hosted in `checkFnCallArgs` (`src/parser/type-layer-checks.ts`) — 0050's
//        landed resolution ladder, which already holds the resolved `FnDecl` and
//        the argument list and is reached from the type walk's `case "call"` arm.
//        The diagnostic attaches to the CALL EXPRESSION's range (every cell below
//        pins that range, derived from the parsed node, never guessed). Arity is
//        decided BEFORE per-argument type, as an early `return` above the
//        per-argument loop (cell g1). WITHHELD on a junk parameter table — a
//        parameter list carrying a name no `Ident` derives holds a count the
//        author never wrote (cell f1).
//   §(f) The input classes, each dispositioned: `par for` body, statically
//        unreachable call, unannotated parameter, self-recursive call,
//        `subagent fn` call — all JUDGED; a `fn` declared and never called stays
//        silent; the imported arm and the junk parameter table are silent by
//        §(b) / §(c).
//
// CELL INVENTORY (each cell asserts the CODE, the registry-sourced MESSAGE, and
// the call expression's RANGE; each silent cell asserts an exact code list
// behind a loud anti-vacuity precondition) — 
//
//   (a) a-1v3, a-1v0, a-3v1, a-0v1   the declared × provided matrix, one
//                                    diagnostic each, correct arm, correct counts.
//   (b) b-1v1, b-0v0                 both correct-arity controls stay silent.
//   (c) c-stmt, c-ctor-field,        the syntactic positions. c-let is a-1v3
//       c-nested, c-fn-body,         itself (its call sits in a `let`
//       c-no-return-annot,           initialiser). c-par-for is THE cell that is
//       c-unannotated-param,         silent at BOTH phases today — the ERR-20
//       c-self-recursive,            downgrade turns the runtime throw into a
//       c-subagent-fn, c-par-for,    discardable element `Err` — so it is the
//       c-plain-for, c-if-false      one position no channel reports at HEAD.
//   (d) d-never-called               a `fn` declared and never called: silent.
//   (e) e-imported-arm3              arm (3)'s PARSE-tier silence, now pinned as
//                                    correct rather than as a deferral (bug 0138
//                                    §Fix Route 2 serves the arm at the load pass).
//   (f) f-junk-param-table           the §(c) withhold: `fn-param-not-identifier`
//                                    alone, no arity row.
//   (g) g-arity-before-type          a call BOTH mis-arity and mis-typed draws
//                                    the arity row and NO `fn-arg-type-mismatch`.
//   (h) h-invoke, h-theta-callable,  the excluded callee kinds: the two new
//       h-pi-tool, h-unknown-ident   codes must not appear at any of them.
//   (i) i-corpus-*                   the four tracked-corpus `fn` call sites,
//                                    re-derived at this HEAD, as non-movers.
//
// TIER — unit, offline, provider-free, deterministic. Every claim settles inside
// one `parseThetaDocument` call through the house driver `parseDoc`
// (tests/helpers/e2e-s1.ts), which is where the adjudicated host
// (`checkFnCallArgs`, reached from the type walk) runs. An integration or live
// tier would add a session round-trip to a parse-time observable and reach no
// seam this tier cannot; the runtime column the bug document also measures is
// untouched by the fix (§(g): `ThetaFnArityError` and its
// `theta/runtime/internal-error` attribution stay), so it is not this file's
// subject.
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md, the DIAG-4 rule):
// no asserted message string is written out here. Every one is READ from the
// registry's *Message* column through `parseRegistry` / `registryMessage`
// (tools/code-registry/index.js), with the row's presence and each placeholder
// asserted BEFORE the template is filled. The two minted rows do not exist at
// this HEAD, so every positive cell reds on that lookup, naming the absent row
// — the correct-reason red.
//
// NO SILENT SKIPPING (CLAUDE.md): nothing here early-returns, branches on the
// environment, or skips. A missing registry row, a fixture whose call node
// cannot be located, and a corpus file whose declaration cannot be read each
// fail loudly naming the unmet precondition.

// ===========================================================================
// The two minted codes, and the rows the excluded-callee cells measure.
// ===========================================================================

/** §(a)'s first minted row — Sev E, phase `type`. Absent at this HEAD. */
const TOO_FEW = "theta/parse/fn-arity-too-few";
/** §(a)'s second minted row — Sev E, phase `type`. Absent at this HEAD. */
const TOO_MANY = "theta/parse/fn-arity-too-many";
/** 0050's landed row at the same boundary — cell g1's arity-before-type witness. */
const FN_ARG_TYPE = "theta/parse/fn-arg-type-mismatch";
/** Bug 0225's row — the junk-parameter-table refusal cell f1 keeps byte-exact. */
const PARAM_NOT_IDENT = "theta/parse/fn-param-not-identifier";
/** 0072's Pi-tool count row — cell h3's own owning diagnostic. */
const TOOL_ARG_ARITY = "theta/parse/tool-arg-arity";
/** The callee-resolution row — cell h4's own owning diagnostic. */
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * The registry row for `code`, asserted PRESENT before anything is read off it.
 *
 * At this HEAD the two minted rows are absent, so this is where every positive
 * cell reds, naming the row §(a) mints and the *Message* it must carry.
 */
function row(code: string, why: string): RegistryRow {
  const found = REGISTRY.find((r) => r.code === code);
  expect(
    found,
    `DIAG-4 / DIAG-2: ${REGISTRY_PAGE} must carry the registered row for ${code} — ${why}. The registry is closed (DIAG-2), so an emission with no row is not assertable and a row with no emission is not either; bug 0131's adjudication §(a) mints this row with severity E, phase type.`,
  ).toBeDefined();
  return found as RegistryRow;
}

/**
 * `code`'s normative *Message* template with its named placeholders filled.
 * Row presence, then each placeholder's presence, then the substitution — so a
 * missing row or a reworded template reds by naming the registry rather than by
 * a bare string mismatch or a comparison against `undefined`.
 */
function msg(
  code: string,
  fills: ReadonlyArray<readonly [string, string]>,
  why: string,
): string {
  row(code, why);
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4: ${REGISTRY_PAGE} carries no *Message* column value for ${code} — ${why}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} *Message* template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

/**
 * `fn '<name>' passes too few|too many arguments: expected <required>, got
 * <provided>` — the two minted templates, filled from the adjudicated
 * placeholder set. `<required>` is the callee's DECLARED parameter count in both
 * arms (§(a): required equals total at a `fn` callee).
 */
function arityMessage(
  code: string,
  name: string,
  required: number,
  provided: number,
): string {
  return msg(
    code,
    [
      ["<name>", name],
      ["<required>", String(required)],
      ["<provided>", String(provided)],
    ],
    `bug 0131 §(a) mints it for a plain \`fn\` call's argument count (declared ${required}, provided ${provided} at callee '${name}')`,
  );
}

// ===========================================================================
// Parse harness. `parseDoc` (tests/helpers/e2e-s1.ts) is the shipped
// whole-document entry point `parseThetaDocument` under inert offline deps: the
// type layer under assertion is the production one, nothing is stubbed.
// ===========================================================================

/** Frontmatter for the plain fixtures — lines 1–3, body starts on line 4. */
const FM = "---\nmode: prompt\n---\n";
/** Frontmatter declaring the Pi tool `read` — lines 1–5, body starts on line 6. */
const FM_PI_TOOL = "---\nmode: prompt\ntools:\n  - read\n---\n";
/** Frontmatter declaring a `.theta` callable — lines 1–5, body starts on line 6. */
const FM_CALLABLE = "---\nmode: prompt\ntools:\n  - ./child.theta as child\n---\n";

const FILE = "bug0131.theta";

function parse(src: string): ThetaDocument {
  return parseDoc(src, FILE);
}

function at(r: SourceRange): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** Every diagnostic rendered `severity code @range: message` — the failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map(
      (d: Diagnostic) =>
        `${d.severity} ${d.code} @${d.range === undefined ? "-" : at(d.range)}: ${d.message}`,
    ),
  );
}

/** Every diagnostic rendered `severity message @range`, for one code. */
function locatedHits(doc: ThetaDocument, code: string): string[] {
  return doc.diagnostics
    .filter((d: Diagnostic) => d.code === code)
    .map((d: Diagnostic) => `${d.severity} ${d.message} @${d.range === undefined ? "-" : at(d.range)}`)
    .sort();
}

interface CallSite {
  readonly callee: string;
  readonly argCount: number;
  readonly range: SourceRange;
}

/**
 * Every `call`-shaped node of `doc` in source order, with its callee, its
 * argument count and its own range — the range §(c) attaches the diagnostic to.
 *
 * The walk reaches every position group (c) names: a `let` initialiser, an
 * expression statement, a schema-constructor field value, a nested argument, a
 * `fn` body, a `par for` body, a plain `for` body, an `if` body and a `?`
 * operand. A fixture whose call it cannot reach fails the loud precondition in
 * `callRangeOf` rather than passing an absence assertion vacuously.
 */
function collectCalls(doc: ThetaDocument): CallSite[] {
  const out: CallSite[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        out.push({ callee: e.callee, argCount: e.args.length, range: e.range });
        for (const a of e.args) walkExpr(a);
        return;
      case "invoke":
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
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "ternary":
        walkExpr(e.condition);
        walkExpr(e.consequent);
        walkExpr(e.alternate);
        return;
      case "binary":
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
        if (e.max !== null) walkExpr(e.max);
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
        if (s.otherwise !== null) {
          // The `else` arm is either a chained `IfStmt` or an `else` block; a
          // block is the shape carrying `statements`.
          if ("statements" in s.otherwise) walkBlock(s.otherwise);
          else walkStmt(s.otherwise);
        }
        return;
      default:
        return;
    }
  };
  walkBlock(doc.body);
  return out;
}

/**
 * The range of the fixture's SOLE call of `callee` carrying `argCount`
 * arguments.
 *
 * The loud precondition every cell runs first: without it, a fixture whose
 * layout drifted (or which stopped parsing) would let an "emits no arity code"
 * assertion pass while measuring nothing, and would let a positive cell pin a
 * range belonging to some other node. Selecting on the argument count as well as
 * the name is what makes the self-recursive cell (two calls of `f`, one
 * mis-arity) unambiguous.
 */
function callRangeOf(doc: ThetaDocument, callee: string, argCount: number): SourceRange {
  const hits = collectCalls(doc).filter((c) => c.callee === callee && c.argCount === argCount);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one call \`${callee}(…)\` with ${argCount} argument(s); the parse found ${hits.length}. All calls: ${JSON.stringify(
      collectCalls(doc).map((c) => `${c.callee}/${c.argCount}@${at(c.range)}`),
    )}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.range;
}

/**
 * A POSITIVE cell: `doc` carries exactly one diagnostic, it is `code`, its
 * severity is `error`, its message is the registry-sourced template filled with
 * the two counts, and its range is the call expression's own.
 *
 * The whole-list form (rather than a filter on `code`) is deliberate: every
 * positive fixture below draws `[]` at this HEAD, so the fix's only licensed
 * addition at each is this one row — "exactly one diagnostic, correct arm,
 * correct counts" is the adjudicated contract and the list is how it is scored.
 */
function expectOneArity(
  doc: ThetaDocument,
  code: string,
  callee: string,
  required: number,
  provided: number,
  why: string,
): void {
  const callRange = callRangeOf(doc, callee, provided);
  const expected = arityMessage(code, callee, required, provided);
  expect(
    doc.diagnostics.map(
      (d: Diagnostic) =>
        `${d.severity} ${d.code} @${d.range === undefined ? "-" : at(d.range)}: ${d.message}`,
    ),
    `${why}\n  EXPECTED exactly one diagnostic: error ${code} @${at(callRange)} (the call expression's range, per the adjudication §(c)) carrying the registry Message with <required>=${required}, <provided>=${provided}.\n  At HEAD neither minted row exists and no parse seam counts a \`fn\` call's arguments, so this list is empty.\n  ACTUAL: ${render(doc)}`,
  ).toEqual([`error ${code} @${at(callRange)}: ${expected}`]);
}

/**
 * A SILENT cell with its anti-vacuity preconditions: the frontmatter parsed, the
 * body walked to `units` top-level units (statements plus the block's own tail
 * expression, which is not a statement), and only then is the code list read. A
 * truncated parse, a fixture whose text drifted, or a harness that stopped
 * walking therefore cannot present itself as silence.
 */
function expectCodes(
  src: string,
  units: number,
  expectedCodes: readonly string[],
  why: string,
): ThetaDocument {
  const doc = parse(src);
  expect(
    doc.frontmatter,
    `anti-vacuity (${why}): the frontmatter did not parse, so this diagnostic list measures nothing`,
  ).not.toBeNull();
  expect(
    doc.body.statements.length + (doc.body.tail === null ? 0 : 1),
    `anti-vacuity (${why}): the body must walk to ${units} top-level unit(s) — statements plus a tail expression — before its diagnostic list is a measurement. Diagnostics: ${render(doc)}`,
  ).toBe(units);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.code),
    `${why}\n  ACTUAL: ${render(doc)}`,
  ).toEqual([...expectedCodes]);
  return doc;
}

/** Neither minted code appears anywhere in `doc`. */
function expectNoArityCode(doc: ThetaDocument, why: string): void {
  expect(
    [...locatedHits(doc, TOO_FEW), ...locatedHits(doc, TOO_MANY)],
    `${why}\n  ACTUAL: ${render(doc)}`,
  ).toEqual([]);
}

// ===========================================================================
// (a) The declared × provided matrix — §Reproduction's four rows, every one
//     measured `[]` at this HEAD. RED here on the absent registry row.
// ===========================================================================

describe("bug 0131 (a) — the declared × provided matrix draws one arity diagnostic per call", () => {
  it("a-1v3: `fn f(p: integer)` called `f(1, 2, 3)` is too many, expected 1, got 3", () => {
    // Also the `let`-initialiser position of group (c) — cell c-let is this
    // fixture, so the position is not re-fixtured below.
    const doc = parse(FM + "fn f(p: integer): integer { 1 }\nlet r = f(1, 2, 3)\nr\n");
    expect(
      callRangeOf(doc, "f", 3),
      "PRECONDITION: the call sits on body line 2 (source line 5), spanning `f(1, 2, 3)`; a drifted fixture must fail here rather than mis-pin the range below",
    ).toEqual({ start: { line: 5, column: 9 }, end: { line: 5, column: 19 } });
    expectOneArity(
      doc,
      TOO_MANY,
      "f",
      1,
      3,
      "a-1v3 — the headline row: a surplus argument has no destination under positional binding, and the callee's declared count is one",
    );
  });

  it("a-1v0: `fn f(p: integer)` called `f()` is too few, expected 1, got 0", () => {
    const doc = parse(FM + "fn f(p: integer): integer { 1 }\nlet r = f()\nr\n");
    expectOneArity(
      doc,
      TOO_FEW,
      "f",
      1,
      0,
      "a-1v0 — the opposite arm at the same callee; a `fn` parameter carries no default, so one declared parameter is one REQUIRED argument",
    );
  });

  it("a-3v1: a three-parameter `fn` called `f(1)` is too few, expected 3, got 1", () => {
    const doc = parse(
      FM + "fn f(a: integer, b: integer, c: integer): integer { 1 }\nlet r = f(1)\nr\n",
    );
    expectOneArity(
      doc,
      TOO_FEW,
      "f",
      3,
      1,
      "a-3v1 — the counts are the callee's declared parameter count and the call's argument count, not a fixed pair",
    );
  });

  it("a-0v1: `fn f()` called `f(1)` is too many, expected 0, got 1", () => {
    const doc = parse(FM + "fn f(): integer { 1 }\nlet r = f(1)\nr\n");
    expectOneArity(
      doc,
      TOO_MANY,
      "f",
      0,
      1,
      "a-0v1 — the empty parameter list is a declared count of zero, not an absent contract",
    );
  });
});

// ===========================================================================
// (b) The controls. Green at HEAD and required to stay green: a fix that
//     refuses either of these over-reaches.
// ===========================================================================

describe("bug 0131 (b) — a correct-arity call stays silent in both directions", () => {
  it("b-1v1: `fn f(p: integer)` called `f(1)` draws nothing", () => {
    expectCodes(
      FM + "fn f(p: integer): integer { 1 }\nlet r = f(1)\nr\n",
      3,
      [],
      "b-1v1 — one declared parameter, one supplied argument: neither arm's predicate holds",
    );
  });

  it("b-0v0: `fn f()` called `f()` draws nothing", () => {
    expectCodes(
      FM + "fn f(): integer { 1 }\nlet r = f()\nr\n",
      3,
      [],
      "b-0v0 — the zero/zero cell, where an off-by-one in either arm's comparison would show",
    );
  });
});

// ===========================================================================
// (c) The syntactic positions. §(f) dispositions every one of them as JUDGED.
//     All RED at HEAD.
// ===========================================================================

describe("bug 0131 (c) — every syntactic position the call can occupy is judged", () => {
  it("c-stmt: an expression statement", () => {
    const doc = parse(FM + "fn f(p: integer): integer { 1 }\nf(1, 2, 3)\n");
    expectOneArity(
      doc,
      TOO_MANY,
      "f",
      1,
      3,
      "c-stmt — the call's value is discarded; the count is still wrong",
    );
  });

  it("c-ctor-field: a schema-constructor field value", () => {
    const doc = parse(
      FM +
        "schema S { a: integer }\nfn f(p: integer): integer { 1 }\nlet o = S { a: f(1, 2) }\no\n",
    );
    expectOneArity(
      doc,
      TOO_MANY,
      "f",
      1,
      2,
      "c-ctor-field — a position bug 0084's fix showed a statement-only walk misses",
    );
  });

  it("c-nested: a nested argument", () => {
    const doc = parse(
      FM +
        "fn f(p: integer): integer { 1 }\nfn g(p: integer): integer { 1 }\nlet r = f(g(1, 2))\nr\n",
    );
    expectOneArity(
      doc,
      TOO_MANY,
      "g",
      1,
      2,
      "c-nested — the outer call is correct-arity, so exactly one diagnostic is owed and it names the inner callee",
    );
  });

  it("c-fn-body: inside a `fn` body", () => {
    const doc = parse(
      FM +
        "fn g(p: integer): integer { 1 }\nfn f(p: integer): integer { g(1, 2) }\nlet r = f(1)\nr\n",
    );
    expectOneArity(
      doc,
      TOO_MANY,
      "g",
      1,
      2,
      "c-fn-body — a `fn` body is a block the walk must enter with the callee table still in scope",
    );
  });

  it("c-no-return-annot: the no-return-annotation declaration form", () => {
    // The form bug 0095's fix record measured as residual 4; it reproduces
    // byte-identically here. A missing return annotation is not a missing
    // parameter list.
    const doc = parse(FM + "fn f(p: integer) { 1 }\nf(1, 2, 3)\n");
    expectOneArity(
      doc,
      TOO_MANY,
      "f",
      1,
      3,
      "c-no-return-annot — the declared COUNT is readable whether or not a return type is written",
    );
  });

  it("c-unannotated-param: an unannotated parameter (`fn f(p)`)", () => {
    // The discriminating cell against 0050's channel: a count needs no operand
    // type, so the unresolvable-operand deferral the TYPE judgement takes
    // (docs/spec_topics/type-system.md §"Unresolvable operands") has no arity
    // analogue and must not be imported. §(f) dispositions this JUDGED.
    const doc = parse(FM + "fn f(p): integer { 1 }\nlet r = f(1, 2)\nr\n");
    expectOneArity(
      doc,
      TOO_MANY,
      "f",
      1,
      2,
      "c-unannotated-param — an unannotated parameter still occupies a parameter slot; the count is decidable where the type is not",
    );
  });

  it("c-self-recursive: the callee's own body calling itself", () => {
    const doc = parse(FM + "fn f(p: integer): integer { f(1, 2) }\nlet r = f(1)\nr\n");
    expectOneArity(
      doc,
      TOO_MANY,
      "f",
      1,
      2,
      "c-self-recursive — the declaration is trivially in scope inside its own body, and the outer correct-arity call must not be judged",
    );
  });

  it("c-subagent-fn: a `subagent fn` call", () => {
    // Arm (2) includes `subagent fn`: FN-6 binds parameters positionally "as for
    // `fn` and `invoke`" (docs/spec_topics/functions.md, FN-6), and §(b) covers
    // it explicitly. The runtime throw at this position precedes
    // `spawnSubagentSession`, so no child session is at stake either way.
    const doc = parse(FM + "subagent fn f(p: integer): integer { 1 }\nlet r = f(1, 2, 3)?\nr\n");
    expectOneArity(
      doc,
      TOO_MANY,
      "f",
      1,
      3,
      "c-subagent-fn — a `subagent fn` is identical to an ordinary `fn` in its parameter list and positional call form",
    );
  });

  it("c-par-for: inside a `par for` body — the cell that is silent at BOTH phases today", () => {
    // THE cell. This is the one position where the bug is silent at every
    // channel at HEAD: the parse seam counts nothing, and ERR-20's
    // iteration-boundary catch (`parForPanicError`,
    // `src/runtime/statement-executor.ts`) downgrades the runtime
    // `ThetaFnArityError` to that element's `Err(InvokeInfraError { cause:
    // "internal_error" })`, the theta's outcome stays `success`, no diagnostic
    // is emitted on any channel, and as an expression statement the array of
    // `Err`s is discarded outright. §(f) dispositions the cell JUDGED, and the
    // report's §Fix (f) names it "the first witness cell" for exactly this
    // reason: a fix hosted in a walk with no `par for` arm would leave the one
    // fully-silent position silent afterwards.
    const doc = parse(FM + "fn g(x: integer): integer { 1 }\npar for i in [1, 2] { g(1, 2) }\n");
    expectOneArity(
      doc,
      TOO_MANY,
      "g",
      1,
      2,
      "c-par-for — the only position where no channel reports the mistake today; the parse verdict is what closes it",
    );
  });

  it("c-plain-for: inside a plain `for` body", () => {
    const doc = parse(
      FM + 'fn g(x: integer): integer { 1 }\nfor i in [1] { g(1, 2) }\n"t"\n',
    );
    expectOneArity(
      doc,
      TOO_MANY,
      "g",
      1,
      2,
      "c-plain-for — the `par for` cell's contrast: the runtime does refuse here, and the parse seam must too",
    );
  });

  it("c-if-false: a statically unreachable call", () => {
    // theta 1.0 "defines no reachability predicate the type system consumes"
    // (docs/spec_topics/functions.md, FN-3), so the call is judged where the
    // runtime never reaches it. §(f) dispositions this JUDGED, and records that
    // this is not a reachability rule.
    const doc = parse(FM + "fn f(p: integer): integer { 1 }\nif false { f(1, 2, 3) }\n7\n");
    expectOneArity(
      doc,
      TOO_MANY,
      "f",
      1,
      3,
      "c-if-false — no reachability predicate excludes it; the count is judged from the source text",
    );
  });
});

// ===========================================================================
// (d) A declaration is not a call site. Green at HEAD, required to stay green.
// ===========================================================================

describe("bug 0131 (d) — a `fn` declared and never called stays silent", () => {
  it("d-never-called: the declaration alone draws nothing", () => {
    expectCodes(
      FM + "fn f(p: integer): integer { 1 }\n7\n",
      2,
      [],
      "d-never-called — the count rule is about call sites; a fix that judged declarations would red here",
    );
  });
});

// ===========================================================================
// (e) Arm (3) — the imported `.thetalib` symbol. CLOSED at the load pass (bug
//     0138 §Fix Route 2); the PARSE tier this file exercises stays silent by
//     design, not by an open deferral.
// ===========================================================================

describe("bug 0131 (e) — the imported-`.thetalib` arm is judged at the load pass, not at parse", () => {
  it("e-imported-arm3: an imported symbol called with the wrong count draws NOTHING AT PARSE", () => {
    // §(b): arm (2) is the PARSE tier's whole reach. Arm (3) is served, but at
    // the load pass: bug 0138 §Fix Route 2 wired `checkImportedFnCallArgs`
    // (src/extension/invoke-static-checks.ts) into `checkThetaImports`
    // (src/extension/import-static-checks.ts), where the resolved library
    // already exists as a parsed document and the mis-arity call this fixture
    // spells DOES draw `theta/parse/fn-arity-too-many` there — see
    // tests/imported-thetalib-fn-call-args-checked.test.ts cell c2. Naming the
    // route in the registry *Trigger* without dropping it silently is the
    // discipline bug 0071 named; this cell is the parse-tier half of that
    // discipline, not a record of an open gap.
    //
    // The reason THIS tier stays silent is mechanical and permanent, not a
    // stand-in for future work: a single-file parse carries no imported `fn`'s
    // parameter list, and `checkFnCallArgs`
    // (`src/parser/type-layer-checks.ts`) still returns early on
    // `importedSymbols.has(...)` for exactly that reason at the argument-TYPE
    // route, unchanged by bug 0138's fix. The cross-file signature is read at
    // compose instead, where the resolved library is already in hand — never
    // inside this single-file parse.
    const doc = expectCodes(
      FM + 'import { helper } from "./x.thetalib"\nlet r = helper(1, 2, 3)\nr\n',
      3,
      [],
      "e-imported-arm3 — arm (3) is out of the PARSE tier's reach by §(b); the load pass is where bug 0138 serves it (tests/imported-thetalib-fn-call-args-checked.test.ts)",
    );
    expectNoArityCode(
      doc,
      "e-imported-arm3 — neither minted code may reach an imported callee at the PARSE tier; the load pass draws them instead",
    );
  });
});

// ===========================================================================
// (f) The §(c) withhold — a junk parameter table carries a count the author
//     never wrote. Green at HEAD; it is the cell that keeps
//     tests/fn-param-not-identifier.test.ts A7 byte-exact.
// ===========================================================================

describe("bug 0131 (f) — a junk parameter table withholds the arity verdict", () => {
  it("f-junk-param-table: `fn h(a: string,` / `x = 1` / `) { 1 }` draws bug 0225's row alone", () => {
    // The parameter list absorbs the following statement, so the recorded
    // parameter count is a recovery artefact rather than an authored contract.
    // §(c) withholds the arity verdict on it — the same discipline the registry
    // states for a refused parameter ANNOTATION being absent from the callee's
    // parameter table — so `theta/parse/fn-param-not-identifier` fires alone.
    const doc = expectCodes(
      FM + 'fn h(a: string,\nx = 1\n) { 1 }\nlet z = h("q")\nz\n',
      3,
      [PARAM_NOT_IDENT],
      "f-junk-param-table — the refusal owns this source; an arity row beside it would report a count the author never wrote",
    );
    expect(
      locatedHits(doc, PARAM_NOT_IDENT),
      `f-junk-param-table — bug 0225's refusal must stay byte-exact through this fix (DIAG-4 Message, its own range).\n  ACTUAL: ${render(doc)}`,
    ).toEqual([
      `error ${msg(PARAM_NOT_IDENT, [], "bug 0225's landed row, which cell f1 keeps byte-exact")} @5:3-5:4`,
    ]);
    expectNoArityCode(
      doc,
      "f-junk-param-table — the §(c) withhold: no arity row on a parameter table no `Ident` derives",
    );
  });
});

// ===========================================================================
// (g) Arity before type. RED at HEAD in BOTH halves: the arity row is absent
//     and the type row fires where §(c) puts an early `return` above it.
// ===========================================================================

describe("bug 0131 (g) — arity is decided before per-argument type", () => {
  it("g-arity-before-type: a call both mis-arity and mis-typed draws the arity row alone", () => {
    // docs/spec_topics/invocation.md §"Argument arity": "Arity is checked
    // **before** per-argument type checking, so an arity error is reported as
    // such rather than as a confusing per-argument type error on the first extra
    // slot." §(c) satisfies it structurally — the arity diagnostics are pushed
    // and `checkFnCallArgs` returns BEFORE the per-argument loop, the same
    // `if (arityDiags.length > 0) return arityDiags;` order `checkInvokeCall`
    // uses — and §(d) records that 0050 landing in the same function is what
    // makes the suppression a `return` rather than a cross-pass channel.
    //
    // At this HEAD the fixture draws `theta/parse/fn-arg-type-mismatch` at
    // argument 0 and no arity row: the exact inversion the sentence forbids.
    const doc = parse(FM + 'fn f(p: integer): integer { 1 }\nlet r = f("s", "t")\nr\n');
    expectOneArity(
      doc,
      TOO_MANY,
      "f",
      1,
      2,
      "g-arity-before-type — one diagnostic, the arity arm, and no per-slot type verdict beside it",
    );
    expect(
      locatedHits(doc, FN_ARG_TYPE),
      `g-arity-before-type — 0050's row must be SUPPRESSED on a mis-arity call: the per-argument loop runs below the arity \`return\`.\n  ACTUAL: ${render(doc)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (h) The excluded callee kinds. Each keeps its own owning diagnostic and
//     neither minted code may appear at any of them.
//
//     SEAM NOTE, measured at this HEAD: the `invoke(...)` and `.theta`-callable
//     ARITY verdicts are NOT parse-seam emissions — they are produced by
//     `checkInvokeStaticResolution` (`src/extension/invoke-static-checks.ts`) in
//     the compose pass, which `parseDoc` does not run, so both h1 and h2 draw
//     `[]` here rather than a `theta/parse/invoke-arity-*` row. Those two
//     emissions are owned and asserted by 0071's witness,
//     tests/theta-callable-call-arity.test.ts, over the real composition; what
//     this file scores at those callees is the claim that belongs to it — the two
//     minted codes stay away from them.
// ===========================================================================

describe("bug 0131 (h) — the excluded callee kinds draw no `fn` arity code", () => {
  it("h-invoke: an `invoke(...)` mis-arity keeps its own surface", () => {
    const doc = expectCodes(
      FM + 'invoke("./child.theta", 1, 2)\n"t"\n',
      2,
      [],
      "h-invoke — the `invoke` arity judgement is the compose pass's (`checkInvokeStaticResolution`), and the parse seam draws nothing for it at this HEAD",
    );
    expectNoArityCode(
      doc,
      "h-invoke — `invoke(...)` is resolution arm (4)'s neighbour, not a `fn` callee; the minted rows must not reach it",
    );
  });

  it("h-theta-callable: a `.theta`-callable mis-arity keeps its own surface", () => {
    const doc = expectCodes(
      FM_CALLABLE + "let r = child(1, 2)\nr\n",
      2,
      [],
      "h-theta-callable — resolution arm (4), whose arity is bug 0071's landed compose-pass check and not a parse-seam emission",
    );
    expectNoArityCode(
      doc,
      "h-theta-callable — a `.theta` callee is a separate file with its own `params:`; the minted rows are scoped to a `fn`'s parameter list",
    );
  });

  it("h-pi-tool: a Pi-tool call keeps `tool-arg-arity`", () => {
    const doc = expectCodes(
      FM_PI_TOOL + 'read({ path: "a" }, { path: "b" })?\n"t"\n',
      2,
      [TOOL_ARG_ARITY],
      "h-pi-tool — bug 0072's count row owns a Pi-tool call site; a Pi-tool call takes a single object argument and is unaffected by the `fn` rule",
    );
    expect(
      locatedHits(doc, TOOL_ARG_ARITY),
      `h-pi-tool — 0072's row must stay byte-exact (DIAG-4 Message, its own range).\n  ACTUAL: ${render(doc)}`,
    ).toEqual([
      `error ${msg(
        TOOL_ARG_ARITY,
        [
          ["<name>", "read"],
          ["<count>", "2"],
        ],
        "bug 0072's landed Pi-tool count row, which cell h3 keeps byte-exact",
      )} @6:1-6:35`,
    ]);
    expectNoArityCode(
      doc,
      "h-pi-tool — the Pi-tool arm is gated on `resolvesToPiTool` and excludes a `fn` callee by construction; the minted rows must not double the verdict",
    );
  });

  it("h-unknown-ident: an unresolvable callee keeps `unknown-identifier`", () => {
    const doc = expectCodes(
      FM + "let r = q(1, 2, 3)\nr\n",
      2,
      [UNKNOWN_IDENT],
      "h-unknown-ident — callee resolution is enforced already, so the silence this bug measures is confined to the argument count",
    );
    expect(
      locatedHits(doc, UNKNOWN_IDENT),
      `h-unknown-ident — the resolution row must stay byte-exact (DIAG-4 Message, its own range).\n  ACTUAL: ${render(doc)}`,
    ).toEqual([
      `error ${msg(UNKNOWN_IDENT, [["<name>", "q"]], "the landed callee-resolution row cell h4 keeps byte-exact")} @4:9-4:19`,
    ]);
    expectNoArityCode(
      doc,
      "h-unknown-ident — no declaration is in scope, so there is no declared count to judge against",
    );
  });
});

// ===========================================================================
// (i) The tracked corpus. Re-derived at this HEAD from
//     `git ls-files '*.theta' '*.thetalib'` (34 files): four `fn`
//     declarations —
//       docs/examples/personas.thetalib          `rate_strictness(a: Author)`
//       docs/examples/ralph-inline.theta         `subagent fn step(objective: string)`
//       docs/examples/refine-inline.theta        `subagent fn reviewer(draft: string)`
//       tests/live/acceptance/fixtures/acc-lib.thetalib  `tagline()`
//     and four `fn` call sites, every one correct-arity. The other two
//     `<name>(args)` sites in the corpus — `docs/examples/refine.theta`'s
//     `reviewer(draft)` and `docs/examples/ralph.theta`'s
//     `ralph_step(objective)` — are `.theta`-callable calls (bug 0071's
//     surface), outside this report and outside this group.
//
//     Each cell asserts the (declared, provided) pair it measures rather than a
//     bare absence, so a corpus edit that made a site mis-arity would red here
//     instead of quietly turning the non-mover claim vacuous.
// ===========================================================================

/** The declared parameter count of top-level `fn <name>` in `path`. Fails loudly if absent. */
function declaredParamCount(path: string, name: string): number {
  const doc = parseDoc(readFileSync(path, "utf8"), path);
  const decls = doc.body.statements.filter(
    (s: Stmt): s is Extract<Stmt, { kind: "fn" }> => s.kind === "fn" && s.name === name,
  );
  expect(
    decls,
    `PRECONDITION: ${path} must declare exactly one top-level \`fn ${name}\`; the parse found ${decls.length}. A corpus move must red here, not silently void the non-mover claim.`,
  ).toHaveLength(1);
  return decls[0]!.params.length;
}

/** The sole call of `name` in `path`: its provided argument count. Fails loudly if absent. */
function providedArgCount(doc: ThetaDocument, path: string, name: string): number {
  const hits = collectCalls(doc).filter((c) => c.callee === name);
  expect(
    hits,
    `PRECONDITION: ${path} must hold exactly one call \`${name}(…)\`; the walk found ${hits.length}. All calls: ${JSON.stringify(
      collectCalls(doc).map((c) => `${c.callee}/${c.argCount}`),
    )}`,
  ).toHaveLength(1);
  return hits[0]!.argCount;
}

const CORPUS: ReadonlyArray<{
  readonly cell: string;
  readonly file: string;
  readonly callee: string;
  readonly declaredIn: string;
  readonly arm: string;
}> = [
  {
    cell: "i-corpus-import-thetalib",
    file: "docs/examples/import-thetalib.theta",
    callee: "rate_strictness",
    declaredIn: "docs/examples/personas.thetalib",
    arm: "arm (3), the imported route — judged at the load pass under bug 0138, not at this PARSE-tier probe",
  },
  {
    cell: "i-corpus-ralph-inline",
    file: "docs/examples/ralph-inline.theta",
    callee: "step",
    declaredIn: "docs/examples/ralph-inline.theta",
    arm: "arm (2), a same-file `subagent fn`",
  },
  {
    cell: "i-corpus-refine-inline",
    file: "docs/examples/refine-inline.theta",
    callee: "reviewer",
    declaredIn: "docs/examples/refine-inline.theta",
    arm: "arm (2), a same-file `subagent fn`",
  },
  {
    cell: "i-corpus-acc-imports-invoke",
    file: "tests/live/acceptance/fixtures/acc-imports-invoke.theta",
    callee: "tagline",
    declaredIn: "tests/live/acceptance/fixtures/acc-lib.thetalib",
    arm: "arm (3), the imported route — judged at the load pass under bug 0138, not at this PARSE-tier probe",
  },
];

describe("bug 0131 (i) — the four tracked-corpus `fn` call sites are non-movers", () => {
  for (const c of CORPUS) {
    it(`${c.cell}: ${c.file} — \`${c.callee}(…)\` is correct-arity and draws neither minted code`, () => {
      const declared = declaredParamCount(c.declaredIn, c.callee);
      const doc = parseDoc(readFileSync(c.file, "utf8"), c.file);
      const provided = providedArgCount(doc, c.file, c.callee);
      expect(
        provided,
        `${c.cell} — the call site must stay correct-arity (${c.arm}): declared ${declared} in ${c.declaredIn}, provided ${provided} in ${c.file}. GOV-15's blast radius for this fix rests on this equality.`,
      ).toBe(declared);
      expectNoArityCode(
        doc,
        `${c.cell} — a correct-arity shipped file must keep loading clean through this fix (GOV-15's loads-cleanly predicate)`,
      );
    });
  }
});
