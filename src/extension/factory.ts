// H4a — the theta extension factory (the `src/**` production factory the
// `extensions/index.ts` entry shim re-exports).
//
// The factory establishes the extension by side-effect registration calls on
// the injected `pi: ExtensionAPI` handle. Per
// extension-bootstrap-and-per-theta.md the factory's declared return type is
// `void | Promise<void>` for host-interface conformance, but theta pins it to
// the SYNCHRONOUS arm: the body runs synchronously and returns `void` — it is
// not `async`, awaits no work, and so exposes no returned-`Promise` rejection
// arm. Every host-binding call is wrapped in its own per-call `try`/`catch`
// (an exempt Pi-SDK-boundary broad-catch site), so the factory MUST NOT throw
// out of its body even when a host seam is absent or a registration call
// throws — that "MUST NOT throw out of the factory body" prohibition is the
// complete never-fault property for this boundary because none of the
// factory-body calls exposes a separate `Promise`-rejection arm.
//
// Factory-body calls (the synchronous-arm registrations): `pi.registerFlag`,
// `pi.registerMessageRenderer`, and the three factory-time `pi.on`
// subscriptions (`resources_discover`, `session_start`, `session_shutdown`).
// `pi.registerCommand` is NOT a factory-body call — it fires later from the
// `session_start` handler (the registration-timing split in
// registration-steps.md). The capability-probe refusal logic and the
// `theta/load/extension-bootstrap-failed` diagnostics are added by `V9a`; this
// leaf establishes only the never-throw factory boundary and the per-theta
// command-registration seam the in-memory fixture supply drives.

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { renderUnderlyingError } from "../diagnostics/placeholder";
import { createSystemNoteRenderer } from "./system-note-renderer";
import { RendererGate } from "./system-note-channel";
import type { ThetaRegistry, ParsedTheta } from "./reload-wiring";
import {
  resolveSlashDispatchWithReadFailover,
  evalShutdownShortCircuitWithReadFailover,
} from "./drain-state";
import {
  runSessionShutdown,
  type SessionShutdownDeps,
  type ForwardingSignalSource,
} from "./session-shutdown";
import { ActiveInvocationRegistry } from "../runtime/active-invocation-registry";
import type { Clock } from "../seams/clock";
import type { HotReloadHandle } from "./hot-reload";
import {
  composeExtensionInstance,
  createBootstrapDiagnosticSink,
  createProductionProbeHost,
  type ExtensionInstanceWiring,
} from "./production-composition";
import { hostIncompatibleDiagnostic, runCapabilityProbe } from "./capability-probe";
import { SUBAGENT_ROOT_ENV_MARKER } from "../runtime/subagent-root-regime";

/**
 * The diagnostics-registry code a factory-time bootstrap registration /
 * subscription failure surfaces (diagnostics/code-registry-load.md
 * `theta/load/extension-bootstrap-failed`). The paired `V9k` implementation
 * constructs this diagnostic when a factory-time `pi.registerFlag` or
 * `pi.on(...)` call throws; `V9k-T` declares the code so the failing tests can
 * anchor against it.
 */
export const EXTENSION_BOOTSTRAP_FAILED_CODE =
  "theta/load/extension-bootstrap-failed";

/**
 * The diagnostics-registry code a throw escaping the whole `composeInstance`
 * pass surfaces (bug 0023 element 4; diagnostics/code-registry-load.md
 * `theta/load/extension-compose-failed`). Distinct from
 * `EXTENSION_BOOTSTRAP_FAILED_CODE`: a compose-pass throw (discovery walk,
 * settings read, parse, schema compile, registry build) is a distinct phase
 * from a host-binding call failure, so it carries its own code rather than the
 * closed `BootstrapCapability` union's nearest member.
 */
export const EXTENSION_COMPOSE_FAILED_CODE =
  "theta/load/extension-compose-failed";

/** The CLI flag the extension registers for `.theta` discovery roots. */
const THETA_FLAG = "theta";
/** The theta-internal system-note renderer channel. */
const SYSTEM_NOTE_CHANNEL = "theta-system-note";

/**
 * The closed set of factory-time `pi.on` subscriptions a bootstrap failure can
 * name, in the canonical registration order (steps 1/3/4 of
 * registration-steps.md): `resources_discover` (step 1, after the `--theta`
 * flag), `session_start` (step 3), `session_shutdown` (step 4). A subscription
 * failure is fatal to the whole extension; `details.event` names the failing
 * one.
 */
type FactorySubscription =
  | "resources_discover"
  | "session_start"
  | "session_shutdown";

/**
 * The closed set of host-binding capabilities a `theta/load/extension-bootstrap-failed`
 * diagnostic can name (code-registry-load.md). The two whole-extension abort
 * surfaces (`pi.registerFlag`, `pi.on`) are owned by `V9k`; the three non-abort
 * surfaces (`pi.registerMessageRenderer`, `pi.registerCommand`,
 * `pi.getCommands`) are owned by `V9p`.
 */
type BootstrapCapability =
  | "pi.registerFlag"
  | "pi.on"
  | "pi.registerMessageRenderer"
  | "pi.registerCommand"
  | "pi.getCommands";

/**
 * Bug 0021 (PIC-68): the teardown-reach residue of one superseded compose
 * generation. A repeat `session_start`'s supersede-before-publish step detaches
 * the outgoing generation's watcher and drains its registry immediately, but
 * its in-flight invocation registry and forwarding-signal list must stay
 * reachable so ONE later `session_shutdown` can cancel + reason-stamp the
 * invocations (sub-steps 2/3) and detach the listeners (sub-step 5) across
 * every generation the instance ever published — not only the latest.
 */
interface SupersededGeneration {
  readonly activeInvocations: ActiveInvocationRegistry | undefined;
  readonly forwardingSignals: ForwardingSignalSource[] | undefined;
}

/**
 * Construct the `theta/load/extension-bootstrap-failed` diagnostic for a
 * factory-time or `session_start`-time bootstrap failure surface.
 * `details.error` carries the caught throw's underlying-error string
 * (placeholder-rendering-b.md#underlying-error-coercion) so a non-Error throw
 * yields a deterministic payload; the *Message* renders the byte-identical
 * registry template `extension bootstrap failed: <capability> threw <error>`
 * (code-registry-load.md), the `<error>` tail being the §8 host-derived
 * first-line truncation. `details.event` is added for `pi.on` subscription
 * failures (the failing Pi event); `details.theta` for per-theta
 * `pi.registerCommand` failures (the failing slash name).
 */
