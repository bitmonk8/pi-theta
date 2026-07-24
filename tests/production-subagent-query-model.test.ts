// RFC-0006 re-base — the production parent-side subagent drive over the child
// return-envelope (successor of the retired RFC-0005 subagent `QueryModelDriver`).
//
// Under RFC 0005 the parent drove a remote RPC session and resolved each query
// from a terminal `agent_end` event via the (now-deleted)
// `createSubagentQueryModel`. Under RFC 0006 the WHOLE callee runs in a spawned
// child `pi --mode json -p "/<slug>"`, and the parent-side contract reduces to
// ENVELOPE CONSUMPTION (PIC-59): the production `spawnSubagentConversation`
// binding launches the child eagerly and its `drive()` awaits the single
// `theta_result` stdout envelope, mapping `ok`/`err`/child-exit to the
// invocation `Result`.
//
// This suite re-bases the old query-model coverage INTENT onto that successor
// surface, driving the REAL production `spawnSubagentConversation` over a fake
// json child (`tests/helpers/fake-json-child.ts`):
//   - an untyped/typed subagent invocation resolves the child's `Ok` envelope
//     value across the boundary (PIC-59, FN-5);
//   - the child's `Err` (transport) envelope surfaces with full fidelity, never
//     a fabricated `Ok` (#subagent-error-fidelity);
//   - a GENUINE mid-drive `thetaAbort` fire surfaces `Err(cancelled)` and wins
//     over the child-exit-without-envelope map (PIC-63);
//   - a child that exits WITHOUT an envelope maps fail-closed to
//     `Err(InvokeInfraError{cause:"internal_error"})` (PIC-59).
//
// Spec: pi-integration-contract/subagent.md PIC-59/PIC-63/#subagent-error-fidelity,
// invocation.md INV-5, cancellation.md.

import { describe, expect, it } from "vitest";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaProducerDeps, ConversationBindInput, ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { fakeExecutableHost, makeFakeJsonChildLauncher, FakeJsonChild } from "./helpers/fake-json-child";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaBody } from "../src/parser/theta-document";
import { parseExpressionSource } from "../src/parser/theta-document";
import type { QueryError, TransportError, InvokeInfraError } from "../src/runtime/query-error";
import type { ResultValue } from "../src/runtime/value";

class RecordingCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: new RecordingCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}

function subagentTheta(): ThetaCompositionInput {
  const frontmatter = { mode: "subagent" } as unknown as ParsedFrontmatter;
  const body: ThetaBody = { statements: [], tail: parseExpressionSource('"unused-parent-side"') };
  return {
    slashName: "worker",
    sourcePath: "/theta/worker.theta",
    frontmatter,
    body,
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
}

function makeDeps(): { deps: ThetaProducerDeps; launcher: ReturnType<typeof makeFakeJsonChildLauncher> } {
  const launcher = makeFakeJsonChildLauncher();
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: rootDouble(),
    modelRegistry: {
      getApiKeyAndHeaders: () => Promise.resolve({ ok: false }),
      getAvailable: () => [],
    } as unknown as ModelRegistry,
    subagentSpawn: launcher.spawn,
    subagentExecutableHost: fakeExecutableHost(),
    subagentParentEnv: {},
    subagentParentPid: 4242,
  });
  return { deps, launcher };
}

function bindInput(): ConversationBindInput {
  const ctx = {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
  } as unknown as ExtensionCommandContext;
  return { theta: subagentTheta(), args: "", ctx, thetaAbort: new AbortController() };
}

/** Bind the production subagent conversation and return the eagerly-launched fake child. */
async function bindAndLaunch(): Promise<{
  drive: () => Promise<ResultValue>;
  teardown?: () => void | Promise<void>;
  finishInvocation?: () => void;
  child: FakeJsonChild;
  abort: AbortController;
}> {
  const { deps, launcher } = makeDeps();
  const input = bindInput();
  const binding = await deps.spawnSubagentConversation(input);
  expect(launcher.spawns).toHaveLength(1);
  expect(binding.drive).toBeDefined();
  return {
    drive: binding.drive!,
    ...(binding.teardown !== undefined ? { teardown: binding.teardown } : {}),
    ...(binding.finishInvocation !== undefined ? { finishInvocation: binding.finishInvocation } : {}),
    child: launcher.spawns[0]!.child,
    abort: input.thetaAbort!,
  };
}

describe("RFC-0006 — production subagent drive maps the child envelope (PIC-59)", () => {
  it("resolves the child's Ok envelope value across the boundary (FN-5)", async () => {
    const h = await bindAndLaunch();
    const driving = h.drive();
    h.child.emitOkEnvelope({ verdict: "approved" });
    const result = await driving;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ verdict: "approved" });
    }
    await h.teardown?.();
    h.finishInvocation?.();
  });

  it("surfaces the child's Err(transport) envelope with full fidelity — never a fabricated Ok", async () => {
    const h = await bindAndLaunch();
    const driving = h.drive();
    const transport: TransportError = {
      kind: "transport",
      message: "provider 503",
      http_status: 503,
      provider: "anthropic",
      retryable: true,
    };
    h.child.emitErrEnvelope(transport as QueryError);
    const result = await driving;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as unknown as TransportError).kind).toBe("transport");
      expect((result.error as unknown as TransportError).http_status).toBe(503);
    }
    await h.teardown?.();
    h.finishInvocation?.();
  });

  it("a GENUINE mid-drive thetaAbort surfaces Err(cancelled), winning over the no-envelope map (PIC-63)", async () => {
    const h = await bindAndLaunch();
    const driving = h.drive();
    // Abort mid-drive: the parent-held stdin close makes the child exit on EOF
    // WITHOUT an envelope; the cancellation short-circuit wins.
    h.abort.abort();
    h.child.closeStdin();
    const result = await driving;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as unknown as QueryError).kind).toBe("cancelled");
    }
    await h.teardown?.();
    h.finishInvocation?.();
  });

  it("a child that exits WITHOUT an envelope maps fail-closed to Err(InvokeInfraError internal_error)", async () => {
    const h = await bindAndLaunch();
    const driving = h.drive();
    h.child.crashWith(1, null, "child boom");
    const result = await driving;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const infra = result.error as unknown as InvokeInfraError;
      expect(infra.kind).toBe("invoke_infra");
      expect(infra.cause).toBe("internal_error");
    }
    await h.teardown?.();
    h.finishInvocation?.();
  });
});
