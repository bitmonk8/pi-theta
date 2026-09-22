// H8a — the production `ThetaProducerDeps` for the shipped composition root.
//
// The `V19e` composition producer (`composeThetaFixture`) maps a parsed `.theta`
// to a runnable `ThetaFixture` by composing the injected collaborators
// `ThetaProducerDeps` declares (theta-composition-producer.ts). The
// mode-routing members are:
//
//   - `runBinder` — the `V11a` frontmatter binder over the slash arguments,
//     run before the theta interpreter; a non-binding envelope short-circuits;
//   - `bindPromptConversation` — bind `V19d`'s effectful executor to the shared
//     user session (`V12a`/`V9c`) so `@`-queries drive real user-visible turns;
//   - `spawnSubagentConversation` — bind a subagent-mode theta for its private
//     drive (`V9i`); under RFC-0006 the binding's `drive` runs the whole body
//     in a spawned child `pi` process.
//
// This module assembles the mode-routing collaborators against the live host
// and runtime seams, delegating query driving, echo types, and pure evaluation.
//
// Spec (narrative): pi-integration-contract/extension-bootstrap-and-per-theta.md
// (§"Per-theta registration"), conversation-drive.md, slash-invocation.md,
// binder/binder-model-and-context.md, subagent.md.

import { evaluateCallSiteCwd, evaluatePureExpression, raiseInterpolatedResult } from "../runtime/pure-expression-evaluator";
export { evaluateCallSiteCwd, evaluatePureExpression, raiseInterpolatedResult } from "../runtime/pure-expression-evaluator";
import {
  LivePromptQueryModel,
  resolveRegistryAuth,
  OFF_SESSION_NORMAL_STOP_REASONS,
  RESPOND_TOOL_DESCRIPTION,
  RESPOND_CAPTURED_TEXT,
  RESPOND_REPEAT_TEXT,
  respondToolExecuteResult,
  type ActiveRespondCapture,
  type RespondTurnContext,
  type RespondToolExecuteResult,
} from "./live-prompt-query-driver";
export * from "./live-prompt-query-driver";
import { echoTypeFromValue } from "./binder-echo-type";
export { echoTypeFromValue } from "./binder-echo-type";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
  SessionEntry,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
