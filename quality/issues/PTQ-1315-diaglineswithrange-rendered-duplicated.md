---
id: PTQ-1315
title: diagLinesWithRange and rendered in e2e-s1.ts compute the identical range-formatting body, differing only in field order
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/e2e-s1.ts:449-458
  - tests/helpers/e2e-s1.ts:1526-1535
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# diagLinesWithRange and rendered in e2e-s1.ts compute the identical range-formatting body, differing only in field order

## Observation
`tests/helpers/e2e-s1.ts` exports two functions, `diagLinesWithRange` (449-458) and `rendered` (1526-1535), each mapping a `ThetaDocument`'s diagnostics to a rendered-line array. Both compute the exact same `at` range string from `d.range` with byte-identical logic, and both interpolate `d.severity`, `d.code`, `at` and `d.message`; the only difference between the two function bodies is the order in which `@${at}` and `: ${d.message}` appear in the returned template literal. Both are exported and actively called from different test files (`diagLinesWithRange` from `reserved-keyword-inline-object-and-literal-keys.test.ts:148`; `rendered` from `inline-object-field-name-case.test.ts` at 18+ call sites).

## Evidence
tests/helpers/e2e-s1.ts:449-458
```
export function diagLinesWithRange(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => {
    const r = d.range;
    const at =
      r === undefined
        ? "-"
        : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    return `${d.severity} ${d.code} @${at}: ${d.message}`;
  });
}
```

tests/helpers/e2e-s1.ts:1526-1535
```
export function rendered(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => {
    const r = d.range;
    const at =
      r === undefined
        ? "-"
        : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    return `${d.severity} ${d.code}: ${d.message} @${at}`;
  });
}
```

Search: `grep -n "diagLinesWithRange(\|^export function rendered(" tests/helpers/e2e-s1.ts` — 2 hits, the two definitions above; each has exactly one call-site file (`reserved-keyword-inline-object-and-literal-keys.test.ts:148` and `inline-object-field-name-case.test.ts`, 18 call sites within that one file).

## Why this is a problem
The two functions duplicate the same range-computation logic (the `r === undefined ? "-" : ...` ternary) inside one file rather than sharing it, differing only in where `@${at}` lands relative to `: ${message}` in the output template. A reader who needs a third rendering variant (e.g. severity-first-with-range-last-and-colon) has two near-identical bodies to pattern-match against instead of one shared `at()`-style helper (the file already has a standalone `at(r: SourceRange | undefined): string` helper at an earlier line performing the identical ternary, which neither `diagLinesWithRange` nor `rendered` calls).

## Suggested direction (non-binding, optional)
Both functions could delegate their range formatting to the file's own `at()` helper rather than re-deriving it inline; this is an observation about the existing duplication, not a proposed edit.

## False-positive check
Gate-pin check: not applicable — `e2e-s1.ts` is not a `*gate*.test.ts` file, no pinned-count posture applies. Recording-double check: neither function is a recording double; both are pure diagnostic-to-string renderers, not MUST-NOT witnesses. docs/bugs/ signature search: `grep -rl "diagLinesWithRange\|rendered(doc)" docs/bugs/` returned no hits, so this is not a documented correct-reason red. coverage-matrix/bug-doc citation search: `grep -rn "diagLinesWithRange\|rendered(doc)" docs/reference/coverage-matrix.md docs/bugs/*.md` returned no hits — neither function is cited by name in a pinning document. This finding does not propose merging/renaming/deleting a cited test. Both functions are confirmed live (non-dead) via their respective call sites shown above, so this is duplication-in-existing-code, not a coverage claim.

## Triage
verdict: confirmed — excerpts match at tests/helpers/e2e-s1.ts:449-458 and 1526-1535, and the same `r === undefined ? "-" : \`${r.start.line}:…\`` ternary is a third copy of the file's own exported `at(r)` at line 242 which neither function calls; both are live (diagLinesWithRange imported by reserved-keyword-inline-object-and-literal-keys/-remaining-identifier-positions/-misfire-faces, rendered called ~90× in inline-object-field-name-case and schema-field-name-case), not gate/recording-double/bug-doc-cited; PTQ-0858 and PTQ-0882 are the resolved hoists that each landed one copy in e2e-s1 without routing through at(), so this in-file residue is untracked — note the two output formats (`code @at: msg` vs `code: msg @at`) are distinct pinned vocabularies, so the mechanical fix is delegating the range ternary to at(), not merging the two functions (triage: claude-fable-5-1)
