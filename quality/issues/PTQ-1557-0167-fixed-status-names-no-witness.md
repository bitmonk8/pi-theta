---
id: PTQ-1557
title: Bug record 0167's fixed Status and §Fix claim the conventional-root ENOENT exemption landed but name no witness, while every sibling record filed from the same change (0168-0171) carries a Witnesses paragraph
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0167-clean-leaf-walk-warns-on-absent-conventional-root.md:3-8
  - docs/bugs/0167-clean-leaf-walk-warns-on-absent-conventional-root.md:226-256
  - docs/bugs/0167-clean-leaf-walk-warns-on-absent-conventional-root.md:108-115
  - docs/bugs/0168-embedded-fs-path-selects-entry-script-rung.md:395-397
  - tests/host-config-dir.test.ts:458-475
  - tests/discovery-walk.test.ts:103
  - docs/plan_topics/coverage-matrix.md:42
  - CHANGELOG.md:5761-5766
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug record 0167's fixed Status and §Fix claim the conventional-root ENOENT exemption landed but name no witness, while every sibling record filed from the same change (0168-0171) carries a Witnesses paragraph

## Observation
`docs/bugs/0167-clean-leaf-walk-warns-on-absent-conventional-root.md` has Status `fixed (0.89.0)`. It claims that "the walk skips an `ENOENT` conventional root before classification", that a root which exists but cannot be read "still warns", and that the CLI/settings clean-leaf behaviour stays "bit-identical". Its `## Fix` section (:226-256) names only `src/discovery/discovery-walk.ts` and the spec bullet. It names no test file, cell, or red/green run. The record's only three `tests/` citations (:102, :107, :160) point at fixture comments recording the PRE-fix behaviour at `faac684`, and its §Observed at says "No execution witness was taken". The four records filed from the same PR (0168, 0169, 0170, 0171) each name their witness files in their Fix section. A default-suite witness for 0167's fixed behaviour does exist: `tests/host-config-dir.test.ts` describe "A4", added in the same landing commit `7f360d20`. The record does not point at it.

## Evidence
**Claim side:** docs/bugs/0167-clean-leaf-walk-warns-on-absent-conventional-root.md:3-8
```
- **Status:** fixed (0.89.0) — in the host-portability change that introduced
  the `FileSystem.configDirName()` / `globalAgentDir()` seam members (external
  PR #1 over HEAD `faac684`/v0.88.0, shipped as v0.89.0). Both halves landed in that change: the walk
  skips an `ENOENT` conventional root before classification, and the spec bullet
  gained the *Conventional-root exemption* clause that says so. The table rows
  are unchanged — they were the side the reconciliation kept.
```
docs/bugs/0167-…:226-236 (the start of §Fix; the remainder through :256 is the Spec paragraph and the "Why the table won" rationale, and cites no test):
```
## Fix

Landed with the host-portability change; both halves in the same pass.

**Implementation.** `discoverThetas` probes each conventional root with one
`lstat` *before* classification and `continue`s on `ENOENT`
(`src/discovery/discovery-walk.ts`, the conventional-root loop). Only `ENOENT` is
skipped: a root that exists but cannot be read (`EACCES` / `EPERM`) still reaches
`classifyPath`, still classifies as *unreadable*, and still warns, so `:67` is
untouched. `classifyPath`, `ancestorsClean` and the per-source `FailureModes`
tables are unchanged, which keeps the CLI and settings sources' clean-leaf
```
docs/bugs/0167-…:110-114:
```
- **Observed at:** v0.88.0 (`faac684`), by source trace and by quotation of the
  two conflicting spec sentences. No execution witness was taken: the pre-fix
  code path is superseded in the same change that closed this report, and the two
  committed fixture comments above already record the behaviour the trace
  describes.
```

**Searches run in this session, one per representation:**
1. Witness lines in the record itself:
   - `rg -c "tests/" docs/bugs/0167-clean-leaf-walk-warns-on-absent-conventional-root.md` gives 3 hits, at :102, :107 and :160. All three cite `tests/discovery-walk.test.ts:55–:58` / `tests/discovery-root-enumeration-failure.test.ts:249–:253` as documenting the PRE-fix behaviour. None is in §Fix.
   - `rg -n -i "witness|pinned by|red-proof|green" <same file>` gives 2 hits, :108 ("witnesses that the pre-fix walk needed the config directory…") and :111 ("No execution witness was taken"). Neither names a post-fix witness.
2. House format in the sibling records from the same change. `rg -c -i '\*\*Witness|Tests that lock it|Witness, green' <file>` gives: 0168 → 1, 0169 → 2, 0170 → 2, 0171 → 1 (and 0165 → 1, 0166 → 1). For example, 0168:395-397 reads `**Witnesses.** \`tests/subagent-child-launch.test.ts\`, the describe block *"rung 1 — embedded-filesystem paths are rejected …"*`.
3. Test file names: `git ls-files tests | rg -i "conventional|0167|clean-leaf"` gives 0.
4. Test content keyed on the bug number: `rg -l "0167" tests` gives 0 files, and `rg -l -i "bug[- _]?0167" tests` gives 0 files.
5. Test titles: `rg -n "(it|describe)\(.*(absent conventional|conventional discovery root|conventional root)" tests` gives 5 hits:
   - tests/discovery-walk.test.ts:103, :126, :143: pre-existing V10a DISC-2 cells. :103's fixture registers both roots' ancestor chains via `BASE`, so it does not exercise the absent-config-dir input.
   - tests/host-config-dir.test.ts:458 `describe("A4 — an absent conventional discovery root is silent (discovery-sources.md:47, :51-52)", …)`.
   - tests/host-config-dir.test.ts:460 `it(\`8. neither conventional root exists and the ${configDir} config dir itself is absent: zero diagnostics (no unreadable-source)\`, …)`, which asserts `expect(byCode(diagnostics, UNREADABLE_SOURCE)).toEqual([])` at :472. Its sibling cells :477 (9), :491 (10, EACCES still warns), :511 (11, EPERM still warns), :529 (12) and :549 (13, explicit `--theta` keeps the dirty-ancestor arm) match the record's remaining claims one by one.
   - `git show 7f360d20:tests/host-config-dir.test.ts | rg -n "A4 —|neither conventional root exists"` gives :508 and :510, so the A4 block landed in the same commit as the fix.
