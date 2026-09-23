---
id: PTQ-1377
title: expectUniverseFailure and expectEntryLstatFailure are near-identical assertion helpers duplicated across two files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/discovery-glob-universe-enumeration-failure.test.ts:256-291
  - tests/discovery-tree-walk-lstat-failure.test.ts:176-211
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# expectUniverseFailure and expectEntryLstatFailure are near-identical assertion helpers duplicated across two files

## Observation
`tests/discovery-glob-universe-enumeration-failure.test.ts` declares `expectUniverseFailure(diagnostics, file, descriptor, why)` and `tests/discovery-tree-walk-lstat-failure.test.ts` declares `expectEntryLstatFailure(diagnostics, file, descriptor, why)`. Both take the identical four-parameter signature, both call `hitsFor(diagnostics, UNREADABLE_SOURCE, file)`, assert `hits.length` equals `1` with a PRIMARY message quoting `JSON.stringify(diagnostics)`, assert `diagnostic.severity` equals the hardcoded literal `"warning"`, assert `diagnostic.message` equals `interpolate(loadRowMessage(UNREADABLE_SOURCE), { descriptor })`, and finish with an identical `diagnostics.filter((d) => d.code === MISSING_SOURCE)).toHaveLength(0)` guard. Only the prose passed as expectation messages differs between the two copies.

## Evidence
tests/discovery-glob-universe-enumeration-failure.test.ts:256-291:
```
function expectUniverseFailure(
  diagnostics: readonly Diagnostic[],
  file: string,
  descriptor: string,
  why: string,
): void {
  const hits = hitsFor(diagnostics, UNREADABLE_SOURCE, file);
  expect(
    hits.length,
    `PRIMARY (bug 0113): ${why} — ...`,
  ).toBe(1);
  const diagnostic = hits[0]!;
  expect(
    diagnostic.severity,
    "the Settings `thetaPaths` entry row's Unreadable cell is a warning ...",
  ).toBe("warning");
  expect(
    diagnostic.message,
    "DIAG-4: the message is the registry row's Message column interpolated ...",
  ).toBe(interpolate(loadRowMessage(UNREADABLE_SOURCE), { descriptor }));
  expect(
    diagnostics.filter((d) => d.code === MISSING_SOURCE),
    "adjudication (4): a universe walk NEVER emits missing-source ...",
  ).toHaveLength(0);
}
```

tests/discovery-tree-walk-lstat-failure.test.ts:176-211 (the same shape, only the `why`-independent prose differs):
```
function expectEntryLstatFailure(
  diagnostics: readonly Diagnostic[],
  file: string,
  descriptor: string,
  why: string,
): void {
  const hits = hitsFor(diagnostics, UNREADABLE_SOURCE, file);
  expect(
    hits.length,
    `PRIMARY (bug 0113 residual 1 / bug 0075 §Affected): ${why} — ...`,
  ).toBe(1);
  const diagnostic = hits[0]!;
  expect(
    diagnostic.severity,
    "the Settings `thetaPaths` entry row's Unreadable cell is a warning ...",
  ).toBe("warning");
  expect(
    diagnostic.message,
    "DIAG-4: the message is the registry row's Message column interpolated ...",
  ).toBe(interpolate(loadRowMessage(UNREADABLE_SOURCE), { descriptor }));
  expect(
    diagnostics.filter((d) => d.code === MISSING_SOURCE),
    "a universe walk never emits missing-source ...",
  ).toHaveLength(0);
}
```

## Why this is a problem
The two functions differ only in their docstrings and in the prose strings passed as the second argument to `expect`; every executable line — the `hitsFor` call, the `toBe(1)` count, the hardcoded `"warning"` severity, the `interpolate(loadRowMessage(...))` message equality, and the `MISSING_SOURCE` absence guard — is identical between the two files. This is the same assertion sequence typed out twice under two different names in two files that both belong to the same bug-0113/listTree family (the tree-walk file's own header explicitly cross-references the glob-universe file's decorator by line number), rather than one shared helper parameterised or reused.

## Suggested direction (non-binding, optional)
A single shared assertion helper under `tests/helpers/` taking `(diagnostics, file, descriptor, why)` could serve both call sites, as observation of the natural home rather than a design.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kind; not applicable. Recording-double check: `hitsFor` and the `diagnostics` array are read-only observation, not a recording double asserting a MUST-NOT-call witness; not applicable. docs/bugs/ signature search: both functions are green/red per-cell helpers backing documented bug 0113 (and residual 1 / bug 0075) reds, not themselves disabled or red tests, so the correct-reason-red carve-out does not apply to the helper duplication itself. coverage-matrix/bug-doc citation search: grepped for `expectUniverseFailure` and `expectEntryLstatFailure` by name in `docs/reference/coverage-matrix.md` and the bug docs (0075, 0076, 0113) — no citation by name found, so no merge/rename of a pinned test is implied; the finding proposes only a shared-helper direction, not deletion of either file's tests.

## Triage
verdict: confirmed — both excerpts match at the cited lines (glob-universe:256-291, tree-walk-lstat:176-211) and the executable bodies are identical line for line (hitsFor(diagnostics, UNREADABLE_SOURCE, file) → toBe(1) → severity "warning" → interpolate(loadRowMessage(UNREADABLE_SOURCE), { descriptor }) → MISSING_SOURCE toHaveLength(0)), differing only in expect() prose; both are live (8 + 4 call sites), hitsFor is already the canonical tests/helpers/e2e-s1.ts export so the clone is exactly the four-assertion sequence, no third copy exists (the other UNREADABLE_SOURCE tests use toMatch/inline shapes), neither helper is cited in docs/reference/coverage-matrix.md or docs/bugs/, no gate/recording-double/red-test carve-out applies, and no existing PTQ names either helper — D7 boilerplate duplication, mechanical dedupe into a shared helper (triage: claude-fable-5-1)
