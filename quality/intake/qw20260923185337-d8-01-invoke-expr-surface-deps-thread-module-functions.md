---
id: pending
title: checkInvokeExprCallSurface takes checkWithClauseAtCallSurface and buildInvokeArgSlot as injected deps, restating their signatures, although neither is orchestrator-owned any more and its one caller always passes the same two module functions
lens: D8
status: intake
verdict: pending
locations:
  - src/extension/invoke-expr-call-surface.ts:145-184
  - src/extension/invoke-static-checks.ts:761-780
  - src/extension/invoke-static-checks.ts:421-424
  - src/parser/with-clause-static-checks.ts:22-23
  - src/parser/invoke-callee-arity.ts:4
sites: 2
fix_scope: module
d8_class: overbuilt
d8_host: src/extension/invoke-expr-call-surface.ts#checkInvokeExprCallSurface
wave: qw20260923185337
reported_by: lens-d8-simplification (anthropic/claude-opus-5-5)
date: 2026-09-23
---

# checkInvokeExprCallSurface takes checkWithClauseAtCallSurface and buildInvokeArgSlot as injected deps, restating their signatures, although neither is orchestrator-owned any more and its one caller always passes the same two module functions

## Observation
`checkInvokeExprCallSurface` has a 7-member `deps` parameter. Three members are
plain module functions, not host services: `resolveCalleeAbsolute`,
`checkWithClause` and `buildInvokeArgSlot`. The doc comment gives the reason as
"Host-owned helpers are threaded as dependencies to keep the surface module
independent of the orchestrator at runtime". That was true when the file was
split out of `invoke-static-checks.ts` (commit f7aae3fc, 2026-09-17): all three
helpers were private functions of the orchestrator then. Since commit 91ffaea0
(2026-09-21, later renamed into `src/parser/` by 65fe42f7 and f7c9bb41),
`checkWithClauseAtCallSurface` lives in `src/parser/with-clause-static-checks.ts`
and `buildInvokeArgSlot` in `src/parser/invoke-callee-arity.ts`. The injection is
still in place. The function has exactly one caller, which passes those same
module bindings, and no test calls it at all.

## Evidence
Concept inventory: the injected-helper layer on `checkInvokeExprCallSurface`.

| concept | lines | still orchestrator-owned? |
|---|---|---|
| `resolveCalleeAbsolute` dep (1-line type) | invoke-expr-call-surface.ts:160 | yes: private function invoke-static-checks.ts:305-311 |
| `checkWithClause` dep (10-line restated input type) | invoke-expr-call-surface.ts:161-170 | no: exported from src/parser/with-clause-static-checks.ts:130 |
| `buildInvokeArgSlot` dep (7-line restated signature) | invoke-expr-call-surface.ts:171-177 | no: exported from src/parser/invoke-callee-arity.ts:259 |
| destructure of the three | invoke-expr-call-surface.ts:184 | — |

The job: take the collected `invoke(...)` expressions of one theta and return
diagnostics. Structural map: 1 src importer, 0 test importers. Its one call site
passes constants: the bare module bindings.

src/extension/invoke-expr-call-surface.ts:145-150, 160-161, 171 (the stated rationale and the deps):
```
/**
 * Check the `invoke(...)` expression surface: INV-1 containment, INV-8 clause
 * mode, INV-6 cwd type, then INV-3 arity and per-slot argument types, in order.
 * Host-owned helpers are threaded as dependencies to keep the surface module
 * independent of the orchestrator at runtime.
 */
...
    readonly resolveCalleeAbsolute: (callerPath: string, literalPath: string) => string;
    readonly checkWithClause: (input: {
...
    readonly buildInvokeArgSlot: (
```

src/extension/invoke-static-checks.ts:767-773 (the only call site; constant module bindings):
```
        {
          fs: deps.fs,
          activeRoots: deps.activeRoots,
          resolveCalleeArity: deps.resolveCalleeArity,
          resolveCalleeAbsolute,
          checkWithClause: checkWithClauseAtCallSurface,
          buildInvokeArgSlot,
```

src/extension/invoke-static-checks.ts:421-422: the sibling surface in the same
pass calls the same helper directly, with no injection:
```
    diagnostics.push(
      ...checkWithClauseAtCallSurface({
```

Import graph around the two helpers. Both host modules already import back from
`invoke-expr-call-surface.ts`, and the orchestrator already has a value-level
cycle with one of them:
```
src/parser/with-clause-static-checks.ts:22: import { collectProvableArgTypes, renderCollectedTypes } from "../extension/invoke-expr-call-surface";
src/parser/with-clause-static-checks.ts:23: import { collectCallSites } from "../extension/invoke-static-checks";
src/parser/invoke-callee-arity.ts:4:       import { collectProvableArgTypes } from "../extension/invoke-expr-call-surface";
src/extension/invoke-static-checks.ts:146: import { checkWithClauseAtCallSurface, checkWithClauseDefaultReject } from "../parser/with-clause-static-checks";
```

