---
id: PTQ-1309
title: b0419's repoFile/readCorpus/linesOf trio still hand-rolled, not migrated to tests/helpers/corpus-reader.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0419-b0366-header-reversed-belt-design-gate.test.ts:44-63
  - tests/helpers/corpus-reader.ts:15-16
  - tests/helpers/corpus-reader.ts:23-35
  - tests/helpers/corpus-reader.ts:38
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# b0419's repoFile/readCorpus/linesOf trio still hand-rolled, not migrated to tests/helpers/corpus-reader.ts

## Observation
tests/b0419-b0366-header-reversed-belt-design-gate.test.ts declares its own
module-scope `repoFile`, `readCorpus` and `linesOf` functions rather than
importing the byte-equivalent exports already living in
tests/helpers/corpus-reader.ts. The helper's own header states it exists
precisely because this trio "were redefined, byte-for-byte apart from the bug
number named inside the thrown message, in several b02xx/b04xx spec-gate test
files (PTQ-0208)". b0419's own file-header comment even names "the b0405
`readCorpus` pattern this file mirrors" — describing the copy relationship
rather than an import.

## Evidence

`tests/b0419-b0366-header-reversed-belt-design-gate.test.ts:44-63`:
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so
 * an absent source cannot let a cell pass vacuously (the b0405 `readCorpus`
 * pattern this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a source this oracle scores for the bug 0419 header re-frame — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}

/** Line splitting tolerates a CRLF terminator. */
const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);
```

`tests/helpers/corpus-reader.ts:15-16`:
```ts
export const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../../${rel}`, import.meta.url));
```

`tests/helpers/corpus-reader.ts:23-35`:
```ts
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
```

`tests/helpers/corpus-reader.ts:38`:
```ts
export const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);
```

The bodies are structurally identical: same try/catch-then-throw shape, same
empty-text guard and message, same CRLF-tolerant split, differing only in the
`repoFile` path depth (`../` from `tests/` vs `../../` from
`tests/helpers/`) and the hard-coded owner clause ("a source this oracle
scores for the bug 0419 header re-frame") versus the helper's parameterised
`owner` argument.

## Why this is a problem
tests/helpers/corpus-reader.ts already centralises this exact
repoFile/readCorpus/linesOf trio for "the spec-surface oracle test files
(b0117, b0265, and further siblings that mirror the same pattern forward)".
PTQ-0208 (resolved) named b0419 among the files carrying this hand-rolled
copy, and PTQ-0979 (resolved)'s triage note separately flagged b0419 (plus
b0421 and b0436) as "same class, uncited here, separate residuals" —
acknowledged but never filed. The copy in b0419 is one more repetition of the
same three-function setup sequence the helper module exists to end.

## Suggested direction (non-binding, optional)
Importing `repoFile`, `readCorpus` and `linesOf` from
tests/helpers/corpus-reader.ts (passing the bug-0419-specific owner string as
the helper's `owner` parameter) would give this file the same treatment the
helper's other importers already received.

## False-positive check
- Gate-pin check: b0419 matches the sanctioned `*gate*.test.ts` shape and its
  cells score a pinned re-frame; this finding does not touch any pinned count
  or inventory — only the setup trio (`repoFile`/`readCorpus`/`linesOf`)
  duplicated ahead of the pinned cells.
- Recording-double check: not applicable; `readCorpus` is a plain file-read
  helper, not a call-recording double.
- docs/bugs/ signature search: docs/bugs/0419-b0366-header-asserts-reversed-belt-design.md
  cites this test file as its witness; the citation concerns the header
  re-frame content, not this harness trio.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0419-b0366-header-reversed-belt-design-gate" docs/reference/coverage-matrix.md`
  → no hits. This finding proposes no merge/rename/delete of any cell.
- Already-filed check: PTQ-0208 (resolved) lists b0419 among files sharing
  this trio but its own fix scope did not include b0419 (its own text says
  "files (b0117, b0265, b0403, b0404, b0405, b0419, …" as background, and the
  helper module it created is not imported by b0419 today); PTQ-0979
  (resolved)'s triage explicitly identifies b0419 as an uncited, unfiled
  residual of the same class. No open/intake finding currently tracks b0419's
  copy specifically, so this is not a duplicate.
- Coverage check: this claim is about a duplicated setup-helper definition,
  not a missing test path; b0419's cells all pass at HEAD.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all four excerpts reproduce verbatim at tests/b0419-b0366-header-reversed-belt-design-gate.test.ts:44-63 and tests/helpers/corpus-reader.ts:15-16,23-35,38; a mktemp `diff -w` of the two readCorpus bodies shows the only deltas are the missing `owner` parameter and the hard-coded "a source this oracle scores for the bug 0419 header re-frame" clause (repoFile/linesOf identical bar the `../` vs `../../` depth the helper's location absorbs); b0419 has no corpus-reader import while 20 sibling files already import from it; stated searches reproduce (coverage-matrix 0 hits; vitest 4/4 green at HEAD); the *gate* carve-out covers the pinned cells, not this setup trio; dedupe: PTQ-0208 (resolved) named b0419 only as background at :140 and cited b0421 not b0419 as a location, PTQ-0979 (resolved) explicitly left b0419/b0421/b0436 as "uncited, separate residuals", REVIEW_LOG:135 deferred it as "route as additional instances", and no open/intake row tracks b0419's copy — not a duplicate (triage: claude-fable-5-1)
