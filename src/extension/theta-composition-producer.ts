// V19e / V19e-T — the per-theta runnable composition producer.
//
// This module owns dispatch composition and re-exports its contract and defect
// surface seams: `composeThetaFixture(theta, deps)` maps a parsed `.theta` (`V19a`
// frontmatter + body AST under a slash name) to a `H4a` `ThetaFixture`
// (`{ slashName, run }`) whose `run` composes the existing runtime seams —
//
//   - it runs the `V11a` frontmatter binder (when applicable) BEFORE entering
//     the theta interpreter (extension-bootstrap-and-per-theta.md §"Per-theta
//     registration": "the slash-command `handler` runs the binder (when
//     applicable) and then the theta interpreter against the appropriate
//     conversation"); a binder that does not bind (needs-info / ambiguous /
//     cancelled) short-circuits so the theta body never runs;
//   - it routes on the theta's `mode:` and drives `V19d`'s effectful executor
//     (`executeBody`) against the appropriate conversation: prompt-mode against
//     the user session via the `V12a`/`V9c` prompt driver; subagent-mode
//     resolves through the `V9i` spawn seam's binding, whose `drive` (RFC-0006,
//     PIC-59) runs the whole body in a spawned child `pi` process; and
//   - it surfaces the mode's return value from the terminal execution
//     (prompt-mode extracts the trailing-turn `Ok(string)` per `PIC-53`).
//
// The prompt-mode / subagent-mode drive obligations (`SLSH-2`, `PIC-53`,
// `PIC-40`…`PIC-43`) are owned on `V12a`/`V9c`/`V9i` and are NOT re-closed here;
// this leaf's obligation — the per-theta runnable-producer composition — is the
// `governance.md` GOV-22 un-anchored declarative MUST routed to release-time
// residue-inspection item 5, so this leaf closes NO coverage-matrix row.
//
// Spec: pi-integration-contract/extension-bootstrap-and-per-theta.md
// (§"Per-theta registration"), pi-integration-contract/registration-steps.md,
// pi-integration-contract/conversation-drive.md (SLSH-2 / PIC-53 witnesses),
// slash-invocation.md.

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "./factory";
import {
  executeBody,
  type BodyExecution,
} from "../runtime/statement-executor";
import type { ThetaValue, ResultValue } from "../runtime/value";
import type { SchemaValidator } from "../seams/schema-validator";
import { bindParamsInbound } from "../runtime/inbound-boundary";
import type { QueryError } from "../runtime/query-error";
import { createThetaAbort, forwardSlashCommandCancel } from "../runtime/cancellation-core";
import type { ActiveInvocationTicket } from "../runtime/active-invocation-registry";
import type { ThetaRunOutcome } from "./execution-status/types";
import type {
  ThetaCompositionInput,
  ThetaProducerDeps,
  ConversationBindInput,
  ConversationBinding,
} from "./theta-composition-contract";
import { surfaceDispatchDefect } from "./dispatch-defect-surface";

export type {
  ThetaCompositionInput,
  BinderRunInput,
  BinderRunResult,
  DrivenConversation,
  ConversationBindInput,
  BodyExecutingConversationBinding,
  SelfDrivenConversationBinding,
  ConversationBinding,
  ThetaProducerDeps,
} from "./theta-composition-contract";
export { surfaceDispatchDefect } from "./dispatch-defect-surface";

/**
 * RFC 0015 (D3): map the drive's terminal `Result` onto the summary outcome.
 * `Err(CancelledError)` is the ONLY cancel witness the dispatch boundary sees
 * (both mode surfaces project a genuine cancel outcome to it); every other
 * `Err` — a `?`-propagation, an unhandled tail `Err`, an infra failure — is
 * `"err"`. Read defensively: `terminal.error` is a `ThetaValue`.
 */
function terminalRunOutcome(terminal: ResultValue): ThetaRunOutcome {
  if (terminal.ok) {
    return "ok";
  }
  const kind = (terminal.error as { readonly kind?: unknown } | null | undefined)?.kind;
  return kind === "cancelled" ? "cancelled" : "err";
}

/**
 * Project the binder's bound `args` object onto the executor's `paramBindings`
 * map, so the theta's own typed `params:` reach body scope at a top-level `/stem`
 * dispatch (the same install path invoke-supplied args use). Absent `args`
 * (a theta with no `params:`) yields `undefined` — no param slots installed.
 *
 * The projection runs the inbound translation pass first: binder `args` are one
 * of the four boundaries runtime-value-model.md §"Wire-name translation" states
 * the rule for, and the merged args are model-produced JSON that
 * `fillDefaultsAndRevalidate` has already AJV-checked against the theta's own
 * lowered `params:` document — so a field declared as a named `enum` reaches
 * body scope as a tagged variant rather than as the wire string.
 */
