# Changelog

All notable changes to `@bitmonk8/pi-theta` will be documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.59.0] - 2026-08-03

### Fixed

- **One declared value set written two ways lowered to two schemas, minted two
  slugs, and registered two respond tools** (bug 0055). `schema-subset.md` gives
  a single step-3 emission rule covering two source forms — "Enum (or
  string-literal union): `{ "type": "string", "enum": [...wire values...] }`" —
  and the implementation split it across two functions that were never
  reconciled. The named `enum` declaration emitted the spelled bytes; the
  anonymous string-literal union emitted the same `enum` array with the `type`
  keyword absent. Both fragments admit and refuse exactly the same JSON values,
  so no theta accepted or rejected differently, but the bytes are load-bearing in
  four places: the canonical schema hash that names a hoisted `__inline_<slug>`
  entry, the slug that names the registered respond tool and keys its
  registration cache, the QRY-15 instruction text the model is shown, and the
  AJV issue list that drives QRY-11 respond-repair. `enum Sev { Low = "low",
  High = "high" }` and `schema Sev = "low" | "high"` therefore produced different
  slugs and two permanent respond-tool registrations where the single emission
  rule implies one — and tool registration cannot be undone. An author moving a
  declaration between the two spellings changed the schema conveyed to the model
  and the repair instruction rendered back to it, without changing the declared
  type. The literal-union arm now emits the spelled form when every arm is a
  string literal, with `type` written first so the two spellings produce
  byte-identical fragments and collapse onto one slug and one registration; the
  respond-slug recipe hashes the serialised fragment and is key-order sensitive,
  so that order is part of the contract. A union of non-string literals keeps the
  bare `enum`, because the emission table spells the added `type` keyword for an
  enum or a string-literal union only and the typed form would refuse every value
  such a union declares; a single literal keeps its `const`. Respond-tool names
  and `__inline_<slug>` names move for affected declarations — both are
  synthesised, never author-written, and the collision with the equivalent named
  `enum` is byte-equal, so the registration cache reuses one entry. The wire
  envelope decision, argument coercion, and the sidecar's named-enum positions
  are unchanged, the last because it keys off the source type kind rather than
  the lowered bytes. No source-language change, no new diagnostic, and no
  registry edit: the emission table already spelled the bytes the code now emits.
  The `params:` position, a literal arm of a mixed union, and a generic
  argument's element type reach a different lowerer and keep their permissive
  fragments.

## [0.58.0] - 2026-08-02

### Fixed

- **A top-level union of object types at a `@<T>` annotation was read as ONE
  inline field list, so the query enforced a shape nobody wrote** (bug 0053).
  `grammar.md` admits `Type "|" Type` over `ObjectType` arms, and
  `schema-subset.md` (SUBS-1) lowers such a union to `{"anyOf": […]}` with each
  inline object arm hoisted under `__inline_<slug>`. The annotation lowering
  instead asked whether its source began `{` and ended `}` — a positional test a
  union satisfies, because its first arm opens the source and its last arm
  closes it — and handed the interior to the inline-object path as a field list.
  `@<{a: integer} | {b: integer}>` therefore lowered an object requiring a
  single property `a` whose type asserted nothing and refusing every other
  property: QRY-22 rejected `{"b":1}`, the author's own second arm, while
  `{"a":null}` and `{"a":"not an integer"}` — matching neither arm — bound as
  the typed value. The same fragment was registered as the respond tool's wire
  schema and interpolated into the QRY-15 instruction and the QRY-12 repair
  follow-ups, so repair drove the model towards a payload the theta could not
  use, and the same lowering governed `invoke<T>` return values. The identical
  predicate in the name walk swallowed the `theta/parse/unresolved-named-type`
  a name inside either arm owes, at the `@<T>` annotation and the alias RHS
  both, so a typo in a union arm refused the theta or not depending on whether
  a primitive arm happened to be written last. Both dispatches now ask the
  structural predicate the shared lowering already owned — whether the `{` at
  index 0 is closed by the `}` at the final index — so a genuine single
  enclosing brace group keeps its object-rooted fragment byte-for-byte
  (`@<{}>` included) and everything else falls through to the per-arm union
  path, producing the document the named spelling `schema X = …` plus `@<X>`
  already produced for the same text. Affected annotations move from an
  object root to an `anyOf` root, so the respond tool now registers under the
  single-property `value` envelope and its `__theta_respond_<slug>` name
  changes with the bytes. No new diagnostic code and no registry edit: the
  `unresolved-named-type` row already named both positions, and GOV-15's
  diagnostic-registry carve-out covers the newly-refused typo inputs. The
  `params:` position keeps its own naive test and its bytes under bug 0039's
  freeze.

## [0.57.0] - 2026-08-02

### Fixed

- **An empty inline object type `{}` drew no diagnostic at any `Type` position,
  and the same two bytes meant two contradictory things** (bug 0045).
  `grammar.md` §"Inline object types" gives the empty inline object one
  disposition — `theta/parse/empty-schema-body`, the diagnostic an empty named
  schema body raises — unqualified by position and by nesting depth, and nothing
  implemented it. The type-grammar parser read `{}` into an object node with
  zero field types and the walk's object arm iterated that empty list, so every
  position the walk serves accepted it; the `invoke<T>` return annotation ran no
  type-grammar pass at all. Three lowerings then disagreed about what the author
  had asked for: `@<{}>` and `invoke<{}>` minted a closed object fragment that
  AJV accepts `{}` against and rejects every non-empty object, array, scalar and
  `null` against — the respond tool was registered with it verbatim, offering
  the model a reply schema no informative reply satisfies — while `{}` at the
  schema-field, alias-RHS and `params:` positions lowered the permissive `{}`,
  which accepts every JSON value at the argument and response boundaries. The
  walk now raises the registered code for a brace interior that carries no token
  and closes, reaching the `let` annotation, `fn` parameter and return types, the
  schema body field type, the alias/union arm, the `params:` field type and the
  `@<T>` annotation root in one edit; `invoke<T>` gains one call selecting that
  rule alone, so the three checks that position never ran stay unrun there. One
  diagnostic per occurrence, in source order, at every nesting depth
  (`array<{}>`, `{ a: {} }`, a union arm). Malformed-but-non-empty interiors
  (`{ a }`, `{ "a": string }`, `{ a: }`) and an unterminated `{` keep their
  silence, the first because the grammar assigns them no diagnostic and the
  second because `ObjectType` requires the closing brace. The declaration
  renderings are byte-unchanged and the message interpolates the author's own two
  bytes at the inline positions: `'{}' has no fields; an empty schema cannot be
  validated.` The registry row's *Trigger* gains the inline case and the
  placeholder-rendering surface gains the matching `<X>` carve-out; the *Message*
  is untouched. No committed example or fixture carries the shape.

## [0.56.0] - 2026-08-02

### Fixed

- **The `bind_echo` success echo was composed without the shared system-note
  rule-1 pass, so a bound `params:` value carrying a line break broke the note's
  own one-line contract** (bug 0087). `binder/defaulting-system-note-echo.md`
  names "the echo's interpolated values" as one of the three substring classes
  whose `\r`, `\n` and `\r\n` must collapse to a single space before the note is
  composed, and the quote rule's own justification for escaping only `"` and `\`
  is that newlines cannot reach the formatter. Nothing performed the collapse:
  the production emitter applied the 120-code-point cap and no other rule, so a
  raw U+000A reached the renderer, failed the unquoted predicate, and was
  emitted verbatim inside the quotes. A declared default of `"a\nb"` —
  author-controlled, evaluated by the runtime with no model in the loop — put
  the user-facing `Running /<name>: …` note on two physical lines, and a crafted
  break forged a complete second `Running /<other>: …` line inside one note's
  content, so a consumer splitting the channel on newlines read an echo for a
  theta that never ran. The renderer now applies rule 1 per interpolated value,
  before the quote predicate and the escape pass, covering the `string` and
  `enum` arms and, through their leaves, the array and object arms. The
  whitespace set stays the six ASCII characters the rule enumerates, so U+00A0
  and the other non-ASCII whitespace survive verbatim; the cap still runs last
  over the collapsed line; and the `Running /<name>: ` prefix, the `, `
  separator and the `(default)` tag are theta-controlled text that is not
  sanitised. Because the trim runs before the predicate, a value whose only
  out-of-set characters are at its edges now renders unquoted — `"\nplain\n"`
  renders `plain` — and a value that sanitises away renders `""`. No BNDR-6
  reference rendering moves.

## [0.55.0] - 2026-08-02

### Fixed

- **A `let` binding's declared type annotation was discarded after the
  initialiser check** (bug 0083). The annotation was resolved, used to check the
  initialiser, and then dropped: the binding was recorded with the
  *initialiser's* inferred type, so every later reference resolved that instead
  of the declared type. The divergence ran both ways. Where the annotation was
  wider, the declared widening was lost and the guard it exists to arm never
  fired — `let n: number = 1` followed by `let m: integer = n` reported
  nothing, because the check saw `integer → integer` rather than the
  `theta/parse/integer-narrowing` that `lexical.md` §"Number literals" reserves
  for that direction. Where the annotation supplied what the initialiser could
  not, the information was lost and a check fired that should not —
  `let e: array<string> = []` followed by `e.join(",")` drew a false
  `theta/parse/non-string-array-join`, because an empty literal types as
  `array<unknown>`. That second shape is the accumulate-then-join idiom
  `control-flow.md` prescribes, so the recommended program did not load.
  The binding is now recorded with the declared type when the annotation
  resolves, in its TYPE-11-transparent form so an alias of an array remains a
  legal `for` iterand and still answers the `array.join` element-type
  precondition; an unresolvable annotation continues to fall back to the
  initialiser's type. No diagnostic code, registry row or trigger changed, and
  no shipped example or fixture changes disposition.

## [0.54.0] - 2026-08-02

### Fixed

- **`theta/parse/unresolved-named-type` fired for reserved-keyword-shaped text,
  which is not a `NamedType`** (bug 0044). `NamedType ::= Ident`, and reserved
  status is precisely what stops a keyword being an `Ident`, but the resolution
  walk behind four of the row's five positions tested a bare
  `^[A-Za-z_][A-Za-z0-9_]*$` shape regex and looked the result up in a map built
  from declaration names — which no keyword can ever be in. Every keyword
  spelling therefore missed and was reported as a name the file fails to
  declare, advice `lexical.md` forbids taking. `schema X = void` and
  `schema X { f: void }` emitted the correct `void-in-non-return-position` and
  then a false `unresolved named type 'void'`; at the `params:` right-hand side
  and the `@<T>` annotation, where `void`'s own row was not wired, the false one
  was the only diagnostic; and 25 of the 32 keywords drew the row alone or
  beside residue at the schema-body field and `@<T>` positions, 27 at
  `params:`. `lowerTypeExpr` now classifies a reserved spelling before the
  `NamedType` resolution can reach it: the other 24 spellings draw the
  registered `theta/parse/reserved-keyword-as-identifier`, and `void` draws its
  own row — now wired at all four positions — alone. No registry edit: every
  code was already registered with a trigger covering the position it fires at.
- **`true` and `false` were refused as `Type` atoms in a mixed union and
  anywhere on the `params:` right-hand side** (bug 0044, second element). Both
  are reserved keywords *and* `LiteralType` atoms, and only the boolean
  spellings match the identifier regex, so `schema X { f: true | string }` and
  `params: p: true` carried an `E` and did not load while `f: true` alone and
  every string, number and `null` sibling loaded. The arm also vanished from the
  lowered fragment — `true | string` lowered `{"anyOf":[{},{"type":"string"}]}`,
  which accepts every instance on one arm. Both now lower `{"const": true}` /
  `{"const": false}` and report nothing, matching what the top-level literal
  check already returned for the same atom. The lowered bytes feed the QRY-15
  instruction and hash into the `__theta_respond_<slug>` tool name, so affected
  annotations change respond-tool name — for inputs that did not load at all
  before.
- **`void`, `Result` and a generic-arity mismatch went unreported at the
  `params:` right-hand side, and `void` and arity at `@<T>`** (bug 0044, third
  element). The position-sensitive type-grammar checks were wired at the
  schema-body field type and each alias arm only, so the registry rows that
  already name "a `params:` field type" and "type ascription" among their
  trigger positions had no implementation there. Both positions now run the
  check — the `params:` field at the schema-feeding position, the `@<T>`
  annotation at the ascription position, where `Result` stays admitted as
  `grammar.md` §Type grammar specifies.

## [0.53.0] - 2026-08-02

### Fixed

- **A union whose last arm is a generic application was captured whole as one
  generic and never split** (bug 0043). `lowerTypeExpr`, the single recursive
  lowerer behind four of the five registered `Type` positions, tested for a
  generic application before it split a union, and it asked that question of the
  whole source: a `<` anywhere past the first character plus a trailing `>`.
  Every union whose last arm ended in `>` answered yes on that arm's own closing
  bracket. `integer | array<integer>` lowered `{}` at the alias, `schema`-body
  field, `params:` and `@<T>` positions — an AJV envelope built from it accepted
  `"not an integer"`, `{"nope":true}` and `null` and rejected nothing — while an
  `array`-headed spelling lowered the wrong concrete type
  `{"type":"array","items":{}}`, so `params: p: array<string> | integer |
  array<boolean>` refused the `3` its own `integer` arm admits and accepted
  `[{"junk":1}]`, which no arm admits. The union split now runs ahead of the
  generic test, so each arm lowers on its own terms and is combined per SUBS-1
  (`{"anyOf":[…]}`, arms in source order). The lowered bytes are conveyed to the
  model in the QRY-15 instruction and hash into the `__theta_respond_<slug>`
  tool name, so affected annotations stop sharing one slug and, having an
  `anyOf` root, move from the pass-through respond-tool wire form to the `value`
  envelope — both forms already specified.
- **`theta/parse/unresolved-named-type` under-emitted for a name inside an
  `array`-headed union** (bug 0043, second element). `schema M = array<Ghost> |
  array<integer>` raised nothing, where the same undeclared name one arm later
  (`schema M = integer | array<Ghost>`) raised: the mis-sliced generic argument
  was never identifier-shaped, so it never reached the resolution arm. Each arm
  now lowers through that arm, and `Ghost` raises the same one diagnostic in
  every spelling at all four positions. No registry edit — the row's trigger is
  stated by position and already covered them; the code merely stopped
  under-emitting against it.

## [0.52.0] - 2026-08-02

### Fixed

- **Same-line residue after a complete `schema X = …` right-hand side was
  consumed with no diagnostic** (bug 0042). The alias/union capture ends where
  the declaration grammatically ends, and nothing owned what the boundary left:
  `schema X = Cat Cat` registered a one-arm alias and severed the author's
  second name into a no-op expression statement; `schema X = Cat |` dropped the
  dangling arm inside the declaration, so no token reached the statement loop at
  all; and `schema X = -1` kept a junk `"-"` arm that lowered to the permissive
  `{}`, leaving a `params:` field or `@<T>` annotation naming `X` validating
  nothing. All three loaded with zero diagnostics, while the same missing
  separator inside an object body (`schema S { f: Cat Cat }`) was rejected.

### Added

