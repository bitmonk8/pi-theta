---
id: pending
title: with-clause-static-checks.ts hosts three with-clause rule checks in src/extension while touching 18 parser members against 3 of its own layer, and its rule sibling already moved to parser/invoke-diagnostics.ts
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/with-clause-static-checks.ts:38-111
  - src/extension/with-clause-static-checks.ts:144-203
  - src/extension/with-clause-static-checks.ts:206-214
  - src/extension/with-clause-static-checks.ts:217-227
  - src/extension/with-clause-static-checks.ts:241-271
sites: 5
fix_scope: cross-module
d9_class: misplacement
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# with-clause-static-checks.ts hosts three with-clause rule checks in src/extension while touching 18 parser members against 3 of its own layer, and its rule sibling already moved to parser/invoke-diagnostics.ts

## Observation
src/extension/with-clause-static-checks.ts (273 LOC, exempt band — placement review) declares five members per the structural map: `checkClauseCwdType` (38-111), `checkWithClauseDefaultReject` (144-203), `topLevelSubagentFnNames` (206-214), `importedLocalNames` (217-227), `checkImportedWithClauseCallees` (241-271). Its header (:1) states the role: "Compose-pass with-clause cwd type checks and local/imported callee classification." All five are static AST rule checks over parser vocabulary (INV-6, INV-8 per the doc comments); the module lives in src/extension and has exactly one src importer, extension/invoke-static-checks.ts:141-142 (two imports plus one re-export).

## Evidence
Affinity counted both ways. The module touches 18 members of src/parser: `invokeArgTypeMismatchMessage`, `withClauseInProcessCalleeMessage`, `withClausePiToolMessage`, `INVOKE_ARG_TYPE_MISMATCH_CODE`, `WITH_CLAUSE_IN_PROCESS_CALLEE_CODE`, `WITH_CLAUSE_IN_PROCESS_CALLEE_HINT`, `WITH_CLAUSE_PI_TOOL_CODE`, `WITH_CLAUSE_PI_TOOL_HINT` (invoke-diagnostics), `CallableSetSnapshot` (callable-set), `StaticTypeInferencePass` (static-type-inference), `CallExpr`, `CallWithClause`, `Stmt`, `ThetaBody` (theta-document), `checkCompatible`, `displayType`, `CompatType`, `TypeEnv` (type-compat). It touches 3 members of its own layer: `collectProvableArgTypes`, `renderCollectedTypes` (./invoke-expr-call-surface), `collectCallSites` (./invoke-static-checks); plus 2 runtime members (`MaterializedImport`, `checkToolCallArguments`) and 2 diagnostics types. Import block excerpt (:4-18):
```ts
import type { CallableSetSnapshot } from "../parser/callable-set";
import {
  invokeArgTypeMismatchMessage,
  withClauseInProcessCalleeMessage,
  withClausePiToolMessage,
  INVOKE_ARG_TYPE_MISMATCH_CODE,
  WITH_CLAUSE_IN_PROCESS_CALLEE_CODE,
  WITH_CLAUSE_IN_PROCESS_CALLEE_HINT,
  WITH_CLAUSE_PI_TOOL_CODE,
  WITH_CLAUSE_PI_TOOL_HINT,
} from "../parser/invoke-diagnostics";
import type { StaticTypeInferencePass } from "../parser/static-type-inference";
import type { CallExpr, CallWithClause, Stmt, ThetaBody } from "../parser/theta-document";
import { checkCompatible, displayType, type CompatType, type TypeEnv } from "../parser/type-compat";
```
Sibling pattern, cited per instance: the with-clause mode gate `withClausePromptModeRefusal` — the same rule family (a pure with-clause callee-classification rule returning a Diagnostic) — was ruled misplaced in src/extension by PTQ-1181 (confirmed, fixed) and now lives at src/parser/invoke-diagnostics.ts:401, imported back by extension/invoke-static-checks.ts:102. The codes/messages/hints these checks emit (`WITH_CLAUSE_*`, `INVOKE_ARG_TYPE_MISMATCH_CODE`) are all declared in parser/invoke-diagnostics.ts. Verbatim emission excerpt (`checkImportedWithClauseCallees`, :261-268):
```ts
    diagnostics.push({
      severity: "error",
      code: WITH_CLAUSE_IN_PROCESS_CALLEE_CODE,
      file: callerPath,
      range: call.withClause.range,
      message: withClauseInProcessCalleeMessage(call.callee),
      hint: WITH_CLAUSE_IN_PROCESS_CALLEE_HINT,
    });
```

