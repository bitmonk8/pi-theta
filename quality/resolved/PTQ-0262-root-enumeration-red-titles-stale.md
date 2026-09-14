---
id: PTQ-0262
title: Three test titles in discovery-root-enumeration-failure.test.ts still promise pre-bug-0461 descriptor content their bodies no longer check
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/discovery-root-enumeration-failure.test.ts:461
  - tests/discovery-root-enumeration-failure.test.ts:479-486
  - tests/discovery-root-enumeration-failure.test.ts:499
  - tests/discovery-root-enumeration-failure.test.ts:511-518
  - tests/discovery-root-enumeration-failure.test.ts:906
  - tests/discovery-root-enumeration-failure.test.ts:946-959
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# Three test titles in discovery-root-enumeration-failure.test.ts still promise pre-bug-0461 descriptor content their bodies no longer check

## Observation
Commit `25613fe2` ("fix(bug-0461): source-failure diagnostics render the
normative descriptor form — v0.460.0", 2026-09-05) rewrote this file's
`descriptor:` / `.toContain(...)` values from the pre-fix category-text form
to the post-fix `<kind>:"<value>"` form, and in the same diff updated the
"RED N" titles of RED 3, RED 5, RED 6 and RED 8 to quote the new form. Three
titles were left unreconciled with the bodies the same commit rewrote: RED 1
and RED 2 still backtick-quote the literal PRE-fix category-text strings
(`project .pi/theta/`, `global thetas directory`) that the commit's diff shows
being replaced inside their own `expectEnumerationFailure` calls, and RED 14
still claims the diagnostic names "the package and its manifest key" even
though the same commit deleted the one assertion that ever checked the
manifest key, replacing it with a comment stating the message format "has no
slot for" that distinction. All three tests currently pass.

## Evidence
`tests/discovery-root-enumeration-failure.test.ts:461`:
```ts
  it("RED 1: project `.pi/theta` denied EACCES on readdir (lstat ok) emits exactly one unreadable-source warning naming `project .pi/theta/`", async () => {
```
`tests/discovery-root-enumeration-failure.test.ts:479-486` — the descriptor
RED 1 actually asserts on:
```ts
    ).toHaveLength(0);
    expectEnumerationFailure(
      diagnostics,
      {
        code: UNREADABLE_SOURCE,
        severity: "warning",
        file: PROJECT_ROOT,
        descriptor: 'project:"/project/.pi/theta"',
      },
```
`tests/discovery-root-enumeration-failure.test.ts:499`:
```ts
  it("RED 2: global `~/.pi/agent/theta` denied EPERM on readdir emits an unreadable-source warning naming `global thetas directory`", async () => {
```
`tests/discovery-root-enumeration-failure.test.ts:511-518` — the descriptor
RED 2 actually asserts on:
```ts

    expectEnumerationFailure(
      diagnostics,
      {
        code: UNREADABLE_SOURCE,
        severity: "warning",
        file: GLOBAL_ROOT,
        descriptor: 'global:"/home/theta/.pi/agent/theta"',
      },
```
`tests/discovery-root-enumeration-failure.test.ts:906`:
```ts
  it("RED 14: a directory contributed by a `pi.theta` entry, denied EACCES, emits an unreadable-source warning naming the package and its manifest key", async () => {
```
`tests/discovery-root-enumeration-failure.test.ts:946-959` — RED 14's only
descriptor-content assertion, with the comment explaining why the manifest
key is absent:
```ts
    // The registry frame is pinned byte-exact (DIAG-4). Post-0461 the
    // descriptor slot renders the normative `package:"<name>"` form
    // (placeholder-rendering-b.md §5) — the same bytes for both the
    // `pi.theta`-contributed directory and the conventional `theta/`
    // fallback, since the kind:value grammar has no slot for the manifest-key
    // distinction the pre-fix category prose carried.
    expect(
      diagnostic.message,
      "DIAG-4: the message is the registry row's Message template",
    ).toMatch(templateToRegExp(loadRowMessage(UNREADABLE_SOURCE)));
    expect(
      diagnostic.message,
      "the descriptor names the offending package (placeholder-rendering-b.md §5)",
    ).toContain('package:"beta"');
```
`git show 25613fe2 -- tests/discovery-root-enumeration-failure.test.ts`
confirms the mechanism against the pre-commit text: it changed
`descriptor: "project .pi/theta/"` → `descriptor: 'project:"/project/.pi/theta"'`
at RED 1 and `descriptor: "global thetas directory"` →
`descriptor: 'global:"/home/theta/.pi/agent/theta"'` at RED 2 without touching
either `it(...)` title line, while in the SAME diff it rewrote RED 3's title
from `` naming `--theta flag #1` `` to
`` naming `cli-flag:"--theta /opt/loop"` `` (and did the equivalent for RED 5,
RED 6, RED 8). For RED 14 the commit deleted a second, then-existing
expectation — `expect(diagnostic.message, "the descriptor names the manifest
key that contributed the directory (package-and-settings.md:25)").toContain
("pi.theta")` — and added the "has no slot for the manifest-key distinction"
comment quoted above, again without touching the `it(...)` title line.

## Why this is a problem
Each title is vestigial: it describes what the assertion checked BEFORE
commit `25613fe2`, not what it checks now. A reader trusting RED 1's or RED
2's title would expect `diagnostic.message` to contain the literal string
`project .pi/theta/` or `global thetas directory`; the actual assertion
requires the opposite byte sequence — `project:"/project/.pi/theta"` /
`global:"/home/theta/.pi/agent/theta"` — which is exactly the new form the
same commit introduced to replace the string the title still quotes. A
reader trusting RED 14's title would expect some assertion to verify the
message names the manifest key (e.g. that it mentions `cmds` or `pi.theta`);
no such assertion exists after the commit, and the adjacent comment states
the current message grammar structurally cannot carry that distinction. In
every case the title promises a specific, quotable fact about the message
that the body does not — and for RED 14, cannot — check, while sibling titles
in the same file and the same commit (RED 3, RED 5, RED 6, RED 8, RED 12,
RED 15) were correctly reconciled to the new form or the generic "naming the
package" phrasing.

## Suggested direction (non-binding, optional)
None of the three cases need new test logic — the wording gap is confined to
the quoted phrase inside each `it(...)` call, aligning it with the sibling
titles the same commit already reconciled.

## False-positive check
- Gate-pin check: `discovery-root-enumeration-failure.test.ts` does not match
  `*gate*.test.ts` or any named gate kind (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); not applicable.
- Recording-double check: none of the three cited tests is a call-recording
  double asserting a MUST-NOT witness; not applicable.
- docs/bugs/ signature search: this file is not left red on purpose —
  `npx vitest run tests/discovery-root-enumeration-failure.test.ts` passes all
  17 tests, and re-running with `-t "RED 14"` alone shows 1 passed. Bug 0076
  (`docs/bugs/0076-existing-root-enumeration-failure-silent.md`) is
  "Status: fixed (0.67.0)"; bug 0461
  (`docs/bugs/0461-source-failure-descriptor-category-text.md`) is
  "Status: fixed (0.460.0)". This finding is not about redness, a skip, or
  wrong behaviour — every cited test currently passes, verifying real (fixed)
  behaviour; only the title text lags the commit that rewrote the assertions
  it describes.
- coverage-matrix/bug-doc citation search:
  `grep -n "discovery-root-enumeration-failure" docs/reference/coverage-matrix.md`
  returns no hits. Bug 0461's own doc
  (`docs/bugs/0461-source-failure-descriptor-category-text.md:200`) cites
  `tests/discovery-root-enumeration-failure.test.ts` by name in its witness
  list (one of ten files whose committed bytes it says a conforming fix would
  re-pin), but names the file as a whole, not RED 1, RED 2, or RED 14
  individually. This finding does not propose merging, renaming, or deleting
  the test file or any of its cases — only that three titles' wording has not
  kept pace with the bodies the cited commit already rewrote.
- Coverage drift check: this observation is confined to wording in three
  existing, currently-passing, currently-run test cases; it makes no claim
  that any behaviour is untested.

## Triage
verdict: confirmed — `git show 25613fe2 -- tests/discovery-root-enumeration-failure.test.ts` and the current file both independently verify RED 1/RED 2/RED 14's `it()` titles still quote the pre-fix category-text descriptor strings the same commit deleted from their bodies, while sibling RED 3/5/6/8 titles were reconciled and RED 12/15 already used generic phrasing; all 17 tests pass, this is a misleading-name D7 class in tests/ only, and no gate/recording-double/coverage-matrix/bug-witness carve-out applies (triage: claude-opus-5)
