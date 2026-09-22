// Injected dependencies and in-memory fixtures for the theta extension factory.

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { InProcessToolExecute } from "../runtime/tool-call-execute";
import type { ResultChannelClient } from "../runtime/subagent-result-channel";
import type { EntryChannelHandle } from "./execution-status/entry-channel";
import type { RunCardController } from "./execution-status/run-card-renderer";
import type { ExecutionStatusBus } from "./execution-status/types";
import type { RendererGate, SystemNoteChannelDeps } from "./system-note-channel";
import type {
  ExtensionInstanceWiring,
  PlacementRegistrationHandle,
} from "./production-composition";
import type { FailFastTerminator } from "./session-swap-tripwire";

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
   * `rendererGate.degrade()` so this extension instance's DISPLAYED system notes
   * (`display` unset/true) permanently route through the `ctx.ui.notify` arm of
   * the System-notes fallback chain; a `display: false` structured note still
   * delivers via `pi.sendMessage` (bug 0454 — the transcript write is not
   * renderer-dependent). Optional: the `H4a` / `V9k` paths that do not exercise the
   * renderer-degrade surface omit it. Declared by `V9p-T`, consumed by `V9p`.
   */
  readonly rendererGate?: RendererGate;

  /**
   * The extension-instance `theta-system-note` channel the two factory-scope
   * lifecycle notes (drain-state dispatch-refusal; repeat-`session_start`
   * supersession) ride, so a host `pi.sendMessage` throw on either walks the
   * channel's best-effort fallback chain (runtime-event-channel.md:140) instead
   * of aborting the slash handler or vanishing. The production default export
   * supplies the bootstrap sink's latched channel (the same non-re-entering
   * off-channel sink every instance-level note uses); absent on the H4a /
   * integration harness paths, where the factory builds a local channel over
   * `pi` + the latched `ctx` + `emitDiagnostic` for these two sites.
   */
  readonly systemNoteChannel?: () => SystemNoteChannelDeps | undefined;

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
    // RFC 0010: the fourth/fifth parameters are the factory-owned optional-UI
    // surfaces the compose pass needs — the PIC-71 entry channel (constructed
    // in the factory body beside the message renderer) and the latch the
    // composed instance hands its execution-status bus back through, so
    // `/theta-status` (registered in the factory body) reaches the LIVE bus and
    // `session_shutdown` can dispose it (EXST-2).
    entryChannel?: EntryChannelHandle,
    latchStatusBus?: (bus: ExecutionStatusBus) => void,
    // RFC 0010 (EXST-13): the factory-owned in-process tool handlers (currently
    // `theta_progress`'s shared-state code-side executor), so a code-side call
    // dispatches in-process instead of through the host-loop bridge.
    inProcessTools?: Readonly<Record<string, InProcessToolExecute>>,
    // RFC-0012 §3: the child's LIVE result channel from an earlier compose of
    // this same process (a repeat `session_start`), so the pass reuses the one
    // connection the parent accepts instead of dialling a second one.
    resultChannel?: ResultChannelClient,
    // RFC-0012 §5: the factory-owned registered-backend set + discover trigger
    // (the offer subscription lives in the factory body beside it).
    placementRegistration?: PlacementRegistrationHandle,
    // RFC 0015 (D5): the factory-owned run-card controller's composition view
    // — the EXST-6 tick-riding sink the TUI composition pushes into the bus's
    // sink list, and the TUI-handle latch the composition fills from its
    // `ctx.ui.setWidget` factory-overload capture. The renderer half stays in
    // the factory (registered with the entry channel at factory time).
    runCardView?: Pick<RunCardController, "sink" | "attachTui">,
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

  /**
   * The NFR-2.1 fail-fast terminator seam (session-swap-tripwire.ts): the
   * `Environment.FailFast`-equivalent "let crash" path the session-swap
   * tripwire's trip-site guard invokes immediately after emitting the single
   * `theta/host/session-swap-instance-survived` diagnostic. Injected here so
   * the guard can terminate the process without the trip site inlining a
   * `process.exit` literal; the shipped production default export supplies the
   * real terminator, and the H4a / integration harness paths inject a fake so
   * termination is observable without ending the test process. Optional: the
   * paths that never reach the trip guard omit it.
   */
  readonly terminator?: FailFastTerminator;
}
