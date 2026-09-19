---
id: PTQ-0797
title: ctor-proto-named-field.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble, parseDeps and LiveSessionDouble's append bodies instead of importing tests/helpers/scripted-live-session-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/ctor-proto-named-field.test.ts:188-198
  - tests/ctor-proto-named-field.test.ts:254-267
  - tests/ctor-proto-named-field.test.ts:269-310
  - tests/helpers/scripted-live-session-harness.ts:42-101
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# ctor-proto-named-field.test.ts redeclares ANTHROPIC_MODEL, SessionEntryDouble, parseDeps and LiveSessionDouble's append bodies instead of importing tests/helpers/scripted-live-session-harness.ts

## Observation
`tests/helpers/scripted-live-session-harness.ts` exports `ANTHROPIC_MODEL`,
`SessionEntryDouble`, `parseDeps`, and the `appendUserEntry`/
`appendAssistantEntry` pair, created (per its own header, PTQ-0328) because
several test files "each redeclared byte-for-byte the pieces that carry no
cell-specific variation between them: the fixture model, the `SessionManager`
entry shape, the in-flight-turn state shape, the entry-append pair, and the
document-parsing … factories." `tests/ctor-proto-named-field.test.ts` declares
its own module-scope `parseDeps`, `ANTHROPIC_MODEL` constant and
`SessionEntryDouble` interface, and builds a local `LiveSessionDouble` class
whose `sendUserMessage`/`tick` append entries inline through a private
`#append` method rather than calling the exported `appendUserEntry`/
`appendAssistantEntry` helpers. The file does not import
`tests/helpers/scripted-live-session-harness` at all.

## Evidence
`tests/ctor-proto-named-field.test.ts:188-198` — `parseDeps`, value-identical
to the helper's export:
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

`tests/ctor-proto-named-field.test.ts:254-267` — `ANTHROPIC_MODEL` and
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

`tests/ctor-proto-named-field.test.ts:269-310` — `LiveSessionDouble`, whose
`sendUserMessage`/`tick`/`#append` reconstruct exactly the entry shape the
helper's `appendUserEntry`/`appendAssistantEntry`/internal
`appendMessageEntry` already build:
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

`tests/helpers/scripted-live-session-harness.ts:42-101` (the canonical,
already-exported equivalents):
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

export function appendAssistantEntry(
  entries: SessionEntryDouble[],
  text: string | undefined,
  stopReason = "stop",
  errorMessage?: string,
): void { ... }

export function parseDeps(): ParseThetaDocumentDeps { ... }
```

`grep -n "helpers/scripted-live-session-harness" tests/ctor-proto-named-field.test.ts`
→ 0 hits: the file imports only `./helpers/registry-oracle` at module scope
for its diagnostics-registry read.

## Why this is a problem
`tests/helpers/scripted-live-session-harness.ts` exists specifically to hold
this exact fixture-model/entry-shape/append-pair/`parseDeps` cluster after a
prior review confirmed it was "redeclared byte-for-byte" across sibling
files. `tests/ctor-proto-named-field.test.ts` performs the identical
redeclaration and does not import the helper — a sibling file in the same
bug lineage, `tests/ctor-declaration-order.test.ts`, already imports
`ANTHROPIC_MODEL`, `SessionEntryDouble`, `appendUserEntry` and
`appendAssistantEntry` from this same helper (its `LiveSessionDouble` calls
`appendUserEntry(this.entries, content)` / `appendAssistantEntry(this.entries,
"ok", "stop")` rather than building the entry object inline), so the pattern
of importing rather than redeclaring is already live in this exact file
lineage.

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports
`ANTHROPIC_MODEL`, `SessionEntryDouble`, `parseDeps`, and the
`appendUserEntry`/`appendAssistantEntry` pair this file's `parseDeps`/
`ANTHROPIC_MODEL`/`SessionEntryDouble`/`LiveSessionDouble#append` reimplement
inline; importing them (as the sibling `ctor-declaration-order.test.ts`
already does) is the existing, purpose-built home for this exact shape.

## False-positive check
- Gate-pin check: `tests/ctor-proto-named-field.test.ts` does not match
  `*gate*.test.ts` or the named kin; the cited lines are a fixture-model
  constant, an entry-shape interface, a deps-builder function and a
  session-double class, not a pinned count or inventory assertion.
- Recording-double check: `LiveSessionDouble` records calls
  (`sendUserMessageCalls`, `sentQueryTexts`) for later positive assertions
  about what was sent, not a "never called" witness, so the negative-witness
  carve-out does not apply; this finding is about the duplicated
  construction/append plumbing, not the recording behaviour itself.
- docs/bugs/ signature search: `docs/bugs/0119-proto-named-field-silently-dropped.md`
  is fixed and pins this file's RED cells by their own cell letters
  (A–L); it states no rationale for the harness staying local rather than
  importing the shared module — the documented-red carve-out covers the RED
  cells' assertions, not this harness-duplication claim.
- coverage-matrix/bug-doc citation search: `grep -n "ctor-proto-named-field"
  docs/reference/coverage-matrix.md docs/bugs/*.md` shows the file cited by
  name in docs/bugs/0026, 0080, 0119, 0120, 0121, each pinning specific `it()`
  cell ranges well beyond line 310 (the cited lines here are all inside the
  shared harness preamble, before cell (A) begins). No merge, rename or
  deletion of any cited cell is proposed.
- Coverage check: the claim is about a duplicated fixture/double DEFINITION,
  not a missing test path; every cell in the file that uses
  `LiveSessionDouble` continues to pass under the current inline definition.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines; sed-extracted snippets diffed under $TEMP show `ANTHROPIC_MODEL` (:255-260 vs helper :44-49) and `SessionEntryDouble` (:261-266 vs :52-57) byte-identical modulo `export`, `parseDeps` (:188-198 vs :96-105) identical modulo the helper's one-line `modelMatcher` formatting, and `LiveSessionDouble#append` (:305-309) identical to the helper's `appendMessageEntry` (:90-94) modulo `this.`; `sendUserMessage`'s literal equals `appendUserEntry`'s and `tick()`'s (text "ok", stopReason "stop", no errorMessage) reduces exactly to `appendAssistantEntry(entries, "ok", "stop")`; all copies are live (3/3/2 references), the file's only `./helpers/` import is registry-oracle (:1), the sibling ctor-declaration-order.test.ts imports the four helper exports (:4-6, :205, :218) after PTQ-0459's fix whose location list never included this file, coverage-matrix → 0 hits, file passes at HEAD (26/26), not a gate test, recording-double carve-out inapplicable to fixture plumbing, no merge/rename/delete proposed; same-wave sibling d7-02 cites disjoint ranges (:248-252/:312-365/:425-491, the drive harness with no helper home) and PTQ-0671/0730 target the proto-named-*.test.ts trio, not this file, so this is the per-file PTQ-0328 residual pattern PTQ-0754/0459/0464/0556/0564/0572/0668/0726/0728 were each confirmed on — one correction on record: the docs/bugs cite claim is wrong (only 0119 and 0210 name the file, not 0026/0080/0120/0121), immaterial since no cell is touched (triage: claude-fable-5-1)
