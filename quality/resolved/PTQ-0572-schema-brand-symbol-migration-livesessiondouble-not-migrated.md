---
id: PTQ-0572
title: schema-brand-symbol-migration.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble, parseDeps, ajv and LiveSessionDouble instead of importing tests/helpers/scripted-live-session-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/schema-brand-symbol-migration.test.ts:166-176
  - tests/schema-brand-symbol-migration.test.ts:221-227
  - tests/schema-brand-symbol-migration.test.ts:309-321
  - tests/schema-brand-symbol-migration.test.ts:337-350
  - tests/schema-brand-symbol-migration.test.ts:374-378
  - tests/helpers/scripted-live-session-harness.ts:33-113
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# schema-brand-symbol-migration.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble, parseDeps, ajv and LiveSessionDouble instead of importing tests/helpers/scripted-live-session-harness.ts

## Observation
tests/schema-brand-symbol-migration.test.ts declares its own module-scope
`parseDeps`, `ajv`, `ANTHROPIC_MODEL` fixture object and `SessionEntryDouble`
interface, then builds a local `LiveSessionDouble` class whose
`sendUserMessage`/`tick`/`#append` bodies construct session entries in the
exact same shape `tests/helpers/scripted-live-session-harness.ts`'s exported
`appendUserEntry`/`appendAssistantEntry` pair already produces. That helper
module's own header states it was created (PTQ-0328) because sibling files
"each redeclared byte-for-byte the pieces that carry no cell-specific
variation between them: the fixture model, the `SessionManager` entry shape,
the in-flight-turn state shape, the entry-append pair, and the
document-parsing / AJV factories." Those are exactly the pieces
schema-brand-symbol-migration.test.ts redeclares, and it does not import the
helper module.

## Evidence
tests/schema-brand-symbol-migration.test.ts:166-176 — `parseDeps`,
byte-identical in effect to the helper's exported version below:
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

tests/schema-brand-symbol-migration.test.ts:221-227 — `ajv`, byte-identical
to the helper's exported version below:
```ts
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

tests/schema-brand-symbol-migration.test.ts:309-321 — `ANTHROPIC_MODEL` and
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

tests/schema-brand-symbol-migration.test.ts:337-350 and :374-378 —
`LiveSessionDouble`'s `sendUserMessage` and `#append`, reconstructing inline
exactly the entry shape the helper's `appendUserEntry`/`appendAssistantEntry`
already export:
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
```
```ts
  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
```

tests/helpers/scripted-live-session-harness.ts:33-113 — the canonical
`ANTHROPIC_MODEL`, `SessionEntryDouble`, `appendUserEntry`/
`appendAssistantEntry`/`appendMessageEntry`, `parseDeps`, and `ajv`, all
byte-identical or field-for-field identical to the five local copies cited
above:
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
...
export function appendUserEntry(entries: SessionEntryDouble[], text: string): void {
  appendMessageEntry(entries, { role: "user", content: [{ type: "text", text }], timestamp: 0 });
}
...
function appendMessageEntry(entries: SessionEntryDouble[], message: Record<string, unknown>): void {
  const id = `e${entries.length + 1}`;
  const parentId = entries.length === 0 ? undefined : `e${entries.length}`;
  entries.push({ type: "message", id, parentId, message });
}

export function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
...
export function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

Pattern-wide search: `grep -rln "class LiveSessionDouble" tests/` → 13 files,
including tests/schema-brand-symbol-migration.test.ts. `git log --oneline -1
-- tests/helpers/scripted-live-session-harness.ts` shows PTQ-0328 migrated
only three of that lineage (b0288, b0319, b0414); the reviewed file is not
among them and does not import `tests/helpers/scripted-live-session-harness`.

## Why this is a problem
`tests/helpers/scripted-live-session-harness.ts` exists specifically to hold
this shape after a prior review confirmed the same fixture model, entry
interface, append pattern, `parseDeps` and `ajv` factory were "redeclared
byte-for-byte" across sibling files driving the same
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
live-session shape. tests/schema-brand-symbol-migration.test.ts is a further,
unmigrated instance of exactly that same set of pieces, none of which vary
with this file's own subject (bug 0026's ctor-field brand collision).

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports
`ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, `ajv`, and the
`appendUserEntry`/`appendAssistantEntry` pair this file's `LiveSessionDouble`
reimplements inline; importing them is the existing, purpose-built home for
this exact shape.

