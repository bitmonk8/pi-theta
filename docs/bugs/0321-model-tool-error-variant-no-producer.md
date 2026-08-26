# Bug 0321 — `ModelToolError` (`kind: "model_tool"`) is a nine-variant union member with no producer: `rg '"model_tool"' src/` matches only the union declaration, the SNK-d renderer arm, the runtime-event kind list, and a string helper — both documented firing conditions route elsewhere (absent tool → `isError` tool-result feedback, the loop continues; adapter/transport failure mid-loop → `TransportError` via the provider classifier), so the variant the spec says "can surface … exactly as for untyped queries" is author-unreachable at every seam

- **Status:** open.
- **Sev/Diff estimate:** S3/D3 — S3 because no wrong value binds and no
  failure is silenced: the inputs the spec assigns to `model_tool` all
  surface loudly, just under sibling variants (`isError` feedback consuming
  a round, or `kind: "transport"`), so the cost is a dead author-facing
  `match` arm, an unfalsifiable conformance claim over the closed union, and
  a misattribution (a tool-loop adapter failure reads as a network transport
  failure, with `TransportError`'s fields — `http_status`, `retryable` —
  substituting for `ModelToolError`'s `tool_name`/`tool_call_id`). Not S2:
  whether any theta-1.0 input *ought* to reach the variant is itself the
  adjudication a fix needs — the two named conditions have plausible
  spec-coherent dispositions on their current routes. D3 because the fix is
  an adjudication, not a mechanical wiring: either (a) identify the real
  non-recoverable adapter-layer input class and mint the variant there (new
  classification arm on the off-session loop), or (b) amend the spec to
  retire the variant's firing claims and mark it reserved — and the variant
  cannot be dropped from the union (ERR-15 forbids tightening; SNK-d's row
  and the runtime-event kind list stay either way).
- **Kind:** defect (spec/implementation divergence on producibility) —
  elements at `ee681f7b` (v0.287.0):
  1. *The spec assigns firing conditions.* `queryerror-variants.md:110`:
     "Fires on a non-recoverable adapter-layer failure of the model's
     tool-call loop — the named tool is absent from the resolved callable
     set, or a Pi-adapter / transport failure occurs while feeding a
     tool-result back to the model." `query-tool-loop.md:13`: free-phase tool
     calls "can surface `ModelToolError` exactly as for untyped queries".
     `query-failure-and-repair.md:69` lists `model_tool` among the proximate
     failures that propagate and terminate respond-repair; `:74`: "a
     follow-up's *own* tool-call loop may fail with `model_tool` mid-loop".
  2. *No construction site exists.* `rg -n '"model_tool"' src/` →
     `src/runtime/query-error.ts:253` (wire-kind list),
     `src/runtime/runtime-event-channel.ts:81` (RuntimeEvent kind list),
     `renderLeafKindNote`'s SNK-d arm (`src/runtime/err-note-render.ts`,
     converted file — cited by symbol), and
     `src/runtime/tool-call.ts:521` (`modelToolErrorKind()`, a string helper
     whose only callers are tests). No `kind: "model_tool"` object literal
     and no `ModelToolError`-typed value is built anywhere in `src/`.
  3. *Condition 1 (absent tool) routes to feedback, not `model_tool`.* The
     off-session model-driven lowering `lowerModelDrivenToolCall`
     (`src/extension/production-theta-producer.ts:5698`) answers a call whose
     dispatch is undefined with an `isError` tool-result — "tool
     '<name>' is not available in this theta's callable set" (`:5710`) — and
     the loop continues; the prompt-mode loop is the user session's own host
     loop, where theta observes only the driven turn's final state.
  4. *Condition 2 (adapter/transport failure feeding a result back) routes to
     `TransportError`.* Every off-session loop round's `complete()` failure
     folds through `classifyOffSessionReply`
     (`production-theta-producer.ts:5967`; free-phase fold call at `:5597`),
     whose non-overflow output is `kind: "transport"` (bug 0291's census:
     the classifier and the fold produce only transport/overflow); prompt-mode
     driven-turn failures map through `prompt-transport-mapping.ts` to
     `transport` per PIC-51. No path distinguishes "the turn that failed was
     feeding a tool-result back" into a different variant.
