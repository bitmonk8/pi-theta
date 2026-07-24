// RFC-0006 — child-side subagent-root drive wiring (PIC-58/59/60/62).
//
// Asserts the COMPOSITION SHAPE of the child leg the parent-side switchover
// depends on: when the subagent-root regime marks THIS process as the root child
// for a theta, the production producer (a) reports `isSubagentRootFor` true and
// (b) `driveSubagentRootRegime` runs the callee in-process against the child's
// own host session (prompt-mode mechanics) and emits the single `theta_result`
// stdout envelope carrying the callee's terminal FINAL VALUE (FN-5 fidelity, NOT
// prompt-mode trailing-turn text) on the normal-return path.
//
// The real child-side query/agent-loop mechanics are live-only; this drives the
// wiring over fakes (empty session, injected `emitResultEnvelope`) per the
// repo's production-wiring test precedent. The envelope serialisation, params
// intake, and model confirmation seams are separately unit-tested (their leaf
// suites).
//
// Spec: pi-integration-contract/subagent.md PIC-58/PIC-59; invocation.md FN-5.

import { describe, expect, it } from "vitest";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseExpressionSource } from "../src/parser/theta-document";
import { parseEnvelopeLine } from "../src/runtime/subagent-envelope";
import type { EncodedToolRequest, HostToolResult } from "../src/runtime/host-loop-dispatch";

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
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: { compile: () => ({ validate: () => ({ ok: true as const }) }) },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}

function subagentTheta(tail: string): ThetaCompositionInput {
  return {
    slashName: "worker",
    sourcePath: "/theta/worker.theta",
    frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
    body: { statements: [], tail: parseExpressionSource(tail) },
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
}

function childCtx(): ExtensionCommandContext {
  return {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
    // The child's own (empty) host session — the regime drives against it.
    sessionManager: { getEntries: () => [], getLeafId: () => undefined },
  } as unknown as ExtensionCommandContext;
}

describe("RFC-0006 — child-side subagent-root drive wiring", () => {
  it("reports isSubagentRootFor true when the regime marks this process as the root child for the theta", () => {
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootDouble(),
      modelRegistry: { getAvailable: () => [] } as unknown as ModelRegistry,
      subagentRootRegime: { active: true, slug: "worker" },
    });
    expect(deps.isSubagentRootFor?.(subagentTheta('"x"'))).toBe(true);
    // A DIFFERENT slug (a nested callee) is NOT the process root.
    expect(deps.isSubagentRootFor?.(subagentTheta('"x"') && { ...subagentTheta('"x"'), slashName: "other" } as ThetaCompositionInput)).toBe(false);
  });

  it("driveSubagentRootRegime emits ONE theta_result Ok envelope carrying the callee's final value (FN-5)", async () => {
    const lines: string[] = [];
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootDouble(),
      modelRegistry: {
        getAvailable: () => [{ id: "claude-test", provider: "anthropic" }],
      } as unknown as ModelRegistry,
      subagentParentEnv: {},
      subagentRootRegime: { active: true, slug: "worker" },
      emitResultEnvelope: (line: string) => lines.push(line),
    });

    // A literal tail so the callee's FINAL VALUE is the string — proving the
    // envelope carries the final value, not prompt-mode trailing-turn text.
    await deps.driveSubagentRootRegime!({
      theta: subagentTheta('"CHILD-FINAL"'),
      args: "",
      ctx: childCtx(),
      thetaAbort: new AbortController(),
    });

    expect(lines).toHaveLength(1);
    const parsed = parseEnvelopeLine(lines[0]!.trimEnd());
    expect(parsed.kind).toBe("ok");
    if (parsed.kind === "ok") {
      expect(parsed.value).toBe("CHILD-FINAL");
    }
  });

  it("PIC-61 rung 2: a child-side code-side EXTENSION-tool call routes through the wired hostLoopDispatch seam with the verbatim request", async () => {
    // The theta's body code-side-calls `extTool` (an extension tool: present in
    // no callable-set `pi-tool` entry, so it has no parent-side `execute`). Under
    // the subagent-root regime with the host-loop rung wired, the producer's
    // `#dispatchExtensionToolChildSide` MUST route the call through the injected
    // `hostLoopDispatch` seam (PIC-61 rung 2), carrying the code-supplied
    // arguments VERBATIM, and surface the host-loop result as the tool value.
    const seen: EncodedToolRequest[] = [];
    const lines: string[] = [];
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootDouble(),
      modelRegistry: {
        getAvailable: () => [{ id: "claude-test", provider: "anthropic" }],
      } as unknown as ModelRegistry,
      subagentParentEnv: {},
      subagentRootRegime: { active: true, slug: "worker" },
      emitResultEnvelope: (line: string) => lines.push(line),
      // The wired host-loop dispatch rung (child-side). Its presence makes the
      // derived ladder probe resolve `host-loop`.
      hostLoopDispatch: (request: EncodedToolRequest): Promise<HostToolResult> => {
        seen.push(request);
        return Promise.resolve({
          content: [{ type: "text", text: "HOST-LOOP-RAN" }],
          isError: false,
        });
      },
    });

    await deps.driveSubagentRootRegime!({
      theta: subagentTheta('extTool({ op: "write" })?'),
      args: "",
      ctx: childCtx(),
      thetaAbort: new AbortController(),
    });

    // The seam was reached with the verbatim code-supplied request.
    expect(seen).toEqual([{ toolName: "extTool", args: { op: "write" } }]);
    // The host-loop result flows back as the tool value (unwrapped by `?`), so
    // the callee's final value / envelope carries it.
    expect(lines).toHaveLength(1);
    const parsed = parseEnvelopeLine(lines[0]!.trimEnd());
    expect(parsed.kind).toBe("ok");
    if (parsed.kind === "ok") {
      expect(parsed.value).toBe("HOST-LOOP-RAN");
    }
  });

  it("PIC-62: a marshalled model reference that resolves to NO child-registry model fails the pre-flight (not masked)", async () => {
    // The child's own registry holds a DIFFERENT model than the marshalled
    // reference (`claude-test`), so `matchAvailableModel` finds no match. Per
    // PIC-62 obligation 2 this is total non-resolution and MUST fail the
    // pre-flight — it must NOT be masked by confirming the reference against
    // itself. The failure surfaces through the return envelope.
    const lines: string[] = [];
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootDouble(),
      modelRegistry: {
        getAvailable: () => [{ id: "some-other-model", provider: "anthropic" }],
      } as unknown as ModelRegistry,
      subagentParentEnv: {},
      subagentRootRegime: { active: true, slug: "worker" },
      emitResultEnvelope: (line: string) => lines.push(line),
    });

    await deps.driveSubagentRootRegime!({
      theta: subagentTheta('"CHILD-FINAL"'),
      args: "",
      ctx: childCtx(),
      thetaAbort: new AbortController(),
    });

    expect(lines).toHaveLength(1);
    const parsed = parseEnvelopeLine(lines[0]!.trimEnd());
    expect(parsed.kind).toBe("err");
    if (parsed.kind === "err") {
      expect(parsed.error.kind).toBe("invoke_infra");
      expect((parsed.error as { cause?: string }).cause).toBe(
        "subagent_model_preflight_mismatch",
      );
      // The message names BOTH the expected id and an explicit unresolved marker
      // — not `claude-test` twice (which the masked `?? model.id` would produce).
      expect((parsed.error as { message?: string }).message).toContain("claude-test");
      expect((parsed.error as { message?: string }).message).toContain("unresolved");
    }
  });
});
