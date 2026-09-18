---
id: PTQ-0952
title: for-empty-array-iterand-adjudication.test.ts redeclares the corpus/section doc-reading pair tests/helpers/corpus-reader.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/for-empty-array-iterand-adjudication.test.ts:70-79
  - tests/for-empty-array-iterand-adjudication.test.ts:87-97
  - tests/helpers/corpus-reader.ts:48-71
sites: 1
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# for-empty-array-iterand-adjudication.test.ts redeclares the corpus/section doc-reading pair tests/helpers/corpus-reader.ts already exports

## Observation
`tests/for-empty-array-iterand-adjudication.test.ts` declares its own
module-private `corpus(rel)` and `section(text, heading, rel)` functions that
read a doc file off `REPO_ROOT` (throwing loudly on an empty read) and
region-scope its text to a `## `-headed section (throwing loudly on a missing
heading). `tests/helpers/corpus-reader.ts` already exports a `corpus(rel)` and
a `section(text, heading, rel, region)` performing the same read-loudly /
scope-to-heading behaviour, with the same "never a vacuous pass" framing in
both files' thrown messages. The reviewed file never imports
`tests/helpers/corpus-reader.ts`, despite already importing two other
`tests/helpers/` modules (`./helpers/e2e-s1`, `./helpers/theta-corpus`).

## Evidence
`tests/for-empty-array-iterand-adjudication.test.ts:70-79`:
```ts
function corpus(rel: string): string {
  const abs = path.join(REPO_ROOT, rel);
  const text = readFileSync(abs, "utf8");
  if (text.length === 0) {
    throw new Error(
      `harness: ${rel} read empty, so the conformance cell below would range over no prose — a loud failure, never a vacuous pass`,
    );
  }
  return text;
}
```

`tests/for-empty-array-iterand-adjudication.test.ts:87-97`:
```ts
function section(text: string, heading: string, rel: string): string {
  const start = text.indexOf(heading);
  if (start < 0) {
    throw new Error(
      `harness: ${rel} contains no heading ${JSON.stringify(heading)}, so the region this cell scopes to does not exist`,
    );
  }
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf("\n## ");
  return heading + (end < 0 ? rest : rest.slice(0, end));
}
```

`tests/helpers/corpus-reader.ts:48-71` (the canonical pair, already exported):
```ts
export function corpus(rel: string): string {
  const text = readFileSync(repoFile(rel), "utf8");
  if (text.trim().length === 0) {
    throw new Error(
      `harness: ${rel} read empty, so the section this cell scopes to does not exist — a loud failure, never a vacuous pass`,
    );
  }
  return text;
}

/**
 * The body of a `##`-headed section, heading line included, up to the next
 * `## ` heading. Region-scoped so no cell below can be satisfied by the
 * required token appearing in unrelated prose elsewhere on the page.
 */
export function section(text: string, heading: string, rel: string, region: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) {
    throw new Error(
      `harness: ${rel} carries no heading ${JSON.stringify(heading)}, so the ${region} region this cell scopes to does not exist`,
    );
  }
  const rest = text.slice(start + 1 + heading.length);
  const end = rest.indexOf("\n## ");
  return heading + (end < 0 ? rest : rest.slice(0, end));
}
```

Both pairs perform the identical two-step operation over the identical input
shape — read a repo-relative doc file, throw naming the file when its content
is empty; then, given that text and a `## `-heading, throw naming the file
when the heading is absent, otherwise slice from the heading to the next `\n##
` boundary (or end of text). They differ only in how the file path is resolved
(`path.join(REPO_ROOT, rel)` vs. `fileURLToPath`-based `repoFile(rel)`), the
emptiness test (`text.length === 0` vs. `text.trim().length === 0`), the
heading search (`text.indexOf(heading)` vs. `text.indexOf(\`\n${heading}\n\`)`)
and `section`'s arity (3 params vs. 4, the helper's extra `region` noun used
only inside its own thrown message).

