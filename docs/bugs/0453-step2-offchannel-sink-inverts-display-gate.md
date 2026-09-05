# Bug 0453 — The fallback chain inverts its own display gate for a `display: false` note: step 1 SUPPRESSES the toast per the skip rule, then step 2's off-channel sink SHOWS the same content on the transient UI — `makeLoadEmit` toasts every error-severity diagnostic, and the delivery-failed diagnostic's `message` IS the note content, so a failed clean-cancel delivery notifies the user with the exact string the matrix row pins as "operator-visible only via the structured payload"

- **Status:** fixed (0.450.0).
- **Sev/Diff estimate:** S3/D2 — S3: no silent wrong value, but the
  display gate — a normative property two spec surfaces state (the step-1
  skip rule's purpose clause and the shutdown row's "operator-visible
  only" parenthetical) — is mechanically defeated on every non-stale
  delivery failure of a `display: false` note, and the toast carries no
  delivery-failed framing (bare content, no code, no hint), so it is
  indistinguishable from a deliberately-surfaced note. D2: adjudication —
  the off-channel sink must learn the originating note's `display` (or
  delivery-failed diagnostics must take a non-toast arm), and 0435's
  settled option-1 wiring is the thing being amended.
- **Kind:** defect + spec gap. Defect: the chain's step-1 rule exists so
  this content never reaches `ctx.ui.notify`, and step 2 reaches it two
  lines later via the sink. Gap: the spec pins step 2 as "the standard
  diagnostics channel" while its re-entry MUST NOT forces an off-channel
  realization, and no sentence constrains that realization's surfaces —
  0435 chose a severity-routed toast without examining the display
  interaction. This is a FRESH consequence of 0435's option-1 rewiring,
  not a named residual: 0435 §Residuals reads "none", and its §Non-goals
  say nothing about `display`.
- **Related:**
  - 0435 (fixed 0.419.0) — chose `makeLoadEmit(ctx)` as the `:677`
    channel's off-channel fallback `emitDiagnostic` (§Fix option 1,
    residuals: none). This card is the unexamined interaction of that
    sink's toast arm with the chain's display gating; distinct mechanism
    from the re-entry 0435 fixed.
  - 0432 (fixed 0.424.0) — owns the shutdown row whose "operator-visible
    only via the structured payload" pairing the leaked toast contradicts.
  - 0018 (fixed 0.28.0) — built the chain and its `display: false` skip
    arm.
  - 0073 (fixed 0.130.0) — the clean-cancel note, the only `display:
    false` production note at HEAD (the origin-site always-log surface for
    author-handled cascades is a filed residual —
    `production-theta-producer.ts:1710`'s comment — so the `content: ""`
    variant of this leak is currently unreachable).
  - [bug 0454](./0454-degraded-gate-drops-display-false-structured-notes.md) — the opposite-direction sibling on the
    same `display: false` contract: the degraded gate DROPS `display:
    false` structured notes entirely where this card OVER-SURFACES them.
    Disjoint sites (`system-note-channel.ts:305` degraded branch vs the
    `:387–392` fallback step 2 + `makeLoadEmit`), mutually exclusive
    preconditions (degraded vs live renderer-gate state), disjoint fixes —
    file and fix as a pair; do not merge.
- **Affected** (verified at `401a425b`, v0.437.0):
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:134`
    — step 1 "**Skipped when `display: false`**: notifying the user
    transiently about an event whose author handled the underlying `Err`
    (or a subagent-private cascade) defeats the purpose of
    `display: false`; the fallback proceeds straight to step 2." `:26/:39`
    — the shutdown variant/row: "`display: false` always (operator-visible
    only via the structured payload)".
  - `src/extension/system-note-channel.ts:370–392` — the chain: step 1
    correctly gated on `note.display !== false && note.content !== ""`;
    step 2 (`:387–392`) unconditionally emits the delivery-failed
    diagnostic with `message: note.content`, severity `error`.
  - `src/extension/production-composition.ts:227–248` — `makeLoadEmit`:
    `if (diagnostic.severity === "error") { ctx.ui.notify(
    diagnostic.message, "error"); }` — display-unaware; the stderr mirror
    runs only when `!ctx.hasUI`.
  - `src/extension/production-composition.ts:677` — the extension-instance
    channel is built with `emitDiagnostic = makeLoadEmit(ctx)` (0435's
    fix); `:836` — threaded as `systemNoteChannel` to the producer, whose
    `#emitCleanCancelNote` (`production-theta-producer.ts:1926–1966`) and
    `emitCancelledBySessionShutdownNote`
    (`session-shutdown.ts:465–498`, `display: false` at `:497`) deliver
    the clean-cancel note over it. The sibling channel's `emitToast`
    (`:1599`) is the same function — both wirings leak identically.
