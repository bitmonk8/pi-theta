---
id: pending
title: resolveReExportClosure is 280 LOC hosting five named phase closures over a two-collection graph state that already has a shape a split could thread
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/import-static-checks.ts:754-1033
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/import-static-checks.ts#resolveReExportClosure
d9_band: strong
wave: qw20260920223212
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# resolveReExportClosure is 280 LOC hosting five named phase closures over a two-collection graph state that already has a shape a split could thread

## Observation
`resolveReExportClosure` (src/extension/import-static-checks.ts:754-1033) is 280
LOC, function band strong per the authoritative map. It was created by the
ratified PTQ-0334 seam ("split out of `checkThetaImports` into its own top-level
function", its own doc comment at 736-753); that ratification ruled on the
extraction from `checkThetaImports`, not on this body's internal wholeness, and
no filing has ever carried this function as its host. The body is five named
inner closures — `closeOverReExports`, `fixReExportedNames`,
`diagnoseReExports`, `resolveDeclaringSite`, `diagnoseReExportCollisions` —
plus a 6-line driver, all closing over two graph collections
(`libDeclaredNames`, `reExportEdges`) and the `diagnostics` sink.

## Evidence
Step inventory (all ranges re-read this session; locals each phase reads/writes
stated — the seam cost):

| phase | line ranges | LOC | locals read/written |
|---|---|---|---|
| state declarations (`ReExportEdge`, seed maps, visited set, sink) | 763-780 | 18 | declares `diagnostics`, `libDeclaredNames`, `reExportEdges`, `closedOver` |
| phase 1: `closeOverReExports` — collect files/edges, IMP-1 + bug-0428 arms | 794-864 | 71 | reads `parseThetaLib`, `probe`, `resolver`, `unreadablePaths`; writes `closedOver`, `libDeclaredNames`, `reExportEdges`, `diagnostics` |
| phase 2: `fixReExportedNames` — least fixpoint of provided-name sets | 878-903 | 26 | reads `libDeclaredNames`, `reExportEdges`; writes nothing shared (returns `provided`) |
| phase 3: `diagnoseReExports` — unknown-symbol per unsatisfied edge | 905-920 | 16 | reads `reExportEdges`, its `provided` parameter; writes `diagnostics` |
| bug-0334 site resolution: `resolveDeclaringSite` | 933-956 | 24 | reads `libDeclaredNames`, `reExportEdges` |
| bug-0334 collisions: `diagnoseReExportCollisions` — group, resolve, refuse | 975-1024 | 50 | reads `reExportEdges`, `libDeclaredNames`; writes `diagnostics` |
| driver: walk every root, settle, diagnose twice | 1026-1032 | 7 | reads `walked`; calls all phases in the pinned order |

Excerpt of the driver (1026-1032):

```typescript
  for (const resolvedPath of walked) {
    await closeOverReExports(resolvedPath);
  }
  diagnoseReExports(fixReExportedNames());
  diagnoseReExportCollisions();

  return diagnostics;
}
```

Importer counts from the map: `resolveReExportClosure` 0 src / 0 tests
(module-private; sole caller `checkThetaImports` at 2006).

## Why this is a problem
Strong band (280 ≥ 200): presumption of breakdown, filed unless a strong
concrete reason is on record. Reasons considered and why each fails: (a)
single algorithm with shared local state — the phases share exactly three
collections (`libDeclaredNames`, `reExportEdges`, `diagnostics`; `closedOver`
is phase-1-private), below the ≥6-locals bar, and the function's own doc
comment (748-750) already names the state boundary: "this phase's own fixpoint
state (`libDeclaredNames` / `reExportEdges`) stays internal to it" — a
two-field graph record threads all four downstream phases. (b)
closed-enumeration dispatch — no switch mirrors a spec set; the LOC lives in
the 71/50-LOC collection and collision closures. (c) data-only — one 13-LOC
interface, far under 80%. (d) grammar production — not a parser routine. (e)
generated — hand-written (bug-numbered comments). Strong supplements: the
emission-order pin (752-753: diagnostics returned "in the SAME order they
pushed before this split" — walk, settle, unknown-symbols, THEN collisions)
lives in the 7-LOC driver and survives any extraction of the phases as
top-level functions called in that same order, as the four landed seams of
this file's lane already proved; no measured cost; no reverted split (the
opposite — this function IS a landed extraction); no `quality/exemptions.json`
entry (read this session — no import-static-checks key).

## Suggested direction (non-binding, optional)
Hypotheses, unproven, human ratifies one. Seam A: `closeOverReExports` +
`fixReExportedNames` (794-903, ~97 LOC) -> module-private
`collectReExportGraph(walked, parseThetaLib, probe, resolver, unreadablePaths,
diagnostics)` returning a `{ libDeclaredNames, reExportEdges, provided }`
record (hypothesis) — 0 exported symbols moved, 0 external importers,
cross-references back into the host: `extractThetaLibForms`,
`loadThetaLibImport`, `unreadableThetaLibDiagnostic`. Seam B: the bug-0334
collision pair `resolveDeclaringSite` + `diagnoseReExportCollisions`
(933-1024, ~74 LOC) -> module-private `diagnoseReExportSiteCollisions(graph)`
(hypothesis) — 0 exports moved, cross-references back:
`IMPORT_NAME_COLLISION_CODE`/`importNameCollisionMessage` (already imported at
module scope). None identified yet beyond these two.

## False-positive check
Band: strong (280 ≥ 200) from the authoritative map, not recounted.
Reasons-considered list above with the defeating evidence per reason (the
3-shared-collections count for reason (a); the driver-local order pin for the
strong-invariant claim). Exemptions check: `quality/exemptions.json` read this
session — four keys, none for this file or host. Generated-code check:
hand-written (git log shows hand-edited bug/quality commits e7c3be9b,
9250a343; no generator marker). Spec-mirror check: imports.md §Re-exports
names the three ordered phases the doc comment cites; it pins the ORDER, not a
single function body — the phases are already separately named closures.
Duplicate check: grep of quality/ for `d9_host:` shows no filing on
`#resolveReExportClosure`; PTQ-0304/0334/0368/0418 (all status: fixed,
verified this session) carry `#checkThetaImports`; the pending file-level
filing (qw20260920202922-d9-01) proposes moving this function WHOLE to a new
module — a different claim under a different host key; nested
`closeOverReExports` (71 LOC, zone) is dispositioned by this filing's phase-1
row.

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives resolveReExportClosure 754-1033 / 280 LOC / band strong (nested closeOverReExports 794-864 / 71 / zone), no import-static-checks key among the 4 quality/exemptions.json entries, sole caller checkThetaImports:2006, driver excerpt byte-exact at 1026-1032, closure boundaries reproduce at 794-864 / 878-898 (filing says 903 — 5-line drift, 21 not 26 LOC, tolerated) / 905-920 / 933-956 / 975-1024; rows are distinct concerns (only phase 1 does IO and reads parseThetaLib/probe/resolver/unreadablePaths; fixReExportedNames is pure and returns `provided`; the bug-0334 collision pair was a separate later addition per PTQ-0353) sharing exactly 3 locals (libDeclaredNames, reExportEdges, diagnostics — closedOver is phase-1-private), under the ≥6 bar; imports.md:67-74/139 pin fixpoint semantics and the diamond-exempt collision rule, not a single body, and the order pin lives in the 7-LOC driver; correction to the filing's duplicate check: this host WAS filed before — TRIAGE_LOG:68 (qw20260915044704-d9-01) was human-DEFERRED not refused ("re-file once Seam C lands; likely ratification is hoisting resolveDeclaringSite + diagnoseReExportCollisions") and TRIAGE_LOG:71 (qw20260916144930-d9-01) fell only on line drift, neither open, and PTQ-0368/0418 are both fixed so the re-file condition is met — not a duplicate; the pending file-level sibling qw20260920202922-d9-01 (questionable) proposes moving this function WHOLE under a different host key, so the human must sequence the two (one seam per host per wave); D9 breakdown caps at questionable — which seam is a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting independently re-verified at HEAD: size-scan map on a one-line manifest gives resolveReExportClosure 754-1033 / 280 LOC / band strong (FN strong ≥ 200; nested closeOverReExports 794-864 / 71 / zone), 0/0 importers with the sole caller checkThetaImports:2006, no import-static-checks key among the 4 quality/exemptions.json entries; closure boundaries reproduce at 794-864 / 878-898 (filing's 903 is a 5-line drift, 21 LOC not 26, tolerated) / 905-920 / 933-956 / 975-1024, driver excerpt byte-exact at 1026-1032, doc-comment quotes at 746-749; the rows are distinct concerns (only phase 1 does IO and reads the parseThetaLib/probe/resolver/unreadablePaths params, fixReExportedNames is pure and returns `provided`, the bug-0334 pair is a later addition per PTQ-0353) sharing exactly 3 locals (libDeclaredNames, reExportEdges, diagnostics; closedOver is phase-1-private), under the ≥ 6 bar; imports.md:67-74 and :139 pin the fixpoint semantics and diamond-exempt collision rule, not one body, and the emission-order pin lives in the 7-LOC driver; git log shows one landing commit (a01c35f1) and no revert; correction to the filing's duplicate check: this host WAS filed twice before (TRIAGE_LOG:68 human-DEFERRED pending Seam C, TRIAGE_LOG:71 false-positive on line drift only), neither open, and PTQ-0368/0418 are both status: fixed in quality/resolved/ so the re-file condition is met — not a duplicate; the pending file-level sibling qw20260920202922-d9-01 proposes moving this function WHOLE under a different host key, so the human must sequence the two (one seam per host file per wave); D9 breakdown never confirms — which seam is the human's ratification (triage: claude-fable-5-1)
