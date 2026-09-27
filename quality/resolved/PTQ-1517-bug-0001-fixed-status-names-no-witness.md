---
id: PTQ-1517
title: Bug record 0001's fixed Status claims prompt-mode extension-tool reach "along both paths" but names no witness, and neither of its two cited corroborations (the CHANGELOG [0.11.0] entry, the PIC-64 coverage-matrix row) names one either
lens: D10
status: fixed
verdict: confirmed
locations:
  - docs/bugs/0001-extension-tools-unreachable.md:3-7
  - CHANGELOG.md:9115-9199
  - docs/plan_topics/coverage-matrix.md:86
  - tests/prompt-mode-extension-tool-reach-e2e.test.ts:101
  - tests/conversation-drive.test.ts:227
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260927213122
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-27
---

# Bug record 0001's fixed Status claims prompt-mode extension-tool reach "along both paths" but names no witness, and neither of its two cited corroborations (the CHANGELOG [0.11.0] entry, the PIC-64 coverage-matrix row) names one either

## Observation
`docs/bugs/0001-extension-tools-unreachable.md` has Status `fixed — shipped in 0.11.0` and claims that admission plus host-loop dispatch "deliver prompt-mode reach along both paths". The record has no `## Fix` section and names no test (0 `tests/` hits in the file). For support it defers to the CHANGELOG `[0.11.0]` entry and PIC-64. The CHANGELOG entry names no test or fixture. The PIC-64 coverage-matrix row names only RFC 0006. Every other fixed record in 0002-0017 carries a `## Fix (x.y.z)` section that names its test file(s). Default-suite witnesses for both paths do exist in the tree; the record just doesn't point at them.

## Evidence
**Claim side:** docs/bugs/0001-extension-tools-unreachable.md:3-7
```
- **Status:** fixed — shipped in 0.11.0. Mode-independent `tools:` admission plus
  parent-side host-loop dispatch deliver prompt-mode reach along both paths; see
  the `[0.11.0]` CHANGELOG entry and
  [PIC-64](../spec_topics/pi-integration-contract/subagent.md#pic-64). Subagent
  mode reached extension tools natively and was out of scope.
```

**Searches run in this session**, one per representation:
1. Witness pointers in the record itself:
   - `rg -c 'tests/' docs/bugs/0001-extension-tools-unreachable.md`: no match (0).
   - `rg -c -i '^## Fix|witness|pinned by|fixture' docs/bugs/0001-extension-tools-unreachable.md`: no match (0).
2. House format in sibling records: `rg -c '^## Fix' <file>` over each of docs/bugs/0002…0017. It returned ≥1 for every fixed record: 0002-subagent-child-hangs, and 0003 through 0017. The one 0 is 0002-investigation.md, which is not a fix record ("investigation complete … No fix implemented").
3. CHANGELOG, as the record's cited corroboration: `sed -n '9115,9199p' CHANGELOG.md | rg -c -i 'tests/|fixture'` gives 0. Lines 9115-9199 are the `## [0.11.0]` entry, bounded by `## [0.10.0]` at :9200.
4. Coverage-matrix rows:
   - `rg -c -i 'bug 0001|bug-0001' docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md`: 0.
   - `rg -n "PIC-64" …`: one row, docs/plan_topics/coverage-matrix.md:86 `| PIC-64 | RFC 0006 (child-process theta execution — mode-independent host-loop dispatch ladder; successor to the retired PIC-61) |`, which names no test.
5. AGENTS.md gate names: `rg -c -i 'bug 0001|0001|PIC-64' AGENTS.md` gives 0.
6. Test files and titles: `rg -l -i 'bug[- ]?0001\b' tests` returned 12 files. The witnesses for the two claimed paths are:
   - tests/prompt-mode-extension-tool-reach-e2e.test.ts:101 `describe("bug 0001 e2e — prompt-mode code-side extension-tool reach through the production compose helper", …)`. Its cells include :115 "dispatching the theta drives the extension tool through the PARENT's host loop with the code-supplied arguments VERBATIM, then restores the model and active set". This is the code-side path.
   - tests/conversation-drive.test.ts:227 `describe("PIC-17 — prompt-mode extension tool in the query-window active set (bug 0001)", …)`. This is the model-facing path.
   - Also tests/prompt-mode-extension-tool-dispatch.test.ts (PIC-64 rungs 2/3), tests/extension-tool-unreachable-load-refusal-e2e.test.ts (fail-closed load refusal) and tests/capability-probe.test.ts:468 (the Step 0 `pi.getAllTools` probe).

## Why this is a problem
The brief defines unwitnessed-claim as including "a fixed-Status record naming no witness where the house format carries one". The 0002-0017 fix records all name their pinning test files in a `## Fix` section. 0001 names none. Both places it defers to (the CHANGELOG entry and the PIC-64 row) also name none. So the chain from the "fixed … along both paths" claim to recorded evidence stops at prose. Search 6 shows the default-suite witnesses exist, so the gap is in the record's pointer, not in coverage.

## Suggested direction (non-binding, optional)
Give the record a witness pointer naming the existing default-suite cells for each path: `tests/prompt-mode-extension-tool-reach-e2e.test.ts` for code-side, `tests/conversation-drive.test.ts` "PIC-17 — prompt-mode extension tool …" for model-facing, and optionally the load-refusal and capability-probe cells for the fail-closed guard.

## False-positive check
- **Representations covered:**
  - The record's own witness lines (searches 1).
  - Sibling-record house format (search 2).
  - CHANGELOG entry, as corroboration only (search 3).
  - Coverage-matrix rows, both matrix files (search 4).
  - AGENTS.md gate names (search 5).
  - Test file names and describe()/it() titles (search 6).
- **Not a coverage finding:** witnesses exist (search 6). This is filed only because the record names none, not because a test is missing.
- **Honesty marker:** 0001 carries no pending-verification or open marker.
- **Already-filed topics:** no listed PTQ/intake file covers bug 0001's record.
- **Gate check:** citation-form gates check the grammar of existing citations. A missing witness pointer is outside their reach.

## Triage
verdict: confirmed — reproduced every stated search: 0001 has 0 `tests/` hits and 0 `^## Fix|witness|pinned by|fixture` hits, and its Solution / Fail-closed guard sections name only src/ modules; every fixed record 0002-subagent…0017 carries `## Fix`; CHANGELOG [0.11.0] (:9115-9199) has 0 test/fixture/e2e hits; the coverage matrices have 0 `bug 0001` hits and PIC-64 row :86 names only RFC 0006; AGENTS.md has 0 hits; 12 test files match `bug[- ]?0001`. My own searches: the PIC-64 spec clause the record actually links to (subagent.md:187ff) also names no test, which is the one the filing mislabels as the matrix row. The witnesses exist at prompt-mode-extension-tool-reach-e2e.test.ts:101 (code-side) and conversation-drive.test.ts:227 (model-facing), and 0001 has no honesty marker, so the fix is a mechanical witness pointer (triage: claude-opus-5-5)
