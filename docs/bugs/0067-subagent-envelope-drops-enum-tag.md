# Bug 0067 — The `invoke` return of a subagent-mode callee re-enters the parent as raw `JSON.parse` output with no inbound translation pass: an enum variant crossing the PIC-59 envelope loses its declaring-enum tag, so `v == Sev.High` is `false` in the parent where the identical value compares `true` in the child

- **Status:** fixed (0.90.0).
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
one crossing the envelope and one purely local. The `invoke` MUST carry its
`<Schema>` annotation: an untyped `invoke(...)` returns `Result<null,
QueryError>` and the runtime discards the callee's value entirely
([Invocation §Typed return](../spec_topics/invocation.md)), so an untyped
spelling reports `crossed: false` for a reason that has nothing to do with the
enum tag and cannot witness this report:

```
---
mode: subagent
---
enum Sev { High = "high" }
schema R { crossed: boolean, local: boolean }
let rs = invoke<Sev>("./kid.theta")
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
the same theta, on the same line, and it is what separates a lost tag from a
discarded value: the typed form delivers the payload (a sibling fixture reading
a `string` field off the same callee returns it intact) and still compares
unequal. `TOP DIAGS []` records that nothing was emitted.

A same-process control pins that the tag survives every *in-process* hop. Adding
`let x = Sev.High` and a third field `viaLet: x == Sev.High` to `top.theta`
yields:

```
{"theta_result":{"v":1,"ok":{"crossed":false,"viaLet":true,...}}}
```

so the loss is specific to the value that crossed the process boundary, not to
binding an enum through a `let`.

The same shape at two further depths, each a separate fixture pair, pins that
the loss is not particular to a root-position value — an enum FIELD of a
schema-typed callee value (`invoke<P>` over `P { sev: Sev.High, who: "w" }`)
reports `objSev: false` while `objWho` returns `"w"` intact, and an enum ARRAY
ELEMENT (`invoke<array<Sev>>` over `[Sev.High]`) reports `elem0: false`.

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
3. **The drive re-enters it unchanged.** `drive()` in
   `production-theta-producer.ts` ends `return makeOk(result.value as
   ThetaValue);`. The cast is the whole conversion. A plain JS `string` becomes
   the theta-side value where an `EnumValue` was produced. What that value then
   meets depends on the invoke's form, and only one of the two forms carries it
   any further: `runInvokeEffect`
   (`src/runtime/effectful-statement-host.ts`) replaces the callee's value with
   `makeOk(null)` whenever `expr.returnSchema === null`, so an untyped
   `invoke(...)` never delivers a payload to translate in the first place
   ([Invocation §Typed return](../spec_topics/invocation.md); mirrored at
   [`discovery-cli.md` §Typed return](../reference/discovery-cli.md)). The
   typed `invoke<Schema>` form is therefore the whole domain of this report.
4. **The one post-drive hook validates, it does not translate.**
   `#validateInvokeReturn` runs `enforceInvokeReturnDepth`, then
   `lowerQueryResponseSchema` + `schemaValidator.compile(lowered).validate(...)`,
   and returns `result` untouched on success. It early-returns for the untyped
   `invoke(...)` form (`returnSchema === null`), which is consistent with link 3
   — that form has no value to inspect.

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
   return shape, which the `invoke<Schema>` annotation supplies. Covering only
   the typed form is not a cost: the untyped `invoke(...)` form carries no value
   at any candidate fix site (link 3 above), so the typed form is the whole
   domain.
2. **Carry the tag on the wire.** Rejected without a spec revision:
   `runtime-value-model.md:13` makes the absence of the tag from JSON output
   normative, and `subagent.md:155` closes the marshalled-artefact enumeration
   at four.
