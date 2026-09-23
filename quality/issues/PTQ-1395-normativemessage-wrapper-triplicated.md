---
id: PTQ-1395
title: the registry-read-with-loud-failure wrapper normativeMessage is redeclared near-identically in all three import bug-witness files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/import-export-from-clause-required.test.ts:138-153
  - tests/import-specifier-list-production-required.test.ts:197-212
  - tests/import-specifier-separator-production-required.test.ts:213-227
sites: 3
fix_scope: cross-module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# the registry-read-with-loud-failure wrapper normativeMessage is redeclared near-identically in all three import bug-witness files

## Observation
Each of the three files in this review's scope declares its own local
`function normativeMessage(code: string): string` with the same body: read
`registryMessage(REGISTRY, code)`, assert it `.toBeDefined()` with a
"no registry row for ${code}" failure message naming the DIAG-4 anchor, and
return the template. The three declarations are word-for-word identical in
two of the three files and differ only in a dropped clause of the failure
string in the third.

## Evidence
`tests/import-export-from-clause-required.test.ts:144-153`:
```ts
function normativeMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `no registry row for ${code} — DIAG-4 anchor: ` +
      `docs/spec_topics/diagnostics/code-registry-parse.md must carry its Message row ` +
      `(mirrored into docs/reference/diagnostics.md in the same commit, DIAG-2)`,
  ).toBeDefined();
  return template as string;
}
```

`tests/import-specifier-list-production-required.test.ts:203-212` (identical
body, same failure string):
```ts
function normativeMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `no registry row for ${code} — DIAG-4 anchor: ` +
      `docs/spec_topics/diagnostics/code-registry-parse.md must carry its Message row ` +
      `(mirrored into docs/reference/diagnostics.md in the same commit, DIAG-2)`,
  ).toBeDefined();
  return template as string;
}
```

`tests/import-specifier-separator-production-required.test.ts:219-227`
(same shape, shorter failure string):
```ts
function normativeMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `no registry row for ${code} — DIAG-4 anchor: ` +
      "docs/spec_topics/diagnostics/code-registry-parse.md must carry its Message row",
  ).toBeDefined();
  return template as string;
}
```

## Why this is a problem
All three files are a matched bug-witness trio (0058, 0100, 0211) reviewed
together in this scope, sharing `parseLib`, `parseApp`, `APP_FRONTMATTER`,
`expectStatementRefusal` and (in two of the three) the `REGISTRY` import
itself. `normativeMessage` is the same "registry read that fails loudly naming
the missing row" wrapper redeclared a third time on top of that shared
`REGISTRY`, with the third copy's failure string having already drifted from
the other two (missing the DIAG-2 mirroring clause), which is what happens
when one function body is retyped rather than shared.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already centralises the `REGISTRY` these
three functions read from and other loud-failure registry readers (for
example `registryFragment`); a shared oracle in that module is the natural
home a fourth retyping would otherwise repeat.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts`; the
  census/pin carve-out does not apply.
- Recording-double check: `normativeMessage` performs a static registry read,
  not a call-recording double; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: grepped the three referenced bug docs
  (0058, 0100, 0211) for "normativeMessage" — no reference; this is not a
  documented correct-reason divergence.
- coverage-matrix/bug-doc citation search: grepped
  `docs/reference/coverage-matrix.md` for the three file names — no hits, so no
  citation pins this internal function.
- Confirmed via direct read of all three files that the three bodies are
  structurally identical (same `registryMessage` call, same `expect(...).
  toBeDefined()` shape, same return), with the third's failure string a
  strict substring of the other two's.

## Triage
verdict: confirmed — reproduces at HEAD: `function normativeMessage(code)` at tests/import-export-from-clause-required.test.ts:144-153, tests/import-specifier-list-production-required.test.ts:203-212 and tests/import-specifier-separator-production-required.test.ts:219-227; mktemp sed-extract + diff shows copies 1≡2 byte-identical and copy 3 differing only by the dropped `(mirrored into … DIAG-2)` clause of the failure string (drift, not a substantive per-file wording variant, so registry-oracle.ts's header carve-out for readers whose wording varies does not apply); all three are live (7/8/5 references) and none imports the canonical read-and-fail-loudly reader — tests/helpers/load-row-harness.ts:61-77 `registryMessageOf(registry, page, code)` is the same `registryMessage` + `expect(template, DIAG-4 anchor msg)` presence guard, and registry-oracle.ts:132 `loadRowMessage` already wraps it for the load shard, so a parse-shard sibling is a mechanical export + three import swaps; not a *gate* file, static registry read (no recording double), docs/bugs/0058|0100|0211 grep for normativeMessage → 0, coverage-matrix → 0, no it()/describe() change proposed, git status clean; not a duplicate — resolved PTQ-0916 migrated only the `RegistryRow`/`REGISTRY` read in two of these files and its note explicitly left the `normativeMessage` fold unremediated, PTQ-0921 is the b0268 file, PTQ-1089 the params-inline-object file, and same-wave d7-01 (REGISTRY read) / d7-02 (loadImports) target disjoint helpers and each name this wrapper as distinct — D7 boilerplate-duplication class (triage: claude-fable-5-1)
