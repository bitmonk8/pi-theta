// V17a — the cancellation core (implementation).
//
// This module owns the `loomAbort` controller and the cancellation contract
// (cancellation.md): forwarding Pi's per-handler `ctx.signal`, the tool-exposed
// `signal`, and the parent-`invoke` signal into `loomAbort` (never `ctx.signal`
// directly); abort-reason propagation (synthesised for `agent_end`); downward-
// only propagation; the tool-call late-settlement discard rules (CNCL-1/2/3);
// the race semantics against a completed `Ok` (CNCL-5) and a tail abort
// (CNCL-6); and the swallowing-handler three-side-channel suppression at the
// `Checkpoint`-seam substrate.
//
// This module fills in the behaviour the paired V17a-T tests-task stubbed:
// forwarding each source signal into `loomAbort` via a one-shot listener that
// carries the source's `reason` (CNCL-4), a downward-only derived child
// controller, the tool-call late-settlement discard (CNCL-1/2/3), the
// swallowing-handler three-side-channel suppression at the Checkpoint-seam
// substrate, and the cancellable-sequence runner honouring CNCL-5/CNCL-6.
//
// Spec: cancellation.md (CNCL-1 … CNCL-6, §Signal source, §Forwarding into
// `loomAbort`, §Propagation, §Race semantics — late-settlement discard,
// §Race semantics — swallowing-handler attachment on every abandonable
// Promise); pi-integration-contract/host-interfaces-services.md (§`Checkpoint`
// seam, PIC-10); errors-and-results/queryerror-variants.md (`CancelledError`).

import type { Checkpoint, CheckpointKind, CheckpointSite } from "../seams/checkpoint";
import type { CancelledError, QueryError } from "./query-error";
import type { RuntimeEvent } from "./runtime-event-channel";
import type { Diagnostic } from "../diagnostics/diagnostic";

// ---------------------------------------------------------------------------
// Signal source — the per-invocation `loomAbort` controller.
// ---------------------------------------------------------------------------

/**
 * Construct a fresh `AbortController` (`loomAbort`) at invocation start. Its
 * `loomAbort.signal` — never `ctx.signal` directly — is the single source of
 * truth every downstream component (checkpoints, forwarded tool signals, child
 * invokes) sees (cancellation.md §Signal source).
 */
export function createLoomAbort(): AbortController {
  return new AbortController();
}

/**
 * Forward one source signal into `loomAbort`, carrying the source's `reason` so
 * `loomAbort.signal.reason === source.reason` is observable downstream (CNCL-4).
 * If the source is already aborted at attach time, forward synchronously;
 * otherwise attach a one-shot listener. The one-shot guard that makes the first
 * source's reason win is inherent to `AbortController`: a second `abort(...)` on
 * an already-aborted controller is a no-op and does not re-stamp the reason.
 */
function forwardSignalReason(loomAbort: AbortController, source: AbortSignal): void {
  if (source.aborted) {
    loomAbort.abort(source.reason);
    return;
  }
  source.addEventListener(
    "abort",
    () => {
      loomAbort.abort(source.reason);
    },
    { once: true },
  );
}

/**
 * The synthesised reason for the reason-less `agent_end` slash-command trigger
 * (cancellation.md CNCL-4): a JavaScript `Error` whose `message` is exactly this
 * literal. (`V9g` owns the sibling `"loom cancelled by session shutdown"`
 * facet.)
 */
export const AGENT_END_CANCEL_MESSAGE = "loom cancelled by agent_end";

// ---------------------------------------------------------------------------
// Forwarding into `loomAbort` — the three steady-state entry points.
// ---------------------------------------------------------------------------

/**
 * Slash-command entry (cancellation.md §Forwarding into `loomAbort`). Subscribe
 * so that an aborted `ctx.signal` triggers `loomAbort.abort(ctx.signal.reason)`
 * via a one-shot listener (CNCL-4 reason identity). MUST tolerate `ctxSignal`
 * being `undefined` — Pi documents `ctx.signal` as `undefined` in idle,
 * non-turn contexts, which is exactly when the slash-command handler fires — and
 * MUST NOT depend on its truthiness.
 */
