---
id: PTQ-0464
title: enum-schema-tag-privacy.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble, parseDeps and ajv() byte-for-byte instead of importing tests/helpers/scripted-live-session-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/enum-schema-tag-privacy.test.ts:151-161
  - tests/enum-schema-tag-privacy.test.ts:194-200
  - tests/enum-schema-tag-privacy.test.ts:254-266
  - tests/enum-schema-tag-privacy.test.ts:268-324
  - tests/helpers/scripted-live-session-harness.ts:42-55
  - tests/helpers/scripted-live-session-harness.ts:64-89
  - tests/helpers/scripted-live-session-harness.ts:92-100
  - tests/helpers/scripted-live-session-harness.ts:113-119
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# enum-schema-tag-privacy.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble, parseDeps and ajv() byte-for-byte instead of importing tests/helpers/scripted-live-session-harness.ts

## Observation
tests/enum-schema-tag-privacy.test.ts declares its own module-scope
`parseDeps`, `ajv`, `ANTHROPIC_MODEL` fixture object and `SessionEntryDouble`
interface, then builds a local `LiveSessionDouble` class whose
`sendUserMessage`/`tick`/`#append` bodies construct session entries in the
exact same shape the exported `appendUserEntry`/`appendAssistantEntry` pair in
`tests/helpers/scripted-live-session-harness.ts` already produces. That helper
module's own header states it was created (PTQ-0328) because sibling files
"each redeclared byte-for-byte the pieces that carry no cell-specific
variation between them: the fixture model, the `SessionManager` entry shape,
the in-flight-turn state shape, the entry-append pair, and the
document-parsing / AJV factories." Those are exactly the pieces
enum-schema-tag-privacy.test.ts redeclares, and it does not import the helper
module.

## Evidence
tests/enum-schema-tag-privacy.test.ts:151-161 — `parseDeps`, byte-identical to
the helper's exported version below:
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

tests/enum-schema-tag-privacy.test.ts:194-200 — `ajv`, byte-identical (module
prefix aside) to the helper's exported version below:
```ts
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

tests/enum-schema-tag-privacy.test.ts:254-266 — `ANTHROPIC_MODEL` and
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

tests/enum-schema-tag-privacy.test.ts:268-324 — `LiveSessionDouble`, whose
`sendUserMessage`/`tick`/`#append` reconstruct inline exactly the entry shape
the helper's `appendUserEntry`/`appendAssistantEntry` already export:
```ts
  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    this.#append({
      role: "user",
      content: [{ type: "text", text: content }],
      timestamp: 0,
    });
    this.#idle = false;
  }
  ...
  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
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

tests/helpers/scripted-live-session-harness.ts:64-89 — the canonical
entry-append pair, whose bodies are the same role/content/timestamp shape
`LiveSessionDouble`'s `sendUserMessage`/`tick` build inline:
```ts
export function appendUserEntry(entries: SessionEntryDouble[], text: string): void {
  appendMessageEntry(entries, { role: "user", content: [{ type: "text", text }], timestamp: 0 });
}
...
function appendMessageEntry(entries: SessionEntryDouble[], message: Record<string, unknown>): void {
  const id = `e${entries.length + 1}`;
  const parentId = entries.length === 0 ? undefined : `e${entries.length}`;
  entries.push({ type: "message", id, parentId, message });
}
```

tests/helpers/scripted-live-session-harness.ts:92-100 and :113-119 — the
canonical `parseDeps` and `ajv`, byte-identical to the two local copies cited
above.

Pattern-wide search: `grep -rln "class LiveSessionDouble" tests/` → 13 files
(b0413-pic51b-non-error-terminators-witness, ctor-declaration-order,
ctor-proto-named-field, empty-query-annotation, enum-schema-tag-privacy,
interpolated-result-gate, interpolation-parse-diagnostics,
non-object-receiver-gate, prompt-provider-field-derivation,
schema-brand-symbol-migration, typed-query-provider-gate,
typed-repair-two-phase, typed-two-phase-live). `git log --oneline -1 --
tests/helpers/scripted-live-session-harness.ts` shows PTQ-0328 migrated only
three of that lineage (b0288, b0319, b0414 — the header's own naming);
enum-schema-tag-privacy.test.ts is not among the three and does not import
`tests/helpers/scripted-live-session-harness`.

## Why this is a problem
`tests/helpers/scripted-live-session-harness.ts` exists specifically to hold
this shape after a prior review confirmed the same fixture model, entry
interface, append pattern, `parseDeps` and `ajv` factory were "redeclared
byte-for-byte" across sibling files driving the same
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
live-session shape. enum-schema-tag-privacy.test.ts is a fourth, unmigrated
instance of exactly that same set of pieces, none of which vary with this
file's own subject (bug 0020's forged-tag classification).

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports
`ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, `ajv`, and the
`appendUserEntry`/`appendAssistantEntry` pair this file's `LiveSessionDouble`
reimplements inline; importing them is the existing, purpose-built home for
this exact shape.

## False-positive check
- Gate-pin check: enum-schema-tag-privacy.test.ts does not match
  `*gate*.test.ts` or the named kin; the cited lines are a fixture-model
  constant, a session-double class, and two factory functions, not a pinned
  count or inventory assertion.
- Recording-double check: `LiveSessionDouble` does record calls
  (`sendUserMessageCalls`, `sentQueryTexts`) for later positive assertions
  about what was sent, not a "never called" witness, so the negative-witness
  carve-out does not apply; this finding is about the duplicated
  construction/append/parse/AJV plumbing, not about the recording behaviour
  itself.
- docs/bugs/ signature search: docs/bugs/0020-enum-schema-tags-presence-only-forgeable.md
  Status "fixed (0.32.0)"; the file is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn "enum-schema-tag-privacy"
  docs/reference/coverage-matrix.md docs/bugs/*.md` shows the file cited by
  name in docs/bugs/0020, 0026, 0027, 0028, 0032, 0067, 0119, 0120, 0173, each
  pinning specific cell ranges (e.g. 0028's `:744-757` cell f1, 0119's
  `:486-502`, 0120's `:427`, `:435`, `:487-518`). None of those citations
  target lines 151-324, the shared harness setup this finding proposes
  importing from the helper; no merge, rename or deletion of any cited cell is
  proposed.
- Coverage check: the claim is about a duplicated fixture/double DEFINITION,
  not a missing test path; every cell in the file that uses
  `LiveSessionDouble` continues to pass under the current inline definition.

## Triage
verdict: confirmed — independently re-verified: all four local declarations reproduce at the cited lines (parseDeps :151-161 and ajv :194-200 byte-identical to tests/helpers/scripted-live-session-harness.ts:92-100/:113-119 modulo the helper's one-line modelMatcher formatting; ANTHROPIC_MODEL/SessionEntryDouble :254-266 field-for-field identical to :42-55; LiveSessionDouble#append :319-323 byte-identical to appendMessageEntry :85-89, and the sole instantiation at :384 passes stopReason "stop", so tick's assistant entry reduces to appendAssistantEntry's literal), `grep -rln "class LiveSessionDouble" tests/` → the same 13 files, the helper's only importers are b0288/b0319/b0414 (git feefe7ca = PTQ-0328), and no open/resolved PTQ names enum-schema-tag-privacy.test.ts (PTQ-0328 covered only the three b-files; sibling same-wave intake filings target other files) — D7 copy-paste fixture/double in tests/ only, no gate/recording-double/coverage-matrix carve-out applies, same class as accepted PTQ-0314/0386 per-file follow-ons (triage: claude-fable-5-1)
