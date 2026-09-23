---
id: PTQ-1461
title: capitalised-bare-match-pattern-refusal.test.ts hand-rolls rootDouble/producer that duplicate exports of a module it already imports
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/capitalised-bare-match-pattern-refusal.test.ts:184-203
  - tests/helpers/prompt-value-harness.ts:33-56
  - tests/helpers/call-with-clause-harness.ts:174-180
  - tests/helpers/fixture-dispatch-harness.ts:182-189
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# capitalised-bare-match-pattern-refusal.test.ts hand-rolls rootDouble/producer that duplicate exports of a module it already imports

## Observation
`tests/capitalised-bare-match-pattern-refusal.test.ts` declares two
module-scope functions, `rootDouble()` and `producer()`, that build a
`RuntimeRoot` double and a `createProductionProducerDeps` wrapper for a
query-free prompt-mode binding. The same file already imports
`createPatternRefusalHarness` from `tests/helpers/prompt-value-harness.ts`,
which exports its own `producer()` doing the identical job by composing
`noopPi()` (imported from `tests/helpers/call-with-clause-harness.ts`) and
`rootWith(NOOP_CHECKPOINT)` (imported from
`tests/helpers/fixture-dispatch-harness.ts`).

## Evidence
tests/capitalised-bare-match-pattern-refusal.test.ts:184-203:
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

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

tests/helpers/prompt-value-harness.ts:33 and :47-56 (already imported into the
scoped file at line 3 for `createPatternRefusalHarness`):
```ts
import { rootWith } from "./fixture-dispatch-harness";
import { noopPi } from "./call-with-clause-harness";
...
export function producer(opts: ProducerOpts = {}) {
  return createProductionProducerDeps({
    // `getActiveTools`/`setActiveTools` satisfy the PIC-17 prompt→prompt
    // suspend window; `sendMessage` satisfies the theta-system-note channel.
    pi: noopPi(),
    root: {
      ...rootWith(NOOP_CHECKPOINT),
      ...(opts.schemaValidator !== undefined ? { schemaValidator: opts.schemaValidator } : {}),
    },
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.parseCallee !== undefined ? { parseCallee: opts.parseCallee } : {}),
  });
}
```

tests/helpers/call-with-clause-harness.ts:174-180 (the `noopPi` the scoped
file's inline `pi` literal reproduces field-for-field):
```ts
export function noopPi(): ExtensionAPI {
  return {
    sendMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
}
```

tests/helpers/fixture-dispatch-harness.ts:182-189 (the `rootWith` the scoped
file's `rootDouble()` reproduces with the same default `invocationId`
`"inv-1"` and `newToolCallId` `"tc-1"`):
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

## Why this is a problem
Every field of the scoped file's `rootDouble()` and inline `pi` object is a
verbatim re-derivation of a `RuntimeRoot`/`ExtensionAPI` double the
already-imported `prompt-value-harness.ts` module also builds and exports as
`producer()`. The comment attached to the canonical `producer()`
("`getActiveTools`/`setActiveTools` satisfy the PIC-17 prompt→prompt suspend
window") is the same justification the scoped file's own comment gives
("the active-tools pair satisfies the PIC-17 snapshot/restore window"),
naming the identical rationale for the identical fields.

## Suggested direction (non-binding, optional)
Observed as fact only: the module this file already imports from
(`tests/helpers/prompt-value-harness.ts`) exports a `producer()` doing this
exact job.

## False-positive check
- Gate-pin check: file name matches no `*gate*.test.ts` shape; not applicable.
- Recording-double check: neither `rootDouble` nor `producer` records calls
  for a MUST-NOT witness; both are plain value doubles, not recording doubles.
- docs/bugs/ signature search: `grep -rn "0141" docs/bugs/` locates
  `docs/bugs/0141-capitalised-bare-match-pattern-binds-identifier.md`, whose
  §Witness names this test file's assertions on diagnostics/values, not this
  harness shape; no documented correct-reason-red covers the duplication.
- coverage-matrix/bug-doc citation search: `grep -rn
  "capitalised-bare-match-pattern-refusal" docs/reference/coverage-matrix.md
  docs/bugs/*.md` returns no hit naming this file's `rootDouble`/`producer`
  by name, so no citation pins these two functions' identity.
- This finding does not propose a coverage change; it only observes that a
  double already available via an existing import is re-derived by hand.

## Triage
verdict: confirmed — excerpts reproduce at tests/capitalised-bare-match-pattern-refusal.test.ts:184-203 (rootDouble/producer), prompt-value-harness.ts:33-56 (producer via noopPi()/rootWith(NOOP_CHECKPOINT)), call-with-clause-harness.ts:174-180 (noopPi) and fixture-dispatch-harness.ts:182-190 (rootWith, default "inv-1"/"tc-1"); the file already imports prompt-value-harness at line 3 and its local rootDouble/producer/execute/expectValue (184-230) are field-for-field what that module exports as producer() and createParsedPromptHarness(bugTag, sourcePath); D7 copy-paste double, in tests/ only, no gate/recording-double/coverage-matrix carve-out (bug docs cite the file only for cell counts/ranges); not a duplicate — PTQ-0645 (resolved) covered the same quintet in the two object-pattern-head files, PTQ-1074/1343 cite disjoint scaffolding, and no open quality/issues/ row names this file (triage: claude-fable-5-1)
