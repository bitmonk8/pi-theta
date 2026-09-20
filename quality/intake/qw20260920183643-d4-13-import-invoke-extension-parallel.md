---
id: pending
title: Import and invoke path-extension checks are parallel surfaces
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/imports.ts:121-138
  - src/parser/invoke-diagnostics.ts:613-630
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# Import and invoke path-extension checks are parallel surfaces

## Observation
`src/parser/imports.ts` owns `checkImportExtension`, which rejects any `import … from` path that does not end in the byte-exact lowercase extension `.thetalib`. `src/parser/invoke-diagnostics.ts` owns `checkInvokeExtension`, which rejects any `invoke(...)` or `tools:` path that does not end in the byte-exact lowercase extension `.theta`. The two functions are not clone-shaped — they return different diagnostic shapes, use different constants, and cite different registry codes — but their core predicate is the same `endsWith` check against the literal path, governed by the same `lexical.md` §"Extension matching" rule.

## Evidence

`src/parser/imports.ts:121-138`:
```typescript
export function checkImportExtension(
  pathLiteral: string,
  site: ImportSite,
): Diagnostic | undefined {
  // Byte-exact lowercase `.thetalib`: `.THETALIB` / `.ThetaLib` / `.theta` all reject, on
  // every host regardless of the filesystem's case-equivalence model.
  if (pathLiteral.endsWith(".thetalib")) {
    return undefined;
  }
  return {
    severity: "error",
    code: IMPORT_NON_THETALIB_EXTENSION_CODE,
    file: site.file,
    range: site.range,
    message: importNonThetaLibExtensionMessage(pathLiteral),
    hint: IMPORT_NON_THETALIB_EXTENSION_HINT,
  };
}
```

`src/parser/invoke-diagnostics.ts:613-630`:
```typescript
export function checkInvokeExtension(input: InvokeExtensionInput): Diagnostic[] {
  const { literalPath, site } = input;
  // Byte-exact-lowercase `.theta` suffix (no realpath normalisation, no
  // case-folding): a `.thetalib` path or any non-lowercase variant such as `.THETA`
  // fires (invocation.md §Resolution). The same code fires for both surfaces.
  if (literalPath.endsWith(".theta")) {
    return [];
  }
  return [
    {
      severity: "error",
      code: INVOKE_NON_THETA_EXTENSION_CODE,
      file: site.file,
      ...(site.range !== undefined ? { range: site.range } : {}),
      message: invokeNonThetaExtensionMessage(literalPath),
      hint: INVOKE_NON_THETA_EXTENSION_HINT,
    },
  ];
}
```

Diff verdict: parallel (no clone-map group). The two functions differ in surface details, return cardinality, and diagnostic shape, but they both implement the single extension-matching predicate for their respective extensions.

## Why this is a problem
This is a load-bearing parallel truth: both surfaces enforce the same byte-exact lowercase extension rule from `lexical.md`. When the rule changes — for example, if case-folding were ever permitted, if realpath normalization were introduced, or if an additional extension were added — both surfaces must change in lockstep. Today they are independent; there is no shared predicate or helper, so an author can update one surface and forget the other. The result would be inconsistent diagnostics: `Personas.Thetalib` might be rejected by `import` but accepted by `invoke`, or vice versa.

## Suggested direction (non-binding, optional)
Shared source of truth (hypothesis): a single `checkExtension` predicate in `src/parser` that takes the literal path and the allowed extension, returning a boolean, leaving each surface to build its own diagnostic. Both `checkImportExtension` and `checkInvokeExtension` would consume it.

## False-positive check
- Re-read both functions immediately before filing; both are live production code.
- No clone-map group links these two spans; the similarity is below the scanner's token window because the extension strings and return shapes differ.
- Both functions cite the same `lexical.md` §"Extension matching" rule, confirming they are intended to implement the same predicate rather than incidental similarity.
- Not a spec-normative vector table; the spec states the rule once, but the implementation repeats it.
- No test files are involved.

## Triage
