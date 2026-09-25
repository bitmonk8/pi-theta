// The production subagent spawn & child-side regime for the per-theta
// producer (production-theta-producer.ts). Parent side: bind a subagent-mode
// callee by EAGERLY launching a child `pi` process (PIC-58/59/60/62/65/66;
// RFC 0012 placement, RFC 0009 cwd), marshalling params / control-plane env /
// callable hashes, and returning the envelope-awaiting drive binding; plus
// the RFC 0012 §10 parent side of a `subagent fn` call. Child side: detect
// the subagent-root regime (`isSubagentRootFor`) and run the process-root
// drive (`driveSubagentRootRegime`) — params intake, PIC-62 model
// confirmation, the in-process body drive, and the single `theta_result`
// envelope on every exit path — extracted from `ProductionThetaProducer`,
// which delegates its `spawnSubagentConversation` / `isSubagentRootFor` /
// `driveSubagentRootRegime` members here and hands back its bind / ticket /
// abort / typed-return seams through `SubagentSpawnRegimeDeps`.
//
// Spec (narrative): pi-integration-contract/subagent.md, invocation.md
// (INV-4, INV-8), execution-status.md, cancellation.md CANCEL-5,
// runtime-value-model.md §"Wire-name translation".

import type {
  Api,
  Model,
} from "@earendil-works/pi-ai";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { resolve as resolvePath } from "node:path";
import { matchAvailableModel } from "../binder/binder-model";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { normalizePath } from "../normalize-path";
import { inferCalleeReturnAnnotation } from "../parser/functions";
import { lowerQueryResponseSchema } from "../parser/query-schema-lowering";
import { renderSystemPrompt } from "../parser/system-prompt-render";
import type { FnDecl, SubagentSessionConfig } from "../parser/theta-document";
import type { ActiveInvocationTicket } from "../runtime/active-invocation-registry";
import { collectForwardedEnumTags } from "../runtime/enum-tag-carriage";
import { bindParamsInbound, decodeInboundValue } from "../runtime/inbound-boundary";
import type { DrivenInvokeResult, InvokeResultSource } from "../runtime/invoke-cancellation";
import { enforceInvokeParamsDepth } from "../runtime/invoke-ceiling-depth";
import {
  pushCountableFrameOrRefuse,
  type InvokeChain,
} from "../runtime/invoke-depth-cycle";
import { guardInvokeExecutionPromise } from "../runtime/invoke-swallowing-handler";
import type { LexicalEnvironment } from "../runtime/lexical-environment";
import type { InvokeInfraCause, InvokeInfraError } from "../runtime/query-error";
import { InvokeInfraCauseError } from "../runtime/query-error";
import type { QueryError } from "../runtime/query-error";
import { HostFatal, isThetaPanic } from "../runtime/runtime-panics";
import { executeBody, type SubagentFnChildRequest } from "../runtime/statement-executor";
import { attachSubagentCancellation } from "../runtime/subagent-json-driver";
import { SUBAGENT_CALLABLE_HASHES_ENV } from "../runtime/subagent-callable-hash";
import {
  mapNonRepresentableReturnValue,
  mapTooDeepReturnValue,
  serializeErrEnvelope,
  serializeOkEnvelope,
  type ErrProvenance,
  type FnTail,
} from "../runtime/subagent-envelope";
import type { SubagentChildControlPlane } from "../runtime/subagent-launch-file";
import {
  inferChildTrust,
  placeSubagentChild,
  routeSubagentSpawnFailure,
} from "../runtime/subagent-launcher";
import {
  createPipePlacementBackend,
  isPipePlacement,
  placementIsVisible,
  THETA_LAUNCH_ENTRY,
  type SubagentLaunchEntry,
} from "../runtime/subagent-placement";
import {
  SUBAGENT_CHILD_OUTCOME_CHANNEL,
  SUBAGENT_CHILD_OUTCOME_API_VERSION,
  type SubagentChildOutcome,
  type SubagentChildOutcomePayload,
} from "../runtime/subagent-placement-registry";
import type { PlacementLease } from "../runtime/subagent-placement-selection";
import {
  confirmChildModel,
  guardResolvedModel,
  SUBAGENT_MODEL_UNRESOLVED_MESSAGE,
} from "../runtime/subagent-model-guard";
import {
  intakeChildParams,
  marshalParams,
  type ChildParamsIntake,
  type ParamsMarshalDeps,
  type ParamsSchemaValidator,
} from "../runtime/subagent-params";
import { SUBAGENT_ROOT_WINNER_ENV } from "../runtime/subagent-root-regime";
import type { EnumTagEntry } from "../runtime/subagent-envelope";
import {
  defineRecordField,
  isResultValue,
  makeErr,
  type ResultValue,
  type ThetaValue,
} from "../runtime/value";
import { makeCancelledError } from "../runtime/cancellation-core";
import {
  buildSubagentDriveBinding,
  callableSetPiToolNames,
  callableSetThetaEntries,
  subagentFnCallableSet,
  surfaceCalleeFinalValue,
  thetaLookupEnvironment,
} from "./callable-lowering";
import { attachChildActivityTap } from "./execution-status/child-tap";
import type { ThetaRunOutcome } from "./execution-status/types";
import type { InvokeReturnSite } from "./invoke-machinery";
import {
  noopSwallowChannels,
  signalGuard,
  SubagentSpawnFailedError,
  type ProductionProducerInput,
  type SubagentPlacementResolver,
} from "./production-producer-deps";
import { collectLaunchRespondNames, mergedEnumDeclsOf, mergedSchemaDeclsOf } from "./query-text-render";
import { makeInvocationFinisher, type ForwardingSignalSource } from "./session-shutdown";
import {
  buildPiFallbackSystemNoteChannel,
  sendSystemNote,
  type SystemNoteChannelDeps,
} from "./system-note-channel";
import type {
  BodyExecutingConversationBinding,
  ConversationBinding,
  ConversationBindInput,
} from "./theta-composition-producer";
import type { SubagentFnInvokeChild } from "../runtime/effectful-statement-host";
import { newInvokeChainAtDepth } from "../runtime/invoke-depth-cycle";
import { evaluateCallSiteCwd } from "../runtime/pure-expression-evaluator";
import type { LoweredSchema } from "../seams/schema-validator";

