---
id: PTQ-1572
title: Bug 0162's fix record names its H8a live witness as tests/live/params-inline-enum-live.test.ts (in the shipped-files list and in the cited live command), a path that has never existed in the tree
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0162-inline-enum-trigger-misses-params-position.md:571-575
  - docs/bugs/0162-inline-enum-trigger-misses-params-position.md:614-617
  - docs/bugs/0162-inline-enum-trigger-misses-params-position.md:627-634
  - tests/live/params-inline-enum-live-cell.test.ts:1-3
  - tests/live/params-inline-enum-live-cell.test.ts:136-143
  - tests/live/params-inline-enum-live-cell.test.ts:168-235
sites: 2
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0162's fix record names its H8a live witness as tests/live/params-inline-enum-live.test.ts (in the shipped-files list and in the cited live command), a path that has never existed in the tree

## Observation
`docs/bugs/0162-inline-enum-trigger-misses-params-position.md` `## Fix (0.209.0)` names its live witness by path twice. *What shipped* says `tests/live/params-inline-enum-live.test.ts` "(new, one H8a registration cell)", and *Gates* cites a live run of `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/params-inline-enum-live.test.ts` with a passing result. *Verification* (3) depends on that same cell for its host-level claim. No file at that path exists, and no commit on any ref has ever touched it, so the cited command cannot be run as written. The fix commit `7f125c11` (v0.209.0) added the live cell as `tests/live/params-inline-enum-live-cell.test.ts`. That file is still in the tree and self-identifies as bug 0162's H8a-T cell. Both pins have carried the `-live-cell`-less name since the fix commit itself.

## Evidence
Claim side, `docs/bugs/0162-inline-enum-trigger-misses-params-position.md:571-575` (re-read before filing):
```
  `tests/params-inline-enum-position-refusal.test.ts` (new, 48 cells) and
  `tests/live/params-inline-enum-live.test.ts` (new, one H8a
  registration cell) lock it; the three protected fence cells that assert the
  `params:` disposition of the bare spelling were flipped under this report's
  own authority (see *Protected locks* below).
```
`:614-617`:
```
  clean; `npm run lint` clean; live
  `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/params-inline-enum-live.test.ts`
  → `Test Files 1 passed (1) / Tests 1 passed (1)` (run twice, the second under
  the shared live lock by the orchestrator).
```
`:627-634` (the claim that rests on it):
```
- Verification: SOLID. (1) The witness reds on a neutralised fix with the bug's
  own signature and greens on restore, the file proved byte-identical by hash.
  (2) The full default suite is green. (3) A new H8a live cell exercises the
  fixed path end to end through the real discovery→registration path — the
  `enum[{a: string}]` theta no longer registers while its `"a" | "b"` sibling
  and an unrelated control still do, and the `theta-system-note` channel names
  the registered inline-enum row (registration and system-note observables, no
  model-echo sentinel). (4) Lint and typecheck are clean.
```

Evidence side, the equivalent witness actually in the tree. `tests/live/params-inline-enum-live-cell.test.ts:1-3`:
```
// Bug 0162 — standalone live registration cell (lane/h; the 0104/0217-cell-74
// standalone/registration-only precedent). Deliberately NOT added to
// tests/live/live-production-acceptance.test.ts (a sibling-shared file).
```
`:136-143`: the describe block `"H8a-T — bug 0162 (h) live cell: theta/parse/inline-enum fires at the params: field's own top-level captured text, live"` and its one `it(`. `:168-235`: `handle.command("h3ctl")` and `handle.command("h3legal")` `.toBeDefined()` (the control and the `"a" | "b"` sibling), `handle.command("h3braceenum")` `.toBeUndefined()` (the `enum[{a: string}]` theta), and `systemNoteContents(handle.sessionManager.getEntries())` checked with `loadNotes.some((note) => note.includes(expectedFragment))` `.toBe(true)` for the registered inline-enum row. These match Verification (3) observable for observable.

