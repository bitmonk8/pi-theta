# Bug 0052 — A repeated field name inside an inline object body is admitted at every `Type` position: `{a: integer, a: string}` loads with zero diagnostics and lowers a last-wins `properties.a` beside a two-item `required: ["a", "a"]`, where the same two fields written in a `schema` body are refused with `theta/parse/wire-name-collision` — and at the `@<T>` annotation root that fragment IS the compiled document, so AJV throws `data/required must NOT have duplicate items` after the model has already answered

- **Status:** fixed (0.84.0).
- **Kind:** defect, two elements on one gap.
  (1) *A prescribed check is unimplemented for the inline spelling.*
  `docs/spec_topics/grammar.md:109` states that an inline object type's fields
  "reuse the same `Field` form as an object-schema body and carry the same
  field semantics", naming `theta/parse/wire-name-collision` and
  `theta/parse/redundant-wire-name` as applying "within the one inline
  object". `docs/spec_topics/schemas.md:44` makes two fields sharing an
  effective wire name that collision, and a field with no `as` rename has its
  theta-side name as its effective wire name
  (`schemas.md:45`; `src/parser/schema-declarations.ts:38–41`, `:109`/`:118`).
  `schema S { a: integer, a: string }` therefore raises and refuses the theta;
  the inline spelling of the same two fields raises nothing at any of the
  seven positions probed below, nor at the `invoke<T>` return annotation,
  which lowers through the same function as the `@<T>` root.
  (2) *The silence has two different consequences, and neither is a
  diagnostic.* At the three hoisting positions (a `schema` body field type,
  the `schema X = …` alias/union right-hand side, a `params:` field type) the
  author's first declaration is dropped — `properties.a` carries the LAST
  declared type — and the hoisted fragment carries `required: ["a", "a"]`,
  which AJV compiles and enforces. At the `@<T>` annotation root the same
  fragment is the compiled document's root, where AJV's meta-schema validation
  does apply, so `ajv.compile` throws `schema is invalid: data/required must
  NOT have duplicate items (items ## 1 and 0 are identical)` — at payload
  validation, after the query turn has been spent.
