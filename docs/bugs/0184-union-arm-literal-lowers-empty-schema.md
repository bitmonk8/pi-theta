# Bug 0184 — a literal ARM of a mixed union lowers to the EMPTY schema at all four `Type` positions instead of `docs/spec_topics/schema-subset.md:79`'s `{ "const": <value> }`: `Sev | "high"` lowers `{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}`, a real `AjvSchemaValidator` admits `"zzz"`, `7`, `null`, `[]` and `{}` for a param the author closed to one enum plus one string, and since the bug 0172 face-2 dispatch (0.102.0) the enum tag a body sees depends on arm ORDER — `"high" | Sev` takes the empty arm for every value and tags nothing, where `Sev | "high"` tags both `"high"` and `"low"`

- **Status:** open. §Fix is constraint-pinned, not settled: the change routes
  the union-ARM recursion `lowerTypeExpr` (`src/parser/params.ts:677`) and
  `lowerBraceGroupUnionArms` (`:1159`) share with every position through the
  literal sublanguage, and the placement is left to the run because the two
  obvious placements have different blast radii and one of them is
  [0164](./0164-generic-argument-literal-lowers-permissive.md)'s mechanism.
  Ordering: nothing blocks this report from starting.
  [0164](./0164-generic-argument-literal-lowers-permissive.md) is the sibling
  face and the one report whose remedy overlaps — **whichever lands second
  re-derives the other's rows rather than assuming them**, because a per-arm
  consult alone lowers 0164's `array<"x" | "y">` to
  `{"anyOf":[{"const":"x"},{"const":"y"}]}`, a third value neither report
  specifies (§Reproduction (h), §Fix constraint 2).
- **Sev/Diff estimate:** S1/D3 — S1 because a declared type enforces nothing at
  the arm with zero diagnostics at any of the four `Type` positions: real AJV
  over the lowered `params:` document accepts `"zzz"`, `7`, `null`, `[]` and
  `{}` for `sev: Sev | "high"` (§Reproduction (b), (d)), and that document is
  compiled at all three `params:` consumers, while at the annotation position
  the same fragment is what the model is grammar-constrained by. The 0.102.0
  dispatch adds a second observable: the enum tag a body binds depends on arm
  order (§Reproduction (e)). D3 because the remedy re-routes the one union-arm
  recursion every position shares, its narrow placement collides with 0164's
  shared mechanism (measured, above), and it moves eight in-tree control cells
  plus bug 0172's own `RED (first-match-wins)` premise cell and one spec
  parenthetical in lock-step (§Fix constraints 2–4).
- **Kind:** defect. The lowering pass drops a rule the emission table states.
  `docs/spec_topics/schema-subset.md:79` emits a literal as
  `{ "const": <value> }` and `:81` (SUBS-1) makes a union with any
  non-primitive arm lower to `{ "anyOf": [...] }` over its arms — the arms
  being what step 3 emits for each. `docs/spec_topics/grammar.md:94` makes
  `Type "|" Type` a `Type`, `:95` and `:102` put `LiteralType` in `Type`, and
  `:105` names "union arms" among the positions where a bare `Type` appears,
  adding "The grammar is otherwise identical in every position". The
  implementation reaches the literal rows only from the TOP of a type source;
  the per-arm recursion (`src/parser/params.ts:677`) re-enters `lowerTypeExpr`,
  which owns no literal sublanguage and returns `{}` from its trailing
  catch-all (`:774–783`). No registry row is implicated: nothing is mis-emitted
  and no diagnostic fires at any position.
- **Related:**
  - [0164](./0164-generic-argument-literal-lowers-permissive.md) — **open**, the
    sibling face and the shared mechanism. 0164 owns the generic-ARGUMENT face
    (`array<"x" | "y">` → `items: {"anyOf":[{},{}]}`), whose remedy re-routes
    `lowerTypeExpr`'s generic-argument recursion (`:698`, `:702–704`). This
    report owns the union-ARM face. The two meet twice: 0164 §Fix's *second*
    route ("at the head of `lowerTypeExpr`") reaches BOTH faces in one change
    and 0164 requires a run taking it to re-open the mixed-union disposition
    explicitly; and this report's narrow route, applied per arm, changes what
    0164's own subject lowers to (§Reproduction (h)). Neither blocks the other
    from starting; whichever lands second re-derives the other's rows. The
    shapes compose: `array<Sev | "high">` lowers
    `{"type":"array","items":{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}}` — this
    report's arm one level inside 0164's recursion (§Reproduction (g)).
  - [0098](./0098-nonstring-literal-union-emission-unspecified.md) — **open**,
    the boundary. 0098 owns WHICH BYTES a non-string literal union carries
    where it IS lowered; this report owns the arm DEPTH where the literal check
    never runs at all. 0098 §Non-goals (`:551–555`) names "a literal arm of a
    mixed union" and attributes it to
    [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) §Non-goals —
    but 0043 is **fixed (0.53.0)**, so before this report no OPEN bug owned the
    shape. The two interact on a MULTI-literal arm set: `Sev | "high" | "low"`
    lowers `{"anyOf":[{"$ref":"#/$defs/Sev"},{},{}]}` today (§Reproduction (a))
    and, once the arms are lowered separately, each lands on `:79`'s `const`
    rather than on 0098's bare-`enum` branch — so this report reaches 0098's
    branch only where an author writes a non-string SINGLE literal arm
    (`Sev | 1`).
  - [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md) —
    **fixed (0.59.0)**. Its §Non-goals (`:770–773`) names this exact shape
    (`"x" | string`) and hands it to 0043 §Non-goals, and its regression file
    carries the one-position fence this report moves,
    `tests/literal-union-string-enum-emission.test.ts:703–711` (cell `e3`) plus
    the file header's signature-table row (`:104`).
  - [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) — **fixed
    (0.53.0)**, arm ordering. Its §Non-goals (`:743–759`) is the bullet every
    later report points at: "A literal arm of a mixed union. `"a" | Triage`
    lowers `{"anyOf":[{},{"$ref":…}]}` … Unfiled, unchanged here", restated as
    still unfiled and byte-identical at 0.59.0. That doc is closed, so the
    bullet holds no open owner; this report is the owner.
  - [0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md) —
    **fixed (0.85.0)**, the origin of the sublanguage this report reuses. Its
    fix gave `lowerParamsFieldType` the literal check AHEAD of its brace test
    (`src/parser/params.ts:1332`), matching `lowerTypeSource`'s own
    (`src/parser/body-type-lowering.ts:284`) — so a `params:` field's own RHS
    and a `schema` body field's type both meet the check, and the union-arm
    recursion is what never re-enters either. Its §Non-goals (`:698–704`)
    declines the mixed union by name and its four-position control cells `d4`
    and `d5` (`tests/params-literal-sublanguage-lowering.test.ts:912–927`) pin
    the current bytes. The fix also put the remedy's ingredient in reach:
    `parseLiteralArm` (`:1178`) and `lowerLiteralSublanguage` (`:1255`) are
    exported from the module `lowerTypeExpr` lives in.
  - [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md) —
    **fixed (0.102.0)**, commit `ac4687db`, the provenance and the new
    consequence. Its face-2 fix landed first-admitting-arm dispatch in SUBS-1
    source order, first-match-wins; that rule is deterministic and correct over
    what the lowering hands it, and the empty arm is what the lowering hands
    it. Its `RED (first-match-wins)` cell
    (`tests/inbound-union-arm-dispatch.test.ts:505–525`) asserts the CURRENT arm
    shapes as its premise — `expect(arms[1]).toEqual({})` and an AJV verdict
    over that arm — so a fix here reds that premise loudly instead of silently
    altering dispatch. This report is that fix's residual 1 (`:1493–1501`).
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) —
    **open**, the inventory of what a permissive `{}` should ever be. This
    report removes one `{}` emission; whether the remainder should exist at all
    is 0028's question.
