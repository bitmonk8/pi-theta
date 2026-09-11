---
id: PTQ-0209
title: array-sink-unresolvable-deferral.test.ts redefines a NOOP_CHECKPOINT/rootDouble/producer double that recurs verbatim across dozens of test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/array-sink-unresolvable-deferral.test.ts:291-316
  - tests/absent-member-presence-gate.test.ts:255-278
  - tests/b0293-invoke-callee-containment-fences.test.ts:89-99
  - tests/b0315-stdlib-arg-runtime-belt.test.ts:75-97
sites: 4
fix_scope: cross-module
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# array-sink-unresolvable-deferral.test.ts redefines a NOOP_CHECKPOINT/rootDouble/producer double that recurs verbatim across dozens of test files

## Observation
tests/array-sink-unresolvable-deferral.test.ts defines a module-scope `NOOP_CHECKPOINT` constant, a `rootDouble()` function returning a `RuntimeRoot` double, and a `producer()` function wrapping `createProductionProducerDeps` around that double. The file's own section comment names this block "Shared parse + production-executor harness (the tests/absent-member-presence-gate.test.ts:219–325 pattern)" — stating outright that the block was copied from that file rather than imported from one. The same three-part trio, byte-identical in its `NOOP_CHECKPOINT` and `rootDouble` halves, recurs by exact text search in 89 test files under `tests/`, none importing it from a shared module.

## Evidence
tests/array-sink-unresolvable-deferral.test.ts:291-302:
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

tests/array-sink-unresolvable-deferral.test.ts:304-316:
```ts
function producer(): ReturnType<typeof createProductionProducerDeps> {
  return createProductionProducerDeps({
    // `sendMessage` satisfies the theta-system-note channel; the active-tools
    // pair satisfies the PIC-17 snapshot/restore window. No provider, no model.
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

tests/absent-member-presence-gate.test.ts:255-266 — the file array-sink-unresolvable-deferral.test.ts's own comment names as this pattern's source; `NOOP_CHECKPOINT` and `rootDouble` are byte-identical to the excerpt above:
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

tests/absent-member-presence-gate.test.ts:268-278 — its `producer()`, the same shape minus the return-type annotation and comments:
```ts
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

tests/b0293-invoke-callee-containment-fences.test.ts:89-99 — the same `NOOP_CHECKPOINT`/`rootDouble` pair, byte-identical again:
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
```

tests/b0315-stdlib-arg-runtime-belt.test.ts:75-97 — the same pair plus a `producer()` matching array-sink-unresolvable-deferral.test.ts's almost word for word (only "the PIC-17 snapshot/restore window" shortens to "the snapshot/restore window"):
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

function producer(): ReturnType<typeof createProductionProducerDeps> {
  return createProductionProducerDeps({
    // `sendMessage` satisfies the theta-system-note channel; the active-tools
    // pair satisfies the snapshot/restore window. No provider, no model.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
```

Pattern-wide counts, exact searches against `tests/**/*.test.ts`:
- `grep -rl "^function rootDouble(): RuntimeRoot {" tests --include="*.test.ts" | wc -l` → 89
- `grep -rl "const NOOP_CHECKPOINT: Checkpoint = {" tests --include="*.test.ts" | wc -l` → 95 (plus 4 more files under the renamed `SEAM_NOOP_CHECKPOINT`)
- `grep -rl "root: rootDouble()" tests --include="*.test.ts" | wc -l` → 91

`tests/helpers/` currently holds `call-with-clause-harness.ts`, `category1-clause-oracle.ts`, `e2e-s1.ts`, `fake-clock.ts`, `fake-file-system.ts`, `fake-file-watcher.ts`, `fake-host-loop-host.ts`, `fake-id-source.ts`, `fake-json-child.ts`, `fake-rpc-child.ts`, `fake-token-estimator.ts` — no module among them exports a `RuntimeRoot` double or a production-producer factory.

## Why this is a problem
This is the "Boilerplate duplication" class: a near-identical setup sequence — a no-op `Checkpoint`, a `RuntimeRoot` double wrapping it plus a fixed `idSource`, and a `createProductionProducerDeps` call wrapping the double — is repeated as a unit rather than shared. The repetition is traceable rather than incidental: array-sink-unresolvable-deferral.test.ts's own comment names the exact file it copied the block from, and that file's own matching comment ("the tests/non-object-receiver-gate.test.ts group-(e) pattern") shows the copying chain extends at least one file further back still. `tests/helpers/` is this suite's established home for shared fakes, and no comparable module exists for this trio, which is why each of the 89 sites re-derives it in place instead of importing it.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting the `NOOP_CHECKPOINT`/`rootDouble`/`producer` trio (or the parts of it that do not vary per file) is the home the existing `fake-*.ts` helpers already establish a convention for; this names where the duplicated code already points, not a design for the extraction.

## False-positive check
- Gate-pin carve-out: none of the four cited files match `*gate*.test.ts` and this finding does not touch a pinned count or inventory; not applicable.
- Recording-double carve-out: `rootDouble()`/`producer()` return an inert double consumed so the production executor can run; neither records calls to assert something was never invoked; not applicable.
- docs/bugs/ signature search: `docs/bugs/0179-array-sink-refuses-unresolvable-value-type.md` Status is "fixed (0.104.0)"; `npx vitest run tests/array-sink-unresolvable-deferral.test.ts tests/absent-member-presence-gate.test.ts tests/b0293-invoke-callee-containment-fences.test.ts tests/b0315-stdlib-arg-runtime-belt.test.ts` passes all tests at HEAD (58 passed across the four files' full runs used during this review), so none of the cited files is a documented correct-reason red.
- coverage-matrix / bug-doc citation search: `grep -n "array-sink-unresolvable-deferral\|absent-member-presence-gate" docs/reference/coverage-matrix.md` returns no hits. This finding does not propose merging, renaming or deleting any cited test file — only that the harness trio could be imported rather than re-derived — so the citation carve-out does not bind.
- Coverage-drift check: the finding is about code that exists (the duplicated double) and does not assert any path is untested; no coverage claim is made.

## Triage
verdict: confirmed — all four excerpts reproduce verbatim at the cited lines and all pattern-wide counts reproduce exactly (rootDouble 89, NOOP_CHECKPOINT 95 plus 4 disjoint SEAM_NOOP_CHECKPOINT files, `root: rootDouble()` 91); the array-sink→absent-member-presence-gate→non-object-receiver-gate copy-chain comments are real; docs/bugs/0179 is fixed and all four files pass at HEAD (60/60, not 58 as claimed, a harmless miscount), and coverage-matrix.md has no hits, so no carve-out blocks this in-scope D7 boilerplate-duplication finding confined to tests/ with no ledger duplicate; one evidentiary claim is false and should be corrected before ticketing — tests/helpers/call-with-clause-harness.ts already exports a matching `rootDouble()`/`noopPi()` pair imported by tests/call-with-clause-hash-stability.test.ts and tests/call-with-clause-threading.test.ts, contradicting "no module among them exports a RuntimeRoot double" — which strengthens rather than defeats the consolidation case since a working precedent is already being bypassed (triage: claude-opus-5)