- **Related:**
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  — the filing origin, fixed in 0.49.0. Its §Fix (0.49.0) *Residuals* item (i)
  (`:259–264`) records this defect and leaves it unfiled: "An author-written
  duplicate field name (`{a: integer, a: string}`) lowers a last-wins
  `properties.a` and `required: ["a", "a"]` at the newly-hoisting positions —
  byte-identical to the frozen `params:` position's output for the same text,
  so deduping in the shared arm is not available; the phantom-induced
  duplicate (0039's fixture F1) IS closed, and no duplicate-field diagnostic exists
  for an inline object body." Its fix is what widened the reach: before
  0.49.0 only the `params:` position and the annotation root built a field
  list from an inline object body, and now one shared arm
  (`hoistInlineObjectType`) serves five positions. 0039 closed the duplicate
  `required` its own comma mis-split MINTED; this report owns the duplicate
  the author WRITES.
  [0035](./0035-params-rhs-inline-object-under-emission.md) — fixed (0.44.0);
  the origin of the hoist that 0039 factored out, and the position whose
  lowered bytes 0039 §Fix froze (`:607–610`, "The `params:` position's bytes do
  not move", with `tests/params-inline-object-lowering.test.ts` as the lock).
  That freeze is why the fix below is a parse-time refusal rather than a
  dedup in the lowering.
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) — open;
  the sibling gap on the same spec sentence (`grammar.md:109`), for the empty
  inline body rather than the duplicate-name one. Its §Fix needs the same
  three unwired call sites this one needs (the `@<T>` annotation root, the
  `params:` per-field loop, the `invoke<T>` arm), so the two share wiring
  without sharing a rule; §Fix records the ordering.
- **Affected** (every citation verified at HEAD `52e257bc`, 0.49.0):
  - **The two functions that build an inline object's field list.** Neither
    tests whether a name repeats.
    - `src/parser/params.ts:502` — `hoistInlineObjectType`, shared since
      0039 §Fix part B by the `params:` position and by `lowerTypeSource`.
      Its loop writes `properties[fieldName] = lowerFieldType(…)` (`:519`) and
      then `required.push(fieldName)` (`:520`). A repeated name overwrites the
      property (a plain object, last-wins) and appends to `required` (an
      array), which is exactly the observed `{"properties":{"a":{"type":"string"}},"required":["a","a"]}`.
    - `src/parser/body-type-lowering.ts:151` — `lowerInlineObject`, the
      annotation root's lowerer. It splits the body at `:158`
      (`splitTopLevel(body, ",", "angle-and-brace")`), pushes one
      `LowerableField` per entry at `:168`, and returns through
      `lowerObjectFields` (`:109`), whose loop has the same two writes
      (`:119`, `:126`).
  - **The only field-name well-formedness check in the parser, and its two
    call sites — both declarations.** `checkObjectSchema`
    (`src/parser/schema-declarations.ts:65`); the collision loop at `:103–138`
    compares each field's effective wire name (`wireName ?? thetaName`,
    `:109`/`:118`) against every other field's, emitting
    `theta/parse/wire-name-collision` at `:129–135`. Call sites:
    `src/parser/theta-document.ts:5880` (a `schema X { … }` object body) and
    `:2394` (the empty-body arm). No inline object body reaches either.
  - **The type-grammar pass discards the names before any check could see
    them.** `TypeParser.parseObject`
    (`src/parser/type-grammar.ts:275–307`) consumes the field name token and
    drops it (`:279–286`), collects types only into `fieldTypes` (`:277`,
    `:293`), and skips an `as "WireName"` rename outright (`:295–300`). The
    node it returns (`:307`) is `{ kind: "object", fieldTypes }` — a name-free
    shape — so `walkType`'s object arm (`:374`) cannot raise on a repeat.
  - **Three of the eight positions run no type-grammar pass at all.**
    `parseTypeExpression` is called at five sites, all in
    `src/parser/theta-document.ts`: `:5739` (`let` annotation), `:5814` (`fn`
    parameter), `:5820` (`fn` return), `:5899` (`schema` body field type),
    `:5494` (alias/union arm). The `@<T>` annotation position runs
    `collectUnresolvedNamedTypes` and nothing else (`:6162`); the `params:`
    per-field loop runs the lowering and drains the unresolved-name sink only
    (`src/parser/params.ts:147–175`); the `invoke<T>` return annotation
    reaches no check pass.
  - **The annotation root, where the fragment is the compiled document.**
    `src/runtime/query-schema-lowering.ts:140–145` — the brace-rooted arm
    hands the body to `lowerInlineObject` and returns its fragment as the
    document root. `src/extension/production-theta-producer.ts:2314` lowers
    once for the typed query and `:3316` compiles the same lowering for the
    `invoke<T>` return boundary.
  - **The compile that throws.** `src/seams/schema-validator.ts:149` —
    `AjvSchemaValidator.#build` calls `this.#ajv.compile(schema)`. The Ajv
    instance is constructed at `:112` with `strict: false`, which does not
    disable meta-schema validation; the meta-schema constrains `required` to
    unique items, and it is applied to the ROOT document only, which is why a
    duplicate `required` inside a `$defs` entry compiles and a duplicate at
    the root throws.
  - **When the throw fires, and the frame it reaches.** Two compile sites
    consume the annotation root's lowering during a typed query:
    `src/extension/production-theta-producer.ts:2579` (the respond tool's
    `execute` verdict, reached from `#executeRespondTool` at `:2692`) and
    `src/runtime/typed-query-validation.ts:323` (`validateAgainst`, reached
    from `src/runtime/query-tool-loop.ts:693` for QRY-22). Both run over a
    candidate payload, so neither runs before the model has answered.
    `src/runtime/query-tool-loop.ts` contains no `catch`, and no theta-owned
    `catch` sits between `:693` and the top-level slash catch
    (`src/extension/theta-composition-producer.ts:443`), which frames a
    non-`ThetaPanic`, non-`HostFatal` throw as
    `theta /<name> aborted with internal error: <message>` (`:481–493`,
    `theta/runtime/internal-error`).
  - **What the model is shown.** `src/runtime/respond-tool-wire.ts:91–94` —
    an object-rooted lowering is passed through verbatim, so the respond
    tool's `parameters` and the QRY-15 `<schema-json>` conveyance carry
    `required: ["a", "a"]` as written (fixture A5).
  - **Spec.** `docs/spec_topics/grammar.md:101` (the `ObjectType` production —
    "`Field` per Schema Declarations") and `:109` (the field-semantics
    sentence, incl. the two wire-name diagnostics "within the one inline
    object"); `docs/spec_topics/schemas.md:44` (the collision rule);
    `docs/spec_topics/diagnostics/code-registry-parse.md:85` (the
    `theta/parse/wire-name-collision` row: *Trigger* "Two fields in the same
    schema share a wire name…", *Message* `wire name '<name>' collides with
    another field on schema '<schema>'`); `:91` (the
    `theta/parse/duplicate-enum-variant-name` row — the registry's existing
    treatment of a repeated declaration name in a body);
    `docs/spec_topics/schema-subset.md:73` (inline hoisting into `$defs` under
    `__inline_<slug>`) and `:76` (the `$ref` emission).
  - **User-facing mirrors that carry the same claim.**
    `docs/reference/grammar.md:155` (the production) and `:168–170`
    ("`ObjectType` fields reuse the object-schema `Field` form");
    `docs/reference/diagnostics.md:134` (the collision row);
    `docs/reference/schema-subset.md:52` (the collision rule).
  - **Not affected.** `array<{…}>` — its element type is never split into
    fields, so `schema S { p: array<{a: integer, a: string}> }` lowers
    `properties.p = {}` (fixture H1) — the generic-argument split is angle-only
    by design (`src/parser/params.ts:681–686`), so a two-field interior
    presents as two arguments, the `array` arm (`:392–395`, exactly one
    argument) is not taken and the permissive generic fallthrough
    (`:396–402`) returns `{}` whether or not the two names repeat (fixtures H2,
    H3). A name reused one level DOWN
    (`{a: integer, b: {a: string}}`) is not a repeat — the inner `a` lands in
    its own hoisted fragment with a one-item `required` (fixture H4). No
    committed `.theta` / `.thetalib` carries a repeated inline field name: the
    only committed inline object type is
    `tests/live/acceptance/fixtures/acc-typed-inline.theta:14`
    (`{ ok: boolean, label: string }`), and a PCRE2 scan for a repeated field
    name inside one brace group over `src/`, `tests/` and `docs/` matches only
    this report's predecessor text (`docs/bugs/0039-…md:260`).
- **Observed at:** `0.49.0` (HEAD `52e257bc`). Offline, deterministic, no live
  model and no provider: scratch vitest over `parseThetaDocument` (the real
  load path, through `parseDoc` in `tests/helpers/e2e-s1.ts`),
  `lowerQueryResponseSchema`, `buildBodyTypeSchemas`, `respondToolWireSchema`
  and the production `AjvSchemaValidator`; written, run, deleted. Every value
  below is that run's output verbatim.

## Fix (0.84.0)

- **Baseline drift, re-derived before anything was pinned.** The report's
  citations are at `52e257bc` (0.49.0), 34 minors back. Every `path:line` moved
  (`hoistInlineObjectType` `params.ts:502`→`:670`, `lowerInlineObject`
  `body-type-lowering.ts:151`→`:153`, `checkObjectSchema`
  `schema-declarations.ts:65`→`:87`, `parseObject`
  `type-grammar.ts:275–307`→`:367`, the walk's `object` arm `:374`→`:519`, and
  every `theta-document.ts` call site); every OBSERVABLE re-derived BYTE-EXACT —
  all of A1–A6, B1–B3, C1–C4, D1–D5, E1, G1–G5 and H1–H8, including the A2
  throw text and the `__inline_7e1395c6a16e04cf` slug. Two of §Affected's claims
  are stale in the fix's favour: "three of the eight positions run no
  type-grammar pass" is false at this HEAD (0044 wired the `params:` loop and
  the `@<T>` root with the FULL walk; 0045 wired `invoke<T>` with the narrow
  set), so §Fix constraint 3 needed NO new call site.
- **Reuse, as [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)
  §Fix's "0052 coordination" prescribes.** The rule lives in `walkType`'s
  `object` arm and JOINS the `"inline-object-shape"` rule SET
  (`TypeCheckRules`), so it runs under every `rules` value and reaches all eight
  positions with zero wiring: no new call site, no second pass, no parallel
  selector, and the single `invoke<T>` call in `walkExpr` unedited. The names
  change is to the NODE.
- **What shipped**
  - `src/parser/type-grammar.ts` (567 → 835) — `TypeParser.parseObject` retains
    `fieldNames` on the object node, pushed as soon as the interior spells
    `Ident ":"` at a field-name position (before the type parses, so a stolen
    type cannot erase an author's name), range-free because a field name's own
    span is [0154](./0154-inline-object-type-field-name-rules-unenforced.md)'s
    open subject; a local stop suppresses further names once a field's type
    carries an interior that never closes (transitive `carriesUnclosedInterior`
    over object fields, generic args and union arms), which is what keeps the
    enclosing body from comparing a nested interior's leftovers as its own;
    `closingBraceSpelled` (from `interiorSpellsClosingBrace`, a depth-0 `}`
    ahead of the interior in the token stream) gates the rule on the brace
    `ObjectType` spells; and `walkType`'s `object` arm emits
    `theta/parse/duplicate-inline-field-name` once per repeated name at that
    name's second position, over two `Set`s (never a plain object — an author
    field name spelling `__proto__` or `constructor` is compared like any
    other), withheld beneath a generic type argument via a new
    `insideGenericArgument` walk parameter the `generic` arm sets and the
    `object`/`union` arms propagate.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the NEW row
    (DIAG-2, same commit), severity `E`, phase `parse`, *Message*
    `duplicate field name '<field>' within one inline object type`, *Spec*
    [Grammar Appendix — Type grammar](../spec_topics/grammar.md#type-grammar),
    no *Hint*. Its *Trigger* states the comparison key (the field-name positions
    the interior spells as `Ident ":"`), the three stops, the closing-brace
    requirement, the multiplicity and ordering, and the three excluded shapes.
  - `docs/spec_topics/grammar.md` §"Inline object types" — one sentence naming
    the code, in the idiom of the neighbouring empty-object sentence, with the
    nested-reuse and generic-argument boundaries.
  - `docs/reference/diagnostics.md`, `docs/reference/grammar.md` — the
    user-facing mirrors, lock-step.
  - `src/parser/theta-document.ts` — one comment clause in `walkExpr`'s
    `"invoke"` arm: the set this fix joins carries two rules, so "the one rule
    this call wires" was false of the code.
  - `tests/inline-object-duplicate-field-name.test.ts` (new, 49 cells) and one
    additive H8a cell in `tests/live/live-production-acceptance.test.ts`
    (26 → 27).
- **The open adjudication, settled: a NEW row, not a widened
  `theta/parse/wire-name-collision` *Trigger*.** That row's *Message* carries
  `<schema>`, which `placeholder-rendering-b.md` §7 fixes as identifier-shaped,
  and an inline object has no name; the one literal candidate (`{}`) is already
  bound by 0045's carve-out to mean the EMPTY inline object, so reusing it would
  render a message false of the source, and rendering the body's own text needs
  token spans the tokeniser does not carry. The new row's *Message* uses
  `<field>` — an existing category-5 source-derived identifier-shaped
  placeholder — so the CLOSED placeholder table needed no carve-out at all, and
  because the rule compares only `ident` tokens the subject is always identifier
  form. §Expected's own observation ("The field case has no counterpart row",
  beside `theta/parse/duplicate-enum-variant-name`) is the precedent. The
  declaration spelling does not move (DIAG-3/DIAG-4): `checkObjectSchema` is
  untouched and E1/G3/G5 render byte-identically.
- **The H1 reading, settled.** §Fix constraint 3's "every nesting depth" is
  general; §Fix's own *Test witness* requires H1's `array<…>` element "asserted
  still silent and byte-unchanged", §Non-goals says a repeat inside such an
  element "is invisible … and stays so here", and constraint 4 names H1 as one
  of three fixtures pinning the chosen key's AGREEMENT with what is lowered.
  Measured: the lowering never divides a generic argument's interior into fields
  at any arity (`array<{a: integer}>` → `items: {}`), so agreement means
  silence. The specific carve-out governs the general clause, which its own
  examples (a nested body, a union arm) do not extend to generic arguments.
  Both variants were prototyped and neither flipped an existing test, so the
  decision rests on the document alone.
- **Multiplicity and order, settled.** One line per repeated NAME at its second
  position (H5's three-way repeat draws one), two repeated names draw two in
  source order, sibling bodies draw one each, and a body's own repeats precede
  those of the bodies nested in its field types.
- **Blast radius, pre-measured before the witness was written.** The emission
  was prototyped and the FULL suite run at HEAD: 277 files / 4306 tests green,
  ZERO existing-test flips, under both the generic-argument-suppressed and the
  uniform variant. The GOV-15 re-scan at this HEAD (a multi-line PCRE2 sweep
  over `src/`, `tests/`, `docs/`, `examples/` and all 35 committed
  `.theta`/`.thetalib`) matches only this report's and 0039's prose — the only
  committed inline object type is `acc-typed-inline.theta` with distinct names —
  so the
  [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  disposes of the addition and no landed lock inverts. The prototype was
  reverted byte-exact (blob hash) before Phase 1.
- **Gates.** Witness `tests/inline-object-duplicate-field-name.test.ts` 49/49;
  full default suite 278 files / 4355 tests green (`npm test`);
  `npx tsc -p tsconfig.json --noEmit` clean; `npm run lint` clean. Live: H8a
  `tests/live/live-production-acceptance.test.ts` 27/27 (the new cell 303 ms,
  registration-only, zero tokens), H9a `tests/live/acceptance/` 11/11.
  `tests/fixtures/h7a/permitted-codes.json` byte-unchanged: decided by the real
  H9a run plus a sweep of every live fixture and embedded theta source — the
  code is unreachable from the acceptance corpus, the 0045 precedent exactly.
- **Review.** Four rounds, plus one pre-review citation/comment-only correction
  round (not a review round). Round 1 (deep): four findings — the malformed-field
  scan truncation (adjudicated a residual, not fixable in scope), an emission
  outside the *Trigger* on a stolen type (fixed by re-keying the name list onto
  the `Ident ":"` position), H7 unpinned (added), one false comment clause
  (fixed). Round 2 (fast): one `correctness` finding — the truncation also
  curtails an ENCLOSING body — plus `recommend-deep-review`; adjudicated the same
  residual class, disclosure widened. Round 3 (deep): a genuine cross-body FALSE
  POSITIVE (`{p: {c: 1, : y, p: 2}}` named a repeat no single body spells) and an
  under-described boundary; both fixed by the name-list stop, the closing-brace
  gate and the *Trigger* rewrite. Round 4 (deep): CLEAN, no finding in any
  category, with the divergence from round 3's literal brace instruction judged
  correct and witnessed (gating on the parse-time `braceClosed` would silence a
  source that DOES spell its `}`).
- **Verification.** VERIFIED, four obligations. (i) Three neutralisations —
  removing the emission, reverting the name retention, dropping the
  generic-argument gate — red 25, 25 and exactly 1 (d3) cells respectively, each
  restored byte-exact by matching blob hash `3bbb6b3c`; `git stash` unused
  throughout. (ii) Full suite green, plus 0045's lock (46), 0035's byte-freeze
  (37), the declaration controls (10) and the committed-fixture gate (34), each
  run alone. (iii) H8a and H9a run for real, above. (iv) Typecheck and lint
  clean.
- **Residuals.**
  1. *A stop position masks a duplicate, and the A2 throw stays reachable
     through it.* The comparison ends at the first field-name position the
     interior cannot read as `Ident ":"`, and such a position also ends the
     comparison of every body enclosing it. Measured, all silent and all still
     minting the duplicate `required` this report owns:
     `{a: integer, : x, a: boolean}` and
     `{a as "w": integer, a: string, a: boolean}` (root `["a","a"]` /
     `["a as \"w\"","a","a"]`), `{"a": string, a: integer, a: boolean}`,
     `{p: {c: 1, : y, c: 2}, p: 3}` and `{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}`
     (root `["p","p"]`, so `ajv.compile` throws A2's message), and
     `{a: 1 a: 2, a: 3}` (a completed field not followed by `,`). Pinned as
     group (k) of the witness, and stated in the row's *Trigger* so the boundary
     is normative rather than accidental. Not closed here on two measured
     grounds: a resync in `parseObject`'s tolerant recovery changes which field
     types the walk visits on malformed interiors and so moves
     `theta/parse/void-in-non-return-position`,
     `theta/parse/generic-arity-mismatch` and
     `theta/parse/result-in-schema-position` on unmeasured inputs; and
     brace-level resync alone would still not deliver §Expected's "no fragment
     carrying a repeated `required` entry is ever minted", because the same-body
     shapes need per-FIELD resync. 0045 §Non-goals reserves this
     malformed-but-non-empty interior family with "widening the inline rule to
     these shapes needs its own spec decision". The closing route is §Fix
     constraint 4's SECOND branch — comparing over the lowerers' own
     `splitTopLevel`/`topLevelColon` tokenisation — which would re-key the rule
     onto raw pre-colon text and flip the rename and quoted-name dispositions
     below.
  2. *The `as "WireName"` rename inside an inline body is still unparsed*
     (§Non-goals). Re-derived at this HEAD: G1/G2/G4 load `[]`, and the whole
     pre-colon text becomes the property name. The settled reading for the
     rename+duplicate edge is that the rename is one of the stops, so
     `{a as "w": integer, a as "x": string}` is silent (its two property names
     differ — consistent with G1) and so is
     `{a as "w": integer, a as "w": string}`, which still lowers one last-wins
     property beside `required: ["a as \"w\"","a as \"w\""]`. Pinned as d4.
  3. *A quoted field name is not a `Field`.* `{"a": string, "a": integer}` is
     silent and lowers one property keyed `"a"` beside a two-item `required` —
     the defect's own shape at a position the row excludes, and 0045
     §Non-goals' malformed-interior family. Pinned as d5.
  4. *The compound position emits per check-site.* `let r: {a: integer, a:
     string} = @`hi`` draws the line TWICE, because the annotation text
     propagates into the query's schema and both walks check it. Inherited from
     the walk, identical for the three rules that already owned it (0045 §Fix
     residual (i));
     [0093](./0093-let-annotation-over-query-double-emission.md) owns the class.
     Pinned as h1 so that fix flips it knowingly.
  5. *Position-only citation drift.* `tests/reserved-keyword-type-position.test.ts`
     cites `type-grammar.ts:36–51` for `TypePosition`; it was already stale at
     `df7a3d55` and this fix moved the file further (567 → 835). Disclosed, not
     chased (0134's class). Nothing this fix authored cites that file by line.
- **Measured NOT to be a
  [0129](./0129-empty-inline-object-schema-field-double-diagnostic.md) instance.**
  This rule adds no case of two `E` lines for ONE written mistake:
  `schema S by kind = {kind: "a", kind: "b"} | Cat` and
  `schema S by p = {a: 1, a: 2} | Cat` each draw this code alone, and every
  co-emission measured (`{a: void, a: void}`, `{a: {}, a: {}}`,
  `{a: Result<…>, a: string}`, `{a: array<integer,string>, a: string}`) is one
  code per DISTINCT written fault. No disclosure note is owed there.
- **Discharge notes appended.**
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  §Fix (0.49.0) *Residuals* item (i) (the residual this report was filed from);
  0045 §Fix (0.57.0) "0052 coordination" (the prescribed reuse happened);
  0154 §Status (the field-name retention shape it rebases onto).
- **Pinned dispositions / non-goals, unmoved.** The permissive `array<{…}>`
  element (H1–H3 byte-unchanged); AJV's root-only meta-schema validation — the
  refusal removes the outcome for well-formed interiors rather than reframing
  the throw, and no `catch` is added at any AJV seam; a duplicate YAML key in
  `params:` (measured again: `p: {a: integer, a: string}` unquoted is a
  duplicate-key flow mapping, drawing `theta/load/missing-mode` with the
  frontmatter discarded — adjacent
  [0041](./0041-params-block-mapping-rhs-silent-permissive.md), pinned as the
  a11 control); 0039's residuals (ii)–(iv).

## Summary

An inline object body is split into fields by exactly two functions, and
neither of them, nor anything upstream of them, asks whether a field name
repeats. `{a: integer, a: string}` is accepted at every `Type` position and
reduced to one property carrying the SECOND declared type, beside a `required`
array that lists the name twice.

The same two fields written as a `schema` body are refused at parse:
`theta/parse/wire-name-collision` fires, because a field with no `as` rename
has its theta-side name as its effective wire name and the two collide.
`grammar.md:109` says the inline form carries the same field semantics and
names that diagnostic as applying within one inline object. It does not fire
there.

The consequence splits by position:

1. **The three hoisting positions lower a duplicate-carrying fragment and
   enforce it.** `schema S { p: {a: integer, a: string} }`, `schema T = {a:
   integer, a: string}` and `params:` `p: "{a: integer, a: string}"` all hoist
   `$defs.__inline_7e1395c6a16e04cf` = `{"type":"object","properties":{"a":{"type":"string"}},"required":["a","a"],"additionalProperties":false}`
   — one content-addressed entry shared by all three, because the slug is the
   hash of that fragment. AJV compiles those documents without complaint (the
   meta-schema check applies to the root, not to `$defs` members) and
   validates `a` as a string. The author's `a: integer` is gone, with no
   diagnostic anywhere.
2. **The `@<T>` annotation root defers the failure to after the model turn.**
   There the fragment IS the document root, so `ajv.compile` meta-schema-checks
   it and throws `schema is invalid: data/required must NOT have duplicate
   items (items ## 1 and 0 are identical)`. Both compile sites run over a
   candidate payload, so the throw needs a query turn to have completed first.
   It is not a diagnostic: it surfaces through the runtime-defect path as an
   internal error.
3. **The positions that lower nothing are silent with no artefact at all.**
   A `let` annotation, an `fn` parameter type and an `fn` return type — plus
   the nested-in-a-`fn`-body variant and the `.thetalib` spelling of the
   schema-body position — all load with zero diagnostics.

## Reproduction

Offline at HEAD `52e257bc`, 0.49.0. Each fixture is a `mode: prompt` document
parsed through `parseThetaDocument`; the lowered bytes are read back through
the production entry points named per group. Probe output quoted verbatim.

**(1) The annotation root — `lowerQueryResponseSchema(annotation, [], [])`,
then `AjvSchemaValidator.compile` over the result, then
`respondToolWireSchema`.**

```
A1 @<{a: integer, a: string}>  lowered :: {"type":"object","properties":{"a":{"type":"string"}},"required":["a","a"],"additionalProperties":false}
A2 A1 compiled                 :: THROW Error: schema is invalid: data/required must NOT have duplicate items (items ## 1 and 0 are identical)
A3 control @<{a: integer, b: string}> :: {"type":"object","properties":{"a":{"type":"integer"},"b":{"type":"string"}},"required":["a","b"],"additionalProperties":false}
A4 A3 compiled                 :: OK
A5 A1 respond-tool wire schema :: {"type":"object","properties":{"a":{"type":"string"}},"required":["a","a"],"additionalProperties":false}
A6 document load `let r = @<{a: integer, a: string}>`x`` :: []
```

`A5` is byte-identical to `A1`: an object root is passed through verbatim, so
`required: ["a", "a"]` is what the respond tool advertises and what QRY-15
conveys.

**(2) The duplicate one level DOWN at the annotation root — hoisted, so it
compiles.**

```
B1 @<{p: {a: integer, a: string}}> lowered :: {"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_7e1395c6a16e04cf"}},"required":["p"],"additionalProperties":false,"$defs":{"__inline_7e1395c6a16e04cf":{"type":"object","properties":{"a":{"type":"string"}},"required":["a","a"],"additionalProperties":false}}}
B2 B1 compiled                     :: OK
B3 document load                   :: []
```

**(3) The three hoisting positions — `parseThetaDocument`, then
`buildBodyTypeSchemas` (schema body / alias RHS) or the parsed
`params.loweredSchema`.**

```
C1 schema S { p: {a: integer, a: string} }        load :: []
C1 $defs entry :: {"type":"object","properties":{"a":{"type":"string"}},"required":["a","a"],"additionalProperties":false}   (name __inline_7e1395c6a16e04cf)
C1 compiled    :: OK
C2 schema T = {a: integer, a: string}             load :: []
C2 lowered     :: {"$ref":"#/$defs/__inline_7e1395c6a16e04cf","$defs":{"__inline_7e1395c6a16e04cf":{…as C1…}}}
C2 compiled    :: OK
C3 params: p: "{a: integer, a: string}"           load :: []
C3 loweredSchema :: {"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_7e1395c6a16e04cf"}},"required":["p"],"additionalProperties":false,"$defs":{"__inline_7e1395c6a16e04cf":{…as C1…}}}
C3 compiled    :: OK
C4 params: p: "{q: {a: integer, a: string}}"      load :: []
C4 loweredSchema :: two entries — __inline_eb9bf4f8ceeb3a66 (field q → $ref) and __inline_7e1395c6a16e04cf (…as C1…)
C4 compiled    :: OK
```

One `$defs` name serves C1–C4 and B1: the slug is the canonical hash of the
duplicate-carrying fragment (`schema-subset.md:73`), so every position that
lowers this text addresses the same entry.

**(4) The positions that lower nothing — all silent.**

```
D1 let x: {a: integer, a: string} = 1                 :: []
D2 fn f(p: {a: integer, a: string}) { 1 }             :: []
D3 fn f(): {a: integer, a: string} { 1 }              :: []
D4 fn f() { let x: {a: integer, a: string} = 1 }      :: []
D5 .thetalib, schema S { p: {a: integer, a: string} } :: []
```

**(5) The declaration control — the same two fields in a `schema` body are
refused.**

```
E1 schema S { a: integer, a: string }
   :: ["error theta/parse/wire-name-collision :: wire name 'a' collides with another field on schema 'S'"]
```

**(6) Shape probes that bound the defect.**

```
H1 schema S { p: array<{a: integer, a: string}> } load :: []   $defs.S.properties.p :: {}
H2 @<{p: array<{a: integer, b: string}>}> :: {"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}
H3 @<{p: array<{a: integer}>}>            :: {"type":"object","properties":{"p":{"type":"array","items":{}}},"required":["p"],"additionalProperties":false}
H4 @<{a: integer, b: {a: string}}> :: {"type":"object","properties":{"a":{"type":"integer"},"b":{"$ref":"#/$defs/__inline_968e40317188aebd"}},"required":["a","b"],…,"$defs":{"__inline_968e40317188aebd":{"type":"object","properties":{"a":{"type":"string"}},"required":["a"],…}}}
H5 @<{a: integer, a: string, a: boolean}> :: {"type":"object","properties":{"a":{"type":"boolean"}},"required":["a","a","a"],"additionalProperties":false}
H6 @<{a: integer, a: integer}>            :: {"type":"object","properties":{"a":{"type":"integer"}},"required":["a","a"],"additionalProperties":false}
H7 @<{ a : integer , a : string , }>      :: {"type":"object","properties":{"a":{"type":"string"}},"required":["a","a"],"additionalProperties":false}
H8 schema T = {a: integer, a: string} | Cat :: {"anyOf":[{"$ref":"#/$defs/__inline_7e1395c6a16e04cf"},{"$ref":"#/$defs/Cat"}],"$defs":{…}}
```

`H6` is the count, not a merge: two fields that lower alike still produce a
two-item `required`. `H7` shows whitespace and a trailing comma do not change
it. `H4` is the non-defect: a name reused inside a nested object is a
different field list and lowers a one-item `required`.

**(7) The wire-rename form inside an inline object, probed for contrast with
`grammar.md:109`'s second named diagnostic.**

```
G1 @<{a as "w": integer, b as "w": string}> load :: []
G1 lowered :: {"type":"object","properties":{"a as \"w\"":{"type":"integer"},"b as \"w\"":{"type":"string"}},"required":["a as \"w\"","b as \"w\""],"additionalProperties":false}
G2 schema S { p: {a as "w": integer, b as "w": string} } load :: []
G3 control schema S { a as "w": integer, b as "w": string }
   :: ["error theta/parse/wire-name-collision :: wire name 'w' collides with another field on schema 'S'"]
G4 @<{a as "a": integer}> load :: []    (no theta/parse/redundant-wire-name)
G5 control schema S { a as "a": integer }
   :: ["warning theta/parse/redundant-wire-name :: redundant 'as' clause: wire name 'a' equals the theta-side name"]
```

The inline lowerers do not parse `as` at all — the whole text before the
colon becomes the property name (`G1`). Neither of the two diagnostics
`grammar.md:109` names fires inside an inline object. §Non-goals records the
rename half as a separate subject.

## Expected behaviour

`grammar.md:101` defines `ObjectType` as `"{" Field ("," Field)* ","? "}"`
with "`Field` per Schema Declarations", and `:109` states the fields "reuse
the same `Field` form as an object-schema body and carry the same field
semantics", naming `theta/parse/wire-name-collision` as applying "within the
one inline object". `schemas.md:44` states the rule those semantics carry:
"Two fields in the same schema cannot share a wire name… Either is
`theta/parse/wire-name-collision`." A field with no `as` rename has its
theta-side name as its wire name: `schemas.md:45` makes an explicit rename to
that same string redundant, and `schema-subset.md:87` records a wire-name
translation entry for renamed fields only while `:78` lowers `properties` and
`required` from wire names at every field. Implemented as `wireName ??
thetaName` (`src/parser/schema-declarations.ts:109`). Two fields both named
`a` therefore share one wire name.

Therefore `{a: integer, a: string}` is a refused input at every `Type`
position, with a parse-phase error diagnostic naming the repeated field,
raised before any lowering runs. Fixture E1 is what that refusal looks like
for the declaration spelling; the inline spelling owes the same outcome, and
`type-system.md:15`'s position invariance requires it to be the same at all
eight positions.

Two consequences of the refusal, both required:

- No fragment carrying a repeated `required` entry is ever minted, so nothing
  reaches AJV. The A2 throw becomes unreachable rather than better-framed.
- No property is silently dropped. Today `a: integer` disappears from the
  lowered schema (A1, C1–C4) with nothing recorded.

The registry has an adjacent precedent for a repeated declaration name inside
a body: `theta/parse/duplicate-enum-variant-name`
(`code-registry-parse.md:91`) fires for `enum X { Low, Low }` regardless of
whether either variant carries an explicit value, and runs BEFORE the
value-duplication check. The field case has no counterpart row.

## Actual behaviour / root cause

**The field list is built twice, and neither builder is a checker.** After
0039 §Fix part B there is one hoisting arm — `hoistInlineObjectType`
(`src/parser/params.ts:502`) — shared by the `params:` position
(`lowerParamsFieldType`, `:606`/`:614`) and by `lowerTypeSource`
(`src/parser/body-type-lowering.ts:395` for a whole source, `:406` for a brace
union arm). Its loop writes into a plain object and an array:

```
properties[fieldName] = lowerFieldType(fieldType, lowerCtx);   // params.ts:519
required.push(fieldName);                                      // params.ts:520
```

A repeated name overwrites the property (last-wins) and appends to `required`.
`lowerInlineObject` (`body-type-lowering.ts:151`), the annotation root's
lowerer, reaches the same two writes through `lowerObjectFields` (`:119`,
`:126`). That is the whole mechanism: `{"properties":{"a":{"type":"string"}},"required":["a","a"]}`
is the direct image of two loop iterations over the same key.

**Nothing upstream sees the names.** The parser's only field-name check is
`checkObjectSchema` (`schema-declarations.ts:65`), and its two call sites
(`theta-document.ts:5880`, `:2394`) are `schema` declarations. The type-grammar
parser is the one component that does structurally parse an inline object
interior, and it discards names by construction: `parseObject`
(`type-grammar.ts:275–307`) reads the field-name token and drops it
(`:279–286`), keeps types only (`:293`), skips an `as "WireName"` rename
(`:295–300`), and returns `{ kind: "object", fieldTypes }` (`:307`).
Independently, three of the eight positions never run that parser at all —
the `@<T>` annotation root (`theta-document.ts:6162` runs
`collectUnresolvedNamedTypes` alone), the `params:` per-field loop
(`params.ts:147–175`), and the `invoke<T>` return annotation.

**Why the annotation root is the position that throws.** `AjvSchemaValidator`
constructs Ajv with `strict: false` (`schema-validator.ts:112`), which
suppresses strict-mode complaints but not meta-schema validation, and
`ajv.compile` (`:149`) meta-schema-validates the document it is handed. The
meta-schema constrains `required` to unique items. At the hoisting positions
the duplicate sits inside a `$defs` member, which that check does not reach
(fixtures B2, C1–C4 compile OK; the compiled validator then checks `a` present
twice, which no payload can distinguish from checking it once, and enforces
the last-wins `properties.a`, which every payload can). At the annotation root `lowerQueryResponseSchema`
(`query-schema-lowering.ts:140–145`) returns `lowerInlineObject`'s fragment AS
the root, so the check applies and the compile throws (A2).

**When the throw fires.** Both compile sites for that lowering run over a
candidate payload: the respond tool's `execute` verdict
(`production-theta-producer.ts:2579`, reached from `#executeRespondTool` at
`:2692`) and QRY-22's `validateAgainst` (`typed-query-validation.ts:323`, from
`query-tool-loop.ts:693`). The `invoke<T>` return boundary compiles the same
way after the callee returns (`production-theta-producer.ts:3316`). So the
theta loads, registers, renders its query, spends a model turn, and fails on
the way back. `query-tool-loop.ts` holds no `catch`; the throw is a plain
`Error`, so it is neither a `ThetaPanic` nor a `HostFatal` and reaches the
top-level slash catch (`theta-composition-producer.ts:443`), which frames it
as `theta /<name> aborted with internal error: <message>` (`:481–493`). That
framing is traced through the code, not exercised end-to-end here; the throw
itself is measured (A2).

