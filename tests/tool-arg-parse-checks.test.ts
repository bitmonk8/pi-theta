import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type {
  CallableSetSnapshot,
  ResolvedCallable,
} from "../src/parser/callable-set";
import {
  buildInvokeGraph,
  checkInvokeStaticResolution,
} from "../src/extension/invoke-static-checks";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type Expr,
  type ParseThetaDocumentDeps,
  type Stmt,
  type ThetaDocument,
} from "../src/parser/theta-document";

// Bug 0072 — the PARSE half: `theta/parse/tool-arg-arity` has no `src/` caller,
// so a multi-argument Pi-tool call is judged by the `theta/parse/bare-object-literal`
// carve-out instead (docs/bugs/0072-tool-arg-checks-dead-and-no-runtime-net.md
// §Summary consequence 1).
//
// Spec: `docs/spec_topics/tool-calls.md` §"Argument shape" — "A multi-argument
// form (`read({...}, {...})`) is `theta/parse/tool-arg-arity` regardless of the
// argument shapes". The registry row (`theta/parse/tool-arg-arity`,
// `docs/spec_topics/diagnostics/code-registry-parse.md`) names the same example
// verbatim as its Trigger. `docs/spec_topics/expressions.md` §"Object
// construction" carve-out 2 scopes the bare-object exception to a Pi-tool
// callee, and "under a Pi-tool callee, it covers every *direct* argument
// position rather than a sole one: a multi-argument form (`read({...}, {...})`)
// is rejected as `theta/parse/tool-arg-arity` for its argument list … and draws
// no `theta/parse/bare-object-literal` at any of those positions" — with a bare
// object nested INSIDE an argument outside the carve-out, keeping its own
// diagnostic. Bug 0072 §Fix (parse half, option 1) is what wires that.
//
// PINNED POST-FIX CONTRACT (bug 0072 §Fix, parse half; RED at HEAD for the B
// cells):
//   (a) a Pi-tool call with `> 1` positional arguments draws exactly ONE
//       `theta/parse/tool-arg-arity`, ranged on the CALL node (the mistake is
//       the argument LIST and the repair — "merge the arguments" — is at the
//       call), and NEITHER `theta/parse/bare-object-literal` nor
//       `theta/parse/tool-arg-not-object-literal` at any direct argument
//       position;
//   (b) arity (`> 1`) and the shape rule (`=== 1`) are disjoint by
//       construction, so `read("a", "b")` draws arity ALONE. This supersedes
//       bug 0003's §Fix record (`docs/bugs/0003-tool-arg-shape-rule-not-enforced.md`)
//       of "a multi-argument call whose first argument is non-object fires the
//       shape code alone", on the authority of the tool-calls.md sentence quoted
//       above ("regardless of the argument shapes");
//   (c) the emission MOVES between the structural and the lexical walk and
//       nothing else changes: every non-Pi-tool callee keeps its
//       `bare-object-literal` diagnostics at their exact ranges (C cells), and
//       a bare object NESTED inside an argument is a distinct violation at a
//       distinct range that is deliberately NOT suppressed (cell B5).
//
// The C cells are green at HEAD and must stay green: they are the preserved
// observables the carve-out's re-scoping must not disturb (bug 0016's
// shadowed-callee set, bug 0003's single-argument shape rule, the ordinary
// bare-object rejection). Cell C10 is the one exception and is marked as such:
// it pins a TIGHTENING inside a `par for` body that the same carve-out change
// produces.
//
// Every expected Message string is sourced from the sharded diagnostics registry
// per DIAG-4 (`docs/spec_topics/diagnostics/diagnostic-shape.md#diag-4`: "Tests
// asserting a diagnostic's rendered message MUST source the string from this
// column rather than copy-pasting prose from the spec rule's home page") —
// never copied prose. See the A cells.
//
// Every pinned SourceRange was probed against the real parse at HEAD
// (`f8364db1`, v0.64.0) and is additionally re-derived from the AST inside each
// cell (`callSiteRange`), so a layout drift fails loudly on the precondition
// instead of silently mis-pinning a diagnostic.
//
// The D cells at the foot of the file are the one group that does not come out of
// `parseThetaDocument`: they drive `checkInvokeStaticResolution`
// (`src/extension/invoke-static-checks.ts`) over a SYNTHETIC callable-set
// snapshot, because the input-schema shape they pin — a JSON-Schema `type` ARRAY
// on a field — is carried by no tool the production load path can resolve.

