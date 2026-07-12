// V19e / V19e-T — the per-loom runnable composition producer.
//
// This module owns the producer seam the paired `V19e` implementation leaf
// fills in: `composeLoomFixture(loom, deps)` maps a parsed `.loom` (`V19a`
// frontmatter + body AST under a slash name) to a `H4a` `LoomFixture`
// (`{ slashName, run }`) whose `run` composes the existing runtime seams —
//
//   - it runs the `V11a` frontmatter binder (when applicable) BEFORE entering
//     the loom interpreter (extension-bootstrap-and-per-loom.md §"Per-loom
//     registration": "the slash-command `handler` runs the binder (when
//     applicable) and then the loom interpreter against the appropriate
//     conversation"); a binder that does not bind (needs-info / ambiguous /
//     cancelled) short-circuits so the loom body never runs;
//   - it routes on the loom's `mode:` and drives `V19d`'s effectful executor
//     (`executeBody`) against the appropriate conversation: prompt-mode against
//     the user session via the `V12a`/`V9c` prompt driver, subagent-mode against
//     a freshly spawned isolated `AgentSession` via `V9i`'s spawn seam; and
//   - it surfaces the mode's return value from the terminal execution
//     (prompt-mode extracts the trailing-turn `Ok(string)` per `PIC-53`).
//
// The prompt-mode / subagent-mode drive obligations (`SLSH-2`, `PIC-53`,
// `PIC-40`…`PIC-43`) are owned on `V12a`/`V9c`/`V9i` and are NOT re-closed here;
// this leaf's obligation — the per-loom runnable-producer composition — is the
// `governance.md` GOV-22 un-anchored declarative MUST routed to release-time
// residue-inspection item 5, so this leaf closes NO coverage-matrix row.
//
// V19e-T (this tests task) declares the producer seam and stubs the composed
// `run` INERTLY: the returned fixture carries the correct `slashName` but its
// `run` runs NO binder, performs NO mode routing, drives NO executor, and
// surfaces NO result. Every paired test therefore reds on its own primary
// assertion — a binder that never ran, an executor never driven against the
// user / private conversation, a prompt turn never issued, a subagent session
// never spawned, or a bind step that never committed ahead of the executor's
// first statement — not on a compile error, a missing fixture, or a harness
// throw. The paired `V19e` implementation leaf fills the composed `run` in.
//
// Spec: pi-integration-contract/extension-bootstrap-and-per-loom.md
// (§"Per-loom registration"), pi-integration-contract/registration-steps.md,
// pi-integration-contract/conversation-drive.md (SLSH-2 / PIC-53 witnesses),
// slash-invocation.md.

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { LoomFixture } from "./factory";
import type { ParsedLoom } from "./reload-wiring";
import {
  executeBody,
  type BodyExecution,
  type ExecuteBodyDeps,
} from "../runtime/statement-executor";
import type { LoomValue, ResultValue } from "../runtime/value";
import type { InvokeChain } from "../runtime/invoke-depth-cycle";
import type { QueryError } from "../runtime/query-error";
import { createLoomAbort, forwardSlashCommandCancel } from "../runtime/cancellation-core";

/**
 * Project the binder's bound `args` object onto the executor's `paramBindings`
 * map, so the loom's own typed `params:` reach body scope at a top-level `/stem`
 * dispatch (the same install path invoke-supplied args use). Absent `args`
 * (a loom with no `params:`) yields `undefined` — no param slots installed.
 */
function paramBindingsFrom(
  args: Readonly<Record<string, unknown>> | undefined,
): ReadonlyMap<string, LoomValue> | undefined {
  if (args === undefined) {
    return undefined;
  }
  const bindings = new Map<string, LoomValue>();
  for (const [name, value] of Object.entries(args)) {
    bindings.set(name, value as LoomValue);
  }
  return bindings;
}

/**
 * The parsed `.loom` the producer maps to a runnable `LoomFixture`: the `V19a`
 * frontmatter + body AST under a slash name. It is exactly the widened
 * `ParsedLoom` seam minus the `run` the producer is about to compose (so the
 * `H8a` `session_start` registration stores `{ ...loom, run }` back onto the
 * `LoomRegistry`).
 */
export type LoomCompositionInput = Omit<ParsedLoom, "run">;

/** Inputs to the `V11a` binder step for one producer run. */
export interface BinderRunInput {
  /** The parsed loom being dispatched. */
  readonly loom: LoomCompositionInput;
  /** The raw slash-argument text the binder extracts typed `params:` from. */
  readonly args: string;
  /** The dispatch context (the binder reads `ctx.modelRegistry` / `ctx.signal`). */
  readonly ctx: ExtensionCommandContext;
  /**
   * CANCEL-2/CANCEL-4 (cancellation.md §Signal source): the per-invocation
   * `loomAbort` the dispatch entry (`composeLoomFixture.run`) owns, so the
   * binder-call checkpoint and the loom body gate on ONE shared controller
   * (`loomAbort.signal` — never `ctx.signal` directly). Absent on in-memory
   * harnesses that call `runBinder` directly; the producer defaults a fresh one.
   */
  readonly loomAbort?: AbortController;
}

