# Bug 0369 — Control-flow constructs have no runtime kind discipline for values the static layer deferred on: `for`/`par for` over a laundered non-array silently iterate zero times, `if`/`while`/ternary/`&&`/`||` treat any laundered non-boolean as `false`, and unary `!` applies JS truthiness — so for `c = "x"`, `if c` and `if !c` BOTH skip

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 because whole statement bodies are silently
  not executed (a `for` loop over a string/number/object/null runs zero
  iterations and the theta reports success; a condition the spec refuses
  steers silently to the false arm), which is author intent dropped with zero
  diagnostics on any channel; the `c`-and-`!c`-both-false row additionally
  shows the fallbacks are mutually inconsistent, not merely strict. D2 because
  the belts span several sites (two loop snapshot arms, the shared `isTruthy`
  consumers, the `!`/`&&`/`||` arms on both hosts) and the disposition needs
  one adjudication (loud defect per the 0332/0338/0314 belt precedent vs a
  registered rejection), plus a spec sentence: the runtime disposition for a
  statically-undeferrable wrong-kind value in these positions is currently
  unwritten.
- **Kind:** spec gap with a hazardous implementation disposition.
  `docs/spec_topics/control-flow.md:13` makes the `for` iterand's rule
  parse-time only ("The expression after `in` must have type `array<T>` …
  iterating strings, objects, or numbers is `theta/parse/non-array-iterand`")
  and explicitly defers body checks on an unresolvable iterand; no sentence
  gives the runtime a disposition when the deferred value turns out non-array.
  `docs/spec_topics/expressions.md` §Truthiness ("Only `true` and `false` are
  accepted in boolean position … non-boolean is
  `theta/parse/non-boolean-condition`") is likewise parse-only, and unary `!`
  is absent from its boolean-position list entirely. The implementations fill
  the silence with three mutually inconsistent fallbacks: empty-array
  substitution, strict-`true` comparison, and raw JS `!`.
- **Related:**
  - 0126 (fixed 0.107.0) — the static half of the `for` seam (loop variable
    never bound in the type walk); its fix strengthened the parse layer this
    report shows is the ONLY layer.
  - 0332 / 0338 (fixed 0.299.0 / 0.311.0) — the settled two-layer discipline
    (parse gate for resolvable operands + loud runtime belt for deferred ones)
    for arithmetic; these constructs got the gate but never the belt.
  - 0324 (fixed) — `par for max` non-number runtime value: the corpus's one
    precedent for diagnosing (not silently defaulting) a laundered wrong-kind
    value in a control-flow clause; the iterand one clause over is silent.
  - [0191](./0191-enum-name-shadowed-by-schema-fabricates-member-type.md)
    (fixed 0.236.0) — prior art for the empty-snapshot fallback: its §Kind
    element 3 and §Why it matters document the fallback at both loop
    entries and measured the zero-iteration observable (rows r1/r3)
    without fixing it. Its fix restored the parse refusal for its own
    input class, and its post-fix witness rows assert that PARSE refusal
    (`tests/enum-shadow-member-type.test.ts`), so a fix here does not red
    them.
  - `[bug 0368](./0368-plus-and-ordering-laundered-operands-silent-js-coercion.md)` — same laundered-runtime-belt family
    (`+`/ordering operand belts), disjoint sink; both fixes edit
    `evalBinary`/`applyBinaryScalar` and `evaluateBinaryExpression` on
    both hosts, so whichever lands second rebases line citations.
- **Affected** (verified at af476df2, v0.347.0):
  - `src/runtime/statement-executor.ts:1932` — `executeFor`:
    `const snapshot: readonly ThetaValue[] = Array.isArray(iterand.value) ?
    iterand.value : []` — any non-array iterand becomes the empty snapshot;
    the body never runs, no diagnostic on any channel.
  - `src/runtime/statement-executor.ts:1551-1562` — `evalParFor`: the same
    `Array.isArray(iterandValue) ? iterandValue : []` substitution, yielding
    `[]` as the loop's value (probed: `par for` over a laundered string
    evaluates to the empty array, outcome success).
  - `src/runtime/statement-executor.ts:616-618` — `isTruthy(value) { return
    value === true }` — consumed by `executeIf` (`:1839`), `executeWhile`
    (`:1904`); any laundered non-boolean condition silently steers false.
  - `src/runtime/statement-executor.ts:1014-1019, 1032-1052` — `evalBinary`'s
    `!` arm (`!(right.value as boolean)` — raw JS truthiness: `!0` → `true`,
    `!"x"` → `false`, `!5` → `false`) and the `&&`/`||` arms
    (`left.value !== true → false` / `=== true → true` — strict-true).
  - `src/extension/production-theta-producer.ts:7464-7477, 7290-7293` — the
    pure host's identical `!` / `&&` / `||` / ternary-condition arms
    (`evaluateBinaryExpression`, `evaluatePureExpression`'s ternary).
  - `src/parser/type-layer-checks.ts` / `src/runtime/expression-evaluator.ts:585-589`
    — `checkBooleanPosition` and the iterand check both return no diagnostic
    for a statically-unresolvable operand ("deferred to the runtime safety
    net" — a net this report shows does not exist).
- **Observed at:** 0.347.0 (af476df2), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`).

## Summary

Every control-flow kind rule (array iterand, boolean condition) is enforced at
parse only, and the parse checks correctly defer when the operand's static
type is withheld (an unannotated `fn` parameter). At runtime nothing
re-judges the value: `executeFor` and `evalParFor` substitute the empty array
for any non-array, so the loop body silently never runs; `executeIf` /
`executeWhile` / the ternary and `&&`/`||` arms compare strictly against
`true`, so any non-boolean silently steers false; and unary `!` — the one
boolean operator the Truthiness list omits — applies raw JS truthiness. The
fallbacks are mutually inconsistent: for `c = "x"`, `c` reads false in an `if`
but `!c` ALSO reads false, so both branches of an if/if-not pair skip. Every
row runs to `outcome=success` with zero diagnostics.

## Reproduction

Offline, deterministic; sources prefixed `---\nmode: prompt\n---\n`, driven
through `executeBody` on the production prompt-mode binding. Parse
error-diagnostics `[]` in every row.

| # | Source (body) | Observed |
|---|---|---|
| E1 | `fn f(x) { let mut n = 0` / `for i in x { n += 1 }` / `n }` / `f("abc")` | `value=0` (zero iterations over a string) |
| E2 | same / `f(7)` | `value=0` |
| E3 | same / `f(null)` | `value=0` |
| E4 | `schema P { a: integer }` / same / `f(P { a: 1 })` | `value=0` |
| E5 (control) | same / `f([9, 9])` | `value=2` |
| E6 | `fn f(x) { par for i in x { 1 } }` / `f("abc")` | `value=[]` (JSON), outcome success |
| F1 | `fn f(c) { if c { return 1 }` / `return 2 }` / `f(1)` | `value=2` (`1` steers false) |
| F2 | `fn f(c) { let mut n = 0` / `while c { n += 1 }` / `n }` / `f("x")` | `value=0` |
| F5 | `fn f(c) { c ? 10 : 20 }` / `f(1)` | `value=20` |
| F4 | `fn f(c) { c && true }` / `f(1)` | `value=false` |
| F3 | `fn f(c) { !c }` / `f(0)` | `value=true` (JS `!0` — a boolean fabricated from a number) |
| F6 | `fn f(c) { let mut r = ""` / `if c { r = "a" }` / `if !c { r = "b" }` / `r }` / `f("x")` | `value=""` — **both** `c` and `!c` behaved false |

## Expected behaviour

- `docs/spec_topics/control-flow.md:13`: the iterand must be `array<T>`;
  iterating strings, objects, or numbers is refused. A value that evades the
  parse refusal by static unresolvability must not silently satisfy the loop
  with zero iterations — under the corpus's settled belt discipline
  (0314/0332/0338: "a non-X reaching a Y-only site after the gate deferred is
  a loud runtime defect, never a fabricated value") the conforming disposition
  is a loud abort.
- `docs/spec_topics/expressions.md` §Truthiness: only `true`/`false` in
  boolean position, "no truthiness coercion". F3's JS-truthiness `!` is a
  direct violation of the no-coercion rule at runtime; the strict-`true`
  conditions, while not coercing, fabricate a `false` verdict from a value the
  language refuses to interpret — and F6 shows the two fallbacks contradict
  each other observably.
- Whatever disposition is chosen must be uniform across `if` / `while` /
  ternary / `&&` / `||` / `!` and both evaluation hosts, and must be written
  into the spec (the current text prescribes nothing past parse).

## Actual behaviour / root cause

Three independent fallbacks fill the unspecified runtime: `Array.isArray(v) ?
v : []` at both loop entries (`statement-executor.ts:1932`, `:1560`),
`value === true` at every condition consumer (`:616`, `:1839`, `:1904`,
ternary/logical arms, mirrored on the pure host), and raw JS `!` at both
hosts' unary arms (`:1014`, `production-theta-producer.ts:7464`). None emits
anything. The parse gates document the deferral as "deferred to the runtime
safety net" (`expression-evaluator.ts:587-588`), but no net exists — the
deferral lands on silent fabrication.

## Why it matters

A loop that silently runs zero times is the worst shape of dropped intent: the
theta completes successfully with accumulators at their initial values,
downstream queries fire with empty aggregates, and nothing on any channel
distinguishes "the list was empty" from "the list was never a list". The
condition family silently inverts program logic (F1: an intended-truthy `1`
takes the else path), and F3/F6 show the runtime holds two contradictory
truthiness models at once. All rows reach through the ordinary untyped-helper
idiom. Impact class 1.

## Non-goals

- The parse gates' deferral on unresolvable operands — correct and kept
  (soundness: the runtime value may well be the right kind).
- The `par for max` clause — already diagnosed at runtime (bug 0324's fix);
  cited only as the in-corpus precedent that these clauses CAN diagnose.
- CTRL-1 snapshot semantics (iterand evaluated exactly once) — unchanged and
  correct.
- Choosing loud-defect vs registered-code — §Fix lists both; either needs the
  same spec sentence.

## Fix

Adjudicate one disposition, then apply it uniformly at the enumerated sites on
both hosts:

1. **Loud defect (recommended, matches 0314/0332/0338):** mint
   `ForIterandKindDefectError` / `BooleanPositionKindDefectError` (plain
   `Error`s routed through `surfaceUnexpectedThrow` →
   `theta/runtime/internal-error`) thrown when a non-array reaches a loop
   entry or a non-boolean reaches a condition/`!`/`&&`/`||` operand. No new
   registry rows.
2. **Registered rejection:** the 0027 pattern — dedicated
   `theta/runtime/*` codes on the runtime-defect surface, better operator
   messages at the cost of DIAG-2 registry work.

Disposition warning: 0324's fix record carries a verbatim parent
adjudication choosing clamp + a registered runtime diagnostic under a
"panic-free" constraint for a control-flow clause, expressly excluding the
0332/0338 loud-throw belt precedent there — the nearest in-family
precedent, and it cuts against route 1's loud-throw recommendation; the
adjudicator must weigh it.

Either way: `!` must stop JS-coercing (F3 currently fabricates a boolean
verdict, the most value-like corruption in the family); `for`/`par for` over a
genuine `array` and all-boolean conditions stay byte-identical (E5 control);
and control-flow.md / expressions.md §Truthiness each gain the one-sentence
runtime disposition. `par for`'s belt must fire before worker scheduling so
CTRL-5 semantics never observe a fabricated empty fan-out.

## Provenance

Found by tracing the parse gates' "deferred to the runtime safety net"
comments to their landing sites during the runtime-exec-2 re-sweep at
af476df2 — the safety net is absent at every one. All twelve rows probed
offline through the production executor harness before filing. Scratch probes
deleted.
