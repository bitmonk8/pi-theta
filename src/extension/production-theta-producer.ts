// H8a — the production `ThetaProducerDeps` for the shipped composition root.
//
// The `V19e` composition producer (`composeThetaFixture`) maps a parsed `.theta`
// to a runnable `ThetaFixture` by composing three injected collaborators:
//
//   - `runBinder` — the `V11a` frontmatter binder over the slash arguments,
//     run before the theta interpreter; a non-binding envelope short-circuits;
//   - `bindPromptConversation` — bind `V19d`'s effectful executor to the shared
//     user session (`V12a`/`V9c`) so `@`-queries drive real user-visible turns;
//   - `spawnSubagentConversation` — spawn an isolated `AgentSession` (`V9i`) and
//     bind the executor to that private session for subagent-mode thetas.
//
// This module assembles those collaborators against the live host `pi` surface
// and the runtime root's seams, so the shipped extension drives real
// prompt-mode / typed / subagent turns.
//
// Spec (narrative): pi-integration-contract/extension-bootstrap-and-per-theta.md
// (§"Per-theta registration"), conversation-drive.md, slash-invocation.md,
// binder/binder-model-and-context.md, subagent.md.

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { parseDocument } from "yaml";
// RFC-0005: `buildSessionContext` remains for the prompt-mode drive; the former
// in-process subagent satellites (`createAgentSession` / `DefaultResourceLoader`
// / `SessionManager` / `getAgentDir` / `defineTool`) are retired — the subagent
// drive spawns a child `pi` process (subagent.md, RFC-0005).
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import { runSubagentChildTeardown } from "../runtime/subagent-isolation";
import type { SubagentChildProcess } from "../runtime/subagent-launcher";
import {
  inferChildTrust,
  launchSubagentChild,
  routeSubagentSpawnFailure,
} from "../runtime/subagent-launcher";
import type { HostToolSnapshotEntry } from "../seams/host-tool-snapshot";
import {
  attachSubagentCancellation,
  driveSubagentChild,
  type SubagentInvocationResult,
} from "../runtime/subagent-json-driver";
import {
  intakeChildParams,
  marshalParams,
  type ChildParamsIntake,
  type ParamsMarshalDeps,
  type ParamsSchemaValidator,
} from "../runtime/subagent-params";
import type { RootRegime } from "../runtime/subagent-root-regime";
import {
  resolveDispatchLadder,
  type DispatchLadderProbe,
  type EncodedToolRequest,
  type HostToolResult,
} from "../runtime/host-loop-dispatch";
import {
  confirmChildModel,
  guardResolvedModel,
  SUBAGENT_MODEL_UNRESOLVED_MESSAGE,
} from "../runtime/subagent-model-guard";
import {
  mapNonRepresentableReturnValue,
  mapTooDeepReturnValue,
  serializeErrEnvelope,
  serializeOkEnvelope,
} from "../runtime/subagent-envelope";
import { SUBAGENT_CALLABLE_HASHES_ENV } from "../runtime/subagent-callable-hash";
import { runPromptSuspendInvoke } from "../runtime/invoke-prompt-suspend";
import type { ThetaMode } from "../parser/frontmatter";
import { projectRenderedParamType } from "../parser/params";
import type {
  Api,
  AssistantMessage,
  Message,
  Model,
  ProviderResponse,
  Tool,
  ToolCall,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
// pi-ai 0.80.x moved the streaming free functions off the package root into
// the publicly-exported `/compat` subpath (package.json `exports["./compat"]`
// -> dist/compat.d.ts); the root barrel no longer re-exports `complete`.
import { complete } from "@earendil-works/pi-ai/compat";
// Bug 0010: the synthesised respond tool's `parameters` wrap the lowered
// response schema exactly as the binder call shape does (`Type.Unsafe`).
import { Type } from "typebox";
import type { Clock, TimerHandle } from "../seams/clock";
import type { RuntimeRoot } from "../runtime-root";
import type {
  ActiveInvocationEntry,
  ActiveInvocationRegistry,
  ActiveInvocationTicket,
} from "../runtime/active-invocation-registry";
import type { ForwardingSignalSource, EmissionSink } from "./session-shutdown";
import {
  emitCancelledBySessionShutdownNote,
  createProductionEmissionSink,
} from "./session-shutdown";
import type { SystemNoteChannelDeps } from "./system-note-channel";
import type {
  BinderRunInput,
  BinderRunResult,
  ConversationBinding,
  ConversationBindInput,
  ThetaCompositionInput,
  ThetaProducerDeps,
} from "./theta-composition-producer";
import type {
  EffectfulStatementHostDeps,
  QueryHostDispatch,
  SubagentFnSession,
} from "../runtime/effectful-statement-host";
import { createEffectfulStatementHost } from "../runtime/effectful-statement-host";
import {
  buildEnvironment,
  enumDeclaringKey,
  type EnumRegistration,
  type LexicalEnvironment,
  type MaterializedImport,
} from "../runtime/lexical-environment";
import {
  BinaryNonNumericError,
  executeBody,
  ThetaFnArityError,
  type BodyExecution,
  type ExecuteBodyDeps,
} from "../runtime/statement-executor";
import {
  extractTrailingTurnText,
  withActiveSetGating,
  type CallableSetInstall,
} from "../runtime/conversation-drive";
import {
  extractPromptModeQueryResult,
  mapPromptModeSyncThrow,
  mapPromptModeTurnLifecycleExpiry,
  PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE,
  type PromptModeTurnLifecyclePhase,
} from "../runtime/prompt-transport-mapping";
import {
  enforceInvokeParamsDepth,
  enforceInvokeReturnDepth,
} from "../runtime/invoke-ceiling-depth";
import { summariseErrorField } from "../runtime/err-field-summary";
import type {
  ForcedRespondTurn,
  FreePhaseTurn,
  QueryModelDriver,
  QueryToolLoopConfig,
} from "../runtime/query-tool-loop";
import type {
  AgentToolResultEnvelope,
  CodeSideToolCall,
  ToolLoweringSink,
} from "../runtime/tool-call-execute";
import { filterJoinToolText, lowerToolExecuteThrow } from "../runtime/tool-call-execute";
import {
  buildCodeToolArgSchemaViolation,
  enforceCodeToolArgDepth,
  enforceModelToolArgDepth,
  PiToolArgShapeDefectError,
  ShadowedCalleeDispatchDefectError,
} from "../runtime/tool-call";
import type { CommittedSideEffect } from "../runtime/no-rollback";
import type { InvokeChild } from "../runtime/invoke-cancellation";
import { runInvokeChild } from "../runtime/invoke-cancellation";
import type {
  CodeToolError,
  ContextOverflowError,
  ForcedRespondBranch,
  InvokeInfraError,
  TransportError,
} from "../runtime/query-error";
import { InvokeInfraCauseError } from "../runtime/query-error";
import {
  newInvokeChainAtDepth,
  pushCountableFrame,
  surfaceDepthOverflow,
  InvokeDepthExceededPanic,
  type InvokeChain,
} from "../runtime/invoke-depth-cycle";
import { recheckInvokePathAtRuntime } from "../runtime/invocation";
import type { FileSystem } from "../seams/file-system";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../runtime/terminal-outcomes";
import {
  createThetaAbort,
  deriveChildThetaAbort,
  forwardSlashCommandCancel,
  abortForAgentEnd,
  makeCancelledError,
} from "../runtime/cancellation-core";
import { runCheckpointedBinderCall } from "../runtime/checkpoint-granularity";
import { runBinderCallWithCancellation } from "../binder/binder-cancellation";
import { guardToolExecutePromise } from "../runtime/tool-call-swallowing-handler";
import { guardQueryProviderPromise } from "../runtime/query-swallowing-handler";
import { guardInvokeExecutionPromise } from "../runtime/invoke-swallowing-handler";
import type { CheckpointSite } from "../seams/checkpoint";
import {
  buildObjectSchemaValue,
  defineRecordField,
  isEnumValue,
  isObjectValue,
  isResultValue,
  makeErr,
  makeOk,
  schemaTagOf,
  valuesEqual,
  type ThetaValue,
  type ResultValue,
} from "../runtime/value";
import { evaluateStringMember } from "../runtime/stdlib-string";
import { evaluateArrayMember } from "../runtime/stdlib-array";
import { evaluateObjectMember } from "../runtime/stdlib-object";
import type {
  Block,
  CallExpr,
  EnumDecl,
  Expr,
  FnDecl,
  InvokeExpr,
  ThetaBody,
  QueryExpr,
  SchemaDecl,
  Stmt,
  SubagentSessionConfig,
} from "../parser/theta-document";
import { parseExpressionSource } from "../parser/theta-document";
import { renderSystemPrompt } from "../parser/system-interpolation";
import { lowerQueryResponseSchema } from "../runtime/query-schema-lowering";
import { bindParamsInbound, decodeInboundValue } from "../runtime/inbound-boundary";
import { projectForValidation } from "../runtime/wire-translation";
import { inferCalleeReturnAnnotation } from "../parser/functions";
import type { CompiledValidator, LoweredSchema, SchemaValidator } from "../seams/schema-validator";
import { parseToolsEntry, thetaDefaultName, type ResolvedCallable } from "../parser/callable-set";
import { canonicalForm, toLoweredJsonValue } from "../parser/schema-lowering";
import type { TypedQuerySchemaValidation } from "../runtime/query-tool-loop";
import {
  buildTypedQueryValidation,
  parseStructuredPayload,
  payloadForRespond,
  respondSchemaSlug,
  type FollowUpDriveFailure,
  type FollowUpRespondOutcome,
} from "../runtime/typed-query-validation";
import { renderInitialRespondTurn } from "../runtime/query-followup-render";
import {
  coerceRespondWireArguments,
  respondPayloadFromWire,
  respondToolWireSchema,
} from "../runtime/respond-tool-wire";
import {
  evaluateIndexAccess,
  evaluateMemberAccess,
  evaluateQuestion,
  HostFatal,
  isThetaPanic,
  nonObjectReceiverRejection,
  QuestionOperandDefectError,
} from "../runtime/runtime-panics";
import { routeThetaCallableSetupThrow } from "../runtime/tool-call-off-surface";
import {
  createRegistrationCache,
  deriveToolLabel,
  registerToolInCache,
} from "../runtime/tool-registration";
import {
  InterpolatedResultPanic,
  INTERPOLATED_RESULT_MESSAGE,
  lexQueryTemplate,
  renderEmptyShortCircuit,
  renderTemplateText,
  stringifyInterpolatedValue,
  type InterpolationType,
} from "../render/query-render";
import {
  applyBinderBypass,
  buildBinderEnvelopeSchema,
  classifyBinderBypass,
  trimSlashArgumentWhitespace,
  type BinderEnvelopeSchema,
  type BypassParamsField,
} from "../binder/binder-envelope";
import {
  binderToolName,
  buildBinderCompleteCall,
  extractBinderEnvelope,
} from "../binder/binder-inference";
import {
  buildBinderSystemPrompt,
  type SystemPromptParamField,
} from "../binder/binder-system-prompt";
import { deriveBinderSeed } from "../binder/binder-seed";
import { forcedToolChoiceForApi } from "../binder/forced-tool-choice";
import { fillDefaultsAndRevalidate, type DefaultedField } from "../binder/defaulting";
import { matchAvailableModel } from "../binder/binder-model";
import {
  renderBinderSystemNote,
  type BinderArgsClassification,
  type BinderAttemptOutcome,
  type BinderFailureSurface,
} from "../binder/retry-taxonomy";
import {
  classifyProviderResponse,
  synthesizeUnsupportedProviderTransportError,
  TYPED_QUERY_SUPPORTED_PROVIDER_APIS,
} from "../binder/provider-error-mapping";
import { walkSessionContext } from "../binder/session-context-walk";
import {
  renderCompactTranscript,
  renderCustomTypeUnsafeNote,
} from "../binder/compact-transcript";
import { coerceUnderlyingString } from "../diagnostics/placeholder";
import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { capSystemNote, classifyModelContent } from "../binder/system-note";
import {
  renderArgumentEcho,
  type EchoParam,
  type EchoType,
} from "../render/argument-echo";
import { renderNoParamsOverflowNote } from "../runtime/slash-dispatch";
import { renderTopLevelErrNote } from "../runtime/err-note-render";
import type { InvokeCalleeError, QueryError } from "../runtime/query-error";
import type { InvocationProvenanceLedger } from "../runtime/invoke-provenance-ledger";
import { createInvocationProvenanceLedger } from "../runtime/invoke-provenance-ledger";
import type { InvokeCallSite } from "../runtime/invoke-provenance";
import { SYSTEM_NOTE_CHANNEL } from "./system-note-channel";
import {
  PromptToolLoopGovernor,
  type PromptToolLoopExhaustion,
} from "./prompt-tool-loop-governor";

/**
 * H8b: one resolved host Pi tool the code-side tool-call path dispatches
 * `execute` against. `execute` invokes the host tool's `execute(...)` and maps
 * its `AgentToolResult` to the theta-load-bearing `AgentToolResultEnvelope`
 * (`content` only), or throws when the tool signals failure — the V14g lowering
 * (`runCodeSideToolCall`) turns a clean resolve into `Ok(text)` and a throw into
 * `Err(CodeToolError{cause:"execution"})`.
 */
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
   * RFC-0005 subagent launch seams (subagent.md #subagent-launch-contract). The
   * child-`pi`-process spawn function, the executable-resolution host snapshot,
   * the parent environment inherited by the child (full inheritance is the
   * credential mechanism), and the parent PID carried on the env marker. All are
   * wired at the production composition root; absent on non-production harnesses
   * (where a subagent bind fails with an internal error rather than launching).
   */
  readonly subagentSpawn?: import("../runtime/subagent-launcher").SpawnFn;
  readonly subagentExecutableHost?: import("../runtime/subagent-launcher").ExecutableHost;
  readonly subagentParentEnv?: Readonly<Record<string, string | undefined>>;
  readonly subagentParentPid?: number;
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
    readonly writeTempFile: (contents: string, mode: number) => string;
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
   * against the caller's directory), or `undefined` when the callee is missing
   * / unparseable. Constructed at the composition root over the real
   * `FileSystem` seam and the shared parser deps.
   */
  readonly parseCallee?: (
    callerPath: string | undefined,
    calleePath: string,
  ) => Promise<ThetaCompositionInput | undefined>;
  /**
   * INV-1 (invocation.md §Resolution): the `FileSystem.realpath` seam and the
   * union of currently-active discovery roots, used by the runtime
   * open-time containment re-check. Absent on non-production harnesses, in which
   * case the runtime re-check is skipped (the load-time check remains the
   * primary guard).
   */
  readonly fileSystem?: Pick<FileSystem, "realpath">;
  readonly activeRoots?: readonly string[];
  /**
   * Decision 6 / Increment B1 (active-invocation-registry.md §"Active
   * invocation registry"): the extension-instance-scoped registry of in-flight
   * theta invocations, shared with the factory's `session_shutdown` teardown so
   * its sub-step 2 (cancel in-flight) + sub-step 3 (await dispose) operate on
   * REAL entries. Each `bindPromptConversation` / `spawnSubagentConversation`
   * choke point registers one `ActiveInvocationEntry` here (covering all four
   * invocation types: top-level prompt/subagent + nested prompt/subagent
   * callees via `#driveCallee`). Absent on non-production harnesses, in which
   * case the choke points register nothing (the `?.` no-ops) — the pre-B1
   * behaviour.
   */
  readonly activeInvocations?: ActiveInvocationRegistry;
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
   * (`createProductionEmissionSink`, `session-shutdown.ts`).
   */
  readonly cleanCancelSink?: EmissionSink;
  /**
   * Bug 0073: the extension-instance `theta-system-note` channel — the same
   * `buildSystemNoteDeps` instance every other system note on this instance
   * rides, carrying the live `RendererGate` and `SystemNoteChannelHealth`. The
   * per-invocation clean-cancel note must degrade and latch exactly like every
   * other note on that channel: on an instance whose
   * `pi.registerMessageRenderer` failed the gate makes `sendSystemNote` skip
   * the `pi.sendMessage` arm for a `display: false` note, and a stale-ctx throw
   * latches the channel dead for every subsequent note rather than only for
   * this one.
   */
  readonly systemNoteChannel?: SystemNoteChannelDeps;
}

/**
 * Assemble the production `ThetaProducerDeps` the shipped composition root
 * injects into `composeThetaFixture` for every discovered `.theta`.
 */
export function createProductionProducerDeps(
  input: ProductionProducerInput,
): ThetaProducerDeps {
  return new ProductionThetaProducer(input);
}

/**
 * PIC-65 spawn-failure. Raised (a specific type, never a broad throw) when the
 * subagent child `pi` process cannot be launched (executable unresolved / spawn
 * throw / missing spawn seam). It unwinds the bind so the invocation fails and
 * routes as an unanticipated SDK reject (`theta/runtime/internal-error`).
 */
class SubagentSpawnFailedError extends Error {}

/**
 * CANCEL-3 (cancellation.md §"Race semantics — swallowing-handler attachment on
 * every abandonable Promise"): the two emit channels a late abandonable-Promise
 * settlement could reach. The `unhandledRejection` channel is closed
 * structurally by attaching the swallowing handler at construction, so it takes
 * no member; these two are noops because the runtime's primary `await` owns the
 * timely settlement and a discarded late settlement emits nothing on any
 * channel (no second `RuntimeEvent`, no diagnostic of any severity).
 */
function noopSwallowChannels(): {
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
function signalGuard(signal: AbortSignal): { readonly cancellationSurfaced: boolean } {
  return {
    get cancellationSurfaced(): boolean {
      return signal.aborted;
    },
  };
}

/** A fresh `ToolLoweringSink` that discards every channel — the test thetas carry no code-tool calls. */
function noopSink(): ToolLoweringSink {
  return {
    runtimeEvent(): void {},
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
class NoopConversationMutator implements CommittedConversationMutator {
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
class UnknownHostToolError extends Error {}

/**
 * The per-dispatch binder forced-tool call ingredients (binder-inference.md
 * §"Binder inference call"), built ONCE per slash invocation and reused across
 * every budgeted attempt: the resolved binder model, the rendered V11d system
 * prompt, the TRUE anyOf envelope schema plus its content-addressed slug and
 * derived `__theta_bind_<slug>` tool name, the FNV-1a seed, and the
 * memoising envelope-validator accessor (compiled at most once per dispatch —
 * the malformed retry re-issues against the SAME schema).
 */
/**
 * The post-default-merge outcome `runBinder` routes on: the merged `args`, the
 * `params`-boundary classification the named hook computed over them, and the
 * wire names `fillDefaultsAndRevalidate` actually filled — the echo's `(default)`
 * tag source (`defaulting.ts:70–75`), so the tag is read from what the fill step
 * did rather than recomputed from what the theta declared.
 */
interface MergedDeclaredDefaults {
  readonly args: Readonly<Record<string, unknown>>;
  readonly classification: BinderArgsClassification;
  readonly defaultedWireNames: readonly string[];
}

interface BinderForcedToolDispatch {
  readonly model: Model<Api>;
  readonly systemPrompt: string;
  readonly envelopeSchema: BinderEnvelopeSchema;
  readonly slug: string;
  readonly toolName: string;
  readonly seed: number;
  readonly envelopeValidator: () => CompiledValidator;
}

/**
 * Map one parsed `params:` field to its V11d system-prompt per-field descriptor
 * (binder-bypass-and-envelope.md §System-prompt structure item 4): the
 * declared surface type PROJECTED to what the field's lowering kept
 * (`projectRenderedParamType`, bug 0251 §Fix — the forced-tool envelope
 * schema is built from the lowering, so the prompt line beside it must
 * describe the same field), the requirement token `required` or
 * `default=<literal>` from the parser-retained default RHS. The `params:`
 * syntax carries no per-field description, so that segment is always absent.
 */
function binderPromptParamField(field: BypassParamsField): SystemPromptParamField {
  return {
    wireName: field.wireName,
    type: projectRenderedParamType(field.type),
    requirement:
      field.hasDefault && field.defaultSource !== undefined
        ? { kind: "default", literal: field.defaultSource }
        : { kind: "required" },
  };
}

/**
 * How a driven callee's return type is typed at its call site, carried from the
 * expression resolver down to the return-validation boundary. The three arms
 * are the three call surfaces the invoke trampoline serves, and they differ in
 * WHOSE declarations the type resolves in — which is why the site cannot be
 * reduced to a bare annotation string:
 *
 *   - `annotated` — `invoke<Schema>(...)`: the caller's annotation and decls.
 *   - `callee-inferred` — a `.theta`-callable call through `tools:`: the
 *     callee's inferred return type and decls (tool-calls.md §"Return type").
 *   - `untyped` — a bare `invoke(...)`: no return type (invocation.md
 *     §"Typed return").
 */
type InvokeReturnTyping =
  | { readonly kind: "annotated"; readonly annotation: string }
  | { readonly kind: "callee-inferred" }
  | { readonly kind: "untyped" };

/**
 * A resolved return-type site: the annotation source to lower and the theta
 * body whose `schema` / `enum` declarations resolve the names in it.
 */
interface InvokeReturnSite {
  readonly annotation: string;
  readonly declarations: ThetaBody;
}

/**
 * The production per-theta producer. Constructed once per `session_start`
 * discovery pass and shared across every discovered theta's `composeThetaFixture`
 * call; it holds only its injected collaborators (no cross-invocation mutable
 * state), constructing a fresh conversation binding per dispatch.
 */
class ProductionThetaProducer implements ThetaProducerDeps {
  readonly #input: ProductionProducerInput;
  /**
   * STAGE B (ceiling #2): bounds pi's native prompt-mode agentic tool loop to
   * the theta's `tool_loop.max_rounds`. Registered once on the host `pi` (lazily,
   * on the first prompt-mode query drive) and guarded by a per-drive active
   * state, so it never affects unrelated user turns.
   */
  readonly #promptToolLoopGovernor = new PromptToolLoopGovernor();
  /**
   * Bug 0010 (PIC-44): the producer-scoped registration cache for the
   * synthesised `__theta_respond_<slug>` tools. A byte-equal lowered schema
   * re-uses the existing registration; a slug collision disambiguates.
   */
  readonly #respondRegistrationCache = createRegistrationCache();
  /**
   * Bug 0010 (QRY-14 early respond): the one-shot capture slot the PERMANENT
   * respond-tool registrations dispatch through. Armed by the live driver
   * around each driven free-phase turn and cleared in its `finally`, so a
   * registration that outlives its query can never capture outside a live
   * typed turn. A SINGLE slot suffices because prompt-mode bodies execute
   * strictly sequentially (PIC-2): at most one driven turn is in flight.
   */
  #activeRespondCapture: ActiveRespondCapture | null = null;
  /**
   * Bug 0088 (slash-invocation.md SLSH-5): this producer instance's invoke-hop
   * provenance ledger, one per `ProductionThetaProducer` (no module-level /
   * static state, CLAUDE.md). `undefined` when `input.fileSystem` is absent (a
   * non-production harness with no `realpath` seam, the same condition
   * `#recheckCalleeContainment` already skips its own runtime re-check on) —
   * `#recordInvokeHop` then records nothing and `emitTopLevelErrNote` reads an
   * empty chain.
   */
  readonly #ledger: InvocationProvenanceLedger | undefined;

  constructor(input: ProductionProducerInput) {
    this.#input = input;
    this.#ledger =
      input.fileSystem !== undefined
        ? createInvocationProvenanceLedger({ fs: input.fileSystem })
        : undefined;
  }

  /**
   * Bug 0088: the `EffectfulStatementHostDeps.recordInvokeHop` implementation
   * wired into every host built for `theta`. Resolves `calleePath` (the literal
   * text from the `invoke(...)` site) against `theta.sourcePath`'s directory
   * exactly as `#recheckCalleeContainment` does, then hands the ledger the
   * pre-`realpath` parent/callee paths to canonicalise. Records nothing when
   * there is no ledger (no `fileSystem` seam) or `theta.sourcePath` is
   * `undefined` (an in-memory theta has no on-disk parent path to record).
   */
  async #recordInvokeHop(
    theta: ConversationBindInput["theta"],
    wrapper: InvokeCalleeError,
    calleePath: string,
    callSite: InvokeCallSite,
  ): Promise<void> {
    const sourcePath = theta.sourcePath;
    if (this.#ledger === undefined || sourcePath === undefined) {
      return;
    }
    const resolvedCalleePath = isAbsolute(calleePath)
      ? calleePath
      : resolvePath(dirname(sourcePath), calleePath);
    await this.#ledger.attach(wrapper, {
      parentPath: sourcePath,
      calleePath: resolvedCalleePath,
      callSite,
    });
  }

  /**
   * The runtime's own `SchemaValidator`, exposed so the composition entry's
   * binder-`args` projection re-tests a union-typed `params:` position through
   * the SAME compiled-validator cache the binder's post-merge verdict used.
   */
  get schemaValidator(): SchemaValidator {
    return this.#input.root.schemaValidator;
  }

  async runBinder(binderInput: BinderRunInput): Promise<BinderRunResult> {
    // The `V11a` frontmatter binder binds typed `params:` from the slash
    // arguments before the interpreter. A theta with no `params:` (or one whose
    // block did not lower cleanly) has nothing to bind, so the bind step is a
    // no-op and the body runs unconditionally.
    const params = binderInput.theta.frontmatter.params;
    if (params === undefined || params.loweredSchema === undefined) {
      // A theta with no declared `params:` has nothing to bind: the body runs
      // with an empty params object (no slots installed). SLSH-1: a no-params
      // theta bypasses the binder, so the overflow note is emitted here before
      // the body runs.
      this.#emitNoParamsOverflowNote(binderInput);
      return { bound: true, args: {} };
    }
    // Load-time bypass classification (§Binder bypass): the no-params and
    // single-string bypasses skip the binder call (and the LLM inference)
    // entirely and the body runs with the trivially-derived args. Only a
    // `binder` decision drives a real binder pass.
    const decision = classifyBinderBypass(params.fields);
    if (decision.kind !== "binder") {
      // SLSH-1: the no-params bypass (`params: {}`) also overflows on extra
      // slash arguments; the single-string bypass consumes the argument as its
      // sole param, so it never overflows.
      if (decision.kind === "no-params-bypass") {
        this.#emitNoParamsOverflowNote(binderInput);
      }
      // The bypass args are derived without any binder / LLM call and threaded
      // into body scope (the single-string bypass sets the sole field to the
      // trimmed slash-argument string; the no-params bypass yields `{}`).
      const bypass = applyBinderBypass({ decision, slashArguments: binderInput.args });
      return { bound: true, args: bypass.args };
    }
    // A genuine binder pass over the declared params. DECISION (production
    // conformance): the binder runs OFF-session and INVISIBLE — no user-visible
    // streamed turn, no transcript card, and the envelope JSON NEVER reaches the
    // user session (BND-3). It runs against the RESOLVED BINDER MODEL
    // (`bind_model:` → `theta.binderModel`, resolved at load time and carried on
    // the theta), NOT the ambient session model (DISCO-1 runtime facet). The
    // reference is resolved to a concrete `Model<Api>` via the model registry
    // by the same exact-match rule the load-time resolution used, so
    // `model === undefined` is a defensive guard only. WHAT MAKES IT
    // UNREACHABLE IS THE DISPATCH, NOT THE LOAD GATE: the load gate exempts one
    // registered non-bypass theta from binder-model resolution — the marked root
    // of a spawned subagent child (binder-model-and-context.md §"Binder model",
    // the subagent-root exemption) — so a registered non-bypass theta CAN reach
    // the runtime carrying no binder model. It cannot reach HERE, because the
    // slash `run` in `theta-composition-producer.ts` gates
    // `driveSubagentRootRegime` on `isSubagentRootFor` ahead of `runBinder` and
    // returns; the exempt set and the short-circuited set are one set, held
    // together by that single predicate.
    const binderModelRef = binderInput.theta.binderModel;
    const model =
      binderModelRef !== undefined
        ? matchAvailableModel(binderModelRef, this.#input.modelRegistry.getAvailable())
        : undefined;
    if (model === undefined) {
      // Defensive (unreachable on this dispatch path, per the reasoning above):
      // surface the malformed failure note rather than crash the dispatch, and
      // do not run the body.
      this.#emitBinderFailureNote(binderInput.theta.slashName, { kind: "malformed" });
      return { bound: false };
    }
    const envelopeSchema = buildBinderEnvelopeSchema({
      paramsSchema: params.loweredSchema,
      defaultedFields: params.defaultedFields,
    });
    // BNDR-10 (binder/binder-model-and-context.md §Binder context): a
    // `bind_context: session` prompt-mode theta grounds the binder in a *Recent
    // session context* block — the newest→oldest truncation walk (≤20 turns ∧
    // ≤8000 tokens) rendered as a compact transcript. A BNDR-9 transcript-unsafe
    // `customType` aborts binding (the theta does not run) with the
    // custom-type-unsafe note. `bind_context: none` (or subagent-mode) → no block.
    const sessionContext = this.#buildBinderSessionContext(binderInput);
    if (sessionContext.kind === "unsafe") {
      this.#emitCustomTypeUnsafeNote(binderInput.theta.slashName, sessionContext.value);
      return { bound: false };
    }
    // The per-dispatch forced-tool call ingredients (binder-inference.md
    // §"Binder inference call"), built once and reused across every budgeted
    // attempt: the slug is content-addressed over the TRUE anyOf envelope
    // document (not its object attachment wrapper) by the same recipe the
    // typed-query respond tool name uses; the seed is the FNV-1a hash of the
    // bare command name; the V11d system prompt carries the whole variable
    // binding context (theta identity, parameters, raw arguments, and the
    // BNDR-10 session-context block), so the single user message stays the
    // fixed literal. The envelope validator compiles AT MOST once per dispatch
    // and is reused across attempts, deferred to the first extraction so the
    // checkpoint-gated pre-call abort path performs no validator work.
    const slug = respondSchemaSlug(envelopeSchema);
    const fm = binderInput.theta.frontmatter;
    const systemPrompt = buildBinderSystemPrompt({
      name: binderInput.theta.slashName,
      ...(fm.description !== undefined ? { description: fm.description } : {}),
      ...(fm.argumentHint !== undefined ? { argumentHint: fm.argumentHint } : {}),
      params: params.fields.map(binderPromptParamField),
      rawArguments: binderInput.args,
      ...(sessionContext.kind === "block"
        ? { sessionContext: { transcriptBody: sessionContext.body } }
        : {}),
    });
    let compiledEnvelope: CompiledValidator | undefined;
    const dispatch: BinderForcedToolDispatch = {
      model,
      systemPrompt,
      envelopeSchema,
      slug,
      toolName: binderToolName(slug),
      seed: deriveBinderSeed(binderInput.theta.slashName),
      envelopeValidator: () => {
        compiledEnvelope ??= this.#input.root.schemaValidator.compile(envelopeSchema);
        return compiledEnvelope;
      },
    };
    // OFF-session completion via pi-ai `complete()` against the resolved binder
    // model (never `driveStreamedUserTurn`, never `ctx.model`): the envelope is
    // extracted from the forced ToolCall's arguments and is NEVER sent to the
    // user session. Auth is resolved off the model registry and threaded into
    // the constructed options — the out-of-band `complete()` free function does
    // not inherit the session's resolved credentials, so an un-authed call
    // would return an empty error-stop reply.
    //
    // CANCEL-4 (cancellation.md §Granularity binder-call clause; §Surfacing
    // cancelled-binder arm): the `binder-call` checkpoint fires immediately
    // before the LLM call (`runCheckpointedBinderCall`) and `thetaAbort.signal`
    // is forwarded INTO the provider invocation as `options.signal`
    // (`runBinderCallWithCancellation` threads it per attempt), so an abort
    // observed BEFORE or DURING the binder call suppresses it. A cancelled
    // binder never surfaces a `Result` to theta code — the theta does not run —
    // and produces the cancelled-binder system note instead.
    const signal = binderInput.thetaAbort?.signal ?? createThetaAbort().signal;
    const binderSite: CheckpointSite = {
      file: binderInput.theta.slashName,
      line: 1,
      column: 1,
    };
    // The binder attempt is CLASSIFIED per determinism-cancellation-failure.md
    // §Failure-class taxonomy so the per-class retry budget (HC3-a transport /
    // HC3-b malformed, driven by `runBinderCallWithCancellation`) actually
    // re-drives a transient failure — a provider throw / `stopReason:"error"` /
    // overflow classifies as `transport` (one retry), a missing/invalid forced
    // ToolCall envelope as `malformed` (one retry); `ok`/`needs_info`/
    // `ambiguous` are terminal. The winning `ok` attempt's extracted args are
    // captured for the defaults-merge.
    let okArgs: Record<string, unknown> = {};
    const phase = await runCheckpointedBinderCall(
      this.#input.root.checkpoint,
      signal,
      binderSite,
      () =>
        runBinderCallWithCancellation({
          thetaName: binderInput.theta.slashName,
          signal,
          attempt: async (_attemptIndex, attemptSignal) => {
            const classified = await this.#classifyBinderAttempt(dispatch, attemptSignal);
            if (classified.okArgs !== undefined) {
              okArgs = classified.okArgs;
            }
            return classified.outcome;
          },
        }),
    );
    if (phase.cancelled) {
      // Pre-call checkpoint abort: the LLM call was never issued.
      this.#emitBinderFailureNote(binderInput.theta.slashName, { kind: "cancelled" });
      return { bound: false };
    }
    if (phase.value.kind === "cancelled") {
      // In-flight abort: the provider observed the forwarded `options.signal`.
      this.#emitBinderFailureNote(binderInput.theta.slashName, { kind: "cancelled" });
      return { bound: false };
    }
    // Route on the terminal (most-recent, HC3-e) classified outcome. The theta
    // body runs only on the `ok` arm; every failure arm (`needs_info` /
    // `ambiguous` / `malformed` / `transport`-budget-exhausted) emits the mapped
    // failure-mode system note and short-circuits (the body never runs). The
    // envelope is runtime-internal and is never surfaced verbatim.
    const outcome = phase.value.outcome;
    if (outcome.kind !== "ok") {
      this.#emitBinderFailureNote(binderInput.theta.slashName, outcome);
      return { bound: false };
    }
    // §Defaulting (defaulting-system-note-echo.md#post-default-merge-ajv-validation;
    // binder-bypass-and-envelope.md#binder-envelope): defaults are filled by the
    // runtime AFTER the binder returns, not by the binder. The binder is told
    // which fields have defaults and MAY omit them from `args`; the runtime then
    // fills any defaulted wire name absent from `args` (fill-if-absent) and
    // AJV-validates the merged result before the body runs. Without this merge a
    // declared default (`count: integer = 3`) never reaches body scope and the
    // body sees the field as absent (BND-2). Only the genuine binder pass reaches
    // here — a defaulted field forces the `binder` classification (the
    // single-string / no-params bypasses carry no defaults), so the bypass arms
    // above are intentionally left unchanged.
    const binderArgs = okArgs;
    const merged = await this.#mergeDeclaredDefaults(binderInput.theta, params, binderArgs);
    // The post-default-merge verdict routes BEFORE the success echo: an
    // AJV-on-`args` classification (a merged document AJV refuses, or a
    // ceiling-#4 depth breach cross-routed per CIO-1) is terminal — no retry
    // (HC3-c), the failure-mode row surfaces, and the theta does not start. The
    // echo asserts a bind that happened, so it may not precede the verdict that
    // decides whether it did.
    if (merged.classification.kind !== "ok") {
      this.#emitBinderFailureNote(binderInput.theta.slashName, merged.classification);
      return { bound: false };
    }
    // §"Echo policy" (BND-1): on a successful bind the runtime appends the
    // one-line success echo note (`Running /<name>: …`) on the theta-system-note
    // channel immediately before the theta starts, UNLESS `bind_echo: false`. The
    // bypass arms auto-suppress the echo independently and never reach here.
    this.#emitBinderEchoNote(binderInput.theta, params, merged.args, merged.defaultedWireNames);
    return { bound: true, args: merged.args };
  }

  /**
   * §"Echo policy" success echo (BND-1): render and emit the one-line
   * `Running /<name>: <formatted-args>` system note on the theta-system-note
   * channel — the SAME `pi.sendMessage` delivery the SLSH-1 overflow / SNOTE-1
   * notes use — unless `bind_echo:` is `false`. Each top-level `params:` field
   * renders in declaration order; a field is tagged `(default)` iff its wire
   * name is in `defaultedWireNames`, the fill step's own report of which
   * fields took their declared default this run
   * (defaulting-system-note-echo.md:9; `defaulting.ts:70–75`,
   * `argument-echo.ts:74`). The echo is rendered off the resolved runtime
   * values (value-driven `EchoType` derivation, disambiguating `integer` vs
   * `number` from the lowered schema) and passed through the shared
   * 120-code-point cap.
   */
  #emitBinderEchoNote(
    theta: ConversationBindInput["theta"],
    params: NonNullable<ConversationBindInput["theta"]["frontmatter"]["params"]>,
    mergedArgs: Readonly<Record<string, unknown>>,
    defaultedWireNames: readonly string[],
  ): void {
    if (theta.frontmatter.bindEcho === false) {
      return;
    }
    const tookDefaultWireNames = new Set(defaultedWireNames);
    const properties =
      params.loweredSchema !== undefined
        ? ((params.loweredSchema as Record<string, unknown>)["properties"] as
            | Record<string, unknown>
            | undefined)
        : undefined;
    const echoParams: EchoParam[] = params.fields.map((field) => {
      // Own-key guarded: `mergedArgs[field.wireName] ?? null` never takes
      // the `?? null` arm for a wire name naming an `Object.prototype` member
      // (`__proto__`, `toString`, ...), and that name is reachable-absent
      // here — default recovery is best-effort (`#mergeDeclaredDefaults`'s
      // doc-comment) while `required` omits a defaulted field, so the bind
      // still classifies `ok`.
      const value = (
        Object.prototype.hasOwnProperty.call(mergedArgs, field.wireName)
          ? mergedArgs[field.wireName] ?? null
          : null
      ) as ThetaValue;
      // The tag is membership in `defaultedWireNames`, not a recomputation from
      // the theta's declared defaults: a field the fill step could not recover
      // a value for (`#recoverDeclaredDefaults`'s best-effort arms) is absent
      // from `defaultedWireNames` even though it is declared defaulted, so it
      // renders untagged rather than claiming a fill that did not happen.
      const tookDefault = tookDefaultWireNames.has(field.wireName);
      return {
        name: field.wireName,
        value,
        type: echoTypeFromValue(value, properties?.[field.wireName]),
        tookDefault,
      };
    });
    const content = capSystemNote(
      renderArgumentEcho({ thetaName: theta.slashName, params: echoParams }),
    );
    this.#input.pi.sendMessage(
      {
        customType: SYSTEM_NOTE_CHANNEL,
        content,
        display: true,
        details: { event: {} },
      },
      { triggerTurn: false },
    );
  }

  /**
   * Classify ONE binder attempt (determinism-cancellation-failure.md
   * §Failure-class taxonomy) into a `BinderAttemptOutcome` the per-class retry
   * budget driver consumes. The dispatch is the FORCED-TOOL structured-output
   * call pinned by binder-inference.md — the tool's `parameters` attachment is
   * object-rooted (the envelope wrapper) because a top-level `anyOf` is not a
   * valid provider `input_schema`. Routing order mirrors the typed-query
   * forced respond dispatch (`dispatchForcedRespondTurn`):
   *
   *   1. a rejected `complete()` → transport ("cancelled" when the abort
   *      landed, else the coerced throw message);
   *   2. EXTRACTION FIRST: the first ToolCall naming the binder tool wins
   *      regardless of stopReason / errorMessage / HTTP status; its envelope
   *      is AJV-validated against the TRUE anyOf envelope schema, then routed
   *      by `kind` (`ok` → args for the defaults-merge; `needs_info` /
   *      `ambiguous` keep the rule-4 empty-after-stripping check); an
   *      AJV-invalid envelope or unusable arguments → `malformed`;
   *   3. no matching ToolCall + a non-normal stopReason, a non-empty
   *      errorMessage, or a captured non-200 HTTP status → the shared
   *      provider-error classifier with the onResponse-captured REAL HTTP
   *      status (ContextOverflow folds into transport per the taxonomy); the
   *      note's `<message>` carries the classifier's own text whenever it is
   *      non-empty, regardless of `kind` — the fixed fallback is reserved for
   *      the no-text case, the same reading the fallback carries everywhere
   *      else it is specified (queryerror-variants.md:106,
   *      conversation-drive.md:16 PIC-51, provider-error-mapping.md:45);
   *   4. otherwise (a clean normal-stop reply — plain text or a wrong-name
   *      ToolCall) → `malformed`.
   */
  async #classifyBinderAttempt(
    dispatch: BinderForcedToolDispatch,
    signal: AbortSignal,
  ): Promise<{ readonly outcome: BinderAttemptOutcome; readonly okArgs?: Record<string, unknown> }> {
    const provider = String(dispatch.model.api);
    // The per-attempt provider-response capture (binder-inference.md
    // `options.onResponse`): the last firing before resolution wins; when it
    // never fires the classifier's HTTP-status input is the network-level
    // `null` class — never a fabricated 200.
    let captured: ProviderResponse | undefined;
    const onResponse = (response: ProviderResponse): void => {
      captured = response;
    };
    let reply: AssistantMessage;
    try {
      reply = await this.#completeBinderReply(dispatch, signal, onResponse);
    } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — a provider transport throw → HC3-a transport class
      // A cancellation abort is surfaced by the caller's before/after-attempt
      // signal checks, not misclassified as a retryable transport failure.
      if (signal.aborted) {
        return { outcome: { kind: "transport", provider, message: "cancelled" } };
      }
      return { outcome: { kind: "transport", provider, message: coerceUnderlyingString(thrown) } };
    }
    // EXTRACTION FIRST (binder-inference.md): a matching ToolCall wins over
    // any stopReason / errorMessage / HTTP-status failure classification.
    const extraction = extractBinderEnvelope(reply, dispatch.toolName);
    if (extraction.kind === "match") {
      // Envelope AJV at the routing step: the unwrapped envelope value is
      // validated against the TRUE three-arm anyOf schema (the maxLength-500
      // message budget, additionalProperties:false, the object-shaped
      // ok.args), so a structurally invalid envelope is the malformed class —
      // never a silent `{}` bind.
      const verdict = dispatch.envelopeValidator().validate(extraction.envelope);
      if (!verdict.ok) {
        return { outcome: { kind: "malformed" } };
      }
      const envelope = extraction.envelope as Record<string, unknown>;
      if (envelope["kind"] === "ok") {
        // Schema-guaranteed: the validated ok arm requires an object `args`.
        return {
          outcome: { kind: "ok" },
          okArgs: envelope["args"] as Record<string, unknown>,
        };
      }
      const kind = envelope["kind"] as "needs_info" | "ambiguous";
      const message = envelope["message"] as string;
      // Rule 4: a message empty after rule-1 stripping is a malformed
      // envelope, not an empty note.
      if (classifyModelContent({ message }) === "empty-malformed") {
        return { outcome: { kind: "malformed" } };
      }
      return { outcome: { kind, message } };
    }
    if (extraction.kind === "match-malformed") {
      // The binder tool WAS called but its arguments are unusable (not an
      // object, or no envelope key): malformed-envelope, never transport.
      return { outcome: { kind: "malformed" } };
    }
    // No matching ToolCall: failure routing. A non-normal stopReason, a
    // non-empty errorMessage, or a captured non-200 HTTP status classifies
    // through the shared provider-error taxonomy; ContextOverflow folds into
    // the transport class before the retry driver (HC3-a). A non-string /
    // absent stopReason is fixture shorthand for a normal terminator (the
    // `classifyOffSessionReply` posture), never a failure.
    const stopReason = (reply as { readonly stopReason?: string }).stopReason;
    const errorMessage = (reply as { readonly errorMessage?: string }).errorMessage;
    const stopReasonNonNormal =
      typeof stopReason === "string" && !OFF_SESSION_NORMAL_STOP_REASONS.has(stopReason);
    if (
      stopReasonNonNormal ||
      (typeof errorMessage === "string" && errorMessage !== "") ||
      (captured !== undefined && captured.status !== 200)
    ) {
      const classified = classifyProviderResponse({
        api: provider,
        httpStatus: captured?.status ?? null,
        stopReason: typeof stopReason === "string" ? stopReason : "",
        ...(typeof errorMessage === "string" ? { errorMessage } : {}),
      });
      // The classifier-produced message renders whenever it exists, whichever
      // kind produced it: both overflow arms carry the provider's own text
      // in the same field the transport arm does
      // (provider-error-mapping.ts:311, :388, :399), and the outcome below is
      // transport-class regardless of `kind` (determinism-cancellation-failure.md:36).
      // The fixed fallback is the no-text case only, matching the fallback's
      // specified meaning elsewhere (queryerror-variants.md:106,
      // conversation-drive.md:16 PIC-51, provider-error-mapping.md:45).
      const message =
        classified.message !== ""
          ? summariseErrorField(classified.message)
          : "provider transport failure";
      return { outcome: { kind: "transport", provider, message } };
    }
    // A clean normal-stop reply with no matching ToolCall — plain text only,
    // or a ToolCall with a different name — is the malformed-envelope
    // condition (binder-inference.md extraction rule).
    return { outcome: { kind: "malformed" } };
  }

  /**
   * Issue ONE OFF-session binder `complete()` against the resolved binder
   * `Model<Api>` and return the raw reply. The call triple is the pinned
   * forced-tool constructor (`buildBinderCompleteCall`: system prompt, fixed
   * user-message literal, the single forced `__theta_bind_<slug>` tool, the
   * per-(api, model-id) temperature placement, the per-api seed placement,
   * signal, onResponse); registry auth (apiKey / headers) is threaded INTO
   * the returned options HERE — the constructor stays auth-free — because
   * the out-of-band `complete()` free function does not inherit the
   * session's resolved credentials. No user-session turn, no transcript
   * card — the reply is runtime-internal (BND-3).
   */
  async #completeBinderReply(
    dispatch: BinderForcedToolDispatch,
    signal: AbortSignal,
    onResponse: (response: ProviderResponse, model: Model<Api>) => void,
  ): Promise<AssistantMessage> {
    const call = buildBinderCompleteCall({
      model: dispatch.model,
      systemPrompt: dispatch.systemPrompt,
      envelopeSchema: dispatch.envelopeSchema,
      slug: dispatch.slug,
      seed: dispatch.seed,
      signal,
      onResponse,
    });
    const auth = await this.#input.modelRegistry.getApiKeyAndHeaders(dispatch.model);
    const options = call.options as Record<string, unknown>;
    if (auth.ok) {
      if (auth.apiKey !== undefined) {
        options["apiKey"] = auth.apiKey;
      }
      if (auth.headers !== undefined) {
        options["headers"] = auth.headers;
      }
    }
    return complete(call.model, call.context, call.options);
  }

  /**
   * Emit the mapped binder failure-mode system note (BND-3) on the
   * theta-system-note channel: `needs_info` / `ambiguous` render their
   * fixed-phrase row with the model's message; a non-parse / empty-message reply
   * is the malformed-envelope row (`could not parse arguments`). The raw
   * envelope JSON is NEVER surfaced.
   */
  /**
   * BNDR-10 (binder/binder-model-and-context.md §Binder context): build the
   * binder's *Recent session context* transcript body for a `bind_context:
   * session` prompt-mode theta. Sources the chronological message list from the
   * live session, runs the newest→oldest truncation walk (≤20 turns ∧ ≤8000
   * tokens via the injected `TokenEstimator`), and renders the included slice as
   * a compact transcript. Returns `none` when the feature is off (subagent-mode,
   * `bind_context: none`, or the walk produced zero turns — BNDR-7i void
   * truncation), `block` with the transcript body when ≥1 turn was included, or
   * `unsafe` when an included `custom` message's `customType` is not
   * transcript-safe (BNDR-9: binding must not proceed).
   */
  #buildBinderSessionContext(
    binderInput: BinderRunInput,
  ): { readonly kind: "none" } | { readonly kind: "block"; readonly body: string } | { readonly kind: "unsafe"; readonly value: string } {
    const fm = binderInput.theta.frontmatter;
    if (fm.bindContext !== "session" || fm.mode !== "prompt") {
      return { kind: "none" };
    }
    const messages = buildSessionContext(
      binderInput.ctx.sessionManager.getEntries(),
      binderInput.ctx.sessionManager.getLeafId(),
    ).messages as unknown as readonly import("@earendil-works/pi-agent-core").AgentMessage[];
    const walk = walkSessionContext({
      messages,
      estimator: this.#input.root.tokenEstimator,
      mode: fm.mode,
      bindContext: "session",
    });
    if (!walk.applies || walk.includedMessages.length === 0) {
      return { kind: "none" };
    }
    const rendered = renderCompactTranscript(walk.includedMessages);
    if (rendered.kind === "custom-type-unsafe") {
      return { kind: "unsafe", value: rendered.value };
    }
    if (rendered.sessionContext === undefined) {
      return { kind: "none" };
    }
    return { kind: "block", body: rendered.sessionContext.transcriptBody };
  }

  /**
   * BNDR-9: emit the `theta/runtime/custom-type-unsafe` user-facing note on the
   * theta-system-note channel when an included session-context `custom` message
   * carries a transcript-unsafe `customType`; binding does not proceed.
   */
  #emitCustomTypeUnsafeNote(thetaName: string, value: string): void {
    this.#input.pi.sendMessage(
      {
        customType: SYSTEM_NOTE_CHANNEL,
        content: renderCustomTypeUnsafeNote(thetaName, value),
        display: true,
        details: { event: {} },
      },
      { triggerTurn: false },
    );
  }

  #emitBinderFailureNote(thetaName: string, surface: BinderFailureSurface): void {
    this.#input.pi.sendMessage(
      {
        customType: SYSTEM_NOTE_CHANNEL,
        content: renderBinderSystemNote(thetaName, surface),
        display: true,
        details: { event: {} },
      },
      { triggerTurn: false },
    );
  }

  /**
   * Fill-if-absent the theta's declared `params:` defaults into the binder-returned
   * `args`, then run the post-default-merge AJV validation, reusing the
   * unit-tested `fillDefaultsAndRevalidate` (`binder/defaulting.ts`). A wire name
   * PRESENT in `args` is preserved unchanged (a user-supplied value wins over the
   * default); a wire name ABSENT takes its declared default. The merged args are
   * returned together with the `params`-boundary classification the caller routes
   * on, so the named hook's verdict reaches a consumer.
   *
   * The hook runs whenever the theta presents a lowered `params:` schema, not
   * only when it declares defaults: enforcement point #4 is about the `params`
   * boundary, so a theta with no defaults still needs the depth walk over the
   * binder's own args, and a theta whose defaults could not be recovered still
   * needs what DID arrive validated.
   *
   * The parser retains each default's literal source on the parsed `ParsedParams`
   * (`fields[].defaultSource`, feeding the binder system prompt's
   * `default=<literal>` line), but not its evaluated value, so the values are
   * recovered here from the theta's own source: the `params:` field scalar is
   * re-read via the `FileSystem` seam, its `= <literal>` default RHS is split
   * off, and the literal is parsed + evaluated through the same pure evaluator
   * the body uses. Recovery is best-effort — a theta with no on-disk `sourcePath`
   * (an in-memory fixture), an unreadable file, a default that does not parse, or
   * a default that parses and then panics while evaluating leaves that field
   * unfilled, never throws. An unfilled field is ABSENT from the merged args, and
   * a defaulted field is never in the lowered schema's `required` set
   * (`parseParams`, `parser/params.ts`, writes `required.push(field.name)` only
   * under `field.defaultSource === undefined`), so the post-default-merge AJV
   * check below ADMITS that absence and the invocation binds without the field.
   * All four best-effort cases therefore reach one end state, and what DID arrive
   * is still validated at the `params` boundary.
   */
  async #mergeDeclaredDefaults(
    theta: ConversationBindInput["theta"],
    params: NonNullable<ConversationBindInput["theta"]["frontmatter"]["params"]>,
    binderArgs: Readonly<Record<string, unknown>>,
  ): Promise<MergedDeclaredDefaults> {
    if (params.loweredSchema === undefined) {
      // No lowered `params:` document to validate against, so the boundary this
      // hook guards does not exist for this theta. (`runBinder` already returns
      // ahead of the binder pass in that case; this is its type narrowing.) No
      // fill step ran, so no wire name took a default.
      return { args: binderArgs, classification: { kind: "ok" }, defaultedWireNames: [] };
    }
    // Recovery is best-effort and may yield nothing (an in-memory theta, an
    // unreadable file, a default that does not re-parse, a default whose
    // evaluation panics). That leaves the field unfilled — it does NOT excuse
    // the boundary: what did arrive is still validated below.
    const defaults =
      params.defaultedFields.length === 0
        ? []
        : await this.#recoverDeclaredDefaults(theta, params.defaultedFields);
    // Post-default-merge AJV validation runs against the MERGED args, behind
    // ceiling #4's depth walk (§Defaulting; CIO-3). The classification is
    // returned to the caller, which owns the body-run vs short-circuit routing.
    const validator = this.#input.root.schemaValidator.compile(params.loweredSchema);
    const result = fillDefaultsAndRevalidate({ binderArgs, defaults, validator });
    return {
      args: result.args,
      classification: result.classification,
      defaultedWireNames: result.defaultedWireNames,
    };
  }

  /**
   * Recover the declared default's evaluated VALUE for each defaulted wire name
   * from the theta's source file. The parsed `ParsedParams` retains each default's
   * literal source (`fields[].defaultSource`, feeding the binder system prompt's
   * `default=<literal>` line) but not its evaluated value, so this re-reads the
   * `.theta`, extracts the frontmatter YAML, reads each `params:` field's
   * scalar, splits its `= <literal>`
   * default RHS, and parses + evaluates the literal with the body's pure evaluator
   * (so an enum / schema-literal default resolves against the body's declarations),
   * then projects the evaluated value to wire form for the post-default-merge AJV
   * boundary it feeds (`fillDefaultsAndRevalidate`, `binder/defaulting.ts`). The
   * declaring-enum tag / schema brand a wire-form default loses here is
   * re-established downstream by the binder-`args` inbound boundary
   * (`bindParamsInbound`, `runtime/inbound-boundary.ts`, reached from
   * `paramBindingsFrom`, `theta-composition-producer.ts:99`, called at `:417`)
   * that `runtime-value-model.md:34` already mandates over binder `args`.
   */
  async #recoverDeclaredDefaults(
    theta: ConversationBindInput["theta"],
    defaultedFields: readonly string[],
  ): Promise<readonly DefaultedField[]> {
    const sourcePath = theta.sourcePath;
    if (sourcePath === undefined) {
      return [];
    }
    const bytes = await this.#input.root.fileSystem.readBytes(sourcePath).then(
      (value) => value,
      () => undefined,
    );
    if (bytes === undefined) {
      return [];
    }
    const yamlText = extractFrontmatterYaml(new TextDecoder().decode(bytes));
    if (yamlText === undefined) {
      return [];
    }
    const doc = parseDocument(yamlText);
    const env = buildBoundEnvironment(
      theta.body,
      undefined,
      theta.imports,
      presentedCallableNames(theta),
      theta.sourcePath,
    );
    const defaults: DefaultedField[] = [];
    for (const wireName of defaultedFields) {
      const raw = doc.getIn(["params", wireName]);
      if (typeof raw !== "string") {
        continue;
      }
      const defaultSource = splitParamDefaultSource(raw);
      if (defaultSource === undefined) {
        continue;
      }
      const parsed = parseExpressionSource(defaultSource);
      if (parsed === null) {
        continue;
      }
      // The evaluated default is a runtime `ThetaValue` from the body's own
      // evaluator: `Enum.Variant` resolves through
      // `LexicalEnvironment.resolveEnumVariant` to `makeEnumValue`'s boxed
      // `String` (`typeof === "object"`), while the merge's consumer is an AJV
      // `type: "string"` check — a `typeof` test — over a record whose other
      // half is `JSON.parse`d binder output. Project here so the merged
      // document is homogeneous wire form, which is what
      // `DefaultedField.defaultValue` (`binder/defaulting.ts`) already
      // contracts for.
      // A default that parses can still fail to EVALUATE — an `Enum.Variant`
      // whose head resolves to no first-class value hands the pure evaluator's
      // member arm a `null` target, which panics. The panic is correct where it
      // is raised and wrong here: this recovery's contract (above) is that a
      // default it cannot make a value of leaves its field unfilled, which keeps
      // the field out of the merged args. A defaulted field is not in the lowered
      // schema's `required` set (`parseParams` guards the `required.push` on
      // `field.defaultSource === undefined`), so the post-default-merge AJV check
      // ADMITS that absence and the invocation binds without the field — the end
      // state the three sibling best-effort cases already reach, with what DID
      // arrive still validated there. Only the closed `ThetaPanic` set is absorbed
      // — any other throw is an interpreter defect and belongs to the
      // runtime-defect surface, so it propagates unchanged.
      let evaluated: ThetaValue;
      try {
        evaluated = evaluatePureExpression(parsed, env);
      } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised below — error-model.md#runtime-panics
        if (!isThetaPanic(thrown)) {
          throw thrown;
        }
        continue;
      }
      defaults.push({
        wireName,
        defaultValue: projectForValidation(evaluated),
      });
    }
    return defaults;
  }

  /**
   * SLSH-1 no-params overflow note (slash-invocation.md#slsh-1): a no-params
   * theta bypasses the binder; the runtime trims slash-argument whitespace and,
   * if the remainder is non-empty, emits exactly ONE
   * `theta /<name>: ignoring extra arguments — this theta takes no parameters`
   * note on the `theta-system-note` channel BEFORE the body runs (a
   * whitespace-only remainder emits no note). `runBinder` is only reached on the
   * slash-invocation path (invoke/tool callers spawn callees directly), so no
   * caller-kind guard is needed. Routed through `pi.sendMessage` — the same
   * channel the shipped system-note delivery uses.
   */
  #emitNoParamsOverflowNote(binderInput: BinderRunInput): void {
    if (trimSlashArgumentWhitespace(binderInput.args).length === 0) {
      return;
    }
    this.#input.pi.sendMessage(
      {
        customType: SYSTEM_NOTE_CHANNEL,
        content: renderNoParamsOverflowNote(binderInput.theta.slashName),
        display: true,
        details: { event: {} },
      },
      { triggerTurn: false },
    );
  }

  /**
   * SLSH-3/SLSH-4/SLSH-5 top-level `Err` note. `composeThetaFixture.run` — the
   * slash-dispatch entry point, reached only for a slash caller with no invoke
   * parent — calls this when the mode's `surface` yields an `Err`. The
   * `renderTopLevelErrNote` renderer emits the SNK per-kind row verbatim
   * (em-dash U+2014). Bug 0088 / SLSH-5: `chain` walks the `invoke_callee`
   * wrapper chain outermost-first through this producer's invoke-hop
   * provenance ledger (`#ledger`), which every `invoke` hop populated as it
   * ran (`#recordInvokeHop`); a non-cascaded error, a wrapper the ledger has
   * no entry for (the model-invoked `.theta`-callable surface, or a wrapper
   * that crossed the RFC-0006 subagent envelope), or an absent ledger (no
   * `fileSystem` seam) all yield an empty chain, so the renderer's leaf row is
   * unaffected either way. Routed through the same `pi.sendMessage`
   * `theta-system-note` delivery as the SLSH-1 overflow note.
   */
  emitTopLevelErrNote(thetaName: string, error: QueryError): void {
    this.#input.pi.sendMessage(
      {
        customType: SYSTEM_NOTE_CHANNEL,
        content: renderTopLevelErrNote({
          thetaName,
          error,
          chain: this.#ledger?.chainFor(error) ?? [],
        }),
        display: true,
        details: { event: {} },
      },
      { triggerTurn: false },
    );
  }

  /**
   * Top-level runtime-defect / panic note (errors-and-results/error-model.md
   * §"Runtime panics"; runtime-event-channel.md §"system-note-details-shapes"
   * group B). `composeThetaFixture.run`'s outer catch calls this when a runtime
   * defect is thrown at slash dispatch — a `ThetaPanic`
   * (`theta /<name> aborted: <message>`) or a catchable interpreter / adapter
   * throw routed to `theta/runtime/internal-error`
   * (`theta /<name> aborted with internal error: <message>`). Mirrors
   * `emitTopLevelErrNote`'s single `pi.sendMessage` delivery on the same
   * `theta-system-note` channel, but carries the group-B
   * `details: { diagnostics: [Diagnostic] }` shape (the SAME shape the
   * load-phase pre-eval diagnostics use). Emits
   * EXACTLY ONE note; the session is NOT torn down. `HostFatal` never reaches
   * here — the outer catch re-raises it (fail-fast, NOCEIL-3) before calling.
   */
  emitPanicNote(framing: string, diagnostic: Diagnostic): void {
    this.#input.pi.sendMessage(
      {
        customType: SYSTEM_NOTE_CHANNEL,
        content: framing,
        display: true,
        details: { diagnostics: [diagnostic] },
      },
      { triggerTurn: false },
    );
  }

  /**
   * SUBAG-2 / tool-calls.md:30 (`.theta`-callable adapter pre-eval setup-throw
   * row). A GENUINE pre-dispatch dispatch-setup throw inside the model-driven
   * `.theta` adapter (raised before the callee body runs) is routed through
   * `routeThetaCallableSetupThrow`. Gap-1: a callee-BODY panic no longer reaches
   * here — `driveCallee` drives through `runInvokeChild`, which converts a
   * callee-subtree throw into an `Err(InvokeInfraError{cause:"panic"|
   * "internal_error"})` VALUE that lowers as a plain `isError` result with no
   * operator note. This routes only the true setup throw:
   * `routeThetaCallableSetupThrow` returns the clean `{ isError: true }`
   * envelope carrying the BARE callable-set name (never `/<name>`), and emits
   * exactly one `theta/runtime/internal-error` diagnostic + one
   * `theta-system-note`. The sink captures the diagnostic and delivers the ONE
   * framed note through `emitPanicNote` — the SAME group-B
   * `details: { diagnostics: [Diagnostic] }` `theta-system-note` shape/channel
   * the top-level internal-error surface uses — so the model observes the tool
   * failure while the operator observes the framed defect.
   */
  #emitThetaCallableSetupThrow(
    thrown: unknown,
    callableName: string,
    theta: ConversationBindInput["theta"],
  ): LoweredThetaCallableResult {
    let captured: Diagnostic | undefined;
    const sink: ToolLoweringSink = {
      runtimeEvent: (): void => {},
      diagnostic: (diag): void => {
        captured = diag;
      },
      systemNote: (framing): void => {
        if (captured !== undefined) {
          this.emitPanicNote(framing, captured);
        }
      },
    };
    const routed = routeThetaCallableSetupThrow(
      thrown,
      callableName,
      { file: theta.sourcePath ?? theta.slashName, range: ZERO_BODY_RANGE },
      sink,
    );
    return { text: routed.content[0]?.text ?? "", isError: routed.isError };
  }

  /**
   * Decision 6 / Increment B2: push the invocation-scoped forwarding sources
   * onto the shared `forwardingSignals` sink and return a teardown closure that
   * detaches each listener and splices it back off. `finishInvocation` runs the
   * closure on a NORMAL settle so only a still-in-flight-at-shutdown invocation
   * leaves entries for `session_shutdown` sub-step 5. No-ops when the sink is
   * absent (non-production harness) or there are no sources. The detach closures
   * are `removeEventListener` calls that never throw, so no broad catch is
   * needed (conventions.md — specific exception types only).
   */
  #trackForwardingSources(
    sources: readonly ForwardingSignalSource[],
  ): () => void {
    const sink = this.#input.forwardingSignals;
    if (sink === undefined || sources.length === 0) {
      return (): void => {};
    }
    sink.push(...sources);
    return (): void => {
      for (const source of sources) {
        source.removeEventListener();
        const index = sink.indexOf(source);
        if (index !== -1) {
          sink.splice(index, 1);
        }
      }
    };
  }

  /**
   * Bug 0073: the per-invocation clean-cancel note. Returns immediately unless
   * `entry.shutdownReason !== undefined` — the predicate is NOT `signal.aborted`
   * (an Esc also aborts and must draw nothing; §Fix constraint 2). Delivery is
   * the injected extension-instance channel (`systemNoteChannel`), so the note
   * observes the same `RendererGate` and `SystemNoteChannelHealth` as every
   * other note on that instance. The fallback channel is built from seams this
   * producer already holds: `pi.sendMessage` (adapted to the narrow
   * `SystemNoteSender`), `emitDiagnostic` (or a no-op), and a `ui` whose
   * `notify` is unreachable by construction — `sendSystemNote` only calls
   * `ui.notify` on a `display !== false` note, and this note is always
   * `display: false`, so the producer needs no real `ctx.ui` seam. A stale-ctx
   * send error rethrows out of `sendSystemNote` (PIC-67 clause (c)), and this
   * method does not catch it.
   */
  #emitCleanCancelNote(entry: ActiveInvocationEntry): void {
    if (entry.shutdownReason === undefined) {
      return;
    }
    // The extension-instance channel is the delivery path whenever the
    // composition root wired one. The pi-built fallback below keeps a
    // non-production harness that constructs a producer with `pi` alone (the
    // bug doc's §Reproduction shape) delivering the note at all — it is also
    // the path the offline witness cells drive.
    const channel: SystemNoteChannelDeps = this.#input.systemNoteChannel ?? {
      pi: {
        sendMessage: (message, options): void => {
          this.#input.pi.sendMessage(message, options);
        },
      },
      emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
      // Unreachable by construction: this note is always `display: false`, and
      // `sendSystemNote` skips the `ui.notify` arm on both its send-success and
      // send-throw paths for such a note.
      ui: {
        notify: (): void => {},
      },
    };
    const sink = this.#input.cleanCancelSink ?? createProductionEmissionSink();
    emitCancelledBySessionShutdownNote(entry, { channel, sink });
  }

  /**
   * Dispatch-site pre-binder entry point (active-invocation-registry.md §"Registry
   * contract" — Insertion "before any awaitable work"). The slash-command
   * dispatch calls this AHEAD OF its awaited binder step and hands the returned
   * ticket to the bind, so the entry's span covers the binder window too, not
   * only the body window the bind used to open on its own. Delegates to
   * `#openInvocationTicket`, which stays the single place the registry-side
   * setup runs so `invocationId` keeps minting through the producer's PIC-20
   * `IdSource` seam.
   */
  beginInvocation(input: {
    readonly theta: ThetaCompositionInput;
    readonly thetaAbort: AbortController;
  }): ActiveInvocationTicket {
    return this.#openInvocationTicket(input.theta.slashName, input.thetaAbort);
  }

  /**
   * The registry-side half of the dispatch-site setup sequence
   * (active-invocation-registry.md §"Registry contract"): the
   * `Promise.withResolvers()` construction, the five-field entry (its
   * `invocationId` minted through the PIC-20 `IdSource` seam), and the
   * `Set.add`. Shared by `beginInvocation` (the pre-binder slash entry point)
   * and the bind methods below, whose own insertion becomes a no-op reuse of an
   * already-open ticket once one was handed in via `bindInput.invocationTicket`.
   * `finish` is idempotent so a dispatch `finally` and a bind's own
   * `finishInvocation` can both call it without double-removal;
   * `settleDisposeBarrier` is exposed separately because subagent-mode teardown
   * settles the barrier on observed child exit, a different moment from entry
   * removal.
   */
  #openInvocationTicket(theta: string, thetaAbort: AbortController): ActiveInvocationTicket {
    const activeInvocations = this.#input.activeInvocations;
    let settleDispose: () => void = (): void => {};
    const disposeBarrier = new Promise<void>((resolve) => {
      settleDispose = resolve;
    });
    const entry: ActiveInvocationEntry = {
      thetaAbort,
      disposeBarrier,
      shutdownReason: undefined,
      theta,
      invocationId: this.#input.root.idSource.newInvocationId(),
    };
    activeInvocations?.add(entry);
    let finished = false;
    return {
      settleDisposeBarrier: settleDispose,
      finish: (): void => {
        if (finished) return;
        finished = true;
        settleDispose();
        activeInvocations?.remove(entry);
        // Bug 0073: AFTER the barrier settles and the entry is removed, so a
        // PIC-67 rethrow out of the note delivery cannot leave a live entry
        // behind or an unsettled barrier.
        this.#emitCleanCancelNote(entry);
      },
    };
  }

  bindPromptConversation(bindInput: ConversationBindInput): ConversationBinding {
    const { pi, root } = this.#input;
    const { theta, ctx } = bindInput;
    // INV-4 / ceiling #1: a top-level dispatch starts a fresh chain, seeded at
    // the inbound subagent-child depth (0 on the parent / harness paths, the
    // marshalled parent depth inside a subagent child — invocation.md §INV-4
    // wire-level carriage); a nested invoke carries the parent's pushed chain in
    // `bindInput.chain`.
    const chain = bindInput.chain ?? newInvokeChainAtDepth(this.#input.subagentInboundInvokeDepth ?? 0);

    // CANCEL-2 (cancellation.md §Signal source): the executor and every
    // checkpoint gate on the per-invocation `thetaAbort.signal` — NEVER
    // `ctx.signal` directly, and NEVER a pinned never-aborting fallback. The
    // dispatch entry (`composeThetaFixture.run`) owns `thetaAbort` and forwards
    // `ctx.signal` into it; an in-memory harness that binds directly gets a
    // fresh controller here. A second `forwardSlashCommandCancel` is idempotent
    // (the one-shot guard on `thetaAbort.abort()` makes a re-forward a no-op) and
    // re-observes `ctx.signal` in case it became defined after run-entry.
    // CANCEL-5 (cancellation.md §`invoke(...)` entry): a prompt→prompt child
    // invoke attaches to this user session but must still derive its `thetaAbort`
    // downward-only from the parent's signal (child aborts when the parent
    // aborts, never the reverse — `deriveChildThetaAbort`). A top-level prompt
    // dispatch (or in-memory harness) carries no `parentSignal` and gets the
    // dispatch-owned controller (or a fresh one).
    // Decision 6 / Increment B2: collect the INVOCATION-SCOPED forwarding
    // listeners so `session_shutdown` sub-step 5 can detach any still attached
    // for an invocation in-flight at shutdown. Strictly additive — the abort
    // forwarding is byte-identical; only the detach handles are now captured.
    const forwardingSources: ForwardingSignalSource[] = [];
    let thetaAbort: AbortController;
    if (bindInput.parentSignal !== undefined) {
      const derived = deriveChildThetaAbort(bindInput.parentSignal);
      thetaAbort = derived.controller;
      forwardingSources.push({
        label: "parentInvokeSignal.removeEventListener",
        removeEventListener: derived.detach,
      });
    } else {
      thetaAbort = bindInput.thetaAbort ?? createThetaAbort();
    }
    // The bind-time `ctx.signal` forward is the ONE invocation-scoped `ctx.signal`
    // source collected per invocation: the redundant drive-seam forward
    // (`composeThetaFixture.run`) attaches a second `{once:true}` listener to the
    // same per-turn-transient `ctx.signal` and is deliberately NOT double-counted
    // here (it self-cleans like the per-turn listeners).
    forwardingSources.push({
      label: "ctx.signal.removeEventListener",
      removeEventListener: forwardSlashCommandCancel(thetaAbort, ctx.signal),
    });
    const signal = thetaAbort.signal;

    // The user session's resolved chronological message list — the PIC-53
    // trailing-turn read surface. Recomputed per read from the live
    // `ReadonlySessionManager` so each turn's freshly-committed assistant text
    // is visible.
    const readMessages = (): readonly Message[] =>
      buildSessionContext(
        ctx.sessionManager.getEntries(),
        ctx.sessionManager.getLeafId(),
      ).messages as unknown as readonly Message[];

    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint: root.checkpoint,
      signal,
      sink: noopSink(),
      file: theta.slashName,
      evaluatePure: (expr, env) => evaluatePureExpression(expr, env),
      resolveQuery: (expr, env) => {
        // SLSH-2: EVERY non-short-circuit prompt-mode query is a user-visible
        // streamed turn against the user session — assistant tokens for every
        // query (not just the first) stream into the transcript in real time.
        // Prompt→prompt invokes and the body run strictly SEQUENTIALLY (the
        // executor awaits each query), so there is no stream-interleaving risk.
        // QRY-6/QRY-8: a query whose rendered template is empty short-circuits
        // to `Err(empty_template)` with NO provider turn (not user-visible — no
        // turn is issued at all).
        const shortCircuits =
          renderEmptyShortCircuit(renderQueryText(expr, env)) !== undefined;
        const userVisible = !shortCircuits;
        return this.#resolvePromptQuery(expr, env, {
          pi,
          ctx,
          theta,
          signal,
          thetaAbort,
          readMessages,
          userVisible,
        });
      },
      resolveToolCall: (expr, env, evaluatedToolArgs) =>
        this.#resolveToolCall(theta, expr, env, signal, evaluatedToolArgs),
      // CANCEL-5 / cross-mode: the caller's mode (`prompt`) is threaded to
      // `#driveCallee` so an `invoke`d prompt-mode callee attaches to this user
      // session (prompt→prompt) rather than spawning fresh.
      resolveInvoke: (expr, env) => this.#resolveInvoke(theta, expr, env, ctx, chain, signal, "prompt"),
      // Bug 0088: pair the wrapper `runInvokeEffect` builds for a failed hop
      // with its provenance record.
      recordInvokeHop: (wrapper, calleePath, callSite) =>
        this.#recordInvokeHop(theta, wrapper, calleePath, callSite),
      classifyCall: (expr) => this.#classifyCall(theta, expr),
      resolveCallAsInvoke: (expr, env) => this.#resolveCallAsInvoke(theta, expr, env, ctx, chain, signal, "prompt"),
      // RFC 0001 (`subagent fn`, FN-8): a prompt-mode theta may call a
      // `subagent fn` — the safe prompt→subagent direction. Each call spawns a
      // fresh isolated session under the resolved config; the depth frame
      // (INV-4 / FN-6) is pushed on `chain` inside the spawn.
      spawnSubagentFnSession: (config) =>
        this.#spawnSubagentFnSession(theta, config, ctx, chain, signal),
    };

    const executeDeps: ExecuteBodyDeps = {
      env: buildBoundEnvironment(
        theta.body,
        bindInput.paramBindings,
        theta.imports,
        presentedCallableNames(theta),
        theta.sourcePath,
      ),
      host: createEffectfulStatementHost(hostDeps),
      checkpoint: root.checkpoint,
      signal,
      mutator: new NoopConversationMutator(),
      mode: "prompt",
      file: theta.slashName,
    };

    // Decision 6 / Increment B1 (active-invocation-registry.md §"Active
    // invocation registry"): the invocation's registry entry, keyed by THIS
    // `thetaAbort` so sub-step 2 (cancel in-flight) and sub-step 3 (await
    // dispose) reach it. The slash dispatch entry point already opened the
    // entry ahead of the binder await (`beginInvocation`); this bind REUSES that
    // ticket via `bindInput.invocationTicket` rather than adding a second entry.
    // A bind reached with no ticket (an `invoke` spawn site, the child-side
    // regime, or an in-memory harness) opens its own here. Prompt mode has no
    // `AgentSession.dispose()` analogue, so the barrier settles immediately at
    // finish.
    const ticket =
      bindInput.invocationTicket ?? this.#openInvocationTicket(theta.slashName, thetaAbort);
    // Publish the invocation-scoped forwarding sources onto the shared sink LAST
    // (this method is synchronous and cannot throw between here and the return),
    // so a normal settle removes them via `finishInvocation` and only a
    // still-in-flight-at-shutdown invocation leaves them for sub-step 5.
    const detachForwarding = this.#trackForwardingSources(forwardingSources);
    let finished = false;
    // Idempotent: the DRIVE `finally` calls this once; a defensive caller may
    // call again with no effect. A NORMAL settle detaches the forwarding
    // listeners and splices them off the shared sink (no accumulation), then
    // finishes the (possibly shared) ticket.
    const finishInvocation = (): void => {
      if (finished) return;
      finished = true;
      detachForwarding();
      ticket.finish();
    };

    return {
      drivenAgainst: "prompt-user-session",
      executeDeps,
      // RFC 0001 (`subagent fn`): expose the session-scoped effect resolvers so a
      // `subagent fn` spawn can re-bind them for a fresh isolated session.
      effectHostDeps: hostDeps,
      // PIC-53: the prompt-mode return value is the trailing turn's accumulated
      // assistant text of the driven user session on the SUCCESS path. A failed
      // run surfaces its real terminal outcome (mirroring the subagent surface):
      // a `?`-propagated `Err` carries its `QueryError` payload so the
      // slash-dispatch boundary (SLSH-3) can emit the top-level err note, and
      // any other fail / cancel surfaces the terminal cancellation `Err` — never
      // a masking `Ok`. Without this a failed prompt theta was indistinguishable
      // from a successful one and the SLSH-3 note was never emitted.
      surface: (execution: BodyExecution): ResultValue => {
        if (execution.outcome === "success") {
          return makeOk(extractTrailingTurnText(readMessages()));
        }
        // A `fail` outcome carries the terminating `Err` — a `?`-propagation OR
        // an unhandled non-cancel effect-`Err` in tail position (ERR-19, e.g. a
        // `tool_loop_exhausted` breach). Project that real error so the caller
        // reads the true leaf kind; NEVER fabricate a `cancelled` for a fail
        // (STL-6). Only a genuine `cancel` outcome (an aborted checkpoint)
        // yields `CancelledError`.
        if (execution.outcome === "fail") {
          return makeErr(execution.error ?? (makeCancelledError() as unknown as ThetaValue));
        }
        return makeErr(makeCancelledError() as unknown as ThetaValue);
      },
      finishInvocation,
    };
  }

  /**
   * RFC-0006 (PIC-58/59/60/62/63). Parent-side subagent-mode binding. Under this
   * RFC the WHOLE callee runs in a spawned child `pi --theta … --mode json -p
   * "/<slug>" --no-session` process; the parent no longer drives a remote
   * session. The returned binding's `drive()` (PIC-59) launches the child,
   * marshals params structurally (PIC-60), awaits the single `theta_result`
   * stdout envelope, and maps `ok`/`err` to `Ok`/`Err` — the parent runs no
   * per-query extraction and never executes the callee body in-process. The
   * legacy RFC-0005 RPC drive is retired (deleted, not a fallback).
   *
   * The binding also exposes an IN-PROCESS `effectHostDeps` for the RFC-0001
   * `subagent fn` inline-body path (`#spawnSubagentFnSession`), which has no
   * `.theta` file / slug to launch and so runs its inline body against an
   * isolated off-session conversation in the parent; that path uses
   * `effectHostDeps` and never triggers the child launch inside `drive()`.
   */
  async spawnSubagentConversation(
    bindInput: ConversationBindInput,
  ): Promise<ConversationBinding> {
    const { root } = this.#input;
    const { theta, ctx } = bindInput;
    // INV-4 / ceiling #1: carry the parent's pushed chain into the spawned
    // subagent invocation so the per-chain depth counter crosses the process
    // boundary unchanged; a top-level subagent dispatch starts a fresh chain
    // seeded at the inbound subagent-child depth (0 on the parent / harness
    // paths, the marshalled parent depth inside a subagent child).
    const chain = bindInput.chain ?? newInvokeChainAtDepth(this.#input.subagentInboundInvokeDepth ?? 0);

    // PIC-62 obligation 1 (pre-spawn model guard): the subagent's resolved model
    // is the theta's frontmatter `model:` resolved into the inherited session
    // model — here the inherited `ctx.model`. Refuse the spawn when it is
    // `undefined` rather than launching a modelless child, emitting the pinned
    // `theta/runtime/subagent-model-unresolved` diagnostic and surfacing the
    // precise `invoke_infra` cause `subagent_model_unresolved` to an `invoke`
    // parent.
    // PIC-62 single source of truth: the parent-side pre-spawn guard is the
    // `guardResolvedModel` leaf (`subagent-model-guard.ts`); the retired RFC-0005
    // `preSpawnModelGuard` duplicate is deleted.
    const model = ctx.model;
    const modelGuard = guardResolvedModel(model?.id);
    if (!modelGuard.ok || model === undefined) {
      if (!modelGuard.ok) {
        (this.#input.emitDiagnostic ?? ((): void => {}))(modelGuard.diagnostic);
      }
      throw new InvokeInfraCauseError(
        SUBAGENT_MODEL_UNRESOLVED_MESSAGE,
        "subagent_model_unresolved",
      );
    }

    // `thetaAbort` — the per-invocation cancel controller (cancellation.md §Signal
    // source). CANCEL-5: a child `invoke` binding (carrying `parentSignal`)
    // constructs its `thetaAbort` as a DERIVED controller (downward-only); a
    // top-level dispatch gets a fresh controller (shared with the dispatch entry
    // when `bindInput.thetaAbort` is present).
    const forwardingSources: ForwardingSignalSource[] = [];
    let thetaAbort: AbortController;
    if (bindInput.parentSignal !== undefined) {
      const derived = deriveChildThetaAbort(bindInput.parentSignal);
      thetaAbort = derived.controller;
      forwardingSources.push({
        label: "parentInvokeSignal.removeEventListener",
        removeEventListener: derived.detach,
      });
    } else {
      thetaAbort = bindInput.thetaAbort ?? createThetaAbort();
    }

    // SUBAG-1: render the theta's `system:` frontmatter into the child's
    // `--system-prompt` (subagent.md §state-isolation matrix: `system:` inherited
    // from frontmatter, `${param}` interpolation resolved at spawn time). A
    // malformed `system:` was rejected at load; on the unexpected `!ok` path fall
    // back to no system prompt rather than crashing the spawn.
    let systemPrompt: string | undefined;
    const systemTemplate = theta.frontmatter.system;
    if (systemTemplate !== undefined) {
      const params: Record<string, ThetaValue> = {};
      if (bindInput.paramBindings !== undefined) {
        for (const [name, value] of bindInput.paramBindings) {
          // A bound param name is author-controlled; see `defineRecordField`'s
          // doc-comment for why this must define rather than assign.
          defineRecordField(params, name, value);
        }
      }
      const rendered = renderSystemPrompt({ template: systemTemplate, params });
      if (rendered.ok) {
        systemPrompt = rendered.text;
      }
    }

    // PIC-58 launch contract: the callable set's HOST-TOOL half becomes the
    // child's `--tools` allowlist (defence-in-depth; the child theta enforces its
    // own callable set regardless). No host tool in the set maps to `--no-tools`
    // (empty ≠ omission — omission would re-enable the host's default built-ins).
    //
    // `.theta` callables are deliberately NOT in the allowlist. `--tools` is a
    // HOST tool-registry allowlist, and a `.theta` callable name names nothing in
    // that registry: it is theta-side, resolved child-side against the child's own
    // theta registry, and it already has its own carrier in the launch contract
    // (the presented name + marshalled closure hash). Forwarding it too was a
    // duplication only a host with a lenient argv tolerated — Oh-My-Pi VALIDATES
    // `--tools` against its registry and exits 2 before any session starts
    // (`Error: Unknown tool in --tools: <name>`), which the parent observes only
    // as a child exit without an envelope, so EVERY theta registering a `.theta`
    // callee in `tools:` was unrunnable there (bug 0218).
    const piToolNames = callableSetPiToolNames(theta);
    const thetaCallableEntries = callableSetThetaEntries(theta);
    const noHostTools = piToolNames.length === 0;

    // #subagent-isolation-and-trust: grant the child PROJECT-LOCAL trust iff the
    // callable set holds a project-local tool (the operator already trusted its
    // extension in the parent session), else withhold it (least privilege). Read
    // over the HOST-tool names for the same reason the allowlist is: only a host
    // tool can carry a host source scope, so a `.theta` presented name that
    // happens to collide with a project-local tool's name cannot inflate the
    // verdict. The flags that spell either arm are the host dialect's, not this
    // seam's — see `HostCliDialect` — one host cannot express this intent at all.
    const allTools = this.#input.getAllTools?.() ?? [];
    const projectTrust = inferChildTrust(piToolNames, allTools);

    // §Resolution snapshot (widened): marshal each `.theta` callable's
    // transitive-closure content hash captured AT LOAD on the frozen callable-set
    // entry (`entry.closureHash`) — NOT recomputed here — so the child's
    // recompute-and-compare detects a load-to-spawn edit and refuses fail-closed.
    const callableHashes: Record<string, string> = {};
    for (const entry of thetaCallableEntries) {
      if (entry.closureHash !== undefined) {
        callableHashes[entry.presentedName] = entry.closureHash;
      }
    }

    // Bug 0328 §Fix: marshal the LAUNCHED ROOT callee's own closure hash under
    // its child-derivable name too — the spec's hash window is the WHOLE callee
    // file, not only its `tools:` entries, and a `tools:`-less root previously
    // marshalled no carrier at all. Added only when the key is not already an
    // OWN `tools:`-entry key. `Object.hasOwn` (never a `=== undefined` read)
    // so a root file whose derived name collides with an inherited
    // `Object.prototype` member (`constructor`, `toString`, `hasOwnProperty`,
    // …) still marshals its row instead of being silently skipped.
    const rootClosureHash = theta.rootClosureHash;
    if (rootClosureHash !== undefined && !Object.hasOwn(callableHashes, rootClosureHash.name)) {
      callableHashes[rootClosureHash.name] = rootClosureHash.hash;
    }

    // The runtime-defect diagnostic sink (advisory teardown / spawn-failure /
    // envelope failures). Absent on non-production harnesses (a no-op).
    const emitDiagnostic = this.#input.emitDiagnostic ?? ((): void => {});

    // ---- IN-PROCESS host for the RFC-0001 `subagent fn` inline-body path ----
    // A `subagent fn` body has no slug/file to launch, so it runs in the parent
    // against an isolated OFF-SESSION conversation (queries resolve via
    // `#resolvePromptQuery(..., userVisible: false)` — a private `complete()`
    // conversation, never the caller's). `#spawnSubagentFnSession` consumes this
    // `effectHostDeps`; the file-callee path (below) uses `drive()` and never
    // touches it.
    const signal = thetaAbort.signal;
    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint: root.checkpoint,
      signal,
      sink: noopSink(),
      file: theta.slashName,
      evaluatePure: (expr, env) => evaluatePureExpression(expr, env),
      resolveQuery: (expr, env) =>
        this.#resolvePromptQuery(expr, env, {
          pi: this.#input.pi,
          ctx,
          theta,
          signal,
          thetaAbort,
          readMessages: () => [],
          userVisible: false,
        }),
      resolveToolCall: (expr, env, evaluatedToolArgs) =>
        this.#resolveToolCall(theta, expr, env, signal, evaluatedToolArgs),
      resolveInvoke: (expr, env) => this.#resolveInvoke(theta, expr, env, ctx, chain, signal, "subagent"),
      // Bug 0088: pair the wrapper `runInvokeEffect` builds for a failed hop
      // with its provenance record.
      recordInvokeHop: (wrapper, calleePath, callSite) =>
        this.#recordInvokeHop(theta, wrapper, calleePath, callSite),
      classifyCall: (expr) => this.#classifyCall(theta, expr),
      resolveCallAsInvoke: (expr, env) =>
        this.#resolveCallAsInvoke(theta, expr, env, ctx, chain, signal, "subagent"),
      spawnSubagentFnSession: (config) =>
        this.#spawnSubagentFnSession(theta, config, ctx, chain, signal),
    };

    const executeDeps: ExecuteBodyDeps = {
      env: buildBoundEnvironment(
        theta.body,
        bindInput.paramBindings,
        theta.imports,
        presentedCallableNames(theta),
        theta.sourcePath,
      ),
      host: createEffectfulStatementHost(hostDeps),
      checkpoint: root.checkpoint,
      signal,
      mutator: new NoopConversationMutator(),
      mode: "subagent",
      file: theta.slashName,
    };

    // Decision 6 / Increment B1: the invocation's registry entry, opened before
    // the lazy child launch below so the entry SPANS the real in-flight window;
    // removal is deferred to `finishInvocation`. The slash dispatch entry
    // point's pre-binder ticket is REUSED when present (`bindInput.invocationTicket`),
    // so the entry also spans the binder window and no second entry is added.
    const ticket =
      bindInput.invocationTicket ?? this.#openInvocationTicket(theta.slashName, thetaAbort);
    const detachForwarding = this.#trackForwardingSources(forwardingSources);
    let finished = false;
    const finishInvocation = (): void => {
      if (finished) return;
      finished = true;
      detachForwarding();
      ticket.finish();
    };

    // ---- EAGER child-process launch (PIC-65 / PIC-58 / PIC-60 / PIC-66) ----
    // The launch is initiated NOW (not lazily in `drive()`): PIC-22 requires the
    // spawn to be initiated at bind time (parallel fan-out), and the launch
    // contract is observable here. `drive()` below only awaits the envelope on
    // the already-spawned child.
    //
    // PIC-60: marshal the already-typed params structurally (canonical JSON on
    // `PI_THETA_PARAMS`, or a 0600 temp file on `PI_THETA_PARAMS_FILE` at/above
    // the pinned threshold). The child validates against the same `params:`
    // schema and skips the binder entirely.
    const paramValues: Record<string, unknown> = {};
    if (bindInput.paramBindings !== undefined) {
      for (const [name, value] of bindInput.paramBindings) {
        // See `defineRecordField`'s doc-comment: a bound param name is
        // author-controlled and must not be assigned.
        defineRecordField(paramValues, name, value);
      }
    }
    const marshalled = marshalParams(paramValues, this.#paramsMarshalDeps());
    const paramsCleanup = marshalled.cleanup;

    const baseParentEnv = this.#input.subagentParentEnv ?? {};
    // The hash carrier is named on EVERY launch — cleared (`undefined`, absent
    // in the child) when this launch marshals none — for the same layering
    // reason `marshalParams` names both params carriers (SPAWN-08): this env is
    // spread over the launching process's own inherited environment, and that
    // process is itself frequently a subagent child still carrying the hash map
    // of the invocation that launched IT. A conditional spread cannot clear the
    // inherited map, and the grandchild's hash verification would then check the
    // CALLER's callable names against its own discovery — a spurious
    // `subagent-callable-hash-mismatch` drop for a file edited between the two
    // launches (subagent.md #subagent-theta-callable-hash).
    const parentEnv: Record<string, string | undefined> = {
      ...baseParentEnv,
      ...marshalled.env,
      [SUBAGENT_CALLABLE_HASHES_ENV]:
        Object.keys(callableHashes).length > 0
          ? JSON.stringify(callableHashes)
          : undefined,
    };

    // PIC-65 launch. The spawn seam + executable host are wired at the composition
    // root; their absence on a non-production harness is a configuration defect
    // surfaced as an internal error (never a modelless / childless drive).
    const spawn = this.#input.subagentSpawn;
    const executableHost = this.#input.subagentExecutableHost;
    if (spawn === undefined || executableHost === undefined) {
      paramsCleanup();
      finishInvocation();
      throw new SubagentSpawnFailedError(
        "subagent child launch is unavailable: no spawn seam / executable host wired",
      );
    }
    const launch = launchSubagentChild(
      {
        argv: {
          slug: theta.slashName,
          thetaDirs: this.#input.activeRoots ?? [],
          systemPrompt: systemPrompt ?? "",
          hostTools: piToolNames,
          noHostTools,
          provider: String(model.provider),
          model: model.id,
          projectTrust,
        },
        cwd: ctx.cwd,
        parentEnv,
        parentPid: this.#input.subagentParentPid ?? 0,
        // INV-4: marshal the CURRENT per-chain depth so the child continues the
        // depth-32 ceiling across the process hop (wire-level carriage).
        invokeDepth: chain.depth,
        host: executableHost,
      },
      { spawn, emitDiagnostic },
    );
    if (!launch.ok) {
      // PIC-65 spawn-failure rule: `launchSubagentChild` already emitted the
      // operator-triage diagnostic; dually route the failure as an unanticipated
      // SDK reject (theta/runtime/internal-error). No child → nothing to tear
      // down; clean up params + drop the registry entry the bind just added.
      paramsCleanup();
      finishInvocation();
      const reason =
        launch.reason === "unresolved"
          ? "subagent child executable unresolved"
          : "subagent child spawn failed";
      routeSubagentSpawnFailure(new Error(reason), theta.sourcePath ?? theta.slashName, {
        emitDiagnostic,
      });
      throw new SubagentSpawnFailedError(reason);
    }
    const child = launch.child;

    // PIC-66: forward cancellation to the `-p` child by killing it (the
    // child's stdin is spawned closed — bug 0002 — so no in-band stop
    // channel exists). Handles the spawn-then-immediate-cancel path
    // synchronously, so correctness does not depend on microtask ordering.
    const cancellation = attachSubagentCancellation(thetaAbort, child, {
      emitDiagnostic,
    });

    /**
     * PIC-59. Await the child's `theta_result` envelope (stray-line tolerant) and
     * map `ok`/`err` to the invocation `Result`. A child that exits WITHOUT an
     * envelope maps fail-closed to Err(InvokeInfraError{cause:"internal_error"}).
     * The file-callee slash/invoke drive seam calls this INSTEAD of executing the
     * body in-process (the whole callee body ran in the child).
     */
    const drive = async (): Promise<ResultValue> => {
      const result: SubagentInvocationResult = await driveSubagentChild({
        child,
        thetaAbort,
        calleePath: theta.sourcePath ?? theta.slashName,
        emitDiagnostic,
        clock: root.clock,
      });
      if (result.ok) {
        return makeOk(result.value as ThetaValue);
      }
      return makeErr(result.error as unknown as ThetaValue);
    };

    // PIC-65 / PIC-66 child-process teardown. Runs on EVERY exit of the drive
    // seam's `finally`. Bounded-awaits child exit (already settled on the normal
    // path — the child self-exits after its envelope) and kills on timeout
    // (process-tree kill on Windows); detaches the one-shot cancellation listener; deletes any
    // `PI_THETA_PARAMS_FILE` temp file (PIC-60 backstop). Idempotent; a no-op
    // when no child was launched (the `subagent fn` in-process path).
    let toreDown = false;
    const teardown = async (): Promise<void> => {
      if (toreDown) return;
      toreDown = true;
      // PIC-60 backstop: delete the params temp file regardless of launch outcome.
      try {
        paramsCleanup();
      } catch (cleanupError: unknown) { // allow-broad-catch: PIC-60 temp-file backstop — pi-integration-contract/subagent.md
        void cleanupError;
      }
      await runSubagentChildTeardown(child, {
        emitDiagnostic,
        detachAbortListener: cancellation.detach,
        settleDisposeBarrier: ticket.settleDisposeBarrier,
        clock: root.clock,
      });
    };

    return {
      drivenAgainst: "subagent-private-session",
      executeDeps,
      effectHostDeps: hostDeps,
      drive,
      // FN-5: on the in-process `subagent fn` path the caller's executor runs the
      // inline body against `effectHostDeps`, then surfaces the body's terminal
      // final value the same way the file-callee `drive()` maps its envelope.
      surface: (execution: BodyExecution): ResultValue =>
        surfaceCalleeFinalValue(execution),
      teardown,
      finishInvocation,
    };
  }

  /**
   * PIC-60 params-channel fs seam adapter. The env channel (small params) never
   * touches the fs, so a missing seam throws only if the file channel is reached
   * (≥8 KB payload) — fail-loud at the boundary rather than silent narrowing.
   */
  #paramsMarshalDeps(): ParamsMarshalDeps {
    const fs = this.#input.subagentParamsFs;
    return {
      writeTempFile: (contents: string, mode: number): string => {
        if (fs === undefined) {
          throw new SubagentSpawnFailedError(
            "subagent params temp-file channel unavailable: no params-fs seam wired",
          );
        }
        return fs.writeTempFile(contents, mode);
      },
      unlink: (path: string): void => {
        fs?.unlink(path);
      },
    };
  }

  /**
   * RFC-0006 (PIC-60, child-side). Intake the marshalled params from the child
   * env and validate them against the callee's lowered `params:` schema. Reuses
   * the pure `intakeChildParams` seam (offline-tested) with a validator built
   * from the theta's load-time lowered schema over the root AJV `SchemaValidator`
   * and the params-channel fs seam (read + delete the temp file). A theta with
   * no `params:` admits an empty object.
   */
  #intakeSubagentRootParams(theta: ConversationBindInput["theta"]): ChildParamsIntake {
    const env = this.#input.subagentParentEnv ?? {};
    const fs = this.#input.subagentParamsFs;
    const intakeFsDeps = {
      readFile: (path: string): string => {
        if (fs === undefined) {
          throw new Error("subagent params file channel unavailable: no params-fs seam wired");
        }
        return fs.readFile(path);
      },
      unlink: (path: string): void => {
        fs?.unlink(path);
      },
    };
    const lowered = theta.frontmatter.params?.loweredSchema;
    const validator: ParamsSchemaValidator = {
      validate: (params: unknown) => {
        if (lowered === undefined) {
          // No declared `params:` — admit any received payload (nothing to validate).
          return { ok: true as const };
        }
        const compiled = this.#input.root.schemaValidator.compile(lowered);
        const verdict = compiled.validate(params);
        if (verdict.ok) {
          return { ok: true as const };
        }
        const detail =
          Array.isArray(verdict.errors) && verdict.errors.length > 0
            ? String(verdict.errors[0]?.message ?? "schema validation failed")
            : "schema validation failed";
        const errorPath =
          Array.isArray(verdict.errors) && verdict.errors.length > 0
            ? String(verdict.errors[0]?.instancePath ?? "")
            : "";
        return { ok: false as const, errorPath, detail };
      },
    };
    return intakeChildParams(env, validator, intakeFsDeps);
  }

  /**
   * RFC-0006 (PIC-58). Whether THIS process is the spawned subagent-root child
   * for `theta` — the regime marker is active and names `theta`'s slug and the
   * theta is `mode: subagent`. The regime, not the mode, selects the child-side
   * in-process driver (`selectSubagentDriver` encodes the mode-regress guard: a
   * NESTED `mode: subagent` callee still spawns its own child).
   */
  isSubagentRootFor(theta: ConversationBindInput["theta"]): boolean {
    const regime = this.#input.subagentRootRegime ?? { active: false as const };
    return (
      regime.active &&
      regime.slug === theta.slashName &&
      theta.frontmatter.mode === "subagent"
    );
  }

  /**
   * RFC-0006 (PIC-58/59/60/62). Child-side subagent-root drive. Runs INSIDE the
   * spawned child for the process-root subagent theta: intake the marshalled
   * params (binder bypassed, PIC-60), confirm the marshalled model reference
   * re-resolved child-side (PIC-62), drive the callee in-process against the
   * child's own host session (prompt-mode mechanics under the subagent
   * frontmatter contract), and emit the single `theta_result` stdout envelope on
   * EVERY exit path — `Ok`, every `Err`, and a panic routed as internal-error
   * (PIC-59). The child transcript is process-private (`--no-session`).
   */
  async driveSubagentRootRegime(bindInput: ConversationBindInput): Promise<void> {
    const { theta, ctx } = bindInput;
    const calleePath = theta.sourcePath ?? theta.slashName;
    const emitEnvelope =
      this.#input.emitResultEnvelope ?? ((): void => {});
    const emitErr = (error: QueryError): void => {
      emitEnvelope(serializeErrEnvelope(error));
    };

    // PIC-62 obligation 2 (child-side model confirmation): re-resolve the
    // marshalled `--provider`/`--model` reference against the child's own model
    // registry and confirm it matches the intended model; on mismatch fail the
    // invocation and report it through the envelope (never over any RPC surface).
    const model = ctx.model;
    if (model !== undefined) {
      const available = this.#input.modelRegistry.getAvailable();
      // Match on the FULLY-QUALIFIED `provider/id` reference, not the bare id.
      // The marshalled reference carries both halves (`--provider <p> --model
      // <id>`) and the concrete `Model` here carries both, so the qualified
      // form is the one the child can confirm unambiguously. A bare id is not
      // a unique key in a host registry that serves the same model through
      // several providers (e.g. a first-party endpoint plus a gateway): the
      // bare-id filter then matches more than one entry, `matchAvailableModel`
      // answers `undefined` for "ambiguous", and a perfectly resolvable child
      // model is refused as totally unresolved.
      const qualified = `${model.provider}/${model.id}`;
      const resolved = matchAvailableModel(qualified, available);
      // PIC-62 obligation 2: `resolved === undefined` is TOTAL non-resolution —
      // the child's own model registry holds no match for the marshalled
      // `--provider`/`--model` reference. Falling back to the expected value
      // here would make `confirmChildModel(x, x)` trivially PASS and silently
      // admit a child whose model never resolved; instead surface an explicit
      // unresolved marker as the child-resolved value so the pre-flight mismatch
      // is real and the diagnostic names expected vs. "(unresolved)".
      const resolvedRef =
        resolved === undefined
          ? "(unresolved: no matching model)"
          : `${resolved.provider}/${resolved.id}`;
      const confirmation = confirmChildModel(qualified, resolvedRef);
      if (!confirmation.ok) {
        (this.#input.emitDiagnostic ?? ((): void => {}))(confirmation.diagnostic);
        emitErr({
          ...confirmation.error,
          callee_path: calleePath,
        } as unknown as QueryError);
        return;
      }
    }

    // PIC-60 (child-side): intake the marshalled params from the child env,
    // validate them against the callee's `params:` schema, and bind them DIRECTLY
    // (the binder is bypassed on the marshalled path). A parse / schema-validation
    // failure refuses the invocation fail-closed and reports it through the
    // envelope as Err(InvokeInfraError{cause:"validation"}).
    const intake = this.#intakeSubagentRootParams(theta);
    if (!intake.ok) {
      (this.#input.emitDiagnostic ?? ((): void => {}))(intake.diagnostic);
      emitErr({ ...intake.error, callee_path: calleePath } as unknown as QueryError);
      return;
    }
    // `intake.params` is `undefined` when no params carrier was marshalled (a
    // callee with no `params:` / a no-arg invocation) — an empty binding set.
    // runtime-value-model.md §"Wire-name translation" names binder `args` as an
    // inbound boundary, and the marshalled child-side intake is that boundary's
    // other projection: it validated against the same lowered `params:`
    // document, so it performs the same pass before binding.
    const paramBindings =
      intake.params !== undefined && intake.params !== null
        ? bindParamsInbound({
            params: intake.params as Readonly<Record<string, unknown>>,
            lowered: theta.frontmatter.params?.loweredSchema as
              | Record<string, unknown>
              | undefined,
            body: theta.body,
            schemaValidator: this.#input.root.schemaValidator,
            // Bug 0337: a `.theta`-declared enum `params:` field binds a
            // file-qualified variant matching a body-constructed one.
            ...(theta.sourcePath !== undefined
              ? { enumDeclaringPath: theta.sourcePath }
              : {}),
          })
        : new Map<string, ThetaValue>();
    const rootBindInput: ConversationBindInput = {
      ...bindInput,
      ...(paramBindings.size > 0 ? { paramBindings } : {}),
    };

    // PIC-58: drive the root theta against the child process's own host session
    // with PROMPT-MODE driver mechanics while applying the subagent frontmatter
    // contract (its `system:` was installed via `--system-prompt` at launch; the
    // callable set governs the child session's active tools). The binding runs
    // the body in-process against the child's session.
    const binding = this.bindPromptConversation(rootBindInput);
    try {
      const execution = await executeBody(theta.body, binding.executeDeps);
      // FN-5 / PIC-59: the envelope carries the callee's terminal FINAL VALUE
      // with `Result` fidelity — NOT the prompt-mode PIC-53 trailing-turn text
      // `binding.surface` computes. The regime borrows prompt-mode driver
      // MECHANICS (active-tool set, in-process session) but the subagent
      // return-value contract, so the final value is projected the same way the
      // parent-side file-callee `drive()` maps its envelope.
      const terminal = surfaceCalleeFinalValue(execution);
      // PIC-59: emit the single machine-readable envelope for the terminal Result.
      if (terminal.ok) {
        // PIC-59: refuse before writing the envelope, so no invoke parent
        // ever binds a value the callee did not produce — JSON has no
        // form for a non-finite `number`, and `JSON.stringify` would
        // otherwise substitute `null` for it unnoticed. Depth is the FIRST
        // sub-check (bug 0187 §Fix (b)): a payload past ceiling #4's
        // cap refuses whatever it carries, so ordering depth first costs
        // the non-finite search nothing — such a `>cap` payload never
        // reaches it. Both walks now descend a `Result`'s wire form as a
        // record (bug 0201 §Fix (a)), so this ordering also decides which
        // refusal a carrier-nested payload takes. PIC-59's *Result-carriage
        // bound* (`docs/spec_topics/pi-integration-contract/subagent.md`,
        // `#subagent-envelope-result-carriage-bound`) states that
        // reach. The depth refusal emits NO diagnostic (no registry
        // row exists for a ceiling-#4 breach at this boundary); 0180's
        // non-representability refusal below keeps its own registered code.
        const tooDeep = mapTooDeepReturnValue(terminal.value as unknown, calleePath);
        const nonRepresentable =
          tooDeep === undefined
            ? mapNonRepresentableReturnValue(terminal.value as unknown, calleePath)
            : undefined;
        if (tooDeep !== undefined) {
          emitErr(tooDeep);
        } else if (nonRepresentable !== undefined) {
          (this.#input.emitDiagnostic ?? ((): void => {}))(nonRepresentable.diagnostic);
          emitErr(nonRepresentable.error);
        } else {
          emitEnvelope(serializeOkEnvelope(terminal.value as unknown));
        }
      } else {
        emitErr(terminal.error as unknown as QueryError);
      }
    } catch (thrown: unknown) { // allow-broad-catch: PIC-59 panic→internal-error envelope — pi-integration-contract/subagent.md
      if (thrown instanceof HostFatal) {
        throw thrown;
      }
      // PIC-59: a panic (or any catchable interpreter/adapter throw) is routed as
      // the internal-error `Err` on the envelope — never a fabricated value.
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      emitErr({
        kind: "invoke_infra",
        message: `internal error: ${message}`,
        callee_path: calleePath,
        cause: "internal_error",
      } as unknown as QueryError);
    } finally {
      await binding.teardown?.();
      binding.finishInvocation?.();
    }
  }

  /**
   * RFC 0001 (`subagent fn`) production spawn seam. Drive a `subagent fn` body
   * under the resolved `SubagentSessionConfig` and return the session-scoped
   * effect resolvers the calling body's effectful host routes the body's
   * `@`-queries / calls / invokes through while the session is active (FN-6
   * isolation), plus a `dispose()` that discards it on return.
   *
   * Unlike an `invoke`d subagent-mode `.theta` callee — which
   * `spawnSubagentConversation` launches as a fresh child `pi` process
   * (`-p "/<slug>"`) — a `subagent fn` is an INLINE body with no `.theta`
   * file / slug to launch, so it does NOT spawn a child process. Consistent with
   * revised INV-5, its body runs IN-PROCESS against an isolated OFF-SESSION
   * conversation in the parent (queries resolve via `#resolvePromptQuery` with
   * `userVisible: false` — a private `complete()` conversation, never the
   * caller's session), preserving FN-6 transcript isolation without a child
   * process or a PIC-65 child teardown. See the inline RFC-0006 note below for the
   * mechanics.
   *
   * INV-4 / FN-6 (threaded through the production chain): a countable
   * `subagent-fn` frame is pushed on `chain` BEFORE the spawn, exactly as
   * `#buildInvokeChild` pushes a `direct-invoke` frame; the spawned session
   * carries the pushed `childChain`, so a nested `invoke` / `subagent fn` inside
   * the body pushes further frames and a deep chain trips the depth-32 ceiling.
   * A ceiling breach on the push raises `InvokeDepthExceededPanic`, which the
   * executor's subagent boundary downgrades to the caller's
   * `Err(InvokeInfraError{cause:"panic"})` — the runtime backstop against
   * unbounded subagent-fn recursion.
   *
   * FN-7 config: the resolved `config` (`system` / `model` / `tools` /
   * `tool_loop` / `respond_repair`) is applied by re-binding the enclosing theta
   * under an overridden frontmatter + callable set; a `with { tools }` override
   * resolves against the CALLING theta's callable set (FN-9). Defaults inherit
   * the calling theta's configuration.
   */
  async #spawnSubagentFnSession(
    theta: ConversationBindInput["theta"],
    config: SubagentSessionConfig,
    ctx: ExtensionCommandContext,
    chain: InvokeChain,
    parentSignal: AbortSignal,
  ): Promise<SubagentFnSession> {
    // INV-4 / FN-6: push the countable `subagent-fn` frame on the chain before
    // spawning. A breach raises `InvokeDepthExceededPanic`; it propagates out of
    // this async spawn and the executor's subagent boundary downgrades it.
    const childChain = pushCountableFrame(chain, "subagent-fn");

    // FN-7: apply the resolved session config by re-binding the enclosing theta
    // under an overridden frontmatter + callable set. `system` sets the spawned
    // session's system prompt (legitimate even from a prompt-mode enclosing
    // theta, FN-7); `tool_loop` / `respond_repair` override the loop budgets;
    // `model` overrides the inherited session model.
    const overriddenFrontmatter = {
      ...theta.frontmatter,
      ...(config.system !== undefined
        ? { system: { parts: [{ kind: "text" as const, value: config.system }] } }
        : {}),
      ...(config.toolLoop !== undefined ? { toolLoop: config.toolLoop } : {}),
      ...(config.respondRepair !== undefined
        ? { respondRepair: config.respondRepair }
        : {}),
    };
    const spawnedCallableSet = subagentFnCallableSet(theta.callableSet, config);
    const overriddenTheta: ConversationBindInput["theta"] = {
      ...theta,
      frontmatter: overriddenFrontmatter,
      ...(spawnedCallableSet !== undefined
        ? { callableSet: spawnedCallableSet }
        : {}),
    };
    // FN-7 `model` override: PIC-40 reads the resolved model from `ctx.model`,
    // so an explicit `with { model }` overrides the inherited session model. The
    // reference string resolves to a concrete `Model<Api>` by the same
    // exact-match rule the load-time / binder resolution uses. An unresolvable
    // override is already rejected at LOAD (`checkSubagentFnModelOverrides` →
    // `theta/load/model-unresolved` un-registers the theta), so a registered
    // theta reaching here always resolves; the `?? undefined` fall-through keeps
    // the inherited session model only for the (now load-unreachable) no-match,
    // never silently masking an unresolvable reference.
    const overrideModel =
      config.model !== undefined
        ? matchAvailableModel(config.model, this.#input.modelRegistry.getAvailable())
        : undefined;
    const effectiveCtx =
      overrideModel !== undefined ? { ...ctx, model: overrideModel } : ctx;

    // RFC-0006 note: a `subagent fn` is an INLINE body with no `.theta` file /
    // slug to launch as `-p "/<slug>"`, so it does NOT go through the child-launch
    // `spawnSubagentConversation`. It runs its inline body IN-PROCESS against an
    // isolated OFF-SESSION conversation (queries resolve via `#resolvePromptQuery`
    // with `userVisible: false` — a private `complete()` conversation offering the
    // model no tools, never the caller's), preserving FN-6 isolation without a
    // child process. FN-6's isolation is scoped to the body's CONVERSATION only:
    // the body's code-side extension-tool calls resolve through `resolveToolCall`
    // below to the producer-wide `hostLoopDispatch` seam and so dispatch through
    // the PROCESS's backing host session per PIC-64 — the child's private,
    // discarded session inside a subagent-root child, the user's live session in
    // the parent — exactly as the enclosing theta's own code-side calls do.
    const { root } = this.#input;
    const derived = deriveChildThetaAbort(parentSignal);
    const thetaAbort = derived.controller;
    const forwardingSources: ForwardingSignalSource[] = [
      { label: "parentInvokeSignal.removeEventListener", removeEventListener: derived.detach },
    ];
    const signal = thetaAbort.signal;
    const isolatedCtx = effectiveCtx;
    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint: root.checkpoint,
      signal,
      sink: noopSink(),
      file: overriddenTheta.slashName,
      evaluatePure: (expr, env) => evaluatePureExpression(expr, env),
      resolveQuery: (expr, env) =>
        this.#resolvePromptQuery(expr, env, {
          pi: this.#input.pi,
          ctx: isolatedCtx,
          theta: overriddenTheta,
          signal,
          thetaAbort,
          readMessages: () => [],
          userVisible: false,
        }),
      resolveToolCall: (expr, env, evaluatedToolArgs) =>
        this.#resolveToolCall(overriddenTheta, expr, env, signal, evaluatedToolArgs),
      resolveInvoke: (expr, env) =>
        this.#resolveInvoke(overriddenTheta, expr, env, isolatedCtx, childChain, signal, "subagent"),
      // Bug 0088: pair the wrapper `runInvokeEffect` builds for a failed hop
      // with its provenance record.
      recordInvokeHop: (wrapper, calleePath, callSite) =>
        this.#recordInvokeHop(overriddenTheta, wrapper, calleePath, callSite),
      classifyCall: (expr) => this.#classifyCall(overriddenTheta, expr),
      resolveCallAsInvoke: (expr, env) =>
        this.#resolveCallAsInvoke(overriddenTheta, expr, env, isolatedCtx, childChain, signal, "subagent"),
      spawnSubagentFnSession: (nestedConfig) =>
        this.#spawnSubagentFnSession(overriddenTheta, nestedConfig, isolatedCtx, childChain, signal),
    };

    // Decision 6 / Increment B1: register the in-flight invocation so the
    // factory's `session_shutdown` teardown operates on it; settle the barrier on
    // dispose (there is no child exit to observe on the in-process path).
    const activeInvocations = this.#input.activeInvocations;
    let settleDispose: () => void = (): void => {};
    const disposeBarrier = new Promise<void>((resolve) => {
      settleDispose = resolve;
    });
    const entry: ActiveInvocationEntry = {
      thetaAbort,
      disposeBarrier,
      shutdownReason: undefined,
      theta: overriddenTheta.slashName,
      invocationId: root.idSource.newInvocationId(),
    };
    activeInvocations?.add(entry);
    const detachForwarding = this.#trackForwardingSources(forwardingSources);
    let finished = false;

    return {
      deps: hostDeps,
      dispose: async (): Promise<void> => {
        if (finished) return;
        finished = true;
        settleDispose();
        detachForwarding();
        activeInvocations?.remove(entry);
        // Bug 0073: AFTER the barrier settles and the entry is removed, so a
        // PIC-67 rethrow out of the note delivery cannot leave a live entry
        // behind or an unsettled barrier.
        this.#emitCleanCancelNote(entry);
      },
    };
  }

  /**
   * Resolve one `@`-query to its live dispatch: render the template against the
   * lexical environment and bind a live `QueryModelDriver` that drives real
   * user-visible turns into the shared session. An untyped query drives one
   * plain-text turn (`PIC-53`); a schema-typed query forces a structured
   * respond turn.
   */
  #resolvePromptQuery(
    expr: QueryExpr,
    env: LexicalEnvironment,
    deps: {
      readonly pi: ExtensionAPI;
      readonly ctx: ExtensionCommandContext;
      readonly theta: ConversationBindInput["theta"];
      readonly signal: AbortSignal;
      /** CANCEL-2: the per-invocation controller the live turn driver re-forwards `ctx.signal` into. */
      readonly thetaAbort: AbortController;
      readonly readMessages: () => readonly Message[];
      readonly userVisible: boolean;
    },
  ): QueryHostDispatch {
    const { root } = this.#input;
    const typed = expr.schema !== null;
    // QTL-4: the theta's callable-set underlying Pi-tool names installed as the
    // model's active tools for each user-visible query turn.
    const activeTools = callableSetPiToolNames(deps.theta);
    // Bug 0010: lower the declared response schema FIRST — the single lowering
    // feeds the validation collaborator, the respond-tool registration, and the
    // QRY-15 template, so all three consume byte-identical canonical bytes.
    const lowered =
      expr.schema !== null
        ? lowerQueryResponseSchema(
            expr.schema,
            schemaDeclsOf(deps.theta.body),
            enumDeclsOf(deps.theta.body),
          )
        : undefined;
    // Bug 0010 (QRY-14 step 2): the typed query's respond-turn machinery —
    // the PIC-44-registered one-shot respond tool, the theta-resolved respond
    // model with auth/signal threading, the QRY-15 template, and the
    // early-respond capture host. Built for BOTH drivers (increment D): the
    // live driver forces the respond dispatch off-session after its
    // session-driven free phase; the off-session driver (`subagent fn`) runs
    // the same two-phase shape over its HELD conversation. Only the degraded
    // arm (`lowered === undefined`) builds no context.
    const respond =
      lowered !== undefined ? this.#buildRespondTurnContext(lowered, deps) : undefined;

    // QRY-6: the bare rendered template body (typed-query schema conveyance
    // excluded) the empty-template short-circuit is evaluated over before any
    // provider turn is issued.
    const renderedText = renderQueryText(expr, env);
    // WHY two text shapes (bug 0010): the restored two-phase path — live AND
    // off-session (increment D) — opens its free phase with the RENDERED QUERY
    // TEMPLATE BODY ONLY (QRY-14 step 1 — no JSON-only instruction, no inlined
    // schema; the shape is conveyed by the respond tool's parameters and the
    // QRY-15 template instead). The fused typed-aware text REMAINS only for
    // the degraded arm (`lowered === undefined`: an unlowerable annotation),
    // where the old fused-turn + text-parse fallback keeps typed behaviour
    // total.
    const queryText =
      respond !== undefined ? renderedText : renderTypedAwareQueryText(expr, env, lowered);

    // STAGE B (ceiling #2) / CIO-4 (bug 0010): bound the native prompt-mode
    // agentic tool loop to the theta's `tool_loop.max_rounds` for EVERY driven
    // free-phase turn — typed included (the old `!typed` exemption is retired;
    // the forced respond turn is off-session and inherently outside pi's
    // native loop, so it needs no exemption plumbing). `max_rounds: 0` is
    // handled upstream by the loops (they exhaust at query start before any
    // turn), so the governor is only consulted for `max_rounds >= 1` turns.
    const maxRounds = deps.theta.frontmatter.toolLoop?.maxRounds ?? 25;
    if (deps.userVisible) {
      this.#promptToolLoopGovernor.ensureRegistered(deps.pi);
    }
    // WHY the model is built BEFORE the validation collaborator (bug 0010
    // increment C): the LIVE typed repair drive is `driveRepairAttempt` — a
    // METHOD on the live model (it restarts the two-phase loop over the same
    // per-query state: window start, governor, capture slot) — so validation's
    // `driveFollowUp` closure must capture the constructed model. The model
    // construction itself no longer needs `validation` (the AB increment
    // removed the lowered-schema conveyance from `queryText`).
    const liveModel = deps.userVisible
      ? new LivePromptQueryModel({
          pi: deps.pi,
          ctx: deps.ctx,
          clock: root.clock,
          queryText,
          readMessages: deps.readMessages,
          activeTools,
          thetaAbort: deps.thetaAbort,
          governor: this.#promptToolLoopGovernor,
          maxRounds,
          // PIC-50/51 (queryerror-variants.md §provider derivation): the api-shaped
          // `.api` of the USER session's selected model (`ctx.model` — not the theta's
          // resolved `model:`, not the short ProviderId); "unknown" when undefined.
          // The RESPOND dispatch derives its own provider from the RESOLVED
          // RESPOND MODEL's `.api` inside `dispatchForcedRespondTurn` (bug 0010).
          provider: String(deps.ctx.model?.api ?? "unknown"),
          ...(respond !== undefined ? { respond } : {}),
        })
      : undefined;
    // Bug 0010 increment D: the off-session sibling (`subagent fn` in-process
    // path) runs the SAME two-phase shape over a HELD conversation — a real
    // `complete()` tool loop servicing model tool calls over the theta's
    // callable set (QRY-13), terminated by the shared off-session forced
    // respond dispatch. The callable set is PRESENTED (duck-read off the
    // frozen snapshot) and DISPATCHED (`#resolvePiToolForTheta`) separately,
    // matching the code-side resolution posture.
    const offModel =
      liveModel === undefined
        ? new OffSessionQueryModel({
            model: deps.ctx.model,
            queryText,
            signal: deps.signal,
            maxRounds,
            ...(respond !== undefined ? { respond } : {}),
            freePhaseTools: callableSetPresentedTools(deps.theta),
            resolveDispatch: (name: string) => this.#resolvePiToolForTheta(deps.theta, name),
            auth: () => resolveRegistryAuth(this.#input.modelRegistry, deps.ctx.model),
          })
        : undefined;
    const model: QueryModelDriver = liveModel ?? (offModel as OffSessionQueryModel);

    // The respond-repair follow-up drive (QRY-22 / QRY-14 ¶3), four arms with
    // explicit WHY (bug 0010 increments C+D):
    //  - LIVE TYPED (respond context present): each attempt RESTARTS the whole
    //    two-phase loop — the QRY-12 follow-up opens a fresh ON-SESSION free
    //    phase (respond tool active, capture re-armed, governor re-armed with a
    //    fresh budget) terminated by a FRESH off-session forced respond
    //    dispatch (query-tool-loop.md QRY-14 ¶3: follow-ups "restart the
    //    *whole* two-phase loop"). The old text-parse drive is retired here.
    //  - OFF-SESSION TYPED (increment D): the same restart over the HELD
    //    conversation — the QRY-12 follow-up joins it as a user message, the
    //    free-phase tool loop re-runs with a fresh budget, then a fresh forced
    //    respond dispatch terminates the attempt.
    //  - LIVE DEGRADED (typed but unlowerable annotation, `respond` absent):
    //    the pre-0010 fused streamed drive stays — there is no respond tool to
    //    force, so the follow-up reply text is parsed as the candidate payload,
    //    keeping typed behaviour total for unlowerable schemas.
    //  - OFF-SESSION DEGRADED: the fused single-turn `complete()` drive stays;
    //    the classified wrapper maps a provider failure to the discriminated
    //    `FollowUpDriveFailure` (bug 0007) so the proximate `QueryError`
    //    terminates repair instead of laundering into the schema-validation
    //    channel.
    // Untyped queries build no validation collaborator, so `driveFollowUp` is
    // never consulted for them.
    const driveFollowUp = (
      prompt: string,
    ): Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome> =>
      liveModel !== undefined && respond !== undefined
        ? liveModel.driveRepairAttempt(prompt)
        : liveModel !== undefined
          ? driveStreamedUserTurn({
              pi: deps.pi,
              ctx: deps.ctx,
              clock: root.clock,
              queryText: prompt,
              activeTools,
              provider: String(deps.ctx.model?.api ?? "unknown"),
            })
          : offModel !== undefined && respond !== undefined
            ? offModel.driveRepairAttempt(prompt)
            : offSessionFollowUp(deps.ctx.model, prompt);
    const validation =
      lowered !== undefined
        ? this.#buildTypedValidation(
            expr,
            env,
            deps.theta,
            driveFollowUp,
            lowered,
            // F6: the QRY-12 follow-ups must name the REGISTERED respond tool
            // (collision-disambiguated when applicable), byte-equal to the
            // forced choice. Absent only on the (unreachable-here) respond-less
            // arm — lowered !== undefined implies respond !== undefined.
            respond?.toolName,
          )
        : undefined;

    const config: QueryToolLoopConfig = {
      // Bug 0010: the restored two-phase path — live AND off-session
      // (increment D) — runs its free phase under the REAL
      // `tool_loop.max_rounds` cap (CIO-4). The `typed ? 0` collapse SURVIVES
      // only where the fused single-turn mechanism survives — the degraded
      // unlowerable-schema arm (reachable only via an empty `@<>`/whitespace
      // annotation; a recorded RESIDUAL of the bug-0010 fix, see the
      // forcedRespondTurn degraded arms and the bug doc's Fix §Residuals) —
      // because there `forcedRespondTurn` still IS the single fused turn and
      // a real free phase would double-dispatch it.
      maxRounds: typed && respond === undefined ? 0 : maxRounds,
      querySite: {
        file: deps.theta.slashName,
        line: expr.range.start.line,
        column: expr.range.start.column,
      },
      thetaSlashName: deps.theta.slashName,
      invocationId: root.idSource.newInvocationId(),
      occurredAt: root.clock.wallNow(),
    };

    // runtime-value-model.md §"Wire-name translation", the typed-query-results
    // boundary: the respond payload is MODEL-produced and reaches theta code as
    // the query's value, so it is translated after this query's own AJV verdict
    // and before it binds — `runQueryEffect`'s `"value"` arm is where the loop's
    // terminal forced-respond return AND its respond-repair arm converge, so
    // ONE call here covers both. Built only on the lowered arm — the degraded
    // unlowerable-annotation arm has no document to plan against and its
    // payload was never schema-checked either.
    const decodeInbound =
      lowered !== undefined
        ? (validated: unknown): ThetaValue =>
            decodeInboundValue({
              lowered: lowered as unknown as Record<string, unknown>,
              annotation: expr.schema as string,
              schemaNames: new Set(schemaDeclsOf(deps.theta.body).map((decl) => decl.name)),
              enumNames: new Set(enumDeclsOf(deps.theta.body).map((decl) => decl.name)),
              validated,
              schemaValidator: root.schemaValidator,
              // Bug 0337: this theta's OWN typed-query result retags its
              // `.theta`-declared enums with their file-qualified declaring
              // key, so a query result and a body-constructed variant of the
              // same declaration keep comparing equal.
              ...(deps.theta.sourcePath !== undefined
                ? { enumDeclaringPath: deps.theta.sourcePath }
                : {}),
            })
        : undefined;

    return {
      typed,
      renderedText,
      model,
      config,
      ...(validation !== undefined ? { schemaValidation: validation } : {}),
      ...(decodeInbound !== undefined ? { decodeInbound } : {}),
    };
  }

  /**
   * Bug 0010 (QRY-14 step 2): assemble the typed query's `RespondTurnContext`
   * — register (or cache-hit) the synthesised respond tool, resolve the
   * respond model, and close over auth / AJV / the early-respond capture
   * slot. Shared by BOTH drivers (increment D): the live driver arms the
   * capture host around its session turns; the off-session driver services
   * respond-tool calls itself over its held conversation and never arms it.
   */
  #buildRespondTurnContext(
    lowered: LoweredSchema,
    deps: {
      readonly ctx: ExtensionCommandContext;
      readonly theta: ConversationBindInput["theta"];
      readonly signal: AbortSignal;
    },
  ): RespondTurnContext {
    const { root, modelRegistry } = this.#input;
    const { slug, toolName } = this.#registerRespondTool(lowered);
    // The respond dispatch model (conversation-drive.md §Provider
    // compatibility; bug 0010): the theta-resolved `model:` — matched against
    // the registry's available set by the same exact-match rule the
    // binder-model resolution uses — falling back to the invocation-pinned
    // session model (`ctx.model`) when frontmatter omits `model:` or the
    // reference does not resolve.
    const modelRef = deps.theta.frontmatter.model;
    // WHY no `?? deps.ctx.model` on the resolved arm (bug 0010, fix round 1):
    // a PRESENT frontmatter `model:` that matches no available model is a
    // refusal, mirroring the binder's unresolved-reference posture — silently
    // substituting the session model would dispatch the respond turn against a
    // model the author explicitly steered away from. The respond context's
    // model stays `undefined` so `dispatchForcedRespondTurn` surfaces the
    // existing model-unavailable transport `Err`. `ctx.model` is the fallback
    // ONLY when frontmatter omits `model:` entirely.
    const respondModel =
      modelRef !== undefined
        ? matchAvailableModel(modelRef, modelRegistry.getAvailable())
        : deps.ctx.model;
    // Bug 0010 increment C (conversation-drive.md §"Provider compatibility for
    // typed queries"): the RUNTIME provider gate. A typed dispatch whose
    // resolved respond model's api is outside the supported set must refuse
    // BEFORE any provider turn — pi-ai exposes no named-tool toolChoice mapping
    // for that api, so driving the free phase would waste a turn on a query
    // whose forced respond dispatch cannot be forced. The gate error is carried
    // on the context and short-circuited by the driver at both entry points
    // (round 0 and the `max_rounds: 0` forcedRespondTurn). A model-less context
    // (`undefined`) is NOT gated here — `dispatchForcedRespondTurn` owns the
    // model-unavailable transport refusal.
    const gateError =
      respondModel !== undefined &&
      !(TYPED_QUERY_SUPPORTED_PROVIDER_APIS as readonly string[]).includes(
        String(respondModel.api),
      )
        ? synthesizeUnsupportedProviderTransportError(String(respondModel.api))
        : undefined;
    return {
      slug,
      toolName,
      lowered,
      ...(gateError !== undefined ? { gateError } : {}),
      // QRY-15 names the REGISTERED tool (bug 0010 fix review, F6): under a
      // PIC-44 slug collision `toolName` is the disambiguated minted name and
      // the instruction must reference it byte-equal to the forced choice —
      // never the bare recipe-derived `__theta_respond_<slug>`.
      //
      // The conveyed schema is the tool's WIRE schema (bug 0028 §Fix), not the
      // bare lowered one: for a non-object root the tool accepts the
      // single-property envelope, and an instruction describing a shape the
      // tool rejects would send the model into a repair spin it cannot escape.
      // One recipe (`respondToolWireSchema`) feeds the registration, the
      // presented entry and this template, so they cannot disagree.
      template: renderInitialRespondTurn({
        loweredSchema: respondToolWireSchema(lowered),
        slug,
        toolName,
      }),
      model: respondModel,
      // Auth threading copied from `#completeBinderReply` (bug 0010): the
      // out-of-band `complete()` free function does not inherit the session's
      // resolved credentials, so the respond dispatch resolves apiKey/headers
      // off the model registry when the auth resolution succeeds. Resolution
      // PROBES for the optional capability (increment D) — see
      // `resolveRegistryAuth`.
      auth: () => resolveRegistryAuth(modelRegistry, respondModel),
      signal: deps.signal,
      // The early-respond `execute`'s AJV verdict over the SAME lowered schema
      // the loop validates against (QRY-14: the respond tool's execute
      // AJV-validates the call payload).
      validate: (payload: unknown) => {
        const verdict = root.schemaValidator.compile(lowered).validate(payload);
        if (verdict.ok) {
          return { ok: true };
        }
        // The `<path> <message>` join mirrors the QRY-12 `<ajv-summary>` form so
        // the model can correct in-turn from the same vocabulary.
        return {
          ok: false,
          message: verdict.errors
            .map((error) => `${error.instancePath} ${error.message}`.trim())
            .join("; "),
        };
      },
      captureHost: {
        setActiveCapture: (capture): void => {
          this.#activeRespondCapture = capture;
        },
        clearActiveCapture: (): void => {
          this.#activeRespondCapture = null;
        },
      },
    };
  }

  /**
   * Bug 0010 (PIC-44): register the synthesised one-shot respond tool for a
   * lowered response schema through the producer's registration cache. The
   * slug is `respondSchemaSlug` — the SAME recipe that names the QRY-12/QRY-15
   * template references — and the stored bytes are the CANONICAL form (bug
   * 0099), so a byte-equal schema re-uses the registration and a slug
   * collision registers under a disambiguated name. NOTE the cache's
   * `registerTool` callback receives the MINTED name (base or disambiguated) —
   * the `ToolDefinition` is built with that name.
   */
  #registerRespondTool(lowered: LoweredSchema): {
    readonly slug: string;
    readonly toolName: string;
  } {
    const slug = respondSchemaSlug(lowered);
    const toolName = registerToolInCache(
      this.#respondRegistrationCache,
      { kind: "respond", slug, canonicalFormBytes: canonicalForm(toLoweredJsonValue(lowered)) },
      {
        registerTool: (name) =>
          this.#input.pi.registerTool(this.#buildRespondToolDefinition(name, lowered)),
        emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
      },
    );
    return { slug, toolName };
  }

  /**
   * Bug 0010 (QRY-14 step 2): the pi `ToolDefinition` for one synthesised
   * respond tool. `label` is the fixed `deriveToolLabel` literal, `parameters`
   * wrap the response schema's WIRE form, and `execute` dispatches through the
   * producer's capture slot — the registration is PERMANENT (pi exposes no
   * unregister), so the slot indirection is what scopes it to a live typed turn.
   *
   * Bug 0028 §Fix, the two wire-contract obligations of a HOST-validated tool
   * (pi-agent-core validates `arguments` against `parameters` before `execute`
   * runs, so anything the schema rejects is fed back as a tool error and
   * repair-spun):
   *  - `parameters` is `respondToolWireSchema(lowered)` — a non-object lowered
   *    root (a declared `enum`, `@<string>`) is enveloped, because no argument
   *    object can ever satisfy such a root;
   *  - `prepareArguments` is pi's own sanctioned pre-validation shim (its
   *    `edit` tool uses it for the identical model behaviour): a nested
   *    object/array parameter delivered as a JSON-encoded string is parsed back
   *    before the host validates, instead of failing `must be object` forever.
   */
  #buildRespondToolDefinition(name: string, lowered: LoweredSchema): ToolDefinition {
    const wire = respondToolWireSchema(lowered);
    return {
      name,
      label: deriveToolLabel({ kind: "typed-query-respond" }),
      description: RESPOND_TOOL_DESCRIPTION,
      parameters: Type.Unsafe<unknown>(wire),
      prepareArguments: (args: unknown) => coerceRespondWireArguments(wire, args),
      execute: async (_toolCallId, params) => this.#executeRespondTool(name, lowered, params),
    };
  }

  /**
   * Bug 0010: one respond-tool `execute` dispatch. Dispositions, in order:
   * no armed capture (or a different query's tool) → inert error result;
   * CIO-3 depth walk BEFORE AJV (a depth-6+ payload is fed back, never
   * validated); AJV-invalid → error result carrying the issue summary so the
   * model can correct in-turn; valid → ONE-SHOT capture ("final answer
   * recorded") — a repeat valid call is acknowledged inertly ("already
   * recorded", not an error) so the first valid call wins.
   */
  async #executeRespondTool(
    toolName: string,
    lowered: LoweredSchema,
    params: unknown,
  ): Promise<RespondToolExecuteResult> {
    const capture = this.#activeRespondCapture;
    if (capture === null || capture.toolName !== toolName) {
      return respondToolExecuteResult("no typed query is active for this respond tool", true);
    }
    // Bug 0028 §Fix: the arguments are the tool's WIRE form — the envelope for a
    // non-object lowered root — so the candidate payload is recovered before
    // anything downstream sees it. The depth walk then measures the PAYLOAD, as
    // it did before the envelope existed, rather than charging CIO-3 for a wire
    // artifact.
    const payload = respondPayloadFromWire(lowered, params);
    // CIO-3 (ceilings-3-and-4.md, model-driven row): depth-walk the
    // model-produced payload BEFORE AJV; a depth-6+ document is fed back as a
    // tool-error result with the canonical depth message and never validated.
    const argDepthBreach = enforceModelToolArgDepth(payload);
    if (argDepthBreach !== undefined) {
      return respondToolExecuteResult(argDepthBreach.message, true);
    }
    const verdict = capture.validate(payload);
    if (!verdict.ok) {
      return respondToolExecuteResult(verdict.message, true);
    }
    if (!capture.captured) {
      capture.captured = true;
      capture.payload = payload;
      return respondToolExecuteResult(RESPOND_CAPTURED_TEXT, false);
    }
    return respondToolExecuteResult(RESPOND_REPEAT_TEXT, false);
  }

  /**
   * Build the typed-query schema-validation collaborator (QRY-22) for a typed
   * `@`-query: assemble the `TypedQuerySchemaValidation` over the root's AJV
   * `SchemaValidator` and the `V13d` respond-repair loop for the PRE-LOWERED
   * declared schema (bug 0010: the caller lowers once and shares the result
   * with the respond-tool registration and the QRY-15 template, avoiding a
   * double lowering), threading the mode's follow-up turn drive.
   */
  #buildTypedValidation(
    expr: QueryExpr,
    env: LexicalEnvironment,
    theta: ConversationBindInput["theta"],
    driveFollowUp: (
      prompt: string,
    ) => Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome>,
    lowered: LoweredSchema,
    respondToolName?: string,
  ): TypedQuerySchemaValidation {
    return buildTypedQueryValidation({
      lowered,
      resolveShape: resolveDeclaredShape(expr, env),
      schemaValidator: this.#input.root.schemaValidator,
      attempts: theta.frontmatter.respondRepair?.attempts ?? 3,
      maxRounds: theta.frontmatter.toolLoop?.maxRounds ?? 25,
      driveFollowUp,
      // F6: QRY-12 template references stay byte-equal to the REGISTERED
      // (possibly collision-disambiguated) respond-tool name.
      ...(respondToolName !== undefined ? { respondToolName } : {}),
    });
  }

  /**
   * H8b call-kind routing. A `<name>(args)` call whose callee resolves to a
   * `.theta`-callable in the theta's callable set (frontmatter `tools:`) is
   * semantically an invoke; every other call is a Pi tool. The resolution is
   * against the callable set alone — a name bound to a `./x.theta` entry routes
   * to the invoke spawn-and-drive path, all else to the tool-`execute` path.
   */
  #classifyCall(
    theta: ConversationBindInput["theta"],
    expr: CallExpr,
  ): "pi-tool" | "theta-callable" {
    return thetaCalleePath(theta, expr.callee) !== undefined ? "theta-callable" : "pi-tool";
  }

  /**
   * H8b live tool-call resolver. Resolve `expr.callee` against the theta's frozen
   * `tools:` callable set (QTL-2 runtime enforcement) and return a
   * `CodeSideToolCall` whose `dispatch()` invokes the resolved host tool's
   * `execute(...)` (V14g lowering turns a clean resolve into `Ok(text)`, a throw
   * into `Err(CodeToolError{cause:"execution"})`). A callable name that is NOT
   * in the set (or resolves to no host tool) throws `UnknownHostToolError` from
   * `dispatch()`, lowering to the code-tool `Err` rather than executing an
   * ambient host tool or fabricating a value.
   */
  #resolveToolCall(
    theta: ConversationBindInput["theta"],
    expr: CallExpr,
    env: LexicalEnvironment,
    signal: AbortSignal,
    evaluatedToolArgs?: Record<string, ThetaValue>,
  ): CodeSideToolCall {
    const toolName = expr.callee;
    const tool = this.#resolvePiToolForTheta(theta, toolName);
    // RFC 0002: when the executor has already evaluated the Pi-tool argument's
    // computed field values left-to-right (nested effects / `?`), those concrete
    // values ARE the params object; otherwise lower the inline object literal's
    // pure field values here.
    const params = evaluatedToolArgs ?? lowerToolCallParams(expr, env);
    // Ceiling #4 (hard-ceilings/ceilings-3-and-4.md#ceiling-4-table, the
    // code-driven tool-call args row; schema-subset.md §Depth Enforcement
    // point #3; CIO-3 depth-walk-before-AJV): enforce the JSON-document
    // depth-≤5 cap on the CONSTRUCTED argument value — the single object-literal
    // params object the tool receives — before AJV and before the tool executes.
    // A depth-6+ argument surfaces to theta code as
    // `Err(CodeToolError { cause: "validation" })`, carried on the returned
    // `CodeSideToolCall` so `runCodeSideToolCall` short-circuits without ever
    // dispatching `execute()`. `params` IS the sole positional argument (a Pi
    // tool call takes exactly one object literal), so the walk runs over it
    // directly — walking `expr.args` (an array wrapper) would add a spurious
    // level and false-trip a legitimately within-cap params object. Mirrors the
    // invoke `params`-boundary breach `enforceInvokeParamsDepth` surfaces in
    // `#driveCallee`, differing only in the carrier (`CodeToolError` vs
    // `InvokeInfraError`) per the per-boundary table.
    const argDepthBreach = enforceCodeToolArgDepth(toolName, params);
    // Bug 0072 §Fix runtime half (a): the pre-dispatch input-schema check,
    // AFTER the depth walk and only when it raised no breach (CIO-3 pins
    // depth-walk-before-AJV, so the two `cause: "validation"` producers never
    // both fire for one call — the depth breach wins).
    const argSchemaViolation =
      argDepthBreach === undefined
        ? this.#checkPiToolArgSchema(toolName, tool?.parameters, params)
        : undefined;
    const toolCallId = `theta-direct:${this.#input.root.idSource.newInvocationId()}`;
    return {
      toolName,
      committed: [],
      ...(argDepthBreach !== undefined
        ? { argDepthBreach: { result: argDepthBreach.result, error: argDepthBreach.error } }
        : {}),
      ...(argSchemaViolation !== undefined ? { argSchemaViolation } : {}),
      dispatch: (): Promise<AgentToolResultEnvelope> => {
        // PIC-64 (#subagent-host-loop-dispatch): an EXTENSION tool's snapshot
        // entry pins only the tool's name + `parameters` schema — the public
        // extension API strips `execute` — so an execute-less `pi-tool` entry
        // classifies as extension-shaped and routes through the code-side
        // dispatch ladder in BOTH modes (the prompt parent leg against the
        // user's live host session, and the subagent child leg alike; the
        // classification is not regime-gated). The dispatched request carries
        // the entry's UNDERLYING `toolName` — the only name the host registry /
        // active set knows; `as` renames are theta-side presentation only.
        if (tool === undefined) {
          // A name the frozen snapshot does not hold at all — unreachable from
          // a REGISTERED theta: parse rejects an out-of-scope callee
          // (`theta/parse/unknown-identifier`) and load-time admission froze
          // every `tools:` name into the snapshot, so only a caller that
          // bypasses load admission (a harness fixture, e.g. the child-leg
          // wiring suites) can present one. The two arms differ because the
          // QTL-2 ambient-execution EXPOSURE differs per backing session, not
          // because QTL-2 binds less in the child:
          //  - regime inactive (parent): the backing session is the USER's
          //    live session carrying the full ambient tool set — routing an
          //    un-snapshotted name through the host loop could execute an
          //    ambient tool the theta never declared, so the QTL-2 rejection
          //    stands.
          //  - regime active (subagent-root child): PIC-58 bounds the child
          //    session's tools to the callable set's HOST-tool half (the
          //    `--tools` allowlist derived from the same snapshot — `.theta`
          //    names never enter it, bug 0218), so no undeclared ambient tool
          //    exists for the host loop to execute — ladder routing cannot
          //    widen reach (an outside-the-allowlist name reads back the
          //    fail-closed isError no-result) and stays the PIC-64 rung-3
          //    fail-closed floor the child-leg wiring suites drive, never a
          //    fabricated value.
          const regime = this.#input.subagentRootRegime ?? { active: false as const };
          if (regime.active) {
            return this.#dispatchExtensionToolViaLadder(toolName, params, signal);
          }
          return Promise.reject(
            new UnknownHostToolError(`code-side call names no resolvable host tool '${toolName}'`),
          );
        }
        if (typeof tool.execute !== "function") {
          return this.#dispatchExtensionToolViaLadder(tool.toolName, params, signal);
        }
        // CANCEL-3 (cancellation.md §swallowing-handler attachment): attach the
        // swallowing handler to the underlying code-side `execute()` Promise at
        // its construction site, before the first microtask boundary, so a late
        // rejection arriving after the `tool-call` checkpoint surfaced
        // `cause: "cancelled"` is absorbed and never reaches Node's
        // `unhandledRejection` process event.
        return guardToolExecutePromise(
          tool.execute(toolCallId, params, signal),
          signalGuard(signal),
          noopSwallowChannels(),
        );
      },
    };
  }

  /**
   * Bug 0072 §Fix runtime half (a) — the runtime AJV check tool-calls.md
   * §"Argument shape" names as the safety net: compile and run the resolved
   * tool's registered `parameters` schema against the constructed `params`
   * object, returning the `Err(CodeToolError { cause: "validation" })` carrier
   * on a rejection, or `undefined` on a pass. Fail-open (also `undefined`)
   * when `parameters` is absent or is not a plausible JSON-Schema object (an
   * entry that registers no input schema — cells E6/E7 of
   * tests/tool-arg-runtime-schema-validation.test.ts pin this direction) or
   * when the injected validator seam is absent.
   *
   * The seam-absence arm is unreachable in production: `createRuntimeRoot`
   * (src/runtime-root.ts) always constructs a `RuntimeRoot` with a
   * `schemaValidator`. It exists so a partial harness `RuntimeRoot` double
   * (several pre-existing test fixtures construct one with no
   * `schemaValidator`) degrades to the pre-existing no-check path instead of
   * throwing `TypeError: Cannot read properties of undefined (reading
   * 'compile')` — symmetric with the fail-open on a tool that registers no
   * `parameters`. Defensive-branch house style in this file: see the
   * `hostLoopDispatch === undefined` "Defensive: … (Unreachable when the
   * probe is derived from the seam)" arm in `#dispatchExtensionToolViaLadder`
   * below.
   */
  #checkPiToolArgSchema(
    toolName: string,
    parameters: unknown,
    params: Record<string, unknown>,
  ): { readonly result: ResultValue; readonly error: CodeToolError } | undefined {
    if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
      return undefined;
    }
    const validator = this.#input.root.schemaValidator;
    if (typeof validator?.compile !== "function") {
      return undefined;
    }
    const verdict = validator.compile(parameters as LoweredSchema).validate(params);
    if (verdict.ok) {
      return undefined;
    }
    return buildCodeToolArgSchemaViolation(toolName, verdict.errors);
  }

  /**
   * PIC-64. Code-side extension-tool dispatch through the probe-asserted,
   * fail-closed ladder — MODE-INDEPENDENT (the shared adapter for the prompt
   * parent leg and the subagent child leg): prefer the upstream
   * `getToolDefinition` rung when available, else host-loop dispatch; with
   * NEITHER rung available the invocation refuses with
   * `theta/load/extension-tool-unreachable` (the runtime never silently falls
   * through). Host-loop dispatch itself is the injected `hostLoopDispatch` seam
   * (a live-only mechanism, behind the leaf-tested `dispatchViaHostLoop`
   * contract); its result is adapted to the tool-result envelope shape the
   * code-side lowering consumes, and a seam rejection propagates unwrapped so
   * the V14g execute-throw lowering carries its message (Resolution snapshot:
   * a pinned handle unusable at call time raises a precise `CodeToolError`).
   *
   * DEFENCE-IN-DEPTH backstop: PIC-64 rung 3 is enforced at LOAD (option (a),
   * `checkExtensionToolReachability`), which walks the ROOT body's code-side call
   * sites (direct + local-`fn`), so a REGISTERED theta cannot reach this refusal
   * with an unreachable extension tool its own code names — the load-time check
   * already un-registered it. A transitive-import code-side call cannot arise
   * either: an imported `.thetalib` `fn` naming a caller-scoped extension tool
   * fails `.thetalib` parse with `theta/parse/unknown-identifier` and un-registers
   * the importer before this producer runs. This runtime rung is retained as the
   * fail-closed floor for any path that bypasses the load check.
   */
  async #dispatchExtensionToolViaLadder(
    toolName: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<AgentToolResultEnvelope> {
    const probe: DispatchLadderProbe = this.#input.dispatchLadderProbe ?? {
      getToolDefinitionAvailable: false,
      hostLoopAvailable: this.#input.hostLoopDispatch !== undefined,
    };
    const ladder = resolveDispatchLadder(toolName, probe);
    if (ladder.kind === "unreachable") {
      // Fail-closed: no code-side dispatch rung. Surface the pinned refusal
      // diagnostic and reject so the code-side lowering yields an `Err` — never a
      // fabricated value, never a silent model-only fallthrough.
      (this.#input.emitDiagnostic ?? ((): void => {}))(ladder.diagnostic);
      throw new UnknownHostToolError(ladder.diagnostic.message);
    }
    // Route by the RESOLVED rung — the ladder's choice IS the routing decision
    // (PIC-64 pins the rung-1-preferred ordering as normative; dispatching
    // through a rung the ladder did not choose would silently reorder it).
    if (ladder.rung === "get-tool-definition") {
      // No rung-1 dispatcher is implemented at the pin, and the composition
      // root records rung-1 availability as surface AND dispatcher — so this
      // resolution can only come from a probe that recorded the rung without a
      // dispatcher behind it (a harness shape). Refuse precisely rather than
      // fabricate or reroute; a landed rung-1 dispatcher slots its dispatch in
      // here.
      throw new UnknownHostToolError(
        `extension tool '${toolName}' resolved the get-tool-definition rung but no rung-1 dispatcher is wired`,
      );
    }
    const dispatch = this.#input.hostLoopDispatch;
    if (dispatch === undefined) {
      // Defensive: the probe reported the host-loop rung but no seam is wired —
      // refuse rather than fabricate. (Unreachable when the probe is derived
      // from the seam.)
      throw new UnknownHostToolError(
        `extension tool '${toolName}' host-loop dispatch seam is not wired`,
      );
    }
    const request: EncodedToolRequest = { toolName, args: params };
    // Thread the code-side tool-call abort signal into host-loop dispatch so a
    // thetaAbort mid-fabricated-turn releases the settle barrier and the model
    // is restored (PIC-64 cancellation) rather than left on the bridge.
    const hostResult = await dispatch(request, signal);
    // F-1578 (host-interfaces-core.md §"Tool execution from theta code"): the
    // code-side `AgentToolResultEnvelope` carries NO `isError` — lowering an
    // isError result to a `{ content }` envelope would let `routeToolReturnShape`
    // fabricate `Ok(text)` from a failed tool. THROW the joined host text
    // instead, so the standard V14g execute-throw lowering yields
    // `Err(CodeToolError { cause: "execution" })` carrying the host text
    // (tool-calls.md: the `execution` cause covers "returned `isError: true`";
    // PIC-64 (d): the read-back's `isError` is preserved to code).
    if (hostResult.isError) {
      const text = hostResult.content
        .map((block) => (block.type === "text" && block.text !== undefined ? block.text : ""))
        .filter((t) => t.length > 0)
        .join("\n");
      throw new Error(
        text.length > 0 ? text : `extension tool '${toolName}' reported isError with no text`,
      );
    }
    // Adapt the host-loop result to the `content`-only envelope the code-side
    // lowering consumes.
    return {
      content: hostResult.content.map((block) =>
        block.text !== undefined ? { type: block.type, text: block.text } : { type: block.type },
      ),
    };
  }

  /**
   * QTL-2. Resolve a code-driven callable name against the theta's frozen `tools:`
   * callable set: the name must be a `pi-tool` entry in the snapshot, and the
   * call dispatches through that entry's HELD `PiToolDispatch` reference — the
   * runtime never re-queries Pi's tool registry by name
   * (frontmatter-fields-b-and-templates.md §Resolution snapshot). A name absent
   * from the set (or bound to a `.theta` callee, which `#classifyCall` routes to
   * the invoke path instead) resolves to `undefined`, so the code-side path
   * surfaces the unavailable-tool `Err` rather than executing an ambient tool.
   * Honours `as`-renames because the snapshot is keyed by the post-rename
   * callable name.
   *
   * A theta carrying no snapshot (an in-memory harness fixture) falls back to the
   * producer-wide `resolvePiTool` collaborator — production discovered thetas
   * always carry a (possibly empty) snapshot, so the fallback never widens a
   * real theta's ambient reach.
   */
  #resolvePiToolForTheta(
    theta: ConversationBindInput["theta"],
    callableName: string,
  ): PiToolDispatch | undefined {
    const callableSet = theta.callableSet;
    if (callableSet === undefined) {
      return this.#input.resolvePiTool?.(callableName);
    }
    const entry = callableSet.entries.get(callableName);
    if (entry === undefined || entry.kind !== "pi-tool") {
      return undefined;
    }
    return entry.toolDefinition as PiToolDispatch;
  }

  /**
   * H8b live invoke resolver for an `invoke("./x.theta", ...args)` expression:
   * bind the positional args, resolve+parse the callee against the caller's
   * directory, spawn/drive it, and return its top-level `Result` (FN-5).
   */
  #resolveInvoke(
    theta: ConversationBindInput["theta"],
    expr: InvokeExpr,
    env: LexicalEnvironment,
    ctx: ExtensionCommandContext,
    chain: InvokeChain,
    parentSignal: AbortSignal,
    /** The invoking theta's own `mode:` — selects the cross-mode attach cell. */
    callerMode: ThetaMode,
  ): InvokeChild {
    // `expr.args[0]` is the callee path literal; the remaining args are the
    // positional invocation arguments bound to the callee's params.
    const argValues = expr.args.slice(1).map((arg) => evaluatePureExpression(arg, env));
    // INV-6: the `invoke<Schema>` return annotation drives the runtime AJV
    // return-value validation on the child's `Ok` payload (invocation.md §Typed
    // return; hard-ceilings ceiling #4). invocation.md §"Typed return": untyped
    // `invoke(...)` carries no return type at all, so no schema is derived for
    // it here.
    return this.#buildInvokeChild(
      theta,
      expr.path,
      argValues,
      ctx,
      chain,
      expr.returnSchema !== null
        ? { kind: "annotated", annotation: expr.returnSchema }
        : { kind: "untyped" },
      parentSignal,
      callerMode,
    );
  }

  /**
   * H8b live invoke resolver for a `.theta`-callable `<name>(args)` call: resolve
   * the callee path from the callable set, bind the positional args, and drive
   * the callee, returning its typed top-level `Result` across the boundary
   * (FN-5).
   */
  #resolveCallAsInvoke(
    theta: ConversationBindInput["theta"],
    expr: CallExpr,
    env: LexicalEnvironment,
    ctx: ExtensionCommandContext,
    chain: InvokeChain,
    parentSignal: AbortSignal,
    /** The invoking theta's own `mode:` — threaded to `#driveCallee`. */
    callerMode: ThetaMode,
  ): InvokeChild {
    const calleePath = thetaCalleePath(theta, expr.callee) ?? `./${expr.callee}.theta`;
    const argValues = expr.args.map((arg) => evaluatePureExpression(arg, env));
    // A `.theta`-callable call through `tools:` carries no `invoke<Schema>`
    // annotation, so there is no parse-time return-type site. tool-calls.md
    // §"Return type" types the row by INFERENCE over the statically resolved
    // callee instead, which `#driveCallee` derives once the callee is parsed.
    return this.#buildInvokeChild(
      theta,
      calleePath,
      argValues,
      ctx,
      chain,
      { kind: "callee-inferred" },
      parentSignal,
      callerMode,
    );
  }

  /** Build the `InvokeChild` whose `drive()` parses, spawns, and drives the callee. */
  #buildInvokeChild(
    theta: ConversationBindInput["theta"],
    calleePath: string,
    argValues: readonly ThetaValue[],
    ctx: ExtensionCommandContext,
    chain: InvokeChain,
    returnTyping: InvokeReturnTyping,
    parentSignal: AbortSignal,
    callerMode: ThetaMode,
  ): InvokeChild {
    return {
      calleePath,
      committed: [],
      drive: (): Promise<ResultValue> => {
        // INV-4 / ceiling #1 (invocation.md §INV-4, CIO-2): push a countable
        // frame BEFORE the callee body runs. The cap is breached when about to
        // push the 33rd frame; the nested overflow surfaces to this invoke
        // parent as `Err(InvokeInfraError{cause:"panic"})` — the runtime backstop
        // that (with load-time cycle detection) bounds a self-referential theta.
        let childChain: InvokeChain;
        try {
          childChain = pushCountableFrame(chain, "direct-invoke");
        } catch (panic) { // allow-broad-catch: theta/runtime/invoke-depth-exceeded — hard-ceilings.md
          // Narrow-and-rethrow: only the ceiling panic is handled (surfaced as
          // the nested Err backstop); any other throw propagates unchanged.
          if (panic instanceof InvokeDepthExceededPanic) {
            const surfaced = surfaceDepthOverflow(panic, {
              topLevel: false,
              calleePath,
            });
            if (surfaced.mode === "nested") {
              return Promise.resolve(makeErr(surfaced.error as unknown as ThetaValue));
            }
          }
          throw panic;
        }
        // CANCEL-3 (cancellation.md §swallowing-handler attachment): attach the
        // swallowing handler to the `invoke` child's top-level execution Promise
        // at its construction site, before the first microtask boundary, so a
        // late rejection after the `invoke` checkpoint surfaced cancellation is
        // absorbed and never reaches Node's `unhandledRejection` process event.
        return guardInvokeExecutionPromise(
          this.#driveCallee(
            theta,
            calleePath,
            argValues,
            ctx,
            childChain,
            returnTyping,
            parentSignal,
            callerMode,
          ),
          signalGuard(parentSignal),
          noopSwallowChannels(),
        );
      },
    };
  }

  /**
   * Parse the callee `.theta`, spawn a fresh isolated subagent session for it
   * (V15l: a subagent callee spawns fresh; the caller's settings are not
   * inherited), bind the positional args onto its declared params, run its body
   * through the executor, and surface its top-level `Result` (FN-5). An
   * unparseable / missing callee surfaces `Err(InvokeInfraError{cause:
   * "load_failure"})` — never a fabricated `Ok(null)`.
   */
  async #driveCallee(
    theta: ConversationBindInput["theta"],
    calleePath: string,
    argValues: readonly ThetaValue[],
    ctx: ExtensionCommandContext,
    chain: InvokeChain,
    returnTyping: InvokeReturnTyping,
    parentSignal: AbortSignal,
    callerMode: ThetaMode,
  ): Promise<ResultValue> {
    // INV-1 (invocation.md §Resolution): re-run the realpath + discovery-root
    // containment check at the moment the runtime opens the callee,
    // against the *currently* active roots. An escape fails closed with
    // `Err(InvokeInfraError{cause:"load_failure"})` — the runtime backstop to the
    // load-time `theta/load/invoke-path-escape` guard.
    // Ceiling #4 (hard-ceilings/ceilings-3-and-4.md#ceiling-4-table, the
    // `params` / `invoke(...)` row; CIO-3 depth-walk-before-AJV): enforce the
    // JSON-document depth-≤5 cap at the runtime `invoke(...)` `params` argument
    // boundary. Each positional arg is a JSON document in its own right, so the
    // walk runs per-arg (a legitimate depth-5 arg stays valid; walking a wrapper
    // object would false-trip it); a depth-6+ arg surfaces to the invoke parent
    // as `Err(InvokeInfraError { cause: "validation" })` — distinct from ceiling
    // #1 chain-depth. Runs before the containment re-check / callee load so a
    // caller-side depth breach is reported regardless of callee state.
    for (const argValue of argValues) {
      const breach = enforceInvokeParamsDepth(calleePath, argValue);
      if (breach !== undefined) {
        return breach.result;
      }
    }

    const escape = await this.#recheckCalleeContainment(theta, calleePath);
    if (escape !== undefined) {
      return makeErr(escape as unknown as ThetaValue);
    }
    const callee = await this.#input.parseCallee?.(theta.sourcePath, calleePath);
    if (callee === undefined) {
      const error: InvokeInfraError = {
        kind: "invoke_infra",
        message: `invoke callee '${calleePath}' could not be loaded`,
        callee_path: calleePath,
        cause: "load_failure",
      };
      return makeErr(error as unknown as ThetaValue);
    }
    // tool-calls.md §"Return type" (registered-theta row): the return type of a
    // `.theta`-callable call is the callee's INFERRED return type, which is
    // legible only now that the callee is parsed — and it resolves against the
    // CALLEE's own `schema` / `enum` declarations, not the caller's, because it
    // is the callee's type. An `invoke<Schema>` annotation is the caller's and
    // keeps resolving there.
    const returnSite = this.#resolveReturnSite(theta, returnTyping, callee);
    const paramNames = callee.frontmatter.params?.fields.map((field) => field.wireName) ?? [];
    const paramBindings = new Map<string, ThetaValue>();
    paramNames.forEach((name, index) => {
      paramBindings.set(name, argValues[index] ?? null);
    });
    // Prompt→prompt cross-mode cell (invocation.md §Cross-mode semantics): an
    // `invoke`d prompt-mode callee whose caller is ALSO prompt-mode ATTACHES to
    // the caller's current user session — its queries stream as user-visible
    // turns in the same conversation, not a fresh isolated spawn. The parent
    // suspends at the call site until the child settles (the executor awaits
    // this Promise, so the suspend is structural), and the child's callable set
    // replaces the parent's for the child's WHOLE body (the PIC-17 per-query
    // snapshot/restore generalised to the body window, owned by
    // `runPromptSuspendInvoke`); the ambient snapshot is restored on every settle
    // path — success, returned `Err`, cancel, or throw — with the inner failure
    // surfaced unmasked. CANCEL-5: the child binding derives its `thetaAbort` from
    // `parentSignal` (downward-only). Every other cell (a subagent-mode callee,
    // or a subagent-mode caller) spawns fresh below.
    if (callerMode === "prompt" && callee.frontmatter.mode === "prompt") {
      const childBinding = this.bindPromptConversation({
        theta: callee,
        args: "",
        ctx,
        paramBindings,
        chain,
        parentSignal,
      });
      // Decision 6 / Increment B1: the child bind registered an
      // ActiveInvocationRegistry entry; the `finally` calls its
      // `finishInvocation` AFTER the child body (`runPromptSuspendInvoke`, whose
      // `childBody` runs `executeBody`) + the INV-6 return validation, so the
      // entry SPANS the nested callee's real in-flight window.
      try {
        const outcome = await runPromptSuspendInvoke<ResultValue>({
          cell: { callerMode: "prompt", calleeMode: "prompt" },
          childCallableSet: callableSetPiToolNames(callee),
          pi: this.#input.pi,
          childBody: async () => {
            const execution = await executeBody(callee.body, childBinding.executeDeps);
            // FN-5 (invocation.md §Final-value propagation across callees): an
            // invoke callee returns its body's terminal FINAL VALUE across the
            // boundary — NOT the PIC-53 trailing-turn text that
            // `childBinding.surface` computes for a top-level prompt dispatch.
            // The callee's user-visible turns already streamed into the shared
            // session; the value that flows back to the parent is the tail
            // expression, surfaced by the same FN-5 projection as the subagent
            // path.
            return surfaceCalleeFinalValue(execution);
          },
        });
        // INV-6 (invocation.md §Typed return): apply the `invoke<Schema>` return
        // validation to the child's `Ok` payload, exactly as the spawn path below.
        return this.#validateInvokeReturn(
          calleePath,
          returnSite,
          outcome.result,
          callee.sourcePath,
        );
      } finally {
        childBinding.finishInvocation?.();
      }
    }

    // CANCEL-5 (cancellation.md §`invoke(...)` entry): hand the parent's
    // `thetaAbort.signal` to the child binding so it constructs its `thetaAbort`
    // as a DERIVED controller (downward-only: the child aborts when the parent
    // aborts, never the reverse — `deriveChildThetaAbort`).
    const binding = await this.spawnSubagentConversation({
      theta: callee,
      args: "",
      ctx,
      paramBindings,
      chain,
      parentSignal,
    });
    // Decision 6 / Increment B1: the spawn bind registered an
    // ActiveInvocationRegistry entry; the `finally` calls its `finishInvocation`
    // AFTER `executeBody` + `surface` (which runs the spawned session's
    // `dispose()`) + the INV-6 return validation, so the entry SPANS the nested
    // subagent callee's real in-flight window and its barrier settles
    // post-dispose.
    try {
      // RFC-0006 (PIC-59): a subagent-mode callee runs its whole body in the
      // spawned child; the parent resolves the invocation through the binding's
      // self-contained `drive()` (launch → await envelope → map), NOT by running
      // `executeBody` in-parent. `drive` is always present on the subagent
      // binding; `surface(executeBody(...))` is the harness fallback.
      const result =
        binding.drive !== undefined
          ? await binding.drive()
          : binding.surface(await executeBody(callee.body, binding.executeDeps));
      // INV-6 (invocation.md §Typed return; hard-ceilings ceiling #4): AJV-validate
      // the child's returned value against the `invoke<Schema>` annotation. A
      // mismatch (e.g. a `string` under `invoke<number>`) is
      // `Err(InvokeInfraError{cause:"return_validation"})`, aborting the parent.
      return this.#validateInvokeReturn(calleePath, returnSite, result, callee.sourcePath);
    } finally {
      // PIC-65: await the (idempotent, non-throwing) child-process teardown BEFORE
      // `finishInvocation`, so the child is killed / has exited (abort listener
      // detached, `disposeBarrier` settled on observed exit) on EVERY exit —
      // including a genuine throw unwinding past `surface` — before the registry
      // entry is removed.
      await binding.teardown?.();
      binding.finishInvocation?.();
    }
  }

  /**
   * INV-1 (invocation.md §Resolution) runtime re-check: resolve the callee path
   * against the caller's directory and re-run the shared realpath +
   * discovery-root containment check against the currently-active roots. Returns
   * the `load_failure` `InvokeInfraError` on escape, or `undefined` when
   * contained (or when the production seams needed for the check are absent).
   */
  async #recheckCalleeContainment(
    theta: ConversationBindInput["theta"],
    calleePath: string,
  ): Promise<InvokeInfraError | undefined> {
    const fileSystem = this.#input.fileSystem;
    const activeRoots = this.#input.activeRoots;
    if (fileSystem === undefined || activeRoots === undefined) {
      return undefined;
    }
    const baseDir = theta.sourcePath !== undefined ? dirname(theta.sourcePath) : undefined;
    const resolvedPath =
      baseDir !== undefined && !isAbsolute(calleePath)
        ? resolvePath(baseDir, calleePath)
        : calleePath;
    const verdict = await recheckInvokePathAtRuntime({
      deps: { fs: fileSystem },
      resolvedPath,
      literalPath: calleePath,
      activeRoots,
    });
    return verdict.kind === "escape" ? verdict.error : undefined;
  }

  /**
   * Resolve which return type a driven callee's `Ok` payload is checked
   * against, and whose declarations that type resolves in.
   *
   *   - `annotated` — an `invoke<Schema>` site: the CALLER wrote the annotation
   *     and the caller's `schema` / `enum` decls resolve it (invocation.md
   *     §"Typed return").
   *   - `callee-inferred` — a `.theta`-callable call through `tools:`: the site
   *     has no annotation, so tool-calls.md §"Return type" types it by the
   *     callee's inferred return type (FN-3), resolved against the CALLEE's own
   *     decls. `null` where the inference cannot name a type from syntax alone,
   *     which leaves that call exactly as it behaved before — no AJV check, no
   *     translation pass — matching that row's "otherwise the runtime AJV check
   *     enforces it" fallback for a boundary that has no type to enforce.
   *   - `untyped` — a bare `invoke(...)`: invocation.md §"Typed return" gives it
   *     no return type at all, so nothing is derived.
   */
  #resolveReturnSite(
    theta: ConversationBindInput["theta"],
    returnTyping: InvokeReturnTyping,
    callee: ThetaCompositionInput,
  ): InvokeReturnSite | null {
    switch (returnTyping.kind) {
      case "annotated":
        return { annotation: returnTyping.annotation, declarations: theta.body };
      case "untyped":
        return null;
      case "callee-inferred": {
        const annotation = inferCalleeReturnAnnotation(
          callee.body,
          new Set(schemaDeclsOf(callee.body).map((decl) => decl.name)),
          new Set(enumDeclsOf(callee.body).map((decl) => decl.name)),
        );
        return annotation === null ? null : { annotation, declarations: callee.body };
      }
    }
  }

  /**
   * INV-6 runtime return-value validation: lower the resolved return-type
   * site's annotation against the declarations it resolves in, compile it, and
   * AJV-validate the child's `Ok` payload. A site-less call (`returnSite ===
   * null` — an untyped `invoke(...)`, or a `.theta`-callable call whose callee
   * return-type inference named none) or an `Err` result passes through
   * unchanged; a validation failure is surfaced as
   * `Err(InvokeInfraError{cause:"return_validation"})`.
   *
   * AJV is a structural surface — its `type: "string"` check is a `typeof` test
   * — and the enum carrier `makeEnumValue` builds is a boxed `String`
   * (`typeof === "object"`), so the AJV `validate` call runs only through
   * `projectForValidation`'s wire-form projection of the payload —
   * copy-on-change wherever no descendant needs collapsing AND no container
   * holds a value that is not identical to itself (a `NaN`, whose
   * walk-internal `!==` identity test reports "changed" though nothing
   * collapsed): only under both conditions is the projection the payload,
   * unchanged. Both call sites in `#driveCallee` — the prompt→prompt attach
   * cell and the subagent spawn cell — route through this one method, and it
   * reads the payload's WIRE FORM at both sub-checks, the depth walk as well
   * as the AJV call (bug 0202, which moves all three theta-value ceiling-#4
   * sites to that metric), so a callee's `mode:` frontmatter cannot change
   * whether a named-enum return validates, or what the caller binds for one.
   *
   * On success the ORIGINAL payload — never the projection — also runs
   * through the inbound translation pass runtime-value-model.md §"Wire-name
   * translation" names for `invoke` returns, ordered — as that section fixes
   * — after AJV validation. The subagent envelope is `JSON.stringify` of the
   * callee's own theta-side value, not a lowered-schema encoding, so the
   * derived sidecars carry an empty wire-name map and this pass only re-tags
   * named-enum positions and re-brands schema-typed objects — renaming here
   * would corrupt an already-correct key.
   *
   * The pass reaches the positions the derived sidecars key by JSON Pointer —
   * named-enum positions, `$ref` targets, array elements, the annotated root —
   * and a `{"anyOf":[…]}` position: there the walk re-tests the value against
   * each arm in source order and translates under the FIRST arm that admits it
   * (runtime-value-model.md §"Wire-name translation", the inbound bullet's
   * union clause), through the same `SchemaValidator` the verdict above came
   * from. No arm admitting the value hands it to the caller exactly as AJV
   * validated it: untagged, unbranded, and not descended into.
   */
  #validateInvokeReturn(
    calleePath: string,
    returnSite: InvokeReturnSite | null,
    result: ResultValue,
    calleeResolvedPath: string | undefined,
  ): ResultValue {
    if (returnSite === null || !result.ok) {
      return result;
    }
    const { annotation: returnSchema, declarations } = returnSite;
    // Ceiling #4 (ceilings-3-and-4.md#ceiling-4-table, the `invoke<T>` return-value
    // row; CIO-3): the depth walk is the FIRST sub-check at the return-value AJV
    // boundary, over the payload's WIRE FORM — the JSON document, not the carrier
    // graph (bug 0202). A depth-6+ document surfaces to the invoke parent as
    // `Err(InvokeInfraError { cause: "return_validation" })` before AJV is consulted.
    const depthBreach = enforceInvokeReturnDepth(calleePath, result.value as unknown);
    if (depthBreach !== undefined) {
      return depthBreach.result;
    }
    const lowered = lowerQueryResponseSchema(
      returnSchema,
      schemaDeclsOf(declarations),
      enumDeclsOf(declarations),
    );
    if (lowered === undefined) {
      return result;
    }
    const validator = this.#input.root.schemaValidator.compile(lowered);
    const verdict = validator.validate(projectForValidation(result.value));
    if (verdict.ok) {
      return makeOk(
        decodeInboundValue({
          lowered: lowered as unknown as Record<string, unknown>,
          annotation: returnSchema,
          schemaNames: new Set(schemaDeclsOf(declarations).map((decl) => decl.name)),
          enumNames: new Set(enumDeclsOf(declarations).map((decl) => decl.name)),
          validated: result.value as unknown,
          schemaValidator: this.#input.root.schemaValidator,
          // Bug 0337 (subagent-leg / tools:-callee-leg adjudication, Option 1):
          // an `invoke<T>` return whose carrier is a JSON primitive string (the
          // subagent envelope leg) is retagged by the inbound decode; mint the
          // CALLEE's file-qualified declaring key so the returned variant carries
          // the same tag on the subagent leg as the prompt→prompt boxed-carrier
          // leg keeps intact — mode invariance (0174's witness). The value belongs
          // to the callee's declaration, so a caller reading it against its own
          // same-named enum compares unequal.
          ...(calleeResolvedPath !== undefined
            ? { enumDeclaringPath: calleeResolvedPath }
            : {}),
        }),
      );
    }
    const error: InvokeInfraError = {
      kind: "invoke_infra",
      message: `invoke<${returnSchema}> return value failed validation`,
      callee_path: calleePath,
      cause: "return_validation",
    };
    return makeErr(error as unknown as ThetaValue);
  }
}

