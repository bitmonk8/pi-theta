---
id: PTQ-1665
title: Bug 0468 says a live run showed "ZERO theta/runtime/subagent-teardown-timeout … across ~146 live tests" and uses that to bound the child wind-down, but no live test asserts that and no log is cited
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0468-subagent-teardown-budget-shared-2000ms.md:311
  - docs/bugs/0468-subagent-teardown-budget-shared-2000ms.md:314
  - docs/bugs/0468-subagent-teardown-budget-shared-2000ms.md:295-297
  - tests/helpers/live-transcript.ts:12
  - tests/b0468-subagent-teardown-budget-decoupled.test.ts:173-232
sites: 2
fix_scope: localized
d10_class: memory-evidence
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0468 says a live run showed "ZERO theta/runtime/subagent-teardown-timeout … across ~146 live tests" and uses that to bound the child wind-down, but no live test asserts that and no log is cited

## Observation
Bug 0468 (Status: fixed 0.464.0) has a Verification item (3) stating that no `theta/runtime/subagent-teardown-timeout` fired on any success path across about 146 live tests, and that "the core symptom is gone". Residual 2 then uses the same run as the only evidence bounding the real post-envelope wind-down below the new 30000 ms budget. The record's own Provenance (:296-297) says that quantity was never measured. The live suites named in item (3) exist, but none of them asserts anything about `subagent-teardown-timeout`, and the live fail-closed markers do not include it. No log, session path, or captured output is cited for the "ZERO" count. The observation is therefore memory-held: nothing in the tree could re-derive it.

## Evidence
Claim side — `docs/bugs/0468-subagent-teardown-budget-shared-2000ms.md:311` (excerpt of the single line, re-read before filing):
```
(3) Live e2e: `tests/live/acceptance/` 53/53, `tests/live/double-session-start-live.test.ts` 1/1, `tests/live/live-production-acceptance.test.ts` 89/90 (one confirmed-stochastic unrelated bug-0097 load-test timeout, green on single re-run); ZERO `theta/runtime/subagent-teardown-timeout` on any success path across ~146 live tests spawning real subagent children — the core symptom is gone.
```
`docs/bugs/0468-subagent-teardown-budget-shared-2000ms.md:314`:
```
  2. The natural post-envelope exit time of a healthy model-turn child was still not directly instrumented; 30000 ms is calibrated to the industry graceful-exit norm (Docker 10 s / K8s 30 s), not to a measured wind-down. The live run confirmed zero success-path timeouts at 30 s, bounding the real wind-down comfortably below the budget.
```
Same record, `:295-297` (Provenance): "The natural post-envelope exit time of a healthy model-turn child was NOT measured (would need a live cell)".

Evidence side:
- The offline witness `tests/b0468-subagent-teardown-budget-decoupled.test.ts:173-232` (cells (B), (C), (D)×2) proves the budget decoupling and the hint content on an injected clock. It says nothing about live wind-down.
- The live fail-closed markers the harness checks, `tests/helpers/live-transcript.ts:12`: `export const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;`. The teardown-timeout code is not among them.

Searches, one per representation (all run this session):
1. Bug-doc witness lines: 0468's Gates line names `tests/b0468-subagent-teardown-budget-decoupled.test.ts` and `tests/subagent-isolation.test.ts` (both offline). Item (3) names three live paths but gives no log or output path.
2. Test contents: `grep -rl "subagent-teardown-timeout" tests/live | wc -l` → 0. `grep -rnE "teardown-timeout|teardownTimeout" tests/live tests/helpers` → 4 hits, all in `tests/live/typed-query-wire-shapes.test.ts` and all the different code `theta/runtime/reload-teardown-timeout`. `grep -rl "subagent-teardown-timeout" tests --include=*.ts` outside tests/live → 3 files (`b0434-operator-facing-note-matrix-row-coverage`, `b0468-subagent-teardown-budget-decoupled`, `subagent-isolation`), all offline.
3. Test file names: `find tests/live -iname "*0468*" -o -iname "*teardown*" | wc -l` → 0.
4. Test titles: `grep -rnE "^\s*(it|describe|test)\(.*teardown" tests/live` → 1 hit (`live-production-acceptance.test.ts:10572`, bug 0074 cell 61, a session_shutdown/binder race, unrelated).
5. Coverage matrix: `grep -nE "0468|subagent-teardown-timeout" docs/reference/coverage-matrix.md | wc -l` → 0.
6. AGENTS.md gates: `grep -nE "0468|subagent-teardown-timeout" AGENTS.md | wc -l` → 0.
7. CHANGELOG (corroboration only): `grep -n "Bug 0468" CHANGELOG.md` → 1 line (1014). `sed -n 1014p CHANGELOG.md | grep -oiE ".{0,100}(zero|live run|146).{0,100}"` → 0 matches. The entry does not repeat the live observation.