- **Observed at:** v0.437.0 (`401a425b`), offline, deterministic. Probe P2
  (scratch `tests/scratch-note-channel-6.test.ts`, deleted):
  `sendSystemNote` over a channel whose `emitDiagnostic` replicates
  `makeLoadEmit`'s two arms byte-for-byte (`hasUI: true`) and whose
  `pi.sendMessage` throws non-stale.

## Summary

`sendSystemNote`'s step 1 honours the display gate: for the clean-cancel
note (`display: false`, content `theta /<name> cancelled by session
shutdown (<reason>)`) a non-stale send throw skips the toast, per the spec
sentence whose stated purpose is that this content never transiently
surfaces. Step 2 then constructs the delivery-failed diagnostic with
`message` = that same content (spec-mandated) and hands it to the
channel's off-channel sink — which, in both production wirings, is
`makeLoadEmit`: every error-severity diagnostic is `ctx.ui.notify`'d with
its bare `message`. Net effect on any UI session: the user sees an error
toast reading exactly `theta /demo cancelled by session shutdown (reload)`
— the display-gated string, with no `system-note delivery failed` framing,
no code, and no hint — whenever the host refuses the note non-stale.

Probe P2 output (verbatim): step-1 toasts `[]`; sink toasts
`["theta /demo cancelled by session shutdown (reload)"]`.

Secondary observation, same mechanism: for `display: true` notes the user
gets the SAME string toasted twice (step 1, then the sink), and on a UI
session (`ctx.hasUI` true, working notify) the delivery-failed
diagnostic's `code` and `hint` — the actual failure evidence — reach no
surface at all: the toast renders only `message`, the stderr mirror is
headless-only, and the persistent channel is forbidden by the re-entry
MUST NOT. An operator on a UI session cannot learn that delivery failed.

## Reproduction

Offline (probe P2, deleted; ~40 lines):

1. Build `SystemNoteChannelDeps` with: `pi.sendMessage` throwing
   `Error("scratch: host refused the clean-cancel note (non-stale)")`;
   `ui.notify` recording with a `STEP1:` prefix; `emitDiagnostic` =
   a byte-replica of `makeLoadEmit` (`hasUI = true`: severity `error` →
   record `diagnostic.message` unprefixed); `health: new
   SystemNoteChannelHealth()`.
2. `sendSystemNote({ content: "theta /demo cancelled by session shutdown
   (reload)", display: false, details: { shutdown: { reason: "reload",
   theta: "demo", invocation_id: "x" } } }, deps)`.
3. Observed: no `STEP1:` entry (step-1 gate held); one unprefixed entry
   carrying the full clean-cancel content (the sink toast).
4. Production-wiring identity: `production-composition.ts:677` builds the
   channel with the real `makeLoadEmit(ctx)`; `:836` threads it to the
   producer; `session-shutdown.ts:497` sends the note `display: false`
   over it. (The replica exists only because `makeLoadEmit` is
   module-private.)

## Expected behaviour

The display gate holds across the WHOLE fallback, not just step 1: content
the spec marks "operator-visible only via the structured payload"
(`runtime-event-channel.md:26`) never reaches `ctx.ui.notify` on any arm.
A delivery failure of a `display: false` note is still accounted for —
the delivery-failed diagnostic (structured) and, on double failure, the
terminal stderr line remain the correct artefacts; only the transient
user-facing toast of the gated content is wrong.

## Actual behaviour / root cause

