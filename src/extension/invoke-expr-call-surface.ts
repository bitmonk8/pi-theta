// Load-time invoke-expression call-surface checks and shared callable argument
// type checking/collection/rendering for the compose-pass call surfaces.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { CallExpr, CallWithClause, Expr, InvokeExpr } from "../parser/theta-document";
import {
  checkCalleeHasErrors,
  checkInvokeCall,
  checkInvokeReturnType,
  type InvokeArgSlot,
} from "../parser/invoke-diagnostics";
import {
  renderCollectedTypes,
  type StaticTypeInferencePass,
} from "../parser/static-type-inference";
import { checkCompatible, displayType, type CompatType, type TypeEnv } from "../parser/type-compat";
import { annotationToCompatType } from "../parser/type-layer-checks";
import { checkToolCallArguments } from "../parser/tool-call-static-checks";
import { checkInvokePathAtLoad } from "../runtime/invocation";
import type { FileSystem } from "../seams/file-system";
import type { CalleeArity, CalleeArityField } from "./invoke-static-checks";

/**
 * The flat set of static types whose UNION covers every value `expr` can
 * evaluate to, or `undefined` when any value-contributing position is past the
 * parser's static view. All type checks below reason over this SET rather than
 * over `StaticTypeInferencePass`'s single reduced type — see the pass's own
 * `collectProvableArgTypes` (../parser/static-type-inference.ts) for the full
 * contract. The set is computed by the SAME `Expr` switch that assigns the
 * reduced type (`#typeValue`), so a collected member can never render
 * differently from the type the pass itself assigns; this free-function seam
 * only keeps every call-surface consumer's existing import shape.
 */
export function collectProvableArgTypes(
  expr: Expr,
  env: TypeEnv,
  pass: StaticTypeInferencePass,
): CompatType[] | undefined {
  return pass.collectProvableArgTypes(expr, env);
}

// The `<actual>`-placeholder renderer for a collected value-type set lives
// beside the collection itself (../parser/static-type-inference.ts); re-exported
// so every call-surface consumer keeps its existing import shape.
export { renderCollectedTypes } from "../parser/static-type-inference";

/**
 * Check the first provable argument type mismatch for a `.theta` callable or
 * fixed-signature runtime tool after its arity check passes (bug 0072).
 */
