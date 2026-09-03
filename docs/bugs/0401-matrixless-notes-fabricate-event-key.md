# Bug 0401 — Four production informational notes outside the four-shape `details` matrix fabricate the runtime-event key: the binder success echo, the SLSH-1 overflow note, the drain-state shutting-down/superseded note, and the repeat-start supersession note all ship `details: { event: {} }`, so the partition rule "distinguished by which key is present" classifies each as an empty runtime event — and the spec assigns these notes no `details` shape at all

- **Status:** open.
- **Kind:** spec gap + defect. Gap: `runtime-event-channel.md:20` enumerates
  four normative `details` payload shapes "distinguished by which key is
  present" and the per-variant matrix (`:27`) pairs each with
  `display`/`content` — but the success echo, the SLSH-1 overflow note, and
  the two factory lifecycle notes emit on the same channel with no assigned
  shape (no row, no "details absent" clause). Defect: the implementation
  resolves the silence by fabricating the `event` key with an empty object,
  which actively selects the runtime-event arm of the partition and validates
  as nothing.
- **Related:**
  - 0383 (fixed 0.360.0) — §Residuals 2 recorded these sites verbatim as
    "each needs its correct `details` arm from PIC's System-notes matrix, and
    matrix-less notes need DIAG-2 decisions. Recorded, not fixed." This is
    that filing for the matrix-less subset.
  - Report 01 in this area — the binder-FAILURE sibling, excluded here because
    its payload IS matrix-pinned (group A).
  - Report 02 in this area — the `custom-type-unsafe` sibling, excluded here
    because a registered diagnostic pins its shape (group B).
  - 0311/0378 (fixed) — the structural note's `details.structural` content;
    that shape is matrix-conformant at HEAD (`reload-wiring.ts:478–487`),
    confirming the four matrix rows are implementable and implemented — only
    the matrix-less notes ship the stub.
- **Affected** (verified at `d63c5148`, v0.382.0):
  - `src/extension/production-theta-producer.ts:1166` — `#emitBinderEchoNote`
    (`Running /<name>: …`, BND-1): `details: { event: {} }`.
  - `src/extension/production-theta-producer.ts:1599` —
    `#emitNoParamsOverflowNote` (SLSH-1): same literal.
  - `src/extension/factory.ts:700` — the PIC-29..32 drain-gated dispatch
    handler's shutting-down / superseded note: same literal.
  - `src/extension/factory.ts:766` — the bug-0021 repeat-start supersession
    note (`theta: repeat session_start without session_shutdown; …`): same
    literal.
  - `src/runtime/slash-dispatch.ts:187` — `driveSlashPromptTurn`'s
    err/cancelled note: same literal; cited for completeness — no `src/`
    caller at HEAD (test-only surface), so it is blast radius, not a
    production emission.
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:20` —
    the four-shape closure ("The `details` field carries one of four
    normative payload shapes, distinguished by which key is present");
    `:27–33` — the per-variant matrix; `:38` — the disjointness rule ("The
    four `details` shapes are disjoint by key; renderers MUST NOT assume more
    than one is present"); `:3–5` — the echo is enumerated as emitting
    "through a single call shape" on this channel. The "Renderers MUST switch
    on which key is present" wording lives at
    `docs/spec_topics/diagnostics/diagnostic-shape.md:20`.
  - `docs/spec_topics/slash-invocation.md:15` (SLSH-1) — the overflow note's
    content/channel, no `details` clause.
- **Observed at:** v0.382.0 (`d63c5148`). Offline, deterministic: probes P1/P3
  (deleted) captured the echo and overflow notes through the production
  `runBinder` (S5 rig); the factory sites read at source (same literal, same
  channel).

## Summary

The `theta-system-note` channel's `details` contract is a closed four-arm
partition keyed on which key is present. Four production notes sit outside the
partition: the binder success echo (which the channel's own intro lists as an
emitter), the SLSH-1 no-params overflow note, and the two factory lifecycle
notes (drain-state dispatch refusal, repeat-start supersession). The spec
gives them content templates and `display` semantics but no `details` shape —
and no statement that `details` may be absent or empty on this channel.

The implementation ships `details: { event: {} }` on all four. That is the
worst available resolution of the silence: the `event` key is load-bearing for
the partition, so a conforming key-switching consumer classifies each of these
informational notes as a group-A runtime failure event and then reads a
payload with none of the `RuntimeEvent` required fields. Strict validation
fails on every success echo — the happiest-path note the channel carries.
After 0383 fixed the SLSH-4 note (and with reports 01/02 covering the
spec-pinned siblings), these four sites are what keeps `{ event: {} }` on the
wire.

## Reproduction

At `d63c5148`, offline (scratch probes, deleted):

1. Echo: scripted `ok` envelope through the production `runBinder` → captured
   note `{"customType":"theta-system-note","content":"Running /code-review:
   topic=async, audience=team","display":true,"details":{"event":{}}}`.
2. SLSH-1: no-params theta driven with args `"extra text here"` → captured
   note `{"content":"theta /plain: ignoring extra arguments — this theta takes
   no parameters","display":true,"details":{"event":{}}}`.
3. Factory sites: `rg -n "event: \{\}" src/` → `factory.ts:700, 766` (plus the
   producer sites above and the caller-less `slash-dispatch.ts:187`).

## Expected behaviour

- `runtime-event-channel.md:20` — the `details` field carries ONE OF FOUR
  shapes, distinguished by present key; `:38` — the shapes are disjoint by
  key; `diagnostic-shape.md:20` — renderers MUST switch on which key is
  present. A note whose `details` presents the `event` key while carrying
  no `RuntimeEvent` satisfies no arm of the closed partition.
- For the echo / overflow / lifecycle notes specifically the spec prescribes
  no shape — the gap half. Any resolution (a dedicated informational shape, an
  absent-`details` clause, or per-note rows) is a DIAG-2-style spec decision;
  what the current bytes do — claiming the runtime-event arm — is the one
  disposition the existing text actively contradicts.

## Actual behaviour / root cause

The `{ event: {} }` literal is the channel's historical placeholder (0383
§Actual behaviour): every emission site that predates the structured-details
work stubbed the field identically, and 0383's fix constraint 2 deliberately
left the non-SLSH-4 sites for per-note adjudication. The four sites here are
the remainder with no spec-pinned payload to adjudicate against.

