// V19e / V19e-T — the per-theta runnable composition producer.
//
// This module owns the producer seam the paired `V19e` implementation leaf
// fills in: `composeThetaFixture(theta, deps)` maps a parsed `.theta` (`V19a`
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
//     the user session via the `V12a`/`V9c` prompt driver, subagent-mode against
//     a freshly spawned isolated `AgentSession` via `V9i`'s spawn seam; and
//   - it surfaces the mode's return value from the terminal execution
//     (prompt-mode extracts the trailing-turn `Ok(string)` per `PIC-53`).
//
// The prompt-mode / subagent-mode drive obligations (`SLSH-2`, `PIC-53`,
// `PIC-40`…`PIC-43`) are owned on `V12a`/`V9c`/`V9i` and are NOT re-closed here;
// this leaf's obligation — the per-theta runnable-producer composition — is the
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
// Spec: pi-integration-contract/extension-bootstrap-and-per-theta.md
// (§"Per-theta registration"), pi-integration-contract/registration-steps.md,
// pi-integration-contract/conversation-drive.md (SLSH-2 / PIC-53 witnesses),
// slash-invocation.md.

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "./factory";
import type { ParsedTheta } from "./reload-wiring";
import {
  executeBody,
  type BodyExecution,
  type ExecuteBodyDeps,
} from "../runtime/statement-executor";
import type { EffectfulStatementHostDeps } from "../runtime/effectful-statement-host";
import type { ThetaValue, ResultValue } from "../runtime/value";
import type { SchemaValidator } from "../seams/schema-validator";
import { bindParamsInbound } from "../runtime/inbound-boundary";
import type { InvokeChain } from "../runtime/invoke-depth-cycle";
import type { QueryError } from "../runtime/query-error";
import type { RuntimeEvent } from "../runtime/runtime-event-channel";
import type { EnumTagEntry } from "../runtime/subagent-envelope";
import type { InvokeResultSource } from "../runtime/invoke-cancellation";
import { createThetaAbort, forwardSlashCommandCancel } from "../runtime/cancellation-core";
import type { ActiveInvocationTicket } from "../runtime/active-invocation-registry";
import {
  HostFatal,
  isThetaPanic,
  surfaceUnexpectedThrow,
} from "../runtime/runtime-panics";
import { ToolReturnShapeDefectError } from "../runtime/tool-call-off-surface";
import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";

/**
 * The `internal error: ` prefix the runtime-defect surface
 * (`surfaceUnexpectedThrow`) and the `ToolReturnShapeDefectError.diagnostic`
 * both stamp onto their `message`. The slash-dispatch internal-error framing
 * (`theta /<name> aborted with internal error: <error.message>`,
 * code-registry-runtime.md `theta/runtime/internal-error`) carries the BARE
 * `error.message`, so the prefix is stripped when composing the framing to
 * avoid a doubled `internal error: internal error: …`.
 */
const INTERNAL_ERROR_PREFIX = "internal error: ";

/**
 * A synthesized zero-length body `SourceRange` for a bare `ThetaPanic`, which
 * carries no `SourceRange` of its own. A `ToolReturnShapeDefectError.diagnostic`
 * already carries a precise site and is preferred over this synthetic one.
 */
const ZERO_BODY_RANGE: SourceRange = {
  start: { line: 0, column: 0 },
  end: { line: 0, column: 0 },
} as const;

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
 * The parsed `.theta` the producer maps to a runnable `ThetaFixture`: the `V19a`
 * frontmatter + body AST under a slash name. It is exactly the widened
 * `ParsedTheta` seam minus the `run` the producer is about to compose (so the
 * `H8a` `session_start` registration stores `{ ...theta, run }` back onto the
 * `ThetaRegistry`).
 */
export type ThetaCompositionInput = Omit<ParsedTheta, "run">;