3. **Reconstruct from the callee's own declarations.** The parent has already
   parsed the callee (`#driveCallee`'s `parseCallee`), so the callee's
   `enum` / `schema` decls are available parent-side; a walk driven by the
   callee's declared final-value shape would reach a value the annotation does
   not describe. Costs a definition of what "the callee's declared final-value
   shape" is when the callee declares none — and buys nothing over option 1,
   whose annotation names the returned type outright.

Whichever is chosen, the spec's "not restated per call site" sentence is what
makes the omission cheap to repeat — a fix should also decide whether
`translateInbound` gains a single enforced entry point that every inbound
boundary is required to route through.

## Fix (0.90.0)

This report carried no `## Fix` section: the operator settled the route against
§Options directly, twice. Both authorizations are recorded verbatim below,
including the first, which was **withdrawn** because its decisive premise was
false.

**First settlement — WITHDRAWN, not implemented.** "Option 3 extended" —
callee-declaration-driven reconstruction covering both the typed and the untyped
`invoke` forms. It required the untyped form to go `crossed: false → true`.
That is unreachable: an untyped `invoke(...)` discards the callee's value by
specification, so there is no value at that boundary to translate. Satisfying
the route as written would have meant amending
[Invocation §Typed return](../spec_topics/invocation.md), which the route did not
authorize. The first orchestration run stopped in pre-measurement and shipped
nothing rather than self-authorize a reduced scope.

**Second settlement — BINDING, implemented. §Options OPTION 1**, verbatim:

> "Option 1 — inbound pass at #validateInvokeReturn after AJV, typed form only
> (orchestrator's and my corrected recommendation)" — described as: "The site
> runtime-value-model.md:34 actually names. Typed invoke is the only form
> carrying a value, so this is complete coverage, not a compromise. Root tag
> comes from the invoke<Schema> annotation ("tags attached at the same depth as
> the value the schema annotates"). Must also land: per-field $ref target
> (Finding B(i)), array-element recursion (Finding B(ii) — fix, not file), the
> SCHEMA_TAG brand half (discharges 0120's clause via Finding E), and must NOT
> rename (Finding D). Doc's invalid §Reproduction corrected in the same commit as
> doc-was-wrong-material, 0056 precedent."

- **What shipped:**
  - `src/extension/production-theta-producer.ts` — `#validateInvokeReturn`'s
    success arm derives an inbound translation plan from the already-lowered
    annotation and returns the translated payload, after AJV, for the typed form
    only. Both `#driveCallee` cells route through this one method, so a callee's
    `mode:` cannot change the caller's equality semantics.
  - `src/parser/schema-lowering.ts` — the Lowering-Algorithm-step-5 sidecar gains
    a per-position `$ref`-target map, and `buildSidecar` emits array-element
    positions one `/items` segment deeper. New `buildInboundTranslationPlan`
    derives the per-`$defs` sidecars from the lowered document, registering the
    annotated root under its own name or a reserved `#`-prefixed key.
  - `src/runtime/wire-translation.ts` — `rebuildInbound` becomes pointer-driven,
    so one sidecar covers a fragment's root, its fields and its array elements;
    it recurses through the `$defs` a position actually references, reattaches
    the declaring-enum tag, and brands a rebuilt object of a declared schema.
  - `docs/spec_topics/schema-subset.md` + `docs/reference/schema-subset.md` —
    step 5's sidecar goes from two maps to three, documenting the `$ref`-target
    map and why a name match cannot stand in for it.
- **Re-tag and re-brand only, never rename.** The subagent envelope is
  `JSON.stringify` of the callee's own theta-side value, not a lowered-schema
  encoding: [Runtime Value Model](../spec_topics/runtime-value-model.md)'s object
  row keys such a value "by **theta-side names**, regardless of any wire-name
  renames declared on the schema". Measured at HEAD: `schema P { sev: Sev, who
  as "Who": string }` crosses as `{"sev":"high","who":"w"}` — key `who`, not
  `"Who"`. Independently confirmed one layer down: the lowering consumes
  `LowerableField`, which carries a field's name and type source and no rename,
  so the lowered `properties` keys are theta-side too. The derived sidecars
  therefore carry an EMPTY wire-name map by construction, which is what makes
  applying the rename half impossible rather than merely unwise.
- **Gates:** witness `tests/subagent-invoke-inbound-enum-tag.test.ts` RED at
  `66c8121a` on `crossed`/`objSev`/`elem0` each `expected false to be true`,
  GREEN on all six cells after; `npm test` 293 files / 4756 tests passed (HEAD
  baseline 290 / 4736, delta exactly the three new files); `npx tsc -p
  tsconfig.json --noEmit` exit 0; `npm run lint` clean. Live H8a
  `tests/live/live-production-acceptance.test.ts` 32 passed (31 before, one
  additive cell), including the bug-0020 forged-ingress cell rendering
  `{"__thetaEnum":"Severity","x":1}` byte-unchanged. H9a
  `tests/live/acceptance/noninteractive-acceptance.test.ts` 10 passed with
  `tests/fixtures/h7a/permitted-codes.json` byte-unchanged — this fix emits no
  diagnostic code.
- **Review:** 3 rounds. Round 1 (deep) — two `correctness` blockers plus four
  prose residuals. Round 2 (fast) — clean on correctness/fidelity/spec; two
  non-blocking residuals. Round 3 (fast, confirmation after a light fixer round
  that touched executable lines) — clean, zero findings, every category empty.
  One pre-review correction round, citation-only, repaired a comment in
  `tests/schema-brand-symbol-migration.test.ts` that this change's own line
  movement had invalidated.
- **Verification:** all four obligations discharged. The witness reds when the
  translation call is neutralised and greens when it is restored byte-exactly
  (`git hash-object` `821ef7bc…` both sides); the F2 guard's locking test reds
  without the guard and greens with it (`d105d107…` both sides); the default
  suite is green; the added live cell reds and greens across the same
  neutralisation; typecheck and lint pass.
- **Residuals:**
  1. **A union (`anyOf`) position is not translated.** `invoke<Sev | null>` still
     hands the parent an untagged string. This is not a regression — the
     position is untranslated before this fix too — and it is not closable
     within this route: the sidecar is keyed by JSON Pointer into the lowered
     fragment, and `anyOf` has no image in the data space the way `properties`
     and `items` do, so nothing in the lowered fragment names which arm governs
     a materialised value. Choosing that rule is a spec question. The seam's
     header, `translateInbound`'s doc comment and `#validateInvokeReturn`'s doc
     comment all state the reach explicitly so the code claims no coverage it
     lacks.
  2. **The rule remains unperformed at its three sibling inbound boundaries** —
     typed query results, typed tool-call return decoding, and binder `args` —
     and `translateInbound` still has no single enforced entry point. This fix
     wires one boundary, deliberately. Evidence: `translateInbound`'s only
     production caller is `#validateInvokeReturn`; the typed-query loop binds the
     AJV-validated payload directly.
  3. **`rebuildInbound` builds its record with plain assignment**, so a payload
     key spelled `__proto__` reassigns the record's prototype and is dropped
     rather than becoming an own key. Measured: `Object.prototype` is NOT
     polluted, and the path is unreachable on this boundary — a declared field
     of that name never reaches the lowered `properties`, `additionalProperties:
     false` refuses the key, and neither a theta constructor nor a
     `JSON.stringify` envelope can produce it. It becomes reachable only when a
     model-produced payload boundary is wired (residual 2).
  4. **`docs/reference/schema-subset.md` grew by four lines**, so bug-doc
     citations into it past line 186 now point four lines high (0057 `:201`;
     0099 `:198–206`, `:222–224`; 0120 `:184–187`). `docs/spec_topics/schema-subset.md`
     is line-count-neutral at 118 lines, so every `schema-subset.md:NN` citation
     in `src/` and `tests/` is unaffected.
- **Discharge notes appended:** `docs/bugs/0120-inbound-rebuild-ignores-declaration-order-and-brand.md`
  (the brand half landed; the order half measured vacuous on this boundary) and
  `docs/bugs/0080-keys-values-construction-order-not-declaration-order.md` (its
  fix record's `brandSchemaValue` call-site count).
- **Pinned dispositions / non-goals:** the untyped `invoke(...)` form stays out of
  domain and the "should untyped invoke discard?" design question was considered
  and declined — do not file it. No child-side serialisation change.
  `valuesEqual`'s cross-type rule is untouched: `Severity.Low == "low"` stays
  `false`, pinned by this fix's own `anon` control cell. Inbound values are NOT
  reordered into declaration order — that is bug 0120's unsettled question, and
  branding therefore goes through `brandSchemaValue` directly rather than
  `buildObjectSchemaValue`, whose contract couples reordering to branding.

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