## Why this is a problem
Two of the record's statements rest on this observation: "the core symptom is gone" (the fix's production-scale proof) and Residual 2's bound on real wind-down (the only empirical support for the chosen 30000 ms against the Provenance's "NOT measured"). The named live suites passing is not evidence for either, because none of them would fail if the diagnostic fired on a success path. The count ("~146") and the "ZERO" have no log, output path, or asserting cell, so the claim cannot be re-checked and would not catch a regression.

## Suggested direction (non-binding, optional)
Either cite a durable artifact for the observation (a captured log or output path from the run), or word item (3) and Residual 2 as an unrecorded manual observation, like Provenance's "NOT measured" wording.

## False-positive check
- Representations covered: bug-doc witness/Gates lines, tests/live and tests/helpers contents, test file names, it()/describe() titles, coverage-matrix rows, AGENTS.md gate names, and CHANGELOG (corroboration only). Commands and counts are above.
- Checked for a generic live-side guard that would catch any `theta/runtime/…` error line: `grep -rnE "not\.toMatch\(/theta\\\\/" tests/live` → 0. The only marker list is `FAIL_CLOSED_MARKERS` (quoted above), which does not cover this code.
- The live paths in item (3) exist (all resolve in the tree). The finding is not about a missing file but about an asserted observable that no cited artifact carries.
- Not an honesty-marker filing: Provenance's "NOT measured" is the culture working. The filing targets the unmarked "confirmed" wording at :311 and :314, which that marker contradicts in strength.

## Triage
verdict: questionable — excerpts at 0468:296/:311/:314 and live-transcript.ts:12 reproduce, and all seven stated searches reproduce (0 / 4 reload-teardown hits / 3 offline files / 0 / 1 unrelated bug-0074 title / 0 / 0 / CHANGELOG:1014 0). But the claim that there is "no generic live-side guard" is overstated: tests/live/acceptance/noninteractive-acceptance.test.ts "H9a-T (e) subagent spawn drives to a success terminal" runs assertCodesSubsetOfPermitted (a parseSystemNoteCodes slug scan `theta/(load|parse|runtime|host)/…` over stdout+stderr, checked against tests/fixtures/h7a/permitted-codes.json, which excludes subagent-teardown-timeout) plus assertStderrClean (empty-capture gate). That is one cell, not ~146, and per the suite's own BND-1 comment and the tier-2 sendSystemNote sink it would only catch the code if it reached print-mode stdout or stderr. The "ZERO across ~146" count and Residual 2's wind-down bound still have no cited log or asserting cell, and the repair (cite an artifact, or reword as an unrecorded observation) is a rewording that a human has to make (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (memory-evidence). APPEND EXACTLY the following block at the very end of docs/bugs/0468-subagent-teardown-budget-shared-2000ms.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The observation above (ZERO theta/runtime/subagent-teardown-timeout across ~146 live tests) is an unrecorded session observation: no log or asserting cell for that count exists. The nearest standing guard is one cell — tests/live/acceptance/noninteractive-acceptance.test.ts (H9a-T (e) subagent spawn drives to a success terminal) whose permitted-codes scan excludes the teardown-timeout slug over print-mode stdout/stderr — one cell on one surface, not ~146. The wind-down bound in residual 2 rests on that observation and shares this qualification.
