# Bug 0397 — Binder-failure notes ship `details: { event: {} }` where the always-log contract makes binder failures group-A members whose note carries a `RuntimeEvent` sourced from the ActiveInvocationRegistry: every binder failure's sole emission has an empty structured half, so the exactly-once always-log guarantee is unwitnessable and the group-A dedup tuple reads three absent spec-pinned fields

- **Status:** fixed (0.392.0).
- **Kind:** defect — implementation diverges from a stated wire-shape rule
  (`runtime-event-channel.md:46–53` group-A enumeration + `:83` binder-failure
  sourcing), the exact 0383 mechanism on the sibling surface whose payload the
  spec pins independently of SLSH-4.
- **Related:**
  - 0383 (fixed 0.360.0) — same `{ event: {} }` literal on the SLSH-4 `Err`
    note; its §Fix constraint 2 and §Residuals item 2 recorded the seven
    sibling sites as "recorded, not fixed", and its §Summary mischaracterised
    the binder-failure notes as "not runtime events at all" — the group-A
    enumeration says they are. This report is the follow-up for the
    binder-failure subset, the one sibling with a fully spec-pinned payload.
  - 0073 (fixed 0.130.0) — prior "structured note constructed nowhere" defect
    on an adjacent per-invocation channel.
  - Report 05 in this area — the matrix-less siblings (echo, SLSH-1 overflow,
    factory notes) sharing the literal; different disposition (no group-A row
    pins their payload, so those need a DIAG-2-style shape decision; this one
    does not).
- **Affected** (verified at `d63c5148`, v0.382.0):
  - `src/extension/production-theta-producer.ts:1406–1416` —
    `#emitBinderFailureNote`: `details: { event: {} }` hardcoded (`:1412`).
    Reached from every binder failure route: malformed envelope (`:944`),
    cancellation (`:1048`, `:1053`), the per-class retry-budget outcomes
    `needs_info` / `ambiguous` / transport / malformed (`:1063`), and the
    post-default-merge AJV refusal (`:1086`).
  - `src/runtime/runtime-event-channel.ts:79–86, 236–247, 309–319` — the
    group-A kind list, the conformant `buildRuntimeEventNote`, and
    `emitRuntimeEvent`; no binder path calls any of them.
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:40` —
    the always-log set includes "binder failure causes" and emits "a structured
    note through the `theta-system-note` channel exactly once per occurrence";
    `:46–53` — Group A (`details: { event: RuntimeEvent }`) lists "Binder
    failures (every row of [Binder — Failure modes], including `needs_info`,
    `ambiguous`, malformed envelope, AJV validation, transport, cancellation)";
    `:83` — **Binder-failure sourcing**: `invocation_id` and `theta` read from
    the `ActiveInvocationRegistry` entry, `query_site` absent.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:20` — renderers "MUST
    switch on which key is present"; the present-but-empty `event` key selects
    the runtime-event arm for a payload that is not a `RuntimeEvent`.
- **Observed at:** v0.382.0 (`d63c5148`). Offline, deterministic: production
  `runBinder` driven through `createProductionProducerDeps` with a scripted
  binder `complete()` (the `tests/e2e-s5-binder-echo-emission.test.ts` rig) and
  a capturing `pi.sendMessage`; scratch probe P2 (deleted).

## Summary

`runtime-event-channel.md` puts binder failures in the always-log set's group
A: each occurrence emits exactly one structured `theta-system-note` whose
`details` is `{ event: RuntimeEvent }`, with `kind` the binder failure cause,
`invocation_id`/`theta` sourced from the invocation's ActiveInvocationRegistry
entry, and `query_site` omitted. The spec dedicates a paragraph
(*Binder-failure sourcing*, `:83`) to how exactly this event is constructed —
including the guarantee that the registry entry is present when it is built.

The shipped emitter sends the correct user-facing `content` (the failure-mode
template row) with `details: { event: {} }`. No site constructs a
binder-failure `RuntimeEvent`; `emitRuntimeEvent`'s only production caller
remains the QRY-20 discard path. The binder-failure note is the *only*
emission for the occurrence (nothing else fires on this channel for a failed
bind), so the always-log guarantee — the spec's own reason for enumerating
binder failures in group A — has no witness at all: the structured half that
operator tooling is entitled to validate against the `RuntimeEvent` shape is
an empty object on every binder failure.

## Reproduction

At `d63c5148`, offline (scratch vitest probe, production producer):

1. Build the producer with a capturing `pi` and a scripted binder reply
   carrying `{ kind: "needs_info", message: "which topic?" }` (the S5 rig).
