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
import { createSystemNoteRenderer } from "./system-note-renderer";

/** The CLI flag the extension registers for `.loom` discovery roots. */
const LOOM_FLAG = "loom";
/** The loom-internal system-note renderer channel. */
const SYSTEM_NOTE_CHANNEL = "loom-system-note";

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
}

/**
 * Construct the loom extension factory from injected dependencies. The
 * returned `(pi) => void` is the synchronous-arm Pi extension factory.
 */
export function createLoomExtension(
  deps: LoomExtensionDeps,
): (pi: ExtensionAPI) => void {
  return function loomExtension(pi: ExtensionAPI): void {
    // Step 1 — `--loom` flag. Synchronous-void; per-call wrapped.
    try {
      pi.registerFlag(LOOM_FLAG, {
        type: "string",
        description: "Path(s) to .loom discovery roots.",
      });
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      void e;
    }

    // Renderer — synchronous-void; registered exactly once in the factory body.
    try {
      pi.registerMessageRenderer(SYSTEM_NOTE_CHANNEL, createSystemNoteRenderer());
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      void e;
    }

    // `resources_discover` subscription — factory-time, synchronous-void.
    try {
      pi.on("resources_discover", () => undefined);
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      void e;
    }

    // `session_start` subscription — factory-time, synchronous-void. The
    // handler is where per-loom `pi.registerCommand` calls fire (NOT the
    // factory body), per the registration-timing split. Each command
    // registration is itself per-call wrapped so one loom's failure does not
    // abort the others or propagate into Pi's `session_start` dispatch.
    try {
      pi.on("session_start", () => {
        for (const fixture of deps.fixtures) {
          try {
            pi.registerCommand(fixture.slashName, {
              handler: (args, ctx) => fixture.run(args, ctx),
            });
          } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
            void e;
          }
        }
      });
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      void e;
    }

    // `session_shutdown` subscription — factory-time, synchronous-void. The
    // teardown contract (registry drain / forwarding-listener detach) is added
    // by later leaves; H4a installs only the subscription.
    try {
      pi.on("session_shutdown", () => undefined);
    } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
      void e;
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
