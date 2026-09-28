---
id: PTQ-1649
title: Bug 0354's fix record credits tests/invoke-depth-cycle.test.ts with pinning the two production pushCountableFrame sites' wiring, but that file imports only the src/runtime/invoke-depth-cycle primitives
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0354-crossfile-thetalib-fn-frames-uncounted.md:263-266
  - docs/bugs/0354-crossfile-thetalib-fn-frames-uncounted.md:296-299
  - docs/bugs/0354-crossfile-thetalib-fn-frames-uncounted.md:18-20
  - docs/bugs/0354-crossfile-thetalib-fn-frames-uncounted.md:100-104
  - tests/invoke-depth-cycle.test.ts:1-23
  - tests/invoke-depth-cycle.test.ts:75-321
sites: 2
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0354's fix record credits tests/invoke-depth-cycle.test.ts with pinning the two production pushCountableFrame sites' wiring, but that file imports only the src/runtime/invoke-depth-cycle primitives

## Observation
Bug 0354 (Status: fixed 0.367.0) has a Residual 2 that concedes the b0354 "byte-identical controls" cell asserts the `pushCountableFrame` primitive, not the two production push sites. It then says the production sites' "wiring is pinned by `tests/invoke-depth-cycle.test.ts`". The Provenance repeats this: "the cap fires on the wired classes per `tests/invoke-depth-cycle.test.ts` and the two production push sites". The cited test file imports from `../src/runtime/invoke-depth-cycle`, `../src/diagnostics/diagnostic`, the code registry and the registry oracle, and nothing else. It never reaches a production producer, invoke machinery or subagent spawn site, at the fix commit or today. The record's own Kind line calls this file a unit pin of a primitive "called by nothing". So unit-only evidence is worded as proof of production wiring.

## Evidence
Claim side, `docs/bugs/0354-crossfile-thetalib-fn-frames-uncounted.md:263-266` (Residual 2):
```
  2. *Row-7 control witnesses the primitive (R1).* The "byte-identical
     controls" cell asserts `pushCountableFrame` directly rather than the two
     production push sites; those sites are proven untouched by `git diff` and
     their wiring is pinned by `tests/invoke-depth-cycle.test.ts`.
```
Claim side, `docs/bugs/0354-crossfile-thetalib-fn-frames-uncounted.md:296-299` (Provenance):
```
  deleted): 40-deep cross-file chain → `{"outcome":"value","value":40}`,
  `load diagnostics: []`. Both directions verified (the cap fires on the
  wired classes per `tests/invoke-depth-cycle.test.ts` and the two production
  push sites; it cannot fire on this class — no caller exists to reach it).
```
The same record describes this test as a unit pin of an unwired primitive, `docs/bugs/0354-crossfile-thetalib-fn-frames-uncounted.md:18-20`:
```
- **Kind:** defect — registered-but-unwired enforcement. The INV-4 classifier
  for exactly this frame class is in-tree, unit-pinned green
  (`tests/invoke-depth-cycle.test.ts:222–240`), and called by nothing.
```
In §Reproduction, `:100-104`, the record separates the two things: the primitive is "pinned by `tests/invoke-depth-cycle.test.ts`", and the production path "reaches it through `production-theta-producer.ts:3780`", which is a read cite, not a test.

Evidence side, `tests/invoke-depth-cycle.test.ts` (opened). Every import:
```
1:import { readRegistry } from "./helpers/registry-oracle";
2:import { describe, expect, it } from "vitest";
5:import { registryMessage } from "../tools/code-registry/index.js";
22:} from "../src/runtime/invoke-depth-cycle";
23:import type { Diagnostic } from "../src/diagnostics/diagnostic";
```
Its describe blocks (`:75`, `:165`, `:201`, `:229`, `:281`) call `pushCountableFrame`, `newInvokeChain*`, `crossSubagentBoundary`, `thetalibFnFrameKind`, `surfaceDepthOverflow` and `detectInvocationCycle` directly.

