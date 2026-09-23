---
id: PTQ-1504
title: reserved-keyword-remaining-identifier-positions.test.ts hand-rolls the standard-frontmatter FM literal its own reviewed sibling already imports from prompt-value-harness
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reserved-keyword-remaining-identifier-positions.test.ts:214-215
  - tests/reserved-keyword-misfire-faces.test.ts:5
  - tests/helpers/prompt-value-harness.ts:99
sites: 2
fix_scope: localized
wave: qw20260923185337
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# reserved-keyword-remaining-identifier-positions.test.ts hand-rolls the standard-frontmatter FM literal its own reviewed sibling already imports from prompt-value-harness

## Observation
`tests/reserved-keyword-remaining-identifier-positions.test.ts` declares its
own module-scope `FM` constant holding the standard `.theta` frontmatter
literal. `tests/helpers/prompt-value-harness.ts` already exports the
byte-identical `FM` constant, and this review's other in-scope file,
`tests/reserved-keyword-misfire-faces.test.ts`, already imports it from
there rather than declaring its own.

## Evidence
`tests/reserved-keyword-remaining-identifier-positions.test.ts:214-215`:
```ts
/** Frontmatter for every `.theta` row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: prompt\n---\n";
```

`tests/reserved-keyword-misfire-faces.test.ts:5` — the sibling file's import
line, already sourcing the identical constant:
```ts
import { FM } from "./helpers/prompt-value-harness";
```

`tests/helpers/prompt-value-harness.ts:99` — the canonical export:
```ts
export const FM = "---\nmode: prompt\n---\n";
```

Exact search: `grep -n '^const FM = "---' tests/reserved-keyword-misfire-faces.test.ts
tests/reserved-keyword-remaining-identifier-positions.test.ts` → 1 hit, in
the in-scope file only; the sibling file carries no local `FM` declaration
because it imports the canonical one.

## Why this is a problem
The in-scope file restates a frontmatter literal its own reviewed sibling
already imports from a shared helper module under the identical name and
identical value, with no local variation (both files' `FM` is used the same
way, as the fixed three-line prefix every `theta()` wrapper prepends to its
body). A change to the standard prompt frontmatter every row in both files
parses under has to be hand-applied at this file's declaration site as well
as at every other file across the suite that separately hand-rolls the same
literal.

## Suggested direction (non-binding, optional)
`tests/reserved-keyword-misfire-faces.test.ts` already shows the shape:
`import { FM } from "./helpers/prompt-value-harness"` in place of the local
`const FM = "---\nmode: prompt\n---\n";` declaration.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not a census/pin gate.
- Recording-double check: `FM` is a frontmatter string literal, not a fake,
  double, or MUST-NOT witness.
- docs/bugs/ signature search: `grep -rl 'FM = "---' docs/bugs/*.md` →
  1 hit (`docs/bugs/0220-...md`), prose describing the same literal in an
  unrelated bug write-up, not a documented correct-reason red naming either
  test file's `FM` declaration.
- coverage-matrix/bug-doc citation search: `grep -n
  "reserved-keyword-remaining-identifier-positions" docs/reference/coverage-matrix.md`
  → 0 hits; no merge, rename, or deletion of the file or any `it()`/
  `describe()` is proposed — only that the local `FM` declaration could
  import the already-exported constant its sibling file already imports.
- Prior-filing search: `grep -rl '^const FM = "---' quality/issues
  quality/resolved quality/intake` (before this filing) → the only prior hit
  naming this exact literal is the resolved PTQ-1351, which targeted a
  different file pair in this test family
  (`reserved-keyword-inline-object-and-literal-keys.test.ts` and
  `tests/reserved-keyword-misfire-faces.test.ts`) and whose fix is what left
  the in-scope file's sibling importing the canonical constant; this filing
  names the one file in the present review's scope that PTQ-1351 did not
  cover and that is still unmigrated. This literal also recurs, independently
  derived, across roughly eighty other test files project-wide — no claim is
  made about that wider population; this filing is scoped to the fact that
  the in-scope file's own reviewed sibling already imports the exact-named
  canonical `FM` this file re-derives.

## Triage
verdict: confirmed — all three excerpts reproduce exactly (remaining-identifier-positions:214-215 local `const FM = "---\nmode: prompt\n---\n"`, used by theta() at :219 and the sweep source builders at :286-296; misfire-faces:5 `import { FM } from "./helpers/prompt-value-harness"`; prompt-value-harness.ts:99 byte-identical export), the stated grep gives 1 hit in the in-scope file only, and the live canonical export is already imported by 4 test files incl. the reviewed sibling, so this is D7 boilerplate duplication with a mechanical import-swap fix and no test merge/rename/delete; no gate, recording-double, docs/bugs or coverage-matrix carve-out applies; not a duplicate — resolved PTQ-1351 migrated only the inline-object/misfire-faces pair, PTQ-1322 the fn-param pair, PTQ-0887 session-control's fm(), and same-wave d7-04 (sweep harness) cites the builders that use `${FM}` but not this FM declaration; the literal also stands in ~81 test files, and this filing is openly scoped to one of them, following the PTQ-1351/1322 precedent (triage: claude-opus-5-5)