// RFC-0005: `buildSessionContext` remains for the prompt-mode drive; the former
// in-process subagent satellites (`createAgentSession` / `DefaultResourceLoader`
// / `SessionManager` / `getAgentDir` / `defineTool`) are retired — the subagent
// drive spawns a child `pi` process (subagent.md, RFC-0005).
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import { runSubagentChildTeardown } from "../runtime/subagent-isolation";
import {
  inferChildTrust,
  placeSubagentChild,
  routeSubagentSpawnFailure,
  type OpenedSubagentWire,
  type PreparedSubagentLaunch,
} from "../runtime/subagent-launcher";
import {
  createPipePlacementBackend,
  isPipePlacement,
  placementIsVisible,
  THETA_LAUNCH_ENTRY,
  type SubagentLaunchEntry,
} from "../runtime/subagent-placement";
import type { PlacementLease } from "../runtime/subagent-placement-selection";
import type { PlacementEventBus } from "../runtime/subagent-placement-registry";
import {
  SUBAGENT_CHILD_OUTCOME_CHANNEL,
  SUBAGENT_CHILD_OUTCOME_API_VERSION,
  type SubagentChildOutcome,
  type SubagentChildOutcomePayload,
} from "../runtime/subagent-placement-registry";
import type { SubagentChildControlPlane } from "../runtime/subagent-launch-file";
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
import { SUBAGENT_ROOT_WINNER_ENV } from "../runtime/subagent-root-regime";
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
  type EnumTagEntry,
  type ErrProvenance,
  type FnTail,
} from "../runtime/subagent-envelope";
import { collectForwardedEnumTags, retagForwardedEnums } from "../runtime/enum-tag-carriage";
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
  ToolResultMessage,
} from "@earendil-works/pi-ai";
// pi-ai 0.80.x moved the streaming free functions off the package root into
// the publicly-exported `/compat` subpath (package.json `exports["./compat"]`
// -> dist/compat.d.ts); the root barrel no longer re-exports `complete`.
import { complete } from "@earendil-works/pi-ai/compat";
// Bug 0010: the synthesised respond tool's `parameters` wrap the lowered
// response schema exactly as the binder call shape does (`Type.Unsafe`).
import { Type } from "typebox";
import type { RuntimeRoot } from "../runtime-root";
import type {
  ActiveInvocationEntry,
  ActiveInvocationRegistry,
  ActiveInvocationTicket,
} from "../runtime/active-invocation-registry";
import type { ForwardingSignalSource } from "./session-shutdown";
import type { ExecutionStatusBus, ParForLaneHooks } from "./execution-status/types";
import type { RunCardPublisher } from "./execution-status/run-card";
import { decorateCheckpoint } from "./execution-status/checkpoint-decorator";
import { attachChildActivityTap } from "./execution-status/child-tap";
import {
  type EmissionSink,
  emitCancelledBySessionShutdownNote,
  createProductionEmissionSink,
} from "./teardown-emission";
import { sendSystemNote, type SystemNoteChannelDeps } from "./system-note-channel";
import { isStaleCtxError } from "./stale-ctx";
import type {
  BinderRunInput,
  BinderRunResult,
  BodyExecutingConversationBinding,
  ConversationBinding,
  ConversationBindInput,
  ThetaCompositionInput,
  ThetaProducerDeps,
} from "./theta-composition-producer";
import type {
  EffectfulStatementHostDeps,
  QueryHostDispatch,
  RuntimeToolCall,
  SubagentFnInvokeChild,
} from "../runtime/effectful-statement-host";
import { createEffectfulStatementHost } from "../runtime/effectful-statement-host";
import {
  executeCompactTool,
  executeContextUsageTool,
  executeSessionNameTool,
  type SessionControlCtx,
  type SessionControlPi,
} from "../runtime/session-control-tools";
import {
  buildEnvironment,
  enumDeclaringKey,
  type EnumRegistration,
  type LexicalEnvironment,
  type MaterializedImport,
} from "../runtime/lexical-environment";
import {
  executeBody,
  type BodyExecution,
  type ExecuteBodyDeps,
  type SubagentFnChildRequest,
} from "../runtime/statement-executor";
import {
  extractTrailingTurnText,
} from "../runtime/conversation-drive";
import {
  enforceInvokeParamsDepth,
  enforceInvokeReturnDepth,
} from "../runtime/invoke-ceiling-depth";
import { summariseErrorField } from "../runtime/err-field-summary";
import type {
  QueryModelDriver,
  QueryToolLoopConfig,
} from "../runtime/query-tool-loop";
import type {
  AgentToolResultEnvelope,
  CodeSideToolCall,
  InProcessToolExecute,
  ToolLoweringSink,
} from "../runtime/tool-call-execute";
import { filterJoinToolText, lowerToolExecuteThrow } from "../runtime/tool-call-execute";
import {
  buildCodeToolArgSchemaViolation,
  buildCodeToolUnknownTool,
  enforceCodeToolArgDepth,
  enforceModelToolArgDepth,
  PiToolArgShapeDefectError,
  ShadowedCalleeDispatchDefectError,
} from "../runtime/tool-call";
import type { InvokeChild, DrivenInvokeResult, InvokeResultSource } from "../runtime/invoke-cancellation";
import type {
  CodeToolError,
  InvokeInfraCause,
  InvokeInfraError,
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
  makeCancelledError,
} from "../runtime/cancellation-core";
import { runCheckpointedBinderCall } from "../runtime/checkpoint-granularity";
import { runBinderCallWithCancellation } from "../binder/binder-cancellation";
import { guardToolExecutePromise } from "../runtime/tool-call-swallowing-handler";
import { guardQueryProviderPromise } from "../runtime/query-swallowing-handler";
import { guardInvokeExecutionPromise } from "../runtime/invoke-swallowing-handler";
import type { CheckpointSite } from "../seams/checkpoint";
import type { Trace } from "../seams/trace";
import {
  defineRecordField,
  isEnumValue,
  isResultValue,
  makeErr,
  makeOk,
  schemaTagOf,
  type ThetaValue,
  type ResultValue,
} from "../runtime/value";
import type {
  CallExpr,
  EnumDecl,
  FnDecl,
  InvokeExpr,
  ThetaBody,
  QueryExpr,
  SchemaDecl,
  SubagentSessionConfig,
} from "../parser/theta-document";
import { parseExpressionSource, collectSessionTypedQueries } from "../parser/theta-document";
import { renderSystemPrompt } from "../parser/system-prompt-render";
import { lowerQueryResponseSchema } from "../parser/query-schema-lowering";
import { bindParamsInbound, decodeInboundValue } from "../runtime/inbound-boundary";
import { projectForValidation } from "../runtime/wire-translation";
import { inferCalleeReturnAnnotation } from "../parser/functions";
import type { CompiledValidator, LoweredSchema, SchemaValidator } from "../seams/schema-validator";
import { parseToolsEntry, thetaDefaultName, type ResolvedCallable } from "../parser/callable-set";
import { RUNTIME_TOOL_SIGNATURES, type RuntimeToolName } from "../parser/runtime-tools";
import { canonicalForm, toLoweredJsonValue } from "../parser/schema-lowering";
import type { TypedQuerySchemaValidation } from "../runtime/query-tool-loop";
import {
  buildTypedQueryValidation,
  respondSchemaSlug,
  respondToolName,
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
  HostFatal,
  isThetaPanic,
  retargetInterpolationPanic,
} from "../runtime/runtime-panics";
import {
  createRegistrationCache,
  deriveToolLabel,
  registerToolInCache,
} from "../runtime/tool-registration";
import {
  interpolationTypeOf,
  lexQueryTemplate,
  renderEmptyShortCircuit,
  renderTemplateText,
  stringifyInterpolatedValue,
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
import {
  binderSupportsApi,
  binderUnsupportedApiMessage,
  isForcedToolChoiceRejection,
} from "../binder/forced-tool-choice";
import { fillDefaultsAndRevalidate, type DefaultedField } from "../binder/defaulting";
import { matchAvailableModel } from "../binder/binder-model";
import {
  renderBinderSystemNote,
  binderFailureMessage,
  type BinderArgsClassification,
  type BinderAttemptOutcome,
  type BinderFailureSurface,
} from "../binder/retry-taxonomy";
import { classifyProviderResponse } from "../binder/provider-error-mapping";
import {
  synthesizeUnsupportedProviderTransportError,
  TYPED_QUERY_SUPPORTED_PROVIDER_APIS,
} from "../runtime/typed-query-provider-gate";
import { walkSessionContext } from "../binder/session-context-walk";
import {
  customTypeUnsafeDiagnostic,
  renderCompactTranscript,
  renderCustomTypeUnsafeNote,
} from "../binder/compact-transcript";
import { coerceUnderlyingString } from "../diagnostics/placeholder";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { capSystemNote, classifyModelContent } from "../binder/system-note";
import {
  renderArgumentEcho,
  type EchoParam,
} from "../render/argument-echo";
import { renderNoParamsOverflowNote } from "../runtime/slash-dispatch";
import { isInvokeCalleeError, renderTopLevelErrNote } from "../runtime/err-note-render";
import type { InvokeCalleeError, QueryError } from "../runtime/query-error";
import type { RuntimeEvent } from "../runtime/runtime-event-channel";
import { buildRuntimeEventNote } from "../runtime/runtime-event-channel";
import type { InvocationProvenanceLedger } from "../runtime/invoke-provenance-ledger";
import { createInvocationProvenanceLedger } from "../runtime/invoke-provenance-ledger";
import type { InvokeCallSite } from "../runtime/invoke-provenance";
import {
  PromptToolLoopGovernor,
} from "./prompt-tool-loop-governor";

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
 * Bug 0293: whether a thrown value is a Node-style ENOENT rejection
 * (`fs.realpath` / `fs.lstat`'s absence signal), narrowed by `.code` rather than
 * caught broadly — `#recheckCalleeContainment` re-throws every other error
 * (CLAUDE.md: catch a specific condition, never `catch(...)`).
 */
function isEnoent(thrown: unknown): boolean {
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
async function calleePathIsAbsent(
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

/**
 * A fresh `ToolLoweringSink` that discards every channel. The one channel a
 * compliant lowering reaches is `sink.diagnostic` on a non-conforming
 * `execute()` return shape, and that diagnostic also rides on the
 * `ToolReturnShapeDefectError` carrier the seam throws — the top-level catch
 * frames it as the single operator note, so an independently-delivering sink
 * here would double-deliver.
 */
function noopSink(): ToolLoweringSink {
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

/**
 * The per-dispatch binder forced-tool call ingredients (binder-inference.md
 * §"Binder inference call"), built ONCE per slash invocation and reused across
 * every budgeted attempt: the resolved binder model, the rendered V11d system
 * prompt, the TRUE anyOf envelope schema plus its content-addressed slug and
 * derived `__theta_bind_<slug>` tool name, the FNV-1a seed, and the
 * memoising envelope-validator accessor (compiled at most once per dispatch —
 * the malformed retry re-issues against the SAME schema).
 */
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
 * syntax carries no per-field description — no theta 1.0 authoring surface
 * attaches one, so the prompt line's ` — <description>` slot is RESERVED with
 * no carrier (binder-bypass-and-envelope.md §System-prompt structure item 4).
 * This mapper therefore sets no `description` and that segment is always
 * absent from the rendered line.
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
 * body whose `schema` / `enum` declarations resolve the names in it. Bug
 * 0465: `importedTypeDecls` rides alongside `declarations` so
 * `#validateInvokeReturn` can merge in the same file's imported schema/enum
 * decls the lowering seam needs — the CALLER's for `annotated` (the caller
 * wrote the annotation and its own imports resolve it), the CALLEE's for
 * `callee-inferred` (the inferred name resolves against the callee's own
 * decls, imports included).
 */
interface InvokeReturnSite {
  readonly annotation: string;
  readonly declarations: ThetaBody;
  readonly importedTypeDecls?: ThetaCompositionInput["importedTypeDecls"];
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

  /** RFC 0015 (D3): expose the composition root's run-card publisher to the
   *  dispatch seam (`ThetaProducerDeps.runCard`). */
  get runCard(): RunCardPublisher | undefined {
    return this.#input.runCard;
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
      this.#emitBinderFailureNote(binderInput.theta.slashName, { kind: "malformed" }, binderInput.invocationTicket);
      return { bound: false };
    }
    // Bug 0417 (parent adjudication Option A): the binder's supported-api gate,
    // synthesize-BEFORE-dispatch. An api with no MEASURED forced-tool-choice row
    // would ship the outside-the-table `{type:"tool",name}` default the provider
    // rejects as a request-shape 400 (measured on `openai-responses`), burning
    // BOTH budgeted binder calls per invocation before failing on `argument
    // binder unavailable`. Mirror the typed-query respond path's gate (the
    // `synthesizeUnsupportedProviderTransportError` branch that carries a
    // `gateError` on the respond context): refuse HERE, before any provider
    // call (zero spend), routed
    // through the existing transport failure surface + the bug 0397
    // `details.event` machinery — no new failure class, no new registry code.
    // The check changes no registration outcome and is registry-drift-safe.
    //
    // A pre-call ABORT takes precedence over an api refusal: an invocation the
    // user already cancelled surfaces the `cancelled` binder note through the
    // binder-call checkpoint below, not an unsupported-api transport note (the
    // abort is the higher-priority pre-dispatch guard, CANCEL-4).
    const preAborted = binderInput.thetaAbort?.signal.aborted === true;
    if (!preAborted && !binderSupportsApi(String(model.api))) {
      this.#emitBinderFailureNote(
        binderInput.theta.slashName,
        {
          kind: "transport",
          provider: String(model.api),
          message: binderUnsupportedApiMessage(),
        },
        binderInput.invocationTicket,
      );
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
    const call = await this.#runBudgetedBinderCall(dispatch, binderInput);
    if (call === undefined) {
      return { bound: false };
    }
    // Route on the terminal (most-recent, HC3-e) classified outcome. The theta
    // body runs only on the `ok` arm; every failure arm (`needs_info` /
    // `ambiguous` / `malformed` / `transport`-budget-exhausted) emits the mapped
    // failure-mode system note and short-circuits (the body never runs). The
    // envelope is runtime-internal and is never surfaced verbatim.
    const outcome = call.outcome;
    if (outcome.kind !== "ok") {
      this.#emitBinderFailureNote(binderInput.theta.slashName, outcome, binderInput.invocationTicket);
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
    const binderArgs = call.okArgs;
    const merged = await this.#mergeDeclaredDefaults(binderInput.theta, params, binderArgs);
    // The post-default-merge verdict routes BEFORE the success echo: an
    // AJV-on-`args` classification (a merged document AJV refuses, or a
    // ceiling-#4 depth breach cross-routed per CIO-1) is terminal — no retry
    // (HC3-c), the failure-mode row surfaces, and the theta does not start. The
    // echo asserts a bind that happened, so it may not precede the verdict that
    // decides whether it did.
    if (merged.classification.kind !== "ok") {
      this.#emitBinderFailureNote(binderInput.theta.slashName, merged.classification, binderInput.invocationTicket);
      return { bound: false };
    }
    // §"Echo policy" (BND-1): on a successful bind the runtime appends the
    // one-line success echo note (`Running /<name>: …`) on the theta-system-note
    // channel immediately before the theta starts, UNLESS `bind_echo: false`. The
    // bypass arms auto-suppress the echo independently and never reach here.
    this.#emitBinderEchoNote(binderInput.theta, params, merged.args, merged.defaultedWireNames);
    return { bound: true, args: merged.args };
  }

  /** Drive the checkpointed binder retry budget and surface either cancellation arm. */
  async #runBudgetedBinderCall(
    dispatch: BinderForcedToolDispatch,
    binderInput: BinderRunInput,
  ): Promise<{ outcome: BinderAttemptOutcome; okArgs: Record<string, unknown> } | undefined> {
    // OFF-session completion via pi-ai `complete()` against the resolved binder
    // model (never a user-visible session turn, never `ctx.model`): the envelope is
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
      // EXST-4: the binder-call checkpoint publishes under the PRE-BINDER
      // ticket's invocation id when the dispatch entry opened one; a
      // ticket-less binder run (an in-memory harness) stays undecorated and
      // publishes nothing.
      binderInput.invocationTicket === undefined
        ? this.#input.root.checkpoint
        : decorateCheckpoint(
            this.#input.root.checkpoint,
            this.#input.statusBus,
            binderInput.invocationTicket.invocationId,
          ),
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
      this.#emitBinderFailureNote(binderInput.theta.slashName, { kind: "cancelled" }, binderInput.invocationTicket);
      return undefined;
    }
    if (phase.value.kind === "cancelled") {
      // In-flight abort: the provider observed the forwarded `options.signal`.
      this.#emitBinderFailureNote(binderInput.theta.slashName, { kind: "cancelled" }, binderInput.invocationTicket);
      return undefined;
    }
    return { outcome: phase.value.outcome, okArgs };
  }

  /**
   * §"Echo policy" success echo (BND-1): render and emit the one-line
   * `Running /<name>: <formatted-args>` system note delivered through
   * `sendSystemNote` over the extension-instance `theta-system-note` channel —
   * the SAME best-effort fallback chain the SLSH-1 overflow / SNOTE-1 notes use,
   * so a host send throw is contained rather than aborting the bind — unless
   * `bind_echo:` is `false`. Each top-level `params:` field
   * renders in declaration order; a field is tagged `(default)` iff its wire
   * name is in `defaultedWireNames`, the fill step's own report of which
   * fields took their declared default this run
   * (defaulting-system-note-echo.md:9; `defaulting.ts:70–75`,
   * `EchoParam.tookDefault` in `argument-echo.ts`). The echo is rendered off the resolved runtime
   * values (value-driven `EchoType` derivation, disambiguating `integer` vs
   * `number` from the lowered schema) and passed through the shared
   * 120-code-point cap.
   *
   * Bug 0437 §Fix: this note routes through `sendSystemNote` with `details`
   * ABSENT — it is one of bug 0401's informational notes, which omit
   * `details` from the wire entirely, and `SystemNote.details` is now
   * optional so the chain can carry a details-less note without fabricating
   * a key the 0401 byte contract forbids.
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
    const loweredSchema =
      params.loweredSchema !== undefined
        ? (params.loweredSchema as Record<string, unknown>)
        : undefined;
    const properties = loweredSchema?.["properties"] as Record<string, unknown> | undefined;
    // The `$defs` table `$ref` positions in `properties` resolve against —
    // every schema-typed, inline-object, and discriminated-union position
    // lowers to a `$ref` into it (schema-lowering.ts), so `echoTypeFromValue`
    // needs it to reach the declaration-ordered `properties` record a `$ref`
    // stands in front of (docs/bugs/0381 §Fix).
    const loweredDefs =
      (loweredSchema?.["$defs"] as Record<string, unknown> | undefined) ?? {};
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
        type: echoTypeFromValue(value, properties?.[field.wireName], loweredDefs),
        tookDefault,
      };
    });
    const content = capSystemNote(
      renderArgumentEcho({ thetaName: theta.slashName, params: echoParams }),
    );
    // Informational note (runtime-event-channel.md "Informational notes carry no `details`");
    // routes through the channel with `details` ABSENT rather than fabricate the runtime-event key.
    sendSystemNote({ content, display: true }, this.#systemNoteChannel());
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
    // Bug 0481: at most TWO dispatches inside this ONE budgeted attempt — the
    // forced one, plus ONE degraded re-issue (toolChoice omitted) when the
    // provider rejects forcing at the MODEL level. The downgrade is a protocol
    // adaptation, not a transport flake, so it never debits the per-class
    // retry budget (determinism-cancellation-failure.md §Per-invocation retry
    // budget); a failure of the degraded dispatch feeds the normal taxonomy.
    let degraded = false;
    for (;;) {
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
      reply = await this.#completeBinderReply(dispatch, signal, onResponse, degraded);
    } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — a provider transport throw → HC3-a transport class
      // A cancellation abort is surfaced by the caller's before/after-attempt
      // signal checks, not misclassified as a retryable transport failure.
      if (signal.aborted) {
        return { outcome: { kind: "transport", provider, message: "cancelled" } };
      }
      const thrownMessage = coerceUnderlyingString(thrown);
      // Bug 0481 (throw arm): the anthropic adapter's `result()` THROWS the
      // error-terminated stream's message, so the model-level forcing
      // rejection arrives here on that adapter. Same one-shot degradation as
      // the resolved arm below.
      if (!degraded && isForcedToolChoiceRejection(thrownMessage)) {
        degraded = true;
        continue;
      }
      return { outcome: { kind: "transport", provider, message: thrownMessage } };
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
    const errorMessage = reply.errorMessage;
    const stopReasonNonNormal =
      typeof stopReason === "string" && !OFF_SESSION_NORMAL_STOP_REASONS.has(stopReason);
    if (
      stopReasonNonNormal ||
      (typeof errorMessage === "string" && errorMessage !== "") ||
      (captured !== undefined && captured.status !== 200)
    ) {
      // Bug 0481: the MODEL-level forcing rejection — checked on the RAW
      // errorMessage BEFORE the classifier. One shot per attempt.
      if (!degraded && isForcedToolChoiceRejection(errorMessage)) {
        degraded = true;
        continue;
      }
      const classified = classifyProviderResponse({
        api: provider,
        httpStatus: captured?.status ?? null,
        stopReason: typeof stopReason === "string" ? stopReason : "",
        ...(typeof errorMessage === "string" ? { errorMessage } : {}),
      });
      // The classifier-produced message renders whenever it exists, whichever
      // kind produced it: both overflow arms carry the provider's own text
      // in the same field the transport arm does (`matchOverflowSignature` and
      // `classifyProviderResponse` in `src/binder/provider-error-mapping.ts`),
      // and the outcome below is transport-class regardless of `kind`
      // (determinism-cancellation-failure.md:36).
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
    omitToolChoice: boolean,
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
    if (omitToolChoice) {
      // Bug 0481 degraded re-dispatch: strip the constructor's forced choice
      // AFTER the pinned builder ran, so the builder's own contract (and its
      // tests) stay byte-identical; the single binder tool + system prompt
      // already instruct the model, `auto` is the strongest admitted request.
      delete options["toolChoice"];
    }
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
   * BNDR-10 (binder/binder-model-and-context.md §Binder context): build the
   * binder's *Recent session context* transcript body for a `bind_context:
   * session` prompt-mode theta. Sources the RAW chronological message list from
   * the live session (the host's open `AgentMessage` union — a compacted
   * session leads with a `compactionSummary`, and `branchSummary` /
   * `bashExecution` arms may sit anywhere in it), runs the newest→oldest
   * truncation walk (which first drops every out-of-set arm, bug 0478, then
   * applies ≤20 turns ∧ ≤8000 tokens via the injected `TokenEstimator`), and
   * renders the included closed-set slice as a compact transcript. Returns `none` when the feature is off (subagent-mode,
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
    // The early return above is the BNDR-10 fence, so `walk.applies` is already
    // true here (`walkSessionContext` computes it from the same two conditions,
    // and `bindContext` is passed as the literal `"session"`); the residual case
    // is BNDR-7i void truncation.
    if (walk.includedMessages.length === 0) {
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
   * BNDR-9: reject an included session-context `custom` message whose
   * `customType` is transcript-unsafe; binding does not proceed. Emits BOTH
   * halves of the rejection in one `pi.sendMessage` on the theta-system-note
   * channel: the framed user-facing note as `content`, and the registered
   * `theta/runtime/custom-type-unsafe` diagnostic as the group-B
   * `details: { diagnostics: [Diagnostic] }` runtime batch, mirroring
   * `emitPanicNote`.
   */
  #emitCustomTypeUnsafeNote(thetaName: string, value: string): void {
    sendSystemNote(
      {
        content: renderCustomTypeUnsafeNote(thetaName, value),
        display: true,
        details: { diagnostics: [customTypeUnsafeDiagnostic(value)] },
      },
      this.#systemNoteChannel(),
    );
  }

  /**
   * Bug 0397 §Fix: the binder-failure note is a group-A always-log member
   * (runtime-event-channel.md §"Runtime event channel") whose
   * `details.event` is sourced from the dispatch-site `ActiveInvocationRegistry`
   * entry (runtime-event-channel.md §"Binder-failure sourcing") — THREADED in via `ticket` (the
   * `BinderRunInput.invocationTicket` the real dispatch always
   * supplies; `beginInvocation` inserts the entry ahead of the awaited binder
   * step). A ticket-less direct-`runBinder` harness (no dispatch-level
   * `beginInvocation`) has no entry to source from; rather than fabricate one or
   * throw, that case degrades to the pre-fix `{}` payload — harness-only,
   * production always threads the ticket. The event is built ONCE and passed
   * through the shared `buildRuntimeEventNote` (no forked builder), leaving
   * `content` (`renderBinderSystemNote`) and `display: true` byte-identical.
   */
  #emitBinderFailureNote(
    thetaName: string,
    surface: BinderFailureSurface,
    ticket: ActiveInvocationTicket | undefined,
  ): void {
    const content = renderBinderSystemNote(thetaName, surface);
    const channel = this.#systemNoteChannel();
    if (ticket === undefined) {
      sendSystemNote({ content, display: true, details: { event: {} } }, channel);
      return;
    }
    const event = this.#buildGroupAEventOrFallback(
      content,
      (): RuntimeEvent => ({
        kind: surface.kind,
        theta: `/${ticket.theta}`,
        invocation_id: ticket.invocationId,
        message: binderFailureMessage(surface),
        occurred_at: this.#input.root.clock.wallNow(),
      }),
      channel,
    );
    if (event === undefined) {
      return;
    }
    sendSystemNote(
      buildRuntimeEventNote(event, { topLevelCascade: true, userFacingTemplate: content }),
      channel,
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
   * recovered here from the theta's own loaded frontmatter: each defaulted
   * field's recorded `defaultSource` is parsed + evaluated through the same pure
   * evaluator the body uses. Recovery is best-effort — a default that does not
   * parse, or a default that parses and then panics while evaluating, leaves
   * that field unfilled, never throws. An unfilled field is ABSENT from the
   * merged args, and a defaulted field is never in the lowered schema's
   * `required` set (`parseParams`, `parser/params.ts`, writes
   * `required.push(field.name)` only under `field.defaultSource === undefined`),
   * so the post-default-merge AJV check below ADMITS that absence and the
   * invocation binds without the field. Both best-effort cases therefore reach
   * one end state, and what DID arrive is still validated at the `params`
   * boundary.
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
    // Recovery is best-effort and may yield nothing (a default that does not
    // re-parse, a default whose evaluation panics). That leaves the field
    // unfilled — it does NOT excuse the boundary: what did arrive is still
    // validated below.
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
   * from the theta's own parsed frontmatter. The parsed `ParsedParams` already
   * retains each default's literal source (`fields[].defaultSource`, feeding
   * the binder system prompt's `default=<literal>` line) but not its evaluated
   * value, so this looks each wire name up on `theta.frontmatter.params.fields`
   * and parses + evaluates its recorded `defaultSource` with the body's pure
   * evaluator (so an enum / schema-literal default resolves against the body's
   * declarations), then projects the evaluated value to wire form for the
   * post-default-merge AJV boundary it feeds (`fillDefaultsAndRevalidate`,
   * `binder/defaulting.ts`). The declaring-enum tag / schema brand a wire-form
   * default loses here is re-established downstream by the binder-`args`
   * inbound boundary (`bindParamsInbound`, `runtime/inbound-boundary.ts`,
   * reached from `paramBindingsFrom` in `src/extension/theta-composition-producer.ts`)
   * that `runtime-value-model.md:34` already mandates over binder `args`.
   */
  async #recoverDeclaredDefaults(
    theta: ConversationBindInput["theta"],
    defaultedFields: readonly string[],
  ): Promise<readonly DefaultedField[]> {
    const fieldsByWireName = new Map(
      (theta.frontmatter.params?.fields ?? []).map((field) => [field.wireName, field] as const),
    );
    const env = buildBoundEnvironment(
      theta.body,
      undefined,
      theta.imports,
      presentedCallableNames(theta),
      theta.sourcePath,
    );
    const defaults: DefaultedField[] = [];
    for (const wireName of defaultedFields) {
      const defaultSource = fieldsByWireName.get(wireName)?.defaultSource;
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
      // state the two sibling best-effort cases above (an absent recorded default,
      // a default that does not parse) already reach, with what DID arrive still
      // validated there. Only the closed `ThetaPanic` set is absorbed
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
   * caller-kind guard is needed. Routed through `sendSystemNote` — the same
   * chain every other note on this instance uses.
   *
   * Bug 0437 §Fix: this note routes through `sendSystemNote` with `details`
   * ABSENT — a bug-0401 informational note, and `SystemNote.details` is now
   * optional so the chain can carry it without fabricating a `details` key.
   */
  #emitNoParamsOverflowNote(binderInput: BinderRunInput): void {
    if (trimSlashArgumentWhitespace(binderInput.args).length === 0) {
      return;
    }
    // Informational note (runtime-event-channel.md "Informational notes carry no `details`");
    // routes through the channel with `details` ABSENT rather than fabricate the runtime-event key.
    sendSystemNote(
      { content: renderNoParamsOverflowNote(binderInput.theta.slashName), display: true },
      this.#systemNoteChannel(),
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
   * unaffected either way. Delivered through `sendSystemNote` over the
   * extension-instance `theta-system-note` channel — the same best-effort
   * fallback chain as the SLSH-1 overflow note, so a host send (or group-A
   * stamp) throw is contained rather than aborting the slash handler.
   */
  emitTopLevelErrNote(thetaName: string, error: QueryError, event?: RuntimeEvent): void {
    const content = renderTopLevelErrNote({
      thetaName,
      error,
      chain: this.#ledger?.chainFor(error) ?? [],
    });
    // This boundary construction IS the origin emission of record for this
    // path until the wider origin-site always-log surface lands (a filed
    // residual / non-goal — no `topLevelCascade: true` caller exists today).
    // The optional `event` is the forward hook: once an origin-site emission
    // threads its exact value here, slash-invocation.md:63's "same value"
    // holds literally instead of by reconstruction. Mirror the renderer's leaf
    // walk and reuse the shared note builder rather than forking a second
    // RuntimeEvent constructor.
    const channel = this.#systemNoteChannel();
    const resolvedEvent = this.#buildGroupAEventOrFallback(
      content,
      (): RuntimeEvent =>
        event ??
        (() => {
          let leaf: QueryError = error;
          while (isInvokeCalleeError(leaf)) {
            leaf = leaf.inner;
          }
          const built: RuntimeEvent = {
            kind: leaf.kind,
            theta: `/${thetaName}`,
            invocation_id: this.#input.root.idSource.newInvocationId(),
            message: leaf.message,
            occurred_at: this.#input.root.clock.wallNow(),
          };
          // Bug 0399 constraint 2: preserve the leaf's own `attempts`
          // (validation) / `tokens_used` (context_overflow) exactly
          // `buildDiscardEvent`-shaped (query-discard.ts) — no other kind
          // defines these fields, and `tokens_used` is number-only so a `null`
          // provider count stays canonically absent rather than leaking `null`.
          if ("attempts" in leaf && typeof leaf.attempts === "number") {
            built.attempts = leaf.attempts;
          }
          if ("tokens_used" in leaf && typeof leaf.tokens_used === "number") {
            built.tokens_used = leaf.tokens_used;
          }
          return built;
        })(),
      channel,
    );
    if (resolvedEvent === undefined) {
      return;
    }
    sendSystemNote(
      buildRuntimeEventNote(resolvedEvent, { topLevelCascade: true, userFacingTemplate: content }),
      channel,
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
   * `emitTopLevelErrNote`'s single delivery through `sendSystemNote` over the
   * extension-instance `theta-system-note` channel (the same best-effort
   * fallback chain), but carries the group-B
   * `details: { diagnostics: [Diagnostic] }` shape (the SAME shape the
   * load-phase pre-eval diagnostics use). Emits
   * EXACTLY ONE note; the session is NOT torn down. `HostFatal` never reaches
   * here — the outer catch re-raises it (fail-fast, NOCEIL-3) before calling.
   */
  emitPanicNote(framing: string, diagnostic: Diagnostic): void {
    sendSystemNote(
      { content: framing, display: true, details: { diagnostics: [diagnostic] } },
      this.#systemNoteChannel(),
    );
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
   * Bug 0437 §Fix: resolve the extension-instance `theta-system-note` channel
   * for the raw-send sites this fix routes through `sendSystemNote` — the SAME
   * resolution `#emitCleanCancelNote` uses (below), so a note on any of these
   * sites observes the one `RendererGate` / `SystemNoteChannelHealth` pair the
   * composition root wires, and a bare-`pi` harness (the bug doc's
   * §Reproduction shape) still gets a working fallback chain rather than a raw
   * throw.
   */
  #systemNoteChannel(): SystemNoteChannelDeps {
    return (
      this.#input.systemNoteChannel ?? {
        pi: {
          sendMessage: (message, options): void => {
            this.#input.pi.sendMessage(message, options);
          },
        },
        emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
        // No real `ctx.ui` seam is threaded onto `#input`. A production
        // instance always wires a real `systemNoteChannel` (this branch is a
        // harness-only degrade, never the live path); `sendSystemNote`'s
        // `ui.notify` arm is itself best-effort, so a no-op here only costs the
        // toast half of the fallback on that harness-only path, never the
        // delivery-failed diagnostic or terminal log.
        ui: {
          notify: (): void => {},
        },
      }
    );
  }

  /**
   * Bug 0437 §Fix (group-A clock guard, runtime-event-channel.md §"best-effort
   * `pi.sendMessage`" fallback): for a
   * group-A note, `Clock.wallNow()` during `occurred_at` stamping is an
   * always-log step the channel's fallback covers alongside the send itself —
   * a throw here must walk the SAME fallback, not escape uncaught. A
   * recognised stale-ctx throw still rethrows (the pinned PIC-67 posture); any
   * other throw is handed to `sendSystemNote` as a SYNTHETIC send failure over
   * the real channel (same `ui` / `emitDiagnostic` / `health` / `rendererGate`,
   * a `pi.sendMessage` that immediately re-throws the stamp error) — this
   * reuses `sendSystemNote`'s own send-throw containment verbatim instead of
   * replicating its toast/diagnostic/terminal-log steps a second time. Returns
   * the built `RuntimeEvent` on success, or `undefined` once the fallback has
   * already delivered the note (the caller must not send again).
   */
  #buildGroupAEventOrFallback(
    content: string,
    buildEvent: () => RuntimeEvent,
    channel: SystemNoteChannelDeps,
  ): RuntimeEvent | undefined {
    try {
      return buildEvent();
    } catch (stampError: unknown) { // allow-broad-catch: pi-sdk-boundary — mirrors sendSystemNote's send-throw containment, runtime-event-channel.md best-effort fallback
      if (isStaleCtxError(stampError)) {
        throw stampError;
      }
      const stampFailure =
        stampError instanceof Error ? stampError : new Error(String(stampError));
      sendSystemNote(
        { content, display: true, details: { event: {} } },
        {
          ...channel,
          pi: {
            sendMessage: (): void => {
              throw stampFailure;
            },
          },
        },
      );
      return undefined;
    }
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
   * `#openInvocationTicket` so `invocationId` keeps minting through the
   * producer's PIC-20 `IdSource` seam.
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
    // EXST-3(b): the bus is a READ-ONLY observer of the registry's closed
    // five-field entry — published right AFTER the add, so the registry's own
    // `size()` transition points are unchanged.
    this.#input.statusBus?.invocationStarted(entry.invocationId, entry.theta);
    let finished = false;
    return {
      settleDisposeBarrier: settleDispose,
      invocationId: entry.invocationId,
      theta: entry.theta,
      finish: (): void => {
        if (finished) return;
        finished = true;
        settleDispose();
        activeInvocations?.remove(entry);
        this.#input.statusBus?.invocationEnded(entry.invocationId);
        // Bug 0073: AFTER the barrier settles and the entry is removed, so a
        // PIC-67 rethrow out of the note delivery cannot leave a live entry
        // behind or an unsettled barrier.
        this.#emitCleanCancelNote(entry);
      },
    };
  }

  /** Derive the invocation controller and retain its downward-only forwarding detach. */
  #deriveInvocationAbort(bindInput: ConversationBindInput): {
    thetaAbort: AbortController;
    forwardingSources: ForwardingSignalSource[];
  } {
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
    return { thetaAbort, forwardingSources };
  }

  /** Assemble the prompt executor's effect closures over this invocation's live surfaces. */
  #buildPromptHostDeps({
    bindInput, theta, ctx, pi, chain, ticket, checkpoint, signal, thetaAbort,
    readMessages, readContextPath, trace,
  }: {
    bindInput: ConversationBindInput;
    theta: ConversationBindInput["theta"];
    ctx: ExtensionCommandContext;
    pi: ProductionProducerInput["pi"];
    chain: InvokeChain;
    ticket: ActiveInvocationTicket;
    checkpoint: ExecuteBodyDeps["checkpoint"];
    signal: AbortSignal;
    thetaAbort: AbortController;
    readMessages: () => readonly Message[];
    readContextPath: () => readonly SessionEntry[];
    /** RFC 0015 (D5): this bind's trace closure, handed down to nested
     *  prompt-invoke callee binds so their heat keys the top-level card. */
    trace: Trace | undefined;
  }): EffectfulStatementHostDeps {
    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint,
      signal,
      sink: noopSink(),
      file: theta.slashName,
      evaluatePure: (expr, env, overrideChain) => evaluatePureExpression(expr, env, overrideChain ?? chain),
      resolveQuery: (expr, env, overrideChain) => {
        // SLSH-2: EVERY non-short-circuit prompt-mode query is a user-visible
        // streamed turn against the user session — assistant tokens for every
        // query (not just the first) stream into the transcript in real time.
        // Prompt→prompt invokes and the body run strictly SEQUENTIALLY (the
        // executor awaits each query), so there is no stream-interleaving risk.
        // QRY-6/QRY-8: a query whose rendered template is empty short-circuits
        // to `Err(empty_template)` with NO provider turn (not user-visible — no
        // turn is issued at all). Bug 0354: the render is chain-threaded so a
        // cross-file `fn` interpolation call breaches here, BEFORE any turn.
        // Bug 0388: `overrideChain` is the executor's LIVE `ExecuteBodyDeps.
        // invokeChain`, which carries any cross-file `.thetalib` fn frames
        // accumulated since bind — so a query reached from inside a fn body
        // counts from the chain as it stands NOW, not the bind-time seed.
        // Falling back to `chain` at the top level (where the executor's
        // chain IS the bind-level chain) keeps this byte-identical there.
        const activeChain = overrideChain ?? chain;
        const shortCircuits =
          renderEmptyShortCircuit(renderQueryText(expr, env, activeChain)) !== undefined;
        const userVisible = !shortCircuits;
        return this.#resolvePromptQuery(expr, env, {
          pi,
          ctx,
          theta,
          signal,
          thetaAbort,
          readMessages,
          readContextPath,
          userVisible,
          chain: activeChain,
        });
      },
      resolveToolCall: (expr, env, evaluatedToolArgs) =>
        this.#resolveToolCall(theta, expr, env, signal, evaluatedToolArgs),
      // CANCEL-5 / cross-mode: the caller's mode (`prompt`) is threaded to
      // `#driveCallee` so an `invoke`d prompt-mode callee attaches to this user
      // session (prompt→prompt) rather than spawning fresh.
      resolveInvoke: (expr, env, overrideChain) =>
        this.#resolveInvoke(theta, expr, env, ctx, overrideChain ?? chain, signal, "prompt", ticket.invocationId, trace),
      // Bug 0088: pair the wrapper `runInvokeEffect` builds for a failed hop
      // with its provenance record.
      recordInvokeHop: (wrapper, calleePath, callSite) =>
        this.#recordInvokeHop(theta, wrapper, calleePath, callSite),
      classifyCall: (expr) => this.#classifyCall(theta, expr),
      // RFC 0011 §6.3: wired only when the composition-scope session-control
      // hosts are available; absent → the executor arm is skipped.
      ...(this.#input.sessionControlHosts !== undefined
        ? {
            resolveRuntimeToolCall: (expr: CallExpr, env: LexicalEnvironment) =>
              this.#resolveRuntimeToolCall(theta, expr, env, signal),
          }
        : {}),
      resolveCallAsInvoke: (expr, env, overrideChain) =>
        this.#resolveCallAsInvoke(theta, expr, env, ctx, overrideChain ?? chain, signal, "prompt", ticket.invocationId, trace),
      // RFC 0001 (`subagent fn`, FN-8) / RFC 0012 §10: a prompt-mode theta may
      // call a `subagent fn` — the safe prompt→subagent direction. Each call
      // launches a CHILD of this theta with a `fn` entry under the resolved
      // FN-7 config; the depth frame (INV-4 / FN-6) is pushed on `chain` inside
      // the resolve.
      resolveSubagentFnChild: (request, overrideChain) =>
        this.#resolveSubagentFnChild(
          theta,
          request,
          ctx,
          overrideChain ?? chain,
          signal,
          bindInput.paramBindings,
          ticket.invocationId,
        ),
    };
    return hostDeps;
  }

  bindPromptConversation(bindInput: ConversationBindInput): BodyExecutingConversationBinding {
    const { pi, root } = this.#input;
    const { theta, ctx } = bindInput;
    // INV-4 / ceiling #1: a top-level dispatch starts a fresh chain, seeded at
    // the inbound subagent-child depth (0 on the parent / harness paths, the
    // marshalled parent depth inside a subagent child — invocation.md §INV-4
    // wire-level carriage); a nested invoke carries the parent's pushed chain in
    // `bindInput.chain`.
    const chain = bindInput.chain ?? newInvokeChainAtDepth(this.#input.subagentInboundInvokeDepth ?? 0);

    const { thetaAbort, forwardingSources } = this.#deriveInvocationAbort(bindInput);
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

    // Bug 0482: the CHRONOLOGICAL leaf path, un-reordered by
    // `buildContextEntries`'s compaction hoist — `readMessages()` alone cannot
    // answer "did an assistant reply FOLLOW the trailing compaction" because
    // that hoist moves the `compaction` entry to the head of the built
    // `Message[]`. `thisTurnSettled` reads this alongside `readMessages()` to
    // detect an unanswered trailing compaction (conversation-drive.md PIC-70).
    // `getBranch()` (no argument) is the manager's own root-to-leaf walk from
    // its live leaf — the exact path `buildSessionPath` would produce.
    const readContextPath = (): readonly SessionEntry[] => ctx.sessionManager.getBranch();

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
    //
    // RFC 0010 (EXST-4): hoisted above the host/execute deps so this
    // invocation's id is in scope for the telemetry `Checkpoint` decorator and
    // the lane hooks below. The hoist is inside the same all-synchronous
    // prologue, so the registry's `size()` transition points are unchanged.
    const ticket =
      bindInput.invocationTicket ?? this.#openInvocationTicket(theta.slashName, thetaAbort);
    const statusBus = this.#input.statusBus;
    statusBus?.invocationBound(ticket.invocationId, {
      mode: "prompt",
      ...(bindInput.parentInvocationId !== undefined
        ? { parentInvocationId: bindInput.parentInvocationId }
        : {}),
    });
    // EXST-4: the per-invocation decorator wrapping the SHARED production
    // `Checkpoint` (the seam itself is untouched; `before(kind, site)` carries
    // no invocation identity, so the id is bound here). Identity passthrough
    // when no bus is wired.
    const checkpoint = decorateCheckpoint(root.checkpoint, statusBus, ticket.invocationId);
    // RFC 0015 (D5): the statement-trace closure — a nested prompt-invoke
    // callee bind INHERITS the parent's (so its heat lands on the top-level
    // card's ring, decision 6); a top-level bind mints one over its own id
    // from the composition's factory (TUI only; absent ⇒ seam unwired, the
    // D1 byte-identical contract for print/json/child).
    const trace = bindInput.trace ?? this.#input.statusTrace?.(ticket.invocationId);
    // EXST-3(c): the `par for` lane-set producer adapter.
    const statusLanes: ParForLaneHooks | undefined =
      statusBus === undefined
        ? undefined
        : { open: (total, width) => statusBus.openLaneSet(ticket.invocationId, total, width) };

    const hostDeps = this.#buildPromptHostDeps({
      bindInput, theta, ctx, pi, chain, ticket, checkpoint, signal, thetaAbort,
      readMessages, readContextPath, trace,
    });

    const executeDeps: ExecuteBodyDeps = {
      env: buildBoundEnvironment(
        theta.body,
        bindInput.paramBindings,
        theta.imports,
        presentedCallableNames(theta),
        theta.sourcePath,
      ),
      host: createEffectfulStatementHost(hostDeps),
      checkpoint,
      signal,
      mutator: new NoopConversationMutator(),
      mode: "prompt",
      file: theta.slashName,
      // Bug 0476: a panic site in the top-level body names the on-disk file.
      ...(theta.sourcePath !== undefined ? { sourcePath: theta.sourcePath } : {}),
      // Bug 0324: thread the real runtime-diagnostic channel so a non-number
      // `par for` `max` value's clamp-to-1 is not silent.
      emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
      // Bug 0354, INV-4: seed the cross-file `.thetalib` fn accounting with
      // THIS invocation's own chain (already seeded at
      // `subagentInboundInvokeDepth` above), so an invoke child's fn frames
      // share the same per-chain counter its invoke frames increment.
      invokeChain: chain,
      // RFC 0010 (EXST-3(c)): absent unless a bus is wired, in which case
      // `evalParFor` is byte-identical to the pre-RFC loop.
      ...(statusLanes !== undefined ? { statusLanes } : {}),
      // RFC 0015 (D5): the statement-trace seam (guarded spread — absent, the
      // executor's per-site undefined-check is the whole cost).
      ...(trace !== undefined ? { trace } : {}),
    };

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
      surface: promptModeSurface(readMessages),
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
    // is the THETA's — its frontmatter `model:` matched against the registry by
    // the exact-match rule the load pass used, else the inherited session model
    // `ctx.model` (bug 0479: this site marshalled `ctx.model` unconditionally, so
    // every pinned subagent theta ran on whatever the invoking session had
    // selected). A present reference that no longer resolves at dispatch is
    // `undefined` here — a refusal through the guard below, never a silent
    // session-model substitution. Refuse the spawn when the resolved model is
    // `undefined` rather than launching a modelless child, emitting the pinned
    // `theta/runtime/subagent-model-unresolved` diagnostic and surfacing the
    // precise `invoke_infra` cause `subagent_model_unresolved` to an `invoke`
    // parent.
    // PIC-62 single source of truth: the parent-side pre-spawn guard is the
    // `guardResolvedModel` leaf (`subagent-model-guard.ts`); the retired RFC-0005
    // `preSpawnModelGuard` duplicate is deleted.
    const model = this.#resolveThetaModel(theta.frontmatter.model, ctx.model);
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
    const { thetaAbort, forwardingSources } = this.#deriveInvocationAbort(bindInput);

    const systemPrompt = this.#renderChildSystemPrompt(bindInput, theta);

    const { piToolNames, noHostTools, projectTrust, callableHashes } = this.#marshalChildCallables(theta);

    // The runtime-defect diagnostic sink (advisory teardown / spawn-failure /
    // envelope failures). Absent on non-production harnesses (a no-op).
    const emitDiagnostic = this.#input.emitDiagnostic ?? ((): void => {});

    // Decision 6 / Increment B1: the invocation's registry entry, opened before
    // the child launch below so the entry SPANS the real in-flight window;
    // removal is deferred to `finishInvocation`. The slash dispatch entry
    // point's pre-binder ticket is REUSED when present (`bindInput.invocationTicket`),
    // so the entry also spans the binder window and no second entry is added.
    //
    // RFC 0010 (EXST-4): opened inside the same all-synchronous prologue as the
    // bus notification and the child tap below, so the registry's `size()`
    // transition points are unchanged. The body never runs in-process on this
    // binding — it runs in the spawned child, and `drive()` (below) resolves
    // the `Result` — so no executor host or deps are built here.
    const ticket =
      bindInput.invocationTicket ?? this.#openInvocationTicket(theta.slashName, thetaAbort);
    const statusBus = this.#input.statusBus;
    // RFC 0012 §10: the launch entry — the theta's body, or one of its
    // `subagent fn`s. It selects the execution-status binding (`subagent-fn`
    // keeps its pre-RFC mode), the display label, and the entry carriage.
    const entry = bindInput.entry ?? THETA_LAUNCH_ENTRY;
    // Bug 0488: the driven body's synthesised respond-tool names, computed
    // once here (FN-7-aware) and carried on the launch argv so the ≥0.86
    // strict `--tools` allowlist does not suppress the child's own
    // mid-session respond-tool registration.
    const respondToolNames = collectLaunchRespondNames(theta, entry);
    // RFC 0012 §1 (0.477.0): the label carries a short invocation id so a
    // `par for` fan-out's visible children get distinguishable tab titles.
    // The id is the first eight hex characters of this invocation's PIC-20
    // id — no new randomness source, unique per launch within a session,
    // stable for the child's lifetime, and it correlates a pane title with
    // the invocation's /theta-status node.
    const label = `${bindInput.label ?? theta.slashName}#${ticket.invocationId.slice(0, 8)}`;
    statusBus?.invocationBound(ticket.invocationId, {
      mode: entry.kind === "fn" ? "subagent-fn" : "subagent",
      ...(bindInput.parentInvocationId !== undefined
        ? { parentInvocationId: bindInput.parentInvocationId }
        : {}),
    });

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

    const parentEnv = this.#input.subagentParentEnv ?? {};
    // THIS launch's control-plane carriage, handed to the launcher on its own
    // channel rather than layered into `parentEnv`: the launcher scrubs the
    // per-launch control plane out of the inherited environment (bug 0474,
    // subagent.md #subagent-launch-contract), so a value spread into `parentEnv`
    // would be indistinguishable from a stale inherited one.
    //
    // Every carrier is named on EVERY launch — cleared (`undefined`, absent in
    // the child) when this launch marshals none — for the same reason
    // `marshalParams` names both params carriers (SPAWN-08): naming the key
    // makes THIS launch's channel choice authoritative for the child rather
    // than a question about what the composition happened to leave behind. For
    // the hash map that matters because a grandchild's hash verification would
    // otherwise check the CALLER's callable names against its own discovery — a
    // spurious `subagent-callable-hash-mismatch` drop for a file edited between
    // the two launches (subagent.md #subagent-theta-callable-hash).
    // The winner path names the marked root of the child this launch spawns
    // (its slug is `theta.slashName`), so a value marked for a different slug
    // must never stand in for it (subagent.md
    // #subagent-control-plane-authentication). Forward-slash normalized
    // defensively — discovery already normalizes `sourcePath`, but the carrier
    // is the child's collision-resolution comparison key, so this guards
    // against a future upstream change to that invariant.
    const controlPlaneEnv: Record<string, string | undefined> = {
      ...marshalled.env,
      [SUBAGENT_CALLABLE_HASHES_ENV]:
        Object.keys(callableHashes).length > 0
          ? JSON.stringify(callableHashes)
          : undefined,
      [SUBAGENT_ROOT_WINNER_ENV]:
        theta.sourcePath !== undefined ? theta.sourcePath.replace(/\\/g, "/") : undefined,
    };

    // PIC-65 launch. The placement seam (RFC 0012 §1) + executable host are
    // wired at the composition root; their absence on a non-production harness
    // is a configuration defect surfaced as an internal error (never a
    // modelless / childless drive). `subagentSpawn` alone is the `pipe`
    // shorthand — the pre-RFC launch, verbatim.
    const executableHost = this.#input.subagentExecutableHost;
    const placementResolver = this.#placementResolver();
    if (placementResolver === undefined || executableHost === undefined) {
      paramsCleanup();
      finishInvocation();
      throw new SubagentSpawnFailedError(
        "subagent child launch is unavailable: no placement seam / executable host wired",
      );
    }
    // RFC 0012 §6: the lease holds this launch's visible slot (the cap) until
    // teardown releases it; a failed launch releases it at once.
    const placementLease = placementResolver({
      provider: String(model.provider),
      callee: `/${theta.slashName}`,
    });
    const placement = placementLease.backend;
    // RFC 0012 §6 *Presentation*: the argv form follows the SELECTED backend's
    // `visible` capability — a visible backend gets the interactive TUI form
    // (§7), everything else the headless print form. Derived here, never
    // author-selected.
    const presentation = placementIsVisible(placement) ? ("visible" as const) : ("headless" as const);
    const launch = await placeSubagentChild(
      {
        argv: {
          slug: theta.slashName,
          thetaDirs: this.#input.activeRoots ?? [],
          systemPrompt: systemPrompt ?? "",
          hostTools: piToolNames,
          respondToolNames,
          noHostTools,
          provider: String(model.provider),
          model: model.id,
          projectTrust,
          presentation,
          label,
          // RFC 0012 §7: `--no-session` unless the backend declares
          // `persistSession` — the operator then gets a resumable session
          // file; the parent never reads it, so theta semantics are unchanged.
          persistSession: placement.capabilities?.persistSession === true,
        },
        label,
        entry,
        // RFC 0009 (invocation.md INV-8; subagent.md #subagent-launch-contract):
        // the child working directory is the call site's validated, resolved
        // `cwd` when the dispatching call carried a `with { cwd }` clause,
        // otherwise the forwarded `ctx.cwd` — the pre-0009 value, byte-identical
        // in the absent-clause case. NOTHING else in this launch assembly reads
        // the field (subagent.md #subagent-cwd-identity-location): the clause
        // relocates the callee's side effects, never its identity.
        cwd: bindInput.resolvedCwd ?? ctx.cwd,
        parentEnv,
        controlPlaneEnv,
        parentPid: this.#input.subagentParentPid ?? 0,
        // INV-4: marshal the CURRENT per-chain depth so the child continues the
        // depth-32 ceiling across the process hop (wire-level carriage).
        invokeDepth: chain.depth,
        host: executableHost,
      },
      {
        placement,
        emitDiagnostic,
        ...(this.#input.subagentOpenWire !== undefined
          ? { openWire: this.#input.subagentOpenWire }
          : {}),
      },
    );
    if (!launch.ok) {
      // PIC-65 spawn-failure rule: `placeSubagentChild` already emitted the
      // operator-triage diagnostic; dually route the failure as an unanticipated
      // SDK reject (theta/runtime/internal-error). No child → nothing to tear
      // down; clean up params + drop the registry entry the bind just added.
      placementLease.release();
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
    // RFC 0012 §7 (EXST-5 degradation): a non-`pipe` child's `--mode json`
    // stream is a TTY the parent never sees, so the execution-status node
    // records WHERE the child lives instead — `live in <backend> <handle>` —
    // and its liveness rides the channel heartbeat the tap below folds.
    if (!isPipePlacement(placement)) {
      statusBus?.invocationPlaced(ticket.invocationId, {
        backend: placement.name,
        handle: launch.placed.handle,
      });
    }
    // RFC 0010 (EXST-5): the depth-1 child-activity tap — a SECOND listener on
    // the child's existing stdout line pump, beside the envelope scan. It never
    // consumes, detaches, or reorders the drive listener's lines (PIC-59's
    // stray-line tolerance and terminal-signal ordering are unchanged) and it
    // forwards only the bounded class-1 projection.
    const detachChildTap =
      statusBus === undefined
        ? undefined
        : attachChildActivityTap(
            child,
            (event) => {
              statusBus.childEvent(ticket.invocationId, event);
            },
            { clock: this.#input.root.clock },
          );

    // PIC-66: forward cancellation to the `-p` child by killing it (the
    // child's stdin is spawned closed — bug 0002 — so no in-band stop
    // channel exists). Handles the spawn-then-immediate-cancel path
    // synchronously, so correctness does not depend on microtask ordering.
    const cancellation = attachSubagentCancellation(thetaAbort, child, {
      emitDiagnostic,
    });

    return buildSubagentDriveBinding({
      child, thetaAbort, theta, emitDiagnostic, detachChildTap, placementLease,
      paramsCleanup, cancellation, ticket, root, finishInvocation,
    });
  }

  /** Render the child system prompt, preserving the operator-visible refusal on failure. */
  #renderChildSystemPrompt(
    bindInput: ConversationBindInput,
    theta: ConversationBindInput["theta"],
  ): string | undefined {
    // SUBAG-1: render the theta's `system:` frontmatter into the child's
    // `--system-prompt` (subagent.md §state-isolation matrix: `system:` inherited
    // from frontmatter, `${param}` interpolation resolved at spawn time). A
    // malformed `system:` was rejected at load; a render-time `!ok` (bug 0422
    // route (c) — e.g. a bound `Result` value reaching a value-driven
    // opaque-object terminal) refuses the spawn below rather than silently
    // proceeding under the host's built-in default prompt.
    let systemPrompt: string | undefined;
    const systemTemplate = theta.frontmatter.system;
    // RFC 0012 §10: a `fn`-entry launch interpolates the CALLING invocation's
    // bound params (FN-7 inheritance); the fn's own arguments ride
    // `paramBindings` for the PIC-60 channel and are not template inputs.
    const systemParams = bindInput.systemParams ?? bindInput.paramBindings;
    if (systemTemplate !== undefined) {
      const params: Record<string, ThetaValue> = {};
      if (systemParams !== undefined) {
        for (const [name, value] of systemParams) {
          // A bound param name is author-controlled; see `defineRecordField`'s
          // doc-comment for why this must define rather than assign.
          defineRecordField(params, name, value);
        }
      }
      const rendered = renderSystemPrompt({ template: systemTemplate, params });
      if (rendered.ok) {
        systemPrompt = rendered.text;
      } else {
        // Bug 0422 route (c): the OLD arm here had no `else` at all, so a
        // failed render silently left `systemPrompt` undefined and the child
        // spawned under the host's built-in default (`--system-prompt ""`,
        // below) with no observable on any channel — the whole declared
        // `system:` prompt vanishing invisibly. Emit an operator-visible note
        // naming the failed slot THROUGH the bug-0437 fallback chain
        // (`sendSystemNote`; raw `pi.sendMessage` note sends were retired by
        // that fix — the chain supplies the toast → delivery-failed →
        // terminal containment) and refuse the spawn through the same
        // `InvokeInfraCauseError` carrier the pre-spawn model guard above
        // uses, rather than proceeding with a silently empty system prompt.
        // Channel construction mirrors `#emitCleanCancelNote`'s: the
        // extension-instance channel when the composition root wired one,
        // else the pi-built fallback that keeps a `pi`-only harness (and the
        // offline witness cells) delivering.
        const renderFailChannel: SystemNoteChannelDeps = this.#input.systemNoteChannel ?? {
          pi: {
            sendMessage: (message, options): void => {
              this.#input.pi.sendMessage(message, options);
            },
          },
          emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
          ui: {
            notify: (): void => {},
          },
        };
        sendSystemNote(
          {
            content: `'system:' interpolation for '${theta.slashName}' failed to render (${rendered.diagnostic.code}); refusing to spawn rather than silently drop the system prompt`,
            display: true,
            details: { diagnostics: [rendered.diagnostic] },
          },
          renderFailChannel,
        );
        throw new InvokeInfraCauseError(
          `'system:' render failed for '${theta.slashName}': ${rendered.diagnostic.code}`,
          "internal_error",
        );
      }
    }

    return systemPrompt;
  }

  /** Marshal the child's host-tool allowlist, trust intent, and frozen closure hashes. */
  #marshalChildCallables(theta: ConversationBindInput["theta"]): {
    piToolNames: readonly string[];
    noHostTools: boolean;
    projectTrust: ReturnType<typeof inferChildTrust>;
    callableHashes: Record<string, string>;
  } {
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
        // `entry.presentedName` is author-controlled (a `.theta` root basename or
        // a `tools:` entry's presented name); a plain assignment silently no-ops
        // for the name `__proto__` (bug 0343) instead of creating an own row —
        // the same 0031/0038 hazard class `defineRecordField` exists to close.
        defineRecordField(callableHashes, entry.presentedName, entry.closureHash);
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
    // `rootClosureHash.name` is likewise author-controlled (the root file's
    // derived name); write it through the same house helper so the name
    // `__proto__` lands as an own row instead of silently no-oping through the
    // inherited `Object.prototype` setter (bug 0343) — the `Object.hasOwn`
    // read above is unaffected, only the write below changes.
    const rootClosureHash = theta.rootClosureHash;
    if (rootClosureHash !== undefined && !Object.hasOwn(callableHashes, rootClosureHash.name)) {
      defineRecordField(callableHashes, rootClosureHash.name, rootClosureHash.hash);
    }

    return { piToolNames, noHostTools, projectTrust, callableHashes };
  }

  /**
   * RFC-0012 §1: the per-launch placement resolver. The composition root's
   * `subagentPlacement` (selection + visible cap + credential guard applied
   * per launch) wins; a bare `subagentSpawn` is the `pipe` backend over that
   * spawn function — the pre-RFC launch, byte for byte. `undefined` when
   * neither is wired (a non-production harness).
   */
  #placementResolver(): SubagentPlacementResolver | undefined {
    const resolver = this.#input.subagentPlacement;
    if (resolver !== undefined) {
      return resolver;
    }
    const spawn = this.#input.subagentSpawn;
    if (spawn === undefined) {
      return undefined;
    }
    const pipe = createPipePlacementBackend(spawn);
    const lease: PlacementLease = { backend: pipe, release: (): void => {} };
    return (): PlacementLease => lease;
  }

  /**
   * PIC-60 params-channel fs seam adapter. The env channel (small params) never
   * touches the fs, so a missing seam throws only if the file channel is reached
   * (≥8 KB payload) — fail-loud at the boundary rather than silent narrowing.
   */
  #paramsMarshalDeps(): ParamsMarshalDeps {
    const fs = this.#input.subagentParamsFs;
    return {
      writeTempFile: (contents: string): string => {
        if (fs === undefined) {
          throw new SubagentSpawnFailedError(
            "subagent params temp-file channel unavailable: no params-fs seam wired",
          );
        }
        return fs.writeTempFile(contents);
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
    // RFC 0012 §10: a `fn` entry names one of the marked root's `subagent fn`s;
    // the root itself may be prompt-mode (FN-8), so the mode gate is the theta
    // entry's alone.
    const fnEntry = this.#input.subagentControlPlane?.entry.kind === "fn";
    return (
      regime.active &&
      regime.slug === theta.slashName &&
      (theta.frontmatter.mode === "subagent" || fnEntry)
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
    // RFC 0012 §7 (0.478.0): mirror the terminal envelope arm onto the
    // process-local bus, exactly once per drive (the latch makes the
    // exactly-once claim structural). Envelope first, event second: the
    // parent-facing PIC-59 contract precedes the advisory bus event. A
    // subscriber's throw is contained here — it must not skip the Ok arm's
    // shutdown request or re-enter the regime catch (which would write a
    // second envelope, violating PIC-59's single-envelope rule) — and mints
    // no diagnostic (DIAG-2: no registry row exists for it).
    const outcomeEvents = this.#input.subagentOutcomeEvents;
    let outcomeEmitted = false;
    const emitOutcome = (outcome: SubagentChildOutcome): void => {
      if (outcomeEmitted || outcomeEvents === undefined) {
        return;
      }
      outcomeEmitted = true;
      const payload: SubagentChildOutcomePayload = {
        apiVersion: SUBAGENT_CHILD_OUTCOME_API_VERSION,
        outcome,
        slug: theta.slashName,
      };
      try {
        outcomeEvents.emit(SUBAGENT_CHILD_OUTCOME_CHANNEL, payload);
      } catch { // allow-broad-catch: RFC 0012 §7 — a foreign outcome subscriber's throw is contained, never alters the child's terminal path — pi-integration-contract/subagent.md
        // Swallowed: advisory event; no registry row (DIAG-2).
      }
    };
    const emitErr = (error: QueryError, provenance?: ErrProvenance, fnTail?: FnTail): void => {
      emitEnvelope(serializeErrEnvelope(error, provenance, fnTail));
      emitOutcome("err");
    };

    // RFC 0012 §10: a `fn` entry runs one of this theta's `subagent fn`s as the
    // process-root invocation instead of the theta body (dispatched below).
    const entry = this.#input.subagentControlPlane?.entry ?? THETA_LAUNCH_ENTRY;
    const model = ctx.model;
    if (!this.#confirmChildModelOrRefuse(theta, entry, model, calleePath, emitErr)) {
      return;
    }

    if (entry.kind === "fn") {
      await this.#driveSubagentFnEntry(bindInput, entry.name, calleePath, emitEnvelope, emitErr, emitOutcome);
      return;
    }

    // PIC-60 (child-side): intake the marshalled params from the child env,
    // validate them against the callee's `params:` schema, and bind them DIRECTLY
    // (the binder is bypassed on the marshalled path). A parse / schema-validation
    // failure refuses the invocation fail-closed and reports it through the
    // envelope as Err(InvokeInfraError{cause:"validation"}).
    const intake = this.#intakeSubagentRootParams(theta);
    if (!intake.ok) {
      (this.#input.emitDiagnostic ?? ((): void => {}))(intake.diagnostic);
      emitErr({ ...intake.error, callee_path: calleePath } as unknown as QueryError, "mint");
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
          emitErr(tooDeep, "mint");
        } else if (nonRepresentable !== undefined) {
          (this.#input.emitDiagnostic ?? ((): void => {}))(nonRepresentable.diagnostic);
          emitErr(nonRepresentable.error, "mint");
        } else {
          // Bug 0342 §Fix (D3 carriage): record each enum-boxed position's
          // declaring tag before this envelope collapses the carrier to its
          // bare wire string, so the parent's decode can restore it after the
          // ordinary immediate-callee retag (`#validateInvokeReturn`).
          emitEnvelope(
            serializeOkEnvelope(
              terminal.value as unknown,
              collectForwardedEnumTags(terminal.value as ThetaValue),
            ),
          );
          // RFC 0012 §7: outcome BEFORE the shutdown request, so a
          // subscriber can enqueue its last report before the host begins
          // deferring toward shutdown.
          emitOutcome("ok");
          this.#requestVisibleChildShutdown(ctx);
        }
      } else {
        // Bug 0347 §Fix: this is the callee's OWN returned Err — whether its
        // body raised it directly or `?`-propagated it from a nested `invoke`
        // — so it is stamped `"propagated"` (callee-returned, INV-5), the sole
        // propagation stamp in this regime. Every other `emitErr` call here is a
        // boundary mint the trampoline itself fabricated.
        emitErr(terminal.error as unknown as QueryError, "propagated");
      }
    } catch (thrown: unknown) { // allow-broad-catch: PIC-59 panic→internal-error envelope — pi-integration-contract/subagent.md
      if (thrown instanceof HostFatal) {
        throw thrown;
      }
      // PIC-59: a panic (or any catchable interpreter/adapter throw) is routed as
      // the internal-error `Err` on the envelope — never a fabricated value.
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      emitErr(
        {
          kind: "invoke_infra",
          message: `internal error: ${message}`,
          callee_path: calleePath,
          cause: "internal_error",
        } as unknown as QueryError,
        "mint",
      );
    } finally {
      await binding.teardown?.();
      binding.finishInvocation?.();
    }
  }

  /** Confirm the child-resolved model against its intended pin before either root drive. */
  #confirmChildModelOrRefuse(
    theta: ConversationBindInput["theta"],
    entry: SubagentChildControlPlane["entry"],
    model: Model<Api> | undefined,
    calleePath: string,
    emitErr: (error: QueryError, provenance?: ErrProvenance, fnTail?: FnTail) => void,
  ): boolean {
    // PIC-62 obligation 2 (child-side model confirmation): re-resolve the
    // marshalled `--provider`/`--model` reference against the child's own model
    // registry and confirm it matches the INTENDED model; on mismatch fail the
    // invocation and report it through the envelope (never over any RPC surface).
    // The intended model is the root theta's own frontmatter `model:` when
    // present (bug 0479) — for a `fn` entry, the launched `subagent fn`'s own
    // `with { model }` override first (FN-7: a key named in the clause replaces
    // the inherited value): a parent that marshalled a different model — the
    // pre-fix parent marshalled its session model — is refused here instead of
    // being confirmed against the very value it marshalled.
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
      // The expected reference: the intended pin in its qualified form when it
      // resolves in this registry, the bare authored reference when it does not
      // (so the mismatch names what the author wrote), else the marshalled one.
      const pinRef = this.#subagentRootIntendedModelRef(theta, entry);
      const pinned = pinRef !== undefined ? matchAvailableModel(pinRef, available) : undefined;
      const expectedRef =
        pinRef === undefined ? qualified : pinned === undefined ? pinRef : `${pinned.provider}/${pinned.id}`;
      const confirmation = confirmChildModel(expectedRef, resolvedRef);
      if (!confirmation.ok) {
        (this.#input.emitDiagnostic ?? ((): void => {}))(confirmation.diagnostic);
        emitErr(
          {
            ...confirmation.error,
            callee_path: calleePath,
          } as unknown as QueryError,
          "mint",
        );
        return false;
      }
    }
    return true;
  }

  /**
   * RFC 0012 §10 — child side of a `subagent fn` call. Resolve the named
   * function in THIS theta's own environment (a top-level `subagent fn`, or a
   * `.thetalib` one imported through the theta's own import machinery,
   * re-export chains included — FN-9), re-derive the FN-7 session configuration
   * from the same declaration the parent read (`#applySubagentFnConfig`),
   * intake the marshalled arguments by declared parameter name (PIC-60 — each
   * typed argument AJV-validated against its lowered annotation and translated
   * inbound, so enum tags and schema brands survive the wire), bind them by
   * value into a fresh isolated scope (no closure, FN-6), run the body as the
   * process-root invocation against the child's own host session, and emit the
   * envelope for the body's terminal:
   *
   *   - a bare tail → `ok`; an `Ok(x)` tail → `ok: x` + `fn_tail: "ok"`; an
   *     `Err(e)` tail → `err: e` (propagated) + `fn_tail: "err"` — the three
   *     values the in-process drive returned, recoverable parent-side;
   *   - a `?`-propagated / effect-failure `Err` → `err` (propagated; wraps
   *     parent-side as `InvokeCalleeError`, the FN-6 `propagate` / `fail` arm);
   *   - a panic → `invoke_infra{cause: "panic"}` for a `ThetaPanic`, else
   *     `"internal_error"`, both minted (bare parent-side) — the in-process
   *     `subagentInfraError` split, unchanged.
   *
   * A name the child cannot resolve to a `subagent fn` is a parent/child parse
   * divergence the closure hash already rules out; it routes as the envelope's
   * internal-error arm and mints no code (DIAG-2).
   */
  async #driveSubagentFnEntry(
    bindInput: ConversationBindInput,
    fnName: string,
    calleePath: string,
    emitEnvelope: (line: string) => void,
    emitErr: (error: QueryError, provenance?: ErrProvenance, fnTail?: FnTail) => void,
    emitOutcome: (outcome: SubagentChildOutcome) => void,
  ): Promise<void> {
    const { theta, ctx } = bindInput;
    const emitDiagnostic = this.#input.emitDiagnostic ?? ((): void => {});
    const mintInfra = (message: string, cause: InvokeInfraCause): void => {
      emitErr(
        { kind: "invoke_infra", message, callee_path: calleePath, cause } as unknown as QueryError,
        "mint",
      );
    };
    const { lookupEnv, fn } = this.#resolveSubagentFnDecl(theta, fnName);
    if (fn === undefined) {
      mintInfra(
        `internal error: subagent fn '${fnName}' is not declared by '${theta.slashName}' (parent/child parse divergence)`,
        "internal_error",
      );
      return;
    }

    // PIC-60 (fn arguments): the record the parent marshalled by declared
    // parameter name. The validator pins the key set to the declaration and
    // AJV-checks each typed slot against its lowered annotation (FN-6: the
    // same admissibility an `invoke` argument meets).
    const imported = theta.imports?.find((entry) => entry.kind === "fn" && entry.name === fnName);
    const declSite = {
      body: imported?.moduleScope?.body ?? theta.body,
      ...(imported === undefined && theta.importedTypeDecls !== undefined
        ? { importedTypeDecls: theta.importedTypeDecls }
        : {}),
    };
    const schemaDecls = mergedSchemaDeclsOf(declSite);
    const enumDecls = mergedEnumDeclsOf(declSite);
    const loweredParams = fn.params.map((param) =>
      param.type.length > 0 ? lowerQueryResponseSchema(param.type, schemaDecls, enumDecls) : undefined,
    );
    const validator = this.#subagentFnParamsValidator(fn, fnName, loweredParams);
    const fs = this.#input.subagentParamsFs;
    const intake = intakeChildParams(this.#input.subagentParentEnv ?? {}, validator, {
      readFile: (path: string): string => {
        if (fs === undefined) {
          throw new Error("subagent params file channel unavailable: no params-fs seam wired");
        }
        return fs.readFile(path);
      },
      unlink: (path: string): void => {
        fs?.unlink(path);
      },
    });
    if (!intake.ok) {
      emitDiagnostic(intake.diagnostic);
      emitErr({ ...intake.error, callee_path: calleePath } as unknown as QueryError, "mint");
      return;
    }
    const received = (intake.params ?? {}) as Record<string, unknown>;
    const schemaNames = new Set(schemaDecls.map((decl) => decl.name));
    const enumNames = new Set(enumDecls.map((decl) => decl.name));
    const declaringPath = imported?.moduleScope !== undefined
      ? lookupEnv.resolve(fnName).moduleEnv?.currentResidence()
      : theta.sourcePath;
    const argValues: ThetaValue[] = fn.params.map((param, index) => {
      const wire = received[param.name] as unknown;
      const lowered = loweredParams[index];
      if (lowered === undefined) {
        return wire as ThetaValue;
      }
      return decodeInboundValue({
        lowered: lowered as unknown as Record<string, unknown>,
        annotation: param.type,
        schemaNames,
        enumNames,
        validated: wire,
        schemaValidator: this.#input.root.schemaValidator,
        ...(declaringPath !== undefined ? { enumDeclaringPath: declaringPath } : {}),
      });
    });

    // FN-7: the body's own session runs under the re-derived configuration —
    // the same computation the parent made for the launch, over the same
    // literal-shaped declaration.
    const configured = this.#applySubagentFnConfig(theta, fn.sessionConfig ?? {}, ctx);
    const binding = this.bindPromptConversation({
      ...bindInput,
      theta: configured.theta,
      ctx: configured.ctx,
    });
    try {
      // FN-6: arguments bind by value into a fresh isolated scope opened
      // against the DECLARING module (bug 0303) — no closure over anything.
      const bodyEnv = binding.executeDeps.env;
      const moduleEnv = bodyEnv.resolve(fnName).moduleEnv;
      const scope = (moduleEnv ?? bodyEnv).spawnIsolatedScope();
      fn.params.forEach((param, index) => {
        scope.defineLocal(param.name, argValues[index] ?? null, false);
      });
      const execution = await executeBody(fn.body, { ...binding.executeDeps, env: scope });
      if (execution.outcome !== "success") {
        // The `propagate` / `fail` / `cancel` arms: the body's own terminal
        // `Err` (a `?` inside the body, an unhandled effect `Err`, a cancel).
        const surfaced = surfaceCalleeFinalValue(execution);
        emitErr(
          (surfaced.ok ? makeCancelledError() : surfaced.error) as unknown as QueryError,
          "propagated",
        );
        return;
      }
      const value = execution.result.value ?? null;
      const tail: FnTail | undefined = isResultValue(value) ? (value.ok ? "ok" : "err") : undefined;
      if (isResultValue(value) && !value.ok) {
        emitErr(value.error as unknown as QueryError, "propagated", "err");
        return;
      }
      const payload = isResultValue(value) && value.ok ? value.value : value;
      const tooDeep = mapTooDeepReturnValue(payload as unknown, calleePath);
      const nonRepresentable =
        tooDeep === undefined ? mapNonRepresentableReturnValue(payload as unknown, calleePath) : undefined;
      if (tooDeep !== undefined) {
        emitErr(tooDeep, "mint");
      } else if (nonRepresentable !== undefined) {
        emitDiagnostic(nonRepresentable.diagnostic);
        emitErr(nonRepresentable.error, "mint");
      } else {
        emitEnvelope(
          serializeOkEnvelope(payload as unknown, collectForwardedEnumTags(payload as ThetaValue), tail),
        );
        emitOutcome("ok");
        this.#requestVisibleChildShutdown(ctx);
      }
    } catch (thrown: unknown) { // allow-broad-catch: PIC-59 panic→envelope arm — pi-integration-contract/subagent.md
      if (thrown instanceof HostFatal) {
        throw thrown;
      }
      // The in-process `subagentInfraError` split: a genuine `ThetaPanic`
      // (the depth ceiling included) is `panic`; any other throw is a defect.
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      mintInfra(message, isThetaPanic(thrown) ? "panic" : "internal_error");
    } finally {
      await binding.teardown?.();
      binding.finishInvocation?.();
    }
  }

  /** Validate the subagent fn argument key set and each lowered parameter annotation. */
  #subagentFnParamsValidator(
    fn: FnDecl,
    fnName: string,
    loweredParams: readonly (LoweredSchema | undefined)[],
  ): ParamsSchemaValidator {
    return {
      validate: (params: unknown) => {
        const received = params ?? {};
        if (typeof received !== "object" || Array.isArray(received)) {
          return { ok: false as const, errorPath: "", detail: "fn arguments must be an object keyed by parameter name" };
        }
        const record = received as Record<string, unknown>;
        const declared = fn.params.map((param) => param.name);
        const keys = Object.keys(record);
        const unexpected = keys.find((key) => !declared.includes(key));
        if (unexpected !== undefined) {
          return { ok: false as const, errorPath: `/${unexpected}`, detail: `no parameter named '${unexpected}' on subagent fn '${fnName}'` };
        }
        for (const [index, param] of fn.params.entries()) {
          if (!Object.hasOwn(record, param.name)) {
            return { ok: false as const, errorPath: `/${param.name}`, detail: `missing argument for parameter '${param.name}'` };
          }
          const lowered = loweredParams[index];
          if (lowered === undefined) {
            continue;
          }
          const verdict = this.#input.root.schemaValidator.compile(lowered).validate(record[param.name]);
          if (!verdict.ok) {
            const detail =
              Array.isArray(verdict.errors) && verdict.errors.length > 0
                ? String(verdict.errors[0]?.message ?? "schema validation failed")
                : "schema validation failed";
            return { ok: false as const, errorPath: `/${param.name}`, detail };
          }
        }
        return { ok: true as const };
      },
    };
  }

  /**
   * RFC-0012 §7: a VISIBLE child (the interactive TUI in a multiplexer pane)
   * has no `-p` exit to end its process, so after an `Ok` envelope it asks the
   * host to shut down — `ctx.shutdown()` defers until the session is idle, the
   * process exits and the pane closes. Called on the `Ok` path ONLY: an `Err`
   * child lingers by design so a human can read or continue the live session
   * (settled, not overdue — §8). A headless child (`pipe`, or a non-visible
   * backend) never reaches this: its `-p` run ends the process. `shutdown` is
   * presence-probed `typeof`-only (sdk-inventory.ts `ctx.shutdown`); an absent
   * member leaves the pane open, the `Err` behaviour, with no diagnostic.
   */
  #requestVisibleChildShutdown(ctx: ExtensionCommandContext): void {
    if (this.#input.subagentControlPlane?.launch?.presentation !== "visible") {
      return;
    }
    const shutdown = (ctx as { readonly shutdown?: unknown }).shutdown;
    if (typeof shutdown === "function") {
      (shutdown as () => void).call(ctx);
    }
  }

  /**
   * Resolve a `subagent fn` declaration in the theta's own environment — the
   * same resolution the executor's call site performs (`resolveUserFn`).
   * `fn` is `undefined` when the name resolves to anything but a `subagent fn`
   * (a parent/child parse divergence the caller reports). The environment is
   * returned alongside for the caller's declaring-module lookups.
   */
  #resolveSubagentFnDecl(
    theta: ConversationBindInput["theta"],
    fnName: string,
  ): { readonly lookupEnv: LexicalEnvironment; readonly fn: FnDecl | undefined } {
    const lookupEnv = buildBoundEnvironment(
      theta.body,
      undefined,
      theta.imports,
      presentedCallableNames(theta),
      theta.sourcePath,
    );
    const resolution = lookupEnv.resolve(fnName);
    const fn =
      (resolution.arm === "fn" || resolution.arm === "import") && resolution.fn?.subagent === true
        ? resolution.fn
        : undefined;
    return { lookupEnv, fn };
  }

  /**
   * PIC-62 obligation 2 (bug 0479): the authored model reference the child
   * root's marshalled model must match — for a `fn` entry the launched
   * `subagent fn`'s own `with { model }` override when it declares one (FN-7:
   * a key named in the clause replaces the inherited value), else the theta's
   * frontmatter `model:`; `undefined` when neither pins a model (the child then
   * confirms the marshalled reference against itself). An unresolvable fn name
   * falls back to the frontmatter pin — `#driveSubagentFnEntry` reports the
   * divergence itself.
   */
  #subagentRootIntendedModelRef(
    theta: ConversationBindInput["theta"],
    entry: { readonly kind: string; readonly name?: string },
  ): string | undefined {
    if (entry.kind === "fn" && entry.name !== undefined) {
      const { fn } = this.#resolveSubagentFnDecl(theta, entry.name);
      const override = fn?.sessionConfig?.model;
      if (override !== undefined) {
        return override;
      }
    }
    return theta.frontmatter.model;
  }

  /**
   * RFC 0001 FN-7 / FN-9 — apply a `subagent fn`'s resolved session
   * configuration to the enclosing theta: `system` replaces the frontmatter
   * template (legitimate even from a prompt-mode theta), `tool_loop` /
   * `respond_repair` override the loop budgets, a `with { tools }` override
   * narrows the callable set to the named subset of the CALLING theta's set
   * (FN-9), and `model` overrides the inherited session model — it REPLACES the
   * frontmatter `model:` on the configured theta (bug 0479: every dispatch
   * surface resolves the theta's model from `frontmatter.model`, so an override
   * carried only on `ctx.model` would be shadowed by an enclosing pin). Deterministic
   * over literal-shaped inputs, so the PARENT (assembling the launch: the
   * `--system-prompt`, the `--tools` allowlist, `--provider`/`--model`) and
   * the CHILD (`#driveSubagentFnEntry`, binding the body's own session) compute
   * the same configuration from the same declaration (RFC 0012 §10). An
   * unresolvable `model` override was refused at LOAD
   * (`checkSubagentFnModelOverrides` → `theta/load/model-unresolved`), so a
   * registered theta reaching here always resolves; the no-match fall-through
   * keeps the inherited model only for the load-unreachable case.
   */
  #applySubagentFnConfig(
    theta: ConversationBindInput["theta"],
    config: SubagentSessionConfig,
    ctx: ExtensionCommandContext,
  ): { readonly theta: ConversationBindInput["theta"]; readonly ctx: ExtensionCommandContext } {
    const overriddenFrontmatter = {
      ...theta.frontmatter,
      ...(config.system !== undefined
        ? { system: { parts: [{ kind: "text" as const, value: config.system }] } }
        : {}),
      ...(config.model !== undefined ? { model: config.model } : {}),
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
    const overrideModel =
      config.model !== undefined
        ? matchAvailableModel(config.model, this.#input.modelRegistry.getAvailable())
        : undefined;
    return {
      theta: overriddenTheta,
      ctx: overrideModel !== undefined ? { ...ctx, model: overrideModel } : ctx,
    };
  }

  /**
   * RFC 0012 §10 — the PRODUCTION `subagent fn` call, parent side. The body no
   * longer runs in this process: the call launches a CHILD `pi` of the CALLING
   * theta (`-p "/<slug>"` — the child re-discovers and re-parses the same file;
   * the closure hash verifies the same bytes) carrying a `fn` entry naming the
   * function, with its arguments marshalled by declared parameter name on the
   * PIC-60 params channel and the FN-7 configuration applied to the launch
   * (`#applySubagentFnConfig`: `--system-prompt`, `--tools`, `--provider` /
   * `--model`, trust inference — all the `.theta` callee launch's own inputs).
   * The returned `InvokeChild` drives through `runInvokeChild` exactly as a
   * `.theta` callable call does; its `fnTail()` hands the executor the
   * envelope's `Result`-tail marker for the FN-6 projection.
   *
   * INV-4 / FN-6: the countable `subagent-fn` frame is pushed on `chain` inside
   * `drive()` (a breach surfaces as this hop's nested `invoke_infra{panic}`
   * Err, exactly as `#buildInvokeChild` does for `direct-invoke`); the pushed
   * depth is marshalled to the child, whose root chain seeds at it, so the
   * depth-32 ceiling continues across the process hop unchanged.
   *
   * RFC 0009 Erratum B (INV-8): the call-site `with { cwd }` clause is the
   * child's working directory — validated (a non-string / empty value is the
   * `"validation"` arm, boundary-minted) and resolved against `ctx.cwd`
   * exactly as `#driveCallee` does for the two other child-spawning surfaces.
   *
   * The `ActiveInvocationRegistry` entry, the execution-status `subagent-fn`
   * binding and the cancellation forwarding are the launch bind's own
   * (`spawnSubagentConversation`); the `Err`-wrap / bare split rides the
   * envelope's provenance (bug 0294) and `fn_tail` (RFC 0012 §10).
   */
  #resolveSubagentFnChild(
    theta: ConversationBindInput["theta"],
    request: SubagentFnChildRequest,
    ctx: ExtensionCommandContext,
    chain: InvokeChain,
    parentSignal: AbortSignal,
    callerParams: ReadonlyMap<string, ThetaValue> | undefined,
    parentInvocationId: string | undefined,
  ): SubagentFnInvokeChild {
    const { fn } = request;
    const calleePath = fn.name;
    const rawCwd = evaluateCallSiteCwd(request.call, request.env, chain);
    let lastFnTail: FnTail | undefined;
    return {
      calleePath,
      committed: [],
      fnTail: (): FnTail | undefined => lastFnTail,
      drive: (): Promise<DrivenInvokeResult> => {
        let childChain: InvokeChain;
        try {
          childChain = pushCountableFrame(chain, "subagent-fn");
        } catch (panic) { // allow-broad-catch: theta/runtime/invoke-depth-exceeded — hard-ceilings.md
          if (panic instanceof InvokeDepthExceededPanic) {
            const surfaced = surfaceDepthOverflow(panic, { topLevel: false, calleePath });
            if (surfaced.mode === "nested") {
              return Promise.resolve({
                source: "boundary-minted",
                result: makeErr(surfaced.error as unknown as ThetaValue),
              });
            }
          }
          throw panic;
        }
        return guardInvokeExecutionPromise(
          this.#driveSubagentFnChild(
            theta,
            request,
            ctx,
            childChain,
            parentSignal,
            callerParams,
            parentInvocationId,
            rawCwd,
          ).then((driven) => {
            lastFnTail = driven.fnTail;
            return { source: driven.source, result: driven.result };
          }),
          signalGuard(parentSignal),
          noopSwallowChannels(),
        );
      },
    };
  }

  /** The launch-and-await half of `#resolveSubagentFnChild` (see its doc). */
  async #driveSubagentFnChild(
    theta: ConversationBindInput["theta"],
    request: SubagentFnChildRequest,
    ctx: ExtensionCommandContext,
    childChain: InvokeChain,
    parentSignal: AbortSignal,
    callerParams: ReadonlyMap<string, ThetaValue> | undefined,
    parentInvocationId: string | undefined,
    rawCwd: ThetaValue | undefined,
  ): Promise<DrivenInvokeResult & { readonly fnTail: FnTail | undefined }> {
    const { fn } = request;
    const calleePath = fn.name;
    // Ceiling #4 at the argument boundary — per positional argument, as
    // `#driveCallee` walks an `invoke(...)` argument (CIO-3).
    for (const argValue of request.args) {
      const breach = enforceInvokeParamsDepth(calleePath, argValue);
      if (breach !== undefined) {
        return { source: "boundary-minted", result: breach.result, fnTail: undefined };
      }
    }
    let resolvedCwd: string | undefined;
    if (rawCwd !== undefined) {
      if (typeof rawCwd !== "string" || rawCwd === "") {
        const error: InvokeInfraError = {
          kind: "invoke_infra",
          message:
            typeof rawCwd !== "string"
              ? `subagent fn '${calleePath}' with-clause cwd is not a string`
              : `subagent fn '${calleePath}' with-clause cwd is empty`,
          callee_path: calleePath,
          cause: "validation",
        };
        return {
          source: "boundary-minted",
          result: makeErr(error as unknown as ThetaValue),
          fnTail: undefined,
        };
      }
      resolvedCwd = resolvePath(ctx.cwd, rawCwd);
    }
    // FN-7: the launch assembles the child from the configured theta.
    const configured = this.#applySubagentFnConfig(theta, fn.sessionConfig ?? {}, ctx);
    // PIC-60: the fn's arguments, by declared parameter name — the record the
    // child's `#driveSubagentFnEntry` validates against the same declaration.
    const paramBindings = new Map<string, ThetaValue>();
    fn.params.forEach((param, index) => {
      paramBindings.set(param.name, request.args[index] ?? null);
    });
    const binding = await this.spawnSubagentConversation({
      theta: configured.theta,
      args: "",
      ctx: configured.ctx,
      paramBindings,
      ...(callerParams !== undefined ? { systemParams: callerParams } : {}),
      chain: childChain,
      parentSignal,
      entry: { kind: "fn", name: fn.name },
      label: `${theta.slashName}#${fn.name}`,
      ...(parentInvocationId !== undefined ? { parentInvocationId } : {}),
      ...(resolvedCwd !== undefined ? { resolvedCwd } : {}),
    });
    try {
      // `drive` is always present on the subagent binding; the in-process
      // `surface(executeBody(...))` fallback has no meaning for a fn entry (the
      // body is not this binding's `theta.body`), so its absence is a wiring
      // defect surfaced as such.
      if (binding.drive === undefined) {
        throw new Error("subagent fn child binding carries no drive()");
      }
      const result = await binding.drive();
      const fnTail = binding.driveFnTail?.();
      const bodySource: InvokeResultSource = binding.driveSource?.() ?? "callee-returned";
      // FN-6 "validated at the boundary": the body's declared (`): T`) or
      // FN-3-inferred return type, resolved in the DECLARING file's
      // declarations, AJV-checks the `Ok` payload and restores its enum tags /
      // schema brands across the wire — the same pass a `.theta` callee's
      // return takes (`#validateInvokeReturn`).
      const validated = this.#validateInvokeReturn(
        calleePath,
        this.#resolveSubagentFnReturnSite(theta, request),
        result,
        this.#subagentFnDeclaringPath(theta, request),
        binding.forwardedEnumTags?.(),
      );
      if (!validated.ok && result.ok) {
        return { source: "boundary-minted", result: validated, fnTail: undefined };
      }
      return { source: bodySource, result: validated, fnTail };
    } finally {
      await binding.teardown?.();
      binding.finishInvocation?.();
    }
  }

  /**
   * RFC 0012 §10: the return-type site of a `subagent fn` (FN-6 *Return*): the
   * `): T` annotation when written, else FN-3's inference over the body tail
   * (`inferCalleeReturnAnnotation`), resolved in the DECLARING file — the
   * calling theta for a same-file fn, the declaring `.thetalib`'s own body for
   * an imported one (FN-9: free names and types resolve against the declaring
   * library; the materialised import carries that body as its `moduleScope`,
   * re-export chains already followed). `null` when neither names a type: the
   * value then crosses exactly as the wire carried it, the same posture a
   * `.theta`-callable call with no inferable return type takes.
   */
  #resolveSubagentFnReturnSite(
    theta: ConversationBindInput["theta"],
    request: SubagentFnChildRequest,
  ): InvokeReturnSite | null {
    const imported = theta.imports?.find(
      (entry) => entry.kind === "fn" && entry.name === request.fn.name,
    );
    const declarations = imported?.moduleScope?.body ?? theta.body;
    const site = {
      body: declarations,
      ...(imported === undefined && theta.importedTypeDecls !== undefined
        ? { importedTypeDecls: theta.importedTypeDecls }
        : {}),
    };
    const annotation =
      request.fn.returnType ??
      inferCalleeReturnAnnotation(
        request.fn.body,
        new Set(mergedSchemaDeclsOf(site).map((decl) => decl.name)),
        new Set(mergedEnumDeclsOf(site).map((decl) => decl.name)),
      );
    return annotation === null
      ? null
      : {
          annotation,
          declarations,
          ...(site.importedTypeDecls !== undefined
            ? { importedTypeDecls: site.importedTypeDecls }
            : {}),
        };
  }

  /** The file whose declarations a `subagent fn`'s returned enums are tagged with (bug 0337 posture). */
  #subagentFnDeclaringPath(
    theta: ConversationBindInput["theta"],
    request: SubagentFnChildRequest,
  ): string | undefined {
    return request.env.resolve(request.fn.name).moduleEnv?.currentResidence() ?? theta.sourcePath;
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
      /** Bug 0482: the chronological leaf path, for `thisTurnSettled`'s trailing-compaction check. */
      readonly readContextPath: () => readonly SessionEntry[];
      readonly userVisible: boolean;
      /** Bug 0354, INV-4: the per-chain depth counter, forwarded to the render so a cross-file `fn` interpolation call is counted. */
      readonly chain?: InvokeChain;
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
            mergedSchemaDeclsOf(deps.theta),
            mergedEnumDeclsOf(deps.theta),
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
    const renderedText = renderQueryText(expr, env, deps.chain);
    // WHY two text shapes (bug 0010): the restored two-phase path — live AND
    // off-session (increment D) — opens its free phase with the RENDERED QUERY
    // TEMPLATE BODY ONLY (QRY-14 step 1 — no JSON-only instruction, no inlined
    // schema; the shape is conveyed by the respond tool's parameters and the
    // QRY-15 template instead). The fused typed-aware text REMAINS only for
    // the degraded arm (`lowered === undefined`: an unlowerable annotation),
    // where the old fused-turn + text-parse fallback keeps typed behaviour
    // total.
    const queryText =
      respond !== undefined ? renderedText : renderTypedAwareQueryText(expr, env, lowered, deps.chain);

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
    const liveModel = new LivePromptQueryModel(
      this.#buildLiveModelOptions(deps, queryText, activeTools, maxRounds, respond),
    );
    // RFC 0012 §10 (D4): the live driver is the ONLY query driver. The
    // off-session sibling that served the in-process `subagent fn` body is
    // gone with that path — a `subagent fn` body now runs in its own child,
    // whose queries are that child's live turns.
    const model: QueryModelDriver = liveModel;

    // The respond-repair follow-up drive (QRY-22 / QRY-14 ¶3), two arms with
    // explicit WHY (bug 0010 increments C+D):
    //  - LIVE TYPED: each attempt RESTARTS the whole two-phase loop — the
    //    QRY-12 follow-up opens a fresh ON-SESSION free phase (respond tool
    //    active, capture re-armed, governor re-armed with a fresh budget)
    //    terminated by a FRESH off-session forced respond dispatch
    //    (query-tool-loop.md QRY-14 ¶3: follow-ups "restart the *whole*
    //    two-phase loop"). The old text-parse drive is retired here.
    //  - OFF-SESSION TYPED (increment D): the same restart over the HELD
    //    conversation — the QRY-12 follow-up joins it as a user message, the
    //    free-phase tool loop re-runs with a fresh budget, then a fresh forced
    //    respond dispatch terminates the attempt.
    // Only `#buildTypedValidation` consults this closure, and it is built only
    // when `lowered !== undefined` — which implies `respond !== undefined`, so
    // no respond-less (degraded) follow-up drive is reachable. Untyped queries
    // build no validation collaborator at all.
    const driveFollowUp = (
      prompt: string,
    ): Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome> =>
      liveModel.driveRepairAttempt(prompt);
    const validation =
      lowered !== undefined
        ? this.#buildTypedValidation(
            deps.theta,
            driveFollowUp,
            lowered,
            // F6: the QRY-12 follow-ups must name the REGISTERED respond tool
            // (collision-disambiguated when applicable), byte-equal to the
            // forced choice. Always present here — lowered !== undefined implies
            // respond !== undefined.
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
              schemaNames: new Set(mergedSchemaDeclsOf(deps.theta).map((decl) => decl.name)),
              enumNames: new Set(mergedEnumDeclsOf(deps.theta).map((decl) => decl.name)),
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

  /** Assemble the live query driver's options from the resolved model and turn context. */
  #buildLiveModelOptions(
    deps: {
      readonly pi: ExtensionAPI;
      readonly ctx: ExtensionCommandContext;
      readonly theta: ConversationBindInput["theta"];
      readonly thetaAbort: AbortController;
      readonly readMessages: () => readonly Message[];
      readonly readContextPath: () => readonly SessionEntry[];
    },
    queryText: string,
    activeTools: readonly string[],
    maxRounds: number,
    respond: RespondTurnContext | undefined,
  ): ConstructorParameters<typeof LivePromptQueryModel>[0] {
    const { root } = this.#input;
    // Bug 0479: the theta-resolved `model:` the free-phase turn runs under
    // (PIC-17 model window). `queryModelRef` travels alongside so a present
    // reference that no longer resolves is refused by name, not inherited.
    const queryModelRef = deps.theta.frontmatter.model;
    const queryModel = this.#resolveThetaModel(queryModelRef, deps.ctx.model);
    return {
          pi: deps.pi,
          ctx: deps.ctx,
          clock: root.clock,
          queryText,
          readMessages: deps.readMessages,
          readContextPath: deps.readContextPath,
          activeTools,
          thetaAbort: deps.thetaAbort,
          governor: this.#promptToolLoopGovernor,
          maxRounds,
          // PIC-50/51 (queryerror-variants.md §provider derivation): the api-shaped
          // `.api` of the model the turn is driven under — the theta-resolved
          // `model:` inside a model window, else the USER session's selected model
          // (`ctx.model`; never the short ProviderId); "unknown" when neither is
          // defined. The RESPOND dispatch derives its own provider from the
          // RESOLVED RESPOND MODEL's `.api` inside `dispatchForcedRespondTurn`
          // (bug 0010).
          provider: String((queryModel ?? deps.ctx.model)?.api ?? "unknown"),
          ...(queryModel !== undefined ? { queryModel } : {}),
          ...(queryModelRef !== undefined ? { queryModelRef } : {}),
          ...(respond !== undefined ? { respond } : {}),
          thetaName: deps.theta.slashName,
          emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
          ...(this.#input.systemNoteChannel !== undefined
            ? { systemNoteChannel: this.#input.systemNoteChannel }
            : {}),
    };
  }

  /**
   * The theta-resolved model every dispatch surface shares (frontmatter
   * `model`, frontmatter-fields-a.md; bug 0479): a present `model:` reference is
   * matched against the registry's available set by the same exact-match rule
   * the load pass used — present-but-unresolvable is `undefined` (a refusal on
   * the dispatching surface, never a silent session-model substitution) — and an
   * absent `model:` inherits the invocation-pinned session model.
   */
  #resolveThetaModel(modelRef: string | undefined, sessionModel: Model<Api> | undefined): Model<Api> | undefined {
    return modelRef !== undefined
      ? matchAvailableModel(modelRef, this.#input.modelRegistry.getAvailable())
      : sessionModel;
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
    // session model (`ctx.model`) ONLY when frontmatter omits `model:`.
    // WHY no `?? deps.ctx.model` on the resolved arm (bug 0010, fix round 1):
    // a PRESENT frontmatter `model:` that matches no available model is a
    // refusal, mirroring the binder's unresolved-reference posture — silently
    // substituting the session model would dispatch the respond turn against a
    // model the author explicitly steered away from. The respond context's
    // model stays `undefined` so `dispatchForcedRespondTurn` surfaces the
    // existing model-unavailable transport `Err`. The same resolution drives
    // the free-phase model window and the subagent launch (bug 0479).
    const respondModel = this.#resolveThetaModel(deps.theta.frontmatter.model, deps.ctx.model);
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
    theta: ConversationBindInput["theta"],
    driveFollowUp: (
      prompt: string,
    ) => Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome>,
    lowered: LoweredSchema,
    respondToolName?: string,
  ): TypedQuerySchemaValidation {
    return buildTypedQueryValidation({
      lowered,
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
   * semantically an invoke; a callee bound to a `kind: "runtime-tool"` entry
   * is a session-control runtime tool (RFC 0011, tool-calls.md
   * #session-control-runtime-tools); every other call is a Pi tool. The
   * resolution is against the callable set alone — snapshot-absent
   * (harness-only) never answers `"runtime-tool"` because only production
   * carries a snapshot.
   */
  #classifyCall(
    theta: ConversationBindInput["theta"],
    expr: CallExpr,
  ): "pi-tool" | "theta-callable" | "runtime-tool" {
    // RFC 0011 §6.1: the frozen entry’s kind decides. The runtime-tool check
    // precedes `thetaCalleePath` because the two name sets are disjoint (a
    // runtime tool is never a `.theta` callee), but the guard order keeps the
    // invariant explicit.
    const entry = theta.callableSet?.entries.get(expr.callee);
    if (entry?.kind === "runtime-tool") {
      return "runtime-tool";
    }
    return thetaCalleePath(theta, expr.callee) !== undefined ? "theta-callable" : "pi-tool";
  }

  /**
   * RFC 0011 §6.3: resolve a runtime-tool call to a dispatchable record.
   * Positional args are evaluated left-to-right (the same
   * `evaluatePureExpression` path the `.theta`-callable arm uses); the runtime
   * argument net (§5.4) validates each bound value before dispatch.
   *
   * tool-calls.md #session-control-runtime-tools; cancellation.md #cncl-1.
   */
  #resolveRuntimeToolCall(
    theta: ConversationBindInput["theta"],
    expr: CallExpr,
    env: LexicalEnvironment,
    signal: AbortSignal,
  ): RuntimeToolCall {
    const presentedName = expr.callee;
    const entry = theta.callableSet?.entries.get(presentedName);
    // Fail-closed: `#classifyCall` gates entry to this method on
    // `entry?.kind === "runtime-tool"`, so the else arm is unreachable from
    // any registered theta. A silent default would mask a wiring defect.
    if (entry === undefined || entry.kind !== "runtime-tool") {
      return {
        toolName: presentedName,
        dispatch: () => Promise.resolve(
          makeErr({
            kind: "code_tool",
            message: `internal error: '${presentedName}' is not a runtime tool`,
            tool_name: presentedName,
            cause: "unknown_tool",
          } as unknown as ThetaValue),
        ),
      };
    }
    const canonicalName: RuntimeToolName = entry.name;
    const sig = RUNTIME_TOOL_SIGNATURES.get(canonicalName)!;

    // Evaluate positional args left-to-right, matching the `.theta`-callable
    // `evaluatePureExpression` map in `#resolveCallAsInvoke`
    // (`src/extension/production-theta-producer.ts`).
    const argValues: ThetaValue[] = expr.args.map((a) =>
      evaluatePureExpression(a, env),
    );

    // Default binding: an absent optional arg binds the signature’s default.
    // compact’s single param has `hasDefault: true` → default "".
    const boundArgs: ThetaValue[] = [];
    for (let i = 0; i < sig.params.length; i++) {
      if (i < argValues.length) {
        boundArgs.push(argValues[i] as ThetaValue);
      } else if (sig.params[i]!.hasDefault) {
        boundArgs.push("" as ThetaValue);
      }
    }

    // §5.4 runtime argument net: every bound arg must be a string (the one
    // theta 1.x param type). A non-string bound value → the pinned validation
    // Err, pre-dispatch, no host call.
    for (let i = 0; i < boundArgs.length; i++) {
      if (typeof boundArgs[i] !== "string") {
        const argViolation = makeErr({
          kind: "code_tool",
          message: `argument '${sig.params[i]!.name}' must be a string`,
          tool_name: presentedName,
          cause: "validation",
        } as unknown as ThetaValue);
        return {
          toolName: presentedName,
          argViolation,
          dispatch: () => Promise.resolve(argViolation),
        };
      }
    }

    const hosts = this.#input.sessionControlHosts!;

    // Build the dispatch closure per canonical name. The adapter Promise is
    // wrapped at construction by `guardToolExecutePromise` (CANCEL-3) so a
    // late settlement after a theta abort is discarded (CNCL-1..3).
    let dispatchFn: () => Promise<ThetaValue>;
    switch (canonicalName) {
      case "compact":
        dispatchFn = () =>
          guardToolExecutePromise(
            executeCompactTool(hosts.ctx, presentedName, boundArgs[0] as string ?? ""),
            signalGuard(signal),
            noopSwallowChannels(),
          );
        break;
      case "context_usage":
        dispatchFn = () =>
          guardToolExecutePromise(
            executeContextUsageTool(hosts.ctx, presentedName),
            signalGuard(signal),
            noopSwallowChannels(),
          );
        break;
      case "session_name":
        dispatchFn = () =>
          guardToolExecutePromise(
            executeSessionNameTool(hosts.piHandle, presentedName, boundArgs[0] as string),
            signalGuard(signal),
            noopSwallowChannels(),
          );
        break;
    }

    return {
      toolName: presentedName,
      dispatch: dispatchFn,
    };
  }

  /**
   * H8b live tool-call resolver. Resolve `expr.callee` against the theta's frozen
   * `tools:` callable set (QTL-2 runtime enforcement) and return a
   * `CodeSideToolCall` whose `dispatch()` invokes the resolved host tool's
   * `execute(...)` (V14g lowering turns a clean resolve into `Ok(text)`, a throw
   * into `Err(CodeToolError{cause:"execution"})`). A callable name that is NOT
   * in the set, with the subagent-root regime INACTIVE, is a dispatch-time
   * snapshot miss (bug 0322 §Fix): the returned `CodeSideToolCall` carries the
   * `unknownHostTool` carrier, so `runCodeSideToolCall` surfaces
   * `Err(CodeToolError{cause:"unknown_tool"})` and NEVER calls `dispatch()` at
   * all. With the regime ACTIVE, the same missing name routes through the
   * PIC-58 dispatch ladder instead (unchanged; see `dispatch()` below), which
   * can still throw `UnknownHostToolError` on its own fail-closed rungs.
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
    // Bug 0322 §Fix (settled route: mint-at-the-seam): decide the disposition of
    // an un-snapshotted callee HERE, at resolve time, not inside the `dispatch()`
    // closure. The regime-INACTIVE half is a dispatch-time snapshot miss with no
    // theta-1.0-reachable path from a REGISTERED theta (parse rejects an
    // out-of-scope callee; load-time admission froze every `tools:` name into
    // the snapshot) — mint the typed `unknown_tool` carrier so
    // `runCodeSideToolCall` short-circuits without ever calling `dispatch()`.
    // The regime-ACTIVE half is untouched (PIC-58 ladder, a non-goal here) and
    // stays inside `dispatch()` below.
    const regime = this.#input.subagentRootRegime ?? { active: false as const };
    const unknownHostTool =
      tool === undefined && !regime.active ? buildCodeToolUnknownTool(toolName) : undefined;
    return {
      toolName,
      committed: [],
      ...(argDepthBreach !== undefined
        ? { argDepthBreach: { result: argDepthBreach.result, error: argDepthBreach.error } }
        : {}),
      ...(argSchemaViolation !== undefined ? { argSchemaViolation } : {}),
      ...(unknownHostTool !== undefined ? { unknownHostTool } : {}),
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
          //    ambient tool the theta never declared, so this path is
          //    resolved BEFORE `dispatch()` is ever built (bug 0322 §Fix): the
          //    caller sees the `unknownHostTool` carrier on the returned
          //    `CodeSideToolCall` and this branch is unreachable for that half —
          //    kept only so the regime-active half below stays inside the same
          //    `if (tool === undefined)` shape.
          //  - regime active (subagent-root child): PIC-58 bounds the child
          //    session's tools to the callable set's HOST-tool half (the
          //    `--tools` allowlist derived from the same snapshot — `.theta`
          //    names never enter it, bug 0218), so no undeclared ambient tool
          //    exists for the host loop to execute — ladder routing cannot
          //    widen reach (an outside-the-allowlist name reads back the
          //    fail-closed isError no-result) and stays the PIC-64 rung-3
          //    fail-closed floor the child-leg wiring suites drive, never a
          //    fabricated value.
          if (regime.active) {
            return this.#dispatchExtensionToolViaLadder(toolName, params, signal);
          }
          // Unreachable: `unknownHostTool` is set above whenever
          // `tool === undefined && !regime.active`, so `runCodeSideToolCall`
          // short-circuits on that carrier before `dispatch()` is ever called.
          // A synchronous throw (not a rejected Promise) is fine here — the
          // only purpose is keeping `tool` narrowed non-undefined for the
          // checks below and `UnknownHostToolError` alive as a used class (the
          // PIC-58 ladder still throws it on its own fail-closed rungs).
          throw new UnknownHostToolError(
            `code-side call names no resolvable host tool '${toolName}'`,
          );
        }
        if (typeof tool.execute !== "function") {
          // RFC 0010 (EXST-13): the snapshot strips `execute` from every
          // extension tool, but pi-theta's OWN tools (`theta_progress`) hold a
          // live in-process handler this process registered. Dispatch it
          // directly — same CANCEL-3 swallowing-handler attachment as a
          // built-in's `execute` below — so a code-side `theta_progress(...)`
          // call never fabricates a host turn (the PIC-64 bridge a host without
          // the fabricated-turn settle semantics cannot drive; bug 0477).
          const inProcess = this.#input.inProcessToolExecutors?.[tool.toolName];
          if (inProcess !== undefined) {
            return guardToolExecutePromise(
              inProcess(toolCallId, params, signal),
              signalGuard(signal),
              noopSwallowChannels(),
            );
          }
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
    /**
     * RFC 0010 (EXST-3(b)): the CALLING invocation's id, carried onto the
     * callee's bind input so the execution-status bus renders the callee as a
     * child node of its caller. `undefined` on a bind that holds no ticket (an
     * in-memory harness).
     */
    parentInvocationId: string | undefined,
    /** RFC 0015 (D5): the CALLER's trace closure, inherited by a
     *  prompt→prompt callee bind (top-level-card heat attribution). */
    trace: Trace | undefined,
  ): InvokeChild {
    // `expr.args[0]` is the callee path literal; the remaining args are the
    // positional invocation arguments bound to the callee's params.
    const argValues = expr.args.slice(1).map((arg) => evaluatePureExpression(arg, env, chain));
    // The `invoke<Schema>` return annotation drives the runtime AJV
    // return-value validation on the child's `Ok` payload (invocation.md §Typed
    // return, anchor `#typed-return`; hard-ceilings ceiling #4). Untyped
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
      evaluateCallSiteCwd(expr, env, chain),
      parentInvocationId,
      trace,
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
    /**
     * RFC 0010 (EXST-3(b)): the CALLING invocation's id, carried onto the
     * callee's bind input so the execution-status bus renders the callee as a
     * child node of its caller. `undefined` on a bind that holds no ticket (an
     * in-memory harness).
     */
    parentInvocationId: string | undefined,
    /** RFC 0015 (D5): the CALLER's trace closure (see `#resolveInvoke`). */
    trace: Trace | undefined,
  ): InvokeChild {
    const calleePath = thetaCalleePath(theta, expr.callee) ?? `./${expr.callee}.theta`;
    const argValues = expr.args.map((arg) => evaluatePureExpression(arg, env, chain));
    const rawCwd = evaluateCallSiteCwd(expr, env, chain);
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
      rawCwd,
      parentInvocationId,
      trace,
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
    /**
     * The call-site `with { cwd }` clause's evaluated value (RFC 0009 INV-6),
     * `undefined` when the dispatching call carried no clause (or an empty
     * one). Validated and resolved in `#driveCallee`, pre-spawn.
     */
    rawCwd: ThetaValue | undefined,
    /**
     * RFC 0010 (EXST-3(b)): the CALLING invocation's id, carried onto the
     * callee's bind input so the execution-status bus renders the callee as a
     * child node of its caller. `undefined` on a bind that holds no ticket (an
     * in-memory harness).
     */
    parentInvocationId: string | undefined,
    /** RFC 0015 (D5): the CALLER's trace closure (see `#resolveInvoke`). */
    trace: Trace | undefined,
  ): InvokeChild {
    return {
      calleePath,
      committed: [],
      drive: (): Promise<DrivenInvokeResult> => {
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
              // This ceiling refusal is THIS hop's own trampoline guard — the
              // callee never ran (bug 0294 provenance).
              return Promise.resolve({
                source: "boundary-minted",
                result: makeErr(surfaced.error as unknown as ThetaValue),
              });
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
            rawCwd,
            parentInvocationId,
            trace,
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
   * through the executor, and surface its top-level `Result` (FN-5). Bug 0293:
   * a missing / unreadable callee surfaces `Err(InvokeInfraError{cause:
   * "load_failure"})`; an existing-but-unparseable callee surfaces
   * `Err(InvokeInfraError{cause:"parse_failure"})` — never a fabricated
   * `Ok(null)`.
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
    rawCwd: ThetaValue | undefined,
    /**
     * RFC 0010 (EXST-3(b)): the CALLING invocation's id, carried onto the
     * callee's bind input so the execution-status bus renders the callee as a
     * child node of its caller. `undefined` on a bind that holds no ticket (an
     * in-memory harness).
     */
    parentInvocationId: string | undefined,
    /** RFC 0015 (D5): the CALLER's trace closure — handed to a prompt→prompt
     *  callee bind below so nested-invoke heat keys the top-level card;
     *  subagent callees run in a child process and ignore it. */
    trace: Trace | undefined,
  ): Promise<DrivenInvokeResult> {
    const boundary = await this.#guardInvokeBoundary(theta, calleePath, argValues, ctx, rawCwd);
    if ("result" in boundary) return boundary;
    const { callee, resolvedCwd } = boundary;
    // tool-calls.md §"Return type" (registered-theta row): the return type of a
    // `.theta`-callable call is the callee's INFERRED return type, which is
    // legible only now that the callee is parsed — and it resolves against the
    // CALLEE's own `schema` / `enum` declarations, not the caller's, because it
    // is the callee's type. An `invoke<Schema>` annotation is the caller's and
    // keeps resolving there.
    const returnSite = this.#resolveReturnSite(theta, returnTyping, callee);
    const paramBindings = await this.#bindCalleeParams(callee, argValues);
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
        // EXST-3(b): guarded spread — `exactOptionalPropertyTypes` distinguishes
        // an omitted key from one set to `undefined`.
        ...(parentInvocationId !== undefined ? { parentInvocationId } : {}),
        // RFC 0015 (D5): the callee inherits the caller's trace closure.
        ...(trace !== undefined ? { trace } : {}),
      });
      // Decision 6 / Increment B1: the child bind registered an
      // ActiveInvocationRegistry entry; the `finally` calls its
      // `finishInvocation` AFTER the child body (`runPromptSuspendInvoke`, whose
      // `childBody` runs `executeBody`) + the typed-return validation, so the
      // entry SPANS the nested callee's real in-flight window.
      try {
        const outcome = await runPromptSuspendInvoke<ResultValue>({
          childCallableSet: callableSetPiToolNames(callee),
          pi: this.#input.pi,
          // Bug 0372 §Fix: the compliant `ActiveSetGateDeps` the cross-mode
          // restore window threads into `withActiveSetGate`.
          thetaName: callee.slashName,
          emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
          emitSystemNote: (note): void => {
            sendSystemNote(note, this.#systemNoteChannel());
          },
          // PIC-19: a step-1/step-2 setup throw re-propagates out of
          // `withActiveSetGate` (it calls this hook THEN re-throws), with no
          // local catch here — the throw unwinds to `runInvokeChild`'s
          // boundary catch (invoke-cancellation.ts), which converts it into
          // `Err(InvokeInfraError{cause:"internal_error"})`, the
          // registry-pinned internal-error channel for an invoke parent. This
          // hook stays a no-op so the defect is routed exactly once, never
          // twice.
          routeInternalError: (): void => {},
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
        // The child's own body ran and settled `outcome.result` — callee-returned
        // (bug 0294 provenance), whatever `kind` its `Err` (if any) carries.
        const bodySource: InvokeResultSource = "callee-returned";
        // invocation.md §Typed return (anchor `#typed-return`): apply the `invoke<Schema>` return
        // validation to the child's `Ok` payload, exactly as the spawn path below.
        return this.#projectValidatedReturn(
          calleePath,
          returnSite,
          outcome.result,
          bodySource,
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
      // EXST-3(b): the caller's invocation id, for the child-node relation.
      ...(parentInvocationId !== undefined ? { parentInvocationId } : {}),
      // RFC 0009 INV-8: the validated, `path.resolve`-normalised call-site cwd.
      // Guarded spread, not a bare `resolvedCwd` — `exactOptionalPropertyTypes`
      // distinguishes an omitted key from one explicitly set to `undefined`,
      // and an absent clause must leave the launch bind byte-identical.
      ...(resolvedCwd !== undefined ? { resolvedCwd } : {}),
    });
    // Decision 6 / Increment B1: the spawn bind registered an
    // ActiveInvocationRegistry entry; the `finally` calls its `finishInvocation`
    // AFTER `executeBody` + `surface` (which runs the spawned session's
    // `dispose()`) + the typed-return validation, so the entry SPANS the nested
    // subagent callee's real in-flight window and its barrier settles
    // post-dispose.
    try {
      // RFC-0006 (PIC-59): a subagent-mode callee runs its whole body in the
      // spawned child; the parent resolves the invocation through the binding's
      // self-contained `drive()` (launch → await envelope → map), NOT by running
      // `executeBody` in-parent. `drive` is always present on the subagent
      // binding; `surface(executeBody(...))` is the harness fallback.
      //
      // Provenance (bug 0294): a `drive()` settle is the envelope-consumption
      // seam's own `source` tag (`driveSource()`, mirroring `forwardedEnumTags`)
      // — `callee-returned` on `Ok` and on the envelope's own `err` arm,
      // `boundary-minted` on a parent-side fail-closed map. The in-process
      // `surface(executeBody(...))` fallback is always the callee's own body,
      // so it is unconditionally `callee-returned`.
      let result: ResultValue;
      let bodySource: InvokeResultSource;
      if (binding.drive !== undefined) {
        result = await binding.drive();
        bodySource = binding.driveSource?.() ?? "callee-returned";
      } else {
        result = binding.surface(await executeBody(callee.body, binding.executeDeps));
        bodySource = "callee-returned";
      }
      // invocation.md §Typed return (anchor `#typed-return`; hard-ceilings ceiling #4): AJV-validate
      // the child's returned value against the `invoke<Schema>` annotation. A
      // mismatch (e.g. a `string` under `invoke<number>`) is
      // `Err(InvokeInfraError{cause:"return_validation"})`, aborting the parent.
      return this.#projectValidatedReturn(
        calleePath,
        returnSite,
        result,
        bodySource,
        callee.sourcePath,
        binding.forwardedEnumTags?.(),
      );
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

  /** Check the invoke boundary and parse its callee in the prescribed guard order. */
  async #guardInvokeBoundary(
    theta: ConversationBindInput["theta"],
    calleePath: string,
    argValues: readonly ThetaValue[],
    ctx: ExtensionCommandContext,
    rawCwd: ThetaValue | undefined,
  ): Promise<DrivenInvokeResult | {
    callee: ConversationBindInput["theta"];
    resolvedCwd: string | undefined;
  }> {
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
        // This ceiling refusal is THIS hop's own guard on the caller-supplied
        // argument — the callee never ran (bug 0294 provenance).
        return { source: "boundary-minted", result: breach.result };
      }
    }

    // RFC 0009 INV-6 (invocation.md `#options-surface`): validate and resolve the
    // call-site `cwd` before any dispatch work. An empty string and a non-string
    // are authoring bugs — `Err(InvokeInfraError { cause: "validation" })`, never
    // a silent parent-cwd inherit. A relative value resolves against the parent
    // invocation's effective cwd (`ctx.cwd`, the exact value the default launch
    // bind forwards), which composes across nesting because a child's `ctx.cwd`
    // IS its spawn cwd. `path.resolve` is also the Windows separator-spelling
    // normalisation (the bug 0467 class): both spellings of one directory
    // converge on the host-native resolved form, which is the spelling the spawn
    // option wants (diagnostic rendering's POSIX spelling is a separate concern
    // and is not applied here). This guard is THIS hop's own, pre-spawn,
    // boundary-minted (bug 0294 provenance).
    let resolvedCwd: string | undefined;
    if (rawCwd !== undefined) {
      if (typeof rawCwd !== "string" || rawCwd === "") {
        const error: InvokeInfraError = {
          kind: "invoke_infra",
          message:
            typeof rawCwd !== "string"
              ? `invoke callee '${calleePath}' with-clause cwd is not a string`
              : `invoke callee '${calleePath}' with-clause cwd is empty`,
          callee_path: calleePath,
          cause: "validation",
        };
        return {
          source: "boundary-minted",
          result: makeErr(error as unknown as ThetaValue),
        };
      }
      resolvedCwd = resolvePath(ctx.cwd, rawCwd);
    }

    const escape = await this.#recheckCalleeContainment(theta, calleePath);
    if (escape !== undefined) {
      // The containment re-check is THIS hop's own guard — the callee never ran
      // (bug 0294 provenance).
      return { source: "boundary-minted", result: makeErr(escape as unknown as ThetaValue) };
    }
    // Bug 0293 (queryerror-variants.md:182-183): the verdict discriminates the
    // spec's `load_failure` (callee unreadable / un-loadable) from `parse_failure`
    // (callee failed to parse) — `internal_error` stays reserved for the
    // runtime-defect surface (error-model.md §Runtime-panics) and is never minted
    // here. `undefined` (seam absent, or a non-production stub) defaults to
    // `load_failure`, preserving the pre-0293 unit-harness behaviour.
    const parsed = await this.#input.parseCallee?.(theta.sourcePath, calleePath);
    if (parsed === undefined || parsed.kind !== "ok") {
      const cause: InvokeInfraCause = parsed?.kind === "unparseable" ? "parse_failure" : "load_failure";
      const message =
        parsed?.kind === "unparseable"
          ? `invoke callee '${calleePath}' failed to parse`
          : `invoke callee '${calleePath}' could not be loaded`;
      const error: InvokeInfraError = {
        kind: "invoke_infra",
        message,
        callee_path: calleePath,
        cause,
      };
      // A load / parse failure is THIS hop's own guard — the callee's own code
      // never ran (bug 0294 provenance).
      return { source: "boundary-minted", result: makeErr(error as unknown as ThetaValue) };
    }
    const callee = parsed.input;
    // RFC 0009 INV-8 runtime arm: a clause whose callee was NOT statically
    // resolvable and turns out prompt-mode at runtime refuses here — the same
    // `"validation"` arm the clause's input-shape violations use, minting no new
    // runtime code (DIAG-2). Placed BEFORE the prompt-attach branch below so no
    // prompt-mode callee ever attaches OR spawns under a clause; the
    // statically-resolvable case never reaches this line (its parse error
    // un-registers the caller).
    if (resolvedCwd !== undefined && callee.frontmatter.mode === "prompt") {
      const error: InvokeInfraError = {
        kind: "invoke_infra",
        message: `invoke callee '${calleePath}' is prompt-mode; with-clause cwd requires a subagent-mode callee`,
        callee_path: calleePath,
        cause: "validation",
      };
      return {
        source: "boundary-minted",
        result: makeErr(error as unknown as ThetaValue),
      };
    }
    return { callee, resolvedCwd };
  }

  /** Bind positional callee params, recovering declared defaults only for omitted slots. */
  async #bindCalleeParams(
    callee: ConversationBindInput["theta"],
    argValues: readonly ThetaValue[],
  ): Promise<Map<string, ThetaValue>> {
    const paramNames = callee.frontmatter.params?.fields.map((field) => field.wireName) ?? [];
    // An omitted slot (`argValues[index] === undefined`, the presence check —
    // `noUncheckedIndexedAccess`) recovers the DECLARED default via
    // `#recoverDeclaredDefaults`, the same value the slash/binder path already
    // fills (0165/0181/0186 lineage), restoring inter-path consistency; an
    // in-range value INCLUDING an explicit `null` is a first-class value bound
    // as-is (invocation.md:50 arity admission; frontmatter-fields-b-and-templates.md:46
    // resolves the `system:` template against the validated params object).
    // `??` would conflate absence with `null`, which is bug 0409.
    const defaultedFields = callee.frontmatter.params?.defaultedFields ?? [];
    const omittedDefaulted = defaultedFields.filter(
      (wireName) => argValues[paramNames.indexOf(wireName)] === undefined,
    );
    const recovered =
      omittedDefaulted.length > 0 ? await this.#recoverDeclaredDefaults(callee, omittedDefaulted) : [];
    const recoveredByName = new Map(recovered.map((field) => [field.wireName, field.defaultValue as ThetaValue]));
    const paramBindings = new Map<string, ThetaValue>();
    paramNames.forEach((name, index) => {
      const supplied = argValues[index];
      if (supplied !== undefined) {
        paramBindings.set(name, supplied);
        return;
      }
      // A slot with no recoverable default (non-defaulted, or best-effort
      // recovery failed) falls back to `null` — the pre-existing behaviour for
      // those cases; only the defaulted+recovered case is new.
      paramBindings.set(name, recoveredByName.get(name) ?? null);
    });
    return paramBindings;
  }

  /** Validate a returned value and preserve whether this hop or its callee minted the result. */
  #projectValidatedReturn(
    calleePath: string,
    returnSite: InvokeReturnSite | null,
    result: ResultValue,
    bodySource: InvokeResultSource,
    calleeSourcePath: string | undefined,
    forwardedEnumTags?: readonly EnumTagEntry[],
  ): DrivenInvokeResult {
      const validated = this.#validateInvokeReturn(
        calleePath,
        returnSite,
        result,
        calleeSourcePath,
        forwardedEnumTags,
      );
      // A return_validation `Err` minted from an `Ok` body payload is THIS
      // hop's own guard, not the callee's (bug 0294 provenance).
      if (!validated.ok && result.ok) {
        return { source: "boundary-minted", result: validated };
      }
      return { source: bodySource, result: validated };
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
    try {
      const verdict = await recheckInvokePathAtRuntime({
        deps: { fs: fileSystem },
        resolvedPath,
        literalPath: calleePath,
        activeRoots,
      });
      return verdict.kind === "escape" ? verdict.error : undefined;
    } catch (thrown: unknown) { // allow-broad-catch: ENOENT-on-absence only, re-raised below
      // Bug 0293 (invocation.md §Resolution / INV-1): `canonicalizePath`'s
      // `fs.realpath` assumes the callee exists; a MISSING callee rejects ENOENT
      // before containment can even be decided. Absence is not an escape —
      // there is nothing to escape TO — so it falls through to `#driveCallee`'s
      // load arm, which mints `load_failure`. A broken symlink INSIDE a root
      // also rejects ENOENT here (its target is absent) but its OWN path exists
      // as a directory entry (`lstat` succeeds), so INV-1's disposition for it is
      // unweakened: re-throw and let the invoke boundary's non-panic default
      // (`internal_error`) stand, exactly as before this fix. Any other error
      // (a non-ENOENT `realpath` failure, or a deleted root) also re-throws
      // unchanged.
      if (isEnoent(thrown) && (await calleePathIsAbsent(fileSystem, resolvedPath))) {
        return undefined;
      }
      throw thrown;
    }
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
        return {
          annotation: returnTyping.annotation,
          declarations: theta.body,
          ...(theta.importedTypeDecls !== undefined
            ? { importedTypeDecls: theta.importedTypeDecls }
            : {}),
        };
      case "untyped":
        return null;
      case "callee-inferred": {
        // Bug 0465: feed the SAME merged (imports + same-file) name sets the
        // lowering seam itself will resolve against, so a constructor tail
        // naming an imported schema (or an enum-variant tail naming an
        // imported enum) is recognised here too — the §Non-goal residual
        // (`inferCalleeReturnAnnotation`'s conservative floor) this fix's
        // §Fix names as recovering, not filed on its own.
        const annotation = inferCalleeReturnAnnotation(
          callee.body,
          new Set(mergedSchemaDeclsOf(callee).map((decl) => decl.name)),
          new Set(mergedEnumDeclsOf(callee).map((decl) => decl.name)),
        );
        return annotation === null
          ? null
          : {
              annotation,
              declarations: callee.body,
              ...(callee.importedTypeDecls !== undefined
                ? { importedTypeDecls: callee.importedTypeDecls }
                : {}),
            };
      }
    }
  }

  /**
   * Typed-return runtime validation (invocation.md §Typed return, anchor
   * `#typed-return`): lower the resolved return-type
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
    forwardedEnumTags?: readonly EnumTagEntry[],
  ): ResultValue {
    if (returnSite === null || !result.ok) {
      return result;
    }
    const { annotation: returnSchema, declarations, importedTypeDecls } = returnSite;
    const mergedSite = { body: declarations, importedTypeDecls };
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
      mergedSchemaDeclsOf(mergedSite),
      mergedEnumDeclsOf(mergedSite),
    );
    if (lowered === undefined) {
      return result;
    }
    const validator = this.#input.root.schemaValidator.compile(lowered);
    const verdict = validator.validate(projectForValidation(result.value));
    if (verdict.ok) {
      const decoded = decodeInboundValue({
        lowered: lowered as unknown as Record<string, unknown>,
        annotation: returnSchema,
        schemaNames: new Set(mergedSchemaDeclsOf(mergedSite).map((decl) => decl.name)),
        enumNames: new Set(mergedEnumDeclsOf(mergedSite).map((decl) => decl.name)),
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
      });
      // Bug 0342 §Fix (D3 carriage): the immediate-callee retag above is right
      // for one hop and wrong across a SUBAGENT hop that forwards a value it
      // did not itself declare — the PIC-59 envelope collapsed that value's
      // own boxed carrier before this decode ever saw it, so the retag above
      // stamped the immediate callee's key over the forwarding file's own
      // declaring key. When the envelope carried the `enum_tags` sidecar,
      // restore each forwarded position's declaring key over that stamp.
      // Absent `forwardedEnumTags` (undefined, or an empty list) leaves
      // `decoded` exactly as the immediate-callee retag produced it — the
      // attach leg's call site passes nothing here, by design.
      const retagged =
        forwardedEnumTags !== undefined && forwardedEnumTags.length > 0
          ? retagForwardedEnums(decoded, forwardedEnumTags)
          : decoded;
      return makeOk(retagged);
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

/** Project a prompt invocation's terminal outcome onto its PIC-53 surface. */
function promptModeSurface(readMessages: () => readonly Message[]): BodyExecutingConversationBinding["surface"] {
      // PIC-53: the prompt-mode return value is the trailing turn's accumulated
      // assistant text of the driven user session on the SUCCESS path. A failed
      // run surfaces its real terminal outcome (mirroring the subagent surface):
      // a `?`-propagated `Err` carries its `QueryError` payload so the
      // slash-dispatch boundary (SLSH-3) can emit the top-level err note, and
      // any other fail / cancel surfaces the terminal cancellation `Err` — never
      // a masking `Ok`. Without this a failed prompt theta was indistinguishable
      // from a successful one and the SLSH-3 note was never emitted.
      return (execution: BodyExecution): ResultValue => {
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
      };
}

