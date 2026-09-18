---
id: PTQ-1029
title: expectRefsClosed wrapper redeclared byte-for-byte in four lowering test files even though the walker it calls was already centralised
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-nested-lowering.test.ts:597-604
  - tests/annotation-root-brace-union-lowering.test.ts:483-490
  - tests/params-brace-union-rhs-lowering.test.ts:551-558
  - tests/union-generic-arm-lowering.test.ts:395-402
  - tests/helpers/canonical-slug-oracle.ts:52-70
sites: 4
fix_scope: cross-module
d4_class: clone
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# expectRefsClosed wrapper redeclared byte-for-byte in four lowering test files even though the walker it calls was already centralised

## Observation
`tests/helpers/canonical-slug-oracle.ts` exports `refNames(value)`, a
recursive `#/$defs/<name>` pointer collector. All four lowering-family test
files — including the in-scope `tests/inline-object-nested-lowering.test.ts`
— already import `refNames` from that module (resolved PTQ-0494's fix). Each
of the same four files nonetheless still declares its own module-scope
`expectRefsClosed(label, document)` function, a thin wrapper that calls the
now-shared `refNames` and asserts the missing-target list is empty. Three of
the four wrappers are byte-identical; the fourth (`union-generic-arm-lowering`)
differs only in its failure-message wording. No `tests/helpers/*.ts` module
exports `expectRefsClosed` itself.

## Evidence

`tests/inline-object-nested-lowering.test.ts:597-604` (re-read immediately
before filing; the file's own import line 25 pulls `refNames` from the shared
module):
```ts
function expectRefsClosed(label: string, document: LoweredSchema): void {
  const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
  const missing = [...new Set(refNames(document))].filter((name) => !(name in defs));
  expect(
    missing,
    `${label}: every \`#/$defs/<name>\` pointer must have a fragment at the document root, or AJV refuses the whole document with MissingRefError; document=${JSON.stringify(document)}`,
  ).toEqual([]);
}
```

`tests/annotation-root-brace-union-lowering.test.ts:483-490` — byte-identical:
```ts
function expectRefsClosed(label: string, document: LoweredSchema): void {
  const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
  const missing = [...new Set(refNames(document))].filter((name) => !(name in defs));
  expect(
    missing,
    `${label}: every \`#/$defs/<name>\` pointer must have a fragment at the document root, or AJV refuses the whole document with MissingRefError; document=${JSON.stringify(document)}`,
  ).toEqual([]);
}
```

`tests/params-brace-union-rhs-lowering.test.ts:551-558` — byte-identical
(only the parameter type is widened from `LoweredSchema` to
`Record<string, unknown>`):
```ts
function expectRefsClosed(label: string, document: Record<string, unknown>): void {
  const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
  const missing = [...new Set(refNames(document))].filter((name) => !(name in defs));
  expect(
    missing,
    `${label}: every \`#/$defs/<name>\` pointer must have a fragment at the document root, or AJV refuses the whole document with MissingRefError; document=${JSON.stringify(document)}`,
  ).toEqual([]);
}
```

`tests/union-generic-arm-lowering.test.ts:395-402` — same body, shorter
message:
```ts
function expectRefsClosed(label: string, document: LoweredSchema): void {
  const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
  const missing = [...new Set(refNames(document))].filter((name) => !(name in defs));
  expect(
    missing,
    `${label}: every \`#/$defs/<name>\` pointer must resolve at the document root; document=${JSON.stringify(document)}`,
  ).toEqual([]);
}
```

`tests/helpers/canonical-slug-oracle.ts:52-70` — the already-shared `refNames`
each of the four wrappers calls:
```ts
export function refNames(value: unknown): string[] {
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

Exact search: `grep -rln "^function expectRefsClosed" tests/*.test.ts` →
exactly these four files. `grep -rn "expectRefsClosed" tests/helpers/*.ts` →
0 hits — no helper exports the wrapper. All four `refNames` imports resolve
to `./helpers/canonical-slug-oracle` (confirmed by `grep -n "refNames"` in
each of the four files' import lines). `npx vitest run` over the four files
→ 216/216 passed, so every copy is live.

## Why this is a problem
Resolved PTQ-0494 moved `refNames` itself — the 24-line recursive walker — out
of these same four files and into `tests/helpers/canonical-slug-oracle.ts`,
closing the duplication on that function. The one-line-of-logic wrapper built
directly on top of the now-shared walker was left in place at all four
sites, three of them byte-identical down to the failure-message wording. A
change to how the missing-`$ref` check is phrased, or to what it compares
against, would need the identical edit repeated at three (or, loosening
message wording, four) sites, with nothing signalling a copy left behind —
the same shape PTQ-0494 already established for the walker it wraps.

## Suggested direction (non-binding, optional)
An `expectRefsClosed` export beside `refNames` in
`tests/helpers/canonical-slug-oracle.ts` would give each of the four files
one shared assertion to import instead of independently retyping the same
`missing`/`toEqual([])` check around the walker they already share.

## False-positive check
- Gate-pin check: none of the four files matches `*gate*.test.ts` or the
  named gate kin; `ls tests/*gate*.test.ts | grep -Ei "nested-lowering|brace-union|generic-arm"` → 0 hits.
- Recording-double check: `expectRefsClosed` computes a missing-pointer list
  from an already-built document value and asserts it is empty; it records
  no calls and backs no "never called" witness, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "inline-object-nested-lowering\|annotation-root-brace-union-lowering\|params-brace-union-rhs-lowering\|union-generic-arm-lowering" docs/bugs/*.md`
  returns docs/bugs/0039, 0043, 0045, 0053, 0054, 0055, 0056, 0095, 0096,
  0097, 0099, 0102, 0103, 0134, 0164, 0165, 0179, 0184, 0204, 0292 — every
  hit cites one of the four files by name as a behavioural witness for its
  own subject (e.g. 0039 for the nested-inline-object lowering under test);
  none names or depends on `expectRefsClosed`'s internal shape, and none
  states a rationale for the wrapper being retyped at each site rather than
  shared.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-nested-lowering\|annotation-root-brace-union-lowering\|params-brace-union-rhs-lowering\|union-generic-arm-lowering" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any file
  or `it()`/`describe()` — only that the four identical `expectRefsClosed`
  definitions could import a shared export beside the `refNames` they
  already share.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; each copy is exercised by every `expectRefsClosed(...)`
  call in its own file (8/12/11/7 call sites respectively per resolved
  PTQ-0494's count of the same four files).
- Prior-filing overlap check: `grep -rl "expectRefsClosed" quality/issues/*.md quality/intake/*.md`
  → 0 hits before this filing; `grep -rl "expectRefsClosed" quality/resolved/*.md`
  finds only PTQ-0494, whose own Evidence/locations cite `refNames`'s 24-line
  body at each site and whose landed fix migrated only that function — its
  own "Suggested direction" flagged `expectRefsClosed` as a candidate "if …
  proved identical" but did not file or fix it, so this is the residual that
  fix left behind, not a re-filing of PTQ-0494's closed claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `grep -rln "^function expectRefsClosed" tests/*.test.ts` → exactly the four cited files at :597/:483/:551/:395, mktemp sed-range diff shows inline-object-nested ≡ annotation-root-brace-union byte-identical, params-brace-union-rhs differs only in the parameter type (`Record<string, unknown>` vs `LoweredSchema`), union-generic-arm differs only in the failure-message string; every copy is live (expectRefsClosed called 12/8/11/7 times respectively — the candidate's 8/12/11/7 is PTQ-0494's ordering, same multiset), all four import `refNames` from ./helpers/canonical-slug-oracle (:25/:17/:17/:16) whose export sits at :56-79, and `grep expectRefsClosed tests/helpers/` → 0 hits; none is a *gate* test or recording double, coverage-matrix.md → 0 hits, the helper's header rationale ("honesty checks remain in each test file") concerns hand-written canonical forms, not this assertion wrapper; resolved PTQ-0494 (fixed) migrated only `refNames` and its own Suggested direction explicitly deferred `expectRefsClosed`, and `grep expectRefsClosed quality/issues quality/resolved` finds no other row — tests/-only boilerplate duplication left behind by that fix, mechanical dedupe into the same helper (triage: claude-fable-5-1)
