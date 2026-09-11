---
id: PTQ-0212
title: The `loadCleanly` params-loading harness and two of its three throw messages are duplicated byte-for-byte across seven schema/params-lowering test files
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/annotation-root-brace-union-lowering.test.ts:517-531
  - tests/binder-param-line-newline-normalisation.test.ts:370-384
  - tests/inline-object-nested-lowering.test.ts:591-605
  - tests/params-block-mapping-rhs-refusal.test.ts:369-383
  - tests/params-brace-union-rhs-lowering.test.ts:515-529
  - tests/params-default-string-literal-raw-newline.test.ts:371-385
  - tests/params-inline-object-lowering.test.ts:414-428
sites: 7                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# The `loadCleanly` params-loading harness and two of its three throw messages are duplicated byte-for-byte across seven schema/params-lowering test files

## Observation
`tests/annotation-root-brace-union-lowering.test.ts` defines a private
`function loadCleanly(label, source): LoadedParams` (lines 511-535) that
parses a fixture through the centralised `parseDoc` helper
(`tests/helpers/e2e-s1.ts`), asserts a clean diagnostic list, then throws a
labelled `Error` at each of three possible absent intermediates
(`frontmatter === null`, `params === undefined`, `loweredSchema ===
undefined`) before returning the loaded `$defs`/`loweredSchema`. A function
of the same name, same parameters and the same three-step null-checking
shape recurs in six sibling schema/params-lowering test files, with two of
the three thrown messages copied character-for-character in every one of the
seven and the third copied in four of the seven.

## Evidence
tests/annotation-root-brace-union-lowering.test.ts:517-531:
```ts
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
```

tests/binder-param-line-newline-normalisation.test.ts:370-384 (first two
messages byte-identical to the excerpt above; third message shortened):
```ts
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent). Diagnostics: ${JSON.stringify(diagLines(doc))}`,
```

tests/inline-object-nested-lowering.test.ts:591-605 (all three messages
byte-identical to the first excerpt):
```ts
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
```

tests/params-block-mapping-rhs-refusal.test.ts:369-383 (first two messages
byte-identical; third says "at" instead of "for"):
```ts
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document at the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
```

tests/params-brace-union-rhs-lowering.test.ts:515-529 (all three messages
byte-identical to the first excerpt):
```ts
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
```

tests/params-default-string-literal-raw-newline.test.ts:371-385 (first two
messages byte-identical; third shortened the same way as
binder-param-line-newline-normalisation.test.ts):
```ts
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent). Diagnostics: ${JSON.stringify(diagLines(doc))}`,
```

tests/params-inline-object-lowering.test.ts:414-428 (all three messages
byte-identical to the first excerpt):
```ts
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
```

Search: `grep -rl "function loadCleanly" tests/*.ts` returns exactly these
seven files and no others. `grep -c "the theta was REFUSED — frontmatter is
null"` and `grep -c "the frontmatter carries no parsed params block"` each
return exactly 1 in every one of the seven files. The third message ("the
params block lowered to NOTHING…") is byte-identical in four of the seven
(the file reviewed here, `inline-object-nested-lowering.test.ts`,
`params-brace-union-rhs-lowering.test.ts`, `params-inline-object-lowering.test.ts`)
and reworded in the other three
(`binder-param-line-newline-normalisation.test.ts` and
`params-default-string-literal-raw-newline.test.ts` drop the "so there is no
AJV-validatable document…" clause; `params-block-mapping-rhs-refusal.test.ts`
says "at" instead of "for" the argument boundary).

## Why this is a problem
Seven files reimplement the same three-step null-checking wrapper around
`parseDoc` — itself already centralised at `tests/helpers/e2e-s1.ts` — rather
than sharing one wrapper, and two of its three thrown messages are copied
character-for-character in every one of the seven, with the third copied in
four of the seven and only lightly reworded in the rest: duplication with
every copy cited above, not a case of seven authors independently arriving at
the same wording. The file reviewed here draws an explicit line elsewhere
between helpers that must stay independent and this one: its own comments
state the hand-written slug/canonical-form helpers are deliberately not
shared or imported ("an oracle taken from the implementation under test
proves nothing"), a rationale that does not apply to `loadCleanly` — a
load-and-throw convenience wrapper with no relationship to the property those
oracle helpers keep independent.

## Suggested direction (non-binding, optional)
`tests/helpers/` already centralises `parseDoc` itself
(`tests/helpers/e2e-s1.ts`); a `loadCleanly`-shaped wrapper belongs beside it,
given seven files already carry near-identical copies of exactly this
wrapper.

## False-positive check
- Gate-pin check: none of the seven files match `*gate*.test.ts` or the named
  gate kin.
- Recording-double check: not applicable — `loadCleanly` returns a loaded
  document's fields; it records no calls and backs no MUST-NOT-called
  witness.
- docs/bugs/ signature search: `grep -rl "loadCleanly" docs/bugs/*.md` hits
  0045 and 0102, which discuss what `loadCleanly` asserts (its clean-load
  premise) for their own bug's fixtures, not the duplication of the helper
  itself; no bug doc documents a correct-reason red for any of the seven
  files. The bugs each of the seven files' own headers cite (0035, 0039,
  0041, 0053, 0060, 0097, 0102) are all status **fixed**, and the in-scope
  file is fully green (`vitest run tests/annotation-root-brace-union-lowering.test.ts`:
  33/33 passing).
- coverage-matrix / bug-doc citation search: none of the seven file names
  appear in `docs/reference/coverage-matrix.md`; several are cited by name in
  bug docs' reproduction sections, but this finding does not propose
  merging, renaming or deleting any test — only that a shared internal
  helper function is currently copied seven times — so no citation is
  disturbed.
- Independence-rationale check: re-read the reviewed file's own "THE SLUG
  ORACLE IS INDEPENDENT" comment paragraph to confirm it names only the
  hand-written canonical-form/slug helpers, not `loadCleanly`, and that no
  other comment in any of the seven files states a rationale for keeping
  `loadCleanly` itself unshared.
- Scope: only `tests/annotation-root-brace-union-lowering.test.ts` is in
  this wave's review scope; the other six files are cited solely as
  duplication evidence and were not otherwise reviewed.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt, line range, and grep count (7 files match `function loadCleanly`, both first messages 1x each, third message split 4/2/1 as claimed) reproduces exactly, no file states a not-shared rationale for `loadCleanly` (the only independence comment found names the unrelated slug oracle), and boilerplate duplication is a named D7 class with no gate-pin/recording-double/correct-reason-red/coverage-matrix carve-out applying (triage: claude-opus-5)
