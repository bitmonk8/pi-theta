---
id: PTQ-1775
title: The prompt-window session double reimplements the shared transcript-entry fixture.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/prompt-window-session-harness.ts:23-23
  - tests/helpers/prompt-window-session-harness.ts:72-77
  - tests/helpers/prompt-window-session-harness.ts:174-183
  - tests/helpers/prompt-window-session-harness.ts:186-190
  - tests/helpers/scripted-live-session-harness.ts:66-71
  - tests/helpers/scripted-live-session-harness.ts:104-108
sites: 1
fix_scope: module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The prompt-window session double reimplements the shared transcript-entry fixture.

## Observation
`prompt-window-session-harness.ts` declares a local `SessionEntryDouble` and a private `#append` method that derives message-entry IDs and parent IDs from the entry-array length. The already-imported `scripted-live-session-harness.ts` exports the same interface and the same append operation as `appendMessageEntry`. This finding counts one local fixture reimplementation; the shared export is comparison evidence. The model-dependent assistant payload is separate from the duplicated entry-envelope construction.

## Evidence
Local import, `tests/helpers/prompt-window-session-harness.ts:23-23`:
```ts
import { parse, rootDouble, sessionBranch } from "./scripted-live-session-harness";
```

Local entry type, `tests/helpers/prompt-window-session-harness.ts:72-77`:
```ts
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

Local append operation, `tests/helpers/prompt-window-session-harness.ts:186-190`:
```ts
  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
```

Canonical entry type, `tests/helpers/scripted-live-session-harness.ts:66-71`:
```ts
export interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

Canonical append operation, `tests/helpers/scripted-live-session-harness.ts:104-108`:
```ts
export function appendMessageEntry(entries: SessionEntryDouble[], message: Record<string, unknown>): void {
  const id = `e${entries.length + 1}`;
  const parentId = entries.length === 0 ? undefined : `e${entries.length}`;
  entries.push({ type: "message", id, parentId, message });
}
```

The window-specific model data is supplied before appending, `tests/helpers/prompt-window-session-harness.ts:174-183`:
```ts
  #appendAssistant(text: string): void {
    this.#append({
      role: "assistant",
      content: [{ type: "text", text }],
      api: this.currentModel.api,
      provider: this.currentModel.provider,
      model: this.currentModel.id,
      stopReason: "stop",
      timestamp: 0,
    });
```

## Why this is a problem
This is D7's copy-paste-fixture class. The entry type is identical apart from `export`, and the append bodies are identical after replacing `this.entries` with the shared function's `entries` parameter. The window-specific model fields do not participate in either derivation: both append operations accept an arbitrary message record. The same transcript-entry envelope and chain convention are therefore maintained independently despite an existing exported helper in a module this file already imports.

## False-positive check
- Gate-pin: inspected the cited helper definitions; neither is a census/pin gate, and no pinned inventory or expected count is challenged.
- Recording-double: the session records traffic, which is legitimate. The claim concerns only its repeated entry-construction mechanism, not a MUST-NOT witness or an assertion on recorded absence.
- docs/bugs/ signature search: `rg -n 'prompt-window-session-harness|appendMessageEntry' docs/bugs docs/reference/coverage-matrix.md` returned no matches. Inspected `docs/bugs/0491-no-frontmatter-thinking-level-pin.md`; its model/thinking-window behavior is not disputed, and no documented red is being treated as a skip.
- Coverage-matrix/bug-doc citation search: the same search returned no filename/helper citations. No test merge, rename, or deletion is proposed.
- Existing-topic check: `rg -l 'prompt-window-session-harness' quality/issues quality/resolved quality/intake` returned no matches before filing. PTQ-0789 concerns the analogous append duplication in b0413/b0415, not this helper. The existing assistant-message-fixture candidates concern payload builders, not this entry envelope.
- Reference/intent check: searched `liveSessionRoot|rootLive|appendMessageEntry` across `src`, `extensions`, `tools`, and `tests`; the returned references are in tests, including existing imports and calls of `appendMessageEntry`. The shared function is explicitly exported, and the local counterpart is a private method, not string-keyed dispatch. `git log`/`git show ee60a538 -- tests/helpers/prompt-window-session-harness.ts` shows the helper was added with bug 0491's model/thinking-window work; the generic append body contains no model/thinking operation.
- Coverage boundary: this reports existing duplicated fixture code, not a missing test, a suite-composition choice, or a behavior defect.

## Triage
verdict: confirmed — Independently verified identical SessionEntryDouble fields and append bodies modulo export/this.entries; the already-imported shared helper accepts the same arbitrary message records, leaving model/thinking behavior untouched. This is D7 copy-paste fixture duplication under tests/; searches and ee60a538 reproduce, no carve-out applies, and PTQ-0789/0328 cover different consumers rather than prescribing this local copy. (triage: claude-opus-5-5)
