// The `V11a` frontmatter binder run for the production producer
// (production-theta-producer.ts): classify the load-time bypass, resolve the
// binder model, drive the budgeted OFF-session forced-tool binder call,
// merge declared defaults behind the post-merge AJV boundary, and emit the
// binder system notes (BND-1 echo, SLSH-1 overflow, failure modes) — extracted
// verbatim from `ProductionThetaProducer`, which delegates `runBinder` here
// over its own input and system-note channel.
//
// Spec (narrative): binder/binder-model-and-context.md, binder-inference.md,
// binder-bypass-and-envelope.md, defaulting-system-note-echo.md,
// slash-invocation.md.

import type { Api, AssistantMessage, Model, ProviderResponse } from "@earendil-works/pi-ai";
// pi-ai 0.80.x moved the streaming free functions off the package root into
// the publicly-exported `/compat` subpath (package.json `exports["./compat"]`
// -> dist/compat.d.ts); the root barrel no longer re-exports `complete`.
import { complete } from "@earendil-works/pi-ai/compat";
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import { runBinderCallWithCancellation } from "../binder/binder-cancellation";
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
import { matchAvailableModel } from "../binder/binder-model";
import { deriveBinderSeed } from "../binder/binder-seed";
import {
  buildBinderSystemPrompt,
  type SystemPromptParamField,
} from "../binder/binder-system-prompt";
import {
  customTypeUnsafeDiagnostic,
  renderCompactTranscript,
  renderCustomTypeUnsafeNote,
} from "../binder/compact-transcript";
import { fillDefaultsAndRevalidate, type DefaultedField } from "../binder/defaulting";
import {
  binderSupportsApi,
  binderUnsupportedApiMessage,
  isForcedToolChoiceRejection,
} from "../binder/forced-tool-choice";
import { classifyProviderResponse } from "../binder/provider-error-mapping";
import {
  renderBinderSystemNote,
  binderFailureMessage,
  type BinderArgsClassification,
  type BinderAttemptOutcome,
  type BinderFailureSurface,
} from "../binder/retry-taxonomy";
import { walkSessionContext } from "../binder/session-context-walk";
import { capSystemNote, classifyModelContent } from "../binder/system-note";
import { coerceUnderlyingString } from "../diagnostics/placeholder";
import { projectRenderedParamType } from "../parser/params";
import { parseExpressionSource } from "../parser/theta-document";
import { renderArgumentEcho, type EchoParam } from "../render/argument-echo";
import type { ActiveInvocationTicket } from "../runtime/active-invocation-registry";
import { createThetaAbort } from "../runtime/cancellation-core";
import { runCheckpointedBinderCall } from "../runtime/checkpoint-granularity";
import { summariseErrorField } from "../runtime/err-field-summary";
import { evaluatePureExpression } from "../runtime/pure-expression-evaluator";
import { isThetaPanic } from "../runtime/runtime-panics";
import type { RuntimeEvent } from "../runtime/runtime-event-channel";
import { buildRuntimeEventNote } from "../runtime/runtime-event-channel";
import { renderNoParamsOverflowNote } from "../runtime/slash-dispatch";
import { respondSchemaSlug } from "../runtime/typed-query-validation";
import type { ThetaValue } from "../runtime/value";
import { projectForValidation } from "../runtime/wire-translation";
import type { CheckpointSite } from "../seams/checkpoint";
import type { CompiledValidator } from "../seams/schema-validator";
import { echoTypeFromValue } from "./binder-echo-type";
import { thetaLookupEnvironment } from "./callable-lowering";
import { decorateCheckpoint } from "./execution-status/checkpoint-decorator";
import { OFF_SESSION_NORMAL_STOP_REASONS } from "./live-prompt-query-driver";
import type { ProductionProducerInput } from "./production-theta-producer";
import { sendSystemNote, type SystemNoteChannelDeps } from "./system-note-channel";
import type {
  BinderRunInput,
  BinderRunResult,
  ConversationBindInput,
} from "./theta-composition-producer";