function bootstrapFailedDiagnostic(
  capability: BootstrapCapability,
  caught: unknown,
  extra?: { readonly event?: FactorySubscription; readonly theta?: string },
): Diagnostic {
  const error = renderUnderlyingError(caught);
  const details: Record<string, unknown> = { capability, error };
  if (extra?.event !== undefined) {
    details.event = extra.event;
  }
  if (extra?.theta !== undefined) {
    details.theta = extra.theta;
  }
  return {
    severity: "error",
    code: EXTENSION_BOOTSTRAP_FAILED_CODE,
    message: `extension bootstrap failed: ${capability} threw ${error}`,
    details,
  };
}

/**
 * Construct the `theta/load/extension-compose-failed` diagnostic (bug 0023
 * element 4) for a throw escaping the whole `deps.composeInstance` pass —
 * discovery walk, settings read, parse, schema compile, registry build — a
 * distinct phase from any single host-binding call, so it carries its own
 * `details: { error }` rather than the closed `BootstrapCapability` label.
 * `details.error` is the same underlying-error coercion
 * (placeholder-rendering-b.md#underlying-error-coercion) the bootstrap
 * diagnostic uses.
 */
function composeFailedDiagnostic(caught: unknown): Diagnostic {
  const error = renderUnderlyingError(caught);
  return {
    severity: "error",
    code: EXTENSION_COMPOSE_FAILED_CODE,
    message: `extension compose failed: ${error}`,
    details: { error },
  };
}

/**
 * The diagnostics-registry code the repeat-`session_start` supersession pass
 * surfaces when its detach of the prior generation's hot-reload handle throws
 * (bug 0029; diagnostics/code-registry-host.md
 * `theta/host/session-start-supersession-detach-failed`). Kept distinct from
 * `theta/host/session-shutdown-teardown-step-failed`: that code's
 * `(details.step, details.call)` label set is closed to the `session_shutdown`
 * handler (registration-steps.md#repeat-start-supersession is a different call
 * site on a different pass), so reusing it would misdescribe the site.
 */
export const SUPERSESSION_DETACH_FAILED_CODE =
  "theta/host/session-start-supersession-detach-failed";

/**
 * The closed one-member `details.call` label for
 * `SUPERSESSION_DETACH_FAILED_CODE`: the supersession pass has exactly one
 * fallible sub-step, so (unlike the teardown's per-step label set) no
 * `details.step` discriminator carries information here.
 */
const SUPERSESSION_DETACH_CALL_LABEL = "hotReloadHandle.detach";

/**
 * Construct the `theta/host/session-start-supersession-detach-failed`
 * diagnostic (bug 0029) for a throwing detach of the outgoing generation's
 * hot-reload handle at supersession time. `details.error` carries the caught
 * throw's underlying-error string
 * (placeholder-rendering-b.md#underlying-error-coercion), the same coercion
 * the sibling teardown row's `details.error` uses.
 */
function supersessionDetachFailedDiagnostic(caught: unknown): Diagnostic {
  const error = renderUnderlyingError(caught);
  return {
    severity: "warning",
    code: SUPERSESSION_DETACH_FAILED_CODE,
    message: `session_start supersession detach failed at ${SUPERSESSION_DETACH_CALL_LABEL}: ${error}`,
    details: { call: SUPERSESSION_DETACH_CALL_LABEL, error },
  };
}

/**
 * One in-memory theta fixture: a slash name plus the body run when the command
 * is dispatched. This is the seam the `H4a` harness's in-memory fixture-supply
 * mechanism drives and that `M` / `M-T` bind against for single-source
 * happy-path discovery — the fixture content is handed to the extension in
 * memory rather than read from the real filesystem, so no `src/**` ambient
 * filesystem read and no `FileSystem` seam dependency is introduced here.
 */
export interface ThetaFixture {
  /** The slash-command name this theta registers under. */
  readonly slashName: string;
  /**
   * The theta's `description:` frontmatter, passed to `pi.registerCommand` so it
   * populates the slash-command autocomplete entry (frontmatter-fields-a.md).
   * Absent when the theta declares no (non-empty) `description:`.
   */
  readonly description?: string;
  /** The command body, run by the registered slash handler on dispatch. */
  readonly run: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

/** Construction dependencies for the theta extension factory. */
export interface ThetaExtensionDeps {
  /**
   * The in-memory theta fixtures whose slash commands the `session_start`
   * handler registers. The `H4a` harness supplies fixtures here for its
   * in-memory end-to-end tests; the shipped production composition root
   * (`H8a`) supplies none here and discovers them at `session_start` via
   * `composeInstance` below.
   */
  readonly fixtures: readonly ThetaFixture[];

  /**
   * The diagnostic-emission seam the factory routes a
   * `theta/load/extension-bootstrap-failed` diagnostic through when a
   * factory-time host-binding call throws (the impl wires this to the
   * **System notes** fallback chain per extension-bootstrap-and-per-theta.md).
   * Declared by `V9k-T` and consumed by the paired `V9k` implementation; the
   * `H4a` harness path omits it, so it is optional.
   */
  readonly emitDiagnostic?: (diagnostic: Diagnostic) => void;

  /**
   * The ctx-latching slot the `session_start` handler fills as the first
   * statement of its body, before any registration work (bug 0023 D1). Once
   * filled, `emitDiagnostic` sites reached from inside a handler (which always
   * hold a `ctx`) route through the sink's full System-notes chain; the five
   * factory-time sites run before any `session_start` delivery and so use the
   * ctx-free partial chain instead. A repeat `session_start` re-latches with a
   * fresh `ctx`. Optional: the `H4a` harness path that injects its own
   * recorder omits it.
   */
  readonly latchSessionContext?: (ctx: ExtensionContext) => void;

