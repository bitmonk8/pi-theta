# Bug 0352 — A depth-6+ payload on the initial forced respond turn terminates the typed query with `attempts: 0` and never opens respond-repair: `runTypedQueryLoop`'s depth arm returns immediately, where schema-subset.md row #1 grants respond-repair to depth violations and the AJV / ERR-17 arms of the same loop do enter it

- **Status:** fixed (0.362.0).
- **Sev/Diff estimate:** S2/D2 — S2 because the surfaced `Err` is loud and
  correctly shaped (`validation`/`schema_validation`, `maxDepth` issue) but
  the documented recovery mechanism is silently withheld for exactly one
  failure class: with `respond_repair.attempts: 3` configured, a depth breach
  on the initial forced respond returns terminally with `attempts: 0`, zero
  follow-up turns issued — the model never sees the `validator_error`
  follow-up carrying the canonical depth issue it could correct, and the
  `attempts` field misreports the budget as unconsumed rather than
  ungranted. The sibling failure classes in the same dispatch (AJV
  non-conformance, ERR-17 non-compliance) both enter repair. D2 because the
  fix routes the depth failure into the existing `ValidationFailure`
  `schema_validation` channel (the depth issue is already a
  `ValidationIssue`), with the worked-example fixture
  (`respond_repair: { attempts: 0 }`) unaffected, but [bug 0353](./0353-followup-respond-payload-never-depth-walked.md)
  (the follow-up depth-walk gap) must land with it or a repaired follow-up's
  own depth breach is invisible.
