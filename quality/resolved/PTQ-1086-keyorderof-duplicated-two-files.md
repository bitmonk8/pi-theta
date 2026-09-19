---
id: PTQ-1086
title: keyOrderOf is declared byte-identically in generic-argument-literal-lowering.test.ts and union-arm-literal-const-lowering.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/generic-argument-literal-lowering.test.ts:313-340
  - tests/union-arm-literal-const-lowering.test.ts:395-422
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# keyOrderOf is declared byte-identically in generic-argument-literal-lowering.test.ts and union-arm-literal-const-lowering.test.ts

## Observation
`tests/generic-argument-literal-lowering.test.ts` declares a module-scope
`function keyOrderOf(value, pointer)` that walks a parsed JSON-like value and
records each object's own key order by JSON Pointer, used throughout the
file's byte/key-order-parity assertions.
`tests/union-arm-literal-const-lowering.test.ts` — a sibling literal-lowering
bug-family file, not exported from `tests/helpers/` — declares the same
function under the same name with an identical body, differing only in the
wording of its doc comment.

## Evidence
`tests/generic-argument-literal-lowering.test.ts:313-340` (re-read
immediately before filing):
```ts
/**
 * Every object's OWN key order inside `value`, keyed by JSON Pointer. `toEqual`
 * cannot see key order and order is contractual here: `respondSchemaSlug`
 * (src/runtime/typed-query-validation.ts:354) hashes `JSON.stringify(lowered)`
 * and the `__inline_<slug>` mint hashes the canonical form of the same
 * fragment, so two positions agreeing on the key SET and disagreeing on the
 * order would mint two names for one declared value set. `type` before `enum`
 * is what schema-subset.md:80 spells (bug 0056 §Fix *Ordering*).
 */
function keyOrderOf(
  value: unknown,
  pointer = "",
): ReadonlyArray<readonly [string, readonly string[]]> {
  const out: Array<readonly [string, readonly string[]]> = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => out.push(...keyOrderOf(item, `${pointer}/${index}`)));
    return out;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    out.push([pointer === "" ? "/" : pointer, keys]);
    for (const key of keys) {
      out.push(...keyOrderOf((value as Record<string, unknown>)[key], `${pointer}/${key}`));
    }
    return out;
  }
  return out;
}
```

`tests/union-arm-literal-const-lowering.test.ts:395-422`:
```ts
/**
 * Every object's OWN key order inside `value`, keyed by JSON Pointer. `toEqual`
 * cannot see key order and order is contractual here: `respondSchemaSlug`
 * (src/runtime/typed-query-validation.ts:354) hashes `JSON.stringify(lowered)`
 * and the `__inline_<slug>` mint hashes the canonical form of the same
 * fragment, so two positions agreeing on the key SET and disagreeing on the
 * order would mint two names for one declared value set (bug 0056 §Fix
 * *Ordering*).
 */
function keyOrderOf(
  value: unknown,
  pointer = "",
): ReadonlyArray<readonly [string, readonly string[]]> {
  const out: Array<readonly [string, readonly string[]]> = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => out.push(...keyOrderOf(item, `${pointer}/${index}`)));
    return out;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    out.push([pointer === "" ? "/" : pointer, keys]);
    for (const key of keys) {
      out.push(...keyOrderOf((value as Record<string, unknown>)[key], `${pointer}/${key}`));
    }
    return out;
  }
  return out;
}
```

The function bodies (13 statement lines each, from `const out: Array<...>`
through the trailing `return out;`) are character-for-character identical;
only the doc comment's second-to-last sentence differs in wording and
paragraph break. Exact search: `grep -rn "function keyOrderOf" tests/*.ts
tests/helpers/*.ts` → exactly these two hits, no `tests/helpers/` export of
this name.

## Why this is a problem
A ten-plus-line recursive JSON-pointer key-order walker, used by both files
for the identical purpose (proving key order agrees across positions because
both `respondSchemaSlug` and the `__inline_<slug>` mint are key-order-
sensitive hashes), is typed out a second time rather than shared, even
though the two files are adjacent members of the same literal-lowering bug
family and both need exactly this walk for exactly this reason. A change to
how key order is captured or rendered (for example widening the pointer
encoding) would need to be applied by hand at both sites to stay in
agreement.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module for this literal-lowering bug family (the
same family `tests/helpers/canonical-slug-oracle.ts` and
`tests/helpers/triage-fixture.ts` already serve) is the natural home one
`keyOrderOf` export could occupy for both current call sites.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin;
  not applicable.
- Recording-double check: `keyOrderOf` is a pure structural walk over a
  parsed value, not a recording double backing a MUST-NOT-called witness;
  not applicable.
- docs/bugs/ signature search: `grep -rl "keyOrderOf" docs/bugs/*.md` → 0
  hits; no documented correct-reason red discusses this duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "generic-argument-literal-lowering\|union-arm-literal-const-lowering"
  docs/reference/coverage-matrix.md` → 0 hits for both files.
  `docs/bugs/0164-generic-argument-literal-lowers-permissive.md` cites the
  in-scope file only by cell name (`d10`), never by the `keyOrderOf` helper;
  this finding proposes no merge, rename, or deletion of any `it()`/
  `describe()` block or cell, only that the identical walker be shared
  rather than redeclared.
- Overlap check: `grep -rli "keyOrderOf" quality/issues/*.md
  quality/resolved/*.md` → 0 hits; no prior finding names this duplication.
- Coverage-drift check: this claim is about a repeated function DEFINITION
  performing identical work in two files, not about a missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at the cited lines (:313-340 and :395-422); a mktemp sed-range `diff` of the two function bodies (:322-340 vs :404-422) is empty, i.e. byte-identical, with only the doc comment's last sentence differing; `grep -rl keyOrderOf src extensions tools tests` → exactly these two files (12 and 10 live references respectively, so both copies are live), no `tests/helpers/` export or any other key-order walker exists (`grep -rn "keyOrder" tests/helpers/` → 0); docs/bugs `keyOrderOf` grep → 0 hits, coverage-matrix grep for both file stems → 0 hits, neither file is a *gate* kin, the walker is a pure structural helper not a recording double, and no test is proposed for merge/rename/deletion, so no D7 carve-out binds; the only store rows pairing these two files are PTQ-0666-03 (DECLS/TRIAGE_DEF/yamlQuoted, different files actually), PTQ-0793 (a key-SORT canonicaliser vs `assertKeysSorted`, different files and mechanism) and same-wave d7-02 (the `ajv()` builder at :364-374/:450-459), none of which names `keyOrderOf` — root cause is untracked; class = D7 copy-paste helper duplication in tests/, fix is a mechanical extraction to a shared tests/helpers module (triage: claude-fable-5-1)
