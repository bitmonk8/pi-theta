---
id: PTQ-1368
title: b0437's local channelWith double reimplements the canonical makeRecordingChannel fixture without importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0437-producer-note-raw-send-fallback.test.ts:103-118
  - tests/helpers/recording-system-note-channel.ts:64-100
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# b0437's local channelWith double reimplements the canonical makeRecordingChannel fixture without importing it

## Observation
`tests/b0437-producer-note-raw-send-fallback.test.ts` declares a local
`channelWith(sendMessage, notify)` factory (103-118) that builds a
`SystemNoteChannelDeps` value: caller-supplied `pi.sendMessage` and
`ui.notify`, a recording `emitDiagnostic` sink, a fresh `RendererGate`, and a
fresh `SystemNoteChannelHealth`. All four of this file's channel builders
(`recordingChannel`, `stampGuardChannel`, `recordingSystemNoteChannel`,
`throwingSystemNoteChannel`) route through it. `tests/helpers/recording-system-note-channel.ts`
already exports `makeRecordingChannel(opts)`, which builds the same
`SystemNoteChannelDeps` shape — a recording `pi.sendMessage` and `ui.notify`
with optional throw injection (`sendThrows`/`notifyThrows`), a recording
`emitDiagnostic`, and optional/defaulted `rendererGate`/`health` — and is
already imported and used by other test files in the suite. b0437 does not
import `tests/helpers/recording-system-note-channel.ts` at all.

## Evidence

`tests/b0437-producer-note-raw-send-fallback.test.ts:103-118`:
```ts
function channelWith(
  sendMessage: SystemNoteChannelDeps["pi"]["sendMessage"],
  notify: SystemNoteChannelDeps["ui"]["notify"],
): { readonly channel: SystemNoteChannelDeps; readonly diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const channel: SystemNoteChannelDeps = {
    pi: { sendMessage },
    ui: { notify },
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
    rendererGate: new RendererGate(),
    health: new SystemNoteChannelHealth(),
  };
  return { channel, diagnostics };
}
```

`tests/helpers/recording-system-note-channel.ts:64-100` — the canonical
helper already covering the same construction, including throw injection and
optional gate/health override:
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
      }
      sent.push({ ...message, options });
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: {
      notify: (message: string, type: "error"): void => {
        notified.push([message, type]);
        if (opts?.notifyThrows !== undefined) {
          throw opts.notifyThrows;
        }
      },
    },
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      emitted.push(diagnostic);
      if (opts?.emitThrows !== undefined) {
        throw opts.emitThrows;
      }
    },
    ...
```

Exact search: `grep -n "^import" tests/b0437-producer-note-raw-send-fallback.test.ts`
shows no import of `./helpers/recording-system-note-channel`; the file's
`SystemNoteChannelDeps` type import is drawn straight from
`../src/extension/system-note-channel` at line 62. Every one of the file's
four downstream channel builders (`recordingChannel:180-190`,
`stampGuardChannel:228-238`, `recordingSystemNoteChannel:469-480`,
`throwingSystemNoteChannel:487-497`) calls `channelWith`, not
`makeRecordingChannel`.

## Why this is a problem
`makeRecordingChannel` already exists under `tests/helpers/` and already
constructs the same `SystemNoteChannelDeps` shape with the same
recording/throw-injection/fresh-gate-and-health behaviour that b0437's local
`channelWith` reimplements from scratch. A change to what a
`SystemNoteChannelDeps` double needs to supply (e.g. a new required field, or
a different default for `RendererGate`/`SystemNoteChannelHealth`) applied to
the canonical helper would not reach b0437's local reimplementation, and the
two could silently diverge with nothing surfacing the drift.

## Suggested direction (non-binding, optional)
`tests/helpers/recording-system-note-channel.ts`'s `makeRecordingChannel`
already builds the same channel shape with throw-injection options; it is the
existing home this file's four `channelWith`-based builders could construct
their doubles from instead.

## False-positive check
- Gate-pin check: `b0437-producer-note-raw-send-fallback.test.ts` does not
  match `*gate*.test.ts` or the named kin; the duplicated construction is
  harness plumbing, not a pinned count or inventory.
- Recording-double check: this finding is itself ABOUT a recording double
  being reimplemented rather than reused — it does not challenge any
  MUST-NOT-called negative witness the file asserts; both `channelWith` and
  `makeRecordingChannel` back ordinary content-recording arrays the tests
  assert values against, not negative witnesses.
- docs/bugs/ signature search: docs/bugs/0437-producer-note-sites-bypass-fallback-chain.md
  is Status "fixed (0.429.0)"; this file's tests are green now, not a
  documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0437-producer-note-raw-send-fallback" docs/reference/coverage-matrix.md`
  returns 0 hits; `grep -n "channelWith" docs/bugs/0437-producer-note-sites-bypass-fallback-chain.md`
  returns 0 hits. This finding proposes no merge, rename, or deletion of any
  file or `it()`/`describe()` cell — only that the local `channelWith`
  builder could construct its doubles from the existing shared helper.
- Prior-finding overlap check: `grep -rl "rendererGate: new RendererGate()"
  quality/intake quality/resolved quality/issues` surfaces resolved PTQ-0398,
  whose root cause and citations are the four LOCAL builders in this same
  file sharing an identical closing tail WITHIN the file (169-174/228-233/
  478-483/502-507 in that finding's now-stale line numbers) — a
  within-file-duplication finding that was fixed by extracting the very
  `channelWith` helper this finding cites; PTQ-0398's own evidence never
  compares against `tests/helpers/recording-system-note-channel.ts` or
  `makeRecordingChannel`, so this finding's root cause (an existing
  cross-file canonical helper left unused) is disjoint from PTQ-0398's
  (an intra-file tail repeated four times, now consolidated into
  `channelWith`). `grep -rli "makeRecordingChannel\|channelWith"
  quality/intake quality/resolved quality/issues` returns no other hit
  naming this specific pairing.
- Coverage-drift check: this finding is about an already-written,
  already-passing local builder function reimplementing an existing shared
  helper; it does not claim any behaviour or path is untested.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (b0437:103-118 `channelWith`, helpers/recording-system-note-channel.ts:64-100 `makeRecordingChannel`); `grep ^import` on b0437 confirms no import of the helper and all four builders (:180-190, :228-238, :469-480, :487-497) route through `channelWith`; the canonical helper covers every load-bearing need — throw injection via `sendThrows`, recording `sent`/`notified`/`emitted` arrays, and explicit `rendererGate`/`health` opts, while `sendSystemNote` (system-note-channel.ts:400-432, 465, 518) treats an ABSENT gate/health identically to the fresh instances `channelWith` news up (`rendererGate?.available() === false` is falsy when undefined; `health === undefined || claimTerminalLog()` is true either way); the helper is live in four other suites (b0268, query-discard, runtime-event-channel, system-note-channel as `makeChannel`); b0437 suite green at HEAD (5/5); both locations under tests/, class = copy-paste double; not a gate test, no coverage-matrix/bug-doc witness citation; dedupe: PTQ-0398 (fixed) is the intra-file four-tail consolidation that produced `channelWith` and never compares to the shared helper, PTQ-0741/PTQ-0677 cite other files — no tracked row names this pairing (triage: claude-fable-5-1)
