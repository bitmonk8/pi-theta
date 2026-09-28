---
id: PTQ-1648
title: Bug 0310's "no live cell owed" self-adjudication rests on "zero existing live watcher coverage", backed only by a fake's doc comment, while tests/live/double-session-start-live.test.ts already drove real chokidar delivery at the fix commit
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0310-watch-roots-derived-from-discovered-files-not-root-union.md:250-259
  - docs/bugs/0310-watch-roots-derived-from-discovered-files-not-root-union.md:213-216
  - docs/bugs/0310-watch-roots-derived-from-discovered-files-not-root-union.md:29-32
  - tests/helpers/fake-file-watcher.ts:1-4
  - tests/live/double-session-start-live.test.ts:12-20
  - tests/live/double-session-start-live.test.ts:52-62
  - docs/bugs/0312-out-of-root-thetalib-edits-invisible-stale-imports.md:210-212
  - docs/bugs/0313-every-chokidar-error-classified-terminal.md:235-238
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0310's "no live cell owed" self-adjudication rests on "zero existing live watcher coverage", backed only by a fake's doc comment, while tests/live/double-session-start-live.test.ts already drove real chokidar delivery at the fix commit

## Observation

Bug 0310 is `Status: fixed (0.301.0)`. Its Verification item (3) says "no live cell owed", and the self-adjudication behind that gives three sources. One of them is a universal negative: "the watcher subsystem is architecturally seam-faked with zero existing live watcher coverage". The only evidence cited for it is the doc comment at `tests/helpers/fake-file-watcher.ts:2`. That comment describes the fake as a conformance vehicle. It does not say whether live coverage exists. At the fix commit `337e8d08`, and still today, the tree holds a live test that drives the real `PiFileWatcher`/chokidar watcher and waits for a delivered structural-change note (the bug-0048 warm-up precondition). The same record's §Related entry names bug 0048 as a watcher "live witness". Two later records in this shard (0312, 0313) cite that same live file as their live watcher coverage.

## Evidence

Claim side: `docs/bugs/0310-watch-roots-derived-from-discovered-files-not-root-union.md:250-259` (re-read before filing):

```
  - Self-adjudication — no live cell owed (LIVE POLICY branch b): the fix
    changes only the CONTENTS of the `roots` array handed to the unchanged
    `watch(roots, …)` seam. Three sources: `src/seams/pi-file-watcher.ts`
    byte-unchanged (no new real-chokidar code path); the watcher subsystem is
    architecturally seam-faked with zero existing live watcher coverage —
    `FakeFileWatcher` is "the conformance vehicle for the watcher delivery
    contract" (`tests/helpers/fake-file-watcher.ts:2`); session_start
    registration outcomes are byte-unchanged (only the armed-directory set
    widens). Bound: had `pi-file-watcher.ts` changed or a registration outcome
    moved, a live cell would be owed — STOP valve, not exercised.
```

The Verification line that depends on it, `:213-216`:

```
- Verification: SOLID. (1) the witness reds when the fix is neutralised (exact
  signature) and greens when restored byte-exact; (2) full suite 479/9557 green;
  (3) no live cell owed — settled by inspection (see Residuals/self-adjudication);
  (4) lint + typecheck clean.
```

The same record's §Related, `:29-32`, names a live watcher witness:

```
- **Related:**
  - 0048 (fixed, 0.229.0) — watcher coverage vacuity in a live witness
    (`ignoreInitial` initial-scan race). Different mechanism: that is a
    timing gap on an armed root; this is a root never armed at all.
```

The cited evidence, `tests/helpers/fake-file-watcher.ts:1-4` (current tree). It describes what the fake does and says nothing about live coverage:

```
// V8e — in-memory `FakeFileWatcher` conforming `FileWatcher` seam test double
// (PIC-14). The conformance vehicle for the watcher delivery contract: `emit`
// synchronously invokes the attached change handler with one of the three change
// kinds, and `terminate` drives the terminal-signal channel — a stopped-delivering
```

Contradicting tree evidence. `tests/live/double-session-start-live.test.ts` in the current tree, `:12-20` (the same text is at `337e8d08:tests/live/double-session-start-live.test.ts:12-20`):

```
// Defect (docs/bugs/0021-double-session-start-leaks-armed-watcher.md): the
// public host SDK's `AgentSession.bindExtensions()` carries no once-guard and
// re-emits the stored `session_start` to the SAME factory closure; pre-fix the
// second compose pass overwrote the single-slot teardown handle with no detach
// of the prior generation, so generation 1's REAL chokidar watcher stayed
// armed with no reachable teardown. After the (single) `session_shutdown` +
// dispose, that leaked watcher's next filesystem event trips the PIC-67 entry
// probe against the invalidated runtime and emits exactly one
// `theta hot-reload quiesced:` stderr line (the `StaleQuiesceLog` sink) —
```

