// RFC 0009 (V21a-T) — call-site `with { cwd }` DIGEST STABILITY (R3).
//
// Spec: docs/rfcs/0009-per-call-subagent-cwd.md §Testing strategy ("Hash
// stability"); pi-integration-contract/subagent.md #subagent-theta-callable-hash
// ("cwd is not a digest input"); src/runtime/subagent-callable-hash.ts.
//
// EXPECTED COLOUR: this whole file is a NON-PERTURBATION PIN, not a feature
// red. `hashCallableClosure` digests only `ClosureSource.content` — `path` is
// a sort key contributing zero bytes, and the RFC 0009 design adds no launch-
// request field to the digest input — so every assertion here is GREEN both
// before and after the implementation lands. Its job is to prove the property
// *stays* true once the clause exists (a future change that fed `cwd` into
// the digest would red this file), matching the AGENTS.md "verify both
// directions" discipline for a property under active change nearby.

import { describe, expect, it } from "vitest";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { hashCallableClosure, SUBAGENT_CALLABLE_HASHES_ENV } from "../src/runtime/subagent-callable-hash";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { fakeExecutableHost, makeFakeJsonChildLauncher } from "./helpers/fake-json-child";
import {
  autoRespondingSpawn,
  bodyWithInvoke,
  driveCtx,
  noopPi,
  rootDouble,
  strExpr,
  trivialSubagentBody,
  withClause,
} from "./helpers/call-with-clause-harness";

const CHILD_LITERAL = "./child.theta";

// ===========================================================================
// hashCallableClosure — content-only, path-spelling invariance.
// ===========================================================================

describe("RFC 0009 hash stability — hashCallableClosure digests CONTENT only, never a path spelling", () => {
  it("two closures with identical content but differently-spelled paths hash identically", () => {
    const a = hashCallableClosure([{ path: "/thetadir/child.theta", content: "---\nmode: subagent\n---\n@`hi`\n" }]);
    const b = hashCallableClosure([{ path: "C:\\theta\\child.theta", content: "---\nmode: subagent\n---\n@`hi`\n" }]);
    expect(a).toBe(b);
  });

  it("path is a SORT key only: the same source set in a different array order hashes identically", () => {
    const one = hashCallableClosure([
      { path: "/thetadir/a.theta", content: "A" },
      { path: "/thetadir/b.thetalib", content: "B" },
    ]);
    const reordered = hashCallableClosure([
      { path: "/thetadir/b.thetalib", content: "B" },
      { path: "/thetadir/a.theta", content: "A" },
    ]);
    expect(one).toBe(reordered);
  });

  it("a content byte change perturbs the digest (the digest is not a constant / no-op)", () => {
    const before = hashCallableClosure([{ path: "/thetadir/child.theta", content: "A" }]);
    const after = hashCallableClosure([{ path: "/thetadir/child.theta", content: "B" }]);
    expect(before).not.toBe(after);
  });
});

// ===========================================================================
// R3 — the marshalled PI_THETA_SUBAGENT_CALLABLE_HASHES carrier is
// byte-identical for one callee dispatched with vs without a call-site clause.
// ===========================================================================

function calleeWithRootHash(): ThetaCompositionInput {
  return {
    slashName: "child",
    sourcePath: "/thetadir/child.theta",
    frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
    body: trivialSubagentBody(),
    callableSet: { entries: new Map() },
    // The load-captured root closure hash a real discovery pass would stamp
    // (cast — RFC 0009 adds no new field here; this mirrors the existing
    // `rootClosureHash` shape bug 0328 introduced).
    rootClosureHash: { name: "child", hash: "sha256:FIXED" },
  } as unknown as ThetaCompositionInput;
}

async function spawnEnvFor(withCwdClause: boolean): Promise<Record<string, string | undefined>> {
  const launcher = makeFakeJsonChildLauncher();
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    parseCallee: () => Promise.resolve({ kind: "ok" as const, input: calleeWithRootHash() }),
    subagentSpawn: autoRespondingSpawn(launcher.spawn),
    subagentExecutableHost: fakeExecutableHost(),
    subagentParentEnv: {},
    subagentParentPid: 4242,
  });
  const callerTheta: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/thetadir/caller.theta",
    frontmatter: { mode: "prompt" } as unknown as ParsedFrontmatter,
    body: bodyWithInvoke(CHILD_LITERAL, withCwdClause ? withClause(strExpr("sub/dir")) : undefined),
    callableSet: { entries: new Map() },
  } as ThetaCompositionInput;
  const binding = deps.bindPromptConversation({ theta: callerTheta, args: "", ctx: driveCtx("/work/project") });
  const { executeBody } = await import("../src/runtime/statement-executor");
  await executeBody(callerTheta.body, binding.executeDeps);
  expect(launcher.spawns, "precondition: exactly one child spawned").toHaveLength(1);
  return launcher.spawns[0]!.env;
}

describe("RFC 0009 hash stability — R3: the marshalled hash carrier does not vary with the clause", () => {
  it("the SUBAGENT_CALLABLE_HASHES env is byte-identical with and without a call-site cwd clause", async () => {
    const withoutClause = await spawnEnvFor(false);
    const withClauseEnv = await spawnEnvFor(true);
    expect(withClauseEnv[SUBAGENT_CALLABLE_HASHES_ENV]).toBe(withoutClause[SUBAGENT_CALLABLE_HASHES_ENV]);
  });
});
