---
id: PTQ-1751
title: inbound-union-arm-dispatch.test.ts redeclares the shared inert executor seam doubles.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inbound-union-arm-dispatch.test.ts:1001-1005
  - tests/inbound-union-arm-dispatch.test.ts:1007-1010
  - tests/inbound-union-arm-dispatch.test.ts:1012-1018
  - tests/inbound-union-arm-dispatch.test.ts:1021-1026
  - tests/inbound-union-arm-dispatch.test.ts:1040-1048
  - tests/helpers/invoke-seam-scaffold.ts:75-79
  - tests/helpers/invoke-seam-scaffold.ts:82-85
  - tests/helpers/invoke-seam-scaffold.ts:88-94
sites: 3
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# inbound-union-arm-dispatch.test.ts redeclares the shared inert executor seam doubles.

## Observation
The binder-parent harness declares three inert doubles: `NOOP_CHECKPOINT`, `NOOP_SINK`, and `InertMutator`. Their method bodies duplicate the three exported no-op seams in `tests/helpers/invoke-seam-scaffold.ts`; the mutator uses a local class rather than the helper's object literal. `inertExecuteDeps` supplies these local doubles to its host and executor. The existing helper is the natural shared home for this three-piece scaffold.

## Evidence
The three local duplicate sites, re-read immediately before filing:

`tests/inbound-union-arm-dispatch.test.ts:1001-1005`:
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/inbound-union-arm-dispatch.test.ts:1007-1010`:
```ts
const NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};
```

`tests/inbound-union-arm-dispatch.test.ts:1012-1018`:
```ts
class InertMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}
```

The corresponding canonical doubles:

`tests/helpers/invoke-seam-scaffold.ts:75-79`:
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/helpers/invoke-seam-scaffold.ts:82-85`:
```ts
export const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};
```

`tests/helpers/invoke-seam-scaffold.ts:88-94`:
```ts
export const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};
```

The local doubles are used, not vestigial declarations:

`tests/inbound-union-arm-dispatch.test.ts:1021-1026`:
```ts
function inertExecuteDeps(): ExecuteBodyDeps {
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    sink: NOOP_SINK,
    file: "union-arm-params.theta",
```

`tests/inbound-union-arm-dispatch.test.ts:1040-1048`:
```ts
  return {
    env: buildEnvironment({ body: PARAMS_DOC.body }),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new InertMutator(),
    mode: "prompt",
    file: "union-arm-params.theta",
  };
```

## Why this is a problem
This is D7's copy-paste fixtures/doubles class: three local stand-ins repeat the same resolved checkpoint, discarded lowering emissions, and five no-op mutation methods already maintained together in a canonical test helper. The checkpoint and sink bodies are identical modulo their exported names; the mutator differs in class/object syntax but has the same method inventory and empty bodies. The observation is duplicated test substrate, not a claim that these seams should record more behavior or that another test should exist.

## False-positive check
- Gate-pin check: this is an inbound-boundary witness file, not a census/inventory gate; no pinned corpus count is challenged.
- Recording-double check: all three cited doubles discard calls and contain no recording state. No MUST-NOT assertion or negative witness is being classified as vacuous.
- docs/bugs signature search: `rg -l 'InertMutator|inbound-union-arm-dispatch.*(NOOP|loadFixture)|loadFixture.*inbound-union-arm-dispatch' docs/bugs` returned zero files. The broader file-reference search found bug 0172's landed witness and later enum-identity updates, and bug 0184's preserved first-match-wins premise. This finding does not challenge the RED labels or documented failure signatures.
- Coverage-matrix/bug-doc citation search: `rg -n 'inbound-union-arm-dispatch|loadFixture|InertMutator|NOOP_CHECKPOINT|NOOP_SINK' docs/reference/coverage-matrix.md` returned zero hits. The bug-doc file-reference search found named cells in docs/bugs/0172-inbound-translation-pass-unperformed-at-three-boundaries.md (`binder-parent-union`, `typed-query-union`, `invoke-union`) and docs/bugs/0184-union-arm-literal-lowers-empty-schema.md (`RED (first-match-wins)`). No merge, rename, or deletion of those tests is proposed.
- History/intent check: `git blame -L 1001,1018 tests/inbound-union-arm-dispatch.test.ts` attributes these declarations to ac4687db1; the range history also shows the discarded `runtimeEvent` sink method being removed in 859a2a33. The current duplicate methods are the evidence, not a claim about their original intent.
- Prior-finding check: file-reference searches across quality/issues, quality/resolved, and quality/intake found existing findings about this file's AJV factory, scripted mock, report reader, and child driver, not this inert executor triple. The existing no-op-scaffold findings listed in the brief cite other test files.
- Scope check: all challenged code is in the briefed test file. Canonical helpers are cited only as comparison evidence. No coverage gap, suite-composition change, runtime risk, or production change is asserted.

## Triage
verdict: confirmed — All excerpts and stated searches reproduce: the three stateless doubles at tests/inbound-union-arm-dispatch.test.ts:1001-1018 duplicate SEAM_NOOP_CHECKPOINT/SINK/MUTATOR at tests/helpers/invoke-seam-scaffold.ts:75-94 and are consumed by inertExecuteDeps; the mutator's class form has no additional uses. This is D7 copy-paste-double duplication, with no carve-out or prior finding prescribing or tracking this site's local triple; PTQ-0613 and PTQ-0655 cover different files. (triage: claude-opus-5-5)
