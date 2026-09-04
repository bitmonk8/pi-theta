# Bug 0435 — The shipped compose wiring routes `sendSystemNote`'s step-2 delivery-failure diagnostic back through `pi.sendMessage`: the fallback's diagnostic step re-invokes the surface that just threw, violating the channel's re-entry MUST NOT, and the failure is additionally teed into the load pass's refusal recorder as if it were a load diagnostic

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — S3: no silent value corruption, but the
  channel's mandated failure containment is structurally inverted on the
  two note families riding the re-entrant channel (parse/lex batch notes
  and the per-invocation clean-cancel note): the diagnostic step re-drives
  the failed host surface, the spec's terminal
  `system-note delivery failed:` stderr line becomes unreachable from these
  wirings, and a channel failure is recorded into load bookkeeping. D2:
  multi-seam — the fix must pick an off-channel `emitDiagnostic` for the
  `runComposePass` channel (the sibling channel one function up already
  does this correctly and documents why).
- **Kind:** defect — a MUST NOT with a mechanical witness.
- **Related:**
  - 0018 (fixed 0.28.0) — built the stale-ctx half of the fallback chain;
    the non-stale half's re-entry guard is the sentence violated here.
  - 0030 (fixed 0.35.0) — made H9a grep the
    `system-note delivery failed:` stderr signature; on the re-entrant
    wirings that signature can no longer be produced (the step-2 call
    "succeeds" by delegating, so the terminal arm never runs).
  - 0023 (fixed 0.34.0) — introduced the bootstrap sink whose tier-2 arm is
    the re-entry vehicle for producer-side diagnostics.
  - [bug 0434](./0434-operator-facing-diagnostics-notes-rowless.md) — the re-delivered delivery-failed
    note is also one of the rowless operator-facing notes enumerated there.
  - [bug 0437](./0437-producer-note-sites-bypass-fallback-chain.md) — sibling defect on the same spec
    paragraph, distinct mechanism (raw sends that never enter the chain).
    Ordering: land THIS report first — 06's prescribed fix routes its six
    sites through `#input.systemNoteChannel`, which is the defective `:668`
    channel (`:827`), so fixing 06 first trades one violation for the
    other.
