# Bug 0173 — `rebuildInbound` builds the rebuilt value with plain object-literal assignment (`const result: { [k: string]: ThetaValue } = {}` then `result[thetaKey] = …`) over keys the payload supplies, so a payload key spelled `__proto__` reassigns the record's prototype to a model-supplied object instead of becoming an own field and is dropped with no diagnostic on any channel — against the corpus's own construction rule for records keyed by author-controlled strings (bugs 0031, 0038) — and `lowerOutbound` carries the same idiom one function down; unreachable at HEAD because the one wired boundary's payload is a theta child's `JSON.stringify` output, and defended only by `additionalProperties: false` the moment a model-produced payload boundary is wired

- **Status:** fixed (0.96.0). §Fix (0.96.0) below records what shipped, the
  constraint-3 coercion enumeration as measured (it came out two consumers
  wider than §Fix constraint 3 names), and the one residual that widening
  leaves. Residual R3 of the bug 0067 fix (0.90.0, commit
  `e18b30e5`), recorded in that run's report
  (`.pi/tmp/fixes/0067-report.md` §*Residuals / notes* R3) and not filed there —
  the fix run creates no bug docs. §Fix is settled: the remedy is the
  construction rule the corpus already applies at five sites in three files
  (`src/parser/type-layer-checks.ts:329`, `:792`, `src/parser/params.ts:337`,
  `src/extension/invoke-static-checks.ts:886`, `:999`), and no route choice is
  left open.
  Ordering: nothing blocks this report from starting, and it blocks
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md) —
  the three unperformed inbound boundaries of that report are exactly the
  boundaries at which the payload stops being a theta child's output and becomes
  model output, so this record build is hardened before that wiring lands, not
  after.
- **Sev/Diff estimate:** S3/D2 — S3 because no production input reaches the
  assignment at HEAD: the one wired caller is `#validateInvokeReturn`
  (`src/extension/production-theta-producer.ts:3436`), whose payload is
  `JSON.parse` of a theta child's `JSON.stringify` output, and a theta value
  carries no own `__proto__` key
  ([0119](./0119-proto-named-field-silently-dropped.md)); the defect is a
  construction rule the walk violates, witnessed only at the seam. The S1 reading
  is stated and rejected on one measured fact, not on judgement: an S1 finding
  needs an input, and no input exists until 0172 wires a model-produced payload —
  at which point the same measurement is silent wrong behaviour (a validated
  field dropped from the rebuilt value, and the value's prototype set by the
  payload) and this report's band moves with it. D2 because the change is two
  record constructions in one file (`src/runtime/wire-translation.ts:281`,
  `:344`) with no new registry row and an ordinary witness, but it inherits the
  string-coercion enumeration bug 0119's route (a) owes for null-prototype theta
  values and owes a scope statement against that report's §Fix constraint 7. Not
  D1 for those two coordination items alone.
