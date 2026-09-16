---
id: PTQ-0375
title: checkImportedFnCallArgs and checkFnCallArgs hand-duplicate the parameter-annotation-junk guard across extension/ and parser/
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:1927-1940
  - src/parser/type-layer-checks.ts:2672-2682
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260916045442
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-16
---

# checkImportedFnCallArgs and checkFnCallArgs hand-duplicate the parameter-annotation-junk guard across extension/ and parser/

## Observation
`checkImportedFnCallArgs` (`src/extension/invoke-static-checks.ts`, cross-`.thetalib`-import
`fn` calls) and the private method `checkFnCallArgs` (`src/parser/type-layer-checks.ts`,
same-file `fn` calls) each open their per-parameter loop with the identical two-step guard: a
parameter annotation whose source text `annotationSourceIsNotTypeExpression` flags as
recovery junk is treated as absent, and a parameter `annotationToCompatType` cannot convert
(the empty/unannotated case) is equally treated as absent. `checkImportedFnCallArgs`'s own
comment states the guard is "mirroring `checkFnCallArgs`'s identical guard on the same-file
route."

## Evidence

**checkImportedFnCallArgs — invoke-static-checks.ts:1927-1940:**
```ts
      const param = callee.fn.params[i] as FnParam;
      if (param.type.length > 0 && annotationSourceIsNotTypeExpression(param.type)) {
        // The library's own parameter annotation derives from none of
        // `Type`'s six alternatives — treated as absent rather than as an
        // opaque nominal reading of the junk text, mirroring
        // `checkFnCallArgs`'s identical guard on the same-file route.
        continue;
      }
      const paramType = annotationToCompatType(param.type);
      if (paramType === undefined) {
        // An unannotated library parameter has no declared type to judge
        // against (type-system.md §"Absent operands").
        continue;
      }
```
(immediately followed by `const argExpr = call.args[i] as Expr; const argTypes =
collectProvableArgTypes(argExpr, importerEnv, importerPass);` at :1941-1942 — see Diff
verdict.)

**checkFnCallArgs — parser/type-layer-checks.ts:2672-2682:**
```ts
      const p = fn.params[i] as FnParam;
      if (p.type.length > 0 && annotationSourceIsNotTypeExpression(p.type)) {
        // The callee's own parameter annotation derives from none of `Type`'s
        // six alternatives, so it supports no verdict — treated as absent
        // rather than as an opaque nominal reading of the junk text. This
        // reads the callee's `FnParam` list out of `fnDecls`, which carries
        // the declaration verbatim rather than a projected type, so the
        // absence invariant (`annotationSourceIsNotTypeExpression`) is
        // established here; a reader of `fnScope` inherits it instead.
        continue;
      }
```
(followed by `const paramType = annotationToCompatType(p.type); if (paramType === undefined)
{ … continue; }` at :2683-2687, then `const arg = e.args[i] as Expr; const argType =
this.provableArgType(arg, bindings);` at :2689-2690 — see Diff verdict.)

