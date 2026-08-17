# Bug 0172 — `runtime-value-model.md:34` closes the inbound wire-name-translation boundary set at four and states the rule once for all of them ("not restated per call site"), but after the bug 0067 fix `translateInbound` still has exactly one production caller: typed query results, typed `.theta`-callable tool-call returns and binder `args` each bind the raw AJV-validated payload, so a named-enum position arrives untagged and a schema-typed object unbranded — and on the one boundary 0067 did wire, a value inside a `{"anyOf":[…]}` arm is untranslated too, because the sidecar is keyed by JSON Pointer and `anyOf` has no data-space image, which makes arm dispatch a spec question no sentence answers

- **Status:** fixed (0.102.0). Both faces are discharged: face 1 at 0.97.0
  (`## Fix (0.97.0)`) and face 2 at 0.102.0 (`## Fix (0.102.0)`, at the end of
  this document). The arm-dispatch rule face 2 was blocked on is now written
  into `runtime-value-model.md` §"Wire-name translation" and
  `schema-subset.md` step 5 — **first-admitting-arm dispatch**, adjudicated by
  the operator from §Fix's own candidate list — and the code implements it in
  the same commit as the sentence. The enforced-entry-point question 0067's
  §Options left open is still open, recorded as a disposition rather than
  answered: `src/runtime/inbound-boundary.ts` remains a shared step.
  Historical framing preserved below as filed. Residual of the bug 0067 fix
  (0.90.0, commit `e18b30e5`),
  recorded there as `## Fix (0.90.0)` *Residuals* items 1 and 2 and in that fix's
  report (`.pi/tmp/fixes/0067-report.md` R1 and R2). §Fix is constraint-pinned,
  not settled: face 1 has four candidate scopes with their measured costs, face 2
  cannot be implemented at all until an arm-dispatch rule is written into the
  spec, and the enforced-entry-point question 0067's §Options left open is
  restated here rather than answered. Ordering:
  [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md) is open
  and undecided on what the inbound rebuild *does* (declaration order, brand);
  this report owns whether the rebuild *runs*. Wiring the typed-query boundary
  imports 0120's unsettled order question into production on exactly the boundary
  0120's own coordination note reserves for itself, so either 0120 settles first
  or a route here that touches the typed-query boundary lands both halves.
  [0173](./0173-inbound-rebuild-record-not-null-prototyped.md) (open) states a
  prerequisite in the other direction and this report agrees with it: its
  record-build hardening lands **before** any of the three boundaries here is
  wired, because each of them makes the payload model-produced and that is what
  makes 0173's `__proto__` path reachable. Nothing blocks this report from
  starting; the wiring itself waits on 0173.
- **Sev/Diff estimate:** S1/D3 — S1 because a value silently loses its
  declaring-enum tag and its schema brand on production paths with no diagnostic
  on any surface: measured over the same lowered document and the same payload,
  a `schema Box { sev: Sev }` value that reaches theta code through the boundary
  0067 wired brands as `Box` and compares `box.sev == Sev.High` **`true`**, while
  the identical value reaching theta code through the typed-query loop or the
  binder-`args` merge is unbranded and compares **`false`** (§Reproduction (b),
  (c), (d)); the spec fixes that comparison at `true` on every one of these
  boundaries in one sentence. D3 because face 1 spans three separate seams —
  `runTypedQueryLoop`, the `.theta`-callable invoke resolver, and the
  binder-`args` projection — each needing its own witness and each with its own
  plan-derivation question, the typed-query one is coupled to 0120's undecided
  route, and face 2 needs an arm-dispatch rule that no sentence in
  `runtime-value-model.md` or `schema-subset.md` currently supplies.
- **Kind:** defect — the runtime performs, at one boundary, a rule the
  specification states once for four, and performs it there only at the positions
  a JSON Pointer can address. Two faces, five elements, each measured at HEAD
  `e18b30e5`.
  1. *The seam has one production caller.* `translateInbound`
     (`src/runtime/wire-translation.ts:130`) is called from exactly one place in
     `src/`: `#validateInvokeReturn`'s success arm
     (`src/extension/production-theta-producer.ts:3472`, inside the method
     declared at `:3436`). `rg -n "translateInbound" src/` returns four lines
     total — the definition, that call, its import (`:225`), and one prose
     mention in the module header (`wire-translation.ts:31`). §Reproduction (a).
  2. *Typed query results bind the raw validated payload.* `runTypedQueryLoop`
     (`src/runtime/query-tool-loop.ts:465`) returns
     `{ kind: "value", value: forced.payload, … }` (`:721–728`) — the
     AJV-validated payload itself. The respond-repair arm returns `repair.value`
     (`:705`), which `buildTypedQueryValidation`
     (`src/runtime/typed-query-validation.ts:168`) produced as
     `{ kind: "validated", value: turn.payload }` (`:276`) or
     `{ kind: "validated", value: payload }` (`:300`). `runQueryEffect`
     (`src/runtime/effectful-statement-host.ts:195`) hands that value straight to
     the executor (`:232–233`). Measured: `@<Box>` with a forced-respond payload of
     `{"sev":"high"}` binds an unbranded object whose `sev` is a plain string
     (§Reproduction (c)).
  3. *A typed `.theta`-callable tool-call return is never even offered to the
     pass.* `tool-calls.md:23` gives the registered-theta row the return type
     `Result<T, QueryError>` where `T` is the callee's inferred return type, and
     `runToolCallEffect` routes such a call through the invoke trampoline
     (`effectful-statement-host.ts:273`, its theta-callable branch at
     `:285–292`). But `#resolveCallAsInvoke`
     (`production-theta-producer.ts:3149`) builds the `InvokeChild` with
     `returnSchema` `null` (`:3164`), and `#validateInvokeReturn`'s first
     statement returns its argument unchanged when `returnSchema === null`
     (`:3442–3443`). The inferred type never becomes a runtime schema, so neither
     AJV nor the translation pass runs on this boundary.
  4. *Binder `args` bind the raw merged payload.* `runBinder`
     (`production-theta-producer.ts:685`) returns
     `{ bound: true, args: merged.args }` (`:886`)
     from `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:117`), and
     `paramBindingsFrom` (`src/extension/theta-composition-producer.ts:90`)
     projects each entry into body scope with `bindings.set(name, value as
     ThetaValue)` (`:97`) — a cast, not a walk. Measured: `params: { sev: Sev }`
     lowers to a `$ref` at `/properties/sev`, the merged args validate `ok`, and
     the bound `sev` is a plain string (§Reproduction (d)). The child-side
     marshalled-params intake binds the same way
     (`#intakeSubagentRootParams`, `:2019`; the projection at `:2145–2151`).
  5. *On the boundary 0067 did wire, a value inside a `{"anyOf":[…]}` arm is
     untranslated.* `Sev | null` lowers to
     `{"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}],…}` (SUBS-1,
     `docs/spec_topics/schema-subset.md:81` — a union with any non-primitive arm
     lowers to `anyOf`), AJV's verdict is `{"ok":true}`, and the rebuilt value is
     an untagged string: `rebuilt == Sev.High` is `false`. This is **not a
     regression** — the position was untranslated before 0067 too — and 0067
     narrowed its code's documented claims rather than widen the route. The
     sidecar is keyed by JSON Pointer into the lowered fragment and `anyOf` has
     no image in the data space the way `properties` and `items` do, so nothing
     in the lowered fragment names which arm governs a materialised value.
     §Reproduction (f) measures the reach loss as wider than 0067's residual
     recorded: under `Box | null` the whole object arrives unbranded **and** its
     nested named-enum field untagged, and under `array<Sev | null>` the elements
     are untagged where `array<Sev>` elements are tagged.