## Why it matters

- **A declared field is dropped without a word.** `{a: integer, a: string}`
  keeps one property, typed by the second declaration. At the `params:` and
  `schema`-body positions the theta loads, registers and runs; the binder and
  the validator both work against a shape the author did not write.
- **The failure that is not silent is worse-placed.** At the `@<T>` root the
  author gets no load-time diagnostic and no validation error but an internal
  error, after the model turn, on every run of that query. §Reproduction
  records the throw at the compile seam (A2); the message it carries is about
  JSON Schema `required` items and names neither the theta source nor the
  field.
- **The duplicate is conveyed to the model.** The respond tool's `parameters`
  and the QRY-15 `<schema-json>` are the wire schema, byte-identical to the
  fragment for an object root (A5, `respond-tool-wire.ts:91–94`). A repeated
  `required` entry is invalid JSON Schema being handed to a provider.
- **The two spellings of the same declaration disagree.** `schema S { a:
  integer, a: string }` is refused at parse (E1); `schema S { p: {a: integer,
  a: string} }` is not. `grammar.md:109` states they carry the same field
  semantics, so at HEAD the spec and the implementation disagree, and the
  user-facing mirror (`docs/reference/grammar.md:168–170`) repeats the claim.
- **It is reachable from a typo.** Two fields with the same name in a
  hand-written inline object is an ordinary editing accident, and the
  hoisting positions give no signal at all that one of the two was discarded.

