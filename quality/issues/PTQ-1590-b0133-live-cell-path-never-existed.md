---
id: PTQ-1590
title: Bug 0133's fix record names its H8a live witness as tests/live/schema-field-discard-recovery-live-cell-.test.ts, a path that has never existed in the tree
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0133-field-list-discard-recovery-unsettled.md:1159-1160
  - docs/bugs/0133-field-list-discard-recovery-unsettled.md:1187-1197
  - tests/live/schema-field-discard-recovery-live-cell.test.ts:1-6
  - tests/live/schema-field-discard-recovery-live-cell.test.ts:85-91
  - tests/live/schema-field-discard-recovery-live-cell.test.ts:128-161
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0133's fix record names its H8a live witness as tests/live/schema-field-discard-recovery-live-cell-.test.ts, a path that has never existed in the tree

## Observation
`docs/bugs/0133-field-list-discard-recovery-unsettled.md` §Fix (0.203.0) lists under *What shipped* a live witness at `tests/live/schema-field-discard-recovery-live-cell-.test.ts`, with a hyphen before `.test.ts`. Its *Verification* section then claims that "the new H8a cell" was run for real and red-proved. That path is the record's only pointer to the live cell. No file at that path exists, and `git log --all` shows no commit ever touching it. The fix commit `d5fba72f` added `tests/live/schema-field-discard-recovery-live-cell.test.ts` (no trailing hyphen), and the record carried the hyphenated spelling in that same commit. The existing file asserts every observable the *Verification* bullet lists.

## Evidence
Claim side, `docs/bugs/0133-field-list-discard-recovery-unsettled.md:1159-1160` (re-read before filing):
```
  - `tests/live/schema-field-discard-recovery-live-cell-.test.ts` — the
    H8a live cell (this surface had none).
```
`:1187-1193`:
```
  - *A live test exercises the fixed path, run for real.* The new H8a cell boots
    the shipped extension against a live provider, asserts a well-formed control
    registers, asserts `schema S { a: string, 42: integer }` does NOT register,
    and asserts the discriminating pair on the `theta-system-note` channel read
    off the settled in-memory `SessionManager`: the new code's registry-sourced
    fragment present AND the declaration-subject `'S' has no fields` fragment
    absent. Both note assertions were proven able to red by two inverted-probe
```

Evidence side: the equivalent witness `tests/live/schema-field-discard-recovery-live-cell.test.ts`.
`:1-2`:
```
// H8a live witness — bug 0133 : `parseSchemaObjectBody`'s three
// recovery arms now RETAIN a captured field-list prefix and anchor one
```
`:85-86` (the control) and `:90-91` (the cell):
```
/** The precondition control: a well-formed prompt theta in the same workspace. */
const CONTROL = ["---", "mode: prompt", "---", '"CONTROL OK"', ""].join("\n");
describe("bug 0133 live : a captured schema-field prefix draws malformed-schema-field, not the declaration-subject empty-schema-body", () => {
  it("does not register `schema S { a: string, 42: integer }`, and the theta-system-note channel carries malformed-schema-field but NOT the declaration-subject empty-schema-body line ", async () => {
```
`:144-161` (the discriminating pair):
```
      const notes = collectSystemNotes(handle.sessionManager.getEntries());
      const expectedMalformedFragment = registryFragment(MALFORMED_FIELD_CODE, {});
      const staleDeclarationFragment = registryFragment(EMPTY_SCHEMA_BODY_CODE, { X: "S" });
      expect(
        notes.some((note) => note.includes(expectedMalformedFragment)),
        ...
      ).toBe(true);
      expect(
        notes.some((note) => note.includes(staleDeclarationFragment)),
        ...
      ).toBe(false);
```
This file lives under `tests/live/**`, so it exists but is not gate-proven. The record's "run for real" is a run it recorded at landing.

