---
id: PTQ-1442
title: par-for query diagnostic duplicated in statement and expression arms
lens: D4
status: open
verdict: confirmed
locations:
  - src/parser/par-for-body-checks.ts:131-140
  - src/parser/par-for-body-checks.ts:193-202
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923035927
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# par-for query diagnostic duplicated in statement and expression arms

## Observation
The CTRL-4 `par for` body-restriction scan refuses an `@` query in two syntactic positions: as a statement (`case "query"` in `scanParForStmt`) and as an expression (`case "query"` in `scanParForExpr`). Both arms build the identical `theta/parse/par-query-in-body` diagnostic; the only token-level differences are the variable names `s` and `e` and their `.range` accessors. The clone map groups these two emission spans as G061.

## Evidence

**`src/parser/par-for-body-checks.ts:131-140` (`scanParForStmt` statement switch):**

```typescript
    case "query":
      sink.diagnostics.push({
        severity: "error",
        code: "theta/parse/par-query-in-body",
        file: sink.file,
        range: s.range,
        message:
          "`@` query against the enclosing conversation is not permitted inside a 'par for' body",
      });
      return;
```

**`src/parser/par-for-body-checks.ts:193-202` (`scanParForExpr` expression switch):**

```typescript
    case "query":
      sink.diagnostics.push({
        severity: "error",
        code: "theta/parse/par-query-in-body",
        file: sink.file,
        range: e.range,
        message:
          "`@` query against the enclosing conversation is not permitted inside a 'par for' body",
      });
      return;
```

**Diff verdict:** renamed-only — the two spans are byte-identical except for `s.range` versus `e.range`. Clone-map group: **G061**.

## Why this is a problem
The two arms enforce the same CTRL-4 rule in the only two syntactic positions a query can appear. If one arm changes its diagnostic code, message text, or severity, the other must change in lockstep; otherwise authors receive inconsistent diagnostics depending only on whether they wrote `@...` as a statement or as an expression. The duplication is not a spec-normative vector table repeated by the spec, and the two copies are not each independently spec-anchored — it is the same implementation block copied into both AST switches.

## Suggested direction (non-binding, optional)
A single helper in `src/parser/par-for-body-checks.ts` that accepts a `SourceRange` and emits the `theta/parse/par-query-in-body` diagnostic would let both `case "query"` arms delegate to one implementation.

## False-positive check
- Re-verified clone-map group G061 at the cited spans; both copies are live execution paths (queries can parse as either `Stmt` or `Expr`).
- Not a spec-normative reference vector table; the diagnostic message is implementation text, not a clause-repeated enumeration.
- Not in `tests/`.
- Searched `quality/intake/` and `quality/issues/` for `par-query-in-body` and for par-for body-check topics; no prior filing matches this duplicated diagnostic.

## Triage
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted.
