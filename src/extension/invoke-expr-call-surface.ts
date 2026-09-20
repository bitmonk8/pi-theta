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
  BOOLEAN_BINARY_OPS,
  isStaticZeroIntegerDivisor,
  type StaticTypeInferencePass,
} from "../parser/static-type-inference";
import { checkCompatible, displayType, type CompatType, type TypeEnv } from "../parser/type-compat";
import { annotationToCompatType } from "../parser/type-layer-checks";
import { checkToolCallArguments } from "../runtime/tool-call";
import { checkInvokePathAtLoad } from "../runtime/invocation";
import type { FileSystem } from "../seams/file-system";
import type { CalleeArity, CalleeArityField } from "./invoke-static-checks";
import { withClausePromptModeRefusal } from "./with-clause-prompt-mode-gate";

/**
 * The flat set of static types whose UNION covers every value `expr` can
 * evaluate to, or `undefined` when any value-contributing position is past the
 * parser's static view. All type checks below reason over this SET rather than
 * over `StaticTypeInferencePass`'s single reduced type.
 *
 * `#commonType` (../parser/static-type-inference.ts) narrows a composite to ONE
 * candidate and drops its siblings on two paths: a candidate survives a sibling
 * that answers `unknown`, and a candidate set with no common member falls back
 * to `candidates[0]`. Either path renders `flag ? 1 : "a"` as `integer`, and a
 * check that trusts that rejects the runtime value `"a"` — which `read`'s
 * `path: { type: "string" }` accepts. tool-calls.md §"Provable-disjointness
 * check (parse time)" forbids exactly that ("a provable disjointness guarantees
 * the runtime AJV check would reject the same value … The check therefore never
 * rejects a program the runtime AJV check would accept"), and on the
 * `.theta`-callable arm it defeats bug 0072 §Fix's rule that only an explicit
 * incompatibility is a mismatch while `unknown` defers to the runtime net.
 * Keeping the whole value-type set in front of all consumers is what lets
 * `subsetKinds`' "an unrepresentable arm makes the whole union unprovable" rule
 * (../runtime/tool-call.ts) and the every-arm-incompatible test below decide
 * these expressions correctly. The RENDERING stays on `displayType`, the
 * canonical form diagnostics/placeholder-rendering-a.md category 1 mandates.
 *
 * The recursion visits exactly the VALUE-contributing positions — a ternary
 * condition and a `match` scrutinee choose WHICH arm supplies the value, never
 * what that value is — and mirrors `#typeExpr` / `#typeBinary` shape for shape,
 * so a collected member can never render differently from the type the pass
 * itself assigns. It is exhaustive over the `Expr` union with no `default` arm:
 * a kind added to the union without an arm here is a compile error rather than a
 * silent verdict. `undefined` at any nested position propagates, and every kind
 * not named as value-derivable yields `undefined`, so withholding is the
 * default — it can only suppress an emission, never produce one.
 */
