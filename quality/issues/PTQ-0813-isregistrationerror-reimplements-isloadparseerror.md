---
id: PTQ-0813
title: import-specifier-separator-production-required.test.ts redeclares isRegistrationError, byte-identical to e2e-s1's exported isLoadParseError
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/import-specifier-separator-production-required.test.ts:267-278
  - tests/helpers/e2e-s1.ts:110-120
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# import-specifier-separator-production-required.test.ts redeclares isRegistrationError, byte-identical to e2e-s1's exported isLoadParseError

## Observation
`tests/import-specifier-separator-production-required.test.ts` already imports
from `./helpers/e2e-s1` (`parseDeps`, `parseDoc as parse`, line 12) but also
declares its own module-scope predicate `isRegistrationError(diagnostic)`
whose body is the same boolean expression, over the same `Diagnostic` shape,
that `tests/helpers/e2e-s1.ts` already exports as `isLoadParseError(d)`. The
two functions differ only in parameter name and the order of the two
`startsWith` disjuncts (`parse` first vs `load` first — logically
commutative, so the predicates are behaviourally identical on every input).

## Evidence
`tests/import-specifier-separator-production-required.test.ts:267-278`:
```ts
/**
 * Whether a diagnostic un-registers the theta that carries it: error severity
 * in the `theta/parse/` or `theta/load/` namespace. Mirrors the shipped
 * predicate `isRegistrationError` (src/extension/import-static-checks.ts:216),
 * which is module-private, so the disposition is asserted on the same two
 * properties the load pass reads rather than by re-driving discovery.
 */
function isRegistrationError(diagnostic: Diagnostic): boolean {
  return (
    diagnostic.severity === "error" &&
    (diagnostic.code.startsWith("theta/parse/") || diagnostic.code.startsWith("theta/load/"))
  );
}
```

`tests/helpers/e2e-s1.ts:110-120` (the already-exported, already-imported-from
module's own copy):
```ts
/**
 * True iff `d` is the error-severity `theta/load/*` or `theta/parse/*` refusal
 * that blocks registration (mirrors `hasLoadParseError`,
 * src/extension/production-composition.ts).
 */
export function isLoadParseError(d: Diagnostic): boolean {
  return (
    d.severity === "error" &&
    (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))
  );
}
```

Exact search run: `grep -rl "isRegistrationError" tests/` → the one file
above only; `grep -n "isLoadParseError" tests/import-specifier-separator-production-required.test.ts`
→ 0 hits (not imported alongside the `parseDeps`/`parseDoc` this file already
takes from the same module).

## Why this is a problem
The file already opens `./helpers/e2e-s1` for two other exports on the same
line (`parseDeps`, `parseDoc as parse`), so the canonical predicate was one
import away; instead the same load/parse-registration-drop test is retyped
locally under a name borrowed from an unrelated, module-private production
function (`isRegistrationError`, src/extension/import-static-checks.ts:216)
rather than the test helper it is functionally identical to.

## Suggested direction (non-binding, optional)
Importing `isLoadParseError` from `./helpers/e2e-s1` alongside the
`parseDeps`/`parseDoc` import already present is the path other files in the
suite already take for this exact predicate.

## False-positive check
- Gate-pin check: this file does not match `*gate*.test.ts` or a listed gate
  kin; not a pinned-count/inventory gate.
- Recording-double check: `isRegistrationError` is a stateless predicate over
  a `Diagnostic`, not a recording double backing a "never called" witness;
  carve-out does not apply.
- docs/bugs/ signature search: `grep -n "isRegistrationError\|isLoadParseError" docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md docs/bugs/0456-imports-and-lpa-stale-line-cites.md` →
  0 hits in both; neither bug document cites this predicate name or attributes
  a deliberate reason for a local copy diverging from the shared helper.
- coverage-matrix/bug-doc citation search: `grep -n "import-specifier-separator-production-required" docs/reference/coverage-matrix.md` →
  0 hits. `docs/bugs/0211-...md:813,839` and `docs/bugs/0456-...md:94,177,288`
  cite this test FILE by name as a witness/line-cite target, but this finding
  proposes no merge, rename or deletion of the file or any `it()`/`describe()`
  in it — only that the local `isRegistrationError` function import the
  already-exported, already-partially-imported-from `isLoadParseError` — so
  the citation is unaffected.
- Duplicate-topic check: `grep -rl "isRegistrationError" quality/` (against
  issues/resolved/intake) → 0 hits before this filing; the large existing
  family of "isLoadParseError reimplemented" findings (PTQ-0456, PTQ-0543,
  PTQ-0614, PTQ-0684, PTQ-0727, PTQ-0753) each target a different function
  name (`blocksRegistration`, `deniesRegistration`, `registers`) in different
  files; none lists this file or the name `isRegistrationError`.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/import-specifier-separator-production-required.test.ts:267-278 and tests/helpers/e2e-s1.ts:110-120 (same `Diagnostic` type from src/diagnostics/diagnostic; after name substitution the only textual difference is the commutative `startsWith` disjunct order, so the predicates are behaviourally identical), the local copy is live at :363, the file imports `parseDeps`/`parseDoc` from ./helpers/e2e-s1 (line 12) but never `isLoadParseError` (0 hits), and chronology holds (test authored e0873e53 2026-08-21, helper exported f0333c15 2026-09-12 as PTQ-0268's fix → unmigrated copy); tests/ only, D7 boilerplate-duplication, not a gate file, stateless predicate not a recording double, no it()/describe() touched so bug 0211/0456 file cites are unaffected, 0 coverage-matrix hits; NOT a duplicate — the isLoadParseError family (PTQ-0268/0456/0543/0614/0684/0727/0753) is filed per-file and none names this file or `isRegistrationError`, and PTQ-0731/0713 target different helpers in this file; two stated searches are wrong but immaterial to the cited site: `grep -rl isRegistrationError tests/` returns THREE files, not one — tests/import-export-from-clause-required.test.ts:233 and tests/import-specifier-list-production-required.test.ts:297 declare the byte-identical predicate and likewise import `parseDeps` from e2e-s1 without `isLoadParseError` (fold both into this PTQ's location list at acceptance, sites → 3), and docs/bugs/0211:773 does mention `isRegistrationError` but as the production function's line cite, not this test helper (triage: claude-fable-5-1)
