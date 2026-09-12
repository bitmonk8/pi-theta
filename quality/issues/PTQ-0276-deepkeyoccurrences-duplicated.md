---
id: PTQ-0276
title: The `deepKeyOccurrences` JSON deep-key-scan oracle is duplicated byte-for-byte across two binder envelope test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/binder-inference-provider-mapping.test.ts:73-97
  - tests/binder-forced-tool-dispatch.test.ts:384-408
sites: 2
fix_scope: module
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# The `deepKeyOccurrences` JSON deep-key-scan oracle is duplicated byte-for-byte across two binder envelope test files

## Observation
`tests/binder-inference-provider-mapping.test.ts` defines a private
20-line `deepKeyOccurrences(value, key)` function — a recursive deep scan
returning every path at which an object key occurs anywhere in a value — used
to prove the bug-0011 `$ref`/`$defs` inliner leaves no trace of either key in
the attached tool-parameters copy. `tests/binder-forced-tool-dispatch.test.ts`,
the sibling suite pinning the same bug-0011 envelope construction through the
full production wiring, defines a function of the same name with an
identical body; `grep -rln "deepKeyOccurrences" tests/*.ts` returns exactly
these two files.

## Evidence
tests/binder-inference-provider-mapping.test.ts:78-92 (function opening; the
full function runs 78-97):
```ts
function deepKeyOccurrences(value: unknown, key: string): string[] {
  const hits: string[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) {
        hits.push(`${path}.${k}`);
      }
      visit(child, `${path}.${k}`);
```

tests/binder-forced-tool-dispatch.test.ts:389-403 (same opening; the full
function runs 389-408):
```ts
function deepKeyOccurrences(value: unknown, key: string): string[] {
  const hits: string[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) {
        hits.push(`${path}.${k}`);
      }
      visit(child, `${path}.${k}`);
```

Verified over the full functions, not just the shown 15 lines each:
`diff <(sed -n '78,97p' tests/binder-inference-provider-mapping.test.ts)
<(sed -n '389,408p' tests/binder-forced-tool-dispatch.test.ts)` produces no
output — the two 20-line function bodies are byte-for-byte identical. The
preceding doc comments differ in one clause only: line 76
("...on the attachment copy.") versus line 387
("...on the attached parameters.").

## Why this is a problem
A 20-line recursive JSON-traversal utility — the sole oracle either file has
for proving a key is absent everywhere in a nested structure — is carried
twice, with the executable body verified identical by `diff` and only the
trailing clause of its doc comment reworded. `grep -rln "deepKeyOccurrences"
tests/*.ts` confirms exactly these two sites and no others, and no file under
`tests/helpers/` provides a comparable deep-scan utility
(`grep -rl "deepKeyOccurrences" tests/helpers/` is empty). Both call sites use
the function for the identical purpose: proving the bug-0011 inliner leaves
no `$ref`/`$defs` key anywhere in the tool-parameters attachment it builds.

## Suggested direction (non-binding, optional)
A `deepKeyOccurrences`-shaped deep-key scan is a general-purpose JSON oracle
with no dependency on either file's specific fixtures; it belongs beside the
other cross-cutting helpers under `tests/helpers/`, given the two existing
copies are already identical in the part that matters (the traversal logic).

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin.
- Recording-double check: not applicable — `deepKeyOccurrences` inspects a
  static value snapshot; it records no calls and backs no MUST-NOT-called
  witness (the `[]`-means-absent checks it feeds are structural-shape
  assertions, not call-count witnesses).
- docs/bugs/ signature search: `grep -rl "deepKeyOccurrences" docs/bugs/*.md`
  returns no hits — no bug doc discusses this helper or documents a
  correct-reason red for either file. Both files are part of the green
  suite (`tests/binder-inference-provider-mapping.test.ts` passes 58/58 as
  shown in a sibling finding's run); `tests/binder-forced-tool-dispatch.test.ts`
  is described by its own header as carrying intentional RED pins for an
  already-fixed bug (bug 0011), a documented and settled state unrelated to
  this helper.
- coverage-matrix/bug-doc citation search: `grep -n
  "binder-inference-provider-mapping\|binder-forced-tool-dispatch"
  docs/reference/coverage-matrix.md` returns no hits. This finding does not
  propose merging, renaming, or deleting either test file, only that a
  private utility function is currently copied twice, so no citation is
  disturbed.
- Scope: only `tests/binder-inference-provider-mapping.test.ts` is in this
  wave's review scope; `tests/binder-forced-tool-dispatch.test.ts` is cited
  solely as duplication evidence and was not otherwise reviewed.

## Triage
verdict: confirmed — `diff` on the cited ranges (78-97 vs 389-408) is empty, `grep -rln "deepKeyOccurrences" tests/*.ts` finds exactly these two sites with no tests/helpers/ counterpart, neither file is a gate/open-red exemption, and both suites pass at HEAD (58/58, 24/24), so this is a genuine, narrowly-scoped D7 boilerplate-duplication instance, not an established multi-file convention (triage: claude-opus-5)
