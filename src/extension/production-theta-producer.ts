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
  AgentToolResult,
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { parseDocument } from "yaml";
import {
  buildSessionContext,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
// SUBAG-2 (extension-bootstrap-and-per-theta.md §Per-theta registration): a
// `.theta`-as-tool `ToolDefinition.parameters` wraps the callee's lowered JSON
// Schema via `Type.Unsafe<unknown>(...)` — the same TypeBox pattern the binder
// envelope tool uses (`binder-inference.ts`), so TypeBox carries the JSON Schema
// through to the provider lowering layer.
import { Type } from "typebox";
import {
  attachSubagentAbortForwarding,
  extractSubagentQueryResult,
  makeIdempotentDispose,
} from "../runtime/subagent-isolation";
import { runPromptSuspendInvoke } from "../runtime/invoke-prompt-suspend";
import type { ThetaMode } from "../parser/frontmatter";
import type {
  Api,
  AssistantMessage,
  Message,
  Model,
  Tool,
  ToolCall,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
// pi-ai 0.80.x moved the streaming free functions off the package root into
// the publicly-exported `/compat` subpath (package.json `exports["./compat"]`
// -> dist/compat.d.ts); the root barrel no longer re-exports `complete`.
import { complete } from "@earendil-works/pi-ai/compat";
import type { Clock } from "../seams/clock";
import type { RuntimeRoot } from "../runtime-root";
import type {
  ActiveInvocationEntry,
  ActiveInvocationRegistry,
} from "../runtime/active-invocation-registry";
import type { ForwardingSignalSource } from "./session-shutdown";
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
} from "../runtime/effectful-statement-host";
import { createEffectfulStatementHost } from "../runtime/effectful-statement-host";
import {
  buildEnvironment,
  type EnumRegistration,
  type LexicalEnvironment,
  type MaterializedImport,
} from "../runtime/lexical-environment";
import {
  executeBody,
  ThetaFnArityError,
  type BodyExecution,
  type ExecuteBodyDeps,
} from "../runtime/statement-executor";
import { extractTrailingTurnText } from "../runtime/conversation-drive";
import {
  extractPromptModeQueryResult,
  mapPromptModeSyncThrow,
} from "../runtime/prompt-transport-mapping";
import {
  enforceInvokeParamsDepth,
  enforceInvokeReturnDepth,
} from "../runtime/invoke-ceiling-depth";
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
import { enforceCodeToolArgDepth, enforceModelToolArgDepth } from "../runtime/tool-call";
import type { CommittedSideEffect } from "../runtime/no-rollback";
import type { InvokeChild } from "../runtime/invoke-cancellation";
import { runInvokeChild } from "../runtime/invoke-cancellation";
import type { InvokeInfraError, TransportError } from "../runtime/query-error";
import {
  newInvokeChain,
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
  brandSchemaValue,
  isEnumValue,
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
  Expr,
  FnDecl,
  InvokeExpr,
  ThetaBody,
  QueryExpr,
  SchemaDecl,
  Stmt,
} from "../parser/theta-document";
import { parseExpressionSource } from "../parser/theta-document";
import { renderSystemPrompt } from "../parser/system-interpolation";
import { lowerQueryResponseSchema } from "../runtime/query-schema-lowering";
import type { LoweredSchema } from "../seams/schema-validator";
import type { TypedQuerySchemaValidation } from "../runtime/query-tool-loop";
import {
  buildTypedQueryValidation,
  parseStructuredPayload,
  payloadForRespond,
} from "../runtime/typed-query-validation";
import { evaluateIndexAccess, evaluateMemberAccess, HostFatal } from "../runtime/runtime-panics";
import { routeThetaCallableSetupThrow } from "../runtime/tool-call-off-surface";
import { deriveToolLabel } from "../runtime/tool-registration";
import {
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
} from "../binder/binder-envelope";
import { fillDefaultsAndRevalidate, type DefaultedField } from "../binder/defaulting";
import { matchAvailableModel } from "../binder/binder-model";
import {
  renderBinderSystemNote,
  type BinderAttemptOutcome,
  type BinderFailureSurface,
} from "../binder/retry-taxonomy";
import { classifyProviderResponse } from "../binder/provider-error-mapping";
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
import type { QueryError } from "../runtime/query-error";
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
  execute(
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
   * SUBAG-2: lower a subagent theta's callable-set Pi-tool name to its full pi
   * `ToolDefinition`, so `spawnSubagentConversation` can install the theta's
   * `tools:` set as `customTools` on the spawned `AgentSession` (subagent.md
   * rules 1–3). Constructed at the composition root over the same built-in
   * tool factories `resolvePiTool` uses. Absent on non-production harnesses, in
   * which case the subagent spawns with no tools (the model cannot make a tool
   * call — the pre-fix behaviour).
   */
  readonly resolvePiToolDefinition?: (
    name: string,
    cwd: string,
  ) => ToolDefinition | undefined;
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
   * INV-5 (invocation.md §Resolution, INV-1 seam): the `FileSystem.realpath`
   * seam and the union of currently-active discovery roots, used by the runtime
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
 * PIC-40. Raised (a specific type, never a broad throw) when a subagent-mode
 * theta is dispatched with no resolvable model: frontmatter `model:` is absent
 * and the inherited `ctx.model` is `undefined`, so `createAgentSession` cannot
 * be called. The shipped acceptance host pins `--model`, so this branch is not
 * reached there; it keeps the no-model gap explicit rather than spawning a
 * modelless session.
 */
class SubagentModelUnresolvedError extends Error {}

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

/** The basename of a `.theta`-callable path, minus its `.theta` extension. */
function thetaCallableName(path: string): string {
  const base = path.slice(path.replace(/\\/g, "/").lastIndexOf("/") + 1);
  return base.endsWith(".theta") ? base.slice(0, -".theta".length) : base;
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

  constructor(input: ProductionProducerInput) {
    this.#input = input;
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
    // by the same exact-match rule the load-time resolution used; a registered
    // non-bypass theta always carries a resolvable binder model (an unresolvable
    // one failed to load), so `model === undefined` is a defensive guard only.
    const binderModelRef = binderInput.theta.binderModel;
    const model =
      binderModelRef !== undefined
        ? matchAvailableModel(binderModelRef, this.#input.modelRegistry.getAvailable())
        : undefined;
    if (model === undefined) {
      // Defensive (unreachable for a registered non-bypass theta): surface the
      // malformed failure note rather than crash the dispatch, and do not run
      // the body.
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
    const prompt = renderBinderTurnPrompt({
      slashName: binderInput.theta.slashName,
      args: binderInput.args,
      paramsSchema: params.loweredSchema,
      defaultedFields: params.defaultedFields,
      envelopeSchema,
      ...(sessionContext.kind === "block" ? { sessionContext: sessionContext.body } : {}),
    });
    // OFF-session completion via pi-ai `complete()` against the resolved binder
    // model (never `driveStreamedUserTurn`, never `ctx.model`): the reply text
    // is parsed as the envelope but is NEVER sent to the user session. Auth is
    // resolved off the model registry and passed as request options — the
    // out-of-band `complete()` free function does not inherit the session's
    // resolved credentials, so an un-authed call would return an empty
    // error-stop reply.
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
    // overflow classifies as `transport` (one retry), an unparseable envelope as
    // `malformed` (one retry); `ok`/`needs_info`/`ambiguous` are terminal. The
    // winning `ok` attempt's parsed args are captured for the defaults-merge.
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
            const classified = await this.#classifyBinderAttempt(model, prompt, attemptSignal);
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
    const mergedArgs = await this.#mergeDeclaredDefaults(binderInput.theta, params, binderArgs);
    // §"Echo policy" (BND-1): on a successful bind the runtime appends the
    // one-line success echo note (`Running /<name>: …`) on the theta-system-note
    // channel immediately before the theta starts, UNLESS `bind_echo: false`. The
    // bypass arms auto-suppress the echo independently and never reach here.
    this.#emitBinderEchoNote(binderInput.theta, params, binderArgs, mergedArgs);
    return { bound: true, args: mergedArgs };
  }

  /**
   * §"Echo policy" success echo (BND-1): render and emit the one-line
   * `Running /<name>: <formatted-args>` system note on the theta-system-note
   * channel — the SAME `pi.sendMessage` delivery the SLSH-1 overflow / SNOTE-1
   * notes use — unless `bind_echo:` is `false`. Each top-level `params:` field
   * renders in declaration order; a field that took its declared default this
   * run (absent from the binder-supplied `args`) is tagged `(default)`. The echo
   * is rendered off the resolved runtime values (value-driven `EchoType`
   * derivation, disambiguating `integer` vs `number` from the lowered schema)
   * and passed through the shared 120-code-point cap.
   */
  #emitBinderEchoNote(
    theta: ConversationBindInput["theta"],
    params: NonNullable<ConversationBindInput["theta"]["frontmatter"]["params"]>,
    binderArgs: Readonly<Record<string, unknown>>,
    mergedArgs: Readonly<Record<string, unknown>>,
  ): void {
    if (theta.frontmatter.bindEcho === false) {
      return;
    }
    const defaulted = new Set(params.defaultedFields);
    const properties =
      params.loweredSchema !== undefined
        ? ((params.loweredSchema as Record<string, unknown>)["properties"] as
            | Record<string, unknown>
            | undefined)
        : undefined;
    const echoParams: EchoParam[] = params.fields.map((field) => {
      const value = (mergedArgs[field.wireName] ?? null) as ThetaValue;
      // The `(default)` tag fires only when the field took its declared default
      // this run (fill-if-absent): a wire name ABSENT from the binder-supplied
      // args and declared defaulted.
      const tookDefault =
        defaulted.has(field.wireName) &&
        !Object.prototype.hasOwnProperty.call(binderArgs, field.wireName);
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
   * budget driver consumes. A synchronous/async throw from the provider call, or
   * a reply carrying `stopReason:"error"`/`"length"`/overflow, classifies as
   * `transport` (folding ContextOverflow into transport per the taxonomy) with
   * `provider = Model<Api>.api`; a clean reply is parsed as the envelope and
   * routed `ok`/`needs_info`/`ambiguous`/`malformed`. The `ok` arm's parsed args
   * are returned for the defaults-merge. `temperature: 0` is set (spec
   * Determinism); the FNV-1a seed / forced-tool structured output are NOT used
   * (the pinned forced-tool mechanism is unrealizable against the available
   * providers — a top-level `anyOf` envelope is not a valid tool `input_schema`,
   * yielding empty tool args — so the binder stays a free-text envelope call).
   */
  async #classifyBinderAttempt(
    model: Model<Api>,
    prompt: string,
    signal: AbortSignal,
  ): Promise<{ readonly outcome: BinderAttemptOutcome; readonly okArgs?: Record<string, unknown> }> {
    const provider = String(model.api);
    let reply: AssistantMessage;
    try {
      reply = await this.#completeBinderReply(model, prompt, signal);
    } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — a provider transport throw → HC3-a transport class
      // A cancellation abort is surfaced by the caller's before/after-attempt
      // signal checks, not misclassified as a retryable transport failure.
      if (signal.aborted) {
        return { outcome: { kind: "transport", provider, message: "cancelled" } };
      }
      return { outcome: { kind: "transport", provider, message: coerceUnderlyingString(thrown) } };
    }
    const stopReason = (reply as { readonly stopReason?: string }).stopReason ?? "";
    // A non-turn-boundary stop reason (provider error / output-limit overflow)
    // classifies through the shared provider-error taxonomy; ContextOverflow
    // folds into the transport class before the retry driver (HC3-a).
    if (stopReason === "error" || stopReason === "length" || stopReason === "content_filter") {
      const classified = classifyProviderResponse({
        api: provider,
        httpStatus: 200,
        stopReason,
        ...(typeof (reply as { errorMessage?: string }).errorMessage === "string"
          ? { errorMessage: (reply as { errorMessage?: string }).errorMessage }
          : {}),
      });
      const message =
        classified.kind === "transport" && classified.message !== ""
          ? classified.message
          : "provider transport failure";
      return { outcome: { kind: "transport", provider, message } };
    }
    // Clean reply: parse and route the free-text envelope.
    const routing = await parseBinderEnvelope(assistantText(reply));
    if (routing.kind === "ok") {
      const okArgs = await parseOkEnvelopeArgs(assistantText(reply));
      return { outcome: { kind: "ok" }, okArgs };
    }
    return { outcome: routing };
  }

  /**
   * Issue ONE OFF-session binder `complete()` against the resolved binder
   * `Model<Api>` and return the raw reply. Resolves the model's request auth
   * (apiKey / headers) off the injected model registry and passes it as request
   * options; the fixed `context.messages` is the rendered prompt as a single
   * `user` message, at `temperature: 0` (Determinism). No user-session turn, no
   * transcript card — the reply is runtime-internal (BND-3).
   */
  async #completeBinderReply(
    model: Model<Api>,
    prompt: string,
    signal: AbortSignal,
  ): Promise<AssistantMessage> {
    const auth = await this.#input.modelRegistry.getApiKeyAndHeaders(model);
    const options: Record<string, unknown> = {};
    // CANCEL-4 in-flight forwarding: thread `thetaAbort.signal` into the binder
    // provider invocation as `options.signal` (pi-ai `StreamOptions.signal`), so
    // an abort observed during the call propagates to the provider's abort path.
    options["signal"] = signal;
    // Determinism (determinism-cancellation-failure.md §Determinism): the binder
    // call is `temperature: 0` (the FNV-1a seed is omitted here — omitted for the
    // anthropic-messages / amazon-bedrock transports the binder guidance steers
    // toward, and the forced-tool structured-output call it belongs to is not
    // realizable against the available providers).
    options["temperature"] = 0;
    if (auth.ok) {
      if (auth.apiKey !== undefined) {
        options["apiKey"] = auth.apiKey;
      }
      if (auth.headers !== undefined) {
        options["headers"] = auth.headers;
      }
    }
    return complete(
      model,
      { messages: [{ role: "user", content: prompt, timestamp: 0 }] },
      options,
    );
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
   * default); a wire name ABSENT takes its declared default.
   *
   * The declared default VALUES are not carried on the parsed `ParsedParams`
   * (it retains only the defaulted wire names, not their literals), so they are
   * recovered here from the theta's own source: the `params:` field scalar is
   * re-read via the `FileSystem` seam, its `= <literal>` default RHS is split
   * off, and the literal is parsed + evaluated through the same pure evaluator
   * the body uses. Recovery is best-effort — a theta with no on-disk `sourcePath`
   * (an in-memory fixture), an unreadable file, or a default that does not parse
   * simply leaves that field unfilled (the prior behaviour for it), never throws.
   */
  async #mergeDeclaredDefaults(
    theta: ConversationBindInput["theta"],
    params: NonNullable<ConversationBindInput["theta"]["frontmatter"]["params"]>,
    binderArgs: Readonly<Record<string, unknown>>,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (params.defaultedFields.length === 0 || params.loweredSchema === undefined) {
      return binderArgs;
    }
    const defaults = await this.#recoverDeclaredDefaults(theta, params.defaultedFields);
    if (defaults.length === 0) {
      return binderArgs;
    }
    // Post-default-merge AJV validation runs against the MERGED args (§Defaulting).
    // Its verdict routes, on failure, to the AJV-on-`args` retry class owned
    // elsewhere in the runtime; this leaf owns only the fill-if-absent merge and
    // invoking the named validation hook, so the merged args are returned
    // regardless of the verdict (the body-run vs short-circuit routing is not
    // this leaf's to change).
    const validator = this.#input.root.schemaValidator.compile(params.loweredSchema);
    const result = fillDefaultsAndRevalidate({ binderArgs, defaults, validator });
    return result.args;
  }

  /**
   * Recover the declared default literal VALUE for each defaulted wire name from
   * the theta's source file. The parsed `ParsedParams` drops the default literals
   * (retaining only the wire names), so this re-reads the `.theta`, extracts the
   * frontmatter YAML, reads each `params:` field's scalar, splits its `= <literal>`
   * default RHS, and parses + evaluates the literal with the body's pure evaluator
   * (so an enum / schema-literal default resolves against the body's declarations).
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
    const env = buildBoundEnvironment(theta.body, undefined, theta.imports);
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
      defaults.push({ wireName, defaultValue: evaluatePureExpression(parsed, env) });
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
   * (em-dash U+2014). `chain: []` renders the correct leaf row for every
   * reachable kind (including an `invoke_callee` wrapper, which the renderer
   * walks to its leaf); the SLSH-5 chain suffix is a deferred refinement — no
   * readily-usable invoke provenance reaches this boundary. Routed through the
   * same `pi.sendMessage` `theta-system-note` delivery as the SLSH-1 overflow
   * note.
   */
  emitTopLevelErrNote(thetaName: string, error: QueryError): void {
    this.#input.pi.sendMessage(
      {
        customType: SYSTEM_NOTE_CHANNEL,
        content: renderTopLevelErrNote({ thetaName, error, chain: [] }),
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

  bindPromptConversation(bindInput: ConversationBindInput): ConversationBinding {
    const { pi, root } = this.#input;
    const { theta, ctx } = bindInput;
    // INV-4 / ceiling #1: a top-level dispatch starts a fresh chain at depth 0;
    // a nested invoke carries the parent's pushed chain in `bindInput.chain`.
    const chain = bindInput.chain ?? newInvokeChain();

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
      classifyCall: (expr) => this.#classifyCall(theta, expr),
      resolveCallAsInvoke: (expr, env) => this.#resolveCallAsInvoke(theta, expr, env, ctx, chain, signal, "prompt"),
    };

    const executeDeps: ExecuteBodyDeps = {
      env: buildBoundEnvironment(theta.body, bindInput.paramBindings, theta.imports),
      host: createEffectfulStatementHost(hostDeps),
      checkpoint: root.checkpoint,
      signal,
      mutator: new NoopConversationMutator(),
      mode: "prompt",
      file: theta.slashName,
    };

    // Decision 6 / Increment B1 (active-invocation-registry.md §"Active
    // invocation registry"): register this invocation in the shared registry
    // the factory's `session_shutdown` teardown reads, so sub-step 2 (cancel
    // in-flight) can abort THIS `thetaAbort` and sub-step 3 (await dispose) can
    // await its `disposeBarrier`. The per-invocation `thetaAbort` above is reused
    // verbatim (never a fresh controller). `invocationId` is minted through the
    // PIC-20 `IdSource` seam and `theta` is the canonical slash name (no leading
    // `/`). The entry is added LAST — this method is synchronous and cannot
    // throw between here and the return — and its removal is deferred to
    // `finishInvocation`, which the DRIVE seam calls in a `finally` AFTER the
    // body runs, so the entry SPANS the real in-flight window. Prompt mode has
    // no `AgentSession.dispose()` analogue, so the barrier settles immediately
    // at finish.
    const activeInvocations = this.#input.activeInvocations;
    let settleDispose: () => void = (): void => {};
    const disposeBarrier = new Promise<void>((resolve) => {
      settleDispose = resolve;
    });
    const entry: ActiveInvocationEntry = {
      thetaAbort,
      disposeBarrier,
      shutdownReason: undefined,
      theta: theta.slashName,
      invocationId: root.idSource.newInvocationId(),
    };
    activeInvocations?.add(entry);
    // Publish the invocation-scoped forwarding sources onto the shared sink LAST
    // (this method is synchronous and cannot throw between here and the return),
    // so a normal settle removes them via `finishInvocation` and only a
    // still-in-flight-at-shutdown invocation leaves them for sub-step 5.
    const detachForwarding = this.#trackForwardingSources(forwardingSources);
    let finished = false;
    // Idempotent: the DRIVE `finally` calls this once; a defensive caller may
    // call again with no effect. A NORMAL settle detaches the forwarding
    // listeners and splices them off the shared sink (no accumulation).
    const finishInvocation = (): void => {
      if (finished) return;
      finished = true;
      detachForwarding();
      settleDispose();
      activeInvocations?.remove(entry);
    };

    return {
      drivenAgainst: "prompt-user-session",
      executeDeps,
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

  async spawnSubagentConversation(
    bindInput: ConversationBindInput,
  ): Promise<ConversationBinding> {
    const { root, modelRegistry } = this.#input;
    const { theta, ctx } = bindInput;
    // INV-4 / ceiling #1: carry the parent's pushed chain into the spawned
    // subagent session so the per-chain depth counter crosses the subagent
    // boundary unchanged; a top-level subagent dispatch starts at depth 0.
    const chain = bindInput.chain ?? newInvokeChain();

    // PIC-40 pre-spawn model guard: the subagent's resolved model is the theta's
    // frontmatter `model:` resolved into the inherited session model — here the
    // inherited `ctx.model`. Refuse the spawn (specific type, no `createAgentSession`
    // call) when it is `undefined` rather than spawning a modelless session.
    const model = ctx.model;
    if (model === undefined) {
      throw new SubagentModelUnresolvedError(
        "subagent invocation has no resolved model: frontmatter 'model:' is absent " +
          "and the inherited session model is undefined",
      );
    }

    // `thetaAbort` — the per-invocation cancel controller (cancellation.md §Signal
    // source). The mid-stream cancel fires through it and the one-shot PIC-41
    // listener forwards it into the spawned session's `abort()`; it is also the
    // single `signal` the interpreter's checkpoints gate on.
    //
    // CANCEL-5 (cancellation.md §`invoke(...)` entry): a child `invoke` binding
    // (carrying `parentSignal`) constructs its `thetaAbort` as a DERIVED
    // controller — downward-only: the child aborts when the parent aborts
    // (carrying the parent's reason, CNCL-4), never the reverse. A top-level
    // subagent dispatch (or an in-memory harness) with no parent gets a fresh
    // controller (shared with the dispatch entry when `bindInput.thetaAbort` is
    // present). Both paths honour a per-invocation abort the same way.
    // Decision 6 / Increment B2: collect the INVOCATION-SCOPED forwarding
    // listeners for sub-step 5. The subagent bind attaches NO invocation-scoped
    // `ctx.signal` listener (its `ctx.signal` forward is the drive-seam one in
    // `composeThetaFixture.run`, a `{once:true}` listener on a per-turn-transient
    // `ctx.signal` that self-cleans — same rationale as the per-turn forwards).
    // The one invocation-scoped source a subagent contributes is the
    // derived-child parent-invoke listener (nested invoke only). The
    // `attachSubagentAbortForwarding` forward is EXCLUDED here: it forwards
    // `thetaAbort` INTO the spawned session (opposite direction to a
    // `ForwardingSignalSource` inbound source) and is already detached in
    // `surface()`.
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

    // SUBAG-1: render the theta's `system:` frontmatter into the spawned
    // conversation's system prompt (subagent.md §"Subagent state-isolation
    // matrix": `system:` is inherited from frontmatter, with `${param}`
    // interpolation resolved at conversation-creation time). The load-time
    // `checkSystemInterpolation` already rejected a malformed `system:`, so the
    // render is expected to succeed here; on the unexpected `!ok` path fall back
    // to no system prompt rather than crashing the spawn.
    let systemPrompt: string | undefined;
    const systemTemplate = theta.frontmatter.system;
    if (systemTemplate !== undefined) {
      const params: Record<string, ThetaValue> = {};
      if (bindInput.paramBindings !== undefined) {
        for (const [name, value] of bindInput.paramBindings) {
          params[name] = value;
        }
      }
      const rendered = renderSystemPrompt({ template: systemTemplate, params });
      if (rendered.ok) {
        systemPrompt = rendered.text;
      }
    }

    // SUBAG-2: lower the theta's callable set to the spawned session's tools.
    // `customTools` carries the full pi `ToolDefinition` for each underlying
    // Pi-tool name in the callable set, and `tools` is the explicit allowlist of
    // those same names (subagent.md rules 1–3; the allowlist enforces the
    // "ambient Pi tools NOT inherited" invariant).
    // SUBAG-2 (WIRED): both Pi-tool AND `.theta`-callable entries are lowered.
    const customTools: ToolDefinition[] = [];
    for (const toolName of callableSetPiToolNames(theta)) {
      const definition = this.#input.resolvePiToolDefinition?.(toolName, ctx.cwd);
      if (definition !== undefined) {
        customTools.push(definition);
      }
    }

    // SUBAG-2 model-callable `.theta` (tool-calls.md: the callable set is SHARED
    // between the model-driven and code-driven paths — the model sees the same
    // `.theta` callables it can call from code). The frozen callable-set entry
    // holds no parsed callee in production (`callee: undefined`), so resolve
    // each `.theta` callee here via the SAME `parseCallee` seam `#driveCallee`
    // uses, capturing the callee's declared `params:` order (for the model
    // object-arg → positional mapping), its lowered `params:` schema (the
    // model-facing tool `parameters`), and its `description`. A callee that no
    // longer resolves (or a harness without `parseCallee`) simply omits the
    // model-facing tool — the code-driven `<name>(args)` path re-resolves the
    // callee independently, so it is never widened here.
    const thetaCallables: ResolvedThetaCallable[] = [];
    for (const { presentedName, calleePath } of callableSetThetaEntries(theta)) {
      const callee = await this.#input.parseCallee?.(theta.sourcePath, calleePath);
      if (callee === undefined) {
        continue;
      }
      const params = callee.frontmatter.params;
      thetaCallables.push({
        presentedName,
        calleePath,
        paramOrder: params?.fields.map((field) => field.wireName) ?? [],
        loweredSchema: params?.loweredSchema,
        description: callee.frontmatter.description ?? "",
      });
    }

    // SUBAG-2 / tool-calls.md §Concurrency: the RE-ENTRANT `.theta`-callable model
    // adapter, shared by BOTH the theta-owned `complete()` loop (via
    // `executeSubagentTool`) and the SDK `customTools` surface below. It maps the
    // model's object arguments to positional `argValues` in the callee's declared
    // `params:` order, then drives the callee through the SAME invoke machinery
    // (`#buildInvokeChild` → `runInvokeChild` → `#driveCallee`) a code-driven
    // `.theta` call (`#resolveCallAsInvoke`) / `invoke(...)` uses — so a
    // model-driven `.theta` call inherits EXACTLY the same guarantees as a
    // code-driven invoke. No shared mutable closure state: each call re-enters
    // the machinery, which spawns its own `AgentSession`, so two concurrent
    // calls execute as independent invocations on the event loop.
    const driveThetaCallableModelCall = (
      callable: ResolvedThetaCallable,
      args: Record<string, unknown>,
      toolSignal: AbortSignal,
    ): Promise<LoweredThetaCallableResult> =>
      lowerModelDrivenThetaCall(
        args,
        {
          paramOrder: callable.paramOrder,
          // Gap-1: drive the callee through the SAME `runInvokeChild` invoke
          // trampoline the CODE-driven `.theta` path uses
          // (effectful-statement-host.ts:242/309), NOT `#buildInvokeChild(...)
          // .drive()` raw. `runInvokeChild` fires the pre-dispatch
          // `checkpoint.before("invoke", site)` + aborted-skip, then drives the
          // child and CONVERTS a callee-subtree throw into a VALUE at the invoke
          // boundary: a `ThetaPanic` → `Err(InvokeInfraError{cause:"panic"})`,
          // any other non-`HostFatal` interpreter throw →
          // `Err(InvokeInfraError{cause:"internal_error"})`, a `HostFatal`
          // re-raised (NOCEIL-3). `.drive()` alone only converts the ceiling-#1
          // depth-overflow panic — every OTHER callee-BODY panic (non-exhaustive
          // `match`, index / member / null access) would unwind as a raw throw
          // and be mis-framed by `onSetupThrow` as a pre-eval dispatch-setup
          // failure. Routing through `runInvokeChild` means a callee-body panic
          // lowers as a plain `isError` result (from the returned `Err`) with NO
          // operator note; only a GENUINE pre-dispatch dispatch-setup throw
          // (raised before the body runs) still rejects and reaches
          // `onSetupThrow`. `#buildInvokeChild(...)` also pushes the countable
          // INVOKE-DEPTH frame (ceiling #1 / INV-4) and attaches the CANCEL-3
          // swallowing handler, THEN `#driveCallee` runs the containment
          // re-check, ceiling-#4 `params` depth, CANCEL propagation (the
          // derived-child `thetaAbort`), the ActiveInvocationRegistry entry (B1),
          // the PIC-9 teardown, and the FN-5 final-value surface — identical to
          // the code-driven invoke.
          driveCallee: async (argValues, callSignal): Promise<ResultValue> => {
            const child = this.#buildInvokeChild(
              theta,
              callable.calleePath,
              argValues,
              ctx,
              chain,
              /*returnSchema*/ null,
              callSignal,
              /*callerMode*/ "subagent",
            );
            const outcome = await runInvokeChild(
              root.checkpoint,
              callSignal,
              { file: theta.sourcePath ?? theta.slashName, line: 0, column: 0 },
              child,
            );
            // A pre-dispatch cancel observed at the `invoke` checkpoint surfaces
            // as `Err(CancelledError)` — the same terminal the code-driven
            // `runToolCallEffect` maps `cancelled` to; the body panic / infra
            // conversions are already VALUES inside `outcome.result`.
            return outcome.kind === "cancelled"
              ? makeErr(makeCancelledError() as unknown as ThetaValue)
              : outcome.result;
          },
          // tool-calls.md:30 (`.theta`-callable adapter pre-eval setup-throw row):
          // reached ONLY by a genuine pre-dispatch dispatch-setup throw (a
          // callee-body panic is already a value from `runInvokeChild`). Such a
          // throw becomes a clean `isError` result carrying the BARE
          // callable-set name + one `theta/runtime/internal-error` diagnostic +
          // one `theta-system-note`.
          onSetupThrow: (thrown) =>
            this.#emitThetaCallableSetupThrow(thrown, callable.presentedName, theta),
        },
        toolSignal,
      );

    // SUBAG-2 (tool-registration-lifetime.md §"Subagent mode"): the SDK-visible
    // surface must match the theta-owned `complete()` loop surface, so each
    // `.theta` callable is ALSO installed as a `defineTool` `customTool` (and
    // allowlisted in `tools` below). Its `execute` is the SAME re-entrant adapter
    // — no shared mutable closure state across concurrent calls. The
    // `ToolDefinition` shape is mode-independent
    // (extension-bootstrap-and-per-theta.md §Per-theta registration): `label` is
    // the callee basename with hyphens preserved + leading-cap; `parameters` is
    // the lowered schema wrapped `Type.Unsafe<unknown>`; `description` is the
    // callee frontmatter description.
    for (const callable of thetaCallables) {
      customTools.push(
        defineTool({
          name: callable.presentedName,
          label: deriveToolLabel({
            kind: "theta-file",
            basename: thetaCallableName(callable.calleePath),
          }),
          description: callable.description,
          parameters: Type.Unsafe<unknown>(callable.loweredSchema ?? {}),
          execute: async (
            _toolCallId: string,
            params: unknown,
            execSignal: AbortSignal | undefined,
          ): Promise<AgentToolResult<unknown>> => {
            const lowered = await driveThetaCallableModelCall(
              callable,
              (params ?? {}) as Record<string, unknown>,
              execSignal ?? thetaAbort.signal,
            );
            // `AgentToolResult` carries no `isError` field; the error framing is
            // conveyed as the content text. The theta-owned `complete()` loop
            // (the actual subagent query driver) is the surface that sets
            // `ToolResultMessage.isError` — this SDK surface exists for
            // registration-lifetime parity, not to drive the query.
            return { content: [{ type: "text", text: lowered.text }], details: undefined };
          },
        }),
      );
    }

    const toolNames = customTools.map((definition) => definition.name);

    // STAGE A (STL-2 / ceiling #2): the theta OWNS the subagent's model tool
    // loop. The model-facing tool schemas (SUBAG-2 callable set) conveyed on
    // every `complete()` turn are the theta's frozen callable-set Pi-tool
    // entries, presented under their post-rename callable-set name (the name
    // the model calls and `#resolvePiToolForTheta` resolves), with the
    // description/parameters taken from the SUBAG-2 `customTools` lowering
    // (matched by the underlying Pi-tool name). A theta with no snapshot (an
    // in-memory fixture) presents no tool schemas — the model cannot make a
    // tool call, mirroring the pre-`tools:` behaviour.
    const toolSchemas: Tool[] = [];
    const callableSet = theta.callableSet;
    if (callableSet !== undefined) {
      for (const [presentedName, entry] of callableSet.entries) {
        if (entry.kind !== "pi-tool") {
          continue;
        }
        const underlying = (entry.toolDefinition as PiToolDispatch).toolName;
        const definition = customTools.find((tool) => tool.name === underlying);
        if (definition === undefined) {
          continue;
        }
        toolSchemas.push({
          name: presentedName,
          description: definition.description,
          parameters: definition.parameters,
        });
      }
    }
    // SUBAG-2: the model ALSO sees the `.theta` callables (tool-calls.md: the
    // callable set is SHARED between the model-driven and code-driven paths).
    // Each presents under its callable-set name, with the callee's lowered
    // `params:` schema wrapped `Type.Unsafe<unknown>` and the callee's
    // frontmatter `description`, so the model can emit a `tool_use` block for it
    // exactly as `executeSubagentTool`'s `.theta` branch resolves it.
    for (const callable of thetaCallables) {
      toolSchemas.push({
        name: callable.presentedName,
        description: callable.description,
        parameters: Type.Unsafe<unknown>(callable.loweredSchema ?? {}),
      });
    }

    // STAGE A: execute ONE model tool call through the theta's callable set,
    // reusing the SAME `#resolvePiToolForTheta` / `execute` path the code-driven
    // `<name>(args)` calls use, and lower the outcome to the tool-result message
    // fed back on the next `complete()` turn. A clean resolve lowers to the
    // V14g filter/join text; an `execute()` throw lowers to the V14g execution
    // message on an `isError` result so the model observes the failure and the
    // loop continues (ceiling #4 model-driven row). A name outside the callable
    // set is an unavailable-tool `isError` result — ambient tools are never
    // inherited (frontmatter.md §`tools:`).
    const thetaCallableByName = new Map(
      thetaCallables.map((callable) => [callable.presentedName, callable] as const),
    );
    const executeSubagentTool = async (
      call: ToolCall,
      toolSignal: AbortSignal,
    ): Promise<ToolResultMessage> => {
      // A `.theta`-callable branch BEFORE the Pi-tool `#resolvePiToolForTheta`
      // path: a callable-set name bound to a `.theta` callee spawns a fresh
      // subagent invocation through the re-entrant `#driveCallee` adapter
      // (equivalent to `invoke<T>`), then lowers its `Result` to the fed-back
      // tool-result (Ok → text; Err → `isError`). A name outside `thetaCallables`
      // falls through to the Pi-tool lowering.
      const callable = thetaCallableByName.get(call.name);
      if (callable !== undefined) {
        const lowered = await driveThetaCallableModelCall(
          callable,
          call.arguments,
          toolSignal,
        );
        return subagentToolResult(call, lowered.text, lowered.isError);
      }
      return lowerModelDrivenToolCall(
        call,
        this.#resolvePiToolForTheta(theta, call.name),
        toolSignal,
      );
    };

    // STAGE A: the out-of-band `complete()` free function does NOT inherit the
    // session's request auth, so — exactly as the binder off-session path does —
    // resolve the model's `apiKey` / `headers` off the injected model registry
    // and pass them as request options. Resolved lazily (only when a query
    // actually issues a completion) and cached, so a `max_rounds: 0` query (no
    // provider turn) and a pre-dispatch cancel never touch the registry.
    let cachedAuthOptions: Record<string, unknown> | undefined;
    const resolveAuthOptions = async (): Promise<Record<string, unknown>> => {
      if (cachedAuthOptions !== undefined) {
        return cachedAuthOptions;
      }
      const options: Record<string, unknown> = {};
      const auth = await modelRegistry.getApiKeyAndHeaders(model);
      if (auth.ok) {
        if (auth.apiKey !== undefined) {
          options["apiKey"] = auth.apiKey;
        }
        if (auth.headers !== undefined) {
          options["headers"] = auth.headers;
        }
      }
      cachedAuthOptions = options;
      return options;
    };

    // STAGE A: issue ONE model completion via pi-ai `complete()` against the
    // resolved subagent model, seeding the completion context with the theta's
    // rendered `system:` prompt (SUBAG-1) and the theta's callable-set tool
    // schemas (SUBAG-2), and threading `thetaAbort.signal` (CANCEL-2/4). The
    // private conversation `messages` are owned by the query driver and
    // discarded with the invocation (subagent isolation). The provider Promise
    // carries the construction-site swallowing handler so a late rejection after
    // a cancellation checkpoint is absorbed (CANCEL-3).
    const runCompletion = async (
      messages: readonly Message[],
      completionSignal: AbortSignal,
    ): Promise<AssistantMessage> => {
      const authOptions = await resolveAuthOptions();
      return guardQueryProviderPromise(
        complete(
          model,
          {
            ...(systemPrompt !== undefined ? { systemPrompt } : {}),
            messages: [...messages],
            ...(toolSchemas.length > 0 ? { tools: [...toolSchemas] } : {}),
          },
          { ...authOptions, signal: completionSignal },
        ),
        signalGuard(completionSignal),
        noopSwallowChannels(),
      );
    };

    // PIC-23 spawn: an isolated in-memory `AgentSession`. A theta-suppressing
    // `DefaultResourceLoader` (no extensions/skills/prompts/themes/context files)
    // is used deliberately: it prevents the spawned session from re-loading this
    // very theta extension (which would recurse). The theta's `system:` reaches the
    // spawned session through `DefaultResourceLoaderOptions.systemPrompt` — a
    // direct SDK option that flows through `getSystemPrompt()` — so a custom
    // `ResourceLoader` adapter is not required for the `system:` channel.
    const agentDir = getAgentDir();
    const resourceLoader = new DefaultResourceLoader({
      cwd: ctx.cwd,
      agentDir,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd: ctx.cwd,
      agentDir,
      // pi-coding-agent 0.80.x renamed the model option from a `ModelRegistry`
      // facade to `modelRuntime: ModelRuntime` (core/sdk.d.ts). Extensions only
      // receive the sync `ModelRegistry` facade (ExtensionContext.modelRegistry),
      // whose underlying `ModelRuntime` is private with no public accessor, so we
      // cannot forward it. Omitting `modelRuntime` makes createAgentSession build
      // its default runtime from the shared `agentDir` (auth.json/models.json) —
      // the same config source the host registry reads — preserving model/auth
      // resolution for the explicit `model` passed below.
      model,
      // PIC-23 rule 2: an explicit allowlist restricts the active set to exactly
      // the theta's callable-set Pi-tool names (empty when the theta declares no
      // `tools:`), suppressing Pi's default built-ins (SUBAG-2).
      tools: toolNames,
      customTools,
      resourceLoader,
      // PIC-23 rule 6 / capability item 3: a fresh in-memory manager — the
      // spawned transcript is private and discarded on dispose.
      sessionManager: SessionManager.inMemory(ctx.cwd),
    });

    // PIC-41: forward `thetaAbort` into the spawned session via a one-shot
    // listener that calls `AgentSession.abort()`; PIC-9: an idempotent dispose
    // for the return-path teardown.
    const forwarding = attachSubagentAbortForwarding(thetaAbort, session);
    const dispose = makeIdempotentDispose(session);

    const signal = thetaAbort.signal;
    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint: root.checkpoint,
      signal,
      sink: noopSink(),
      file: theta.slashName,
      evaluatePure: (expr, env) => evaluatePureExpression(expr, env),
      resolveQuery: (expr, env) => {
        // STAGE A: a subagent `@`-query is driven as a THETA-OWNED round-by-round
        // tool loop through the existing `runUntypedQueryLoop` /
        // `runTypedQueryLoop` machinery, which enforces `tool_loop.max_rounds`
        // and surfaces `Err(tool_loop_exhausted)` on exhaustion (ceiling #2 /
        // FRNT-1). Each free-phase round is ONE `complete()` turn against the
        // resolved subagent model; the loop — not the SDK's opaque internal
        // agentic loop — decides whether to advance another round. A typed query
        // conveys the declared JSON shape on its forced-respond terminator and
        // parses the structured payload so a typed return crosses the subagent
        // boundary (FN-5); the `maxRounds: 0` boundary routes it straight to the
        // forced-respond terminator, mirroring the prompt-mode typed path.
        const typed = expr.schema !== null;
        // QRY-22: a typed subagent query drives respond-repair follow-ups as
        // fresh auth-aware `complete()` turns against the resolved model
        // (mirroring the prompt-mode off-session follow-up), never re-issuing the
        // original query. Threads `thetaAbort.signal` so an abort propagates.
        const driveFollowUp = (prompt: string): Promise<string> =>
          runCompletion(
            [{ role: "user", content: prompt, timestamp: 0 }],
            thetaAbort.signal,
          ).then(assistantText);
        const validation = typed
          ? this.#buildTypedValidation(expr, env, theta, driveFollowUp)
          : undefined;
        return {
          typed,
          // QRY-6: the bare rendered template body (schema conveyance excluded)
          // the empty-template short-circuit is evaluated over before any turn.
          renderedText: renderQueryText(expr, env),
          model: createSubagentQueryModel({
            queryText: renderTypedAwareQueryText(expr, env, validation?.lowered),
            runCompletion,
            executeTool: executeSubagentTool,
            thetaAbort,
            provider: String(model.provider),
          }),
          config: {
            maxRounds: typed ? 0 : theta.frontmatter.toolLoop?.maxRounds ?? 25,
            querySite: {
              file: theta.slashName,
              line: expr.range.start.line,
              column: expr.range.start.column,
            },
            thetaSlashName: theta.slashName,
            invocationId: root.idSource.newInvocationId(),
            occurredAt: root.clock.wallNow(),
          },
          ...(validation !== undefined
            ? { schemaValidation: validation.validation }
            : {}),
        };
      },
      resolveToolCall: (expr, env, evaluatedToolArgs) =>
        this.#resolveToolCall(theta, expr, env, signal, evaluatedToolArgs),
      // Cross-mode: the caller is subagent-mode, so a prompt-mode callee is
      // reached only via inline `invoke(...)` (prompt callees are load-rejected
      // from `tools:`); the prompt→prompt user-session attach never engages here.
      resolveInvoke: (expr, env) => this.#resolveInvoke(theta, expr, env, ctx, chain, signal, "subagent"),
      classifyCall: (expr) => this.#classifyCall(theta, expr),
      resolveCallAsInvoke: (expr, env) =>
        this.#resolveCallAsInvoke(theta, expr, env, ctx, chain, signal, "subagent"),
    };

    const executeDeps: ExecuteBodyDeps = {
      env: buildBoundEnvironment(theta.body, bindInput.paramBindings, theta.imports),
      host: createEffectfulStatementHost(hostDeps),
      checkpoint: root.checkpoint,
      signal,
      mutator: new NoopConversationMutator(),
      mode: "subagent",
      file: theta.slashName,
    };

    // Decision 6 / Increment B1 (active-invocation-registry.md §"Active
    // invocation registry"): register this invocation in the shared registry
    // the factory's `session_shutdown` teardown reads, so sub-step 2 (cancel
    // in-flight) can abort THIS `thetaAbort` and sub-step 3 (await dispose) can
    // await its `disposeBarrier`. The per-invocation `thetaAbort` above is reused
    // verbatim (never a fresh controller). Registered LAST — after the final
    // awaitable spawn step (`createAgentSession` / tool lowering) has already
    // resolved — so a spawn failure rejects BEFORE any entry is added and never
    // leaves a leak. Removal is deferred to `finishInvocation`, which the DRIVE
    // seam calls in a `finally` AFTER `executeBody` + `surface`; because the
    // DRIVE `finally` runs `teardown` (the spawned session's `dispose()`)
    // immediately BEFORE `finishInvocation`, settling the barrier in
    // `finishInvocation` correctly reflects post-dispose (sub-step 3 sees a
    // disposed session), and the entry SPANS the real in-flight window.
    const activeInvocations = this.#input.activeInvocations;
    let settleDispose: () => void = (): void => {};
    const disposeBarrier = new Promise<void>((resolve) => {
      settleDispose = resolve;
    });
    const entry: ActiveInvocationEntry = {
      thetaAbort,
      disposeBarrier,
      shutdownReason: undefined,
      theta: theta.slashName,
      invocationId: root.idSource.newInvocationId(),
    };
    activeInvocations?.add(entry);
    // Publish the invocation-scoped forwarding sources onto the shared sink LAST
    // — after the final awaitable spawn step already resolved, so a spawn
    // failure rejects BEFORE any source is pushed and never leaves a leak.
    const detachForwarding = this.#trackForwardingSources(forwardingSources);
    let finished = false;
    // Idempotent: the DRIVE `finally` calls this once; a defensive caller may
    // call again with no effect. A NORMAL settle detaches the forwarding
    // listeners and splices them off the shared sink (no accumulation).
    const finishInvocation = (): void => {
      if (finished) return;
      finished = true;
      detachForwarding();
      settleDispose();
      activeInvocations?.remove(entry);
    };

    // PIC-9 session teardown (SINGLE site). Detach the one-shot PIC-41 abort
    // listener, then dispose the spawned session. Moved OUT of `surface()` so it
    // runs on EVERY exit of the invocation drive — the DRIVE seam's `finally`
    // calls it BEFORE `finishInvocation` on the normal-return, returned-`Err`,
    // AND throw paths. Previously these ran only inside `surface()`, so a genuine
    // throw unwinding past `surface` (a `ToolReturnShapeDefectError` / `ThetaPanic`
    // defect) skipped them and leaked the provider connection + abort listener.
    // Idempotent: `dispose` is a `makeIdempotentDispose` latch and
    // `forwarding.detach` is a `removeEventListener` no-op on a second call, so a
    // defensive double-call from a caller is inert. The subagent's committed
    // turns are never mutated by a cancel (ERR-8 / ERR-12) — the executor's
    // cancel path routes through the inert `NoopConversationMutator`.
    let toreDown = false;
    const teardown = (): void => {
      if (toreDown) return;
      toreDown = true;
      forwarding.detach();
      try {
        dispose();
      } catch (disposeError: unknown) { // allow-broad-catch: theta/runtime/subagent-dispose-failure — pi-integration-contract/subagent.md
        // PIC-9: a `dispose()` throw is advisory only — because `teardown` runs
        // in the DRIVE `finally`, letting it propagate would MASK an in-flight
        // body defect (or promote an `Ok`/`Err` value to a throw), disturbing the
        // ERR-13 value path. The production producer threads no advisory-
        // diagnostic sink at this seam (a pre-existing gap tracked separately),
        // so the throw is swallowed rather than surfaced.
        void disposeError;
      }
    };

    return {
      drivenAgainst: "subagent-private-session",
      executeDeps,
      // FN-5: project the subagent body's terminal final value (shared with the
      // prompt→prompt invoke-attach path — a callee's final value crosses the
      // boundary the same way in either mode, invocation.md §Final-value). PIC-9
      // session teardown is deferred to `teardown`, which the DRIVE `finally`
      // runs on every exit path (including a throw past `surface`).
      surface: (execution: BodyExecution): ResultValue =>
        surfaceCalleeFinalValue(execution),
      teardown,
      finishInvocation,
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
    // QRY-22: a typed prompt-mode query drives respond-repair follow-ups as new
    // user turns against the SAME conversation (a user-visible turn when the
    // query streams, else off-session), extracting each follow-up's reply text.
    const driveFollowUp = (prompt: string): Promise<string> =>
      deps.userVisible
        ? driveStreamedUserTurn({
            pi: deps.pi,
            ctx: deps.ctx,
            clock: root.clock,
            queryText: prompt,
            activeTools,
          })
        : offSessionComplete(deps.ctx.model, prompt);
    const validation = typed
      ? this.#buildTypedValidation(expr, env, deps.theta, driveFollowUp)
      : undefined;
    // A typed query instructs the model to emit only a JSON object of the
    // declared (lowered) shape, so its user-visible turn streams the structured
    // value as its assistant text (shared with the subagent path via
    // `renderTypedAwareQueryText`; an off-session typed turn's reply parses the
    // same).
    const queryText = renderTypedAwareQueryText(expr, env, validation?.lowered);

    // STAGE B (ceiling #2): bound the native prompt-mode agentic tool loop to
    // the theta's `tool_loop.max_rounds` for the untyped free-phase turn. A typed
    // query's forced-respond turn is the exempt-routed terminator (FRNT-1) and
    // is NOT bounded. `max_rounds: 0` untyped is handled upstream by
    // `runUntypedQueryLoop` (it exhausts at query start before any turn), so the
    // governor is only consulted for `max_rounds >= 1` free-phase turns.
    const maxRounds = deps.theta.frontmatter.toolLoop?.maxRounds ?? 25;
    if (!typed && deps.userVisible) {
      this.#promptToolLoopGovernor.ensureRegistered(deps.pi);
    }
    const model = deps.userVisible
      ? new LivePromptQueryModel({
          pi: deps.pi,
          ctx: deps.ctx,
          clock: root.clock,
          queryText,
          readMessages: deps.readMessages,
          activeTools,
          thetaAbort: deps.thetaAbort,
          // Only the untyped free-phase native turn is bounded (typed → exempt).
          governor: typed ? undefined : this.#promptToolLoopGovernor,
          maxRounds,
          // PIC-50/51: the resolved provider for the synthesised `TransportError`
          // (mirrors the subagent path's `provider: String(model.provider)`).
          provider: String(deps.ctx.model?.provider ?? "unknown"),
        })
      : new OffSessionQueryModel({ model: deps.ctx.model, queryText, signal: deps.signal });

    // QRY-6: the bare rendered template body (typed-query schema conveyance
    // excluded) the empty-template short-circuit is evaluated over before any
    // provider turn is issued.
    const renderedText = renderQueryText(expr, env);

    const config: QueryToolLoopConfig = {
      // A typed query dispatches only the forced-respond terminator (no
      // free-phase provider call), so its `max_rounds`-final branch fires at
      // typed-query start; an untyped query drives one user-visible free-phase
      // turn under the theta's configured cap.
      maxRounds: typed ? 0 : deps.theta.frontmatter.toolLoop?.maxRounds ?? 25,
      querySite: {
        file: deps.theta.slashName,
        line: expr.range.start.line,
        column: expr.range.start.column,
      },
      thetaSlashName: deps.theta.slashName,
      invocationId: root.idSource.newInvocationId(),
      occurredAt: root.clock.wallNow(),
    };

    return {
      typed,
      renderedText,
      model,
      config,
      ...(validation !== undefined ? { schemaValidation: validation.validation } : {}),
    };
  }

  /**
   * Build the typed-query schema-validation collaborator (QRY-22) for a typed
   * `@`-query: lower the declared schema (a named `schema` decl resolved
   * whole-file, or an inline object/type annotation) to the validating JSON
   * Schema, and assemble the `TypedQuerySchemaValidation` over the root's AJV
   * `SchemaValidator` and the `V13d` respond-repair loop, threading the mode's
   * follow-up turn drive. Returns `undefined` when the query is untyped or the
   * declared schema does not lower.
   */
  #buildTypedValidation(
    expr: QueryExpr,
    env: LexicalEnvironment,
    theta: ConversationBindInput["theta"],
    driveFollowUp: (prompt: string) => Promise<string>,
  ): { readonly validation: TypedQuerySchemaValidation; readonly lowered: LoweredSchema } | undefined {
    if (expr.schema === null) {
      return undefined;
    }
    const lowered = lowerQueryResponseSchema(expr.schema, schemaDeclsOf(theta.body));
    if (lowered === undefined) {
      return undefined;
    }
    const validation = buildTypedQueryValidation({
      lowered,
      resolveShape: resolveDeclaredShape(expr, env),
      schemaValidator: this.#input.root.schemaValidator,
      attempts: theta.frontmatter.respondRepair?.attempts ?? 3,
      maxRounds: theta.frontmatter.toolLoop?.maxRounds ?? 25,
      driveFollowUp,
    });
    return { validation, lowered };
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
    const toolCallId = `theta-direct:${this.#input.root.idSource.newInvocationId()}`;
    return {
      toolName,
      committed: [],
      ...(argDepthBreach !== undefined
        ? { argDepthBreach: { result: argDepthBreach.result, error: argDepthBreach.error } }
        : {}),
      dispatch: (): Promise<AgentToolResultEnvelope> => {
        if (tool === undefined) {
          return Promise.reject(
            new UnknownHostToolError(`code-side call names no resolvable host tool '${toolName}'`),
          );
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
    // return; hard-ceilings ceiling #4).
    return this.#buildInvokeChild(
      theta,
      expr.path,
      argValues,
      ctx,
      chain,
      expr.returnSchema,
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
    // annotation, so there is no parse-time return-type site; the runtime AJV
    // net still applies at the query/typed boundary inside the callee.
    return this.#buildInvokeChild(theta, calleePath, argValues, ctx, chain, null, parentSignal, callerMode);
  }

  /** Build the `InvokeChild` whose `drive()` parses, spawns, and drives the callee. */
  #buildInvokeChild(
    theta: ConversationBindInput["theta"],
    calleePath: string,
    argValues: readonly ThetaValue[],
    ctx: ExtensionCommandContext,
    chain: InvokeChain,
    returnSchema: string | null,
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
            returnSchema,
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
    returnSchema: string | null,
    parentSignal: AbortSignal,
    callerMode: ThetaMode,
  ): Promise<ResultValue> {
    // INV-5 (invocation.md §Resolution, INV-1 seam): re-run the realpath +
    // discovery-root containment check at the moment the runtime opens the
    // callee, against the *currently* active roots. An escape fails closed with
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
        return this.#validateInvokeReturn(theta, calleePath, returnSchema, outcome.result);
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
      const execution = await executeBody(callee.body, binding.executeDeps);
      const result = binding.surface(execution);
      // INV-6 (invocation.md §Typed return; hard-ceilings ceiling #4): AJV-validate
      // the child's returned value against the `invoke<Schema>` annotation. A
      // mismatch (e.g. a `string` under `invoke<number>`) is
      // `Err(InvokeInfraError{cause:"return_validation"})`, aborting the parent.
      return this.#validateInvokeReturn(theta, calleePath, returnSchema, result);
    } finally {
      // PIC-9: run the (idempotent, non-throwing) session teardown BEFORE
      // `finishInvocation`, so the spawned session's `dispose()`/abort-listener
      // detach run on EVERY exit — including a genuine throw unwinding past
      // `surface` — and the `disposeBarrier` settles post-dispose.
      binding.teardown?.();
      binding.finishInvocation?.();
    }
  }

  /**
   * INV-5 runtime re-check: resolve the callee path against the caller's
   * directory and re-run the shared realpath + discovery-root containment check
   * against the currently-active roots. Returns the `load_failure`
   * `InvokeInfraError` on escape, or `undefined` when contained (or when the
   * production seams needed for the check are absent).
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
   * INV-6 runtime return-value validation: lower the `invoke<Schema>` annotation
   * against the caller theta's `schema` decls, compile it, and AJV-validate the
   * child's `Ok` payload. An untyped invoke (`returnSchema === null`) or an
   * `Err` result passes through unchanged; a validation failure is surfaced as
   * `Err(InvokeInfraError{cause:"return_validation"})`.
   */
  #validateInvokeReturn(
    theta: ConversationBindInput["theta"],
    calleePath: string,
    returnSchema: string | null,
    result: ResultValue,
  ): ResultValue {
    if (returnSchema === null || !result.ok) {
      return result;
    }
    // Ceiling #4 (ceilings-3-and-4.md#ceiling-4-table, the `invoke<T>` return-value
    // row; CIO-3): the theta-owned depth walk is the FIRST sub-check at the
    // return-value AJV boundary. A depth-6+ `Ok` payload surfaces to the invoke
    // parent as `Err(InvokeInfraError { cause: "return_validation" })` before AJV
    // is consulted.
    const depthBreach = enforceInvokeReturnDepth(calleePath, result.value as unknown);
    if (depthBreach !== undefined) {
      return depthBreach.result;
    }
    const lowered = lowerQueryResponseSchema(returnSchema, schemaDeclsOf(theta.body));
    if (lowered === undefined) {
      return result;
    }
    const validator = this.#input.root.schemaValidator.compile(lowered);
    const verdict = validator.validate(result.value as unknown);
    if (verdict.ok) {
      return result;
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
): readonly { readonly presentedName: string; readonly calleePath: string }[] {
  const set = theta.callableSet;
  if (set === undefined) {
    return [];
  }
  const entries: { readonly presentedName: string; readonly calleePath: string }[] = [];
  for (const [presentedName, entry] of set.entries) {
    if (entry.kind !== "theta") {
      continue;
    }
    // Gap-2: read the authoritative callee path the load-time resolver recorded
    // on the frozen entry (from the `tools:` `spec`), NOT a basename
    // re-derivation — so renamed / hyphenated callees are presented + dispatchable.
    entries.push({ presentedName, calleePath: entry.calleePath });
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
 * `frontmatter.tools` but no `callableSet`) falls back to the pre-Gap-2 basename
 * match against `frontmatter.tools` — the same snapshot-absent fallback pattern
 * `#resolvePiToolForTheta` uses. Production discovered thetas always carry a
 * (possibly empty) snapshot, so the fallback never serves a real theta and thus
 * cannot re-open the Gap-2 hole for production (renamed / hyphenated resolve
 * from the snapshot).
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
    (entry) => entry.endsWith(".theta") && thetaCallableName(entry) === calleeName,
  );
}

/**
 * Lower a code-side `<name>(args)` call's arguments to the JSON params object the
 * host tool's `execute(...)` receives (V14g). The call convention is a single
 * object-literal argument (`grep({ pattern, path })`): its fields are evaluated
 * against the environment and become the JSON params object. A call with no
 * object argument (or a non-object first argument) lowers to an empty params
 * object.
 */
function lowerToolCallParams(expr: CallExpr, env: LexicalEnvironment): Record<string, unknown> {
  const first = expr.args[0];
  if (first === undefined || first.kind !== "object") {
    return {};
  }
  const params: Record<string, unknown> = {};
  for (const field of first.fields) {
    params[field.name] = evaluatePureExpression(field.value, env) as unknown;
  }
  return params;
}

/**
 * Build the executor's root environment for a body, binding any invoke-supplied
 * positional args onto the callee's declared params as local slots (V15k final
 * value / arg binding) so the body can read them.
 */
function buildBoundEnvironment(
  body: ThetaBody,
  paramBindings: ReadonlyMap<string, ThetaValue> | undefined,
  imports: readonly MaterializedImport[] | undefined,
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
      });
    }
  }
  const env = buildEnvironment({
    body,
    enums,
    ...(imports !== undefined ? { imports } : {}),
  });
  if (paramBindings !== undefined) {
    for (const [name, value] of paramBindings) {
      env.defineLocal(name, value, false);
    }
  }
  return env;
}