/** Build the launched child's drive/provenance closures and idempotent teardown. */
function buildSubagentDriveBinding({
  child, thetaAbort, theta, emitDiagnostic, detachChildTap, placementLease,
  paramsCleanup, cancellation, ticket, root, finishInvocation,
}: {
  child: Parameters<typeof driveSubagentChild>[0]["child"];
  thetaAbort: AbortController;
  theta: ConversationBindInput["theta"];
  emitDiagnostic: (diagnostic: Diagnostic) => void;
  detachChildTap: (() => void) | undefined;
  placementLease: PlacementLease;
  paramsCleanup: () => void;
  cancellation: ReturnType<typeof attachSubagentCancellation>;
  ticket: ActiveInvocationTicket;
  root: RuntimeRoot;
  finishInvocation: () => void;
}): ConversationBinding {
    /**
     * PIC-59. Await the child's `theta_result` envelope (stray-line tolerant) and
     * map `ok`/`err` to the invocation `Result`. A child that exits WITHOUT an
     * envelope maps fail-closed to Err(InvokeInfraError{cause:"internal_error"}).
     * The file-callee slash/invoke drive seam calls this INSTEAD of executing the
     * body in-process (the whole callee body ran in the child).
     */
    // Bug 0342 §Fix (D3 carriage): the subagent leg's per-position
    // declaring-enum tags, parsed off the envelope's OPTIONAL `enum_tags`
    // sidecar on the Ok path. Captured in this closure so the returned
    // binding's `forwardedEnumTags` can hand them to the invoke-return retag
    // once `drive()` has actually run; `undefined` until then, and whenever
    // the envelope carried no sidecar (an enum-free return, or an
    // envelope-version predating it).
    let forwardedEnumTagsHolder: readonly EnumTagEntry[] | undefined;
    // Bug 0294 provenance sidecar (mirrors `forwardedEnumTagsHolder`'s
    // holder/accessor pattern): an `Ok` settle is always the callee's own
    // return; an `err` settle carries the envelope-consumption seam's own
    // `source` tag (`SubagentInvocationResult`'s err arm), which `#driveCallee`
    // reads via `driveSource()` to source-tag the subagent leg's body outcome.
    let lastDriveSource: InvokeResultSource = "callee-returned";
    // RFC 0012 §10: the `fn_tail` marker of the last settled envelope (a
    // `subagent fn` child's `Result`-valued tail), same holder pattern.
    let lastFnTail: FnTail | undefined;
    const drive = async (): Promise<ResultValue> => {
      const result: SubagentInvocationResult = await driveSubagentChild({
        child,
        thetaAbort,
        calleePath: theta.sourcePath ?? theta.slashName,
        emitDiagnostic,
      });
      lastFnTail = result.fnTail;
      if (result.ok) {
        forwardedEnumTagsHolder = result.enumTags;
        lastDriveSource = "callee-returned";
        return makeOk(result.value as ThetaValue);
      }
      lastDriveSource = result.source;
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
      // EXST-5: detach the activity tap before the child teardown runs
      // (idempotent — a Set delete after close is a no-op).
      detachChildTap?.();
      // RFC 0012 §6: free this launch's visible slot for the next launch.
      placementLease.release();
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
      drive,
      // Bug 0342 §Fix: hands the subagent leg's per-position declaring-enum
      // tags (captured by `drive()`, above) to `#validateInvokeReturn`'s
      // invoke-return retag. Undefined until `drive()` has settled an `Ok`
      // whose envelope carried the sidecar.
      forwardedEnumTags: (): readonly EnumTagEntry[] | undefined => forwardedEnumTagsHolder,
      // Bug 0294: exposes `lastDriveSource` (set by `drive()`, above) so
      // `#driveCallee` can source-tag the subagent leg's body outcome for the
      // XMODE-1 wrap without re-deriving it from the settled `Result`'s `kind`.
      driveSource: (): InvokeResultSource => lastDriveSource,
      // RFC 0012 §10: the `fn_tail` marker for `#resolveSubagentFnChild`'s
      // FN-6 projection; `undefined` on every `.theta` callee envelope.
      driveFnTail: (): FnTail | undefined => lastFnTail,
      teardown,
      finishInvocation,
    };
}

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

