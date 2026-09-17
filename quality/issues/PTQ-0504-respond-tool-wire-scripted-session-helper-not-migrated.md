---
id: PTQ-0504
title: respond-tool-wire.test.ts redeclares ajv(), the ANTHROPIC_MODEL fixture, and the entry-append pair tests/helpers/scripted-live-session-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/respond-tool-wire.test.ts:114-121
  - tests/respond-tool-wire.test.ts:443-448
  - tests/respond-tool-wire.test.ts:837-897
  - tests/respond-tool-wire.test.ts:940-945
  - tests/helpers/scripted-live-session-harness.ts:36-84
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# respond-tool-wire.test.ts redeclares ajv(), the ANTHROPIC_MODEL fixture, and the entry-append pair tests/helpers/scripted-live-session-harness.ts already exports

## Observation
tests/respond-tool-wire.test.ts declares its own module-scope `ajv()`
factory, its own `{id:"m1", api:"anthropic-messages", provider:"anthropic",
strictCapable:true}` model literal (inlined twice), and its own
`OnSessionDouble` class whose `sendUserMessage`/`tick`/`#append` bodies build
session entries in the same shape as the exported
`appendUserEntry`/`appendAssistantEntry` pair in
tests/helpers/scripted-live-session-harness.ts. That helper module's header
states it exists to hold exactly "the fixture model, the `SessionManager`
entry shape, … the entry-append pair, and the … AJV factories" so sibling
files driving the same scripted-live-session shape stop redeclaring them.
respond-tool-wire.test.ts does not import the helper module.

## Evidence
tests/helpers/scripted-live-session-harness.ts:36-84 — the canonical exports:
```ts
export const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
...
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
and (same file, the ajv factory):
```ts
export function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

tests/respond-tool-wire.test.ts:114-121 — `ajv()`, byte-identical:
```ts
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

tests/respond-tool-wire.test.ts:443-448 — the model literal (inlined again at
:940-945), field-for-field identical to `ANTHROPIC_MODEL`:
```ts
  const model = {
    id: "m1",
    api: "anthropic-messages",
    provider: "anthropic",
    strictCapable: true,
  };
```

tests/respond-tool-wire.test.ts:837-897 — `OnSessionDouble`'s
`sendUserMessage`/`tick`/`#append`, reconstructing inline the same entry
shape the helper's `appendUserEntry`/`appendAssistantEntry`/
`appendMessageEntry` already export:
```ts
  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.#append({ role: "user", content: [{ type: "text", text: content }], timestamp: 0 });
    this.#idle = false;
  }
  ...
    this.#append({
      role: "assistant",
      content: [{ type: "text", text: "done" }],
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

Exact search: `grep -rn "^function ajv" tests/respond-tool-wire.test.ts` → one
hit, no `import … from "./helpers/scripted-live-session-harness"` anywhere in
the file (`grep -n "scripted-live-session-harness" tests/respond-tool-wire.test.ts`
→ 0 hits). Prior lens-D7 findings in this wave (e.g.
`enum-schema-tag-privacy-livesessiondouble-not-migrated`) searched
`grep -rln "class LiveSessionDouble" tests/` for this lineage; that search
does not surface this file because its double is named `OnSessionDouble`,
not `LiveSessionDouble`, even though its `#append`/`sendUserMessage`/model/ajv
bodies are the same duplicated shape.

## Why this is a problem
tests/helpers/scripted-live-session-harness.ts exists specifically to hold
this shape (its header: "each redeclared byte-for-byte the pieces that carry
no cell-specific variation … the fixture model, the `SessionManager` entry
shape, … the entry-append pair, and the … AJV factories"). This is boilerplate
duplication: the same three pieces — model fixture, entry-append helper, ajv
factory — are re-declared in respond-tool-wire.test.ts rather than imported,
none of them varying with this file's own subject (the respond-tool wire
contract).

## Suggested direction (non-binding, optional)
tests/helpers/scripted-live-session-harness.ts already exports
`ANTHROPIC_MODEL`, `ajv`, and the `appendUserEntry`/`appendAssistantEntry`
pair `OnSessionDouble` reimplements inline; importing them is the existing,
purpose-built home for this exact shape.

## False-positive check
- Gate-pin check: respond-tool-wire.test.ts does not match `*gate*.test.ts`
  or the named kin; the cited lines are a factory function, a fixture
  literal, and a recording double's internals, not a pinned count or
  inventory assertion.
- Recording-double check: `OnSessionDouble` does record calls
  (`sendUserMessageCalls`) for positive assertions about what was sent, not a
  "never called" MUST-NOT witness, so the negative-witness carve-out does not
  apply; this finding is about the duplicated construction/append/ajv
  plumbing, not the recording behaviour itself.
- docs/bugs/ signature search: `grep -n "respond-tool-wire" docs/bugs/*.md`
  shows the file cited by docs/bugs/0028-…md (Status: fixed) as the wire-
  contract witness; it is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn "respond-tool-wire"
  docs/reference/coverage-matrix.md docs/bugs/*.md` — the file name appears in
  docs/bugs/0028's own text (as the file that proves its fix), not pinning
  any specific line range this finding touches (114-121, 443-448, 837-897,
  940-945 are harness plumbing, not the bug's asserted cells). No merge,
  rename, or deletion of any `it()`/`describe()` is proposed.
- Coverage check: the claim is entirely about a repeated harness/fixture
  DEFINITION, not a missing test path; every cell using `ajv()`,
  `OnSessionDouble`, or the model literal is exercised and passing.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: tests/respond-tool-wire.test.ts:114-121 `ajv()` is byte-identical to the harness export (scripted-live-session-harness.ts:118-124), the model literal at :443-448 and :940-945 is field-for-field `ANTHROPIC_MODEL` (:42-47), and `OnSessionDouble.#append`/`sendUserMessage`/`tick` (:850-896) rebuild the exact `appendMessageEntry`/`appendUserEntry`/`appendAssistantEntry` bodies (:60-84) while the file has zero imports from ./helpers/scripted-live-session-harness (grep: 0 hits); the harness exists specifically to hold these invariant pieces (PTQ-0328, confirmed+fixed for the b0288/b0319/b0414 trio) and the suggested direction keeps the double's behaviour local as its header requires; not a gate test, no it()/describe() merge proposed, docs/bugs/0028+0055 cite the file's assertion cells (:141-157, enum-root cells) not the plumbing lines here; no open/resolved issue cites this file for this shape (sibling intake candidates target other files) (triage: claude-fable-5-1)
