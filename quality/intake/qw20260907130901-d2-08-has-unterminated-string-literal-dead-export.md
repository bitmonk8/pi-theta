---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: hasUnterminatedStringLiteral is exported from params.ts but has no importer anywhere; both of its callers are same-file
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/params.ts:1870
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# hasUnterminatedStringLiteral is exported from params.ts but has no importer anywhere; both of its callers are same-file

## Observation
`hasUnterminatedStringLiteral` is declared `export function` in params.ts. Its
only two callers are in the same file — the `params:` type-half check inside
`parseParams`'s per-field loop and the default-half check in the same
function's default loop. No file in src/, extensions/, tools/, or tests/
imports it; test files mention the name only in prose comments and assertion
strings while exercising it through `parseParams`.

## Evidence
src/parser/params.ts:1870 — the exported declaration:

```ts
export function hasUnterminatedStringLiteral(text: string): boolean {
```

Both callers are same-file — src/parser/params.ts:277 (type half):

```ts
    const unterminatedLiteral = hasUnterminatedStringLiteral(field.typeSource);
```

and src/parser/params.ts:452 (default half):

```ts
      hasUnterminatedStringLiteral(field.defaultSource)
```

Importer census: grep `hasUnterminatedStringLiteral` across src/, extensions/,
tools/, tests/ — hits are the definition, the two same-file calls, and prose
mentions only (test comments/strings in
tests/escaped-quote-inline-field-name-refusal.test.ts:53,
tests/params-default-unterminated-literal-refusal.test.ts:52,
tests/unterminated-literal-params-type-refusal.test.ts:50,615, plus live-cell
test headers); no `import` statement names it anywhere.

## Why this is a problem
Dead export surface: the `export` modifier is the part nothing reaches — the
named D2 smell "exports ... that nothing reaches". The function itself is alive
(two same-file callers), but its public surface has zero consumers including
tests, so the export communicates a sharing contract that does not exist. Git
shows no importer ever existed: `git log -S hasUnterminatedStringLiteral`
touches only the two fix commits that added the same-file calls (`c4dd92c2`
bug 0232, `162ec5c0` bug 0239); no commit ever added an import.

## Suggested direction (non-binding, optional)
Drop the `export` modifier so the predicate reads as what it is — a
module-private helper of `parseParams`'s per-field loops.

## False-positive check
- Import census: grep `hasUnterminatedStringLiteral` over src/, extensions/,
  tools/, tests/ — no import statement anywhere; every non-params.ts hit is a
  comment or assertion-message string (each inspected and cited above).
- Re-export check: grep `export .* from ".*params"` over src/ —
  body-type-lowering.ts re-exports only `isSingleEnclosingBraceGroup`; no
  barrel forwards this name.
- String-keyed/dynamic access: grep `"hasUnterminatedStringLiteral"` — 0 hits
  outside prose.
- Anchor-gate check: no test asserts the source line `export function
  hasUnterminatedStringLiteral` (grep over tests/ — 0 hits), so no
  content-anchor witnesses the export keyword.
- Test-only-caller check: tests reach the behaviour through `parseParams`
  (production path); the claim here is confined to the unused export modifier,
  not to the function.
- Git-history intent: `git log --all -S hasUnterminatedStringLiteral` →
  `c4dd92c2` (bug 0232, introduced exported with the type-half call) and
  `162ec5c0` (bug 0239, added the default-half call, still same-file); no
  external consumer at any point in history.
- Declaration-build check: the name appears in no exported signature elsewhere,
  so un-exporting breaks no `declaration: true` surface.

## Triage
