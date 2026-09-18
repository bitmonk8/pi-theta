---
id: PTQ-0815
title: prompt-provider-field-derivation.test.ts's LiveSessionDouble reimplements appendUserEntry/appendAssistantEntry/appendMessageEntry it does not import from the same helper module
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/prompt-provider-field-derivation.test.ts:167-211
  - tests/helpers/scripted-live-session-harness.ts:66-94
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# prompt-provider-field-derivation.test.ts's LiveSessionDouble reimplements appendUserEntry/appendAssistantEntry/appendMessageEntry it does not import from the same helper module

## Observation
`tests/prompt-provider-field-derivation.test.ts` imports `ANTHROPIC_MODEL`,
`SessionEntryDouble`, `ajv` and `parse` from
`tests/helpers/scripted-live-session-harness.ts`, but its local
`LiveSessionDouble` class's `sendUserMessage`/`tick`/`#append` methods
construct the exact `{ role, content, ..., timestamp: 0 }` message shapes and
the exact `id`/`parentId` derivation that the same helper module already
exports as `appendUserEntry`/`appendAssistantEntry` (built on the internal
`appendMessageEntry`) — without importing them.

## Evidence

`tests/prompt-provider-field-derivation.test.ts:167-211`:
```ts
  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    if (this.#throwOnSend !== undefined) {
      throw this.#throwOnSend;
    }
    this.sentQueryTexts.push(content);
    this.#append({
      role: "user",
      content: [{ type: "text", text: content }],
      timestamp: 0,
    });
    this.#idle = false;
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /** Complete the in-flight streamed turn (inert while idle — a stray poll settles nothing). */
  tick(): void {
    if (this.#idle) {
      return;
    }
    const reply = this.#queue.shift();
    if (reply === undefined) {
      // No silent skipping: a drive that opens more turns than the cell
      // scripted fails loudly instead of hanging the poll loop.
      throw new Error("live session double: a driven turn completed with an EMPTY reply queue");
    }
    this.#append({
      role: "assistant",
      content: reply.text !== undefined ? [{ type: "text", text: reply.text }] : [],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: reply.stopReason,
      ...(reply.errorMessage !== undefined ? { errorMessage: reply.errorMessage } : {}),
      timestamp: 0,
    });
    this.#idle = true;
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
```

`tests/helpers/scripted-live-session-harness.ts:66-94` (the exported
counterpart the file above does not call):
```ts
export function appendUserEntry(entries: SessionEntryDouble[], text: string): void {
  appendMessageEntry(entries, { role: "user", content: [{ type: "text", text }], timestamp: 0 });
}

/** Append an `assistant` message entry (the scripted-session shape every lineage file shares). */
export function appendAssistantEntry(
  entries: SessionEntryDouble[],
  text: string | undefined,
  stopReason = "stop",
  errorMessage?: string,
): void {
  appendMessageEntry(entries, {
    role: "assistant",
    content: text !== undefined ? [{ type: "text", text }] : [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "m1",
    stopReason,
    ...(errorMessage !== undefined ? { errorMessage } : {}),
    timestamp: 0,
  });
}

/** Append one message entry, deriving its `id`/`parentId` from the existing chain. */
function appendMessageEntry(entries: SessionEntryDouble[], message: Record<string, unknown>): void {
  const id = `e${entries.length + 1}`;
  const parentId = entries.length === 0 ? undefined : `e${entries.length}`;
  entries.push({ type: "message", id, parentId, message });
}
```

Search: `grep -rl "appendUserEntry\|appendAssistantEntry" tests/` returns 13
files (`b0288-prompt-turn-completion-witness.test.ts`,
`b0319-prompt-bidirectional-ctx-abort-witness.test.ts`,
`b0414-preabort-send-issued-witness.test.ts`, `ctor-declaration-order.test.ts`,
`empty-query-annotation.test.ts`, `enum-schema-tag-privacy.test.ts`,
`helpers/scripted-live-session-harness.ts`,
`interpolated-result-gate.test.ts`, `non-object-receiver-gate.test.ts`,
`respond-tool-wire.test.ts`, `schema-brand-symbol-migration.test.ts`,
`typed-query-provider-gate.test.ts`, `typed-two-phase-live.test.ts`), all
calling the exported pair — `tests/prompt-provider-field-derivation.test.ts`
is not among them despite importing four other exports from the very same
module (`ANTHROPIC_MODEL`, `SessionEntryDouble`, `ajv`, `parse`, per its own
`import { ANTHROPIC_MODEL, type SessionEntryDouble, ajv, parse } from
"./helpers/scripted-live-session-harness"`).

