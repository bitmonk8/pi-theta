---
id: PTQ-1571
title: Bug 0131's fix record names its H8a live witness as tests/live/fn-call-arity-live-cell-.test.ts, a path that has never existed in the tree
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0131-in-document-fn-call-arity-unchecked.md:1279-1285
  - docs/bugs/0131-in-document-fn-call-arity-unchecked.md:1294-1299
  - tests/live/fn-call-arity-live-cell.test.ts:1-15
  - tests/live/fn-call-arity-live-cell.test.ts:120-121
  - tests/live/fn-call-arity-live-cell.test.ts:172-215
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0131's fix record names its H8a live witness as tests/live/fn-call-arity-live-cell-.test.ts, a path that has never existed in the tree

## Observation
`docs/bugs/0131-in-document-fn-call-arity-unchecked.md` §Fix (0.199.0) *Gates* claims a live H8a witness is "green with its red path proven". It names that witness `tests/live/fn-call-arity-live-cell-.test.ts`, with a hyphen before `.test.ts`. That is the record's only pointer to its live cell. No file at that path exists in the tree, and `git log --all` shows no commit that ever touched that path. The fix commit `0759f529` added `tests/live/fn-call-arity-live-cell.test.ts` (no trailing hyphen), and the record already carried the hyphenated spelling in that same commit. So the pointer has never resolved. The file that does exist asserts what the record's *Verification* bullet describes.

## Evidence
Claim side, `docs/bugs/0131-in-document-fn-call-arity-unchecked.md:1279-1285` (re-read before filing):
```
- **Gates:** witness `tests/fn-call-arity-unchecked.test.ts` 29/29 green (16 of
  29 red before the fix, red again under neutralisation and green after
  byte-exact restoration); full default suite `388 files / 8037 tests passed`;
  `npm run typecheck` clean; `npm run lint` clean; live H8a
  `tests/live/fn-call-arity-live-cell-.test.ts` green with its red path
  proven, beside all four sibling live cells green in the same run; real H9a
  `tests/live/acceptance/noninteractive-acceptance.test.ts` 10/10 green.
```
`:1294-1299` (the claim the live cell carries):
```
- **Verification:** SOLID. The witness reds under neutralisation on the 16 arity
  cells with the "arity check absent" signature and greens after restoration
  (`git hash-object` proof both ways); the default suite is green at the
  premeasured 388/8037; the live cell witnesses both directions over a real
  drive with its refusal read off the settled `SessionManager`'s
  `theta-system-note` channel and its message sourced from the registry; lint
```

Evidence side: the equivalent witness `tests/live/fn-call-arity-live-cell.test.ts`.
`:1-2`:
```
// H8a live witness — bug 0131: a `<name>(args)` call whose callee resolves to a
// top-level `fn` in the same file is now subject to an argument-COUNT check at
```
`:120-121`:
```
describe("bug 0131 live: a same-file `fn` call with too many arguments does not register, while the correct-arity control drives", () => {
  it("registers the correct-arity control and drives it to the live sentinel, while the mis-arity call does not register and carries its refusal on the theta-system-note channel", async () => {
```
`:180-192` (the refusal is read off the settled `SessionManager`, and the message fragment comes from the registry):
```
      const notes = collectSystemNotes(handle.sessionManager.getEntries());
      const refusalFragment = registryFragment(TOO_MANY_CODE, {
        name: "f",
        required: "1",
        provided: "3",
      });
      expect(
        notes.some((note) => note.includes(refusalFragment)),
        ...
      ).toBe(true);
```
`:197-208` checks that the control registers and drives to `ADMITTED_SENTINEL`. This file lives under `tests/live/**`, so it exists but is not gate-proven. The record's "green" is a run it recorded at landing.

