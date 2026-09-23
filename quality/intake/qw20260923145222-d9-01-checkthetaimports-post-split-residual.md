---
id: pending
title: checkThetaImports remains a 239-LOC strong-band orchestrator after five ratified extractions
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/import-static-checks.ts:478-716
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/import-static-checks.ts#checkThetaImports
d9_band: strong
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# checkThetaImports remains a 239-LOC strong-band orchestrator after five ratified extractions

## Observation
`checkThetaImports` (src/extension/import-static-checks.ts:478-716) is 239 LOC —
strong band (FN strong >= 200) per the wave's structural map. It is the load-time
`.thetalib` import-check entry point (its own doc comment, :469-477). This is the
post-fix residual of the same host key: PTQ-0304/0334/0368/0418/1209 (all
resolved/fixed) each extracted one seam, and the qw20260923051412 /
qw20260922211400 fix commits (61321b91, a9428009) moved the specifier-facts loop
to import-specifier-facts.ts and the transitive/subagent-fn/cycle phases into
module-level functions — yet the body is still over the strong threshold.

## Evidence
Step inventory (all ranges re-read at HEAD; the body is a fixed sequence where
almost every phase is one delegated call):

| step | lines | LOC | reads / writes |
|---|---|---|---|
| signature + deps doc (bug 0267 claimDelivery) | 478-500 | 23 | — |
| no-import early return | 504-513 | 10 | reads importDecls, input.sourcePath |
| probe/resolver + resolution-kit destructure | 515-525 | 11 | writes fromFile, probe, resolver + 7 kit bindings |
| specifier-facts call, 10-field destructure | 527-556 | 30 | writes entryResolvedPaths … registrationFilteredPaths (10 bindings) |
| system-template patch | 558-566 | 9 | writes patchedParts |
| shared shadow-set / call-site derivation | 568-584 | 17 | writes paramsFieldNames, shadowedNames, callSites |
| four checkImported* pushes (0138/0429/0430/0448) | 586-644 | 59 | reads shadowedNames, callSites, 4 fact maps → diagnostics |
| re-export closure push | 646-653 | 8 | reads walked → diagnostics |
| transitive lib declarations call | 655-665 | 11 | reads parseCache, registrationFilteredPaths, allSpecifiers |
| subagent-fn + cycle pushes | 667-680 | 14 | reads parseCache, entryResolvedPaths, graphEdges |
| bug-0264 undelivered claim | 682-693 | 12 | writes undelivered |
| return-record assembly (0312/0423) | 694-716 | 23 | reads walked, patchedParts, importedType* |

Excerpt of the delegated shape (import-static-checks.ts:583-591):
```ts
  const shadowedNames = collectLocalBinderNames(input.body, paramsFieldNames);
  const callSites = collectCallSites(input.body);

  // Bug 0138 route 2: judge every imported-`fn` call site's argument COUNT and
  // TYPE, ONCE over the importing theta's own body, now that the per-decl loop
  // above holds the whole `importedFns` map.
  diagnostics.push(
    ...checkImportedFnCallArgs(
```
Importer counts (structural map): `checkThetaImports` exported, 1 src / 22 test
importers; the file is 716 LOC, zone band.

## Why this is a problem
Strong band carries a presumption of breakdown absent a strong concrete reason.
Reasons considered: (a) closed-enumeration dispatch — no; the LOC sits in
sequential wiring, not spec-mirroring arms; (b) single algorithm with shared
local state — the largest cross-phase surface is the 10-binding facts
destructure, but it is already a record (`ImportedSpecifierFacts`) returned by
one call, and later phases each read <= 4 of its fields plus `diagnostics`; (c)
data-only — no (0 % table LOC); (d) generated — no marker; (e) spec-cited
one-critical-section invariant — the bug-0264 claimUndelivered pin (:682-693)
is positional ("after every diagnostic … has been pushed") and, per PTQ-1209's
own triage reasoning, "positional and unaffected by same-point extraction"; (f)
prior split reverted — none: all five prior extractions on this host landed and
stuck (61321b91, a9428009 and predecessors). No quality/exemptions.json entry
exists for this host (4 keys, none under import-static-checks).

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: the four imported-symbol-usage pushes plus their
shared shadow-set/call-site derivation (:568-644, ~76 LOC) ->
`runImportedSymbolUsageChecks(input, facts, ...)` in invoke-imported-checks.ts
(which already owns all four checkers; 0 exported symbols move, no
cross-reference back). Seam B: the return-record assembly + undelivered claim
(:682-716, ~35 LOC) -> a `settleImportCheckResult` helper (module-private,
threads diagnostics/walked/patchedParts/importedType* — 5 values). None may be
worth it; the human ratifies.

