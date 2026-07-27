import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaBody,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type {
  CallableSetSnapshot,
  ResolvedCallable,
} from "../src/parser/callable-set";
import { executeBody, type ExecuteBodyDeps } from "../src/runtime/statement-executor";
import type { Checkpoint } from "../src/seams/checkpoint";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import type { ThetaValue } from "../src/runtime/value";

// Bug 0016 — a call to a lexically shadowed Pi-tool name dispatches the tool at
// runtime; the object-literal form executes it silently
// (docs/bugs/0016-shadowed-tool-name-runtime-dispatch.md).
//
// Spec: expressions.md §Identifier resolution — a bare identifier in call
// position resolves "first match wins: 1. A local `let` binding or function
// parameter currently in scope. … 4. A name registered in the theta's callable
// set." and "Local bindings (1) shadow everything else lexically". At every
// shadowed cell below the callee denotes the LOCAL, not the tool. §Object
// construction — the bare-object carve-out "applies only when the callee is a
// Pi tool"; for a shadowed callee the sole bare `{ ... }` argument is
// `theta/parse/bare-object-literal`.
//
// The defect (HEAD, 0.21.0 — probed): parse emits ZERO diagnostics for every
// shadowed cell (the shape walk skips shadowed callees; the carve-out is
// callee-blind), and runtime call classification is callable-set-membership
// only (`checkpointFor` → `#classifyCall` → `#resolveToolCall`; the lexical
// environment's spec-conformant `resolve` is never consulted). Consequence:
//   - object-literal / zero-argument forms DISPATCH the tool silently
//     (P1/R1 with `{ path: "p" }`, P3/R3 likewise, P6/R6 with `{}`);
//   - every other argument form throws `PiToolArgShapeDefectError`
//     (→ `theta/runtime/internal-error`), misattributing a parse-clean authored
//     program as an internal defect (P2/R2).
//
// PINNED POST-FIX CONTRACT (bug doc §Options, Option 1 — RED now, GREEN after):
//   (a) parse — `parseThetaDocument` emits a NEW error diagnostic, code
//       `theta/parse/shadowed-callable-call`, exactly once per call site whose
//       callee is lexically shadowed by a local (`let`, fn parameter, `for` /
//       `par for` variable, `match` pattern binding, `params:` field) while
//       colliding with a callable-set name (Pi tool or `.theta` callable).
//       TIGHTENED post-fix (the 0003-file discipline): exact registered
//       message (code-registry-parse.md row, via `shadowMessage`) and the
//       range pinned to the CALL node (`CallExpr` carries no separate
//       callee-identifier span; the call node's start IS the callee).
//   (b) parse carve-out alignment — for a SHADOWED callee, the sole bare-object
//       argument is additionally `theta/parse/bare-object-literal` (§Object
//       construction: the carve-out is Pi-tool-callee-only).
//   (c) runtime belt-and-braces — a shadowed-callee call must NEVER dispatch
//       the tool, through BOTH executor dispatch sites: the plain `evalExpr`
//       call routing (no postfix `?`) and the `evalAsResult` operand path
//       (postfix `?` / `match` scrutinee). Post-fix these throw a runtime
//       defect instead of dispatching: `executeBody` rejects AND the recording
//       params array stays empty. For the crashing arm the rejection must NOT
//       be the bug-0003 `PiToolArgShapeDefectError` (the misattribution) —
//       TIGHTENED post-fix: it is the new `ShadowedCalleeDispatchDefectError`
//       (src/runtime/tool-call.ts), pinned by `.name`.
//
// This file is EXPECTED to fail at HEAD (plain `it`, test-first convention,
// bug-0015 precedent). Controls pin the current CORRECT behavior and must stay
// green before and after the fix.

// ===========================================================================
// Parse-layer harness (the tests/tool-arg-shape-enforcement.test.ts makeDeps
// pattern).
// ===========================================================================

const SHADOW_CODE = "theta/parse/shadowed-callable-call";
const BARE_OBJECT_CODE = "theta/parse/bare-object-literal";
const SHAPE_CODE = "theta/parse/tool-arg-not-object-literal";
const FILE = "bug0016.theta";

function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

