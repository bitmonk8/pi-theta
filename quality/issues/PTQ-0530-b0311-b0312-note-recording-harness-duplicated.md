---
id: PTQ-0530
title: b0311 and b0312 each re-declare an identical ~100-line fake-pi/RecordedNote/waitFor/structuralNotesSince harness
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0311-structural-note-derived-from-paths.test.ts:58-163
  - tests/b0312-out-of-root-thetalib-watch-closure.test.ts:183-298
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0311 and b0312 each re-declare an identical ~100-line fake-pi/RecordedNote/waitFor/structuralNotesSince harness

## Observation
tests/b0311-structural-note-derived-from-paths.test.ts (lines 58-163) and tests/b0312-out-of-root-thetalib-watch-closure.test.ts (lines 183-298) each declare, module-scope, the same four-part block: a `RecordedNote` interface shaping a captured `pi.sendMessage` call, a `Harness` interface, a `makeHarness(cwd)` factory building a fake `ExtensionAPI`/`ExtensionContext` pair that records `sendMessage` calls and replays `session_start` handlers, a `waitFor(cond, label)` bounded poll that throws naming the unmet condition on timeout, and a `structuralNotesSince(harness, from)` filter over `note.content.startsWith("theta watcher:")`. b0312's own header comment states the harness "mirrors tests/b0311-structural-note-derived-from-paths.test.ts". No file under tests/helpers/ exports this fake-pi/notification-recording harness.

## Evidence
tests/b0311-structural-note-derived-from-paths.test.ts:84-149 (the `makeHarness`/`waitFor` core):
```ts
function makeHarness(cwd: string): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();
  let registrations = 0;

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      registrations += 1;
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (
      message: { customType: string; content: string; display: boolean; details: unknown },
      options: { triggerTurn: unknown },
    ): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details as RecordedNote["details"],
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;
```

tests/b0312-out-of-root-thetalib-watch-closure.test.ts:207-236 — the same `makeHarness` body (this excerpt trimmed to the `pi` object literal, byte-identical field-for-field to the block above apart from omitting the unused `ctx`/`commands` fields on the returned `Harness`):
```ts
  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      registrations += 1;
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (
      message: { customType: string; content: string; display: boolean; details: unknown },
      options: { triggerTurn: unknown },
    ): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details as RecordedNote["details"],
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;
```

tests/b0311-structural-note-derived-from-paths.test.ts:149-163 (`waitFor` + `structuralNotesSince`):
```ts
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}

/** The structural-change notes emitted since `from` (content-keyed). */
function structuralNotesSince(harness: Harness, from: number): RecordedNote[] {
  return harness.notes
    .slice(from)
    .filter((note) => note.content.startsWith("theta watcher:"));
}
```

tests/b0312-out-of-root-thetalib-watch-closure.test.ts:271-296 — the same two functions, reproduced (with an added doc-comment):
```ts
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timeout waiting for ${label}`);
}
```
```ts
/** The structural-change notes recorded since `from` (content-keyed). */
function structuralNotesSince(harness: Harness, from: number): RecordedNote[] {
  return harness.notes
    .slice(from)
    .filter((note) => note.content.startsWith("theta watcher:"));
}
```
The `RecordedNote` interface (b0311:58-69, b0312:183-196) is also byte-identical between the two files.

## Why this is a problem
This is the "Boilerplate duplication" class: the same ~100-line fake-`ExtensionAPI`/`ExtensionContext` harness — `RecordedNote` shape, `makeHarness`, `waitFor`, `structuralNotesSince` — is written out twice rather than shared once, and b0312's own header comment ("mirrors tests/b0311…") shows the second copy was produced by reading the first rather than importing it. `tests/helpers/` holds no module exporting this fake-pi/notification-recording harness (the closest neighbours, `fake-file-watcher.ts` and `watch-arming-harness.ts`, cover the file-watcher seam, not the `pi.sendMessage`/`session_start` fake used here), so a change to the shape either file's assertions depend on — a new field on `RecordedNote`, a change to how `session_start` handlers are replayed, a different poll interval in `waitFor` — landing in one copy and not the other would silently leave the two bug-witness suites checking different fake-pi contracts with nothing in either file surfacing the drift.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting the `RecordedNote`/`makeHarness`/`waitFor`/`structuralNotesSince` block is the home the existing `fake-*.ts` and `*-harness.ts` files under that directory already establish a convention for; this names where the duplicated code already points, not a design for the extraction.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or its named kin; no pinned count or inventory is touched by this finding.
- Recording-double check: `makeHarness`'s `pi.sendMessage` does record every call into `notes`, but neither file asserts a "never called" negative witness over the whole `notes` array — the assertions filter to specific windows (`structuralNotesSince(harness, notesBefore)`) and assert positive/negative content on that filtered slice, which is the ordinary recording-fake usage this repository's helpers already follow (e.g. `fake-file-watcher.ts`), not the MUST-NOT-witness carve-out for the *duplication* claim itself, which is about the harness code being written twice, not about what it records.
- docs/bugs/ signature search: docs/bugs/0311-structural-note-derived-from-name-set.md and docs/bugs/0312-out-of-root-thetalib-watch-closure.md both back these files' RED-at-HEAD cells by design; that governs the *assertions'* correct-reason-red posture, not the harness-setup code, which compiles and runs (the harness itself is not red).
- coverage-matrix/bug-doc citation search: `grep -n "b0311\|b0312" docs/reference/coverage-matrix.md` — no hits found; this finding does not propose merging, renaming, or deleting either file or any of its `it()` cells, only that the shared harness block could live in one place.
- Prior-finding overlap check: grepped the supplied already-filed/resolved list and this wave's already-filed d7-01..d7-03 titles for "structural-note", "b0311", "b0312", "watch-arming", "RecordedNote" — no match; this is not a re-file of any listed ticket.
- Coverage-drift check: this finding is about test-support code that exists and runs in both files; it makes no claim that any path or behaviour is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — diff of b0311:58-163 vs b0312:183-298 reproduces byte-identical RecordedNote/makeHarness pi-ctx-fire bodies/waitFor/structuralNotesSince (only the unused ctx/commands Harness fields, doc-comment wording and b0312's extra settle differ; b0312's header self-declares the mirror); no tests/helpers module records sendMessage notes (watch-arming-harness.ts#makeHarness has a no-op sendMessage and no registrationCount — the candidate's "file-watcher seam" description of it is imprecise but the gap is real), and fake-file-watcher.ts already exports a byte-identical waitFor that neither file imports (a not-migrated residual that sharpens the fix); the watcher-hot-reload-integration.test.ts ancestor is a diverged variant, so the identical pair is exactly these 2 sites; both suites run 12/12 green (the candidate's RED-at-HEAD and docs/bugs filenames are stale but touch no carve-out), 0 coverage-matrix hits, and PTQ-0236/0346/0363/0388 cover the b0310/b0339/b0312 watcher+settle pieces, not this b0311↔b0312 note-recording block (triage: claude-fable-5-1)
