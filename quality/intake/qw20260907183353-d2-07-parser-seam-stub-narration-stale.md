---
id: pending
title: Seven parser seam modules still narrate their functions as inert tests-task stubs although every named function is implemented
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/functions.ts:31-38
  - src/parser/functions.ts:72
  - src/parser/functions.ts:106
  - src/parser/functions.ts:143-144
  - src/parser/functions.ts:171-173
  - src/parser/functions.ts:194-196
  - src/parser/functions.ts:265-266
  - src/parser/functions.ts:389
  - src/parser/functions.ts:421
  - src/parser/imports.ts:9-14
  - src/parser/imports.ts:69-71
  - src/parser/imports.ts:131-133
  - src/parser/imports.ts:221-223
  - src/parser/imports.ts:284-287
  - src/parser/imports.ts:707-708
  - src/parser/imports.ts:769-780
  - src/parser/invoke-diagnostics.ts:33-40
  - src/parser/literal-sublanguage.ts:26-29
  - src/parser/literal-sublanguage.ts:597-598
  - src/parser/match-result.ts:27-31
  - src/parser/match-result.ts:108
  - src/parser/match-result.ts:156
  - src/parser/match-result.ts:206-207
  - src/parser/params.ts:29-32
  - src/parser/params.ts:163-165
  - src/parser/query-schema-inference.ts:28-35
  - src/parser/query-schema-inference.ts:248-249
  - src/parser/query-schema-inference.ts:301-302
sites: 28
fix_scope: cross-module
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Seven parser seam modules still narrate their functions as inert tests-task stubs although every named function is implemented

## Observation
The module headers and per-function doc comments of functions.ts, imports.ts, invoke-diagnostics.ts, literal-sublanguage.ts, match-result.ts, params.ts, and query-schema-inference.ts describe the current file state in present tense as a tests-task (V*-T) stub layer: checks "return no diagnostic", resolvers "return the empty string", checkers "return a single inert stub diagnostic (code `stub/v15f-unimplemented`)", and `prunePerQueryDefs` "is an identity that prunes nothing". Every one of those functions is implemented in the current code and does the opposite of what the narration states.

## Evidence
src/parser/functions.ts:31-38 (header):
```
// V3d-T (tests-task) declares these seam shapes and stubs the behaviour-bearing
// functions inertly (placement / unreachable checks return no diagnostic;
// `resolveFnCall` and `resolveReturnType` return the `"unchecked"` sentinel;
// `buildFnDeclaration` does not preserve the doc; `lowerFnDescription` wrongly
// carries it). Each obligation test reds on its own primary assertion (an
// absent expected diagnostic, the sentinel, a missing AST doc, or a wrongly
// lowered description), not on a compile error, a missing fixture, or a harness
// throw. The paired V3d implementation leaf fills every check in.
```
Counter-evidence — src/parser/functions.ts:78-90 (`checkFnPlacement` emits the diagnostic) and :149 (`resolveFnCall` computes the resolution, never `"unchecked"`):
```
  if (!placement.nested) {
    return undefined;
  }
  // Message from diagnostics/code-registry-parse.md.
  return {
    severity: "error",
    code: "theta/parse/nested-fn",
```
```
  return hoistedTopLevelFns.includes(name) ? "resolved" : "unresolved";
```

src/parser/imports.ts:9-14 (header):
```
// V15c-T (tests-task) declares these seams and stubs each behaviour-bearing
// function inert so the failing tests compile and red on their own primary
// assertions. The paired V15c implementation leaf fills them in. Each stub
// returns a benign wrong value (no diagnostic / the empty string / a
// "registered" verdict with no resolved path) so the assertions red for the
// intended reason (implementation absent), never on a thrown harness error.
```
Counter-evidence — src/parser/imports.ts:227-268: `RelativeThetaLibResolver.resolve` throws `UnresolvableThetaLibPathError` on each failure arm and returns `this.probe.canonicalize(resolved)`, not the empty string; :289-320 `loadThetaLibImport` emits the diagnostic and reports `registered: false` on a throw. imports.ts:769-780 (V15i block) likewise claims `computeThetaLibExports` "returns the WRONG set — the plain-import locals"; the body at :828-833 returns declaration names plus re-export names.

