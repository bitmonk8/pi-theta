---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: provableArgType's arithmetic exactness gate has no analogue of collectProvableArgTypes's operand-independent `/` and zero-divisor-`%` bypass
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:704-716
  - src/extension/invoke-static-checks.ts:717-723
  - src/parser/type-layer-checks.ts:2835-2840
  - src/parser/type-layer-checks.ts:2841-2846
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel           # D4 only: clone | drift | parallel
wave: qw20260916045442
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-16
---

# provableArgType's arithmetic exactness gate has no analogue of collectProvableArgTypes's operand-independent `/` and zero-divisor-`%` bypass

## Observation
`collectProvableArgTypes` (`src/extension/invoke-static-checks.ts`, the cross-`.thetalib`
/`.theta`-callable/runtime-tool/Pi-tool argument-type collector) and `provableArgType`
(`src/parser/type-layer-checks.ts`, the private same-file `fn`-call argument-type prover) each
switch over the full 20-member `Expr.kind` union (`theta-document.ts:463-483`) with no default
arm, and within `case "binary"` both dispatch on `op` to decide whether an argument
expression's type is provable. Both cite the identical spec clause, expressions.md §"Other
arithmetic", for the same fact: `-`, `*`, `/`, `%` all produce a numeric result whatever the
operands, so an operand's own type is not what makes the result provable for those operators.
Bug 0142 and bug 0152 each added an operator-specific, operand-INDEPENDENT bypass to
`collectProvableArgTypes` acting on that fact (for `/`, and for `%` with a statically-zero
integer divisor); neither commit touched `provableArgType`, whose own arithmetic arm still
requires every operand to be independently provable before returning a type for any of `-`,
`*`, `/`, `%`.

## Evidence

**collectProvableArgTypes's `/` bypass — invoke-static-checks.ts:704-716:**
```ts
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
```

**collectProvableArgTypes's `%`-zero-divisor bypass — invoke-static-checks.ts:717-723:**
```ts
      if (expr.op === "%" && isStaticZeroIntegerDivisor(expr.right)) {
        // Bug 0152 §Fix (c): mirrors `#typeBinary`'s zero-divisor `%` arm
        // (../parser/static-type-inference.ts), the same MIRROR precedent bug
        // 0142 set for `/` immediately above — one owner of the rule, read off
        // the pass rather than restated here.
        return [pass.typeOf(expr, env)];
      }
```
Both arms return unconditionally: `expr.left` / `expr.right` are never read, so neither
operand's own provability gates the answer.

**provableArgType's one, uniform gate for every arithmetic operator including `/` and `%` —
parser/type-layer-checks.ts:2835-2840:**
```ts
        // Arithmetic narrows the operands through `#commonType`, the same
        // erasure risk as `ternary` / `match` above.
        const reduced = this.typeOf(expr, bindings);
        if (!this.isProvenReduction([expr.left, expr.right], reduced, bindings)) {
          return undefined;
        }
```
`isProvenReduction` (`type-layer-checks.ts:3052`) requires `this.provableArgType(arm, …)` to be
defined for BOTH `expr.left` and `expr.right` — for `/` and a statically-zero-divisor `%`,
`reduced` is already the operator-fixed `number` (via the same shared `typeOf`/`#typeBinary`
seam both functions read), yet the expression is still withheld whenever either operand is
itself unprovable (an `ident` recording an unprovable initialiser, a `call`/`invoke`/
`method-call` result, etc. — arms `provableArgType` itself always treats as unprovable).

**provableArgType's own comment names the same fact and does not act on it for gating —
parser/type-layer-checks.ts:2841-2846:**
```ts
        // `isProvenReduction` tests the reduction's EXACTNESS, not the
        // operator's ADMISSIBILITY, so a same-typed pair of proven non-numeric
        // operands passes it — and for `-`, `*`, `/`, `%` the result type is
        // fixed by the operator: expressions.md §"Other arithmetic" gives
        // those four `integer` or `number` for every input (NaN included, which
        // is a `number`), and the runtime casts both operands to reach it
```

