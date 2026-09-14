---
id: PTQ-0336
title: import-static-checks.ts's header attributes its IMP-3 check to checkImportedSymbols, a function this file never imports or calls
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:11-13
  - src/extension/import-static-checks.ts:59-68
  - src/extension/import-static-checks.ts:902
  - src/extension/import-static-checks.ts:1299
  - src/extension/import-static-checks.ts:1588
  - src/extension/import-static-checks.ts:1614
  - src/extension/import-static-checks.ts:1628
  - src/parser/imports.ts:619-644
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914130212
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# import-static-checks.ts's header attributes its IMP-3 check to checkImportedSymbols, a function this file never imports or calls

## Observation
The module header's IMP-3 bullet says this file computes the resolved
`.thetalib`'s export set "then `checkImportedSymbols` against the importing
specifiers (`theta/parse/import-unknown-symbol` / `theta/parse/import-name-collision`)."
`checkImportedSymbols` is a real, exported function, but it lives in
`../parser/imports.ts` and is not among the names this file imports from that
module; this file imports and calls two differently-named, separately-invoked
functions instead: `checkImportUnknownSymbols` (the code the header's first
cited diagnostic actually comes from) and `checkImportNameCollisions` (the
source of the header's second cited diagnostic).

## Evidence
src/extension/import-static-checks.ts:11-13 — the header's IMP-3 bullet:
```ts
//   - IMP-3 — `computeThetaLibExports` over the resolved `.thetalib`'s top-level forms,
//     then `checkImportedSymbols` against the importing specifiers
//     (`theta/parse/import-unknown-symbol` / `theta/parse/import-name-collision`).
```

src/extension/import-static-checks.ts:59-68 — the file's only import from
`../parser/imports`; `checkImportedSymbols` is not among the named imports:
```ts
import {
  IMPORT_NAME_COLLISION_CODE,
  IMPORT_NAME_COLLISION_HINT,
  RelativeThetaLibResolver,
  UNRESOLVABLE_THETALIB_PATH_CODE,
  UNRESOLVABLE_THETALIB_PATH_HINT,
  checkImportNameCollisions,
  checkImportUnknownSymbols,
  computeThetaLibExports,
  detectImportCycle,
```

Every call site of the two functions actually used (3 + 2 = 5 sites; searched
via `grep -n "checkImportUnknownSymbols(\|checkImportNameCollisions("
src/extension/import-static-checks.ts`):
```
902:        ...checkImportUnknownSymbols(
1299:      ...checkImportUnknownSymbols(
1588:        ...checkImportUnknownSymbols(
1614:      ...checkImportNameCollisions(
1628:    ...checkImportNameCollisions(
```

src/parser/imports.ts:619-644 — `checkImportedSymbols`'s own declaration and
doc comment, which independently states that this file does not call it as
one function:
```ts
/**
 * Check an importing file's specifiers (`parse` phase), returning
 * `theta/parse/import-unknown-symbol` for a specifier whose source symbol is
 * neither a top-level declaration nor a transitive re-export of the resolved
 * file (the message names the source symbol, not the alias), and
 * `theta/parse/import-name-collision` for a local binding shared by two imports
 * or colliding with a top-level declaration in the same file. Participates in
 * the multi-error batching rule (returns every diagnostic, no fast-fail).
 *
 * Retained as the single-decl composition of {@link checkImportUnknownSymbols}
 * and {@link checkImportNameCollisions}. The load pass (import-static-checks.ts)
 * calls the two arms separately — the unknown-symbol arm per resolved decl and
 * the collision arm once over the union of every decl's specifiers — so an
 * import-vs-import collision across two separate `import` statements is caught.
 */
export function checkImportedSymbols(
```

## Why this is a problem
The header names a specific function (`checkImportedSymbols`) as the
mechanism behind IMP-3's two diagnostic codes. That function exists, is
exported, and is tested, but it is not the mechanism this file uses: the file
calls `checkImportUnknownSymbols` (3 sites) once per resolved import decl and,
separately, per resolved dependency lib (bug 0304/0335's per-lib widening),
and calls `checkImportNameCollisions` (2 sites) once over the union of every
decl's specifiers and once per dependency lib's own specifiers — the exact
two-arm split that `checkImportedSymbols`'s own doc comment in `imports.ts`
names as what "the load pass (import-static-checks.ts) calls … separately."
A reader following the header's named collaborator into `imports.ts` finds a
function whose own documentation says this file does not call it that way.

## Suggested direction (non-binding, optional)
Update the header's IMP-3 bullet to name the two functions this file actually
calls (`checkImportUnknownSymbols`, `checkImportNameCollisions`) in place of
the single composed name.

## False-positive check
- `grep -n "checkImportedSymbols"` across `src/`: exactly two hits, both in
  `src/parser/imports.ts` (the declaration and a `{@link}` cross-reference in
  its own doc comment) plus the one header mention in
  `src/extension/import-static-checks.ts:12` — no third site, and no
  occurrence in this file's own import clause.
- Read the file's full `../parser/imports` import clause (lines 59-79 in
  full): `checkImportedSymbols` is absent; `checkImportNameCollisions` and
  `checkImportUnknownSymbols` are both present.
- Counted every call site of both functions actually used inside this file
  (`grep -n "checkImportUnknownSymbols(\|checkImportNameCollisions("`):
  5 sites, reproduced above.
- Confirmed `checkImportedSymbols` itself is not dead code: it has its own
  test callers (`tests/imports.test.ts`, `tests/export-visibility.test.ts`),
  so this finding is about the header's collaborator name inside
  import-static-checks.ts, not about the function's own liveness.
- Searched the intake/issues/resolved topic list for prior filings naming
  `checkImportedSymbols`, `checkImportUnknownSymbols`, or `checkImportNameCollisions`
  in a title — none exists (the closest, `PTQ-0334`, is a D9 breakdown finding
  about `checkThetaImports`'s overall size, not this header sentence).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — header's IMP-3 bullet names `checkImportedSymbols`, absent from this file's `../parser/imports` import clause (lines 59-79) and called zero times here; the file instead calls `checkImportUnknownSymbols` (3 sites: 902/1299/1588) and `checkImportNameCollisions` (2 sites: 1614/1628), exactly the two-arm split `checkImportedSymbols`'s own doc comment (imports.ts:625-629) says the load pass performs separately; not a duplicate of PTQ-0176 (invoke-static-checks.ts's header, a different file) or PTQ-0304/PTQ-0334 (checkThetaImports breakdown, unrelated claim). (triage: claude-opus-5)
