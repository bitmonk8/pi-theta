---
id: PTQ-0571
title: rfc-0009-spec-surface-gate.test.ts and rfc-0010-spec-surface-gate.test.ts each redeclare repoFile/readCorpus instead of importing tests/helpers/corpus-reader.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/rfc-0009-spec-surface-gate.test.ts:28-40
  - tests/rfc-0010-spec-surface-gate.test.ts:27-39
  - tests/helpers/corpus-reader.ts:18-38
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# rfc-0009-spec-surface-gate.test.ts and rfc-0010-spec-surface-gate.test.ts each redeclare repoFile/readCorpus instead of importing tests/helpers/corpus-reader.ts

## Observation
tests/rfc-0009-spec-surface-gate.test.ts and
tests/rfc-0010-spec-surface-gate.test.ts each declare, at module scope, their
own `repoFile` (resolves a repo-relative path via `import.meta.url`) and
`readCorpus` (reads that file as UTF-8, throwing a "harness precondition
unmet" `Error` naming the file on an unreadable or empty read). The two
bodies are identical except for the RFC number embedded in the thrown
message. tests/helpers/corpus-reader.ts already exports the equivalent pair,
generalised so a caller supplies its own "owner" clause via a parameter
instead of hardcoding it inline. Neither RFC gate file imports this module.

## Evidence
tests/helpers/corpus-reader.ts:18-38 — the canonical export:
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
```

tests/rfc-0009-spec-surface-gate.test.ts:28-40 (local copy, not importing
`corpus-reader.ts`):
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable — RFC 0009's spec surface lives there, so a missing file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to gate`);
```

tests/rfc-0010-spec-surface-gate.test.ts:27-39 (same trio, own RFC number
substituted):
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable — RFC 0010's spec surface lives there, so a missing file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to gate`);
```

Exact search: `grep -rl "function readCorpus" tests/*.test.ts` → 17 files
including these two. `grep -n "corpus-reader" tests/rfc-0009-spec-surface-gate.test.ts
tests/rfc-0010-spec-surface-gate.test.ts` → 0 hits in both (neither imports
the helper), while `tests/b0117-panic-namespace-scoping-gate.test.ts`,
`tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts`, and
`tests/b0457-retired-quote-sweep-gate.test.ts` do import it (`grep -rl "from
\"./helpers/corpus-reader\"\|from \"../helpers/corpus-reader\"" tests/*.ts` →
those 3 files).

## Why this is a problem
tests/helpers/corpus-reader.ts's own header states its purpose is to end
exactly this shape of redeclaration ("`repoFile` / `readCorpus` / `linesOf`
were redefined, byte-for-byte apart from the bug number named inside the
thrown message, in several … spec-gate test files"). The helper is proven
adoptable — three sibling gate files already import it with the same
control flow, its `readCorpus(rel, owner)` signature only reshaping the
hardcoded clause into a caller-supplied `owner` string. rfc-0009 and rfc-0010
both carry their own copy of the same two functions, differing from each
other and from the helper only in the RFC number named inside the thrown
message.

## Suggested direction (non-binding, optional)
tests/helpers/corpus-reader.ts already exports `repoFile`/`readCorpus`
generalised to exactly each file's need (an owner-supplied clause in the
thrown message, as the three already-migrated gate files demonstrate); it is
the existing home each file's own pair could import instead of redeclaring.

## False-positive check
- Gate-pin check: both files match `*gate*.test.ts` (rfc-0009-spec-surface-
  gate, rfc-0010-spec-surface-gate). As prior findings on this same helper
  reasoned, the census/pin carve-out exempts pinned-count/inventory
  assertions from being read as self-fixed tautologies; it does not exempt a
  harness helper's definition site. This finding touches neither file's
  pinned GOV-1 anchor/MUST-clause assertions — only the `repoFile`/
  `readCorpus` functions that precede them.
- Recording-double check: `readCorpus` reads a file and returns or throws; it
  records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "rfc-0009-spec-surface-gate\|rfc-0010-spec-surface-gate"
  docs/bugs/*.md` → 0 hits; neither file is a documented correct-reason red.
  `npx vitest run tests/rfc-0009-spec-surface-gate.test.ts
  tests/rfc-0010-spec-surface-gate.test.ts` passes both files at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n
  "rfc-0009-spec-surface-gate\|rfc-0010-spec-surface-gate"
  docs/reference/coverage-matrix.md` → 0 hits; neither file name appears in
  another bug doc's witness list. This finding proposes no merge, rename, or
  deletion of any `it()`/`describe()` — only where each file's local
  `repoFile`/`readCorpus` pair is defined.
- Coverage check: the claim is entirely about a repeated harness DEFINITION,
  not a missing test path; the pair is exercised by every cell in each file
  (confirmed passing above).
- Duplicate check: distinct from the already-filed
  `b0452-b0455-b0456-readcorpus-not-migrated` and
  `b0403-b0404-b0405-corpus-reader-not-migrated` findings in this same
  intake batch — those name a disjoint set of files (b0452/b0455/b0456 and
  b0403/b0404/b0405 respectively); neither lists rfc-0009 or rfc-0010.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: repoFile/readCorpus reproduce verbatim at tests/rfc-0009-spec-surface-gate.test.ts:28-40 and tests/rfc-0010-spec-surface-gate.test.ts:27-39, structurally identical to tests/helpers/corpus-reader.ts:18-38 (only path depth and the inline RFC-number clause vs the `owner` param differ); neither file imports corpus-reader (grep 0 hits; importers are b0117/b0265/b0457 + helpers/theta-corpus.ts), both pass 29/29 at HEAD, no docs/bugs or coverage-matrix citation of either file, and no carve-out applies (this touches the harness definition, not the pinned GOV-1 assertions); the `function readCorpus` census is now 14 files not the stated 17 (post-fix drift, both cited files still in it); not a duplicate — resolved PTQ-0208's fix (2594cd44) touched only b0117 + the new helper and PTQ-0395 established that per-file residual instances from its 17-file list are distinct filings, and the in-batch siblings (b0452/b0455/b0456, b0403/b0404/b0405, nonstring-literal-union, ternary) name disjoint files (triage: claude-fable-5-1)
