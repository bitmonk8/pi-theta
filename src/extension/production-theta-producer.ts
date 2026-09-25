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
// and runtime seams, delegating the frontmatter binder run (binder-run.ts),
// the subagent spawn & child-side regime (subagent-spawn-regime.ts), the
// `invoke(...)` machinery (invoke-machinery.ts), the code-side tool-call
// dispatch ladder (tool-call-ladder.ts), query driving, echo types, pure
// evaluation, callable-set lowering / drive binding (callable-lowering.ts),
// and query wire-text rendering (query-text-render.ts); its construction
// input surface lives in production-producer-deps.ts (re-exported here).
//
// Spec (narrative): pi-integration-contract/extension-bootstrap-and-per-theta.md
// (§"Per-theta registration"), conversation-drive.md, slash-invocation.md,
// binder/binder-model-and-context.md, subagent.md.

import { evaluatePureExpression } from "../runtime/pure-expression-evaluator";
import {
  LivePromptQueryModel,
  resolveRegistryAuth,
  RESPOND_TOOL_DESCRIPTION,
  RESPOND_CAPTURED_TEXT,
  RESPOND_REPEAT_TEXT,
  respondToolExecuteResult,
  type ActiveRespondCapture,
  type RespondTurnContext,
  type RespondToolExecuteResult,
} from "./live-prompt-query-driver";
export * from "./live-prompt-query-driver";
import {
  buildBoundEnvironment,
  callableSetPiToolNames,
  presentedCallableNames,
  promptModeSurface,
} from "./callable-lowering";
export {
  lowerModelDrivenThetaCall,
  type LoweredThetaCallableResult,
  type ModelDrivenThetaCall,
} from "./callable-lowering";
import {
  mergedEnumDeclsOf,
  mergedSchemaDeclsOf,
  renderTypedAwareQueryText,
} from "./query-text-render";
import { renderQueryText } from "../runtime/query-interpolation";
export { collectLaunchRespondNames, mergedEnumDeclsOf, mergedSchemaDeclsOf } from "./query-text-render";
import { BinderRunner } from "./binder-run";
import {
  noopSink,
  NoopConversationMutator,
  type ProductionProducerInput,
} from "./production-producer-deps";
export type {
  CalleeParseOutcome,
  PiToolDispatch,
  ProductionProducerInput,
  SubagentPlacementResolver,
} from "./production-producer-deps";
import { InvokeMachinery } from "./invoke-machinery";
import { SubagentSpawnRegime } from "./subagent-spawn-regime";
import { ToolCallLadder } from "./tool-call-ladder";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
// RFC-0005: `buildSessionContext` remains for the prompt-mode drive; the former
// in-process subagent satellites (`createAgentSession` / `DefaultResourceLoader`
// / `SessionManager` / `getAgentDir` / `defineTool`) are retired — the subagent
// drive spawns a child `pi` process (subagent.md, RFC-0005).
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import type {
  Api,
  Message,
  Model,
} from "@earendil-works/pi-ai";
// Bug 0010: the synthesised respond tool's `parameters` wrap the lowered
// response schema exactly as the binder call shape does (`Type.Unsafe`).
import { Type } from "typebox";
import type {
  ActiveInvocationEntry,
  ActiveInvocationTicket,
} from "../runtime/active-invocation-registry";
import { makeInvocationFinisher, type ForwardingSignalSource } from "./session-shutdown";
import type { ParForLaneHooks, ThetaRunOutcome } from "./execution-status/types";
import type { RunCardPublisher } from "./execution-status/run-card";
import { decorateCheckpoint } from "./execution-status/checkpoint-decorator";
import {
  emitCancelledBySessionShutdownNote,
  createProductionEmissionSink,
} from "./teardown-emission";
import {
  buildPiFallbackSystemNoteChannel,
  sendSystemNote,
  type SystemNoteChannelDeps,
} from "./system-note-channel";
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
} from "../runtime/effectful-statement-host";
import { createEffectfulStatementHost } from "../runtime/effectful-statement-host";
import { type LexicalEnvironment } from "../runtime/lexical-environment";
import {
  type ExecuteBodyDeps,
} from "../runtime/statement-executor";
import type {
  QueryModelDriver,
  QueryToolLoopConfig,
} from "../runtime/query-tool-loop";
import {
  enforceModelToolArgDepth,
} from "../runtime/tool-call";
import {
  newInvokeChainAtDepth,
  type InvokeChain,
} from "../runtime/invoke-depth-cycle";
import {
  createThetaAbort,
  deriveChildThetaAbort,
  forwardSlashCommandCancel,
} from "../runtime/cancellation-core";
import type { Trace } from "../seams/trace";
import {
  type ThetaValue,
} from "../runtime/value";
import type {
  CallExpr,
  QueryExpr,
} from "../parser/theta-document";
import { lowerQueryResponseSchema } from "../parser/query-schema-lowering";
import { decodeInboundValue } from "../runtime/inbound-boundary";
import type { LoweredSchema, SchemaValidator } from "../seams/schema-validator";
import { canonicalForm, toLoweredJsonValue } from "../parser/schema-lowering";
import type { TypedQuerySchemaValidation } from "../runtime/query-tool-loop";
import {
  buildTypedQueryValidation,
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
  createRegistrationCache,
  deriveToolLabel,
  registerToolInCache,
} from "../runtime/tool-registration";
import { renderEmptyShortCircuit } from "../render/query-render";
import { matchAvailableModel } from "../binder/binder-model";
import {
  synthesizeUnsupportedProviderTransportError,
  TYPED_QUERY_SUPPORTED_PROVIDER_APIS,
} from "../runtime/typed-query-provider-gate";
import type { Diagnostic } from "../diagnostics/diagnostic";
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
 * Assemble the production `ThetaProducerDeps` the shipped composition root
 * injects into `composeThetaFixture` for every discovered `.theta`.
 */
