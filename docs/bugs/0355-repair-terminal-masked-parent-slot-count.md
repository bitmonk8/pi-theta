# Bug 0355 — The terminal repair-validation `RuntimeEvent` computes `masked` from the PARENT query's slot-count-at-dispatch: a validation error originating on a respond-repair follow-up (fresh `tool_loop` budget, own slot count 0) is emitted with `masked: ["ceiling#2"]` whenever the parent's free phase had exhausted and at least one repair follow-up ran (`attempts ≥ 1`), where PIC-1 (d) says the predicate is evaluated against the follow-up's own slot count

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — S3 because the wrong bytes are confined to
  the operator-facing `RuntimeEvent`'s `masked` field (diagnostics that lie
  about a co-fire; the `Err` itself, its issues, and `attempts` are correct,
  and no wrong value binds), but the field is the ONLY V1 co-fire signal and
  PIC-1 pins it falsifiable-by-stream-comparison — a conformance fixture
  driving this exact shape reads a co-fire that did not occur. D2 because the
  repair seam carries no slot-count channel today (`FollowUpRespondOutcome`
  has no slot field; the legacy string arm has no turn metadata at all), so
  the fix either threads the follow-up's own post-increment slot count through
  `driveFollowUp` → `runRespondRepairLoop` → the terminal outcome, or pins the
  repair-terminal event to omit `masked` — an adjudication between PIC-1 (d)'s
  two-scalar read and a seam widening.
- **Kind:** defect — the V1 reachable predicate (`computeMasked`) is
  implemented correctly as a function, and is fed the wrong scalar at the
  repair-terminal call sites.
- **Related:**
  - [bug 0352](./0352-initial-depth-breach-bypasses-repair.md) and [bug 0353](./0353-followup-respond-payload-never-depth-walked.md) — the depth-arm
    repair bypass and the missing follow-up depth walk on the same repair
    seam. Independent mechanism: those are about breaches not routing/not
    being walked; this is about the event builder mis-attributing the
    surfacing turn's slot count when a terminal validation error IS
    surfaced. Fixing [bug 0353](./0353-followup-respond-payload-never-depth-walked.md) makes this reachable for
    depth-6 follow-ups too (today it fires on plain AJV terminal failures).
  - 0066 — fixed (0.88.0). Its element 3 was the previous masked-over-fire
    (constant `satisfied` set at the slash-load site); this is the runtime
    sibling (right predicate, wrong input).
- **Affected** (verified at `af476df2`, v0.347.0):
  - `src/runtime/query-tool-loop.ts:582` — `slotCountAtDispatch` captured once,
    at the PARENT query's forced-respond dispatch.
  - `src/runtime/query-tool-loop.ts:635` and `:726` — the two repair-terminal
    event builds: `buildValidationEvent(config, repair.error, slotCountAtDispatch)`
    (noncompliance-opened and AJV-opened repair respectively). `repair.error`
    carries the FINAL attempt's issues (`terminalValidationError` doc comment,
    `query-respond-repair.ts:276–279`: "carries only the given (final)
    failure's issue(s)"), i.e. when `attempts ≥ 1` the event describes a
    failure raised on a follow-up's turn.
  - `src/runtime/query-tool-loop.ts:753–780` — `buildValidationEvent`:
    hardcodes `turnKind: "forced_respond"`, `atTypedQueryResponse: true`, and
    `toolLoopSlotCount: slotCountAtDispatch` (the parent's).
  - `src/runtime/runtime-event-channel.ts:113–145` — `computeMasked`, the
    PIC-1 (c)/(d) predicate; correct in itself.
  - `src/runtime/typed-query-validation.ts:104–113` (`FollowUpRespondOutcome`)
    and `query-respond-repair.ts:162–165` (`RespondRepairOutcome`) — no slot
    count crosses the seam, so the correct input is structurally unavailable
    at the event-build sites.
- **Observed at:** `0.347.0` (`af476df2`). Offline; scratch vitest through the
  real `runTypedQueryLoop` + `buildTypedQueryValidation` + real AJV, scripted
  driver.

## Summary

PIC-1 (d) pins the only V1-reachable non-empty `masked`: `["ceiling#2"]` on a
`validation` event raised at the typed-query response boundary on a forced
respond turn whose post-increment slot count equals `max_rounds` — and, for
events raised on a respond-repair follow-up, "the predicate is evaluated
against the follow-up's own slot count, not the parent query's" (each
follow-up gets a fresh `tool_loop` budget). The implementation evaluates the
predicate at repair-terminal sites with the parent's `slotCountAtDispatch`.
Whenever the parent's free phase used all `max_rounds` slots and repair then
terminates with a validation error after at least one follow-up ran
(`attempts ≥ 1`), the emitted event carries `masked: ["ceiling#2"]` although
the surfaced failure originated on a follow-up whose own budget was fresh
(slot count 0 in the probe below). The claim is confined to `attempts ≥ 1`:
at `respond_repair` `none`/`0` (and on any terminal whose `error.attempts`
is 0) no follow-up ran, the surfaced failure is the parent's own, and the
parent's `slotCountAtDispatch` is the correct scalar — `masked` is
conformant there. The terminal `error.attempts` value discriminates the two
cases at the call sites.

