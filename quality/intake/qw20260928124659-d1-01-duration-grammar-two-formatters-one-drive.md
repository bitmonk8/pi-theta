---
id: pending
title: The same drive's elapsed time is rendered by two different duration grammars — render/format.ts formatDuration on the live card and entry-channel.ts formatDurationMs on the summary row
lens: D1
status: intake
verdict: pending
locations:
  - src/extension/execution-status/render/format.ts:40-58
  - src/extension/execution-status/entry-channel.ts:240-252
  - src/extension/execution-status/render/card-lines.ts:294-300
  - src/extension/execution-status/entry-channel.ts:301-302
  - src/extension/execution-status/entry-channel.ts:329-331
sites: 5
fix_scope: module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The same drive's elapsed time is rendered by two different duration grammars — render/format.ts formatDuration on the live card and entry-channel.ts formatDurationMs on the summary row

## Observation
The execution-status module contains two millisecond→compact-duration formatters. `render/format.ts` exports `formatDuration`, whose header calls it "the shared elapsed/age grammar (EXST-8)" and whose module header says it moved VERBATIM from the footer sink so the card would not "re-derive (or silently drift)" the grammar. `entry-channel.ts` declares a module-private `formatDurationMs` with a different algorithm. The live `theta-run` card header renders `nowMs - startedAtMs` through `formatDuration` (card-lines.ts:297); the durable `theta-run-summary` row for the SAME drive renders `elapsedMs` through `formatDurationMs` (entry-channel.ts:302). The two grammars produce different strings for the same input across most of the ≥ 30 s range the summary is gated to.

## Evidence

Way A — `src/extension/execution-status/render/format.ts:40-58` (in scope):
```ts
/**
 * The shared elapsed/age grammar (EXST-8): `<n>s` under a minute,
 * `<m>m[<s>s]` under an hour (the seconds token omitted when it is zero), and
 * `<h>h<mm>m` above, with zero-padded minutes.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${totalMinutes}m` : `${totalMinutes}m${seconds}s`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}m`;
}
```

The module header's stated intent — `src/extension/execution-status/render/format.ts:7-11`:
```ts
// card's own grammar reuses exactly these pieces: the elapsed/age duration
// grammar, the `base(file)` theta-stem site token, and the class-2
// `✎ <message>` author segment. They moved here VERBATIM so the retirement
// deleted the dead sinks without re-deriving (or silently drifting) the
// rendered grammar the card inherited from them.
```

Way B — `src/extension/execution-status/entry-channel.ts:240-252`:
```ts
/** Elapsed ms → compact duration (`842ms`, `41s`, `4m32s`). */
function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "?";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}
```

Consumer of Way A for the drive's elapsed — `src/extension/execution-status/render/card-lines.ts:294-300`:
```ts
  // Header: `⟳ /<name> · <elapsed> · cp <n> · iters <n> · <k> children`.
  const header =
    `${RUN_CARD_HEADER_GLYPH} /${model.theta}` +
    ` · ${formatDuration(model.nowMs - model.startedAtMs)}` +
    ` · cp ${formatCount(model.counters.checkpoints)}` +
    ` · iters ${formatCount(model.counters.loopIters)}` +
    ` · ${model.activeChildren} children`;
```

Consumers of Way B for the same drive's elapsed and its profile dwell — `src/extension/execution-status/entry-channel.ts:301-302` and `:329-331`:
```ts
    const elapsed =
      typeof data?.elapsedMs === "number" ? formatDurationMs(data.elapsedMs) : "?";
```
```ts
      lines.push(
        `  ${ramp} ${file}:${line} · ${formatDurationMs(dwellMs)} · ${hits} hits · ${kind}`,
      );
```

