---
id: pending
title: cancellation-core's header claims ownership of the tool-call late-settlement discard and tool-exposed forwarding without the test-only disclosure its sibling swallowing-handler section carries
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/cancellation-core.ts:3-17
  - src/runtime/cancellation-core.ts:143-154
  - src/runtime/cancellation-core.ts:188-252
  - src/runtime/cancellation-core.ts:258-266
sites: 3
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# cancellation-core's header claims ownership of the tool-call late-settlement discard and tool-exposed forwarding without the test-only disclosure its sibling swallowing-handler section carries

## Observation
`cancellation-core.ts`'s module header states, with no qualification, that the
module "owns" the tool-exposed signal forwarding and "the tool-call
late-settlement discard rules (CNCL-1/2/3)" among the behaviours it "fills in."
Neither `forwardToolExposedCancel` nor `routeToolCallLateSettlement` (and its
`ToolCallSettlement` / `ToolCallCancellationGuard` / `ToolCallSideChannels` /
`ToolCallLateDisposition` type family) has any caller in `src/`, `extensions/`,
or `tools/` — only `tests/cancellation-core.test.ts` and
`tests/no-rollback.test.ts` import them. A few lines below, the file's OWN
"Swallowing-handler" section carries an explicit disclosure for the identical
situation: "This section is the seam's generic form, witnessed by the
cancellation-core tests; no production module imports it," naming the real
per-site owners. The CNCL-1/2/3 section and `forwardToolExposedCancel` receive
no such disclosure anywhere in the file.

## Evidence
src/runtime/cancellation-core.ts:3-10 — the header's unqualified ownership claim:
```ts
// This module owns the `thetaAbort` controller and the cancellation contract
// (cancellation.md): forwarding Pi's per-handler `ctx.signal`, the tool-exposed
// `signal`, and the parent-`invoke` signal into `thetaAbort` (never `ctx.signal`
// directly); abort-reason propagation (synthesised for `agent_end`); downward-
// only propagation; the tool-call late-settlement discard rules (CNCL-1/2/3);
// the race semantics against a completed `Ok` (CNCL-5) and a tail abort
// (CNCL-6); and the swallowing-handler three-side-channel suppression at the
// `Checkpoint`-seam substrate.
```

src/runtime/cancellation-core.ts:143-154 — `forwardToolExposedCancel`, no
production-reachability caveat:
```ts
/**
 * Tool-exposed entry — a theta registered into another theta's `tools:`
 * (cancellation.md §Forwarding into `thetaAbort`). Wire the `signal` passed to
 * `execute(...)` so that `signal.aborted` triggers `thetaAbort.abort(signal.reason)`
 * via a one-shot listener (CNCL-4 reason identity).
 */
export function forwardToolExposedCancel(
  _thetaAbort: AbortController,
  _signal: AbortSignal,
): () => void {
  return forwardSignalReason(_thetaAbort, _signal);
}
```

src/runtime/cancellation-core.ts:209-222 — the CNCL-1/2/3 side-channel
interface, presented as the live contract with no test-only caveat:
```ts
/**
 * The three coupled channels a late tool-call settlement could reach. Once
 * cancellation has surfaced, all three MUST stay silent (CNCL-1/2/3):
 * `rebindCallSite` (clause (a) — no rebind), `emitErr` (clause (b) — no second
 * `Err`), and `emitRuntimeEvent` (clause (c) — no second `RuntimeEvent`).
 */
export interface ToolCallSideChannels {
  /** Bind the tool call site to a value (must NOT fire post-cancel — CNCL-1). */
  readonly rebindCallSite: (value: unknown) => void;
  /** Emit an `Err` for this invocation (must NOT fire a second time — CNCL-2). */
  readonly emitErr: (error: QueryError) => void;
  /** Emit a `RuntimeEvent` (must NOT fire a second time — CNCL-3). */
  readonly emitRuntimeEvent: (event: RuntimeEvent) => void;
}
```