function paramBindingsFrom(
  theta: ThetaCompositionInput,
  args: Readonly<Record<string, unknown>> | undefined,
  schemaValidator: Pick<SchemaValidator, "compile"> | undefined,
): ReadonlyMap<string, ThetaValue> | undefined {
  if (args === undefined) {
    return undefined;
  }
  return bindParamsInbound({
    params: args,
    lowered: theta.frontmatter.params?.loweredSchema as Record<string, unknown> | undefined,
    body: theta.body,
    ...(schemaValidator !== undefined ? { schemaValidator } : {}),
    // Bug 0337: a `.theta`-declared enum `params:` field binds a file-qualified
    // variant that compares equal to a body-constructed one of the same decl.
    ...(theta.sourcePath !== undefined ? { enumDeclaringPath: theta.sourcePath } : {}),
  });
}

/**
 * Compose the per-theta runnable `ThetaFixture` for one parsed `.theta`.
 *
 * The composed `run` realises the extension-bootstrap-and-per-theta.md
 * §"Per-theta registration" obligation — "the slash-command `handler` runs the
 * binder (when applicable) and then the theta interpreter against the
 * appropriate conversation":
 *
 *   1. run the `V11a` frontmatter binder over `args`; a non-binding envelope
 *      (needs-info / ambiguous / cancelled) short-circuits so the theta body
 *      never runs;
 *   2. route on `theta.frontmatter.mode` — prompt-mode binds `V19d`'s executor
 *      to the user session (`V12a`/`V9c`), subagent-mode binds through the
 *      `V9i` spawn seam, whose `drive` runs the body in a spawned child `pi`
 *      process (RFC-0006, PIC-59);
 *   3. drive `executeBody(theta.body, binding.executeDeps)` against the bound
 *      conversation and surface the mode's return value (prompt-mode extracts
 *      the trailing-turn `Ok(string)`, `PIC-53`).
 */
