---
id: PTQ-0522
title: The range-formatting and whole-diagnostic-render helpers are near-identically repeated between two arity/annotation test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/fn-call-arity-unchecked.test.ts:229-249
  - tests/fn-param-annotation-optional.test.ts:388-435
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The range-formatting and whole-diagnostic-render helpers are near-identically repeated between two arity/annotation test files

## Observation
`tests/fn-call-arity-unchecked.test.ts` and `tests/fn-param-annotation-optional.test.ts` each declare a local `at(r)` function that formats a `SourceRange` as `l:c-l:c`, and a local `render(doc)` function that turns every diagnostic on a `ThetaDocument` into a JSON string carrying severity, code, range and message, for use in failure-message payloads. The two `at` bodies differ only in whether the range argument is optional; the two `render` bodies differ only in whether the per-diagnostic mapping is inlined or routed through an intermediate `quads`/`triples` shape.

## Evidence
tests/fn-call-arity-unchecked.test.ts:229-249:
```ts
function at(r: SourceRange): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** Every diagnostic rendered `severity code @range: message` — the failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map(
      (d: Diagnostic) =>
        `${d.severity} ${d.code} @${d.range === undefined ? "-" : at(d.range)}: ${d.message}`,
    ),
  );
}
```

tests/fn-param-annotation-optional.test.ts:388-435:
```ts
function at(r: SourceRange | undefined): string {
  return r === undefined
    ? "-"
    : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}
...
/** The full quadruples of every diagnostic, in report order. */
function quads(doc: ThetaDocument): Quad[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    at: at(d.range),
    message: d.message,
  }));
}

/** Every diagnostic rendered for a failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(quads(doc));
}
```

Search performed: `grep -n "^function at(\|^function render(" tests/fn-call-arity-unchecked.test.ts tests/fn-param-annotation-optional.test.ts` — 2 hits for `at`, 2 hits for `render`, one pair per file, matching the two excerpts above exactly. `tests/helpers/e2e-s1.ts` (the shared driver both files already import `parseDoc` from) exposes `diagLines(doc)` and `diagCodes(doc)`, but neither carries the diagnostic's range, so neither file's `at`/range-inclusive `render` is served by an existing export there.

## Why this is a problem
Both functions solve the same problem — rendering a `l:c-l:c` span and a whole-document diagnostic dump for a test failure message — with the same field order (severity, code, range, message) and the same `l:c-l:c` format string, differing only in how the `undefined`-range case is spelled and whether the mapping is inlined or goes through an intermediate object shape. A change to the span format (e.g. adding a file name) or the field order would need to land in both places by hand with nothing to enforce that it lands identically.

## Suggested direction (non-binding, optional)
A shared `renderDiagnostics(doc)` (or a `formatRange(r)` primitive it composes) alongside the other diagnostic-shaped helpers already in `tests/helpers/e2e-s1.ts` is the kind of home this pattern would sit in, as an observation rather than a proposed design.

## False-positive check
Gate-pin: neither file matches `*gate*.test.ts` or the named gate-kin patterns. Recording-double: not applicable, these are pure formatting functions, not a MUST-NOT witness. docs/bugs/ signature search: no docs/bugs/*.md entry cites either function's exact shape as a pinned witness. coverage-matrix/bug-doc citation search: `grep -rl "fn-call-arity-unchecked\|fn-param-annotation-optional" docs/reference/coverage-matrix.md docs/bugs/*.md` returned no hits naming either test file, so neither is pinned against a merge/rename by citation. Confirmed via search of quality/intake and quality/resolved that no prior filing (this wave or earlier) names either of these two test files.

## Triage
verdict: confirmed — independently re-verified: both excerpts match verbatim at the cited lines and the `at` bodies share the identical `l:c-l:c` format string (differing only in where the `undefined` arm lives), a D7 boilerplate duplication of the PTQ-0205 diagLines shape with no e2e-s1 export carrying the range; corrections on record: (a) the `render` pair does NOT "differ only in inlining" — arity emits `"sev code @range: msg"` strings, annotation emits `{severity,code,at,message}` objects, so the shared root cause is the `at` formatter both compose; (b) `sites: 2` undercounts — the same formatter recurs in ~37 tests/*.test.ts (31 declaring a local `at()`); (c) the FP-check's "no docs/bugs hits" claim is false (0131/0150/0138/0144/0233 name both files as witnesses) but the direction is helper extraction, not merge/rename/delete, so no carve-out triggers; not tracked by PTQ-0205/0228/0278 or this wave's sibling intakes (triage: claude-fable-5-1)