Definition/call census — command: `grep -rn "formatDurationMs\|formatDuration\b" src/ tests/ tools/ --include=*.ts --include=*.mjs` — 11 hits (all pasted):
```
src/extension/execution-status/entry-channel.ts:241:function formatDurationMs(ms: number): string {
src/extension/execution-status/entry-channel.ts:302:      typeof data?.elapsedMs === "number" ? formatDurationMs(data.elapsedMs) : "?";
src/extension/execution-status/entry-channel.ts:330:        `  ${ramp} ${file}:${line} · ${formatDurationMs(dwellMs)} · ${hits} hits · ${kind}`,
src/extension/execution-status/render/card-lines.ts:22:import { formatDuration, renderAuthorMessageSegment } from "./format";
src/extension/execution-status/render/card-lines.ts:245:  const elapsed = formatDuration(nowMs - child.startedAtMs);
src/extension/execution-status/render/card-lines.ts:297:    ` · ${formatDuration(model.nowMs - model.startedAtMs)}` +
src/extension/execution-status/render/card-lines.ts:441:    const line = `    ${glyph} ${child.name}${scope}   ${formatDuration(elapsedEnd - child.startedAtMs)}  ${status}${crossRef}`;
src/extension/execution-status/render/format.ts:45:export function formatDuration(ms: number): string {
tests/execution-status-bus.test.ts:18:import { formatDuration } from "../src/extension/execution-status/render/format";
tests/execution-status-bus.test.ts:526:    // (`render/format.ts` `formatDuration`, D6: the footer's header renderer
tests/execution-status-bus.test.ts:532:      return formatDuration(render.nowMs - node.startedAtMs);
```
Counted both ways: exactly 2 definitions; Way A has 3 production call sites (card-lines.ts:245, :297, :441) + 1 test import; Way B has 2 production call sites (entry-channel.ts:302, :330) and no test caller by name (it is module-private).

