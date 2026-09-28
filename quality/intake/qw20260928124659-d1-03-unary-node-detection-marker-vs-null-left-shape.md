---
id: pending
title: `BinaryExpr.unary` (theta-ast.ts) is documented as the one way consumers recognise `parseUnary`'s minted node, but four consumers — including `StaticTypeInferencePass.#typeBinary` — still recognise it by the `left.kind === "null"` shape, the predicate bug 0367 recorded as the defect mechanism
lens: D1
status: intake
verdict: pending
locations:
  - src/parser/theta-ast.ts:65-72
  - src/parser/static-type-inference.ts:783-797
  - src/parser/type-layer-provable.ts:202-205
  - src/parser/type-layer-provable.ts:229
  - src/parser/type-layer-interpolation.ts:233-237
  - src/parser/type-layer-operand-checks.ts:58-71
  - src/runtime/statement-executor.ts:650
  - src/runtime/pure-expression-evaluator.ts:252
  - src/runtime/pure-expression-evaluator.ts:483
sites: 9
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# `BinaryExpr.unary` (theta-ast.ts) is documented as the one way consumers recognise `parseUnary`'s minted node, but four consumers — including `StaticTypeInferencePass.#typeBinary` — still recognise it by the `left.kind === "null"` shape, the predicate bug 0367 recorded as the defect mechanism

## Observation

`parseUnary` lowers unary `-` / `!` to a `binary` node with a synthetic `null` left operand and, since bug 0367, sets `unary: true` on that one node. The AST contract in `theta-ast.ts` documents the marker as the consumers' discriminator ("the consumers that special-case unary minus key on this marker, not on `left.kind === "null"`"). Today the codebase recognises the minted node two ways: five sites test `unary === true` (the operand-check gate, both runtime hosts) and four sites test `left.kind === "null"` (the static-type-inference pass in scope, the provable-type reducer at two arms, and the interpolation operand gate). Bug 0367's fix record re-keyed one parse site and both runtime arms and left the other parse-side sites on the shape predicate by stated scope; the contract comment written in that same fix nonetheless describes the marker as the only way.

## Evidence

**The contract.** `src/parser/theta-ast.ts:65-72`:
```ts
  /**
   * Set only on the binary node `parseUnary` mints for unary `-`/`!` (a
   * synthetic `null` left operand). Distinguishes that lowering from an
   * authored binary whose left operand is a literal `null`, which is
   * AST-identical without it — the consumers that special-case unary minus
   * key on this marker, not on `left.kind === "null"`.
   */
  readonly unary?: boolean;
```
Producer (one): `src/parser/body-parser.ts:2088-2095`:
```ts
      return {
        kind: "binary",
        op: op.text,
        left: nullExpr(op.range),
        right: operand,
        range: spanRange(op.range, operand.range),
        unary: true,
      };
```

**Way M — marker.** Search: `grep -rn "\.unary\b\|unary: true\|unary === true" src/` — 8 hits:
```
src/parser/body-parser.ts:2094:        unary: true,
src/parser/static-type-inference.ts:780:    // (`evaluateBinaryExpression`: `op === "-" && unary === true`, and the `!`
src/parser/type-layer-operand-checks.ts:58:  } else if (ARITHMETIC_OPS.has(e.op) && e.unary !== true) {
src/parser/type-layer-operand-checks.ts:61:    // minted node `unary: true`. The spec's numeric-operand rule for
src/parser/type-layer-operand-checks.ts:71:  } else if (ARITHMETIC_OPS.has(e.op) && e.unary === true) {
src/runtime/pure-expression-evaluator.ts:252:      return evaluateBinaryExpression(expr.op, expr.left, expr.right, env, chain, expr.unary === true);
src/runtime/pure-expression-evaluator.ts:483:  if (op === "-" && unary === true) {
src/runtime/statement-executor.ts:650:  if (expr.op === "-" && expr.unary === true) {
```
(1 producer, 2 comment mentions, 5 reading sites.) `src/parser/type-layer-operand-checks.ts:66-69`:
```ts
    // pairing. Gating on the marker (bug 0367) rather than on
    // `e.left.kind === "null"` keeps an authored `null - x` in scope:
    // that pairing is AST-identical to the synthetic node except for
    // the marker, and the spec names `null` in the refusal set.
```

