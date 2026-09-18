---
id: PTQ-0643
title: system-note-channel.test.ts's SentNote/ChannelFixture/makeChannel recording double is a fourth independent copy of a shape already duplicated three times
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/system-note-channel.test.ts:36-90
  - tests/b0268-diagnostic-file-separator-normalisation.test.ts:135-176
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# system-note-channel.test.ts's SentNote/ChannelFixture/makeChannel recording double is a fourth independent copy of a shape already duplicated three times

## Observation
`tests/system-note-channel.test.ts` declares a module-scope `interface
SentNote`, a `interface ChannelFixture { deps; sent; notified; emitted }`,
and a `function makeChannel(opts?)` that wires a `SystemNoteSender` /
`SystemNoteChannelDeps` so `pi.sendMessage` pushes into `sent`, `ui.notify`
pushes into `notified`, and `emitDiagnostic` pushes into `emitted`. The
`ChannelFixture` interface — the four-field `{ deps, sent, notified, emitted
}` shape — is byte-identical to the `ChannelFixture` interface independently
declared in `tests/b0268-diagnostic-file-separator-normalisation.test.ts`,
and both files' `makeChannel` wire the same three-arm
`SystemNoteChannelDeps` recording strategy (push a copy of the sent message /
notify call / diagnostic into the matching array). No `tests/helpers/`
module exports this three-arm recording double; the nearest existing
system-note helper (`tests/helpers/e2e-s1.ts`'s `inertSystemNote()`) discards
rather than records.

## Evidence
tests/system-note-channel.test.ts:36-90 (re-read immediately before filing):
```ts
interface SentNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details?: SystemNoteDetails;
  readonly options: { readonly triggerTurn: false };
}

interface ChannelFixture {
  readonly deps: SystemNoteChannelDeps;
  readonly sent: SentNote[];
  readonly notified: Array<readonly [string, string]>;
  readonly emitted: Diagnostic[];
}

function makeChannel(opts?: {
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
    ...(opts?.rendererGate !== undefined ? { rendererGate: opts.rendererGate } : {}),
    ...(opts?.health !== undefined ? { health: opts.health } : {}),
  };
  return { deps, sent, notified, emitted };
}
```

tests/b0268-diagnostic-file-separator-normalisation.test.ts:135-176 — the
`ChannelFixture` interface is byte-identical, and `makeChannel` wires the
same three-arm recording strategy without the throw-injection/health/
rendererGate options:
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
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: {
      notify: (message: string, type: "error"): void => {
        notified.push([message, type]);
      },
    },
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      emitted.push(diagnostic);
    },
  };
  return { deps, sent, notified, emitted };
}
```

Exact search: `grep -rn "interface ChannelFixture" tests/*.test.ts` → 2 files
carry this exact four-field `{ deps, sent, notified, emitted }` shape:
`tests/system-note-channel.test.ts` and
`tests/b0268-diagnostic-file-separator-normalisation.test.ts`. A separate,
already-filed candidate (`qw20260917154546-d7-126-02-query-discard-sentnote-
recording-channel-duplicated.md`) covers a related but narrower two-field
`{ deps, sent }` `makeChannel` clone across `tests/query-discard.test.ts` and
`tests/runtime-event-channel.test.ts`, and explicitly names the `b0268`
`ChannelFixture` as "widened" without citing `system-note-channel.test.ts` as
an instance of its clone group — the byte-identical `ChannelFixture`
interface between `system-note-channel.test.ts` and `b0268` is a distinct,
uncited pairing.

## Why this is a problem
The same `ChannelFixture` shape and the same three-arm "push a copy into the
matching array" `SystemNoteChannelDeps` wiring is retyped independently in
two files instead of being imported once. Both files build the identical
fixture for the identical purpose — recording every `pi.sendMessage` /
`ctx.ui.notify` / `emitDiagnostic` call a `sendSystemNote`-family function
makes — which is the shape a `tests/helpers/` module would hold as one
export; no such module exists yet for this three-arm double.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting the three-arm recording
`SystemNoteChannelDeps` double (parameterising the throw-injection / health /
rendererGate options `system-note-channel.test.ts` alone needs) is the shape
both files already converge on; naming it is an observation of where the
duplicated code already points, not a design for the extraction.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin;
  the cited lines are fixture/double construction, not a pinned count or
  inventory.
- Recording-double check: `sent`/`notified`/`emitted` ARE legitimate
  recording doubles backing real assertions in both files — that validity is
  not challenged. This finding is about the same double's construction code
  being independently retyped, not about any assertion made against it.
- docs/bugs/ signature search: `grep -rl "system-note-channel.test\|b0268-diagnostic-file-separator" docs/bugs/*.md` → both files are named in `docs/bugs/0018-hot-reload-stale-ctx-after-session-replacement.md` and related bug docs as their OWN witness files (each test file is the fix's own regression test for its own bug), not as a documented correct-reason for keeping this scaffold file-local.
- coverage-matrix/bug-doc citation search: `grep -n "system-note-channel.test.ts\|b0268-diagnostic-file-separator-normalisation.test.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any test — only that the shared recording-double construction could be imported once.
- Overlap check: `grep -rl "ChannelFixture" quality/intake/*.md quality/resolved/*.md` (excluding this file) → only `qw20260917154546-d7-126-02-query-discard-sentnote-recording-channel-duplicated.md`, which cites a narrower two-field `{deps, sent}` clone across a different file pair and explicitly does not cite `system-note-channel.test.ts`'s `ChannelFixture`/`makeChannel` as an instance of its group.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; both copies are already exercised by every test in their own file.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at the cited lines (system-note-channel.test.ts:36-90, b0268:135-176), `interface ChannelFixture` greps to exactly these 2 files with a byte-identical four-field body, both `makeChannel`s wire the same three-arm push-into-array `SystemNoteChannelDeps` recording double, and tests/helpers/ exports no recording variant (e2e-s1.ts `inertSystemNote()` discards; scripted-live-session-harness.ts builds its own inline) — copy-paste fixture/double class confined to tests/; carve-outs inapplicable (neither file is a gate test, the doubles back real assertions and are not challenged, coverage-matrix 0 hits, bug docs 0018/0023/0453 cite system-note-channel.test.ts and bug 0268 cites b0268 only as witness/run references, none mandating a file-local double); not a duplicate — no accepted PTQ row cites either file, and pending sibling intake d7-126-02 covers the disjoint query-discard/runtime-event-channel pair (overlapping only on b0268) per the store's per-file-set convention (PTQ-0393 vs PTQ-0310); fixer note: the two candidates converge on one parameterised tests/helpers/ recording double — whichever lands first, the other migrates onto it; minor: the filing's claim that both files are named in bug 0018 is inaccurate (b0268 appears only in bug 0268), non-blocking (triage: claude-fable-5-1)
