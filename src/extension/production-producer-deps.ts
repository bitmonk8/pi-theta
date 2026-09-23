// The production producer's construction-input surface and inert scaffolding:
// `ProductionProducerInput` (the collaborators the shipped composition root
// wires into `createProductionProducerDeps`), the resolver / dispatch /
// callee-parse contracts it names (`SubagentPlacementResolver`,
// `PiToolDispatch`, `CalleeParseOutcome`), and the small no-op / guard
// helpers the producer clusters share (`noopSwallowChannels`, `signalGuard`,
// `noopSink`, `NoopConversationMutator`, the typed `SubagentSpawnFailedError`
// / `UnknownHostToolError` throwables, and the bug-0293 ENOENT narrows) —
// extracted verbatim from production-theta-producer.ts, which re-exports the
// public types so existing importers resolve unchanged.
//
// Spec (narrative): pi-integration-contract/extension-bootstrap-and-per-theta.md,
// subagent.md #subagent-launch-contract, invocation.md §Resolution / INV-1,
// cancellation.md CANCEL-3.

import type { ExtensionAPI, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { RuntimeRoot } from "../runtime-root";
import type { ActiveInvocationRegistry } from "../runtime/active-invocation-registry";
import type {
  DispatchLadderProbe,
  EncodedToolRequest,
  HostToolResult,
} from "../runtime/host-loop-dispatch";
import type { SubagentChildControlPlane } from "../runtime/subagent-launch-file";
import type {
  OpenedSubagentWire,
  PreparedSubagentLaunch,
} from "../runtime/subagent-launcher";
import type { PlacementEventBus } from "../runtime/subagent-placement-registry";
import type { PlacementLease } from "../runtime/subagent-placement-selection";
import type { RootRegime } from "../runtime/subagent-root-regime";
import type {
  SessionControlCtx,
  SessionControlPi,
} from "../runtime/session-control-tools";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../runtime/terminal-outcomes";
import type {
  AgentToolResultEnvelope,
  InProcessToolExecute,
  ToolLoweringSink,
} from "../runtime/tool-call-execute";
import type { FileSystem } from "../seams/file-system";
import type { HostToolSnapshotEntry } from "../seams/host-tool-snapshot";
import type { Trace } from "../seams/trace";
import type { ExecutionStatusBus } from "./execution-status/types";
import type { RunCardPublisher } from "./execution-status/run-card";
import type { ForwardingSignalSource } from "./session-shutdown";
import type { SystemNoteChannelDeps } from "./system-note-channel";
import type { EmissionSink } from "./teardown-emission";
import type { ThetaCompositionInput } from "./theta-composition-producer";

/**
 * H8b: one resolved host Pi tool the code-side tool-call path dispatches
 * `execute` against. `execute` invokes the host tool's `execute(...)` and maps
 * its `AgentToolResult` to the theta-load-bearing `AgentToolResultEnvelope`
 * (`content` only), or throws when the tool signals failure — the V14g lowering
 * (`runCodeSideToolCall`) turns a clean resolve into `Ok(text)` and a throw into
 * `Err(CodeToolError{cause:"execution"})`.
 */
/**
 * RFC-0012 §6: per-launch placement resolution. The composition root supplies
 * it over the registered-backend set, the operator's selection and the two
 * per-launch policies (visible cap, credential guard); the producer calls it
 * once per child launch with the facts those policies need.
 */
export interface SubagentPlacementResolver {
  (context: {
    /** The resolved model's provider (the credential guard's lookup key). */
    readonly provider: string;
    /** The callee rendering for the guard's system note (`/<slug>` or `/<slug>#<fn>`). */
    readonly callee: string;
  }): PlacementLease;
}

export interface PiToolDispatch {
  readonly toolName: string;
  /**
   * The tool's registered input-schema `parameters` (bug 0072 §Fix, runtime
   * half; frontmatter-fields-a.md §`tools`: "Each resolved entry carries the
   * tool's `parameters` schema"): the
   * snapshot-pinned schema `resolveThetaToolsAtLoad` threads onto the frozen
   * `tools:` callable-set entry at load, for BOTH a host built-in
   * (`resolvePiTool`, production-composition.ts) and an extension tool
   * (`resolveRegistryExtensionTool`, same file). Absent for a tool that
   * registers no input schema. `#resolveToolCall`'s pre-dispatch AJV check
   * reads this and fails open when it is absent or not a plausible
   * JSON-Schema object.
   */
  readonly parameters?: unknown;
  /**
   * Optional because an extension-supplied entry is execute-less by
   * construction: the §Resolution-snapshot entry pins only the tool's name and
   * `parameters`, and PIC-64 reaches its `execute` through the host loop rather
   * than by handle. The dispatch site narrows on `typeof … === "function"`
   * before calling, and routes the execute-less shape to the PIC-64 ladder.
   */
  execute?(
    toolCallId: string,
    params: unknown,
    signal: AbortSignal,
  ): Promise<AgentToolResultEnvelope>;
}

/**
 * Bug 0293: the three-arm verdict `parseCalleeTheta` (production-composition.ts)
 * hands `#driveCallee` for an `invoke(...)` callee, so the drive can mint
 * `cause: "load_failure"` vs `cause: "parse_failure"` instead of collapsing both
 * into one `undefined` (queryerror-variants.md:182-183). `unreadable` covers
 * BOTH the bytes-unreadable case and a callee that parsed clean but fails its
 * own load-time structural/tools checks (bug 0267 §Fix constraint 3) — that
 * callee's bytes parsed, but it is still a LOAD failure, not a parse failure.
 * `unparseable` is bytes-present-but-failed-to-parse. `ok` carries the composed
 * input.
 */
export type CalleeParseOutcome =
  | { readonly kind: "ok"; readonly input: ThetaCompositionInput }
  | { readonly kind: "unreadable" }
  | { readonly kind: "unparseable" };

/** Construction inputs for the production per-theta producer collaborators. */
export interface ProductionProducerInput {
  /** The live host extension API (turn drive, message send, command surface). */
  readonly pi: ExtensionAPI;
  /** The runtime root over the real host seams (schema validator, clock, …). */
  readonly root: RuntimeRoot;
  /** The host model registry (binder-model resolution, structured-output turns). */
  readonly modelRegistry: ModelRegistry;
  /**
   * H8b: resolve a Pi-tool name from the theta's callable set (frontmatter
   * `tools:`) to its `execute` dispatch, or `undefined` when the name is not a
   * known host tool. Constructed at the composition root over the live host
   * `cwd` / `ctx`. Absent on non-production harnesses, in which case a code-side
   * `<name>(args)` call surfaces `Err(CodeToolError{cause:"execution"})` for the
   * unknown host tool rather than fabricating a value.
   */
  readonly resolvePiTool?: (name: string) => PiToolDispatch | undefined;
  /**
   * RFC 0010 (EXST-13): pi-theta's OWN in-process tools, keyed by underlying
   * tool name, whose `execute` runs in THIS extension process. A code-side
   * `<name>(args)` call to one dispatches its handler DIRECTLY — bypassing the
   * PIC-64 host-loop bridge — because the tool is not a third-party host tool
   * whose `execute` the `getAllTools()` snapshot strips, but pi-theta's own
   * handler held live at registration (`registerThetaProgressTool`). Wired per
   * process at the composition root, so the parent and each subagent child each
   * carry their OWN executor (the child's `isChildRegime` handler emits the
   * EXST-15 wire line). Currently just `theta_progress`. Absent on harnesses
   * that register no in-process tool, and empty on a host without `registerTool`.
   */
  readonly inProcessToolExecutors?: Readonly<Record<string, InProcessToolExecute>>;
  /**
   * RFC-0005 subagent launch seams (subagent.md #subagent-launch-contract). The
   * child-`pi`-process spawn function, the executable-resolution host snapshot,
   * the parent environment inherited by the child (full inheritance is the
   * credential mechanism), and the parent PID carried on the env marker. All are
   * wired at the production composition root; absent on non-production harnesses
   * (where a subagent bind fails with an internal error rather than launching).
   */
  readonly subagentSpawn?: import("../runtime/subagent-launcher").SpawnFn;
  /**
   * RFC-0012 §1/§6: the placement resolver — returns the backend that places
   * THIS launch (the operator's selection, the visible cap and the credential
   * guard applied per launch by the composition root). Wins over
   * `subagentSpawn` when both are supplied; absent, `subagentSpawn` is the
   * `pipe` backend over that spawn function (the pre-RFC launch, verbatim).
   */
  readonly subagentPlacement?: SubagentPlacementResolver;
  /**
   * RFC-0012 §2/§3: opens the launch file + result channel for a non-`pipe`
   * placement (`placeSubagentChild`'s `openWire`). Absent ⇒ a non-`pipe`
   * placement is a spawn failure naming the missing wiring.
   */
  readonly subagentOpenWire?: (
    prepared: Extract<PreparedSubagentLaunch, { ok: true }>,
  ) => Promise<OpenedSubagentWire>;
  readonly subagentExecutableHost?: import("../runtime/subagent-launcher").ExecutableHost;
  readonly subagentParentEnv?: Readonly<Record<string, string | undefined>>;
  readonly subagentParentPid?: number;
  /**
   * RFC-0012 §2/§10: THIS process's child control-plane view — the launch
   * entry it runs as its root invocation (`theta` or a named `subagent fn`)
   * and, for a child a non-`pipe` placement spawned, the launch-file facts
   * with no env equivalent (result-channel coordinates, presentation, nonce).
   * `subagentParentEnv` above is this view's `env`. Absent on a harness ⇒
   * the theta entry, no channel, headless.
   */
  readonly subagentControlPlane?: SubagentChildControlPlane;
  /**
   * INV-4 (invocation.md §INV-4): the inbound per-chain invoke depth this
   * process was launched at. Non-zero only when THIS process is a subagent
   * child `pi` process: the parent marshalled its current chain depth on the
   * child env (`SUBAGENT_INVOKE_DEPTH_ENV`) and the composition root parsed it
   * (fresh chain at depth 0 on a malformed carriage). The child's top-level
   * invoke chain seeds from it so the depth-32 ceiling continues across the
   * process hop. Absent (→ 0) on the parent / harness paths.
   */
  readonly subagentInboundInvokeDepth?: number;
  /**
   * #subagent-isolation-and-trust: the RAW `pi.getAllTools()` snapshot the
   * project-local trust inference reads. Host-shape-agnostic — `inferChildTrust`
   * normalises it (`seams/host-tool-snapshot.ts`). Absent on non-production
   * harnesses (withholds child approval).
   */
  readonly getAllTools?: () => readonly HostToolSnapshotEntry[];
  /**
   * RFC-0006 (PIC-60): the params-channel filesystem seam — `writeTempFile`
   * (parent-side 0600 temp-file write for the at/above-threshold channel) and
   * `unlink` (the parent-`finally` backstop delete). Wired at the composition
   * root over Windows-safe `node:fs`; absent on non-production harnesses (small
   * env-channel params never touch it, so it is only needed for ≥8 KB payloads).
   */
  readonly subagentParamsFs?: {
    readonly writeTempFile: (contents: string) => string;
    readonly unlink: (path: string) => void;
    readonly readFile: (path: string) => string;
  };
  /**
   * RFC-0006 (PIC-58): the subagent-root regime detected from the process env at
   * the composition root (`detectSubagentRootRegime`). Active only inside a
   * spawned subagent child; drives `isSubagentRootFor` / `driveSubagentRootRegime`.
   * Absent (→ inactive) on the parent / harness paths.
   */
  readonly subagentRootRegime?: RootRegime;
  /**
   * RFC-0006 (PIC-59): the child-side stdout envelope writer — emits the single
   * `theta_result` JSONL line on the child's stdout. Wired at the composition
   * root over `process.stdout.write`; a fake in tests asserts the emitted line.
   * Absent on the parent / harness paths (the child-root drive is never entered
   * there).
   */
  readonly emitResultEnvelope?: (line: string) => void;
  /**
   * RFC 0012 §7 (0.478.0): the process-local `pi.events` bus the child-side
   * regime mirrors its terminal envelope arm onto
   * (`SUBAGENT_CHILD_OUTCOME_CHANNEL`). Emit-only — the producer never
   * subscribes. Wired at the production composition root from a `typeof`
   * presence probe of `pi.events.emit`; absent (a host without `pi.events`,
   * or a harness) ⇒ the emission is a structural no-op. Consumed only inside
   * `driveSubagentRootRegime`; the parent-side spawn path never reads it.
   */
  readonly subagentOutcomeEvents?: Pick<PlacementEventBus, "emit">;
  /**
   * PIC-64: the code-side extension-tool dispatch ladder probe — which rungs
   * are EXECUTABLE in THIS process, mode-independently. The probe contract is
   * executability, not bare surface presence: the same probe gates load-time
   * registration (rung 3) and runtime rung routing, so a recorded rung must
   * have a dispatcher behind it or registration would outrun dispatchability.
   * `getToolDefinitionAvailable` is the upstream surface probe AND a wired
   * rung-1 dispatcher (reads false at the pin — no rung-1 dispatcher exists);
   * `hostLoopAvailable` is `true` wherever a host agent loop backs host-loop
   * dispatch (`hostLoopDispatch` wired) — the parent's live user session and
   * the subagent-root child alike. Absent → no rung → a theta whose CODE calls
   * an extension tool refuses fail-closed with
   * `theta/load/extension-tool-unreachable`.
   */
  readonly dispatchLadderProbe?: DispatchLadderProbe;
  /**
   * PIC-64 rung 2: the host-loop dispatch seam — register a theta-controlled
   * provider authoring the `tool_use`, run the backing host session's agent-loop
   * turn, read the result back, restore the model. Wired at the composition
   * root over the live host agent loop (a live-only mechanism) in BOTH modes;
   * only the backing session differs (the user's live session in prompt mode,
   * the child's private discarded session in subagent mode). Absent here → the
   * ladder is fail-closed pending the upstream `getToolDefinition` exposure.
   * The `signal` is the code-side tool call's abort signal (the theta abort),
   * threaded so a thetaAbort mid-fabricated-turn resolves the settle barrier
   * and the model is restored (never left on the bridge) — the leaf
   * `dispatchViaHostLoop` seam itself is signal-agnostic; this producer dep
   * carries the signal into the production collaborators.
   */
  readonly hostLoopDispatch?: (
    request: EncodedToolRequest,
    signal: AbortSignal,
  ) => Promise<HostToolResult>;
  /** Runtime-defect diagnostic sink (advisory teardown / spawn-failure / wire failures). */
  readonly emitDiagnostic?: (diagnostic: Diagnostic) => void;
  /**
   * H8b: parse a `.theta`-callable / `invoke(...)` callee referenced from
   * `callerPath` into a runnable composition input (resolving the callee path
   * against the caller's directory). Bug 0293: returns the three-arm
   * `CalleeParseOutcome` verdict (`ok` / `unreadable` / `unparseable`) so
   * `#driveCallee` can mint `load_failure` vs `parse_failure`; `undefined` (a
   * non-production stub, e.g. `production-core-exec.test.ts`) is the
   * `load_failure` default, preserving the pre-0293 behaviour of that harness.
   * Constructed at the composition root over the real `FileSystem` seam and the
   * shared parser deps.
   */
  readonly parseCallee?: (
    callerPath: string | undefined,
    calleePath: string,
  ) => Promise<CalleeParseOutcome | undefined>;
  /**
   * INV-1 (invocation.md §Resolution): the `FileSystem.realpath` seam and the
   * union of currently-active discovery roots, used by the runtime
   * open-time containment re-check. Absent on non-production harnesses, in which
   * case the runtime re-check is skipped (the load-time check remains the
   * primary guard). Bug 0293: `lstat` is used to distinguish a truly-absent
   * callee (both `realpath` and `lstat` reject ENOENT) from a broken symlink
   * inside a root (`realpath` rejects ENOENT, `lstat` succeeds) — only the
   * former is not-an-escape (invocation.md §Resolution / INV-1).
   */
  readonly fileSystem?: Pick<FileSystem, "realpath" | "lstat">;
  readonly activeRoots?: readonly string[];
  /**
   * Decision 6 / Increment B1 (active-invocation-registry.md §"Active
   * invocation registry"): the extension-instance-scoped registry of in-flight
   * theta invocations, shared with the factory's `session_shutdown` teardown so
   * its sub-step 2 (cancel in-flight) + sub-step 3 (await dispose) operate on
   * REAL entries. Each `bindPromptConversation` / `spawnSubagentConversation`
   * choke point registers one `ActiveInvocationEntry` here (covering all four
   * invocation types: top-level prompt/subagent + nested prompt/subagent
   * callees via `#driveCallee`); a `subagent fn` call registers through the
   * same subagent choke point (RFC 0012 §10: its body is a child launch of the
   * calling theta). Absent on non-production harnesses, in which case the
   * choke points register nothing (the `?.` no-ops) — the pre-B1 behaviour.
   */
  readonly activeInvocations?: ActiveInvocationRegistry;
  /**
   * RFC 0010 (execution-status.md EXST-3): the extension-instance
   * execution-status bus every producer hook publishes into — invocation
   * lifecycle at the ticket sites, `(invocationId, kind, site)` through the
   * `Checkpoint` decorator, `par for` lane transitions through
   * `ExecuteBodyDeps.statusLanes`, and depth-1 child activity through the
   * stdout tap. Absent on non-production harnesses, in which case every hook
   * is a `?.` no-op and the observed surfaces behave byte-identically
   * (EXST-3's no-observable-effect rule; the `activeInvocations?` precedent).
   */
  readonly statusBus?: ExecutionStatusBus;
  /**
   * RFC 0015 (D3): the run-card publisher `composeThetaFixture.run` calls at
   * top-level drive start/end (one `theta-run` entry, one gated
   * `theta-run-summary`). Constructed only in the TUI composition; absent
   * everywhere else, and the dispatch's `?.` call sites no-op.
   */
  readonly runCard?: RunCardPublisher;
  /**
   * RFC 0015 (D5): the per-invocation trace-seam factory — the composition's
   * `(invocationId) => (site, kind) => statusBus.trace(invocationId, …)`
   * closure. Constructed ONLY in the TUI composition (the D1 contract keeps
   * print/json/child compositions unwired and byte-identical); absent, no
   * `ExecuteBodyDeps.trace` is threaded and the executor pays one
   * undefined-check per statement. A TOP-LEVEL prompt bind mints the closure
   * over its own invocation id; a nested prompt-invoke callee bind reuses the
   * PARENT's closure (`ConversationBindInput.trace`) so callee statements
   * heat the top-level card's ring under the callee's residence-rule file
   * (decision 6's follow-the-viewport source — one card per top-level drive).
   */
  readonly statusTrace?: (invocationId: string) => Trace;
  /**
   * Decision 6 / Increment B2 (session-shutdown-semantics.md sub-step 5): the
   * extension-instance-scoped mutable sink of INVOCATION-SCOPED forwarding
   * listeners, shared with the factory's `session_shutdown` teardown so
   * sub-step 5 detaches the listeners still attached for an invocation in-flight
   * at shutdown time. Each `bindPromptConversation` / `spawnSubagentConversation`
   * choke point pushes one `ForwardingSignalSource` per invocation-scoped
   * forward (the bind-time `ctx.signal` forward; the derived-child parent-invoke
   * listener) and splices+detaches them in `finishInvocation`, so only a
   * still-in-flight-at-shutdown invocation leaves entries for sub-step 5. Absent
   * on non-production harnesses, in which case the choke points push nothing
   * (the `?.` no-ops). PER-TURN forwards (the query-loop `ctx.signal` re-forward)
   * are deliberately NOT collected — their `{once:true}` listeners sit on
   * per-turn-transient `ctx.signal` objects that self-clean, so collecting them
   * would only add per-turn push/splice churn for no lifetime benefit.
   */
  readonly forwardingSignals?: ForwardingSignalSource[];
  /**
   * Bug 0073 test seam: the structured-console `EmissionSink` the per-invocation
   * clean-cancel note's diagnostic-emission-isolation site class (b) row writes
   * through. Absent ⇒ the exported production console sink
   * (`createProductionEmissionSink`, `teardown-emission.ts`).
   */
  readonly cleanCancelSink?: EmissionSink;
  /**
   * Bug 0073: the extension-instance `theta-system-note` channel — the same
   * `buildSystemNoteDeps` instance every other system note on this instance
   * rides, carrying the live `RendererGate` and `SystemNoteChannelHealth`. The
   * per-invocation clean-cancel note must degrade and latch exactly like every
   * other note on that channel: on an instance whose
   * `pi.registerMessageRenderer` failed the gate degrades only DISPLAYED notes
   * (`display` unset/true) to the `ctx.ui.notify` arm — a `display: false`
   * note still delivers via `pi.sendMessage` (bug 0454) — and a stale-ctx throw
   * latches the channel dead for every subsequent note rather than only for
   * this one.
   */
  readonly systemNoteChannel?: SystemNoteChannelDeps;
  /**
   * RFC 0011 §0 C1: composition-scope session-control handles, `Pick`-narrowed.
   * Threaded from the composition root’s `ctx` / `pi` captures. When present,
   * `#resolveRuntimeToolCall` wires the runtime-tool dispatch adapters; absent
   * → the executor arm is skipped and the call falls through to the
   * `unknown_tool` carrier (fail-closed). In production, the load probe
   * (§3.3) already verified the members exist.
   */
  readonly sessionControlHosts?: {
    readonly ctx: SessionControlCtx;
    readonly piHandle: SessionControlPi;
  };
}

/**
 * PIC-65 spawn-failure. Raised (a specific type, never a broad throw) when the
 * subagent child `pi` process cannot be launched (executable unresolved / spawn
 * throw / missing spawn seam). It unwinds the bind so the invocation fails and
 * routes as an unanticipated SDK reject (`theta/runtime/internal-error`).
 */
export class SubagentSpawnFailedError extends Error {}

/**
 * Bug 0293: whether a thrown value is a Node-style ENOENT rejection
 * (`fs.realpath` / `fs.lstat`'s absence signal), narrowed by `.code` rather than
 * caught broadly — `#recheckCalleeContainment` re-throws every other error
 * (CLAUDE.md: catch a specific condition, never `catch(...)`).
 */
export function isEnoent(thrown: unknown): boolean {
  return (
    thrown instanceof Error && (thrown as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/**
 * Bug 0293 (invocation.md §Resolution / INV-1): whether the callee path ITSELF
 * is absent, distinguishing a truly-missing callee (this returns `true`) from a
 * broken symlink inside a root (`lstat` succeeds — the entry exists, only its
 * target is gone — so this returns `false` and INV-1's disposition for it is
 * unweakened). `lstat` does not follow the final symlink component, unlike the
 * `realpath` that already threw ENOENT, so it answers the "does an entry exist
 * at this path" question `realpath` alone cannot.
 */
export async function calleePathIsAbsent(
  fileSystem: Pick<FileSystem, "lstat">,
  resolvedPath: string,
): Promise<boolean> {
  try {
    await fileSystem.lstat(resolvedPath);
    return false;
  } catch (thrown: unknown) { // allow-broad-catch: ENOENT-only, re-raised below
    if (isEnoent(thrown)) {
      return true;
    }
    throw thrown;
  }
}

/**
 * CANCEL-3 (cancellation.md §"Race semantics — swallowing-handler attachment on
 * every abandonable Promise"): the two emit channels a late abandonable-Promise
 * settlement could reach. The `unhandledRejection` channel is closed
 * structurally by attaching the swallowing handler at construction, so it takes
 * no member; these two are noops because the runtime's primary `await` owns the
 * timely settlement and a discarded late settlement emits nothing on any
 * channel (no second `RuntimeEvent`, no diagnostic of any severity).
 */
export function noopSwallowChannels(): {
  readonly emitRuntimeEvent: () => void;
  readonly emitDiagnostic: () => void;
} {
  return {
    emitRuntimeEvent: (): void => {},
    emitDiagnostic: (): void => {},
  };
}

/**
 * CANCEL-3: a live cancellation-guard view backed by the theta `signal`, read at
 * settlement time (not snapshotted at construction) — the checkpoint that
 * surfaces `cause: "cancelled"` reads the same `signal.aborted`, so a late
 * settlement observed while it is aborted is the abandoned case the swallowing
 * handler discards.
 */
export function signalGuard(signal: AbortSignal): { readonly cancellationSurfaced: boolean } {
  return {
    get cancellationSurfaced(): boolean {
      return signal.aborted;
    },
  };
}

/**
 * A fresh `ToolLoweringSink` that discards every channel. The one channel a
 * compliant lowering reaches is `sink.diagnostic` on a non-conforming
 * `execute()` return shape, and that diagnostic also rides on the
 * `ToolReturnShapeDefectError` carrier the seam throws — the top-level catch
 * frames it as the single operator note, so an independently-delivering sink
 * here would double-deliver.
 */
export function noopSink(): ToolLoweringSink {
  return {
    diagnostic(): void {},
    systemNote(): void {},
  };
}

/**
 * An inert `CommittedConversationMutator`. A prompt-mode terminal event routes
 * through `handlePartialTerminalOutcome`, which calls nothing on the mutator for
 * the cancel path (ERR-8 … ERR-12: no committed surface is mutated); the shipped
 * user session's committed transcript is Pi-owned and never rewritten by theta.
 */
export class NoopConversationMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

/**
 * H8b. Raised (a specific type, never a broad throw) when a code-side
 * `<name>(args)` call names a host tool the composition root cannot resolve (no
 * `resolvePiTool` collaborator, or the name is not a known host tool). Thrown
 * from the `CodeSideToolCall.dispatch()` so the V14g lowering surfaces it as
 * `Err(CodeToolError{cause:"execution"})` rather than fabricating a value.
 */
export class UnknownHostToolError extends Error {}
