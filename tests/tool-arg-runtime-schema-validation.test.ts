import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createReadToolDefinition,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { CallableSetSnapshot, ResolvedCallable } from "../src/parser/callable-set";
import type { CallExpr, Expr, ObjectExpr, ThetaBody } from "../src/parser/theta-document";
import { DEPTH_VIOLATION_MESSAGE } from "../src/runtime/depth-walk";
import type {
  DispatchLadderProbe,
  EncodedToolRequest,
  HostToolResult,
} from "../src/runtime/host-loop-dispatch";
import { executeBody } from "../src/runtime/statement-executor";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import type { ResultValue, ThetaValue } from "../src/runtime/value";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

// Bug 0072 — the RUNTIME half: there is no theta-side input-schema check before
// a code-side Pi-tool dispatch, so a wrong-typed or unknown-field argument is
// handed to the host tool
// (docs/bugs/0072-tool-arg-checks-dead-and-no-runtime-net.md §Summary
// consequence 2, §Why it matters). `enforceCodeToolArgDepth` is the only `src/`
// site that constructs `CodeToolError { cause: "validation" }`, so today the
// closed `cause` enum's `validation` member is reachable only from a depth-6
// argument.
//
// Spec: `docs/spec_topics/tool-calls.md` §"Argument shape" — "a Pi-tool argument
// that does not match the tool's input schema is, in general, never a parse
// error — it is caught by the runtime AJV check and surfaces at runtime as
// `Err(CodeToolError { cause: "validation", ... })`";
// `docs/spec_topics/errors-and-results/queryerror-variants.md` defines that
// cause as "arguments failed input-schema validation". The soundness argument
// for the parse-time disjointness check ("a provable disjointness guarantees the
// runtime AJV check would reject the same value") presupposes this check exists.
//
// PINNED POST-FIX CONTRACT (bug 0072 §Fix, runtime half (a)/(b)/(c) — the
// document's own three constraints, plus the threading they presuppose):
//   (a) threading — the callable-set snapshot entry for a host BUILT-IN carries
//       the tool's registered `parameters` schema at load. At HEAD
//       `builtinToolDefinition`'s return type narrows the real `ToolDefinition`
//       to `{ execute }` and `resolvePiTool` forwards only `{ toolName, execute }`,
//       so the schema is dropped for built-ins (it already reaches EXTENSION
//       entries through `resolveRegistryExtensionTool`). Cell D2.
//   (b) enforcement — the constructed `params` object is validated against that
//       schema AFTER the depth walk and BEFORE `execute()` (CIO-3 pins
//       depth-walk-before-AJV), surfacing `Err(CodeToolError { cause:
//       "validation" })` without dispatching. Cells E1, E2, E3.
//   (c) no double report — the check runs pre-dispatch and short-circuits, so an
//       execute-less (extension-shaped) entry never enters the PIC-64 ladder and
//       the host loop never validates the same value: exactly one report, on the
//       `validation` arm, and no diagnostic. Cell E4.
//   Fail-open is preserved: an entry with no `parameters`, or one whose
//   `parameters` is not a plausible JSON-Schema object, dispatches unchanged
//   (cells E6, E7), and valid arguments dispatch (cell E5).
//
// Layering. Cells E1–E7 drive the REAL production resolver `#resolveToolCall`
// (`src/extension/production-theta-producer.ts`) through
// `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`, so
// they pin the SHIPPED pre-dispatch path — the same harness shape the existing
// ceiling-#4 witnesses in `tests/production-live-resolvers.test.ts` use for
// `enforceCodeToolArgDepth`, and the same snapshot-entry shape
// `tests/prompt-mode-extension-tool-dispatch.test.ts` uses for the PIC-64
// ladder. Nothing here drives `runCodeSideToolCall` in isolation: the ordering
// (depth before AJV) and the short-circuit (no dispatch) are only observable as
// production behaviour when the real producer builds the `CodeSideToolCall`.
//
// Cell D2 is at the production LOAD level (`discoverAndComposeFixtures` over a
// planted `.pi/theta/`) because that is where the schema is dropped; the runtime
// cells inject the schema on the snapshot entry directly, so they stay
// independent of (a) and red only on (b)/(c).

