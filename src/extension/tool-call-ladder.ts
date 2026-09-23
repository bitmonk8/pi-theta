// The production code-side tool-call resolution & dispatch ladder for the
// per-theta producer (production-theta-producer.ts): classify a `<name>(args)`
// call (H8b pi-tool / `.theta`-callable / RFC 0011 runtime tool), resolve a
// Pi-tool call against the theta's frozen `tools:` callable set (QTL-2) with
// the ceiling-#4 depth walk and the bug-0072 pre-dispatch AJV net, bind and
// dispatch session-control runtime tools (§5.4 argument net), and route an
// extension tool through the PIC-64 probe-asserted fail-closed ladder —
// extracted from `ProductionThetaProducer`, which delegates its host-deps
// `classifyCall` / `resolveToolCall` / `resolveRuntimeToolCall` closures here
// over the same construction input.
//
// Spec (narrative): tool-calls.md (§"Argument shape",
// #session-control-runtime-tools), pi-integration-contract/subagent.md
// (#subagent-host-loop-dispatch), hard-ceilings/ceilings-3-and-4.md,
// cancellation.md CANCEL-3.

import type { CallExpr } from "../parser/theta-document";
import {
  RUNTIME_TOOL_SIGNATURES,
  type RuntimeToolName,
  type RuntimeToolSignature,
} from "../parser/runtime-tools";
import type { RuntimeToolCall } from "../runtime/effectful-statement-host";
import {
  resolveDispatchLadder,
  type DispatchLadderProbe,
  type EncodedToolRequest,
} from "../runtime/host-loop-dispatch";
import type { LexicalEnvironment } from "../runtime/lexical-environment";
import { evaluatePureExpression } from "../runtime/pure-expression-evaluator";
import type { CodeToolError } from "../runtime/query-error";
import {
  executeCompactTool,
  executeContextUsageTool,
  executeSessionNameTool,
} from "../runtime/session-control-tools";
import {
  buildCodeToolArgSchemaViolation,
  buildCodeToolUnknownTool,
  enforceCodeToolArgDepth,
} from "../runtime/tool-call";
import type {
  AgentToolResultEnvelope,
  CodeSideToolCall,
} from "../runtime/tool-call-execute";
import { guardToolExecutePromise } from "../runtime/tool-call-swallowing-handler";
import { makeErr, type ResultValue, type ThetaValue } from "../runtime/value";
import type { LoweredSchema } from "../seams/schema-validator";
import { lowerToolCallParams, thetaCalleePath } from "./callable-lowering";
import {
  noopSwallowChannels,
  signalGuard,
  UnknownHostToolError,
  type PiToolDispatch,
  type ProductionProducerInput,
} from "./production-producer-deps";
import type { ConversationBindInput } from "./theta-composition-producer";

/**
 * The extracted tool-call resolution & dispatch ladder (see the module
 * header). Constructed once per `ProductionThetaProducer` over the same
 * construction input; holds no mutable state.
 */
export class ToolCallLadder {
  readonly #input: ProductionProducerInput;

  constructor(input: ProductionProducerInput) {
    this.#input = input;
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
  classifyCall(
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
  resolveRuntimeToolCall(
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

    const bound = bindRuntimeToolArgs(sig, argValues, presentedName);
    if ("violation" in bound) {
      return bound.violation;
    }
    const { boundArgs } = bound;

    const hosts = this.#input.sessionControlHosts!;

    return {
      toolName: presentedName,
      dispatch: buildRuntimeToolDispatch(canonicalName, hosts, presentedName, boundArgs, signal),
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
  resolveToolCall(
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
}

/**
 * Bind a runtime tool's positional args against its signature and run the
 * §5.4 runtime argument net.
 *
 * Default binding: an absent optional arg binds the signature’s default.
 * compact’s single param has `hasDefault: true` → default "".
 *
 * §5.4 runtime argument net: every bound arg must be a string (the one
 * theta 1.x param type). A non-string bound value → the pinned validation
 * Err, pre-dispatch, no host call — returned as the `violation` refusal
 * record.
 */
function bindRuntimeToolArgs(
  sig: RuntimeToolSignature,
  argValues: readonly ThetaValue[],
  presentedName: string,
): { boundArgs: ThetaValue[] } | { violation: RuntimeToolCall } {
  const boundArgs: ThetaValue[] = [];
  for (let i = 0; i < sig.params.length; i++) {
    if (i < argValues.length) {
      boundArgs.push(argValues[i] as ThetaValue);
    } else if (sig.params[i]!.hasDefault) {
      boundArgs.push("" as ThetaValue);
    }
  }

  for (let i = 0; i < boundArgs.length; i++) {
    if (typeof boundArgs[i] !== "string") {
      const argViolation = makeErr({
        kind: "code_tool",
        message: `argument '${sig.params[i]!.name}' must be a string`,
        tool_name: presentedName,
        cause: "validation",
      } as unknown as ThetaValue);
      return {
        violation: {
          toolName: presentedName,
          argViolation,
          dispatch: () => Promise.resolve(argViolation),
        },
      };
    }
  }
  return { boundArgs };
}

/**
 * Build the runtime tool's dispatch closure per canonical name. The adapter
 * Promise is wrapped at construction by `guardToolExecutePromise` (CANCEL-3)
 * so a late settlement after a theta abort is discarded (CNCL-1..3).
 */
function buildRuntimeToolDispatch(
  canonicalName: RuntimeToolName,
  hosts: NonNullable<ProductionProducerInput["sessionControlHosts"]>,
  presentedName: string,
  boundArgs: readonly ThetaValue[],
  signal: AbortSignal,
): () => Promise<ThetaValue> {
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
  return dispatchFn;
}
