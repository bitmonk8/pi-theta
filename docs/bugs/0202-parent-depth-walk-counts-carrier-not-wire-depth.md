# Bug 0202 — `#validateInvokeReturn` hands `enforceInvokeReturnDepth` the raw theta value, so `depthWalk` counts the boxed-`String` enum carrier's character indices as a nesting level (`Object.keys(new String("red"))` is `["0","1","2"]`) and a typed `invoke<array<array<array<array<Colour>>>>>` of a prompt-mode callee whose tail is `[[[[Colour.Red]]]]` — wire form `[[[["red"]]]]`, JSON-document depth 5, which the cap admits — binds `Err(InvokeInfraError { cause: "return_validation", message: "JSON document depth exceeds 5" })`, a message false of the value it names, where the byte-identical payload crosses the child-side gate bug 0187 fixed and the same annotation over a plain `string` binds `Ok`

- **Status:** open. §Fix is constraint-pinned rather than settled. The *metric*
  is settled — bug 0187's shipped record fixes the verdict as a function of the
  payload's wire form, and states this gate's divergence in its own pinned
  dispositions — but the *placement* of the wire-form walk is not: four
  candidate sites, each with a different blast radius across the two remaining
  carrier-exposed ceiling-#4 enforcement points, and each colliding with GOV-15
  (`docs/spec_topics/governance/source-language-stability.md:5`) from the
  removal direction, where falsely-refused inputs newly succeed. The constraints
  are in §Fix (b)–(d) and the same-commit corrections in §Fix (e).
  Ordering: nothing blocks this report from starting and it blocks nothing.
  [0187](./0187-untyped-subagent-return-boundary-no-depth-ceiling.md) is
  **fixed (0.116.0)**, commit `940206cb` — the provenance, and the owner of
  every byte in `src/runtime/subagent-envelope.ts` a route here would read or
  move.
- **Sev/Diff estimate:** S2/D2 — S2 because a conformant input is refused
  **loudly** with a message that is false of it, not silently mis-valued. The
  author's payload is inside the cap as the spec counts it: `schema-subset.md:13`
  fixes the cap over "the JSON document depth", `:26–30`'s counting algorithm
  runs over that document, and the document is `[[[["red"]]]]` at depth 5
  (measured). The caller nonetheless binds
  `Err(InvokeInfraError { kind: "invoke_infra", message: "JSON document depth exceeds 5", callee_path: "./kid.theta", cause: "return_validation" })`
  (§Reproduction (b), row b1), and both fixture sources parse with `[]`
  diagnostics. No value is corrupted and no comparison flips, which is what
  keeps it out of the S1 band. D2 because the remedy's shape is already shipped
  one boundary away — `wireFormExceedsDepthCap`
  (`src/runtime/subagent-envelope.ts:475`) is the same measurement over the same
  counting algorithm, reviewed and landed at 0.116.0 — so the run adjudicates
  placement and site scope rather than deriving a mechanism. Touched pins,
  enumerated and checked: `tests/invoke-ceiling-depth.test.ts` cells `:105`,
  `:110`, `:146` and `:151` cite `enforceInvokeReturnDepth`, and their vehicles
  `DEPTH_5_VALUE` (`:36`) and `DEPTH_6_VALUE` (`:39`) are plain nested objects
  carrying no enum value, so no cell there re-derives; 0180's `CONTROL
  (FENCE-DEPTH)` cell
  (`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:824`) makes two
  `enforceInvokeReturnDepth` assertions (`:855`, `:865`) whose vehicles
  (`:842`, `:865`) are likewise carrier-free and stay true; 0174's two witnesses
  over `#validateInvokeReturn` carry enum payloads whose deepest wire documents
  are `[Sev.High]` and `Box { sev: Sev.High, who: "w" }` — depth 2 — and stay
  green. D2 rather than D1 because the site-scope question is real — three
  of ceiling #4's five enforcement points are handed interpreter values, not
  parsed JSON (§Reproduction (d)) — and because the GOV-15 adjudication is not
  the one 0187 made.
- **Kind:** defect, four elements, each measured at HEAD `940206cb` (v0.116.0)
  through the real in-process prompt→prompt attach cell and the shipped seams
  directly.
  1. *The walk counts the carrier, not the document.* `depthWalk`
     (`src/runtime/depth-walk.ts:195`) descends any value whose
     `Object.keys(...)` is non-empty (`hasChildren`, `:120`). `makeEnumValue`
     (`src/runtime/value.ts:135`) returns `new String(wire)`, whose own
     enumerable keys are its character indices. Measured:
     `Object.keys(makeEnumValue("Colour","red"))` is `["0","1","2"]`;
     `jsonDepth([[[[Colour.Red]]]])` is **6** where `jsonDepth([[[["red"]]]])`
     is **5**, and the two values have the same `JSON.stringify` output.
     The over-count is exactly one level and does not scale with the wire
     string: a seven-character variant measures 6 as well, and a variant whose
     wire string is `""` measures 5 (`Object.keys` is `[]`), so the empty
     variant is the one enum value the walk counts correctly.
  2. *The gate hands it the raw value, ahead of the projection that collapses
     the carrier.* `#validateInvokeReturn`
     (`src/extension/production-theta-producer.ts:3679`) calls
     `enforceInvokeReturnDepth(calleePath, result.value)` at `:3693` — the
     callee's own value — and reaches `projectForValidation(result.value)`
     (`src/runtime/wire-translation.ts:637`) only at `:3706`, for the AJV call.
     Measured: `projectForValidation([[[[Colour.Red]]]])` is `[[[["red"]]]]`,
     `jsonDepth` **5**. The projection that exists to normalise this exact
     representation difference runs 13 lines after the gate that trips on it.
  3. *The two return gates now disagree about one payload's depth.* 0187's
     `mapTooDeepReturnValue` (`src/runtime/subagent-envelope.ts:559`) answers
     `undefined` for `[[[[Colour.Red]]]]` and `serializeOkEnvelope` writes
     `{"theta_result":{"v":1,"ok":[[[["red"]]]]}}` — the child crosses. Driven
     through the parent's own seams, that parsed value passes
     `enforceInvokeReturnDepth` (`undefined`) and AJV validates it `{"ok":true}`
     against the lowered annotation. The same payload at the prompt→prompt
     attach cell refuses. A callee's `mode:` frontmatter selects the outcome —
     the mode-variance class `invocation.md:36` forbids and
     [0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) closed
     at this method, reappearing one level deeper through a different gate.
  4. *The shipped rationale for leaving `depth-walk.ts` carrier-free is false in
     one clause.* `src/runtime/subagent-envelope.ts:434–435` states the carrier
     arm belongs in the envelope writer "because that module answers for all five of
     ceiling #4's AJV enforcement points, and four of them are handed
     already-parsed JSON where a boxed `String` cannot occur". Three of the five
     are handed interpreter values: the `invoke(...)` `params` boundary
     (`argValues: readonly ThetaValue[]` from `evaluatePureExpression`,
     `production-theta-producer.ts:3293`, `:3330`, walked at `:3439`), the
     code-driven tool-args boundary (`lowerToolCallParams`'s
     `evaluatePureExpression` output, `:3016` / `:3979`, walked at `:3032`), and
     the `invoke<T>` return boundary on the prompt→prompt attach cell. Measured
     at the seams: `enforceInvokeParamsDepth("./kid.theta", [[[[Colour.Red]]]])`
     returns `Err(InvokeInfraError { cause: "validation" })` and
     `enforceCodeToolArgDepth("t", [[[[Colour.Red]]]])` returns a breach. Only
     the typed-query-response and model-driven tool-args boundaries read JSON a
     parser produced.
