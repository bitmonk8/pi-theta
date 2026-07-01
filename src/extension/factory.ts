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
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { renderUnderlyingError } from "../diagnostics/placeholder";
import { createSystemNoteRenderer } from "./system-note-renderer";
import type { RendererGate } from "./system-note-channel";
import type { LoomRegistry } from "./reload-wiring";

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
  /** The command body, run by the registered slash handler on dispatch. */
  readonly run: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

/** Construction dependencies for the loom extension factory. */
export interface LoomExtensionDeps {
  /**
   * The in-memory loom fixtures whose slash commands the `session_start`
   * handler registers. Empty in production until discovery lands in a later
   * leaf; the harness supplies fixtures here for end-to-end tests.
   */
  readonly fixtures: readonly LoomFixture[];

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
}

/**
 * Construct the loom extension factory from injected dependencies. The
 * returned `(pi) => void` is the synchronous-arm Pi extension factory.
 */
export function createLoomExtension(
  deps: LoomExtensionDeps,
): (pi: ExtensionAPI) => void {
  return function loomExtension(pi: ExtensionAPI): void {
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
      pi.on("session_start", () => {
        // The first action of the step-3 handler is a `pi.getCommands()` read
        // for the cross-format collision pass (registration-steps.md), which
        // runs before the per-loom `pi.registerCommand` loop. A throw from this
        // read is a NON-abort surface (V9p): the handler swallows it, drops the
        // pending-registration list for THIS pass (no `pi.registerCommand`
        // calls issue), and emits one diagnostic — and MUST NOT set drain state
        // (drain state is owned by V9m's `LoomRegistry` contract;
        // drain-state-contract.md), so `deps.registry` is left untouched here.
        // The failure is scoped to this `session_start` pass; `/reload`
        // recovers.
        try {
          pi.getCommands();
        } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
          deps.emitDiagnostic?.(
            bootstrapFailedDiagnostic("pi.getCommands", e),
          );
          return;
        }
        // Per-loom `pi.registerCommand` (NON-abort, per-loom): each call is its
        // own per-call wrap so one loom's failure drops only that loom —
        // siblings still register — and emits one diagnostic per failing loom
        // carrying its slash name, without propagating into Pi's
        // `session_start` dispatch.
        for (const fixture of deps.fixtures) {
          try {
            pi.registerCommand(fixture.slashName, {
              handler: (args, ctx: ExtensionCommandContext) => fixture.run(args, ctx),
            });
          } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
            deps.emitDiagnostic?.(
              bootstrapFailedDiagnostic("pi.registerCommand", e, {
                loom: fixture.slashName,
              }),
            );
          }
        }
      });
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      deps.emitDiagnostic?.(
        bootstrapFailedDiagnostic("pi.on", e, { event: "session_start" }),
      );
      return;
    }

    // `session_shutdown` (step 4) — no-op handler at this leaf; the teardown
    // contract (registry drain / forwarding-listener detach) is added later.
    try {
      pi.on("session_shutdown", () => undefined);
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
 * mutable state) with no fixtures wired: `.loom` discovery is owned by a later
 * leaf, so the production factory currently registers no slash commands.
 */
export default function loomExtension(pi: ExtensionAPI): void {
  createLoomExtension({ fixtures: [] })(pi);
}
