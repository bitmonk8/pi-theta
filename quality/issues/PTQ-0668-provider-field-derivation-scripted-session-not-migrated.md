---
id: PTQ-0668
title: prompt-provider-field-derivation.test.ts redeclares tests/helpers/scripted-live-session-harness.ts's ANTHROPIC_MODEL/SessionEntryDouble/parseDeps/parse/ajv byte-for-byte instead of importing them
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/prompt-provider-field-derivation.test.ts:90-95
  - tests/prompt-provider-field-derivation.test.ts:149-156
  - tests/prompt-provider-field-derivation.test.ts:242-271
  - tests/helpers/scripted-live-session-harness.ts:33-47
  - tests/helpers/scripted-live-session-harness.ts:88-113
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# prompt-provider-field-derivation.test.ts redeclares tests/helpers/scripted-live-session-harness.ts's ANTHROPIC_MODEL/SessionEntryDouble/parseDeps/parse/ajv byte-for-byte instead of importing them

## Observation
`tests/prompt-provider-field-derivation.test.ts` declares, module-scope, its own `ANTHROPIC_MODEL` fixture object, `SessionEntryDouble` interface, `parseDeps()`, `parse()` and `ajv()` — five pieces that are byte-identical (including the literal path string `"probe.theta"` and the exact same error messages) to the same five pieces already exported by `tests/helpers/scripted-live-session-harness.ts`, a helper module whose own header states it exists because sibling files "each redeclared byte-for-byte the pieces that carry no cell-specific variation between them: the fixture model, the `SessionManager` entry shape, … and the document-parsing / AJV factories." `tests/prompt-provider-field-derivation.test.ts` does not import this helper.

## Evidence

`tests/prompt-provider-field-derivation.test.ts:90-95` (`ANTHROPIC_MODEL`):
```ts
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

`tests/helpers/scripted-live-session-harness.ts:33-40` (byte-identical, exported):
```ts
export const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

`tests/prompt-provider-field-derivation.test.ts:149-156` (`SessionEntryDouble`):
```ts
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

`tests/helpers/scripted-live-session-harness.ts:42-47` (byte-identical, exported):
```ts
export interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

`tests/prompt-provider-field-derivation.test.ts:242-264` (`parseDeps` + `parse`):
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

/** Parse `.theta` source through the production whole-file parser (must be clean). */
function parse(src: string): ThetaDocument {
  const source: ThetaSource = {
    path: "probe.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}
```

`tests/helpers/scripted-live-session-harness.ts:88-104` (byte-identical body, exported, same `"probe.theta"` path and same messages):
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

/** Parse `.theta` source through the production whole-file parser (must be clean). */
export function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}
```

`tests/prompt-provider-field-derivation.test.ts:266-271` (`ajv`) matches `tests/helpers/scripted-live-session-harness.ts:107-113` (byte-identical, exported) apart from the slug expression (`JSON.stringify(schema)` in both, identical).

Also duplicated in shape (not cited as a location, offered as corroboration): `tests/prompt-provider-field-derivation.test.ts`'s `LiveSessionDouble#append` private method (lines 233-237) reconstructs the same `id`/`parentId` derivation the helper's exported `appendMessageEntry` performs, and its `sendUserMessage`/`tick` build the same `{ role, content, ... }` message shapes the helper's exported `appendUserEntry`/`appendAssistantEntry` already produce.

## Why this is a problem
`tests/helpers/scripted-live-session-harness.ts` exists specifically to hold this shape after a prior review confirmed the same fixture model, entry interface, parse scaffolding and AJV factory were redeclared byte-for-byte across sibling files (its header names three migrated siblings: b0288, b0319, b0414). `tests/prompt-provider-field-derivation.test.ts` carries the identical `ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, `parse` (down to the same `"probe.theta"` path literal and the same two `expect(...)` messages) and `ajv` the helper already exports, but does not import the helper — a sibling in the same lineage left outside the migration the helper's own header describes.

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports `ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, `parse`, `ajv`, and the `appendUserEntry`/`appendAssistantEntry` append pair; importing them is the existing, purpose-built home for this exact shape.

## False-positive check
- Gate-pin check: `tests/prompt-provider-field-derivation.test.ts` does not match `*gate*.test.ts` or the named gate kin; the cited lines are a fixture constant, an interface, and parse/AJV factory functions, not a pinned count or inventory assertion.
- Recording-double check: `LiveSessionDouble` records calls (`sendUserMessageCalls`, `sentQueryTexts`) for later positive assertions about what was sent, not a "never called" witness; the negative-witness carve-out does not apply — this finding is about the duplicated construction/parse plumbing, not the recording behaviour.
- docs/bugs/ signature search: `grep -rl "prompt-provider-field-derivation" docs/bugs/` finds docs/bugs/0009 (the file's own subject, the `.provider`-vs-`.api` derivation defect), which does not discuss or pin this harness-duplication shape; the file passes at HEAD (its RED cells are pinned to the bug-0009 derivation, not to this substrate).
- coverage-matrix/bug-doc citation search: `grep -n "prompt-provider-field-derivation" docs/reference/coverage-matrix.md docs/bugs/*.md` shows no citation of specific line ranges inside the harness setup (lines 90-271); no merge, rename or deletion of any cited `it()`/`describe()` is proposed.
- Coverage check: the claim is about a duplicated fixture/double DEFINITION, not a missing test path; every cell in the file that uses these pieces continues to pass under the current inline definitions.
- Prior-finding check: a sibling finding in this wave (`qw20260917154546-d7-01-ctor-declaration-order-scriptedlivesession-not-migrated.md`) names `tests/prompt-provider-field-derivation.test.ts` only inside its "Pattern-wide search" grep list (13 files carrying `class LiveSessionDouble`) as context for a different file (`tests/ctor-declaration-order.test.ts`); it does not cite `tests/prompt-provider-field-derivation.test.ts` as a location. This finding cites it directly, since it is in this wave's review scope, and is therefore not a re-file.

## Triage
verdict: confirmed — independently re-verified: all five pieces reproduce at the cited target lines (ANTHROPIC_MODEL :90-95, SessionEntryDouble :150-156, parseDeps/parse/ajv :242-271) and match the helper's exports modulo `export` and one object-literal reflow (whitespace-normalised diff of the parseDeps/parse/ajv trio is identical; helper lines drifted to :42/:50/:92/:103/:113 — content match, small drift tolerated); `grep -rln scripted-live-session-harness tests/` returns only b0288/b0319/b0414 so the target does not import the helper; D7 copy-paste-fixture class inside tests/, not a gate test, passes at HEAD (5/5), no merge/rename/delete proposed, docs/bugs/0009 cites the file only as its witness; not a duplicate — PTQ-0328 covers b0288/b0319/b0414 only, no open/resolved PTQ cites this file, and the wave siblings (d7-01 ctor-declaration-order, d7-01 b0413-b0415 trio, d7-01 enum-schema-tag, d7-02 non-object-receiver, d7-157-01 typed-query-provider-gate) name it only in roster/context lists while d7-159-01 explicitly defers to this filing (triage: claude-fable-5-1)
