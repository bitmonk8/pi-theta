// RFC 0009 (V21a-T) — call-site `with { cwd }` FAILURE ARMS.
//
// Spec: docs/rfcs/0009-per-call-subagent-cwd.md §Proposal 3 (Value semantics),
// §Proposal 5 (Runtime plumbing); invocation.md INV-7/INV-8; seam sheet
// §4.2 (validation), §4.3 (runtime mode gate), §4.6 (spawn-ENOENT enrichment).
// Matrix rows: §5.1 row 7, §5.2 V2/V3/V9/V10, §5.3 R2.
//
// RED SIGNATURE AT HEAD (one line): none of the RFC 0009 validation guards
// (empty-string / non-string cwd, runtime prompt-mode-callee gate) exist yet
// in `#driveCallee`, and `launchSubagentChild`'s ENOENT diagnostic carries no
// `(cwd: …)` enrichment — so every "the invoke aborts pre-spawn with
// InvokeInfraError{cause:'validation'}" assertion below instead observes a
// completed spawn (`spawns` non-empty, `execution.outcome === "success"`), and
// the ENOENT message assertion reds on the un-enriched string.
//
// PHASE-5 REPAIR (V9/V10, row 7): the two cells above were originally
// red-herring cells (see this file's V9/V10 and row-7 blocks for the new
// per-cell red-direction signatures) — repaired to pin the abort ROUTE
// (`rejects.toThrow(NullMemberAccessPanic | InterpolatedResultPanic)` +
// zero recorded spawns for V9/V10; a bound invoke's `Err(InvokeInfraError{
// cause:"validation"})` for row 7) rather than an outcome shape the
// spec-faithful implementation was never obligated to produce.
//
// Offline, provider-free — same fake-child mechanism as
// tests/call-with-clause-threading.test.ts.

