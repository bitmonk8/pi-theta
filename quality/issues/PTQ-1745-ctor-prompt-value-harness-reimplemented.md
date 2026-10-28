---
id: PTQ-1745
title: ctor-field-type-check.test.ts repeats the prompt execution harness exported by prompt-value-harness.ts.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/ctor-field-type-check.test.ts:778-789
  - tests/ctor-field-type-check.test.ts:791-803
  - tests/ctor-field-type-check.test.ts:827-834
  - tests/helpers/prompt-value-harness.ts:32-35
  - tests/helpers/prompt-value-harness.ts:46-58
  - tests/helpers/prompt-value-harness.ts:61-69
  - tests/helpers/fixture-dispatch-harness.ts:182-192
  - tests/helpers/call-with-clause-harness.ts:174-180
  - tests/helpers/invoke-seam-scaffold.ts:75-79
sites: 2
fix_scope: module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# ctor-field-type-check.test.ts repeats the prompt execution harness exported by prompt-value-harness.ts.

## Observation
The constructor-field test defines an inert checkpoint, a fixed-ID runtime root, and a producer using a three-method Pi double and an empty model registry, then constructs a prompt binding and calls `executeBody` itself. `tests/helpers/prompt-value-harness.ts` already exports this producer configuration and the binding/execution sequence as `producer` and `bindAndExecute`. There are two implementations of this harness in the compared site set: the local test implementation and the canonical helper implementation. The local parse-refusal branch and fixture identity are separate from the duplicated execution plumbing; the existing helper accepts the theta input and an explicit context.

## Evidence
Local checkpoint and root, `tests/ctor-field-type-check.test.ts:778-789`:
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

Local producer, `tests/ctor-field-type-check.test.ts:791-803`:
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

Local execution sequence, `tests/ctor-field-type-check.test.ts:827-834`:
```ts
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  return { kind: "ran", execution: await executeBody(theta.body, binding.executeDeps) };
}
```

Canonical producer, `tests/helpers/prompt-value-harness.ts:46-58`:
```ts
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

Canonical execution sequence, `tests/helpers/prompt-value-harness.ts:61-69`:
```ts
export function bindAndExecute(
  deps: ReturnType<typeof producer>,
  theta: ThetaCompositionInput,
  ctx: ExtensionCommandContext = ctxDouble(),
): Promise<BodyExecution> {
  const bindInput: ConversationBindInput = { theta, args: "", ctx };
  const binding = deps.bindPromptConversation(bindInput);
  return executeBody(theta.body, binding.executeDeps);
}
```

The helper imports its doubles rather than defining another local set, `tests/helpers/prompt-value-harness.ts:32-35`:
```ts
import { rootWith } from "./fixture-dispatch-harness";
import { noopPi } from "./call-with-clause-harness";
import { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./invoke-seam-scaffold";
import { ctxDouble } from "./tool-call-dispatch-harness";
```

The default root has the same checkpoint and ID fields as the local double, `tests/helpers/fixture-dispatch-harness.ts:182-192`:
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

The Pi double has the same three inert methods, `tests/helpers/call-with-clause-harness.ts:174-180`:
```ts
export function noopPi(): ExtensionAPI {
  return {
    sendMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
}
```

The shared checkpoint matches the local implementation, `tests/helpers/invoke-seam-scaffold.ts:75-79`:
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

These are the two counted implementations, not a repository-wide occurrence count. The canonical producer's optional schema-validator and callee-parser overrides are absent with its default argument; its context parameter permits the local empty context without using its default context. The local `ran` wrapper is not part of the shared helper's return value.

## Why this is a problem
This is D7 boilerplate duplication and copy-paste doubles: the test independently maintains the same checkpoint/ID/Pi configuration and `ConversationBindInput` → `bindPromptConversation` → `executeBody` sequence that its canonical test helper already owns. The excerpts show equivalence of the executable setup, not merely similar naming: identical ID strings, resolving no-op checkpoint, empty active-tools list, inert message/tool setters, empty registry, empty arguments, and execution of the supplied theta body with the binding's dependencies. The duplicated portion contains no constructor-field assertion or refusal policy. `tests/helpers/prompt-value-harness.ts` is the existing shared home for this sequence.

## False-positive check
- Gate-pin check: the scoped file is not a gate/pin inventory test, and the cited material is setup/execution plumbing rather than an expected census count.
- Recording-double check: the quoted checkpoint, runtime root and Pi object are inert doubles, not recording doubles used to prove that a call never happened. No negative-witness assertion is challenged.
- docs/bugs/ signature search: inspected `docs/bugs/0031-ctor-field-value-typing-unchecked.md`, whose status at lines 3-6 is fixed and whose offline lock at lines 143-150 names the constructor and production-executor observables. This finding is not about the file's historical `RED` labels, disabling tests, or a documented failure signature; its assertions and refusal branch are not challenged.
- Coverage-matrix/bug-doc citation search: `rg -n 'ctor-field-type-check' docs/bugs docs/reference/coverage-matrix.md` finds bug-document references and no coverage-matrix entry. In particular, bug 0031 lines 143-150 pins e1–e5, and `docs/bugs/0149-field-name-case-positions-unenforced.md:323-327` explicitly cites this test's production execution path as precedent. Those citations are acknowledged: this finding proposes no merge, rename or deletion of any cited test, and does not dispute use of the production binding/executor path.
- Prior-finding check: `rg -l 'ctor-field-type-check' quality/issues quality/resolved quality/intake` before filing returned PTQ-0256, PTQ-0260, PTQ-0460, PTQ-0991 and PTQ-1361. Their observations concern diagnostic-code or registry/message helpers, not this runtime harness. PTQ-0848 concerns the declaration-order/proto-named live-session harness; PTQ-1073 concerns a different test's copy of the prompt-value harness. Neither cites this local constructor-field execution implementation.
- Intent/history check: `git log --format='%h %s' -- tests/ctor-field-type-check.test.ts` traces the witness to `8ae94691` (bug 0031), while the corresponding helper history traces its shared home to `118fa3e7`. The test's own producer comments describe generic channel and active-tool seams, matching the canonical helper's comments; the fixture-specific refusal and branding observations remain outside the duplicated setup.
- Coverage boundary: the claim concerns existing duplicated test plumbing only. It requests no additional test, different suite composition, runtime-behaviour change, or expanded coverage.

## Triage
verdict: confirmed — Verified equivalent checkpoint, inv-1/tc-1 root, inert Pi triple, empty registry and empty-args binding/execution sequence in the local test and shared producer/bindAndExecute helpers; the helper accepts the local empty context without changing parse refusal, fixture identity or assertions. This is D7 boilerplate/copy-paste-double duplication under tests/, with no applicable carve-out or prior finding covering this constructor-field execution copy. (triage: claude-opus-5-5)