export function forwardSlashCommandCancel(
  _loomAbort: AbortController,
  _ctxSignal: AbortSignal | undefined,
): void {
  // Pi documents `ctx.signal` as `undefined` in idle, non-turn contexts — which
  // is exactly when the slash-command handler fires — so tolerate it without
  // depending on its truthiness; there is nothing to forward yet.
  if (_ctxSignal === undefined) {
    return;
  }
  forwardSignalReason(_loomAbort, _ctxSignal);
}

/**
 * Tool-exposed entry — a loom registered into another loom's `tools:`
 * (cancellation.md §Forwarding into `loomAbort`). Wire the `signal` passed to
 * `execute(...)` so that `signal.aborted` triggers `loomAbort.abort(signal.reason)`
 * via a one-shot listener (CNCL-4 reason identity).
 */
export function forwardToolExposedCancel(
  _loomAbort: AbortController,
  _signal: AbortSignal,
): void {
  forwardSignalReason(_loomAbort, _signal);
}

/**
 * `agent_end` slash-command trigger (cancellation.md CNCL-4). This path has no
 * source `AbortSignal` — there is no `reason` to forward — so the runtime
 * synthesises a reason (a JavaScript `Error` whose `message` is exactly
 * `AGENT_END_CANCEL_MESSAGE`) and calls `loomAbort.abort(reason)` with it.
 */
export function abortForAgentEnd(_loomAbort: AbortController): void {
  _loomAbort.abort(new Error(AGENT_END_CANCEL_MESSAGE));
}

/**
 * `invoke(...)` entry (cancellation.md §Forwarding into `loomAbort` /
 * §Propagation). The child constructs its own `loomAbort` as a *derived*
 * controller that aborts when the parent's signal aborts — forwarding the
 * parent's `reason` (CNCL-4) — but never the reverse (downward-only). If the
 * parent's signal is already aborted at child-spawn time, the derived controller
 * is returned already-aborted carrying the parent's reason.
 */
export function deriveChildLoomAbort(_parentSignal: AbortSignal): AbortController {
  const child = new AbortController();
  // Downward-only: the child aborts when the parent aborts (carrying the
  // parent's reason — CNCL-4), never the reverse, because `child` is an
  // independent controller the parent holds no reference to.
  forwardSignalReason(child, _parentSignal);
  return child;
}

// ---------------------------------------------------------------------------
// CNCL-1/2/3 — late-settlement discard at the tool-call checkpoint.
// ---------------------------------------------------------------------------

/**
 * The settlement outcome of a tool invocation's underlying `execute()` Promise,
 * enumerated so the discard decision is independent of the late-settle kind
 * (cancellation.md: "the discriminator is whether cancellation has already been
 * surfaced at the checkpoint, not the late-settle kind").
 */
export type ToolCallSettlement =
  | { readonly kind: "resolved"; readonly value: unknown }
  | { readonly kind: "error-result"; readonly value: unknown }
  | { readonly kind: "rejected"; readonly error: unknown };

/** Live cancellation state for one tool invocation (read at settlement time). */
export interface ToolCallCancellationGuard {
  /** True once the `tool-call` checkpoint surfaced `cause: "cancelled"`. */
  cancellationSurfaced: boolean;
}

/**
 * The three coupled channels a late tool-call settlement could reach. Once
 * cancellation has surfaced, all three MUST stay silent (CNCL-1/2/3):
 * `rebindCallSite` (clause (a) — no rebind), `emitErr` (clause (b) — no second
 * `Err`), and `emitRuntimeEvent` (clause (c) — no second `RuntimeEvent`).
 */
export interface ToolCallSideChannels {
  /** Bind the tool call site to a value (must NOT fire post-cancel — CNCL-1). */
  readonly rebindCallSite: (value: unknown) => void;
  /** Emit an `Err` for this invocation (must NOT fire a second time — CNCL-2). */
  readonly emitErr: (error: QueryError) => void;
  /** Emit a `RuntimeEvent` (must NOT fire a second time — CNCL-3). */
  readonly emitRuntimeEvent: (event: RuntimeEvent) => void;
}

/** Disposition of one late tool-call settlement. */
export type ToolCallLateDisposition = "rebind" | "discarded";