import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import {
  enoentSpawnError,
  makeFakeJsonChildLauncher,
} from "./helpers/fake-json-child";
import { launchSubagentChild, type SubagentLaunchRequest, type ExecutableHost } from "../src/runtime/subagent-launcher";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { NullMemberAccessPanic } from "../src/runtime/runtime-panics";
import { InterpolatedResultPanic } from "../src/render/query-render";
import type { CallExpr, Expr, InvokeExpr, ThetaBody } from "../src/parser/theta-document";
import {
  autoRespondingSpawn,
  bodyWithInvoke,
  driveCaller,
  driveCtx,
  memberOnNull,
  strExpr,
  subagentCallee,
  tryErr,
  withClause,
} from "./helpers/call-with-clause-harness";
import {
  checkInvokeStaticResolution,
  type CalleeArity,
} from "../src/extension/invoke-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { CallableSetSnapshot } from "../src/parser/callable-set";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
} from "../src/runtime/effectful-statement-host";
import { executeBody, type ExecuteBodyDeps } from "../src/runtime/statement-executor";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import type { ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import type { ResultValue } from "../src/runtime/value";
import { FakeFileSystem } from "./helpers/fake-file-system";

const CALLER_CWD = "/work/project";
const CHILD_LITERAL = "./child.theta";

function span() {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

const numberValue = {
  kind: "number",
  text: "1",
  numericType: "integer",
  range: span(),
} as unknown as Parameters<typeof withClause>[0];

/**
 * finding-4 (seam sheet §4.2): a `let r = invoke("<path>") with { cwd: <clause> }; r`
 * body — the SAME bound-result shape as the row-7 cell below, reused here so
 * V2/V3 can assert the validation `Err`'s SHAPE/MESSAGE (`cause`, `message`),
 * not merely "no spawn". A bare `invoke(...)` statement discards its result
 * (statement-executor.ts `case "invoke"`), so binding is required to make the
 * Err author-visible.
 */
function bodyWithBoundInvoke(path: string, clause: ReturnType<typeof withClause>): ThetaBody {
  const invokeExpr = {
    kind: "invoke",
    path,
    returnSchema: null,
    args: [],
    range: span(),
    withClause: clause,
  } as unknown as InvokeExpr;
  return {
    statements: [
      {
        kind: "let",
        name: "r",
        mutable: false,
        annotation: null,
        init: invokeExpr,
        range: span(),
      } as unknown as ThetaBody["statements"][number],
    ],
    tail: { kind: "ident", name: "r", range: span() } as unknown as Expr,
  };
}

/** The bound `Err(InvokeInfraError)` a `bodyWithBoundInvoke` execution's tail carries. */
function boundInvokeError(outcome: { execution: { result: { value?: unknown } } }): {
  ok: boolean;
  error?: { kind?: string; cause?: string; message?: string };
} {
  return outcome.execution.result.value as {
    ok: boolean;
    error?: { kind?: string; cause?: string; message?: string };
  };
}

// ===========================================================================
// V2/V3 — cwd VALUE validation (empty string / non-string) aborts pre-spawn,
// AND the validation Err's shape/message is asserted verbatim (finding-4;
// seam sheet §4.2 pinned strings).
// ===========================================================================

describe("RFC 0009 failure arms — V2/V3: an invalid cwd VALUE aborts before any spawn, with a pinned validation Err", () => {
  it("V2: an empty string value never inherits the parent cwd — aborts pre-spawn with Err(InvokeInfraError{cause:'validation', message:'...cwd is empty'}) (RED)", async () => {
    const outcome = await driveCaller({
      callerBody: bodyWithBoundInvoke(CHILD_LITERAL, withClause(strExpr(""))),
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, subagentCallee("/thetadir/child.theta")]]),
    });
    // RED at HEAD: the empty-string clause value is never read, so the call
    // proceeds as if no clause were written and a child spawns under
    // `CALLER_CWD` — the exact silent-inherit INV-6 refuses.
    expect(
      outcome.spawns,
      "an empty-string cwd must abort BEFORE spawn: no child may be launched",
    ).toHaveLength(0);
    const err = boundInvokeError(outcome);
    expect(err.ok, "the bound invoke result is Err").toBe(false);
    expect(
      err.error?.cause,
      "RED if cause !== 'validation': an empty cwd is an authoring bug, not an internal error",
    ).toBe("validation");
    expect(
      err.error?.message,
      "seam sheet §4.2 pins the message verbatim: `invoke callee '<callee>' with-clause cwd is empty`",
    ).toBe(`invoke callee '${CHILD_LITERAL}' with-clause cwd is empty`);
  });

  it("V3: a non-string value (statically laundered) is Err(InvokeInfraError{cause:'validation', message:'...is not a string'}), not a coerced spawn (RED)", async () => {
    // A number literal cast into the value position — `evaluatePureExpression`
    // would evaluate it to a `ThetaValue` number, never a string, so the
    // runtime guard (not a parse-time type check) is the one under test.
    const outcome = await driveCaller({
      callerBody: bodyWithBoundInvoke(CHILD_LITERAL, withClause(numberValue)),
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, subagentCallee("/thetadir/child.theta")]]),
    });
    expect(
      outcome.spawns,
      "a non-string cwd must abort BEFORE spawn: no child may be launched",
    ).toHaveLength(0);
    const err = boundInvokeError(outcome);
    expect(err.ok, "the bound invoke result is Err").toBe(false);
    expect(
      err.error?.cause,
      "RED if cause !== 'validation': a non-string cwd is an authoring bug, not an internal error",
    ).toBe("validation");
    expect(
      err.error?.message,
      "seam sheet §4.2 pins the message verbatim: `invoke callee '<callee>' with-clause cwd is not a string`",
    ).toBe(`invoke callee '${CHILD_LITERAL}' with-clause cwd is not a string`);
  });
});

// ===========================================================================
// V4 (finding-4) — a clause value of provably NON-STRING STATIC type draws
// the F3-widened arg-type code per surface: `theta/parse/invoke-arg-type-mismatch`
// on invoke(...), `theta/parse/tool-arg-type-mismatch` on the `.theta`-callable
// surface (code-registry-parse.md :145/:146 Triggers).
// ===========================================================================

