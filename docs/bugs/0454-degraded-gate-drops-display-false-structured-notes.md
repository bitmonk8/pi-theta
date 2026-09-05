# Bug 0454 — Under a degraded `RendererGate` the channel silently drops every `display: false` note in its entirety — no transcript send, no toast, no diagnostic, no stderr — although the degrade rationale ("delivering to the transcript would render nothing") is vacuous for notes that are never rendered: the clean-cancel note's spec-entitled structured payload is lost while `pi.sendMessage` remains fully functional

- **Status:** fixed (0.441.0).
- **Sev/Diff estimate:** S4/D2 — S4: loss of spec-entitled operator
  records (the clean-cancel note's `details.shutdown.*`, which operator
  tooling "is entitled to assert" per the clean-cancel contract), silent
  and total, but confined to the renderer-registration-failed degraded
  state — a rare, already-loudly-diagnosed instance condition. D2:
  adjudication — either the degrade skip gains a `display: false`
  carve-out (deliver to the transcript; the renderer was never involved)
  or the spec's blanket degrade sentence is amended to bless the drop;
  both are spec-meaning changes to a 0023-era rule.
- **Kind:** spec gap — the implementation follows the bootstrap page's
  blanket degrade sentence; the sentence predates every `display: false`
  note family and composes with the channel page's `display: false`
  semantics into a disposition (total silent loss where full-fidelity
  delivery was available) that no surface states or sanctions.