6. Coverage-matrix rows:
   - `rg -c -i "0167" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md` gives 0 (exit 1).
   - `rg -n "DISC-2" …` gives docs/plan_topics/coverage-matrix.md:42 `| DISC-1, DISC-2, DISC-3 | \`V10a\` |`, which names a work item and no test, plus the reference matrix :57 row, whose Status is `complete` and which names no test.
7. AGENTS.md gate names: `rg -c -i "0167|conventional-root|DISC-2" AGENTS.md` gives 0 (exit 1).
8. CHANGELOG, as corroboration only: `rg -n "0167" CHANGELOG.md` gives 1 hit, :5761. The entry at :5761-5766 restates the fix and names no test.

`tests/host-config-dir.test.ts` is inside the default suite: vitest.config.ts:6 includes `tests/**/*.test.ts`, and :12 excludes only `tests/live/**`. So that witness is gate-proven at this wave's head.

## Why this is a problem
The brief defines unwitnessed-claim to include "a fixed-Status record naming no witness where the house format carries one". The records filed alongside 0167 from the same PR (0168-0171, search 2) each name their witness files in §Fix. 0167's Status and §Fix make three separable behavioural claims: ENOENT skipped silently, EACCES/EPERM still warns, and explicit references unchanged. Nothing in the record ties those claims to recorded evidence. The only test citations point at pre-fix comments, and §Observed at disclaims an execution witness. The matrix row and the CHANGELOG entry it could lean on name no test either (searches 6 and 8). Search 5 shows the witness exists, so the gap is in the record's pointer, not in coverage. This is the same shape as PTQ-1517, which was confirmed for bug 0001.

## Suggested direction (non-binding, optional)
Give §Fix a Witnesses line naming the existing default-suite block, `tests/host-config-dir.test.ts` describe "A4 — an absent conventional discovery root is silent …". Its cells 8/9 cover the silent skip, 10/11 the still-warns arm, and 12/13 the unchanged explicit references.

## False-positive check
- **Representations covered:**
  - The record's own witness lines (search 1).
  - Sibling-record house format (search 2).
  - Test file names (search 3).
  - Bug-number keys in test content (search 4).
  - describe()/it() titles (search 5).
  - Both coverage matrices (search 6).
  - AGENTS.md gate names (search 7).
  - CHANGELOG, corroboration only (search 8).
- **Honesty marker:** "No execution witness was taken" (:111) is scoped to the PRE-fix observation ("the pre-fix code path is superseded"). It is not a marker on the fixed claim, which carries no pending-verification wording. So this filing does not target an honesty marker.
- **Not a decayed pointer:** the three `tests/` citations are dated to `faac684` ("cited at HEAD `faac684`", :20). Their drift is bug 0134's adjudicated do-not-file class for `docs/bugs/**`, and they are not filed here.
- **Not a coverage finding:** the witness exists (search 5, host-config-dir A4). The filing is about the record naming none.
- **Gate check:** citation-symbol-form-gate excludes `docs/bugs/**` (bug 0134 §Fix), and no gate checks for an absent witness pointer.
- **Already-filed topics:** no PTQ or intake file in the provided list cites bug 0167. `ls quality/intake | rg "0167"` gives no match.

## Triage
verdict: confirmed — all eight stated searches reproduce (the record's 3 `tests/` hits at :102/:107/:160 all point at pre-fix fixture comments; the only witness words are :108/:111; §Fix :226-256 names only src/discovery/discovery-walk.ts and the spec; siblings 0165/0166/0168/0171 each have 1 Witness line and 0169/0170 each have 2; there are 0 test filename or bug-number hits; both coverage matrices, AGENTS.md and CHANGELOG:5761-5766 name no test). My own searches of matrices, AGENTS.md and it()/describe() titles found no other pointer. The witnesses exist in the default suite (vitest.config.ts includes tests/**/*.test.ts and excludes only tests/live/**) and landed in the fix commit 7f360d20. The fixer should add a Witnesses line to 0167 §Fix naming tests/host-config-dir.test.ts, describe "A4 — an absent conventional discovery root is silent (discovery-sources.md:47, :51-52)", with these cells, each run for both .pi and .omp: "8. neither conventional root exists and the ${configDir} config dir itself is absent: zero diagnostics (no unreadable-source)" and "9. the ${configDir} config dir exists but its theta/ root does not: still zero diagnostics …" cover the ENOENT skip; "10. the ${configDir} project root EXISTS but rejects EACCES: the unreadable-source warning is still emitted …" and "11. the ${configDir} global root EXISTS but rejects EPERM: …" cover the still-warns claim; "12. an explicit `--theta` path is unaffected: a clean-leaf miss is still a missing-source ERROR …" and "13. DISC-2's clean-leaf distinction survives for explicit references: …" cover the unchanged CLI clean-leaf behaviour. This does not duplicate PTQ-1517, which is about bug 0001 (triage: claude-opus-5-5)
