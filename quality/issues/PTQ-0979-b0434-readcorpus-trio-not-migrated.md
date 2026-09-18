---
id: PTQ-0979
title: b0434 still hand-rolls the repoFile/readCorpus/linesOf trio that tests/helpers/corpus-reader.ts already exports (and the file already imports from)
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0434-operator-facing-note-matrix-row-coverage.test.ts:58-85
  - tests/helpers/corpus-reader.ts:19-45
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0434 still hand-rolls the repoFile/readCorpus/linesOf trio that tests/helpers/corpus-reader.ts already exports (and the file already imports from)

## Observation
`tests/b0434-operator-facing-note-matrix-row-coverage.test.ts` declares its own
module-scope `repoFile`, `readCorpus`, and `linesOf` functions instead of
importing the equivalent exports from `tests/helpers/corpus-reader.ts`. The
same file already imports three OTHER exports from that exact module
(`matrixRowDump`, `perVariantMatrixRows`, `MatrixRow`) at its top, so the
helper module is a live, in-scope import target the file is already reaching
into — it simply does not pull the `readCorpus` trio from it.

## Evidence
`tests/b0434-operator-facing-note-matrix-row-coverage.test.ts:1-8` (the file's
own import from the canonical module, proving it already depends on it):
```ts
import {
  matrixRowDump,
  perVariantMatrixRows as readPerVariantMatrixRows,
  type MatrixRow,
} from "./helpers/corpus-reader";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
```

`tests/b0434-operator-facing-note-matrix-row-coverage.test.ts:58-85` (the local
redeclaration):
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so
 * an absent page cannot let a cell pass vacuously (the b0404 `readCorpus`
 * pattern this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a required source for the bug 0434 surface this oracle owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(
      `harness precondition unmet: ${rel} is empty; nothing to score`,
    );
  }
  return text;
}

/** Line splitting tolerates the page's CRLF terminators. */
const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);
```

`tests/helpers/corpus-reader.ts:19-45` (the canonical export, already imported
elsewhere in this same file):
```ts
export const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../../${rel}`, import.meta.url));

export function readCorpus(rel: string, owner: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is ${owner} — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}

export const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);
```

The two `readCorpus` bodies are structurally identical: same try/catch shape,
same "harness precondition unmet" message prefix, same empty-string guard,
same fallback error text — differing only in the bug-number clause
(hardcoded "bug 0434" vs the canonical version's `owner` parameter) and in
`repoFile`'s relative-URL depth (`../` vs `../../`, which is exactly the
depth difference the canonical `repoFile` already accounts for by living one
directory deeper, in `tests/helpers/`). `linesOf` is byte-identical in both.

Sibling in-scope files in this same wave already wrap the canonical function
instead of redeclaring it — `tests/b0404-custom-type-unsafe-note-matrix-row.test.ts:60-62`:
```ts
function readCorpus(rel: string): string {
  return readSharedCorpus(rel, "this oracle's only source for the bug 0404 surface it owns");
}
```
and `tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts:47-49` does
the same. b0434 has the identical opportunity (it already imports three other
names from the same module) but does not take it.

