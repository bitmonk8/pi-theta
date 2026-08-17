# Bug 0120 — The inbound (model → theta) rebuild disagrees with the outbound direction bug 0080 settled: `rebuildInbound` builds its record by walking `Object.entries` of the AJV-validated payload, so a named-schema value's `keys()` is **model**-ordered where `docs/spec_topics/expressions.md:118` fixes it to declaration order unqualified as to how the value was produced, and it installs no `brandSchemaValue` brand, so the QRY-18 outbound rename map resolves no declaring schema for that value — the directed check bug 0080's §Non-goals owed, whose answer was NO, and not a local fix because `SchemaSidecar` carries only *renamed* fields and therefore carries no field order at all

- **Status:** fixed (0.97.0) — discharged by the bug 0067 fix (0.90.0, brand
  half) and the bug 0172 fix (0.97.0, order half); closed by parent-gate
  adjudication, recorded in `## Closure (0.97.0)` at the end of this file.
  [Superseded original:] §Fix is not settled: this report exists to pin the route and
  the sidecar's shape before any code lands. Ordering dependency — coupled in
  **both** directions to [0067](./0067-subagent-envelope-drops-enum-tag.md)
  (open), which owns the fact this report's reachability turns on: at HEAD
  `translateInbound` has no caller in `src/` and neither does `buildSidecar`, so
  the whole per-schema-sidecar mechanism — producer and both consumers — is
  unwired in production. 0067's fix is what makes this defect production-visible;
  landing 0067 without this one imports a model-ordered, unbranded value into
  production, so either this fix lands first or 0067's fix lands both halves.
- **Sev/Diff estimate:** S3/D3 — S3 because no production input reaches the
  defect at HEAD (`rg -n "translateInbound|buildSidecar" src/` finds one
  declaration each and zero call sites; the typed-query loop binds the raw
  AJV-validated payload at `src/runtime/query-tool-loop.ts:721–728`), so the
  wrong order and the missing brand are a specified seam that cannot conform
  rather than a corrupted production value; it becomes S1 unchanged the moment
  bug 0067's fix routes an inbound boundary through this seam, which is why the
  two are ordered. D3 because the route is adjudicated in-run, one route edits
  `docs/spec_topics/schema-subset.md:87`'s "sidecar with two maps" plus its
  `docs/reference/` mirror, and every route coordinates with bug 0080's single
  construction point and its 16-cell witness.
- **Kind:** defect against `docs/spec_topics/expressions.md:118` for the order
  half, and an internal-consistency defect with no governing spec sentence for
  the brand half. `:118` fixes `keys()` to "schema declaration order for named
  schemas" and qualifies that clause **only** by whether the schema is named —
  not by how the value was produced — so a named-schema value the runtime
  rebuilt from a model payload is inside it. No spec sentence anywhere requires
  an inbound-rebuilt value to carry a declaring-schema brand: the brand is not a
  spec concept at all (§Expected behaviour, *The brand half*), which is itself
  part of this report. The brand's consequence is nevertheless spec-anchored
  through the mechanism the implementation chose — `translateInterpolationOutbound`
  resolves its theta→wire rename map from the brand, and
  `docs/spec_topics/query/query-escapes-stringification.md:33` states "the
  theta-side names an author writes never appear in the rendered prompt".
- **Related:**
  - [0080](./0080-keys-values-construction-order-not-declaration-order.md) —
    **fixed (0.70.0)**, the parent, and the report that directed this check in
    terms. Its §Non-goals: "Not about the inbound (model → theta) rebuild path,
    which was not probed offline here; a fix should check whether that path
    already reconstructs in schema order, since the two paths must agree." That
    check was performed as part of the 0.70.0 fix and **answered NO**; the fix
    record states the answer and the reason for not widening ("Fixing it is a
    **separate surface**, deliberately not widened into") and carries it as
    residual (ii). **This report is therefore a stated obligation of that fix,
    not an incidental finding.** 0080 made the outbound direction conform at one
    construction point, `buildObjectSchemaValue` (`src/runtime/value.ts:385`),
    which reorders into declaration order and brands; this report is the other
    direction of the same clause.
  - [0067](./0067-subagent-envelope-drops-enum-tag.md) — **open**, the binding
    ordering constraint and the reachability owner. Its §Kind records that
    `translateInbound` (`src/runtime/wire-translation.ts:118`) "has **no caller
    anywhere in `src/`**", and its *Why it matters* closes with the wider blast
    radius: the inbound rule is therefore unperformed at "typed query results,
    typed tool-call return decoding, and binder `args`" as well. Its §Options (1)
    would apply the pass at `#validateInvokeReturn`, and its closing paragraph
    asks "whether `translateInbound` gains a single enforced entry point that
    every inbound boundary is required to route through" — the entry point this
    report's defect sits behind. Its *Second consequence on the same root cause*
    already names the schema brand's loss across the subagent envelope; here the
    brand is absent at the seam that is supposed to restore it.
  - [0119](./0119-proto-named-field-silently-dropped.md) and
    [0121](./0121-integer-like-wire-rename-escapes-order-guarantee.md) — both
    **open**, the other two residuals of the same parent fix, both filed in this
    batch. 0119 is bug 0080's residual (i) (a declared field named `__proto__`
    dropped at construction); 0121 is its residual (iii) (an integer-like `as`
    rename fronting a field in the QRY-18 wire record). All three are disjoint
    input classes on one clause: 0119 is about which keys a *constructed* record
    has, 0121 about the key order of the *wire* record `JSON.stringify` emits,
    and this report about the key order and provenance of a record rebuilt
    *inbound*. No fix here touches either site — the inbound path's keys come
    from a validated payload, so a payload key spelled `__proto__` is a
    `JSON.parse` question rather than an `obj[field.name] =` one (§Non-goals),
    and the wire re-key 0121 owns is the outbound direction.
  - [0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md) — **fixed
    (0.33.0)**, and the source of the provenance-twin discipline any fix must
    keep. Its witness pins that a ctor-provenance value and a wire-provenance
    value of one schema compare `==` in both argument orders
    (`tests/schema-brand-symbol-migration.test.ts:570–582`), and its harness
    comment cites `rebuildInbound` (`wire-translation.ts:129`) by name as the
    reason the wire twin is an unbranded plain object. Measured below:
    `valuesEqual` answers `true` across the disagreement in both argument orders,
    so equality neither witnesses this defect nor breaks under a fix.
  - [0020](./0020-enum-schema-tags-presence-only-forgeable.md) — **fixed
    (0.32.0)**, the constraint on how a fix may brand. It made all three tags
    read through one descriptor-checking helper (`privateBrandOf`,
    `src/runtime/value.ts:186`), and its cells (a3) / (a4)
    (`tests/enum-schema-tag-privacy.test.ts:427`, `:435`) pin that a payload or
    literal naming `__thetaSchema` as a string key recovers **no** tag. A fix
    that installs the brand at the rebuild must do it through
    `brandSchemaValue` (`value.ts:277`), never by reading a name out of the
    validated JSON.
  - [0033](./0033-body-level-schema-alias-unsupported.md) — **fixed
    (0.45.0)**, the three-way `SchemaDecl` shape. `fields` is absent for the
    alias / `by … = …` / head-only forms (`src/parser/theta-document.ts:564`),
    which is why `buildObjectSchemaValue` has a brand-as-is arm (`value.ts:398`);
    any declaration-resolving route here inherits the same three-way case split.
  - [0025](./0025-ctor-unresolved-schema-name-passthrough.md) — **fixed
    (0.37.0)**, the unresolved-name passthrough that is now an arm of the single
    construction point (`value.ts:394–396`). A rebuild route that resolves a
    declaration needs the same answer for a `$defs` name that resolves to no
    declared schema — `__inline_<slug>` entries are exactly that case
    (`src/parser/schema-lowering.ts:18–21`).
