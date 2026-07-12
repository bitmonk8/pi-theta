// H4a — the loom extension factory (the `src/**` production factory the
// `extensions/index.ts` entry shim re-exports).
//
// The factory establishes the extension by side-effect registration calls on
// the injected `pi: ExtensionAPI` handle. Per
// extension-bootstrap-and-per-loom.md the factory's declared return type is
// `void | Promise<void>` for host-interface conformance, but loom pins it to
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
// `loom/load/extension-bootstrap-failed` diagnostics are added by `V9a`; this
// leaf establishes only the never-throw factory boundary and the per-loom
// command-registration seam the in-memory fixture supply drives.

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { renderUnderlyingError } from "../diagnostics/placeholder";
import { createSystemNoteRenderer } from "./system-note-renderer";
import type { RendererGate } from "./system-note-channel";
import type { LoomRegistry, ParsedLoom } from "./reload-wiring";
import {
  resolveSlashDispatchWithReadFailover,
  evalShutdownShortCircuitWithReadFailover,
} from "./drain-state";
import {
  runSessionShutdown,
  type SessionShutdownDeps,
} from "./session-shutdown";
import { ActiveInvocationRegistry } from "../runtime/active-invocation-registry";
import type { Clock } from "../seams/clock";
import type { HotReloadHandle } from "./hot-reload";
import {
  composeExtensionInstance,
  type ExtensionInstanceWiring,
} from "./production-composition";

/**
 * The diagnostics-registry code a factory-time bootstrap registration /
 * subscription failure surfaces (diagnostics/code-registry-load.md
 * `loom/load/extension-bootstrap-failed`). The paired `V9k` implementation
 * constructs this diagnostic when a factory-time `pi.registerFlag` or
 * `pi.on(...)` call throws; `V9k-T` declares the code so the failing tests can
 * anchor against it.
 */
export const EXTENSION_BOOTSTRAP_FAILED_CODE =
  "loom/load/extension-bootstrap-failed";

/** The CLI flag the extension registers for `.loom` discovery roots. */
const LOOM_FLAG = "loom";
/** The loom-internal system-note renderer channel. */
const SYSTEM_NOTE_CHANNEL = "loom-system-note";

/**
 * The closed set of factory-time `pi.on` subscriptions a bootstrap failure can
 * name, in the canonical registration order (steps 1/3/4 of
 * registration-steps.md): `resources_discover` (step 1, after the `--loom`
 * flag), `session_start` (step 3), `session_shutdown` (step 4). A subscription
 * failure is fatal to the whole extension; `details.event` names the failing
 * one.
 */
type FactorySubscription =
  | "resources_discover"
  | "session_start"
  | "session_shutdown";

/**
 * The closed set of host-binding capabilities a `loom/load/extension-bootstrap-failed`
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
 * Construct the `loom/load/extension-bootstrap-failed` diagnostic for a
 * factory-time or `session_start`-time bootstrap failure surface.
 * `details.error` carries the caught throw's underlying-error string
 * (placeholder-rendering-b.md#underlying-error-coercion) so a non-Error throw
 * yields a deterministic payload; the *Message* renders the byte-identical
 * registry template `extension bootstrap failed: <capability> threw <error>`
 * (code-registry-load.md), the `<error>` tail being the §8 host-derived
 * first-line truncation. `details.event` is added for `pi.on` subscription
 * failures (the failing Pi event); `details.loom` for per-loom
 * `pi.registerCommand` failures (the failing slash name).
 */
function bootstrapFailedDiagnostic(
  capability: BootstrapCapability,
  caught: unknown,
  extra?: { readonly event?: FactorySubscription; readonly loom?: string },
): Diagnostic {
  const error = renderUnderlyingError(caught);
  const details: Record<string, unknown> = { capability, error };
  if (extra?.event !== undefined) {
    details.event = extra.event;
  }
  if (extra?.loom !== undefined) {
    details.loom = extra.loom;
  }
  return {
    severity: "error",
    code: EXTENSION_BOOTSTRAP_FAILED_CODE,
    message: `extension bootstrap failed: ${capability} threw ${error}`,
    details,
  };
}

/**
 * One in-memory loom fixture: a slash name plus the body run when the command
 * is dispatched. This is the seam the `H4a` harness's in-memory fixture-supply
 * mechanism drives and that `M` / `M-T` bind against for single-source
 * happy-path discovery — the fixture content is handed to the extension in
 * memory rather than read from the real filesystem, so no `src/**` ambient
 * filesystem read and no `FileSystem` seam dependency is introduced here.
 */