2. `await deps.runBinder({ theta: <two-string-param theta>, args: "vague", ctx })`.
3. Captured note:

   ```json
   {"customType":"theta-system-note",
    "content":"theta /code-review: argument binding needs more info — which topic?",
    "display":true,
    "details":{"event":{}}}
   ```

   `details.event` has zero keys; `kind`, `theta`, `invocation_id`, `message`,
   `occurred_at` all absent. `result.bound === false` (the failure replaced
   execution, so this note is the occurrence's only emission).

Source-level: `rg -n "event: \{\}" src/extension/production-theta-producer.ts`
→ `:1412` inside `#emitBinderFailureNote`; `rg -n "emitRuntimeEvent" src/` →
definition + one caller (`query-discard.ts:219`), never a binder path.

## Expected behaviour

- `runtime-event-channel.md:40` — binder failure causes are always-log
  members: "emit a structured note through the `theta-system-note` channel
  exactly once per occurrence".
- `:46–53` — group A routes `details: { event: RuntimeEvent }`; the binder
  rows are enumerated by name, cancellation included.
- `:83` — the event's `invocation_id`/`theta` come from the
  ActiveInvocationRegistry entry (inserted at dispatch entry, so present);
  `query_site` omitted; `kind` is the binder failure cause.
- `diagnostic-shape.md:20` — the four `details` shapes are disjoint by key and
  the present key classifies the note; a present `event` key must therefore
  carry a `RuntimeEvent`.

## Actual behaviour / root cause

`#emitBinderFailureNote` (`production-theta-producer.ts:1406–1416`) was built
around the `content` template (`renderBinderSystemNote`,
`src/binder/retry-taxonomy.ts:88`) and stubs the structured half with the
empty-object literal, exactly as `emitTopLevelErrNote` did before 0383. The
conformant builder (`buildRuntimeEventNote`) and emitter (`emitRuntimeEvent`)
exist and are group-A-aware; neither is wired to any binder route. No
binder-failure `RuntimeEvent` is constructed anywhere in `src/`.

## Why it matters

- The structured payload is the note's only machine-readable half, and for
  binder failures the note is the occurrence's *only* emission — `{}` makes
  the whole always-log entry for this group-A member vacuous, not merely
  degraded.
- The spec names concrete consumer behaviour (strict `RuntimeEvent`
  validation, the `(kind, query_site, message, occurred_at)` dedup tuple —
  three of whose fields are wrongly absent here; `query_site` is spec-absent
  for binder failures per `runtime-event-channel.md:83`)
  that is unimplementable against `{}`.
- 0383's fix repaired the SLSH-4 note; a consumer that now validates
  `details.event` on `theta-system-note` messages (as that fix invites) hard-
  fails on every binder failure — the most common user-visible failure class
  for params-bearing thetas.

## Non-goals

- The user-facing `content` bytes (correct today; System-note rendering rules
  own them).
- The matrix-less sibling `{ event: {} }` sites (echo, SLSH-1 overflow,
  drain-state, repeat-start notes) — report 05; they have no group-A row and
  need a shape decision first.
- The wider origin-site always-log surface for group-A `QueryError` kinds
  (0383 §Residuals item 1) — binder failures need no origin/boundary split;
  the failure note is the origin.

## Fix

Not yet decided; constraints any fix must satisfy:

1. Construct the binder-failure `RuntimeEvent` once per failure with `kind`
   the failure cause (the classification the retry taxonomy already computes),
   `message` the same string interpolated into the template,
   `invocation_id`/`theta` from the ActiveInvocationRegistry entry per `:83`
   (NOT fresh mints — the sourcing paragraph is explicit, unlike 0383's
   boundary case), `occurred_at` via `Clock.wallNow()`, `query_site` omitted.
2. Reuse `buildRuntimeEventNote` / `emitRuntimeEvent` rather than forking a
   builder (0383 §Fix precedent). The binder note is user-facing
   (`display: true`) with the failure-template `content`; the per-variant
   matrix's `content` column text ("normative user-facing template per
   SLSH-3") needs a clarifying word for the binder rows in the same commit —
   the binder rows' templates live in the Failure-mode templates table, not
   SLSH-4.
3. The producer's binder path must reach the registry entry (the runBinder
   seam currently does not thread it); the fix threads it or reads it via the
   existing registry surface — a seam question mirroring 0383's D2.
