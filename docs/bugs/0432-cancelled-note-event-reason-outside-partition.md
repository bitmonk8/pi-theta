# Bug 0432 — The clean-cancel note's spec-pinned `details: { event: { reason, theta, invocation_id } }` payload presents the `event` key without a `RuntimeEvent`, satisfying no arm of the channel's closed four-shape partition, no per-variant matrix row, and not the informational no-`details` clause — and its `display: false` + non-empty `content` pairing is one the matrix's only `display: false` row forbids

- **Status:** open.
- **Sev/Diff estimate:** S4/D2 — S4: two normative surfaces contradict on a
  note emitted once per cleanly-cancelled invocation at every session
  shutdown; a `diagnostic-shape.md:20`-conformant key-switching consumer
  classifies it as a group-A runtime event and reads absent required fields
  (`kind`, `message`, `occurred_at`) plus a `theta` value whose format
  (`demo`, no leading `/`) contradicts `RuntimeEvent.theta`'s pinned form
  (`/code-review`). D2: adjudication — the channel page gains an additive
  event-payload sub-shape/row (the 0404 pattern), or the PIC clean-cancel
  rule moves the payload to a different key, or the payload nests under
  `diagnostics` per `diagnostic-shape.md:42`'s literal reading; all are
  spec-meaning changes.
- **Kind:** spec gap (spec-vs-spec inconsistency; the implementation
  faithfully ships what one of the two surfaces pins).
- **Related:**
  - 0401 (fixed 0.390.0) — established that presenting `event` without a
    `RuntimeEvent` "actively selects the runtime-event arm of the partition
    and validates as nothing"; its fix clause covers only the five
    informational notes. This note carries a payload it MUST keep, so the
    0401 remedy (omit `details`) is unavailable — the ladder's next rung.
  - 0404 (fixed 0.414.0) — the same two-surfaces-disagree class for the
    BNDR-9 note's `diagnostics` pairing; fixed by an additive matrix row.
    This is the `event`-keyed sibling.
  - 0383/0397 (fixed) — pinned that on this channel the `event` key means
    `RuntimeEvent`; their witnesses assert exactly the key-switch this note
    breaks.
  - [bug 0434](./0434-operator-facing-diagnostics-notes-rowless.md) — sibling rung for the `diagnostics`-
    keyed rowless notes.
  - [bug 0436](./0436-shape-enumeration-sentences-stale.md) — the stale shape-enumeration sentences
    this note also falsifies.
- **Affected** (verified at `04579e12`, v0.415.0):
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:20` —
    "The `details` field carries one of four normative payload shapes,
    distinguished by which key is present"; the `event`-keyed shape is
    `details: { event: RuntimeEvent }`. `:39` — "The four `details` shapes
    are disjoint by key; renderers MUST NOT assume more than one is
    present." `:41` — the informational clause enumerates exactly five
    no-`details` notes; the clean-cancel note is not among them and carries
    `details`. `:35` — the matrix's only `display: false` row pairs
    `details: { event: RuntimeEvent }` with `content: ""` (empty string,
    verbatim). `:18` — "Empty `content` is legal … in theta 1.0 this only
    ever co-occurs with `display: false` and `details: { event:
    RuntimeEvent }`".
  - `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:19`
    — the *Per-invocation operator visibility (clean-cancel path)* rule pins
    the note: "emits exactly one `theta/runtime/cancelled-by-session-shutdown`
    (E, runtime) note on `theta-system-note` with `display: false`,
    `details.event.reason` carrying the handler-captured `event.reason`
    string …" plus `details.event.theta` (canonical key, "no leading `/`")
    and `details.event.invocation_id`.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:42` — "the outer
    `CustomMessage.details`, which stays closed to `{ diagnostics:
    Diagnostic[] }` plus the runtime-event-channel carve-out (`details:
    { event: RuntimeEvent }`)" — the shipped outer payload is neither.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md:41` — the row:
    "`display: false` on the companion `theta-system-note`", payload closed
    at `{reason}` + the two runtime-constructed siblings.
  - `src/extension/session-shutdown.ts:249–268` —
    `cancelledBySessionShutdownDiagnostic` nests `details.event.{reason,
    theta, invocation_id}`; `:492–495` — `emitCancelledBySessionShutdownNote`
    reuses that object as the note's OUTER `details` and sends
    `content: diagnostic.message` (non-empty), `display: false`.
  - `src/extension/production-theta-producer.ts:1862–1887` —
    `#emitCleanCancelNote`, the production caller (per-invocation `finally`).
