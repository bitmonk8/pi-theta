# Bug 0028 — A typed-query annotation naming no lowerable declaration — a typo'd/undeclared name, a declared `enum`, or a schema-body forward/self reference — lowers permissively to `{}` with no diagnostic: the QRY-22 gate validates nothing and any payload binds as the typed value

- **Status:** open
- **Kind:** defect, two classes on one mechanism (the two-defect report per
  the bug-0002 / bug-0023 precedent). (1) *Implementation disagrees with the
  specification*: schema-subset.md §Lowering Algorithm step 3 pins one
  emission per type form — a named schema reference lowers to
  `{ "$ref": "#/$defs/<Name>" }`, an enum to
  `{ "type": "string", "enum": [...] }` — and schemas.md §Recursion pins
  "Any reference to a named schema lowers to `$ref` against the file's
  `$defs`. Self- and mutual recursion are supported transparently", with a
  normative example whose mutual reference (`pets: array<Animal>`, `Animal`
  declared later) is a forward reference. At HEAD those positions lower to
  `{}` (accept-anything): self references always, forward references
  depending on declaration order, and a declared-`enum` annotation always
  (the typed-query path never consults enum decls). No spec text defines a
  `{}` emission for any type form. (2) *Spec and implementation together
  fail to deliver documented behaviour*: for an annotation name declared
  nowhere (a typo), the type grammar defines a `NamedType` as "any schema or
  enum identifier **in scope**" (type-system.md) and defines no behaviour
  for an out-of-scope name at the `@<T>` position; the implementation
  accepts it parse-clean (zero diagnostics, diagnostic-identical to the
  correct spelling), marks the query typed, and validates the response
  against `{}` — so the QRY-22 obligation ("The runtime MUST NOT bind, as a
  typed query's value, a response that has not been validated against its
  declared schema") is met only vacuously while delivering exactly what it
  exists to prevent, and the "runtime AJV check is the safety net" posture
  the spec leans on for every skipped static check (type-system.md
  §Unresolvable operands; query-forms.md QRY-4; invocation.md §Typed
  return) is voided — the net compiles to accept-anything. No registry code
  covers the position: `theta/parse/unresolved-named-type` (E) is scoped to
  the `params:` RHS, and `theta/parse/empty-query-annotation` (E, the
  bug-0014 fix) rejects only the empty interior — on the registry's own
  rationale ("accepted silently it would mark the query typed while giving
  the runtime nothing to validate the response against"), which applies
  verbatim to a typo'd interior.
- **Affected** (citations verified at HEAD `4d645f4f`, 0.32.0):
  - `src/parser/params.ts:280–283` — `lowerTypeExpr`'s (`:236–291`)
    unresolved arm: an identifier not in `bodyTypeMap` pushes onto
    `lowerCtx.unresolved` and returns `{}`. The one consumer that reads the
    list back is `parseParams` (`params.ts:128–138`), which emits
    `theta/parse/unresolved-named-type` (E) per name — the contrast arm.
  - `src/parser/body-type-lowering.ts:130` — `lowerTypeSource` (`:110–131`)
    constructs `unresolved: []` and never reads it back: every unresolved
    name collected below this call is discarded. All non-`params:` lowering
    routes through here (`lowerObjectFields` :60, `lowerInlineObject` :84,
    `buildBodyTypeSchemas` :141).
  - `src/runtime/query-schema-lowering.ts:48` (`lowerQueryResponseSchema`)
    and `:91–102` (`buildBodyTypeMap`) — the typed-query / `invoke<T>`
    lowering. `buildBodyTypeMap` is single-pass in declaration order
    (a schema's fields lower against a map containing only earlier decls,
    so forward and self references lower `{}`) and skips field-less decls;
    the module header (`:19–21`) states the permissive posture as
    implementation commentary with no spec counterpart.
  - `src/runtime/query-schema-lowering.ts:207–212` — `pruneDocumentDefs`'s
    DEFECT GUARD: a reachable `$ref` name with no hoisted body `throw`s.
    The self-reference arm of the fix runs into it (see §Fix).
  - `src/extension/production-theta-producer.ts:2300–2303` — the typed-query
    execution path lowers `expr.schema` against `schemaDeclsOf(...)`
    (`:4920–4922`, `kind === "schema"` only — enum decls are dropped, so a
    declared-enum annotation is unresolvable here by construction);
    `:3260` — `#validateInvokeReturn` routes `invoke<T>` (and the
    `subagent fn` return boundary, FN-6) through the same lowering, so the
    same `{}` validates the child's `Ok` payload.
  - `src/parser/theta-document.ts:1080–1119` (`collectBodyTypes`) — the
    `params:` `$defs` fragments come from the same single-pass
    `buildBodyTypeSchemas`, so a schema body's forward/self reference is a
    silent `{}` inside an otherwise-diagnosed `params:` document; alias-form
    and imported names are deliberately mapped to `{}` at `:1108–1117`
    (comment at `:1103–1106`) — resolved, so no diagnostic, and equally
    silent.
  - `tests/enum-schema-tag-privacy.test.ts:744–757`,
    `tests/query-schema-transitive-defs.test.ts:332–353` and `:355–367` —
    three green tests that encode the permissive `{}` contract as recorded
    behaviour; `:745`/`:749` asserts it directly. The fix keeps the seam's
    `{}` return, so all three assertions survive; their prose and two
    fixture comments do not (see §Fix).
- **Observed at:** `0.32.0` (`4d645f4f`). Offline, deterministic; no live
  model. Scratch vitest driving `parseThetaDocument` (the real load path)
  plus the real `runTypedQueryLoop` / `buildTypedQueryValidation` /
  `AjvSchemaValidator` composition (the harness of
  `tests/production-typed-query-validation.test.ts`), then deleted.

## Summary

Every type-expression lowering position outside the `params:` right-hand
side funnels unresolved names into a list that `lowerTypeSource`
(`body-type-lowering.ts:130`) throws away, and lowers the position to `{}`.
JSON Schema `{}` accepts every instance, so each such position is a
validation hole the author cannot see: the theta parses clean, loads,
registers, and the QRY-15/QRY-22 machinery conveys `{}` to the model as the
"lowered declared shape" and validates the reply against it — every reply
conforms, including replies that are not objects at all.

This is the ingress surface bugs 0017 and 0020 used to route forged wire
payloads to the runtime classifiers (recorded as residual (iii) of the
0020 fix), but it is also a standalone authoring hazard with no forgery
involved: one typo'd letter in `@<Tirage>` silently disables response
validation for that query while the sibling `params: { a: Tirage }`
position fails the load with `theta/parse/unresolved-named-type`. The
positions:

1. **Annotation root, name declared nowhere** (typo). Resolution at the
   annotation root is whole-file (the body-type map is fully built before
   the annotation resolves), so forward references resolve there; only
   never-declared names fall through — and they fall through silently.
2. **Annotation root, declared `enum`.** `schemaDeclsOf` passes schema
   decls only, so `@<Severity>` over a declared enum never resolves and
   lowers `{}` — the author did everything right and still gets no
   validation (spec: `{ "type": "string", "enum": [...] }`).
3. **Schema-body field positions, forward/self references.** The body-type
   map is built single-pass in declaration order, so `Tree.children:
   array<Tree>` lowers `items: {}` always, and `Person.pets: array<Animal>`
   lowers `items: {}` exactly when `Animal` is declared after `Person` —
   the declaration order of schemas.md §Recursion's own normative example.
   Reordering the declarations flips the lowering to the specified `$ref`.
4. **Inline-object annotation fields naming undeclared types**
   (`@<{ x: NotDeclared }>` → `properties.x: {}`).
5. **The same schema-body positions inside `params:` `$defs` fragments**,
   and — deliberate but equally invisible — alias-form and imported names
   on the `params:` RHS.

`invoke<T>` and `subagent fn` return validation share positions 1–4 through
the same `lowerQueryResponseSchema` call; the parse-time
`invoke-return-type-mismatch` check skips when the annotation is
unresolvable, on the documented premise that "the runtime AJV check … 
remains the safety net" (invocation.md §Typed return) — the premise this
defect voids.

## Reproduction

All offline, at `4d645f4f` (code byte-identical to `b542dafe`; the one
commit between them touches `docs/bugs/**` alone). Scratch vitest (written,
run, deleted): the real document parse (`parseThetaDocument` with the
production-shaped deps) plus the real typed-query loop (`runTypedQueryLoop`
+ `buildTypedQueryValidation` + `AjvSchemaValidator`, composed exactly as
`#resolvePromptQuery` wires them).

Fixture (parse-clean; `Triage` declared, annotation typo'd):

```theta
---
mode: prompt
---
schema Triage {
  category: "bug" | "feature" | "question",
  urgent: boolean
}
let r = @<Tirage>`Classify: hello`
r
```

Probe outputs, verbatim:

```
PROBE1 typo diagnostics: []
PROBE1 control diagnostics: []            // @<Triage> — same empty diagnostic list

PROBE2 lowered: {}
PROBE2 outcome.kind: value
PROBE2 bound value: {"anything":[1,2,3],"category":42,"__thetaEnum":"Severity"}

PROBE3 lowered: {"type":"object","properties":{"category":{"enum":["bug","feature",
  "question"]},"urgent":{"type":"boolean"}},"required":["category","urgent"],
  "additionalProperties":false}
PROBE3 outcome.kind: validation
PROBE3 error: {"kind":"validation","cause":"schema_validation"}
```

Probe 2 is the defect end-to-end: the typo'd annotation lowers `{}` and the
real typed-query loop binds an arbitrary payload (here carrying the bug-0020
forged tag key) as the typed value — `outcome.kind: "value"`. Probe 3 is
the control: the correctly spelled annotation rejects the same payload with
`Err(QueryError { kind: "validation", cause: "schema_validation" })`. The
two loads are diagnostic-identical (`[]` both); the load *outcomes* differ —
the lowered schema and `query.schema` are not the same — and nothing
surfaces that difference to the author.

Forward/self references (schemas.md §Recursion's own shape, parse-clean —
`PROBE4 diagnostics: []`):

```
Person lowered:  {..., "pets":     {"type":"array","items":{}}, ...}   // Animal declared AFTER
Tree lowered:    {..., "children": {"type":"array","items":{}}, ...}   // self — never resolves
Person lowered (Animal declared first):
                 {..., "pets": {"type":"array","items":{"$ref":"#/$defs/Animal"}}, ...,
                  "$defs":{"Animal":{...,"additionalProperties":false}}}
```

Declared enum at the annotation root (parse-clean — `PROBE5 diagnostics:
[]`): `@<Severity>` over `enum Severity { Low, High }` lowers `{}`; the
object-schema control `@<Cat>` lowers closed. The same enum reached through
the `params:` path lowers `{"type":"string","enum":["Low","High"]}`, which
localises the asymmetry to `schemaDeclsOf`. Inline-object annotation:
`lowerQueryResponseSchema("{ x: NotDeclaredAnywhere, y: integer }", [])` →
`{"type":"object","properties":{"x":{},"y":{"type":"integer"}},...}`.

The direct-let form is the same surface (`PROBE8`): `let r: Tirage =
@`…`` parses clean (`[]`) and fills `query.schema = "Tirage"` — inference
and explicit ascription converge on the same silent lowering.

The contrast arm (`PROBE6`): the identical typo on the `params:` RHS fails
the load — `["error theta/parse/unresolved-named-type: unresolved named
type 'Tirage'"]`.

## Expected behaviour (what the spec says)

- [QRY-22](../spec_topics/query/query-failure-and-repair.md) (`:78`): the
  runtime "MUST resolve that annotation to its declared shape, lower it to
  the validating JSON Schema per Schema Subset (`SUBS-1`), convey that
  lowered shape to the model on the forced-respond turn … and validate the
  final response against the lowered schema. … The runtime MUST NOT bind,
  as a typed query's value, a response that has not been validated against
  its declared schema." Conveying and validating `{}` for a declared enum
  breaches the conveyance and validation clauses outright; for a typo'd
  name there is no declared shape to resolve, and binding under a
  fabricated permissive contract delivers the unvalidated bind QRY-22
  exists to close.
- [schema-subset.md §Lowering Algorithm](../spec_topics/schema-subset.md#lowering-algorithm)
  step 3 (`:74–85`): the closed per-form emission table — named/inline
  schema reference → `{ "$ref": "#/$defs/<Name>" }` (`:76`); enum →
  `{ "type": "string", "enum": [...] }` (`:80`). No `{}` emission exists
  for any form.
- [schemas.md §Recursion](../spec_topics/schemas.md#recursion) (`:119–141`):
  "Any reference to a named schema lowers to `$ref` against the file's
  `$defs`. Self- and mutual recursion are supported transparently" — the
  normative example's `pets: array<Animal>` (`:132`, with `Animal` declared
  at `:135`) is a forward reference.
- [type-system.md](../spec_topics/type-system.md): a named type is "any
  schema or enum identifier in scope" (`:6`); "The same type grammar
  applies in every type-annotation position: schema fields, frontmatter
  `params:`, `let x: T`, function parameters, and `@<T>`…`` explicit query
  schemas" (`:15`). §Unresolvable operands (`:48`) pins the compensation
  contract for every skipped static check: "the parse-time check is skipped
  and the runtime AJV check is the safety net."
- [code-registry-parse.md](../spec_topics/diagnostics/code-registry-parse.md):
  `theta/parse/unresolved-named-type` (E, `:88`) — "Resolution is
  whole-file, so a frontmatter-to-body forward reference is not itself a
  failure" (the posture that distinguishes forward references from typos);
  `theta/parse/empty-query-annotation` (E, `:73`) — the bug-0014 row whose
  trigger rationale ("accepted silently it would mark the query typed while
  giving the runtime nothing to validate the response against") describes
  the typo'd annotation equally. No spec sentence promises a diagnostic for
  an undeclared annotation name — the registries were searched; that
  absence is why class (2) is "together fail to deliver" rather than a
  missing promised feature.

Expected concretely: forward/self references lower to `$ref` regardless of
declaration order; a declared-enum annotation lowers to its wire-value
`enum`; a name resolving to no declaration whole-file is an author-visible
diagnostic, not a silent accept-anything validator.

## Actual behaviour / root cause

`lowerTypeExpr` (`params.ts:236–291`) has one unresolved arm (`:280–283`):
push the name onto `ctx.unresolved`, return `{}`. Whether that becomes a
diagnostic is decided entirely by which caller built the context.
`parseParams` reads the list and errors (`params.ts:128–138`);
`lowerTypeSource` (`body-type-lowering.ts:130`) builds a fresh list and
discards it, and every other lowering site sits above `lowerTypeSource`.
Three independent resolution gaps then feed the arm:

1. `buildBodyTypeMap` / `buildBodyTypeSchemas` lower schema bodies
   single-pass in declaration order, so a field's forward or self reference
   looks up a map entry that does not exist yet
   (`query-schema-lowering.ts:91–102`, `body-type-lowering.ts:141–156`).
2. `schemaDeclsOf` (`production-theta-producer.ts:4920–4922`) filters
   `kind === "schema"`, so enum decls never reach the typed-query /
   `invoke<T>` lowering at all.
3. A name declared nowhere resolves against nothing by definition; no
   parse-, load-, or runtime-phase check exists at the annotation position
   (`parseQuery` checks only emptiness, `theta-document.ts:3745–3767`;
   `resolveQuerySchemas` / `checkExplicitSchemaMismatch` skip unresolvable
   sides by design).

The b542dafe fix (bug 0020) closed the classifier side of the forgery
chain and left this admitting surface explicitly as residual (iii).

## Why it matters

- A typo silently disables validation for that query. The failure mode is
  the worst available: not a load error (the `params:` posture), not a
  runtime `Err` (the QRY-22 posture), but a successful-looking typed bind
  of unvalidated model output, surfacing — if ever — as downstream
  corruption far from the cause. Field renames and enum re-tagging also
  silently stop (no sidecar resolves), so even a well-shaped reply binds
  with wire names untranslated.
- The recursion non-conformance means the spec's own §Recursion examples
  are not enforced as documented, and whether a schema's cross-reference
  validates is a function of declaration order — invisible, and stable
  under the coverage the author most likely tested (backward references
  work).
- It is the standing wire ingress: bugs 0017 and 0020 both needed a
  permissive-`{}` position to route forged payloads through the QRY-22
  gate. Closing it shrinks the reachable surface of every future
  payload-shape defect.
- The "AJV is the safety net" posture is cited across query-forms.md
  (`:66`), type-system.md (`:48`), invocation.md (`:30`), and tool-calls.md
  (`:14`) as the justification for skipping static checks; each citation
  silently assumes the net is the declared schema, not `{}`.

## Fix

Restore the conformant lowering and add the parse-time rejection in **one
change, one commit**: the registry amendment, the two-pass lowering, the
enum arm and the diagnostic land together. There is no fix-ordering
dependency on another bug; the only coordination is the shared registry row
with [0025](./0025-ctor-unresolved-schema-name-passthrough.md) (below).

**Whole-file two-pass body-type lowering.** `buildBodyTypeSchemas`
(`body-type-lowering.ts:141–156`) seeds the name set with every top-level
`schema`/`enum` declaration before lowering any body, and emits
`{ "$ref": "#/$defs/<Name>" }` for member names, registering each fragment
as it lowers. Forward and self references then resolve by construction —
the exact distinction-from-typos rule `theta/parse/unresolved-named-type`
already documents ("Resolution is whole-file"). Recursive `$ref`s are
within the pinned subset (`schema-subset.md:10` — "`$defs` + `$ref`,
including recursive references"); `pruneDocumentDefs` walks nested defs
with a cycle guard, and the runtime depth cap bounds recursive data.

The self-reference arm collides with a `throw`-on-missing-def guard, and
the construction must satisfy it. While `Node`'s own body lowers,
`bodyTypeMap.get("Node")` is `undefined`, so `lowerTypeExpr:285`
(`lowerCtx.defs[s] = resolved`) has nothing to register; if a `$ref` is
minted without a registered body, `pruneDocumentDefs`'s DEFECT GUARD
(`query-schema-lowering.ts:207–212`) throws — message: "schema lowering
for annotation … references $defs entry '<name>' but no fragment for it
was collected" — converting a silent-permissive lowering into a
lowering-time `Error` on the `invoke`/query dispatch path. The cycle
guard covers the hoist walk, not construction-time self-registration. An
AJV **compile** assertion over the self-recursive document is the
regression pin for this.

**Enum inclusion.** `schemaDeclsOf`
(`production-theta-producer.ts:4920–4922`) gains an enum sibling and both
call sites (`:2302`, `:3260`) pass it. `buildBodyTypeSchemas` already
lowers enums first (`body-type-lowering.ts:145–148`), which is why the
`params:` path resolves them today; the two lowering entry points converge.
`@<Severity>` then lowers to `{"type":"string","enum":["Low","High"]}`.

**A bare enum at the annotation root is legal, and the conveyance text
becomes shape-agnostic.** `type-system.md:15` applies one type grammar to
the `@<T>` position and `schema-subset.md:80` pins the enum emission, so
`@<Severity>` lowers to its non-object root rather than being refused.
Audit of the conveyance surfaces at HEAD, which the original report did not
price:

- The QRY-15 template (`query-tool-loop.md:26–29`) and both respond-repair
  templates (`query-failure-and-repair.md:49–52`, `:56–59`) say "conforming
  to this schema" — no object-root wording, no change needed.
- `#registerRespondTool` / `respondToolEntry` wrap the lowered schema
  verbatim as the tool's `parameters`
  (`production-theta-producer.ts:2615`, `:5079`) with no root-shape
  assertion in the tree.
- The one object-root sentence is `renderTypedAwareQueryText`
  (`:4912–4916`, "Respond with ONLY a single minified JSON object matching
  this JSON schema"). It becomes shape-agnostic. It is reachable only on
  the degraded arm: `respond` is built exactly when `lowered !== undefined`
  (`:2312–2313`) and the fused text is selected only when
  `respond === undefined` (`:2328`), so today it interpolates the
  annotation source text, never a lowered schema.
- `@<string>` already lowers to the non-object root `{"type":"string"}`
  (`tests/empty-query-annotation.test.ts:908–910`), but no test drives a
  non-object root through the respond-tool registration: both `@<string>`
  fixtures blank the parsed `QueryExpr`'s schema to `""` before driving
  (`tests/off-session-two-phase.test.ts:292` with `:508`,
  `tests/typed-two-phase-live.test.ts:334`). The registration assertion
  that would score it — "the presented respond tool's parameters carry the
  lowered response schema" (`tests/off-session-two-phase.test.ts:831–833`)
  — runs only over an object-root fixture. The enum root is the first
  non-object root to reach that registration under test, so the fix adds
  that coverage.

**Error-severity diagnostic at every position `lowerTypeSource` serves.**
Thread the resolution set — whole-file `schema`/`enum` declarations plus
imported `.thetalib` symbols — through `lowerTypeSource`
(`body-type-lowering.ts:110–131`) and emit at each call site: annotation
root, schema-body fields, inline-object annotation fields, and the
`params:` RHS `$defs` fragments. Emit from the resolution set, not from the
lowering result: `collectBodyTypes` (`theta-document.ts:1108–1117`) maps
alias-form and imported names to `{}` deliberately, *as resolved*, so a
result-shape test would reject legal thetas. The annotation-site check
lands in `parseQuery` (near the bug-0014 gate, `theta-document.ts:3758`) or
in `resolveQuerySchemas`. Error severity follows the bug-0014 precedent —
load refuses the theta — and matches the `params:` posture for the
identical mistake.

**`lowerQueryResponseSchema` stays a total function returning `{}`.** The
seam's contract does not change: an unresolvable named annotation still
lowers to `{}`, and `undefined` remains reserved for the empty annotation
alone. Do not "improve" this. `#validateInvokeReturn`'s early-return arm
(`production-theta-producer.ts:3261`) returns `result` **unvalidated** on
`undefined`, which is strictly worse than `{}` for `invoke<T>`; and
`tests/empty-query-annotation.test.ts:896–911` pins `""` as the sole
unlowerable input ("the seam stays as defence in depth behind the parse
gate"). With the parse gate in place the lowering is unreachable for this
input from source, so the gate is the sole enforcement point.

**Registry.** Widen `theta/parse/unresolved-named-type`
(`docs/spec_topics/diagnostics/code-registry-parse.md:88`) from the
`params:` right-hand side to every `NamedType`-resolution position —
`params:` RHS, `@<T>` annotation, constructor name, schema-body fields. One
row, one message (`unresolved named type '<name>'`), one DIAG-2 amendment
(`diagnostic-shape.md:72`), landing in the same commit as the code. The
existing row description already states the exact predicate ("names no
in-scope `schema`/`enum` declaration or imported `.thetalib` symbol.
Resolution is whole-file"). Do not mint a per-site code and do not widen
`theta/parse/unknown-identifier`. GOV-15's diagnostic-registry carve-out
(`docs/spec_topics/governance/source-language-stability.md:25`) admits the
newly-rejected inputs within a 1.x minor, exactly as bug 0014's
`empty-query-annotation` row was added.

[0025](./0025-ctor-unresolved-schema-name-passthrough.md) widens the same
row for the constructor-name position. The two bugs share one registry
amendment: whichever lands first writes the widened row, and the second
cites it rather than re-editing it. Both need the same imported-symbol
nuance, handled once by the row's whole-file predicate. The code sets are
disjoint (`checkObjectExpr` versus the lowering path), so the fixes are
independently landable.

**Import nuance.** Imported schema names are in scope (`ImportedSymbolKind`
includes `"schema"`, `src/runtime/lexical-environment.ts:109`) but
`MaterializedImport` (`:117–125`) carries no field bodies, so an imported
name counts as *resolved* for the diagnostic while its lowering stays
permissive until the import machinery carries lowered fragments —
otherwise the new error rejects legal thetas.

**Hot-reload interaction: none.** Annotation names never resolve across
`.theta` files (the lowering consults only the theta's own body and its
`.thetalib` imports, materialised in the same parse pass), so the
diagnostic recomputes deterministically per file load and no
discovery-order or reload-order hazard arises.

**Existing tests that encode the permissive contract.** Three green tests
record it as current behaviour; all three keep their assertions, because
the seam still returns `{}`:

- `tests/enum-schema-tag-privacy.test.ts:744–757` (cell f1) calls
  `lowerQueryResponseSchema("NotDeclaredAnywhere", [])` (`:745`), asserts
  `.toEqual({})` (`:749`), and asserts that real AJV admits the forged
  payload. Both assertions survive — the call bypasses the parse gate. Its
  prose ("parse-clean, no diagnostic") goes stale and must be rewritten to
  say the seam is now unreachable from source.
- `tests/query-schema-transitive-defs.test.ts:332–353` (self-reference
  control) and `:355–367` (mutual control) were authored anticipating this
  fix: `:341–342` records that the assertions were chosen to "still hold if
  a later fix lowers the self-reference to a real recursive `$ref`". They
  do. Their comments at `:337–338` record that an invalid nested child
  validates OK today; after the fix
  `{name:"root",children:[{nope:1}]}` must reject, so add that
  depth-enforcement assertion. The fixture comments at `:131–135` and
  `:150–151`, and the module header at `query-schema-lowering.ts:19–21`,
  describe the single-pass permissive behaviour and go stale.
- Baseline verified at HEAD: 53 tests across
  `enum-schema-tag-privacy.test.ts`, `query-schema-transitive-defs.test.ts`
  and `empty-query-annotation.test.ts` pass.

**Test witness — unit, offline, no live provider.** The whole bug is
witnessable at the `parseThetaDocument` / `lowerQueryResponseSchema` /
`runTypedQueryLoop` boundary; the PROBE2/PROBE3 pair in §Reproduction is
the red/green contrast (`outcome.kind === "value"` on a garbage payload is
the red). Required beyond the probes: the AJV compile assertion on the
self-recursive `$ref` document (guards the `pruneDocumentDefs` throw), the
nested-child depth-enforcement assertion above, and one drive of a
non-object (enum) root through the respond-tool registration.

The body-level alias declaration `schema X = A | B` does not parse at the
whole-document level at HEAD (`theta/parse/unsupported-feature`, stray `=`
/ `|`; `skipDeclarationShape` in `theta-document.ts:2269` has no caller) —
[0033](./0033-body-level-schema-alias-unsupported.md). That is why the
alias-annotation case cannot currently arise parse-clean and is absent from
this report's affected enumeration; it is not fixed here.

## Provenance

- Origin: bug 0020 §Fix (0.32.0) residual (iii)
  (`docs/bugs/0020-enum-schema-tags-presence-only-forgeable.md:154–157`):
  "The permissive-`{}` lowering positions remain diagnostic-free
  (`body-type-lowering.ts:130` discards the unresolved list), so the
  admitting surface stays invisible to the author — the ingress this
  report used, unchanged by this fix." The same surface is named in 0020's
  header bullet ("a forged payload passes the QRY-22 gate only through
  permissive `{}` lowering positions … parse-clean, no diagnostic") and
  was first recorded in 0020's Why-it-matters list; bug 0017's trace
  established the bind path it feeds.
- Spec: `docs/spec_topics/query/query-failure-and-repair.md` (QRY-22,
  `:78`; the respond-repair templates, `:49–52`/`:56–59`);
  `docs/spec_topics/query/query-tool-loop.md` (QRY-15, `:24–29`);
  `docs/spec_topics/query/query-forms.md` (QRY-2/QRY-3/QRY-4, the
  safety-net sentence at `:66`); `docs/spec_topics/type-system.md` (named
  types "in scope" `:6`; the uniform type-grammar sentence `:15`;
  §Unresolvable operands `:48`); `docs/spec_topics/schema-subset.md`
  (§Lowering Algorithm step 3, `:74–85`); `docs/spec_topics/schemas.md`
  (§Recursion, `:119–141`);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md` (`:58`, whole-file
  resolution); `docs/spec_topics/diagnostics/code-registry-parse.md`
  (`:88` `unresolved-named-type`, `:73` `empty-query-annotation`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md` (DIAG-2, `:72`);
  `docs/spec_topics/governance/source-language-stability.md` (`:25`, the
  diagnostic-registry carve-out); `docs/spec_topics/invocation.md`
  (§Typed return safety-net sentence, `:30`);
  `docs/spec_topics/tool-calls.md` (`:14`).
- Implementation evidence at `4d645f4f`: `src/parser/params.ts`
  (`:128–138`, `:204`, `:236–291`, `:280–283`);
  `src/parser/body-type-lowering.ts` (`:60`, `:84`, `:110–131`, `:130`,
  `:141–156`); `src/runtime/query-schema-lowering.ts` (`:19–21`, `:48–83`,
  `:91–102`, `:153`, `:207–212`);
  `src/extension/production-theta-producer.ts` (`:2300–2303`, `:2312–2313`,
  `:2328`, `:2615`, `:3260–3261`, `:4903–4917`, `:4920–4922`, `:4932–4936`,
  `:5075–5081`); `src/parser/theta-document.ts` (`:1080–1119`,
  `:2039–2052`, `:2269`, `:3745–3767`);
  `src/runtime/lexical-environment.ts` (`:109`, `:117–125`).
- Test evidence at `4d645f4f`: `tests/enum-schema-tag-privacy.test.ts`
  (`:744–757`); `tests/query-schema-transitive-defs.test.ts` (`:131–135`,
  `:150–151`, `:332–353`, `:355–367`);
  `tests/empty-query-annotation.test.ts` (`:896–911`);
  `tests/off-session-two-phase.test.ts` (`:292`, `:508`, `:831–833`);
  `tests/typed-two-phase-live.test.ts` (`:334`).
- Reproduction: scratch vitest at HEAD (9 probes — parse-clean typo vs
  control, real-loop unvalidated bind vs closed-schema rejection,
  forward/self/reorder lowering triple, declared-enum annotation,
  inline-object field, `params:` contrast, direct-let inferred form), run
  green on the signatures quoted above, then deleted per scratch policy.