/** Inputs to the `V11a` binder step for one producer run. */
export interface BinderRunInput {
  /** The parsed theta being dispatched. */
  readonly theta: ThetaCompositionInput;
  /** The raw slash-argument text the binder extracts typed `params:` from. */
  readonly args: string;
  /** The dispatch context (the binder reads `ctx.modelRegistry` / `ctx.signal`). */
  readonly ctx: ExtensionCommandContext;
  /**
   * CANCEL-2/CANCEL-4 (cancellation.md §Signal source): the per-invocation
   * `thetaAbort` the dispatch entry (`composeThetaFixture.run`) owns, so the
   * binder-call checkpoint and the theta body gate on ONE shared controller
   * (`thetaAbort.signal` — never `ctx.signal` directly). Absent on in-memory
   * harnesses that call `runBinder` directly; the producer defaults a fresh one.
   */
  readonly thetaAbort?: AbortController;
  /**
   * The pre-binder `ActiveInvocationRegistry` ticket `beginInvocation` opened at
   * dispatch entry (mirrors `ConversationBindInput.invocationTicket`): a binder
   * failure's runtime event sources `invocation_id`/`theta` from THIS entry
   * (runtime-event-channel.md:83), not a fresh mint. Absent on harnesses that
   * call `runBinder` directly without a dispatch-level `beginInvocation`.
   */
  readonly invocationTicket?: ActiveInvocationTicket;
}