- **Observed at:** v0.415.0 (`04579e12`), offline. Probe P2 (scratch,
  deleted) captured the note through the exported emitter; committed pins
  in `tests/cancelled-by-session-shutdown-note.test.ts` witness the same
  bytes.

## Summary

Bug 0401 closed the partition hole for notes that could simply omit
`details`; bug 0404 closed it for the BNDR-9 note by adding a matrix row.
One production note remains that CANNOT omit its payload and has no row:
the per-invocation clean-cancel note. PIC's clean-cancel rule, the registry
row, and diagnostic-shape.md's session-shutdown conventions all pin its
payload as `details.event.{reason, theta, invocation_id}` — and the channel
page's own partition has no arm for it: it is not `{ event: RuntimeEvent }`
(no `kind`/`message`/`occurred_at`; `theta` deliberately slash-less where
`RuntimeEvent.theta` pins `/name`), not `{ diagnostics }`, not structural,
not recovery, and not one of the five informational no-`details` notes. Its
`display: false` + non-empty `content` pairing likewise fits no matrix row
— the only `display: false` row mandates `content: ""`, and `:18` claims
`content: ""` "only ever" co-occurs with `details: { event: RuntimeEvent }`,
a claim this note sits outside in both directions.

## Reproduction

Offline, deterministic (probe P2, deleted; runnable in ~20 lines):

1. Build an `ActiveInvocationEntry` `{ theta: "demo", invocationId:
   "aaaaaaaa-…", shutdownReason: "reload", … }`.
2. Call `emitCancelledBySessionShutdownNote(entry, { channel: <capturing
   SystemNoteChannelDeps>, sink: <silent> })`
   (`src/extension/session-shutdown.ts:466`).
3. Captured wire bytes:
   `{"customType":"theta-system-note","content":"theta /demo cancelled by
   session shutdown (reload)","display":false,"details":{"event":{"reason":
   "reload","theta":"demo","invocation_id":"aaaaaaaa-bbbb-cccc-dddd-
   eeeeeeeeeeee"}}}`.
4. Classify per `runtime-event-channel.md:20/:39`: the present key is
   `event`; the payload has none of `RuntimeEvent`'s required fields. Per
   the matrix `:34–35`: no row matches (`display: false` row requires
   `content: ""`). Per `:41`: not an enumerated informational note.

## Expected behaviour

