---
id: pending
title: The FM/TAIL frontmatter constants and body() fixture builder are redeclared byte-identically across the two bug-0130/bug-0093 let-annotation test files
lens: D7
status: intake
verdict: pending
locations:
  - tests/let-annotation-inline-object-compat.test.ts:213-219
  - tests/let-annotation-query-double-emission.test.ts:96-101
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The FM/TAIL frontmatter constants and body() fixture builder are redeclared byte-identically across the two bug-0130/bug-0093 let-annotation test files

## Observation
Both files declare a private `FM` constant holding the identical
`"---\nmode: prompt\n---\n"` frontmatter string, a private `TAIL` constant
holding the identical `"let a = 1\na\n"` tail-expression string, and a private
`body(stmt)` function whose implementation is character-for-character
identical: `` `${FM}${stmt}\n${TAIL}` ``. Only the doc-comment wording above
`body` differs between the two files.

## Evidence
tests/let-annotation-inline-object-compat.test.ts:213-219:
```ts
const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` followed by a tail expression. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}
```

tests/let-annotation-query-double-emission.test.ts:96-101:
```ts
const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` on line 4, followed by the tail. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}
```

Search: `grep -n "^const FM\|^const TAIL\|^function body" tests/let-annotation-inline-object-compat.test.ts tests/let-annotation-query-double-emission.test.ts` → the four matching declarations shown above are the only two sites in this review's scope; the third file, `tests/let-annotation-recorded-binding-type.test.ts`, uses an unrelated `FRONTMATTER`-array + `codesOf(body)` shape and is not part of this clone.

## Why this is a problem
The two constants plus the one-line function are reproduced verbatim between
the two files (2 sites), each independently re-deriving the same `mode:
prompt` + tail-expression fixture shape the pair's own comments say is
measured against the same bug reproduction convention
(`tests/helpers/e2e-s1.ts`'s `parseDoc` harness, imported identically by both).
`let-annotation-query-double-emission.test.ts` additionally builds a
`blockBody(lines)` variant over the same `FM`/`TAIL` pair, which has no twin
in the other file, so the clone is confined to the `FM`/`TAIL`/`body` triad
itself.

## Suggested direction (non-binding, optional)
A small shared fixture helper exporting the `mode: prompt` frontmatter
constant and a `body(stmt)` (and optionally `blockBody(lines)`) builder under
`tests/helpers/` would give both files one source for this triad; naming it
is a fix-stage decision, not this observation's.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` naming; not applicable.
- Recording-double check: `FM`/`TAIL`/`body` build source strings, not a
  recording double or MUST-NOT witness; not applicable.
- docs/bugs/ signature search: both files are live, documented-bug test files
  (0130, 0093) with correct-reason-red cells elsewhere, but the duplication
  cited here is the shared fixture-builder triad, unrelated to either bug's
  pinned red cells or failure signature.
- coverage-matrix/bug-doc citation search: `grep -rn "let-annotation-inline-object-compat\|let-annotation-query-double-emission" docs/reference/coverage-matrix.md docs/bugs/` found no hits citing either file by name; no merge/rename/delete is proposed here regardless — only the shared triad is named.
- Confirmed the duplication is confined to test code (tests/) only.

## Triage
verdict: questionable — clone independently verified (both excerpts match at tests/let-annotation-inline-object-compat.test.ts:213-219 and tests/let-annotation-query-double-emission.test.ts:96-101, byte-identical FM/TAIL/body bar the doc-comment; in-scope D7 copy-paste fixture, no gate/recording-double/coverage-matrix carve-out applies), but the accounting mis-sizes it: the identical FM/TAIL/`${FM}${stmt}\n${TAIL}` triad recurs in 12 test files repo-wide (grep -F 'const TAIL = "let a = 1\na\n"' tests/ → 14 files, 12 with the same body(stmt) implementation) and the bare FM literal in 112, so `sites: 2 / localized` describes a two-file slice of a repo-wide three-line fixture; same-wave intake d7-66 already names this triad as part of a nine-helper superset harness for two of those 12 files, and four sibling shards (REVIEW_LOG shard-15/93/124/134) deliberately left the FM constant unfiled as too thin — whether minting a tests/helpers prompt-fixture module for a three-line fixture is worth the churn (and the fold-in with d7-66) is a human ruling, not a mechanical dedupe (triage: claude-fable-5-1)
