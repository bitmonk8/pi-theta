---
id: PTQ-0741
title: watcher-terminated-recovery.test.ts's channelHarness/SentMessage duplicates b0313-terminal-note-burst-latch.test.ts's byte-for-byte
lens: D7
status: open
verdict: confirmed
locations:
  - tests/watcher-terminated-recovery.test.ts:92-121
  - tests/b0313-terminal-note-burst-latch.test.ts:35-62
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# watcher-terminated-recovery.test.ts's channelHarness/SentMessage duplicates b0313-terminal-note-burst-latch.test.ts's byte-for-byte

## Observation
`tests/watcher-terminated-recovery.test.ts` declares a `SentMessage`
interface and a `channelHarness()` function building a
`SystemNoteChannelDeps` whose `pi.sendMessage` records every call into a
`sent` array, paired with a `vi.fn` `notify` and a `vi.fn` `emitDiagnostic`.
`tests/b0313-terminal-note-burst-latch.test.ts` declares the identical
`SentMessage` interface and the identical `channelHarness()` body (its return
object omits `emitDiagnostic` as a named field, though it still constructs
the same `vi.fn`). Neither file imports this pair from a shared
`tests/helpers/` module; each declares its own copy.

## Evidence
`tests/watcher-terminated-recovery.test.ts:92-98` (the `SentMessage`
interface, re-read immediately before filing):
```ts
interface SentMessage {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details?: SystemNoteDetails;
}
```

`tests/watcher-terminated-recovery.test.ts:110-121` (`channelHarness`
body; the return-type signature at lines 105-109 is identical to the
sibling file's apart from the extra `emitDiagnostic` field, shown in the
next excerpt):
```ts
  const sent: SentMessage[] = [];
  const pi: SystemNoteSender = {
    sendMessage(message, _options): void {
      sent.push({ ...message });
    },
  };
  const notify = vi.fn<UiNotifier["notify"]>();
  const ui: UiNotifier = { notify };
  const emitDiagnostic = vi.fn<(d: Diagnostic) => void>();
  return { channel: { pi, ui, emitDiagnostic }, sent, notify, emitDiagnostic };
}
```

`tests/b0313-terminal-note-burst-latch.test.ts:35-41` (the same
`SentMessage` interface):
```ts
interface SentMessage {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details?: SystemNoteDetails;
}
```

`tests/b0313-terminal-note-burst-latch.test.ts:53-62` (the same
`channelHarness` body, differing only in the return object omitting
`emitDiagnostic` as a named field; the return-type signature at lines
48-52 differs only by that same omitted field):
```ts
  const sent: SentMessage[] = [];
  const pi: SystemNoteSender = {
    sendMessage(message, _options): void {
      sent.push({ ...message });
    },
  };
  const notify = vi.fn<UiNotifier["notify"]>();
  const ui: UiNotifier = { notify };
  const emitDiagnostic = vi.fn<(d: Diagnostic) => void>();
  return { channel: { pi, ui, emitDiagnostic }, sent, notify };
}
```

## Why this is a problem
The `SentMessage` shape and the `channelHarness()` body — a recording
`pi.sendMessage`, a `vi.fn` `notify`, a `vi.fn` `emitDiagnostic`, assembled
into one `SystemNoteChannelDeps` — are identical in both files (both files
share the same `armWatcherWithTerminalRecovery` SUT and the same
`FakeFileWatcher` terminal-signal injection point, per each file's own header
comment). A change to `SystemNoteChannelDeps`'s shape, or to what the
recording double captures, must be hand-applied in both places.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently exports this `SentMessage`/
`channelHarness` pair; the two files that redeclare it identically, both
already testing `armWatcherWithTerminalRecovery` against
`FakeFileWatcher.terminate()`, are the natural set to draw a shared export
from.

## False-positive check
- Gate-pin check: neither file is named `*gate*.test.ts` or a named gate
  kind; not a census/pin gate.
- Recording-double check: `sent`/`notify`/`emitDiagnostic` are recording
  doubles used in both files to assert a delivery route (e.g. "never
  `ctx.ui.notify`") — that MUST-NOT-witness USE is legitimate per the
  recording-double carve-out; this finding does not challenge any assertion
  built on the double, only that the double-CONSTRUCTION code itself is
  declared twice rather than shared.
- docs/bugs/ signature search: `grep -n "channelHarness" docs/bugs/*.md` → 0
  hits; `tests/b0313-terminal-note-burst-latch.test.ts`'s own header states
  it is a witness suite for bug 0313 (fixed 0.316.0), and passes at HEAD —
  no open docs/bugs/ report cites this duplication as intentional.
- coverage-matrix/bug-doc citation search: `grep -n "watcher-terminated-recovery\|b0313-terminal-note-burst-latch" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` or file.
- Coverage check: the claim is about a repeated helper-function DEFINITION duplicated across two files that already exist, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (watcher-terminated-recovery.test.ts:92-121, b0313-terminal-note-burst-latch.test.ts:35-62); a scratch diff of the two ranges shows `SentMessage` byte-identical and `channelHarness` identical except doc-comment wording and the b0313 copy's return type/object omitting the `emitDiagnostic` field it still constructs (so the title's "byte-for-byte" slightly overstates, but the body discloses exactly that delta); `grep channelHarness|interface SentMessage tests/` finds only these two copies (tests/harness/session-double.ts:37 is a different `SentMessage` for a different double) and no tests/helpers/ export supplies the pair; both copies are live (called at :130/:174 and :71) and both suites pass at HEAD (8/8); docs/bugs/ and coverage-matrix greps re-run at 0 hits; both locations under tests/, class = copy-paste double construction, recording-double USE not challenged; no tracked PTQ cites either file for this pair (PTQ-0398 covers b0437's channel tail, PTQ-0150 is D2 on watcher-recovery.ts exports) — a mechanical extraction to a shared tests/helpers/ module with the superset return shape (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
