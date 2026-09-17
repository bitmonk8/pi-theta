---
id: PTQ-0550
title: empty-query-annotation.test.ts redeclares the scripted-live-session-harness scaffold instead of importing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/empty-query-annotation.test.ts:207-221
  - tests/empty-query-annotation.test.ts:417-423
  - tests/empty-query-annotation.test.ts:471-476
  - tests/empty-query-annotation.test.ts:485-542
  - tests/empty-query-annotation.test.ts:567-573
  - tests/helpers/scripted-live-session-harness.ts:1-98
sites: 1
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# empty-query-annotation.test.ts redeclares the scripted-live-session-harness scaffold instead of importing it

## Observation
`tests/empty-query-annotation.test.ts` builds its own `ANTHROPIC_MODEL`
fixture, `SessionEntryDouble` interface, `LiveSessionDouble` class (with its
own private `#append` entry-appending method), `ajv()` factory, and a
`makeDeps()`/`parseSource()` pair — all pieces `tests/helpers/scripted-live-
session-harness.ts` (added 2026-09-14, after this file existed) exports as
`ANTHROPIC_MODEL`, `SessionEntryDouble`, `appendUserEntry`/
`appendAssistantEntry`, `ajv()`, and `parseDeps()`/`parse()` respectively. The
helper's own header names itself as the centralisation of exactly "the
fixture model, the `SessionManager` entry shape, the in-flight-turn state
shape, the entry-append pair, and the document-parsing / AJV factories" for
this family of prompt-mode witness files. The in-scope file does not import
it.

## Evidence

`tests/empty-query-annotation.test.ts:207-221` (parse-deps + parse, vs. the
helper's `parseDeps()`/`parse()`):
```ts
function makeDeps(): ParseThetaDocumentDeps {
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

function parseSource(src: string): ThetaDocument {
  const source: ThetaSource = { path: FILE, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}
```

`tests/empty-query-annotation.test.ts:417-423` (vs. the helper's exported
`ANTHROPIC_MODEL`, byte-identical fixture):
```ts
/** The user session's selected model (`ctx.model`). */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

`tests/empty-query-annotation.test.ts:471-476` (vs. the helper's exported
`SessionEntryDouble`, byte-identical shape):
```ts
/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}
```

`tests/empty-query-annotation.test.ts:485-542` (`LiveSessionDouble`'s
`#append`, vs. the helper's `appendUserEntry`/`appendAssistantEntry`/internal
append):
```ts
class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  /** Proof of user-visible traffic — the post-fix refusal pins this at 0. */
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
```

`tests/empty-query-annotation.test.ts:567-573` (vs. the helper's exported
`ajv()`, byte-identical body):
```ts
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

`tests/helpers/scripted-live-session-harness.ts:33-98` (the canonical
exports):
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
export function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

export function parse(src: string): ThetaDocument {
  ...
}

export function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

## Why this is a problem
Five distinct pieces of scaffolding in one in-scope file — the fixture model,
the session-entry shape, the parse-deps factory, the entry-append logic, and
the AJV factory — are each redeclarations of an export the helper file
created specifically to hold this family's shared scaffolding, per the
helper's own stated purpose. The file's own docstring even says the runtime
harness is "trimmed from the bug-0010 residual-pin suites" rather than
imported from a shared module, confirming the duplication is by hand-copy
rather than a coincidence of independently-arrived-at code.

## Suggested direction (non-binding, optional)
The natural home for the fixture model, `SessionEntryDouble`, the append
logic, `parseDeps()`/`parse()`, and `ajv()` is the existing
`tests/helpers/scripted-live-session-harness.ts` import surface; this file's
own `LiveSessionDouble` behaviour (`sendUserMessage`/`tick`/`isIdle`,
reply-queue semantics) is cell-specific and would stay local, as the helper's
header already anticipates for its other importers.

## False-positive check
Gate-pin check: not a `*gate*.test.ts` file; no pinned inventory or census.
Recording-double check: `LiveSessionDouble` is a legitimate boundary double
whose own turn-completion/idle behaviour is file-specific (not itself the
duplication claim) — only the scaffolding pieces named above are cited as
duplicated. Bug-doc signature search: `docs/bugs/0014-empty-typed-query-
annotation-silent-unvalidated-bind.md` was read in full; it documents the
parse/runtime defect this file probes, not this harness scaffolding, so this
is not a documented correct-reason red. Coverage-matrix / bug-doc citation
search: `grep -rn "empty-query-annotation"` across
`docs/reference/coverage-matrix.md` and `docs/bugs/*.md` found only bug
0014's own reference to this file as its witness — no external citation names
the specific harness functions being proposed for consolidation, so no
rename/merge beyond what is stated here is implied. git history: `tests/
helpers/scripted-live-session-harness.ts` was added 2026-09-14
(qw20260914091051); `tests/empty-query-annotation.test.ts` was added
2026-07-28, before the helper existed.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all five excerpts reproduce at the cited lines and tests/empty-query-annotation.test.ts imports nothing from tests/helpers/; ANTHROPIC_MODEL (418-423 vs helper 42-47), SessionEntryDouble (471-476 vs 50-55), the #append id/parentId chain (538-541 vs appendMessageEntry 82-85), makeDeps (207-217 vs parseDeps 89-97) and ajv (567-573 vs 111-117) are byte-identical modulo whitespace; git confirms the helper landed 2026-09-14 (feefe7ca, PTQ-0328 fix) after the file (6ff550f7, 2026-07-28) and only b0288/b0319/b0414 import it, so this is the same helper-created-later/not-migrated copy-paste class the human ratified in PTQ-0328; one overstatement noted for the fixer: helper parse() asserts a clean parse (expect(errors).toEqual([])) so it cannot replace parseSource(), whose cells at 773-811 parse fixtures that must emit theta/parse/empty-query-annotation — only makeDeps→parseDeps migrates there, parseSource stays local; only stopReason "stop" is used at runtime (932, 989) so appendAssistantEntry covers tick(); no PTQ file cites this test (PTQ-0328/0229 name other files), not a gate test, bug 0014/0028/0207 cite the file as a witness but none names this scaffolding (triage: claude-fable-5-1)
