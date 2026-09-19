---
id: PTQ-0846
title: blockexpr-production.test.ts redeclares the FM/NOOP_CHECKPOINT/rootDouble/producer scaffold byte-for-byte from tests/helpers/prompt-value-harness.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/blockexpr-production.test.ts:120
  - tests/blockexpr-production.test.ts:415-437
  - tests/helpers/prompt-value-harness.ts:19-38
  - tests/helpers/invoke-seam-scaffold.ts:32-36
sites: 2
fix_scope: module
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# blockexpr-production.test.ts redeclares the FM/NOOP_CHECKPOINT/rootDouble/producer scaffold byte-for-byte from tests/helpers/prompt-value-harness.ts

## Observation
`tests/helpers/prompt-value-harness.ts` exports a "parse -> production
binding -> execution harness for query-free, prompt-mode value witnesses":
an `FM` frontmatter constant, a `RuntimeRoot` double (`rootDouble`) wiring an
inert checkpoint, and a `producer()` wrapper around
`createProductionProducerDeps` with an inert `pi`. `tests/blockexpr-production.test.ts`
declares its own `FM`, its own inline `NOOP_CHECKPOINT`, and its own
`rootDouble()` / `producer()`, all with bodies identical to the exported
module's, then builds its own `runSource()` on top of them instead of
importing and using the module's exported `runValue()` (or its constituent
pieces).

## Evidence
`tests/helpers/prompt-value-harness.ts:19-38`:
```ts
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

export const FM = "---\nmode: prompt\n---\n";
```

`tests/helpers/invoke-seam-scaffold.ts:32-36` (the `NOOP_CHECKPOINT` value
`prompt-value-harness.ts` imports as `SEAM_NOOP_CHECKPOINT`):
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/blockexpr-production.test.ts:120` and `:415-437` (the same four
declarations, restated inline rather than imported):
```ts
const FM = "---\nmode: prompt\n---\n";
...
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

Each of the four declarations — the `FM` string, the checkpoint's
`before(): Promise<void> { return Promise.resolve(); }` body, `rootDouble`'s
return shape, and `producer`'s `createProductionProducerDeps` call — is
byte-for-byte identical between the two files (`blockexpr-production.test.ts`
spells the checkpoint inline where `prompt-value-harness.ts` imports the
identically-bodied `SEAM_NOOP_CHECKPOINT` under a local alias).

## Why this is a problem
`blockexpr-production.test.ts` neither imports `prompt-value-harness.ts` nor
any of its four constituent declarations, despite the module existing
specifically to hold this "parse -> production binding -> execution" scaffold
for prompt-mode value witnesses — the exact shape and purpose
`blockexpr-production.test.ts`'s own `runSource()` is built on top of. The
four declarations are typed out a second time under the same names and same
bodies rather than composed from the already-exported module.

## Suggested direction (non-binding, optional)
`tests/blockexpr-production.test.ts` could import `FM`, `rootDouble`'s
constituent pieces (or `runValue` itself), and `SEAM_NOOP_CHECKPOINT` from
the existing modules instead of restating them, keeping only the
parse-refusal branch `runSource()` adds on top.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: not applicable — `rootDouble`/`producer` are inert
  stand-ins wired for a positive execution path, not a MUST-NOT witness over
  recorded calls.
- docs/bugs/ signature search: `grep -rl "rootDouble\|prompt-value-harness" docs/bugs/`
  returns no hits; no documented correct-reason red cites this duplication.
- coverage-matrix/bug-doc citation search: `grep -n "blockexpr-production.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rn "blockexpr-production.test.ts"
  docs/bugs/` finds only docs/bugs/0082's behavioural citation, not this
  harness. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` — only that the existing scaffold be imported instead
  of restated — so no pinned citation is disturbed.
- Overlap check: `grep -rl "prompt-value-harness" quality/intake quality/issues quality/resolved`
  → no hits; the resolved `PTQ-0455-blockexpr-production-makedeps-harness-duplicated.md`
  covers a different triple (`makeDeps`/`parse`/`codesOf`, the parse-only
  harness, now migrated to `tests/helpers/e2e-s1.ts`) at different line
  numbers and does not mention `rootDouble`, `producer`, or
  `prompt-value-harness.ts`; this is a disjoint root cause on the same file.
- Coverage check: the claim is entirely about a repeated scaffold
  DEFINITION; every declaration is exercised by the file's own tests, and no
  behaviour path is claimed untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: sed-extracted tests/blockexpr-production.test.ts:421-437 diffs zero against tests/helpers/prompt-value-harness.ts:21-38 (rootDouble/producer), :415-419 diffs zero against invoke-seam-scaffold.ts:32-36 after the SEAM_NOOP_CHECKPOINT→NOOP_CHECKPOINT rename, and the FM literal at :120 matches prompt-value-harness.ts:41 byte-for-byte; the test file imports nothing from either helper; both locations under tests/, D7 boilerplate-duplication, not a gate, inert doubles (no recording carve-out), bug 0082 fixed (0.191.0) with the file 30/30 green, coverage-matrix 0 hits, no merge/rename/delete proposed; not a duplicate — PTQ-0455 (fixed) covered the disjoint makeDeps/parse/codesOf triple, PTQ-0209 (fixed) migrated four other files only, no tracked PTQ names this file for the rootDouble/producer trio and the ledger treats per-file residual copies as distinct (PTQ-0645/0738), while same-wave sibling d7-02-prompt-value-harness-rootdouble-reimplements-rootwith is a different root cause; two evidentiary nits for the fixer, neither refuting: the stated docs/bugs grep returns 1 hit (0172:1255, narrative about another file) not 0, and prompt-value-harness.ts exports only FM/runValue (its rootDouble/producer are un-exported and runValue asserts success so cannot serve runSource's parse-refused branch) — but tests/helpers/runtime-belt-probe-harness.ts:64-96 already exports a byte-identical producer() and a clock-augmented rootDouble() that this file bypasses, strengthening the consolidation case (triage: claude-fable-5-1)