  /**
   * The renderer-availability gate (V9p). On a factory-time
   * `pi.registerMessageRenderer` failure the paired V9p implementation calls
   * `rendererGate.degrade()` so this extension instance's system notes
   * permanently route through the `ctx.ui.notify` arm of the System-notes
   * fallback chain. Optional: the `H4a` / `V9k` paths that do not exercise the
   * renderer-degrade surface omit it. Declared by `V9p-T`, consumed by `V9p`.
   */
  readonly rendererGate?: RendererGate;

  /**
   * The extension-scoped `ThetaRegistry` whose drain-state contract the
   * `session_start` handler MUST NOT touch on a `pi.getCommands()` read failure
   * (drain state is owned by `V9m`'s `ThetaRegistry` contract). Injected so the
   * `V9p` getCommands-failure path can be witnessed to leave the registry in
   * its steady-state drain tuple. Optional; declared by `V9p-T`, consumed by
   * `V9p`.
   */
  readonly registry?: ThetaRegistry;

  /**
   * The Phase-5 production supplier that composes one extension instance and
   * exposes the step-5 watcher installer
   * (registration-steps.md#watcher-hot-reload-registration). When present the
   * `session_start` handler runs it, registers the composed thetas, and arms ONE
   * hot-reload watcher over the discovery-root union + settings-file paths; the
   * `session_shutdown` handler detaches it, and a shutdown-less repeat
   * `session_start` supersedes the prior generation — detaching its watcher and
   * draining its registry — before arming its own (bug 0021, PIC-68), so the
   * instance holds at most one armed watcher across repeat deliveries. The
   * shipped production default export supplies this; the `H4a` in-memory
   * harness omits it (falling back to the static `registerFixtures(deps.fixtures)`
   * path).
   *
   * Bug 0024 (registration-steps.md#pic-69): the third parameter is this
   * instance's own-registration ledger — every slash name ever passed to
   * `pi.registerCommand` (`registerFixtures` below stamps it). The supplier
   * forwards it into `composeExtensionInstance` so every pass that reads
   * `pi.getCommands()` for the cross-format collision check, including the
   * first `session_start` and every supersession/rebind pass, excludes this
   * instance's own prior registrations from the collision source set instead
   * of self-colliding against them.
   */
  readonly composeInstance?: (
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    ownRegisteredNames: ReadonlySet<string>,
  ) => Promise<ExtensionInstanceWiring>;

