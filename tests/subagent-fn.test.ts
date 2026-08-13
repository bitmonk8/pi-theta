import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  resolveSubagentSessionConfigAt,
  type ThetaDocument,
  type ThetaBody,
  type Expr,
  type FnDecl,
  type ParseThetaDocumentDeps,
  type SubagentSessionConfig,
} from "../src/parser/theta-document";
import {
  checkSubagentFnModelOverrides,
  checkSubagentFnStaticResolution,
  collectSubagentFns,
} from "../src/extension/subagent-fn-static-checks";
import { checkThetaImports } from "../src/extension/import-static-checks";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type SubagentFnSession,
} from "../src/runtime/effectful-statement-host";
import type { ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type { FileSystem } from "../src/seams/file-system";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  StaticTypeInferencePass,
  type StaticTypeInferenceDeps,
} from "../src/parser/static-type-inference";
import {
  checkCompatible,
  displayType,
  type CompatType,
  type TypeEnv,
} from "../src/parser/type-compat";
import {
  executeBody,
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../src/runtime/statement-executor";
import {
  buildEnvironment,
  type LexicalEnvironment,
} from "../src/runtime/lexical-environment";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { OperationResult } from "../src/runtime/cancellation-core";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../src/runtime/terminal-outcomes";
import { isResultValue, type ThetaValue } from "../src/runtime/value";
import type { QueryError } from "../src/runtime/query-error";
import { HostFatal, IndexOutOfBoundsPanic } from "../src/runtime/runtime-panics";
// Reused load/ceiling seams — the same surfaces the existing `invoke` depth /
// cycle / callee-error suites drive. RFC 0001 introduces NO new diagnostic code
// and NO new ceiling: a `subagent fn` reuses these mechanisms verbatim (the
// self-reference ban is a length-1 `theta/load/invocation-cycle`, a broken body
// is `theta/load/callee-has-errors`, and a `subagent fn` call is a countable
// frame under the depth-32 `invoke` ceiling), so these tests assert the reuse
// contract those obligations rest on.
import {
  INVOCATION_CYCLE_CODE,
  INVOKE_DEPTH_CAP,
  INVOKE_DEPTH_EXCEEDED_CODE,
  InvokeDepthExceededPanic,
  type CountableFrameKind,
  type InvokeChain,
  type InvokeGraph,
  detectInvocationCycle,
  invocationCycleMessage,
  newInvokeChain,
  pushCountableFrame,
  surfaceDepthOverflow,
} from "../src/runtime/invoke-depth-cycle";
import {
  CALLEE_HAS_ERRORS_CODE,
  calleeHasErrorsMessage,
  checkCalleeHasErrors,
} from "../src/parser/invoke-diagnostics";
// The stable `tools:` callable-set resolver — the same surface the V6c suite
// drives. FN-6 decides a `subagent fn` is an INLINE callable (reached only by
// in-body name); the "never a `tools:` entry" half of that decision is asserted
// against this seam as a reuse-contract guard (see the describe block below).
import {
  resolveCallableSet,
  type CallableSetDeps,
  type ToolsField,
} from "../src/parser/callable-set";

// ===========================================================================
// RFC 0001 (`subagent fn`) — test-first (RED) obligation suite.
// ===========================================================================
//
// Feature spec (normative):
//   - functions.md §"`subagent fn` — inline subagent callables" (anchor
//     #subagent-fn), FN-6 (isolation / arguments / return / query targeting /
//     ceiling / self-reference ban / not-discoverable / final value / broken
//     body), FN-7 (session config — inherit by default, `with { … }` override),
//     FN-8 (callable from `mode: prompt`), FN-9 (`.thetalib` library helpers).
//   - grammar.md §"`fn` declarations" (`FnDecl ::= SubagentMod? "fn" … WithClause?
//     FnBody`, `WithClause` / `WithField` / `WithKey`), §"`subagent fn`".
//   - invocation.md §Final-value propagation, §Cross-mode semantics
//     (prompt → subagent), §"Cycle detection" (self-reference is a length-1
//     invocation cycle), §INV-4 (a `subagent fn` call is a countable frame).
//   - imports.md (`.thetalib` may declare a `subagent fn`; inheritance resolves
//     against the CALLING theta; `with { tools }` resolves against the calling
//     theta's callable set).
//   - Diagnostics reuse: RFC 0001 coins NO new code — a broken body is
//     `theta/load/callee-has-errors`, a self-reference is
//     `theta/load/invocation-cycle`, a depth breach is
//     `theta/runtime/invoke-depth-exceeded`, and each `with` key reuses its
//     frontmatter field's load diagnostics (e.g. `theta/load/unknown-frontmatter-field`).
//   - RFC: rfcs/0001-subagent-fn.md (accepted).
//
// Discipline: this suite is written BEFORE the implementation. The `subagent`
// modifier and the `with { … }` clause are absent from src/ today, so a
// `subagent fn f(...) { ... }` source mis-parses to a free identifier `subagent`
// followed by an ordinary top-level `fn` (no `subagent` flag, no `with` clause on
// the AST), and every call runs INLINE against the caller's conversation rather
// than spawning a fresh isolated session. Every parse/type/runtime test here is
// therefore expected to be RED for the "feature-not-implemented" reason; the
// paired implementation stage turns them green.
//
// Two classes of test are deliberately GREEN both now and post-implementation
// and are labelled as such:
//   (a) NON-REGRESSION GUARDS — `subagent` / `with` used as ordinary identifiers
//       away from the contextual-keyword position must keep parsing.
//   (b) REUSE-CONTRACT GUARDS — the load/ceiling mechanisms RFC 0001 reuses
//       (`detectInvocationCycle`, `checkCalleeHasErrors`, `pushCountableFrame`)
//       already work for `invoke`; these tests pin the contract the `subagent fn`
//       wiring must route through, asserted against those stable seams directly.
//       (The parse→load-pass wiring that BUILDS the graph node / callee record
//       for a `subagent fn` is a composition-layer concern not drivable through
//       the parse / `executeBody` unit surfaces this suite uses; see the handoff
//       notes.)
//
// The RED core drives the real, stable public surfaces only — `parseThetaDocument`
// (never throws; aggregates diagnostics), `StaticTypeInferencePass` (read-only),
// and `executeBody` (the tree-walking driver). No src/ module is modified. Where
// a runtime observation needs a hook the current executor does not yet route
// through (the per-call session switch), the test is written against the intended
// observable behaviour and the required hook is documented in a comment and in
// the handoff notes.

// --- Assumed `subagent fn` AST shape (implementer must honour) -------------
//
// Grammar: `FnDecl ::= SubagentMod? "fn" Ident "(" FnParams? ")" (":" ReturnType)?
// WithClause? FnBody`. This suite assumes the parser lowers a `subagent fn` to the
// existing `FnDecl` node (kind: "fn", name, params, returnType, body) EXTENDED
// with two additive fields:
//
//   { kind: "fn", …,
//     subagent: boolean,          // true iff the `subagent` modifier is present
//     with: WithClause | null }   // the `with { … }` clause, or null when absent
//
// The `with` clause's concrete shape is left to the implementer; `withClauseKeys`
// below tolerates either a keyed object ({ tools, system, … }) or an array of
// `{ key, value }` fields, and reads only the SET OF KEYS present — the stable,
// representation-independent surface.

// --- parse harness ---------------------------------------------------------

/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
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

/** Parse a UTF-8 `.theta` (or `.thetalib`) source string through the production parser. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string, path = "test.theta"): string[] {
  return parse(src, path).diagnostics.map((d: Diagnostic) => d.code);
}

// --- generic AST search ----------------------------------------------------

interface KindedNode {
  readonly kind: string;
  readonly [key: string]: unknown;
}

/** Collect every AST object of the given `kind` anywhere under `root`. */
function collectByKind(root: unknown, kind: string): KindedNode[] {
  const out: KindedNode[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.kind === "string" && obj.kind === kind) {
      out.push(obj as KindedNode);
    }
    for (const key of Object.keys(obj)) {
      visit(obj[key]);
    }
  };
  visit(root);
  return out;
}

/** All `fn` declaration nodes in a parsed body. */
function fnNodes(body: ThetaBody): KindedNode[] {
  return collectByKind(body, "fn");
}

/** The single `fn` node named `name` (undefined if absent). */
function fnNamed(body: ThetaBody, name: string): KindedNode | undefined {
  return fnNodes(body).find((f) => f.name === name);
}

/**
 * Whether a `fn` node is flagged as a `subagent fn`. Tolerates the additive-flag
 * spellings an implementer might choose; the stable observation is "the parser
 * marked this declaration as carrying the `subagent` modifier".
 */
