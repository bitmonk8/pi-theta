---
id: PTQ-0323
title: adaptChild bundles stdio line-pump framing, exit-lifecycle tracking, and platform-branched process-tree kill in one 114-line function
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/production-subagent-host.ts:286-399
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-subagent-host.ts#adaptChild
d9_band: justify
wave: qw20260914060226
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-14
---

# adaptChild bundles stdio line-pump framing, exit-lifecycle tracking, and platform-branched process-tree kill in one 114-line function

## Observation
`adaptChild` (`src/extension/production-subagent-host.ts:286-399`) is 114 LOC — justify band (100-199). The containing file is 429 LOC, file-band exempt (no file-level breakdown finding applies), but `adaptChild`'s own function band is justify, independent of the file. The function's doc comment states its job as "Adapt a Node `ChildProcess` to the `SubagentChildProcess` handle." It is exported only for a test (`tests/subagent-json-driver.test.ts`, the `'close'`-not-`'exit'` ordering-contract pin); production reaches it exclusively through `createProductionSpawnFn` (0 src importers, 1 test importer per the structural map). Internally it builds three separable mechanisms: a generic stdout/stderr line-pump, exit-lifecycle tracking with late-subscriber replay, and a platform-branched process-tree kill.

## Evidence
Step inventory (phase | lines | LOC | locals read/written):

| phase | lines | LOC | locals |
|---|---|---|---|
| Line-pump construction (stdout + stderr framing) | 289-321 | 33 | `makeLinePump` (`buffer`, `listeners` per call), `onStdoutLine`, `onStderrLine` |
| Exit-lifecycle capture | 334-341 | 8 | `exitInfo`, `exitListeners` |
| `closeStdin` passthrough | 344-349 | 6 | `child.stdin` |
| `onExit` subscription + already-exited replay | 352-361 | 10 | `exitInfo`, `exitListeners` |
| Process-tree kill (platform-branched) | 362-397 | 36 | `child.pid`, `isWindows()`, `destroyPipes` |

Excerpt, the line-pump concern (lines 289-297 of 289-321):
```ts
  const makeLinePump = (
    source: { on(event: "data", listener: (chunk: unknown) => void): void } | null,
  ): ((listener: (line: string) => void) => () => void) => {
    let buffer = "";
    const listeners = new Set<(line: string) => void>();
    source?.on("data", (chunk: unknown) => {
      buffer += String(chunk);
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
```
Excerpt, the exit-lifecycle concern (lines 334-341):
```ts
  let exitInfo: ChildExitInfo | undefined;
  const exitListeners = new Set<(info: ChildExitInfo) => void>();
  child.on("close", (code, signal) => {
    exitInfo = { code, signal };
    for (const listener of [...exitListeners]) {
      listener(exitInfo);
    }
  });
```
Excerpt, the kill concern's platform branch (lines 362-376 of 362-397):
```ts
    kill: (): void => {
      const pid = child.pid;
      // PIC-65 teardown-budget precedent: a killed child whose stdout never
      // reaches EOF (e.g. a grandchild inherited the stdout pipe on POSIX) would
      // keep the child `'close'` event from firing and hang the drive. Destroy
      // our end of the stdio pipes on the kill path so they reach EOF and
      // `'close'` fires deterministically — the bounded fallback that keeps a
      // killed child from wedging the drive.
      const destroyPipes = (): void => {
        child.stdin?.destroy?.();
        child.stdout?.destroy?.();
        child.stderr?.destroy?.();
      };
      if (isWindows() && pid !== undefined) {
```

