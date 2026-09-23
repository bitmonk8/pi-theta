---
id: PTQ-1258
title: calleeFailsOwnStructuralChecksBody spans 292 LOC across import-check, per-entry probe loop, stub callable-set resolution, and verdict fold
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/production-composition.ts:3514-3805
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#calleeFailsOwnStructuralChecksBody
d9_band: strong
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# calleeFailsOwnStructuralChecksBody spans 292 LOC across import-check, per-entry probe loop, stub callable-set resolution, and verdict fold

## Observation
The structural map places `calleeFailsOwnStructuralChecksBody` at
src/extension/production-composition.ts:3514-3805, 292 LOC, band strong
(FN strong >= 200), unexported, 0/0 importers. It is the recursive
structural-check core (bugs 0270/0271/0275/0276/0280) behind the taint
wrapper and boolean entry point. Of the 292 LOC, 131 are comment lines and
154 are code (counted with `sed | grep -cE '^\s*(//|/\*|\*)'`). It is the
last strong-band function in this file with no breakdown finding on record
(runComposePass, composeExtensionInstance, resolveThetaToolsAtLoad each
carry a confirmed PTQ: 1151, 1160, 1179).

## Evidence
Step inventory (phase | line range | LOC | locals read / written):

| phase | lines | LOC | reads | writes |
|---|---|---|---|---|
| signature + result shape | 3514-3540 | 27 | params | — |
| input assembly + checkThetaImports read, patched `system:` template + imported type decls, import-error early return | 3541-3575 | 35 | fs, deps, calleeAbsolutePath, frontmatter, body | calleeInput, importCheck, patchedSystemTemplate, importedTypeDecls |
| empty-`tools:` early return | 3576-3586 | 11 | frontmatter | toolsList |
| loop-state prologue (six state cells declared) | 3587-3632 | 46 | — | consultedVisited, calleeDir, readable, onDiskNames, declaredMode, grandchildFails, ownEscapes |
| per-entry probe / withhold (a),(c) / recursive judgement loop | 3633-3747 | 115 | toolsList, visited, activeRoots, nestedContainment, inProcessToolNames, fs, deps | readable, onDiskNames, declaredMode, grandchildFails, ownEscapes, consultedVisited |
| stub CallableSetDeps closure + resolveCallableSet | 3748-3789 | 42 | readable, onDiskNames, declaredMode, ctx, getAllTools, inProcessToolNames, body | stubDeps, result |
| verdict fold + return | 3790-3805 | 16 | result, grandchildFails, ownEscapes, consultedVisited, patchedSystemTemplate, importedTypeDecls | fails |

src/extension/production-composition.ts:3790-3799 (verdict fold):
```ts
  const fails =
    result.diagnostics.some(
      (d) =>
        d.severity === "error" &&
        (d.code === "theta/load/unknown-tool" ||
          d.code === "theta/load/unresolvable-theta-path" ||
          d.code === "theta/load/prompt-mode-callable"),
    ) || [...grandchildFails.values()].some((f) => f);
```

Seam cost: the probe loop (3633-3747) and the stub closure (3748-3776)
share three maps (`readable`, `onDiskNames`, `declaredMode`); the fold
additionally reads `grandchildFails`, `ownEscapes`, `consultedVisited`.

## Why this is a problem
Strong band: presumption of breakdown; a strong concrete reason is
required. Reasons considered and defeated:
- Single algorithm with shared local state (concrete): genuinely present —
  a loop extraction would return or thread six locals (readable,
  onDiskNames, declaredMode, grandchildFails, ownEscapes,
  consultedVisited). Concrete alone is insufficient in the strong band.
- Spec-cited invariant as one critical section / ordered sequence: the
  cited authorities are bug docs (0270, 0271, 0275 §Fix constraint 1, 0276
  §Fix constraint 4, 0280, 0379) plus RFC-0005 — none is a PIC/BNDR/EXST
  clause, and a seam returning the loop's state object performs the same
  fs reads in the same order (no observable interleaving is introduced).
- Measured cost: none on record.
- Prior split reverted: `git log --oneline src/extension/production-composition.ts | grep -ci revert` -> 0.
- Human ruling: quality/exemptions.json has four keys, none for this file
  or function.
- Generated code: 0 hits for `@generated|DO NOT EDIT`.
- Closed-enumeration spec mirror: the fold's three-code list is 3 arms; the
  other 276 LOC are not an enumeration.
PTQ-0322's pre-announced Seam A ("tools verification -> theta-callee-tools-verification.ts")
is a module move that would re-home this function whole; the module does
not exist (`git log --follow` finds no such file ever created) and a move
dispositions no function-level size claim.

## Suggested direction (non-binding, optional)
Hypotheses, unproven; the human ratifies one. Seam A: the per-entry
probe/withhold/recurse loop (3633-3747) -> `judgeCalleeToolsEntries`
helper (hypothesis) returning a state object {readable, onDiskNames,
declaredMode, grandchildFails, ownEscapes, consultedVisited} — ~115 LOC,
0 exported symbols moved, 0 external importers, cross-references back into
the host: calleeFailsOwnStructuralChecksWithTaint (the recursion),
onDiskCalleeName, admissibleToolsSpec. Seam B: stub resolution + verdict
fold (3748-3805) -> `resolveCalleeOwnCallableVerdict` (hypothesis) — ~58
LOC, 0 exports, 0 importers, takes the Seam-A state object plus ctx/
getAllTools/inProcessToolNames/body. Sequencing note: PTQ-0322's
pre-announced Seam A+C module move covers this family; either lands first.

