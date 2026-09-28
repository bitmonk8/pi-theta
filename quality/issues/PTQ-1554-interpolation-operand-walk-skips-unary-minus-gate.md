---
id: PTQ-1554
title: checkInterpolationOperands never runs the bug-0392 unary-minus operand gate, so a statically non-numeric unary '-' in a ${…} interpolation parses clean where the body-statement binary arm refuses it
lens: D6
status: open
verdict: confirmed
locations:
  - src/parser/type-layer-interpolation.ts:202-243
  - src/parser/type-layer-operand-checks.ts:54-79
  - src/parser/type-layer-operand-checks.ts:416-433
sites: 3
fix_scope: module
d6_class: posture-divergence
d6_anchor: theta/parse/non-numeric-arithmetic-operands (code-registry-parse.md:43 Trigger "also fires on unary `-`'s single operand when that operand's type is not `number`/`integer` (bug 0392)"; expressions.md §"Other arithmetic")
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# checkInterpolationOperands never runs the bug-0392 unary-minus operand gate, so a statically non-numeric unary '-' in a ${…} interpolation parses clean where the body-statement binary arm refuses it

## Observation
Two type-layer paths apply the operand-type gates to a binary node. `checkBinaryOperands` covers body-statement expressions. `checkInterpolationOperands` covers `${…}` query interpolations; bug 0345 added it so the same operand checks reach interpolation expressions. Since bug 0392 (0.387.0), the body path has a fourth arithmetic arm, `checkUnaryArithmeticOperand`. For a unary-marked `-` whose operand is statically resolvable and not numeric, that arm emits `theta/parse/non-numeric-arithmetic-operands`. The interpolation path has no such arm. It excludes the unary node from `checkArithmeticOperands` and judges its operand with nothing. As a result, `@\`v=${-true}\`` parses with zero diagnostics, while `let _ = -true` is refused. Measured in this session for `-true`, `-"a"` and `-[1]`: the interpolation gives `[]` and the `let` gives the code in every case. The binary `true - 1` is refused on both paths.

## Evidence
Divergent side, interpolation operand walk, `src/parser/type-layer-interpolation.ts:202-243` (excerpted):
```ts
 * The operand-only recursive walk {@link checkQueryInterpolationOperands}
 * drives. Fires the three operand checks the same way the body-statement
 * `walkExpr` binary arm does — including the same unary-minus guard, since
 * `parseUnary` (theta-document.ts) can hand this walk the same synthetic-
 * `null`-left binary node the body path excludes — then recurs into every
...
  if (parsed.kind === "binary") {
    if (parsed.op === "+") {
      checkPlusOperands(walk, parsed, bindings);
    } else if (ORDERING_OPS.has(parsed.op)) {
      checkOrderingOperands(walk, parsed, bindings);
    } else if (
      ARITHMETIC_OPS.has(parsed.op) &&
      !(parsed.op === "-" && parsed.left.kind === "null")
    ) {
      checkArithmeticOperands(walk, parsed, bindings);
    }
  }
```

Sibling side, body-statement dispatch, `src/parser/type-layer-operand-checks.ts:54-79` (excerpted):
```ts
  } else if (e.op === "+") {
    checkPlusOperands(walk, e, bindings);
  } else if (ORDERING_OPS.has(e.op)) {
    checkOrderingOperands(walk, e, bindings);
  } else if (ARITHMETIC_OPS.has(e.op) && e.unary !== true) {
    ...
    checkArithmeticOperands(walk, e, bindings);
  } else if (ARITHMETIC_OPS.has(e.op) && e.unary === true) {
    // The marked unary node's placeholder `null` left operand is not a
    // real pairing (see the comment above), but its single `right`
    // operand IS the real unary `-` operand — expressions.md §"Other
    // arithmetic" applies the same numeric-only rule to it (bug 0392;
    ...
    checkUnaryArithmeticOperand(walk, e, bindings);
  }
```

The sibling's emitter, `src/parser/type-layer-operand-checks.ts:416-433` (excerpted):
```ts
function checkUnaryArithmeticOperand(
  walk: TypeWalkContext,
  e: Expr & { kind: "binary" },
  bindings: ReadonlyMap<string, CompatType>,
): void {
  const rightType = walk.typeOf(e.right, bindings);
  const right = classifyOperand(rightType, walk.env);
  if (right === "unknown" || right === "numeric") {
    return;
  }
  walk.diagnostics.push({
    severity: "error",
    code: "theta/parse/non-numeric-arithmetic-operands",
```

Sibling-class argument, stated mechanically: both functions take a `binary` `Expr` plus the same `bindings`, and dispatch on `op` to the same operand-check functions imported from ./type-layer-operand-checks.ts. The interpolation file imports `checkArithmeticOperands`, `checkOrderingOperands` and `checkPlusOperands` (type-layer-interpolation.ts:27-31). The failure class is the same: a unary `-` node whose single operand `classifyOperand` resolves to a non-`"numeric"`, non-`"unknown"` category. Only the body path reaches an emitter for it. `grep -rn "checkUnaryArithmeticOperand" src/` → 4 hits: one definition, one call (type-layer-operand-checks.ts:78) and two comment mentions (type-layer-provable.ts:211, executor-defects.ts:58). No call exists on the interpolation path.

Anchor, quoted from `docs/spec_topics/diagnostics/code-registry-parse.md:43` (the registered Trigger of the code):
> also fires on unary `-`'s single operand when that operand's type is not `number`/`integer` (bug 0392); … Fires only when the operand(s) are statically resolvable, mirroring the ordering-operator check.

