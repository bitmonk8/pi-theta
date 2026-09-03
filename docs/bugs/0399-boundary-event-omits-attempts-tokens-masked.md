# Bug 0399 — The SLSH-4 note's boundary-constructed `RuntimeEvent` omits the shape-pinned `attempts` / `tokens_used` / `masked` fields: SNK-a renders `<n>` in `content` while `details.event.attempts` is absent, and the origin-side validation event that 0355's fix taught to compute `masked` (`TypedQueryOutcome.validation.event`) is built and dropped with no consumer

- **Status:** fixed (0.393.0).
- **Kind:** defect — the emission 0383 established as "the origin emission of
  record" for this path omits fields the `RuntimeEvent` shape pins as
  populated for exactly these events, all derivable at the construction site;
  plus a dead-value seam (the typed-query loop's constructed origin event has
  no reader).
- **Related:**
  - [0383](./0383-slsh4-note-details-event-empty.md) (fixed 0.360.0) —
    established the boundary construction. Its §Pinned dispositions
    adjudicated ONLY fresh `invocation_id`/`occurred_at`/`theta` and the
    omitted `query_site` as accepted consequences; `attempts`, `tokens_used`,
    and `masked` are NOT in that adjudicated list — this report claims only
    the unadjudicated fields. Its §Residuals 1 records the wider origin-site
    always-log surface (no `topLevelCascade: true` caller) as a follow-up
    candidate and names the `event?` forward hook as the threading seam —
    the hook this report shows is unfed on every real path.
  - [0355](./0355-repair-terminal-masked-parent-slot-count.md) (fixed
    0.365.0) — its §Fix made `buildValidationEvent` compute `masked` from
    the follow-up's own slot count. This report is its boundary complement:
    the corrected event is returned on `TypedQueryOutcome` and read by
    nobody, so the corrected `masked` (and `query_site`, and the real
    `occurred_at`) never reach the one user-visible emission. Its §Residuals
    1 ("No live/E2E test drives a respond-repair follow-up terminal and
    inspects `RuntimeEvent.masked` end-to-end through a real host") is this
    same mechanism seen from the test side — there is no production consumer
    of the corrected event on any `display: true` path to witness.
  - Candidates notes-structured-3/01 and notes-structured-3/05 — the
    `{ event: {} }` siblings (blast-radius context); their sites partition
    0383 §Residuals 2, while this report's site is the note 0383 itself
    fixed. Disjoint fix surfaces, no merge.
  - 0065/0182 (fixed) — made `ContextOverflowError.tokens_used` populated on
    real overflows; the note-side event now drops it.
- **Affected** (verified at `d63c5148`, v0.382.0):
  - `src/extension/production-theta-producer.ts:1634–1651` —
    `emitTopLevelErrNote`'s boundary construction: `kind`, `theta`,
    `invocation_id`, `message`, `occurred_at` only; no `attempts` /
    `tokens_used` / `masked` arm, though the leaf is in scope and carries them.
  - `src/runtime/query-discard.ts:171–196` — `buildDiscardEvent`, the sibling
    path's builder, which DOES preserve `attempts` and `tokens_used` from the
    same variants ("preserve the discarded `Err`'s … `attempts` (validation) /
    `tokens_used` (context_overflow)"): the `display: false` operator channel
    is richer than the `display: true` user-facing one for the same error.
  - `src/runtime/query-tool-loop.ts:248, 641, 661, 697, 772, 808–840` — the
    `validation` outcome's `event: RuntimeEvent` member and its four
    `buildValidationEvent` construction sites (real `query_site`, real
    `occurred_at`, `attempts`, 0355-corrected `masked`).
  - `src/runtime/effectful-statement-host.ts:278–283` — the only consumer of
    the typed-loop outcome: `case "validation": … return { ok: false, error:
    outcome.error }` — `outcome.event` dropped.
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:76–78`
    — the shape: `attempts?` "populated for `validation` events on
    respond-repair exhaustion; absent otherwise"; `tokens_used?` "populated
    for `context_overflow` events when the provider supplies the count";
    `masked?` per PIC-1.
  - `runtime-event-channel.md:114, 120` — PIC-1 (d): on a `validation` event
    at the typed-query response boundary the reachable mask is
    `["ceiling#2"]`; (f): a boundary re-emission MUST carry the origin's
    `masked` verbatim, "re-deriving `masked` at the boundary site is
    forbidden — the originating site is the only authoritative source".
  - `docs/spec_topics/slash-invocation.md:63` — the note's event is "the same
    value emitted at the originating failure site".
- **Observed at:** v0.382.0 (`d63c5148`). Offline, deterministic: probes P4/P5
  (deleted) through `createProductionProducerDeps` + capturing
  `pi.sendMessage`; dead-value claim by exhaustive grep (`outcome.event` /
  `.event` readers).

## Summary

0383's fix made the SLSH-4 note carry a real `RuntimeEvent`, constructed at
the boundary from the terminal `Err` leaf, and adjudicated the freshness of
`invocation_id`/`occurred_at`/`theta` plus the omission of `query_site` (not
derivable from a `QueryError`). Three pinned fields fall outside that
adjudication and are silently dropped even though they ARE derivable exactly
where the event is built:

- **`attempts`** — `ValidationError.attempts` is a required field on the leaf;
  the SNK-a `content` line interpolates it (`model failed schema after 3
  respond-repair attempts`) two statements earlier. The event omits it.
- **`tokens_used`** — `ContextOverflowError.tokens_used` is on the leaf when
  the provider supplied it (the very case the shape's comment names). Omitted.
- **`masked`** — PIC-1 (d)'s only reachable V1 co-fire lands on precisely this
  event class (validation at the typed-query response boundary). The origin
  side computes it — `buildValidationEvent` exists, was corrected by 0355, and
  attaches `masked`, `query_site`, `attempts`, and a real `occurred_at` to the
  event it returns on `TypedQueryOutcome.validation.event` — and that value
  has no reader: `effectful-statement-host.ts:278–283` forwards only
  `outcome.error`. So the sole user-visible emission both misses the mask and
  cannot obtain it without the origin threading; per PIC-1 (f) the boundary
  must not re-derive it.

The in-tree contrast makes the gap crisp: the QRY-20 discard path's
`buildDiscardEvent` preserves `attempts`/`tokens_used` from the same leaf
variants under a doc comment stating the rule. An author-discarded error
(`let _ =`, `display: false`) therefore ships a richer structured payload than
the same error cascading to the user-facing boundary (`display: true`).

## Reproduction

At `d63c5148`, offline (scratch probes, deleted):

1. `deps.emitTopLevelErrNote("demo", { kind: "validation", cause:
   "schema_validation", message: "model failed schema", attempts: 3,
   validation_errors: [...], raw_response: "{}" })` → captured note:
   `content` = `theta /demo returned Err: model failed schema after 3
   respond-repair attempts`; `details.event` =
   `{"kind":"validation","theta":"/demo","invocation_id":"inv-1",
   "message":"model failed schema","occurred_at":777}` — `attempts` absent,
   `masked` absent.
2. Same with a `context_overflow` leaf carrying `tokens_used: 220044,
   tokens_limit: 200000` → `details.event` has no `tokens_used`.
3. Dead value: `rg -n "outcome.event|\.event\b" src/` → the `validation`
   outcome's `event` member (`query-tool-loop.ts:248`) has no reader;
   `effectful-statement-host.ts:281–283` returns `outcome.error` only.

## Expected behaviour

- `runtime-event-channel.md:76–77` — `attempts` populated for validation
  events on respond-repair exhaustion; `tokens_used` populated for
  context_overflow events when the provider supplies the count. The shape
  comments are unconditional over the event class, not scoped to origin
  emissions.
- PIC-1 (c)/(d) (`:110–114`) — the validation event at the typed-query
  response boundary carries `["ceiling#2"]` when the predicate holds; (f)
  (`:120`) — a boundary emission carries the origin's `masked` verbatim and
  must not re-derive it.
- `slash-invocation.md:63` — the note's payload is "the same value emitted at
  the originating failure site"; for `validation` the origin-site value is
  constructed (`buildValidationEvent`) and discarded instead of threaded.

## Actual behaviour / root cause

`emitTopLevelErrNote`'s absent-event arm builds the minimal five-field event
and no caller supplies the `event?` forward hook. The typed-query loop already
constructs the conformant origin event for the validation class — with the
0355-corrected `masked` — but the outcome consumer drops it, so the forward
hook 0383 installed is never fed even on the one path where the origin value
exists today. `attempts`/`tokens_used` are additionally derivable at the
boundary itself (the leaf is in scope), exactly as `buildDiscardEvent` does on
the discard path.

## Why it matters

- The structured half of the user-visible failure note loses exactly the
  fields the spec singles out as event-class-specific payload; operator
  tooling reading `details.event.attempts` / `.tokens_used` gets absence on
  every top-level cascade while the SAME error discarded by the author yields
  them.
- The only reachable V1 `masked` co-fire — the signal PIC-1 exists for, and
  that two fix campaigns (0066, 0355) worked to make correct — is computed
  and then unobservable on the only `display: true` emission.
- `content` and `details` disagree about the same fact (`attempts` rendered
  in prose, absent in the payload) on one message.

## Non-goals

- Re-litigating 0383's adjudicated freshness set (`invocation_id`,
  `occurred_at`, `theta`, omitted `query_site` on the boundary-built path).
- The wider origin-site always-log emission surface for group-A kinds (0383
  §Residuals 1 — recorded there as a follow-up candidate; this report's
  dead-value half is the narrower, already-constructed `validation` event).
- The dedup-tuple mechanics (no origin emission exists to collapse against
  today).

## Fix

Not yet decided; constraints any fix must satisfy:

1. For `validation`: thread `TypedQueryOutcome.validation.event` through the
   `OperationResult` seam to `emitTopLevelErrNote`'s `event?` forward hook
   (the seam 0383 installed for exactly this), preserving `masked` verbatim
   per PIC-1 (f) (`runtime-event-channel.md:120`). PIC-1 (f) forbids
   re-deriving `masked` at the boundary: a fix that computes `masked` inside
   `emitTopLevelErrNote` is non-conformant even when the value comes out
   right — the originating site is the only authoritative source.
2. For the boundary-built arm (kinds with no constructed origin event):
   preserve `attempts`/`tokens_used` from the leaf exactly as
   `buildDiscardEvent` does (`"attempts" in error && typeof … === "number"`,
   `tokens_used` number-only so `null` stays canonically absent).
3. The two halves may split into separate commits: the boundary
   field-preservation arm (constraint 2) is mechanical
   (`buildDiscardEvent`-shaped, no seam change); the `outcome.event`
   threading (constraint 1) widens the `OperationResult` seam (D2). Filing
   is one report; the fix record adjudicates both halves.
4. Witness both directions: SNK-a note with `attempts: 3` →
   `details.event.attempts === 3`; overflow leaf with counts →
   `tokens_used` present, `null` overflow → absent; a repair-terminal
   validation cascade under the ceiling-#2 predicate → `masked:
   ["ceiling#2"]` on the note (red today: all absent).

## Fix (0.393.0)

- What shipped (both halves in ONE change; constraint 3's split declined):
  - `src/runtime/cancellation-core.ts` — `OperationResult`'s `{ ok: false }`
    arm gains an optional `event?: RuntimeEvent` (additive, mirrors the
    existing `childDiagnostics`) — the origin-event seam (§Fix 1).
  - `src/runtime/effectful-statement-host.ts` — the typed-loop `case
    "validation"` arm feeds `event: outcome.event` (the 0355-corrected origin
    event: masked, real query_site/occurred_at/attempts); the `propagated` arm
    is split off (carries no origin event of its own) (§Fix 1).
  - `src/runtime/statement-executor.ts` — the origin event rides every terminal
    `fail`-flow hop: `Flow`/`EvalResult` `fail` variants + `BodyExecution` gain
    optional `event?`/`originEvent?`; `terminalFlow`, the `OperationResult`→
    fail mint, the fail→fail lifts, and `executeBody`'s `fail` arm carry it
    (conditional spreads for `exactOptionalPropertyTypes`) (§Fix 1).
  - `src/extension/theta-composition-producer.ts` — the top-level boundary
    retains `execution` on the body path and passes `execution?.originEvent` as
    `emitTopLevelErrNote`'s 3rd (0383 `event?`) arg; the RFC-0006 `drive()`
    path passes nothing (no in-parent origin event) (§Fix 1).
  - `src/extension/production-theta-producer.ts` — `emitTopLevelErrNote`'s
    ABSENT-event (boundary-built) arm preserves `attempts` (validation) /
    `tokens_used` (context_overflow) from the leaf EXACTLY
    `buildDiscardEvent`-shaped (`"attempts" in leaf && typeof … === "number"`;
    `tokens_used` number-only so a `null` count stays canonically absent). A
    THREADED origin event is used VERBATIM (the `event ?? (…)` branch) — masked
    is never re-derived at the boundary (PIC-1 (f)) (§Fix 2).
  - `tests/b0399-boundary-event-attempts-tokens-masked.test.ts` — the witness
    (6 cells; §Fix 4). `tests/fixtures/diag2/asserted-code-not-in-registry-baseline.json`
    carries only the sibling 0397 `theta/b0397deep` fixture (a witness-comment
    false-positive `theta/…` span was removed by rewording to comma form, not
    baselined).
- Gates:
  - Witness: `npx vitest run tests/b0399-boundary-event-attempts-tokens-masked.test.ts`
    → 6 passed. RED at fork / on hand-revert (drop the validation-arm `event`
    feed + the attempts/tokens_used guards): the 3 discriminating cells red
    (`attempts`/`tokens_used`/`masked` undefined — the 5-field boundary event);
    the 3 controls (null-absent guard, byte-identity/freshness, 0355 origin
    anchor) stay green.
  - Full suite: `npx vitest run` → 558 files / 10320 tests passed (baseline
    557/10314 + the 6-cell witness).
  - `npm run typecheck` → clean. `npm run lint` → clean.
  - Live: `tests/live/err-note-render-record-error-field-live-cell.test.ts`
    passed — `emitTopLevelErrNote` through a REAL spawned subagent child (the
    exact surface 0399 modifies); adjacent-cell witness (0399 changes no drive
    outcome or `content` bytes — only the operator-channel structured half — so
    no new live cell was owed).
- Review: 1 round. Round 1 (`bug-fix-reviewer`, deep) — CLEAN, no
  correctness/fidelity/spec findings, no residuals. Verified: threading
  complete across every fail-flow hop; PIC-1 (f) verbatim (masked appears only
  in comments, never computed at the boundary; the note's event is the origin
  instance by reference); constraint 2 exactly `buildDiscardEvent`-shaped in the
  absent-event arm only; boundary wiring present and correct.
- Verification: SOLID (`bug-fix-verifier`). Witness reds on hand-revert (3
  discriminating cells, absent-field signature) and greens on byte-exact
  restore (`git hash-object` identical for both reverted files); full default
  suite 558/10320 green on the first unfiltered run; typecheck + lint clean;
  tree matches the owned set, `git stash` empty.
- Residuals:
  1. The `?`-propagation / value-ized `Err` paths (an `Err` bound as a value,
     then `?`-propagated or discarded) carry NO origin event — masked is absent
     on their boundary re-emission. This is the accepted scope boundary, not a
     violation: once an `Err` is an author-manipulable value no origin event
     can ride it, and PIC-1 (f) makes masked-absence the CONFORMANT output of a
     boundary reconstruction (re-derivation is forbidden). Constraint 2 still
     supplies `attempts`/`tokens_used` there from the leaf. The origin-event
     thread exists on the direct terminal `fail` cascade — the OperationResult
     seam §Fix 1 is defined over — which is where the doc's masked witness
     drives.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: 0383's adjudicated freshness set
  (`invocation_id`/`occurred_at`/`theta` fresh, `query_site` omitted on the
  boundary-BUILT arm) is UNCHANGED — this fix only ADDS `attempts`/`tokens_used`
  to that arm and THREADS the origin event (with masked) on the validation
  path. The user-facing `content` bytes and the `Err` drive outcome are
  unchanged for every input class.

## Provenance

Spec read: `pi-integration-contract/runtime-event-channel.md:63–130`,
`slash-invocation.md:33,63`. Implementation read:
`src/extension/production-theta-producer.ts:1620–1656`,
`src/runtime/query-tool-loop.ts:236–260, 580–840`,
`src/runtime/effectful-statement-host.ts:262–305`,
`src/runtime/query-discard.ts:150–228`, `src/runtime/query-error.ts:50–110`.
Prior bugs read in full: 0383 (§Fix, §Residuals, §Pinned dispositions), 0355
(§Fix), 0308. Probes P4/P5 run at `d63c5148` (scratch file deleted); dead-value
grep quoted in §Reproduction.
