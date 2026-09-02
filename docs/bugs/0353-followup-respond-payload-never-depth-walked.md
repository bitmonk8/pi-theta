# Bug 0353 — Respond-repair follow-up payloads are never depth-walked: `nextFollowUp` validates with AJV alone, so a depth-6+ follow-up payload that conforms to the lowered schema (a permissive `{}` root, or a legal nested-array declaration) BINDS as the typed query's value (ceiling #4 bypassed), and under a closed root that rejects it the payload is AJV-rejected without the canonical `maxDepth` issue — where schema-subset.md pins "the depth walk re-runs on each follow-up's response"

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 because a JSON document deeper than the
  hard ceiling binds to theta code as a typed query's value on reachable
  paths: a follow-up payload is validated by AJV only, and any lowered schema
  whose conforming set contains depth-6 documents admits them. That includes
  ordinary closed declarations (`schema Deep { a:
  array<array<array<array<string>>>> }` — a legal, within-cap-satisfiable
  type; cell B3 below) as well as a permissive `{}` fragment reachable from a
  loadable theta (an imported schema name lowers to `{}` per the
  query-schema-lowering unresolved-name arm — bug 0028's pinned permissive
  disposition, with bug 0203 covering the junk-suffix arm; cell B1), so the
  S1 class does not depend on the permissive lowering. Ceiling #4's row-#1
  guarantee ("every breach surfaces with `schema_keyword: "maxDepth"`…") is
  structurally unenforced for every respond-repair follow-up; CIO-3 ("the
  depth-walk runs *before* AJV at the same site") is violated on the same
  turns — AJV runs unshielded over arbitrarily deep model documents. D2
  because the fix inserts the existing `depthWalk` ahead of both
  `validateAgainst` calls in `nextFollowUp` (payload arm and legacy text
  arm), lowering a breach to the `schema_validation` follow-up outcome so it
  debits a slot and re-enters repair per row-#1 semantics; coordination with
  [bug 0352](./0352-initial-depth-breach-bypasses-repair.md) (the initial turn's bypass) is required for a
  coherent row-#1 story.
- **Kind:** implementation defect against a normative sentence.
  `docs/spec_topics/schema-subset.md:59`: "…typed-query respond-repair
  follow-ups apply … at the typed-query response boundary (row #1); **the
  depth walk re-runs on each follow-up's response**."
- **Related:**
  - [bug 0352](./0352-initial-depth-breach-bypasses-repair.md) — the same row's initial-turn half: a depth
    breach on the initial forced respond bypasses repair. The two are one
    row-#1 story: the initial turn walks-but-never-repairs; the follow-up
    repairs-but-never-walks. Must land together.
  - [bug 0355](./0355-repair-terminal-masked-parent-slot-count.md) — the repair-terminal `masked` predicate reads
    the parent's slot count; independent mechanism, same seam. Fixing this
    bug makes that over-fire reachable for depth-6 follow-ups as well (today
    it fires on plain AJV terminal failures).
  - `hard-ceilings/ceilings-3-and-4.md` CIO-3 (anchor `#cio-3`) — depth-walk
    before AJV at every AJV validation boundary; the typed-query response
    boundary includes follow-up re-validations.
  - `pi-integration-contract/runtime-event-channel.md` PIC-1 (d) — its
    follow-up clause ("including a respond-repair follow-up's depth-6 forced
    respond turn … the predicate is evaluated against the follow-up's own
    slot count") describes an event the implementation can never emit (no
    follow-up depth violation is ever detected), so the clause is untestable
    at HEAD.
  - `query/query-tool-loop.md:103` — "On a respond-repair follow-up of the
    same query, the predicate is re-evaluated against the follow-up's *fresh*
    `tool_loop` budget …, not the parent query's exhausted budget" — likewise
    untestable at HEAD for the same reason.
  - `query-tool-loop.md` §Respond-tool wire schema — the `{}` residual root
    ("a root that constrains nothing") is a first-class lowered form;
    `src/runtime/query-schema-lowering.ts:20–62` enumerates its loadable
    origins (imported schema names in scope lower permissively — bug
    [0028](./0028-unresolved-annotation-silent-permissive-lowering.md), with
    [0203](./0203-query-annotation-junk-suppresses-unresolved-named-type.md)
    for the junk-suffix arm). 0028's fix also pinned the wire envelope:
    `respondPayloadFromWire` recovers the payload before the walk on the
    paths that do walk.
  - [0066](./0066-ajv-verdict-discarded-unreachable-enforcement.md) — fixed
    (0.88.0), the row-#4 sibling (slash-load `params` enforcement point
    missing). Its §Why it matters item 7 asserts "the other four CIO-3 sites
    are implemented and reachable, so a depth-6 document that reaches a query
    response, a tool-call argument, or an `invoke` boundary is still
    refused" — this bug falsifies that residual claim for the repair leg of
    the query-response site.
  - [0292](./0292-validation-errors-array-not-canonically-ordered.md) — fixed
    (0.333.0); the other bug that already edited this exact seam
    (`validateAgainst`, issue ordering). A fix here must keep its
    `orderValidationIssues` call intact.
- **Affected** (verified at `af476df2`):
  - `src/runtime/typed-query-validation.ts:241–312` — the production
    `RespondRepairDriver.nextFollowUp`: the two-phase-restart payload arm
    (`:271–289`, `validateAgainst` only) and the legacy text arm
    (`:293–311`, `parseStructuredPayload` → `validateAgainst` only). The
    module imports no `depthWalk`; `grep -n depthWalk
    src/runtime/typed-query-validation.ts` is empty.
  - `src/runtime/typed-query-validation.ts:319–343` — `validateAgainst`
    itself: AJV compile + validate only.
  - `src/runtime/query-tool-loop.ts:663` — the initial-turn depth walk, the
    only depth walk on the typed-query response boundary; follow-up payloads
    never pass through it (they arrive via
    `schemaValidation.runRespondRepair`, not via a re-entry of the loop).
    Corpus-wide: `rg -n "depthWalk\(" src/` → `depth-walk.ts:195` (the
    definition), `binder/defaulting.ts:154`, `query-tool-loop.ts:663`,
    `tool-call.ts:775` — nothing in `typed-query-validation.ts` or
    `query-respond-repair.ts`, and no site downstream of a typed-query value.
  - `src/extension/production-theta-producer.ts:4991` (`driveRepairAttempt`)
    — the live follow-up drive that delivers the fresh forced-respond payload
    into the un-walked arm: the forced dispatch extracts the payload off the
    provider reply with no walk (`:6573`, `respondPayloadFromWire`) and
    `mapForcedTurnToRepairOutcome` (`:5551–5573`) hands it to `nextFollowUp`
    as the `respond_outcome` payload.
- **Observed at:** v0.347.0 (`af476df2`), offline, deterministic, on the
  production pieces (`parseThetaDocument` → `lowerQueryResponseSchema` →
  real `AjvSchemaValidator` → `buildTypedQueryValidation` →
  `runTypedQueryLoop`, the `tests/e2e-s3-typed-query-conformance.test.ts`
  harness pattern; the follow-up scripted through the shipped
  `FollowUpRespondOutcome` payload arm). Live-reproducible-in-principle: the
  arm is exactly the one `driveRepairAttempt` feeds on a real repair attempt
  (live drives at this HEAD confirm models emit over-deep real objects at
  object-typed positions when instructed — [bug 0352](./0352-initial-depth-breach-bypasses-repair.md)'s
  fixture); a live witness needs an initial failure (e.g. ERR-17
  non-compliance or an AJV miss) followed by an instructed over-deep
  follow-up, which is model-stochastic across two turns and was not driven
  within this hunt's budget.

## Symptom (measured offline, production seams)

Cell B1 — permissive root: `lowered = lowerQueryResponseSchema(
"ImportedElsewhere", <decls without that name>)` → `{}` (the production
unresolved-name arm). Initial forced turn: ERR-17 non-compliance (opens
repair). Follow-up 1 delivers the depth-7 payload
`{"a":{"b":{"c":{"d":{"e":{"f":1}}}}}}` through the shipped
`respond_outcome`/`payload` arm. Observed:

```
outcome.kind === "value"
outcome.value === {"a":{"b":{"c":{"d":{"e":{"f":1}}}}}}   // depth 7, bound
```

A document ceiling #4 exists to refuse is the typed query's `Ok` value; no
`maxDepth` issue, no event, no note on any channel.

Cell B3 — closed root, ordinary declaration:
`schema Deep { a: array<array<array<array<string>>>> }` — a legal type with
both depth-5 (`{"a":[[[[]]]]}`) and depth-6 (`{"a":[[[["x"]]]]}`) conforming
members — lowered by the real `lowerQueryResponseSchema`. Initial payload
`{"a": 42}` (AJV-invalid, depth 2, opens repair), one follow-up returning
`{"a":[[[["x"]]]]}` (depth 6, conforms to the lowered schema). Observed:

```
outcome.kind === "value"
outcome.value === {"a":[[[["x"]]]]}    // depth 6, bound
followUpCalls === 1
```

The bind requires no permissive root: any declared schema admitting depth-6
members reproduces it.

Cell B2 — closed root that rejects the document (`schema Nest { deeply:
string }`), AJV opener (`{deeply: 42}`), follow-up delivers the same depth-7
payload, `attempts: 1`. Observed terminal error:

```
attempts: 1
validation_errors: [
  { path: "", message: "must NOT have additional properties", schema_keyword: "additionalProperties" },
  { path: "", message: "must have required property 'deeply'", schema_keyword: "required" }
]
```

The slot is consumed and the loop continues/terminates on AJV's shape
verdict; the canonical `maxDepth` issue (`"JSON document depth exceeds 5"`)
never appears for a follow-up breach, and the next follow-up's
`<ajv-summary>` teaches the model about properties, not depth. AJV itself
ran over the depth-7 document first (CIO-3 inverted).

Control (same harness): a depth-7 INITIAL payload produces the canonical
`maxDepth` issue at `path: "/a/b/c/d/e"` — proving the walk exists and the
follow-up path alone skips it.

## Expected

`schema-subset.md:59`: the depth walk re-runs on each follow-up's response.
B1/B3 must not bind: the breach is a `validation` failure that consumes the
slot and re-enters repair (or exhausts with the `maxDepth` issue). B2's
terminal `validation_errors` must lead with the depth issue per CIO-3's
walk-before-AJV ordering.

## Actual / mechanism

`nextFollowUp` (typed-query-validation.ts) validates follow-up payloads via
`validateAgainst` (AJV compile+validate) on both arms and never consults
`depthWalk`. The only depth walk on the typed-query response boundary sits
in `runTypedQueryLoop` ahead of the initial validation; repair re-validation
happens inside the collaborator, which has no walk. AJV cannot substitute:
JSON Schema 2020-12 has no `maxDepth` keyword (recorded at
`production-theta-producer.ts:6091`). The on-session early-respond execute
(`#executeRespondTool`) does walk — but a repair attempt's payload can
arrive via the off-session fresh forced dispatch (`driveRepairAttempt` →
`respond_outcome.payload`), which lands in the un-walked arm.

## Impact

Impact class 1: a hard-ceiling-violating document is silently delivered to
theta code as a validated typed value (B1/B3) — from a loadable theta with
an ordinary closed declaration (B3), or via the permissive `{}` root of an
imported schema name (B1) — with zero diagnostics. Secondary: the repair
conversation mis-teaches the model on follow-up depth breaches (B2), CIO-3's
ordering invariant is false on every follow-up turn, and PIC-1 (d)'s
follow-up clause plus `query-tool-loop.md:103` are untestable at HEAD.

## Reproduction

Offline, deterministic (~30 ms): the three cells above on the e2e-s3 harness
pattern; scripted driver returns `{ kind: "noncompliance" | "respond",
… }` for the initial turn and the shipped `FollowUpRespondOutcome` payload
arm for the follow-up. Exact cell source preserved in the hunt log's probe
inventory (scratch deleted per policy).

## Non-goals

- **The initial-payload depth walk** — conformant (control above); its
  repair routing is [bug 0352](./0352-initial-depth-breach-bypasses-repair.md).
- **The in-turn early-respond depth feedback** (`#executeRespondTool`,
  `production-theta-producer.ts:3315`) — conformant model-driven-row
  behaviour for free-phase respond calls; unchanged.
- **The `masked` slot-count input on repair-terminal events** — candidate
  hard-ceilings/03.

## Fix sketch

In `nextFollowUp`, run `depthWalk(payload)` (payload arm) /
`depthWalk(payloadForRespond(parse))` (text arm) BEFORE `validateAgainst`;
on breach return `{ kind: "schema_validation", issues: [walk.issue],
raw_response: JSON.stringify(payload) }` so the slot debits and the next
follow-up's `<ajv-summary>` carries the canonical depth issue.

Constraints:

1. Natural home: inside `validateAgainst`
   (`typed-query-validation.ts:319`) so both arms inherit it. The walk must
   see the PAYLOAD (post-`respondPayloadFromWire`), which both call sites
   already pass. Keep 0292's `orderValidationIssues` call intact.
2. Must land with [bug 0352](./0352-initial-depth-breach-bypasses-repair.md) so both halves of row #1 agree.
3. Witnesses: B1, B2 (leading `maxDepth` issue), and B3 above red at HEAD
   and green after; a depth-5 follow-up control (binds); a depth-6 follow-up
   under a schema AJV would also reject (the walk's issue wins, single-issue
   form — the CIO-3 walk-before-AJV ordering observable).
