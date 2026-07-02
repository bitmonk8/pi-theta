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
import type { BodyExecution, ExecuteBodyDeps } from "../runtime/statement-executor";
import type { ResultValue } from "../runtime/value";

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
}

/** The outcome of the `V11a` binder step. */
export interface BinderRunResult {
  /**
   * `true` when binding succeeded (or was bypassed) and the loom body runs;
   * `false` for a non-binding envelope (needs-info / ambiguous / cancelled), in
   * which case the loom does NOT run.
   */
  readonly bound: boolean;
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
}

/**
 * Compose the per-loom runnable `LoomFixture` for one parsed `.loom`.
 *
 * V19e-T stub: the returned fixture carries the correct `slashName` (so the
 * mapping is registered) but its `run` is INERT — it runs no binder, does no
 * mode routing, drives no `V19d` executor, and surfaces no result. Every
 * `V19e-T` behavioural assertion therefore reds. The paired `V19e` leaf fills
 * `run` in: run the binder (when applicable), route on `loom.frontmatter.mode`,
 * drive `executeBody(loom.body, binding.executeDeps)` against the mode's
 * conversation, and `binding.surface(...)` the result.
 */
export function composeLoomFixture(
  loom: LoomCompositionInput,
  deps: LoomProducerDeps,
): LoomFixture {
  return {
    slashName: loom.slashName,
    run: async (_args: string, ctx: ExtensionCommandContext): Promise<void> => {
      // V19e-T inert stub — the composition is absent. The paired `V19e`
      // implementation runs `deps.runBinder(...)`, routes on
      // `loom.frontmatter.mode` to `deps.bindPromptConversation(...)` /
      // `deps.spawnSubagentConversation(...)`, drives `executeBody(...)`, and
      // surfaces the result.
      void ctx;
      void deps;
      void loom;
    },
  };
}
