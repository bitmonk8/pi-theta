---
id: PTQ-0618
title: reservedKeywordFragment's registry-message reader is restated verbatim between two in-scope live cells
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/reserved-keyword-misfire-faces-live-cell.test.ts:125-144
  - tests/live/reserved-keyword-remaining-positions-live-cell.test.ts:124-144
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# reservedKeywordFragment's registry-message reader is restated verbatim between two in-scope live cells

## Observation
Both `tests/live/reserved-keyword-misfire-faces-live-cell.test.ts` and `tests/live/reserved-keyword-remaining-positions-live-cell.test.ts` declare a function `reservedKeywordFragment(keyword: string): string` that reads the `theta/parse/reserved-keyword-as-identifier` registry row's *Message* template, asserts it is a string, asserts it still carries the `<keyword>` slot, substitutes the argument, asserts no second placeholder remains, and returns `` `${code}: ${message}` ``. The bodies are line-for-line identical except for how the multi-argument `registryMessage(...)` call is wrapped.

## Evidence
`tests/live/reserved-keyword-misfire-faces-live-cell.test.ts:125-144`:
```ts
function reservedKeywordFragment(keyword: string): string {
  const template = registryMessage(PARSE_REGISTRY, RESERVED_KEYWORD_CODE) as
    | string
    | undefined;
  expect(
    template,
    `${RESERVED_KEYWORD_CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  const withSlot = template as string;
  expect(
    withSlot,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template must carry the <keyword> slot this cell fills — the row changed shape`,
  ).toContain("<keyword>");
  const message = withSlot.replace("<keyword>", keyword);
  expect(
    message,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template grew a second unsubstituted placeholder this reader does not fill`,
  ).not.toMatch(/<[a-z]+>/);
  return `${RESERVED_KEYWORD_CODE}: ${message}`;
}
```

`tests/live/reserved-keyword-remaining-positions-live-cell.test.ts:124-144`:
```ts
function reservedKeywordFragment(keyword: string): string {
  const template = registryMessage(
    RESERVED_KEYWORD_REGISTRY,
    RESERVED_KEYWORD_CODE,
  ) as string | undefined;
  expect(
    template,
    `${RESERVED_KEYWORD_CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  const withSlot = template as string;
  expect(
    withSlot,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template must carry the <keyword> slot this cell fills — the row changed shape`,
  ).toContain("<keyword>");
  const message = withSlot.replace("<keyword>", keyword);
  expect(
    message,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template grew a second unsubstituted placeholder this reader does not fill`,
  ).not.toMatch(/<[a-z]+>/);
  return `${RESERVED_KEYWORD_CODE}: ${message}`;
}
```

Both files' own doc comments name the same lineage: `reserved-keyword-misfire-faces-live-cell.test.ts:116-124` states this reader "mirrors the bug 0153 cell's reader ... exactly", and `reserved-keyword-remaining-positions-live-cell.test.ts:115-123` states it "mirrors the bug 0148 cell's `reservedKeywordFragment` reader ... exactly" — each file names a *different* precedent it claims to mirror, but the two files in this scope also mirror each other byte-for-byte.

## Why this is a problem
The same five-assertion registry-message reader — the same DIAG-2 presence check, the same slot-presence check, the same substitution, the same residual-placeholder check, and the same `` `${code}: ${message}` `` return shape — is authored twice inside this review's ten-file scope for the identical registry code (`theta/parse/reserved-keyword-as-identifier`), differing only in how the two-argument `registryMessage` call is line-wrapped.

## Suggested direction (non-binding, optional)
Both files already import `parseRegistry`/`registryMessage` from the same JS module and read the same registry page for the same code; a single shared `reservedKeywordFragment`-shaped reader (parameterised on the registry object, as one of the two sites already does) is the natural point the two copies already converge on.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kinds; not applicable. Recording-double check: this is a registry-message reader, not a call-recording double; not applicable. docs/bugs/ signature search: grepped `docs/bugs/` for `reservedKeywordFragment` — no hits; not a documented correct-reason red. coverage-matrix/bug-doc citation search: grepped `docs/reference/coverage-matrix.md` for both file names — no citation by name; no merge/rename/delete is proposed against a pinned test, and the finding does not propose deleting either cell, only observes the shared reader's duplication. Confirmed via `grep -rl "reservedKeywordFragment"` across `quality/intake/*.md` that no existing filing already covers this specific function-name pairing.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines and a whitespace-normalized diff (registry-const name aliased) shows the two bodies identical except for the `registryMessage(...)` call wrapping and `as | string | undefined` vs `as string | undefined` formatting; both readers are live (called at misfire-faces:352/363/373 and remaining-positions:336/342); neither file is a gate, recording double, docs/bugs-cited red, or coverage-matrix pin (greps re-run, zero hits); not a duplicate of PTQ-0327/0404/0411/0412, which cover the `REGISTRY` page-read constant rather than this reader body — note for the fixer: a third formatting-only copy the candidate names only as lineage sits at tests/live/live-production-acceptance.test.ts:3876-3898 (the bug 0148 cell) and should be folded into the same dedupe (triage: claude-fable-5-1)
