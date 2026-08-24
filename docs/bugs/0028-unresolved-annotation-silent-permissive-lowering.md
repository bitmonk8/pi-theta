# Bug 0028 — A typed-query annotation naming no lowerable declaration — a typo'd/undeclared name, a declared `enum`, or a schema-body forward/self reference — lowers permissively to `{}` with no diagnostic: the QRY-22 gate validates nothing and any payload binds as the typed value

- **Status:** fixed (0.38.0)
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

## Fix (0.38.0)

All of §Fix in one commit (D5): the two-pass lowering, the `params:` hoist, the
enum arm, the respond-tool wire envelope, the boundary coercion and the
diagnostic. Line anchors at the fix commit.

**Whole-file two-pass body-type lowering (`src/parser/body-type-lowering.ts:195–257`).**
`buildBodyTypeSchemas` runs three passes over the body's top-level declarations
where it ran one lowering in declaration order. PASS 1 (`:199`) seeds `bodies`
with a placeholder for every top-level `schema`/`enum` name before any object
body lowers, so `lowerTypeExpr`'s identifier arm resolves every member name and
mints `{ "$ref": "#/$defs/<Name>" }` whatever the declaration order — the
"resolution is whole-file" rule the registry row already states. PASS 2
(`:211`) lowers each body against the fully seeded map, in source order,
mutating the pass-1 placeholder identity in place, so a `$ref` minted while a
body is still lowering points at the object that body becomes. PASS 3 (`:239`)
attaches a flat transitive `$defs` closure (`transitiveDefNames`, `:266`) to
each returned body. Forward, mutual and self references resolve by
construction, and `pruneDocumentDefs`'s DEFECT GUARD
(`src/runtime/query-schema-lowering.ts:230–245`) is satisfied because every
minted `$ref` name carries a registered fragment before the hoist walk runs —
the collision §Fix predicted. Pass 3 is load-bearing for exactly that reason:
with its closure removed the guard throws `references $defs entry '<name>' but
no fragment for it was collected` on the forward, backward and mutual shapes.

**The `params:` document gets the same hoist (`src/parser/params.ts:193`,
`hoistNestedDefs` `:226`).** `parseParams` had no hoist step, so once the
two-pass lowering started minting `$ref`s for the `params:` `$defs` fragments,
a name reachable only *through* another name's nested `$defs` dangled from the
params document root: AJV failed to compile the params document and the raw
`MissingRefError` escaped `dispatch.envelopeValidator()` on the binder path,
after the binder LLM call had already spent tokens. `hoistNestedDefs` is
`pruneDocumentDefs`'s HOIST+STRIP sibling — same queue walk, same first-wins
name dedup, same shallow-clone strip — minus the reachability prune, which is
sound because a params `defs` entry is registered only when a `$ref` is minted.
This also heals the pre-existing backward-chain break: `params: p: Item` where
`Item.loc: Loc` now compiles and rejects `{p:{loc:{nope:1}}}` against `Loc`'s
closed body.

**Enum inclusion (`src/extension/production-theta-producer.ts:4988`).**
`schemaDeclsOf` (`:4977`) gains the sibling `enumDeclsOf`, and both
`lowerQueryResponseSchema` call sites pass it — the typed-query execution path
(`:2310–2311`) and `#validateInvokeReturn` (`:3304–3305`), so `invoke<T>` and
the FN-6 `subagent fn` return boundary converge with the query path.
`@<Severity>` over `enum Severity { Low, High }` lowers to
`{"type":"string","enum":["Low","High"]}` per schema-subset.md §Lowering
Algorithm step 3, where it lowered `{}` before.

**The respond tool is registered with a WIRE ENVELOPE
(`src/runtime/respond-tool-wire.ts`, new).** The §Fix audit that priced the
conveyance as "wording only" was falsified by live evidence during
verification: a tool call's `arguments` are a JSON object at the wire, and the
host validates them against the registered `parameters` before `execute` runs,
so the enum's non-object root rejected every call the model could emit —
`- root: must be string`, `Received arguments: {}` — and the drive repair-spun
past 85 s into `theta/runtime/reload-teardown-timeout` with the invocation
still in flight. The pre-existing `@<string>` path did the same. One recipe now
derives the registered document from the lowered one:

