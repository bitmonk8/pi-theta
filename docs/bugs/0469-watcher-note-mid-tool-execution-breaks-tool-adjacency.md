# Bug 0469 — a watcher-driven `theta-system-note` delivered while a Pi tool call is in flight lands between the assistant `tool_use` and its `toolResult`, and Pi's replay renders it as a `user`-role provider message: the orphaned `tool_result` makes every subsequent driven turn in that session fail with a provider 400, and the corruption is durable in the session file

- **Status:** fixed — trigger frequency was first materially reduced by bug
  0471 (0.465.0); the principled fix landed at 0.467.0 as RFC 0010's PIC-72
  entry-channel migration (see §Fix).
- **Sev/Diff estimate:** S2/D3 — S2: it destroys the *reported* output of a
  completed long run and it is durable. In the seeding incident a 14-hour
  `/quality-loop` run did all of its work successfully (7 clusters fixed and
  committed, 2 reverted, store consistent, tree green) and then died on its
  closing report query with a provider 400, so the theta returned
  `Err(transport)` and the entire user-facing summary was lost; the run's real
  output survived only because it had already been committed to git. The
  corruption is written to the session file, so it re-detonates on **every**
  later driven turn until the file is repaired by hand — the incident session
  still carries a second, not-yet-detonated orphan
  (`toolu_01EXTDhpS6V2nAnNSMA4yuRG`). It is not S1 because no committed work
  is lost and the damage is repairable by rewiring `parentId`s. D3: the
  mechanical change is small, but the fix needs an adjudication (new delivery
  channel vs. idle gate), a spec amendment to a pinned call shape, and a new
  consumed host capability.
- **Kind:** defect — spec and implementation agree with each other and together
  produce an invalid provider payload.
  [`runtime-event-channel.md:3`](../spec_topics/pi-integration-contract/runtime-event-channel.md)
  pins that watcher structural-change notes and operator-facing runtime events
  "all emit through a single call shape" (`pi.sendMessage`), and the
  implementation does exactly that. Neither the spec nor the implementation
  places any constraint on *when* that call may happen relative to the driven
  session's tool-execution window, and the asynchronous watcher path can fire
  at any instant — including between an assistant `tool_use` and the
  `toolResult` that must directly follow it.
- **Related:**
  - [0018](./0018-hot-reload-stale-ctx-after-session-replacement.md)
    (fixed 0.28.0) — the other defect where the *asynchronous watcher path*
    reaches a session surface it has no synchronization with; that one was
    about a stale `ctx`, this one is about a badly-timed write to a live one.
  - [0468](./0468-subagent-teardown-budget-shared-2000ms.md) (fixed 0.464.0)
    and [0464](./0464-turn-settle-bound-too-tight-for-long-tool-turns.md)
    (fixed 0.461.0) — same family in spirit: behaviour that is correct at test
    scale and fails on a real production run.
  - [0470](./0470-load-diagnostics-re-emit-without-dedup.md) (open) — the
    volume multiplier. Every redundant re-emission is an independent chance to
    land inside a tool-execution window, so 0470 sets this bug's detonation
    probability.
  - [0471](./0471-non-theta-file-change-triggers-full-rescan.md) (open) — the
    trigger multiplier: it is why rescans fire at all for unrelated files.
- **Affected** (at 359d27ef, v0.464.0):
  - `src/extension/system-note-channel.ts:458` — `emitDiagnosticBatch(...)`,
    which routes a scan's `Diagnostic[]` into `sendSystemNote` and therefore
    `pi.sendMessage({ customType: "theta-system-note", … }, { triggerTurn: false })`.
  - `src/extension/system-note-channel.ts:464` — the comment recording the
    no-dedup re-emission contract (see 0470).
  - `src/extension/hot-reload.ts:185` — the watcher path's own
    `emitDiagnosticBatch([diagnostic], deps.channel)`.
  - `src/extension/hot-reload.ts:386` and `:421` —
    `onChange: (event) => debouncer.onWatcherEvent(event)`, the unsynchronized
    entry point.
  - `src/extension/production-composition.ts:1694` — `emitDiagnosticBatch(warnings, channel)`
    for the load-pass warning set (the class observed in the incident).
  - Not affected: the delivery channel's fallback chain and stale-ctx latch,
    which behave exactly as specified — the note *was* delivered successfully.
    The defect is the timing of a successful delivery, not a delivery failure.