function parseSource(src: string): ThetaDocument {
  const source: ThetaSource = { path: FILE, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

function diagsOf(src: string): readonly Diagnostic[] {
  return parseSource(src).diagnostics;
}

function withCode(diags: readonly Diagnostic[], code: string): Diagnostic[] {
  return diags.filter((d) => d.code === code);
}

/** The frontmatter prelude — occupies source lines 1–5. */
const FM = "---\nmode: prompt\ntools:\n  - read\n---\n";

/**
 * The exact registered message (code-registry-parse.md
 * `theta/parse/shadowed-callable-call` row) with `<name>` and `<binder>`
 * substituted — the DIAG-4 byte-identical discipline, the 0003 file's
 * `shapeMessage` precedent.
 */
function shadowMessage(name: string, binder: string): string {
  return `call of '${name}' resolves to the local ${binder} that shadows the callable-set entry '${name}'; locals are not callable`;
}

/**
 * The exact registered `theta/parse/bare-object-literal` message
 * (code-registry-parse.md row) — the lexical-walk emission (contract b) must
 * be byte-identical to the structural walk's registered message.
 */
const BARE_OBJECT_MESSAGE =
  "bare object literal not permitted in this position; name the schema (Schema { ... })";

/** A 1-indexed, end-exclusive-column source range literal (the 0003 file's helper). */
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
 * Assert the shadowed-callable rejection for one parse cell: exactly one
 * `theta/parse/shadowed-callable-call` — error severity, correct file, the
 * exact registered message (naming the collided callable, the shadowing
 * binder, and — where the binder construct carries a range — its line), and
 * the range pinned to the CALL node (probed from the AST; the call node's
 * start is the callee's first character).
 */
function expectShadowDiagnostic(
  diags: readonly Diagnostic[],
  toolName: string,
  binder: string,
  callRange: SourceRange,
): void {
  const shadow = withCode(diags, SHADOW_CODE);
  expect(
    shadow,
    `PRIMARY (bug 0016 contract a): parseThetaDocument must emit exactly one ${SHADOW_CODE} for a call whose callee is lexically shadowed while colliding with a callable-set name`,
  ).toHaveLength(1);
  const d = shadow[0]!;
  expect(d.severity, "the new code is an error").toBe("error");
  expect(d.file).toBe(FILE);
  expect(d.message, "the message names the collided tool").toContain(toolName);
  expect(d.message, "the message names the shadowing").toMatch(/shadow/i);
  expect(d.message, "the exact registered message with name and binder substituted").toBe(
    shadowMessage(toolName, binder),
  );
  expect(d.range, "the diagnostic range is the call node's range").toEqual(callRange);
}

/**
 * Assert the lexical bare-object-literal rejection for one parse cell
 * (contract b): exactly one `theta/parse/bare-object-literal`, byte-identical
 * to the registered message, range on the offending sole bare-object ARGUMENT
 * node (the same node the structural walk targets elsewhere).
 */
function expectBareObjectDiagnostic(
  diags: readonly Diagnostic[],
  argRange: SourceRange,
  why: string,
): void {
  const bare = withCode(diags, BARE_OBJECT_CODE);
  expect(bare, why).toHaveLength(1);
  const d = bare[0]!;
  expect(d.severity, "the registered severity is error").toBe("error");
  expect(d.message, "byte-identical to the registered bare-object-literal message").toBe(
    BARE_OBJECT_MESSAGE,
  );
  expect(d.range, "the range targets the sole bare-object argument node").toEqual(argRange);
}

describe("bug 0016 (a)+(b) parse layer — theta/parse/shadowed-callable-call fires from parseThetaDocument", () => {
  it("RED P1: `let`-shadowed object-literal call `let r = read({ path: \"p\" })?` — shadowed-callable-call plus the lexical bare-object-literal", () => {
    // HEAD (probed): ZERO diagnostics — the shape walk skips shadowed callees
    // and the bare-object carve-out is callee-blind.
    // Lines: 1–5 FM, 6 `let read = "x"`, 7 the call — call node 7:9–7:28, its
    // sole bare-object argument 7:14–7:27 (probed).
    const diags = diagsOf(FM + 'let read = "x"\nlet r = read({ path: "p" })?\nr');
    expectShadowDiagnostic(diags, "read", "let binding at line 6", range(7, 9, 7, 28));
    expectBareObjectDiagnostic(
      diags,
      range(7, 14, 7, 27),
      "contract (b): the callee is NOT lexically the Pi tool, so the sole bare-object argument is outside the §Object construction carve-out",
    );
  });

  it('RED P2: `let`-shadowed string-argument call `let r = read("y")?` — shadowed-callable-call, and NOT the 0003 shape code', () => {
    // HEAD (probed): ZERO diagnostics. Post-fix the rejection is the shadowed
    // CALLEE, not the Pi-tool argument SHAPE — the callee lexically is not the
    // tool, so theta/parse/tool-arg-not-object-literal must not fire.
    // Lines: 6 `let read = "x"`, 7 the call — call node 7:9–7:18 (probed).
    const diags = diagsOf(FM + 'let read = "x"\nlet r = read("y")?\nr');
    expectShadowDiagnostic(diags, "read", "let binding at line 6", range(7, 9, 7, 18));
    expect(
      withCode(diags, SHAPE_CODE),
      "the 0003 shape code is Pi-tool-callee-only and must not fire on a shadowed callee",
    ).toEqual([]);
  });

  it('RED P3: fn-parameter shadow `fn f(read: string) { read({ path: "p" })? }` — shadowed-callable-call plus bare-object-literal', () => {
    // HEAD (probed): ZERO diagnostics. A function parameter shadows through
    // the same lexical mechanism as a `let` (expressions.md arm 1).
    // Line 6 holds the whole `fn` declaration (a `FnParam` carries no range of
    // its own, so the binder line is the declaration's) — the in-body call
    // node spans 6:22–6:41, its bare-object argument 6:27–6:40 (probed).
    const diags = diagsOf(
      FM + 'fn f(read: string) { read({ path: "p" })? }\nlet r = f("v")\nr',
    );
    expectShadowDiagnostic(diags, "read", "fn parameter at line 6", range(6, 22, 6, 41));
    expectBareObjectDiagnostic(
      diags,
      range(6, 27, 6, 40),
      "contract (b): the parameter-shadowed callee is not the Pi tool, so the carve-out does not apply",
    );
  });

  it("RED P6: `let`-shadowed zero-argument call `let r = read()?` — shadowed-callable-call", () => {
    // HEAD (probed): ZERO diagnostics; at runtime this form silently
    // dispatches the tool with `{}` (R6 below). Call node 7:9–7:15 (probed).
    expectShadowDiagnostic(
      diagsOf(FM + 'let read = "x"\nlet r = read()?\nr'),
      "read",
      "let binding at line 6",
      range(7, 9, 7, 15),
    );
  });

  it('P-for: `for`-variable shadow — `for read in ["a"] { read({ path: "p" })? }` fires both bug-0016 codes', () => {
    // The `for` variable binds through the same arm-1 mechanism as a `let`
    // (expressions.md §Identifier resolution; the walk's per-scope copy
    // discipline). Line 6 `for … {`, line 7 the call — call node 7:3–7:22,
    // bare-object argument 7:8–7:21 (probed).
    const diags = diagsOf(FM + 'for read in ["a"] {\n  read({ path: "p" })?\n}\n"done"');
    expectShadowDiagnostic(diags, "read", "for variable at line 6", range(7, 3, 7, 22));
    expectBareObjectDiagnostic(
      diags,
      range(7, 8, 7, 21),
      "the for-variable-shadowed callee is not the Pi tool, so the carve-out does not apply",
    );
  });

  it('P-parfor: `par for`-variable shadow — `par for read in ["a"] { … }` fires both bug-0016 codes', () => {
    // The `par for` per-iteration variable shadows identically (RFC 0003; the
    // walk reaches the body block explicitly). The binder line is the par-for
    // EXPRESSION node's start line (its `variable` carries no own range).
    const diags = diagsOf(
      FM + 'let rs = par for read in ["a"] {\n  read({ path: "p" })?\n}\nrs',
    );
    expectShadowDiagnostic(diags, "read", "par for variable at line 6", range(7, 3, 7, 22));
    expectBareObjectDiagnostic(
      diags,
      range(7, 8, 7, 21),
      "the par-for-variable-shadowed callee is not the Pi tool, so the carve-out does not apply",
    );
  });

  it('P-match: `match`-arm pattern-binding shadow — `Ok(read) => read({ path: "p" })?` fires both bug-0016 codes', () => {
    // A `match` pattern binding is arm-1 local inside its arm body. Patterns
    // carry no ranges, so the binder line is the arm BODY's start line (the
    // arm's own line, immediately after `=>`) — line 7 here.
    const diags = diagsOf(
      FM +
        'let r = match Ok("x") {\n  Ok(read) => read({ path: "p" })?,\n  Err(e) => "err"\n}\nr',
    );
    expectShadowDiagnostic(diags, "read", "match binding at line 7", range(7, 15, 7, 34));
    expectBareObjectDiagnostic(
      diags,
      range(7, 20, 7, 33),
      "the match-binding-shadowed callee is not the Pi tool, so the carve-out does not apply",
    );
  });

  it('P-params: `params:`-field shadow — the binder phrase degrades to "params: field" (no body range)', () => {
    // A `params:` field materialises as a root-environment local at runtime
    // (arm 1), so a call of the shadowed name is equally erroneous — but a
    // frontmatter field carries no body source range, so the registered
    // message's `<binder>` renders without a line (the documented graceful
    // degradation). Body starts at line 8 (7-line frontmatter).
    const diags = diagsOf(
      "---\nmode: prompt\nparams:\n  read: string\ntools:\n  - read\n---\n" +
        'let r = read({ path: "p" })?\nr',
    );
    expectShadowDiagnostic(diags, "read", "params: field", range(8, 9, 8, 28));
    expectBareObjectDiagnostic(
      diags,
      range(8, 14, 8, 27),
      "the params-field-shadowed callee is not the Pi tool, so the carve-out does not apply",
    );
  });

  it("P-theta-callable: a shadowed `.theta`-callable name — `let summarise` over `tools: [./summarise.theta]` — fires shadowed-callable-call", () => {
    // Coverage decision: the code name says CALLABLE — `#classifyCall` is
    // equally lexical-blind for a shadowed `.theta`-callable name (bug doc
    // §Root cause), and `toolCallableName` exposes the post-rename presented
    // name at parse, so the gate covers both callable kinds. The 0003 SHAPE
    // code must NOT fire: the shape rule is Pi-tool-only, and a `.theta`
    // callable takes whole-value arguments anyway.
    const diags = diagsOf(
      "---\nmode: prompt\ntools:\n  - ./summarise.theta\n---\n" +
        'let summarise = "x"\nlet r = summarise("y")?\nr',
    );
    expectShadowDiagnostic(diags, "summarise", "let binding at line 6", range(7, 9, 7, 23));
    expect(
      withCode(diags, SHAPE_CODE),
      "the 0003 shape code never applies to a .theta-callable callee",
    ).toEqual([]);
  });

  it('P-userfn: contract (b) spec-tightening — `f({ path: "p" })` for a plain user `fn` is bare-object-literal (no shadow code)', () => {
    // §Object construction: "`f({ ... })` for a `let`-bound name or a `.theta`
    // callable remains `theta/parse/bare-object-literal`" — a user `fn` callee
    // sits in the same non-Pi-tool class. HEAD (probed): ZERO diagnostics
    // (the structural carve-out was callee-blind). Lines: 6 schema, 7 fn,
    // 8 the call — bare-object argument node 8:11–8:24 (probed).
    const diags = diagsOf(
      FM + 'schema Args { path: string }\nfn f(x: Args) { "ok" }\nlet r = f({ path: "p" })\nr',
    );
    expectBareObjectDiagnostic(
      diags,
      range(8, 11, 8, 24),
      "contract (b): a user-fn callee is not a Pi tool, so its sole bare-object argument is outside the carve-out",
    );
    expect(
      withCode(diags, SHADOW_CODE),
      "f does not collide with a callable-set name, so no shadowed-callable-call fires",
    ).toEqual([]);
    expect(
      diags.filter((d) => d.severity === "error" && d.code !== BARE_OBJECT_CODE),
      "the bare-object rejection fires alone, not as part of an error cascade",
    ).toEqual([]);
  });
});

describe("bug 0016 parse layer — controls (green now, green after)", () => {
  it('CONTROL P5: unshadowed `let r = read({ path: "p" })?` parses with zero diagnostics', () => {
    expect(diagsOf(FM + 'let r = read({ path: "p" })?\nr')).toEqual([]);
  });

  it('CONTROL P4: unshadowed `let r = read("y")?` keeps exactly one 0003 shape code and gains NO shadowed-callable-call', () => {
    const diags = diagsOf(FM + 'let r = read("y")?\nr');
    expect(
      withCode(diags, SHAPE_CODE),
      "the unshadowed non-object argument stays the bug-0003 rejection",
    ).toHaveLength(1);
    expect(
      withCode(diags, SHADOW_CODE),
      "an unshadowed callee is not a shadowed-callable-call site",
    ).toEqual([]);
  });

  it("CONTROL bind-only: `let read = \"x\"` then `read` (never called) stays legal with zero diagnostics", () => {
    // expressions.md: "Local bindings shadow everything else lexically" —
    // shadowing the name is legal; only CALLING the shadowed name is the
    // erroneous form (bug doc §Options, Option 1).
    expect(diagsOf(FM + 'let read = "x"\nread')).toEqual([]);
  });

  it("CONTROL P-fn-noclosure: caller-frame `let read` + fn-body `read({ path: \"p\" })?` — ZERO shadowed-callable-call, ZERO bare-object-literal", () => {
    // The parse-layer control for the runtime CONTROL R-fn cell below, pinned
    // separately because `bindParsedSource`'s parse-clean guard deliberately
    // filters the two bug-0016 codes for every runtime cell — a parse-layer
    // FALSE POSITIVE on this legal source would be invisible there. The
    // no-closures model (expressions.md §Identifier resolution; theta 1.0 has
    // no closures) resolves the fn body's `read` to the TOOL — the caller
    // frame's `let read` is not in scope inside the body — so no shadow code
    // fires and the sole bare-object argument sits INSIDE the §Object
    // construction Pi-tool carve-out.
    const diags = diagsOf(
      FM + 'let read = "x"\nfn f() { read({ path: "p" })? }\nlet r = f()\nr',
    );
    expect(
      withCode(diags, SHADOW_CODE),
      "a caller-frame let is not in scope inside the fn body (no closures), so no shadowed-callable-call fires",
    ).toEqual([]);
    expect(
      withCode(diags, BARE_OBJECT_CODE),
      "the fn-body callee lexically IS the Pi tool, so its sole bare-object argument is inside the carve-out",
    ).toEqual([]);
  });

  it("CONTROL fn-decl shadower: `fn probe` colliding with `tools: [probe]` does NOT fire shadowed-callable-call", () => {
    // Design decision (documented in `checkLexicalCallSites`): the new code
    // fires only for arm-1 LOCAL binders. A top-level `fn` name wins the
    // resolution on arm 2 — a LEGAL user-fn call, not a call of a
    // non-callable local — and the `tools:` collision itself is separately
    // load-rejected (`theta/load/tool-name-collision`), so parse stays quiet.
    const diags = diagsOf(
      "---\nmode: prompt\ntools:\n  - probe\n---\n" + 'fn probe() { "x" }\nlet r = probe()\nr',
    );
    expect(withCode(diags, SHADOW_CODE), "an fn-decl shadower is arm 2, not arm 1").toEqual([]);
    expect(
      diags.filter((d) => d.severity === "error"),
      "the fn-decl-shadowed source parses without any error at the parse layer",
    ).toEqual([]);
  });
});

describe("bug 0016 parse layer — schema/enum names are not §Identifier-resolution arms (spec-tightening pins)", () => {
  // `tools: [read as Read]` — the post-`as` presented Pi-tool name collides
  // with a top-level `schema Read` in the body. expressions.md §Identifier
  // resolution ranks local > fn > import > callable ONLY — schema (and enum)
  // names are not call-position resolution arms — so the callee still
  // resolves to the callable-set entry and keeps the Pi tool's rules.
  const FM_AS = "---\nmode: prompt\ntools:\n  - read as Read\n---\n";

  it('P-schema-shape: `schema Read` + `Read("y")?` — exactly one 0003 shape code despite the schema-name collision', () => {
    // HEAD (probed) stayed SILENT here: the pre-0016 shape walk folded
    // schema / enum names into its shadow set, suppressing the 0003 rejection
    // for a callee that lexically IS the tool.
    const diags = diagsOf(FM_AS + 'schema Read { path: string }\nlet r = Read("y")?\nr');
    expect(
      withCode(diags, SHAPE_CODE),
      "a schema name is not a resolution arm, so the collision must not suppress the Pi-tool argument-shape rule",
    ).toHaveLength(1);
    expect(
      withCode(diags, SHADOW_CODE),
      "a schema name is not an arm-1 local, so no shadowed-callable-call fires",
    ).toEqual([]);
  });

  it('P-schema-carveout: `schema Read` + `Read({ path: "p" })?` parses clean — the callee IS the tool lexically', () => {
    expect(
      diagsOf(FM_AS + 'schema Read { path: string }\nlet r = Read({ path: "p" })?\nr'),
      "the sole bare-object argument sits inside the §Object construction Pi-tool carve-out, and the shape rule is satisfied",
    ).toEqual([]);
  });
});

// ===========================================================================
// Runtime layer — the producer-level harness (the
// tests/tool-arg-shape-enforcement.test.ts section-(C) pattern):
// `parseThetaDocument` on real fenced source → `createProductionProducerDeps`
// → `bindPromptConversation` with a recording `pi-tool` snapshot entry for
// `read` → `executeBody(parsed.body, binding.executeDeps)`.
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: {
      newInvocationId: () => "inv-1",
      newToolCallId: () => "tc-1",
    },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

function producer() {
  return createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/** A recording `pi-tool` snapshot entry capturing every dispatched params object. */
function recordingPiTool(toolName: string): {
  readonly entry: ResolvedCallable;
  readonly params: unknown[];
} {
  const params: unknown[] = [];
  const dispatch: PiToolDispatch = {
    toolName,
    execute: (_id: string, p: unknown): Promise<AgentToolResultEnvelope> => {
      params.push(p);
      return Promise.resolve({ content: [{ type: "text", text: `${toolName}-out` }] });
    },
  };
  return { entry: { kind: "pi-tool", toolDefinition: dispatch }, params };
}

function snapshot(
  entries: readonly (readonly [string, ResolvedCallable])[],
): CallableSetSnapshot {
  return Object.freeze({ entries: new Map(entries) });
}

/** A prompt-mode theta over a callable-set snapshot. */
function thetaWithSet(programBody: ThetaBody, callableSet: CallableSetSnapshot): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" };
  return {
    slashName: "bug0016",
    sourcePath: "/theta/bug0016.theta",
    frontmatter,
    body: programBody,
    callableSet,
  };
}

function bind(
  theta: ThetaCompositionInput,
  paramBindings?: ReadonlyMap<string, ThetaValue>,
) {
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: ctxDouble(),
    ...(paramBindings !== undefined ? { paramBindings } : {}),
  };
  return producer().bindPromptConversation(bindInput);
}

interface RuntimeCell {
  readonly body: ThetaBody;
  readonly deps: ExecuteBodyDeps;
  /** Every params object the recording `read` entry was dispatched with. */
  readonly params: readonly unknown[];
}

/**
 * Parse one real fenced source and bind it over a FRESH recording `read`
 * entry. The parse guard keeps every cell failing for the DOCUMENTED reason
 * (dispatch / misattribution), never an accidental syntax error — and stays
 * valid post-fix, when the shadowed sources legitimately carry the two new
 * bug-0016 parse codes asserted in the parse layer above. `paramBindings` is
 * the production carrier for bound `params:` fields: the frontmatter binder's
 * bound args ride `ConversationBindInput.paramBindings` into
 * `buildBoundEnvironment`, which defines them as root-frame locals — feeding
 * the map here exercises exactly that path.
 */
function bindParsedSource(
  src: string,
  paramBindings?: ReadonlyMap<string, ThetaValue>,
): RuntimeCell {
  const parsed = parseSource(src);
  expect(
    parsed.diagnostics.filter(
      (d) => d.severity === "error" && d.code !== SHADOW_CODE && d.code !== BARE_OBJECT_CODE,
    ),
    "runtime-cell source parses clean apart from the bug-0016 parse codes",
  ).toEqual([]);
  const read = recordingPiTool("read");
  const binding = bind(thetaWithSet(parsed.body, snapshot([["read", read.entry]])), paramBindings);
  return { body: parsed.body, deps: binding.executeDeps, params: read.params };
}

/**
 * Assert one red dispatch cell (contract c): `executeBody` over the shadowed
 * source must reject with the post-fix shadowed-callee defect (loose: any
 * rejection), and the tool must never have executed. On HEAD the body instead
 * completes cleanly AND the recording entry holds the dispatched params.
 */
async function expectShadowedCallRejection(src: string): Promise<void> {
  const cell = bindParsedSource(src);
  const p = executeBody(cell.body, cell.deps);
  await expect(
    p,
    "PRIMARY (bug 0016 contract c): a call whose callee is lexically shadowed must never dispatch the Pi tool — post-fix executeBody rejects with a shadowed-callee defect",
  ).rejects.toThrow();
  expect(cell.params, "the tool must never execute for a shadowed-callee call site").toEqual([]);
}

/**
 * Assert one red crashing-arm cell (contract c, misattribution half): the
 * rejection must NOT be the bug-0003 `PiToolArgShapeDefectError` — on HEAD it
 * was exactly that, blaming an internal parse-gate defect for a parse-clean
 * authored program. TIGHTENED post-fix: the rejection is the bug-0016
 * `ShadowedCalleeDispatchDefectError`, pinned by its `.name`.
 */
async function expectShadowedCallRejectionNotShapeDefect(src: string): Promise<void> {
  const cell = bindParsedSource(src);
  const p = executeBody(cell.body, cell.deps);
  await expect(p, "the shadowed-callee call must reject").rejects.toThrow();
  await expect(
    p,
    "PRIMARY (bug 0016 contract c): the rejection is a shadowed-callee defect, NOT the misattributed bug-0003 PiToolArgShapeDefectError",
  ).rejects.not.toHaveProperty("name", "PiToolArgShapeDefectError");
  await expect(
    p,
    "the rejection is the bug-0016 ShadowedCalleeDispatchDefectError (src/runtime/tool-call.ts)",
  ).rejects.toHaveProperty("name", "ShadowedCalleeDispatchDefectError");
  expect(cell.params, "the tool must never execute for a shadowed-callee call site").toEqual([]);
}

describe("bug 0016 (c) runtime layer — a shadowed-callee call never dispatches the tool (both executor sites)", () => {
  it('RED R1 (evalAsResult site): `let read = "x"` then `let r = read({ path: "p" })?` — HEAD executes the tool with { path: "p" }', async () => {
    await expectShadowedCallRejection(FM + 'let read = "x"\nlet r = read({ path: "p" })?\nr');
  });

  it('RED R1-bare (evalExpr site): `let read = "x"` then `let r = read({ path: "p" })` — HEAD executes the tool with { path: "p" }', async () => {
    await expectShadowedCallRejection(FM + 'let read = "x"\nlet r = read({ path: "p" })\nr');
  });

  it('RED R6 (evalAsResult site): `let read = "x"` then `let r = read()?` — HEAD executes the tool with {}', async () => {
    await expectShadowedCallRejection(FM + 'let read = "x"\nlet r = read()?\nr');
  });

  it('RED R6-bare (evalExpr site): `let read = "x"` then statement `read()` — HEAD executes the tool with {}', async () => {
    await expectShadowedCallRejection(FM + 'let read = "x"\nread()\n"done"');
  });

  it('RED R2 (evalAsResult site, crashing arm): `let read = "x"` then `let r = read("y")?` — HEAD throws the misattributed PiToolArgShapeDefectError', async () => {
    await expectShadowedCallRejectionNotShapeDefect(FM + 'let read = "x"\nlet r = read("y")?\nr');
  });

  it('RED R2-bare (evalExpr site, crashing arm): `let read = "x"` then `let r = read("y")` — HEAD throws the misattributed PiToolArgShapeDefectError', async () => {
    await expectShadowedCallRejectionNotShapeDefect(FM + 'let read = "x"\nlet r = read("y")\nr');
  });

  it('RED R3 (fn-param shadow, evalAsResult inside the fn body): `fn f(read: string) { read({ path: "p" })? }` — HEAD executes the tool, ignoring the param value', async () => {
    await expectShadowedCallRejection(
      FM + 'fn f(read: string) { read({ path: "p" })? }\nlet r = f("v")\nr',
    );
  });

  it('RED R-match (match-operand path, same evalAsResult site): `match read({ path: "p" }) { ... }` over the shadowed callee — HEAD dispatches the scrutinee', async () => {
    await expectShadowedCallRejection(
      FM +
        'let read = "x"\nlet r = match read({ path: "p" }) { Ok(v) => "ok", Err(e) => "err" }\nr',
    );
  });

  it('R-for (loop-variable shadow): `for read in ["a"] { read({ path: "p" })? }` — the iteration binding rejects dispatch', async () => {
    // The `for` iteration variable binds through the same runtime mechanism
    // (`bindIterationVariable` → a child-scope local, no activation boundary),
    // so the shared-seam guard sees it exactly as a `let`.
    await expectShadowedCallRejection(
      FM + 'for read in ["a"] {\n  read({ path: "p" })?\n}\n"done"',
    );
  });

  it('R-params (params:-field shadow inside a plain fn body): `fn f() { read({ path: "p" })? }` under `params: { read }` — the root-frame binding rejects dispatch', async () => {
    // A `params:` field materialises as a ROOT-frame local at runtime
    // (`bindPromptConversation` → `buildBoundEnvironment` defines
    // `bindInput.paramBindings` onto the root — the map fed here is exactly
    // what production's `paramBindingsFrom` projects from the binder's bound
    // args), and the parse gate seeds every plain-`fn` body scope with those
    // rootLocals (P-params above pins the top-level form). The belt must
    // agree ACROSS the fn activation boundary: `localShadowsCallable`
    // consults the root frame's `params:`-field locals when its walk hits the
    // boundary — without that arm this cell DISPATCHES (`executeBody` ignores
    // parse diagnostics, so a gate gap would reach the belt exactly like
    // this), which is the 0016 silent-execution shape the belt exists to
    // catch.
    const cell = bindParsedSource(
      "---\nmode: prompt\nparams:\n  read: string\ntools:\n  - read\n---\n" +
        'fn f() { read({ path: "p" })? }\nlet r = f()\nr',
      new Map<string, ThetaValue>([["read", "x"]]),
    );

    const p = executeBody(cell.body, cell.deps);

    await expect(
      p,
      "PRIMARY (bug 0016 contract c): a params:-field-shadowed callee inside a plain fn body must never dispatch — the belt consults the root frame's params: locals across the activation boundary",
    ).rejects.toHaveProperty("name", "ShadowedCalleeDispatchDefectError");
    expect(cell.params, "the tool must never execute for a shadowed-callee call site").toEqual([]);
  });

  it('CONTROL R5: unshadowed `let r = read({ path: "p" })?` resolves and executes the tool exactly once with { path: "p" }', async () => {
    const cell = bindParsedSource(FM + 'let r = read({ path: "p" })?\nr');

    const r = await executeBody(cell.body, cell.deps);

    expect(r.outcome, "the unshadowed dispatch stays legal").toBe("success");
    expect(cell.params, "the tool executed exactly once with the lowered params").toEqual([
      { path: "p" },
    ]);
  });

  it('CONTROL R-fn (no-closures boundary): a caller-frame `let read` does NOT shadow an unshadowed `read({…})` inside an fn body — the tool dispatches', async () => {
    // theta 1.0 has no closures: the parse walks resolve an fn-body call
    // against the whole-file declarations plus the fn's own parameters, so
    // this source is parse-CLEAN (the body's `read` IS the tool). The runtime
    // guard must agree — `evalUserFnCall` marks the body scope an activation
    // boundary so the caller's `let read` (an implementation-artifact leak of
    // the chained scope) is not mistaken for an in-scope shadow. Without the
    // boundary the guard would defect-crash this legal program.
    const cell = bindParsedSource(
      FM + 'let read = "x"\nfn f() { read({ path: "p" })? }\nlet r = f()\nr',
    );

    const r = await executeBody(cell.body, cell.deps);

    expect(r.outcome, "the fn-body tool call stays legal and dispatches").toBe("success");
    expect(cell.params, "the tool executed exactly once with the lowered params").toEqual([
      { path: "p" },
    ]);
  });
});
