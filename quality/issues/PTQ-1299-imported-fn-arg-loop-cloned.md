---
id: PTQ-1299
title: imported-fn call argument loop preamble cloned from parse-time checkFnCallArgLoop
lens: D4
status: open
verdict: confirmed
locations:
  - src/extension/invoke-imported-checks.ts:248-263
  - src/parser/type-layer-walk.ts:1378-1396
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# imported-fn call argument loop preamble cloned from parse-time checkFnCallArgLoop

## Observation
`checkImportedFnCallArgs` in `src/extension/invoke-imported-checks.ts` (compose-time
imported `.thetalib` `fn` call argument checking, bug 0138 route 2) and
`TypeLayerWalk.checkFnCallArgLoop` in `src/parser/type-layer-walk.ts` (parse-time
same-file user-`fn` call argument checking) both begin their per-argument loops with
a 65-token block that is a renamed-only copy: fetch the i-th parameter, guard on
`annotationSourceIsNotTypeExpression`, convert the annotation to a `CompatType`,
fetch the i-th argument, and begin proving the argument's type. The clone map
identifies the pair as group **G041** (renamed-only, 6 renames). After the shared
preamble the two routes diverge — the parse-time loop uses a single reduced
`provableArgType` and feeds array-literal element sinks, while the imported route
uses the set-based `collectProvableArgTypes` and emits through `checkFnArgCompat` —
but the parameter-indexing, annotation-guard, and type-conversion preamble is still
hand-duplicated.

## Evidence

**`src/extension/invoke-imported-checks.ts:248-262`:**
```ts
    const libraryEnv = libraryEnvFor(callee.libraryStatements);
    const matchedCount = Math.min(call.args.length, callee.fn.params.length);
    for (let i = 0; i < matchedCount; i += 1) {
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
      const argExpr = call.args[i] as Expr;
      const argTypes = collectProvableArgTypes(argExpr, importerEnv, importerPass);
```

**`src/parser/type-layer-walk.ts:1378-1392`:**
```ts
  private checkFnCallArgLoop(
    fn: FnDecl,
    e: CallExpr,
    bindings: ReadonlyMap<string, CompatType>,
    sunkArgs: Set<Expr>,
  ): void {
    const matchedCount = Math.min(e.args.length, fn.params.length);
    for (let i = 0; i < matchedCount; i += 1) {
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
      const paramType = annotationToCompatType(p.type);
      if (paramType === undefined) {
        // An unannotated parameter (`p.type` is the empty string) has no
        // declared type to be an element sink either.
        continue;
      }
      const arg = e.args[i] as Expr;
      const argType = this.provableArgType(arg, bindings);
```

**Diff verdict:** renamed-only within the clone-map window (G041). The renames are
`param` ↔ `p`, `callee.fn.params` ↔ `fn.params`, `call.args` ↔ `e.args`,
`argExpr` ↔ `arg`, `argTypes` ↔ `argType`, `collectProvableArgTypes(...)` ↔
`this.provableArgType(...)`. Control flow and the guard/conversion sequence are
otherwise identical. The copies diverge immediately after the cited spans in how
they prove and act on argument types.

## Why this is a problem
Both routes enforce the same language rule — per-slot argument-type compatibility
for a user `fn` call — on the same `FnParam`/`CallExpr` data. The duplicated block
is the part that decides *which* parameter/argument pairs are even judged: it
indexes both sides, decides whether the parameter annotation is parseable, converts
it to a `CompatType`, and selects the argument. If that guard or conversion changes
in one route (for example, a refinement of which annotations are treated as absent,
or a change in how an empty `type` string is interpreted) and is missed in the other,
imported `.thetalib` `fn` calls and same-file `fn` calls will silently disagree on
which calls reach a type-mismatch verdict. The surrounding code already accepts that
the two routes need different proving strategies — set-based vs. single-type, element
sinks vs. none — but that specialization does not require copying the common
parameter-selection and annotation-conversion preamble.

## Suggested direction (non-binding, optional)
A shared helper in `src/parser/` (nearest common ancestor reachable from both routes
without violating the parser→extension dependency direction) that, given a `FnDecl`
and a `CallExpr`, yields each surviving `(param, paramType, arg)` pair after the
annotation guards. The parse-time route would add its single-type proving and
array-literal sink handling; the imported route would add its set-based proving and
`checkFnArgCompat` emission. This mirrors the existing centralization pattern for
`checkInvokeArity` / `checkToolCallArguments` / `checkFnCallArity`, which the
invoke-static-checks surface already uses to keep related callable-kind rules in one
place.

## False-positive check
- Both excerpts re-read verbatim at the cited lines immediately before filing; the
  text matches clone-map group **G041**'s boundaries.
- Both copies live: `checkImportedFnCallArgs` is called from
  `checkThetaImports` (`src/extension/import-static-checks.ts:1773`), and
  `checkFnCallArgLoop` is called from `TypeLayerWalk.checkFnCallArgs`
  (`src/parser/type-layer-walk.ts:1386`).
- Not `tests/`; both sites are hand-authored production sources under `src/`.
- Not generated: no generator marker, and both file headers describe hand-maintained
  static-check wiring.
- Not a spec-repeated normative vector: the per-argument type rule is stated once in
  `tool-calls.md` / `invocation.md`; these are two code implementations of it.
- Duplicate-finding check: grepped `quality/intake`, `quality/issues`, and
  `quality/resolved` for `checkImportedFnCallArgs` + `checkFnCallArgLoop` and for
  `G041`. The closest existing items are `PTQ-0374` (same pattern inside
  `invoke-static-checks.ts`, theta-callable vs. runtime-tool, resolved) and
  `PTQ-1211` (D9 size breakdown of `checkFnCallArgs`/`checkFnCallArgLoop`, fixed);
  neither covers this cross-module clone between the imported-fn route and the
  parse-time `checkFnCallArgLoop`.

## Triage
verdict: confirmed — clone reproduces: both excerpts match verbatim at invoke-imported-checks.ts:248-263 / type-layer-walk.ts:1378-1396 and `clone-scan.mjs map` on the first file lists exactly `G041 — 65 tokens — renamed-only (6)` for the pair; both copies live (checkImportedFnCallArgs ← import-static-checks.ts:1773; checkFnCallArgLoop ← type-layer-walk.ts:1335, filing's :1386 is line drift); not a spec-vector table and not incidental — the imported route's own comment says it is "mirroring `checkFnCallArgs`'s identical guard"; dedupe: same root cause as the former PTQ-0375 (then G055, invoke-imported-checks.ts vs type-layer-checks.ts) which the human deferred and removed in d54fc176 (TRIAGE_LOG:81) explicitly "until the type-layer-checks.ts breakdown ruling … re-file or re-accept then" — that precondition is now met (PTQ-1158 fixed, type-layer-checks.ts 802 LOC, annotationToCompatType/annotationSourceIsNotTypeExpression already relocated to annotation-compat.ts/annotation-validation.ts and imported by both copies), so no over-band move blocks the dedupe and no open/resolved row tracks it; this is the sanctioned re-filing, fix is a mechanical helper extraction in src/parser/ (triage: claude-fable-5-1)
