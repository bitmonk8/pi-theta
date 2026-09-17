---
id: PTQ-0395
title: b0457 redeclares the repoFile/readCorpus/linesOf trio that tests/helpers/corpus-reader.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0457-retired-quote-sweep-gate.test.ts:45-70
  - tests/helpers/corpus-reader.ts:19-45
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917045205
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0457 redeclares the repoFile/readCorpus/linesOf trio that tests/helpers/corpus-reader.ts already exports

## Observation
tests/b0457-retired-quote-sweep-gate.test.ts declares, module scope, its own
`repoFile` (resolves a repo-relative path via `import.meta.url`), `readCorpus`
(reads that file as UTF-8, throwing a "harness precondition unmet" `Error` on
an unreadable or empty read), and `linesOf` (splits on `\r?\n`).
tests/helpers/corpus-reader.ts already exports the identical trio, generalised
so a caller supplies its own "owner" clause for the thrown message via a
parameter rather than the message being hardcoded per file. b0457 does not
import this module; its own `readCorpus` hardcodes the equivalent clause
inline instead of passing it as the canonical export's `owner` argument.

## Evidence
tests/b0457-retired-quote-sweep-gate.test.ts:45-46 (`repoFile`):
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));
```

tests/b0457-retired-quote-sweep-gate.test.ts:54-67 (`readCorpus`, of the full
45-70 range):
```ts
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a source this gate scores for the bug 0457 quote sweep — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
  return text;
}
```

tests/b0457-retired-quote-sweep-gate.test.ts:70 (`linesOf`):
```ts
const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);
```

tests/helpers/corpus-reader.ts:19-20, :29-42, :45 — the canonical export,
structurally identical at every control-flow branch (path depth and the
`owner` parameter are the only differences):
```ts
export const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../../${rel}`, import.meta.url));
```
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
```ts
export const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);
```

Diff (re-run immediately before filing, `export` keyword and path depth
normalised): `repoFile` differs only in `../` vs `../../` — a mechanical
consequence of tests/helpers/ sitting one directory deeper than tests/, not a
behavioural difference; `readCorpus`'s control flow (try/catch, the
empty-text throw, the return) is identical, the only difference being that
the canonical's thrown message interpolates a caller-supplied `owner`
parameter where b0457's hardcodes the equivalent clause ("a source this gate
scores for the bug 0457 quote sweep") inline; `linesOf` is byte-identical
apart from its doc comment wording. Current-state confirmation:
`grep -n "from \"\./helpers/corpus-reader\"" tests/b0457-retired-quote-sweep-gate.test.ts`
→ 0 hits (not imported).

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class. tests/helpers/corpus-reader.ts's
own header states it centralises this exact trio because it recurred,
byte-for-byte apart from the bug number in the thrown message, across several
`b02xx`/`b04xx` spec-gate test files (PTQ-0208, resolved, for
b0117/b0265/b0403/b0405/b0421). PTQ-0208's own pattern-wide search — `grep -rl
"function readCorpus" tests/*.test.ts` — already found 17 files sharing this
exact function name at the time of that filing, and named
`tests/b0457-retired-quote-sweep-gate.test.ts` explicitly among them, but
scoped its own filed locations to only 5 of the 17 (stating the remainder
were "cited solely as duplication evidence… and were not otherwise
reviewed"). b0457 is one of the un-migrated remainder: its `readCorpus`
differs from the canonical only by hardcoding, inline, the exact clause the
canonical's `owner` parameter exists to let a caller supply.

## Suggested direction (non-binding, optional)
tests/helpers/corpus-reader.ts already exports `repoFile`/`readCorpus`/`linesOf`
generalised to exactly this file's need (an owner-supplied clause in the
thrown message); it is the existing home this file's own trio could import
instead of redeclaring.

## False-positive check
- Gate-pin check: tests/b0457-retired-quote-sweep-gate.test.ts matches
  `*gate*.test.ts`. The census/pin carve-out exempts pinned-count/inventory
  assertions (Cell A's zero-offenders list, Cell B's five-file sweep, Cell
  C's line-content pins) from being read as self-fixed tautologies; it does
  not exempt a harness helper's definition site. This finding touches none
  of Cell A/B/C's pinned counts, offender lists, or line-content
  assertions — only the `repoFile`/`readCorpus`/`linesOf` functions that
  precede them — mirroring PTQ-0208's own False-positive check for the two
  `*gate*.test.ts` files it filed against
  (b0117-panic-namespace-scoping-gate.test.ts,
  b0265-panic-scoping-remnant-surfaces-gate.test.ts), which reasoned
  identically.
- Recording-double check: `readCorpus` reads a file and returns or throws; it
  records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0457-retired-text-quoted-as-current.md
  — Status fixed (0.445.0). `npx vitest run tests/b0457-retired-quote-sweep-gate.test.ts`
  → 7 tests passing at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0457-retired-quote-sweep-gate"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl "b0457-retired-quote-sweep-gate.test.ts"
  docs/bugs/*.md` (excluding its own doc) → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only where the
  harness trio is defined.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; the trio is exercised by every test in the file (7/7
  passing, confirmed above).
- Prior-finding overlap check: PTQ-0208 (resolved) already confirms this
  exact duplication class for a disjoint 5-file location list (b0117, b0265,
  b0403, b0405, b0421) and its own evidence names
  tests/b0457-retired-quote-sweep-gate.test.ts as one of the further files
  sharing "function readCorpus" it explicitly did not file against; this
  finding is the specific, currently-unremediated b0457 instance of that
  same already-established gap, not a re-filing of PTQ-0208.

## Triage
verdict: confirmed — repoFile/readCorpus/linesOf reproduce verbatim at tests/b0457-retired-quote-sweep-gate.test.ts:45-70 and tests/helpers/corpus-reader.ts:19-45 (only path-depth and inline-vs-owner-param differ), b0457 has zero import of corpus-reader, vitest shows 7/7 passing at HEAD (not a documented correct-reason red), no coverage-matrix/bug-doc citation of its witnesses exists, and PTQ-0208 (resolved) named b0457 in its 17-file grep hit list without filing against or fixing it, so this is a distinct, non-duplicate, currently-real instance of that established class (triage: claude-opus-5)
