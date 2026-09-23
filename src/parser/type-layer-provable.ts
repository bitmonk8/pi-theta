// Provability inference for the per-parse type-layer walk
// (./type-layer-walk.ts) — the bug 0050 / bug 0079 channels: whether a static
// type read is a PROOF of an expression's runtime value type. A withheld
// proof defers a judgement to runtime; it never manufactures a diagnostic.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { Expr, PatternNode } from "./theta-document";
import { checkCompatible, type CompatType, type TypeEnv } from "./type-compat";
import { BOOLEAN_BINARY_OPS, type StaticTypeInferencePass } from "./static-type-inference";
import { classifyOperand } from "./type-layer-checks";

/**
 * The per-parse state `TypeLayerWalk` (./type-layer-walk.ts) shares with the
 * check helpers split out of it (this module, ./type-layer-operand-checks.ts
 * and ./type-layer-interpolation.ts): the injected pass / env / file /
 * callee-resolution tables, the accumulated diagnostics, the two provenance
 * accumulators, and the walk's own `typeOf` / `matchArmScope` resolution
 * methods. The walk implements it and passes itself.
 */
export interface TypeWalkContext {
  readonly pass: StaticTypeInferencePass;
  readonly env: TypeEnv;
  readonly file: string;
  readonly fnReturns: ReadonlyMap<string, string>;
  readonly diagnostics: Diagnostic[];
  readonly resultBindings: ReadonlySet<CompatType>;
  readonly unprovableBindings: ReadonlySet<CompatType>;
  typeOf(expr: Expr, bindings: ReadonlyMap<string, CompatType>): CompatType;
  matchArmScope(
    pattern: PatternNode,
    bindings: ReadonlyMap<string, CompatType>,
  ): ReadonlyMap<string, CompatType>;
}

/**
 * Whether `walk.typeOf(expr, bindings)` is a PROOF of `expr`'s runtime value
 * type — `undefined` withholds `checkFnCallArgs`'s judgement rather than
 * trusting an unproven read.
 *
 * `StaticTypeInferencePass.#commonType` reduces a candidate set to one type
 * by two lossy mechanisms: a statically unresolvable candidate never blocks
 * another candidate ("unknown-blessing"), and a set with no common upper
 * bound falls back to `candidates[0]`. Both are reachable at an argument
 * position: `true ? 1 : obj.field` reads `integer` (the unresolvable branch
 * never blocks it), and `true ? A { a: 1 } : B { b: "x" }` reads `A`, rule
 * 3's own fallback. Both erase a sibling arm the runtime can still produce.
 * Emitting on an erased read would refuse a theta whose runtime value the
 * emission misdescribes: bug 0072's landed soundness lesson at the
 * `.theta`-callable argument sink (`collectProvableArgTypes`,
 * `../extension/invoke-static-checks.ts`) applied here at a new sink. That
 * function is an extension-layer answer over the SET of types an expression
 * can take and cannot be imported into this parser-layer module without
 * inverting the dependency direction, so the same discipline is applied
 * in-layer as an EXACTNESS test instead (`isProvenReduction` below).
 *
 * Exhaustive `switch` over the `Expr` union with no `default` arm, so a kind
 * added to the union without an arm here is a compile error rather than a
 * silent verdict.
 */
