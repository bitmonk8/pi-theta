---
id: PTQ-0677
title: query-discard.test.ts's SentNote/makeChannel recording-channel double is byte-identical to runtime-event-channel.test.ts's and re-implements a shape b0268's makeChannel also duplicates
lens: D7
status: open
verdict: confirmed
locations:
  - tests/query-discard.test.ts:36-59
  - tests/runtime-event-channel.test.ts:45-68
  - tests/b0268-diagnostic-file-separator-normalisation.test.ts:135-170
sites: 3
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# query-discard.test.ts's SentNote/makeChannel recording-channel double is byte-identical to runtime-event-channel.test.ts's and re-implements a shape b0268's makeChannel also duplicates

## Observation
`tests/query-discard.test.ts` declares an `interface SentNote` (four fields:
`customType`, `content`, `display`, optional `details`) and a
`makeChannel()` function that builds a `SystemNoteChannelDeps` whose `pi.
sendMessage` pushes a shallow copy of every sent message into a `sent: SentNote[]`
array, returning `{ deps, sent }`. `tests/runtime-event-channel.test.ts`
declares the identical interface and function, byte-for-byte (`diff` of the
two spans is empty). `tests/b0268-diagnostic-file-separator-normalisation.test.ts`
declares the same four-field `SentNote` interface and a superset `makeChannel`
that additionally tracks `notified`/`emitted`. No `tests/helpers/` module
exports a recording `SystemNoteSender` double; the only system-note helper in
`tests/helpers/` (`e2e-s1.ts`'s `inertSystemNote()`) discards every sent
message rather than recording it.

## Evidence

tests/query-discard.test.ts:36-59 (re-read immediately before filing):
```ts
interface SentNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details?: SystemNoteDetails;
}

function makeChannel(): {
  readonly deps: SystemNoteChannelDeps;
  readonly sent: SentNote[];
} {
  const sent: SentNote[] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      sent.push({ ...message });
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  return { deps, sent };
}
```

tests/runtime-event-channel.test.ts:45-68 — byte-identical (`diff` between
the two spans produces no output):
```ts
interface SentNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details?: SystemNoteDetails;
}

function makeChannel(): {
  readonly deps: SystemNoteChannelDeps;
  readonly sent: SentNote[];
} {
  const sent: SentNote[] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      sent.push({ ...message });
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  return { deps, sent };
}
```

tests/b0268-diagnostic-file-separator-normalisation.test.ts:135-170 — the same
four-field `SentNote` interface, and a `makeChannel` that builds the same
`sent`-array-recording `SystemNoteSender`, widened to also track
`notified`/`emitted`:
```ts
interface SentNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details?: SystemNoteDetails;
}

interface ChannelFixture {
  readonly deps: SystemNoteChannelDeps;
  readonly sent: SentNote[];
  readonly notified: Array<readonly [string, string]>;
  readonly emitted: Diagnostic[];
}

function makeChannel(): ChannelFixture {
  const sent: SentNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const emitted: Diagnostic[] = [];

  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      sent.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        ...(message.details !== undefined ? { details: message.details } : {}),
      });
    },
  };
```

Search performed: `grep -rn "interface SentNote" tests/*.test.ts` → 6 files
carry a `SentNote` interface of this shape; the three cited here share the
identical four-field interface and the identical "push a copy into `sent`"
`makeChannel` recording strategy (the other three carry additional
project-specific fields — `options`, a 2-field variant, etc. — not cited as
instances of this specific clone).

## Why this is a problem
The same recording-double construction — a four-field `SentNote` shape plus a
`makeChannel()` that wires a `SystemNoteSender` to push copies of every sent
message into an array and returns `{ deps, sent }` — is typed independently in
three files, one of them (query-discard.test.ts vs runtime-event-channel.test.ts)
byte-for-byte. `tests/helpers/` holds 37 files and none of them exports this
double; the only system-note helper present (`e2e-s1.ts`'s `inertSystemNote()`)
discards rather than records, so it cannot stand in for this recording need.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting the recording `SystemNoteSender` double
(a `makeRecordingChannel()` returning `{ deps, sent }`) is the natural home
the three independent copies already converge on.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or a
  listed gate kin; the cited lines are fixture/double construction, not a
  pinned count or inventory.
- Recording-double check: `sent` IS a legitimate recording double backing
  assertions on what was emitted — that is not being challenged. This finding
  is about the SAME double's construction code being independently retyped
  three times, not about the validity of any assertion made against it.
- docs/bugs/ signature search: `grep -rln "query-discard.test\|runtime-event-channel.test\|b0268-diagnostic-file-separator" docs/bugs/*.md` → 0 hits; none of the three files is cited as a documented correct-reason red for this scaffold.
- coverage-matrix/bug-doc citation search: `grep -n "query-discard.test.ts\|runtime-event-channel.test.ts\|b0268-diagnostic-file-separator-normalisation.test.ts" docs/reference/coverage-matrix.md` → 0 hits.
- Overlap check: `grep -rl "SentNote\|makeChannel" quality/intake/*.md quality/resolved/*.md` (excluding this file) → 0 hits; this clone group is not already filed.
- This claim is about existing duplicated fixture code across three files that already exist and already pass; it makes no claim that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines; `diff` of query-discard.test.ts:36-59 against runtime-event-channel.test.ts:45-68 is empty (byte-identical); b0268:135-170 carries the same four-field `SentNote` and the same push-into-`sent` `SystemNoteSender` recording double widened with `notified`/`emitted`; `interface SentNote` greps to exactly 6 test files (hot-reload-stale-quiesce-arms.test.ts also has the identical four-field interface but a different, non-`makeChannel` construction — an undercount that does not refute the group); tests/helpers/ exports no recording variant (every `sendMessage` there is a discarding stub: e2e-s1.ts `inertSystemNote()`, scripted-live-session-harness.ts:94, production-load-harness.ts:65, etc.); all three files pass (24/24), none is a gate/kin, the docs/bugs/0268 hit (line 331) is a run-command witness and the filing proposes no merge/rename/delete; no PTQ tracks this pair — the sibling intake filing qw20260917154546-d7-11-system-note-channel-makechannel-fourth-copy.md (system-note-channel.test.ts + b0268) covers a different file pair and explicitly disclaims this one, so the fixer should coalesce both into one helper rather than two (triage: claude-fable-5-1)
