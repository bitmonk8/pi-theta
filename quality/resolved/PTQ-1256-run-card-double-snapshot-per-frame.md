---
id: PTQ-1256
title: RunCardComponent.#renderLive builds two full deep-copy bus snapshots per animation frame where one suffices
lens: D8
status: fixed
verdict: confirmed
locations:
  - src/extension/execution-status/run-card-renderer.ts:336-339
  - src/extension/execution-status/run-card-renderer.ts:389-397
  - src/extension/execution-status/run-card-renderer.ts:534
  - src/extension/execution-status/bus.ts:802-814
  - src/extension/execution-status/bus.ts:858-874
sites: 3
fix_scope: localized
d8_class: heavier-than-scale
d8_host: src/extension/execution-status/run-card-renderer.ts#createRunCardController
wave: qw20260922150013
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-22
---

# RunCardComponent.#renderLive builds two full deep-copy bus snapshots per animation frame where one suffices

## Observation
`ExecutionStatusBus.snapshot()` is a full deep copy: `#snapshot` walks every
tracked node and, per node, `snapshotOfHeat` copies every heat-ring entry into
fresh objects. The live run-card render path calls it twice back-to-back in the
same synchronous frame: `#renderLive` first calls `nodeFor(...)` (which builds
snapshot #1 and `.find`s one node in it) and then, three lines later, calls
`deps.bus()!.snapshot()` again (snapshot #2) to filter children. The renderer
invocation path (`nodeFor` at line 534) builds a third full snapshot solely as
a presence check. Both `#renderLive` reads are same-tick reads of the same bus
state; the node used downstream comes from copy #1 while the children rows
come from copy #2.

## Evidence
Data scale at the call sites (`src/extension/execution-status/types.ts:20,44`):
`MAX_TRACKED_INVOCATIONS = 32` nodes, `HEAT_RING_CAPACITY = 256` heat entries
per node — one snapshot build allocates up to ~32 node objects plus up to
32 × 256 = 8192 `HeatEntrySnapshot` objects. The animation contract
(run-card-renderer.ts header, "Animation") re-renders every live card on the
EXST-6 200 ms tick via `tui.requestRender()`, and pi-tui re-invokes every entry
component's `render(width)` per pass — so each live card pays 2 full deep
copies per 200 ms frame (10 builds/sec/card) while heat is fading or a child is
running.

src/extension/execution-status/run-card-renderer.ts:336-339 — snapshot build #1
per call, discarded except for one `.find`:
```ts
  function nodeFor(invocationId: string): InvocationNodeSnapshot | undefined {
    const snapshot = deps.bus()?.snapshot();
    return snapshot?.nodes.find((node) => node.invocationId === invocationId);
  }
```

src/extension/execution-status/run-card-renderer.ts:389-397 — the second build
three lines after the first, in the same synchronous frame:
```ts
    #renderLive(width: number): string[] {
      const clock = deps.clock();
      const node = nodeFor(this.#seed.invocationId);
      if (clock === undefined || node === undefined || width <= 0) {
        // Bus evicted the node (drive over) / latches gone: static compact form.
        return this.#renderStatic(width);
      }
      const now = clock.now();
      const snapshot = deps.bus()!.snapshot();
```

src/extension/execution-status/run-card-renderer.ts:534 — a third full build
used only as a presence gate at renderer invocation:
```ts
      const node = seed !== undefined ? nodeFor(seed.invocationId) : undefined;
```

src/extension/execution-status/bus.ts:802-814 and 858-874 — the cost shape of
each build (full copy of every node and every heat entry):
```ts
  #snapshot(): ExecutionStatusSnapshot {
    const nodes: InvocationNodeSnapshot[] = [];
    for (const node of this.#nodes.values()) {
      nodes.push(snapshotOfNode(node));
    }
    ...
function snapshotOfHeat(node: NodeState): HeatSnapshot {
  const entries: HeatEntrySnapshot[] = [];
  for (const entry of node.heat.values()) {
    entries.push({ file: entry.file, line: entry.line, lastHitMs: entry.lastHitMs,
      hits: entry.hits, dwellMs: entry.dwellMs, kind: entry.kind });
  }
```

## Why this is a problem
The algorithm's per-call cost is 2 × O(nodes × heat entries) deep-copy
allocation per card per frame where the job — read one consistent view of bus
state for one render — needs exactly one build. At the pinned bounds that is up
to ~16 k object allocations per frame per card, ~80 k/sec at the 200 ms tick
with a hot heat ring, on the render path the module header itself budgets as
"zero per-frame color math" (the LUT/cache work elsewhere in the same file is
carefully amortized while this doubling is not). The doubling also splits one
logical read across two object graphs: `node` (and `heat`) come from copy #1,
`children` from copy #2 — same content today only because both reads are
synchronous on one tick, an invariant nothing states or checks.

## Suggested direction (non-binding, optional)
Unproven hypothesis: take one `snapshot()` at the top of `#renderLive`, derive
both the node (`.find`) and the children filter from it, and let the renderer
invocation's presence check reuse the same single build (or a cheaper
`has(invocationId)`-shaped read if the bus ever grows one). No behaviour named
by EXST-6/EXST-7 or RFC 0015 depends on two builds.

## False-positive check
- Re-read all cited ranges immediately before filing; excerpts verbatim.
- Checked whether the two builds could intentionally observe different states:
  both calls are synchronous within one `render(width)` invocation, no await
  or bus mutation between them — no such intent is stated in code or spec.
- Spec check: docs/spec_topics/execution-status.md EXST-6 governs render
  coalescing, not snapshot count; RFC 0015 D5's "zero per-frame color math"
  posture argues the same direction as this filing. No clause requires a
  second build — no challenges_spec.
- Exemption check: no D8 exemption on run-card-renderer.ts or
  createRunCardController; no existing PTQ names this (searched intake list
  for "snapshot" — PTQ-0682/0852 concern test doubles, not this path).
- D9 boundary: PTQ list carries no D9 breakdown filing on this host; this is a
  cost claim, not a size claim, so no cross-reference is owed.

## Triage
verdict: questionable — accounting verified: bus.ts:563 `snapshot()` is an uncached delegate to `#snapshot()` (full per-node + per-heat-entry copy, 802-814/858-874); `#renderLive` calls `nodeFor` (build #1, 391) then `deps.bus()!.snapshot()` (build #2, 397) synchronously with `node`/`heat` read from #1 and `children` filtered from #2 (430-432); renderer closure builds a third at 534 as a presence gate; bounds 32/256 at types.ts:20,44 and the 200 ms `requestRender` contract at the header (12-17) reproduce; no D8 exemption on the host, no spec clause requires two builds, sibling D9-01 is a different (breakdown) root cause — minor misattribution: "zero per-frame color math" is RFC 0015:99, not the module header; the single-snapshot shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: excerpts byte-match at run-card-renderer.ts:336-339 (`nodeFor` → `deps.bus()?.snapshot()` + `.find`), 389-397 (`#renderLive` calls `nodeFor` at 391 then `deps.bus()!.snapshot()` at 397, synchronously, no await/mutation between; `children` filtered from copy #2 at 430-432 while `node.heat` reads copy #1), 534 (renderer closure's presence gate builds a third); bus.ts:563 `snapshot()` is an uncached delegate to `#snapshot()` which copies every node (802-814) and every heat entry (858-874); bounds MAX_TRACKED_INVOCATIONS=32 / HEAT_RING_CAPACITY=256 at types.ts:20,44 and the 200 ms `requestRender` animation contract at header lines 12-17 reproduce; grep `\.snapshot\(\)` in the file yields exactly the two cited call sites; no D8 row for run-card-renderer.ts/createRunCardController in quality/exemptions.json; no execution-status.md clause requires two builds and challenges_spec is correctly unset; sibling qw20260922150013-d9-01-run-card-controller-seven-concerns is a breakdown claim, not this cost claim, and no PTQ-NNNN names this path — one misattribution: "zero per-frame color math" lives in RFC 0015:99 / render/heat.ts:5,84, not this module's header (does not block the anchor, which is the measured 2× deep-copy per frame); per D8 rule the single-snapshot shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified from scratch: `nodeFor` (336-339) builds a snapshot and `.find`s one node; `#renderLive` calls it at 391 then `deps.bus()!.snapshot()` again at 397 with no await/mutation between, reading `node.heat` from copy #1 (401-404) and `children` from copy #2 (430-432); the renderer closure at 534 builds a third as a presence gate; grep `\.snapshot\(\)` in the file yields exactly lines 337 and 397; bus.ts:563 `snapshot()` is an uncached delegate to `#snapshot()` (802-814) which copies every node via `snapshotOfNode` and every heat entry via `snapshotOfHeat` (858-874); bounds MAX_TRACKED_INVOCATIONS=32 / HEAT_RING_CAPACITY=256 at types.ts:20,44 and the 200 ms `tui.requestRender()` re-render contract at header 12-17 reproduce; quality/exemptions.json has zero D8 rows and no execution-status entry; docs/spec_topics/execution-status.md mentions snapshot only in EXST-13 (tools registry), so no clause requires two builds and challenges_spec is correctly unset; sibling d9-01 is a breakdown filing that explicitly keeps `#renderLive` whole and does not name the double build — distinct root cause, no PTQ names this path; one minor misattribution: "zero per-frame color math" is RFC 0015:99 / render/heat.ts:5,84, not this module's header, which does not undercut the anchor (measured 2× deep copy per frame); per D8 rule the single-snapshot shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted. NOTE: this finding's host is rewritten by RFC 0015 Delivery 7 (span-semantics trace settle, in-flight clamp set, controller decomposition); it is assigned to the rfc-0015 pipeline, NOT the quality fix drain. The D7 review must confirm it as fixed or the issue returns to the drain.