## Why this is a problem
Justify band (114 LOC): filed unless a concrete reason is on record. Reasons considered and defeated:
- Single algorithm with shared local state — no; the three concerns do not share meaningful state with each other. `makeLinePump`'s `buffer`/`listeners` are private per pump instance and touched by no other concern; `exitInfo`/`exitListeners` are private to the exit-lifecycle concern and untouched by `kill`; `kill`'s `destroyPipes` reads `child.stdin`/`stdout`/`stderr` directly, not through the line-pump's buffers. The only value all three close over is the single `child` parameter itself — one shared parameter, not the "6 or more locals threaded through every helper signature" this reason class requires.
- Closed-enumeration dispatch — the `kill` concern's own Windows/non-Windows branch is a genuine 2-arm closed set (each arm ~10-15 lines), which would justify `kill`'s own internal length in isolation, but does not justify bundling the unrelated line-pump and exit-tracking concerns into the same function.
- Data-only / grammar-production-family / generated-code — not applicable.
- Strong-only reasons are not required at justify band, and none of the concrete reasons above held.

## Suggested direction (non-binding, optional)
Seam hypotheses, unproven:
- Seam A: hoist `makeLinePump` to module scope (it already takes no closure over `child` beyond its own `source` parameter) as a standalone export, e.g. `makeLinePump(source)` (hypothesis) — reusable line-framing with no adapter-specific state.
- Seam B: extract exit-lifecycle tracking (334-341, 352-361) into a helper, e.g. `trackChildExit(child): { onExit, exitInfo }` (hypothesis), called once and its `onExit` threaded into the returned `SubagentChildProcess`.
- Seam C: extract the platform-branched `kill` (362-397) into a helper, e.g. `killChildTree(child)` (hypothesis), taking only the raw `child` handle.

## False-positive check
Band: justify (114 LOC, function line in the structural map; containing file is 429 LOC, file-band exempt, but the function's own band is independent per the bands table). Reasons-considered list above, each defeated with a line-cited count. Exemptions check: `quality/exemptions.json` has no `production-subagent-host.ts#adaptChild` entry. Generated-code check: no generation markers in the file. Spec-mirror check: PIC-59 and PIC-65 are cited for the `'close'`-vs-`'exit'` choice and the kill-path pipe-destroy fallback respectively — each governs one concern's own internal behavior, not a single closed enumeration requiring all three concerns to share one function body. Prior-rejection check: a D8 finding against this same function (`qw20260913183958-d8-02-adaptchild-hand-rolled-listener-bookkeeping.md`) was rejected as false-positive on a *replacement-mechanism* claim (that a settled Promise could stand in for `onExit`'s synchronous-vs-microtask ordering) — this finding makes no such claim; it asserts only that the three already-distinct mechanisms (line-pump, exit-tracking, kill) are laid out in one function body with no reason found to keep them there, a different root cause than the rejected D8 finding's.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — re-ran size-scan.mjs map: file 429 LOC/exempt and adaptChild 286-399/114 LOC/justify band with 0 src/1 test importer all reproduce exactly; read the full function body and confirmed the three named concerns (line-pump, exit-lifecycle capture+replay, platform-branched kill) share no locals beyond the single `child` parameter, excerpts match verbatim at the cited lines, and no defeating reason is on record (exemptions.json has no entry for this host, PIC-59/PIC-65 govern individual behaviours not one-function bundling, no reverted-split history); per D9 breakdown policy a verified accounting caps at questionable (never confirmed) — the split's shape is a human ruling (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): the two LEAF phases as one FUNCTION seam inside src/extension/production-subagent-host.ts. (1) Hoist makeLinePump to module scope as a module-private function (it closes over nothing but its source parameter) and call it from adaptChild exactly as today; (2) extract the platform-branched process-tree kill (adaptChild :362-397, 36 LOC, including its isWindows() branch and destroyPipes use) into a module-private helper killChildTree(child) (hypothesis name) that adaptChild's returned kill delegates to. The exit-lifecycle capture and onExit replay (exitInfo / exitListeners, synchronous same-stack delivery) stay inline in adaptChild - NOT extracted. Bodies moved verbatim with their comments; doc comment on each helper; identical behaviour; tsc first; report before/after LOC of adaptChild.