/**
 * The producer collaborators the extracted binder run reaches back through:
 * the construction input (model registry, runtime root, status bus) and the
 * two system-note seams that stay on `ProductionThetaProducer` because every
 * other note on the instance rides the same resolution (bug 0437).
 */
export interface BinderRunnerDeps {
  /** The producer's construction input (`ProductionThetaProducer`'s `#input`). */
  readonly input: ProductionProducerInput;
  /** The producer's `#systemNoteChannel` resolution (bug 0437 §Fix). */
  readonly systemNoteChannel: () => SystemNoteChannelDeps;
  /** The producer's `#buildGroupAEventOrFallback` group-A clock guard (bug 0437 §Fix). */
  readonly buildGroupAEventOrFallback: (
    content: string,
    buildEvent: () => RuntimeEvent,
    channel: SystemNoteChannelDeps,
  ) => RuntimeEvent | undefined;
}

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
 * The `V11a` frontmatter binder run, one instance per
 * `ProductionThetaProducer` (constructed with it; no cross-invocation mutable
 * state). `runBinder` is the producer's `ThetaProducerDeps.runBinder` body,
 * moved verbatim; `recoverDeclaredDefaults` stays reachable for the invoke
 * machinery's omitted-defaulted recovery (bug 0409).
 */
export class BinderRunner {
  readonly #input: ProductionProducerInput;
  readonly #deps: BinderRunnerDeps;

  constructor(deps: BinderRunnerDeps) {
    this.#input = deps.input;
    this.#deps = deps;
  }