- **Related:**
  - **0291** (open) — its Kind element 4 censuses every author-visible
    error construction on the off-session surface; that census is the
    corroborating evidence that transport/overflow are the only
    classifier-derived kinds minted there.
  - **0293** (open) — the same pattern one level down (`parse_failure` dead
    within a cause enum); this report is the pattern at variant granularity.
  - **0177** (fixed 0.263.0) — exercised SNK-d with a hand-built
    `model_tool` fixture; the only `model_tool` value in the tree is
    test-fabricated, consistent with element 2.
- **Affected** (verified at `ee681f7b`, v0.287.0):
  - `src/runtime/query-error.ts:253` (the `"model_tool"` wire kind in the
    closed list; `ModelToolError` schema type in the same file).
  - `renderLeafKindNote` — SNK-d arm (`src/runtime/err-note-render.ts`, by
    symbol): a live-looking per-kind row no input can reach.
  - `src/runtime/runtime-event-channel.ts:81` — `"model_tool"` in the
    RuntimeEvent kind enumeration; same deadness on the always-log channel.
  - `src/runtime/tool-call.ts:513–521` (`modelToolErrorKind`, test-only).
  - `src/extension/production-theta-producer.ts:5698–5713` (condition 1's
    actual route), `:5967`/`:5597` (condition 2's actual route);
    `src/runtime/prompt-transport-mapping.ts` (prompt-mode route).
  - Spec: `docs/spec_topics/errors-and-results/queryerror-variants.md:110`
    (the firing sentence), `:113–119` (the schema);
    `docs/spec_topics/query/query-tool-loop.md:13`;
    `docs/spec_topics/query/query-failure-and-repair.md:13`, `:69`, `:74`;
    `docs/spec_topics/slash-invocation.md:42` (SNK-d row).
- **Observed at:** v0.287.0 (`ee681f7b`). Offline, by census and route
  tracing: `rg -n '"model_tool"' src/ tests/` (all hits read), plus reading
  both documented conditions' actual dispatch sites end-to-end
  (`lowerModelDrivenToolCall`; `classifyOffSessionReply` and its three fold
  callers; `prompt-transport-mapping`). No probe needed: deadness is a
  whole-tree negative the census establishes, and both routes are pinned by
  existing committed suites (`tests/off-session-transport-classification.test.ts`
  for the transport fold; the callable-set / host-denial suites for the
  feedback route).

## Summary

`QueryError` is a closed nine-variant union; conformance tests "assert the
closed set" (ERR-15) and the SLSH-4 note table gives every variant a row.
Eight variants have producers. `ModelToolError` has none: the spec's two
firing conditions are both handled by other machinery —

| documented `model_tool` condition (`queryerror-variants.md:110`) | shipped disposition |
| --- | --- |
| "the named tool is absent from the resolved callable set" | `isError` tool-result fed back to the model; round counts; loop continues (`production-theta-producer.ts:5710`) |
| "a Pi-adapter / transport failure occurs while feeding a tool-result back" | that round's `complete()` failure classifies as `TransportError` (or overflow) via `classifyOffSessionReply` / PIC-51 |

so no input — typed or untyped query, prompt or subagent mode, free phase or
respond-repair follow-up — can bind `Err(QueryError { kind: "model_tool" })`
in author code. The spec meanwhile treats the variant as live in four
places: the firing sentence, the free-phase "can surface `ModelToolError`
exactly as for untyped queries", the proximate-failure propagation list, and
the "may fail with `model_tool` mid-loop" follow-up rule. The renderer
maintains SNK-d and the runtime-event channel enumerates the kind; both are
arms that can never fire outside hand-built fixtures.

## Reproduction

Census, at `ee681f7b`:

```
rg -n '"model_tool"' src/
  src/runtime/err-note-render.ts   (SNK-d arm)
  src/runtime/query-error.ts:253   (wire-kind list)
  src/runtime/runtime-event-channel.ts:81 (event-kind list)
  src/runtime/tool-call.ts:24,513,521 (comment + string helper)
```

No `kind: "model_tool"` construction. Route confirmation for the two
documented conditions: read `lowerModelDrivenToolCall`
(`production-theta-producer.ts:5698–5713`) — dispatch-undefined answers an
`isError` result, never an `Err`; read the three `classifyOffSessionReply`
fold callers (`:5597`, `:5930–5950`, `:6199`) — every loop-round provider
failure becomes `transport`/`context_overflow`. The committed
`tests/off-session-transport-classification.test.ts` (18 cells green) pins
the second route's output kinds.

## Expected behaviour

- `queryerror-variants.md:110`: the two named condition classes produce
  `Err(ModelToolError { tool_name, tool_call_id, raw_response, … })`.
- `query-tool-loop.md:13`: a free-phase tool call "can surface
  `ModelToolError`".
- `query-failure-and-repair.md:74`: a respond-repair follow-up's tool loop
  "may fail with `model_tool` mid-loop", propagating without consuming an
  `attempts` slot.
- ERR-15: conformance tests over the closed variant set can witness each
  member the spec claims producible.

## Actual behaviour / root cause

The variant predates the current loop architecture's dispositions: the
in-loop feedback rule ("an in-loop tool failure the runtime can lower to a
tool-result does **not** fire this variant", `queryerror-variants.md:110`)
grew to cover the absent-tool case (the lowering answers an `isError`
result for it, which by that rule is fed back), and the provider classifier
absorbed every turn-level failure — including the turn that carries
tool-results — into `TransportError`. What remains for `model_tool` is a
class the code never separates out: no site inspects "did this failed turn
carry tool-results" or "is this adapter failure non-recoverable", so the
variant's construction was never written. The union member, its renderer
row, its event-kind entry, and its wire-kind helper all ship as if it were.

## Why it matters

- Authors following the spec write `match` arms over `ModelToolError`
  (`tool_name`, `tool_call_id`) for tool-loop failures; those arms are dead,
  and the failures they were written for arrive as `transport` — whose
  documented fields (`http_status`, `retryable`) describe a different
  failure class — or as loop continuation.
- The closed-set conformance claim (ERR-15: "theta 1.0.0 conformance tests
  assert the closed set") is unfalsifiable for this member: no conforming
  test can turn `model_tool` up from any input.
- SNK-d and the runtime-event `model_tool` kind are maintained,
  live-looking surfaces (renderer arm, always-log enumeration) whose only
  exercisers are hand-built fixtures — the 0246/0079 shape of a registered
  surface behind which no emitter stands.
- The misattribution compounds bug 0291: a mid-loop adapter failure is not
  only pinned `retryable: false`, it is presented as the wrong variant
  entirely.

## Non-goals

- The in-loop feedback rule itself (execute() throw / `isError: true` →
  tool-result feedback) is spec'd in the same paragraph and correct; nothing
  here proposes routing recoverable in-loop failures to `model_tool`.
- `CodeToolError` (the code-side counterpart) is fully wired and out of
  scope.
- The SNK-d renderer arm and `modelToolErrorKind()` are correct as written;
  whether they stay (reserved member) or gain a producer follows the
  adjudication.
- Bug 0291's `retryable`/`http_status` pinning is filed separately and not
  re-claimed.

## Fix

Not yet decided; two spec-coherent directions needing adjudication:

1. **Mint the variant on the non-recoverable adapter class.** Candidate
   input classes at the current seams: a `complete()` rejection/error-stop
   on a round whose request carried tool-results (the "while feeding a
   tool-result back" clause read literally — the fold callers know the round
   kind), and/or a dispatch-undefined call on a surface where feedback is
   impossible. Requires threading `tool_name`/`tool_call_id` from the round
   into the classification fold, and a decision rule for when transport-class
   evidence upgrades to `model_tool` (the two variants must stay disjoint —
   the same underlying event must not be classifiable as both).
2. **Retire the firing claims.** Amend `queryerror-variants.md:110`,
   `query-tool-loop.md:13`, and `query-failure-and-repair.md:69`/`:74` to
   mark the variant reserved with no theta-1.0-reachable case (the
   `last_tool_name | null` precedent wording), keeping the union member,
   SNK-d, and the wire kind for forward compatibility. Honest, but it
   removes the only variant that names a failing tool on the model-driven
   surface.

Either way: no change to the feedback rule, the transport fold's existing
cells, or the renderer.

## Provenance

Dead-arms-sweep bug hunt, worktree `C:/UnitySrc/pi-theta-hunt` at `ee681f7b`
(v0.287.0). Surfaces read: `query-error.ts`, `tool-call.ts`,
`err-note-render.ts` (renderer arms vs the SNK table),
`runtime-event-channel.ts`, `lowerModelDrivenToolCall` and the
`classifyOffSessionReply` fold callers (`production-theta-producer.ts`),
`prompt-transport-mapping.ts`; spec `queryerror-variants.md`,
`query-tool-loop.md`, `query-failure-and-repair.md`, `slash-invocation.md`
SNK table. Measurement: whole-tree `rg` census plus route tracing; committed
transport-classification suite as the route-output pin.
