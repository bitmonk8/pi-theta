---
id: PTQ-0416
title: runInventoryClosureAudit still bundles the nested visitRefs collector and the Pass-2 marker-classification loop at 342 LOC after Seam A's visitShapes hoist landed
lens: D9
status: open
verdict: confirmed
locations:
  - src/extension/inventory-closure-audit.ts:556-897
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/inventory-closure-audit.ts#runInventoryClosureAudit
d9_band: strong
wave: qw20260917121953
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-17
---

# runInventoryClosureAudit still bundles the nested visitRefs collector and the Pass-2 marker-classification loop at 342 LOC after Seam A's visitShapes hoist landed

## Observation
`runInventoryClosureAudit` (src/extension/inventory-closure-audit.ts:556-897) is 342 LOC in the strong band (map: 0 src / 2 test importers) inside a 944-LOC zone-band file. Resolved PTQ-0350's ratification hoisted Pass 1 (`visitShapes`, now top-level at :360-543) and pre-announced this filing: "Seams B/C (visitRefs; marker classification) are NOT ratified - D9 re-files after this lands." The hoist has landed; the function still nests the Pass-3 reference collector `visitRefs` (:697-784, 88 LOC, zone per the map) and the Pass-2 marker-classification loop.

## Evidence
Distinct-concern inventory (all ranges re-read this session):

| concern | members | line ranges | LOC |
|---|---|---|---|
| inventory/allow-list key sets | `cat1Members`, `cat3Members`, `cat2Names`, `typeboxNamed`, `typeboxMembers` | 557-581 | 25 |
| per-file record scaffolding + Pass-1 delegation | `lineOfPos`, `familyFourLines`, `push`, `emitFamilyFour`, `visitShapes(sf, sf, emitFamilyFour)` (:637) | 587-640 | 52 |
| Pass 3: reference collection | `Ref`, `refs`, `clauseELines`, `resolveRef`, `scanTypeImport`, nested `visitRefs` (:697-784) + `visitRefs(sf)` (:786) | 642-786 | 143 |
| comment-trivia harvest (bug 0374) | `commentByLine`, `seenComment`, `recordComment`, `collectComments` | 788-812 | 25 |
| Pass 2: marker classification | `authorisedLines`, `refsByAuthLine`, `emitFamilyFive`, `classifyMarker` loop over `commentByLine` | 814-866 | 53 |
| Pass 4: violation emission | resolved/authorised filter loop | 868-874 | 7 |
| canary + ordering + return | `canaryOk` record, `ordered.sort`, return | 876-897 | 22 |

Pass-2 boundary excerpt (:814-821):

```typescript
    // ---- Pass 2: markers over every real comment line (bug 0374 §Fix). A well-formed
    // marker authorises the UNRESOLVED in-scope references whose originating line
    // it trails (inventory-first resolution short-circuits before the marker, so
    // an all-resolved line is (s2)); malformed grammar (a)-(g), off-originating-
    // line placement (e), family-(4)-line placement (h), and the two stale
    // sub-kinds (s1)/(s2) each route to family (5) under their own token. ----
    const authorisedLines = new Set<number>();
    const refsByAuthLine = new Map<number, Ref[]>();
```

Importer counts from the map: `runInventoryClosureAudit` 0 src / 2 tests; nested `visitRefs` 697-784, 88 LOC.

## Why this is a problem
Strong band (342 LOC ≥ 200): presumption of breakdown requiring a strong concrete reason. Reasons considered: (a) single algorithm with shared local state — PTQ-0350's own triage established the defeat: the pass-boundary state is narrow (`cat1Members`/`cat3Members`/`cat2Names`/`typeboxNamed`/`typeboxMembers` are read only in Pass 3, never Pass 1/2/4), under the ≥6-local bar, and the landed `visitShapes` hoist proved the callback-parameter pattern works here; (b) closed-enumeration dispatch — the passes are a sequence, not a spec-table switch; (c) data-only — no; (d) grammar production — no; (e) generated — hand-written. Strong reasons: no `quality/exemptions.json` entry; no measured cost; no reverted split (the one split here landed and stuck); the human ruling on record (PTQ-0350 ratification) explicitly invites this re-file of Seams B/C.

## Suggested direction (non-binding, optional)
Hypotheses, unproven, human ratifies: Seam B: hoist `visitRefs` (:697-784, 88 LOC) to a module-private top-level function, the exact shape of the ratified `visitShapes` hoist — parameters what it closes over (`sf`, `resolveRef`, `emitFamilyFour`, `clauseELines`, `lineOfPos`, `typeboxTypeIsImported`, the five key sets); 0 exported symbols moved, 0 external importers; the module-private predicates it calls (`inPiCarrier`, `inCtxCarrier`, `isCapturedRebinding`, `isTypebox`, `isPeerPackage`) stay. Seam C: the Pass-2 marker loop (:814-866, 53 LOC) -> module-private `classifyAndEmitMarkers` (hypothesis) taking `commentByLine`, `refsByAuthLine`-input `refs`, `familyFourLines`, `clauseELines`, and the `push` sink, returning `authorisedLines`. None identified yet beyond these two.

## False-positive check
Band: strong (342 ≥ 200) from the authoritative map. Reasons-considered list above, each defeated with counts or the PTQ-0350 triage citation. Exemptions check: no `inventory-closure-audit` key in `quality/exemptions.json` (read this session). Generated-code check: hand-written audit core (bug-numbered comments, no generator marker). Spec-mirror check: the pass comments cite audit-failures.md §"Three-class partition" as an output partition, not a closed enumeration whose arms this function's length mirrors. Duplicate check: PTQ-0350 is resolved/fixed and its ratification names this exact re-file; no other pending candidate touches this host.

## Triage
verdict: questionable — accounting verified independently from the live tree: size-scan map confirms runInventoryClosureAudit at 556-897 / 342 LOC / band strong / 0 src + 2 test importers, visitShapes hoisted to a top-level 3-param function at 360-543 (commit 9d5a0f17's diff is exactly that hoist: `-const visitShapes = (n)` / `+function visitShapes(n, sf, emitFamilyFour)`), visitRefs still nested at 697-784 / 88 LOC; every inventory row's range and the :814-821 excerpt match the source verbatim; the reason-(a) defeat holds on my own grep (cat1Members/cat3Members/cat2Names/typeboxNamed/typeboxMembers are read only at 713/722/750/768/777, all inside visitRefs; typeboxTypeIsImported is intra-Pass-3 at 678-773; the true inter-pass locals are familyFourLines/refs/clauseELines/commentByLine/authorisedLines = 5, under the ≥6 bar); no inventory-closure-audit key in quality/exemptions.json, no revert in the file's 7-commit history, no generator marker, and the pass comments cite resolution rules not a closed enumeration; not a duplicate — the prior same-root-cause filing (qw20260916045442-d9-01-runinventoryclosureaudit-passes-remain-bundled, triaged questionable ×3) was purged by the 53f815de store reset without a PTQ being minted, and PTQ-0350's ratification explicitly deferred Seams B/C to this re-file; D9 breakdown never confirms — the Seam B/C shape (visitRefs hoist would carry ~11 closed-over params vs Seam A's 3) is a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-17): Seam B - hoist visitRefs (:697-784) to a module-private top-level function exactly on the ratified visitShapes precedent (parameters = what it closes over; the module-private predicates stay). Seam C - extract the Pass-2 marker-classification loop as module-private classifyAndEmitMarkers returning authorisedLines. Both zero-export moves.
