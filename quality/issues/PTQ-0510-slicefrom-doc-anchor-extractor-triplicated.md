---
id: PTQ-0510
title: sliceFrom's anchor-to-endPattern doc-prose extractor is redeclared byte-identical in three test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/match-fn-return-lub-dominating-discipline.test.ts:183-198
  - tests/ternary-common-type-trigger-adjudication.test.ts:131-146
  - tests/unresolvable-operand-structural-target-adjudication.test.ts:350-365
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# sliceFrom's anchor-to-endPattern doc-prose extractor is redeclared byte-identical in three test files

## Observation
`tests/match-fn-return-lub-dominating-discipline.test.ts`,
`tests/ternary-common-type-trigger-adjudication.test.ts`, and
`tests/unresolvable-operand-structural-target-adjudication.test.ts` each
declare a module-scope `function sliceFrom(page, text, startAnchor,
endPattern)` that finds `startAnchor` in `text`, throws a "harness:
… no longer contains the anchor …" error naming `page` and the anchor when
absent, and otherwise slices from the anchor to the next match of
`endPattern` (or end of string). The three declarations are identical
statement-for-statement; the only difference across all three is one word in
the thrown message ("sentence" vs "paragraph"). None of the three files
imports the other two, and no shared module under `tests/helpers/` exports
this function — `tests/helpers/spec-prose-proximity.ts`, the nearest existing
shared doc-prose helper, exports a proximity-window matcher (`matchIndices`/
`nearAll`), a different extraction shape than an anchor-to-endPattern slice.

## Evidence
tests/match-fn-return-lub-dominating-discipline.test.ts:183-198 (in scope):
```ts
function sliceFrom(
  page: string,
  text: string,
  startAnchor: string,
  endPattern: RegExp,
): string {
  const start = text.indexOf(startAnchor);
  if (start < 0) {
    throw new Error(
      `harness: ${page} no longer contains the anchor ${JSON.stringify(startAnchor)}, so this cell cannot locate the sentence it governs — re-anchor the cell rather than letting it pass over an empty slice`,
    );
  }
  const rest = text.slice(start);
  const end = rest.slice(startAnchor.length).search(endPattern);
  return end < 0 ? rest : rest.slice(0, startAnchor.length + end);
}
```

tests/ternary-common-type-trigger-adjudication.test.ts:131-146 — identical
statement-for-statement:
```ts
function sliceFrom(
  page: string,
  text: string,
  startAnchor: string,
  endPattern: RegExp,
): string {
  const start = text.indexOf(startAnchor);
  if (start < 0) {
    throw new Error(
      `harness: ${page} no longer contains the anchor ${JSON.stringify(startAnchor)}, so this cell cannot locate the sentence it governs — re-anchor the cell rather than letting it pass over an empty slice`,
    );
  }
  const rest = text.slice(start);
  const end = rest.slice(startAnchor.length).search(endPattern);
  return end < 0 ? rest : rest.slice(0, startAnchor.length + end);
}
```

tests/unresolvable-operand-structural-target-adjudication.test.ts:350-365 —
identical except the thrown message says "paragraph" instead of "sentence":
```ts
function sliceFrom(
  page: string,
  text: string,
  startAnchor: string,
  endPattern: RegExp,
): string {
  const start = text.indexOf(startAnchor);
  if (start < 0) {
    throw new Error(
      `harness: ${page} no longer contains the anchor ${JSON.stringify(startAnchor)}, so this cell cannot locate the paragraph it governs — re-anchor the cell rather than letting it pass over an empty slice`,
    );
  }
  const rest = text.slice(start);
  const end = rest.slice(startAnchor.length).search(endPattern);
  return end < 0 ? rest : rest.slice(0, startAnchor.length + end);
}
```

Exact search: `grep -rn "^function sliceFrom" tests/*.test.ts` → exactly these
three files, one declaration each. `grep -rl "function sliceFrom" tests/helpers`
→ no hits; no helper module exports this function.

## Why this is a problem
This is the "Boilerplate duplication" class: a 16-line doc-anchor-to-boundary
extractor, including its thrown-error wording, is repeated as a unit across
three files instead of being imported once. All three call sites use it for
the same purpose — slicing one governed sentence/paragraph out of a spec or
reference page read off disk so a conformance cell can assert on exactly that
span — which is the shape a shared `tests/helpers/` module (the convention
`spec-prose-proximity.ts` and `corpus-reader.ts` already establish for
neighbouring doc-prose and corpus-read concerns) would hold as one export
rather than three re-derivations.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting `sliceFrom` (parameterising the "sentence"
vs "paragraph" word in the thrown message, or leaving it as a fixed word since
it only affects the error text) is the natural home the existing `spec-prose-
proximity.ts` and `corpus-reader.ts` helpers already establish a convention
for; naming this is an observation of where the duplicated code already
points, not a design for the extraction.

## False-positive check
- Gate-pin carve-out: none of the three files match `*gate*.test.ts` or the
  named gate-kin patterns, and this finding does not touch a pinned
  count/inventory; not applicable.
- Recording-double carve-out: `sliceFrom` is a pure string extractor, not a
  fake/double, and backs no "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -l "sliceFrom" docs/bugs/*.md` → no
  hits; none of the three files' `sliceFrom` declarations is cited as a
  documented correct-reason red, and this finding does not propose that any
  of the three files is red.
- coverage-matrix/bug-doc citation search: `grep -n "match-fn-return-lub-
  dominating-discipline\|ternary-common-type-trigger-adjudication\|
  unresolvable-operand-structural-target-adjudication"
  docs/reference/coverage-matrix.md` → no hits in any of the three names;
  this finding proposes no merge, rename, or deletion of any test — only that
  the shared `sliceFrom` function could be imported once instead of
  redeclared three times.
- Coverage check: the claim is entirely about a repeated harness-function
  DEFINITION already exercised by every cell in each file (each file's own
  group (A)/adjudication cells call it); no coverage/untested-path claim is
  made.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all three `function sliceFrom` declarations exist at the cited lines (183-198 / 131-146 / 350-365) and are live (4/6/4 call sites per file); a mktemp diff shows copies 1 and 2 byte-identical and copy 3 differing only by "sentence"→"paragraph" in the throw message; `grep -rn "function sliceFrom" tests/` → exactly those three, `sliceFrom` absent from tests/helpers, src/, extensions/, tools/, and none of the three imports another; tests/helpers/spec-prose-proximity.ts exports only matchIndices/nearAll (a different shape); no gate/recording-double carve-out applies, and although docs/bugs 0144/0155/0158 name these files as witnesses the finding proposes no merge/rename/delete; the three files landed in three separate same-day commits (8cf9ea7d, 515b3a3f, 4782e5bf) so this is copy-forward drift, the D7 boilerplate-duplication class; not tracked in quality/issues or quality/resolved (sibling qw20260917154546-d7-13 covers the distinct `corpus(relative)` helper) (triage: claude-fable-5-1)
