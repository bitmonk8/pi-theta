---
id: pending
title: Type-annotation validation is cloned across let, fn-param, fn-return and invoke-return-schema positions
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:9511-9565
  - src/parser/theta-document.ts:9638-9688
  - src/parser/theta-document.ts:9696-9740
  - src/parser/theta-document.ts:10125-10190
sites: 4
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Type-annotation validation is cloned across let, fn-param, fn-return and invoke-return-schema positions

## Observation
`walkStatement` and `walkExpr` validate type annotations in four different
positions using the same sequence of steps. Each position parses the annotation
source with `parseTypeExpression`, applies a guard-1 check that suppresses
further diagnostics when `parseTypeExpression` already emitted an error,
optionally checks `annotationSourceIsNotTypeExpression`, applies a
propagation/absorption withhold rule, and then runs `collectUnresolvedNamedTypes`
to emit `reserved-keyword-as-identifier` and `unresolved-named-type`
diagnostics. The copies differ only in local names, the `TypePosition` string
passed to `parseTypeExpression`, the propagation key (`"let"`, `"fn-param"`,
`"fn-return"`), the absorption-window helper, and whether
`annotationSourceIsNotTypeExpression` is run (it is absent from the
`invoke<T>` arm).

## Evidence
Clone-map groups: **G005** (let versus fn-return, 117 tokens, renamed-only),
**G023** (let versus invoke inner block, 92 tokens, renamed-only), **G026**
(let/fn-return/invoke inner block, 86 tokens, renamed-only), and **G064**
(keyword/name emission loops across all four positions, 64 tokens,
renamed-only).

- `src/parser/theta-document.ts:9511-9565` (`case "let"` annotation):
  ```ts
      if (s.annotation !== null && s.annotation.length > 0) {
        const annotationDiagStart = out.length;
        out.push(
          ...parseTypeExpression(s.annotation, "value", { file, range: s.range }),
        );
        if (
          !out.slice(annotationDiagStart).some((d) => d.severity === "error") &&
          annotationSourceIsNotTypeExpression(s.annotation)
        ) {
          out.push(annotationTypeNotExpressionDiagnostic(s.name, s.range, file));
        }
        if (
          !propagatedToQuery(refs, { kind: "let", range: s.range }) &&
          !out.slice(annotationDiagStart).some((d) => d.severity === "error") &&
          !(
            (s.annotationAbsorbed ?? false) &&
            captureWindowAlreadyRefused(
              refs.priorDiagnostics,
              out,
              captureAbsorptionWindow(s.range, s.init),
              s.range,
            )
          )
        ) {
          const letReservedKeywords: string[] = [];
          const letUnresolved = collectUnresolvedNamedTypes(
            s.annotation,
            withBuiltinErrorModelNames(refs.typeNames),
            letReservedKeywords,
          );
          for (const keyword of letReservedKeywords) {
            out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
          }
          for (const name of letUnresolved) {
            out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
          }
        }
      }
  ```

- `src/parser/theta-document.ts:9638-9688` (`fn` parameter type):
  ```ts
        if (p.type.length > 0) {
          const paramDiagStart = out.length;
          out.push(
            ...parseTypeExpression(p.type, "value", { file, range: s.range }),
          );
          if (
            !out.slice(paramDiagStart).some((d) => d.severity === "error") &&
            annotationSourceIsNotTypeExpression(p.type)
          ) {
            out.push(annotationTypeNotExpressionDiagnostic(p.name, s.range, file));
          }
          if (
            !propagatedToQuery(refs, {
              kind: "fn-param",
              range: s.range,
              paramIndex,
            }) &&
            !out.slice(paramDiagStart).some((d) => d.severity === "error") &&
            !(
              (p.typeAbsorbed ?? false) &&
              captureWindowAlreadyRefused(refs.priorDiagnostics, out, fnHeaderWindow(s), s.range)
            )
          ) {
            const paramReservedKeywords: string[] = [];
            const paramUnresolved = collectUnresolvedNamedTypes(
              p.type,
              withBuiltinErrorModelNames(refs.typeNames),
              paramReservedKeywords,
            );
            for (const keyword of paramReservedKeywords) {
              out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
            }
            for (const name of paramUnresolved) {
              out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
            }
          }
        }
  ```