## Fix

A parse-time refusal of a repeated field name inside an inline object body, at
every `Type` position. The lowering is not changed.

**The check.** One pass over an inline object body's field-name list, raising
once per repeated name, in source order, before the body is lowered. The
declaration spelling keeps its present behaviour byte-for-byte:
`checkObjectSchema`'s collision loop (`schema-declarations.ts:103–138`) is
untouched, so fixture E1 and every existing wire-name case render as they do
today (DIAG-4).

**Constraints, all binding:**

1. **Refusal at parse, not dedup at lowering.** `hoistInlineObjectType`
   (`params.ts:502`) and `lowerInlineObject` (`body-type-lowering.ts:151`)
   emit byte-identical output for every non-duplicate input, including minted
   `__inline_<slug>` names. 0039 §Fix's freeze (`:607–610`) and its lock
   (`tests/params-inline-object-lowering.test.ts`, byte-identical to 0.48.0)
   hold. Deduping in the shared arm is not available: those bytes ARE the
   frozen `params:` position's output for the same text.
2. **The annotation-root throw is replaced, not caught.** A refused
   `@<{a: integer, a: string}>` never reaches `lowerQueryResponseSchema`
   (`query-schema-lowering.ts:140–145`), so no document is compiled and A2 is
   unreachable. The test witness asserts both halves: the fixture is refused
   at load, and no compile occurs. No `catch` is added at any AJV seam.