- **Affected** (every citation verified at HEAD `bb5206a6`, 0.70.0; symbols named
  with their current lines):
  - `rebuildInbound` (`src/runtime/wire-translation.ts:129–175`) — **the defect
    site.** It reads the sidecar into two lookup maps (`:144–156`), allocates a
    fresh record (`:158`), and then walks **the payload**: `for (const [wireKey,
    fieldValue] of Object.entries(value))` (`:159`), assigning
    `result[thetaKey]` per iteration (`:167`, `:171`). The insertion order of the
    result is therefore the model's JSON key order. `:174` returns that record
    unbranded — the file's only import from `./value` is `{ makeEnumValue, type
    ThetaValue }` (`:48`), so `brandSchemaValue` is not in scope in this module
    at all.
  - `translateInbound` (`:118–120`) — the exported entry point, one line
    delegating to `rebuildInbound` with `input.sidecars.get(input.rootDef)`.
    **Zero callers in `src/`.** `InboundTranslationInput` (`:88–95`) carries
    `validated` (`:90`), `sidecars` (`:92`) and `rootDef` (`:94`) — so the root
    `$defs` name is already in hand at the seam, which is what makes the brand's
    absence at the root a decision rather than a missing input.
  - `:134–139` — the array arm: elements recurse with `undefined` as their
    sidecar, so no rename and no enum re-tag is applied inside an array at any
    depth. `:171` — the nested-object arm resolves a nested sidecar by
    `sidecars.get(wireKey)`, i.e. by field-name↔`$defs`-name match.
  - `src/runtime/wire-translation.ts:33–45` — the module header's **nested
    `$ref` resolution (divergence)** note, the related sidecar-expressiveness
    gap: "The `V5f` `SchemaSidecar` carries a wire-name map and a
    named-enum-position map but *no per-field `$ref` target*. … The only signal
    available to recurse into a nested schema is therefore name matching … This
    is faithful for the fixtures … but cannot be faithful in general (a field
    `manager: Person` references `$defs` `Person`, not `$defs` `manager`); a
    fully faithful boundary needs the `V5f` lowering pass to emit a per-field
    ref-target into the sidecar, which is out of this leaf's scope." The note
    lives in **this** module's header, not in `schema-lowering.ts`'s.
  - `:6–22` — the same header's statement of the contract this report measures
    against, including "Theta code never sees wire names" (`:19–20`).
  - `buildSidecar` (`src/parser/schema-lowering.ts:243–261`) — the sidecar
    producer, and the reason a fix is not local. Its wire-name arm is
    `if (field.wireName !== undefined && field.wireName !== field.thetaName)`
    (`:249`), i.e. **one entry per renamed field**; a schema with no renames
    yields `wireNames: []`. **Zero callers in `src/`.**
  - `SchemaSidecar` (`:233–236`) — exactly two arrays, `wireNames` and
    `namedEnumPositions`. Neither enumerates every field: the first covers the
    renamed subset, the second the named-`enum` subset. No total field order is
    recoverable from the pair for any schema that is not *entirely* renamed.
    `WireNameEntry` (`:221–224`) is `{ theta, wire }` — no position, no index.
    `SidecarFieldInput` (`:211–218`) does receive the fields as an ordered array
    and `buildSidecar` preserves that input order in `wireNames`; there is no
    production caller to pin what order it is handed.
  - `buildObjectSchemaValue` (`src/runtime/value.ts:385–412`) — the outbound
    half after bug 0080, and the shape any inbound route is measured against: it
    resolves the declaring schema, emits every declared name **present** in the
    constructed record in declared order (`:400–405`), appends any remaining
    constructed key in its existing relative order (`:406–410`), and brands
    (`:411`). Every read is own-key-guarded (`:402`, `:407`). Its two callers are
    `src/runtime/statement-executor.ts:674` and
    `src/extension/production-theta-producer.ts:5823` — the single construction
    point 0080's fix record requires to stay single. `:394–396` is bug 0025's
    unresolved-name passthrough arm; `:397–399` is bug 0033's `fields`-absent
    arm.
  - `SchemaFieldOrder` (`value.ts:305–319`) — the structural view
    `buildObjectSchemaValue` resolves a declaration through, declared this way
    so the leaf module needs no import of `SchemaDecl`. The precedent a
    declaration-resolving route here would follow, and `wire-translation.ts`
    already imports from `./value` (`:48`), so reusing it adds no module edge.
  - `brandSchemaValue` (`value.ts:277–290`) and `SCHEMA_TAG` (`:263`) — the
    non-enumerable symbol install, and `schemaTagOf` (`:300–303`) its only
    reader. The docstring at `:241–262` states the posture a fix must preserve:
    invisible to `JSON.stringify`, `Object.keys`, and `valuesEqual`.
  - `schemaTagOf`'s two consumers, i.e. the whole observable blast radius of the
    missing brand: `translateInterpolationOutbound`
    (`src/extension/production-theta-producer.ts:5696–5736`), which reads the
    brand at `:5718` and resolves the declaration as
    `brand ?? (hintName … )` (`:5719–5721`), builds the theta→wire map from
    `field.wireName ?? field.name` (`:5723–5728`) and falls back to
    `wireKey = thetaKey` when nothing resolved (`:5732–5733`); and
    `summariseNonResultOperand` (`src/runtime/runtime-panics.ts:440–462`), whose
    `schemaTagOf` read at `:453` selects between `a '<Schema>' schema object` and
    `an object with keys …` in `QuestionOperandDefectError`'s message (`:420–427`).
    **Not** affected, established statically: `match` — `src/runtime/match-result.ts`
    imports `{ type ThetaValue, isResultValue, valuesEqual }` and nothing else
    from `./value` (`:25`), so neither `evaluateMatch` (`:144`) nor
    `matchPattern`'s `object` arm (`:202`) can read the brand; and the four
    runtime read entry points, which gate on `isObjectValue`
    (`value.ts:220–222`), a classification by exclusion of enum and `Result`
    that never consults `SCHEMA_TAG`. `schemaTagOf` has exactly two callers in
    `src/`, both named above.
  - `stringifyInterpolation` (`production-theta-producer.ts:5657–5683`) — the
    production QRY-18 render. Its object / array arm calls
    `translateInterpolationOutbound(value, env)` with **no** `typeHint`
    (`:5673`), so at the top level an unbranded object resolves no schema at all
    and there is no declared-field-type fallback to reach.
  - `evaluateObjectMember` (`src/runtime/stdlib-object.ts:105–127`) — the read
    seam: `case "keys"` is `Object.keys(receiver)` (`:114`), `case "values"` is
    `Object.values(receiver)` (`:118`). A faithful mirror of the record, which
    bug 0080's cell (S) pins deliberately.
  - `src/runtime/stdlib-object.ts:9–12` and `:38–42` — the module header, which
    states the order is "established at construction time" twice. True for a
    ctor value after bug 0080 and false for an inbound-rebuilt one; a
    documentation site any fix touches.
  - `valuesEqual` (`value.ts:494–570`) — the object arm (`:540–557`) compares
    enumerable own key sets and per-key values with no reference to key order or
    to any brand. Measured `true` across the disagreement, in both argument
    orders.
  - `src/runtime/query-tool-loop.ts:721–728` — why the defect is currently
    unreachable in production on the typed-query boundary: the loop returns
    `forced.payload`, the AJV-validated payload itself, with no translation pass
    of any kind.
  - `src/parser/body-type-lowering.ts:109–140` — `lowerObjectFields`, the
    lowering that *does* run in production. It keys `properties` (`:116`,
    `:120`) and pushes `required` (`:117`, `:128`) by `field.name`, in field
    order, and closes the object (`required` plus `additionalProperties: false`,
    `:130–135`). Its parameter type `LowerableField` (`:57–60`) declares only
    `name` and `typeSource`, so this path carries no rename and produces no
    sidecar. Two consequences for §Fix: the lowered fragment production actually
    emits **is** declaration-ordered, and the sidecar route has no producer in
    production to extend.
  - `src/render/query-render.ts:396–443` — `stringifyInterpolatedValue`, the
    second renderer. Its object / array arm calls `translateOutbound` only when
    `type.sidecars !== undefined` (`:422–427`); no site in `src/` ever sets
    `sidecars` on an `InterpolationType`, so that arm is unentered in production
    too. Its only callers are `production-theta-producer.ts:5675` (non-object
    arms only) and `src/parser/system-interpolation.ts:480`.
  - `src/parser/theta-document.ts:536–546` (`SchemaFieldSource`: `name`,
    `typeSource`, optional `wireName` at `:545`), `:556–564` (`SchemaDecl`, with
    `fields?` at `:564`) and `src/runtime/lexical-environment.ts:517`
    (`resolveSchema`) — the third available source of declaration order **and**
    renames at runtime, and what a resolve-at-rebuild route would consult.
  - `docs/spec_topics/expressions.md:118` — the anchor: "| `keys()` |
    `(): array<string>` | Theta-side field names, in schema declaration order
    for named schemas; insertion order otherwise |". `:119` — `values()` "in the
    same order as `keys()`". `:209` — §"Object construction", "field order is
    irrelevant". Mirrored at `docs/reference/grammar.md:444–445`.
  - `docs/spec_topics/runtime-value-model.md:12` — the object row: "JS plain
    object keyed by **theta-side names**, regardless of any wire-name renames
    declared on the schema. Wire-name translation happens only at the validation
    boundary." `:34` — the inbound half of §"Wire-name translation" ("after AJV
    validation against the lowered schema, the runtime walks the validated JSON
    and (a) rebuilds the value with theta-side names using each schema's
    translation map …", closing "The rule applies uniformly to every inbound
    boundary — typed query results, tool-call return decoding where typed,
    `invoke` returns, and binder `args` — and is not restated per call site").
    `:16` — the non-normative reference-encoding paragraph, which names the enum
    tag and the `Result` brand and **not** a schema brand. `:28` — objects
    compare key set and per-key value, "key declaration order is irrelevant".
    `:37` — "defaults … arrive at the theta body already branded and
    theta-side-named", the only spec sentence outside `:16` using "branded".
    Mirrored at `docs/reference/type-system.md:111`, `:143–158`.
  - `docs/spec_topics/schema-subset.md:87` — Lowering Algorithm step 5, which
    fixes the sidecar as "a sidecar with **two** maps" and the wire-name map as
    "`{ theta: "first_name", wire: "FirstName" }` **per renamed field**". The
    implementation is conformant to this sentence: the sidecar's silence about
    field order is the spec's shape, not an implementation shortcut. Mirrored at
    `docs/reference/schema-subset.md:184–187`.
  - `docs/spec_topics/schema-subset.md:85` and `:110` — the *Array element
    order* clause and its closing note: object `required` "lists wire names in
    declaring-field order (matching the `properties` order of the same Object
    form)", and "the emitted lowered schema retains the theta-source declaration
    order of fields". A second, already-normative carrier of declaration order,
    available at the inbound boundary by construction because AJV validated
    against exactly that fragment.
  - `docs/spec_topics/query/query-escapes-stringification.md:27` — QRY-18's
    Schema-typed-object row ("`JSON.stringify` of the value, **compact** …, with
    wire-name translation applied recursively"); `:33` — "There is no second
    translation map for interpolation: the theta-side names an author writes
    never appear in the rendered prompt."
  - `docs/spec_topics/schemas.md:21–30` — §"Wire-name renaming"; `:45` — a
    redundant rename (`field_name as "field_name"`) is
    `theta/parse/redundant-wire-name`, a warning, which is the input class
    `buildSidecar`'s second conjunct at `:249` filters out.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2, the closed
    registry. No route needs a code (§Fix (e)).
  - `tests/ctor-declaration-order.test.ts` — bug 0080's 16-cell witness, green
    at HEAD (16/16, run below), and the constraint set any fix here rebases on.
    Cell (S) (`:835–859`) pins that the read seam "returns the record's own key
    order verbatim — it neither consults the brand nor sorts", which forecloses
    fixing this at `evaluateObjectMember`. Cell (G, brand integrity) (`:607`)
    pins the brand recoverable through `schemaTagOf` at unchanged key set and
    count. Cell (N) (`:782`) pins a bare Pi-tool-argument object keeping source
    order and carrying no brand.
  - `tests/enum-schema-tag-privacy.test.ts:487–518` — cell (b3), the only test
    in the tree that drives `translateInbound`. It asserts the named-enum
    re-tag, the equality with a locally built variant, and the tag's absence
    from JSON output. It asserts nothing about key order and nothing about the
    schema brand, so it neither witnesses this defect nor blocks a fix.
  - `tests/wire-name-translation.test.ts` — the seam's own six cells (five
    inbound, one outbound; green at HEAD). Each inbound cell reads named fields
    off the rebuilt value (`result.first_name`, `result.age`). The file contains
    no `Object.keys` and no `schemaTagOf` at all, so neither half of this defect
    is in its assertion surface.
  - **Test coverage of this defect: none.** No test in the tree asserts the key
    order of an inbound-rebuilt value, and no test asserts whether one carries a
    schema brand. Grepped at HEAD: `schemaTagOf` appears in five test files, none
    of them over a `translateInbound` product.
- **Observed at:** `0.70.0` (HEAD `bb5206a6`). Offline, deterministic; no
  provider, no model dispatch, no child process. Scratch vitest over the
  exported seams — `translateInbound`, `translateOutbound`, `buildSidecar`,
  `buildObjectSchemaValue`, `schemaTagOf`, `valuesEqual`, `evaluateObjectMember`
  and `QuestionOperandDefectError` — with the observed values printed verbatim.
  Written, run, deleted; no file under `src/`, `tests/` or `docs/` was modified
  by the probe.

## Summary

Bug 0080 made the **outbound** direction of `expressions.md:118` conform, at one
construction point: `buildObjectSchemaValue` (`src/runtime/value.ts:385`)
reorders the already-evaluated field record into the declaring schema's
declaration order and brands it, so `keys()`, `values()`, `JSON.stringify` and
the QRY-18 interpolation JSON all report declaration order for a
constructor-built value.

The **inbound** direction does not agree. `rebuildInbound`
(`src/runtime/wire-translation.ts:129`) builds its record by walking
`Object.entries` of the AJV-validated model payload (`:159`), so the rebuilt
value's key order is whatever order the model emitted its JSON in. Measured
through `evaluateObjectMember` — the real `keys()` implementation — with
`schema P { b: integer, a: string }` and a model answer of `{"a":"x","b":1}`:
`keys()` is `["a","b"]` where the same schema's constructor-built value answers
`["b","a"]` at the same HEAD. With both fields renamed (`b as "B"`, `a as "A"`)
and a sidecar carrying both renames, the answer is still `["a","b"]`: the rename
map is applied and the order is not, and the order the fix would need is
*present in that sidecar* and unread.

The same walk returns the record unbranded (`:174`). `brandSchemaValue` is not
in scope in that module at all (`:48`). The brand has exactly two readers and
both are affected. `translateInterpolationOutbound` resolves its theta→wire
rename map from the brand first (`production-theta-producer.ts:5718–5721`) and
receives no `typeHint` at a top-level interpolation (`:5673`), so an
inbound-rebuilt value interpolated into a later query renders theta-side names
where `schemas.md:21–30` declared wire ones — established from that resolution
order, not measured through a drive, because no production path yields such a
value yet. `QuestionOperandDefectError`'s operand summary is measured: it
degrades from `a 'P' schema object` to `an object with keys a, b`. Nothing else
reads the brand — `match` and the four runtime read entry points are established
unaffected in §Affected.

This was **an explicit obligation, not an incidental finding**. Bug 0080's
§Non-goals reads: "Not about the inbound (model → theta) rebuild path, which was
not probed offline here; a fix should check whether that path already
reconstructs in schema order, since the two paths must agree." That check ran as
part of the 0.70.0 fix, answered **NO**, and the fix declined to widen into it,
recording the answer and residual (ii) in its own §Fix section.

A fix is not local, for two structural reasons measured below. First, the
sidecar the seam consumes carries no field order: `buildSidecar`
(`schema-lowering.ts:243`) emits a wire-name entry only when
`field.wireName !== undefined && field.wireName !== field.thetaName` (`:249`), so
an un-renamed schema yields `wireNames: []`, and this is the *spec's* shape —
`schema-subset.md:87` fixes the sidecar at two maps and the wire-name map at one
entry "per renamed field". Second, the whole mechanism is unwired: neither
`translateInbound` nor `buildSidecar` has a caller in `src/`, and the production
typed-query loop binds the raw validated payload
(`query-tool-loop.ts:721–728`). The defect is therefore real, spec-anchored and
currently unobservable through any drive — and it is exactly what bug 0067's fix
would import into production if it lands alone.

## Reproduction

Offline, at `bb5206a6`. One scratch vitest file over the exported seams; every
fixture declares `schema P { b: integer, a: string }` — declaration order `b`
then `a`. `keys()` / `values()` are the real `evaluateObjectMember`
(`stdlib-object.ts:105`), not `Object.keys`. Output quoted verbatim.

### The sidecar carries no field order — and cannot

```
@@ buildSidecar([{b,/properties/b,other},{a,/properties/a,other}])          [no renames]
   {"wireNames":[],"namedEnumPositions":[]}
