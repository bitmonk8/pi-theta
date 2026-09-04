# Bug 0434 — Every registered `theta/runtime/*` code that reaches `emitDiagnostic` without top-level panic framing — 21 registry rows at HEAD — ships as a single-element `details: { diagnostics: [d] }` note with serialised-line content, a pairing no per-variant matrix row selects: row 1's selector admits only parse/load/type batches, row 2 only the top-level panic framing, and 0404's row 3 only the BNDR-9 rejection

- **Status:** open.
- **Sev/Diff estimate:** S5/D1 — S5: doc/registry inconsistency, crisp and
  consumer-relevant (a matrix-driven conformance checker finds no row for
  21 shipped note classes; the matrix header declares the pairings
  normative). D1: one additive selector generalisation or one additive row
  + selector notes, exactly the shape 0404 landed for BNDR-9; no
  behavioural change.
- **Kind:** spec gap — the 0404 §Fix Residual 1 follow-on, filed as one
  report because every member shares one mechanism and one funnel
  (registered runtime diagnostic routed as an operator-facing note,
  serialised-line content), unlike the 0401→0398→0404 rungs which each had
  distinct mechanisms.
- **Related:**
  - 0404 (fixed 0.414.0) — §Fix Residual 1 names this exact set ("sibling
    single-element operator-facing-note diagnostics one rung over (e.g.
    `theta/runtime/watcher-terminated` and the other
    `theta-system-note`-routed registry rows) remain rowless under the same
    matrix reading … a follow-on bug continuing the 0401 → 0398 → 0404
    ladder is warranted (reviewer R1)").
  - 0398 (fixed 0.391.0) — established the group-B classification these
    notes route under; the matrix half was deferred there and closed for
    BNDR-9 only by 0404.
  - 0265 — the byte-stability gate constraining matrix edits
    (`tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts`): any
    additive row MUST NOT contain the substring
    `runtime panic (single-element batch`.
  - [bug 0433](./0433-active-set-advisory-note-fabricates-event-code.md) — the SAME protocol's advisory note.
    Boundary: 02 owns payload FABRICATION (the advisory note's fabricated
    `event` key, `tool-registration.ts:182–186`); this card owns rowless
    ROUTING (the diagnostic half, `:174–179`, is a full member of the set
    below).
- **Affected** (verified at `04579e12`, v0.415.0):
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:29–37`
    — the normative matrix. Row `:31` selector: "parse / load / type batch".
    Row `:32` selector (0404-narrowed): "runtime panic …, routed as a
    top-level panic, not an operator-facing note". Row `:33` selector:
    "registered `theta/runtime/*` diagnostic routed as an operator-facing
    note rather than a top-level panic **(the BNDR-9 custom-type-unsafe
    rejection)**" with content pinned to the custom-type-unsafe template.
    No row selects an operator-facing runtime-diagnostic note with
    serialised-line content.
  - One funnel carries the class: the production sink `sink.emit`
    (`production-composition.ts:578`), wired as the producer's
    `emitDiagnostic` at `:886` and into `buildRuntimeRoot` at `:1640` →
    `emitLoadNote` (`:1628–1630`) → the pre-eval router
    (`:1615–1619`), which hard-codes the triple `display: true` +
    `renderDiagnosticBatch([d])` + `details: { diagnostics: [d] }`. The
    bootstrap tiers ship the same triple (tier-1 raw note `:3978–3986`;
    tier-2 `emitDiagnosticBatch([d])` at `:4008`). So the rowless class is
    every registered `theta/runtime/*` code reaching `emitDiagnostic`
    without panic framing — 21 registry rows at the pin, not a hand-picked
    six.
  - Worked examples (registry row → emission site → shipped
    triple `(display: true, serialised line(s), { diagnostics: [d] })`):
    1. `theta/runtime/watcher-terminated`
       (`code-registry-runtime.md:23`) —
       `src/extension/watcher-recovery.ts:163–171`; content
       `renderDiagnosticLine(d)` = `theta/runtime/watcher-terminated: theta
       watcher terminated; hot-reload halted until /reload`.
    2. `theta/runtime/system-note-delivery-failed` (`:19`) — fallback
       step 2 (`src/extension/system-note-channel.ts:356–361`) via the
       production `emitDiagnostic` sinks: in the compose-instance wiring it
       lands as a pre-eval-routed single-element note
       (`production-composition.ts:1615–1619`), in the bootstrap tier-2
       wiring as `emitDiagnosticBatch([d])`
       (`production-composition.ts:4008`; tier-1 raw note `:3978–3986`);
       probe P4 captured the wire
       bytes (candidate 04 §Reproduction quotes them).
    3. `theta/runtime/registry-swap-failed` (`:20`) —
       `src/extension/hot-reload.ts:282–330` emits through `emitErr7` =
       the compose loadSink → same single-element note shape.
    4. `theta/runtime/registration-cache-collision` (`:38`) —
       `src/runtime/tool-registration.ts:277–290` via the producer's
       `emitDiagnostic` → bootstrap sink → single-element batch note.
    5. `theta/runtime/validator-cache-collision` (`:39`) —
       `src/seams/schema-validator.ts:401–410` via `buildRuntimeRoot`'s
       `emitLoadNote` (`production-composition.ts:1628–1640`) → pre-eval
       router single-element note.
    6. `theta/runtime/subagent-dispose-failure` (`:26`) —
       `src/runtime/subagent-isolation.ts:261–266` via the producer's
       `emitDiagnostic` → single-element batch note.
    7. `theta/runtime/active-set-restore-failed` (`:40`) — the diagnostic
       half, `tool-registration.ts:174–179` (the advisory-note half at
       `:182–186` is [bug 0433](./0433-active-set-advisory-note-fabricates-event-code.md)'s).
    8. `theta/runtime/par-max-non-positive` (`:22`) —
       `src/runtime/statement-executor.ts:1887`; clamp-and-continue (no
       panic framing), `deps.emitDiagnostic` threaded from the producer at
       `production-theta-producer.ts:2088`; carries `file`+`range`, so the
       content is the located serialised line.
    9. `theta/runtime/par-max-non-integer` (`:21`) —
       `src/runtime/statement-executor.ts:1905`; same path as 8.
    10–21. The twelve `subagent-*` rows — `subagent-spawn-failed` `:27`,
       `-child-crashed` `:28`, `-wire-parse-failed` `:29`,
       `-envelope-parse-failed` `:30`, `-envelope-schema-skew` `:31`,
       `-exit-without-envelope` `:32`, `-params-validation-failed` `:33`,
       `-return-value-not-representable` `:34`, `-teardown-timeout` `:35`,
       `-callable-hash-mismatch` `:36`, `-model-preflight-mismatch` `:37`,
       `-model-unresolved` `:44`. Each records an operator-triage
       diagnostic through `emitDiagnostic` IN ADDITION to the group-A
       `invoke_infra` cascade — exemplar
       `src/runtime/subagent-launcher.ts:624–635` ("records the
       operator-triage diagnostic here; the caller additionally routes it
       through the runtime-defect surface").
    Total: 21 rows (7 non-subagent + 2 `par-max-*` + 12 `subagent-*`).
    Excluded, with reasons: the 8 panic rows (top-level panic framing via
    `emitPanicNote`, matrix row `:32`); `custom-type-unsafe`
    (registry `:43`, matrix row `:33`, 0404);
    `cancelled-by-session-shutdown` (registry `:41`, `display: false` +
    `details.event` — [bug 0432](./0432-cancelled-note-event-reason-outside-partition.md));
    `reload-teardown-timeout` (registry `:42`) plus the four
    `theta/host/*` shutdown codes — `console.error`-only, excluded from the
    channel at `runtime-event-channel.md:60`.
- **Observed at:** v0.415.0 (`04579e12`), offline. Sites read at source;
  the delivery-failed instance additionally captured on the wire by probe
  P4 (scratch, deleted): `content` =
  `theta/runtime/system-note-delivery-failed: <original content>\n  hint: …`,
  `details.diagnostics[0].code` = the registered code, `display: true`.

## Summary

After 0404, the matrix covers exactly one operator-facing runtime-
diagnostic note — BNDR-9 — by naming it in the selector. Every other
registered `theta/runtime/*` code that reaches `emitDiagnostic` without
top-level panic framing — 21 registry rows at HEAD, all funnelled through
one code path — ships the same group-B triple with serialised-line content
and has no row:
row `:31`'s label excludes runtime codes, row `:32` was 0404-narrowed to
the top-level-panic framing these notes do not use, and row `:33`'s
parenthetical closes it to BNDR-9 whose content mandate (the
custom-type-unsafe template) these notes do not carry. Under the matrix's
label-inclusive reading all 21 are rowless; there is no over-matching row
left (0404 removed the ambiguity for the panic row), so the shipped notes
are simply outside the normative pairing table that the page headlines as
covering the channel.

## Reproduction

Documentary + one wire capture:

1. Read `runtime-event-channel.md:29–37`; attempt to select a row for the
   `watcher-terminated` note's triple (`display: true`, content
   `theta/runtime/watcher-terminated: theta watcher terminated; hot-reload
   halted until /reload`, `details: { diagnostics: [d] }`): row `:31` fails
   on the selector (runtime code, not parse/load/type), `:32` on both
   selector and content (not a top-level panic, no `aborted:` framing),
   `:33` on both (not BNDR-9, wrong template).
2. Repeat for each enumerated code (registry rows cited; emission sites
   quoted for the worked examples; the funnel makes the triple invariant
   across members).
3. Wire instance: probe P4's captured delivery-failed note (see candidate
   note-details-matrix/04) — same rowless triple on the wire.

## Expected behaviour

The matrix header (`:27` "Per-variant `display` / `content` pairings
(normative)") together with `:20`'s per-shape content enumeration implies
every conformant note on the channel has a selecting row (the premise of
0401's and 0404's fixes). A note class the group-B bullet (`:58–61`)
classifies as well-formed must be selectable: either row `:31`'s selector
generalises to "diagnostic batch (parse / load / type, or a registered
operator-facing runtime/host diagnostic routed as a note)" — the content
cell already matches, since diagnostic-shape.md's serialised content format
(location-less form `<code>: <message>`) is what these notes carry — or a
new sibling row selects "single-element batch, registered `theta/runtime/*`
diagnostic routed as an operator-facing note, other than the BNDR-9
rejection" with content "the serialised diagnostic line(s)".

## Actual behaviour / root cause

0398 added the group-B classification generically ("registered
`theta/runtime/*` diagnostics routed as operator-facing notes … fall in
group B") but 0404's ratified settlement was scoped to three edits naming
BNDR-9 alone; reviewer R1 recorded the remainder as exceeding the lane and
recommended this follow-on. No tracking artifact existed until this report.

## Why it matters

- A matrix-driven conformance checker or renderer — the consumer the page
  builds — either finds no row for 21 shipped note classes or
  special-cases them with knowledge the spec does not state (0404's own
  "unwitnessable contract" argument, verbatim applicable).
- The group-B bullet and the matrix now disagree on coverage: `:58–61`
  says these notes are well-formed; `:29–37` cannot say anything about
  them.
- The set includes the channel's own failure beacon
  (`system-note-delivery-failed`) and the watcher-death beacon
  (`watcher-terminated`) — the notes tooling most needs to classify.

## Non-goals

- The notes' shipped bytes (`content`/`display`/`details` all conform to
  the group-B bullet and diagnostic-shape.md's serialised format; nothing
  behavioural moves).
- The BNDR-9 row (0404, closed) and the informational five (0401, closed).
- The clean-cancel note (`event`-keyed — [bug 0432](./0432-cancelled-note-event-reason-outside-partition.md))
  and the advisory note's fabricated `details` (candidate 02).
- The five `console.error`-routed teardown codes (explicitly excluded from
  the channel at `:60`).

## Fix

Docs-only, additive, the 0404 recipe: EITHER generalise row `:31`'s
selector to cover registered operator-facing diagnostic notes (one-line
edit; content cell unchanged) OR add one sibling row under `:33` selecting
the non-BNDR-9 operator-facing case with content "serialised
`<code>: <message>` line(s) per Diagnostic shape — Serialised content
format". Constraints: the new/edited line MUST NOT contain the substring
`runtime panic (single-element batch` (b0265 `locateSite` uniqueness); keep
row `:33`'s BNDR-9 pin intact (its content differs); DIAG-2 corpus gate
green (0404 demonstrated additive edits pass). Witness: a
registry-driven test enumerating the theta-system-note-routed runtime rows
and asserting each note class is selected by exactly one matrix row
(red today for the 21).

## Provenance

Seed 1 mechanical enumeration: `code-registry-runtime.md` §7 prose +
per-row *Trigger* scan for "theta-system-note" / "standard
persistent-diagnostic channel", intersected with `rg "details: \{
diagnostics" src/` emission sites; each site read; the delivery-failed
instance wire-captured (probe P4, deleted). Prior bugs read in full: 0398
(Residual 1 origin), 0404 (Residual 1 blessing + b0265 constraints), 0401,
0383, 0313 (watcher-terminated latch — content unchanged there). An
earlier draft excluded the subagent failure codes on the belief they
surface only through the group-A `invoke_infra` cascade (row `:34`); that
was FALSE for the diagnostic half — each row additionally records an
operator-triage diagnostic through `emitDiagnostic`
(`subagent-launcher.ts:624–635`), so the twelve rows are counted.
