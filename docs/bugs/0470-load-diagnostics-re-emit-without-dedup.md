# Bug 0470 — every rescan re-emits the full load-diagnostic set as fresh `theta-system-note` messages with no dedup or supersede, so an unchanged project accumulates hundreds of byte-identical warning notes in one session (408 observed, in bursts of 60/minute), each one burning LLM context and each one an independent chance to detonate bug 0469

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — S3: nothing is functionally wrong, but three
  distinct costs compound. (a) Custom messages participate in LLM context
  (Pi's `docs/extensions.md`), so 408 copies of three warnings is roughly 25k
  tokens of pure duplication carried in a working session's context. (b) The
  operator-facing signal is destroyed: a genuinely new load error arrives
  indistinguishable from the 400th copy of a permanent warning, which is the
  same "the one signal that should mean something is now routine noise" failure
  0468 was raised for. (c) It sets the detonation probability for
  [0469](./0469-watcher-note-mid-tool-execution-breaks-tool-adjacency.md) —
  each redundant emission is an independent draw at landing inside a
  tool-execution window. D2: the mechanical change is a per-file digest
  compared across scans, plus one adjudication (what, if anything, to emit when
  a set is unchanged) and a spec sentence.
- **Kind:** defect — spec and implementation agree with each other and together
  fail at production scale. The re-emission is deliberate and documented at
  `src/extension/system-note-channel.ts:464`: "A re-scan re-emits with no
  dedup / supersede (a second call is a second `sendMessage`)." That contract is
  defensible for the scan-once-at-load case it was written for; it was never
  reconciled with a watcher that rescans dozens of times per hour
  ([0471](./0471-non-theta-file-change-triggers-full-rescan.md)) on a project
  whose warning set is permanently non-empty.
- **Related:**
  - [0469](./0469-watcher-note-mid-tool-execution-breaks-tool-adjacency.md)
    (open) — the failure this bug's volume converts from unlikely to nightly.
  - [0471](./0471-non-theta-file-change-triggers-full-rescan.md) (open) — why
    the rescans happen; fixing 0471 cuts the volume, fixing this one caps it.
  - [0013](./0013-load-warnings-dropped-by-both-production-sinks.md)
    (fixed 0.24.0) — the opposite failure on the same channel: load warnings
    that reached no sink at all. The fix for this bug must not regress 0013 —
    an unchanged-set suppression must still emit the set the first time.
  - [0468](./0468-subagent-teardown-budget-shared-2000ms.md) (fixed 0.464.0) —
    same "diagnostic that lies at scale" framing.
- **Affected** (at 359d27ef, v0.464.0):
  - `src/extension/system-note-channel.ts:458-470` — `emitDiagnosticBatch`,
    one `sendMessage` per scan carrying the full `Diagnostic[]`, with the
    no-dedup contract in its own comment at `:464`.
  - `src/extension/production-composition.ts:1694` — the load-pass warning
    emission, re-run in full by every rescan.
  - `src/binder/binder-model.ts:16-18` — the reason the set is *permanently*
    non-empty on current Pi: `strictCapable` is absent from `Model<Api>` at the
    pinned SDK, so `theta/load/binder-model-strict-capability-unknown` is the
    universal branch and fires once per non-bypass theta, every scan, forever.

## Symptom

From the seeding incident session (`01a06211…`), counted over the whole file:

```
total theta-system-notes: 423   of which load-diagnostic: 408
load-warning notes by minute (top 5):
  2026-09-07T21:48   60
  2026-09-07T21:49   60
  2026-09-07T21:50   59
  2026-09-07T21:47   32
  2026-09-08T21:05   24
```

Three thetas are registered in the project, each producing exactly one
`binder-model-strict-capability-unknown` warning, so 60 notes/minute is ~20
completed rescans per minute — for a project whose `.theta` files had not
changed at all. The three warnings are byte-identical every time, differing only
in `id`, `parentId`, and `timestamp`. The operator-visible effect is the same
three-line block pasted into the transcript over and over.

## Expected

Load diagnostics describe the *state of the discovered corpus*. When that state
has not changed, re-announcing it carries no information. The channel's own
design elsewhere already recognises supersede-style semantics — the binder-model
hot-reload recovery note is explicitly a *single consolidated* note that "MUST
NOT be emitted when `recovery.thetas.length === 0`"
([`binder-model-and-context.md#binder-model-hot-reload`](../spec_topics/binder/binder-model-and-context.md),
implemented at `src/binder/binder-model.ts` `computeBinderModelRecoveryNote`) —
so "emit only when there is something new to say" is an established principle on
this channel, applied to one note class and not to the diagnostic batch.

## Actual

`emitDiagnosticBatch` is stateless. Every scan builds the full `Diagnostic[]`
and hands it to `sendSystemNote`, which unconditionally calls `pi.sendMessage`.
There is no comparison against the previous scan's set, no per-file digest, and
no suppression path. The rescan trigger being over-eager (0471) then multiplies
a fixed 3-note cost by however many times an unrelated file is touched.

## Fix

Keep a per-scan digest of the emitted diagnostic set — keyed per file, over the
`(severity, code, file, line, column, message)` tuple of each row — in the same
per-extension-instance state that owns the channel deps (constructed once and
injected, never module-level, per the repo's no-globals rule). On a rescan:

- emit the batch for a file whose digest changed (including "changed to empty",
  which is a genuine transition worth surfacing);
- suppress a file whose digest is identical to the last emitted one;
- keep the first emission after construction unconditional, so
  [0013](./0013-load-warnings-dropped-by-both-production-sinks.md) does not
  regress and a fresh session still learns its corpus state.

Two adjudications for the fix pass:

1. **Whether an unchanged rescan says anything at all.** Recommended: nothing on
   the persistent channel. If a "still N warnings" signal is wanted it belongs
   on the transient/status surface (RFC 0010's footer), not as a transcript
   entry.
2. **Whether the host-capability warning should be per-scan at all.**
   `binder-model-strict-capability-unknown` is a fact about the *host*, not
   about the theta file it is attributed to; on current Pi it is guaranteed for
   every non-bypass theta. Recommended: collapse it to one note per extension
   instance naming the affected count (`3 thetas`), rather than one note per
   theta per scan. That alone removes the observed noise entirely, and it is
   the change the operator will actually notice.

This fix composes with 0469 option 1: if operator-facing diagnostics move to
`pi.appendEntry`, the context-burn cost disappears, but the *noise* cost does
not — an entry repeated 408 times is still 408 lines of transcript. Both changes
are wanted.

## Test obligations

- Offline: two consecutive scans with an identical diagnostic set produce
  exactly one emission; a third scan with one row changed produces a second
  emission carrying the new set.
- Offline: a set transitioning to empty emits once (the "cleared" transition),
  and a further empty scan emits nothing.
- Offline: first emission after construction is never suppressed (0013 guard).
- Offline: the collapsed host-capability note (if adjudication 2 is taken)
  names the count and fires once per instance across repeated scans.