export function provableArgType(
  walk: TypeWalkContext,
  expr: Expr,
  bindings: ReadonlyMap<string, CompatType>,
): CompatType | undefined {
  switch (expr.kind) {
    case "number":
    case "string":
    case "bool":
    case "null":
      // A literal's read IS its value's type.
      return walk.typeOf(expr, bindings);
    case "ternary": {
      const reduced = walk.typeOf(expr, bindings);
      return isProvenReduction(walk, [expr.consequent, expr.alternate], reduced, bindings)
        ? reduced
        : undefined;
    }
    case "match": {
      const reduced = walk.typeOf(expr, bindings);
      // Each arm body is proven in THAT ARM's scope, the one the walk uses
      // (`matchArmScope`): a proof taken in the enclosing scope would prove a
      // binding the arm body does not read, which is the false-`E` shape this
      // whole predicate exists to refuse. The reduction is taken in the same
      // scope without being asked for it here: `typeOf` reaches
      // `StaticTypeInferencePass`'s own `case "match"`
      // (./static-type-inference.ts), which types every arm body under that
      // arm's binders, so `reduced` and the proof below answer for one
      // reading of the arm bodies rather than two.
      return isProvenReduction(walk,
        expr.arms.map((arm) => arm.body),
        reduced,
        bindings,
        expr.arms.map((arm) => walk.matchArmScope(arm.pattern, bindings)),
      )
        ? reduced
        : undefined;
    }
    case "array": {
      const reduced = walk.typeOf(expr, bindings);
      if (reduced.kind !== "array") {
        // `#typeExpr`'s own `"array"` arm always answers `kind: "array"`;
        // this is the narrowing `reduced.element` below needs, not a
        // reachable branch.
        return undefined;
      }
      // An empty element list satisfies `isProvenReduction`'s `every`
      // vacuously without proving anything about a runtime value.
      return isProvenReduction(walk, expr.elements, reduced.element, bindings)
        ? reduced
        : undefined;
    }
    case "binary":
      return provableBinaryType(walk, expr, bindings);
    case "try":
      // `operand?` propagates the operand's success type: a proof of the
      // operand is a proof of the `try` expression.
      return provableArgType(walk, expr.operand, bindings);
    case "block":
      // A block's value is its tail expression's value (bug 0082 §Fix
      // constraint 3): a proof of the tail, in the SAME `bindings` `typeOf`'s own
      // `"block"` arm reads (./static-type-inference.ts), is a proof of the
      // block — mirroring the `try` arm immediately above rather than
      // threading the block's own `let`s into a wider scope this predicate
      // does not otherwise build.
      return expr.body.tail === null
        ? undefined
        : provableArgType(walk, expr.body.tail, bindings);
    case "ident":
      return provableIdentType(walk, expr, bindings);
    case "method-call":
      // A read that mints a `named` type out of an author-chosen METHOD
      // name is not a proof of the value's type: `#typeExpr` answers
      // `named <method>` for `xs.length()`, which is not the type of the
      // value the call produces. The adjacent `interpolationIsResult`
      // refuses the same minted names for the same reason — a name an
      // author chose for a field or a method collides freely with a
      // declared schema's name, so reading meaning out of it judges an
      // unrelated namespace.
      //
      // No sound emission is lost by withholding here. A minted name that
      // resolves to nothing declared already defers at `checkCompatible`
      // (`"unknown"`), and one that DOES resolve is judging the declaration
      // that happens to share the spelling rather than the read value.
      return undefined;
    case "member":
      return provableMemberType(walk, expr, bindings);
    case "call":
    case "invoke":
      // A `named` type minted from an author-chosen CALLEE is not a proof of
      // the call's value type, for the reason the `method-call` arm above
      // already states at the method namespace: `#typeExpr` answers
      // `named <callee>` for `f(x)` and `named <path>` for an `invoke`, and
      // neither names the type of the value the call produces. The operand a
      // sound judgement needs is the callee's declared RETURN type, which
      // the substrate does not carry to this position.
      //
      // No sound emission is lost by withholding. A minted name resolving to
      // nothing declared already defers at `checkCompatible` (`"unknown"`),
      // and the only env a name CAN resolve in here is the schema-only
      // `TypeEnv` (`collectTypeEnv` — `schema` declarations, object form and
      // alias form; enums excluded), whose every entry is uppercase-first by
      // `theta/parse/schema-case-mismatch` while a user `fn` name is
      // lowercase-first by `theta/parse/binding-case-mismatch`. A callee
      // name that resolves is therefore never the callee's own type: it is a
      // schema that merely shares the spelling with a schema-cased callee —
      // a `.thetalib` import, a `.theta`-callable `as` alias, or a name the
      // callable set never had. An `invoke` shares the arm because its
      // minted path is a `.theta` path literal, which either ends in
      // `.theta` (unspellable as a schema name) or draws
      // `theta/parse/invoke-non-theta-extension` — one rule instead of two.
      return undefined;
    case "query":
    case "object":
    case "result-ctor":
    case "par-for":
      // Each is a nominal `named` reference naming the construct that
      // produced the value — a query's `as` schema, a constructed schema, a
      // `Result` constructor, a `par for`'s CTRL-3 element — so
      // `checkCompatible` either resolves the name it was given or answers
      // `"unknown"` and defers.
      return walk.typeOf(expr, bindings);
    case "index":
      // `#typeExpr` narrows an index read to the TARGET's ELEMENT type, and
      // that element object is not the object the two recording arms put in
      // `unprovableBindings` — the array type is — so an erased target would
      // launder its erasure through the narrowing, past the identity channel
      // the `ident` arm reads. The proof obligation belongs to the target:
      // recur on it the way the `try` arm recurs on its operand, and take
      // the element narrowing from `typeOf` only once the target is proven.
      return provableArgType(walk, expr.target, bindings) === undefined
        ? undefined
        : walk.typeOf(expr, bindings);
  }
}