  /**
   * RFC-0006 (subagent.md #pic-58): `true` when this extension instance is
   * loading INSIDE a spawned subagent child `pi` process, detected by the
   * subagent-root regime marker `PI_THETA_SUBAGENT_ROOT=<slug>` (which subsumes
   * the retired RFC-0005 boolean `PI_THETA_SUBAGENT_CHILD` marker, per PIC-58).
   * The child MUST NOT install its own step-5 file watcher / `ReloadDebouncer`
   * (a recursive behaviour that must not run in the ephemeral child), so the
   * arming is suppressed. Read once at the default export from the process env;
   * absent (falsey) on the parent / harness paths.
   */
  readonly isSubagentChild?: boolean;
}

/**
 * Construct the theta extension factory from injected dependencies. The
 * returned `(pi) => void` is the synchronous-arm Pi extension factory.
 */
export function createThetaExtension(
  deps: ThetaExtensionDeps,
): (pi: ExtensionAPI) => void {
  return function thetaExtension(pi: ExtensionAPI): void {
    // The step-5 hot-reload teardown handle, armed by the `session_start`
    // compose-instance path and detached by `session_shutdown` — or, on a
    // shutdown-less repeat `session_start`, by that pass's
    // supersede-before-publish step (bug 0021, PIC-68). The slot is
    // single-occupancy, so the extension instance holds at most ONE armed
    // watcher (registration-steps.md#watcher-hot-reload-registration). Closed
    // over by both handlers (one extension instance, no module-level state).
    let hotReloadHandle: HotReloadHandle | undefined;
    // Factory-scoped live resources the `session_shutdown` teardown reads
    // LAZILY. `wiring` (holding the registry + clock) is a local in
    // `runComposeInstanceRegistration`, not factory-scoped, and the
    // `session_shutdown` subscription is installed BEFORE compose runs
    // (Factory-ordering pin, session-shutdown-semantics.md), so the handler
    // cannot capture `wiring` directly — it reads these mutables at teardown
    // time. Both stay `undefined` when compose never ran / failed, which the
    // handler treats as "nothing to tear down".
    let liveRegistry: ThetaRegistry | undefined;
    let liveClock: Clock | undefined;
    // Decision 6 / Increment B1: the live shared in-flight-invocation registry
    // published by compose. `undefined` until compose runs; the shutdown handler
    // falls back to a fresh empty registry (a no-op teardown) when compose never
    // ran, keeping the compose-never-ran path safe.
    let liveActiveInvocations: ActiveInvocationRegistry | undefined;
    // Decision 6 / Increment B2: the live shared sink of invocation-scoped
    // forwarding listeners published by compose. `undefined` until compose runs;
    // the shutdown handler falls back to an empty list (a no-op sub-step 5) when
    // compose never ran, keeping the compose-never-ran path safe.
    let liveForwardingSignals: ForwardingSignalSource[] | undefined;
    // Bugs 0018/0021/0022 (PIC-67/PIC-68) — the two touch-free staleness
    // counters an async `session_start` compose snapshots at its own start and
    // re-reads when it settles. A mismatch on either is the factory's
    // TOUCH-FREE evidence that the settling compose no longer owns this
    // extension instance, and the single decision site in
    // `runComposeInstanceRegistration` then gates the WHOLE post-compose
    // continuation zero-touch on both arms — no `live*` publish, no
    // registration pass, no diagnostic construction, no step-5 watcher arming
    // (full rationale at the decision site). Two evidence kinds:
    //   • `session_shutdown` deliveries (bugs 0018/0022, PIC-67) — a mismatch
    //     means a shutdown was consumed mid-flight, so the teardown that ran
    //     can never visit the settling compose's generation and the runtime is
    //     invalidated (or about to be);
    //   • `session_start` compose passes entered (bug 0021, PIC-68) — a
    //     mismatch means a NEWER compose started mid-flight, so the settling
    //     compose is already superseded and the newest-started pass owns all
    //     publication, registration, and arming.
    // Both comparisons are capture-at-compose-start, per-compose-generation (a
    // legitimate later `session_start` captures the newer counts and proceeds
    // normally) and race-free within the single JS thread: each handler
    // increments synchronously before a parked compose can resume.
    let shutdownEventsObserved = 0;
    let composeStartsObserved = 0;
    // Bug 0021 repeat-start diagnostic
    // (registration-steps.md#repeat-start-supersession) — the
    // `shutdownEventsObserved` value as of the LAST compose pass entered. WHY
    // a per-start snapshot: it lets each `session_start` delivery decide
    // repeat-without-shutdown locally (zero `session_shutdown` deliveries
    // consumed since the previous start) instead of from a cumulative
    // starts-vs-shutdowns imbalance, which one shutdown-less supersession
    // would skew forever — every later legitimate start-after-shutdown rebind
    // would keep misfiring the note.
    let shutdownsAtLastComposeStart = 0;
    // Bug 0021 (PIC-68) — the supersession fold: the teardown-reach residue of
    // every generation a repeat `session_start` superseded. Watcher detach and
    // registry drain happen AT supersession time (the supersede-before-publish
    // step in `runComposeInstanceRegistration`); what must outlive the
    // overwrite are the superseded in-flight invocation registries and
    // forwarding-signal lists, so one `session_shutdown`'s sub-steps 2/3/5
    // reach every generation the instance has published. Consumed (emptied)
    // by the shutdown handler, making a later start-after-shutdown
    // supersession a structural no-op.
    const supersededGenerations: SupersededGeneration[] = [];
    // Bug 0024 (registration-steps.md#pic-69) — the own-registration ledger:
    // every slash name this extension instance has EVER passed to
    // `pi.registerCommand`, stamped by `registerFixtures` below. Factory-scoped
    // (one per extension instance), like every other closure state above — no
    // globals, no statics. It is deliberately NOT `liveRegistry`'s keys: Pi
    // exposes no `pi.unregisterCommand`, so a name a prior pass registered and a
    // later collision then dropped from the registry is still reported back by
    // `pi.getCommands()` and must still be excluded on the next pass, which only
    // this cumulative ledger (not a registry snapshot) remembers.
    const ownRegisteredNames = new Set<string>();
    // Step 1 — `--theta` flag. Synchronous-void; per-call wrapped. A
    // `registerFlag` throw is FATAL to the whole extension: step 1's `--theta`
    // flag is what every subsequent discovery / `resources_discover` walk reads
    // via `pi.getFlag('theta')`, so a flag-less factory cannot honour the
    // `--theta` source. The factory skips every subsequent `pi.register*` /
    // `pi.on` call (steps 2–5 do not execute) and emits a single diagnostic.
    try {
      pi.registerFlag(THETA_FLAG, {
        type: "string",
        description: "Path(s) to .theta discovery roots.",
      });
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      deps.emitDiagnostic?.(bootstrapFailedDiagnostic("pi.registerFlag", e));
      return;
    }

    // Renderer — synchronous-void; registered exactly once in the factory body.
    // A renderer failure is a NON-abort degrade surface (V9p): the renderer
    // registration drops but the factory still completes the remaining steps.
    // System notes for this extension instance permanently degrade to the
    // `ctx.ui.notify` arm of the System-notes fallback chain (the
    // persistent-transcript renderer is unavailable), so the factory degrades
    // the shared `RendererGate` and emits one diagnostic naming the capability.
    try {
      pi.registerMessageRenderer(SYSTEM_NOTE_CHANNEL, createSystemNoteRenderer());
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      deps.rendererGate?.degrade();
      deps.emitDiagnostic?.(
        bootstrapFailedDiagnostic("pi.registerMessageRenderer", e),
      );
    }

    // The three factory-time `pi.on` subscriptions (steps 1/3/4). A
    // subscription throw is FATAL to the whole extension: the subscribed
    // handlers are extension-scoped, so a factory that cannot install the
    // `resources_discover` re-walk, the `session_start` collision/registration
    // pass, or the `session_shutdown` teardown contract cannot honour its
    // load-bearing obligations. On the first throw the factory skips every
    // subsequent `pi.register*` / `pi.on` call and emits a single diagnostic
    // naming the failing event. The literal-event `pi.on` overloads keep each
    // call on its typed handler signature (the host overloads are keyed by the
    // literal event name), so the three subscriptions are installed inline
    // rather than from a list.

    // `resources_discover` (step 1) — no-op handler at this leaf.
    try {
      pi.on("resources_discover", () => undefined);
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      deps.emitDiagnostic?.(
        bootstrapFailedDiagnostic("pi.on", e, { event: "resources_discover" }),
      );
      return;
    }

    // `session_start` (step 3) — the handler is where per-theta
    // `pi.registerCommand` calls fire (NOT the factory body), per the
    // registration-timing split. Each command registration is itself per-call
    // wrapped so one theta's failure does not abort the others or propagate into
    // Pi's `session_start` dispatch.
    try {
      pi.on("session_start", (_event, ctx: ExtensionContext) => {
        // Bug 0023 D1: latch the ctx BEFORE any registration work, so every
        // `emitDiagnostic` site reached from inside this handler (or later,
        // e.g. `session_shutdown`) can route through the sink's full
        // System-notes chain instead of the factory-time partial one.
        deps.latchSessionContext?.(ctx);
        // The H4a in-memory path registers its static fixtures synchronously
        // (the harness fires `session_start` synchronously and reads the
        // registered list immediately). The H8a production path composes an
        // extension instance instead (an async walk keyed to the host
        // `ctx.cwd`), so when `composeInstance` is present the handler returns
        // a promise the host runner awaits before reading commands.
        if (deps.composeInstance !== undefined) {
          return runComposeInstanceRegistration(ctx);
        }
        registerFixtures(deps.fixtures);
        return;
      });
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      deps.emitDiagnostic?.(
        bootstrapFailedDiagnostic("pi.on", e, { event: "session_start" }),
      );
      return;
    }

    /**
     * The shared `session_start` registration body: read `pi.getCommands()`
     * for the cross-format collision pass (treated read-only by convention,
     * PIC-39) and register each pending fixture through a per-theta-wrapped
     * `pi.registerCommand`. A `getCommands()` read failure is a NON-abort
     * surface (V9p): it drops the pending-registration list for this pass (no
     * `pi.registerCommand` calls issue), emits one diagnostic, and MUST NOT set
     * drain state (owned by V9m's `ThetaRegistry` contract). A per-theta
     * `registerCommand` throw drops only that theta — siblings still register —
     * and emits one diagnostic carrying its slash name.
     */
    function registerFixtures(
      fixtures: readonly ThetaFixture[],
      registry?: ThetaRegistry,
    ): void {
      try {
        pi.getCommands();
      } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        deps.emitDiagnostic?.(bootstrapFailedDiagnostic("pi.getCommands", e));
        return;
      }
      for (const fixture of fixtures) {
        // Bug 0024 (registration-steps.md#pic-69): stamp the ledger BEFORE the
        // call, not after, so a throwing `pi.registerCommand` is still
        // recorded — whether Pi stored the entry despite the throw is unknown
        // from here, and the two failure directions are asymmetric: excluding
        // a name Pi does not hold is harmless (the next pass's discovery walk
        // finds no colliding entry to exclude), while failing to
        // exclude a name Pi DOES hold re-opens this bug's self-collision.
        ownRegisteredNames.add(fixture.slashName);
        try {
          pi.registerCommand(fixture.slashName, {
            // frontmatter-fields-a.md: `description` populates the autocomplete
            // entry. Omitted when the theta declares none (registers untexted).
            ...(fixture.description !== undefined ? { description: fixture.description } : {}),
            // PIC-29..32: on the composeInstance path the REGISTERED handler is a
            // drain-state-gated, registry-backed wrapper — read `readDrainState`
            // under the PIC-31 slash-site fail-safe, then either dispatch the
            // registry's CURRENT raw entry (so a post-swap reload is picked up on
            // the next dispatch) or emit the shutting-down/superseded note. The
            // registry stores the RAW run (`fixture.run` closures re-registered
            // per swap) so the wrapper is the ONLY indirection (no recursion).
            // The static/discovery paths (no registry) keep the raw pass-through.
            handler:
              registry !== undefined
                ? drainGatedHandler(fixture.slashName, registry)
                : (args, ctx: ExtensionCommandContext) => fixture.run(args, ctx),
          });
        } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
          deps.emitDiagnostic?.(
            bootstrapFailedDiagnostic("pi.registerCommand", e, {
              theta: fixture.slashName,
            }),
          );
        }
      }
    }

