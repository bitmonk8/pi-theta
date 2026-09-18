---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: non-literal-by-field-refusal.test.ts's expectDeclared() reimplements the canonical expectDeclared() tests/helpers/load-row-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending
locations:                   # every cited site, repo-relative path:line-range
  - tests/non-literal-by-field-refusal.test.ts:241-252
  - tests/helpers/load-row-harness.ts:179-189
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# non-literal-by-field-refusal.test.ts's expectDeclared() reimplements the canonical expectDeclared() tests/helpers/load-row-harness.ts already exports

## Observation
`tests/non-literal-by-field-refusal.test.ts` declares its own module-private
`expectDeclared(rows, names)` function whose logic — filter the rows whose
captured declaration-name list does not JSON-match `names`, map the mismatch
to `[label, actual]`, and assert the mismatch list is empty with a
precondition-framed message — is the same filter/map/assert shape as the
`expectDeclared` function `tests/helpers/load-row-harness.ts` already exports
for exactly this purpose, differing only in which row field holds the
captured names (`r.schemas.map((s) => s.name)` here vs. the helper's
`r.declared`) and in the wording of the failure message.

## Evidence
`tests/non-literal-by-field-refusal.test.ts:241-252`:
```ts
function expectDeclared(
  rows: readonly LoadRow[],
  names: readonly string[],
): void {
  const mismatched = rows
    .filter((r) => JSON.stringify(r.schemas.map((s) => s.name)) !== JSON.stringify(names))
    .map((r) => [r.label, r.schemas.map((s) => s.name)]);
  expect(
    mismatched,
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}; a row listed here lost a declaration upstream of the discriminator checkers, so its diagnostic list says nothing about this bug`,
  ).toEqual([]);
}
```

`tests/helpers/load-row-harness.ts:179-189` — the canonical export, same
filter/map/assert shape over a differently-named row field:
```ts
/** Assert the exact declaration names, retaining a caller's failure context. */
export function expectDeclared(
  rows: readonly LoadRow[],
  names: readonly string[],
  message = `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}`,
): void {
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(mismatched, message).toEqual([]);
}
```
The helper's own `LoadRow.declared` (`tests/helpers/load-row-harness.ts:107`)
is populated by filtering `doc.body.statements` for `schema`/`enum` kinds and
mapping to `.name` — the same declaration-name projection the in-scope file's
`LoadRow.schemas` (via `capturedSchemas`) carries under a different shape.
`tests/b0046-by-clause-undecided-inputs.test.ts:187-193` shows the intended
call shape once this helper is imported: it aliases the helper's export
(`expectDeclared as expectDeclaredRows`, `tests/b0046-by-clause-undecided-inputs.test.ts:8`)
and wraps it with only its own message string, rather than re-deriving the
filter/map/assert body.

## Why this is a problem
This is the "Copy-paste fixtures" class: a canonical helper for this exact
precondition-assertion shape already exists under `tests/helpers/` and one
sibling in-repo file (`b0046`) already demonstrates importing and thinly
wrapping it instead of re-deriving the body. The in-scope file instead
hand-writes the same filter/map/assert logic a second time, so a change to
how the precondition failure is framed (for example, tightening the message
DIAG's own precondition-failure convention names) must be made in both
places to stay in sync.

## Suggested direction (non-binding, optional)
Populating a `declared` field on this file's own `LoadRow` (or otherwise
projecting `schemas` down to names before calling the helper) and importing
`expectDeclared` from `tests/helpers/load-row-harness.ts`, wrapped with this
file's own message the way `b0046-by-clause-undecided-inputs.test.ts` already
does, is the shape the sibling file already points at; naming that shape is
observation, not a design for the change.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or named gate kin; the
  carve-out does not apply.
- Recording-double check: `expectDeclared` is a precondition assertion over a
  parsed capture, not a recording double backing a "never called" witness;
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "expectDeclared" docs/bugs/` → 0
  hits; no documented correct-reason-red names this function.
- coverage-matrix/bug-doc citation search: `grep -n
  "non-literal-by-field-refusal" docs/reference/coverage-matrix.md` → 0 hits.
  This finding proposes no merge, rename, or deletion of the file or any
  `it()`/`describe()` — only that the existing precondition helper could be
  imported rather than re-derived.
- Prior-finding overlap check: `grep -rn "expectDeclared" quality/intake
  quality/resolved quality/issues` → hits only in PTQ-0409, PTQ-0430,
  PTQ-0431, and PTQ-0524, all about `b0046`/`b0278`/`b0279`/`b0281`/`b0284`
  duplicating the wider `load-row-harness.ts` surface (`LoadRow`,
  `registered`, `expectRows`, `registryMessageOf`, etc.); none names
  `non-literal-by-field-refusal.test.ts`. The prior review of this file this
  wave (`qw20260917154546` shard-108) filed only the `CapturedSchema`/
  `capturedSchemas`/`loadRow` trio (PTQ-0640) and did not examine
  `expectDeclared`.
- Coverage-drift check: the claim is about a repeated precondition-assertion
  DEFINITION, not a missing test path; the file's own tests exercise its own
  copy today.

## Triage
<!-- triage appends here -->
verdict: questionable — independently re-verified: both excerpts reproduce byte-for-byte at tests/non-literal-by-field-refusal.test.ts:241-252 and tests/helpers/load-row-harness.ts:179-189, the b0046 alias+thin-wrapper shape reproduces at :8/:187-193, the docs/bugs (0) / coverage-matrix (0) / prior-PTQ (0409, 0430, 0431, 0524 only) searches reproduce, fixed PTQ-0640 moved only `capturedSchemas` to e2e-s1 and never touched `expectDeclared` (distinct root cause), and git dates it a not-migrated case (local copy f5862ab0 2026-08-21 predates the harness export 8bad24ba 2026-09-17) — so the D7 boilerplate-duplication observation is real and in-scope; but the fold is NOT a mechanical import: the candidate's "same declaration-name projection" claim is inaccurate — the harness `declared` (:107-109) filters `schema || enum` while this file's `schemas` (`capturedSchemas` → `schemaDeclsOf`, e2e-s1.ts:372) is schema-only, and fixture A5 (`prelude: "enum K { A, B }"`, :274) sits inside `observed.slice(0, CLASS_1.length)` asserted against `["Cat","Dog","Animal"]` (:322, :348), which would become `["K","Cat","Dog","Animal"]` under the harness projection; and the helper's parameter is the harness `LoadRow` (requires `declared`/`statements`/`doc`), so this file's rows cannot be passed without either loosening the canonical helper's row type (e.g. to a `label`/`declared` pick) or migrating the file's `LoadRow` wholesale and amending A5's expected list — either is a behaviour/signature choice the fixer should not pick alone; a human should rule which (the b0285:217 `expectDeclared` is a different map/toEqual shape over its own `Row`, not a sibling copy of this clone) (triage: claude-fable-5-1)