/**
 * CNCL-1/2/3. Decide the disposition of one late settlement of a tool call's
 * `execute()` Promise. Once `guard.cancellationSurfaced` is true the settlement
 * is discarded across all three coupled channels (no rebind, no second `Err`,
 * no second `RuntimeEvent`); otherwise the value flows to the normal tool-call
 * binding path.
 */
export function routeToolCallLateSettlement(
  settlement: ToolCallSettlement,
  guard: ToolCallCancellationGuard,
  channels: ToolCallSideChannels,
): ToolCallLateDisposition {
  // The discriminator is whether cancellation has already been surfaced at the
  // checkpoint, not the late-settle kind: once surfaced, the settlement is
  // discarded across all three coupled channels (CNCL-1: no rebind; CNCL-2: no
  // second `Err`; CNCL-3: no second `RuntimeEvent`).
  if (guard.cancellationSurfaced) {
    return "discarded";
  }
  // Timely settlement (no cancellation surfaced): flow to the normal tool-call
  // binding path.
  if (settlement.kind === "resolved") {
    channels.rebindCallSite(settlement.value);
  }
  return "rebind";
}

// ---------------------------------------------------------------------------
// Swallowing-handler three-side-channel suppression (Checkpoint-seam substrate).
// ---------------------------------------------------------------------------

/**
 * The settlement of an abandonable Pi-returned Promise the runtime might drop
 * under cancellation (the substrate shared by the four owning sites `V14f`,
 * `V13f`, `V15h`, `V9o`).
 */
export type AbandonableSettlement =
  | { readonly kind: "resolved"; readonly value: unknown }
  | { readonly kind: "rejected"; readonly error: unknown };

/** Live cancellation state for one abandonable Promise. */
export interface SubstrateCancellationGuard {
  /** True once the corresponding checkpoint surfaced `cause: "cancelled"`. */
  cancellationSurfaced: boolean;
}

/**
 * The two emit channels a late substrate settlement could reach (the
 * `unhandledRejection` channel is closed structurally by attaching the handler
 * at construction, so it takes no member here): the always-log `RuntimeEvent`
 * channel and the diagnostics channel. Both MUST stay silent post-cancel.
 */
export interface SubstrateSideChannels {
  readonly emitRuntimeEvent: (event: RuntimeEvent) => void;
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
}

/** Disposition of one late substrate settlement. */
export type SubstrateDisposition = "discarded" | "surfaced";

/**
 * Attach the swallowing handler to an abandonable Promise at its construction
 * site, before the first microtask boundary, and return the same Promise so
 * callers keep the construction expression. A late rejection arriving after the
 * checkpoint surfaced `cause: "cancelled"` is then silently absorbed and never
 * reaches Node's `unhandledRejection` process event (cancellation.md §Race
 * semantics — swallowing-handler attachment).
 */
export function attachSwallowingHandler<T>(
  promise: Promise<T>,
  _guard: SubstrateCancellationGuard,
  _channels: SubstrateSideChannels,
): Promise<T> {
  // Attach the swallowing handler at construction, before the first microtask
  // boundary, so a late rejection arriving after the checkpoint surfaced
  // `cause: "cancelled"` is absorbed and never reaches Node's
  // `unhandledRejection` process event. The original Promise is returned so the
  // caller keeps its construction expression; the attached `.then` is the
  // safety net that runs in addition to the primary consumer's own `await`.
  promise.then(
    (value) => routeAbandonableSettlement({ kind: "resolved", value }, _guard, _channels),
    (error: unknown) =>
      routeAbandonableSettlement({ kind: "rejected", error }, _guard, _channels),
  );
  return promise;
}

/**
 * Decide the disposition of one late substrate settlement. Once
 * `guard.cancellationSurfaced` is true the settlement is discarded on both emit
 * channels (this function emits nothing) — no second `RuntimeEvent` and no
 * diagnostic of any severity (a diagnostic-worthy OOM-style rejection is still
 * discarded; promotion to `loom/runtime/internal-error` would re-introduce the
 * second-event surface the rule forbids). Otherwise the settlement is surfaced
 * to its owning site's normal path.
 */