export function collectProvableArgTypes(
  expr: Expr,
  env: TypeEnv,
  pass: StaticTypeInferencePass,
): CompatType[] | undefined {
  switch (expr.kind) {
    case "number":
    case "string":
    case "bool":
    case "null":
      // A literal's whole value-type set is its own type. Read off the pass so
      // the literal→`CompatType` mapping keeps one owner. `typeOf`'s default
      // empty bindings map applies: no consumer here resolves `let` bindings.
      return [pass.typeOf(expr, env)];
    case "ternary":
      return collectArmUnion([expr.consequent, expr.alternate], env, pass);
    case "match":
      return collectArmUnion(
        expr.arms.map((arm) => arm.body),
        env,
        pass,
      );
    case "try":
      // `operand?` evaluates to the operand's success value.
      return collectProvableArgTypes(expr.operand, env, pass);
    case "block":
      // A block's value IS its tail expression's value (bug 0082 §Fix
      // constraint 3) — mirrors the `try` arm immediately above. A tail-less block
      // (already a parse error, `theta/parse/block-expr-missing-tail`) yields
      // no value-type set to collect.
      return expr.body.tail === null
        ? undefined
        : collectProvableArgTypes(expr.body.tail, env, pass);
    case "binary": {
      // `parseUnary` (../parser/theta-document.ts) models unary `!` / `-` as a
      // binary carrying a SYNTHETIC `null` left operand; the arms below dispatch
      // on that shape in `#typeBinary`'s own order, so the two agree per shape.
      if (expr.left.kind === "null" && expr.op === "-") {
        // Negation carries the operand's own value type.
        return collectProvableArgTypes(expr.right, env, pass);
      }
      if (
        (expr.left.kind === "null" && expr.op === "!") ||
        BOOLEAN_BINARY_OPS.has(expr.op)
      ) {
        // The value is a boolean whatever the operands evaluate to (`evalBinary`
        // in ../runtime/statement-executor.ts yields `true` / `false` for `!`,
        // `&&`, `||` and every comparison), so the set is exact even where an
        // operand is statically unresolvable — an unresolvable operand under one
        // of these operators is not a reason to withhold the expression.
        // `BOOLEAN_BINARY_OPS` is `#typeBinary`'s own set, imported rather than
        // restated so the two cannot drift.
        return [pass.typeOf(expr, env)];
      }
      if (expr.op === "/") {
        // `/`'s result type is fixed by the operator (expressions.md
        // §"Other arithmetic": always `number`, whatever the operands) — the
        // same result-fixed reasoning the arm above states, so the set is
        // exact and the operand sets are not consulted. Reading
        // `pass.typeOf(expr, env)` rather than unioning `expr.left` /
        // `expr.right`, as the arithmetic arm below does for `+` / `-` / `*` /
        // `%`, is what keeps this function's own invariant true — it "mirrors
        // `#typeExpr` / `#typeBinary` shape for shape, so a collected member
        // can never render differently from the type the pass itself assigns"
        // — rather than adding `/` as an exception to it.
        return [pass.typeOf(expr, env)];
      }
      if (expr.op === "%" && isStaticZeroIntegerDivisor(expr.right)) {
        // Bug 0152 §Fix (c): mirrors `#typeBinary`'s zero-divisor `%` arm
        // (../parser/static-type-inference.ts), the same MIRROR precedent bug
        // 0142 set for `/` immediately above — one owner of the rule, read off
        // the pass rather than restated here.
        return [pass.typeOf(expr, env)];
      }
      // Arithmetic (`+`, `-`, `*`, and `%` for a non-zero-or-non-integer
      // divisor): the value takes one operand's kind or the two widened
      // together (`integer + number` is a number), all of which the union of
      // the operand sets covers. Over-approximating is safe in the one
      // direction that matters — a wider set only makes disjointness harder to
      // prove, and `kindsDisjoint` (../runtime/tool-call.ts) already
      // reconciles `integer`/`number`, so a `%` divisor this arm still reaches
      // (any divisor that is not a statically-zero integer literal) cannot turn
      // a withheld verdict into a fired one. The zero-integer-divisor `NaN`
      // widening is no longer this arm's concern: the guard above collects it
      // exactly, ahead of this fallback.
      return collectArmUnion([expr.left, expr.right], env, pass);
    }
    case "array": {
      // The Pi-tool arm's own bail is untouched by this arm: `subsetKinds`
      // (../runtime/tool-call.ts) admits no `array<…>` kind, so that consumer
      // still proves nothing from an array member and stands down on its own
      // "an unrepresentable arm makes the whole union unprovable" rule whatever
      // this arm answers. The invoke arm, the `.theta`-callable arm, and the
      // imported-`fn`-call route (`checkImportedFnCallArgs`,
      // ../extension/invoke-imported-checks.ts) compare `CompatType`s through
      // `checkCompatible` instead, which decides
      // `array<string> ⋢ string` — so for those consumers an unconditional
      // bail withheld a decidable case, not an undecidable one.
      //
      // An EXACTNESS-TESTED mirror of `#typeExpr`'s own array arm
      // (../parser/static-type-inference.ts): trusting `pass.typeOf`'s reduced
      // element type outright would repeat bug 0072's false-`E` species — that
      // reduction runs through `#commonType`, which can bless an unresolvable
      // sibling or fall back to `candidates[0]`, either of which erases a
      // member the runtime can still produce. Collecting the elements through
      // `collectArmUnion` and requiring their rendering to equal the reduction's
      // element rendering is the set-wise analogue of the parser-layer sibling's
      // own exactness test (`isProvenReduction`, `provableArgType`'s `array` arm
      // in ../parser/type-layer-checks.ts), and is what keeps this function's
      // own header invariant true: a collected member can never render
      // differently from the type the pass itself assigns.
      const reduced = pass.typeOf(expr, env);
      if (reduced.kind !== "array") {
        // An empty element list reduces to a nominal `unknown`, not an
        // `array` — `#commonType`'s empty-candidate-set fallback — so this
        // narrowing is also what keeps `[]` withheld, the same silence the
        // same-file `fn` surface already shows on `he([])`.
        return undefined;
      }
      const elements = collectArmUnion(expr.elements, env, pass);
      if (elements === undefined) {
        // An element past the parser's static view (e.g. an `ident`) withholds
        // the whole literal rather than reducing around it.
        return undefined;
      }
      return renderCollectedTypes(elements) === displayType(reduced.element)
        ? [reduced]
        : undefined;
    }
    case "ident":
    case "member":
    case "call":
    case "invoke":
    case "query":
    case "object":
    case "result-ctor":
    case "method-call":
      // Each types as a `named` nominal reference past the parser's static view
      // — the shape `checkCompatible` answers `unknown` for and the runtime AJV
      // net owns. `ident` included: all consumers below read types with an
      // EMPTY bindings map, so even a `let`-bound name is nominal here.
      return undefined;
    case "index":
    case "par-for":
      // Both CAN reduce past a nominal reference — an index read on a
      // statically-array target narrows to its element type, and a `par for` is
      // an `array` over a nominal `Result<…>` — so bailing is stricter than
      // `#typeExpr` needs. Deliberate: withholding suppresses an emission and
      // can never produce one, and neither shape is a Pi-tool argument field or
      // callable-argument idiom worth the extra reduction surface.
      return undefined;
  }
}

