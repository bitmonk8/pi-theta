---
id: PTQ-0730
title: proto-named-binder-write-sites.test.ts's hasOwn/prototypeReport pair is redeclared byte-for-byte in two sibling proto-named-*.test.ts files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/proto-named-binder-write-sites.test.ts:117-136
  - tests/proto-named-record-write-sites.test.ts:177-196
  - tests/proto-named-schema-validator-enforcement.test.ts:196-199
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# proto-named-binder-write-sites.test.ts's hasOwn/prototypeReport pair is redeclared byte-for-byte in two sibling proto-named-*.test.ts files

## Observation
`tests/proto-named-binder-write-sites.test.ts` declares module-scope `hasOwn(target, key)` and `prototypeReport(target)` helpers used throughout its bug-0214 `__proto__`-named-field cells to distinguish an own key from a prototype-chain read and to render a record's prototype for a failure message. `tests/proto-named-record-write-sites.test.ts` (same bug-0214 lineage, a different write site) declares the identical `hasOwn` function body and the identical `prototypeReport` function body (only its doc-comment's illustrative clause differs). `tests/proto-named-schema-validator-enforcement.test.ts` (the third sibling in the lineage) declares the identical `hasOwn` body only.

## Evidence

`tests/proto-named-binder-write-sites.test.ts:117-136`:
```ts
/** Whether `key` is an OWN key of `target` — never a prototype-chain read. */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * How a record's prototype reads back: the sentinel string for
 * `Object.prototype`, else the prototype's own JSON. The sentinel keeps the
 * failure diff legible — the object-default cell prints the DEFAULT VALUE here
 * at HEAD, which is the whole symptom.
 */
function prototypeReport(target: object): string {
  const proto = Object.getPrototypeOf(target);
  if (proto === Object.prototype) {
    return "Object.prototype";
  }
  if (proto === null) {
    return "null";
  }
  return JSON.stringify(proto);
}
```

`tests/proto-named-record-write-sites.test.ts:177-196` (byte-identical function bodies; only the `prototypeReport` doc-comment's illustrative clause differs):
```ts
/** Whether `key` is an OWN key of `target` — never a prototype-chain read. */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * How a properties table's prototype reads back: the sentinel string for
 * `Object.prototype`, else the prototype's own JSON. The sentinel keeps the
 * failure diff legible — at HEAD these cells print the FIELD'S OWN LOWERED
 * SCHEMA NODE, which is the whole symptom.
 */
function prototypeReport(target: object): string {
  const proto = Object.getPrototypeOf(target);
  if (proto === Object.prototype) {
    return "Object.prototype";
  }
  if (proto === null) {
    return "null";
  }
  return JSON.stringify(proto);
}
```

`tests/proto-named-schema-validator-enforcement.test.ts:196-199` (the `hasOwn` half only):
```ts
/** Whether `key` is an OWN key of `target` — never a prototype-chain read. */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}
```

Verification performed during this review: `grep -n "^function hasOwn\|^function prototypeReport" tests/proto-named-*.test.ts` locates exactly these three declarations of `hasOwn` and these exactly two declarations of `prototypeReport`; the function bodies (five lines for `hasOwn`, eleven for `prototypeReport`) are identical character-for-character across every site cited, confirmed by direct comparison of the `sed`-extracted blocks.

## Why this is a problem
Three files in the same bug-0214 `__proto__`-named-field lineage (`proto-named-binder-write-sites`, `proto-named-record-write-sites`, `proto-named-schema-validator-enforcement`) each declare their own copy of the same own-key-membership test and the same prototype-rendering helper rather than importing one shared declaration. No `tests/helpers/` module holds either function today, even though the same doc-comment wording ("never a prototype-chain read") is retyped at each site.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting `hasOwn`/`prototypeReport` (parameterised, where needed, by the illustrative clause in `prototypeReport`'s doc comment) would sit alongside the bug-0214 lineage's other cross-file conventions (e.g. the shared `Field`/`loweredParams` shape each file also independently re-derives against its own `parseParams` call).

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the named gate kin; the cited lines are small utility predicates, not a pinned count or inventory assertion.
- Recording-double check: `hasOwn`/`prototypeReport` are pure read-only predicates over a plain object, not recording doubles and not "never called" witnesses; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "proto-named-binder-write-sites\|proto-named-record-write-sites\|proto-named-schema-validator-enforcement" docs/bugs/` finds `docs/bugs/0214-defaulting-and-inference-drop-the-proto-named-key.md`, the shared subject bug all three files pin their RED cells against; the doc discusses the `__proto__`-drop defect at each write site, not this helper-duplication shape. All three files are documented correct-reason reds for their own PRIMARY assertions (per this doc), but that carve-out covers the RED-pin cells, not this separate claim about a duplicated non-assertion utility function.
- coverage-matrix/bug-doc citation search: `grep -n "proto-named-binder-write-sites\|proto-named-record-write-sites\|proto-named-schema-validator-enforcement" docs/reference/coverage-matrix.md` → 0 hits pinning these two helper functions by name. This finding proposes no merge, rename or deletion of any `it()`/`describe()`, and does not touch any of the files' RED-pin cells or their bug-0214 provenance.
- Coverage check: the claim is about a duplicated utility-function DEFINITION; every cell in all three files exercises its own copy successfully (or reds for the documented bug-0214 reason, unrelated to this claim).

## Triage
verdict: confirmed — independently re-verified: all five declarations sit at the cited lines (hasOwn 118/178/197, prototypeReport 128/188), sed-extracted bodies diff byte-identical (only prototypeReport's doc-comment clause differs), every copy is live (hasOwn 5/6/4 and prototypeReport 5/3 call sites), no tests/helpers/ module exports either (the only other hasOwn is production src/seams/schema-validator.ts:99, out of D7's reach), git shows sequential copying (cea6665f 2026-08-20 → e3470433 and 16ab2c58 2026-08-21), coverage-matrix has 0 hits and the four docs/bugs/ citations cover only the RED-pin cells; no gate/recording-double carve-out applies and no open/resolved PTQ tracks it — the hasOwn half partially overlaps same-wave sibling qw20260917154546-d7-124-01-proto-named-witness-pair-shared-harness-duplicated.md (already confirmed, two files, no prototypeReport), so fold both into one shared helper at acceptance rather than mint two PTQs (triage: claude-fable-5-1)
