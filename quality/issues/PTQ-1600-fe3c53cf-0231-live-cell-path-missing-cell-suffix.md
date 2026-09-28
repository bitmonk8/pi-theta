---
id: PTQ-1600
title: "Bug 0231's 0.189.0 fix record names its H8a live witness tests/live/inline-object-malformed-entry-resync-live.test.ts twice, including in its verbatim gate command, but fe3c53cf added …-live-cell.test.ts and the cited path has never existed"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md:658-661
  - docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md:668-672
  - tests/live/inline-object-malformed-entry-resync-live-cell.test.ts:1-6
  - tests/live/inline-object-malformed-entry-resync-live-cell.test.ts:117-118
  - tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts:17-21
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0231's 0.189.0 fix record names its H8a live witness tests/live/inline-object-malformed-entry-resync-live.test.ts twice, including in its verbatim gate command, but fe3c53cf added …-live-cell.test.ts and the cited path has never existed

## Observation
Bug 0231's `## Fix (0.189.0)` names its H8a live witness by path twice, once under "What shipped" and once in the *Gates* live command. Both times the path is `tests/live/inline-object-malformed-entry-resync-live.test.ts`. No file exists at that path, and no commit on any ref ever added one. The fix commit fe3c53cf added `tests/live/inline-object-malformed-entry-resync-live-cell.test.ts`, the same stem with `-live-cell`. The H9a sibling path cited alongside it resolves. The H9a file's own header comment repeats the wrong H8a path.

## Evidence
Claim side (re-read just before filing), `docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md:658-661`:
```
  - `tests/live/inline-object-malformed-entry-resync-live.test.ts` and
    `tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts`
    — the H8a and H9a end-to-end cover for the generic-argument row d1, which
    is the position where the load/registration verdict moved.
```
`:668-672`:
```
  --no-error-on-unmatched-pattern "src/**/*.ts"`) clean, no output. Live, each
  under the shared lock: H8a `npx vitest run --config
  config/vitest/vitest.live.config.ts
  tests/live/inline-object-malformed-entry-resync-live.test.ts` → `1
  passed`, 22 727 ms, `rc=0`; H9a `… tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts`
```

Evidence side, the equivalent witness (opened), `tests/live/inline-object-malformed-entry-resync-live-cell.test.ts:2` and `:117-118`:
```
// H8a live witness -- bug 0231: `TypeParser.parseObject`'s malformed-field
...
describe("bug 0231 live: a well-formed field's case violation behind a malformed generic-argument entry now refuses registration", () => {
  it("does not register `let x: array<{a b: integer, Zs: string}> = [1]` post-fix, the theta-system-note channel names binding-case-mismatch, and the case-fixed sibling still registers and drives", async () => {
```
The H9a file's header repeats the stale path, `tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts:19-20`:
```
// `parseThetaDocument` boundary; the H8a cell
// (`tests/live/inline-object-malformed-entry-resync-live.test.ts`)
```

Searches (all run in this session):
- Path existence: `find tests -name "inline-object-malformed-entry-resync-live.test.ts" | wc -l` → **0**. The `-live-cell` file is present (224 lines).
- History, all refs: `git log --all --oneline -- tests/live/inline-object-malformed-entry-resync-live.test.ts` → **0** commits. `git show --name-status --format= fe3c53cf` → `A tests/live/inline-object-malformed-entry-resync-live-cell.test.ts` and `A tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts`.
- String history: `git log --all --oneline -S"malformed-entry-resync-live.test"` → 1 commit, fe3c53cf.
- Test filenames and bodies: `grep -rn -- "malformed-entry-resync-live.test" tests | wc -l` → **1**, the H9a header comment above.
- Bug-doc witness lines: `grep -rn -- "malformed-entry-resync-live.test" docs | wc -l` → **2**, this record's :658 and :671. The correct `-live-cell` path is cited in docs/bugs/0243 (:116, :464), 0257:715, 0287:277.
- Coverage matrix: `grep -c "0231" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md` → **0** / **0**.
- AGENTS.md gate names: `grep -c -- "malformed-entry-resync-live.test" AGENTS.md` → **0**.
- CHANGELOG (corroboration only): `grep -c -- "malformed-entry-resync-live.test" CHANGELOG.md` → **0**. The 0231 entry at :3437 says only "H8a/H9a live pair".

## Why this is a problem
The verbatim gate command at :669-671 cannot be run as written: the file it names has never existed. The record's "`1 passed`, 22 727 ms, `rc=0`" therefore cannot be reproduced from its own pointer. The witness exists under a one-suffix-different name and is the cell the record describes. It sits under `tests/live/**`, so it is not gate-proven, and the record words it as one recorded live run. (What that cell asserts today was also changed later. That is a separate root cause, filed separately in this shard under 6184e7c3/c79568be.)

## Suggested direction (non-binding, optional)
Re-point both mentions to `tests/live/inline-object-malformed-entry-resync-live-cell.test.ts`, the path fe3c53cf added.

## False-positive check
- Representations covered: bug-doc witness lines (grep over docs), test filenames (`find tests -name`, `git log --all -- <path>`), test titles and bodies (`grep -rn tests`), coverage-matrix rows (both files), AGENTS.md gate names, and CHANGELOG (corroboration). Hit counts are above.
- The equivalent witness was opened, and its describe/it titles name bug 0231's row-d1 observable.
- The pointer never resolved, so the cluster key is the fix commit fe3c53cf. No other record in this shard cites this path.
- The H9a header comment carrying the same wrong path is test prose. It is cited as corroboration and not filed as a separate site.
- Not already filed: `grep -rl -- "malformed-entry-resync-live" quality/intake` → 0 files other than this one.

## Triage
verdict: confirmed — decayed-pointer reproduces: docs/bugs/0231:658 and :671 cite tests/live/inline-object-malformed-entry-resync-live.test.ts, which find (0), git log --all -- <path> (0 commits) show has never existed (a never-resolved pointer, so no deleting sha; the cluster key is fix commit fe3c53cf, whose `git show --name-status` adds exactly tests/live/inline-object-malformed-entry-resync-live-cell.test.ts plus the H9a acceptance file). The unambiguous equivalent is verified: -live-cell.test.ts (224 lines), header "H8a live witness -- bug 0231", describe "bug 0231 live: a well-formed field's case violation behind a malformed generic-argument entry now refuses registration" (:117), and 0243/0257/0287 already cite it. The fix is a mechanical re-point of both mentions, wording untouched. The H9a header :20 repeats the stale path (test prose, corroboration only). No other intake file or PTQ tracks this pointer; d10-05 (6184e7c3) is a separate root cause (triage: claude-opus-5-5)
