---
id: pending
title: type-layer-walk.ts remains 1639 LOC in the justify band after the PTQ-1281 split, with five member families still bundled in the 1551-LOC TypeLayerWalk class
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-layer-walk.ts:1-1639
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/parser/type-layer-walk.ts
d9_band: justify
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# type-layer-walk.ts remains 1639 LOC in the justify band after the PTQ-1281 split, with five member families still bundled in the 1551-LOC TypeLayerWalk class

## Observation
The file is 1639 LOC (structural map), justify band (1000-1999). Its header states the split already performed: "the provability, interpolation and operand/receiver check families it drives live in ./type-layer-provable.ts, ./type-layer-interpolation.ts and ./type-layer-operand-checks.ts, sharing this walk's per-parse state through `TypeWalkContext`" (type-layer-walk.ts:1-6). PTQ-1281 (fixed, confirmed) filed this file at 2693 LOC; the fix moved three families out and left 1639 LOC — a 1054-LOC reduction that still leaves the file above the 1000-LOC justify threshold, with the single module-private class TypeLayerWalk at 1551 LOC (87-1637).

## Evidence
Distinct-concern inventory (line ranges and LOC from the authoritative structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| statement walking & binding recording | walkBlock, walkStmt, walkLetStmt, walkReassignStmt, walkOtherwise, bindLoopElement, recordWithheldBinders, matchArmScope | 161-168, 170-267, 270-473, 476-527, 529-542, 622-638, 673-686, 703-715 | 420 |
| fn declaration & return-type checking | walkFn, checkSubagentReturnAnnotation, collectReturnContributions, contributionOf, bodyHasQuestion, inferFinalValuePayload | 717-783, 802-847, 855-898, 900-908, 911-948, 959-976 | 222 |
| array/object literal & pattern-field checks | checkArrayLiteral, markNestedArrayLiterals, sinkedArrayOf, checkObjectFields, declaredFieldsOf, checkPatternFieldTypes, checkObjectField | 1005-1061, 1074-1081, 1090-1102, 1119-1141, 1147-1155, 1177-1226, 1242-1273 | 192 |
| fn-call argument checks | checkFnCallArgs, checkFnCallArity, checkFnCallArgLoop | 1296-1416 | 117 |
| expression walking | checkBoolean, walkExpr, checkParFor | 979-989, 1418-1578, 1581-1636 | 228 |

The `TypeWalkContext` interface (type-layer-provable.ts:20-33, 3 src importers per the map) is the already-working seam: the three families the header names were moved onto it by the PTQ-1281 fix, and type-layer-operand-checks.ts:6 records the shape ("Split out of `TypeLayerWalk`; every helper reads the walk's shared `TypeWalkContext`").

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to keep whole is found. Reasons considered: (1) single algorithm with shared local state — defeated: the shared state is instance state (`diagnostics`, `resultBindings`, `unprovableBindings`, `env`, `pass`, the three callee tables), and three families already read it through `TypeWalkContext` from separate modules, so no new state object would need inventing; (2) closed-enumeration dispatch — applies only to walkStmt/walkExpr individually, not to the fn-return, literal-check, and call-arg families; (3) data-only module — false: 0% of LOC are declarations/tables; (4) generated code — no generator citation; (5) exemptions.json — no entry for this host (grep hit 0). PTQ-1281 is fixed against the 2693-LOC shape; the current 1639-LOC residual is a new disposition, not a re-file (reduction of 39% since that filing, still above threshold).

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: fn declaration & return-type checking (walkFn, checkSubagentReturnAnnotation, collectReturnContributions, contributionOf, bodyHasQuestion) -> type-layer-fn.ts (hypothesis) - ~217 LOC, 0 exported symbols moved (all private today), 0 external importers, cross-references back into the host via TypeWalkContext exactly as type-layer-operand-checks.ts does. Seam B: array/object literal & pattern-field checks -> type-layer-literals.ts (hypothesis) - ~192 LOC, same TypeWalkContext shape, cross-reference: checkArrayLiteral is called from walkLetStmt and walkExpr. Seam C: fn-call argument checks (checkFnCallArgs/Arity/ArgLoop) -> type-layer-call-args.ts (hypothesis) - ~117 LOC; needs the three private callee tables (fnDecls, importedSymbols, shadowedNames) exposed on the context.

## False-positive check
Band: 1639 LOC, justify per the map. Reasons-considered list above with defeating evidence per reason. Exemptions check: grep for type-layer-walk in quality/exemptions.json returned no hits. Generated-code check: hand-written module with prose header, no generator marker. Spec-mirror check: walkStmt and walkExpr mirror the Stmt/Expr unions (exhaustiveness `never` backstops at 261-266 and 1570-1577), which keeps those two methods whole but does not cover the other three families. Duplicate check: PTQ-1281 is status fixed against the 2693-LOC pre-split file; PTQ-1170/1187/1178/1211 are fixed against pre-split hosts (type-layer-checks.ts).

## Triage
verdict: questionable — accounting verified: `size-scan map` on the host reproduces 1639 LOC / band justify (FILE_BANDS justify=1000, `wc -l` agrees), single declaration class TypeLayerWalk 87-1637 = 1551 LOC, all 27 inventory members present at exactly the cited map lines and the five row LOC sums (420/222/192/117/228) match the map member LOC to the line; header excerpt 1-6 and TypeWalkContext (type-layer-provable.ts:20-33, implemented by the class at :87, read by the three split-out modules) match; per-row `this.*` tallies confirm ≥ 2 distinct concerns — rows 2/3/4/5 touch only the context fields env/file/diagnostics/typeOf (row 4 also the injected fnDecls/importedSymbols/shadowedNames tables) while only row 1 reads/writes the resultBindings/unprovableBindings accumulators; no `type-layer` key in quality/exemptions.json (grep rc=1); `git log --follow` shows the PTQ-1281 split at 33548129 followed only by D8 fix touches, no revert; no spec-cited critical section or measured cost; dedupe clean (PTQ-1281 is resolved/fixed against the 2693-LOC pre-split shape and this is a new residual disposition; sibling intake d9-02-walkletstmt is the method-level host #TypeLayerWalk.walkLetStmt; TRIAGE_LOG:274/292 PTQ-1142 keep-whole rules on the cross-walk fold only); one non-refuting inaccuracy: the class is exported (`export { TypeLayerWalk }` :1639) not module-private, as PTQ-1281 triage already noted — the seam shape (A/B/C hypotheses) is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map reproduces 1639 LOC / justify band (justify=1000, strong=2000); TypeLayerWalk is 87-1637 = 1551 LOC; all inventory members sit at the cited map ranges; header 1-6 and TypeWalkContext (type-layer-provable.ts:20-33) match; the fn/literal/call-arg rows touch only env/file/diagnostics/typeOf (call-args also fnDecls/importedSymbols/shadowedNames) plus calls back into walkBlock/walkExpr/recordWithheldBinders, the same back-reference shape as the already-split modules, so the ≥2-concern inventory holds; no exemptions.json entry (rc=1), no revert after the 33548129 split, and no overlooked strong reason; not a duplicate, because PTQ-1281 is resolved/fixed against the 2693-LOC shape; one inaccuracy that does not change the verdict: the class is exported (`export { TypeLayerWalk }` :1639), not module-private; the seam shape needs a human ruling (triage: claude-opus-5-5)
