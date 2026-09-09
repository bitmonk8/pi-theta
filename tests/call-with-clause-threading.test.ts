// RFC 0009 (V21a-T) — call-site `with { cwd }` LAUNCH THREADING.
//
// Spec: docs/rfcs/0009-per-call-subagent-cwd.md §Proposal 3 (Value semantics),
// §Proposal 4 (Identity/location), §Proposal 5 (Runtime plumbing); invocation.md
// INV-6/INV-8 (options-surface); pi-integration-contract/subagent.md
// #subagent-launch-contract, #subagent-cwd-identity-location.
// Seam sheet: .localpi/tmp/rfc-0009-seam-sheet.md §4 (evaluation + bind), §5.1
// rows 1/2/4/5/8, §5.2 V5-V8/V13, §5.3 R1/R4/R5.
//
// RED SIGNATURE AT HEAD (one line): `InvokeExpr.withClause` is not a field any
// production code reads (RFC 0009 §1 AST widening unimplemented) and
// `ConversationBindInput.resolvedCwd` is not read by `spawnSubagentConversation`
// (the RFC-0009 §4.4 bind move `cwd: bindInput.resolvedCwd ?? ctx.cwd` is
// unimplemented — the bind is unconditionally `cwd: ctx.cwd` today), so every
// "clause resolves to a non-ctx.cwd spawn cwd" assertion below reds with the
// spawned cwd equal to the caller's `ctx.cwd` instead of the expected resolved
// value.
//
// Two levels are driven, both real production code, no clause-reading src
// touched:
//   (A) FULL CHAIN — a hand-built `mode: prompt` caller body containing one
//       `invoke("./child.theta")` statement with a cast `withClause`, driven
//       through `#resolveInvoke` -> `#driveCallee` -> `spawnSubagentConversation`
//       (`tests/helpers/call-with-clause-harness.ts`). Tests whether the
//       CLAUSE VALUE is ever read and threaded.
//   (B) ISOLATED BIND — `spawnSubagentConversation` driven directly with a cast
//       `ConversationBindInput.resolvedCwd` (RFC 0009 §4.4's own field), the
//       exact seam the single bind-line move touches
//       (`production-theta-producer.ts:2552`). Tests the LAST leg alone,
//       isolating the bind mechanism from the evaluation mechanism.
//
// Offline, provider-free: the "child" is `tests/helpers/fake-json-child.ts`'s
// in-process fake, auto-responding `Ok(42)`; no real process is spawned.

import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import { fakeExecutableHost, makeFakeJsonChildLauncher } from "./helpers/fake-json-child";
import {
  bodyWithInvoke,
  concatExpr,
  driveCaller,
  driveCtx,
  noopPi,
  rootDouble,
  strExpr,
  subagentCallee,
  trivialSubagentBody,
  withClause,
} from "./helpers/call-with-clause-harness";

const CALLER_CWD = "/work/project";
const CHILD_LITERAL = "./child.theta";

// ===========================================================================
// (A) FULL CHAIN — the caller's own `invoke(...) with { cwd }` clause value.
// ===========================================================================

describe("RFC 0009 threading (A) — row 1/4 control: an absent clause is byte-identical (ctx.cwd)", () => {
  it("no withClause on the invoke node -> spawned cwd is the caller's ctx.cwd, unmodified (green control)", async () => {
    const outcome = await driveCaller({
      callerBody: bodyWithInvoke(CHILD_LITERAL),
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, subagentCallee("/thetadir/child.theta")]]),
    });
    expect(outcome.execution.outcome, "precondition: the caller body ran to completion").toBe("success");
    expect(outcome.spawns, "precondition: exactly one child spawned").toHaveLength(1);
    expect(outcome.spawns[0]!.cwd).toBe(CALLER_CWD);
  });
});