Searches run in this session:
- `rg -c "production-theta-producer|invoke-machinery|subagent-spawn-regime|createProductionProducerDeps|executeBody|production-composition" tests/invoke-depth-cycle.test.ts` → 0 hits.
- `rg -n "from \"" tests/invoke-depth-cycle.test.ts` → 5 hits, listed above. None is a production producer or composition module.
- At the fix commit: `git show c5adf2fe:tests/invoke-depth-cycle.test.ts | grep -n "from \""` → 6 imports: `node:url`, `node:fs`, `vitest`, `tools/code-registry/index.js`, `src/runtime/invoke-depth-cycle`, `src/diagnostics/diagnostic`. The same primitive-only surface, so the claim was unsupported when it was written.

## Why this is a problem
Residual 2 exists to explain how the gap it names is covered: the control cell witnesses only the primitive. It closes that gap by pointing at a second test that also witnesses only the primitive. The wording ("wiring is pinned", "the cap fires on the wired classes per …") claims production-wiring evidence that the cited file cannot give. It also contradicts the record's own Kind line, which uses the same file as the example of a unit-pinned, uncalled classifier. A reader auditing ceiling #1 coverage from this record would conclude the `"direct-invoke"` / `"subagent-fn"` production push sites have a regression witness on the strength of a file that never runs them.

## Suggested direction (non-binding, optional)
Reword Residual 2 and the Provenance sentence to say what the cited file pins (the primitive's cap behaviour), and state the production sites' wiring evidence for what it is (a `git diff` untouched check and read cites). Alternatively, name a test that drives those production sites, if one exists.

## False-positive check
- Opened `tests/invoke-depth-cycle.test.ts` in full (imports and all describe/it titles). Ran the two `rg` searches above (0 production-module hits; 5 imports, all primitives, helpers or vitest).
- Checked the version at the fix commit `c5adf2fe` (`git show … | grep "from \""`): same primitive-only import surface. The later edit `cc0a8fe7` (3+/20−) only swapped the registry-read helper. So the claim was never supported, and this is not decay.
- Looked for another test the claim might have meant: `rg -l "33 > 32|\"<depth>\": \"33\"|depth.*33" tests --glob '!tests/live/**'` → 6 files. Opened `tests/subagent-fn.test.ts:622-657`: it also calls `pushCountableFrame` directly ("stood in by `direct-invoke`"), so it is primitive-level too. The record does not cite any of the others.
- I do not judge whether the production sites are correctly wired. The finding is only that the named evidence does not exercise them.
- Not a citation-form issue (the path resolves), and not a coverage request. The finding is the strength of the wording against the named witness.

## Triage
verdict: questionable — accounting verified: 0354 Residual 2 (:263-266, "their wiring is pinned by tests/invoke-depth-cycle.test.ts") and Provenance (:296-299) credit that file with the production push sites, but its only imports are registry-oracle, vitest, tools/code-registry, src/runtime/invoke-depth-cycle and the Diagnostic type (the same primitive-only surface at fix commit c5adf2fe). The production-module grep gives 0 hits, and the describe blocks at :75/:165/:201/:229/:281 call the primitives directly. The record's own Kind line (:18-20) calls it a unit pin of an uncalled classifier. The claim is overstated, but rewording the record is a human ruling (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). APPEND EXACTLY the following block at the very end of docs/bugs/0354-crossfile-thetalib-fn-frames-uncounted.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

Residual 2 and Provenance above credit tests/invoke-depth-cycle.test.ts with pinning the two production pushCountableFrame sites. That file imports and drives only the src/runtime/invoke-depth-cycle primitives (registry oracle aside) and never imports the production modules hosting the push sites, at the fix commit and at HEAD — as the Kind line of this record itself says. The wiring of the two production sites is unwitnessed by that file; the primitive behaviour is what it pins.
