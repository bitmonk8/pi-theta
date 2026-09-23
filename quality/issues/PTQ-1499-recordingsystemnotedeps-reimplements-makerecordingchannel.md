---
id: PTQ-1499
title: execution-status-entry-migration-witnesses.test.ts hand-rebuilds the system-note recording double twice instead of importing the canonical makeRecordingChannel
lens: D7
status: open
verdict: confirmed
locations:
  - tests/execution-status-entry-migration-witnesses.test.ts:39-53
  - tests/execution-status-entry-migration-witnesses.test.ts:380-391
  - tests/helpers/recording-system-note-channel.ts:70-109
sites: 2
fix_scope: localized
wave: qw20260923185337
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# execution-status-entry-migration-witnesses.test.ts hand-rebuilds the system-note recording double twice instead of importing the canonical makeRecordingChannel

## Observation
`tests/execution-status-entry-migration-witnesses.test.ts` declares its own
module-scope `recordingSystemNoteDeps()` helper that hand-builds a
`SystemNoteSender`/`SystemNoteChannelDeps` pair recording only
`customType`/`content` per sent message, and uses it at every `sendMessage`-
observing call site in the file. One test later needs the `details` field
that helper drops, so instead of extending or reusing it, the file inlines a
second, near-identical `SystemNoteSender`/`SystemNoteChannelDeps` builder on
the spot. `tests/helpers/recording-system-note-channel.ts` already exports
`makeRecordingChannel()`, which records the FULL sent message
(`customType`, `content`, `display`, `details`, `options`) plus `notified`/
`emitted` arrays, over the same `pi`/`ui`/`emitDiagnostic` deps shape; this
file never imports it.

## Evidence

tests/execution-status-entry-migration-witnesses.test.ts:39-53 (re-read
immediately before filing):
```ts
function recordingSystemNoteDeps(entryChannel?: ReturnType<typeof createEntryChannel>): RecordingChannel {
  const sentMessages: { customType: string; content: string }[] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      sentMessages.push({ customType: message.customType, content: message.content });
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
    ...(entryChannel !== undefined ? { entryChannel } : {}),
  };
  return { deps, sentMessages };
}
```

tests/execution-status-entry-migration-witnesses.test.ts:380-391 (re-read
immediately before filing — the second, inline rebuild inside the "byte-
identical" test, needed only because the first helper drops `details`):
```ts
    const capturedMessages: { content: string; details?: unknown }[] = [];
    const messagePi: SystemNoteSender = {
      sendMessage: (message): void => {
        capturedMessages.push({ content: message.content, details: message.details });
      },
    };
    const messageDeps: SystemNoteChannelDeps = {
      pi: messagePi,
      ui: { notify: (): void => {} },
      emitDiagnostic: (): void => {},
    };
    emitDiagnosticBatch(mixedSpellingDiagnosticBatch(), messageDeps);
```

tests/helpers/recording-system-note-channel.ts:70-84 (the canonical export,
re-read immediately before filing — already records `content` AND `details`
AND `customType` AND `display`/`options`, over the identical
`pi`/`ui`/`emitDiagnostic` deps shape):
```ts
export function makeRecordingChannel(opts?: {
  readonly sendThrows?: unknown;
  readonly notifyThrows?: unknown;
  readonly emitThrows?: unknown;
  readonly health?: SystemNoteChannelHealth;
  readonly rendererGate?: RendererGate;
}): ChannelFixture {
  const sent: SentNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const emitted: Diagnostic[] = [];

  const pi: SystemNoteSender = {
    sendMessage: (message, options): void => {
      if (opts?.sendThrows !== undefined) {
        throw opts.sendThrows;
```

`SentNote` (recording-system-note-channel.ts:29-34) already carries
`customType`, `content`, `display`, `details?`, `options` — a strict
superset of both local shapes. `SystemNoteChannelDeps.entryChannel` is an
optional field (src/extension/system-note-channel.ts:261), so
`{ ...makeRecordingChannel().deps, entryChannel }` already expresses what
`recordingSystemNoteDeps(entryChannel)` builds by hand.
`makeRecordingChannel` is already imported by five other test files
(`grep -rn "makeRecordingChannel" tests/` → hits in
b0268-diagnostic-file-separator-normalisation.test.ts,
b0437-producer-note-raw-send-fallback.test.ts, query-discard.test.ts,
runtime-event-channel.test.ts, system-note-channel.test.ts, plus its own
declaration), one of which (b0437) names it in a comment as "The canonical
recording channel double".

## Why this is a problem
The file rebuilds the same `SystemNoteSender`/`SystemNoteChannelDeps`
recording skeleton twice by hand rather than importing the export that
`tests/helpers/recording-system-note-channel.ts` already ships for exactly
this purpose. The second rebuild exists only because the first one dropped
a field (`details`) the canonical helper already carries, which is the
concrete cost of not sharing one fixture: a field gap in a hand-rolled copy
gets patched by writing a THIRD copy instead of reaching for the superset
that was already available.

## Suggested direction (non-binding, optional)
`makeRecordingChannel` (optionally spread with an `entryChannel` override)
already covers both local shapes; the file could read `sentMessages`-style
values off its richer `sent` array instead of maintaining its own narrower
recorder.

## False-positive check
Gate-pin check: the file name matches no `*gate*`/`*-spec-surface-gate`/
`*-corpus-gate` pattern, so the pinned-count carve-out does not apply.
Recording-double check: both local recorders are ordinary system-note
capture fixtures used for positive "delivered N messages with this content"
assertions, not MUST-NOT negative witnesses being second-guessed; this
finding is about the fixture's construction, not about weakening any
assertion. docs/bugs/ signature search: `grep -rln "recordingSystemNoteDeps"
docs/` → no hits. Coverage-matrix / bug-doc citation search: `grep -rn
"execution-status-entry-migration-witnesses" docs/reference/coverage-matrix.md
docs/bugs/` → no hits, so no citation pins this file's helper by name. No
proposal to merge, rename, or delete any `it`/`describe` — only the shared
fixture construction is in scope.

## Triage
verdict: confirmed — both excerpts match verbatim (execution-status-entry-migration-witnesses.test.ts:39-53 recordingSystemNoteDeps, used at 14 call sites; :380-391 inline messagePi/messageDeps rebuild whose own comment at :373-375 admits it exists because the helper drops details), and tests/helpers/recording-system-note-channel.ts:70-109 makeRecordingChannel records the full message (SentNote superset incl. details) over the same pi/ui/emitDiagnostic shape, with entryChannel an optional SystemNoteChannelDeps field (system-note-channel.ts:261) so a spread covers the entryChannel variant; the local no-op ui/emitDiagnostic are behaviour-equivalent to the canonical recorders; makeRecordingChannel's 5 importers re-verified and this file imports none of it; not a gate test, recordings are positive observables, no docs/bugs or coverage-matrix citation of the file; dedupe — PTQ-1471 covers only this file's fakeEntryPi (a different double), resolved PTQ-0272/1359 cover the model fixture and toolCallInFlight tautology, no PTQ cites recordingSystemNoteDeps; D7 copy-paste double with a mechanical migration (triage: claude-opus-5-5)