/** Prove a binary result through its operator contract and operand reduction. */
function provableBinaryType(
  walk: TypeWalkContext,
  expr: Expr & { kind: "binary" },
  bindings: ReadonlyMap<string, CompatType>,
): CompatType | undefined {
  // `parseUnary` (./theta-document.ts) models unary `!` / `-` as a
  // binary carrying a synthetic `null` left operand; dispatch in
  // `#typeBinary`'s own order so the two never disagree on shape.
  if (expr.left.kind === "null" && expr.op === "-") {
    // A negation's value type is the OPERATOR's, not the operand's:
    // expressions.md §"Other arithmetic" gives unary `-` `integer` for an
    // `integer` operand and `number` for a `number` one and admits no
    // other result. Outside those two shapes the negation itself never
    // reaches a value: a statically resolvable non-numeric operand is
    // parse-refused by `checkUnaryArithmeticOperand`, and a laundered
    // one throws `UnaryNonNumericError` at the runtime belt — so there
    // is no value left for the operand's proof to describe, and
    // withholding is the only sound answer outside the numeric shapes.
    //
    // `classifyOperand` is this module's one numeric test, shared with
    // the A5 `+` and A6 ordering operand checks over the same operator
    // family, so the two cannot drift on which `CompatType` shapes count
    // as numeric — a `prim` `integer` / `number` from an annotation
    // (`annotationToCompatType`), a `literal` typing as either from a
    // numeric literal (`#typeExpr`), or a transparent alias (TYPE-11)
    // unfolding to one of those.
    const operand = provableArgType(walk, expr.right, bindings);
    if (operand === undefined || classifyOperand(operand, walk.env) !== "numeric") {
      return undefined;
    }
    return operand;
  }
  if ((expr.left.kind === "null" && expr.op === "!") || BOOLEAN_BINARY_OPS.has(expr.op)) {
    // Result-fixed: the value is a boolean whatever the operands
    // evaluate to, so the read is exact even where an operand is not.
    return walk.typeOf(expr, bindings);
  }
  // Arithmetic narrows the operands through `#commonType`, the same
  // erasure risk as `ternary` / `match` above.
  const reduced = walk.typeOf(expr, bindings);
  if (!isProvenReduction(walk, [expr.left, expr.right], reduced, bindings)) {
    return undefined;
  }
  // `isProvenReduction` tests the reduction's EXACTNESS, not the
  // operator's ADMISSIBILITY, so a same-typed pair of proven non-numeric
  // operands passes it — and for `-`, `*`, `/`, `%` the result type is
  // fixed by the operator: expressions.md §"Other arithmetic" gives
  // those four `integer` or `number` for every input (NaN included, which
  // is a `number`), and the runtime casts both operands to reach it
  // (`applyBinaryScalar`, ../runtime/statement-executor.ts), so
  // `"a" - "b"` is the number NaN rather than the `string` the reduction
  // names. An operand's own type is not a proof of the expression's value
  // type outside the numeric shapes, and withholding can only suppress an
  // emission.
  //
  // `+` keeps the reduction, because there the reduction IS the result
  // type: expressions.md §"`+` operator" makes a both-`string` pair
  // concatenation and a both-numeric pair addition, and every other
  // pairing fails to load on `theta/parse/mixed-plus-operands`.
  return expr.op === "+" || classifyOperand(reduced, walk.env) === "numeric"
    ? reduced
    : undefined;
}