/**
 * The producer collaborators the extracted spawn/regime reaches back through:
 * the construction input, the prompt-mode bind choke point (the child-side
 * regime drives the body against it), the invoke machinery's typed-return
 * validation (`subagent fn` returns take the same pass), the shared
 * theta-model resolution (bug 0479), and the producer's invocation
 * ticket/abort/forwarding bookkeeping (Decision 6 / Increment B1/B2).
 */
export interface SubagentSpawnRegimeDeps {
  /** The producer's construction input (`ProductionThetaProducer`'s `#input`). */
  readonly input: ProductionProducerInput;
  /** The producer's prompt-mode bind choke point (PIC-58 child-side drive). */
  readonly bindPromptConversation: (
    bindInput: ConversationBindInput,
  ) => BodyExecutingConversationBinding;
  /** `InvokeMachinery.validateInvokeReturn` — the FN-6 boundary validation a `subagent fn` return takes. */
  readonly validateInvokeReturn: (
    calleePath: string,
    returnSite: InvokeReturnSite | null,
    result: ResultValue,
    calleeResolvedPath: string | undefined,
    forwardedEnumTags?: readonly EnumTagEntry[],
  ) => ResultValue;
  /** The producer's shared theta-model resolution (bug 0479). */
  readonly resolveThetaModel: (
    modelRef: string | undefined,
    sessionModel: Model<Api> | undefined,
  ) => Model<Api> | undefined;
  /** The producer's registry-side ticket construction (`#openInvocationTicket`). */
  readonly openInvocationTicket: (
    theta: string,
    thetaAbort: AbortController,
  ) => ActiveInvocationTicket;
  /** The producer's invocation-abort derivation (`#deriveInvocationAbort`, CANCEL-2/5). */
  readonly deriveInvocationAbort: (bindInput: ConversationBindInput) => {
    thetaAbort: AbortController;
    forwardingSources: ForwardingSignalSource[];
  };
  /** The producer's forwarding-source bookkeeping (`#trackForwardingSources`, Increment B2). */
  readonly trackForwardingSources: (
    sources: readonly ForwardingSignalSource[],
  ) => () => void;
}

/**
 * The extracted subagent spawn & child-side regime (see the module header).
 * Constructed once per `ProductionThetaProducer` over that producer's own
 * collaborators; holds no cross-invocation mutable state.
 */
export class SubagentSpawnRegime {
  readonly #input: ProductionProducerInput;
  readonly #deps: SubagentSpawnRegimeDeps;

  constructor(deps: SubagentSpawnRegimeDeps) {
    this.#input = deps.input;
    this.#deps = deps;
  }