## Why this is a problem
Counted affinity: 18 foreign-layer (parser) member touches vs 3 own-layer touches, with the entire diagnostic vocabulary the module emits declared in parser/invoke-diagnostics.ts, and its siblings-in-kind (the mode gate PTQ-1181 relocated, the arity checks `checkInvokeArity`/`checkInvokeCall`) already living there. The module's sole own-layer consumer is invoke-static-checks.ts, which already imports parser/invoke-diagnostics directly (its :102), so the extension placement buys no import locality — it only inverts the layer arrow for a rule family the repo has already been re-homing (PTQ-1181; same-wave filing on invoke-callee-arity.ts covers a different module of this family, not this one).

## Suggested direction (non-binding, optional)
Hypothesis, unproven: re-home the three checks beside their sibling in src/parser (e.g. parser/with-clause-checks.ts next to invoke-diagnostics.ts). Cross-references back into extension are exactly three (`collectCallSites`, `collectProvableArgTypes`, `renderCollectedTypes`) plus two runtime members (`MaterializedImport`, `checkToolCallArguments`); those five edges are the blockers a ratified move would have to inject or relocate first, so the move may need to ride with the invoke-callee-arity/expr-surface re-homing already filed.

## False-positive check
- Affinity counted both ways from the verbatim import block: 18 parser members, 3 extension members, 2 runtime, 2 diagnostics (listed above by name).
- Sibling-pattern citation: `grep -rn withClausePromptModeRefusal src --include=*.ts` → declared at src/parser/invoke-diagnostics.ts:401, imported by extension/invoke-static-checks.ts:102 and extension/invoke-expr-call-surface.ts:10 — the PTQ-1181 fix's landing point, establishing where this rule family lives.
- Importer count from the structural map: `checkImportedWithClauseCallees` 1 src / 0 tests; confirmed by grep — the only src importer of this module is extension/invoke-static-checks.ts:141-142.
- Duplicate check: PTQ-1181 (with-clause-prompt-mode-gate.ts, fixed), PTQ-0364/PTQ-1104 (different files/classes), and this wave's qw20260922150013-d9-02-invoke-callee-arity-parser-affinity (invoke-callee-arity.ts) none cite this module's declarations.
- Zone-band functions in this file (`checkClauseCwdType` 74 LOC, `checkWithClauseDefaultReject` 60 LOC) were dispositioned KEEP-WHOLE separately (single-rule bodies, no 2-concern inventory); this filing is placement-only.

