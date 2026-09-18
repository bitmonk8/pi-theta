---
id: PTQ-0897
title: b0312 still declares its own norm()/settle() instead of importing the canonical fake-file-watcher.ts exports its sibling files already use
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0312-out-of-root-thetalib-watch-closure.test.ts:84-87
  - tests/b0312-out-of-root-thetalib-watch-closure.test.ts:184-193
  - tests/helpers/fake-file-watcher.ts:101-104
  - tests/helpers/fake-file-watcher.ts:116-122
  - tests/b0339-package-source-watch-arming.test.ts:8-14
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0312 still declares its own norm()/settle() instead of importing the canonical fake-file-watcher.ts exports its sibling files already use

## Observation
tests/b0312-out-of-root-thetalib-watch-closure.test.ts declares two
module-scope functions — `function norm(path: string): string` and `async
function settle(cond: () => boolean): Promise<void>` — whose bodies are
byte-identical to `export function norm` and `export async function settle`
already present in tests/helpers/fake-file-watcher.ts. The file already
imports `waitFor` from that exact module two lines above its own `settle`
declaration, so the module is already open in this file's import list.
tests/b0339-package-source-watch-arming.test.ts, a sibling in the same
watch-arming test family, imports both `norm` and `settle` from
tests/helpers/fake-file-watcher.ts rather than declaring local copies.

## Evidence

tests/b0312-out-of-root-thetalib-watch-closure.test.ts:84-87 (re-read
immediately before filing):
```ts

/** Normalise a path for the cross-platform containment check (this repo runs on Windows). */
function norm(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}
```

tests/helpers/fake-file-watcher.ts:101-104 (the canonical export, re-read
immediately before filing):
```ts

/** Normalise a path for the cross-platform contain check (this repo runs on Windows). */
export function norm(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}
```

tests/b0312-out-of-root-thetalib-watch-closure.test.ts:184-193 (re-read
immediately before filing):
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

tests/helpers/fake-file-watcher.ts:116-122 (the canonical export, re-read
immediately before filing):
```ts
/** Best-effort bounded poll of a condition, then RETURN (never throw) once the
 *  bound is exhausted, so the caller's own immediately-following `expect` is
 *  the witness rather than a thrown timeout — unlike `waitFor` above. */
export async function settle(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
```

Both bodies are byte-identical between b0312's local declarations and the
helper module's exports (only the `norm` doc comment differs by one word,
"containment" vs "contain").

tests/b0339-package-source-watch-arming.test.ts:8-14 (the sibling file that
imports both instead of redeclaring them):
```ts
import {
  RecursiveRootFileWatcher,
  RootsRecordingFileWatcher,
  armedRoots,
  norm,
  settle,
} from "./helpers/fake-file-watcher";
```

b0312's own import of the same module, two lines above its local `settle`
declaration's usage site, tests/b0312-out-of-root-thetalib-watch-closure.test.ts:27:
```ts
import { waitFor } from "./helpers/fake-file-watcher";
```