function isSubagentFn(node: KindedNode | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  return (
    node.subagent === true ||
    node.isSubagent === true ||
    node.modifier === "subagent"
  );
}

/**
 * The set of keys present in a `fn` node's `with { … }` clause, tolerating either
 * a keyed object or an array of `{ key }` / `{ name }` fields. Empty when there is
 * no clause (the feature-absent state today).
 */
function withClauseKeys(node: KindedNode | undefined): string[] {
  if (node === undefined) {
    return [];
  }
  const clause = (node.with ?? node.withClause ?? node.with_clause) as unknown;
  if (clause === null || clause === undefined) {
    return [];
  }
  if (Array.isArray(clause)) {
    return clause
      .map((f) =>
        f !== null && typeof f === "object"
          ? ((f as Record<string, unknown>).key ??
              (f as Record<string, unknown>).name)
          : undefined,
      )
      .filter((k): k is string => typeof k === "string");
  }
  if (typeof clause === "object") {
    return Object.keys(clause as Record<string, unknown>);
  }
  return [];
}

const withFrontmatter = (mode: string, bodySrc: string): string =>
  ["---", `mode: ${mode}`, "---", bodySrc].join("\n");

// ===========================================================================
// PARSER — the `subagent` modifier (grammar.md §"`fn` declarations", FN-6)
// ===========================================================================

describe("RFC-0001 subagent-fn — `subagent` modifier parsing", () => {
  it("FN-6 / grammar#fn-declarations: `subagent fn f(...) { ... }` parses and marks the fn as a subagent fn (RED — feature absent)", () => {
    const doc = parse("subagent fn step(objective: string) { objective }");
    const node = fnNamed(doc.body, "step");
    expect(node, "the declaration still lowers to a `fn` node named `step`").toBeDefined();
    expect(
      isSubagentFn(node),
      "FN-6: the `subagent` modifier is recorded on the declaration (not parsed as a free identifier `subagent` followed by a plain `fn`)",
    ).toBe(true);
    // `subagent` before `fn` is the modifier, not a free identifier reference.
    expect(
      doc.diagnostics.map((d) => d.code),
      "FN-6: `subagent` immediately before `fn` is the contextual modifier, not an unknown identifier",
    ).not.toContain("theta/parse/unknown-identifier");
  });

  it("FN-6 / grammar#fn-declarations: `subagent` is admissible only on a TOP-LEVEL fn — a nested one fires theta/parse/nested-fn (guard)", () => {
    // A nested `fn` is `theta/parse/nested-fn` regardless of the modifier; the
    // `subagent` modifier does not lift the top-level-only placement rule (FN-1).
    const codes = codesOf(
      [
        "fn outer() {",
        "  subagent fn inner(x: string) { x }",
        "  0",
        "}",
      ].join("\n"),
    );
    expect(
      codes,
      "FN-1/FN-6: a nested `subagent fn` is rejected by the same top-level-only placement rule",
    ).toContain("theta/parse/nested-fn");
  });
});

// ===========================================================================
// PARSER — the `with { … }` session-config clause (grammar.md `WithClause`, FN-7)
// ===========================================================================

describe("RFC-0001 subagent-fn — `with { … }` session-config clause", () => {
  it("FN-7 / grammar#WithClause: a full `with { tools, system, model, tool_loop, respond_repair }` clause parses; the node records each key (RED — feature absent)", () => {
    const doc = parse(
      [
        "subagent fn step(o: string) with {",
        "  tools: [read, bash],",
        '  system: "be terse",',
        '  model: "sonnet",',
        "  tool_loop: { max_rounds: 4 },",
        '  respond_repair: { attempts: 2, methodology: "reask" }',
        "} { o }",
      ].join("\n"),
    );
    const node = fnNamed(doc.body, "step");
    expect(isSubagentFn(node), "FN-6/FN-7: the declaration is a subagent fn").toBe(true);
    expect(
      withClauseKeys(node).sort(),
      "FN-7: all five `with` keys are captured on the clause",
    ).toEqual(["model", "respond_repair", "system", "tool_loop", "tools"]);
  });

  it("FN-7 / grammar#WithClause: each `with` key is optional — `with { tools: [...] }` alone parses (RED — feature absent)", () => {
    const doc = parse("subagent fn step(o: string) with { tools: [read] } { o }");
    const node = fnNamed(doc.body, "step");
    expect(isSubagentFn(node), "FN-6/FN-7: a subagent fn with a one-key `with` clause").toBe(
      true,
    );
    expect(
      withClauseKeys(node),
      "FN-7: a single-key `with { tools: [...] }` clause is admissible (other keys still inherit)",
    ).toEqual(["tools"]);
  });

  it("FN-7: an unknown key in `with` is rejected the same way the frontmatter field would be — theta/load/unknown-frontmatter-field (RED — feature absent)", () => {
    // FN-7: the clause is validated against the same rules that govern the
    // corresponding frontmatter fields and reuses those fields' diagnostics
    // rather than coining a parallel code — a key outside the five surfaces the
    // frontmatter forward-compat code `theta/load/unknown-frontmatter-field`.
    const codes = codesOf('subagent fn step(o: string) with { bogus: 1 } { o }');
    expect(
      codes,
      "FN-7: an unknown `with` key reuses the frontmatter `theta/load/unknown-frontmatter-field` diagnostic",
    ).toContain("theta/load/unknown-frontmatter-field");
  });

  it("FN-7: `with { system: … }` is legitimate from a prompt-mode theta — theta/parse/system-on-prompt-mode does NOT apply to the clause (RED — feature absent)", () => {
    // FN-7: a `mode: prompt` theta cannot carry `system:` in its own frontmatter,
    // but a `subagent fn`'s spawned session is private, so its `with`-clause
    // `system` is well-defined and must NOT trip `theta/parse/system-on-prompt-mode`.
    const doc = parse(
      withFrontmatter(
        "prompt",
        'subagent fn step(o: string) with { system: "be terse" } { o }',
      ),
    );
    expect(
      isSubagentFn(fnNamed(doc.body, "step")),
      "FN-6/FN-7: the subagent fn is recognised inside a prompt-mode theta",
    ).toBe(true);
    expect(
      doc.diagnostics.map((d) => d.code),
      "FN-7: `theta/parse/system-on-prompt-mode` does not apply to a subagent fn's `with`-clause system",
    ).not.toContain("theta/parse/system-on-prompt-mode");
  });
});

// ===========================================================================
// LEXER / PARSER — `subagent` / `with` are contextual (NON-REGRESSION GUARDS)
// ===========================================================================

describe("RFC-0001 subagent-fn — `subagent`/`with` are contextual keywords (guards — green now)", () => {
  // NON-REGRESSION GUARDS: neither `subagent` nor `with` is a reserved keyword,
  // so both must keep parsing as ordinary identifiers when they are NOT in the
  // contextual position. This must not regress when the modifier/clause land.
  it("grammar#contextual-keywords: an identifier named `subagent` parses when not before `fn` (guard — green)", () => {
    const codes = codesOf(["let subagent = 1", "let n = subagent + 1", "n"].join("\n"));
    expect(
      codes,
      "an identifier named `subagent` away from a following `fn` must keep parsing",
    ).not.toContain("theta/parse/reserved-keyword-as-identifier");
    expect(codes).not.toContain("theta/parse/unknown-identifier");
    expect(codes).toEqual([]);
  });

  it("grammar#contextual-keywords: an identifier named `with` parses when not the fn-clause keyword (guard — green)", () => {
    const codes = codesOf(["let with = 1", "with"].join("\n"));
    expect(
      codes,
      "an identifier named `with` outside the `subagent fn` clause position must keep parsing",
    ).not.toContain("theta/parse/reserved-keyword-as-identifier");
    expect(codes).toEqual([]);
  });
});

// ===========================================================================
// TYPE SYSTEM — inferred + validated return type across the boundary (FN-6)
// ===========================================================================

const EMPTY_TYPE_ENV: TypeEnv = {};

function makeInferencePass(): StaticTypeInferencePass {
  const deps: StaticTypeInferenceDeps = { checkCompatible };
  return new StaticTypeInferencePass(deps);
}

