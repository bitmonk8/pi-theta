---
id: PTQ-1219
title: assembleDiagnostics orders the spec-pinned (file, line, col) sort's file key with locale-sensitive localeCompare instead of a fixed collation
lens: D8
status: fixed
verdict: confirmed
locations:
  - src/diagnostics/diagnostic.ts:128-139
  - src/code-point-order.ts:19-31
sites: 1
fix_scope: localized
d8_class: against-grain
d8_host: src/diagnostics/diagnostic.ts#assembleDiagnostics
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# assembleDiagnostics orders the spec-pinned (file, line, col) sort's file key with locale-sensitive localeCompare instead of a fixed collation

## Observation
`assembleDiagnostics` (src/diagnostics/diagnostic.ts:119-139, 107 src importers of the `Diagnostic` shape, 2 src importers of the function) implements the cross-file diagnostic ordering the spec pins ("the `(file, line, col)` diagnostic aggregation order", implementation-notes.md:16) and that four bug docs (0123, 0129, 0133, 0151) describe as "stable by construction" and rely on for exact rendered order. The `file` component of that key is compared with `String.prototype.localeCompare`, whose comparison ECMA-262 defines as locale- and implementation-dependent, while the repository's own dependency-free canonical comparator `compareCodePoint` (src/code-point-order.ts) exists precisely for "canonical-serialisation obligations" and is unused here.

## Evidence
The fighting usage — src/diagnostics/diagnostic.ts:126-132 (re-read before filing):
```ts
  // Order by (file, line, col). Location-less fields sort ahead of located
  // ones (empty file / position 0). Array.prototype.sort is stable, so
  // diagnostics tying on the full key keep their collected order.
  return collected.sort((a, b) => {
    const fileCmp = (a.file ?? "").localeCompare(b.file ?? "");
    if (fileCmp !== 0) {
      return fileCmp;
    }
```

The documented intent of the API, verbatim (ECMA-262 §String.prototype.localeCompare): "This method is intended to rely on whatever language-sensitive comparison functionality is available to the implementation, and to compare according to the rules of the host environment's current locale. […] The actual return values are implementation-defined". Under ECMA-402 (Node's ICU-backed implementation) the result additionally varies with the default locale and the ICU data the Node build ships (small-icu vs full-icu).

The in-repo facility built for exactly this job — src/code-point-order.ts:2-12 (header, verbatim):
```
// A pure, dependency-free helper (no imports) shared by two independent
// canonical-serialisation obligations that each require object keys in
// ascending Unicode code-point order: [...] One shared
// implementation means a correction to the comparison (an empty string, an
// unpaired surrogate, an astral-plane character) reaches both call sites.
```

Concrete divergence at the call site's real data (multi-file batches mix an entry `.theta` with imported `.thetalib` paths): for files `Z.thetalib` and `a.thetalib`, code-point/byte order puts `Z` (U+005A) before `a` (U+0061); en-locale ICU collation puts `a` before `Z`. ICU collation also weights `-`, `_`, `.` and case differently from byte order, all characters that occur in real theta file paths. The rendered order of `renderDiagnosticBatch` and every test asserting cross-file diagnostic order therefore depends on the host's locale/ICU configuration.

## Why this is a problem
The comment, the spec citation, and four bug docs all treat this ordering as a fixed, deterministic key ("stable by construction", bugs/0123:299, bugs/0129:186-189), but the file component is delegated to an API whose contract is expressly "according to the rules of the host environment's current locale" with implementation-defined return values — the opposite of a canonical ordering. This is API use against the documented grain: a language-sensitive human-collation facility carrying a machine-canonical serialisation obligation, in a codebase that already declared (code-point-order.ts header) that such obligations should share one fixed comparator.

## Suggested direction (non-binding, optional)
Unproven hypothesis: compare the file key with the existing `compareCodePoint` (or plain code-unit `<`, if UTF-16 order is deliberately acceptable for paths), which removes the locale/ICU dependency without changing the (file, line, col) key structure. Whether any committed expectation currently depends on ICU collation of mixed-case paths has not been verified.

## False-positive check
- Exemption check: no D8 exemption exists for `src/diagnostics/diagnostic.ts` or `assembleDiagnostics`.
- Duplicate check: scanned the qw filing roster and PTQ index for `assembleDiagnostics` / `localeCompare` — no prior filing (PTQ-0357 concerns duplicated `compareCodePoint` copies, a different root cause).
- Spec check: implementation-notes.md:16 pins the `(file, line, col)` key, not a collation; this filing does not argue against a spec clause (no `challenges_spec`).
- Reference search: `localeCompare` occurs at exactly one site in src/ (grep, 1 hit: diagnostics/diagnostic.ts:129).
- D2-precedent check: not a dead-export/threaded-parameter shape; the code is live production (called from the parser assembly path per bugs/0133:229-231).

## Triage
verdict: questionable — accounting verified: excerpt byte-exact at src/diagnostics/diagnostic.ts:126-132, `localeCompare` is the sole src/ hit (grep: 1), `compareCodePoint` exists at src/code-point-order.ts:19-31 with its quoted header and 2 live importers (compact-transcript.ts:207, schema-lowering.ts:89), no D8 exemption for diagnostic.ts/assembleDiagnostics, live callers theta-document.ts:315 and par-for-executor.ts:358; the against-grain intent is real (ECMA-262 localeCompare is locale/implementation-defined; GOV-15 expects identical ordered diagnostic-code sequences) and implementation-notes.md:16 pins the (file, line, col) key without a collation, so no spec clause is dropped; the only inaccuracy is a paraphrase — 0123:292/0129:187 say "Order is stable", not "stable by construction" — non-blocking; the simpler shape (compareCodePoint vs code-unit `<`) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
