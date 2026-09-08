---
id: PTQ-0099
title: checkIncrementDecrement is typed Diagnostic | undefined but its body is a single unconditional return, so the undefined arm is unproducible and all three production call sites carry dead `!== undefined` guards
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/bindings.ts:179-191
  - src/parser/theta-document.ts:5134-5140
  - src/parser/theta-document.ts:5256-5262
  - src/parser/theta-document.ts:5866-5872
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# checkIncrementDecrement is typed Diagnostic | undefined but its body is a single unconditional return, so the undefined arm is unproducible and all three production call sites carry dead `!== undefined` guards

## Observation
`checkIncrementDecrement` (src/parser/bindings.ts) declares the return type
`Diagnostic | undefined`, matching its four sibling checks in the module —
but unlike the siblings, it has no pass arm: `++` / `--` is always rejected,
and its body is one unconditional object return. Its own doc comment says
"always returning `theta/parse/increment-decrement`". Every production call
site nonetheless guards the result with `if (diag !== undefined)`, a branch
that can never be false.

## Evidence
src/parser/bindings.ts:179-191 — the single unconditional return under a
`| undefined` signature (doc at :173-177 says "always returning"):
```ts
export function checkIncrementDecrement(
  op: IncrementDecrementOp,
  site: BindingSite,
): Diagnostic | undefined {
  return {
    severity: "error",
    code: "theta/parse/increment-decrement",
    file: site.file,
    range: site.range,
    message: `'${op.op}' operator is not supported`,
    hint: "Use `count += 1` / `count -= 1`.",
  };
}
```

src/parser/theta-document.ts:5134-5140 — call site 1 (prefix arm), dead guard:
```ts
      const diag = checkIncrementDecrement(
        { op: incDecOp },
        { file: this.file, range: op.range },
      );
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
```

src/parser/theta-document.ts:5256-5262 — call site 2 (postfix arm), same guard:
```ts
        const diag = checkIncrementDecrement(
          { op: incDecOp },
          { file: this.file, range: op.range },
        );
        if (diag !== undefined) {
          this.diagnostics.push(diag);
        }
```

src/parser/theta-document.ts:5866-5872 — call site 3 (match-pattern arm),
same guard:
```ts
      const diag = checkIncrementDecrement(
        { op: incDecOp },
        { file: this.file, range: opTok.range },
      );
      if (diag !== undefined) {
        this.diagnostics.push(diag);
      }
```

Search: `checkIncrementDecrement` across src/, extensions/, tools/ — the
definition (bindings.ts:179) and exactly the three theta-document.ts call
sites above; every one guards with `!== undefined`.

## Why this is a problem
Dead type arm and dead branches, proven from the function body: the only
implementation has one return statement and no path that yields `undefined`,
so the `| undefined` arm of the signature derives from the V3b-T stub era
(the module header, bindings.ts:28-29, records that the tests task "stubbed
the five behaviour-bearing functions" — a stub that returned `undefined`)
rather than from any current behaviour. The other four checks in the module
earn their `| undefined` with real pass arms (`decl.hasInitialiser`,
`reassign.mutable`, `target.kind === "identifier"`, `mod.position === "let"`);
this one cannot, its doc says so, and the three `if (diag !== undefined)`
guards it forces at the call sites are unreachable-else branches maintained
in production code.

## Suggested direction (non-binding, optional)
Narrow the return type to `Diagnostic` (the doc already promises it) and push
the result unconditionally at the three call sites; alternatively, if the
five-check seam uniformity is judged load-bearing, state that in the
signature's doc instead of the current "always returning" sentence that
contradicts it.

## False-positive check
- Reference search: `checkIncrementDecrement` across src/, extensions/,
  tools/, tests/ — three production call sites (all cited), plus test callers
  (tests/bindings.test.ts:153, :161;
  tests/match-pattern-increment-decrement.test.ts) that assert on the
  returned diagnostic's fields; no test asserts an `undefined` return, so no
  test pins the undefined arm.
- Body check: single `return { ... }` statement, no conditional, no early
  exit — the undefined arm is unproducible by construction, not merely
  unreached.
- Dynamic access / re-export search: no string-keyed or re-exported use of
  the identifier.
- Git intent check: the module header (bindings.ts:28-29) records the V3b-T
  stub era in past tense; the `| undefined` shape is that era's residue on
  the one check that has no pass case.
- Spec check: bindings.md §Increment / decrement rejects `++`/`--`
  unconditionally — there is no spec arm in which this check passes, so the
  undefined arm is not a spec-mandated fail-closed branch.
- Duplicate check: no already-filed finding names checkIncrementDecrement or
  these theta-document.ts guards (the filed increment/decrement-adjacent
  material is tests-side documentation only).

## Triage
verdict: confirmed — re-verified independently: body at bindings.ts:179-191 is one unconditional object return (no `undefined` path), all three guards match verbatim at theta-document.ts:5134/5256/5866, grep across src/, extensions/, tools/, tests/ finds only those 3 production callers plus two `toBeDefined` tests and no dynamic/re-exported use, and a scan of all 37 `Diagnostic | undefined` functions in src/ shows this is the sole one lacking an undefined arm, so the type arm and its three unreachable else-branches are dead by construction, not by convention. (triage: claude-opus-5)