export function checkCallableArgumentTypes(input: {
  readonly call: CallExpr;
  readonly fields: readonly CalleeArityField[];
  readonly calleeKind: "theta-callable" | "runtime-tool";
  readonly toolName: string;
  readonly file: string;
  readonly typeEnv: TypeEnv;
  readonly typePass: StaticTypeInferencePass;
}): Diagnostic[] {
  const { call, fields, calleeKind, toolName, file, typeEnv, typePass } = input;
  const diagnostics: Diagnostic[] = [];
  // The EXPECTED side is the callee's own annotation text, so it must not
  // resolve through the caller's declarations: `annotationToCompatType`
  // maps every non-primitive annotation to a `named` reference, and
  // resolving that name in the caller's `typeEnv` lets a caller-local
  // homonym decide a verdict about the callee's contract. tool-calls.md
  // §"Argument shape" puts the judgement in the callee's namespace — the
  // mismatch is "against the callee's `params:`", and the runtime check it
  // front-runs validates the argument against the callee's own lowered
  // `params:` schema. Under an EMPTY environment a `named` expected type is
  // unresolvable, so `checkCompatible` answers `"unknown"` and the site
  // defers to that validation. Primitive and literal decisions consult no
  // environment at all, so a `params: x: string` slot still rejects an
  // integer argument, and a structurally-decidable slot such as
  // `array<Named>` still rejects a non-array argument without this pass
  // needing to know what `Named` denotes — which is why the expected side
  // is emptied rather than withheld whenever it mentions a name.
  // Null-prototype for the same reason `collectTypeEnv`
  // (../parser/type-layer-checks.ts) builds one: an annotation may spell an
  // `Object.prototype` own property verbatim, and that name must be
  // unresolvable here too.
  const emptyCalleeAnnotationEnv: TypeEnv = Object.create(null) as TypeEnv;
  for (const [i, argExpr] of call.args.entries()) {
    const field = fields[i];
    if (field === undefined) {
      continue;
    }
    const expectedType = annotationToCompatType(field.typeSource);
    if (expectedType === undefined) {
      continue;
    }
    const argTypes = collectProvableArgTypes(argExpr, typeEnv, typePass);
    if (argTypes === undefined) {
      // A value-contributing position past the parser's static view: the
      // argument can take a value of unknown type, which defers to the
      // callee's own runtime AJV load — see `collectProvableArgTypes`.
      continue;
    }
    if (
      !argTypes.every(
        (argType) =>
          checkCompatible(argType, expectedType, emptyCalleeAnnotationEnv) ===
          "incompatible",
      )
    ) {
      // Only an explicit incompatibility on EVERY value the argument can
      // take is provable. One arm the `params:` field accepts — or answers
      // `"unknown"` / `"integer-narrowing"` for — means a runtime value may
      // well type-check, so the site defers to the runtime AJV net.
      continue;
    }
    diagnostics.push(
      ...checkToolCallArguments({
        toolName,
        calleeKind,
        // Neutralises `checkToolCallArguments`'s shared arity arm
        // (`positionalCount > 1`, which fires for ANY `calleeKind` —
        // pinned by the "arity is checked before type" unit test in
        // tests/tool-calls.test.ts): this call site's real arity was
        // already checked and passed at the call site via `checkInvokeArity`,
        // the dedicated emitter for this surface.
        positionalCount: 1,
        file,
        range: call.range,
        staticResolution: {
          resolvable: true,
          matches: false,
          expected: displayType(expectedType),
          actual: renderCollectedTypes(argTypes),
        },
      }),
    );
    // First mismatch only: this row's *Message* names neither the slot
    // index nor the parameter, and its range is the whole call
    // expression, so a second emission at this site would render
    // byte-identical to the first — the per-site cap the adjudicated rule
    // assigns this row (diagnostic-shape.md
    // #argument-mismatch-multiplicity), distinct from the per-slot rule
    // the invoke and `fn` rows draw.
    break;
  }
  return diagnostics;
}

/**
 * Check the `invoke(...)` expression surface: INV-1 containment, INV-8 clause
 * mode, INV-6 cwd type, then INV-3 arity and per-slot argument types, in order.
 * Host-owned helpers are threaded as dependencies to keep the surface module
 * independent of the orchestrator at runtime.
 */