0435's fix needed an off-channel `emitDiagnostic` and reused the existing
severity-routed toast/stderr router (`makeLoadEmit`), matching the two
conformant sibling wirings. The router predates the chain and is
display-unaware by construction — it renders load/parse diagnostics,
which are always operator-facing. Nothing carries the originating note's
`display` across the `emitDiagnostic` seam, so the delivery-failed
diagnostic for a gated note is indistinguishable from any other
error-severity diagnostic and takes the toast arm.

## Why it matters

- The clean-cancel note fires for every in-flight invocation at `/reload`,
  session swap, or quit — windows where host-surface refusals are most
  plausible — and its `display: false` is a deliberate contract (0432's
  fix re-keyed the payload rather than surface it; the registry row pins
  `display: false`). One non-stale throw undoes the property both fixes
  preserved.
- The subagent-private rationale in the step-1 rule (`:134`) is
  forward-load-bearing: when the origin-site always-log surface lands
  (the filed residual), author-handled and subagent-private cascades
  become `display: false` traffic on this same channel, and this sink
  would toast private-cascade content (or empty strings for
  `content: ""`) on every delivery failure.
- The secondary half inverts the chain's purpose on UI sessions: the one
  place delivery failure is supposed to become observable (step 2) renders
  as a duplicate of the note itself, with the evidence fields dropped.

## Non-goals

- The re-entry MUST NOT and 0435's off-channel decision itself (settled;
  this card amends the sink's gating, not the routing).
- The step-2 diagnostic's `message = content` mandate (`:135`, pinned —
  the structured diagnostic SHOULD carry the content; only the transient
  toast of it is at issue).
- The stale-ctx arm (chain not walked; no leak).
- The headless stderr mirror (`!ctx.hasUI` — a conformant, desirable
  surface; H9a greps it).
- The `content: ""` empty-toast variant (unreachable at HEAD; noted for
  the origin-site follow-up).

## Fix

Options:

1. Gate the sink: wrap the channel's fallback `emitDiagnostic` so
   delivery-failed diagnostics originating from a `display: false` note
   skip the toast arm and go stderr-only (headless) / silent-structured
   (UI) — e.g. `sendSystemNote` passes `note.display` alongside the
   diagnostic, or emits through a second, display-aware sink closure built
   beside the channel. Smallest behavioural surface; keeps `makeLoadEmit`
   untouched for genuine load diagnostics.
2. Make the delivery-failed toast honest instead of silent: prefix the
   toast with the registered code (`theta/runtime/system-note-delivery-
   failed: <content>` + hint), still suppressing it for `display: false`
   originals. Fixes the secondary half (evidence invisible on UI sessions)
   in the same edit; slightly wider toast bytes for `display: true`
   failures.
3. Spec-side only: add a sentence to `:135` constraining the off-channel
   realization ("the step-2 emission MUST NOT surface the original
   `content` on `ctx.ui.notify` when the original note's `display` was
   `false`"), then fix the wiring to match. DIAG-2 discipline suggests
   this sentence lands with either option above regardless.

Recommendation: option 1 + option 3's sentence (and consider option 2's
framing prefix while touching the arm). Witness both directions: P2's
shape — display:false note, non-stale throw → assert `ctx.ui.notify`
receives nothing (red today: it receives the content); control cell — a
display:true note's failure still produces exactly one step-1 toast.

