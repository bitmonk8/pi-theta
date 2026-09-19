---
id: PTQ-0909
title: b0459's local soleCollision re-implements the canonical soleByFragment helper
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0459-cross-format-collision-message-form.test.ts:78-85
  - tests/helpers/e2e-s1.ts:365-372
sites: 1
fix_scope: localized
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# b0459's local soleCollision re-implements the canonical soleByFragment helper

## Observation
`tests/b0459-cross-format-collision-message-form.test.ts` declares a
module-local function `soleCollision` whose body filters a diagnostics array
by `message.includes(fragment)`, asserts exactly one hit with a
`toHaveLength(1)` failure message naming the fragment, and returns the sole
hit. `tests/helpers/e2e-s1.ts` already exports `soleByFragment`, a function
with the identical filter/assert/return shape, parameterised on the fragment
string. `soleByFragment` is the function the sibling files
`tests/b0440-cross-source-shadow-descriptor-form.test.ts` and
`tests/b0461-source-failure-descriptor-form.test.ts` import and call directly
for the same "sole diagnostic by message fragment" need; b0459 does not import
it at all, and instead hard-codes its own copy against the single constant
`COLLISION_FRAGMENT`.

## Evidence

tests/b0459-cross-format-collision-message-form.test.ts:78-85 (local
re-implementation — `COLLISION_FRAGMENT` fixed at file scope, line 47):
```ts
function soleCollision(diagnostics: readonly Diagnostic[]): Diagnostic {
  const hits = diagnostics.filter((d) => d.message.includes(COLLISION_FRAGMENT));
  expect(
    hits,
    `expected exactly one diagnostic containing '${COLLISION_FRAGMENT}'; got ${hits.length}: ${JSON.stringify(hits.map((d) => d.message))}`,
  ).toHaveLength(1);
  return hits[0]!;
}
```

tests/helpers/e2e-s1.ts:365-372 (the canonical, parameterised helper):
```ts
export function soleByFragment(diagnostics: readonly Diagnostic[], fragment: string): Diagnostic {
  const hits = diagnostics.filter((d) => d.message.includes(fragment));
  expect(
    hits,
    `expected exactly one diagnostic whose message contains '${fragment}'; got ${hits.length}: ${JSON.stringify(hits.map((d) => d.message))}`,
  ).toHaveLength(1);
  return hits[0]!;
}
```

Sibling files in the same review scope call the canonical helper directly for
the identical need, e.g. tests/b0440-cross-source-shadow-descriptor-form.test.ts:109
(`const shadow = soleByFragment(diagnostics, SHADOW_FRAGMENT);`) and
tests/b0461-source-failure-descriptor-form.test.ts:377 (same call).

## Why this is a problem
`soleCollision` and `soleByFragment` are the same function — same filter
predicate shape (`d.message.includes(<fragment>)`), same `toHaveLength(1)`
assertion with the same failure-message shape, same `return hits[0]!` — with
`soleCollision`'s single free variable (`fragment`) closed over
`COLLISION_FRAGMENT` instead of taken as a parameter. Calling
`soleByFragment(diagnostics, COLLISION_FRAGMENT)` at each of b0459's four call
sites (lines 109, 121, 158, 186) would produce the identical runtime and
failure-message behaviour without the eight-line local re-declaration.

## Suggested direction (non-binding, optional)
b0459 importing and calling the existing `soleByFragment` from
`tests/helpers/e2e-s1.ts` (as its two sibling files already do) is the
directly-available path; no new helper needs to be minted.

## False-positive check
Gate-pin check: the file does not match `*gate*.test.ts` or a kin pattern, so
the census/pin-gate carve-out does not apply. Recording-double check: this is
a positive "exactly one diagnostic matches" lookup, not a never-called
witness, so the recording-double carve-out does not apply. docs/bugs/
signature search: `grep -n "b0459-cross-format-collision-message-form"
docs/bugs/*.md docs/reference/coverage-matrix.md` shows the file named only in
its own bug doc's witness list (docs/bugs/0459-cross-format-collision-message-suffix-sibling-order-and-spelling.md:289)
as the intended RED→GREEN witness; this finding proposes no merge, rename, or
deletion of that test, only that its local helper duplicate an existing
`tests/helpers/e2e-s1.ts` export, so the citation does not block filing.
Coverage check: no claim is made that any behaviour is untested.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce exactly at b0459:78-85 and e2e-s1.ts:365-372; a sed-extracted diff after renaming `soleCollision`→`soleByFragment` and `COLLISION_FRAGMENT`→`fragment` leaves only the unasserted failure-string wording ("containing" vs "whose message contains") — the filing's "identical failure-message behaviour" is a three-word overclaim, immaterial since no test reads that string; both use the same `src/diagnostics/diagnostic` `Diagnostic` type; the local copy is live (4 call sites :109/:121/:158/:186, 5/5 tests pass), b0459 has 0 imports from e2e-s1, `soleByFragment` importers are exactly b0440/b0461 as stated, the stated docs/bugs search reproduces (only 0459's own witness line :289; coverage-matrix 0 hits), no merge/rename/delete proposed, not a gate file, positive lookup not a recording-double witness; both locations under tests/, D7 boilerplate-duplication class. Not a duplicate: `soleByFragment` was minted in 52753dea (2026-09-18, the PTQ-0588 fix) which hoisted b0440/b0461's copies but migrated only b0459's `ancestors`/`mergeDirs` (PTQ-0588's location b0459:66-89 pre-fix covered only those), leaving the differently-named fixed-fragment specialisation behind — a distinct unmigrated residual, and no open or resolved issue cites `soleCollision`; mechanical fix is import + 4 call-site rewrites (triage: claude-fable-5-1)

## Fix attempts
- qw20260919162231: skipped — [PTQ-0914-bug0058-bug0100-local-parse-reimplements-parsedoc.md] PTQ-0914: Replaced both local parse wrappers with shared parseDoc; all tests and assertions retained. / PTQ-0916: Reused shared REGISTRY and RegistryRow; retained local message readers as triage permits. / PTQ-0917: Strengthened the assertion to require exactly one error note, retaining diagnostic and envelope checks. / PTQ-0918: Reused plantThetaWorkspace and disposeWorkspace in both files; fixture writes unchanged. No tests deleted. Required gate passed for all four issues: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0919-assertframestointernalerror-reimplements-assertinternalerror.md] PTQ-0919: Both framing helpers delegate to assertInternalError, preserving all four checks; no tests deleted or renamed. / PTQ-0921: Reused the canonical parse-registry reader and message lookup, retaining the non-empty-message guard; no tests deleted or renamed. / PTQ-0922: Replaced the inline pi/ctx double with makeHarness; discovery assertions remain unchanged; no tests deleted or renamed. / PTQ-0926: Shared thetaInput and driveBinder across all three files, preserving per-file parsing, contexts, and fixtures; no tests deleted or renamed. Required gate passed for all four fixes: tsc clean, 689 test files and 11,586 tests passed. ||