4. Witness: capture `pi.sendMessage` per failure route (needs_info,
   ambiguous, malformed, AJV-on-args, transport, cancelled); assert
   `details.event.kind` = the cause, sourcing fields present, `query_site`
   absent; red direction provable today (probe P2's `{}` signature).

## Fix (0.392.0)

- What shipped:
  - `src/extension/production-theta-producer.ts` — `#emitBinderFailureNote`
    constructs the binder-failure `RuntimeEvent` ONCE per failure and emits it
    via the shared `buildRuntimeEventNote(event, { topLevelCascade: true,
    userFacingTemplate: content })` (no forked builder), replacing the hardcoded
    `details: { event: {} }` (§Fix 1/2). `kind = surface.kind`;
    `message = binderFailureMessage(surface)`; `theta = /${ticket.theta}`;
    `invocation_id = ticket.invocationId` (the registry entry's minted id, NOT a
    fresh mint, per `runtime-event-channel.md:83`); `occurred_at =
    root.clock.wallNow()`; `query_site` omitted. `content`
    (`renderBinderSystemNote`) and `display: true` stay byte-identical. All five
    call sites thread `binderInput.invocationTicket`.
  - `src/runtime/active-invocation-registry.ts` — `ActiveInvocationTicket` gains
    read-only `invocationId` / `theta`, sourced from the entry in
    `#openInvocationTicket` (§Fix 3, THREAD route).
  - `src/extension/theta-composition-producer.ts` — `BinderRunInput` gains
    `invocationTicket?` (mirrors `ConversationBindInput.invocationTicket`); the
    dispatch threads the `beginInvocation` ticket into `runBinder` (§Fix 3).
  - `src/binder/retry-taxonomy.ts` — new `binderFailureMessage(surface)`, the
    single surface→message source of truth beside `renderBinderSystemNote`
    (needs_info/ambiguous/transport → `message`, ajv_args → `ajvSummary`,
    malformed → "could not parse arguments", cancelled → "argument binding
    cancelled") (§Fix 1).
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — the
    per-variant matrix's `details: { event }` top-level-cascade `content` cell
    gets the binder-failure clarifying clause (template comes from the
    Failure-mode templates table, not SLSH-3), scoped strictly to the
    binder-failure rows (§Fix 2).
  - `tests/b0397-binder-failure-note-runtime-event.test.ts` — the witness (7
    cells; §Fix 4). `tests/cancelled-by-session-shutdown-note.test.ts` — ticket
    double forwards the two new fields (mechanical interface completion, no
    assertion changed). `tests/fixtures/diag2/asserted-code-not-in-registry-baseline.json`
    — the witness fixture theta `theta/b0397deep` added to the DIAG-2 ratchet
    (same class as the pre-existing `theta/b0191` / `theta/b66deep` entries).
- Gates:
  - Witness: `npx vitest run tests/b0397-binder-failure-note-runtime-event.test.ts`
    → 7 passed. RED at fork / on hand-revert to `details: { event: {} }`: 6
    failed / 1 passed, the empty-`{}` signature (`.kind` undefined); the 1 pass
    is the byte-identity `content` control.
  - Full suite: `npx vitest run` → 557 files / 10314 tests passed (baseline
    556/10307 + the witness).
  - `npm run typecheck` → clean. `npm run lint` → clean.
  - Live: `tests/live/err-note-render-record-error-field-live-cell.test.ts`
    passed — the sibling `theta-system-note` emission through a REAL spawned
    subagent child on the same runtime-event-channel surface (adjacent-cell
    witness; 0397 changes no drive outcome or `content` bytes, so no new live
    cell was owed).
- Review: 1 round. Round 1 (`bug-fix-reviewer`, deep) — CLEAN, no
  correctness/fidelity/spec findings; one non-blocking house-rule residual (R1,
  a freshly-refreshed line citation into this file's own `LivePromptQueryModel`
  comment that re-pinned an already-stale target) — resolved by the
  orchestrator converting it to insertion-invariant symbol-only form
  (`(this file)`); the companion `:527` refresh into
  `theta-composition-producer.ts` was reviewer-verified accurate and kept. The
  post-review touch was comment-only, so a confirmation review round was
  skipped (polish verified by gate-diff).
- Verification: SOLID (`bug-fix-verifier`). Witness reds on hand-revert (6
  failed, empty-`{}` signature) and greens on byte-exact restore
  (`git hash-object` identical); full default suite 557/10314 green on the
  first unfiltered run; typecheck + lint clean; tree matches the owned set,
  `git stash` empty.
- Residuals:
  1. The four matrix-less informational `{ event: {} }` sites (binder success
     echo, SLSH-1 overflow, factory drain/repeat notes, slash-dispatch) remain
     UNTOUCHED — a different disposition (no group-A row pins their payload) and
     owned by a sibling lane's report. Recorded, not fixed (§Non-goals).
  2. Ticket-LESS direct-`runBinder` harnesses (no dispatch-level
     `beginInvocation`) degrade to the pre-fix `{ event: {} }` payload without
     throwing — harness-only; production always threads the ticket
     (`beginInvocation` inserts the entry ahead of the awaited binder step per
     `runtime-event-channel.md:83`). Documented at the emitter; reviewer
     confirmed the production caller cannot reach it.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the user-facing `content` bytes and the
  `bound: false` drive outcome are unchanged for every failure route (only the
  operator-channel structured half changed). `query_site` is deliberately
  omitted for binder failures (the binder runs before any theta code, per
  `runtime-event-channel.md:83`).

## Provenance

Spec read: `pi-integration-contract/runtime-event-channel.md` (always-log set
`:40`, group A `:46–53`, binder-failure sourcing `:83`, per-variant matrix
`:27`), `diagnostics/diagnostic-shape.md:20`,
`binder/determinism-cancellation-failure.md` (failure-mode templates).
Implementation read: `src/extension/production-theta-producer.ts:896–1093,
1406–1416`, `src/runtime/runtime-event-channel.ts`,
`src/runtime/query-discard.ts:200–228`, `src/binder/retry-taxonomy.ts:88`,
`src/binder/binder-cancellation.ts:99`. Prior bugs read in full: 0383 (§Fix
constraint 2, §Residuals 2), 0073, 0355. Probe P2 run at `d63c5148`
(scratch file deleted).