    /**
     * Build the PIC-29..32 drain-state-gated dispatch handler for one slash
     * name (composeInstance path only). At dispatch time it reads
     * `readDrainState` under the PIC-31 slash-site fail-safe and routes: arm (a)
     * dispatches the registry's CURRENT raw entry (so a post-swap reload is
     * picked up on the next dispatch, and a dropped/superseded entry yields the
     * superseded note), arm (b) returns the shutting-down note. The note is
     * delivered on the `theta-system-note` channel with `triggerTurn:false` — the
     * same envelope as every other theta system note. The registry stores the RAW
     * run, so this wrapper is the only indirection (no wrapper→wrapper recursion
     * on re-register).
     */
    function drainGatedHandler(
      name: string,
      registry: ThetaRegistry,
    ): (args: string, ctx: ExtensionCommandContext) => Promise<void> {
      return async (args: string, ctx: ExtensionCommandContext) => {
        const outcome = resolveSlashDispatchWithReadFailover(
          name,
          () => registry.readDrainState(),
          registry,
        );
        if (outcome.kind === "note") {
          pi.sendMessage(
            {
              customType: SYSTEM_NOTE_CHANNEL,
              content: outcome.content,
              display: true,
              details: { event: {} },
            },
            { triggerTurn: false },
          );
          return;
        }
        await outcome.theta.run(args, ctx);
      };
    }

