---
id: PTQ-1720
title: theta-document diagnostic builders still point above to extracted annotation builders.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/theta-document.ts:1283-1288
  - src/parser/theta-document.ts:1310-1315
  - src/parser/annotation-validation.ts:212-223
  - src/parser/annotation-validation.ts:237-248
sites: 2
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# theta-document diagnostic builders still point above to extracted annotation builders.

## Observation
The `capitalisedPatternHeadDiagnostic` and `schemaTypeNotExpressionDiagnostic` docstrings point to sibling builders “above” in `theta-document.ts`. Those referenced builders are defined in `annotation-validation.ts`, not above either docstring in the document module. The diagnostic comparisons remain descriptions of live builders, but the local navigation pointers survived their extraction.

## Evidence
The reserved-keyword builder pointer, `src/parser/theta-document.ts:1283-1288`:

```ts
 * disambiguation sentence assigns the binding reading to a lowercase
 * identifier only; this builder renders the refusal for the capitalised one.
 * Same severity/range/file construction as `reservedKeywordAsIdentifierDiagnostic`
 * above, the sibling builder for the reserved-keyword half.
 */
function capitalisedPatternHeadDiagnostic(
```

The unresolved-name builder pointer, `src/parser/theta-document.ts:1310-1315`:

```ts
 * their own — so two offending fragments in one declaration render IDENTICAL
 * text: the count rule made visible, not a duplicate. Held identical to the
 * registry row's Message by DIAG-4 rather than by shared code, matching
 * `unresolvedNamedTypeDiagnostic` above.
 */
function schemaTypeNotExpressionDiagnostic(
```

The unresolved-name builder's current definition, `src/parser/annotation-validation.ts:212-223`:

```ts
export function unresolvedNamedTypeDiagnostic(
  name: string,
  range: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: UNRESOLVED_NAMED_TYPE_CODE,
    file,
    range,
    message: `unresolved named type '${name}'`,
  };
```

The reserved-keyword builder's current definition, `src/parser/annotation-validation.ts:237-248`:

```ts
export function reservedKeywordAsIdentifierDiagnostic(
  keyword: string,
  range: SourceRange,
  file: string,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/reserved-keyword-as-identifier",
    file,
    range,
    message: `reserved keyword '${keyword}' cannot be used as an identifier`,
  };
```

Exact search: `grep -nE 'reservedKeywordAsIdentifierDiagnostic|unresolvedNamedTypeDiagnostic' src/parser/theta-document.ts` returns three hits: the comments at 1285, 1308, and 1313. None is a declaration or import. The two counted occurrences are the two quoted “above” pointers, not the additional non-local comparison at line 1308.

## Why this is a problem
This is extraction residue in the builders' ownership/navigation prose. Both comments direct readers to an earlier local definition that no longer exists, rather than to the module containing the compared diagnostic construction. The finding does not question keeping the builders separate or holding their messages to the registry.

## False-positive check
Read both document-module docstrings and the referenced definitions in `annotation-validation.ts`. Ran the exact search listed above to exclude a remaining local definition or import. `git log --oneline -S 'function reservedKeywordAsIdentifierDiagnostic' -- src/parser/theta-document.ts src/parser/annotation-validation.ts` identifies `bb21dacc` as the extraction; `git show bb21dacc -- src/parser/theta-document.ts` shows both referenced builders removed from that file. The root cause is the surviving local pointers, not dead declarations, export style, or duplication between the live builders.

## Triage
verdict: confirmed — Both “above” pointers reproduce at theta-document.ts:1285-1286 and :1313, but their live targets are defined in annotation-validation.ts:212 and :237; the three-hit search and bb21dacc extraction history reproduce, and no existing finding tracks these stale local pointers. (triage: claude-opus-5-5)
