---
id: PTQ-0743
title: exactlyOne() narrowing helper and SUBSCRIPTION_ORDER constant duplicated byte-identically between extension-bootstrap-failures.test.ts and extension-bootstrap-nonabort.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/extension-bootstrap-failures.test.ts:35-40
  - tests/extension-bootstrap-failures.test.ts:82-90
  - tests/extension-bootstrap-nonabort.test.ts:53-58
  - tests/extension-bootstrap-nonabort.test.ts:159-167
sites: 4
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# exactlyOne() narrowing helper and SUBSCRIPTION_ORDER constant duplicated byte-identically between extension-bootstrap-failures.test.ts and extension-bootstrap-nonabort.test.ts

## Observation
Both `tests/extension-bootstrap-failures.test.ts` and `tests/extension-bootstrap-nonabort.test.ts` declare a `SUBSCRIPTION_ORDER` constant (plus its derived `PiEvent` type) and an `exactlyOne(diagnostics)` loud-narrowing helper with byte-identical bodies, including the identical failure message text.

## Evidence
`tests/extension-bootstrap-failures.test.ts:35-40`:
```ts
const SUBSCRIPTION_ORDER = [
  "resources_discover",
  "session_start",
  "session_shutdown",
] as const;
type PiEvent = (typeof SUBSCRIPTION_ORDER)[number];
```

`tests/extension-bootstrap-nonabort.test.ts:53-58`:
```ts
const SUBSCRIPTION_ORDER = [
  "resources_discover",
  "session_start",
  "session_shutdown",
] as const;
type PiEvent = (typeof SUBSCRIPTION_ORDER)[number];
```

`tests/extension-bootstrap-failures.test.ts:82-90`:
```ts
// Narrow the recorded diagnostics to exactly one, failing loudly (no silent
// skip) when the factory emitted none or more than one.
function exactlyOne(diagnostics: readonly Diagnostic[]): Diagnostic {
  if (diagnostics.length !== 1) {
    expect.fail(
      `expected exactly one extension-bootstrap-failed diagnostic, got ${diagnostics.length}`,
    );
  }
  return diagnostics[0] as Diagnostic;
}
```

`tests/extension-bootstrap-nonabort.test.ts:159-167`:
```ts
// Narrow the recorded diagnostics to exactly one, failing loudly (no silent
// skip) when the factory emitted none or more than one.
function exactlyOne(diagnostics: readonly Diagnostic[]): Diagnostic {
  if (diagnostics.length !== 1) {
    expect.fail(
      `expected exactly one extension-bootstrap-failed diagnostic, got ${diagnostics.length}`,
    );
  }
  return diagnostics[0] as Diagnostic;
}
```
Search: `grep -n "const SUBSCRIPTION_ORDER\|function exactlyOne" tests/extension-bootstrap-*.test.ts` returns exactly these four declarations (two files, two declarations each); no other file under `tests/extension-bootstrap-*.test.ts` declares either.

## Why this is a problem
The `SUBSCRIPTION_ORDER`/`PiEvent` pair and the `exactlyOne` loud-narrowing helper are reproduced character-for-character across two files rather than living once. `tests/helpers/` already holds several small single-purpose harness modules (e.g. `fake-clock.ts`, `case-insensitive-host-probe.ts`), which is the kind of home this pair of declarations would naturally sit in instead of being retyped per file.

## Suggested direction (non-binding, optional)
A shared module under `tests/helpers/` (or `tests/harness/`) exporting `SUBSCRIPTION_ORDER`/`PiEvent` and the `exactlyOne` diagnostic-narrowing helper would let both files import the same declarations instead of retyping them.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kinds; not applicable.
- Recording-double check: `exactlyOne` is a narrowing/failure-mode helper, not a negative-witness recording double; the duplication claim is about the helper's own code, not about what it records.
- docs/bugs/ signature search: `grep -rn "extension-bootstrap-failures\|extension-bootstrap-nonabort" docs/bugs/*.md` shows both files cited in docs/bugs/0023 as parallel V9k/V9p witness suites — the bug document explains why the two SUITES exist separately (one drives the fatal-abort surfaces, the other the non-abort surfaces), not why their low-level narrowing helper and order constant must be retyped; this finding does not propose merging, renaming or deleting either test file or suite.
- coverage-matrix citation search: `grep -n "extension-bootstrap-failures\|extension-bootstrap-nonabort" docs/reference/coverage-matrix.md` returned no hits — neither file is pinned by name there.
- This is not a coverage claim: both files' behavioural assertions are untouched by this finding; only the two duplicated non-assertion declarations are cited.

## Triage
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines and `diff` of the extracted ranges shows both the SUBSCRIPTION_ORDER/PiEvent block and the exactlyOne body (including the failure message) are byte-identical; grep of `const SUBSCRIPTION_ORDER|function exactlyOne` across src/, extensions/, tools/, tests/ hits exactly these two files (production-wiring.test.ts has differently-shaped exactlyOneNote/exactlyOneDiagnostic, not copies), both declarations are live in both files (failures: :47/:55/:72/:128/:151-155/:178; nonabort: :70/:96/:127/:196/:199/:298/:355), the two suites were authored one day apart as V9k-T (d44d523d) / V9p-T (77cdc407) siblings, no tests/helpers or tests/harness module already exports either, src/extension/factory.ts:136 holds only an unordered union type (no production constant to import instead); D7 boilerplate-duplication class, in tests/ only, no gate/recording-double/coverage-matrix carve-out applies (coverage-matrix grep: 0 hits), docs/bugs/0023 cites both files as witnesses but the filing proposes no merge/rename/delete of either; no existing PTQ tracks this root cause (PTQ-0163 cites nonabort.test.ts for an unrelated D2 deps.registry claim) (triage: claude-fable-5-1)