describe("RFC 0009 failure arms — V4: a statically-provable non-string clause value draws the F3-widened arg-type code per surface", () => {
  const RESOLVED_THETA_ROOT = resolvePath("/thetadir").replace(/\\/g, "/");
  const RESOLVED_CALLEE = resolvePath("/thetadir", "./callee.theta").replace(/\\/g, "/");

  function subagentArity(): Promise<CalleeArity | undefined> {
    return Promise.resolve({
      requiredCount: 0,
      totalCount: 0,
      fields: [],
      mode: "subagent",
    } as unknown as CalleeArity);
  }

  it("invoke(...) surface: `with { cwd: 42 }` draws theta/parse/invoke-arg-type-mismatch (RED)", async () => {
    const invoke = {
      kind: "invoke",
      path: "./callee.theta",
      returnSchema: null,
      args: [],
      range: span(),
      withClause: withClause(numberValue),
    } as unknown as InvokeExpr;
    const body: ThetaBody = {
      statements: [{ kind: "invoke", invoke, range: span() } as unknown as ThetaBody["statements"][number]],
      tail: null,
    };
    const input: ThetaCompositionInput = {
      slashName: "caller",
      sourcePath: "/thetadir/caller.theta",
      frontmatter: {} as unknown as ParsedFrontmatter,
      body,
    };
    const diags = await checkInvokeStaticResolution(input, {
      fs: new FakeFileSystem({
        homedir: "/home/u",
        cwd: "/theta",
        files: { [RESOLVED_CALLEE]: "theta", [RESOLVED_THETA_ROOT]: "" },
        dirs: { [RESOLVED_THETA_ROOT]: [] },
      }),
      activeRoots: [RESOLVED_THETA_ROOT],
      graph: { edges: new Map([["caller", []]]), unresolvable: new Set<string>() },
      resolveCalleeArity: subagentArity,
    });
    expect(
      diags.map((d) => d.code),
      `expected theta/parse/invoke-arg-type-mismatch among ${JSON.stringify(diags.map((d) => d.code))}`,
    ).toContain("theta/parse/invoke-arg-type-mismatch");
  });

  it(".theta-callable surface: `helper(1) with { cwd: 42 }` draws theta/parse/tool-arg-type-mismatch (RED)", async () => {
    const call = {
      kind: "call",
      callee: "helper",
      args: [],
      range: span(),
      withClause: withClause(numberValue),
    } as unknown as CallExpr;
    const letStmt = {
      kind: "let",
      name: "x",
      mutable: false,
      annotation: null,
      init: call,
      range: span(),
    };
    const body: ThetaBody = {
      statements: [letStmt as unknown as ThetaBody["statements"][number]],
      tail: null,
    };
    const callableSet: CallableSetSnapshot = {
      entries: new Map<string, { kind: "theta"; mode: "subagent"; calleePath: string }>([
        ["helper", { kind: "theta", mode: "subagent", calleePath: "./helper.theta" }],
      ]) as unknown as CallableSetSnapshot["entries"],
    } as unknown as CallableSetSnapshot;
    const input: ThetaCompositionInput = {
      slashName: "caller",
      sourcePath: "/thetadir/caller.theta",
      frontmatter: {} as unknown as ParsedFrontmatter,
      body,
    };
    const diags = await checkInvokeStaticResolution(input, {
      fs: new FakeFileSystem({ homedir: "/home/u", cwd: "/theta", files: {}, dirs: {} }),
      activeRoots: ["/theta"],
      graph: { edges: new Map([["caller", []]]), unresolvable: new Set<string>() },
      resolveCalleeArity: subagentArity,
      callableSet,
    });
    expect(
      diags.map((d) => d.code),
      `expected theta/parse/tool-arg-type-mismatch among ${JSON.stringify(diags.map((d) => d.code))}`,
    ).toContain("theta/parse/tool-arg-type-mismatch");
  });
});

// ===========================================================================
// V9/V10 — a panic / `?`-on-Err inside the clause value aborts pre-spawn.
// ===========================================================================