## Triage
verdict: questionable — accounting verified at HEAD: size-scan map on a one-line manifest gives 273 LOC / band exempt (placement review applies) with the five declarations at exactly the cited ranges (checkClauseCwdType 38-111, checkWithClauseDefaultReject 144-203, topLevelSubagentFnNames 206-214, importedLocalNames 217-227, checkImportedWithClauseCallees 241-271, importers 1/0); import block :3-21 and the emission excerpt :261-268 match verbatim; affinity recounted from the import block at 18 parser members (8 invoke-diagnostics + CallableSetSnapshot + StaticTypeInferencePass + 4 theta-document + 4 type-compat) vs 3 own-layer (collectProvableArgTypes, renderCollectedTypes, collectCallSites — the last a mutual import with invoke-static-checks.ts) + 2 runtime (MaterializedImport at lexical-environment.ts:129, checkToolCallArguments via the tool-call.ts:39-46 compatibility re-export) + 2 diagnostics types; sibling pattern real — withClausePromptModeRefusal declared at parser/invoke-diagnostics.ts:401 (PTQ-1181, resolved/fixed, ratified) imported back at invoke-static-checks.ts:102 and invoke-expr-call-surface.ts:10, and checkInvokeArity/checkInvokeCall live at parser/invoke-diagnostics.ts:477/603; grep across src/tests/extensions/tools finds the sole module importer at invoke-static-checks.ts:141-142 (tests reference only a same-named test file); not a barrel (declares bodies), no quality/exemptions.json row; dedupe: PTQ-1181 is a different host (with-clause-prompt-mode-gate.ts), PTQ-1175 is the breakdown of invoke-static-checks.ts whose Seam B minted this file, PTQ-0364/0370/1104 and same-wave d9-02 (invoke-callee-arity.ts) / d9-01 (tool-call-static-checks.ts) are different root causes — the three extension back-edges plus two runtime edges make the parser re-home a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently at HEAD: size-scan map on a one-line manifest gives 273 LOC / band exempt (placement review applies) with the five declarations at exactly the cited ranges (38-111, 144-203, 206-214, 217-227, 241-271; checkImportedWithClauseCallees 1/0 importers) and the import list :3-21 and emission excerpt :261-268 match verbatim; affinity recounted at 18 parser members (8 invoke-diagnostics + CallableSetSnapshot + StaticTypeInferencePass + 4 theta-document + 4 type-compat) vs 3 own-layer (collectProvableArgTypes, renderCollectedTypes, collectCallSites — a mutual import with invoke-static-checks.ts) + 2 runtime + 2 diagnostics types; sibling pattern real — withClausePromptModeRefusal at parser/invoke-diagnostics.ts:401 (PTQ-1181 in quality/resolved, status fixed, human-ratified) imported back at invoke-static-checks.ts:102 / invoke-expr-call-surface.ts:10, checkInvokeArity/checkInvokeCall at :477/:603; grep across src/extensions/tools/tests finds the sole importer at invoke-static-checks.ts:141-142 (tests name only a same-named test file); not a barrel (declares bodies, header :1 states a role); no exemptions.json row; dedupe: PTQ-1181 (with-clause-prompt-mode-gate.ts), PTQ-1175 (breakdown of invoke-static-checks.ts), PTQ-0364/0370/1104 and same-wave d9-01 tool-call-static-checks / d9-02 invoke-callee-arity are different hosts and cite this module only as a consumer — the three extension back-edges plus two runtime edges make the parser re-home a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified a third time at HEAD: size-scan map (one-line manifest) gives 273 LOC / band exempt with the five declarations at exactly 38-111 / 144-203 / 206-214 / 217-227 / 241-271 (checkImportedWithClauseCallees 1/0 importers; the two zone-band functions are placement-only per the filing); import block :3-21 recounts to 18 parser members (8 invoke-diagnostics, CallableSetSnapshot, StaticTypeInferencePass, 4 theta-document, 4 type-compat) vs 3 own-layer (collectProvableArgTypes, renderCollectedTypes, collectCallSites — a mutual import with invoke-static-checks.ts) + 2 runtime (MaterializedImport, checkToolCallArguments) + 2 diagnostics types; emission excerpt :261-268 verbatim; grep across src/extensions/tools/tests finds the sole importer at invoke-static-checks.ts:141-142 (tests name only the same-named test file); sibling pattern real — withClausePromptModeRefusal at parser/invoke-diagnostics.ts:401 (PTQ-1181 in quality/resolved, status fixed) imported back at invoke-static-checks.ts:102 / invoke-expr-call-surface.ts:10, checkInvokeArity :477 / checkInvokeCall :603; not a barrel, no exemptions.json row; dedupe: no resolved PTQ names this host as root cause (PTQ-1175 minted it, PTQ-0364/0557/0702 cite only its test file), and same-wave d9-01 tool-call-static-checks / d9-02 invoke-callee-arity are other hosts — the three extension back-edges plus two runtime edges make the parser re-home a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