describe("RFC-0001 subagent-fn — inferred + validated return type (FN-6, same as fn/invoke)", () => {
  it("FN-6/FN-3: an annotation-less subagent fn infers its return type from the body tail, exactly as a plain fn (RED — feature absent)", () => {
    const doc = parse("subagent fn step(o: string) { 7 }\nstep(\"x\")");
    const node = fnNamed(doc.body, "step");
    expect(
      isSubagentFn(node),
      "FN-6: the declaration must be recognised as a subagent fn for its return contract to be the subagent-fn one",
    ).toBe(true);

    // The body tail `7` is the inferred return payload (integer), reconciled by
    // the same FN-3 rule an annotation-less `fn` uses.
    const tail = (node?.body as { tail?: Expr } | undefined)?.tail;
    expect(tail, "the subagent fn body carries a tail expression").toBeDefined();
    const pass = makeInferencePass();
    const inferred: CompatType = pass.typeOf(tail as Expr, EMPTY_TYPE_ENV);
    const rendered = displayType(inferred);
    expect(
      rendered,
      `FN-3: the tail types as integer (got '${rendered}')`,
    ).toBe("integer");
  });

  it("FN-6/FN-3: an explicit return annotation is carried across the boundary and used to validate the typed-let caller (RED — feature absent)", () => {
    const doc = parse(
      [
        "subagent fn step(o: string): integer { 7 }",
        "let r: integer = step(\"x\")",
        "r",
      ].join("\n"),
    );
    const node = fnNamed(doc.body, "step");
    expect(
      isSubagentFn(node),
      "FN-6: the explicit-return subagent fn is recognised as such",
    ).toBe(true);
    expect(
      node?.returnType,
      "FN-6/FN-3: the explicit `: integer` return annotation is captured across the subagent boundary, exactly as for fn/invoke",
    ).toBe("integer");
  });
});

// ===========================================================================
// LOAD — self-reference is a length-1 `theta/load/invocation-cycle` (FN-6)
// ===========================================================================

describe("RFC-0001 subagent-fn — self-reference ban is a length-1 invocation cycle (FN-6, reuse-contract guard)", () => {
  // REUSE-CONTRACT GUARD: FN-6 enforces the self-reference ban WITHOUT a new
  // code — a `subagent fn` call is a countable invoke frame, so a `subagent fn`
  // that references itself is a length-1 `theta/load/invocation-cycle`. This pins
  // the detector contract the `subagent fn` load-pass wiring must route through:
  // a self-edge `step → step` is a cycle. (Building that self-edge from a parsed
  // `subagent fn` is composition-layer wiring, not expressible through the parse
  // surface this suite uses — see the handoff notes.)
  it("theta/load/invocation-cycle: a `subagent fn` that references itself is a length-1 cycle `step → step`", () => {
    const selfGraph: InvokeGraph = {
      edges: new Map<string, readonly string[]>([["step", ["step"]]]),
      unresolvable: new Set<string>(),
    };
    const cycle = detectInvocationCycle("step", selfGraph);
    expect(
      cycle?.code,
      "FN-6: a subagent fn self-reference surfaces the existing theta/load/invocation-cycle code (no new code)",
    ).toBe(INVOCATION_CYCLE_CODE);
    expect(
      cycle?.message,
      "FN-6: the length-1 self-cycle renders `invocation cycle: step → step`",
    ).toBe(invocationCycleMessage(["step", "step"]));
  });
});

// ===========================================================================
// LOAD — a broken subagent fn body is `theta/load/callee-has-errors` (FN-6)
// ===========================================================================

describe("RFC-0001 subagent-fn — a broken body surfaces theta/load/callee-has-errors (FN-6, reuse-contract guard)", () => {
  // REUSE-CONTRACT GUARD: FN-6 reports a `subagent fn` body that fails to parse
  // or type-check through the existing `theta/load/callee-has-errors` code — the
  // inline case, where the "callee" is a FUNCTION NAME in the same file rather
  // than a separate `.theta` path. This pins that the message names the function
  // (not a path). (Detecting the broken inline body and feeding it to this
  // builder is load-pass wiring; see the handoff notes.)
  it("theta/load/callee-has-errors: the inline case names the function `step`, not a separate path", () => {
    const related = [
      {
        file: "test.theta",
        range: { start: { line: 2, column: 3 }, end: { line: 2, column: 8 } },
        message: "unexpected token",
      },
    ];
    const diags = checkCalleeHasErrors({
      calleePath: "step",
      surface: "tools",
      hasErrors: true,
      relatedSites: related,
      site: {
        file: "test.theta",
        range: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } },
      },
    });
    const d = diags.find((x) => x.code === CALLEE_HAS_ERRORS_CODE);
    expect(
      d,
      "FN-6: a broken subagent fn body surfaces the existing theta/load/callee-has-errors code (no new inline-specific code)",
    ).toBeDefined();
    expect(
      d?.message,
      "FN-6: the inline case's message names the function `step` (a bare name, not a `.theta` path)",
    ).toBe(calleeHasErrorsMessage("step"));
    expect(
      d?.message.includes("/") || d?.message.includes(".theta"),
      "FN-6: the inline callee is a function name, not a path",
    ).toBe(false);
  });
});

// ===========================================================================
// LOAD — a `subagent fn` is never slash-discoverable and never a `tools:` entry
// (FN-6): reuse-contract guard for the `tools:` half + documented handoff for
// the discovery half.
// ===========================================================================

describe("RFC-0001 subagent-fn — never slash-discoverable, never a `tools:` entry (FN-6)", () => {
  // FN-6 decides a `subagent fn` is an INLINE callable: reached ONLY by its name
  // in the enclosing body (like a plain `fn`). It is never surfaced as a slash
  // command and never admissible as a `tools:` table entry. The decision splits
  // into two facets by whether a unit seam exists:
  //
  //   (a) NEVER A `tools:` ENTRY — DRIVABLE, asserted below as a REUSE-CONTRACT
  //       GUARD against the stable `resolveCallableSet` seam (the same surface the
  //       V6c callable-set suite drives). A `tools:` entry is either a bare
  //       Pi-tool name (resolved against the host registry) or a `.theta`/
  //       `.thetalib` path literal; a `subagent fn`'s bare name is NEITHER, so
  //       listing it resolves to `theta/load/unknown-tool` and the theta does not
  //       register. And because a `subagent fn` is a TOP-LEVEL `fn`, its name sits
  //       in the callable set's `reservedNames`, so a `tools:` entry that would
  //       otherwise claim that name is rejected with `theta/load/tool-name-collision`.
  //       Either way the inline callable cannot be re-surfaced through `tools:`.
  //
  //   (b) NEVER SLASH-DISCOVERABLE — HANDOFF (documented implementer obligation;
  //       NOT drivable through any unit seam, in the same spirit as the
  //       composition-layer wiring notes above). The discovery walk
  //       (`discoverThetas`, src/discovery/discovery-walk.ts) maps `.theta` FILE
  //       stems to slash names and never even enumerates `.thetalib` files
  //       ("Library file — importable, never a slash command; not discovered"); it
  //       takes FILES as its input domain and never inspects a theta's internal
  //       `fn` declarations. A `subagent fn` is a top-level function INSIDE a file,
  //       not a file, so it is structurally outside the discovery walk's input —
  //       there is no function-level surface to assert against. IMPLEMENTER
  //       OBLIGATION: keep a `subagent fn` off the slash-command registry (it is
  //       reached only by in-body name), exactly as the file-based discovery walk
  //       already guarantees for any non-file callable.

  const subagentFnToolsEntry: ToolsField = { kind: "scalar", text: "step" };

  it("theta/load/unknown-tool: a `subagent fn`'s bare name is not admissible as a `tools:` entry — it is neither a Pi tool nor a `.theta` path (reuse-contract guard)", () => {
    // Model a file that declares `subagent fn step(...)` and tries to list `step`
    // in `tools:`. `step` is a bare identifier, so it is resolved as a Pi-tool
    // name — absent from the registry — not as a way to expose the inline fn.
    const deps: CallableSetDeps = {
      resolvePiTool: () => undefined,
      resolveThetaCallee: () => undefined,
      reservedNames: new Set(["step"]),
    };
    const result = resolveCallableSet({
      file: "test.theta",
      tools: subagentFnToolsEntry,
      deps,
    });
    expect(
      result.registered,
      "FN-6: a `subagent fn` name is not a resolvable `tools:` entry, so the theta does not register",
    ).toBe(false);
    expect(
      result.diagnostics.map((d) => d.code),
      "FN-6: a `subagent fn` name in `tools:` resolves as an unknown Pi tool (it is not a Pi tool and not a `.theta` path)",
    ).toContain("theta/load/unknown-tool");
  });

  it("theta/load/tool-name-collision: a `subagent fn`'s top-level name is reserved, so a like-named `tools:` entry is rejected (reuse-contract guard)", () => {
    // Even if a Pi tool named `step` DID exist, the `subagent fn step` is a
    // TOP-LEVEL binding held in `reservedNames`, so the `tools:` entry cannot
    // claim that name — the inline callable is not re-exposable through `tools:`.
    const deps: CallableSetDeps = {
      resolvePiTool: (name) =>
        name === "step" ? { kind: "pi-tool", toolDefinition: { name } } : undefined,
      resolveThetaCallee: () => undefined,
      reservedNames: new Set(["step"]),
    };
    const result = resolveCallableSet({
      file: "test.theta",
      tools: subagentFnToolsEntry,
      deps,
    });
    expect(
      result.registered,
      "FN-6: a `tools:` entry colliding with the `subagent fn`'s reserved top-level name is rejected",
    ).toBe(false);
    expect(
      result.diagnostics.map((d) => d.code),
      "FN-6: the collision reuses `theta/load/tool-name-collision` (a top-level fn name is reserved against `tools:`)",
    ).toContain("theta/load/tool-name-collision");
  });
});