Exact searches, run repo-wide over `tests/**/*.test.ts`:
- `grep -rn "^function norm(path: string): string {"` → 2 remaining
  module-local declarations: tests/b0312-out-of-root-thetalib-watch-closure.test.ts:86
  (in scope) and tests/b0378-watch-root-case-variant-double-arming.test.ts:82
  (out of this wave's scope).
- `grep -rn "^async function settle\b"` → 1 remaining module-local
  declaration repo-wide: tests/b0312-out-of-root-thetalib-watch-closure.test.ts:189.

Both `norm` and `settle` are read (not write-only) in b0312: `norm` at lines
176, 178, 351, 414 (×2), 432 (×2); `settle` at lines 368, 516, 547, 597.

## Why this is a problem
tests/helpers/fake-file-watcher.ts exports both `norm` and `settle`
specifically as the shared home for this `FileWatcher`-arming test family
(the module's own doc comments frame `settle` as the "unlike `waitFor` above"
sibling, and `norm` as the "cross-platform contain[ment] check" every file in
the family needs). tests/b0339-package-source-watch-arming.test.ts — a
sibling in the same bug family that itself imports `RecursiveRootFileWatcher`
from this module — imports both `norm` and `settle` from it rather than
declaring local copies. tests/b0312-out-of-root-thetalib-watch-closure.test.ts
already opens this module (`import { waitFor } from
"./helpers/fake-file-watcher"`) but declares its own byte-identical `norm`
and `settle` immediately below that import instead of adding them to it.

## Suggested direction (non-binding, optional)
Add `norm, settle` to b0312's existing `import { waitFor } from
"./helpers/fake-file-watcher"` line and remove the two local declarations —
the same import shape tests/b0339-package-source-watch-arming.test.ts already
uses for the identical pair.

## False-positive check
- Gate-pin check: tests/b0312-out-of-root-thetalib-watch-closure.test.ts does
  not match `*gate*.test.ts` or the named kin; the cited lines are a
  path-normaliser and a bounded-poll utility, not a pinned count or
  inventory assertion.
- Recording-double check: neither `norm` nor `settle` is a call-recording
  double or backs a "never called" witness; `norm` is a pure string
  transform and `settle` polls a caller-supplied boolean condition.
- docs/bugs/ signature search: docs/bugs/0312-out-of-root-thetalib-edits-invisible-stale-imports.md
  status is "fixed (0.315.0)" — not a documented correct-reason red; nothing
  in that doc pins either function by name.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0312-out-of-root-thetalib-watch-closure" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file
  or any `it()`/`describe()` — only that two existing local helper functions
  could be replaced by imports from a module the file already opens.
- Overlap check against already-filed/resolved topics: PTQ-0388 (fixed,
  "b0339's settle poll helper duplicates b0312's") named b0312's `settle` as
  the origin of the duplicate and its fix minted the `settle` export and
  migrated b0339 to import it, but left b0312 itself unmigrated (its own
  triage note: "the claim that b0312 already imports waitFor... is false...
  this does not undercut the core duplication finding"). PTQ-0236 (fixed,
  "b0310 and b0339 redefine an identical roots-recording FileWatcher
  harness") explicitly found b0312's `norm` in its pattern-wide grep but
  scoped its own filing to the b0310/b0339 pair only, noting b0312 "not
  cited as a primary location here since [it does] not also carry the
  roots-recording class or armedRoots" — leaving b0312's `norm` redeclaration
  unfiled. PTQ-0530 (b0311-b0312-note-recording-harness-duplicated) covers a
  different root cause in the same file (the note-recording/composeInstance
  boot boilerplate), not `norm`/`settle`. No filed or resolved item in the
  provided do-not-refile list names b0312's `norm` or `settle` as its own
  subject post-PTQ-0236/PTQ-0388.
- Coverage-drift check: the claim is about two helper functions already
  exported from a module this exact file already imports from, redeclared
  locally instead of imported — not a missing test path.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five excerpts reproduce at the cited lines (b0312 :85-87 `norm`, :189-194 `settle`; helper :102-104 / :119-124; b0339 :8-14 imports both) and sed-extracted body diffs after stripping `export` are empty for both functions; both local copies are live (`norm` read at :176/:178/:351/:414/:432, `settle` awaited at :368/:516/:547/:597), b0312 imports only `waitFor` from ./helpers/fake-file-watcher (:27, true today via the PTQ-0530 fix even though PTQ-0388's older triage note said otherwise), the stated greps reproduce exactly (`^function norm(` → b0312:85 + b0378:82; `^async function settle\b` → b0312:189 only), coverage-matrix → 0 hits, not a gate file, neither function is a recording double; all locations under tests/, D7 copy-paste-double class; not a duplicate — PTQ-0388 (fixed) covered only b0339's `settle` copy and minted the export, PTQ-0236 (fixed) scoped itself to b0310/b0339, PTQ-0346 is the RecursiveRootFileWatcher class, PTQ-0530's triage explicitly excluded b0312's `settle`, and PTQ-0491/0514 mention b0312 only incidentally; the fix is the mechanical import-and-delete the filing names (b0378's `norm` copy is a separate out-of-wave residual to fold in at fix time) (triage: claude-fable-5-1)