Searches (run this session, repo root):
- `git log --all --format=%h -- 'tests/live/params-inline-enum-live.test.ts' | wc -l` → 0 (no commit on any ref ever touched the stated path).
- `ls tests/live | grep -c "params-inline-enum-live.test.ts"` → 0.
- `git show 7f125c11 --stat | grep -i "test\|live"` → lists `tests/live/params-inline-enum-live-cell.test.ts | 264 +++++++` and `tests/params-inline-enum-position-refusal.test.ts | 824 +++++`.
- `git log --format="%h %s" -S 'params-inline-enum-live.test.ts' -- docs/bugs/0162-inline-enum-trigger-misses-params-position.md` → `7f125c11 fix(bug-0162): …` only. `git show 7f125c11:docs/bugs/0162-…md | grep -c "params-inline-enum-live.test.ts"` → 2, so both pins were written in the commit that shipped the differently named file.
- `git log --follow --name-status -- tests/live/params-inline-enum-live-cell.test.ts` → `A` at `7f125c11`, then only `M` entries (f3be3b4c, 9d378465, e3546327, fff20188, bf57e617). No rename.

## Why this is a problem
The record's Status is `fixed (0.209.0)`, and Verification (3) is its only end-to-end host-level claim. Both citations of that evidence, the shipped-file entry and the gate command, point at a path that has never resolved. A triage or verifier re-run of the cited command finds no test file, so from the record alone the live claim cannot be told apart from an unrecorded one. The real cell exists under another name and asserts the claimed observables. It sits under `tests/live/**`, which `vitest.config.ts:12` excludes from the default gate (`exclude: [...configDefaults.exclude, "tests/live/**"]`), so even once the pointer is corrected claim (3) is capped at "a live witness exists", not gate-proven. The default-suite witness `tests/params-inline-enum-position-refusal.test.ts` resolves as stated and is not affected.

## Suggested direction (non-binding, optional)
Re-point `:572` and `:615` at `tests/live/params-inline-enum-live-cell.test.ts`, the file `7f125c11` actually added, which self-identifies as bug 0162's H8a-T cell.

## False-positive check
- Representations enumerated, one search each: (1) bug-doc Witness/Fix pins: `grep -rn "params-inline-enum-live" docs tests AGENTS.md CHANGELOG.md` → 4 hits. Two are this record (`:572`, `:615`) and two are bug 0243's sweep tables (`0243-…md:133`, `:448`), both of which name the correct `params-inline-enum-live-cell.test.ts`. (2) Test file names: `git ls-files 'tests/**' | grep -c "params-inline-enum-live"` → 1 (`tests/live/params-inline-enum-live-cell.test.ts`). `grep -rln "0162" tests/live` → the same single file. (3) Test titles: `grep -rn "H8a-T — bug 0162" tests` → 1 hit, `params-inline-enum-live-cell.test.ts:137`. (4) Coverage-matrix rows: `grep -c "0162\|inline-enum" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 0 and 0. (5) AGENTS.md gate names: `grep -c "0162\|params-inline-enum" AGENTS.md` → 0. (6) CHANGELOG, corroboration only: `grep -n "0162\|params-inline-enum" CHANGELOG.md` → the 0.209.0 entry at `:3118-3129`, which says "an H8a registration/system-note live cell" and gives no path.
- History intent: there is no delete or rename of the stated path to cluster by, since it was never added. The pointer never resolved. It did not decay later. Same shape as this wave's b0078/b0092 filings, but a different record and a different commit, so it is not a duplicate. No pending candidate cites bug 0162.
- Not citation form: no gate checks `docs/bugs/**` witness paths. I did not adjudicate whether the claim is true, and I executed nothing.

## Triage
verdict: confirmed — all stated searches reproduce: 0 commits ever touched tests/live/params-inline-enum-live.test.ts, 7f125c11 added tests/live/params-inline-enum-live-cell.test.ts (A, then only M, no rename), and 7f125c11 wrote both bad pins at bug-0162 :572 and :615. My own searches found no witness under the stated name in coverage-matrix rows, AGENTS.md or test titles, and no duplicate in intake or issues. The claimed observables have a verified witness: tests/live/params-inline-enum-live-cell.test.ts, describe "H8a-T — bug 0162 (h) live cell: theta/parse/inline-enum fires at the params: field's own top-level captured text, live", it "does not register a theta whose params: field declares enum[{a: string}] (nor the bare enum[\"x\", \"y\"] sibling), while its legal \"a\" | \"b\" sibling and an unrelated control both still register, through the real discovery→registration path". It asserts h3ctl/h3legal defined, h3braceenum/h3bareenum undefined, and a system note naming the inline-enum row. The default-suite witness tests/params-inline-enum-position-refusal.test.ts resolves as stated. The fix is a mechanical re-point of :572 and :615 (triage: claude-opus-5-5)