// ===========================================================================
// LOAD — callable from `mode: prompt`, NOT rejected by prompt-mode-callable (FN-8)
// ===========================================================================

describe("RFC-0001 subagent-fn — callable from a prompt-mode theta (FN-8)", () => {
  it("FN-8: a prompt-mode theta may declare and call a `subagent fn`; theta/load/prompt-mode-callable does NOT apply (RED — feature absent)", () => {
    // FN-8: `theta/load/prompt-mode-callable` rejects a prompt-mode `.theta` path
    // listed in a `tools:` table; a `subagent fn` body is always a subagent
    // session (the safe prompt → subagent direction), so that code never applies
    // to it. The RED anchor is recognition of the subagent fn inside a prompt-mode
    // theta.
    const doc = parse(
      withFrontmatter(
        "prompt",
        [
          "subagent fn step(objective: string) { objective }",
          'let r = step("go")',
          "r",
        ].join("\n"),
      ),
    );
    expect(
      isSubagentFn(fnNamed(doc.body, "step")),
      "FN-8: the subagent fn is recognised inside a prompt-mode theta",
    ).toBe(true);
    expect(
      doc.diagnostics.map((d) => d.code),
      "FN-8: the prompt → subagent direction is safe — theta/load/prompt-mode-callable must not fire",
    ).not.toContain("theta/load/prompt-mode-callable");
  });
});

// ===========================================================================
// CEILING — a chain of subagent fn / invoke frames trips the depth-32 ceiling
// ===========================================================================

describe("RFC-0001 subagent-fn — countable under the depth-32 invoke ceiling (FN-6/INV-4, reuse-contract guard)", () => {
  // REUSE-CONTRACT GUARD: INV-4 (as amended by RFC 0001) makes a `subagent fn`
  // call a countable frame under the shared per-chain depth counter, mixed with
  // direct `invoke(...)` and `.theta`/`.thetalib` frames. This pins the ceiling
  // contract the executor's subagent-fn dispatch must push through — a chain that
  // reaches 33 trips `theta/runtime/invoke-depth-exceeded`, exactly as the
  // existing depth tests assert. (`CountableFrameKind` does not yet enumerate a
  // subagent-fn variant; the implementer must classify a subagent fn call as a
  // countable frame — a documented obligation.)
  it("theta/runtime/invoke-depth-exceeded: a chain of 32 subagent-fn / invoke frames trips at the 33rd", () => {
    // Model a chain mixing subagent-fn frames (stood in by `direct-invoke`, since
    // every countable class contributes exactly +1 to the one shared counter)
    // with real invoke frames.
    const kinds: readonly CountableFrameKind[] = ["direct-invoke", "theta-tools-callable"];
    let chain = newInvokeChain();
    expect(chain.depth, "INV-4: the slash-invoked top-level theta is depth 0").toBe(0);
    for (let i = 0; i < INVOKE_DEPTH_CAP; i += 1) {
      chain = pushCountableFrame(chain, kinds[i % kinds.length] as CountableFrameKind);
      expect(chain.depth, `INV-4: countable frame ${i + 1} brings the shared counter to ${i + 1}`).toBe(
        i + 1,
      );
    }
    let raised: unknown;
    try {
      pushCountableFrame(chain, "direct-invoke");
    } catch (e) {
      raised = e;
    }
    expect(
      raised,
      "INV-4/FN-6: pushing the 33rd frame (a subagent fn call) trips InvokeDepthExceededPanic",
    ).toBeInstanceOf(InvokeDepthExceededPanic);
    expect((raised as InvokeDepthExceededPanic).code).toBe(INVOKE_DEPTH_EXCEEDED_CODE);
  });
});

// ===========================================================================
// RUNTIME harness — drive `executeBody` over real `subagent fn` source
// ===========================================================================
//
// These tests parse a real `subagent fn` source, then execute the parsed body
// through the tree-walking driver `executeBody`. Today the `subagent` modifier
// mis-parses to a free identifier and the `fn` is an ordinary intra-file
// function: `evalUserFnCall` runs the body INLINE against the SAME `deps`/`host`
// (the caller's conversation), never spawning a fresh session and never crossing
// the invoke boundary; every runtime assertion below reds on that absence.
// Post-implementation the executor detects `fn.subagent === true`, spawns a
// fresh isolated session, routes the body's `@` queries against it, validates
// and returns the final value across the subagent boundary, and discards the
// session on return.
//
// REQUIRED RUNTIME HOOK (documented for the implementer): on a `subagent fn` call
// the executor MUST spawn a fresh session for the body. The observation below is
// through a `SubagentSessionHost` that extends `StatementEvalHost` with two
// additive methods the executor is obliged to call around a subagent fn body:
//
//   spawnSubagentSession(config): string   // enter a fresh isolated session,
//                                           // returning its id; records config
//   exitSubagentSession(): void            // discard it on return
//
// and tags every checkpointed effect (`@` query / call) with the currently-active
// session id. It stays inert (all effects tagged with the root "caller" session,
// zero spawns) until the executor routes subagent fn bodies through it.

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

/** An `Ok(value)` operation result. */
function ok(value: ThetaValue): OperationResult {
  return { ok: true, value };
}

/** An `Err(error)` operation result. */
function errResult(error: QueryError): OperationResult {
  return { ok: false, error };
}

/** The id the executor is expected to use for the enclosing theta's own conversation. */
const CALLER_SESSION = "caller";

/** A session config the spawned subagent session is expected to carry (FN-7). */
interface SessionConfig {
  readonly tools?: readonly string[];
  readonly system?: string;
  readonly model?: string;
}

/**
 * The additive session-switch surface the executor must drive around a
 * `subagent fn` body (documented obligation — absent from `StatementEvalHost`
 * today).
 */
interface SubagentSessionHost extends StatementEvalHost {
  spawnSubagentSession(config: SessionConfig): string;
  exitSubagentSession(): void;
}

/**
 * A `StatementEvalHost` that records the session each checkpointed effect runs
 * against, and every spawned subagent session's config. It evaluates the bounded
 * pure forms a subagent fn body needs against the real per-call environment and
 * treats `@` query / `call` / `invoke` as checkpointed effects routed through
 * `runEffect`, tagging each with the currently-active session.
 */
class SubagentFnHost implements SubagentSessionHost {
  /** The active session stack; the enclosing theta's conversation is the root. */
  readonly sessionStack: string[] = [CALLER_SESSION];
  /** Every spawned subagent session, in spawn order (FN-6 isolation, FN-7 config). */
  readonly spawnedSessions: Array<{ id: string; config: SessionConfig }> = [];
  /** Every checkpointed effect, tagged by the session active when it ran. */
  readonly effects: Array<{ session: string; kind: string }> = [];
  #nextSession = 0;

  /** Per-callee-name effect outcome override (keyed by call callee / "query"). */
  readonly results = new Map<string, OperationResult>();
  /** Callee names whose effect throws a real `ThetaPanic`. */
  readonly panics = new Set<string>();

  get currentSession(): string {
    return this.sessionStack[this.sessionStack.length - 1] as string;
  }

  spawnSubagentSession(config: SessionConfig): string {
    this.#nextSession += 1;
    const id = `subagent-${this.#nextSession}`;
    this.spawnedSessions.push({ id, config });
    this.sessionStack.push(id);
    return id;
  }

