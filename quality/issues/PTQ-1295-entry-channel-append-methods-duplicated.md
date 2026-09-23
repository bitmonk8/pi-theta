---
id: PTQ-1295
title: entry-channel append methods duplicated
lens: D4
status: open
verdict: confirmed
locations:
  - src/extension/execution-status/entry-channel.ts:97-111
  - src/extension/execution-status/entry-channel.ts:112-128
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# entry-channel append methods duplicated

## Observation
The entry channel returned by `createEntryChannel` carries four append methods
(`append`, `appendMilestone`, `appendRun`, `appendRunSummary`) that all
implement the same PIC-71 / EXST-8 / Erratum-A dead-channel degrade discipline.
The clone scanner groups `append` and `appendMilestone` as G021; the other two
methods repeat the identical control flow. Each method guards on `dead`, calls
`pi.appendEntry` with a custom-entry type and payload, and sets `dead = true` on
the first thrown append.

## Evidence
`src/extension/execution-status/entry-channel.ts:97-111` — `append`:
```ts
    append(note: SystemNote): boolean {
      if (dead) {
        return false;
      }
      try {
        // PIC-72: no dedup on this channel — a re-scan re-appends.
        pi.appendEntry(THETA_PROGRESS_ENTRY_TYPE, note);
        return true;
      } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        // EXST-8 / PIC-72: the first append failure permanently degrades the
        // channel; this note and every later one fall back to `sendMessage`.
        dead = true;
        return false;
      }
    },
```

`src/extension/execution-status/entry-channel.ts:112-128` — `appendMilestone`:
```ts
    appendMilestone(m: ProgressMilestone): boolean {
      if (dead) {
        return false;
      }
      try {
        // PIC-71: the milestone shares the SAME `theta-progress-entry` custom-
        // entry type as the migrated-note payload; the renderer discriminates
        // on the `milestone` key (PIC-71).
        pi.appendEntry(THETA_PROGRESS_ENTRY_TYPE, { milestone: m });
        return true;
      } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        // EXST-14: no `sendMessage` fallback for milestones — the channel
        // simply degrades dead, same as the note-append arm above.
        dead = true;
        return false;
      }
    },
```

Diff verdict: **renamed-only** (G021). The parameter name changes (`note` →
`m`), the payload changes (`note` → `{ milestone: m }`), and the comments
differ, but the control flow is byte-identical:
`if (dead) { return false; } try { pi.appendEntry(TYPE, payload); return true; } catch { dead = true; return false; }`.

## Why this is a problem
All four append methods promise the same invariant: the first hard append
failure permanently degrades the channel for the session, silently and without
a message-channel fallback. If one copy drifts — for example, a future edit
forgets to set `dead = true` in the catch, returns `true` on a thrown append,
or reintroduces a `sendMessage` fallback — the channel will degrade
inconsistently across the four entry types. The comments already vary
("same as the note-append arm above", "milestone discipline", etc.), showing
that the shared rule is described rather than enforced in one place.

## Suggested direction
Extract a single internal helper inside `entry-channel.ts` that takes a custom
entry type and payload and owns the dead-guard / append / catch / dead-set
logic. All four public methods delegate to it, keeping the degrade discipline
in one place.

## False-positive check
- Re-read both cited spans; both copies are live and share the same control
  flow.
- Verified with `grep` that `pi.appendEntry(` is called only by these four
  methods in `src/extension/execution-status`.
- The similarity is not a spec-normative vector table; the payload literals
  differ.
- Not in `tests/`; not generated.

## Triage
verdict: confirmed — excerpts match at entry-channel.ts:97-111 / 112-128; clone-scan map reproduces G021 (73 tokens, renamed-only, 96-120 vs 128-148) and the uncited `appendRun` (129-141) / `appendRunSummary` (142-153) repeat the same `if (dead) return false; try { pi.appendEntry(TYPE, payload); return true } catch { dead = true; return false }` flow, so the real site count is 4 not 2; grep confirms `pi.appendEntry(` occurs only at these four lines in src/ and every copy is live (system-note-channel.ts:378, progress-tool.ts:288, run-card.ts:114/141); not a spec vector table, not dead, not tracked elsewhere (PTQ-1272 is a D9 misplacement on system-note-channel.ts) — a mechanical dedupe into one closure-local helper (triage: claude-fable-5-1)