Search run: `grep -n "corpus-reader" tests/for-empty-array-iterand-adjudication.test.ts` → 0 hits, confirming the file does not import the helper it duplicates.

## Why this is a problem
`tests/helpers/corpus-reader.ts`'s own header states its purpose: `repoFile` /
`readCorpus` / `linesOf` "were redefined, byte-for-byte apart from the bug
number named inside the thrown message, in several … spec-gate test files
… This module centralises" that read; the same module also exports `corpus`
and `section` performing the identical read-loudly / scope-to-heading pair the
reviewed file re-declares under the same two names. `git log` shows the
reviewed file predates the helper (first committed 2026-08-22, twelve days
before `corpus-reader.ts` landed on 2026-09-11), so the duplication is an
unmigrated site rather than an independent design: the helper existed for
seven days at review time with no import added to this file.

## Suggested direction (non-binding, optional)
Importing `corpus` and `section` from `tests/helpers/corpus-reader.ts` (adding
the helper's fourth `region` argument to each of this file's own `section(...)`
call sites) is the fit the helper's own stated purpose and export shape
already point to; the file's own per-cell prose assertions are unaffected.

## False-positive check
- Gate-pin check: the file is not named `*gate*.test.ts` and is not one of the
  named gate kin; the cited lines are file-read/section-scope utilities, not a
  pinned count or inventory assertion.
- Recording-double check: `corpus`/`section` read static file bytes and slice
  already-read strings; neither records a call or backs a "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "for-empty-array-iterand-adjudication" docs/bugs/*.md` returns five bug documents (0062, 0127, 0195, 0241) naming this test file as a witness by file name and cell/line count (e.g. "26-cell witness", specific `:293–298` cell ranges); none names or pins the internal `corpus`/`section` helper functions, and none argues for keeping them file-local.
- coverage-matrix/bug-doc citation search: `grep -n "for-empty-array-iterand-adjudication" docs/reference/coverage-matrix.md` → no hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that two already-duplicated utility functions could be imported from the existing helper instead of re-declared.
- git history: `git log --follow --format="%ai" -- tests/helpers/corpus-reader.ts | tail -1` → 2026-09-11; `git log --follow --format="%ai" -- tests/for-empty-array-iterand-adjudication.test.ts | tail -1` → 2026-08-22, confirming the reviewed file predates the helper and was never migrated onto it afterward.
- Prior-wave note: `quality/resolved/PTQ-0547-corpus-section-flat-harness-duplicated.md`'s triage explicitly lists this file's `corpus`/`section` pair, by name, under "Wider-pattern note (not filed)" as recurring the same shape, stating "none of those files are in this wave's reviewed scope, so they are named here as routing context, not filed" — this file is in the present wave's reviewed scope, so the same observation is filed here rather than left unfiled a second time.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce byte-for-byte at tests/for-empty-array-iterand-adjudication.test.ts:70-79 and :87-97 against the exported pair at tests/helpers/corpus-reader.ts:48-71; `grep -n corpus-reader` on the file → 0 hits while 19 sibling test files already import the helper; git dates reproduce (file 2026-08-22, helper 2026-09-11); the fold is mechanical, not behaviour-changing — the file's single `section(...)` call site (:160, `## Array construction` in docs/spec_topics/expressions.md) resolves identically under the helper's stricter `\n${heading}\n` search (expressions.md:222 is exactly `## Array construction\n`, LF-only, no trailing whitespace, not line 1), and the helper's `trim().length === 0` emptiness check is strictly stronger than the local `length === 0`, so no cell's assertion set moves; D7 boilerplate-duplication inside tests/ with no carve-out (not a *gate* file, no recording double, coverage-matrix → 0, docs/bugs 0062/0127/0195/0241 name the file as witness only and this proposes no it()/describe() change); not a duplicate — PTQ-0746/0838/0745 on this file track the srcFiles walker and a census title, and resolved PTQ-0547's triage explicitly left this file unfiled as out of that wave's scope; stray `d4_class: clone` on a D7 filing is extraneous but does not block evaluation (triage: claude-fable-5-1)
