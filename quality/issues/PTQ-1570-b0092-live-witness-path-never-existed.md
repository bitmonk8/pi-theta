---
id: PTQ-1570
title: Bug 0092's fix record names its H8a live witness as tests/live/live-echo-array-.test.ts, a path that has never existed in the tree
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0092-renderobject-first-field-unguarded-cast.md:416-417
  - docs/bugs/0092-renderobject-first-field-unguarded-cast.md:442-448
  - tests/live/echo-array-per-element-live-cell.test.ts:1-4
  - tests/live/echo-array-per-element-live-cell.test.ts:97
  - tests/live/echo-array-per-element-live-cell.test.ts:135-136
sites: 2
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0092's fix record names its H8a live witness as tests/live/live-echo-array-.test.ts, a path that has never existed in the tree

## Observation
`docs/bugs/0092-renderobject-first-field-unguarded-cast.md` §Fix (0.211.0) names its live witness `tests/live/live-echo-array-.test.ts` twice: in *What shipped* (the new file) and in *Verification* obligation (iii) (the live pass/red-proof). No file by that name exists in the tree, and none was ever committed. The fix commit `c2cb79e9` (the only commit to touch the record's Fix section) added the live cell as `tests/live/echo-array-per-element-live-cell.test.ts`, and that file is still present. The record's path has pointed at nothing from the moment it was written. That leaves the record's only live-level claim without a pointer that resolves.

## Evidence
Claim side, `docs/bugs/0092-renderobject-first-field-unguarded-cast.md:416-417` (re-read before filing):
```
  - `tests/live/live-echo-array-.test.ts` (new) — the H8a live witness
    for the declared-default carrier.
```
`docs/bugs/0092-renderobject-first-field-unguarded-cast.md:442-448`:
```
  (iii) Live: `tests/live/live-echo-array-.test.ts` drives the
  declared-default carrier through the shipped discovery→registration→binder→
  echo path and asserts the delivered `theta-system-note` carries
  `items=[{x, …}, null] (default)` with no abort framing — green with the fix,
  and proved red in the same lock-held run with the two source files reverted:
  `Notes: ["theta /b0092live aborted with internal error: Cannot read
  properties of null (reading 'label')"]`. (iv) Lint and typecheck clean.
```

Evidence side, the equivalent witness actually in the tree, `tests/live/echo-array-per-element-live-cell.test.ts:1-4`:
```
// H8a live witness — bug 0092: a heterogeneous-array `params:` default echoes
// each element under its OWN descriptor, live, through the real
// discovery→registration→binder→echo path
// (docs/bugs/0092-renderobject-first-field-unguarded-cast.md).
```
`:97` — `const EXPECTED_ITEMS_FRAGMENT = "items=[{x, …}, null] (default)";` (the fragment claim (iii) names).
`:135-136`:
```
describe("H8a-T — bug 0092: a heterogeneous-array params: default echoes each element under its own descriptor, live (Convention: live-host acceptance)", () => {
  it("binds the declared-default carrier and delivers the fixed BND-1 echo fragment instead of aborting the invocation", async () => {
```

Searches (run this session, from the repo root):
- `ls tests/live | grep -c "live-echo-array"` → 0.
- `git ls-files 'tests/**' | grep -c "live-echo-array-"` → 0.
- `git log --all --format=%h --diff-filter=A -- 'tests/live/live-echo-array*' | wc -l` → 0 (never added under that name on any ref).
- `git show --stat c2cb79e9` → the fix commit adds `.../live/echo-array-per-element-live-cell.test.ts | 231 ++++++++`. `git log --follow -- tests/live/echo-array-per-element-live-cell.test.ts` → `c2cb79e9` (add) and `fff20188` (a later in-place modify), with no rename.
- `grep -rn "live-echo-array" tests docs AGENTS.md CHANGELOG.md` → 2 hits, both the record's own lines 416 and 442.
- `git log -p -- docs/bugs/0092-…md` → the `live-echo-array-.test.ts` lines appear first in commit `c2cb79e9` (lines added in that diff). The only earlier commit, `f8646659`, is the filing, which predates the Fix section.

## Why this is a problem
The record's Status is `fixed (0.211.0)`, and its *Verification* item (iii) is the record's only host-level claim: the declared-default carrier renders through the shipped discovery→registration→binder→echo path, red-proved against the real crash. The record cites no evidence for that claim that resolves. A reader, reviewer, or triage re-run following the stated path finds no file, so from the record alone the live claim cannot be told apart from an unrecorded one. The live cell does exist under another name and asserts the claimed observable. It sits under `tests/live/**`, so it is not gate-proven by the default preflight. That caps claim (iii) at "a live witness exists" even once the pointer is corrected.

## Suggested direction (non-binding, optional)
Re-point both citations (lines 416 and 442) at `tests/live/echo-array-per-element-live-cell.test.ts`, the file `c2cb79e9` actually added. It self-identifies as bug 0092's H8a witness and asserts `items=[{x, …}, null] (default)`.

## False-positive check
- Representations enumerated and searched: (1) bug-doc Witness/Fix lines: the two in-record pins above, plus `grep -rn "live-echo-array" tests docs AGENTS.md CHANGELOG.md` → 2 hits (both in the record); (2) test file names: `ls tests/live | grep -c "live-echo-array"` → 0, `git ls-files 'tests/**' | grep -c "live-echo-array-"` → 0, and `grep -rln "0092" tests/live` → 1 file (`echo-array-per-element-live-cell.test.ts`); (3) test titles: `grep -rnE "(it|describe)\(.*bug 0092" tests` → 4 hits, three `describe`s in `tests/echo-array-per-element-descriptor.test.ts` (the default-suite witness, which exists and has 12 `it(` cells as the record says) and one `describe` in `tests/live/echo-array-per-element-live-cell.test.ts`; (4) coverage-matrix rows: `grep -c "0092\|echo-array" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 0 and 0; (5) AGENTS.md gate names: `grep -n "echo-array\|0092" AGENTS.md | wc -l` → 0; (6) CHANGELOG (corroboration only): `grep -n "0092\|echo-array" CHANGELOG.md` finds the 0.211.0 entry at :3088, which names only "an H8a live cell red-proven against the real crash", no path.
- History intent: no rename or delete exists to cluster by (`--diff-filter=A` on the stated path → 0 commits), so this is a pointer that never resolved (unwitnessed as stated), not a decayed one with a deleting sha.
- Similar zero-length-token live paths appear in records outside this shard (`grep -rn 'live-[a-z-]*-\.test\.ts' docs/bugs` also hits 0131, 0133, 0234, 0240). Those are not listed here because they are out of this shard's scope.
- The default-suite witness `tests/echo-array-per-element-descriptor.test.ts` is unaffected: it exists and resolves as stated. This filing covers only the live pointer.
- Not a citation-form issue: no gate checks `docs/bugs/**` witness paths. The claim's truth (whether the live cell passes) is not adjudicated here, and nothing was executed.

## Triage
verdict: confirmed — every stated search reproduces: `tests/live/live-echo-array-.test.ts` shows up only as the record's own lines 416 and 442, with 0 files, 0 tracked paths and 0 adds on any ref. c2cb79e9 added the live cell as `tests/live/echo-array-per-element-live-cell.test.ts`, and `--follow` shows no rename (c2cb79e9, then fff20188). The claimed observable does have a witness in the tree: tests/live/echo-array-per-element-live-cell.test.ts, describe "H8a-T — bug 0092: a heterogeneous-array params: default echoes each element under its own descriptor, live (Convention: live-host acceptance)" / it "binds the declared-default carrier and delivers the fixed BND-1 echo fragment instead of aborting the invocation". It asserts `items=[{x, …}, null] (default)` (:97, :181) and no abort framing (:197), under slash name b0092live. The record just points at a path that never existed, so the fix is a mechanical re-point of lines 416 and 442. The coverage matrix and AGENTS.md have 0 rows for this bug, and no other intake file or PTQ tracks it (triage: claude-opus-5-5)