- **Related:**
  - **0067** —
    [`0067-subagent-envelope-drops-enum-tag.md`](./0067-subagent-envelope-drops-enum-tag.md),
    **fixed (0.90.0)**, this report's parent and its substrate. That fix wired one
    of the four boundaries deliberately and shipped the machinery the other three
    would consume: `buildInboundTranslationPlan` (`src/parser/schema-lowering.ts`)
    derives the per-`$defs` sidecars from any lowered document, and step 5 of the
    Lowering Algorithm gained the `$ref`-target map that makes the walk faithful
    (`docs/spec_topics/schema-subset.md:87`). Its §Options closes with the
    question this report carries forward verbatim: "a fix should also decide
    whether `translateInbound` gains a single enforced entry point that every
    inbound boundary is required to route through." Its `## Fix (0.90.0)`
    *Residuals* items 1 and 2 hand both faces to the parent. Its fix also amended
    three code comments to state the `anyOf` reach limit — the seam header
    (`src/runtime/wire-translation.ts:33–41`), `translateInbound`'s doc comment
    (`:125–128`) and `#validateInvokeReturn`'s doc comment
    (`src/extension/production-theta-producer.ts:3430–3434`) — so the code claims
    no coverage it lacks, and face 2 is a gap in the rule, not a divergence
    between code and its own comments.
  - **0120** —
    [`0120-inbound-rebuild-ignores-declaration-order-and-brand.md`](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md),
    **open**, §Fix unsettled. **Boundary.** 0120 owns what the inbound rebuild
    *produces* once it runs — whether `rebuildInbound` reorders a rebuilt record
    into declaration order (`expressions.md:118`) and how the brand is installed;
    this report owns *whether the rebuild runs at all* at the three boundaries
    that do not call it. The two docs cite the same line: 0120 cites the
    typed-query boundary's raw bind at `src/runtime/query-tool-loop.ts:721–728`
    (re-verified at HEAD `e18b30e5` — still exact; `:724` is `value:
    forced.payload,`) as the reason its own defect is currently unreachable in
    production. 0067's fix appended a `## Coordination note` to 0120 (`:992`)
    recording that the brand half landed for the subagent-`invoke` boundary, that
    the order half is vacuous there because the producer is a theta child whose
    object `buildObjectSchemaValue` already ordered, and that "§Reproduction's
    model-ordered hazard bites at the typed-QUERY boundary, which 0067 did not
    wire, so it remains this report's to settle". That sentence is the coupling:
    a route here that wires the typed-query boundary makes 0120's hazard
    production-visible, so it either follows 0120's decision or carries it.
  - **0173** —
    [`0173-inbound-rebuild-record-not-null-prototyped.md`](./0173-inbound-rebuild-record-not-null-prototyped.md),
    **open. Prerequisite: it lands first.** Residual R3 of the same 0067 fix,
    filed separately by that residual's own orchestrator. It owns
    `rebuildInbound`'s record construction — a plain object literal, so a payload
    key spelled `__proto__` reassigns the record's prototype and is dropped
    instead of becoming an own field. **Boundary.** 0173 owns what the walk's
    record build does with a hostile key; this report owns which boundaries call
    the walk at all. The coupling is one-directional and both docs state it the
    same way: at HEAD the defect is unreachable because the one wired boundary's
    payload is a theta child's own `JSON.stringify` output, and it becomes
    reachable the moment a boundary here is wired, because all three of them take
    MODEL-produced payloads. §Fix (a) and (e)(4) carry the ordering.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/extension/production-theta-producer.ts` is 6165 lines at this HEAD and
    every open report inserts into it, which is why every volatile position below
    is named by symbol beside its line and every line is stamped with the commit
    it was read at.
- **Affected** (every citation re-verified against the tree at HEAD `e18b30e5`,
  v0.90.0; symbols named beside lines):
  - **The seam and its one caller.** `translateInbound`
    (`src/runtime/wire-translation.ts:130`), its `InboundTranslationInput`
    (`:85`), the walk entry `rebuildUnder` (`:198`) and `rebuildInbound` (`:223`)
    with its array recursion (`:247`) and field recursion (`:298–299`); the
    module header's *positions this pass reaches* paragraph (`:33–41`).
    `#validateInvokeReturn` (`src/extension/production-theta-producer.ts:3436`),
    its `returnSchema === null` early return (`:3442–3443`), its
    `buildInboundTranslationPlan` call (`:3465`) and its `translateInbound` call
    (`:3472`); the import (`:225`). Its two call sites in `#driveCallee` (`:3332`,
    `:3370`) are unchanged by this report.
  - **Boundary 1 — typed query results.** `runTypedQueryLoop`
    (`src/runtime/query-tool-loop.ts:465`), its terminal return (`:721–728`) and
    its respond-repair `value` arm (`:705`); `buildTypedQueryValidation`
    (`src/runtime/typed-query-validation.ts:168`), its two `validated` returns
    (`:276`, `:300`) and `validateAgainst` (`:318`); the respond-tool capture that
    produces the payload (`#executeRespondTool`,
    `src/extension/production-theta-producer.ts:2748`, the capture at
    `:2775–2776`; the off-session twin `#serviceHeldCall`, `:4928`);
    `runQueryEffect` (`src/runtime/effectful-statement-host.ts:195`) and its typed
    arm (`:223–233`).
  - **Boundary 2 — typed `.theta`-callable tool-call returns.**
    `runToolCallEffect` (`src/runtime/effectful-statement-host.ts:273`) and its
    theta-callable branch (`:285–292`); `#classifyCall`
    (`src/extension/production-theta-producer.ts:2820`); `#resolveCallAsInvoke`
    (`:3149`) and the `null` it passes as `returnSchema` (`:3164`) with the
    comment stating why (`:3161–3163`); `#buildInvokeChild` (`:3168`).
    `lowerAcceptedThetaCallableReturn` (`src/runtime/tool-call.ts:550`) is the
    lowering-side carrier and is not on this path.
  - **Boundary 3 — binder `args`.** `runBinder`
    (`src/extension/production-theta-producer.ts:685`), its merge call (`:870`)
    and its bound return (`:886`); `#mergeDeclaredDefaults` (`:1203`), the
    compiled validator (`:1225`) and the `fillDefaultsAndRevalidate` call
    (`:1226`); `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:117`) and
    its post-merge AJV call (`:151`); `paramBindingsFrom`
    (`src/extension/theta-composition-producer.ts:90`) and its cast (`:97`), and
    its one caller (`:396`). The child-side sibling:
    `#intakeSubagentRootParams` (`src/extension/production-theta-producer.ts:2019`)
    and the raw projection at `:2145–2151`, over
    `src/runtime/subagent-params.ts` (`readMarshalledParams`, `:224`; the
    validator call, `:294`).
  - **The plan derivation a fix consumes.** `buildInboundTranslationPlan` and
    `buildSidecar` (`src/parser/schema-lowering.ts`); `lowerQueryResponseSchema`
    (`src/runtime/query-schema-lowering.ts`), which produces the lowered document
    for a typed query and for an `invoke<Schema>` annotation alike;
    `params.loweredSchema` (`src/parser/params.ts:404–414`, surfaced through
    `src/parser/frontmatter.ts:809`), which is the lowered document the
    binder-`args` boundary already compiles.
  - **Spec.** `docs/spec_topics/runtime-value-model.md:32` (the two-place
    opening), `:34` (the inbound bullet, whose closing sentence is the obligation
    this report measures), `:35` (the outbound bullet), `:36` (the `params:`
    defaults bypass), `:13` (the enum row: the tag is what `==` compares and it
    MUST NOT appear in JSON output), `:22` (the cross-type equality rule that
    makes an untagged variant compare `false` against a tagged one);
    `docs/spec_topics/schema-subset.md:81` (SUBS-1 — a union with any
    non-primitive arm lowers to `anyOf`), `:82` (discriminated object union),
    `:83` (mixed `anyOf`), `:87` (step 5, the three-map sidecar and the
    JSON-Pointer keying), `:88` (step 6, discriminator detection over the lowered
    `anyOf` form — the only existing rule that reads an `anyOf`'s arms);
    `docs/spec_topics/tool-calls.md:23` (the registered-theta return-type row);
    `docs/spec_topics/invocation.md:28` (§Typed return — untyped `invoke(...)`
    discards the child's return value, which bounds this report's domain);
    `docs/spec_topics/expressions.md:118` (the declaration-order `keys()` rule
    0120 owns). Reference mirror: `docs/reference/type-system.md:145` (§Wire-name
    translation), `:153–154` ("Applies uniformly to typed query results, typed
    tool-call returns, `invoke` returns, and binder `args`").
  - **The committed cells a fix must not red.**
    `tests/wire-translation-inbound-retag.test.ts:200` — "a brand at a position
    the plan does not describe survives the walk" — asserts over the REAL
    lowering of `schema U2 { q: Person2 | null }` that `U2`'s sidecar addresses
    `/properties/q` with neither map (`:228–229`) and that an already-branded
    in-process value at that position keeps its brand (`:249`), while the
    described root is still re-branded (`:253`). It pins the
    union-arm pass-through as *non-destructive*, which any face-2 route must
    preserve or renegotiate explicitly.
    `tests/subagent-invoke-inbound-enum-tag.test.ts` is 0067's primary witness —
    one `it()` (`:157`) carrying six assertion cells (`crossed`, `local`,
    `objSev`, `objWho`, `elem0`, `anon`), including the `anon` control at
    `:311–316` pinning `Severity.Low == "low"` at `false`.
    `tests/inbound-translation-plan.test.ts` (eleven cells over
    `buildInboundTranslationPlan` / `buildSidecar`) is the plan-derivation
    witness a face-1 route reuses at each new boundary.
    `tests/e2e-s3-typed-query-conformance.test.ts` asserts `outcome.value` with
    `toEqual` over a `Triage` schema whose only union field is an anonymous
    string-literal union, so it carries no named-enum position and no route here
    changes its verdict.
    `tests/wire-name-translation.test.ts:24` still describes `translateInbound` /
    `translateOutbound` as "inert identity stubs" — stale prose in a comment,
    correct at the time it was written, and bug 0134's class rather than this
    report's.
  - **Corpus census, re-run at HEAD.** 34 committed `.theta` / `.thetalib` files;
    17 declare `params:`; **none** declares a named `enum` (`rg -ln "enum "` over
    the tracked set returns nothing), so no committed fixture carries the enum-tag
    half of any boundary. Two committed typed queries exist —
    `docs/examples/handle-error.theta:12` (`@<Triage>`, a declared `schema`) and
    `docs/examples/personas.thetalib:8` (`@<integer>`) — so the brand half is
    reachable from the committed corpus at the typed-query boundary and is
    asserted by nothing. No committed `.theta` / `.thetalib` declares an `as`
    rename, so the rename half of the rule is unexercised corpus-wide.
- **Observed at:** v0.90.0 (`e18b30e5`). Offline, deterministic, provider-free:
  one scratch vitest probe over the shipped seams — `parseThetaDocument`,
  `lowerQueryResponseSchema`, `buildInboundTranslationPlan`, `translateInbound`,
  the production `AjvSchemaValidator` (`src/seams/schema-validator.ts`) built with
  the shipped content-addressing, `fillDefaultsAndRevalidate`, and the real
  `runTypedQueryLoop` + `buildTypedQueryValidation` driven by a scripted
  `QueryModelDriver` at `max_rounds: 0` (the harness pattern of
  `tests/e2e-s3-typed-query-conformance.test.ts:84–95`, `:130–159`) — written,
  run, deleted. Every value below is that run's output verbatim over a tree
  `git status --short --untracked-files=no` reported clean at `e18b30e5`. The
  static census is `rg` over `src/` at the same HEAD.

## Summary

`runtime-value-model.md:34` states the inbound wire-name-translation rule once
and closes its boundary set at four: "The rule applies uniformly to every inbound
boundary — typed query results, tool-call return decoding where typed, `invoke`
returns, and binder `args` — and is not restated per call site." The bug 0067 fix
(0.90.0) performed the rule at one of the four. The other three are unperformed,
and the one that was wired performs it only where a JSON Pointer addresses a
value.

**Face 1 — three boundaries perform no inbound translation.**
`translateInbound` has exactly one production caller: `#validateInvokeReturn`.
Typed query results, typed `.theta`-callable tool-call returns and binder `args`
each bind the AJV-validated payload directly. Measured over the same fixture
(`enum Sev { High = "high", Low = "low" }`, `schema Box { sev: Sev }`), the same
lowered document and the same payload `{"sev":"high"}`:

| Boundary | root `schemaTagOf` | `.sev` tagged | `.sev == Sev.High` |
| --- | --- | --- | --- |
| `invoke<Box>` (wired by 0067) | `Box` | yes | `true` |
| typed query `@<Box>` | `undefined` | no | **`false`** |
| binder `args` (`params: { sev: Sev }`) | — | no | **`false`** |

The typed `.theta`-callable tool-call boundary loses it one step earlier:
`#resolveCallAsInvoke` passes `returnSchema` `null`, so `#validateInvokeReturn`
returns before AJV and before the pass. The spec gives that boundary a return
type by inference (`tool-calls.md:23`); the runtime carries no schema for it.

0067's §Options left one question open that this report carries forward: whether
`translateInbound` should gain a single enforced entry point that every inbound
boundary is required to route through, so an omission cannot silently recur.
Nothing in the code or the spec enforces the "not restated per call site"
sentence today — it is satisfied by convention, and the convention was not
followed at three of four sites.

**Face 2 — union (`anyOf`) positions are untranslated on the boundary 0067
fixed.** `invoke<Sev | null>` hands the parent an untagged string. This is not a
regression: the position was untranslated before 0067, and 0067 narrowed its
code's documented claims instead of widening the route. Measured over the real
`lowerQueryResponseSchema`, the real `AjvSchemaValidator` and the shipped plan
derivation: `Sev | null` lowers to
`{"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}],"$defs":{"Sev":{"type":"string","enum":["high","low"]}}}`,
the AJV verdict is `{"ok":true}`, and `rebuilt == Sev.High` is `false`. The
reach loss is wider than the residual recorded: a union arm stops the walk
entirely, so `Box | null` arrives unbranded with its nested `sev` untagged, and
`array<Sev | null>` arrives with untagged elements where `array<Sev>` has tagged
ones. It is not closable inside 0067's route because the sidecar is keyed by JSON
Pointer into the lowered fragment and `anyOf` has no data-space image the way
`properties` and `items` do: nothing in the lowered fragment names which arm
governs a materialised value. Choosing that rule is a **spec question** — it must
be written into `runtime-value-model.md` and/or `schema-subset.md` before any
code can implement it.

## Reproduction

Offline, deterministic, at HEAD `e18b30e5`. Shared fixture, parsed by the real
`parseThetaDocument`:

```
enum Sev { High = "high", Low = "low" }
schema Box { sev: Sev }
schema R { who as "Who": string }
Box { sev: Sev.High }
```

`report` below prints, for a value: its JSON form, whether `isEnumValue` holds,
what `schemaTagOf` recovers, and `valuesEqual(v, makeEnumValue("Sev","high"))`.

### (a) The static census

`rg -n "translateInbound" src/` at HEAD (paths normalised to forward slashes):

```
src/extension/production-theta-producer.ts:225:import { translateInbound } from "../runtime/wire-translation";
src/extension/production-theta-producer.ts:3472:        translateInbound({
src/runtime/wire-translation.ts:31://   `Severity.High` — neither passes through `translateInbound`.
src/runtime/wire-translation.ts:130:export function translateInbound(input: InboundTranslationInput): ThetaValue {
```

Four lines: one definition, one import, one call, one prose mention. The call at
`:3472` is inside `#validateInvokeReturn` (`:3436`). `translateOutbound` has one
production caller of its own (`src/render/query-render.ts:423`) and is not this
report's subject.

### (b) Control — the `invoke<Box>` boundary 0067 wired

`lowerQueryResponseSchema("Box", …)` produces

```json
{"type":"object","properties":{"sev":{"$ref":"#/$defs/Sev"}},"required":["sev"],
 "additionalProperties":false,"$defs":{"Sev":{"type":"string","enum":["high","low"]}}}
```

AJV verdict over `{"sev":"high"}` is `{"ok":true}`. The derived plan carries
`rootDef "Box"` and two sidecars:

```
sidecar[Sev] {"wireNames":[],"namedEnumPositions":[{"pointer":"","enumName":"Sev"}],"refTargets":[]}
sidecar[Box] {"wireNames":[],"namedEnumPositions":[{"pointer":"/properties/sev","enumName":"Sev"}],"refTargets":[]}
```

After `translateInbound`:

```
root: json={"sev":"high"} enum=-    brand=Box ==Sev.High=false
.sev: json="high"         enum=ENUM brand=-   ==Sev.High=true
```

The root is branded `Box` and the named-enum field compares equal to a locally
constructed `Sev.High`. This is the specified end state, and it is what the three
boundaries below do not reach.

### (c) Typed query results — real `runTypedQueryLoop`

Driven through the production collaborators: `lowerQueryResponseSchema("Box", …)`
(the identical lowered document as (b)), the real `AjvSchemaValidator`, the real
`buildTypedQueryValidation`, and `runTypedQueryLoop` at `max_rounds: 0` with a
scripted `QueryModelDriver` whose forced-respond turn carries `{"sev":"high"}`.

```
typed-query outcome.kind value
query value      : json={"sev":"high"} enum=- brand=- ==Sev.High=false
query value .sev : json="high"         enum=- brand=- ==Sev.High=false
```

Same schema, same payload, same AJV verdict as (b); the bound value is the raw
payload. `schemaTagOf` recovers nothing, so both brand consumers — the QRY-18
outbound render's rename map and the `QuestionOperandDefectError` operand
summariser — see an anonymous object; and `box.sev == Sev.High` in body code is
`false` where (b) makes it `true`.

### (d) Binder `args` — real lowering, real AJV, real merge

Theta source:

```
---
description: probe
mode: prompt
model: m
params:
  sev: Sev
  note: string
---
enum Sev { High = "high", Low = "low" }
Sev.High
```

Loads with `diags []`. Its `params.loweredSchema` is

```json
{"type":"object","properties":{"sev":{"$ref":"#/$defs/Sev"},"note":{"type":"string"}},
 "required":["sev","note"],"additionalProperties":false,
 "$defs":{"Sev":{"type":"string","enum":["high","low"]}}}
```

`fillDefaultsAndRevalidate({binderArgs:{sev:"high",note:"n"}, defaults:[], validator})`
over the compiled validator yields:

```
merged args    {"sev":"high","note":"n"}
classification {"kind":"ok"}
args.sev       : json="high" enum=- brand=- ==Sev.High=false
```

`paramBindingsFrom` then casts each entry into body scope unchanged
(`theta-composition-producer.ts:97`, read from source — the function is
module-private), so the body's `sev` is a plain string.

The sidecar the rule needs is derivable from the document already in hand:
`buildInboundTranslationPlan` over that same `params.loweredSchema` returns

```
sidecar[<root>] {"wireNames":[],"namedEnumPositions":[{"pointer":"/properties/sev","enumName":"Sev"}],"refTargets":[]}
sidecar[Sev]    {"wireNames":[],"namedEnumPositions":[{"pointer":"","enumName":"Sev"}],"refTargets":[]}
```

(`<root>` is whatever root name the caller supplies as the plan's `annotation`;
the probe passed a placeholder, since no annotation names a `params:` document
today — choosing that name is part of the route in §Fix (a).)

Nothing calls it. The boundary already compiles this exact document for the
post-default-merge AJV check (`#mergeDeclaredDefaults`, `:1225`), so the missing
step is the call, not the data.

### (e) Typed `.theta`-callable tool-call returns — traced

Not driven; read from source at HEAD. `runToolCallEffect`
(`effectful-statement-host.ts:273`) routes a call classified `theta-callable`
through `runInvokeChild` (`:285–292`). `#resolveCallAsInvoke`
(`production-theta-producer.ts:3149`) constructs that child with `returnSchema`
`null`:

```ts
    // A `.theta`-callable call through `tools:` carries no `invoke<Schema>`
    // annotation, so there is no parse-time return-type site; the runtime AJV
    // net still applies at the query/typed boundary inside the callee.
    return this.#buildInvokeChild(theta, calleePath, argValues, ctx, chain, null, parentSignal, callerMode);
```

and `#validateInvokeReturn` returns immediately on that value:

```ts
    if (returnSchema === null || !result.ok) {
      return result;
    }
```

So a registered-theta tool call's return reaches the caller with no AJV check and
no translation pass, while `tool-calls.md:23` gives it the type `Result<T,
QueryError>` where `T` is the callee's inferred return type. The comment states
the mechanism accurately; the gap is that the inferred type is never materialised
as a runtime schema at this site.

### (f) Face 2 — union arms on the `invoke` boundary

Every row uses the real `lowerQueryResponseSchema`, the real `AjvSchemaValidator`
and the shipped `buildInboundTranslationPlan` + `translateInbound`. Every AJV
verdict is `{"ok":true}`.

| annotation | payload | lowered (abbrev.) | rebuilt end state |
| --- | --- | --- | --- |
| `Sev` | `"high"` | `{"type":"string","enum":[…]}` | enum, `== Sev.High` **`true`** |
| `Sev \| null` | `"high"` | `{"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}]}` | plain string, `== Sev.High` **`false`** |
| `Box` | `{"sev":"high"}` | `{"type":"object","properties":{"sev":{"$ref":…}}}` | brand `Box`; `.sev` enum, `== Sev.High` **`true`** |
| `Box \| null` | `{"sev":"high"}` | `{"anyOf":[{"$ref":"#/$defs/Box"},{"type":"null"}]}` | brand **absent**; `.sev` plain string, **`false`** |
| `array<Sev>` | `["high"]` | `{"type":"array","items":{"$ref":"#/$defs/Sev"}}` | element enum, `== Sev.High` **`true`** |
| `array<Sev \| null>` | `["high"]` | `{"type":"array","items":{"anyOf":[…]}}` | element plain string, **`false`** |

The derived plans show why. For `Sev` the root sidecar names the root position:
`namedEnumPositions [{"pointer":"","enumName":"Sev"}]`. For `Sev | null` the
reserved root sidecar is empty on all three maps:

```
rootDef #root  sidecars ["Sev","#root"]
sidecar[Sev]   {"wireNames":[],"namedEnumPositions":[{"pointer":"","enumName":"Sev"}],"refTargets":[]}
sidecar[#root] {"wireNames":[],"namedEnumPositions":[],"refTargets":[]}
```

The `Sev` sidecar exists and is correct; nothing in the lowered fragment says
that the materialised string is governed by arm 0 rather than arm 1. The same
emptiness at `array<Sev | null>` (`#root` carries no `/items` entry, where
`array<Sev>` carries `{"pointer":"/items","enumName":"Sev"}`) is why elements
lose their tags, and the `Box | null` row shows the loss compounding: the arm is
not descended into, so the object's own `/properties/sev` position is never
consulted either.

A separate fact bounding the rename half at this boundary:
`lowerQueryResponseSchema` emits theta-side property names —
`schema R { who as "Who": string }` lowers to `properties: {"who": …}`, and a
`{"Who":"w"}` payload is refused by AJV (`must NOT have additional properties`).
The derived sidecars therefore carry an empty `wireNames` map by construction,
which is what 0067's fix recorded when it applied the re-tag and re-brand halves
only. Face 2 is about the tag and the brand; no rename is available to lose here.

## Expected behaviour

- `docs/spec_topics/runtime-value-model.md:34` (§Wire-name translation, inbound
  bullet) — the obligation, verbatim in its closing sentence: "The rule applies
  uniformly to every inbound boundary — typed query results, tool-call return
  decoding where typed, `invoke` returns, and binder `args` — and is not restated
  per call site." The same bullet fixes the pass's content: "after AJV validation
  against the lowered schema, the runtime walks the validated JSON and (a)
  rebuilds the value with theta-side names using each schema's translation map,
  and (b) at every position the lowering pass's *Named-enum positions* sidecar
  ([Schema Subset — Lowering Algorithm](../spec_topics/schema-subset.md#lowering-algorithm)
  step 5) maps to a declaring-enum name, reattaches that enum's tag to the
  validated string so the resulting value compares equal to a locally constructed
  variant of the same enum." The boundary set is closed at four and the rule is
  stated once; there is no per-boundary carve-out, and the only stated exemption
  is the `params:`-defaults bypass (`:36`), which names the load-time default
  path, not any of the four.
- `docs/spec_topics/runtime-value-model.md:34` (same bullet, the depth clause) —
  "The walk recurses through arrays, nested object fields, and `Result.Ok` /
  `Result.Err` payloads; tags are attached at the same depth as the value the
  schema annotates and are never propagated to enclosing arrays, objects, or
  `Result` wrappers." The clause enumerates the structural forms the walk
  traverses. `anyOf` is not among them, and no sentence anywhere states what a
  union position does — which is the gap face 2 names, not a licence for the
  current behaviour.
- `docs/spec_topics/runtime-value-model.md:13` (the enum row of the
  representation table) — "An enum value carries the variant's wire string plus
  an interpreter-private tag identifying the declaring enum. Cross-enum equality
  compares both". `:22` fixes the consequence of an absent tag: a bare string and
  an enum variant share no common structural ground, so `==` evaluates to `false`
  and the comparison "loads and runs, it neither fails to parse nor panics at
  runtime". The measured `false` in §Reproduction (c), (d) and (f) is that rule
  applied to a value that should have carried the tag.
- `docs/spec_topics/schema-subset.md:87` (Lowering Algorithm step 5) — "The
  inbound translation pass in [Runtime Value Model — Wire-name
  translation](../spec_topics/runtime-value-model.md) reads this map to decide
  which validated string positions get the declaring-enum tag reattached." The
  sidecar is specified as a per-`$defs` artefact of the lowering pass, available
  wherever a lowered document is; §Reproduction (d) shows it derivable from the
  binder boundary's own already-compiled document.
- `docs/spec_topics/schema-subset.md:81` (SUBS-1) — "a union with any
  non-primitive arm MUST lower to `{ "anyOf": [...] }`". A named `enum` arm lowers
  through `$ref` and is non-primitive, so `Sev | null` is `anyOf` by
  specification, not by accident, and every named-enum-or-schema union is in the
  untranslated class.
- `docs/spec_topics/tool-calls.md:23` — the registered-theta row: "`Result<T,
  QueryError>` where `T` is the callee's inferred return type … when the callee
  `.theta` is statically resolvable per [Invocation — Static
  resolution](../spec_topics/invocation.md#static-resolution), its inferred return
  type … flows into the call site. Otherwise the runtime AJV check enforces it."
  This is the "tool-call return decoding where typed" of the inbound bullet's
  enumeration. At HEAD neither branch happens: no inferred type reaches the site
  as a schema, and the runtime AJV check does not run there.
- `docs/reference/type-system.md:153–154` (the reference mirror) — "Applies
  uniformly to typed query results, typed tool-call returns, `invoke` returns, and
  binder `args`." The obligation is stated on the surface a theta author reads as
  well as in the spec topic.

## Actual behaviour / root cause

**1. The rule has no enforcement surface, and the sentence that states it is the
reason.** "not restated per call site" is a documentation economy: it removes the
per-boundary prose that would otherwise sit beside each of the four sites. In the
code there is no counterpart — no shared entry point, no type that a boundary
must produce, no lint. A boundary satisfies the rule by calling
`translateInbound`, and three of the four do not. `rg -n "translateInbound" src/`
returns one call. 0067's §Options anticipated this exactly: "the spec's 'not
restated per call site' sentence is what makes the omission cheap to repeat — a
fix should also decide whether `translateInbound` gains a single enforced entry
point that every inbound boundary is required to route through." That decision
was not made, and this report is the omission recurring on schedule.

**2. Typed query results: the payload is the value.** `runTypedQueryLoop` treats
the AJV verdict as a gate and the payload as the product. Its terminal return is

```ts
  // The respond tool's validated value is the typed query's final result.
  return {
    kind: "value",
    value: forced.payload,
    rounds,
    forcedRespond,
    committed,
  };
```

(`src/runtime/query-tool-loop.ts:721–728`.) The respond-repair arm is the same
shape one layer up: `buildTypedQueryValidation` returns `{ kind: "validated",
value: turn.payload }` / `value: payload` (`typed-query-validation.ts:276`,
`:300`) and the loop forwards `repair.value` (`:705`). `runQueryEffect` hands the
result to the executor with no interposition
(`effectful-statement-host.ts:232–233`).
Everything on this path is correct for a value that needed no rebuild; nothing on
it knows the rebuild exists.

**3. The `.theta`-callable tool-call return never acquires a schema.** The
classification is right (`#classifyCall` returns `"theta-callable"` when the name
resolves to a callee path) and the routing is right (an invoke, not a
string-lowered tool call — FN-5). The loss is at `#resolveCallAsInvoke`, which
has no annotation to pass and passes `null`. `#validateInvokeReturn` then
short-circuits on the first line. The spec's typing for this row comes from
inference over the statically resolved callee, which the parent has already
parsed (`#driveCallee`'s `parseCallee` hook,
`production-theta-producer.ts:3270`, over the seam declared at `:469`); nothing
derives a lowered schema from it at this site.

**4. Binder `args`: a cast where the rule wants a walk.** The merged args are
AJV-validated against the theta's own lowered `params:` document
(`fillDefaultsAndRevalidate`, `defaulting.ts:151`) — the exact document a plan
would be derived from — and then projected:

```ts
  const bindings = new Map<string, ThetaValue>();
  for (const [name, value] of Object.entries(args)) {
    bindings.set(name, value as ThetaValue);
  }
```

(`src/extension/theta-composition-producer.ts:93–97`.) The `as ThetaValue` cast
is where the type system stops asking. A `params:` field declared as a named
`enum` lowers to a `$ref` and validates as a string; the string is what reaches
body scope. The child-side marshalled-params intake repeats the shape at
`production-theta-producer.ts:2145–2151`, so a subagent-root theta binds its own
params the same way.

**5. Face 2: the pointer keying has no image for `anyOf`.** `rebuildInbound`
walks a value against one sidecar and a JSON Pointer, descending `/items` for
array elements (`wire-translation.ts:247`) and `/properties/<field>` for object
fields (`:298–299`), and consulting `refTargets` to jump into a `$defs` entry
(`:240`). Those three descents are exactly the lowered forms that have a
data-space image: an array element IS at `/items`, a field value IS at
`/properties/<name>`, a `$ref` target IS the whole fragment. A union arm is not:
`{"anyOf":[A, B]}` describes two alternative schemas for one datum, and the datum
carries no marker saying which one it satisfied. AJV knows — it evaluated the
arms — but its verdict is `{"ok": true}` and nothing else. The walk therefore
arrives at a union position with a sidecar that addresses nothing there, and
returns the value untouched. That is a deliberate, documented stop
(`wire-translation.ts:33–41`; `:125–128`;
`production-theta-producer.ts:3430–3434`), and its cost is measured in
§Reproduction (f): not only no tag on the arm's own value, but no descent
beneath it, so a `Box | null` loses its brand and its nested tag together.

**6. Nothing reports any of it.** Every path here ends in a successful AJV
verdict. There is no diagnostic code for "a boundary bound an untranslated
value", no runtime event, and no assertion in the default suite that would red.
The only observable is the comparison the theta author writes, and it evaluates
`false` silently.

## Why it matters

- **`v == Sev.High` reads `false` where the spec fixes it at `true`, on three
  production paths, with no diagnostic.** Measured for the typed-query boundary
  and the binder-`args` boundary over the same schema and payload that read
  `true` through the boundary 0067 wired (§Reproduction (b), (c), (d)). A theta
  that matches on a query result or a bound param takes the wrong branch, and
  every surface — diagnostics, runtime events, the system-note channel — is
  silent.
- **The brand loss is not confined to equality.** `schemaTagOf` has two
  consumers: the QRY-18 outbound render's rename map and the
  `QuestionOperandDefectError` operand summariser. Both degrade silently on an
  unbranded value — 0120 measured that independently. A typed query result is
  unbranded at HEAD, and `docs/examples/handle-error.theta:12` is a committed
  theta on that path.
- **The failure mode is asymmetric between two boundaries an author reads as
  equivalent.** `invoke<Box>(…)` and a `Box`-returning `.theta` callable invoked
  through `tools:` are the same operation to a theta author — the second is
  routed through the same invoke trampoline by design (FN-5). One translates, the
  other does not even validate. Nothing in the source distinguishes them.
- **The binder boundary is where model output becomes a typed parameter.** A
  `params:` field declared as a named `enum` is the case the binder exists to
  handle: the model returns a wire string, the runtime is meant to hand the body a
  variant. It hands the body a string.
- **Face 2 makes the tag depend on a type annotation's shape rather than its
  content.** `invoke<Sev>` returns a tagged variant; `invoke<Sev | null>` returns
  a bare string for the identical non-null payload. `invoke<Box>` returns a
  branded object with a tagged field; `invoke<Box | null>` returns neither.
  Adding `| null` to an annotation — the ordinary way to express an optional
  result — silently disables the rule for that whole subtree.
- **The class is the one 0067 was filed and scored on.** 0067's own summary is
  "`v == Sev.High` is `false` in the parent where the identical value compares
  `true` in the child". This report measures the same sentence at three more
  boundaries and inside union arms at the fourth.
- **Nothing gates it.** No committed `.theta` / `.thetalib` declares a named
  `enum` at all, so the tag half is unexercised corpus-wide; the committed typed
  query that would exercise the brand half
  (`docs/examples/handle-error.theta:12`) is asserted by nothing on that axis;
  and the default suite's typed-query conformance cells use an anonymous
  string-literal union, which is specified to receive no tag. The three
  unperformed boundaries are unwitnessed in the direction that matters.
- **The spec statement is load-bearing for future boundaries.** "not restated per
  call site" means a fifth inbound boundary added later inherits the obligation
  without any prose naming it. With no enforced entry point, it inherits the
  obligation and no mechanism.

## Fix

Not settled. Face 1 is a wiring decision with four candidate scopes; face 2
cannot be implemented until a spec rule exists. The run selects a scope, states
the evidence that decided it, and carries the constraints in (e).

### Face 1 — the three unperformed boundaries

#### (a) Wire all three, with one enforced entry point

Give `translateInbound` a single required entry — a function every inbound
boundary calls, taking the lowered document, the annotation/root name and the
validated payload, and returning the theta-side value — and route
`#validateInvokeReturn`, the typed-query loop, the `.theta`-callable resolver and
the binder-`args` projection through it. Answers 0067's §Options question in the
affirmative.

- **The plan derivation already exists at two of the three sites.** The
  typed-query loop is handed `lowered` (`query-tool-loop.ts:692`) and the binder
  boundary compiles `params.loweredSchema`
  (`production-theta-producer.ts:1225`), matching the `invoke` boundary, which
  lowers the annotation (`:3454`). §Reproduction (d) confirms the derivation on
  the binder document directly. The `.theta`-callable site has no document at
  all — next bullet.
- **The typed-query leg is coupled to 0120.** Wiring it makes an inbound rebuild
  run over a MODEL-produced payload, which is the exact input 0120's §Reproduction
  measures as model-ordered and whose disposition 0120's §Fix (a)–(e) leaves
  undecided. 0120's coordination note reserves that boundary for itself. This
  route either lands after 0120's decision or makes it.
- **The `.theta`-callable leg needs a schema that does not exist yet.** The site
  has no annotation; `tool-calls.md:23` types it by inference over the resolved
  callee. Producing a lowered document there means deriving the callee's declared
  final-value shape parent-side — the cost 0067's §Options item 3 priced and
  declined for its own scope, and the reason that boundary is the most expensive
  of the three.
- **`rebuildInbound` must be hardened first —
  [0173](./0173-inbound-rebuild-record-not-null-prototyped.md).** 0067's residual
  3, now its own report: the record build uses plain assignment, so a payload key
  spelled `__proto__` reassigns the record's prototype and is dropped rather than
  becoming an own key (`Object.prototype` is NOT polluted; measured by that fix).
  It is unreachable on the `invoke` boundary — a declared field of that name never
  reaches the lowered `properties`, `additionalProperties: false` refuses the key,
  and neither a theta constructor nor a `JSON.stringify` envelope can produce it —
  and it becomes reachable the moment a **model**-produced payload boundary is
  wired, which all three legs here are. 0173 lands first, or a route here lands
  0173's change with its own.

#### (b) Wire the boundaries separately, one report-sized change each

Land the binder-`args` leg, the typed-query leg and the `.theta`-callable leg as
three changes.

- **They have genuinely different costs.** Binder `args` needs no new lowering —
  the document is compiled two lines earlier — and couples only to
  [0173](./0173-inbound-rebuild-record-not-null-prototyped.md), which every leg
  couples to. Typed query needs 0120 settled as well. `.theta`-callable needs a
  return-shape derivation that does not exist. Bundling them prices the cheapest
  at the cost of the dearest.
- **It leaves the rule partly unperformed for longer**, and — without (d) —
  leaves no mechanism preventing the next boundary from repeating the omission.
- **Each leg still needs its own witness.** The three boundaries share no test
  harness: the binder leg drives `runBinder` / `fillDefaultsAndRevalidate`, the
  typed-query leg drives `runTypedQueryLoop` with a scripted `QueryModelDriver`,
  the `.theta`-callable leg drives the invoke trampoline. Splitting does not
  duplicate witness work; it distributes it.

#### (c) Wire only where the boundary already holds a lowered document

Restrict to the typed-query and binder-`args` legs; leave the `.theta`-callable
return to a separate report, since its defect is the absent schema, not the absent
walk.

- **It matches the actual root causes.** Two boundaries have a document and skip
  the walk; the third has no document at all. §Reproduction (e)'s mechanism
  differs from §Reproduction (c)'s and (d)'s, and is arguably a different report.
- **It leaves a spec sentence unsatisfied and says so.** `tool-calls.md:23`'s
  inferred `T` would remain unenforced, which is a claim about validation as well
  as translation. A route taking this scope states that explicitly rather than
  letting the enumeration quietly shrink to three.

#### (d) The enforced entry point, with or without the wiring

Decide separately whether `translateInbound` gains a single required entry point.
0067's §Options poses it; nothing has answered it.

- **The failure it prevents is measured, twice.** 0067 was one boundary omitting
  the call; this report is three more. A shape that makes an inbound boundary
  unable to produce a bound value without routing through the pass converts a
  convention into a compile-time or test-time obligation.
- **It has a cost the run must price.** Every boundary's payload arrives with a
  different provenance (envelope `JSON.parse`, respond-tool arguments, merged
  binder args, marshalled child params) and a different failure disposition, so a
  common entry point either takes a wide input or forces each caller to normalise.
  Deciding the signature IS the work; the wiring is small once it exists.
- **Landing it with (a) or without it is itself the question.** An entry point
  introduced with no second caller is scaffolding; introduced after all four
  callers exist it is a refactor of working code. The run states which and why.

### Face 2 — union (`anyOf`) arms

**No code route exists until a rule is written.** The sidecar keys positions by
JSON Pointer into the lowered fragment; `anyOf` has no data-space image, so there
is no pointer to key and no fact in the lowered document identifying the governing
arm. Any implementation must first answer: *given a value that AJV admitted
against `{"anyOf":[A, B]}`, which arm's translation applies?* Candidate rules,
each of which is a spec edit before it is a code change:

1. **First matching arm, evaluated theta-side.** Re-test the value against each
   arm in source order and translate under the first that admits it. Deterministic
   (SUBS-1 fixes arm order at source order) but duplicates AJV's work and makes
   the translation depend on an evaluation the spec does not currently describe.
   Pathological where two arms both admit — `Sev | "high"` — which the rule must
   then adjudicate explicitly.
2. **Unique-admitting-arm only, no translation when ambiguous.** Translate when
   exactly one arm admits the value; leave it untouched otherwise. Narrower and
   states its own limit, but makes the tag's presence depend on the shapes of
   sibling arms, which is the behaviour face 2 currently names as the defect.
3. **Discriminator-driven, reusing step 6.**
   `docs/spec_topics/schema-subset.md:88` already runs discriminator detection
   over the lowered `anyOf` form. Extend the sidecar to carry the detected
   discriminator and dispatch on it. Principled for discriminated object unions;
   silent for `T | null` and for `string | Author`, which carry no discriminator —
   so it closes part of the class and must say which part.
4. **Emit arm-indexed pointers into the sidecar.** Key positions as
   `/anyOf/0/properties/sev` and have the walk resolve the index at runtime. Moves
   the problem rather than solving it: the runtime still has to decide the index.
5. **Decline, and state the limit normatively.** Add a sentence to
   `runtime-value-model.md`'s inbound bullet fixing that a value inside a union arm
   receives no tag, no brand and no descent — making today's behaviour specified
   rather than unaddressed. Cheapest, and the honest floor if none of 1–4 is
   chosen; it changes the language's guarantees, so it is a decision, not a
   no-op.

Constraints on face 2 whichever rule is chosen:

- **The rule lands in the spec first.** `runtime-value-model.md:34`'s inbound
  bullet is where the pass's positions are enumerated, and
  `schema-subset.md:87` is where the sidecar's maps are fixed; a dispatch rule
  touches one or both. No code lands ahead of that sentence.
- **The three amended code comments move with it.**
  `src/runtime/wire-translation.ts:33–41`, `:125–128` and
  `src/extension/production-theta-producer.ts:3430–3434` currently state the
  reach limit accurately. They stop being accurate the moment the reach changes,
  and they are the reason the code claims no coverage it lacks today.
- **`tests/wire-translation-inbound-retag.test.ts:200` is a live constraint.**
  That cell pins that a value at a plan-undescribed position keeps a brand it
  arrived with — "a rebuild there could only subtract". A route that starts
  descending into union arms must show it still cannot subtract, or renegotiate
  that cell with its rationale.
- **The anonymous-union rule is untouched.** `Severity.Low == "low"` stays
  `false` (`runtime-value-model.md:22`, `:34`), pinned by 0067's `anon` control
  cell (`tests/subagent-invoke-inbound-enum-tag.test.ts:311–316`). Face 2 is
  about a NAMED enum or schema sitting in a union arm, not about anonymous
  string-literal unions.

### (e) Constraints every route carries

1. **Ordering after AJV, never before.** `runtime-value-model.md:34` fixes the
   pass "after AJV validation against the lowered schema". Each new call site
   places it after that boundary's existing verdict and before the value binds —
   for the typed-query loop that is after `schemaValidation.validate`
   (`query-tool-loop.ts:693`) and after the respond-repair arm's own
   re-validation; for the binder that is after `fillDefaultsAndRevalidate`
   returns an `ok` classification.
2. **Re-tag and re-brand only where the wire-name map is empty.** The invoke
   boundary's derived sidecars carry an empty `wireNames` map because
   `lowerQueryResponseSchema` emits theta-side property names (§Reproduction (f),
   last paragraph), which is why 0067 applied only two of the three halves. Each
   new boundary re-measures its own document before assuming the same: a boundary
   whose lowered document DOES carry wire names needs the rename half, and
   applying a rename to an already-theta-side key corrupts it.
3. **0120's two open questions are not decided in passing.** Reordering into
   declaration order and the choice between `brandSchemaValue` and
   `buildObjectSchemaValue` are 0120's §Fix (a)–(e). 0067 called
   `brandSchemaValue` directly with its rationale at the call site precisely to
   avoid deciding them. Any route here that reaches the same code states which
   posture it takes and why.
4. **`rebuildInbound`'s record build is hardened before any model-produced
   payload boundary is wired.**
   [0173](./0173-inbound-rebuild-record-not-null-prototyped.md); see (a). All
   three legs here are model-produced payload boundaries, so this constraint
   binds every face-1 route without exception.
5. **The `params:` defaults bypass and the `Result` pass-through stay as they
   are.** `runtime-value-model.md:36` exempts frontmatter defaults, and
   `Result` is not a lowerable type form (`schema-subset.md`, step 3), so
   `translateInbound` passes a `Result` through by identity
   (`wire-translation.ts:249`, `rebuildInbound`'s `isResultValue` arm; pinned by
   `tests/wire-translation-inbound-retag.test.ts:256`). Neither is in scope.
6. **Test witness — unit, offline, provider-free, plus the live legs.** Each
   wired boundary gets a cell of the §Reproduction shape: real lowering, real
   AJV, the boundary's real driver, asserting the end state (`schemaTagOf` and
   `valuesEqual` against a locally constructed variant) rather than the JSON
   projection, which is identical either way. The binder leg reuses the
   `tests/defaulting-post-merge-classification.test.ts` harness; the typed-query
   leg reuses `tests/e2e-s3-typed-query-conformance.test.ts`'s scripted
   `QueryModelDriver` (`:84–95`). Each new assertion is proved both directions once — red
   with the translation call neutralised, green with it restored — per the
   repo's live-suite convention applied to the offline gate.
7. **GOV-15 observable (a) is what moves.** No route here refuses an input that
   loads today, so the loads-cleanly predicate
   (`docs/spec_topics/governance/source-language-stability.md:9`) is unchanged.
   What changes is the VALUE a boundary binds: a theta whose body compares a
   query result or a bound param against an enum variant flips from `false` to
   `true`, and `schemaTagOf` starts resolving where it did not. GOV-15
   (`:5`) promises identical return values across 1.x for a file that loads
   cleanly, so the fix is a deliberate departure from the observed 1.x behaviour
   toward the behaviour `runtime-value-model.md:34` specifies — a tension the run
   records rather than one GOV-15 blesses. The route enumerates the affected
   spellings (named-enum-typed and schema-typed positions at each wired boundary)
   in the fix record rather than leaving them to be discovered; the corpus census
   in §Affected found no committed fixture in the set.

## Non-goals

- **Whether an untyped `invoke(...)` should discard the callee's value.**
  `docs/spec_topics/invocation.md:28` (§Typed return) fixes that it does: "Untyped
  `invoke(...)` returns `Result<null, QueryError>` — the runtime discards the
  child's return value entirely." There is therefore no value at that boundary to
  translate, and the form is outside this report's domain. The design question was
  considered and declined at 0067; it is not reopened here.
- **What the inbound rebuild produces once it runs.** Declaration-order `keys()`
  and the brand-installation route are
  [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md)'s
  unsettled §Fix. This report measures only whether the rebuild runs, and (e)(3)
  records the boundary so no route decides 0120's questions by implementation.
- **Anonymous string-literal-union positions.** They are absent from the
  named-enum sidecar by specification (`runtime-value-model.md:34`;
  `schema-subset.md:87`) and receive no tag; `Severity.Low == "low"` stays
  `false`. Face 2 concerns a NAMED enum or schema inside a union arm.
- **`Result` values crossing the pass.** Not a lowerable type form, passed
  through by identity, pinned by
  `tests/wire-translation-inbound-retag.test.ts:256`.
- **Frontmatter `params:` defaults.** They bypass the inbound pass by
  specification (`runtime-value-model.md:36`) and arrive already branded and
  theta-side-named. §Reproduction (d)'s fixture declares no defaults for that
  reason.
- **The outbound direction.** `translateOutbound` has its own single production
  caller (`src/render/query-render.ts:423`) and its own coverage question; this
  report does not measure it.
- **The `__proto__` record-build hardening.**
  [0173](./0173-inbound-rebuild-record-not-null-prototyped.md) owns it, with its
  own settled §Fix. It is carried here only as a precondition of wiring a
  model-produced payload boundary ((a), (e)(4)); this report proposes no change
  to `rebuildInbound`'s record construction.
- **`tests/wire-name-translation.test.ts:24`'s stale "inert identity stubs"
  comment.** Correct when written, false since 0067. Bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s class, recorded here
  so a route does not treat it as evidence of the current state.

## Provenance

Filed as a residual of the bug 0067 fix (0.90.0, commit `e18b30e5`). The source
is that fix's report, `.pi/tmp/fixes/0067-report.md`, which records both faces
and directs that they be filed as ONE bug: R1 ("union (`anyOf`) positions are not
translated — *file as ONE bug with R2*") and R2 ("the enforced entry point +
three unperformed inbound boundaries"). The same two items appear in the shipped
bug doc as `## Fix (0.90.0)` *Residuals* 1 and 2. The same report's R3 is filed
separately as [0173](./0173-inbound-rebuild-record-not-null-prototyped.md) and is
cited here as a prerequisite, not restated. The report's own instruction that the
"should untyped invoke discard?" design question was declined by the operator is
honoured: it appears above only as a bounding fact citing `invocation.md:28`.

**Re-verified at HEAD `e18b30e5` for this filing, not copied.** The residual
records were treated as claims to check, not as facts to restate. What I checked
and what I found:

- **The census.** `rg -n "translateInbound" src/` returns four lines — definition
  (`wire-translation.ts:130`), import and call
  (`production-theta-producer.ts:225`, `:3472`), one prose mention
  (`wire-translation.ts:31`). The residual's "only production caller is
  `#validateInvokeReturn`" holds; I confirmed the call sits inside the method
  declared at `:3436`.
- **The typed-query boundary.** 0120 cites it at
  `src/runtime/query-tool-loop.ts:721–728`. That citation is still exact at this
  HEAD: `:721` is the comment, `:724` is `value: forced.payload,`, `:728` closes
  the object. It has not drifted since 0120 was written, so no correction to that
  report is owed. I also traced the two upstream `validated` returns
  (`typed-query-validation.ts:276`, `:300`) and the repair arm
  (`query-tool-loop.ts:705`), which the residual does not mention.
- **The `.theta`-callable boundary.** The residual names it as unperformed. The
  mechanism is more specific than "no translation": `#resolveCallAsInvoke`
  (`production-theta-producer.ts:3149`) passes `returnSchema` `null` (`:3164`),
  so `#validateInvokeReturn` returns at `:3442–3443` before AJV as well as
  before the pass. Read from source; recorded as element 3 and §Reproduction (e).
- **The binder-`args` boundary.** Traced to `paramBindingsFrom`'s cast
  (`theta-composition-producer.ts:97`) and driven at the seam: the lowered
  `params:` document, the real `AjvSchemaValidator`, and the real
  `fillDefaultsAndRevalidate` produce `{"sev":"high","note":"n"}` with
  classification `ok` and an untagged `sev`, while
  `buildInboundTranslationPlan` over that same document names
  `/properties/sev` as a `Sev` position. `paramBindingsFrom` is
  module-private, so its cast is read from source, not called; its input is the
  measured `merged.args`.
- **Face 2.** The residual's three measured values reproduce exactly: `Sev|null`
  lowers to `{"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}]}`, the AJV verdict
  is `{"ok":true}`, and `rebuilt == Sev.High` is `false`. Three additional rows
  are new to this filing and widen the recorded reach loss: `Box | null` arrives
  unbranded with its nested `sev` untagged (a union arm stops the descent, not
  only the tag), `array<Sev | null>` arrives with untagged elements where
  `array<Sev>` has tagged ones, and the `invoke<Box>` control confirms the
  branded/tagged end state on the wired boundary.
- **The three amended comments.** Present and accurate at
  `src/runtime/wire-translation.ts:33–41`, `:125–128`, and
  `src/extension/production-theta-producer.ts:3430–3434`.
- **The 0120 coordination note.** Present at
  `docs/bugs/0120-…md:992`, appended by 0067's fix, and it reserves the
  typed-query boundary to itself — the sentence this report's ordering clause
  rests on.
- **Spec citations.** `runtime-value-model.md:34` carries the four-boundary
  sentence verbatim as quoted; `:32`, `:35`, `:36`, `:13`, `:22` read as cited.
  `schema-subset.md:81` (SUBS-1), `:87` (step 5, "three maps" — amended by 0067's
  fix), `:88` (step 6) read as cited. `tool-calls.md:23` carries the
  registered-theta row. `invocation.md:28` carries §Typed return.
  `docs/reference/type-system.md:145`, `:153–154` carry the mirror. Every line
  number above was read at `e18b30e5`; volatile positions are named by symbol
  beside their line per bug 0134's adjudication.

**Method.** One scratch vitest file, offline and provider-free, over the shipped
seams named in §Observed at; written, run, and deleted. Every table value and
every quoted JSON fragment in §Reproduction is that run's output verbatim. The
corpus census was re-run over `git ls-files` (34 `.theta` / `.thetalib`; 17 with
`params:`; zero declaring a named `enum`; zero declaring an `as` rename; two
typed queries). The committed-cell inventory in §Affected was grepped over
`tests/` at the same HEAD. Two facts are read from source rather than exercised
and are marked as such in the text: `paramBindingsFrom`'s cast and
`#resolveCallAsInvoke`'s `null` argument, both module-private.

## Fix (0.97.0) — face 1 + the bug 0120 order half

- **What shipped:**
  - `src/parser/schema-lowering.ts` — `SchemaSidecar` gains an optional
    *field-order* list (theta-side field names of that `$defs` entry's own object
    body, in declaration order); `buildSidecar` takes it as an optional second
    argument; `buildInboundTranslationPlan` derives it on the object-fragment
    branch only, from the `properties` walk it already performs.
  - `src/runtime/wire-translation.ts` — `rebuildInbound`'s record build iterates
    a new `orderedEntries` helper: every field the list names first, in
    declaration order, then every remaining payload key in the relative order the
    payload carried. `rebuildUnder`'s doc comment now states the two structural
    reasons the brand install stays `brandSchemaValue`-direct (§Fix (e)(3)).
  - `src/runtime/inbound-boundary.ts` (new) — the plan derivation and the walk
    composed once: `decodeInboundValue` for a boundary holding a lowered document
    and an annotation, `bindParamsInbound` for the two `params:` projections. A
    shared step, not an enforced entry point.
  - `src/runtime/effectful-statement-host.ts` and
    `src/extension/production-theta-producer.ts` — boundary 1: `QueryHostDispatch`
    carries the typed query's decode step and `runQueryEffect` applies it to the
    loop's `value` outcome, where the terminal forced-respond return and the
    respond-repair arm converge (§Fix (e)(1)).
  - `src/extension/production-theta-producer.ts` and `src/parser/functions.ts` —
    boundary 2: the invoke trampoline threads a three-arm return typing
    (`annotated` / `callee-inferred` / `untyped`) instead of a bare annotation
    string, so a `.theta`-callable call resolves its return type by inference
    over the parsed callee (`inferCalleeReturnAnnotation`, FN-3) against the
    CALLEE's declarations, while `invoke<Schema>` keeps resolving against the
    caller's and a bare `invoke(...)` derives nothing.
  - `src/extension/theta-composition-producer.ts` and
    `src/extension/production-theta-producer.ts` — boundary 3, both projections:
    the parent-side `paramBindingsFrom` and the child-side marshalled-params
    intake bind through `bindParamsInbound`.
  - `docs/spec_topics/schema-subset.md` step 5 and its
    `docs/reference/schema-subset.md` mirror — the sidecar's fourth item and the
    order rule it carries.
- **Gates** (at the committed tree): the four witness files —
  `Tests  17 passed (17)`. Full default suite — `Test Files  300 passed (300)`,
  `Tests  4921 passed (4921)`. `npm run typecheck` clean; `npm run lint` clean.
  Live: H8a `tests/live/live-production-acceptance.test.ts`
  `Tests  37 passed (37)`; H9a acceptance 11/11 across both files (10 + 1);
  `tests/live/typed-query-wire-shapes.test.ts` `Tests  2 passed (2)`.
  `permitted-codes.json` byte-unchanged by the real H9a run (`git hash-object`
  equal before and after).
- **Review:** two rounds plus one comment-only polish. Round 1 — three blockers:
  a host-side fallback decoder that re-derived the `schema` / `enum` name sets
  from a resolver predicate (a third derivation of the same step, and
  production-dead), a step-5 sentence contradicting the shipped reorder, and the
  mode-blindness of the `callee-inferred` derivation. The first two were fixed;
  the third is dispositioned below. Round 2 — CLEAN, four non-blocking
  residuals. The polish round touched comments only; verified by gate-diff, so no
  confirmation review round was run.
- **Verification:** SOLID. Each of the four witnesses was proved both directions
  by a targeted neutralisation of its own production wiring, restored
  blob-hash-identical — no cell stayed green under its own neutralisation. Full
  suite green. Live coverage was exercised for real, and boundary 2 had none, so
  the verifier added one H8a cell (additive, `+141/-0`) driving a `tools:`-named
  subagent callee whose return is a bare enum variant, proved red then green
  against a live model. Lint and typecheck clean.
- **Packaging.** One commit for all three legs plus the order half, so the spec
  sentence this report measures is satisfied at every boundary it names in a
  single step rather than left part-performed across releases.
- **Order carrier — the choice and what it displaces.** Bug 0120 §Fix (a1): a
  per-schema field-order item on the step-5 sidecar, derived at plan time inside
  `buildInboundTranslationPlan`, which already walks the lowered document whose
  `properties` insertion order IS declaration order (`schema-subset.md` step 3,
  *Array element order*). Rejected: (a2), reading the lowered fragment at the
  seam — it widens `translateInbound`'s input shape and forces the caller to
  state which name space `required` is in; (a3), resolving the declaration at
  rebuild time — it drags a lexical environment into a leaf module whose import
  surface is two type-only edges. 0120's route (c), qualifying `expressions.md`
  by provenance, is rejected outright: it re-splits a clause bug 0080 made
  single. The order is established at the rebuild ONLY —
  `tests/ctor-declaration-order.test.ts` cell (S) forbids sorting at the read,
  and nothing on the read path changed. The brand install stays
  `brandSchemaValue`-direct rather than routing through `buildObjectSchemaValue`,
  for two structural reasons stated at the call site: that function builds a
  plain `{}` record, so a payload key spelled `__proto__` would be swallowed by
  the inherited setter and bug 0173's null-prototype build undone; and it orders
  by a RESOLVED declaration, where a `#root` or `__inline_<slug>` position names
  no declaration to resolve.
- **Fallback where no carrier exists.** A sidecar carrying no field-order list —
  a synthesised one, a permissive root, a `$defs` entry with no object body —
  preserves payload order unchanged. That is what keeps every landed seam cell in
  `tests/wire-translation-inbound-retag.test.ts` green: its sidecars are
  hand-built and carry no list.
- **Per-boundary wire-name measurement (§Fix (e)(2)).** Re-measured at each of
  the three boundaries rather than assumed from the `invoke` one: every sidecar
  `buildInboundTranslationPlan` derives carries an EMPTY wire-name map, because
  the lowering all three consume emits theta-side property names. Measured
  `sidecar[Box] {"wireNames":[],"namedEnumPositions":[{"pointer":"/properties/sev","enumName":"Sev"}],"refTargets":[],"fieldOrder":["sev","who"]}`
  for a typed-query / `invoke` annotation, and `sidecar[#root]` of the same shape
  for a `params:` document. No rename is applied at any of them; applying one to
  an already-theta-side key would corrupt it.
- **The `.theta`-callable leg's lowerability boundary.** `tool-calls.md:23` types
  the row by inference over the statically resolved callee. FN-3 reconciles the
  tail expression with every early `return` operand by a least upper bound that
  needs the type layer's environment, which a runtime call site does not hold, so
  the derivation names a type only where that reconciliation is vacuous and the
  tail's type is legible from syntax alone: a schema-constructor tail naming a
  declared `schema`, or an enum-variant tail naming a declared `enum`, in a body
  carrying no `return`. Every other callee keeps no schema — no AJV check, no
  translation pass — which is the disposition that row's "otherwise the runtime
  AJV check enforces it" leaves to a boundary with no type in hand. The floor is
  deliberate in that direction: naming a WIDER type than the callee returns would
  refuse a conforming return. Residual 1 records what stays unenforced.
- **Order at the `invoke` boundary.** The order half lands in the shared walk, so
  the boundary bug 0067 wired now runs it too. It is vacuous there — that
  boundary's producer is a theta child whose object `buildObjectSchemaValue`
  already ordered before `JSON.stringify` — but it is now guaranteed by the walk
  rather than incidental to the producer.
- **Bug 0174 interaction, and a correction to what was expected.** Wiring
  boundary 2 adds an in-process AJV validation class, and bug 0174 (open) is that
  an in-process named-enum value reaches AJV as a boxed `String` and is refused.
  The expectation carried into this run was that a prompt-mode `.theta`-callable
  with an enum-bearing return would draw that spurious `Err`. It cannot, from a
  theta that loads: `tools:` `.theta` entries "must point at subagent-mode theta
  files — a prompt-mode callee in `tools:` is `theta/load/prompt-mode-callable`"
  (`docs/spec_topics/frontmatter/frontmatter-fields-a.md:79`), that diagnostic is
  severity `error` and "prevent[s] the theta from being registered"
  (`frontmatter-fields-b-and-templates.md:18`), and it is raised at
  `src/parser/callable-set.ts:408`. So the `callee-inferred` arm's callee is
  always subagent-mode, whose value crosses as JSON and reaches AJV as a plain
  string. The prompt→prompt in-process arm of `#driveCallee` is reachable only
  through `invoke(...)`, which takes the `annotated` / `untyped` arms and is
  unchanged by this fix. The one place the in-process combination is constructed
  at all is a test that hand-builds its callable set past the load gate
  (`tests/result-value-privacy.test.ts`), and its cells are green because their
  callees' returns carry no enum position. Every witness cell here uses a
  subagent-mode callee; nothing pins the defective combination in either
  direction.
- **GOV-15 (§Fix (e)(7)).** No route here refuses an input that loads today, so
  the loads-cleanly predicate is unchanged. What changes is the VALUE a boundary
  binds, at these spellings: a typed query whose annotation is a named `enum`, or
  a named `schema` (root brand, plus a tag at every named-enum field, plus
  declaration-ordered `keys()`); a `params:` field declared as a named `enum` or
  a named `schema`, at both the parent-side and child-side projections; and a
  `.theta`-callable call whose callee's inferred return type is a named `enum` or
  a named `schema`. A theta comparing such a value against an enum variant flips
  from `false` to `true`, and `schemaTagOf` starts resolving where it did not.
  GOV-15 promises identical return values across 1.x for a file that loads
  cleanly, so this is a deliberate departure from the observed 1.x behaviour
  toward the behaviour `runtime-value-model.md:34` specifies — a tension recorded
  rather than one GOV-15 blesses. The corpus census found no committed fixture in
  the set. One caveat the report's own text does not cover: the `.theta`-callable
  leg's new AJV net CAN newly refuse a return that previously bound raw, because
  that boundary acquired validation as well as translation. That is
  `tool-calls.md:23`'s specified enforcement, and it reaches a conforming callee
  never — the derivation names the callee's own tail type, which its own value
  satisfies by construction.
- **Face 2 is NOT implemented.** No code descends into an `{"anyOf":[…]}` arm;
  the diff touches no `anyOf` line. Union positions keep the documented
  pass-through, the three amended comments stay accurate, and the retag cell
  pinning that a brand at a plan-undescribed position survives the walk is
  untouched and green — the reorder cannot reach such a position, because
  `rebuildInbound` returns before the record build whenever the sidecar is
  absent or the pointer is not the fragment root.
- **Residuals:**
  1. **`tool-calls.md:23` stays partly unenforced.** A callee whose FN-3 return
     type is legible only to the type layer — a `let`-bound tail, a conditional
     tail, any body carrying a `return` — still crosses with no schema, so
     neither AJV nor the pass runs on it. Pinned in both directions by the
     derivation-floor control cells in
     `tests/inbound-boundary-theta-callable.test.ts`, so a later widening cannot
     happen silently.
  2. **The child-side `params:` projection is wired but unwitnessed.** It routes
     through the same `bindParamsInbound` the parent-side witness drives, so the
     untested surface is call-site plumbing only. It could not be witnessed
     because a `params:` field declared as a named `enum` or a named `schema` on
     a `mode: subagent` callee makes the spawned child exit 0 with NO
     `theta_result` envelope, measured differentially against a
     `params: sev: string` control that succeeds through the identical harness.
     That failure is a distinct defect, unfiled, and it blocks any witness of
     this projection.
  3. **`vo.keys()` in a schema-constructor field position kills a spawned child
     drive** — the root exits 0 with no envelope. Observed while building the
     boundary-2 witness and worked around by removing the field; unfiled, and
     apparently unrelated to this report.
  4. **The enforced-entry-point question stays open.** 0067 §Options asks whether
     `translateInbound` should gain a single required entry point that every
     inbound boundary must route through. This run deliberately did not answer
     it: `src/runtime/inbound-boundary.ts` is a shared step with no enforcement,
     and its header says so. A round-1 finding removed a host-side fallback that
     would have answered it unilaterally for one boundary.
  5. **Positional-citation drift in this report.** §Affected cites
     `theta-composition-producer.ts:97` for the cast (`:98` at the fix HEAD) and
     `src/parser/params.ts:404–414` for the `params:` lowering (`:431–441`).
     Bug 0134's adjudicated class; disclosed, not chased.
- **Discharge notes appended:** bug 0120
  (`## Coordination note — bug 0172 (0.97.0)`), recording that the order half
  landed at the rebuild, by which mechanism, and at which boundaries. No other
  sibling document was edited.
- **Pinned dispositions / non-goals:** face 2 stays this report's open subject;
  the untyped-`invoke` discard question is untouched (`invocation.md:28`); the
  `params:` defaults bypass and the `Result` pass-through are unchanged;
  `tests/wire-name-translation.test.ts:24`'s stale comment is left as bug 0134's
  class.
- **Self-authorizations.** Two existing test files were changed, both on the
  authority of §Fix (e)(7)'s statement that the value a boundary binds is what
  moves. `tests/respond-tool-wire.test.ts` — its two enum-root cells asserted
  `toEqual("low")` on a value that is now a tagged variant; re-pinned to
  `valuesEqual` against a locally constructed variant, which is strictly stronger
  (`toEqual` between two boxed strings is tag-blind) and leaves each cell's own
  subject, the envelope unwrap, unweakened. `tests/result-value-privacy.test.ts`
  — its `rootDouble()` supplied no `schemaValidator`, a collaborator the
  `.theta`-callable leg now reaches; the DOUBLE was completed with the real
  `AjvSchemaValidator` and no assertion was touched. Neither file is a protected
  witness; both flips were measured before the witnesses were written and
  bucketed against this report's own authorization.

**This report stays OPEN, narrowed to face 2.** Face 1 is discharged at every
boundary `runtime-value-model.md:34` enumerates. What remains is the arm-dispatch
rule: a value inside a `{"anyOf":[…]}` arm still receives no tag, no brand and no
descent, because the sidecar is keyed by JSON Pointer and `anyOf` has no
data-space image. That is a spec question before it is a code change, and §Fix
face 2 states the five candidate rules it must be answered from.

## Coordination note — bug 0178 landed (0.101.0)

The block this report's `## Fix (0.97.0)` recorded on its own child-side witness
is **lifted**. Bug 0178 fixed the load-time binder-model gate's blindness to the
subagent-root regime, so a `mode: subagent` callee whose `params:` block is not
binder-bypass-eligible now registers inside its own spawned child instead of
degrading to a prompt and exiting 0 with no envelope.

**The witness landed there, not here, and nothing stays owed to this report.**
`tests/subagent-root-binder-model-exempt.test.ts`'s `penum` row drives a callee
declaring `params: sev: Sev` whose body is `sev == Sev.High` across a real
spawned child boundary and asserts `true` — an untagged bare `"high"` would take
`valuesEqual`'s cross-type arm and read `false`, so the assertion observes
`#intakeSubagentRootParams` routing the marshalled JSON through
`bindParamsInbound` and reattaching the declaring-enum tag. That is the
child-side leg of the boundary-3 projection this report's face-1 fix wired and
could not pin.

`tests/inbound-boundary-binder-args.test.ts`'s §*THE CHILD SIDE IS NOT WITNESSED
HERE* paragraph was corrected in the same commit, on the authority of bug 0178
§Fix (c)(6); that file keeps the parent-side projection and its assertions are
unchanged.

**This report's status is unaffected.** It stays open, narrowed to face 2 (the
`anyOf` arm dispatch), which bug 0178 did not touch: `src/parser/**` is
byte-untouched and no union position moved.

## Fix (0.102.0) — face 2, the `anyOf` arm-dispatch rule

**The settled rule, and where its authority comes from.** §Fix face 2 listed
five candidate rules and could implement none of them, because choosing one is a
specification question. The operator adjudicated it for this run, selecting
**candidate 1 — first-ADMITTING-arm dispatch** — and settling the case that
candidate's own text flagged as pathological:

> Given a value AJV admitted against `{"anyOf":[A,B,…]}`, re-test the value
> against each arm IN SOURCE ORDER (SUBS-1, `schema-subset.md` §Lowering
> Algorithm step 3, already fixes arm order at source order) and translate under
> the FIRST arm that admits it. The two-arms-both-admit case (`Sev | "high"`) is
> adjudicated FIRST-MATCH-WINS, and that adjudication is written into the spec
> sentence, not only into the code. Re-testing an arm uses the already-lowered
> arm fragments through the content-addressed compiled-validator cache
> (`src/seams/schema-validator.ts`) — never a hand-rolled second validation path
> and never a second compile route.

Candidates 2–5 are therefore closed for this report: 2 (unique-admitting-arm
only) makes the tag's presence depend on sibling arm shapes, which face 2 names
as the defect; 3 (discriminator-driven) closes only the discriminated-object
part of the class and is silent for `T | null`; 4 (arm-indexed pointers) moves
the decision rather than making it; 5 (decline and specify the limit) was
declined by the adjudication.

- **What shipped:**
  - `docs/spec_topics/runtime-value-model.md` §"Wire-name translation", inbound
    bullet — the rule, normatively, with the FIRST-MATCH-WINS adjudication
    stated in the sentence, the no-arm-admits case, and the brand invariant: a
    branded value never comes out unbranded; a declared-`schema` arm installs
    that schema's brand exactly as a non-union position referencing the same
    schema does; an arm naming no declared `schema` re-installs the brand the
    value arrived with.
  - `docs/spec_topics/schema-subset.md` Lowering Algorithm step 5 — the sidecar
    is now "four maps and a field-order list": item (5) *Union arms*, on the
    same JSON-Pointer keying as (2) and (3), each arm carrying the
    self-contained lowered document it is re-tested against plus the declaring
    `enum` name or the `$defs` entry the pass descends into. A fragment with no
    `anyOf` position carries no such map.
  - `docs/reference/type-system.md` and `docs/reference/schema-subset.md` — the
    two mirrors, in their compressed register. A sweep
    (`rg -n "Applies uniformly|named-enum positions|inbound translation pass"
    docs/reference docs/spec_topics`) found no third mirror.
  - `src/parser/schema-lowering.ts` — `SidecarUnionArm` / `SidecarUnionPosition`
    and `SchemaSidecar.unionArms`; `buildSidecar` records arms per position;
    `buildInboundTranslationPlan` gains an `anyOf` branch in `classify` and a
    `describeArm` helper that mints a `$defs` entry for a structural arm so the
    walk re-enters it at that entry's own root.
  - `src/runtime/wire-translation.ts` — `rebuildInbound` dispatches at a union
    position through `rebuildUnderFirstAdmittingArm` / `firstAdmittingArm`;
    `InboundTranslationInput` gains an optional `schemaValidator`.
  - `src/runtime/inbound-boundary.ts`, `src/extension/production-theta-producer.ts`
    and `src/extension/theta-composition-producer.ts` — the validator is threaded
    to all four inbound boundaries: the typed-query decode closure,
    `#validateInvokeReturn` (covering `invoke<T>` and the typed
    `.theta`-callable return), the child-side marshalled-params intake, and the
    parent-side binder-`args` projection (through a `schemaValidator` accessor on
    the production producer, read off `ThetaProducerDeps`).
  - The three amended reach-limit comments moved in the same commit, as §Fix
    face 2 requires: the `wire-translation.ts` module header's *positions this
    pass reaches* paragraph, `translateInbound`'s doc comment, and
    `#validateInvokeReturn`'s doc comment. Each now states the dispatch, cites
    the rule's home, and states the no-arm-admits case.
- **Gates** (at the committed tree): witness
  `npx vitest run tests/inbound-union-arm-dispatch.test.ts` — `Tests  19 passed
  (19)`. Full default suite — `Test Files  306 passed (306)`, `Tests  5024
  passed (5024)` (baseline 305 / 5005). `npm run typecheck` clean; `npm run
  lint` clean. Live: H8a `tests/live/live-production-acceptance.test.ts`
  `Tests  40 passed (40)` for real (39 shipped plus the additive cell 40 below);
  H9a `tests/live/acceptance/` `Test Files  2 passed (2)`, `Tests  11 passed
  (11)` across BOTH files; `tests/fixtures/h7a/permitted-codes.json`
  byte-unchanged by the real H9a run (`git hash-object` `a4a8da04…` before and
  after). `tests/committed-fixture-parse-gate.test.ts` — `Tests  36 passed
  (36)`, which is what discharges the corpus-wide "no shipped source moves"
  claim.
- **Review:** two rounds. Round 1 (deep) — three `test` blockers and five
  non-blocking items. The blockers: the array-arm minting branch was
  production-reachable but unwitnessed; the brand re-install that discharges the
  no-subtraction constraint could not red; and none of the four
  `schemaValidator` thread lines could red, so deleting any one of them would
  have silently reverted that boundary while the suite stayed green — the exact
  per-boundary-omission mode this bug family exists to close. The non-blocking
  five: the spec sentence overclaimed on brands in the cross-brand corner, four
  doc comments still said "three maps", one comment narrated history, the
  witness header miscounted its own cells, and `firstAdmittingArm`'s doc
  misstated what the invoke boundary's verdict had read. All eight were fixed in
  one fixer round; the witness grew 11 → 19 cells, four of them driving the real
  production boundaries. Round 2 (fast) — CLEAN, no findings, no residuals.
- **Verification:** SOLID. Seven targeted production neutralisations, each
  restored blob-hash-identical and each producing exactly its predicted red set
  and no other: the union-dispatch branch (15 RED cells fall, the 4 CONTROLs
  stay green), the array-arm mint (2 cells), the brand re-install (1 cell), and
  the four thread lines (1 cell each). Full suite green. Live coverage was
  exercised for real, and no shipped H8a cell drove a union-typed inbound
  position — cells 32 / 37 / 38 all annotate a bare `Sev`, and cell 39's `anyOf`
  arms are anonymous inline objects whose assertions read the AJV verdict alone
  — so the verifier added cell 40 (additive, append-only; no existing cell's
  assertions touched): a subagent callee tailing an enum variant under an
  `invoke<Sev | null>` parent, rendering `v == Sev.High`. Proved both directions
  live: green with the fix, `Rendered segment: "false"` with the dispatch branch
  neutralised, green again after restore. Lint and typecheck clean.
- **The (f) table, re-measured.** §Reproduction (f)'s six rows were re-derived at
  HEAD `acea6749` before any code moved and reproduced EXACTLY as filed — no
  drift across the five fixes that landed since they were measured. All six now
  reach the specified end state:

  | annotation | payload | end state at 0.102.0 |
  | --- | --- | --- |
  | `Sev` | `"high"` | enum, `== Sev.High` **`true`** (unchanged) |
  | `Sev \| null` | `"high"` | enum, `== Sev.High` **`true`** |
  | `Box` | `{"sev":"high"}` | brand `Box`; `.sev` **`true`** (unchanged) |
  | `Box \| null` | `{"sev":"high"}` | brand `Box`; `.sev` **`true`** |
  | `array<Sev>` | `["high"]` | element **`true`** (unchanged) |
  | `array<Sev \| null>` | `["high"]` | element **`true`** |

  Two rows measured beyond the filed table: `Sev | Box` dispatches by re-test,
  not by position — `"high"` takes arm 0 and tags, `{"sev":"high"}` takes arm 1
  and brands; and `Sev | "high"` lowers to
  `{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}`, whose second arm is the EMPTY schema
  and admits every value, so it is a genuine both-arms-admit case and the
  FIRST-MATCH-WINS adjudication resolves it to a tagged `Sev`.
- **No-subtraction, discharged rather than renegotiated (§Fix face-2 constraint).**
  `tests/wire-translation-inbound-retag.test.ts`'s plan-undescribed cell is
  **byte-untouched and green**. Its premise assertions still hold literally: the
  arms live in their own fifth map, so `U2`'s sidecar still carries
  `refTargets []` and `namedEnumPositions []` at `/properties/q`, and the cell
  supplies no validator, so it exercises the documented pass-through. That the
  property survives the descent is witnessed twice in the new file, on the two
  distinct code paths: `CONTROL (no-subtraction)` re-drives that cell's own
  fixture WITH a validator — the arm names declared `Person2`, the walk re-enters
  that entry and the same brand is installed by the normal declared-name path —
  and `RED (non-declared-arm-brand)` drives an inline-object arm hoisted to a
  `__inline_<slug>` entry that is NOT in `schemaNames`, where the incoming brand
  is re-installed explicitly. An under-arm rebuild only ADDS.
- **§Fix (e) constraints.** (e)(1) the dispatch runs inside `translateInbound`,
  after each boundary's own verdict, at all four sites. (e)(2) re-measured, not
  assumed: every sidecar the plan derives — including the `__inline_<slug>` and
  minted arm entries reached ONLY through an `anyOf` arm — carries an empty
  wire-name map, because the lowering all four boundaries consume emits
  theta-side property names; no rename is applied anywhere. (e)(4) 0173's
  null-prototype record build is untouched and is the only record build on the
  path: `rebuildUnderFirstAdmittingArm` constructs no record of its own, it
  re-enters `rebuildInbound`. (e)(5) the `params:`-defaults bypass and the
  `Result` identity pass-through are unchanged, the latter re-probed at its worst
  case — a `Result` at a union position whose inline arm admits its JSON shape
  returns the same reference. (e)(6) every new assertion was proved both
  directions once. (e)(7) below.
- **GOV-15 (§Fix (e)(7)) — the silent untagged→tagged flips, enumerated.** No
  input that loads today is refused, so the loads-cleanly predicate is unchanged;
  what moves is the VALUE a boundary binds, at exactly these spellings, each of
  which §Reproduction (f) or its `params:` analogue measured `false` and which
  now read `true`:
  1. `invoke<T | null>` — and any `invoke<…>` whose annotation is a union with a
     named `enum` or `schema` arm. The root tags or brands, and a schema arm's
     nested named-enum fields tag at their own depth.
  2. A typed query `@<T | null>`, and any union-annotated typed query.
  3. A typed `.theta`-callable return whose inferred type is union-shaped, which
     routes through the same `#validateInvokeReturn` thread line.
  4. `params:` fields declared with a union type carrying a named `enum` or
     `schema` arm, at BOTH projections: the parent-side binder-`args` bind and
     the child-side marshalled-params intake.
  5. Union-typed positions nested anywhere the walk reaches — an object field
     (`schema U { q: Person | null }`), an array element (`array<Sev | null>`),
     an array-typed arm (`array<Sev> | null`), and an array-typed arm whose own
     element is a union (`array<Sev | null> | null`).
  6. `schemaTagOf` begins resolving on a schema-typed value that arrived through
     a union arm, so both of its consumers — the QRY-18 outbound render's rename
     map and the `QuestionOperandDefectError` operand summariser — stop degrading
     there.

  GOV-15 promises identical return values across 1.x for a file that loads
  cleanly, so this is a deliberate departure from the observed 1.x behaviour
  toward the behaviour `runtime-value-model.md` specifies — a tension recorded
  rather than one GOV-15 blesses. The corpus census stands: no committed
  `.theta` / `.thetalib` declares a named `enum` at all, so no shipped fixture is
  in the set, and `tests/committed-fixture-parse-gate.test.ts` is green.
- **Bug 0174 interaction, pre-measured and confirmed.** The `(ANYOF)` cell of
  `tests/invoke-return-enum-carrier-projection.test.ts` was measured BEFORE the
  descent was written, and its assertion outcomes are unchanged: the in-process
  value there is the boxed `String` carrier `makeEnumValue` builds
  (`typeof "object"`), which arm 0 refuses on its `type: "string"` check and arm
  1 on its `type: "null"` check, so no arm admits and the value reaches the
  caller by identity. The cell's COMMENT wording was falsified by the reach
  change and was re-derived in the same commit under the operator's rider —
  comment-only, zero assertion and zero executable-line changes, verified
  mechanically. `tests/invoke-prompt-cell-enum-return.test.ts` carries no such
  wording and is byte-unchanged.
- **Why the validator is optional, and what that costs.** `schemaValidator` is an
  optional member on `InboundTranslationInput`, `InboundBoundaryInput`,
  `ParamsBindingInput` and `ThetaProducerDeps` — the house pattern for
  `ThetaProducerDeps` (`isSubagentRootFor?`, `driveSubagentRootRegime?`). Absent,
  no arm dispatch runs and a union position keeps the pass-through the reach-limit
  comments described. That is what makes this change's blast radius across the
  default suite ZERO: every hand-built-sidecar seam test and every in-memory
  harness supplies none and is unaffected, so no existing witness needed editing.
  Its cost is that a future boundary could omit the thread line, which is why all
  four production thread lines are now individually red-provable.
- **Residuals:**
  1. **A string-literal union arm lowers to the EMPTY schema.** `Sev | "high"`
     lowers to `{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}` — not `{"const":"high"}`
     as `schema-subset.md` step 3's *Literal* row specifies. Measured at HEAD
     `acea6749` before any code moved, so it is not caused by this fix, and the
     adjudicated rule is deterministic over it either way. The consequence worth
     recording: a value at `"high" | Sev` — literal arm FIRST — takes the empty
     arm and receives no tag, where `Sev | "high"` tags. Pinned loudly by
     `RED (first-match-wins)`, which asserts the arm shapes as its premise, so a
     later lowering change reds there rather than silently altering the dispatch.
  2. **The enforced-entry-point question stays open**, as at 0.97.0.
     `src/runtime/inbound-boundary.ts` is a shared step, not an enforced entry
     point, and its header says so. This run deliberately did not answer it; the
     four red-provable thread lines are the test-time substitute for the
     compile-time obligation an enforced entry point would give.
  3. **A nested union INSIDE an arm** (`Sev | (Box | null)`) is not exercised.
     Theta's grammar flattens that spelling, so the shape is believed unreachable
     from source; the machinery handles it structurally — a minted arm fragment
     carries its own union-arms map, which `RED (union-array-arm-nested)`
     witnesses one level down. Recorded rather than tested.
  4. **Positional-citation drift.** `src/extension/production-theta-producer.ts`
     grew by 27 lines, so line citations into it from other documents and from
     `tests/invoke-return-enum-carrier-projection.test.ts`'s header shifted. Bug
     [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
     do-not-chase class; disclosed, not chased. The self-citations INSIDE the five
     edited `src/` files were re-derived.
- **Discharge notes appended:** bug 0120
  (`## Coordination note — bug 0172 face 2 (0.102.0)`), retiring its closure
  note's "no reorder — that is bug 0172's face 2, spec-blocked and OPEN"
  sentence; and bug 0067 (`## Coordination note — bug 0172 face 2 (0.102.0)`),
  forward-pointing from its `## Fix (0.90.0)` *Residuals* item 1. Both appends are
  append-only; nothing in either document was deleted or rewritten.
- **Pinned dispositions / non-goals:** the anonymous-union rule is untouched —
  `Severity.Low == "low"` stays `false`, and an arm naming no declared `enum` or
  `schema` supplies nothing to attach, pinned by 0067's `anon` control and by this
  fix's `CONTROL (anonymous-arm)`. The outbound direction is untouched. The
  untyped-`invoke` discard is untouched (`invocation.md` §Typed return). The
  `params:`-defaults bypass and the `Result` identity pass-through are untouched.
  `tests/wire-name-translation.test.ts:24`'s stale "inert identity stubs" comment
  is left as bug 0134's class. No diagnostic code was added, and
  `permitted-codes.json` is byte-unchanged.
- **Self-authorizations.** None beyond the operator's own riders. Every existing
  file this commit touches was pre-authorized by name: the three reach-limit
  comments (§Fix face-2 constraint), bug 0174's `(ANYOF)` banner wording (the
  operator's rider, comment-only), and the two sibling coordination-note appends
  (the operator's set instruction). `tests/live/live-production-acceptance.test.ts`
  gained cell 40 append-only, which the live-coverage obligation requires.
