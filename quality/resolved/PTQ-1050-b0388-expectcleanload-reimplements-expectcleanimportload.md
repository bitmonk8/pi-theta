---
id: PTQ-1050
title: b0388's local expectCleanLoad reimplements expectCleanImportLoad from a helper module it already partially imports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0388-crossfile-fnbody-effect-undercount.test.ts:1-5
  - tests/b0388-crossfile-fnbody-effect-undercount.test.ts:295-305
  - tests/helpers/thetalib-load-harness.ts:392-418
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# b0388's local expectCleanLoad reimplements expectCleanImportLoad from a helper module it already partially imports

## Observation
tests/b0388-crossfile-fnbody-effect-undercount.test.ts imports
`bindImportedBody`, `fakeThetaLibFs`, and `parseImportingApp` from
`./helpers/thetalib-load-harness` (lines 1-5), but declares its own local
`expectCleanLoad(row, label, expectedMaterialised)` function (lines 295-305)
that makes the same three `expect(...)` calls, in the same order, over the
same three fields, that the SAME helper module's exported
`expectCleanImportLoad` already makes (lines 392-418) — with the two
caller-specific message strings inlined as literals instead of passed as the
`diagMessage`/`materialisedMessage` parameters `expectCleanImportLoad` already
exposes for exactly that purpose. tests/b0354-crossfile-fn-depth-uncounted.test.ts
— reviewed in this same scope — imports `expectCleanImportLoad` from this
module and wraps it in a same-shaped one-line-different local
`expectCleanLoad` that calls through to it rather than re-deriving the
assertions.

## Evidence

tests/b0388-crossfile-fnbody-effect-undercount.test.ts:295-305 (re-read
immediately before filing):
```ts
function expectCleanLoad(row: Measured, label: string, expectedMaterialised: string[]): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(
    row.diagLines,
    `${label}: a well-formed \`.thetalib\` import is legal at every static gate; the load pass must report nothing (bug doc §Reproduction: \`load diagnostics: []\`)`,
  ).toEqual([]);
  expect(
    row.materialised,
    `${label}: imports.md §Visibility auto-exports a top-level \`fn\`, so the imported symbol materialises under its local name`,
  ).toEqual(expectedMaterialised);
}
```

tests/helpers/thetalib-load-harness.ts:408-418 (the exported original,
already parameterised for exactly this reuse):
```ts
export function expectCleanImportLoad(
  row: CleanLoadRow,
  label: string,
  diagMessage: string,
  materialisedMessage: string,
  expectedMaterialised: readonly string[],
): void {
  expect(row.appParseCodes, `${label}: the importing file parses clean`).toEqual([]);
  expect(row.diagLines, `${label}: ${diagMessage}`).toEqual([]);
  expect(row.materialised, `${label}: ${materialisedMessage}`).toEqual(expectedMaterialised);
}
```

tests/b0354-crossfile-fn-depth-uncounted.test.ts (the sibling file in this
same scope, calling through to the export instead of re-deriving the
assertions):
```ts
function expectCleanLoad(row: Measured, label: string, expectedMaterialised: string[]): void {
  expectCleanImportLoad(
    row,
    label,
    "a well-formed `.thetalib` import is legal at every static gate; the load pass must report nothing (bug doc §Reproduction: `load diagnostics: []`)",
    "imports.md §Visibility auto-exports a top-level `fn`, so the imported symbol materialises under its local name",
    expectedMaterialised,
  );
}
```

Search run: `grep -n "expectCleanImportLoad" tests/b0388-crossfile-fnbody-effect-undercount.test.ts` → 0 hits (the export is never referenced in this file, though the same module's `bindImportedBody`/`fakeThetaLibFs`/`parseImportingApp` are imported at line 1-5).

## Why this is a problem
This is the "copy-paste fixtures/doubles" class: `expectCleanImportLoad`
already exists in the exact module b0388 imports three other members from,
and is already parameterised (`diagMessage`, `materialisedMessage`) for a
caller supplying its own bug-specific prose over the same three-assertion
shape — exactly what b0388 needs. Instead b0388 re-derives all three
assertions with the messages hardcoded, so a future change to the shared
precondition shape (e.g. adding a fourth field `expectCleanImportLoad`
checks, or changing the `label` prefix format) landing in the helper would
leave b0388's copy silently checking the old three-field contract with no
drift signal in either file. The module's own header (lines 26-29) states
this exact wrapper duplication is the reason `expectCleanImportLoad` was
centralised in the first place, naming the three files it replaced there —
b0388 (authored 2026-09-03, before the helper existed) was never migrated
when that centralisation landed (2026-09-14).

## Suggested direction (non-binding, optional)
Replacing the body of the local `expectCleanLoad` with a call to
`expectCleanImportLoad(row, label, <diagMessage>, <materialisedMessage>,
expectedMaterialised)` — mirroring the sibling b0354 wrapper reviewed in this
same scope — is the path the helper's own parameterisation and b0388's
existing partial import from the same module already point at; this names
where the duplicate already sits, not a design for the change.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or a named kin; no pinned
  count or inventory is touched.
- Recording-double check: `expectCleanLoad` is a positive-precondition
  assertion helper, not a "never called" negative-witness double; the
  carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0388-inv4-undercount-effects-from-crossfile-fn-bodies.md
  backs this file's R1/R2 RED-at-fork cells by design; that governs the
  *runtime* assertions' correct-reason-red posture, not the load-precondition
  helper duplication claimed here (every cell's `expectCleanLoad` call is
  asserted GREEN regardless of fork state — the bug doc's own §Reproduction
  measures `load diagnostics: []` in both tree states).
- coverage-matrix/bug-doc citation search: `grep -n
  "b0388-crossfile-fnbody-effect-undercount" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file or
  any `it()`/`describe()` block, only that one local function could delegate
  to the existing export instead of re-deriving it.
