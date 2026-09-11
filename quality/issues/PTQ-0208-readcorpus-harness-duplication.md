---
id: PTQ-0208
title: The repoFile/readCorpus/linesOf corpus-reading harness in b0117 and b0265 is copied, traceably, into at least 15 further test files
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts:80-104
  - tests/b0117-panic-namespace-scoping-gate.test.ts:101-123
  - tests/b0403-unary-minus-message-registry-divergence.test.ts:108-122
  - tests/b0405-grammar-cite-sweep-gate.test.ts:54-67
  - tests/b0421-grammar-cite-sweep-remainder-gate.test.ts:51-64
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# The repoFile/readCorpus/linesOf corpus-reading harness in b0117 and b0265 is copied, traceably, into at least 15 further test files

## Observation
Both `tests/b0117-panic-namespace-scoping-gate.test.ts` and
`tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts` define an identical
three-piece harness at module scope: `repoFile` (resolves a repo-relative path
via `import.meta.url`), `readCorpus` (reads that file as UTF-8, throwing a
"harness precondition unmet" `Error` on an unreadable or empty read — never a
skip), and `linesOf` (splits on `\r?\n`). The two files' `repoFile` and
`linesOf` definitions are byte-identical; the two `readCorpus` bodies differ
only in the bug number named inside the thrown message. Several later files
elsewhere in `tests/` carry the same trio and say, in their own doc comments,
that they mirror it forward from b0265 (and, one hop further, from each
other).

## Evidence
tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts:87-100:
```ts
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is this oracle's only source for the bug 0265 surface it owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(
      `harness precondition unmet: ${rel} is empty; nothing to score`,
    );
  }
```

tests/b0117-panic-namespace-scoping-gate.test.ts:108-119 (same function, same
control flow, same message shape, bug number substituted):
```ts
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is this oracle's only source for the bug 0117 ruling — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(`harness precondition unmet: ${rel} is empty; nothing to score`);
  }
```