- **Related:**
  - [0187](./0187-untyped-subagent-return-boundary-no-depth-ceiling.md) —
    **fixed (0.116.0)**, commit `940206cb`. The provenance from three
    directions. Its review round 1 measured this divergence, its fix corrected
    the **child** side by giving the envelope writer a module-private wire-form
    walk, and its `§Fix` pinned dispositions leave this side alone by name: "The
    pre-existing sibling of the wire-form/carrier divergence at the
    **parent-side typed** boundary (`enforceInvokeReturnDepth` walks the raw
    theta value at `#validateInvokeReturn`) is out of scope by §Fix (e)(7) and
    is recorded here rather than changed" (`:1336–1339`). §Fix (e)(7) is the
    byte-freeze on `src/runtime/wire-translation.ts` and on 0174's
    projection/original split, which the gate sits inside. That run's report
    states the same finding as residual 2 (quoted in §Provenance). **It did not
    cause this.** `depthWalk` has had no carrier arm since `V5e`; 0187 added the
    second walk beside it and named the divergence rather than introducing it.
  - [0180](./0180-invoke-return-nonfinite-number-mode-variance.md) — **fixed
    (0.105.0)**, commit `bf32ad03`. Owns `CONTROL (FENCE-DEPTH)`
    (`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:824`), whose third
    assertion (`:855`) drives `enforceInvokeReturnDepth` directly and pins that
    a level-7 payload is refused "regardless of what it carries". That
    assertion's vehicle is a plain nested object, so it is metric-invariant and
    a route here leaves it standing; §Fix (c)(2) states the check.
  - [0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) —
    **fixed (0.98.0)**. Owns the fix site and the distinction this report turns
    on. Its §Fix (b) split `#validateInvokeReturn` into a wire-form projection
    for the AJV call and the callee's own value for everything else; the depth
    gate was on the original-value side of that split and stayed there. Its
    §Fix's own doc-comment addition asserts the two cells are reconciled — "the
    method projects the value to its wire form for the AJV call, so the
    boxed-`String` representation difference between the two cells is normalised
    at the gate: a callee's `mode:` frontmatter cannot change whether a
    named-enum return validates, or what the caller binds for one"
    (`production-theta-producer.ts:3654–3659`). That sentence is true of the AJV
    call and false of the method: the depth sub-check ahead of it reads the
    unprojected value. Correcting it is part of this report's fix (§Fix (e)(1)),
    not a separate report — the same disposition 0174 itself took toward 0067's
    doc-comment. Both of its witnesses re-run green under any route here
    (payloads at document depth ≤ 2).
  - [0201](./0201-result-carried-payloads-skip-envelope-walks.md) — **open**,
    filed in the same pass from 0187's report residual 1. Disjoint on the
    observable and on the direction: 0201's class is a payload the child-side
    walks under-count and therefore admit; this report's is a payload the
    parent-side walk over-counts and therefore refuses. They share one function
    only if this report's route takes §Fix (b)(1) (see §Fix (f)). Measured for
    the boundary: `depthWalk` DOES descend a `Result`'s own enumerable `ok` /
    `value` keys (`jsonDepth(Ok([[[[1]]]]))` is 6 against a wire document of
    depth 6), so the parent gate has no `Result` under-count of its own.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for positional drift. Every citation into
    `src/extension/production-theta-producer.ts` (6400+ lines) below is named by
    symbol beside its line number under that adjudication.