// ===========================================================================
// (a) Load-time threading — the built-in's `parameters` must reach the frozen
// callable-set snapshot entry.
// ===========================================================================

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/** The one planted fixture: a prompt-mode theta admitting the built-in `read`. */
const THREAD_STEM = "b72thread";

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly fixtures: readonly ThetaFixture[];
  readonly notifications: readonly string[];
}

let loadOutcome: LoadOutcome;
let workspaceDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
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
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName), fixtures, notifications };
}

beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-b72-schema-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  writeFileSync(
    join(projectThetaDir, `${THREAD_STEM}.theta`),
    theta("---", "mode: prompt", "tools: read", "---", "@`hi`"),
    "utf8",
  );
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  loadOutcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

/** Read the frozen callable-set snapshot threaded onto a runnable fixture. */
function callableSetOf(slashName: string): CallableSetSnapshot {
  const fixture = loadOutcome.fixtures.find((f) => f.slashName === slashName);
  expect(
    fixture,
    `PRECONDITION: fixture '${slashName}' was not registered by the production load ` +
      `path. Registered: ${JSON.stringify(loadOutcome.registered)}; notified: ` +
      JSON.stringify(loadOutcome.notifications),
  ).toBeDefined();
  const snapshot = (fixture as unknown as { callableSet?: CallableSetSnapshot }).callableSet;
  expect(
    snapshot,
    `PRECONDITION: fixture '${slashName}' carries no callableSet snapshot, so the ` +
      "threading assertion below has nothing to read",
  ).toBeDefined();
  return snapshot as CallableSetSnapshot;
}

describe("bug 0072 (a) — the built-in tool's registered `parameters` reaches the frozen callable-set entry", () => {
  it("D1: the planted `tools: read` theta registered (load precondition)", () => {
    expect(
      loadOutcome.registered,
      "PRECONDITION: the project `.pi/theta/` discovery walk did not register the " +
        `planted fixture, so D2 would read no snapshot. Registered: ${JSON.stringify(
          loadOutcome.registered,
        )}`,
    ).toContain(THREAD_STEM);
  });

  it("D2: the `read` snapshot entry carries the tool's registered `parameters` schema", () => {
    // frontmatter-fields-a.md §`tools`: "Each resolved entry carries the tool's
    // `parameters` schema (enough for the RFC-0002 argument/field disjointness
    // check …)". At HEAD (probed) the entry is `{ toolName, execute }` — the
    // schema is dropped for host built-ins, so neither the parse-time
    // disjointness check nor the runtime AJV check has an input to read.
    //
    // The expected value is read from the SDK factory the composition root
    // itself calls (`builtinToolDefinition` → `createReadToolDefinition`), so
    // this pins THREADING rather than a transcribed copy of the schema.
    const expected = (
      createReadToolDefinition(workspaceDir) as unknown as { readonly parameters?: unknown }
    ).parameters;
    expect(
      expected,
      "PRECONDITION: the pinned SDK's `read` tool definition carries no `parameters` " +
        "schema, so there is nothing for the load path to thread",
    ).toBeDefined();

    const entry = callableSetOf(THREAD_STEM).entries.get("read");
    expect(entry, "PRECONDITION: the snapshot holds no `read` entry").toBeDefined();
    expect(entry!.kind, "the entry is a Pi-tool entry").toBe("pi-tool");
    const definition = (entry as { readonly toolDefinition: { readonly parameters?: unknown } })
      .toolDefinition;
    expect(
      definition.parameters,
      "PRIMARY (bug 0072 §Fix, runtime half — threading): the frozen snapshot entry for a host " +
        "BUILT-IN must carry the tool's registered input schema. `builtinToolDefinition` " +
        "narrows its return type to `{ execute }` and `resolvePiTool` forwards only " +
        `{ toolName, execute }, so the schema never reaches the dispatch site. Entry: ${JSON.stringify(
          definition,
        )}`,
    ).toEqual(expected);
  });
});