export function composeThetaFixture(
  theta: ThetaCompositionInput,
  deps: ThetaProducerDeps,
): ThetaFixture {
  return {
    slashName: theta.slashName,
    // Thread the theta's `description:` onto the fixture so factory registration
    // passes it to `pi.registerCommand` (frontmatter-fields-a.md autocomplete).
    ...(theta.frontmatter.description !== undefined
      ? { description: theta.frontmatter.description }
      : {}),
    run: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
      // CANCEL-2 (cancellation.md §Signal source): the dispatch entry OWNS the
      // per-invocation `thetaAbort`; its `thetaAbort.signal` — never `ctx.signal`
      // directly — is the single source of truth the binder-call checkpoint and
      // the theta body both gate on. `forwardSlashCommandCancel` subscribes Pi's
      // per-handler `ctx.signal` INTO `thetaAbort` (tolerating the documented
      // idle-entry `undefined`), so an aborted `ctx.signal` triggers
      // `thetaAbort.abort(ctx.signal.reason)` (CNCL-4). The one-shot listener is
      // auto-removed on fire; `ctx.signal` is a per-turn transient object, so
      // no long-lived controller leaks across the Pi session.
      //
      // Dispatch-site setup wrap (active-invocation-registry.md §"Registry
      // contract"): the four setup steps — the `thetaAbort` controller, the
      // `disposeBarrier` resolvers, the registry insertion (both inside
      // `beginInvocation`), and the forwarding-listener attach — are ONE block in
      // a `try`/`catch` that routes a setup throw through the runtime-defect
      // surface. The insertion sits here, ahead of the awaited binder step below,
      // so a `session_shutdown` delivered while the binder's LLM call is in
      // flight (up to six provider round trips under HC3-d: three budgeted
      // attempts, each at most two calls under the bug-0481 degradation) still
      // finds the entry and
      // aborts it; inserting only inside the bind (which runs after the binder
      // resolves) would leave that whole window invisible to the teardown
      // handler.
      let thetaAbort: AbortController | undefined;
      let invocationTicket: ActiveInvocationTicket | undefined;
      try {
        thetaAbort = createThetaAbort();
        invocationTicket = deps.beginInvocation?.({ theta, thetaAbort });
        forwardSlashCommandCancel(thetaAbort, ctx.signal);
      } catch (setupThrown) { // allow-broad-catch: dispatch-site setup wrap — active-invocation-registry.md#active-invocation-registry
        // The cleanup abort of a half-constructed entry MUST NOT mask the
        // original setup throw, so its own throw is dropped by a nested catch
        // before the captured throw is routed on unchanged.
        try {
          thetaAbort?.abort();
        } catch { // allow-broad-catch: cleanup abort must not mask the setup throw — active-invocation-registry.md#active-invocation-registry
          // Dropped deliberately.
        }
        // A throw before the insertion completes leaks no entry (nothing to
        // remove); a throw after it is removed by this ticket's `finish`.
        invocationTicket?.finish();
        surfaceDispatchDefect(setupThrown, theta, deps);
        return;
      }
      // RFC-0006 (PIC-58): child-side subagent-root drive. When THIS process is
      // the spawned subagent-root child for this theta, the binder is BYPASSED
      // (params were marshalled structurally, PIC-60) and the callee is driven
      // in-process against the child's own host session, emitting the single
      // `theta_result` stdout envelope on every exit path (PIC-59). This is the
      // child leg only — `isSubagentRootFor` is `false` in the parent / on
      // harnesses — and it precedes the parent-side binder + drive below.
      if (
        deps.driveSubagentRootRegime !== undefined &&
        deps.isSubagentRootFor?.(theta) === true
      ) {
        try {
          await deps.driveSubagentRootRegime({
            theta,
            args,
            ctx,
            thetaAbort,
            ...(invocationTicket !== undefined ? { invocationTicket } : {}),
          });
        } finally {
          invocationTicket?.finish();
        }
        return;
      }
      // RFC 0015 (D3): the run card — one per TOP-LEVEL drive (decision 6).
      // This site is top-level by construction (invoke-reached callees never
      // go through `run`), sits AFTER the child-regime return above (a child
      // process draws no card; its early return must not leave one dangling),
      // and is keyed on the registry ticket's invocationId — no ticket (a
      // harness without `beginInvocation`) means no card. The publisher is
      // wired only in the TUI composition; `?.` no-op everywhere else.
      if (invocationTicket !== undefined) {
        deps.runCard?.driveStarted({
          invocationId: invocationTicket.invocationId,
          theta: invocationTicket.theta,
          args,
          ...(theta.sourcePath !== undefined ? { sourcePath: theta.sourcePath } : {}),
        });
      }
      // RFC 0015 (D3): the decision-7 summary outcome. Seeded `"cancelled"`
      // as a DELIBERATE projection convention: every binder short-circuit —
      // needs-info, ambiguous, genuine cancel — ends the drive without a
      // terminal value, and the summary's coarse RFC vocabulary (ok / err /
      // cancelled — the RFC's closed set) has no finer bucket for "the body
      // never ran". Projecting them all to "cancelled" keeps that vocabulary
      // closed; the binder's own note carries the precise short-circuit
      // reason. Recorded as a residual for D6's spec topic to codify. The
      // drive path overwrites the seed from the terminal `Result` and the
      // defect catch marks `"err"`.
      let runOutcome: ThetaRunOutcome = "cancelled";
      // TOP-LEVEL runtime-defect / panic surface (error-model.md §"Runtime
      // panics"): the whole dispatch body (binder + bind + the inner
      // teardown/finish try/finally) runs inside this OUTER try so a runtime
      // defect thrown anywhere at slash dispatch is caught and surfaced as ONE
      // framed `theta-system-note` rather than escaping uncaught to the Pi host.
      // The inner try/finally stays INSIDE, so `teardown` + `finishInvocation`
      // still run (leak-free, `disposeBarrier` settled) BEFORE the outer catch
      // frames the note. This is TOP-LEVEL-ONLY: invoke-reached callees never go
      // through `run` — they drive through `runInvokeChild`, which already maps a
      // callee defect to `Err(InvokeInfraError{cause:"panic"|"internal_error"})`
      // (and re-raises `HostFatal`), so this catch does not double-handle them.
      try {
        // 1. Binder before interpreter: bind `args` first. A non-binding envelope
        //    (needs-info / ambiguous / cancelled) short-circuits — the theta body
        //    never runs. The binder shares THIS `thetaAbort` so the binder-call
        //    checkpoint (CANCEL-4) observes the same abort the body would.
        const binderResult = await deps.runBinder({
          theta,
          args,
          ctx,
          thetaAbort,
          ...(invocationTicket !== undefined ? { invocationTicket } : {}),
        });
        if (!binderResult.bound) {
          return;
        }
        // 2. Route on mode to the conversation the executor drives against. The
        //    binder's bound `params:` object is threaded into the executor
        //    environment as `paramBindings` so top-level `params:` reach body scope.
        const paramBindings = paramBindingsFrom(theta, binderResult.args, deps.schemaValidator);
        const bindInput: ConversationBindInput = {
          theta,
          args,
          ctx,
          thetaAbort,
          ...(paramBindings !== undefined ? { paramBindings } : {}),
          ...(invocationTicket !== undefined ? { invocationTicket } : {}),
        };
        const binding: ConversationBinding =
          theta.frontmatter.mode === "subagent"
            ? await deps.spawnSubagentConversation(bindInput)
            : deps.bindPromptConversation(bindInput);
        // 3. Drive `V19d`'s effectful executor against the bound conversation and
        //    surface the mode's return value. Decision 6 / Increment B1: the
        //    ActiveInvocationRegistry entry SPANS this body window —
        //    `binding.finishInvocation?.()` in the `finally` settles the entry's
        //    `disposeBarrier` + removes it AFTER `executeBody` + `surface` (and the
        //    err-note), so a genuinely in-flight invocation is present in the
        //    registry when `session_shutdown` fires. The entry the bind reuses is
        //    the one the setup wrap inserted above, so the binder short-circuit
        //    above (which returns before `binding` exists) still leaves a live
        //    entry — the outer `finally` below finishes it on that path.
        try {
          // RFC-0006 (PIC-59): the parent-side subagent-mode binding resolves its
          // `Result` through a self-contained `drive()` (launch child → await
          // envelope → map) rather than the parent running the body; every other
          // binding runs the body against `executeDeps` and surfaces it.
          // RFC-0006's `drive()` path resolves through a self-contained child
          // envelope with no in-parent `BodyExecution`, so it carries no origin
          // event to thread (0383 boundary reconstruction, unchanged); the
          // ordinary body path retains `execution` so its `originEvent` (bug
          // 0399 — threaded from the fail-flow cascade) can ride to the note
          // verbatim per PIC-1 (f).
          let execution: BodyExecution | undefined;
          const terminal: ResultValue = await (async (): Promise<ResultValue> => {
            if (binding.drive !== undefined) {
              return binding.drive();
            }
            execution = await executeBody(theta.body, binding.executeDeps);
            return binding.surface(execution);
          })();
          runOutcome = terminalRunOutcome(terminal);
          // 4. SLSH-3: a top-level `Err(QueryError)` returned to THIS boundary (a
          //    slash caller, no invoke parent — invoke-reached thetas never go
          //    through `run`) gets a one-line `theta-system-note` formatted from the
          //    error (SLSH-4 SNK templates). A theta that HANDLES its `Err`
          //    terminates with `outcome === "success"`, so only a
          //    genuinely-unhandled top-level `Err` surfaces here. Bug 0088 /
          //    SLSH-5: `emitTopLevelErrNote` builds its own `chain` from this
          //    producer's invoke-hop provenance ledger, keyed on the
          //    `invoke_callee` wrapper chain rooted at `terminal.error` — this
          //    call site passes the raw top-level error unchanged. A returned
          //    `Err` is a VALUE (not a throw) — the outer catch never sees it.
          if (!terminal.ok) {
            deps.emitTopLevelErrNote(
              theta.slashName,
              terminal.error as unknown as QueryError,
              execution?.originEvent,
            );
          }
        } finally {
          // PIC-65: run the (idempotent, non-throwing) session teardown BEFORE
          // `finishInvocation`, so the spawned session's `dispose()`/abort-listener
          // detach run on EVERY exit — including a genuine throw unwinding past
          // `surface` (which would otherwise skip teardown and leak the session +
          // listener) — and the `disposeBarrier` settles post-dispose. This inner
          // finally is INSIDE the outer try, so it runs before the catch frames.
          await binding.teardown?.();
          binding.finishInvocation?.();
        }
      } catch (thrown) { // allow-broad-catch: top-level-slash runtime-defect surface — error-model.md#runtime-panics
        // A top-level runtime defect (a `ThetaPanic` from the closed six-source
        // set, a `ToolReturnShapeDefectError`, or any other catchable
        // interpreter / adapter throw incl. `RangeError`) is caught here and
        // surfaced as ONE framed `theta-system-note` instead of escaping uncaught
        // to the Pi host. Cancellation and normal Ok/Err are VALUES on the drive
        // path above, so they never reach this catch.
        runOutcome = "err";
        surfaceDispatchDefect(thrown, theta, deps);
      } finally {
        // The setup wrap inserted the registry entry before the binder await, so
        // EVERY exit of the dispatch — including the binder short-circuit, which
        // returns before a binding exists — must finish it. `finishInvocation`
        // (called by the inner `finally` above) finishes the same ticket, and both
        // are idempotent, so the normal path settles at its documented moment and
        // this is a no-op after it.
        invocationTicket?.finish();
        // RFC 0015 (D3): AFTER `finish()` — the bus's `invocationEnded` closes
        // the final open dwell interval, so the summary's heat profile reads
        // the SETTLED ring off the node (which lingers `DONE_LINGER_MS`, so a
        // same-tick read still finds it).
        if (invocationTicket !== undefined) {
          deps.runCard?.driveEnded(invocationTicket.invocationId, runOutcome);
        }
      }
    },
  };
}
