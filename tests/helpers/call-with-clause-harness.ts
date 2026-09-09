// RFC 0009 (V21a-T) — shared harness for the call-site `with { cwd }` RED
// tests. Not itself a test file (no `describe`/`it`) — test-support code under
// `tests/`, mirroring the repo's existing `tests/helpers/*.ts` convention.
//
// Provides:
//   - hand-built AST node constructors (`invokeStmtWithClause`, `strExpr`,
//     `withClause`, …) so a test can attach a `withClause` field to a `CallExpr`
//     / `InvokeExpr` via a structural cast even though the field does not exist
//     on the parser's node types yet (RFC 0009 §1 AST widening, not landed).
//     This lets a test COMPILE at HEAD and drive the real interpreter/producer
//     over an AST shape the future parser will emit, without waiting on the
//     parser change.
//   - `driveCaller`: runs a hand-built PROMPT-mode caller body (containing one
//     `invoke("<path>")` statement, optionally carrying a cast `withClause`)
//     through the REAL production producer (`createProductionProducerDeps`),
//     resolving a hand-built SUBAGENT-mode callee via a fake `parseCallee`, and
//     recording the spawn via `makeFakeJsonChildLauncher`. The fake spawn
//     AUTO-RESPONDS with `Ok(42)` on the next microtask so the invoke settles
//     without a real child process. This is the seam
//     `#resolveInvoke`/`#driveCallee`/`spawnSubagentConversation` — all
//     production code, so a passing assertion here is a real observable, not a
//     harness fabrication.
//
// Every test file importing this harness is OFFLINE / provider-free: the
// "child" is the in-process fake, no provider credential is read, and no real
// process is spawned (AGENTS.md "Live-suite conventions" does not apply here).

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { SourceRange } from "../../src/diagnostics/diagnostic";
import type {
  Expr,
  InvokeExpr,
  Stmt,
  ThetaBody,
} from "../../src/parser/theta-document";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";
import { executeBody, type BodyExecution } from "../../src/runtime/statement-executor";
import {
  createProductionProducerDeps,
  type CalleeParseOutcome,
} from "../../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../../src/runtime-root";
import type { Checkpoint } from "../../src/seams/checkpoint";
import type { SpawnFn } from "../../src/runtime/subagent-launcher";
import {
  fakeExecutableHost,
  makeFakeJsonChildLauncher,
  type FakeJsonChild,
  type SpawnRecord,
} from "./fake-json-child";