and at `337e8d08:tests/live/double-session-start-live.test.ts:52-62` (the fix commit's tree):

```
// The bug-0021 arm below is an ABSENCE assertion over a `console.error`
// capture, so it is only evidence about the leak once this generation's
// watcher is known to deliver: `PiFileWatcher` arms chokidar with
// `ignoreInitial: true` (src/seams/pi-file-watcher.ts:31), which drops a write
// to any path its initial walk has not yet reached, and the seam exposes no
// readiness signal (src/seams/file-watcher.ts:46-50). The warm-up churn below
// establishes delivery as a proven precondition before the supersession, and
// fails loudly when it is unmet
// (docs/bugs/0048-double-session-start-live-vacuous-quiesce-witness.md).
```

Searches run in this session:
- `git grep -l -i "chokidar" 337e8d08 -- tests/live` → 3 files at the fix commit (`tests/live/double-session-start-live.test.ts`, `tests/live/hardening/probe-harness.ts`, `tests/live/hardening/recent-rfc-live-drives.test.ts`).
- `git grep -n "b0048warmup\|WARMUP_DELIVERY_CAP_MS = " 337e8d08 -- tests/live/double-session-start-live.test.ts` → 2 hits (`:97` `WARMUP_SLASH_NAME = "b0048warmup"`, `:191` `WARMUP_DELIVERY_CAP_MS = 30_000`). The warm-up delivery precondition was already in the tree when 0310 was fixed.
- `grep -rln -i "chokidar\|PiFileWatcher" tests/live` (current tree) → 3 files, the same three.
- `grep -rn "double-session-start-live" docs/bugs/0312*.md docs/bugs/0313*.md` → 4 hits (0312:211, 0313:236, :247, :259). 0312 `:210-212` says "live witness `tests/live/double-session-start-live.test.ts` 1/1 green under the shared live-lock (real step-5 arming/supersession path, PIC-57/68/69)". 0313 `:235-238` says "live `tests/live/double-session-start-live.test.ts` green under the shared lock (real chokidar through the changed adapter …)". So in the same fix campaign this file is treated as existing live watcher coverage.
- `git log --format="%h %ad %s" --date=short -- tests/live/double-session-start-live.test.ts` → earliest commit `7fa76517 2026-07-29 fix(bug-0021)`, and `6231d38b 2026-08-23 fix(bug-0048)` added the warm-up delivery precondition. Both predate the 0310 fix commit `337e8d08` (2026-08-27).

## Why this is a problem

The record's discharge of its live obligation depends on a universal negative ("zero existing live watcher coverage"). The only evidence for it is a comment on a test double, and that comment cannot establish the absence of live tests. The tree evidence goes the other way: at the fix commit, a live cell already armed the real chokidar-backed `PiFileWatcher` through the shipped extension and waited for a delivered structural-change note. That is the watcher-arming surface 0310 changes (which directories `watch(roots, …)` is handed). The record's own §Related also calls bug 0048's test a live witness of watcher coverage. So the wording claims more than the cited evidence supports, the tree contradicts it, and "(3) no live cell owed" rests partly on it.

## Suggested direction (non-binding, optional)

Re-word the self-adjudication's second source so it names the existing live watcher cell (`tests/live/double-session-start-live.test.ts`, the bug-0048 warm-up delivery precondition) instead of claiming zero coverage. The record can then state whether that cell was run for 0310 or why it was not needed.

## False-positive check

- The claim was re-read verbatim at `:250-259` and `:213-216` right before filing. The record is `Status: fixed (0.301.0)`.
- Not an honesty marker: the sentence states the absence of live coverage as a fact and uses it as a source for "no live cell owed". It is not a "pending live verification" marker.
- Not a truth adjudication of behaviour: the claim is about pi-theta's test estate (evidence), not about runtime behaviour. The evidence side is the tree at the fix commit, checked with `git grep` / `git show` at `337e8d08`.
- Timing checked: the live file and its warm-up delivery precondition existed at `337e8d08` (git log above), so the claim was contradicted when it was written, not made stale by later tree changes.
- The remaining sources of the self-adjudication (pi-file-watcher.ts byte-unchanged; registration outcomes unchanged) are not disputed. This filing covers only the "zero existing live watcher coverage" source and the evidence cited for it.
- Not gate-enforced: no citation-form gate checks this (it is a claim-strength question, not a citation form).
- Dedup: none of the listed PTQ/candidate filings names 0310 (the listing contains no `0310` entry).
- Representations covered: bug-doc Fix/Verification/Related lines (0310, 0312, 0313), test file names and header text under `tests/live/` (current and at `337e8d08`), and git history of the live file. The coverage matrix and AGENTS.md gates were not relied on (no matrix row or gate name bears on live watcher coverage). CHANGELOG was not used.

## Triage
verdict: questionable — accounting verified; rewording a record is a human ruling. 0310 :250-259 says "zero existing live watcher coverage" and cites only fake-file-watcher.ts:2, a comment that says nothing about live tests. At fix commit 337e8d08 (2026-08-27), tests/live/double-session-start-live.test.ts already existed: its describe "bugs 0021 + 0024 — live double session_start supersession …" arms the REAL chokidar PiFileWatcher, and the bug-0048 warm-up (b0048warmup, WARMUP_DELIVERY_CAP_MS) proves delivery. That test dates from 7fa76517 and 6231d38b. The record's own §Related :29-32 calls 0048 a live witness, and 0312:211 and 0313:236 cite the same file as live coverage. All stated searches reproduce (3/2/3/4 hits). No PTQ or intake filing tracks 0310. Form note: the candidate lacked a ## Triage heading, which was added here (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). APPEND EXACTLY the following block at the very end of docs/bugs/0310-watch-roots-derived-from-discovered-files-not-root-union.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The no-live-cell-owed adjudication above rests on zero existing live watcher coverage, citing only a fake-watcher doc comment. That premise was false at the fix commit: tests/live/double-session-start-live.test.ts (bugs 0021 + 0024 describe) already armed the REAL chokidar PiFileWatcher and proved delivery through the bug 0048 warm-up, as the §Related section of this record itself notes and as the bug 0312 / bug 0313 records cite. The self-adjudication outcome (no new live cell added) stands as decided; its stated ground is corrected to: live watcher coverage existed and lives in that cell.
