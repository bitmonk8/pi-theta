---
id: PTQ-1663
title: Bug 0477 says the fix was "verified end-to-end (`omp -p /…`)" on Oh-My-Pi in both regimes, but no witness, log, command, or dated record of that run exists
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0477-code-side-theta-progress-routes-through-host-loop-bridge.md:123-126
  - docs/bugs/0477-code-side-theta-progress-routes-through-host-loop-bridge.md:128-142
  - tests/execution-status-progress-tool.test.ts:161
  - tests/prompt-mode-extension-tool-dispatch.test.ts:489-528
  - tests/production-host-loop-dispatch.test.ts:89
  - tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:93-97
sites: 1
fix_scope: localized
d10_class: memory-evidence
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0477 says the fix was "verified end-to-end (`omp -p /…`)" on Oh-My-Pi in both regimes, but no witness, log, command, or dated record of that run exists

## Observation
Bug 0477 (Status: fixed 0.473.0) is specifically about Oh-My-Pi: a code-side `theta_progress(...)` failed or hung there. Its `## Fix` section states the result on that host as verified end-to-end in prompt mode and in a subagent child. The command is elided (`omp -p /…`). No theta file, omp version, pi-theta version, date, session path, or log is given, and the run is not marked as a deleted scratch. The record's `## Test obligations` name only offline cells that run on fake hosts. The tree's live cells for `theta_progress` drive Pi, not Oh-My-Pi. So the one claim that the fix works on the host the bug is about has nothing to cite.

## Evidence
Claim side — `docs/bugs/0477-code-side-theta-progress-routes-through-host-loop-bridge.md:123-126` (re-read before filing):
```
Result on Oh-My-Pi: a code-side `theta_progress(...)` returns `ok` and runs its
class-2 side effect in both regimes, with no fabricated turn — verified
end-to-end (`omp -p /…`) in prompt mode (`A=ok B=ok`) and in a subagent child
(the theta proceeds past the call instead of stalling).
```
The record's own test list (`:128-142`) names only offline cells: "Unit (`tests/execution-status-progress-tool.test.ts`)…" and "Producer wiring (`tests/prompt-mode-extension-tool-dispatch.test.ts`)…". Both exist and run on doubles:
- `tests/execution-status-progress-tool.test.ts:161` — `it("codeSideExecute runs the SAME parent-regime handler (one bus.authorMessage + one milestone) and returns the fixed ok envelope", …)`
- `tests/prompt-mode-extension-tool-dispatch.test.ts:489` — `describe("RFC 0010 EXST-13 — a code-side call to an in-process tool dispatches its handler directly, never the host-loop bridge (bug 0477)", …)`, cells :490 and :528.
- `tests/production-host-loop-dispatch.test.ts:89` — `it("registers the bridge provider under a BESPOKE api tag, never a reserved built-in name (bug 0477 …)", …)` over `tests/helpers/fake-host-loop-host.ts`.

The live `theta_progress` cells drive Pi (`tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:93-97` comments on the PIC-64 code-side marker in prompt mode). `grep -niE "0477|codeSideExecute|inProcessToolExecutors|oh-my-pi|\bomp\b" tests/live/rfc0010-l3-progress-parent-live-cell.test.ts tests/live/rfc0010-l3-progress-wire-child-live-cell.test.ts tests/live/acceptance/rfc0010-l3-wire-json-mode.test.ts tests/live/b0487-quality-loop-load-pass-live.test.ts | wc -l` → 0.

