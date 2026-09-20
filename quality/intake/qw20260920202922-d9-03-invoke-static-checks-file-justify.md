---
id: pending
title: invoke-static-checks.ts bundles the callee-arity type model, three call-surface check groups, with-clause classification, graph construction, and the orchestrator in one 1343-LOC module
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/invoke-static-checks.ts:1-1343
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/invoke-static-checks.ts
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# invoke-static-checks.ts bundles the callee-arity type model, three call-surface check groups, with-clause classification, graph construction, and the orchestrator in one 1343-LOC module

## Observation
`src/extension/invoke-static-checks.ts` is 1343 LOC (file band justify per the map). Its header states the role: "Load-time (compose-pass) orchestration for invoke static checks, with the invoke-expression surface and shared type collection/rendering delegated to invoke-expr-call-surface.ts" (lines 1-3). Two ratified cross-module moves already happened at this host — PTQ-0370 moved the four imported-symbol checks to `./invoke-imported-checks.ts`, and PTQ-0413's fix moved the invoke-expression surface to `./invoke-expr-call-surface.ts` — yet the file still holds seven separable declaration groups, and an earlier file-level filing on exactly this host (qw20260914091051-d9-01-invoke-static-checks-seven-subsystems-bundled) was ruled "deferred for sequencing, not refused" with only its Seam A since landed. No file-level breakdown finding is currently on record (all resolved `d9_host` entries on this file are `#checkInvokeStaticResolution`).

## Evidence
Distinct-concern inventory (declaration ranges and LOC from the map; every range re-read this session):

| concern | members | line ranges | LOC |
|---|---|---|---|
| call-site collection walk (bug 0071 one-walker rule) | `CollectedCallSites` (1 src/0 tests), `collectInvokeExprs`, `collectCallSites` (1/0), `ThetaCallableCallSite`, `resolveThetaCallableCallSites`, `collectThetaCallableCallSites` (0/1) | 197-336 | 89 |
| invoke graph construction (INV-4) | `resolveCalleeAbsolute`, `buildInvokeGraph` (1/3) | 429-499 | 36 |
| callee arity + argument-slot type model | `buildComposePassSuccessTypes`, `CalleeArityField` (1/0), `CalleeArity` (2/5), `toolParameterProperties`, `SCHEMA_REFINEMENT_KEYS`, `fieldSchemaType`, `buildInvokeArgSlot`, `dedupeArgType` (1/0) | 158-181, 505-712 | 166 |
| non-invoke call-surface checks | `checkClauseCwdType`, `checkThetaCallableCallSurface`, `checkRuntimeToolCallSurface` | 353-426, 723-894 | 236 |
| with-clause classification (RFC 0009 Erratum A′/B, RFC 0012 §10) | `checkWithClauseDefaultReject`, `topLevelSubagentFnNames`, `importedLocalNames`, `checkImportedWithClauseCallees` (1/1) | 927-1054 | 111 |
| Pi-tool provable disjointness (bug 0072) | `checkPiToolArgDisjointness` | 1062-1144 | 83 |
| compose-pass orchestrator | `checkInvokeStaticResolution` (1/5) | 1215-1343 | 129 |

Seven rows. Sibling pattern already in the tree: the with-clause MODE gate lives in its own module (`./with-clause-prompt-mode-gate.ts`, imported at line 130), and the invoke-expr surface plus shared type collection live in `./invoke-expr-call-surface.ts` (imported at 148-154) — which imports `CalleeArity`/`CalleeArityField` back from this file (`invoke-expr-call-surface.ts:23`), a type-level mutual reference between the two modules that exists only because the arity model lives beside the orchestrator.

## Why this is a problem
Justify band (1343 ≥ 1000): presumption of breakdown — not filed only when a concrete reason to keep whole is found and recorded. Reasons considered and defeated: (a) single algorithm with shared local state — the concerns already communicate by parameters (`checkInvokeStaticResolution` threads `typeEnv`/`typePass`/`callSites` explicitly at 1248-1330); no shared closure state spans groups; (b) closed-enumeration dispatch — the header enumerates spec items, but the LOC sits in seven declaration groups, not switch arms; (c) data-only — one 15-LOC constant table (`SCHEMA_REFINEMENT_KEYS`), far under 80%; (d) grammar production — no; (e) generated — hand-written. The prior human posture on this exact host was deferral pending PTQ-0319/0330 and Seam A ("let those land first, then re-file"); all three named blockers/moves are in quality/resolved/, so the deferral's condition is spent. No `quality/exemptions.json` entry for this file (read this session).