@@ buildSidecar([{b as "B"},{a as "A"}])                                    [both renamed]
   {"wireNames":[{"theta":"b","wire":"B"},{"theta":"a","wire":"A"}],"namedEnumPositions":[]}
@@ buildSidecar([{b as "b"}])                                    [redundant rename, :45]
   {"wireNames":[],"namedEnumPositions":[]}
```

Row 1 is the ordinary case and it carries nothing at all. Row 2 shows that when
*every* field is renamed the declaration order is incidentally recoverable from
`wireNames` — which makes row 3 of the next block the sharper measurement, since
the order is available there and still not used. Row 3 confirms the second
conjunct at `:249`: a rename whose wire name equals the theta name emits no
entry either.

### The inbound rebuild follows the model, not the declaration

```
@@ decl b,a; no renames; model answers {"a":"x","b":1}
   keys() ["a","b"]   values() ["x",1]   JSON {"a":"x","b":1}
@@ decl b,a; no renames; model answers {"b":1,"a":"x"}
   keys() ["b","a"]   values() [1,"x"]   JSON {"b":1,"a":"x"}
@@ decl b,a with b as "B" and a as "A";
   sidecar wireNames [{theta:b,wire:B},{theta:a,wire:A}];
   model answers {"A":"x","B":1}
   keys() ["a","b"]   values() ["x",1]   JSON {"a":"x","b":1}
@@ same, model answers {"B":1,"A":"x"}
   keys() ["b","a"]   values() [1,"x"]   JSON {"b":1,"a":"x"}
