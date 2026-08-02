# Bug 0067 — The `invoke` return of a subagent-mode callee re-enters the parent as raw `JSON.parse` output with no inbound translation pass: an enum variant crossing the PIC-59 envelope loses its declaring-enum tag, so `v == Sev.High` is `false` in the parent where the identical value compares `true` in the child

- **Status:** open.
- **Kind:** defect — `runtime-value-model.md:34` names `invoke` returns as one of
  the four inbound boundaries at which the runtime MUST rebuild the validated
  JSON with theta-side names and reattach each named-enum position's
  declaring-enum tag. The subagent boundary is the one `invoke` return that
  genuinely arrives as JSON (`JSON.parse` of the `theta_result` line), and the
  parent applies no such pass: `#validateInvokeReturn`
  (`src/extension/production-theta-producer.ts:3290–3328`) runs the ceiling-#4
  depth walk and AJV validation only, and the seam that performs the rule —
  `translateInbound` (`src/runtime/wire-translation.ts:118`) — has **no caller
  anywhere in `src/`** (only `tests/wire-name-translation.test.ts` and
  `tests/enum-schema-tag-privacy.test.ts` reach it).
- **Affects:** every subagent-mode `invoke` whose callee's final value carries,
  at any depth, an enum variant or a schema-branded object —
  `src/extension/production-theta-producer.ts:1872–1882` (`drive()`:
  `makeOk(result.value as ThetaValue)` over the parsed envelope payload),
  `:3241` (the sole post-drive hook), `src/runtime/subagent-envelope.ts:175`
  (`{ kind: "ok", value: record.ok }`). The `subagent fn` inline path
  (`:1918`) is **not** affected — its final value never leaves the process.
- **Observed at:** `0.52.0` (`d06daae3`), Windows, host pi
  `@earendil-works/pi-coding-agent` (repo `node_modules` copy), real spawned
  `pi --mode json -p "/<slug>" --no-session` children through
  `createProductionSpawnFn`. Provider-free reproduction (every theta body is a
  pure expression; zero model turns, zero tokens).

## Summary

A `mode: subagent` callee whose final value is `Sev.High` emits
`{"theta_result":{"v":1,"ok":"high"}}` — correct, and required: the enum row of
`runtime-value-model.md:13` pins that `JSON.stringify` of an enum value yields
the **bare wire string** and the tag "MUST NOT appear in JSON output". The
outbound half of the contract is therefore satisfied by construction.

The inbound half is not performed. The parent's drive takes `record.ok`
straight off `JSON.parse` and hands it to `makeOk(...)` as a `ThetaValue`
(`production-theta-producer.ts:1880`). Nothing between the parse and the
caller's binding walks the value, so the tag the child stripped on the way out
is never restored on the way in. The caller binds a plain JS string where the
in-process language semantics give an `EnumValue`, and `valuesEqual`
(`src/runtime/value.ts:385–397`) then classifies the pair as **cross-type**:
one operand carries a declaring-enum tag, the other does not, so the comparison
returns `false` before any wire value is examined.

The value is not corrupted in transit and no diagnostic is raised. A theta that
branches on the callee's answer takes the wrong branch, silently.

## Reproduction

Provider-free, real child processes, ~3 s wall. Three fixtures in one discovery
root, driven through the production launch path exactly as
`tests/subagent-child-real-spawn.test.ts` drives it
(`launchSubagentChild` + `createProductionSpawnFn` + `driveSubagentChild`, with
`process.argv[1]` pinned to `node_modules/@earendil-works/pi-coding-agent/dist/cli.js`
and `PI_THETA_SUBAGENT_EXTENSION_PIN` pinned to this tree's `extensions/` per
`#subagent-child-pins`).

`kid.theta` — the subagent-mode callee whose final value is an enum variant:

```
---
mode: subagent
---
enum Sev { High = "high" }
Sev.High
```

`top.theta` — a subagent-mode root that invokes it and reports two comparisons,
one crossing the envelope and one purely local:

```
---
mode: subagent
---
enum Sev { High = "high" }
schema R { crossed: boolean, local: boolean }
let rs = invoke("./kid.theta")
let vs = rs?
R { crossed: vs == Sev.High, local: Sev.High == Sev.High }
```

Observed envelope lines on the children's fd 1 (verbatim):

```
{"theta_result":{"v":1,"ok":"high"}}
{"theta_result":{"v":1,"ok":{"crossed":false,"local":true}}}
```

and the parent-side drive results:

```
KID RESULT {"ok":true,"value":"high"}
TOP RESULT {"ok":true,"value":{"crossed":false,"local":true}}
TOP DIAGS []
```

`crossed: false` is the defect: the callee returned `Sev.High` and the caller,
holding the identical enum declaration, does not recognise it. `local: true`
is the control — the comparison mechanism itself works in the same process, in
the same theta, on the same line. `TOP DIAGS []` records that nothing was
emitted.

A same-process control pins that the tag survives every *in-process* hop. Adding
`let x = Sev.High` and a third field `viaLet: x == Sev.High` to `top.theta`
yields:

```
{"theta_result":{"v":1,"ok":{"crossed":false,"viaLet":true,...}}}
```

so the loss is specific to the value that crossed the process boundary, not to
binding an enum through a `let`.

### Static confirmation of the missing pass

```
$ rg -n "translateInbound" src/
src/runtime/wire-translation.ts:28:  // ... neither passes through `translateInbound`.
src/runtime/wire-translation.ts:118:export function translateInbound(input: InboundTranslationInput): ThetaValue {
```

One declaration, zero call sites in `src/`. The only importer of
`wire-translation.ts` in production code is `src/render/query-render.ts:35–38`,
which imports `translateOutbound` alone.

## Expected behaviour (what the spec says)

- `docs/spec_topics/runtime-value-model.md:34`, *Wire-name translation*,
  inbound bullet: "after AJV validation against the lowered schema, the runtime
  walks the validated JSON and (a) rebuilds the value with theta-side names
  using each schema's translation map, and (b) at every position the lowering
  pass's *Named-enum positions* sidecar … maps to a declaring-enum name,
  reattaches that enum's tag to the validated string **so the resulting value
  compares equal to a locally constructed variant of the same enum**." The same
  sentence closes the set: "The rule applies uniformly to every inbound
  boundary — typed query results, tool-call return decoding where typed,
  **`invoke` returns**, and binder `args` — and is not restated per call site."
- `docs/spec_topics/runtime-value-model.md:13`, enum row: the tag "MUST NOT
  appear in JSON output". The child's serialisation is therefore correct and
  is not the fix site; the parent's decode is.
- `docs/spec_topics/invocation.md:36` (INV-5): "the envelope `ok` arm maps to
  `Ok(v)` (AJV-validated against a typed `invoke<Schema>` annotation as below)".
  INV-5 pins the mapping and the AJV gate; it does not restate the inbound
  translation rule because `runtime-value-model.md:34` says it is not restated
  per call site.
- `docs/spec_topics/pi-integration-contract/subagent.md:80` (PIC-59): "The child
  theta's final value MUST reach the parent with `Result` fidelity", and `:89`:
  "`Ok` values serialise per the runtime value model".

Under those four, a subagent callee returning `Sev.High` must reach its `invoke`
parent as a value that compares equal to the parent's own `Sev.High`.

## Actual behaviour / root cause

Four links:

1. **Child side is correct.** `driveSubagentRootRegime`
   (`production-theta-producer.ts:2094–2098`) projects the terminal value with
   `surfaceCalleeFinalValue` and calls `serializeOkEnvelope`
   (`src/runtime/subagent-envelope.ts:94–97`), i.e. `JSON.stringify`. The enum
   tag is a non-enumerable **symbol** property (`src/runtime/value.ts:56`,
   `:135–144`), so `JSON.stringify` of the boxed `String` carrier yields the
   bare wire string. The schema brand (`:263`, `:277–290`) is the same posture
   and vanishes identically.
2. **The parse hands back raw JSON.** `parseEnvelopeLine`
   (`subagent-envelope.ts:175`) returns `{ kind: "ok", value: record.ok }` —
   the `JSON.parse` product, unwalked by design (this module owns framing, not
   value reconstruction).
3. **The drive re-enters it unchanged.** `production-theta-producer.ts:1880`:
   `return makeOk(result.value as ThetaValue);`. The cast is the whole
   conversion. A plain JS `string` becomes the theta-side value where an
   `EnumValue` was produced.
4. **The one post-drive hook validates, it does not translate.**
   `#validateInvokeReturn` (`:3290–3328`) runs `enforceInvokeReturnDepth`, then
   `lowerQueryResponseSchema` + `schemaValidator.compile(lowered).validate(...)`,
   and returns `result` untouched on success (`:3318–3319`). It is also a no-op
   for the untyped `invoke(...)` form (`:3296`: `returnSchema === null` returns
   early), which is the form in the reproduction — so on that form nothing at
   all inspects the payload.

The equality outcome then follows mechanically from `valuesEqual`
(`value.ts:385–397`): `tagA !== undefined || tagB !== undefined` with one side
`undefined` returns `false` without comparing wire values.

`translateInbound` (`wire-translation.ts:118–170`) is the seam that implements
the rule — including the `makeEnumValue(enumName, fieldValue)` re-tag at
`:167` driven by the `namedEnumPositions` sidecar at `:150` — and it is
reachable from no production code path.

## Second consequence on the same root cause

The schema brand `SCHEMA_TAG` (`value.ts:263`) is lost across the same boundary
by the same mechanism. `schemaTagOf` (`:309`) has two consumers — the QRY-18
interpolation render's outbound wire-name translation, and the
`QuestionOperandDefectError` operand summariser. A subagent callee returning a
value of a schema whose fields carry `as` wire renames therefore hands the
parent an object the outbound render can no longer identify, so interpolating
it into a subsequent query emits theta-side field names where the declared wire
names were specified. Not separately probed here; recorded because it shares
one fix site with the enum case.