**No case coverage for the bypass exists in `provableArgType` at all.**
`grep -rn "isStaticZeroIntegerDivisor" src/` returns exactly 3 hits: its definition and one
call site in `static-type-inference.ts`, and one call site in `invoke-static-checks.ts`; zero
hits in `type-layer-checks.ts`. That file's own import line confirms it could not reach the
predicate under an alias either: `import { BOOLEAN_BINARY_OPS, StaticTypeInferencePass } from
"./static-type-inference";` — no `isStaticZeroIntegerDivisor`.

**The commits that added the two bypasses never touched the sibling file.**
`git show --stat 4d072c83` (`fix(bug-0142): "/" always produces "number" at the inference
pass`) lists changed files `src/extension/invoke-static-checks.ts` and
`src/parser/static-type-inference.ts` — no `type-layer-checks.ts`.
`git show --stat 35b718cc` (`fix(bug-0152): a %-by-static-zero integer divisor draws
integer-narrowing, not a number-typed NaN`) likewise lists `src/extension/invoke-static-checks.ts`
and `src/parser/static-type-inference.ts` — no `type-layer-checks.ts`.
`git show 4d072c83 --stat -- src/parser/type-layer-checks.ts` and
`git show 35b718cc --stat -- src/parser/type-layer-checks.ts` both return empty output,
mechanically confirming neither fix reached this file. Bug 0142's own fix record (§Fix (c))
frames the mirror scope explicitly as `#typeBinary` ↔ `collectProvableArgTypes` — "the
extension layer keeps its stated shape-for-shape invariant with THE PASS" — reasoning that
`provableArgType`'s own read of `reduced` is corrected automatically via the shared `typeOf`
seam; neither bug 0142's nor bug 0152's "Non-goals" section names `provableArgType`'s own
`isProvenReduction` gate (as opposed to its READ of `reduced`) as an excluded concern for an
operand that is not itself independently provable.

## Why this is a problem
This is the parallel class, not clone: the two functions are independently written (different
helper calls, different data shapes — a value-type SET vs. a single value, different classes/
modules), so there is no shared text to diverge; instead, two switches over the same
discriminant (`Expr.kind`, then `op`) are meant to agree on WHICH arguments are provable for
the same spec clause, and one gained cases the other did not. The counted claim: of the two
documented, operand-independent per-operator exceptions expressions.md's "Other arithmetic"
establishes (`/` always `number`; a statically-zero-integer-divisor `%` widens to `number`),
`collectProvableArgTypes` implements both as unconditional bypasses (2 of 2, added by bug 0142
and bug 0152 respectively); `provableArgType` implements neither (0 of 2), continuing to route
both through its uniform `isProvenReduction` operand-exactness gate. Concretely: `fn g(n:
string) {}`, then `let m = compute(); g(m / 2)` where `compute()`'s return type is untracked (a
`call` result — one of `provableArgType`'s own always-unprovable arms) is silently allowed by
`checkFnCallArgs`/`provableArgType` (withheld, deferred to the runtime), while the same
argument-expression shape passed to an otherwise-identical `.thetalib`-imported `g(n: string)`
is flagged `theta/parse/fn-arg-type-mismatch` by `checkImportedFnCallArgs`/
`collectProvableArgTypes`, whose `/` arm never consults `m`'s own provability at all. This
contradicts the general pattern this exact function pair's own bug history (bug 0146) already
established — that the same-file route is normally the MORE capable of the two, because it
alone carries a local-bindings map — for this one narrow, operator-fixed-result sub-case the
relationship inverts, and neither adjudicated bug filing discusses the inversion.

