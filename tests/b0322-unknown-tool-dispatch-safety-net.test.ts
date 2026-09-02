import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { CallableSetSnapshot, ResolvedCallable } from "../src/parser/callable-set";
import type { CallExpr, Expr, ObjectExpr, ThetaBody } from "../src/parser/theta-document";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  DispatchLadderProbe,
  EncodedToolRequest,
  HostToolResult,
} from "../src/runtime/host-loop-dispatch";
import { executeBody } from "../src/runtime/statement-executor";
import { codeToolErrorCauses } from "../src/runtime/tool-call";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import type { ResultValue, ThetaValue } from "../src/runtime/value";
import type { RuntimeRoot } from "../src/runtime-root";
import type { RootRegime } from "../src/runtime/subagent-root-regime";
import type { Checkpoint } from "../src/seams/checkpoint";
import { AjvSchemaValidator, type LoweredSchema, type SchemaSlug } from "../src/seams/schema-validator";

// Bug 0322 — `CodeToolError.cause: "unknown_tool"` has no producer. The cause is
// a declared member of the closed `CodeToolCause` enum
// (src/runtime/query-error.ts:111) and part of the author contract
// (`codeToolErrorCauses()`, src/runtime/tool-call.ts:499–500), but no `src/`
// site mints it. The one runtime seam where a lost/absent callable can present
// at dispatch — `#resolveToolCall`'s regime-INACTIVE `tool === undefined` arm
// (src/extension/production-theta-producer.ts:3447–3484) — at the fork rejected
// with `UnknownHostToolError`, which the execute-throw catch path
// (src/runtime/tool-call-execute.ts:481) lowered via `lowerToolExecuteThrow`
// (:234) to the WRONG `cause: "execution"` (:243); the landed fix mints the
// `unknown_tool` carrier at the resolve-time decision (:3427) instead.
//
// SETTLED ROUTE = COMBINED / mint-at-the-seam (bug 0322 §Fix option 2): flip
// that regime-inactive arm to mint `Err(CodeToolError { cause: "unknown_tool",
// ... })` with the SAME message text. This file witnesses the flip.
//
// §Expected behaviour (option 2): "some input class must mint
// `Err(CodeToolError { cause: "unknown_tool", … })`, and the natural one is the
// dispatch-time snapshot miss the `tool === undefined` arm already isolates."
//
// HARNESS-ONLY-REACHABLE (bug 0322 §Sev/Diff, §Actual behaviour): a REGISTERED
// theta cannot reach this arm — parse rejects an out-of-scope callee and
// load-time admission freezes every `tools:` name into the snapshot. So these
// cells drive the REAL production resolver `#resolveToolCall`
// (src/extension/production-theta-producer.ts:3378) through
// `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
// over a hand-built callable-set snapshot that bypasses load admission — the
// same harness shape tests/tool-arg-runtime-schema-validation.test.ts uses. The
// snapshot deliberately does NOT hold the called name, so
// `#resolvePiToolForTheta` (:3660) returns `undefined`, `#classifyCall` (:3357)
// routes the non-`.theta` callee to "pi-tool", and dispatch reaches the arm.
//
// Version placeholder for the fix release: 0.346.0.

// ---------------------------------------------------------------------------
// Harness — mirrors tests/tool-arg-runtime-schema-validation.test.ts.
// ---------------------------------------------------------------------------

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function numExpr(n: number): Expr {
  return { kind: "number", text: String(n), numericType: "integer", range: span() };
}

function strExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

/** The single bare object-literal argument a code-driven Pi-tool call takes. */
function objArg(fields: Readonly<Record<string, Expr>>): ObjectExpr {
  return {
    kind: "object",
    typeName: null,
    fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
    range: span(),
  };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

function body(tail: Expr | null): ThetaBody {
  return { statements: [], tail };
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/**
 * A `RuntimeRoot` double exposing the members the code-side tool-call path
 * reads. `schemaValidator` is the REAL AJV-backed seam so a snapshot entry that
 * DOES carry a schema (case B's control) validates through the production
 * validator rather than a fake's.
 */
function rootDouble(): RuntimeRoot {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    checkpoint: NOOP_CHECKPOINT,
    schemaValidator: new AjvSchemaValidator({ emit: (): void => {}, slugOf }),
    idSource: {
      newInvocationId: () => "inv-1",
      newToolCallId: () => "tc-1",
    },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

interface ProducerOpts {
  readonly hostLoopDispatch?: (
    request: EncodedToolRequest,
    signal: AbortSignal,
  ) => Promise<HostToolResult>;
  readonly dispatchLadderProbe?: DispatchLadderProbe;
  readonly emitDiagnostic?: (diagnostic: Diagnostic) => void;
  readonly subagentRootRegime?: RootRegime;
}

function producer(opts: ProducerOpts) {
  return createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.hostLoopDispatch !== undefined ? { hostLoopDispatch: opts.hostLoopDispatch } : {}),
    ...(opts.dispatchLadderProbe !== undefined
      ? { dispatchLadderProbe: opts.dispatchLadderProbe }
      : {}),
    ...(opts.emitDiagnostic !== undefined ? { emitDiagnostic: opts.emitDiagnostic } : {}),
    ...(opts.subagentRootRegime !== undefined
      ? { subagentRootRegime: opts.subagentRootRegime }
      : {}),
  });
}