    /**
     * The Phase-5 production `session_start` pass: compose one extension
     * instance, register its thetas alongside the static ones, then arm the
     * step-5 watcher / debounced hot-reload
     * (registration-steps.md#watcher-hot-reload-registration). The arming
     * closure re-uses `registerFixtures` as its reload re-registration step
     * (collision pass + `pi.registerCommand`). A compose-supplier throw fails
     * the whole compose phase rather than a single host-binding call, so it
     * surfaces one `theta/load/extension-compose-failed` diagnostic; an arming
     * throw is a host-binding failure and surfaces one
     * `theta/load/extension-bootstrap-failed` diagnostic. Both are trapped here
     * rather than propagating into the host `session_start` dispatch.
     */
    async function runComposeInstanceRegistration(
      ctx: ExtensionContext,
    ): Promise<void> {
      // Bug 0018 (PIC-67): snapshot the shutdown count before the async compose
      // so the whole-tail decision below can tell whether a `session_shutdown`
      // was consumed while this compose pass was in flight.
      const shutdownsAtComposeStart = shutdownEventsObserved;
      // Bug 0021 repeat-start predicate
      // (registration-steps.md#repeat-start-supersession), decided BEFORE this
      // pass stamps its own entry below: fires iff a prior compose pass was
      // entered and no shutdown was consumed since that pass entered — i.e.
      // this delivery follows a previous `session_start` delivery with zero
      // `session_shutdown` deliveries in between. A start-after-shutdown
      // rebind keeps `shutdownEventsObserved` ahead of the snapshot and emits
      // nothing.
      const repeatStartWithoutShutdown =
        composeStartsObserved > 0 &&
        shutdownEventsObserved === shutdownsAtLastComposeStart;
      // Bug 0021 (PIC-68): stamp this pass's compose generation before the
      // async compose, so the whole-tail decision below can tell whether a
      // NEWER `session_start` compose started while this one was in flight.
      composeStartsObserved += 1;
      const generationAtComposeStart = composeStartsObserved;
      // Refresh the last-start shutdown snapshot the repeat-start predicate
      // reads, so the NEXT delivery decides against this pass's entry point.
      shutdownsAtLastComposeStart = shutdownEventsObserved;
      // Bug 0021 repeat-start diagnostic: a shutdown-less repeat delivery
      // (`repeatStartWithoutShutdown` above) is a contemplated host input —
      // registration-steps.md step 3's supersession-pass language,
      // `bindExtensions` re-delivery — but an anomalous lifecycle worth
      // exactly one operator-visible note per repeat delivery, emitted at
      // delivery time (before the compose runs) so it fires even in the
      // overlap case where a superseded pass never reaches its own tail.
      // Best-effort: a failed diagnostic must not abort this registration
      // pass.
      if (repeatStartWithoutShutdown) {
        try {
          pi.sendMessage(
            {
              customType: SYSTEM_NOTE_CHANNEL,
              content:
                "theta: repeat session_start without session_shutdown; superseding prior hot-reload generation",
              display: true,
              details: { event: {} },
            },
            { triggerTurn: false },
          );
        } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
          void e;
        }
      }
      // Bugs 0021/0022 (PIC-67/PIC-68), subsuming the bug-0018 arming check:
      // the single decision site for the whole post-compose continuation,
      // evaluated on both arms the moment the compose settles. The factory
      // holds staleness evidence TOUCH-FREE, one disjunct per evidence kind.
      // Disjunct 1 (bugs 0018/0022, PIC-67): a `session_shutdown` was consumed
      // while THIS compose was in flight, so the teardown that ran can never
      // visit the generation this compose would publish (this compose's wiring
      // was necessarily unpublished at teardown time), and the runtime is
      // invalidated (or about to be). Disjunct 2 (bug 0021, PIC-68): a NEWER
      // `session_start` compose started while this one was in flight, so THIS
      // compose is already superseded — the newest-started pass owns all
      // publication, registration, and arming (it supersedes the then-live
      // generation itself; a last-completing older pass publishing over it
      // would invert ownership and strand the newest generation's armed
      // watcher and undrained registry). On either disjunct nothing in the
      // tail may run: no `live*` publish (a populated dead- or superseded-
      // generation registry no teardown or supersession would ever visit), no
      // registration pass (a guarded touch on the invalidated runtime, or live
      // re-registration binding pi's commands to a generation that owns
      // nothing), no diagnostic construction (the delivery channel rides the
      // same invalidated runtime — PIC-67 clause (c) — or would deliver for a
      // pass that owns nothing), and no watcher arming (a watcher no teardown
      // or supersession will ever detach). Zero-touch return; not arming IS
      // the PIC-57-correct posture, and the suppression is pinned by PIC-67
      // and PIC-68. One check per arm suffices: the tail is await-free after
      // it (the supersession fold and registerFixtures are synchronous), so
      // no shutdown and no newer start can interleave past the check. Any
      // future touch-free staleness evidence for this late tail joins here as
      // a disjunct.
      const composeTailSuperseded = (): boolean =>
        shutdownEventsObserved !== shutdownsAtComposeStart ||
        composeStartsObserved !== generationAtComposeStart;
      let wiring: ExtensionInstanceWiring | undefined;
      try {
        // Bug 0024 (registration-steps.md#pic-69): thread the live
        // own-registration ledger so this pass's cross-format collision check
        // excludes every name this instance itself registered — including a
        // prior generation's, on a supersession or start-after-shutdown rebind.
        wiring = await deps.composeInstance!(pi, ctx, ownRegisteredNames);
      } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        if (composeTailSuperseded()) {
          return;
        }
        // Bug 0023 element 4: a throw escaping the whole compose pass — the
        // discovery walk, settings read, parse, schema compile, or registry
        // build — is a distinct phase from a single host-binding call, so it
        // carries its own `theta/load/extension-compose-failed` code rather
        // than the closed `BootstrapCapability` union's nearest member.
        deps.emitDiagnostic?.(composeFailedDiagnostic(e));
        registerFixtures(deps.fixtures);
        return;
      }
      if (composeTailSuperseded()) {
        return;
      }
      // Bug 0021 (registration-steps.md#watcher-hot-reload-registration,
      // PIC-57/PIC-68) — supersede-before-publish: the live-resource slots
      // below are single-occupancy, so overwriting them while a prior
      // generation is published would strand that generation's armed watcher
      // and undrained registry where no teardown can ever reach them (the
      // `session_shutdown` handler reads the slots lazily and sees only the
      // latest occupant). The prior generation is therefore superseded BEFORE
      // the overwrite, against the live runtime the guard above just
      // evidenced: fold its in-flight invocation registry and forwarding-
      // signal list into `supersededGenerations` so one `session_shutdown`
      // still reaches them (sub-steps 2/3/5); drain its registry so every
      // pi-registered handler still bound to it fails safe at dispatch with
      // the drain-state arm-(b) shutting-down note (Pi has no unregister); and
      // detach its watcher so no superseded-generation reload can rebuild or
      // re-register again (PIC-57). Infallible steps run first (an array push,
      // then the drain field-write — idempotent) so a throwing detach cannot
      // strand the fold; the handle slot is cleared before `detach()` so no
      // later path can double-detach the same handle. On a first start and on
      // a start-after-shutdown rebind this whole step is a structural no-op
      // (nothing published: no fold, drain idempotent-or-absent, no handle).
      if (liveActiveInvocations !== undefined || liveForwardingSignals !== undefined) {
        supersededGenerations.push({
          activeInvocations: liveActiveInvocations,
          forwardingSignals: liveForwardingSignals,
        });
      }
      liveRegistry?.drain();
      const outgoingHandle = hotReloadHandle;
      hotReloadHandle = undefined;
      try {
        outgoingHandle?.detach();
      } catch (e: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
        // Same isolation posture as the teardown's Per-step isolation for the
        // identical `discoveryWatcher.close` step: a detach throw must not
        // abort the superseding pass's publication/registration and must not
        // escape into the host `session_start` dispatch. The drained
        // outgoing registry (above) already makes the superseded generation
        // fail safe at dispatch regardless of this throw, and hot-reload.ts's
        // containment-first `detach()` has already applied its torn-down
        // marks before the one fallible step, so no superseded-generation
        // reload can follow either (bug 0029) — this diagnostic is evidence
        // of the failure, not a compensating control. Evidence: exactly one
        // diagnostic per failing detach, defended by its own try/catch so a
        // throwing `deps.emitDiagnostic` sink cannot escape this handler.
        try {
          deps.emitDiagnostic?.(supersessionDetachFailedDiagnostic(e));
        } catch (emitError: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
          void emitError;
        }
      }
      // Publish the live resources for the lazy `session_shutdown` teardown read.
      liveRegistry = wiring.registry;
      liveClock = wiring.clock;
      // Decision 6 / Increment B1: publish the shared registry the producer's
      // bind choke points register in-flight invocations into, so the teardown's
      // sub-steps 2/3 operate on REAL entries.
      liveActiveInvocations = wiring.activeInvocations;
      // Decision 6 / Increment B2: publish the shared forwarding-listener sink
      // the producer's bind choke points push invocation-scoped sources onto, so
      // the teardown's sub-step 5 detaches REAL still-attached listeners.
      liveForwardingSignals = wiring.forwardingSignals;
      registerFixtures([...deps.fixtures, ...wiring.thetas], wiring.registry);
      // RFC-0006: a subagent child (marked by `PI_THETA_SUBAGENT_ROOT=<slug>`,
      // which subsumes the retired boolean `PI_THETA_SUBAGENT_CHILD`) MUST NOT
      // install its own step-5 file watcher / `ReloadDebouncer` — the child is
      // ephemeral (one invocation, then it exits) and a recursive watcher rebuild
      // inside it is exactly the behaviour the env marker suppresses (subagent.md
      // #pic-58). The parent still arms the watcher normally.
      if (deps.isSubagentChild === true) {
        return;
      }
      try {
        hotReloadHandle = wiring.installHotReload(
          (thetas: readonly ParsedTheta[]) =>
            registerFixtures(thetas, wiring!.registry),
        );
      } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        deps.emitDiagnostic?.(
          bootstrapFailedDiagnostic("pi.on", e, { event: "session_start" }),
        );
      }
    }

    // `session_shutdown` (step 4) — run the five-sub-step teardown
    // (session-shutdown-semantics.md): sub-step 1 (drain + init drain-state
    // tag) on the latest registry, sub-steps 2/3 over the MERGED in-flight
    // invocation registry, sub-step 4 (watcher-close + debounce-cancel) via
    // the captured teardown handle, and sub-step 5 over the MERGED
    // forwarding-signal list. Bug 0021 (PIC-68) — teardown reach across
    // generations: the merged inputs span every generation the instance has
    // published (the supersession fold plus the latest), so one shutdown's
    // reach stays complete even after shutdown-less repeat `session_start`
    // deliveries; sub-steps 1/4 operate on the latest generation only because
    // the superseded generations were already drained/detached at
    // supersession time. The whole handler body stays wrapped in the
    // never-throw factory boundary so a throw surfaces one diagnostic rather
    // than propagating into the host teardown. `runSessionShutdown` is async
    // and the host awaits a returned promise (`emitSessionShutdownEvent` →
    // `await handler(...)`), so the handler returns it inside the try to
    // preserve await-ordering.
    try {
      pi.on("session_shutdown", (event) => {
        // Bug 0018 (PIC-67), arming check subsumed by bug 0022's
        // compose-settle gate: record the delivery before anything can throw
        // or short-circuit, so an in-flight `session_start` compose observes
        // it at its compose-settle boundary even when the lazy reads below
        // no-op this teardown.
        shutdownEventsObserved += 1;
        try {
          // Read the live resources LAZILY (the subscription fires before compose
          // runs). No live registry/clock means compose never ran / failed —
          // there is nothing wired to tear down, so no-op safely.
          const registry = liveRegistry;
          const clock = liveClock;
          if (registry === undefined || clock === undefined) {
            return;
          }

          // Handler-entry short-circuit (spec steps I+II, PIC-31 idempotence):
          // read the live drain state under the read-failover. A prior
          // `session_shutdown` left the tag set, so a re-delivery short-circuits
          // here (host-prerequisites clause (b)); a `readDrainState` throw fails
          // OPEN (returns `false`) → proceed to the full five-sub-step teardown.
          if (
            evalShutdownShortCircuitWithReadFailover(() =>
              registry.readDrainState(),
            )
          ) {
            return;
          }

          // Bug 0021 (PIC-68): capture the teardown handle at the lazy-read
          // point and build BOTH sub-step-4 adapters below over the captured
          // local — the mutable slot is cleared before `runSessionShutdown`'s
          // awaited sequence reaches sub-step 4, so an adapter reading the
          // slot at call time would observe `undefined` and skip the detach.
          const handle = hotReloadHandle;

          // Bug 0021 (PIC-68) — teardown reach across generations: sub-steps
          // 2/3 consume ONE merged handler-local `ActiveInvocationRegistry`
          // (the superseded generations' entries in supersession order, then
          // the latest generation's) and sub-step 5 consumes the concatenated
          // forwarding-signal lists in the same order. Entries are shared
          // references, so the reason-stamp/abort and the listener detach
          // reach the real objects; the merged containers are handler-local
          // and discarded with this teardown.
          const mergedActiveInvocations = new ActiveInvocationRegistry();
          const mergedForwardingSignals: ForwardingSignalSource[] = [];
          for (const generation of supersededGenerations) {
            for (const entry of generation.activeInvocations?.snapshot() ?? []) {
              mergedActiveInvocations.add(entry);
            }
            mergedForwardingSignals.push(...(generation.forwardingSignals ?? []));
          }
          for (const entry of liveActiveInvocations?.snapshot() ?? []) {
            mergedActiveInvocations.add(entry);
          }
          mergedForwardingSignals.push(...(liveForwardingSignals ?? []));

          const shutdownDeps: SessionShutdownDeps = {
            registry,
            // Increment B1, widened by bug 0021: the merged registry above, so
            // sub-step 2 (cancel in-flight) + sub-step 3 (await dispose)
            // operate on the REAL entries of every published generation. Empty
            // when nothing is in flight, keeping that path an instant no-op.
            activeInvocations: mergedActiveInvocations,
            clock,
            // ClosableWatcher ADAPTER — documented spec-vs-impl drift: the spec
            // deps model TWO watchers (`discoveryWatcher` + `settingsWatcher`)
            // plus a raw `clock.clearTimeout(debounceHandle)`; production runs
            // ONE union `FileWatcher` + a `ReloadDebouncer` behind
            // `HotReloadHandle.detach()` (which applies the torn-down mark —
            // itself cancelling the pending debounce — and then the unsub —
            // hot-reload.ts). So sub-step 4's
            // watcher-close + debounce-cancel are BOTH delegated to `detach()`
            // here; `settingsWatcher` is a no-op (the single union watcher
            // already covers the settings paths, detached by this adapter) and
            // `debounceHandle` is `undefined` (the debounce is cancelled inside
            // `detach()`, not via a raw `TimerHandle`). The adapter reconciles
            // the two shapes.
            discoveryWatcher: {
              close: (): void => {
                handle?.detach();
              },
            },
            settingsWatcher: { close: (): void => {} },
            debounceHandle: undefined,
            // PIC-57 sub-step 4: quiesce the REAL hot-reload debouncer through
            // the same `HotReloadHandle` the watcher-close adapter detaches.
            // `markTornDown()` suppresses new watcher rebuilds; `whenIdle()`
            // lets an already-in-flight rebuild complete against the still-live
            // ctx before the handler returns and Pi invalidates the runtime.
            // Both members are optional on `HotReloadHandle`, so a lightweight
            // handle that only supplies `detach()` degrades to a no-op quiesce.
            debouncer:
              handle !== undefined
                ? {
                    markTornDown: (): void => {
                      handle.markTornDown?.();
                    },
                    whenIdle: (): Promise<void> =>
                      handle.whenIdle?.() ?? Promise.resolve(),
                  }
                : undefined,
            // Increment B2, widened by bug 0021: the merged forwarding-signal
            // list above, so sub-step 5 detaches the listeners still attached
            // for an invocation in-flight at shutdown under ANY published
            // generation. Empty when nothing was ever pushed, keeping that
            // path an instant no-op.
            forwardingSignals: mergedForwardingSignals,
            inventory: undefined,
            sink: {
              emit: (line: unknown): void => {
                console.error(line);
              },
              serialise: (d: Diagnostic): string => JSON.stringify(d),
            },
          };

          // Bug 0021 (PIC-68): consume the per-generation state synchronously,
          // before the awaited teardown runs — the deps above already hold
          // every reference the five sub-steps need. A later
          // start-after-shutdown supersession is then a structural no-op
          // (nothing left to fold, drain idempotent, no handle to detach), so
          // no generation can be torn down twice. `liveRegistry`/`liveClock`
          // are KEPT so the host-prerequisites clause-(b) re-delivery
          // short-circuit above still runs through the drain-state read as
          // pinned.
          hotReloadHandle = undefined;
          liveActiveInvocations = undefined;
          liveForwardingSignals = undefined;
          supersededGenerations.length = 0;

          return runSessionShutdown({ reason: event.reason }, shutdownDeps);
        } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
          deps.emitDiagnostic?.(
            bootstrapFailedDiagnostic("pi.on", e, { event: "session_shutdown" }),
          );
          return;
        }
      });
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      deps.emitDiagnostic?.(
        bootstrapFailedDiagnostic("pi.on", e, { event: "session_shutdown" }),
      );
      return;
    }
  };
}