/** The outcome of the `V11a` binder step. */
export interface BinderRunResult {
  /**
   * `true` when binding succeeded (or was bypassed) and the loom body runs;
   * `false` for a non-binding envelope (needs-info / ambiguous / cancelled), in
   * which case the loom does NOT run.
   */
  readonly bound: boolean;
  /**
   * The bound typed `params:` object (`applyBinderBypass(...).args` on a bypass
   * arm, or the parsed `ok`-envelope `args` on a real binder pass). Threaded
   * into the executor environment as `paramBindings` so a loom's own `params:`
   * reach body scope at top-level `/stem` dispatch. Absent when the loom
   * declares no `params:`.
   */
  readonly args?: Readonly<Record<string, unknown>>;
}

/**
 * Which conversation the `V19d` executor was driven against — the mode-routing
 * witness: prompt-mode drives the shared user session, subagent-mode drives a
 * freshly spawned isolated private session.
 */
export type DrivenConversation =
  | "prompt-user-session"
  | "subagent-private-session";

/** Inputs to a mode-specific conversation binding. */
export interface ConversationBindInput {
  readonly loom: LoomCompositionInput;
  readonly args: string;
  readonly ctx: ExtensionCommandContext;
  /**
   * H8b: positional invoke arguments bound onto the callee's declared params as
   * local slots before its body runs. Present only when this binding drives an
   * `invoke(...)` / `.loom`-callable callee; absent for a top-level slash
   * dispatch (whose args are bound by the frontmatter binder).
   */
  readonly paramBindings?: ReadonlyMap<string, LoomValue>;
  /**
   * CANCEL-2 (cancellation.md §Signal source): the per-invocation `loomAbort`
   * the dispatch entry owns, shared with the binder so body + binder gate on
   * ONE controller. Absent on in-memory harnesses that build a binding
   * directly; the producer defaults a fresh `createLoomAbort()`.
   */
  readonly loomAbort?: AbortController;
  /**
   * CANCEL-5 (cancellation.md §`invoke(...)` entry): the parent's
   * `loomAbort.signal` handed to a child `invoke` binding so the child
   * constructs its `loomAbort` as a DERIVED controller (downward-only:
   * `deriveChildLoomAbort`). Absent for a top-level slash dispatch.
   */
  readonly parentSignal?: AbortSignal;
  /**
   * INV-4 / ceiling #1 (invocation.md §"Invocation depth bound"): the per-chain
   * invoke-depth counter carried into this binding. Present only when this
   * binding drives a nested `invoke(...)` callee (the parent pushes a countable
   * frame before spawning); absent for a top-level slash dispatch, which starts
   * a fresh chain at depth 0.
   */
  readonly chain?: InvokeChain;
}

/**
 * A conversation the `V19d` executor is driven against, plus the mode's return
 * surfacing. `executeDeps` is the `V19c`/`V19d` executor-deps bound to this
 * conversation (its `host` dispatches `@`-queries against the bound session);
 * `surface` projects the terminal execution onto the mode's returned value
 * (prompt-mode extracts the trailing-turn `Ok(string)` per `PIC-53`).
 */
export interface ConversationBinding {
  readonly drivenAgainst: DrivenConversation;
  readonly executeDeps: ExecuteBodyDeps;
  surface(execution: BodyExecution): ResultValue;
}

/**
 * The collaborators the per-loom runnable producer composes: the `V11a` binder,
 * the prompt-mode conversation driver (`V12a`/`V9c`), and the subagent-mode
 * spawn-and-drive seam (`V9i`).
 */
export interface LoomProducerDeps {
  /** `V11a` frontmatter binder — bind `args` before the interpreter (when applicable). */
  runBinder(input: BinderRunInput): Promise<BinderRunResult>;
  /** Prompt-mode (`V12a`/`V9c`): bind `V19d`'s executor to the user session. */
  bindPromptConversation(input: ConversationBindInput): ConversationBinding;
  /**
   * Subagent-mode (`V9i`): spawn an isolated `AgentSession` and bind `V19d`'s
   * executor to that private session rather than the user conversation.
   */
  spawnSubagentConversation(
    input: ConversationBindInput,
  ): Promise<ConversationBinding>;
  /**
   * SLSH-3/SLSH-4/SLSH-5: emit the one-line `loom-system-note` for a top-level
   * `Err(QueryError)` returned to the slash-dispatch boundary (a loom with a
   * slash caller and no invoke parent). Called by `composeLoomFixture.run` —
   * the slash-dispatch entry point — when `binding.surface(execution)` yields an
   * `Err`. Owns the `pi.sendMessage` delivery on the `loom-system-note` channel
   * (production-loom-producer.ts). The note is the only user-facing surface for
   * a directly-slash-invoked subagent-mode failure (its transcript is private).
   */
  emitTopLevelErrNote(loomName: string, error: QueryError): void;
}