## False-positive check
- Gate-pin check: schema-brand-symbol-migration.test.ts does not match
  `*gate*.test.ts` or the named kin; the cited lines are a fixture-model
  constant, a session-double class, and two factory functions, not a pinned
  count or inventory assertion.
- Recording-double check: `LiveSessionDouble` does record calls
  (`sendUserMessageCalls`, `sentQueryTexts`) for later positive assertions
  about what was sent, not a "never called" witness, so the negative-witness
  carve-out does not apply; this finding is about the duplicated
  construction/append/parse/AJV plumbing, not about the recording behaviour
  itself.
- docs/bugs/ signature search: docs/bugs/0026-ctor-field-named-thetaschema-destroyed-by-brand.md
  is this file's own subject; the file's header states groups (a)-(d) are RED
  by design pending the brand-symbol migration and group (e) partially so —
  that documented redness concerns the assertions on `brandSchemaValue`'s
  output, not the harness plumbing (`parseDeps`/`ajv`/`ANTHROPIC_MODEL`/
  `SessionEntryDouble`/`LiveSessionDouble`) this finding cites, so it does not
  bear on this claim.
- coverage-matrix/bug-doc citation search: `grep -rn
  "schema-brand-symbol-migration" docs/reference/coverage-matrix.md
  docs/bugs/*.md` shows the file cited by name only in
  docs/bugs/0026-ctor-field-named-thetaschema-destroyed-by-brand.md, pinning
  its groups (a)-(e) and cell ids, not lines 166-379 (the harness setup this
  finding proposes importing); no merge, rename or deletion of any cited cell
  is proposed.
- Coverage check: the claim is about a duplicated fixture/double DEFINITION,
  not a missing test path; every cell using `LiveSessionDouble` continues to
  pass/red exactly as documented under the current inline definition.
- Overlap/duplicate check: `grep -rl "schema-brand-symbol-migration"
  quality/intake quality/resolved` (excluding this shard's own manifest)
  found 3 pre-existing hits, each naming this file only inside a
  pattern-wide 13-file `grep` list as an UNMIGRATED sibling while citing
  `locations` at a different file entirely (ctor-declaration-order,
  enum-schema-tag-privacy, non-object-receiver-gate); none of those three
  cite tests/schema-brand-symbol-migration.test.ts in their own `locations`
  field, so this is the first filing whose `locations` target this specific
  file's copy.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five excerpts reproduce at the cited lines (parseDeps :166-176, ajv :221-227, ANTHROPIC_MODEL/SessionEntryDouble :309-321, sendUserMessage :337-346, #append :374-378) and are byte-identical / field-for-field identical to tests/helpers/scripted-live-session-harness.ts:33-113's exports, whose PTQ-0328 header names exactly this bundle as the centralised no-variation pieces; `grep -rln "class LiveSessionDouble" tests/` → 13 files incl. this one, harness importers are only b0288/b0319/b0414, and the file has no `helpers/` import; tick()'s variable `reply.stopReason` is only ever fed `"stop"` (:438) so appendAssistantEntry covers it in effect; D7 copy-paste-fixture class in tests/, no carve-out applies (not a gate file, the recording behaviour is untouched, bug-0026's documented redness concerns brandSchemaValue assertions not the harness plumbing); no tracked PTQ row's locations cite this file (PTQ-0328/0229/0214/0314/0386 cite other files) and the same-wave siblings target other files or a different root cause (d7-03: NOOP_CHECKPOINT :195-199) — mechanical import swap (triage: claude-fable-5-1)