- **`theta/parse/malformed-alias-rhs`** — a `schema X = …` (or
  `schema X by f = …`) right-hand side that is not `Type ("|" Type)*` is now
  refused at parse and the theta does not register. Two shapes: an empty arm
  position (`= Cat |`, `= | Cat`, `= Cat || Cat`), reported at the declaration;
  and same-line residue — a boundary token the right-hand side cannot hold,
  sitting on the declaration's own line (`= Cat Cat`, `= -1`, `= string
  "junk"`, `= array<integer> 42`) — reported at that token. Unchanged: a
  right-hand side that yields no arm at all keeps `theta/parse/empty-schema-body`;
  a token on the next source line still opens the next statement, whether or not
  a trailing continuation trigger swallowed the newline; a stray `,` / `)` / `=`
  / `}` keeps `theta/parse/unsupported-feature` and a `{` keeps
  `theta/parse/bare-object-literal`; and the declaration's arms, range, lowering
  and the statement a severed residue parses as are all byte-identical — the
  code's only effect is its own emission.

## [0.51.0] - 2026-08-02

### Fixed

- **A `params:` right-hand side written as a YAML block mapping loaded with no
  diagnostic and accepted any JSON value** (bug 0041). The type side of a
  `params:` field is a type expression in the theta type grammar, which is
  inline text; a field written as nested YAML instead —
  `p:` over an indented `a: Triage` — spells no type expression, but the
  frontmatter read recovered the block's bytes for any non-scalar node and the
  lowering's catch-all absorbed them, so the field lowered to the permissive
  `{}`, AJV validated nothing for it at the argument boundary, a name declared
  nowhere was never resolved, and nothing at any severity said so. The same
  bytes were recorded as the field's declared type, and a two-key block broke
  the binder's `Parameters:` block across two physical lines, against the
  one-line-per-field and declared-type-display rules. The block sequence and
  the flow sequence reached the same silence.

### Added

- **`theta/load/params-type-not-expression`** — a `params:` field whose YAML
  value node is neither a scalar nor a flow mapping, and a field carrying no
  value node at all, are now refused at load and the theta does not register.
  Refused: a block mapping or block sequence written under the field name, a
  flow sequence, an alias, any other node kind, and the value-less forms `? p`
  and `params: {p}`. Unchanged: the inline object type `{a: Triage}` is a YAML
  flow mapping and is admitted; a scalar is admitted whatever text it carries
  (the check judges the node's shape, not its text); the ordinary value-less
  key `p:` (and `params: {p: }`) parses as a null scalar and keeps its
  disposition.

## [0.50.0] - 2026-08-02

### Fixed

- **Nothing reserved the synthesised `__inline_<slug>` `$defs` name against
  author names** (bug 0040). `$defs` is one flat table holding both
  author-declared names and the names the lowering pass mints for hoisted
  inline object schemas, and no rule said an author name may not be one of the
  minted forms. An imported binding named `__inline_<16hex>` that equalled a
  minted slug therefore collapsed two distinct declarations into one entry, in
  both field orders and with no diagnostic: the inline field's `$ref` resolved
  to the imported symbol's permissive `{}`, so a `params:` field declared
  `{q: boolean}` accepted any JSON value while its recorded declared type still
  read `{q: boolean}` — the accept-anything hole at the untrusted-input
  boundary that bug 0035 had closed, re-opened whenever the name agreed. The
  casing rule already refused the `schema` / `enum` spelling, leaving the
  import specifier's local binding as the one open name-introducing position;
  after bug 0039 the same collision also silenced a `schema` body field's own
  hoisted fragment, in a file that mentioned no import in its own text.

### Added

- **`theta/parse/import-reserved-synthesised-name`** — the schema subset's four
  synthesised-name forms (`__inline_<slug>`, `__theta_respond_<slug>`,
  `__theta_bind_<slug>`, `__theta_callee_<slug>__<post-rename-name>`, with
  `<slug>` exactly 16 lowercase hex characters) are now reserved against
  author-introduced names, and an `import` / `export` specifier whose local
  binding matches one of them exactly is refused at parse time. The bare
  prefix is not reserved: `__inline_zzz`, uppercase hex, and 15- or
  17-character hex runs stay legal, since none can equal a minted slug. A
  `.thetalib` may still declare `fn __inline_<16hex>`; the refusal fires where
  the name is bound.

## [0.49.0] - 2026-08-01

### Fixed

- **An inline object type nested inside another one was neither split nor
  lowered as a type** (bug 0039). Two mechanisms, three symptoms.
  `lowerInlineObject` split its field list on top-level commas without
  tracking brace depth, so `@<{a: integer, b: {x: integer, y: string}}>` read
  as the three entries `a: integer`, `b: {x: integer`, `y: string}` and minted
  a response schema carrying a phantom top-level `y` and a three-name
  `required` — QRY-22 then refused the author's own conformant reply
  (`{"a":1,"b":{"x":1,"y":"s"}}` failed on "must have required property 'y'")
  and accepted a shape they never declared, while QRY-15 showed the model the
  same phantom schema on every repair turn. Separately, no lowerer below a
  root had an inline-object arm at all, so a nested object's shape and names
  were dropped even without a comma: `theta/parse/unresolved-named-type` was
  silent on a one-level-down typo at the `@<T>` annotation, a `schema` body
  field type and the `schema X = …` alias right-hand side — the three
  positions the registry row's five-position list names beside the `params:`
  right-hand side, which already raised — and those two positions lowered
  `properties.<field> = {}` for a nested and a flat inline object alike.
  `lowerInlineObject`'s interior split now nests brace depth, and the shared
  recursive lowerer gained the hoisting inline-object arm the `params:`
  position has had since bug 0035, factored out so both call sites run one
  implementation: an inline object type in any type position hoists into
  `$defs` under `__inline_<slug>` and its enclosing field emits a `$ref`
  (schema-subset.md §Lowering Algorithm steps 2–3), each field's type recurses
  back through the literal sublanguage so a nested `"x" | "y"` still lowers
  SUBS-1's enum form, and the whole-file `$defs` closure absorbs the minted
  entries so no `$ref` dangles. A shape the lowering cannot derive stays
  permissive `{}`: `array<{…}>` keeps `items: {}`, an empty inline `{}` keeps
  its disposition at every position, and a brace group the union split has cut
  in half keeps its per-segment lowering. Newly refused — under GOV-15's
  diagnostic-registry carve-out — is a `NamedType` resolving to nothing that
  the widened descent now reaches: inside inline-object fields at depth 1 or
  deeper, and inside a brace-group union arm, at those three positions. No
  registry edit: the row already named all five positions.
  `tests/inline-object-nested-lowering.test.ts` (58 tests) locks it, over the
  real load path, the production AJV validator and the respond-tool wire
  shape, with the minted slugs derived from an independent `node:crypto`
  oracle rather than from `schemaSlug`.

## [0.48.0] - 2026-08-01

### Fixed

- **The `TypeEnv` was a plain `{}`, so a `NamedType` naming one of the twelve
  `Object.prototype` own property names resolved as a declared type** (bug
  0038). Two symptoms, one mechanism. `let c: constructor = 3` reported
  `theta/parse/let-rhs-type-mismatch` against a type no declaration declares,
  in a parse where `theta/parse/unresolved-named-type` called the same name
  unresolved; and `let r = 1 + constructor` — a two-line body, no `schema`, no
  `fn` — threw `TypeError: Cannot read properties of undefined (reading
  'kind')` out of `parseThetaDocument`, taking down the whole compose pass so
  that every clean theta in the same discovery root went unregistered with no
  author-visible per-file diagnostic. The throwing surface needed no
  annotation: `s.toString + 1`, `toString() + 1` and `"x".toString() + 1`
  reached it through the static-type inference arms that mint a `named` type
  from an author-chosen name. `collectTypeEnv` now builds its record with
  `Object.create(null)`, matching the sibling declared-field record bug 0031
  null-prototyped one level down, and all eight read sites resolve through one
  exported `resolveNamed(env, name)` that answers own keys only — so the fix
  holds for a `TypeEnv` constructed anywhere, not only at `collectTypeEnv`.
  Each half is independently load-bearing and independently witnessed. An
  unresolvable name now answers `"unknown"` and defers to the runtime AJV net,
  which is what `type-system.md` §Unresolvable operands requires and what the
  registered `let-rhs-type-mismatch` trigger's "statically resolvable"
  qualifier already presupposed: the implementation moved to match the
  registry, so no row, trigger or code changed (DIAG-2 holds, H9a's
  permitted-code list untouched). No runtime change — both edited files are
  parse-phase. Locked by `tests/typeenv-prototype-names.test.ts` (78 tests):
  the wrong-diagnostic and throwing rows, the prototype-name family as a table
  over `Object.getOwnPropertyNames(Object.prototype)`, the load consequence
  through the shipped composition root over a temp discovery root, the engine
  pins on both env constructions, and the author-reachable `__proto__` write.
  Default gate 238 files / 3054 tests green, lint and typecheck clean; H8a 7/7
  and the full live suite 35/35 green.

## [0.47.0] - 2026-08-01

### Fixed

- **Placeholder-rendering §5's second `<key>` test vector labelled the bracket
  spelling `obj["kind"]` "A member access", the name `expressions.md:9`
  reserves for `a.b`** (bug 0037). The vector's substance was correct and
  locked — the `<key>` rule is a runtime predicate on the key string, and the
  rendered `missing object key: kind` is pinned at the renderer and at the
  emission site by bug 0036's tests — but a normative page named a grammar
  production its own quoted example does not use, contradicting the
  `expressions.md §Supported forms` naming authority a reader would reconcile
  it against. The sentence now reads "An indexed access `obj["kind"]` …",
  matching `expressions.md:10`; every other byte, including the rendered
  string and the identifier-shape parenthetical, is unchanged. Prose only: no
  behavioural surface, no registry edit (DIAG-2 holds — the
  `theta/runtime/missing-object-key` row already covered both spellings since
  bug 0032), no `docs/reference/` mirror repeats the vector sentence, no test
  file changed, and the sibling `:19` vector is left as found so the verbatim
  quotation of it in the 0036 lock does not stale. No test witness exists and
  none was manufactured: the only mechanism that reads the page is the
  closing gate, whose full output is byte-identical across the substitution
  (2217 findings, gated arms empty both sides), and the sole constructible
  witness — a prose-matching assertion — would invert DIAG-4. Default gate 237
  files / 2976 tests green, lint and typecheck clean, H8a 7/7 green as
  no-regression cover.

## [0.46.0] - 2026-08-01

### Fixed

- **The repeat-`session_start` supersession pass never awaited
  `handle.whenIdle()`, so a superseded-generation rebuild already in flight
  published into the drained registry and re-registered its slash names after
  the superseding generation had registered** (bug 0034). Pi's registration is
  last-writer within one extension instance and exposes no unregister, so every
  name the leaked rebuild carried dispatched `theta /<name>: extension shutting
  down` on a live session until `/reload`. The trigger was overlap, not an error
  path: any watcher rebuild whose debounce window closed during the superseding
  compose was in flight at the supersession instant. Now the pass, before any
  mutating step, reads the outgoing hot-reload handle, marks its debouncer
  torn-down, and bounded-awaits the in-flight rebuild against a cap the
  supersession path owns (`SUPERSESSION_QUIESCE_CAP_MS`, captured at the
  quiesce rather than at `session_shutdown` handler entry), then re-evaluates
  the staleness predicate before the fold, drain, detach, publish and
  registration — which still run in one synchronous run-to-completion. The
  settling rebuild therefore re-registers against a still-undrained
  generation-1 registry and generation 2's registration lands last. A repeat
  `session_start` delivery is now bounded-blocking on the superseded
  generation's rebuild; a rebuild still running at the cap is abandoned under
  the torn-down mark with no diagnostic. Spec: `#repeat-start-supersession`
  gains the normative two-act sentence (bound's existence contracted, not its
  value), PIC-57 records its second prescribed await site, and
  `theta/host/session-start-supersession-detach-failed`'s closed `details.call`
  set widens to two members. No new diagnostic code. Locked by
  `tests/supersession-inflight-rebuild-quiesce.test.ts` (6 offline tests over
  the real factory, hot-reload handle and debouncer; five neutralisation
  directions verified, including that the await rather than the mark closes the
  defect), with H8a, H9a 11/11 and the live double-`bindExtensions` witness
  green, and a scratch live probe proving the fixed path red-before/green-after
  on a real session.

## [0.45.0] - 2026-07-31

### Fixed

- **The `schema X = A | B` type-alias / union declaration did not parse: the
  head registered as a field-less schema, the shape was re-lexed as
  statements (`stray '='` / `stray '|'`), and the whole discriminated-union
  checker seam had no caller** (bug 0033). A normative theta 1.0 declaration
  form was absent (the parser implemented only the object form), the
  rejection was misattributed (`unsupported-feature` on punctuation;
  `immutable-rebinding` against an unrelated `let` for the `by` form), seven
  registered codes were unreachable from source, and `schema X by f { … }`
  loaded silently where rejection is prescribed. Now: `SchemaDecl` carries
  the alias/union arms and the optional `by` field; `parseSchema` dispatches
  four ways with bounded RHS capture (the swallowed continuation newline
  after `>` / `=` can no longer absorb the next statement —
  keyword/punct arm-boundary stops, inline-object arms consumed whole);
  `checkByClause`, `checkDiscriminatedUnion` (theta-side `by` resolution,
  literal-unions excluded as candidates) and `detectTypeAliasCycles`
  (participant-anchored diagnostics) run end-to-end, and each arm gets the
  same schema-feeding type-source checks as an object field; the RHS lowers
  per SUBS-1 (`anyOf` in source arm order for object unions) so alias names
  resolve concretely at `@<T>` and `params:`; `collectTypeEnv` registers
  transparent alias entries (TYPE-11/TYPE-4 gain reachable subjects) and
  omits cycle participants — a cycle-typed use previously crashed the
  worker process or threw `RangeError` out of the parse. Headless and
  mis-bodied heads draw `empty-schema-body`; `by` on an object body or a
  <2-arm RHS draws `by-on-object-schema`. Three Trigger-only registry
  widenings, no new code. Discharges 0025's and 0028's alias-form
  coordination clauses. Locked by `tests/schema-alias-union-decl.test.ts`
  (77 offline tests incl. real-AJV round-trips, cycle-crash regressions,
  and pinned residuals; three neutralisation directions verified; H8a 7/7
  twice and H9a acceptance 11/11 green).

## [0.44.0] - 2026-07-31

### Fixed

- **An inline object type on the `params:` right-hand side was discarded
  before it was lowered: `p: {a: Tirage, b: integer}` loaded clean, lowered
  `properties.p = {}`, recorded the field's declared type as the empty
  string, and raised none of the `theta/parse/unresolved-named-type` its
  sibling positions raise for the identical text** (bug 0035). Two frames
  dropped the same declaration: the frontmatter read substituted `""` for a
  non-scalar RHS (an unquoted flow mapping never reached the lowering at
  all), and the `params:` lowering had no inline-object arm (a quoted RHS
  fell to the permissive catch-all). Both closed: `extractParsedParams`
  recovers the author's own bytes by slicing the value node's range out of
  the frontmatter YAML text, and the new `params:`-scoped
  `lowerParamsFieldType` lowers a brace-rooted field — hoisting the
  anonymous object under `__inline_<slug>` (canonical schema hash) and
  emitting `{"$ref": "#/$defs/__inline_<slug>"}` per schema-subset.md
  §Lowering steps 2–3, with unresolved names sunk through the threaded
  resolution set so the typo raises byte-identically to the `@<T>` and
  schema-body positions. The interior comma split nests brace depth (a
  nested multi-field object is one field's type, not three), and the
  §Schema-slug collision posture's byte-equality check is wired
  (first-wins retention; differing bytes raise the registered
  `theta/load/schema-slug-collision`). `lowerTypeExpr` is untouched — no
  other position's lowered bytes move; `p: {}` and brace-under-generic
  shapes keep their dispositions; no spec or registry edit. The binder
  Parameters line now renders the declared inline type instead of `()`,
  and the AJV argument envelope validates the declared shape instead of
  accepting anything. Locked by
  `tests/params-inline-object-lowering.test.ts` (37 offline tests with an
  independent canonical-hash oracle and a real-AJV boundary group; three
  neutralisation directions verified; H8a 7/7 and H9a acceptance 11/11
  green).

## [0.43.0] - 2026-07-31

### Fixed

- **Schema-constructor field values were never checked against the declared
  field types: `Point { x: "hello" }` loaded clean and minted a
  `Point`-branded value** (bug 0031). The type-phase `object` arm recursed
  into field values and passed nothing down — no `checkCompatible` call, no
  `array<T>` element sink (an unimplemented member of grammar.md's
  exhaustive sink set) — while the identical value/type pairs one position
  over at a typed `let` all reported. Branded-but-malformed values falsified
  the compatibility engine's premise, and `Holder { r: Ok(1) }` smuggled a
  `Result` into the state `theta/parse/result-in-schema-position` exists to
  make unrepresentable. Declared field types are now carried into the
  `TypeEnv` (null-prototyped, own-key-guarded — theta field names may
  collide with `Object.prototype` members) and each constructor field in
  the literal∩declaration intersection is checked with the same engine the
  typed-`let` arm uses: incompatible → the new
  `theta/parse/object-field-type-mismatch` (DIAG-2 row + reference mirror +
  the type-system.md check-site enumeration entry, same commit); a
  `number`→`integer` narrowing → the registered `integer-narrowing`; an
  array literal under `array<T>` additionally rides the declared element
  sink through the registered `array-element-type-mismatch`; a
  `result-ctor` field value is rejected outright. Coverage matches the
  `let` position's (statically-resolvable operands only; residues r1–r5
  pinned silent). No runtime change — brand sites untouched. Locked by
  `tests/ctor-field-type-check.test.ts` (30 offline tests: w1–w5 red-first,
  intersection rule, c1–c7 controls, ten residue negatives,
  production-executor brand observables, prototype-collision pins, DIAG-4
  drift guard; both directions verified; H8a + H9a acceptance green).

## [0.42.0] - 2026-07-31

### Fixed

- **Member access on an absent name bound raw JS `undefined`, an out-of-model
  value: `o.absent == null` was `false`, `o["absent"]` panicked on the same
  name, and expressions.md prescribed no absent-member disposition**
  (bug 0032). `evaluateMemberAccess` guarded only `null` and read the
  property unfiltered, so a typo'd or missing field yielded a value outside
  `ThetaValue` that the in-language absence test reported as present
  (`== null` → `false`), stringified as `"undefined"`, survived constructor
  and array storage, and aborted the theta as `internal-error` one read
  later — while the index spelling of the same name panicked and `has(k)`
  answered correctly. The spec is amended first (expressions.md member
  bullet, error-model.md panic bullet, the `missing-object-key` registry
  row's Trigger — a DIAG-2 same-commit widening — and the reference
  mirror): member OR indexed access on an absent theta-side name panics
  with the existing `theta/runtime/missing-object-key`; the panic list
  stays closed at six. One shared presence gate (`assertKeyPresent`) is now
  the single construction site for the panic — both spellings render one
  absent name byte-identically through bug 0036's category-5 interpolation
  point — ordered after the `null` guard and bug 0027's receiver gate.
  `Enum.Variant`, `length` on `string`/`array`, `has`/`keys`, and the
  parse layer are untouched. Discharges bug 0027 §Fix (0.39.0) residual
  (i); control i7 re-anchored to the unit seam (its in-language probe was
  this bug's own bind). Locked by
  `tests/absent-member-presence-gate.test.ts` (34 offline tests through the
  production executor, every red naming its pre-fix leak; both directions
  and the one-construction-site property verified; H8a live acceptance
  green).

## [0.41.0] - 2026-07-31

### Fixed

- **`MissingObjectKeyPanic` interpolated `<key>` bare-always, so `o["my-key"]`
  rendered `missing object key: my-key` where placeholder-rendering §5's own
  normative vector pins `missing object key: "my-key"`** (bug 0036). The one
  emission site (`evaluateIndexAccess`, `runtime-panics.ts`) built the message
  with raw template-literal interpolation, bypassing the conformant category-5
  renderer that sat in-tree with zero production callers — the suite affirmed
  the §5 rule at the unit level while the wire behaviour diverged from it.
  The site now routes through
  `renderSourceDerived({ kind: "key", text: key })`: a non-identifier-shaped
  key renders double-quoted (preserving the stringly-`"25"`/numeric-`25`
  distinction), an identifier-shaped key stays byte-unchanged bare, per the
  §5 predicate and its reserved-keyword carve-out. No spec amendment, no
  registry edit, no new code; H9a's permitted-code list unchanged. Discharges
  bug 0027 §Fix (0.39.0) residual (iii). Locked by
  `tests/missing-object-key-rendering.test.ts` (7 offline tests — executor
  route and direct throw site, both directions verified; renderer-side §5
  vector pins untouched; H8a live acceptance green).

## [0.40.0] - 2026-07-31

### Fixed

- **A throwing supersession detach was swallowed with zero evidence, and
  `detach()`'s fallible-first step order skipped every containment mark, so
  a debounce window pending at supersession still drove one
  superseded-generation reload pass that published and re-registered against
  a drained registry** (bug 0029). `HotReloadHandle.detach()` ran its one
  fallible step (`unsub()` — in production a chokidar `close()`) first, so a
  synchronous throw skipped `debouncer.cancel()` and both torn-down marks —
  the two guards the spec's no-rebuild-after-supersession MUST rests on —
  and the factory's catch was `void e`: no diagnostic, no note, no stderr.
  `detach()` is now containment-first (`tornDown = true;
  debouncer.markTornDown(); unsub();` — the `quiesceOnStaleCtx` order, for
  both callers), so a throwing unsub strands only OS-level watcher handles
  and no superseded-generation reload can start; and the swallow now emits
  exactly one `theta/host/session-start-supersession-detach-failed` (W)
  through the bootstrap diagnostic sink — `session_start supersession detach
  failed at <call>: <error>`, `details.call = "hotReloadHandle.detach"` —
  defended by its own catch so a throwing sink cannot abort the superseding
  pass. Spec: new DIAG-2 row in `code-registry-host.md` (live-session
  routing exception noted), a normative catch-and-emit sentence in
  `registration-steps.md#repeat-start-supersession`, `diagnostic-shape.md` /
  `docs/reference/diagnostics.md` channel corrections, and the slug appended
  to H9a's permitted-code list. In-flight-rebuild gap remains bug 0034.
  Locked by `tests/supersession-detach-throw-containment.test.ts` (4 offline
  tests, both directions verified; live double-session-start and H9a
  acceptance green).

## [0.39.0] - 2026-07-30

### Fixed

- **Runtime receiver dispatch classified by JS `typeof`, so enum and `Result`
  values took the object read surfaces and exposed their reference encoding
  to ordinary theta code** (bug 0027). `s.keys()` on an enum value answered
  the boxed-`String` carrier's index properties (`["0","1","2","3"]`),
  `s["0"]` read one character of the wire string, `s.length` read the
  wrapper's own `length`, and `r.ok` / `r.keys()` read the `Result`
  discriminator and payload outside the closed `Ok`/`Err`/`match`/`?`
  observation surface — while any *other* member (`s.toUpperCase()`,
  `r.bogus()`) aborted the theta as `theta/runtime/internal-error` where
  expressions.md pins a diagnosis "rather than a runtime failure". One shared
  classifier (`isObjectValue`, false for enum and `Result` values) now gates
  all four read entry points — both stdlib-method hosts in lockstep, the
  widened indexed-access guard (whose whole input class, primitives included,
  now carries a registered code), and member access — rejecting the read
  with the new registered runtime-defect-surface code
  `theta/runtime/non-object-receiver` (`non-object receiver: cannot read
  <read> on <receiver kind>`), routed like `internal-error` and deliberately
  not a panic: the closed six-source panic list is untouched, `match` and
  `?` are unaffected, and an out-of-model receiver (bug 0032's `undefined`
  bind) keeps its internal-error disposition. Spec: new DIAG-2 registry row,
  the error-model runtime-defect surface admits registered non-panic
  rejections, and the two new placeholders join the placeholder-closure
  carve-outs (`<read>` bespoke, `<receiver kind>` closed-enum). Locked by
  `tests/non-object-receiver-gate.test.ts` (37 offline tests through the
  production executor, byte-exact template pins, both directions verified).

## [0.38.0] - 2026-07-30

### Fixed

- **A typed-query annotation naming no lowerable declaration lowered to the
  accept-anything `{}` with no diagnostic, so the QRY-22 gate validated nothing
  and any payload bound as the typed value.** `lowerTypeExpr` had one
  unresolved arm — push the name onto a list, return `{}` — and whether that
  became a diagnostic was decided entirely by which caller built the context.
  `parseParams` read the list back and errored; `lowerTypeSource` built a fresh
  list and discarded it, and every non-`params:` lowering site sat above
  `lowerTypeSource`. Three resolution gaps fed the arm. `buildBodyTypeMap` and
  `buildBodyTypeSchemas` lowered schema bodies single-pass in declaration
  order, so `Tree.children: array<Tree>` lowered `items: {}` always and
  `Person.pets: array<Animal>` lowered `items: {}` exactly when `Animal` was
  declared after `Person` — the declaration order of `schemas.md` §Recursion's
  own normative example, whose specified emission is `$ref`. `schemaDeclsOf`
  filtered `kind === "schema"`, so a declared `enum` at the annotation root
  never resolved and lowered `{}` where `schema-subset.md` §Lowering Algorithm
  step 3 pins `{"type":"string","enum":[…]}`. And a name declared nowhere — one
  typo'd letter in `@<Tirage>` — parsed diagnostic-identically to the correct
  spelling, marked the query typed, and validated the response against `{}`,
  while the sibling `params: { a: Tirage }` position failed the load with
  `theta/parse/unresolved-named-type`. `invoke<T>` and the FN-6 `subagent fn`
  return boundary shared every position through the same lowering call.
  Fix, in one commit. `buildBodyTypeSchemas` now runs three passes: pass 1
  seeds a placeholder for every top-level `schema`/`enum` name before any body
  lowers, pass 2 lowers each body against the fully seeded map while mutating
  the pass-1 placeholder identity in place, and pass 3 attaches a flat
  transitive `$defs` closure. Forward, mutual and self references resolve by
  construction, and `pruneDocumentDefs`'s missing-fragment guard is satisfied
  because every minted `$ref` carries a registered body before the hoist walk.
  `parseParams` gains the matching `hoistNestedDefs` step, without which a name
  reachable only through another name's nested `$defs` dangled from the params
  document root and the raw AJV `MissingRefError` escaped the binder dispatch
  after the binder call had spent tokens; this also heals the pre-existing
  backward-chain break, so `params: p: Item` with `Item.loc: Loc` now compiles
  and rejects a bad nested payload. `schemaDeclsOf` gains the sibling
  `enumDeclsOf`, passed at both `lowerQueryResponseSchema` call sites.
  An error-severity `theta/parse/unresolved-named-type` now fires at every
  position `lowerTypeSource` serves — the `@<T>` annotation root (which covers
  the inline-object annotation's fields and the direct-`let` form whose
  ascription propagates into `QueryExpr.schema`) and the `schema` body field
  type — emitted from a threaded resolution set rather than from the lowering
  result, because `collectBodyTypes` maps alias-form and imported names to `{}`
  deliberately, *as resolved*. No registry edit: bug 0025 wrote the widened
  four-position row, and this change implements the two positions it
  over-stated. `lowerQueryResponseSchema` stays a total function returning `{}`
  — with the parse gate in place the seam is unreachable for this input from
  source, so it remains defence in depth. A `Result<T, E>` annotation is peeled
  to `T` with a brace-aware argument split, so
  `let r: Result<string, QueryError> = @`…`` and
  `let r: Result<{a: string, b: integer}, QueryError> = @`…`` keep loading while
  a typo on the `T` side is still refused.
- **The respond tool is registered with a wire envelope, and nested `$ref`
  parameters are coerced at the argument boundary.** Live verification of the
  above found two shapes that could not be conveyed to a real model at all. A
  tool call's `arguments` are a JSON object at the wire and the host validates
  them against the registered `parameters` before `execute` runs, so the enum's
  non-object root rejected every call the model could emit (`root: must be
  string`, `Received arguments: {}`) and the drive repair-spun into
  `theta/runtime/reload-teardown-timeout` with the invocation still in flight;
  the pre-existing `@<string>` path did the same. And models deliver a nested
  object parameter as a single JSON-encoded string, which the host's own
  coercion does not parse, so every schema with a nested named-schema reference
  came back as `pet: must be object` and spun — including the *backward*
  reference that already minted a `$ref` before this change.
  `src/runtime/respond-tool-wire.ts` (new) is one recipe feeding the on-session
  registration, the off-session entry and the QRY-15/QRY-12 template input. An
  object-admitting root — and the `{}` total-function residual — is its own wire
  schema byte for byte; every other root (a `type` excluding `object`, an
  `enum`/`const` literal set, an `anyOf`/`oneOf` union, a root `$ref`) is
  carried under `{"type":"object","properties":{"value":<lowered>},"required":["value"]}`
  with the root `$defs` table lifted to the envelope root, because a
  `#/$defs/<Name>` pointer resolves against the document root alone. The
  payload is recovered through one boundary function at the three arrival sites
  (the live `execute`, the off-session free-phase servicing, the forced
  dispatch's extraction), so the CIO-3 depth walk, the QRY-14 `execute` verdict
  and the QRY-22 loop validation all still run over the bare payload against
  the bare lowered schema; `<slug>` and the PIC-44 canonical bytes stay keyed
  to the lowered schema. A call carrying no `value` member is taken verbatim so
  it fails validation and enters respond-repair rather than being rewritten to
  an absent value. `coerceRespondWireArguments`, wired through
  `ToolDefinition.prepareArguments` (pi's own pre-validation shim, and the only
  hook that runs before the host validates), parses JSON-string-valued
  object/array positions back before validation: schema-directed, so a declared
  `string` field keeps a JSON-looking value; encoding-only, so a parse yielding
  the wrong type still reports the real mismatch; and `$ref`-following with a
  chase bound. `query/query-tool-loop.md` gains normative §Respond-tool wire
  schema; QRY-12, QRY-14, QRY-22 and `implementation-notes.md` are amended to
  denote the wire schema where they described the lowered one. No new REQ-ID,
  no new diagnostic code, and an object-rooted typed query registers and
  conveys the same bytes it did before.
  Locked by `tests/unresolved-annotation-lowering.test.ts` (40 cells),
  `tests/respond-tool-wire.test.ts` (24 cells), strengthened depth-enforcement
  assertions in `tests/query-schema-transitive-defs.test.ts`, and the live twin
  `tests/live/typed-query-wire-shapes.test.ts` — a declared `enum` root and a
  forward-declared nested `$ref`, each driven end to end against a real model
  and raced against a wall bound, because the pre-fix behaviour of both is
  non-termination. Bug
  [0028](docs/bugs/0028-unresolved-annotation-silent-permissive-lowering.md);
  the `params:` right-hand side's remaining inline-object gap is filed as
  [0035](docs/bugs/0035-params-rhs-inline-object-under-emission.md).

## [0.37.0] - 2026-07-30

### Fixed

- **A constructor naming a schema that does not exist — or naming an `enum` —
  loaded with zero diagnostics and evaluated to an unbranded plain object, the
  exact value the bare-object-literal ban exists to prevent.** `checkObjectExpr`
  was the whole static story for `Schema { field: expr, … }` and checked only
  field-set presence, both of which need the declared shape; a constructor name
  missing from the same-file object-schema map therefore took a silent defer
  arm. Three classes collapsed into one — a name resolving to no declaration, a
  name resolving to a declaration that is not brace-constructible, and an
  imported `.thetalib` symbol whose field bodies are genuinely unavailable — and
  the first two inherited the third's silence. `Mystery { r: Ok(1) }` evaluated
  through the same executor arm a declared constructor uses, failed
  `resolveSchema`, and returned the field object with its name discarded and no
  brand. Because the inferred type was the nominal placeholder `named
  "Mystery"` and the compatibility engine maps an unresolvable name to
  `"unknown"`, the value also passed every annotated sink: `let p: Point =
  Mystery { … }` and `let n: number = Mystery { a: 1 }` both loaded clean. A
  misspelling of a declared schema produced no signal at any phase, while the
  same name one brace apart (`let a = Mystery`) was
  `theta/parse/unknown-identifier`.
  Fix, spec first.
  `docs/spec_topics/diagnostics/code-registry-parse.md` widens
  `theta/parse/unresolved-named-type` (DIAG-2) from the `params:` right-hand
  side to a closed four-position list — `params:` RHS, `@<T>` query annotation,
  `schema` body field type, object-constructor name — with resolution stated as
  whole-file over the body's top-level declarations, and with the constructor
  position carrying the added requirement that the resolved declaration be
  brace-constructible. One row, one message (`unresolved named type '<name>'`),
  severity `E`; the row is shared with bug 0028, which lands code only.
  `docs/spec_topics/expressions.md` §Object construction gains the matching
  normative paragraph. In `src/parser/theta-document.ts`, `checkStructural`
  takes the whole-file type-declaring universe already built by
  `collectBodyTypes` — not `collectIdentRoots`, which folds in `params:` field
  names, `tools:` callable names and the stdlib builtins — and `checkObjectExpr`
  classifies a name its object-schema map misses: an imported symbol defers
  whatever its kind, because the importer's parse holds neither its field
  bodies nor its kind; an `enum`, a `schema` declared without an object body,
  and a name resolving to no top-level declaration each fire the widened code.
  No runtime change — the input never loads, so both brand sites and
  `resolveSchema` are untouched. `theta/parse/unknown-identifier` is not
  widened. Constructor field-*value* typing remains bug 0031.
  Previously clean-loading programs are newly rejected; the
  [GOV-15 diagnostic-registry
  carve-out](docs/spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  admits a trigger widening within a 1.x minor.
  Locked by `tests/ctor-unresolved-schema-name.test.ts` (24 offline cells: the
  DIAG-2 row contract, the reject fixtures including a nested constructor, a
  block-nested declaration, a variant-less `enum` and an alias/union head, the
  two imported-symbol defer cells, eleven controls holding the existing gates,
  and the shipped composition root refusing to register the theta) and by
  `tests/live/acceptance/ctor-unresolved-load-refusal.test.ts` (a real `pi -p`
  run whose prober turns the refusal into a positive stdout sentinel while a
  matched-pair control still registers and drives). No new diagnostic code, so
  `tests/fixtures/h7a/permitted-codes.json` is unchanged.
  ([bug 0025](docs/bugs/0025-ctor-unresolved-schema-name-passthrough.md))

## [0.36.0] - 2026-07-30

### Fixed

- **After any re-bind of one extension instance — a shutdown-less repeat
  `session_start` (the bug-0021 supersession pass) or a start-after-shutdown
  rebind — every slash name whose `.theta` was still on disk went dead until
  `/reload`. The new pass's compose read `pi.getCommands()` for its
  cross-format collision check with no own-name exclusion, and Pi reports an
  extension's own registered commands with `source: "extension"`,
  indistinguishable from a sibling extension's, so generation 1's own
  `/greet` read as a foreign collision: the re-discovered `greet.theta` was
  dropped, no second `pi.registerCommand` issued, an error-severity
  `theta/load/cross-format-collision` note misdescribed the cause ("Pi-owned
  command 'greet' survives"), and the live `/greet` stayed bound to the
  superseded generation's registry — which the supersession drains — so every
  dispatch on the running session answered `theta /greet: extension shutting
  down`. The exclusion mechanism existed but was wired only to the hot-reload
  path, where it rested on a code comment and no spec text; step 3's own
  normative rule, keyed on `source` membership, literally mandated the
  self-drop.** Fix, spec first.
  `docs/spec_topics/pi-integration-contract/registration-steps.md` gains
  **PIC-69**: on every pass that consults `pi.getCommands()` for the collision
  check — first `session_start`, hot-reload, supersession, and
  start-after-shutdown rebind alike — the instance MUST exclude every entry
  that both carries `source: "extension"` and bears a name it itself passed to
  `pi.registerCommand`; the excluded set is pinned as the instance's own
  registration LEDGER rather than its current `ThetaRegistry` keys, and the
  exclusion is pinned source-conditioned, never name-only. Its companion
  clause `#surviving-name-re-ownership` pins that a surviving name
  re-registers against the new generation's registry and emits no collision
  diagnostic, while a name whose `.theta` is gone keeps the arm-(b)
  shutting-down note. Sibling indistinguishability is recorded in the pin as a
  known limitation. DISC-4 arm 2, `#superseded-entry-dispatch`, the
  `pi.getCommands()` completeness presupposition and the discovery reference
  carry the parallel qualification; `coverage-matrix.md` gains the PIC-69 row.
  In code, `src/extension/factory.ts` keeps a factory-closure ledger of every
  name passed to `pi.registerCommand` (stamped even when the call throws) and
  threads it through `composeInstance` into
  `src/extension/production-composition.ts`, which forwards it to the initial
  compose pass — where `undefined` was hard-coded — and prefers it over the
  registry-snapshot carve-out on hot-reload; `readPiOwnedCommands` now applies
  the exclusion after the source filter and gated on `source === "extension"`,
  closing the pre-existing hole where a name-keyed skip also hid a genuine
  `"prompt"` / `"skill"` collision. The registry drain is untouched: a removed
  name still fails safe with the spec-pinned note. Offline lock:
  `tests/rebind-self-collision-reownership.test.ts` (new, six tests — both
  triggers, the source-conditioning control, the ledger-vs-registry-keys
  discriminator, the removed-name control and the foreign-`extension`-entry
  control), plus `tests/double-session-start-supersession.test.ts`'s length-1
  witness flipped to 2. Live lock:
  `tests/live/double-session-start-live.test.ts` now witnesses re-ownership
  across a real `bindExtensions()` re-bind — no collision note, no
  shutting-down note at dispatch, the rendered outbound query text as the
  non-vacuity guard — alongside bug 0021's watcher-leak assertion; H9a 10/10
  green with no new stderr line and no new permitted code (bug 0024).

## [0.35.0] - 2026-07-30

### Fixed

- **Neither live suite tested whether a theta-owned stderr *line* was present,
  although three shipped fixes cite exactly that as their regression witness.
  H9a (`tests/live/acceptance/noninteractive-acceptance.test.ts`) is the only
  always-run black-box capture of the real `pi -p` process tree's stderr, and
  all three of its stderr-reading assertions score note *content*: the
  nine-area `assertCodesSubsetOfPermitted` extracts
  `theta/{load,parse,runtime}/<slug>` substrings and checks them against the
  permitted list, and area (e)'s two extra checks match `/cancel|aborted/i`
  and `theta/runtime/internal-error`. A `theta hot-reload quiesced:` line
  (bug 0021's live observable) carries no slug and no cancel token, so it
  passed all nine areas green; a `system-note delivery failed:` cascade was
  caught only when the quoted note happened to embed a non-permitted slug, or
  — in area (e) alone — `theta/runtime/internal-error`. H8a
  (`tests/live/live-production-acceptance.test.ts`) read stderr nowhere and
  had no capture mechanism at all, although bug 0018's fix record cites its
  "0-byte stderr capture" as the live verification observable. Separately,
  three live test file headers still opened with an `INTENDED-REASON RED
  (current state)` banner: the two H9a ones declared the suite's nine feature
  fixtures unauthored — resolved 1 h 48 min after the banner was written, when
  the paired commit authored all nine — and the H8a one declared the shipped
  composition root registers no `.theta`-derived slash command, false since
  `composeInstance` was wired (bug 0030).** Per AGENTS.md §"Verify both
  directions", a live assertion that cannot red is worthless; for stderr-line
  presence neither suite had one. Fix, three parts. (1) `assertStderrClean`
  (`tests/live/acceptance/harness.ts`) runs beside
  `assertCodesSubsetOfPermitted` at all ten H9a spawn sites, so a regression
  manifesting under one spawn shape reds where it happens; no tenth area is
  added and the `(a)–(i)` manifest contract is unchanged. The gate's form was
  fixed by measurement before it was written — one instrumented nine-area run
  recorded 0 bytes of stderr on all ten spawns, selecting the strictest branch
  of the bug document's own rule — so the gate asserts an EMPTY capture with a
  committed allowlist that ships empty; populating that allowlist reactively
  from a first red is forbidden, and weakening the form requires a re-recorded
  baseline. It is orthogonal to the permitted-code list: it rejects the
  delivery mechanism regardless of which code a line quotes, while the
  permitted list keeps governing note content on stdout — so
  `theta/runtime/internal-error` stays sanctioned as note content and is a
  defect when it arrives inside a `system-note delivery failed:` cascade on
  stderr. (2) H8a gains a file-scope `vi.spyOn(console, "error")` whose
  teardown asserts zero theta-owned lines before restoring the spy in a
  `finally`, putting a coded gate where bug 0018's cited observable lives; the
  spy writes through, so real diagnostics stay visible. Both gates read one
  shared prefix module, `tests/live/theta-stderr-prefixes.ts`, which imports
  `STALE_QUIESCE_STDERR_PREFIX` from `src/extension/stale-ctx.ts` rather than
  re-literalising it. (3) All three stale banners and their seven in-file
  echoes are replaced by current-state text — fixtures committed, suites
  green, correct-reason reds tracked through `docs/bugs/` — and the H9a
  invariant list drops the cancellation-propagation claim its area (e) rewrite
  had already relocated. `theta/load/extension-compose-failed`, minted by bug
  0023, is written into `tests/fixtures/h7a/permitted-codes.json`. Locked by
  32 offline tests in the default suite (`tests/acceptance-stderr-gate.test.ts`),
  which feed both predicates the five synthetic stderr lines and prove the new
  gate reds on the three the old ones missed; and red-proven at the live axis
  in both directions — one temporary `console.error` probe in the
  `session_start` handler made H9a area (a) fail from `assertStderrClean`
  naming the line and its class, and H8a fail from the spy's zero assertion,
  with both green again after the probe was removed. This gate witnesses a
  0021-class regression; it does not witness bugs 0023 or 0029, which are
  silence defects a stderr gate cannot red on.

## [0.34.0] - 2026-07-29

### Fixed

- **The shipped production composition omitted three of the seven seams
  `ThetaExtensionDeps` declares, so three implemented-and-unit-tested V-leaves
  were inert in the extension that actually ships: every bootstrap diagnostic
  the factory constructed was dropped by a `deps.emitDiagnostic?.()` optional
  chain (V9k/V9p) — a `pi.registerFlag` abort, a `pi.on` subscription failure,
  a per-theta `pi.registerCommand` failure, a `pi.getCommands` collision-pass
  read failure and any compose-pass throw all yielded no transcript note, no
  toast and no stderr line, although the registry's remedy column names
  `/reload` and so presupposes the operator learns a recovery is needed; the
  `RendererGate` was unwired at both ends, so the renderer-degrade route to
  `ctx.ui.notify` never engaged on the one surface the fallback chain exists
  for; and the step-0 capability probe had no caller in `src/**` at all, so an
  incompatible host — below the Node floor, missing an `AbortSignal` member,
  missing a factory-probable SDK member, carrying an out-of-range lock-step
  peer, or lacking a callable `Type.Unsafe` — was never refused at load and
  failed later as an uncaught `TypeError`, the outcome PIC-5's enumeration
  exists to prevent. The one catch that saw every compose-pass throw also
  labelled it `capability: "pi.registerCommand"`, so a `ctx.cwd` read failure
  in the discovery walk reported as a slash-registration failure (bug 0023).**
  One root cause: the default export constructed the factory with those seams
  absent, and every existing witness drove `createThetaExtension` with an
  injected recorder, so the offline suite was structurally blind to the
  production wiring. Fix, all four settled elements. (1) A two-tier bootstrap
  sink, `createBootstrapDiagnosticSink` — tier 1 (no `ctx` latched) delivers
  through the partial `pi.sendMessage` → `console.error` chain, the
  `ctx.ui.notify` rung being unreachable before any `ExtensionContext` exists;
  tier 2 (a `ctx` latched by the new `latchSessionContext` seam, called as the
  first statement of the `session_start` handler) delivers through the full
  `sendSystemNote` → `ctx.ui.notify` → `console.error` chain over channel deps
  built once per latched `ctx`, so the channel's stale-dead and
  fail-loud-once latches persist across emissions. Both tiers absorb an
  `isStaleCtxError` throw without delivering (PIC-67 clause (c)) and share one
  wrapped terminal `console.error` (PIC-54). Ten emission sites, all wired —
  the eleventh was the dead `runProductionRegistration` / `discoverFixtures`
  seam, deleted. (2) One `RendererGate` per extension instance, degraded on
  the renderer-registration catch and threaded to all three live
  `buildSystemNoteDeps` sites plus the hot-reload rebuild pass, so
  `system-note-channel.ts`'s degrade branch reads live state. (3)
  `runCapabilityProbe(createProductionProbeHost(pi))` runs in the default
  export before the first `pi.registerFlag` call; on failure it emits exactly
  one `theta/load/host-incompatible` through tier 1 and returns, issuing no
  `pi.register*` or `pi.on` call. The production `ProbeHost` snapshots the
  running process, the same `pi` object reference the factory was handed, the
  imported `typebox` `Type`, and a parent-walk `readPeerVersion` that keeps
  walking past a name mismatch and `ENOENT` and propagates every other read or
  parse failure to `probe-failed`. Sub-step (f) stays in the compose pass, and
  that ordering discrepancy is now recorded in the spec rather than left
  implicit. (4) `theta/load/extension-compose-failed` minted for a throw
  escaping the whole `composeInstance` pass, with its own registry row and
  `/reload` remedy; `BootstrapCapability` stays closed and unchanged, because a
  compose throw is a distinct phase, not a sixth host call. Spec (DIAG-2): new
  row in `code-registry-load.md`, mirror row in `docs/reference/diagnostics.md`,
  the code added to placeholder-rendering §8's caught-thrown-value list, and
  the factory-time partial-chain rule pinned at all three prescription sites
  (`extension-bootstrap-and-per-theta.md`, the `host-incompatible` registry
  row, `capability-probe.md` clause (ii)). Verification: full default suite
  225 files / 2650 tests green; typecheck and lint clean. Offline locks:
  `tests/extension-bootstrap-production-wiring.test.ts` (7 tests, one group per
  element, all driving the shipped default export) and
  `tests/extension-bootstrap-sink-liveness.test.ts` (17 tests — tier
  selection, the PIC-67 obligation for the two guard-uncovered sites proven
  both directions, the production `ProbeHost` snapshot, and `readPeerVersion`
  at its exported seam), plus a production-export arm added to each pre-existing
  V9k/V9p witness asserting a delivery *arrives*. Red direction proven by six
  independent temporary neutralisations, one per element or new seam, every
  restore confirmed byte-identical: unwiring the sink reds 5 tests with the
  report's verbatim `got 0` signature, unwiring the gate reds 2 at the factory
  end and 1 at the parse-time channel, removing the probe call reds 1,
  restoring the `pi.registerCommand` label reds 1, and disabling tier 2's stale
  absorption reds the two invalidated-runtime tests while their live-runtime
  pair stays green. Live: `tests/live/double-session-start-live.test.ts` 1/1 —
  it boots the shipped default export twice in one instance, so step 0 runs
  against the real `pi` namespace, the real `process.versions.node` and the
  real installed peers, and the ctx latch fires on both `session_start`
  deliveries — and `tests/live/live-production-acceptance.test.ts` 7/7,
  including a real subagent child spawn that runs step 0 in a separate real
  process. The live axis was proven both directions too: making
  `readPeerVersion` answer `undefined` reds the double-session test with
  `Registered: []`, step 0 having refused the host before any registration.

## [0.33.0] - 2026-07-30

### Fixed

- **A schema ctor whose *declared* field was literally named `__thetaSchema`
  had that field silently destroyed: both ctor hosts assign every declared
  field as an ordinary enumerable property and then brand the object, and
  `brandSchemaValue`'s unconditional `Object.defineProperty` redefined the
  same key — legal, because the assigned property was still configurable —
  replacing both halves of it, the value (`"user-data"` → the schema name)
  and the descriptor (enumerable → frozen non-enumerable).
  `F { __thetaSchema: "user-data", x: 1 }` bound as `{"x":1}` with a healthy
  schema tag `F`, with no diagnostic at parse or runtime (bug 0026).** Every
  declared field is mandatory in a ctor, so a schema declaring the field
  forced *every* in-language construction through the destruction; the field
  was absent from `JSON.stringify`, `keys()`, the `valuesEqual` walk and the
  QRY-18 outbound render, while QRY-22 lowered it required and the schema
  closed — so a typed query showed the model `{"x":1}` and demanded
  `__thetaSchema` back, and a ctor-built value never compared equal to its
  wire-provenance twin. Honest reachability, as filed: the trigger requires
  an author to declare a field named after an interpreter internal, so
  accidental collision is improbable; when it fires it is deterministic and
  diagnostic-free. Root cause: the brand lived in the same string-key
  namespace as user field names. Fix: `ENUM_TAG`, `SCHEMA_TAG` and
  `RESULT_TAG` in `src/runtime/value.ts` are module `Symbol`s and
  `privateBrandOf` takes a `symbol` key — one migration of all three tags, so
  the collision class disappears wholesale rather than per-name. A symbol key
  is unreachable from `JSON.parse` and from theta-side object construction,
  which mint string keys only, so a declared `__thetaSchema` field and the
  brand occupy disjoint key spaces. Neither ctor host changed:
  `statement-executor.ts` and `production-theta-producer.ts` call
  `brandSchemaValue` exactly as before. The constructors keep their
  non-enumerable / non-writable / non-configurable install and
  `privateBrandOf` keeps the non-enumerable predicate — the descriptor
  posture bounds propagation through spread / `Object.assign`, which copy own
  enumerable symbol-keyed properties — so the enumerable-key forgery class
  closed by bugs 0017 and 0020 cannot re-open through the new encoding. Four
  code lines changed; JSON and wire output are byte-unchanged. The
  non-normative reference-encoding paragraphs of `runtime-value-model.md` and
  `type-system.md` re-anchor on the symbol encoding, and the bug-0020
  guarantee strengthens to hold unconditionally: a string key can never equal
  the symbol, so its enumerability no longer enters it. This also closes the
  brand-key half of bug 0027 — `obj.has("__thetaSchema")` answers `false`,
  indexed access raises the documented `MissingObjectKeyPanic`, and member
  access stops reading the brand (its probe rows E1–E3 and R1–R3); 0027's
  receiver-dispatch defect is re-scoped against this baseline and ships
  separately. Verification: full default suite 225 files / 2645 tests green;
  typecheck and lint clean. Offline lock:
  `tests/schema-brand-symbol-migration.test.ts` (12 tests — the unit
  destruction mechanics with the descriptor pinned before and after, the
  end-to-end ctor through the production executor with its zero-diagnostic
  parse admission, provenance-twin equality in both argument orders, the
  QRY-18 render at the `pi.sendUserMessage` seam through both ctor hosts, and
  the sibling-tag controls with a partial-migration guard). Red direction
  proven twice by temporary revert with byte-identical restore: reverting all
  three tags to strings reds exactly the 8 witnesses with the report's
  verbatim signatures, and migrating `SCHEMA_TAG` alone reds the
  partial-migration guard and only it. Live:
  `tests/live/live-production-acceptance.test.ts` 7/7 and
  `tests/live/hardening/recent-rfc-live-drives.test.ts` 3/3 — all three
  migrated brands driven end-to-end through a real provider.

## [0.32.0] - 2026-07-29

### Fixed

- **The enum and schema brands (`__thetaEnum` / `__thetaSchema`) classified
  by presence-only `hasOwnProperty`: any enumerable same-named own key —
  producible by `JSON.parse` of wire data and by ordinary theta object
  construction, parse-clean — forged the brand, corrupting `==` in both
  directions (structurally different tag-carrying objects compared equal
  through the enum arm's `String(value)`; a tag-carrying object never
  received the documented object comparison) and destroying the QRY-18
  interpolation render (`interpolationTypeOf` routed the forged object to
  the enum arm — `"[object Object]"` in place of the compact JSON, whole
  subtrees collapsing inside `translateInterpolationOutbound`); a forged
  `__thetaSchema` name let wire data select, by name, which declared
  schema's theta→wire renames were applied to its sibling fields (bug
  0020).** Honest reachability, as filed: the corruption is deterministic
  and offline-reproducible — including fully in-language, no wire — but the
  trigger key names are interpreter internals, so accidental collision is
  improbable, unlike bug 0017's ubiquitous `ok` field; wire-side, a forged
  payload passes the QRY-22 gate only through permissive `{}` lowering
  positions or a typed-invoke schema that declares the tag-named field.
  Root cause: the constructors install the tags non-enumerable, but
  `enumTagOf` / `schemaTagOf` tested bare key presence, discarding the
  descriptor distinction between a constructor-installed brand and arriving
  data exactly where it mattered — `isResultValue` (bug 0017, 0.27.0)
  already demonstrated the correct check three declarations away. Fix (bug
  doc Option 1): one module-private `privateBrandOf(value, tag)` in
  `src/runtime/value.ts` — the own-property descriptor must exist AND be
  non-enumerable (non-null-object and array guards unified) — with
  `enumTagOf`, `schemaTagOf`, and `isResultValue` all routed through it:
  one privacy posture, three tags; the enum/schema classifiers narrow the
  brand to `typeof "string"`, replacing the blind casts. Constructors are
  untouched (every construction site already installs non-enumerable
  through them), JSON/wire output is byte-unchanged, and every consumer
  (`valuesEqual`, `isEnumValue`, `interpolationTypeOf`, both
  `translateInterpolationOutbound` sites, the query render) inherits the
  fix. Review found an adjacent membership hole in the same forged-key
  class, closed here too: `valuesEqual`'s object arm tested membership with
  `hasOwnProperty`, which matches non-enumerable brands — a forged
  enumerable `__thetaSchema` key satisfied membership against a genuinely
  branded object (an asymmetric false-equal); membership is now
  enumerable-only (`propertyIsEnumerable`), mirroring the `Object.keys`
  walk. The non-normative reference-encoding paragraph of
  `runtime-value-model.md` now states the enum tag is recognised by the
  non-enumerable descriptor, never by key presence. Verification: full
  default suite 221 files / 2580 tests green; typecheck and lint clean.
  Offline lock: `tests/enum-schema-tag-privacy.test.ts` (20 tests —
  classifier units, genuine-construction controls, `valuesEqual` both
  directions, the QRY-18 render through the real private routing, the
  report's in-language `a == b` end-to-end, and the QRY-22
  permissive-`{}` admission with closed-schema rejection control as
  ingress documentation); 10 red at 655e4d39 with the report's signatures
  (forged classification `true` / `"Person"`; `valuesEqual` `true` on
  structurally different pairs; renders collapsing to `[object Object]`;
  in-language `a == b` `true`), green post-fix, red direction re-proven by
  base revert plus byte-identical restore. Live:
  `tests/live/live-production-acceptance.test.ts` 7/7 with two new
  witnesses — a QRY-18 enum-interpolation control (a genuine enum
  interpolated into a real typed query renders its bare wire string in the
  outbound text; red-proven by classifier mutation) and a
  forged-`__thetaEnum` wire-ingress witness (a spawned subagent child's
  PIC-59 envelope carries the forged tag through `invoke<Forged>` typed
  return-validation and the parent binds it as a plain object,
  interpolating byte-exact compact JSON; red-proven at the base revert,
  where the rendered segment collapses to `[object Object]`) — plus
  `tests/live/hardening/recent-rfc-live-drives.test.ts` 3/3.

## [0.31.0] - 2026-07-29

### Fixed

- **`?` applied to a member, index, or identifier operand bypassed both the
  ERR-18 static gate and `asResultValue` normalisation; the blind unwrap
  read `.ok` off a non-`Result`, silently corrupting in both directions — a
  valid value became a body failure whose `undefined` error payload the
  terminal surface laundered through `?? makeCancelledError()` into a
  fabricated `theta /<name> cancelled` (the STL-6 violation), and
  failure-shaped user data (`ok: true` / `ok: false` fields) became a
  success carrying `null` or a forged propagation — bug 0017's corruption
  signature surviving its fix (bug 0019).** Three layers: the static
  classifier is partial — `questionOperandKind` classified only `prim` /
  `literal` / `array` CompatTypes, and the inference pass types a member
  access as a nominal reference to its own field name, an index read as
  `named "index"`, and a call as `named <callee>`, so those operands never
  reached the ERR-18 check; no runtime net existed — `evalAsResult` returns
  member / index / binary / ternary / method-call operands raw (the raw
  path exists for `match` scrutinees, which need the true value for
  by-value arm matching) and `evalTry` blind-cast the raw value to
  `ResultValue`; and the fail-outcome surface mappers fabricate a
  `CancelledError` for an `undefined` error payload. Fix (bug doc Option 1,
  both halves): (a) a brand-based guard in `evalTry`
  (`src/runtime/statement-executor.ts`), after `evalAsResult` and before
  `evaluateQuestion` — a non-`Result` operand value throws the new
  `QuestionOperandDefectError` (`src/runtime/runtime-panics.ts`, beside
  `evaluateQuestion`), a plain Error routed to the
  `theta/runtime/internal-error` surface exactly like
  `PiToolArgShapeDefectError` (bug 0003) and
  `ShadowedCalleeDispatchDefectError` (bug 0016), its message naming
  ERR-18, the `theta/parse/question-on-non-result` gate, and a defensive
  value summary (`summariseNonResultOperand`: typeof / array length /
  schema-enum tag / capped key names — never values, never
  `JSON.stringify`); the blind cast is removed, and the placement after
  `evalAsResult` keeps `match` scrutinees, the bullet-1 implicit-`Ok` wrap
  (the pinned b-series `f()?`), and genuine stored-`Result` unwraps
  untouched. (b) `questionOperandKind` (`src/parser/type-layer-checks.ts`)
  widened: `union` and `object` CompatTypes now classify as non-result
  (display via `displayType`), so a union-annotated fn parameter under `?`
  is rejected at load; the `named` arm is deliberately untouched — the
  genuine-`Result` placeholders (`Ok` / `Err` / query results) live there.
  No new diagnostic code; the closed panic-source list and both code
  registries are unchanged. Verification: full default suite 220 files /
  2560 tests green; typecheck and lint clean. Offline lock:
  `tests/question-operand-defect.test.ts` — the bug doc's m1–m6 matrix plus
  the surface chain (s1), the genuine-`Err` note control (s2), and the
  identifier / index stored-`Result` pass-through controls; 7 red at
  7fa76517 with the pre-fix signatures (outcome `fail` with
  `error === undefined`; m4 outcome `success` carrying `null`), green
  post-fix, red direction re-proven by guard revert plus byte-identical
  restore. Static-gate cases red-then-green in
  `tests/match-result.test.ts`,
  `tests/type-layer-diagnostics-production.test.ts` (the exact message
  `'?' requires a Result operand; got number | string` pinned through the
  production route), and `tests/conformance/production-conformance.test.ts`.
  Live: `tests/live/live-production-acceptance.test.ts` 5/5 and
  `tests/live/hardening/recent-rfc-live-drives.test.ts` 3/3 (its drives run
  `?` over genuine live `Result`s on the guarded path — the false-positive
  witness); new live hardening witness
  `tests/live/hardening/question-operand-defect-abort.test.ts` pins the m1
  fixture end-to-end on per-turn `systemNotes`: exactly one
  `theta /bug0019m1 aborted with internal error: …` note naming ERR-18 and
  the gate code, zero `theta /bug0019m1 cancelled` notes — red-proven under
  guard revert (the fabricated cancellation reappears verbatim), restored
  green.

## [0.30.0] - 2026-07-29

### Fixed

- **A shutdown-less repeat `session_start` at one extension instance now
  supersedes the prior hot-reload generation instead of stranding it —
  supersede-before-publish detach + drain, a compose-generation zero-touch
  guard for overlapping starts, one repeat-start system note, and a
  `session_shutdown` whose teardown reaches every published generation
  (bug 0021).** The factory's live-resource slots — the step-5 teardown
  handle plus the four lazily-read teardown inputs (`liveRegistry` /
  `liveClock` / `liveActiveInvocations` / `liveForwardingSignals`) — are
  single-occupancy, and each completing `session_start` compose pass
  assigned all five unconditionally. A repeat `session_start` with no
  intervening `session_shutdown` — not reachable through the shipped CLI
  hosts, which always interpose `session_shutdown`, but reachable
  in-product through the public host SDK: `AgentSession.bindExtensions()`
  carries no once-guard and re-emits the stored `session_start` to the same
  factory closure — therefore overwrote the slots without superseding the
  prior generation: the superseded generation's armed watcher + debouncer
  leaked with no reachable teardown; its reloads kept publishing and
  re-registering live slash commands against the superseded registry; one
  `session_shutdown` tore down only the latest generation — superseded
  in-flight invocations never reason-stamped or aborted, forwarding
  listeners never detached, and the undrained superseded registry let a
  post-shutdown dispatch bypass the drain fail-safe; and in the overlap
  variant the LAST completer owned the slots, stranding the NEWER
  generation. Fix (bug doc Option 1 plus Option 3's diagnostic), all in
  `src/extension/factory.ts`: supersede-before-publish at the
  compose-completion publish site — fold the outgoing generation's
  in-flight invocation registry and forwarding-signal list into a
  factory-scoped supersession list, drain the outgoing registry so a
  stale-bound name fails safe at dispatch on the drain-state arm (b), and
  detach the outgoing watcher with the handle slot cleared first so no
  double-detach path exists; a compose-generation counter joins the
  bug-0022 compose-settle predicate as a second zero-touch disjunct
  (`composeTailSuperseded`), closing the overlap inversion — only the
  newest-started compose publishes, registers, and arms; the
  `session_shutdown` handler builds merged teardown inputs (the superseded
  generations in supersession order, then the latest) so one shutdown's
  sub-steps 2/3/5 reach every published generation, then consumes the
  supersession state synchronously — sub-steps 1/4 stay latest-only
  because superseded generations were already drained/detached at
  supersession time; and each shutdown-less repeat delivery emits exactly
  one system note (content byte-exact `theta: repeat session_start without
  session_shutdown; superseding prior hot-reload generation`), keyed on the
  shutdown count at the last compose start so a start-after-shutdown
  rebind emits none. Spec: `registration-steps.md` step 5 gains the
  `#repeat-start-supersession` pin (a repeat delivery is a supersession
  pass; at most ONE armed watcher across repeat deliveries; detach + drain
  before publish; the pinned note); `session-shutdown-semantics.md` gains
  PIC-68 (compose-generation evidence joining PIC-67's compose-settle
  suppression, the supersession fold, one-shutdown teardown reach);
  `coverage-matrix.md` gains the PIC-68 row. Offline lock: four tests in
  `tests/double-session-start-supersession.test.ts` (single-start control;
  sequential double start; overlap; start-after-shutdown rebind control) —
  tests 2 and 3 red at ea5de328 with 14 signature failures, green
  post-fix, red direction re-proven by base revert. Live witness (H8a):
  `tests/live/double-session-start-live.test.ts` — double
  `bindExtensions`, real chokidar churn across the 250 ms debounce, a
  shutdown-emitting dispose, a second churn, asserting ZERO
  `theta hot-reload quiesced:` stderr lines; green post-fix and red-proven
  at ea5de328, where exactly one quiesced line is captured (misattributed
  to bug 0018's bare-dispose path). Live regression witness:
  `tests/live/live-production-acceptance.test.ts` 5/5. Residual, filed as
  bug 0024: after any re-bind of the same extension instance, a slash name
  that survives into the new generation's discovery is collision-dropped
  against the instance's own prior `pi.registerCommand` registration (the
  `session_start` compose pass reads `pi.getCommands()` with no own-name
  exclusion, unlike the hot-reload pass), so the name's handler stays
  bound to the superseded drained registry and dispatch yields the arm-(b)
  shutting-down note until `/reload` — fail-safe, but the supersession
  pass does not re-own surviving names.

## [0.29.0] - 2026-07-28

### Fixed

- **The late-completing `session_start` compose tail now does nothing when a
  `session_shutdown` was consumed while the compose was in flight — no
  live-resource publication, no registration pass, no diagnostic
  construction, no watcher arming — closing the arm the bug-0018 fix left
  open (bug 0022).** The 0018 fix placed the PIC-67 generation check at the
  LAST step of `runComposeInstanceRegistration`, immediately before
  `installHotReload`, so after a shutdown was consumed mid-compose the tail
  still published the dead generation's `liveRegistry` / `liveClock` /
  `liveActiveInvocations` / `liveForwardingSignals` (a populated
  dead-generation registry no teardown would ever visit, drain state never
  set), ran `registerFixtures` — whose collision-pass `pi.getCommands` read
  is a guarded touch on the invalidated runtime — and on the catch arm
  emitted a diagnostic and ran the static-fixture fallback, all silent: the
  production default export wires no `emitDiagnostic`, and the delivery
  channel rides the invalidated runtime, through which PIC-67 clause (c)
  forbids any delivery attempt. Fix (bug doc Option 1): a single
  factory-closure-local predicate `composeOutlivedSession`
  (`shutdownEventsObserved !== shutdownsAtComposeStart`), evaluated
  immediately after `deps.composeInstance` settles, on BOTH arms — catch arm
  before the diagnostic and the static-fixture fallback, success arm before
  the `live*` publishes and `registerFixtures` — returns zero-touch on
  mismatch: no publish, no registration, no diagnostic construction, no
  stderr. The now-dead late check before `installHotReload` was folded into
  it (the tail is await-free after the check, so one check per arm
  suffices), and the predicate's comment marks it as the single decision
  site where future touch-free staleness evidence for the late tail joins
  as a disjunct. The shutdown-LESS mid-compose invalidation stays on the
  existing reactive paths — no new probe touch, preserving the PIC-67
  zero-touch pin for the shutdown-observed race. PIC-67's final requirement
  sentence (`session-shutdown-semantics.md#pic-67`) is extended: the MUST
  now names the whole suppressed continuation (live-resource publication;
  the registration pass on the success arm and the compose-throw catch
  arm's static-fixture fallback; diagnostic construction; step-5 watcher
  arming), states the joint PIC-57 attribution (not arming is
  PIC-57-correct; the rest is pinned by the sentence itself), and pins the
  compose-settle boundary: an in-flight compose is not cancelled — once the
  invalidation has landed its next guarded read dies reactively, and that
  swallowed in-flight read is not a violation of the sentence. Offline
  lock: six new tests in `tests/hot-reload-stale-ctx-replacement.test.ts`
  (5 red at the pre-fix HEAD + 1 green arming-suppression control) on the
  bug-0018 Case C harness with an `emitDiagnostic` recorder and a
  `gateBeforeCompose` seam — variant 1 (compose settled before the gate)
  locks zero `staleTouches` (HEAD: `["pi.getCommands"]`), zero constructed
  diagnostics (HEAD: one `extension-bootstrap-failed`, capability
  `pi.getCommands`), and the no-publish witness (a second
  `session_shutdown` finds nothing to tear down; `readDrainState()` stays
  `{ drained: false }`, where HEAD flips it to drained); variant 2
  (shutdown at the compose's first await) locks `staleTouches` to exactly
  `["ctx.cwd"]` — the compose's own in-flight death-read, nothing after the
  compose settles (HEAD: `["ctx.cwd", "pi.getCommands"]`) — and zero
  diagnostics (HEAD: two, the first mislabelled capability
  `pi.registerCommand`); the old Case C post-arm baseline was deleted, so
  Case C now locks the whole tail zero-touch from the consumed shutdown on.
  Live regression witness (the bug has no positive live observable):
  `tests/live/live-production-acceptance.test.ts` 5/5,
  `tests/live/acceptance/noninteractive-acceptance.test.ts` 10/10 (its
  permitted-codes assertion over stdout+stderr would fail on a
  `system-note delivery failed:` cascade quoting a non-permitted code),
  `tests/live/hardening/recent-rfc-live-drives.test.ts` 3/3. The two
  separable diagnostic-surface defects the report recorded — the production
  default export drops every bootstrap diagnostic (`emitDiagnostic`
  unwired), and the compose-supplier catch labels every compose throw
  `capability: "pi.registerCommand"` — are deliberately not folded in;
  filed as bug 0023.

## [0.28.0] - 2026-07-28

### Fixed

- **The hot-reload watcher now quiesces once on a shutdown-less runtime
  invalidation — one `ctx.cwd` stale probe at reload-pass entry, permanent
  teardown, a single designed `theta hot-reload quiesced:` stderr line — and
  the system-note channel marks itself permanently dead on a stale send
  instead of cascading `system-note delivery failed:` onto stderr
  (bug 0018).** A bare `AgentSession.dispose()` — a public host SDK API —
  invalidates the extension runtime without emitting `session_shutdown` first
  (every host replacement path — `newSession` / `switchSession` / `fork` /
  `reload` / quit — emits it), so the step-4 teardown never ran, nothing
  marked the debouncer torn-down, and the armed watcher outlived the runtime
  over stale captures: the debounced reload drove `runComposePass` into
  guarded `pi.*` / `ctx.*` surfaces that all throw the host's stale-ctx
  error, and both the load-diagnostic and the ERR-7
  `theta/runtime/registry-swap-failed` delivery attempts died on the same
  dead channel — two `system-note delivery failed:` stderr cascades, hot
  reload permanently dead for the session, no operator-facing note. The host
  exposes no non-throwing staleness probe and fires no event on the
  bare-dispose path, so the fix pins the reactive posture as the new PIC-67
  clause (`session-shutdown-semantics.md#pic-67`): each reload pass performs
  exactly one deliberate side-effect-free guarded touch at entry (`ctx.cwd`)
  and, on the recognised stale-ctx error (stable message prefix `This
  extension ctx is stale after session replacement or reload`; detection
  centralised in `src/extension/stale-ctx.ts`), quiesces permanently —
  debouncer marked torn-down per PIC-57, watcher detached, exactly one
  latched `theta hot-reload quiesced:` line per extension instance (one latch
  shared with the PIC-55 terminal-signal arm), no ERR-7 attempt through the
  invalidated channel; a stale error escaping a pass already in flight
  quiesces on the same arm, and an unrecognised error rethrows. The
  system-note channel (`SystemNoteChannelHealth`) marks itself permanently
  dead on a stale `pi.sendMessage` throw and rethrows — never re-entering the
  equally stale `ctx.ui.notify` fallback — and a dead channel rethrows the
  recorded error touch-free; the non-stale terminal
  `system-note delivery failed:` line is once-bounded per channel instance.
  The arm-after-teardown race — a `session_shutdown` consumed while the async
  `session_start` compose is in flight, which would arm a watcher nothing
  detaches — is closed zero-touch by suppressing the arm when a shutdown was
  observed mid-flight. The debouncer's rejection arm logs
  `theta hot-reload rebuild rejected:` and releases the PIC-49 guard in a
  `finally`. The H8a live harness's `dispose` now emits `session_shutdown`
  (reason `"quit"`) before `session.dispose()`, mirroring the host's own
  graceful `AgentSessionRuntime.dispose()` ordering. Offline lock:
  `tests/hot-reload-stale-ctx-replacement.test.ts` (host-faithful
  stale-switch fakes; 5 red / 1 green at the pre-fix HEAD with the exact
  cascade signatures); live: the H8a acceptance file runs 5/5 with a 0-byte
  stderr capture.

## [0.27.0] - 2026-07-28

### Fixed

- **`Result` runtime values now carry an interpreter-private non-enumerable
  brand (`__thetaResult`); user/model data carrying a boolean `ok` field no
  longer forges a `Result` (bug 0017).** `makeOk` / `makeErr` built bare
  `{ ok: true, value }` / `{ ok: false, error }` objects and `isResultValue`
  duck-typed any non-array, non-enum object with a boolean `ok` property as a
  `Result` — so an `ok`-carrying object forged a `Result` at every
  classification boundary: the CONV-6 `asResultValue` wrap passed it through
  unwrapped and `?` / `match Ok(v)` then read its nonexistent `.value`
  (typed-query payloads with an `ok: boolean` schema field bound
  `null`/`undefined`, aborting on the next member access);
  `surfaceCalleeFinalValue` surfaced `{ ok: false, … }` callee **data** to
  the `invoke` parent as an `Err`; `valuesEqual` and `isWireLowerable`
  misrouted the same objects. Fix (bug doc Option 1, the enum-tag precedent):
  the constructors route through a private `brandResult` helper installing a
  non-enumerable / non-writable / non-configurable `__thetaResult` own
  property, and `isResultValue` classifies by that brand — requiring the
  descriptor to be non-enumerable, so a wire payload naming the tag cannot
  forge it either (JSON produces only enumerable keys). A type-level
  unique-symbol brand makes bare `{ ok, value }` literals fail typecheck.
  Two residual duck-typing sites in `match-result.ts` (`summariseScrutinee`,
  `matchPattern`'s constructor case) converted to `isResultValue`; the
  PIC-59 child envelope already re-tags at decode via `makeOk` / `makeErr`.
  Typed-query payloads with `ok: boolean` fields now bind intact, and the two
  documented correct-reason live reds (H8a typed-query, H9a area (c)) went
  green unchanged.

## [0.26.0] - 2026-07-28

### Fixed

- **The production binder call now issues the spec-pinned forced-tool
  structured-output `complete()` — rendered system prompt, fixed user
  literal, exactly one forced `__theta_bind_<slug>` tool, deterministic
  seed, provider-response capture — instead of a prose prompt parsed as free
  text (bug 0011).** Since the first live binder pass (H9a, 2026-07-03) the
  implementation had sent one user message carrying a rendered prose prompt
  with a JSON-only instruction and text-parsed the reply into the envelope:
  no `context.systemPrompt`, no `tools`, no `toolChoice`, no seed, no
  `onResponse`, structural-only envelope routing, and a classifier fed a
  fabricated `httpStatus: 200` — while the conforming call constructor
  (`buildBinderCompleteCall`) sat test-only. The divergence was deliberately
  recorded (`d848f1b2`): the pinned tool `parameters` — a top-level three-arm
  `anyOf` — is not a valid provider `input_schema`, so the forced call
  returned empty arguments. That finding falsified only the *attachment
  shape*, not the forcing mechanism, so the fix aligns production to the
  pinned call and amends only the attachment clause: the tool `parameters`
  root the envelope schema in an object wrapper
  (`{type:"object", properties:{envelope:<anyOf>}, required:["envelope"],
  additionalProperties:false}`, BNDR-1/BNDR-2 preserved verbatim one level
  down) with every `#/$defs/<name>` reference transitively inlined into the
  attachment copy (live testing showed the provider also degrades
  `$ref`-carrying tool schemas — NamedType/enum params bound malformed until
  dereferenced), while AJV keeps validating the unwrapped envelope document
  itself. Facet by facet: `context.systemPrompt` is the rendered V11d binder
  system prompt (the parser now retains each default's literal source and
  the `argument-hint` value to feed it; the BNDR-10 session-context block
  rides item 6); `context.messages` is the fixed literal `Bind the
  slash-command arguments now.`; `options.toolChoice` is forced with the
  per-api spelling shared with the typed respond dispatch (the constructor's
  hardcoded normalized spelling was wrong on `openai-completions` /
  `mistral`-family apis; the table moved to `src/binder/forced-tool-choice.ts`);
  the FNV-1a seed rides the provider's seed field per the seed-field table;
  `options.onResponse` is registered per attempt so the provider-error
  classifier reads the real captured HTTP status (`null` when it never
  fired — the fabricated 200 is gone, and the HTTP-status arm of the mapping
  table is reachable for the binder); the envelope is extracted from the
  first matching `ToolCall`'s `arguments.envelope` and AJV-validated against
  the true `anyOf` at the routing step (the `maxLength: 500` model budget is
  enforced, extra keys are rejected, a non-object `ok.args` is malformed
  rather than a silent `{}` bind), with plain text or a wrong-name `ToolCall`
  routed to the malformed-envelope class. The free-text machinery
  (`renderBinderTurnPrompt` / `parseBinderEnvelope` / `parseOkEnvelopeArgs`)
  is retired. The retry taxonomy, per-class budgets, cancellation discipline,
  bypass arms, defaults-merge, and echo/failure notes are unchanged
  (mechanism-agnostic seams). Live-confirmed against the real provider
  (`tests/hardening/session-binder.test.ts`, 10/10 — the `d848f1b2`
  falsification retest): an intermediate run falsified the `$defs`-hoisted
  attachment for NamedType params (3/10 malformed) before the inline landed;
  the final run binds enum, schema-typed, and mixed params through the
  forced call. Operator-visible changes: the binder's provider traffic
  changes shape (structured tool call instead of prose; envelope compliance
  is provider-enforced rather than prose-hope); binder determinism gains the
  seed; needs_info/ambiguous messages over the 500-char budget now fail
  malformed instead of passing unvalidated. Residuals (the upstream
  nested-`$defs` lowering gap for two-level NamedType chains; the
  canonical-hash citation for the synthesized tool-name slugs; the
  off-session query path's own fabricated 200) are recorded in the bug
  report's Fix section.

## [0.25.0] - 2026-07-28

### Fixed

- **Untyped `@`-queries now surface a mid-flight abort as the `cancelled`
  outcome on both drivers, instead of `Err(TransportError)` off-session and
  `Ok(<partial text>)` live (bug 0012).** The bug-0010 fix added
  signal-aware cancellation guards to every typed-query surface; the untyped
  loop (`runUntypedQueryLoop`) kept the pre-0010 shape — once a free-phase
  turn resolved, its transport and text arms returned unconditionally, with
  no `signal.aborted` re-check. An abort landing while an untyped query's
  provider call was in flight therefore surfaced as the wrong terminal
  outcome on both untyped drivers. Off-session (`subagent fn` body
  `@`-queries): pi-ai resolves an in-flight abort as a `stopReason:
  "aborted"` reply that `classifyOffSessionReply` folds into the transport
  arm, so Esc read as a provider fault (`Err(TransportError { message:
  "provider transport failure", … })`) — an author `match` arm on `kind:
  "cancelled"` never fired and retry-on-transport logic would retry a user
  cancellation. Live prompt-mode: the post-idle probe correctly synthesised
  `Err(cancelled)` per PIC-51, but the driver forwards only `kind:
  "transport"` verdicts, so the mid-abort turn fell through to text
  extraction and the query terminated `Ok(<partial text>)` — fabricated
  success carrying a torn stream's truncated data, bypassing the PIC-53
  ordering and FN-5's "on cancellation, NO final value flows". Fix (bug doc
  Option 1): two signal-keyed guards in `runUntypedQueryLoop`, mirroring the
  typed loop's bug-0010 F1 guards — before the transport arm and before the
  text arm return, an aborted theta signal maps the turn to the loop's
  existing `cancelled` outcome, which `runQueryEffect` already surfaces as
  `Err(QueryError { kind: "cancelled" })` and the CANCEL terminal outcome.
  Both guards key on the theta signal, never the stop reason: a reply-side
  `"aborted"` stop under a live (non-aborted) signal keeps its transport
  classification (the cell-(l) distinction, now pinned untyped too), and the
  text-arm guard fires before the query's `Ok` materialises to theta code,
  inside CNCL-5 — a completed `Ok` bound before the abort is untouched.
  Neither driver changes; the typed loops and the checkpoint/round-boundary
  guards are untouched.

## [0.24.0] - 2026-07-28

### Fixed

- **Warning-severity load diagnostics are now delivered instead of silently
  dropped by both production sinks (bug 0013).** The diagnostics contract
  delivers all `theta/load/*` diagnostics through the persistent
  `theta-system-note` channel (diagnostic-shape.md's persistent-diagnostics
  default has five carved-out exceptions, none a load code and none
  severity-based), yet both functions production ever installed as the
  load-pass emit stream early-returned on `severity !== "error"` — so every
  warning-emittable load row in the closed registry (15 pure-W codes plus
  the warning arms of three E/W codes) was unobservable by an operator: no
  transcript note, no toast (the surface is error-typed), no headless stderr
  line, nothing. That included the bug-0010 typed-query provider gate's
  spec-pinned load warning (`theta/load/typed-query-unsupported-provider` —
  emitted and dropped, so a typed theta pinned to an unsupported provider
  registered with zero signal), every silent-mistake detector row
  (`case-collision`, `cross-source-shadow`, `non-canonical-extension`,
  `settings-invalid-json`, `unreadable` — each condition's only documented
  observable), and the registry-documented universal branch
  (`binder-model-strict-capability-unknown`). A third, upstream drop site
  compounded the sinks: `parseDiscoveredTheta` discarded
  `document.diagnostics` entirely for a theta that registers, so
  frontmatter/parse warnings never reached a sink at all. Fix (bug doc
  Option 1): the shipped sink (`composeExtensionInstance`) splits each
  diagnostic group by severity — errors route per-diagnostic through the V4e
  pre-eval router byte-identically to before; warnings deliver directly onto
  the `theta-system-note` channel as one `emitDiagnosticBatch` per group with
  the pinned envelope (`display: true`, `details: { diagnostics }`,
  `triggerTurn: false`), never through the pre-eval router (warnings are not
  pre-evaluation failures). The helper sink (`makeLoadEmit`) mirrors warnings
  to stderr in headless `-p`/CI mode exactly as it does errors — stderr only,
  never a toast, never the channel (it stays the off-channel PIC-54
  fallback). The registering parse path forwards its warning-severity
  `document.diagnostics` as one per-file group. Batching is per emitted
  group at the call sites (one note per `.theta` parse batch, one per scan
  subsystem) with no buffering, so nothing can strand: both arms deliver
  synchronously, the watcher re-compose path reuses the same sink, and the
  post-pass `AjvSchemaValidator` handle delivers a batch of one immediately.
  Warning notes recur per reload in warning-bearing workspaces — the
  documented no-dedup contract; if a row's volume is judged wrong now that it
  is visible, the remedy is a DIAG-2 spec change to that row, not renewed
  dropping.

## [0.23.0] - 2026-07-28

### Fixed

- **An empty typed-query annotation is now rejected at parse
  (`theta/parse/empty-query-annotation`) instead of silently minting
  `schema: ""` and binding the response unvalidated through the retired
  fused mechanism (bug 0014).** The type grammar derives no empty `Type`
  (grammar.md §Type grammar; type-system.md applies the same grammar to the
  `@<T>` annotation position), yet `parseQuery`'s angle-bracket capture
  assigned `schema = parts.join("").trim()` unconditionally — so `@<>`,
  `@<  >`, a tab- or newline-only interior, and an unterminated `@<` at end
  of input all parsed with ZERO diagnostics and minted `""`, the sole input
  for which `lowerQueryResponseSchema` returns `undefined`. On that arm both
  query drivers kept the entire retired pre-0010 fused mechanism
  (user-visible JSON-in-text turn on the live path / one fused `complete()`
  off-session, `maxRounds: 0` collapse, ungoverned native loop, no respond
  tool, no provider gate) and — because no lowered schema exists — the
  text-parsed payload bound with NO AJV: QRY-22's "MUST NOT bind, as a typed
  query's value, a response that has not been validated against its declared
  schema" was silently void for a query the runtime itself marked typed. The
  shadowing case was worse than absence: `let x: Triage = @<>`…`?` kept the
  minted `""`, which blocked BOTH the direct-let propagation and the QRY-2
  inference (each fires only on `schema === null`) with no QRY-4 mismatch
  warning — the real declared `Triage` was silently ignored. Fix (bug doc
  Option 1, the route bug 0010's F5 residual named): `parseQuery`'s
  angle-bracket arm — the single place the empty capture is manufactured —
  emits the new registered code (error severity, range on the `@<…>`
  annotation span, registry-byte-equal message) whenever the trimmed capture
  is empty; the node still carries the minted `""` so the AST reflects the
  source, and load refuses error thetas. The emission fires ONLY in that
  arm: an empty `let` annotation stays guarded-untyped and `invoke<>` keeps
  its normalise-to-untyped contract. Registry row added to
  `docs/spec_topics/diagnostics/code-registry-parse.md` (query cluster,
  sibling of `explicit-schema-mismatch`; trigger names all four spellings
  and the no-empty-derivation grammar) with the transcription row in
  `docs/reference/diagnostics.md`. The degraded arm itself is KEPT as
  seam-level totality per bug 0010's residual record — unreachable from
  parsed source now — and `lowerQueryResponseSchema`'s `undefined` contract
  is unchanged as defence in depth (both RESIDUAL DIVERGENCE comments
  updated; the (deg-live)/(deg-off) residual pins re-pin the parse rejection
  and keep the arm's fused single-shot coverage through a
  direct-construction seam). BEHAVIOUR-TIGHTENING: a theta carrying `@<>`
  (or any empty-trimming spelling) previously loaded and ran — it now fails
  at parse. Committed-fixture sweep: zero offending thetas outside the two
  residual pins (both re-pinned). Remedy: name a schema (`@<Schema>`) or
  drop the annotation for an untyped query. Present since `04dbb013` (the
  unguarded angle-bracket capture); recorded from bug 0010's Fix §Residuals.

## [0.22.0] - 2026-07-27

### Fixed

- **A call to a lexically shadowed callable name is now rejected at parse
  (`theta/parse/shadowed-callable-call`) instead of dispatching the Pi tool
  at runtime (bug 0016).** expressions.md §Identifier resolution ranks a
  local `let` binding / `fn` parameter first and the callable set last, and
  the parse walks honoured that — but runtime call classification was
  callable-set-membership only (`resolveUserFn` consulted only the
  `fn`/`import` arms; `checkpointFor` / `#classifyCall` / `#resolveToolCall`
  keyed on the callee name against the frozen snapshot; the environment's
  spec-conformant four-arm `resolve` was never asked), so a parse-clean
  `read(...)` under an in-scope local named `read` executed the host tool
  anyway at both executor dispatch sites (the `evalExpr` call routing and
  the `?`/`match`-operand `evalAsResult` path): **silently with real
  arguments** for the object-literal and zero-argument forms, or as a
  misattributed `theta/runtime/internal-error`
  (`PiToolArgShapeDefectError`, blaming the bug-0003 gate) for every other
  argument form. A call of a non-callable local is provably erroneous
  (functions are not first-class), so the fix closes the recorded spec gap
  at parse: the bug-0003 lexical shape walk is generalised into a single
  call-site walk (`checkLexicalCallSites`) that resolves every callee once
  per §Identifier resolution and emits the new registered code for any call
  whose callee is shadowed by a local (`let`, `fn` parameter, `for` /
  `par for` variable, `match` binding, `params:` field) while colliding
  with a callable-set entry (Pi tool or `.theta` callable, both
  post-rename), naming the shadowing binder and its line; binding the name
  without calling it stays legal. The §Object construction bare-object
  carve-out is now lexical to match the spec: a sole bare-object argument
  whose callee is not an unshadowed Pi tool fires
  `theta/parse/bare-object-literal` (previously suppressed for ANY call —
  user `fn`s and shadowed callees included), and `schema` / `enum` names no
  longer suppress the bug-0003 shape check (they are not resolution arms).
  Belt-and-braces mirroring bug 0003: both runtime lowerings
  (`preEvaluateToolArgs`, `lowerToolCallParams`) throw a new
  `ShadowedCalleeDispatchDefectError` ahead of dispatch when the callee
  resolves to a local — the guard sits at the shared seam in front of BOTH
  dispatch sites, with fn-activation-bounded resolution so the no-closures
  model holds (`params:`-field shadows are visible inside plain `fn`
  bodies; the sole gate-only residual — `subagent fn` bodies, whose
  isolated scope genuinely carries no `params:` locals — is recorded at the
  guard). Registry row added to
  `docs/spec_topics/diagnostics/code-registry-parse.md`; rule recorded in
  expressions.md §Identifier resolution. BEHAVIOUR-TIGHTENING:
  previously-executing shadowed forms now fail at parse (and defect-throw
  at runtime instead of dispatching); remedy — rename the local binding, or
  give the `tools:` entry a distinct name with `as`. Present since the
  first Pi-tool dispatch wiring; recorded from bug 0003's residual, whose
  "fail-loud" claim held only for non-object argument forms.

## [0.21.0] - 2026-07-27

### Fixed

- **A statement ending in postfix `?` now keeps its boundary before a
  keyword-free next statement — depth-0 `?`s and `:`s pair innermost-first
  in the ternary-head scan (bug 0015).** The lexer swallows the newline
  after any trailing `?` (would-be ternary continuation; irreducible at the
  lexer per bug 0005 (b)), and `isTernaryHead`'s bounded scan proved
  boundary-crossing only via depth-0 statement-only keywords — so a
  keyword-free next statement (a reassignment or an expression statement)
  carrying a depth-0 ternary offered no stop token, the scan met that
  ternary's own `:`, and the preceding postfix `?` classified as a ternary
  head over the swallowed statement. A reassignment RHS ternary
  (`x = c ? a : b`) failed loudly at the wrong construct (stray `=`, the
  `reassign` statement gone); an expression-statement ternary (`c ? 1 : 2`
  as a bare statement or the `ThetaBody` tail) misparsed **silently** —
  zero diagnostics, the statement swallowed as consequent, the missing
  alternate fabricated as `null`, the postfix `?`'s `Err` propagation
  deleted, and the theta's final value degraded to `null`. Inside braced
  bodies (no `stmt-sep` at bracket depth > 0) any keyword-free run after a
  postfix-`?` line was exposed. The scan now pairs depth-0 `?`s (those
  followed by an expression-starting token) with depth-0 `:`s
  innermost-first and answers "ternary head" only when a `:` pairs with the
  `?` under test, so a following statement's own ternary `:` can no longer
  re-classify a preceding postfix `?`; and `parseTernary`'s missing-`:`
  recovery now emits `theta/parse/unsupported-feature` ("ternary '?'
  without ':' after its consequent") instead of fabricating silently. Both
  documented multi-line ternary continuations and the nested-consequent
  form keep their readings; the irreducible head/postfix ambiguity narrows
  to an inner postfix `?` directly followed by an expression-lead token
  inside a real ternary arm (now read as postfix). Rule recorded in
  `docs/reference/grammar.md` §"Statement termination & newline
  continuation". Present since 0.14.0.

## [0.20.0] - 2026-07-27

### Fixed

- **The typed-query forced respond turn now runs off-session through pi-ai's
  `complete()` with the tool choice forced to the synthesised respond tool
  (bug 0010).** Since the first live typed drive (0.9.0-era H8a wiring) the
  implementation had fused both query phases into one user-visible
  `pi.sendUserMessage` turn whose text inlined the lowered schema behind a
  prose JSON-only instruction, obtained the payload by `JSON.parse` of the
  streamed assistant text, registered no respond tool, forced no tool choice,
  left the typed turn governor-exempt, and never wired the documented
  provider gate — against four mutually-consistent spec pages and a resolved
  blocker-level design decision (T34). The documented mechanism is restored
  end to end: the respond tool `__theta_respond_<slug>` registers through the
  PIC-44 cache and joins the session active set for the free phase (an early
  valid respond call resolves the query); the free phase runs governed under
  `tool_loop.max_rounds` (CIO-4); the forced respond turn rebuilds the
  conversation from the session read surface, appends the QRY-15 template,
  passes the respond tool as the single `context.tools` entry with the
  per-api `toolChoice` spelling, dispatches on the theta-resolved `model:`
  with signal + auth threaded, extracts the forced `ToolCall`'s arguments per
  the binder extraction rule, and AJV-validates them — attaching nothing to
  the driven session; respond-repair restarts the whole two-phase loop per
  attempt with a fresh budget; `subagent fn` body queries run the same
  two-phase shape off-session over a held conversation, including a real
  free-phase tool loop over the inherited callable set; an abort at any point
  surfaces the CANCEL outcome with no post-abort provider dispatch.
  Operator-visible changes, stated plainly: the raw-JSON schema/instruction
  turns no longer appear in the user session transcript (SLSH-2); simple
  typed queries cost one extra provider round-trip (free phase + off-session
  respond); typed free phases are now bounded where they ran unbounded; typed
  queries on providers outside the pinned six-member api set now refuse with
  a `TransportError` instead of dispatching unforced. Spec clarifications
  landed with the fix (per-api `toolChoice` spelling and the six-member
  KnownApi-shaped provider set at the theta-1.0 pin); overflow-signature
  tables gained the two KnownApi alias keys. Residuals (empty-annotation
  degraded arm; dropped load-phase warnings; untyped off-session mid-abort
  classification) are recorded in the bug report's Fix section.
  Token-gated acceptance/live typed fixtures now echo the validated value
  behind committed sentinels — the streamed-raw-JSON observation channel is
  dead by design.

## [0.19.0] - 2026-07-26

### Fixed

- **Prompt-mode transport errors now carry the api-shaped `.api` provider
  value (`"anthropic-messages"`), not the short provider id (`"anthropic"`)
  (bug 0009).** Every normative statement of the
  `TransportError.provider` derivation pins an api-shaped `Model<Api>.api`
  value — the same `Api` union the provider-error-mapping table is keyed on —
  but the `LivePromptQueryModel` construction in `#resolvePromptQuery` read
  `ctx.model?.provider`, pi-ai's short `ProviderId`: the right model (PIC-50's
  user-session `ctx.model`) and the right `"unknown"` sentinel, but the wrong
  field, flowing out through all three prompt-mode `TransportError`
  synthesis points (the PIC-51 error-stop probes on the untyped and
  forced-respond driven turns and the PIC-50 sync-throw mapping). The
  construction now reads
  `String(deps.ctx.model?.api ?? "unknown")`, so the same provider failure
  carries the SAME api-shaped provider string on both in-process query seams —
  prompt-mode and off-session (the latter fixed in 0.18.0, bug 0007) — and the
  subagent child envelope inherits the alignment (the child runs the identical
  construction line; the parent reconstructs its `err` arm verbatim). The
  never-read `SubagentDriveDeps.provider` member and its write-only feeds were
  deleted. Fixture: `tests/prompt-provider-field-derivation.test.ts`. Observed
  at 0.18.0.

## [0.18.0] - 2026-07-26

### Fixed

- **Off-session `@`-queries no longer swallow a provider failure as a
  fabricated success (bug 0007).** pi-ai's `complete()` free function never
  rejects on a provider failure — the per-API adapter resolves every caught
  throw as an `AssistantMessage` carrying `stopReason: "error"` (+ optional
  `errorMessage`) — and `offSessionComplete`, the driver behind every
  `@`-query in a `subagent fn` body and the off-session respond-repair
  follow-up drive, extracted the reply's text without probing `stopReason`.
  An untyped query therefore resolved `Ok("")` (or `Ok(<partial text>)` after
  a mid-stream failure) — the provider's error text destroyed, the theta
  continuing on data that was never produced — while a typed query laundered
  the transport failure into the schema-validation channel, re-driving the
  dead provider once per `respond_repair` attempt (1 + 3 = 4 `complete()`
  calls at the default budget) before misreporting `Err(ValidationError)`.
  The off-session seam now classifies the resolved reply before text
  extraction through the existing provider-error-mapping table, mirroring the
  binder's classifier input: a non-normal `stopReason` maps to the pinned
  `Err(QueryError { kind: "transport", message: <errorMessage, or "provider
  transport failure">, http_status: null, provider: <resolved model's .api>,
  retryable: false })`, with `"length"` and overflow-signature envelopes
  surfacing as `context_overflow` (token counts extracted where available);
  the query loop's transport arms widened to carry both. A respond-repair
  follow-up's provider failure now terminates repair immediately with the
  proximate error and consumes no `attempts` slot. Fixture:
  `tests/off-session-transport-classification.test.ts`. Observed at 0.16.0.

## [0.17.0] - 2026-07-26

### Fixed

- **A subagent child now receives every parent theta discovery root, not
  just the last one (bug 0008).** `assembleSubagentArgv` forwarded the
  parent's discovery roots as repeated `--theta <dir>` flags, but host pi's
  argv parser stores extension flags in a per-name `unknownFlags` Map
  (`dist/cli/args.js`) — a repeated string flag resolves to its last
  occurrence, and `pi.getFlag` is `boolean | string | undefined` — so with
  ≥ 2 parent roots every earlier root silently vanished in the child. A
  callee living in a dropped root never registered; the child ran the
  `-p "/<slug>"` prompt as prose instead of the theta and exited without a
  `theta_result` envelope, which the parent misattributed as
  `Err(InvokeInfraError { cause: "internal_error" })` via the
  exit-without-envelope mapping — two layers from the cause. The launcher
  now emits ONE `--theta` flag joining all roots with `path.delimiter` (the
  documented discovery CLI-source convention, the form the child-side
  `readThetaFlagPaths` already splits) and omits the flag entirely for an
  empty root set. The `#subagent-launch-contract` carrier table gained its
  missing discovery-roots row, and `readThetaFlagPaths`' dangling
  "DISCLI-1" citation was corrected to the host's actual last-wins parsing,
  its array branch deliberately retained as fail-safe hardening. Observed
  at 0.16.0.

## [0.16.0] - 2026-07-26

### Fixed

- **The Pi-tool argument shape rule is now enforced (bug 0003).**
  `theta/parse/tool-arg-not-object-literal` was registered and implemented
  (`checkToolCallArguments`) but had no production caller, so a whole
  `let`-bound value passed positionally (`read(args)`) parsed clean and both
  runtime lowerings silently degraded it to empty params — the dispatch
  carried `{}`, the author's argument object was dropped, and the failure
  surfaced late as the *tool's* error (or, for a tool accepting `{}`, as a
  wrong effectful call). `parseThetaDocument` now walks the body (nested
  blocks, `fn` bodies, `match` arms, `par for` bodies included) and emits the
  registered diagnostic — error severity, exact registry message, range on
  the offending argument node — for every call whose callee resolves to a
  frontmatter-`tools:` Pi tool and whose first argument is not an inline bare
  object literal. `.theta`-callable calls (whole-value arguments are their
  legal convention) and zero-argument calls are unaffected; local
  declarations and bindings shadow the tool name rather than misfire.
  **Behaviour-tightening:** previously-accepted forms — `read(args)`,
  `read("x")`, `read(mk())`, `read(a.b)`, `read(Args { … })` — now fail at
  parse with `theta/parse/tool-arg-not-object-literal`; inline the fields at
  the call site (`read({ path: expr, ... })`, RFC 0002 field values are full
  expressions). Belt-and-braces behind the gate: `preEvaluateToolArgs` and
  `lowerToolCallParams` now throw a `PiToolArgShapeDefectError` internal
  defect (the `theta/runtime/internal-error` surface) instead of lowering a
  non-object first argument to `{}` / `args: undefined`, so any future
  parse-gate gap fails loudly instead of arg-dropping. Zero-argument calls
  keep lowering to `{}`. Observed at 0.12.0.

## [0.15.0] - 2026-07-26

### Fixed

- **`invoke<array<T>>` / `@<array<T>>` boundary validation no longer drops
  the transitive `$defs` of named schemas (bug 0004).** A named-schema
  fragment referencing another named schema (`Item` containing `array<Loc>`)
  carries a fragment-local `$defs`, so attaching it under the assembled
  document's `$defs.Item` nested the dependency at the unreachable position
  `#/$defs/Item/$defs/Loc` while the emitted `$ref: "#/$defs/Loc"` is
  root-absolute — AJV compile threw `MissingRefError`, surfacing at run time
  as `Err(invoke_infra, "can't resolve reference #/$defs/Loc from id #")`
  far from the declaration site, and forcing boundary shapes to be declared
  twice (inline-anonymous for the annotation, named for construction). All
  three annotation arms assembled the same broken document — the bare-named
  arm too at nesting depth ≥ 2 (`Item2 → Loc2 → Pos`), wider than the bug
  report's matrix. `pruneDocumentDefs` is now a hoist-and-close step shared
  by every arm: fragment-local `$defs` entries are recursively lifted to the
  document's top level (first-wins by def name; the shared body-type map
  keys fragments by name, so a name always resolves to one body),
  hoisted-from bodies shed their nested `$defs` via shallow clone (the
  shared fragments are never mutated), and the existing reachability walk
  keeps exactly the transitively-reachable defs (unused ones still pruned).
  A reachable `$ref` with no collected def body — unreachable from source —
  now fails at lowering time with a precise error naming the annotation and
  the missing def instead of leaking AJV's resolver message at validation
  time. Assembly clause recorded in `docs/reference/schema-subset.md`
  §"Lowering algorithm" step 4. Observed at 0.12.0.

## [0.14.0] - 2026-07-26

### Fixed

- **A `subagent fn` return annotation no longer swallows the `with` clause
  (bug 0005 (a)).** The return-type parser did not stop at the contextual
  keyword `with`, so `subagent fn s(a: string): string with { system: "…" }`
  landed the concatenated annotation `stringwith` on the AST, took the
  with-braces as the fn *body*, and shredded the real body into stray
  top-level statements (`theta/parse/unknown-identifier: unknown identifier
  'system'` plus a stray-`:` / bare-object-literal cascade). `ReturnType`
  parsing now terminates at a depth-0 `with` — `(":" ReturnType)?` and
  `WithClause?` are consecutive slots — and the clause parses as the
  `WithClause` the grammar admits. Rule recorded in
  `docs/reference/grammar.md` §"`fn` declarations". Observed at 0.12.0.
- **An annotated `subagent fn` after a statement ending in postfix `?` is
  recognised as a declaration again (bug 0005 (b)).** A trailing ternary-head
  `?` and a trailing postfix `?` are lexically identical up to the newline,
  so the lexer swallows the newline after both and the parser's ternary-head
  scan disambiguates — but the scan read across the swallowed boundary into
  the *next* declaration, where a return annotation's depth-0 `:` (the param
  parens having closed) classified the postfix `?` as a ternary head:
  `subagent` was consumed as the consequent (`theta/parse/unknown-identifier:
  unknown identifier 'subagent'`) and the modifier silently dropped. The scan
  now answers *postfix* on meeting a depth-0 statement-only keyword (`fn`,
  `let`, `if`, `else`, `while`, `return`, `schema`, `enum`, `import`,
  `export`, `break`, `continue` — keywords that can never sit at depth 0
  inside a ternary consequent; `for`/`in` stay allowed because `par for` is
  an expression), restoring the documented "the `?` trigger is the ternary
  head only" boundary. Real multi-line ternaries — trailing- and leading-`?`
  forms — are unaffected. Observed at 0.12.0.
- **A return-annotated `subagent fn` body accepts `?` (bug 0005 (c)).** The
  question-scope check treated the annotation as a plain-`fn` return type, so
  a query-`?` line inside `subagent fn helper(a: string): string { … }` fired
  `theta/parse/question-outside-result-fn` — annotating a function with
  exactly its inferred type changed body legality. Under FN-6 the body is a
  subagent session whose failure channel is the boundary `Err`, so the body
  is a `Result` scope for `?` regardless of annotation, and `): T` declares
  the **Ok payload** `T` (the `invoke<T>` analogue): the annotation is now
  validated against the FN-3-inferred Ok payload, firing the existing
  `theta/parse/invoke-return-type-mismatch` on a statically-resolvable
  incompatible payload and deferring to the runtime boundary validation
  otherwise. Semantics recorded in `docs/spec_topics/functions.md` FN-6
  (Return). Present since 0.7.1.

## [0.13.0] - 2026-07-26

### Fixed

- **Postfix index access now terminates at a line break — a `[` that begins
  a line begins a new statement (bug 0006).** `parsePostfix` consumed any
  `[` after a complete expression as index access with no same-line check,
  and inside any block (`fn` / control-flow body — bracket depth > 0) the
  lexer's open-bracket continuation had already swallowed the newline, so a
  leading-`[` tail array glued onto the previous statement: `let a = "x"`
  followed by `["a", a]` mis-parsed as `"x"["a"`, firing
  `theta/parse/non-indexable-receiver` plus a stray-token cascade two lines
  from the real construct — or, with an indexable receiver, silently binding
  the wrong value and dropping the fn's tail. The same gluing shredded
  comma-less `match` arms with array patterns (`[] => "E"` then `["a"] =>
  "A"` parsed `"E"["a"]`). The `[` must now open on the same line as its
  receiver's end; a `[` beginning a line starts a new statement/arm. An
  index whose `[` opens on the receiver's line may still spill its index
  expression across lines (open-bracket continuation unchanged), and the
  top level — which never glued — is unaffected. Rule recorded in
  `docs/reference/grammar.md` §"Statement termination & newline
  continuation". Present since 0.7.1.

## [0.12.0] - 2026-07-25

### Fixed

- **A real spawned subagent child no longer deadlocks at startup under
  `pi -p` (bug 0002).** The production spawn gave the child `pi --mode json
  -p "/<slug>"` an open parent-held stdin pipe that nothing wrote to or
  closed on the normal path — but pi's json/`-p` startup reads any non-TTY
  stdin **to EOF before the argv prompt is processed**, so the child never
  started: the parent awaited the `theta_result` envelope while the child
  awaited stdin EOF, and every real subagent-mode invocation (and every
  `invoke` of a subagent-mode callee) on the `-p` surface hung until
  externally killed, then resolved fail-closed. The child is now spawned
  with stdin already closed (`stdio: ["ignore","pipe","pipe"]` in
  `createProductionSpawnFn`) — the same treatment the acceptance harness
  already gave the outer `pi -p` process — so it starts immediately, emits
  its envelope on fd 1, and exits 0 in about a second. Present since the
  RFC-0006 switch from `--mode rpc` (exempt from pi's stdin gate) to
  `--mode json -p` (gated) in 0.9.0; confirmed and mechanised by
  `docs/bugs/0002-investigation.md`.
- **Acceptance-harness subagent children now bind the extension build under
  test (bug 0002, defect 2).** The child argv carried no `-e`/`-ne`, so
  while the harness pinned the OUTER `pi -p` process to the working tree,
  the INNER spawned child bound whatever ambient theta build the machine
  carried — on a machine with a stale global install, a pre-envelope build
  that made cases (e)/(g) fail closed even with the stdin fix. The launcher
  now honours an opt-in knob: when `PI_THETA_SUBAGENT_EXTENSION_PIN` names
  an extension entry directory, the child argv is prefixed with
  `-ne -e <dir>` (spec `#subagent-extension-pin`); the acceptance harness
  sets it to `<repo>/extensions`, and full env inheritance pins nested
  children too. Production default — knob absent, ambient discovery — is
  unchanged.

### Changed

- **Subagent cancellation is now abort → child kill (PIC-63 retired,
  re-coined PIC-66).** The retired contract's stdin-close
  "grace signal" was empirically a **start** signal, not a stop: closing
  stdin unblocks a startup-gated `-p` child, which then runs the whole
  callee — real model turns included — until the kill lands; and with stdin
  now spawned closed there is nothing to close at cancel time. The one-shot
  `thetaAbort` listener now initiates the kill directly — a process-tree kill
  on Windows, a direct `SIGKILL` to the child elsewhere (nested-descendant
  reaping on POSIX is not promised; PIC-65 layer 2 bounds the orphan window) —
  synchronously when already aborted at attach; the drive settles
  `Err(cancelled)` via the existing short-circuit, and teardown's bounded
  await → kill remains the backstop. No grace step is preserved — nothing
  ever listened to it.
- **Orphan-prevention class 2 is recorded honestly (PIC-9 retired,
  re-coined PIC-65).** The spec claimed the child exits when its
  parent-held stdin pipe reaches EOF on parent death; in reality EOF
  *starts* a `-p` child (it would run its whole invocation after parent
  death, then exit), and with stdin closed at spawn no parent-death pipe
  signal exists at all. PIC-65 records that no implemented tether exists at
  theta 1.0: controlled paths still hard-kill per teardown; the child-side
  parent-PID watchdog stays the recorded fallback, explicitly unimplemented
  (`PI_THETA_SUBAGENT_PARENT_PID` is carried by the launcher and read by
  nothing), with the orphan window bounded by one invocation. Teardown is
  re-based as bounded-await → kill (process-tree on Windows, `SIGKILL`
  elsewhere); its residual stdin release is a structural no-op kept only for
  non-production child handles. The
  `#subagent-cli-wire-pins` and version-bump audit items (o)/(y) now pin
  the true stdin-EOF input-complete/start behaviour.

### Added

- **Provider-free real-spawn regression test in the default suite**
  (`tests/subagent-child-real-spawn.test.ts`): spawns a REAL
  `pi --mode json -p` child through `createProductionSpawnFn` and the real
  launcher/driver against a scratch `mode: subagent` theta whose body is a
  pure tail expression (zero tokens), pinned to the working tree via the
  extension-pin knob, and asserts the `theta_result` envelope arrives and
  the child exits 0 within a bounded time. Closes the detection gap that
  let bug 0002 ship: the default suite's child coverage was fakes-only,
  and the only real-spawn suite was opt-in and credentialed.

## [0.11.0] - 2026-07-25

### Fixed

- **Extension-registered Pi tools are now reachable from PROMPT-mode
  thetas, model-facing and from theta CODE (bug 0001).** Naming an
  extension-supplied tool in a prompt-mode `tools:` list previously
  raised `theta/load/unknown-tool` and un-registered the whole theta, so
  a prompt-mode orchestration theta could reach such a tool by no path.
  `tools:` resolution is now **mode-independent**: any name in the
  `pi.getAllTools()` registry snapshot is admitted in both modes,
  carrying its `parameters` schema for the RFC-0002 disjointness check
  and the model tool spec. Model-facing reach follows from PIC-17 — the
  frozen callable set is the query-window active set, so an admitted
  extension tool is installed via `setActiveTools` and executed by the
  user's host session (the ambient session snapshot is still not unioned
  in). Code-side reach uses the PIC-64 host-loop dispatch rung, which is
  now establishable in the **parent** against the user's live host
  session and not only inside the subagent-root child: per call a
  uniquely-named theta-controlled bridge provider authors the `tool_use`
  with the code-supplied arguments verbatim, the host agent loop (which
  holds every registered tool's `execute`) runs it, the runtime reads the
  result back, and the model and active-set snapshot are restored in a
  `finally` on every path including throw and abort. Dispatches are
  serialised; zero model tokens are spent; theta code never obtains an
  executable `ToolDefinition`. A name that resolves at neither rung still
  refuses registration fail-closed with
  `theta/load/extension-tool-unreachable`.
- **A failed extension tool no longer lowers to `Ok` in theta code.** A
  host-loop result carrying `isError: true` was spread into an
  `AgentToolResultEnvelope`, which `routeToolReturnShape` treats as
  conforming — fabricating success from a failed tool. It now lowers to
  `Err(CodeToolError { cause: "execution" })` with the host's result text
  in the message, on both the prompt and subagent legs.

### Changed

- **Accepted cost of parent-side code-side dispatch.** In prompt mode the
  dispatch lands in the user's live session: each code-side call injects
  a fabricated user message plus tool-call and tool-result cards (SLSH-2
  forbids suppressing them) and switches the session model twice
  (`model_select` fires on the way in and out). This is accepted as the
  cost of the zero-token code channel and is not suppressed. Latency is
  negligible next to a real model turn. No new permission gate: the
  capability stays bounded by the two existing gates (the theta must name
  each tool in `tools:`; the project must be trusted), and `bash` — the
  maximal capability behind those same gates — already dispatches with no
  per-call model-turn checkpoint.
- **`subagent fn` inline bodies join code-side dispatch.** An inline
  `subagent fn` body's code-side extension-tool call dispatches through
  the process's backing host session — the child's private, discarded
  session inside a subagent-root child; the user's live session in the
  parent, with the prompt-mode accepted cost above applying — superseding
  the 0.10.0 release note's "inline bodies remain model-facing only".
  FN-6's isolation is scoped to the body's conversation (its queries, its
  transcript, its return value), not to the dispatch channel; the
  load-time reachability walk already covered `fn` bodies, so an inline
  body is not a no-rung context and registration keeps tracking rung
  availability alone. Spec: PIC-64 (inline-body dispatch context), FN-6
  (conversation-scoped isolation carve-out), CTRL-4 (`par for`
  interaction with the dispatch channel).
- **Step 0 (c) capability probe now asserts eight function members.**
  `pi.getAllTools` joins capability 4, so a host missing it refuses
  fail-closed at load with `theta/load/host-incompatible` /
  `sdk-capability-missing` instead of throwing a `TypeError` during
  admission. The seven capability *obligations* are unchanged. The SDK
  surface inventory re-kinds `pi.getAllTools` to a factory-probable
  `namespace-function`.
- **Dispatch-ladder rung-1 availability is now derived, not assumed.**
  Rung 1 (`pi.getToolDefinition`) is recorded available only when the SDK
  surface is present **and** a rung-1 dispatcher is wired, keeping
  registration and dispatchability in agreement — recording it from the
  bare SDK surface would register thetas whose every code-side call then
  failed for want of a dispatcher. The normative rung-1-preferred
  ordering is unchanged, so the rung slots in automatically when it lands
  upstream.

  Spec: PIC-61 retired per GOV-8 *Deletion*+*Add* (its child-only rung
  availability invariant is inverted) and re-coined as
  [PIC-64](docs/spec_topics/pi-integration-contract/subagent.md#pic-64);
  `tools:` admission, the resolution snapshot, PIC-17, the Step-0 probe,
  the capability inventory, and the `theta/load/unknown-tool` /
  `theta/load/extension-tool-unreachable` registry rows updated in
  lock-step.

## [0.10.0] - 2026-07-24

### Added

- **Extension-registered Pi tools are now callable from theta CODE in
  subagent mode (host-loop dispatch, PIC-61 rung 2).** The RFC 0006
  code-side dispatch ladder's host-loop rung is wired: inside the
  subagent-root child, a code-side `<name>(args)` call to an
  extension-registered Pi tool registers a per-dispatch theta-controlled
  provider whose stream function authors the `tool_use` with the
  code-supplied arguments verbatim; the child's host agent loop (which
  holds every registered tool's `execute`) runs the call, and the runtime
  reads the tool result back — deterministic arguments, zero model tokens,
  no executable definition ever obtained by theta code. The fabricated
  turn and temporary session-model switch are confined to the child's
  private, discarded `--no-session` session. The mechanism was
  prototype-verified end-to-end against the pinned Pi v0.80.10 (the
  RFC-designated acceptance criterion) before wiring. A theta whose code
  calls an extension tool now loads and dispatches in the child; contexts
  with no dispatch rung (parent/prompt mode) keep the fail-closed
  `theta/load/extension-tool-unreachable` refusal. `subagent fn` inline
  bodies (in-process, off-session) remain model-facing only.

### Fixed

- **Result envelope reached stderr instead of stdout in a real child
  (latent 0.9.0 defect).** Pi's non-interactive output guard reassigns
  `process.stdout.write` to stderr in `--mode json`, so the PIC-59
  `theta_result` envelope written through the extension's stdout would
  never have reached the parent's stdout scan in a real spawned child.
  The envelope writer now writes file descriptor 1 directly
  (`fs.writeSync(1, line)`, one atomic newline-terminated line),
  bypassing the reroute.

## [0.9.0] - 2026-07-24

### Changed

- **Subagent mode now runs the whole callee theta in the child process
  (RFC 0006).** The RFC 0005 remote-session design (parent-side interpreter
  driving a child `pi --mode rpc` session) is superseded: each subagent-mode
  invocation spawns `pi --theta <dirs> --mode json -p "/<slug>" --no-session`
  and the callee's interpreter, typed-query mechanics, and resolution
  snapshot all execute inside the child under a new *subagent-root* regime
  (selected by the `PI_THETA_SUBAGENT_ROOT=<slug>` env marker, never
  authorable from a `.theta` file; a nested subagent callee still spawns its
  own child). Observable theta language semantics are unchanged. The RPC
  drive contract is retired — deleted, not kept as a fallback; the RFC 0005
  launcher, executable-resolution ladder, trust inference, teardown/kill,
  and orphan-handling machinery are reused under the new driver.
  Spec: `pi-integration-contract/subagent.md` rewritten again (new
  PIC-58…PIC-63; PIC-40/41 retired with successors PIC-62/63; PIC-42/43
  retired), plus `invocation.md` (INV-5), §Resolution snapshot, SLSH-2,
  and satellite pages.
- **Cancellation without RPC.** `thetaAbort` now closes the parent-held
  child stdin pipe as the grace signal, then process-tree kills after the
  bounded budget; the drive's terminal signal keys off stdio close so a
  final envelope flushed at exit is never lost.

### Added

- **Typed return values cross the process boundary via a result envelope.**
  The child emits one JSONL line `{"theta_result":{"v":1,"ok":…}}` /
  `{"theta_result":{"v":1,"err":…}}` on stdout alongside the `--mode json`
  event stream; the parent scans stray-line-tolerantly, verifies the
  envelope version (skew detected, not tolerated), and maps to `Ok`/`Err`
  with full `Result` fidelity (every `QueryError` variant, `CodeToolError`,
  `InvokeInfraError` causes, panics as internal-error). A child that exits
  without an envelope maps fail-closed to
  `Err(InvokeInfraError { cause: "internal_error", … })` — never a
  fabricated value.
- **Marshalled params channel (binder bypass).** Already-typed param values
  travel to the child as canonical JSON — `PI_THETA_PARAMS` env var below
  the pinned 8 KB threshold, a 0600 temp file via `PI_THETA_PARAMS_FILE` at
  or above it (child reads and deletes; parent-`finally` backstop). The
  child validates against the theta's `params:` schema and skips the binder
  entirely; binder inference remains exclusive to human slash invocation.
- **Code-side extension-tool dispatch ladder (fail-closed).** A theta whose
  code calls an extension-registered Pi tool now loads only when a dispatch
  rung is available (upstream `getToolDefinition` when exposed, host-loop
  dispatch otherwise); with no rung the theta refuses to register at load
  with `theta/load/extension-tool-unreachable`. The host-loop dispatch
  module ships behind DI seams; its live wiring is the RFC's designated
  follow-up, so this release keeps the rung fail-closed (model-facing
  extension-tool reach is unaffected). No new permission gate: the existing
  `tools:` declaration, operator trust decisions, and fail-closed
  registration remain the gates.
- **Whole-callee content-hash verification.** The parent's load-time hash
  now covers the root `.theta` plus transitive `.thetalib` imports; the
  child verifies after its own parse and refuses diverged callees.
- New diagnostics: `subagent-envelope-parse-failed`,
  `subagent-envelope-schema-skew`, `subagent-exit-without-envelope`,
  `subagent-params-validation-failed` (runtime) and
  `extension-tool-unreachable` (load); `subagent-child-crashed`,
  `subagent-wire-parse-failed`, `subagent-model-preflight-mismatch`
  rescoped to the envelope/json child.

### Removed

- The RFC 0005 RPC session driver (`subagent-rpc-driver`), the per-query
  `agent_end` extraction, the RPC `abort` command mapping, the parent-side
  subagent query model, and the `PI_THETA_SUBAGENT_CHILD` boolean marker
  (subsumed by `PI_THETA_SUBAGENT_ROOT`).

## [0.8.0] - 2026-07-24

### Changed

- **Subagent mode now runs each invocation in a spawned child `pi` process
  (RFC 0005).** The in-process `createAgentSession` subagent session is
  replaced by a per-invocation child `pi --mode rpc --no-session` process
  driven over Pi's documented RPC JSONL protocol. The observable theta
  language semantics are unchanged (isolated conversation, private transcript
  discarded on return, only the return value propagates, no ambient tool
  inheritance), with one stated adjustment: installed extensions'
  contributions (system-prompt appends, handlers, providers) are present in
  the child, as in any Pi session — no user/project context (files, skills,
  templates) is inherited. Executable resolution re-launches the running
  parent binary (entry-script or compiled-binary rung; no `PATH` fallback;
  fail-closed at load with `theta/load/subagent-executable-unresolved`).
  Spec: `pi-integration-contract/subagent.md` rewritten (PIC-9/22/40/41/42/43
  successors; PIC-23 retired) plus satellite pages.

### Added

- **Extension-registered Pi tools are reachable by a subagent theta's model.**
  A subagent-mode `tools:` list now resolves against `pi.getAllTools()` —
  extension-supplied tools included — and is passed to the child as a
  `--tools` allowlist (empty callable set maps to `--no-tools`). Child trust
  follows necessity-inference: `--approve` iff the callable set contains a
  project-local extension tool, `--no-approve` otherwise. Code-side dispatch
  of extension tools from theta code remains out of scope (RFC 0006) and
  fails, surfacing as `Err(CodeToolError)` to theta code — never a silent
  fallthrough.
- **`.theta` callable content-hash verification across the process boundary.**
  The parent records a transitive-closure content hash of each `.theta`
  callable at load and marshals it to the child; the child verifies after its
  own parse and refuses diverged callees fail-closed
  (`theta/runtime/subagent-callable-hash-mismatch`).
- **Model pre-flight for inherited session models.** When a subagent theta
  inherits the caller's live session model, the runtime confirms via the
  child's RPC state surface that the marshalled `--provider`/`--model`
  reference resolved to the intended model before the first query
  (`theta/runtime/subagent-model-preflight-mismatch` on divergence).
- **Invoke-depth carriage across processes.** The `invoke`-chain depth
  counter is marshalled to subagent children on
  `PI_THETA_SUBAGENT_INVOKE_DEPTH`, so the depth-32 hard ceiling continues
  across process hops instead of resetting.
- New diagnostics: `subagent-spawn-failed`, `subagent-child-crashed`,
  `subagent-wire-parse-failed`, `subagent-teardown-timeout`,
  `subagent-callable-hash-mismatch`, `subagent-model-preflight-mismatch`
  (runtime) and `subagent-executable-unresolved` (load);
  `subagent-dispose-failure` re-scoped to child teardown.

### Removed

- The in-process subagent machinery: `createAgentSession` spawn block, the
  closed seven-name `customTools` materialisation, the `ResourceLoader`
  adapter (PIC-23), and `SessionManager.inMemory` transcript privacy (now
  `--no-session` ephemeral per the pinned CLI contract). The capability
  probe's factory-probable member set shrinks nine → seven and gains a
  Step 0 (f) executable-resolution probe.

## [0.7.1] - 2026-07-21

### Fixed

- **Teardown-quiesce the hot-reload watcher (PIC-57).** A debounced
  file-watcher registry rebuild could resume *after* the session's extension
  runtime was invalidated on teardown (`/new`, `/resume`, `/fork`, `/reload`,
  or quit), driving re-registration or diagnostic emission through a stale
  `pi.*` surface and throwing against Pi's `assertActive()` (surfacing as
  `registry swap failed: theta watcher` + `system-note delivery failed` on
  teardown). Root cause: the reload debouncer's cancel cleared only the pending
  timer, not an in-flight rebuild or the deferred re-arm, and `session_shutdown`
  did not await the in-flight rebuild before returning. `ReloadDebouncer` is now
  teardown-aware (`markTornDown()` clears the pending timer and the deferred
  re-arm and short-circuits any new rebuild; `whenIdle()` resolves once no
  rebuild is in flight), and `session_shutdown` sub-step 4 marks the debouncer
  torn-down and awaits `whenIdle()` — bounded by the same absolute
  `SHUTDOWN_AWAIT_CAP_MS` deadline sub-step 3 already uses, with degrade-to-skip
  if it has elapsed — so an in-flight rebuild completes (or no-ops) while the
  ctx is still active, and no watcher rebuild ever runs against an invalidated
  runtime. No new diagnostic code. Spec: new **PIC-57** in
  `session-shutdown-semantics.md`.

## [0.7.0] - 2026-07-21

### Added

- **`subagent fn` — in-file subagent callables (RFC 0001).** A `subagent`
  modifier on the top-level `fn` form whose body evaluates in a fresh, isolated
  subagent session — the same boundary an `invoke("./child.theta", ...)` crosses,
  without a second file. Identical to an ordinary `fn` in its parameter list,
  positional call form, and inferred-and-validated return type; the sole
  difference is the per-call session boundary. `@` queries in the body target the
  spawned session, not the caller's conversation (the caller's conversation stays
  unpolluted). Arguments cross by value with no closure capture; the return value
  crosses the boundary as the `Ok` payload, a callee `Err` surfaces as
  `InvokeCalleeError`, and a body panic as `InvokeInfraError`. The spawned
  session inherits the enclosing theta's configuration by default; an optional
  `with { ... }` clause overrides any subset of `{ system, model, tools,
  tool_loop, respond_repair }` (an unresolvable `with { model }` is rejected at
  load with `theta/load/model-unresolved`). A `subagent fn` call is a countable
  frame under the depth-32 `invoke` ceiling, and a self-referencing `subagent fn`
  is rejected at load as a length-1 `theta/load/invocation-cycle`; a body that
  fails to parse or type-check surfaces `theta/load/callee-has-errors` (inline,
  naming the function). Callable from a `mode: prompt` theta (the prompt→subagent
  cross-mode cell) and admissible on a `.thetalib` fn (a shared, isolated library
  helper whose session inherits the calling theta's configuration and whose
  `with { tools }` narrows against the calling theta's callable set). `subagent`
  and `with` are contextual keywords, so existing identifiers are unaffected. No
  new runtime or parse diagnostic codes are introduced (all reuse existing
  codes). Bumps the theta language surface to **theta 1.2**.

## [0.6.0] - 2026-07-20

### Added

- **`par for` — structured parallel fan-out (RFC 0003).** A parallel loop form
  that evaluates its body concurrently for each element of an `array<T>` iterand
  and collects per-iteration results in input-index order as a value-producing
  expression of type `array<Result<T, QueryError>>`. Iterations run against
  isolated work only (child sessions, `invoke`, `subagent fn`, Pi-tool calls, and
  pure computation) — never the enclosing conversation. The optional `max <expr>`
  clause (any `integer`-typed expression) lowers the in-flight width; without it
  a per-loop throttle of 64 in-flight iterations applies (excess queues; the
  throttle is not a routing-class hard ceiling). Each iteration reports
  independently: an `Err` (or a downgraded per-iteration panic, ERR-20) becomes
  that element's value and does not cancel siblings; whole-theta cancellation is
  terminal (no final value). `par` is a contextual keyword recognised only before
  `for`, so existing identifiers named `par` are unaffected. Legal in both
  prompt- and subagent-mode thetas. New parse diagnostics:
  `theta/parse/par-query-in-body`, `theta/parse/par-shared-mutation`,
  `theta/parse/par-break-continue`. Bumps the theta language surface to
  **theta 1.1**.

## [0.5.0] - 2026-07-20

### Added

- **Computed field values in Pi-tool arguments (RFC 0002).** The single
  positional bare-object argument of a Pi-tool call now admits **full Theta
  expressions** for its field values — identifier references, operators, function
  and tool calls, `?`, `${...}` interpolation, and nested arrays/objects whose
  leaves are expressions — instead of restricting them to the Theta literal
  sublanguage. The bare-object *shape* rule is unchanged (a single object literal
  written inline, typed by the tool's registered input schema); `params:`
  defaults remain literal-only and are out of scope. Field-value expressions
  evaluate left-to-right in source order at call time, before dispatch; a panic
  or early-returning `?` aborts dispatch. This is an additive source-language
  change under the GOV-15 diagnostic-registry carve-out and lands within theta
  1.x. Spec: `docs/spec_topics/tool-calls.md`, `docs/spec_topics/grammar.md`,
  `docs/reference/grammar.md`, `docs/spec_topics/expressions.md`.
- **`theta/parse/tool-arg-schema-conflict`** — new error-severity parse
  diagnostic (DIAG-2 code addition). Fires only when a Pi-tool field-value
  expression's static type is *provably disjoint* from the tool's input-schema
  field type mapped through the schema subset (a sound front-run of a certain
  runtime AJV rejection); formats, patterns, numeric refinements, and satisfiable
  unions fall through to the runtime AJV check and are never rejected at parse
  time.
- **`theta/parse/tool-arg-not-object-literal`** — new error-severity parse
  diagnostic (DIAG-2 code addition) for the surviving bare-object *shape* rule:
  a Pi-tool argument that is not written inline as a bare object literal (e.g. a
  `let`-bound object passed as `read(args)`). Its message directs the author to
  inline the fields, replacing the mis-scoped reuse of
  `theta/parse/bare-object-literal`.

### Removed

- **`theta/parse/tool-arg-not-literal`** retired for Pi-tool call sites (DIAG-2
  code removal), superseded by the computed-argument grammar above.
  `theta/parse/tool-arg-arity` and `theta/parse/default-not-literal` are
  unchanged.

## [0.3.0] - 2026-07-19

### Changed

- **Ported to the Pi SDK 0.80.x API.** Bumped `@earendil-works/pi-coding-agent`,
  `pi-agent-core`, `pi-ai`, and `pi-tui` to `0.80.10` and adapted the runtime and
  test harnesses to the reshaped SDK surface:
  - `complete` is now imported from the `@earendil-works/pi-ai/compat` subpath
    (it moved off the package root in 0.80.x).
  - `createAgentSession` model/auth wiring migrated from the removed
    `modelRegistry` / `authStorage` options to `modelRuntime`
    (`ModelRuntime.create()`); `ModelRegistry` is now built via
    `new ModelRegistry(runtime)` (the static `.create()` factory was removed).
- **Split the SDK dependency-range convention.** `devDependencies` are pinned to
  the build/test target `~0.80.10`; `peerDependencies` now declare an open floor
  (see Breaking) instead of a single shared tilde range. Updated the `#pi-sdk-pin`
  contract (PIC-33/PIC-34, the manifest lock-step, and the "Deliberate deviation"
  rationale) to describe the peer-floor / dev-pin split.

### Breaking

- **Raised the minimum supported Pi version to `>=0.80.8`.** `peerDependencies`
  moved from `~0.75.5` to `>=0.80.8` — the earliest release in which every SDK
  API shape the runtime requires exists. Hosts on Pi `< 0.80.8` are no longer
  supported and are rejected by the runtime peer-dependency probe.

## [0.2.0] - 2026-07-19

### Changed

- **Renamed the project Loom → Theta** (named after Turing's fixed-point
  combinator, Θ), to resolve a package-name collision with an unrelated
  `pi-loom`. This is a breaking rename across every surface:
  - Package `@bitmonk8/pi-loom` → `@bitmonk8/pi-theta` (published as `0.2.0`).
  - File extensions `.loom` → `.theta` (programs), `.warp` → `.thetalib`
    (library modules).
  - CLI flag `--loom` → `--theta` (hard rename, no alias).
  - Discovery/settings/manifest surfaces `~/.pi/agent/looms/` →
    `~/.pi/agent/theta/`, `.pi/looms/` → `.pi/theta/`, `loomPaths` →
    `thetaPaths`, `pi.looms` → `pi.theta`, `looms.*` settings → `theta.*`.
    Old names are not honoured; an old-named dir/key surfaces a one-shot
    deprecation diagnostic.
  - Diagnostic-code prefix `loom/*` → `theta/*` (suffixes unchanged, except
    those naming the old extension, e.g. `import-non-warp-extension` →
    `import-non-thetalib-extension`).
  - Runtime identifiers `Loom*` → `Theta*`, `Warp*` → `ThetaLib*`.
  - Release-version literal `loom X.Y` → `theta X.Y`; governance anchors
    `loom-1-0-*` → `theta-1-0-*`.
  - Retired the legacy `v1-*` HTML-anchor dual-anchor governance machinery
    (GOV-25–GOV-29) wholesale, repointing all inbound `#v1-*` cross-references
    to their `theta-1-0-*` canonical arms.
  - See [`docs/rename-to-theta.md`](docs/rename-to-theta.md) for the full plan.