/** A dummy 1-char source range; no test in this file asserts on positions. */
export function R(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A `StringExpr` AST node. */
export function strExpr(value: string): Expr {
  return { kind: "string", value, range: R() } as unknown as Expr;
}

/** A `NullExpr` AST node. */
export function nullExpr(): Expr {
  return { kind: "null", range: R() } as unknown as Expr;
}

/** `null.<field>` — a `MemberExpr` on a null target (panics on evaluation, V9). */
export function memberOnNull(field = "missing"): Expr {
  return { kind: "member", target: nullExpr(), field, range: R() } as unknown as Expr;
}

/** `Err(<message>)` wrapped in a `TryExpr` (`?`) — raises on evaluation, V10. */
export function tryErr(message: string): Expr {
  const resultCtor = {
    kind: "result-ctor",
    ctor: "Err",
    arg: strExpr(message),
    range: R(),
  } as unknown as Expr;
  return { kind: "try", operand: resultCtor, range: R() } as unknown as Expr;
}

/** `<left> + <right>` — a `BinaryExpr` string concatenation (V8, an expression value). */
export function concatExpr(left: string, right: string): Expr {
  return {
    kind: "binary",
    op: "+",
    left: strExpr(left),
    right: strExpr(right),
    range: R(),
  } as unknown as Expr;
}

/** The RFC 0009 §1 `CallWithField[]` / `CallWithClause` shape, reached only via cast. */
export interface FakeCallWithClause {
  readonly fields: readonly { readonly key: string; readonly keyRange: SourceRange; readonly value: Expr }[];
  readonly range: SourceRange;
}

/** A `with { cwd: <valueExpr> }` clause carrying one or more `cwd` fields (V11: duplicates). */
export function withClause(...valueExprs: readonly Expr[]): FakeCallWithClause {
  return {
    fields: valueExprs.map((value) => ({ key: "cwd", keyRange: R(), value })),
    range: R(),
  };
}

/** An `unknown key` clause (V1), for parse-file use only — not consumed by the runtime harness. */
export function withClauseUnknownKey(key: string, value: Expr): FakeCallWithClause {
  return { fields: [{ key, keyRange: R(), value }], range: R() };
}

/**
 * A statement-position `invoke("<path>")`, optionally carrying a cast
 * `withClause`. The AST shape a future parser attaches the clause onto
 * (RFC 0009 §1); at HEAD no production code reads `.withClause`, so the clause
 * is inert until the implementation lands — exactly the RED this harness pins.
 */
export function invokeStmtWithClause(path: string, clause?: FakeCallWithClause): Stmt {
  const invoke = {
    kind: "invoke",
    path,
    returnSchema: null,
    args: [],
    range: R(),
    withClause: clause,
  } as unknown as InvokeExpr;
  return { kind: "invoke", invoke, range: R() } as unknown as Stmt;
}

/** A `ThetaBody` whose sole statement is the given invoke statement. */
export function bodyWithInvoke(path: string, clause?: FakeCallWithClause): ThetaBody {
  return { statements: [invokeStmtWithClause(path, clause)], tail: null };
}

/** A trivial `mode: subagent` callee body: tail literal `42`. */
export function trivialSubagentBody(): ThetaBody {
  return {
    statements: [],
    tail: { kind: "number", text: "42", numericType: "integer", range: R() } as unknown as Expr,
  };
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

export function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}

export function noopPi(): ExtensionAPI {
  return {
    sendMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
}

/** The ctx every driven caller/callee dispatch shares — model + cwd resolved (PIC-62). */
export function driveCtx(cwd: string): ExtensionCommandContext {
  return {
    model: { id: "claude-test", provider: "anthropic" },
    cwd,
    signal: undefined,
  } as unknown as ExtensionCommandContext;
}

/** One `driveCaller` outcome: the caller body's execution + every recorded spawn. */
export interface DriveOutcome {
  readonly execution: BodyExecution;
  readonly spawns: readonly SpawnRecord[];
}

export interface DriveCallerInput {
  readonly callerBody: ThetaBody;
  readonly callerCtx: ExtensionCommandContext;
  /** literal invoke path -> the callee's ThetaCompositionInput fields. */
  readonly callees: ReadonlyMap<string, Pick<ThetaCompositionInput, "sourcePath" | "frontmatter" | "body">>;
  /** Override the auto-respond value (default `Ok(42)`); set to make a callee spawn fail instead. */
  readonly onSpawn?: SpawnFn;
}

/**
 * Drive a hand-built `mode: prompt` caller body through the REAL production
 * producer. Every `invoke(...)` the body statement-list carries dispatches
 * through `#resolveInvoke` -> `#driveCallee` -> `spawnSubagentConversation`
 * (production code, unmodified) against a fake `parseCallee` (serving the
 * `callees` map by literal invoke path) and a fake spawn (auto-responds
 * `Ok(42)` on the next microtask unless `onSpawn` overrides the spawn
 * function entirely, e.g. to inject an ENOENT).
 */
/** Wrap a raw `SpawnFn` so every spawned fake child auto-responds `Ok(42)` on the next microtask (never hangs a `drive()` await). */
export function autoRespondingSpawn(inner: SpawnFn): SpawnFn {
  return (execPath, args, options) => {
    const child = inner(execPath, args, options) as FakeJsonChild;
    queueMicrotask(() => {
      if (!child.exited) {
        child.emitOkEnvelope(42);
      }
    });
    return child;
  };
}

export async function driveCaller(input: DriveCallerInput): Promise<DriveOutcome> {
  const launcher = makeFakeJsonChildLauncher();
  const autoRespondSpawn = autoRespondingSpawn(launcher.spawn);

  const parseCallee = (
    _callerPath: string | undefined,
    calleePath: string,
  ): Promise<CalleeParseOutcome> => {
    const callee = input.callees.get(calleePath);
    if (callee === undefined) {
      return Promise.reject(
        new Error(`harness precondition unmet: parseCallee asked for an unknown callee literal '${calleePath}'`),
      );
    }
    return Promise.resolve({
      kind: "ok",
      input: { slashName: "callee", callableSet: { entries: new Map() }, ...callee } as ThetaCompositionInput,
    });
  };

  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    parseCallee,
    subagentSpawn: input.onSpawn ?? autoRespondSpawn,
    subagentExecutableHost: fakeExecutableHost(),
    subagentParentEnv: {},
    subagentParentPid: 4242,
  });

  const callerTheta: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/thetadir/caller.theta",
    frontmatter: { mode: "prompt" } as unknown as ParsedFrontmatter,
    body: input.callerBody,
    callableSet: { entries: new Map() },
  } as ThetaCompositionInput;

  const bindInput: ConversationBindInput = {
    theta: callerTheta,
    args: "",
    ctx: input.callerCtx,
  };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(callerTheta.body, binding.executeDeps);
  return { execution, spawns: launcher.spawns };
}

/** A `mode: subagent` callee served by `driveCaller`'s fake `parseCallee`. */
export function subagentCallee(
  sourcePath: string,
): Pick<ThetaCompositionInput, "sourcePath" | "frontmatter" | "body"> {
  return {
    sourcePath,
    frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
    body: trivialSubagentBody(),
  };
}