## Fix (0.450.0)
- What shipped:
  - `src/extension/system-note-channel.ts` — `SystemNoteChannelDeps` gains an optional display-aware `emitDeliveryFailed?(diagnostic, originatingDisplay)`; `sendSystemNote` step 2 routes the delivery-failed diagnostic through it with `note.display` when present, else the prior `emitDiagnostic` (doubles without it keep the pre-0453 path). The structured `Diagnostic` (message = content) is unchanged (§Non-goal).
  - `src/extension/production-composition.ts` — new exported `makeDeliveryFailedEmit(ctx, loadEmit)`: for `display: false` it skips the toast and runs the headless stderr mirror only (silent on a UI session), for `display: true` it delegates to `makeLoadEmit` (preserving b0435's terminal-line reachability); the stderr arm is factored into a shared `mirrorDiagnosticToStderr`; `buildSystemNoteDeps` wires `emitDeliveryFailed: makeDeliveryFailedEmit(ctx, emitDiagnostic)`, so all three production channels gate `display: false` (§Fix option 1).
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — one sentence at step 2 (§Fix option 3): the off-channel realization MUST NOT surface the original `content` on `ctx.ui.notify` when `display` was `false`; it realizes as the structured diagnostic and, on a headless host, the off-channel sink's stderr mirror only.
- Gates: witness `tests/b0453-offchannel-sink-display-gate.test.ts` 9/9 green (verifier revert of `system-note-channel.ts` → red on cells a/b + the composition cell, restore → green byte-exact; orchestrator mutation-proved the composition cell reds when the `buildSystemNoteDeps` wiring line is deleted); full default suite green; `tsc` clean; `eslint "src/**"` clean; spec edit `git diff --numstat` = 1/1 (CRLF preserved, no EOL flip).
- Review: 2 rounds — round 1 `bug-fix-reviewer` FINDINGS: F1 (`test` — the production wiring was unwitnessed / mutation-insensitive) + F2 (`spec` — "terminal stderr mirror" collided with PIC-54's "terminal") + R1/R4 prose cite offsets. Round 2 `bug-fix-reviewer` CLEAN (explicitly clean on correctness/fidelity/spec). F1 fixed with the mutation-sensitive composition cell (real `createBootstrapDiagnosticSink` -> `currentChannel` channel); F2 by rewording; R1/R4 by `:134` -> `:134-135` cites.
- Verification: `bug-fix-verifier` SOLID — witness reds on revert / greens on restore; full suite green (parallel-load timeouts green isolated); b0435 test 2 (display:true delivery-failed toast throwing -> terminal `console.error`) green UNCHANGED — the display-aware invariant holds; system-note-channel.test.ts + cancelled-by-session-shutdown + registry-closed-set-corpus-gate green; lint + typecheck clean.
- Live: not run — no live-visible outcome changes. The clean-cancel note is `display: false` (never toasts on the happy path); the fix suppresses only the erroneous toast on a host `pi.sendMessage` throw (a fault path not reproducible live). The real clean-cancel delivery path is covered offline by `cancelled-by-session-shutdown-note.test.ts` and the real `buildSystemNoteDeps` composition cell; the adjacent live note-channel cell (`double-session-start-live`) was run for the sibling 0451 fix on the same combined tree and is green.
- Residuals:
  1. The `display: true` secondary (a delivery-failed toast still fires for `display: true` notes, duplicating the step-1 toast; on a UI session the delivery-failed code/hint reach no surface) is left unfixed — §Fix option 2's framing prefix is "consider" and the settled recommendation is option 1 + option 3's sentence; NOT gating `display: true` also keeps b0435 green.
  2. `code-registry-runtime.md`'s `theta/runtime/system-note-delivery-failed` row trigger ("after `ctx.ui.notify` has been attempted") is imprecise for the `display: false` skip — PRE-EXISTING (since the 0018/0073 skip rule), not introduced or worsened; a follow-up alignment, out of 0453's scope.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the re-entry MUST NOT + 0435's off-channel decision unchanged; the step-2 `message = content` mandate preserved; the headless stderr mirror preserved (H9a-grepped); the stale-ctx arm and the `content: ""` / degraded-gate (0454) sites untouched.

## Provenance

Seed 3 of the wave-6 brief (0435's rerouted off-channel path's own failure
modes). Spec read: `runtime-event-channel.md:26,39,134–137`. Implementation
read: `system-note-channel.ts:290–411`,
`production-composition.ts:210–260,640–690,836,1595–1610,3776–3812`,
`session-shutdown.ts:434–498`, `production-theta-producer.ts:1926–1966`.
Probe P2 run at `401a425b` (scratch deleted; outputs quoted). Dup check:
README index (`notify`/`toast`/`delivery-failed` hits reviewed); 0435 read
in full (residuals: none; §Why it matters is re-entry/H9a/recorder — the
display interaction is unexamined); 0432/0018/0030/0437 read in full.
