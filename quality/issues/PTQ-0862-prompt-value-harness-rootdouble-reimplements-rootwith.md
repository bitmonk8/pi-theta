---
id: PTQ-0862
title: prompt-value-harness.ts's local rootDouble() reimplements fixture-dispatch-harness.ts's exported rootWith(SEAM_NOOP_CHECKPOINT) call shape
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/prompt-value-harness.ts:19-27
  - tests/helpers/fixture-dispatch-harness.ts:154-164
locations_note: both files are canonical tests/helpers/ modules within this review's scope
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# prompt-value-harness.ts's local rootDouble() reimplements fixture-dispatch-harness.ts's exported rootWith(SEAM_NOOP_CHECKPOINT) call shape

## Observation
`tests/helpers/fixture-dispatch-harness.ts` exports `rootWith(checkpoint,
invocationId = "inv-1", clock?)`, a `RuntimeRoot` builder whose default
arguments already produce `{ checkpoint, idSource: { newInvocationId: () =>
"inv-1", newToolCallId: () => "tc-1" } }` when called with only a checkpoint.
`tests/helpers/prompt-value-harness.ts` imports the checkpoint that shape
needs (`SEAM_NOOP_CHECKPOINT` from `invoke-seam-scaffold.ts`, aliased
`NOOP_CHECKPOINT`) but does not import `rootWith`; instead it declares its
own file-local `rootDouble()` whose return object is the same shape,
by-value, as `rootWith(SEAM_NOOP_CHECKPOINT)`'s result.

## Evidence
`tests/helpers/fixture-dispatch-harness.ts:154-164` (the canonical,
already-exported builder, its two-argument default producing the exact
shape below):
```ts
export function rootWith(
  checkpoint: Checkpoint,
  invocationId = "inv-1",
  clock?: Clock,
): RuntimeRoot {
  return {
    checkpoint,
    idSource: { newInvocationId: () => invocationId, newToolCallId: () => "tc-1" },
    ...(clock === undefined ? {} : { clock }),
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/prompt-value-harness.ts:19-27` (the import that omits
`rootWith`, and the local reimplementation of its default-argument result):
```ts
import { parseTheta } from "./e2e-s1";
import { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./invoke-seam-scaffold";

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}
```

`rootWith(SEAM_NOOP_CHECKPOINT)` — the canonical call with `invocationId` and
`clock` left at their defaults — evaluates to `{ checkpoint:
SEAM_NOOP_CHECKPOINT, idSource: { newInvocationId: () => "inv-1",
newToolCallId: () => "tc-1" } }`, which is `rootDouble()`'s return value
field-for-field (`SEAM_NOOP_CHECKPOINT` and `NOOP_CHECKPOINT` are the same
imported binding under a local alias).

## Why this is a problem
`prompt-value-harness.ts` already imports from `./invoke-seam-scaffold` for
the exact checkpoint `rootWith` is parameterised on, and `fixture-dispatch-
harness.ts` sits alongside it under `tests/helpers/` exporting the builder
that reaches the same result with its own defaults — so the reimplementation
is not a case of the canonical helper being hard to find or of an
incompatible shape. The `RuntimeRoot` double literal (`checkpoint` field,
`idSource.newInvocationId`/`newToolCallId` methods, `"inv-1"`/`"tc-1"`
literals) is typed out a second time under a different local name rather
than composed from the already-exported builder.

## Suggested direction (non-binding, optional)
`tests/helpers/prompt-value-harness.ts` could call
`rootWith(SEAM_NOOP_CHECKPOINT)` from `./fixture-dispatch-harness` in place
of its local `rootDouble()`, dropping the local declaration.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: not applicable — both `rootWith` and `rootDouble`
  are inert `RuntimeRoot` stand-ins wired for a positive execution path, not
  a MUST-NOT witness over recorded calls.
- docs/bugs/ signature search: `grep -rl "rootDouble\|rootWith" docs/bugs/` → 0 hits; no documented correct-reason red cites this duplication.
- coverage-matrix/bug-doc citation search: `grep -n "prompt-value-harness\|fixture-dispatch-harness" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block, nor of either helper file — only that one call the other's already-exported builder — so no pinned citation is disturbed.
- Coverage check: the claim is entirely about a repeated builder-shape
  DEFINITION across two helper modules; every caller of either function
  reaches an equivalent double, and no behaviour path is claimed untested.
- Overlap check: `grep -rl "rootWith" quality/intake quality/issues quality/resolved | xargs grep -l "prompt-value-harness"` → 0 hits. The resolved `PTQ-0403-active-invocation-dispatch-scaffolding-duplicated.md` (whose fix minted `rootWith`/`noopPi`/`promptTheta`/`driveCtx`/`tick` into what is now `tests/helpers/fixture-dispatch-harness.ts`) and the intake `qw20260918050411-d7-02-blockexpr-production-rootdouble-producer-harness-duplicated.md` (a `tests/blockexpr-production.test.ts` copy of `prompt-value-harness.ts`'s whole scaffold) both name one of the two files here but neither compares `prompt-value-harness.ts`'s `rootDouble()` against `fixture-dispatch-harness.ts`'s `rootWith` — this is the first filing to cite this specific pair for this root cause.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/helpers/prompt-value-harness.ts:19-27 and tests/helpers/fixture-dispatch-harness.ts:154-164; sed-extracting `rootDouble` and `rootWith` with its defaults (`invocationId="inv-1"`, no clock) substituted diffs zero, and `SEAM_NOOP_CHECKPOINT` is declared `: Checkpoint` (invoke-seam-scaffold.ts:32) so `rootWith(NOOP_CHECKPOINT)` type-checks as a drop-in; both helpers are live (prompt-value-harness imported by b0316/b0317/b0318, rootWith by 7 test files), both under tests/, D7 copy-paste-double class, neither is gate kin, no recording-double/red-test carve-out, coverage-matrix 0 hits reproduces; the filing's docs/bugs "0 hits" claim is wrong (2 files match — 0172 cites some test's `rootDouble()` lacking schemaValidator, 0383 cites a `rootWithIds()` elsewhere) but neither names either helper and no it()/describe() merge/rename/delete is proposed, so immaterial; not a duplicate — resolved PTQ-0209 (repo-wide test-file rootDouble trio) was fixed before prompt-value-harness.ts was minted at 118fa3e7 (2026-09-17), same-wave sibling d7-02-blockexpr tracks a test copying this helper's scaffold (its fix imports from this helper and leaves this `rootDouble` in place), and d7-03 compares the two Checkpoint doubles, a different root cause; fix is a mechanical one-import/one-call substitution (triage: claude-fable-5-1)