```

Rows 1 and 3 are the defect; rows 2 and 4 are the coincidence that hides it —
when the model happens to emit its fields in declaration order the answer is
indistinguishable from a conformant one. Row 3 also shows the rename mapping
working (`A`→`a`, `B`→`b`) while the order does not, on the one input where the
sidecar does carry the order.

### The outbound control at the same HEAD

```
@@ buildObjectSchemaValue({a:"x",b:1}, "P", resolve→fields[b,a])
   keys() ["b","a"]   values() [1,"x"]   JSON {"b":1,"a":"x"}
   schemaTagOf "P"    own symbols 1
   translateOutbound(ctor value, renamed sidecar)   {"B":1,"A":"x"}
```

One schema, one pair of field values, two provenances, two orders — and the
disagreement survives a round trip back to the wire: `translateOutbound` of the
inbound-rebuilt value is `{"A":"x","B":1}` (below), of the ctor value
`{"B":1,"A":"x"}`.

### The brand

```
@@ translateInbound(decl b,a renamed; model {"A":"x","B":1})
   schemaTagOf              undefined
   own symbol count         0
   prototype               Object.prototype
   translateOutbound(…)     {"A":"x","B":1}
```

Zero own symbols: not a wrong brand, no brand. The prototype is intact, so the
value is an ordinary plain object on every theta-visible surface — which is what
makes the loss invisible.

### Equality does not witness either half

```
@@ valuesEqual(ctorValue, rebuiltValue)   true
@@ valuesEqual(rebuiltValue, ctorValue)   true
```

Required by `runtime-value-model.md:28` (key declaration order is irrelevant) and
by bug 0026's provenance-twin cells. It is also why nothing in the tree notices:
the two values are `==` and render as different bytes.

### The second brand consumer, measured

```
@@ QuestionOperandDefectError(ctorValue).message
   internal defect: '?' operand evaluated to a non-Result value (a 'P' schema
   object); the parse-time ERR-18 operand gate … — a gate gap (bug 0019)
@@ QuestionOperandDefectError(rebuiltValue).message
   internal defect: '?' operand evaluated to a non-Result value (an object with
   keys a, b); the parse-time ERR-18 operand gate … — a gate gap (bug 0019)
```

Same schema, same fields; the diagnostic can name the schema for one provenance
and not the other.

### Nested and array positions inherit the walk

```
@@ decl Outer{Inner}, Inner{j as "J2", i}; model {"Inner":{"J2":2,"i":1}}
   nested keys() ["j","i"]   JSON {"Inner":{"j":2,"i":1}}
@@ decl Root{items: array<…>}; model {"items":[{"a":"x","B":1}]}
   JSON {"items":[{"a":"x","B":1}]}