/**
 * QTL-4. The underlying Pi-tool names in the theta's frozen `tools:` callable set
 * — the host tool each `pi-tool` entry dispatches to (an `as`-rename entry
 * carries the underlying tool's own registered name, which is what the model's
 * active-tool set must reference). A theta with no snapshot (an in-memory
 * fixture) or no Pi tools yields `[]`, so the prompt-mode active set stays empty
 * and no ambient tool is installed.
 */
/**
 * FN-5 (invocation.md §Final-value propagation across callees): project an
 * `invoke` callee body's terminal execution onto the `Result` value that crosses
 * the invoke boundary. Shared by the subagent spawn path and the prompt→prompt
 * attach path — a callee's final value crosses the boundary identically in
 * either mode (the prompt callee's user-visible turns stream into the shared
 * session, but the value that flows BACK is still the body's final value, not
 * the PIC-53 trailing-turn text of a top-level prompt dispatch).
 *
 * On success the produced value flows as `Ok`, with the CONV-6 / FN-3 implicit
 * wrap applied ONLY to a non-`Result` operand (a `Result`-typed tail passes
 * through unchanged so `invoke<T>` return validation sees `T`, not `Ok(T)`, and
 * a tail `Err(e)` is not masked as success). A `fail` outcome carries the
 * terminating `Err` (a `?`-propagation or an unhandled non-cancel effect-`Err`
 * in tail position, ERR-19) so the parent's XMODE-1 wrap reads the true leaf
 * kind rather than a fabricated `cancelled` (STL-6); only a genuine `cancel`
 * yields `CancelledError`.
 */