/** The outcome of the `V11a` binder step. */
export interface BinderRunResult {
  /**
   * `true` when binding succeeded (or was bypassed) and the theta body runs;
   * `false` for a non-binding envelope (needs-info / ambiguous / cancelled), in
   * which case the theta does NOT run.
   */
  readonly bound: boolean;
  /**
   * The bound typed `params:` object (`applyBinderBypass(...).args` on a bypass
   * arm, or the parsed `ok`-envelope `args` on a real binder pass). Threaded
   * into the executor environment as `paramBindings` so a theta's own `params:`
   * reach body scope at top-level `/stem` dispatch. Absent when the theta
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
  readonly theta: ThetaCompositionInput;
  readonly args: string;
  readonly ctx: ExtensionCommandContext;
  /**
   * H8b: positional invoke arguments bound onto the callee's declared params as
   * local slots before its body runs. Present only when this binding drives an
   * `invoke(...)` / `.theta`-callable callee; absent for a top-level slash
   * dispatch (whose args are bound by the frontmatter binder).
   */
  readonly paramBindings?: ReadonlyMap<string, ThetaValue>;
  /**
   * CANCEL-2 (cancellation.md §Signal source): the per-invocation `thetaAbort`
   * the dispatch entry owns, shared with the binder so body + binder gate on
   * ONE controller. Absent on in-memory harnesses that build a binding
   * directly; the producer defaults a fresh `createThetaAbort()`.
   */
  readonly thetaAbort?: AbortController;
  /**
   * CANCEL-5 (cancellation.md §`invoke(...)` entry): the parent's
   * `thetaAbort.signal` handed to a child `invoke` binding so the child
   * constructs its `thetaAbort` as a DERIVED controller (downward-only:
   * `deriveChildThetaAbort`). Absent for a top-level slash dispatch.
   */
  readonly parentSignal?: AbortSignal;
  /**
   * The `ActiveInvocationRegistry` insertion the dispatch entry already
   * performed for this invocation (active-invocation-registry.md §"Registry
   * contract": insertion happens at handler entry, before any awaitable
   * work). When present the bind REUSES it rather than adding a second entry;
   * when absent (an `invoke` spawn site, a child-side bind, an in-memory
   * harness) the bind opens its own.
   */
  readonly invocationTicket?: ActiveInvocationTicket;
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
  /**
   * RFC 0001 (`subagent fn`): the raw `EffectfulStatementHostDeps` used to build
   * `executeDeps.host`. A `subagent fn`'s production spawn seam
   * (`spawnSubagentFnSession`) spawns a fresh isolated session by re-binding the
   * enclosing theta under the resolved session config and hands these
   * session-scoped resolvers back to the calling body's effectful host so the
   * body's `@`-queries / calls / invokes route through the spawned session
   * (FN-6 isolation). Present on the production binds; absent on non-production
   * harnesses that never drive a `subagent fn`.
   */
  readonly effectHostDeps?: EffectfulStatementHostDeps;
  surface(execution: BodyExecution): ResultValue;
  /**
   * RFC-0006 (PIC-59): a fully self-contained drive that resolves the
   * invocation's `Result` WITHOUT the drive seam running `executeBody` against
   * `executeDeps`. Present on the parent-side subagent-mode binding, whose body
   * runs in a spawned child `pi` process (the parent only launches, awaits the
   * `theta_result` envelope, and maps `ok`/`err`); when present the drive seam
   * calls `drive()` instead of `executeBody(theta.body, executeDeps) + surface`.
   * Absent for prompt-mode / child-side in-process bindings (the drive seam runs
   * the body directly).
   */
  readonly drive?: () => Promise<ResultValue>;
  /**
   * The subagent leg's per-position declaring-enum tags parsed off the
   * PIC-59 envelope's OPTIONAL `enum_tags` sidecar (bug 0342 §Fix, D3
   * carriage) — consumed by `#validateInvokeReturn`'s invoke-return retag to
   * restore a forwarded value's declaring identity across the subagent
   * envelope boundary. Absent on prompt-mode/in-process bindings, whose
   * boxed enum carriers already survive the attach leg unretagged; absent
   * too when the envelope carried no sidecar (an enum-free return, or an
   * envelope-version predating it).
   */
  readonly forwardedEnumTags?: () => readonly EnumTagEntry[] | undefined;
  /**
   * Bug 0294 provenance sidecar: which side of the invoke boundary minted
   * `drive()`'s most recently settled `Result` (`InvokeResultSource`) —
   * `"callee-returned"` on `Ok` and on the envelope's own `err` arm,
   * `"boundary-minted"` on a parent-side fail-closed map (exit-without-envelope,
   * parse/schema failure, cancel short-circuit). `#driveCallee` reads it after
   * `drive()` settles to source-tag the subagent leg's body outcome for the
   * XMODE-1 wrap. Absent on non-subagent bindings, which never call `drive()`.
   */
  readonly driveSource?: () => InvokeResultSource;
  /**
   * Decision 6 / Increment B1 (active-invocation-registry.md §"Active
   * invocation registry"): settles the invocation's `disposeBarrier` and
   * removes its `ActiveInvocationRegistry` entry. Idempotent. The DRIVE seam
   * (`composeThetaFixture.run` / `#driveCallee`) calls it in a `finally` AFTER
   * `executeBody` + `surface`, so the registry entry SPANS the real in-flight
   * window rather than being added and removed inside the bind that only
   * constructs the binding. Optional so non-production bindings (which register
   * nothing) omit it — a `?.()` caller is then a no-op.
   */
  readonly finishInvocation?: () => void;
  /**
   * PIC-65 (pi-integration-contract/subagent.md §lifecycle): idempotent
   * teardown — detach the one-shot PIC-66 abort-forwarding (kill) listener and
   * tear down the spawned child / fixture session. The DRIVE seam (`composeThetaFixture.run` /
   * `#driveCallee`) calls it in a `finally` BEFORE `finishInvocation`, so
   * teardown runs on EVERY exit of the invocation drive — normal return,
   * returned `Err`, AND a genuine throw unwinding past `surface` (e.g. a
   * `ToolReturnShapeDefectError` / `ThetaPanic` defect). `surface` no longer runs
   * teardown, so a throw before/at `surface` can no longer leak the provider
   * connection + abort listener. Running BEFORE `finishInvocation` keeps the
   * `disposeBarrier` settling post-dispose (active-invocation-registry.md
   * §sub-step 3). Idempotent + non-throwing (a teardown throw is trapped so it
   * cannot mask an in-flight defect), so a defensive double-call is a no-op.
   * Optional so non-subagent bindings (prompt mode, non-production harnesses)
   * omit it — a `?.()` caller is then a no-op.
   */
  readonly teardown?: () => void | Promise<void>;
}

/**
 * The collaborators the per-theta runnable producer composes: the `V11a` binder,
 * the prompt-mode conversation driver (`V12a`/`V9c`), and the subagent-mode
 * spawn-and-drive seam (`V9i`).
 */
