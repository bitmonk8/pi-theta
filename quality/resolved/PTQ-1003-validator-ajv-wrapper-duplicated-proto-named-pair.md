---
id: PTQ-1003
title: validator() AjvSchemaValidator-construction wrapper is redeclared byte-for-byte in both proto-named-binder-write-sites.test.ts and proto-named-record-write-sites.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/proto-named-binder-write-sites.test.ts:100-103
  - tests/proto-named-record-write-sites.test.ts:138-141
  - tests/helpers/proto-named-harness.ts:1-15
sites: 2
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# validator() AjvSchemaValidator-construction wrapper is redeclared byte-for-byte in both proto-named-binder-write-sites.test.ts and proto-named-record-write-sites.test.ts

## Observation
Both `tests/proto-named-binder-write-sites.test.ts` and
`tests/proto-named-record-write-sites.test.ts` — the same bug-0210/0214
`__proto__`-named-field lineage that already shares `jsonSlug`, `hasOwn`,
`prototypeReport`, `range`, and `loweredParams` through
`tests/helpers/proto-named-harness.ts` (resolved PTQ-0730/PTQ-0671/PTQ-0923) —
each declare their own module-scope `validator(): AjvSchemaValidator`
function with an identical one-line body and an identical doc comment,
rather than adding one more export to the shared harness module both files
already import.

## Evidence

`tests/proto-named-binder-write-sites.test.ts:100-103`:
```ts
/** A real AJV validator (the `V8c` seam), configured exactly as production is. */
function validator(): AjvSchemaValidator {
  return new AjvSchemaValidator({ emit: () => {}, slugOf: jsonSlug });
}
```

`tests/proto-named-record-write-sites.test.ts:138-141` (identical body and
doc comment):
```ts
/** A real AJV validator (the `V8c` seam), configured exactly as production is. */
function validator(): AjvSchemaValidator {
  return new AjvSchemaValidator({ emit: () => {}, slugOf: jsonSlug });
}
```

Both files already import `jsonSlug` from the shared module (`import {
jsonSlug, hasOwn, prototypeReport, loweredParams, type Field } from
"./helpers/proto-named-harness"` in the binder file; the equivalent import in
the record-write-sites file), so `validator()`'s one dependency is already in
scope through that shared import in both files.

Exact search: `grep -n "^function validator" tests/proto-named-binder-write-sites.test.ts tests/proto-named-record-write-sites.test.ts` returns exactly these two declarations, one per file, byte-identical bodies and doc comments.

## Why this is a problem
Both files already cross the `tests/helpers/proto-named-harness.ts` module
boundary for five other primitives in this exact function's dependency chain
(`jsonSlug` is `validator()`'s only free variable), so nothing structural
stands between the two files and a sixth shared export. Each file instead
redeclares the identical one-line wrapper under the same name and the same
doc comment, so a change to how the suite configures a real
`AjvSchemaValidator` (e.g. a different `emit` sink) has two
hand-synchronised copies to keep in step in a pair that already migrated
every one of its other shared primitives to a single source.

## Suggested direction (non-binding, optional)
Adding `validator` as a sixth export of `tests/helpers/proto-named-harness.ts`
(next to `jsonSlug`, which it wraps) is the natural extension of the module
both files already import from for this exact lineage.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or a named gate
  kin; the cited lines are a validator-construction helper, not a pinned
  count or inventory assertion.
- Recording-double carve-out: `validator()` constructs a REAL
  `AjvSchemaValidator` for positive schema-compilation/validation behaviour,
  not a recording double backing a "never called" MUST-NOT witness; not
  applicable.
- docs/bugs/ signature search: `grep -n "^function validator" docs/bugs/0210-remaining-record-writes-reach-the-prototype-slot.md docs/bugs/0214-defaulting-and-inference-drop-the-proto-named-key.md` → 0 hits; neither bug doc names this wrapper or gives a rationale for not sharing it.
- coverage-matrix/bug-doc citation search: `grep -n
  "proto-named-binder-write-sites\|proto-named-record-write-sites"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` block in either
  file, and touches no RED/CONTROL/source-sync pin cell — only where the
  shared `validator()` wrapper is declared.
- Prior-filing search: `grep -rl "^function validator" quality/issues
  quality/intake quality/resolved` → 0 hits naming this exact wrapper;
  resolved PTQ-0730/PTQ-0671/PTQ-0923 cover `hasOwn`/`prototypeReport`/
  `jsonSlug`/`range`/`loweredParams` in this same file pair (all since
  migrated to `tests/helpers/proto-named-harness.ts`, confirmed by the
  current imports in both files), but none of those three tickets' evidence
  or locations cite `validator()`; a third, out-of-scope file
  (`tests/proto-named-schema-validator-enforcement.test.ts:126`) carries the
  identical `validator()` body too, but is outside this review's scope and
  not cited as a location here.
- Coverage check: the claim is about a duplicated helper-function
  DEFINITION already reachable through an existing shared-module import in
  both files; every cell that calls `validator()` in either file passes at
  HEAD.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (doc comment + body) at tests/proto-named-binder-write-sites.test.ts:100-103 and tests/proto-named-record-write-sites.test.ts:138-141, both copies are live (binder: `compiledFor` :118; record: :760, :867, :902), both files already import `jsonSlug` from tests/helpers/proto-named-harness (binder :15, record :26) so the wrapper's only free variable is in scope via the shared module, git shows sequential authoring (0210 witness cea6665f 2026-08-20 → 0214 witness 16ab2c58 2026-08-21, a copy not a coincidence), stated docs/bugs 0210/0214 and coverage-matrix greps → 0 reproduce, `^function validator` → exactly 3 files in tests/, all under tests/, no gate/recording-double/red-test/merge-rename-delete carve-out applies, and the pair is green (26/26); two corrections for ticketing: (a) the FP-check's claim that tests/proto-named-schema-validator-enforcement.test.ts:126 carries the "identical" body is wrong — that copy's `emit` THROWS rather than no-ops, so it is a different double and `sites: 2` is the correct count; (b) an exported byte-identical builder already exists at tests/helpers/scripted-live-session-harness.ts:112 `ajv()` (and a local `makeValidator()` at tests/params-defaults.test.ts:71), so the fix stage should pick the shared home in coordination with open PTQ-0971 (`realAjvValidator` ×12), PTQ-0749 and PTQ-0931 rather than necessarily minting a sixth proto-named-harness export; not a duplicate — resolved PTQ-0671/PTQ-0730/PTQ-0923 name `validator()` only as `jsonSlug`'s consumer and none of the open AJV-builder tickets cite this pair (triage: claude-fable-5-1)
