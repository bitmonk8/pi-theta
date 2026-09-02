# Bug 0352 — A depth-6+ payload on the initial forced respond turn terminates the typed query with `attempts: 0` and never opens respond-repair: `runTypedQueryLoop`'s depth arm returns immediately, where schema-subset.md row #1 grants respond-repair to depth violations and the AJV / ERR-17 arms of the same loop do enter it

- **Status:** open.
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
