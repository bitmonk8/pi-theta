# Bug 0160 — `grammar.md:109` assigns `theta/parse/wire-name-collision` and `theta/parse/redundant-wire-name` "within the one inline object", but `TypeParser.parseObject` breaks its field loop at the `as` token, so no `Type` position parses the rename and neither code can fire there: `@<{a as "w": integer, b as "w": string}>` loads with zero diagnostics and lowers two properties keyed `a as "w"` and `b as "w"` where the declaration spelling of the same two fields is refused, `@<{a as "a": integer}>` draws no redundant-rename warning, the identical-rename spelling mints `required: ["a as \"w\"", "a as \"w\""]` at the annotation root — the duplicate-`required` document AJV refuses to compile, which bug 0052's fix closed for plain names — and the break also suppresses every type-grammar check on every field written behind the rename

- **Status:** fixed (0.172.0). Residual 2 of the bug 0052 fix (0.84.0, commit
  `f856fd33`), recorded there as `## Fix (0.84.0)` *Residuals* item 2 and left
  unfiled for the parent. 0052's own §Non-goals had already declared it "a
  separate defect on the same sentence, unfiled". §Fix here is
  constraint-pinned, not settled: the routes are enumerated with their measured
  consequences and the disposition is left to the run.
- **Sev/Diff estimate:** S1/D3 — S1 on the letter ("inputs accepted that the
  spec refuses … with no diagnostic, declared constraints not enforced"), met
  on a production path: §Reproduction (a) rows G1/G2/G4 load and register two
  inputs whose declaration spellings are refused (G3) and warned (G5), and
  §Reproduction (c) measures the resulting property keys — text containing a
  space and two `"` characters — inside the `$defs` entry
  `production-theta-producer.ts:726` hands the binder and inside the
  response-schema root `:2330` hands the respond tool, with no diagnostic on
  any channel. §Reproduction (d) measures the duplicate-`required` root that
  AJV refuses to compile, alive at this spelling after 0052 closed it for plain
  names. D3 on three counts §Fix names: the fix needs an in-run adjudication of
  the inline `Field` form that 0052 §Non-goals bounded and 0154 §Fix (a) also
  turns on; whichever route it takes moves eight already-registered emissions
  measured in §Reproduction (e), against pinned-byte witness cells in
  `tests/inline-object-duplicate-field-name.test.ts`; and the rename's lowered
  form is a `properties`-key change against two standing lowering freezes.
- **Kind:** defect, three elements on one spec sentence.
  1. *A prescribed check pair is unimplemented for the inline spelling.*
     `docs/spec_topics/grammar.md:109` states that an `ObjectType`'s fields
     "reuse the same `Field` form as an object-schema body and carry the same
     field semantics", that "a field may attach an optional `as "WireName"`
     rename", and that "the `theta/parse/wire-name-collision` and
     `theta/parse/redundant-wire-name` diagnostics apply within the one inline
     object". `docs/spec_topics/schemas.md:44` makes two fields sharing a wire
     name the first code and `:45` makes a rename to the theta-side name the
     second. Neither fires inside an inline object body at any `Type` position
     (§Reproduction (a), (b)), and neither can: the rename is never recognised
     there.
  2. *The unparsed rename becomes the wire property name verbatim.* The two
     lowerers split each field at its first top-level colon and take the whole
     pre-colon text as the name (`body-type-lowering.ts:166`,
     `params.ts:682`), so `a as "w"` is the property key and the `required`
     entry (§Reproduction (c)). The rename is therefore not merely uncheckable
     inline — it is unusable: `docs/spec_topics/schemas.md:39` names it "the
     only mechanism for expressing schemas whose property names are not
     theta-identifier-compatible", and an author who writes that mechanism in
     an inline object gets a property name containing a space and two `"`
     characters instead of the one they wrote.
  3. *The stop the rename hits suppresses every other check on the same walk.*
     `TypeParser.parseObject` (`type-grammar.ts:504`) reads the field name,
     then requires `:` at `:535`; the rename's `as` fails that test and
     `break`s the field loop (`:537`). Nothing behind the rename is parsed, so
     `theta/parse/void-in-non-return-position`,
     `theta/parse/empty-schema-body`, `theta/parse/generic-arity-mismatch`,
     `theta/parse/result-in-schema-position` and 0052's own
     `theta/parse/duplicate-inline-field-name` all go silent on fields written
     behind a rename, and — because the break also leaves the body's `}`
     unconsumed — on the enclosing bodies too (§Reproduction (e)).
- **Related:**
  - [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md) —
    **fixed (0.84.0)**, the filing origin and the owner of this report's
    boundary. Its §Non-goals states the subject in terms ("Fixtures G1–G2 show
    it is not parsed at all … That is a separate defect on the same sentence,
    unfiled") and bounds its own §Fix constraint 4 with it ("a fix that reuses
    `checkObjectSchema`'s field shape must first have a field parse that
    understands `as`"). Its `## Fix (0.84.0)` *Residuals* item 2 records the
    settled reading this report starts from: the rename is one of the shipped
    rule's stops, so two distinct rename texts are two names as written and
    `{a as "w": integer, a as "x": string}` is silent by design. Its
    §Reproduction group (7) is the origin of fixtures G1–G5, re-derived
    byte-exact here. Its shipped registry row states the exclusion normatively
    (`code-registry-parse.md:87`: "an `as "WireName"` rename is one of the
    stops above, the inline `Field` form not parsing that clause"), so the row
    and this report agree; it is `grammar.md:109` that does not.
  - [0159](./0159-inline-field-name-stop-masks-duplicate.md) — **open**, filed
    in the same batch, 0052 *Residuals* item 1 (a stop position masks a
    duplicate and keeps the AJV-throw class reachable). Its §Related identifies
    the break this report owns as its own missing-`:` stop read for a different
    code, and its §Non-goals cedes the rename — the identical-rename shape and
    the unparsed rename generally — here. Its §Fix route (a), the tokenisation
    branch 0052 §Fix constraint 4 names, re-keys the rule onto raw pre-colon
    text: that closes the identical-rename duplicate this report measures at
    §Reproduction (d) (`a as "w"` twice is one raw text twice) and it re-pins
    cell d4 row 1 if it lands. It delivers **no** wire-name semantics — G1's
    two fields carry two *different* raw texts and one *shared* wire name, so
    that route leaves §Reproduction (a) exactly as measured. The two reports
    must not both re-pin cell d4 without the second recording the first's
    ruling.
  - [0161](./0161-quoted-inline-field-name-not-a-field.md) — **open**, filed in
    the same batch, 0052 *Residuals* item 3 (a quoted field name is not a
    `Field`). Same substrate, same tokenisation route, and the same open
    question about what the inline `Field` form admits; the adjudications
    should agree.
  - [0154](./0154-inline-object-type-field-name-rules-unenforced.md) — **open**,
    the same parser leaf under the identifier rules. Its §Fix (a) route 3
    already names "a check reading names from [the lowerers' split] must state
    what it does with a name containing ` as `", and its §Non-goals leaves the
    rename with 0052, which files it here. Its Ident-keyed rule is blind at a
    rename position for the same reason this report's codes are: `a as "w"` is
    not an identifier, so a case rule reading the lowerers' pre-colon text
    would test the wrong string. Coordinate on the field-parse decision;
    neither report absorbs the other, and the two rules are disjoint (a first
    letter versus a wire name).
  - [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) —
    **fixed (0.57.0)**, the first rule wired through `walkType`'s `object` arm
    and the precedent for a declaration-ranged emission at this seam. Its
    §Non-goals reserves the malformed-but-non-empty interior family ("widening
    the inline rule to these shapes needs its own spec decision"), which is the
    reservation 0052's residual 1 invokes and which a rename-aware field parse
    partly discharges: §Reproduction (e) measures its own rule going silent
    behind a rename (row S5).
  - [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
    — **fixed (0.49.0)**, the origin of the shared hoist and of the `params:`
    byte freeze that constrains any lowering change here.
  - [0035](./0035-params-rhs-inline-object-under-emission.md) — **fixed
    (0.44.0)**, the freeze's lock (`tests/params-inline-object-lowering.test.ts`,
    37 cells).
  - [0093](./0093-let-annotation-query-position-double-emission.md) — **open**,
    owner of the compound-position double emission any new code on this walk
    inherits at a `let` annotation over a query initialiser.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class covering the positional drift any fix here
    induces in `type-grammar.ts`.
- **Affected** (every citation verified at HEAD `f856fd33`, 0.84.0):
  - **The spec sentence and its mirrors.**
    `docs/spec_topics/grammar.md:101` — `ObjectType ::= "{" Field ("," Field)*
    ","? "}"`, with `// Field per Schema Declarations`; `:109` — §"Inline
    object types", the sentence naming the rename and both diagnostics "within
    the one inline object"; `:172` — `SchemaShape`, the object form whose
    `Field` the inline form is said to reuse.
    `docs/spec_topics/schemas.md:21` §"Wire-name renaming"; `:23` — "A field
    declaration may attach an explicit wire name with `as "WireName"` between
    the field identifier and its type"; `:39` — the only-mechanism sentence;
    `:43` — the string-literal rule; `:44` — the collision rule; `:45` — the
    redundant-rename rule. `docs/spec_topics/type-system.md:15` — position
    invariance. `docs/spec_topics/schema-subset.md:78` — `properties` and
    `required` are keyed by wire names; `:87` — the per-schema wire-name
    translation sidecar.
    Mirrors: `docs/reference/grammar.md:190` (the production) and `:203–208`
    (the bullet, which asserts the `Field`-form reuse and names no rename);
    `:66–70` ("The lowercase-first rule applies to the theta-side field name;
    the wire name (`as "WireName"`) may be any string");
    `docs/reference/schema-subset.md:47–54` (the wire-name-renaming block).
  - **The registered rows.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:84` —
    `theta/parse/redundant-wire-name`, severity `W`, *Trigger* "`field as
    "field"` rename whose wire name equals the theta-side name.", *Message*
    `redundant 'as' clause: wire name '<name>' equals the theta-side name`;
    `:85` — `theta/parse/wire-name-collision`, severity `E`, *Trigger* "Two
    fields in the same schema share a wire name, or a wire name collides with
    another field's theta-side name.", *Message* `wire name '<name>' collides
    with another field on schema '<schema>'`. Neither *Trigger* is written with
    a position qualifier; `grammar.md:109` is what places them inside an inline
    object. `:87` — `theta/parse/duplicate-inline-field-name`, 0052's shipped
    row, whose *Trigger* states the exclusion this report measures. Mirrors
    without a *Trigger* column: `docs/reference/diagnostics.md:133`, `:134`,
    `:136`.
    `<schema>` is identifier-shaped and an inline object has no name, which is
    the placeholder problem 0052's §Fix (0.84.0) record settled for its own row
    by minting a new one; §Fix (d) here re-opens it for these two.
  - **The parse leaf, and the exact token the loop stops on.**
    `src/parser/type-grammar.ts:504` — `TypeParser.parseObject`. `:528–534`
    reads the field-name token and consumes it when its kind is `ident`;
    `:535–537` requires `:` immediately behind it and `break`s the whole field
    loop otherwise — this is the token the rename fails on; `:544–546` pushes
    the retained name; `:547` parses the field type; `:555–561` is an
    `as "WireName"` skip positioned AFTER the field type, so it matches
    `{a: integer as "w"}` and never the `Field` form `grammar.md:101` and
    `schemas.md:23` define; `:566` consumes the closing brace, which the break
    leaves unreached; `:567–574` builds the node. The `TypeNode` object variant
    (`:160–254`) carries `fieldTypes` and `fieldNames` and no wire-name slot.
    `carriesUnclosedInterior` (`:378`) is what propagates the unconsumed brace
    to the enclosing body's name list.
  - **The declaration-side rename parse, which has no inline counterpart.**
    `src/parser/theta-document.ts:2589` — `parseSchemaObjectBody`; `:2618–2631`
    consumes `as` plus its string literal and records `wireName` before `:2632`
    requires the colon; `:2672–2676` pushes the `SchemaFieldSource`.
    `SchemaFieldSource` (`:538–548`) is the only field record in the parser
    carrying a `wireName`.
    `src/parser/schema-declarations.ts:87` — `checkObjectSchema`, reached only
    from `theta-document.ts:6289–6301` (a `schema` object body) with fields
    mapped to `{ thetaName, wireName? }`. Its redundant-rename loop is
    `:102–113` and its collision loop `:119–154`, comparing `wireName ??
    thetaName` (`:125`, `:134`) and emitting at `:104–111` and `:145–151`. No
    inline object body reaches either.
  - **The two inline lowerers, and the field record that has no rename slot.**
    `src/parser/body-type-lowering.ts:153` — `lowerInlineObject`; `:161` splits
    on `splitTopLevel(body, ",", "angle-and-brace")`; `:166` takes the name as
    `entry.slice(0, colon).trim()`; `:167` the type source. It returns through
    `lowerObjectFields` (`:109`), whose writes are `:120` and `:128`.
    `src/parser/params.ts:670` — `hoistInlineObjectType`; `:677` the same
    split; `:682` the same pre-colon slice; `:687`/`:688` the two writes.
    `LowerableField` (`body-type-lowering.ts:57–60`) is `{ name, typeSource }`
    — there is no wire-name field on the inline path at all, so
    `buildSidecar`'s wire-name translation entries
    (`src/parser/schema-lowering.ts:243–261`, `:249–250`) are empty for an
    inline body under every input.
  - **The wire surfaces the malformed keys reach.**
    `src/runtime/query-schema-lowering.ts:113` — `lowerQueryResponseSchema`;
    `:153` hands a brace-rooted annotation to `lowerInlineObject` and returns
    its fragment as the compiled document's root.
    `src/runtime/respond-tool-wire.ts:91–94` — an object root is returned
    verbatim, so the fragment is also what the respond tool advertises.
    `src/extension/production-theta-producer.ts:726` — `paramsSchema:
    params.loweredSchema` into the binder envelope; `:2330` — the single typed
    query lowering feeding validation, respond-tool registration and the QRY-15
    template; `:3383` — the `invoke<T>` return boundary.
  - **The compile that refuses the duplicate-`required` root.**
    `src/seams/schema-validator.ts:148–149` — `AjvSchemaValidator.#build` calls
    `this.#ajv.compile(schema)`; the instance is built at `:112` with
    `strict: false`, which does not disable meta-schema validation, and the
    meta-schema is applied to the ROOT document only. The two sites that
    compile the annotation root's lowering both run over a candidate payload:
    `production-theta-producer.ts:2595` (the respond tool's `execute` verdict)
    and `src/runtime/typed-query-validation.ts:323` (`validateAgainst`).
  - **The witness cells this report's fix moves.**
    `tests/inline-object-duplicate-field-name.test.ts:765–800` — cell d4, the
    three rename spellings, all asserted `[]`, with the caveat text recording
    the identical-rename duplicate as a gap rather than a decision;
    `:1328–1350` — cell k3, a rename ahead of a plain repeat, asserted silent
    with `required: ['a as "w"', "a", "a"]` pinned; `:849–861`, `:863–871`,
    `:873–880` — cells e1/e2/e3, the declaration controls (fixtures E1, G3, G5)
    that must not move. `tests/schema-declarations.test.ts:74–137` (describe
    `V5a-T — wire-name renaming (collision / redundant)`) drives
    `checkObjectSchema` directly for both codes.
    `tests/params-inline-object-lowering.test.ts` (37 cells) is 0035's byte
    freeze over the `params:` position's lowering.
    `tests/committed-fixture-parse-gate.test.ts:121–122` is the
    zero-diagnostic gate over committed fixtures; it walks `.theta` only
    (`:55`, open bug 0132).
  - **The corpus.** `git ls-files -- '*.theta' '*.thetalib'` is 34 files.
    **Zero** carry an `as` rename in any position: the single regex hit for
    `\bas\s*["']` across all 34 is the word "as" inside a comment
    (`docs/examples/ralph-inline.theta:35`). Every `as "…"` rename in the tree
    is inside a TypeScript test string, and the only inline-body spellings are
    `tests/inline-object-duplicate-field-name.test.ts:787–789` (cell d4) and
    `:1328–1341` (cell k3). GOV-15: every input in §Reproduction except G3 and
    G5 loads with no `E`-severity diagnostic at 0.84.0, so all are inside the
    [loads-cleanly](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
    set (`source-language-stability.md:9`), and the
    [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
    (`:25`) disposes of the newly-emitting set "in-scope as an addition for
    inputs newly brought into the code's emission set".
- **Observed at:** `0.84.0` (HEAD `f856fd33`). Offline, deterministic; no live
  model, no provider. Every diagnostic row is the whole unfiltered
  `doc.diagnostics` in emission order, rendered `<severity> <code>: <message>`,
  through `parseDoc` (`tests/helpers/e2e-s1.ts`) driving the shipped
  `parseThetaDocument`, with frontmatter `---\nmode: prompt\n---` and a
  `let a = 1` + `a` tail; `.thetalib` rows pass `path = "lib.thetalib"` with no
  frontmatter. Annotation-root lowerings are direct
  `lowerQueryResponseSchema(type, [], [])` calls, `$defs` read-backs are
  `buildBodyTypeSchemas`, `params:` read-backs are
  `doc.frontmatter.params.loweredSchema` verbatim, the wire schema is
  `respondToolWireSchema`, and the compiles are a real `AjvSchemaValidator`.
  "registers" is `doc.frontmatter !== null` together with a zero error-severity
  count; a `.thetalib` row carries no frontmatter and is `n/a`.
  **Measurement hygiene:** a sibling orchestrator held uncommitted prototype
  edits to `src/parser/params.ts` and `src/parser/body-type-lowering.ts`
  (a literal-sublanguage recogniser extraction) during the first measurement
  pass, later withdrawn. Both hunks sit outside every function cited above, and
  every row below was measured twice — once while they were present and once
  against a tracked tree verified identical to HEAD (`git diff HEAD` empty) —
  with byte-identical output; `tests/inline-object-duplicate-field-name.test.ts`
  (49) and `tests/params-inline-object-lowering.test.ts` (37) were green under
  both. Every other file cited above was verified blob-identical to HEAD
  throughout. Six scratch vitest files, run on the outputs quoted below, then
  deleted. `src/`, `tests/`, `docs/bugs/README.md` and every other bug document
  are unmodified by this filing.

## Summary

`grammar.md:109` makes an inline object type's fields the same `Field` form as
an object-schema body's, admits an `as "WireName"` rename on them, and assigns
`theta/parse/wire-name-collision` and `theta/parse/redundant-wire-name`
"within the one inline object". Neither code fires there, at any `Type`
position, on any input.

The reason is upstream of both rules: the rename is not parsed. `parseObject`
(`type-grammar.ts:504`) reads a field-name token and then requires `:`
immediately behind it (`:535`); the rename's `as` fails that test and breaks
the field loop (`:537`). The only `as` handling in the function (`:555–561`)
sits AFTER the field type, so it matches `{a: integer as "w"}` — a spelling the
grammar does not define — and never the one it does. Downstream, both lowerers
split each field at its first top-level colon and take the whole pre-colon text
as the property name (`body-type-lowering.ts:166`, `params.ts:682`), so
`a as "w"` is what reaches `properties` and `required`.

Three consequences, each measured. **The two named diagnostics are
unreachable.** `@<{a as "w": integer, b as "w": string}>` loads `[]` where
`schema S { a as "w": integer, b as "w": string }` is refused with
`wire-name-collision`; `@<{a as "a": integer}>` loads `[]` where
`schema S { a as "a": integer }` warns with `redundant-wire-name`. **The wire
schema carries the source text.** The annotation root, the `$defs` hoist and
the `params:` lowering all key on `a as "w"` — a property name containing a
space and two `"` characters — and that document is what
`production-theta-producer.ts:726` and `:2330` hand the binder and the model.
`schemas.md:39` calls the rename "the only mechanism" for a property name that
is not theta-identifier-compatible; inside an inline object it is not a
mechanism at all. **The duplicate-`required` class bug 0052 closed survives at
this spelling.** `{a as "w": integer, a as "w": string}` loads `[]` and lowers
one last-wins property beside `required: ["a as \"w\"", "a as \"w\""]`; a real
`AjvSchemaValidator.compile` over that root throws `schema is invalid:
data/required must NOT have duplicate items (items ## 1 and 0 are identical)`,
at a site that runs after the model has answered.

A fourth consequence follows from the break rather than from the rename's
semantics: nothing behind the rename is parsed, and the unconsumed `}` marks
the node as an interior that never closes, so `void-in-non-return-position`,
`empty-schema-body`, `generic-arity-mismatch`, `result-in-schema-position` and
0052's own `duplicate-inline-field-name` all go silent on fields behind a
rename and on the bodies enclosing it.

## Reproduction

Offline, deterministic, at HEAD `f856fd33`. Whole unfiltered diagnostic lists
in emission order.

### (a) The two named diagnostics inside an inline body, against the declaration controls

| # | source | diagnostics |
|---|---|---|
| G1 | `@<{a as "w": integer, b as "w": string}>` | `[]` |
| G3 | `schema S { a as "w": integer, b as "w": string }` | `error theta/parse/wire-name-collision: wire name 'w' collides with another field on schema 'S'` |
| G4 | `@<{a as "a": integer}>` | `[]` |
| G5 | `schema S { a as "a": integer }` | `warning theta/parse/redundant-wire-name: redundant 'as' clause: wire name 'a' equals the theta-side name` |
| G2 | `schema S { p: {a as "w": integer, b as "w": string} }` | `[]` |

G1 and G3 are the same two fields at two spellings; so are G4 and G5. G3 and G5
place the harness against a live emitter, so no row above is a harness that has
stopped reaching the parser.

### (b) Every `Type` position — the rename is unparsed at all of them

Fixture `{a as "w": integer, b as "w": string}` at each position:

| # | source | diagnostics | registers |
|---|---|---|---|
| P1 | `let x: {a as "w": integer, b as "w": string} = 1` | `[]` | yes |
| P2 | `fn f(p: {a as "w": …}) { 1 }` | `[]` | yes |
| P3 | `fn f(): {a as "w": …} { 1 }` | `[]` | yes |
| P4 | `schema S { p: {a as "w": …} }` (row G2) | `[]` | yes |
| P5 | `schema T = {a as "w": …}` | `[]` | yes |
| P6 | `params:` → `p: '{a as "w": …}'` | `[]` | yes |
| P7 | `let r = @<{a as "w": …}>` + backtick body (row G1) | `[]` | yes |
| P8 | `let r = invoke<{a as "w": …}>("./x.theta")` | `[]` | yes |
| P9 | P4 written in `lib.thetalib`, no frontmatter | `[]` | n/a |

### (c) The wire schemas the silence mints

| # | source | lowered |
|---|---|---|
| L1 | `@<{a as "w": integer, b as "w": string}>` | `{"type":"object","properties":{"a as \"w\"":{"type":"integer"},"b as \"w\"":{"type":"string"}},"required":["a as \"w\"","b as \"w\""],"additionalProperties":false}` |
| L2 | `schema S { p: {a as "w": integer, b as "w": string} }` | `S` → `"properties":{"p":{"$ref":"#/$defs/__inline_2b94136edf91cb61"}}`, with that `$defs` entry carrying L1's two keys verbatim |
| L3 | `params:` → `p: '{a as "w": integer, b as "w": string}'` | same `$defs` slug `__inline_2b94136edf91cb61`, same two keys |
| L4 | `@<{a as "a": integer}>` | `{"type":"object","properties":{"a as \"a\"":{"type":"integer"}},"required":["a as \"a\""],"additionalProperties":false}` |
| L5 | `@<{first_name as "FirstName": string}>` | `{"type":"object","properties":{"first_name as \"FirstName\"":{"type":"string"}},"required":["first_name as \"FirstName\""],"additionalProperties":false}` |
| L6 | `@<{a as "w": integer, b as "x": string}>` | `"properties":{"a as \"w\"":…,"b as \"x\"":…},"required":["a as \"w\"","b as \"x\""]` |

L5 is `schemas.md:23`'s own example field written inline: the documented
mechanism for a PascalCase property yields the key
`first_name as "FirstName"`, and the document loads `[]`. L6 is the
well-formed case — two distinct theta names, two distinct wire names, nothing
for either diagnostic to say — and it is equally malformed on the wire, which
places the harm outside the two diagnostics' own input sets.

One `$defs` slug serves L2 and L3: the slug is the canonical hash of the
fragment (`schema-subset.md:73`), so every position lowering this text
addresses the same entry.

### (d) The identical-rename spelling — the duplicate `required` 0052 closed for plain names

| # | observable | value |
|---|---|---|
| D1 | `@<{a as "w": integer, a as "w": string}>` load | `[]` |
| D2 | D1 lowered | `{"type":"object","properties":{"a as \"w\"":{"type":"string"}},"required":["a as \"w\"","a as \"w\""],"additionalProperties":false}` |
| D3 | D2 through `respondToolWireSchema` | byte-identical to D2 |
| D4 | D2 through a real `AjvSchemaValidator.compile` | THROW `schema is invalid: data/required must NOT have duplicate items (items ## 1 and 0 are identical)` |
| D5 | control `@<{a: integer, a: string}>` load | `error theta/parse/duplicate-inline-field-name: duplicate field name 'a' within one inline object type` |
| D6 | `params:` → `p: '{a as "w": integer, a as "w": string}'` load | `[]`, lowering `$defs.__inline_87cf2dd0bc1781b7` with `required: ["a as \"w\"","a as \"w\""]` |
| D7 | `@<{p: {a as "w": integer}, q: integer, q: string}>` load | `[]` |
| D8 | D7 lowered, root | `"required":["p","q","q"]` beside `$defs.__inline_de5b12721bc77264` |
| D9 | D8 compiled | THROW `schema is invalid: data/required must NOT have duplicate items (items ## 2 and 1 are identical)` |
| D10 | control `@<{p: {a: integer}, q: integer, q: string}>` load | `error theta/parse/duplicate-inline-field-name: duplicate field name 'q' within one inline object type` |

D5 is 0052's fix, live on this HEAD; D1 is the same defect one spelling to the
side. D6 is the hoisted counterpart — a duplicate `required` inside a `$defs`
member compiles, because the meta-schema is applied to the root document only.
D7–D10 measure the second route to the same root: a rename inside a NESTED body
silences the ENCLOSING body's plain-name repeat, and the root that repeat mints
is a document AJV refuses.

### (e) What else the break suppresses

Each row is a check that fires today in the control spelling and is silent when
a rename is written ahead of it in the same inline body — or, for row S9, in a
sibling body of the same enclosing one:

| # | source | diagnostics |
|---|---|---|
| S1 | `schema S { p: {a as "w": integer, b: void} }` | `[]` |
| S2 | control `schema S { p: {a: integer, b: void} }` | `error theta/parse/void-in-non-return-position: …` |
| S3 | `schema S { p: {a as "w": integer, b: {}} }` | `[]` |
| S4 | control `schema S { p: {a: integer, b: {}} }` | `error theta/parse/empty-schema-body: …` |
| S5 | `schema S { p: {a as "w": integer, b: array<integer,string>} }` | `[]` |
| S6 | control `schema S { p: {a: integer, b: array<integer,string>} }` | `error theta/parse/generic-arity-mismatch: …` |
| S7 | `schema S { p: {a as "w": integer, b: Result<integer,string>} }` | `[]` |
| S8 | control `schema S { p: {a: integer, b: Result<integer,string>} }` | `error theta/parse/result-in-schema-position: …` |
| S9 | `@<{p: {a as "w": integer}, q: {c: 1, c: 2}}>` | `[]` |
| S10 | control `@<{p: {a: integer}, q: {c: 1, c: 2}}>` | `error theta/parse/duplicate-inline-field-name: duplicate field name 'c' …` |

Three bounds on that suppression, all measured:

| # | source | diagnostics |
|---|---|---|
| S11 | `schema S { p: {b: void, a as "w": integer} }` | `error theta/parse/void-in-non-return-position: …` |
| S12 | `schema S { p: {a as "w": integer}, q: void }` | `error theta/parse/void-in-non-return-position: …` |
| S13 | `@<{a as "w": integer, b: Cat}>` | `error theta/parse/unresolved-named-type: unresolved named type 'Cat'` |

S11: a field AHEAD of the rename is parsed normally. S12: a sibling field of
the enclosing `schema` DECLARATION is a separate `parseTypeExpression` call and
is unaffected — the suppression is confined to one type expression. S13:
`unresolved-named-type` is drawn from the lowering's own sink, not from
`walkType`, so it survives the break; S9's mechanism is the registry row's third
stop (`code-registry-parse.md:87`, "a field whose own type carries an interior
that never closes — that last shape stopping every body enclosing it as well"),
reached here because the break leaves the inner `}` unconsumed.

### (f) The spelling `parseObject`'s `as` skip actually matches

| # | source | diagnostics | lowered |
|---|---|---|---|
| S14 | `@<{a: integer as "w"}>` | `[]` | `{"type":"object","properties":{"a":{}},"required":["a"],"additionalProperties":false}` |

`type-grammar.ts:555–561` skips `as` plus a string literal AFTER the field
type, so this post-type spelling — which neither `grammar.md:101` nor
`schemas.md:23` defines — is the only one that reaches it. The lowerers do not
know that spelling either: `integer as "w"` is handed on as a type source and
lowers to the permissive `{}`.

### (g) The corpus

`git ls-files -- '*.theta' '*.thetalib'` → 34 files. PCRE2 scan for
`\bas\s*["']` across all 34: one hit, the English word in a comment
(`docs/examples/ralph-inline.theta:35`). Zero committed thetas carry a rename
in any position, inline or declared.

## Expected behaviour

`grammar.md:101` defines `ObjectType ::= "{" Field ("," Field)* ","? "}"` with
`Field` per Schema Declarations, and `:109` states the fields "reuse the same
`Field` form as an object-schema body and carry the same field semantics",
naming the optional `as "WireName"` rename among those semantics.
`schemas.md:23` fixes the rename's position — "between the field identifier and
its type" — so the inline `Field` form is `Ident ("as" String)? ":" Type`, and
an inline object's field name is parsed as the theta-side name with the string
literal as its wire name.

From that parse, the two assigned diagnostics follow directly:

- `schemas.md:44` — two fields of one inline object sharing an effective wire
  name, or a wire name equal to another field's theta-side name, is
  `theta/parse/wire-name-collision` at `E`. Row G1 is that input and should
  draw it, naming `w`, as row G3 does for the declaration spelling.
- `schemas.md:45` — a rename whose wire name equals the theta-side name is
  `theta/parse/redundant-wire-name` at `W`. Row G4 is that input and should
  draw it, naming `a`, as row G5 does.

Both should hold at every position of §Reproduction (b) and at every nesting
depth (`type-system.md:15`), in `.theta` and `.thetalib` alike.

The lowering follows from the parse rather than from the diagnostics.
`schema-subset.md:78` keys `properties` and `required` by wire names, so L1
should lower `properties` keyed `w` twice — which is why it is refused — and
L6, the well-formed rename that neither diagnostic touches, should lower
`properties: {"w": …, "x": …}` with `required: ["w","x"]`. L5 should lower
`properties: {"FirstName": …}`. No lowered property name should ever contain
` as ` or a `"` character: those keys are not names any author wrote.

The duplicate-`required` outcome disappears with the parse. D1's two fields
share both a theta-side name and a wire name, so it is refused before any
lowering runs and D2/D3/D4 become unreachable rather than better-framed. D7 is
refused by 0052's shipped rule once the rename stops truncating the enclosing
body's field list, so D8/D9 go with it.

§Reproduction (e)'s ten rows are the same statement from the other side: a
rename is a well-formed `Field`, so it ends nothing. S1, S3, S5, S7 and S9
should each draw exactly what their control draws. S11, S12 and S13 do not
move.

## Actual behaviour / root cause

**One token ends the field loop.** `TypeParser.parseObject`
(`src/parser/type-grammar.ts:504`) peeks the field-name token at `:528`,
consumes it when its kind is `ident` (`:529–531`), and then requires a `:`:

```
      if (!this.eatPunct(":")) {
        // Malformed field; stop to stay tolerant.
        break;
      }
```

For `{a as "w": integer, …}` the token behind `a` is the ident `as`, so
`eatPunct(":")` fails and the loop breaks at `:537` — before `fieldNames.push`
(`:545`), before `parseUnion` (`:547`), and before the closing brace is
consumed at `:566`. The node returned carries `fieldNames: []`,
`fieldTypes: []` and `braceClosed: false`.

**The function's own `as` handling is at the wrong position.** `:555–561` skips
an `as` plus a following string token, but it runs after `parseUnion` has taken
the field type, so it matches `Ident ":" Type "as" String` — the post-type
spelling of §Reproduction (f) — and never `Ident "as" String ":" Type`, which
is the form `schemas.md:23` defines and the declaration-side parser implements
(`theta-document.ts:2618–2631`, which consumes `as` and its string literal
BEFORE requiring `:` at `:2632`). The two parsers of one `Field` form disagree
about where the rename sits.

**Nothing downstream can recover it.** `checkObjectSchema`
(`schema-declarations.ts:87`) is the only implementation of either rule; it
takes fields shaped `{ thetaName, wireName? }` and is called from exactly one
place, `theta-document.ts:6289–6301`, a `schema` object body. The inline path
produces no such record: `LowerableField` (`body-type-lowering.ts:57–60`) is
`{ name, typeSource }` with no wire-name slot, so even the lowerers — which do
recover a name — recover it as one undifferentiated string.

**That string becomes the property key.** `lowerInlineObject`
(`body-type-lowering.ts:153`) splits the body with `splitTopLevel(body, ",",
"angle-and-brace")` (`:161`) and takes `entry.slice(0, colon).trim()` as the
name (`:166`); `hoistInlineObjectType` (`params.ts:670`) performs the identical
split (`:677`) and slice (`:682`) and writes `properties[fieldName]` (`:687`)
then `required.push(fieldName)` (`:688`). `topLevelColon` finds the colon of
`a as "w": integer` at its true position, so the pre-colon text is `a as "w"`
in full, quotes included. That is rows L1–L6.

**Two writes, one plain object and one array, are what makes D1 a duplicate.**
Where two fields' pre-colon texts are equal — the identical-rename spelling —
`properties[…]` overwrites last-wins while `required.push` appends, producing
`{"properties":{"a as \"w\"":{"type":"string"}},"required":["a as \"w\"","a as
\"w\""]}`. `lowerQueryResponseSchema` (`query-schema-lowering.ts:153`) returns
that fragment as the compiled document's ROOT, and `AjvSchemaValidator.#build`
(`schema-validator.ts:148–149`) applies AJV's meta-schema to a root document,
which constrains `required` to unique items. Both sites that compile it —
`production-theta-producer.ts:2595` and `typed-query-validation.ts:323` — run
over a candidate payload, so the throw lands after the query turn has been
spent. This is bug 0052's fixture A2, unchanged in mechanism and reached by a
spelling 0052's shipped rule excludes by design (`code-registry-parse.md:87`).

**The unconsumed brace propagates the stop outward.** Because the break skips
`:566`, the inner object node carries `braceClosed: false`, and
`carriesUnclosedInterior` (`type-grammar.ts:378`) is true of it. The enclosing
`parseObject` sets `namesStopped` after pushing the suspect field's own name
(`:548–554`), so every name behind it is dropped from the enclosing comparison
— row S9 — and the enclosing loop then reads the inner interior's leftover
tokens as its own, terminating on the first one it cannot read as `Ident ":"`.
That is why rows S1, S3, S5 and S7 lose four already-registered checks that
their controls draw: nothing behind the rename is ever handed to `parseUnion`,
so `walkType` never visits those field types. Row S13 survives because
`unresolved-named-type` is drawn from the lowering's own sink rather than from
the walk, and the lowerers split the body correctly past a rename. Row S12
survives because each `schema`-body field type is its own
`parseTypeExpression` call.

## Why it matters

- **A spelling the spec assigns two diagnostics to draws neither, at eight
  positions and both file extensions** (§Reproduction (a), (b)). The rules are
  enforced for the declaration spelling on the same HEAD (rows G3, G5), so the
  divergence is between two spellings `grammar.md:109` calls the same `Field`
  form.
- **The wire schema the model is shown carries property names no author
  wrote.** Rows L1–L6 key on text containing a space and two `"` characters.
  That document is the binder envelope's `paramsSchema`
  (`production-theta-producer.ts:726`), the typed query's response schema
  (`:2330`) and the respond tool's advertised schema
  (`respond-tool-wire.ts:91–94`, an object root returned verbatim). A model
  answering the schema must emit `{"a as \"w\"": …}` for the payload to
  validate.
- **The documented mechanism is unusable in an inline object.**
  `schemas.md:39` names the rename "the only mechanism for expressing schemas
  whose property names are not theta-identifier-compatible — PascalCase
  (`"FirstName"`), special-character (`"@type"`, `"$ref"`), kebab-case
  (`"first-name"`), or reserved-keyword (`"if"`, `"for"`) names". Row L5 writes
  `schemas.md:23`'s own PascalCase example inline and gets
  `first_name as "FirstName"` as the key. Every such schema must be written as
  a named declaration; nothing says so.
- **The corpus states the false claim in two places.** `grammar.md:109` names
  both codes "within the one inline object"; the user-facing mirror
  `docs/reference/grammar.md:203` asserts the `Field`-form reuse from which the
  rename follows. Both read false at HEAD. `docs/reference/schema-subset.md:50–52`
  states the collision rule with no position qualifier.
- **The duplicate-`required` throw class survives 0052's fix at this
  spelling.** Rows D1–D4 and D7–D9 are two routes to a root document AJV
  refuses to compile, from sources that load `[]`; the framing is
  `theta/runtime/internal-error` after a spent query turn, which is what 0052
  was filed to remove.
- **Four already-registered checks silently stop at a rename** (rows S1, S3,
  S5, S7), and 0052's own rule stops with them (row S9). The cost of leaving
  this open is therefore not only the two missing codes: any inline body with a
  rename in it is unchecked from that field on, and so is every body enclosing
  it.
- **Closing it costs no committed source.** Zero of the 34 committed
  `.theta`/`.thetalib` files carry a rename in any position (§Reproduction
  (g)), so `tests/committed-fixture-parse-gate.test.ts` takes no new refusal.

## Fix

Not settled. The routes below are constraint-pinned; the run selects and states
its choice, and coordinates the choice with the two reports filed beside this
one.

**(a) Where the rename is parsed.** The rename must be recognised at the
field-name position before either diagnostic can exist.

- *Route 1 — teach `parseObject` the `Field` form.* Accept
  `Ident ("as" Str)? ":" Type` at `type-grammar.ts:528–537`, retain the wire
  name beside `fieldNames` on the object node (`:567–574`, the variant at
  `:160–254`), and run both rules in `walkType`'s `object` arm beside
  `duplicate-inline-field-name`. This is the only route that yields wire-name
  SEMANTICS, because it is the only one that separates the theta-side name from
  the wire name. It necessarily removes the stop, so §Reproduction (e)'s five
  suppressed emissions return: that is a blast radius to pre-measure and pin,
  not a side effect to discover.
- *Route 2 — run over the lowerers' tokenisation.*
  `splitTopLevel(body, ",", "angle-and-brace")` plus `topLevelColon`, the split
  `lowerInlineObject` (`body-type-lowering.ts:161–167`) and
  `hoistInlineObjectType` (`params.ts:677–682`) already perform. This is 0052
  §Fix constraint 4's second branch and the route
  [0159](./0159-inline-field-name-stop-masks-duplicate.md) §Fix route (a) takes
  for the stop family. On its own it closes the identical-rename duplicate
  (D1's two pre-colon texts are equal) and delivers no wire-name semantics:
  G1's two fields carry two different pre-colon texts and one shared wire name,
  so G1 stays `[]` unless the rename is additionally parsed OUT of that text.
  If the run takes this route it must state which of the two it is doing.
- *Route 3 — reuse `checkObjectSchema`.* Not available first:
  `checkObjectSchema` (`schema-declarations.ts:87`) consumes
  `{ thetaName, wireName? }` records and nothing on the inline path builds one
  (`LowerableField` is `{ name, typeSource }`). 0052 §Non-goals states this
  bound in terms. It becomes available after route 1 and is then a reuse
  decision, not a route.

**(b) What the rename lowers to.** Parsing it is not sufficient; the wire name
has to reach the schema. `schema-subset.md:78` keys `properties` and `required`
by wire names, so L6 — the well-formed rename neither diagnostic touches —
should lower `{"w": …, "x": …}`. That is a LOWERING change on inputs that are
not newly refused, and it meets two standing freezes: bug 0039 §Fix froze the
`params:` position's lowered bytes and `tests/params-inline-object-lowering.test.ts`
(37 cells) locks them, and 0052 §Fix constraint 1 restated the freeze. Neither
lock carries a rename fixture (§Affected, corpus scan), so the change is an
addition to their input set rather than a re-pin — the run must verify that
claim against both files rather than assume it. The alternative disposition —
parse the rename for the two diagnostics and leave the lowering keyed on the
pre-colon text — is admissible only if stated: it keeps rows L5 and L6
malformed and closes only the diagnostic half.

**(c) The `<schema>` placeholder.** `theta/parse/wire-name-collision`'s
*Message* is `wire name '<name>' collides with another field on schema
'<schema>'`, and an inline object has no name. DIAG-4
(`diagnostic-shape.md:74`) forbids a reword inside theta 1.x, and 0052's fix
record settled the identical problem for its own rule by minting a NEW row with
a `<field>`-only *Message* rather than widening
`theta/parse/wire-name-collision`'s *Trigger*. The run must reach one of:
reuse the two rows and render `<schema>` for a nameless subject; mint one or
two inline-specific rows; or refuse the inline rename outright under a third
code. `theta/parse/redundant-wire-name`'s *Message* carries only `<name>` and
has no such obstacle, which means the two halves of `grammar.md:109` can be
answered differently and the run must say so if it does.

**(d) Registry (DIAG-2).** Whatever (c) settles lands in the same commit as the
code (`diagnostic-shape.md:72`), with `docs/reference/diagnostics.md:133`/`:134`
in lock-step. `code-registry-parse.md:87`'s *Trigger* states the rename
exclusion as normative ("an `as "WireName"` rename is one of the stops above,
the inline `Field` form not parsing that clause"); any route in (a) makes that
sentence false and must rewrite it in the same commit. `grammar.md:109` and
`docs/reference/grammar.md:203–208` are corrected by the same change.

**(e) Coordination, binding.**

- [0159](./0159-inline-field-name-stop-masks-duplicate.md) takes the same
  substrate. If it lands first with its route (a), the identical-rename
  duplicate (rows D1–D4) is already closed and cell d4 row 1 already re-pinned,
  and this report claims only the wire-name semantics; if this report lands
  first with route 1, the rename ceases to be a stop and 0159's k-group
  shrinks. Neither is a prerequisite of the other, and the two must not both
  re-pin cell d4 without the second recording the first's ruling.
- [0161](./0161-quoted-inline-field-name-not-a-field.md) (a quoted field name)
  turns on the same question — what the inline `Field` form admits — and its
  answer must be consistent with (a)'s.
- [0154](./0154-inline-object-type-field-name-rules-unenforced.md) needs the
  theta-side name separated from the rename text before its case rule can read
  the right string; route 1 supplies that separation and route 2 does not.
  Whichever lands second reuses the retention rather than rebuilding it.

**(f) Witness obligations.**

- **Cells d4 (`tests/inline-object-duplicate-field-name.test.ts:765–800`) and
  k3 (`:1328–1350`) are re-pinned**, and their comments — which record the
  rename as a gap this report owns — are corrected in the same commit. Cells
  e1/e2/e3 (`:849–880`, the declaration controls) must not move: the fix adds
  an inline emission and does not touch `checkObjectSchema`.
- **A new witness file carries this report's rows**, on the shape of the
  existing one: whole-list ordered `toEqual` over unfiltered `doc.diagnostics`,
  every expected *Message* read through `parseRegistry` / `registryMessage`
  (DIAG-4), `parseDoc` from `tests/helpers/e2e-s1.ts`. Minimum rows: all of
  §Reproduction (a) and (b) including the `.thetalib` spelling; (c)'s lowered
  bytes in whichever direction (b) leaves them, L5 and L6 among them; (d)'s
  D1–D10 including the two real `AjvSchemaValidator.compile` outcomes and the
  unreachability of the compile once the input is refused; every row of (e)
  with its control; and (f)'s S14 as an over-reach tripwire.
- **Both directions proven.** Neutralise the new emission and confirm the new
  rows red and only they; restore and confirm green.

**(g) Blast radius.** Zero committed `.theta`/`.thetalib` files carry a rename
(§Reproduction (g)), so `tests/committed-fixture-parse-gate.test.ts` takes no
new refusal and no landed lock inverts on corpus grounds. Every input in
§Reproduction except G3 and G5 loads with no `E`-severity diagnostic at 0.84.0,
so the
[diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
(`source-language-stability.md:25`) disposes of the newly-emitting set. The
uncounted risk is §Reproduction (e): five codes gain emissions on inputs no row
in the tree measures today, which is why (f) requires them rowed with controls.

**Fix ordering.** Nothing blocks this report from starting. It shares
`parseObject` with [0159](./0159-inline-field-name-stop-masks-duplicate.md),
[0161](./0161-quoted-inline-field-name-not-a-field.md) and
[0154](./0154-inline-object-type-field-name-rules-unenforced.md); whichever
lands second reuses or rebases the field-parse decision the first makes and
records which.

## Non-goals

- **A repeated field name inside an inline object at the plain spelling.**
  Closed by [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md)
  (0.84.0) and live on this HEAD (rows D5, D10). This report claims the
  identical-RENAME spelling only, and only until
  [0159](./0159-inline-field-name-stop-masks-duplicate.md) closes it by
  re-keying.
- **The stop-position family generally.** The truncation shapes 0052
  *Residuals* item 1 enumerates (`{a: integer, : x, a: boolean}`,
  `{"a": string, …}`, `{a: 1 a: 2, a: 3}`) belong to
  [0159](./0159-inline-field-name-stop-masks-duplicate.md) and
  [0161](./0161-quoted-inline-field-name-not-a-field.md).
  This report measures only the shapes a rename reaches (§Reproduction (e)) and
  names their mechanism; it does not claim the family's adjudication.
- **The identifier rules at the same slot.** The lowercase-first and
  reserved-keyword rules on an inline field name are
  [0154](./0154-inline-object-type-field-name-rules-unenforced.md)'s subject.
  A fix here must not emit `theta/parse/binding-case-mismatch` at this
  position.
- **The declaration spelling's behaviour.** `checkObjectSchema` and rows G3/G5
  are byte-frozen (DIAG-3/DIAG-4). Whether a declaration admits two fields with
  one theta-side name under different renames is not measured here and is not
  claimed.
- **The post-type spelling `{a: integer as "w"}`** (row S14). It is not a form
  `grammar.md:101` or `schemas.md:23` defines. A fix must decide whether the
  skip at `type-grammar.ts:555–561` stays, and record the decision, but this
  report claims no diagnostic for that input.
- **The compound-position double emission.** A new code on this walk inherits
  the `let`-annotation-over-query doubling that
  [0093](./0093-let-annotation-query-position-double-emission.md) owns; that is
  neither created nor repaired here.
- **AJV's root-only meta-schema validation.** The asymmetry between D6
  (compiles) and D4/D9 (throw) is a property of the validator seam. Refusing
  the input removes the outcome; no `catch` is added at any AJV seam.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `src/parser/type-grammar.ts`; that is
  [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
  do-not-chase class.

## Provenance

- Origin: the bug 0052 fix (0.84.0, commit `f856fd33`). Its fix report
  (`.pi/tmp/fixes/0052-report.md`) §Residuals item 2 names this defect and
  leaves it to the parent to file; 0052's `## Fix (0.84.0)` *Residuals* item 2
  carries the same text plus the settled stop reading, and 0052 §Non-goals had
  already declared it "a separate defect on the same sentence, unfiled".
  Filed in the same batch as
  [0159](./0159-inline-field-name-stop-masks-duplicate.md) (that fix's residual
  1) and [0161](./0161-quoted-inline-field-name-not-a-field.md) (residual 3).
- Independently re-derived at HEAD `f856fd33` for this filing, not copied:
  0052's §Reproduction group (7) fixtures G1–G5 reproduce byte-exact (rows G1,
  G2, G3, G4, G5 here), and every other row is new measurement — the eight
  `Type` positions of (b), the six lowerings of (c), the ten cells of (d)
  including both real AJV compiles, the thirteen cells of (e), and (f)'s
  post-type spelling. Six scratch vitest files over `parseDoc`,
  `lowerQueryResponseSchema`, `buildBodyTypeSchemas`, `respondToolWireSchema`
  and `AjvSchemaValidator`, run on the outputs quoted above, then deleted.
- Spec: `docs/spec_topics/grammar.md` (`:101`, `:109`, `:172`);
  `docs/spec_topics/schemas.md` (`:17`, `:21`, `:23`, `:39`, `:43`, `:44`,
  `:45`); `docs/spec_topics/type-system.md:15`;
  `docs/spec_topics/schema-subset.md` (`:73`, `:78`, `:87`);
  `docs/spec_topics/diagnostics/code-registry-parse.md` (`:84`, `:85`, `:87`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md` (DIAG-2 `:72`, DIAG-3
  `:73`, DIAG-4 `:74`);
  `docs/spec_topics/governance/source-language-stability.md` (GOV-15 `:5`,
  loads-cleanly `:9`, diagnostic-registry carve-out `:25`). User-facing
  mirrors: `docs/reference/grammar.md` (`:66–70`, `:190`, `:203–208`),
  `docs/reference/diagnostics.md` (`:133`, `:134`, `:136`),
  `docs/reference/schema-subset.md:47–54`.
- Implementation evidence at `f856fd33`: `src/parser/type-grammar.ts`
  (`:160–254`, `:342`, `:378`, `:504`, `:528–537`, `:544–546`, `:547`,
  `:548–554`, `:555–561`, `:566`, `:567–574`); `src/parser/theta-document.ts`
  (`:538–548`, `:2589`, `:2618–2631`, `:2632`, `:2672–2676`, `:6289–6301`);
  `src/parser/schema-declarations.ts`
  (`:87`, `:102–113`, `:119–154`); `src/parser/body-type-lowering.ts`
  (`:57–60`, `:109`, `:120`, `:128`, `:153`, `:161`, `:166`, `:167`);
  `src/parser/params.ts` (`:670`, `:677`, `:682`, `:687`, `:688`);
  `src/parser/schema-lowering.ts` (`:243–261`);
  `src/runtime/query-schema-lowering.ts` (`:113`, `:153`);
  `src/runtime/respond-tool-wire.ts:91–94`;
  `src/runtime/typed-query-validation.ts:323`;
  `src/seams/schema-validator.ts` (`:112`, `:148–149`);
  `src/extension/production-theta-producer.ts` (`:726`, `:2330`, `:2595`,
  `:3383`).
- Test evidence at `f856fd33`: `tests/inline-object-duplicate-field-name.test.ts`
  (`:765–800` cell d4, `:802–836` cell d5, `:849–880` cells e1–e3, `:1328–1350`
  cell k3); `tests/schema-declarations.test.ts:74–137`;
  `tests/params-inline-object-lowering.test.ts` (0035's byte freeze, 37 cells);
  `tests/committed-fixture-parse-gate.test.ts` (`:55` the `.theta`-only walk,
  `:121–122` the zero-diagnostic assertion);
  `tests/live/acceptance/fixtures/acc-typed-inline.theta:14` (the only
  committed inline object type; no rename).

## Coordination note (0.93.0) — narrowed, still open

Append-only. This report's **status does not change**: its measured subject
survives the ruling below, and §Fix (a) route 2 said so in advance — the
tokenisation route "delivers no wire-name semantics: G1's two fields carry two
*different* pre-colon texts and one *shared* wire name, so that route leaves
§Reproduction (a) exactly as measured".

- **The ruling, and where it is recorded.** Bug 0159 landed §Fix route (a) in
  0.93.0 and states the adjudication for all three reports of this batch;
  [0159](./0159-inline-field-name-stop-masks-duplicate.md) `## Fix (0.93.0)`
  carries it verbatim, together with the DIAG-2 *Trigger* rewrite, the
  `<field>` placeholder disposition, the GOV-15 set and the census. Cite that
  record rather than re-deriving it. §Fix (e) required that "the two must not
  both re-pin cell d4 without the second recording the first's ruling" — this
  note is that recording.
- **The key.** `theta/parse/duplicate-inline-field-name` now compares the
  entries of `splitTopLevel(interior, ",", "angle-and-brace")`, keyed on each
  entry's raw text before its own `topLevelColon`, after `trim()`, with no
  unquoting and no normalisation. `a as "w"` is therefore a key like any other:
  it is neither parsed nor stripped, exactly as this report measures.
- **What closed — the identical-rename duplicate only.** §Reproduction (d) rows
  **D1–D4** and **D6** close: `{a as "w": integer, a as "w": string}` is two
  entries with one raw key, so it is refused at every `Type` position and the
  duplicate-`required` root D4 compiles to a throw is never minted. Rows
  **D7–D9** close for the same reason by a different route — the enclosing
  body's own `q` repeat is now compared, because nothing about a nested rename
  truncates an enclosing entry list. Rows D5 and D10 (the plain-name controls)
  are unmoved. Cell **d4 row 1** and cell **k3** of
  `tests/inline-object-duplicate-field-name.test.ts` were re-pinned under 0159's
  disposition; cell d4 rows 2 and 3 stay silent, their pre-colon texts differing.
- **What did NOT close — this report's subject.** §Reproduction (a) rows
  **G1/G2/G4** are unchanged: `theta/parse/wire-name-collision` and
  `theta/parse/redundant-wire-name` still cannot fire inside an inline object at
  any `Type` position, because the rename is still not parsed and no inline
  field record carries a `wireName`. §Reproduction (c) rows **L1–L6** are
  unchanged: the whole pre-colon text is still the wire property name, so
  `schemas.md:39`'s "only mechanism" is still unusable inline (row L5's
  PascalCase example still keys on the rename text). §Reproduction (b)'s eight
  positions, §Reproduction (e)'s suppression rows **S1–S10** and its bounds
  **S11–S13**, and §Reproduction (f)'s post-type spelling **S14** are all
  unchanged: 0159's route touched no parser recovery, so `parseObject` still
  breaks its field loop at the `as` token and everything written behind a rename
  in the same type expression is still unparsed. §Fix (b)'s lowering question and
  §Fix (c)'s `<schema>` placeholder question are untouched and remain this
  report's to settle.
- **One measurement of this report is position-dependent, and was not when it
  was written.** §Reproduction (c) rows **L1, L2, L4, L5, L6** and
  §Reproduction (d) rows **D2, D3, D8** were measured by direct
  `lowerQueryResponseSchema` / `buildBodyTypeSchemas` / `respondToolWireSchema`
  calls on hand-written strings. Measured through the DOCUMENT instead, seven of
  the eight `Type` positions reconstruct their type-source text by joining lexer
  tokens with no separator (`theta-document.ts`, the `parts.join("")` capture),
  so `{a as "w": integer, b: string}` reaches both the checker and the lowerer as
  `{aas"w":integer,b:string}` and the minted property key is `aas"w"`, not
  `a as "w"`. `params:` alone passes its raw YAML scalar through, keeping the
  spaces. This is PRE-EXISTING — 0159's fix neither created nor changed it — and
  it does not weaken any conclusion here: the key is still text containing a `"`
  character that no author wrote, still not the wire name, and L2/L3 therefore do
  NOT share one `$defs` slug as the table states. The consequence for this report
  is that its wire-key bytes must be re-measured per position when its fix is
  written, and §Fix (b)'s lowering change must state which of the two texts it
  keys on. Pinned in both directions by cells H1 and H2 of
  `tests/inline-object-field-name-comparison-key.test.ts`.
- **Substrate drift for whoever writes §Fix.** `src/parser/type-grammar.ts` is
  **923** lines (835 when this report was filed); the object `TypeNode` now
  carries `interiorSource` beside `fieldTypes` / `fieldNames`, and `TypeToken`
  carries a `start` source offset. `fieldNames`, the `namesStopped` latch and
  `carriesUnclosedInterior` are UNCHANGED and were deliberately retained — they
  are the theta-side identifier list, which route 1 here would extend with a
  wire-name slot. `src/parser/params.ts` (1253),
  `src/parser/body-type-lowering.ts` (763) and
  `src/parser/schema-declarations.ts` (819) are untouched by 0159's fix.

## Coordination note — bug 0176 landed and left this report's surface intact (0.161.0)

[0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md) shipped
`theta/parse/quoted-inline-field-name` on its §Fix route **A**, and answered its
§Fix A3 NARROWLY on purpose so this report is not pre-empted: the trigger is the
key's FIRST character (`"` or `'`), not identifier-shapedness. `{a as "w":
integer}` therefore keeps its raw key `aas"w"`, keeps loading at all eleven
`Type` positions, and keeps lowering the property name this report measures —
asserted after the fix as a control (group H of
`tests/inline-object-quoted-field-name-refusal.test.ts`). This report's
wire-name semantics remain wholly its own; a fix here that parses the `as`
clause inside an inline body will need to state its disposition against the new
row's *Trigger* and against the two-row `<field>` carve-out at
`placeholder-rendering-b.md:10`, exactly as this report's coordination note
already does for 0159. Status unchanged (**open**).

## Fix (0.172.0)

- **The route, settled in the run.** §Fix (a) **route 2**, stating which of the
  two it does: the rename is **not** parsed out of the key and no wire-name
  semantics are delivered — the inline spelling is **refused**. §Fix (b): **no
  lowering change** (rows L1–L6 keep their bytes under a direct lowerer call and
  become unreachable through a load, the input now drawing an `E`). §Fix (c):
  the third enumerated option — refuse the inline rename outright under a new
  row, so `theta/parse/wire-name-collision` and
  `theta/parse/redundant-wire-name` stay declaration-scoped and the `<schema>`
  placeholder problem never arises. Two measurements decided it against route 1,
  both re-derived at the fix baseline and both contradicting this document's
  root-cause reading:
  1. A parse-level rename parse in `TypeParser.parseObject` fires at
     **`params:` only**. At the other ten `Type` positions the document
     reconstructs the type-source text by joining lexer tokens with no
     separator, so `{a as "w": integer}` reaches the parser as
     `{aas"w":integer}` — the field-name token is `aas` and no `as` token
     exists. A prototype of route 1 (measured, then withdrawn) emitted at one
     position out of eleven: a position-dependent rule, against
     `type-system.md` §position invariance.
  2. Wire-name **semantics** are unrecoverable downstream of that capture: the
     mangled text has already lost the theta/wire boundary, and both lowerers
     key on raw text, so keying `properties` on a wire name would need the
     token-join capture changed (`theta-document.ts`, outside this fix) and
     would break the landed agreement-by-construction between the two raw-key
     rules and the property names the lowering mints (0052's and 0176's rows
     state it normatively).
- **What shipped**
  - `src/parser/type-grammar.ts` (1065 → **1176** lines) — a module-level
    predicate `INLINE_FIELD_RENAME` and one new emission inside `walkType`'s
    `object` arm, in the existing `inlineObjectFieldKeys` raw-key loop's
    **non-repeating** branch, after the 0176 first-char-quote test (which gained
    an explicit `continue`, so the precedence is enforced by control flow: a
    repeating key is `duplicate-inline-field-name`'s alone, a quote-led key is
    `quoted-inline-field-name`'s alone, a rename spelling is this row's).
    Both gates inherited byte-for-byte from the two neighbours
    (`closingBraceSpelled`, withheld under `insideGenericArgument` — the
    neighbours' lowering-grounded reason, not 0154's identifier reason, because
    this row's subject is the raw key the lowering would mint). The predicate
    matches the verbatim (`a as "w"`) and the token-joined (`aas"w"`) spelling
    alike and yields the **same** capture from both, which is what makes one
    rule answer alike at all eleven positions. `TypeParser.parseObject`'s field
    loop, its post-type `as` skip (§Non-goals' S14 decision: it **stays**,
    unchanged), `fieldNames`, `namesStopped`, `interiorSource` and 0154's
    identifier pass are byte-unmodified.
  - **The new row**, `theta/parse/renamed-inline-field-name`, `E`, `parse`,
    *Message* `wire-name rename on field '<field>' within one inline object
    type`. `<field>` renders the predicate's capture — the theta-side
    identifier — not the raw key, so it takes the **standard** identifier
    rendering and the closed placeholder table's carve-out sentence stays at
    *two* rows (`placeholder-rendering-b.md` byte-untouched; asserted by a
    witness cell). Reserved-keyword-shaped leading text (`{let as "w": …}`) is
    deliberately **inside** the emission set — this row's subject is a raw key,
    not an identifier binding, so it inherits none of 0154's
    `RESERVED_KEYWORDS` exclusion; the *Trigger* says so and a cell pins it.
  - **DIAG-2, same change**: the new row in
    `docs/spec_topics/diagnostics/code-registry-parse.md` with a full normative
    *Trigger* (shared split/colon/trim key, both captures, both gates, the reach
    at every `Type` position and depth, the three-way precedence, the
    declaration spelling keeping the two wire-name rows, and the "spells no key"
    carve-out); the mirror row in `docs/reference/diagnostics.md`. No existing
    *Message* reworded (DIAG-4).
  - **Prose the fix made false, corrected in the same change** (§Fix (d)):
    `docs/spec_topics/grammar.md` §"Inline object types" (the sentence that
    admitted the rename inline and assigned both codes there) and its
    `ObjectType` production comment; `docs/reference/grammar.md`'s `ObjectType`
    bullet and its wire-name sentence; `docs/spec_topics/lexical.md`'s
    wire-name clause; and exactly two spans of 0176's shipped row — its *Fix*
    hint (which recommended the inline rename) and the *Trigger* clause saying
    the rename "is admitted exactly as measured". 0176's emission set is
    untouched. `docs/spec_topics/schemas.md` and
    `docs/reference/schema-subset.md` were **read and left unchanged**, decided
    rather than assumed: both wire-name blocks sit under declaration-only
    headings, so both read true after the fix.
  - `tests/inline-object-wire-name-rename-refusal.test.ts` (new, **1440**
    lines, 25 tests / 67 list cells, 47 of them carrying the new row) — the
    §Fix (f) witness: whole-list ordered `toEqual` over unfiltered
    `doc.diagnostics`, every *Message* through `parseRegistry`/`registryMessage`
    (DIAG-4), `parseDoc` from `tests/helpers/e2e-s1`, all eleven `Type`
    positions incl. `.thetalib` and `params:`, the declaration controls G3/G5
    unmoved, §Reproduction (c)'s direct-lowerer bytes frozen as the proof that
    §Fix (b) changed nothing, (d)'s D1–D10 with two real
    `AjvSchemaValidator.compile` outcomes, (e)/(f)'s suppression rows with
    controls, and 23 boundary cells. Anti-vacuity is a cell: `H1` recomputes
    67/47 and names the seven empty-expectation cells; `H2` restates the whole
    inventory at CODE level with no registry dependency.
  - `tests/live/inline-object-wire-name-rename-live-cell.test.ts` (H8a) and
    `tests/live/acceptance/inline-object-wire-name-rename-load-refusal.test.ts`
    (H9a, real `pi -p`) — on 0154's and 0176's shipped idioms, both asserting on
    the `theta-system-note` channel read off the settled `SessionManager` and on
    `driveSlashCaptureTurn` observables, never on `prompt()` resolving, both
    carrying an offline-attributable guard so a neutralised fix reds before any
    provider call.
- **Gates** — witness `npx vitest run
  tests/inline-object-wire-name-rename-refusal.test.ts` → `Test Files 1 passed
  (1) / Tests 25 passed (25)`; the five inline-object witness files together →
  `Tests 138 passed (138)`; full default suite `npx vitest run` → `Test Files
  359 passed (359) / Tests 7370 passed (7370)` (fork baseline 358 / 7345);
  `npx tsc -p tsconfig.json --noEmit` clean; `npm run lint` clean. Live, under
  the shared lock: `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/inline-object-wire-name-rename-live-cell.test.ts` → `1 passed`
  (6.7 s, after one isolated re-run of the documented ~180 s stall class), and
  the H9a acceptance file → `1 passed` (7.6 s) first attempt.
- **Review** — 2 rounds. Round 1 (deep): no `fidelity` finding and no finding
  against the settled route; one `correctness` finding (an escaped quote in the
  wire name escapes all three inline rules and silently drops the field), two
  `spec` findings (the *Trigger* said `Ident` while the code refuses
  reserved-keyword-shaped text; `grammar.md`'s `ObjectType` production comment
  contradicted the rewritten paragraph beneath it), one `house-rule` finding
  (eleven comments attributed this unassigned fix to `0.165.0`, which is 0154's
  landed version), and four prose/test residuals. All fixed; the escaped-quote
  class was **pinned as a bound** (two cells, a lowering read-back and a
  *Trigger* sentence) rather than closed, because the escape-blind quote
  tracking is the shared split 0052 and 0176 key on. Round 2 (fast): **CLEAN**,
  one dangling cross-reference to a nonexistent cell, corrected in place by the
  orchestrator (comment-only; polish verified by gate-diff, confirmation round
  skipped).
- **Verification** — SOLID. (1) The witness reds for the right reason in the
  neutralisation direction and in two of the three probe directions, each red
  set derived in advance: full neutralisation reds exactly the 16 cells across
  five files whose expectation names the new row and nothing else; removing the
  generic-argument carve-out reds exactly the `array<{a as "w": string}>`
  boundary cell; rendering the raw key instead of the capture reds **all 22**
  position cells (not only the ten token-joining ones — the `params:` raw key
  `a as "w"` diverges from the identifier too), which is stronger evidence for
  the capture-rendering decision than the prediction was. Every restore proven
  byte-exact by `git hash-object`. (2) Default suite green. (3) Both live halves
  run for real; the H8a half proven red in both directions (the neutralised run
  reds at the offline attribution guard, zero tokens). (4) Typecheck and lint
  clean. Protected files proven byte-identical to HEAD by hash:
  `tests/inline-empty-object-type.test.ts`, `tests/schema-field-name-case.test.ts`,
  `tests/params-inline-object-lowering.test.ts`,
  `tests/committed-fixture-parse-gate.test.ts`, `src/parser/params.ts`,
  `src/parser/body-type-lowering.ts`, `src/parser/theta-document.ts`,
  `src/parser/schema-lowering.ts`,
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md`,
  `tests/fixtures/h7a/permitted-codes.json`.
- **Flips, for parent ratification** — exactly **eight** cells moved, all
  additive (a line gained beside every line already asserted), every subject
  preserved, every comment describing a now-closed face corrected in the same
  change, and no ninth cell anywhere in the suite:
  `tests/inline-object-duplicate-field-name.test.ts` d4 (rows 2 and 3) and k3
  (§Fix (f) authorises both by name);
  `tests/inline-object-field-name-case.test.ts` w2 and w3 (0154's rename cells —
  w2's subject, `binding-case-mismatch` staying silent behind a rename, is
  **preserved**: the case rule still does not fire there);
  `tests/inline-object-field-name-comparison-key.test.ts` A2, D1 and H2 (0159's
  file; H2's `params:` read is replaced by `frontmatter === null` plus the
  byte-identical direct lowering, the strongest remaining observable);
  `tests/inline-object-quoted-field-name-refusal.test.ts` H2/row h5 — the cell
  0176 wrote as the falsifiable coordination statement for whichever report
  landed second; its direct-lowering half stays byte-identical, proving no
  lowering changed.
- **Residuals**
  1. **An escaped quote in the wire name escapes all three inline rules and
     silently drops the field.** `{a as "w\"x": integer}` loads `[]` at the
     annotation root and at `params:`, and lowers
     `{"type":"object","properties":{},"required":[],"additionalProperties":false}`
     — the author's field vanishes. Cause: the quote tracking in the shared
     `splitTopLevel`/`topLevelColon` is escape-blind, so the entry's `:` is
     never seen at top level and the entry "spells no key" — the carve-out all
     three rows now state. Widening it would move 0052's and 0176's keys and is
     outside this fix; pinned in both directions by cells g20/g21 and
     `CONTROL G4`, and by a *Trigger* sentence. Needs its own report.

     **Discharged by [0229](./0229-escaped-quote-wire-name-drops-inline-field.md)
     (0.182.0).** The report it asked for was filed and fixed: `topLevelColon`
     honours string escapes, `INLINE_FIELD_RENAME`'s wire-name literal admits
     the escaped interior, and `{a as "w\"x": integer}` now draws this row
     naming `a` at every lexed `Type` position and at `params:`. Cells g20/g21
     and `CONTROL G4`'s escaped-quote half moved under that report's
     authority, with their comments corrected; `CONTROL H1`'s
     empty-expectation list and counts moved with them. One statement of this
     item is corrected by that measurement: the escape-blindness was
     `topLevelColon`'s alone — the shared `splitTopLevel` consumes escapes and
     always did — so closing the class moved neither 0052's nor 0176's keys.
     0052's repeat spelling and 0176's quote-led spelling are now judged over
     the escaped interior too, each by its own row.
  2. **This document's root-cause reading is wrong in one part, and was
     corrected by measurement.** §"Actual behaviour / root cause" attributes the
     suppression family (§Reproduction (e)) and the unparsed rename to the
     post-type position of `parseObject`'s `as` skip. Measured at the fix
     baseline: the field loop breaks because it cannot read `Ident ":"` at the
     field head, and at ten of eleven positions there is no `as` token there at
     all (the token-join capture, `{aas"w":integer}`); the same suppression
     reproduces at `params:`, where the spaces survive, and for
     `{"a": string, b: void}`, which carries no rename at all. The suppression
     family is therefore **not** this row's to close and is **not** closed:
     §Reproduction (e) rows S1–S10 keep their measured silence, now pinned with
     that cause and with the refusal beside them.
  3. **§Reproduction (f) row S14 has moved since filing.**
     `@<{a: integer as "w"}>` is not `[]` at the fix baseline: it draws a
     `*-type-not-expression` refusal at ten of eleven positions and is silent
     only at `invoke<T>`. The over-reach tripwire is asserted as "the new row
     appears at no position", which is the claim that matters.
  4. **`{a as "w" as "x": integer}` is a deliberate under-refusal.** The
     predicate is anchored, so a second rename clause is trailing text and
     matches nothing; the input loads `[]` and keeps minting its raw key. Pinned
     by cell g23 and by the *Trigger*'s "no trailing text" clause.
  5. **The `closingBraceSpelled` gate is structurally unfalsifiable by direct
     removal**, for this row and both neighbours alike: `parseObject` sets
     `interiorSource` to `""` whenever the closing brace is unspelled, so no
     fixture can carry a non-empty interior behind a false gate. The gate
     documents an invariant the node's construction already guarantees; recorded
     so a later verifier does not re-derive the investigation.
  6. **Corpus census re-derived at the fix baseline**: 34 committed
     `.theta`/`.thetalib`, and one case-insensitive scan for an `as` rename in
     any position returns the same single hit this document records (the English
     word in a comment, `docs/examples/ralph-inline.theta`). No committed source
     moves, `tests/committed-fixture-parse-gate.test.ts` takes no new refusal,
     and GOV-15's disposition is the addition arm of the diagnostic-registry
     carve-out over an in-repo input set that is empty.
  7. **`tests/fixtures/h7a/permitted-codes.json` needed no entry**, decided by
     the real H9a run: the refusal reaches only the `theta-system-note` channel,
     so `parseSystemNoteCodes(stdout + stderr)` measured `[]` — the disposition
     0154 and 0176 recorded for this class. Byte-untouched.
  8. **Process note for the parent.** One live invocation during verification
     was made without holding the shared lock; it failed at the file's own
     offline attribution guard before any provider call (zero tokens), and every
     other live run in this fix took and released the lock in one command.
- **Discharge notes appended** — `docs/bugs/0154-…md` (its *Residuals* item 1,
  the rename mis-split: re-measured, still open, its cells re-pinned additively
  here). No other sibling document's status turns on this fix.
- **Pinned dispositions / non-goals** — the plain-spelling duplicate rule
  (0052) and its raw key, 0176's quoted-key row and its two-row `<field>`
  carve-out, the declaration spelling and `checkObjectSchema` (rows G3/G5,
  asserted unmoved), 0154's identifier pass and its `fieldNames` retention,
  bug 0039's `params:` lowering freeze and 0035's 37-cell lock, the post-type
  spelling `{a: integer as "w"}`, 0093's compound-position double emission,
  AJV's root-only meta-schema validation, and 0134's citation drift: all
  untouched, each asserted after the fix.
