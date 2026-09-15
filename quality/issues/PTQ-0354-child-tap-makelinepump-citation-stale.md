---
id: PTQ-0354
title: child-tap.ts cites production-subagent-host.ts:328-360 for the makeLinePump fan-out Set, but that range now lands entirely inside the unrelated killChildTree function
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/execution-status/child-tap.ts:70-73
  - src/extension/production-subagent-host.ts:284-289
  - src/extension/production-subagent-host.ts:315-328
  - src/extension/production-subagent-host.ts:365-366
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260915044704
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-15
---

# child-tap.ts cites production-subagent-host.ts:328-360 for the makeLinePump fan-out Set, but that range now lands entirely inside the unrelated killChildTree function

## Observation
`child-tap.ts`'s doc comment on `attachChildActivityTap` cites
`production-subagent-host.ts:328-360` as the location of "the makeLinePump
fan-out Set" that `child.onStdoutLine` is drawn from. In the current tree,
lines 328-360 of `production-subagent-host.ts` fall entirely inside
`killChildTree`, a process-kill helper with no relationship to the line pump
or its listener `Set`. The actual `makeLinePump` function (which declares the
fan-out `Set`) is defined at lines 284-313, and its two call sites
(`onStdoutLine`/`onStderrLine`) are at lines 365-366.

## Evidence
`src/extension/execution-status/child-tap.ts:70-73` — the citation:
```ts
/** Attach the second stdout consumer beside the envelope scan (EXST-5).
 *  `child.onStdoutLine` is the makeLinePump fan-out Set
 *  (production-subagent-host.ts:328-360); the drive's own listener
 *  (subagent-json-driver.ts:162) is untouched. Returns the detach handle. */
```

`src/extension/production-subagent-host.ts:284-289` — where `makeLinePump`
and its fan-out `Set` actually live today:
```ts
function makeLinePump(
  source: { on(event: "data", listener: (chunk: unknown) => void): void } | null,
): (listener: (line: string) => void) => () => void {
  let buffer = "";
  const listeners = new Set<(line: string) => void>();
  source?.on("data", (chunk: unknown) => {
```

`src/extension/production-subagent-host.ts:315-328` — what the cited
`328-360` range actually falls inside today (the `killChildTree` doc comment
and its opening lines; line 328 is inside this function's body, four lines
past its signature):
```ts
/**
 * Platform-branched process-tree kill for `child`: `taskkill /PID <pid> /T
 * /F` on Windows (no shell, no POSIX signal), `SIGKILL` elsewhere — always
 * followed by destroying the stdio pipes so a `'close'` that would otherwise
 * wait on a stdout EOF that never arrives still fires deterministically
 * (PIC-65 teardown budget).
 */
function killChildTree(child: NodeChildLike): void {
  const pid = child.pid;
  // PIC-65 teardown-budget precedent: a killed child whose stdout never
  // reaches EOF (e.g. a grandchild inherited the stdout pipe on POSIX) would
  // keep the child `'close'` event from firing and hang the drive. Destroy
  // our end of the stdio pipes on the kill path so they reach EOF and
  // `'close'` fires deterministically — the bounded fallback that keeps a
  // killed child from wedging the drive.
```

`src/extension/production-subagent-host.ts:365-366` — the actual
`onStdoutLine`/`onStderrLine` call sites `child-tap.ts`'s comment describes:
```ts
  const onStdoutLine = makeLinePump(child.stdout);
  const onStderrLine = makeLinePump(child.stderr);
```

## Why this is a problem
The citation names a specific line range as the location of the fan-out
mechanism `attachChildActivityTap` attaches to, so a reader following it to
verify the claim lands inside `killChildTree` — an unrelated process-kill
helper — instead of `makeLinePump`. Git history shows the citation was
accurate when authored: at commit `1dad42ac` (the commit that introduced this
comment), `makeLinePump` was declared inline inside `adaptChild` starting at
line 328, with its two call sites at lines 359-360, exactly matching
"328-360". Commit `9e79cb54` (a later D9 fix hoisting `makeLinePump` out of
`adaptChild` into its own top-level function, moving it earlier in the file)
shifted every subsequent line, including `killChildTree`'s, into the range
the comment still cites — without the comment being updated.

## Suggested direction (non-binding, optional)
Update the citation to the current location of the fan-out mechanism —
`production-subagent-host.ts:284-313` for `makeLinePump`'s definition and/or
`:365-366` for the `onStdoutLine`/`onStderrLine` call sites — in place of
`328-360`.

## False-positive check
- Read the current `production-subagent-host.ts` at lines 280-370 in full and
  confirmed `makeLinePump` spans 284-313, `killChildTree` spans 315(doc)/322-357,
  and the `onStdoutLine`/`onStderrLine` assignments are at 365-366 — none of
  which overlaps the cited 328-360 range except by falling inside
  `killChildTree`.
- Ran `git log -S"function makeLinePump(" --oneline -- src/extension/production-subagent-host.ts` → commit `9e79cb54` ("quality: qw20260914091051 fix d9/...") is where `makeLinePump` became a module-level function; ran `git show 1dad42ac:src/extension/production-subagent-host.ts | grep -n "makeLinePump\|^}"` to confirm that at the child-tap.ts comment's authorship commit (`git log -S"328-360" --oneline -- src/extension/execution-status/child-tap.ts` → `1dad42ac`), `makeLinePump` was an inline `const` at line 328 with its two calls at lines 359-360 — the citation was correct at authorship and drifted only after the later hoist.
- Ran `grep -noE "[a-zA-Z_-]+\.ts:[0-9]+(-[0-9]+)?" ` across all eleven briefed files: `child-tap.ts` is the only file in scope carrying a same-repo `.ts:<line>` cross-reference (two of them); the sibling citation (`subagent-json-driver.ts:162`) was checked separately and still lands inside the drive's own `onStdoutLine` listener registration, so it is not included in this finding.
- Checked `quality/issues/`, `quality/resolved/`, and the wave's do-not-refile list for any prior filing on this citation: no match. A prior D2 wave (`qw20260913183958`) logged an unconfirmed draft titled `child-tap-line-citations-drifted` that was never persisted (no corresponding file exists in `quality/intake/`, `quality/issues/`, or `quality/resolved/`), so this is not a re-filing.
- This is a citation-accuracy claim, not a deadness claim: `attachChildActivityTap`, `makeLinePump`, and `killChildTree` are all live production code.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — excerpts byte-match at 70-73/284-289/315-328 (366-367 call sites, 1-line drift tolerated) and git -S independently reproduces the drift: 1dad42ac authored "328-360" matching makeLinePump's then-inline location (confirmed via git show), 9e79cb54 (PTQ-0323's ratified hoist, touching only production-subagent-host.ts) shifted killChildTree into that range without child-tap.ts's comment being updated (triage: claude-opus-5)
