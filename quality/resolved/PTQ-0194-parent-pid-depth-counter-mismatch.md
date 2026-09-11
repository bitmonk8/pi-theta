---
id: PTQ-0194
title: readParentPid's doc comment names its carried value a depth-counter input, which subagent-launcher.ts's account of the same env var twice states it is not
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-subagent-host.ts:181-184
  - src/extension/production-composition.ts:918-924
  - src/extension/production-theta-producer.ts:2568-2575
  - src/runtime/subagent-launcher.ts:64-72
  - src/runtime/subagent-launcher.ts:567-570
  - src/runtime/subagent-launcher.ts:573-579
sites: 6                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911055804
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# readParentPid's doc comment names its carried value a depth-counter input, which subagent-launcher.ts's account of the same env var twice states it is not

## Observation
`readParentPid()` returns `process.pid`. Its doc comment glosses the returned
value's purpose as "(orphan-prevention watchdog / depth counter)". The
value's only path to a child is `subagentParentPid` →
`SubagentLaunchRequest.parentPid` → `buildSubagentChildEnv`'s `parentPid`
parameter, which alone writes `SUBAGENT_PARENT_PID_ENV`. That env var's own
doc comment in `subagent-launcher.ts`, and `buildSubagentChildEnv`'s body
comment immediately above the line that writes it, each separately state
that this carriage is not the invoke-depth counter — a different env var
populated from a different, structurally unrelated parameter (`invokeDepth`,
sourced from `chain.depth`).

## Evidence
src/extension/production-subagent-host.ts:181-184 — the comment under review:

```ts
/** The parent process id carried to the child (orphan-prevention watchdog / depth counter). */
export function readParentPid(): number {
  return process.pid;
}
```

src/extension/production-composition.ts:918-924 — the value's sole consumer,
wired next to (but structurally separate from) the params-fs seam:

```ts
    subagentSpawn: createProductionSpawnFn(),
    subagentExecutableHost,
    subagentParentEnv: readParentEnv(),
    subagentParentPid: readParentPid(),
    // RFC-0006 (PIC-60): the params-channel filesystem seam (0600 temp file for
    // the at/above-threshold channel + the parent `finally` backstop unlink).
    subagentParamsFs: createProductionParamsFs(),
```

src/extension/production-theta-producer.ts:2568-2575 — `subagentParentPid`
becomes `parentPid`, built next to `invokeDepth`, which comes from an
unrelated source:

```ts
        cwd: bindInput.resolvedCwd ?? ctx.cwd,
        parentEnv,
        controlPlaneEnv,
        parentPid: this.#input.subagentParentPid ?? 0,
        // INV-4: marshal the CURRENT per-chain depth so the child continues the
        // depth-32 ceiling across the process hop (wire-level carriage).
        invokeDepth: chain.depth,
```

src/runtime/subagent-launcher.ts:64-72 — the env var's own doc, stating the
carriage is not the depth counter:

```ts
/**
 * The env var carrying the parent PID to the child. Its live reader is the
 * control-plane authentication gate (`authenticateControlPlane`,
 * `production-subagent-host.ts`): the child compares it against its real
 * `ppid` and drops every control-plane carriage on a mismatch. It is also the
 * input reserved for the RECORDED BUT UNIMPLEMENTED child-side parent-PID
 * watchdog (PIC-65 orphan-prevention class-2 fallback). This is NOT the
 * invoke-depth counter — that rides `SUBAGENT_INVOKE_DEPTH_ENV` below.
 */
```

src/runtime/subagent-launcher.ts:567-570 — `buildSubagentChildEnv`'s own body
comment, immediately above the two keys it writes, stating the same thing a
second time:

```ts
  // The parent PID is the child's control-plane authentication key (and the
  // reserved, unimplemented PIC-65 watchdog input); the invoke depth is the
  // wire-level INV-4 counter the child seeds its chain from (two DISTINCT
  // carriages — the PID is not the depth).
```

src/runtime/subagent-launcher.ts:573-579 — the two keys, populated from two
distinct function parameters:

```ts
  return {
    ...inherited,
    ...(controlPlane ?? {}),
    ...(rootSlug !== undefined ? { [SUBAGENT_ROOT_ENV_MARKER]: rootSlug } : {}),
    [SUBAGENT_PARENT_PID_ENV]: String(parentPid),
    [SUBAGENT_INVOKE_DEPTH_ENV]: String(invokeDepth),
  };
```

## Why this is a problem
Historical narration comment whose stated purpose does not match the
codebase's own account of the same value. `readParentPid`'s parenthetical has
read "(orphan-prevention watchdog / depth counter)" unchanged since the
function's introduction (`fda23a4b6`, 2026-07-24); the very same commit's
`subagent-launcher.ts` already carried "This is NOT the invoke-depth
counter — that rides `SUBAGENT_INVOKE_DEPTH_ENV` below" on the env var this
function's return value populates, so the two files stated different
purposes for the same value from the point both existed. A later rewrite of
the launcher-side comments (`ae6733f3`, 2026-09-10, the PTQ-0033 fix) restated
the same distinction a second time — "two DISTINCT carriages — the PID is not
the depth" — without the host-side comment being revisited; that same commit
touched `production-subagent-host.ts` only to remove an unrelated `pid` field
from `adaptChild`'s return object (PTQ-0172). A reader of `readParentPid` in
isolation is told its value feeds a depth counter that, per the module
actually consuming it, it structurally does not: the depth ceiling is carried
by `chain.depth` through a separate parameter and a separate env key.

