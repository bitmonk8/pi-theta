// H8a — the production `LoomProducerDeps` for the shipped composition root.
//
// The `V19e` composition producer (`composeLoomFixture`) maps a parsed `.loom`
// to a runnable `LoomFixture` by composing three injected collaborators:
//
//   - `runBinder` — the `V11a` frontmatter binder over the slash arguments,
//     run before the loom interpreter; a non-binding envelope short-circuits;
//   - `bindPromptConversation` — bind `V19d`'s effectful executor to the shared
//     user session (`V12a`/`V9c`) so `@`-queries drive real user-visible turns;
//   - `spawnSubagentConversation` — spawn an isolated `AgentSession` (`V9i`) and
//     bind the executor to that private session for subagent-mode looms.
//
// This module assembles those collaborators against the live host `pi` surface
// and the runtime root's seams, so the shipped extension drives real
// prompt-mode / typed / subagent turns.
//
// Spec (narrative): pi-integration-contract/extension-bootstrap-and-per-loom.md
// (§"Per-loom registration"), conversation-drive.md, slash-invocation.md,
// binder/binder-model-and-context.md, subagent.md.

import type {
  AgentSession,
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
  buildSessionContext,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
  attachSubagentAbortForwarding,
  awaitTerminalAgentEnd,
  extractSubagentQueryResult,
  makeIdempotentDispose,
  type AgentEndEvent,
  type GlobalEventBus,
  type SubagentEventSource,
  type SubagentSessionEvent,
} from "../runtime/subagent-isolation";
import type { Api, AssistantMessage, Message, Model } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai";
import type { Clock } from "../seams/clock";
import type { RuntimeRoot } from "../runtime-root";
import type {
  BinderRunInput,
  BinderRunResult,
  ConversationBinding,
  ConversationBindInput,
  LoomCompositionInput,
  LoomProducerDeps,
} from "./loom-composition-producer";
import type {
  EffectfulStatementHostDeps,
  QueryHostDispatch,
} from "../runtime/effectful-statement-host";
import { createEffectfulStatementHost } from "../runtime/effectful-statement-host";
import { buildEnvironment, type LexicalEnvironment } from "../runtime/lexical-environment";
import { executeBody, type BodyExecution, type ExecuteBodyDeps } from "../runtime/statement-executor";
import { extractTrailingTurnText } from "../runtime/conversation-drive";
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
import type { CommittedSideEffect } from "../runtime/no-rollback";
import type { InvokeChild } from "../runtime/invoke-cancellation";
import type { InvokeInfraError } from "../runtime/query-error";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../runtime/terminal-outcomes";
import { makeCancelledError } from "../runtime/cancellation-core";
import { makeErr, makeOk, valuesEqual, type LoomValue, type ResultValue } from "../runtime/value";
import { evaluateStringMember } from "../runtime/stdlib-string";
import { evaluateArrayMember } from "../runtime/stdlib-array";
import { evaluateObjectMember } from "../runtime/stdlib-object";
import type { CallExpr, Expr, InvokeExpr, LoomBody, QueryExpr, SchemaDecl } from "../parser/loom-document";
import { lowerQueryResponseSchema } from "../runtime/query-schema-lowering";
import type { LoweredSchema } from "../seams/schema-validator";
import type { TypedQuerySchemaValidation } from "../runtime/query-tool-loop";
import {
  buildTypedQueryValidation,
  parseStructuredPayload,
  payloadForRespond,
} from "../runtime/typed-query-validation";
import { evaluateIndexAccess, evaluateMemberAccess } from "../runtime/runtime-panics";
import { lexQueryTemplate, renderTemplateText } from "../render/query-render";
import {
  applyBinderBypass,
  buildBinderEnvelopeSchema,
  classifyBinderBypass,
} from "../binder/binder-envelope";

/**
 * H8b: one resolved host Pi tool the code-side tool-call path dispatches
 * `execute` against. `execute` invokes the host tool's `execute(...)` and maps
 * its `AgentToolResult` to the loom-load-bearing `AgentToolResultEnvelope`
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

/** Construction inputs for the production per-loom producer collaborators. */
export interface ProductionProducerInput {
  /** The live host extension API (turn drive, message send, command surface). */
  readonly pi: ExtensionAPI;
  /** The runtime root over the real host seams (schema validator, clock, …). */
  readonly root: RuntimeRoot;
  /** The host model registry (binder-model resolution, structured-output turns). */
  readonly modelRegistry: ModelRegistry;
  /**
   * H8b: resolve a Pi-tool name from the loom's callable set (frontmatter
   * `tools:`) to its `execute` dispatch, or `undefined` when the name is not a
   * known host tool. Constructed at the composition root over the live host
   * `cwd` / `ctx`. Absent on non-production harnesses, in which case a code-side
   * `<name>(args)` call surfaces `Err(CodeToolError{cause:"execution"})` for the
   * unknown host tool rather than fabricating a value.
   */
  readonly resolvePiTool?: (name: string) => PiToolDispatch | undefined;
  /**
   * H8b: parse a `.loom`-callable / `invoke(...)` callee referenced from
   * `callerPath` into a runnable composition input (resolving the callee path
   * against the caller's directory), or `undefined` when the callee is missing
   * / unparseable. Constructed at the composition root over the real
   * `FileSystem` seam and the shared parser deps.
   */
  readonly parseCallee?: (
    callerPath: string | undefined,
    calleePath: string,
  ) => Promise<LoomCompositionInput | undefined>;
}

