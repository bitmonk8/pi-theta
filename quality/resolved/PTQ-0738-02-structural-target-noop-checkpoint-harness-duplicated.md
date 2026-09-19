---
id: PTQ-0738
title: unresolvable-operand-structural-target-adjudication.test.ts's NOOP_CHECKPOINT/rootDouble/producer trio is a self-acknowledged copy of non-object-receiver-gate.test.ts's block
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/unresolvable-operand-structural-target-adjudication.test.ts:422-445
  - tests/non-object-receiver-gate.test.ts:223-246
sites: 2
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# unresolvable-operand-structural-target-adjudication.test.ts's NOOP_CHECKPOINT/rootDouble/producer trio is a self-acknowledged copy of non-object-receiver-gate.test.ts's block

## Observation
`tests/unresolvable-operand-structural-target-adjudication.test.ts` declares a
module-scope `NOOP_CHECKPOINT` constant, a `rootDouble()` function returning a
`RuntimeRoot` double, and a `producer()` function wrapping
`createProductionProducerDeps` around that double, immediately below a section
comment reading "the shape tests/non-object-receiver-gate.test.ts:221–292
establishes" — naming, in the file's own words, the file this trio was copied
from rather than imported from it. `tests/non-object-receiver-gate.test.ts`
declares the identical three pieces at the cited lines. `NOOP_CHECKPOINT` and
`rootDouble` are byte-identical between the two files; `producer` is
functionally identical (identical `pi`/`root`/`modelRegistry` wiring), the
reviewed file's copy adding a return-type annotation and one explanatory
comment the other file's copy omits.

## Evidence
`tests/unresolvable-operand-structural-target-adjudication.test.ts:422-445`:
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

`tests/non-object-receiver-gate.test.ts:223-246` — the same three pieces,
`NOOP_CHECKPOINT` and `rootDouble` byte-identical, `producer`'s body
identical apart from the omitted return-type annotation and comment:
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

Exact search: `grep -n "NOOP_CHECKPOINT\|function rootDouble\|function producer(" tests/unresolvable-operand-structural-target-adjudication.test.ts tests/non-object-receiver-gate.test.ts` returns exactly these definitions, once each, in each file (`non-object-receiver-gate.test.ts` also carries a second inline `rootDouble`-shaped literal at line 458-462 for its own group-(g) live cell, not cited here as it is not one of the three shared pieces).

## Why this is a problem
The reviewed file's own header comment for this block ("Production-executor
harness for group (E), the shape tests/non-object-receiver-gate.test.ts:221–292
establishes") names the exact file and line range it drew this three-piece
harness from, rather than importing it, so any change to the shared shape —
the checkpoint's no-op contract, the fixed `idSource` pair, or the fake
`pi`/`root`/`modelRegistry` wiring `createProductionProducerDeps` is called
with — made in one file has to be independently re-typed in the other to stay
in sync, with the section comment as the only thing tying the two copies
together.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting this `NOOP_CHECKPOINT`/`rootDouble`/
`producer` trio is the home both files' own comments already point toward,
one file naming itself the pattern's source and the other naming that file as
the shape it drew from.

## False-positive check
- Gate-pin check: `non-object-receiver-gate.test.ts`'s filename contains
  "gate" but the term names the bug's own subject (a receiver-kind gate in
  production code), not a census/pin-count test shape; neither file matches
  `*gate*.test.ts`'s pinned-count/inventory carve-out, and the cited lines
  assert no pinned count or inventory.
- Recording-double check: `rootDouble()`/`producer()` return an inert double
  consumed so the production executor can run; neither records calls to back
  a "never called" witness.
- docs/bugs/ signature search: `grep -rl "NOOP_CHECKPOINT\|rootDouble"
  docs/bugs/*.md` → 0 hits; neither bug document (0144, 0027) gives a
  rationale for keeping this harness local to each file.
- coverage-matrix/bug-doc citation search: `grep -n
  "unresolvable-operand-structural-target-adjudication\|non-object-receiver-gate"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` name —
  only that the shared three-piece harness could be imported rather than
  copied — so no citation is disturbed.
- Coverage check: the claim is entirely about a repeated harness DEFINITION,
  not a missing test path; every function cited is exercised by both files'
  own passing tests.
- Prior-finding overlap check: resolved PTQ-0209 established this same
  `NOOP_CHECKPOINT`/`rootDouble`/`producer` trio recurs across roughly 89
  files repo-wide but cited four other files as its own evidence (none of
  them either file in this pair); `grep -rl
  "unresolvable-operand-structural-target-adjudication" quality/intake
  quality/resolved` returns no hits before this filing, so this specific pair
  is not yet cited by name in this wave or a prior one.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: NOOP_CHECKPOINT/rootDouble at unresolvable-operand-structural-target-adjudication.test.ts:422-433 and non-object-receiver-gate.test.ts:223-234 diff byte-identical and producer (:435-445 vs :236-246) differs only by the return-type annotation and one comment, the section header at :417-419 names "tests/non-object-receiver-gate.test.ts:221–292" as the source, the definition grep reproduces exactly once per piece per file, neither file imports from tests/helpers/, bugs 0144 (fixed 0.185.0) and 0027 (fixed 0.39.0) are green at HEAD (66/66), coverage-matrix has 0 hits, no merge/rename/delete is proposed so bug 0144's by-name witness citations are untouched, and the `gate` filename names bug 0027's receiver gate with no pinned count on the cited lines, so no carve-out binds; not a duplicate — PTQ-0209 (fixed in 2594cd44) migrated only its four cited files, the source-side block is tracked by confirmed same-wave d7-106-02 (:185-246) and d7-01 (:229-246) but no tracked PTQ or candidate names the reviewed file's copy, and the ledger treats per-file residual instances as distinct (d7-106-02, PTQ-0228/0240, PTQ-0314/0386/0384/0397); two evidentiary claims must be corrected at ticketing — `grep -rl "NOOP_CHECKPOINT\|rootDouble" docs/bugs/*.md` returns 1 hit (0172:1255, narrative only, no local-harness rationale), not 0, and non-object-receiver-gate.test.ts:457-462 is a `rootLive(session)` function with a clock, not an inline rootDouble-shaped literal; and the suggested direction overlooks that tests/helpers/call-with-clause-harness.ts:158-178 already exports rootDouble()/noopPi() (11 importers, the destination PTQ-0209's fix used) and tool-call-dispatch-harness.ts exports NOOP_CHECKPOINT/rootDouble, which strengthens the import-instead-of-copy case since a working helper is being bypassed (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