## Why it matters

- The disjoint-by-key partition is load-bearing for the registered renderer
  and for log/transcript tooling; the spec says consumers may rely on it, and
  the echo — emitted on every successful non-bypass bind — breaks it on the
  most common note the channel carries.
- Strict `RuntimeEvent` validation (invited by `slash-invocation.md:63`'s
  "same value emitted at the originating failure site" rule and by 0383's
  fix) now fails on informational notes, poisoning the signal for the
  real event notes.
- Every `CustomMessage` enters the model context durably
  (`runtime-event-channel.md`, *Custom-message channel persistence*): the
  fabricated empty `event` object is serialised into every subsequent provider
  call for the rest of the session, per note.

## Non-goals

- The binder-failure and custom-type-unsafe sites (reports 01/02 — payloads
  spec-pinned, no gap).
- The `content` bytes and `display` values of all four notes (conformant;
  probed byte-exact for echo/overflow).
- The structural / recovery / diagnostics-batch / panic notes (matrix rows;
  verified conformant at HEAD — `reload-wiring.ts:478–487`,
  `binder-model.ts:312`, `emitPanicNote`).
- Removing `driveSlashPromptTurn` (dead code question, separate concern).

## Fix

Not yet decided; constraints any fix must satisfy:

1. A spec sentence must land first (DIAG-2 discipline, per 0383 §Fix
   constraint 2): either (a) a fifth informational `details` shape (e.g.
   `details: { info: { … } }`) added additively per the matrix's own
   additive-disjoint convention, or (b) an explicit "informational notes carry
   no `details`" clause + omission on the wire. Option (b) is smaller and
   matches the renderer's existing content-driven handling; option (a) gives
   tooling a positive discriminator. Either way the `event` key must stop
   appearing without a `RuntimeEvent`.
2. All four sites (and the test-only `slash-dispatch.ts:187`) move in the same
   commit — a partial fix leaves the partition violated and merely rarer.
3. Witness: capture each note; assert `details` matches the adjudicated shape
   and that `"event" in details` is false; red direction is today's
   `{ event: {} }` signature (probes P1/P3).

## Provenance

Spec read: `pi-integration-contract/runtime-event-channel.md:1–39`,
`slash-invocation.md:15`, `binder/defaulting-system-note-echo.md` (echo
policy), `pi-integration-contract/registration-steps.md` (PIC-29..32 context),
`diagnostics/diagnostic-shape.md:20`. Implementation read:
`src/extension/production-theta-producer.ts:1090–1170, 1590–1605`,
`src/extension/factory.ts:685–775`, `src/runtime/slash-dispatch.ts:130–190`,
`src/extension/reload-wiring.ts:460–487`, `src/binder/binder-model.ts:295–330`.
Prior bugs read in full: 0383 (§Residuals 2 — the sanctioning record), 0311,
0378, 0021. Probes P1/P3 run at `d63c5148` (scratch files deleted);
`rg "event: \{\}" src/` quoted in §Reproduction.