Searches (all run this session, over the representations this store uses):
- Bug-doc pointer: `rg -n "fn-call-arity-live-cell" docs/bugs/0131-in-document-fn-call-arity-unchecked.md` → 1 hit (`:1283`), the hyphenated spelling. The record has no other pointer to its live cell.
- Exact path as written, tree-wide: `rg -n -F "fn-call-arity-live-cell-.test.ts" --glob '!quality/**' .` → 1 hit. That hit is the record itself.
- Filename: `git ls-files tests | grep "fn-call-arity-live-cell"` → 1 hit, `tests/live/fn-call-arity-live-cell.test.ts`.
- History of the stated path: `git log --all --oneline -- 'tests/live/fn-call-arity-live-cell-.test.ts'` → 0 commits.
- At the fix commit: `git show 0759f529:docs/bugs/0131-in-document-fn-call-arity-unchecked.md | grep -n "live-cell"` → `:1283` already has the hyphenated path. `git show --stat 0759f529` → adds `tests/live/fn-call-arity-live-cell.test.ts | 287`.
- Test titles: `rg -n "bug 0131 live" tests` → 1 hit, the `describe` at `tests/live/fn-call-arity-live-cell.test.ts:120`.
- Coverage matrices: `rg -n "fn-call-arity|0131" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md` → 0 hits.
- AGENTS.md gate names: `rg -n "fn-call-arity|0131" AGENTS.md` → 0 hits.
- CHANGELOG (corroboration only): `rg -n "fn-call-arity-live-cell" CHANGELOG.md` → 0 hits. The 0.199.0 entry (`CHANGELOG.md:3284-3285`) says only "a standalone live registration cell", with no path.

## Why this is a problem
The live-tier claim ("green with its red path proven") cites evidence by a path that does not exist and never has. Someone following the record's pointer gets no file, and nothing else in the record connects the claim to `tests/live/fn-call-arity-live-cell.test.ts`. The claim is therefore unwitnessed as stated, even though an equivalent witness exists and its assertions match the *Verification* sentence.

## Suggested direction (non-binding, optional)
Change the pointer at `:1283` to `tests/live/fn-call-arity-live-cell.test.ts`, the file commit `0759f529` added, whose `describe`/`it` at `:120-121` carry the claimed two-direction observable.

## False-positive check
- Representations covered: the bug-doc pointer, the exact path tree-wide, test filenames (`git ls-files`), test titles (`describe`/`it` strings), both coverage-matrix pages, AGENTS.md gate names, and CHANGELOG (corroboration only). Each search is listed above with its hit count.
- Rename or deletion ruled out: `git log --all` on the hyphenated path returns 0 commits, so this is not a decayed pointer from a later rename. The spelling has been wrong since the fix commit.
- Other witness paths in the record resolve: I checked every `tests/…` path in 0131 for existence, and this is the only one missing.
- No gate covers this: `tests/citation-symbol-form-gate.test.ts` excludes `docs/bugs/**` (`docs/bugs/0134-…md:379-380`: "`docs/bugs/**` is outside the gate in both directions").
- Not already filed: the pending qw20260928081617 D10 candidates cover bugs 0042, 0052, 0055, 0056, 0065, 0070, 0073–0075, 0078, 0081/0083/0084, 0092, 0093 and 0096. None cites 0131.

## Triage
verdict: confirmed — the pointer is dead but the witness exists. docs/bugs/0131:1283 names `tests/live/fn-call-arity-live-cell-.test.ts`. Tree-wide that path has 1 hit (the record itself), `git log --all` shows 0 commits for it, and it has been hyphenated since fix commit 0759f529, which added `tests/live/fn-call-arity-live-cell.test.ts` (287 lines) and whose own commit message names the unhyphenated path. It is the only missing tests/ path in the record. All stated searches reproduce (coverage matrices, AGENTS.md and CHANGELOG: 0 hits). No intake or PTQ tracks this pointer: the b0133/0240/b0092 filings are other records, and the 0356 filing is a different claim. The witness is tests/live/fn-call-arity-live-cell.test.ts, describe "bug 0131 live: a same-file `fn` call with too many arguments does not register, while the correct-arity control drives" › it "registers the correct-arity control and drives it to the live sentinel, while the mis-arity call does not register and carries its refusal on the theta-system-note channel" (:120-121). It reads the refusal off the settled SessionManager via collectSystemNotes plus registryFragment(TOO_MANY_CODE) (:180-192) and drives the control to ADMITTED_SENTINEL (:197-214). Fix: re-point :1283 to that file (triage: claude-opus-5-5)