/**
 * The live prompt-mode `QueryModelDriver` (`V12a`/`V9c`): it drives real
 * user-visible turns into the shared user session. `nextFreePhaseTurn` issues
 * the rendered query as a streamed user turn (`pi.sendUserMessage`) and awaits
 * `ctx.waitForIdle()` so the assistant streams into the transcript before the
 * interpreter resumes (SLSH-2), then extracts the trailing-turn assistant text
 * (PIC-53) as the plain-text terminating turn.
 */
class LivePromptQueryModel implements QueryModelDriver {
  readonly #pi: ExtensionAPI;
  readonly #ctx: ExtensionCommandContext;
  readonly #clock: Clock;
  readonly #queryText: string;
  readonly #readMessages: () => readonly Message[];
  readonly #activeTools: readonly string[];
  readonly #thetaAbort: AbortController;
  /** STAGE B: bounds the native tool loop; `undefined` for the exempt typed path. */
  readonly #governor: PromptToolLoopGovernor | undefined;
  readonly #maxRounds: number;
  /** PIC-50/51: the resolved provider for a synthesised `TransportError`. */
  readonly #provider: string;
  /** The exhaustion snapshot captured after the bounded free-phase turn settled. */
  #exhaustion: PromptToolLoopExhaustion | undefined = undefined;
  /** PIC-50: a `TransportError` synthesised from a `sendUserMessage` sync-throw. */
  #transportFromThrow: TransportError | undefined = undefined;

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
    /** STAGE B: the round-cap governor for the untyped free-phase turn (undefined = exempt/typed). */
    readonly governor: PromptToolLoopGovernor | undefined;
    /** STAGE B: the theta's `tool_loop.max_rounds` for this query. */
    readonly maxRounds: number;
    /** PIC-50/51: the resolved provider for a synthesised `TransportError`. */
    readonly provider: string;
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
  }

  async nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    if (round === 0) {
      // SLSH-2: issue the rendered query as one streamed user-visible turn and
      // await its completion so the assistant text is committed before the
      // interpreter resumes. pi runs its NATIVE agentic tool loop for this turn;
      // the governor (STAGE B) bounds it to `tool_loop.max_rounds` by blocking
      // any tool-use round beyond the cap (ceiling #2 / CIO-4).
      await this.#driveUserVisibleTurn(true);
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
      // plain-text paths are unchanged (cancellation is handled by the loop's
      // checkpoint, so only a `transport` verdict diverts here).
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
    // A schema-typed query's forced-respond terminator drives one user-visible
    // turn that streams the structured JSON as its assistant text, then parses
    // that text as the candidate structured payload. The typed-query response
    // schema is lowered from the declared annotation (`V5d`); the respond loop
    // depth-walks and validates the payload against it. A non-JSON reply is
    // surfaced as its raw text (never a thrown `JSON.parse`, never a bound
    // `null`) so the schema validation reports the mismatch.
    //
    // STAGE B: the forced-respond turn is the exempt-routed terminator (FRNT-1)
    // and is NOT bounded by `tool_loop.max_rounds` — driven UNBOUNDED.
    await this.#driveUserVisibleTurn(false);
    // PIC-50/51: a transport failure on the forced-respond turn (send sync-throw
    // or trailing `stopReason: "error"`) surfaces as the typed query's
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

  /**
   * Issue one streamed user-visible turn and await its full completion.
   *
   * `pi.sendUserMessage` is fire-and-forget: it schedules a fresh agent run but
   * returns before that run installs its active-run handle, and
   * `ctx.waitForIdle()` resolves immediately while no run is active. So the
   * driver first waits for the run to become observably non-idle (bounded, on
   * the injected `Clock` macrotask queue, so a turn that never starts cannot
   * hang), then awaits idle for the run's `agent_end`.
   */
  async #driveUserVisibleTurn(bound: boolean): Promise<void> {
    // STAGE B: when `bound`, arm the governor around the native turn so pi's
    // internal agentic tool loop is capped at `tool_loop.max_rounds`. The bound
    // is armed IMMEDIATELY before `sendUserMessage` and disarmed right after the
    // turn settles, so it never affects unrelated turns or other queries. The
    // exhaustion snapshot is read by `nextFreePhaseTurn` after this resolves.
    // A typed query's forced-respond turn passes `bound: false` (exempt).
    if (bound && this.#governor !== undefined) {
      this.#governor.begin(this.#maxRounds);
    }
    // `pi.sendUserMessage` is fire-and-forget: it schedules a fresh agent run
    // but returns before that run installs its active-run handle. `waitForIdle`
    // is not a reliable barrier here — in a session bound without
    // `commandContextActions` it is a no-op that resolves immediately — so the
    // driver observes the run through `ctx.isIdle()` (the real `!isStreaming`
    // flag): wait for the run to begin streaming, then for it to go idle again
    // (its `agent_end`). Both waits are bounded on the injected `Clock` so a run
    // that never starts (or one that starts and ends within a single tick)
    // cannot hang. The final `waitForIdle` is the real-host completion barrier
    // (PIC-18) when the session binds one.
    // PIC-17 active-set gating (QTL-4): install exactly the theta's callable set
    // — its underlying Pi-tool names — as the model's active tools for the query
    // turn and restore the ambient set in a `finally`. The model can then call a
    // declared `tools:` entry (and query-time tool loops / ceiling #2 become
    // reachable), while the host session's ambient tools stay deliberately not
    // inherited (a theta with no Pi tools in its set installs `[]`).
    const ambientTools = this.#pi.getActiveTools();
    this.#pi.setActiveTools([...this.#activeTools]);
    try {
      // PIC-50: `pi.sendUserMessage` is the only failure the call surface itself
      // can signal synchronously. Map such a throw to a `TransportError` (never
      // `theta/runtime/internal-error`, never a swallowed `Ok("")`) and return
      // without issuing a turn; the driver surfaces it as the query's transport
      // `Err`. The `finally` still restores the ambient active set.
      try {
        this.#pi.sendUserMessage(this.#queryText);
      } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — PIC-50 sendUserMessage sync-throw → TransportError
        this.#transportFromThrow = mapPromptModeSyncThrow(thrown, this.#provider);
        return;
      }
      await this.#pollWhile(() => this.#ctx.isIdle(), TURN_START_POLL_BOUND);
      // CANCEL-2 (cancellation.md §Forwarding into `thetaAbort`, slash-command
      // entry): the turn is now streaming, so `ctx.signal` is defined for THIS
      // turn (it is `undefined` at idle slash-entry). Re-forward it INTO
      // `thetaAbort` so an Esc during the `@`-query turn flips the single source
      // of truth every checkpoint gates on — the end-to-end "Esc during
      // `@`-query" path. Idempotent: the one-shot guard on `thetaAbort.abort()`
      // makes a repeat forward a no-op, and the listener is `{ once: true }` on
      // the per-turn transient `ctx.signal`, so no long-lived controller leaks.
      // Decision 6 / Increment B2: this PER-TURN forward's detach is deliberately
      // NOT collected onto the shared `forwardingSignals` sink — the listener sits
      // on a per-turn-transient `ctx.signal` that self-cleans (`{once:true}` and
      // GC'd with the turn), so collecting it would add per-turn push/splice
      // churn for no shutdown-lifetime benefit. Only the invocation-scoped bind
      // forwards are collected (sub-step 5 detaches those).
      forwardSlashCommandCancel(this.#thetaAbort, this.#ctx.signal);
      await this.#pollWhile(() => !this.#ctx.isIdle(), TURN_END_POLL_BOUND);
      await this.#ctx.waitForIdle();
      // CANCEL-2 (agent_end user-cancel trigger, CNCL-4 synthesised reason): a
      // turn that ended aborted without a forwarded source reason flips
      // `thetaAbort` with the synthesised `"theta cancelled by agent_end"` reason,
      // so the next checkpoint observes the cancellation.
      if (this.#ctx.signal?.aborted === true && !this.#thetaAbort.signal.aborted) {
        abortForAgentEnd(this.#thetaAbort);
      }
    } finally {
      this.#pi.setActiveTools(ambientTools);
      // STAGE B: disarm the governor and capture the exhaustion snapshot the
      // moment the turn settles, even on an error/abort path.
      if (bound && this.#governor !== undefined) {
        this.#exhaustion = this.#governor.end();
      }
    }
  }

  /** Release the event loop, polling `condition` on the `Clock` up to `bound` times. */
  async #pollWhile(condition: () => boolean, bound: number): Promise<void> {
    for (let i = 0; i < bound && condition(); i += 1) {
      await macrotask(this.#clock, POLL_INTERVAL_MS);
    }
  }
}

