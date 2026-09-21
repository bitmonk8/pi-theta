---
id: pending
title: composeExtensionInstance bundles instance wiring with two low-coupling construction phases across 347 LOC
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:2031-2377
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#composeExtensionInstance
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# composeExtensionInstance bundles instance wiring with two low-coupling construction phases across 347 LOC

## Observation
`composeExtensionInstance` (src/extension/production-composition.ts:2031-2377) is 347 LOC — strong band (>= 200). Its doc comment (2022-2030) states its role: "Compose one extension instance: run the initial discovery + compose pass over a single runtime root, then expose the step-5 watcher installer." The body is eight sequential phases; two of them — the status-sink probing block and the pre-eval load-note sink — read almost none of the instance state the rest of the function shares, while the returned `installHotReload` closure captures fourteen locals.

## Evidence
Step inventory (phase | lines | LOC | locals read/written — the seam cost):

| phase | lines | LOC | locals read / written |
|---|---|---|---|
| Toast emit + note channel | 2062-2073 | 12 | r: ctx, pi, rendererGate, entryChannel; w: emitToast, channel |
| Pre-eval load-note routing sink | 2096-2143 | 48 | r: channel, resultChannel (forward-referenced `let`, assigned at 2243); w: emitLoadNoteGroup, emitLoadNote, loadSink |
| Runtime root + instance registries | 2145-2162 | 18 | r: ctx, overrides, emitLoadNote; w: root, activeInvocations, forwardingSignals |
| Status-sink probing + bus | 2179-2216 | 38 | r: ctx.ui, root.clock; w: statusSinks, statusBus |
| Control plane + result-channel dial | 2224-2255 | 32 | r: overrides, root.clock, activeInvocations; w: instanceControlPlane, resultChannel |
| Initial compose pass | 2257-2274 | 18 | r: 13 prior locals/params; w: initial |
| Watch roots + registry seed | 2286-2303 | 18 | r: initial, ctx, root.fileSystem; w: settingsPaths, roots, latestWatchRoots, registry |
| Returned wiring + installHotReload/rediscover closure | 2305-2376 | 72 | closure captures: root, registry, channel, emitErr7 (=loadSink), activeInvocations, forwardingSignals, statusBus, instanceControlPlane, resultChannel, latestWatchRoots, ownRegisteredNames, overrides, rendererGate, entryChannel |

The status-sink phase's whole coupling to the rest of the function is `root.clock` (excerpt, lines 2179-2186):
```ts
  const statusSinks: StatusSink[] = [];
  if (
    typeof (ctx.ui as unknown as Partial<FooterUi> | undefined)?.setStatus === "function" ||
    typeof (ctx.ui as unknown as Partial<FooterUi> | undefined)?.setWorkingMessage ===
      "function"
  ) {
    statusSinks.push(
      createFooterSink({
```

## Why this is a problem
Strong band (347 LOC): presumption of breakdown, not filed only on a strong concrete reason. Reasons considered and defeated:
- Single algorithm with shared local state — holds only for the return-wiring phase (its closure captures 14 locals; that phase is what makes the function an instance-composition closure) but not for the status-sink phase (reads exactly ctx.ui and root.clock — a helper would thread 2 values) or the load-note sink phase (reads channel plus a mutable resultChannel reference — 2 values, one ref cell). Those two phases are 86 LOC extractable at a 2-parameter seam each.
- Closed-enumeration dispatch — no; no switch mirrors a spec-named set.
- Data-only / grammar production / generated — no (imperative wiring; no generation markers).
- Strong-only, spec-cited critical section — no. The one-per-instance invariants cited (Decision 6 / Increment B1/B2, RFC 0010 EXST-2) pin object *identity* (constructed once, shared with the producer and teardown), which a construction helper returning the same single instance preserves; no ordered observable step sequence spans the probe phase and the sink phase.
- Strong-only, measured cost / prior split reverted / human ruling — none found; `quality/exemptions.json` has no key for this function; PTQ-0322's ratified/pre-announced seams (Seam 0, A+C, B') do not touch this function's body.

## Suggested direction (non-binding, optional)
Seam hypotheses, unproven, ordered by confidence: Seam A: the status-sink probing block (2179-2216) -> in-file helper `buildStatusSinks(ctx)` returning `StatusSink[]` (hypothesis) — 38 LOC, 0 exported symbols moved, 0 external importers, cross-reference back into the host: none (the bus construction stays behind with root.clock). Seam B: the pre-eval load-note sink (2096-2143) -> `makeLoadNoteSink(channel, getResultChannel)` (hypothesis) — 48 LOC, 0 exported symbols moved, cross-reference back: the mutable `resultChannel` slot becomes an explicit getter/ref cell (the state object a split must invent — recorded as the seam cost). Seam C: none identified yet for the return-wiring phase (its 14 captures are the instance state itself).

