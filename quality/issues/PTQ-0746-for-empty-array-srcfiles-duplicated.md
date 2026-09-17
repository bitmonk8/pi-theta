---
id: PTQ-0746
title: for-empty-array-iterand-adjudication.test.ts reimplements a recursive src/ .ts-file walker that duplicates tests/helpers/ts-files.ts's tsFiles
lens: D7
status: open
verdict: confirmed
locations:
  - tests/for-empty-array-iterand-adjudication.test.ts:362-378
  - tests/helpers/ts-files.ts:19-30
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# for-empty-array-iterand-adjudication.test.ts reimplements a recursive src/ .ts-file walker that duplicates tests/helpers/ts-files.ts's tsFiles

## Observation
`tests/for-empty-array-iterand-adjudication.test.ts` declares a local
`srcFiles()` function that recursively walks `src/` collecting `.ts` files via
`readdirSync(dir, { withFileTypes: true })`, used by its structural pin (C1)
to grep every source file for `checkArrayCommonType` references.
`tests/helpers/ts-files.ts` (created 2026-09-12, after this test file existed)
exports `tsFiles(dir)`, doing the same recursive `readdirSync` walk over the
same real filesystem, and states in its own header that it was built after
three OTHER test files (`clock-id-seams.test.ts`, `cross-cutting-gates.test.ts`,
`di-seam-skeleton.test.ts`) each independently declared the identical
`tsFiles(dir)` walker for their own architectural scans.

## Evidence
`tests/for-empty-array-iterand-adjudication.test.ts:362-378`:
```ts
/** Every `.ts` file under `src/`, relative to the repository root. */
function srcFiles(): string[] {
  const root = path.join(REPO_ROOT, "src");
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.name.endsWith(".ts")) {
        out.push(path.relative(REPO_ROOT, abs).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return out;
}
```

`tests/helpers/ts-files.ts:19-30` (the canonical walker its own header names as
the fix for this exact shape of redeclaration in three prior files):
```ts
export function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}
```

Both functions perform the identical recursive real-filesystem `.ts`-file
enumeration under a root directory; they differ only in directory-entry API
(`withFileTypes: true` vs. a separate `statSync` call), path format (repo-
relative POSIX string vs. joined absolute/relative path from the walk root)
and `.test.ts` exclusion (the canonical helper excludes test files by name;
the local one does not, though `src/` contains none, so the two enumerate the
same set on this tree today).

## Why this is a problem
`tests/helpers/ts-files.ts`'s own header states the shared reason it exists:
"[three files] each independently declared the same `tsFiles(dir)` function to
walk the real `src/**` tree for a different architectural invariant... This
module centralises that one shared declaration." The file under review
declares a fourth copy of the same recursive-walk shape, over the same `src/`
root, for a fourth architectural invariant (absence of
`checkArrayCommonType` references), git-dated 2026-08-22 — before the helper
module existed (2026-09-12) — so it was never migrated onto the helper once it
landed.

## Suggested direction (non-binding, optional)
The natural shared home for a "recursively list `.ts` files under a directory"
walk is the already-existing `tests/helpers/ts-files.ts` (`tsFiles`), which
this file's `srcFiles()` was declared before and has not since been folded
into.

## False-positive check
Gate-pin check: the file is not named `*gate*.test.ts` and is not one of the
named gate kin; its own §(C) describes itself as a "structural pin," but the
carve-out is restricted to named gate-shaped files, and even so this finding
targets only the directory-walk helper, not the pinned zero-references
assertion. Recording-double check: not applicable. docs/bugs/ signature
search: `docs/bugs/0195-control-flow-empty-array-iterand-claim-false.md` cites
this test file's cells by section letter, not by its internal `srcFiles`
helper; no citation is disturbed by naming a shared walker. Coverage-matrix
search: no match for this file's basename in
`docs/reference/coverage-matrix.md`. This finding proposes no merge, rename or
deletion of any cited test or assertion.

## Triage
verdict: confirmed — re-verified independently: srcFiles() at tests/for-empty-array-iterand-adjudication.test.ts:362-378 and tsFiles at tests/helpers/ts-files.ts:19-30 match the excerpts verbatim and both recursively enumerate `.ts` files under `src/` (find src -name '*.test.ts' = 0, so the helper's .test.ts exclusion is a no-op on this tree and the two return the same set modulo path format); git confirms the test predates the helper (12925e8c 2026-08-22 vs ec2d7eaf 2026-09-12) and only the three PTQ-0265 files import helpers/ts-files, so this copy was never migrated; the copy is live (C1 calls it; file runs 26/26 green), no coverage-matrix or docs/bugs citation names srcFiles, the file is not a gate-kin and the claim targets the walker not the pinned assertion; PTQ-0265 (resolved) cited three different files and explicitly excluded the adjudication-style walkers, so not a duplicate — a mechanically-anchored D7 boilerplate-duplication finding (note: tests/ternary-common-type-trigger-adjudication.test.ts:668 carries a fifth, differently-bodied srcFiles() not filed anywhere; the fixer may fold it in the same pass) (triage: claude-fable-5-1)