/**
 * QTL-4. The underlying Pi-tool names in the theta's frozen `tools:` callable set
 * — the host tool each `pi-tool` entry dispatches to (an `as`-rename entry
 * carries the underlying tool's own registered name, which is what the model's
 * active-tool set must reference). A theta with no snapshot (an in-memory
 * fixture) or no Pi tools yields `[]`, so the prompt-mode active set stays empty
 * and no ambient tool is installed.
 */
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
 * `parseCallee` (the frozen entry carries the callee's `mode` and `calleePath`
 * only; the parsed callee itself is not held on the snapshot). A theta with no
 * snapshot yields `[]`.
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

/**
 * SUBAG-2 model-callable `.theta`: the injected drive + setup-throw + param-order
 * collaborators the model-driven `.theta` adapter core dispatches through.
 * Extracted so the model-driven `.theta` seam (arg-mapping declaration order,
 * ceiling-#4 depth block, `Result` lowering, setup-throw translation,
 * re-entrancy) is deterministically testable against scripted collaborators.
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
    argValues: readonly (ThetaValue | undefined)[],
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
  // Own-key guard distinguishes an explicit JSON `null` from the model (an own
  // key → stays `null`, preserved end-to-end, symmetric with the invoke path)
  // from an omitted key (→ `undefined` → default recovery downstream at
  // `#driveCallee`); `??` conflates the two, which is bug 0409. `Object.hasOwn`
  // (not `in`) so an inherited `Object.prototype` member cannot be read as a
  // present param.
  const argValues: readonly (ThetaValue | undefined)[] = spec.paramOrder.map((name) =>
    Object.hasOwn(args, name) ? (args[name] as ThetaValue) : undefined,
  );
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
  chain?: InvokeChain,
): string {
  const base = renderQueryText(expr, env, chain);
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
 * The theta body's SAME-FILE `enum` declarations (bug 0028 §Fix:
 * `schemaDeclsOf`'s enum sibling). Both `lowerQueryResponseSchema` call sites
 * pass `mergedEnumDeclsOf` / `mergedSchemaDeclsOf` (bug 0465), which merge
 * these same-file decls with the theta's imported ones; `enumDeclsOf` /
 * `schemaDeclsOf` supply the same-file half so a declared `enum` annotation
 * (`@<Severity>`) resolves at the typed-query / `invoke<T>` lowering exactly
 * as it does on the `params:` path.
 */