3. **All eight positions, uniformly** (`type-system.md:15`). The five wired
   positions (`theta-document.ts:5739`, `:5814`, `:5820`, `:5899`, `:5494`)
   and the three unwired ones (the `@<T>` root at `:6162`, the `params:`
   per-field loop at `params.ts:147–175`, the `invoke<T>` return annotation).
   At every nesting depth: an inner body's repeat is its own occurrence, and a
   name reused between an outer body and an inner one is NOT a repeat
   (fixture H4).
4. **Field names must survive to the check.** `parseObject`
   (`type-grammar.ts:275–307`) discards them today (`:279–286`), so the rule
   either retains them there or runs over the same interior tokenisation the
   lowerers use (`splitTopLevel(body, ",", "angle-and-brace")` plus
   `topLevelColon`, `params.ts:709`/`:654`). The second is the tokenisation
   that agrees with what is lowered; whichever is chosen, the fixtures in
   §Reproduction group (6) pin the agreement (`H7`'s whitespace and trailing
   comma, `H1`'s `array<…>` element, `H8`'s union arm).
5. **Registry, same commit (DIAG-2).** The emitted code carries a registry row
   whose *Trigger* names the inline-object body, landed in the same commit as
   the code — `docs/spec_topics/diagnostics/diagnostic-shape.md:72` makes a
   code addition or a trigger change a spec change, not an implementation
   change — with the user-facing mirror (`docs/reference/diagnostics.md:134`
   for the existing row) updated in lock-step. The rendered *Message* must
   resolve under the existing placeholder categories: `<schema>` is
   identifier-shaped (`placeholder-rendering-b.md:55`) and an inline object
   has no name, so the subject rendering is part of the row's decision. This
   report does not settle which registered code carries the inline case —
   `theta/parse/wire-name-collision` widened to the position `grammar.md:109`
   already assigns it, or a new row — only that the row and the code land
   together and that the declaration spelling's rendering does not move
   (DIAG-3/DIAG-4).
