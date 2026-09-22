---
id: PTQ-1265
title: src/runtime/tool-call-static-checks.ts is a parse-time diagnostic module living in runtime/ — every import and every emitted code is parse-layer, zero runtime members touched
lens: D9
status: open
verdict: confirmed
locations:
  - src/runtime/tool-call-static-checks.ts:1-368
  - src/parser/theta-document.ts:77
  - src/runtime/tool-call.ts:39-46
sites: 1
fix_scope: cross-module
d9_class: misplacement
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# src/runtime/tool-call-static-checks.ts is a parse-time diagnostic module living in runtime/ — every import and every emitted code is parse-layer, zero runtime members touched

## Observation
src/runtime/tool-call-static-checks.ts (368 LOC) is the module PTQ-1157's fix extracted from tool-call.ts; its own header names it "Parse-time tool-call argument checks and schema-subset disjointness." It emits parse diagnostics only (all four codes are `theta/parse/*`), imports only parser/ and diagnostics/ members, and touches no member of its own runtime/ layer. Its non-barrel consumers are one parser/ module and two extension/ static-check modules; the only runtime/ reference is tool-call.ts's compatibility re-export. PTQ-1157's own Seam A left the home open ("tool-call-static-checks.ts (or a parser/-side module, matching its two parser imports)"); the extraction landed in runtime/.

## Evidence
Affinity counted both ways. The module touches 4 members of foreign layers and 0 of its own:
- parser/: `isBareObjectLiteral` (../parser/literal-sublanguage, line 18), `splitTopLevelUnion` (../parser/type-layer-checks, line 22)
- diagnostics/: `Diagnostic`, `SourceRange` types (../diagnostics/diagnostic, line 17)
- runtime/: none — the file imports nothing from ./ (no value.ts, no query-error, no depth walk).

src/runtime/tool-call-static-checks.ts:17-22:
```ts
import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { isBareObjectLiteral } from "../parser/literal-sublanguage";
// RFC 0002: reuse the single top-level-union splitter (the schema-subset
// disjointness reduction below and the type-layer checks must agree on arm
// boundaries); a duplicate previously lived here and was removed.
import { splitTopLevelUnion } from "../parser/type-layer-checks";
```

Emitted codes (grep `theta/parse` on emission sites, 4 hits): `theta/parse/tool-arg-arity` (line 145), `theta/parse/tool-arg-not-object-literal` (line 175), `theta/parse/tool-arg-type-mismatch` (line 200), `theta/parse/tool-arg-schema-conflict` (line 227). No `theta/runtime/*` code appears in the file.

Importers (grep `tool-call-static-checks` across src/, 5 hits): parser/theta-document.ts:77, extension/invoke-static-checks.ts:114, extension/invoke-expr-call-surface.ts:19 (direct), runtime/tool-call.ts:39-46 (re-export only), plus extension/with-clause-static-checks.ts:19 consuming through that re-export. Map importer count for `checkToolCallArguments`: 4/0 (src/tests). So the runtime/ directory contributes zero behavioural consumers — the parser needs it (theta-document.ts:2904 spreads its diagnostics into the whole-document parse), and the round trip is parser/theta-document.ts → runtime/tool-call-static-checks.ts → parser/literal-sublanguage + parser/type-layer-checks.

Sibling pattern: the other parse-time checking machinery this module leans on lives in parser/ — literal-sublanguage.ts (the bare-object-literal recognizer it calls) and type-layer-checks.ts (the union splitter it calls, whose header note at line 19-21 records that a duplicate splitter "previously lived here and was removed" precisely to keep arm boundaries single-sourced with the type-layer checks).

## Why this is a problem
Counted affinity: 4 foreign-layer members touched, 0 own-layer members; 4 of 4 emitted diagnostic codes are parse-layer; 0 of 4 behavioural importers are runtime/ modules. A parse-diagnostic emitter homed in runtime/ makes the layer boundary read backwards at every consumer — parser/theta-document.ts must reach into runtime/ to run a parse check that immediately calls back into two parser/ modules. The one runtime/ tie is tool-call.ts's re-export (lines 39-46, "re-exported here for existing callers"), which is compatibility scaffolding, not a code dependency: tool-call.ts uses none of the re-exported symbols in its own 400+ LOC of runtime carriers.

## Suggested direction (non-binding, optional)
Hypothesis (unproven; the human ratifies): re-home the module to src/parser/tool-call-static-checks.ts — 368 LOC, exported symbols moved: checkToolCallArguments (4/0 importers), computeToolArgSchemaConflict (1/0), ToolCallCalleeKind, ToolCallStaticResolution, ToolArgSchemaConflictFacts, ToolCallArgCheckInput; cross-references back into runtime/: none. The tool-call.ts re-export can point at the new home unchanged or be retired once the with-clause consumer imports directly. This is the home PTQ-1157's Seam A already named as the alternative.