function enumDeclsOf(body: ThetaBody): EnumDecl[] {
  return body.statements.filter((stmt): stmt is EnumDecl => stmt.kind === "enum");
}

/**
 * Bug 0488: the synthesised `__theta_respond_<slug>` tool names for every
 * typed query the session THIS launch spawns will drive — the launch-time
 * input to `SubagentArgvInput.respondToolNames`. A `.theta` callable's
 * `--tools` allowlist must carry these or the ≥0.86 strict allowlist
 * suppresses the child's own mid-session respond-tool registration
 * (docs/bugs/0488-….md).
 *
 * Bodies the driven session executes inline (each contributing its typed
 * queries' respond names):
 *  - `fn` entry — the NAMED `subagent fn`'s own body (an unresolved name
 *    yields no names; the drive path `#driveSubagentFnEntry` reports the
 *    parent/child parse divergence, this function does not speculate about
 *    it), PLUS every SAME-FILE top-level ordinary `fn` body: a sibling
 *    ordinary fn called from the subagent-fn body runs inline in the same
 *    child session and registers its typed queries' respond tools
 *    mid-session, yet it is a statement of the enclosing theta's body — never
 *    of `fn.body` — so `collectSessionTypedQueries(fn.body)` alone misses it.
 *    The enclosing theta's top-level body is NOT added (the fn session does
 *    not drive it — FN-7 symmetry).
 *  - theta entry (the default) — the theta's own body, whose walk already
 *    descends same-file ordinary `fn` bodies and stops at `subagent fn`
 *    boundaries.
 *  - BOTH entries — every imported module's body (`imp.moduleScope.body`):
 *    an imported ordinary `.thetalib` `fn` is inline-callable, and its body
 *    lives only in the import's module scope, never in `theta.body`.
 *    `collectSessionTypedQueries` skips `subagent fn` bodies inside it.
 *
 * Over-collection is SAFE (bug 0488 cell 4: pi ≥0.86 tolerates an allowlist
 * name unknown at startup; the OMP dialect gates all respond names out at the
 * emit site), so this over-approximates rather than tracks reachability.
 *
 * Every schema is lowered against the CALLER theta's merged decls
 * (`mergedSchemaDeclsOf(theta)` / `mergedEnumDeclsOf(theta)`) — parity with
 * the child's actual lowering site: `#driveSubagentFnEntry` binds the body
 * over `configured.theta` (`#applySubagentFnConfig` overrides only frontmatter
 * / callable set, leaving `body`/`imports`/`importedTypeDecls` the caller's),
 * so the child's `#resolvePromptQuery` lowers each query with
 * `mergedSchemaDeclsOf(deps.theta)` = the CALLER theta's decls. Lowering here
 * against any other decl set would mint a name the child never registers.
 * Each lowered schema mints its respond name via the SAME `respondSchemaSlug`
 * + `respondToolName` recipe the drive layer uses (single-source, bug
 * 0099/0488); an unlowerable schema is skipped as the drive layer's degraded
 * arm treats it. Deduped and SORTED for a deterministic argv.
 */