- **Related:**
  - 0023 (fixed 0.34.0) — wired the `RendererGate` degrade branch this
    card concerns; at that time every note on the channel was
    `display: true` user-facing, so the toast-only degrade was lossless in
    kind.
  - 0073 (fixed 0.130.0) / 0432 (fixed 0.424.0) — built and re-keyed the
    clean-cancel note, the `display: false` + structured-payload family
    whose value the degrade branch now discards.
  - 0437 (fixed 0.429.0) — routed the producer's sites through the chain,
    WIDENING this branch's blast radius: pre-0437 the raw sites ignored
    the gate and delivered regardless; post-0437 every producer note
    (including the clean-cancel path's channel) honours the degraded skip.
  - Candidate note-channel-6/03 — the opposite-direction sibling of the
    same `display: false` contract: 03 is the non-degraded fallback's
    step-2 display-gate inversion (OVER-surfaces gated content); this is
    the degraded branch's total drop (loses it entirely). Mutually
    exclusive preconditions (a degraded channel never reaches 03's step 2;
    03 needs a healthy gate plus a non-stale send throw) and disjoint
    sites (`system-note-channel.ts:305` degraded branch vs `:387–392` +
    `makeLoadEmit`). File and fix as a pair; do not merge.
- **Affected** (verified at `401a425b`, v0.437.0):
  - `src/extension/system-note-channel.ts:305–330` — the degraded branch:
    `if (deps.rendererGate?.available() === false) { if (note.display !==
    false && note.content !== "") { ui.notify … } return; }` — a
    `display: false` note takes neither the notify arm nor any other:
    the function returns having touched nothing. The doc-comment's
    rationale (`:311–316`): "delivering to the transcript via
    `pi.sendMessage` would render nothing".
  - `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-theta.md:11`
    — the blanket degrade rule: "System notes for this extension instance
    permanently degrade to the `ctx.ui.notify` arm of the **System notes**
    fallback chain below (the persistent-transcript surface is
    unavailable; the transient toast and the `console.error` last-resort
    arms remain)."
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:14`
    — `display: false` notes "land in the same session transcript as
    `display: true` notes and are filtered out of visible rendering by the
    renderer (or by Pi's own `display` handling), but remain available to
    transcript-replay and `/tree` consumers"; `:16` — the
    `convertToLlm` context entry is independent of rendering; `:26` — the
    shutdown variant is "operator-visible only via the structured
    payload".
  - `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:19`
    — the clean-cancel rule: "emits exactly one
    `theta/runtime/cancelled-by-session-shutdown` … note on
    `theta-system-note` with `display: false`, `details.shutdown.reason`
    …" (no degraded-state exception).
  - `src/extension/session-shutdown.ts:465–498` — the emitter
    (`display: false` at `:497`), delivered over the extension-instance
    channel whose `rendererGate` is the live gate
    (`production-composition.ts:677`, `:836`;
    `production-theta-producer.ts:1926–1966`).
  - `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js:2578–2585`
    — the host at the SDK pin: in the `case "custom"` arm the
    `getMessageRenderer` lookup sits INSIDE `if (message.display)`, so a
    `display: false` custom message never consults the renderer at all —
    the degrade rationale is provably vacuous for `display: false` notes,
    a host observable, not a spec inference.
- **Observed at:** v0.437.0 (`401a425b`), offline, deterministic. Probe P3
  (scratch `tests/scratch-note-channel-6.test.ts`, deleted):
  `sendSystemNote` with a degraded gate, a RECORDING (fully functional)
  `pi.sendMessage`, and recording notify/diagnostic sinks.

## Summary

The degrade branch models one failure — the factory-time
`pi.registerMessageRenderer` throw — and responds by skipping the
transcript arm for every note, on the theory that an unrenderable
transcript entry is worthless. That theory is only true for
`display: true` notes, whose value is their rendered line. A
`display: false` note is NEVER rendered — its transcript delivery does not
involve the renderer at any point; its value is the structured payload
(`/tree`, replay, `convertToLlm` context entry). For such notes the
degraded branch discards a delivery that would have succeeded at full
fidelity, and the display gate then suppresses the one arm the branch
retains (the toast — correctly, per the display contract), so the note
vanishes: no send, no toast, no delivery-failed diagnostic (the branch's
design deliberately emits none for the "expected degraded route"), no
stderr.

Probe P3 (verbatim): a degraded-gate channel with a recording
`pi.sendMessage`, driven with the clean-cancel note bytes → `sends: []`,
`notifies: []`, `diags: []`.

At HEAD this bites the clean-cancel note (the only `display: false`
production note): every in-flight invocation cancelled at `/reload`,
session swap, or quit on a renderer-degraded instance loses its
spec-mandated shutdown record silently. When the origin-site always-log
surface lands (the filed residual on author-handled cascades), all
`display: false` group-A traffic joins the drop.

## Reproduction

Offline (probe P3, deleted; ~35 lines):

1. `const gate = new RendererGate(); gate.degrade();`
2. `sendSystemNote({ content: "theta /demo cancelled by session shutdown
   (reload)", display: false, details: { shutdown: { reason: "reload",
   theta: "demo", invocation_id: "x" } } }, { pi: <recording sendMessage>,
   ui: <recording notify>, emitDiagnostic: <recorder>, rendererGate: gate,
   health: new SystemNoteChannelHealth() })`.
3. Observed: all three recorders empty — the note reached no surface,
   though the host send seam was healthy.
4. Production identity: the gate instance is the factory's
   (`factory.ts:543` registers the renderer; the degrade path flips the
   same gate threaded into `buildSystemNoteDeps` at
   `production-composition.ts:677`), and the clean-cancel emitter rides
   that channel (`session-shutdown.ts:496–498`).

## Expected behaviour

Two readings; either way the current composition is unstated:

- Channel-page reading: `display: false` delivery is renderer-independent
  (`runtime-event-channel.md:14` — filtered "by the renderer (or by Pi's
  own `display` handling)"), so a degraded renderer does not reduce its
  value; the note should still be sent (`pi.sendMessage` is functional in
  the degraded state by definition — only `registerMessageRenderer`
  threw), preserving `session-shutdown-semantics.md:19`'s "emits exactly
  one … note" with its structured payload.
- Bootstrap-page reading: the degrade sentence is blanket ("System notes
  … permanently degrade to the `ctx.ui.notify` arm"), so the drop is
  intended — in which case the clean-cancel contract and the shutdown
  row need a stated degraded-state exception, because "emits exactly one"
  is currently false on a degraded instance with zero diagnostics saying
  so.

## Actual behaviour / root cause

The degrade branch (0023/V9p era) was designed against a channel whose
notes were all user-facing `display: true` lines; its rationale comment
equates "would render nothing" with "worthless". The `display: false`
families (clean-cancel 0073/0432; the future origin-site cascades)
arrived later, and no fix re-examined the branch: 0432 moved the payload
key, 0437 routed more traffic through the branch, and the chain's
display-gating work (0018) only ever gated the TOAST, which here is the
sole remaining arm.

## Why it matters

- The clean-cancel note is the operator's only per-invocation shutdown
  record; the degraded state is precisely a session where things are
  already going wrong, and this drop removes the record with no artefact
  — the "exactly one note" contract fails silently, unwitnessable by any
  transcript consumer.
- The drop also removes the note from the LLM context
  (`convertToLlm` entry, `runtime-event-channel.md:16`), so model-visible
  state diverges between degraded and healthy instances in a way no spec
  sentence predicts.
- The branch's cost asymmetry is inverted: it protects against a
  worthless-but-harmless transcript entry for `display: true` notes,
  while for `display: false` notes it discards the whole value of the
  emission to avoid nothing.

## Non-goals

- The degraded handling of `display: true` notes (toast-only, no per-note
  delivery-failed diagnostic — 0023-era design, spec-matching).
- The gate's lifecycle (per-instance, reset on reload — pinned).
- The non-degraded fallback chain ([bug 0453](./0453-step2-offchannel-sink-inverts-display-gate.md) owns its
  step-2 sink).
- Pi-side `display` handling semantics at the SDK pin.

## Fix

Options:

1. Carve out `display: false` notes from the degrade skip: in the
   degraded branch, deliver `display: false` notes through the normal
   `pi.sendMessage` arm (they never needed the renderer); keep the
   toast-only degrade for `display: true`. One conditional; plus the
   DIAG-2 sentence on the bootstrap page's degrade rule ("…except
   `display: false` notes, whose transcript delivery is
   renderer-independent and proceeds normally"). Recommended — preserves
   both contracts with minimal surface.
2. Bless the drop: amend `session-shutdown-semantics.md:19` and the
   shutdown row with a degraded-state exception ("on a
   renderer-degraded instance the note is not emitted"). Cheaper code-side
   (none), but writes a silent-loss disposition into a contract whose
   consumers are entitled to assert presence, and pre-commits the future
   origin-site `display: false` traffic to the same loss.
3. Option 1 plus a one-time degraded-state breadcrumb (the branch emits
   one diagnostic per instance noting notes are toast-degraded) — wider;
   the factory's existing `extension-bootstrap-failed` diagnostic already
   covers the instance-level fact, so likely redundant.

Witness both directions: P3's shape — degraded gate + recording host →
assert the `display: false` note IS sent with payload intact (red today:
zero sends); control — a `display: true` note still takes the toast arm
and does not send.

## Provenance

Found while auditing the degraded branch for seed 3's "off-channel path's
own failure modes" (the branch is the chain's other non-happy arm). Spec
read: `extension-bootstrap-and-per-theta.md:9–21`,
`runtime-event-channel.md:14–16,26`, `session-shutdown-semantics.md:19`.
Implementation read: `system-note-channel.ts:180–330`,
`production-composition.ts:677,836,3776–3812`, `factory.ts:530–560`,
`session-shutdown.ts:434–498`. Probe P3 run at `401a425b` (scratch
deleted; outputs quoted). Dup check: README index (`renderer`, `degrade`
hits — 0023 wired the branch, no report on its display interaction);
0023/0073/0432/0437 read in full.

## Fix (0.441.0)

- What shipped: `src/extension/system-note-channel.ts` — §Fix Option 1: the
  degraded `RendererGate` branch in `sendSystemNote` is gated on
  `note.display !== false` as well, so a `display: false` note is carved out
  of the degrade skip and falls through to the steady-state `pi.sendMessage`
  transcript arm (renderer-independent — never rendered; its value is the
  structured payload); `display: true` notes keep the 0023-era toast-only
  degrade byte-identical. `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-theta.md`
  — the DIAG-2 same-commit carve-out clause on the degrade rule
  (“…except `display: false` notes, whose transcript delivery is
  renderer-independent and proceeds normally through `pi.sendMessage`”).
- Gates: witness `tests/b0454-degraded-gate-drops-display-false-structured-notes.test.ts`
  RED at fork (cell 1: `sends: []` — the total drop) → GREEN after fix (note
  delivered with `details.shutdown` intact); default suite 610 files / 10669
  tests green; `tsc -p tsconfig.json --noEmit` clean; `eslint … src/**/*.ts`
  clean. Live: `tests/live/double-session-start-live.test.ts` green (the
  changed `sendSystemNote` still delivers system notes end-to-end on a live
  host).
- Review: 1 round — `bug-fix-reviewer` verdict FINDINGS, one `house-rule`
  finding (F1: WHY-comments in sibling-owned files now describe the pre-fix
  degrade behaviour) and no correctness/fidelity/spec blocker; recorded as a
  residual because every F1 site is owned elsewhere or a protected test.
- Verification: `bug-fix-verifier` verdict SOLID — witness reds/greens both
  directions (temporary one-line revert → cell 1 reds on the empty `sends`
  drop → restored byte-exact → green); default suite green; typecheck + lint
  clean; no existing test weakened. Live witness run by the orchestrator.
- Residuals: (1) F1 — the following WHY-comments now describe the pre-fix
  “degrade drops every note” behaviour and, composed with this carve-out,
  read as the inverse of the shipped contract; they sit in files this lane
  does not own and were NOT edited: `src/extension/factory.ts:336-338` and
  `:538-541` (Lane L5 / bug 0451), `src/extension/production-theta-producer.ts:589-597`
  (the clean-cancel `systemNoteChannel` seam comment — owned-elsewhere
  producer region), and the title/comment of
  `tests/extension-bootstrap-nonabort.test.ts:230` (“routes **every** note
  through ctx.ui.notify” — a protected sibling test; its assertions drive
  only `display: true` notes and stay valid, only the universal quantifier is
  now imprecise). A merge-time or sibling reconciliation should widen these
  to carry the `display: false` carve-out. (2) `docs/spec_topics/diagnostics/code-registry-runtime.md:19`
  — prose-only: the `system-note-delivery-failed` row’s “after `ctx.ui.notify`
  has been attempted” trigger wording is imprecise for `display: false`
  sends (the toast is skipped by rule before the diagnostic fires); predates
  this fix, no DIAG-2 edit owed.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: Option 1 (parent-adjudicated “display
  gate”), not Option 2 (bless-the-drop) or Option 3 (extra breadcrumb). The
  `display: true` toast-only degrade, the gate lifecycle, the non-degraded
  step-2 sink (bug 0453), and Pi-side `display` semantics are non-goals and
  untouched.