  exitSubagentSession(): void {
    if (this.sessionStack.length > 1) {
      this.sessionStack.pop();
    }
  }

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    return this.#eval(expr, env);
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: { file: "test.theta", line: 1, column: 1 } };
    }
    return null;
  }

  async runEffect(expr: Expr, env: LexicalEnvironment): Promise<OperationResult> {
    const key = this.#calleeKey(expr, env);
    this.effects.push({ session: this.currentSession, kind: expr.kind });
    if (this.panics.has(key)) {
      throw new IndexOutOfBoundsPanic(`subagent fn body panicked at ${key}`);
    }
    return this.results.get(key) ?? ok(null);
  }

  #calleeKey(expr: Expr, env: LexicalEnvironment): string {
    if (expr.kind === "query") {
      return "query";
    }
    if (expr.kind === "call") {
      return (expr as unknown as { callee: string }).callee;
    }
    if (expr.kind === "invoke") {
      const first = (expr as unknown as { args: Expr[] }).args[0];
      return first === undefined ? "invoke" : String(this.#eval(first, env));
    }
    return expr.kind;
  }

  #eval(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "number":
        return Number((expr as unknown as { text: string }).text);
      case "string":
        return (expr as unknown as { value: string }).value;
      case "bool":
        return (expr as unknown as { value: boolean }).value;
      case "null":
        return null;
      case "ident": {
        const r = env.resolve((expr as unknown as { name: string }).name);
        return "value" in r ? (((r as { value?: ThetaValue }).value ?? null) as ThetaValue) : null;
      }
      case "array":
        return (expr as unknown as { elements: Expr[] }).elements.map((e) =>
          this.#eval(e, env),
        );
      case "binary": {
        const b = expr as unknown as { op: string; left: Expr; right: Expr };
        const l = this.#eval(b.left, env);
        const rr = this.#eval(b.right, env);
        if (b.op === "+") {
          return (l as number) + (rr as number);
        }
        return null;
      }
      default:
        return null;
    }
  }
}

function execDeps(body: ThetaBody, host: StatementEvalHost): ExecuteBodyDeps {
  return {
    env: buildEnvironment({ body }),
    host,
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new NoopMutator(),
    mode: "prompt",
    file: "test.theta",
  };
}

/** Parse `src` and return its body (for execution). */
function bodyOf(src: string): ThetaBody {
  return parse(src).body;
}

// ===========================================================================
// RUNTIME — FN-6 isolation: a call spawns a FRESH isolated session
// ===========================================================================

describe("RFC-0001 subagent-fn — a call spawns a fresh isolated session (FN-6)", () => {
  it("FN-6: calling a subagent fn spawns exactly one fresh session; the body's `@` queries target it, NOT the caller's conversation (RED — feature absent)", async () => {
    const host = new SubagentFnHost();
    const body = bodyOf(
      [
        "subagent fn step(objective: string) {",
        "  let r = @`Objective: ${objective}. Report status.`?",
        "  r",
        "}",
        'step("build the thing")',
      ].join("\n"),
    );
    await executeBody(body, execDeps(body, host));

    expect(
      host.spawnedSessions.length,
      "FN-6: one call to a subagent fn spawns exactly one fresh isolated session",
    ).toBe(1);
    const queries = host.effects.filter((e) => e.kind === "query");
    expect(queries.length, "the body issued one `@` query").toBeGreaterThan(0);
    expect(
      queries.every((q) => q.session !== CALLER_SESSION),
      "FN-6: the body's `@` queries target the spawned session, not the caller's conversation",
    ).toBe(true);
    expect(
      host.effects.filter((e) => e.session === CALLER_SESSION).length,
      "FN-6: the caller's conversation is unpolluted — no body effect ran against it",
    ).toBe(0);
  });
});

// ===========================================================================
// RUNTIME — FN-7 session config: inherit by default; `with` overrides per key
// ===========================================================================

describe("RFC-0001 subagent-fn — session config inheritance and `with` override (FN-7)", () => {
  it("FN-7: with NO `with` clause the spawned session inherits the enclosing theta's config (RED — feature absent)", async () => {
    const host = new SubagentFnHost();
    const body = bodyOf(
      [
        "---",
        "mode: subagent",
        'model: "sonnet"',
        "tools:",
        "  - read",
        "  - bash",
        "---",
        "subagent fn step(o: string) { @`do ${o}`? }",
        'step("x")',
      ].join("\n"),
    );
    await executeBody(body, execDeps(body, host));

    expect(
      host.spawnedSessions.length,
      "FN-7: an unconfigured subagent fn still spawns a session",
    ).toBe(1);
    const config = host.spawnedSessions[0]?.config;
    expect(
      config?.model,
      "FN-7: with no `with` clause the spawned session inherits the enclosing theta's model",
    ).toBe("sonnet");
    expect(
      config?.tools,
      "FN-7: with no `with` clause the spawned session inherits the enclosing theta's tools (callable set)",
    ).toEqual(["read", "bash"]);
  });

  it("FN-7: `with { … }` overrides only the named keys; omitted keys still inherit (RED — feature absent)", async () => {
    const host = new SubagentFnHost();
    const body = bodyOf(
      [
        "---",
        "mode: subagent",
        'model: "sonnet"',
        "tools:",
        "  - read",
        "  - bash",
        "---",
        "subagent fn step(o: string) with { tools: [read] } { @`do ${o}`? }",
        'step("x")',
      ].join("\n"),
    );
    await executeBody(body, execDeps(body, host));

    const config = host.spawnedSessions[0]?.config;
    expect(
      config?.tools,
      "FN-7: `with { tools: [read] }` replaces the inherited tools with only `read`",
    ).toEqual(["read"]);
    expect(
      config?.model,
      "FN-7: a key omitted from `with` (model) still inherits from the enclosing theta",
    ).toBe("sonnet");
  });
});

// ===========================================================================
// RUNTIME — FN-6 arguments cross by value; no closure capture
// ===========================================================================

describe("RFC-0001 subagent-fn — arguments cross by value, no closure capture (FN-6)", () => {
  it("FN-6: positional arguments cross by value into the body", async () => {
    const host = new SubagentFnHost();
    const body = bodyOf("subagent fn echo(x: integer) { x }\necho(42)");
    expect(
      isSubagentFn(fnNamed(body, "echo")),
      "FN-6: this test anchors subagent-fn recognition — `echo` must be dispatched as a subagent fn, not the plain-fn path",
    ).toBe(true);
    const exec = await executeBody(body, execDeps(body, host));
    expect(exec.result.present, "the subagent fn call yields a final value").toBe(true);
    expect(
      exec.result.value,
      "FN-6: the positional argument `42` crosses by value and is the body's tail value",
    ).toBe(42);
  });

  it("FN-6: there is NO lexical capture of the enclosing scope — an enclosing binding is not visible in the body (RED — feature absent)", async () => {
    // FN-6: functions are not first-class and closures do not exist; only the
    // positional arguments cross the session boundary. An enclosing `let secret`
    // must NOT resolve inside the body. Today the inline `fn` runs against a child
    // of the caller scope, so `secret` is (wrongly) captured and returned.
    const host = new SubagentFnHost();
    const body = bodyOf(
      ["let secret = 99", "subagent fn leak(x: integer) { secret }", "leak(1)"].join(
        "\n",
      ),
    );
    const exec = await executeBody(body, execDeps(body, host));
    expect(
      exec.result.value,
      "FN-6: the enclosing `secret` must not be captured across the session boundary (no closure)",
    ).not.toBe(99);
  });
});

// ===========================================================================
// RUNTIME — FN-6 final-value propagation: Ok / callee Err / panic
// ===========================================================================

