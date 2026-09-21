---
id: pending
title: checkBooleanPosition, checkIndexReceiver and displayCompatType are parse/type-phase checkers living in the runtime expression interpreter, consumed only by parser/type-layer-checks.ts
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/expression-evaluator.ts:555-636
sites: 3
fix_scope: cross-module
d9_class: misplacement
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# checkBooleanPosition, checkIndexReceiver and displayCompatType are parse/type-phase checkers living in the runtime expression interpreter, consumed only by parser/type-layer-checks.ts

## Observation
`src/runtime/expression-evaluator.ts` (636 LOC) is, per its own header, "the theta expression interpreter" — tokenizer (105-193), recursive-descent parser (242-414), and tree evaluator (426-543) over `ThetaValue`. Its final 82 lines (555-636, 68 declaration LOC per the map) are three declarations of a different phase entirely: `checkBooleanPosition` and `checkIndexReceiver`, the static type-phase checkers that emit `theta/parse/non-boolean-condition` and `theta/parse/non-indexable-receiver` parse diagnostics, plus their private renderer `displayCompatType`. The header itself flags the graft: the module owns the interpreter "plus the one type-phase boolean-position check".

## Evidence
Affinity, counted both ways. The check family touches 5 members of `src/parser/type-compat` — `checkCompatible`, `classifyIndexReceiver`, `CompatType`, `CompatSite`, `TypeEnv` (imported at lines 45-51) — plus `Diagnostic` from `../diagnostics/diagnostic`, and touches 0 members of this file's interpreter (not `tokenize`, not `ExprParser`, not `evaluateNode`, not `EvalHost`, not `ThetaValue`). Its only in-file dependency is `displayCompatType`, which is itself used only by the two checks.

```
src/runtime/expression-evaluator.ts:566   // Message from diagnostics/code-registry-parse.md (`theta/parse/non-boolean-condition`).
src/runtime/expression-evaluator.ts:594   export function checkIndexReceiver(opts: {
src/runtime/expression-evaluator.ts:600     if (classifyIndexReceiver(receiverType, env) !== "primitive") {
```

Consumers, counted: `grep -rn "checkBooleanPosition|checkIndexReceiver" src` finds exactly one importing module — `src/parser/type-layer-checks.ts` (import at lines 87-88; call sites 2414, 3195, 3208, 3223, 3726). The structural map agrees: importers src/tests are 1/1 and 1/0. So a parser-layer module reaches down into a runtime-layer file for its per-site type checkers, whose entire vocabulary (`CompatType`, `checkCompatible`, `classifyIndexReceiver`) is the parser layer's own `type-compat` module. Sibling pattern: the other per-site compatibility machinery these checks wrap (`checkCompatible`, `classifyIndexReceiver`) lives in `src/parser/type-compat.ts`, the layer where the sole caller also lives.

## Why this is a problem
Correct code in the wrong module, with the counts: the block touches 5 foreign `parser/type-compat` members and 0 of its host's interpreter members, and its only production consumer is in `src/parser/`. Every use crosses the parser→runtime layer boundary solely to fetch checkers built entirely from parser-layer types. Re-homing the 68-LOC block also drops the host from 636 LOC (zone band) to ~568 LOC (exempt band), leaving the interpreter file exactly what its header's first clause claims it is.

## Suggested direction (non-binding, optional)
Hypothesis: move `checkBooleanPosition`, `checkIndexReceiver`, and `displayCompatType` (555-636, ~82 physical lines) into the parser layer — either `src/parser/type-compat.ts` alongside `checkCompatible`/`classifyIndexReceiver`, or a small `src/parser/expression-position-checks.ts` — and update the single importer `src/parser/type-layer-checks.ts`. No cross-references back into the interpreter exist. Unproven; the human ratifies the home.

