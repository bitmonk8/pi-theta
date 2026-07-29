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
  accepts it parse-clean (zero diagnostics, byte-identical load outcome to
  the correct spelling), marks the query typed, and validates the response
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
- **Affected** (at HEAD `b542dafe`, 0.32.0):
  - `src/parser/params.ts:280–283` — `lowerTypeExpr`'s unresolved arm:
    an identifier not in `bodyTypeMap` pushes onto `lowerCtx.unresolved`
    and returns `{}`. The one consumer that reads the list back is
    `parseParams` (`params.ts:128–137`), which emits
    `theta/parse/unresolved-named-type` (E) per name — the contrast arm.
  - `src/parser/body-type-lowering.ts:130` — `lowerTypeSource` constructs
    `unresolved: []` and never reads it back: every unresolved name
    collected below this call is discarded. All non-`params:` lowering
    routes through here (`lowerObjectFields` :60, `lowerInlineObject` :84,
    `buildBodyTypeSchemas` :141).
  - `src/runtime/query-schema-lowering.ts:48` (`lowerQueryResponseSchema`)
    and `:91–104` (`buildBodyTypeMap`) — the typed-query / `invoke<T>`
    lowering. `buildBodyTypeMap` is single-pass in declaration order
    (a schema's fields lower against a map containing only earlier decls,
    so forward and self references lower `{}`) and skips field-less decls;
    the module header (`:20–24`) states the permissive posture as
    implementation commentary with no spec counterpart.
  - `src/extension/production-theta-producer.ts:2300–2303` — the typed-query
    execution path lowers `expr.schema` against `schemaDeclsOf(...)`
    (`:4920–4922`, `kind === "schema"` only — enum decls are dropped, so a
    declared-enum annotation is unresolvable here by construction);
    `:3260` — `#validateInvokeReturn` routes `invoke<T>` (and the
    `subagent fn` return boundary, FN-6) through the same lowering, so the
    same `{}` validates the child's `Ok` payload.
  - `src/parser/theta-document.ts:1080–1118` (`collectBodyTypes`) — the
    `params:` `$defs` fragments come from the same single-pass
    `buildBodyTypeSchemas`, so a schema body's forward/self reference is a
    silent `{}` inside an otherwise-diagnosed `params:` document; alias-form
    and imported names are deliberately mapped to `{}` (comment at
    `:1102–1106`) — resolved, so no diagnostic, and equally silent.
- **Observed at:** `0.32.0` (`b542dafe`). Offline, deterministic; no live
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