- **Affected** (verified at `04579e12`, v0.415.0):
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:135`
    — "Implementers must guard against re-entry: if a future
    `theta/runtime/*` handler ever routes diagnostics back through
    `theta-system-note`, the diagnostic step in this fallback MUST NOT
    re-invoke `pi.sendMessage`." The antecedent holds at HEAD: the standard
    persistent-diagnostic channel IS `theta-system-note`
    (`diagnostic-shape.md:3–14`), and the production `emitDiagnostic` sinks
    route diagnostics onto it. Antecedent reading, stated for the reviewer:
    `:135` names "a future `theta/runtime/*` handler" as the re-entry
    vehicle, while the shipped vehicle is the note-delivering PASS SINK —
    the consequent's requirement (the diagnostic step does not re-invoke
    `pi.sendMessage`) is nonetheless mechanically violated.
  - `src/extension/system-note-channel.ts:356–361` — fallback step 2 calls
    `deps.emitDiagnostic(<delivery-failed diagnostic>)`; the terminal
    `console.error("system-note delivery failed: …")` arm (`:362–382`) runs
    only if that call throws.
  - `src/extension/production-composition.ts:668` — the `runComposePass`
    channel is built with `emitDiagnostic = sink.emit`; `:578–589` — the
    tee records every error-severity diagnostic into
    `recordedErrorDiagnostics` (read only by
    `markedRootRegistrationRefusal`, `:1272`) and forwards to the outer
    sink; in `composeExtensionInstance` that outer sink is `loadSink`
    (defined `:1631–1634`, passed to `runComposePass` at `:1668`), whose
    error arm routes each diagnostic as a single-element note through
    `preEvalRouter.routePreEvalFailure` (`:1615–1619`) onto `channel` →
    `buildSystemNoteDeps.pi.sendMessage` (`:3714–3725`) →
    **`pi.sendMessage`**. Blast radius: the only other `runComposePass`
    caller (`:401`, the fixture/discovery helper) passes
    `sinkOverPerDiagnosticEmit(makeLoadEmit(ctx))` — off-channel, conformant
    — so the defect is exactly the `composeExtensionInstance` pass.
  - `src/extension/load-pre-eval.ts:96–112` — the router's delivery is
    `sendSystemNote(note, deps.channel)`, unconditionally.
  - Contrast (the conformant sibling):
    `production-composition.ts:1575–1589` — `composeExtensionInstance`'s
    own `channel` is built with `emitToast` and carries the WHY comment
    "Retained ONLY as the `theta-system-note` channel's own
    delivery-failure fallback: it MUST stay off-channel so a throwing
    `pi.sendMessage` does not re-enter the channel".
  - Channel exposure: `production-composition.ts:675`
    (`parseDeps.systemNote` — parse/lex batch notes) and `:827`
    (`systemNoteChannel` — the producer's clean-cancel note delivery,
    `production-theta-producer.ts:1862–1887`).
- **Observed at:** v0.415.0 (`04579e12`), offline, deterministic. Probe P4
  (scratch, deleted) drove the exported `composeExtensionInstance` over a
  planted workspace with a `pi.sendMessage` that throws once.

## Summary

`sendSystemNote`'s fallback chain is the channel's failure containment:
toast, then a `theta/runtime/system-note-delivery-failed` diagnostic, then
a latched terminal stderr line — with an explicit MUST NOT against the
diagnostic step re-invoking `pi.sendMessage`. `composeExtensionInstance`
builds two channels. Its own (`channel`) is conformant: fallback
`emitDiagnostic = emitToast`, documented as deliberately off-channel. The
one `runComposePass` builds for parse-time batches and the producer
(`systemNote`, `:668`) is not: its fallback `emitDiagnostic` is the pass
sink, whose error arm wraps the diagnostic in a single-element note and
delivers it through `sendSystemNote` on the sibling channel — i.e. the
diagnostic step re-invokes the very host call that just threw. Two
additional consequences: (1) the delivery-failed diagnostic transits the
tee's `recordErrorSeverity`, entering `recordedErrorDiagnostics` — the
load-refusal evidence feed — as if a channel delivery failure were a load
diagnostic of the pass; (2) because step 2 now "succeeds" by delegation,
the originating channel's terminal `system-note delivery failed:` line
(the registered Message and the H9a-grepped signature) is unreachable from
these wirings even when the re-driven send fails too — the second
channel's own fallback ends in the off-channel toast, which does not
throw.

## Reproduction

Offline (probe P4, deleted; ~70-line vitest over the exported
`composeExtensionInstance`):

1. Plant `<tmp>/.pi/theta/broken.theta` with an unterminated template
   (lex-error batch) and `{}` settings; build the b0268-style host double
   whose `pi.sendMessage` records every call and throws
   `Error("scratch: host refused the first system note")` on the FIRST
   `theta-system-note` only; `ctx.hasUI: false`, `ui.notify` recording.
2. `await composeExtensionInstance(pi, ctx, undefined, new RendererGate())`.
3. Observed send sequence (verbatim from the probe log):
   - send[0] (threw): the parse batch note, `details.diagnostics[0].code =
     "theta/parse/unterminated-template"`.
   - send[1] (RE-INVOCATION, delivered): `content =
     "theta/runtime/system-note-delivery-failed: <tmp>/.pi/theta/broken.theta:4:9:
     theta/parse/unterminated-template: unterminated @\`...\` query
     template\n  hint: scratch: host refused the first system note"`,
     `details.diagnostics[0].code =
     "theta/runtime/system-note-delivery-failed"`, `hint` = the throw
     message.
   - send[2]: the second parse diagnostic's note (pass continues).
   `ui.notify` received the original content once (step 1, conformant).
4. The assertion `sends after the throwing index whose details mention
   system-note-delivery-failed` is non-empty → the diagnostic step
   re-invoked `pi.sendMessage`. Under a conformant wiring the diagnostic
   would exit through a non-`sendMessage` sink and no such send exists.

## Expected behaviour

`runtime-event-channel.md:135`: the diagnostic step MUST NOT re-invoke
`pi.sendMessage`. The conformant shape is in-tree one function up
(`emitToast`, with the WHY comment quoting this exact rule) and in the
bootstrap tier-2 wiring (`:3958`), whose channel deps use `makeLoadEmit` as
the off-channel fallback. The terminal stderr line
(`system-note delivery failed: <original content first line>`,
`code-registry-runtime.md:19`) must remain reachable when both the send and
the diagnostic emission fail.

## Actual behaviour / root cause

`runComposePass` reuses the pass's load sink (`sink.emit`) as the channel's
fallback `emitDiagnostic` — reasonable-looking (one diagnostic pipe per
pass) but the pass sink is note-delivering by construction in the
compose-instance wiring, so the fallback's step 2 became a re-entrant send.
The tee side-effect follows from the same reuse: `recordErrorSeverity`
records every error-severity diagnostic flowing through the pass sink, and
a delivery-failure is error-severity.

## Why it matters

- The re-entry rule exists to keep a failing host surface from being
  hammered by its own failure handler; the shipped wiring does exactly the
  forbidden thing on the first failure, and only the second channel's
  toast-fallback keeps it from looping further.
- The H9a-gated `system-note delivery failed:` signature (bug 0030's
  regression evidence for 0018/0021/0022) cannot be produced by these
  wirings — the gate greps for a line the production path can no longer
  emit, silently weakening that witness.
- Hygiene, not a second symptom: the delivery-failed diagnostic enters
  `recordedErrorDiagnostics`, whose only reader is
  `markedRootRegistrationRefusal` (`:1272`). The half is inert at HEAD —
  the delivery-failed diagnostic carries no `file`, and the refusal lookup
  matches only `file === calleePath` — so this is latent
  mis-classification, not an operator-observable corruption.

## Non-goals

- The stale-ctx arm (PIC-67 quiesce/rethrow — conformant, witnessed by
  0018's suite).
- The bootstrap tier-2 and `composeExtensionInstance`-channel wirings
  (conformant, off-channel fallbacks).
- The producer's six raw `pi.sendMessage` emission sites that bypass the
  chain entirely ([bug 0437](./0437-producer-note-sites-bypass-fallback-chain.md) — sibling, distinct
  mechanism).
- Whether the delivery-failed note, when it IS delivered, has a matrix row
  ([bug 0434](./0434-operator-facing-diagnostics-notes-rowless.md)).

## Fix

Options:

1. Build the `:668` channel with an off-channel `emitDiagnostic`
   (`makeLoadEmit(ctx)`-based, as tier-2 does), leaving the pass sink for
   genuine load diagnostics. Smallest; matches the two conformant sibling
   wirings; the delivery-failed diagnostic then reaches toast/stderr like
   every other channel's.
2. Teach `sendSystemNote` to refuse re-entry itself (a per-channel
   in-fallback latch that routes step 2 to the terminal arm when the
   emitDiagnostic sink is note-delivering) — heavier, but centralises the
   MUST NOT instead of relying on wiring discipline at every
   `buildSystemNoteDeps` call.
   Option 1 recommended; option 2 worth considering as a belt given three
   wirings already diverged once.
   Either way, a hygiene rider: exclude delivery-failed diagnostics from
   `recordErrorSeverity` or route them around the tee (they are not load
   evidence; inert at HEAD, see §Why it matters).
   Ordering: land this fix BEFORE [bug 0437](./0437-producer-note-sites-bypass-fallback-chain.md) — 06's
   fix routes its raw senders through the very channel this report fixes.
   Witness: P4's shape — throw once on the first system note; assert no
   subsequent `pi.sendMessage` carries the delivery-failed code (green
   direction), plus a both-throw variant asserting the terminal
   `system-note delivery failed:` stderr line fires (red today: it cannot).

## Provenance

Traced from the seed-3 depth sweep (who consumes the delivery-failed
diagnostic) → the `:668` wiring. Spec read:
`runtime-event-channel.md:130–135`, `diagnostic-shape.md:3–20`,
`code-registry-runtime.md:19`. Implementation read:
`system-note-channel.ts:256–411`, `production-composition.ts:226–247,
303–330, 555–689, 1575–1745, 3702–4030`, `load-pre-eval.ts`. Probe P4 run
at `04579e12` (scratch deleted; send sequence quoted above). Dup check:
README index (`fallback`, `delivery-failed` hits reviewed — 0018/0030/0023
adjacent, none on the re-entry rule), 0383/0397/0401 fix records.