function surfaceCalleeFinalValue(execution: BodyExecution): ResultValue {
  if (execution.outcome === "success") {
    const value = execution.result.value ?? null;
    return isResultValue(value) ? value : makeOk(value);
  }
  if (execution.outcome === "fail") {
    return makeErr(execution.error ?? (makeCancelledError() as unknown as ThetaValue));
  }
  return makeErr(makeCancelledError() as unknown as ThetaValue);
}

/**
 * RFC 0001 FN-7/FN-9: resolve a `subagent fn`'s spawned-session callable set.
 * With no `with { tools }` override the spawned session INHERITS the calling
 * theta's full frozen callable set. A `with { tools: […] }` override resolves
 * against the CALLING theta's callable set (FN-9): the spawned set is the named
 * SUBSET of the calling theta's entries (matched by presented name or, for a Pi
 * tool, its underlying tool name) — a name absent from the calling set simply
 * does not appear, and the code-driven `<name>(args)` path re-resolves
 * independently, so no name is widened here.
 */
function subagentFnCallableSet(
  callingSet: ConversationBindInput["theta"]["callableSet"],
  config: SubagentSessionConfig,
): ConversationBindInput["theta"]["callableSet"] {
  if (callingSet === undefined || config.toolsOverridden !== true) {
    return callingSet;
  }
  const wanted = new Set(config.tools ?? []);
  const entries = new Map<string, ResolvedCallable>();
  for (const [name, entry] of callingSet.entries) {
    const underlying =
      entry.kind === "pi-tool"
        ? (entry.toolDefinition as PiToolDispatch).toolName
        : undefined;
    if (wanted.has(name) || (underlying !== undefined && wanted.has(underlying))) {
      entries.set(name, entry);
    }
  }
  return Object.freeze({ entries });
}