**Diff verdict: renamed-only for the guard itself, then a deliberate structural divergence
where the two functions consume the guarded value.** The guard cascade — `<field>.type.length
> 0 && annotationSourceIsNotTypeExpression(<field>.type)` → continue; `annotationToCompatType`
→ continue if undefined — is byte-identical in shape and renamed only in the loop variable
(`param`/`p`) and its container (`callee.fn.params`/`fn.params`); this is the clone-map's
group **G055** (65 tokens, renamed-only(6), re-verified unchanged at both cited spans). The
map's own window extends one line further than the shared guard, to
`argExpr/argTypes = collectProvableArgTypes(argExpr, importerEnv, importerPass)` versus
`arg/argType = this.provableArgType(arg, bindings)` — a genuinely different call (a free
function returning a value-type SET, three parameters, versus a class method returning a
single value, two parameters, reflecting `collectImportedFnCallArgs`'s schema-only `TypeEnv`
against `checkFnCallArgs`'s richer local-`bindings` map). That tail divergence is a documented,
legitimate difference between the two routes' environments, not drift; the guard cited above
— the part that is actually copy-pasted — is not.

## Why this is a problem
Both guards enforce the identical rule — type-system.md's "Absent operands": a junk-recovery
or unannotated `FnParam.type` supports no verdict — over the same `FnParam.type` shape, reached
by two different call routes (cross-`.thetalib`-import vs. same-file). The two underlying
predicates the guard calls, `annotationSourceIsNotTypeExpression` and `annotationToCompatType`,
are already shared functions, imported by both files rather than restated — but the
CONTROL-FLOW DECISION of calling them in this order-and-skip shape is written out twice, with
only a comment (in one direction) recording that the two are meant to agree. If the "Absent
operands" rule is later refined — a third condition under which a parameter counts as absent,
or a companion change required at each call site when `annotationSourceIsNotTypeExpression`'s
own definition changes — and the change reaches one guard but is missed on the other, a
same-file `fn` call and a cross-`.thetalib` `fn` call over the textually identical parameter
annotation would silently diverge on whether the argument's type is even compared at all: one
route would proceed to judge the argument, the other would withhold it (or vice versa), for a
callee that is, from the spec's point of view, declared identically either way.

## Suggested direction (non-binding, optional)
Since both guards take only the parameter's raw annotation text and answer "absent | a
`CompatType`," a shared predicate exported alongside `annotationToCompatType` and
`annotationSourceIsNotTypeExpression` themselves (both already living in `parser/`) is the
natural shared home (hypothesis) for the one guard both call sites would then call, rather
than either consuming file. Cross-module because the two current copies straddle
`extension/` and `parser/`; named as an observation, not a design.

## False-positive check
- Both excerpts re-read verbatim at the cited lines immediately before filing.
- Clone-map group G055 re-verified: 65 tokens, renamed-only(6), at
  `invoke-static-checks.ts:1927-1942` / `type-layer-checks.ts:2672-2690` — both spans confirmed
  to contain the guard cascade quoted above, plus the one further diverging line each side per
  the Diff verdict.
- Both copies live: `checkImportedFnCallArgs` is called from `checkThetaImports`
  (`import-static-checks.ts`), already confirmed live by this same family's prior filings
  (`PTQ-0325`, `PTQ-0330`, `PTQ-0370`); `checkFnCallArgs` is called from `TypeLayerWalk`'s
  `"call"`-expression walk (`this.checkFnCallArgs(e, bindings)`, `type-layer-checks.ts:3207`),
  the central same-file expression walker — neither is dead code.
- Not tests/: both sites are in `src/extension/` and `src/parser/`, hand-authored production
  modules.
- Not generated: no `@generated`/`DO NOT EDIT` marker in either file.
- Cross-module carve-out check: this crosses `extension/` and `parser/` — two different
  subsystems (import-usage checking vs. same-file AST walking) — and is not a spec-repeated
  normative vector: type-system.md states "Absent operands" once; the duplication is two CODE
  readings of that one rule, not two spec citations of it.
- Duplicate-finding check: grepped `quality/issues` + `quality/resolved` + `quality/intake` for
  `annotationSourceIsNotTypeExpression` and `checkFnCallArgs` combined with
  `checkImportedFnCallArgs` — no prior finding targets this specific guard's duplication;
  hits naming `checkImportedFnCallArgs` alone are `PTQ-0127`/`PTQ-0137`/`PTQ-0296`/`PTQ-0309`
  (D2 stale-consumer-count comments) and `PTQ-0370` (D9 misplacement) — a different claim in
  each case.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — excerpts and clone-scan group G055 (65 tokens, renamed-only(6)) reproduce exactly at invoke-static-checks.ts:1927-1942 and type-layer-checks.ts:2672-2690 (re-run via `node tools/quality/clone-scan.mjs map --files`); both copies are live (checkImportedFnCallArgs pushed from checkThetaImports, import-static-checks.ts:1543; checkFnCallArgs called from TypeLayerWalk#walkExpr's "call" case, type-layer-checks.ts:3207); the guard enforces type-system.md's real "Absent operands" rule with only a one-directional "mirroring checkFnCallArgs" comment (checkFnCallArgs's own comment never names its sibling), so neither the spec-vector-table nor incidental-similarity-with-no-stated-breakage carve-out applies; this same wave's own D4 shard-02 review-log note independently names G055 as promoted from two prior waves' "incidental" disposition to "filed ... load-bearing," corroborating this ruling (triage: claude-opus-5)