- `respondToolWireSchema` (`respond-tool-wire.ts:91`) returns an
  object-admitting root — and the `{}` total-function residual —
  byte-identically, and carries every other root (`type` excluding `object`, an
  `enum`/`const` literal set, an `anyOf`/`oneOf` union, a root `$ref`) one level
  down under `{"type":"object","properties":{"value":<lowered>},"required":["value"]}`.
  The object-root path — its argument shape, its content-addressed slug, and
  `tests/off-session-two-phase.test.ts`'s registration pin — is untouched: the
  envelope makes an unsatisfiable root satisfiable, it does not rename every
  existing typed query's arguments.
- The lowered document's root `$defs` table moves to the ENVELOPE root, because
  a `#/$defs/<Name>` pointer resolves against the document root alone; left
  under `properties.value` a lowered `array<Item>` root's own pointers dangle.
- The one recipe feeds the on-session registration (`:2644`, `:2648`), the
  off-session `respondToolEntry` (`:5148`), and the QRY-15/QRY-12 template
  input (`:2556`), so the instruction text cannot describe a shape the tool
  rejects. The template BYTES are unchanged — `<schema-json>` carries the
  schema the tool accepts.
- Unwrapping happens at the three arrival sites through one boundary function,
  `respondPayloadFromWire` (`respond-tool-wire.ts:159`): the live `execute`
  (`:2678`), the off-session free-phase servicing (`:4757`), and the forced
  dispatch's extraction (`:5275`). Downstream — the CIO-3 depth walk, the
  QRY-14 `execute` AJV verdict, the QRY-22 loop validation — sees the bare
  payload against the bare lowered schema. A call carrying no `value` member is
  taken verbatim, so it fails validation and enters respond-repair as the
  non-conforming response it is rather than being rewritten to an absent value.
- `renderTypedAwareQueryText`'s fused degraded-arm text becomes shape-agnostic
  ("JSON value"), and the three test files asserting that string move with it.

**Nested `$ref`s are coerced at the boundary (`coerceRespondWireArguments`,
`respond-tool-wire.ts:144`, wired as `prepareArguments` at `:2650`).** The
second live finding: models deliver a nested object or array parameter as a
single JSON-encoded string (`"pet": "{\"species\":\"dog\"}"`), which the host's
own coercion does not parse — the respond tool demanded the object its schema
declares, the call came back as `- pet: must be object`, and the drive spun for
four repair rounds and did not terminate. JSON-string-valued object/array
positions are parsed back before validation: schema-directed (a declared
`string` field whose value looks like JSON keeps its string value),
encoding-only (a parse yielding the wrong JSON type, or a non-JSON string,
passes through so validation still reports the real mismatch), and
`$ref`-following with a chase bound so a recursive fragment graph terminates.
On the on-session path this rides `ToolDefinition.prepareArguments`, pi's own
sanctioned pre-validation shim and the only hook that runs before the host
validates; the two off-session sites apply the same function directly. The
defect is pre-existing — a *backward* reference already minted a `$ref` at HEAD
and hung identically, live-confirmed during verification — but the two-pass
lowering widens it from backward-references-only to every declaration order
plus self and mutual recursion, so it is fixed here.

**Error-severity diagnostic at every position `lowerTypeSource` serves (D3).**
`collectUnresolvedNamedTypes` (`body-type-lowering.ts:303`) walks a type source
against a threaded RESOLUTION SET rather than inspecting the lowering result —
`collectBodyTypes` maps alias-form and imported names to `{}` deliberately, *as
resolved*, so a result-shape test would refuse legal thetas. `checkStructural`
builds the set once (`schemas ∪ enums ∪ imports`, `theta-document.ts:4886–4890`)
and carries it on `StructuralRefs.typeNames`; two new emission sites join the
four-position closed list through the shared builder
`unresolvedNamedTypeDiagnostic` (`:4311`, severity `error`, message
`unresolved named type '<name>'`): the `schema`-body field type (`:5148–5149`,
`walkStatement`) and the `@<T>` annotation root (`:5401–5402`, `walkExpr`,
which also covers the inline-object annotation's fields and the direct-`let`
form whose ascription `parseLet` propagates into `QueryExpr.schema`). The
`params:` RHS keeps emitting from `parseParams` (`params.ts:131–139`) —
`params.ts` is upstream of `theta-document.ts`, so routing it through the
shared builder would close an import cycle; message parity is held by DIAG-4.
Emission is confined to those four positions: `let x: Nope = 1`,
`fn f(a: Nope)`, a union arm and `invoke<Nope>` all stay silent.