src/runtime/cancellation-core.ts:258-266 — the immediately-following sibling
section's explicit disclosure, absent from the two locations above:
```ts
/**
 * The settlement of an abandonable Pi-returned Promise the runtime might drop
 * under cancellation. This section is the seam's generic form, witnessed by the
 * cancellation-core tests; no production module imports it. The owning sites
 * that production wires (`V14f`, `V13f`, `V15h`) each carry their own per-site
 * attach + route pair (`tool-call-swallowing-handler.ts`,
 * `query-swallowing-handler.ts`, `invoke-swallowing-handler.ts`) rather than
 * routing through this one.
 */
```

## Why this is a problem
The header (lines 3-17) is the file's own inventory of what it "owns" /
"fills in," stated as flatly as the swallowing-handler mechanism it sits
beside — but only the swallowing-handler mechanism discloses that production
does not route through it. Searching every production directory
(`grep -rln "forwardToolExposedCancel\|routeToolCallLateSettlement" src
extensions tools`) returns only `src/runtime/cancellation-core.ts` itself;
every other hit is in `tests/cancellation-core.test.ts` or
`tests/no-rollback.test.ts`. A reader who trusts the header's unqualified
"owns" / "fills in" language for the tool-exposed-cancel forwarding and the
CNCL-1/2/3 discard has no way to learn — from this file — that these two
exports are, like the swallowing-handler section three lines later, a
test-witnessed generic form rather than the code path a tool-call actually
runs through. The same file applies the disclosure inconsistently to two
structurally identical situations.

## Suggested direction (non-binding, optional)
Add the same "generic form, witnessed by the cancellation-core tests; no
production module imports it" style disclosure (naming the real per-site
owner, if one exists) to the `forwardToolExposedCancel` doc comment and to the
CNCL-1/2/3 section's leading comment, or soften the header's "owns" / "fills
in" claim to scope it to the seam-test level for these two items; comment-only.

## False-positive check
- `grep -rn "forwardToolExposedCancel" --include=*.ts .` (excluding `dist/`,
  which is build output): hits only in `src/runtime/cancellation-core.ts`
  (definition) and `tests/cancellation-core.test.ts` (3 call sites) — no
  hit in `src/extension`, `src/parser`, `src/runtime` (any other file), or
  `extensions/`, `tools/`.
- `grep -rn "routeToolCallLateSettlement\|ToolCallSideChannels\|ToolCallCancellationGuard\|ToolCallSettlement\b\|ToolCallLateDisposition" --include=*.ts .`
  (excluding `dist/`): hits only in `src/runtime/cancellation-core.ts`
  (definitions) and `tests/cancellation-core.test.ts` /
  `tests/no-rollback.test.ts` (construction + call sites) — no production hit.
- Tests-are-legitimate-callers rule: this finding does NOT claim either export
  is dead code — both are witnessed by `tests/cancellation-core.test.ts` and
  (the CNCL-1/2/3 family) also by `tests/no-rollback.test.ts`, which this
  repository treats as a legitimate, deliberate caller. The claim is narrower:
  the header's disclosure of that fact is present for one sibling mechanism
  (swallowing-handler, :258-266) and absent for these two, which is a prose
  inconsistency within the same file, not a deadness claim.
- Contrast check: confirmed the swallowing-handler doc comment at :258-266
  names three concrete per-site production owners
  (`tool-call-swallowing-handler.ts`, `query-swallowing-handler.ts`,
  `invoke-swallowing-handler.ts`); `grep -n "no production module imports"
  src/runtime/cancellation-core.ts` returns exactly one hit (:260), confirming
  the disclosure appears nowhere else in the file.
- Duplicate check: `grep -rl "cancellation-core.ts" quality/intake/ quality/resolved/`
  turned up no existing finding about this header/disclosure asymmetry; the
  already-filed/resolved list for this wave and prior waves was scanned by
  filename for "cancellation" and "swallowing" and no match was found.

## Triage