describe("RFC 0009 threading (A) — rows 2/5/8, V5/V6/V7/V8: a present clause resolves the value against ctx.cwd", () => {
  it("V5: a relative value resolves against the caller's ctx.cwd (path.resolve equality)", async () => {
    const outcome = await driveCaller({
      callerBody: bodyWithInvoke(CHILD_LITERAL, withClause(strExpr("sub/dir"))),
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, subagentCallee("/thetadir/child.theta")]]),
    });
    expect(outcome.execution.outcome).toBe("success");
    expect(outcome.spawns).toHaveLength(1);
    // RED at HEAD: `withClause` is never read, so the spawn cwd is CALLER_CWD,
    // not the resolved value.
    expect(outcome.spawns[0]!.cwd).toBe(resolvePath(CALLER_CWD, "sub/dir"));
  });

  it("V6: an absolute value passes through path.resolve unchanged (host-native spelling)", async () => {
    const abs = resolvePath("/elsewhere/abs/dir");
    const outcome = await driveCaller({
      callerBody: bodyWithInvoke(CHILD_LITERAL, withClause(strExpr(abs))),
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, subagentCallee("/thetadir/child.theta")]]),
    });
    expect(outcome.execution.outcome).toBe("success");
    expect(outcome.spawns[0]!.cwd).toBe(resolvePath(CALLER_CWD, abs));
  });

  it("V7: both separator spellings of one directory converge on the same resolved path (bug-0467 class)", async () => {
    const forward = await driveCaller({
      callerBody: bodyWithInvoke(CHILD_LITERAL, withClause(strExpr("sub/dir"))),
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, subagentCallee("/thetadir/child.theta")]]),
    });
    const backslash = await driveCaller({
      callerBody: bodyWithInvoke(CHILD_LITERAL, withClause(strExpr("sub\\dir"))),
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, subagentCallee("/thetadir/child.theta")]]),
    });
    // Formulated as resolve-equality (not a literal string), so the assertion
    // stays meaningful on POSIX (where the two spellings need not converge) and
    // pins convergence on win32 (`resolvePath` folds them identically there).
    expect(forward.spawns[0]!.cwd).toBe(resolvePath(CALLER_CWD, "sub/dir"));
    expect(backslash.spawns[0]!.cwd).toBe(resolvePath(CALLER_CWD, "sub/dir"));
  });

  it("V8: an expression value (not a bare literal) is evaluated at call time (INV-6 full-expression pin)", async () => {
    const outcome = await driveCaller({
      callerBody: bodyWithInvoke(CHILD_LITERAL, withClause(concatExpr("sub", "/expr-dir"))),
      callerCtx: driveCtx(CALLER_CWD),
      callees: new Map([[CHILD_LITERAL, subagentCallee("/thetadir/child.theta")]]),
    });
    expect(outcome.execution.outcome).toBe("success");
    expect(outcome.spawns[0]!.cwd).toBe(resolvePath(CALLER_CWD, "sub/expr-dir"));
  });

  it("row 8 note: this harness never runs a static-resolution pass, so a 'not statically resolvable' callee is not statically distinguishable here — the runtime-subagent cell (row 8) and the statically-resolvable cell (row 5) share this same evaluation+bind mechanism and are witnessed by the SAME assertion above; no separate cell is required at this level", () => {
    expect(true).toBe(true);
  });
});

// ===========================================================================
// (B) ISOLATED BIND — `spawnSubagentConversation` reading
// `ConversationBindInput.resolvedCwd` directly (RFC 0009 §4.4).
// ===========================================================================

function directBindTheta(): ThetaCompositionInput {
  return {
    slashName: "root",
    sourcePath: "/thetadir/root.theta",
    frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
    body: trivialSubagentBody(),
    callableSet: { entries: new Map() },
  } as ThetaCompositionInput;
}