export interface ThetaProducerDeps {
  /** `V11a` frontmatter binder — bind `args` before the interpreter (when applicable). */
  runBinder(input: BinderRunInput): Promise<BinderRunResult>;
  /**
   * Insert this invocation's `ActiveInvocationRegistry` entry at slash-command
   * handler entry, BEFORE the awaited binder step
   * (active-invocation-registry.md §"Registry contract" — Insertion "before
   * any awaitable work"). The insertion stays producer-side: the entry's
   * `invocationId` is minted through the producer's PIC-20 `IdSource` seam and
   * the registry itself is threaded into the producer, not into this layer.
   * The returned ticket is handed to the bind (which reuses it instead of
   * inserting again) and finished by the dispatch `finally`, so the entry
   * spans the binder window as well as the body window and a
   * `session_shutdown` landing inside the binder call finds it. Absent on
   * in-memory harnesses that register nothing — a `?.()` caller then leaves the
   * pre-existing bind-side insertion as the only one.
   */
  beginInvocation?(input: {
    readonly theta: ThetaCompositionInput;
    readonly thetaAbort: AbortController;
  }): ActiveInvocationTicket;
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
   * RFC-0006 (PIC-58): whether THIS process is the spawned subagent-root child
   * for `theta` — i.e. the `PI_THETA_SUBAGENT_ROOT` marker is set to `theta`'s
   * slug and the theta is `mode: subagent`. When `true`, the drive seam routes
   * `run` through `driveSubagentRootRegime` (child-side in-process drive + stdout
   * envelope emission), bypassing the parent-side spawn path and the binder.
   * Defaults to `false` on harnesses without the regime wired.
   */
  isSubagentRootFor?(theta: ThetaCompositionInput): boolean;
  /**
   * RFC-0006 (PIC-58/59/60/62): the child-side subagent-root drive. Intakes the
   * marshalled params (binder bypassed, PIC-60), confirms the marshalled model
   * reference re-resolved child-side (PIC-62), drives the callee in-process
   * against the child's own host session (prompt-mode mechanics), and emits the
   * single `theta_result` stdout envelope on EVERY exit path — `Ok`, every
   * `Err`, and a panic routed as internal-error (PIC-59). Present only in the
   * spawned child; the parent-side / harness path never calls it.
   */
  driveSubagentRootRegime?(input: ConversationBindInput): Promise<void>;
  /**
   * SLSH-3/SLSH-4/SLSH-5: emit the one-line `theta-system-note` for a top-level
   * `Err(QueryError)` returned to the slash-dispatch boundary (a theta with a
   * slash caller and no invoke parent). Called by `composeThetaFixture.run` —
   * the slash-dispatch entry point — when `binding.surface(execution)` yields an
   * `Err`. Owns the `pi.sendMessage` delivery on the `theta-system-note` channel
   * (production-theta-producer.ts). The note is the only user-facing surface for
   * a directly-slash-invoked subagent-mode failure (its transcript is private).
   */
  emitTopLevelErrNote(thetaName: string, error: QueryError, event?: RuntimeEvent): void;
  /**
   * Runtime-defect / panic surface (errors-and-results/error-model.md
   * §"Runtime panics"). Called by `composeThetaFixture.run`'s top-level outer
   * catch when a runtime defect is thrown at slash dispatch (a `ThetaPanic` from
   * the closed six-source set, or a catchable interpreter / adapter throw routed
   * to `theta/runtime/internal-error`), so the defect surfaces as ONE framed
   * `theta-system-note` (`details: { diagnostics: [Diagnostic] }`, `display:
   * true`, `triggerTurn: false`, session NOT torn down) rather than escaping
   * uncaught to the Pi host. Owns the `pi.sendMessage` delivery on the
   * `theta-system-note` channel (production-theta-producer.ts). It MUST emit
   * exactly ONE note. `HostFatal` never reaches here — the outer catch re-raises
   * it (fail-fast, NOCEIL-3) before calling this.
   */
  emitPanicNote(framing: string, diagnostic: Diagnostic): void;
  /**
   * The runtime's `SchemaValidator`, used by the binder-`args` projection to
   * re-test a union-typed `params:` value against each `anyOf` arm
   * (runtime-value-model.md §"Wire-name translation", the inbound bullet's
   * union clause). Absent on in-memory harnesses that compose no runtime root,
   * in which case a value inside a union arm keeps the documented
   * pass-through; the shipped composition root always supplies it.
   */
  readonly schemaValidator?: Pick<SchemaValidator, "compile">;
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
 *      to the user session (`V12a`/`V9c`), subagent-mode spawns an isolated
 *      `AgentSession` and binds the executor to that private session (`V9i`);
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
      // flight (up to three round trips under HC3-d) still finds the entry and
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
        surfaceDispatchDefect(thrown, theta, deps);
      } finally {
        // The setup wrap inserted the registry entry before the binder await, so
        // EVERY exit of the dispatch — including the binder short-circuit, which
        // returns before a binding exists — must finish it. `finishInvocation`
        // (called by the inner `finally` above) finishes the same ticket, and both
        // are idempotent, so the normal path settles at its documented moment and
        // this is a no-op after it.
        invocationTicket?.finish();
      }
    },
  };
}