export async function checkInvokeExprCallSurface(
  invokeExprs: readonly InvokeExpr[],
  callerPath: string,
  typeEnv: TypeEnv,
  typePass: StaticTypeInferencePass,
  deps: {
    readonly fs: Pick<FileSystem, "realpath">;
    readonly activeRoots: readonly string[];
    readonly resolveCalleeArity: (calleeAbsolutePath: string) => Promise<CalleeArity | undefined>;
    readonly resolveCalleeAbsolute: (callerPath: string, literalPath: string) => string;
    readonly checkWithClause: (input: {
      readonly clause?: CallWithClause;
      readonly mode: CalleeArity["mode"] | undefined;
      readonly presented: string;
      readonly surface: { readonly kind: "invoke"; readonly providedCount: number };
      readonly file: string;
      readonly range: SourceRange;
      readonly typeEnv: TypeEnv;
      readonly typePass: StaticTypeInferencePass;
    }) => Diagnostic[];
    readonly buildInvokeArgSlot: (
      argExpr: Expr | undefined,
      field: CalleeArityField | undefined,
      typeEnv: TypeEnv,
      typePass: StaticTypeInferencePass,
      emptyCalleeAnnotationEnv: TypeEnv,
    ) => InvokeArgSlot;
    readonly resolveCalleeReturnType: (
      calleeAbsolutePath: string,
    ) => Promise<CompatType | undefined>;
  },
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const { resolveCalleeAbsolute, checkWithClause, buildInvokeArgSlot } = deps;
  for (const invoke of invokeExprs) {
    // A dynamic path (empty literal) or a non-`.theta` extension already
    // produced its own parse error; skip to avoid a confusing second report.
    if (invoke.path.length === 0 || !invoke.path.endsWith(".theta")) {
      continue;
    }
    const site = { file: callerPath, range: invoke.range };
    const resolvedPath = resolveCalleeAbsolute(callerPath, invoke.path);

    // INV-1 (invocation.md §Resolution): a resolved callee outside every
    // active discovery root un-registers the parent. The containment check
    // consults `realpath`, which THROWS for a callee that does not exist on
    // disk. Per discovery-cli.md §Static resolution, an unreadable callee
    // reached by a *literal* `invoke(...)` is `theta/load/callee-has-errors`
    // severity WARNING — the parent still registers, static checks against
    // that callee are skipped, and the runtime AJV load is the safety net. So
    // a missing callee must NOT propagate as a throw: an unguarded throw here
    // aborts the whole discovery/compose walk, silently un-registering every
    // unrelated sibling theta from the same source (INVCEIL-1). Convert it into
    // a per-theta, non-fatal warning and skip the remaining static checks for
    // this site.
    // A `realpath` rejection (an unreadable / non-existent callee) is handled
    // as `undefined` via the same rejection-to-`undefined` idiom the callee
    // read paths in this pipeline use, rather than a broad `try`/`catch`.
    const containment = await checkInvokePathAtLoad({
      deps: { fs: deps.fs },
      resolvedPath,
      literalPath: invoke.path,
      activeRoots: deps.activeRoots,
    }).then(
      (value) => value,
      () => undefined,
    );
    if (containment === undefined) {
      diagnostics.push(
        ...checkCalleeHasErrors({
          calleePath: invoke.path,
          surface: "invoke",
          relatedSites: [],
          site,
        }),
      );
      continue;
    }
    if (containment.kind === "escape") {
      diagnostics.push({ ...containment.diagnostic, file: site.file, range: site.range });
      // An escaping callee cannot be opened for the arity check; move on.
      continue;
    }

    // invocation.md §"Typed return" (Empty-tail callee compatibility): a
    // typed invoke<Schema> of a statically-resolvable literal-path callee
    // whose inferred final value is incompatible with Schema is a parse
    // error — the cross-file mirror of the in-file `subagent fn` return
    // check (checkSubagentReturnAnnotation), reusing the SAME
    // checkInvokeReturnType / theta/parse/invoke-return-type-mismatch
    // (bug 0473). Independent of the arity/type block below: an arity or
    // per-slot mismatch does not withhold a genuine return-type mismatch,
    // and vice versa. Self-deferring: `resolveCalleeReturnType` answers
    // `undefined` for an unreadable/unparseable callee, or a payload this
    // layer cannot decide without callee-namespace resolution (named /
    // withheld / no-common-type) — the runtime AJV net is the fallback
    // exactly as it is for the in-file path's own unresolvable operands.
    if (invoke.returnSchema !== null && invoke.returnSchemaAbsorbed !== true) {
      const schema = annotationToCompatType(invoke.returnSchema);
      if (schema !== undefined) {
        const calleeReturn = await deps.resolveCalleeReturnType(resolvedPath);
        if (calleeReturn !== undefined) {
          diagnostics.push(
            ...checkInvokeReturnType({
              callee: invoke.path,
              calleeResolvable: true,
              schema,
              calleeReturn,
              env: typeEnv,
              site,
            }),
          );
        }
      }
    }

    // INV-3 (invocation.md §Argument arity): arity is checked against the
    // statically-resolved callee's `params:` counts. The provided count
    // excludes the leading path-literal argument.
    const providedCount = Math.max(0, invoke.args.length - 1);
    const arity = await deps.resolveCalleeArity(resolvedPath);
    // RFC 0009 (invocation.md INV-8 static mode gate, then INV-6 cwd type)
    // via the shared `checkWithClauseAtCallSurface` orchestration, threaded
    // as the `checkWithClause` dep (also called by the `.theta`-callable
    // surface's own arm, `checkThetaCallableCallSurface`): a call-site
    // `with` clause addresses the spawned child process, so a
    // statically-resolvable PROMPT-mode callee under a clause is refused
    // here, before the arity/type block, and the refusal withholds the cwd
    // judgement. `arity === undefined` means the callee is not statically
    // resolvable, and then NO parse code fires for the mode gate — the
    // runtime validation arm owns that case (registry row Trigger); passing
    // `arity?.mode` preserves that narrowing. The clause's `cwd` value is
    // judged exactly as an argument slot — expected `string`, the ordinary
    // type diagnostic, no dedicated code (registry `invoke-arg-type-mismatch`
    // Trigger), independent of the arity/type block below (a mismatched
    // argument AND a mismatched cwd each report). `<callee>` renders the
    // verbatim path literal, this arm's existing rendering rule.
    diagnostics.push(
      ...checkWithClause({
        ...(invoke.withClause !== undefined ? { clause: invoke.withClause } : {}),
        mode: arity?.mode,
        presented: invoke.path,
        surface: { kind: "invoke", providedCount },
        file: site.file,
        range: site.range,
        typeEnv,
        typePass,
      }),
    );
    if (arity !== undefined) {
      // Bug 0137 — `checkInvokeCall`, not a direct `checkInvokeArity` call:
      // it runs arity FIRST and returns its diagnostics ALONE when arity
      // fails, so this one call keeps arity running EXACTLY ONCE per site —
      // the `arityDiags.length > 0` gate inside it IS invocation.md
      // §"Argument arity"'s ordering (a double-defect site reports arity
      // alone), not a convention re-implemented here. `checkInvokeCall`
      // derives `providedCount` from `args.length`, so `argSlots` below
      // always has exactly `providedCount` entries — the same wired arity
      // behaviour as before.
      //
      // This arm's OWN empty callee-annotation env, judged separately from
      // the `.theta`-callable arm's `emptyCalleeAnnotationEnv` above (same
      // rationale — see that arm's own comment for why the EXPECTED side
      // must be judged in the callee's namespace, not the caller's).
      const emptyCalleeAnnotationEnv: TypeEnv = Object.create(null) as TypeEnv;
      const argSlots: InvokeArgSlot[] = [];
      for (let i = 0; i < providedCount; i++) {
        // Slot `i` binds `invoke.args[i + 1]` — the path literal occupies
        // `args[0]` — so the reported index counts PARAM slots, not raw
        // call arguments (invocation.md §"Argument binding"; the reading is
        // author-visible in every emitted message).
        argSlots.push(
          buildInvokeArgSlot(
            invoke.args[i + 1],
            arity.fields[i],
            typeEnv,
            typePass,
            emptyCalleeAnnotationEnv,
          ),
        );
      }
      // `checkInvokeArgTypes` (run by `checkInvokeCall` once arity passes)
      // emits one diagnostic per mismatched slot, with no `break`: this
      // row's *Message* names the slot (`<i>`/`<param>`), so per-slot
      // emission is the adjudicated rule for it (diagnostic-shape.md
      // #argument-mismatch-multiplicity). The `.theta`-callable arm above
      // caps at one emission per call site instead — not because it shares
      // this loop's shape, but because its own emitter is called once per
      // slot from inside a loop that `break`s after the first mismatch; see
      // that loop's own comment for why. `checkFnCallArgs`
      // (../parser/type-layer-checks.ts) and `checkImportedFnCallArgs`
      // (../extension/invoke-imported-checks.ts) side with this per-slot
      // row, not with the capped arm — the split is 3-per-slot to
      // 1-per-site, not a 1:1 divide between two surfaces.
      diagnostics.push(
        ...checkInvokeCall({
          callee: invoke.path,
          staticallyResolvable: true,
          requiredCount: arity.requiredCount,
          totalCount: arity.totalCount,
          args: argSlots,
          env: emptyCalleeAnnotationEnv,
          site,
        }),
      );
    }
  }
  return diagnostics;
}