6. **GOV-15.** Every newly-refused input loads with no `E`-severity
   diagnostic at 0.49.0 (§Reproduction: all fixtures except E1/G3/G5 return
   `[]`), so all are inside the
   [loads-cleanly](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
   input set (`:7`), and the
   [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
   (`:23`) disposes of the addition "in-scope as an addition for inputs newly
   brought into the code's emission set". No committed `.theta` / `.thetalib`
   carries the shape, so `tests/committed-fixture-parse-gate.test.ts:122`
   stays green, and no test fixture in the tree carries it either (PCRE2 scan,
   §Affected), so no landed lock inverts.

**Fix ordering.** This report blocks on nothing. It shares wiring — not a
rule — with
[0045](./0045-inline-empty-object-type-missing-empty-schema-body.md): both
need the same three unwired positions to run a parse-time check over an inline
object body. Whichever lands second reuses the first's call sites rather than
adding a second pass, and records the reuse. The two rules are independent:
0045's fires on an EMPTY body, this one on a body with a repeated name, and no
input satisfies both.

**Test witness — unit, offline, no live provider.** Every fixture in
§Reproduction is a `parseThetaDocument` call plus a lowering read-back; the
red/green contrast is the diagnostic list, with the message sourced from the
registry row (DIAG-4). Required beyond the probes: one refusal cell per
position (all eight, both the `.theta` and `.thetalib` spellings), including
the nested-body and union-arm depths; the multiplicity cells (`H5`'s
three-way repeat, two independent repeats in one body, a repeat in each of two
sibling bodies); the non-repeat controls (`H4`'s nested reuse, `A3`, `H1`'s
`array<…>` element) asserted still silent and byte-unchanged; the declaration
controls (E1, G3, G5) byte-unchanged; and an unreachability cell proving a
refused annotation never reaches `lowerQueryResponseSchema` and no AJV compile
runs.

## Non-goals

- **The `as "WireName"` rename inside an inline object body.** Fixtures
  G1–G2 show it is not parsed at all: the property name becomes the source
  text `a as "w"`, and neither `theta/parse/wire-name-collision` nor
  `theta/parse/redundant-wire-name` fires, against `grammar.md:109`'s explicit
  claim that both apply within one inline object. That is a separate defect on
  the same sentence, unfiled, and it bounds constraint 4: a fix that reuses
  `checkObjectSchema`'s field shape must first have a field parse that
  understands `as`, whereas the duplicate-name rule needs only the name.
- **The permissive `array<{…}>` element.** `properties.p = {}` (fixtures H1,
  H2) follows from the angle-only generic-argument split
  (`src/parser/params.ts:681–686`, `:392–402`) and holds for distinct names
  too; a repeat inside such an element is invisible for that reason and stays
  so here.
- **AJV's root-only meta-schema validation.** The asymmetry between B2/C1–C4
  (compile OK) and A2 (throw) is a property of the validator seam, not a
  defect this fix addresses; refusing the input at parse removes both
  outcomes.
- **A duplicate YAML key in the `params:` block.** `params:` with two `p:`
  entries reports `theta/load/missing-mode` and drops the whole frontmatter
  (measured), which is a frontmatter-parse subject, not an inline-object one.
  Unfiled; adjacent to
  [0041](./0041-params-block-mapping-rhs-silent-permissive.md).
- **0039's other residuals.** The annotation root's naive brace dispatch
  (residual (ii)), the annotation position's unattachable collision sink
  (residual (iii)) and the two name-keyed first-wins merges (residual (iv))
  are untouched here.

## Provenance

- Origin: bug
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)'s
  fix (0.49.0, `52e257bc`). Its review round 1 raised the duplicate-field bytes
  as that round's defect D6 and adjudicated it a residual, not a defect of the
  fix, because the bytes are the frozen `params:` position's own output
  (`.pi/tmp/fixes/0039-report.md`, §"Review rounds" item 1 and §Residuals item
  1). Carried in the doc as §Fix (0.49.0) *Residuals* item (i) (`:259–264`),
  left unfiled for the parent. This report files it, re-derives it at
  `52e257bc`, and adds the measurements that residual did not carry: the
  annotation-root throw's exact message and the two compile sites that raise
  it, the schema-body sibling's `theta/parse/wire-name-collision` refusal, the
  positions that lower nothing, and the wire-rename contrast.
- Spec: `docs/spec_topics/grammar.md` (`:101` the `ObjectType` production,
  `:109` §Inline object types); `docs/spec_topics/schemas.md` (`:44` the collision rule, `:45`
  the redundant-rename rule that fixes the unrenamed default);
  `docs/spec_topics/type-system.md:15` (position invariance);
  `docs/spec_topics/schema-subset.md` (`:73` inline hoisting, `:76` the `$ref`
  emission, `:107` the slug);
  `docs/spec_topics/diagnostics/code-registry-parse.md` (`:85`
  `theta/parse/wire-name-collision`, `:91`
  `theta/parse/duplicate-enum-variant-name`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md` (DIAG-2 `:72`, DIAG-3
  `:73`, DIAG-4 `:74`);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:55` (identifier-shaped
  placeholders); `docs/spec_topics/governance/source-language-stability.md`
  (GOV-15 `:5`, loads-cleanly `:7`, diagnostic-registry carve-out `:23`);
  `docs/spec_topics/query/query-failure-and-repair.md:78` (QRY-22). User-facing
  mirrors: `docs/reference/grammar.md` (`:155`, `:168–170`),
  `docs/reference/diagnostics.md:134`, `docs/reference/schema-subset.md:52`.
- Implementation evidence at `52e257bc`: `src/parser/params.ts` (`:117`,
  `:147–175`, `:392–402`, `:502`, `:519–520`, `:606`, `:614`, `:654`, `:681–686`,
  `:709`);
  `src/parser/body-type-lowering.ts` (`:109`, `:119`, `:126`, `:151`, `:158`,
  `:168`, `:335`, `:395`, `:406`);
  `src/parser/schema-declarations.ts` (`:38–41`, `:65`, `:103–138`);
  `src/parser/type-grammar.ts` (`:275–307`, `:374`);
  `src/parser/theta-document.ts` (`:2394`, `:5494`, `:5739`, `:5814`, `:5820`,
  `:5880`, `:5899`, `:6162`);
  `src/runtime/query-schema-lowering.ts:140–145`;
  `src/runtime/respond-tool-wire.ts:91–94`;
  `src/runtime/typed-query-validation.ts:323`;
  `src/runtime/query-tool-loop.ts:693`;
  `src/seams/schema-validator.ts` (`:112`, `:116`, `:149`);
  `src/extension/production-theta-producer.ts` (`:2314`, `:2579`, `:2692`,
  `:3316`); `src/extension/theta-composition-producer.ts` (`:443`,
  `:481–493`).
- Test evidence at `52e257bc`: `tests/committed-fixture-parse-gate.test.ts:122`
  (the zero-diagnostic gate over committed fixtures);
  `tests/live/acceptance/fixtures/acc-typed-inline.theta:14` (the only
  committed inline object type, field names distinct);
  `tests/params-inline-object-lowering.test.ts` and
  `tests/schema-alias-union-decl.test.ts` (0035's and 0033's locks, neither
  carrying a repeated inline field name);
  `tests/schema-declarations.test.ts:74–140` (the declaration-position controls
  for the collision and redundancy codes, over `checkObjectSchema` directly).
- Reproduction: scratch vitest at HEAD over the position fixtures of groups
  (1)–(4), the shape probes of group (6), the wire-rename probes of group (7),
  the declaration controls E1 / G3 / G5, the `buildBodyTypeSchemas` and
  `params:` `loweredSchema` read-backs, `respondToolWireSchema`, and real
  `AjvSchemaValidator` compiles over every lowered document — run on the
  outputs quoted above, then deleted per scratch policy.

## Coordination note — bug 0093 landed (0.155.0)

This report's §Fix residual 4, *The compound position emits per check-site*, is
closed by [0093](./0093-let-annotation-query-position-double-emission.md) §Fix
(0.155.0) — the repair it anticipated when it pinned h1 "so that fix flips it
knowingly". `parseLet` now marks a query whose schema arrived by its own direct
propagation, and the query arm withholds its type-grammar re-walk for a marked
query, so the statement-ranged verdict from the `let` arm survives alone.

Two cells flipped, both under 0093's authority and neither changing a subject:
group (h) `RED h1`'s compound row goes from two lines to one, with rows 2 and 3
byte-identical, and group (i) `CONTROL i1`'s `"compound let + query"` row goes
from two lines to one, with its fifteen sibling rows and the `.thetalib` row
unchanged. The rule this report shipped is unedited; the doubling was the
position's, as h1's contrast against rows 2–3 already established.

The link to 0093 in §Fix residual 4 (`:338`) spells a filename that report does
not carry; the correct path is the one used above. Disclosed, not chased
(0134's class). Status unchanged (**fixed**).

## Note — cell k2 of this report's witness was re-pinned by bug 0176 (0.161.0)

[0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md) added
`theta/parse/quoted-inline-field-name` for a non-repeating quoted inline key.
Cell k2 of `tests/inline-object-duplicate-field-name.test.ts`
(`{"a": string, a: integer, a: boolean}`) now expects that line ahead of its
unchanged `duplicate-inline-field-name` line for the bare `a`; the cell's
subject — a malformed entry contributes no key and curtails no comparison — and
its lowering read-back are preserved verbatim. Cell d5 is untouched: a REPEATING
quoted key keeps this report's row alone and gains no second line. Status
unchanged (**fixed**).