## False-positive check
Band: 292 LOC >= 200 (FN_BANDS.strong), from the authoritative map, not
recounted. Reasons-considered list above with defeating evidence per item.
Exemptions check: quality/exemptions.json — no key for the file or
`#calleeFailsOwnStructuralChecksBody`. Generated-code check: 0 marker
hits. Spec-mirror check: no switch/if-chain mirroring a spec table; the
diagnostics registry codes appear only in the 3-arm fold. Duplicate check:
grep of quality/resolved + quality/intake for the function name finds only
citations inside other findings (PTQ-0117, 0349, 1151), no d9_host row for
this function.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 3514-3805 / 292 LOC / band strong (FN strong ≥ 200) with 0/0 importers and 131 comment lines; every step anchor lands exactly (calleeInput 3541, toolsList 3576, consultedVisited 3590, loop 3633, stubDeps 3748, resolveCallableSet 3777, fold 3790) and the fold excerpt matches; the inventory has ≥ 2 genuinely separable steps (import-check pass sharing no map with the rest; probe/withhold/recurse loop producing readable/onDiskNames/declaredMode/grandchildFails; stub+resolveCallableSet+fold consuming them), though the 'signature' and 'loop-state prologue' rows are not concerns in their own right; reasons re-checked — no exemption key for file or #function in quality/exemptions.json, 0 reverts in git log, 0 @generated markers, theta-callee-tools-verification.ts never created (PTQ-0322 Seam A is a pre-announced file-level move, d9_host = file, so not a duplicate — same distinct-key precedent as PTQ-1151/1160/1179), bug-0276's measured cost guards the WithTaint memo wrapper not an intra-body split, and the cited authorities are bug docs not spec clauses; the one live counter-reason the filing concedes is the concrete 'single algorithm with ≥ 6 shared locals' (readable, onDiskNames, declaredMode, grandchildFails, ownEscapes, consultedVisited), on which the qw20260920202922 D9 shard previously kept this function whole — whether that concrete reason suffices in the strong band, and the state-object seam shape, are the human's ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map row `3514-3805 | 292 | function | calleeFailsOwnStructuralChecksBody | no | 0/0` with band strong (FN strong = 200), 131 comment lines reproduce; all seven step anchors land on the exact lines (3514 signature, 3541 calleeInput, 3576 toolsList, 3590 consultedVisited, 3633 loop, 3748 stubDeps, 3777 resolveCallableSet, 3790-3799 fold byte-matches); the import-check phase (3541-3575) touches none of the six loop maps/flags (only echoes `ownEscapes: false` in its early-return literal) so it is a genuinely separable step from the loop (3633-3747) and the stub/fold consumer (3748-3805), which do share readable/onDiskNames/declaredMode/grandchildFails/ownEscapes/consultedVisited; reasons-considered re-checked — quality/exemptions.json has no production-composition key, 0 reverts, 0 @generated markers, no commit ever created theta-callee-tools-verification.ts, no other intake/resolved file carries this d9_host (only citations in PTQ-0117/0322/0349/1179), so not a duplicate; the concrete 'single algorithm with ≥ 6 shared locals' reason is real and was the basis on which the qw20260920202922 D9 shard-03 kept this function whole, and the filing concedes it — whether that concrete reason suffices in the strong band, and the state-object seam shape, is a human ruling, not a triage call (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time against current code: size-scan map row `3514-3805 | 292 | function | calleeFailsOwnStructuralChecksBody | no | 0/0`, band strong (FN strong = 200), 131 comment lines reproduce; all step anchors land (calleeInput 3541, import-error return ~3571, toolsList 3576, consultedVisited 3590, loop 3633, stubDeps 3748, resolveCallableSet 3777, fold 3790-3799 byte-matches); the import-check phase reads/writes none of the six loop cells, so the inventory has ≥ 2 genuinely separable concerns (import check → probe/withhold/recurse loop → stub+fold consumer); reasons re-run — quality/exemptions.json has no production-composition key, `git log | grep -ci revert` = 0, no commit ever added theta-callee-tools-verification.ts (PTQ-0322 Seam A is a file-keyed move, distinct key), the only spec text is invocation.md:20-22 defining the callee-has-errors outcome, not a read-ordering invariant — the one-loop/one-read discipline is cited to bug 0270 and a state-object seam performs the same reads in the same order, and PTQ-0349's doubled-realpath cost is already closed by the threaded nestedContainment param; the applicable concrete reason (single algorithm, exactly 6 shared locals readable/onDiskNames/declaredMode/grandchildFails/ownEscapes/consultedVisited spanning loop→stub→fold) is NOT overlooked — the filing concedes it — and unlike the driveUserVisibleTurn rejections (TRIAGE_LOG:270/277) there is no prior human/triage ruling on this host, only reviewer keep-whole notes; whether a concrete-only reason suffices under the strong band's 'strong reason required' posture is the human's ruling (keep-whole exemption vs ratified seam) (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