export function routeAbandonableSettlement(
  _settlement: AbandonableSettlement,
  _guard: SubstrateCancellationGuard,
  channels: SubstrateSideChannels,
): SubstrateDisposition {
  // Once cancellation has surfaced the settlement is discarded on BOTH emit
  // channels — no second `RuntimeEvent` and no diagnostic of any severity (a
  // diagnostic-worthy OOM-style rejection is still discarded; promotion to
  // `loom/runtime/internal-error` would re-introduce the second-event surface
  // the rule forbids). When cancellation has NOT surfaced the settlement is the
  // timely one already handled by the owning site's primary `await`; this
  // secondary swallowing handler emits nothing so it does not double-emit.
  void _settlement;
  void channels;
  return _guard.cancellationSurfaced ? "discarded" : "surfaced";
}

// ---------------------------------------------------------------------------
// CNCL-5 / CNCL-6 — race semantics against a completed `Ok` and a tail abort.
// ---------------------------------------------------------------------------

/** A completed cancellable operation's result. */
export type OperationResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: QueryError };

/**
 * A single checkpointed statement in a cancellable sequence. `binding` is the
 * name its result is bound to; the interpreter awaits `checkpoint.before(kind,
 * site)` and reads the signal *before* dispatching `run()`.
 */
export interface CancellableStatement {
  readonly binding: string;
  readonly kind: CheckpointKind;
  readonly site: CheckpointSite;
  run(): Promise<OperationResult>;
}

/** Inputs the cancellable-sequence runner reads the abort through. */
export interface CancellableSequenceDeps {
  readonly checkpoint: Checkpoint;
  /** `loomAbort.signal` — the single source of truth (never `ctx.signal`). */
  readonly signal: AbortSignal;
}

/** The outcome of running a cancellable statement sequence. */
export interface CancellableSequenceOutcome {
  /**
   * Every completed binding, in order. CNCL-5: a completed `Ok(v)` is retained
   * here verbatim and is NEVER retroactively rewritten to `Err({kind:"cancelled"})`.
   */
  readonly bindings: ReadonlyMap<string, OperationResult>;
  /** The top-level result. */
  readonly result: OperationResult;
  /**
   * CNCL-6: whether a top-level `cancelled` was synthesised. MUST be `false`
   * when the abort fired in a pure tail with no further checkpoint to execute.
   */
  readonly synthesizedTopLevelCancelled: boolean;
}

/** Build the canonical `CancelledError` (`message` unconstrained per ERR/CancelledError). */
export function makeCancelledError(): CancelledError {
  return { kind: "cancelled", message: "cancelled" };
}

/**
 * Run a sequence of checkpointed statements under `deps.signal`. Before each
 * statement it awaits `deps.checkpoint.before(kind, site)` and reads the signal;
 * an abort observed at a checkpoint surfaces `Err({kind:"cancelled"})` at THAT
 * position without rewriting any already-completed binding (CNCL-5). An abort in
 * a pure tail after the final cancellable operation — no further checkpoint —
 * leaves the top-level result as the produced value with NO synthesised
 * top-level `cancelled` (CNCL-6).
 */
export async function runCancellableSequence(
  _deps: CancellableSequenceDeps,
  _statements: readonly CancellableStatement[],
): Promise<CancellableSequenceOutcome> {
  const bindings = new Map<string, OperationResult>();
  // Default when the sequence is empty; overwritten by the last completed
  // statement's result below.
  let result: OperationResult = { ok: true, value: undefined };

  for (const statement of _statements) {
    // The checkpoint is the ONLY place cancellation is observed. Await the seam
    // then read the signal BEFORE dispatching `run()`.
    await _deps.checkpoint.before(statement.kind, statement.site);
    if (_deps.signal.aborted) {
      // Surface `Err({kind:"cancelled"})` at THIS position. CNCL-5: every
      // already-completed binding in `bindings` is retained verbatim — never
      // retroactively rewritten.
      return {
        bindings,
        result: { ok: false, error: makeCancelledError() },
        synthesizedTopLevelCancelled: true,
      };
    }
    result = await statement.run();
    bindings.set(statement.binding, result);
  }

  // CNCL-6: the loop ran to completion, so no further checkpoint executed after
  // the final cancellable operation. Even if the signal aborted in the pure
  // tail, the top-level result is the produced value and no top-level
  // `cancelled` is synthesised.
  return { bindings, result, synthesizedTopLevelCancelled: false };
}