// ===========================================================================
// (b) + (c) Pre-dispatch enforcement at the real `#resolveToolCall`.
// ===========================================================================

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

/** `depth` nested `[...]` around a `1` leaf — JSON-document depth `depth+1`. */
function nestedArray(depth: number): Expr {
  let e: Expr = numExpr(1);
  for (let i = 0; i < depth; i += 1) {
    e = { kind: "array", elements: [e], range: span() };
  }
  return e;
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
 * reads. `schemaValidator` is the REAL AJV-backed seam (`AjvSchemaValidator`),
 * so the pre-dispatch check's accept/reject verdicts are the production
 * validator's, not a fake's.
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
  });
}

/** A frozen callable-set snapshot from `{ callableName -> entry }` pairs. */
function snapshot(
  entries: readonly (readonly [string, ResolvedCallable])[],
): CallableSetSnapshot {
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

/**
 * The `read` built-in's registered input schema, as probed from the pinned SDK
 * (`createReadToolDefinition(...).parameters`, minus the per-field
 * `description` keys, which no check reads): one required string field and two
 * optional numeric ones, no `additionalProperties: false` — so an unknown field
 * is caught through `required`, which is why `read({ nosuchfield: "a" })` is the
 * runtime half's case and not the parse arm's (bug 0072 §Fix).
 */
const READ_SCHEMA = {
  type: "object",
  required: ["path"],
  properties: {
    path: { type: "string" },
    offset: { type: "number" },
    limit: { type: "number" },
  },
} as const;

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

/** Read the `Err` carrier off a tail `ResultValue`, failing loudly when it is `Ok`. */
function errOf(
  value: ThetaValue,
  why: string,
): { readonly kind?: string; readonly cause?: string; readonly message?: string; readonly tool_name?: string } {
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

describe("bug 0072 (b) — schema-violating code-side tool args surface Err(CodeToolError{cause:'validation'}) and never dispatch", () => {
  it("E1: a WRONG-TYPED field surfaces the validation Err and the tool's execute() is never called", async () => {
    // `{ path: 123 }` against `path: { type: "string" }`. At HEAD (probed) the
    // dispatch proceeds and the call lowers to `Ok("TOOL-RAN")` — the hazard bug
    // 0072 §Why it matters names: the disposition depends entirely on the tool.
    const record = { dispatched: false };
    const entry = builtinEntry("read", READ_SCHEMA, record);
    const value = await runBody(
      producer({}),
      thetaWithSet(callExpr("read", [objArg({ path: numExpr(123) })]), snapshot([["read", entry]])),
    );
    expect(
      record.dispatched,
      "PRIMARY (bug 0072 §Fix runtime half (b)): the pre-dispatch input-schema check must run " +
        "BEFORE execute(), so a schema-violating argument never reaches the host tool",
    ).toBe(false);
    const err = errOf(
      value,
      "PRIMARY: a schema-violating code-side tool argument must surface Err, not a value",
    );
    expect(err.kind, "the carrier is a CodeToolError").toBe("code_tool");
    expect(
      err.cause,
      "queryerror-variants.md: `validation` is 'arguments failed input-schema validation'",
    ).toBe("validation");
    expect(err.tool_name, "the carrier names the called tool").toBe("read");
    expect(
      err.message,
      "the input-schema failure must not be reported as the depth-ceiling breach — " +
        "that is the only `validation` producer at HEAD",
    ).not.toBe(DEPTH_VIOLATION_MESSAGE);
  });

  it("E2: a MISSING REQUIRED field surfaces the validation Err and never dispatches", async () => {
    // `read({ nosuchfield: "a" })` — `read`'s schema has no
    // `additionalProperties: false`, so the violation is the absent
    // `required: ["path"]`. Deliberately out of the parse arm's reach (an absent
    // field has no schema type to be disjoint from), so this cell is the ONLY
    // gate for the bug doc's `unknownfield` reproduction row.
    const record = { dispatched: false };
    const entry = builtinEntry("read", READ_SCHEMA, record);
    const value = await runBody(
      producer({}),
      thetaWithSet(
        callExpr("read", [objArg({ nosuchfield: strExpr("a") })]),
        snapshot([["read", entry]]),
      ),
    );
    expect(
      record.dispatched,
      "PRIMARY: an argument object missing a required field must not be dispatched",
    ).toBe(false);
    const err = errOf(value, "PRIMARY: the missing required field must surface Err");
    expect(err.kind).toBe("code_tool");
    expect(err.cause, "the input-schema failure arm").toBe("validation");
    expect(err.message, "not the depth breach").not.toBe(DEPTH_VIOLATION_MESSAGE);
  });

  it("E3: CIO-3 ordering — a depth-6 argument that ALSO violates the schema still reports the DEPTH breach", async () => {
    // `{ path: [[[[[1]]]]] }` is both depth-6 (one past ceiling #4's cap) and
    // wrong-typed for `path: string`. CIO-3 pins depth-walk-before-AJV, so
    // `argDepthBreach` wins and the message stays the canonical depth string.
    // GREEN at HEAD (the depth walk is the only pre-dispatch check today) and
    // must stay green: it is the ordering the new check is inserted behind.
    const record = { dispatched: false };
    const entry = builtinEntry("read", READ_SCHEMA, record);
    const value = await runBody(
      producer({}),
      thetaWithSet(
        callExpr("read", [objArg({ path: nestedArray(5) })]),
        snapshot([["read", entry]]),
      ),
    );
    expect(record.dispatched, "neither pre-dispatch check dispatches").toBe(false);
    const err = errOf(value, "a depth-6 argument surfaces Err");
    expect(err.cause, "both pre-dispatch checks report on the `validation` arm").toBe("validation");
    expect(
      err.message,
      "CIO-3: the depth walk runs before AJV, so the depth breach is the reported " +
        "violation — the schema check must not front-run or replace it",
    ).toBe(DEPTH_VIOLATION_MESSAGE);
  });

  it("E5: VALID arguments still dispatch and lower to Ok(text)", async () => {
    // The control that keeps the check honest in the other direction: a
    // schema-conforming argument object is not rejected.
    const record = { dispatched: false };
    const entry = builtinEntry("read", READ_SCHEMA, record);
    const value = await runBody(
      producer({}),
      thetaWithSet(
        callExpr("read", [objArg({ path: strExpr("a.txt"), limit: numExpr(10) })]),
        snapshot([["read", entry]]),
      ),
    );
    expect(record.dispatched, "a schema-conforming argument dispatches").toBe(true);
    const result = value as ResultValue;
    expect(result.ok, "and lowers to Ok(...)").toBe(true);
    expect(
      (result as { readonly ok: true; readonly value: unknown }).value,
      "the lowered value is the tool's joined text",
    ).toBe("TOOL-RAN");
  });

  it("E6: an entry with NO `parameters` schema dispatches unchanged (fail-open)", async () => {
    // Bug 0072 §Fix runtime half (a) validates "against the resolved tool's
    // `parameters`", so with no `parameters` there is nothing to validate
    // against: the check is skipped entirely and a tool that registers no input
    // schema keeps its behaviour.
    const record = { dispatched: false };
    const entry: ResolvedCallable = {
      kind: "pi-tool",
      toolDefinition: {
        toolName: "emit",
        execute: (): Promise<AgentToolResultEnvelope> => {
          record.dispatched = true;
          return Promise.resolve({ content: [{ type: "text", text: "TOOL-RAN" }] });
        },
      },
    };
    const value = await runBody(
      producer({}),
      thetaWithSet(callExpr("emit", [objArg({ anything: numExpr(1) })]), snapshot([["emit", entry]])),
    );
    expect(record.dispatched, "no schema to validate against — dispatch is unchanged").toBe(true);
    expect((value as ResultValue).ok, "and the call lowers to Ok(...)").toBe(true);
  });

  it("E7: an entry whose `parameters` is not a JSON-Schema object dispatches unchanged (fail-open)", async () => {
    // The same fail-open as E6, one step further out: a `parameters` value that
    // is not a plausible JSON-Schema object is skipped rather than compiled, so
    // the check cannot turn a junk schema into a throw at the call site.
    const record = { dispatched: false };
    const entry = builtinEntry("junk", "not-a-schema", record);
    const value = await runBody(
      producer({}),
      thetaWithSet(callExpr("junk", [objArg({ path: numExpr(1) })]), snapshot([["junk", entry]])),
    );
    expect(
      record.dispatched,
      "an unusable `parameters` value is skipped rather than raised at the call site",
    ).toBe(true);
    expect((value as ResultValue).ok, "and the call lowers to Ok(...)").toBe(true);
  });
});

describe("bug 0072 (c) — an execute-less (extension-shaped) entry is refused pre-dispatch, so the PIC-64 host loop never validates it twice", () => {
  it("E4: schema-violating args on an execute-less entry yield ONE validation Err and ZERO host-loop dispatches", async () => {
    // The §Fix constraint (c) witness. An extension entry is execute-less by
    // construction (the public extension API strips `execute`), so its code-side
    // dispatch routes through the PIC-64 ladder to `hostLoopDispatch`, where the
    // host loop validates independently and its rejection arrives as `isError` →
    // `cause: "execution"` (the misattribution bug 0003 §Reproduction recorded).
    // Because the new check is pre-dispatch and short-circuits, the ladder is
    // never entered: exactly one report, on the `validation` arm, with no
    // diagnostic emitted.
    // At HEAD (probed) the seam records one invocation carrying `{ path: 123 }`
    // and the call lowers to `Ok("HOST-LOOP-RAN")`.
    const seen: EncodedToolRequest[] = [];
    const diagnostics: Diagnostic[] = [];
    const entry: ResolvedCallable = {
      kind: "pi-tool",
      toolDefinition: { toolName: "my_tool", parameters: READ_SCHEMA },
    };
    const value = await runBody(
      producer({
        dispatchLadderProbe: { getToolDefinitionAvailable: false, hostLoopAvailable: true },
        hostLoopDispatch: (request: EncodedToolRequest): Promise<HostToolResult> => {
          seen.push(request);
          return Promise.resolve({
            content: [{ type: "text", text: "HOST-LOOP-RAN" }],
            isError: false,
          });
        },
        emitDiagnostic: (diagnostic: Diagnostic): void => {
          diagnostics.push(diagnostic);
        },
      }),
      thetaWithSet(
        callExpr("my_tool", [objArg({ path: numExpr(123) })]),
        snapshot([["my_tool", entry]]),
      ),
    );
    expect(
      seen,
      "PRIMARY (bug 0072 §Fix constraint (c)): the pre-dispatch check short-circuits, so " +
        `the PIC-64 host-loop rung is never entered and cannot report the same violation ` +
        `a second time as cause 'execution'. Requests seen: ${JSON.stringify(seen)}`,
    ).toEqual([]);
    const err = errOf(value, "PRIMARY: the execute-less entry's violation surfaces Err");
    expect(err.kind).toBe("code_tool");
    expect(err.cause, "reported once, on the validation arm").toBe("validation");
    expect(err.tool_name).toBe("my_tool");
    expect(
      diagnostics,
      `the check's only surface is the theta-visible Err; it emits no diagnostic. Emitted: ${JSON.stringify(
        diagnostics,
      )}`,
    ).toEqual([]);
  });
});