describe("RFC 0009 failure arms — V9/V10: a panic or `?`-raise inside the clause value aborts before spawn", () => {
  // NEW RED DIRECTION (post-repair): the cwd expression is evaluated
  // synchronously in `#resolveInvoke` (via `evaluateCallSiteCwd` ->
  // `evaluatePureExpression`), BEFORE `#buildInvokeChild`'s `drive()` is ever
  // constructed or called — so a panicking/raising value throws (the SAME
  // throw route the argument position already uses) out of `executeBody`
  // before any spawn function is invoked. This reds again if: (a) the throw
  // stops happening or changes class (regresses to a silently-swallowed
  // panic, or routes through a different, non-symmetric mechanism —
  // `rejects.toThrow(<PanicClass>)` fails), or (b) a spawn is recorded
  // despite the throw (the cwd evaluation moved to AFTER dispatch begins).
  it("V9: `null.missing` inside the clause value panics with NullMemberAccessPanic before any spawn (repaired: pins the abort ROUTE, not just an outcome shape)", async () => {
    const launcher = makeFakeJsonChildLauncher();
    await expect(
      driveCaller({
        callerBody: bodyWithInvoke(CHILD_LITERAL, withClause(memberOnNull("missing"))),
        callerCtx: driveCtx(CALLER_CWD),
        callees: new Map([[CHILD_LITERAL, subagentCallee("/thetadir/child.theta")]]),
        onSpawn: autoRespondingSpawn(launcher.spawn),
      }),
    ).rejects.toThrow(NullMemberAccessPanic);
    expect(
      launcher.spawns,
      "a panicking cwd expression must abort BEFORE any spawn",
    ).toHaveLength(0);
  });

  it("V10: `Err('boom')?` inside the clause value raises InterpolatedResultPanic before any spawn (repaired: pins the abort ROUTE, not just an outcome shape)", async () => {
    const launcher = makeFakeJsonChildLauncher();
    await expect(
      driveCaller({
        callerBody: bodyWithInvoke(CHILD_LITERAL, withClause(tryErr("boom"))),
        callerCtx: driveCtx(CALLER_CWD),
        callees: new Map([[CHILD_LITERAL, subagentCallee("/thetadir/child.theta")]]),
        onSpawn: autoRespondingSpawn(launcher.spawn),
      }),
    ).rejects.toThrow(InterpolatedResultPanic);
    expect(
      launcher.spawns,
      "a `?`-raising cwd expression must abort BEFORE any spawn",
    ).toHaveLength(0);
  });
});

// ===========================================================================
// Row 7 — runtime prompt-mode-callee gate (not statically resolvable).
// ===========================================================================

describe("RFC 0009 failure arms — row 7: a runtime-prompt-mode callee under a clause never spawns/attaches", () => {
  // NEW RED DIRECTION (post-repair): a bare `invoke(...)` STATEMENT discards
  // its result by language semantics (statement-executor.ts `case "invoke"`),
  // so `execution.outcome !== "success"` is the WRONG contract — a
  // spec-faithful implementation completes on the success path with the Err
  // simply discarded. This cell instead BINDS the invoke result (`let r =
  // invoke(...); r`) so the runtime validation Err becomes the body's
  // returned value, and asserts on THAT: it reds again if the returned value
  // stops being `Err(InvokeInfraError{cause:"validation"})` (e.g. the gate
  // stops firing and the value becomes `Ok(null)`, or `cause` drifts to some
  // other tag), or if a spawn is recorded despite the gate.
  it("a clause on a callee that turns out prompt-mode at runtime refuses before any spawn, and the refusal is observable once the invoke result is bound", async () => {
    const promptCallee = {
      sourcePath: "/thetadir/child.theta",
      frontmatter: { mode: "prompt" } as unknown as import("../src/parser/frontmatter").ParsedFrontmatter,
      body: { statements: [], tail: { kind: "string", value: "hi", range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } } as unknown as import("../src/parser/theta-document").Expr },
    };
    const invokeExpr = {
      kind: "invoke",
      path: CHILD_LITERAL,
      returnSchema: null,
      args: [],
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
      withClause: withClause(strExpr("sub/dir")),
    } as unknown as InvokeExpr;
    const callerBody: ThetaBody = {
      statements: [
        {
          kind: "let",
          name: "r",
          mutable: false,
          annotation: null,
          init: invokeExpr,
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
        } as unknown as ThetaBody["statements"][number],
      ],
      tail: { kind: "ident", name: "r", range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } } as unknown as Expr,
    };
    const outcome = await driveCaller({
      callerBody,
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, promptCallee]]),
    });
    // The runtime prompt-mode gate must fire BEFORE any dispatch: no spawn,
    // regardless of which path (attach vs spawn) would otherwise run.
    expect(outcome.spawns, "a prompt-mode callee never spawns a child").toHaveLength(0);
    // A bare invoke statement discards its result (statement-executor.ts `case
    // "invoke"`) — correct spec-faithful behaviour completes on "success" even
    // though the runtime gate refused the callee. Binding the result is what
    // makes the refusal author-visible.
    expect(
      outcome.execution.outcome,
      "a bound invoke's gate-refused Err still completes the body on the success path",
    ).toBe("success");
    const bound = outcome.execution.result.value as { ok: boolean; error?: { kind?: string; cause?: string } } | null;
    expect(bound?.ok, "RED if the bound invoke result stops being Err: the runtime prompt-mode gate stopped firing").toBe(false);
    expect(bound?.error?.kind).toBe("invoke_infra");
    expect(
      bound?.error?.cause,
      "RED if cause !== 'validation': the runtime prompt-mode gate's disposition drifted",
    ).toBe("validation");
  });
});