/**
 * The production Pi extension factory — the standard
 * `default function (pi: ExtensionAPI)` export the `extensions/index.ts` entry
 * shim re-exports. It constructs a fresh `RendererGate`, bootstrap-diagnostic
 * sink, and `composeInstance` closure per call (no module-level mutable
 * state), runs the step-0 capability probe before any factory-time
 * host-binding call, and wires the `H8a` production composition root
 * (`composeExtensionInstance`) so the `session_start` handler discovers,
 * parses, and composes every `.theta` over the real host seams and registers
 * the result. So the shipped extension actually discovers, registers, and
 * runs `.theta` slash commands — and, per bug 0023, actually delivers its
 * bootstrap diagnostics instead of constructing and dropping them.
 */
export default function thetaExtension(pi: ExtensionAPI): void {
  // Bug 0023 elements 2/1: one `RendererGate` and one bootstrap-diagnostic
  // sink per extension instance (no module-level state) — the sink is what
  // makes every `deps.emitDiagnostic?.()` site below actually deliver instead
  // of constructing a diagnostic no seam observes.
  const rendererGate = new RendererGate();
  const sink = createBootstrapDiagnosticSink(pi, rendererGate);

  // Bug 0023 element 3 / capability-probe.md Step 0: run before the first
  // factory-time host-binding call (`pi.registerFlag` below). On failure,
  // refuse every subsequent `pi.register*` / `pi.on` call and emit the single
  // `theta/load/host-incompatible` refusal through the tier-1 sink (no `ctx`
  // exists yet). Sub-step (f) (`probeSubagentExecutable`) is NOT run here: it
  // stays inside the per-theta compose pass (production-composition.ts), one
  // step later than capability-probe.md's short-circuit sequence places it —
  // a documented ordering discrepancy, not an omission (bug 0023 §Fix item 3).
  const probe = runCapabilityProbe(createProductionProbeHost(pi));
  if (!probe.ok) {
    sink.emit(hostIncompatibleDiagnostic(probe.details));
    return;
  }

  // RFC-0006 (PIC-58): read the subagent-root regime marker ONCE at factory
  // entry. `process.env` is a localised ambient read here (exempted) — the
  // marker's presence identifies a spawned subagent child and gates the step-5
  // watcher suppression so the child does not install a recursive file watcher.
  // It subsumes RFC-0005's boolean `PI_THETA_SUBAGENT_CHILD` marker.
  const isSubagentChild =
    process.env[SUBAGENT_ROOT_ENV_MARKER] !== undefined; // allow-ambient: process.env — RFC-0006 subagent-root regime marker (subagent.md #pic-58)
  createThetaExtension({
    fixtures: [],
    emitDiagnostic: sink.emit,
    rendererGate,
    latchSessionContext: sink.latchSessionContext,
    // Bug 0024 (registration-steps.md#pic-69): forward the factory's
    // own-registration ledger into the composition root so every compose pass
    // — first start, hot-reload, and every supersession/rebind pass alike —
    // excludes this instance's own prior registrations from the collision read.
    composeInstance: (pi, ctx: ExtensionContext, ownRegisteredNames: ReadonlySet<string>) =>
      composeExtensionInstance(pi, ctx, undefined, rendererGate, ownRegisteredNames),
    isSubagentChild,
  })(pi);
}