Searches, one per representation (all run this session):
1. Bug-doc witness lines: 0477 has no `### Witnesses` section. `## Test obligations` (:128-142) lists the two offline files above. `grep -rn "A=ok" --include=*.md --include=*.ts --include=*.theta .` (excluding node_modules) → 1 hit, the claim line itself (0477:125).
2. Test file names: `find tests -iname "*0477*" | wc -l` → 0. `find tests -type f | grep -iE "(^|[-_/])omp([-_.]|$)|oh-my-pi" | wc -l` → 0.
3. Test titles: `grep -rnE "^\s*(it|describe|test)\(.*0477" tests` → 3 hits, all offline: `execution-status-progress-wire.test.ts:176`, `production-host-loop-dispatch.test.ts:89`, `prompt-mode-extension-tool-dispatch.test.ts:489`. `grep -rniE "^\s*(it|describe|test)\(.*(oh-my-pi|[^a-z]omp[^a-z])" tests` → 18 hits, all argv/dialect/config-dir/snapshot unit cells (`host-cli-dialect.test.ts`, `host-config-dir.test.ts`, `host-peer-version-and-model.test.ts`, `host-tool-snapshot.test.ts`, `b0488-subagent-respond-allowlist-argv.test.ts`). None drives `theta_progress` on a real omp. `grep -rlE "codeSideExecute|inProcessToolExecutors|0477" tests/live | wc -l` → 0.
4. Coverage matrix: `grep -niE "0477|oh-my-pi|\bomp\b" docs/reference/coverage-matrix.md | wc -l` → 0.
5. AGENTS.md gates: `grep -niE "oh-my-pi|\bomp\b" AGENTS.md | wc -l` → 0.
6. CHANGELOG (corroboration only): `grep -c "Bug 0477" CHANGELOG.md` → 1. Line 825 repeats "Verified end-to-end on `omp/18.1.16`" with no artifact, command, or date.

## Why this is a problem
The Oh-My-Pi claim is the fix's host-level proof, since the defect only shows on that host. It is stated as "verified" with nothing a reader could re-run or inspect: the command is elided and there is no session or log path, no date, and no witness row. The recorded evidence (fake-host unit and producer cells, plus live cells on Pi) proves the in-process dispatch branch and the bespoke API tag. It does not prove the result on Oh-My-Pi that the sentence asserts. This is an unmarked memory claim: neither "pending live verification" nor "scratch, deleted" appears.

## Suggested direction (non-binding, optional)
Either record the run as a citable artifact (the full `omp -p` command and theta, the omp and pi-theta versions, the date, and the observed output), or word the Oh-My-Pi result as an unrecorded manual observation, like the dated Symptom block at :59.

## False-positive check
- Representations covered: bug-doc witness/test-obligation lines, test file names, it()/describe() titles, tests/live contents, coverage-matrix rows, AGENTS.md gate names, and CHANGELOG (corroboration only). Commands and hit counts are listed above.
- The Symptom block (:59, "Observed against Oh-My-Pi (`omp/18.1.16`, `@bitmonk8/pi-theta@0.467.0`)") is a pre-fix observation with versions. The filed claim is the post-fix verification at :123-126, which carries no such record.
- Not a coverage request: the offline witnesses exist and are cited above. The finding is only that the host-level "verified" wording has no evidence.
- Not a behaviour claim: whether the fix works on Oh-My-Pi is not adjudicated here.

## Triage
verdict: questionable — memory-evidence verified, and no Oh-My-Pi witness exists to point to. 0477:123-126 claims "verified end-to-end (`omp -p /…`) … `A=ok B=ok`" with no command, date, log, or witness section, and has no pending/scratch marker. Every stated search reproduces verbatim: `A=ok` 1 hit (the claim line), 0 `*0477*` or omp/oh-my-pi test files, 3 offline `0477` titles, 18 omp dialect/argv unit titles, 0 tests/live files naming codeSideExecute/inProcessToolExecutors/0477, 0 coverage-matrix hits, 0 AGENTS.md hits, and CHANGELOG:825 repeats the claim with no artifact. My own searches: the only Oh-My-Pi mention in tests/live (live-production-acceptance ~:12005) says that harness spawns the Pi CLI, not omp. RFC 0010 Erratum G (:771-790) records no run. The code-side live cells (rfc0010-l3-progress-parent-live-cell "code-side call: exactly one milestone entry…" and the wire-child "PRESENT…" cell) run on Pi only. The fix needs the claim reworded or backed by a recorded run, and changing the record's wording is a human's call (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (memory-evidence). APPEND EXACTLY the following block at the very end of docs/bugs/0477-code-side-theta-progress-routes-through-host-loop-bridge.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The verified-end-to-end sentence above describes a manual Oh-My-Pi session with no recorded command transcript, log, date or witness in the tree (the only live progress cells run on the Pi CLI). It stands as an unrecorded manual observation, not a re-runnable verification; the standing witnesses for this fix are the offline dispatch cells and the rfc0010 progress live cells this record names.