## False-positive check
Band: strong (347 LOC quoted from the structural map; the nested `installHotReload` closure is separately listed at 2314-2375, 62 LOC, zone — dispositioned kept-whole in this wave's notes as part of the instance-state closure). Reasons-considered list above with per-phase local counts. Exemptions check: `quality/exemptions.json` read in full — no matching key. Generated-code check: no markers. Spec-mirror check: the phases cite independent specs (PIC-54 fallback chain, error-model.md ERR-1..16, RFC 0010, RFC-0012 §2/§3) — multiple facilities, not one enumeration. Duplicate check: no pending or resolved finding carries the `#composeExtensionInstance` host key (grep over quality/: 0 hits); PTQ-0322 is the file-level host key only.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces composeExtensionInstance at 2031-2377 / 347 LOC / band strong (the map's `yes` is the exported column, not an exemption; quality/exemptions.json carries no production-composition key); the excerpt is verbatim at 2179-2186 and every inventory anchor reproduces within ~6 lines (`let resultChannel` 2096, sink 2097-2143, root 2145, registries 2153/2162, statusSinks 2179, statusBus+latch 2209-2210, control plane 2224, `resultChannel =` 2243 exact, initial 2257, watch/registry 2286-2301, return 2305-2377); the two low-coupling rows hold — the probe block 2179-2208 reads no local but `ctx` (`root.clock` only enters at the bus on 2209, which the filing leaves in the host) and the load-note sink reads `channel` plus a single `resultChannel?.stderr` against the forward-assigned let — while the wiring closure's 14 captures is in fact an undercount (also pi, ctx, inProcessTools, roots, settingsPaths, initial), which only strengthens its keep-whole row; no overlooked reason (no spec-table switch; PIC-73's never-bind-`ctx.ui` rule constrains a helper's parameter shape, not extraction; no measured-cost/reverted-split note); not a duplicate — PTQ-0322 is the resolved file-level key, the 2026-09-14 function-level filing was human-DEFERRED not refused ("one seam per host per wave; re-file once the file changes" — 9 commits and 284→347 LOC since), and the 2026-09-16 re-filing was wiped by the store reset with no triage row and no open issue; target shape (Seam A/B or a different cut) and whether the still-unlanded PTQ-0322 A+C/B' pre-announcements keep the one-seam-per-host rule in force are the human's ruling, never confirmed for a D9 breakdown (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: `size-scan.mjs map` now places composeExtensionInstance at 2028-2374 (3-line drift from the filed 2031-2377), 347 LOC, band strong (FN strong threshold 200), no `production-composition` key in quality/exemptions.json; the excerpt is verbatim at 2176-2183; the two low-coupling inventory rows hold at the code — the status-sink probe block (2176-2205) reads no local except `ctx` and `root.clock` first appears at the bus construction (2206), while the load-note sink (2093-2140) reads only `channel` and the forward-declared `let resultChannel` (assigned 2240) — so they are distinct concerns sharing no locals with each other, and the wiring-closure row is conceded keep-whole; no overlooked reason: no spec-table switch, no data-only/generated body, the PIC-73 family-(4) rule is enforced by inventory-closure-audit.ts as a source-shape scan (not keyed to this function's name) so an in-file helper taking `ctx` stays in its scope, and the Decision 6/B1/B2 + EXST-2 invariants pin construct-once identity, not intra-function placement; not a duplicate: TRIAGE_LOG.md:61 is the 2026-09-14 human-defer of the 284-LOC filing ('Re-file once the file changes') and the file has since changed (9 commits, 284→347 LOC), quality/issues/ holds no composeExtensionInstance row, and sibling intake d9-01 carries the distinct `#runComposePass` key; the seam shape (A/B or another cut) is a design decision for the human's ruling — never confirmed for a D9 breakdown (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time against current code: `size-scan.mjs map --files` places composeExtensionInstance at 2028-2374 / 347 LOC / band strong (FN strong ≥ 200; 3-line drift from the filed 2031-2377), the wave fix commit 0fb4497e touched only hunks outside that range, and quality/exemptions.json has no production-composition or composeExtensionInstance key; the excerpt is verbatim at 2176-2183; the inventory's two low-coupling rows are real distinct concerns — the status-sink probe (2176-2205) reads only `ctx` (its `root.clock` coupling enters only at the bus construction on 2206) and the load-note sink (2093-2140) reads only `channel` plus the forward-declared `let resultChannel` assigned at 2240, so the two share no locals with each other — while the return-wiring closure captures ≥ 14 locals and is conceded keep-whole; no overlooked reason: no spec-table switch, no data-only/generated body, PIC-73's read-`ctx.ui`-in-place rule (source-shape audit in src/extension/inventory-closure-audit.ts, not keyed to this function) constrains a helper's parameter shape rather than forbidding extraction, and the Decision 6 / B1 / B2 / EXST-2 invariants pin construct-once identity, not intra-function placement; not a duplicate: quality/issues/ has no composeExtensionInstance row, PTQ-0322 is the resolved file-level key, TRIAGE_LOG.md:61 is the 2026-09-14 human-defer ('Re-file once the file changes') and the file has since changed across ~20 commits (284→347 LOC), and sibling d9-01 carries the distinct `#runComposePass` key; the target shape (Seam A/B or another cut) is the human's ruling — never confirmed for a D9 breakdown (triage: claude-fable-5-1)