export interface LoomFixture {
  /** The slash-command name this loom registers under. */
  readonly slashName: string;
  /**
   * The loom's `description:` frontmatter, passed to `pi.registerCommand` so it
   * populates the slash-command autocomplete entry (frontmatter-fields-a.md).
   * Absent when the loom declares no (non-empty) `description:`.
   */
  readonly description?: string;
  /** The command body, run by the registered slash handler on dispatch. */
  readonly run: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

/** Construction dependencies for the loom extension factory. */
export interface LoomExtensionDeps {
  /**
   * The in-memory loom fixtures whose slash commands the `session_start`
   * handler registers. The `H4a` harness supplies fixtures here for its
   * in-memory end-to-end tests; the shipped production composition root
   * (`H8a`) supplies none here and discovers them at `session_start` via
   * `discoverFixtures`.
   */
  readonly fixtures: readonly LoomFixture[];

  /**
   * The `H8a` production discovery-and-composition supplier. When present, the
   * `session_start` handler runs it (against the host `ctx`, whose `cwd` /
   * `modelRegistry` the five-source discovery walk and per-loom composition
   * read) and registers every discovered `.loom`-derived `LoomFixture`
   * alongside the static `fixtures`. Absent on the `H4a` in-memory harness
   * path, which supplies its fixtures synchronously through `fixtures`.
   *
   * Supplying this makes the `session_start` handler asynchronous (the walk
   * reads the real filesystem through the `V8b` `PiFileSystem` seam); the
   * host runner awaits the returned promise before reading the registered
   * command list. A discovery-supplier throw is trapped like any other
   * `session_start`-time host-boundary failure and surfaces one
   * `loom/load/extension-bootstrap-failed` diagnostic rather than propagating
   * into the host `session_start` dispatch.
   */
  readonly discoverFixtures?: (
    pi: ExtensionAPI,
    ctx: ExtensionContext,
  ) => Promise<readonly LoomFixture[]>;