- **Kind:** defect — the implementation departs from the construction rule this
  corpus applies to every record keyed by strings it does not control. Three
  elements, each measured at HEAD `e18b30e5`.
  1. *The rebuild record is a plain object literal keyed by payload strings.*
     `rebuildInbound` (`src/runtime/wire-translation.ts:223`) builds
     `const result: { [k: string]: ThetaValue } = {}` (`:281`), walks
     `Object.entries(value)` of the AJV-validated payload (`:282`), derives
     `thetaKey` as the sidecar's rename of the payload's own key or the payload's
     own key verbatim (`:287`), and assigns `result[thetaKey] = …` (`:296`). For
     `thetaKey === "__proto__"` that assignment reaches `Object.prototype`'s
     inherited `__proto__` setter: an object-valued entry becomes the record's
     PROTOTYPE and a primitive-valued one is discarded outright. Either way no
     own key is created, `Object.keys` does not report it, `JSON.stringify` does
     not emit it, and nothing is emitted on any diagnostic channel
     (§Reproduction (a)).
  2. *The same idiom builds the outbound record one function down.*
     `lowerOutbound` (`:320`) builds `const result: { [k: string]: unknown } = {}`
     (`:344`) and assigns `result[wireKey] = …` (`:347`), where `wireKey` is the
     sidecar's `as "…"` wire name for the field or the theta-side key verbatim.
     `schemas.md:30` admits an arbitrary JSON property name as a wire name, so
     that key is author-controlled. Measured in both directions (§Reproduction
     (e)). This half has no production caller at HEAD: `translateOutbound`
     (`:310`) runs only where the interpolation type carries both `sidecars` and
     `rootDef` (`src/render/query-render.ts:422`), and no site in `src/`
     originates either field (`rg -n "rootDef" src/` — the only assignment is the
     inbound plan's, `production-theta-producer.ts:3475`).
  3. *The rule the corpus states for this class is two-part, and the read half is
     already satisfied here.* `collectTypeEnv`'s design note
     (`src/parser/type-layer-checks.ts:316–327`) states both halves: construct
     with `Object.create(null)` so "a declaration literally named `__proto__`
     becomes an ordinary own property too, instead of replacing the record's
     prototype", and own-key-guard the reads. This walk's own lookups are already
     safe — the three per-position indexes are `Map`s (`indexOf`, `:156`, the
     maps at `:160`, `:164`, `:168`) and the payload walk is `Object.entries`,
     own-enumerable only — and every theta-side read of the rebuilt value is
     own-key-guarded (`assertKeyPresent`, `src/runtime/runtime-panics.ts:222`;
     `object.has`, `src/runtime/stdlib-object.ts:123`; `match`'s field presence,
     `src/runtime/match-result.ts:214`). What is missing is the construction
     half, which no read-side guard can restore: a write the prototype setter
     swallows loses the field outright.
- **Related:**
  - **0067** —
    [`0067-subagent-envelope-drops-enum-tag.md`](./0067-subagent-envelope-drops-enum-tag.md),
    **fixed (0.90.0)**, the parent. Its fix gave `translateInbound` its first
    production caller (`#validateInvokeReturn`,
    `src/extension/production-theta-producer.ts:3436`, the call at `:3472`),
    which is what turned this record build from dead code into a wired one, and
    its run measured the behaviour recorded here as residual R3. Its three
    landed witnesses are this report's locks (§Fix constraint 2).
  - **0172** —
    [`0172-inbound-translation-pass-unperformed-at-three-boundaries.md`](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md),
    **open. Prerequisite relationship: this report lands first.** 0172 owns the
    three inbound boundaries `runtime-value-model.md:34` names and the runtime
    does not perform — typed query results, typed tool-call return decoding, and
    binder `args`. At each of them the payload is produced by a MODEL, not by a
    theta child, which removes the one thing that makes this defect unreachable
    at HEAD (§Reproduction (d)). A fix for 0172 that wires any of the three
    against an unhardened `rebuildInbound` imports a silent wrong-value path.
  - **0031** —
    [`0031-ctor-field-value-typing-unchecked.md`](./0031-ctor-field-value-typing-unchecked.md),
    **fixed (0.43.0)**, where this corpus's rule for the class was established.
    Its fix record states it as a requirement on the declared-field record: "The
    record is null-prototyped and the lookup own-keyed (review finding F1: theta
    field names may collide with `Object.prototype` members — `toString`,
    `constructor`, `__proto__` — and the record must neither answer through the
    prototype chain nor let a `__proto__` assignment set the prototype)"
    (`0031-…md:99–103`). Its residual (ii) (`:165–172`) named the same hazard one
    level up and handed it to 0038.
  - **0038** —
    [`0038-typeenv-prototype-member-names-resolve-as-declared-types.md`](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md),
    **fixed (0.48.0)**, the same class discharged on the `TypeEnv`:
    `Object.create(null)` at the construction site
    (`src/parser/type-layer-checks.ts:329`) plus own-key-guarded reads through
    one exported `resolveNamed` (`src/parser/type-compat.ts:104`, its note at
    `:92–103`). Its witness names the two halves separately and states why the
    construction half needs its own observable
    (`tests/typeenv-prototype-names.test.ts:1005–1041`, group (g)) — the same
    split this report's §Fix uses.
  - **0119** —
    [`0119-proto-named-field-silently-dropped.md`](./0119-proto-named-field-silently-dropped.md),
    **open.** **Boundary, and the source of this report's unreachability
    argument.** 0119 owns the theta-side construction sites — a declared field
    named `__proto__` dropped at `buildObjectSchemaValue` and at the two
    constructor field loops — and its §Affected already lists this walk as an
    *adjacent site, measured at the seam*, at the pre-0067 line numbers
    (`0119-…md:188–197`, citing `wire-translation.ts:129–175`, record `:158`,
    writes `:167` / `:171`; at HEAD `e18b30e5` those are `:223`, `:281`, `:296`).
    Two of its statements moved with 0067's fix and are corrected here rather
    than there: "`grep -rn translateInbound src/` finds no importer outside that
    module" is false at HEAD (`production-theta-producer.ts:225`, `:3472`), and
    its §Fix constraint 7 (`:845–853`) requires a fix over any of these sites to
    state its scope — which this report's §Fix does, in the direction that
    covers the two records in this file and no other. Its cell F
    (`tests/ctor-declaration-order.test.ts:679–718`) pins the constructor-side
    drop green and is untouched by this report.
  - **0120** —
    [`0120-inbound-rebuild-ignores-declaration-order-and-brand.md`](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md),
    **open**, the other report against this exact function: it owns the rebuilt
    record's key ORDER (model-ordered, where `expressions.md:118` fixes
    declaration order). Disjoint observables — 0120's rows and this report's rows
    differ in which keys the record has, not in what order it has them — but the
    same construction expression, so whichever lands second rebases onto the
    other's hunk. 0067's fix landed 0120's brand half (`rebuildUnder`'s
    `brandSchemaValue` call, `src/runtime/wire-translation.ts:206`), so that
    report's title is one clause ahead of its own status; not chased here (0134).
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/extension/production-theta-producer.ts` is 6165 lines at this HEAD and
    0119's citations into `wire-translation.ts` are already 60+ lines stale after
    one fix, which is why every position below is named by symbol beside its
    line.
- **Affected** (every citation re-verified against the tree at HEAD `e18b30e5`,
  v0.90.0; symbols named beside lines):
  - **The construction site.** `rebuildInbound`
    (`src/runtime/wire-translation.ts:223`): the record (`:281`), the
    `Object.entries` payload walk (`:282`), the theta-key derivation (`:287`),
    the field pointer (`:288`), the `omitsRefTargets` fallback (`:289–295`) and
    the write (`:296`). The guard that decides where a fresh record is built at
    all (`:266–279`: `sidecar !== undefined && pointer === ""`), and
    `isPlainObject` (`:70`), the predicate that routes a value here.
  - **The outbound twin.** `lowerOutbound` (`:320`): the theta→wire `Map`
    (`:337–342`), the record (`:344`), the walk (`:345`), the wire-key derivation
    (`:346`) and the write (`:347`). Its exported entry `translateOutbound`
    (`:310`) and its one conditional caller
    (`src/render/query-render.ts:422–427`, the `JSON.stringify` at `:429`).
  - **The lookup structures that are already safe.** `indexOf` (`:156`) and its
    three `Map`s (`:160` `wireToTheta`, `:164` `enumByPointer`, `:168`
    `refByPointer`); `SidecarIndex` (`:147`); `InboundWalk` (`:140`). A `Map` key
    never collides with `Object.prototype`, so no read in this module answers
    through a prototype chain.
  - **The one wired caller.** `#validateInvokeReturn`
    (`src/extension/production-theta-producer.ts:3436`): the ceiling-#4 depth
    walk (`:3450`), the lowering (`:3453`), the AJV compile and verdict
    (`:3461–3462`), the `verdict.ok` gate (`:3463`), the plan derivation
    (`:3464`) and the `translateInbound` call (`:3472–3477`). Its two call sites
    are the prompt→prompt attach cell (`:3332`) and the subagent spawn cell
    (`:3370`); the import is at `:225`.
  - **The plan derivation that decides where a record is built.**
    `buildInboundTranslationPlan` (`src/parser/schema-lowering.ts:423`): the root
    body (`:439`), `fragments.set(rootDef, rootBody)` (`:445` — the root fragment
    always gets a sidecar, whatever its shape, which is what makes a permissive
    `{}` root a record-building position, §Reproduction (d)), `isObjectFragment`
    (`:372`) and `buildSidecar` (`:293`).
  - **The lowering that closes the object positions.** `lowerObjectFields`
    (`src/parser/body-type-lowering.ts:110–143`): the `properties` record
    (`:118`), the per-field write (`:122`), `required.push` (`:131`) and the
    closed schema (`:133–138`, `additionalProperties: false` at `:137`). This record carries the
    same idiom — measured in §Reproduction (c) — which is why a declared
    `__proto__` field cannot make the key legal. The `params:` twin is
    `src/parser/params.ts:170` / `:216` / `:408`.
  - **The rule's five existing applications.** `collectTypeEnv`
    (`src/parser/type-layer-checks.ts:328`, `Object.create(null)` at `:329`, the
    design note at `:316–327`); `collectSchemaFields`'s field record (`:792`);
    the `params:` default compat env (`src/parser/params.ts:337`); the callee
    annotation envs (`src/extension/invoke-static-checks.ts:886`, `:999`). The
    read-side counterpart is `resolveNamed` (`src/parser/type-compat.ts:104`,
    note `:92–103`).
  - **The rebuilt value's consumers.** `rebuildUnder` (`:198`) and its
    `brandSchemaValue` install (`:206`, `src/runtime/value.ts:277`);
    `schemaTagOf` (`value.ts:300`); `valuesEqual`'s object arm (`value.ts:541–558`
    — `Object.keys` plus `propertyIsEnumerable.call`, both own-key);
    `evaluateObjectMember`'s `keys` / `values` / `has`
    (`src/runtime/stdlib-object.ts:114`, `:118`, `:123`); `assertKeyPresent`
    (`src/runtime/runtime-panics.ts:221–226`); `match`'s field presence gate
    (`src/runtime/match-result.ts:214`). None of them reads through a prototype
    chain, so the prototype reassignment is not theta-observable; the dropped key
    is.
  - **Spec.** `docs/spec_topics/runtime-value-model.md:12` (the object row — "JS
    plain object keyed by **theta-side names**"), `:34` (the inbound rule: the
    runtime "rebuilds the value with theta-side names using each schema's
    translation map", and "applies uniformly to every inbound boundary — typed
    query results, tool-call return decoding where typed, `invoke` returns, and
    binder `args` — and is not restated per call site");
    `docs/spec_topics/schema-subset.md:87` (Lowering Algorithm step 5, the
    per-schema sidecar's three maps); `docs/spec_topics/schemas.md:30`
    (`ref_url as "$ref": string` — "arbitrary JSON property names are fine");
    `docs/spec_topics/expressions.md:118` (`keys()` order, 0120's subject, cited
    here only to separate the two reports).
  - **The committed cells a fix must not red.**
    `tests/wire-translation-inbound-retag.test.ts` (8 tests, the seam's own
    end-state pins), `tests/inbound-translation-plan.test.ts` (11 tests, the plan
    derivation; its `:120–133` cell pins that a derived sidecar's wire-name map
    is EMPTY even when the schema declares `as "Wire"`, because
    `lowerObjectFields` keys `properties` by the theta-side name) and
    `tests/subagent-invoke-inbound-enum-tag.test.ts` (1 process-spawning test) —
    bug 0067's three landed witnesses, all green at this HEAD, 20 tests total.
    Also `tests/wire-name-translation.test.ts` and
    `tests/enum-schema-tag-privacy.test.ts:486` (the `translateInbound` re-tag
    control).
  - **Committed coverage of the class, counted at HEAD.** Four test files
    mention `__proto__` (60 lines total): `tests/ctor-declaration-order.test.ts`
    (0119's cell F), `tests/ctor-field-type-check.test.ts`,
    `tests/inline-object-duplicate-field-name.test.ts` and
    `tests/typeenv-prototype-names.test.ts` (0038's witness). None of them
    reaches `src/runtime/wire-translation.ts`: no committed cell exercises either
    record build with a colliding key, in either direction.
- **Observed at:** v0.90.0 (`e18b30e5`). Offline, deterministic, provider-free:
  one scratch vitest probe over the shipped `translateInbound` /
  `translateOutbound` seams, the real `parseThetaDocument` (through the
  `ParseThetaDocumentDeps` harness of
  `tests/inbound-translation-plan.test.ts:37–53`), the real
  `lowerQueryResponseSchema` and `buildInboundTranslationPlan`, and the
  production `AjvSchemaValidator` (`src/seams/schema-validator.ts`) built with
  the content-addressing of `src/extension/production-composition.ts:318`;
  written, run, deleted. Every value in §Reproduction is that run's output
  verbatim over a tree `git status --short --untracked-files=all` reported clean
  at `e18b30e5`.

## Summary

`rebuildInbound` rebuilds the AJV-validated payload into a fresh record built as
`{}` and filled by `result[thetaKey] = …`, where `thetaKey` is a string the
payload supplied (or, where a sidecar carries a rename, one the author declared).
`__proto__` is a live key in that namespace: the assignment reaches
`Object.prototype`'s inherited setter, so an object-valued entry becomes the
rebuilt record's prototype and a primitive-valued one is discarded. In both cases
the field is absent from the rebuilt value with no diagnostic on any channel.
Measured: a payload whose own keys are `["__proto__", "ok2"]` rebuilds to a value
whose own keys are `["ok2"]`, whose prototype is the payload's `__proto__` value
rather than `Object.prototype`, and whose `JSON.stringify` is `{"ok2":"v"}`.
`Object.prototype` itself is NOT modified: this is not a global prototype
pollution, and no later-constructed plain object is affected.

The corpus already decided this class twice. Bug 0031's fix null-prototyped the
declared-field record because theta field names collide with `Object.prototype`
members; bug 0038's fix did the same for the `TypeEnv` and own-key-guarded its
eight reads. This walk applies neither half. Its own lookups happen to be safe —
they are `Map`s — and every theta-side read of the rebuilt value is
own-key-guarded, so nothing here answers through a prototype chain. The
construction half is what is missing, and it is the half no read-side guard can
restore.

**At HEAD the assignment is unreachable from any production input**, on the one
boundary bug 0067 wired. Two independent reasons, both measured:

- The payload at `#validateInvokeReturn` is `JSON.parse` of a subagent child's
  `JSON.stringify` of its own theta value, and a theta value carries no own
  `__proto__` key — that is bug 0119's subject, pinned green by cell F of
  `tests/ctor-declaration-order.test.ts:679–718`.
- A schema cannot declare the field into legality either: `lowerObjectFields`
  builds `properties` with the same idiom, so `schema Pr { __proto__: string }`
  lowers to `properties: {}` with `required: ["__proto__"]` and
  `additionalProperties: false`. On an ordinary schema AJV refuses a payload
  carrying the key before the walk runs (`must NOT have additional properties`,
  `additionalProperty: "__proto__"`).

**It becomes reachable when a model-produced payload boundary is wired** — the
three boundaries `runtime-value-model.md:34` names and
[0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md) owns.
There the first reason disappears: a model can emit any key. What is left is
`additionalProperties: false` holding at every position the walk builds a record
at — a property of the lowering that this walk neither checks nor states, and
that a permissive root fragment does not have (§Reproduction (d): `invoke<Unknown>`
loads with zero diagnostics, lowers to `{}`, and still receives a root sidecar,
so the walk still rebuilds). The practical content of this report is therefore an
ordering statement: harden the record build, then wire 0172.

## Reproduction

Offline, deterministic, at HEAD `e18b30e5`. Every payload is built with
`JSON.parse`, not an object literal — a literal `{ "__proto__": … }` sets the
prototype at parse time and creates no own key, whereas `JSON.parse` creates the
own key, which is also how the payload arrives in production (the PIC-59
envelope's `theta_result` line).

### (a) The inbound rebuild, at the seam

Sidecar: `{ wireNames: [], namedEnumPositions: [], refTargets: [] }` under
`rootDef` `"Pr"` — the permissive shape the derived plan produces for a boundary
with no renames and no named-enum positions.

```
payload = JSON.parse('{"__proto__":{"polluted":"yes"},"ok2":"v"}')

payload own keys                    ["__proto__","ok2"]
hasOwnProperty(payload,"__proto__") true

out = translateInbound({validated: payload, sidecars, rootDef:"Pr"})

out own keys                        ["ok2"]
out proto is Object.prototype       false
out proto is payload.__proto__      true
out.polluted (inherited)            "yes"
Object.prototype polluted           undefined
JSON.stringify(out)                 {"ok2":"v"}
```

The validated field is gone from the rebuilt value and the rebuilt value's
prototype is an object the payload supplied. `Object.prototype` is untouched, so
the effect is confined to this record and to values that inherit from it.

Primitive-valued and rename-routed variants:

| payload / sidecar | `out` own keys | `out` prototype |
| --- | --- | --- |
| `{"__proto__":"str","ok2":"v"}` | `["ok2"]` | `Object.prototype` (unchanged) |
| `{"__proto__":{…},"ok2":"v"}` | `["ok2"]` | the payload's `__proto__` value |
| `wireNames:[{theta:"__proto__",wire:"Proto"}]` over `{"Proto":{…},"ok2":"v"}` | `["ok2"]` | the payload's `Proto` value |

The third row is the author-controlled half of the key space: the rename map's
theta side is a declared field name. It is inert on the wired boundary — the
derived sidecar's wire-name map is always empty there, pinned by
`tests/inbound-translation-plan.test.ts:120–133` — and live for any boundary
whose sidecars carry renames.

### (b) The AJV control that closes the wired boundary today

`schema Pr { ok2: string }`, lowered by the real `lowerQueryResponseSchema` and
validated by the production `AjvSchemaValidator`:

```
lowered  {"type":"object","properties":{"ok2":{"type":"string"}},
          "required":["ok2"],"additionalProperties":false}

AJV({"__proto__":{"polluted":"yes"},"ok2":"b"})
  {"ok":false,"errors":[{"keyword":"additionalProperties",
    "message":"must NOT have additional properties",
    "params":{"additionalProperty":"__proto__"}}]}

AJV({"ok2":"b"})   {"ok":true}
```

`#validateInvokeReturn` calls `translateInbound` only under `verdict.ok`
(`production-theta-producer.ts:3463`), so on a closed lowered fragment the walk
never sees the key. This is the whole of the defence, and it is a property of the
schema, not of the walk.

### (c) The declared-field route does not open it

| source | parse diagnostics | lowered |
| --- | --- | --- |
| `schema Pr { __proto__: string }` | `[]` | `{"type":"object","properties":{},"required":["__proto__"],"additionalProperties":false}` |
| `schema Pr { __proto__: string, ok2: string }` | `[]` | `{"type":"object","properties":{"ok2":{"type":"string"}},"required":["__proto__","ok2"],"additionalProperties":false}` |

`lowerObjectFields`'s `properties` record carries the same idiom
(`body-type-lowering.ts:118`, `:122`), so the field's fragment becomes that
record's prototype and no `properties` key is minted, while `required` still
lists the name. Measured on the first row: `properties` own keys `[]`,
`Object.getPrototypeOf(properties)` is `{"type":"string"}`,
`hasOwnProperty(properties,"__proto__")` is `false`. Both documents are
unsatisfiable by construction — the name is required and forbidden at once — and
in fact neither compiles: `AjvSchemaValidator.compile` throws
`schema is invalid: data/properties/type must be object,boolean`, because AJV's
meta-validation of `properties` enumerates the inherited `type` key. Recorded as
a control; the compile-throw is out of this report's scope (§Non-goals).

### (d) What changes when the payload is model-produced

The one input class that cannot arrive today is a payload key the theta corpus
cannot produce. The lowering side, meanwhile, does not guarantee closedness at
every record-building position:

```
lowerQueryResponseSchema("Unknown", …)    {}
buildInboundTranslationPlan(…).rootDef    "Unknown"
  sidecar                                 {"wireNames":[],"namedEnumPositions":[],"refTargets":[]}
translateInbound(payload, that plan)      out own keys ["ok2"], proto reassigned

parse of `let r = invoke<Unknown>("./kid.theta")`   diagnostics []
```

`buildInboundTranslationPlan` registers the root fragment under `rootDef`
unconditionally (`schema-lowering.ts:445`), so a permissive `{}` root is a
record-building position for the walk, and an annotation naming no declaration
lowers to `{}` with no load-time refusal. On the wired boundary that combination
still delivers a theta child's payload, so nothing reaches the assignment. On a
model-produced boundary it delivers whatever the model emitted, unvalidated.

### (e) The outbound walk carries the same defect

`translateOutbound` over a value with an own `__proto__` key, and over an
author-declared wire rename to `__proto__`:

| input | sidecar | wire own keys | wire prototype |
| --- | --- | --- | --- |
| `JSON.parse('{"__proto__":{…},"ok2":"v"}')` | none | `["ok2"]` | the `__proto__` value |
| `JSON.parse('{"p":{…},"ok2":"v"}')` | `wireNames:[{theta:"p",wire:"__proto__"}]` | `["ok2"]` | the `p` value |

Neither row is production-reachable at HEAD: the first needs a theta value with
an own `__proto__` key (0119), and the second needs a caller that supplies
`sidecars` + `rootDef` to the interpolation render, which no site in `src/` does
(`query-render.ts:422`; the only assignment of either field anywhere in `src/` is
the inbound plan's, `production-theta-producer.ts:3474–3475`). The row is
recorded because the fix covers this record too and because the second row's key
is author-written, not payload-supplied.

### (f) Controls

- `schema Pr { p as "P": string, ok2: string }` lowers to `properties` keyed
  `p`, `ok2` with a derived sidecar whose `wireNames` is `[]` — the pinned HEAD
  behaviour (`tests/inbound-translation-plan.test.ts:120–133`), and the reason
  §Reproduction (a)'s third row has no production route on this boundary.
- `schema Pr { p as "__proto__": string, ok2: string }` behaves identically: the
  rename does not reach the lowered document, and a payload spelling `__proto__`
  draws two AJV errors (`must have required property 'p'` and
  `must NOT have additional properties`).
- Bug 0067's three witnesses run green at this HEAD (20 tests):
  `tests/wire-translation-inbound-retag.test.ts`,
  `tests/inbound-translation-plan.test.ts`,
  `tests/subagent-invoke-inbound-enum-tag.test.ts`.

## Expected behaviour

- **`docs/spec_topics/runtime-value-model.md:34`** — the inbound pass "walks the
  validated JSON and (a) rebuilds the value with theta-side names using each
  schema's translation map". A rebuild that omits a key the validated JSON
  carried is not the value rebuilt with theta-side names; it is a different
  value. The same sentence fixes the boundary set this obligation covers —
  "typed query results, tool-call return decoding where typed, `invoke` returns,
  and binder `args`" — and states that it "is not restated per call site", so the
  rule that will govern 0172's boundaries is the rule already in force here.
- **`docs/spec_topics/runtime-value-model.md:12`** — an object-schema value is a
  "JS plain object keyed by **theta-side names**". A record whose prototype is a
  payload-supplied object is keyed by the theta-side names it retained, and
  additionally answers for every enumerable name that object carries. Bug
  0119's §Kind cites the same line for the constructor half of this class.
- **`src/parser/type-layer-checks.ts:316–327`** — the corpus's own statement of
  the rule, in the code it governs: null-prototype "because a `NamedType`
  reference carries no case constraint … so a reference may spell an
  `Object.prototype` own property (`constructor`, `toString`, `valueOf`,
  `__proto__`, …) verbatim", and "With no prototype, a declaration literally
  named `__proto__` becomes an ordinary own property too, instead of replacing
  the record's prototype." A payload key at an inbound boundary carries strictly
  fewer constraints than a `NamedType` reference does.
- **Bug 0031's fix record (`0031-…md:99–103`)** — the requirement as adopted:
  the record "must neither answer through the prototype chain nor let a
  `__proto__` assignment set the prototype". Both clauses fail here; the second
  is the one this report measures.
- **Bug 0038's fix record and witness** — the rule's two halves and their
  separate observables (`tests/typeenv-prototype-names.test.ts:1005–1041`): "on
  `Object.create(null)`, `o["__proto__"] = v` yields
  `Object.hasOwn(o, "__proto__") === true`, `Object.keys(o) === ["__proto__"]`,
  and the prototype still `null`". That is the end state this report's §Fix
  adopts verbatim for the rebuild record.
- **`docs/spec_topics/schemas.md:30`** — a wire name is an arbitrary JSON
  property name ("`ref_url as "$ref": string, // arbitrary JSON property names
  are fine`"). The outbound record's key space is therefore author-controlled
  without restriction, which is the same admission the inbound rename map
  inherits.

There is no CLAUDE.md in this repository; the dependency and safety posture that
governs this class is stated in the two fix records above and in the four
`Object.create(null)` sites they produced (§Affected).

## Actual behaviour / root cause

**1. The key namespace is shared with `Object.prototype`, and the record opts
into it.** `result` is created as `{}`, so it inherits `Object.prototype`'s
accessor pair for `__proto__`. `result[thetaKey] = v` is an ordinary assignment,
which finds that inherited setter and calls it: for an object or `null` `v` it
sets `[[Prototype]]`, and for a primitive `v` it returns without effect. No own
property is created in either case, and the assignment is not observable as a
failure — it has no return value the caller inspects and it throws nothing.

**2. `thetaKey` is not derived from anything that could have excluded the name.**
`const thetaKey = pointer === "" ? (index?.wireToTheta.get(wireKey) ?? wireKey) : wireKey`
(`:287`). Both arms are strings this module did not mint: `wireKey` is a key of
the validated payload, and `wireToTheta`'s values are declared field names. The
walk applies no name filter anywhere, and no upstream stage promises one — the
lowering's `additionalProperties: false` bounds which keys AJV ADMITS, and the
walk neither reads that keyword nor is documented as depending on it.

**3. The read side is already correct, which is why the defect is invisible in
review.** The module's three per-position lookups are `Map`s (`indexOf`, `:156`),
so no lookup in this file can answer through a prototype chain, and the payload
walk is `Object.entries`. Downstream, every theta-side read of the rebuilt record
is own-key-guarded — `assertKeyPresent` (`runtime-panics.ts:222`), `object.has`
(`stdlib-object.ts:123`), `match`'s field gate (`match-result.ts:214`) — and
`valuesEqual`'s object arm compares `Object.keys` plus
`propertyIsEnumerable.call` (`value.ts:541–558`), all own-key. So the reassigned
prototype is not observable from theta code at all. What IS observable is the
missing field: `keys()`, `values()`, `has()`, `JSON.stringify`, equality and a
field read all report a value that the boundary validated and the walk did not
carry across.

**4. Nothing between AJV and the walk re-checks the key set.**
`#validateInvokeReturn` compiles the lowered document, validates, and on
`verdict.ok` hands the same payload object to `translateInbound`
(`:3461–3477`). The walk trusts that verdict for shape and does not re-derive it.
That trust is well-founded for a closed fragment and unfounded for a permissive
one, and `buildInboundTranslationPlan` mints a root sidecar for both
(`schema-lowering.ts:445`), so the record-building position exists either way.

**5. The same expression is written twice in the file.** `lowerOutbound`'s record
(`:344`) and write (`:347`) are the mirror image with the wire name in the key
position. Neither has a production caller at HEAD, so the outbound half is
recorded and fixed rather than measured in production.

## Why it matters

- **A validated field is dropped from the rebuilt value with no diagnostic.**
  The failure mode is not an error — it is a value that differs from the
  validated payload by one key, which theta code then reads as absent
  (`missing object key: __proto__` on a field read, `false` from `has`, absent
  from `keys()`).
- **The rebuilt value's prototype becomes an object the payload chose.** Measured
  at the seam. It is not theta-observable through any read surface in §Affected,
  but it changes the JS-level identity of a record the interpreter hands to
  boundaries it does not own — the same point bug 0119's §Actual behaviour makes
  about its two host boundaries.
- **The one defence at HEAD is a property of the schema, not of the walk.**
  `additionalProperties: false` at every record-building position is what keeps
  the key out. That closedness is produced by `lowerObjectFields:137` and
  `params.ts:408`, in a different module, with no comment in either place stating
  that the inbound walk depends on it and no test asserting the dependency.
- **The boundary set that removes the other defence is already specified.**
  `runtime-value-model.md:34` names four inbound boundaries and states the rule
  is "not restated per call site"; three of them are unperformed and are 0172's
  subject. At each, the payload's key set is chosen by a model.
- **A permissive record-building position already exists.**
  `invoke<Unknown>("./kid.theta")` loads with zero diagnostics, lowers to `{}`,
  and receives a root sidecar (§Reproduction (d)). On a model-produced boundary
  that combination is a rebuild with no key-set validation at all in front of it.
- **The corpus has decided this class twice and this site was missed both
  times.** Bugs 0031 and 0038 produced five `Object.create(null)` sites and one
  exported own-key-guarded resolver. Bug 0119's §Fix constraint 7 lists this
  walk among the sites a fix must scope explicitly. No committed cell exercises
  either record build with a colliding key.
- **The remedy has no measured cost on any currently-reachable input.** Every
  read surface of the rebuilt value is own-key-based, so a null-prototype record
  is indistinguishable from today's record for every payload that does not spell
  a colliding key — which is every payload the wired boundary can deliver.

## Fix

Settled. Build both records with `Object.create(null)`, and keep the read half
own-key-guarded where the module gains a read by an author- or payload-controlled
key.

**(a) The construction.** Replace
`const result: { [k: string]: ThetaValue } = {}` at
`src/runtime/wire-translation.ts:281` and
`const result: { [k: string]: unknown } = {}` at `:344` with
`Object.create(null)` casts, matching the five existing sites
(`type-layer-checks.ts:329`, `:792`, `params.ts:337`,
`invoke-static-checks.ts:886`, `:999`). The end state is 0038's, stated there and adopted
here: a key spelled `__proto__` becomes an ordinary own enumerable key,
`Object.keys` reports it, `JSON.stringify` emits it, and the record's prototype
stays `null`. The assignment expressions, the key derivations and the recursion
are unchanged.

**(b) The reads.** No read in this module needs a new guard: the three
per-position lookups are `Map`s (`indexOf`, `:156`) and the payload walk is
`Object.entries`. The fix states that explicitly in the code so a later reader
does not have to re-derive it, and any future lookup added to this walk by an
author- or payload-controlled key uses `Object.hasOwn` per
`type-compat.ts:92–103`.

**(c) The brand still installs.** `rebuildUnder` brands through
`brandSchemaValue` (`:206`, `value.ts:277`), which uses `Object.defineProperty`
with a symbol key and is prototype-independent; `schemaTagOf` (`value.ts:300`)
reads the same symbol. The witness pins the brand's survival on a null-prototype
record rather than assuming it.

### Constraints

1. **No observable change for any currently-reachable input.** For a payload
   whose keys do not collide with `Object.prototype`, a null-prototype record has
   the same own keys, the same insertion order, the same `JSON.stringify`, the
   same `valuesEqual` verdicts (`Object.keys` + `propertyIsEnumerable.call`,
   `value.ts:541–558`) and the same `keys()` / `values()` / `has()` answers. The
   fix asserts this rather than assuming it.
2. **Bug 0067's three landed witnesses stay green byte-for-byte.**
   `tests/subagent-invoke-inbound-enum-tag.test.ts`,
   `tests/inbound-translation-plan.test.ts` and
   `tests/wire-translation-inbound-retag.test.ts` (20 tests, green at this HEAD)
   are landed locks: no assertion in them is edited, re-pinned or deleted by this
   fix.
3. **The string-coercion enumeration is inherited, not skipped.** Bug 0119's
   §Fix route (a) records the one measured cost of a null-prototype theta value:
   `String(record)` and `"x" + record` raise `TypeError` instead of yielding
   `[object Object]`. The rebuilt value reaches theta code, so this fix owes the
   same enumeration for the values it produces, bounded to the inbound value's
   consumers: the QRY-18 render path (`query-render.ts:429`, `JSON.stringify`),
   the theta `+` route (parse-closed per that record —
   `theta/parse/mixed-plus-operands`), and the `schemaTagOf` consumers. The
   outbound record's only consumer is one `JSON.stringify` (`:429`), so it
   carries no such exposure.
4. **Scope is stated, per bug 0119 §Fix constraint 7.** This fix covers the two
   record builds in `src/runtime/wire-translation.ts` and nothing else. The
   constructor sites, the two Pi-tool argument records, the two `params:` records
   and `lowerObjectFields`'s `properties` record are 0119's and stay as they are;
   the fix record names them as out of scope and says why (their reachability and
   their blast radius are that report's adjudication, not this one's).
5. **Ordering against 0172.** This fix lands before any of 0172's three
   boundaries is wired. If 0172 lands first, its own run performs (a) as part of
   it and this report is discharged there with its witness intact.
6. **No registry row, no spec edit.** The change makes the implementation conform
   to `runtime-value-model.md:34` as written; DIAG-2 is not engaged.
7. **Bug 0120 coordination.** 0120 is open against the same construction
   expression for key ORDER. The two changes are compatible (`Object.create(null)`
   preserves insertion order exactly as `{}` does) and whichever lands second
   rebases onto the other's hunk. No cell of either witness moves for the other.

### Witness

Offline, provider-free, in `tests/wire-translation-inbound-retag.test.ts` (the
seam's existing home) rather than a new file. Required cells:

- The construction observable in both directions: a payload built with
  `JSON.parse` whose own keys are `["__proto__","ok2"]` rebuilds to own keys
  `["__proto__","ok2"]`, `Object.getPrototypeOf(out) === null`, and
  `JSON.stringify(out)` carries both keys — the direction that reds on today's
  code.
- The primitive-valued row (`"__proto__":"str"`), which today is dropped with the
  prototype unchanged, so the record's key count is the observable.
- The rename-routed row (`wireNames:[{theta:"__proto__",wire:"Proto"}]`).
- The outbound row: `translateOutbound` over a value with an own `__proto__` key,
  and over `wireNames:[{theta:"p",wire:"__proto__"}]`.
- The no-perturbation controls on an ordinary payload: own keys, key order,
  `JSON.stringify`, `valuesEqual` in both argument orders, `keys()` / `values()` /
  `has()`, and the schema brand surviving `brandSchemaValue` /`schemaTagOf` on a
  null-prototype record.
- The AJV control of §Reproduction (b), so the report's own unreachability claim
  is pinned rather than asserted: on a closed lowered fragment the payload is
  refused before the walk.

## Non-goals

- **Global prototype pollution.** `Object.prototype` is not modified by any row
  here (measured: `({}).polluted` is `undefined` after §Reproduction (a)). This
  report claims a per-record prototype reassignment and a dropped key, and
  nothing wider.
- **The constructor-side drop.**
  [0119](./0119-proto-named-field-silently-dropped.md) owns a declared field
  named `__proto__` disappearing at construction, its four routes and its DIAG-2
  question. This report changes nothing there and does not decide between that
  report's routes; its cell F stays green.
- **The rebuilt record's key ORDER and the brand.**
  [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md)'s
  subject. Disjoint observable, same expression; §Fix constraint 7 records the
  coordination.
- **Wiring the three unperformed inbound boundaries.**
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)'s
  subject. This report hardens the walk those boundaries will run; it does not
  wire any of them.
- **`lowerObjectFields`'s `properties` record, and the AJV compile-throw it
  produces.** §Reproduction (c) measures both because they are the control that
  closes the declared-field route. `schema Pr { __proto__: string }` loading with
  zero diagnostics and then failing `AjvSchemaValidator.compile` with
  `schema is invalid: data/properties/type must be object,boolean` is a separate
  defect on a separate site (bug 0119 §Fix constraint 7's list); it is recorded
  here as evidence and is not filed or fixed by this report.
- **`invoke<Unknown>` loading clean.** §Reproduction (d) measures that an
  `invoke<T>` return annotation naming no declaration draws no diagnostic and
  lowers permissively; `theta/parse/unresolved-named-type`'s registered position
  list (`docs/spec_topics/diagnostics/code-registry-parse.md:93`) names the
  `@<T>` query annotation and not the `invoke<T>` return annotation. Recorded as
  the reason a permissive record-building position exists; whether that position
  should exist is not this report's question.
- **Whether the walk should re-validate the key set.** The fix removes the
  dependency on `additionalProperties: false` for CORRECTNESS of the record
  build; it does not add a key-set check to the walk, and it does not propose
  that the walk refuse an unexpected key.

## Provenance

Filed as residual R3 of the bug 0067 fix (0.90.0, commit `e18b30e5`). That run's
report (`.pi/tmp/fixes/0067-report.md`, §*Residuals / notes*, R3 —
"`rebuildInbound` builds its record with plain assignment") is the source: it
records the measurement, the two unreachability grounds, and the handover
sentence this report's §Status turns into an ordering clause ("It becomes
reachable the moment a **model-produced** payload boundary is wired — i.e. R2.
Whoever takes R2 must harden the record build first"). R2 is
[0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md).

**Re-verified at HEAD `e18b30e5` for this filing, not copied.** Every `src/`,
`tests/`, spec and bug-doc citation above was checked against the tree with `rg`
and by reading the file; the code reads as this report describes it. Specifically
re-read: `rebuildInbound` and `lowerOutbound` in full
(`src/runtime/wire-translation.ts`, 350 lines), `#validateInvokeReturn`
(`production-theta-producer.ts:3436–3487`) including the AJV-before-walk
ordering, `buildInboundTranslationPlan` (`schema-lowering.ts:423–536`),
`lowerObjectFields` (`body-type-lowering.ts:110–143`), `collectTypeEnv`'s design
note (`type-layer-checks.ts:316–329`), `resolveNamed` (`type-compat.ts:92–106`),
`valuesEqual`'s object arm (`value.ts:494–568`), `assertKeyPresent`
(`runtime-panics.ts:206–227`), `evaluateObjectMember`
(`stdlib-object.ts:105–128`), and `runtime-value-model.md:12`, `:34`.

**Measured independently for this filing** by one scratch vitest probe (written,
run, deleted; the tree was clean before and after): §Reproduction (a)'s inbound
rows including the prototype identity, the inherited read and the negative
`Object.prototype` check; (b)'s AJV verdicts through the production
`AjvSchemaValidator`; (c)'s two lowerings, the `properties` record's own keys and
prototype, and the compile-throw; (d)'s permissive lowering, root sidecar, rebuild
and the zero-diagnostic `invoke<Unknown>` parse; (e)'s two outbound rows; (f)'s
rename controls. Bug 0067's three witnesses were run at this HEAD and reported
20/20 green. The bug-0067 report's own R3 measurement is confirmed in every
particular — payload own keys `["__proto__","ok2"]` → out own keys `["ok2"]`,
`out proto is Object.prototype: false`, `Object.prototype` polluted `false` — and
this filing adds the prototype's identity (it is the payload's own value), the
primitive-valued arm, the rename-routed arm, the outbound twin, the lowering-side
control and the permissive-root position.

**Two corrections to sibling records, verified, made here rather than in their
files.** Bug 0119's §Affected states of this walk that "`grep -rn translateInbound
src/` finds no importer outside that module"; at HEAD there is one
(`production-theta-producer.ts:225`, call at `:3472`), landed by 0067's fix, and
its line citations into `wire-translation.ts` (`:129–175`, `:158`, `:167`,
`:171`, `:220`) all predate that fix — the positions are `:223`, `:281`, `:296`,
`:347` at `e18b30e5`. Bug 0119 also lists the outbound record as "reached in
production through `translateOutbound` ← `stringifyInterpolatedValue`'s object
arm"; the call edge exists but its guard never fires, because no site in `src/`
supplies `sidecars` + `rootDef` (`query-render.ts:422`; `rg -n "rootDef" src/`).
Neither correction is applied to that document — it is another open report's
file.

Volatile positions are named by symbol beside their line numbers per bug
[0134](./0134-params-shift-induced-stale-citations.md);
`src/extension/production-theta-producer.ts` is 6165 lines at this HEAD.

## Fix (0.96.0)

- **What shipped.**
  - `src/runtime/wire-translation.ts` — **§Fix (a)**: `rebuildInbound`'s record
    (`:299` at the fix commit, `:281` before the comment insertion) and
    `lowerOutbound`'s record (`:366`, was `:344`) are built with
    `Object.create(null)` casts, in the form the corpus's five existing sites
    use (`src/parser/type-layer-checks.ts:329`, `:792`,
    `src/parser/params.ts:337`, `src/extension/invoke-static-checks.ts:886`,
    `:999`). The assignment expressions (`result[thetaKey] = …`,
    `result[wireKey] = …`), the key derivations (`thetaKey`, `wireKey`,
    `fieldPointer`, `fallbackTarget`), the guards and the recursion are
    byte-identical to before; the file's only changed executable lines are those
    two, verified by filtering the diff to non-comment changed lines.
  - `src/runtime/wire-translation.ts` — **§Fix (b)**: the reason no read in this
    module needs a new own-key guard is stated in the code rather than left to
    be re-derived — the three per-position lookups are `Map`s (`indexOf`
    `:156`; `wireToTheta` `:161`, `enumByPointer` `:165`, `refByPointer`
    `:169`) and the payload walk is `Object.entries`, own-enumerable only, so
    nothing in the file answers through a prototype chain; a lookup added here
    later by an author- or payload-controlled key uses `Object.hasOwn` per
    `type-compat.ts:92–103` (`resolveNamed`). The outbound record carries the
    shorter form of the same statement, keyed to `schemas.md:30` (a wire name is
    an arbitrary JSON property name, so that key space is author-controlled
    without restriction).
  - `tests/wire-translation-inbound-retag.test.ts` — **§Witness**, additive in
    the seam's existing home as §Witness directs: one new `describe` of nine
    cells, +310/−1 lines, the single deletion being the import line widened to
    admit `translateOutbound`. Bug 0067's eight cells are byte-identical to
    HEAD (`diff` of `HEAD:15–283` against working `21–289`: no output).
  - **§Fix (c)** needed no code: `brandSchemaValue` (`src/runtime/value.ts:277`)
    installs through `Object.defineProperty` on a symbol key and `schemaTagOf`
    (`:300`) reads that symbol, so neither consults a prototype. Cell 4 pins the
    survival rather than assuming it, on a record that is null-prototyped and
    carries the colliding own key at the same time.

- **Gates** (at the fix commit, on the shipped tree):
  - Witness — `npx vitest run tests/wire-translation-inbound-retag.test.ts`:
    `Test Files 1 passed (1) / Tests 17 passed (17)` (6 formerly-red cells, 3
    controls, 8 protected bug-0067 cells).
  - Full default suite — `npm test`: `Test Files 296 passed (296) / Tests 4904
    passed (4904)`.
  - Typecheck — `npx tsc -p tsconfig.json --noEmit`: no output, exit 0.
  - Lint — `npm run lint`: no output, exit 0.
  - Live H8a — `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts`: `Tests 36 passed (36)`.

- **Review.** One deep round, one polish round, no confirmation round.
  - Round 1 (`bug-fix-reviewer`) — FINDINGS. F1 (`correctness`): a
    null-prototype rebuilt record reaching `String(…)` throws instead of
    yielding `[object Object]`, at two consumers outside §Fix constraint 3's
    three named surfaces. F2 (`prose`): the shipped WHY-comment said the
    construction half "was missing" — past tense about this file's own prior
    state, which CLAUDE.md's no-historical-references rule forbids. Everything
    else confirmed correct with quoted evidence: §Fix (a)/(b)/(c) fidelity, the
    cast form against all five corpus sites, constraints 1/2/4/6, witness
    completeness against every §Witness bullet, and every `path:line` in the
    added text re-derived.
  - Round 2 (`bug-fix-fixer-light`) — F2 fixed, comment text only, file line
    count unchanged at 372 so no citation moved. F1 was not dispatched: it is
    dispositioned, not fixed (residual 1).
  - No confirmation round. The polish round changed no executable line —
    verified by filtering the round's diff to non-comment changed lines, which
    yields only §Fix (a)'s two `const result` lines — and the gates re-ran
    green, so the round was verified by gate-diff instead.

- **Verification** (`bug-fix-verifier`) — SOLID, four obligations:
  - *The witness reds.* Both record builds were neutralised back to `= {}` by
    targeted byte edit (never `git stash`, never `git checkout`), giving
    `Tests 6 failed | 11 passed (17)`: five cells on `expected [ 'ok2' ] to
    deeply equal [ '__proto__', 'ok2' ]` (the dropped own key) and one on
    `expected { polluted: 'yes' } to be null` (the reassigned prototype) — the
    two observables §Reproduction (a) predicts, no harness errors. Restored and
    blob-hash-verified: `git hash-object` reads
    `b8222bdae69fcddf096687a51201274dd8e5f03e` before neutralisation and after
    restoration, `wc -l` 372 both times.
  - *The default suite.* 296 files / 4904 tests green.
  - *End-to-end live coverage.* Two parts. The colliding-key input has no live
    route by construction — §Reproduction (b) and (d) establish that the one
    wired boundary's payload is `JSON.parse` of a theta child's own
    `JSON.stringify`, which carries no own `__proto__` key — so the end-to-end
    exercise of the changed code path is
    `tests/subagent-invoke-inbound-enum-tag.test.ts` (green in isolation,
    provider-free, spawning a real child across the PIC-59 envelope through
    `#validateInvokeReturn` → `translateInbound` → the changed record build),
    and the live suite's role is the no-regression guard constraint 1 asks for:
    H8a 36/36 green, including its own bug-0067 enum-tag cell, which round-trips
    a real object through `rebuildInbound`. No new live cell was added and none
    is owed: this fix adds no registry row, no diagnostic and no
    registration-surface change (constraint 6), and
    `tests/fixtures/h7a/permitted-codes.json` is byte-unchanged.
  - *Lint and typecheck.* Both clean.

- **Constraint 1 — no observable change, asserted rather than assumed.**
  Measured before the witness was written, by prototyping §Fix (a) alone against
  the whole tree: full suite green with zero flips, plus clean typecheck and
  lint. Then pinned by two control cells that hold on both sides of §Fix (a),
  over a payload whose keys do not collide: own keys `["b","a"]`, insertion
  order preserved rather than sorted (the fixture is deliberately
  non-alphabetical, so a reordering would be visible), `JSON.stringify`
  `{"b":"2","a":"1"}`, `valuesEqual` true in both argument orders against a
  locally constructed branded value, and `keys()` / `values()` / `has()` through
  the real `evaluateObjectMember` including `has("toString")` false. A fixture
  sweep found `__proto__` in four committed test files and in no committed
  `.theta` / `.thetalib` / `.json` at all; none of the four reaches this module,
  so no committed cell exercised either record build with a colliding key, in
  either direction.

- **Constraint 3 — the string-coercion enumeration, as measured.** Bug 0119's
  route (a) records the cost this fix inherits: on a null-prototype record
  `String(record)` and `"x" + record` raise `TypeError: Cannot convert object to
  primitive value` where a `{}`-prototyped record yields `[object Object]`;
  `JSON.stringify` is unaffected. Enumerated over the inbound value's consumers.
  The three §Fix constraint 3 names are all safe, each checked in the code:
  - *The QRY-18 render path.* `stringifyInterpolatedValue`
    (`src/render/query-render.ts`) routes its `object` and `array` arms through
    `JSON.stringify(lowered)`; its one `String(value)` is the `enum` arm, which
    receives a boxed string, never a record. An object interpolation parses with
    zero diagnostics and renders through that arm.
  - *The theta `+` route.* Parse-closed, measured on real sources: both
    `object + string` and `object + object` draw
    `theta/parse/mixed-plus-operands`, so `"x" + record` has no theta route.
  - *The `schemaTagOf` consumers.* Symbol-keyed and prototype-independent;
    pinned green on a null-prototype record by cell 4.

  Two further consumers coerce and are **outside** the bound §Fix constraint 3
  states. Both were found by review round 1 and confirmed here by measurement:
  `String(innerKind)` in the invoke `Err`-wrapping message
  (`src/runtime/effectful-statement-host.ts:401`) and the SNK-k catch-all's
  `${leaf.kind}`, with the forged-kind rows' `${e.message}` / `${e.tool_name}` /
  `${e.cause}` / `${e.callee_path}` (`src/runtime/err-note-render.ts:126`,
  `:161–163`). Measured: theta admits an object in an `Err` payload's `kind`
  position with zero diagnostics on all four sources tried, including
  `Err(E { kind: i, message: "m" })` over a schema-typed `i` and the
  typed-invoke-bound variant; `String(nullProtoRecord)` throws while
  `String(plainRecord)` gives `[object Object]`; and
  `renderLeafKindNote("t", { kind: nullProtoRecord, message: "m" })` throws
  where the `{}`-prototyped shape renders
  `theta /t returned Err: [object Object] — m`. The failure mode at those two
  sites therefore changes for a record this walk rebuilds. It is recorded, not
  fixed — see residual 1. The outbound record's only consumer is one
  `JSON.stringify` (`query-render.ts`), so it carries no such exposure.

- **Constraint 4 — scope.** This fix covers the two record builds in
  `src/runtime/wire-translation.ts` and nothing else. Named out of scope and
  left exactly as they are, with the reason: the constructor sites, the two
  Pi-tool argument records, the two `params:` records and `lowerObjectFields`'s
  `properties` record (`src/parser/body-type-lowering.ts:118`) are
  [0119](./0119-proto-named-field-silently-dropped.md)'s — their reachability
  and their blast radius are that report's adjudication, not this one's, and its
  cell F (`tests/ctor-declaration-order.test.ts`) stays green untouched. The
  rebuilt record's key ORDER is
  [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md)'s;
  `Object.create(null)` preserves insertion order exactly as `{}` does, so the
  two changes are compatible and no cell of either witness moved. The three
  unperformed inbound boundaries are
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)'s
  and none was wired here. `lowerObjectFields`'s AJV compile-throw and
  `invoke<Unknown>` loading clean stay §Non-goals, recorded and unfiled.

- **Residuals.**
  1. **The two coercion consumers outside constraint 3's bound.**
     `src/runtime/effectful-statement-host.ts:401` and
     `src/runtime/err-note-render.ts:126`, `:161–163` interpolate an open-union
     `kind` — ERR-15 discriminator openness types it `string`, but the type
     layer admits an object there with zero diagnostics — so for a rebuilt
     record in that position the rendered note changes from `[object Object]` to
     a thrown `TypeError`. Evidence as measured under constraint 3 above. **Not
     fixed here, for two reasons that do not depend on judgement.** Constraint 4
     confines this fix to the two record builds and nothing else, and both files
     are outside it; and the behaviour those sites had before this fix is itself
     a defect — a user-facing note rendering `[object Object]` for a payload the
     type layer permitted. The remedy belongs at the render sites,
     coercion-safe in the posture `summariseNonResultOperand` already takes
     (`src/runtime/runtime-panics.ts:441`), and is a separate report's subject.
     Left for the parent to file; this run creates no bug docs. Scope of the
     claim: the enumeration is bounded to consumers reachable from a record this
     walk rebuilds, and pins parse-legality plus the coercion semantics at the
     two named sites; it does not trace the full runtime chain end to end.
  2. **Positional drift into two open reports' citations.** The witness addition
     widened this file's import block, shifting every following line by six. The
     cell
     [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)
     (`:221`, `:858`) and
     [0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) (`:210`,
     `:628`, `:647`) cite as
     `tests/wire-translation-inbound-retag.test.ts:200` is at `:206`, and the
     one 0172 cites at `:256` (`:901`, `:945`) is at `:262`. Both cells are
     byte-identical and green; only their line numbers moved. Disclosed and not
     chased, per
     [0134](./0134-params-shift-induced-stale-citations.md), and not edited
     because both are other open reports' files.
  3. **Two citations in this report are off against the tree.** The sidecar maps
     are at `:161` / `:165` / `:169`, not §Affected's `:160` / `:164` / `:168`;
     and §Reproduction (e)'s "wire prototype" column names the theta-side value
     as though by identity, where the measured prototype is a structurally equal
     lowered copy — `lowerOutbound` rebuilds a nested plain object
     unconditionally, unlike `rebuildInbound`, whose `pointer !== ""` arm
     returns the value by reference (identity does hold on the inbound rows,
     measured). Recorded as pre-fix baseline drift; the outbound cells pin own
     keys and the prototype rather than identity, so no assertion rests on it.

- **Discharge notes appended:** none. 0172's report already carries the
  prerequisite clause and 0120's already carries the rebase clause; neither was
  edited, both being other open reports' files.

- **Pinned dispositions / non-goals.** No registry row and no spec edit
  (constraint 6): the change makes the implementation conform to
  `runtime-value-model.md:34` as written, and DIAG-2 is not engaged. No key
  filter was added to the walk and no unexpected key is refused — §Non-goals'
  last bullet stands. One self-authorization, recorded in full: the question was
  whether to tighten a clause in the shipped WHY-comment that repeated "no
  read-side guard" twice in one sentence. Taken as comment-only under the
  citation/comment branch, on three grounds — the change touches no executable
  line (verified by filtering the diff to non-comment changed lines, which
  yields only §Fix (a)'s two `const result` lines), the file's line count is
  unchanged at 372 so the `:299` / `:366` citations the witness carries do not
  move, and all four gates re-ran green afterwards. Bound: one comment line in
  `src/runtime/wire-translation.ts`. Stop valve, unused: revert to the reviewed
  wording if the line count moved or any gate went red.
