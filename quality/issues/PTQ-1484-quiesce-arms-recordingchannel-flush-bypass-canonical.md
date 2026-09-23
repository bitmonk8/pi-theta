---
id: PTQ-1484
title: hot-reload-stale-quiesce-arms.test.ts redeclares two canonical tests/helpers/ exports (recording channel double, microtask flush) it does not import
lens: D7
status: open
verdict: confirmed
locations:
  - tests/hot-reload-stale-quiesce-arms.test.ts:29-45
  - tests/helpers/fake-clock.ts:112-117
  - tests/helpers/recording-system-note-channel.ts:38-58
sites: 2
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# hot-reload-stale-quiesce-arms.test.ts redeclares two canonical tests/helpers/ exports (recording channel double, microtask flush) it does not import

## Observation
`tests/hot-reload-stale-quiesce-arms.test.ts` already imports `FakeClock` from `./helpers/fake-clock` and `HOST_STALE_MESSAGE` from `./helpers/recording-system-note-channel`, but declares two module-scope helpers whose bodies are byte-identical (or a subset) of exports those same two `tests/helpers/` modules already carry: a local `async function flush(times = 8)` matching `fake-clock.ts`'s exported `flush()`, and a local `function recordingChannel()` matching `recording-system-note-channel.ts`'s exported `channelHarness()`.

## Evidence

