---
id: PTQ-0414
title: ChildTapEvent is declared in the behavioural leaf child-tap.ts, forcing the shared type surface types.ts to import backwards from a module its own header names as downstream
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/execution-status/child-tap.ts:43-55
  - src/extension/execution-status/types.ts:10
  - src/extension/execution-status/types.ts:193
sites: 1                     # count of misplaced declarations cited
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: misplacement       # D9 only: breakdown | misplacement | husk
wave: qw20260917121953
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-17
---

# ChildTapEvent is declared in the behavioural leaf child-tap.ts, forcing the shared type surface types.ts to import backwards from a module its own header names as downstream

## Observation
`types.ts`'s header (src/extension/execution-status/types.ts:1-4) states its
role: "the shared, closed type surface for the execution-status bus, its
producer payloads, sink contract, and the frozen caps/tuning constants. No
behaviour lives here; `bus.ts`, `checkpoint-decorator.ts`, and `child-tap.ts`
are the behavioural leaves." Yet the `ChildTapEvent` payload union — a
parameter type of the `ExecutionStatusBus` interface's own `childEvent`
method (types.ts:193) — is declared inside one of those named behavioural
leaves (child-tap.ts:43-55), so the shared type surface imports it back from
the leaf (types.ts:10), inverting the dependency direction the header
declares.

## Evidence
src/extension/execution-status/types.ts:1-10 (header plus the backwards
import; re-read verbatim before filing):
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

src/extension/execution-status/child-tap.ts:43-50 (the declaration; its only
type dependency is `ProgressAuthorMessage`, itself declared in types.ts:88-94):
```ts
export type ChildTapEvent =
  | { readonly type: "turn_start" }
  | { readonly type: "tool_execution_start"; readonly toolName: string }
  | { readonly type: "tool_execution_end" }
  | { readonly type: "agent_end" }
  // L3 (EXST-5/EXST-15; PIC-74) — the reserved-key `theta_progress` wire line,
  // recognised in the tap's OWN parse (EXST-5).
  | { readonly type: "theta_progress"; readonly payload: ProgressAuthorMessage }
```

Affinity, counted both ways:
- `ChildTapEvent` touches 1 member of types.ts — `ProgressAuthorMessage`
  (child-tap.ts:50, the `theta_progress` variant's payload) — so child-tap.ts
  already imports types.ts and moving the union there costs no new edge.
- Foreign consumers: 2 src importers per the structural map (2 src / 3 tests)
  — types.ts:10/:193 (the `ExecutionStatusBus.childEvent` signature) and
  bus.ts:43/:283 (the `childEvent` implementation's `switch (event.type)`
  fold). In its own host it appears at 4 sites (child-tap.ts:43, 82, 100,
  184/191), every one a type position in a `publish` callback or decoder
  signature — the leaf constructs values of the type but declares no other
  type family.
- Sibling pattern: every other payload type the `ExecutionStatusBus`
  interface's methods name is declared in types.ts — `EffectRef` (69-73),
  `ChildActivity` (75-81), `ProgressAuthorMessage` (88-94),
  `ProgressMilestone` (97-100), `RunningLane` (102-105), `LaneSetSnapshot`
  (107-114), `InvocationNodeSnapshot` (116-134), `ExecutionStatusSnapshot`
  (136-140). `ChildTapEvent` is the sole bus-method payload type living
  outside types.ts. The other behavioural leaf named in the header,
  checkpoint-decorator.ts, declares no comparable payload type at all — it
  imports its kinds from `../../seams/checkpoint`.

## Why this is a problem
The counted affinity contradicts the module's own stated layering: the
shared, no-behaviour type surface (types.ts) is forced into an import back
from the behavioural leaf it declares downstream, creating a type-level
mutual dependency (child-tap.ts imports types.ts for
`ProgressAuthorMessage`/caps constants; types.ts imports child-tap.ts for
`ChildTapEvent`). All eight siblings-in-kind — the bus's other method-payload
types — live in types.ts, so the one exception is a placement accident, not a
pattern. This is misplacement accounting, size-independent (child-tap.ts is
band-exempt at 261 LOC; no breakdown claim is made).

## Suggested direction (non-binding, optional)
Hypothesis: move the `ChildTapEvent` union (13 LOC, with its EXST-5/EXST-15/
PIC-74 and RFC 0012 §7 comments) into types.ts beside its eight sibling
payload types, and have child-tap.ts import it back — child-tap.ts already
imports types.ts, so the cycle disappears rather than reverses. A re-export
from child-tap.ts could preserve the 3 test importers unchanged. Unproven;
the human ratifies the move.

## False-positive check
- Affinity counted both ways: 1 types.ts member touched by the declaration
  (`ProgressAuthorMessage`), 2 src importers (types.ts, bus.ts — grep
  `ChildTapEvent` across src/ shown above, 4 foreign hits at types.ts:10/193
  and bus.ts:43/283) vs 4 own-host type-position references; matches the
  structural map's 2 src / 3 test importer count exactly.
- Sibling-pattern citation: the eight types.ts payload declarations listed
  with line ranges (69-140); checkpoint-decorator.ts checked — declares no
  payload type, so child-tap.ts is the only leaf exporting one.
- Barrel/facade check (not a husk claim, checked anyway): child-tap.ts is a
  live behavioural module, not a re-export barrel; the declaration is used
  by live code in bus.ts, so no D2 deadness routing.
- Prior-filing check: an earlier identical observation
  (qw20260916045442-d9-01-childtapevent-lives-in-leaf-not-shared-types.md)
  was twice triaged "questionable — accurate accounting, move is a human
  design ruling" and then PURGED unruled by the review-state reset (commit
  53f815de, "candidates of the untrusted (session-model) passes purged") —
  it appears in no do-not-refile list (intake/issues/resolved/TRIAGE_LOG
  greps for `ChildTapEvent` return only PTQ-0369, a different, already-fixed
  breakdown finding on `attachChildActivityTap`). PTQ-0316
  (ProgressAuthorMessage rebuild, D4) is a different root cause.
- Exemptions check: quality/exemptions.json read in full — 4 entries, none
  naming child-tap.ts or types.ts.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: ChildTapEvent declared at child-tap.ts:43-55 leans on exactly 1 types.ts member (ProgressAuthorMessage, :50); foreign src consumers reproduce at types.ts:10/193 and bus.ts:43/283 with 5 own-host type-position uses (43/82/100/184/191) and 3 test files, nothing in tools/ or extensions/; types.ts:1-4 header names child-tap.ts a behavioural leaf yet :10 imports it back (type-level cycle, child-tap.ts:26-32 imports types.ts); all 8 sibling bus-method payload types re-read at types.ts:69-140, checkpoint-decorator.ts exports only a class + function; exemptions.json has no entry for either file; prior filing purged in 53f815de with no TRIAGE_LOG/issues/resolved record (PTQ-0369 is a fixed breakdown, same-wave d4-01 is a parallel-coverage root cause) — but per D9 policy the move is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-17): move the ChildTapEvent union (and its per-kind member types) from child-tap.ts into execution-status/types.ts per that file's own header contract; child-tap.ts imports it back like every other leaf. Purely mechanical; no behaviour change.