- **Affected** (every citation re-verified against the tree at HEAD `940206cb`,
  v0.116.0, by `git show HEAD:<path>`; positions in
  `src/extension/production-theta-producer.ts` and
  `src/runtime/subagent-envelope.ts` are named by symbol beside their line
  numbers per [0134](./0134-params-shift-induced-stale-citations.md)):
  - **The gate.** `src/runtime/invoke-ceiling-depth.ts`:
    `enforceInvokeReturnDepth` (`:99`) and its sibling
    `enforceInvokeParamsDepth` (`:83`), both delegating to the shared
    `enforceInvokeDepth` (`:121–141`) whose whole measurement is
    `const walk = depthWalk(value);` (`:126`). The module's header states the
    intent it does not achieve (`:26–31`): the two functions "run `V5e`'s depth
    walk over the materialised value *before* AJV (CIO-3)" — the materialised
    value at the prompt→prompt attach cell is the interpreter's, not the
    document's. `InvokeDepthBreach` (`:64–68`) types `issue` as a
    `DepthViolationIssue`, whose `path` is non-optional.
  - **The walk.** `src/runtime/depth-walk.ts`: `MAX_JSON_DEPTH = 5` (`:40`),
    `DEPTH_VIOLATION_MESSAGE = "JSON document depth exceeds 5"` (`:50`),
    `hasChildren` (`:120`, the arm that reads a boxed `String` as a non-empty
    object), `jsonDepth` (`:141`), `firstTooDeep` (`:164`) and `depthWalk`
    (`:195`). The module header names its own domain as "a *materialised* JSON
    value" (`:19`) and its title line as "the theta-owned JSON-document depth
    walk" (`:1`).
  - **The call site.** `src/extension/production-theta-producer.ts`:
    `#validateInvokeReturn` (`:3679`), its depth sub-check
    (`:3693`, `enforceInvokeReturnDepth(calleePath, result.value as unknown)`),
    the lowering (`:3697`) and the AJV call
    (`:3706`, `validator.validate(projectForValidation(result.value))`). Its two
    call sites in `#driveCallee` are `:3519` (the prompt→prompt attach cell) and
    `:3557` (the subagent spawn cell); `#resolveReturnSite` is `:3616`. The
    doc-comment paragraphs that describe the projection as reconciling the two
    cells are `:3646–3659`; the ordering paragraph is `:3661–3668`.
  - **The projection the gate runs ahead of.**
    `src/runtime/wire-translation.ts:637`, `projectForValidation`, whose first
    arm (`:638–642`) collapses a boxed `String` to `value.valueOf()` and whose
    `isResultValue` arm (`:654–661`) does not descend a `Result`.
  - **The child-side counterpart, and the shipped statement of the divergence.**
    `src/runtime/subagent-envelope.ts`: `wireFormExceedsDepthCap` (`:475`, whose
    `value instanceof String` arm is `:479` and whose `isResultValue` arm is
    `:490`), `mapTooDeepReturnValue` (`:559`) and its call (`:563`). Its
    doc-comment (`:414–435`) states the whole argument, including the sentence
    this report's element 4 falsifies (`:434–435`) and the sentence that
    describes this report's observable exactly (`:429–432`): "Sharing
    `depthWalk` here would therefore
    refuse a payload whose JSON document is WITHIN the cap:
    `[[[[Colour.Red]]]]` serialises to `[[[["red"]]]]`, document depth 5, and a
    refusal naming depth would be false of it."
  - **The carrier.** `src/runtime/value.ts:135`, `makeEnumValue`, returning
    `new String(wire)` with the declaring-enum tag installed as a non-enumerable
    symbol. The tag is not the problem: a non-enumerable symbol is invisible to
    `Object.keys`. Measured control: `brandSchemaValue({x:1},"Box")` has
    `Object.keys` `["x"]` and `jsonDepth` 2, so the `SCHEMA_TAG` brand adds no
    level. The box does.
  - **The spec the refusal claims to enforce.**
    `docs/spec_topics/schema-subset.md:13` — "**Depth**: ≤ 5 levels of nesting
    at runtime (**the JSON document depth**, not the schema graph)"; `:22` —
    "The `Depth ≤ 5` ceiling above is a property of the **runtime JSON value**,
    not of the schema graph"; `:24–30`, the counting algorithm, whose four rules
    range over JSON values alone — "A scalar (`string`, `number`, `integer`,
    `boolean`, `null`) has depth `1`" (`:26`), "An empty object `{}` or empty
    array `[]` has depth `1`" (`:27`), "A non-empty object or array has depth
    `1 + max(depth(child))` over its members or elements" (`:28`), "`anyOf` arms
    are not levels: depth is measured against the **materialised** value at
    runtime" (`:29`), "The cap is `depth ≤ 5`" (`:30`). No rule mentions a host
    representation, and `string` appears in `:26`'s scalar list. `:39` names the
    five enforcement points, `:45` is point 5 ("`invoke<T>` return-value
    validation — when `invoke<Schema>(...)` succeeds and the callee's return
    value is AJV-validated against `<Schema>` before propagation to the
    caller"), and `:47` fixes the walk as "a cheap fast-fail" run "**before**
    AJV at each site". Reference mirror:
    `docs/reference/schema-subset.md:27`, `:111–117`, `:262`.
  - **The carrier's own normative sentence.**
    `docs/spec_topics/runtime-value-model.md:13`, the enum-variant row: "The tag
    MUST NOT appear in JSON output (`JSON.stringify` of an enum value yields the
    bare wire string)". `:16` records the boxed-`String` carrier as the
    non-normative reference encoding and states that these shapes "are
    implementation details — neither is reachable from theta code, neither
    appears in any wire schema".
  - **The ceiling's own table and ordering rule.**
    `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:19` ("Ceiling #4 is the
    JSON-document depth-5 ceiling against the five enforcement points"), the
    `invoke<T>` return-value row (`:27`,
    `Err(InvokeInfraError { cause: "return_validation", … })`, destination
    *invoke parent*), and CIO-3 (`:41`) fixing ceiling #4 as "the first
    sub-check at every AJV validation boundary". The *Five-site list co-edit
    obligation* is
    `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md:47`.
  - **The pins.** `tests/invoke-ceiling-depth.test.ts:105` (the
    `invoke<T>`-return cell), `:110`, `:146`, `:151`, over `DEPTH_5_VALUE`
    (`:36`) and `DEPTH_6_VALUE` (`:39`) — both plain nested objects; the cells
    assert `schema_keyword` (`:130`) and `message` (`:131`) but no
    `issue.path`. `tests/subagent-envelope-nonfinite-ok-refusal.test.ts:824`
    (`CONTROL (FENCE-DEPTH)`), assertions at `:855` and `:865` over vehicles at
    `:842` and `:865`. `tests/invoke-return-enum-carrier-projection.test.ts` and
    `tests/invoke-prompt-cell-enum-return.test.ts` (0174's witnesses over the
    method).
  - **The corpus.** No committed `.theta` or `.thetalib` reaches this class:
    of the 34 files `git ls-files '*.theta' '*.thetalib'` lists, 0 declare an
    `enum`, 0 write `invoke<`, and 0 contain a nested array literal (`[[`). The
    class is reachable from clean source and unreached by the corpus — the same
    reachability shape 0187 carried on the child side.
- **Observed at:** v0.116.0 (`940206cb`, `package.json:3`), the fix commit for
  bug 0187. Offline, deterministic, provider-free: three scratch vitest probes
  (written, run, deleted; `git status --porcelain` and a case-insensitive
  `scratch` sweep verified empty afterwards) driving the REAL in-process
  prompt→prompt attach cell end to end (`parseThetaDocument` →
  `createProductionProducerDeps({ parseCallee })` → `bindPromptConversation` →
  `executeBody`, explicit `invoke<T>("./kid.theta")` form, a real
  `AjvSchemaValidator` (`src/seams/schema-validator.ts:104`) on the runtime root
  — the harness shape
  `tests/invoke-return-enum-carrier-projection.test.ts` uses), plus the shipped
  seams directly (`enforceInvokeReturnDepth`, `enforceInvokeParamsDepth`,
  `enforceCodeToolArgDepth`, `enforceModelToolArgDepth`, `depthWalk`,
  `jsonDepth`, `projectForValidation`, `mapTooDeepReturnValue`,
  `serializeOkEnvelope`, `parseEnvelopeLine`, `lowerQueryResponseSchema`,
  `makeEnumValue`, `brandSchemaValue`). Every callee and caller body is a pure
  tail expression, so zero model turns were spent and no provider was contacted.
  Every value in §Reproduction is that run's output verbatim.

  One caveat on the tree state: a sibling run held an uncommitted edit to
  `src/runtime/subagent-envelope.ts` during part of this measurement. It touched
  `serializeOkEnvelope` only (a `-0`-preserving replacer, early-returning
  `JSON.stringify`'s own output when the document carries no `-0`), leaving
  `wireFormExceedsDepthCap` and `mapTooDeepReturnValue` byte-identical to HEAD.
  Every §Reproduction (c) value was re-checked against `git show HEAD:<path>`
  and the tree was clean at `940206cb` when this report was written.

## Summary

`schema-subset.md:13` fixes ceiling #4's cap over "the JSON document depth", and
`:22` restates it: "a property of the **runtime JSON value**". The counting
algorithm at `:24–30` ranges over JSON values — scalars, empty containers,
non-empty objects and arrays — and names no host representation.

`enforceInvokeReturnDepth` measures something else. `#validateInvokeReturn`
hands it `result.value` — the interpreter's own value — and `depthWalk` descends
by `Object.keys`. A named-enum variant's carrier is `new String(wire)`, whose
own enumerable keys are its character indices, so the walk counts one level for
a value that serialises to a scalar. The verdict is a property of the carrier
graph, not of the document.

The gap opens at exactly one place: a payload whose wire document is depth 5 and
whose level-5 scalar is an enum variant. Measured end to end through the real
prompt→prompt attach cell, `invoke<array<array<array<array<Colour>>>>>` of a
prompt-mode callee whose tail is `[[[[Colour.Red]]]]` binds

```
Err(InvokeInfraError { kind: "invoke_infra", message: "JSON document depth exceeds 5",
                       callee_path: "./kid.theta", cause: "return_validation" })
```

The document the message names is `[[[["red"]]]]`, depth 5. The cap admits it.
Three controls isolate the cause: the same annotation over `string` with tail
`[[[["red"]]]]` binds `Ok`; the same enum one level shallower binds `Ok`; and a
variant whose wire string is `""` is not refused at four levels, because
`Object.keys(new String(""))` is `[]`.

The same payload crosses the **child**-side gate. Bug 0187's review round 1
found this divergence and fixed it there, with a module-private walk over the
wire form; its report records the parent-side half as residual 2 and its §Fix
pinned dispositions name it as deliberately unmoved, byte-frozen by §Fix (e)(7).
So the two return gates disagree about one payload's depth, and the shipped
comment that justifies the asymmetry —
`subagent-envelope.ts:434–435`, "four of them are handed already-parsed JSON
where a boxed `String` cannot occur" — is false: three of the five enforcement points
are handed interpreter values.

## Reproduction

Zero model turns. Every fixture parses with `[]` diagnostics (measured for both
the caller and the callee source), so both sit inside GOV-15's loads-cleanly
input set (`source-language-stability.md:9`).

### (a) The seam directly — `enforceInvokeReturnDepth` over the raw theta value

`C` abbreviates `makeEnumValue("Colour","red")`, the value `Colour.Red`
evaluates to.

| row | value at the gate | `JSON.stringify` | `jsonDepth` | `enforceInvokeReturnDepth` |
| --- | --- | --- | --- | --- |
| a1 | `[[[[C]]]]` | `[[[["red"]]]]` | **6** | breach — `message: "JSON document depth exceeds 5"`, `schema_keyword: "maxDepth"`, `path: "/0/0/0/0/0"`, `cause: "return_validation"` |
| a2 CONTROL | `[[[["red"]]]]` | `[[[["red"]]]]` | 5 | `undefined` |
| a3 | `{a:{b:{c:{d:C}}}}` | `{"a":{"b":{"c":{"d":"red"}}}}` | **6** | breach |
| a4 CONTROL | `[[[C]]]` | `[[["red"]]]` | 5 | `undefined` |
| a5 CONTROL | `[[[[makeEnumValue("Colour","")]]]]` | `[[[[""]]]]` | 5 | `undefined` |

a1 and a2 have byte-identical wire documents and opposite verdicts. a3 shows the
over-count is not array-specific. a5 isolates the mechanism: the empty wire
string has no character indices, so `hasChildren` is false and the carrier
counts as the scalar it is.

The over-count is exactly one level, at every position, independent of the wire
string's length:

| array levels above the carrier | `jsonDepth(raw)` | wire-document depth | refused |
| --- | --- | --- | --- |
| 0 | 2 | 1 | no |
| 1 | 3 | 2 | no |
| 2 | 4 | 3 | no |
| 3 | 5 | 4 | no |
| 4 | **6** | **5** | **yes** |
| 5 | 7 | 6 | yes (correctly) |

`makeEnumValue("Colour","crimson")` under four array levels also measures
`jsonDepth` 6 with `Object.keys` of length 7, so the extra level is one
regardless of variant length. `Object.keys(new String("red"))` is `["0","1","2"]`.

### (b) End to end through the real prompt→prompt attach cell

Caller: `mode: prompt`, `enum Colour { Red = "red" }`, tail
`invoke<T>("./kid.theta")`. Callee: `mode: prompt`, the same `enum` declaration,
the tail below. Both parse `[]`.

| row | annotation `T` | callee tail | what the caller binds |
| --- | --- | --- | --- |
| b1 | `array<array<array<array<Colour>>>>` | `[[[[Colour.Red]]]]` | `Err {"kind":"invoke_infra","message":"JSON document depth exceeds 5","callee_path":"./kid.theta","cause":"return_validation"}` |
| b2 CONTROL | `array<array<array<Colour>>>` | `[[[Colour.Red]]]` | `Ok`, `[[["red"]]]` |
| b3 CONTROL | `array<array<array<array<string>>>>` | `[[[["red"]]]]` | `Ok`, `[[[["red"]]]]` |
| b4 CONTROL | `Colour` | `Colour.Red` | `Ok`, `"red"` |

b3 is the discriminator. Its wire document is byte-identical to b1's and its
annotation has the same shape; the only difference is whether the level-5 scalar
is a named-enum variant or a string literal, and that difference decides
`Ok` against `Err`.

### (c) The asymmetry against the child-side gate

Driven over the seams the subagent-mode leg's value traverses (not through a
spawned child):

| step | measured |
| --- | --- |
| `mapTooDeepReturnValue([[[[C]]]], "./kid.theta")` | `undefined` — the child-side gate admits it |
| `serializeOkEnvelope([[[[C]]]])` | `{"theta_result":{"v":1,"ok":[[[["red"]]]]}}\n` |
| `parseEnvelopeLine(...)` | `{"kind":"ok","value":[[[["red"]]]]}` |
| `enforceInvokeReturnDepth("./kid.theta", <that value>)` | `undefined` — the parent's depth gate admits it |
| AJV over the lowered `array<array<array<array<Colour>>>>` | `{"ok":true}` |

The lowered annotation, verbatim:

```json
{"type":"array","items":{"type":"array","items":{"type":"array","items":{"type":"array","items":{"$ref":"#/$defs/Colour"}}}},"$defs":{"Colour":{"type":"string","enum":["red"]}}}
```

The same AJV document over the **raw** carrier payload returns `{"ok":false}`
with `must be string` (`#/$defs/Colour/type`) and `must be equal to one of the
allowed values` (`#/$defs/Colour/enum`) at `/0/0/0/0` — 0174's mechanism, which
is why `projectForValidation` sits at `:3706`. The depth gate at `:3693` reads
the value before that projection exists.

### (d) The sibling ceiling-#4 seams

| seam | value | result |
| --- | --- | --- |
| `enforceInvokeParamsDepth("./kid.theta", [[[[C]]]])` | raw | breach, `cause: "validation"`, `path: "/0/0/0/0/0"` |
| `enforceCodeToolArgDepth("t", [[[[C]]]])` | raw | breach |
| `enforceModelToolArgDepth([[[[C]]]])` | raw | breach |

Read from source rather than driven: the `invoke(...)` `params` gate is handed
`argValues: readonly ThetaValue[]` built by `evaluatePureExpression`
(`production-theta-producer.ts:3293`, `:3330`, walked per-arg at `:3439`), and
the code-driven tool-args gate is handed `lowerToolCallParams`'s
`evaluatePureExpression` output (`:3016`, `:3979`, walked at `:3032`). Both can
therefore hold a carrier. `enforceModelToolArgDepth` reads a JSON-decoded model
payload and the typed-query-response gate reads a JSON-parsed response, so
neither can. This report's subject is the `invoke<T>` return gate; §Fix (c)(4)
carries the site-scope question.

## Expected behaviour

- **The cap is a property of the JSON document, and the refusal message must be
  true of the value it names.** `schema-subset.md:13` fixes the cap over "the
  JSON document depth"; `:22` restates it as "a property of the **runtime JSON
  value**"; the counting algorithm at `:24–30` ranges over scalars, empty
  containers, and non-empty objects and arrays. `[[[[Colour.Red]]]]`'s JSON
  document is `[[[["red"]]]]`, depth 5. `depth ≤ 5` (`:30`) admits it, so
  `invoke<array<array<array<array<Colour>>>>>` of that callee binds `Ok`
  carrying the tagged variant.
- **The host representation is not the measured object.**
  `runtime-value-model.md:13` states the enum tag "MUST NOT appear in JSON
  output (`JSON.stringify` of an enum value yields the bare wire string)", and
  `:16` fixes the boxed carrier as a non-normative implementation detail that
  "neither is reachable from theta code, neither appears in any wire schema".
  A ceiling defined over the JSON document does not read it.
- **Two return gates measuring the same cap agree about the same payload.**
  0187 shipped the wire-form measurement at the child-side envelope writer. A
  payload the child writes without complaint and whose depth the parent's own
  post-parse walk admits is not one the parent refuses on the in-process leg.
  `invocation.md:36` fixes the return surface as mode-invariant: "A
  `prompt`-mode child attaches to the caller's current conversation, but the
  final value still propagates through the same return surface."
- **The one payload class that must still refuse, still refuses.** A wire
  document at depth 6 or deeper — with or without an enum variant in it —
  refuses with the canonical message, at the same site, before AJV (CIO-3,
  `ceilings-3-and-4.md:41`), routing to `Err(InvokeInfraError { cause:
  "return_validation" })` per the table's `invoke<T>` return row (`:27`).

## Actual behaviour / root cause

### 1. The walk's domain and the gate's input disagree

`depth-walk.ts:1` names the module "the theta-owned JSON-document depth walk"
and `:19` names its input "a *materialised* JSON value". `hasChildren`
(`:120`) implements the counting algorithm's container test as: not `null`, of
`typeof` `"object"`, and — for a non-array — `Object.keys(...).length > 0`. For
JSON parsed by `JSON.parse` that test is exact, because `JSON.parse` produces
only `null`, primitives, plain objects and arrays.

`#validateInvokeReturn` does not hand it parsed JSON on the prompt→prompt attach
cell. `:3693` passes `result.value` — what `surfaceCalleeFinalValue` produced
from the callee's in-process body execution. A named-enum variant there is
`new String("red")` (`value.ts:135`), which is `typeof "object"`, not `null`,
not an array, and has `Object.keys` `["0","1","2"]`. `hasChildren` answers true,
`firstTooDeep` (`:164`) descends into the character indices, and the level-5
carrier's own children sit at level 6.

The pointer the breach carries records this exactly: `path: "/0/0/0/0/0"` — five
segments for a value whose document has four array levels. The fifth segment
indexes a character.

### 2. The projection that would have collapsed it runs after the gate

Bug 0174 §Fix (b) split this method: AJV reads
`projectForValidation(result.value)` (`:3706`) and everything else reads the
callee's own value. `projectForValidation` (`wire-translation.ts:637`) collapses
a boxed `String` to `value.valueOf()` in its first arm (`:638–642`). Measured:
`projectForValidation([[[[Colour.Red]]]])` is `[[[["red"]]]]`, `jsonDepth` 5.

The depth sub-check is 13 lines above it, on the original-value side of the
split. 0174 had no reason to move it — its own payloads were at document depth
≤ 2, so the depth gate was a no-op for every cell it drove — and 0187 was
forbidden to move it by its own §Fix (e)(7) byte-freeze on that split.

### 3. The two gates disagree, so the callee's mode selects the outcome

Post-0187 the child-side writer measures the wire form
(`wireFormExceedsDepthCap`, `subagent-envelope.ts:475`, whose
`value instanceof String` arm returns `false` without descending) and admits
`[[[[Colour.Red]]]]`. The parent then parses `[[[["red"]]]]` and its own depth
gate admits that too (§Reproduction (c)). So a `mode: subagent` callee returning
this payload reaches AJV and validates; a `mode: prompt` callee returning the
byte-identical payload is refused before AJV runs.

`invocation.md:36` gives the callee's mode no such authority, and
`#validateInvokeReturn`'s own doc-comment claims the reconciliation is already
done: "the method projects the value to its wire form for the AJV call, so the
boxed-`String` representation difference between the two cells is normalised at
the gate: a callee's `mode:` frontmatter cannot change whether a named-enum
return validates, or what the caller binds for one" (`:3654–3659`). True of the
`validate` call; false of the method.

### 4. The shipped reason for keeping `depth-walk.ts` carrier-free rests on a miscount

`subagent-envelope.ts:432–435` argues the carrier arm belongs in the envelope
writer "because that module answers for all five of ceiling #4's AJV enforcement
points, and four of them are handed already-parsed JSON where a boxed `String`
cannot occur". Three are handed interpreter values (§Reproduction (d), and the
call-site reads beside it). The conclusion the sentence supports — that
`depth-walk.ts` is the wrong home for a carrier arm — may survive on other
grounds, since a change there moves the two parsed-JSON sites' verdicts not at
all (no carrier is reachable at either) and all three theta-value sites'
verdicts identically. The stated ground does not hold.

### 5. Nothing witnesses it

No committed test drives `enforceInvokeReturnDepth`, `enforceInvokeParamsDepth`
or `enforceCodeToolArgDepth` with a carrier-bearing payload. Every vehicle in
`tests/invoke-ceiling-depth.test.ts` (`:36`, `:39`) and in 0180's
`CONTROL (FENCE-DEPTH)` (`:842`, `:865`) is a plain nested object. 0174's two
witnesses carry enum values but at document depth ≤ 2, where the depth gate is
a no-op. The uncovered cell is the intersection: a carrier at level 5.

## Why it matters

- **A conformant program is refused, and told something false about itself.**
  The author writes an `enum` and a four-deep `array<…>` return type — both
  inside the subset (`schema-subset.md:5–14`) — and the runtime answers "JSON
  document depth exceeds 5" about a JSON document of depth 5. The message names
  the one property of the value that is not the reason. An author checking the
  claim against `:24–30`'s counting algorithm computes 5 and finds the runtime
  contradicting the spec, with no third signal: the breach mints no diagnostic
  code (read from source — `enforceInvokeDepth`, `invoke-ceiling-depth.ts:121–141`,
  emits nothing) and `#validateInvokeReturn` discards `depthBreach.issue`, so
  the RFC-6901 pointer that would show the fifth segment indexing a character
  never reaches the caller.
- **The failure is opaque in the direction that matters.** The workaround is to
  remove one level of nesting or to stop returning an enum, and nothing in the
  refusal points at either. The variant length is irrelevant (measured), which
  removes the obvious first hypothesis; only the empty-string variant behaves
  differently, and no author will find that by bisection.
- **The two gates disagree about one payload, and the disagreement is new.**
  Before 0.116.0 the child side ran no depth check at all on the untyped
  boundary and shared `MAX_JSON_DEPTH` nowhere else; 0187 gave it a wire-form
  walk. That fix is correct and this report does not touch it — but it makes
  the parent gate the only place in the runtime that answers ceiling #4's
  question about a representation rather than a document, and it re-opens the
  mode-variance class 0174 closed at this exact method.
- **The class is reachable from clean source and unreached by the corpus.** Both
  fixture sources parse with `[]` diagnostics; none of the 34 committed `.theta`
  / `.thetalib` files declares an `enum`, writes `invoke<`, or nests an array
  literal. So no shipped fixture reds today, and no shipped fixture pins the
  behaviour either — the same shape 0187 carried, one gate over.

## Fix

**Not settled.** Constraint-pinned: the metric is decided, the placement and the
site scope are not.

### (a) The metric, which is not in question

The verdict is a function of the payload's **wire form**, computed by the
counting algorithm at `schema-subset.md:24–30`. This is not a new position: it
is the one 0187's review round 1 established and 0.116.0 shipped at the child
side, with the reasoning recorded at `subagent-envelope.ts:414–435`. A route
here applies that same measurement at the parent gate. Nothing about the cap's
value, the canonical message, the `schema_keyword`, the `cause`, or the
destination surface moves.

### (b) Placement — four candidates, each with a different cost

1. **Export `wireFormExceedsDepthCap` from `src/runtime/subagent-envelope.ts`
   and call it from `enforceInvokeDepth`.** One measurement, one implementation,
   the reviewed carrier arms already landed. Costs: it makes the runtime's
   depth-ceiling module import the subagent envelope module, which owns a
   PIC-59 wire format and a diagnostic code and is 0187's and 0180's surface;
   and the shipped walk returns `boolean`, discarding the RFC-6901 pointer that
   `InvokeDepthBreach.issue.path` is typed to carry
   (`invoke-ceiling-depth.ts:64–68`). No committed cell asserts that pointer at
   either invoke gate (checked: `tests/invoke-ceiling-depth.test.ts` asserts
   `schema_keyword` and `message` only, `:73–74`, `:130–131`), but the field is
   non-optional, so a route taking this states what it carries.
2. **Move the wire-form walk into `src/runtime/depth-walk.ts` as a second
   exported entry point**, leaving `depthWalk` itself byte-identical, and route
   the theta-value sites to it. Costs: it re-opens a disposition 0187 pinned by
   name ("`src/runtime/depth-walk.ts` keeps no carrier arm, so ceiling #4's five
   AJV enforcement points are unmoved", `0187:1335–1336`) and it puts two walks
   answering one question in one module, so the pair needs a stated rule for
   which sites take which. It also gives the pointer back, since `firstTooDeep`
   already builds one.
3. **Re-derive a third bounded walk inside
   `src/runtime/invoke-ceiling-depth.ts`.** Costs: three copies of one counting
   algorithm across three modules, with no shared test.
4. **Project before walking** — call `projectForValidation(result.value)` once
   in `#validateInvokeReturn` and use it for both the depth gate and the AJV
   call. Fewest lines. Costs, all measurable: (i) `projectForValidation`
   (`wire-translation.ts:637`) is an unbounded recursive descent, so running it
   ahead of the depth gate spends the fast-fail that `schema-subset.md:47`
   states the walk exists to be ("a cheap fast-fail … avoids feeding
   pathologically deep payloads into the validator") on an author-controlled
   nesting depth — the same prohibition 0180 and 0187 enforced at the envelope
   writer (`subagent-envelope.ts:344`, `:437`); (ii) `projectForValidation` does
   not descend a `Result` (`wire-translation.ts:654–661`), so a
   `Result`-nested payload's projection
   under-counts exactly as the child-side walk does, which lands on the
   `Result`-carriage bound 0187 pinned and its follow-up owns; (iii) it changes
   what the depth gate reads within 0174's projection/original split, which
   0187 §Fix (e)(7) froze and which a route must re-derive under its own
   authority; (iv) it applies only to the return gate, leaving
   `enforceInvokeParamsDepth` and `enforceCodeToolArgDepth` divergent.

### (c) Constraints every route carries

1. **Ceiling #4's five-site enumeration does not move.** No enforcement point is
   added, removed, or re-ordered; `ceilings-3-and-4.md:19` still names five,
   the per-boundary table's rows are unchanged, and CIO-3 (`:41`) still puts the
   depth walk first at every AJV boundary. The site is the same; the metric it
   applies is corrected. The *Five-site list co-edit obligation*
   (`docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md:47`) is
   therefore not triggered, and a route states that it checked.
2. **0180's `CONTROL (FENCE-DEPTH)` stays as it is.**
   `tests/subagent-envelope-nonfinite-ok-refusal.test.ts:824` asserts
   `MAX_JSON_DEPTH === 5`, that a level-7 `Infinity` is not the child-side
   search's to find, that `enforceInvokeReturnDepth` refuses that payload anyway
   (`:855`), and that a level-4 non-finite value is within the cap (`:865`).
   Both vehicles are plain nested objects (`:842`, `:865`), so all four
   assertions are metric-invariant. Checked; a route re-runs the file (27 cells)
   and does not re-pin it.
3. **`tests/invoke-ceiling-depth.test.ts`'s `DEPTH_6_VALUE` cells are not
   re-derived.** Checked: `DEPTH_5_VALUE` (`:36`) and `DEPTH_6_VALUE` (`:39`)
   are `{a:{b:{c:{d:1}}}}` and `{a:{b:{c:{d:{e:1}}}}}` — carrier-free, so `:105`,
   `:110`, `:146` and `:151` keep their verdicts under every candidate above. A
   route adds cells for the carrier class rather than editing these.
4. **The site scope is decided on the record.** Candidates 1–3 can be applied at
   one gate, at both `invoke` gates through the shared `enforceInvokeDepth`
   (`invoke-ceiling-depth.ts:121`), or at all three theta-value sites. Each
   choice flips a different input set (§(d)) and leaves a different residual
   divergence. A route states which sites it moves, which it leaves, and why —
   and if it leaves any, records the remaining divergence as this report's
   residual in the form 0187 used.
5. **0174's split is re-derived, not assumed.** `#validateInvokeReturn`'s
   validated-projection / bound-original split and its post-AJV inbound
   translation ordering stay intact; a route editing that method re-runs
   `tests/invoke-return-enum-carrier-projection.test.ts` and
   `tests/invoke-prompt-cell-enum-return.test.ts` green.
6. **Witness — unit tier, offline, provider-free.** The observable is reachable
   in process by construction (the defect is precisely that no serialisation
   intervenes), so the witness drives the real prompt→prompt attach cell with
   the §Reproduction (b) harness plus the seam rows of (a). Reds: b1 and a1.
   Green-now-green-after fences: b2, b3, b4, a2, a4, a5, and the depth-6 row of
   the arity table. Each new assertion is proved in both directions once.

### (d) GOV-15 — the removal direction

Every route makes at least one input that loads cleanly and **fails** today
newly **succeed**. That is observable (a) drift under GOV-15
(`source-language-stability.md:5`), on inputs inside the loads-cleanly input set
(`:9` — both fixture sources measured `[]`).

Whether the carve-out reaches it is unsettled. The *Ceiling-set carve-out* (`:13`)
is "keyed to ceiling-set changes only", and the *Operational definitions*
(`:21`) close the Relax/Tighten sub-case enumeration at three: numeric bound,
enforcement-point surface, routing class. A route here moves none of the three —
`MAX_JSON_DEPTH` stays 5, the five enforcement points stay five, and the
`invoke<T>` return row still routes to
`Err(InvokeInfraError { cause: "return_validation" })`. Whether correcting the
*metric* a ceiling applies is a ceiling-set change at all is the question the
route decides on the record; 0187's adjudication does not carry over, because
its route flipped inputs in the *refusal* direction and had a live carve-out
tension to resolve.

The route enumerates every spelling that flips and in which direction.
Enumerated from HEAD, for the maximal (all three theta-value sites) scope:

| spelling | today | after |
| --- | --- | --- |
| typed `invoke<T>` return, prompt→prompt attach cell, enum variant at document level 5 | `Err(InvokeInfraError{cause:"return_validation"})` | `Ok` |
| typed `invoke<T>` return, subagent spawn cell, same payload | `Ok` | `Ok` (unchanged — the value arrives parsed) |
| typed `invoke<T>` return, either cell, wire document deeper than 5 | `Err` | `Err` (unchanged) |
| `invoke(...)` `params` argument holding an enum variant at document level 5 | `Err(InvokeInfraError{cause:"validation"})` | `Ok`-path (only if the route moves that gate) |
| code-driven `<name>(args)` whose args object holds an enum variant at document level 5 | `Err(CodeToolError{cause:"validation"})` | dispatches (only if the route moves that gate) |
| model-driven tool args, typed-query response | unchanged | unchanged (parsed JSON; no carrier reachable) |

Observables (b) and (c) are unaffected as far as measured: the depth breach
emits no diagnostic and mints no registered code, so no code sequence changes,
and no `theta-system-note` template names this refusal. A route confirms both by
inspection rather than assuming them.

### (e) Same-commit corrections every route carries

1. **`#validateInvokeReturn`'s doc-comment**
   (`production-theta-producer.ts:3654–3659`) asserts the mode difference is
   "normalised at the gate" and that "a callee's `mode:` frontmatter cannot
   change whether a named-enum return validates, or what the caller binds for
   one". Measured false at HEAD (§Reproduction (b) row b1 against (c)). Under
   every route it becomes true and is restated to name the depth sub-check as
   well as the AJV call; a route that moves only some sites states which.
2. **`src/runtime/subagent-envelope.ts:434–435`** — "four of them are handed
   already-parsed JSON where a boxed `String` cannot occur" — is false: three of
   the five are handed interpreter values (§Reproduction (d)). The sentence is
   corrected to the measured count whichever route lands, and the conclusion it
   supports is restated on a ground that holds.
3. **The module header of `src/runtime/invoke-ceiling-depth.ts`** (`:26–31`)
   describes both functions as running the walk "over the materialised value".
   A route states which materialisation — the interpreter's or the document's —
   at each of the two gates it owns.
4. **`src/runtime/depth-walk.ts`'s header** (`:19`, "a *materialised* JSON
   value") is accurate for the parsed-JSON sites and is left alone unless the
   route places a second walk in that module, in which case it states the
   division.

### (f) Ordering

Nothing blocks this report and it blocks nothing.
[0187](./0187-untyped-subagent-return-boundary-no-depth-ceiling.md) is **fixed
(0.116.0)** and owns every byte of `src/runtime/subagent-envelope.ts` a route
would read or export from; a route rebases onto its hunks and re-runs
`tests/subagent-return-depth-refusal.test.ts` and
`tests/subagent-envelope-nonfinite-ok-refusal.test.ts`.
[0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) is **fixed
(0.98.0)** and owns the method and the projection split; a route re-runs its two
witnesses.
[0201](./0201-result-carried-payloads-skip-envelope-walks.md) — the
`Result`-carriage follow-up filed from 0187's report residual 1 in the same pass
as this report — touches
`wireFormExceedsDepthCap`'s `isResultValue` arm, which candidate (b)(1) would
share; whichever lands second rebases onto the other's hunks in that function.

## Non-goals

- **The child-side walks.** `wireFormExceedsDepthCap` and
  `mapTooDeepReturnValue` (`subagent-envelope.ts:475`, `:559`) are 0187's
  settled mechanism and are not reopened. This report reads them; it does not
  move their verdicts. A route that exports the walk changes its visibility,
  not its behaviour, and re-runs 0187's witnesses to prove it.
- **The cap's value.** `MAX_JSON_DEPTH` stays 5
  (`depth-walk.ts:40`, `schema-subset.md:30`). This report is about what the
  number is applied to, not what it is.
- **The `Result`-carriage bound.** Neither the child-side walk nor
  `projectForValidation` descends a `Result` (`subagent-envelope.ts:490`,
  `wire-translation.ts:654–661`), so a payload nesting one under-counts at both.
  That is the bound PIC-59 now states normatively, pinned by
  `tests/subagent-return-depth-refusal.test.ts:657`'s `CONTROL
  (FENCE-NESTED-RESULT)`, and it is the subject of
  [0201](./0201-result-carried-payloads-skip-envelope-walks.md), filed from
  0187's report residual 1 in the same pass as this report. A route here
  inherits whatever disposition that bound has when it lands and does not
  widen it. Measured for the record:
  `jsonDepth(Ok([[[[1]]]]))` is 6 against a wire document
  `{"ok":true,"value":[[[[1]]]]}` of depth 6 — `depthWalk` descends a `Result`'s
  own enumerable `ok` / `value` keys and agrees with `JSON.stringify` there, so
  the parent gate's `Result` behaviour is not part of this report's divergence.
- **Widening `inferCalleeReturnAnnotation`.** Untouched; 0172's residual 1 owns
  that question. The boundary this report is about already has a return type —
  the caller wrote it.
- **The enum carrier itself.** Changing `makeEnumValue`'s representation
  (`value.ts:135`) would close this and 0174's class together at a far wider
  blast radius; `runtime-value-model.md:16` fixes it as a non-normative
  implementation detail, and 0174 §Non-goals already refused that route.

## Provenance

Filed from the bug 0187 fix run (0.116.0, commit `940206cb`), which recorded
this defect three times and changed none of it:

- **That run's report** (`.pi/tmp/fixes/0187-report.md` §*Residuals / notes*
  item 2), verbatim: "**The same wire-form/carrier divergence exists at the
  PARENT-side typed boundary.** `enforceInvokeReturnDepth` at
  `#validateInvokeReturn` walks the raw theta value with the shipped
  `depthWalk`, which has no carrier arm — so a typed `invoke<T>` return whose
  payload carries an enum carrier at level 5 is refused parent-side with a
  message false of it, at HEAD and still. Out of scope by §Fix (e)(7) (that gate
  is byte-frozen); recorded, not changed. Its reachability is the same
  clean-source shape as the child-side case round 1 fixed."
- **That run's review round 1**, recorded in the bug document's
  `## Fix (0.116.0)` under *A second in-run discovery: the wire form, not the
  carrier* (`0187:1028–1040`): "`Object.keys(new String("red"))` is
  `["0","1","2"]`, so `depthWalk` counts an enum carrier's character indices as
  children, and clean source `enum Colour { Red = "red" }` + tail
  `[[[[Colour.Red]]]]` — wire form `[[[["red"]]]]`, document depth **5** — was
  newly refused with a message false of it, prescribed by no requirement."
  That paragraph describes what the child side *would have done* had it shared
  `depthWalk`. The parent side does share it.
- **The shipped code comment** (`subagent-envelope.ts:429–432`), which states
  the same payload and the same verdict as the reason the child-side walk is
  module-private.

**Re-measured at HEAD `940206cb` for this filing, not copied.** The residual
gives the mechanism and one payload; it does not establish the following, each
measured here:

- **The end-to-end observable.** The residual names the seam. §Reproduction (b)
  drives the real prompt→prompt attach cell and records what a *caller* binds:
  `Err(InvokeInfraError{ cause: "return_validation" })` for b1, `Ok` for b2, b3
  and b4.
- **The threshold, bracketed from both sides.** The arity table measures the
  carrier under 0–5 array levels: the false refusal begins at four levels (wire
  depth 5) and the level above it is refused correctly. So the behaviour is not
  "enum payloads are different" but "one wire-document depth is misjudged".
- **The mechanism is the box, not the tag, and not the length.**
  `brandSchemaValue` adds no level (`Object.keys` `["x"]`); a seven-character
  variant adds the same one level as a three-character one; the empty-string
  variant adds none. The over-count is `hasChildren` reading character indices.
- **The two gates' disagreement, measured over the seams.** §Reproduction (c)
  runs the same payload through `mapTooDeepReturnValue`, `serializeOkEnvelope`,
  `parseEnvelopeLine`, `enforceInvokeReturnDepth` and the real AJV validator
  over the lowered annotation. The child admits, the parent's post-parse walk
  admits, AJV answers `{"ok":true}`, and only the in-process leg refuses.
- **The `:434–435` miscount.** The residual does not observe that the comment
  justifying the asymmetry states a false count. §Reproduction (d) measures
  three of five enforcement points refusing a carrier payload and reads their
  call sites.
- **The corpus census.** 34 committed `.theta` / `.thetalib` files, 0 with an
  `enum`, 0 with `invoke<`, 0 with a nested array literal.

**Measured independently for this filing** by three scratch vitest probes
(written, run, deleted; `git status --porcelain` empty and a case-insensitive
`scratch` sweep over the tree reporting nothing afterwards). Zero model turns and
no provider contacted — every fixture body is a pure tail expression. Total wall
time under 4 s across the three runs. The harness shape mirrors
`tests/invoke-return-enum-carrier-projection.test.ts` (0174's shipped witness):
`parseThetaDocument` → `createProductionProducerDeps({ parseCallee })` →
`bindPromptConversation` → `executeBody`, with a real `AjvSchemaValidator`
(`src/seams/schema-validator.ts:104`) on the runtime root.

**Read from source rather than driven, and marked as such in the text.** Three
positions: the reachability of a carrier at the `invoke(...)` `params` gate and
at the code-driven tool-args gate (the seams were driven; their call sites'
inputs were read at `production-theta-producer.ts:3293`, `:3330`, `:3016`,
`:3979`); the absence of any diagnostic emission on a depth breach
(`invoke-ceiling-depth.ts:121–141`); and the subagent spawn cell's end-to-end
outcome, which was measured across the seams its value traverses
(§Reproduction (c)) rather than through a spawned child.

Every `src/`, `tests/`, spec and reference citation above was read at HEAD
`940206cb` with `git show HEAD:<path>`; volatile positions in
`src/extension/production-theta-producer.ts` and
`src/runtime/subagent-envelope.ts` are named by symbol beside their line numbers,
per [0134](./0134-params-shift-induced-stale-citations.md)'s adjudication.
