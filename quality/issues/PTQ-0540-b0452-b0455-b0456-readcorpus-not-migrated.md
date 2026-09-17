---
id: PTQ-0540
title: b0452, b0455, and b0456 each redeclare the repoFile/readCorpus/linesOf trio tests/helpers/corpus-reader.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts:56-83
  - tests/b0455-details-partition-count-consistency-gate.test.ts:42-66
  - tests/b0456-imports-cite-content-anchor-gate.test.ts:42-67
  - tests/helpers/corpus-reader.ts:18-42
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0452, b0455, and b0456 each redeclare the repoFile/readCorpus/linesOf trio tests/helpers/corpus-reader.ts already exports

## Observation
tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts,
tests/b0455-details-partition-count-consistency-gate.test.ts, and
tests/b0456-imports-cite-content-anchor-gate.test.ts each declare, module
scope, their own `repoFile` (resolves a repo-relative path via
`import.meta.url`), `readCorpus` (reads that file as UTF-8, throwing a
"harness precondition unmet" `Error` on an unreadable or empty read), and
`linesOf` (splits on `\r?\n`). tests/helpers/corpus-reader.ts already exports
the identical trio, generalised so a caller supplies its own "owner" clause
for the thrown message via a parameter instead of hardcoding it inline. None
of the three files imports this module; each hardcodes the equivalent clause
in its own `readCorpus` body instead.

## Evidence
tests/helpers/corpus-reader.ts:18-42 — the canonical export:
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

tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts:56-83:
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a required source for the bug 0452 surface this oracle owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
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

tests/b0455-details-partition-count-consistency-gate.test.ts:42-64 — same
control flow, only the inline clause and doc-comment wording differ:
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a surface bug 0455 owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}
```

tests/b0456-imports-cite-content-anchor-gate.test.ts:42-63 — same:
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a source this gate scores for the bug 0456 imports.ts / LPA cite sweep — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}
```

Exact search: `grep -rl "function readCorpus" tests/*.test.ts` → includes all
three files above alongside the previously-migrated `b0457` and others.
`grep -n "corpus-reader" tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts
tests/b0455-details-partition-count-consistency-gate.test.ts
tests/b0456-imports-cite-content-anchor-gate.test.ts` → 0 hits in all three
(none imports the helper); by contrast `tests/b0457-retired-quote-sweep-gate.test.ts`
(same repo directory, sibling bug number) now imports
`{ linesOf, readCorpus as readCorpusFile, repoFile } from "./helpers/corpus-reader"`.

## Why this is a problem
This is the "Boilerplate duplication" class. The identical ~20-line
path-resolver/fail-loud-reader/line-splitter harness is redefined at module
scope in three separate files rather than imported once from
tests/helpers/corpus-reader.ts, which exists specifically to hold this
shape. PTQ-0208 (resolved) first traced this duplication across 17 files,
explicitly naming `b0452`, `b0455`, and `b0456` among the un-migrated
remainder its own grep found but did not file against; PTQ-0395 (resolved)
subsequently filed and fixed the specific `b0457` instance from that same
remainder. `b0452`, `b0455`, and `b0456` remain the still-open instances of
that same, already-named gap.

## Suggested direction (non-binding, optional)
tests/helpers/corpus-reader.ts already exports `repoFile`/`readCorpus`/
`linesOf` generalised to exactly each file's need (an owner-supplied clause
in the thrown message, as `b0457`'s own now-migrated import demonstrates);
it is the existing home each file's own trio could import instead of
redeclaring.

## False-positive check
- Gate-pin check: `b0455-details-partition-count-consistency-gate.test.ts`
  and `b0456-imports-cite-content-anchor-gate.test.ts` both match
  `*gate*.test.ts`. As PTQ-0208's and PTQ-0395's own false-positive checks
  reasoned for their own gate-matching files, the census/pin carve-out
  exempts pinned-count/inventory assertions from being read as self-fixed
  tautologies; it does not exempt a harness helper's definition site. This
  finding touches none of either file's pinned-count cells or line-content
  assertions — only the `repoFile`/`readCorpus`/`linesOf` functions that
  precede them.
- Recording-double check: `readCorpus` reads a file and returns or throws;
  it records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0452-…md, docs/bugs/0455-…md, and
  docs/bugs/0456-…md are all Status fixed. `npx vitest run
  tests/b0452-render-fail-refusal-note-matrix-row-coverage.test.ts
  tests/b0455-details-partition-count-consistency-gate.test.ts
  tests/b0456-imports-cite-content-anchor-gate.test.ts` passes all tests at
  HEAD, so none is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0452-render-fail-refusal-note-matrix-row-coverage\|b0455-details-partition-count-consistency-gate\|b0456-imports-cite-content-anchor-gate"
  docs/reference/coverage-matrix.md` → 0 hits; none of the three file names
  appears in another bug doc's witness list. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only where each
  file's internal `readCorpus` trio is defined.
- Coverage check: the claim is entirely about a repeated harness
  DEFINITION, not a missing test path; the trio is exercised by every test
  in each file (confirmed passing above).
- Prior-finding overlap check: PTQ-0208 (resolved) named all three files in
  its 17-file grep hit list without filing against or fixing them; PTQ-0395
  (resolved) later filed and fixed only `b0457` from that same list. This
  finding covers the three still-unremediated files from that named
  remainder, not a re-filing of either resolved finding.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: repoFile/readCorpus/linesOf reproduce verbatim at b0452:56-83, b0455:42-64, b0456:42-63 and differ from tests/helpers/corpus-reader.ts:19-45 only by path depth (`../` vs `../../`) and inline clause vs the `owner` parameter; `grep -n corpus-reader` on all three → 0 hits while sibling b0457 imports the helper; vitest 3 files / 31 tests pass at HEAD (bug docs 0452/0455/0456 all Status fixed, so not a correct-reason red); coverage-matrix cites none of the three and the only bug-doc cites are each file's own witness entry, with no it()/describe() touched; PTQ-0208 (resolved, filed on b0117/b0265/b0403/b0405/b0421) named these three in its 17-file grep list without filing against them and PTQ-0395 (resolved) fixed only b0457, and no other quality/ row tracks them — a distinct, currently-real instance of the established class, ruled exactly as PTQ-0395 (triage: claude-fable-5-1)
