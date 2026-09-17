---
id: PTQ-0556
title: interpolated-result-gate.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble and parseDeps byte-for-byte instead of importing tests/helpers/scripted-live-session-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/interpolated-result-gate.test.ts:238-248
  - tests/interpolated-result-gate.test.ts:424-436
  - tests/interpolated-result-gate.test.ts:438-479
  - tests/helpers/scripted-live-session-harness.ts:42-55
  - tests/helpers/scripted-live-session-harness.ts:63-100
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# interpolated-result-gate.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble and parseDeps byte-for-byte instead of importing tests/helpers/scripted-live-session-harness.ts

## Observation
tests/interpolated-result-gate.test.ts declares its own module-scope
`parseDeps`, `ANTHROPIC_MODEL` fixture object and `SessionEntryDouble`
interface, then builds a local `LiveSessionDouble` class whose
`sendUserMessage`/`tick`/`#append` bodies construct session entries in the
same role/content/timestamp shape the exported
`appendUserEntry`/`appendAssistantEntry` pair in
`tests/helpers/scripted-live-session-harness.ts` already produces. That
helper module's own header states it was created (PTQ-0328) because sibling
files "each redeclared byte-for-byte the pieces that carry no cell-specific
variation between them: the fixture model, the `SessionManager` entry shape,
the in-flight-turn state shape, the entry-append pair, and the
document-parsing/AJV factories." Those are exactly the pieces
interpolated-result-gate.test.ts redeclares, and it does not import the
helper module.

## Evidence
tests/interpolated-result-gate.test.ts:238-248 — `parseDeps`, byte-identical
in body to the helper's exported version below (only the trailing brace's
formatting differs):
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}
```

tests/interpolated-result-gate.test.ts:424-436 — `ANTHROPIC_MODEL` and
`SessionEntryDouble`, field-for-field identical to the helper's exports:
```ts
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

tests/interpolated-result-gate.test.ts:438-479 — `LiveSessionDouble`, whose
`sendUserMessage`/`tick`/`#append` reconstruct inline exactly the entry
shape the helper's `appendUserEntry`/`appendAssistantEntry`/
`appendMessageEntry` already export:
```ts
class LiveSessionDouble {
  ...
  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    this.#append({ role: "user", content: [{ type: "text", text: content }], timestamp: 0 });
    this.#idle = false;
  }
  ...
  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}
```

tests/helpers/scripted-live-session-harness.ts:42-55 — the canonical,
already-exported `ANTHROPIC_MODEL` and `SessionEntryDouble`:
```ts
export const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

export interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

tests/helpers/scripted-live-session-harness.ts:63-100 — the canonical
entry-append pair and `parseDeps`, whose bodies are the same
role/content/timestamp shape `LiveSessionDouble`'s `sendUserMessage`/`tick`
build inline, and the same `parseDeps` body cited above:
```ts
export function appendUserEntry(entries: SessionEntryDouble[], text: string): void {
  appendMessageEntry(entries, { role: "user", content: [{ type: "text", text }], timestamp: 0 });
}

