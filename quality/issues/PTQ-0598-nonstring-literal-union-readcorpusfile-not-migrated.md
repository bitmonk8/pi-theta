---
id: PTQ-0598
title: nonstring-literal-union-emission-subs3.test.ts hand-rolls a repo-relative file reader instead of importing tests/helpers/corpus-reader.ts's repoFile/readCorpus
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/nonstring-literal-union-emission-subs3.test.ts:117-122
  - tests/helpers/corpus-reader.ts:18-36
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# nonstring-literal-union-emission-subs3.test.ts hand-rolls a repo-relative file reader instead of importing tests/helpers/corpus-reader.ts's repoFile/readCorpus

## Observation
`tests/nonstring-literal-union-emission-subs3.test.ts` defines its own
`readCorpusFile(relative)` that resolves a repo-relative path against
`import.meta.url` and reads it as UTF-8. `tests/helpers/corpus-reader.ts`
already exports the equivalent `repoFile`/`readCorpus` pair, built for exactly
this "read a committed spec/reference corpus file" purpose; its own header
names this file (as `readCorpusFile`) among the sibling test files PTQ-0208
found reimplementing the same read.

## Evidence
tests/nonstring-literal-union-emission-subs3.test.ts:117-122:
```ts
function readCorpusFile(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8",
  );
}
```

tests/helpers/corpus-reader.ts:18-36 — the canonical, already-exported
equivalent:
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

Pinned lineage: `quality/resolved/PTQ-0208-readcorpus-harness-duplication.md`
(status `fixed`, verdict `confirmed`) lists
`nonstring-literal-union-emission-subs3` by name (as `readCorpusFile`) among
the files carrying this exact reimplementation at the time
`tests/helpers/corpus-reader.ts` was created as the fix. The helper's own
header states its purpose is "a shared 'read a committed corpus file, fail
loud on absence' harness for the spec-surface oracle test files
(`b0117`, `b0265`, and further siblings that mirror the same pattern
forward)".

## Why this is a problem
`tests/helpers/corpus-reader.ts` exists specifically to end the
`repoFile`/`readCorpus` reimplementation PTQ-0208 catalogued, and its own
resolved-finding evidence already named this file's `readCorpusFile` as one
of the copies motivating the helper's creation. The helper has since been
adopted by other files (b0117, b0265, b0457, per the resolved finding's own
grep), but `nonstring-literal-union-emission-subs3.test.ts` was not among the
migrated set and still carries its own local reader instead of importing the
shared one.

## Suggested direction (non-binding, optional)
`tests/helpers/corpus-reader.ts` already exports `repoFile` (the path
resolution this file's `readCorpusFile` reimplements) and `readCorpus` (the
same read with a named, loud-failure `owner` message on an unreadable or
empty file); importing one of them in place of the local `readCorpusFile` is
the existing, purpose-built home for this read.

## False-positive check
- Gate-pin check: the cited `readCorpusFile` lines are a file-reading utility,
  not a pinned count or inventory assertion; the file's own pinned-count
  assertions (`SPEC_TOPIC_SEGMENTS`, `REFERENCE_SEGMENTS`) are a separate
  concern from this finding, which is about the reader function only.
- Recording-double check: not applicable; `readCorpusFile` is a plain file
  read, not a recording double or negative witness.
- docs/bugs/ signature search: `grep -rl "nonstring-literal-union-emission"
  docs/bugs/*.md` shows docs/bugs/0098-nonstring-literal-union-emission-unspecified.md
  citing this file as its own witness; its status does not concern the reader
  function's duplication, only the SUBS-3 spec-text fill this file's group (a)
  witnesses.
- coverage-matrix/bug-doc citation search: `grep -rn
  "nonstring-literal-union-emission" docs/reference/coverage-matrix.md` → no
  hits; no merge, rename or deletion of any cited cell is proposed, only the
  local `readCorpusFile` definition.
- Coverage check: the claim is about a duplicated reader-function DEFINITION,
  not a missing test path; every cell in the file continues to pass/fail
  exactly as documented under the current inline definition. `readFileSync`
  already throws loudly (Node `ENOENT`) on a missing file, so no silent-skip
  claim is made here — only the duplicated construction of the path-resolution
  and read logic against the existing, purpose-built helper.

## Triage
verdict: confirmed — re-verified independently: readCorpusFile reproduces verbatim at tests/nonstring-literal-union-emission-subs3.test.ts:117-122 (its only callers are lines 124-125; the file's readFileSync/fileURLToPath imports exist solely for it) and repoFile/readCorpus at tests/helpers/corpus-reader.ts:18-36, with `../` from tests/ and `../../` from tests/helpers/ resolving to the same repo root; `grep corpus-reader` in the file → 0 hits while b0117/b0265/b0457/theta-corpus.ts already import the helper; PTQ-0208 (resolved) names this file in its 17-file grep as an unfiled remainder, and no other open/intake/resolved PTQ or same-wave sibling (b0403-05, b0452-56, rfc-0009/0010, ternary) cites it; bug 0098 is fixed (0.252.0), vitest 33/33 green, not a *gate* file, no coverage-matrix hit — a distinct un-migrated instance of the PTQ-0208 class under the PTQ-0395 precedent, mechanical dedupe (triage: claude-fable-5-1)
