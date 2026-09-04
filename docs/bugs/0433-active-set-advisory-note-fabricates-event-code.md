# Bug 0433 — The PIC-8(c) active-set-restore advisory note fabricates the runtime-event key with a `{ code }` stub: `details: { event: { code: "theta/runtime/active-set-restore-failed" } }` selects the partition's runtime-event arm while carrying no `RuntimeEvent`, on a `display: true` note whose spec pins content and display only

- **Status:** fixed (0.425.0).
- **Sev/Diff estimate:** S3/D1 — S3: the 0401 defect mechanism (fabricated
  `event` key, empty of every required `RuntimeEvent` field) on a
  user-visible `display: true` note; rarer than 0401's echo (requires a
  double restore failure) but the payload is pure fabrication with zero
  spec sanction, and it enters the model context durably. D1: mechanical —
  either omit `details` (0401's remedy) or carry the group-B single-element
  diagnostics batch (the sibling diagnostic is already constructed two
  statements earlier); one emission site + one spec clause.
- **Kind:** defect + spec gap. Defect: the fabricated `event` key violates
  the partition the same way 0401's `{ event: {} }` did. Gap: PIC-8(c) pins
  the note's `content` (verbatim template) and `display: true` but assigns
  no `details` disposition, and the note is absent from the informational
  no-`details` enumeration.
- **Related:**
  - 0401 (fixed 0.390.0) — the same mechanism at five sites; its repro grep
    (`rg "event: \{\}"`) and its fix clause's five-note enumeration both
    miss this site because the stub here carries a `code` field
    (`event: { code: … }` ≠ `event: {}`). Adjacent input class, own
    mechanism.
  - 0372 (fixed) — wired the compliant PIC-8 gate into the three production
    windows; the gate's note shape was carried over unexamined.
  - [bug 0432](./0432-cancelled-note-event-reason-outside-partition.md) — the other `event`-keyed rung of the
    same ladder (the clean-cancel note). Distinguished: 01's payload is
    spec-pinned (PIC clean-cancel rule + registry row), so the omit-`details`
    remedy is unavailable there; this note's payload has zero spec sanction.
  - [bug 0434](./0434-operator-facing-diagnostics-notes-rowless.md) — the diagnostic HALF of the same
    protocol (the `emitDiagnostic` single-element batch note) is one of the
    rowless operator-facing notes enumerated there; this card owns only the
    advisory note's fabricated `details`.
- **Affected** (verified at `04579e12`, v0.415.0):
  - `src/runtime/tool-registration.ts:157–190` — `restoreActiveSet`; the
    advisory note at `:182–186` with `details: { event: { code:
    ACTIVE_SET_RESTORE_FAILED } }` (`:185`).
  - `src/extension/production-theta-producer.ts:4131, 5531, 7098` — the
    three production `ActiveSetGateDeps.emitSystemNote` wirings; each
    forwards `note.details` verbatim to `pi.sendMessage`, so the fabricated
    payload reaches the wire in all three windows (prompt-mode query,
    prompt→prompt cross-mode `invoke`, follow-up drive).
  - `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:18`
    — PIC-8(c): "emit a `display: true` `theta-system-note` whose `content`
    is the verbatim template … (only `<name>` is substituted …)"; no
    `details` clause.
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:20`
    (four-shape closure), `:39` (disjoint-by-key), `:41` (informational
    no-`details` clause enumerating five notes — this note absent, and the
    clause's rationale names exactly this failure: a fabricated `event` key
    "would falsely select the runtime-event arm of the partition while
    carrying no `RuntimeEvent`").
  - `docs/spec_topics/diagnostics/code-registry-runtime.md:40` — the row
    pins the diagnostic (message/hint) + "additionally emits a `display:
    true` `theta-system-note` whose `content` is the verbatim template";
    no `details` for the note.
- **Observed at:** v0.415.0 (`04579e12`), offline, deterministic. Probe P1
  (scratch, deleted): drove `withActiveSetGate` with a `setActiveTools`
  that succeeds on install and throws on restore + retry.

## Summary

PIC-8's restore-failure protocol emits two artefacts: the registered
diagnostic (group-B single-element batch through the standard channel) and
a `display: true` advisory note with a verbatim content template. The
advisory note's emission site fabricates `details: { event: { code:
"theta/runtime/active-set-restore-failed" } }`. `code` is an OPTIONAL
`RuntimeEvent` field; every required field (`kind`, `theta`,
`invocation_id`, `message`, `occurred_at`) is absent, so the payload
satisfies no arm of the closed partition while its present `event` key
actively claims the group-A arm — the exact misclassification 0401 fixed,
surviving here because the stub's `code` field evades both the `event: {}`
grep and the fix's five-note clause. Worse than 0401's empty stub, the
fabricated payload carries a `theta/runtime/*` code inside an `event`
payload, which `runtime-event-channel.md:73` explicitly rules out for
`RuntimeEvent.kind`-bearing events ("never a theta/runtime/* panic code")
and which `alwaysLogGroup` (`src/runtime/runtime-event-channel.ts:199–216`)
routes to group B — the diagnostics shape, not the event shape.

## Reproduction

Offline (probe P1, deleted):

1. `withActiveSetGate({ pi: { getActiveTools: () => ["ambient_a"],
   setActiveTools: <throw on calls ≥ 2> }, thetaName: "demo",
   installVector: ["tool_x"], emitDiagnostic: capture, emitSystemNote:
   capture, routeInternalError: () => {} }, async () => "body-ok")`.
2. Observed: `setActiveTools` called exactly 3 times (install + restore +
   single retry, PIC-8(a) conformant); one diagnostic with the registered
   code; one note:
   `{"content":"theta: failed to restore tool active-set after /demo; the
   user session may have unexpected tools active. Run /reload to reset.",
   "display":true,"details":{"event":{"code":"theta/runtime/active-set-
   restore-failed"}}}`.
3. `content` and `display` are byte-conformant to PIC-8(c); the `details`
   payload is the divergence.

## Expected behaviour

- `runtime-event-channel.md:41`: an emitter with no assigned `details`
  shape "MUST omit `details` on the wire … rather than send an empty or
  placeholder payload", and MUST NOT present the `event` key without a
  `RuntimeEvent` — stated for the five informational notes, with a
  rationale that is note-independent.
- Under the partition (`:20`, `:39`) and `diagnostic-shape.md:42`'s outer-
  `details` closed set, no shape admits `{ event: { code } }`.
- The registry row and PIC-8(c) pin nothing for the note's `details`, so
  any resolution needs one spec sentence (DIAG-2 discipline) — but every
  candidate resolution forbids the current bytes.

## Actual behaviour / root cause

`restoreActiveSet` predates the 0401 clause and stubbed its `details` with
a code-carrying variant of the historical `{ event: {} }` placeholder; the
0401 sweep enumerated its sites by the literal empty-braces signature and
the informational clause enumerated only the five notes then known to be
matrix-less, so this site was never classified. No test pins the note's
`details` (`tests/b0372-active-set-restore-protocol.test.ts` asserts the
protocol's call counts and content template).

## Why it matters

- A key-switching consumer classifies a `display: true`, user-visible
  advisory as a group-A runtime failure event with an invalid payload —
  breaking exactly the strict-validation posture the 0383/0397/0401 fixes
  built.
- The fabricated payload persists into the model context on every
  subsequent provider call (`runtime-event-channel.md` §Custom-message
  persistence), per note.
- The failure it advertises (active-set restore lost) is precisely a state
  where operators lean on structured tooling; a lying `details` shape there
  is compounded noise.

## Non-goals

- The PIC-8 protocol itself (single retry, unmasked propagation, diagnostic
  message/hint — all conformant; P1 witnessed call counts).
- The diagnostic half's missing matrix row (candidate
  note-details-matrix/03).
- The other two fabrication sites 0401 left pinned (the ticket-less
  `#emitBinderFailureNote` harness degrade at
  `production-theta-producer.ts:1473` is 0397-pinned harness-only;
  `slash-dispatch.ts` is caller-less).

## Fix

Two options, one spec sentence either way (DIAG-2):

1. Omit `details` and add the advisory note to the `:41` informational
   enumeration (smallest; matches the note's purely-advisory role; the
   structured half already travels in the sibling diagnostic's own note).
   Recommended.
2. Carry the group-B shape: `details: { diagnostics: [<the already-built
   restore-failed diagnostic>] }` — makes the advisory note self-contained
   but double-ships the diagnostic (the `emitDiagnostic` half already
   delivers it through the standard channel), so the exactly-once wire rule
   0398 established for group-B codes would need a dedup adjudication.
   Not recommended.

Witness both directions: capture the note; assert `"event" in details`
false (option 1: `details` absent); red is today's
`{ event: { code } }` signature (probe P1).

## Provenance

Seed 4 (pairing sweep) + `rg "details: \{ event" src/` over the worktree.
Spec read: `tool-registration-lifetime.md:14–35`,
`runtime-event-channel.md:20–41,73`, `code-registry-runtime.md:40`,
`diagnostic-shape.md:42`. Implementation read:
`tool-registration.ts:81–190`, the three `emitSystemNote` wirings.
Tests read: `tests/b0372-active-set-restore-protocol.test.ts` (no `details`
pin). Probe P1 run at `04579e12` (scratch deleted; bytes quoted). Dup
check: 0401 affected-list + fix clause (five sites/notes, this one absent),
0372 fix record, README index.

## Fix (0.425.0)

- What shipped:
  - `src/runtime/tool-registration.ts` — `restoreActiveSet` emits the PIC-8(c)
    advisory as an INFORMATIONAL note with no `details` (was the fabricated
    `details: { event: { code: ACTIVE_SET_RESTORE_FAILED } }`); added the
    `ActiveSetAdvisoryNote` type (`{ content, display }`) and narrowed
    `ActiveSetGateDeps.emitSystemNote` to it. §Fix option 1.
  - `src/extension/production-theta-producer.ts` — the three
    `emitSystemNote` wirings drop the `details:` line: true wire omission,
    matching the informational success-echo at `:1199`.
  - `src/runtime/invoke-prompt-suspend.ts` — type-only ripple:
    `PromptSuspendInput.emitSystemNote` retyped to `ActiveSetAdvisoryNote`
    (the one other `withActiveSetGate` caller).
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — the
    `:41` informational-notes clause Five -> Six, enumerating the PIC-8(c)
    advisory note (DIAG-2, same changeset), cross-referencing PIC-8(c) and
    `code-registry-runtime.md`. Matrix table, four-shape partition, b0265
    pins and 0404-family rows untouched.
  - `tests/b0433-active-set-advisory-note-no-details.test.ts` — NEW witness
    (2 cells: unit over `withActiveSetGate`; one production wire window). Pins
    both no `event` key and strict `details` omission on the wire.
  - `tests/tool-registration-lifetime.test.ts` — type-only ripple
    (`Recorders.notes` -> `ActiveSetAdvisoryNote[]`); no assertion changed.
- Gates: witness 2/2 green; full default suite 588 files / 10537 tests green
  (one `shared-subtree-judged-once-per-pass` parallel-load timeout, green
  isolated 7/7 — the campaign's known flake family); `npm run typecheck`
  clean; `npm run lint` clean; `committed-fixture-parse-gate` 36/36 +
  `registry-closed-set-corpus-gate` 6/6.
- Live: adjacent note-channel witness
  `tests/live/err-note-render-record-error-field-live-cell.test.ts` green 1/1
  under the global lock (the err-note-render adjacency drives the
  `theta-system-note` channel end-to-end through the real production
  pipeline). No new cell owed — registration/drive outcomes are unchanged
  (event-code field only), and the advisory fires only on a double-restore
  failure, not a live-drivable outcome.
- Review: 2 rounds — R1 (deep) CLEAN + two non-blocking residuals (R1 test
  strengthening: pin strict wire omission; R2 prose fork-tense); R2 (fast,
  after a `bug-fix-fixer-light` pass applied both residuals) CLEAN.
- Verification: VERIFIED — witness reds on the re-added
  `{ event: { code: "theta/runtime/active-set-restore-failed" } }` signature
  then greens byte-exact on restore; full suite green modulo the confirmed
  load flake; typecheck + lint clean; the diag2 baseline fixture reverted
  byte-exact to HEAD.
- Residuals: none.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the two 0401-pinned fabrication sites (the
  `#emitBinderFailureNote` `{ event: {} }` at `production-theta-producer.ts`,
  0397-harness-pinned; the caller-less `slash-dispatch.ts` site) left
  untouched; the diagnostic half's missing matrix row is bug 0434's ground;
  `SystemNote` stays required-`details` for the four canonical channel shapes.