- **Kind:** implementation defect against a normative sentence. Not a spec
  ambiguity: `docs/spec_topics/schema-subset.md:59` states "Because depth
  violations are `validation` failures, typed-query respond-repair follow-ups
  apply per [Query — Schema-validation respond-repair] at the typed-query
  response boundary (row #1)". CIO-3
  (`docs/spec_topics/hard-ceilings/ceilings-3-and-4.md`) installs the depth
  walk as "the first sub-check at every AJV validation boundary … the
  depth-walk runs *before* AJV at the same site" — the repair leg re-validates
  at the same typed-query response boundary.
- **Related:**
  - `docs/spec_topics/schema-subset.md:59` — the sentence violated (row #1
    of the Depth Enforcement table; the same line also pins candidate
    merged/qer-03).
  - `query-failure-and-repair.md` QRY-22 — "A response that does not conform
    MUST be routed through the respond-repair loop above (QRY-11)"; the
    respond-tool wire-schema section pins the depth walk and AJV as the two
    sub-checks of one validation boundary ("both run over the payload
    against the lowered schema").
  - `query-tool-loop.md` worked example (depth-6 co-fire) — expects
    `attempts: 0` only because its fixture sets
    `respond_repair: { attempts: 0 }`; it does not license the bypass for a
    non-zero budget.
  - Internal asymmetry: the ON-SESSION early-respond path already treats a
    depth breach as model-repairable — `#executeRespondTool`
    (`src/extension/production-theta-producer.ts:3297–3328`) feeds the
    breach back as an in-turn tool-error result and the model may retry;
    only the off-session forced dispatch's payload reaches the terminating
    depth arm.
  - [0066](./0066-ajv-verdict-discarded-unreachable-enforcement.md) — fixed
    (0.88.0). The row-#4 sibling: a ceiling-#4 enforcement point (slash-load
    `params`) missing entirely in production; here the row-#1 site exists but
    only for the initial payload's validation, not its repair routing.
  - [0187](./0187-untyped-subagent-return-boundary-no-depth-ceiling.md) —
    fixed (0.116.0). The untyped-return boundary depth hole; same impact
    family (a depth-capped boundary crossed unchecked), different site.
  - [bug 0353](./0353-followup-respond-payload-never-depth-walked.md) — the same row's follow-up half: repair follow-up
    payloads are never depth-walked. One row-#1 story: the initial turn
    walks-but-never-repairs; the follow-up repairs-but-never-walks. Must land
    together.
  - [bug 0355](./0355-repair-terminal-masked-parent-slot-count.md) — the `masked` predicate on the repair-terminal
    events reads the parent's slot count; independent mechanism, shared seam.
  - Merge provenance: this report absorbs the initial-leg half of a
    retired hard-ceilings-area report from the same hunt (independent offline
    confirmation, CIO-3/PIC-1 framing, worked-example control).
- **Affected** (verified at `af476df2`):
  - `src/runtime/query-tool-loop.ts:663–706` — the depth arm:
    `const walk = depthWalk(forced.payload); if (!walk.ok) { … return { kind:
    "validation", error, event, … } }` with `attempts: 0` hardcoded, before
    and instead of any `schemaValidation.runRespondRepair(...)` call. The
    ERR-17 non-compliance arm (`:620–640`) and the AJV arm (`:711–738`) of
    the same function both route through `runRespondRepair`.
  - `src/runtime/query-respond-repair.ts:201–` — `runRespondRepairLoop`,
    the loop the depth arm never reaches; its `ValidationFailure` opener
    type already admits a `schema_validation` failure carrying arbitrary
    `ValidationIssue` entries (a `maxDepth` issue fits without widening).
    Once opened, the loop's `validated` arm (`:231–235`) binds the follow-up
    value with nothing downstream re-walking it — which is why this fix must
    land with [bug 0353](./0353-followup-respond-payload-never-depth-walked.md).
  - Repair-leg reachability (context for the land-together constraint): a
    repair attempt's fresh forced-respond payload is extracted off the
    provider reply with no walk
    (`src/extension/production-theta-producer.ts:6573`,
    `respondPayloadFromWire` inside the forced dispatch) and
    `mapForcedTurnToRepairOutcome` (`:5551–5573`) hands it to the follow-up
    validation arm [bug 0353](./0353-followup-respond-payload-never-depth-walked.md) covers.
- **Observed at:** v0.347.0 (`af476df2`) — LIVE (H8a harness,
  claude-sonnet-5, prompt mode, 2 runs, deterministic) and offline on the
  production seams.

## Symptom

Live fixture: `tool_loop.max_rounds: 0`, `respond_repair.attempts: 3`,
`@<{ a: { b: string }, note: string }>` whose query text instructs the model
to set `a` to the over-deep real JSON object
`{"b":{"c":{"d":{"e":{"f":"x"}}}}}` (depth 7 with the payload root). The
theta encodes the outcome via the bug-0327 index-OOB panic-key technique:

```theta
let code = match r {
  Err(QueryError { kind: "validation", attempts }) => 200 + attempts,
  Err(e) => 190,
  Ok(_) => 180,
  _ => 170,
}
let xs = [0]
xs[code]
```

Observed `theta-system-note` (2 independent runs, byte-identical):

```
theta /qdepth2 aborted: index out of bounds: 200 not in 0..1
```

`200` = `kind: "validation"` with `attempts: 0`. A repair-entering loop
would produce `203` (exhaustion after 3 re-validated follow-ups), `180`/`170`
(a follow-up corrected the payload and it bound). `userTexts` for the drive
is empty — no follow-up turn was issued on any surface.

Offline (production seams — `parseThetaDocument` →
`lowerQueryResponseSchema` → real `AjvSchemaValidator` →
`buildTypedQueryValidation` → `runTypedQueryLoop`, the
`tests/e2e-s3-typed-query-conformance.test.ts` harness pattern): a depth-7
initial payload with `attempts: 3` returns
`{ kind: "validation", attempts: 0, issues: [{ path: "/a/b/c/d/e", message:
"JSON document depth exceeds 5", schema_keyword: "maxDepth" }] }` with the
`driveFollowUp` spy at 0 calls; the control (AJV type failure, same
harness) drives 2 follow-ups and binds the corrected value.

Worked-example control (proves the probe distinguishes pass from fail, and
that the initial-site enforcement itself is conformant): the same depth-6
document as the initial payload with `respond_repair: { attempts: 0 }` and
`slot_count == max_rounds` surfaces exactly the spec's worked-example shape —
`Err(validation/maxDepth, attempts: 0)` and the `RuntimeEvent` with
`masked: ["ceiling#2"]`.

## Expected

`schema-subset.md:59`: respond-repair follow-ups apply at row #1 for depth
violations. With `attempts: 3`, the first depth breach opens the loop: a
`validator_error` follow-up carrying the canonical
`/a/b/c/d/e JSON document depth exceeds 5` in `<ajv-summary>` (the
QRY-12 renderer already renders any `ValidationIssue`), one slot debited per
re-validated follow-up, terminal exhaustion `attempts: 3`.

## Actual / mechanism

`runTypedQueryLoop` evaluates the depth walk OUTSIDE the validation
collaborator: the walk runs before `schemaValidation.validate(...)` and its
failure returns the terminal `validation` outcome directly, so
`runRespondRepair` — invoked by both sibling failure arms — is unreachable
for the `maxDepth` class. The `attempts: 0` literal is baked into the arm.
CIO-3's walk-before-AJV placement licenses the walk's position, not the
terminal return: the AJV arm at the same boundary routes into repair.

## Impact

Impact class 3–4: a documented recovery contract silently withheld per
failure class; `ValidationError.attempts` misreports (the field is defined
as "respond-repair follow-ups made before giving up" — none were *made*
because none were *granted*). Live divergence between the two arrival paths
of the same breach (in-turn tool-error feedback on the on-session early
respond vs. terminal abort on the off-session forced dispatch). PIC-1 (d)'s
follow-up clause presupposes surfaced follow-up depth events this bypass
(together with the gap in [bug 0353](./0353-followup-respond-payload-never-depth-walked.md)) makes unproducible.

## Reproduction

Live: the fixture above (~2 s, one off-session forced turn; the model emits
the over-deep object reliably when the field position is object-typed —
2/2 runs). Offline: the seam probe above (deterministic), plus the
worked-example control.

## Fix sketch

Replace the depth arm's direct return with the same routing the AJV arm
uses: build `ValidationFailure { kind: "schema_validation", issues:
[walk.issue], raw_response: JSON.stringify(forced.payload) }` and call
`schemaValidation.runRespondRepair(failure)` when the collaborator is
present (falling back to the current terminal shape when absent —
mirroring the non-compliance arm's split).

Constraints:

1. Must land with [bug 0353](./0353-followup-respond-payload-never-depth-walked.md) so the follow-up re-walk exists;
   without it, this change routes depth breaches into a repair loop that
   cannot re-check depth.
2. Keep the `masked` co-fire event computation on the terminal outcome, and
   do not hardcode the parent's `slotCountAtDispatch` into any new event
   builds — the repair-terminal `masked` input is candidate
   hard-ceilings/03's subject (PIC-1 (d): the predicate reads the surfacing
   follow-up's own slot count).
3. The worked-example fixture (`respond_repair: { attempts: 0 }`) stays
   byte-identical: `runRespondRepairLoop`'s `none`/`0` early terminal
   (`query-respond-repair.ts:211–212`) already returns `attempts: 0` with
   the opening failure's issue.

## Fix (0.362.0)

- What shipped: `src/runtime/query-tool-loop.ts` — `runTypedQueryLoop`'s
  depth arm (`if (!walk.ok)`) now routes an initial forced-respond depth
  breach into `schemaValidation.runRespondRepair({ kind: "schema_validation",
  issues: [walk.issue], raw_response: JSON.stringify(forced.payload) })` when
  the collaborator is present — the same machinery the AJV and ERR-17 arms of
  the same function use — switching on `repair.kind` (value → bind; validation
  → `buildValidationEvent(config, repair.error, slotCountAtDispatch)` terminal;
  propagated → propagate). With no collaborator the arm falls back to the
  prior terminal depth shape byte-identically (mirroring the noncompliance
  arm's split). §Fix sketch implemented verbatim; constraints 1–3 honoured
  (co-lands with bug 0353; no new `masked`/slot-count plumbing — bug 0355's
  seam untouched; the `attempts: 0` path stays terminal via
  `runRespondRepairLoop`'s none/0 early terminal).
- Gates: witness `npx vitest run
  tests/b0352-initial-depth-breach-opens-repair.test.ts` → 6/6 green (A
  recovery binds Ok(recovered), B exhaustion attempts:3 + maxDepth issue, C
  AJV-arm control, D ERR-17-arm control, E attempts:0 no-over-fire control);
  full default suite `npx vitest run` → 533 files / 10041 tests green;
  `npm run typecheck` exit 0; `npm run lint` exit 0.
- Review: 1 round — `bug-fix-reviewer` CLEAN (no
  correctness/fidelity/spec/house-rule/test/prose finding; verified fidelity
  to §Fix sketch + constraints 1–3, fallback byte-identity vs HEAD, exhaustive
  `repair.kind` switch, witness reds-at-HEAD by construction, C/D/E as real
  controls). Converged at round 1; no fixer round warranted.
- Verification: `bug-fix-verifier` SOLID — (1) witness revert→red (Cell A
  kind=validation/attempts:0 where value expected; Cell B attempts=0 where 3),
  byte-exact restore (`git diff` shows only the +37-line fix hunk),
  restore→6/6 green; (2) full default suite 533/10041 green; (3) live
  discharged (below); (4) `npm run lint` + `npm run typecheck` exit 0.
- Live: the orchestrator ran the adjacent typed-query response-boundary cell
  `tests/live/acceptance/b0351live-value-position-query-success-binds.test.ts`
  under the live lock → GREEN (12.6s, real `pi -p`, `@<{ code: integer }>`
  binds Ok(42)→142), witnessing no over-fire on a legal typed-query
  response-boundary drive adjacent to the fixed depth arm. A bespoke 2-turn
  depth-repair live witness is model-stochastic across two turns (bug 0353's
  recorded rationale, reused), so the adjacent cell stands with recorded WHY.
- Residuals:
  1. Collaborator-present `attempts: 0` depth terminal: its top-level
     `message` homogenises from `DEPTH_VIOLATION_MESSAGE` ("JSON document
     depth exceeds 5") to `SCHEMA_VALIDATION_TERMINAL_MESSAGE` ("typed query
     response failed schema validation"), because the arm routes through
     `runRespondRepairLoop`'s none/0 early terminal (`terminalValidationError`).
     The canonical depth text is preserved on the *issue*
     (`validation_errors[0]`); `attempts`/`cause`/`raw_response`/`masked` are
     byte-identical, making the depth class consistent with the AJV class at
     the same boundary. No committed or live test pins the old top-level
     literal on this path (full suite green). §Fix constraint 3's
     "byte-identical" overstates only this one field; the no-collaborator
     worked-example control (query-tool-loop.test.ts QRY-16 co-fire) is fully
     byte-identical (fallback path).
  2. No witness cell drives `repair.kind === "propagated"` through the depth
     opener — parity with the AJV/ERR-17 arms (no such per-opener cell
     either); propagation is owned and tested at the shared
     `runRespondRepairLoop` (`non_validation`). Not a regression.
  3. Citation shift: the +37-line insertion moves `query-tool-loop.ts` line
     numbers below the depth arm (e.g. the AJV guard 711→745,
     `buildValidationEvent` def 753→790). Stale `query-tool-loop.ts:NNN`
     citations exist in unowned closed/sibling bug docs (0052, 0066, 0120,
     0159, 0172, 0202, 0327, 0355) and two test comments
     (inbound-boundary-typed-query.test.ts,
     invoke-depth-wire-form-metric.test.ts). NOT corrected: already stale
     since af476df2, closed docs are era-pinned, and sibling/other-bug files
     are not owned by this bug; the campaign re-derives citations by symbol
     at merge.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the repair-terminal `masked` slot-count
  input (bug 0355), the in-turn early-respond depth feedback
  (`#executeRespondTool`), and the CIO-3 initial-payload depth-walk position
  are non-goals — left unchanged. The co-landed bug 0353 depthWalk choke in
  `src/runtime/typed-query-validation.ts` is sanctioned in-tree and untouched.
