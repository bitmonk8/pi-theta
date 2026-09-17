---
id: PTQ-0564
title: non-object-receiver-gate.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble and the entry-append pair instead of importing tests/helpers/scripted-live-session-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/non-object-receiver-gate.test.ts:188-198
  - tests/non-object-receiver-gate.test.ts:389-401
  - tests/non-object-receiver-gate.test.ts:403-441
  - tests/helpers/scripted-live-session-harness.ts:42-50
  - tests/helpers/scripted-live-session-harness.ts:64-84
  - tests/helpers/scripted-live-session-harness.ts:92-100
sites: 3
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# non-object-receiver-gate.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble and the entry-append pair instead of importing tests/helpers/scripted-live-session-harness.ts

## Observation
`tests/non-object-receiver-gate.test.ts` declares its own module-scope
`parseDeps`, `ANTHROPIC_MODEL` fixture object and `SessionEntryDouble`
interface, then builds a local `LiveSessionDouble` class whose
`sendUserMessage`/`tick`/`#append` bodies construct session entries in the
exact same shape `tests/helpers/scripted-live-session-harness.ts`'s exported
`appendUserEntry`/`appendAssistantEntry` pair already produces, and whose
`ANTHROPIC_MODEL`/`SessionEntryDouble`/`parseDeps` are field-for-field
identical to that helper's exports. The helper module's own header states it
was created (PTQ-0328) because sibling files "each redeclared byte-for-byte
the pieces that carry no cell-specific variation between them: the fixture
model, the `SessionManager` entry shape, the in-flight-turn state shape, the
entry-append pair, and the document-parsing / AJV factories" — exactly the
pieces this file also redeclares.

## Evidence
tests/non-object-receiver-gate.test.ts:188-198 — `parseDeps`, byte-identical
(module-comment-length aside) to the helper's exported version:
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

tests/non-object-receiver-gate.test.ts:389-401 — `ANTHROPIC_MODEL` and
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

tests/non-object-receiver-gate.test.ts:403-441 — `LiveSessionDouble`, whose
`sendUserMessage`/`tick`/`#append` reconstruct inline exactly the entry shape
the helper's `appendUserEntry`/`appendAssistantEntry` already export:
```ts
  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    this.#append({ role: "user", content: [{ type: "text", text: content }], timestamp: 0 });
    this.#idle = false;
  }
  ...
  tick(): void {
    if (this.#idle) {
      return;
    }
    this.#append({
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: "stop",
      timestamp: 0,
    });
    this.#idle = true;
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
```

tests/helpers/scripted-live-session-harness.ts:42-50 — the canonical,
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

tests/helpers/scripted-live-session-harness.ts:64-84 — the canonical
entry-append pair, whose bodies are the same role/content/timestamp shape
`LiveSessionDouble`'s `sendUserMessage`/`tick` build inline:
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

tests/helpers/scripted-live-session-harness.ts:92-100 — the canonical
`parseDeps`, byte-identical to the local copy cited above:
```ts
export function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

Pattern-wide search: `grep -rln "class LiveSessionDouble" tests/` → 13 files
(b0413-pic51b-non-error-terminators-witness, ctor-declaration-order,
ctor-proto-named-field, empty-query-annotation, enum-schema-tag-privacy,
interpolated-result-gate, interpolation-parse-diagnostics,
non-object-receiver-gate, prompt-provider-field-derivation,
schema-brand-symbol-migration, typed-query-provider-gate,
typed-repair-two-phase, typed-two-phase-live). `git log --oneline -1 --
tests/helpers/scripted-live-session-harness.ts` shows PTQ-0328 migrated only
three of that lineage (b0288, b0319, b0414 — the header's own naming);
non-object-receiver-gate.test.ts is not among the three and does not import
`tests/helpers/scripted-live-session-harness`.

## Why this is a problem
`tests/helpers/scripted-live-session-harness.ts` exists specifically to hold
this shape after a prior review confirmed the same fixture model, entry
interface, append pattern and `parseDeps` factory were "redeclared
byte-for-byte" across sibling files driving the same
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
live-session shape. non-object-receiver-gate.test.ts is a further, unmigrated
instance of that same set of pieces, none of which vary with this file's own
subject (bug 0027's receiver-dispatch gate) — the file's own `LiveSessionDouble`
adds only the `sendUserMessageCalls`/`sentQueryTexts` recording fields on top
of the canonical entry shape.

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports
`ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, and the
`appendUserEntry`/`appendAssistantEntry` pair this file's `LiveSessionDouble`
reimplements inline; importing them (keeping the file's own recording fields
and `tick`/`isIdle` behaviour local, since those genuinely vary) is the
existing, purpose-built home for the shared pieces.

## False-positive check
- Gate-pin check: non-object-receiver-gate.test.ts does not match
  `*gate*.test.ts` or the named kin for the cited lines — these are a fixture
  model constant, a session-entry interface and factory functions, not a
  pinned count or inventory assertion. (The filename itself contains "gate"
  because it names the runtime "receiver gate" under test, not a
  census/pin-gate file — the file has no pinned corpus count or inventory.)
- Recording-double check: `LiveSessionDouble` does record calls
  (`sendUserMessageCalls`, `sentQueryTexts`) for later positive assertions
  about what was sent, not a "never called" witness, so the negative-witness
  carve-out does not apply; this finding is about the duplicated
  construction/append/parse plumbing, not the recording behaviour itself.
- docs/bugs/ signature search: docs/bugs/0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md
  is open and is the reason this file's probes are RED-by-design; that status
  is orthogonal to the harness-plumbing duplication claimed here.
- coverage-matrix/bug-doc citation search: `grep -rn "non-object-receiver-gate"
  docs/reference/coverage-matrix.md docs/bugs/*.md` shows the file cited only
  by docs/bugs/0027 as its own witness file, with no cell citations at the
  lines this finding proposes importing from the helper; no merge, rename or
  deletion of any cited cell is proposed.
- Coverage check: the claim is about a duplicated fixture/double DEFINITION,
  not a missing test path; every cell in the file that uses
  `LiveSessionDouble` continues to pass/RED exactly as documented under the
  current inline definition.

## Triage
verdict: confirmed — independently re-verified: all three local ranges (parseDeps :188-198, ANTHROPIC_MODEL/SessionEntryDouble :389-401, LiveSessionDouble :403-441) match verbatim and the helper exports at :42-50/:64-84/:92-100 are identical modulo a trailing comma (#append is line-for-line appendMessageEntry; sendUserMessage/tick payloads equal appendUserEntry/appendAssistantEntry("ok")); `grep -rln "class LiveSessionDouble" tests/` → 13 files, helper importers are exactly b0288/b0319/b0414 (PTQ-0328's three, commit feefe7ca), and the file has no helpers/ import; D7 copy-paste-fixture class, tests/-only, the *gate* carve-out protects pinned counts (none touched) and bug-0027 RED posture is unchallenged; minor inaccuracy noted — bugs 0032/0036/0117(:923)/0125(:221-292) also cite the file, but none at the proposed ranges and no cell merge/rename/delete is proposed; not tracked (PTQ-0328 covers b0288/b0319/b0414 only, PTQ-0229 covers b0287/b0289; same-wave siblings cite other lines/targets) (triage: claude-fable-5-1)