**A `Result<T, E>` annotation is peeled to `T`, brace-aware
(`queryResponseAnnotation`, `theta-document.ts:4361`; `RESULT_APPLICATION`
`:4326`).** `QueryExpr.schema` is not always what the author wrote at `@<T>`:
`parseLet` propagates a `let` annotation verbatim onto a bare-query
initialiser, and a query's declared value type is `Result<T, QueryError>`
(QRY-1). Descending that text named the builtin `QueryError` as unresolved and
refused `let r: Result<string, QueryError> = @`…`` — a load refusal naming a
builtin at a grammar-admitted position outside the row's closed list. The peel
returns `T` and checks only that side, so a typo in
`let r: Result<Tirage, QueryError> = @`…`` is still refused with exactly one
diagnostic. Its argument split tracks BRACE depth as well as angle depth
(`splitTopLevel(…, ",", "angle-and-brace")`, `params.ts:361–374`): `ObjectType`
is a `Type` in every position, so an ok side such as `{a: string, b: integer}`
carries a top-level-looking comma that is not an argument boundary. Angle-only
splitting made the peel see three arguments where the grammar sees two, took
the non-arity-2 path, and left the whole `Result<…>` to be descended — an
arbitrary field-count cliff inside one legal form. A non-arity-2 application
yields `undefined` (no response part to check): that is
`theta/parse/generic-arity-mismatch`'s to report, and which argument would have
been `T` is not determinable.

**Unchanged by decision (D1).** `lowerQueryResponseSchema` stays a total
function returning `{}` for an unresolvable named annotation, with `undefined`
reserved for the empty annotation alone. `#validateInvokeReturn`'s
early-return arm returns `result` *unvalidated* on `undefined`, which is
strictly worse than `{}` for `invoke<T>`, and
`tests/empty-query-annotation.test.ts` pins `""` as the sole unlowerable input.
With the parse gate in place the seam is unreachable for this input from
source, so the gate is the sole enforcement point and the seam stays as defence
in depth. No file under `docs/spec_topics/diagnostics/` is touched: bug
[0025](./0025-ctor-unresolved-schema-name-passthrough.md) wrote the widened
`theta/parse/unresolved-named-type` row (`code-registry-parse.md:88`) naming
all four positions, and this fix implements the two the row over-stated,
discharging 0025 §Residuals (i). No new diagnostic code, so
`tests/fixtures/h7a/permitted-codes.json` is unchanged at 10 entries.

**Spec.** `query/query-tool-loop.md` gains normative §**Respond-tool wire
schema** (`#respond-tool-wire-schema`) — the object-root pass-through, the
envelope for every other root, the `$defs`-to-envelope-root rule and its
compile rationale, the wire's object-rooted-`arguments` reason (the same
constraint the binder attachment wrapper exists for), and what stays keyed to
the LOWERED schema (`<slug>`, PIC-44 canonical bytes, the CIO-3 depth walk,
QRY-22 validation) with the payload recovered before both. QRY-14 step 2 in the
same file: `<schema-json>` carries the wire schema and `execute` recovers the
payload, then validates it against the lowered schema.
`query/query-failure-and-repair.md`: the QRY-12 `<schema-json>` definition is
redefined over the wire schema, `<slug>` is pinned to the lowered schema and
never the envelope, and QRY-22's conveyance parenthetical and validate clause
admit the envelope's `value` property. `implementation-notes.md`: `parameters`
is the wire schema (`Type.Unsafe<unknown>(wireJsonSchema)`) and `execute`
recovers the payload before the AJV check. No new REQ-ID.

**Verification.** Default suite 229 files / 2744 tests green; typecheck clean;
lint clean. Doc gates re-run after the spec edits: 92 passed across the
committed-fixture parse gate, live-corpus release gate, closing gate,
warn-only canary and code-registry checks — no un-anchored MUST introduced.

