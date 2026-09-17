---
id: PTQ-0494
title: refNames $ref-walker function is byte-identical across four lowering test files with no shared helper
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/annotation-root-brace-union-lowering.test.ts:483-506
  - tests/inline-object-nested-lowering.test.ts:601-624
  - tests/params-brace-union-rhs-lowering.test.ts:563-586
  - tests/union-generic-arm-lowering.test.ts:394-417
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# refNames $ref-walker function is byte-identical across four lowering test files with no shared helper

## Observation
`tests/annotation-root-brace-union-lowering.test.ts` declares a module-level
`function refNames(value: unknown): string[]` — a recursive walker that
collects every `#/$defs/<name>` pointer anywhere in a lowered schema document,
used by its own `expectRefsClosed` helper to assert that every `$ref` a
document emits has a matching `$defs` entry. Three sibling lowering-family
test files (`inline-object-nested-lowering.test.ts`,
`params-brace-union-rhs-lowering.test.ts`, `union-generic-arm-lowering.test.ts`)
each declare the identical 24-line function body under the identical name, and
no `tests/helpers/*.ts` file exports `refNames` or `expectRefsClosed`.

## Evidence

`tests/annotation-root-brace-union-lowering.test.ts:483-506`:
```ts
function refNames(value: unknown): string[] {
  const names: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (key === "$ref" && typeof child === "string") {
        const match = /^#\/\$defs\/(.+)$/.exec(child);
        if (match?.[1] !== undefined) {
          names.push(match[1]);
        }
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return names;
}
```

`diff` verdict against the three siblings, each re-read immediately before
filing:
- `tests/inline-object-nested-lowering.test.ts:601-624` — byte-identical
  (`diff` produces no output).
- `tests/params-brace-union-rhs-lowering.test.ts:563-586` — byte-identical.
- `tests/union-generic-arm-lowering.test.ts:394-417` — byte-identical.

Exact search: `grep -rl "function refNames" tests/*.test.ts` → exactly these
four files. `grep -rn "refNames\|expectRefsClosed" tests/helpers/*.ts` → 0
hits — no helper module exports either name.

## Why this is a problem
The same 24-line recursive AST walker, under the same name, doing the same
one job (collect `#/$defs/<name>` pointers so a caller can diff them against
a document's own `$defs` keys), is typed out four separate times across the
lowering-family test files rather than imported once. `tests/helpers/` is
this repository's established home for exactly this kind of test-only
oracle/walker (e.g. `tests/helpers/canonical-slug-oracle.ts`, already imported
by the reviewed file for a comparable independent-oracle role), and none of
the four sites needs a file-local variant: the function signature, body, and
purpose are identical in all four.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting `refNames` (and, if its three call sites'
`expectRefsClosed` wrappers also prove identical, `expectRefsClosed` itself)
is the natural home the four sites' verbatim duplication points to, alongside
the existing `tests/helpers/canonical-slug-oracle.ts` this same file already
imports for its independent-oracle role.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named
  kin; the cited lines are a data-shape walker, not a pinned count or
  inventory.
- Recording-double check: `refNames` records no call and backs no
  "never called" assertion; it is a pure collector over a value, not a
  recording double.
- docs/bugs/ signature search: `grep -rl "annotation-root-brace-union-lowering"
  docs/bugs/*.md` finds the file cited by docs/bugs/0053 (and by 0095/0096/
  0097/0099/0102/0134/0179/0184/0292 for unrelated shift-citation reasons);
  each citation is for the union-lowering behaviour under test, not for the
  `refNames`/`expectRefsClosed` helper's internal mechanics, so this is not a
  documented correct-reason artefact.
- coverage-matrix/bug-doc citation search: `grep -n
  "annotation-root-brace-union-lowering\|inline-object-nested-lowering\|params-brace-union-rhs-lowering\|union-generic-arm-lowering"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any of the four files or any `it()`/
  `describe()` — only that the four identical `refNames` definitions could
  import a shared helper — so no citation is affected.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; `refNames` is exercised by every `expectRefsClosed` call
  in each of the four files.
- Overlap check: grepped `quality/intake`, `quality/resolved`, `quality/issues`
  for `refNames` and `refnames` — 0 hits; no existing PTQ tracks this
  duplication.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: extracted the four cited 24-line spans (annotation-root-brace-union :483-506, inline-object-nested :601-624, params-brace-union-rhs :563-586, union-generic-arm :394-417) and `diff` is empty for all three siblings against the first; `grep -rl "function refNames" tests/` → exactly these four files, `grep refNames|expectRefsClosed tests/helpers/` → 0 hits, no refNames in src/extensions/tools; every copy is live (expectRefsClosed called 8/12/11/7 times respectively); none of the four is a *gate* test, a recording double, or cited by docs/reference/coverage-matrix.md; not tracked by resolved PTQ-0410 (same files but the slugOfCanonicalForm/inlineDefName/compareCodePoint/assertKeysSorted oracle, not refNames) nor PTQ-0276 (deepKeyOccurrences, different walker in different files) — tests/-only copy-paste helper, D7 boilerplate-duplication class, mechanical dedupe into tests/helpers/ (triage: claude-fable-5-1)