export function appendAssistantEntry(
  entries: SessionEntryDouble[],
  text: string | undefined,
): void {
  appendMessageEntry(entries, {
    role: "assistant",
    content: text !== undefined ? [{ type: "text", text }] : [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "m1",
    stopReason: "stop",
    timestamp: 0,
  });
}
```

Pattern-wide search (already run and cited by a sibling finding in this
wave, re-verified here): `grep -rln "class LiveSessionDouble" tests/` → 13
files, including `interpolated-result-gate.test.ts` itself. `git log
--oneline -1 -- tests/helpers/scripted-live-session-harness.ts` shows
PTQ-0328 migrated only three of that lineage (b0288, b0319, b0414 — the
header's own naming); interpolated-result-gate.test.ts is not among the
three and does not import `tests/helpers/scripted-live-session-harness`.

## Why this is a problem
`tests/helpers/scripted-live-session-harness.ts` exists specifically to hold
this shape after a prior review confirmed the same fixture model, entry
interface, append pattern and `parseDeps` factory were "redeclared
byte-for-byte" across sibling files driving the same
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
live-session shape. interpolated-result-gate.test.ts is a further,
unmigrated instance of that same set of pieces, none of which vary with this
file's own subject (the bug-0079/0114/0116/0118 interpolated-`Result`
witnesses).

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports
`ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, and the
`appendUserEntry`/`appendAssistantEntry` pair this file's `LiveSessionDouble`
reimplements inline; importing them is the existing, purpose-built home for
this exact shape. This file's own header text ("Both files are reused as
patterns; neither is modified" — quoted by a sibling finding) documents that
this file was itself treated as a pattern for later files rather than
migrated to the shared helper.

## False-positive check
- Gate-pin check: interpolated-result-gate.test.ts is a bug-witness file
  pinning specific diagnostic/panic dispositions per docs/bugs/0079, 0114,
  0116, 0118 (not a census/inventory-count gate of the kind the carve-out
  lists); the cited lines are a fixture-model constant, a session-double
  class, and a factory function, not a pinned count or inventory assertion.
- Recording-double check: `LiveSessionDouble` does record calls
  (`sendUserMessageCalls`, `sentQueryTexts`) for later positive assertions
  about what was sent, not a "never called" witness, so the negative-witness
  carve-out does not apply; this finding is about the duplicated
  construction/append/parse plumbing, not about the recording behaviour
  itself.
- docs/bugs/ signature search: every RED cell in this file cites its owning
  bug (0079/0114/0116/0118) by its own §Fix/§Reproduction anchors — this is a
  documented correct-reason-red file. This finding does not propose changing,
  merging, or removing any `it()` cell or its red/green disposition; it is
  scoped only to the shared fixture-construction lines cited above, all of
  which sit above the file's first `describe` block.
- coverage-matrix/bug-doc citation search: `grep -rn
  "interpolated-result-gate.test.ts" docs/reference/coverage-matrix.md
  docs/bugs/*.md` shows the file cited by name across many bug docs (0079,
  0114, 0115, 0116, 0117, 0118, 0122, 0153, 0193, 0194, 0196, 0199, 0201,
  0223, 0224, 0265), each pinning specific cell ranges (e.g. 0114's `:925`,
  `:947`, `:521–552`). None of those citations target lines 238-248,
  424-479, the shared harness setup this finding proposes importing from the
  helper; no merge, rename or deletion of any cited cell is proposed.
- Coverage check: the claim is about a duplicated fixture/double
  DEFINITION, not a missing test path; every cell in the file that uses
  `LiveSessionDouble` continues to pass under the current inline definition.

## Triage
verdict: confirmed — independently re-verified: diff of tests/interpolated-result-gate.test.ts:238-248 vs tests/helpers/scripted-live-session-harness.ts:92-101 (parseDeps) and :424-436 vs :42-55 (ANTHROPIC_MODEL, SessionEntryDouble) differ only in `export` and one brace-wrap; LiveSessionDouble#append (:475-479) is byte-identical to the helper's appendMessageEntry and its sendUserMessage/tick messages match appendUserEntry/appendAssistantEntry field-for-field; `grep -rln "class LiveSessionDouble" tests/` → 13 files, the helper is imported only by b0288/b0319/b0414 (commit feefe7ca, PTQ-0328), and this file imports neither it nor e2e-s1; all locations in tests/, class copy-paste fixture/double; not a pinned-count gate (cited lines are fixture definitions above the first describe), no cell merge/rename proposed, and no docs/bugs or coverage-matrix citation targets 238-248/424-479; not tracked by PTQ-0328/0229/0214/0314/0386/0405 (none name this file) and wave siblings file other lineage files — one non-blocking nit: the "Both files are reused as patterns; neither is modified" quote lives in tests/ctor-declaration-order.test.ts:139, not this file's header (triage: claude-fable-5-1)
