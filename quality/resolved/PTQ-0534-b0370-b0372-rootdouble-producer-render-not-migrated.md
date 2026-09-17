---
id: PTQ-0534
title: b0370 and b0372 each redeclare the rootDouble/producer/render trio tests/helpers/runtime-belt-probe-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0370-reassign-target-scope.test.ts:152-183
  - tests/b0372-active-set-restore-protocol.test.ts:428-442
  - tests/helpers/runtime-belt-probe-harness.ts:64-98
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0370 and b0372 each redeclare the rootDouble/producer/render trio tests/helpers/runtime-belt-probe-harness.ts already exports

## Observation
tests/helpers/runtime-belt-probe-harness.ts's own header explains it was extracted because tests/b0368-plus-ordering-laundered-belt.test.ts and tests/b0369-control-flow-kind-belts.test.ts each independently declared the same `rootDouble` (a `RuntimeRoot` double whose `Clock.setTimeout` fires synchronously), `producer` (wraps it via `createProductionProducerDeps`), and `render` (renders a `ThetaValue` for a failure message) pieces. tests/b0370-reassign-target-scope.test.ts, in this review's scope, declares a module-scope `rootDouble`/`producer`/`render` trio that is byte-identical to the helper's exports apart from one comment sentence. tests/b0372-active-set-restore-protocol.test.ts, also in scope, declares its own `rootDouble` that reproduces the same `checkpoint`/`idSource`/`clock` shape with one field added (`schemaValidator`). Neither file imports `tests/helpers/runtime-belt-probe-harness.ts`.

## Evidence
tests/b0370-reassign-target-scope.test.ts:152-169 (re-read immediately before filing; `rootDouble`):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // (the b0368/b0369 harness contract).
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}
```

tests/helpers/runtime-belt-probe-harness.ts:64-81 (re-read immediately before filing; the canonical `rootDouble` this trio was extracted into):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // with no real timers (the fixed-clock harness contract this module's
    // callers share).
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}
```

tests/b0370-reassign-target-scope.test.ts:171-183 (`render` and `producer`, immediately following):
```ts
function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}
```

tests/b0372-active-set-restore-protocol.test.ts:428-442 (`rootDouble`, the diverged copy — same three fields plus `schemaValidator`):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}
```

Exact diffs run before filing: `diff <(sed -n '152,169p' tests/b0370-reassign-target-scope.test.ts) <(sed -n '64,81p' tests/helpers/runtime-belt-probe-harness.ts)` → the only difference is the one comment line quoted above (both fill the identical `checkpoint`/`idSource`/`clock` object). `diff <(sed -n '175,183p' tests/b0370-reassign-target-scope.test.ts) <(sed -n '84,93p' tests/helpers/runtime-belt-probe-harness.ts)` (`producer`) → no output (byte-identical). `diff <(sed -n '171,173p' tests/b0370-reassign-target-scope.test.ts) <(sed -n '96,98p' tests/helpers/runtime-belt-probe-harness.ts)` (`render`) → no output (byte-identical). `grep -n "^function rootDouble" tests/b0372-active-set-restore-protocol.test.ts` confirms b0372's copy at line 428, diverged only by the added `schemaValidator: ajv()` field its own fixture needs.

## Why this is a problem
`tests/helpers/runtime-belt-probe-harness.ts` exists specifically to end this redeclaration for the `b03xx` runtime-belt bug-report family (its own header cites b0368/b0369 as the motivating pair, and quality/intake/qw20260917154546-d7-01-b0332-b0338-belt-probe-harness-duplicated.md, filed against a different pair in this same wave, independently found the same `rootDouble` trio still hand-rolled in 13 files, naming b0370 and b0372 among the pattern's size though not as filed locations). b0370's copy is byte-identical to the helper's export apart from one comment sentence; b0372's is the same three-field shape plus one addition. Both files are in this review's scope and neither imports the helper that already provides this exact double.

## Suggested direction (non-binding, optional)
`tests/helpers/runtime-belt-probe-harness.ts`'s `rootDouble`/`producer`/`render` (currently module-private, only reached indirectly through `makeBeltProbes`) are the natural shared functions these two files' identical/near-identical copies already point at; exporting them directly would let a caller needing only the double (not the full `makeBeltProbes` bundle, as b0370's custom `gate`-parameterised probe and b0372's `piDouble`/`InstantSettleSession` variant both do) import rather than redeclare.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin; the cited functions are harness plumbing, not a pinned count or inventory assertion.
- Recording-double check: `rootDouble`/`producer`/`render` are stateless construction helpers, not `MUST-NOT-called` negative witnesses; the carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0370-reassign-target-scope-unchecked-cross-boundary-writes.md and docs/bugs/0372-pic8-restore-protocol-orphaned.md both exist and are cited by their respective files' headers; both bug docs' Status line reads "fixed" and `npx vitest run` over all six reviewed files shows 6/6 files, 100/100 tests passing — not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0370-reassign-target-scope\|b0372-active-set-restore-protocol" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()` — only that the local `rootDouble`/`producer`/`render` pieces could be imported from the existing helper — so no citation is affected.
- Prior-finding overlap check: quality/intake/qw20260917154546-d7-01-b0332-b0338-belt-probe-harness-duplicated.md (this same wave) is scoped explicitly to b0332/b0338 as locations and states its 13-file pattern-size list (which includes b0372, not b0370) is "named here only as the size of the pattern, not as a claim against them" — so neither b0370 nor b0372 is claimed as a location in that finding; this finding is disjoint and adds them as locations in their own right.
- Coverage-drift check: the claim is about repeated harness-piece definitions, not a missing test path; every line cited is exercised by passing tests (confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-diffed: b0370's rootDouble (152-169) differs from the helper's (64-81) only in one comment sentence, its producer (175-183) and render (171-173) are byte-identical to the helper's (84-93 / 96-98, the candidate's producer sed range is one closing line short — immaterial), and b0372's rootDouble (428-442) is the same checkpoint/idSource/clock body plus `schemaValidator: ajv()`; the helper is imported only by b0368/b0369 (grep across tests/src/extensions/tools), both docs/bugs are fixed (0370 → 0.370.0, 0372 → 0.363.0), 40/40 green, 0 coverage-matrix hits, and no merge/rename/delete is proposed so the bug-doc witness citations are untouched; not a duplicate of PTQ-0209 (the no-clock NOOP_CHECKPOINT trio, other files), PTQ-0397 (b0368/b0369 — the fix that minted this helper) or the confirmed same-wave sibling d7-01 (b0332/b0338, which names b0370/72 as disjoint) — the not-migrated residual class PTQ-0228/PTQ-0240 established as separately filable; one overstatement on record: the title's "already exports" is false — rootDouble/producer/render are module-private in the helper (exports are assertValue, makeBeltProbes and three types), as the candidate's own Suggested direction concedes, so exporting them is part of the fix, not a precondition already met (triage: claude-fable-5-1)