// ===========================================================================
// R2 — spawn-ENOENT diagnostic enrichment (INV-7, par. 4.6).
// ===========================================================================

function host(overrides: Partial<ExecutableHost>): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (p): boolean => /(?:^|\/)(?:node|bun)$/.test(p),
    ...overrides,
  };
}

function launchRequest(overrides?: Partial<SubagentLaunchRequest>): SubagentLaunchRequest {
  return {
    argv: {
      slug: "child",
      thetaDirs: ["/work/project/.pi/theta"],
      systemPrompt: "you are a subagent",
      hostTools: [],
      noHostTools: true,
      provider: "anthropic",
      model: "claude-sonnet",
      projectTrust: false,
    },
    cwd: "/work/project/sub/dir",
    parentEnv: { PATH: "/usr/bin" },
    parentPid: 999,
    invokeDepth: 0,
    host: host({}),
    ...overrides,
  };
}

describe("RFC 0009 failure arms — R2: theta/runtime/subagent-spawn-failed names the offending cwd", () => {
  it("an ENOENT that does not name the cwd is enriched with '(cwd: <resolved>)' (RED — no enrichment at HEAD)", () => {
    const launcher = makeFakeJsonChildLauncher();
    launcher.failNextSpawn(enoentSpawnError("/usr/bin/node"));
    const emitted: Diagnostic[] = [];
    const result = launchSubagentChild(launchRequest(), {
      spawn: launcher.spawn,
      emitDiagnostic: (d): void => {
        emitted.push(d);
      },
    });
    expect(result.ok).toBe(false);
    const message = emitted.find((d) => d.code === "theta/runtime/subagent-spawn-failed")?.message;
    expect(message, "precondition: the spawn-failed diagnostic was emitted").toBeDefined();
    // RED at HEAD: the message is `subagent child spawn failed: <raw>` with no
    // `(cwd: …)` suffix, because the raw ENOENT text names the executable, not
    // the cwd.
    expect(message).toContain(`(cwd: ${resolvePath("/work/project/sub/dir")})`);
  });

  it("an OS error that already names the cwd is carried verbatim, with no duplicate suffix (green control)", () => {
    const launcher = makeFakeJsonChildLauncher();
    const cwd = "/work/project/sub/dir";
    const err = new Error(`spawn /usr/bin/node ENOENT (chdir to ${cwd} failed)`) as NodeJS.ErrnoException;
    err.code = "ENOENT";
    launcher.failNextSpawn(err);
    const emitted: Diagnostic[] = [];
    launchSubagentChild(launchRequest({ cwd }), {
      spawn: launcher.spawn,
      emitDiagnostic: (d): void => {
        emitted.push(d);
      },
    });
    const message = emitted.find((d) => d.code === "theta/runtime/subagent-spawn-failed")?.message;
    expect(message).toBeDefined();
    expect(message).toContain(cwd);
    // Sanity: since the raw text already contains the cwd, the fix's guard
    // must not append a SECOND copy — this holds both before and after (no
    // enrichment happens either way pre-fix; post-fix the `includes` guard
    // skips re-appending).
    expect(message!.split(cwd)).toHaveLength(2);
  });
});