function callableSetPiToolNames(
  theta: ConversationBindInput["theta"],
): readonly string[] {
  const set = theta.callableSet;
  if (set === undefined) {
    return [];
  }
  const names: string[] = [];
  for (const entry of set.entries.values()) {
    if (entry.kind === "pi-tool") {
      names.push((entry.toolDefinition as PiToolDispatch).toolName);
    }
  }
  return names;
}

/** SUBAG-2: a resolved model-callable `.theta` in a subagent's callable set. */
interface ResolvedThetaCallable {
  /** The callable-set name the model calls (post-`as`, post-hyphen→underscore). */
  readonly presentedName: string;
  /** The callee `.theta` path relative to the caller's directory. */
  readonly calleePath: string;
  /** The callee's declared `params:` wire names, in DECLARATION ORDER. */
  readonly paramOrder: readonly string[];
  /** The callee's lowered `params:` object schema (the model-facing `parameters`). */
  readonly loweredSchema: LoweredSchema | undefined;
  /** The callee's frontmatter `description` (the model-facing tool description). */
  readonly description: string;
}

/** SUBAG-2: the model-facing text/`isError` pair a `.theta` model call lowers to. */
export interface LoweredThetaCallableResult {
  readonly text: string;
  readonly isError: boolean;
}

/**
 * SUBAG-2: the `.theta`-callable entries in the theta's frozen `tools:` callable
 * set — each carrying its presented (post-`as` / post-hyphen→underscore)
 * callable name and the resolved callee `.theta` path (relative to the caller's
 * directory) read from the frozen entry's `calleePath` (Gap-2: the load-time
 * resolver recorded it from the `tools:` `spec`, so renamed / hyphenated callees
 * carry their real path). Mirrors `callableSetPiToolNames`; the callee schema /
 * param order / description are resolved asynchronously at spawn time via
 * `parseCallee` (production freezes each entry with `callee: undefined`, so the
 * parsed callee itself is not held on the snapshot). A theta with no snapshot
 * yields `[]`.
 */