/**
 * Assemble the production `LoomProducerDeps` the shipped composition root
 * injects into `composeLoomFixture` for every discovered `.loom`.
 */
export function createProductionProducerDeps(
  input: ProductionProducerInput,
): LoomProducerDeps {
  return new ProductionLoomProducer(input);
}

/**
 * PIC-40. Raised (a specific type, never a broad throw) when a subagent-mode
 * loom is dispatched with no resolvable model: frontmatter `model:` is absent
 * and the inherited `ctx.model` is `undefined`, so `createAgentSession` cannot
 * be called. The shipped acceptance host pins `--model`, so this branch is not
 * reached there; it keeps the no-model gap explicit rather than spawning a
 * modelless session.
 */
class SubagentModelUnresolvedError extends Error {}

/** A fresh `ToolLoweringSink` that discards every channel — the test looms carry no code-tool calls. */
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
 * user session's committed transcript is Pi-owned and never rewritten by loom.
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

/** The basename of a `.loom`-callable path, minus its `.loom` extension. */
function loomCallableName(path: string): string {
  const base = path.slice(path.replace(/\\/g, "/").lastIndexOf("/") + 1);
  return base.endsWith(".loom") ? base.slice(0, -".loom".length) : base;
}

/**
 * The production per-loom producer. Constructed once per `session_start`
 * discovery pass and shared across every discovered loom's `composeLoomFixture`
 * call; it holds only its injected collaborators (no cross-invocation mutable
 * state), constructing a fresh conversation binding per dispatch.
 */
class ProductionLoomProducer implements LoomProducerDeps {
  readonly #input: ProductionProducerInput;

  constructor(input: ProductionProducerInput) {
    this.#input = input;
  }

  async runBinder(binderInput: BinderRunInput): Promise<BinderRunResult> {
    // The `V11a` frontmatter binder binds typed `params:` from the slash
    // arguments before the interpreter. A loom with no `params:` (or one whose
    // block did not lower cleanly) has nothing to bind, so the bind step is a
    // no-op and the body runs unconditionally.
    const params = binderInput.loom.frontmatter.params;
    if (params === undefined || params.loweredSchema === undefined) {
      // A loom with no declared `params:` has nothing to bind: the body runs
      // with an empty params object (no slots installed).
      return { bound: true, args: {} };
    }
    // Load-time bypass classification (§Binder bypass): the no-params and
    // single-string bypasses skip the binder call (and the LLM inference)
    // entirely and the body runs with the trivially-derived args. Only a
    // `binder` decision drives a real binder pass.
    const decision = classifyBinderBypass(params.fields);
    if (decision.kind !== "binder") {
      // The bypass args are derived without any binder / LLM call and threaded
      // into body scope (the single-string bypass sets the sole field to the
      // trimmed slash-argument string; the no-params bypass yields `{}`).
      const bypass = applyBinderBypass({ decision, slashArguments: binderInput.args });
      return { bound: true, args: bypass.args };
    }
    // A genuine binder pass over the declared params: construct the per-loom
    // three-arm envelope schema (§Binder envelope) and drive ONE user-visible
    // streamed turn that instructs the model to bind the raw slash arguments
    // into the params object, emitting ONLY the minified envelope JSON. Under
    // `pi -p` the streamed assistant text prints on stdout, so the envelope is
    // the first JSON object the acceptance runner observes (the binder runs
    // before the loom body).
    const envelopeSchema = buildBinderEnvelopeSchema({
      paramsSchema: params.loweredSchema,
      defaultedFields: params.defaultedFields,
    });
    const prompt = renderBinderTurnPrompt({
      slashName: binderInput.loom.slashName,
      args: binderInput.args,
      paramsSchema: params.loweredSchema,
      defaultedFields: params.defaultedFields,
      envelopeSchema,
    });
    const text = await driveStreamedUserTurn({
      pi: this.#input.pi,
      ctx: binderInput.ctx,
      clock: this.#input.root.clock,
      queryText: prompt,
    });
    // The loom body runs only on the `ok` arm; `needs_info` / `ambiguous`
    // short-circuit (the loom body never runs). A reply that does not parse as
    // an envelope object also short-circuits rather than throwing, so the run
    // still exits cleanly (the printed reply is what the runner scores). On the
    // `ok` arm the parsed envelope's `args` object is threaded into body scope.
    if (!isOkEnvelope(text)) {
      return { bound: false };
    }
    return { bound: true, args: await parseOkEnvelopeArgs(text) };
  }

