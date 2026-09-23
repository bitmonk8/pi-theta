// Phase 3b — production cancellation wiring (CANCEL-2/3/4/5).
//
// These tests pin the PRODUCTION wiring of the previously-unwired cancellation
// seams into `production-theta-producer.ts` / `theta-composition-producer.ts`:
//
//   - CANCEL-2 — `bindPromptConversation` gates every checkpoint on a fresh
//     per-invocation `thetaAbort.signal` (never `ctx.signal` directly, never a
//     pinned never-aborting fallback); an aborted `ctx.signal` is forwarded INTO
//     it (`forwardSlashCommandCancel`, CNCL-4 reason identity) and the
//     `agent_end` user-cancel trigger (`abortForAgentEnd`) flips the SAME
//     controller the executor holds.
//   - CANCEL-4 — `runBinder`'s genuine-binder pass gates the binder LLM call
//     behind the pre-call `binder-call` checkpoint (`runCheckpointedBinderCall`)
//     + the in-flight forwarding driver (`runBinderCallWithCancellation`); a
//     pre-call abort skips the `complete()` call, synthesises the
//     cancelled-binder system note, and returns `{ bound: false }` (the theta
//     does not run).
//   - CANCEL-3 — the code-side `execute()` dispatch attaches the construction-
//     site swallowing handler (`guardToolExecutePromise`), so a rejecting tool
//     execute() driven through the real production path raises no Node
//     `unhandledRejection` and surfaces its `Err(code_tool)` exactly once.
//
// Cancellation is NOT live-reproducible via the probe harness (no injected Esc /
// no Checkpoint seam in a live drive), so verification is against the
// Checkpoint / AbortController seams and the production composition — the
// substrate cancellation.md's race/granularity rules pin as deterministic-test.
// The pure abandonment/discard semantics (CNCL-1/2/3) and the derived-child
// controller (CANCEL-5) are covered at the seam level in
// tests/cancellation-core.test.ts, tests/*-swallowing-handler.test.ts, and
// tests/binder-call-cancellation.test.ts; here we pin the production callers.

import { createUnhandledRejectionTrap, settleAndObserve } from "./helpers/unhandled-rejection-trap";
import { RecordingCheckpoint } from "./helpers/invoke-seam-scaffold";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import type {
  BinderRunInput,
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import { abortForAgentEnd } from "../src/runtime/cancellation-core";
import { executeBody } from "../src/runtime/statement-executor";
import { rootWith, recordingPi, type RecordedMessage } from "./helpers/fixture-dispatch-harness";
import type { AgentToolResultEnvelope } from "../src/runtime/tool-call-execute";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaValue } from "../src/runtime/value";
import {
  callExpr,
  tryExpr,
  identExpr,
  objectExpr,
  strExpr as stringExpr,
  letStmt,
  statementBody as body,
  promptTheta,
} from "./helpers/tool-call-dispatch-harness";

function ctxWithSignal(signal: AbortSignal | undefined): ExtensionCommandContext {
  return { signal } as unknown as ExtensionCommandContext;
}

// ===========================================================================
// CANCEL-2 — prompt-mode signal source + forwarding into thetaAbort.
// ===========================================================================

describe("CANCEL-2 — prompt binding gates on a fresh thetaAbort (never ctx.signal directly)", () => {
  it("CANCEL-2: an aborted ctx.signal at bind time forwards INTO thetaAbort (the executor signal IS thetaAbort.signal, and carries the source reason)", () => {
    const pi = recordingPi([]);
    const deps = createProductionProducerDeps({
      pi,
      root: rootWith(new RecordingCheckpoint()),
      modelRegistry: {} as unknown as ModelRegistry,
    });
    const theta = promptTheta(body([], null));
    const thetaAbort = new AbortController();
    const escReason = new Error("esc pressed");
    const bindInput: ConversationBindInput = {
      theta,
      args: "",
      ctx: ctxWithSignal(AbortSignal.abort(escReason)),
      thetaAbort,
    };

    const binding = deps.bindPromptConversation(bindInput);

    // The executor / every checkpoint gate on thetaAbort.signal — NOT ctx.signal
    // directly, and NOT a pinned never-aborting fallback controller.
    expect(binding.executeDeps.signal).toBe(thetaAbort.signal);
    // forwardSlashCommandCancel forwarded the aborted ctx.signal into thetaAbort.
    expect(binding.executeDeps.signal.aborted).toBe(true);
    // CNCL-4 reason identity: thetaAbort.signal.reason === source.reason.
    expect(binding.executeDeps.signal.reason).toBe(escReason);
  });

  it("CANCEL-2: with an idle (undefined) ctx.signal the binding is NOT spuriously aborted, and the agent_end trigger flips the SAME controller the executor holds", () => {
    const pi = recordingPi([]);
    const deps = createProductionProducerDeps({
      pi,
      root: rootWith(new RecordingCheckpoint()),
      modelRegistry: {} as unknown as ModelRegistry,
    });
    const theta = promptTheta(body([], null));
    const thetaAbort = new AbortController();
    // Pi documents ctx.signal as `undefined` in idle, non-turn contexts — which
    // is exactly when the slash-command handler fires.
    const bindInput: ConversationBindInput = {
      theta,
      args: "",
      ctx: ctxWithSignal(undefined),
      thetaAbort,
    };

    const binding = deps.bindPromptConversation(bindInput);

    // No never-aborting fallback and no spurious abort at idle entry.
    expect(binding.executeDeps.signal).toBe(thetaAbort.signal);
    expect(binding.executeDeps.signal.aborted).toBe(false);

    // The agent_end user-cancel trigger flips the SAME controller the executor's
    // checkpoints gate on (the old single-shot `ctx.signal ?? new
    // AbortController().signal` capture pinned a controller theta did not hold, so
    // an agent_end abort could never land — CANCEL-2).
    abortForAgentEnd(thetaAbort);
    expect(binding.executeDeps.signal.aborted).toBe(true);
    expect((binding.executeDeps.signal.reason as Error).message).toBe(
      "theta cancelled by agent_end",
    );
  });
});