## Why this is a problem
The injection's stated rationale is keeping the module independent of the
orchestrator. It holds for one of the three injected helpers
(`resolveCalleeAbsolute`) and is false for the other two, which moved out of the
orchestrator four days after the rationale was written. For those two, the layer
buys nothing:
- The one caller always passes the same functions.
- No test substitutes them (`grep -rn checkInvokeExprCallSurface tests/` finds 0 hits).
- The sibling `.theta`-callable surface calls `checkWithClauseAtCallSurface`
  directly.

It still costs 17 lines of restated signature (161-177). These must track the
real functions' signatures by hand. For example, the `checkWithClause` input
type re-spells `surface` as the `invoke` arm only.

A direct import would create a value-level import cycle with each helper's host
module. The codebase already tolerates that shape in this cluster
(`invoke-static-checks.ts` ↔ `with-clause-static-checks.ts`, lines above), so
avoiding a cycle is not a rule the rest of the cluster follows. That is also not
the reason the comment gives.

## Suggested direction (non-binding, optional)
Unproven hypothesis: import `checkWithClauseAtCallSurface` and
`buildInvokeArgSlot` directly in `invoke-expr-call-surface.ts`, or move them into
it, and keep only host-dependent members (fs, roots, the arity/return-type
resolvers, and `resolveCalleeAbsolute` if its home stays the orchestrator) in
`deps`. Whether the resulting import cycles are acceptable is the fix stage's
call. The parser→extension back-imports behind them are the D9 affinity
question already ruled in PTQ-1266 / PTQ-1268.

## False-positive check
- D2 precedent (uniform-posture threading with a stated rationale): the
  rationale is in the code, and is shown false for 2 of the 3 helpers through the
  git history (f7aae3fc created the deps while all three were orchestrator
  privates; 91ffaea0 moved two out; 65fe42f7 / f7c9bb41 renamed them into
  `src/parser/`). It is not a MUST-NOT witness seam: no test calls
  `checkInvokeExprCallSurface` (`grep -rn "checkInvokeExprCallSurface" tests/` →
  0 hits; the only production reference is invoke-static-checks.ts:762).
- Spec check: no spec clause governs how these checks are wired together. The
  INV-8 → INV-6 → INV-3 order is kept by the function body, not by the deps.
- Exemption check: no D8 exemption exists on this host. D9 context: PTQ-1175
  (invoke-static-checks breakdown, resolved), PTQ-1266 / PTQ-1268 (parser
  affinity, resolved) are size and placement rulings. This is a distinct
  indirection-layer claim.
- Dedupe: no intake or issue file names `checkInvokeExprCallSurface`'s deps.
  PTQ-1104 (resolved) was a stale header only.
- Shard boundary: the helpers' hosts (`with-clause-static-checks.ts` in this
  shard; `invoke-callee-arity.ts` outside it) were read only at their import and
  export lines cited above.

## Triage
verdict: questionable — accounting verified; the simpler shape is a design decision for a human ruling: the doc comment at invoke-expr-call-surface.ts:145-150 gives the orchestrator-independence rationale, and the deps at 160-177 (resolveCalleeAbsolute 1 line, checkWithClause a 10-line restated input with `surface` narrowed to the invoke arm, buildInvokeArgSlot 7 lines) are destructured at 184; the only caller (invoke-static-checks.ts:762-773, imported at :129) passes the bare module bindings; checkWithClauseAtCallSurface is exported from src/parser/with-clause-static-checks.ts:130 and buildInvokeArgSlot from src/parser/invoke-callee-arity.ts:259 (defined at :186), while resolveCalleeAbsolute is still orchestrator-private (invoke-static-checks.ts:305); the sibling surface calls checkWithClauseAtCallSurface directly (:421); grep finds 0 references in tests/; git confirms f7aae3fc created the surface and 91ffaea0 moved both helpers out; the back-imports (with-clause-static-checks.ts:22-23, invoke-callee-arity.ts:4) are real; no spec clause governs the wiring; no D8 exemption; the sibling d9-01/d9-03 intakes have distinct root causes (triage: claude-opus-5-5)
verdict: questionable — accounting verified; the simpler shape is a design decision for a human ruling: the deps at invoke-expr-call-surface.ts:156-180 hold 7 members, and the orchestrator-independence doc comment is at :145-150; the only reference outside the file is invoke-static-checks.ts:762-780, which passes the bare module bindings `checkWithClauseAtCallSurface` (exported from src/parser/with-clause-static-checks.ts:130) and `buildInvokeArgSlot` (defined at src/parser/invoke-callee-arity.ts:186, exported at :259); only `resolveCalleeAbsolute` is still orchestrator-private (:305); the sibling surface calls checkWithClauseAtCallSurface directly (:421); there are 0 hits in tests/, extensions/ or tools/; the back-imports (with-clause-static-checks.ts:22-23, invoke-callee-arity.ts:4) are real; there is no D8 exemption and no dedupe hit. One history correction: f7aae3fc injected `checkClauseCwdType`, 91ffaea0 moved it out, and 343c417d (09-23) rebuilt the dep as `checkWithClause` on an already-external function. This makes the stale rationale older, not weaker (triage: claude-opus-5-5)