/** Poll cadence (ms) while waiting for a fire-and-forget user turn's stream lifecycle. */
const POLL_INTERVAL_MS = 10;

/** Bound on start-phase polls (≈ waiting for the run to begin streaming). */
const TURN_START_POLL_BOUND = 1000;

/** Bound on end-phase polls (≈ waiting for the streamed run to complete). */
const TURN_END_POLL_BOUND = 60000;

/** Release the event loop for one poll interval through the injected `Clock` seam. */
function macrotask(clock: Clock, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    clock.setTimeout(() => resolve(), ms);
  });
}

/**
 * An off-session `QueryModelDriver`: it resolves the query through pi-ai's
 * `complete()` free function (no user session turn, no transcript card), so a
 * chained follow-up query in a body does not stream into the transcript
 * alongside the dispatch's primary user-visible turn. The untyped path returns
 * the assistant text; the typed path parses it as the structured payload.
 */
class OffSessionQueryModel implements QueryModelDriver {
  readonly #model: Model<Api> | undefined;
  readonly #queryText: string;
  readonly #signal: AbortSignal;

  constructor(deps: {
    readonly model: Model<Api> | undefined;
    readonly queryText: string;
    /** CANCEL-3: the theta signal the provider-Promise swallowing guard reads at settlement. */
    readonly signal: AbortSignal;
  }) {
    this.#model = deps.model;
    this.#queryText = deps.queryText;
    this.#signal = deps.signal;
  }

