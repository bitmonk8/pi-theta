# Bug 0383 — Every SLSH-4 `Err` note ships `details: { event: {} }` where the spec pins `details: { event: RuntimeEvent }` "the same value emitted at the originating failure site": the documented consumer dedup key `(kind, query_site, message, occurrence-timestamp)` reads four absent fields, and a renderer that per spec "MUST switch on which key is present" selects the runtime-event arm for an empty payload

- **Status:** fixed (0.360.0).
- **Sev/Diff estimate:** S3/D2 — S3 because the wrong bytes are confined to the
  note's structured wire payload (the user-facing `content` line is correct;
  no wrong value binds), but the payload is the note's *only* machine-readable
  half: the spec entitles operator tooling to the `RuntimeEvent` shape there,
  names the dedup tuple it carries, and the shipped `{}` satisfies neither.
  D2 because the producer does not currently hold the originating
  `RuntimeEvent` at the emission site (no site calls `emitRuntimeEvent` with
  `topLevelCascade: true`), so the fix threads the event through the terminal-outcome path or
  rebuilds it at the boundary — a seam question, not a one-liner.
- **Kind:** defect — implementation diverges from a stated wire-shape rule
  (`slash-invocation.md:63`), with an adjacent doc/impl inconsistency: the
  conformant builder exists in-tree (`buildRuntimeEventNote`) and the SLSH-3
  emitter does not use it.
- **Related:**
  - 0088 (fixed 0.205.0) — the same emitter's `chain` input was the previous
    "conformant renderer, input never constructed" defect on this exact
    surface; the `details` half is its sibling.
  - 0355 (open, wave 1) — wrong `masked` on a repair-validation
    `RuntimeEvent`; different mechanism (that event exists and carries a wrong
    field; here the note-side event payload is empty). Not a duplicate.
  - `src/runtime/runtime-event-channel.ts:309` — `emitRuntimeEvent` (context:
    no site calls it with `topLevelCascade: true`, so the originating-site
    event this note is specified to duplicate is itself not emitted on this
    path; the `noopSwallowChannels` no-op at
    `production-theta-producer.ts:650–654` is a different, deliberate scope —
    discarded LATE settlements only. Scoped out below, noted for the fixer).
