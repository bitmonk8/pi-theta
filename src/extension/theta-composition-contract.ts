// Conversation-binding and dependency contracts for the per-theta composition.

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ParsedTheta } from "./reload-wiring";
import type { BodyExecution, ExecuteBodyDeps } from "../runtime/statement-executor";
import type { ThetaValue, ResultValue } from "../runtime/value";
import type { SchemaValidator } from "../seams/schema-validator";
import type { CheckpointSite } from "../seams/checkpoint";
import type { InvokeChain } from "../runtime/invoke-depth-cycle";
import type { QueryError } from "../runtime/query-error";
import type { RuntimeEvent } from "../runtime/runtime-event-channel";
import type { EnumTagEntry, FnTail } from "../runtime/subagent-envelope";
import type { InvokeResultSource } from "../runtime/invoke-cancellation";
import type { SubagentLaunchEntry } from "../runtime/subagent-placement";
import type { ActiveInvocationTicket } from "../runtime/active-invocation-registry";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { RunCardPublisher } from "./execution-status/run-card";
import type { ThetaRunOutcome } from "./execution-status/types";
import type { Trace } from "../seams/trace";

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
   * (runtime-event-channel.md §"Binder-failure sourcing"), not a fresh mint.
   * Absent on harnesses that call `runBinder` directly without a
   * dispatch-level `beginInvocation`.
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
   * RFC 0009 (invocation.md INV-8; subagent.md #subagent-launch-contract): the
   * call-site `with { cwd }` clause's validated, `path.resolve`-normalised
   * value. Present only when the dispatching call carried a clause; the
   * SUBAGENT launch bind uses it as the child working directory, defaulting to
   * the forwarded `ctx.cwd`. Prompt-mode bindings and the binder path never
   * read it — `cwd` addresses a spawned child process, and neither has one.
   */
  readonly resolvedCwd?: string;
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
  /**
   * RFC 0010 (execution-status.md EXST-3(b)): the CALLING invocation's id, so
   * the execution-status bus can render the callee as a child node of its
   * caller. Present only on a nested `invoke(...)` / `.theta`-callable bind;
   * absent for a top-level slash dispatch (a parentless root node).
   */
  readonly parentInvocationId?: string;
  /**
   * RFC 0012 §10: what the launched child runs — the theta's own body (the
   * default, `{ kind: "theta" }`) or one of its `subagent fn`s by presented
   * name (`{ kind: "fn", name }`). Read by the SUBAGENT launch bind only: it
   * selects the launch entry (env carriage under `pipe`, the launch file
   * otherwise), the execution-status mode (`subagent` / `subagent-fn`) and
   * the display label.
   */
  readonly entry?: SubagentLaunchEntry;
  /**
   * RFC 0012 §1: the BASE display label for the launch. Defaults to the
   * theta's slug; a `subagent fn` launch supplies `<slug>#<fn>`. The subagent
   * bind appends `#<id>` — the first eight hex characters of the invocation
   * id — before the launch, so the placement request's label is
   * `<slug>#<id>` or `<slug>#<fn>#<id>` (0.477.0).
   */
  readonly label?: string;
  /**
   * RFC 0012 §10 (FN-7 inheritance): the values the enclosing theta's
   * `system:` template interpolates for a `fn`-entry launch — the CALLING
   * invocation's own bound `params:`, not the fn's arguments (which
   * `paramBindings` carries for the PIC-60 channel). Absent ⇒ the `system:`
   * render reads `paramBindings`, the `.theta` callee behaviour.
   */
  readonly systemParams?: ReadonlyMap<string, ThetaValue>;
  /**
   * RFC 0015 (D5): the PARENT invocation's already-bound trace closure,
   * carried onto a nested prompt→prompt `invoke` callee bind so the callee's
   * statements publish heat under the TOP-LEVEL invocation's id (one card per
   * top-level drive, decision 6 — the viewport follows into the callee file,
   * so its heat must land on the same ring; the D2 ring is keyed
   * `(file, line)` for exactly this). Absent for a top-level slash dispatch
   * (the bind mints its own closure from the producer's `statusTrace`
   * factory) and everywhere the composition left the seam unwired.
   */
  readonly trace?: Trace;
  /**
   * RFC 0015 (D7): the residence-keyed call site of the `subagent fn` call
   * spawning this child, carried by the SPAWN PATH itself so the bus can stamp
   * the child node's `launchSite` race-free (the D2 report's recorded option:
   * neither a trace↔checkpoint join nor bus-resident state — the site travels
   * with the request, so concurrent `par for` lanes cannot cross-stamp). Set
   * by `#driveSubagentFnChild` from `SubagentFnChildRequest.site` (already
   * residence-keyed by the executor, matching heat keys); absent on every
   * other bind path, where the D2 invoke-derived attribution stands.
   */
  readonly launchSite?: CheckpointSite;
}

