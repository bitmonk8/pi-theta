---
id: PTQ-0587
title: b0403, b0404, and b0405 still hand-roll repoFile/readCorpus/linesOf even though tests/helpers/corpus-reader.ts now exports the equivalent, PTQ-0208-motivated helper
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0403-unary-minus-message-registry-divergence.test.ts:105-131
  - tests/b0404-custom-type-unsafe-note-matrix-row.test.ts:62-89
  - tests/b0405-grammar-cite-sweep-gate.test.ts:51-76
  - tests/helpers/corpus-reader.ts:1-39
sites: 3
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0403, b0404, and b0405 still hand-roll repoFile/readCorpus/linesOf even though tests/helpers/corpus-reader.ts now exports the equivalent, PTQ-0208-motivated helper

## Observation
`tests/helpers/corpus-reader.ts` exports `repoFile`, `readCorpus(rel, owner)`, and `linesOf` — created (its own header states) because PTQ-0208 found the same trio redefined byte-for-byte across at least 17 test files, including `b0403`, `b0404`, and `b0405`. `tests/b0117-panic-namespace-scoping-gate.test.ts`, `tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts`, and `tests/b0457-retired-quote-sweep-gate.test.ts` now import from it. `tests/b0403-unary-minus-message-registry-divergence.test.ts`, `tests/b0404-custom-type-unsafe-note-matrix-row.test.ts`, and `tests/b0405-grammar-cite-sweep-gate.test.ts` — three of this wave's nine reviewed files — still each declare their own local `repoFile`/`readCorpus`/`linesOf` trio instead of importing the now-existing helper.

## Evidence

`tests/helpers/corpus-reader.ts:1-39` (the canonical, already-adopted export):
```ts
// A shared "read a committed corpus file, fail loud on absence" harness for the
// spec-surface oracle test files (`b0117`, `b0265`, and further siblings that
// mirror the same pattern forward — see each file's own comments).
//
// WHY THIS FILE EXISTS. `repoFile` / `readCorpus` / `linesOf` were redefined,
// byte-for-byte apart from the bug number named inside the thrown message, in
// several `b02xx`/`b04xx` spec-gate test files (PTQ-0208). The read is
// deliberately loud rather than skip-on-absence: the corpus file IS the
// oracle's only source, so a missing or empty read must fail the harness
// rather than let a cell pass vacuously.

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

`tests/b0403-unary-minus-message-registry-divergence.test.ts:105-131` (local copy, not importing `corpus-reader.ts`):
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is this oracle's only source for the bug 0403 surface it owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(
      `harness precondition unmet: ${rel} is empty; nothing to score`,
    );
  }
  return text;
}

const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);
```

`tests/b0404-custom-type-unsafe-note-matrix-row.test.ts:62-89` (same trio, own bug number substituted):
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is this oracle's only source for the bug 0404 surface it owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(
      `harness precondition unmet: ${rel} is empty; nothing to score`,
    );
  }
  return text;
}

const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);
```

`tests/b0405-grammar-cite-sweep-gate.test.ts:51-76` (same trio, own bug number substituted, and its own comment explicitly names the pattern it mirrors — "the b0265 `readCorpus` pattern this file mirrors"):
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a source this oracle scores for the bug 0405 sweep — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}

const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);
```

Exact search: `grep -rl "from \"./helpers/corpus-reader\"\|from \"../helpers/corpus-reader\"" tests/*.ts` → 3 files (`b0117-panic-namespace-scoping-gate.test.ts`, `b0265-panic-scoping-remnant-surfaces-gate.test.ts`, `b0457-retired-quote-sweep-gate.test.ts`). `grep -n "^const repoFile\|^function readCorpus\|^const linesOf" tests/b0403-unary-minus-message-registry-divergence.test.ts tests/b0404-custom-type-unsafe-note-matrix-row.test.ts tests/b0405-grammar-cite-sweep-gate.test.ts` → one match of each name per file (9 matches), confirming none of the three has migrated.

