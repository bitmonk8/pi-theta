---
id: pending
title: The raw-byte invalid-UTF-8 gate is duplicated between lexTheta and parseThetaDocument
lens: D4
status: intake
verdict: pending
locations:
  - src/lexer/lexer.ts:95-108
  - src/parser/theta-document.ts:1046-1067
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# The raw-byte invalid-UTF-8 gate is duplicated between lexTheta and parseThetaDocument

## Observation
Both `lexTheta` (the lexer entry seam) and `parseThetaDocument` (the whole-file parser entry seam) begin by running the same raw-byte UTF-8 validation ritual on `source.bytes`: call `firstInvalidUtf8Offset`, and when it returns a non-negative offset build a `theta/load/invalid-encoding` diagnostic, emit it through the V7d channel, and return early. `parseThetaDocument` needs this gate because the `lexTheta` call it makes later is fed re-encoded `bodyText`, which no longer carries the original byte offsets (bug 0410 comment at the parser site). The two copies are byte-identical except for the channel argument name and the returned payload shape.

## Evidence
`src/lexer/lexer.ts:95-108`:
```ts
  // Step 1 — UTF-8 validation against the raw, pre-normalisation bytes, so the
  // first-invalid-byte offset is observable (lexical.md §Encoding). A non-UTF-8
  // BOM faults on its own leading byte, yielding offset 0 per the spec.
  const invalidOffset = firstInvalidUtf8Offset(source.bytes);
  if (invalidOffset >= 0) {
    const encodingDiag: Diagnostic = {
      severity: "error",
      code: "theta/load/invalid-encoding",
      file,
      message: `invalid UTF-8 encoding at byte offset ${invalidOffset}`,
    };
    emitDiagnosticBatch([encodingDiag], deps);
    return { tokens: [], diagnostics: [encodingDiag], ok: false };
  }
```

`src/parser/theta-document.ts:1046-1067`:
```ts
  const invalidOffset = firstInvalidUtf8Offset(source.bytes);
  if (invalidOffset >= 0) {
    const encodingDiag: Diagnostic = {
      severity: "error",
      code: "theta/load/invalid-encoding",
      file,
      message: `invalid UTF-8 encoding at byte offset ${invalidOffset}`,
    };
    emitDiagnosticBatch([encodingDiag], deps.systemNote);
    return {
      frontmatter: null,
      body: { statements: [], tail: null },
      diagnostics: [encodingDiag],
      deliveredDiagnostics: [encodingDiag],
    };
  }
```

Diff verdict: **renamed-only**. The diagnostic-construction block is identical; only the channel argument identifier differs (`deps` in the lexer, `deps.systemNote` in the parser) and the early-return payload is shaped for the respective function contract (`LexResult` vs `ThetaDocument`). Clone-map group: **G060**.

## Why this is a problem
The gate is load-bearing: lexical.md §Encoding requires that `theta/load/invalid-encoding` name the zero-based offset of the first invalid byte in the original file content, with a non-UTF-8 BOM faulting at offset 0. Because `parseThetaDocument` cannot rely on the later `lexTheta` call to observe the original bytes, it must apply the same rule at entry. If the two copies drift, the lexer and parser could accept or reject the same invalid-UTF-8 source differently, or report different offsets, breaking the invariant that the whole-file parser and the standalone lexer agree on the encoding refusal. The duplicated block is not an incidental loop; it is the same spec clause implemented in both entry seams.

## Suggested direction (non-binding, optional)
The encoding gate is a lexical concern and the parser already imports from `src/lexer/lexer.ts`; a shared helper exported from `src/lexer/` (for example, a function that takes the raw bytes, the file name, and the emission channel, and returns the diagnostic or `undefined`) would let both `lexTheta` and `parseThetaDocument` call one implementation. The natural shared home is the `src/lexer/` module tree.

## False-positive check
- Re-verified both copies at the cited line ranges; both are live entry-seam code.
- Confirmed the clone-map group **G060** matches the cited spans.
- The similarity is implementation code, not a spec-normative vector table; the spec clause is referenced only in comments.
- Neither copy is in `tests/`; both are production sources.
- The parser's copy is explicitly annotated as bug 0410 fix option 1, so the duplication is deliberate but not extract-avoided.

## Triage