- `src/parser/theta-document.ts:9696-9740` (`fn` return type):
  ```ts
      if (s.returnType !== null && s.returnType.length > 0) {
        const returnDiagStart = out.length;
        out.push(
          ...parseTypeExpression(s.returnType, "return", {
            file,
            range: s.range,
          }),
        );
        if (
          !out.slice(returnDiagStart).some((d) => d.severity === "error") &&
          annotationSourceIsNotTypeExpression(s.returnType)
        ) {
          out.push(annotationTypeNotExpressionDiagnostic(s.name, s.range, file));
        }
        if (
          !propagatedToQuery(refs, { kind: "fn-return", range: s.range }) &&
          !out.slice(returnDiagStart).some((d) => d.severity === "error") &&
          !(
            (s.returnTypeAbsorbed ?? false) &&
            captureWindowAlreadyRefused(refs.priorDiagnostics, out, fnHeaderWindow(s), s.range)
          )
        ) {
          const returnReservedKeywords: string[] = [];
          const returnUnresolved = collectUnresolvedNamedTypes(
            s.returnType,
            withBuiltinErrorModelNames(refs.typeNames),
            returnReservedKeywords,
          );
          for (const keyword of returnReservedKeywords) {
            out.push(reservedKeywordAsIdentifierDiagnostic(keyword, s.range, file));
          }
          for (const name of returnUnresolved) {
            out.push(unresolvedNamedTypeDiagnostic(name, s.range, file));
          }
        }
      }
  ```

- `src/parser/theta-document.ts:10125-10190` (`invoke<T>` return schema):
  ```ts
      if (e.returnSchema !== null && e.returnSchema.trim().length > 0) {
        const invokeDiagStart = out.length;
        out.push(
          ...parseTypeExpression(
            e.returnSchema,
            "value",
            { file, range: e.range },
            "inline-object-shape",
          ),
        );
        if (
          !out.slice(invokeDiagStart).some((d) => d.severity === "error") &&
          !(
            (e.returnSchemaAbsorbed ?? false) &&
            captureWindowAlreadyRefused(
              refs.priorDiagnostics,
              out,
              captureAbsorptionWindow(e.range, e.args[0]),
              e.range,
            )
          )
        ) {
          const invokeReservedKeywords: string[] = [];
          const invokeUnresolved = collectUnresolvedNamedTypes(
            e.returnSchema,
            withBuiltinErrorModelNames(refs.typeNames),
            invokeReservedKeywords,
          );
          for (const keyword of invokeReservedKeywords) {
            out.push(reservedKeywordAsIdentifierDiagnostic(keyword, e.range, file));
          }
          for (const name of invokeUnresolved) {
            out.push(unresolvedNamedTypeDiagnostic(name, e.range, file));
          }
        }
      }
  ```

Diff verdict: **renamed-only** across all four copies. Local identifiers and
the position-specific propagation/absorption window helpers vary; the control
flow and the shared validation calls are the same. The `invoke<T>` copy omits
the `annotationSourceIsNotTypeExpression` check but is otherwise identical to
the inner block of the other three copies.

## Why this is a problem
The same bug-fix sequence (`parseTypeExpression` → guard-1 →
`annotationSourceIsNotTypeExpression` → propagation/absorption withhold →
`collectUnresolvedNamedTypes` → emit diagnostics) is wired independently for
four annotation positions. If the annotation-validation rules change — for
example, a new guard, a different `TypePosition`, or a change to how
reserved keywords are reported — the update must be made in all four places.
The comments already cross-reference the same bug numbers (0124, 0262, 0279) in
each copy, which is evidence that the positions are maintained as a set by
hand. The `invoke<T>` arm's omission of `annotationSourceIsNotTypeExpression`
is a concrete divergence that is easy to miss precisely because the shared
machinery is inlined rather than centralized.

## Suggested direction (non-binding, optional)
A single helper in the same module could take the annotation source, the
position string, the binder/declaration name, the propagation key, the
absorption window, and an optional `inlineObjectShape` walk flag, then run the
common validation and emit diagnostics. The four call sites would supply their
position-specific values.

## False-positive check
- Re-read all four spans at the cited lines; each is a live code path in the
  active `walkStatement` / `walkExpr` functions.
- Verified the copies are not dead code: `walkStatement` and `walkExpr` are
  called from the document-check pipeline.
- The similarity is not a normative reference vector repeated by the spec; it
  is implementation machinery.
- The similarity is not in tests/ or generated code.

## Triage
