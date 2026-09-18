---
id: PTQ-0547
title: grammar-literal-forbidden-access-naming.test.ts redeclares the corpus/section/flat doc-reading harness its own header names as copied from grammar-trailing-trigger-equals.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/grammar-literal-forbidden-access-naming.test.ts:71-79
  - tests/grammar-literal-forbidden-access-naming.test.ts:87-97
  - tests/grammar-literal-forbidden-access-naming.test.ts:100-102
  - tests/grammar-trailing-trigger-equals.test.ts:60-68
  - tests/grammar-trailing-trigger-equals.test.ts:75-85
  - tests/grammar-trailing-trigger-equals.test.ts:88-90
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# grammar-literal-forbidden-access-naming.test.ts redeclares the corpus/section/flat doc-reading harness its own header names as copied from grammar-trailing-trigger-equals.test.ts

## Observation
`tests/grammar-literal-forbidden-access-naming.test.ts` declares three
module-private harness functions — `corpus(rel)`, `section(text, heading,
rel)` and `flat(text)` — that read a documentation file, region-scope it to a
named `## `-heading, and normalise its whitespace/case for comparison. The
file's own header comment states: "The doc-reading shape, the loud-precondition
readers and this header follow tests/grammar-trailing-trigger-equals.test.ts
(bug 0062's corpus-conformance oracle)." `corpus` and `flat` are byte-identical
to the same-named functions in that named sibling file; `section` differs only
in the one string literal naming which region it scopes to ("forbidden-inside-
a-literal" vs "closed-trigger").

## Evidence
tests/grammar-literal-forbidden-access-naming.test.ts:71-79:
```ts
function corpus(rel: string): string {
  const text = readFileSync(path.join(REPO_ROOT, rel), "utf8");
  if (text.trim().length === 0) {
    throw new Error(
      `harness: ${rel} read empty, so the section this cell scopes to does not exist — a loud failure, never a vacuous pass`,
    );
  }
  return text;
}
```

tests/grammar-trailing-trigger-equals.test.ts:60-68 (byte-identical):
```ts
function corpus(rel: string): string {
  const text = readFileSync(path.join(REPO_ROOT, rel), "utf8");
  if (text.trim().length === 0) {
    throw new Error(
      `harness: ${rel} read empty, so the section this cell scopes to does not exist — a loud failure, never a vacuous pass`,
    );
  }
  return text;
}
```

tests/grammar-literal-forbidden-access-naming.test.ts:87-97:
```ts
function section(text: string, heading: string, rel: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) {
    throw new Error(
      `harness: ${rel} carries no heading ${JSON.stringify(heading)}, so the forbidden-inside-a-literal region this cell scopes to does not exist`,
    );
  }
  const rest = text.slice(start + 1 + heading.length);
  const end = rest.indexOf("\n## ");
  return heading + (end < 0 ? rest : rest.slice(0, end));
}
```

tests/grammar-trailing-trigger-equals.test.ts:75-85 (identical control flow and
signature; only the error-message noun phrase differs, "closed-trigger" in
place of "forbidden-inside-a-literal"):
```ts
function section(text: string, heading: string, rel: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) {
    throw new Error(
      `harness: ${rel} carries no heading ${JSON.stringify(heading)}, so the closed-trigger region this cell scopes to does not exist`,
    );
  }
  const rest = text.slice(start + 1 + heading.length);
  const end = rest.indexOf("\n## ");
  return heading + (end < 0 ? rest : rest.slice(0, end));
}
```

tests/grammar-literal-forbidden-access-naming.test.ts:100-102 and
tests/grammar-trailing-trigger-equals.test.ts:88-90 — `flat`, byte-identical in
both files:
```ts
function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}
```

Search: `grep -n "^function corpus\|^function section(\|^function flat(" tests/grammar-literal-forbidden-access-naming.test.ts tests/grammar-trailing-trigger-equals.test.ts` returns exactly the six sites cited above (one triple per file).

## Why this is a problem
The reviewed file's own header comment identifies `tests/grammar-trailing-
trigger-equals.test.ts` as the source of "the doc-reading shape" it applies to
a different bug's corpus, so the duplication is not an independent
convergence — the author names the specific sibling file the technique came
from while re-declaring it. `corpus` and `flat` are input-only, page-shape-
independent string utilities (read-a-file-loudly, collapse-whitespace) with no
per-file-specific behaviour; `section`'s only per-file variation is the noun
phrase inside its own thrown-error message. Nothing about scoping to a
different heading or a different pair of grammar pages requires a second copy
of these three particular functions.

## Suggested direction (non-binding, optional)
`tests/grammar-trailing-trigger-equals.test.ts` is already the file the
reviewed file's own header comment points to as the technique's source; a
shared home for `corpus`/`section`/`flat` would not need to touch either
file's bug-specific table or bullet readers.

## False-positive check
- Gate-pin check: neither `tests/grammar-literal-forbidden-access-naming.test.ts`
  nor `tests/grammar-trailing-trigger-equals.test.ts` matches `*gate*.test.ts`
  or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the cited lines are pure read/scope/
  normalise utilities, not a pinned count or inventory.
- Recording-double check: `corpus`/`section`/`flat` read static file bytes
  already on disk and project already-read strings; they record no calls and
  back no "never called" witness, so the negative-witness carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rl "grammar-trailing-trigger-equals\|grammar-literal-forbidden-access-naming" docs/bugs/*.md` → docs/bugs/0062-grammar-trailing-trigger-table-omits-equals.md and docs/bugs/0049-grammar-member-access-head-covers-bracket-indexing.md each name only their own witness file, with no rationale in either for keeping the shared read/scope/normalise utilities locally defined per file.
- coverage-matrix/bug-doc citation search: `grep -n "grammar-literal-forbidden-access-naming\|grammar-trailing-trigger-equals" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that three already-named, already-duplicated utility functions could be shared — so no witness-list citation is disturbed.
- git history: `git log -1 --format=%ai` shows `tests/grammar-trailing-trigger-equals.test.ts` created 2026-08-23 12:57:33, and `tests/grammar-literal-forbidden-access-naming.test.ts` created 2026-09-09 18:37:56 — over two weeks later, consistent with the reviewed file's own header naming the earlier file as its source rather than the two having converged independently.
- Wider-pattern note (not filed): the same `corpus`/`section`(/`flat`) shape also recurs, by name, in tests/fn-param-annotation-optional.test.ts, tests/for-empty-array-iterand-adjudication.test.ts, tests/join-element-unresolvable-disposition.test.ts, tests/match-fn-return-lub-dominating-discipline.test.ts, tests/ternary-common-type-trigger-adjudication.test.ts and tests/unresolvable-operand-structural-target-adjudication.test.ts (`grep -rl "function corpus(" tests --include="*.test.ts"` → 8 files total); none of those files are in this wave's reviewed scope, so they are named here as routing context, not filed.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all six excerpts reproduce verbatim at the cited lines (corpus/flat byte-identical, section differing only in the thrown-message noun phrase), the six-site and 8-file greps and the 0-hit coverage-matrix grep reproduce, the copying file's header names tests/grammar-trailing-trigger-equals.test.ts as its source (git add-dates 2026-08-23 12:57 → 21:58 confirm the direction; the candidate's "created 2026-09-09" is the last-modified date, an FP-check slip that does not touch the root cause), neither file imports tests/helpers/corpus-reader.ts whose readCorpus already covers the loud read while no shared section/flat exists, both files are non-gate tests/ sites with no it()/describe() merge proposed, and no existing PTQ (0208/0395 track the repoFile/readCorpus/linesOf trio in b0xxx gates; 0226 is git ls-files discovery; 0270 cites the sibling only as a table-row-reader origin) covers this corpus/section/flat pair (triage: claude-fable-5-1)