- **Affected** (verified at `9474dfa8`, v0.347.0):
  - `src/extension/production-theta-producer.ts:1602–1616` —
    `emitTopLevelErrNote`: `details: { event: {} }` hardcoded (`:1612`).
    Reached from the slash boundary for every unhandled top-level `Err`
    (`theta-composition-producer.ts:556`), i.e. for every SNK row SLSH-4
    lists.
  - `src/runtime/runtime-event-channel.ts:236–247` — `buildRuntimeEventNote`,
    the conformant `details: { event }` builder (real event, cascade-driven
    `display`). Its only production caller is the query-discard path
    (`src/runtime/query-discard.ts:219`, `topLevelCascade: false`); the
    top-level-cascade arm has no caller.
  - `docs/spec_topics/slash-invocation.md:63` — "Every row above emits as a
    `theta-system-note` carrying `details: { event: RuntimeEvent }`, where the
    `RuntimeEvent` payload is the same value emitted at the originating
    failure site (consumers deduplicate on `(kind, query_site, message,
    occurrence-timestamp)`)."
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:20` — the two `details`
    payload shapes are "disjoint by key"; "Renderers MUST switch on which key
    is present and MUST NOT assume both."
- **Observed at:** v0.347.0 (`9474dfa8`). Offline, deterministic: the scratch
  production-`runBinder` rig captured `pi.sendMessage` for adjacent notes
  (echo, binder failure) confirming the capture surface works; the SLSH-3
  emitter's payload read from source (`:1612` hardcodes the literal), and
  `deps.emitTopLevelErrNote` is a public producer-deps member reachable
  without a drive. Grep-verified: `rg -n "event: \{\}" src/` returns eight
  sites; `buildRuntimeEventNote` has one caller.

## Summary

`slash-invocation.md:63` closes the SLSH-4 section by fixing the wire shape of
every per-`kind` `Err` note: `details: { event: RuntimeEvent }`, the same
event value emitted at the originating failure site, so consumers can
deduplicate the display note against the always-log operator event on the
documented four-field tuple. The shipped emitter sends `details: { event: {} }`
— an object with none of `kind`, `query_site`, `message`, or a timestamp.

A consumer following `diagnostic-shape.md:20` switches on which `details` key
is present: `event` is present, so it takes the runtime-event arm and then
reads an empty payload. Strict validation against the `RuntimeEvent` shape
(which `pi-integration-contract/runtime-event-channel.md` pins) fails; the
documented dedup is impossible; and the same `{ event: {} }` literal ships on
seven further note sites (`factory.ts:647,713`,
`production-theta-producer.ts:1148,1382,1394,1581`, `slash-dispatch.ts:187`)
— including notes that are not runtime events at all (the bind echo, binder
failure notes, the SLSH-1 overflow note), which a key-switching renderer
therefore misclassifies as empty runtime events.

## Reproduction

At `9474dfa8`, source-level (the emitter takes no private state):

1. `src/extension/production-theta-producer.ts:1602–1616` — the whole of
   `emitTopLevelErrNote`; `:1612` is `details: { event: {} }`.
2. `rg -n "event: \{\}" src/` → 8 sites (enumerated above).
3. `rg -n "buildRuntimeEventNote" src/` → definition + one caller
   (`query-discard.ts:219`), never the SLSH-3 path.

Runnable: construct the producer deps with a capturing `pi`
(`createProductionProducerDeps`, as `tests/e2e-s5-binder-echo-emission.test.ts`
does), call `deps.emitTopLevelErrNote("t", { kind: "transport", message: "m" })`,
inspect the captured message: `details` equals `{ event: {} }`; `content`
equals the SNK-c line.

## Expected behaviour

- `slash-invocation.md:63` (quoted above): the note carries the originating
  `RuntimeEvent`.
- `pi-integration-contract/runtime-event-channel.md` pins the `RuntimeEvent`
  shape the `details.event` value must satisfy, and the group-A always-log
  members' note routing.
- `diagnostic-shape.md:20`: renderers switch on the present key — so a
  `details.event` key present with a non-`RuntimeEvent` value is the one shape
  the partition rule cannot classify.

## Actual behaviour / root cause

`emitTopLevelErrNote` was built around the `content` string (SLSH-3/4/5, bug
0088's subject) and stubs the structured half with an empty object. The
conformant builder (`buildRuntimeEventNote`) exists but is wired only to the
QRY-20 discard path; NO site calls `emitRuntimeEvent` with `topLevelCascade:
true` (its one production caller is `query-discard.ts:219`, `topLevelCascade:
false`), so the originating-site event the note is specified to duplicate is
not available at the boundary today. (The `emitRuntimeEvent: (): void => {}`
no-op at `production-theta-producer.ts:650–654` is `noopSwallowChannels`,
deliberately scoped to discarded LATE settlements — not the general
originating-site emitter.)

## Why it matters

- The structured payload is the only machine-readable half of the note; the
  spec names a concrete consumer behaviour (dedup on the four-field tuple)
  that is unimplementable against `{}`.
- The disjoint-by-key partition is load-bearing for the registered renderer
  and any log tooling; eight sites shipping a present-but-empty `event` key —
  several on notes that are not events — make the partition rule
  unsatisfiable exactly where the spec says consumers may rely on it.
- Tests asserting the spec's wire shape on any SNK row fail today; nothing in
  `tests/` pins `details` on this note (grep: no cell reads `details.event`
  off an SLSH-3 note), which is why the divergence is silent.

## Non-goals

- The missing originating-site always-log emissions themselves (the absence
  of any `topLevelCascade: true` caller of `emitRuntimeEvent`, and which
  kinds fire events on which paths) — a runtime-event-channel surface adjacent to but wider than this
  note's payload; recorded here as context.
- 0355's `masked` computation (open, own mechanism).
- The `content` line's bytes (correct today; sibling report 03 covers its
  break discipline).
- The non-`Err` sites sharing the `{ event: {} }` literal are cited as blast
  radius; their correct per-note `details` shape is pinned by PIC's System
  notes matrix and should be settled in the same fix or a follow-up.

## Fix

Not yet decided; constraints any fix must satisfy:

1. The `RuntimeEvent` placed on the note must be the *same value* as the
   originating-site emission (spec wording), not a re-derivation with a fresh
   timestamp — otherwise the documented dedup tuple never matches. That
   requires threading the event through the terminal-outcome path (the
   `ResultValue` → `emitTopLevelErrNote` seam) or constructing it once and
   sharing.
2. The seven sibling `{ event: {} }` sites must not be blanket-"fixed" into
   fabricated events; each note's correct `details` arm comes from PIC's
   System-notes matrix (`buildDiagnosticsBatchNote` / structural / recovery /
   event), and notes with no matrix row need a spec decision first (DIAG-2
   discipline).
3. Witness: capture `pi.sendMessage` on an unhandled top-level `Err`; assert
   `details.event.kind === leaf.kind` and the tuple fields present; red
   direction provable today.

## Fix (0.360.0)

- What shipped:
  - `src/extension/production-theta-producer.ts` — `emitTopLevelErrNote` gains an
    optional third `event?: RuntimeEvent`. When PRESENT it is placed on the note
    verbatim (the forward hook: once origin-site always-log emissions land, they
    thread their exact value here and slash-invocation.md:63's "same value" holds
    literally). When ABSENT (every caller today) the emitter constructs the
    `RuntimeEvent` ONCE from the terminal `Err` leaf — walking the same
    `isInvokeCalleeError` recogniser the renderer uses down `.inner` — with
    `kind = leaf.kind`, `theta = /<thetaName>`, `message = leaf.message`, a fresh
    `invocation_id` (`root.idSource.newInvocationId()`) and `occurred_at`
    (`root.clock.wallNow()`); `query_site` is OMITTED (optional in the shape, not
    derivable on this path — no fabricated site). The note is built by REUSING the
    conformant `buildRuntimeEventNote(resolvedEvent, { topLevelCascade: true,
    userFacingTemplate: content })` — no forked constructor/builder — which
    replaces the hardcoded `details: { event: {} }` while leaving `content`
    (`renderTopLevelErrNote`) and `display: true` byte-identical (§Fix
    constraint 1, adjudicated route "constructing it once and sharing").
  - `src/extension/theta-composition-producer.ts` — the `ThetaProducerDeps`
    interface member widened with the same optional `event?: RuntimeEvent`;
    `RuntimeEvent` type import added.
  - `tests/cancelled-by-session-shutdown-note.test.ts` — the `rootWithIds()`
    root double gained a `clock: new FakeClock()` seam (required fixture
    completion: the new contract calls `root.clock.wallNow()` when that cell's
    Esc-style abort surfaces the SNK-f note; no assertion changed).
  - `tests/b0383-slsh4-note-details-event.test.ts` — the witness (6 tests;
    §Fix constraint 3).
- Gates:
  - Witness: `npx vitest run tests/b0383-slsh4-note-details-event.test.ts` → 6
    passed. RED at fork (fix reverted to `details: { event: {} }`): 5 failed / 1
    passed with the empty-payload signature (`expected {} to deeply equal …`,
    `.kind` undefined, `Object.keys(event).length === 0`); the 1 pass is the
    byte-identity content control.
  - Full suite: `npx vitest run` → 535 files / 10060 tests passed.
  - `npm run typecheck` → clean. `npm run lint` → clean.
- Review: 1 round. Round 1 (`bug-fix-reviewer`, deep) — CLEAN, no
  correctness/fidelity/spec findings; three non-blocking residuals recorded
  (R1 a non-discriminating supplementary `dedupKey` assertion in the witness,
  R2 a comment-wording accuracy note — applied, "mirror the renderer's leaf
  walk", comment-only, R3 the doc/version Phase-5 work).
- Verification: SOLID (`bug-fix-verifier`). Witness reds on hand-revert (5
  failed, empty-payload signature) and greens on byte-exact restore
  (`git hash-object` identical; 6 passed); full default suite 535/10060 green;
  typecheck + lint clean; tree state matches the owned set exactly. Live (run
  by the orchestrator under the lane live-lock):
  `tests/live/err-note-render-record-error-field-live-cell.test.ts` passed —
  it drives `emitTopLevelErrNote` through a REAL spawned subagent child and
  asserts the SNK-k `content` note, proving the real-path emission still
  delivers byte-identical content and that constructing the `RuntimeEvent` off
  `root.idSource`/`root.clock` on the live path does not throw or perturb
  delivery (no live cell asserts `details.event` today — census).
- Residuals:
  1. The wider origin-site always-log surface — the absence of any
     `topLevelCascade: true` caller of `emitRuntimeEvent`, so no origin
     `RuntimeEvent` is emitted on this path — remains a NON-GOAL (§Non-goals).
     The boundary construction here is the origin emission of record until that
     surface lands; the `event?` forward hook is the seam through which a future
     origin-site emission threads its exact value, making slash-invocation.md:63's
     "same value" hold literally. A follow-up filing candidate for that wider
     surface is RECORDED here as a residual — NOT filed by this fix.
  2. The seven sibling `{ event: {} }` sites (`factory.ts:700,766`;
     `production-theta-producer.ts:1152,1386,1398,1585`; `slash-dispatch.ts:187`)
     are UNTOUCHED per §Fix constraint 2 — each needs its correct `details` arm
     from PIC's System-notes matrix, and matrix-less notes need DIAG-2 decisions.
     Recorded, not fixed.
  3. The witness's `dedupKey(...)` "returns a string" assertion (R1) is
     non-discriminating (any input including `{}` yields a string); the four
     dedup-tuple fields are pinned at exact values immediately above, so the test
     reds hard at fork regardless. Left as-is (harmless).
- Discharge notes appended: none.
- Pinned dispositions / non-goals: `query_site` is deliberately omitted on the
  boundary-constructed path (not derivable from a `QueryError`; optional in the
  `RuntimeEvent` shape — no fabricated site); the fresh `invocation_id` /
  `occurred_at` and top-level `theta` on an invoke cascade are inside the
  adjudication's verbatim field list, accepted consequences of the single
  constructed emission, restored automatically once the forward hook is fed.

## Provenance

Spec read: `slash-invocation.md:63`, `diagnostic-shape.md:20`,
`pi-integration-contract/runtime-event-channel.md` (RuntimeEvent shape,
group-A routing, success-side null-policy). Implementation read:
`src/extension/production-theta-producer.ts:1602–1616, 650–654, 1140–1151,
1375–1398, 1570–1590`; `src/runtime/runtime-event-channel.ts:230–247`;
`src/runtime/query-discard.ts:200–228`; `src/extension/factory.ts:640–716`;
`src/runtime/slash-dispatch.ts:180–190`;
`src/extension/theta-composition-producer.ts:545–560`. Prior bugs read in
full: 0088 (same emitter, chain half), 0355 (avoided mechanism). Greps quoted
in §Reproduction, run at `9474dfa8`.
