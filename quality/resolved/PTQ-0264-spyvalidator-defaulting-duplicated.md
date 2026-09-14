---
id: PTQ-0264
title: spyValidator (a recording CompiledValidator double) is redefined near-identically in defaulting-revalidation.test.ts and defaulting-post-merge-classification.test.ts
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/defaulting-revalidation.test.ts:26-44
  - tests/defaulting-post-merge-classification.test.ts:120-136
sites: 2
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# spyValidator (a recording CompiledValidator double) is redefined near-identically in defaulting-revalidation.test.ts and defaulting-post-merge-classification.test.ts

## Observation
Both files test the same production hook, `fillDefaultsAndRevalidate`
(`src/binder/defaulting.ts`), and each declares its own local
`spyValidator(result: PostMergeValidation)` function: a closure that builds a
`CompiledValidator` recording every value handed to `validate()` into a
`calls` array and returning a fixed verdict. The two declarations are the
same shape — same parameter, same closure body, same return object —
differing only in a `readonly` modifier on the two returned fields and the
wording of the doc comment above the function.
`defaulting-post-merge-classification.test.ts`'s own module header names
`defaulting-revalidation.test.ts` as the sibling that "pins this leaf's
fill-if-absent halves" of the same hook, so the two files already
cross-reference each other as a pair covering one production function.

## Evidence
`tests/defaulting-revalidation.test.ts:26-44` (re-read verbatim immediately
before filing):
```ts
/**
 * A spy `CompiledValidator`: records every value handed to `validate()` and
 * returns a fixed verdict. Lets a test witness that the post-default-merge
 * validation ran against the MERGED args (not the raw binder args) and that the
 * verdict is surfaced.
 */
function spyValidator(result: PostMergeValidation): {
  validator: CompiledValidator;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  const validator: CompiledValidator = {
    validate(value: unknown) {
      calls.push(value);
      return result;
    },
  };
  return { validator, calls };
}
```

`tests/defaulting-post-merge-classification.test.ts:120-136` (re-read
verbatim immediately before filing):
```ts
/**
 * A spy `CompiledValidator`: records every value handed to `validate()` and
 * returns a fixed verdict. `calls.length === 0` is the CIO-3 observable — AJV
 * did not run because the depth walk short-circuited ahead of it.
 */
function spyValidator(result: PostMergeValidation): {
  readonly validator: CompiledValidator;
  readonly calls: unknown[];
} {
  const calls: unknown[] = [];
  const validator: CompiledValidator = {
    validate(value: unknown) {
      calls.push(value);
      return result;
    },
  };
  return { validator, calls };
}
```

Exact searches: `grep -rn "function spyValidator" tests/` returns exactly
these two hits repo-wide. A second, independent search on the closure's
distinctive line, `grep -rn "calls.push(value)" tests/`, also returns exactly
these same two hits — no third copy of this double exists anywhere in the
suite.

## Why this is a problem
The two functions implement the same recording double for the same seam
(`CompiledValidator`) against the same production entry point
(`fillDefaultsAndRevalidate`), inside two files that already name each other
as companions covering that one hook's two halves (the fill-if-absent leaf
in `defaulting-revalidation.test.ts`, the depth/classification leaf in
`defaulting-post-merge-classification.test.ts`). Each file re-declares the
identical closure rather than one importing it from the other or from a
shared module.

## Suggested direction (non-binding, optional)
A shared home for this one function — alongside this suite's other
seam-fake modules under `tests/helpers/`, or a small module local to the two
`defaulting-*` files — would leave every call site (`spyValidator({ ok: true })`,
etc.) unchanged; noted as an observation, not a design.

## False-positive check
- Recording-double carve-out: `spyValidator` backs MUST-run/DID-run
  witnesses (`calls.length` toBe(1), `calls[0]` toStrictEqual(...)), not a
  "never called" MUST-NOT witness, so the negative-witness carve-out does not
  apply either way — this finding claims the double's DEFINITION is
  duplicated, not that any assertion built on it cannot fail.
- Widespread-convention check: `grep -rn "function spyValidator" tests/` and
  `grep -rn "calls.push(value)" tests/` each return exactly the 2 cited hits
  repo-wide — this is not a broad, established convention on the scale of
  this suite's `parseDeps()`/`LiveSessionDouble` sibling patterns (79 and 13
  files respectively, confirmed by the same grep method), it is confined to
  exactly these two files.
- docs/bugs/ signature search: `grep -rn "defaulting-revalidation.test.ts\|defaulting-post-merge-classification.test.ts" docs/bugs/*.md`
  shows both files cited as test evidence for bug 0066 ("fixed 0.88.0"), and
  named again in bugs 0172, 0181 and 0185. The 0066 citation
  (`tests/defaulting-revalidation.test.ts:101-102`) points at a downstream
  assertion on the spy's recorded calls (`calls.length`/`calls[0]`), not at
  the `spyValidator` declaration cited here (lines 26-44), so nothing in this
  finding touches the cited behaviour or invalidates the citation.
- coverage-matrix citation search: `grep -rn "defaulting-revalidation.test.ts\|defaulting-post-merge-classification.test.ts" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md`
  — no hits in either matrix file.
- This finding does not propose to merge, rename, or delete either test
  file — only that one internal helper function is duplicated between them.
- Not a coverage or behaviour claim: `npx vitest run tests/defaulting-revalidation.test.ts tests/defaulting-post-merge-classification.test.ts`
  passes 9/9 at HEAD; both bugs the files pin (0066) are already fixed, so
  this is a test-code-quality observation about the two green files, not a
  bug report.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified: both 26-44/120-136 excerpts match verbatim, `function spyValidator`/`calls.push(value)`/`CompiledValidator = {` greps each independently reproduce exactly these 2 sites suite-wide, no tests/helpers/ double already covers it, and no tracked PTQ or rejection matches this pair (triage: claude-opus-5)