## Suggested direction (non-binding, optional)
Drop "/ depth counter" from the comment, and consider naming the
authentication role instead, since that is the value's one currently-live
consumer per `authenticateControlPlane`, declared a few lines above
`readParentPid` in this same file.

## False-positive check
- Reference search: `grep -rn "readParentPid" src extensions tools tests` —
  the declaration (production-subagent-host.ts:182) and its one caller
  (production-composition.ts:921); zero hits under tests/, extensions/, or
  tools/, so the composition root is the only place its return value is ever
  consumed (not a test-only-reachable case; production reaches it directly).
- Traced the full call chain from that one call site to confirm the value's
  single destination: production-composition.ts:921 `subagentParentPid` →
  production-theta-producer.ts:447 (field declaration), :2571 (`parentPid:
  this.#input.subagentParentPid ?? 0`) → `SubagentLaunchRequest.parentPid`
  (subagent-launcher.ts:644) → `buildSubagentChildEnv`'s `parentPid` parameter
  (subagent-launcher.ts:548-549, called at :696-699) → the sole write site
  `[SUBAGENT_PARENT_PID_ENV]: String(parentPid)` (subagent-launcher.ts:577).
  At no point does this value reach `invokeDepth`, `chain.depth`, or
  `SUBAGENT_INVOKE_DEPTH_ENV`, which is populated from an entirely separate
  field (`chain.depth`, theta-producer.ts:2574) via a separate parameter
  (subagent-launcher.ts:550, written at :578).
- Git intent check: `git blame -L 181,184
  src/extension/production-subagent-host.ts` → the comment is unchanged since
  `fda23a4b6` (2026-07-24, the function's introduction). `git show
  fda23a4b6:src/runtime/subagent-launcher.ts` shows the "This is NOT the
  invoke-depth counter" sentence already present in that same commit,
  attached to `SUBAGENT_PARENT_PID_ENV`. `git log -S "NOT the invoke-depth
  counter"` and `git log -S "the PID is not the depth"` (both scoped to
  `subagent-launcher.ts`) resolve to `fda23a4b6` and `ae6733f3`
  (2026-09-10, the PTQ-0033 fix commit) respectively; `git show ae6733f3 --
  src/extension/production-subagent-host.ts` shows that commit's only change
  to this file is the unrelated `pid:` field removal from `adaptChild`'s
  return object (PTQ-0172), not this comment.
- Checked this is not the already-listed, fixed PTQ-0033: that finding's
  locations were three OTHER `subagent-launcher.ts` comments claiming
  "nothing in `src/` reads it today" (since corrected); this finding is about
  a comment in `production-subagent-host.ts` that PTQ-0033's fix commit did
  not touch, and its claim (a depth-counter attribution) differs from
  PTQ-0033's claim (an unread attribution).
- Not a deadness claim: `readParentPid()` is reached from production (the
  composition root) on every invocation; only the comment's characterization
  of the value's purpose is at issue.

## Triage
verdict: confirmed — all six excerpts byte-match at their cited lines and the traced flow is independently reproduced: `subagentParentPid`/`parentPid` (composition.ts:921, theta-producer.ts:2571) writes only `SUBAGENT_PARENT_PID_ENV` (subagent-launcher.ts:577), never `invokeDepth`/`chain.depth`/`SUBAGENT_INVOKE_DEPTH_ENV` (theta-producer.ts:2574, subagent-launcher.ts:578), and subagent-launcher.ts states twice, unambiguously, that the PID carriage is NOT the depth counter, directly contradicting `readParentPid`'s parenthetical; git blame confirms the host-side comment is unchanged since fda23a4b6 (2026-07-24), whose own subagent-launcher.ts already carried the "NOT the invoke-depth counter" disclaimer, and ae6733f3 (PTQ-0033's fix) touched production-subagent-host.ts only for the unrelated PTQ-0172 `pid:` removal, never this comment — confirming the substance of the historical narrative independently, though the candidate's own `git log -S` invocations for these two exact phrases are mis-attributed when re-run ("NOT the invoke-depth counter" hits zero commits, since the phrase straddles a comment line-wrap; "the PID is not the depth" resolves to fda23a4b6, not ae6733f3), a sloppy but non-load-bearing self-check error; subagent.md PIC-65 (:233) names only the unimplemented parent-PID watchdog with no depth concept, so "depth counter" is unsupported; not a duplicate of PTQ-0033 (targeted three OTHER launcher comments' now-fixed "nothing in src/ reads it today" claim) or PTQ-0191 (the CONTROL_PLANE_ENV_KEYS bullet roster, a different comment) (triage: claude-opus-5)