/**
 * Concatenate the collected value-type sets of a composite's value-contributing
 * operands, propagating `undefined` from any one of them: a composite one of
 * whose arms is unresolvable can take a value of unknown type, so nothing about
 * it is provable. An EMPTY concatenation is `undefined` too — `#commonType`
 * maps an empty candidate set to a nominal `unknown`, and a vacuously-true
 * "every arm is incompatible" must never read as a proof.
 */
function collectArmUnion(
  arms: readonly Expr[],
  env: TypeEnv,
  pass: StaticTypeInferencePass,
): CompatType[] | undefined {
  const collected: CompatType[] = [];
  for (const arm of arms) {
    const armTypes = collectProvableArgTypes(arm, env, pass);
    if (armTypes === undefined) {
      return undefined;
    }
    collected.push(...armTypes);
  }
  return collected.length > 0 ? collected : undefined;
}

/**
 * Render a collected value-type set for the `<actual>` placeholder: each member
 * through `displayType`, deduplicated, joined with `" | "` — the top-level-union
 * spelling `subsetKinds` (../runtime/tool-call.ts) splits back into kinds and
 * the same spelling an author-written union annotation carries. Deduplication
 * keeps a composite whose arms all render alike reading exactly as one arm does,
 * so `flag ? 1 : 2` renders `integer` rather than `integer | integer`. `Set`
 * iteration is insertion-ordered, so the arms render in source order.
 */
export function renderCollectedTypes(types: readonly CompatType[]): string {
  return [...new Set(types.map((type) => displayType(type)))].join(" | ");
}

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
    readonly checkClauseCwdType: (input: {
      readonly clause?: CallWithClause;
      readonly surface: { readonly kind: "invoke"; readonly providedCount: number };
      readonly file: string;
      readonly fallbackRange: SourceRange;
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
  const { resolveCalleeAbsolute, checkClauseCwdType, buildInvokeArgSlot } = deps;
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
          hasErrors: true,
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
    // RFC 0009 (invocation.md INV-8 static mode gate) via the shared
    // `withClausePromptModeRefusal` helper (also called by the
    // `.theta`-callable surface's own arm, `checkThetaCallableCallSurface`):
    // a call-site `with` clause addresses the spawned child process, so a
    // statically-resolvable PROMPT-mode callee under a clause is refused
    // here, before the arity/type block. `arity === undefined` means the
    // callee is not statically resolvable, and then NO parse code fires —
    // the runtime validation arm owns that case (registry row Trigger);
    // passing `arity?.mode` preserves that narrowing. `<callee>` renders
    // the verbatim path literal, this arm's existing rendering rule.
    const clauseRefusal = withClausePromptModeRefusal({
      ...(invoke.withClause !== undefined ? { clause: invoke.withClause } : {}),
      mode: arity?.mode,
      file: site.file,
      range: site.range,
      presented: invoke.path,
    });
    let clauseRefused = false;
    if (clauseRefusal !== undefined) {
      diagnostics.push(clauseRefusal);
      clauseRefused = true;
    }
    // INV-6: the clause's `cwd` value is judged exactly as an argument slot —
    // expected `string`, the ordinary type diagnostic, no dedicated code
    // (registry `invoke-arg-type-mismatch` Trigger). Independent of the
    // arity/type block below (a mismatched argument AND a mismatched cwd each
    // report), withheld only when this site already drew a clause refusal.
    if (!clauseRefused) {
      diagnostics.push(
        ...checkClauseCwdType({
          ...(invoke.withClause !== undefined ? { clause: invoke.withClause } : {}),
          surface: { kind: "invoke", providedCount },
          file: callerPath,
          fallbackRange: invoke.range,
          typeEnv,
          typePass,
        }),
      );
    }
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
