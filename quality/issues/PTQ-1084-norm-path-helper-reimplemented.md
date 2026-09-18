---
id: PTQ-1084
title: b0378's local `norm` path-normalisation helper is a byte-identical retype of the exported helper from tests/helpers/fake-file-watcher.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0378-watch-root-case-variant-double-arming.test.ts:84-86
  - tests/helpers/fake-file-watcher.ts:102-104
sites: 2
fix_scope: localized
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0378's local `norm` path-normalisation helper is a byte-identical retype of the exported helper from tests/helpers/fake-file-watcher.ts

## Observation
`tests/helpers/fake-file-watcher.ts` exports `norm(path: string): string`, which lower-cases a path and forward-slashes its separators, with a doc comment stating it is "for the cross-platform contain check (this repo runs on Windows)". `tests/b0378-watch-root-case-variant-double-arming.test.ts` declares a module-local `norm` function with a byte-identical body, used for the same case-insensitive path-comparison purpose the file's own header comment names ("this repo runs on a case-insensitive Windows host — the regime the bug turns on"). The file already imports `waitFor` from the same helper module (`./helpers/fake-file-watcher`) but does not import `norm`.

## Evidence
tests/helpers/fake-file-watcher.ts:102-104 (the exported helper):
```ts
/** Normalise a path for the cross-platform contain check (this repo runs on Windows). */
export function norm(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}
```

tests/b0378-watch-root-case-variant-double-arming.test.ts:84-86 (the local retype, byte-identical function body):
```ts
function norm(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}
```

tests/b0378-watch-root-case-variant-double-arming.test.ts:21 (the file's own import of the same module, `norm` omitted):
```ts
import { waitFor } from "./helpers/fake-file-watcher";
```

Exact search: `grep -rn "^function norm(\|^export function norm(" tests --include="*.test.ts" tests/helpers/*.ts` returns exactly two declarations — the export in `tests/helpers/fake-file-watcher.ts:102` and the local copy in `tests/b0378-watch-root-case-variant-double-arming.test.ts:84`.

## Why this is a problem
The path-normalisation helper the bug's own subject depends on (case-insensitive comparison on a case-insensitive filesystem regime) is typed a second time in a file that already imports a sibling export from the exact module carrying the canonical version, rather than adding `norm` to that same import line. The two bodies are byte-identical, so this is not a divergent variant with a different contract — it is the same code written twice.

## Suggested direction (non-binding, optional)
`tests/helpers/fake-file-watcher.ts` is the module that already exports this exact function and is already imported by this file for `waitFor`; adding `norm` to that same import is the natural next step, observed from the import line already present rather than designed here.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or a named gate kin; the cited code is a path-normalisation helper, not a pinned count or inventory assertion.
- Recording-double check: `norm` is a pure string transform, not a recording double backing a "never called" witness; the carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0378-watch-root-union-case-variant-double-arming.md` exists and is the open/fixed bug this file is the RED/GREEN witness for; this finding does not contest the file's redness or behaviour, only the duplicated helper function every cell's comparison logic depends on regardless of which way the bug resolves. No documented correct-reason red names this helper declaration.
- coverage-matrix/bug-doc citation search: `grep -n "b0378-watch-root-case-variant-double-arming" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()`, only that the local `norm` be imported rather than retyped.
- Prior-finding check: `grep -rl "\bnorm\b" quality/issues quality/resolved quality/intake | xargs grep -l "fake-file-watcher" 2>/dev/null` and a scan of PTQ-0236/PTQ-0346 (the `RootsRecordingFileWatcher`/`RecursiveRootFileWatcher` extraction fixes already recorded in `tests/helpers/fake-file-watcher.ts`'s own header comments) found no filing whose cited locations include this `norm` declaration; PTQ-0236 and PTQ-0346 are about the `FileWatcher` fake classes themselves, not this string-normalisation helper.
- Coverage check: the claim is about a repeated helper-function DEFINITION that exists today, not a missing test path.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at the cited lines (b0378 :84-86, helper :102-104) and a mktemp sed-extracted diff of the two bodies after stripping `export` is empty; the stated grep reproduces exactly (`^function norm(`/`^export function norm(` → only b0378:84 + helper:102, none under src/extensions/tools); the local copy is live (read at :167-168 in `#covers` and :330), b0378 imports only `waitFor` from ./helpers/fake-file-watcher (:21) while the two siblings its own header says it "mirrors" — b0310:6 and b0312:27 — already import the canonical `norm`; no carve-out binds (not a gate file, pure string transform not a recording double, coverage-matrix → 0 hits, docs/bugs/0378 is fixed 0.376.0 and its Residuals §1 names `norm()` only as a convention shared with b0310/b0312 — non-refuting); all locations under tests/, D7 copy-paste-double class; not a duplicate — PTQ-0236 scoped to b0310/b0339, PTQ-0964 covered `waitFor`, PTQ-1039 covered `makeHarness`/`structuralNotesSince`, and PTQ-0897 (resolved, locations b0312/b0339/helper only) merely deferred b0378's `norm` as "a separate out-of-wave residual to fold in at fix time" that its fix never folded (the :84-86 lines are untouched since fix commit 2fd6a6be), so no open row tracks this site; the fix is the mechanical add-to-existing-import-and-delete the filing names (triage: claude-fable-5-1)