/**
 * Surface a runtime defect thrown at slash dispatch as ONE framed
 * `theta-system-note` (error-model.md §"Runtime panics"): `details:
 * { diagnostics: [Diagnostic] }`, `display: true`, `triggerTurn: false`, session
 * NOT torn down. Shared by the dispatch-site setup wrap's catch and the
 * top-level drive catch so both routes to the runtime-defect surface frame the
 * note identically. `HostFatal` propagates (NOCEIL-3 fail-fast) and never
 * reaches `emitPanicNote`.
 */
function surfaceDispatchDefect(
  thrown: unknown,
  theta: ThetaCompositionInput,
  deps: ThetaProducerDeps,
): void {
  if (thrown instanceof HostFatal) {
    // NOCEIL-3 (hard-ceilings): a host fatal is the ONLY thing that propagates —
    // re-raise it (fail-fast); it never reaches `emitPanicNote`.
    throw thrown;
  }
  const site = { file: theta.sourcePath ?? theta.slashName, range: ZERO_BODY_RANGE };
  if (isThetaPanic(thrown)) {
    // ThetaPanic framing (error-model.md §"Runtime panics"): a bare panic carries
    // no SourceRange, so synthesize the zero body range. The registered panic
    // message rides both the diagnostic and the framing.
    const diagnostic: Diagnostic = {
      severity: "error",
      code: thrown.code,
      file: site.file,
      range: site.range,
      message: thrown.message,
    };
    deps.emitPanicNote(`theta /${theta.slashName} aborted: ${thrown.message}`, diagnostic);
    return;
  }
  // internal-error framing: a `ToolReturnShapeDefectError` already carries a
  // precise-site `theta/runtime/internal-error` diagnostic (prefer it);
  // otherwise `surfaceUnexpectedThrow` builds one for the generic throw. Both
  // stamp the `internal error: <msg>` prefix onto the diagnostic message; the
  // framing (code-registry-runtime.md `theta/runtime/internal-error`) carries
  // the BARE `<error.message>`, so the prefix is stripped before composing
  // `… aborted with internal error: <msg>`.
  const diagnostic =
    thrown instanceof ToolReturnShapeDefectError
      ? thrown.diagnostic
      : surfaceUnexpectedThrow(thrown, site);
  if (diagnostic === undefined) {
    // Defensive (unreachable): `surfaceUnexpectedThrow` returns `undefined` only
    // for a `ThetaPanic` / `HostFatal`, both handled above. Re-raise rather than
    // fabricate a note, preserving fail-fast.
    throw thrown;
  }
  const detail = diagnostic.message.startsWith(INTERNAL_ERROR_PREFIX)
    ? diagnostic.message.slice(INTERNAL_ERROR_PREFIX.length)
    : diagnostic.message;
  deps.emitPanicNote(
    `theta /${theta.slashName} aborted with internal error: ${detail}`,
    diagnostic,
  );
}