function callableSetThetaEntries(
  theta: ConversationBindInput["theta"],
): readonly {
  readonly presentedName: string;
  readonly calleePath: string;
  readonly closureHash?: string;
}[] {
  const set = theta.callableSet;
  if (set === undefined) {
    return [];
  }
  const entries: {
    readonly presentedName: string;
    readonly calleePath: string;
    readonly closureHash?: string;
  }[] = [];
  for (const [presentedName, entry] of set.entries) {
    if (entry.kind !== "theta") {
      continue;
    }
    // Gap-2: read the authoritative callee path the load-time resolver recorded
    // on the frozen entry (from the `tools:` `spec`), NOT a basename
    // re-derivation — so renamed / hyphenated callees are presented + dispatchable.
    // #subagent-theta-callable-hash: carry the LOAD-TIME closure hash the
    // resolution snapshot captured, so the launch marshals the stored value.
    entries.push({
      presentedName,
      calleePath: entry.calleePath,
      ...(entry.closureHash !== undefined ? { closureHash: entry.closureHash } : {}),
    });
  }
  return entries;
}

/**
 * SUBAG-2: lower a `.theta`-callable's returned `Result` (FN-5) to the
 * model-facing tool-result text / `isError` pair. `Ok(string)` surfaces the
 * string verbatim; `Ok(<other>)` its JSON form; an `Err` surfaces
 * `isError: true` carrying the error's `message` (or its JSON form) so the model
 * observes the failure and the loop continues — the same disposition a failing
 * Pi-tool sibling receives (tool-calls.md §Concurrency).
 */
function lowerThetaCallableModelResult(result: ResultValue): LoweredThetaCallableResult {
  if (result.ok) {
    const value = result.value ?? null;
    return {
      text: typeof value === "string" ? value : JSON.stringify(value),
      isError: false,
    };
  }
  const error = result.error as unknown;
  const message = (error as { readonly message?: unknown }).message;
  return {
    text: typeof message === "string" ? message : JSON.stringify(error),
    isError: true,
  };
}

/**
 * The zero-width body range for a `.theta`-adapter internal-error diagnostic that
 * carries no source position of its own (mirrors the top-level panic-note site's
 * `ZERO_BODY_RANGE` in `theta-composition-producer.ts`).
 */
const ZERO_BODY_RANGE: SourceRange = {
  start: { line: 0, column: 0 },
  end: { line: 0, column: 0 },
} as const;

/**
 * The callable-set entry (a `./x.theta` path) that a call name resolves to, or
 * `undefined` when the name binds to no `.theta`-callable (so it is a Pi tool).
 *
 * Gap-2: resolve the callee path from the FROZEN callable-set snapshot keyed by
 * the presented (post-`as` / post-hyphen→underscore) name, using the
 * `calleePath` the load-time resolver (`resolveCallableSet`) recorded from the
 * entry's `spec`. This replaces the previous basename string-match against
 * `frontmatter.tools`, which dropped renamed (`./c.theta as foo`) and hyphenated
 * (`./my-tool.theta` → `my_tool`) callees — silently omitting them from BOTH the
 * code-driven `<name>(args)` path and the model-driven adapter.
 *
 * A theta carrying NO snapshot (an in-memory harness fixture built with
 * `frontmatter.tools` but no `callableSet`) falls back to matching
 * `frontmatter.tools` by the resolver's own `thetaDefaultName`, the shared
 * derivation `presentedCallableNames` uses, so the fallback agrees with the
 * snapshot arm on a hyphenated stem (bug 0253). This is the same
 * snapshot-absent fallback pattern `#resolvePiToolForTheta` uses. Production
 * discovered thetas always carry a (possibly empty) snapshot, so the fallback
 * never serves a real theta and thus cannot re-open the Gap-2 hole for
 * production (renamed / hyphenated resolve from the snapshot).
 */
function thetaCalleePath(
  theta: ConversationBindInput["theta"],
  calleeName: string,
): string | undefined {
  const set = theta.callableSet;
  if (set !== undefined) {
    const entry = set.entries.get(calleeName);
    return entry !== undefined && entry.kind === "theta" ? entry.calleePath : undefined;
  }
  const tools = theta.frontmatter.tools ?? [];
  return tools.find(
    (entry) => entry.endsWith(".theta") && thetaDefaultName(entry) === calleeName,
  );
}

/**
 * Lower a code-side `<name>(args)` call's arguments to the JSON params object the
 * host tool's `execute(...)` receives (V14g). The call convention is a single
 * object-literal argument (`grep({ pattern, path })`): its fields are evaluated
 * against the environment and become the JSON params object. A callee that a
 * local binding shadows is an internal defect (bug 0016,
 * docs/bugs/0016-shadowed-tool-name-runtime-dispatch.md): the parse gate
 * (`theta/parse/shadowed-callable-call`) rejects that call site, so lowering
 * (and then dispatching) would execute a callable the site does not lexically
 * denote — the guard mirrors the executor's `preEvaluateToolArgs` seam so the
 * 0016 belt, like the 0003 belt, exists in BOTH lowerings. A ZERO-argument
 * call lowers to an empty params object; a NON-object first argument is an
 * internal defect (bug 0003,
 * docs/bugs/0003-tool-arg-shape-rule-not-enforced.md): the parse-time shape
 * gate (`theta/parse/tool-arg-not-object-literal`) rejects that form, so
 * lowering it to `{}` here — the pre-0.16.0 behaviour — would silently drop
 * the author's argument object. Throwing keeps any future parse-gate gap loud.
 */
function lowerToolCallParams(expr: CallExpr, env: LexicalEnvironment): Record<string, unknown> {
  if (env.localShadowsCallable(expr.callee)) {
    throw new ShadowedCalleeDispatchDefectError(expr.callee);
  }
  const first = expr.args[0];
  if (first === undefined) {
    return {};
  }
  if (first.kind !== "object") {
    throw new PiToolArgShapeDefectError(expr.callee);
  }
  const params: Record<string, unknown> = {};
  for (const field of first.fields) {
    defineRecordField(params, field.name, evaluatePureExpression(field.value, env) as unknown);
  }
  return params;
}

/**
 * The presented (post-`as` / post-hyphen→underscore) callable names of a
 * theta's `tools:` set, for the environment's resolution arm 4 (bug 0016): the
 * frozen snapshot's keys ARE the presented names; a theta carrying NO snapshot
 * (an in-memory harness fixture) falls back to deriving per-entry names from
 * `frontmatter.tools` — the same snapshot-absent fallback pattern
 * `thetaCalleePath` / `#resolvePiToolForTheta` use, so production always takes
 * the snapshot arm. The fallback answers "which entries exist" from the SAME
 * closed grammar `resolveCallableSet` enforces (`parseToolsEntry`) rather than
 * re-tokenising the entry itself, so the two cannot disagree about a malformed
 * entry (bug 0069 §Fix constraint 5): a malformed entry has no presented name
 * and contributes nothing to the returned list, matching the resolver
 * un-registering the theta outright rather than truncating it to a name. A
 * `.theta` entry's default name is the resolver's shared `thetaDefaultName`
 * (`src/parser/callable-set.ts`), so a hyphenated stem presents the same
 * underscored name on both the snapshot and fallback arms (bug 0253).
 */
function presentedCallableNames(theta: ConversationBindInput["theta"]): readonly string[] {
  const set = theta.callableSet;
  if (set !== undefined) {
    return [...set.entries.keys()];
  }
  const names: string[] = [];
  for (const entry of theta.frontmatter.tools ?? []) {
    const parsed = parseToolsEntry(entry.trim());
    if (parsed.kind !== "ok") {
      continue;
    }
    if (parsed.rename !== undefined) {
      names.push(parsed.rename);
      continue;
    }
    names.push(
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(parsed.spec) ? parsed.spec : thetaDefaultName(parsed.spec),
    );
  }
  return names;
}

/**
 * Build the executor's root environment for a body, binding any invoke-supplied
 * positional args onto the callee's declared params as `params:`-field local
 * slots (V15k final value / arg binding) so the body can read them and the
 * bug-0016 dispatch belt sees them across `fn` activation boundaries exactly
 * as the parse gate does (rootLocals are visible in every plain-`fn` body).
 * The theta's presented
 * callable names populate the environment's arm-4 callable registry (bug
 * 0016): the `localShadowsCallable` dispatch guard needs callable-set
 * membership to fire only where the parse gate
 * (`theta/parse/shadowed-callable-call`) fires — with the registry empty the
 * belt would be inert in production. `resolve()`'s behaviour is otherwise
 * unchanged: every consumer branches only on the "local"/"fn"/"import" arms,
 * treating "callable" and "unresolved" identically.
 */
function buildBoundEnvironment(
  body: ThetaBody,
  paramBindings: ReadonlyMap<string, ThetaValue> | undefined,
  imports: readonly MaterializedImport[] | undefined,
  callableNames: readonly string[],
  resolvedPath: string | undefined,
): LexicalEnvironment {
  // Register top-level `enum` declarations (with their captured variant names
  // and any explicit `= "..."` wire values) so `Enum.Variant` access resolves
  // to a first-class enum value — carrying the correct wire form — rather than
  // panicking on a member access against an unresolved name.
  const enums: EnumRegistration[] = [];
  for (const stmt of body.statements) {
    if (stmt.kind === "enum" && stmt.variants !== undefined) {
      enums.push({
        name: stmt.name,
        variants: stmt.variants,
        ...(stmt.variantValues !== undefined ? { values: stmt.variantValues } : {}),
        ...(resolvedPath !== undefined
          ? { declaringKey: enumDeclaringKey(resolvedPath, stmt.name) }
          : {}),
      });
    }
  }
  const env = buildEnvironment({
    body,
    enums,
    callables: callableNames,
    ...(imports !== undefined ? { imports } : {}),
  });
  if (paramBindings !== undefined) {
    for (const [name, value] of paramBindings) {
      // `params:` fields go through the marking entry point (bug 0016): the
      // parse gate treats them as in scope inside every plain-`fn` body, so
      // `localShadowsCallable` must see them across an activation boundary —
      // a plain `defineLocal` here would leave the dispatch belt blind to a
      // params-shadowed callee inside an `fn` body.
      env.defineParamsFieldLocal(name, value);
    }
  }
  return env;
}

/** The fixed respond-tool description (bug-0010 design brief §Slug / naming). */
const RESPOND_TOOL_DESCRIPTION =
  "Return the final answer for the typed query, conforming to the response schema.";

/**
 * The one-shot capture acknowledgements a respond-tool call is answered with
 * (bug 0010): the FIRST valid call records the final answer; a repeat valid
 * call is acknowledged inertly (not an error). Shared by the live capture
 * slot's `execute` and the off-session held-conversation servicing so the two
 * drivers answer the model identically.
 */
const RESPOND_CAPTURED_TEXT = "final answer recorded";
const RESPOND_REPEAT_TEXT = "final answer already recorded";

/**
 * Bug 0010 (QRY-14 early respond): the one-shot capture slot armed around each
 * driven typed free-phase turn. The PERMANENTLY registered respond tool's
 * `execute` dispatches into the producer's current slot, so a registration
 * that outlives its query can never capture outside a live typed turn. The
 * slot object is created per driven turn by the live driver, which keeps its
 * own reference and reads `captured`/`payload` back after the turn settles.
 */
interface ActiveRespondCapture {
  /** The registered respond-tool name this capture belongs to. */
  readonly toolName: string;
  /** AJV verdict over the lowered response schema (QRY-14 execute validation). */
  readonly validate: (
    payload: unknown,
  ) => { readonly ok: true } | { readonly ok: false; readonly message: string };
  /** One-shot: the FIRST valid call wins; later valid calls acknowledge inertly. */
  captured: boolean;
  payload?: unknown;
}

/** The producer's capture-slot accessor handed to the live driver (narrow closures). */
interface RespondCaptureHost {
  setActiveCapture(capture: ActiveRespondCapture): void;
  clearActiveCapture(): void;
}

/**
 * Bug 0010 (QRY-14 step 2): the LIVE typed query's respond-turn machinery —
 * the registered `__theta_respond_<slug>` identity, the lowered response
 * schema, the QRY-15 template, the resolved respond model with auth/signal
 * threading for the off-session `complete()` dispatch, the early-respond AJV
 * verdict, and the producer's capture-slot accessor.
 */
interface RespondTurnContext {
  readonly slug: string;
  /** The PIC-44 registered tool name (collision-disambiguated when applicable). */
  readonly toolName: string;
  readonly lowered: LoweredSchema;
  /** The QRY-15 initial respond-turn template (`renderInitialRespondTurn`). */
  readonly template: string;
  /** The resolved respond model: theta `model:` → registry match, else `ctx.model`. */
  readonly model: Model<Api> | undefined;
  /** Resolve the respond dispatch's request auth (apiKey/headers), when available. */
  readonly auth: () => Promise<
    { readonly apiKey?: string; readonly headers?: Record<string, string> } | undefined
  >;
  /** The theta signal, threaded as `options.signal` (cancellation). */
  readonly signal: AbortSignal;
  /** The early-respond `execute`'s AJV verdict (same lowered schema as the loop). */
  readonly validate: ActiveRespondCapture["validate"];
  readonly captureHost: RespondCaptureHost;
  /**
   * Bug 0010 increment C (conversation-drive.md §"Provider compatibility for
   * typed queries"): the RUNTIME provider gate's refusal, set when the
   * resolved respond model's api-shaped `.api` is outside
   * `TYPED_QUERY_SUPPORTED_PROVIDER_APIS`. When present, the typed query
   * refuses BEFORE any provider traffic — `nextFreePhaseTurn` round 0 and
   * `forcedRespondTurn` (the `max_rounds: 0` entry point) both short-circuit
   * to `Err(TransportError)` with zero sends and zero `complete()` calls.
   */
  readonly gateError?: TransportError;
}

/**
 * The respond tool's `execute` result: pi's `AgentToolResult` content/details
 * plus the `isError` flag fed back to the model as a tool-error result.
 */
interface RespondToolExecuteResult {
  content: { type: "text"; text: string }[];
  details: undefined;
  isError: boolean;
}

/** Lower one respond-tool `execute` disposition to its result shape. */
function respondToolExecuteResult(text: string, isError: boolean): RespondToolExecuteResult {
  return { content: [{ type: "text", text }], details: undefined, isError };
}

/**
 * The live prompt-mode `QueryModelDriver` (`V12a`/`V9c`): it drives real
 * user-visible turns into the shared user session. `nextFreePhaseTurn` issues
 * the rendered query as a streamed user turn (`pi.sendUserMessage`) and awaits
 * `ctx.waitForIdle()` so the assistant streams into the transcript before the
 * interpreter resumes (SLSH-2), then extracts the trailing-turn assistant text
 * (PIC-53) as the plain-text terminating turn.
 *
 * Bug 0010: for a typed query (a present `respond` context) the driver runs
 * the restored TWO-PHASE shape — the free phase on-session (respond tool in
 * the PIC-17 install vector, early-respond capture armed, governor bounding
 * the native loop per CIO-4) and the forced respond turn OFF-SESSION through
 * pi-ai `complete()` with the provider's tool choice forced to the respond
 * tool (`dispatchForcedRespondTurn`), attaching no session turn.
 */