All offline, at `b542dafe`. Scratch vitest (written, run, deleted): the
real document parse (`parseThetaDocument` with the production-shaped deps)
plus the real typed-query loop (`runTypedQueryLoop` +
`buildTypedQueryValidation` + `AjvSchemaValidator`, composed exactly as
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
PROBE1 control diagnostics: []            // @<Triage> — byte-identical load outcome

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
`Err(QueryError { kind: "validation", cause: "schema_validation" })`.

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
object-schema control `@<Cat>` lowers closed. Inline-object annotation:
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
  step 3: the closed per-form emission table — named/inline schema
  reference → `{ "$ref": "#/$defs/<Name>" }`; enum → `{ "type": "string",
  "enum": [...] }`. No `{}` emission exists for any form.
- [schemas.md §Recursion](../spec_topics/schemas.md#recursion): "Any
  reference to a named schema lowers to `$ref` against the file's `$defs`.
  Self- and mutual recursion are supported transparently" — the normative
  example's `pets: array<Animal>` is a forward reference.
- [type-system.md](../spec_topics/type-system.md): a named type is "any
  schema or enum identifier **in scope**"; "The same type grammar applies
  in every type-annotation position: schema fields, frontmatter `params:`,
  `let x: T`, function parameters, and `@<T>`…`` explicit query schemas."
  §Unresolvable operands pins the compensation contract for every skipped
  static check: "the parse-time check is skipped and the runtime AJV check
  is the safety net."
- [code-registry-parse.md](../spec_topics/diagnostics/code-registry-parse.md):
  `theta/parse/unresolved-named-type` (E) — "Resolution is whole-file, so a
  frontmatter-to-body forward reference is not itself a failure" (the
  posture that distinguishes forward references from typos);
  `theta/parse/empty-query-annotation` (E) — the bug-0014 row whose trigger
  rationale ("accepted silently it would mark the query typed while giving
  the runtime nothing to validate the response against") describes the
  typo'd annotation equally. No spec sentence promises a diagnostic for an
  undeclared annotation name — the registries were searched; that absence
  is why class (2) is "together fail to deliver" rather than a missing
  promised feature.

Expected concretely: forward/self references lower to `$ref` regardless of
declaration order; a declared-enum annotation lowers to its wire-value
`enum`; a name resolving to no declaration whole-file is an author-visible
diagnostic, not a silent accept-anything validator.

## Actual behaviour / root cause

`lowerTypeExpr` (`params.ts:265–289`) has one unresolved arm: push the name
onto `ctx.unresolved`, return `{}`. Whether that becomes a diagnostic is
decided entirely by which caller built the context. `parseParams` reads the
list and errors; `lowerTypeSource` (`body-type-lowering.ts:130`) builds a
fresh list and discards it, and every other lowering site sits above
`lowerTypeSource`. Three independent resolution gaps then feed the arm:

1. `buildBodyTypeMap` / `buildBodyTypeSchemas` lower schema bodies
   single-pass in declaration order, so a field's forward or self reference
   looks up a map entry that does not exist yet (`query-schema-lowering.ts:
   91–104`, `body-type-lowering.ts:141–156`).
2. `schemaDeclsOf` (`production-theta-producer.ts:4920`) filters
   `kind === "schema"`, so enum decls never reach the typed-query /
   `invoke<T>` lowering at all.
3. A name declared nowhere resolves against nothing by definition; no
   parse-, load-, or runtime-phase check exists at the annotation position
   (`parseQuery` checks only emptiness; `resolveQuerySchemas` /
   `checkExplicitSchemaMismatch` skip unresolvable sides by design).

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
- The "AJV is the safety net" posture is cited across query-forms.md,
  type-system.md, invocation.md, and tool-calls.md as the justification
  for skipping static checks; each citation silently assumes the net is
  the declared schema, not `{}`.

## Fix options and recommendation

1. **Conformant lowering + error diagnostic for whole-file-unresolvable
   names (recommended).** Three coordinated parts:
   - *Whole-file two-pass body-type lowering*: seed the name set with every
     top-level `schema`/`enum` declaration before lowering any body, and
     emit `{ "$ref": "#/$defs/<Name>" }` for member names (registering the
     fragment when it lowers), so forward and self references resolve by
     construction — the exact distinction-from-typos rule
     `theta/parse/unresolved-named-type` already documents ("Resolution is
     whole-file"). Recursive `$ref`s are within the pinned subset
     ("`$defs` + `$ref`, including recursive references");
     `pruneDocumentDefs` already walks nested defs with a cycle guard, and
     the runtime depth cap bounds recursive data.
   - *Enum inclusion*: pass enum decls into `lowerQueryResponseSchema` (the
     `params:` path already lowers them via `buildBodyTypeSchemas`; the
     query path drops them at `schemaDeclsOf`).
   - *Error-severity diagnostic* at the annotation site for a name that
     resolves to no top-level declaration and no imported symbol — either
     widening the `theta/parse/unresolved-named-type` row beyond `params:`
     or a sibling code (e.g. `theta/parse/unresolved-query-annotation`).
     The parse table is closed (DIAG-2), so the row amendment and the
     implementation must move together — a GOV-15 diagnostic-registry
     carve-out, admissible in a 1.x minor, exactly as bug 0014's
     `empty-query-annotation` row was added. Error severity follows the
     0014 precedent (load refuses the theta), matching the `params:`
     posture for the identical mistake.
   Import nuance to carry with the fix: imported schema names are in scope
   (`ImportedSymbolKind` includes `"schema"`) but `MaterializedImport`
   carries no field bodies, so an imported name must count as *resolved*
   for the diagnostic while its lowering stays permissive until the import
   machinery carries lowered fragments — otherwise the new error would
   reject legal thetas. Hot-reload interaction: annotation names never
   resolve across `.theta` files (the lowering consults only the theta's
   own body and its `.thetalib` imports, materialised in the same parse
   pass), so the diagnostic recomputes deterministically per file load and
   no discovery-order or reload-order hazard arises.
2. **Warn-severity load diagnostic on every permissive lowering** (interim,
   weaker): read the discarded list at `lowerTypeSource`'s call sites and
   emit a W naming the position and the name ("response schema for
   `@<Tirage>` lowered without validation: unresolved name 'Tirage'").
   Registry precedents for warn-severity degraded-validation signals
   exist (`theta/parse/empty-template`,
   `theta/load/binder-model-strict-capability-unknown`). The theta still
   registers, so the QRY-22 gutting and the §Recursion non-conformance
   remain; acceptable only as a stopgap that makes the surface visible
   (and it depends on the bug-0013 fix keeping load warnings deliverable).
3. **Runtime rejection** (bind `Err` when the lowered root is `{}` due to
   an unresolved name): rejected — it moves an authoring error to a
   runtime failure far from the site, penalises every invocation instead
   of the one load, and bug 0014 already chose parse rejection for the
   adjacent degraded arm.

Adjacent, out of scope, recorded here for the next allocator: the
alias-form declaration `schema X = A | B` does not parse at the
whole-document level at HEAD (`theta/parse/unsupported-feature`, stray
`=` / `|`; `skipDeclarationShape` in `theta-document.ts:2269` has no
caller) although schemas.md and the registry (`theta/parse/type-alias-cycle`,
`by`-form rows) specify it — which is why the alias-annotation case cannot
currently arise parse-clean and is excluded from this report's affected
enumeration.

## Provenance

- Origin: bug 0020 §Fix (0.32.0) residual (iii)
  (`docs/bugs/0020-enum-schema-tags-presence-only-forgeable.md`): "The
  permissive-`{}` lowering positions remain diagnostic-free
  (`body-type-lowering.ts:130` discards the unresolved list), so the
  admitting surface stays invisible to the author — the ingress this
  report used, unchanged by this fix." The same surface is named in 0020's
  header bullet ("a forged payload passes the QRY-22 gate only through
  permissive `{}` lowering positions … parse-clean, no diagnostic") and
  was first recorded in 0020's Why-it-matters list; bug 0017's trace
  established the bind path it feeds.
- Spec: `docs/spec_topics/query/query-failure-and-repair.md` (QRY-22,
  `:78`); `docs/spec_topics/query/query-forms.md` (QRY-2/QRY-3/QRY-4, the
  safety-net sentence); `docs/spec_topics/type-system.md` (named types "in
  scope"; the uniform type-grammar sentence; §Unresolvable operands);
  `docs/spec_topics/schema-subset.md` (§Lowering Algorithm step 3, `$defs`
  reuse bullet); `docs/spec_topics/schemas.md` (§Recursion);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md` (`:58`, whole-file
  resolution); `docs/spec_topics/diagnostics/code-registry-parse.md`
  (`unresolved-named-type`, `empty-query-annotation`, the W-severity
  precedents); `docs/spec_topics/diagnostics/diagnostic-shape.md` (DIAG-2);
  `docs/spec_topics/invocation.md` (§Typed return safety-net sentence).
- Implementation evidence at `b542dafe`: `src/parser/params.ts`
  (`:128–137`, `:204`, `:265–289`); `src/parser/body-type-lowering.ts`
  (`:60`, `:84`, `:110`, `:130`, `:141–156`);
  `src/runtime/query-schema-lowering.ts` (`:20–24`, `:48–86`, `:91–104`);
  `src/extension/production-theta-producer.ts` (`:2300–2303`, `:3260`,
  `:4920–4922`, `:4931–4936`); `src/parser/theta-document.ts`
  (`:1080–1118`, `:2039–2052`, `:2269`, `:3745–3768`);
  `src/runtime/lexical-environment.ts` (`:109`, `:117–125`).
- Reproduction: scratch vitest at HEAD (9 probes — parse-clean typo vs
  control, real-loop unvalidated bind vs closed-schema rejection,
  forward/self/reorder lowering triple, declared-enum annotation,
  inline-object field, `params:` contrast, direct-let inferred form), run
  green on the signatures quoted above, then deleted per scratch policy.
