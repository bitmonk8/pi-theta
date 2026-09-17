---
id: PTQ-0782
title: The theta() line-joining fixture builder is redeclared byte-for-byte in b0106live and b0248live
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0106live-cofire-refusal-live-cell.test.ts:76-78
  - tests/live/b0248live-nested-malformed-escape-live-cell.test.ts:96-98
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917204232
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The theta() line-joining fixture builder is redeclared byte-for-byte in b0106live and b0248live

## Observation
Both files in this review's scope that plant `.theta` fixture text (a third,
`b0480live`, builds its one fixture with a plain array `.join("\n")` and
declares no such function) each declare an identical three-line module-local
helper named `theta` that joins its variadic string arguments with `"\n"` and
appends a trailing `"\n"`. The two declarations are byte-identical.

## Evidence
`tests/live/b0106live-cofire-refusal-live-cell.test.ts:76-78`:
```ts
function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}
```

`tests/live/b0248live-nested-malformed-escape-live-cell.test.ts:96-98`
(re-read immediately before filing, byte-identical to the excerpt above):
```ts
function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}
```

Search: `grep -n "^function theta(" tests/live/b0106live-cofire-refusal-live-cell.test.ts tests/live/b0248live-nested-malformed-escape-live-cell.test.ts` returns exactly these two hits, one per file, both with the identical three-line body confirmed by direct read. Neither `tests/live/harness.ts` nor any module under `tests/helpers/` exports a function of this name or shape (`grep -rn "function theta\b" tests/live/harness.ts tests/helpers/*.ts` returns no hit).

## Why this is a problem
Both files already import their planted-workspace machinery
(`plantThetaWorkspace`, `bootShippedExtension`, `requireLiveProvider`) from
the same `./harness` module, so both already depend on one shared module that
could carry this three-line joiner as an export; instead each file re-derives
it locally under the identical name and body. A change to the line-join
convention (e.g. a different terminator) would have to be applied at both
sites independently, with nothing to signal a copy left unchanged.

## Suggested direction (non-binding, optional)
`tests/live/harness.ts`, which both files already import from, is the natural
home the two identical copies point at, as an exported sibling of
`plantThetaWorkspace`.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds; not applicable.
- Recording-double check: not applicable — this is a text-building helper,
  not a recording double or a MUST-NOT witness.
- docs/bugs/ signature search: `grep -rl "function theta(" docs/bugs/*.md`
  returns no hits; no documented correct-reason-red cites this helper.
- coverage-matrix/bug-doc citation search: `grep -n "b0106live-cofire-refusal-live-cell\|b0248live-nested-malformed-escape-live-cell" docs/reference/coverage-matrix.md` returns no hits. This finding proposes no merge, rename, or deletion of any test or `it()`/`describe()` — only that the identical three-line helper could be imported once instead of re-derived twice.
- Prior-filing overlap check: `grep -rl "b0106live" quality/issues/*.md quality/intake/*.md` and the same for `b0248live` each return only `PTQ-0769-bootnotes-systemnotecontents-duplicated.md`, which covers a different function (`bootNotes`/`notesFor`, the `theta-system-note`-channel reader) in the same two files, not this `theta()` line-joiner; this is a distinct root cause, filed separately per the "one root cause per finding" rule.
- Not a coverage claim: both copies are already exercised by their own file's assertions; the finding is about the repeated helper definition, not a missing test path.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (b0106live:76-78, b0248live:96-98) and sed-extracted bodies diff byte-identical; both copies are live (5 and 3 `theta(` call sites respectively); `grep -rlF 'lines.join("\n") + "\n"' tests/live/` → exactly these two files; neither tests/live/harness.ts (exports plantThetaWorkspace only) nor any tests/helpers/*.ts exports a theta joiner; both files import from ./harness as claimed; neither is a *gate* test, neither is cited by docs/reference/coverage-matrix.md or docs/bugs/ (`function theta(` → 0 hits), no it()/describe() change proposed, failLoudly posture untouched; dedupe: PTQ-0769 covers the disjoint bootNotes reader in the same files, PTQ-0606 covers the theta/invokeCaller/callableCaller trio in four tests/*.test.ts production-load files with tests/helpers/production-load-harness.ts as home and does not cite these tests/live sites — distinct file family and shared module, so a mechanical D7 copy-paste-fixture dedupe (note for acceptance: the same three-line joiner also appears verbatim in ~24 other tests/*.test.ts files outside this review's scope, so the human may prefer to fold this into a repo-wide theta() consolidation alongside PTQ-0606) (triage: claude-fable-5-1)