/**
 * A conversation the drive seam resolves an invocation's `Result` against:
 * either a body-executing binding or a self-driven one (the two arms below),
 * discriminated on `drive !== undefined`. The members here are common to both.
 */
interface ConversationBindingCommon {
  readonly drivenAgainst: DrivenConversation;
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
   * RFC 0012 §10: the `fn_tail` marker `drive()`'s most recently settled
   * envelope carried (`subagent-envelope.ts`) — a `subagent fn` child naming
   * its body's `Result`-valued tail so the caller rebuilds the exact value the
   * in-process drive returned. `undefined` on a bare tail, on every `.theta`
   * callee envelope, and before `drive()` settled.
   */
  readonly driveFnTail?: () => FnTail | undefined;
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
 * A conversation the `V19d` executor is driven against, plus the mode's return
 * surfacing (prompt mode, and the child-side in-process subagent root).
 * `executeDeps` is the `V19c`/`V19d` executor-deps bound to this conversation
 * (its `host` dispatches `@`-queries against the bound session); `surface`
 * projects the terminal execution onto the mode's returned value (prompt-mode
 * extracts the trailing-turn `Ok(string)` per `PIC-53`). The drive seam runs
 * `executeBody(theta.body, executeDeps)` and then `surface(execution)`.
 */
export interface BodyExecutingConversationBinding extends ConversationBindingCommon {
  readonly executeDeps: ExecuteBodyDeps;
  surface(execution: BodyExecution): ResultValue;
  readonly drive?: undefined;
}

/**
 * RFC-0006 (PIC-59): a fully self-contained drive that resolves the
 * invocation's `Result` WITHOUT the drive seam running `executeBody`. The
 * parent-side subagent-mode binding, whose body runs in a spawned child `pi`
 * process (the parent only launches, awaits the `theta_result` envelope, and
 * maps `ok`/`err`): the drive seam calls `drive()`, and no in-process
 * executor deps or return surfacing exist on this arm.
 */
export interface SelfDrivenConversationBinding extends ConversationBindingCommon {
  readonly drive: () => Promise<ResultValue>;
  readonly executeDeps?: undefined;
  readonly surface?: undefined;
}

export type ConversationBinding =
  | BodyExecutingConversationBinding
  | SelfDrivenConversationBinding;

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
  /**
   * RFC 0015 (D3): the run-card publisher — one `theta-run` entry at top-level
   * drive start, one gated `theta-run-summary` at drive end (decision 7).
   * Called ONLY by `composeThetaFixture.run` (the top-level slash entry:
   * invoke-reached callees drive through `runInvokeChild` and never pass
   * here), which is what makes decision 6's one-card-per-top-level-drive hold
   * by construction. Present only in the TUI composition; absent (print/json/
   * child, harnesses) both call sites are `?.` no-ops and the dispatch is
   * byte-identical.
   */
  readonly runCard?: RunCardPublisher | undefined;
  /**
   * Prompt-mode (`V12a`/`V9c`): bind `V19d`'s executor to the user session —
   * always a body-executing binding (the drive seam runs the body directly).
   */
  bindPromptConversation(input: ConversationBindInput): BodyExecutingConversationBinding;
  /**
   * Subagent-mode (`V9i`): bind the callee for a private, isolated drive rather
   * than the user conversation. Under RFC-0006 the returned binding carries a
   * `drive` (see `ConversationBinding.drive`) that launches a child `pi`
   * process and awaits its `theta_result` envelope.
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
   * spawned child; the parent-side / harness path never calls it. Resolves to
   * the drive's PIC-76 outcome projection (`ok` / `err` / `cancelled`) so the
   * dispatch entry can close the regime path's own run card (RFC 0015,
   * operator ruling 2026-09-23: a VISIBLE child session draws a card) — the
   * envelope stays the parent-facing contract; the returned outcome is a
   * process-local mirror of its terminal arm.
   */
  driveSubagentRootRegime?(input: ConversationBindInput): Promise<ThetaRunOutcome>;
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