/**
 * Compose the per-loom runnable `LoomFixture` for one parsed `.loom`.
 *
 * The composed `run` realises the extension-bootstrap-and-per-loom.md
 * §"Per-loom registration" obligation — "the slash-command `handler` runs the
 * binder (when applicable) and then the loom interpreter against the
 * appropriate conversation":
 *
 *   1. run the `V11a` frontmatter binder over `args`; a non-binding envelope
 *      (needs-info / ambiguous / cancelled) short-circuits so the loom body
 *      never runs;
 *   2. route on `loom.frontmatter.mode` — prompt-mode binds `V19d`'s executor
 *      to the user session (`V12a`/`V9c`), subagent-mode spawns an isolated
 *      `AgentSession` and binds the executor to that private session (`V9i`);
 *   3. drive `executeBody(loom.body, binding.executeDeps)` against the bound
 *      conversation and surface the mode's return value (prompt-mode extracts
 *      the trailing-turn `Ok(string)`, `PIC-53`).
 */
export function composeLoomFixture(
  loom: LoomCompositionInput,
  deps: LoomProducerDeps,
): LoomFixture {
  return {
    slashName: loom.slashName,
    // Thread the loom's `description:` onto the fixture so factory registration
    // passes it to `pi.registerCommand` (frontmatter-fields-a.md autocomplete).
    ...(loom.frontmatter.description !== undefined
      ? { description: loom.frontmatter.description }
      : {}),
    run: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
      // CANCEL-2 (cancellation.md §Signal source): the dispatch entry OWNS the
      // per-invocation `loomAbort`; its `loomAbort.signal` — never `ctx.signal`
      // directly — is the single source of truth the binder-call checkpoint and
      // the loom body both gate on. `forwardSlashCommandCancel` subscribes Pi's
      // per-handler `ctx.signal` INTO `loomAbort` (tolerating the documented
      // idle-entry `undefined`), so an aborted `ctx.signal` triggers
      // `loomAbort.abort(ctx.signal.reason)` (CNCL-4). The one-shot listener is
      // auto-removed on fire; `ctx.signal` is a per-turn transient object, so
      // no long-lived controller leaks across the Pi session.
      const loomAbort = createLoomAbort();
      forwardSlashCommandCancel(loomAbort, ctx.signal);
      // 1. Binder before interpreter: bind `args` first. A non-binding envelope
      //    (needs-info / ambiguous / cancelled) short-circuits — the loom body
      //    never runs. The binder shares THIS `loomAbort` so the binder-call
      //    checkpoint (CANCEL-4) observes the same abort the body would.
      const binderResult = await deps.runBinder({ loom, args, ctx, loomAbort });
      if (!binderResult.bound) {
        return;
      }
      // 2. Route on mode to the conversation the executor drives against. The
      //    binder's bound `params:` object is threaded into the executor
      //    environment as `paramBindings` so top-level `params:` reach body scope.
      const paramBindings = paramBindingsFrom(binderResult.args);
      const bindInput: ConversationBindInput = { loom, args, ctx, loomAbort, ...(paramBindings !== undefined ? { paramBindings } : {}) };
      const binding: ConversationBinding =
        loom.frontmatter.mode === "subagent"
          ? await deps.spawnSubagentConversation(bindInput)
          : deps.bindPromptConversation(bindInput);
      // 3. Drive `V19d`'s effectful executor against the bound conversation and
      //    surface the mode's return value.
      const execution: BodyExecution = await executeBody(loom.body, binding.executeDeps);
      // 4. SLSH-3: a top-level `Err(QueryError)` returned to THIS boundary (a
      //    slash caller, no invoke parent — invoke-reached looms never go through
      //    `run`) gets a one-line `loom-system-note` formatted from the error
      //    (SLSH-4 SNK templates). A loom that HANDLES its `Err` terminates with
      //    `outcome === "success"`, so only a genuinely-unhandled top-level `Err`
      //    surfaces here. `chain: []` renders the correct leaf row for every
      //    reachable kind; the SLSH-5 invoke_callee suffix is a deferred
      //    refinement (no readily-usable invoke provenance at this boundary).
      const terminal: ResultValue = binding.surface(execution);
      if (!terminal.ok) {
        deps.emitTopLevelErrNote(loom.slashName, terminal.error as unknown as QueryError);
      }
    },
  };
}