Offline locks. `tests/unresolved-annotation-lowering.test.ts` (new, 40 cells
over `parseThetaDocument`, `lowerQueryResponseSchema`, the real
`runTypedQueryLoop`/`AjvSchemaValidator` composition, the real binder dispatch
and `discoverAndComposeFixtures`): the §Reproduction PROBE2/PROBE3 contrast,
the typo / direct-`let` / inline-object / schema-body emissions, the
forward/self/mutual lowering triple, the AJV **compile** assertion on the
self-recursive `$ref` document, the nested-child depth-enforcement assertions,
the four `params:` hoist shapes plus a real binder-envelope compile, the
enum-root registration, the `Result`-peel cells including the multi-field
brace arm, the DIAG-2 row contract sourced from the parsed registry, and the
totality pins. `tests/respond-tool-wire.test.ts` (new, 24 cells): the wire
recipe over every root class, the `$defs` lift, `prepareArguments` coercion
(schema-directed, encoding-only, `$ref`-following, chase-bounded), and an
on-session drive through the shipped producer whose `PROD-EXECUTE-ENVELOPE`
cell calls the registered `definition.execute` with an enveloped payload and
asserts the bare `"low"` binds. `tests/query-schema-transitive-defs.test.ts`'s
self- and mutual-reference controls are STRENGTHENED with the depth
enforcement the bug doc requires; `tests/enum-schema-tag-privacy.test.ts` cell
f1 keeps both `.toEqual({})` and the AJV-admit assertion with its prose
retargeted to "unreachable from source".

Red direction proven by seven targeted neutralisations, applied and restored
one at a time with the tree re-verified byte-identical after each: the `@<T>`
emission (5 red, `actual diagnostics=[]` — the bug doc's `PROBE1 typo
diagnostics: []`), the schema-body emission (1 red), `enumDeclsOf` (1 red,
`expected {} to deeply equal { type: 'string', …}` — PROBE5), pass-1 seeding
(10 red across forward, self and mutual with separate signatures), pass 3 (16
red, through the DEFECT GUARD the bug doc predicts), the `params:` hoist (5
red, including `can't resolve reference #/$defs/Animal from id #` on the real
binder envelope), and the `Result` peel and its brace-aware split (10 + 1 red,
the builtin `QueryError` falsely named). The envelope's own red direction:
with the `execute` unwrap reverted, `PROD-EXECUTE-ENVELOPE` reds with
`must be string; must be equal to one of the allowed values`.

