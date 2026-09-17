---
id: PTQ-0726
title: typed-query-provider-gate.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble, parseDeps and ajv() byte-for-byte instead of importing tests/helpers/scripted-live-session-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/typed-query-provider-gate.test.ts:164-169
  - tests/typed-query-provider-gate.test.ts:330-335
  - tests/typed-query-provider-gate.test.ts:345-406
  - tests/typed-query-provider-gate.test.ts:443-450
  - tests/typed-query-provider-gate.test.ts:466-472
  - tests/helpers/scripted-live-session-harness.ts:42-55
  - tests/helpers/scripted-live-session-harness.ts:64-89
  - tests/helpers/scripted-live-session-harness.ts:92-100
  - tests/helpers/scripted-live-session-harness.ts:113-119
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# typed-query-provider-gate.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble, parseDeps and ajv() byte-for-byte instead of importing tests/helpers/scripted-live-session-harness.ts

## Observation
tests/typed-query-provider-gate.test.ts declares its own module-scope
`ANTHROPIC_MODEL` fixture object, `SessionEntryDouble` interface, a local
`LiveSessionDouble` class, and `parseDeps`/`ajv` factory functions. The file's
own doc comment on `LiveSessionDouble` (lines 337-344) states it is "duplicated
from tests/typed-two-phase-live.test.ts". `tests/helpers/scripted-live-session-harness.ts`
already exports byte-identical (or field-for-field identical)
`ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, `ajv`, and an
`appendUserEntry`/`appendAssistantEntry` pair that the local
`LiveSessionDouble`'s `sendUserMessage`/`tick`/`#append` reconstruct inline —
that helper's own header states it was created (PTQ-0328) precisely because
sibling files "redeclared byte-for-byte the pieces that carry no
cell-specific variation between them: the fixture model, the `SessionManager`
entry shape, the in-flight-turn state shape, the entry-append pair, and the
document-parsing / AJV factories." The file does not import the helper.

## Evidence

tests/typed-query-provider-gate.test.ts:164-169 — `ANTHROPIC_MODEL`, field-for-field identical to the helper's export:
```ts
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

tests/typed-query-provider-gate.test.ts:330-335 — `SessionEntryDouble`, field-for-field identical to the helper's export:
```ts
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

tests/typed-query-provider-gate.test.ts:345-406 — `LiveSessionDouble`, whose
`sendUserMessage`/`tick`/`#append` reconstruct inline exactly the entry shape
the helper's `appendUserEntry`/`appendAssistantEntry` already export (the
class's own doc comment names the copied source):
```ts
/**
 * The live user-session double (duplicated from
 * tests/typed-two-phase-live.test.ts): `sendUserMessage` commits the `user`
 * entry and marks the session streaming; `tick()` (from the injected `Clock`'s
 * `setTimeout`) completes the in-flight streamed turn with the scripted
 * trailing `assistant` entry; the reply queue is STICKY-LAST so over-driving
 * stays observable as the `sendUserMessageCalls` COUNT pin.
 */
class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  sendUserMessageCalls = 0;
  readonly sentQueryTexts: string[] = [];
  ...
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
}
```

tests/typed-query-provider-gate.test.ts:443-450 — `parseDeps`, byte-identical to the helper's exported version:
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

tests/typed-query-provider-gate.test.ts:466-472 — `ajv`, byte-identical to the helper's exported version:
```ts
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

tests/helpers/scripted-live-session-harness.ts:42-55 — the canonical, already-exported `ANTHROPIC_MODEL` and `SessionEntryDouble`:
```ts
export const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
export interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

tests/helpers/scripted-live-session-harness.ts:64-89 — the canonical entry-append pair, whose bodies are the same role/content/timestamp shape `LiveSessionDouble`'s `sendUserMessage`/`tick` build inline:
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