export function collectLaunchRespondNames(
  theta: ConversationBindInput["theta"],
  entry: SubagentLaunchEntry,
): string[] {
  const bodies: ThetaBody[] = [];
  if (entry.kind === "fn") {
    const lookupEnv = buildBoundEnvironment(
      theta.body,
      undefined,
      theta.imports,
      presentedCallableNames(theta),
      theta.sourcePath,
    );
    const resolution = lookupEnv.resolve(entry.name);
    const fn =
      (resolution.arm === "fn" || resolution.arm === "import") && resolution.fn?.subagent === true
        ? resolution.fn
        : undefined;
    if (fn === undefined) {
      return [];
    }
    bodies.push(fn.body);
    for (const stmt of theta.body.statements) {
      if (stmt.kind === "fn" && stmt.subagent !== true) {
        bodies.push(stmt.body);
      }
    }
  } else {
    bodies.push(theta.body);
  }
  for (const imp of theta.imports ?? []) {
    if (imp.moduleScope?.body !== undefined) {
      bodies.push(imp.moduleScope.body);
    }
  }
  const schemaDecls = mergedSchemaDeclsOf(theta);
  const enumDecls = mergedEnumDeclsOf(theta);
  const names = new Set<string>();
  for (const body of bodies) {
    for (const q of collectSessionTypedQueries(body)) {
      if (q.schema === null) {
        continue;
      }
      const lowered = lowerQueryResponseSchema(q.schema, schemaDecls, enumDecls);
      if (lowered === undefined) {
        continue;
      }
      names.add(respondToolName(respondSchemaSlug(lowered)));
    }
  }
  return [...names].sort();
}