describe("RFC-0001 subagent-fn — final-value propagation across the boundary (FN-6, like invoke)", () => {
  it("FN-6: on success the final value crosses the boundary as the Ok payload", async () => {
    const host = new SubagentFnHost();
    const body = bodyOf(
      "subagent fn step(o: string) { o }\nstep(\"done\")",
    );
    expect(
      isSubagentFn(fnNamed(body, "step")),
      "FN-6: this test anchors subagent-fn recognition — `step` must be dispatched as a subagent fn, not the plain-fn path",
    ).toBe(true);
    const exec = await executeBody(body, execDeps(body, host));
    expect(exec.outcome, "FN-6: a successful subagent fn call yields the success outcome").toBe(
      "success",
    );
    expect(
      exec.result.value,
      "FN-6: the callee's final value crosses the subagent boundary as the Ok payload",
    ).toBe("done");
  });

  it("FN-6: a callee `Err` surfaces to the caller as InvokeCalleeError, exactly like invoke (RED — feature absent)", async () => {
    // FN-6/invocation §Failures: a `subagent fn` crosses the same boundary as an
    // `invoke`d subagent-mode callee — a callee-returned `Err` reaches the parent
    // wrapped as `InvokeCalleeError { kind: "invoke_callee", inner: <raw Err> }`.
    // Today the inline `fn`'s `?` propagates the RAW query error unwrapped.
    const host = new SubagentFnHost();
    const failure: QueryError = {
      kind: "validation",
      cause: "schema_validation",
      message: "callee failed",
      attempts: 0,
      validation_errors: [],
      raw_response: null,
    };
    host.results.set("probe", errResult(failure));
    // Bug 0003: `probe` dispatches on the executor's Pi-tool path, so its
    // argument must be the inline object-literal shape — a whole-ident
    // `probe(x)` is now a PiToolArgShapeDefectError, not a scripted Err.
    const body = bodyOf(
      [
        "subagent fn worker(x: integer) {",
        "  let v = probe({ v: x })?",
        "  v",
        "}",
        "worker(1)",
      ].join("\n"),
    );
    const exec = await executeBody(body, execDeps(body, host));

    expect(
      isResultValue(exec.result.value as ThetaValue),
      "FN-6: the failing subagent fn call yields a Result value",
    ).toBe(true);
    const value = exec.result.value as { ok: boolean; error?: QueryError };
    expect(value.ok, "FN-6: the boundary result is an Err").toBe(false);
    expect(
      value.error?.kind,
      "FN-6: a callee Err surfaces as InvokeCalleeError (kind 'invoke_callee'), not the raw callee error kind",
    ).toBe("invoke_callee");
  });

  it("FN-6: a panic in the body surfaces to the caller as InvokeInfraError(cause: 'panic'), never crashing the caller (RED — feature absent)", async () => {
    // FN-6/invocation §Failures: a panic inside the spawned session is downgraded
    // at the subagent boundary to the parent's `InvokeInfraError { cause:
    // "panic" }`, exactly as for an `invoke`d subagent callee — it must NOT
    // propagate as an uncaught throw out of the caller.
    const host = new SubagentFnHost();
    host.panics.add("boom");
    // Bug 0003: inline object-literal argument shape (see the callee-Err test
    // above) — the panic must come from the host's scripted effect, not from
    // the executor's arg-shape defect throw.
    const body = bodyOf(
      [
        "subagent fn worker(x: integer) {",
        "  let v = boom({ v: x })?",
        "  v",
        "}",
        "worker(1)",
      ].join("\n"),
    );

    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch {
      threw = true;
    }
    expect(
      threw,
      "FN-6: a panic inside a subagent fn body must NOT crash the caller — the subagent boundary downgrades it",
    ).toBe(false);

    const value = exec?.result.value as { ok?: boolean; error?: QueryError } | undefined;
    expect(
      isResultValue(exec?.result.value as ThetaValue),
      "FN-6: the panicking subagent fn call yields a Result value at the boundary",
    ).toBe(true);
    expect(value?.ok, "FN-6: the boundary result is an Err").toBe(false);
    expect(
      value?.error?.kind,
      "FN-6: a body panic surfaces as InvokeInfraError (kind 'invoke_infra')",
    ).toBe("invoke_infra");
    expect(
      (value?.error as { cause?: string } | undefined)?.cause,
      "FN-6: the InvokeInfraError carries cause 'panic'",
    ).toBe("panic");
  });
});

// ===========================================================================
// LIBRARY — `.thetalib` subagent fn (FN-9)
// ===========================================================================

describe("RFC-0001 subagent-fn — `.thetalib` library helpers (FN-9)", () => {
  it("FN-9 / imports.md: a `subagent fn` is admissible in a `.thetalib` file (RED — feature absent)", () => {
    const doc = parse(
      "subagent fn helper(o: string) { @`do ${o}`? }",
      "shared/util.thetalib",
    );
    expect(
      isSubagentFn(fnNamed(doc.body, "helper")),
      "FN-9: the `subagent` modifier is admissible on a `.thetalib` `fn`, giving a shared isolated helper",
    ).toBe(true);
  });

  it("FN-9 / imports.md: a `.thetalib` subagent fn accepts a `with { tools: [...] }` clause (resolved against the CALLING theta's callable set) (RED — feature absent)", () => {
    // FN-9: a `.thetalib` carries no frontmatter `tools:` of its own, so tool
    // names in a library helper's `with` clause resolve against the CALLING
    // theta's callable set. The parse-level obligation asserted here is that the
    // clause is admissible on a `.thetalib` `fn`; the calling-theta resolution is
    // a composition-layer runtime obligation (see the handoff notes).
    const doc = parse(
      "subagent fn helper(o: string) with { tools: [read] } { @`do ${o}`? }",
      "shared/util.thetalib",
    );
    const node = fnNamed(doc.body, "helper");
    expect(isSubagentFn(node), "FN-9: the `.thetalib` helper is a subagent fn").toBe(true);
    expect(
      withClauseKeys(node),
      "FN-9: the `with { tools: [...] }` clause is captured on the `.thetalib` helper",
    ).toEqual(["tools"]);
  });
});

// ===========================================================================
// FN-7 — resolved session config completeness (all five keys take effect)
// ===========================================================================
//
// Drives the PARSE-TIME resolution the runtime reads: `parseThetaDocument`
// attaches a resolved `sessionConfig` to every top-level `subagent fn`
// (inherit-then-`with`-override). This is the offline seam for the FN-7
// obligation that ALL FIVE `with` keys take effect — earlier the config only
// carried model/tools/system and a validated `with { tool_loop }` /
// `with { respond_repair }` was parsed then silently dropped.

/** The resolved `sessionConfig` attached to the named `subagent fn`, or undefined. */
function sessionConfigOf(
  body: ThetaBody,
  name: string,
): SubagentSessionConfig | undefined {
  const node = fnNamed(body, name) as unknown as FnDecl | undefined;
  return node?.sessionConfig;
}

describe("RFC-0001 subagent-fn — resolved session config carries all five FN-7 keys", () => {
  it("FN-7: a `with { tool_loop, respond_repair }` override is CARRIED onto the resolved config (not dropped)", () => {
    const doc = parse(
      [
        "subagent fn step(o: string) with {",
        "  tool_loop: { max_rounds: 4 },",
        '  respond_repair: { attempts: 2 }',
        "} { o }",
      ].join("\n"),
    );
    const config = sessionConfigOf(doc.body, "step");
    expect(config, "the subagent fn carries a resolved session config").toBeDefined();
    expect(
      config?.toolLoop?.maxRounds,
      "FN-7: `with { tool_loop: { max_rounds: 4 } }` takes effect on the resolved config",
    ).toBe(4);
    expect(
      config?.respondRepair?.attempts,
      "FN-7: `with { respond_repair: { attempts: 2 } }` takes effect on the resolved config",
    ).toBe(2);
  });

  it("FN-7: with no `with` clause the resolved config INHERITS the enclosing theta's tool_loop / respond_repair", () => {
    const doc = parse(
      [
        "---",
        "mode: subagent",
        "tool_loop:",
        "  max_rounds: 7",
        "respond_repair:",
        "  attempts: 5",
        "---",
        "subagent fn step(o: string) { @`do ${o}`? }",
      ].join("\n"),
    );
    const config = sessionConfigOf(doc.body, "step");
    expect(
      config?.toolLoop?.maxRounds,
      "FN-7: an unconfigured subagent fn inherits the enclosing theta's tool_loop",
    ).toBe(7);
    expect(
      config?.respondRepair?.attempts,
      "FN-7: an unconfigured subagent fn inherits the enclosing theta's respond_repair",
    ).toBe(5);
  });

  it("FN-7: `with { tools: [...] }` marks the config as tools-overridden; inheritance does NOT", () => {
    const overridden = sessionConfigOf(
      parse("subagent fn a(o: string) with { tools: [read] } { o }").body,
      "a",
    );
    expect(
      overridden?.toolsOverridden,
      "FN-7/FN-9: an explicit `with { tools }` flags the override so the spawn narrows the calling callable set",
    ).toBe(true);
    const inherited = sessionConfigOf(
      parse(
        ["---", "mode: subagent", "tools:", "  - read", "---", "subagent fn a(o: string) { o }"].join("\n"),
      ).body,
      "a",
    );
    expect(
      inherited?.toolsOverridden,
      "FN-7: with no `with { tools }` the spawn inherits the calling theta's full callable set",
    ).not.toBe(true);
  });
});

// ===========================================================================
// FN-9 — `.thetalib` inheritance resolves against the CALLING theta at dispatch
// ===========================================================================
//
// A `.thetalib` helper is parsed with a `null` frontmatter, so its parse-time
// config carries only its own `with`-clause overrides. `resolveSubagentSessionConfigAt`
// re-resolves it against the CALLING theta's frontmatter at dispatch — the
// offline seam for the FN-9 "inheritance resolves against the calling theta"
// obligation.

const CALLING_FRONTMATTER: ParsedFrontmatter = {
  mode: "subagent",
  model: "sonnet",
  tools: ["read", "bash"],
  toolLoop: { maxRounds: 9 },
  respondRepair: { attempts: 6 },
};

