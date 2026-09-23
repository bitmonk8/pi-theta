---
id: PTQ-1491
title: The severity + templateToRegExp + toContain('package:"beta"') assertion tail is typed out four times across two discovery-failure files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/discovery-glob-universe-enumeration-failure.test.ts:671-688
  - tests/discovery-root-enumeration-failure.test.ts:762-779
  - tests/discovery-root-enumeration-failure.test.ts:838-850
  - tests/discovery-tree-walk-lstat-failure.test.ts:454-471
sites: 4
fix_scope: module
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# The severity + templateToRegExp + toContain('package:"beta"') assertion tail is typed out four times across two discovery-failure files

## Observation
Four test bodies across two files assert the identical three-step tail on a package-side `hits[0]` diagnostic: `diagnostic.severity` equals a hardcoded literal (`"warning"` or `"error"`), `diagnostic.message` matches `templateToRegExp(loadRowMessage(CODE))`, and `diagnostic.message` contains the literal string `package:"beta"`. One site is a named helper (`expectPackageUniverseFailure`); the other three are the same three lines re-typed inline inside individual `it(...)` bodies.

## Evidence
tests/discovery-glob-universe-enumeration-failure.test.ts:671-688 (inside `expectPackageUniverseFailure`):
```ts
    const diagnostic = hits[0]!;
    expect(
      diagnostic.severity,
      "the `Package pi.theta` row's Unreadable cell is a warning (discovery-sources.md:56)",
    ).toBe("warning");
    expect(
      diagnostic.message,
      "DIAG-4: the message is the registry row's Message template",
    ).toMatch(templateToRegExp(loadRowMessage(UNREADABLE_SOURCE)));
    ...
    expect(
      diagnostic.message,
      "the descriptor names the offending package (placeholder-rendering-b.md §5)",
    ).toContain('package:"beta"');
```

tests/discovery-root-enumeration-failure.test.ts:762-779 (RED 14, inline in the `it` body):
```ts
    const diagnostic = hits[0]!;
    expect(
      diagnostic.severity,
      "the Package `pi.theta` row's Unreadable cell is a warning (:54)",
    ).toBe("warning");
    ...
    expect(
      diagnostic.message,
      "DIAG-4: the message is the registry row's Message template",
    ).toMatch(templateToRegExp(loadRowMessage(UNREADABLE_SOURCE)));
    expect(
      diagnostic.message,
      "the descriptor names the offending package (placeholder-rendering-b.md §5)",
    ).toContain('package:"beta"');
```

tests/discovery-root-enumeration-failure.test.ts:838-850 (RED 15, the same tail with `MISSING_SOURCE`/`"error"`):
```ts
    const diagnostic = hits[0]!;
    expect(
      diagnostic.severity,
      "the `Package pi.theta entry` row's Missing cell is an error (:54)",
    ).toBe("error");
    ...
    expect(
      diagnostic.message,
      "DIAG-4: the message is the registry row's Message template",
    ).toMatch(templateToRegExp(loadRowMessage(MISSING_SOURCE)));
    expect(
      diagnostic.message,
      "the descriptor names the offending package (placeholder-rendering-b.md §5)",
    ).toContain('package:"beta"');
```

tests/discovery-tree-walk-lstat-failure.test.ts:454-471 (cell 5 RED, inline):
```ts
    const diagnostic = hits[0]!;
    expect(
      diagnostic.severity,
      "the `Package pi.theta` row's Unreadable cell is a warning " +
        "(discovery-sources.md:56)",
    ).toBe("warning");
    expect(
      diagnostic.message,
      "DIAG-4: the message is the registry row's Message template",
    ).toMatch(templateToRegExp(loadRowMessage(UNREADABLE_SOURCE)));
    ...
    expect(
      diagnostic.message,
      "the descriptor names the offending package (placeholder-rendering-b.md §5)",
    ).toContain('package:"beta"');
```

Search re-run immediately before filing: `grep -n "toContain('package:\"beta\"')" tests/discovery-glob-universe-enumeration-failure.test.ts tests/discovery-root-enumeration-failure.test.ts tests/discovery-tree-walk-lstat-failure.test.ts` → 4 hits at the exact lines cited (688, 779, 850, 471); each is immediately preceded (within the cited range) by the identical `.toMatch(templateToRegExp(loadRowMessage(...)))` line and, one `expect` block earlier, the identical `diagnostic.severity` check.

## Why this is a problem
The same three-statement assertion sequence over the same `hits[0]` diagnostic shape — a hardcoded severity literal, a `templateToRegExp(loadRowMessage(CODE))` message match, and a `toContain('package:"beta"')` descriptor check — is written out independently four times across two files rather than being expressed once (either as a shared helper the third and fourth callers reuse, or by the third/fourth call sites reusing the first file's `expectPackageUniverseFailure`). Three of the four occurrences are inline in individual `it` bodies rather than even locally factored, so any future change to the descriptor-rendering contract (the comments note this already happened once, "post-0461") must be hand-applied at all four sites to stay consistent.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` assertion for "the package-side unreadable/missing-source diagnostic's severity + registry-template message + package descriptor" would be the natural home the existing `expectPackageUniverseFailure` already models, as observation rather than design.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; not applicable. Recording-double check: `hits`/`diagnostic` are read-only observations over the `diagnostics` return array, not a call-recording MUST-NOT-call witness; not applicable. docs/bugs/ signature search: `grep -rln "discovery-glob-universe-enumeration-failure.test.ts\|discovery-root-enumeration-failure.test.ts\|discovery-tree-walk-lstat-failure.test.ts" docs/bugs/*.md` shows these files are witnesses for bugs 0075, 0076, 0113 by file name only; no citation names `expectPackageUniverseFailure` or these inline blocks, so no pinned identifier is touched by the shared-helper direction proposed here. coverage-matrix citation search: `grep -n "discovery-glob-universe-enumeration-failure\|discovery-root-enumeration-failure\|discovery-tree-walk-lstat-failure" docs/reference/coverage-matrix.md` → 0 hits. Prior-finding overlap check: `grep -rl "package:\\\"beta\\\"" quality/issues quality/resolved quality/intake` and `grep -rl "expectPackageUniverseFailure" quality/issues quality/resolved quality/intake` → 0 hits for both; PTQ-1377 (resolved) covers a disjoint pair of functions (`expectUniverseFailure`/`expectEntryLstatFailure`, the settings-side, non-package assertion helper) at disjoint line ranges from this finding's four sites.

## Triage
verdict: confirmed — all four excerpts reproduce at the cited lines (grep `toContain('package:"beta"')` → exactly 688/779/850/471 across tests/) and each is preceded by the identical `toMatch(templateToRegExp(loadRowMessage(CODE)))` + hardcoded-literal `diagnostic.severity` check on `hits[0]!`, differing only in the code constant, severity literal and expect() prose; three copies are inline in `it` bodies and the fourth is a single-file local helper, while the settings-side analogue was already centralised as tests/helpers/registry-oracle.ts:465 `expectUnreadableSourceFailure` (PTQ-1377's fix, disjoint sites/tail so not a duplicate; PTQ-0839 covered the `templateToRegExp` declaration, not this call-site sequence); no gate/recording-double carve-out applies, bug 0075 names "cell 5" only as a witness label and bug 0461 cites src lines, coverage-matrix 0 hits, so a shared-helper dedupe touches no pinned identifier — D7 boilerplate duplication; note the title/Observation say "two files" but the four locations span three (glob-universe, root-enumeration, tree-walk-lstat), a miscount that does not affect the evidence (triage: claude-fable-5-1)
