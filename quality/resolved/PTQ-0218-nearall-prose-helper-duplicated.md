---
id: PTQ-0218
title: b0091's matchIndices/nearAll spec-prose-proximity helper is retyped verbatim into two more conformance-oracle test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0091-rule1-ascii-terminator-closure-gate.test.ts:126-153
  - tests/b0266-category6-string-literal-rationale-gate.test.ts:82-108
  - tests/b0269-params-type-quoted-scalar-rule-gate.test.ts:191-213
sites: 3
fix_scope: module
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# b0091's matchIndices/nearAll spec-prose-proximity helper is retyped verbatim into two more conformance-oracle test files

## Observation
tests/b0091-rule1-ascii-terminator-closure-gate.test.ts defines module-scope `matchIndices(text, needle)` and `nearAll(text, anchor, tokens, window)` functions that find every regex match in a spec-page string and test whether a set of tokens all occur within a character window of an anchor match. The same two functions, same bodies, same parameter order, recur in tests/b0266-category6-string-literal-rationale-gate.test.ts and tests/b0269-params-type-quoted-scalar-rule-gate.test.ts. tests/b0266-category6-string-literal-rationale-gate.test.ts's own header states its cells are written "in the pattern of tests/b0091-rule1-ascii-terminator-closure-gate.test.ts", naming the file it copied from.

## Evidence
tests/b0091-rule1-ascii-terminator-closure-gate.test.ts:126-153:
```ts
function matchIndices(text: string, needle: RegExp): number[] {
  const re = new RegExp(
    needle.source,
    needle.flags.includes("g") ? needle.flags : `${needle.flags}g`,
  );
  const out: number[] = [];
  for (const m of text.matchAll(re)) out.push(m.index ?? 0);
  return out;
}

function nearAll(
  text: string,
  anchor: RegExp,
  tokens: readonly RegExp[],
  window = 400,
): boolean {
  return matchIndices(text, anchor).some((at) => {
    const slice = text.slice(Math.max(0, at - window), at + window);
    return tokens.every((t) => t.test(slice));
  });
}
```

tests/b0266-category6-string-literal-rationale-gate.test.ts:20-22 — the header comment naming its source file:
```ts
// WHAT THIS FILE ASSERTS. Two cells, in the pattern of
// tests/b0091-rule1-ascii-terminator-closure-gate.test.ts — one prose cell over
// the committed page, one behavioural cell that keeps the prose claim
```

tests/b0266-category6-string-literal-rationale-gate.test.ts:82-98 — the same two functions, byte-identical to b0091's `matchIndices` and functionally identical `nearAll` (same signature, same body):
```ts
function matchIndices(text: string, needle: RegExp): number[] {
  const re = new RegExp(
    needle.source,
    needle.flags.includes("g") ? needle.flags : `${needle.flags}g`,
  );
  const out: number[] = [];
  for (const m of text.matchAll(re)) out.push(m.index ?? 0);
  return out;
}

/**
 * True when some occurrence of `anchor` in `text` has every one of `tokens`
 * within `window` characters on either side. A proximity window stands in for
 * "in the same clause" without demanding a sentence-splitting heuristic.
 */
```

tests/b0269-params-type-quoted-scalar-rule-gate.test.ts:191-213 — `matchIndices` byte-identical again; `nearAll` has begun to drift from the same starting point (default `window` 500 instead of 400, JSDoc reworded from "in the same clause" to "in the same region"):
```ts
function matchIndices(text: string, needle: RegExp): number[] {
  const re = new RegExp(
    needle.source,
    needle.flags.includes("g") ? needle.flags : `${needle.flags}g`,
  );
  const out: number[] = [];
  for (const m of text.matchAll(re)) out.push(m.index ?? 0);
  return out;
}

/**
 * True when some occurrence of `anchor` carries every one of `tokens` within
 * `window` characters either side. A proximity window stands in for "in the
 * same region" without demanding a sentence-splitting heuristic.
 */
function nearAll(
```

Exact search: `grep -rl "^function matchIndices(text: string, needle: RegExp): number\[\] {" tests --include="*.test.ts"` → exactly these three files (`tests/b0091-rule1-ascii-terminator-closure-gate.test.ts`, `tests/b0266-category6-string-literal-rationale-gate.test.ts`, `tests/b0269-params-type-quoted-scalar-rule-gate.test.ts`); no other file matches.

## Why this is a problem
This is the "Boilerplate duplication" class: a self-contained, parameterised text-analysis pair with no dependency on any one bug's fixtures is retyped into each new spec-conformance-oracle file rather than shared. The duplication is documented by the authors rather than accidental — b0266's header names b0091 as the file whose pattern it followed — and b0269's copy has already begun to diverge on its own axis (the default `window` moved from 400 to 500 and the JSDoc's "in the same clause" became "in the same region"), which is the shape near-identical-but-unshared copies take once no single copy is authoritative. `tests/helpers/` holds no text-proximity module for these three files to import instead.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting `matchIndices`/`nearAll` is the home the files' own citation chain (b0266 naming b0091 by path) already points at; this names where the copies already lead, not a design for the extraction.

## False-positive check
- Gate-pin carve-out: all three files match `*gate*.test.ts`, but the cited functions are generic text-proximity utilities operating on an arbitrary string, not a pinned count or inventory assertion — the carve-out's stated scope ("pinned counts and inventories") does not cover this citation.
- Recording-double carve-out: `matchIndices`/`nearAll` operate on a string read from a spec page; neither is a recording double over a call; not applicable.
- docs/bugs/ signature search: `docs/bugs/0091-rule1-set-excludes-u2028-u2029-line-breaks.md` Status "fixed (0.257.0)"; `docs/bugs/0266-placeholder-rendering-b-string-literal-parenthetical-false.md` Status "fixed (0.260.0)"; `docs/bugs/0269-frontmatter-fields-a-params-type-side-silent-on-quoted-scalar-rule.md` Status "fixed (0.263.0)". `npx vitest run tests/b0091-rule1-ascii-terminator-closure-gate.test.ts tests/b0266-category6-string-literal-rationale-gate.test.ts tests/b0269-params-type-quoted-scalar-rule-gate.test.ts` passes all 12 tests at HEAD, so none of the three is a documented correct-reason red.
- coverage-matrix / bug-doc citation search: `grep -n "b0091-rule1-ascii-terminator-closure-gate\|b0266-category6-string-literal-rationale-gate\|b0269-params-type-quoted-scalar-rule-gate" docs/reference/coverage-matrix.md` returns no hits. This finding does not propose merging, renaming or deleting any of the three files — only that the shared pair could be imported rather than retyped — so the citation carve-out does not bind.

## Triage
verdict: confirmed — matchIndices/nearAll are verified verbatim/near-verbatim across all three cited line ranges (matchIndices byte-identical, nearAll drifting: window 400→500, "same clause"→"same region"), the b0266 header's "in the pattern of" b0091 citation and the exact-signature grep (3/3 files, no others) reproduce exactly, tests/helpers/ has no such module, all 12 tests pass at HEAD, and no PTQ entry covers this pair (triage: claude-opus-5)
