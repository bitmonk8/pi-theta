---
id: PTQ-0077
title: literals.ts's header claims the V2b type-compatibility engine consumes checkIntegerNarrowing, but type-compat.ts emits theta/parse/integer-narrowing itself and no src/ file calls the function
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/lexer/literals.ts:22-25
  - src/parser/theta-document.ts:36
  - src/parser/type-compat.ts:558-568
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# literals.ts's header claims the V2b type-compatibility engine consumes checkIntegerNarrowing, but type-compat.ts emits theta/parse/integer-narrowing itself and no src/ file calls the function

## Observation
The module header of src/lexer/literals.ts states that
`checkIntegerNarrowing` is consumed by "the full type-compatibility engine
(V2b)". In current code, the V2b engine (src/parser/type-compat.ts) imports
nothing from literals.ts and constructs the `theta/parse/integer-narrowing`
diagnostic itself at four sites (plus one in type-layer-checks.ts) from its
own `compatible()` verdict. The only src/ import from literals.ts is
`validatePathLiteral` (theta-document.ts:36); `checkIntegerNarrowing`'s only
callers are the seam tests.

## Evidence
src/lexer/literals.ts:22-25 — the consumer claim:
```
//   - `checkIntegerNarrowing` — the one-way `integer → number` widening rule from
//     lexical.md §"Number literals" (`theta/parse/integer-narrowing` when a
//     `number` value reaches an `integer` position). The full type-compatibility
//     engine (V2b) consumes this literal-level check.
```

src/parser/theta-document.ts:36 — the only src/ import from literals.ts:
```ts
import { validatePathLiteral } from "../lexer/literals";
```

src/parser/type-compat.ts:558-568 — the engine builds the diagnostic itself:
```ts
  if (r === "integer-narrowing") {
    // TYPE-2 — a `number` RHS under an `integer` annotation. Message from
    // diagnostics/code-registry-parse.md.
    return [
      {
        severity: "error",
        code: "theta/parse/integer-narrowing",
        file: site.file,
        range: site.range,
        message: "cannot narrow number to integer",
      },
    ];
```

Searches: `checkIntegerNarrowing` across src/, extensions/, tools/, tests/ —
src/ hits only inside src/lexer/literals.ts (definition + header); test hits
only in tests/literals-and-paths.test.ts:185 and :194.
`from "../lexer/literals"` / `from "./literals"` across all `*.ts` — one src/
importer (theta-document.ts:36, `validatePathLiteral` only) and one test
importer. Emitters of `code: "theta/parse/integer-narrowing"` in src/ —
type-compat.ts:564, :661, :954, :1010 and type-layer-checks.ts:3246; none of
those files references `checkIntegerNarrowing`.

## Why this is a problem
Historical narration that misstates the current wiring: the header names a
concrete production consumer ("the full type-compatibility engine (V2b)")
for `checkIntegerNarrowing`, and `git log --all -S "checkIntegerNarrowing"
-- src/` shows only one commit ever touched the identifier in src/
(8fa4239f, the V1b-T tests task) — type-compat.ts never imported or called
it at any point. A reader following the header to understand where the
integer-narrowing rule is enforced is pointed away from the five real
emission sites, and the function's doc-implied production role does not
exist. (The function itself is exercised by
tests/literals-and-paths.test.ts, so no deadness is claimed against it —
this finding is about the false consumer claim.)

## Suggested direction (non-binding, optional)
Retire or correct the consumer sentence so the header describes the current
wiring — the type-compatibility engine owns its own `integer-narrowing`
emission — and states the seam-test-only disposition of
`checkIntegerNarrowing` the way descriptions.ts's module-disposition note
does for its seam-only members.

## False-positive check
- Reference search: `checkIntegerNarrowing` across src/, extensions/, tools/,
  tests/ — no production caller; test callers in
  tests/literals-and-paths.test.ts only (so the function is test-witnessed
  and NOT filed as dead).
- Dynamic/string-keyed access search: no bracket or string-keyed reference to
  the identifier anywhere in the repo.
- Re-export search: no barrel or module re-exports `checkIntegerNarrowing`.
- Emitter search: `theta/parse/integer-narrowing` in src/ — all five emission
  sites construct the diagnostic locally (type-compat.ts ×4,
  type-layer-checks.ts ×1); none calls into literals.ts.
- Git intent check: `git log --all --oneline -S "checkIntegerNarrowing" --
  src/` → only 8fa4239f (V1b-T); `-- src/parser/type-compat.ts` → no hits, so
  the claimed consumption never existed rather than having been removed.
- Duplicate check: no already-filed finding names literals.ts or
  checkIntegerNarrowing; the same-shaped precedent
  (qw20260907130901-d2-07-classify-lowered-union-arm-stale-export) covers a
  different module pair.

## Triage
verdict: confirmed — Re-verified: literals.ts:22-25 asserts V2b "consumes" checkIntegerNarrowing, yet type-compat.ts's only import is diagnostic types (:32) and it builds theta/parse/integer-narrowing locally at :564/:661/:954/:1010 (plus type-layer-checks.ts:3246) from checkCompatible; repo-wide grep finds no production caller, re-export, or dynamic access, and git -S shows the identifier never touched type-compat.ts — a mechanically false wiring claim in a src/ header (deadness not claimed, so the tests-only-callers rule does not apply; d2-03 covers the separate :27-29 stub-tense sentence). (triage: claude-opus-5)
