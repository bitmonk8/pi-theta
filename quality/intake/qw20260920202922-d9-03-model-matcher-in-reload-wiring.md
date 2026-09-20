---
id: pending
title: createModelReferenceMatcher and its two surface types live in extension/reload-wiring.ts while their types and consumers sit in parser/frontmatter and binder/binder-model
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/reload-wiring.ts:494-559
sites: 1
fix_scope: cross-module
d9_class: misplacement
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# createModelReferenceMatcher and its two surface types live in extension/reload-wiring.ts while their types and consumers sit in parser/frontmatter and binder/binder-model

## Observation
`src/extension/reload-wiring.ts` (V9b, "registration steps and reload-wiring seams" per its header) hosts a model-reference-matching cluster at lines 494-559: `AvailableModel` (498-505), `ModelRegistrySurface` (508-510), `createModelReferenceMatcher` (520-548), and the private `outcomeOf` (551-559), ~66 LOC. The cluster implements the exact-match model-resolution rule of `binder-model-and-context.md#binder-model-parse-rule` / `host-interfaces-core.md#model-registry-pin`. Its contract types (`ModelReferenceMatcher`, `ModelMatchOutcome`) are declared in `src/parser/frontmatter.ts`, and one of its two production consumers is `src/binder/binder-model.ts` — a `binder/`-layer module importing a value from `extension/`.

## Evidence
Affinity counted both ways:

- The cluster touches 4 foreign symbols of `src/parser/frontmatter.ts` — `ModelReferenceMatcher` (return type), `ModelMatchOutcome` (both `createModelReferenceMatcher` and `outcomeOf`), plus `ParseFrontmatterOptions` / `FrontmatterParseResult` via its sole in-file consumer `loadPassParse` (582-592) — and 0 members of reload-wiring's own concerns (`ThetaRegistry`, `ParsedTheta`, `rebuildAndSwap`, `dropCollidingThetas`, `structuralChangeNote`: no reference in lines 494-559 in either direction).
- Layer crossing with counts, `src/binder/binder-model.ts:49-52` (re-read before filing):

```typescript
import {
  createModelReferenceMatcher,
  type ModelRegistrySurface,
} from "../extension/reload-wiring";
```

Production consumers (grep over `src/`, 2026-09-20, 3 hits outside the defining file): `binder/binder-model.ts:463` (`const matcher = createModelReferenceMatcher(deps.modelRegistry);`), `extension/production-composition.ts:879`, and the in-file `loadPassParse` at `reload-wiring.ts:590` — where `loadPassParse` itself has 0 src importers per the structural map (0/1, test-only). Structural-map importer counts: `createModelReferenceMatcher` 2/4, `ModelRegistrySurface` 1/1, `AvailableModel` 0/2.

`binder-model.ts`'s own header states the dependency is on the shared resolver, not on reload wiring: "the SAME shared `ModelReferenceMatcher` instance V6a's `model:` resolution binds ... (host-interfaces-core.md#model-registry-pin)".

## Why this is a problem
Correct code in the wrong module: the cluster references 4 members of a foreign host (`parser/frontmatter`'s matcher contract) and 0 members of its own host, its spec anchors (`binder-model-and-context.md`, `host-interfaces-core.md#model-registry-pin`) are model-resolution documents rather than the registration/reload spec (`registration-steps.md` PIC-36..39) the rest of the file mirrors, and its placement forces the only cross-layer import from `src/binder/` into `src/extension/` found in this file's consumer set. The sibling pattern points elsewhere: the matcher's interface family (`ModelReferenceMatcher`, `ModelMatchOutcome`) lives in `src/parser/frontmatter.ts`, so the one implementation of that interface living two layers up is the outlier instance.

## Suggested direction (non-binding, optional)
Rightful-home hypothesis (unproven): move `AvailableModel`, `ModelRegistrySurface`, `createModelReferenceMatcher`, `outcomeOf` (~66 LOC) next to the contract — `src/parser/frontmatter.ts` or a small `src/parser/model-reference-matcher.ts` — with `reload-wiring.ts` re-exporting or its two src importers (`binder/binder-model.ts`, `extension/production-composition.ts`) repointed; this removes the binder→extension layer crossing. The human ratifies the home.

## False-positive check
Affinity counts both ways recorded above (4 foreign vs 0 own, names listed). Sibling-pattern citation: the matcher contract types are declared in `parser/frontmatter.ts` (verified via reload-wiring's import block, lines 30-36). Header-intent check: reload-wiring's header does claim "the model-reference-matcher production wiring point" as an owned bullet — the claim was read and weighed; the counted affinity and the binder→extension value import stand regardless of the claim. Deliberate-facade check: n/a (misplacement, not husk). `loadPassParse`'s 0-src-importer status is routed to D2 in the shard notes, not filed here. All cited ranges (reload-wiring 494-592, binder-model 40-60) re-read immediately before filing.

## Triage
verdict: questionable — accounting verified: cluster at reload-wiring.ts:494-559 touches 0 own-host members and the `ModelReferenceMatcher`/`ModelMatchOutcome` contract from parser/frontmatter.ts:71,86; binder-model.ts:48-51 value-imports it from extension/; size-scan importer counts 0/2, 1/1, 2/4, 0/1 reproduce; header bullet (lines 13-15) explicitly claims the wiring point and binder-model.ts:54 also type-imports from extension/, so the rightful home (frontmatter vs new parser module vs stay) needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified on re-triage: cluster (now reload-wiring.ts:497-562 after 3-line drift) touches 0 own-host members (grep for ThetaRegistry/ParsedTheta/rebuildAndSwap/dropCollidingThetas/structuralChangeNote/ReloadFailureInjector in the range: none) and only the frontmatter.ts:71,86 contract types; binder-model.ts:48-51 value-imports it from extension/; size-scan map reproduces 0/2, 1/1, 2/4, 0/1 and the host is band exempt (placement review permitted); no duplicate (PTQ-0106/0272/0513/1103 are different root causes); header bullet 16-18 claims the wiring point and binder-model.ts:54 already type-imports from extension/, so the home is a design ruling, never confirmed for D9 (triage: claude-fable-5-1)
