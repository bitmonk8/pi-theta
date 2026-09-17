---
id: PTQ-0683
title: ternary-common-type-trigger-adjudication.test.ts's corpus(relative) reader is redeclared in four files and reimplements tests/helpers/corpus-reader.ts's repoFile/readCorpus without the loud-absence guard
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/ternary-common-type-trigger-adjudication.test.ts:91-96
  - tests/match-fn-return-lub-dominating-discipline.test.ts:146-148
  - tests/unresolvable-operand-structural-target-adjudication.test.ts:257-259
  - tests/fn-param-annotation-optional.test.ts:127-129
  - tests/helpers/corpus-reader.ts:16-38
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# ternary-common-type-trigger-adjudication.test.ts's corpus(relative) reader is redeclared in four files and reimplements tests/helpers/corpus-reader.ts's repoFile/readCorpus without the loud-absence guard

## Observation
`tests/ternary-common-type-trigger-adjudication.test.ts` declares a
module-scope `function corpus(relative: string): string` that resolves
`relative` against the repo root through `fileURLToPath(new URL(...,
import.meta.url))` and reads it with `readFileSync`. The identical function
(same signature, same `../${relative}` URL construction, same bare
`readFileSync` call with no absence/empty check) is separately declared in
two further test files, and a near-identical variant (differing only in
whether the caller's own `relative` argument already carries the `../`
prefix) in a fourth. `tests/helpers/corpus-reader.ts` already exports
`repoFile(rel)` (the identical URL-resolution step) and `readCorpus(rel,
owner)` (the same read, but wrapped in a try/catch that throws a named
"harness precondition unmet" error on a missing OR empty file) for exactly
this purpose. None of the four local `corpus` functions imports either
export, and none carries the empty/absent guard `readCorpus` provides.

## Evidence
tests/ternary-common-type-trigger-adjudication.test.ts:91-96 (re-read
immediately before filing):
```ts
function corpus(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8",
  );
}
```

tests/match-fn-return-lub-dominating-discipline.test.ts:146-148 — identical
shape, one line:
```ts
function corpus(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}
```

tests/unresolvable-operand-structural-target-adjudication.test.ts:257-259 —
identical shape:
```ts
function corpus(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}
```

tests/fn-param-annotation-optional.test.ts:127-129 — same read, the caller's
`relative` argument already carries the path prefix so the URL template has
no literal `../`:
```ts
function corpus(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}
```

tests/helpers/corpus-reader.ts:16-38 — the canonical helper already exported
for this purpose, with the loud-absence guard the four local copies lack:
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

Exact search: `grep -rln "^function corpus(relative: string): string {" tests --include="*.test.ts"` → exactly the four files cited above. `grep -n "corpus-reader" tests/ternary-common-type-trigger-adjudication.test.ts tests/match-fn-return-lub-dominating-discipline.test.ts tests/unresolvable-operand-structural-target-adjudication.test.ts tests/fn-param-annotation-optional.test.ts` → 0 hits in all four.

## Why this is a problem
`tests/helpers/corpus-reader.ts` was built (per its own header) to centralise
"a shared 'read a committed corpus file, fail loud on absence' harness" after
the read was "redefined, byte-for-byte apart from the bug number named inside
the thrown message, in several… test files." The reviewed file's local
`corpus` function is the same read for the same purpose (loading a spec/doc
page to scope a conformance assertion), redeclared a fourth time, and its
bare `readFileSync` — unlike `readCorpus` — has no guard against a missing or
empty file: a corpus page deleted or emptied out from under this file would
throw the raw Node `ENOENT`/pass an empty string through to whatever
extraction runs next, rather than the named, loud harness-precondition error
`readCorpus` raises.

## Suggested direction (non-binding, optional)
`tests/helpers/corpus-reader.ts`'s already-exported `repoFile`/`readCorpus`
is the existing home each of the four `corpus(relative)` copies already
converges on; the review-scope file already treats every anchor-not-found
case with a loud named throw (its `sliceFrom`/`trigger` helpers), so
`readCorpus`'s guard matches its own stated no-silent-skip posture more
closely than its current bare `readFileSync`.

## False-positive check
- Gate-pin check: none of the four files matches `*gate*.test.ts` or a named
  gate kin; the cited lines are a corpus-read utility, not a pinned count or
  inventory.
- Recording-double check: `corpus` reads static file bytes off disk; it
  records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "ternary-common-type-trigger-adjudication\|match-fn-return-lub-dominating-discipline\|unresolvable-operand-structural-target-adjudication\|fn-param-annotation-optional" docs/bugs/*.md` → each file is named only as its own bug's regression-test witness (bug 0155, 0158, and siblings); none gives a rationale for keeping this read function file-local.
- coverage-matrix/bug-doc citation search: `grep -n "ternary-common-type-trigger-adjudication.test.ts\|match-fn-return-lub-dominating-discipline.test.ts\|unresolvable-operand-structural-target-adjudication.test.ts\|fn-param-annotation-optional.test.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any test — only that the shared read function could be imported once.
- Overlap check: `grep -rl "function corpus(relative" quality/intake/*.md quality/resolved/*.md` → 0 hits; a sibling finding in this same wave (`qw20260917154546-d7-01-slicefrom-doc-anchor-extractor-triplicated.md`) covers a DIFFERENT function (`sliceFrom`) across three of the same four files and does not cite `corpus`.
- Coverage check: the claim is about a repeated harness DEFINITION already exercised by every cell in each file; no coverage/untested-path claim is made.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — all four `function corpus(relative: string): string` excerpts reproduce verbatim at the cited lines (ternary :91-96 multi-line, match-fn :146-148, unresolvable :257-259 identical one-liners, fn-param :127-129 with callers passing `../${path}` at :221/237/253/274/295) and tests/helpers/corpus-reader.ts:16-38 exports repoFile/readCorpus covering the same read plus the missing/empty guard; re-ran the exact grep → exactly those 4 files, `corpus-reader` → 0 imports in all four, no in-file rationale for a local reader, none matches *gate*, 0 coverage-matrix hits, docs/bugs name the files only as witnesses; not a duplicate — resolved PTQ-0208/PTQ-0395 cite b0117/b0265/b04xx gate files and name none of these four, and wave sibling d7-02-corpus-section-flat explicitly declines to file them (note: the wider `corpus(rel)` shape also recurs in 4 further files the candidate's exact-signature search excluded) (triage: claude-fable-5-1)
