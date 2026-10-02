// The production `invoke(...)` machinery for the per-theta producer
// (production-theta-producer.ts): resolve an `invoke("./x.theta", ...)` /
// `.theta`-callable call site to an `InvokeChild`, run the ordered invoke
// boundary guards (ceiling #4 per-arg depth, INV-6 cwd validation, the INV-1
// containment re-check, the bug-0293 callee load/parse classification), bind
// the callee's positional params, drive the callee (prompt→prompt attach or
// subagent spawn), and hand the typed return to invoke-return-validation.ts
// for validation/translation — extracted from
// `ProductionThetaProducer`, which delegates its host-deps `resolveInvoke` /
// `resolveCallAsInvoke` closures here and hands back its bind/spawn seams
// through `InvokeMachineryDeps`.
//
// Spec (narrative): invocation.md (§Resolution / INV-1, §INV-4, §Typed
// return, §Cross-mode semantics, INV-6/INV-8), tool-calls.md §"Return type",
// hard-ceilings/ceilings-3-and-4.md, cancellation.md CANCEL-3/CANCEL-5.

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import type { DefaultedField } from "../binder/defaulting";
import type { ThetaMode } from "../parser/frontmatter";
import type {
  CallExpr,
  InvokeExpr,
} from "../parser/theta-document";
import { recheckInvokePathAtRuntime } from "../runtime/invocation";
import type {
  InvokeChild,
  DrivenInvokeResult,
  InvokeResultSource,
} from "../runtime/invoke-cancellation";
import {
  enforceInvokeParamsDepth,
} from "../runtime/invoke-ceiling-depth";
import {
  pushCountableFrameOrRefuse,
  type InvokeChain,
} from "../runtime/invoke-depth-cycle";
import { runPromptSuspendInvoke } from "../runtime/invoke-prompt-suspend";
import { guardInvokeExecutionPromise } from "../runtime/invoke-swallowing-handler";
import type { LexicalEnvironment } from "../runtime/lexical-environment";
import { evaluateCallSiteCwd, evaluatePureExpression } from "../runtime/pure-expression-evaluator";
import type { InvokeInfraCause, InvokeInfraError } from "../runtime/query-error";
import { executeBody } from "../runtime/statement-executor";
import type { EnumTagEntry } from "../runtime/subagent-envelope";
import {
  makeErr,
  type ResultValue,
  type ThetaValue,
} from "../runtime/value";
import type { Trace } from "../seams/trace";
import {
  callableSetPiToolNames,
  surfaceCalleeFinalValue,
  thetaCalleePath,
} from "./callable-lowering";
import {
  calleePathIsAbsent,
  isEnoent,
  noopSwallowChannels,
  signalGuard,
  type ProductionProducerInput,
} from "./production-producer-deps";
import {
  resolveReturnSite,
  validateInvokeReturn,
  type InvokeReturnSite,
  type InvokeReturnTyping,
} from "./invoke-return-validation";
import { sendSystemNote, type SystemNoteChannelDeps } from "./system-note-channel";
import type {
  BodyExecutingConversationBinding,
  ConversationBinding,
  ConversationBindInput,
} from "./theta-composition-producer";

export type { InvokeReturnSite, InvokeReturnTyping } from "./invoke-return-validation";

/**
 * Resolve a callee path literal against the directory of `resolutionBase` (a
 * FILE path). The INV-1 re-check and the SLSH-5 hop record both read this one
 * resolution, so the path containment judged is the path provenance names.
 * `undefined` when there is no base file to resolve against.
 */
function resolveCalleeAgainstBase(calleePath: string, resolutionBase: string | undefined): string | undefined {
  if (resolutionBase === undefined) {
    return undefined;
  }
  return isAbsolute(calleePath) ? calleePath : resolvePath(dirname(resolutionBase), calleePath);
}

/**
 * The producer collaborators the extracted invoke machinery reaches back
 * through: the construction input, the bug-0437 system-note channel
 * resolution, the binder's declared-default recovery (`#bindCalleeParams`'s
 * 0165/0181/0186 lineage), and the two conversation-binding choke points a
 * driven callee attaches or spawns through.
 */
export interface InvokeMachineryDeps {
  /** The producer's construction input (`ProductionThetaProducer`'s `#input`). */
  readonly input: ProductionProducerInput;
  /** The producer's `#systemNoteChannel` resolution (bug 0437 §Fix). */
  readonly systemNoteChannel: () => SystemNoteChannelDeps;
  /** `BinderRunner.recoverDeclaredDefaults` — the declared-default recovery an omitted callee slot binds. */
  readonly recoverDeclaredDefaults: (
    theta: ConversationBindInput["theta"],
    defaultedFields: readonly string[],
  ) => Promise<readonly DefaultedField[]>;
  /** The producer's prompt-mode bind choke point (the prompt→prompt attach cell). */
  readonly bindPromptConversation: (
    bindInput: ConversationBindInput,
  ) => BodyExecutingConversationBinding;
  /** The producer's subagent-mode spawn choke point (every other cross-mode cell). */
  readonly spawnSubagentConversation: (
    bindInput: ConversationBindInput,
  ) => Promise<ConversationBinding>;
}