## False-positive check
Affinity counted both ways: 4 foreign members named (isBareObjectLiteral, splitTopLevelUnion, Diagnostic, SourceRange), 0 runtime/ members (verified: no `./` import in the file). Sibling-pattern citation: parser/literal-sublanguage.ts and parser/type-layer-checks.ts host the parse-check machinery this module extends; parser→runtime imports do exist elsewhere (params.ts:58, type-layer-checks.ts:72-75) so the move creates no new import direction. Duplicate check: PTQ-1157 (resolved) filed the *breakdown* of tool-call.ts and was fixed by this extraction — this finding is the placement of the survivor, a question PTQ-1157 explicitly left open; no pending candidate names tool-call-static-checks.ts (this wave's parser-affinity filings target extension/with-clause-static-checks.ts and extension/invoke-callee-arity.ts, different files). Exemptions check: quality/exemptions.json has no entry for this host. Barrel check (not a husk claim, but verified): tool-call.ts:8-9 documents the re-export as deliberate compatibility, so no husk is alleged there.

## Triage
verdict: questionable — accounting verified: file is 368 LOC with exactly three imports (diagnostics/ types + parser/literal-sublanguage isBareObjectLiteral + parser/type-layer-checks splitTopLevelUnion), no ./ runtime import and no runtime member used; all four emitted codes are theta/parse/* at 145/175/200/227; behavioural importers are parser/theta-document.ts:77 (spreads at 2904), extension/invoke-static-checks.ts:114, extension/invoke-expr-call-surface.ts:19 and extension/with-clause-static-checks.ts:19 via the tool-call.ts:39-46 compatibility re-export (header line 8 documents it), zero runtime/ consumers; sibling pattern (parser/literal-sublanguage, parser/type-layer-checks) real and parser→runtime imports already exist at params.ts:58 / type-layer-checks.ts:72-75; resolved PTQ-1157 Seam A (line 57) does name "or a parser/-side module" as the open alternative; no exemption, no other intake/issue names this file — the parser/ home is a design decision needing a human ruling (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: accounting reproduces — wc gives 368 LOC; the only imports are diagnostics/diagnostic (types), parser/literal-sublanguage isBareObjectLiteral and parser/type-layer-checks splitTopLevelUnion at :17-22 with no ./ runtime import (0 own-layer members, 4 foreign); the four emitted codes are all theta/parse/* at :145/:175/:200/:227 and no theta/runtime/* appears; importers are exactly parser/theta-document.ts:77 (spread at :2904), extension/invoke-static-checks.ts:114, extension/invoke-expr-call-surface.ts:19, plus runtime/tool-call.ts:39-46 as a header-documented (:8-9) compatibility re-export consumed only by extension/with-clause-static-checks.ts:19 — zero runtime/ behavioural consumers; parser→runtime imports already exist (params.ts:58, type-layer-checks.ts:72-75); resolved PTQ-1157 line 57 names "or a parser/-side module" as the open alternative; no exemptions.json row for the host; the only other filing naming this file (qw20260922150013-d9-02-invoke-callee-arity) is a different host, so not a duplicate — the parser/ re-home is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — third independent re-verification, accounting reproduces in full: wc 368 LOC; imports are exactly :17 diagnostics/diagnostic (types), :18 parser/literal-sublanguage isBareObjectLiteral, :22 parser/type-layer-checks splitTopLevelUnion — no ./ runtime import, 0 own-layer members vs 4 foreign; emission sites :145/:175/:200/:227 are all theta/parse/* and grep finds no theta/runtime/* in the file; grep across src/ extensions/ tools/ tests/ gives importers parser/theta-document.ts:77 (spread :2904), extension/invoke-static-checks.ts:114 (:630), extension/invoke-expr-call-surface.ts:19 (:114), and runtime/tool-call.ts:39-46 re-export (header :8-9 documents it; tool-call.ts names the symbols only in comments :30/:71, never as code) consumed solely by extension/with-clause-static-checks.ts:19 — zero runtime/ behavioural consumers; parser→runtime imports pre-exist at params.ts:58 and type-layer-checks.ts:72-75; resolved PTQ-1157:57 Seam A does name "or a parser/-side module"; exemptions.json has no row for either host; the two sibling intake files (d9-01-with-clause, d9-02-invoke-callee-arity) cite this module only as a reference and have different hosts, and PTQ-1181 targets with-clause-gate, so not a duplicate — per D9 misplacement rules accurate accounting is never confirmed; the parser/ re-home needs a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