/** Read a recorded identifier type only when its provenance is proven. */
function provableIdentType(
  walk: TypeWalkContext,
  expr: Expr & { kind: "ident" },
  bindings: ReadonlyMap<string, CompatType>,
): CompatType | undefined {
  // The RECORDED type is the only channel that carries a JUDGED type, so
  // it is read here directly rather than through `typeOf`: `#typeExpr`'s
  // own `ident` arm (./static-type-inference.ts) falls back to
  // `{ kind: "named", name }` MINTED FROM THE IDENTIFIER'S OWN SPELLING
  // for any name the map does not hold, and a name an author chose for a
  // value proves nothing about that value's type — where the spelling
  // collides with a declared schema it resolves and is judged nominally
  // (TYPE-10) against a declaration the read has nothing to do with,
  // which is the false-judgement shape the `member` arm's field-name
  // fallback, the `method-call` arm, and the `call` / `invoke` arms
  // below refuse over the field and callee namespaces. `bindings` is
  // still not a complete local view (a `params:` field reaches it now,
  // by bug 0192 §Fix, but other names legitimately resolve without ever
  // reaching this map): a `tools:`-declared callable name read as a
  // VALUE, for instance, resolves through the lexical layer's own
  // `identRoots` rather than through `bindings` at all — measured, a
  // plain `fn` call passing one as an argument draws no diagnostic here,
  // where the same position over an undeclared name draws
  // `theta/parse/unknown-identifier` instead. So a MISS still means "not
  // recorded", never "no such binding", and the only sound answer is to
  // withhold. The binder classes this layer cannot type are recorded as
  // WITHHELD entries instead of being left to miss
  // (`recordWithheldBinders`), so where an inner binder hides a same-named
  // outer record the hit is that binder's own withheld entry, never the
  // record the runtime does not read there. That entry's own name is
  // unspellable (`WITHHELD_BINDER_TYPE_NAME`), which keeps the nominal
  // collision described above out of the sibling rows that read this map
  // by value rather than by identity. `Map.get` against an explicit
  // `undefined` rather than a truthiness test, because the key is
  // author-controlled source text.
  const recorded = bindings.get(expr.name);
  if (recorded === undefined) {
    return undefined;
  }
  // The laundered-binding hole: an unannotated `let` can record an
  // unprovable initialiser read as the binding's type (`walkStmt`'s
  // `let` arm), and `bindings.get(name)` returns that EXACT object, so
  // identity is the channel back to the erasure a name read alone
  // cannot see.
  return walk.unprovableBindings.has(recorded) ? undefined : recorded;
}