One of the surfaces must give; §Fix enumerates three routes (an additive
channel-page arm/row for the session-shutdown event payload — the 0404
pattern; re-keying the payload off `event`; nesting it under `diagnostics`
per `diagnostic-shape.md:42`'s literal reading). As shipped,
`diagnostic-shape.md:42`'s closed-set sentence
and `runtime-event-channel.md:20/:39/:41` are each false against a
spec-mandated emission. §Fix enumerates the routes; none is pre-decided
here.

## Actual behaviour / root cause

The clean-cancel contract (bug 0073's fix, later hardened by 0208/0355-era
work) was specified on the diagnostics pages (registry row +
diagnostic-shape conventions + PIC clean-cancel rule) and never reconciled
with the channel page's partition, which 0383/0397/0398/0401/0404
progressively tightened into a closed, machine-checkable contract. The
implementation follows the diagnostics pages byte-exactly (P2), so every
partition-driven consumer — the entitlement `diagnostic-shape.md:20` grants
("Renderers MUST switch on which key is present") — mis-classifies the note
as a group-A runtime failure event carrying an invalid payload.

A literal reading of `diagnostic-shape.md:42` sharpens the conflict: "Every
row-documented `details.{…}` payload lives on the `Diagnostic` object —
i.e. inside `CustomMessage.details.diagnostics[i].details` — not on the
outer `CustomMessage.details`". Under that reading the shipped note should
have emitted the group-B outer shape `{ diagnostics: [diagnostic] }` with
`details.event.*` intact one level down — making the defect partly
spec-vs-implementation rather than purely spec-vs-spec. Against that
reading, `session-shutdown-semantics.md:19` reads as pinning the fields at
note level.

## Why it matters

- The partition is the channel's load-bearing consumer contract; 0401's fix
  rationale ("falsely selects the runtime-event arm … while carrying no
  `RuntimeEvent`") applies verbatim to this note, and this note fires on a
  routine path (every in-flight invocation at `/reload`, session swap, or
  quit).
- Strict `RuntimeEvent` validation — the exact posture the 0383/0397 fixes
  invite — reds on a conformant emission, poisoning the signal for real
  group-A events.
- The `theta` field means two different things under one key (`/name` in
  `RuntimeEvent`, bare canonical key here), so even a lenient consumer that
  tolerates missing fields joins the wrong identifier space.

## Non-goals

- The note's content bytes, `display: false`, the console-row twin, the
  fallback forms, and the `{reason}` value spaces (all pinned; nothing
  behavioural need move under fix option (a)).
- The five informational notes and the BNDR-9 row (0401/0404, closed).
- The `theta/host/session-swap-instance-survived` diagnostic's
  `details.event.{reason}` (console.error-only; excluded from the channel,
  so the channel partition does not govern it).

## Fix

Three options, unranked:

- **(a) Additive event-key sub-shape + row**: spec edit to
  `runtime-event-channel.md` — a fifth partition entry for the closed
  session-shutdown event payload (cross-referencing
  `diagnostic-shape.md#session-shutdown-details-conventions` as shape
  owner) plus one matrix row (`display: false`; `content` = the registry
  *Message* for the row); qualify `:39`'s disjointness sentence so
  `event`-keyed payloads split on `kind`-presence (a `RuntimeEvent` always
  has `kind`; the closed payload never does). Must keep the b0265 gate
  green (no additive row may contain the substring `runtime panic
  (single-element batch`) and the `:18` "only ever" sentence needs its
  co-occurrence claim widened or scoped.
- **(b) Re-key off `event`**: change the note's outer `details` to a
  non-`event` key (e.g. `{ shutdown: {…} }`). A wire-shape change to a
  pinned contract: the operator-tooling `details.event.*` strict-validation
  entitlement ("tests are entitled to assert its presence") and the
  committed witnesses move with it, so the PIC/diagnostic-shape/registry
  sentences must move in the same commit.
- **(c) Nest under `diagnostics` per `diagnostic-shape.md:42`'s literal
  reading**: emit the group-B outer shape `{ diagnostics: [diagnostic] }`
  with `details.event.{reason, theta, invocation_id}` intact one level
  down at `details.diagnostics[i].details`. No wire loss for
  `details.event.*` consumers (the path changes, the fields survive);
  `session-shutdown-semantics.md:19`'s note-level pinning must be re-worded,
  and the note's `content`/`display: false` pairing then folds into the
  group-B rowless problem [bug 0434](./0434-operator-facing-diagnostics-notes-rowless.md) covers.

Constraint on all three: DIAG-2 discipline — the spec sentence lands first
or same-commit.

## Provenance

fix-residuals ladder continuation (0401 §Fix clause → 0404 §Fix Residual 1
method applied to the `event` key). Spec read:
`runtime-event-channel.md:20–41`, `session-shutdown-semantics.md:19`,
`diagnostic-shape.md:20,42` + `#session-shutdown-details-conventions`,
`code-registry-runtime.md:41`. Implementation read:
`session-shutdown.ts:232–497`, `production-theta-producer.ts:1846–1887`.
Probe P2 run at `04579e12` (scratch deleted; bytes quoted above). Dup check:
README index + 0073/0208/0383/0397/0398/0401/0404 read in full — none
covers the note-vs-partition conflict.
