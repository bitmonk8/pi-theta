---
id: PTQ-1737
title: b0478 reimplements the shared producerWithCapture recording double.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts:374-378
  - tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts:416-432
  - tests/helpers/scripted-live-session-harness.ts:229-250
sites: 2
fix_scope: module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# b0478 reimplements the shared producerWithCapture recording double.

## Observation
The production-route harness in `tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts` declares a local `CapturedNote` and `producerWithCapture`. The factory creates a notes array, implements `pi.sendMessage` by pushing into it, and returns that array alongside the production producer. `tests/helpers/scripted-live-session-harness.ts` already exports the same recording double and note shape, accepting the caller's producer dependencies as input. There are two implementations in this comparison: the scoped test's local copy and the canonical helper; the local registry and token-estimator choices are not the duplicated recording mechanism.

## Evidence
`tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts:374-378` — local captured-message shape:

```ts
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
}
```

`tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts:416-425` — local recording double:

```ts
function producerWithCapture(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote[];
} {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
```

`tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts:426-432` — caller-specific dependencies and the factory's return:

```ts
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [BINDER_MODEL],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}
```

`tests/helpers/scripted-live-session-harness.ts:229-234` — shared shape, with an additional optional details field:

```ts
export interface CapturedNote<TDetails = unknown> {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: TDetails;
}
```

`tests/helpers/scripted-live-session-harness.ts:237-250` — canonical recording double:

```ts
export function producerWithCapture<TDetails = unknown>(
  input: Omit<ProductionProducerInput, "pi">,
): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote<TDetails>[];
} {
  const notes: CapturedNote<TDetails>[] = [];
  const pi = {
    sendMessage: (message: CapturedNote<TDetails>): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({ pi, ...input });
  return { deps, notes };
```

The notes-array allocation, `sendMessage` implementation, API cast, producer construction, and returned pair match structurally. The shared version is generic in note details and receives the root/registry through `input`; the scoped version constructs those dependencies locally. The comparison counts these two implementations only, not a repository-wide census.

## Why this is a problem
This is the D7 **copy-paste fixtures/doubles** class: an existing test reimplements a recording double whose canonical helper already accepts its varying dependencies. The dependency choices do not change how messages are recorded or returned, yet that mechanism and its note interface are declared independently in the test. This claim concerns duplicated test code, not whether the captured-message assertions can fail or whether additional behaviours need tests.

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` is the existing shared home for this recording double; the session-context fixture, root overrides, and registry values remain distinct observations of this test's harness.

## False-positive check
- **Gate-pin:** b0478 is not a gate-named test. The cited code constructs a recording double, not a pinned count or inventory; no gate assertion is challenged.
- **Recording-double:** message recording and both positive and negative assertions using it are legitimate. The finding concerns only the duplicate implementation, not the MUST-NOT-witness mechanism or assertion validity.
- **docs/bugs/ signature search:** `rg -n 'Status|b0478|producerWithCapture|rootDouble' docs/bugs/0478-compact-transcript-renderer-throws-on-augmented-agentmessage-variants.md` identifies the fixed status at line 3 and the witness file at line 221, with no factory-specific exception. This is not a report about a disabled or red test. The documented type-level tripwire is also not challenged.
- **Coverage-matrix/bug-doc citation search:** `rg -n 'b0478|producerWithCapture' docs/reference/coverage-matrix.md` returns no matches. `rg -n 'b0478' docs/bugs` finds the witness list in `docs/bugs/0478-compact-transcript-renderer-throws-on-augmented-agentmessage-variants.md:221` and an entry-shape reference in `docs/bugs/0482-prompt-drive-treats-host-auto-compaction-as-turn-settled.md:28`. No merge, rename, or deletion of any cited test is proposed.
- **Existing-topic check:** the existing b0478-related reports were inspected. PTQ-0452 covers its parse/root/AJV plumbing, PTQ-0697 covers its agent-message constructors, and PTQ-0535 cites b0478 as census context while filing the b0381/e2e-s5/echo-value cluster. None files this local note-capture factory against the shared helper. The current D2 candidate mentioning b0478 concerns production transcript code, not this recording double.
- **Intent check:** `git log -1 --format='%h %s' -S 'function producerWithCapture' -- tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts` locates the original bug-0478 witness commit `27a2a68c`; the analogous search for `export function producerWithCapture` in the shared helper locates `3957ef84`. The local double predates the shared export; this is a remaining local implementation, not evidence of an intentional competing capture protocol.
- **Coverage boundary:** only existing test harness code is judged. No missing test, suite-composition change, runtime-risk claim, or production-code change is part of the finding.

## Triage
verdict: confirmed — Both cited implementations reproduce: b0478 independently declares the same note shape and notes-array/sendMessage/producer-return mechanism already exported by the shared helper, whose input accepts its distinct root and registry; this is D7 copy-paste-double duplication, not a challenge to recording assertions, and no existing or resolved PTQ tracks or prescribes this local capture implementation. (triage: claude-opus-5-5)
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