// ===========================================================================
// CANCEL-4 — binder-call checkpoint + pre-call abort → cancelled note.
// ===========================================================================

/** A genuine-binder theta (two string params force the "binder" classification). */
function binderTheta(): ThetaCompositionInput {
  const frontmatter = {
    mode: "prompt",
    params: {
      fields: [
        { wireName: "a", type: "string", hasDefault: false },
        { wireName: "b", type: "string", hasDefault: false },
      ],
      loweredSchema: {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" } },
        required: ["a", "b"],
      },
      defaultedFields: [],
    },
  } as unknown as ParsedFrontmatter;
  return {
    slashName: "demo",
    sourcePath: "/theta/demo.theta",
    frontmatter,
    body: body([], null),
    binderModel: "test-model",
  } as unknown as ThetaCompositionInput;
}

describe("CANCEL-4 — binder-call checkpoint gates the binder LLM call", () => {
  it("CANCEL-4: a pre-call abort fires the binder-call checkpoint, skips the LLM call, synthesises the cancelled-binder note, and does not run the theta", async () => {
    const checkpoint = new RecordingCheckpoint();
    const notes: RecordedMessage[] = [];
    const pi = recordingPi(notes);
    // A model registry that resolves the binder model but whose `complete()`
    // path must never be reached (a pre-call abort skips it). getApiKeyAndHeaders
    // would only be called from inside `complete()`, so a throwing stub proves
    // the call was skipped.
    const modelRegistry = {
      getAvailable: () => [{ id: "test-model", provider: "test" }],
      getApiKeyAndHeaders: () => {
        throw new Error("complete() must not be reached on a pre-call abort");
      },
    } as unknown as ModelRegistry;
    const deps = createProductionProducerDeps({
      pi,
      root: rootWith(checkpoint),
      modelRegistry,
    });

    // A thetaAbort already aborted at binder entry (models an Esc landing before
    // the binder call is issued).
    const thetaAbort = new AbortController();
    thetaAbort.abort(new Error("esc before binder"));
    const binderInput: BinderRunInput = {
      theta: binderTheta(),
      args: "one two",
      ctx: ctxWithSignal(undefined),
      thetaAbort,
    };

    const result = await deps.runBinder(binderInput);

    // The pre-call binder-call checkpoint fired at the binder site.
    expect(checkpoint.kinds).toContain("binder-call");
    // The theta does not run: no bound args flow to theta code.
    expect(result.bound).toBe(false);
    // The cancelled-binder system note was synthesised (§Surfacing cancelled-
    // binder arm; binder failure-modes `cancelled` row).
    const contents = notes.map((n) => n.content);
    expect(contents).toContain("theta /demo: argument binding cancelled");
  });
});

// ===========================================================================
// CANCEL-3 — code-side execute() swallowing-handler attachment (no leak).
// ===========================================================================

const rejectionTrap = createUnhandledRejectionTrap();
const { unhandled } = rejectionTrap;
beforeEach(rejectionTrap.install);
afterEach(rejectionTrap.dispose);

describe("CANCEL-3 — code-side execute() dispatch attaches a construction-site swallowing handler", () => {
  it("CANCEL-3: a rejecting tool execute() driven through the real production dispatch raises no Node unhandledRejection and surfaces Err(code_tool) once", async () => {
    const pi = recordingPi([]);
    // The tool's execute() rejects on a later macrotask — the swallowing handler
    // must be attached at the dispatch construction site (before the first
    // microtask boundary) so no `unhandledRejection` escapes the wired path.
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> =>
        new Promise<AgentToolResultEnvelope>((_resolve, reject) => {
          setTimeout(() => reject(new Error("late tool execute() rejection")), 0);
        }),
    });
    const deps = createProductionProducerDeps({
      pi,
      root: rootWith(new RecordingCheckpoint()),
      modelRegistry: {} as unknown as ModelRegistry,
      resolvePiTool,
    });

    // `let hits = grep({ pattern })?` — the `?` propagates the code-tool Err.
    const grep = callExpr("grep", [
      objectExpr(null, [{ name: "pattern", value: stringExpr("TODO") }]),
    ]);
    const theta = promptTheta(body([letStmt("hits", tryExpr(grep))], identExpr("hits")), ["grep"]);
    const binding = deps.bindPromptConversation({
      theta,
      args: "",
      ctx: ctxWithSignal(undefined),
      thetaAbort: new AbortController(),
    });

    const execution = await executeBody(theta.body, binding.executeDeps);
    await settleAndObserve();

    // The rejecting execute() surfaced as the code-tool Err (the `?` propagated
    // it to a fail outcome) exactly once — no double surface.
    expect(execution.outcome).toBe("fail");
    const err = execution.error as unknown as { kind?: string; cause?: string };
    expect(err.kind).toBe("code_tool");
    expect(err.cause).toBe("execution");
    // The construction-site swallowing handler absorbed the abandonable-Promise
    // side channel: no Node `unhandledRejection` process event fired.
    expect(unhandled).toEqual([]);
  });
});