  bindPromptConversation(bindInput: ConversationBindInput): ConversationBinding {
    const { pi, root } = this.#input;
    const { loom, ctx } = bindInput;

    // The `loomAbort`-equivalent signal the executor and every checkpoint gate
    // on: the dispatch context's signal when the agent is streaming, else a
    // fresh non-aborting controller so a straight-line run is never spuriously
    // cancelled.
    const signal = ctx.signal ?? new AbortController().signal;

    // The user session's resolved chronological message list — the PIC-53
    // trailing-turn read surface. Recomputed per read from the live
    // `ReadonlySessionManager` so each turn's freshly-committed assistant text
    // is visible.
    const readMessages = (): readonly Message[] =>
      buildSessionContext(
        ctx.sessionManager.getEntries(),
        ctx.sessionManager.getLeafId(),
      ).messages as unknown as readonly Message[];

    // Only the first query in a dispatch drives a user-visible streamed turn
    // (SLSH-2); any subsequent query in the same body is a chained follow-up run
    // off-session (`complete()`, no transcript card, PIC-51-style out-of-band).
    // This keeps exactly one turn streamed per dispatch so a body's trailing
    // query cannot interleave its stream with the primary turn's. See the module
    // header / status DIVERGENCE: a fuller design would stream every prompt-mode
    // turn, which the shipped acceptance looms do not require.
    let queryOrdinal = 0;

    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint: root.checkpoint,
      signal,
      sink: noopSink(),
      file: loom.slashName,
      evaluatePure: (expr, env) => evaluatePureExpression(expr, env),
      resolveQuery: (expr, env) => {
        const userVisible = queryOrdinal === 0;
        queryOrdinal += 1;
        return this.#resolvePromptQuery(expr, env, {
          pi,
          ctx,
          loom,
          signal,
          readMessages,
          userVisible,
        });
      },
      resolveToolCall: (expr, env) => this.#resolveToolCall(expr, env, signal),
      resolveInvoke: (expr, env) => this.#resolveInvoke(loom, expr, env, ctx),
      classifyCall: (expr) => this.#classifyCall(loom, expr),
      resolveCallAsInvoke: (expr, env) => this.#resolveCallAsInvoke(loom, expr, env, ctx),
    };

    const executeDeps: ExecuteBodyDeps = {
      env: buildBoundEnvironment(loom.body, bindInput.paramBindings),
      host: createEffectfulStatementHost(hostDeps),
      checkpoint: root.checkpoint,
      signal,
      mutator: new NoopConversationMutator(),
      mode: "prompt",
    };

    return {
      drivenAgainst: "prompt-user-session",
      executeDeps,
      // PIC-53: the prompt-mode return value is the trailing turn's accumulated
      // assistant text of the driven user session.
      surface: (_execution: BodyExecution): ResultValue =>
        makeOk(extractTrailingTurnText(readMessages())),
    };
  }

  async spawnSubagentConversation(
    bindInput: ConversationBindInput,
  ): Promise<ConversationBinding> {
    const { root, modelRegistry } = this.#input;
    const { loom, ctx } = bindInput;

    // PIC-40 pre-spawn model guard: the subagent's resolved model is the loom's
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

    // `loomAbort` — the per-invocation cancel controller (cancellation.md §Signal
    // source). The mid-stream cancel fires through it and the one-shot PIC-41
    // listener forwards it into the spawned session's `abort()`; it is also the
    // single `signal` the interpreter's checkpoints gate on.
    const loomAbort = new AbortController();

    // PIC-23 spawn: an isolated in-memory `AgentSession`. A loom-suppressing
    // `DefaultResourceLoader` (no extensions/skills/prompts/themes/context files)
    // is used deliberately: it prevents the spawned session from re-loading this
    // very loom extension (which would recurse), and the hand-built adapter the
    // spec sketches cannot supply the `ExtensionRuntime` that
    // `LoadExtensionsResult.runtime` requires. See status DIVERGENCE.
    const agentDir = getAgentDir();
    const resourceLoader = new DefaultResourceLoader({
      cwd: ctx.cwd,
      agentDir,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd: ctx.cwd,
      agentDir,
      modelRegistry,
      model,
      // PIC-23 rule 2: an explicit (empty) allowlist suppresses Pi's default
      // built-ins; the test loom carries no callables.
      tools: [],
      customTools: [],
      resourceLoader,
      // PIC-23 rule 6 / capability item 3: a fresh in-memory manager — the
      // spawned transcript is private and discarded on dispose.
      sessionManager: SessionManager.inMemory(ctx.cwd),
    });

    // PIC-41: forward `loomAbort` into the spawned session via a one-shot
    // listener that calls `AgentSession.abort()`; PIC-9: an idempotent dispose
    // for the return-path teardown.
    const forwarding = attachSubagentAbortForwarding(loomAbort, session);
    const dispose = makeIdempotentDispose(session);

    const signal = loomAbort.signal;
    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint: root.checkpoint,
      signal,
      sink: noopSink(),
      file: loom.slashName,
      evaluatePure: (expr, env) => evaluatePureExpression(expr, env),
      resolveQuery: (expr, env) => {
        // A subagent `@`-query drives the freshly spawned private session via
        // `V9i`'s compliant completion driver: send the rendered query as one
        // real turn, await the terminal `agent_end`, and map
        // `extractSubagentQueryResult` onto the query loop's terminating turn.
        // A typed query conveys the declared JSON shape and parses the extracted
        // structured payload so a typed return crosses the subagent boundary
        // (FN-5); the `maxRounds: 0` boundary routes it straight to the
        // forced-respond terminator, mirroring the prompt-mode typed path.
        const typed = expr.schema !== null;
        // QRY-22: a typed subagent query drives respond-repair follow-ups as new
        // user turns against the SAME private session (never re-issuing the
        // original query), extracting each follow-up's reply text.
        const driveFollowUp = async (prompt: string): Promise<string> => {
          const terminal = await driveSubagentTurn(session, prompt);
          const followUp = extractSubagentQueryResult(terminal, {
            aborted: loomAbort.signal.aborted,
            provider: String(model.provider),
          });
          return followUp.ok ? followUp.value : "";
        };
        const validation = typed
          ? this.#buildTypedValidation(expr, env, loom, driveFollowUp)
          : undefined;
        return {
          typed,
          model: createSubagentQueryModel({
            driveTurn: () =>
              driveSubagentTurn(session, renderTypedAwareQueryText(expr, env, validation?.lowered)),
            loomAbort,
            provider: String(model.provider),
          }),
          config: {
            maxRounds: typed ? 0 : loom.frontmatter.toolLoop?.maxRounds ?? 25,
            querySite: {
              file: loom.slashName,
              line: expr.range.start.line,
              column: expr.range.start.column,
            },
            loomSlashName: loom.slashName,
            invocationId: root.idSource.newInvocationId(),
            occurredAt: root.clock.wallNow(),
          },
          ...(validation !== undefined
            ? { schemaValidation: validation.validation }
            : {}),
        };
      },
      resolveToolCall: (expr, env) => this.#resolveToolCall(expr, env, signal),
      resolveInvoke: (expr, env) => this.#resolveInvoke(loom, expr, env, ctx),
      classifyCall: (expr) => this.#classifyCall(loom, expr),
      resolveCallAsInvoke: (expr, env) => this.#resolveCallAsInvoke(loom, expr, env, ctx),
    };

    const executeDeps: ExecuteBodyDeps = {
      env: buildBoundEnvironment(loom.body, bindInput.paramBindings),
      host: createEffectfulStatementHost(hostDeps),
      checkpoint: root.checkpoint,
      signal,
      mutator: new NoopConversationMutator(),
      mode: "subagent",
    };

    return {
      drivenAgainst: "subagent-private-session",
      executeDeps,
      surface: (execution: BodyExecution): ResultValue => {
        // PIC-9 teardown on the return path: detach the one-shot abort listener
        // and dispose the spawned session (idempotent). The subagent's committed
        // turns are never mutated by the cancel (ERR-8 / ERR-12) — the executor's
        // cancel path routes through the inert `NoopConversationMutator`.
        forwarding.detach();
        dispose();
        // FN-5: surface the subagent body's terminal final value. On the success
        // path the produced value flows as `Ok`; a `?`-propagation fail carries
        // its `Err` payload, so the caller observes that `Err` (ERR-18); any
        // other fail / cancel surfaces the terminal cancellation `Err` rather
        // than a fabricated `Ok(null)`.
        if (execution.outcome === "success") {
          return makeOk(execution.result.value ?? null);
        }
        if (execution.outcome === "fail" && execution.error !== undefined) {
          return makeErr(execution.error);
        }
        return makeErr(makeCancelledError() as unknown as LoomValue);
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
      readonly loom: ConversationBindInput["loom"];
      readonly signal: AbortSignal;
      readonly readMessages: () => readonly Message[];
      readonly userVisible: boolean;
    },
  ): QueryHostDispatch {
    const { root } = this.#input;
    const typed = expr.schema !== null;
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
          })
        : offSessionComplete(deps.ctx.model, prompt);
    const validation = typed
      ? this.#buildTypedValidation(expr, env, deps.loom, driveFollowUp)
      : undefined;
    // A typed query instructs the model to emit only a JSON object of the
    // declared (lowered) shape, so its user-visible turn streams the structured
    // value as its assistant text (shared with the subagent path via
    // `renderTypedAwareQueryText`; an off-session typed turn's reply parses the
    // same).
    const queryText = renderTypedAwareQueryText(expr, env, validation?.lowered);

    const model = deps.userVisible
      ? new LivePromptQueryModel({
          pi: deps.pi,
          ctx: deps.ctx,
          clock: root.clock,
          queryText,
          readMessages: deps.readMessages,
        })
      : new OffSessionQueryModel({ model: deps.ctx.model, queryText });

    const config: QueryToolLoopConfig = {
      // A typed query dispatches only the forced-respond terminator (no
      // free-phase provider call), so its `max_rounds`-final branch fires at
      // typed-query start; an untyped query drives one user-visible free-phase
      // turn under the loom's configured cap.
      maxRounds: typed ? 0 : deps.loom.frontmatter.toolLoop?.maxRounds ?? 25,
      querySite: {
        file: deps.loom.slashName,
        line: expr.range.start.line,
        column: expr.range.start.column,
      },
      loomSlashName: deps.loom.slashName,
      invocationId: root.idSource.newInvocationId(),
      occurredAt: root.clock.wallNow(),
    };

    return {
      typed,
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
    loom: ConversationBindInput["loom"],
    driveFollowUp: (prompt: string) => Promise<string>,
  ): { readonly validation: TypedQuerySchemaValidation; readonly lowered: LoweredSchema } | undefined {
    if (expr.schema === null) {
      return undefined;
    }
    const lowered = lowerQueryResponseSchema(expr.schema, schemaDeclsOf(loom.body));
    if (lowered === undefined) {
      return undefined;
    }
    const validation = buildTypedQueryValidation({
      lowered,
      resolveShape: resolveDeclaredShape(expr, env),
      schemaValidator: this.#input.root.schemaValidator,
      attempts: loom.frontmatter.respondRepair?.attempts ?? 3,
      maxRounds: loom.frontmatter.toolLoop?.maxRounds ?? 25,
      driveFollowUp,
    });
    return { validation, lowered };
  }

  /**
   * H8b call-kind routing. A `<name>(args)` call whose callee resolves to a
   * `.loom`-callable in the loom's callable set (frontmatter `tools:`) is
   * semantically an invoke; every other call is a Pi tool. The resolution is
   * against the callable set alone — a name bound to a `./x.loom` entry routes
   * to the invoke spawn-and-drive path, all else to the tool-`execute` path.
   */
  #classifyCall(
    loom: ConversationBindInput["loom"],
    expr: CallExpr,
  ): "pi-tool" | "loom-callable" {
    return loomCalleePath(loom, expr.callee) !== undefined ? "loom-callable" : "pi-tool";
  }

  /**
   * H8b live tool-call resolver. Resolve `expr.callee` against the host tool set
   * and return a `CodeSideToolCall` whose `dispatch()` invokes the host tool's
   * `execute(...)` (V14g lowering turns a clean resolve into `Ok(text)`, a throw
   * into `Err(CodeToolError{cause:"execution"})`). An unresolved host tool name
   * throws `UnknownHostToolError` from `dispatch()`, lowering to the execution
   * `Err` rather than fabricating a value.
   */
  #resolveToolCall(expr: CallExpr, env: LexicalEnvironment, signal: AbortSignal): CodeSideToolCall {
    const toolName = expr.callee;
    const resolve = this.#input.resolvePiTool;
    const tool = resolve?.(toolName);
    const params = lowerToolCallParams(expr, env);
    const toolCallId = `loom-direct:${this.#input.root.idSource.newInvocationId()}`;
    return {
      toolName,
      committed: [],
      dispatch: (): Promise<AgentToolResultEnvelope> => {
        if (tool === undefined) {
          return Promise.reject(
            new UnknownHostToolError(`code-side call names no resolvable host tool '${toolName}'`),
          );
        }
        return tool.execute(toolCallId, params, signal);
      },
    };
  }

  /**
   * H8b live invoke resolver for an `invoke("./x.loom", ...args)` expression:
   * bind the positional args, resolve+parse the callee against the caller's
   * directory, spawn/drive it, and return its top-level `Result` (FN-5).
   */
  #resolveInvoke(
    loom: ConversationBindInput["loom"],
    expr: InvokeExpr,
    env: LexicalEnvironment,
    ctx: ExtensionCommandContext,
  ): InvokeChild {
    // `expr.args[0]` is the callee path literal; the remaining args are the
    // positional invocation arguments bound to the callee's params.
    const argValues = expr.args.slice(1).map((arg) => evaluatePureExpression(arg, env));
    return this.#buildInvokeChild(loom, expr.path, argValues, ctx);
  }

  /**
   * H8b live invoke resolver for a `.loom`-callable `<name>(args)` call: resolve
   * the callee path from the callable set, bind the positional args, and drive
   * the callee, returning its typed top-level `Result` across the boundary
   * (FN-5).
   */
  #resolveCallAsInvoke(
    loom: ConversationBindInput["loom"],
    expr: CallExpr,
    env: LexicalEnvironment,
    ctx: ExtensionCommandContext,
  ): InvokeChild {
    const calleePath = loomCalleePath(loom, expr.callee) ?? `./${expr.callee}.loom`;
    const argValues = expr.args.map((arg) => evaluatePureExpression(arg, env));
    return this.#buildInvokeChild(loom, calleePath, argValues, ctx);
  }

  /** Build the `InvokeChild` whose `drive()` parses, spawns, and drives the callee. */
  #buildInvokeChild(
    loom: ConversationBindInput["loom"],
    calleePath: string,
    argValues: readonly LoomValue[],
    ctx: ExtensionCommandContext,
  ): InvokeChild {
    return {
      calleePath,
      committed: [],
      drive: (): Promise<ResultValue> => this.#driveCallee(loom, calleePath, argValues, ctx),
    };
  }

  /**
   * Parse the callee `.loom`, spawn a fresh isolated subagent session for it
   * (V15l: a subagent callee spawns fresh; the caller's settings are not
   * inherited), bind the positional args onto its declared params, run its body
   * through the executor, and surface its top-level `Result` (FN-5). An
   * unparseable / missing callee surfaces `Err(InvokeInfraError{cause:
   * "load_failure"})` — never a fabricated `Ok(null)`.
   */
  async #driveCallee(
    loom: ConversationBindInput["loom"],
    calleePath: string,
    argValues: readonly LoomValue[],
    ctx: ExtensionCommandContext,
  ): Promise<ResultValue> {
    const callee = await this.#input.parseCallee?.(loom.sourcePath, calleePath);
    if (callee === undefined) {
      const error: InvokeInfraError = {
        kind: "invoke_infra",
        message: `invoke callee '${calleePath}' could not be loaded`,
        callee_path: calleePath,
        cause: "load_failure",
      };
      return makeErr(error as unknown as LoomValue);
    }
    const paramNames = callee.frontmatter.params?.fields.map((field) => field.wireName) ?? [];
    const paramBindings = new Map<string, LoomValue>();
    paramNames.forEach((name, index) => {
      paramBindings.set(name, argValues[index] ?? null);
    });
    const binding = await this.spawnSubagentConversation({
      loom: callee,
      args: "",
      ctx,
      paramBindings,
    });
    const execution = await executeBody(callee.body, binding.executeDeps);
    return binding.surface(execution);
  }
}