```

Row 1: the nested rebuild resolves its sidecar at all only because the field's
wire name equals the `$defs` name — the divergence `wire-translation.ts:33–45`
records — and the nested keys are the payload's own order (here `j` before `i`,
which coincides with the declaration, so this row measures the mechanism and not
a second disagreement; the walk at `:159` is the same one for every depth).
Row 2: an array element
recurses with `undefined` for its sidecar (`:134–139`), so `B` is never renamed
back to `b`. Row 2 is a pre-existing gap of the same seam and a §Non-goal here;
it is quoted because any order-carrying sidecar change has to answer what an
array element's order is too.

### Static confirmation that nothing production reaches this

```
$ rg -n "translateInbound|buildSidecar" src/
src/parser/schema-lowering.ts:243:export function buildSidecar(fields: readonly SidecarFieldInput[]): SchemaSidecar {
src/runtime/wire-translation.ts:28://   `Severity.High` — neither passes through `translateInbound`.
src/runtime/wire-translation.ts:118:export function translateInbound(input: InboundTranslationInput): ThetaValue {
```

Two declarations, one comment, zero call sites.

### Baseline suites at HEAD

```
tests/ctor-declaration-order.test.ts    16 passed     [bug 0080's witness]
tests/wire-name-translation.test.ts      6 passed     [the seam's own cells]
tests/enum-schema-tag-privacy.test.ts   20 passed     [bug 0020's, incl. (b3)]
```

## Expected behaviour

**The order half.** `docs/spec_topics/expressions.md:118`:

> | `keys()` | `(): array<string>` | Theta-side field names, in schema
> declaration order for named schemas; insertion order otherwise |

The clause carries exactly one qualification — whether the schema is *named* —
and says nothing about how the value came to exist. That is what makes the
inbound path's disagreement a defect rather than an unspecified case: a typed
query's result value is a value of the named schema its `@<Schema>` annotation
declares, so `:118`'s first arm governs it, and `:119` binds `values()` to the
same order. `docs/reference/grammar.md:444–445` mirrors the clause with the same
lack of qualification. Nothing on either page distinguishes a
constructor-produced value from a model-produced one, and
`expressions.md:209`'s "field order is irrelevant" removes the only other
candidate source of a per-value order.

`docs/spec_topics/runtime-value-model.md:12` fixes what the value is — "JS plain
object keyed by **theta-side names**, regardless of any wire-name renames
declared on the schema. Wire-name translation happens only at the validation
boundary" — and says nothing about order, which leaves `:118` the sole
authority, exactly as bug 0080 recorded for the outbound side. `:34` fixes the
inbound obligation itself: "after AJV validation against the lowered schema, the
runtime walks the validated JSON and (a) rebuilds the value with theta-side
names using each schema's translation map", uniformly across "typed query
results, tool-call return decoding where typed, `invoke` returns, and binder
`args`". The measured rename mapping satisfies (a) as written; the sentence
prescribes no order, and `:118` supplies it.

Under those, on the measured input: a model answer of `{"a":"x","b":1}` against
`schema P { b: integer, a: string }` must rebuild to a value whose `keys()` is
`["b","a"]` and whose `values()` is `[1,"x"]`, and whose `JSON.stringify` is
`{"b":1,"a":"x"}` — byte-identical to the ctor-provenance value bug 0080's fix
now produces.

**The brand half — no spec sentence requires it, and that absence is part of
this report.** The corpus was searched for any obligation that an inbound-rebuilt
object carry a declaring-schema marker. There is none:

- `runtime-value-model.md:16`, the only paragraph describing brands, is
  explicitly non-normative and names exactly two — the enum tag
  (`__thetaEnum`) and the `Result` brand (`__thetaResult`). The schema brand is
  absent from it. `SCHEMA_TAG` (`value.ts:263`) is an implementation invention
  that bugs 0020 and 0026 constrained; no page declares it.
- `:37` is the only other spec sentence using the word: "defaults … arrive at
  the theta body already branded and theta-side-named". Its referent is the enum
  tag — the next sentence is entirely about `Severity.High` — and its subject is
  the path that *bypasses* the inbound pass, so it cannot be read as an
  obligation on the pass.
- `:12`'s object row says the value is a plain object keyed by theta-side names,
  which an unbranded record satisfies.

So the brand's absence is not a violation on its face. It is a defect of internal
consistency with a spec-anchored consequence, through the mechanism the
implementation chose: `translateInterpolationOutbound` resolves the theta→wire
rename map from the brand (`:5718`) with a declared-field-type fallback that a
top-level interpolation does not supply (`:5673`), so interpolating an
inbound-rebuilt value emits theta-side names — against
`query-escapes-stringification.md:33` ("the theta-side names an author writes
never appear in the rendered prompt") and against `:27`'s "with wire-name
translation applied recursively". A fix therefore owes an answer to the prior
question: does the inbound value carry the brand, or does the outbound render
stop depending on it? Either answer is defensible from the corpus; the choice is
this report's deliverable, not a detail.

## Actual behaviour / root cause

**The walk is over the payload.** `rebuildInbound`
(`src/runtime/wire-translation.ts:158–174`):

```ts
  const result: { [k: string]: ThetaValue } = {};
  for (const [wireKey, fieldValue] of Object.entries(value)) {
    const thetaKey = wireToTheta.get(wireKey) ?? wireKey;
    …
      result[thetaKey] = makeEnumValue(enumName, fieldValue);
    } else {
      result[thetaKey] = rebuildInbound(fieldValue, sidecars.get(wireKey), sidecars);
    }
  }
  return result;
```

`result` is a fresh object and every key is inserted in the payload's iteration
order. JS own-key order for non-integer-like string keys is insertion order, so
the model's ordering is transcribed verbatim into the theta-side value. Theta
field names are identifiers and never integer-like, so no numeric-key reordering
softens or worsens this — the transcription is exact. `:174` returns that record.
The two lookup maps built at `:144–156` are consulted per key (`:160`, `:161`)
and never to enumerate: `wireNames` is read into a `Map` keyed by wire name, so
even the order it does carry in the fully-renamed case is discarded at
construction of that map.

**Nothing brands it.** The module imports `{ makeEnumValue, type ThetaValue }`
from `./value` (`:48`). `brandSchemaValue` is not imported, and `rootDef` — the
one input that names the schema (`:94`) — is used once, to select the root
sidecar (`:119`), and never reaches the rebuild.

**The information needed for the order is not in the sidecar, and that is the
spec's shape.** `SchemaSidecar` (`schema-lowering.ts:233–236`) has two arrays.
`buildSidecar` fills the first only for renamed fields (`:249`) and the second
only for named-`enum` positions (`:254–259`). For `schema P { b: integer, a:
string }` both are empty, measured. `schema-subset.md:87` specifies exactly that:
"a sidecar with two maps: (1) *Wire-name translation* — `{ theta: "first_name",
wire: "FirstName" }` **per renamed field** … (2) *Named-enum positions*". The
implementation is conformant; the seam is under-expressive by design, and
extending it is a spec edit, not a code correction. This is the same class of
gap the module header already records for nested `$ref` targets
(`wire-translation.ts:33–45`): "a fully faithful boundary needs the `V5f`
lowering pass to emit a per-field ref-target into the sidecar, which is out of
this leaf's scope."

**Those two want one fix, not two.** Both are the same missing edge — the
sidecar records facts *about* fields (a rename here, an enum there) but never the
field list itself, so neither "which `$defs` does field *f* reference" nor "what
position does field *f* occupy" can be answered. A per-field record carrying
`{ theta, wire, position, refTarget? }` answers both; two separate additions
would add two partial views of one list. A fix here that extends the sidecar
without accommodating the `$ref` target leaves a second extension owed against
the same interface, and the `$ref` divergence is what currently decides whether a
nested value gets a sidecar at all — i.e. whether its order could be fixed even
in principle (measured: the nested row works only because the field name equals
the `$defs` name). They are one edit; whether they are one *report* is §Fix (d).

**Two other carriers of the order do exist.** The report does not need the
sidecar to be the answer:

1. The lowered fragment. `schema-subset.md:85` and `:110` make the emitted
   lowered schema declaration-ordered normatively ("object `required` lists wire
   names in declaring-field order (matching the `properties` order of the same
   Object form)"; "the emitted lowered schema retains the theta-source
   declaration order of fields"), and the production lowering does emit it that
   way (`body-type-lowering.ts:116–133`, keyed by `field.name` in `fields`
   order). AJV validated the payload against exactly that fragment, so it is in
   hand at the boundary by construction.
2. The declaration. `LexicalEnvironment.resolveSchema`
   (`lexical-environment.ts:517`) returns a `SchemaDecl` whose `fields`
   (`theta-document.ts:564`) is the ordered `SchemaFieldSource[]` carrying both
   the name and the `wireName` (`:545`) — the same source
   `translateInterpolationOutbound` already uses, and the same shape
   `SchemaFieldOrder` (`value.ts:305–319`) was declared to consume without an
   import cycle.

**Nothing downstream can notice.** The read seam is a faithful mirror by design
(`stdlib-object.ts:114`, `:118`; pinned by bug 0080's cell (S)), so a
model-ordered record reads as a model-ordered `keys()`. `valuesEqual`'s object
arm compares key sets and per-key values (`value.ts:540–557`), so the two
provenances are `==` — measured. The brand is non-enumerable, so its absence
changes no key, no key count and no JSON of the value itself. The rebuilt record
is a well-formed `ThetaValue` of the right type with the right key set and the
right per-key values; only its order and its provenance marker are wrong, and
neither has a post-condition anywhere.

**Why no drive shows it today.** `translateInbound` has no caller in `src/` (bug
0067's finding, re-verified above), and neither does `buildSidecar`; no site sets
`sidecars` on an `InterpolationType`, so `translateOutbound`'s production import
(`query-render.ts:37`) reaches its call site's guard (`:422`) and stops. The
typed-query loop binds `forced.payload` (`query-tool-loop.ts:721–728`). So the
defect's inputs exist only at the seam — which is why this report measures at the
seam and claims nothing about a production drive.

## Why it matters

- **The two directions of one clause disagree, at one HEAD.** Measured: the same
  schema and the same field values render `{"b":1,"a":"x"}` from a constructor
  and `{"a":"x","b":1}` from a model answer, and `keys()` answers `["b","a"]`
  against `["a","b"]`. Bug 0080's own reasoning for fixing the outbound side
  applies unchanged: `keys()` is the only object iteration surface theta 1.0
  exposes, and a `for k in obj.keys()` loop over a query result visits fields in
  an order no source text predicts.
- **It is the residual of a fix that stated the obligation.** 0080's §Non-goals
  asked for exactly this check, its orchestrator ran it and answered NO, and its
  §Fix records the answer and the reason for stopping. Leaving it open leaves a
  documented, measured disagreement in the tree with a fix record pointing at it.
- **Bug 0067's fix imports it.** 0067's route (1) applies the inbound pass at
  `#validateInvokeReturn`, and its closing paragraph proposes a single enforced
  entry point for every inbound boundary. The moment either lands, every typed
  query result, typed tool return, `invoke` return and binder `args` object
  becomes model-ordered and unbranded on a production path — with no diagnostic,
  because there is none to emit. Fixing 0067 first converts this report from
  unreachable to S1.
- **The order is a real prompt-engineering input.** `query-escapes-stringification.md:27`
  sends the object to the model as compact JSON; the model reads it left to
  right. A value that came *from* the model and goes back *to* it carries the
  model's own ordering rather than the schema's, which is the one ordering the
  author controls.
- **The missing brand silently changes what the model is told.** Established
  statically: at a top-level interpolation there is no `typeHint`
  (`production-theta-producer.ts:5673`), so an unbranded object resolves no
  schema (`:5719–5721`) and every key is emitted verbatim (`:5732–5733`) —
  theta-side names into the prompt, against
  `query-escapes-stringification.md:33`. Not measured through a drive, because
  no production path produces such a value yet (§Non-goals).
- **The missing brand also degrades a diagnostic.** Measured:
  `an object with keys a, b` in place of `a 'P' schema object` in
  `QuestionOperandDefectError`'s message. Small, but it is a second
  independently observable consequence of one line's absence, and it shows the
  brand is load-bearing beyond the render.
- **Equality hides it.** The two provenances are `==` in both argument orders and
  must remain so (`runtime-value-model.md:28`). Any consumer hashing or diffing
  the rendered form sees differences that equality denies — the same shape bug
  0080 recorded as its point 3, now across provenances instead of across
  constructor call sites.
- **The coincidence makes it untestable by accident.** When the model emits
  fields in declaration order, the answer is correct. Measured both ways; a suite
  that happens to use single-field schemas or declaration-ordered fixtures can
  never see it, which is why the six existing seam cells do not.
- **One module header asserts something false, in two places.**
  `stdlib-object.ts:9–12` and `:38–42` state the key order is "established at
  construction time". After bug 0080 that is true for a ctor value and false for
  an inbound one; the header is the reference a later reader checks the seam
  against.

## Non-goals

- **Wiring the inbound pass into production.** Bug 0067's subject: which
  boundaries call `translateInbound`, and whether it gains a single enforced
  entry point. This report is about what that function *does* when called; it
  adjudicates no call site.
- **The nested-`$ref` name-match divergence itself.** Recorded at
  `wire-translation.ts:33–45` and measured here only to establish that the two
  gaps share one missing edge (§Actual behaviour). Whether a per-field
  `refTarget` lands in the same edit is §Fix (d); the divergence's own
  faithfulness question is not adjudicated here.
- **The array-element arm.** `:134–139` recurses with no sidecar, so an element's
  renames and enum tags are unresolvable through this seam. Measured above and
  cited because an order-carrying sidecar must say what an element's order is,
  but the arm's own disposition is a separate adjudication.
- **`lowerObjectFields`' theta-side keying.** `body-type-lowering.ts:120`, `:128`
  key `properties` and `required` by `field.name`, and its parameter type
  (`:57–60`) carries no `wireName`, so the production lowering emits no wire
  names. Recorded as a read fact because it is the fragment a
  lowered-fragment-driven route would consult; whether it is itself a defect
  against `schemas.md:21–30` is not adjudicated here.
- **Equality.** Order-insensitive by spec (`runtime-value-model.md:28`) and
  implemented so (`value.ts:540–557`). Measured `true` across the disagreement in
  both argument orders; it must stay `true` after any fix.
- **The `__proto__` residual and anonymous-object insertion order.** Bug 0080's
  residual (i) — now [0119](./0119-proto-named-field-silently-dropped.md) — and
  its §Non-goals. Neither is reached by the inbound path, whose keys come from a
  validated payload rather than from author-written field names.
- **The integer-like wire rename.** Bug 0080's residual (iii), now
  [0121](./0121-integer-like-wire-rename-escapes-order-guarantee.md): it is the
  *outbound* re-key by wire names, and this report measures theta-side key order
  on the inbound side. A route here that reads wire names back out of a lowered
  fragment (§Fix (a2)) meets 0121's input class and must say so; nothing else
  overlaps.
- **`has(k)`.** Own-key only (`stdlib-object.ts:123`) and order-independent; a
  reorder cannot affect it, and bug 0080 probed it conformant.

## Fix

**Not settled. This report exists to pin the route and the sidecar's shape
first.** Six questions, and (d) plus (f) order the work.

**(a) Where does the declaration order come from?** Three sources exist, and the
choice decides whether this is a spec edit.

1. **Extend `SchemaSidecar` to carry the field list.** The sidecar is the input
   the seam already takes, so the walk gains an order with no new module edge and
   no environment access. Cost: `schema-subset.md:87` fixes the sidecar at "two
   maps" and the wire-name map at one entry "per renamed field", so a third map —
   or a per-field record replacing both — is a spec change to step 5 landing with
   its `docs/reference/schema-subset.md:184–187` mirror in the same commit. Cost
   two: `buildSidecar` has no production caller, so the extension is inert until
   a producer runs, which couples the route to (f).
2. **Read the lowered fragment.** `schema-subset.md:85` and `:110` already make
   the emitted fragment declaration-ordered normatively, and AJV validated the
   payload against exactly that fragment, so it is in scope at the boundary with
   no spec edit at all. `required` is the cleaner carrier of the two (an array,
   so its order is unambiguous) and it lists *wire* names, which the existing
   `wireNames` map converts back. Cost: `translateInbound`'s input shape does not
   include the fragment today (`:88–95`), so the seam signature widens; and the
   production lowering emits theta-side names rather than wire ones
   (`body-type-lowering.ts:120`), so a route reading `required` must state which
   name space it is in rather than assuming.
3. **Resolve the declaration at rebuild time.** `resolveSchema`
   (`lexical-environment.ts:517`) returns the ordered `fields` with both names
   (`theta-document.ts:545`, `:564`) — the richest source, and the one
   `translateInterpolationOutbound` already uses. Cost: it needs the `$defs` name
   to be a declared schema name, which holds for a named schema (`rootDef` is
   that name, `:94`) and fails for `__inline_<slug>` entries
   (`schema-lowering.ts:18–21`), and it puts a lexical environment into a leaf
   module whose entire import surface today is two type-only edges (`:47–48`).
   `SchemaFieldOrder` (`value.ts:305–319`) is the precedent for doing this
   structurally instead.

**(b) Does the rebuilt value carry the brand — or does the render stop needing
it?** Prior to any code. Two dispositions:

1. **Brand at the rebuild.** Symmetric with `buildObjectSchemaValue`, and it
   makes an inbound value indistinguishable from a ctor value on every surface
   including `schemaTagOf`'s two consumers. The brand string is already available
   at the root (`rootDef`, `:94`) and unavailable at nested and array positions
   without (a) or the `$ref` edge — so a partial fix brands the root and leaves
   nested values unbranded, which is a *third* provenance class and must be
   stated if chosen rather than discovered later.
2. **Make the outbound render independent of the brand.** The brand exists at all
   because `translateInterpolationOutbound` needs a rename map (`:5718`); a
   render driven by the interpolated expression's static type instead would need
   no brand on any value. Larger blast radius, touches bug 0026's and 0020's
   subject matter, and QRY-18 keys its table on the static type already
   (`query-escapes-stringification.md:16`), so the corpus does not refuse it —
   but it is a different report's surface.

Whichever is chosen, **the brand must stay a non-enumerable symbol recoverable
only through `schemaTagOf`**: bug 0020's cells (a3) / (a4)
(`tests/enum-schema-tag-privacy.test.ts:427`, `:435`) pin that a payload naming
`__thetaSchema` as a string key selects no schema, and a rebuild that reads the
payload for a brand name reopens exactly that bug. `brandSchemaValue`
(`value.ts:277–290`) is the only admissible installer.

**(c) Amend the spec instead.** `expressions.md:118` could be qualified by
provenance — "declaration order for a locally constructed named-schema value;
the payload's order for a value rebuilt at an inbound boundary". Cheapest, and it
matches the implementation. Against it: it re-splits a clause bug 0080 made
single one release ago, it removes the determinism guarantee an author gets from
reading the schema for precisely the values they did not write, and it needs the
`docs/reference/grammar.md:444–445` mirror in the same commit. It also leaves the
brand question (b) open on its own, since no spec sentence governs that half.

**(d) One edit or two, against the nested-`$ref` divergence.** Route (a) and the
divergence at `wire-translation.ts:33–45` are the same missing edge (§Actual
behaviour). If (a) is chosen, the per-field record should carry the `$ref` target
in the same edit — otherwise a second spec change to step 5 is owed against the
same interface, and the nested order cannot be fixed at all for a field whose
name differs from its target `$defs` (measured: the nested row resolves only on
name equality). If (b2) or (c) is chosen, the divergence is untouched and stays
its own report. This is the decision that fixes the size of the change.

**(e) No diagnostic, and DIAG-2's bearing.** The defect is silent by
construction: a reordered record and a model-ordered one are the same type with
the same keys, and no route has a failure to report — a value the model produced
in an unexpected order is not an error. No route mints or widens a registry row,
so DIAG-2 (`diagnostic-shape.md:72`) is not engaged. What binds instead is the
same-commit mirror obligation on the spec edits each route needs: route (a) →
`docs/reference/schema-subset.md:184–187`; route (c) →
`docs/reference/grammar.md:444–445`; route (b2), if it touches
`runtime-value-model.md`, → `docs/reference/type-system.md:143–158`. If some
route does decide to surface the disagreement diagnostically, DIAG-2 makes that a
registry addition landing in the same commit, and this section is where that
decision has to be recorded.

**(f) Ordering against bug 0067 — binding, and bidirectional.**
[0067](./0067-subagent-envelope-drops-enum-tag.md) owns the fact that no
production path enters this seam. Two consequences. First, a fix here is not
end-to-end observable until an inbound boundary calls `translateInbound` **and** a
sidecar producer runs in production (`buildSidecar` has no caller either), so a
witness for this fix is necessarily a seam-level one plus, if 0067 has landed, a
drive-level one. Second, and the binding direction: if 0067 lands first, it
imports the model order and the missing brand onto four production boundaries at
once. So either this fix lands first, or 0067's fix lands both halves and this
report is discharged inside it. The two are one ordering decision, not two.

Four constraints on any implementation:

- **Bug 0080's single construction point must stay single.** Its fix record
  states the property it bought: "No ordering or branding decision remains at
  either call site, and `brandSchemaValue`'s only production callers are now the
  two branded arms inside `buildObjectSchemaValue`." A rebuild that reorders and
  brands with its own loop makes that false and re-creates the drift the lockstep
  discipline of
  [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md) (fixed
  0.39.0) exists to prevent. `buildObjectSchemaValue`
  (`value.ts:385`) is reusable as-is from `rebuildInbound` — it takes the
  already-built record, a type name, and a structural `SchemaFieldOrder`
  resolver, and `wire-translation.ts` already imports from `./value` (`:48`), so
  routing through it adds no module edge. A route that does not reuse it must say
  why.
- **Bug 0080's 16-cell witness must stay green.** `tests/ctor-declaration-order.test.ts`
  is 16/16 at HEAD (run above) and none of its cells touches the inbound path, so
  green is the expectation, not a hope — but cell (S) (`:835–859`) is a hard
  constraint on the route: it pins that the read seam "returns the record's own
  key order verbatim — it neither consults the brand nor sorts". Any fix that
  sorts in `evaluateObjectMember` reds it and reopens bug 0080's rejected option
  2. The order must be established at the rebuild, exactly as 0080 established it
  at construction. Cell (G, brand integrity) (`:607`) and cell (N) (`:782`) pin
  the brand's descriptor posture and the unbranded bare-object case respectively.
- **AJV validation stays before the rebuild and is not reordered.**
  `runtime-value-model.md:34` fixes the sequence ("after AJV validation against
  the lowered schema, the runtime walks the validated JSON"), and the module
  header restates it (`:8–9`). A reorder that ran before validation would change
  which fragment the payload is checked against; a reorder after it changes only
  insertion order, and must be key-set preserving on the same terms
  `buildObjectSchemaValue` already is — own-key-guarded reads, every payload key
  retained, no declared name invented. The closed-object lowering
  (`body-type-lowering.ts:130–135`: every field `required`,
  `additionalProperties: false`) makes the validated key set equal the declared
  field set for that path, but `translateInbound` accepts any `validated` value,
  so the guard is not optional.
- **The six existing seam cells and cell (b3) must stay green.**
  `tests/wire-name-translation.test.ts` (6/6) reads named fields off the rebuilt
  value and asserts nothing about order; `tests/enum-schema-tag-privacy.test.ts`
  cell (b3) (`:487–518`) drives `translateInbound` for the enum re-tag. A reorder
  and a brand install leave both green by construction — which also means neither
  witnesses the fix, so a new witness is required rather than an extension of
  those assertions.

**Witness — offline, provider-free.** Every row of §Reproduction settles inside
one `translateInbound` call plus one exported reader, so the harness is the
existing seam test's shape (`tests/wire-name-translation.test.ts`), not a new
mechanism. Required: the four order rows with their declaration-order
coincidence controls; the ctor-provenance control at the same field values,
asserting byte-identical `JSON.stringify` across provenances; the brand rows
(`schemaTagOf`, own-symbol count, descriptor non-enumerability, prototype
identity); both `valuesEqual` argument orders; the nested row and the array-element
row; and the `QuestionOperandDefectError` message pair, sourced from the
constructor rather than from a copied string. If (b1) is chosen, one cell must
pin that a payload naming `__thetaSchema` still recovers no tag — bug 0020's
(a3) restated at this seam, where the payload is now read for a schema identity.

## Provenance

- Origin: bug 0080's fix (0.70.0, commit `a03d22d6`), which directed this check
  in its §Non-goals ("Not about the inbound (model → theta) rebuild path, which
  was not probed offline here; a fix should check whether that path already
  reconstructs in schema order, since the two paths must agree"), performed it,
  answered **NO**, and recorded both the answer and the reason for not widening
  in its §Fix and its residual (ii). This report adds what that record does not
  state: the measurement through the real `keys()` / `values()` implementation
  rather than `Object.keys`; the declaration-order coincidence control that shows
  why no existing cell reds; the fully-renamed row where the sidecar *does*
  carry the order and the rebuild still ignores it; the brand's second consumer
  measured (`QuestionOperandDefectError`); the round trip back through
  `translateOutbound`; the nested and array rows; the finding that `buildSidecar`
  has no production caller either, so the sidecar mechanism is unwired end to
  end; the two alternative carriers of declaration order (the lowered fragment's
  normative field order, the declaration itself); the corpus search establishing
  that no spec sentence requires the brand; and the route enumeration with the
  bidirectional bug 0067 ordering constraint.
- Spec: `docs/spec_topics/expressions.md:118` (the `keys()` order clause — the
  anchor), `:119` (`values()`), `:209` (§"Object construction", field order
  irrelevant); `docs/spec_topics/runtime-value-model.md:12` (the object row),
  `:16` (the non-normative reference encoding, naming the enum and `Result`
  brands only), `:28` (equality, key order irrelevant), `:34` (§"Wire-name
  translation", inbound half and the closed boundary list), `:37` (the `params:`
  bypass sentence); `docs/spec_topics/schema-subset.md:85` (*Array element
  order*), `:87` (Lowering Algorithm step 5, the two-map sidecar and the
  per-renamed-field wire-name map), `:110` (the emitted fragment retains
  declaration order); `docs/spec_topics/query/query-escapes-stringification.md:27`
  (the Schema-typed-object row), `:33` (theta-side names never reach the prompt);
  `docs/spec_topics/schemas.md:21–30` (§"Wire-name renaming"), `:45` (redundant
  rename); `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2).
  User-facing mirrors: `docs/reference/grammar.md:444–445`;
  `docs/reference/type-system.md:111`, `:143–158`;
  `docs/reference/schema-subset.md:184–187`.
- Implementation read at `bb5206a6`: `src/runtime/wire-translation.ts:6–22` (the
  header contract), `:33–45` (the nested-`$ref` divergence), `:47–48` (the whole
  import surface), `:73–80` (`isPlainObject`), `:88–95`
  (`InboundTranslationInput`), `:118–120` (`translateInbound`), `:129–175`
  (**`rebuildInbound`** — array arm `:134–139`, sidecar maps `:144–156`, the
  payload walk `:158–174`), `:183–185` (`translateOutbound`), `:193–222`
  (`lowerOutbound`); `src/parser/schema-lowering.ts:18–21` (`__inline_<slug>`),
  `:39–41` (the ordered-entries note), `:211–218` (`SidecarFieldInput`),
  `:221–224` (`WireNameEntry`), `:233–236` (`SchemaSidecar`), `:243–261`
  (**`buildSidecar`**, the emission condition at `:249`);
  `src/runtime/value.ts:186` (`privateBrandOf`), `:220–222` (`isObjectValue`),
  `:241–262` (the brand-posture docstring), `:263` (`SCHEMA_TAG`), `:277–290`
  (`brandSchemaValue`), `:300–303`
  (`schemaTagOf`), `:305–319` (`SchemaFieldOrder`), `:385–412`
  (`buildObjectSchemaValue`), `:494–570` (`valuesEqual`, object arm `:540–557`);
  `src/runtime/stdlib-object.ts:9–12`, `:38–42` (the header's
  established-at-construction claim), `:105–127` (`evaluateObjectMember`);
  `src/runtime/statement-executor.ts:674` and
  `src/extension/production-theta-producer.ts:5823` (the two construction-point
  callers); `production-theta-producer.ts:5657–5683` (`stringifyInterpolation`),
  `:5696–5736` (`translateInterpolationOutbound`), `:5760–5784`
  (`interpolationTypeOf`); `src/render/query-render.ts:37–39`, `:396–443`
  (`stringifyInterpolatedValue` and its guarded `translateOutbound` call);
  `src/parser/system-interpolation.ts:480`; `src/runtime/match-result.ts:25` (its
  whole `./value` import), `:144` (`evaluateMatch`), `:169–202` (`matchPattern`
  and its `object` arm) — the brand-free half of the blast radius;
  `src/runtime/runtime-panics.ts:420–427` (`QuestionOperandDefectError`),
  `:440–462` (`summariseNonResultOperand`, the `schemaTagOf` read at `:453`);
  `src/runtime/query-tool-loop.ts:721–728`;
  `src/parser/body-type-lowering.ts:57–60` (`LowerableField`), `:109–140`
  (`lowerObjectFields`); `src/parser/theta-document.ts:536–546`
  (`SchemaFieldSource`), `:556–564` (`SchemaDecl`);
  `src/runtime/lexical-environment.ts:517` (`resolveSchema`).
- Test evidence at `bb5206a6`: `tests/ctor-declaration-order.test.ts` (bug
  0080's 16-cell witness; cell (G, brand integrity) `:607`, cell (N) `:782`, cell
  (S) `:835–859`); `tests/wire-name-translation.test.ts` (the seam's six cells);
  `tests/enum-schema-tag-privacy.test.ts:427`, `:435` (bug 0020's forged-name
  cells), `:487–518` (cell (b3), the only `translateInbound` drive in the tree);
  `tests/schema-brand-symbol-migration.test.ts:562–583` (bug 0026's
  provenance-twin section, whose header comment cites `rebuildInbound` by name).
  Baselines run: 16/16, 6/6, 20/20.
- Reproduction: one scratch vitest file at `bb5206a6` — nine cells over the
  exported seams (`translateInbound`, `translateOutbound`, `buildSidecar`,
  `buildObjectSchemaValue`, `schemaTagOf`, `valuesEqual`, `evaluateObjectMember`,
  `QuestionOperandDefectError`), printing the values quoted above. Run on the
  output transcribed in §Reproduction, then deleted. No provider, no model, no
  child process, no ambient state touched. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

## Coordination note — bug 0067 (0.90.0): the brand half has landed

Appended by [0067](./0067-subagent-envelope-drops-enum-tag.md)'s fix. This
report's status and route are unchanged; nothing above is retracted.

§Fix (f) made the ordering bidirectional: "either this fix lands first, or
0067's fix lands both halves". 0067 took the second horn and shipped in 0.90.0.
What that leaves for this report:

- **The brand half is discharged for the subagent-`invoke` boundary.** A value
  the inbound walk rebuilds under a `$defs` entry naming a declared `schema` is
  now branded, so `schemaTagOf` recovers it and both of its consumers — the
  QRY-18 outbound render's rename map and the `QuestionOperandDefectError`
  operand summary — behave as they do for a constructor-built value.
- **The order half is untouched here, and is vacuous on that one boundary.**
  Measured while settling 0067's route: this boundary's producer is a theta
  child, so its object was built by `buildObjectSchemaValue`, which bug 0080
  made reorder into declaration order before branding; `JSON.stringify` of it,
  and therefore the parent's `JSON.parse`, is already declaration-ordered. The
  observed envelope for `schema P { sev: Sev, who as "Who": string }` is
  `{"sev":"high","who":"w"}` — `P`'s declaration order. §Reproduction's
  model-ordered hazard bites at the typed-QUERY boundary, which 0067 did not
  wire, so it remains this report's to settle.
- **The brand install does NOT go through `buildObjectSchemaValue`.** §Fix (f)'s
  constraint asks a route that declines the shared construction point to say
  why, and the reason is this report's own open question: that function's
  contract reorders into declaration order *and* brands, so routing through it
  would have decided §Fix (a) by implementation. `brandSchemaValue` is called
  directly instead, from `rebuildUnder` in `src/runtime/wire-translation.ts`,
  with that rationale stated at the call site. It is a third production caller
  of `brandSchemaValue`; the other two remain the branded arms inside
  `buildObjectSchemaValue`.
- **Reordering is still absent from the walk**, so §Fix (a)–(e) are undecided
  exactly as written, and the three sibling inbound boundaries §Fix (f) names
  remain unwired.

One citation note: §Fix (a1) and §Provenance quote
`docs/spec_topics/schema-subset.md`'s step 5 as fixing the sidecar at "two
maps". 0067's fix amended that step in place — it now reads "three maps", the
third being a per-position `$ref` target — and the file remains 118 lines, so
the `:87` locant still resolves. The mirror `docs/reference/schema-subset.md`
grew by four lines, so the `:184–187` locant now points four lines high.

## Coordination note — bug 0172 (0.97.0): the order half has landed

Appended by [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)'s
fix. This report's status is unchanged and nothing above is retracted; what
changes is that §Fix (a) is now decided by a landed implementation rather than
open.

§Fix (f) made the ordering bidirectional: "either this fix lands first, or 0067's
fix lands both halves". 0067 took the second horn for the brand and left the
order, and the note above records why the order was vacuous on the one boundary
it wired. 0172 wired the other three, two of which take MODEL-produced payloads,
so §Reproduction's model-ordered hazard became production-reachable and the order
half landed with it.

- **§Fix (a1) is the route taken — the sidecar carries the order.**
  `SchemaSidecar` gained an optional field-order list: that `$defs` entry's own
  object-body field names, theta-side, in declaration order.
  `buildInboundTranslationPlan` derives it at plan time from the `properties`
  walk it already performs, so no new module edge and no environment access is
  introduced. The alternatives were weighed and declined: (a2) reading the
  lowered fragment widens `translateInbound`'s input shape and forces the caller
  to state which name space `required` is in; (a3) resolving the declaration at
  rebuild time puts a lexical environment into a leaf module whose import
  surface is two type-only edges. §Fix (c) — qualifying `expressions.md:118` by
  provenance — is rejected: it re-splits a clause bug 0080 made single.
- **The spec edit §Fix (a1) priced was made in the same commit.**
  `docs/spec_topics/schema-subset.md` step 5 now reads "three maps and a
  field-order list" and states what the inbound pass does with the list, with
  the `docs/reference/schema-subset.md` mirror amended in the same change. That
  is exactly the shape 0067's fix used for the `$ref`-target map.
- **The order is established at the rebuild, and nowhere else.** §Fix's second
  constraint holds: `evaluateObjectMember` was not touched, so cell (S) of
  `tests/ctor-declaration-order.test.ts` stands — the read seam still returns the
  record's own key order verbatim, and all 16 cells are green.
- **Which boundaries run it.** The reorder lives in the shared walk
  (`rebuildUnder` / `rebuildInbound`), so every boundary that calls
  `translateInbound` gets it: the typed-query loop, the typed `.theta`-callable
  return, binder `args` at both projections, and the subagent-`invoke` return
  0067 wired. On that last one it is vacuous for the reason the note above gives
  — the producer is a theta child whose object `buildObjectSchemaValue` already
  ordered — but it is now guaranteed by the walk rather than incidental to the
  producer.
- **Nested and array positions order by the same carrier.** A nested
  named-schema field and an `array<T>` element both re-enter the walk at their
  target's own fragment root, under that fragment's own sidecar, so each orders
  by its own declaration. Witnessed at all three depths in
  `tests/inbound-rebuild-declaration-order.test.ts`.
- **Where no carrier exists, payload order is preserved.** A sidecar with no
  field-order list — a synthesised one, a permissive root, a `$defs` entry with
  no object body — leaves the payload's order untouched. That is what keeps the
  landed seam cells in `tests/wire-translation-inbound-retag.test.ts` green: they
  hand-build their sidecars, and none carries a list. The reorder is otherwise
  key-set preserving on the same terms `buildObjectSchemaValue` is: own-key
  reads, every payload key retained, no declared name invented.
- **AJV still runs before the rebuild**, unchanged, and the reorder changes only
  insertion order.
- **The brand install still does NOT go through `buildObjectSchemaValue`**, and
  the reason has changed. It is no longer that routing through it would decide
  §Fix (a) by implementation — this run decides §Fix (a). Two structural reasons
  remain, both stated at the call site: that function builds a plain `{}`
  record, so a payload key spelled `__proto__` would be swallowed by the
  inherited setter and bug 0173's null-prototype record build undone, and the
  inbound key space is payload-controlled where a constructor's is not; and it
  orders by a RESOLVED declaration, where a `#root` or `__inline_<slug>` position
  names no declaration to resolve.
- **§Fix (b) — the brand half — is unchanged** from what the 0067 note records:
  `brandSchemaValue` is the only installer, the tag stays a non-enumerable
  symbol, and bug 0020's forged-name cells are green.
- **The six seam cells and cell (b3) are green**, unedited, as §Fix's fourth
  constraint requires, and — as that constraint predicted — none of them
  witnesses this change. The new witness is
  `tests/inbound-rebuild-declaration-order.test.ts`, which carries the four order
  rows, the nested and array-element rows, the ctor-provenance control asserting
  byte-identical `JSON.stringify` across provenances with `valuesEqual` in both
  argument orders, and the no-carrier control.

## Closure (0.97.0) — parent-gate adjudication: both halves are landed

Closed at the bug 0172 gate by parent adjudication (the bug 0163 closure
precedent: a sibling fix discharged the filed subject; the gate records the
mapping rather than leaving the report open against landed behaviour).

- **The brand half** landed with bug 0067 (0.90.0): `rebuildUnder` installs the
  brand via `brandSchemaValue` — the only admissible installer — as the
  `## Coordination note — bug 0067 (0.90.0)` above records. The tag stays a
  non-enumerable symbol; bug 0020's forged-name cells pin that a payload naming
  `__thetaSchema` selects no schema.
- **The order half** landed with bug 0172 (0.97.0): §Fix (a) was decided as
  route (a1) — `SchemaSidecar` carries a declaration-ordered field list, derived
  in `buildInboundTranslationPlan`, consumed by `rebuildInbound`'s record build —
  with the step-5 spec edit and `docs/reference/schema-subset.md` mirror in the
  same commit, exactly as (a1) priced. The
  `## Coordination note — bug 0172 (0.97.0)` above records the mechanism, the
  rejected alternatives ((a2), (a3), and §Fix (c) — rejected as re-splitting the
  clause bug 0080 made single), the boundary reach (every caller of
  `translateInbound`, now all four inbound boundaries), the no-carrier fallback
  (payload order preserved), and the constraint audit (cell (S) untouched — order
  established at the rebuild only; AJV before the rebuild; key-set preserving;
  `buildObjectSchemaValue` declined on two stated structural grounds).
- **§Fix (d)'s nested-`$ref` divergence** is closed by the combination: 0067's
  per-position `$ref`-target map gives the walk the edge, and each fragment
  orders by its own sidecar's list — witnessed at root, nested and array depths
  in `tests/inbound-rebuild-declaration-order.test.ts`, alongside the
  ctor-provenance byte-parity control and `valuesEqual` in both argument orders.
- **Witness disposition.** This report's §Witness obligations are discharged
  across `tests/inbound-rebuild-declaration-order.test.ts` (order rows, nested,
  array, provenance parity, no-carrier control),
  `tests/wire-translation-inbound-retag.test.ts` (brand survival, including on a
  null-prototype record since 0173), `tests/ctor-declaration-order.test.ts`
  cells (S)/(G)/(N), and `tests/enum-schema-tag-privacy.test.ts` (a3)/(a4)/(b3).
  The `QuestionOperandDefectError` message pair named in §Witness is subsumed by
  the brand landing (its consumer reads `schemaTagOf`, whose install is pinned);
  no separate cell was minted for it — recorded here as the one deliberate
  narrowing of this report's witness list.
- **What this closure does NOT cover:** values inside `{"anyOf":[…]}` arms
  receive no tag, no brand, no descent and therefore no reorder — that is bug
  0172's face 2, spec-blocked and OPEN there, not a residue of this report.

## Coordination note — bug 0172 face 2 (0.102.0)

The closure note's final bullet — "**What this closure does NOT cover:** values
inside `{"anyOf":[…]}` arms receive no tag, no brand, no descent and therefore no
reorder — that is bug 0172's face 2, spec-blocked and OPEN there" — **retires at
0.102.0**. Bug 0172's face-2 fix landed first-admitting-arm dispatch: a value at a
union position is re-tested against each arm in SUBS-1 source order through the
boundary's own validator and translated under the first arm that admits it, so an
arm resolving a `$defs` entry re-enters the walk at that entry's own root.

**What that means for this report's subject.** An under-arm object now reaches the
record build this report owns, under the arm's own sidecar — so it carries that
entry's step-5 field-order list and its `keys()` is declaration-ordered exactly as
at a non-union position. The order half this report's own fix established at the
rebuild therefore now reaches inside union arms too; no separate mechanism was
added and nothing in `rebuildInbound`'s reorder changed. Where an arm names no
declared entry, the value keeps the pass-through and no reorder occurs — the
rebuild there could only subtract, which the face-2 fix pins in both directions.

**This report's status is unaffected**: it stays fixed, and the retirement is a
narrowing of one negative sentence in its closure note, not a reopening. Nothing
above deletes or rewrites any earlier text.