/**
 * The extracted invoke trampoline (see the module header). Constructed once
 * per `ProductionThetaProducer` over that producer's own collaborators; holds
 * no cross-invocation mutable state of its own.
 */
export class InvokeMachinery {
  readonly #input: ProductionProducerInput;
  readonly #deps: InvokeMachineryDeps;

  constructor(deps: InvokeMachineryDeps) {
    this.#input = deps.input;
    this.#deps = deps;
  }

  /**
   * H8b live invoke resolver for an `invoke("./x.theta", ...args)` expression:
   * bind the positional args, resolve+parse the callee against the executing
   * body's declaring residence — the declaring `.thetalib`'s own directory for
   * an `invoke` written inside an imported fn body, the calling theta's own
   * directory otherwise (bug 0504 §Fix; imports.md:17: the PATH resolves
   * against the `.thetalib`, only the conversation anchor follows the
   * caller) — then spawn/drive it and return its top-level `Result` (FN-5).
   */
  resolveInvoke(
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
    // Bug 0504 §Fix: `env.currentResidence()` answers the declaring lib's
    // resolved path when this `invoke` sits inside an imported fn's body
    // (bug 0354's `moduleResidence` stamp, carried on bug 0303's `moduleEnv`);
    // it is `undefined` for an `invoke` written directly in the caller's own
    // body, where `theta.sourcePath` is already the correct base.
    const resolutionBase = env.currentResidence() ?? theta.sourcePath;
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
      resolutionBase,
    );
  }

  /**
   * H8b live invoke resolver for a `.theta`-callable `<name>(args)` call: resolve
   * the callee path from the callable set, bind the positional args, and drive
   * the callee, returning its typed top-level `Result` across the boundary
   * (FN-5).
   */
  resolveCallAsInvoke(
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
    // Bug 0504 §Fix: this route's callee path comes from the CALLING theta's
    // own `tools:` frontmatter list, caller-relative by definition — the base
    // is `theta.sourcePath` unconditionally, never the executing residence.
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
      theta.sourcePath,
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
    /**
     * Bug 0504 §Fix: the PATH-resolution base for this callee — a FILE path,
     * whose `dirname` a relative callee path resolves against: the declaring
     * `.thetalib` for an `invoke` inside an imported fn body, the calling
     * theta otherwise. `theta` stays the conversation/spawn anchor and the
     * source of mode and frontmatter.
     */
    resolutionBase: string | undefined,
  ): InvokeChild {
    const resolvedCalleePath = resolveCalleeAgainstBase(calleePath, resolutionBase);
    return {
      calleePath,
      ...(resolvedCalleePath !== undefined ? { resolvedCalleePath } : {}),
      committed: [],
      drive: (): Promise<DrivenInvokeResult> => {
        // INV-4 / ceiling #1 (invocation.md §INV-4, CIO-2): push a countable
        // frame BEFORE the callee body runs. The cap is breached when about to
        // push the 33rd frame; the nested overflow surfaces to this invoke
        // parent as `Err(InvokeInfraError{cause:"panic"})` — the runtime backstop
        // that (with load-time cycle detection) bounds a self-referential theta.
        const guard = pushCountableFrameOrRefuse(chain, "direct-invoke", calleePath);
        if (guard.kind === "refused") {
          return Promise.resolve(guard.refusal);
        }
        const childChain: InvokeChain = guard.chain;
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
            resolutionBase,
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
    /** Bug 0504 §Fix: the PATH-resolution base threaded from `#buildInvokeChild`. */
    resolutionBase: string | undefined,
  ): Promise<DrivenInvokeResult> {
    const boundary = await this.#guardInvokeBoundary(calleePath, argValues, ctx, rawCwd, resolutionBase);
    if ("result" in boundary) return boundary;
    const { callee, resolvedCwd } = boundary;
    // tool-calls.md §"Return type" (registered-theta row): the return type of a
    // `.theta`-callable call is the callee's INFERRED return type, which is
    // legible only now that the callee is parsed — and it resolves against the
    // CALLEE's own `schema` / `enum` declarations, not the caller's, because it
    // is the callee's type. An `invoke<Schema>` annotation is the caller's and
    // keeps resolving there.
    const returnSite = resolveReturnSite(theta, returnTyping, callee);
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
      return this.#driveAttachedPromptCallee(
        callee,
        calleePath,
        returnSite,
        paramBindings,
        ctx,
        chain,
        parentSignal,
        parentInvocationId,
        trace,
      );
    }
    return this.#driveSpawnedSubagentCallee(
      callee,
      calleePath,
      returnSite,
      paramBindings,
      ctx,
      chain,
      parentSignal,
      parentInvocationId,
      resolvedCwd,
    );
  }

  /**
   * The prompt→prompt attach leg of `#driveCallee`'s cross-mode fork: bind the
   * callee onto the caller's current user session, run its body under the
   * suspend-invoke window, and validate the typed return.
   */
  async #driveAttachedPromptCallee(
    callee: ConversationBindInput["theta"],
    calleePath: string,
    returnSite: InvokeReturnSite | null,
    paramBindings: Map<string, ThetaValue>,
    ctx: ExtensionCommandContext,
    chain: InvokeChain,
    parentSignal: AbortSignal,
    parentInvocationId: string | undefined,
    trace: Trace | undefined,
  ): Promise<DrivenInvokeResult> {
    const childBinding = this.#deps.bindPromptConversation({
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
          sendSystemNote(note, this.#deps.systemNoteChannel());
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

  /**
   * The subagent spawn leg of `#driveCallee`'s cross-mode fork: spawn a fresh
   * isolated child for the callee, drive it to its terminal envelope (or run
   * the harness fallback in-process), validate the typed return, and tear the
   * child down on every exit path.
   */
  async #driveSpawnedSubagentCallee(
    callee: ConversationBindInput["theta"],
    calleePath: string,
    returnSite: InvokeReturnSite | null,
    paramBindings: Map<string, ThetaValue>,
    ctx: ExtensionCommandContext,
    chain: InvokeChain,
    parentSignal: AbortSignal,
    parentInvocationId: string | undefined,
    resolvedCwd: string | undefined,
  ): Promise<DrivenInvokeResult> {
    // CANCEL-5 (cancellation.md §`invoke(...)` entry): hand the parent's
    // `thetaAbort.signal` to the child binding so it constructs its `thetaAbort`
    // as a DERIVED controller (downward-only: the child aborts when the parent
    // aborts, never the reverse — `deriveChildThetaAbort`).
    const binding = await this.#deps.spawnSubagentConversation({
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
    calleePath: string,
    argValues: readonly ThetaValue[],
    ctx: ExtensionCommandContext,
    rawCwd: ThetaValue | undefined,
    /** Bug 0504's resolution base (see `resolutionBase` on `#buildInvokeChild`). */
    resolutionBase: string | undefined,
  ): Promise<DrivenInvokeResult | {
    callee: ConversationBindInput["theta"];
    resolvedCwd: string | undefined;
  }> {
    // INV-1 (invocation.md §Resolution): re-run the realpath + discovery-root
    // containment check at the moment the runtime opens the callee,
    // against the *currently* active roots. An escape fails closed with
    // `Err(InvokeInfraError{cause:"load_failure"})` — the runtime backstop to the
    // load-time `theta/load/invoke-path-escape` guard.
    const argGuard = invokeBoundaryArgGuards(calleePath, argValues, ctx, rawCwd);
    if ("source" in argGuard) {
      return argGuard;
    }
    const { resolvedCwd } = argGuard;

    const escape = await this.#recheckCalleeContainment(calleePath, resolutionBase);
    if (escape !== undefined) {
      // The containment re-check is THIS hop's own guard — the callee never ran
      // (bug 0294 provenance).
      return { source: "boundary-minted", result: makeErr(escape as unknown as ThetaValue) };
    }
    const parseOutcome = await this.#parseCalleeOrErr(calleePath, resolutionBase);
    if ("source" in parseOutcome) {
      return parseOutcome;
    }
    const { callee } = parseOutcome;
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

  /**
   * Load and parse the invoke callee, classifying a failure per bug 0293
   * (queryerror-variants.md:182-183): the verdict discriminates the spec's
   * `load_failure` (callee unreadable / un-loadable) from `parse_failure`
   * (callee failed to parse) — `internal_error` stays reserved for the
   * runtime-defect surface (error-model.md §Runtime-panics) and is never minted
   * here. `undefined` (seam absent, or a non-production stub) defaults to
   * `load_failure`, preserving the pre-0293 unit-harness behaviour.
   */
  async #parseCalleeOrErr(
    calleePath: string,
    /** Bug 0504's resolution base (see `resolutionBase` on `#buildInvokeChild`). */
    resolutionBase: string | undefined,
  ): Promise<DrivenInvokeResult | { callee: ConversationBindInput["theta"] }> {
    const parsed = await this.#input.parseCallee?.(resolutionBase, calleePath);
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
    return { callee: parsed.input };
  }

  /** Bind positional callee params, recovering declared defaults only for omitted slots. */
  async #bindCalleeParams(
    callee: ConversationBindInput["theta"],
    argValues: readonly ThetaValue[],
  ): Promise<Map<string, ThetaValue>> {
    const paramNames = callee.frontmatter.params?.fields.map((field) => field.wireName) ?? [];
    // An omitted slot (`argValues[index] === undefined`, the presence check —
    // `noUncheckedIndexedAccess`) recovers the DECLARED default via
    // `BinderRunner.recoverDeclaredDefaults`, the same value the slash/binder path already
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
      omittedDefaulted.length > 0 ? await this.#deps.recoverDeclaredDefaults(callee, omittedDefaulted) : [];
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
      const validated = this.validateInvokeReturn(
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
   * against the resolution base's directory — the declaring `.thetalib` for an
   * invoke written in an imported fn body, the calling theta otherwise (bug
   * 0504 §Fix) — and re-run the shared realpath +
   * discovery-root containment check against the currently-active roots. Returns
   * the `load_failure` `InvokeInfraError` on escape, or `undefined` when
   * contained (or when the production seams needed for the check are absent).
   */
  async #recheckCalleeContainment(
    calleePath: string,
    /** Bug 0504's resolution base (see `resolutionBase` on `#buildInvokeChild`). */
    resolutionBase: string | undefined,
  ): Promise<InvokeInfraError | undefined> {
    const fileSystem = this.#input.fileSystem;
    const activeRoots = this.#input.activeRoots;
    if (fileSystem === undefined || activeRoots === undefined) {
      return undefined;
    }
    const resolvedPath = resolveCalleeAgainstBase(calleePath, resolutionBase) ?? calleePath;
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
   * Typed-return runtime validation over this producer's schema validator —
   * delegates to `validateInvokeReturn` (invoke-return-validation.ts).
   */
  validateInvokeReturn(
    calleePath: string,
    returnSite: InvokeReturnSite | null,
    result: ResultValue,
    calleeResolvedPath: string | undefined,
    forwardedEnumTags?: readonly EnumTagEntry[],
  ): ResultValue {
    return validateInvokeReturn(
      this.#input.root.schemaValidator,
      calleePath,
      returnSite,
      result,
      calleeResolvedPath,
      forwardedEnumTags,
    );
  }
}

/**
 * Run the invoke boundary's caller-side argument guards, in order:
 *
 * Ceiling #4 (hard-ceilings/ceilings-3-and-4.md#ceiling-4-table, the
 * `params` / `invoke(...)` row; CIO-3 depth-walk-before-AJV): enforce the
 * JSON-document depth-≤5 cap at the runtime `invoke(...)` `params` argument
 * boundary. Each positional arg is a JSON document in its own right, so the
 * walk runs per-arg (a legitimate depth-5 arg stays valid; walking a wrapper
 * object would false-trip it); a depth-6+ arg surfaces to the invoke parent
 * as `Err(InvokeInfraError { cause: "validation" })` — distinct from ceiling
 * #1 chain-depth. Runs before the containment re-check / callee load so a
 * caller-side depth breach is reported regardless of callee state. This
 * ceiling refusal is THIS hop's own guard on the caller-supplied argument —
 * the callee never ran (bug 0294 provenance).
 *
 * RFC 0009 INV-6 (invocation.md `#options-surface`): validate and resolve the
 * call-site `cwd` before any dispatch work. An empty string and a non-string
 * are authoring bugs — `Err(InvokeInfraError { cause: "validation" })`, never
 * a silent parent-cwd inherit. A relative value resolves against the parent
 * invocation's effective cwd (`ctx.cwd`, the exact value the default launch
 * bind forwards), which composes across nesting because a child's `ctx.cwd`
 * IS its spawn cwd. `path.resolve` is also the Windows separator-spelling
 * normalisation (the bug 0467 class): both spellings of one directory
 * converge on the host-native resolved form, which is the spelling the spawn
 * option wants (diagnostic rendering's POSIX spelling is a separate concern
 * and is not applied here). This guard is THIS hop's own, pre-spawn,
 * boundary-minted (bug 0294 provenance).
 */
function invokeBoundaryArgGuards(
  calleePath: string,
  argValues: readonly ThetaValue[],
  ctx: ExtensionCommandContext,
  rawCwd: ThetaValue | undefined,
): DrivenInvokeResult | { resolvedCwd: string | undefined } {
  for (const argValue of argValues) {
    const breach = enforceInvokeParamsDepth(calleePath, argValue);
    if (breach !== undefined) {
      return { source: "boundary-minted", result: breach.result };
    }
  }

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
  return { resolvedCwd };
}