/**
 * The callable-set entry (a `./x.loom` path) that a call name resolves to, or
 * `undefined` when the name binds to no `.loom`-callable (so it is a Pi tool).
 */
function loomCalleePath(
  loom: ConversationBindInput["loom"],
  calleeName: string,
): string | undefined {
  const tools = loom.frontmatter.tools ?? [];
  return tools.find(
    (entry) => entry.endsWith(".loom") && loomCallableName(entry) === calleeName,
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
  body: LoomBody,
  paramBindings: ReadonlyMap<string, LoomValue> | undefined,
): LexicalEnvironment {
  const env = buildEnvironment({ body });
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

  constructor(deps: {
    readonly pi: ExtensionAPI;
    readonly ctx: ExtensionCommandContext;
    readonly clock: Clock;
    readonly queryText: string;
    readonly readMessages: () => readonly Message[];
  }) {
    this.#pi = deps.pi;
    this.#ctx = deps.ctx;
    this.#clock = deps.clock;
    this.#queryText = deps.queryText;
    this.#readMessages = deps.readMessages;
  }

  async nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    if (round === 0) {
      // SLSH-2: issue the rendered query as one streamed user-visible turn and
      // await its completion so the assistant text is committed before the
      // interpreter resumes. The driver requests no frontmatter tools, so the
      // model's reply is the terminating plain-text turn — the free phase
      // advances no further round.
      await this.#driveUserVisibleTurn();
      return { kind: "text", text: extractTrailingTurnText(this.#readMessages()) };
    }
    // No `tool_use` round was ever returned, so a round beyond the first cannot
    // be reached; a defensive terminating turn keeps the loop total.
    return { kind: "text", text: "" };
  }

  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    // The driver emits no `tool_use` batch (no frontmatter callable set is
    // installed for these looms), so no batch is ever executed.
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
    await this.#driveUserVisibleTurn();
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
  async #driveUserVisibleTurn(): Promise<void> {
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
    // PIC-17 active-set gating: install exactly the loom's callable set (empty
    // for these looms) for the query turn and restore the ambient set in a
    // `finally`, so the model answers the query directly instead of reaching for
    // ambient host tools (read / write / …). Ambient tools are deliberately not
    // inherited.
    const ambientTools = this.#pi.getActiveTools();
    this.#pi.setActiveTools([]);
    try {
      this.#pi.sendUserMessage(this.#queryText);
      await this.#pollWhile(() => this.#ctx.isIdle(), TURN_START_POLL_BOUND);
      await this.#pollWhile(() => !this.#ctx.isIdle(), TURN_END_POLL_BOUND);
      await this.#ctx.waitForIdle();
    } finally {
      this.#pi.setActiveTools(ambientTools);
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

  constructor(deps: { readonly model: Model<Api> | undefined; readonly queryText: string }) {
    this.#model = deps.model;
    this.#queryText = deps.queryText;
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
    return offSessionComplete(this.#model, this.#queryText);
  }
}

/** The off-session `complete()` path has no resolved model to dispatch against. */
class OffSessionModelUnavailableError extends Error {}

/** Construction inputs for the production subagent-mode `QueryModelDriver`. */
export interface SubagentQueryModelDeps {
  /**
   * Drive ONE real subagent turn against the private session and resolve to its
   * terminal (`willRetry: false`) `agent_end` event: `session.sendUserMessage`
   * then `V9i`'s session-local `awaitTerminalAgentEnd` (see `driveSubagentTurn`).
   * Injected so a test scripts the terminal event deterministically.
   */
  readonly driveTurn: () => Promise<AgentEndEvent>;
  /** The per-invocation cancel controller the loop's `signal` gates on. */
  readonly loomAbort: AbortController;
  /** The resolved-model provider, for `V9i`'s transport-failure `Err`. */
  readonly provider: string;
}

/**
 * Build the production subagent-mode `QueryModelDriver` (`V9i`): it drives a real
 * `@`-query turn against the freshly spawned isolated `AgentSession`, awaits the
 * terminal `agent_end`, and maps `extractSubagentQueryResult` onto the query
 * loop's terminating turn. On success the extracted trailing-turn assistant text
 * is the untyped query's plain-text result (or, for a typed query, the parsed
 * structured payload of the forced-respond terminator, so a typed return crosses
 * the subagent boundary — FN-5). `extractSubagentQueryResult`'s CONDITIONAL
 * short-circuits surface an `Err` only when they genuinely occur: a real
 * `loomAbort` abort (the `signal` the loop gates on) drives the cancellation
 * path; there is NO production driver self-cancel.
 */
export function createSubagentQueryModel(deps: SubagentQueryModelDeps): QueryModelDriver {
  return new SubagentQueryModel(deps);
}

class SubagentQueryModel implements QueryModelDriver {
  readonly #driveTurn: () => Promise<AgentEndEvent>;
  readonly #loomAbort: AbortController;
  readonly #provider: string;
  // The round-0 extraction result, cached so a bounce round does not re-drive a
  // second real subagent turn (per-invocation state, not module-level).
  #firstResult: ReturnType<typeof extractSubagentQueryResult> | undefined;

  constructor(deps: SubagentQueryModelDeps) {
    this.#driveTurn = deps.driveTurn;
    this.#loomAbort = deps.loomAbort;
    this.#provider = deps.provider;
  }

  async nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    if (round === 0) {
      const terminal = await this.#driveTurn();
      this.#firstResult = extractSubagentQueryResult(terminal, {
        aborted: this.#loomAbort.signal.aborted,
        provider: this.#provider,
      });
    }
    const result = this.#firstResult;
    if (result !== undefined && result.ok) {
      // PIC-43: on success the trailing-turn assistant text is the untyped
      // query's terminating plain-text turn.
      return { kind: "text", text: result.value };
    }
    // A non-`ok` extraction. A GENUINE cancellation aborted `loomAbort` (== the
    // loop's `signal`), so bounce one empty round; the loop's next round-boundary
    // cancellation checkpoint surfaces `Err(cancelled)`. A non-cancel (transport)
    // extraction cannot cross the untyped loop's outcome types (`text` /
    // `tool_loop_exhausted` / `cancelled`), so it degrades to
    // `tool_loop_exhausted` — an `Err`, never a false success; faithful transport
    // carriage on the untyped path is owned by `V13c` / `V9i`, out of scope here.
    return { kind: "tool_use", batch: [] };
  }

  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    // The bounced round carries an empty batch — no tool call executes.
    return Promise.resolve([]);
  }

  async forcedRespondTurn(): Promise<ForcedRespondTurn> {
    // A typed subagent query drives one turn, extracts its result, and parses the
    // extracted text as the candidate structured payload (mirroring the
    // prompt-mode `LivePromptQueryModel.forcedRespondTurn`) so the typed value
    // crosses the subagent boundary (FN-5).
    const terminal = await this.#driveTurn();
    const result = extractSubagentQueryResult(terminal, {
      aborted: this.#loomAbort.signal.aborted,
      provider: this.#provider,
    });
    if (result.ok) {
      const parse = await parseStructuredPayload(result.value);
      return { kind: "respond", payload: payloadForRespond(parse) };
    }
    // A genuine cancellation / transport failure carries no structured payload;
    // an inert `null` lets the typed loop's depth-walk / value projection yield
    // the absent value rather than a fabricated structured result.
    return { kind: "respond", payload: null };
  }
}