and from `docs/spec_topics/expressions.md:236` §"Other arithmetic":
> A non-numeric operand under unary `-` is `theta/parse/non-numeric-arithmetic-operands` when statically resolvable, and aborts loudly (`theta/runtime/internal-error`) when the operand is laundered past that gate — the same two-layer disposition as the binary operators above.

Measurements run this session. A scratch probe under $TEMP called `parseThetaDocument` with inert deps, using the b0345 test's `interpSrc` / `rhsSrc` shapes under `---\nmode: prompt\n---\n`:
- interp `-true` → `[]`; rhs `-true` → `["theta/parse/non-numeric-arithmetic-operands :: unary '-' requires a numeric operand; got boolean"]`
- interp `-"a"` → `[]`; rhs `-"a"` → `[... got string]`
- interp `-[1]` → `[]`; rhs `-[1]` → `[... got array<integer>]`
- interp `true - 1` → `["… '-' requires two numeric operands; got boolean and integer"]`; rhs same (binary control, both paths refuse)

## Why this is a problem
The registered Trigger and expressions.md §"Other arithmetic" do not depend on position. A statically-resolvable non-numeric unary `-` operand is a parse refusal, and only a laundered operand falls to the runtime `UnaryNonNumericError` belt. Bug 0345's own premise is that QRY-18 evaluates an interpolation "per the Expression Sublanguage", so the body's operand gates must reach it. The interpolation path still has the pre-0392 posture: the class is silent at parse and caught only by the runtime belt at render. The body path refuses it at load. The interpolation walk's doc comment says it fires the checks "the same way the body-statement `walkExpr` binary arm does". Since 0392 that is false for this arm.

## Suggested direction (non-binding, optional)
Give the interpolation operand walk the same unary-`-` operand arm the body dispatch has, keyed on the same `unary` marker, so both paths judge that class alike.

## False-positive check
- EXST-9 / PIC-73 class check: neither applies. This is parse-time type-layer diagnostics, not an execution-status sink or an optional degrade-silent capability.
- allow-broad-catch token check: no catch at any cited site. `grep -n "catch"` over type-layer-interpolation.ts and type-layer-operand-checks.ts finds only a comment at type-layer-operand-checks.ts:376 ("belt catches a"), which is not a catch clause.
- Stated-rationale check:
  - Bug 0345 §Non-goals (`docs/bugs/0345-…md:216-218`) excludes "Unary `-` in expression position — a §Non-goal in bugs 0332 and 0338 … not changed here", and its pinned dispositions repeat "no unary-minus change". That rationale rested on 0332's "unary `-` NOT gated" disposition. Bug 0392's fix record states it appended a discharge note on 0332 "narrow[ing] its 'unary `-` NOT gated' disposition to numeric operands only" and added the gate in the body arm. The premise of 0345's exclusion is therefore demonstrably false now.
  - Bug 0392's §Non-goals and pinned dispositions do not mention the interpolation parse path. Its boundedness note lists "interpolation" among the escape routes of the direct spelling, and its interpolation witness rows (PH1/PHc in tests/b0392-unary-minus-operand-discipline.test.ts) cover only the laundered `fn f(x) { @\`v=${-x}\` }` runtime belt, not a resolvable operand. `grep -rn 'interpSrc("-\|\${-"\|\${-true\|\${-\[' tests/*.test.ts` → 0 hits, so no cell pins the resolvable-operand interpolation silence.
  - Bug 0367 pins the separate `${null - 3}` authored-null-left interpolation case as "refused at RUNTIME (pure-host belt), not at parse, per §Fix's one-parse-site scope". That pinned case is excluded here. The `!(parsed.op === "-" && parsed.left.kind === "null")` guard is not what this finding cites.
- Sibling-reality check: both paths are live. `walkExpr` `case "binary"` calls `checkBinaryOperands`, and `walkExpr` `case "query"` calls `checkQueryInterpolationOperands` → `checkInterpolationOperands` (type-layer-walk.ts query arm). The probe results above come from the shipped `parseThetaDocument`.
- Routing notes (not filed here): the interpolation walk also runs no boolean-position check for `!` / `&&` / `||`. Measured: interp `!"a"`, `"a" && true` and `1 || false` → `[]`, while the rhs control draws `theta/parse/non-boolean-condition`. Bug 0345 scoped its descent to "the three operand checks" and never discussed the boolean rows, so that is a separate scoping question and is left unfiled.

## Triage
verdict: confirmed — both sides match the cited lines: checkInterpolationOperands (type-layer-interpolation.ts:220-243) has no unary arm, and checkBinaryOperands' `e.unary === true` arm (type-layer-operand-checks.ts:71-79) calls checkUnaryArithmeticOperand (:416). The grep gives the stated 4 hits, with the only call at :78, and the test grep gives 0 hits. Re-probed through e2e-s1 parseDoc: interpolated `-true` / `-"a"` / `-[1]` give [], while the let rhs draws non-numeric-arithmetic-operands ("unary '-' requires a numeric operand"). `true - 1` is refused on both paths. The anchor holds: code-registry-parse.md:43 Trigger and expressions.md:236 make a statically-resolvable non-numeric unary `-` operand a parse refusal whatever its position. Bug 0392's §Non-goals and pinned dispositions do not exclude the interpolation parse path, and 0345's "no unary-minus change" came before 0392. No existing PTQ or intake tracks it (triage: claude-opus-5-5)
