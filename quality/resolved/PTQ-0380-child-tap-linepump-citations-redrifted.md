---
id: PTQ-0380
title: child-tap.ts's makeLinePump/onStdoutLine line citations, corrected once by PTQ-0354, now point at different wrong lines after later unrelated edits
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/execution-status/child-tap.ts:75-78
  - src/extension/production-subagent-host.ts:284-292
  - src/extension/production-subagent-host.ts:347-352
  - src/extension/production-subagent-host.ts:429-430
  - src/runtime/subagent-json-driver.ts:172
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916144930
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# child-tap.ts's makeLinePump/onStdoutLine line citations, corrected once by PTQ-0354, now point at different wrong lines after later unrelated edits

## Observation
`child-tap.ts`'s doc comment on `attachChildActivityTap` cites
`production-subagent-host.ts:284-313` for "the makeLinePump fan-out Set" and
`subagent-json-driver.ts:162` for "the drive's own listener". In the current
tree, lines 284-313 of `production-subagent-host.ts` fall inside the
unrelated doc comment for `createProductionEnvelopeWriter`/
`defaultStdoutFdWrite` (the child-side envelope writer); `makeLinePump` is
now defined starting at line 347, and its two call sites are at lines
429-430. Line 162 of `subagent-json-driver.ts` falls inside the unrelated
`settle` callback; the drive's own `child.onStdoutLine` registration is now
at line 172.

## Evidence
`src/extension/execution-status/child-tap.ts:75-78` — the citation as it
reads today:
```ts
/** Attach the second stdout consumer beside the envelope scan (EXST-5).
 *  `child.onStdoutLine` is the makeLinePump fan-out Set
 *  (production-subagent-host.ts:284-313); the drive's own listener
 *  (subagent-json-driver.ts:162) is untouched. Returns the detach handle. */
```

`src/extension/production-subagent-host.ts:284-292` — the start of what
"284-313" points at today (part of the `createProductionEnvelopeWriter` WHY
comment, no relation to `makeLinePump` or a fan-out `Set`):
```ts
 *
 * WHY fd 1 directly (not `process.stdout.write`): in `--mode json` / `-p` / rpc
 * Pi calls `takeOverStdout()` (core/output-guard.js, from main.js) at startup,
 * which REASSIGNS `process.stdout.write` to route to STDERR so stray extension
 * stdout cannot corrupt the event channel. Extension code loads AFTER that
 * takeover, so a `process.stdout.write(line)` here would land on stderr and the
 * envelope would NEVER reach the parent's stdout scan (the child's fd-1 pipe the
 * parent's `onStdoutLine` reader pumps) — a latent 0.9.0 bug the RFC-0006
 * prototype exposed. `fs.writeSync(1, line)` writes the file descriptor directly,
```

`src/extension/production-subagent-host.ts:347-352` — where `makeLinePump`
and its fan-out `Set` actually live today:
```ts
function makeLinePump(
  source: { on(event: "data", listener: (chunk: unknown) => void): void } | null,
): (listener: (line: string) => void) => () => void {
  let buffer = "";
  const listeners = new Set<(line: string) => void>();
  source?.on("data", (chunk: unknown) => {
```

`src/extension/production-subagent-host.ts:429-430` — the actual
`onStdoutLine`/`onStderrLine` call sites:
```ts
  const onStdoutLine = makeLinePump(child.stdout);
  const onStderrLine = makeLinePump(child.stderr);
```

`src/runtime/subagent-json-driver.ts:172` — the drive's own `onStdoutLine`
registration today (line 162 is four lines into the unrelated `settle`
closure a few lines above it):
```ts
    detachStdout = child.onStdoutLine((line) => {
```

## Why this is a problem
A reader who follows either cited line range today lands inside an unrelated
mechanism (a stdout-write-target explainer, or a settle callback) instead of
the fan-out `Set`/listener the comment describes. This exact citation was
already found stale once and fixed: `git show 9828d0ec` (2026-09-15, PTQ-0354's
fix) changed the comment's `production-subagent-host.ts` citation from
`328-360` to `284-313`, matching `makeLinePump`'s location at that time; the
`subagent-json-driver.ts:162` half was independently verified accurate in
that same fix's own false-positive check. Since then, two feature commits —
`4ae9b29c` and `70936846` (RFC 0012 steps 2 and 4) — added code to
`production-subagent-host.ts` ahead of `makeLinePump`, and `89faa7c5` (RFC
0012 step 7) added code to `subagent-json-driver.ts` ahead of its
`onStdoutLine` registration, shifting both targets again without anyone
touching this comment (the most recent commit to touch this file,
`81f80276`, edited a different part of the same function — hoisting the PIC-74
acceptance state into its own closure — and left lines 75-78 untouched).

## Suggested direction
Update the citation to `production-subagent-host.ts:347-373` or thereabouts
(or `:429-430` for the call sites) and `subagent-json-driver.ts:172`,
matching current line numbers.

## False-positive check
- Read `production-subagent-host.ts` at lines 280-370 and 425-432 in full and
  confirmed `makeLinePump` now spans roughly 347-373, the cited 284-313
  range falls inside `createProductionEnvelopeWriter`'s doc comment and
  `defaultStdoutFdWrite`, and the two call sites are at 429-430.
- Read `subagent-json-driver.ts` at lines 155-175 and confirmed line 162
  falls inside the `settle` callback body (`detachStdout(); detachStderr();
  resolve(result);`), while the actual `child.onStdoutLine(...)` registration
  is at line 172.
- Ran `git show 9828d0ec -- src/extension/execution-status/child-tap.ts` and
  confirmed it is the commit that last edited this exact comment, changing
  "328-360" to "284-313" (the fix PTQ-0354 records).
- Ran `git log --oneline -- src/extension/production-subagent-host.ts` and
  `git log --oneline -- src/runtime/subagent-json-driver.ts`: both show
  feature commits (`4ae9b29c`, `70936846`, `89faa7c5`) landing after
  `9828d0ec` and before today, each adding code ahead of the cited
  definitions — the mechanism by which the fixed citation drifted wrong
  again.
- Ran `git show 81f80276 -- src/extension/execution-status/child-tap.ts` (the
  most recent commit touching this file, this morning's D9 fix) and confirmed
  its diff touches only `attachStdoutTap`'s internal body (extracting
  `createProgressEnvelopeDecoder`), never lines 75-78.
- Checked `quality/issues/`, `quality/resolved/`, and `quality/intake/`: only
  `PTQ-0354-child-tap-makelinepump-citation-stale.md` (status: fixed) exists
  for this comment, and its own excerpts cite the pre-fix `328-360` text and
  a since-superseded `284-313`/`162` "corrected" state — distinct from the
  current, independently-re-drifted `347-373`/`429-430`/`172` facts cited
  here. A prior wave's own review log (`qw20260916045442`, D2 shard-01 entry)
  independently rediscovered this exact re-drift, named the same three
  commits, and recorded it as lost to a tool outage before it could be
  written to disk; no PTQ number was ever minted for it.
- Not a deadness claim: `attachChildActivityTap`, `makeLinePump`, and the
  drive's own `onStdoutLine` listener are all live production code.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all 5 excerpts byte-match today (75-78, 284-292, 347-352, 429-430, 172) and git independently reproduces the mechanism (9828d0ec's 328-360→284-313 fix, 4ae9b29c/70936846 shifting makeLinePump 284→347, 89faa7c5 shifting onStdoutLine 159→172, 81f80276 touching only attachStdoutTap); REVIEW_LOG.md corroborates both the lost qw20260916045442 rediscovery and this wave's filing (triage: claude-opus-5)