describe("RFC-0001 subagent-fn — `.thetalib` helper inherits the CALLING theta's config (FN-9)", () => {
  it("FN-9: a `.thetalib` subagent fn with no `with` clause inherits the CALLING theta's model / tools / tool_loop / respond_repair", () => {
    const doc = parse(
      "subagent fn helper(o: string) { @`do ${o}`? }",
      "shared/util.thetalib",
    );
    const helper = fnNamed(doc.body, "helper") as unknown as FnDecl;
    const resolved = resolveSubagentSessionConfigAt(helper, CALLING_FRONTMATTER);
    expect(resolved.model, "FN-9: inherits the calling theta's model").toBe("sonnet");
    expect(resolved.tools, "FN-9: inherits the calling theta's tools").toEqual([
      "read",
      "bash",
    ]);
    expect(
      resolved.toolLoop?.maxRounds,
      "FN-9: inherits the calling theta's tool_loop",
    ).toBe(9);
    expect(
      resolved.respondRepair?.attempts,
      "FN-9: inherits the calling theta's respond_repair",
    ).toBe(6);
  });

  it("FN-9: a `.thetalib` helper's `with { tools: [read] }` narrows against the CALLING theta's callable set", () => {
    const doc = parse(
      "subagent fn helper(o: string) with { tools: [read] } { @`do ${o}`? }",
      "shared/util.thetalib",
    );
    const helper = fnNamed(doc.body, "helper") as unknown as FnDecl;
    const resolved = resolveSubagentSessionConfigAt(helper, CALLING_FRONTMATTER);
    expect(
      resolved.tools,
      "FN-9: `with { tools: [read] }` narrows to the named subset of the calling callable set",
    ).toEqual(["read"]);
    expect(
      resolved.toolsOverridden,
      "FN-9: the override is flagged so the spawn narrows the calling callable set",
    ).toBe(true);
    expect(
      resolved.model,
      "FN-9: a key omitted from `with` still inherits the calling theta (model)",
    ).toBe("sonnet");
  });
});

// ===========================================================================
// LOAD (composition seam) — self-reference cycle + broken inline body (FN-6)
// ===========================================================================
//
// Drives the composition-layer static-check the production compose pass runs
// (`checkSubagentFnStaticResolution`) — the offline seam for the two FN-6
// load-time obligations the reuse-contract guards above pinned against the raw
// detectors: a self-referencing `subagent fn` un-registers via a length-1
// `theta/load/invocation-cycle`, and a broken inline body un-registers via
// `theta/load/callee-has-errors` naming the FUNCTION.

describe("RFC-0001 subagent-fn — load-time static checks (FN-6, composition seam)", () => {
  it("collectSubagentFns: only top-level `subagent fn`s are collected (a plain fn is not)", () => {
    const body = bodyOf(
      [
        "subagent fn a(o: string) { o }",
        "fn b(o: string) { o }",
        'a("x")',
      ].join("\n"),
    );
    expect(
      collectSubagentFns(body).map((f) => f.name),
      "only the `subagent fn` is collected",
    ).toEqual(["a"]);
  });

  it("theta/load/invocation-cycle: a `subagent fn` that calls itself is a length-1 cycle that un-registers the theta", () => {
    const body = bodyOf(
      [
        "subagent fn step(o: string) {",
        "  let r = step(o)?",
        "  r",
        "}",
        'step("x")',
      ].join("\n"),
    );
    const diags = checkSubagentFnStaticResolution({
      body,
      file: "test.theta",
      parseDiagnostics: [],
    });
    const cycle = diags.find((d) => d.code === INVOCATION_CYCLE_CODE);
    expect(cycle, "FN-6: a self-referencing subagent fn surfaces the invocation-cycle code").toBeDefined();
    expect(cycle?.message).toBe(invocationCycleMessage(["step", "step"]));
    expect(
      cycle?.severity,
      "FN-6: the cycle is error-severity so the enclosing theta un-registers",
    ).toBe("error");
  });

  it("theta/load/invocation-cycle: a mutual `a → b → a` cycle between two subagent fns fires", () => {
    const body = bodyOf(
      [
        "subagent fn a(o: string) { let r = b(o)?\n  r }",
        "subagent fn b(o: string) { let r = a(o)?\n  r }",
        'a("x")',
      ].join("\n"),
    );
    const diags = checkSubagentFnStaticResolution({
      body,
      file: "test.theta",
      parseDiagnostics: [],
    });
    expect(
      diags.some((d) => d.code === INVOCATION_CYCLE_CODE),
      "FN-6: a mutual subagent-fn cycle fires the invocation-cycle code",
    ).toBe(true);
  });

  it("no diagnostic: a `subagent fn` that calls a DIFFERENT (acyclic) subagent fn is clean", () => {
    const body = bodyOf(
      [
        "subagent fn leaf(o: string) { o }",
        "subagent fn root(o: string) { let r = leaf(o)?\n  r }",
        'root("x")',
      ].join("\n"),
    );
    const diags = checkSubagentFnStaticResolution({
      body,
      file: "test.theta",
      parseDiagnostics: [],
    });
    expect(diags, "an acyclic subagent-fn call graph produces no static diagnostic").toEqual(
      [],
    );
  });

  it("theta/load/callee-has-errors: a broken inline body names the FUNCTION (not a path) and un-registers", () => {
    // Model a parse error located inside the `subagent fn step` body span.
    const body = bodyOf("subagent fn step(o: string) { o }\nstep(\"x\")");
    const stepNode = fnNamed(body, "step") as unknown as FnDecl;
    const bodyError = {
      severity: "error" as const,
      code: "theta/parse/unexpected-token",
      file: "test.theta",
      range: {
        start: { line: stepNode.range.start.line, column: stepNode.range.start.column + 5 },
        end: { line: stepNode.range.start.line, column: stepNode.range.start.column + 6 },
      },
      message: "unexpected token",
    };
    const diags = checkSubagentFnStaticResolution({
      body,
      file: "test.theta",
      parseDiagnostics: [bodyError],
    });
    const d = diags.find((x) => x.code === CALLEE_HAS_ERRORS_CODE);
    expect(d, "FN-6: a broken inline body surfaces callee-has-errors").toBeDefined();
    expect(d?.message, "FN-6: the inline case names the function `step`").toBe(
      calleeHasErrorsMessage("step"),
    );
    expect(
      d?.message.includes("/") || d?.message.includes(".theta"),
      "FN-6: the inline callee is a function name, not a path",
    ).toBe(false);
    expect(
      d?.severity,
      "FN-6: a broken inline body is error-severity so the enclosing theta un-registers",
    ).toBe("error");
  });
});

// ===========================================================================
// RUNTIME — nested subagent-fn depth ACCUMULATES and trips at the 33rd frame
// ===========================================================================
//
// Regression witness for the INV-4 / FN-6 runtime backstop against unbounded
// `subagent fn` recursion. The bug this pins: `createEffectfulStatementHost`'s
// `spawnSubagentSession` used to call a FIXED `baseDeps.spawnSubagentFnSession`
// closure bound to the ORIGINAL chain, so every nested spawn pushed onto that
// one chain → constant depth 1, never climbing, and the depth-32 ceiling was
// unreachable. The fix routes each nested spawn through `active()` — the
// currently-deepest session's seam — whose `spawnSubagentFnSession` is bound to
// that session's chain-advanced `childChain` (production-theta-producer.ts
// `#spawnSubagentFnSession` → `spawnSubagentConversation({ chain: childChain })`).
//
// This drives the REAL `createEffectfulStatementHost` (not the hand-rolled
// `SubagentFnHost` above) against a chain-threading double that FAITHFULLY
// models `#spawnSubagentFnSession`'s child-chain advance: each spawn pushes a
// countable `subagent-fn` frame via the production `pushCountableFrame` and
// returns a session whose `deps.spawnSubagentFnSession` is bound to the ADVANCED
// child chain. The accumulation is therefore NOT faked — it is the same
// primitive the producer uses; a breach at the cap raises the production
// `InvokeDepthExceededPanic`. With the pre-fix fixed-closure the loop below would
// never trip (every push stays at depth 1), so this test reds without the fix.

/**
 * A chain-threading `EffectfulStatementHostDeps` double faithfully modelling the
 * production `#spawnSubagentFnSession` child-chain advance. Effect resolvers are
 * unexercised (the test drives only `spawnSubagentSession`); the spawn seam
 * pushes a real countable `subagent-fn` frame and hands back a session bound to
 * the advanced child chain, so a nested spawn (routed through `active()`) climbs.
 */