- Prior-finding overlap: `grep -rl "b0388" quality/issues/*.md
  quality/resolved/*.md` → 8 files. PTQ-0444 (fixed) covered only b0388's
  former local `fakeThetaLibFs` (now imported, confirmed at line 3 of this
  file). PTQ-0875 (fixed) covered only b0388's former local `measure()`
  re-derivation of the parse/check/bind sequence (now delegated to
  `bindImportedBody`, confirmed in the current file body). Neither mentions
  `expectCleanLoad`/`expectCleanImportLoad`; PTQ-0532 (fixed) covers the same
  `expectCleanLoad`-reimplements-`expectCleanImportLoad` root cause but at
  tests/b0354-crossfile-fn-depth-uncounted.test.ts only (confirmed fixed —
  b0354 now delegates, see the sibling excerpt above) and its locations list
  does not include b0388. Distinct site, not a duplicate.
- Coverage-drift check: this finding is about a test-precondition helper
  duplicated across files that both exist and run; it makes no claim that any
  path or behaviour is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts match at the cited lines (b0388:295-305 local `expectCleanLoad`, thetalib-load-harness.ts:408-418 exported `expectCleanImportLoad`, b0354:212-221 the delegating sibling); `grep -n expectCleanImportLoad` over b0388 → 0 hits while lines 1-5 import `bindImportedBody`/`fakeThetaLibFs`/`parseImportingApp` from that same module; the local copy is live (callers at :365/:386/:441/:454) and b0388's `Measured` (:117-124, three `string[]` fields) is structurally assignable to `CleanLoadRow` (:393-397), so the delegation is mechanical; dating holds (b0388 landed 770cbb82 2026-09-03, `expectCleanImportLoad` first landed 994e421c 2026-09-14 — an unmigrated copy, not a retype despite the helper); no carve-out applies (not a gate file, positive-precondition helper not a recording double, docs/bugs/0388 governs the runtime RED cells not this GREEN precondition, 0 coverage-matrix hits, no merge/rename/delete proposed); not a duplicate — PTQ-0532 (fixed) named b0354 only and its fix left b0388 untouched, PTQ-0875 (fixed) covered b0388's `measure()` and its triage note records `measure()` alone, PTQ-0315 (fixed) migrated b0303/b0305/b0306, and no open row or TRIAGE_LOG entry mentions `expectCleanLoad` at b0388 — the PTQ-0625/0875 precedent rules the same harness class at a distinct site a separate row (triage: claude-fable-5-1)

## Fix attempts
- qw20260918202006: skipped — [PTQ-0925-off-session-mock-scaffold-triplicated.md] PTQ-0925: Shared the mock/reset scaffold across all five triage-cited files using an opt-in helper. / PTQ-0935: Extracted the bind/assert/read tail for all three cited copies; retained every assertion. / PTQ-1036: Distinct descriptions now prove project precedence; a temporary package-wins override correctly failed the new assertion and was removed. / PTQ-1039: Migrated b0378 to the existing recording harness and note filter, adding optional flags support. No tests deleted; required gate passed for all changes: tsc and 11,569 tests across 687 files. ||
