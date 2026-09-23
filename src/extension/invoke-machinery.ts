// The production `invoke(...)` machinery for the per-theta producer
// (production-theta-producer.ts): resolve an `invoke("./x.theta", ...)` /
// `.theta`-callable call site to an `InvokeChild`, run the ordered invoke
// boundary guards (ceiling #4 per-arg depth, INV-6 cwd validation, the INV-1
// containment re-check, the bug-0293 callee load/parse classification), bind
// the callee's positional params, drive the callee (prompt→prompt attach or
// subagent spawn), and validate/translate the typed return — extracted from
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
import { inferCalleeReturnAnnotation } from "../parser/functions";
import type { ThetaMode } from "../parser/frontmatter";
import { lowerQueryResponseSchema } from "../parser/query-schema-lowering";
import type {
  CallExpr,
  InvokeExpr,
  ThetaBody,
} from "../parser/theta-document";
import { retagForwardedEnums } from "../runtime/enum-tag-carriage";
import { decodeInboundValue } from "../runtime/inbound-boundary";
import { recheckInvokePathAtRuntime } from "../runtime/invocation";
import type {
  InvokeChild,
  DrivenInvokeResult,
  InvokeResultSource,
} from "../runtime/invoke-cancellation";
import {
  enforceInvokeParamsDepth,
  enforceInvokeReturnDepth,
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
  makeOk,
  type ResultValue,
  type ThetaValue,
} from "../runtime/value";
import { projectForValidation } from "../runtime/wire-translation";
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
import { mergedEnumDeclsOf, mergedSchemaDeclsOf } from "./query-text-render";
import { sendSystemNote, type SystemNoteChannelDeps } from "./system-note-channel";
import type {
  BodyExecutingConversationBinding,
  ConversationBinding,
  ConversationBindInput,
  ThetaCompositionInput,
} from "./theta-composition-producer";

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
export type InvokeReturnTyping =
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
export interface InvokeReturnSite {
  readonly annotation: string;
  readonly declarations: ThetaBody;
  readonly importedTypeDecls?: ThetaCompositionInput["importedTypeDecls"];
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
   * bind the positional args, resolve+parse the callee against the caller's
   * directory, spawn/drive it, and return its top-level `Result` (FN-5).
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
    const argGuard = invokeBoundaryArgGuards(calleePath, argValues, ctx, rawCwd);
    if ("source" in argGuard) {
      return argGuard;
    }
    const { resolvedCwd } = argGuard;

    const escape = await this.#recheckCalleeContainment(theta, calleePath);
    if (escape !== undefined) {
      // The containment re-check is THIS hop's own guard — the callee never ran
      // (bug 0294 provenance).
      return { source: "boundary-minted", result: makeErr(escape as unknown as ThetaValue) };
    }
    const parseOutcome = await this.#parseCalleeOrErr(theta, calleePath);
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
    theta: ConversationBindInput["theta"],
    calleePath: string,
  ): Promise<DrivenInvokeResult | { callee: ConversationBindInput["theta"] }> {
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
  validateInvokeReturn(
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
