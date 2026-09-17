---
id: PTQ-0406
title: LaneState type export in execution-status/types.ts has no reader anywhere
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/execution-status/types.ts:67
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917121953
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# LaneState type export in execution-status/types.ts has no reader anywhere

## Observation
`execution-status/types.ts` declares and exports a closed-union type
`LaneState` commented "EXST-3(c) closed set". No other declaration in the
same file references it (the fields that would plausibly carry it —
`LaneSetSnapshot.queued`/`.done`/`.err`/`.running`, `ParForLaneSetHandle
.claim`/`.settle`) are typed with separate `number` fields and an inline
`"done" | "err"` literal union instead of `LaneState`.

## Evidence
`src/extension/execution-status/types.ts:67`:
```ts
export type LaneState = "queued" | "running" | "done" | "err"; // EXST-3(c) closed set
```

The sibling shapes that model lane state use their own inline forms rather
than this type — `src/extension/execution-status/types.ts:107-114`:
```ts
export interface LaneSetSnapshot {
  readonly total: number; // n (iterand snapshot length)
  readonly width: number; // min(resolved width, n) — post-CTRL-2 clamp
  readonly queued: number;
  readonly done: number;
  readonly err: number;
  readonly running: readonly RunningLane[]; // <= MAX_RUNNING_LANES_TRACKED, claim order
}
```
and `src/extension/execution-status/types.ts:146-150`:
```ts
export interface ParForLaneSetHandle {
  // returned even when untracked (no-op handle)
  claim(index: number): void; // queued -> running
  settle(index: number, outcome: "done" | "err"): void; // running -> done|err
  close(): void; // loop exit; an unclosed set drops with the node
}
```
`settle`'s own parameter spells the union inline (`"done" | "err"`) rather
than importing `LaneState`. The one production implementation of `settle`,
`src/extension/execution-status/bus.ts:403-408`, repeats the same inline
literal:
```ts
       settle: (index: number, outcome: "done" | "err"): void => {
         ...
           if (outcome === "done") {
```

## Why this is a problem
`LaneState` is a dead export: `grep -rn "\bLaneState\b"` across the repository
returns only its own declaration line. Nothing imports it, no local variable,
parameter, or return type in `types.ts`, `bus.ts`, `footer-sink.ts`,
`widget-sink.ts`, or any test names it. The type was added in the same commit
that introduced the rest of the RFC 0010 par-for lane model
(`git log -p --follow` on `types.ts` shows a single hunk introducing it) and
has never gained a reader since; the code that would use it (`settle`'s
`outcome` parameter, `LaneSetSnapshot`'s count fields) was written against a
separately-spelled inline union from the start.

## Suggested direction (non-binding, optional)
None proposed; the fix stage owns whether to remove the declaration or wire
`settle`'s parameter (and its one implementation) to reuse it.

## False-positive check
- `grep -rn "\bLaneState\b" .` (repo-wide, includes `src/`, `tests/`,
  `extensions/`, docs) returns only `types.ts:67`'s own declaration — no
  importer, no string-keyed/dynamic reference, no re-export.
- Checked every field of `LaneSetSnapshot` and every member of
  `ParForLaneSetHandle`/`ParForLaneHooks` in the same file: none is typed as
  `LaneState`; the state-carrying members use plain `number` counters or an
  inline `"done" | "err"` literal instead.
- Checked the one production `settle` implementation
  (`execution-status/bus.ts:403-408`) and its test callers
  (`tests/execution-status-parfor-lanes.test.ts`,
  `tests/execution-status-bus.test.ts`): both use the inline literal, not
  `LaneState`.
- `git log -p --follow -- src/extension/execution-status/types.ts | grep -n
  LaneState` shows exactly one hunk (the type's introduction); no later commit
  ever added a reader.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-ran `rg --no-ignore --hidden LaneState` repo-wide: only its own declaration at src/extension/execution-status/types.ts:67 (plus this filing/review-log/a .localpi scratch copy); no importer, no `export *` barrel, no test reader; `settle` in types.ts:149 and bus.ts:403 spell `"done" | "err"` inline; git history shows one introducing hunk and no reader since (triage: claude-fable-5-1)