**Way S — shape.** Search: `grep -rn 'left\.kind === "null"' src/` — 6 hits:
```
src/parser/static-type-inference.ts:789:    if (left.kind === "null") {
src/parser/theta-ast.ts:70:   * key on this marker, not on `left.kind === "null"`.
src/parser/type-layer-interpolation.ts:236:      !(parsed.op === "-" && parsed.left.kind === "null")
src/parser/type-layer-operand-checks.ts:67:    // `e.left.kind === "null"` keeps an authored `null - x` in scope:
src/parser/type-layer-provable.ts:205:  if (expr.left.kind === "null" && expr.op === "-") {
src/parser/type-layer-provable.ts:229:  if ((expr.left.kind === "null" && expr.op === "!") || BOOLEAN_BINARY_OPS.has(expr.op)) {
```
(2 comment mentions, 4 reading sites.) In scope, `src/parser/static-type-inference.ts:783-797`:
```ts
    // the A5 mixed-operand / A6 ordering operand-type checks). This static
    // site can stay wider than the runtime's marker check: a genuine unary
    // node always carries a `null` left operand, and an authored `null - x`
    // is parse-refused on the statement path and runtime-belted on the
    // re-lexed (interpolation/invoke-arg) paths, so typing the authored
    // pairing as unary here is moot — no marker is needed at this layer.
    if (left.kind === "null") {
      if (op === "!") {
        return exactValue({ kind: "prim", name: "boolean" });
      }
      if (op === "-") {
        // Negation carries the operand's own type and value-type set.
        return this.#typeValue(right, env, bindings);
      }
    }
```
`src/parser/type-layer-provable.ts:202-205` — a shape-way site that anchors itself to the in-scope pass rather than to the marker:
```ts
  // `parseUnary` (./theta-document.ts) models unary `!` / `-` as a
  // binary carrying a synthetic `null` left operand; dispatch in
  // `#typeBinary`'s own order so the two never disagree on shape.
  if (expr.left.kind === "null" && expr.op === "-") {
```
`src/parser/type-layer-interpolation.ts:233-237`:
```ts
    } else if (
      ARITHMETIC_OPS.has(parsed.op) &&
      !(parsed.op === "-" && parsed.left.kind === "null")
    ) {
      checkArithmeticOperands(walk, parsed, bindings);
```

**Drift that already happened.** `docs/bugs/0367-null-left-binary-minus-parses-as-unary-negation.md:63-72` (the report's mechanism):
```
The parser lowers unary minus to `binary(-, <synthetic null>, operand)` where
…
`null`. Every consumer that must special-case unary minus therefore keys on
`left.kind === "null"` — the 0332 parse gate's carve-out and both runtime
hosts' unary arms — and every one of them necessarily also captures the
```
`:171-176` (what the fix re-keyed, and what it left):
```
  - `src/parser/type-layer-checks.ts` — the `walkExpr` arithmetic carve-out is
    re-keyed `ARITHMETIC_OPS.has(e.op) && e.unary !== true`, so an authored
    `null - x` reaches `checkArithmeticOperands` and draws
    `theta/parse/non-numeric-arithmetic-operands` (§Fix step 2). The separate
    `checkInterpolationOperands` carve-out is deliberately left keyed on
    `left.kind === "null"` — §Fix's one-parse-site scope.
```
`:183-185`:
```
  - `src/parser/static-type-inference.ts` — comment-only: the stale runtime
    predicate cited in `#typeBinary`'s mirror comment updated to the marker
    (collateral of the producer edit; the wide static-layer detector stays).
```
`:213-217` (pinned disposition):
```
- Pinned dispositions / non-goals: genuine unary `-` on non-numeric operands
  (spelled `-"a"`) stays bug-0332's non-goal, now merely expressible to belt
  later; an interpolation `${null - 3}` is refused at RUNTIME (pure-host belt),
  not at parse, per §Fix's one-parse-site scope; no new diagnostic code (the
```
The contract comment (`theta-ast.ts:69-70`) was written in that same fix: `git log --oneline -S'key on this marker, not on' -- src/` — 2 hits:
```
7a0d5e0e quality: qw20260921120149 fix d9/src__parser__theta-document.ts
edf0c2b2 fix(bug-0367): authored null-left binary minus refuses at parse — v0.378.0
```
So the declaration site has claimed "consumers key on this marker" since the marker's introduction, while the same commit knowingly left the static-layer detector and the interpolation carve-out on the shape.

**What a maintainer gets wrong.** Bug 0367 is the recorded instance: the shape predicate is wider than the intent (it captures an authored `null - x`), and the fix had to hunt every consumer by hand. A maintainer reading the contract at `theta-ast.ts:65-72` is told the hunt is over — every consumer keys on the marker — and would not look for the four shape-keyed sites when the lowering changes (e.g. if `parseUnary` ever stops minting a `null` left operand, or if a second producer of a `null`-left `binary` appears, the marker sites are unaffected and the shape sites silently reclassify). `type-layer-provable.ts:204` compounds it by anchoring to `#typeBinary`'s shape dispatch ("so the two never disagree on shape") instead of to the field the AST says is the discriminator.

**Self-inconsistency statement.** No written rule exists (the pinned disposition fixes the *behaviour* at the interpolation site — refusal at runtime, not parse — and says nothing about which predicate the static-type pass or the provable reducer must key on); the anchor is self-inconsistency (one minted node, two recognisers, a contract comment that names only one) plus the cost cited above (bug 0367, and a declaration-site comment that misdescribes four live consumers).

## Why this is a problem

The `unary` marker exists precisely because the shape predicate was proven ambiguous (bug 0367 §Summary: "indistinguishable in the AST from unary minus"). Two recognisers for one node means the ambiguity the marker was minted to remove still governs four sites, and the field's own documentation hides that. This filing does not claim the interpolation site's pinned runtime-refusal disposition is wrong — that is a behaviour ruling outside this lens — only that the AST contract and the static-layer sites disagree with each other on how the minted node is recognised, and that this disagreement has already produced one recorded defect.

## Suggested direction (non-binding, optional)

Unproven hypothesis: the two in-scope-adjacent static sites (`#typeBinary`, `provableBinaryType`) can key on `unary === true` with no change to any registering document's diagnostics, since their `null`-left branch is reached for an authored pairing only on a document `checkArithmeticOperands` already refuses; the interpolation carve-out is a separate behaviour question owned by bug 0367's pinned disposition and is out of scope for this lens. Alternatively the contract comment could describe both recognisers and name the pinned site. The fix stage owns the choice.

## False-positive check

- **Clone-map check (injected clone map):** `src/parser/static-type-inference.ts` and `src/parser/theta-ast.ts` have "(no clone groups)". No group covers this; the two ways are a one-token predicate difference across otherwise unrelated arms, not a copy.
- **D9-affinity check:** not a wrong-home claim — each site is the right home for its own check; the finding is about which discriminator they read.
- **D2-deadness check:** both ways live — Way M at 5 reading sites, Way S at 4 reading sites (searches pasted above); the marker is produced at exactly one site (`body-parser.ts:2094`).
- **Export-style exemption:** not applicable (divergent-solutions).
- **Prior filings / rulings:** none of the listed PTQs or intake files concerns the unary discriminator. PTQ-1138 (`provable-arg-types-expr-switch-parallel`) is about the provable/type switch pairing in general, not the unary predicate. Bug 0367's pinned disposition covers the interpolation site's *behaviour* (runtime refusal) and is respected here — it is cited, not contested; it does not rule on the static-type pass's or the provable reducer's predicate, nor on the contract comment.
- **Bug 0392 check:** `docs/bugs/0392-unary-minus-no-operand-discipline.md:30-33` names the marker as "what makes the unary arm cleanly identifiable (`expr.unary === true`)" and re-keyed nothing on the shape side, so no later fix covered these four sites.
- **Self-inconsistency statement:** no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Both greps re-ran verbatim and match the pasted lines (8 marker hits: 5 reads, 1 producer, 2 comments; 6 shape hits: 4 reads, 2 comments). The theta-ast.ts:65-72 contract, the body-parser.ts:2094 producer, static-type-inference.ts:789, type-layer-provable.ts:205/229 and type-layer-interpolation.ts:236 all match. clone-scan reports no groups for theta-ast.ts or static-type-inference.ts. The cost is real: bug 0367 records the shape predicate as its defect mechanism, and 0367:171-185 deliberately left the interpolation carve-out and the static detector on the shape. `git log -S` shows the contract comment arrived in edf0c2b2. Against that, #typeBinary's comment (:783-788) gives a stated 'moot at this layer' rationale for staying wide, so the choice is a human's. Not a duplicate of PTQ-1554, which is a missing unary gate on the interpolation path and explicitly excludes the null-left guard (triage: claude-opus-5-5)
