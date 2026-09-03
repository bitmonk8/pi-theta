# Bug 0398 — `theta/runtime/custom-type-unsafe` is emitted with no `Diagnostic` on any wire: the note ships `details: { event: {} }` instead of the group-B `details: { diagnostics: [Diagnostic] }` shape, the registered code appears in neither `content` nor `details`, and the conformant diagnostic builder has zero production callers

- **Status:** open.
- **Kind:** defect — a registered `E`-severity runtime diagnostic (DIAG-1
  entitlement: "tests are entitled to assert on the specific code at every
  documented diagnostic site") is structurally absent from its own emission;
  the note's `details` misclassifies under the four-shape partition.
- **Related:**
  - 0383 (fixed 0.360.0) — same `{ event: {} }` literal; this site is one of
    its §Residuals-2 "seven sibling sites", the only sibling carrying a
    registered diagnostic code.
  - 0088 / 0079 / 0050 pattern precedent — conformant producer exists in-tree
    with no production caller (`customTypeUnsafeDiagnostic` here).
  - Report 01 in this area — the binder-failure sibling (group-A payload);
    this row is the group-B-shaped sibling.
- **Affected** (verified at `d63c5148`, v0.382.0):
  - `src/extension/production-theta-producer.ts:1394–1405` —
    `#emitCustomTypeUnsafeNote`: `content` from `renderCustomTypeUnsafeNote`,
    `details: { event: {} }` (`:1400`); no `emitDiagnostic`, no `Diagnostic`
    constructed. Reached from `runBinder` (`:957–960`) when
    `#buildBinderSessionContext` returns `unsafe` (a `bind_context: session`
    prompt-mode theta whose included session `custom` message carries a
    transcript-unsafe `customType`).
  - `src/binder/compact-transcript.ts:330–337` — `customTypeUnsafeDiagnostic`,
    the conformant structured builder (severity `error`, the registered code,
    the registry *Message*); callers: tests only
    (`tests/bind-context-transcript.test.ts:322`,
    `tests/integration-acceptance.test.ts:175`) — zero in `src/`.
  - `src/binder/compact-transcript.ts:347–351` — `renderCustomTypeUnsafeNote`:
    the user-facing template (conformant content bytes).
  - `docs/spec_topics/diagnostics/code-registry-runtime.md:43` — the row:
    severity `E`, *Message* `custom-message type is not transcript-safe:
    '<value>'`, "Routes through the standard `theta-system-note` channel".
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:7–14` — the standard
    channel's normative call shape for diagnostics:
    `details: { diagnostics: <Diagnostic[]> } // single-element array for
    runtime/single-error cases`; `:71` — DIAG-1.
  - `docs/spec_topics/binder/binder-model-and-context.md:137` (BNDR-9) — the
    binder MUST reject "emitting `theta/runtime/custom-type-unsafe`", and the
    user-facing note resolves through the failure-mode-templates row
    (`binder/determinism-cancellation-failure.md:54`).
- **Observed at:** v0.382.0 (`d63c5148`). Source-verified (the emission body
  is a self-contained literal; the builder's caller set is a grep); the
  identical `{ event: {} }` delivery shape on the same producer was probed
  live-in-process on three sibling notes (probes P1–P3, deleted). Unit cells
  pinning the builder and renderer bytes exist and pass
  (`tests/bind-context-transcript.test.ts:312–334`).

## Summary

BNDR-9 prescribes two artefacts for a transcript-unsafe `customType`: the
registered `theta/runtime/custom-type-unsafe` diagnostic, and the user-facing
note per the failure-mode-templates row. The registry row routes the code
"through the standard `theta-system-note` channel", whose normative call shape
for diagnostics is `details: { diagnostics: [Diagnostic] }` with the
single-element runtime batch (`diagnostic-shape.md:7–14`) — the same group-B
shape every other `theta-system-note`-routed runtime diagnostic uses
(`runtime-event-channel.md:55–57`).

The shipped emission sends the conformant *content* line and `details:
{ event: {} }`. Consequences:

1. The `Diagnostic` object — severity, code, message — exists on no wire
   surface. The `content` line is the theta-prefixed failure template
   (`theta /<name>: custom-message type is not transcript-safe: '<value>'`),
   which carries no code either, so the registered code is unobservable in the
   session: a test exercising DIAG-1's entitlement ("assert on the specific
   code at every documented diagnostic site") has nothing to read.
2. A `diagnostic-shape.md:20` key-switching renderer classifies the note as a
   runtime event and reads an empty payload — the 0383 misclassification on a
   note that is group-B by code.
3. The conformant builder `customTypeUnsafeDiagnostic` is exported, correct,
   and pinned green by two test files — and called by no production code, the
   0088/0079 "conformant producer, no caller" pattern; the unit cells create
   the appearance of coverage while the wire ships neither its output nor any
   diagnostic.

## Reproduction

At `d63c5148`, source-level:

1. `src/extension/production-theta-producer.ts:1394–1405` — the whole emitter;
   `:1400` is `details: { event: {} }`; no `Diagnostic` in scope.
2. `rg -n "customTypeUnsafeDiagnostic" src/ tests/` → definition
   (`compact-transcript.ts:330`) + two test callers; zero `src/` callers.
3. Reach path: `runBinder` → `#buildBinderSessionContext`
   (`:957–960`, requires `bind_context: session`, `mode: prompt`) →
   `renderCompactTranscript` returns `custom-type-unsafe` →
   `#emitCustomTypeUnsafeNote`.

Runnable variant: drive `runBinder` with a `bind_context: session` theta and a
`ctx.sessionManager` whose entries include a `custom` message with
`customType: "x]y"`; capture `pi.sendMessage`; the captured note's `details`
equals `{ event: {} }` and no captured artefact anywhere carries
`theta/runtime/custom-type-unsafe`.

## Expected behaviour

- `code-registry-runtime.md:43` — the code routes through the standard
  channel; `diagnostic-shape.md:7–14` fixes that channel's diagnostic shape as
  `details: { diagnostics: [Diagnostic] }` (single-element for runtime cases).
- `diagnostic-shape.md:71` (DIAG-1) — every author-visible diagnostic MUST
  carry its registered code; tests are entitled to assert on it.
- `binder-model-and-context.md:137` (BNDR-9) — the rejection is performed
  "emitting `theta/runtime/custom-type-unsafe`" AND the user-facing note per
  the templates row — two halves of one emission, exactly as the panic-note
  row pairs a framed `content` with `details: { diagnostics: [d] }`
  (`runtime-event-channel.md:27–33` matrix).

## Actual behaviour / root cause

At the registry Trigger today the runtime emits only the bare content note —
conformant bytes, no code, `details: { event: {} }` — not silent, and not a
different code. `#emitCustomTypeUnsafeNote` reuses the sibling notes'
content-only emission idiom (`{ event: {} }` stub) instead of the panic-note
pairing; the structured
half was implemented (`customTypeUnsafeDiagnostic`), unit-tested, and never
wired. The nearest conformant model is `emitPanicNote`
(`production-theta-producer.ts:1674–1683`): framed `content` +
`details: { diagnostics: [diagnostic] }`.

## Why it matters

- A registered `E` diagnostic that reaches no wire in any structured form is
  a diagnostics-that-lie class: the registry, the reference mirror, and two
  green unit files all assert an emission surface the session never carries.
- The H7a permitted-codes discipline and any log tooling keying on codes
  cannot see this failure class at all; the only evidence is a prose note.
- BNDR-9 failures abort argument binding — a user-visible invocation outcome
  whose only machine-readable trace is an empty object.

## Non-goals

- The `content` bytes (conformant; pinned by
  `determinism-cancellation-failure.md:54` and unit-tested).
- Whether the note should ALSO carry a group-A binder-failure `RuntimeEvent`
  (the row is a binder failure by placement in the templates table, and a
  `theta/runtime/*`-coded diagnostic by registry — the group-A/B partition
  assigns `theta/runtime/*` codes to group B via `alwaysLogGroup`
  (`runtime-event-channel.ts:199–216`), but the spec's group-B preamble says
  "Runtime panics", which this row is not). That one-row partition ambiguity
  needs a spec sentence; under EITHER reading the shipped `{ event: {} }` is
  wrong, which is this report's claim.
- The BNDR-9 detection predicate and transcript-abort behaviour (correct;
  unit-pinned).

## Fix

Not yet decided; constraints any fix must satisfy:

1. Wire `customTypeUnsafeDiagnostic(value)` into the emission —
   `details: { diagnostics: [diag] }` with the existing framed `content`
   (mirroring `emitPanicNote`), or route through `emitDiagnostic` +
   the note, whichever the group-B pairing adjudication picks; the code must
   land on the wire exactly once (no double emission).
2. A spec sentence resolving the group-A/B classification of this row
   (binder-failure-templates row vs `theta/runtime/*` code) must land in the
   same commit (DIAG-2 discipline; `runtime-event-channel.md` group-B preamble
   or the binder failure enumeration).
3. Witness both directions: captured note carries the code and severity in
   `details.diagnostics[0]`; the pre-fix `{ event: {} }` signature is the red.

## Provenance

Spec read: `diagnostics/code-registry-runtime.md:7,43`,
`diagnostics/diagnostic-shape.md:7–34,71`,
`binder/binder-model-and-context.md:54,137`,
`binder/determinism-cancellation-failure.md:42–56`,
`pi-integration-contract/runtime-event-channel.md:20–57`. Implementation read:
`src/extension/production-theta-producer.ts:944–1093, 1359–1405`,
`src/binder/compact-transcript.ts:280–351`,
`src/runtime/runtime-event-channel.ts:199–216`. Tests read:
`tests/bind-context-transcript.test.ts:300–336`,
`tests/integration-acceptance.test.ts:170–180`. Greps quoted above, run at
`d63c5148`. Sibling-shape probes P1–P3 (deleted) confirmed the capture surface
and the shared literal.
