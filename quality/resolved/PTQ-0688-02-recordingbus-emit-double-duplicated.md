---
id: PTQ-0688
title: RecordingBus (emit(channel, data) recorder) redeclared byte-for-byte in three subagent test files, including the in-scope subagent-fn-child-launch.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-fn-child-launch.test.ts:47-53
  - tests/subagent-root-drive-wiring.test.ts:33-39
  - tests/subagent-visible-regime.test.ts:128-134
sites: 3
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# RecordingBus (emit(channel, data) recorder) redeclared byte-for-byte in three subagent test files, including the in-scope subagent-fn-child-launch.test.ts

## Observation
`tests/subagent-fn-child-launch.test.ts` declares a module-scope `class
RecordingBus` — a fake `pi.events`-shaped bus with an `emitted` array and an
`emit(channel, data)` method that pushes `{ channel, data }` — with the exact
same one-line doc comment above it ("RFC 0012 §7 (0.478.0): a fake
`pi.events`-shaped bus recording `[channel, data]` pairs."). The identical
class — same name, same field, same method body, same doc comment — is
independently declared in two other test files in the same subagent test
neighbourhood.

## Evidence

tests/subagent-fn-child-launch.test.ts:47-53 (re-read immediately before
filing):
```ts
/** RFC 0012 §7 (0.478.0): a fake `pi.events`-shaped bus recording `[channel, data]` pairs. */
class RecordingBus {
  readonly emitted: { channel: string; data: unknown }[] = [];
  emit(channel: string, data: unknown): void {
    this.emitted.push({ channel, data });
  }
}
```

tests/subagent-root-drive-wiring.test.ts:33-39 — byte-identical:
```ts
/** RFC 0012 §7 (0.478.0): a fake `pi.events`-shaped bus recording `[channel, data]` pairs. */
class RecordingBus {
  readonly emitted: { channel: string; data: unknown }[] = [];
  emit(channel: string, data: unknown): void {
    this.emitted.push({ channel, data });
  }
}
```

tests/subagent-visible-regime.test.ts:128-134 — byte-identical:
```ts
/** RFC 0012 §7 (0.478.0): a fake `pi.events`-shaped bus recording `[channel, data]` pairs. */
class RecordingBus {
  readonly emitted: { channel: string; data: unknown }[] = [];
  emit(channel: string, data: unknown): void {
    this.emitted.push({ channel, data });
  }
}
```

Search performed: `grep -rln "class RecordingBus" tests/*.test.ts` → four
files total (the three above plus
`tests/execution-status-checkpoint-decorator.test.ts`, whose `RecordingBus`
implements `Pick<ExecutionStatusBus, "checkpointBefore">` with a different
field/method shape and is NOT part of this duplication). A search of
`tests/helpers/*.ts` for this exact shape (`grep -rln "emit(channel" ""class
RecordingBus"" tests/helpers/*.ts`) found no exported double — no
`tests/helpers/` module currently exports this "channel/data pair recorder"
double.

## Why this is a problem
Three independently-authored test files, one of them in this review's scope,
each retype the same 6-line class body — including its doc comment — under
the same name, rather than importing one shared recording double. No
`tests/helpers/` module currently exports this exact "records every
`emit(channel, data)` call as a `{channel, data}` pair" double, so each of
the three files reaches for its own copy instead of a shared one.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export of this `RecordingBus` (the channel/data
pair recorder distinct from `execution-status-checkpoint-decorator.test.ts`'s
narrower `checkpointBefore`-only recorder) is the home three independent
copies already point toward.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kin; the cited lines are a fixture/double class declaration, not
  a pinned count or inventory assertion.
- Recording-double check: `RecordingBus` IS a recording double by design (it
  backs positive read-back assertions such as "exactly one 'ok' outcome
  event" in `subagent-fn-child-launch.test.ts`), which is why the carve-out
  for negative "never called" witnesses is checked here and found not to
  apply: none of the three files uses `RecordingBus.emitted` to assert
  something was NEVER called — each asserts on the recorded contents (length,
  channel, data) that WAS emitted. The carve-out protects MUST-NOT witnesses;
  this finding is about the class being retyped three times, not about the
  legitimacy of using a recording double at all.
- docs/bugs/ signature search: `grep -rln "class RecordingBus"
  docs/bugs/*.md` → 0 hits; no open bug document names this duplication as a
  documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "RecordingBus"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` block in any of the
  three files.
- Overlap check: `grep -rli "class RecordingBus" quality/intake/*.md
  quality/resolved/*.md` (excluding this file) → no hits; no prior finding
  names this duplication.
- Coverage-drift check: this finding is about a harness/double declaration
  repeated across files that already exist and already pass; it makes no
  claim that any behaviour or path is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the 7-line `RecordingBus` (doc comment + `emitted` + `emit(channel, data)`) is byte-identical at tests/subagent-fn-child-launch.test.ts:47-53, tests/subagent-root-drive-wiring.test.ts:33-39 and tests/subagent-visible-regime.test.ts:128-134; `grep -rln "class RecordingBus"` across tests/src/extensions/tools yields only those three plus execution-status-checkpoint-decorator.test.ts:50-56 whose class has a different shape (`publishes`/`checkpointBefore`), and tests/helpers/ declares no such double (subagent-fn-child-regime.ts:65 only accepts an `emit`-shaped object); all three copies are live (positive read-back at fn-child-launch:482-514, root-drive-wiring:269-304, visible-regime:268-395) — the candidate's claim that no file uses `emitted` as a never-called witness is inaccurate (visible-regime:332 `toHaveLength(0)`, :605 `toEqual([])`) but that carve-out protects the assertions, not the triplicated declaration; no gate/live/bug-doc/coverage-matrix conflict, no PTQ row or sibling intake (d7-01 and d7-149-03 explicitly exclude RecordingBus) tracks this double — D7 copy-paste double, mechanical dedupe (triage: claude-fable-5-1)