## Suggested direction (non-binding, optional)
Hypotheses, unproven, human ratifies one. Seam A: the callee arity + argument-slot type model (158-181, 505-712, ~166 LOC) -> `./invoke-callee-arity.ts` (hypothesis) — 3 exported symbols moved (`CalleeArity` 2 src/5 tests, `CalleeArityField` 1/0, `dedupeArgType` 1/0), external importers re-point (`invoke-expr-call-surface.ts`, `production-composition.ts`), cross-references back into the host: none (the group reads only parser/runtime modules); this also dissolves the type-level mutual reference between this file and `invoke-expr-call-surface.ts`. Seam B: the with-clause classification group + `checkClauseCwdType` (353-426, 927-1054, ~185 LOC) -> `./with-clause-static-checks.ts` beside the existing `with-clause-prompt-mode-gate.ts` (hypothesis) — 1 exported symbol moved (`checkImportedWithClauseCallees`, 1 src/1 test), cross-references back: `collectCallSites`, `collectProvableArgTypes`/`renderCollectedTypes` (already exported by `invoke-expr-call-surface.ts`). Seam C: none identified yet for the remaining surface checks (they share the orchestrator's per-pass `typeEnv`/`typePass` wiring).

## False-positive check
Band: justify (1343, between 1000 and 1999) from the authoritative map, not recounted. Reasons-considered list above with defeating evidence per reason. Exemptions check: no `invoke-static-checks` key in `quality/exemptions.json` (read this session). Generated-code check: hand-written (bug/RFC-numbered comments; git log shows hand-edited quality/bug commits). Spec-mirror check: the header's IMP/INV/RFC roster names wired checks, not a closed enumeration whose arms this file's length mirrors. Duplicate check: PTQ-0321/0351/0413 are resolved and carry the function host `#checkInvokeStaticResolution`; PTQ-0370 (misplacement) is resolved and its ratified move landed; the qw20260914091051-d9-01 file-level candidate was never minted as a PTQ and its deferral text invites the re-file after PTQ-0319/0330/Seam A — all three verified in quality/resolved/; no pending intake candidate targets this file-level host.

## Triage
verdict: questionable — accounting verified against HEAD: size-scan map reproduces src/extension/invoke-static-checks.ts at 1343 LOC / band justify with the 25 declarations at the cited ranges (call-site walk 197-336, graph 429-499, arity/slot model 505-712 + buildComposePassSuccessTypes 158-181, checkClauseCwdType 353-426 + checkThetaCallableCallSurface 723-830 + checkRuntimeToolCallSurface 841-894 = 236 LOC, with-clause group 927-1054 = 111 LOC, checkPiToolArgDisjointness 1062-1144 = 83 LOC, checkInvokeStaticResolution 1215-1343 = 129 LOC; two row sums drift by ~10 LOC, immaterial); every row is a real distinct concern — module-level functions with no shared closure state, the orchestrator threads callSites/typeEnv/typePass by parameter at 1248-1330; the type-level back-import `import type { CalleeArity, CalleeArityField } from "./invoke-static-checks"` is real at invoke-expr-call-surface.ts:22 (cited :23, one-line drift); `grep invoke-static-checks quality/exemptions.json` → no match; no generated marker; git log shows the three prior extractions (PTQ-0321/0351/0413/0370) stuck, none reverted; no closed-enumeration switch or ≥80% data body; bug 0071's one-walker rule constrains how many walkers exist, not which file hosts them (collectCallSites is already imported by import-static-checks.ts:122). Dedupe: PTQ-0321/0351/0413 are resolved and keyed to `#checkInvokeStaticResolution`, PTQ-0370 is a resolved misplacement whose move landed, and TRIAGE_LOG:64 records qw20260914091051-d9-01 as human-deferred pending PTQ-0319/0330/Seam A (all in quality/resolved/) with an explicit "then re-file" — so no tracked file-level root cause exists and this re-file is legitimate; the two invoke-named intake siblings are D4. D9 breakdown target shape (Seam A/B hypotheses) is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
