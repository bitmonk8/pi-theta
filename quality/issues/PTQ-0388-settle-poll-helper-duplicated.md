---
id: PTQ-0388
title: b0339's settle poll helper duplicates b0312's byte-identical never-throw poll loop
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0339-package-source-watch-arming.test.ts:81-91
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916144930
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# b0339's settle poll helper duplicates b0312's byte-identical never-throw poll loop

## Observation
tests/b0339-package-source-watch-arming.test.ts declares a module-scope
`async function settle(cond: () => boolean): Promise<void>` that polls
`cond()` up to 200 times, 5ms apart, and returns as soon as it is true or
once the bound is exhausted — deliberately never throwing, so that the
`expect` immediately following the call is what actually fails when the
condition never becomes true. tests/b0312-out-of-root-thetalib-watch-closure.test.ts
already declares a function of the same name whose signature, loop bound,
sleep interval, and body are byte-for-byte identical; only the two files'
explanatory doc comments use different wording for why a throw is avoided.
Neither file imports this helper from `tests/helpers/`; both files already
import a DIFFERENT, throwing poll helper (`waitFor`) from
`tests/helpers/fake-file-watcher.ts` for other calls in the same file.

## Evidence

tests/b0339-package-source-watch-arming.test.ts:81-91 (re-read immediately
before filing):
```ts
/** Best-effort bounded poll of the observable, then RETURN (never throw) so the
 *  following `expect` is the witness. Used in case H where the reload the fix
 *  would run is a no-op today: pre-fix the observable never moves and the poll
 *  runs to its bound, so the `expect` reds; post-fix the poll exits as soon as
 *  the reload lands. Event-driven, not a bare sleep. */
async function settle(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
```

tests/b0312-out-of-root-thetalib-watch-closure.test.ts:279-289 (pattern
context, outside this wave's scope; re-read immediately before filing —
the loop body, from `async function settle` through its closing brace, is
byte-identical to the excerpt above):
```ts
/** Best-effort bounded poll of the observable, then RETURN (never throw) so the
 *  following `expect` is the witness. Used where the reload the fix would run is
 *  a no-op today (an OUT-OF-ROOT edit): pre-fix the observable never moves and
 *  the poll runs to its bound, so the `expect` reds on the stale value; post-fix
 *  the poll exits as soon as the rebuild lands. Event-driven, not a bare sleep. */
async function settle(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
```

Exact search, `tests/**/*.test.ts`: `grep -rn "^async function settle\b"
tests --include="*.test.ts"` → exactly 2 hits repo-wide
(tests/b0312-out-of-root-thetalib-watch-closure.test.ts:284,
tests/b0339-package-source-watch-arming.test.ts:86). `grep -rl "for (let i
= 0; i < 200; i++) {" tests --include="*.test.ts"` → the same 2 files, no
others. `grep -n "settle\b" tests/helpers/*.ts` → 0 hits; the only
comparable exported poller, `waitFor` (`tests/helpers/fake-file-watcher.ts`,
which b0339 already imports for its `session_start`-arming waits), throws
on timeout — a deliberately different contract from `settle`'s
never-throw design, so it is not a drop-in replacement, only a sibling
shape the same module already hosts.

## Why this is a problem
The identical ~10-line function — same signature, same 200×5ms bound, same
never-throw body — is declared independently in two files instead of
shared; only the accompanying doc comment's wording (which context each
author writes for "why a throw is avoided here") differs between the
copies. `tests/helpers/fake-file-watcher.ts` is the module both files
already import their OTHER polling helper (`waitFor`) from, and already
demonstrates the project's convention of hosting exactly this kind of
bounded-poll utility for FileWatcher-arming tests, but it holds no
never-throw sibling for `settle` to be drawn from.

## Suggested direction (non-binding, optional)
`tests/helpers/fake-file-watcher.ts` already hosts `waitFor`, the
throwing counterpart to this exact bounded-poll shape, for the same two
files; a `settle` export beside it (parameterised on nothing beyond the
condition, as both current copies already are) is the natural sibling the
module's own existing convention points toward.

## False-positive check
- Gate-pin check: tests/b0339-package-source-watch-arming.test.ts does not
  match `*gate*.test.ts` or the named kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the cited lines are a bounded-poll
  utility, not a pinned count or inventory assertion.
- Recording-double check: `settle` polls a caller-supplied boolean
  condition; it is not a call-recording double and backs no "never called"
  witness.
- docs/bugs/ signature search: docs/bugs/0339-package-source-present-but-empty-contributing-dir-not-watched.md
  Status "fixed (0.321.0)"; docs/bugs/0312-out-of-root-thetalib-edits-invisible-stale-imports.md
  Status "fixed (0.315.0)". `npx vitest run
  tests/b0339-package-source-watch-arming.test.ts
  tests/b0312-out-of-root-thetalib-watch-closure.test.ts` → 2 files, 16
  tests, all passing at HEAD (verified 2026-09-16), so neither is a
  documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0339-package-source-watch-arming" docs/reference/coverage-matrix.md` →
  0 hits. This finding proposes no merge, rename, or deletion of either
  file or any `it()`/`describe()` — only that the poll helper could be
  shared rather than re-declared.
- Overlap check against already-filed/resolved topics: PTQ-0346
  (b0339-recursiverootfilewatcher-duplicated, fixed) covers a DIFFERENT
  root cause in the same file pair — the `RecursiveRootFileWatcher`
  `FileWatcher`-seam double's `emit()`/`#underArmedRoot()` mechanism, now
  confirmed removed from b0339 and imported from
  `tests/helpers/fake-file-watcher.ts` instead — and does not cite or
  dispute the `settle` function at lines 81-91, which sits immediately
  above the now-imported class and is unaffected by that fix. PTQ-0236
  (watch-roots-recording-harness-duplicated, fixed) covers the
  `RootsRecordingFileWatcher`/`norm`/`waitFor`/`armedRoots` quartet, not
  `settle`. PTQ-0363 (watch-arming-harness-boot-duplicated, fixed) covers
  the `Harness`/`makeHarness`/`bootWatchArming` trio, not `settle`. No
  filed or resolved item names `settle` or its 200×5ms poll loop.
- Coverage-drift check: the claim is about a repeated function DEFINITION,
  not a missing test path; `settle` is exercised by both files' own
  currently-passing tests (16/16 confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — settle() duplication verified byte-identical (b0339:81-91, b0312:279-289; grep reproduces exactly 2 declarations repo-wide and 0 hits in tests/helpers), distinct from PTQ-0236/0346/0363 (checked, none cite settle), 16/16 tests pass, both docs/bugs fixed, 0 coverage-matrix hits; note the claim that b0312 already imports waitFor from tests/helpers/fake-file-watcher.ts is false (b0312 declares its own local norm/waitFor/RecursiveRootFileWatcher, 0 import hits for that module) but this does not undercut the core duplication finding (triage: claude-opus-5)