function chainThreadingDeps(chain: InvokeChain): EffectfulStatementHostDeps {
  const unused = (): never => {
    throw new Error("effect resolver not exercised by the depth-accumulation test");
  };
  return {
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    sink: { emit: (): void => {} } as unknown as ToolLoweringSink,
    file: "test.theta",
    evaluatePure: (): ThetaValue => null,
    resolveQuery: unused,
    resolveToolCall: unused,
    resolveInvoke: unused,
    spawnSubagentFnSession: (): SubagentFnSession => {
      // Faithful model: push a countable `subagent-fn` frame on THIS session's
      // chain (raises InvokeDepthExceededPanic at the cap exactly as the
      // producer does), and bind the child session's own spawn seam to the
      // advanced chain so recursion climbs.
      const childChain = pushCountableFrame(chain, "subagent-fn");
      return { deps: chainThreadingDeps(childChain), dispose: (): void => {} };
    },
  };
}

describe("RFC-0001 subagent-fn — nested depth ACCUMULATES and trips at the 33rd frame (INV-4/FN-6)", () => {
  it("a nested subagent-fn spawn climbs the shared chain and the 33rd push trips invoke-depth-exceeded, downgraded to InvokeInfraError{panic}", async () => {
    const host = createEffectfulStatementHost(chainThreadingDeps(newInvokeChain()));
    const spawn = (
      host as unknown as { spawnSubagentSession(config: SessionConfig): Promise<string> }
    ).spawnSubagentSession.bind(host);

    // INVOKE_DEPTH_CAP (32) nested spawns succeed — each routes through the
    // deepest session's chain-advanced seam, so depth climbs 1 … 32. A fixed
    // base-chain closure (the bug) would pin every push at depth 1 and never
    // reach here.
    for (let i = 1; i <= INVOKE_DEPTH_CAP; i += 1) {
      await spawn({});
    }

    let raised: unknown;
    try {
      await spawn({});
    } catch (error) {
      raised = error;
    }
    expect(
      raised,
      "INV-4/FN-6: the 33rd nested subagent-fn spawn trips the depth ceiling (proves depth CLIMBED across nested sessions)",
    ).toBeInstanceOf(InvokeDepthExceededPanic);
    expect((raised as InvokeDepthExceededPanic).code).toBe(INVOKE_DEPTH_EXCEEDED_CODE);

    // The executor's subagent boundary downgrades that panic to the caller's
    // `Err(InvokeInfraError{cause:"panic"})` — the runtime backstop surface.
    const surface = surfaceDepthOverflow(raised as InvokeDepthExceededPanic, {
      topLevel: false,
      calleePath: "subagent-fn",
    });
    if (surface.mode !== "nested") {
      throw new Error("a nested overflow must surface the nested InvokeInfraError arm");
    }
    expect(surface.error.kind, "nested overflow → invoke_infra").toBe("invoke_infra");
    expect(surface.error.cause, "the backstop downgrades the depth panic with cause 'panic'").toBe(
      "panic",
    );
  });
});

// ===========================================================================
// LOAD — a `.thetalib` self-recursive subagent fn is cycle-checked at import
// ===========================================================================
//
// Regression witness for the import-boundary FN-6 gap: `checkSubagentFnStaticResolution`
// used to run only over the COMPOSING theta's own top-level `subagent fn`s, so a
// self-recursive `subagent fn` declared in an imported `.thetalib` escaped the
// cycle check and would recurse without bound at runtime. `checkThetaImports`
// now runs the same check over every parsed `.thetalib` body.

/**
 * A minimal in-memory `FileSystem` exposing only the `readdir` / `readBytes`
 * members `checkThetaImports` reads; every other member rejects (unexercised).
 */
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const name = path.slice(slash + 1);
    const entries = dirs.get(parent) ?? [];
    entries.push(name);
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  };
}

describe("RFC-0001 subagent-fn — `.thetalib` self/mutual recursion is load-rejected (FN-6, import boundary)", () => {
  it("theta/load/invocation-cycle: a self-recursive `subagent fn` defined in an imported `.thetalib` un-registers the importing theta", async () => {
    const importing = parse(
      ['---', 'model: "sonnet"', '---', 'import { r } from "./shared/lib.thetalib"'].join("\n"),
      "/proj/app.theta",
    );
    const input: ThetaCompositionInput = {
      slashName: "app",
      sourcePath: "/proj/app.theta",
      frontmatter: importing.frontmatter as ParsedFrontmatter,
      body: importing.body,
    };
    const fs = fakeThetaLibFs({
      "/proj/shared/lib.thetalib": "subagent fn r(x: string) { let y = r(x)?\n  y }",
    });
    const result = await checkThetaImports(input, { fs, parseDeps: makeDeps() });
    const cycle = result.diagnostics.find((d) => d.code === INVOCATION_CYCLE_CODE);
    expect(
      cycle,
      "FN-6: a `.thetalib` self-recursive subagent fn is cycle-checked at import and surfaces invocation-cycle",
    ).toBeDefined();
    expect(cycle?.message).toBe(invocationCycleMessage(["r", "r"]));
    expect(
      cycle?.severity,
      "FN-6: the import-boundary cycle is error-severity so the importing theta un-registers",
    ).toBe("error");
  });

  it("no diagnostic: an acyclic `.thetalib` subagent fn imported cleanly produces no invocation-cycle", async () => {
    const importing = parse(
      ['---', 'model: "sonnet"', '---', 'import { helper } from "./shared/lib.thetalib"'].join("\n"),
      "/proj/app.theta",
    );
    const input: ThetaCompositionInput = {
      slashName: "app",
      sourcePath: "/proj/app.theta",
      frontmatter: importing.frontmatter as ParsedFrontmatter,
      body: importing.body,
    };
    const fs = fakeThetaLibFs({
      "/proj/shared/lib.thetalib": "subagent fn helper(x: string) { x }",
    });
    const result = await checkThetaImports(input, { fs, parseDeps: makeDeps() });
    expect(
      result.diagnostics.some((d) => d.code === INVOCATION_CYCLE_CODE),
      "an acyclic imported subagent fn produces no invocation-cycle",
    ).toBe(false);
  });
});

// ===========================================================================
// LOAD — an unresolvable `with { model }` override emits the load diagnostic
// ===========================================================================
//
// Regression witness for the silent model-override fallback: an unresolvable
// `with { model }` used to fall back to the inherited session model at runtime,
// masking the bad reference. Frontmatter `model:` is validated at LOAD
// (`theta/load/model-unresolved`); `checkSubagentFnModelOverrides` now holds a
// `with { model }` override to the same bar.

describe("RFC-0001 subagent-fn — unresolvable `with { model }` override is load-rejected (FN-7)", () => {
  const matcher: ModelReferenceMatcher = {
    resolve: (reference): "resolved" | "no-match" =>
      reference === "sonnet" ? "resolved" : "no-match",
  };

  it("theta/load/model-unresolved: `with { model: <unresolvable> }` emits the same diagnostic frontmatter `model:` does", () => {
    const body = bodyOf('subagent fn step(o: string) with { model: "no-such/model" } { @`do ${o}`? }');
    const diags = checkSubagentFnModelOverrides(collectSubagentFns(body), "test.theta", matcher);
    const d = diags.find((x) => x.code === "theta/load/model-unresolved");
    expect(d, "FN-7: an unresolvable `with { model }` override surfaces model-unresolved at LOAD").toBeDefined();
    expect(
      d?.severity,
      "FN-7: the diagnostic is error-severity so the enclosing theta un-registers (no silent runtime fallback)",
    ).toBe("error");
  });

  it("no diagnostic: a resolvable `with { model }` override validates cleanly", () => {
    const body = bodyOf('subagent fn step(o: string) with { model: "sonnet" } { @`do ${o}`? }');
    const diags = checkSubagentFnModelOverrides(collectSubagentFns(body), "test.theta", matcher);
    expect(
      diags.some((d) => d.code === "theta/load/model-unresolved"),
      "a resolvable override produces no model-unresolved diagnostic",
    ).toBe(false);
  });

  it("no diagnostic: a `subagent fn` with NO `with { model }` override is not model-checked here (inherits the validated frontmatter model)", () => {
    const body = bodyOf('subagent fn step(o: string) with { tools: [read] } { @`do ${o}`? }');
    const diags = checkSubagentFnModelOverrides(collectSubagentFns(body), "test.theta", matcher);
    expect(diags, "no explicit model override ⇒ nothing to validate here").toEqual([]);
  });
});

// Import kept referenced so an unused-symbol lint does not trip on the HostFatal
// marker reserved for the documented NOCEIL-3 non-downgrade carve-out (asserted
// by the paired invoke suites; retained here for parity of the panic taxonomy).
void HostFatal;