/** Prove the receiver before reading its declared member type. */
function provableMemberType(
  walk: TypeWalkContext,
  expr: Expr & { kind: "member" },
  bindings: ReadonlyMap<string, CompatType>,
): CompatType | undefined {
  // PROOF iff both hold: the RECEIVER is itself a proven read
  // (`provableArgType(expr.target, bindings)` is defined) AND the read
  // resolves to a DECLARED field type on a resolved object schema —
  // `StaticTypeInferencePass`'s own-key-guarded branch, reached here
  // through `declaredFieldType`. The proven answer IS that declared
  // field type, TYPE-11-unfolded.
  //
  // (1) Why a declared field type is a proof at all. Bug 0136 made a
  // member read's static type the receiver's declared field type, and
  // wrote the rule into expressions.md's Member access bullet: the
  // static result type of `obj.field` is the receiver's declared type
  // for that field, TYPE-11-unfolded. TYPE-9 conditions this sink's
  // obligation on both operands being statically resolvable, and a
  // declared field on a resolved object schema is read straight out of
  // the `TypeEnv` rather than left past the parser's static view.
  //
  // (2) Why the arm's other two outcomes are not proofs. The
  // field-name mint (an absent field, a fields-less declaration, or a
  // declined `typeSource`) is author-chosen and can RESOLVE against an
  // unrelated declaration sharing its spelling — `schema Zzz = integer`
  // beside `p.Zzz` on a `P` that declares no `Zzz` — and
  // expressions.md's Member access bullet assigns an absent
  // theta-side name a RUNTIME `theta/runtime/missing-object-key`
  // panic; judging the mint would refuse at `E` a program whose
  // specified disposition is a panic. The receiver's own `named`, for
  // an unresolvable receiver, is exactly what `checkCompatible`
  // answers `"unknown"` for and defers.
  //
  // (3) Why the RECEIVER's own proof is a further, separate
  // obligation — a soundness requirement this arm cannot ship
  // without, not a preference. An erased receiver launders its
  // erasure through the field lookup: for
  // `let m = flag ? A { s: "x" } : B { s: 1 }`, the ternary is not a
  // proven reduction (`#commonType` rule 3 falls back to
  // `candidates[0]`, discarding the `B` arm), so `m` is recorded in
  // `unprovableBindings` (read here through the `ident` arm's identity
  // check) — and `m.s` then resolves against `A` and answers `string`,
  // while the runtime can hand the callee a `B` whose `s` IS the
  // `integer` the parameter declares. Without this clause that program
  // draws a false
  // `theta/parse/fn-arg-type-mismatch: expected integer, got string`.
  // This is the same species as the `index` arm's own obligation
  // below: "The proof obligation belongs to the target: recur on it
  // the way the `try` arm recurs on its operand"; this arm carries the
  // identical obligation over its RECEIVER. The conservatism this
  // buys: where an erased receiver's candidate schemas happen to
  // declare the same field type, withholding loses a sound emission —
  // but withholding can only ever suppress an emission, never
  // manufacture one, which is the asymmetry the whole predicate is
  // built on.
  return provableArgType(walk, expr.target, bindings) === undefined
    ? undefined
    : walk.pass.declaredFieldType(expr, walk.env, bindings);
}

/**
 * The exactness test every composite `provableArgType` arm
 * (`ternary` / `match` / `array` / arithmetic `binary`) shares: every member
 * of `arms` must itself be a proven read (`provableArgType` defined) AND
 * relate to `reduced` — the pass's own narrowed answer for the composite —
 * by `checkCompatible(armType, reduced, env) === "compatible"`. An undefined
 * arm, or an `"unknown"` / `"incompatible"` relation, withholds the whole
 * composite: `"unknown"` must withhold rather than pass, because trusting it
 * would be the unknown-blessing mechanism this test exists to refuse. An
 * empty `arms` satisfies `every` vacuously without proving anything about a
 * runtime value, so it withholds too, never trusts.
 *
 * `armScopes`, when supplied, gives arm `i` its OWN scope: a `match` arm's
 * body is evaluated with that arm's pattern bindings installed, so the proof
 * of that body has to be taken there. Every other composite's arms are
 * evaluated in the one enclosing scope and omit it.
 */
function isProvenReduction(
  walk: TypeWalkContext,
  arms: readonly Expr[],
  reduced: CompatType,
  bindings: ReadonlyMap<string, CompatType>,
  armScopes?: readonly ReadonlyMap<string, CompatType>[],
): boolean {
  if (arms.length === 0) {
    return false;
  }
  return arms.every((arm, index) => {
    const armType = provableArgType(walk, arm, armScopes?.[index] ?? bindings);
    return (
      armType !== undefined && checkCompatible(armType, reduced, walk.env) === "compatible"
    );
  });
}