**`flush()`** — `tests/hot-reload-stale-quiesce-arms.test.ts:29-33`:
```ts
/** Flush the microtask queue so the in-flight reload pass settles. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}
```
`tests/helpers/fake-clock.ts:112-117` (the canonical export, already reachable via the file's own `FakeClock` import path):
```ts
/** Flush the microtask queue so in-flight promises settle. */
export async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}
```
The loop bodies are byte-identical; only the doc comment differs by wording.

**`recordingChannel()`** — `tests/hot-reload-stale-quiesce-arms.test.ts:35-45`:
```ts
/** A recording (never-throwing) channel: any post-quiesce delivery would RECORD. */
function recordingChannel(): {
  readonly channel: SystemNoteChannelDeps;
  readonly sent: SentNote[];
} {
  const sent: SentNote[] = [];
  const pi: SystemNoteSender = {
    sendMessage(message, _options): void {
      sent.push({ ...message });
    },
  };
  return {
    channel: { pi, ui: { notify: vi.fn() }, emitDiagnostic: vi.fn() },
    sent,
  };
}
```
`tests/helpers/recording-system-note-channel.ts:38-58` (the canonical export):
```ts
/**
 * Build a `SystemNoteChannelDeps` whose `pi.sendMessage` succeeds and records
 * every sent message, so the primary-sink assertions observe the persistent
 * `theta-system-note` route and can prove `ctx.ui.notify` is never reached.
 */
export function channelHarness(): {
  readonly channel: SystemNoteChannelDeps;
  readonly sent: SentMessage[];
  readonly notify: ReturnType<typeof vi.fn>;
  readonly emitDiagnostic: ReturnType<typeof vi.fn>;
} {
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
Both `sendMessage` bodies push `{ ...message }` and return the same `{ channel/deps, sent }` shape (the canonical version additionally hands back the `notify`/`emitDiagnostic` spies, a strict superset the local copy could consume instead of rebuilding).

## Why this is a problem
Both duplicated pieces sit in `tests/helpers/` modules this exact file already opens (`./helpers/fake-clock` for `FakeClock`, `./helpers/recording-system-note-channel` for `HOST_STALE_MESSAGE`), so there is no missing import path — the local copies are declared beside imports from the very modules that already export the identical logic. This is the same root cause PTQ-0831 (resolved) named for `reload-debounce.test.ts`'s local `flush()` and PTQ-0677/PTQ-1368 named for other files' local `recordingChannel`-shaped doubles: a name that recurs per-file instead of the one export already available from the module the file imports from for an adjacent symbol.

## Suggested direction (non-binding, optional)
`flush` could be added to this file's existing `./helpers/fake-clock` import instead of being redeclared, and `recordingChannel()`'s two call sites could call `channelHarness()` from `./helpers/recording-system-note-channel` (already imported here for `HOST_STALE_MESSAGE`), taking only the `channel`/`sent` fields it uses.

## False-positive check
- Gate-pin check: `hot-reload-stale-quiesce-arms.test.ts` is not a `*gate*.test.ts` file or named gate kin; not applicable.
- Recording-double check: `recordingChannel()`/`channelHarness()` ARE recording doubles, but the carve-out protects a negative-witness ASSERTION ("never called"), not the double's declaration site being copy-pasted instead of imported; this finding is about the duplicated declaration, not about any assertion the test makes over it.
- docs/bugs/ signature search: `grep -rn "recordingChannel\|channelHarness\|async function flush" docs/bugs/*.md` → 0 hits; the file's own bug-0018 header cites no exemption for either helper's shape.
- coverage-matrix/bug-doc citation search: `grep -n "hot-reload-stale-quiesce-arms" docs/reference/coverage-matrix.md` → 0 hits; `grep -n "hot-reload-stale-quiesce-arms" docs/bugs/*.md` → hits in 0018/0030/0034 cite the FILE (as a witness location), not either local function by name, so no citation pins these two declarations specifically. This finding proposes no merge, rename, or deletion of the test file or of its `it(...)` blocks — only that its two helper declarations call the canonical exports the file already imports its siblings from.
- Coverage-drift check: this finding is about duplicated helper declarations inside one existing, passing test file; it makes no claim that any behaviour or path is untested.
- Prior-filing check: `grep -rl "hot-reload-stale-quiesce-arms" quality/issues quality/resolved quality/intake` → PTQ-0038 (initialNames unread), PTQ-0677 (query-discard.test.ts's channel, a different file), PTQ-0831 (reload-debounce.test.ts's flush, a different file), PTQ-1059 (HOST_STALE_MESSAGE constant), PTQ-1332 (parsedTheta fixture builder), PTQ-1353 (stderr-filter harness, already fixed — this file already imports `stderrLinesWithPrefix` per that fix). None of the six cites this file's own `recordingChannel()` or `flush()` declarations.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines; mktemp-extracted `flush` bodies (quiesce-arms:30-34 vs fake-clock.ts:113-117 with `export` stripped) diff empty; local `recordingChannel()` is a strict subset of `channelHarness()` (same push-`{ ...message }` sender, same `{ pi, ui: { notify: vi.fn() }, emitDiagnostic: vi.fn() }` deps, `SentNote` four fields = `SentMessage` = `Omit<SentNote,"options">`), both locals live (:78, :102, :120 — note the direction's "two call sites" for `recordingChannel` is one, immaterial) and the file already imports `FakeClock` and `HOST_STALE_MESSAGE` from those exact modules, with five sibling suites importing `{ FakeClock, flush }` from fake-clock proving the import path; the locals date from 28ce714d (2026-07-28) while both canonical exports were minted 2026-09-19 by quality fixes (2a9bfc7c/69eae485) that never migrated this file; suite green at HEAD (1/1); both locations under tests/, D7 copy-paste-double/boilerplate class, not a gate file, recording-double carve-out protects the negative-witness assertion not the copied declaration, stated searches reproduce (docs/bugs sig → 0, coverage-matrix → 0, bug docs 0018/0030/0034 cite the file only, no merge/rename/delete proposed); dedupe: PTQ-0831 (fixed) cited only reload-debounce.test.ts and merely noted this file's `flush` as an uncited fixer aside that was not acted on, PTQ-0677/1368/0741 cite other files' channel doubles, PTQ-1059/1353/1332/0038 cover other symbols in this file — no tracked row names these two declarations (triage: claude-fable-5-1)