class LivePromptQueryModel implements QueryModelDriver {
  readonly #pi: ExtensionAPI;
  readonly #ctx: ExtensionCommandContext;
  readonly #clock: Clock;
  readonly #queryText: string;
  readonly #readMessages: () => readonly Message[];
  readonly #activeTools: readonly string[];
  readonly #thetaAbort: AbortController;
  /** STAGE B: bounds the native tool loop (armed for typed and untyped alike — bug 0010). */
  readonly #governor: PromptToolLoopGovernor | undefined;
  readonly #maxRounds: number;
  /** PIC-50/51: the resolved provider for a synthesised `TransportError`. */
  readonly #provider: string;
  /** Bug 0010: the typed query's respond-turn machinery (absent = untyped / degraded). */
  readonly #respond: RespondTurnContext | undefined;
  /** The exhaustion snapshot captured after the bounded free-phase turn settled. */
  #exhaustion: PromptToolLoopExhaustion | undefined = undefined;
  /** PIC-50: a `TransportError` synthesised from a `sendUserMessage` sync-throw. */
  #transportFromThrow: TransportError | undefined = undefined;
  /** Bug 0010: whether a free-phase turn was driven (false at `max_rounds: 0`). */
  #freePhaseDriven = false;
  /**
   * Bug 0010 (PIC-53 window): the session message-list length recorded
   * immediately BEFORE the query's first `sendUserMessage` — the query-window
   * start the off-session respond turn rebuilds its conversation from.
   */
  #queryWindowStart: number | undefined = undefined;
  /** Bug 0010: the early-respond snapshot read back after each driven turn. */
  #earlyRespond: { readonly captured: boolean; readonly payload?: unknown } = {
    captured: false,
  };

  constructor(deps: {
    readonly pi: ExtensionAPI;
    readonly ctx: ExtensionCommandContext;
    readonly clock: Clock;
    readonly queryText: string;
    readonly readMessages: () => readonly Message[];
    /** QTL-4: the theta's callable-set underlying Pi-tool names to install for the turn. */
    readonly activeTools: readonly string[];
    /** CANCEL-2: the per-invocation controller `ctx.signal` is re-forwarded into per turn. */
    readonly thetaAbort: AbortController;
    /** STAGE B / CIO-4: the round-cap governor for the driven free-phase turns. */
    readonly governor: PromptToolLoopGovernor | undefined;
    /** STAGE B: the theta's `tool_loop.max_rounds` for this query. */
    readonly maxRounds: number;
    /** PIC-50/51: the resolved provider for a synthesised `TransportError`. */
    readonly provider: string;
    /** Bug 0010: the typed respond-turn machinery (absent = untyped / degraded arm). */
    readonly respond?: RespondTurnContext;
  }) {
    this.#pi = deps.pi;
    this.#ctx = deps.ctx;
    this.#clock = deps.clock;
    this.#queryText = deps.queryText;
    this.#readMessages = deps.readMessages;
    this.#activeTools = deps.activeTools;
    this.#thetaAbort = deps.thetaAbort;
    this.#governor = deps.governor;
    this.#maxRounds = deps.maxRounds;
    this.#provider = deps.provider;
    this.#respond = deps.respond;
  }

  async nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    if (round === 0) {
      // Bug 0010 increment C (conversation-drive.md §Provider compatibility):
      // the runtime provider gate refuses BEFORE any provider traffic — no
      // window recording, no `sendUserMessage`, no `complete()`. The loop
      // surfaces the transport Err directly.
      if (this.#respond?.gateError !== undefined) {
        return { kind: "transport", error: this.#respond.gateError };
      }
      // Bug 0010 (PIC-53 window): record the query-window start — the message
      // count immediately before this query's first send — so the off-session
      // respond turn replays exactly THIS query's turns. `??=` (never plain
      // `=`): a respond-repair restart (Increment C) re-enters the two-phase
      // loop at round 0, and the respond window must keep the ORIGINAL query
      // turns — the window start is recorded ONCE per query, never rewound to
      // a follow-up's send position.
      this.#queryWindowStart ??= this.#readMessages().length;
      // SLSH-2: issue the rendered query as one streamed user-visible turn and
      // await its completion so the assistant text is committed before the
      // interpreter resumes. pi runs its NATIVE agentic tool loop for this turn;
      // the governor (STAGE B) bounds it to `tool_loop.max_rounds` by blocking
      // any tool-use round beyond the cap (ceiling #2 / CIO-4) — typed free
      // phases included (bug 0010: the old typed exemption is retired; the
      // forced respond turn is off-session and inherently ungoverned).
      await this.#driveUserVisibleTurn(true);
      this.#freePhaseDriven = true;
      // PIC-50: a synchronous throw from `pi.sendUserMessage` was mapped to a
      // `TransportError` (no turn was issued); surface it as the free-phase
      // transport failure ahead of any exhaustion / text extraction.
      if (this.#transportFromThrow !== undefined) {
        return { kind: "transport", error: this.#transportFromThrow };
      }
      if (this.#exhaustion?.exhausted === true) {
        // The native loop attempted a round beyond `max_rounds`; the governor
        // blocked it. Represent that as a `tool_use` round so the enclosing
        // `runUntypedQueryLoop` reaches its `max_rounds`-final branch and
        // surfaces the canonical `Err(ToolLoopExhaustedError)` with the recorded
        // `last_tool_name` (ERR-19). The native turn already committed its side
        // effects (ERR-13 no-rollback); this batch is not re-executed
        // (`runToolBatch` is a no-op below).
        return this.#exhaustionTurn();
      }
      // PIC-51: probe the driven turn's trailing `assistant` `stopReason` before
      // extracting text. A `stopReason: "error"` turn maps to
      // `Err(TransportError)` (never masked as `Ok(text)`); the cancellation and
      // plain-text paths are unchanged (cancellation is handled by the
      // enclosing loop's signal guards (bug 0010 F1 / bug 0012), so only a
      // `transport` verdict diverts here).
      const probe = extractPromptModeQueryResult(this.#readMessages(), {
        aborted: this.#thetaAbort.signal.aborted,
        provider: this.#provider,
      });
      if (!probe.ok && probe.error.kind === "transport") {
        return { kind: "transport", error: probe.error as TransportError };
      }
      // Completed within the cap: the terminating plain-text turn.
      return { kind: "text", text: extractTrailingTurnText(this.#readMessages()) };
    }
    // Only reachable on the exhausted path: keep returning the synthetic
    // `tool_use` round until `runUntypedQueryLoop`'s slot count reaches
    // `max_rounds` and it surfaces `tool_loop_exhausted`.
    if (this.#exhaustion?.exhausted === true) {
      return this.#exhaustionTurn();
    }
    // Defensive: a non-exhausted round beyond the first is unreachable (round 0
    // returned text) — a terminating turn keeps the loop total.
    return { kind: "text", text: "" };
  }

  /**
   * The synthetic single-call `tool_use` round that drives `runUntypedQueryLoop`
   * to its `max_rounds`-final branch on the exhausted path. Its `toolName` is the
   * last tool the model tried (surfaced as ERR-19 `last_tool_name`).
   */
  #exhaustionTurn(): FreePhaseTurn {
    const toolName = this.#exhaustion?.lastToolName ?? "respond";
    return {
      kind: "tool_use",
      batch: [{ toolName, toolUseId: "theta-prompt-loop-exhausted" }],
    };
  }

  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    // pi's native loop executes and commits the real tool calls inside the
    // streamed turn; the theta-level batch (only ever the STAGE-B synthetic
    // exhaustion round) executes nothing.
    return Promise.resolve([]);
  }

  async forcedRespondTurn(): Promise<ForcedRespondTurn> {
    // Bug 0010 increment C: the provider gate short-circuits here too — this
    // covers `max_rounds: 0`, where the loop's free phase is skipped entirely
    // and `forcedRespondTurn` is the FIRST driver call (zero sends, zero
    // completes). At `max_rounds >= 1` the round-0 gate already refused, so
    // this arm is defence-in-depth.
    if (this.#respond?.gateError !== undefined) {
      return { kind: "transport", error: this.#respond.gateError };
    }
    // Bug 0010 (QRY-14 early respond): a payload the model already delivered
    // through a VALID early respond-tool call resolves the query — the
    // off-session forced turn is skipped entirely.
    if (this.#earlyRespond.captured) {
      return { kind: "respond", payload: this.#earlyRespond.payload };
    }
    if (this.#respond === undefined) {
      // DEGRADED arm (bug 0010): the declared annotation did not lower, so no
      // respond tool exists to force. Keep the pre-0010 fused mechanism — one
      // user-visible turn carrying the typed-aware text, its trailing assistant
      // text parsed as the candidate payload — so typed behaviour stays total
      // for unlowerable schemas. A non-JSON reply is surfaced as its raw text
      // (never a thrown `JSON.parse`, never a bound `null`).
      //
      // RESIDUAL DIVERGENCE (bug 0010 fix review, F5 — recorded in the bug
      // doc's Fix §Residuals): `lowerQueryResponseSchema` returns `undefined`
      // ONLY for an empty/whitespace annotation (`@<>` / `@<  >`; every
      // non-empty annotation lowers, permissively for unresolved names, since
      // bug 0004). Since bug 0014 the parser REJECTS that form with
      // theta/parse/empty-query-annotation, so the arm is unreachable from
      // parsed source and survives only as seam-level totality over the
      // lowering's `undefined` contract. On that arm the ENTIRE pre-0010
      // fused mechanism survives:
      // user-visible JSON-in-text turn, `maxRounds: 0` collapse, ungoverned
      // native loop, no respond tool, no provider gate, and — because no
      // lowered schema exists — NO schema-validation collaborator, so the
      // parsed payload binds UNVALIDATED (the CIO-3 depth walk still runs in
      // the loop; AJV does not). Pinned by the degraded-arm cells in
      // tests/typed-two-phase-live.test.ts / tests/off-session-two-phase.test.ts.
      await this.#driveUserVisibleTurn(false);
      // PIC-50/51: a transport failure on the fused turn (send sync-throw or
      // trailing `stopReason: "error"`) surfaces as the typed query's
      // `Err(TransportError)` rather than being parsed as a structured payload.
      if (this.#transportFromThrow !== undefined) {
        return { kind: "transport", error: this.#transportFromThrow };
      }
      const probe = extractPromptModeQueryResult(this.#readMessages(), {
        aborted: this.#thetaAbort.signal.aborted,
        provider: this.#provider,
      });
      if (!probe.ok && probe.error.kind === "transport") {
        return { kind: "transport", error: probe.error as TransportError };
      }
      const text = extractTrailingTurnText(this.#readMessages());
      const parse = await parseStructuredPayload(text);
      return { kind: "respond", payload: payloadForRespond(parse) };
    }
    // Bug 0010 (QRY-14 step 2 / SLSH-2): the forced respond turn dispatches
    // OFF-SESSION through pi-ai `complete()` — no `pi.sendUserMessage`, no
    // session turn, no transcript card. The conversation is the driven query
    // window (PIC-53 read surface, opened at the query's first send) with the
    // QRY-15 template as the trailing user message; at the `max_rounds: 0`
    // boundary (no free-phase turn was issued) it is a SINGLE user message —
    // the rendered prompt right-trimmed of trailing newlines, one U+000A, and
    // the QRY-15 template body (QRY-14 step 2 boundary).
    if (this.#freePhaseDriven) {
      return this.#dispatchRespondOverWindow(this.#respond);
    }
    return dispatchForcedRespondTurn(this.#respond, [
      {
        role: "user",
        content: this.#queryText.replace(/\n+$/, "") + "\n" + this.#respond.template,
        timestamp: 0,
      },
    ]);
  }

  /**
   * Bug 0010 increment C (QRY-14 ¶3): drive ONE respond-repair attempt as a
   * FULL TWO-PHASE RESTART — the QRY-12 follow-up template opens a restarted
   * ON-SESSION free phase (respond tool active in the PIC-17 install vector,
   * early-respond capture RE-ARMED, governor RE-ARMED with a fresh
   * `max_rounds` budget per QRY-16), terminated by a FRESH off-session forced
   * respond dispatch over the query window (which now includes the follow-up
   * turn) with the QRY-15 trailing template. At the `max_rounds: 0` boundary
   * no on-session turn is issued and the fresh dispatch's SINGLE user message
   * is the QRY-12 follow-up text ALONE (it already carries the instruction +
   * schema — QRY-15 is never concatenated after it, and no prompt fusion
   * applies).
   *
   * Result mapping for the widened `driveFollowUp` seam: a transport failure
   * anywhere in the attempt → `provider_failure` (the proximate error
   * terminates repair with no attempts debit — QRY-11 §non-validation / bug
   * 0007); an early-captured or extracted payload → `respond_outcome.payload`
   * (AJV-validated caller-side); an ERR-17 report →
   * `respond_outcome.noncompliance` (one debit, the synthesised issue drives
   * the next follow-up's <ajv-summary>).
   */
  async driveRepairAttempt(
    prompt: string,
  ): Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome> {
    const respond = this.#respond;
    if (respond === undefined) {
      // Unreachable by construction: `#resolvePromptQuery` wires this drive
      // only when the respond context exists (the degraded arm keeps the old
      // streamed drive). Kept total rather than throwing across the seam.
      return {
        kind: "provider_failure",
        error: {
          kind: "transport",
          message: "no respond-turn machinery for the typed-query repair attempt",
          http_status: null,
          provider: this.#provider,
          retryable: false,
        },
      };
    }
    // Defensive gate re-check (bug 0010 increment C): the round-0 /
    // forcedRespondTurn gates already refused before any repair could open, so
    // a gated context can never reach here through the loop — but the refusal
    // stays total on this entry point too.
    if (respond.gateError !== undefined) {
      return { kind: "provider_failure", error: respond.gateError };
    }
    // Reset the per-attempt early-respond snapshot BEFORE the restarted phase:
    // the capture slot is re-armed per driven turn inside
    // `#driveUserVisibleTurn` (it arms whenever `#respond` is present), and the
    // snapshot must reflect THIS attempt's turn — never a stale earlier phase
    // (a captured earlier phase already resolved its own query/attempt, so a
    // stale `captured: true` here could only mis-resolve the attempt).
    this.#earlyRespond = { captured: false };
    // Same hygiene for the sync-throw slot: a set value would have terminated
    // the query (transport) before repair opened, so it is always undefined
    // here — reset keeps the invariant local to the attempt.
    this.#transportFromThrow = undefined;
    if (this.#maxRounds > 0) {
      // The restarted free phase: ONE bounded streamed turn opening with the
      // QRY-12 follow-up as its user message. `#driveUserVisibleTurn(true, …)`
      // re-arms the governor via `begin(this.#maxRounds)` — the FRESH
      // per-follow-up `tool_loop` budget QRY-16 pins — and re-arms the
      // early-respond capture slot around the turn.
      await this.#driveUserVisibleTurn(true, prompt);
      if (this.#transportFromThrow !== undefined) {
        // PIC-50: a `sendUserMessage` sync-throw is the attempt's proximate
        // transport failure — no attempts debit (QRY-11 §non-validation).
        return { kind: "provider_failure", error: this.#transportFromThrow };
      }
      // PIC-51 / QRY-11 (bug 0010 fix review C, finding 1): the post-turn
      // probe diverts on EVERY failure verdict. An error-stop on the streamed
      // follow-up turn is the attempt's proximate transport failure; a
      // cancellation observed after the turn settled (the probe's aborted arm
      // synthesises `Err(cancelled)`) terminates repair as its own
      // non-validation failure (query-failure-and-repair.md §Non-validation:
      // `cancelled` is enumerated; the propagated error resolves to the CANCEL
      // terminal outcome downstream, error-model.md §Terminal outcomes).
      // Neither verdict is text-parsed, and neither falls through to the
      // fresh off-session dispatch — an aborted attempt issues NO post-abort
      // provider call.
      const probe = extractPromptModeQueryResult(this.#readMessages(), {
        aborted: this.#thetaAbort.signal.aborted,
        provider: this.#provider,
      });
      if (!probe.ok) {
        return { kind: "provider_failure", error: probe.error };
      }
      // QRY-14 ¶3: a valid mid-turn respond-tool call during the RESTARTED
      // free phase resolves the attempt — the fresh off-session dispatch is
      // skipped exactly as the original phase's early capture skips its
      // initial respond turn.
      if (this.#earlyRespond.captured) {
        return {
          kind: "respond_outcome",
          turn: { kind: "payload", payload: this.#earlyRespond.payload },
        };
      }
      // WHY no exhaustion branch (CIO-4 `max_rounds`-final on the restart): a
      // repair turn that exhausts its FRESH budget is not the loop's free
      // phase — there is no slot accounting to feed a synthetic `tool_use`
      // round into, and a typed query never surfaces `tool_loop_exhausted`
      // (QRY-16: the exempt terminator). The exhausted restart falls through
      // to the fresh forced respond dispatch, exactly as the original phase's
      // exhaustion falls to its `max_rounds`-final respond turn.
      return mapForcedTurnToRepairOutcome(
        await this.#dispatchRespondOverWindow(respond),
        this.#thetaAbort.signal,
      );
    }
    // `max_rounds: 0` (QRY-14 step 2 boundary applied to the restarted loop):
    // NO on-session turn; the fresh dispatch's SINGLE user message is the
    // QRY-12 follow-up text ALONE — the template already carries the
    // instruction + schema, so the QRY-15 template is NOT concatenated after
    // it and the initial turn's prompt fusion does not apply.
    //
    // Boundary abort check (the r7 discipline, bug 0010 fix review F1): an
    // abort observed at this repair boundary terminates the attempt as the
    // CancelledError — QRY-11 §non-validation, no attempts debit — and issues
    // NO post-abort dispatch (the dispatch-level gate would refuse anyway,
    // but its transport shape would mis-surface the cancellation as a
    // transport failure at this seam).
    if (this.#thetaAbort.signal.aborted) {
      return { kind: "provider_failure", error: makeCancelledError() };
    }
    return mapForcedTurnToRepairOutcome(
      await dispatchForcedRespondTurn(respond, [
        { role: "user", content: prompt, timestamp: 0 },
      ]),
      this.#thetaAbort.signal,
    );
  }

  /**
   * Bug 0010 (QRY-14 step 2): the window-shaped forced respond dispatch — the
   * driven query window (PIC-53 read surface, opened at the query's first
   * send and never rewound) plus the trailing QRY-15 template user message.
   * Shared by the initial `forcedRespondTurn` and each repair attempt's fresh
   * dispatch (`driveRepairAttempt`), so both re-enter the SAME forced-respond
   * mechanism byte-identically.
   */
  #dispatchRespondOverWindow(respond: RespondTurnContext): Promise<ForcedRespondTurn> {
    const messages: Message[] = [
      ...this.#readMessages().slice(this.#queryWindowStart ?? 0),
      { role: "user", content: respond.template, timestamp: 0 },
    ];
    return dispatchForcedRespondTurn(respond, messages);
  }

  /**
   * Issue one streamed user-visible turn and await its full completion.
   *
   * `pi.sendUserMessage` is fire-and-forget: it schedules a fresh agent run but
   * returns before that run installs its active-run handle, and
   * `ctx.waitForIdle()` resolves immediately while no run is active. So the
   * driver first waits for the run to become observably non-idle (bounded, on
   * the injected `Clock` macrotask queue, so a turn that never starts cannot
   * hang), then awaits idle for the run's `agent_end`.
   *
   * `text` defaults to the query's opening prompt; a respond-repair restart
   * (Increment C) passes the follow-up template instead.
   */
  async #driveUserVisibleTurn(bound: boolean, text: string = this.#queryText): Promise<void> {
    // Bug 0288 §Fix item 1: the pre-send gate. `pi.sendUserMessage` is
    // fire-and-forget, and a send issued while the host reports streaming is
    // rejected ASYNCHRONOUSLY into the host's extension-error channel
    // (agent-session.js:1858) — unobservable to this driver (bug doc P3). Wait,
    // bounded, until the session is idle, so the send below can only ever land
    // on a session with nothing in flight — this removes the swallowed-send
    // candidate BY CONSTRUCTION rather than by detecting it after the fact.
    // Expiry fails loudly and issues NO send.
    //
    // The gate keys on `ctx.isIdle()` ALONE — the in-flight signal §Fix item 1
    // actually needs — and deliberately makes no demand on the settledness of
    // whatever slice precedes this turn. The message list is the USER's whole
    // long-lived conversation, not this drive's window: a turn the user
    // cancelled before any assistant entry existed is idle but never
    // settleable, so a settledness demand would stall a benign single-query
    // drive for the full bound and then fail it where the reply was available
    // (§Non-goals: single-query drives keep their observable behaviour). It
    // would also buy nothing — every turn THIS drive issued is already settled
    // by the per-turn settle-poll below before `#driveUserVisibleTurn`
    // returns, which is what sequences query N+1 after query N.
    const gateCleared = await this.#pollWhile(() => !this.#ctx.isIdle(), PRE_SEND_GATE_POLL_BOUND);
    if (!gateCleared) {
      this.#recordLifecycleExpiry("pre-send-gate", PRE_SEND_GATE_POLL_BOUND * POLL_INTERVAL_MS);
      return;
    }
    // STAGE B: when `bound`, arm the governor around the native turn so pi's
    // internal agentic tool loop is capped at `tool_loop.max_rounds`. The bound
    // is armed IMMEDIATELY before `sendUserMessage` and disarmed right after the
    // turn settles, so it never affects unrelated turns or other queries. The
    // exhaustion snapshot is read by `nextFreePhaseTurn` after this resolves.
    // Bug 0010: typed free-phase turns are bound too (CIO-4); only the degraded
    // fused arm passes `bound: false`.
    if (bound && this.#governor !== undefined) {
      this.#governor.begin(this.#maxRounds);
    }
    // PIC-17 active-set gating (QTL-4 / bug 0010): install exactly
    // `[...thetaCallableSetNames, respondToolName?]` — the theta's callable-set
    // underlying Pi-tool names plus, on a typed query, the synthesised respond
    // tool — as the model's active tools for the query turn, restoring the
    // ambient snapshot in the gate's `finally`. Ambient tools are deliberately
    // not inherited (a theta with no Pi tools installs `[respondTool?]`).
    const install: CallableSetInstall = {
      thetaCallableSetNames: this.#activeTools,
      ...(this.#respond !== undefined ? { respondToolName: this.#respond.toolName } : {}),
    };
    // Bug 0288 §Fix item 3/4: the message-list length recorded BEFORE this
    // send — the boundary this turn's OWN user entry must land at or after. A
    // settled-slice read that ignored this boundary could still anchor on an
    // EARLIER turn's (already-settled) user entry and silently re-extract its
    // text (P2's exact failure shape) instead of failing loudly over this
    // turn's own, still-unattributed one.
    const turnStart = this.#readMessages().length;
    try {
      await withActiveSetGating(this.#pi, install, async () => {
        // Bug 0010 (QRY-14 early respond): arm the producer's one-shot capture
        // slot for the duration of the driven turn, so a mid-turn respond-tool
        // call validates and captures against THIS query's lowered schema. The
        // slot is cleared — and the captured payload snapshotted — in the
        // `finally`, even on an error/abort path.
        const capture: ActiveRespondCapture | undefined =
          this.#respond !== undefined
            ? { toolName: this.#respond.toolName, validate: this.#respond.validate, captured: false }
            : undefined;
        if (capture !== undefined) {
          this.#respond?.captureHost.setActiveCapture(capture);
        }
        try {
          // PIC-50: `pi.sendUserMessage` is the only failure the call surface itself
          // can signal synchronously. Map such a throw to a `TransportError` (never
          // `theta/runtime/internal-error`, never a swallowed `Ok("")`) and return
          // without issuing a turn; the driver surfaces it as the query's transport
          // `Err`. The gate's `finally` still restores the ambient active set.
          try {
            this.#pi.sendUserMessage(text);
          } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — PIC-50 sendUserMessage sync-throw → TransportError
            this.#transportFromThrow = mapPromptModeSyncThrow(thrown, this.#provider);
            return;
          }
          // Bug 0288 §Fix item 3: start-poll. Poll while the run has not been
          // observed non-idle AND this turn's OWN slice has not yet settled — a
          // turn that starts and finishes inside one poll interval (the guard
          // cell, `tests/b0288-prompt-turn-completion-witness.test.ts` (v)) settles
          // the second way and must not be mistaken for one that never started.
          // Only an expiry with the slice still UNSETTLED is the loud failure
          // (P1/P4: `isIdle` is not a proxy for "the send took effect").
          const startCleared = await this.#pollWhile(
            () => this.#ctx.isIdle() && !thisTurnSettled(this.#readMessages(), turnStart),
            TURN_START_POLL_BOUND,
          );
          if (!startCleared) {
            this.#recordLifecycleExpiry("start", TURN_START_POLL_BOUND * POLL_INTERVAL_MS);
            return;
          }
          // CANCEL-2 (cancellation.md §Forwarding into `thetaAbort`, slash-command
          // entry): once the start poll has cleared, `ctx.signal` reflects THIS
          // turn whenever the host observed it streaming (it is `undefined` at
          // idle slash-entry, and a no-op forward below when the fast path never
          // observed the run non-idle at all). Re-forward it INTO `thetaAbort` so
          // an Esc during the `@`-query turn flips the single source of truth
          // every checkpoint gates on — the end-to-end "Esc during `@`-query" path.
          // Idempotent: the one-shot guard on `thetaAbort.abort()` makes a repeat
          // forward a no-op, and the listener is `{ once: true }` on the per-turn
          // transient `ctx.signal`, so no long-lived controller leaks. Decision 6 /
          // Increment B2: this PER-TURN forward's detach is deliberately NOT
          // collected onto the shared `forwardingSignals` sink — the listener sits
          // on a per-turn-transient `ctx.signal` that self-cleans (`{once:true}` and
          // GC'd with the turn), so collecting it would add per-turn push/splice
          // churn for no shutdown-lifetime benefit. Only the invocation-scoped bind
          // forwards are collected (sub-step 5 detaches those).
          forwardSlashCommandCancel(this.#thetaAbort, this.#ctx.signal);
          if (this.#ctx.isIdle()) {
            // Bug 0288 §Fix item 3, the fast path: the turn's own slice settled
            // without `isIdle()` ever being observed false. Nothing to wait out.
            return;
          }
          // Bug 0288 §Fix item 4: bounded end-poll, then a bounded `waitForIdle`
          // race, then a bounded wait for THIS turn's own slice to settle. Each
          // expiry is the query's loud `Err` — no ≈600s walk-out (P6), no
          // unbounded `waitForIdle` (P5: `_isAgentRunActive` clears before the
          // `agent_settled` emit is awaited, so a flag-based wait alone is not a
          // turn-completion signal).
          const endCleared = await this.#pollWhile(() => !this.#ctx.isIdle(), TURN_END_POLL_BOUND);
          if (!endCleared) {
            this.#recordLifecycleExpiry("settle", TURN_END_POLL_BOUND * POLL_INTERVAL_MS);
            return;
          }
          // Race `ctx.waitForIdle()` against a `Clock`-driven bound instead of
          // awaiting it unboundedly (§Fix item 4 / D5). Both branches carry an
          // identical single `.then()` hop so a tie (both already resolved, the
          // common fixture shape) resolves in `waitForIdle`'s favour — the branch
          // listed first — rather than being decided by incidental extra
          // microtask hops.
          //
          // The losing leg's timer is CLEARED after the race (the house pattern
          // at factory.ts's `quiesceOutgoingRebuild` and
          // runtime/subagent-isolation.ts's bounded exit await): on the common
          // path `waitForIdle()` wins, and an uncleared handle would hold the
          // event loop open for the bound on every driven turn.
          let idleSettled = false;
          let idleBoundTimer: TimerHandle | undefined;
          const idleBound = new Promise<void>((resolve) => {
            idleBoundTimer = this.#clock.setTimeout(() => resolve(), WAIT_FOR_IDLE_BOUND_MS);
          });
          try {
            await Promise.race([ // allow: cka-62 — pi-integration-contract/conversation-drive.md
              this.#ctx.waitForIdle().then(() => {
                idleSettled = true;
              }),
              idleBound.then(() => {}),
            ]);
          } finally {
            if (idleBoundTimer !== undefined) {
              this.#clock.clearTimeout(idleBoundTimer);
            }
          }
          if (!idleSettled) {
            this.#recordLifecycleExpiry("settle", WAIT_FOR_IDLE_BOUND_MS);
            return;
          }
          const settleCleared = await this.#pollWhile(
            () => !thisTurnSettled(this.#readMessages(), turnStart),
            TURN_SETTLE_POLL_BOUND,
          );
          if (!settleCleared) {
            this.#recordLifecycleExpiry("settle", TURN_SETTLE_POLL_BOUND * POLL_INTERVAL_MS);
            return;
          }
          // CANCEL-2 (agent_end user-cancel trigger, CNCL-4 synthesised reason): a
          // turn that ended aborted without a forwarded source reason flips
          // `thetaAbort` with the synthesised `"theta cancelled by agent_end"` reason,
          // so the next checkpoint observes the cancellation.
          if (this.#ctx.signal?.aborted === true && !this.#thetaAbort.signal.aborted) {
            abortForAgentEnd(this.#thetaAbort);
          }
        } finally {
          if (capture !== undefined) {
            this.#respond?.captureHost.clearActiveCapture();
            if (capture.captured) {
              this.#earlyRespond = { captured: true, payload: capture.payload };
            }
          }
        }
      });
    } finally {
      // STAGE B: disarm the governor and capture the exhaustion snapshot the
      // moment the turn settles, even on an error/abort path.
      if (bound && this.#governor !== undefined) {
        this.#exhaustion = this.#governor.end();
      }
    }
  }

  /**
   * Release the event loop, polling `condition` on the `Clock` up to `bound`
   * times. Returns whether the condition CLEARED (observed false at or before
   * the bound) as opposed to the bound EXPIRING while it was still true (bug
   * 0288 §Fix item 1 / P1) — the caller can no longer mistake one for the
   * other, which is the root cause this bug fixes: at HEAD both exits
   * returned identically and a caller could not tell "satisfied" from
   * "expired".
   */
  async #pollWhile(condition: () => boolean, bound: number): Promise<boolean> {
    for (let i = 0; i < bound && condition() && !this.#thetaAbort.signal.aborted; i += 1) {
      await macrotask(this.#clock, POLL_INTERVAL_MS);
    }
    return !condition();
  }

  /**
   * Record a bounded turn-lifecycle wait's expiry as this query's transport
   * `Err` — UNLESS the theta has been cancelled. PIC-51 pins that an observed
   * `thetaAbort.signal.aborted` synthesises `Err(cancelled)` INSTEAD of reading
   * session error state, and that precedence is honoured only by
   * `extractPromptModeQueryResult`, which every caller skips once
   * `#transportFromThrow` is set. Leaving it unset on an aborted drive keeps
   * Esc-before-the-first-token answering `Err(cancelled)` promptly, exactly as
   * the PIC-51 probe already did.
   */
  #recordLifecycleExpiry(phase: PromptModeTurnLifecyclePhase, boundMs: number): void {
    if (this.#thetaAbort.signal.aborted) {
      return;
    }
    this.#transportFromThrow = mapPromptModeTurnLifecycleExpiry(
      phase,
      boundMs,
      this.#provider,
    );
  }
}

/** Poll cadence (ms) while waiting for a fire-and-forget user turn's stream lifecycle. */
const POLL_INTERVAL_MS = 10;

/**
 * Bound on the pre-send gate (§Fix item 1): waiting for the session to report
 * no run in flight before this query's own send is issued.
 */
const PRE_SEND_GATE_POLL_BOUND = 1000;

/** Bound on start-phase polls (≈ waiting for the run to begin streaming). */
const TURN_START_POLL_BOUND = 1000;

/**
 * Bound on end-phase polls (≈ waiting for the streamed run to go idle again).
 * Bug 0288 §Fix item 4: reduced from 60000 (≈600s, itself above vitest's live
 * per-test timeout — P6) to a bound diagnosable well inside it.
 */
const TURN_END_POLL_BOUND = 6000;

/**
 * Bound (ms) on the `ctx.waitForIdle()` race (§Fix item 4 / D5): replaces the
 * unbounded await at HEAD (P5/P6) with a `Clock`-driven race so a settle path
 * that never resolves the flag presents as a loud named expiry.
 */
const WAIT_FOR_IDLE_BOUND_MS = 2000;

/**
 * Bound on the final settle-poll (§Fix item 4): waiting for THIS turn's own
 * message-list slice to read as settled once the idle-flag wait has cleared.
 */
const TURN_SETTLE_POLL_BOUND = 1000;

/** Release the event loop for one poll interval through the injected `Clock` seam. */
function macrotask(clock: Clock, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    clock.setTimeout(() => resolve(), ms);
  });
}

// --- Bug 0288 §Fix items 1/3/4 — the settled-turn predicate, producer-side ---
//
// D4 (adjudicated in-lane): implemented over the producer's OWN built
// `Message[]` read surface (`#readMessages()`), not factored into
// `src/runtime/` for sharing with `tests/live/harness.ts`. The harness reads
// raw `SessionManager` entries (`classifyLastTurn`/`captureSettledTurn`
// since bug 0289's fix, 0.286.0); this reads built `Message[]` — the two
// surfaces differ, so this is an independent implementation of the same
// idea, not a shared function.

/**
 * Whether the slice AFTER a turn's own `user`-role message is a SETTLED
 * ending. Two disjoint arms:
 *
 *   1. A trailing `assistant` message exists — whatever its `stopReason`, with
 *      or without text. PIC-51b pins the whole trailing-`assistant` set as
 *      DEFINITE outcomes: `"error"` and the non-normal terminators classify
 *      as `transport`, `"length"` as `context_overflow`, and an EMPTY-TEXT
 *      assistant on a normal boundary reaches PIC-53's `Ok("")` (the pure
 *      tool-use turn). Narrowing this arm to "non-empty text, or `stopReason`
 *      `"error"`/`"aborted"`" would read those definite outcomes as an
 *      in-flight turn, mint a lifecycle `TransportError` where PIC-51b
 *      mandates a different classification, and never let the turn settle.
 *      Settledness is only ever consulted once the run has been observed
 *      IDLE, so no message can still be accruing when this arm fires.
 *      Classification itself stays with `extractPromptModeQueryResult`, the
 *      single implementation of the PIC-51 / PIC-51b / PIC-53 ordering — this
 *      predicate decides only "the turn is over", never "what it means".
 *   2. A tool-result-only ending: the slice's last message is a
 *      `ToolResultMessage` with nothing generated after it — a tool round the
 *      host committed with no assistant entry of its own yet.
 */
function isSettledTurnEnding(afterUser: readonly Message[]): boolean {
  for (let i = afterUser.length - 1; i >= 0; i -= 1) {
    if (afterUser[i]?.role === "assistant") {
      return true;
    }
  }
  const last = afterUser[afterUser.length - 1];
  return last !== undefined && last.role === "toolResult";
}

/**
 * Locate the slice after the LAST `user`-role message at or after
 * `fromIndex` in `messages` (bug 0288 §Fix item 1/3/4). `fromIndex` bounds the
 * search to a particular turn's own send: a `user` entry recorded BEFORE it
 * belongs to an earlier, already-settled turn and must never be mistaken for
 * this turn's own anchor — the exact silent failure P2 describes
 * (`extractTrailingTurnText` anchoring on the wrong turn's `user` entry).
 */
function turnSliceSince(
  messages: readonly Message[],
  fromIndex: number,
): { readonly opened: boolean; readonly after: readonly Message[] } {
  for (let i = messages.length - 1; i >= fromIndex; i -= 1) {
    if (messages[i]?.role === "user") {
      return { opened: true, after: messages.slice(i + 1) };
    }
  }
  return { opened: false, after: [] };
}

/**
 * Whether THIS turn — the one whose own `pi.sendUserMessage` was issued when
 * `#readMessages().length` was `turnStart` — has settled. Requires the turn's
 * OWN `user` entry to exist at or after `turnStart`: an inert/swallowed send
 * (bug doc P3: the `isStreaming`-without-`streamingBehavior` throw appends NO
 * user entry) can never read as settled no matter what the rest of the
 * transcript looks like.
 */
function thisTurnSettled(messages: readonly Message[], turnStart: number): boolean {
  const slice = turnSliceSince(messages, turnStart);
  return slice.opened && isSettledTurnEnding(slice.after);
}

/**
 * Bug 0010 increment C: map one fresh forced respond dispatch's seam result to
 * the widened `driveFollowUp` repair-drive result — an extracted payload and
 * an ERR-17 report both ride `respond_outcome` (validated / debited by the
 * repair loop caller-side), a transport failure rides `provider_failure` (the
 * proximate error terminates repair with no attempts debit, QRY-11
 * §non-validation / bug 0007).
 *
 * `signal` is the THETA abort signal (bug 0010 fix round 2, R2-1): an abort
 * landing while the fresh dispatch is in flight resolves through pi-ai as an
 * aborted-stop reply and reaches this seam on the transport arm with the fixed
 * "cancelled" message — with the theta signal aborted that is the
 * cancellation, surfaced as `provider_failure: CancelledError` (QRY-11
 * §non-validation: `cancelled` terminates repair with no debit; the propagated
 * error resolves to the CANCEL terminal outcome downstream). The exact mirror
 * of the loop's forced-respond guard (query-tool-loop.ts `runTypedQueryLoop`,
 * signal-aborted transport → cancelled) applied to the repair-side dispatch. A
 * transport verdict with a NON-aborted signal stays transport.
 */
function mapForcedTurnToRepairOutcome(
  turn: ForcedRespondTurn,
  signal: AbortSignal,
): FollowUpDriveFailure | FollowUpRespondOutcome {
  switch (turn.kind) {
    case "respond":
      return { kind: "respond_outcome", turn: { kind: "payload", payload: turn.payload } };
    case "noncompliance":
      return {
        kind: "respond_outcome",
        turn: {
          kind: "noncompliance",
          branch: turn.branch,
          raw_response: turn.raw_response,
        },
      };
    case "transport":
      if (signal.aborted) {
        return { kind: "provider_failure", error: makeCancelledError() };
      }
      return { kind: "provider_failure", error: turn.error };
  }
}

/** The resolved request auth (apiKey/headers) an off-session `complete()` threads. */
interface OffSessionRequestAuth {
  readonly apiKey?: string;
  readonly headers?: Record<string, string>;
}

/**
 * Bug 0010 (auth threading, increments C+D): resolve a model's request auth
 * off the model registry — the `#completeBinderReply` pattern — PROBING for
 * the optional `getApiKeyAndHeaders` capability first. WHY the probe: the
 * capability is genuinely optional on harness registries (the frozen bug-0007
 * suite constructs `modelRegistry: {}`), and auth is an enrichment, not a
 * precondition — its absence must not crash a dispatch that a credential-less
 * host could still serve. `undefined` = thread no auth options.
 */
async function resolveRegistryAuth(
  modelRegistry: ModelRegistry,
  model: Model<Api> | undefined,
): Promise<OffSessionRequestAuth | undefined> {
  if (model === undefined) {
    return undefined;
  }
  const registry = modelRegistry as {
    readonly getApiKeyAndHeaders?: (m: Model<Api>) => Promise<{
      readonly ok: boolean;
      readonly apiKey?: string;
      readonly headers?: Record<string, string>;
    }>;
  };
  if (typeof registry.getApiKeyAndHeaders !== "function") {
    return undefined;
  }
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    return undefined;
  }
  return {
    ...(auth.apiKey !== undefined ? { apiKey: auth.apiKey } : {}),
    ...(auth.headers !== undefined ? { headers: auth.headers } : {}),
  };
}

/**
 * Bug 0010 increment D: the theta's frozen callable-set pi-tool entries
 * presented as free-phase `context.tools` entries for the off-session
 * `complete()` tool loop (QRY-14: the callable set is "available to the model
 * during query-time tool loops"). Duck-read off each entry's held
 * `toolDefinition` — the same snapshot `callableSetPiToolNames` names — so
 * presentation and dispatch resolution consult one source. A snapshot-less
 * harness theta presents nothing (dispatch still resolves via the
 * producer-wide `resolvePiTool` fallback).
 */
function callableSetPresentedTools(theta: ConversationBindInput["theta"]): readonly Tool[] {
  const set = theta.callableSet;
  if (set === undefined) {
    return [];
  }
  const tools: Tool[] = [];
  for (const entry of set.entries.values()) {
    if (entry.kind !== "pi-tool") {
      continue;
    }
    const definition = entry.toolDefinition as PiToolDispatch & {
      readonly description?: unknown;
      readonly parameters?: unknown;
    };
    tools.push({
      name: definition.toolName,
      description: typeof definition.description === "string" ? definition.description : "",
      // An extension-shaped entry pins `parameters`; an execute-bearing host
      // entry may omit it — present the accept-anything object schema then, so
      // the provider can still call the tool it is entitled to.
      parameters: (definition.parameters ??
        Type.Unsafe<unknown>({ type: "object" })) as Tool["parameters"],
    });
  }
  return tools;
}

/**
 * An off-session `QueryModelDriver` (`subagent fn` in-process path): it
 * resolves the query through pi-ai's `complete()` free function — no user
 * session turn, no transcript card — over a HELD CONVERSATION (bug 0010
 * increment D). The off-session path has no session to read back, so the
 * driver accumulates its own message history: the opening rendered prompt,
 * every free-phase assistant reply, every fed-back tool result, and each
 * QRY-12 repair follow-up. The free phase is a real `complete()` tool loop
 * (QRY-13): the theta's callable set (plus, on a typed query, the synthesised
 * respond tool) rides `context.tools` with NO `toolChoice`; ToolCall replies
 * are serviced through the same `lowerModelDrivenToolCall` lowering the
 * subagent model-driven path uses and fed back as tool results. The typed
 * query terminates through the SHARED `dispatchForcedRespondTurn` — forced
 * respond exchanges never join the held conversation (the off-session mirror
 * of SLSH-2's "no respond traffic on the session"). Every dispatch is
 * CLASSIFIED per bug 0007: a provider failure rides the loop's transport arm.
 */