## False-positive check
Affinity counted both ways (5 foreign members named vs 0 own interpreter members; `displayCompatType` is check-private). Sole-importer claim verified by grep across src/ (one module, `parser/type-layer-checks.ts`; test importer counts quoted from the map: 1/1 and 1/0). Re-export check: no barrel re-exports these names. Header-intent check: the V3a header explains the *interpreter's* self-contained tokenizer, but offers no placement rationale for the type-phase checks beyond "the one ... check the expression sublanguage needs" — the caller that needs it lives in parser/. Not filed as breakdown: the host file is dispositioned kept-whole (zone, no presumption; the interpreter proper is one pipeline and this re-homing takes the file below the zone threshold).

## Triage
verdict: questionable — accounting verified: block 555-636 (30+20+18 = 68 LOC per size-scan map, host 636 LOC zone band) uses 5 parser/type-compat members + Diagnostic and 0 interpreter members (grep of tokenize/ExprParser/evaluateNode/EvalHost/ThetaValue over the range: none; the type-compat import is consumed only by this block); sole src importer is parser/type-layer-checks.ts:87-89 (calls 2414/3195/3208/3223/3726), one test importer; no barrel re-export, no exemption, not a duplicate (PTQ-0001 is D2 unread-param; shard-21 D4 log entry on displayCompatType/displayType is a separate clone root cause) — target home is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map reproduces host 636 LOC zone band with checkBooleanPosition 555-584 (30), checkIndexReceiver 594-613 (20), displayCompatType 619-636 (18) = 68 LOC; the block leans on 5 parser/type-compat members (checkCompatible, classifyIndexReceiver, CompatSite, CompatType, TypeEnv — the file's only use of that import, at lines 42-48 not 45-51, tolerated drift) + Diagnostic, and grep of tokenize/ExprParser/evaluateNode/EvalHost/ThetaValue/valuesEqual/evaluateSource over 555-636 hits nothing (0 own members); sole src importer is parser/type-layer-checks.ts:87-89 with calls at 2414/3195/3208/3223/3726, test importers 1 (expression-evaluator.test.ts) / 0, no barrel or re-export of the names, no exemptions.json row for the host; sibling pattern holds (the peer per-site checkers checkForIterand/checkCompatible/classifyIndexReceiver all live in src/parser/); the header's V3a-T leaf-ownership note is history, not a layer rationale; not a duplicate (PTQ-1132 is a type-layer-checks-internal clone, the REVIEW_LOG:536 displayCompatType/displayType route is a D4 clone root cause) — the target home is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time from scratch: size-scan map gives host 636 LOC / zone band with checkBooleanPosition 555-584 (30), checkIndexReceiver 594-613 (20), displayCompatType 619-636 (18) = 68 LOC and importers 1/1, 1/0, 0/0; grep over 555-636 for tokenize/ExprParser/evaluateNode/EvalHost/ThetaValue/valuesEqual/evaluateSource/Token/*_OPS hits nothing (0 own members) while the block is the file's only consumer of the 5 parser/type-compat members (checkCompatible, classifyIndexReceiver, CompatSite, CompatType, TypeEnv; import at 43-49) plus Diagnostic; grep across src/extensions/tools/tests finds the sole src importer parser/type-layer-checks.ts (import 89-91, calls 2148/2929/2942/2957/3453 — the filing's 87-88 and 2414/3195/3208/3223/3726 are line drift in the importer, counts unchanged), one test importer (expression-evaluator.test.ts), no barrel/re-export of the names (lexical-environment.ts imports only EvalHost), no exemptions.json row for the host; sibling pattern holds (checkCompatible/classifyIndexReceiver live in src/parser/type-compat.ts); not a duplicate — PTQ-1132 (resolved) is a type-layer-checks-internal CompatType-recursion clone at 398-409/611-622, PTQ-1115 (resolved) is the classifier clone, and no issue tracks the displayCompatType/displayType D4 route from REVIEW_LOG:536 — the target home (type-compat.ts vs a new parser leaf) is a design decision for a human ruling (triage: claude-fable-5-1)