## Why it matters

- **Silent wrong branch.** The failure has no diagnostic, no `Err`, and no
  observable trace. `TOP DIAGS []` is the whole operator-visible record. A
  classifier theta whose subagent worker returns `Sev.High` and whose caller
  does `if v == Sev.High` takes the else-branch.
- **Mode-dependent semantics for identical source.** The same callee body and
  the same caller expression give different answers depending on the callee's
  `mode:` frontmatter — which INV-5's own framing ("`InvokeCalleeError` wrapping
  is applied to the reconstructed leaf exactly as for an in-process callee")
  presents as an implementation detail of isolation, not a semantic switch.
- **The rule is stated once, so the gap is invisible from the subagent pages.**
  `runtime-value-model.md:34` deliberately does not restate the obligation per
  call site; the subagent pages therefore carry no text a reader of
  `subagent.md` alone could check the implementation against.
- **The blast radius is wider than this report.** `translateInbound` having no
  production caller means the same rule is unperformed at its three sibling
  boundaries — typed query results, typed tool-call return decoding, and binder
  `args`. Those are outside this report's area (subagent execution) and each
  needs its own witness; the subagent `invoke` return is the boundary confirmed
  live here.

## Options

1. **Apply the inbound pass in `#validateInvokeReturn`, after AJV** (the
   boundary the spec names). Needs a lowering-sidecar for the callee's declared
   return shape; for the untyped `invoke(...)` form there is no annotation to
   drive a sidecar from, so this option leaves the untyped form uncovered —
   which is the form in the reproduction above.
2. **Carry the tag on the wire.** Rejected without a spec revision:
   `runtime-value-model.md:13` makes the absence of the tag from JSON output
   normative, and `subagent.md:155` closes the marshalled-artefact enumeration
   at four.
3. **Reconstruct from the callee's own declarations.** The parent has already
   parsed the callee (`#driveCallee`'s `parseCallee`, `:3141`), so the callee's
   `enum` / `schema` decls are available parent-side; a walk driven by the
   callee's declared final-value shape would cover the untyped form too. Costs
   a definition of what "the callee's declared final-value shape" is when the
   callee declares none.

Whichever is chosen, the spec's "not restated per call site" sentence is what
makes the omission cheap to repeat — a fix should also decide whether
`translateInbound` gains a single enforced entry point that every inbound
boundary is required to route through.

## Non-goals

- Not a request to change the child-side serialisation. `JSON.stringify`
  yielding the bare wire string is the pinned enum-row behaviour.
- Not a request to weaken `valuesEqual`'s cross-type rule. `Severity.Low ==
  "low"` evaluating `false` is pinned at `runtime-value-model.md:22` and must
  stay; the defect is that the parent's value is a bare string at all.
- Not about the `err` arm. `Err` reconstruction is `#subagent-error-fidelity`'s
  own audit and was not probed.

## Related

- 0008 (subagent child drops all but the last theta root) — same launch path,
  different layer; that report's *Silent root loss* framing is the same
  no-diagnostic shape.
- 0020 (enum / schema brands presence-only forgeable) — established the
  symbol-keyed, non-enumerable brand posture this report depends on. That fix
  is what makes the brand correctly absent from JSON; it did not add the
  compensating inbound reattachment at this boundary.
- 0050 (`theta/parse/fn-arg-type-mismatch` unreachable: sole emitter has no
  caller in `src/`) — same defect shape, different seam: a specified behaviour
  whose implementation exists, is unit-tested, and has no production caller.

## Provenance

- Spec measured against: `docs/spec_topics/runtime-value-model.md:13`, `:22`,
  `:34`; `docs/spec_topics/invocation.md:36` (INV-5);
  `docs/spec_topics/pi-integration-contract/subagent.md:80`, `:89` (PIC-59),
  `:155` (closed marshalled enumeration).
- Implementation read at `d06daae3`:
  `src/extension/production-theta-producer.ts:1872–1882`, `:2094–2098`,
  `:3141`, `:3241`, `:3290–3328`; `src/runtime/subagent-envelope.ts:94–97`,
  `:175`; `src/runtime/value.ts:56`, `:135–144`, `:263`, `:277–290`, `:309`,
  `:385–397`; `src/runtime/wire-translation.ts:118–170`.
- **Live-confirmed.** Observed through real spawned `pi --mode json -p`
  children driven by the production `launchSubagentChild` +
  `createProductionSpawnFn` + `driveSubagentChild` path, in a scratch probe
  modelled on `tests/subagent-child-real-spawn.test.ts` (the child pins of
  `#subagent-child-pins` applied). Provider-free — no model turn ran in any
  child, so the observation is deterministic and repeats byte-identically. The
  probe was deleted after the run; the fixtures and the observed envelope bytes
  are transcribed above in full.
- Live baseline before probing:
  `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/hardening/session-subagent-toolloop.test.ts`
  — 2 passed (STL-1, STL-2), 50.4 s.
