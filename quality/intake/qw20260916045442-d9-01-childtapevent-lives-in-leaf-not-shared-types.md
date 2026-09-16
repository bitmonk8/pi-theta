---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: types.ts imports ChildTapEvent back from child-tap.ts, the one leaf file its own header says depends on types.ts rather than the reverse
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/execution-status/child-tap.ts:43-55
  - src/extension/execution-status/types.ts:1-10
  - src/extension/execution-status/types.ts:192-194
  - src/extension/execution-status/bus.ts:42-43
  - src/extension/execution-status/bus.ts:283-296
sites: 1                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: misplacement        # D9 only: breakdown | misplacement | husk
wave: qw20260916045442
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-16
---

# types.ts imports ChildTapEvent back from child-tap.ts, the one leaf file its own header says depends on types.ts rather than the reverse

## Observation
`types.ts`'s header states its role for the whole `execution-status/` directory: "the shared, closed type surface for the execution-status bus, its producer payloads, sink contract, and the frozen caps/tuning constants. No behaviour lives here; `bus.ts`, `checkpoint-decorator.ts`, and `child-tap.ts` are the behavioural leaves." Every other producer-payload / model-snapshot shape in the subsystem is declared inside `types.ts` itself: `EffectRef` (69-73), `ChildActivity` (75-81), `ProgressAuthorMessage` (88-94), `ProgressMilestone` (97-100), `RunningLane` (102-105), `LaneSetSnapshot` (107-114), `InvocationNodeSnapshot` (116-134), `ExecutionStatusSnapshot` (136-140) — 8 declarations. `ChildTapEvent`, the discriminated-union shape the child-activity stdout tap produces for the bus (directly comparable in kind to `ProgressAuthorMessage`), is instead declared in `child-tap.ts` — one of the three named "behavioural leaves" — and `types.ts` must import it back from that leaf to type its own central `ExecutionStatusBus.childEvent` interface member. `bus.ts` separately imports the same type from the same leaf to type and pattern-match on it in `ExecutionStatusBusImpl.childEvent`.

## Evidence
`src/extension/execution-status/types.ts:1-10` — the stated one-directional architecture, immediately followed by the import that contradicts it:
```ts
// RFC 0010 (execution-status.md, EXST-1..12) — the shared, closed type surface
// for the execution-status bus, its producer payloads, sink contract, and the
// frozen caps/tuning constants. No behaviour lives here; `bus.ts`,
// `checkpoint-decorator.ts`, and `child-tap.ts` are the behavioural leaves.
//
// Spec: docs/spec_topics/execution-status.md (EXST-1..12).

import type { CheckpointKind, CheckpointSite } from "../../seams/checkpoint";
import type { Clock } from "../../seams/clock";
import type { ChildTapEvent } from "./child-tap";
```

`src/extension/execution-status/types.ts:192-194` — the one member the import above exists to type:
```ts
  openLaneSet(invocationId: string, total: number, width: number): ParForLaneSetHandle;
  childEvent(invocationId: string, event: ChildTapEvent): void;
  /** L3 (EXST-14): one class-2 author-message publication. `invocationId`
```

`src/extension/execution-status/child-tap.ts:43-55` — the declaration itself, sitting in the leaf file rather than with its 8 siblings:
```ts
export type ChildTapEvent =
  | { readonly type: "turn_start" }
  | { readonly type: "tool_execution_start"; readonly toolName: string }
  | { readonly type: "tool_execution_end" }
  | { readonly type: "agent_end" }
  // L3 (EXST-5/EXST-15; PIC-74) — the reserved-key `theta_progress` wire line,
  // recognised in the tap's OWN parse (EXST-5).
  | { readonly type: "theta_progress"; readonly payload: ProgressAuthorMessage }
  // RFC 0012 §7: a result-channel `heartbeat` frame — liveness only. Under a
  // visible placement the child's `--mode json` stream is a TTY, so the four
  // event kinds above never arrive; the heartbeat is what keeps the node's
  // `lastEventAtMs` moving.
  | { readonly type: "heartbeat" };
```