## Suggested direction (non-binding, optional)
A shared source of truth (hypothesis): if `provableArgType`'s arithmetic arm special-cased `/`
and a statically-zero-divisor `%` the same way — returning `reduced` unconditionally, ahead of
the `isProvenReduction` call, mirroring `collectProvableArgTypes`'s own `[pass.typeOf(expr,
env)]` shortcut — the two would cover the identical operator set without the sibling's
operand-exactness gate. Named as an observation of a pattern `collectProvableArgTypes` already
adopted for exactly these two operators, not a design; a human confirms whether the omission
was ever deliberately considered (neither bug 0142's nor bug 0152's own "Non-goals" section
names it).

## False-positive check
- Both switches re-read in full immediately before filing (`collectProvableArgTypes`:
  `invoke-static-checks.ts:654-839`; `provableArgType`: `type-layer-checks.ts:2751-3032`), each
  confirmed exhaustive over the 20-member `Expr` union (`theta-document.ts:463-483`) with no
  `default` case — a genuine "two passes that each switch over `Expr` kinds" pair.
- `grep -rn "isStaticZeroIntegerDivisor" src/` — 3 hits total (definition +
  `static-type-inference.ts` call site + `invoke-static-checks.ts` call site); 0 in
  `type-layer-checks.ts`; its import line there carries no such name under any alias.
- Git history: `git show --stat` on both fix commits (`4d072c83` bug 0142, `35b718cc` bug 0152)
  lists only `invoke-static-checks.ts` and `static-type-inference.ts` among `src/` files;
  `git show <commit> --stat -- src/parser/type-layer-checks.ts` returns empty for both —
  mechanical confirmation neither fix touched the sibling.
- Both copies live: `collectProvableArgTypes` is called from `checkThetaCallableCallSurface`,
  `checkRuntimeToolCallSurface`, `checkPiToolArgDisjointness` and the imported-`fn`/`schema`/
  `enum` checks, all confirmed live in this same file; `provableArgType` is called from
  `checkFnCallArgs` and other `TypeLayerWalk` sites (`isProvenReduction`'s own callers) — not
  dead code on either side.
- Not tests/, not generated: both files are hand-authored production modules with no
  `@generated` marker.
- Carve-out check (not an over-broad "two AST passes" claim): this filing does not reopen the
  general parser-layer-vs-extension-layer provability gap for `ident`/`member`/`index`/
  `query`/`object`/`result-ctor`/`par-for`, which bug 0146 already measured across both
  functions and adjudicated — fixing only `collectProvableArgTypes`'s `array` arm and leaving
  the rest as "a deliberate soundness discipline" (its own §Kind). This filing is narrower and
  disjoint from that one: it is confined to the two named, operator-specific,
  operand-INDEPENDENT bypasses bug 0142/0152 added to `collectProvableArgTypes` alone, which
  bug 0146's fix (restricted to the `array` arm) does not touch and which neither arithmetic
  bug's own "Non-goals" section names as excluded.
- Duplicate-finding check: grepped `quality/issues` + `quality/resolved` + `quality/intake` for
  `isProvenReduction`, `isStaticZeroIntegerDivisor`, and `provableArgType` combined with
  `collectProvableArgTypes` — no existing finding targets this gate asymmetry; the only hits
  naming `collectProvableArgTypes`'s consumers are the unrelated D2 stale-consumer-count
  findings `PTQ-0296`/`PTQ-0309`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — D4 parallel accounting verified at every cited line (collectProvableArgTypes's unconditional `/`/zero-divisor-`%` bypasses at :704-723, provableArgType's uniform isProvenReduction gate requiring both operands provable at :2835-2846, both switches exhaustive over the same 20-member Expr union, neither bug-0142/0152 commit touched type-layer-checks.ts, concrete m/2 example reproduces the asymmetry); one miscount noted (isStaticZeroIntegerDivisor greps to 4 hits not 3, immaterial to the true 0-hits-in-type-layer-checks.ts claim); whether provableArgType should mirror the bypass is a design call for a human, per the D4 parallel rule (triage: claude-opus-5)