function appendMessageEntry(entries: SessionEntryDouble[], message: Record<string, unknown>): void {
  const id = `e${entries.length + 1}`;
  const parentId = entries.length === 0 ? undefined : `e${entries.length}`;
  entries.push({ type: "message", id, parentId, message });
}
```

tests/helpers/scripted-live-session-harness.ts:92-100 and :113-119 — the canonical `parseDeps` and `ajv`, byte-identical to the two local copies cited above.

Pattern-wide search: `grep -rln "class LiveSessionDouble" tests/*.ts` → 13 files
(b0413-pic51b-non-error-terminators-witness, ctor-declaration-order,
ctor-proto-named-field, empty-query-annotation, enum-schema-tag-privacy,
interpolated-result-gate, interpolation-parse-diagnostics,
non-object-receiver-gate, prompt-provider-field-derivation,
schema-brand-symbol-migration, typed-query-provider-gate,
typed-repair-two-phase, typed-two-phase-live). PTQ-0328 migrated only three of
a different lineage (b0288/b0319/b0414, which use `class ScriptedLiveSession`,
not `class LiveSessionDouble`); none of the 13 `LiveSessionDouble` files import
`tests/helpers/scripted-live-session-harness`.

## Why this is a problem
`tests/helpers/scripted-live-session-harness.ts` exists specifically to hold
this shape (fixture model, session-entry interface, entry-append pair,
`parseDeps`, `ajv`) after PTQ-0328 confirmed the same pieces were redeclared
byte-for-byte across sibling files driving the same
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
live-session shape. typed-query-provider-gate.test.ts's own doc comment
already names `tests/typed-two-phase-live.test.ts` as the file it copied
`LiveSessionDouble` from, and none of the five redeclared pieces cited above
varies with this file's own subject (the bug-0010 runtime provider gate).

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports
`ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, `ajv`, and the
`appendUserEntry`/`appendAssistantEntry` pair this file's `LiveSessionDouble`
reimplements inline; importing them is the existing, purpose-built home for
this exact shape, leaving the file's own `RecordingPi`, `respondFixture`,
`rootDouble` and gate-specific assertions local.

## False-positive check
- Gate-pin check: the file's name matches `*gate*.test.ts`, but the carve-out
  covers pinned-count/inventory assertions inside census/pin gate files, not
  every observation about such a file; this finding is about a redeclared
  setup double, not about a pinned count or inventory the file asserts BY
  DESIGN, so the carve-out does not apply.
- Recording-double check: `LiveSessionDouble` does record calls
  (`sendUserMessageCalls`, `sentQueryTexts`) for later positive/negative
  assertions the gate cells make (e.g. asserting ZERO calls), but this finding
  is about the duplicated construction/append/parse/AJV plumbing around that
  double, not about the recording behaviour itself, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -n "typed-query-provider-gate" docs/bugs/*.md`
  shows the file cited by name in docs/bugs/0010, 0013 and 0480, each pinning
  specific line ranges of the header/cell area (e.g. 0013's `:49-58`,
  `:60-68`); none of those citations targets lines 164-472, the shared harness
  setup this finding proposes importing from the helper, and this finding
  proposes no merge, rename or deletion of any cited cell.
- coverage-matrix.md citation search: `grep -n "typed-query-provider-gate"
  docs/reference/coverage-matrix.md` → no hits.
- Already-filed check: searched quality/intake, quality/issues and
  quality/resolved for "LiveSessionDouble" and "typed-query-provider-gate" —
  the sibling findings filed this wave for the same lineage (e.g.
  enum-schema-tag-privacy, non-object-receiver-gate, interpolated-result-gate,
  schema-brand-symbol-migration, ctor-declaration-order,
  prompt-provider-field-derivation) each name a different file; none names
  typed-query-provider-gate.test.ts, so this is a new site of the same class
  rather than a re-filing.
- Coverage check: the claim is about a duplicated fixture/double DEFINITION,
  not a missing test path; every cell in the file that uses
  `LiveSessionDouble` continues to pass under the current inline definition.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: ANTHROPIC_MODEL (:164-169), SessionEntryDouble (:330-335), parseDeps (:443-450) and ajv (:466-472) byte-diff identical to tests/helpers/scripted-live-session-harness.ts exports (:42-47/:50-55/:92-100/:113-119), `#append` (:402-405) is the helper's appendMessageEntry body and sendUserMessage matches appendUserEntry, the file imports nothing from the helper (grep: 0 hits; helper's only importers are the b0288/b0319/b0414 ScriptedLiveSession lineage PTQ-0328 migrated), `class LiveSessionDouble` greps to exactly 13 unmigrated files; no D7 carve-out applies (gate-name carve-out covers pinned counts, not setup plumbing; recording behaviour untouched; docs/bugs 0010/0013/0480 cite :49-58/:60-68 only; coverage-matrix no hits; no merge/rename/delete) and not a duplicate (PTQ-0328/0214/0314/0386/0229 name other files; same-wave d7-159-02 on this file is the distinct rootDouble/registryDouble/ctxDouble/drive copy from typed-two-phase-live). One caveat for the fixer: the local tick() writes a variable stopReason plus optional errorMessage, so the helper's appendAssistantEntry (hardcoded "stop") does NOT cover it — only the four named pieces plus the user-entry/#append half are mechanical imports (triage: claude-fable-5-1)