/**
 * Bug 0465 — the merged declaration set `lowerQueryResponseSchema` resolves an
 * annotation against: this theta's OWN `schema` decls, plus every imported
 * schema `checkThetaImports` materialised for it (`theta.importedTypeDecls`,
 * absent for a theta with no top-level `import`, matching `imports`). SAME-FILE
 * WINS a name collision (the existing whole-file rule schema-subset.md already
 * gives a same-file decl over anything else): an imported decl whose name
 * collides with a same-file one is filtered out before the merge, so it is
 * never even offered to `buildBodyTypeSchemas` — not relied on to lose a
 * `.set()` tie-break downstream. Imported decls are listed FIRST only so a
 * same-file decl's later `.set()` write is the one that survives if this
 * filter were ever bypassed; the filter is what actually decides the winner.
 */
export function mergedSchemaDeclsOf(theta: {
  readonly body: ThetaBody;
  readonly importedTypeDecls?: ThetaCompositionInput["importedTypeDecls"];
}): SchemaDecl[] {
  const sameFile = schemaDeclsOf(theta.body);
  const sameFileNames = new Set(sameFile.map((decl) => decl.name));
  const imported = (theta.importedTypeDecls?.schemas ?? []).filter(
    (decl) => !sameFileNames.has(decl.name),
  );
  return [...imported, ...sameFile];
}

