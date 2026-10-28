---
id: PTQ-1788
title: The scripted-session helper maintains the same turn-ticking root fixture in two builders.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/scripted-live-session-harness.ts:46-46
  - tests/helpers/scripted-live-session-harness.ts:644-658
  - tests/helpers/scripted-live-session-harness.ts:741-745
  - tests/helpers/scripted-live-session-harness.ts:1013-1027
  - tests/helpers/scripted-live-session-harness.ts:1081-1085
  - tests/helpers/invoke-seam-scaffold.ts:75-78
sites: 2
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The scripted-session helper maintains the same turn-ticking root fixture in two builders.

## Observation
`scripted-live-session-harness.ts` defines both `liveSessionRoot` and the exported `rootLive`. Each constructs a root with an immediately resolving checkpoint, the same two fixed IDs, and a clock that ticks the supplied session before synchronously invoking each timeout callback. The first builder additionally supplies `schemaValidator: ajv()`; the second does not. The repeated fixture mechanism occurs twice within this helper module.

## Evidence
First builder, `tests/helpers/scripted-live-session-harness.ts:644-658`:
```ts
function liveSessionRoot(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
```

Second builder, `tests/helpers/scripted-live-session-harness.ts:1013-1027`:
```ts
export function rootLive(session: UntypedLiveSession): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
```

The checkpoint alias, `tests/helpers/scripted-live-session-harness.ts:46-46`:
```ts
import { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./invoke-seam-scaffold";
```

Its existing implementation, `tests/helpers/invoke-seam-scaffold.ts:75-78`:
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
```

Both builders are used to assemble production-producer dependencies. First call, `tests/helpers/scripted-live-session-harness.ts:741-745`:
```ts
    const deps = createProductionProducerDeps({
      pi: pi.api,
      root: liveSessionRoot(session),
      modelRegistry: registryDouble(opts.availableModels ?? [ANTHROPIC_MODEL]),
    });
```

Second call, `tests/helpers/scripted-live-session-harness.ts:1081-1085`:
```ts
    const deps = createProductionProducerDeps({
      pi: livePi(session),
      root: rootLive(session),
      modelRegistry: registryDouble(),
      ...(resolvePiTool !== undefined ? { resolvePiTool } : {}),
```

## Why this is a problem
This is D7's copy-paste-double class: the two builders independently spell out the same scripted-turn root mechanics. Their clock literals are identical, their ID literals are identical apart from return-type annotations, and the checkpoint bodies both resolve immediately. The typed drive's additional AJV validator is a distinct field outside that repeated mechanism, not a different clock or entry-settling protocol. The existing exported `rootLive` in `tests/helpers/scripted-live-session-harness.ts` is already a shared-helper home for this fixture; the private builder maintains a second copy alongside it.

## False-positive check
- Gate-pin: inspected both builder definitions and their call sites; they construct runtime doubles rather than census/pin assertions. No inventory pin is challenged.
- Recording-double: the supplied sessions record traffic, but neither cited root builder is a negative call recorder. No MUST-NOT assertion or legitimate absence witness is challenged.
- docs/bugs/ signature search: `rg -n 'liveSessionRoot|rootLive' docs/bugs docs/reference/coverage-matrix.md` returned no matches. This finding does not claim a red test is disabled or incorrectly failing; it compares existing fixture definitions only.
- Coverage-matrix/bug-doc citation search: the same command returned no citations of either builder. No test merge, rename, or deletion is proposed.
- Existing-topic check: searched `quality/issues`, `quality/resolved`, and `quality/intake` for `liveSessionRoot` and `rootLive`. No earlier finding compares these two definitions; the first report from this shard mentions the identifier only in its reference-search description. PTQ-1348 compares the builders in `schema-brand-symbol-migration.test.ts` against `rootWith`, not these two helper definitions. The AJV-field difference is explicitly retained in this observation.
- Reference/intent check: searched `liveSessionRoot|rootLive|appendMessageEntry` across `src`, `extensions`, `tools`, and `tests`; matches were confined to tests. Both in-module root-builder call sites are quoted above, and `rootLive` is explicitly exported; this is not a dead-code claim. `git log -S` identifies the two definitions' introduction in `e54a42b3` and `099e1202`, separate test-helper extraction commits. The current definitions show their common clock protocol directly, without assuming the two session implementations themselves are interchangeable.
- Coverage boundary: this reports duplicated doubles that exist, not a missing test or a suite-composition, runtime-performance, or behavior issue.

## Triage
verdict: confirmed — Both live builders reproduce at :644-660 and :1013-1028 with identical turn-ticking clocks, equivalent fixed IDs and immediately resolving checkpoints; the typed builder's additional AJV field does not distinguish that duplicated mechanism. This is an in-scope D7 copy-paste double with no applicable carve-out or existing tracker; resolved PTQ-0519/0848 extracted separate harness families but did not prescribe maintaining duplicate root mechanics, and PTQ-1348 targets another file. (triage: claude-opus-5-5)
