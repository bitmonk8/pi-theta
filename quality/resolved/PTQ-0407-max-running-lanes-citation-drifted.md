---
id: PTQ-0407
title: MAX_RUNNING_LANES_TRACKED's rationale comment cites the wrong PAR_FOR_THROTTLE line
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/execution-status/types.ts:22-25
  - src/runtime/statement-executor.ts:1938
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917121953
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# MAX_RUNNING_LANES_TRACKED's rationale comment cites the wrong PAR_FOR_THROTTLE line

## Observation
`MAX_RUNNING_LANES_TRACKED`'s doc comment justifies its value by pointing at
`statement-executor.ts:1731` as the location of `PAR_FOR_THROTTLE = 64`. In
the current tree `PAR_FOR_THROTTLE` is declared at `statement-executor.ts:1938`,
207 lines away from the cited line.

## Evidence
`src/extension/execution-status/types.ts:22-25`:
```ts
/** Per-lane-set tracked RUNNING lanes. Rationale: PAR_FOR_THROTTLE = 64
 *  (statement-executor.ts:1731) hard-bounds concurrency, so this is structural;
 *  the constant is a defensive clamp against a defective claim storm. */
export const MAX_RUNNING_LANES_TRACKED = 64;
```

`src/runtime/statement-executor.ts:1938` — the constant's actual declaration
today:
```ts
const PAR_FOR_THROTTLE = 64;
```

## Why this is a problem
The comment's citation is a falsifiable location claim, and it is false at
HEAD: `grep -n "PAR_FOR_THROTTLE" src/runtime/statement-executor.ts` reports
the declaration at line 1938 (also used at lines 2170 and 2215), not 1731.
Line 1731 of `statement-executor.ts` lands inside an unrelated function, so a
reader following the citation lands on the wrong code. `git log -p --follow`
on `types.ts` shows the comment was introduced once, in the same commit that
added the constant, and has not been touched since — `statement-executor.ts`
has grown around it in the interim, drifting the target line without anyone
updating the citation.

## Suggested direction (non-binding, optional)
None proposed; the fix stage owns whether to correct the line number or drop
the numeric citation in favour of naming the constant only (as the sibling
comment on `MAX_TRACKED_INVOCATIONS` two lines above already does, citing
"INV-4" with no line number).

## False-positive check
- `grep -n "PAR_FOR_THROTTLE" src/runtime/statement-executor.ts` — 3 hits,
  declaration at 1938, uses at 2170 and 2215; none at 1731.
- Read `statement-executor.ts:1725-1740` directly: that range is inside an
  unrelated function, not `PAR_FOR_THROTTLE`'s declaration.
- `git log -p --follow -- src/extension/execution-status/types.ts | grep -n
  "PAR_FOR_THROTTLE"` shows exactly one hunk (the comment's introduction
  alongside the constant); no later commit updated the cited line number.
- Confirmed this specific drift is not on the do-not-refile list: it is
  distinct from `PTQ-0028`/`PTQ-0069`/etc. (different files/constants) and
  was not previously filed for `types.ts`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: types.ts:22-25 cites `statement-executor.ts:1731` for PAR_FOR_THROTTLE, but `grep -n` shows the declaration at :1938 (uses :2170/:2215, none at 1731) and :1725-1740 is inside an unrelated inline-composite evaluator; git log -p --follow shows the citation was written once (1dad42ac, when the constant sat at :1742) and never updated, so the location claim is false at HEAD — same stale-line-citation class as PTQ-0026/0069/0354 but a distinct file/constant not tracked by any PTQ row (REVIEW_LOG 2026-09-16 D2 explicitly requested this refile) (triage: claude-fable-5-1)
