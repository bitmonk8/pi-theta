---
id: PTQ-1076
title: inline-object-nested-lowering.test.ts declares the same one-entry triageMap() resolution-map fixture twice, in two separate describe blocks
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-nested-lowering.test.ts:1312-1315
  - tests/inline-object-nested-lowering.test.ts:1417-1420
sites: 2
fix_scope: localized
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inline-object-nested-lowering.test.ts declares the same one-entry triageMap() resolution-map fixture twice, in two separate describe blocks

## Observation
`describe("bug 0039 (f) — the shared lowerers themselves", ...)` declares a
local helper `triageMap()` that returns a one-entry
`ReadonlyMap<string, Record<string, unknown>>` mapping `"Triage"` to the
imported `TRIAGE_DEF` fixture. Sixty-four lines later,
`describe("bug 0039 (g) — the hoist's retention, ...", ...)` declares a
function of the identical name, identical signature and byte-identical body,
differing only in its doc-comment wording. Both are used to resolve the
declared name `Triage` when driving `lowerTypeSource` / `hoistInlineObjectType`
directly, and both are called multiple times inside their own describe block.

## Evidence
`tests/inline-object-nested-lowering.test.ts:1312-1315` (re-read immediately
before filing):
```ts
describe("bug 0039 (f) — the shared lowerers themselves", () => {
  /** The resolution map every fixture here resolves `Triage` against. */
  function triageMap(): ReadonlyMap<string, Record<string, unknown>> {
    return new Map<string, Record<string, unknown>>([["Triage", TRIAGE_DEF]]);
  }
```

`tests/inline-object-nested-lowering.test.ts:1417-1420` (re-read immediately
before filing):
```ts
  /** The declared resolution map every fixture here resolves names against. */
  function triageMap(): ReadonlyMap<string, Record<string, unknown>> {
    return new Map<string, Record<string, unknown>>([["Triage", TRIAGE_DEF]]);
  }
```

Exact search: `grep -n "function triageMap" tests/inline-object-nested-lowering.test.ts`
→ exactly the two hits cited above; both are called multiple times in their
own scope (`grep -n "triageMap()" tests/inline-object-nested-lowering.test.ts`
→ lines 1320, 1340, 1359 for the first declaration's callers and line 1449
for the second's, all inside their respective describe blocks).

## Why this is a problem
The two declarations are the same fixture — a single-entry resolution map for
the name `Triage` against the already-imported `TRIAGE_DEF` constant — typed
out a second time in the same file rather than shared. Nothing distinguishes
the two describe blocks' need for this map: both use it to resolve `Triage`
while probing the same `lowerTypeSource`/`hoistInlineObjectType` seam, one
directly and one through the hand-built `LowerCtx` in the `seam()` helper.
This is the in-file boilerplate-duplication shape (cf. the
`makeOrderRecordingPi` / inline `pi` literal pattern already ruled confirmed
for the same class in this store): a second author of the file could have
called the first declaration instead of retyping it.

## Suggested direction (non-binding, optional)
A single module-level `triageMap()` (or a shared constant, since the map's
contents never vary) above both describe blocks is the natural single
declaration this file's own structure points to.

## False-positive check
Not a `*gate*.test.ts` file or kin, so the census/pin-gate carve-out does not
apply. `triageMap()` returns a resolution map read by the lowerer under test,
not a recording double asserting a MUST-NOT-call witness, so the
recording-double carve-out does not apply. docs/bugs/ signature search:
`grep -rn "triageMap" docs/bugs/*.md` → 0 hits, so this is not a documented
correct-reason red. Coverage-matrix/bug-doc citation search:
`grep -n "inline-object-nested-lowering" docs/reference/coverage-matrix.md`
→ 0 hits; no test named by this finding is cited by name in the coverage
matrix or in a bug doc's witness list, so no merge/rename/delete concern
applies. Overlap check: `grep -rl "triageMap" quality/intake quality/issues
quality/resolved` → 0 hits before this filing, so no existing candidate or
resolved issue already tracks this pair. This finding does not propose or
imply that any coverage is missing — both declarations already exist and are
already exercised; the observation is limited to the duplicate declaration,
not the tests that call it.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/inline-object-nested-lowering.test.ts:1312-1315 and :1417-1420, mktemp sed-range diff of the two function bodies (:1313-1315 vs :1418-1420) is byte-identical, `grep -n "function triageMap"` → exactly those 2 hits, tests/helpers/triage-fixture.ts exports only TRIAGE_DEF/BODY (no map builder to migrate to), no other tests/ file declares a triageMap so this is a pure in-file copy-paste fixture; both copies are live (accounting correction: the (g) copy has 3 callers at :1449, :1757, :1796 — the describe spans :1408-1803 — not the 1 the candidate counted, immaterial to the root cause); no carve-out binds (not a *gate* file, not a recording double, docs/bugs grep for triageMap → 0, coverage-matrix grep → 0); the existing rows on this file (PTQ-0879 loadCleanly, PTQ-1001 unresolvedMessage, PTQ-1029 expectRefsClosed, PTQ-0691 loweredAnnotation, resolved PTQ-0653 TRIAGE_DEF constant) name different helpers, so not a duplicate; fix is the mechanical hoist of one declaration to module level (triage: claude-fable-5-1)