## Why this is a problem
`tests/helpers/corpus-reader.ts`'s own header states its purpose is exactly PTQ-0208's fix: end the byte-for-byte `repoFile`/`readCorpus`/`linesOf` redeclaration that PTQ-0208 found across (among others) these same three files. The helper is proven adoptable — three sibling gate files already import it with no behavioural change (its `readCorpus(rel, owner)` signature only reshapes the bug-number clause into a caller-supplied `owner` string, the exact difference PTQ-0208's own evidence already showed varying per file). b0403/b0404/b0405 continue to carry their own copy of the same three functions after the helper landed.

## Suggested direction (non-binding, optional)
Importing `repoFile`/`readCorpus`/`linesOf` from `tests/helpers/corpus-reader.ts` (passing each file's own "why this corpus is my only source" sentence as the `owner` argument, exactly as the three already-migrated gate files do) is the natural next step the helper's own adoption elsewhere already demonstrates; the fix stage owns the actual migration.

## False-positive check
- Gate-pin check: `tests/b0405-grammar-cite-sweep-gate.test.ts` matches `*gate*.test.ts`, but this finding is about where the `repoFile`/`readCorpus`/`linesOf` helper functions are DEFINED, not about any pinned count or inventory assertion the gate scores — PTQ-0208 (which covered the same trio in the same file) already established that the census/pin carve-out does not extend to a helper's definition site.
- Recording-double check: `readCorpus` reads a file and returns/throws; it records no calls and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "readCorpus\|corpus-reader" docs/bugs/*.md` → 0 files; no open bug document discusses this non-migration or gives a rationale for keeping the reader local. docs/bugs/0403-*.md, 0404-*.md, 0405-*.md carry no "left red" status; `npx vitest run tests/b0403-unary-minus-message-registry-divergence.test.ts tests/b0404-custom-type-unsafe-note-matrix-row.test.ts tests/b0405-grammar-cite-sweep-gate.test.ts` passes all three files at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "b0403-unary-minus-message-registry-divergence\|b0404-custom-type-unsafe-note-matrix-row\|b0405-grammar-cite-sweep-gate" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file, `it()`, or `describe()` — only that each file's local `repoFile`/`readCorpus`/`linesOf` trio could import the existing helper.
- Coverage check: the claim is entirely about a repeated harness DEFINITION persisting after its own motivating fix landed elsewhere; every copy is exercised by the tests in its own file (confirmed passing above), so this is not a coverage-gap claim.
- Duplicate check: this finding is distinct from PTQ-0208 (status: fixed) — PTQ-0208's own evidence and scope note named b0403/b0404/b0405 only as further sites of the ORIGINAL pre-helper duplication and explicitly stated they were "not otherwise reviewed" beyond citing them as pattern evidence. This finding's claim — that the helper PTQ-0208 motivated now exists, is proven adoptable by three sibling files, and these three (in this wave's own review scope) still have not adopted it — is a new observation about the post-fix state, not a re-filing of PTQ-0208's original claim.

## Triage
verdict: confirmed — all four excerpts reproduce verbatim at the cited lines (b0403:105-131, b0404:62-89, b0405:51-76 each declare the trio; only path depth `../` vs `../../` and the inline bug-number clause vs the canonical `owner` param differ), `grep -rl helpers/corpus-reader tests/` → b0117/b0265/b0457 (+ tests/helpers/theta-corpus.ts) and none of the three, vitest 16/16 passing at HEAD (not a correct-reason red), 0 coverage-matrix/docs/bugs hits, and the gate carve-out does not reach a helper's definition site (PTQ-0208/PTQ-0395 precedent); not a duplicate — PTQ-0208 is resolved but its fix commit 2594cd44 touched only b0117/b0265 and the new helpers, never b0403/b0405 (listed in 0208's locations) or b0404, so no open issue tracks these sites, exactly the post-fix-remainder shape PTQ-0395 was confirmed on for b0457 (triage: claude-fable-5-1)