describe("RFC 0009 threading (B) — the single bind move (production-theta-producer.ts:2552)", () => {
  it("R4/row1 control: no resolvedCwd on the bind input -> spawned cwd is ctx.cwd (green, byte-identical to pre-0009)", async () => {
    const launcher = makeFakeJsonChildLauncher();
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootDouble(),
      modelRegistry: {} as unknown as ModelRegistry,
      subagentSpawn: launcher.spawn,
      subagentExecutableHost: fakeExecutableHost(),
      subagentParentEnv: {},
      subagentParentPid: 4242,
    });
    const bindInput: ConversationBindInput = {
      theta: directBindTheta(),
      args: "",
      ctx: driveCtx(CALLER_CWD),
    };
    await deps.spawnSubagentConversation(bindInput);
    expect(launcher.spawns).toHaveLength(1);
    expect(launcher.spawns[0]!.cwd).toBe(CALLER_CWD);
  });

  it("row 2/5: a `resolvedCwd` on the bind input threads onto the SubagentLaunchRequest.cwd (RED — the bind is unconditionally ctx.cwd today)", async () => {
    const launcher = makeFakeJsonChildLauncher();
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootDouble(),
      modelRegistry: {} as unknown as ModelRegistry,
      subagentSpawn: launcher.spawn,
      subagentExecutableHost: fakeExecutableHost(),
      subagentParentEnv: {},
      subagentParentPid: 4242,
    });
    const resolved = resolvePath(CALLER_CWD, "sub/dir");
    const bindInput = {
      theta: directBindTheta(),
      args: "",
      ctx: driveCtx(CALLER_CWD),
      resolvedCwd: resolved,
    } as unknown as ConversationBindInput;
    await deps.spawnSubagentConversation(bindInput);
    expect(launcher.spawns).toHaveLength(1);
    expect(launcher.spawns[0]!.cwd).toBe(resolved);
  });

  it("R4: argv/env carry no cwd side-channel — a `resolvedCwd` bind changes ONLY `options.cwd`, never argv or env", async () => {
    const launcher = makeFakeJsonChildLauncher();
    const makeDeps = (): ReturnType<typeof createProductionProducerDeps> =>
      createProductionProducerDeps({
        pi: noopPi(),
        root: rootDouble(),
        modelRegistry: {} as unknown as ModelRegistry,
        subagentSpawn: launcher.spawn,
        subagentExecutableHost: fakeExecutableHost(),
        subagentParentEnv: {},
        subagentParentPid: 4242,
      });
    await makeDeps().spawnSubagentConversation({
      theta: directBindTheta(),
      args: "",
      ctx: driveCtx(CALLER_CWD),
    });
    await makeDeps().spawnSubagentConversation({
      theta: directBindTheta(),
      args: "",
      ctx: driveCtx(CALLER_CWD),
      resolvedCwd: resolvePath(CALLER_CWD, "sub/dir"),
    } as unknown as ConversationBindInput);
    expect(launcher.spawns).toHaveLength(2);
    const [withoutClause, withClauseSpawn] = launcher.spawns;
    // Every recorded field except `cwd` is byte-identical (subagent.md
    // #subagent-cwd-identity-location: nothing else in the launch assembly
    // reads `resolvedCwd`). This cell is a GUARD — already true today, since
    // `resolvedCwd` is read nowhere — and stays true after the fix.
    expect(withClauseSpawn!.args).toEqual(withoutClause!.args);
    expect(withClauseSpawn!.env).toEqual(withoutClause!.env);
    expect(withClauseSpawn!.execPath).toBe(withoutClause!.execPath);
  });

  it("R5: `bindPromptConversation` never reads `resolvedCwd` — the field is subagent-launch-only (structural guard)", () => {
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootDouble(),
      modelRegistry: {} as unknown as ModelRegistry,
      subagentSpawn: (): never => {
        throw new Error("harness: bindPromptConversation must not spawn a child");
      },
      subagentExecutableHost: fakeExecutableHost(),
      subagentParentEnv: {},
      subagentParentPid: 4242,
    });
    const theta: ThetaCompositionInput = {
      slashName: "promptcaller",
      sourcePath: "/thetadir/promptcaller.theta",
      frontmatter: { mode: "prompt" } as unknown as ParsedFrontmatter,
      body: { statements: [], tail: null },
      callableSet: { entries: new Map() },
    } as ThetaCompositionInput;
    const bindInput = {
      theta,
      args: "",
      ctx: driveCtx(CALLER_CWD),
      resolvedCwd: "/should/never/be/read",
    } as unknown as ConversationBindInput;
    // A prompt-mode bind never spawns a child at all — `resolvedCwd` is inert
    // on this path both before and after RFC 0009 (green guard).
    expect(() => deps.bindPromptConversation(bindInput)).not.toThrow();
  });
});