class OffSessionQueryModel implements QueryModelDriver {
  readonly #model: Model<Api> | undefined;
  readonly #queryText: string;
  readonly #signal: AbortSignal;
  /** Bug 0010: the typed respond-turn machinery (absent = untyped / degraded arm). */
  readonly #respond: RespondTurnContext | undefined;
  /** QRY-16/CIO-4: the fresh `tool_loop` budget each repair restart re-runs under. */
  readonly #maxRounds: number;
  /** QRY-14: the callable set presented as free-phase `context.tools` entries. */
  readonly #freePhaseTools: readonly Tool[];
  /** QRY-13: resolve a model-called name to its callable-set `execute` dispatch. */
  readonly #resolveDispatch: (name: string) => PiToolDispatch | undefined;
  /** Auth for the FREE-PHASE dispatch model (the respond dispatch resolves its own). */
  readonly #auth: () => Promise<OffSessionRequestAuth | undefined>;
  /** The held conversation (see the class doc); grows monotonically, never rewound. */
  readonly #held: Message[] = [];
  /** The latest free-phase reply's ToolCall parts, awaiting `runToolBatch`. */
  #pendingCalls: readonly ToolCall[] = [];
  /** QRY-14 early respond: one-shot — the FIRST valid respond call wins. */
  #earlyRespond: { readonly captured: boolean; readonly payload?: unknown } = {
    captured: false,
  };
  /** Whether a free-phase turn opened the held conversation (false at `max_rounds: 0`). */
  #freePhaseDriven = false;

  constructor(deps: {
    readonly model: Model<Api> | undefined;
    readonly queryText: string;
    /** CANCEL-3: the theta signal the provider-Promise swallowing guard reads at settlement. */
    readonly signal: AbortSignal;
    readonly maxRounds: number;
    /** Bug 0010: the typed respond-turn machinery (absent = untyped / degraded arm). */
    readonly respond?: RespondTurnContext;
    readonly freePhaseTools: readonly Tool[];
    readonly resolveDispatch: (name: string) => PiToolDispatch | undefined;
    readonly auth: () => Promise<OffSessionRequestAuth | undefined>;
  }) {
    this.#model = deps.model;
    this.#queryText = deps.queryText;
    this.#signal = deps.signal;
    this.#respond = deps.respond;
    this.#maxRounds = deps.maxRounds;
    this.#freePhaseTools = deps.freePhaseTools;
    this.#resolveDispatch = deps.resolveDispatch;
    this.#auth = deps.auth;
  }

  async nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    if (round === 0) {
      // Bug 0010 increment D (conversation-drive.md §Provider compatibility):
      // the runtime provider gate refuses BEFORE any provider traffic — the
      // held conversation stays empty and ZERO `complete()` calls are issued.
      if (this.#respond?.gateError !== undefined) {
        return { kind: "transport", error: this.#respond.gateError };
      }
      // The held conversation opens at the rendered prompt (QRY-14 step 1 —
      // the bare template body; the schema is conveyed by the respond tool's
      // parameters and the QRY-15 trailing template, never inlined here).
      this.#held.push({ role: "user", content: this.#queryText, timestamp: 0 });
      this.#freePhaseDriven = true;
    }
    // QRY-14 early respond: a captured payload TERMINATES the free phase — no
    // further `complete()` is issued; `forcedRespondTurn` returns the capture.
    if (this.#earlyRespond.captured) {
      return { kind: "text", text: "" };
    }
    return this.#driveFreePhaseRound();
  }

  /**
   * QRY-13: service EVERY held ToolCall of the latest free-phase reply — in
   * reply order — and feed each result back into the held conversation, so the
   * next round's `complete()` sees the full tool exchange. Returns no committed
   * side effects: the serviced calls are model-driven rounds inside the query
   * turn (the off-session analogue of pi's native loop), not theta-level
   * batch commitments.
   */
  async runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    const calls = this.#pendingCalls;
    this.#pendingCalls = [];
    for (const call of calls) {
      this.#held.push(await this.#serviceHeldCall(call));
    }
    return [];
  }

  async forcedRespondTurn(): Promise<ForcedRespondTurn> {
    // Bug 0010 increment D: the provider gate short-circuits here too — this
    // covers `max_rounds: 0`, where the free phase is skipped entirely and
    // `forcedRespondTurn` is the FIRST driver call (zero completes). At
    // `max_rounds >= 1` the round-0 gate already refused, so this arm is
    // defence-in-depth.
    if (this.#respond?.gateError !== undefined) {
      return { kind: "transport", error: this.#respond.gateError };
    }
    // QRY-14 early respond: a payload the model already delivered through a
    // VALID respond-tool call during the free phase resolves the query — the
    // forced dispatch is skipped entirely.
    if (this.#earlyRespond.captured) {
      return { kind: "respond", payload: this.#earlyRespond.payload };
    }
    if (this.#respond === undefined) {
      // DEGRADED arm (bug 0010): the declared annotation did not lower, so no
      // respond tool exists to force. Keep the pre-0010 fused mechanism — one
      // `complete()` carrying the typed-aware text, its reply text parsed as
      // the candidate payload — so typed behaviour stays total for unlowerable
      // schemas. RESIDUAL DIVERGENCE (bug 0010 fix review, F5): reachable only
      // via a `schema: ""` QueryExpr, which bug 0014's parse rejection
      // (theta/parse/empty-query-annotation) makes unmintable from source —
      // the arm survives only as seam-level totality over the lowering's
      // `undefined` contract; the payload binds with NO AJV (no validation
      // collaborator is built without a lowered schema) — see the live arm's
      // residual note and the bug doc's Fix §Residuals. A provider failure
      // surfaces on the transport arm (bug 0007)
      // — never fed to `parseStructuredPayload`, which would launder it into
      // the schema-validation channel and burn respond-repair attempts
      // against a dead provider.
      const completion = await this.#completeFused();
      if (completion.kind === "failure") {
        return { kind: "transport", error: completion.error };
      }
      const parse = await parseStructuredPayload(completion.text);
      return { kind: "respond", payload: payloadForRespond(parse) };
    }
    // Bug 0010 (QRY-14 step 2 / SLSH-2 mirror): the forced respond turn
    // dispatches through the SHARED off-session `complete()` helper — the held
    // conversation with the QRY-15 template as the trailing user message; at
    // the `max_rounds: 0` boundary (no free-phase call was ever issued, the
    // held conversation is empty) it is a SINGLE user message — the rendered
    // prompt right-trimmed of trailing newlines, one U+000A, and the QRY-15
    // template body.
    if (this.#freePhaseDriven) {
      return dispatchForcedRespondTurn(this.#respond, [
        ...this.#held,
        { role: "user", content: this.#respond.template, timestamp: 0 },
      ]);
    }
    return dispatchForcedRespondTurn(this.#respond, [
      {
        role: "user",
        content: this.#queryText.replace(/\n+$/, "") + "\n" + this.#respond.template,
        timestamp: 0,
      },
    ]);
  }

  /**
   * Bug 0010 increment D (QRY-14 ¶3): drive ONE respond-repair attempt as a
   * FULL TWO-PHASE RESTART over the held conversation — the QRY-12 follow-up
   * template joins it as a user message, the free-phase tool loop re-runs
   * under a FRESH `max_rounds` budget (QRY-16), then a fresh forced respond
   * dispatch (held conversation + trailing QRY-15) terminates the attempt. At
   * the `max_rounds: 0` boundary no free-phase call is issued and the fresh
   * dispatch's SINGLE user message is the QRY-12 follow-up text ALONE (it
   * already carries the instruction + schema — QRY-15 is never concatenated
   * after it, and no prompt fusion applies).
   *
   * Result mapping (the widened `driveFollowUp` seam): a transport failure
   * anywhere in the attempt — or a cancellation observed at a round boundary
   * — rides `provider_failure` (the proximate error terminates repair with no
   * attempts debit, QRY-11 §non-validation / bug 0007); an early-captured or
   * extracted payload rides `respond_outcome.payload` (AJV-validated
   * caller-side); an ERR-17 report rides `respond_outcome.noncompliance`.
   */
  async driveRepairAttempt(
    prompt: string,
  ): Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome> {
    const respond = this.#respond;
    if (respond === undefined) {
      // Unreachable by construction: `#resolvePromptQuery` wires this drive
      // only when the respond context exists (the degraded arm keeps the
      // fused `offSessionFollowUp` drive). Kept total rather than throwing
      // across the seam.
      return {
        kind: "provider_failure",
        error: {
          kind: "transport",
          message: "no respond-turn machinery for the typed-query repair attempt",
          http_status: null,
          provider: String(this.#model?.api ?? "unknown"),
          retryable: false,
        },
      };
    }
    // Defensive gate re-check (mirrors the live drive): a gated context can
    // never reach here through the loop, but the refusal stays total.
    if (respond.gateError !== undefined) {
      return { kind: "provider_failure", error: respond.gateError };
    }
    // Reset the per-attempt capture BEFORE the restarted phase, so the
    // snapshot reflects THIS attempt's rounds — never a stale earlier phase
    // (a captured earlier phase already resolved its own query/attempt).
    this.#earlyRespond = { captured: false };
    if (this.#maxRounds > 0) {
      // The restarted free phase: the QRY-12 follow-up joins the held
      // conversation and the tool loop re-runs under a FRESH budget (QRY-16).
      this.#held.push({ role: "user", content: prompt, timestamp: 0 });
      this.#freePhaseDriven = true;
      let slots = 0;
      for (;;) {
        // Cancellation preempts the restart at every round boundary (QRY-11
        // §non-validation: `cancelled` terminates repair with no debit and NO
        // post-abort dispatch — the increment-C r7 discipline).
        if (this.#signal.aborted) {
          return { kind: "provider_failure", error: makeCancelledError() };
        }
        if (slots === this.#maxRounds) {
          break;
        }
        const turn = await this.#driveFreePhaseRound();
        if (turn.kind === "transport") {
          // A restarted-round failure observed WITH an aborted theta signal is
          // the in-flight cancellation, not a provider fault — pi-ai RESOLVES
          // an abort as a `stopReason: "aborted"` reply that classifies into
          // the transport arm (bug 0010 fix review, F1). QRY-11
          // §non-validation: `cancelled` terminates repair with no debit.
          if (this.#signal.aborted) {
            return { kind: "provider_failure", error: makeCancelledError() };
          }
          // The proximate provider failure terminates repair — no attempts
          // debit (QRY-11 §non-validation / bug 0007).
          return { kind: "provider_failure", error: turn.error };
        }
        if (turn.kind === "text") {
          break;
        }
        await this.runToolBatch();
        slots += 1;
        // QRY-14 ¶3: a valid mid-loop respond-tool call resolves the attempt
        // — the fresh dispatch is skipped exactly as the original phase's
        // early capture skips its initial respond turn.
        if (this.#earlyRespond.captured) {
          break;
        }
      }
      if (this.#earlyRespond.captured) {
        return {
          kind: "respond_outcome",
          turn: { kind: "payload", payload: this.#earlyRespond.payload },
        };
      }
      if (this.#signal.aborted) {
        return { kind: "provider_failure", error: makeCancelledError() };
      }
      // An exhausted restart falls through to the fresh forced dispatch (the
      // `max_rounds`-final branch: typed queries never surface
      // `tool_loop_exhausted`, QRY-16), exactly as a text-terminated one.
      return mapForcedTurnToRepairOutcome(
        await dispatchForcedRespondTurn(respond, [
          ...this.#held,
          { role: "user", content: respond.template, timestamp: 0 },
        ]),
        this.#signal,
      );
    }
    // `max_rounds: 0` (QRY-14 step 2 boundary applied to the restarted loop):
    // NO free-phase call; the fresh dispatch's SINGLE user message is the
    // QRY-12 follow-up text ALONE.
    //
    // Boundary abort check (the r7 discipline, bug 0010 fix review F1):
    // mirrors the live drive's `max_rounds: 0` arm — an abort at this repair
    // boundary is the CancelledError (QRY-11 §non-validation, no debit), and
    // NO post-abort dispatch is issued.
    if (this.#signal.aborted) {
      return { kind: "provider_failure", error: makeCancelledError() };
    }
    return mapForcedTurnToRepairOutcome(
      await dispatchForcedRespondTurn(respond, [
        { role: "user", content: prompt, timestamp: 0 },
      ]),
      this.#signal,
    );
  }

  /**
   * Dispatch ONE free-phase `complete()` over the held conversation: tools =
   * the presented callable set plus (typed) the respond tool, NO `toolChoice`
   * (forcing applies only to the respond dispatch — QRY-14 step 2 / T34),
   * `options.signal` + registry auth threaded. A classified provider failure
   * rides the transport arm (bug 0007); a clean reply JOINS the held
   * conversation, its ToolCall parts (if any) becoming the round's batch.
   */
  async #driveFreePhaseRound(): Promise<FreePhaseTurn> {
    const model = this.#model;
    if (model === undefined) {
      throw new OffSessionModelUnavailableError(
        "H8a: an off-session chained query has no resolved model (ctx.model is undefined).",
      );
    }
    const tools: Tool[] = [
      ...this.#freePhaseTools,
      ...(this.#respond !== undefined ? [respondToolEntry(this.#respond)] : []),
    ];
    const auth = await this.#auth();
    // Bug 0182: a per-round capture, mirroring `#classifyBinderAttempt`'s — a
    // module-level slot would carry one round's status into the NEXT round's
    // classification (CLAUDE.md: no globals/statics/singletons).
    let captured: ProviderResponse | undefined;
    const onResponse = (response: ProviderResponse): void => {
      captured = response;
    };
    // CANCEL-3: attach the swallowing handler at the Promise's construction
    // site, before the first microtask boundary, so a late rejection arriving
    // after the query checkpoint surfaced `cause: "cancelled"` is absorbed.
    const reply: AssistantMessage = await guardQueryProviderPromise(
      complete(
        model,
        {
          messages: [...this.#held],
          // An empty vector is spelled by OMISSION (an untyped query over an
          // empty callable set presents nothing), matching the fused drive's
          // tool-less shape.
          ...(tools.length > 0 ? { tools } : {}),
        },
        { signal: this.#signal, onResponse, ...(auth ?? {}) },
      ),
      signalGuard(this.#signal),
      noopSwallowChannels(),
    );
    const classified = classifyOffSessionReply(model, reply, captured);
    if (classified.kind === "failure") {
      // Bug 0007 / PIC-50: the classified off-session provider failure rides
      // the loop's transport arm — never masked as a terminating `Ok(text)`.
      return { kind: "transport", error: classified.error };
    }
    this.#held.push(reply);
    const calls = reply.content.filter(
      (part): part is ToolCall => part.type === "toolCall",
    );
    if (calls.length > 0) {
      this.#pendingCalls = calls;
      return {
        kind: "tool_use",
        batch: calls.map((call) => ({ toolName: call.name, toolUseId: call.id })),
      };
    }
    return { kind: "text", text: classified.text };
  }

  /**
   * Service ONE held ToolCall (QRY-13). A respond-tool call mirrors the live
   * capture slot's `execute` dispositions — CIO-3 depth walk BEFORE AJV, an
   * AJV failure fed back as an `isError` tool-result so the model can correct
   * in-turn, the first valid call captured one-shot, a repeat valid call
   * acknowledged inertly. Every other name lowers through
   * `lowerModelDrivenToolCall` over the resolved callable-set dispatch (a
   * name outside the set feeds back the unavailable-tool `isError` result —
   * ambient tools are never inherited).
   */
  async #serviceHeldCall(call: ToolCall): Promise<ToolResultMessage> {
    const respond = this.#respond;
    if (respond !== undefined && call.name === respond.toolName) {
      // Bug 0028 §Fix: this driver services the call itself — no host validation
      // and no `prepareArguments` hook on the off-session channel — so the
      // wire→payload mapping is applied here, mirroring the live `execute`.
      const payload = respondPayloadFromWire(respond.lowered, call.arguments);
      const argDepthBreach = enforceModelToolArgDepth(payload);
      if (argDepthBreach !== undefined) {
        return subagentToolResult(call, argDepthBreach.message, true);
      }
      const verdict = respond.validate(payload);
      if (!verdict.ok) {
        return subagentToolResult(call, verdict.message, true);
      }
      if (!this.#earlyRespond.captured) {
        this.#earlyRespond = { captured: true, payload };
        return subagentToolResult(call, RESPOND_CAPTURED_TEXT, false);
      }
      return subagentToolResult(call, RESPOND_REPEAT_TEXT, false);
    }
    return lowerModelDrivenToolCall(call, this.#resolveDispatch(call.name), this.#signal);
  }

  /** The DEGRADED arm's fused single-message completion (pre-0010 mechanism). */
  #completeFused(): Promise<OffSessionCompletion> {
    // CANCEL-3 (cancellation.md §"Race semantics — swallowing-handler
    // attachment on every abandonable Promise"): attach the swallowing handler
    // to the underlying `@`-query provider Promise at its construction site,
    // before the first microtask boundary, so a late rejection arriving after
    // the query checkpoint surfaced `cause: "cancelled"` is absorbed and never
    // reaches Node's `unhandledRejection` process event.
    return guardQueryProviderPromise(
      offSessionComplete(this.#model, this.#queryText),
      signalGuard(this.#signal),
      noopSwallowChannels(),
    );
  }
}

/** The off-session `complete()` path has no resolved model to dispatch against. */
class OffSessionModelUnavailableError extends Error {}

/**
 * STAGE A / ceiling #4 (model-driven row): lower ONE model-driven `tool_use`
 * call over the theta's callable set to the tool-result turn fed back on the
 * next `complete()` turn, reusing the SAME `#resolvePiToolForTheta` / `execute`
 * path the code-driven `<name>(args)` calls use. Extracted from the STAGE-A
 * closure so the model-driven ceiling-#4 seam is deterministically testable
 * against a scripted `PiToolDispatch`.
 *
 * Dispositions, in order:
 *   - a name outside the callable set (`dispatch === undefined`) is an
 *     unavailable-tool `isError` result — ambient tools are never inherited
 *     (frontmatter.md §`tools:`);
 *   - CEILING #4 (ceilings-3-and-4.md#ceiling-4-table, model-driven row;
 *     schema-subset.md §Depth Enforcement point #2; CIO-3 depth-walk-before-AJV):
 *     the theta-owned depth walk runs over the MODEL-produced `call.arguments`
 *     *before* the tool body runs. A depth-6+ argument is fed back to the model
 *     as an `isError` tool-result carrying the canonical depth message — NEVER
 *     dispatched (the host tool's `execute()` is not called), NEVER surfaced as
 *     a theta `Err` or `ModelToolError`. The round still counts against
 *     `tool_loop.max_rounds` (this call runs inside a counted free-phase round)
 *     and the loop continues, re-trying naturally on the model's next turn. AJV
 *     against the presented tool schema cannot catch this — JSON Schema 2020-12
 *     has no `maxDepth` keyword, so the presented schema carries no depth bound;
 *   - a clean resolve lowers to the V14g filter/join text;
 *   - an `execute()` throw lowers to the V14g execution message on an `isError`
 *     result so the model observes the failure and the loop continues.
 */
export async function lowerModelDrivenToolCall(
  call: ToolCall,
  dispatch: PiToolDispatch | undefined,
  toolSignal: AbortSignal,
): Promise<ToolResultMessage> {
  // An execute-less entry is the PIC-64 extension shape (name + `parameters`
  // only). On the MODEL-driven path the host loop holds the tool's `execute` and
  // runs the call itself, so this lowering is never the executor for one; a
  // dispatch that reaches here without an `execute` handle is fed back as an
  // unavailable-tool `isError` result rather than fabricating a success.
  if (dispatch === undefined || typeof dispatch.execute !== "function") {
    return subagentToolResult(
      call,
      `tool '${call.name}' is not available in this theta's callable set`,
      true,
    );
  }
  // Ceiling #4 model-driven row (CIO-3): depth-walk the model-produced
  // arguments before the tool body runs; a breach is fed back to the model and
  // the tool never executes.
  const argDepthBreach = enforceModelToolArgDepth(call.arguments);
  if (argDepthBreach !== undefined) {
    return subagentToolResult(call, argDepthBreach.message, true);
  }
  try {
    const envelope = await dispatch.execute(call.id, call.arguments, toolSignal);
    return subagentToolResult(call, filterJoinToolText(envelope.content), false);
  } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — execute() throw lowered to an error tool-result
    // A model-driven tool `execute()` throw is fed back as an `isError`
    // tool-result (ceiling #4 model-driven row); the loop continues under the
    // same `tool_loop.max_rounds` cap.
    return subagentToolResult(call, lowerToolExecuteThrow(thrown, call.name).message, true);
  }
}

/** Lower a subagent model tool call's outcome text to a fed-back tool-result turn. */
function subagentToolResult(call: ToolCall, text: string, isError: boolean): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: call.id,
    toolName: call.name,
    content: [{ type: "text", text }],
    isError,
    timestamp: 0,
  };
}

/**
 * SUBAG-2 model-callable `.theta`: the injected drive + setup-throw + param-order
 * collaborators the model-driven `.theta` adapter core dispatches through.
 * Extracted so the model-driven `.theta` seam (arg-mapping declaration order,
 * ceiling-#4 depth block, `Result` lowering, setup-throw translation,
 * re-entrancy) is deterministically testable against scripted collaborators —
 * the same extraction rationale as `lowerModelDrivenToolCall` for the Pi-tool
 * seam.
 */
export interface ModelDrivenThetaCall {
  /** The callee's declared `params:` wire names, in DECLARATION ORDER. */
  readonly paramOrder: readonly string[];
  /**
   * Drive the callee (equivalent to `#driveCallee` bound to the caller theta /
   * ctx / chain) over the positional `argValues` mapped from the model's object
   * arguments, returning the callee's top-level `Result` (FN-5).
   */
  readonly driveCallee: (
    argValues: readonly ThetaValue[],
    toolSignal: AbortSignal,
  ) => Promise<ResultValue>;
  /**
   * Translate a non-`HostFatal` pre-eval setup / body throw into the model-facing
   * `{ text, isError: true }` pair, emitting the paired
   * `theta/runtime/internal-error` diagnostic + `theta-system-note` as a side
   * effect (tool-calls.md:30). A `HostFatal` is NEVER passed here — the core
   * re-raises it (NOCEIL-3) before calling.
   */
  readonly onSetupThrow: (thrown: unknown) => LoweredThetaCallableResult;
}

/**
 * SUBAG-2 model-callable `.theta` (tool-calls.md §"Argument shape" / §Concurrency;
 * ceiling #4 model-driven row). Lower ONE model-driven `.theta`-callable
 * `tool_use` call to the model-facing text / `isError` pair, in order:
 *
 *   - CEILING #4 (ceilings-3-and-4.md#ceiling-4-table, model-driven row; CIO-3):
 *     the theta-owned depth walk runs over the MODEL-produced `args` document
 *     BEFORE the callee spawns — a depth-6+ argument is fed back as an `isError`
 *     result and the callee never spawns (identical to `lowerModelDrivenToolCall`
 *     for the Pi-tool arm; `#driveCallee`'s own per-arg `enforceInvokeParamsDepth`
 *     is the separate code-path net);
 *   - the model's object arguments are bound to positional `argValues` in the
 *     callee's `params:` DECLARATION ORDER (the SAME binding a code-side
 *     `<name>(args)` / `invoke(...)` uses) and the callee is driven;
 *   - a clean `Result` lowers via `lowerThetaCallableModelResult` (Ok → text;
 *     Err → `isError`);
 *   - a non-`HostFatal` setup / body throw routes through `onSetupThrow`
 *     (tool-calls.md:30); a `HostFatal` re-raises (NOCEIL-3).
 *
 * Re-entrant: it holds no state; two concurrent calls dispatch through their own
 * `spec.driveCallee`, which spawns an independent `AgentSession` each
 * (tool-calls.md §Concurrency).
 */
export async function lowerModelDrivenThetaCall(
  args: Record<string, unknown>,
  spec: ModelDrivenThetaCall,
  toolSignal: AbortSignal,
): Promise<LoweredThetaCallableResult> {
  const argDepthBreach = enforceModelToolArgDepth(args);
  if (argDepthBreach !== undefined) {
    return { text: argDepthBreach.message, isError: true };
  }
  const argValues = spec.paramOrder.map((name) => (args[name] ?? null) as ThetaValue);
  try {
    return lowerThetaCallableModelResult(await spec.driveCallee(argValues, toolSignal));
  } catch (thrown: unknown) { // allow-broad-catch: theta/runtime/internal-error — `.theta`-adapter pre-eval setup throw (tool-calls.md §"Outcome enumeration")
    // NOCEIL-3 (hard-ceilings): a host fatal is the ONLY thing that propagates
    // (fail-fast); every other throw routes to the internal-error framing.
    if (thrown instanceof HostFatal) {
      throw thrown;
    }
    return spec.onSetupThrow(thrown);
  }
}

/**
 * Render one `@`-query to its wire text, appending the typed-query JSON-only
 * instruction for a schema-typed query. Bug 0010: this fused conveyance
 * survives ONLY on the DEGRADED arm (an unlowerable annotation, no respond
 * context) of both drivers — the two-phase paths open with the bare rendered
 * template and convey the shape via the respond tool + QRY-15 template
 * instead. The degraded conveyance falls back to the annotation text because
 * the schema did not lower.
 *
 * WHY "JSON value" and not "JSON object" (bug 0028 §Fix): a declared `enum`
 * annotation lowers to a non-object root (schema-subset.md:80 —
 * `{ "type": "string", "enum": […] }`), and type-system.md:15 applies the
 * same type grammar to every `@<T>` position, so a bare enum at the
 * annotation root is legal. The instruction wording is shape-agnostic so it
 * stays true of a lowered enum or primitive root, not only an object root.
 */
function renderTypedAwareQueryText(
  expr: QueryExpr,
  env: LexicalEnvironment,
  lowered?: LoweredSchema,
): string {
  const base = renderQueryText(expr, env);
  if (expr.schema === null) {
    return base;
  }
  const shape = lowered !== undefined ? JSON.stringify(lowered) : expr.schema;
  return (
    `${base}\n\nRespond with ONLY a single minified JSON value matching this JSON ` +
    `schema, and nothing else — no prose, no markdown, no code fences: ${shape}`
  );
}

/** The theta body's `schema` declarations, for whole-file named-type resolution. */
function schemaDeclsOf(body: ThetaBody): SchemaDecl[] {
  return body.statements.filter((stmt): stmt is SchemaDecl => stmt.kind === "schema");
}

/**
 * The theta body's `enum` declarations, for whole-file named-type resolution
 * (bug 0028 §Fix: `schemaDeclsOf`'s enum sibling). Both `lowerQueryResponseSchema`
 * call sites pass this alongside `schemaDeclsOf` so a declared `enum`
 * annotation (`@<Severity>`) resolves at the typed-query / `invoke<T>`
 * lowering exactly as it already does on the `params:` path.
 */
function enumDeclsOf(body: ThetaBody): EnumDecl[] {
  return body.statements.filter((stmt): stmt is EnumDecl => stmt.kind === "enum");
}

/** An identifier-shaped `@<Schema>` annotation names a `schema` decl. */
const SCHEMA_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A `resolveDeclaredSchema` step (QRY-22): a named `@<Schema>` annotation
 * resolves whole-file via `env.resolveSchema` (previously uncalled); an inline
 * annotation resolves to its verbatim source.
 */
function resolveDeclaredShape(expr: QueryExpr, env: LexicalEnvironment): () => unknown {
  const annotation = (expr.schema ?? "").trim();
  return () =>
    SCHEMA_NAME.test(annotation) ? env.resolveSchema(annotation) : annotation;
}

/** Concatenate the text content of an assistant message (thinking / tool calls omitted). */
function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/**
 * The classified resolution of one off-session `complete()` dispatch (bug
 * 0007): the reply's assistant text on a normal terminator, or the classified
 * provider failure. A resolved discriminated value — never throw-based control
 * flow: pi-ai's `complete()` RESOLVES its provider failures (the per-API
 * adapter converts every caught throw into a reply carrying `stopReason:
 * "error"`), so classification is a probe over the resolved reply, not a
 * `catch`.
 */
type OffSessionCompletion =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "failure"; readonly error: TransportError | ContextOverflowError };

/**
 * The stop reasons that terminate an off-session turn normally. pi-ai's
 * `StopReason` union spells the turn boundary `"stop"` and the tool boundary
 * `"toolUse"`; the spec's stop-reason arm names `end_turn` / `stop` /
 * `tool_use` (provider-error-mapping.md §Stop-reason classification) — both
 * spellings are covered so neither surface's normal terminator is ever
 * classified as a failure.
 */
const OFF_SESSION_NORMAL_STOP_REASONS: ReadonlySet<string> = new Set([
  "stop",
  "end_turn",
  "toolUse",
  "tool_use",
]);

/**
 * Resolve a query / respond-repair follow-up prompt off-session through pi-ai's
 * `complete()` free function (no user session turn), classifying the resolved
 * reply BEFORE text extraction (bug 0007; PIC-50: the off-session `complete()`
 * call's "provider failures are classified through the Provider error mapping
 * table exactly as the binder's `complete()` call is"). Shared by the
 * off-session query driver and the off-session respond-repair follow-up drive.
 */
async function offSessionComplete(
  model: Model<Api> | undefined,
  prompt: string,
): Promise<OffSessionCompletion> {
  if (model === undefined) {
    throw new OffSessionModelUnavailableError(
      "H8a: an off-session chained query has no resolved model (ctx.model is undefined).",
    );
  }
  // Bug 0182: a per-call capture, mirroring `#classifyBinderAttempt`'s — a
  // module-level slot would carry this call's status into the NEXT fused
  // completion's classification (CLAUDE.md: no globals/statics/singletons).
  let captured: ProviderResponse | undefined;
  const onResponse = (response: ProviderResponse): void => {
    captured = response;
  };
  const reply: AssistantMessage = await complete(
    model,
    {
      messages: [{ role: "user", content: prompt, timestamp: 0 }],
    },
    { onResponse },
  );
  return classifyOffSessionReply(model, reply, captured);
}

/**
 * Bug 0007: probe the resolved off-session reply's `stopReason` before any
 * text extraction. pi-ai's `complete()` never rejects on a provider failure —
 * the per-API adapter resolves it as a reply carrying `stopReason: "error"`
 * (+ optional `errorMessage`) — so this probe is the only failure surface of
 * the off-session call. A normal terminator passes through to the text
 * extraction; EVERY other string `stopReason` (`"error"`, `"length"`,
 * `"aborted"`, `"content_filter"`, any unrecognised) routes through the
 * existing `classifyProviderResponse` table with the status THIS call
 * actually captured (bug 0182): `httpStatus: captured?.status ?? null`.
 * `ProviderClassifierInput.httpStatus`'s own doc-comment
 * (`src/binder/provider-error-mapping.ts`) admits only a real captured value
 * or that `null` — nothing else — so a caller whose `onResponse` never fires
 * feeds the classifier the network-level `null` class, never a stand-in 200.
 */
function classifyOffSessionReply(
  model: Model<Api>,
  reply: AssistantMessage,
  captured: ProviderResponse | undefined,
): OffSessionCompletion {
  const provider = String(model.api);
  const stopReason = (reply as { readonly stopReason?: string }).stopReason;
  // A non-string/absent `stopReason` is not a provider failure: pi-ai always
  // sets the field on a resolved reply, so only a fabricated double reaches
  // here without one — treat it as a normal terminator rather than classifying
  // fixture shorthand as a transport failure.
  if (typeof stopReason !== "string" || OFF_SESSION_NORMAL_STOP_REASONS.has(stopReason)) {
    // PIC-53 disposition: a pure tool-use turn that produced no assistant text
    // yields the empty string — a legitimate `Ok("")`, distinct from the
    // error-stop empty content classified below.
    return { kind: "text", text: assistantText(reply) };
  }
  const errorMessage = (reply as { readonly errorMessage?: string }).errorMessage;
  const partialText = assistantText(reply);
  const classified = classifyProviderResponse({
    api: provider,
    httpStatus: captured?.status ?? null,
    stopReason,
    ...(typeof errorMessage === "string" ? { errorMessage } : {}),
    rawResponse: partialText !== "" ? partialText : null,
  });
  // Stop-reason classification (provider-error-mapping.md): the overflow arm
  // (`length`, or an overflow-signature `errorMessage`) surfaces the
  // classifier's `ContextOverflowError` verbatim — token extraction and
  // `raw_response` included.
  if (classified.kind === "context_overflow") {
    return { kind: "failure", error: classified as ContextOverflowError };
  }
  // Every other classification folds to the pinned off-session transport
  // surface — the binder's fold: message from the classifier, fixed surface
  // fields. The off-session transport surface is pinned (PIC-51 / bug
  // 0007): `http_status: null` and `retryable: false` regardless of any
  // captured status; `provider` is the resolved model's api-shaped `.api`
  // (queryerror-variants.md provider derivation — the model this wrapper
  // actually dispatched, not ctx's user-session model). An empty/absent
  // classifier message takes PIC-51's fixed fallback.
  const message =
    classified.kind === "transport" && classified.message !== ""
      ? classified.message
      : PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE;
  return {
    kind: "failure",
    error: {
      kind: "transport",
      message,
      http_status: null,
      provider,
      retryable: false,
    },
  };
}

/**
 * The synthesised respond tool as a pi-ai `Tool` entry: the PIC-44 registered
 * name, the fixed description literal, and the response schema's WIRE form as
 * `parameters` (the same `Type.Unsafe` wrap the binder call shape uses; bug
 * 0028 §Fix envelopes a non-object lowered root, which no argument object can
 * satisfy). ONE builder feeds the forced respond dispatch's `context.tools` AND
 * the off-session free phase's presentation (bug 0010 increment D), so the tool
 * the model sees mid-loop and the tool the provider is forced to are
 * byte-identical by construction.
 */
function respondToolEntry(respond: RespondTurnContext): Tool {
  return {
    name: respond.toolName,
    description: RESPOND_TOOL_DESCRIPTION,
    parameters: Type.Unsafe<unknown>(respondToolWireSchema(respond.lowered)),
  };
}

/**
 * Bug 0010 (QRY-14 step 2 / SLSH-2 / conversation-drive.md typed bullet):
 * dispatch ONE typed-query forced respond turn OFF-SESSION through pi-ai's
 * `complete()` free function — the binder's channel, the only one that carries
 * `options.toolChoice` (spec finding T34). `context.tools` is exactly the
 * synthesised respond tool, the tool choice is forced to it, the theta signal
 * and registry auth thread as options, and the reply resolves to the seam's
 * `ForcedRespondTurn`:
 *
 *   - EXTRACTION FIRST (binder-inference.md rule): the FIRST `ToolCall` content
 *     part naming the respond tool supplies the payload from its `arguments` —
 *     success extraction PRECEDES stopReason classification, so a late `error`
 *     stop never launders a delivered payload into a transport Err.
 *   - No matching call + a non-normal stopReason: the 0007/0009-aligned
 *     stop-reason classification (`classifyOffSessionReply`), provider = the
 *     RESOLVED RESPOND MODEL's `.api` (queryerror-variants.md §provider
 *     derivation). A non-string/absent stopReason stays a NORMAL terminator
 *     (fixture shorthand is never classified as a failure).
 *   - No matching call + a normal stopReason: ERR-17 non-compliance —
 *     `wrong_tool` when any ToolCall is present (first block's name), else
 *     `plain_text`; `raw_response` = the assistant text, or null when empty.
 *
 * A REJECTED `complete()` promise (pi-ai resolves provider failures, so a
 * rejection is abort/defect-shaped) maps to the transport arm: "cancelled"
 * when the theta signal aborted, else the coerced throw message.
 */
async function dispatchForcedRespondTurn(
  respond: RespondTurnContext,
  messages: readonly Message[],
): Promise<ForcedRespondTurn> {
  if (respond.signal.aborted) {
    // Pre-dispatch abort gate (bug 0010 fix review, F1 — the r7 discipline
    // generalised to EVERY forced respond dispatch): an already-aborted theta
    // signal must never reach `complete()` — a post-abort provider call is
    // token waste against a cancelled query and its reply could only be
    // discarded. The fixed "cancelled" transport shape is returned for the
    // seam's totality; the typed loop maps a signal-aborted transport outcome
    // to its CANCELLED arm (cancellation.md §Surfacing), so this shape is not
    // author-visible on the loop path.
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: "cancelled",
        http_status: null,
        provider: String(respond.model?.api ?? "unknown"),
        retryable: false,
      },
    };
  }
  if (respond.model === undefined) {
    // No frontmatter `model:` resolution and no session-pinned `ctx.model`:
    // there is nothing to dispatch against — a transport Err with the fixed
    // sentinel provider, mirroring the off-session model-unavailable posture.
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: "no resolved model for the typed-query forced respond turn",
        http_status: null,
        provider: "unknown",
        retryable: false,
      },
    };
  }
  const model = respond.model;
  const provider = String(model.api);
  const tool: Tool = respondToolEntry(respond);
  const auth = await respond.auth();
  // Bug 0182: a per-dispatch capture, mirroring `#classifyBinderAttempt`'s —
  // each forced respond call (a fresh attempt, or a repair restart) is its
  // own invocation, so a module-level slot would carry one dispatch's status
  // into the next's classification (CLAUDE.md: no globals/statics/singletons).
  let captured: ProviderResponse | undefined;
  const onResponse = (response: ProviderResponse): void => {
    captured = response;
  };
  const options: Record<string, unknown> = {
    // The forced tool choice — the entire content of spec finding T34
    // (`pi.sendUserMessage` exposes no toolChoice; `complete()` is the channel)
    // — spelled per the resolved respond model's api (bug 0010 fix round 1;
    // see FORCED_TOOL_CHOICE_BY_API in binder/forced-tool-choice.ts, shared
    // with the binder inference call since bug 0011).
    toolChoice: forcedToolChoiceForApi(provider, respond.toolName),
    // CANCEL-4-style in-flight forwarding: the theta signal threads into the
    // provider invocation so an abort during the call propagates.
    signal: respond.signal,
    onResponse,
    ...(auth ?? {}),
  };
  let reply: AssistantMessage;
  try {
    reply = await complete(model, { messages: [...messages], tools: [tool] }, options);
  } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — an aborted/defective complete() rejection → transport Err
    if (respond.signal.aborted) {
      // Mirrors `#classifyBinderAttempt`: an abort observed at the rejection is
      // the cancellation, not a retryable transport failure; the loop's
      // checkpoint surfaces `cancelled` downstream.
      return {
        kind: "transport",
        error: {
          kind: "transport",
          message: "cancelled",
          http_status: null,
          provider,
          retryable: false,
        },
      };
    }
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: coerceUnderlyingString(thrown),
        http_status: null,
        provider,
        retryable: false,
      },
    };
  }
  // EXTRACTION FIRST (binder-inference.md): the first ToolCall naming the
  // respond tool supplies the payload — before ANY stopReason probe.
  const calls = reply.content.filter(
    (part): part is ToolCall => part.type === "toolCall",
  );
  const match = calls.find((call) => call.name === respond.toolName);
  if (match !== undefined) {
    // Bug 0028 §Fix: the forced dispatch reads the provider's arguments
    // directly (no host validation runs on this channel), so the wire→payload
    // mapping the on-session `execute` gets from `prepareArguments` + the
    // envelope unwrap is applied here explicitly — same function, same result
    // for the same wire bytes.
    return { kind: "respond", payload: respondPayloadFromWire(respond.lowered, match.arguments) };
  }
  // Aborted precedence (bug 0010 fix round 1): pi-ai's `complete()` RESOLVES
  // an abort — the adapter surfaces `stopReason: "aborted"` rather than
  // rejecting — so the catch arm below never sees it. Mirror the prompt path's
  // aborted precedence here: an aborted signal or an aborted-stop reply maps
  // to the fixed "cancelled" transport Err (the loop's checkpoint surfaces
  // `cancelled` downstream), never to ERR-17 non-compliance (an abort is not
  // the model declining the tool). Extraction above still wins when a matching
  // ToolCall is present — a raced valid answer is a valid answer.
  const stopReason = (reply as { readonly stopReason?: string }).stopReason;
  if (respond.signal.aborted || stopReason === "aborted") {
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: "cancelled",
        http_status: null,
        provider,
        retryable: false,
      },
    };
  }
  // No matching call: classify the stop reason through the 0007/0009-aligned
  // table (provider = the resolved RESPOND model's `.api`).
  const classified = classifyOffSessionReply(model, reply, captured);
  if (classified.kind === "failure") {
    return { kind: "transport", error: classified.error };
  }
  // ERR-17: a normal terminator with no matching respond call is
  // non-compliance — `wrong_tool` when the model called something else,
  // `plain_text` when it called nothing.
  const branch: ForcedRespondBranch =
    calls.length > 0
      ? {
          kind: "wrong_tool",
          providerToolName: calls[0]!.name,
          respondToolName: respond.toolName,
        }
      : { kind: "plain_text" };
  const raw = assistantText(reply);
  return { kind: "noncompliance", branch, raw_response: raw !== "" ? raw : null };
}