## Why this is a problem
The helper module's own header states it centralises "the pieces that carry
no cell-specific variation between them: the fixture model, the
`SessionManager` entry shape, … and the document-parsing / AJV factories,"
explicitly separating that shared entry-append shape from each file's own
`sendUserMessage`/`tick`/`isIdle` behaviour, which the header says is where
"the three files' behaviour actually diverges." The append/id-derivation
logic in `prompt-provider-field-derivation.test.ts`'s `#append` is not part
of that local divergence — it is the identical shared shape the module
already exports as `appendUserEntry`/`appendAssistantEntry`, restated by
hand in a file that already imports other pieces from the same module.

## Suggested direction (non-binding, optional)
Calling the module's existing `appendUserEntry(this.entries, content)` and
`appendAssistantEntry(this.entries, reply.text, reply.stopReason,
reply.errorMessage)` from inside `sendUserMessage`/`tick`, dropping the
private `#append`, would use the already-imported module's own exports for
the piece the module's header identifies as shared.

## False-positive check
- Gate-pin check: `tests/prompt-provider-field-derivation.test.ts` does not
  match `*gate*.test.ts` or the named gate kin; the cited lines are message-
  construction/id-derivation logic, not a pinned count or inventory
  assertion.
- Recording-double check: `LiveSessionDouble` records calls
  (`sendUserMessageCalls`, `sentQueryTexts`) for positive assertions about
  what was sent, not a "never called" MUST-NOT witness; the negative-witness
  carve-out does not apply — this finding is about the duplicated
  append/id-derivation plumbing, not the recording behaviour.
- docs/bugs/ signature search: `grep -rl "prompt-provider-field-derivation"
  docs/bugs/` finds only docs/bugs/0009 (the file's own subject, the
  `.provider`-vs-`.api` derivation defect), which does not discuss or pin
  this append-logic shape; the file passes at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n
  "prompt-provider-field-derivation" docs/reference/coverage-matrix.md
  docs/bugs/*.md` shows no citation of the specific lines inside
  `LiveSessionDouble`; no merge, rename or deletion of any `it()`/`describe()`
  is proposed.
- Coverage check: the claim is about a duplicated double-construction
  DEFINITION, not a missing test path; every cell in the file that uses
  `LiveSessionDouble` continues to pass under the current inline definition.
- Prior-finding check: `quality/resolved/PTQ-0668-provider-field-derivation-scripted-session-not-migrated.md`
  (status: fixed) already cited and fixed this file's redeclaration of
  `ANTHROPIC_MODEL`/`SessionEntryDouble`/`parseDeps`/`parse`/`ajv` from the
  same helper, and its own Evidence section explicitly named the
  `LiveSessionDouble#append` shape as "duplicated in shape (not cited as a
  location, offered as corroboration only)" — that filing did not cite these
  lines as a location and the current file (re-read at HEAD) still carries
  the unmigrated `#append`/`sendUserMessage`/`tick` logic untouched by that
  fix; this filing cites those lines directly as its own location, so it is
  not a re-file of PTQ-0668.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/prompt-provider-field-derivation.test.ts:167-212 and tests/helpers/scripted-live-session-harness.ts:66-94; sed-extracted snippets diffed under $TEMP show the `#append` body (:210-212) identical to the helper's `appendMessageEntry` (:91-93) modulo `this.`, the user shape (:173-177) identical to `appendUserEntry`, and the assistant shape (:196-205) identical to `appendAssistantEntry` modulo `reply.` prefix and shorthand-vs-longhand properties (`text: text`/`stopReason: stopReason`); `#append` is live (2 callers :173/:196); the stated 13-file `appendUserEntry|appendAssistantEntry` grep reproduces exactly and the target is absent from it while importing four other exports from the same module (:55); docs/bugs hits are only 0009/0010's own witness citations, coverage-matrix → 0, file passes at HEAD (5/5), not a gate test, recording fields are positive-assertion counters not a MUST-NOT witness, no merge/rename/delete proposed; D7 boilerplate-duplication class in tests/ only, and the migrated sibling enum-schema-tag-privacy.test.ts:247/265 already uses the exact `appendUserEntry(this.entries, content)`/`appendAssistantEntry(this.entries, reply.text, reply.stopReason)` shape so the direction is mechanical; not a duplicate — PTQ-0668 (fixed, commit cc0a8fe7) cited only :90-95/:149-156/:242-271 as locations and named `#append` as "corroboration only", its fix left these lines untouched, so this is a genuine half-migrated residual in the same pattern PTQ-0228/0431 were accepted on; the same-wave sibling d7-01-b0413-b0415 cites only b0413/b0415 ranges and d7-01-ctor-proto-named-field cites a different file (triage: claude-fable-5-1)