  /** The producer's extension-instance `theta-system-note` channel (bug 0437 §Fix). */
  #systemNoteChannel(): SystemNoteChannelDeps {
    return this.#deps.systemNoteChannel();
  }

  /** The producer's group-A clock guard (bug 0437 §Fix, runtime-event-channel.md). */
  #buildGroupAEventOrFallback(
    content: string,
    buildEvent: () => RuntimeEvent,
    channel: SystemNoteChannelDeps,
  ): RuntimeEvent | undefined {
    return this.#deps.buildGroupAEventOrFallback(content, buildEvent, channel);
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
    const bypass = this.#applyBinderBypassOrNull(binderInput, params);
    if (bypass !== null) {
      return bypass;
    }
    const model = this.#resolveBinderModelOrRefuse(binderInput);
    if (model === null) {
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
    const dispatch = this.#buildBinderDispatch(model, envelopeSchema, sessionContext, params, binderInput);
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
    return this.#settleBinderOutcome(binderInput, params, call.okArgs);
  }

  /**
   * Load-time bypass classification (§Binder bypass): the no-params and
   * single-string bypasses skip the binder call (and the LLM inference)
   * entirely and the body runs with the trivially-derived args — the returned
   * result. `null` means a `binder` decision: only that drives a real binder
   * pass in `runBinder`.
   */
  #applyBinderBypassOrNull(
    binderInput: BinderRunInput,
    params: NonNullable<ConversationBindInput["theta"]["frontmatter"]["params"]>,
  ): BinderRunResult | null {
    const decision = classifyBinderBypass(params.fields);
    if (decision.kind === "binder") {
      return null;
    }
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

  /**
   * Resolve the binder model and run the pre-dispatch api gate for a genuine
   * binder pass over the declared params; `null` means the pass was refused
   * (the failure note is already emitted) and the theta body does not run.
   *
   * DECISION (production conformance): the binder runs OFF-session and
   * INVISIBLE — no user-visible streamed turn, no transcript card, and the
   * envelope JSON NEVER reaches the user session (BND-3). It runs against the
   * RESOLVED BINDER MODEL (`bind_model:` → `theta.binderModel`, resolved at
   * load time and carried on the theta), NOT the ambient session model
   * (DISCO-1 runtime facet). The reference is resolved to a concrete
   * `Model<Api>` via the model registry by the same exact-match rule the
   * load-time resolution used, so `model === undefined` is a defensive guard
   * only. WHAT MAKES IT UNREACHABLE IS THE DISPATCH, NOT THE LOAD GATE: the
   * load gate exempts one registered non-bypass theta from binder-model
   * resolution — the marked root of a spawned subagent child
   * (binder-model-and-context.md §"Binder model", the subagent-root exemption)
   * — so a registered non-bypass theta CAN reach the runtime carrying no
   * binder model. It cannot reach HERE, because the slash `run` in
   * `theta-composition-producer.ts` gates `driveSubagentRootRegime` on
   * `isSubagentRootFor` ahead of `runBinder` and returns; the exempt set and
   * the short-circuited set are one set, held together by that single
   * predicate.
   */
  #resolveBinderModelOrRefuse(binderInput: BinderRunInput): Model<Api> | null {
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
      return null;
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
    // binder-call checkpoint in `#runBudgetedBinderCall`, not an
    // unsupported-api transport note (the abort is the higher-priority
    // pre-dispatch guard, CANCEL-4).
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
      return null;
    }
    return model;
  }

  /**
   * Assemble the per-dispatch forced-tool call ingredients (binder-inference.md
   * §"Binder inference call"), built once and reused across every budgeted
   * attempt: the slug is content-addressed over the TRUE anyOf envelope
   * document (not its object attachment wrapper) by the same recipe the
   * typed-query respond tool name uses; the seed is the FNV-1a hash of the
   * bare command name; the V11d system prompt carries the whole variable
   * binding context (theta identity, parameters, raw arguments, and the
   * BNDR-10 session-context block), so the single user message stays the
   * fixed literal. The envelope validator compiles AT MOST once per dispatch
   * and is reused across attempts, deferred to the first extraction so the
   * checkpoint-gated pre-call abort path performs no validator work.
   */
  #buildBinderDispatch(
    model: Model<Api>,
    envelopeSchema: BinderEnvelopeSchema,
    sessionContext: { readonly kind: "none" } | { readonly kind: "block"; readonly body: string },
    params: NonNullable<ConversationBindInput["theta"]["frontmatter"]["params"]>,
    binderInput: BinderRunInput,
  ): BinderForcedToolDispatch {
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
    return {
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
  }

  /**
   * Settle a successful binder envelope: merge declared defaults, route on the
   * post-merge AJV verdict, and emit the BND-1 success echo.
   *
   * §Defaulting (defaulting-system-note-echo.md#post-default-merge-ajv-validation;
   * binder-bypass-and-envelope.md#binder-envelope): defaults are filled by the
   * runtime AFTER the binder returns, not by the binder. The binder is told
   * which fields have defaults and MAY omit them from `args`; the runtime then
   * fills any defaulted wire name absent from `args` (fill-if-absent) and
   * AJV-validates the merged result before the body runs. Without this merge a
   * declared default (`count: integer = 3`) never reaches body scope and the
   * body sees the field as absent (BND-2). Only the genuine binder pass reaches
   * here — a defaulted field forces the `binder` classification (the
   * single-string / no-params bypasses carry no defaults), so the bypass arms
   * in `#applyBinderBypassOrNull` are intentionally left unchanged.
   */
  async #settleBinderOutcome(
    binderInput: BinderRunInput,
    params: NonNullable<ConversationBindInput["theta"]["frontmatter"]["params"]>,
    binderArgs: Record<string, unknown>,
  ): Promise<BinderRunResult> {
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
      // a value for (`recoverDeclaredDefaults`'s best-effort arms) is absent
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
        : await this.recoverDeclaredDefaults(theta, params.defaultedFields);
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
  async recoverDeclaredDefaults(
    theta: ConversationBindInput["theta"],
    defaultedFields: readonly string[],
  ): Promise<readonly DefaultedField[]> {
    const fieldsByWireName = new Map(
      (theta.frontmatter.params?.fields ?? []).map((field) => [field.wireName, field] as const),
    );
    const env = thetaLookupEnvironment(theta);
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
}