## Mitigation shipped (0.465.0) — and why the full fix is deferred

Bug [0471](./0471-non-theta-file-change-triggers-full-rescan.md) shipped: the
watcher no longer rescans on non-theta file writes. That removes this bug's
dominant trigger — a watcher rebuild (and its note emission) now happens only on
a real `.theta`/`.thetalib`/settings edit, not on every `src/**` or scratch-file
write under a discovery root. In the seeding workflow (a `/quality-loop` run,
which edits no theta sources) that means zero watcher-driven emissions during
the run, so the exact incident cannot recur. The residual window — an operator
editing a theta/settings file *while a tool call is in flight* — is rare and
partly under operator control.

The interim **idle-gate** the original plan proposed (queue watcher-driven notes
while a run is active, flush on `ctx.waitForIdle()`) was **not** shipped in this
pass: it threads idle-state through the whole note channel with real
ordering/lifetime/shutdown surface area, and it is **thrown away** the moment
the principled fix lands. The principled fix is option 1 below — route
operator-facing note classes through `pi.appendEntry` (entries never enter
provider replay, so adjacency cannot break) — carried as the first increment of
RFC 0010, whose optional-capability machinery it shares. Re-scan deduplication
(the rule that blocked bug 0470's dedup) does not obstruct it: `appendEntry` is
a channel change, not a suppression.

## Symptom

Verbatim, from the seeding incident (session
`01a06211-d6f2-7fe8-be8c-de21cc092933`, note at `2026-09-09T00:21:10.792Z`):

```
theta /quality-loop returned Err: transport — 400 {"type":"error","error":
{"type":"invalid_request_error","message":"messages.294.content.4: unexpected
`tool_use_id` found in `tool_result` blocks: toolu_018KnsZe1CQbnMntorxQy8MY.
Each `tool_result` block must have a corresponding `tool_use` block in the
previous message."},"request_id":"req_011Ceruhd5RA1wV4GhWGkHkX"}
```

The theta had run for ~14 h; this was its first driven turn since the corrupting
write, and it was the closing report query that exists solely to show the user
the run summary.

## Expected

The runtime may append system notes to the user's session at any time, and doing
so must never render the session unusable. The obligation is already stated for
the neighbouring case: the runtime carries a non-mutation obligation toward
Pi-committed conversation surfaces — assistant tokens, tool-call cards, and
system notes must not be truncated, re-written, replaced, removed, or joined by
a compensating injection
([`error-model.md#mid-stream-cancellation-conversation-state`](../spec_topics/errors-and-results/error-model.md),
cited from [`slash-invocation.md` SLSH-2](../spec_topics/slash-invocation.md)).
A note that leaves the session's `tool_use`/`tool_result` pairing unreplayable
is a mutation of exactly that kind, arriving by insertion rather than by edit.

## Actual

The session-file evidence (entry lines from the incident file):

```
1590 message  assistant  [thinking, text, toolCall]  id=a32e5688  parent=63d0ecf0
1594 custom_message  theta-system-note              id=7c29d446  parent=a32e5688
1595 custom_message  theta-system-note              id=9f0a3049  parent=7c29d446
1596 custom_message  theta-system-note              id=298791f4  parent=9f0a3049
1597 message  toolResult                            id=923ba519  parent=298791f4
```

The assistant message at 1590 carries the `toolCall` whose id appears in the
400. A watcher rescan completed while that tool call was still executing, so
three load-diagnostic notes were appended at the then-current leaf — the
assistant message — and the `toolResult` that arrived next was parented on the
last note instead of on the assistant message.

Replaying that path the way Pi does (independently reproduced by the
`repair-check.js` replica used during triage) reports four problems on the
active path, two per affected tool call:

```
{"kind":"synthetic-inserted","ids":["toolu_018KnsZe1CQbnMntorxQy8MY"],"before":"user","atEntry":"7c29d446","line":1595}
{"kind":"synthetic-inserted","ids":["toolu_01EXTDhpS6V2nAnNSMA4yuRG"],"before":"user","atEntry":"4b7aab68","line":1603}
{"kind":"orphan-toolResult","toolCallId":"toolu_018KnsZe1CQbnMntorxQy8MY","entryId":"923ba519","line":1598,"prevRole":"user"}
{"kind":"orphan-toolResult","toolCallId":"toolu_01EXTDhpS6V2nAnNSMA4yuRG","entryId":"f244001d","line":1606,"prevRole":"user"}
```

`prevRole: "user"` is the mechanism: custom messages are replayed as a
**`user`**-role provider message, so the interleaved notes become a user turn
sitting between the `tool_use` and its `tool_result`. The provider then sees a
`tool_result` whose preceding message is not the `tool_use` message and rejects
the whole request — not just the affected pair.

Two further properties make this worse than a single lost turn:

- **Durability.** The bad `parentId` chain is persisted. Every later driven turn
  on that session replays the same region and gets the same 400, so the session
  is effectively dead for prompt-mode thetas until repaired.
- **Latency between cause and effect.** The corrupting write happened at
  `11:50`; the 400 fired at `00:21` the next day, because the loop's body is
  `bash()` calls and subagent dispatches, none of which drive a turn. Nothing
  surfaces at corruption time, so the operator's only signal arrives hours
  later attached to an unrelated statement.

## Root cause

The `theta-system-note` channel has exactly one delivery mechanism — a custom
*message*, which participates in provider replay — and no notion of a safe
emission window. Synchronous emissions are inherently safe: they happen at
points the runtime itself controls (load, binder completion, theta return).
The watcher path is not synchronous with anything: a rescan is scheduled by a
debounce timer and completes whenever it completes, which on a long-running
orchestrator theta is overwhelmingly likely to be inside a tool-execution
window, because that is where such a theta spends nearly all of its wall time.

## Fix (0.467.0)

Fix option 1 below, landed as layer L1 of [RFC
0010](../rfcs/0010-live-execution-visibility.md): the three operator-facing note
classes now deliver as session **entries**, which do not participate in LLM
context, so the interleave this bug reports cannot be constructed for them.

Mechanism:

- `createEntryChannel(pi)` (`src/extension/execution-status/entry-channel.ts`)
  presence-probes `pi.appendEntry` / `pi.registerEntryRenderer` (`typeof` only,
  per surface — the PIC-73 optional-capability class) and registers the
  `theta-progress-entry` renderer synchronously in the factory body beside the
  `theta-system-note` message renderer (PIC-71). A missing member, a throwing
  registration, or the first throwing `appendEntry` marks the channel dead for
  the session, SILENTLY (no diagnostic — the registries are closed, DIAG-2).
- `deliverOperatorNotePreferringEntry(note, deps)`
  (`src/extension/system-note-channel.ts`) is the one delivery decision:
  entry first, else the pre-existing `pi.sendMessage` realization with its
  `display`/`content`/`details` pairing, five-shape partition, and best-effort
  fallback chain unchanged. Exactly one channel realizes each note — never
  both, never neither (PIC-72), so the migration drops no class.
- Three switch sites cover exactly the PIC-72 classes: the diagnostic BATCH
  class through `emitDiagnosticBatch`'s inner call (which migrates every batch
  emitter with no caller edits) plus the pre-eval error router
  (`load-pre-eval.ts`), and the structural-change note (`hot-reload.ts`). Every
  other emitter on `runtime-event-channel.md` — runtime panics, the BNDR-9
  note, SLSH-1/SLSH-3 notes, runtime events, binder failure notes, the binder
  echo, the factory lifecycle notes, the shutdown clean-cancel note, and every
  informational (details-absent) note — is untouched and stays on the message
  channel. The binder-model recovery note has no production send site yet
  (`computeBinderModelRecoveryNote` / `buildRecoveryNote` are builder-only), so
  its obligation is carried by the shared helper: any future wiring routes
  through it.