## False-positive check
Band: strong (239 >= 200), quoted from the map, not recounted. Reasons
considered and defeated: listed above per class. Exemptions check:
quality/exemptions.json has no import-static-checks key. Generated-code check:
no generator banner; git log shows hand-authored bug/quality commits.
Spec-mirror check: imports.md IMP-1..IMP-7 name the checks, not one body; each
IMP row is already a delegated function. Dedupe: PTQ-0304/0334/0368/0418/1209
are all status fixed in quality/resolved/ on this host key; this is the fresh
post-fix residual at HEAD (239 LOC vs 287 at PTQ-1209), the same residual
pattern as PTQ-1440/PTQ-1284, and no open intake carries this host key.

## Triage
verdict: questionable — accounting verified: size-scan map on a one-line manifest gives checkThetaImports 478-716 / 239 LOC / band strong (FN strong ≥ 200), exported, 1 src / 22 test importers, file 716 LOC zone; all twelve step-inventory rows sit exactly at the cited ranges (early return :504-513, kit :515-525, facts :527-556, patch :558-566, shadow set :568-584, four checkImported* pushes :586-644, re-export :646-653, transitive :655-665, subagent-fn+cycle :667-680, bug-0264 pin :682-693, return :694-716) and the excerpt matches at :583-590; the rows are distinct bug/IMP-anchored checks with distinct read sets, not one concern split by adjectives; reasons-considered hold — quality/exemptions.json's 4 keys carry no import-static-checks entry, no reverted split (the function has sat at 239 LOC since 60bd4037, PTQ-1209's fix, which is the commit that actually extracted checkReachedLibSubagentFns/checkImportCycles — the candidate's attribution to 61321b91/a9428009 is a provenance slip, those commits moved other code out of the file without touching this body), and the bug-0264 claimUndelivered pin is positional and the human already ratified extraction past it at 287 LOC (PTQ-1209); one nuance for the human: whole-function, ~9 locals (diagnostics, input, probe, resolver, parseThetaLib, unreadablePaths, parseCache, walked, imports) are threaded across phases and a prior reviewer keep-wholed this same 239 shape on that basis (REVIEW_LOG:789, a reviewer disposition, not a human ruling or exemption), while the body is now almost entirely delegated-call wiring plus rationale comments, so fix cost vs a 39-LOC-over-threshold residual is exactly the ruling needed; not a duplicate — PTQ-0304/0334/0368/0418/1209 are all status fixed in quality/resolved/, PTQ-1147/1284 key the file host, and no open issue or other intake carries #checkThetaImports; D9 breakdown never confirms — Seam A/B or keep-whole is the human's ratification (triage: claude-fable-5-1)
verdict: questionable — accounting verified independently: size-scan map on a one-line manifest gives checkThetaImports 478-716 / 239 LOC / band strong (FN_BANDS strong 200), exported, 1 src / 22 test importers, file 716 LOC zone; the body at HEAD is exactly the cited sequence (early return, kit destructure, 10-field collectImportedSpecifierFacts destructure, system-template patch, shadow set/callSites, four checkImported* pushes, re-export closure, checkTransitiveLibDeclarations, subagent-fn + cycle pushes, bug-0264 claimUndelivered, return record), each phase a delegated call with distinct read sets, and the proposed seams thread ≤ ~7 values each; no import-static-checks key in quality/exemptions.json, no reverted split (PTQ-0304/0334/0368/0418/1209 all status fixed in quality/resolved/ on this host key; git shows 61321b91/a9428009 shrank the file, 60bd4037 is PTQ-1209's fix), no open issue/intake carries #checkThetaImports (PTQ-1387 only calls it from a test; d9-02 is the kit host); for the ruling: REVIEW_LOG:789 (qw20260923010657, lens-worker disposition, not a human ruling or exemption) kept this 239 shape whole citing the bug-0264 claim-once and bug-0138 IMP-4→IMP-3 ordered-emission pins, which the candidate's reason (e) addresses only for bug-0264 — both are positional and survive same-point extraction, so not an overlooked blocker, but fix cost vs a 39-LOC-over-threshold residual is the human's call; D9 breakdown never confirms (triage: claude-opus-5-5)
verdict: questionable — accounting re-verified at HEAD ad83876a: size-scan map on a one-line manifest gives checkThetaImports 478-716 / 239 LOC / band strong, exported, 1/22 importers, file 716 LOC zone; the body is the cited sequence of delegated calls (collectImportResolutionKit destructure, 10-field collectImportedSpecifierFacts, patchSystemTemplateForImports, shared shadow set/callSites, four checkImported* pushes, resolveReExportClosure, checkTransitiveLibDeclarations, subagent-fn + cycle pushes, bug-0264 claimUndelivered, return record), each with its own read set; no import-static-checks key in quality/exemptions.json; no reverted split (git -L on the body shows last touch 60bd4037, PTQ-1209's fix, so the 61321b91/a9428009 attribution is a provenance slip, not an accounting error); PTQ-0304/0334/0368/0418/1209 are all status fixed in quality/resolved/, and no open issue or other intake keys #checkThetaImports; the bug-0264 and bug-0138 ordering pins are positional and survive same-point extraction; whether the Seam A/B split is worth doing on a residual 39 LOC over the threshold is a human ruling, and D9 breakdown is never confirmed (triage: claude-opus-5-5)
