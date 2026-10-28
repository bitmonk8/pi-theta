---
id: PTQ-1735
title: Six omission and finalization test files independently rebuild the assistant-message fixture skeleton.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0499-host-omitted-recovery-unit.test.ts:22-26
  - tests/b0499-omission-disposition.test.ts:36-39
  - tests/b0500-bounded-snapshot-representation.test.ts:9-12
  - tests/b0500-finalization-safety.test.ts:11-13
  - tests/b0500-finalization.test.ts:10-12
  - tests/b0500-round2-driver-loop.test.ts:21-23
  - tests/helpers/b0500-finalization-composition.ts:19-23
sites: 6
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Six omission and finalization test files independently rebuild the assistant-message fixture skeleton.

## Observation
Six scoped files define local assistant-message constructors that each spell out the role, text-content array, model/API/provider metadata, terminal-stop default and fixed timestamp. The constructors differ in fixture model identity and in whether they accept a stop reason, an error message, or additional tool-call content. The existing `b0500Assistant(model, text)` helper already owns the model-parameterized version of this skeleton, with zero usage included. The count here is six local reimplementations; the helper is comparison evidence, not a seventh counted site.

## Evidence
`tests/b0499-host-omitted-recovery-unit.test.ts:22-26`:
```ts
function assistant(text: string, stopReason: AssistantMessage["stopReason"] = "stop", errorMessage?: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], api: MODEL.api,
    provider: MODEL.provider, model: MODEL.id, timestamp: 0, stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }) } as AssistantMessage;
}
```

`tests/b0499-omission-disposition.test.ts:36-39`:
```ts
function assistant(text: string, stopReason: AssistantMessage["stopReason"] = "stop", errorMessage?: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], api: MODEL.api, provider: MODEL.provider,
    model: MODEL.id, timestamp: 0, stopReason, ...(errorMessage === undefined ? {} : { errorMessage }) } as AssistantMessage;
}
```

`tests/b0500-bounded-snapshot-representation.test.ts:9-12`:
```ts
function assistant(text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], stopReason: "stop",
    api: "openai-responses", provider: "openai", model: "synthetic", timestamp: 0 } as AssistantMessage;
}
```

`tests/b0500-finalization-safety.test.ts:11-13`:
```ts
function a(text = "777", stopReason: AssistantMessage["stopReason"] = "stop", calls: ToolCall[] = []): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }, ...calls], stopReason, api: MODEL.api, provider: MODEL.provider, model: MODEL.id, timestamp: 0 } as AssistantMessage;
}
```

`tests/b0500-finalization.test.ts:10-12`:
```ts
function assistant(text: string, stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], api: MODEL.api, provider: MODEL.provider, model: MODEL.id, stopReason, timestamp: 0 } as AssistantMessage;
}
```

`tests/b0500-round2-driver-loop.test.ts:21-23`:
```ts
function assistant(text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], stopReason: "stop", api: MODEL.api, provider: MODEL.provider, model: MODEL.id, timestamp: 0 } as AssistantMessage;
}
```

Existing helper, `tests/helpers/b0500-finalization-composition.ts:19-23`:
```ts
export function b0500Assistant(model: Model<Api>, text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }], api: model.api, provider: model.provider, model: model.id,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop", timestamp: 0 };
}
```

## Why this is a problem
This is D7's copy-paste-fixture class: six constructors maintain the same SDK message-construction mechanics independently. In particular, the two omission constructors are identical apart from formatting, while the finalization constructors repeat their common skeleton with fewer parameters or an added calls array. Model identity, stop/error stimuli and tool calls are test-specific data; spelling out the surrounding assistant record separately at each site is the duplicated fixture mechanism. This observation does not allege a runtime failure or require the different test scenarios to be combined.

## Suggested direction (non-binding, optional)
The existing model-aware constructor in `tests/helpers/b0500-finalization-composition.ts` and the message-fixture module `tests/helpers/agent-message-fixtures.ts` are the natural shared-helper homes. The existing model-aware helper includes usage whereas the local constructors omit it, so it is not claimed to be a byte-identical drop-in replacement.

## False-positive check
- Gate-pin: inspected all six constructors and their surrounding suites; none is a census/inventory pin gate, and no pinned count is challenged.
- Recording-double: the cited constructors return message data; the finding does not challenge any negative call-recording witness or MUST-NOT assertion.
- docs/bugs/ signature search: inspected the 0499 and 0500 bug records and searched `docs/bugs/` for the six filenames and `b0500Assistant`. No matching filename/helper citation was returned. The records describe the behavioral omission/finalization fixes; this finding does not contest their recorded red signatures or test outcomes.
- Coverage-matrix/bug-doc citation search: searched `docs/reference/coverage-matrix.md` and `docs/bugs/` for the six filenames; no matches. No test merge, rename or deletion is proposed.
- Existing-topic check: searched `quality/` for the six filenames and `b0500Assistant`, with no matches. PTQ-0697 concerns the transcript-reader/b0478 fixture pair, and PTQ-1363 concerns the usage literal inside the canonical helper; neither inventories these six constructors.
- Intent/history: `git log` identifies the omission work in `22d1e095` and the finalization work/helper in `e071eada`; the present constructors retain scenario-specific arguments, which are not disputed here.
- Scope: all reported sites are existing test code. This is a fixture-duplication claim, not a missing-test, suite-composition, production-code or coverage claim.

## Triage
verdict: confirmed — All six local constructors and the comparison helper reproduce at the cited lines; the omission pair is whitespace-equivalent, and all six independently rebuild the same assistant record around scenario-specific model/stop/error/tool-call data. This is D7 copy-paste-fixture duplication under tests/, with the helper's added usage explicitly accounted for; bug records/history disclose no required local shape, no carve-out applies, and resolved PTQ-0693/0697/1313/1363 and the sibling retention-rig filing track different sites or mechanisms. (triage: claude-opus-5-5)