  /**
   * The diagnostic-emission seam the factory routes a
   * `loom/load/extension-bootstrap-failed` diagnostic through when a
   * factory-time host-binding call throws (the impl wires this to the
   * **System notes** fallback chain per extension-bootstrap-and-per-loom.md).
   * Declared by `V9k-T` and consumed by the paired `V9k` implementation; the
   * `H4a` harness path omits it, so it is optional.
   */
  readonly emitDiagnostic?: (diagnostic: Diagnostic) => void;

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
   * The extension-scoped `LoomRegistry` whose drain-state contract the
   * `session_start` handler MUST NOT touch on a `pi.getCommands()` read failure
   * (drain state is owned by `V9m`'s `LoomRegistry` contract). Injected so the
   * `V9p` getCommands-failure path can be witnessed to leave the registry in
   * its steady-state drain tuple. Optional; declared by `V9p-T`, consumed by
   * `V9p`.
   */
  readonly registry?: LoomRegistry;

  /**
   * The Phase-5 production supplier that composes one extension instance and
   * exposes the step-5 watcher installer
   * (registration-steps.md#watcher-hot-reload-registration). When present the
   * `session_start` handler runs it, registers the composed looms, and arms ONE
   * hot-reload watcher over the discovery-root union + settings-file paths; the
   * `session_shutdown` handler detaches it. Takes precedence over
   * `discoverFixtures`. The shipped production default export supplies this;
   * the `H4a` in-memory harness omits it.
   */
  readonly composeInstance?: (
    pi: ExtensionAPI,
    ctx: ExtensionContext,
  ) => Promise<ExtensionInstanceWiring>;
}

/**
 * Construct the loom extension factory from injected dependencies. The
 * returned `(pi) => void` is the synchronous-arm Pi extension factory.
 */
export function createLoomExtension(
  deps: LoomExtensionDeps,
): (pi: ExtensionAPI) => void {
  return function loomExtension(pi: ExtensionAPI): void {
    // The step-5 hot-reload teardown handle, armed by the `session_start`
    // compose-instance path and detached by `session_shutdown`. Closed over by
    // both handlers (one extension instance, no module-level state).
    let hotReloadHandle: HotReloadHandle | undefined;
    // Factory-scoped live resources the `session_shutdown` teardown reads
    // LAZILY. `wiring` (holding the registry + clock) is a local in
    // `runComposeInstanceRegistration`, not factory-scoped, and the
    // `session_shutdown` subscription is installed BEFORE compose runs
    // (Factory-ordering pin, session-shutdown-semantics.md), so the handler
    // cannot capture `wiring` directly — it reads these mutables at teardown
    // time. Both stay `undefined` when compose never ran / failed, which the
    // handler treats as "nothing to tear down".
    let liveRegistry: LoomRegistry | undefined;
    let liveClock: Clock | undefined;
    // Decision 6 / Increment B1: the live shared in-flight-invocation registry
    // published by compose. `undefined` until compose runs; the shutdown handler
    // falls back to a fresh empty registry (a no-op teardown) when compose never
    // ran, keeping the compose-never-ran path safe.
    let liveActiveInvocations: ActiveInvocationRegistry | undefined;
    // Step 1 — `--loom` flag. Synchronous-void; per-call wrapped. A
    // `registerFlag` throw is FATAL to the whole extension: step 1's `--loom`
    // flag is what every subsequent discovery / `resources_discover` walk reads
    // via `pi.getFlag('loom')`, so a flag-less factory cannot honour the
    // `--loom` source. The factory skips every subsequent `pi.register*` /
    // `pi.on` call (steps 2–5 do not execute) and emits a single diagnostic.
    try {
      pi.registerFlag(LOOM_FLAG, {
        type: "string",
        description: "Path(s) to .loom discovery roots.",
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

    // `session_start` (step 3) — the handler is where per-loom
    // `pi.registerCommand` calls fire (NOT the factory body), per the
    // registration-timing split. Each command registration is itself per-call
    // wrapped so one loom's failure does not abort the others or propagate into
    // Pi's `session_start` dispatch.
    try {
      pi.on("session_start", (_event, ctx: ExtensionContext) => {
        // The H4a in-memory path registers its static fixtures synchronously
        // (the harness fires `session_start` synchronously and reads the
        // registered list immediately). The H8a production path additionally
        // discovers fixtures from the real filesystem — an async walk keyed to
        // the host `ctx.cwd` — so when `discoverFixtures` is present the handler
        // returns a promise the host runner awaits before reading commands.
        if (deps.composeInstance !== undefined) {
          return runComposeInstanceRegistration(ctx);
        }
        if (deps.discoverFixtures === undefined) {
          registerFixtures(deps.fixtures);
          return;
        }
        return runProductionRegistration(ctx);
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
     * PIC-39) and register each pending fixture through a per-loom-wrapped
     * `pi.registerCommand`. A `getCommands()` read failure is a NON-abort
     * surface (V9p): it drops the pending-registration list for this pass (no
     * `pi.registerCommand` calls issue), emits one diagnostic, and MUST NOT set
     * drain state (owned by V9m's `LoomRegistry` contract). A per-loom
     * `registerCommand` throw drops only that loom — siblings still register —
     * and emits one diagnostic carrying its slash name.
     */
    function registerFixtures(
      fixtures: readonly LoomFixture[],
      registry?: LoomRegistry,
    ): void {
      try {
        pi.getCommands();
      } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        deps.emitDiagnostic?.(bootstrapFailedDiagnostic("pi.getCommands", e));
        return;
      }
      for (const fixture of fixtures) {
        try {
          pi.registerCommand(fixture.slashName, {
            // frontmatter-fields-a.md: `description` populates the autocomplete
            // entry. Omitted when the loom declares none (registers untexted).
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
              loom: fixture.slashName,
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
     * delivered on the `loom-system-note` channel with `triggerTurn:false` — the
     * same envelope as every other loom system note. The registry stores the RAW
     * run, so this wrapper is the only indirection (no wrapper→wrapper recursion
     * on re-register).
     */
    function drainGatedHandler(
      name: string,
      registry: LoomRegistry,
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
        await outcome.loom.run(args, ctx);
      };
    }

    /**
     * The H8a production `session_start` pass: run the discovery-and-
     * composition supplier against the host `ctx`, then register the
     * discovered fixtures alongside the static ones through the shared
     * `registerFixtures` body. A discovery-supplier throw is trapped here (an
     * exempt Pi-SDK-boundary broad-catch site) so it surfaces one
     * `loom/load/extension-bootstrap-failed` diagnostic rather than
     * propagating into the host `session_start` dispatch; the static fixtures
     * still register.
     */
    async function runProductionRegistration(ctx: ExtensionContext): Promise<void> {
      let discovered: readonly LoomFixture[] = [];
      try {
        discovered = await deps.discoverFixtures!(pi, ctx);
      } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        deps.emitDiagnostic?.(
          bootstrapFailedDiagnostic("pi.registerCommand", e),
        );
      }
      registerFixtures([...deps.fixtures, ...discovered]);
    }

    /**
     * The Phase-5 production `session_start` pass: compose one extension
     * instance, register its looms alongside the static ones, then arm the
     * step-5 watcher / debounced hot-reload
     * (registration-steps.md#watcher-hot-reload-registration). The arming
     * closure re-uses `registerFixtures` as its reload re-registration step
     * (collision pass + `pi.registerCommand`). A compose-supplier throw is
     * trapped like any other `session_start`-time host-boundary failure and
     * surfaces one `loom/load/extension-bootstrap-failed` diagnostic; an arming
     * throw likewise surfaces a single diagnostic rather than propagating into
     * the host `session_start` dispatch.
     */
    async function runComposeInstanceRegistration(
      ctx: ExtensionContext,
    ): Promise<void> {
      let wiring: ExtensionInstanceWiring | undefined;
      try {
        wiring = await deps.composeInstance!(pi, ctx);
      } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        deps.emitDiagnostic?.(bootstrapFailedDiagnostic("pi.registerCommand", e));
        registerFixtures(deps.fixtures);
        return;
      }
      // Publish the live resources for the lazy `session_shutdown` teardown read.
      liveRegistry = wiring.registry;
      liveClock = wiring.clock;
      // Decision 6 / Increment B1: publish the shared registry the producer's
      // bind choke points register in-flight invocations into, so the teardown's
      // sub-steps 2/3 operate on REAL entries.
      liveActiveInvocations = wiring.activeInvocations;
      registerFixtures([...deps.fixtures, ...wiring.looms], wiring.registry);
      try {
        hotReloadHandle = wiring.installHotReload(
          (looms: readonly ParsedLoom[]) =>
            registerFixtures(looms, wiring!.registry),
        );
      } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        deps.emitDiagnostic?.(
          bootstrapFailedDiagnostic("pi.on", e, { event: "session_start" }),
        );
      }
    }

    // `session_shutdown` (step 4) — run the five-sub-step teardown
    // (session-shutdown-semantics.md). This increment wires the factory half:
    // sub-step 1 (drain + init drain-state tag) and sub-step 4 (watcher-close +
    // debounce-cancel) are REAL; the handler-entry short-circuit is REAL; and
    // sub-steps 2/3/5 are live-but-empty (an empty `ActiveInvocationRegistry`
    // and an empty `forwardingSignals` list make them instant no-ops until
    // Increment B threads the real shared registry + signal list). The whole
    // handler body stays wrapped in the never-throw factory boundary so a throw
    // surfaces one diagnostic rather than propagating into the host teardown.
    // `runSessionShutdown` is async and the host awaits a returned promise
    // (`emitSessionShutdownEvent` → `await handler(...)`), so the handler returns
    // it inside the try to preserve await-ordering.
    try {
      pi.on("session_shutdown", (event) => {
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

          const shutdownDeps: SessionShutdownDeps = {
            registry,
            // Increment B1: the live shared registry the producer's bind choke
            // points register in-flight invocations into, so sub-step 2 (cancel
            // in-flight) + sub-step 3 (await dispose) operate on REAL entries.
            // Falls back to a fresh empty registry only when compose never ran
            // (nothing was ever registered), keeping that path an instant no-op.
            activeInvocations: liveActiveInvocations ?? new ActiveInvocationRegistry(),
            clock,
            // ClosableWatcher ADAPTER — documented spec-vs-impl drift: the spec
            // deps model TWO watchers (`discoveryWatcher` + `settingsWatcher`)
            // plus a raw `clock.clearTimeout(debounceHandle)`; production runs
            // ONE union `FileWatcher` + a `ReloadDebouncer` behind
            // `HotReloadHandle.detach()` (which does the unsub AND the
            // `debouncer.cancel()` — hot-reload.ts). So sub-step 4's
            // watcher-close + debounce-cancel are BOTH delegated to `detach()`
            // here; `settingsWatcher` is a no-op (the single union watcher
            // already covers the settings paths, detached by this adapter) and
            // `debounceHandle` is `undefined` (the debounce is cancelled inside
            // `detach()`, not via a raw `TimerHandle`). The adapter reconciles
            // the two shapes.
            discoveryWatcher: {
              close: (): void => {
                hotReloadHandle?.detach();
              },
            },
            settingsWatcher: { close: (): void => {} },
            debounceHandle: undefined,
            // Increment A: no forwarding signals threaded yet (Increment B).
            forwardingSignals: [],
            inventory: undefined,
            sink: {
              emit: (line: unknown): void => {
                console.error(line);
              },
              serialise: (d: Diagnostic): string => JSON.stringify(d),
            },
          };

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
 * shim re-exports. It constructs a fresh factory per call (no module-level
 * mutable state) wired to the `H8a` production composition root: no static
 * fixtures, and a `discoverFixtures` supplier that at `session_start` runs the
 * five-source discovery walk over the real host seams, parses each discovered
 * `.loom`, composes it into a runnable `LoomFixture`, and returns them for
 * registration. So the shipped extension actually discovers, registers, and
 * runs `.loom` slash commands.
 */
export default function loomExtension(pi: ExtensionAPI): void {
  createLoomExtension({
    fixtures: [],
    composeInstance: (pi, ctx: ExtensionContext) =>
      composeExtensionInstance(pi, ctx),
  })(pi);
}