  async nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    if (round === 0) {
      return { kind: "text", text: await this.#complete() };
    }
    return { kind: "text", text: "" };
  }

  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    return Promise.resolve([]);
  }

  async forcedRespondTurn(): Promise<ForcedRespondTurn> {
    const parse = await parseStructuredPayload(await this.#complete());
    return { kind: "respond", payload: payloadForRespond(parse) };
  }

  #complete(): Promise<string> {
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
 * Construction inputs for the production subagent-mode `QueryModelDriver`
 * (STAGE A). The theta OWNS the tool loop: the driver holds the subagent's
 * PRIVATE conversation and drives it one `complete()` turn per free-phase round,
 * so the enclosing `runUntypedQueryLoop` / `runTypedQueryLoop` machinery
 * enforces `tool_loop.max_rounds` and surfaces `Err(tool_loop_exhausted)` on
 * exhaustion (ceiling #2 / FRNT-1). Injected so a test scripts the model turns
 * and tool results deterministically.
 */
export interface SubagentQueryModelDeps {
  /**
   * The rendered (typed-aware) query text seeding the private conversation as
   * the first user message. The SUBAG-1 `system:` prompt is carried by
   * `runCompletion`'s completion context, not this list.
   */
  readonly queryText: string;
  /**
   * Issue ONE model completion given the accumulated private conversation and
   * the loop's cancellation signal, resolving to the assistant message. The
   * production closure calls pi-ai `complete()` against the resolved subagent
   * model with the theta's `system:` prompt (SUBAG-1) and callable-set tool
   * schemas (SUBAG-2), threading `thetaAbort.signal` (CANCEL).
   */
  readonly runCompletion: (
    messages: readonly Message[],
    signal: AbortSignal,
  ) => Promise<AssistantMessage>;
  /**
   * Execute ONE model-emitted tool call through the theta's callable set and
   * lower the outcome to the tool-result message fed back on the next turn.
   */
  readonly executeTool: (call: ToolCall, signal: AbortSignal) => Promise<ToolResultMessage>;
  /** The per-invocation cancel controller the loop's `signal` gates on. */
  readonly thetaAbort: AbortController;
  /** PIC-50/51: the resolved-model provider for a synthesised `TransportError`. */
  readonly provider: string;
}

/**
 * Build the production subagent-mode `QueryModelDriver` (STAGE A). The driver
 * owns the subagent's private conversation and advances it one `complete()`
 * turn per free-phase round, so the enclosing query-tool-loop enforces
 * `tool_loop.max_rounds`: a turn emitting `tool_use` blocks is one free-phase
 * round (its tool results are fed back), and a plain-text turn terminates the
 * loop. The subagent conversation is private and discarded with the invocation
 * (isolation). A typed query's `forcedRespondTurn` drives the structured
 * terminator and parses the payload so a typed return crosses the subagent
 * boundary (FN-5).
 */
export function createSubagentQueryModel(deps: SubagentQueryModelDeps): QueryModelDriver {
  return new SubagentQueryModel(deps);
}

class SubagentQueryModel implements QueryModelDriver {
  readonly #runCompletion: SubagentQueryModelDeps["runCompletion"];
  readonly #executeTool: SubagentQueryModelDeps["executeTool"];
  readonly #thetaAbort: AbortController;
  // PIC-50/51: the resolved-model provider for a synthesised `TransportError`
  // (mirrors `LivePromptQueryModel.#provider`).
  readonly #provider: string;
  // The subagent's PRIVATE conversation, owned by this driver and discarded
  // with the invocation (subagent isolation): the seeding user query, each
  // assistant turn, and each tool-result turn fed back.
  readonly #messages: Message[];
  // The tool calls emitted by the most recent `tool_use` turn, keyed by
  // tool-use id, so `runToolBatch` recovers each call's arguments (the loop's
  // `ToolCallRequest` carries only the name + id).
  #pending: Map<string, ToolCall> = new Map();

  constructor(deps: SubagentQueryModelDeps) {
    this.#runCompletion = deps.runCompletion;
    this.#executeTool = deps.executeTool;
    this.#thetaAbort = deps.thetaAbort;
    this.#provider = deps.provider;
    this.#messages = [{ role: "user", content: deps.queryText, timestamp: 0 }];
  }

  /**
   * PIC-50/51 (mirror of the prompt path's `extractPromptModeQueryResult`
   * probe): reuse the shared subagent transport probe over the private
   * conversation's settled trailing `assistant` turn. Only a
   * `stopReason: "error"` verdict diverts — a `TransportError` is returned;
   * cancellation stays handled by the loop's abort bounce, and the `Ok`-text
   * path stays with the driver's `assistantText`.
   */
  #probeTransport(): TransportError | undefined {
    const probe = extractSubagentQueryResult(
      { type: "agent_end", messages: this.#messages, willRetry: false },
      { aborted: this.#thetaAbort.signal.aborted, provider: this.#provider },
    );
    return !probe.ok && probe.error.kind === "transport"
      ? (probe.error as TransportError)
      : undefined;
  }

  async nextFreePhaseTurn(_round: number): Promise<FreePhaseTurn> {
    let reply: AssistantMessage;
    try {
      reply = await this.#runCompletion(this.#messages, this.#thetaAbort.signal);
    } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — cancel bounces to the loop's cancelled surface; a non-cancel complete() reject is a PIC-50 transport failure
      // CANCEL: a completion aborted by `thetaAbort` rejects; bounce an empty
      // `tool_use` round so the loop's next round-boundary checkpoint surfaces
      // `Err(cancelled)`.
      if (this.#thetaAbort.signal.aborted) {
        return { kind: "tool_use", batch: [] };
      }
      // PIC-50 (mirror of the prompt path's `sendUserMessage` sync-throw
      // mapping): a non-cancel `complete()` rejection is a provider transport
      // failure. Surface it as the free-phase `transport` turn — never escape as
      // `theta/runtime/internal-error`, never mask as a terminating `Ok(text)`.
      return { kind: "transport", error: mapPromptModeSyncThrow(thrown, this.#provider) };
    }
    // CANCEL: a cancellation that fired DURING the completion bounces an empty
    // round so the loop surfaces `Err(cancelled)` rather than binding a stale
    // reply as the terminating text.
    if (this.#thetaAbort.signal.aborted) {
      return { kind: "tool_use", batch: [] };
    }
    this.#messages.push(reply);
    // PIC-51 (mirror of the prompt path): probe the settled turn's trailing
    // `assistant` `stopReason` before extracting tool calls or text. A
    // `stopReason: "error"` turn diverts to `Err(TransportError)`.
    const transport = this.#probeTransport();
    if (transport !== undefined) {
      return { kind: "transport", error: transport };
    }
    const calls = reply.content.filter((part): part is ToolCall => part.type === "toolCall");
    if (calls.length > 0) {
      // A `tool_use` round: one free-phase round consuming exactly one slot
      // (CIO-4 — a parallel batch counts as one slot).
      this.#pending = new Map(calls.map((call) => [call.id, call]));
      return {
        kind: "tool_use",
        batch: calls.map((call) => ({ toolName: call.name, toolUseId: call.id })),
      };
    }
    // A plain-text turn terminates the free phase — the untyped query's result.
    return { kind: "text", text: assistantText(reply) };
  }

  async runToolBatch(
    batch: readonly { readonly toolName: string; readonly toolUseId: string }[],
  ): Promise<readonly CommittedSideEffect[]> {
    // Execute each sibling in the round's batch through the theta's callable set
    // and feed every result (successful and failing alike) back into the
    // conversation as a tool-result turn, so the next `complete()` turn sees the
    // outcomes. The driver commits no theta-level side effects here.
    for (const request of batch) {
      const call = this.#pending.get(request.toolUseId);
      if (call === undefined) {
        continue;
      }
      const result = await this.#executeTool(call, this.#thetaAbort.signal);
      this.#messages.push(result);
    }
    this.#pending = new Map();
    return [];
  }

  async forcedRespondTurn(): Promise<ForcedRespondTurn> {
    // The typed-query terminator: drive one completion that must return the
    // structured JSON (the query text already carries the lowered-shape
    // instruction) and parse it as the candidate payload (mirroring the
    // prompt-mode `LivePromptQueryModel.forcedRespondTurn`) so the typed value
    // crosses the subagent boundary (FN-5). A non-JSON reply parses to its raw
    // text so the schema validation reports the mismatch.
    let reply: AssistantMessage;
    try {
      reply = await this.#runCompletion(this.#messages, this.#thetaAbort.signal);
    } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — an abort propagates unchanged; a non-cancel forced-respond reject is a PIC-50 transport failure
      // CANCEL: a cancellation during the forced-respond terminator propagates
      // unchanged (handled by the loop as before).
      if (this.#thetaAbort.signal.aborted) {
        throw thrown;
      }
      // PIC-50 (mirror of the prompt path): a non-cancel forced-respond
      // rejection is a provider transport failure — surface the typed query's
      // `Err(TransportError)` rather than parsing an empty/partial payload.
      return { kind: "transport", error: mapPromptModeSyncThrow(thrown, this.#provider) };
    }
    this.#messages.push(reply);
    // PIC-50/51 (mirror of the prompt path): a `stopReason: "error"` forced-
    // respond turn surfaces the typed query's `Err(TransportError)` rather than
    // being parsed as a structured payload (which would mis-surface as a
    // validation failure).
    const transport = this.#probeTransport();
    if (transport !== undefined) {
      return { kind: "transport", error: transport };
    }
    const parse = await parseStructuredPayload(assistantText(reply));
    return { kind: "respond", payload: payloadForRespond(parse) };
  }
}

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
  if (dispatch === undefined) {
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
 * instruction for a schema-typed query. Shared by the prompt-mode and
 * subagent-mode drivers so both convey the declared shape identically. The
 * conveyance carries the LOWERED response schema (QRY-22) when the declared
 * schema lowered cleanly — not the bare type name — so the model sees the JSON
 * shape its response is validated against; it falls back to the annotation text
 * only when the schema did not lower.
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
    `${base}\n\nRespond with ONLY a single minified JSON object matching this JSON ` +
    `schema, and nothing else — no prose, no markdown, no code fences: ${shape}`
  );
}

/** The theta body's `schema` declarations, for whole-file named-type resolution. */
function schemaDeclsOf(body: ThetaBody): SchemaDecl[] {
  return body.statements.filter((stmt): stmt is SchemaDecl => stmt.kind === "schema");
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
 * Resolve a query / respond-repair follow-up prompt off-session through pi-ai's
 * `complete()` free function (no user session turn), returning the assistant
 * text. Shared by the off-session query driver and the off-session respond-repair
 * follow-up drive.
 */
async function offSessionComplete(
  model: Model<Api> | undefined,
  prompt: string,
): Promise<string> {
  if (model === undefined) {
    throw new OffSessionModelUnavailableError(
      "H8a: an off-session chained query has no resolved model (ctx.model is undefined).",
    );
  }
  const reply: AssistantMessage = await complete(model, {
    messages: [{ role: "user", content: prompt, timestamp: 0 }],
  });
  return assistantText(reply);
}

/**
 * Drive ONE user-visible streamed turn against the shared user session and
 * return its trailing-turn assistant text. Mirrors `LivePromptQueryModel`'s turn
 * drive: install the caller-supplied active tools for the turn (the theta's
 * callable set for a query follow-up, `[]` for the binder), issue the
 * fire-and-forget `pi.sendUserMessage`, then observe the run through
 * `ctx.isIdle()` (wait for it to begin streaming, then to go idle again) and the
 * `ctx.waitForIdle()` completion barrier — all bounded on the injected `Clock`.
 */
async function driveStreamedUserTurn(deps: {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionCommandContext;
  readonly clock: Clock;
  readonly queryText: string;
  /**
   * QTL-4: the active tool names to install for the turn (the theta's
   * callable-set underlying Pi-tool names for a query follow-up; `[]` for the
   * binder turn, which emits a structured envelope and calls no tools).
   */
  readonly activeTools: readonly string[];
}): Promise<string> {
  const readMessages = (): readonly Message[] =>
    buildSessionContext(
      deps.ctx.sessionManager.getEntries(),
      deps.ctx.sessionManager.getLeafId(),
    ).messages as unknown as readonly Message[];
  const pollWhile = async (condition: () => boolean, bound: number): Promise<void> => {
    for (let i = 0; i < bound && condition(); i += 1) {
      await macrotask(deps.clock, POLL_INTERVAL_MS);
    }
  };
  const ambientTools = deps.pi.getActiveTools();
  deps.pi.setActiveTools([...deps.activeTools]);
  try {
    deps.pi.sendUserMessage(deps.queryText);
    await pollWhile(() => deps.ctx.isIdle(), TURN_START_POLL_BOUND);
    await pollWhile(() => !deps.ctx.isIdle(), TURN_END_POLL_BOUND);
    await deps.ctx.waitForIdle();
  } finally {
    deps.pi.setActiveTools(ambientTools);
  }
  return extractTrailingTurnText(readMessages());
}

/**
 * Render the binder-turn prompt: instruct the model to bind the raw slash
 * arguments into the theta's typed `params:` object and emit ONLY the minified
 * three-arm envelope JSON (`ok | needs_info | ambiguous`) validating against the
 * per-theta envelope schema — no prose, no markdown, no code fences.
 */
function renderBinderTurnPrompt(input: {
  readonly slashName: string;
  readonly args: string;
  readonly paramsSchema: Readonly<Record<string, unknown>>;
  readonly defaultedFields: readonly string[];
  readonly envelopeSchema: Readonly<Record<string, unknown>>;
  /** BNDR-10 Recent session context transcript body (`bind_context: session`). */
  readonly sessionContext?: string;
}): string {
  const defaulted =
    input.defaultedFields.length > 0 ? input.defaultedFields.join(", ") : "(none)";
  // BNDR-10: ground the binder in the recent session transcript when present.
  const sessionBlock =
    input.sessionContext !== undefined
      ? `Recent session context (most recent 20 turns / 8000 tokens):\n${input.sessionContext}\n`
      : "";
  return (
    `You are the argument binder for the theta slash command /${input.slashName}. ` +
    `Bind the raw slash-command arguments to the theta's typed parameters.\n\n` +
    sessionBlock +
    `Raw arguments: ${JSON.stringify(input.args)}\n\n` +
    `Parameter schema (JSON Schema): ${JSON.stringify(input.paramsSchema)}\n` +
    `Defaulted parameters (may be omitted from your args — defaults are applied ` +
    `downstream): ${defaulted}\n\n` +
    `Respond with ONLY a single minified JSON object and nothing else — no prose, ` +
    `no markdown, no code fences — matching exactly one of these three arms:\n` +
    `  {"kind":"ok","args":{ ...bound parameters... }}\n` +
    `  {"kind":"needs_info","message":"..."}\n` +
    `  {"kind":"ambiguous","message":"...","candidates":["..."]}\n\n` +
    `Prefer the "ok" arm when the arguments can be bound. Your object MUST ` +
    `validate against this envelope JSON Schema: ${JSON.stringify(input.envelopeSchema)}`
  );
}

/**
 * The routed classification of the off-session binder reply. `ok` runs the theta
 * body; `needs_info` / `ambiguous` carry the model's message for their
 * failure-mode note; `malformed` is a reply that does not parse as an envelope
 * object, carries an out-of-set `kind`, or whose model message is empty after
 * rule-1 stripping (§"System-note rendering" rule 4).
 */
type BinderReplyRouting =
  | { readonly kind: "ok" }
  | { readonly kind: "needs_info"; readonly message: string }
  | { readonly kind: "ambiguous"; readonly message: string }
  | { readonly kind: "malformed" };

/**
 * Parse and route the off-session binder reply text, NON-throwing (it reuses the
 * `V13e` `parseStructuredPayload` promise-rejection handler, never a broad
 * `catch`). A reply that does not parse as a JSON object, carries a `kind`
 * outside `ok | needs_info | ambiguous`, or whose `message` is empty after
 * rule-1 stripping is routed to `malformed`. The parsed text is never surfaced
 * verbatim to the user (BND-3) — only the routed note is.
 */
async function parseBinderEnvelope(text: string): Promise<BinderReplyRouting> {
  const parse = await parseStructuredPayload(text);
  if (!parse.parsed || typeof parse.value !== "object" || parse.value === null) {
    return { kind: "malformed" };
  }
  const obj = parse.value as Record<string, unknown>;
  const kind = obj["kind"];
  if (kind === "ok") {
    return { kind: "ok" };
  }
  if (kind === "needs_info" || kind === "ambiguous") {
    const message = typeof obj["message"] === "string" ? (obj["message"] as string) : "";
    // Rule 4: a message empty after rule-1 stripping is a malformed envelope,
    // not an empty note.
    if (classifyModelContent({ message }) === "empty-malformed") {
      return { kind: "malformed" };
    }
    return { kind, message };
  }
  return { kind: "malformed" };
}

/**
 * Derive the argument-echo `EchoType` for a bound value, VALUE-driven so it can
 * never mismatch the value's runtime shape and crash the renderer. The lowered
 * params property (when available) disambiguates `integer` from `number`; every
 * other arm is decided from the runtime value. An enum value is a string at
 * runtime and renders identically to a string through the quote predicate, so
 * the `string` arm is used for it. Object fields are taken from the value's own
 * keys in insertion order (declaration order for a binder-returned object).
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
    const element =
      value.length > 0
        ? echoTypeFromValue(value[0] as ThetaValue, itemProp)
        : ({ kind: "string" } as EchoType);
    return { kind: "array", element };
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
 * Extract the `ok` envelope's `args` object from the streamed binder reply,
 * NON-throwing: it reuses the `V13e` `parseStructuredPayload` (a promise
 * rejection handler, never a broad `catch`). A reply that does not parse as a
 * JSON object, or an `ok` envelope carrying no `args` object, yields `{}` (the
 * body still runs on the `ok` arm, with no param slots). The authoritative
 * envelope schema validation lives in the acceptance runner.
 */
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

async function parseOkEnvelopeArgs(text: string): Promise<Readonly<Record<string, unknown>>> {
  const parse = await parseStructuredPayload(text);
  if (!parse.parsed || typeof parse.value !== "object" || parse.value === null) {
    return {};
  }
  const args = (parse.value as Record<string, unknown>)["args"];
  if (typeof args === "object" && args !== null && !Array.isArray(args)) {
    return args as Readonly<Record<string, unknown>>;
  }
  return {};
}

/**
 * Render one `@`-query template to its wire text against the lexical
 * environment: lex the template into literal / `${…}` interpolation parts,
 * evaluate each interpolation as a full expression (expressions.md
 * §"Supported forms" — not a dotted-path subset), stringify the resulting
 * runtime value by the QRY-18 rule, and apply the QRY-7 newline-trim → dedent
 * normalisation. An interpolation whose source does not parse, or that has no
 * pure runtime value (an effectful `fn` body / tool-call), yields the inert
 * `null` render (the expressions.md safety net), never a throw.
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
 * render as compact JSON. A `Result` value is not statically rejectable here
 * (this is the runtime render, not a parse) — it renders as compact JSON,
 * preserving the prior non-crashing behaviour rather than emitting a diagnostic.
 */
function stringifyInterpolation(source: string, env: LexicalEnvironment): string {
  const parsed = parseExpressionSource(source);
  if (parsed === null) {
    // An unparseable interpolation has no value; render the inert `null` rather
    // than throwing out of the render path (the expressions.md safety net).
    return "null";
  }
  const value = evaluatePureExpression(parsed, env);
  const type = interpolationTypeOf(value);
  if (type.kind === "object" || type.kind === "array") {
    // QRY-18: a Schema-typed object / `array<T>` interpolation renders as compact
    // `JSON.stringify` with wire-name translation applied recursively. The
    // outbound pass rewrites every renamed field to its wire name at every
    // nesting level, driven by each object value's declaring-schema brand (with
    // the declared field type as a fallback for un-branded nested values); theta
    // code never sees a wire name, and the model never sees a theta-side name.
    return JSON.stringify(translateInterpolationOutbound(value, env));
  }
  const rendered = stringifyInterpolatedValue(value, type);
  // `stringifyInterpolatedValue` only reports `ok: false` for the static
  // `result` arm, which `interpolationTypeOf` never selects, so the value branch
  // always holds; the JSON fallback keeps this total without a throw.
  return rendered.ok ? rendered.text : JSON.stringify(value);
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
 */
function translateInterpolationOutbound(
  value: ThetaValue,
  env: LexicalEnvironment,
  typeHint?: string,
): unknown {
  if (isEnumValue(value)) {
    // The enum brand is dropped; the model only ever sees the bare wire string.
    return String(value);
  }
  if (Array.isArray(value)) {
    const elementHint = typeHint !== undefined ? arrayElementTypeSource(typeHint) : undefined;
    return value.map((element) => translateInterpolationOutbound(element, env, elementHint));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  // Resolve the declaring schema: the construction-time brand is authoritative;
  // an un-branded value falls back to the declared field type when that names a
  // resolvable schema (a `Result` value / bare literal resolves to neither and
  // recurses with its keys unchanged).
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

  const result: Record<string, unknown> = {};
  for (const [thetaKey, fieldValue] of Object.entries(value)) {
    const field = fields.get(thetaKey);
    const wireKey = field?.wire ?? thetaKey;
    result[wireKey] = translateInterpolationOutbound(fieldValue, env, field?.type);
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
 * `Result` is rendered as compact JSON via the `object` arm, preserving the
 * prior non-crashing render (the static `result`-rejection arm is a parse-time
 * concern, not reachable on this runtime render path).
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
  // A plain object schema value or a `Result` — compact JSON (a `Result`
  // serialises through its `ok`/`value`/`error` shape, preserving the prior
  // non-crashing behaviour).
  return { kind: "object" };
}

/**
 * Evaluate a pure (non-checkpointed) sub-expression against the environment.
 * The shipped test thetas' pure sub-expressions are literal / identifier reads;
 * an identifier that resolves to a local binding yields its value, any other
 * resolution arm (a bare `fn` / callable name, or an unresolved name) has no
 * first-class readable value and yields `null` (the expressions.md runtime
 * safety net) rather than throwing out of the executor.
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
      // theta-side names. When the constructor names a declared `schema`, brand
      // the value (non-enumerably, so no theta-visible surface changes) with that
      // schema name so the QRY-18 interpolation render path can recover the
      // schema and apply outbound wire-name translation recursively.
      const obj: Record<string, ThetaValue> = {};
      for (const field of expr.fields) {
        obj[field.name] = evaluatePureExpression(field.value, env);
      }
      if (expr.typeName !== null && env.resolveSchema(expr.typeName) !== undefined) {
        return brandSchemaValue(obj, expr.typeName);
      }
      return obj;
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
      return fn !== undefined ? evaluatePureFnCall(fn, expr, env) : null;
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
    case "binary":
      return evaluateBinaryExpression(expr.op, expr.left, expr.right, env);
    case "ternary": {
      // `cond ? a : b` — only the taken branch is evaluated (short-circuit).
      const condition = evaluatePureExpression(expr.condition, env);
      return condition === true
        ? evaluatePureExpression(expr.consequent, env)
        : evaluatePureExpression(expr.alternate, env);
    }
    default:
      // `try` / `match` / effect forms are driven by the executor (not the pure
      // host); a query / tool-call / invoke expression reaching here has no pure
      // value and yields the inert `null` (the expressions.md safety net).
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
function evaluatePureFnCall(fn: FnDecl, expr: CallExpr, env: LexicalEnvironment): ThetaValue {
  if (expr.args.length !== fn.params.length) {
    throw new ThetaFnArityError(fn.name, fn.params.length, expr.args.length);
  }
  const scope = env.child();
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
 * out of the executor.
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
      return (left as number) - (right as number);
    case "*":
      return (left as number) * (right as number);
    case "/":
      return (left as number) / (right as number);
    case "%":
      return (left as number) % (right as number);
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