Live lock — `tests/live/typed-query-wire-shapes.test.ts` (new, H8a): the two
shapes whose conveyance cannot be scored offline, each driven end to end
against a real model and raced against a wall bound that fails loudly naming
the shape (the pre-fix behaviour of both is non-termination, and a test that
hangs to the runner's ceiling reports nothing). `@<Severity>` over a declared
enum — the non-object root — and `@<Owner>` over a FORWARD-declared nested
`schema` — the coerced `$ref`. Scored on deterministic channels: the follow-up
query's rendered text computed by theta code from the BOUND value, an empty
`theta-system-note` fail-closed set, and a `console.error` capture free of
`reload-teardown-timeout`. 2/2 green in 31 s. Live regression: H8a
`live-production-acceptance` 7/7, `double-session-start-live` 1/1, H9a
`noninteractive-acceptance` 10/10 and `ctor-unresolved-load-refusal` 1/1 — no
new stderr line, so bug 0030's empty-capture gate holds.

**Residuals.** (i) The `params:` right-hand side is now the weakest of the four
registered positions for an inline-object interior: `p: {a: Tirage, b: integer}`
raises nothing and lowers `properties.p = {}` whether or not the names inside
resolve, where the identical text at `@<T>` and in a `schema` body names
`Tirage`. The cause sits upstream of `parseParams` — YAML parses the value as a
flow mapping, so `extractParsedParams` (`src/parser/frontmatter.ts:645`,
`isScalar(item.value) ? … : ""`) hands `parseParams` the EMPTY `typeSource` and
the brace text never reaches `lowerTypeExpr` at all, which also blanks the
field's recorded `type` to `""` on the binder-bypass and `system:`
interpolation surfaces. A quoted RHS does reach `lowerTypeExpr` and lands on
its trailing catch-all (`params.ts:339–341`), silent for the same net effect;
the comment at `theta-document.ts:4290–4296` describes only that second path.
Pre-existing (`frontmatter.ts` is untouched by this fix) and symmetric for
brace-under-generic shapes, but this fix makes the position's under-emission
visible by fixing its three siblings. Filed as
[0035](./0035-params-rhs-inline-object-under-emission.md). (ii) A
`Result`-rooted direct-`let` still validates against `{}` at runtime:
`let r: Result<string, QueryError> = @`x`` loads clean, is a typed query, and
`lowerQueryResponseSchema("Result<string,QueryError>")` returns `{}` — through
the real `AjvSchemaValidator` it admits `42`, `"str"`, `null`, `["a"]` and any
object. The peel keeps the load legal by design (D1 keeps the seam total), so
the safety net for this one annotation form is still accept-anything; no
lowered form exists for a `Result` root, and pinning it would need a decision
about whether `Result<T, E>` at a query annotation means "validate `T`". (iii)
A typed `let` whose annotation is `array<T>` and whose initialiser is a bare
query fires a self-identical `theta/parse/let-rhs-type-mismatch`:
`let r: array<string> = @`x`` reports `let binding 'r' initialiser type
mismatch: expected array<string>, got array<string>`.
`src/parser/static-type-inference.ts:255` types a query as
`{kind:"named", name: node.schema}` — the propagated annotation text verbatim —
while `annotationToCompatType` (`src/parser/type-layer-checks.ts:262–266`)
parses the same text into `{kind:"array"}`; the pair is incompatible and
`displayType` renders both operands from one source string. The element type is
irrelevant (brace-carrying or not); a bare inline-object annotation and every
`Result<…>` annotation are silent. Pre-existing — none of the three files
computing it are touched here. (iv) A `params:` RHS carrying a non-empty inline
object nested inside a generic's angle brackets — `p: array<{a: string}>`,
`p: Foo<{a: string}>`, `p: Result<{a: string}, QueryError>` — is not valid YAML
(`BLOCK_AS_IMPLICIT_KEY: Nested mappings are not allowed in compact mappings`),
so FM-5 (`frontmatter.ts:718–722`) discards the partially-recovered document
and the sole diagnostic is `theta/load/missing-mode` —
`frontmatter is missing required field 'mode:'` — with `mode: prompt` literally
present. Field count and the `array` constructor are both irrelevant;
`p: array<{}>` and a top-level `p: {a: string}` parse fine. Pre-existing and
fail-closed, but the diagnostic misnames the cause. (v) Two paraphrases outside
the amended site list are now loose.
`pi-integration-contract/conversation-drive.md:17` says the forced respond
turn inlines "the lowered response schema", that `execute` "AJV-validates its
input against the lowered schema", and that the tool uses "the same
`Type.Unsafe<unknown>(loweredJsonSchema)` `parameters` wrap"; for a non-object
root the runtime inlines and registers the WIRE schema
(`production-theta-producer.ts:2646`, `:2648`) and `execute` recovers `.value`
before validating (`:2678`). That bullet delegates to QRY-14, which
§Respond-tool wire schema now states precisely.
`pi-integration-contract/extension-bootstrap-and-per-theta.md:77` says theta's
repair operates at the response-validation boundary "rather than at this
per-call argument boundary"; the respond tool now carries a `prepareArguments`
coercion at that exact boundary (`:2650`). (vi) Inherited from 0025
§Residuals (iv)/(v) and now reachable from the two positions this fix adds. A
block-nested `schema`/`enum` declaration is still accepted with no diagnostic
although resolution is top-level-only, so `if true { schema S { x: number } }`
plus `@<S>` reports `unresolved named type 'S'` with the declaration in view —
and so does `schema T { s: S }` — while the nested declaration itself stays
silent for both `schema` and `enum`. Import/local name-collision precedence
remains undefined and uncovered by any diagnostic; at the new positions it does
not change the diagnostic (`checkStructural` flattens `schemas ∪ enums ∪
imports` into one `typeNames` set, so either side resolving suffices) but the
lowering silently takes the LOCAL declaration, since both
`lowerQueryResponseSchema` call sites pass only the importing file's own decls.
(vii) 0025's §Fix cites the shared message literal as `src/parser/params.ts:133`;
this fix's `params.ts` edits move it to `:137`. Citation drift in a shipped bug
document, left for whoever next edits that page.

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

**A bare enum at the annotation root is legal, and the respond tool is
registered with a wire envelope.** `type-system.md:15` applies one type
grammar to the `@<T>` position and `schema-subset.md:80` pins the enum
emission, so `@<Severity>` lowers to its non-object root rather than being
refused. A tool call's `arguments` are a JSON **object** at the wire, and
the host validates them against the registered `parameters` document before
the theta side sees them (pi-agent-core's agent loop: `prepareArguments`,
then pi-ai's `validateToolArguments`, then `execute`), so a non-object root
registered verbatim rejects every possible call — `- root: must be string`,
`Received arguments: {}` — and the model repair-spins until the invocation
is torn down (`theta/runtime/reload-teardown-timeout`, invocation still in
flight). The pre-existing `@<string>` path has the same defect.

The respond tool is therefore registered with a single-property envelope,
`{"type":"object","properties":{"value":<lowered>},"required":["value"]}`,
validated as the envelope and unwrapped to `.value` as the candidate
payload. Every root shape becomes conveyable and the `@<string>` hang
retires in the same change. Shape:

- The envelope applies **only where the lowered root is not already an
  object**: an object root (and the total-function `{}` residual) is
  registered byte-identically, so the shipped object-root path — its
  argument shape, its content-addressed slug, and
  `tests/off-session-two-phase.test.ts:831–833`'s registration pin — is
  untouched. The envelope exists to make an unsatisfiable root
  satisfiable, not to rename every existing typed query's arguments.
- `$defs` is lifted to the **envelope** root: `#/$defs/<Name>` pointers
  resolve against the document root and nowhere else, so a lowered
  `array<Item>` root's refs would dangle under `properties.value.$defs`.
- One recipe (`respondToolWireSchema`, `src/runtime/respond-tool-wire.ts`)
  feeds `#registerRespondTool` / `respondToolEntry`
  (`production-theta-producer.ts:2615`, `:5079`), the QRY-15 initial
  template (`:2543`) and the QRY-12 follow-up templates
  (`typed-query-validation.ts`), so the instruction text cannot describe a
  shape the tool rejects. The QRY-12/QRY-15 template BYTES are unchanged —
  `<schema-json>` carries the schema the tool accepts.
- The unwrap happens at the three arrival sites, all through one boundary
  function (`respondPayloadFromWire`): the live `execute`
  (`#executeRespondTool`), the off-session free-phase servicing
  (`#serviceHeldCall`), and the forced dispatch's extraction
  (`dispatchForcedRespondTurn`). Downstream — the CIO-3 depth walk, the
  QRY-14 `execute` AJV verdict, the QRY-22 loop validation — sees the bare
  payload against the bare lowered schema, exactly as before.
- `renderTypedAwareQueryText` (`:4912–4916`, "Respond with ONLY a single
  minified JSON object matching this JSON schema") becomes shape-agnostic
  ("JSON value"). It is reachable only on the degraded arm: `respond` is
  built exactly when `lowered !== undefined` (`:2312–2313`) and the fused
  text is selected only when `respond === undefined` (`:2328`).
- `@<string>` already lowers to the non-object root `{"type":"string"}`
  (`tests/empty-query-annotation.test.ts:908–910`), and no shipped test
  drove a non-object root through the respond-tool registration: both
  `@<string>` fixtures blank the parsed `QueryExpr`'s schema to `""` before
  driving (`tests/off-session-two-phase.test.ts:292` with `:508`,
  `tests/typed-two-phase-live.test.ts:334`), and the registration pin at
  `tests/off-session-two-phase.test.ts:831–833` runs over an object-root
  fixture. The enum root is the first non-object root to reach that
  registration under test, so the fix adds that coverage — offline over the
  registered bytes and the `execute` boundary, and LIVE end to end.

**Nested named-schema `$ref`s are coerced at the boundary.** Models deliver
a nested object or array parameter as a single JSON-encoded string
(`"pet": "{\"species\":\"dog\"}"`), which the host's own coercion does not
parse: the respond tool demands the object its schema declares, the call is
fed back as `- pet: must be object`, and the drive spins. JSON-string-valued
object/array positions are therefore parsed back at the boundary before
validation — schema-directed (a declared `string` field whose value looks
like JSON keeps its string value), encoding-only (a parse that yields the
wrong JSON type, or a non-JSON string, passes through so validation still
reports the real mismatch), and `$ref`-following with a chase bound so a
recursive fragment graph terminates. On the live on-session path this rides
`ToolDefinition.prepareArguments`, pi's own sanctioned pre-validation shim
(its `edit` tool uses it for the identical model behaviour) and the only
hook that runs before the host validates; the two off-session sites apply
the same function directly. This defect is pre-existing — a *backward*
reference already minted a `$ref` at HEAD and hung identically, and bug 0004
recorded the annotation arm as "verified at the lowering level; not
exercised live" — but the two-pass lowering widens it from
backward-references-only to every declaration order plus self and mutual
recursion, so it is fixed here rather than deferred.

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

**Test witness — offline for the lowering and the wire contract, LIVE for
the conveyance.** The lowering half is witnessable at the
`parseThetaDocument` / `lowerQueryResponseSchema` / `runTypedQueryLoop`
boundary; the PROBE2/PROBE3 pair in §Reproduction is the red/green contrast
(`outcome.kind === "value"` on a garbage payload is the red). Required
beyond the probes: the AJV compile assertion on the self-recursive `$ref`
document (guards the `pruneDocumentDefs` throw), the nested-child
depth-enforcement assertion above, the registered-bytes and
`prepareArguments`/`execute` coverage of the envelope and the coercion, and
one drive of a non-object (enum) root through the respond-tool
registration.

The conveyance half cannot be scored offline: the lowered bytes are correct
in both the broken and the fixed state, and what differs is whether a REAL
model can produce a call the host accepts. Both wire shapes therefore carry
a live twin (`tests/live/typed-query-wire-shapes.test.ts`) — `@<Severity>`
over a declared enum, and `@<Owner>` over a FORWARD-declared nested
`schema` — each driven end to end and scored on deterministic channels: the
follow-up query's rendered text (computed by theta code from the BOUND
value), an empty `theta-system-note` fail-closed set, and a `console.error`
capture free of `reload-teardown-timeout`. Each drive is raced against a
wall bound that fails loudly naming the shape, because the pre-fix
behaviour of both is non-termination and a test that hangs to the runner's
ceiling reports nothing.

The body-level alias declaration `schema X = A | B` does not parse at the
whole-document level at HEAD (`theta/parse/unsupported-feature`, stray `=`
/ `|`; `skipDeclarationShape` in `theta-document.ts:2269` has no caller) —
[0033](./0033-body-level-schema-alias-unsupported.md). That is why the
alias-annotation case cannot currently arise parse-clean and is absent from
this report's affected enumeration; it is not fixed here. (0033's fix,
0.45.0, made the declaration parse and the alias annotation resolve
concretely — an alias name at `@<T>` and on the `params:` RHS lowers to a
`$ref` rather than joining this report's permissive-`{}` set; pinned by
0033's witness.)

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

## Coordination note — §Residuals (iv) discharged by bug 0263 (0.262.0)

Residual (iv)'s class — a `params:` right-hand side carrying an inline object
inside a generic's angle brackets (`p: array<{a: string}>`), rejected by the
YAML parser under `BLOCK_AS_IMPLICIT_KEY`, collapsing the whole frontmatter at
FM-5 and reported as `theta/load/missing-mode` with `mode: prompt` literally
present — is filed and fixed as bug
[0263](./0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md).
That fix reports the parser's verdict as itself under the new
`theta/load/malformed-frontmatter-yaml` row, keyed to the first reported error
whatever its class, so the residual's `BLOCK_AS_IMPLICIT_KEY` spelling now
draws a located diagnostic naming the position, the offending source line and
the `params:` field. The refusal remains fail-closed; only the diagnostic
changed. Residual (iv) is discharged; the other residuals recorded here are
untouched.