/**
 * Drive ONE real subagent turn against the private spawned session and resolve
 * to its terminal `agent_end` event. PIC-42: the completion is awaited via the
 * SESSION-LOCAL `subscribe` API (`awaitTerminalAgentEnd`), never the process-
 * global `pi.on`. The subscription is attached BEFORE the turn is sent so the
 * terminal event cannot be missed; the send is fire-and-forget (a late rejection
 * of an aborted turn is swallowed per Cancellation's swallowing-handler rule —
 * the terminal `agent_end` is the completion signal the driver resolves from).
 */
function driveSubagentTurn(session: AgentSession, queryText: string): Promise<AgentEndEvent> {
  const eventSource: SubagentEventSource = {
    subscribe: (listener) =>
      session.subscribe((event) => listener(event as unknown as SubagentSessionEvent)),
  };
  // The global bus is required by the seam signature but deliberately unused
  // (PIC-42 forbids it); an inert bus documents that it is never consulted.
  const inertGlobalBus: GlobalEventBus = { on: (): void => {} };
  const terminal = awaitTerminalAgentEnd(eventSource, inertGlobalBus);
  void session.sendUserMessage(queryText).catch(() => {});
  return terminal;
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

/** The loom body's `schema` declarations, for whole-file named-type resolution. */
function schemaDeclsOf(body: LoomBody): SchemaDecl[] {
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
 * drive: install the loom's (empty) callable set for the turn so the model
 * answers directly instead of reaching for ambient host tools, issue the
 * fire-and-forget `pi.sendUserMessage`, then observe the run through
 * `ctx.isIdle()` (wait for it to begin streaming, then to go idle again) and the
 * `ctx.waitForIdle()` completion barrier — all bounded on the injected `Clock`.
 */
async function driveStreamedUserTurn(deps: {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionCommandContext;
  readonly clock: Clock;
  readonly queryText: string;
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
  deps.pi.setActiveTools([]);
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
 * arguments into the loom's typed `params:` object and emit ONLY the minified
 * three-arm envelope JSON (`ok | needs_info | ambiguous`) validating against the
 * per-loom envelope schema — no prose, no markdown, no code fences.
 */
function renderBinderTurnPrompt(input: {
  readonly slashName: string;
  readonly args: string;
  readonly paramsSchema: Readonly<Record<string, unknown>>;
  readonly defaultedFields: readonly string[];
  readonly envelopeSchema: Readonly<Record<string, unknown>>;
}): string {
  const defaulted =
    input.defaultedFields.length > 0 ? input.defaultedFields.join(", ") : "(none)";
  return (
    `You are the argument binder for the loom slash command /${input.slashName}. ` +
    `Bind the raw slash-command arguments to the loom's typed parameters.\n\n` +
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
 * Whether the binder reply is the `ok` envelope arm (the loom body runs only on
 * `ok`; a `needs_info` / `ambiguous` reply short-circuits). This is a tolerant,
 * NON-throwing structural read of the `kind` discriminator on the streamed
 * reply text — never a `JSON.parse` (whose malformed-input throw would need a
 * forbidden broad `catch` here). The acceptance test performs the authoritative
 * envelope schema validation on the streamed JSON; this gate only routes
 * body-run vs short-circuit, so matching the `"kind":"ok"` discriminator on the
 * reply is sufficient and cannot throw.
 */
function isOkEnvelope(text: string): boolean {
  return /"kind"\s*:\s*"ok"/.test(text);
}

/**
 * Extract the `ok` envelope's `args` object from the streamed binder reply,
 * NON-throwing: it reuses the `V13e` `parseStructuredPayload` (a promise
 * rejection handler, never a broad `catch`). A reply that does not parse as a
 * JSON object, or an `ok` envelope carrying no `args` object, yields `{}` (the
 * body still runs on the `ok` arm, with no param slots). The authoritative
 * envelope schema validation lives in the acceptance runner.
 */
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
 * resolve each interpolation path against the environment, and apply the QRY-7
 * newline-trim → dedent normalisation. A path interpolation resolves its head
 * identifier against the environment and walks the remaining `.field` segments.
 */
function renderQueryText(expr: QueryExpr, env: LexicalEnvironment): string {
  const lexed = lexQueryTemplate(expr.template);
  let text = "";
  for (const part of lexed.parts) {
    if (part.kind === "text") {
      text += part.value;
      continue;
    }
    text += stringifyPathValue(resolveInterpolationPath(part.exprSource, env));
  }
  return renderTemplateText(text);
}

/** Resolve a `Ident ('.' Ident)*` interpolation path against the environment. */
function resolveInterpolationPath(source: string, env: LexicalEnvironment): LoomValue {
  const segments = source
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return null;
  }
  const head = env.resolve(segments[0] as string);
  let current: LoomValue = head.arm === "local" ? head.value ?? null : null;
  for (let i = 1; i < segments.length; i += 1) {
    current = evaluateMemberAccess(current, segments[i] as string);
  }
  return current;
}

/** Stringify a resolved interpolation value: a string verbatim, else compact JSON. */
function stringifyPathValue(value: LoomValue): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Evaluate a pure (non-checkpointed) sub-expression against the environment.
 * The shipped test looms' pure sub-expressions are literal / identifier reads;
 * an identifier that resolves to a local binding yields its value, any other
 * resolution arm (a bare `fn` / callable name, or an unresolved name) has no
 * first-class readable value and yields `null` (the expressions.md runtime
 * safety net) rather than throwing out of the executor.
 */
function evaluatePureExpression(expr: Expr, env: LexicalEnvironment): LoomValue {
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
      // construction"): the schema constructor name is a type-phase concern only
      // — the runtime value is the plain field object.
      const obj: Record<string, LoomValue> = {};
      for (const field of expr.fields) {
        obj[field.name] = evaluatePureExpression(field.value, env);
      }
      return obj;
    }
    case "member":
      // `.field` access — a `null` target raises `NullMemberAccessPanic` (V4b).
      return evaluateMemberAccess(evaluatePureExpression(expr.target, env), expr.field);
    case "index": {
      // `[i]` access — a `null` target / out-of-bounds / missing key panics (V4b).
      const target = evaluatePureExpression(expr.target, env);
      const index = evaluatePureExpression(expr.index, env);
      return evaluateIndexAccess(target, typeof index === "number" ? index : String(index));
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
 * Dispatch a `target.method(args)` stdlib member by the receiver's runtime type
 * (expressions.md §"Built-in methods and properties"), reusing the runtime
 * stdlib modules so `replace`'s `$`-literal insertion and the `valuesEqual`
 * structural equality of `includes` / `indexOf` match the reference semantics.
 * A receiver with no stdlib member surface (number / boolean / null) has no
 * loom-1.0 method and yields the inert `null` safety net rather than throwing
 * out of the executor.
 */
function evaluateStdlibMethod(
  receiver: LoomValue,
  method: string,
  args: readonly LoomValue[],
): LoomValue {
  if (typeof receiver === "string") {
    return evaluateStringMember(receiver, method, args);
  }
  if (Array.isArray(receiver)) {
    return evaluateArrayMember(receiver, method, args);
  }
  if (typeof receiver === "object" && receiver !== null) {
    return evaluateObjectMember(receiver as { readonly [k: string]: LoomValue }, method, args);
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
): LoomValue {
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