/** The `enum` sibling of {@link mergedSchemaDeclsOf} — same same-file-wins filter. */
export function mergedEnumDeclsOf(theta: {
  readonly body: ThetaBody;
  readonly importedTypeDecls?: ThetaCompositionInput["importedTypeDecls"];
}): EnumDecl[] {
  const sameFile = enumDeclsOf(theta.body);
  const sameFileNames = new Set(sameFile.map((decl) => decl.name));
  const imported = (theta.importedTypeDecls?.enums ?? []).filter(
    (decl) => !sameFileNames.has(decl.name),
  );
  return [...imported, ...sameFile];
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
function renderQueryText(expr: QueryExpr, env: LexicalEnvironment, chain?: InvokeChain): string {
  const lexed = lexQueryTemplate(expr.template);
  let text = "";
  for (const part of lexed.parts) {
    if (part.kind === "text") {
      text += part.value;
      continue;
    }
    // Bug 0476 follow-up: `stringifyInterpolation` re-parses `part.exprSource`
    // standalone (`parseExpressionSource`), so any panic it raises carries an
    // interpolation-LOCAL coordinate (line 1, column within the `${…}` body),
    // not a file coordinate. This is the one boundary that knows both that
    // local coordinate and the enclosing query's own real range (`expr.range`)
    // — retarget here, then re-throw.
    try {
      text += stringifyInterpolation(part.exprSource, env, chain);
    } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 follow-up)
      if (isThetaPanic(thrown)) {
        retargetInterpolationPanic(thrown, {
          source: part.exprSource,
          file: env.currentResidence(),
          range: expr.range,
        });
      }
      throw thrown;
    }
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
function stringifyInterpolation(source: string, env: LexicalEnvironment, chain?: InvokeChain): string {
  const parsed = parseExpressionSource(source);
  if (parsed === null) {
    // An unparseable interpolation has no value; render the inert `null` rather
    // than throwing out of the render path — this render's own fallback, not a
    // rule expressions.md states (bug 0116).
    return "null";
  }
  const value = evaluatePureExpression(parsed, env, chain);
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