// --- Registry-sourced Message templates (DIAG-4) ---------------------------

/** The live sharded registry page this file's three codes are registered on. */
const REGISTRY_TEXT = readFileSync(
  fileURLToPath(
    new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
  ),
  "utf8",
);

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

const ARITY_CODE = "theta/parse/tool-arg-arity";
const BARE_OBJECT_CODE = "theta/parse/bare-object-literal";
const SHAPE_CODE = "theta/parse/tool-arg-not-object-literal";
const SHADOW_CODE = "theta/parse/shadowed-callable-call";

/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
function expectedMessage(code: string, subs: Readonly<Record<string, string>>): string {
  let message = registryMessage(REGISTRY, code) as string;
  expect(
    message,
    `${code}: the diagnostics registry carries no Message for this code — the ` +
      "row was renamed or removed and this file's DIAG-4 sourcing is stale",
  ).toBeTypeOf("string");
  for (const [placeholder, value] of Object.entries(subs)) {
    message = message.replaceAll(placeholder, value);
  }
  expect(
    message,
    `${code}: an unsubstituted <…> placeholder remains — the registry row's ` +
      "Message template changed shape and this file's substitutions are stale",
  ).not.toMatch(/<[a-z]+>/);
  return message;
}

/** `Pi tool '<name>' takes a single object argument; got <count>`. */
function arityMessage(toolName: string, count: number): string {
  return expectedMessage(ARITY_CODE, { "<name>": toolName, "<count>": String(count) });
}

/** The `theta/parse/bare-object-literal` Message (no placeholders). */
const BARE_OBJECT_MESSAGE = expectedMessage(BARE_OBJECT_CODE, {});

/** `Pi tool '<name>' argument must be written inline as a bare object literal …`. */
function shapeMessage(toolName: string): string {
  return expectedMessage(SHAPE_CODE, { "<name>": toolName });
}

// --- Parse harness (the tests/shadowed-callable-call.test.ts makeDeps pattern) --

const FILE = "bug0072.theta";

/** The frontmatter prelude declaring the Pi tool `read` — occupies lines 1–5. */
const FM = "---\nmode: prompt\ntools:\n  - read\n---\n";