Demonstrated divergence — traced by hand against both bodies above (the arithmetic is the functions' own; command used to confirm: a `node -e` re-implementation of both bodies verbatim printed these pairs):
```
35700 ms   format.ts: 35s    | entry-channel.ts: 36s
245000 ms  format.ts: 4m5s   | entry-channel.ts: 4m05s
240000 ms  format.ts: 4m     | entry-channel.ts: 4m00s
3720000 ms format.ts: 1h02m  | entry-channel.ts: 62m00s
5400000 ms format.ts: 1h30m  | entry-channel.ts: 90m00s
```
Way A floors seconds, omits a zero seconds token, does not zero-pad seconds, and has an hours arm; Way B rounds seconds, always emits zero-padded seconds, has no hours arm, and adds an `ms` arm and a `?` arm neither reachable from the card.

Both grammars are pinned by tests on the one input where they coincide — command: `grep -rn "4m32s" tests/ docs/ --include=*.ts --include=*.md` — 3 hits (all pasted):
```
tests/execution-status-card-lines.test.ts:162:      `${RUN_CARD_HEADER_GLYPH} /quality-loop · 4m32s · cp 1.2k · iters 38 · 3 children`,
tests/execution-status-run-card.test.ts:207:      "theta /quality-loop ok · 4m32s · cp 12 · iters 38 · 3 children",
docs/rfcs/0015-theta-run-card.md:54:⟳ /quality-loop · 4m32s · cp 1.2k · iters 38 · 3 children      ← header
```
Both test rows assert the identical token `4m32s` for the header of the live card and for the header of the summary of the same fixture drive (`tests/execution-status-run-card.test.ts:87` `elapsedMs: 272_000`), i.e. the tests treat the two rows as sharing one grammar; 272 000 ms is one of the inputs on which the two implementations happen to agree.

History (drift already present at birth of the second grammar): `git log --oneline -S"formatDurationMs" -- src/` → `97bbcdb5 feat(rfc-0015): D3 run-card entry channel — v0.488.3`; at that commit `git show 97bbcdb5:src/extension/execution-status/footer-sink.ts | grep -n "export function formatDuration"` → `63:export function formatDuration(ms: number): string {` — the exported footer grammar already existed in the same module when D3 wrote the second one. `git log --oneline --follow -- src/extension/execution-status/render/format.ts` → `bde73af5 feat(rfc-0015): D6 supersession — footer/widget retired …` moved Way A into `format.ts` as the declared shared grammar without folding Way B.

Spec check: `docs/spec_topics/pi-integration-contract/theta-run-entries.md:23-34` (PIC-76) pins the `ThetaRunSummary` payload (`elapsedMs: number`) and the outcome vocabulary but not the rendered duration spelling; `grep -n "4m32s\|842ms\|formatDuration\|elapsed grammar\|<n>s" docs/rfcs/0015-theta-run-card.md docs/spec_topics/execution-status.md` → 1 hit, `docs/rfcs/0015-theta-run-card.md:54` (the card header example above). No written rule selects either grammar for the summary row.

Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited below.

## Why this is a problem
One operator-facing quantity — how long this drive ran — is spelled two ways in the same transcript: the live card header (Way A) says `4m` / `4m5s` / `1h02m` while the `theta-run-summary` row appended for the identical drive (Way B) says `4m00s` / `4m05s` / `62m00s`. For every drive over an hour the two rows do not even share a unit scheme. The module's own header (format.ts:7-11) declares the elapsed/age grammar was centralised precisely so it would not "silently drift", and the tests pin both rows to the same `4m32s` token, so a maintainer reading either the header or the tests is told there is one grammar; a change to `formatDuration` (e.g. adding a days arm, or changing the hours threshold) then reaches the card and not the summary, and nothing red appears because the pinned fixture is on the agreement set. The `HeatEntrySnapshot.dwellMs` profile lines (entry-channel.ts:330) are rendered through Way B as well, so the summary's per-line dwell and the card's child-row ages (card-lines.ts:245/:441) also disagree in spelling for the same magnitudes.

## Suggested direction (non-binding, optional)
Unproven hypothesis: `formatDuration` in `render/format.ts` is already the declared shared grammar and the summary's `elapsedMs`/`dwellMs` values are non-negative finite numbers by construction (run-card.ts computes them from the monotonic clock), so the summary renderer could consume the shared export, with the `?` arm kept only as its existing defensive `typeof` fallback; whether the sub-second `ms` arm is wanted for dwell rows is a separate question this filing does not decide.

## False-positive check
- Clone-map check: the injected clone map lists no group for `render/format.ts` or `render/card-lines.ts` and none for `entry-channel.ts` in this shard's map; the two bodies differ in arithmetic (floor vs round), arm set (hours vs ms/`?`), and token shape (padded vs unpadded seconds), so this is not a token-level copy — it is two solutions to one problem.
- D9-affinity check: not a wrong-home claim — both functions are already in the execution-status module; the finding is that two exist, not where either lives.
- D2-deadness check: both sides live — `formatDuration` has 3 production call sites in card-lines.ts (:245, :297, :441) and `formatDurationMs` has 2 in entry-channel.ts (:302, :330), per the pasted census.
- Prior-filing check: `grep -rln "formatDurationMs" quality/` → hits only under `quality/bench/` (benchmark reports, not filings); no `quality/issues/`, `quality/resolved/`, or `quality/intake/` file names either function. Resolved PTQ-1260 (run-card controller decomposition) and PTQ-1256 (double snapshot) were opened and neither touches duration rendering.
- Spec-pin check: PIC-76 pins the payload, not the spelling (see Evidence); EXST-8's grammar sentence is Way A's own header, not a spec clause selecting Way B.
- Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above.
- Routing note: benchmark reports under `quality/bench/` disagree among themselves whether this shape is D4-parallel or D8-reimplemented; it is filed here as D1 divergent-solutions because the two bodies share no tokens and the cost is the divergence of two independently-designed grammars for one quantity. Triage owns the lens.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Both ways match at format.ts:40-58 and entry-channel.ts:240-252; the consumers at card-lines.ts:245/:297/:441 and entry-channel.ts:302/:330 match. The census grep reproduces all 11 lines, the 4m32s grep reproduces its 3 hits, and the git history (97bbcdb5, footer-sink.ts:63, bde73af5) reproduces. clone-scan map on format.ts reports no clone groups, so this is not D4's. A node re-run of both bodies gives 35s/36s, 4m5s/4m05s, 4m/4m00s, 1h02m/62m00s and 1h30m/90m00s, and they agree only at 272000 (4m32s), which is the value both tests pin. The cost is concrete: one drive's elapsed time is spelled two ways, and the header's anti-drift intent (format.ts:7-11) is contradicted. No PTQ tracks this. Same-wave sibling intake qw20260928124659-d1-01-summary-entry-duration-grammar-diverges-from-card.md has the same root cause, and this file sorts first, so it is the survivor (triage: claude-opus-5-5)
