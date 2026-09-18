---
id: PTQ-0748
title: filesystemIsCaseInsensitive is exported from the canonical helper but two witness files still declare their own byte-near-identical copy
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/helpers/case-insensitive-host-probe.ts:59-74
  - tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:82-104
  - tests/b0379-tools-entry-byte-match.test.ts:173-199
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:22,344
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# filesystemIsCaseInsensitive is exported from the canonical helper but two witness files still declare their own byte-near-identical copy

## Observation
`tests/helpers/case-insensitive-host-probe.ts` exports `filesystemIsCaseInsensitive(dir)` — a synchronous write-lowercase/read-uppercase FS-case probe — specifically because PTQ-0387 (status: fixed) found the same function declared verbatim in three bug-witness files (b0329, b0363, b0379) with "No `tests/helpers/` module exports this probe shape." `tests/b0329-hash-mismatch-refuses-invocation.test.ts` was migrated: it now imports the helper (`case-insensitive-host-probe.ts`) and calls the exported function. `tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts` and `tests/b0379-tools-entry-byte-match.test.ts` were not migrated: each still declares its own module-scope `function filesystemIsCaseInsensitive(dir: string): boolean` with the identical write/read/ENOENT-or-rethrow/finally-remove body, differing only in the embedded probe-filename literal.

## Evidence
`tests/helpers/case-insensitive-host-probe.ts:59-74` (the canonical export PTQ-0387 landed):
```ts
export function filesystemIsCaseInsensitive(dir: string): boolean {
  const lower = join(dir, "b0329-case-probe-aa");
  writeFileSync(lower, "x", "utf8");
  try {
    readFileSync(join(dir, "b0329-case-probe-AA"), "utf8");
    return true;
  } catch (probeError: unknown) {
    const code = (probeError as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw probeError;
    }
    return false;
  } finally {
    rmSync(lower, { force: true });
  }
}
```

`tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:82-104` (no import of the helper anywhere in the file):
```ts
/**
 * Whether the scratch filesystem is case-insensitive: write a lowercase probe
 * file, attempt the uppercase read. A successful read ⇒ case-insensitive. Only
 * ENOENT is the case-sensitive signal; any other error is a real fault and
 * rethrows (no swallow — CLAUDE.md/AGENTS.md "let crash"). The probe file lives
 * in the per-test scratch root and is removed here.
 */
function filesystemIsCaseInsensitive(dir: string): boolean {
  const lower = join(dir, "b0363-case-probe-aa");
  writeFileSync(lower, "x", "utf8");
  try {
    readFileSync(join(dir, "b0363-case-probe-AA"), "utf8");
    return true;
  } catch (probeError: unknown) {
    const code = (probeError as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw probeError;
    }
    return false;
  } finally {
    rmSync(lower, { force: true });
  }
}
```

`tests/b0379-tools-entry-byte-match.test.ts:173-199` (the file's own header even names the duplication and does not resolve it by importing):
```ts
// --- FS case-sensitivity probe (helper copied VERBATIM from -------------------
// --- tests/b0329-hash-mismatch-refuses-invocation.test.ts cell D; only the ----
// --- probe filename's bug number is localised to b0379) ----------------------

/**
 * Whether the workspace filesystem is case-insensitive: write a lowercase file,
 * attempt the uppercase read. A successful read ⇒ case-insensitive. Only ENOENT
 * is the case-sensitive signal; any other error is a real fault and rethrows
 * (no swallow — CLAUDE.md/AGENTS.md "let crash"). The probe file lives in the
 * per-test tmp workspace and is removed with it.
 */
function filesystemIsCaseInsensitive(dir: string): boolean {
  const lower = join(dir, "b0379-case-probe-aa");
  writeFileSync(lower, "x", "utf8");
  try {
    readFileSync(join(dir, "b0379-case-probe-AA"), "utf8");
    return true;
  } catch (probeError: unknown) {
    const code = (probeError as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw probeError;
    }
    return false;
  } finally {
    rmSync(lower, { force: true });
  }
}
```

Migrated comparison, `tests/b0329-hash-mismatch-refuses-invocation.test.ts:22` and `:344`:
```ts
import { filesystemIsCaseInsensitive } from "./helpers/case-insensitive-host-probe";
...
    const caseInsensitive = filesystemIsCaseInsensitive(workspaceDir);
```

Exact search: `grep -rn "function filesystemIsCaseInsensitive" tests --include="*.test.ts"` → 2 hits (b0363:89, b0379:184); `grep -rln "case-insensitive-host-probe" tests/*.test.ts` → 1 hit (b0329 only).

## Why this is a problem
The canonical helper this file (`tests/helpers/case-insensitive-host-probe.ts`) provides was authored to hold exactly this function, and one of the three sites the originating finding named already imports it. The other two sites still carry their own copy of the same ~16-line function, one of which (b0379) documents its own provenance as a verbatim copy from b0329 in its header comment while still not importing the now-existing shared export. The natural home for both remaining call sites is the import `tests/b0329-hash-mismatch-refuses-invocation.test.ts:22` already demonstrates, as an observation of the file that already exists — not a design proposal.

## Suggested direction (non-binding, optional)
The two remaining local declarations are candidates to become imports of the already-exported `filesystemIsCaseInsensitive` from `tests/helpers/case-insensitive-host-probe.ts`, the same substitution b0329 already made.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the named kin; the cited lines are a helper function declaration, not a pinned count or inventory assertion.
- Recording-double check: `filesystemIsCaseInsensitive` is a probe returning a boolean, not a recording double asserting a MUST-NOT-call witness.
- docs/bugs/ signature search: bugs 0363 and 0379 are both closed witness files (per their own header comments, "settled §Fix … registers"); neither carries an open, correct-reason-red citation for this function.
- coverage-matrix/bug-doc citation search: `grep -rn "filesystemIsCaseInsensitive\|b0363-file-entry-stem\|b0379-tools-entry-byte-match" docs/reference/coverage-matrix.md` → no hits; the finding does not propose removing, renaming, or merging either test, only substituting an already-duplicated private helper for an existing shared export, so no test identity cited by name in that matrix is affected.
- Confirmed PTQ-0387 (status: fixed) is the originating finding for this exact trio and its own text states the fix landed the shared export; this filing's claim is narrower and different in kind — that two of the three call sites were left unmigrated after the helper landed — verified directly against current file contents above, not inferred from the resolved ticket's text.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: all four excerpts match byte-for-byte at the cited lines (helper :59-74, b0363 :82-104, b0379 :173-199 incl. its own "copied VERBATIM from b0329" header, b0329 :22/:344 import+call); `grep -rn "function filesystemIsCaseInsensitive"` → exactly b0363:89, b0379:184 plus the helper export, and neither file imports case-insensitive-host-probe (only b0329/b0361/b0362 do); PTQ-0387's fix commit f6832d60 touched only b0329 + the helper, so the two residual copies are genuinely un-migrated with no ratified exclusion; bugs 0363/0379 are fixed (0.355.0/0.368.0) with 9/9 tests green, 0 coverage-matrix hits, no gate/recording-double carve-out — in-scope D7 copy-paste helper, same shape as confirmed precedents PTQ-0301/PTQ-0240; intake sibling d7-04 targets a different root cause (tautological branch asserts) (triage: claude-fable-5-1)
