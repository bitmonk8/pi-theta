---
id: PTQ-0752
title: tests/inventory-closure-audit.test.ts and tests/inventory-closure-audit-gate.test.ts redeclare identical TYPEBOX allow-list constants and DISCRIMINATOR_SHAPE regex
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inventory-closure-audit.test.ts:28-33
  - tests/inventory-closure-audit-gate.test.ts:29-34
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# tests/inventory-closure-audit.test.ts and tests/inventory-closure-audit-gate.test.ts redeclare identical TYPEBOX allow-list constants and DISCRIMINATOR_SHAPE regex

## Observation
Both `tests/inventory-closure-audit.test.ts` (the paired V18b-T core-behaviour
suite) and `tests/inventory-closure-audit-gate.test.ts` (the disk-walk `npm
test` gate) declare the same three module-scope constants, byte-for-byte:
`TYPEBOX_NAMED_IMPORT_ALLOW_LIST`, `TYPEBOX_MEMBER_ACCESS_ALLOW_LIST`, and the
`DISCRIMINATOR_SHAPE` regex (each carries its own near-identical one-line doc
comment). Both files pass all three into every `runInventoryClosureAudit(...)`
call site in their own file, and both use `DISCRIMINATOR_SHAPE` to assert the
`audit/<class>/<family>/<symptom>` structural shape on emitted records.

## Evidence
tests/inventory-closure-audit.test.ts:28-33:
```ts
const TYPEBOX_NAMED_IMPORT_ALLOW_LIST = ["Type"] as const;
const TYPEBOX_MEMBER_ACCESS_ALLOW_LIST = ["Unsafe"] as const;

/** The `audit/<class>/<family>/<symptom>` structural shape (audit-failures.md). */
const DISCRIMINATOR_SHAPE =
  /^audit\/(violation|infra|canary)\/[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;
```

tests/inventory-closure-audit-gate.test.ts:29-34:
```ts
const TYPEBOX_NAMED_IMPORT_ALLOW_LIST = ["Type"] as const;
const TYPEBOX_MEMBER_ACCESS_ALLOW_LIST = ["Unsafe"] as const;

/** `audit/<class>/<family>/<symptom>` structural shape (audit-failures.md). */
const DISCRIMINATOR_SHAPE =
  /^audit\/(violation|infra|canary)\/[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;
```

Exact search: `grep -n "TYPEBOX_NAMED_IMPORT_ALLOW_LIST\|TYPEBOX_MEMBER_ACCESS_ALLOW_LIST\|DISCRIMINATOR_SHAPE" tests/inventory-closure-audit-gate.test.ts tests/inventory-closure-audit.test.ts` — both constants and the regex are each declared exactly once per file (2 declaration sites total per identifier) and then read at every one of that file's own `runInventoryClosureAudit`/`toMatch` call sites (gate file: consumed at lines 87-88, 156-157, 140, 191, 233; core file: consumed at lines 42-43, 92, 160, 194, 273). No import between the two files exists (`grep -n "from \"./inventory-closure-audit"` in either file returns no hit), and no shared `tests/helpers/` module exports any of the three identifiers (`grep -rn "TYPEBOX_NAMED_IMPORT_ALLOW_LIST\|DISCRIMINATOR_SHAPE" tests/helpers/` returns no hit).

## Why this is a problem
The two files audit the exact same production surface (`runInventoryClosureAudit`, `src/extension/inventory-closure-audit.ts`) from two angles — the paired failing-test core suite and its `npm test`-side disk-walk gate — and each keeps its own copy of the allow-lists the production function accepts as input and the regex that pins the wire shape of its output. A change to either the typebox allow-list scope or the discriminator's structural grammar (both spec-derived, per the files' own comments citing audit-resolution.md and audit-failures.md) requires editing the same three declarations in two places to stay in sync; nothing enforces that the two copies match beyond both authors having typed the same literal.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently exports these three inventory-closure-audit-specific constants; a shared module analogous to the file pair's own header comments (each cites the other as its counterpart) is where a reader would look first, given the two files already read as a deliberately paired core/gate set.

## False-positive check
- Gate-pin check: `tests/inventory-closure-audit-gate.test.ts` matches
  `*gate*.test.ts`; the cited lines are plain constant/regex declarations, not
  a pinned count or corpus inventory assertion — the gate carve-out protects
  pinned counts (e.g. this same file's `FAMILY_4_FIXTURES`/`FAMILY_5_FIXTURES`
  arrays and the census counts in the sibling `interpolation-parse-diagnostics.test.ts`),
  not arbitrary constant duplication, so it does not shield this finding.
- Recording-double check: neither constant is a recording double; not
  applicable.
- docs/bugs/ signature search: `grep -n "TYPEBOX\|DISCRIMINATOR_SHAPE"
  docs/bugs/*.md` returns no hit — this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "inventory-closure-audit" docs/reference/coverage-matrix.md` returns no hit
  for either file by name; no merge/rename/delete of any cited cell is
  proposed by this finding, and none is implied.
- Coverage check: this finding is about a duplicated constant/regex
  DECLARATION, not a missing test path or a suite-composition opinion.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts match byte-for-byte at the cited lines (28-33 / 29-34); grep across src/, extensions/, tools/, tests/, docs/ finds exactly 2 declarations per identifier (the cited pair), no tests/helpers/ export, no cross-import, production only declares the parameter (inventory-closure-audit.ts:84-86) never the values; both copies are live (5 consumer sites each) and landed as a same-day core/gate pair (604d22c5 / 123f0398); the *gate*.test.ts carve-out protects pinned counts, not input constants and an assertion regex; no docs/bugs or coverage-matrix citation; no prior store entry on the test-side pair (PTQ-0350/PTQ-0416 are src-side D9) — a D7 copy-paste duplication with a mechanical dedupe (triage: claude-fable-5-1)