## Reproduction

Scratch vitest at `af476df2` (run and deleted). The fixture exercises the
defect's domain, `attempts ≥ 1`: one repair follow-up runs and is the
surfaced failure's origin. Schema
`Deep { a: array<array<array<array<string>>>> }`, `tool_loop.max_rounds: 2`,
`respond_repair.attempts: 1`. Scripted driver: two free-phase `tool_use`
rounds (slot count reaches 2 = `max_rounds`, so the forced respond turn is
dispatched by CIO-4's `max_rounds`-final branch), initial forced-respond
payload `{"a": 42}` (AJV-invalid, depth-OK), one follow-up returning
`{"a": "still wrong"}` (AJV-invalid, depth-OK; the follow-up ran zero
free-phase rounds of its own):

```
(C) outcome.kind = validation
(C) event = {"kind":"validation","theta":"/deep","invocation_id":"inv-scratch",
    "query_site":{"file":"deep.theta","line":1,"column":1},
    "message":"typed query response failed schema validation",
    "attempts":1,"occurred_at":0,"masked":["ceiling#2"]}
(C) error.attempts = 1
(C) followUpCalls = 1
```

`masked: ["ceiling#2"]` is present. The failure the event describes
(`attempts: 1`, the final attempt's issue) originated on the follow-up, whose
own slot count is 0 (< `max_rounds`), so per PIC-1 (d) `masked` must be
omitted.

Control (both directions): the same fixture with the depth-6 payload on the
INITIAL forced respond turn (no repair) emits `masked: ["ceiling#2"]` exactly
per the spec's worked example (parent slot count 2 = 2 — correct), and probe
(A) of the same scratch file shows `masked` omitted at `max_rounds: 0`
(the `maxRounds > 0` guard) — the predicate itself discriminates correctly
when fed the right scalars.

## Expected behaviour

`docs/spec_topics/pi-integration-contract/runtime-event-channel.md:114`,
PIC-1 (d): "`masked` carries `["ceiling#2"]` *if and only if* the surfaced
event was raised on a forced respond turn whose origin round, after CIO-4's
slot increment for the just-completed free-phase round, leaves the `tool_loop`
slot count equal to `max_rounds` … In every other event — **including a
respond-repair follow-up's depth-6 forced respond turn (each follow-up gets a
fresh `tool_loop` budget per [Query — Tool-call loop bound], so the predicate
is evaluated against the follow-up's own slot count, not the parent
query's)** … `masked` is omitted."

`docs/spec_topics/query/query-tool-loop.md:103` (worked example): "On a
respond-repair follow-up of the same query, the predicate is re-evaluated
against the follow-up's *fresh* `tool_loop` budget …, not the parent query's
exhausted budget."

Expected for the reproduction: the terminal event omits `masked` (the
follow-up's own slot count 0 ≠ 2). Symmetrically, a follow-up that itself ran
`max_rounds` free-phase rounds before ITS forced respond turn and then failed
validation should carry `["ceiling#2"]` — also impossible at HEAD, since no
follow-up slot count exists to read.

## Actual behaviour / root cause

`buildValidationEvent` (`query-tool-loop.ts:749–780`) is the single event
builder for all terminal typed-query validation errors, and its
`toolLoopSlotCount` input is the parent-scope `slotCountAtDispatch` captured
at `:582` before the INITIAL forced respond dispatch. The two repair-terminal
call sites (`:635`, `:726`) reuse it although the error they surface is the
final follow-up's. The repair seam cannot supply the right value: the
follow-up drives ride `driveFollowUp` → `FollowUpRespondOutcome`
(`typed-query-validation.ts:110–116`), which carries payload / noncompliance
only; `RespondRepairOutcome`'s `validation` arm (`query-respond-repair.ts:164`)
carries only the `ValidationError`. The production two-phase-restart drive
(`driveRepairAttempt`, `production-theta-producer.ts:4991`) internally runs a
fresh governor budget but discards its slot count before returning.

The pure-read MUST (PIC-1 (e)) is not violated — the predicate causes no
emission — but the emitted stream differs from a conforming implementation's
on the same failure, which is exactly the falsifiable observable PIC-1 (e)
defines conformance by.

## Why it matters

1. The `masked` field is theta 1.0's only cross-ceiling co-fire signal, and
   PIC-1 pins its semantics tightly enough to be conformance-tested by stream
   comparison. At HEAD the field affirms "ceiling #2's precondition was also
   satisfied at this check site" for events whose own frame had a fresh,
   unexhausted budget — a co-fire that did not occur.
2. The over-fire is systematic, not marginal: ANY typed query that exhausts
   its free phase, fails validation, and exhausts repair emits it (parent
   `slotCountAtDispatch == max_rounds` is precisely the common
   worked-hard-then-failed shape).
3. The under-fire direction is also unreachable (a follow-up that itself
   exhausts its fresh budget cannot be marked), so both halves of PIC-1 (d)'s
   follow-up clause are unimplemented — the clause is untestable at HEAD.
4. Consumers PIC-1 (g) contemplates (dedup on the tuple, masked excluded)
   are unaffected, but any consumer keying alerts or triage on
   `masked: ["ceiling#2"]` ("the model was also out of rounds") reads a lie.

## Non-goals

- **The initial-payload co-fire** (parent forced respond at
  `slot_count == max_rounds`) — conformant, the worked example's shape;
  control above.
- **`computeMasked` itself** — correct predicate over its inputs, including
  the `maxRounds > 0` guard; only the input sourcing at repair-terminal sites
  is at issue.
- **The `masked` wire location, verbatim-copy (f), and dedup (g) clauses** —
  not probed here; `cascadeReemit` / `dedupKey` read conformant.
- **The missing depth walk on the repair leg and the initial depth arm's
  repair bypass** — [bug 0353](./0353-followup-respond-payload-never-depth-walked.md) and [bug 0352](./0352-initial-depth-breach-bypasses-repair.md).

## Fix

Not yet decided; constraints:

1. Whichever route is taken, the repair-terminal event's `masked` must be
   derivable from the FOLLOW-UP's own two scalars (post-increment slot count,
   surfacing turn kind) per PIC-1 (d) — either by widening the repair seam
   (`FollowUpRespondOutcome` / `RespondRepairOutcome.validation` gaining the
   attempt's slot count and turn kind) and threading it into
   `buildValidationEvent`, or by an adjudicated spec-side simplification (not
   preferred: PIC-1 (d) is explicit and normative about the follow-up read).
2. The parent-initial sites (`:655`, the depth arm at `:683`, and any
   validation error genuinely raised on the parent's forced respond turn)
   keep the parent's `slotCountAtDispatch`.
2a. Scope: only terminals whose `error.attempts ≥ 1` (a follow-up ran and is
   the surfaced failure's origin) change sourcing; the `none`/`0` early
   terminal (`query-respond-repair.ts:211–212`, `attempts: 0`) keeps the
   parent scalar — `error.attempts` discriminates at the call sites.
3. The pure-read MUST (e) holds: no second emission, no payload change beyond
   `masked` itself.
4. Witnesses: the reproduction reds at HEAD (masked present) and greens after
   (masked absent); the worked-example control stays green; a follow-up that
   itself exhausts its fresh budget then fails validation carries
   `["ceiling#2"]` — the under-fire direction. That last witness cannot red
   at HEAD (no follow-up slot count exists to read until the seam is
   widened); it is a post-fix-only witness, pinned green after the fix.

## Provenance

- Hunt area: hard-ceilings (masked-set obligations; seed 2).
- Spec measured against:
  `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:96–124`
  (PIC-1 (a)–(g), esp. (d)); `docs/spec_topics/query/query-tool-loop.md:50–103`
  (worked example + follow-up re-evaluation sentence);
  `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` CIO-4 / CIO-6 and
  §`masked` field.
- Implementation read at `af476df2`: `src/runtime/query-tool-loop.ts:474,
  560–780`; `src/runtime/runtime-event-channel.ts:95–180`;
  `src/runtime/typed-query-validation.ts:83–316`;
  `src/runtime/query-respond-repair.ts:150–276`;
  `src/extension/production-theta-producer.ts:4983–5110, 5552–5576`.
- Probe: `tests/scratch-ceil4-repair-leg.test.ts` case (C) (run at
  `af476df2`, deleted); output quoted verbatim above, with the initial-site
  control (masked correctly present) and the `max_rounds: 0` control (masked
  correctly absent) in the same run.
