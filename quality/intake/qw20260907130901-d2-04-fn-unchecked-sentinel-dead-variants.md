---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: functions.ts keeps the V3d-T stub sentinel "unchecked" as a variant of FnResolution and ResolvedReturn although nothing in the repository constructs or matches it
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/functions.ts:134
  - src/parser/functions.ts:245-249
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# functions.ts keeps the V3d-T stub sentinel "unchecked" as a variant of FnResolution and ResolvedReturn although nothing in the repository constructs or matches it

## Observation
`FnResolution` and `ResolvedReturn` each carry an `"unchecked"` variant whose
doc comments state it exists only as the V3d-T stub sentinel and that "the
paired V3d resolver never returns this". The paired V3d implementation has
landed: `resolveFnCall` returns `"resolved"`/`"unresolved"` and
`resolveReturnType` returns `"checked"`/`"inferred"`/`"inference-no-common-type"`.
No code in src/, extensions/, tools/, or tests/ constructs either `"unchecked"`
value or branches on it.

## Evidence
src/parser/functions.ts:130-134 — the variant and its expired purpose:

```ts
 *   - `"unchecked"`  — the V3d-T stub sentinel. The paired V3d resolver never
 *     returns this; it exists only so the hoisted-mutual-recursion test reds on
 *     its own primary assertion (no expected outcome equals `"unchecked"`).
 */
export type FnResolution = "resolved" | "unresolved" | "unchecked";
```

src/parser/functions.ts:245-249 — the second sentinel variant:

```ts
export type ResolvedReturn =
  | { readonly kind: "inferred"; readonly inferred: InferredReturnType }
  | { readonly kind: "inference-no-common-type"; readonly diagnostic: Diagnostic }
  | { readonly kind: "checked"; readonly operandResults: readonly Compatibility[] }
  | { readonly kind: "unchecked" };
```

Producers never return it — src/parser/functions.ts:146-151:

```ts
export function resolveFnCall(
  name: string,
  hoistedTopLevelFns: readonly string[],
): FnResolution {
  return hoistedTopLevelFns.includes(name) ? "resolved" : "unresolved";
}
```

Consumers never match it — src/parser/type-layer-checks.ts:2105 and :2157 (the
only production consumers of `ResolvedReturn`):

```ts
      if (resolved.kind === "inference-no-common-type") {
```

```ts
    if (resolved.kind !== "inferred") {
```

Value census: grep `"unchecked"` (quoted string) across src/ — hits only in
src/parser/functions.ts (lines 33, 130, 132, 134, 143, 241, 249, 265: the two
declarations plus doc comments). In tests/, the string appears only in prose
(tests/functions-and-return.test.ts:36-37 narrating the retired stub); the
tests assert `toBe("resolved")` (tests/functions-and-return.test.ts:103,107)
and match the other three `ResolvedReturn` kinds — none constructs or compares
`"unchecked"`.

## Why this is a problem
Dead code, proven dead: two union variants whose stated purpose was to make
red-phase tests fail ("it exists only so the ... test reds on its own primary
assertion") and whose own doc declares that the finished resolver never returns
them. The feature's landing is shown in git: `git log -S '"unchecked"'` on the
file yields exactly `2f720178` (V3d-T, introducing the sentinel returns) and
`f1f7b935` (V3d, replacing the sentinel returns with the real computation while
leaving the variants declared). Since V3d, no value of either variant can exist
at runtime, and no `switch`/`if` anywhere handles one — the variants only widen
the two unions every consumer must narrow past.

## Suggested direction (non-binding, optional)
Remove the `"unchecked"` member from `FnResolution` and the
`{ kind: "unchecked" }` member from `ResolvedReturn`, along with the stub-era
doc sentences that describe them; consumers already handle only the live kinds.

## False-positive check
- Constructor search: grep `"unchecked"` across src/, extensions/, tools/,
  tests/ — zero construction sites; every src hit is inside
  src/parser/functions.ts declarations/docs, every test hit is a comment.
- Consumer search: grep `resolved.kind`/`FnResolution`/`ResolvedReturn` across
  src/, extensions/, tools/, tests/ — consumers are
  src/parser/type-layer-checks.ts:2099-2107, :2151-2160 (narrow to
  `inference-no-common-type` / `inferred`) and tests
  (tests/functions-and-return.test.ts, tests/match-fn-return-lub-dominating-discipline.test.ts,
  tests/b0346-...asymmetry.test.ts) which assert the three live kinds; no
  `"unchecked"` arm anywhere.
- String-keyed/dynamic access: the variants are string-literal union members;
  the only runtime spelling would be the string itself, and the census above
  covers it.
- Test-only-caller check: not applicable in the protective direction — tests do
  not construct or compare the value either, so the variants are unreached
  everywhere (the functions themselves are alive and untouched by this
  finding).
- Git-history intent: `git log -S '"unchecked"' -- src/parser/functions.ts` →
  `2f720178` (V3d-T) and `f1f7b935` (V3d) only; the implementation commit
  removed the sentinel RETURNS but not the variant declarations.
- Spec-mandate check: functions.md FN-1/FN-3 (per the module header) define
  resolved/unresolved and inferred/checked/no-common-type outcomes; no spec
  text names an "unchecked" outcome, and it is not a fail-closed branch (it is
  never produced, so nothing can fail into it).

## Triage