- Renderer parity: the entry renderer reuses the message renderer's own body
  formatter (`renderSystemNoteBody`, `system-note-renderer.ts`), so a migrated
  note renders byte-identical lines on either channel and inherits PIC-56's
  width fitting and PIC-21's never-throw guard.
- No dedup on either channel: a re-scan re-appends / re-sends (bug 0470's
  spec-forbidden dedup is still forbidden — `diagnostic-shape.md` §Re-scan
  deduplication). The adjacency benefit is structural, not suppression.

Witnessed offline by `tests/execution-status-entry-channel.test.ts` (delivery
as an entry per class, the absent-member / throwing-registration /
throwing-append degrade ladder, no dedup, and byte-identical renderer lines).
The remaining test obligation below — a replay-adjacency witness over a
synthetic session path — is still unwritten.

## Fix options (adjudication, retained)

1. **Deliver operator-facing note classes as session *entries* rather than
   messages** (recommended). Pi exposes `pi.appendEntry(customType, data?)`
   with `pi.registerEntryRenderer(customType, renderer)` for durable TUI content
   that "do[es] not participate in LLM context" (Pi's `docs/extensions.md`);
   such entries are not provider messages, so they cannot break adjacency and
   cannot burn context. The load/parse diagnostic batch, the structural-change
   note, and the binder-model recovery note are all operator-facing and have no
   reason to enter the model's context. Cost: `appendEntry` /
   `registerEntryRenderer` appear nowhere in theta's spec or `src/` today, so
   this adds two consumed host surfaces (and their absence must degrade rather
   than refuse — the optional-capability class proposed by RFC 0010), plus an
   amendment to the single-call-shape pin at `runtime-event-channel.md:3`.
2. **Idle-gate the message-class notes.** Queue any note whose class must stay
   a message while the session reports a run in flight, and flush on idle. Keeps
   LLM-context participation where it is wanted; needs ordering and lifetime
   rules (what happens to a queued note at `session_shutdown`, and how it
   interacts with the PIC-54 fallback chain). Worth doing for the classes
   option 1 does not move, as a belt.
3. **Upstream: make Pi's provider-message assembly adjacency-safe** by skipping
   or hoisting custom messages when it lowers the session path to provider
   messages. This is the general fix — every extension that calls `sendMessage`
   during a tool call can trigger this — and it is the only one that repairs
   already-corrupted sessions on read. File upstream regardless of which
   theta-side option lands; do not wait for it.

Recommendation: **1 for the diagnostic / structural / recovery classes, 2 as a
belt for any class that must remain a message, 3 filed upstream in parallel.**
0470 and 0471 should land in the same pass: they are what turns this from a rare
race into a nightly certainty.

## Operational follow-up

The incident session still holds the second orphan. Either repair its
`parentId` chain (the `repair-fix.js` approach: move `toolResult`s to directly
follow their assistant message and re-link interleaved custom entries after
them, adding and removing nothing) or start a fresh session for further
prompt-mode theta work in that directory.

## Test obligations

- Offline: emit a diagnostic batch while a Pi tool call is in flight against a
  fake session surface, and assert the note does not land between the assistant
  entry and the `toolResult` (post-fix: that it is an entry, not a message).
- Offline: a replay-adjacency assertion over a synthetic session path
  containing interleaved notes — the check the triage replica performed, kept as
  a permanent witness so a regression is caught without a provider.
- Offline: `session_shutdown` with a queued note (option 2 only) drops or
  flushes it per the adjudicated rule, without touching the invalidated
  runtime.
- Live (H8a): drive a theta whose body holds a real tool call open, trigger a
  watcher rescan mid-call, then drive a query and assert it does **not** return
  `Err(transport)`. Both directions per `AGENTS.md`: the same test must red
  before the fix.