`src/extension/execution-status/bus.ts:42-43` and `bus.ts:283-296` — the second external site, importing from the same leaf and pattern-matching on the type's own members:
```ts
import type { CheckpointKind, CheckpointSite } from "../../seams/checkpoint";
import type { ChildTapEvent } from "./child-tap";
```
```ts
  childEvent(invocationId: string, event: ChildTapEvent): void {
    try {
      const node = this.#nodes.get(invocationId);
      if (this.#disposed || node === undefined || node.endedAtMs !== undefined) {
        return;
      }
      // EXST-5 / EXST-12: only the bounded class-1 projection is folded — the
      // tap hands nothing else across the boundary.
      switch (event.type) {
        case "turn_start":
          node.childTurns += 1;
          break;
        case "tool_execution_start":
          node.childToolExecs += 1;
          node.childLastToolName = clampName(event.toolName);
```
(the `switch` continues with a `"theta_progress"` case and a `default`, three of the type's six variant tags matched in total; the other three — `tool_execution_end`, `agent_end`, `heartbeat` — fold into `default`.)

Affinity, counted both ways: in `types.ts` (the module `ChildTapEvent` does not live in), the type touches exactly 1 member — the sole `childEvent` parameter of the `ExecutionStatusBus` interface it exists to type. In `bus.ts` (also not its host), the type is imported separately and 3 of its own 6 variant tags are read directly in a `switch`. In its own host file, `child-tap.ts`, the type is read as a parameter type at 2 sites (`attachChildActivityTap`, `attachStdoutTap`) and a value of it is constructed at 6 sites (one `publish({ type: … })` per variant). Sibling pattern: `types.ts` already declares 8 other cross-file producer-payload/model-snapshot shapes (listed above by name and line range); `ChildTapEvent` is the only member of that same family declared outside `types.ts`, and `checkpoint-decorator.ts` — the third named "behavioural leaf" — declares no comparable local payload type at all (it only imports `ExecutionStatusBus` from `./types` and `Checkpoint`/`CheckpointKind`/`CheckpointSite` from `../../seams/checkpoint`), so it supplies no precedent either way for keeping a payload shape in a leaf.

## Why this is a problem
`types.ts`'s header draws a one-directional dependency shape: the "shared, closed type surface" is upstream and `bus.ts` / `checkpoint-decorator.ts` / `child-tap.ts` are downstream "behavioural leaves" that depend on it. `ChildTapEvent`'s placement inverts that one edge: the surface is not closed — to type its own `ExecutionStatusBus.childEvent` member, `types.ts` imports a type from the one leaf the header says depends on it, not the reverse. The same inversion repeats at `bus.ts`, which already imports its whole producer/model surface from `./types` (`DONE_LINGER_MS`, `MAX_LANE_SET_DEPTH`, `ChildActivity`, `ExecutionStatusBus`, `ProgressAuthorMessage`, …) and must additionally import from `./child-tap` for this one type alone — an import `bus.ts` would not need if `ChildTapEvent` sat with its 8 siblings. Neither file's comment states a reason `ChildTapEvent` is kept apart from the rest of the payload-shape family, unlike the codebase's other deliberate cross-file sharing in this same directory (e.g. `progress-tool.ts`'s `clampAuthorMessage` doc comment names both of its call sites and why they share one implementation).

## Suggested direction (non-binding, optional)
Unproven hypothesis: move the `ChildTapEvent` declaration (13 LOC, child-tap.ts:43-55) into `types.ts` beside its 8 siblings, and have `child-tap.ts` import it back from `./types` the same way it already imports `ProgressAuthorMessage` from there. `types.ts` would then drop its `./child-tap` import entirely (no other member is drawn from that file), and `bus.ts` would drop its separate `./child-tap` import for this type, reading it off the `./types` import it already has. A human confirms no other consumer depends on `ChildTapEvent` resolving from `./child-tap` specifically (2 src / 3 test importers per the structural map).

## False-positive check
Affinity counted both ways and the sibling pattern cited above (8 same-kind declarations in `types.ts`, 0 comparable ones in `child-tap.ts` besides `ChildTapEvent` itself). Grepped `ChildTapEvent` across `src/` (5 hits: the declaration plus 2 signature uses in `child-tap.ts`; 1 import plus 1 interface-member use in `types.ts`; 1 import plus 1 method-signature use in `bus.ts` — matching the structural map's 2 src importers for this declaration) and found no comment anywhere stating a reason the type is kept out of `types.ts`. Checked the third named leaf, `checkpoint-decorator.ts`: it declares no local payload type of its own, so it is neither a corroborating nor a contradicting precedent for keeping `ChildTapEvent` in a leaf. `quality/exemptions.json` (4 entries, read in full) names neither this file, `types.ts`, nor `ChildTapEvent`. Not a barrel/facade question (this is a plain type declaration, not a re-export module) and not D2 territory — the declaration is not dead; it is exactly the type both of its external sites import it for. Searched `quality/issues/`, `quality/resolved/`, and this wave's own `quality/intake/` for `ChildTapEvent` and for `"behavioural leaves"`: the only hit besides this filing is `PTQ-0369` (open, this same host file, `attachChildActivityTap`'s bundled decode/dispatch concerns) and one incidental line-range citation inside the unrelated, already-resolved `PTQ-0316` (a D4 clone finding about `ProgressAuthorMessage` reconstruction) — neither names this type's placement, so this is not a re-file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: all 5 cited locations match verbatim (types.ts:1-10 header+import, types.ts:192-194 childEvent member, child-tap.ts:43-55 declaration, bus.ts:42-43 import, bus.ts:283-296 switch), the 8 sibling declarations' exact line ranges and checkpoint-decorator.ts's zero comparable-type precedent both reproduce, quality/exemptions.json's 4 entries (read in full) name none of these hosts, and `node tools/quality/size-scan.mjs map` independently confirms ChildTapEvent (child-tap.ts:43-55, 13 LOC) carries exactly 2 src/3 test importers, matching the filing's own count and corroborating the affinity/sibling-pattern claims. Not a duplicate: PTQ-0369 is a different D9 sub-issue on the same host (attachChildActivityTap breakdown) and PTQ-0316 a different D4 issue (ProgressAuthorMessage rebuild duplication) — though the filing mislabels PTQ-0369 "open" when it is actually status:fixed/resolved. The filing's own false-positive-check grep tally is also wrong: it claims "5 hits" in src/, its own itemized list sums to 7, and my independent recount finds 9 (types.ts:10,193; bus.ts:43,283; child-tap.ts:43,81,99,183,190) — neither miscount changes the outcome. Per D9 misplacement policy, an accurate core accounting of a real header-vs-import-direction contradiction with no exemption on record caps at questionable — the move is a human design ruling, never confirmed (triage: claude-opus-5)