## Why this is a problem
This is the boilerplate-duplication class already established for this exact
trio (PTQ-0208 traced the pattern repo-wide and led to `tests/helpers/corpus-reader.ts`
being created; PTQ-0540 and PTQ-0587 each filed and fixed specific
still-unmigrated file lists — `b0452`/`b0455`/`b0456` and
`b0403`/`b0404`/`b0405` respectively — from PTQ-0208's own named remainder).
`b0434` was named in PTQ-0208's original 17-file grep hit list but is not a
member of either follow-up fix's file list, so it is a residual, currently
live instance of the same named gap: the canonical helper exists, this exact
file already imports from the module that hosts it, and the trio is still
redeclared locally rather than imported.

## Suggested direction (non-binding, optional)
`tests/helpers/corpus-reader.ts` already exports `repoFile`/`readCorpus`/
`linesOf` in the generalised, owner-parameterised shape the file's siblings
(`b0404`, `b0452`) already import; it is the existing home this file's own
import statement is already reaching into for three other names.

## False-positive check
- Gate-pin check: `b0434-operator-facing-note-matrix-row-coverage.test.ts`
  does not match `*gate*.test.ts` or the named gate-kin patterns; this
  finding is about where the corpus-reading functions are defined, not
  about a pinned count or inventory assertion, and it touches none of the
  file's pinned-count cells.
- Recording-double check: `readCorpus` reads a file and returns or throws;
  it records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0434-operator-facing-diagnostics-notes-rowless.md`
  Status is fixed (docs-only, additive matrix-row fix) — this file's own
  purpose is unrelated to its corpus-reading harness definition site;
  nothing in the bug doc discusses or rationalises keeping the reader
  local.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0434-operator-facing-note-matrix-row-coverage" docs/reference/coverage-matrix.md`
  → 0 hits. The file name IS cited by other bug docs' own witness/reference
  sections as the byte-stability oracle sibling later fixes must not
  disturb (e.g. `docs/bugs/0452-…md` names the `b0434`-shaped oracle
  lineage) — this finding proposes no merge, rename, or deletion of the
  file or any `it()`/`describe()` name, count, or assertion, only where the
  internal `readCorpus`/`repoFile`/`linesOf` trio is defined.
- Prior-finding overlap check: `grep -rl "b0434" quality/resolved/` shows
  PTQ-0208 (named `b0434` in its 17-file grep list without filing against
  it), PTQ-0845 (fixed the separate `MatrixRow`/`tableCells`/
  `perVariantMatrixRows`/`matrixRowDump` layer for this same file — b0434
  now imports those three names, confirming that fix landed), and neither
  PTQ-0540 (`b0452`/`b0455`/`b0456`) nor PTQ-0587 (`b0403`/`b0404`/`b0405`)
  names `b0434` in their location lists. This finding covers the
  `repoFile`/`readCorpus`/`linesOf` trio specifically, which remains
  unmigrated in this file even after the sibling `MatrixRow`-layer fix
  landed — not a re-filing of any of the four.
- Coverage check: the claim is entirely about a repeated harness
  DEFINITION, not a missing test path; the trio is exercised by every cell
  in the file (the file's own `describe` block passes at HEAD per its own
  RED/GREEN split, unaffected by this observation).

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — both excerpts reproduce verbatim at tests/b0434-operator-facing-note-matrix-row-coverage.test.ts:58-85 and tests/helpers/corpus-reader.ts:19-45; a mktemp `diff -w` of the two `readCorpus` bodies shows the only semantic delta is the hard-coded "a required source for the bug 0434 surface this oracle owns" clause vs the canonical `owner` parameter (repoFile/linesOf identical bar the `../` vs `../../` depth the helper's location absorbs), and the file already imports `matrixRowDump`/`perVariantMatrixRows`/`MatrixRow` from the same module (line 1-5), so the migration is the mechanical wrapper shape b0404:6,68-69 and b0452:6,62-63 already carry (candidate's sibling line cites drift by ~8/15 lines, content matches); both local call sites (`perVariantMatrixRows`, `registryRowExists`) are live and the file is green at HEAD (vitest 5/5); stated searches reproduce — coverage-matrix 0 hits, docs/bugs/0434 Status fixed and silent on the reader, PTQ-0208:141 names b0434 in its unmigrated remainder while neither PTQ-0540 nor PTQ-0587 lists it and PTQ-0845 covered only the MatrixRow layer (its b0434:83 cite is the `linesOf` use, not the trio); not gate-named, not a recording double; no open/intake row tracks b0434's trio (intake d7-02 is a different file). Note for the fixer: `grep -rln "^const repoFile = " tests/` shows b0419-b0366-header-reversed-belt-design-gate, b0421-grammar-cite-sweep-remainder-gate and b0436-shape-enumeration-sentences-gate also still hand-roll the same trio with no corpus-reader import — same class, uncited here, separate residuals (triage: claude-fable-5-1)