- **Affected** (every citation re-verified at HEAD `9209f996`, v0.102.0, by
  `rg` and by reading the committed bytes through `git show HEAD:<path>`. No
  tracked file carried a working-tree modification at any point; a sibling
  session's untracked scratch probes for bug 0181 appeared under `tests/` and
  are not cited here):
  - **The two recursions that skip the check.** `src/parser/params.ts:663`
    (`lowerTypeExpr`), whose union branch is `:674–689`: `:674` splits on `|`,
    `:677` recurses each arm through `lowerTypeExpr` ITSELF, `:679–686` is the
    inlined primitive test, `:688` combines by `lowerUnion`. A literal arm
    reaches no rule on that path, because `lowerTypeExpr` has none: `:774–783`
    is the trailing catch-all ("A literal-type atom (string/number literal) or
    any other form: lower permissively; literal lowering is owned by the
    schema-subset leaves"), which pushes the text on `lowerCtx.unspellable`
    (`:782`) and returns `{}` (`:783`). The second site is
    `src/parser/params.ts:1140` (`lowerBraceGroupUnionArms`, bug 0097's), whose
    `:1155–1161` map hoists each brace-group arm and sends every OTHER arm —
    including a literal one — to `lowerTypeExpr` at `:1159`, not to the
    literal-aware `lowerFieldType` it was handed.
  - **Why the `{}` is silent.** `isUnspellableTextRefusable`
    (`src/parser/params.ts:1224–1226`) returns `false` when
    `parseLiteralArm(text)` recognises the text, so the sink entry the catch-all
    pushed is declined by all three readers (`parseParams`, and
    `theta-document.ts`'s two body positions) and no
    `theta/load/params-type-not-expression` or
    `theta/parse/schema-type-not-expression` fires. Measured: zero diagnostics
    at every position for every row of §Reproduction (a).
  - **The sublanguage, one function away and never called from an arm.**
    `src/parser/params.ts:1255–1269` (`lowerLiteralSublanguage`): `:1256`
    splits on `|`, `:1258–1259` require every arm to parse through
    `parseLiteralArm`, `:1261–1263` is bug 0055's landed ternary, `:1265`
    declines the whole union when ANY arm is not a literal, `:1267–1268`
    returns `{ const: … }` for a single accepted atom. `:1178–1199` is
    `parseLiteralArm`. Both are exported. Its two callers call it at the TOP of
    a type source only: `lowerParamsFieldType` (`:1327–1344`, the call at
    `:1332`, the `lowerTypeExpr` delegation at `:1343`) and `lowerTypeSource`
    (`src/parser/body-type-lowering.ts:254`, the call at `:284`, the delegation
    at `:320`). A mixed union is neither a whole literal source nor
    brace-rooted, so both callers decline it and hand it whole to
    `lowerTypeExpr`.
  - **The single-atom emission the arm needs already exists.**
    `lowerLiteralSublanguage('"high"')` returns `{"const":"high"}` and
    `lowerLiteralSublanguage('Sev | "high"')` returns `undefined` — measured
    (§Reproduction (h)). The missing step is the per-arm call, not an emission.
  - **The four positions converge on those two recursions.** `params:` —
    `src/parser/params.ts:216` (`parseParams`'s per-field
    `lowerParamsFieldType`). `schema`-body field —
    `src/parser/body-type-lowering.ts:132` inside `lowerObjectFields` (`:120`),
    reached from `buildBodyTypeSchemas` (`:421`). Alias RHS — `:473`
    (`lowerTypeSource(decl.arms.join(" | "), …)`). `@<T>` / `invoke<T>` —
    `src/runtime/query-schema-lowering.ts:120` (`lowerQueryResponseSchema`), the
    non-brace root at `:167`.
  - **The in-tree record that names this face and holds it.**
    `src/runtime/query-schema-lowering.ts:25–88` inventories every permissive
    `{}` below the seam; `:85–88` is this shape verbatim — "a literal atom is
    recognised only by `lowerTypeSource`'s own top-level check, so a literal arm
    of a union that is not all-literal still lowers `{}` (`"a" | Triage` →
    `anyOf: [{}, {"$ref": …}]`)". Two further in-tree prose pins:
    `src/parser/params.ts:1233–1236` (`lowerLiteralSublanguage`'s doc — "bug
    0056 §Non-goals — a mixed union's literal arm stays permissive at
    `lowerTypeExpr`, everywhere") and `:561–565` (the `unspellable` sink's doc,
    naming "a mixed union's literal arm" among the declined traffic).
  - **The three consumers of the lowered `params:` document**, each a real AJV
    compile: `src/extension/production-theta-producer.ts:784` (the binder
    envelope build → `src/binder/binder-envelope.ts:86`, `relaxParamsSchema`
    called at `:89` and defined at `:137`), `:1270` (the post-default-merge
    compile feeding `fillDefaultsAndRevalidate` at `:1271`), and `:2085` (the
    subagent child's params intake, the schema read at `:2078`).
  - **The `@<T>` position's bytes name a registered tool and are shown to the
    model.** `src/extension/production-theta-producer.ts:2771`
    (`respondSchemaSlug`, naming `__theta_respond_<slug>`), `:2804` and `:5471`
    (`respondToolWireSchema` feeding that tool's `parameters`), and `:5283–5296`
    (`renderTypedAwareQueryText`, which interpolates the fragment into the
    QRY-15 instruction at `:5292`).
  - **The 0.102.0 dispatch that reads the arms.**
    `src/parser/schema-lowering.ts:339` (`SchemaSidecar.unionArms`), `:368` and
    `:384` (`buildSidecar` recording a position's arms), `:605`
    (`buildInboundTranslationPlan`'s `anyOf` branch);
    `src/runtime/wire-translation.ts:286` (`rebuildInbound`), `:415`
    (`rebuildUnderFirstAdmittingArm`), `:460` (`firstAdmittingArm`);
    `src/runtime/inbound-boundary.ts:70` (`decodeInboundValue`) and `:128`
    (`bindParamsInbound`). None of this moves; it is where the empty arm's
    consequence surfaces.
  - **The control cells that pin the current bytes.** Eight, in six files:
    `tests/params-literal-sublanguage-lowering.test.ts:912–920` (cell `d4`,
    `"x" | integer` → `{anyOf:[{},{type:"integer"}]}` over all four `POSITIONS`,
    `:276`) and `:921–927` (cell `d5`, `"x" | Triage`, same four);
    `tests/literal-union-string-enum-emission.test.ts:703–711` (cell `e3`,
    `"x" | string`, one direct `lowerTypeSource` call, `:191`) and the header
    signature-table row `:104`;
    `tests/union-generic-arm-lowering.test.ts:1083–1096` (cell `g8`,
    `"a" | Triage`, all four positions);
    `tests/schema-body-nontype-text-refusal.test.ts:991` (row `e2`,
    `"x" | integer`);
    `tests/params-scalar-nontype-text-refusal.test.ts:950–955` (row `d7`,
    literal arm first) and `:956–961` (row `d8`, `string | "x"`, literal arm
    last);
    `tests/inline-object-nested-lowering.test.ts:1813–1818` (cell `g8`'s
    "a LITERAL arm" row, `{ a: string } | "lit"` — the
    `lowerBraceGroupUnionArms` site; the cell runs `:1805–1876`). Plus bug
    0172's premise cell, `tests/inbound-union-arm-dispatch.test.ts:505–525`.
  - **No committed fixture carries the shape.** Four `.theta` files in the tree
    declare a `|` in a type position and all four are ALL-string-literal unions,
    which reach `lowerLiteralSublanguage` at the top of the source and lower
    `{"type":"string","enum":[…]}`: `docs/examples/handle-error.theta:8`,
    `docs/examples/review-lens.theta:12`,
    `tests/fixtures/h7a/acceptance.theta:21`,
    `docs/examples/sentiment.theta:8`. No `.theta` or `.thetalib` declares a
    mixed union with a literal arm, so
    `tests/committed-fixture-parse-gate.test.ts` never meets the input.
- **Observed at:** v0.102.0 `9209f996` (`package.json:3`). Offline,
  deterministic, provider-free. Every value below was produced by a scratch
  vitest probe through the shipped front end (`parseThetaDocument` via
  `tests/helpers/e2e-s1.ts`), the shipped `lowerQueryResponseSchema`, the
  shipped `buildInboundTranslationPlan` / `translateInbound` /
  `bindParamsInbound`, the shipped `buildBinderEnvelopeSchema` /
  `renderBinderParamLine` / `respondSchemaSlug`, and the production
  `AjvSchemaValidator`; then deleted. No tracked file was modified for the whole
  run (`git status --short` listed no tracked modification before or after).

## Summary

`Sev | "high"` lowers `{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}` at the `params:`
field position, the `schema`-body field position, the alias right-hand side and
the `@<T>` annotation root. `docs/spec_topics/schema-subset.md:79` gives the
literal arm `{ "const": "high" }`. The second arm is the empty schema, which
AJV satisfies with every JSON value, so the union enforces nothing beyond its
non-empty arms and every value the other arms refuse is admitted through the
empty one. The theta loads with zero diagnostics at all four positions.

Real AJV over the lowered `params:` document for `sev: Sev | "high"` accepts
`"zzz"`, `7`, `true`, `null`, `[]`, `{}` and `{"sev":"high"}`. The same
declaration written as the bare `Sev` refuses all seven. Three sites compile
that document — the binder envelope, the post-default-merge validation, and the
subagent child's params intake — and `relaxParamsSchema` copies the arm verbatim
into the model-facing envelope, so grammar-constrained decoding has nothing to
constrain at that position either.

Since the bug 0172 face-2 fix (0.102.0) the empty arm has a second observable.
The landed rule dispatches a validated value under the FIRST arm that admits it
in SUBS-1 source order. An empty arm admits everything, so it wins whenever it
is written first: `"high" | Sev` binds `"high"` AND `"low"` as bare strings with
no enum tag, where `Sev | "high"` binds both as tagged `Sev` variants. The tag's
presence is a function of arm order. The rule is deterministic and correct over
what the lowering hands it; the defect is the lowering.

The four positions agree, and agree on the wrong answer, because two functions
own every union arm and neither consults the literal sublanguage.
`lowerParamsFieldType` and `lowerTypeSource` each check
`lowerLiteralSublanguage` before anything else, decline a mixed union (one
non-literal arm declines the whole source), and hand it whole to
`lowerTypeExpr`, whose per-arm recursion re-enters itself. The same holds one
function over: `lowerBraceGroupUnionArms` hoists a brace-group arm and sends
every other arm to `lowerTypeExpr` too. One absence, four positions, two
recursion sites.

Bug 0056's fix (0.85.0) closed the top level at all four positions and pinned
this depth as a control on the way past. Bug 0043 §Non-goals, which every later
report cites as the owner, is a closed document.

## Reproduction

Offline, at `9209f996`. Scratch vitest calling `parseDoc` (the real
`parseThetaDocument` with production-shaped deps, `tests/helpers/e2e-s1.ts`),
`lowerQueryResponseSchema`, `buildInboundTranslationPlan`, `translateInbound`,
`bindParamsInbound`, `buildBinderEnvelopeSchema`, `renderBinderParamLine`,
`respondSchemaSlug` and the production `AjvSchemaValidator`. Declarations in
scope: `enum Sev { High = "high", Low = "low" }` and `schema Box { sev: Sev }`.
The four positions are read as bug 0056's witness reads them — `params:` as
`properties.p`, the `schema`-body field as `$defs.S.properties.a`, the alias as
`$defs.M`, and the annotation as `lowerQueryResponseSchema`'s return with
`$defs` split off. Every fixture below loads with **zero diagnostics** at every
position.

### (a) One type expression, four positions

Every union row below produced byte-identical fragments at all four positions;
the parity was asserted per row, not assumed.

```
Sev | "high"            {"anyOf":[{"$ref":"#/$defs/Sev"},{}]}
"high" | Sev            {"anyOf":[{},{"$ref":"#/$defs/Sev"}]}
"high" | Box            {"anyOf":[{},{"$ref":"#/$defs/Box"}]}
Sev | "high" | "low"    {"anyOf":[{"$ref":"#/$defs/Sev"},{},{}]}
Sev | "high" | null     {"anyOf":[{"$ref":"#/$defs/Sev"},{},{"type":"null"}]}
"x" | string            {"anyOf":[{},{"type":"string"}]}
"x" | integer           {"anyOf":[{},{"type":"integer"}]}
Sev | null              {"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}]}
"x" | "y"               {"type":"string","enum":["x","y"]}
"x" | null              {"enum":["x",null]}
```

The last two rows are the contrast: an ALL-literal union reaches
`lowerLiteralSublanguage` at the top of the source and carries its emission
(`:80` for the all-string case, the bare `enum` — bug 0098's subject — for the
mixed-kind one). One non-literal arm declines the whole union and every literal
arm in it loses its emission.

One row is not four-position uniform, for an unrelated reason: the bare `Sev`
lowers `{"$ref":"#/$defs/Sev"}` at `params:`, the `schema`-body field and the
alias, and `{"type":"string","enum":["high","low"]}` at the annotation root,
which lowers the root in place rather than to a `$ref`. That asymmetry is the
annotation root's own and is outside this report.

### (b) Real AJV over the lowered document

Through the production `AjvSchemaValidator` (the shipped V8c seam:
`strict: false`, `allErrors: true`, `ajv-formats` installed). `@<Sev | "high">`
lowers

```
{"anyOf":[{"$ref":"#/$defs/Sev"},{}],"$defs":{"Sev":{"type":"string","enum":["high","low"]}}}
```

and validates:

```
"high"           -> true    (declared by arm 0)
"low"            -> true    (declared by arm 0)
"zzz"            -> true    (matches NEITHER declared arm)
7                -> true    (matches NEITHER declared arm)
true             -> true    (matches NEITHER declared arm)
null             -> true    (matches NEITHER declared arm)
[]               -> true    (matches NEITHER declared arm)
{}               -> true    (matches NEITHER declared arm)
{"sev":"high"}   -> true    (matches NEITHER declared arm)
```

Per arm, each compiled as the self-contained arm document
`docs/spec_topics/schema-subset.md:87` item (5) specifies (the arm's own
fragment plus the document's `$defs`):

```
arm 0  {"$ref":"#/$defs/Sev"}   "high" true  "low" true  every other payload false
arm 1  {}                       every payload true
```

The enforcing contrast, same declarations, annotation `Sev`:

```
{"type":"string","enum":["high","low"]}
"high" -> true   "low" -> true   "zzz" 7 true null [] {} {"sev":"high"} -> false
```

Arm 1 is the whole of the difference. The document refuses nothing the empty
arm admits, which is everything.

### (c) The spec-conformant document, for comparison

The step-3 *Literal* row's emission placed in the arm by hand, through the same
validator:

```
{"anyOf":[{"$ref":"#/$defs/Sev"},{"const":"high"}],"$defs":{"Sev":{"type":"string","enum":["high","low"]}}}
"high" -> true   "low" -> true   "zzz" 7 true null [] {} -> false
```

Reversed arm order (`{"const":"high"}` first) gives the identical verdict table.
The declared set is enforced and does not depend on arm order.

### (d) The `params:` boundary

`sev: 'Sev | "high"'` beside `note: string`, both required:

```
lowered.properties.sev  {"anyOf":[{"$ref":"#/$defs/Sev"},{}]}
{"sev":"high","note":"n"}  admitted; `sev` binds a TAGGED Sev.High
{"sev":"zzz","note":"n"}   admitted
{"sev":7,"note":"n"}       admitted
```

`sev: '"high" | Sev'`, the same two payload shapes:

```
lowered.properties.sev  {"anyOf":[{},{"$ref":"#/$defs/Sev"}]}
{"sev":"high","note":"n"}  admitted; `sev` binds the BARE STRING "high" (untagged)
{"sev":"zzz","note":"n"}   admitted
{"sev":7,"note":"n"}       admitted
```

Both through `bindParamsInbound` with one real `AjvSchemaValidator` serving the
merge verdict and the arm re-test, which is how
`src/extension/production-theta-producer.ts:2204` threads it. The sibling
`note: string` binds `"n"` in both.

### (e) The tag depends on arm order — the 0.102.0 consequence

Through `lowerQueryResponseSchema` → real `AjvSchemaValidator` verdict →
`buildInboundTranslationPlan` → `translateInbound` with the same validator.
`taggedHigh` / `taggedLow` are `valuesEqual` against a locally constructed
`Sev.High` / `Sev.Low`.

```
@<Sev | "high">   {"anyOf":[{"$ref":"#/$defs/Sev"},{}]}
  "high"          admitted; tagged Sev.High
  "low"           admitted; tagged Sev.Low
  "zzz"           admitted; bare string, untagged
  7               admitted; bare number
  null            admitted
  {"sev":"high"}  admitted

@<"high" | Sev>   {"anyOf":[{},{"$ref":"#/$defs/Sev"}]}
  "high"          admitted; BARE STRING, untagged
  "low"           admitted; BARE STRING, untagged
  "zzz"           admitted; bare string
  7               admitted; bare number
  null            admitted
  {"sev":"high"}  admitted
```

Writing the same two arms in the other order removes the enum tag from every
value, including the two the enum declares. The wire projection is identical on
both sides (`JSON.stringify` of either result is `"high"`), so the divergence is
invisible to a JSON-shaped check and shows only in `==` against a constructed
variant.

The literal's own value has no effect at all, because the arm carries none:
`@<Sev | "urgent">` — a literal outside the enum — produces the byte-identical
`{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}` and the identical row set.

### (f) What the binder is told, and what the model is constrained by

```
sev: 'Sev | "high"'
  BypassParamsField  :: {"wireName":"sev","type":"Sev | \"high\"","hasDefault":false,"nullable":false}
  Parameters: line   ::   sev (Sev | "high") required
  envelope `args`    :: {"type":"object","properties":{"sev":{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}},
                         "required":["sev"],"additionalProperties":false}

sev: 'Sev | null'
  Parameters: line   ::   sev (Sev | null) required
  envelope `args`    :: {"type":"object","properties":{"sev":{"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}]}},
                         "required":["sev"],"additionalProperties":false}
```

The prompt line carries the declared theta type verbatim in both cases;
`relaxParamsSchema` copies the arm into the model-facing envelope, and in the
first case that arm asserts nothing.

At the `@<T>` position the fragment names a registered tool and is interpolated
into the QRY-15 instruction:

```
@<Sev | "high">  ->  __theta_respond_cfd165c062368209
@<"high" | Sev>  ->  __theta_respond_4d8ebd87b276a6f3
@<Sev | null>    ->  __theta_respond_4d64eb5d58b6cca8
```

### (g) Depth and the mint

An inline object carrying the arm hoists under a name that is a function of the
arm's bytes:

```
p: '{m: Sev | "high"}'
  params:      {"$ref":"#/$defs/__inline_d120f11c7193b40b"}
  $defs entry: {"type":"object","properties":{"m":{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}},
                "required":["m"],"additionalProperties":false}
```

Inside a generic argument the two faces compose, each contributing its own `{}`:

```
array<"x" | "y">        {"type":"array","items":{"anyOf":[{},{}]}}                   — 0164's face
array<Sev | "high">     {"type":"array","items":{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}} — this face, one level down
```

The second row reaches `lowerTypeExpr`'s union split through 0164's
generic-argument recursion, so it is this report's arm at a depth 0164 owns
the route to.

### (h) The remedy's ingredients, and the collision measured directly

Through the exported helpers, no fixture:

```
lowerLiteralSublanguage('Sev | "high"')   undefined          (one non-literal arm declines the whole union)
lowerLiteralSublanguage('"high"')         {"const":"high"}   (schema-subset.md:79)
lowerLiteralSublanguage('"x" | "y"')      {"type":"string","enum":["x","y"]}   (:80)
parseLiteralArm('"high"')                 {"value":"high"}
parseLiteralArm('Sev')                    undefined
```

A per-arm consult combines as SUBS-1 requires for the mixed case, and as
SUBS-1 requires but `:80` does not for the all-literal case:

```
lowerUnion([classify({$ref:"#/$defs/Sev"}), classify({const:"high"})])
  ->  {"anyOf":[{"$ref":"#/$defs/Sev"},{"const":"high"}]}          — this report's expectation

lowerUnion([classify({const:"x"}), classify({const:"y"})])
  ->  {"anyOf":[{"const":"x"},{"const":"y"}]}                      — NOT :80's enum form
```

`classifyLoweredUnionArm` puts a `{"const":…}` fragment in the `non-primitive`
class (its sole key is not a `type` naming a primitive), so `lowerUnion` emits
`anyOf`. An all-literal union reached from a generic argument — 0164's exact
subject — would therefore land on the third value above under a per-arm-only
route. §Fix constraint 2 pins the ordering that avoids it.

## Expected behaviour

- `docs/spec_topics/schema-subset.md:79` — "Literal `"foo"` / `42` / `true` /
  `null`: `{ "const": <value> }`". Nothing scopes the rule away from a union
  arm.
- `docs/spec_topics/schema-subset.md:81` (SUBS-1) — "a union with any
  non-primitive arm MUST lower to `{ "anyOf": [...] }`", with the reference
  vector `string | Author` → `{ "anyOf": [{ "type": "string" }, { "$ref":
  "#/$defs/Author" }] }`. The `anyOf` carries what step 3 emits per arm; the
  vector shows a primitive arm carrying its `{"type":…}`, and the literal row
  is the same list's neighbour. So:

  ```
  Sev | "high"          ->  {"anyOf":[{"$ref":"#/$defs/Sev"},{"const":"high"}]}
  "high" | Sev          ->  {"anyOf":[{"const":"high"},{"$ref":"#/$defs/Sev"}]}
  "x" | string          ->  {"anyOf":[{"const":"x"},{"type":"string"}]}
  "x" | integer         ->  {"anyOf":[{"const":"x"},{"type":"integer"}]}
  Sev | "high" | "low"  ->  {"anyOf":[{"$ref":"#/$defs/Sev"},{"const":"high"},{"const":"low"}]}
  ```

  and an AJV document built from the first accepts `"high"` and `"low"` and
  refuses `"zzz"`, `7`, `true`, `null`, `[]` and `{}` — measured in
  §Reproduction (c), and what the byte-identical arm set already does when it
  is written `Sev` alone.
- `docs/spec_topics/schema-subset.md:85` (*Array element order*) fixes `anyOf`
  variant order as source order. It governs the ORDER of whatever an arm emits,
  states no emission, and is satisfied by both the current bytes and the
  expected ones.
- `docs/spec_topics/schema-subset.md:7` admits `const` as a validation keyword
  with no positional restriction, so the expected fragments are inside the
  subset.
- `docs/spec_topics/grammar.md:94` — `Type ::= … | Type "|" Type`; `:95` and
  `:102` — `LiteralType ::= STRING | NUMBER | BOOLEAN | NULL` is a `Type`;
  `:105` names "union arms" among the positions where a bare `Type` appears and
  adds "The grammar is otherwise identical in every position". A literal in an
  arm is ordinary grammar.
- `docs/spec_topics/type-system.md:8` — "`T | U | ...` — the `|` operator is
  the lowest-precedence type operator and is legal anywhere a type is"; `:9` —
  literal types are "valid type expressions"; `:15` — "The same type grammar
  applies in every type-annotation position". One grammar and one emission table
  give one answer per type expression, and a type expression the grammar admits
  at a position where AJV enforces has to lower to something AJV can enforce.
- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:57` — "`params` are
  validated with AJV at invocation time"; `:58` — each `params:` field's RHS "is
  a type expression parsed by the theta type grammar — the same grammar used in
  every other type-annotation position", judged "inside a union arm at any
  depth". A type expression the grammar admits at an arm and the AJV validation
  cannot enforce satisfies neither sentence.
- `docs/spec_topics/query/query-failure-and-repair.md:78` (QRY-22) obliges the
  runtime to "convey that lowered shape to the model on the forced-respond turn"
  and validate the response against it. A `{}` arm conveys nothing and validates
  nothing.
- `docs/spec_topics/runtime-value-model.md:34` specifies the enum-tag
  reattachment as a property of the position's declared type, and settles a
  two-arm-admitting value by arm order. Under the expected lowering the
  ambiguity narrows to exactly the literal's own value: `"high" | Sev` over
  `"high"` takes the literal arm (which names no declaration, so no tag) and
  over `"low"` takes the enum arm (tagged). That is the rule applied to real
  arms rather than to one that admits everything.
- The user-facing mirrors restate the same rules:
  `docs/reference/schema-subset.md:161–172`,
  `docs/reference/type-system.md:153–156`.

## Actual behaviour / root cause

Two functions own every union arm, and neither has a literal rule.

`lowerTypeExpr` (`src/parser/params.ts:663–784`) dispatches by shape. Its FIRST
branch is the union split (`:674–689`):

```ts
  const arms = splitTopLevel(s, "|");
  if (arms.length > 1) {
    const loweredArms: LoweredUnionArm[] = arms.map((arm) => {
      const lowered = lowerTypeExpr(arm, lowerCtx);
      …
    });
    return { ...lowerUnion(loweredArms) };
  }
```

Each arm re-enters `lowerTypeExpr`. A `NamedType` arm resolves and returns a
`$ref`; a `PrimitiveType` arm returns `{"type":…}`; a `LiteralType` arm matches
no branch and falls to the trailing catch-all (`:774–783`):

```ts
  // A literal-type atom (string/number literal) or any other form: lower
  // permissively; literal lowering is owned by the schema-subset leaves.
  …
  lowerCtx.unspellable?.push(s);
  return {};
```

The inlined classification at `:679–686` then reads `{}` as `non-primitive`
(its key count is 0, not a sole `type` naming a primitive), so `lowerUnion`
(`src/parser/schema-lowering.ts:175`) emits the `anyOf` form with `{}` as one
variant. That is SUBS-1 applied faithfully to an arm carrying no information.

The second site is `lowerBraceGroupUnionArms` (`src/parser/params.ts:1140`),
which both entry points call for a union carrying a brace-group arm. It is
handed a literal-aware `lowerFieldType` for the hoist and does not use it for
the others (`:1155–1161`):

```ts
  const loweredArms = arms.map((arm) =>
    classifyLoweredUnionArm(
      isSingleEnclosingBraceGroup(arm)
        ? hoistInlineObjectType(arm, lowerCtx, lowerFieldType)
        : lowerTypeExpr(arm, lowerCtx),
    ),
  );
```

So `{ a: string } | "lit"` lowers `{"anyOf":[{"$ref":"#/$defs/__inline_…"},{}]}`
by the same absence, on a path that never touches `lowerTypeExpr`'s own union
split. `tests/inline-object-nested-lowering.test.ts:1813–1818` pins that row.

The literal sublanguage exists in the same module and is exported.
`lowerLiteralSublanguage` (`:1255–1269`) splits on `|`, requires EVERY arm to
parse through `parseLiteralArm` (`:1178–1199`), and declines the whole source at
`:1265` as soon as one arm does not — the behaviour a mixed union always
triggers. Its two callers call it at the top of a type source and nowhere else:

- `lowerParamsFieldType` (`:1327–1344`) calls it at `:1332`, before its brace
  test at `:1336`, and delegates to `lowerTypeExpr` at `:1343`.
- `lowerTypeSource` (`src/parser/body-type-lowering.ts:254`) calls it at `:284`,
  before its two dispatches, and delegates at `:320`.

A mixed union declines both checks and goes whole to `lowerTypeExpr`. From there
the arms never return to either caller. The per-FIELD recursions do return:
`lowerParamsFieldType` passes itself as the hoist's field lowerer (`:1337`,
`:1339`) and `lowerTypeSource`'s `lowerField` helper
(`body-type-lowering.ts:294–303`) re-enters `lowerTypeSource`, which is why an
inline object's FIELD type meets the check at every depth. An arm is not a
field, and there is no corresponding re-entry.

The route is documented on both sides. `lowerTypeSource`'s comment
(`body-type-lowering.ts:289–293`) states why its field recursion must re-enter
itself — "without that re-entry a nested `"x" | "y"` reaches `lowerTypeExpr`,
which owns no literal sublanguage, and lowers `anyOf: [{}, {}]`". The same
sentence describes what a union arm does, and nothing re-enters for it.

**The failure is silent by an explicit grant.** `isUnspellableTextRefusable`
(`:1224–1226`) declines any text `parseLiteralArm` recognises, on the ground
that "a `LiteralType` atom or union arm … lowers under its own emission"
(`:1206–1207`). At a union arm that premise does not hold: the text is declined
by the refusal AND lowered to nothing by the catch-all. Measured: zero
diagnostics at all four positions for every row of §Reproduction (a).

**The consequence at the inbound boundary is new at 0.102.0.** Before the bug
0172 face-2 fix nothing read the arms, so the empty arm cost only enforcement.
The landed rule (`runtime-value-model.md:34`;
`src/runtime/wire-translation.ts:415`, `:460`) re-tests the validated value
against each arm in source order and translates under the first that admits it.
An empty arm admits every value, so it governs whenever it is written first.
The rule is deterministic and the dispatch never subtracts; the arm it is given
is what makes the tag order-dependent. Measured in §Reproduction (e): the same
two arms in the other order strip the enum tag from every value.

The spec sentence written for that rule carries the defect as an assumption.
`runtime-value-model.md:34` reads "Where two arms both admit the value
(`Severity | "high"`: the string-literal arm admits every string the enum arm
does), the earlier arm governs". The parenthetical is true today only because
the arm is `{}`; under `{"const":"high"}` the literal arm admits one string and
not the other.

Everything else on the path is correct. `lowerUnion` implements SUBS-1 over
whatever arms it is handed; the identifier arm resolves the named arm to a
`$ref` and registers the declaration's own — literal-aware — lowering under
`$defs`; the hoist and the slug mint agree across positions; the 0.102.0
dispatch reads arm order from the lowered document exactly as `:85` fixes it.
The defect is one missing per-arm re-entry, replicated to four positions by
sitting below all of them.

The in-tree inventory names this face and holds it as a non-goal:
`src/runtime/query-schema-lowering.ts:85–88` — "a literal atom is recognised
only by `lowerTypeSource`'s own top-level check, so a literal arm of a union
that is not all-literal still lowers `{}` (`"a" | Triage` → `anyOf: [{},
{"$ref": …}]`)". The authority every such record cites is bug 0043 §Non-goals
(`:743–759`), and 0043 is fixed.

## Why it matters

- **The lowered fragment is the only enforcement the arm gets.** Three sites
  compile the `params:` document — the binder envelope
  (`production-theta-producer.ts:784` → `binder-envelope.ts:86`), the
  post-default-merge validation (`:1270`), and the subagent child's params
  intake (`:2085`). An arm of `{}` admits every value at all three, so a param
  declared `Sev | "high"` binds `7` and the body runs on it. Bug 0056's fix
  closed exactly this hole for `p: '"x" | "y"'`; one non-literal arm beside the
  literal reopens it.
- **Two spellings of one declaration behave differently with no signal.**
  `sev: 'Sev | "high"'` accepts every value; `sev: 'Sev'` refuses `"zzz"`, `7`
  and `null`. Adding an arm the author believes narrows the type widens it to
  everything. Nothing distinguishes the two at load, in the recorded
  `BypassParamsField.type`, or in the rendered `Parameters:` line.
- **The enum tag depends on arm order.** `"high" | Sev` binds `"high"` and
  `"low"` as bare strings; `Sev | "high"` binds both as tagged variants
  (§Reproduction (e)). `Severity.Low == "low"` is `false` by
  `runtime-value-model.md:34`, so which spelling the author chose decides
  whether a downstream `==` against a constructed variant holds. Both spellings
  render the same in the `Parameters:` line and serialise the same on the wire.
- **The model is grounded in a type the schema drops.** The binder prompt says
  `sev (Sev | "high") required` while the envelope carries
  `{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}`, and at `@<T>` the same fragment is
  interpolated verbatim into the QRY-15 instruction
  (`production-theta-producer.ts:5292`). Grammar-constrained decoding has
  nothing to constrain at that position, and whatever the model emits is
  accepted.
- **The spec routes authors into the losing spelling.**
  `docs/spec_topics/schemas.md:93` — "`enum` is **top-level only** … For inline
  enumerations use literal-union: `severity: "low" | "medium" | "high"`" — and
  `docs/spec_topics/type-system.md:9` calls single-arm literal unions "how
  `kind: "validation"`-style const fields are expressed". Both forms enforce
  while every arm stays a literal, and stop enforcing the moment one named or
  primitive arm joins them.
- **The failure is invisible to a `{}`-shaped audit.** The fragment's root key
  is `anyOf`, so a check asking "did this type lower to a bare `{}`?" — the
  inventory `src/runtime/query-schema-lowering.ts:25–88` maintains among them —
  answers no. The `{}` is one level down, inside a variant.
- **A fix moves content-addressed names.** `respondSchemaSlug` hashes the
  lowered fragment, so `__theta_respond_cfd165c062368209` and the two slugs
  beside it in §Reproduction (f) change with the arm's bytes, and every inline
  object carrying such a field re-mints (`__inline_d120f11c7193b40b`,
  §Reproduction (g)). That is a fix cost to enumerate, not a reason to defer.
- **Bug 0172's premise cell is load-bearing and will red.**
  `tests/inbound-union-arm-dispatch.test.ts:505–525` asserts
  `expect(arms[1]).toEqual({})` and the empty arm's AJV verdict as the premise
  under which its first-match-wins subject is meaningful. That is by design —
  0172's own residual says so — and it makes the coupling loud rather than
  silent.
- **No gate scores it.** No committed `.theta` or `.thetalib` declares a mixed
  union with a literal arm, so `tests/committed-fixture-parse-gate.test.ts`
  never meets one. The only in-tree records are eight control cells and three
  comments that pin the current bytes (§Fix constraint 3).

## Fix

Route the union-arm recursion through the literal sublanguage, so an arm that is
wholly what `parseLiteralArm` recognises lowers to its step-3 emission at every
position, and every other arm lowers exactly as it does today.

The two recursions are `src/parser/params.ts:677` (`lowerTypeExpr`'s per-arm
call) and `:1159` (`lowerBraceGroupUnionArms`'s non-brace-arm call). The
ingredient is `lowerLiteralSublanguage` (`:1255`), exported from the same module
since bug 0056's fix (0.85.0), so no import direction has to be crossed and no
second emission is spelled: it returns `{"const":<value>}` for a single accepted
atom (`:1267–1268`), which is `:79` exactly.

**The placement is left to the run**, because the two candidates differ in what
else they reach and the choice is a claim about which function owns the literal
rule:

- *At the arm.* Only `:677` and `:1159` consult the sublanguage before
  recursing. Minimal, and reaches exactly the shape this report measures.
  Constraint 2 governs its interaction with 0164.
- *At the head of `lowerTypeExpr`* (`:664`, ahead of the union split). One
  unconditional check at every re-entry, which reaches the union arm AND the
  generic argument in one change. This is 0164 §Fix's second candidate; a run
  taking it implements both reports and closes them together, and re-derives
  0164's constraint-2 table as well as this report's.

Constraints on any implementation:

1. **The class that moves is enumerated before the change, not discovered
   after.** At every union-arm position, at all four `Type` positions:

   | Arm shape, in a union with at least one non-literal arm | HEAD | After |
   | --- | --- | --- |
   | a string literal | `{}` | `{"const": "<value>"}` |
   | a number literal | `{}` | `{"const": <value>}` |
   | a `true` / `false` literal | `{"const": true}` / `{"const": false}` | unchanged (bug 0044's atom arm at `params.ts:721–724` already emits it) |
   | a bare `null` | `{"type":"null"}` | unchanged — see constraint 5 |
   | every other arm | its current fragment | unchanged |

   Nothing else moves. `Sev | null`, `string | null`, `Triage | null`,
   `array<Sev> | null`, `{a: integer} | Triage`, an unresolved-name arm and a
   `Result<…>` arm keep their bytes and their minted slugs, measured as controls
   rather than assumed. An ALL-literal union keeps whatever
   `lowerLiteralSublanguage` already returns for it at the source top
   (`{"type":"string","enum":[…]}` or the bare `enum`), which the new per-arm
   path must not shadow — see constraint 2.

2. **Ordering with [0164](./0164-generic-argument-literal-lowers-permissive.md)
   is settled in whichever lands second, and the hazard is measured, not
   assumed.** A per-arm consult with no whole-source consult ahead of it lowers
   an ALL-literal union reached from a generic argument to
   `{"anyOf":[{"const":"x"},{"const":"y"}]}` (§Reproduction (h)) — 0164's exact
   subject, at a value neither report specifies (`:80` gives
   `{"type":"string","enum":["x","y"]}`). Two consequences:
   - A fix for THIS report landing FIRST leaves `lowerTypeExpr` reachable from
     0164's generic-argument recursion, so it either keeps the whole-source
     consult ahead of the per-arm one (which makes an all-literal argument emit
     `:80`'s form and closes half of 0164 as a side effect — to be stated, with
     0164's `d6` / `e2` cells re-derived under this report's §Fix as the
     authority) or it does not consult at the head at all, in which case
     `array<"x" | "y">` MUST be pinned byte-unchanged at
     `{"type":"array","items":{"anyOf":[{},{}]}}` and 0164's cells stay green.
     One of the two, chosen explicitly and measured.
   - A fix for 0164 landing FIRST by its second route closes this report too;
     landing by its first route leaves this report's arms untouched, and this
     report's own fix then re-derives 0164's rows.

3. **The control cells earlier fixes deliberately pinned move, in lock-step,
   under this report's §Fix as the authority that lifts them.** Eight cells and
   one premise cell pin the current bytes; each names the mechanism in its own
   failure message, so each reds with a message still true about the mechanism
   and false about the disposition:

   | Artefact | pinned today | authority it cites |
   | --- | --- | --- |
   | `tests/params-literal-sublanguage-lowering.test.ts:912–920` cell `d4`, all four `POSITIONS` | `"x" \| integer` → `{anyOf:[{},{type:"integer"}]}` | "bug 0043 §Non-goals holds the MIXED union … bug 0056 §Non-goals leaves it there" |
   | `tests/params-literal-sublanguage-lowering.test.ts:921–927` cell `d5`, all four | `"x" \| Triage` → `{anyOf:[{},{$ref}]}` | "the same mixed-union rule with a named arm" |
   | `tests/literal-union-string-enum-emission.test.ts:703–711` cell `e3` | `"x" \| string` → `{anyOf:[{},{type:"string"}]}` | "bug 0055 §Non-goals — `parseLiteralArm` … fails on `string`" |
   | `tests/literal-union-string-enum-emission.test.ts:104` | the header signature-table row for the same source | the file's own signature table |
   | `tests/union-generic-arm-lowering.test.ts:1083–1096` cell `g8`, all four | `"a" \| Triage` → `{anyOf:[{},{$ref}]}` | "unfiled and unchanged here" (bug 0043 §Non-goals) |
   | `tests/schema-body-nontype-text-refusal.test.ts:991` row `e2` | `"x" \| integer` | the file's declined-rows table |
   | `tests/params-scalar-nontype-text-refusal.test.ts:950–955` row `d7`, `:956–961` row `d8` | literal arm first and last | bug 0059 §Fix constraint 3's grammar-admitted traffic |
   | `tests/inline-object-nested-lowering.test.ts:1813–1818` cell `g8`'s "a LITERAL arm" row | `{ a: string } \| "lit"` → `{anyOf:[{$ref},{}]}` | "bug 0039 §Fix leaves this member of the permissive-`{}` family untouched" |
   | `tests/inbound-union-arm-dispatch.test.ts:505–525` `RED (first-match-wins)` | `arms[1]` is `{}` and admits `"high"` | bug 0172 §Fix face 2, first-match-wins |

   The last row is bug 0172's premise cell and it is re-derived in lock-step,
   not deleted: its SUBJECT (arm order settles a two-arm-admitting value)
   survives the fix, because `Sev | "high"` over `"high"` still has both arms
   admitting once the second is `{"const":"high"}` (§Reproduction (c)). What
   moves is the premise — `arms[1]` becomes `{"const":"high"}` and stops
   admitting `"low"`, `7` and `null` — so the cell keeps its title, gains the
   `"low"` row as the discriminating case, and stays a real
   both-arms-admit witness on `"high"` alone.

   Prose pins re-derived in the same change:
   `src/runtime/query-schema-lowering.ts:85–88` (the inventory item),
   `src/parser/params.ts:1233–1236` (`lowerLiteralSublanguage`'s "everywhere")
   and `:561–565` (the `unspellable` sink's declined-traffic list);
   `docs/spec_topics/runtime-value-model.md:34`'s parenthetical "(`Severity |
   "high"`: the string-literal arm admits every string the enum arm does)",
   which is false once the arm is a `const` — the replacement states that both
   arms admit the literal's own value; and the user-facing mirror
   `docs/reference/type-system.md:153–156` if the sentence there is touched.
   Bug 0043 §Non-goals (`:743–759`), bug 0055 §Non-goals (`:770–773`), bug 0056
   §Non-goals (`:698–704`) and bug 0098 §Non-goals (`:551–555`) each carry a
   bullet holding this shape; each takes a note recording that this report is
   the authority that moved it.

4. **`isUnspellableTextRefusable`'s premise becomes true rather than being
   changed.** `src/parser/params.ts:1224–1226` declines a literal on the stated
   ground that it "lowers under its own emission" (`:1206–1207`). After the fix
   that is true at a union arm as well, so the predicate and all three of its
   readers stay byte-unchanged. A route that instead makes the arm text reach a
   refusal is a different report.

5. **`null` at an arm keeps the primitive reading, and SUBS-1 keeps its
   sources.** `Sev | null` lowers `{"anyOf":[{"$ref":…},{"type":"null"}]}` and
   `string | null` lowers `{"type":["string","null"]}` because `null` matches
   `PRIMITIVE_TYPES` (`params.ts:709–711`) before any literal rule could see it.
   SUBS-1 (`:81`) counts `null` as a primitive by name and the nullability idiom
   is the rule's own reference vector, so the consult must sit where it cannot
   convert a `null` arm to `{"const":null}` and collapse
   `{"type":["string","null"]}` into an `anyOf`. Bug 0056 §Fix constraint 2
   settled `null` as a `LiteralType` for a WHOLE-SOURCE literal lowering; that
   settlement is about a source `lowerLiteralSublanguage` accepts entire, and
   extending it to an arm of a mixed union would move `d1`, `d2` and `d3` of
   `tests/params-literal-sublanguage-lowering.test.ts:896–911`, which this
   report does not ask for.
6. **Both recursion sites move together.** A fix at `:677` alone leaves
   `{ a: string } | "lit"` (`lowerBraceGroupUnionArms:1159`) permissive, which
   would split one type expression's answer by whether a sibling arm happens to
   be brace-rooted. The two sites are asserted to agree on the same source at
   the same position, as `lowerParamsFieldType` and `lowerTypeSource` already
   are.
7. **The minted names move with the bytes, at every hoisting position
   together.** `docs/spec_topics/schema-subset.md:73` makes `__inline_<slug>` a
   function of the lowered fragment and `:98` confirms it, so
   `{m: Sev | "high"}` re-mints from `__inline_d120f11c7193b40b`, and
   `respondSchemaSlug` (`production-theta-producer.ts:2771`) re-names
   `__theta_respond_cfd165c062368209` and its siblings. The agreement across
   positions is a property to preserve, not one to establish: a change that
   moves one position's bytes without the others splits a name that is
   currently single.
8. **Validation outcomes change for thetas that load unchanged.** A param whose
   value set was unconstrained begins refusing values no declared arm admits, at
   all three consumers, and an `@<T>` annotation's registered tool name changes
   with its bytes. GOV-15
   (`docs/spec_topics/governance/source-language-stability.md:5`, the
   loads-cleanly predicate at `:9`) promises identical return values for a file
   that loads cleanly under 1.0.0, so the fix's evidence enumerates the affected
   shapes — constraint 1's table — rather than leaving them to be discovered.
   The census in §Affected found no committed fixture in that class.
9. **No new diagnostic and no new permissive lowering.** The fix removes `{}`
   emissions; it adds none, and it registers no diagnostic code
   ([DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) — the
   registry is closed). Every arm the recogniser declines keeps its exact
   current disposition, including the brace-rooted, shredded and unresolved-name
   arms §Non-goals names.
10. **Test witness — unit, offline, no live provider.** Every fixture in
    §Reproduction settles inside one `parseThetaDocument` or
    `lowerQueryResponseSchema` call plus one real `AjvSchemaValidator` compile.
    Required beyond the probes: four-position byte AND key-order parity over
    constraint 1's whole table, including the multi-literal arm set
    (`Sev | "high" | "low"`) and the brace-carrying union
    (`{ a: string } | "lit"`); a real-AJV accept/reject table over the lowered
    `params:` document showing the inverted rows (`"zzz"`, `7`, `true`, `null`,
    `[]`, `{}` refused; `"high"`, `"low"` accepted); the per-arm verdicts, so an
    arm that admits everything cannot return unnoticed; the arm-order pair
    (`Sev | "high"` and `"high" | Sev`) asserted through `translateInbound` AND
    `bindParamsInbound` with one validator, showing the tag now follows the
    value rather than the order — `"low"` tagged under BOTH spellings, `"high"`
    tagged under the first and untagged under the second, which is the rule
    applied to real arms; a no-op control set pinned byte-for-byte over
    `Sev | null`, `string | null`, `Triage | null`, `"x" | "y"`, `{a: integer} |
    Triage` and an unresolved-name arm; the binder-envelope shape, since
    `relaxParamsSchema` copies the fragment into the model-facing schema; and
    the re-minted `__inline_<slug>` and `__theta_respond_<slug>`. Key order is
    asserted with `Object.keys`, not only `toEqual` — the fragments are
    slug-bearing (bug 0056 §Fix *Ordering*).

## Non-goals

- **The generic-ARGUMENT face.** `array<"x" | "y">` lowers
  `{"type":"array","items":{"anyOf":[{},{}]}}` and `array<"x">` lowers
  `items: {}` because `lowerTypeExpr` recurses a generic's argument through
  itself (`params.ts:698`).
  [0164](./0164-generic-argument-literal-lowers-permissive.md) owns that face
  and its remedy re-routes that recursion, not this one. This report's fix
  interacts with it and constraint 2 pins how; it does not decide it.
- **Which bytes a non-string literal union emits.** `1 | 2` and `"x" | null`
  reach `lowerLiteralSublanguage`'s bare-`enum` branch (`params.ts:1263`),
  whose emission no step-3 line states. That is
  [0098](./0098-nonstring-literal-union-emission-unspecified.md)'s subject. A
  single non-string literal ARM lands on `:79`'s `const` under this report and
  never reaches that branch; only a source 0098 already owns does.
- **The first-admitting-arm dispatch rule itself.**
  `docs/spec_topics/runtime-value-model.md:34`'s source-order, first-match-wins
  adjudication was settled by the operator and landed at 0.102.0
  ([0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)).
  It is deterministic and correct over whatever arms the lowering produces. This
  report changes the arms, re-derives the one parenthetical that describes the
  current arms, and asks for no change to the rule.
- **`null` as a `LiteralType` at an arm.** `Sev | null` and `string | null` keep
  `{"type":"null"}` and `{"type":["string","null"]}` (§Fix constraint 5). The
  nullability idiom is SUBS-1's own reference vector.
- **A brace-rooted or shredded arm.** `{ a: string } | Cat` hoists its brace arm
  and `{ a: string | null } | Cat` shreds into three unbalanced segments that
  all lower `{}` — both from the angle-only `|` split rather than from the
  missing literal rule.
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s
  inventory covers them, and 0043 §Non-goals holds `splitTopLevel`'s angle-only
  default outside. The brace-carrying union's LITERAL arm is in scope
  (constraint 6); the brace arm itself is not.
- **The unresolved-name and non-`array`-generic arms.** `Sev | Tirage` and
  `{ a: string } | Result<Triage, Triage>` keep their `{}` variants, from
  `lowerTypeExpr`'s resolution and generic arms rather than from its catch-all.
  0028's inventory covers them.
- **Whether `{}` should ever be a lowering.** The disposition of the remaining
  permissive fragments is
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s
  inventory question.
- **The annotation root's `$ref`-versus-inline asymmetry for a bare declared
  name.** `Sev` alone lowers `{"$ref":"#/$defs/Sev"}` at three positions and
  `{"type":"string","enum":["high","low"]}` at the annotation root
  (§Reproduction (a)). Measured for the boundary; unrelated to the literal rule
  and unchanged here.
- **Whether `respondSchemaSlug` should hash the canonical form.** It hashes
  `JSON.stringify(lowered)` (`src/runtime/typed-query-validation.ts:347–349`)
  rather than the key-sorted canonical form
  `docs/spec_topics/schema-subset.md:99–107` defines, which is why emission key
  order matters at all. 0055 §Non-goals records it; unfiled and untouched here.

## Provenance

- Filing origin: bug
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)'s
  face-2 fix (0.102.0, commit `ac4687db`), *Residuals* item 1 of
  `.pi/tmp/fixes/0172-face2-report.md` and of the doc's `## Fix (0.102.0)`
  (`:1493–1501`), dispositioned "Candidate for filing — it is a spec/lowering
  divergence, independent of this bug". That residual measured
  `Sev | "high"` at the parent HEAD `acea6749`, before the face-2 code moved, so
  the shape predates that fix. Every value in this report was re-derived at HEAD
  `9209f996`, not copied. What this report adds beyond the residual: the
  four-position table including the reversed order, the multi-literal arm set
  and the `null`-bearing arm; the per-arm AJV verdicts and the enforcing
  contrast; the whole tag/admit matrix under the 0.102.0 dispatch, showing
  `"high" | Sev` strips the tag from `"low"` as well as from `"high"` and that
  the literal's own value is inert; the `params:` boundary through
  `bindParamsInbound`; the binder envelope, `Parameters:` line, respond-tool
  slugs and inline mint; the spec-conformant contrast document; the second
  recursion site (`lowerBraceGroupUnionArms`); the silence mechanism
  (`isUnspellableTextRefusable`'s declined class); the measured collision with
  0164's subject; the eight-cell fence inventory; and the ownership boundary.
- Ownership boundary, verified at HEAD: bug 0098 §Non-goals (`:551–555`) names
  "a literal arm of a mixed union" and attributes it to bug 0043 §Non-goals;
  bug 0055 §Non-goals (`:770–773`) names `"x" | string` and attributes it to the
  same place; bug 0056 §Non-goals (`:698–704`) names `"x" | integer` and
  `"x" | Triage` and attributes it to the same place. Bug 0043 §Non-goals
  (`:743–759`) does carry the bullet — and bug 0043 is **fixed (0.53.0)**, so
  the attribution terminates in a closed document. Bug 0164 (open) owns the
  OTHER half of the pair named in those bullets, the generic-argument face, and
  its §Non-goals holds this face outside by name. No open report owned this
  shape before this one.
- Spec: `docs/spec_topics/schema-subset.md:7` (`enum` / `const` as validation
  keywords), `:73` (step 2, the `__inline_<slug>` hoist), `:79` (the literal
  `const` emission), `:80` (the enum / string-literal-union emission), `:81`
  ([SUBS-1](../spec_topics/schema-subset.md#subs-1)), `:85` (*Array element
  order*), `:87` (step 5, the sidecar and its item (5) union-arms map), `:98`
  and `:99–107` (canonical form, digest, slug), `:108` (synthesised names);
  `docs/spec_topics/grammar.md:90` (`Type`), `:94` (the union production), `:95`
  and `:102` (`LiteralType` in `Type`), `:97` (`PrimitiveType`, which also names
  `null`), `:105` (the bare-`Type` position list, union arms named);
  `docs/spec_topics/type-system.md:8` (union types legal anywhere a type is),
  `:9` (literal types), `:15` (one grammar per annotation position);
  `docs/spec_topics/runtime-value-model.md:34` (§Wire-name translation, the
  inbound bullet — the enum-tag obligation, the first-admitting-arm dispatch and
  the two-arms-admit parenthetical), `:13` (the enum row);
  `docs/spec_topics/schemas.md:93` (no inline `enum[…]`; use a literal union);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:57` (AJV validation at
  invocation), `:58` (the type side, judged "inside a union arm at any depth");
  `docs/spec_topics/query/query-failure-and-repair.md:78` (QRY-22);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2). User-facing
  mirrors: `docs/reference/schema-subset.md:161–172`,
  `docs/reference/type-system.md:153–156`.
- Implementation read at `9209f996`: `src/parser/params.ts:216` (`parseParams`'s
  per-field call), `:561–565` (the `unspellable` sink's doc), `:585`
  (`PRIMITIVE_TYPES`), `:663–784` (`lowerTypeExpr`: `:674–689` the union split,
  `:677` the per-arm recursion, `:679–686` the inlined primitive test, `:688`
  the `lowerUnion` combination, `:691–706` the generic-application arm with the
  argument recursion at `:698`, `:709–711` the primitive atom, `:721–724` bug
  0044's boolean arm at `:719–724`, `:774–783` the catch-all with the sink push
  at `:782`),
  `:801` (`classifyLoweredUnionArm`), `:857` (`hoistInlineObjectType`),
  `:1140–1163` (`lowerBraceGroupUnionArms`, the non-brace arm recursion at
  `:1159`), `:1178–1199` (`parseLiteralArm`), `:1224–1226`
  (`isUnspellableTextRefusable`), `:1255–1269` (`lowerLiteralSublanguage`, the
  whole-union decline at `:1265`, the single-atom `const` at `:1267–1268`),
  `:1327–1344` (`lowerParamsFieldType`, the literal call at `:1332`),
  `:1431` (`TypeSplitNesting`), `:1506` (`splitTopLevel`);
  `src/parser/body-type-lowering.ts:120` (`lowerObjectFields`), `:132` (its
  per-field `lowerTypeSource`), `:166` (`lowerInlineObject`), `:254–321`
  (`lowerTypeSource`: `:284` the literal call, `:289–293` its statement of why
  the field recursion re-enters itself, `:294–303` `lowerField`, `:311–318` the
  two brace dispatches, `:320` the delegation), `:421` (`buildBodyTypeSchemas`),
  `:473` (the alias RHS call); `src/parser/schema-lowering.ts:175–200`
  (`lowerUnion`), `:285` (`SidecarUnionArm`), `:300` (`SidecarUnionPosition`),
  `:339` (`SchemaSidecar.unionArms`), `:361–411` (`buildSidecar`), `:605`
  (`buildInboundTranslationPlan`'s `anyOf` branch);
  `src/runtime/query-schema-lowering.ts:25–88` (the permissive-`{}` inventory,
  `:85–88` this face), `:120` (`lowerQueryResponseSchema`), `:160` and `:167`
  (its two roots); `src/runtime/wire-translation.ts:167` (`translateInbound`),
  `:286` (`rebuildInbound`), `:415` (`rebuildUnderFirstAdmittingArm`), `:460`
  (`firstAdmittingArm`); `src/runtime/inbound-boundary.ts:70`
  (`decodeInboundValue`), `:128` (`bindParamsInbound`);
  `src/extension/production-theta-producer.ts:784` (the envelope build), `:1270`
  (the post-default-merge compile), `:2078` and `:2085` (the subagent
  params-intake validator), `:2204` (the child-side `bindParamsInbound`),
  `:2631` (the typed-query decode closure), `:2771` (`respondSchemaSlug`),
  `:2804` and `:5471` (`respondToolWireSchema`), `:3622` (the invoke-return
  decode), `:5283–5296` (`renderTypedAwareQueryText`);
  `src/binder/binder-envelope.ts:86` (`buildBinderEnvelopeSchema`), `:89` and
  `:137` (`relaxParamsSchema`); `src/binder/binder-system-prompt.ts:168`
  (`renderBinderParamLine`); `src/runtime/typed-query-validation.ts:347–349`
  (`respondSchemaSlug`).
- Test evidence read at `9209f996` (nothing modified):
  `tests/params-literal-sublanguage-lowering.test.ts:276` (the four
  `POSITIONS`), `:896–911` (cells `d1`–`d3`, the `null`-idiom controls
  constraint 5 protects), `:912–927` (cells `d4` / `d5`, the four-position
  fences this report moves), `:928–936` (cell `d6`, 0164's);
  `tests/literal-union-string-enum-emission.test.ts:104` (the header row),
  `:191` (`lowerSource`, a direct `lowerTypeSource` call), `:693–701` (cell
  `e2`, 0164's), `:703–711` (cell `e3`, this report's), `:713–721` (cell `e4`,
  the SUBS-1 control); `tests/union-generic-arm-lowering.test.ts:1083–1096`
  (cell `g8`); `tests/schema-body-nontype-text-refusal.test.ts:991` (row `e2`);
  `tests/params-scalar-nontype-text-refusal.test.ts:950–961` (rows `d7` / `d8`);
  `tests/inline-object-nested-lowering.test.ts:1021–1038` (cell `a10`, the
  all-literal control), `:1805–1876` (cell `g8`, whose "a LITERAL arm" row is
  `:1813–1818`); `tests/inbound-union-arm-dispatch.test.ts:115–179` (the file
  header stating the landed rule), `:262–285` (`boundaryFor`), `:505–525`
  (`RED (first-match-wins)`, the premise cell), `:636–673`
  (`RED (params-union-field)`, whose `bindParamsInbound` drive this report's
  probe mirrors); `tests/committed-fixture-parse-gate.test.ts` (the
  zero-diagnostics walk over committed fixtures, none of which declares a mixed
  union with a literal arm).
- Fixtures surveyed: every `.theta` and `.thetalib` in the tree. Four declare a
  `|` in a type position and all four are all-string-literal unions —
  `docs/examples/handle-error.theta:8`, `docs/examples/review-lens.theta:12`,
  `tests/fixtures/h7a/acceptance.theta:21`, `docs/examples/sentiment.theta:8`.
- Reproduction: scratch vitest at `9209f996` — eleven type sources at all four
  positions with per-row parity asserted; nine payloads through the production
  `AjvSchemaValidator` over the `Sev | "high"` document, the two per-arm
  documents, the `Sev` document and two hand-built spec-conformant documents;
  the whole tag/admit matrix for three annotations through
  `buildInboundTranslationPlan` + `translateInbound`; two `params:` documents
  through `bindParamsInbound` with three payloads each; the binder field record,
  rendered `Parameters:` line and envelope for two sources; three
  `respondSchemaSlug` values; the `{m: Sev | "high"}` mint; and six direct calls
  to `parseLiteralArm` / `lowerLiteralSublanguage` / `classifyLoweredUnionArm` /
  `lowerUnion` isolating the per-arm-consult collision. Run against a tree with
  no tracked file modified, then deleted per scratch policy and the deletion
  swept case-insensitively.
