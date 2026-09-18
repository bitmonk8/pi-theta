---
id: PTQ-1008
title: the inert sendMessage/getActiveTools/setActiveTools pi triple inside producer() is retyped identically in prompt-value-harness.ts, runtime-belt-probe-harness.ts's own producer(), and again in its driveInvoke()
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/helpers/prompt-value-harness.ts:39-43
  - tests/helpers/runtime-belt-probe-harness.ts:90-94
  - tests/helpers/runtime-belt-probe-harness.ts:283-287
sites: 3
fix_scope: module
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# the inert sendMessage/getActiveTools/setActiveTools pi triple inside producer() is retyped identically in prompt-value-harness.ts, runtime-belt-probe-harness.ts's own producer(), and again in its driveInvoke()

## Observation
`tests/helpers/prompt-value-harness.ts` exports `producer(opts)`, which builds
an inert `ExtensionAPI` triple (`sendMessage`/`getActiveTools`/`setActiveTools`,
all no-ops) before calling `createProductionProducerDeps`.
`tests/helpers/runtime-belt-probe-harness.ts` exports its own, differently
named-but-identically-shaped `producer(root)`, whose `pi` object is the same
three-key triple, byte-for-byte. The same triple is retyped a third time,
inside `runtime-belt-probe-harness.ts` itself, as the `pi` local in
`driveInvoke()`.

## Evidence
`tests/helpers/prompt-value-harness.ts:39-43`:
```ts
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
```

`tests/helpers/runtime-belt-probe-harness.ts:90-94` (`producer()`'s `pi`,
identical field order, identical arrow bodies):
```ts
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
```
A `diff` of the two five-line spans above is empty — the two blocks are
byte-identical.

`tests/helpers/runtime-belt-probe-harness.ts:283-287` (`driveInvoke()`'s
`pi`, same three keys and the same no-op bodies, spelled as a local `const`
with explicit `void` return annotations rather than an inline property):
```ts
    const pi = {
      sendMessage: (): void => {},
      getActiveTools: (): string[] => [],
      setActiveTools: (): void => {},
    } as unknown as ExtensionAPI;
```

## Why this is a problem
`createProductionProducerDeps`'s `pi` parameter is only ever satisfied, in
either of these two files, by the identical three-method inert stand-in; the
`as unknown as ExtensionAPI` cast means nothing in the type system requires
this exact shape — it is retyped by hand at each of the three sites rather
than shared. `prompt-value-harness.ts` already imports from
`runtime-belt-probe-harness.ts`'s sibling module (`fixture-dispatch-harness.ts`,
for `rootWith`) but not from `runtime-belt-probe-harness.ts` itself, so the
already-exported `producer` there is not reached from
`prompt-value-harness.ts`, and `runtime-belt-probe-harness.ts`'s own
`driveInvoke()` does not reuse its neighbouring `producer()`'s `pi` literal
either.

## Suggested direction (non-binding, optional)
A single exported `noopProducerPi(): ExtensionAPI` returning this three-key
triple, referenced from both `producer()` implementations and from
`driveInvoke()`, is the shape all three sites already converge on; the fix
stage owns whether the two `producer()` exports themselves are also worth
consolidating.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; both are `tests/helpers/` modules, not census/pin tests.
- Recording-double check: the `pi` triple is a pure no-op stand-in wired for
  a positive execution path (satisfying `createProductionProducerDeps`'s
  parameter shape), not a recorder backing a MUST-NOT-be-called witness; the
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "getActiveTools: () => \[\]" docs/bugs/` → 0 hits; no documented correct-reason red cites this literal.
- coverage-matrix/bug-doc citation search: `grep -n "prompt-value-harness\|runtime-belt-probe-harness" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block or of either helper file — only that the repeated `pi` literal be shared — so no pinned citation is disturbed.
- Overlap check: `grep -rl "prompt-value-harness" quality/intake quality/issues quality/resolved` returns `PTQ-0846` (fixed's triage nit already notes `runtime-belt-probe-harness.ts` exports "a byte-identical producer()", but that observation was folded into PTQ-0846's evidentiary nits about `blockexpr-production.test.ts`, not filed as its own root cause comparing the two helper files) and the now-resolved `PTQ-0862` (which covers `rootDouble`/`rootWith`, the `root:` field, not the `pi:` field this finding is about). Neither prior filing compares these two `producer()` exports' `pi` triples directly, and this is not a coverage claim — every cited site is live, exercised code.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/helpers/prompt-value-harness.ts:39-43, runtime-belt-probe-harness.ts:90-94 and :283-287 (first two byte-identical, third differs only by explicit `: void`/`: string[]` return annotations); both helper modules are live (5 / 19 importing test files, b0316/b0368/b0369 suites 62/62 green); all locations under tests/, D7 copy-paste-double class, neither file is gate kin, the `pi` is an inert positive-path stand-in (no recording-double carve-out), docs/bugs (0) and coverage-matrix (0) greps reproduce, no it()/describe() merge/rename/delete proposed; not a duplicate — PTQ-0846 (open) cites the byte-identical `producer()` only as a nit strengthening blockexpr's own migration, PTQ-0862 (fixed) covered the `root:` field via rootWith, same-wave d7-07 covers this file's checkpoint/rootWith copies, and no tracked row names the `pi:` triple in either helper; one FP-check omission that strengthens rather than refutes: the filing's proposed `noopProducerPi()` already exists — tests/helpers/call-with-clause-harness.ts:173-179 exports `noopPi()` returning exactly this sendMessage/getActiveTools/setActiveTools triple (`readonly string[]` only), imported by 3+ test files and importing nothing from either cited helper (no cycle), so the fix is a mechanical three-site import swap; note for the ledger, not refuting the two-helper root cause the title scopes to: a perl multi-line scan finds the same inline triple 31× across 30 tests/ files, most already tracked under the per-file rootDouble/producer rows (PTQ-0209/0816/0846/0873/0883) whose migrations carry their `pi` along, and the store's per-file convention treats the residual helper-module copies as a distinct root cause (triage: claude-fable-5-1)
