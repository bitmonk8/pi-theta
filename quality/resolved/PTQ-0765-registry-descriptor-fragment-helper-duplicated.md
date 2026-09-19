---
id: PTQ-0765
title: The DIAG-4 <code>:<message> descriptor-substitution helper is restated under two names between the two discovery live cells
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:63-77
  - tests/live/discovery-entry-lstat-failure-live-cell.test.ts:90-104
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The DIAG-4 <code>:<message> descriptor-substitution helper is restated under two names between the two discovery live cells

## Observation
`tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts` and `tests/live/discovery-entry-lstat-failure-live-cell.test.ts` each declare a function that reads a registry row's *Message* template via `registryMessage`, asserts the template is defined, replaces every `<descriptor>` occurrence, asserts no placeholder-shaped text (`/<[a-z-]+>/`) remains, and returns `` `${code}: ${message}` ``. The first file names it `fragment(code, descriptor)` (a generic two-argument form); the second names it `unreadableSourceFragment(descriptor)` (the same body with `code` hardcoded to its one constant). Both read the same registry page (`docs/spec_topics/diagnostics/code-registry-load.md`) through the same `parseRegistry`/`registryMessage` import from `tools/code-registry/index.js`.

## Evidence
tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:75-89:
```
function fragment(code: string, descriptor: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `${code} has no registry row — DIAG-2's closed registry does not carry ` +
      "the code this cell asserts",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<descriptor>", descriptor);
  expect(
    message,
    `${code}: an unsubstituted <…> placeholder remains — the registry row's ` +
      "Message template changed shape and this substitution is stale",
  ).not.toMatch(/<[a-z-]+>/);
  return `${code}: ${message}`;
}
```

tests/live/discovery-entry-lstat-failure-live-cell.test.ts:90-104 (same logic, `code` fixed to `UNREADABLE_SOURCE_CODE`):
```
function unreadableSourceFragment(descriptor: string): string {
  const template = registryMessage(REGISTRY, UNREADABLE_SOURCE_CODE) as string | undefined;
  expect(
    template,
    `${UNREADABLE_SOURCE_CODE} has no registry row — DIAG-2's closed registry ` +
      "does not carry the code this cell asserts",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<descriptor>", descriptor);
  expect(
    message,
    `${UNREADABLE_SOURCE_CODE}: an unsubstituted <…> placeholder remains — the ` +
      "registry row's Message template changed shape and this substitution is stale",
  ).not.toMatch(/<[a-z-]+>/);
  return `${UNREADABLE_SOURCE_CODE}: ${message}`;
}
```

## Why this is a problem
`fragment`'s generic two-argument form already subsumes `unreadableSourceFragment`'s one-argument form (calling `fragment(UNREADABLE_SOURCE_CODE, descriptor)` produces the identical string), and both files already parse the identical registry page through the identical `parseRegistry`/`registryMessage` pair (each file's own `REGISTRY` constant, built from the same `code-registry-load.md` URL). The two functions differ only in whether `code` is a parameter or a closed-over constant; every assertion message, every regex, and every substitution step is otherwise the same text repeated in a second file.

## Suggested direction (non-binding, optional)
The generic `fragment(code, descriptor)` shape already covers the fixed-code call; a shared module (or the harness) exporting the two-argument form would let the second file call it with its one constant instead of re-deriving the fixed-code specialisation from scratch.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or kin — this is a DIAG-4 registry-message reader, not a pinned-count census. Recording-double check: not a recording double; it reads a static Markdown registry page, not a fake's call log. docs/bugs/ signature search: `docs/bugs/0078-*.md` and `docs/bugs/0113-*.md`/`0075-*.md` (the two files' own governing bug docs) describe the fixed discovery behaviours but do not call for a per-file specialised fragment helper. coverage-matrix/bug-doc citation search: neither `fragment` nor `unreadableSourceFragment` is cited by name in `docs/reference/coverage-matrix.md`; this finding does not propose merging, renaming, or deleting either test file, only that the second function's body is already produced by the first function's general form.

## Triage
<!-- pending -->
verdict: confirmed — both excerpts reproduce verbatim (fragment at discovery-cli-override-prefix-missing-source-live-cell.test.ts:78-92, frontmatter's :63-77 is ~15-line drift; unreadableSourceFragment at discovery-entry-lstat-failure-live-cell.test.ts:90-104 exact), bodies identical bar code-as-parameter vs closed-over UNREADABLE_SOURCE_CODE and assertion-string line-wrap; both in tests/live/, not gate files, not recording doubles, coverage-matrix cites neither file, bug docs 0075/0078/0113 name neither helper, files landed in separate fix commits (cfa110b1, 63122660) so this is repeated drift; not a duplicate — the registry-oracle PTQs (0215/0222/0237/0250/0260/0311/0313/0404/0411/0412) list neither live file and cover the REGISTRY read not the fragment helper, PTQ-0255 is other files, siblings d7-71/d7-74 cite systemNoteContents/subagentTheta; fixer note: family is under-counted — a third near-verbatim unreadableSourceFragment sits at tests/live/live-production-acceptance.test.ts:1445-1463 (the lstat cell's own comment says it mirrors it) and a generic registryFragment(code, substitutions) recurs in 8 other live cells; 34 live cells already import from ../helpers so a shared home is reachable (triage: claude-fable-5-1)