  /**
   * RFC-0006 (PIC-58/59/60/62/63). Parent-side subagent-mode binding. Under this
   * RFC the WHOLE callee runs in a spawned child `pi --theta … --mode json -p
   * "/<slug>" (--session <child-log> | --no-session)` process (bug 0489); the parent no longer drives a remote
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
    const model = this.#deps.resolveThetaModel(theta.frontmatter.model, ctx.model);
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
    const { thetaAbort, forwardingSources } = this.#deps.deriveInvocationAbort(bindInput);

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
      bindInput.invocationTicket ?? this.#deps.openInvocationTicket(theta.slashName, thetaAbort);
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
      // RFC 0015 (D7): spawn-path launch-site carriage (see
      // ConversationBindInput.launchSite) — the gutter ⑂ / roster [line N]
      // source for subagent-fn fan-out.
      ...(bindInput.launchSite !== undefined ? { launchSite: bindInput.launchSite } : {}),
    });

    const finishInvocation = makeInvocationFinisher(
      this.#deps.trackForwardingSources,
      forwardingSources,
      ticket,
    );

    // ---- EAGER child-process launch (PIC-65 / PIC-58 / PIC-60 / PIC-66) ----
    // The launch is initiated NOW (not lazily in `drive()`): PIC-22 requires the
    // spawn to be initiated at bind time (parallel fan-out), and the launch
    // contract is observable here. `drive()` below only awaits the envelope on
    // the already-spawned child.
    const { paramsCleanup, parentEnv, controlPlaneEnv } = this.#buildControlPlaneEnv(
      bindInput,
      theta,
      callableHashes,
    );

    const { child, placement, placementLease, placedHandle } = await this.#launchSubagentChild({
      theta,
      model,
      systemPrompt,
      piToolNames,
      noHostTools,
      projectTrust,
      respondToolNames,
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
      // INV-4: marshal the CURRENT per-chain depth so the child continues the
      // depth-32 ceiling across the process hop (wire-level carriage).
      invokeDepth: chain.depth,
      emitDiagnostic,
      paramsCleanup,
      finishInvocation,
    });
    // RFC 0012 §7 (EXST-5 degradation): a non-`pipe` child's `--mode json`
    // stream is a TTY the parent never sees, so the execution-status node
    // records WHERE the child lives instead — `live in <backend> <handle>` —
    // and its liveness rides the channel heartbeat the tap below folds.
    if (!isPipePlacement(placement)) {
      statusBus?.invocationPlaced(ticket.invocationId, {
        backend: placement.name,
        handle: placedHandle,
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

  /**
   * Marshal the launch's params and assemble its control-plane env carriage.
   *
   * PIC-60: marshal the already-typed params structurally (canonical JSON on
   * `PI_THETA_PARAMS`, or a 0600 temp file on `PI_THETA_PARAMS_FILE` at/above
   * the pinned threshold). The child validates against the same `params:`
   * schema and skips the binder entirely.
   */
  #buildControlPlaneEnv(
    bindInput: ConversationBindInput,
    theta: ConversationBindInput["theta"],
    callableHashes: Record<string, string>,
  ): {
    paramsCleanup: () => void;
    parentEnv: Readonly<Record<string, string | undefined>>;
    controlPlaneEnv: Record<string, string | undefined>;
  } {
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
        theta.sourcePath !== undefined ? normalizePath(theta.sourcePath) : undefined,
    };
    return { paramsCleanup, parentEnv, controlPlaneEnv };
  }

  /**
   * Resolve the launch's placement lease, assemble the child launch argv, and
   * spawn the child, routing the two failure arms.
   *
   * PIC-65 launch. The placement seam (RFC 0012 §1) + executable host are
   * wired at the composition root; their absence on a non-production harness
   * is a configuration defect surfaced as an internal error (never a
   * modelless / childless drive). `subagentSpawn` alone is the `pipe`
   * shorthand — the pre-RFC launch, verbatim.
   */
  async #launchSubagentChild(input: {
    theta: ConversationBindInput["theta"];
    model: Model<Api>;
    systemPrompt: string | undefined;
    piToolNames: readonly string[];
    noHostTools: boolean;
    projectTrust: ReturnType<typeof inferChildTrust>;
    respondToolNames: readonly string[];
    label: string;
    entry: SubagentLaunchEntry;
    cwd: string;
    parentEnv: Readonly<Record<string, string | undefined>>;
    controlPlaneEnv: Record<string, string | undefined>;
    invokeDepth: number;
    emitDiagnostic: (diagnostic: Diagnostic) => void;
    paramsCleanup: () => void;
    finishInvocation: () => void;
  }) {
    const {
      theta,
      model,
      emitDiagnostic,
      paramsCleanup,
      finishInvocation,
    } = input;
    const executableHost = this.#input.subagentExecutableHost;
    const placementResolver = this.#placementResolver();
    if (placementResolver === undefined || executableHost === undefined) {
      paramsCleanup();
      finishInvocation();
      throw new SubagentSpawnFailedError(
        "subagent child launch is unavailable: no placement seam / executable host wired",
      );
    }
    // Operator session-log policy (bug 0489): derive the child's session-log
    // path BEFORE the lease is taken, so a policy failure — a throwing
    // sessionManager read after /reload, an un-creatable nest directory —
    // holds no lease and routes through the same cleanup as an unavailable
    // seam. A silent `--no-session` child is never the fallback: only an
    // absent seam or a sessionless parent (policy returns `undefined`)
    // degrades to the legacy forms.
    let childSessionPath: string | undefined;
    try {
      childSessionPath = this.#input.subagentChildSessionPath?.(input.label);
    } catch (policyThrow: unknown) { // allow-broad-catch: session-log-derivation-failure — pi-integration-contract/subagent.md#subagent-session-log-derivation-failure (any policy failure is a loud launch failure: params cleaned, registry entry finished, PIC-65 internal-error routing; never a silently unlogged child)
      paramsCleanup();
      finishInvocation();
      const reason = `subagent child session-log path derivation failed: ${policyThrow instanceof Error ? policyThrow.message : String(policyThrow)}`;
      // #subagent-session-log-derivation-failure: same PIC-65 routing as the
      // spawn-failure arm below — the structured internal-error diagnostic is
      // the operator's triage surface; the throw is the invoke boundary's.
      routeSubagentSpawnFailure(new Error(reason), theta.sourcePath ?? theta.slashName, {
        emitDiagnostic,
      });
      throw new SubagentSpawnFailedError(reason);
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
          systemPrompt: input.systemPrompt ?? "",
          hostTools: input.piToolNames,
          respondToolNames: input.respondToolNames,
          noHostTools: input.noHostTools,
          provider: String(model.provider),
          model: model.id,
          // Bug 0491: the theta's `thinking:` pin rides the launch as
          // `--thinking <level>`; absent keeps the child's own resolution.
          ...(theta.frontmatter.thinking !== undefined ? { thinking: theta.frontmatter.thinking } : {}),
          projectTrust: input.projectTrust,
          presentation,
          label: input.label,
          // RFC 0012 §7: `--no-session` unless the backend declares
          // `persistSession` — the operator then gets a resumable session
          // file; the parent never reads it, so theta semantics are unchanged.
          persistSession: placement.capabilities?.persistSession === true,
          // Operator session-log policy (bug 0489): the pre-lease derived
          // parent-nested session path supersedes both `persistSession` and
          // `--no-session` on either presentation; `undefined` (absent seam,
          // sessionless parent) preserves the RFC 0012 §7 baseline above.
          ...(childSessionPath === undefined ? {} : { sessionPath: childSessionPath }),
        },
        label: input.label,
        entry: input.entry,
        cwd: input.cwd,
        parentEnv: input.parentEnv,
        controlPlaneEnv: input.controlPlaneEnv,
        parentPid: this.#input.subagentParentPid ?? 0,
        invokeDepth: input.invokeDepth,
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
    return {
      child: launch.child,
      placement,
      placementLease,
      placedHandle: launch.placed.handle,
    };
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
        const renderFailChannel: SystemNoteChannelDeps =
          this.#input.systemNoteChannel ??
          buildPiFallbackSystemNoteChannel(
            this.#input.pi,
            this.#input.emitDiagnostic ?? ((): void => {}),
          );
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
   * (PIC-59). A headless child's transcript is process-private
   * (persisted only as an offline operator session log, bug 0489); a VISIBLE child (RFC 0012 §7) drives an interactive TUI
   * session, whose run card the dispatch entry closes with the returned
   * PIC-76 outcome projection.
   */
  async driveSubagentRootRegime(bindInput: ConversationBindInput): Promise<ThetaRunOutcome> {
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
    // RFC 0015 (operator ruling 2026-09-23): the drive's PIC-76 outcome
    // projection, returned so the dispatch entry can close the regime path's
    // run card. `emitErr` is the SINGLE funnel every non-Ok ending passes
    // through (the root body's returned/propagated `Err`, every boundary mint,
    // the fn-entry arms, the panic catch), so recording the projection there
    // covers them all; a drive that never reaches `emitErr` settled its Ok
    // envelope and keeps the `"ok"` seed. The mapping mirrors the dispatch
    // boundary's `terminalRunOutcome`: only a `cancelled`-kinded error is a
    // cancel witness; every other `Err` — propagated or minted — is `"err"`.
    let runOutcome: ThetaRunOutcome = "ok";
    const emitErr = (error: QueryError, provenance?: ErrProvenance, fnTail?: FnTail): void => {
      const kind = (error as { readonly kind?: unknown } | null | undefined)?.kind;
      runOutcome = kind === "cancelled" ? "cancelled" : "err";
      emitEnvelope(serializeErrEnvelope(error, provenance, fnTail));
      emitOutcome("err");
    };

    // RFC 0012 §10: a `fn` entry runs one of this theta's `subagent fn`s as the
    // process-root invocation instead of the theta body (dispatched below).
    const entry = this.#input.subagentControlPlane?.entry ?? THETA_LAUNCH_ENTRY;
    const model = ctx.model;
    if (!this.#confirmChildModelOrRefuse(theta, entry, model, calleePath, emitErr)) {
      return runOutcome;
    }

    if (entry.kind === "fn") {
      await this.#driveSubagentFnEntry(bindInput, entry.name, calleePath, emitEnvelope, emitErr, emitOutcome);
      return runOutcome;
    }

    // PIC-60 (child-side): intake and bind the marshalled params; `undefined`
    // means the intake refused and the refusal already went out through the
    // envelope inside the helper.
    const paramBindings = this.#bindMarshalledRootParams(theta, calleePath, emitErr);
    if (paramBindings === undefined) {
      return runOutcome;
    }
    const rootBindInput: ConversationBindInput = {
      ...bindInput,
      ...(paramBindings.size > 0 ? { paramBindings } : {}),
    };

    // PIC-58: drive the root theta against the child process's own host session
    // with PROMPT-MODE driver mechanics while applying the subagent frontmatter
    // contract (its `system:` was installed via `--system-prompt` at launch; the
    // callable set governs the child session's active tools). The binding runs
    // the body in-process against the child's session.
    const binding = this.#deps.bindPromptConversation(rootBindInput);
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
        this.#emitOkEnvelopeGuarded(terminal.value, calleePath, ctx, emitEnvelope, emitErr, emitOutcome);
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
    return runOutcome;
  }

  /**
   * PIC-60 (child-side): intake the marshalled params from the child env,
   * validate them against the callee's `params:` schema, and bind them DIRECTLY
   * (the binder is bypassed on the marshalled path). A parse / schema-validation
   * failure refuses the invocation fail-closed, reports it through the
   * envelope as Err(InvokeInfraError{cause:"validation"}), and answers
   * `undefined`.
   */
  #bindMarshalledRootParams(
    theta: ConversationBindInput["theta"],
    calleePath: string,
    emitErr: (error: QueryError, provenance?: ErrProvenance, fnTail?: FnTail) => void,
  ): Map<string, ThetaValue> | undefined {
    const intake = this.#intakeSubagentRootParams(theta);
    if (!intake.ok) {
      (this.#input.emitDiagnostic ?? ((): void => {}))(intake.diagnostic);
      emitErr({ ...intake.error, callee_path: calleePath } as unknown as QueryError, "mint");
      return undefined;
    }
    // `intake.params` is `undefined` when no params carrier was marshalled (a
    // callee with no `params:` / a no-arg invocation) — an empty binding set.
    // runtime-value-model.md §"Wire-name translation" names binder `args` as an
    // inbound boundary, and the marshalled child-side intake is that boundary's
    // other projection: it validated against the same lowered `params:`
    // document, so it performs the same pass before binding.
    return intake.params !== undefined && intake.params !== null
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
  }

  /**
   * BOTH child drives' Ok-arm envelope settlement (the theta-root body and a
   * `subagent fn` entry, which also threads its recovered `fn_tail`).
   * PIC-59: refuse before writing
   * the envelope, so no invoke parent ever binds a value the callee did not
   * produce — JSON has no form for a non-finite `number`, and
   * `JSON.stringify` would otherwise substitute `null` for it unnoticed.
   * Depth is the FIRST sub-check (bug 0187 §Fix (b)): a payload past ceiling
   * #4's cap refuses whatever it carries, so ordering depth first costs the
   * non-finite search nothing — such a `>cap` payload never reaches it. Both
   * walks now descend a `Result`'s wire form as a record (bug 0201 §Fix (a)),
   * so this ordering also decides which refusal a carrier-nested payload
   * takes. PIC-59's *Result-carriage bound*
   * (`docs/spec_topics/pi-integration-contract/subagent.md`,
   * `#subagent-envelope-result-carriage-bound`) states that reach. The depth
   * refusal emits NO diagnostic (no registry row exists for a ceiling-#4
   * breach at this boundary); 0180's non-representability refusal below keeps
   * its own registered code.
   */
  #emitOkEnvelopeGuarded(
    value: unknown,
    calleePath: string,
    ctx: ExtensionCommandContext,
    emitEnvelope: (line: string) => void,
    emitErr: (error: QueryError, provenance?: ErrProvenance, fnTail?: FnTail) => void,
    emitOutcome: (outcome: SubagentChildOutcome) => void,
    tail?: FnTail,
  ): void {
    const tooDeep = mapTooDeepReturnValue(value, calleePath);
    const nonRepresentable =
      tooDeep === undefined ? mapNonRepresentableReturnValue(value, calleePath) : undefined;
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
        serializeOkEnvelope(value, collectForwardedEnumTags(value as ThetaValue), tail),
      );
      // RFC 0012 §7: outcome BEFORE the shutdown request, so a
      // subscriber can enqueue its last report before the host begins
      // deferring toward shutdown.
      emitOutcome("ok");
      this.#requestVisibleChildShutdown(ctx);
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
    const binding = this.#deps.bindPromptConversation({
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
      this.#emitOkEnvelopeGuarded(payload, calleePath, ctx, emitEnvelope, emitErr, emitOutcome, tail);
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
    const lookupEnv = thetaLookupEnvironment(theta);
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
  resolveSubagentFnChild(
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
        const guard = pushCountableFrameOrRefuse(chain, "subagent-fn", calleePath);
        if (guard.kind === "refused") {
          return Promise.resolve(guard.refusal);
        }
        const childChain: InvokeChain = guard.chain;
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
    const argGuard = this.#guardSubagentFnArgs(calleePath, request.args, ctx, rawCwd);
    if ("source" in argGuard) {
      return argGuard;
    }
    const { resolvedCwd } = argGuard;
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
      // RFC 0015 (D7): the fn call's residence-keyed site rides the spawn path
      // so the bus stamps the child's launchSite race-free (fn spawns publish
      // no invoke-kind trace — this carriage is their only source).
      launchSite: request.site,
      label: `${theta.slashName}#${fn.name}`,
      ...(parentInvocationId !== undefined ? { parentInvocationId } : {}),
      ...(resolvedCwd !== undefined ? { resolvedCwd } : {}),
    });
    return this.#driveAndValidateFnChild(binding, theta, request, calleePath);
  }

  /**
   * The argument-boundary guards of `#driveSubagentFnChild`: ceiling #4 at the
   * argument boundary — per positional argument, as `#driveCallee` walks an
   * `invoke(...)` argument (CIO-3) — then INV-6 validation and resolution of
   * the call site's `with { cwd }` clause. Answers the boundary-minted refusal,
   * or the resolved cwd (`undefined` when the clause is absent).
   */
  #guardSubagentFnArgs(
    calleePath: string,
    args: readonly ThetaValue[],
    ctx: ExtensionCommandContext,
    rawCwd: ThetaValue | undefined,
  ): (DrivenInvokeResult & { readonly fnTail: undefined }) | { readonly resolvedCwd: string | undefined } {
    for (const argValue of args) {
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
    return { resolvedCwd };
  }

  /**
   * The drive-and-validate half of `#driveSubagentFnChild`: await the spawned
   * child binding's `drive()`, FN-6-validate the returned value at the
   * boundary, and tear the child down on every exit path.
   */
  async #driveAndValidateFnChild(
    binding: ConversationBinding,
    theta: ConversationBindInput["theta"],
    request: SubagentFnChildRequest,
    calleePath: string,
  ): Promise<DrivenInvokeResult & { readonly fnTail: FnTail | undefined }> {
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
      const validated = this.#deps.validateInvokeReturn(
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
}
