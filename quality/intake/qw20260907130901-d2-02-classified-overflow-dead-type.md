---
id: pending
title: provider-error-mapping.ts exports the type alias ClassifiedOverflow that nothing in the repository references
lens: D2
status: intake
verdict: pending
locations:
  - src/binder/provider-error-mapping.ts:406-409
sites: 1
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# provider-error-mapping.ts exports the type alias ClassifiedOverflow that nothing in the repository references

## Observation

The last statement of src/binder/provider-error-mapping.ts exports a type alias
`ClassifiedOverflow = ContextOverflowError`. Its own comment states it exists
"so `ContextOverflowError` stays part of this module's declared surface for the
paired implementation". The paired implementation has long since landed: the
classifier's overflow arm (`matchOverflowSignature`, :292-318) directly returns
`ContextOverflowError`, which is imported and used at seven other places in the
file. No file in src/, extensions/, tools/, tests/, or docs/ mentions
`ClassifiedOverflow` anywhere except its declaration.

## Evidence

src/binder/provider-error-mapping.ts:406-409 — the declaration and its expired
purpose statement:

```ts
// A type-only reference so `ContextOverflowError` stays part of this module's
// declared surface for the paired implementation (the classifier's overflow arm
// returns it). Erased at compile time.
export type ClassifiedOverflow = ContextOverflowError;
```

The purpose it was minted for is now served by real uses of the imported type —
src/binder/provider-error-mapping.ts:296-298:

```ts
function matchOverflowSignature(
  input: ProviderClassifierInput,
): ContextOverflowError | null {
```

Reference search: grep `ClassifiedOverflow` over the whole repository
(src/, extensions/, tools/, tests/, docs/, config) — exactly 1 hit, the
declaration at src/binder/provider-error-mapping.ts:409.

## Why this is a problem

Dead code, proven dead: an exported type alias with zero importers and zero
mentions anywhere in the tree, including tests (so the witness-test carve-out
does not apply — nothing witnesses it). Its comment records the scaffolding
purpose explicitly — keeping `ContextOverflowError` referenced while the module
was an inert tests-task stub — and that purpose expired when the implementation
landed and began using `ContextOverflowError` directly (`matchOverflowSignature`
:298, the classifier arm :373-402, `extractOverflowTokens`' result feeding
:308-316). Git confirms the scaffolding origin: `git log -S "ClassifiedOverflow"`
shows exactly one commit, `a9ef30e6` "V9j-T — binder inference call and
provider-error mapping tests (red)" — the red tests-task commit; no later commit
ever added a reader.

## Suggested direction (non-binding, optional)

Delete the alias and its three-line comment; the type import it was protecting
is load-bearing on its own.

## False-positive check

- Identifier search: grep `ClassifiedOverflow` over src/, extensions/, tools/,
  tests/, docs/ — 1 hit total (the declaration). The Grep tool respects
  .gitignore; a compiled copy could not exist regardless, since type aliases
  are erased at compile time.
- String-keyed / dynamic access: not applicable to a type-only export (erased
  at compile time; no runtime value to access), and the string
  `"ClassifiedOverflow"` appears nowhere else regardless.
- Re-export check: grep `export *` over src/, extensions/, tools/ — no barrel
  files re-export from binder/provider-error-mapping.ts (0 `export *` hits in
  those trees); no named re-export of the alias exists.
- Test-only-caller check: 0 test hits, so this is not test-only-reachable code
  — it is unreached everywhere.
- Git-history intent: single touching commit `a9ef30e6` (the V9j-T red
  tests-task commit); the paired V9j implementation and the later bug-0010 /
  bug-0065 rounds (`30492948`, `9c6e8efc`) modified the file without removing
  or referencing the alias.
- Spec-mandate check: the alias names no spec surface; provider-error-mapping.md
  pins the `QueryError` variants (`ContextOverflowError`, `TransportError`),
  both of which remain imported and used independently of the alias.

## Triage
