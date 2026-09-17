---
id: PTQ-0459
title: ctor-declaration-order.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble and parseDeps byte-for-byte instead of importing tests/helpers/scripted-live-session-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/ctor-declaration-order.test.ts:145-155
  - tests/ctor-declaration-order.test.ts:207-219
  - tests/ctor-declaration-order.test.ts:221-262
  - tests/helpers/scripted-live-session-harness.ts:42-55
  - tests/helpers/scripted-live-session-harness.ts:63-100
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# ctor-declaration-order.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble and parseDeps byte-for-byte instead of importing tests/helpers/scripted-live-session-harness.ts

## Observation
tests/ctor-declaration-order.test.ts declares its own module-scope `parseDeps`,
`ANTHROPIC_MODEL` fixture object and `SessionEntryDouble` interface, then
builds a local `LiveSessionDouble` class whose `sendUserMessage`/`tick`
bodies append session entries with the exact same shape the exported
`appendUserEntry`/`appendAssistantEntry` helpers in
`tests/helpers/scripted-live-session-harness.ts` already produce.
`tests/helpers/scripted-live-session-harness.ts`'s own header states it was
created (PTQ-0328) because three sibling files "each redeclared byte-for-byte
the pieces that carry no cell-specific variation between them: the fixture
model, the `SessionManager` entry shape, the in-flight-turn state shape, the
entry-append pair, and the document-parsing/AJV factories." Those exact
pieces are what ctor-declaration-order.test.ts redeclares, and it does not
import the helper module.

## Evidence
tests/ctor-declaration-order.test.ts:145-155 — `parseDeps`, byte-identical to
the helper's export below:
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

tests/ctor-declaration-order.test.ts:207-219 — `ANTHROPIC_MODEL` and
`SessionEntryDouble`, byte-identical (field-for-field) to the helper's
exports below, differing only in the doc-comment wording above
`ANTHROPIC_MODEL`:
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

tests/ctor-declaration-order.test.ts:221-262 — `LiveSessionDouble`, whose
`sendUserMessage`/`tick`/`#append` reconstruct exactly the shape the helper's
`appendUserEntry`/`appendAssistantEntry`/`appendMessageEntry` already export:
```ts
class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  sendUserMessageCalls = 0;
  readonly sentQueryTexts: string[] = [];

  #idle = true;

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

Pattern-wide search: `grep -rn "class LiveSessionDouble" tests/` → 13 files
(b0413-pic51b-non-error-terminators-witness, ctor-declaration-order,
ctor-proto-named-field, empty-query-annotation, enum-schema-tag-privacy,
interpolated-result-gate, interpolation-parse-diagnostics,
non-object-receiver-gate, prompt-provider-field-derivation,
schema-brand-symbol-migration, typed-query-provider-gate,
typed-repair-two-phase, typed-two-phase-live). `git log --oneline -1 --
tests/helpers/scripted-live-session-harness.ts` shows PTQ-0328 migrated only
three of that lineage (b0288, b0319, b0414 — the header's own naming);
ctor-declaration-order.test.ts is not among the three and does not import
`tests/helpers/scripted-live-session-harness`.

## Why this is a problem
`tests/helpers/scripted-live-session-harness.ts` exists specifically to hold
this shape after a prior review confirmed the same fixture model, entry
interface and append pattern were "redeclared byte-for-byte" across
sibling files. ctor-declaration-order.test.ts's own module header even names
`tests/interpolated-result-gate.test.ts` as the file whose `LiveSessionDouble`
shape it deliberately reused ("the shape bug 0079's witness established … Both
files are reused as patterns; neither is modified") — an explicit statement
that the pattern was copied rather than imported, for a shape a canonical
helper already centralises for a subset of its other siblings.

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports
`ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, and the
`appendUserEntry`/`appendAssistantEntry` pair this file's `LiveSessionDouble`
reimplements inline; importing them is the existing, purpose-built home for
this exact shape.

## False-positive check
- Gate-pin check: ctor-declaration-order.test.ts does not match `*gate*.test.ts`
  or the named kin; the cited lines are a fixture-model constant and a
  session-double class, not a pinned count or inventory assertion.
- Recording-double check: `LiveSessionDouble` does record calls
  (`sendUserMessageCalls`, `sentQueryTexts`) for later positive assertions
  about what was sent, not a "never called" witness, so the negative-witness
  carve-out does not apply; this finding is about the duplicated
  construction/append plumbing, not about the recording behaviour itself.
- docs/bugs/ signature search: docs/bugs/0080-keys-values-construction-order-not-declaration-order.md
  Status "fixed (0.70.0)". The file is not a documented correct-reason red;
  `npx vitest run tests/ctor-declaration-order.test.ts` passes at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "ctor-declaration-order"
  docs/reference/coverage-matrix.md docs/bugs/*.md` shows the file cited by
  name in docs/bugs/0026, 0080, 0119, 0120, 0121, each pinning specific `it()`
  cell ranges (e.g. 0119's `:679-718` cell F, 0121's `:540-553`). None of
  those citations target lines 145-262, the shared harness setup this finding
  proposes importing from the helper; no merge, rename or deletion of any
  cited cell is proposed.
- Coverage check: the claim is about a duplicated fixture/double DEFINITION,
  not a missing test path; every cell in the file that uses `LiveSessionDouble`
  continues to pass under the current inline definition.

## Triage
verdict: confirmed — independently re-verified: ANTHROPIC_MODEL (:207-212) and SessionEntryDouble (:214-219) match the helper's :42-55 exports field-for-field, parseDeps (:145-155) is value-identical to helper :91-99 (differs only in the modelMatcher line wrap, not "byte-identical" as stated), and LiveSessionDouble's sendUserMessage/tick/#append (:221-262) rebuild the exact user/assistant entry shapes and e{n}/parent chain of appendUserEntry/appendAssistantEntry/appendMessageEntry (:63-86); `grep -rln "class LiveSessionDouble" tests/` → 13 files and the helper is imported only by b0288/b0319/b0414 (PTQ-0328's three locations), ctor-declaration-order imports only ./helpers/e2e-s1 and ./helpers/registry-oracle; the helper landed in feefe7ca (2026-09-14) after this file (a03d22d6, 2026-08-04) so it is a helper-created-later/not-migrated instance matching the store's per-file convention (PTQ-0314/0386); no carve-out applies (not a gate test, recording double is not the subject, file is green 27/27 so no documented red, bug-doc citations target :451/:540/:679 not :145-262, no cell merge/rename proposed); not a duplicate — PTQ-0328 ruled only b0288/b0319/b0414 and explicitly kept the divergent session-double behaviour local (this filing respects that boundary), PTQ-0260 covers this file's registry read at :181-195, and the wave's sibling intake candidates name other lineage files (triage: claude-fable-5-1)