function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parseSource(src: string): ThetaDocument {
  const source: ThetaSource = { path: FILE, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

function withCode(diags: readonly Diagnostic[], code: string): Diagnostic[] {
  return diags.filter((d) => d.code === code);
}

/** A rendered `code @line:col-line:col` list — the failure-message payload. A
 * location-less diagnostic (`range` is optional on `Diagnostic`) renders as
 * `code @-`, so an unlocated emission is visible rather than crashing the
 * renderer. */
function render(diags: readonly Diagnostic[]): string {
  return JSON.stringify(
    diags.map((d) => {
      const r = d.range;
      return r === undefined
        ? `${d.code} @-`
        : `${d.code} @${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    }),
  );
}

/** A 1-indexed, end-exclusive-column source range literal. */
function range(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): SourceRange {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  };
}

/**
 * Collect every `CallExpr` node of `doc` in source order. The arity diagnostic's
 * range is the CALL node, which no source-column arithmetic in a
 * comment can be trusted to reproduce, so each cell re-derives it here and
 * cross-checks it against its pinned literal.
 */
function callNodes(doc: ThetaDocument): { callee: string; range: SourceRange }[] {
  const out: { callee: string; range: SourceRange }[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        out.push({ callee: e.callee, range: e.range });
        for (const a of e.args) walkExpr(a);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "invoke":
        for (const a of e.args) walkExpr(a);
        return;
      case "array":
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "method-call":
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
        return;
      case "par-for":
        // control-flow.md CTRL-4 admits calls in a `par for` body, its `max`
        // operand and its iterand; cells C10/C11 sit in the body, so this arm
        // is what lets their loud precondition see the call node at all.
        walkExpr(e.iterand);
        if (e.max !== null) walkExpr(e.max);
        for (const inner of e.body.statements) walkStmt(inner);
        if (e.body.tail !== null) walkExpr(e.body.tail);
        return;
      default:
        return;
    }
  };
  const walkStmt = (s: Stmt): void => {
    switch (s.kind) {
      case "expr":
        walkExpr(s.expr);
        return;
      case "tool-call":
        walkExpr(s.call);
        return;
      case "invoke":
        walkExpr(s.invoke);
        return;
      case "let":
        if (s.init !== null) walkExpr(s.init);
        return;
      case "fn":
        for (const inner of s.body.statements) walkStmt(inner);
        if (s.body.tail !== null) walkExpr(s.body.tail);
        return;
      default:
        return;
    }
  };
  const body = doc.body;
  expect(
    body,
    "PRECONDITION: the cell's source produced no parsed body, so its diagnostic " +
      `set is about a parse failure rather than the call site. Diagnostics: ${render(doc.diagnostics)}`,
  ).not.toBeNull();
  for (const s of body!.statements) walkStmt(s);
  if (body!.tail !== null) walkExpr(body!.tail);
  return out;
}

/**
 * Parse `src`, assert it holds exactly one call of `callee` at `expected`, and
 * return its diagnostics. The call-node cross-check is the loud precondition:
 * without it a drifted fixture layout would let a "zero diagnostics of code X"
 * assertion pass vacuously.
 */
function cell(
  src: string,
  callee: string,
  expected: SourceRange,
): readonly Diagnostic[] {
  const doc = parseSource(src);
  const calls = callNodes(doc).filter((c) => c.callee === callee);
  expect(
    calls,
    `PRECONDITION: the fixture must hold exactly one call of '${callee}'; the ` +
      `parse found ${calls.length}. Diagnostics: ${render(doc.diagnostics)}`,
  ).toHaveLength(1);
  expect(
    calls[0]!.range,
    `PRECONDITION: the pinned call-node range for '${callee}' drifted from the ` +
      "parse — re-probe the fixture before reading the assertions below",
  ).toEqual(expected);
  return doc.diagnostics;
}

/**
 * The multi-argument Pi-tool call draws exactly one
 * `theta/parse/tool-arg-arity` — registered message, error severity, ranged on
 * the CALL node — and no shape code. The bare-object count is asserted by the
 * caller because a NESTED bare object keeps its own diagnostic (cell B5).
 */
function expectArity(
  diags: readonly Diagnostic[],
  toolName: string,
  count: number,
  callRange: SourceRange,
): void {
  const arity = withCode(diags, ARITY_CODE);
  expect(
    arity,
    `PRIMARY (bug 0072 §Summary consequence 1): a ${count}-argument Pi-tool call must draw exactly one ` +
      `${ARITY_CODE}; checkToolCallArguments has no src/ caller, so the parser judges the ` +
      `call by the bare-object carve-out instead. Diagnostics: ${render(diags)}`,
  ).toHaveLength(1);
  const d = arity[0]!;
  expect(d.severity, "the registered severity is error").toBe("error");
  expect(d.file).toBe(FILE);
  expect(d.message, "the exact registered Message with <name> and <count> substituted").toBe(
    arityMessage(toolName, count),
  );
  expect(
    d.range,
    "the range is the CALL node — the mistake is the argument LIST and the " +
      "registry row's repair (merge the arguments) is at the call, not at one argument",
  ).toEqual(callRange);
  expect(
    withCode(diags, SHAPE_CODE),
    `arity (> 1 arguments) and the shape rule (=== 1 argument) are disjoint by ` +
      `construction, so ${SHAPE_CODE} must not co-fire. Diagnostics: ${render(diags)}`,
  ).toEqual([]);
}

/**
 * Assert the `theta/parse/bare-object-literal` set: one diagnostic per expected
 * range, in source order, each byte-identical to the registered Message.
 */
function expectBareObjects(
  diags: readonly Diagnostic[],
  expectedRanges: readonly SourceRange[],
  why: string,
): void {
  const bare = withCode(diags, BARE_OBJECT_CODE);
  expect(bare, `${why}. Diagnostics: ${render(diags)}`).toHaveLength(expectedRanges.length);
  bare.forEach((d, i) => {
    expect(d.severity, "the registered severity is error").toBe("error");
    expect(d.message, "byte-identical to the registered Message (DIAG-4)").toBe(
      BARE_OBJECT_MESSAGE,
    );
    expect(d.range, `bare-object-literal #${i} range`).toEqual(expectedRanges[i]!);
  });
}

// ===========================================================================
// A — DIAG-4: the expected strings come from the registry, not from prose.
// ===========================================================================

describe("bug 0072 A — the three Message templates are read from the diagnostics registry", () => {
  it("A1: `theta/parse/tool-arg-arity` renders its registered Message with <name> and <count> substituted", () => {
    expect(REGISTRY.some((r) => r.code === ARITY_CODE), `${ARITY_CODE} has no registry row`).toBe(
      true,
    );
    // The row's Trigger names `read({...}, {...})` verbatim; the Message carries
    // exactly the two placeholders this file substitutes.
    const message = arityMessage("read", 2);
    expect(message).toContain("read");
    expect(message).toContain("2");
    expect(message, "the arity Message is about a single object argument").toMatch(
      /single object argument/,
    );
  });

  it("A2: `theta/parse/bare-object-literal` renders its registered Message (no placeholders)", () => {
    expect(
      REGISTRY.some((r) => r.code === BARE_OBJECT_CODE),
      `${BARE_OBJECT_CODE} has no registry row`,
    ).toBe(true);
    expect(BARE_OBJECT_MESSAGE, "the carve-out's remedy is naming the schema").toMatch(
      /name the schema/,
    );
  });

  it("A3: `theta/parse/tool-arg-not-object-literal` renders its registered Message with <name> substituted", () => {
    expect(REGISTRY.some((r) => r.code === SHAPE_CODE), `${SHAPE_CODE} has no registry row`).toBe(
      true,
    );
    expect(shapeMessage("read")).toContain("read");
  });
});

// ===========================================================================
// B — RED at HEAD: the arity code fires and the per-argument bare-object
// diagnostics stand down (bug 0072 §Fix, parse half).
// ===========================================================================

describe("bug 0072 B — a multi-argument Pi-tool call draws theta/parse/tool-arg-arity alone", () => {
  it("B1: `read({ path: \"a\" }, { path: \"b\" })` draws one tool-arg-arity at the call range and ZERO bare-object-literal", () => {
    // HEAD (probed): two `bare-object-literal` diagnostics, at 6:6-6:19 and
    // 6:21-6:34 — one per argument — and no arity code. That is the bug doc's
    // §Reproduction `multiarg` cell: right severity, wrong code, wrong count,
    // and a message telling the author to name a schema, which is a repair that
    // does not apply — naming the schema on both arguments leaves the arity
    // violation untouched.
    const src = FM + 'read({ path: "a" }, { path: "b" })?\n"t"';
    const diags = cell(src, "read", range(6, 1, 6, 35));
    expectArity(diags, "read", 2, range(6, 1, 6, 35));
    expectBareObjects(
      diags,
      [],
      "the lexical walk owns EVERY direct argument position of a Pi-tool " +
        "call, so a rejected multi-argument call draws the arity code alone rather than " +
        "one bare-object-literal per argument",
    );
  });

  it('B2: `read({ path: "a" }, "b")` draws the arity code alone — the shapes of the arguments are irrelevant', () => {
    // HEAD (probed): one `bare-object-literal` at 6:6-6:19 (the object argument)
    // and nothing for the string argument — the bug doc's `multiarg2` cell.
    const src = FM + 'read({ path: "a" }, "b")?\n"t"';
    const diags = cell(src, "read", range(6, 1, 6, 25));
    expectArity(diags, "read", 2, range(6, 1, 6, 25));
    expectBareObjects(
      diags,
      [],
      "the object argument of a multi-argument Pi-tool call is inside the arity " +
        "violation, not a bare-object violation of its own",
    );
  });

  it('B3: `read("a", "b")` draws the arity code alone, NOT the single-argument shape code', () => {
    // HEAD (probed): `tool-arg-not-object-literal` at 6:6-6:9 (the first
    // argument) and no arity code. Bug 0072's arity/shape partition supersedes
    // bug 0003's recorded "a multi-argument call whose first argument is
    // non-object fires the shape code alone" on the authority of tool-calls.md
    // §"Argument shape" — arity fires "regardless of the argument shapes".
    // This cell is the pin for that supersession, in both directions: arity
    // present, shape absent.
    const src = FM + 'read("a", "b")?\n"t"';
    const diags = cell(src, "read", range(6, 1, 6, 15));
    expectArity(diags, "read", 2, range(6, 1, 6, 15));
    expectBareObjects(diags, [], "no object literal is written at this call site");
  });

  it("B4: a THREE-argument Pi-tool call renders `got 3` — <count> is the written positional count", () => {
    // HEAD (probed): three `bare-object-literal` diagnostics (6:6, 6:21, 6:36).
    const src = FM + 'read({ path: "a" }, { path: "b" }, { path: "c" })?\n"t"';
    const diags = cell(src, "read", range(6, 1, 6, 50));
    expectArity(diags, "read", 3, range(6, 1, 6, 50));
    expectBareObjects(diags, [], "all three direct argument positions stand down");
  });

  it("B5: a bare object NESTED in an array argument keeps its own bare-object-literal ALONGSIDE the arity code", () => {
    // expressions.md §"Object construction" carve-out 2 scopes the exception to
    // DIRECT argument positions; a nested position is a distinct violation at a
    // distinct range.
    // HEAD (probed): two `bare-object-literal` diagnostics — 6:6-6:19 (the
    // direct argument, which must stand down) and 6:22-6:35 (the array element,
    // which must survive) — and no arity code.
    const src = FM + 'read({ path: "a" }, [{ path: "b" }])?\n"t"';
    const diags = cell(src, "read", range(6, 1, 6, 37));
    expectArity(diags, "read", 2, range(6, 1, 6, 37));
    expectBareObjects(
      diags,
      [range(6, 22, 6, 35)],
      "the array element's bare object is not a direct argument of the call, so it " +
        "keeps its own diagnostic at its own range while the direct argument's is " +
        "subsumed by the arity code",
    );
  });
});

// ===========================================================================
// C — GREEN at HEAD and after: the preserved observables the carve-out's
// re-scoping must not disturb (C10 excepted — see its own comment).
// ===========================================================================

describe("bug 0072 C — preserved bare-object / shape / shadowing observables", () => {
  it("C1: a sole bare-object argument under a NON-Pi-tool callee keeps its bare-object-literal at the argument range", () => {
    // expressions.md §"Object construction": the carve-out "applies only when
    // the callee is a Pi tool". `fn f` wins resolution arm 2, so the argument is
    // the ordinary bare-object rejection.
    const src = FM + "fn f(x: string) { x }\nf({ a: 1 })?\n\"t\"";
    const diags = cell(src, "f", range(7, 1, 7, 12));
    expectBareObjects(
      diags,
      [range(7, 3, 7, 11)],
      "a user-fn callee's sole bare-object argument keeps exactly one diagnostic at " +
        "the ARGUMENT range",
    );
    expect(withCode(diags, ARITY_CODE), "arity is a Pi-tool-callee rule only").toEqual([]);
  });

  it("C2: a TWO-argument non-Pi-tool call keeps bare-object-literal at BOTH argument ranges", () => {
    // The re-scoping moves the emission for a call's direct arguments from the
    // structural walk to the lexical walk; for a non-Pi-tool callee the lexical
    // walk must emit per direct bare-object argument, so this set and these
    // ranges are unchanged. `assembleDiagnostics` sorts by (file, line, column),
    // so the surfaced order is unchanged too.
    const src = FM + "fn f(x: string) { x }\nf({ a: 1 }, { b: 2 })?\n\"t\"";
    const diags = cell(src, "f", range(7, 1, 7, 22));
    expectBareObjects(
      diags,
      [range(7, 3, 7, 11), range(7, 13, 7, 21)],
      "both direct bare-object arguments of a non-Pi-tool call keep their own " +
        "diagnostic at their own range",
    );
    expect(withCode(diags, ARITY_CODE), "arity is a Pi-tool-callee rule only").toEqual([]);
  });

  it("C3: a locally shadowed `read` with two bare-object arguments keeps shadowed-callable-call + 2 x bare-object-literal", () => {
    // Bug 0016's observable, unchanged: a `let`-shadowed callee is not the Pi
    // tool (expressions.md §"Identifier resolution" arm 1 wins), so neither the
    // carve-out nor the arity rule applies to it.
    const src = FM + 'let read = "x"\nread({ path: "a" }, { path: "b" })?\n"t"';
    const diags = cell(src, "read", range(7, 1, 7, 35));
    const shadow = withCode(diags, SHADOW_CODE);
    expect(shadow, `bug 0016's rejection must still fire. Diagnostics: ${render(diags)}`).toHaveLength(
      1,
    );
    expect(shadow[0]!.range, "ranged on the call node").toEqual(range(7, 1, 7, 35));
    expectBareObjects(
      diags,
      [range(7, 6, 7, 19), range(7, 21, 7, 34)],
      "a shadowed callee is outside the Pi-tool carve-out at every argument position",
    );
    expect(
      withCode(diags, ARITY_CODE),
      "the arity rule is scoped to a callee that lexically IS an unshadowed Pi tool",
    ).toEqual([]);
  });

  it("C4: `read()` draws nothing — a zero-argument Pi-tool call lowers to `{}`", () => {
    const src = FM + 'read()?\n"t"';
    const diags = cell(src, "read", range(6, 1, 6, 7));
    expect(
      diags,
      `a zero-argument Pi-tool call is legal at parse. Diagnostics: ${render(diags)}`,
    ).toEqual([]);
  });

  it("C5: a sole non-object argument `read(a)` keeps bug 0003's shape code at the ARGUMENT range", () => {
    const src = FM + 'let a = "p"\nread(a)?\n"t"';
    const diags = cell(src, "read", range(7, 1, 7, 8));
    const shape = withCode(diags, SHAPE_CODE);
    expect(
      shape,
      `bug 0003's single-argument shape rule must be untouched. Diagnostics: ${render(diags)}`,
    ).toHaveLength(1);
    expect(shape[0]!.message, "the registered Message with <name> substituted").toBe(
      shapeMessage("read"),
    );
    expect(shape[0]!.range, "bug 0003 ranges the shape code on the ARGUMENT node").toEqual(
      range(7, 6, 7, 7),
    );
    expect(withCode(diags, ARITY_CODE), "one argument is not an arity violation").toEqual([]);
  });

  it("C6: a sole NAMED schema-constructor argument keeps bug 0003's shape code at the argument range", () => {
    const src = FM + 'schema S { path: string }\nread(S { path: "a" })?\n"t"';
    const diags = cell(src, "read", range(7, 1, 7, 22));
    const shape = withCode(diags, SHAPE_CODE);
    expect(shape, `Diagnostics: ${render(diags)}`).toHaveLength(1);
    expect(shape[0]!.range, "ranged on the constructor argument node").toEqual(range(7, 6, 7, 21));
    expect(withCode(diags, ARITY_CODE)).toEqual([]);
  });

  it("C7: a bare object nested INSIDE the sole legal argument keeps its own bare-object-literal", () => {
    // The carve-out covers the argument position itself, not every position
    // beneath it: a nested `{ … }` field value is the ordinary rejection.
    const src = FM + 'read({ path: "a", extra: { deep: 1 } })?\n"t"';
    const diags = cell(src, "read", range(6, 1, 6, 40));
    expectBareObjects(
      diags,
      [range(6, 26, 6, 37)],
      "the nested object keeps its diagnostic while the argument itself is carved out",
    );
    expect(withCode(diags, ARITY_CODE), "one argument is not an arity violation").toEqual([]);
  });

  it("C8: a bare object in an `invoke(...)` argument keeps its bare-object-literal — the re-scope is call-argument-scoped", () => {
    // Guards against an over-broad suppression: the carve-out covers the direct
    // arguments of a CALL node, and an `invoke(...)` argument is not one.
    // `invoke` takes already-typed values, so a bare object there stays the
    // ordinary rejection.
    const doc = parseSource(FM + 'invoke("./child.theta", { a: 1 })\n"t"');
    expectBareObjects(
      doc.diagnostics,
      [range(6, 25, 6, 33)],
      "an invoke argument is outside the Pi-tool call-argument carve-out",
    );
  });

  it("C9: the accepted single-argument form `read({ path: \"a\" })` still draws nothing", () => {
    const src = FM + 'read({ path: "a" })?\n"t"';
    const diags = cell(src, "read", range(6, 1, 6, 20));
    expect(
      diags,
      `the carved-out sole bare-object argument of a Pi tool is legal. Diagnostics: ${render(diags)}`,
    ).toEqual([]);
  });

  it("C10: a multi-argument NON-Pi-tool call inside a `par for` body draws one bare-object-literal PER direct bare-object argument", () => {
    // The one DELIBERATE TIGHTENING in this group, pinned so it is not
    // accidental. At HEAD this form drew NOTHING: the structural walk
    // (`walkExpr`) has no `case "par-for"` arm, so no expression inside a
    // `par for` was reached structurally, and the lexical walk's own
    // bare-object arm was scoped to a one-argument call. The lexical walk DOES
    // traverse `par for` (bug 0071's arm), so scoping that arm to every direct
    // argument makes this call behave exactly as the same call at top level
    // (cell C2's ranges, one AST level shallower). control-flow.md CTRL-4
    // admits calls in a `par for` body, and expressions.md §"Object
    // construction" carve-out 2 is position- and callee-scoped, not
    // depth-scoped, so top level and `par for` body must agree.
    //
    // The residual structural hole itself is NOT closed here: a bare object at
    // a NON-direct position inside a `par for` (e.g. inside an array argument)
    // is still unchecked, because the structural walk still has no `par-for`
    // arm. That is a separate rule with its own residual.
    const src = FM + 'fn f(x: string) { x }\npar for i in ["a"] { f({ a: 1 }, { b: 2 }) }\n"t"';
    const diags = cell(src, "f", range(7, 22, 7, 43));
    expectBareObjects(
      diags,
      [range(7, 24, 7, 32), range(7, 34, 7, 42)],
      "both direct bare-object arguments of a non-Pi-tool call inside a `par for` " +
        "body are rejected, exactly as at top level (cell C2)",
    );
    expect(
      withCode(diags, ARITY_CODE),
      "arity is a Pi-tool-callee rule only, at every depth",
    ).toEqual([]);
  });

  it("C11: a multi-argument PI-TOOL call inside a `par for` body draws the arity code alone", () => {
    // The Pi-tool sibling of C10: the same lexical walk carries the arity rule
    // into a `par for` body, so the body agrees with top level (cell B1) there
    // too.
    const src = FM + 'par for i in ["a"] { read({ path: "a" }, { path: "b" }) }\n"t"';
    const diags = cell(src, "read", range(6, 22, 6, 56));
    expectArity(diags, "read", 2, range(6, 22, 6, 56));
    expectBareObjects(
      diags,
      [],
      "the direct argument positions of a Pi-tool call stand down inside a `par for` " +
        "body as they do at top level",
    );
  });
});

// ===========================================================================
// D cells — `theta/parse/tool-arg-schema-conflict` against an input-schema field
// whose JSON-Schema `type` is an ARRAY (`{ "type": ["string", "null"] }`).
//
// `fieldSchemaType` (`src/extension/invoke-static-checks.ts`) renders that form
// as the union `string | null`, which is the spelling
// `subsetKinds` (`src/runtime/tool-call.ts`) splits back into the kind set
// `{string, null}` — the same treatment an author-written union annotation gets.
// No tool the production load path can resolve carries the shape (every host
// built-in declares a single-string `type`, and an extension tool named in
// `tools:` refuses to load in a no-dispatch-rung context with
// `theta/load/extension-tool-unreachable`), so these cells drive the compose-pass
// check directly over a synthetic snapshot.
//
// Both directions are pinned: an `integer` field value misses both arms and
// fires; a `null` field value hits the SECOND arm and stands down. The pair is
// what proves the array was split into its members — a rendering that dropped or
// mangled either arm would fail one of the two.
// ===========================================================================

/**
 * The synthetic Pi-tool callable-set entry the D cells resolve `read` against:
 * one field whose registered schema `type` is an array. `properties` carries a
 * `description` alongside, as every real host built-in's does, so the cells also
 * hold `fieldSchemaType`'s "a non-`type` annotation keyword is not a refinement"
 * behaviour.
 */
function typeArraySnapshot(): CallableSetSnapshot {
  return {
    entries: new Map<string, ResolvedCallable>([
      [
        "read",
        {
          kind: "pi-tool",
          toolDefinition: {
            toolName: "read",
            parameters: {
              type: "object",
              required: ["path"],
              properties: {
                path: { type: ["string", "null"], description: "the file to read" },
              },
            },
          },
        },
      ],
    ]),
  };
}

/**
 * Run the compose-pass static tool-argument checks over `src` with the
 * `type`-array snapshot bound. The `fs` / `resolveCalleeArity` seams are reached
 * only by the `invoke(...)` and `.theta`-callable arms, which these
 * Pi-tool-only sources have no site for; both fail loudly rather than answer if
 * a future change routes through them.
 */
async function composeCheck(src: string): Promise<readonly Diagnostic[]> {
  const doc = parseSource(src);
  const frontmatter = doc.frontmatter;
  expect(
    frontmatter,
    "precondition: the probed source carries the `FM` frontmatter prelude, so a " +
      "null frontmatter means the parse harness changed shape",
  ).not.toBeNull();
  if (frontmatter === null) {
    throw new Error("unmet precondition: probed source parsed with no frontmatter");
  }
  // The checked snapshot is the one on `deps` — this pass reads the caller's
  // callable set from there, not off the composition input.
  const input: ThetaCompositionInput = {
    slashName: "bug0072d",
    sourcePath: FILE,
    frontmatter,
    body: doc.body,
  };
  return await checkInvokeStaticResolution(input, {
    fs: {
      realpath: (): Promise<string> => {
        throw new Error(
          "unmet precondition: a D cell reached the invoke(...) containment seam; " +
            "these sources carry no invoke(...) site",
        );
      },
    },
    activeRoots: [],
    graph: buildInvokeGraph([]),
    resolveCalleeArity: (): Promise<undefined> => {
      throw new Error(
        "unmet precondition: a D cell reached the callee-arity seam; these " +
          "sources carry no `.theta`-callable call site",
      );
    },
    callableSet: typeArraySnapshot(),
  });
}

const SCHEMA_CONFLICT_CODE = "theta/parse/tool-arg-schema-conflict";

/** `Pi tool '<name>' argument field '<field>' type is provably disjoint …`. */
function schemaConflictMessage(
  toolName: string,
  field: string,
  expected: string,
  actual: string,
): string {
  return expectedMessage(SCHEMA_CONFLICT_CODE, {
    "<name>": toolName,
    "<field>": field,
    "<expected>": expected,
    "<actual>": actual,
  });
}

describe("bug 0072 — D: a JSON-Schema `type` ARRAY renders as a union of its members", () => {
  it("D1: an integer field value against `type: [\"string\", \"null\"]` fires, rendering `string | null`", async () => {
    const diags = await composeCheck(FM + 'read({ path: 123 })?\n"t"');
    expect(
      withCode(diags, SCHEMA_CONFLICT_CODE).map((d) => d.message),
      "the `type` array must reduce to the kind set {string, null}, which an " +
        "integer misses in both members; a rendering the subset cannot parse " +
        "would instead make the field unprovable and emit nothing. Diagnostics: " +
        render(diags),
    ).toEqual([schemaConflictMessage("read", "path", "string | null", "integer")]);
  });

  it("D2: a `null` field value against the same schema stands down — the SECOND arm is honoured", async () => {
    const diags = await composeCheck(FM + "read({ path: null })?\n\"t\"");
    expect(
      withCode(diags, SCHEMA_CONFLICT_CODE),
      "`null` intersects the schema field's second `type` member, so the value " +
        "is one the runtime AJV check accepts and the front-run must not fire. " +
        "Diagnostics: " + render(diags),
    ).toEqual([]);
  });
});