Both files' `repoFile`/`linesOf` pair is byte-identical — e.g.
tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts:80-81 and
tests/b0117-panic-namespace-scoping-gate.test.ts:101-102 are each:
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));
```
and tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts:104 /
tests/b0117-panic-namespace-scoping-gate.test.ts:123 are each:
```ts
const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);
```

tests/b0403-unary-minus-message-registry-divergence.test.ts:108-122 — a later
file's own doc comment names the source of the copy directly ("the b0265
`readCorpus` pattern"):
```ts
/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return
 * (the b0265 readCorpus pattern), because the file IS this cell's only oracle
 * and a degraded read would report success while verifying nothing.
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is this oracle's only source for the bug 0403 surface it owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
```

tests/b0405-grammar-cite-sweep-gate.test.ts:54-67 — same self-citation:
```ts
/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so
 * an absent source cannot let a cell pass vacuously (the b0265 `readCorpus`
 * pattern this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a source this oracle scores for the bug 0405 sweep — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
```

tests/b0421-grammar-cite-sweep-remainder-gate.test.ts:51-64 — a second hop: this
file names b0405 (itself already one hop from b0265) as its own copy source:
```ts
const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so an
 * absent source cannot let a cell pass vacuously (the bug-0405 readCorpus pattern
 * this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
```

Pattern-wide search: `grep -rl "function readCorpus" tests/*.test.ts` → 17
files (`b0117`, `b0265`, `b0403`, `b0404`, `b0405`, `b0419`,
`b0421`, `b0434`, `b0436`, `b0452`, `b0455`, `b0456`, `b0457`,
`nonstring-literal-union-emission-subs3` (as `readCorpusFile`),
`par-body-restriction-registry-rows`, `rfc-0009-spec-surface-gate`,
`rfc-0010-spec-surface-gate`). `grep -rl "a missing corpus file is a loud
failure, never a skip" tests/*.test.ts` → 13 of those files carry that exact
clause verbatim. A further `grep -rn "b0265.{0,40}readCorpus\|readCorpus.{0,40}b0265\|bug-0405 readCorpus"
tests/*.test.ts` shows four more files' own doc comments naming "the b0265
`readCorpus` pattern" or "the b0265/b0404 `readCorpus` pattern" as what they
mirror (`b0404-custom-type-unsafe-note-matrix-row.test.ts`,
`b0436-shape-enumeration-sentences-gate.test.ts`, plus the two quoted above).

## Why this is a problem
The same ~20-line harness — a path resolver, a fail-loud corpus reader, and a
line splitter — is redefined at module scope in at least 17 files rather than
imported once. This is not merely convergent style: three of the citations
above state in their own text which earlier file's `readCorpus` they are
reproducing (`b0403` and `b0405` both name "the b0265 `readCorpus` pattern";
`b0421` names "the bug-0405 readCorpus pattern this file mirrors", one hop
further down the same chain), so the repetition is a traced copy lineage
rather than independent coincidence. `tests/helpers/` is this suite's
existing home for shared, non-domain-specific test plumbing (`fake-clock.ts`,
`fake-file-system.ts`, `e2e-s1.ts`, …), and no module there currently exports a
corpus-reading harness of this shape, which is consistent with each citing
file re-deriving rather than importing one.

## Suggested direction (non-binding, optional)
`tests/helpers/` already holds this suite's shared-harness modules; a
`repoFile`/`readCorpus`/`linesOf`-shaped export living there is the home the
citing files' own comments already point at ("the b0265 `readCorpus`
pattern"), not a design for the extraction.

## False-positive check
- Gate-pin check: `b0117-panic-namespace-scoping-gate.test.ts` and
  `b0265-panic-scoping-remnant-surfaces-gate.test.ts` both match
  `*gate*.test.ts` (as do three of the corroborating files), but this finding
  is about where the corpus-reading FUNCTION is defined, not about a pinned
  count or inventory assertion — the census/pin carve-out's stated scope does
  not cover a helper's definition site, and no pinned count in either file is
  disturbed by this observation.
- Recording-double check: `readCorpus` reads a file and returns/throws; it
  records no calls and backs no "never called" witness, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "readCorpus" docs/bugs/*.md` → 0
  files; no open bug document discusses this duplication or gives a rationale
  for keeping the reader local to each file. `docs/bugs/0117-…md` Status is
  "fixed (0.256.0)"; `docs/bugs/0265-…md` Status is "fixed (0.259.0)"; neither
  is a documented correct-reason red. `npx vitest run
  tests/b0117-panic-namespace-scoping-gate.test.ts
  tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts
  tests/b0403-unary-minus-message-registry-divergence.test.ts
  tests/b0405-grammar-cite-sweep-gate.test.ts
  tests/b0421-grammar-cite-sweep-remainder-gate.test.ts` passes all five files
  (36 tests) at HEAD.
- coverage-matrix / bug-doc citation search: `grep -n
  "b0117-panic-namespace-scoping-gate\|b0265-panic-scoping-remnant-surfaces-gate"
  docs/reference/coverage-matrix.md` → 0 hits. Both file names ARE cited by
  name inside other bug docs' witness/reference sections
  (`docs/bugs/0398-…md`, `docs/bugs/0404-…md`, `docs/bugs/0434-…md`,
  `docs/bugs/0436-…md` all name b0265's file as the byte-stability oracle their
  own additive fixes must not disturb). This finding proposes no merge,
  rename, or deletion of either file, and touches no `it()`/`describe()` name,
  count, or assertion — only where the internal `readCorpus` helper is
  defined — so those citations are unaffected.
- Coverage check: the claim is entirely about a repeated harness DEFINITION,
  not a missing test path; every copy is exercised by the tests in its own
  file (confirmed passing above).
- Scope: only `tests/b0117-panic-namespace-scoping-gate.test.ts` and
  `tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts` are in this wave's
  review scope; the three further files (`b0403`, `b0405`, `b0421`) are cited
  solely as duplication evidence — showing the pattern traced from b0265
  forward — and were not otherwise reviewed.

## Triage
verdict: confirmed — every excerpt and grep count (17/13/5-file hits) reproduces exactly at HEAD, repoFile/linesOf are byte-identical and readCorpus is structurally identical (bug-number clause aside) across all checked copies, several further files' own doc comments explicitly name the traced b0265→b0403/b0405→b0419/b0421/b0434/b0456/b0457 lineage (more than cited), tests/helpers/ has no such export yet, and no carve-out (gate-pin, coverage-matrix/bug-doc citation, dedupe) applies (triage: claude-opus-5)