Searches (all run this session, over the representations this store uses):
- Bug-doc pointer: `rg -n "schema-field-discard-recovery-live-cell" docs/bugs/0133-field-list-discard-recovery-unsettled.md` → 1 hit (`:1159`), the hyphenated spelling. The record has no other pointer to its live cell.
- Exact path as written, tree-wide: `rg -n -F "schema-field-discard-recovery-live-cell-.test.ts" --glob '!quality/**' .` → 1 hit. That hit is the record itself.
- Filename: `git ls-files tests | grep "schema-field-discard-recovery-live-cell"` → 1 hit, `tests/live/schema-field-discard-recovery-live-cell.test.ts`.
- History of the stated path: `git log --all --oneline -- 'tests/live/schema-field-discard-recovery-live-cell-.test.ts'` → 0 commits.
- At the fix commit: `git show d5fba72f:docs/bugs/0133-field-list-discard-recovery-unsettled.md | grep -n "live-cell"` → `:1159` already has the hyphenated path. `git show --stat d5fba72f` → adds `…schema-field-discard-recovery-live-cell.test.ts | 238`.
- Test titles: `rg -n "bug 0133 live" tests` → 1 hit, the `describe` at `:90` of the unhyphenated file.
- Coverage matrices: `rg -n "schema-field-discard|0133" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md` → 0 hits.
- AGENTS.md gate names: `rg -n "schema-field-discard|0133" AGENTS.md` → 0 hits.
- CHANGELOG (corroboration only): `rg -n "schema-field-discard|0133" CHANGELOG.md` → 3 hits (`:2185`, `:3213`, `:3223`). None names the live file. `:3223-3224` says only "+ an H8a live cell."

## Why this is a problem
The record names its live-tier evidence by a path that does not exist and never has. Someone following the pointer from the *What shipped* list gets no file, and nothing else in the record connects the claim to `tests/live/schema-field-discard-recovery-live-cell.test.ts`. The live claim is therefore unwitnessed as stated, even though an equivalent witness exists and asserts the observables the *Verification* bullet lists.

## Suggested direction (non-binding, optional)
Change the pointer at `:1159` to `tests/live/schema-field-discard-recovery-live-cell.test.ts`, the file commit `d5fba72f` added, whose `describe`/`it` at `:90-91` carry the claimed control, non-registration and note-pair observables.

## False-positive check
- Representations covered: the bug-doc pointer, the exact path tree-wide, test filenames (`git ls-files`), test titles (`describe`/`it` strings), both coverage-matrix pages, AGENTS.md gate names, and CHANGELOG (corroboration only). Each search is listed above with its hit count.
- Rename or deletion ruled out: `git log --all` on the hyphenated path returns 0 commits, so this is not a later rename. The spelling has been wrong since the fix commit.
- Other witness paths in the record resolve: I checked every `tests/…` path in 0133 for existence, and this is the only one missing.
- Separate from finding 01 (bug 0131): the two pointers are the same misspelling shape, but each was introduced by its own fix commit (`0759f529` vs `d5fba72f`) in its own record.
- No gate covers this: `docs/bugs/**` is outside `tests/citation-symbol-form-gate.test.ts` (`docs/bugs/0134-…md:379-380`).
- Not already filed: none of the pending qw20260928081617 D10 candidates cites 0133.

## Triage
verdict: confirmed — the pointer is dead but the witness exists. docs/bugs/0133:1159 names `tests/live/schema-field-discard-recovery-live-cell-.test.ts`. That path has 1 tree-wide hit (the record itself) and 0 commits in `git log --all`, and it has been spelled that way since fix commit d5fba72f, which added `tests/live/schema-field-discard-recovery-live-cell.test.ts` (238 lines). Every stated search reproduces: coverage matrices 0, AGENTS.md 0, CHANGELOG 3 hits with none naming the file, and `bug 0133 live` gives 1 describe. No intake or PTQ tracks this pointer. The b0092 filing only mentions 0133 as out of its shard. Witness to name: tests/live/schema-field-discard-recovery-live-cell.test.ts, describe "bug 0133 live : a captured schema-field prefix draws malformed-schema-field, not the declaration-subject empty-schema-body" › it "does not register `schema S { a: string, 42: integer }`, and the theta-system-note channel carries malformed-schema-field but NOT the declaration-subject empty-schema-body line " (:90-91). It asserts that control b0133livecellfctl registers (:116-121), that b0133livecellf does not register (:128-136), and the note pair via collectSystemNotes + registryFragment: MALFORMED_FIELD_CODE present, EMPTY_SCHEMA_BODY_CODE {X:"S"} absent (:144-161). Fix: re-point :1159 to that file (triage: claude-opus-5-5)
