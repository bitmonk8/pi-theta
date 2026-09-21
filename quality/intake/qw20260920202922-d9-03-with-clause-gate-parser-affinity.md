---
id: pending
title: withClausePromptModeRefusal lives in src/extension/ but touches only parser-module members, and its rule siblings all live in parser/invoke-diagnostics.ts
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/with-clause-prompt-mode-gate.ts:43-61
sites: 1
fix_scope: cross-module
d9_class: misplacement
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# withClausePromptModeRefusal lives in src/extension/ but touches only parser-module members, and its rule siblings all live in parser/invoke-diagnostics.ts

## Observation
src/extension/with-clause-prompt-mode-gate.ts (61 LOC) holds one declaration, `withClausePromptModeRefusal` (lines 43-61) — a pure invoke gate rule: given a call-site `with` clause and a resolved callee mode, it returns the `theta/parse/with-clause-prompt-mode-callee` Diagnostic or undefined. The module imports exclusively from src/parser/ and src/diagnostics/ (lines 19-26) and uses no member of any src/extension/ module. Its header (lines 7-13) explains the PTQ-0364 extraction as a size decision about invoke-static-checks.ts, not a directory-placement decision.

## Evidence
Affinity counted both ways: the declaration touches 5 members of parser modules and 0 of its own extension layer. Parser members: `withClausePromptModeCalleeMessage`, `WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE`, `WITH_CLAUSE_PROMPT_MODE_CALLEE_HINT` (all three declared in src/parser/invoke-diagnostics.ts — constants at lines 91 and 375), `CallWithClause` (src/parser/theta-document.ts), `ThetaMode` (src/parser/frontmatter.ts). Extension members touched: 0 (the map's import list for the file names no ./ import). Excerpt, src/extension/with-clause-prompt-mode-gate.ts:19-26:

```typescript
import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import type { CallWithClause } from "../parser/theta-document";
import type { ThetaMode } from "../parser/frontmatter";
import {
  withClausePromptModeCalleeMessage,
  WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE,
  WITH_CLAUSE_PROMPT_MODE_CALLEE_HINT,
} from "../parser/invoke-diagnostics";
```

Sibling pattern, cited per instance: the codebase's other pure invoke gate rules — functions that take site facts and return Diagnostics — are declared in src/parser/invoke-diagnostics.ts and imported by extension callers: `checkInvokeExtension` (imported at src/extension/production-composition.ts:173 and src/parser/callable-set.ts:37), `checkCalleeHasErrors` (src/extension/subagent-fn-static-checks.ts:30, production-composition.ts:173), `checkFnCallArity` (src/extension/invoke-imported-checks.ts:45, src/parser/type-layer-checks.ts:110), `checkInvokeReturnType` (src/parser/type-layer-checks.ts:110). This rule's own code/hint/message vocabulary already lives in that same module.

Importer counts from the structural map: `withClausePromptModeRefusal` — 2 src / 0 tests. Both callers are extension files that already import parser/invoke-diagnostics directly (src/extension/invoke-static-checks.ts:116 and 126; src/extension/invoke-expr-call-surface.ts:11 and 23), so the current placement adds an extension module on a path where the parser module is already imported.

## Why this is a problem
Counted affinity: 5 parser members + 2 diagnostics members used, 0 extension members — the declaration's affinity is entirely below the extension layer, and every sibling-in-kind (the four rule functions named above) lives in parser/invoke-diagnostics.ts alongside this rule's own three constants. A rule whose message builder, code constant, and hint constant live in one parser module while its 19-LOC body sits alone in an extension module splits one vocabulary across a layer boundary for no counted extension dependency.

## Suggested direction (non-binding, optional)
Hypothesis, unproven: re-home `withClausePromptModeRefusal` into src/parser/invoke-diagnostics.ts beside its constants and rule siblings (that module is 687 lines; the 19-LOC rule does not change its band), and dissolve with-clause-prompt-mode-gate.ts; both existing importers already import that parser module. The human ratifies the home.

## False-positive check
Affinity counted both ways (5 parser + 2 diagnostics members vs 0 extension members, names listed). Sibling-pattern citation: four named rule functions with their declaring module and importer sites. Barrel/facade check: the module is not a re-export barrel — it declares the function body. Header-intent check: the PTQ-0364 note (lines 7-13) justifies extraction out of invoke-static-checks.ts by that file's size, and says nothing that binds the new module to src/extension/. Layer-grain check: extension→parser imports are the established direction (6 extension files import parser/invoke-diagnostics), so the move removes an extension module without adding any new layer edge. Duplicate check: PTQ-0364 (duplication, resolved by this extraction) and qw20260920183643-d2-07 (stale caller name in this header) cover different observations; neither claims misplacement.

## Triage
verdict: questionable — accounting verified: 61-LOC module holds the single declaration at 43-61; imports are exclusively ../parser (CallWithClause, ThetaMode, 3 invoke-diagnostics members at lines 91/375/379) and ../diagnostics, 0 extension members; the four cited sibling rules (checkInvokeReturnType 342, checkFnCallArity 507, checkInvokeExtension 613, checkCalleeHasErrors 665) are declared in parser/invoke-diagnostics.ts with importers at the cited lines; callers are exactly 2 src / 0 tests, both already importing parser/invoke-diagnostics (116, 11); not a barrel, no exemption row; the header's named INV-6 sibling checkClauseCwdType stays in extension but depends on TypeEnv/StaticTypeInferencePass so it is not a comparable pure sibling — re-homing is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently at HEAD: size-scan map reproduces the module at 60 LOC with the single exported declaration `withClausePromptModeRefusal` (42-60, 19 LOC, one-line drift from 43-61) and imports only ../diagnostics/diagnostic, ../parser/theta-document, ../parser/frontmatter, ../parser/invoke-diagnostics — 0 extension members touched vs 5 parser members (CallWithClause, ThetaMode, and the three invoke-diagnostics members declared at 91/375/379); the four cited sibling rules are real exports of parser/invoke-diagnostics.ts (checkInvokeReturnType 342, checkFnCallArity 507, checkInvokeExtension 613, checkCalleeHasErrors 665) with importers at production-composition.ts:169, callable-set.ts:37, subagent-fn-static-checks.ts:30, invoke-imported-checks.ts:46, type-layer-checks.ts:110 (≤4-line drift); grep over src/extensions/tools/tests finds exactly the 2 src callers (invoke-static-checks.ts:126, invoke-expr-call-surface.ts:23), both already importing ../parser/invoke-diagnostics (116, 11); 6 extension files import that parser module so the move adds no new layer edge; not a barrel (declares the body), no exemptions.json row for either file; header's PTQ-0364 rationale is size-only, and its named INV-6 sibling checkClauseCwdType (353) takes TypeEnv/StaticTypeInferencePass so it is not a comparable pure rule; dedupe: PTQ-0364 (resolved duplication), PTQ-1104 (header staleness on this file), PTQ-0370 (different misplacement) and same-wave d9-03-invoke-static-checks-file-justify (breakdown of the caller) are different root causes — the home is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time at HEAD: size-scan map on a one-line manifest gives 60 LOC / band exempt (placement review applies) with the single exported declaration withClausePromptModeRefusal 42-60 (19 LOC, 2 src / 0 tests importers) and imports only ../diagnostics/diagnostic, ../parser/theta-document, ../parser/frontmatter, ../parser/invoke-diagnostics — affinity recounted at 5 parser members (CallWithClause, ThetaMode, WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE:91, WITH_CLAUSE_PROMPT_MODE_CALLEE_HINT:375, withClausePromptModeCalleeMessage:379) + 2 diagnostics types vs 0 extension members; the four cited sibling rules are real exports of parser/invoke-diagnostics.ts (342/507/613/659) imported at invoke-imported-checks.ts:46, production-composition.ts:169, subagent-fn-static-checks.ts:30, callable-set.ts:37, type-layer-checks.ts:112 (≤6-line drift); grep across src/extensions/tools/tests finds exactly the 2 callers (invoke-static-checks.ts:126→758, invoke-expr-call-surface.ts:23→482), both already importing ../parser/invoke-diagnostics, and 6 extension files import that parser module so no new layer edge; quality/exemptions.json has no row for either file; not a barrel (declares the body); header 7-13 gives a size-only PTQ-0364 rationale and its named INV-6 sibling checkClauseCwdType (invoke-static-checks.ts:353-361) takes typeEnv: TypeEnv / typePass: StaticTypeInferencePass so it is not a comparable pure rule; dedupe: PTQ-0364, PTQ-0370, PTQ-1104 are all in quality/resolved/ (status fixed) with different root causes, and the same-wave d9-03-invoke-static-checks-file-justify is a breakdown on a different host — the re-home is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
