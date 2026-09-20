---
id: pending
title: Withheld-binder guard duplicated in let and reassign compatibility checks
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/type-layer-checks.ts:1684-1698
  - src/parser/type-layer-checks.ts:1842-1856
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Withheld-binder guard duplicated in let and reassign compatibility checks

## Observation
`walkStmt`'s `case "let"` and `case "reassign"` in `src/parser/type-layer-checks.ts` both refuse to emit a compatibility diagnostic when the type on either side contains a withheld binder. Clone-map group G087 flags the duplicated guard block.

## Evidence
`src/parser/type-layer-checks.ts:1684-1698` (clone-map group G087):
```ts
          let sunkArrays: ReadonlySet<Expr> =
            sunkArray === null ? NO_SUNK_ARRAYS : new Set([sunkArray.node]);
          if (annotation !== undefined && !containsWithheldBinderType(rhsType)) {
            // The typed-binding RHS narrowing / mismatch check (surfaces
            // `theta/parse/integer-narrowing` for a `number → integer` RHS).
            // Reads the RAW `annotation` (TYPE-11 makes it and `sunkArray`'s
            // unfolded element the same type), so this renders `expected U`.
            this.diagnostics.push(
              ...checkLetRhsCompat({
                name: stmt.name,
                annotation,
                rhs: rhsType,
                env: this.env,
                site: { file: this.file, range: stmt.range },
              }),
            );
          }
```

`src/parser/type-layer-checks.ts:1842-1856` (clone-map group G087):
```ts
          const rhsType = this.typeOf(stmt.value, bindings);
          // A WITHHELD binder on either side is a spelling, not a proven
          // type (see the `let` arm above), so judging against it would
          // manufacture a verdict the position never supported.
          if (!containsWithheldBinderType(declared) && !containsWithheldBinderType(rhsType)) {
            this.diagnostics.push(
              ...checkReassignRhsCompat({
                name: stmt.target,
                declared,
                value: rhsType,
                env: this.env,
                site: { file: this.file, range: stmt.range },
              }),
            );
          }
```

Diff verdict: renamed-only (clone-map group G087). Both blocks test `containsWithheldBinderType(...)` before pushing a RHS-compatibility diagnostic; the variable names and the exact number of operands checked differ only because `let` has an annotation and `reassign` has a declared target.

## Why this is a problem
The rule "do not judge a compatibility position when a withheld binder is present" is enforced independently in two statement arms. If the semantics of withheld binders evolve — for example, if the guard needs to look through `union` arms differently or if a new kind of withheld type is introduced — both the `let` and `reassign` arms must be updated or the type layer will produce inconsistent verdicts for otherwise equivalent bindings.

## Suggested direction (non-binding, optional)
The natural shared home is `src/parser/type-layer-checks.ts`. A small helper such as `typesAreJudgeable(...types: CompatType[]): boolean` would replace both guard expressions.

## False-positive check
- Re-verified both spans at HEAD; both the `let` and `reassign` arms are live.
- Confirmed clone-map group G087 matches these exact line ranges.
- Searched `quality/intake/` for `containsWithheldBinderType`, `checkLetRhsCompat`, and `checkReassignRhsCompat`: no existing D4 filing covers this guard duplication.
- Not a spec-normative vector table; not generated code; not in `tests/`.

## Triage