export function createProductionProducerDeps(
  input: ProductionProducerInput,
): ThetaProducerDeps {
  return new ProductionThetaProducer(input);
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
   * The `V11a` frontmatter binder run (binder-run.ts), extracted verbatim from
   * this class; it reaches back through `#systemNoteChannel` /
   * `#buildGroupAEventOrFallback` so its notes ride the one channel every
   * other note on this instance uses (bug 0437).
   */
  readonly #binderRun: BinderRunner;
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
  /**
   * The `invoke(...)` trampoline (invoke-machinery.ts), extracted from this
   * class; it reaches back through the same bind/spawn choke points and the
   * bug-0437 note channel this instance owns.
   */
  readonly #invokeMachinery: InvokeMachinery;
  /**
   * The subagent spawn & child-side regime (subagent-spawn-regime.ts),
   * extracted from this class; it reaches back through the prompt bind, the
   * typed-return validation, and the invocation ticket/abort bookkeeping.
   */
  readonly #subagentRegime: SubagentSpawnRegime;
  /**
   * The code-side tool-call resolution & dispatch ladder
   * (tool-call-ladder.ts), extracted from this class over the same
   * construction input.
   */
  readonly #toolLadder: ToolCallLadder;

  constructor(input: ProductionProducerInput) {
    this.#input = input;
    this.#binderRun = new BinderRunner({
      input,
      systemNoteChannel: () => this.#systemNoteChannel(),
      buildGroupAEventOrFallback: (content, buildEvent, channel) =>
        this.#buildGroupAEventOrFallback(content, buildEvent, channel),
    });
    this.#invokeMachinery = new InvokeMachinery({
      input,
      systemNoteChannel: () => this.#systemNoteChannel(),
      recoverDeclaredDefaults: (theta, defaultedFields) =>
        this.#binderRun.recoverDeclaredDefaults(theta, defaultedFields),
      bindPromptConversation: (bindInput) => this.bindPromptConversation(bindInput),
      spawnSubagentConversation: (bindInput) => this.spawnSubagentConversation(bindInput),
    });
    this.#subagentRegime = new SubagentSpawnRegime({
      input,
      bindPromptConversation: (bindInput) => this.bindPromptConversation(bindInput),
      validateInvokeReturn: (calleePath, returnSite, result, calleeResolvedPath, forwardedEnumTags) =>
        this.#invokeMachinery.validateInvokeReturn(
          calleePath,
          returnSite,
          result,
          calleeResolvedPath,
          forwardedEnumTags,
        ),
      resolveThetaModel: (modelRef, sessionModel) => this.#resolveThetaModel(modelRef, sessionModel),
      openInvocationTicket: (theta, thetaAbort) => this.#openInvocationTicket(theta, thetaAbort),
      deriveInvocationAbort: (bindInput) => this.#deriveInvocationAbort(bindInput),
      trackForwardingSources: (sources) => this.#trackForwardingSources(sources),
    });
    this.#toolLadder = new ToolCallLadder(input);
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

  /**
   * The `V11a` frontmatter binder over the slash arguments, run before the
   * theta interpreter — delegated to the extracted `BinderRunner`
   * (binder-run.ts).
   */
  async runBinder(binderInput: BinderRunInput): Promise<BinderRunResult> {
    return this.#binderRun.runBinder(binderInput);
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
      this.#input.systemNoteChannel ??
      buildPiFallbackSystemNoteChannel(
        this.#input.pi,
        this.#input.emitDiagnostic ?? ((): void => {}),
      )
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
    // composition root wired one. The pi-built fallback keeps a non-production
    // harness that constructs a producer with `pi` alone (the bug doc's
    // §Reproduction shape) delivering the note at all — it is also the path
    // the offline witness cells drive. The fallback's no-op `ui.notify` is
    // unreachable by construction here: this note is always `display: false`,
    // and `sendSystemNote` skips the `ui.notify` arm on both its send-success
    // and send-throw paths for such a note.
    const channel: SystemNoteChannelDeps = this.#systemNoteChannel();
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
    const { promise: disposeBarrier, resolve: settleDispose } = Promise.withResolvers<void>();
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
        this.#toolLadder.resolveToolCall(theta, expr, env, signal, evaluatedToolArgs),
      // CANCEL-5 / cross-mode: the caller's mode (`prompt`) is threaded to
      // `#driveCallee` so an `invoke`d prompt-mode callee attaches to this user
      // session (prompt→prompt) rather than spawning fresh.
      resolveInvoke: (expr, env, overrideChain) =>
        this.#invokeMachinery.resolveInvoke(theta, expr, env, ctx, overrideChain ?? chain, signal, "prompt", ticket.invocationId, trace),
      // Bug 0088: pair the wrapper `runInvokeEffect` builds for a failed hop
      // with its provenance record.
      recordInvokeHop: (wrapper, calleePath, callSite) =>
        this.#recordInvokeHop(theta, wrapper, calleePath, callSite),
      classifyCall: (expr) => this.#toolLadder.classifyCall(theta, expr),
      // RFC 0011 §6.3: wired only when the composition-scope session-control
      // hosts are available; absent → the executor arm is skipped.
      ...(this.#input.sessionControlHosts !== undefined
        ? {
            resolveRuntimeToolCall: (expr: CallExpr, env: LexicalEnvironment) =>
              this.#toolLadder.resolveRuntimeToolCall(theta, expr, env, signal),
          }
        : {}),
      resolveCallAsInvoke: (expr, env, overrideChain) =>
        this.#invokeMachinery.resolveCallAsInvoke(theta, expr, env, ctx, overrideChain ?? chain, signal, "prompt", ticket.invocationId, trace),
      // RFC 0001 (`subagent fn`, FN-8) / RFC 0012 §10: a prompt-mode theta may
      // call a `subagent fn` — the safe prompt→subagent direction. Each call
      // launches a CHILD of this theta with a `fn` entry under the resolved
      // FN-7 config; the depth frame (INV-4 / FN-6) is pushed on `chain` inside
      // the resolve.
      resolveSubagentFnChild: (request, overrideChain) =>
        this.#subagentRegime.resolveSubagentFnChild(
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
    const finishInvocation = makeInvocationFinisher(
      (sources) => this.#trackForwardingSources(sources),
      forwardingSources,
      ticket,
    );

    return {
      drivenAgainst: "prompt-user-session",
      executeDeps,
      surface: promptModeSurface(readMessages),
      finishInvocation,
    };
  }

  /**
   * RFC-0006 parent-side subagent-mode binding — delegated to the extracted
   * `SubagentSpawnRegime` (subagent-spawn-regime.ts).
   */
  async spawnSubagentConversation(
    bindInput: ConversationBindInput,
  ): Promise<ConversationBinding> {
    return this.#subagentRegime.spawnSubagentConversation(bindInput);
  }

  /**
   * RFC-0006 (PIC-58): whether THIS process is the spawned subagent-root child
   * for `theta` — delegated to the extracted `SubagentSpawnRegime`.
   */
  isSubagentRootFor(theta: ConversationBindInput["theta"]): boolean {
    return this.#subagentRegime.isSubagentRootFor(theta);
  }

  /**
   * RFC-0006 child-side subagent-root drive — delegated to the extracted
   * `SubagentSpawnRegime` (subagent-spawn-regime.ts). Resolves to the drive's
   * PIC-76 outcome projection for the dispatch entry's run card.
   */
  async driveSubagentRootRegime(bindInput: ConversationBindInput): Promise<ThetaRunOutcome> {
    return this.#subagentRegime.driveSubagentRootRegime(bindInput);
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
          // Bug 0491: the theta's `thinking:` pin for the PIC-17 thinking window.
          ...(deps.theta.frontmatter.thinking !== undefined
            ? { queryThinking: deps.theta.frontmatter.thinking }
            : {}),
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
      // Auth threading copied from `BinderRunner.#completeBinderReply`
      // (binder-run.ts, bug 0010): the
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


}