// ===========================================================================
// Row 11 (finding-2) — the runtime Pi-tool belt
// (effectful-statement-host.ts:408). Statically unreachable for a registered
// theta (the load pass rejects
// `theta/parse/with-clause-pi-tool`); this witnesses the belt for a
// snapshot-less harness input reaching `runToolCallEffect`'s Pi-tool branch
// directly — driven via the real `executeBody` statement-executor route, a
// structurally-cast `withClause` on a `CallExpr` whose `classifyCall` is
// absent (defaults every call to Pi-tool routing per the host's own doc
// comment).
// ===========================================================================

function span2() {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

const SEAM_NOOP_SINK: ToolLoweringSink = {
  runtimeEvent(): void {},
  diagnostic(): void {},
  systemNote(): void {},
};

const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};

describe("RFC 0009 failure arms — row 11: the runtime Pi-tool belt refuses a clause-bearing call before dispatch (RED)", () => {
  it("a clause-bearing Pi-tool call reaching runToolCallEffect directly is refused with Err(InvokeInfraError{cause:'validation'}), never executed", async () => {
    const call = {
      kind: "call",
      callee: "read",
      args: [],
      range: span2(),
      withClause: withClause(strExpr("sub/dir")),
    } as unknown as CallExpr;
    const body: ThetaBody = { statements: [], tail: call as unknown as Expr };

    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint: { before: (): Promise<void> => Promise.resolve() },
      signal: new AbortController().signal,
      sink: SEAM_NOOP_SINK,
      file: "caller.theta",
      evaluatePure(): never {
        throw new Error("no pure sub-expression is evaluated in this seam");
      },
      resolveQuery(): never {
        throw new Error("no query is executed in this seam");
      },
      // The belt must fire BEFORE `resolveToolCall` is ever consulted — reaching
      // this dep is itself a RED signature (the clause was silently ignored
      // and the Pi-tool dispatch was attempted).
      resolveToolCall(): never {
        throw new Error(
          "RED: resolveToolCall must never be reached — the row-11 belt must refuse the clause BEFORE any tool dispatch",
        );
      },
      resolveInvoke(): never {
        throw new Error("no invoke(...) expr in this seam");
      },
      // Absent `classifyCall`: every call is treated as a Pi tool (the host's
      // own doc comment), which is exactly the row-11 recipe — a snapshot-less
      // caller with no callable-set classification to route by.
    };
    const execDeps: ExecuteBodyDeps = {
      env: buildEnvironment({ body: { statements: [], tail: null } }),
      host: createEffectfulStatementHost(hostDeps),
      checkpoint: hostDeps.checkpoint,
      signal: hostDeps.signal,
      mutator: SEAM_NOOP_MUTATOR,
      mode: "prompt" as DrivenConversationMode,
      file: "caller.theta",
    };
    const exec = await executeBody(body, execDeps);
    expect(exec.outcome, "the body completes on the success path — the tail value carries the refusal").toBe(
      "success",
    );
    const value = exec.result.value as ResultValue;
    expect(value.ok, "RED if the clause was silently ignored and the tail became Ok (the tool would have dispatched)").toBe(
      false,
    );
    const error = (value as unknown as { readonly error: { kind?: string; cause?: string; message?: string } }).error;
    expect(error.kind).toBe("invoke_infra");
    expect(error.cause, "RED if cause !== 'validation': the belt's disposition drifted").toBe("validation");
    expect(
      error.message,
      "seam sheet §4.5 pins the message verbatim: `with clause is not applicable to Pi tool '<name>'`",
    ).toBe("with clause is not applicable to Pi tool 'read'");
  });
});
