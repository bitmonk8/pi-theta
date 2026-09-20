---
id: pending
title: for and par-for iterand contract checks cloned in type-layer-checks
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:1882-1896
  - src/parser/type-layer-checks.ts:3351-3365
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# for and par-for iterand contract checks cloned in type-layer-checks

## Observation
`walkStmt`'s `case "for"` and `walkExpr`'s `case "par-for"` in `src/parser/type-layer-checks.ts` both enforce the same iterand contract: the iterand type is reduced, withheld binders cause the check to be skipped, otherwise `checkForIterand` is called and any diagnostic is pushed. The `par-for` arm's own comment calls this "The `for` arm's withhold, at this row's second call site." Clone-map group G020 flags the duplication.

## Evidence
`src/parser/type-layer-checks.ts:1882-1896` (clone-map group G020):
```ts
      case "for": {
        // `checkForIterand` refuses every non-`array<T>` iterand, an
        // unresolvable `named` included (../parser/control-flow.ts), so it is
        // the one row that cannot defer on a withheld read by itself: the
        // verdict is withheld here instead. A `for` body inside another binder's
        // scope reaches this with the enclosing binder's withheld entry.
        const iterandType = this.typeOf(stmt.iterand, bindings);
        const diag = containsWithheldBinderType(iterandType)
          ? undefined
          : checkForIterand(
              { type: iterandType },
              { file: this.file, range: stmt.iterand.range },
              this.env,
            );
        if (diag !== undefined) {
          this.diagnostics.push(diag);
        }
        this.walkExpr(stmt.iterand, bindings, flow);
```

`src/parser/type-layer-checks.ts:3351-3365` (clone-map group G020):
```ts
      case "par-for": {
        // CTRL-2 / grammar.md: the iterand reuses the `for` contract — a
        // non-`array<T>` iterand is `theta/parse/non-array-iterand`.
        // The `for` arm's withhold, at this row's second call site.
        const rawIterandType = this.typeOf(e.iterand, bindings);
        const iterDiag = containsWithheldBinderType(rawIterandType)
          ? undefined
          : checkForIterand(
              { type: rawIterandType },
              { file: this.file, range: e.iterand.range },
              this.env,
            );
        if (iterDiag !== undefined) {
          this.diagnostics.push(iterDiag);
        }
        this.walkExpr(e.iterand, bindings, flow);
```

Diff verdict: renamed-only (clone-map group G020). The logic is identical; only the local names (`stmt.iterand` vs. `e.iterand`, `diag` vs. `iterDiag`) and the comments differ.

## Why this is a problem
The two loop forms share a documented contract (`CTRL-2` / `grammar.md` / `control-flow.md`). If the contract changes — for example, if the withholding rule for unprovable iterands is refined, or if the diagnostic code changes — both call sites must change. The inline comment acknowledges the second call site, which means the duplication is intentional but still load-bearing.

## Suggested direction (non-binding, optional)
The natural shared home is `src/parser/type-layer-checks.ts`. A private helper such as `checkIterand(expr, bindings, flow)` would remove the second copy while preserving the surrounding per-loop logic (variable binding for `for`, `max` and body binding for `par-for`).

## False-positive check
- Re-verified both spans at HEAD; both `for` and `par-for` arms are live.
- Confirmed clone-map group G020 matches these exact line ranges.
- Searched `quality/intake/` for `checkForIterand`, `par-for`, and the `for` arm in `type-layer-checks`: no existing D4 filing covers this duplication.
- Not a spec-normative vector table; not generated code; not in `tests/`.

## Triage