src/parser/invoke-diagnostics.ts:33-40 (header):
```
// V15f-T (tests-task) declares the seam shapes and the registry-anchored message
// builders (real, pure) and stubs the five behaviour-bearing checkers so the
// failing tests compile and red on their own primary assertions: each checker
// returns a single inert stub diagnostic (code `stub/v15f-unimplemented`), so a
// test expecting a specific diagnostic reds (wrong code) and a test expecting no
// diagnostic reds (unexpected length). The paired V15f implementation leaf
// replaces these bodies with the real checks. No test reds on a compile error,
// a missing fixture, or a harness throw.
```
`grep -rn "stub/v15f-unimplemented" src` matches only this comment (src/parser/invoke-diagnostics.ts:36); no checker body constructs that code — `checkInvokeArgTypes` (:259-296), `checkInvokeReturnType` (:329-361), `checkInvokeArity` (:392-427), `checkInvokeExtension` (:567-589), `checkCalleeHasErrors` (:620-647) all emit the registered codes.

src/parser/literal-sublanguage.ts:26-29 and :597-598, src/parser/match-result.ts:27-31 and :108/:156/:206-207, src/parser/params.ts:29-32 and :163-165, src/parser/query-schema-inference.ts:28-35 and :248-249/:301-302 carry the same shape ("V2a-T ... stubs both checks as inert no-ops", "V4a-T stubs this inert (always `undefined`)", "V6b-T stubs this as an inert pass (no diagnostics, no lowered schema)", "V13b-T stubs this as an identity that prunes nothing"); the bodies below each emit diagnostics (`checkLiteralSublanguage` :54-92, `checkObjectLiteralFields` :600-625, `checkQuestionOperand` :110-135, `checkMatchArmTypes` :209-243, `parseParams` :169-521) or perform the described computation (`prunePerQueryDefs` :305-330 runs the BFS reachability prune).

## Why this is a problem
Historical narration: the comments describe a superseded state of the code (the tests-task stub phase) in present tense as the current state, and each is contradicted by the function body directly beneath it. A reader is told `resolveFnCall` returns `"unchecked"`, `resolve` returns `""`, and the invoke checkers return `stub/v15f-unimplemented` — none of which the current code can do. This is the same decay already cataloged for other module families (quality/intake/qw20260907130901-d2-01/-08/-09-stale-tests-task-stub-narration.md cover binder/, extension/, discovery/, diagnostics/ modules); none of those findings cites any of these seven parser files, so these sites are uncovered.

## Suggested direction (non-binding, optional)
Rewrite the V*-T paragraphs to past tense or delete them, keeping only the seam-contract description that is still true of the implemented code, as the fix for the sibling findings will do for their module sets.

## False-positive check
- Verified each named claim against the current body: `checkFnPlacement`/`checkFunctionReference`/`checkBareReturn`/`checkUnreachableCode` return diagnostics (functions.ts:78-90, :118-128, :395-405, :427-439); `resolveFnCall`/`resolveReturnType` never return `"unchecked"` (:149, :277-347); `buildFnDeclaration` preserves `doc` (:182-186); `lowerFnDescription` returns `{}` (:198-203); `resolve` returns a canonicalized path (:268); `loadThetaLibImport` emits and unregisters on failure (:296-320); `computeThetaLibExports`/`thetalibLocalBindings` return the correct sets (:828-851); all invoke checkers emit registered codes; both literal-sublanguage checks emit; all three match-result checks emit and the arm checker computes the LUB (:243, `leastUpperBound` :258-292); `parseParams` emits and lowers; `inferQuerySchema` walks frames (:166-235); `checkExplicitSchemaMismatch` computes the relation (:251-283); `prunePerQueryDefs` prunes (:305-330).
- Searched `stub/v15f-unimplemented` across src/, extensions/, tools/, tests/: only the two comments (module header, test header) mention it; no code constructs it.
- Checked the already-filed set: the three stale-tests-task-stub-narration findings list locations only in src/binder/, src/extension/, src/discovery/, src/diagnostics/ — no overlap with these seven parser files.
- Not a claim of dead code; the functions are alive in production (theta-document.ts, type-layer-checks.ts, import-static-checks.ts, invoke-static-checks.ts, query-schema-resolve.ts, query-schema-lowering.ts callers verified) — only the narration is stale.

## Triage