/** A frozen callable-set snapshot from `{ callableName -> entry }` pairs. */
function snapshot(entries: readonly (readonly [string, ResolvedCallable])[]): CallableSetSnapshot {
  return Object.freeze({ entries: new Map(entries) });
}

/** A prompt-mode theta whose tail is the code-side tool call under test. */
function thetaWithSet(tail: Expr, callableSet: CallableSetSnapshot): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" };
  return {
    slashName: "demo",
    sourcePath: "/theta/demo.theta",
    frontmatter,
    body: body(tail),
    callableSet,
  };
}

/**
 * Drive the theta body through the real prompt-mode binding and return the tail
 * expression's value. A failed tool call produces an `Err` VALUE, so the outer
 * execution result is `Ok(<tail value>)` on every path here.
 */
async function runBody(
  deps: ReturnType<typeof producer>,
  input: ThetaCompositionInput,
): Promise<ThetaValue> {
  const bindInput: ConversationBindInput = { theta: input, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(input.body, binding.executeDeps);
  const outer = execution.result;
  if (!outer.present || outer.value === undefined) {
    throw new Error("body produced no final value");
  }
  return outer.value;
}

/** Read the `Err` carrier off a tail `ResultValue`, failing loudly when it is `Ok`. */
function errOf(
  value: ThetaValue,
  why: string,
): {
  readonly kind?: string;
  readonly cause?: string;
  readonly message?: string;
  readonly tool_name?: string;
} {
  const result = value as ResultValue;
  expect(result.ok, why).toBe(false);
  return (
    value as unknown as {
      readonly error: {
        readonly kind?: string;
        readonly cause?: string;
        readonly message?: string;
        readonly tool_name?: string;
      };
    }
  ).error;
}

/** A recording built-in-shaped entry: `{ toolName, parameters, execute }`. */
function builtinEntry(
  toolName: string,
  parameters: unknown,
  record: { dispatched: boolean },
): ResolvedCallable {
  return {
    kind: "pi-tool",
    toolDefinition: {
      toolName,
      parameters,
      execute: (): Promise<AgentToolResultEnvelope> => {
        record.dispatched = true;
        return Promise.resolve({ content: [{ type: "text", text: "TOOL-RAN" }] });
      },
    },
  };
}

/**
 * The `read`-shaped input schema (one required string field), copied here rather
 * than probed from the SDK — case B only needs a plausible JSON-Schema object so
 * a schema-conforming argument dispatches cleanly through the REAL validator.
 */
const READ_SCHEMA = {
  type: "object",
  required: ["path"],
  properties: { path: { type: "string" }, limit: { type: "number" } },
} as const;

// The exact message the `tool === undefined` snapshot-miss seam surfaces, minted
// at the resolve-time decision (production-theta-producer.ts:3427). The landed
// fix (option 2) preserves it byte-for-byte while flipping only the cause.
const MISSING_TOOL_MESSAGE = "code-side call names no resolvable host tool 'missing_tool'";

// ===========================================================================
// (A) WITNESS — un-snapshotted callee → the `tool === undefined` regime-inactive
// arm must mint `cause: "unknown_tool"`, not `execution`.
// ===========================================================================

describe("bug 0322 (A) — a code-side call to an un-snapshotted name mints cause 'unknown_tool'", () => {
  it("WITNESS: the dispatch-time snapshot miss surfaces Err(CodeToolError{cause:'unknown_tool'}) with the arm's own message", async () => {
    // The snapshot HOLDS a different name, so `missing_tool` is genuinely absent
    // and `#resolvePiToolForTheta` (production-theta-producer.ts:3660) returns
    // `undefined`, reaching the regime-inactive `tool === undefined` arm
    // (:3447–3484). No `subagentRootRegime` is passed, so the regime is inactive
    // by default; at the fork the arm rejected with `UnknownHostToolError`, which
    // the landed fix flips to mint the `unknown_tool` carrier.
    const decoy = { dispatched: false };
    const value = await runBody(
      producer({}),
      thetaWithSet(
        callExpr("missing_tool", [objArg({ path: strExpr("x") })]),
        // Non-empty AND non-matching: proves the snapshot is present (so
        // `#resolvePiToolForTheta` does NOT fall back to the ambient
        // `resolvePiTool` collaborator) yet does not hold the callee.
        snapshot([["some_other_tool", builtinEntry("some_other_tool", READ_SCHEMA, decoy)]]),
      ),
    );
    expect(
      decoy.dispatched,
      "PRECONDITION: the decoy tool must not have run — the call names `missing_tool`, " +
        "which the snapshot does not hold; if the decoy ran the harness resolved the " +
        "wrong callee and the arm under test was never reached",
    ).toBe(false);

    const err = errOf(
      value,
      "PRECONDITION: a code-side call to an un-snapshotted name must surface an Err " +
        "VALUE (the arm rejects at dispatch); if this is Ok the call did not reach the " +
        "`tool === undefined` arm at all",
    );

    // Controls — hold both before AND after the fix (option 2 changes ONLY the
    // cause). If any of these red, the harness is not reaching the arm for the
    // right reason and case A's cause assertion below would be meaningless.
    expect(
      err.kind,
      "PRECONDITION: the carrier must be a CodeToolError; a different kind means the " +
        "call lowered through some other path, not the dispatch arm",
    ).toBe("code_tool");
    expect(
      err.tool_name,
      "PRECONDITION: the carrier must name the un-resolvable callee",
    ).toBe("missing_tool");
    expect(
      err.message,
      "PRECONDITION: bug 0322 §Fix option 2 keeps the arm's message text unchanged — " +
        `the fix flips ONLY the cause, so this must stay '${MISSING_TOOL_MESSAGE}'`,
    ).toBe(MISSING_TOOL_MESSAGE);
    expect(
      (value as ResultValue).ok,
      "PRECONDITION: the tail Result is an Err (ok === false)",
    ).toBe(false);

    // THE RED ASSERTION. At the fork the arm rejected with
    // `UnknownHostToolError`, which the execute-throw catch
    // (tool-call-execute.ts:481) lowered via `lowerToolExecuteThrow` (:234) to
    // `cause: "execution"` (:243) — the WRONG cause for a call that never
    // dispatched anything. Bug 0322 §Fix option 2 (settled route = COMBINED /
    // mint-at-the-seam) flips this seam to mint `cause: "unknown_tool"`. This is
    // the assertion that red at the fork and greens on the fix.
    expect(
      err.cause,
      "PRIMARY (bug 0322 §Fix option 2, settled route COMBINED / mint-at-the-seam): the " +
        "regime-inactive `tool === undefined` dispatch arm " +
        "(production-theta-producer.ts:3447–3484) must mint " +
        "Err(CodeToolError{cause:'unknown_tool'}) for a dispatch-time snapshot miss — " +
        "not 'execution', which lowerToolExecuteThrow (tool-call-execute.ts:243) " +
        "mis-attributes to a call that never reached execute(). 'unknown_tool' is a " +
        "declared, contract-exported cause (query-error.ts:111, tool-call.ts:500) with " +
        "no producer until this flip lands.",
    ).toBe("unknown_tool");
  });
});

// ===========================================================================
// (B) CONTROL — a registered known-tool dispatch is byte-identical before and
// after the fix. Must stay GREEN.
// ===========================================================================

describe("bug 0322 (B) — a registered known-tool dispatch is untouched by the fix", () => {
  it("CONTROL: a snapshotted pi-tool with schema-conforming args dispatches and lowers to Ok(text)", async () => {
    // The snapshot HOLDS `known_tool` with an `execute()` that resolves. The
    // call names it with valid args, so `#resolvePiToolForTheta` resolves the
    // entry, dispatch runs execute(), and the call lowers to Ok. Option 2 only
    // touches the `tool === undefined` arm, so this path is unchanged: GREEN
    // before AND after.
    const record = { dispatched: false };
    const value = await runBody(
      producer({}),
      thetaWithSet(
        callExpr("known_tool", [objArg({ path: strExpr("a.txt"), limit: numExpr(10) })]),
        snapshot([["known_tool", builtinEntry("known_tool", READ_SCHEMA, record)]]),
      ),
    );
    expect(
      record.dispatched,
      "PRIMARY: a resolvable tool with conforming args must dispatch (execute() called)",
    ).toBe(true);
    const result = value as ResultValue;
    expect(result.ok, "PRIMARY: a clean dispatch lowers to Ok(...)").toBe(true);
    expect(
      (result as { readonly ok: true; readonly value: unknown }).value,
      "the lowered value is the tool's joined text",
    ).toBe("TOOL-RAN");
  });
});

// ===========================================================================
// (C) CONTRACT CELL — the closed cause set includes `unknown_tool`. GREEN before
// and after (the fix wires the member's producer; it does not widen the set).
// ===========================================================================

describe("bug 0322 (C) — the author-contract cause set is the closed four-member enum incl. unknown_tool", () => {
  it("CONTRACT: codeToolErrorCauses() is exactly ['validation','execution','cancelled','unknown_tool']", () => {
    // src/runtime/tool-call.ts:499–500 — the contract surface for theta authors.
    // The bug is that `unknown_tool` is exported here (and case A witnesses it
    // has no producer today); this cell locks the closed set so the fix cannot
    // "resolve" the dead member by deleting it from the contract.
    const causes = codeToolErrorCauses();
    expect(
      causes,
      "PRIMARY: the closed CodeToolCause contract must remain the exact four-member set",
    ).toEqual(["validation", "execution", "cancelled", "unknown_tool"]);
    expect(
      causes,
      "PRIMARY: `unknown_tool` is a declared contract member — case A pins that the fix " +
        "gives it a producer, this pins that it stays in the exported set",
    ).toContain("unknown_tool");
  });
});

// ===========================================================================
// (D) REGIME-ACTIVE CONTROL (PIC-58) — under an active subagent-root regime the
// same `tool === undefined` seam routes to the ladder, NOT the unknown_tool
// carrier. Proves the fix (which targets ONLY the regime-inactive arm) leaves
// the regime-active branch untouched. Cheap: mirrors E4's ladder-probe wiring.
// ===========================================================================

describe("bug 0322 (D) — the regime-active branch of the same arm still routes to the ladder", () => {
  it("PIC-58 CONTROL: under an active regime an un-snapshotted name enters the PIC-64 ladder rather than minting unknown_tool", async () => {
    // production-theta-producer.ts:3447–3484: when `regime.active`, the
    // `tool === undefined` arm calls `#dispatchExtensionToolViaLadder`, which
    // (with a host-loop rung available) dispatches through `hostLoopDispatch`.
    // Bug 0322 §Non-goals: "The subagent-root-regime branch of the
    // `tool === undefined` arm ... is not claimed wrong here." So this must NOT
    // mint the unknown_tool carrier — it must reach the ladder. GREEN before and
    // after (option 2 flips only the regime-INACTIVE reject).
    const seen: EncodedToolRequest[] = [];
    const value = await runBody(
      producer({
        subagentRootRegime: { active: true, slug: "demo" },
        dispatchLadderProbe: { getToolDefinitionAvailable: false, hostLoopAvailable: true },
        hostLoopDispatch: (request: EncodedToolRequest): Promise<HostToolResult> => {
          seen.push(request);
          return Promise.resolve({
            content: [{ type: "text", text: "LADDER-RAN" }],
            isError: false,
          });
        },
      }),
      thetaWithSet(callExpr("missing_tool", [objArg({ path: strExpr("x") })]), snapshot([])),
    );
    expect(
      seen.map((r) => r.toolName),
      "PRIMARY (bug 0322 §Non-goals): under the active regime the un-snapshotted name must " +
        `route to the PIC-64 ladder (hostLoopDispatch), not the unknown_tool carrier. Seen: ${JSON.stringify(
          seen,
        )}`,
    ).toEqual(["missing_tool"]);
    const result = value as ResultValue;
    expect(result.ok, "the ladder dispatch's clean read-back lowers to Ok(...)").toBe(true);
    expect(
      (result as { readonly ok: true; readonly value: unknown }).value,
      "the lowered value is the ladder's joined text",
    ).toBe("LADDER-RAN");
  });
});
