---
id: PTQ-0873
title: type-name-as-value-refusal.test.ts redeclares the NOOP_CHECKPOINT/rootDouble/producer trio byte-identically instead of importing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/type-name-as-value-refusal.test.ts:1221-1243
  - tests/helpers/runtime-belt-probe-harness.ts:64-91
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# type-name-as-value-refusal.test.ts redeclares the NOOP_CHECKPOINT/rootDouble/producer trio byte-identically instead of importing it

## Observation
`tests/type-name-as-value-refusal.test.ts` declares module-scope `NOOP_CHECKPOINT`, `rootDouble()` and `producer()` for its group-(e) production-executor harness. `NOOP_CHECKPOINT` and `rootDouble()` are byte-identical to the same-named pieces already confirmed, in prior wave finding PTQ-0209, to recur verbatim across dozens of test files (that finding's own search: `grep` for this trio hit 89 files); `producer()` is identical apart from an inlined `rootDouble()` call versus a default parameter. `tests/helpers/runtime-belt-probe-harness.ts` already exports a `producer()` of the same `createProductionProducerDeps({ pi: {sendMessage, getActiveTools, setActiveTools}, root, modelRegistry })` shape for this exact purpose.

## Evidence
`tests/type-name-as-value-refusal.test.ts:1221-1243`:
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
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

PTQ-0209's own cited counterpart (`tests/array-sink-unresolvable-deferral.test.ts:291-316`, byte-identical `NOOP_CHECKPOINT`/`rootDouble`, `producer` differing only by a return-type annotation and a comment):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}
```
```ts
function producer(): ReturnType<typeof createProductionProducerDeps> {
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

`tests/helpers/runtime-belt-probe-harness.ts:64-91` — the already-exported `producer()` of the same call shape (its own `rootDouble()` additionally wires a synchronous `clock`, so only `producer`'s shape, not `rootDouble`'s body, is the exact match here):
```ts
export function rootDouble(): RuntimeRoot {
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
  } as unknown as RuntimeRoot;
}

/** Production producer over the supplied root (fixed-clock by default). */
export function producer(root: RuntimeRoot = rootDouble()) {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root,
    modelRegistry: {} as unknown as ModelRegistry,
  });
}
```

## Why this is a problem
The `NOOP_CHECKPOINT` constant and `rootDouble()` function in `tests/type-name-as-value-refusal.test.ts:1221-1232` are byte-for-byte identical to the copy PTQ-0209 already traced across dozens of sibling files as one repeated trio, and its `producer()` at `:1234-1243` builds the identical `createProductionProducerDeps({ pi: {sendMessage,getActiveTools,setActiveTools}, root: rootDouble(), modelRegistry })` call PTQ-0209 cited and that `tests/helpers/runtime-belt-probe-harness.ts` already exports a drop-in equivalent of. This file is not among the four locations PTQ-0209 cited or fixed, so it is a further unmigrated instance of that same repeated declaration rather than a one-off local choice.

## Suggested direction (non-binding, optional)
Naming this file among the sites still carrying the local trio, for the same shared-helper landing PTQ-0209 already points at (`tests/helpers/runtime-belt-probe-harness.ts`'s `producer()`, or an equivalent no-clock `rootDouble()` sibling), is an observation about where the existing helper already sits, not a design for the migration.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file; the cited lines are harness scaffolding, not a pinned count/inventory assertion.
- Recording-double check: `rootDouble()`/`producer()` are inert setup doubles, not recording doubles used for a MUST-NOT witness; carve-out does not apply.
- docs/bugs/ signature search: `grep -n "type-name-as-value-refusal" docs/bugs/*.md` returns many hits, all naming specific test cells (e.g. "a8", "g9") as witnesses, none citing the harness lines 1221-1243; no documented correct-reason red covers this duplication.
- coverage-matrix.md citation search: `grep -n "type-name-as-value-refusal" docs/reference/coverage-matrix.md` → no hits; no merge, rename or deletion of any cited cell is proposed.
- Prior-finding check: PTQ-0209 (status: fixed) cites four other files (`array-sink-unresolvable-deferral.test.ts`, `absent-member-presence-gate.test.ts`, `b0293-invoke-callee-containment-fences.test.ts`, `b0315-stdlib-arg-runtime-belt.test.ts`) as its locations and does not cite `type-name-as-value-refusal.test.ts`; its own text states the pattern recurred in 89 files by exact text search, of which only 4 were fixed, so this file is a distinct, previously-uncited site of the same root cause rather than a re-filing.
- Coverage check: the claim is entirely about a duplicated harness DECLARATION; the file's own `it()` cells that use `producer()`/`rootDouble()` (group (e)) continue to pass under the local copy.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: NOOP_CHECKPOINT/rootDouble/producer reproduce verbatim at tests/type-name-as-value-refusal.test.ts:1221-1243 (each defined exactly once, consumed at :1299 via producer()); sed-extracted producer() diffs zero against tests/helpers/runtime-belt-probe-harness.ts:85-94 after the default-param normalisation, NOOP_CHECKPOINT diffs zero against tests/helpers/call-with-clause-harness.ts:152-156 and rootDouble matches that helper's checkpoint/idSource body bar `export` and the helper's clock (inert behind the `as unknown as RuntimeRoot` cast; the file never reads clock); the file imports only helpers/e2e-s1 and helpers/theta-corpus, none of the three harnesses exporting rootDouble/producer (call-with-clause-harness, runtime-belt-probe-harness, tool-call-dispatch-harness); the file (40315587, 2026-08-20) predates both helpers (96303cc3 2026-09-09, 13075d37 2026-09-17) so this is the not-migrated class; not a gate, inert setup doubles, docs/bugs cite the file only by cell witnesses (0172 names rootDouble narratively, no local-harness rationale), coverage-matrix 0 hits, no merge/rename/delete proposed, 62/62 green at HEAD; both locations under tests/, D7 copy-paste-double class; not a duplicate — no tracked PTQ or candidate names this file's trio (PTQ-0727/0753 and same-wave d7-01-parsedeps/d7-02-registrymessageof on this file are different root causes) and the ledger treats each un-migrated residual copy of the PTQ-0209 trio as separately filable (PTQ-0738, PTQ-0603/0650/0655/0705, confirmed same-wave d7-01-match-arm-scope and d7-02-blockexpr-production); one evidentiary correction for ticketing: the quoted array-sink-unresolvable-deferral.test.ts:291-316 counterpart is stale — PTQ-0209's fix already migrated that file to `import { noopPi, rootDouble } from "./helpers/call-with-clause-harness"` and it no longer declares NOOP_CHECKPOINT/rootDouble, which strengthens rather than weakens the import-instead-of-copy case since the working destination is proven (triage: claude-fable-5-1)