/**
 * The off-session respond-repair follow-up drive (QRY-10 §respond-repair): map
 * the classified wrapper for `driveFollowUp` — reply text on success, the
 * discriminated `FollowUpDriveFailure` on a provider failure so the proximate
 * `QueryError` terminates repair with no `attempts` debit (bug 0007: the
 * unclassified drive laundered the failure into the schema-validation channel,
 * re-driving the dead provider once per attempt).
 */
async function offSessionFollowUp(
  model: Model<Api> | undefined,
  prompt: string,
): Promise<string | FollowUpDriveFailure> {
  const completion = await offSessionComplete(model, prompt);
  return completion.kind === "text"
    ? completion.text
    : { kind: "provider_failure", error: completion.error };
}

/**
 * Drive ONE user-visible streamed turn against the shared user session and
 * return its trailing-turn assistant text. Mirrors `LivePromptQueryModel`'s turn
 * drive: install the caller-supplied active tools for the turn, issue the
 * fire-and-forget `pi.sendUserMessage`, then observe the run through
 * `ctx.isIdle()` (wait for it to begin streaming, then to go idle again) and the
 * `ctx.waitForIdle()` completion barrier — all bounded on the injected `Clock`.
 *
 * Bug 0010 increment C: this is NO LONGER the typed repair drive — the live
 * typed path repairs through `LivePromptQueryModel.driveRepairAttempt` (the
 * QRY-14 ¶3 two-phase restart). The sole remaining caller is the DEGRADED
 * typed arm (`respond` context absent: an unlowerable annotation), whose
 * repair follow-ups still drive one streamed turn and text-parse its trailing
 * reply so typed behaviour stays total for unlowerable schemas.
 *
 * Bug 0288 §Fix item 5: brought onto the SAME turn-completion contract as
 * `LivePromptQueryModel.#driveUserVisibleTurn` — the pre-send idle gate,
 * the settled-slice-aware start poll, the bounded end poll / bounded
 * `waitForIdle` race / bounded settle poll — rather than duplicated as a
 * second copy of the OLD idle-poll hole (bug doc P7: this free function was
 * exactly that second copy). Chosen over deleting it: this is the DEGRADED
 * arm's only repair-follow-up drive (no respond tool to restart through
 * `driveRepairAttempt`), so removing it would drop repair follow-ups for
 * unlowerable schemas entirely rather than fix their contract — the smaller,
 * more honest change keeps the call site and widens its return type to the
 * `FollowUpDriveFailure` shape the caller (`driveFollowUp`,
 * production-theta-producer.ts's `#resolvePromptQuery`) already accepts for
 * every other arm, giving a bound expiry here the same home a transport
 * failure has everywhere else.
 */
async function driveStreamedUserTurn(deps: {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionCommandContext;
  readonly clock: Clock;
  readonly queryText: string;
  /**
   * QTL-4: the active tool names to install for the turn — the theta's
   * callable-set underlying Pi-tool names for a query follow-up. (The binder
   * never drives a streamed user turn: it runs off-session through the forced
   * structured-output `complete()` call, binder-inference.md.)
   */
  readonly activeTools: readonly string[];
  /** PIC-50/51: the resolved provider for a synthesised `TransportError` on a bound expiry. */
  readonly provider: string;
}): Promise<string | FollowUpDriveFailure> {
  const readMessages = (): readonly Message[] =>
    buildSessionContext(
      deps.ctx.sessionManager.getEntries(),
      deps.ctx.sessionManager.getLeafId(),
    ).messages as unknown as readonly Message[];
  // Every bounded wait below also stops promptly on an observed cancellation:
  // a cancelled dispatch must not sit out the full bound before answering.
  const pollWhile = async (condition: () => boolean, bound: number): Promise<boolean> => {
    for (let i = 0; i < bound && condition() && deps.ctx.signal?.aborted !== true; i += 1) {
      await macrotask(deps.clock, POLL_INTERVAL_MS);
    }
    return !condition();
  };
  /**
   * A bounded wait's expiry, UNLESS the dispatch was cancelled. This arm has no
   * `thetaAbort` in scope, so it mints no cancellation classification of its
   * own: on an observed abort it returns exactly what HEAD returned from every
   * exit of this function — the trailing turn's text — leaving the caller's
   * own cancellation handling in charge.
   */
  const expired = (
    phase: PromptModeTurnLifecyclePhase,
    boundMs: number,
  ): string | FollowUpDriveFailure =>
    deps.ctx.signal?.aborted === true
      ? extractTrailingTurnText(readMessages())
      : {
          kind: "provider_failure",
          error: mapPromptModeTurnLifecycleExpiry(phase, boundMs, deps.provider),
        };
  const ambientTools = deps.pi.getActiveTools();
  deps.pi.setActiveTools([...deps.activeTools]);
  try {
    // §Fix item 1: the same pre-send gate as the method — no send while the
    // session reports a run in flight, and no settledness demand over the
    // user's ambient conversation (see the method's own gate for why).
    const gateCleared = await pollWhile(() => !deps.ctx.isIdle(), PRE_SEND_GATE_POLL_BOUND);
    if (!gateCleared) {
      return expired("pre-send-gate", PRE_SEND_GATE_POLL_BOUND * POLL_INTERVAL_MS);
    }
    const turnStart = readMessages().length;
    deps.pi.sendUserMessage(deps.queryText);
    // §Fix item 3: settled-slice-aware start poll — a turn that starts and
    // finishes inside one poll interval is not an unstarted turn.
    const startCleared = await pollWhile(
      () => deps.ctx.isIdle() && !thisTurnSettled(readMessages(), turnStart),
      TURN_START_POLL_BOUND,
    );
    if (!startCleared) {
      return expired("start", TURN_START_POLL_BOUND * POLL_INTERVAL_MS);
    }
    if (!deps.ctx.isIdle()) {
      // §Fix item 4: bounded end poll, bounded `waitForIdle` race, bounded
      // settle poll — skipped entirely on the fast path (settled without the
      // run ever being observed non-idle).
      const endCleared = await pollWhile(() => !deps.ctx.isIdle(), TURN_END_POLL_BOUND);
      if (!endCleared) {
        return expired("settle", TURN_END_POLL_BOUND * POLL_INTERVAL_MS);
      }
      // The losing leg's timer is cleared after the race, so the common path
      // (`waitForIdle()` wins) leaves no live timer holding the event loop.
      let idleSettled = false;
      let idleBoundTimer: TimerHandle | undefined;
      const idleBound = new Promise<void>((resolve) => {
        idleBoundTimer = deps.clock.setTimeout(() => resolve(), WAIT_FOR_IDLE_BOUND_MS);
      });
      try {
        await Promise.race([ // allow: cka-62 — pi-integration-contract/conversation-drive.md
          deps.ctx.waitForIdle().then(() => {
            idleSettled = true;
          }),
          idleBound.then(() => {}),
        ]);
      } finally {
        if (idleBoundTimer !== undefined) {
          deps.clock.clearTimeout(idleBoundTimer);
        }
      }
      if (!idleSettled) {
        return expired("settle", WAIT_FOR_IDLE_BOUND_MS);
      }
      const settleCleared = await pollWhile(
        () => !thisTurnSettled(readMessages(), turnStart),
        TURN_SETTLE_POLL_BOUND,
      );
      if (!settleCleared) {
        return expired("settle", TURN_SETTLE_POLL_BOUND * POLL_INTERVAL_MS);
      }
    }
  } finally {
    deps.pi.setActiveTools(ambientTools);
  }
  return extractTrailingTurnText(readMessages());
}

/**
 * Derive the argument-echo `EchoType` for a bound value, VALUE-driven so it can
 * never mismatch the value's runtime shape and crash the renderer. The lowered
 * params property (when available) disambiguates `integer` from `number`; every
 * other arm is decided from the runtime value. This function reads the
 * AJV-validated MERGED `args` (`#emitBinderEchoNote`'s `mergedArgs`), which are
 * wire form throughout, so a named-enum value arrives here as the bare JSON
 * string AJV admitted — never as the runtime's boxed `String` carrier
 * (`makeEnumValue`, `runtime/value.ts`) — and the `string` arm is the one it
 * takes. Each array element is described by itself, not by element 0's shape, so
 * a heterogeneous array (an `anyOf` items schema) never misdescribes an element
 * it did not derive from. Object fields are taken from the value's own keys in
 * insertion order (declaration order for a binder-returned object).
 */
function echoTypeFromValue(value: ThetaValue, property: unknown): EchoType {
  if (typeof value === "string") {
    return { kind: "string" };
  }
  if (typeof value === "number") {
    return { kind: loweredSchemaKindIsInteger(property, value) ? "integer" : "number" };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean" };
  }
  if (value === null) {
    return { kind: "null" };
  }
  if (Array.isArray(value)) {
    const itemProp =
      typeof property === "object" && property !== null
        ? (property as Record<string, unknown>)["items"]
        : undefined;
    // Every element is described by ITSELF (the same discipline the object arm
    // below already applies to its fields), so an `anyOf` items schema —
    // `array<T | null>` or an array of discriminated-union variants — yields
    // one descriptor per variant instead of element 0's shape misdescribing
    // the rest (docs/bugs/0092-renderobject-first-field-unguarded-cast.md).
    const elements = value.map((el) => echoTypeFromValue(el as ThetaValue, itemProp));
    return { kind: "array", elements };
  }
  // A plain object value: render by its own keys in insertion order.
  const props =
    typeof property === "object" && property !== null
      ? ((property as Record<string, unknown>)["properties"] as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const fields = Object.entries(value as Record<string, ThetaValue>).map(
    ([name, fieldValue]) => ({
      name,
      type: echoTypeFromValue(fieldValue, props?.[name]),
    }),
  );
  return { kind: "object", fields };
}

/**
 * Whether the lowered params property declares `integer` (BNDR-4 renders
 * `integer` vs `number` from the static kind, never runtime integrality). Falls
 * back to the runtime value's integrality when the property is unavailable.
 */
function loweredSchemaKindIsInteger(property: unknown, value: number): boolean {
  if (typeof property === "object" && property !== null) {
    const type = (property as Record<string, unknown>)["type"];
    if (type === "integer") {
      return true;
    }
    if (type === "number") {
      return false;
    }
    if (Array.isArray(type)) {
      if (type.includes("integer") && !type.includes("number")) {
        return true;
      }
      if (type.includes("number")) {
        return false;
      }
    }
  }
  return Number.isInteger(value);
}

/**
 * Extract the YAML frontmatter block (the text between the leading `---` fence
 * and the next `---` line) from a `.theta` source, or `undefined` when the file
 * carries no fenced frontmatter. Mirrors the parser's own block isolation so the
 * re-read reads the same YAML the loader parsed; the `\r` trim handles CRLF
 * files. Used only to recover declared `params:` default literals the parsed
 * frontmatter does not retain.
 */
function extractFrontmatterYaml(source: string): string | undefined {
  const lines = source.split("\n");
  const isFence = (line: string | undefined): boolean =>
    line !== undefined && line.replace(/\r$/, "") === "---";
  if (!isFence(lines[0])) {
    return undefined;
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (isFence(lines[i])) {
      return lines.slice(1, i).join("\n");
    }
  }
  return undefined;
}

/**
 * Split a `params:` field value scalar (`<type-expr>` optionally followed by
 * `= <literal>`) at the first top-level `=` — one not nested inside `<...>`
 * angles, `{...}` braces, `[...]` brackets, or a `"`/`'` string literal (so
 * `array<string> = []` and `Author = { name: "x" }` split correctly, and an
 * `==`/`>=` inside a default is not mistaken for the separator) — returning the
 * default RHS, or `undefined` when the field declared no default. Kept in step
 * with the parser's own `splitParamValue` so a recovered default matches the
 * literal the loader validated.
 */
function splitParamDefaultSource(raw: string): string | undefined {
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (quote !== undefined) {
      if (c === "\\" && i + 1 < raw.length) {
        i += 1;
      } else if (c === quote) {
        quote = undefined;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "<" || c === "{" || c === "[") {
      depth += 1;
      continue;
    }
    if (c === ">" || c === "}" || c === "]") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && c === "=" && raw[i + 1] !== "=" && raw[i - 1] !== "=") {
      return raw.slice(i + 1).trim();
    }
  }
  return undefined;
}

/**
 * Render one `@`-query template to its wire text against the lexical
 * environment: lex the template into literal / `${…}` interpolation parts,
 * evaluate each interpolation as a full expression (expressions.md
 * §"Supported forms" — not a dotted-path subset), stringify the resulting
 * runtime value by the QRY-18 rule, and apply the QRY-7 newline-trim → dedent
 * normalisation. An interpolation whose source does not parse, or that has no
 * pure runtime value (an effectful `fn` body / tool-call), yields the inert
 * `null` render — this render's own fallback, not a rule expressions.md states
 * (bug 0116) — rather than a throw; a `Result`-valued interpolation the static
 * type-layer gate could not prove instead aborts the theta with QRY-18's
 * runtime-fallback panic (see `stringifyInterpolation`).
 */
function renderQueryText(expr: QueryExpr, env: LexicalEnvironment): string {
  const lexed = lexQueryTemplate(expr.template);
  let text = "";
  for (const part of lexed.parts) {
    if (part.kind === "text") {
      text += part.value;
      continue;
    }
    text += stringifyInterpolation(part.exprSource, env);
  }
  return renderTemplateText(text);
}

/**
 * Evaluate one `${…}` interpolation source and stringify its runtime value by
 * the QRY-18 rule. The source is parsed into the same `Expr` a `let` RHS parses
 * to and evaluated by the shared pure evaluator, so arithmetic, indexing, calls,
 * method calls, ternaries, and `Enum.Variant` access all render their value
 * (EXPR-1/6/7/8, QRY-2/3/4). The `InterpolationType` discriminator is derived
 * from the resulting runtime `ThetaValue` — numbers route through the canonical
 * decimal renderer (so `Infinity`/`NaN` render as `Infinity`/`NaN`, not
 * `null`), an enum renders its bare unquoted wire value, and arrays/objects
 * render as compact JSON. A `Result` value reaching this render is one the
 * static type-layer gate (`src/parser/type-layer-checks.ts`) left unproven: it
 * refuses the load only where the expression's `Result`-ness is certain from its
 * provenance, and defers every other shape — a binding laundered through an
 * unannotated `fn`, a `Result` reached through an operand the inference layer
 * narrows, a `Result` held inside a container. Those shapes arrive here, so this
 * render raises `INTERPOLATED_RESULT_CODE` as a panic (QRY-18's runtime
 * fallback) instead of serialising the interpreter-private carrier (bug 0079).
 */
function stringifyInterpolation(source: string, env: LexicalEnvironment): string {
  const parsed = parseExpressionSource(source);
  if (parsed === null) {
    // An unparseable interpolation has no value; render the inert `null` rather
    // than throwing out of the render path — this render's own fallback, not a
    // rule expressions.md states (bug 0116).
    return "null";
  }
  const value = evaluatePureExpression(parsed, env);
  const type = interpolationTypeOf(value);
  const reach: NestedResultReach = { found: false };
  if (type.kind === "object" || type.kind === "array") {
    // QRY-18: a Schema-typed object / `array<T>` interpolation renders as compact
    // `JSON.stringify` with wire-name translation applied recursively. The
    // outbound pass rewrites every renamed field to its wire name at every
    // nesting level, driven by each object value's declaring-schema brand (with
    // the declared field type as a fallback for un-branded nested values); theta
    // code never sees a wire name, and the model never sees a theta-side name.
    const lowered = translateInterpolationOutbound(value, env, reach);
    if (!reach.found) {
      return JSON.stringify(lowered);
    }
    // The lowering reached a branded `Result` somewhere inside the container.
    // Containment does not change QRY-18's disposition (bug 0114): the lowered
    // tree is discarded unrendered, and the value falls to the `Result` arm
    // below — the same arm the top-level case already uses.
  }
  const rendered = stringifyInterpolatedValue(value, reach.found ? { kind: "result" } : type);
  if (!rendered.ok) {
    // QRY-18's runtime fallback (bug 0079, reached at the nested position too
    // per bug 0114): a `Result` reaching this render — top-level or nested
    // inside a container, at any depth — is one the static gate left unproven,
    // so it aborts the theta with the same registered code rather than
    // rendering the carrier. The sole runtime raise, for both positions.
    raiseInterpolatedResult(rendered.diagnostic.message);
  }
  return rendered.text;
}

/**
 * The single runtime raise of `theta/parse/interpolated-result` in `src/` (bug
 * 0079 §Fix, preserved as a structural constraint). Factored so the `try` arm's
 * propagate branch and this render's `Result`-row branch reach ONE construction
 * site: two `throw` statements are two dispositions free to drift, which is the
 * drift the one-raise rule exists to prevent. `never`, so every caller's
 * control flow narrows past it.
 */
function raiseInterpolatedResult(message: string): never {
  throw new InterpolatedResultPanic(message);
}

/**
 * Whether the outbound lowering (`translateInterpolationOutbound`) reached a
 * branded `Result` anywhere inside the interpolated value. Threaded down the
 * walk as an explicit parameter — no global, no module state — so the reach is
 * exact at whatever depth the lowering itself visits, which is what "no
 * carrier keys at any depth" (bug 0114) requires.
 *
 * No depth cap: this rides the walk `translateInterpolationOutbound` already
 * performs for QRY-18's wire-name translation rather than adding a second
 * traversal, so there is no new depth walk for CIO-3's `MAX_JSON_DEPTH`
 * discipline to bound. A cap here would admit past it the very `Result` this
 * reach exists to catch — the shape of defect bug 0187 documents at a
 * different boundary — trading one leak for another instead of closing this
 * one.
 */
interface NestedResultReach {
  found: boolean;
}

/**
 * Recursively lower an object/array interpolation value to its wire-named JSON
 * form (QRY-18 outbound wire-name translation, runtime-value-model.md §Wire-name
 * translation). Each object-schema value renames its fields theta→wire using the
 * schema resolved from the value's declaring-schema brand (attached at
 * construction) — falling back to the declared field type `typeHint` for a value
 * that carries no brand (e.g. a bare object literal in a schema-typed field).
 * Enum values collapse to their bare wire string; arrays recurse element-wise;
 * primitives pass through. A value whose schema cannot be resolved recurses with
 * its keys unchanged (the safe no-rename default).
 *
 * A branded `Result` reached at any depth records `reach.found` and returns
 * immediately, ahead of schema resolution: `schemaTagOf` never resolves one
 * (it carries `RESULT_TAG`, not `SCHEMA_TAG`), so falling through to the
 * no-rename default would copy its carrier keys straight through unchanged
 * (bug 0114). Classification is `isResultValue` — the non-enumerable brand —
 * never the `{ ok, … }` shape, so an ordinary object whose own declared fields
 * spell `ok` still falls through to that path unchanged (bug 0017).
 */
function translateInterpolationOutbound(
  value: ThetaValue,
  env: LexicalEnvironment,
  reach: NestedResultReach,
  typeHint?: string,
): unknown {
  if (isEnumValue(value)) {
    // The enum brand is dropped; the model only ever sees the bare wire string.
    return String(value);
  }
  if (Array.isArray(value)) {
    const elementHint = typeHint !== undefined ? arrayElementTypeSource(typeHint) : undefined;
    return value.map((element) => translateInterpolationOutbound(element, env, reach, elementHint));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (isResultValue(value)) {
    reach.found = true;
    return value;
  }

  // Resolve the declaring schema: the construction-time brand is authoritative;
  // an un-branded value falls back to the declared field type when that names a
  // resolvable schema (a bare object literal resolves to neither and recurses
  // with its keys unchanged).
  const hintName = typeHint !== undefined ? identifierTypeSource(typeHint) : undefined;
  const brand = schemaTagOf(value);
  const schemaName =
    brand ?? (hintName !== undefined && env.resolveSchema(hintName) !== undefined ? hintName : undefined);
  const decl = schemaName !== undefined ? env.resolveSchema(schemaName) : undefined;
  const fields = new Map<string, { readonly wire: string; readonly type: string }>();
  if (decl?.fields !== undefined) {
    for (const field of decl.fields) {
      fields.set(field.name, { wire: field.wireName ?? field.name, type: field.typeSource });
    }
  }

  // The wire key is as author-controlled as the theta-side name: a rename is
  // constrained to a non-empty string literal and nothing more (schemas.md:43),
  // so the inherited-accessor hazard reaches this write too. Defining the key
  // keeps the QRY-18 render `JSON.stringify` of the value with wire-name
  // translation applied (query-escapes-stringification.md:27) for every
  // admitted wire name, the prototype-accessor spelling included.
  const result: Record<string, unknown> = {};
  for (const [thetaKey, fieldValue] of Object.entries(value)) {
    const field = fields.get(thetaKey);
    const wireKey = field?.wire ?? thetaKey;
    defineRecordField(result, wireKey, translateInterpolationOutbound(fieldValue, env, reach, field?.type));
  }
  return result;
}

/** The leading identifier of a type-expression source (`Inner`), else `undefined`. */
function identifierTypeSource(source: string): string | undefined {
  const s = source.trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : undefined;
}

/** The element type source of an `array<T>` type-expression source, else `undefined`. */
function arrayElementTypeSource(source: string): string | undefined {
  const m = /^array<(.+)>$/.exec(source.trim());
  return m !== null ? (m[1] as string).trim() : undefined;
}

/**
 * Derive the QRY-18 `InterpolationType` discriminator from a runtime
 * `ThetaValue`. A number uses the `number` rule (canonical decimal, no trailing
 * `.0`, `Infinity`/`NaN` verbatim); an enum uses the bare-wire `enum` rule; a
 * `Result` is classified by its interpreter-private brand — never by key
 * presence, so an ordinary object carrying a boolean `ok` field still takes
 * the `object` arm below (bug 0017) — ahead of the `object` fall-through, so
 * `stringifyInterpolation` can raise QRY-18's runtime fallback for it instead
 * of serialising the carrier (bug 0079).
 */
function interpolationTypeOf(value: ThetaValue): InterpolationType {
  if (typeof value === "string") {
    return { kind: "string" };
  }
  if (typeof value === "number") {
    return { kind: "number" };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean" };
  }
  if (value === null) {
    return { kind: "null" };
  }
  if (isEnumValue(value)) {
    return { kind: "enum" };
  }
  if (Array.isArray(value)) {
    return { kind: "array" };
  }
  if (isResultValue(value)) {
    return { kind: "result" };
  }
  // A plain object schema value — compact JSON.
  return { kind: "object" };
}

/**
 * Evaluate a pure (non-checkpointed) sub-expression against the environment.
 * The shipped test thetas' pure sub-expressions are literal / identifier reads;
 * an identifier that resolves to a local binding yields its value, any other
 * resolution arm (a bare `fn` / callable name, or an unresolved name) has no
 * first-class readable value and yields `null` — this evaluator's own inert
 * fallback (bug 0116: no such rule is stated in expressions.md) — rather than
 * throwing out of the executor.
 */
function evaluatePureExpression(expr: Expr, env: LexicalEnvironment): ThetaValue {
  switch (expr.kind) {
    case "number":
      return Number(expr.text);
    case "string":
    case "bool":
      return expr.value;
    case "null":
      return null;
    case "ident": {
      const resolution = env.resolve(expr.name);
      return resolution.arm === "local" ? resolution.value ?? null : null;
    }
    case "array":
      return expr.elements.map((element) => evaluatePureExpression(element, env));
    case "object": {
      // An object-literal / schema-constructor value (expressions.md §"Object
      // construction"): the runtime value is the plain field object keyed by
      // theta-side names, reordered into the declaring schema's DECLARATION
      // order (bug 0080 §Fix) and branded (non-enumerably, so no
      // theta-visible surface changes) with that schema name, so the QRY-18
      // interpolation render path can recover the schema and apply outbound
      // wire-name translation recursively — identical to the executor's
      // `case "object"` arm (statement-executor.ts), the lockstep obligation
      // bug 0027 records for its four read entry points.
      const obj: Record<string, ThetaValue> = {};
      for (const field of expr.fields) {
        defineRecordField(obj, field.name, evaluatePureExpression(field.value, env));
      }
      return buildObjectSchemaValue(obj, expr.typeName, (name) => env.resolveSchema(name));
    }
    case "member": {
      // `Enum.Variant` access: a member on an identifier that names a registered
      // enum (not a local binding) is a pure enum-value read, NOT a generic
      // member access on a null target (runtime-value-model.md, enum row).
      if (expr.target.kind === "ident" && env.resolve(expr.target.name).arm !== "local") {
        const variant = env.resolveEnumVariant(expr.target.name, expr.field);
        if (variant !== undefined) {
          return variant;
        }
      }
      // `.field` access — a `null` target raises `NullMemberAccessPanic` (V4b).
      return evaluateMemberAccess(evaluatePureExpression(expr.target, env), expr.field);
    }
    case "index": {
      // `[i]` access — a `null` target / out-of-bounds / missing key panics (V4b).
      const target = evaluatePureExpression(expr.target, env);
      const index = evaluatePureExpression(expr.index, env);
      return evaluateIndexAccess(target, typeof index === "number" ? index : String(index));
    }
    case "call": {
      // A `<name>(args)` call whose callee resolves to a user `fn` executes the
      // function body (functions.md FN-1…FN-5). In a pure sub-expression
      // position (a binary/ternary operand, an argument, a template
      // interpoland) the value is produced synchronously against a pure body;
      // an effectful `fn` body cannot run on the pure path and yields the inert
      // `null` safety net (its effects are driven only by the executor). A
      // non-`fn` callee (a Pi tool / `.theta`-callable) is an effect with no
      // synchronous value — also the `null` safety net.
      const resolution = env.resolve(expr.callee);
      const fn =
        (resolution.arm === "fn" || resolution.arm === "import") && resolution.fn !== undefined
          ? resolution.fn
          : undefined;
      // Bug 0303 / bug 0027 lockstep: an imported `fn`'s body opens against its
      // DECLARING module's environment (`resolution.moduleEnv`), exactly as the
      // async executor's `evalUserFnCall` does — this pure host and the
      // executor must not drift on which scope a lib body's free names resolve
      // in.
      return fn !== undefined
        ? evaluatePureFnCall(
            fn,
            expr,
            env,
            resolution.arm === "import" ? resolution.moduleEnv : undefined,
          )
        : null;
    }
    case "result-ctor":
      // `Ok(arg)` / `Err(arg)` — a pure Result construction (never a tool-call).
      return expr.ctor === "Ok"
        ? makeOk(evaluatePureExpression(expr.arg, env))
        : makeErr(evaluatePureExpression(expr.arg, env));
    case "method-call": {
      // `target.method(args)` — evaluate the receiver and arguments, then
      // dispatch to the stdlib member surface by the receiver's runtime type
      // (expressions.md §"Built-in methods and properties").
      const receiver = evaluatePureExpression(expr.target, env);
      const args = expr.args.map((arg) => evaluatePureExpression(arg, env));
      return evaluateStdlibMethod(receiver, expr.method, args);
    }
    case "try": {
      // §Fix (a) (bug 0116) — the `Ok`/`Err` discrimination is NOT
      // reimplemented here: `evaluateQuestion` is the shared synchronous V4b
      // primitive `evalTry` (statement-executor.ts) also calls, so this host
      // and the executor cannot drift apart on `?` (bug 0027's lockstep rule
      // for this exact pair).
      const operand = evaluatePureExpression(expr.operand, env);
      // §Fix (b) — the ERR-18 brand guard travels with the primitive, exactly
      // as `evalTry` guards before unwrapping; reusing bug 0019's defect class
      // rather than minting a new one.
      if (!isResultValue(operand)) {
        throw new QuestionOperandDefectError(operand);
      }
      const q = evaluateQuestion(() => operand);
      if (q.kind === "value") {
        return q.value;
      }
      // §Fix (c) — `evaluatePureExpression` returns `ThetaValue`, which has no
      // channel for `evalTry`'s `propagate` flow (the render is synchronous, so
      // `evalExpr`'s re-route strategy is unavailable). Yielding the `Err`
      // carrier as a VALUE would be unsound rather than merely lossy: a pure
      // operator arm — a binary / comparison / logical operand, or a ternary
      // CONDITION — consumes it with JS coercion before any classification
      // runs, sending the interpreter-private carrier to the model as
      // `[object Object]`. So the propagate arm RAISES, through the one factored
      // raise, which is positional-invariant: nothing is sent, the theta does
      // not report success, and the disposition is a `ThetaPanic` so QRY-21
      // holds and `let _ =` cannot contain it.
      raiseInterpolatedResult(INTERPOLATED_RESULT_MESSAGE);
    }
    case "binary":
      return evaluateBinaryExpression(expr.op, expr.left, expr.right, env);
    case "ternary": {
      // `cond ? a : b` — only the taken branch is evaluated (short-circuit).
      const condition = evaluatePureExpression(expr.condition, env);
      return condition === true
        ? evaluatePureExpression(expr.consequent, env)
        : evaluatePureExpression(expr.alternate, env);
    }
    case "block": {
      // A block expression's value is its tail (grammar.md §"Block expressions"),
      // over the same statements-then-tail evaluation `evaluatePureFnCall`
      // already performs, in a CHILD scope so the block's own `let`s do not
      // leak into the enclosing one. An explicit `return` inside the block is
      // control flow this evaluator has no channel to propagate out of an
      // expression position, so it falls to the inert `null` the surrounding
      // pure-host convention uses for the forms it does not model.
      const outcome = evaluatePureBlock(expr.body, env.child());
      return outcome.kind === "value" ? outcome.value : null;
    }
    default:
      // `match` / effect forms are driven by the executor (not the pure host);
      // a query / tool-call / invoke expression reaching here has no pure
      // value and yields the inert `null` — this evaluator's own fallback, not
      // a rule stated anywhere in expressions.md (bug 0116).
      return null;
  }
}

/**
 * Evaluate a pure user `fn` call synchronously (functions.md FN-1…FN-5) for a
 * pure sub-expression position: validate arity (a mismatch is a defect surfaced
 * as `ThetaFnArityError`, shared with the executor's async path), evaluate each
 * argument in the caller scope, bind it as an immutable local in a fresh child
 * scope, then evaluate the `fn` body's pure statements + tail. The evaluator
 * covers the pure body forms (`let`, `if`/`else`, `return`, expression
 * statements, and the tail expression); an effect statement or a `while`/`for`
 * loop has no synchronous pure value and short-circuits to the `null` safety
 * net, matching the surrounding pure-evaluator convention.
 */
function evaluatePureFnCall(
  fn: FnDecl,
  expr: CallExpr,
  env: LexicalEnvironment,
  bodyRoot: LexicalEnvironment = env,
): ThetaValue {
  if (expr.args.length !== fn.params.length) {
    throw new ThetaFnArityError(fn.name, fn.params.length, expr.args.length);
  }
  // Arguments evaluate in the CALLER's `env`; the body scope opens against
  // `bodyRoot` — the DECLARING module's environment for an imported `fn` (bug
  // 0303), or `env` itself (the default) for a same-file `fn`.
  const scope = bodyRoot.child();
  fn.params.forEach((param, index) => {
    scope.defineLocal(param.name, evaluatePureExpression(expr.args[index] as Expr, env), false);
  });
  return evaluatePureBlock(fn.body, scope).value;
}

/** The outcome of evaluating a pure block: a fallen-through value or an explicit `return`. */
type PureBlockOutcome =
  | { readonly kind: "value"; readonly value: ThetaValue }
  | { readonly kind: "return"; readonly value: ThetaValue };

/**
 * Evaluate a pure `fn` body `Block` synchronously: walk its statements, then
 * yield the tail expression's value (or `null` for a statement-terminated body).
 * An explicit `return` short-circuits the block to its operand (FN-3…FN-5).
 */
function evaluatePureBlock(block: Block, env: LexicalEnvironment): PureBlockOutcome {
  for (const stmt of block.statements) {
    const outcome = evaluatePureStatement(stmt, env);
    if (outcome.kind === "return") {
      return outcome;
    }
  }
  return {
    kind: "value",
    value: block.tail !== null ? evaluatePureExpression(block.tail, env) : null,
  };
}

/**
 * Evaluate one pure statement of a `fn` body. `let` binds a local; `if`/`else`
 * takes the matching arm's block; `return` short-circuits; an expression
 * statement is evaluated for its (discarded) value. A form with no synchronous
 * pure value (an effect statement, a `while`/`for` loop, a reassignment against
 * a captured slot) falls through as a plain value — the pure evaluator does not
 * model the effect/loop control flow the async executor owns.
 */
function evaluatePureStatement(stmt: Stmt, env: LexicalEnvironment): PureBlockOutcome {
  switch (stmt.kind) {
    case "let": {
      const value = stmt.init !== null ? evaluatePureExpression(stmt.init, env) : null;
      env.defineLocal(stmt.name, value, stmt.mutable);
      return { kind: "value", value: null };
    }
    case "return":
      return {
        kind: "return",
        value: stmt.operand !== null ? evaluatePureExpression(stmt.operand, env) : null,
      };
    case "if":
      return evaluatePureIf(stmt, env);
    case "expr":
      return { kind: "value", value: evaluatePureExpression(stmt.expr, env) };
    default:
      return { kind: "value", value: null };
  }
}

/** Evaluate a pure statement-form `if` / `else if` / `else` chain. */
function evaluatePureIf(
  stmt: Extract<Stmt, { kind: "if" }>,
  env: LexicalEnvironment,
): PureBlockOutcome {
  if (evaluatePureExpression(stmt.condition, env) === true) {
    return evaluatePureBlock(stmt.then, env.child());
  }
  if (stmt.otherwise === null) {
    return { kind: "value", value: null };
  }
  return "statements" in stmt.otherwise
    ? evaluatePureBlock(stmt.otherwise, env.child())
    : evaluatePureIf(stmt.otherwise, env);
}

/**
 * Dispatch a `target.method(args)` stdlib member by the receiver's runtime type
 * (expressions.md §"Built-in methods and properties"), reusing the runtime
 * stdlib modules so `replace`'s `$`-literal insertion and the `valuesEqual`
 * structural equality of `includes` / `indexOf` match the reference semantics.
 * A receiver with no stdlib member surface (number / boolean / null) has no
 * theta-1.0 method and yields the inert `null` safety net rather than throwing
 * out of the executor. An enum value or a `Result` value satisfies the object
 * arm's `typeof` test but is gated ahead of `evaluateObjectMember` (bug 0027
 * §Fix): neither is an object value in the language's sense, so the call
 * rejects with `theta/runtime/non-object-receiver` rather than answering the
 * carrier's own enumerable properties — including on the QRY-18 interpolation
 * render path (`stringifyInterpolation`), so a receiver that would leak into a
 * rendered query template is rejected before any text reaches the model. This
 * pure host and the effectful executor's `applyStdlibMethod`
 * (statement-executor.ts) move in lockstep — a gate on one alone leaves the
 * other leaking.
 */
function evaluateStdlibMethod(
  receiver: ThetaValue,
  method: string,
  args: readonly ThetaValue[],
): ThetaValue {
  if (typeof receiver === "string") {
    return evaluateStringMember(receiver, method, args);
  }
  if (Array.isArray(receiver)) {
    return evaluateArrayMember(receiver, method, args);
  }
  if (typeof receiver === "object" && receiver !== null) {
    if (!isObjectValue(receiver)) {
      throw nonObjectReceiverRejection(`.${method}()`, receiver);
    }
    return evaluateObjectMember(receiver as { readonly [k: string]: ThetaValue }, method, args);
  }
  return null;
}

/**
 * Evaluate a pure binary / unary-modelled expression against the environment,
 * reusing the V2c structural-equality relation for `==` / `!=`. `&&` / `||`
 * short-circuit; arithmetic and ordering use native IEEE-754 semantics (no
 * div/mod-by-zero panic — expressions.md §"Other arithmetic"). Unary `!` / `-`
 * are modelled by the parser as a binary with a synthetic `null` left operand.
 */
function evaluateBinaryExpression(
  op: string,
  leftExpr: Expr,
  rightExpr: Expr,
  env: LexicalEnvironment,
): ThetaValue {
  if (op === "!") {
    return !(evaluatePureExpression(rightExpr, env) as boolean);
  }
  if (op === "-" && leftExpr.kind === "null") {
    return -(evaluatePureExpression(rightExpr, env) as number);
  }
  const left = evaluatePureExpression(leftExpr, env);
  if (op === "&&") {
    return left === true ? evaluatePureExpression(rightExpr, env) === true : false;
  }
  if (op === "||") {
    return left === true ? true : evaluatePureExpression(rightExpr, env) === true;
  }
  const right = evaluatePureExpression(rightExpr, env);
  switch (op) {
    case "==":
      return valuesEqual(left, right);
    case "!=":
      return !valuesEqual(left, right);
    case "+":
      return typeof left === "string" && typeof right === "string"
        ? left + right
        : (left as number) + (right as number);
    case "-":
    case "*":
    case "/":
    case "%": {
      // Bug 0338 belt: mirrors the executor's `applyBinaryScalar` bug 0332 belt
      // (statement-executor.ts:1060) into this pure host, so a statically-deferred
      // non-numeric operand (a WITHHELD fn param reaching an interpolation or an
      // invoke argument) throws loudly instead of being cast to `number` and
      // JS-coerced. `NaN`/`Infinity` are `typeof "number"`, so the guard does not
      // fire on them — `n % 0` → `NaN` and `n / 0` → `Infinity` over numeric
      // operands keep the spec's non-panicking div/mod behaviour.
      if (typeof left !== "number" || typeof right !== "number") {
        throw new BinaryNonNumericError(op, left, right);
      }
      switch (op) {
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "%":
          return left % right;
      }
    }
    case "<":
      return (left as number | string) < (right as number | string);
    case "<=":
      return (left as number | string) <= (right as number | string);
    case ">":
      return (left as number | string) > (right as number | string);
    case ">=":
      return (left as number | string) >= (right as number | string);
    default:
      return null;
  }
}
