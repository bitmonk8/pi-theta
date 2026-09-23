---
id: pending
title: runComposePass remains 1017 LOC (strong band) after the PTQ-1151 fix extracted only the placement and ladder phases
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:681-1697
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#runComposePass
d9_band: strong
wave: qw20260923023517
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# runComposePass remains 1017 LOC (strong band) after the PTQ-1151 fix extracted only the placement and ladder phases

## Observation
`runComposePass` (src/extension/production-composition.ts:681-1697) is the
production discovery + compose pass driver. The structural map gives it 1017
LOC, band strong (FN strong threshold 200); it is unexported with 0/0
importers. PTQ-1151 (fourteen phases, 1090 LOC) was confirmed and fixed by
commit 501d782b, which extracted `buildPassPlacement` (now 1700-1800, 101 LOC)
and `buildDispatchLadder` (now 1803-1868, 66 LOC) and is called at 1049 and
1062. The residual body is still five times the strong-band function
threshold. 581 of the 1017 lines are comment lines (~436 code lines, still
over 200).

## Evidence
Residual step inventory (line ranges re-read at HEAD; locals per phase):

| phase | line ranges | LOC | reads / writes |
|---|---|---|---|
| seam defaulting (fileSystem, clock, subagentExecutableHost, controlPlane/Env) | 741-745 | 5 | params → 5 locals |
| recording tee (recordedErrorDiagnostics, recordingComplete, recordErrorSeverity, sink) | 758-790 | 33 | outerSink → sink |
| settings load + telemetry ceiling | 794-812 | 19 | fileSystem → settings |
| placement selector + regime + marked root | 814-835 | 22 | settings, controlPlaneEnv → placementSelector, subagentRootRegime, markedRoot |
| discovery (cliPaths, piOwnedNames, packageWalk, walk, discovered) | 837-877 | 41 | fileSystem, settings, pi → discovered |
| model matcher + strict-capability probe | 882-929 | 48 | ctx, settings → modelMatcher, probeStrictCapable |
| systemNote + parseDeps (PassClosureDeps) | 931-958 | 28 | pi, ctx → parseDeps |
| tool snapshot + active/watch roots | 972-1045 | 74 | pi, discovered → registrySnapshot, inProcessToolNames, activeRoots, discoveryWatchRoots |
| extracted-helper calls (buildPassPlacement, buildDispatchLadder) | 1049-1069 | 21 | destructure 7 products |
| run-card + status trace | 1071-1098 | 28 | ctx, statusBus → runCard, statusTrace |
| producerDeps literal (createProductionProducerDeps arg) | 1100-1234 | 135 (92 comment) | consumes ~20 prior locals |
| discovery parse loop | 1238-1259 | 22 | discovered, parseDeps → parsedInputs |
| invoke graph + executable probe | 1264-1287 | 24 | parsedInputs → invokeGraph, subagentExecutableProbe |
| per-theta gate loop | 1289-1629 | 341 | 11 `continue` gates minting `theta/load/*` codes; ~15 shared locals (prior triage count) → thetas, importClosureDirs |
| divergence refusal + refusal envelope + watch-root union + return | 1639-1697 | 59 | thetas, discoveryWatchRoots → survivors, watchRoots |

Excerpt (extracted-helper seam the fix landed, 1049-1063):
```ts
  const { emitResultEnvelope, placementAtLoad, placementPolicy, subagentOpenWire } =
    buildPassPlacement({
      ...
  const { dispatchLadderProbe, hostLoopDispatch, subagentOutcomeEvents } =
    buildDispatchLadder({ pi, ctx, clock });
```

## Why this is a problem
Strong band: presumption of breakdown, a strong concrete reason is required to
keep the residual whole. Reasons considered and defeated: (1) single algorithm
with ≥6 shared locals — per the PTQ-1151 triage record this holds only for the
per-theta gate loop (1289-1629, ~15 locals), not the sequential construction
phases, whose fan-in each stays under 6 (verified again for the settings,
discovery, and probe phases above); (2) closed-enumeration dispatch — the gate
loop's 11 `continue` gates cite eleven distinct authorities (Step 0(f),
RFC-0012 §6, V20a, RFC 0011 §3.3, PIC-64 rung 3, INV, FN, IMP, Erratum B,
binder-model), not one spec table; (3) generated code — 0 `@generated`/`DO NOT
EDIT` markers; (4) exemption — quality/exemptions.json has no key for this
file or `#runComposePass`; (5) prior split reverted — none; the PTQ-1151 fix
(501d782b) landed and stuck, but extracted only 2 of the 14 filed phases. No
open or intake finding carries this d9_host after PTQ-1151 moved to resolved
(grep of quality/issues + quality/intake → 0 hits).

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: producerDeps literal → `buildProducerDeps(...)`
helper (hypothesis) — 135 LOC, 0 exported symbols moved, 0/0 external
importers, consumes ~20 pass locals (the seam cost; a deps-context object
would be needed). Seam B: per-theta gate loop body → `composeOneTheta(...)`
(hypothesis) — 341 LOC, 0 exported symbols, 0/0 importers, ~15-member
pass-context object required. Seam C: discovery + settings + regime phases →
`resolvePassInputs(...)` (hypothesis) — ~120 LOC, 0 exported symbols, 0/0
importers, returns settings/discovered/markedRoot/placementSelector.

## False-positive check
Band: strong per the authoritative map (1017 LOC ≥ 200). Reasons-considered
list above with defeating evidence per reason. Exemptions check:
quality/exemptions.json holds four keys, none for this file or function.
Generated-code check: 0 marker hits in 681-1697. Spec-mirror check: the gate
loop cites eleven distinct bug/spec authorities, no single closed enumeration.
Duplicate check: PTQ-1151 is status fixed (commit 501d782b); no
`d9_host: ...#runComposePass` row exists in quality/issues or quality/intake;
residual-after-fix filings are established store practice (PTQ-1284, PTQ-1287,
PTQ-1288, PTQ-1290). Every cited range re-read at HEAD immediately before
filing.

## Triage
verdict: questionable — accounting verified: `size-scan.mjs map` reproduces runComposePass at 681-1697, 1017 LOC, band strong (FN strong ≥ 200 per `size-scan bands`), unexported 0/0 importers, with buildPassPlacement 1700-1800 (101) and buildDispatchLadder 1803-1868 (66) present as the PTQ-1151 fix products (501d782b, 818-line diff on this file, 0 reverts); the 1049-1063 excerpt is byte-exact; all fifteen inventory rows open at the cited boundaries as distinct imperative phases (seam defaulting 741-745, recording tee from 758, settings 794, selector 814, discovery 837-877, matcher 882, systemNote/parseDeps 931-958, registrySnapshot 972, run card 1071, producerDeps 1100-1234 with 92 comment lines, parse loop 1238, invokeGraph 1264, gate loop 1289-1629 with exactly 11 `continue` gates minting 8 distinct `theta/load/*` codes, refuseDivergedChildCallables tail 1639-1697); 581 of 1017 lines are comment lines as stated; exemptions.json has four keys, none for this file or `#runComposePass`; 0 `@generated|DO NOT EDIT` hits; no overlooked reason — the ≥6-locals algorithm reason still covers only the gate loop, the gates cite distinct authorities (no spec table), and no exemption/revert exists; not a duplicate — PTQ-1151 is status fixed and its host key is the only prior `#runComposePass` row, sibling d9-03 targets `#composeExtensionInstance`; per the D9 protocol the residual seam shape (A/B/C hypotheses, notably C's ~15-member pass-context object) is a design decision for human ruling, never confirmed (triage: claude-fable-5-1)
