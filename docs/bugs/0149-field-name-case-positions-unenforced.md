# Bug 0149 — `docs/spec_topics/lexical.md:16` requires a lowercase-first schema field name and `code-registry-parse.md:19` registers `theta/parse/binding-case-mismatch` for the "field-name position", but bug 0139's fix closed the `fn` parameter only, so `schema S { Xs: string }`, a `params:` field `Topic: string` and an inline object type `{ Ys: string }` each load with zero diagnostics and register, while `let P = 1`, `fn h(P: string)` and `fn H()` on the same HEAD each draw the code

- **Status:** fixed (0.82.0). Both route questions are settled in
  §Fix (0.82.0): the `params:` frontmatter face is closed through its own
  emitter in `extractParsedParams`, and the inline object-type face is read as
  inside the *Trigger* but left unimplemented for want of a token range. The
  `schema X { … }` face is closed at `parseSchemaObjectBody` as §Fix pinned.
  Ordering: nothing blocked this report. It collides at the code site with open
  [0133](./0133-field-list-discard-recovery-unsettled.md), whose Status bullet
  claims "No open report edits `parseSchemaObjectBody` … or
  `skipBraceRemainder`" — that claim is false once this is filed, the two
  fixes edit the same loop, and whichever lands second rebases. It also
  supersedes the "unfiled" clause of
  [0046](./0046-by-clause-undecided-inputs-load-silently.md)'s §Non-goals
  bullet (see §Related).
- **Sev/Diff estimate:** S1/D2 — S1 on the letter bug 0139 was scored on: a
  declared constraint is unenforced on the ordinary load path, so a spelling
  the spec refuses is accepted with no diagnostic and the theta registers
  ("inputs accepted that the spec refuses … with no diagnostic, declared
  constraints not enforced"). The harm profile differs from 0139's in two
  measured directions and is stated as such in §Why it matters: wider, because
  a `params:` field name is a body-scope value binding (row b1) that the
  identical `let` spelling is refused for (row b5), and because an uppercase
  theta-side field name reaches the lowered JSON Schema as a PascalCase
  property key (row L3) that `schemas.md:39` names the `as "WireName"` rename
  as "the only mechanism" for; narrower, because no value is corrupted (rows
  r1/r2 are identical), the construction site already checks a field name
  against its declaration (row o3), and the committed corpus contains zero
  instances (§Reproduction (h)). D2 because the primary emission is one
  predicate over a token already captured at the parser leaf, no registry row
  or spec sentence is edited, and the one committed test fixture in the shape
  is code-filtered and does not red (§Affected). The D3 risk is named in §Fix:
  scoping in the other two faces means sourcing a range neither currently
  computes.
- **Kind:** defect — implementation, against a written sentence and its
  registered *Trigger*. Two elements.
  1. **The rule is written and the position is named twice.**
     `docs/spec_topics/lexical.md:16` requires lowercase-first for "`let` and
     `let mut` bindings, function parameters, function names, and **schema
     field names**", and `:18` states the consequence without qualification:
     "Violating either rule is a parse error: `theta/parse/schema-case-mismatch`
     … or `theta/parse/binding-case-mismatch`". The same sentence at `:16`
     restates the scope for this position in particular: "The lowercase-first
     rule applies to the **theta-side** field identifier; the field's *wire*
     name … may be any string via the `as "WireName"` rename clause".
     `docs/spec_topics/schemas.md:34` repeats it — "the lowercase-first rule
     still applies to it". The registry row's *Trigger*
     (`docs/spec_topics/diagnostics/code-registry-parse.md:19`) names the
     position: "Identifier in a binding / parameter / fn-name / **field-name**
     position does not start with a lowercase letter or `_`." Measured,
     `schema S { Xs: string }` reports `[]` and registers.
  2. **Three of the sentence's four positions are enforced; the field name is
     the fourth.** `contextualDiagnostics` (`src/lexer/lexer.ts:810–851`) tests
     a first letter in `checkName` (`:814–851`) and its dispatch calls that
     helper at exactly three token adjacencies (`:876–886`): the identifier
     after `let` (skipping `mut`), after `fn`, and after `schema` / `enum`.
     Bug 0139's fix added the `fn` parameter at the parser leaf. A field name
     sits inside a braced list, is adjacent to `{` or `,`, and is reached by no
     dispatch arm and by no parser-leaf test: `parseSchemaObjectBody`
     (`src/parser/theta-document.ts:2560–2642`) captures the field-name token
     at `:2577`, accepts it on `kind === "ident" || kind === "keyword"`
     (`:2578`), consumes it at `:2585` and pushes `nameTok.text` at `:2610`
     with no case test — the same shape `parseFn` had before 0139.
- **Related:**
  - [0139](./0139-fn-parameter-name-case-rule-unenforced.md) — **fixed
    (0.79.0)**, the parent. This report is its residual 2. 0139 closed the
    `fn` parameter position at the parser leaf and recorded the scoping
    decision with its rationale: "**(b) Positions closed — the `fn` parameter
    ONLY.** The schema-field-name and `params:` frontmatter-field positions
    stay out; measured after the fix, §Reproduction rows e1, e2, e3, e5 and e6
    are all still `[]` (e4 fires, but only on its own `fn h(P: S)` parameter,
    which is correct)". Every one of those six rows is re-measured at this HEAD
    below and reproduces exactly; 0139's own witness names the position "OUT OF
    SCOPE, deliberately unrowed" (`tests/fn-param-name-case.test.ts:72–76`).
    0139's shipped emission is the template this report's §Fix follows.
  - [0148](./0148-reserved-keyword-fn-parameter-position-silent.md) — **open**,
    0139's residual 1 and this report's sibling filing. It claims
    `theta/parse/reserved-keyword-as-identifier` at the `fn` **parameter**
    name (`fn h(let: string)` → `[]`). **The two are disjoint**: different
    registered code, different spec sentence (`lexical.md:20` against `:16`),
    and a different site (`parseFn`'s parameter loop against
    `parseSchemaObjectBody`'s field loop). Rows f6 and p4 measure the keyword
    at the *field* position, which 0148's §Non-goals leaves out in terms and
    which this report also does not claim (§Non-goals). 0148's §Non-goals
    describes the casing of the schema field name, the `params:` field name
    and the `enum` variant name as "unclaimed by any report at this HEAD";
    this filing claims the first two.
  - [0046](./0046-by-clause-undecided-inputs-load-silently.md) — **open**, the
    prior record of the schema-field half. Its §Non-goals bullet "Field-name
    casing enforcement" (`:533–541`) states it in terms:
    "`theta/parse/binding-case-mismatch`'s row (`code-registry-parse.md:19`)
    names the 'field-name position' … but `schema Cat { Kind: \"cat\" }` loads
    clean at HEAD (the same code does fire for `let A = 1` and `fn F()`). That
    gap is pre-existing, unfiled, and orthogonal." **This filing supersedes the
    "unfiled" clause; read that bullet as historical.** The rest of the bullet
    is unchanged and still accurate: the gap is pre-existing, it is orthogonal
    to 0046's `by`-clause subject, and 0046's cell i2 fixture ensures the
    reachability of a PascalCase theta-side field is not load-bearing for its
    class-1 membership claim. 0046 needs no edit from this filing; the
    supersession is recorded here so its wording is not read as a live
    statement that no report claims the position.
  - [0133](./0133-field-list-discard-recovery-unsettled.md) — **open**, and the
    only other report that edits this loop. Its subject is the three recovery
    arms of `parseSchemaObjectBody` that discard an already-captured field list
    and mis-attribute `theta/parse/empty-schema-body`. **The two are behaviourally
    disjoint and share a code site.** Disjoint: 0133's twelve reaching token
    classes at the field-name position are a number literal, a string literal,
    and a stray `:`, `,`, `|`, `(`, `[`, `@`, `=`, `?`, `-` or `...`, none of
    them an `ident`, and every 0133 fixture spells its captured fields
    lowercase (`a: string,` prefix), so an emission guarded on
    `nameTok.kind === "ident"` and an uppercase first letter fires on no
    measured 0133 row. Shared: both fixes edit the loop between the field-name
    capture and the field push, so whichever lands second rebases, and 0133's
    Status-bullet claim that no open report edits `parseSchemaObjectBody`
    becomes false with this filing. 0133's citations of that function
    (`theta-document.ts:2534–2616`, `skipBraceRemainder` `:2619`) are stale at
    this HEAD — 0134's adjudicated class, not corrected here; the function is
    `:2560–2642` and `skipBraceRemainder` is `:2645–2655`.
  - [0051](./0051-lowercase-named-type-reference-positions-silent.md) —
    **open**, the same family at a different position and under the other rule.
    There a *lowercase* `NamedType` at a **reference** position draws nothing,
    and the open question is whether `schema-case-mismatch`'s *Trigger* — which
    names declaration positions only — should widen. **The two are disjoint.**
    0051's position is governed by `lexical.md:15` and its *Trigger* does not
    name it, so its deliverable is an adjudication; this report's position is
    governed by `lexical.md:16` and its *Trigger* **does** name it, so no
    registry edit is in question and the implementation is what moves. Unlike
    0139, a fix here does not share `checkName` with 0051 at all: the emission
    lands in the parser, and `src/lexer/lexer.ts` is untouched.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    citation-drift class. A fix here inserts into `src/parser/theta-document.ts`
    around `:2578`–`:2610` and shifts every citation below it, the same
    disclosed-not-chased disposition 0139's fix took for its own +19-line
    insertion.
  - [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) —
    **open**. `tests/committed-fixture-parse-gate.test.ts` filters `.theta`
    only, so the GOV-15 sweep in §Fix must walk the two committed `.thetalib`
    files explicitly. One of them, `docs/examples/personas.thetalib:2–4`,
    declares three schema fields.
  - [0136](./0136-member-access-types-as-field-name-not-field-type.md) —
    **open**. Its §Reproduction (d) rows d1 and d3 rest on `schema xs = …`
    drawing `schema-case-mismatch` at the **schema-name** position, which is
    enforced, and their field names are lowercase (`xs`). Enforcing the
    field-name position leaves both rows unmoved. 0139's §Related said the
    field position was "claimed by neither report"; this report claims it.
  - [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md) —
    **open**. It cites `lexical.md:16` for the opposite direction (the rule is
    what puts `index` inside the author's namespace) and its rows b2/b3 declare
    `schema P { index: array<string> }`. `index` is lowercase-first, so
    enforcement leaves those rows clean. A fix here touches `src/lexer/lexer.ts`
    not at all, so 0135's `lexer.ts:842–849` citation takes no drift.
  - [0119](./0119-proto-named-field-silently-dropped.md) — **open**. Its
    §Kind reads `binding-case-mismatch` (`code-registry-parse.md:19`) as "the
    field-name position's only case rule" and argues its `__proto__` field is
    "admitted by rule, not by oversight". That reading of the *rule* is
    correct and this report does not disturb it: `__proto__` is `_`-leading and
    conformant under `lexical.md:16`, so enforcing the position admits it
    unchanged. What this report corrects is the implicit premise that the rule
    is enforced there at all.
  - [0121](./0121-integer-like-wire-rename-escapes-order-guarantee.md) —
    **open**, and the other half of the same sentence. `lexical.md:16`'s
    field clause has two halves: the theta-side identifier, which the rule
    constrains and which this report measures unenforced, and the wire name,
    which the rule leaves free ("may be any string via the `as \"WireName\"`
    rename clause") and which is 0121's subject (`:191–194`). A fix at the
    theta-side half does not reach the wire half; row f5
    (`schema S { xs as "Xs": string }`) is the conformant spelling a fix must
    keep clean.
- **Affected** (every citation verified at HEAD `d11aef29`, 0.79.0):
  - **The spec rule** — `docs/spec_topics/lexical.md:16`, whose scope list has
    four entries and whose field clause carries the theta-side / wire-name
    split. `:13` — the identifier grammar `[A-Za-z_][A-Za-z0-9_]*` and the
    sentence that makes the rule enforced rather than stylistic: "The **first
    letter's case is enforced** by the parser — it is what makes case-based
    pattern disambiguation in `match` work without additional grammar." `:15` —
    the PascalCase bullet, which governs `schema` / `enum` / **variant** names
    and is not this rule. `:18` — the parse-error sentence naming both codes,
    and the `match` disambiguation that reads the same first letter: "a
    lowercase identifier introduces a fresh binding, an uppercase identifier
    refers to an existing schema, enum, or constructor in scope". `:20` — the
    reserved-keyword rule. `:3` — every rule on the page applies to `.theta`
    and `.thetalib` alike.
  - **The spec's own statement of this position** —
    `docs/spec_topics/schemas.md:17` ("Field names are identifiers"), `:21`
    (§Wire-name renaming), `:34` ("Theta-side, the field is accessed,
    constructed, and pattern-matched as the theta identifier … and the
    lowercase-first rule still applies to it"), `:39` ("This is the only
    mechanism for expressing schemas whose property names are not
    theta-identifier-compatible — PascalCase (`\"FirstName\"`) …"), `:45` (the
    `theta/parse/redundant-wire-name` warning).
  - **The registered row** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:19`.
    `theta/parse/binding-case-mismatch`, severity `E`, namespace `parse`.
    *Trigger*: "Identifier in a binding / parameter / fn-name / field-name
    position does not start with a lowercase letter or `_`." *Message*:
    `binding name must start with a lowercase letter or _`. Mirror without a
    *Trigger* column: `docs/reference/diagnostics.md:65`. The sibling row
    `:20` (`theta/parse/schema-case-mismatch`, *Trigger* "schema / enum /
    variant / type-alias position", mirror `docs/reference/diagnostics.md:66`)
    is what governs an `enum` variant, and is not this code.
  - **The enforcer, and why it stops at three positions** —
    `src/lexer/lexer.ts:810–851` (`contextualDiagnostics`), called once at
    `:125`. `checkName` (`:814–851`) reads a token by index, refuses a keyword
    (`:819–828`), returns for a non-`ident` (`:829–831`), then tests
    `first >= "A" && first <= "Z"` (`:832–833`) and emits
    `binding-case-mismatch` at `:834–841` or `schema-case-mismatch` at
    `:842–850`. The dispatch is `:876–886`: `let` (with the `mut` skip) at
    `:876–882`, `fn` NAME at `:883–884`, `schema` / `enum` NAME at `:885–886`.
    Three keyword adjacencies; no braced-list interior is one. The scope note
    that predicts the shortfall is `:806–808`: "full identifier-position
    coverage … is a parser-leaf obligation; the lexer core enforces the
    positions its closed Tests obligations name."
  - **Face 1 — the `schema X { … }` field name**, `src/parser/theta-document.ts`.
    `parseSchema` (`:2353`) captures the schema name at `:2355` and dispatches
    to `finishObjectSchema` (`:2401–2409`), which calls `parseSchemaObjectBody`
    (`:2560–2642`). The field loop: `const nameTok = this.peek()` (`:2577`),
    accepted when `nameTok.kind === "ident" || nameTok.kind === "keyword"`
    (`:2578`), consumed at `:2585`, an optional `as "WireName"` read at
    `:2586–2602`, the `:` required at `:2603–2606`, and
    `fields.push({ name: nameTok.text, … })` at `:2609–2613`. **The token and
    its range are in hand across the whole body of the loop** — a smaller
    change than 0139's, which had to convert a `.text` capture into a token
    capture first.
  - **Face 2 — the `params:` frontmatter field name**, `src/parser/frontmatter.ts`.
    `extractParsedParams` (`:687–762`) walks the YAML mapping's items; the name
    is `const name = String(item.key.value)` at `:710`, and the per-field
    `range` at `:715–717` is `rangeOf((item.value ?? item.key) …)` — **the
    VALUE node's range, not the key's**, measured at row q1. A diagnostic
    ranged on the field name at this face needs a key range the function does
    not currently compute. This face already emits `theta/parse/*` codes:
    `src/parser/params.ts:195–203` pushes
    `theta/parse/reserved-keyword-as-identifier` for a `params:` right-hand
    side, and `:242–248` pushes `theta/parse/non-trailing-default`.
  - **Face 3 — the inline object type's field name**,
    `src/parser/type-grammar.ts:342–380` (`parseObject`). The loop reads the
    field-name token at `:352`, requires `kind === "ident"` at `:353`, and
    skips it at `:354`. `grammar.md:203` makes this the same grammatical
    position — "`ObjectType` fields reuse the object-schema `Field` form" —
    and `ObjectType ::= "{" Field ("," Field)* ","? "}"` is `grammar.md:190`.
    **This parser's tokens carry no range at all**: `TypeToken`
    (`:160–163`) is `{ kind, text }`, minted at `:214`, and every diagnostic on
    this path is ranged at the caller's `site.range` (`:431`, `:446`, `:455`,
    `:562`). A field-name-precise range here requires adding ranges to
    `TypeToken`.
  - **The whole-declaration field checker, and why it is not the site** —
    `src/parser/schema-declarations.ts:87–157` (`checkObjectSchema`), reached
    from `src/parser/theta-document.ts:6225–6238`. It already iterates every
    field and emits per-field diagnostics —
    `theta/parse/redundant-wire-name` (`:102–113`) and
    `theta/parse/wire-name-collision` (`:120–154`) — but **every one is ranged
    on `site.range`, the whole declaration**, because `SchemaFieldSource`
    (`src/parser/theta-document.ts:538–548`) carries `name`, `typeSource` and
    an optional `wireName` and no range. The tree states the consequence in its
    own words at `src/parser/theta-document.ts:6252–6257`: "`SchemaFieldSource`
    carries no range of its own, so the diagnostic is ranged at the
    DECLARATION". Measured at row w1: the `redundant-wire-name` warning on
    `schema S { Xs as "Xs": string }` ranges `@4:1–4:32`, the whole
    declaration, while the field name occupies `@4:12–4:14`.
  - **The registration consequence** —
    `src/extension/production-composition.ts:2047–2054` (`hasLoadParseError`)
    drops a theta carrying any `error`-severity `theta/load/*` or
    `theta/parse/*` diagnostic. Every silent row of §Reproduction carries none,
    so each registers. Adding the emission makes them not register: the code is
    `E`.
  - **The runtime the uppercase field reaches** —
    `src/runtime/runtime-panics.ts:331–340` (`evaluateMemberAccess`), which
    keys the object by the theta-side field string with no case involvement.
    Measured at rows r1/r2: `s.Xs` and `s.xs` both evaluate to `"v"` with
    outcome `success`. Nothing is mistyped; the spelling is the whole defect.
  - **The wire face** — an uppercase theta-side field name becomes the wire
    property name. Measured at row L3: `params: Topic: string` lowers to
    `{"type":"object","properties":{"Topic":{"type":"string"}},"required":["Topic"],…}`.
    Row L1 shows the same for an inline object type's inner field. Row w3
    shows what the sanctioned route produces instead: `schema T { xs as "Xs" }`
    keeps `xs` theta-side (runtime value `{"xs":"v"}`) and moves `Xs` to the
    wire only.
  - **Existing coverage: none at this position, in either direction.**
    `tests/lexer-core.test.ts:186–195` asserts `let Foo = 1` fires
    `binding-case-mismatch` with the registry message; `:177–184` is the
    `schema`-name twin on `schema animal = Foo | Bar`.
    `tests/fn-param-name-case.test.ts` (bug 0139's 19-row witness) pins the
    `fn` parameter and states at `:72–76` that this position is "OUT OF SCOPE,
    deliberately unrowed … rows for them would red permanently against a fix
    scoped to the parameter". **Exactly one committed fixture declares an
    uppercase-first schema field** — `tests/fn-arg-type-mismatch-wired.test.ts:710`
    (`U6`, `schema P { a: number }\nschema W { P: number }…`), used at `:1371`.
    That cell asserts through `expectNoFnArgMismatch` (`:657–662`), which reads
    `locatedHits(doc, CODE)` (`:388–397`) — **filtered to the fn-arg code
    alone**, so a new `binding-case-mismatch` does not red it. No committed
    fixture declares an uppercase-first `params:` field. The measured
    committed-test blast radius of the schema-field face is therefore zero
    cells, which is materially smaller than 0139's three.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:57` — `params` "are
    validated with AJV at invocation time and **exposed as typed variables in
    the theta body**", the sentence that makes a `params:` field name a
    body-scope binding as well as a field name; `:58` — the field's type side,
    which is specified in full and says nothing about the field name's
    spelling. No frontmatter page states a case rule for a `params:` key;
    `lexical.md:16` and the registry *Trigger* are the only sources that reach
    it.
  - `docs/reference/grammar.md:311–312` (`SchemaDecl ::= "schema" Ident
    SchemaShape`, `SchemaShape ::= "{" Field ("," Field)* ","? "}"`), `:190`
    and `:203` (`ObjectType` and its reuse of `Field`);
    `docs/spec_topics/grammar.md:171–172` (the same two productions).
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15's
    three observables; `:9` — the loads-cleanly predicate ("emits no diagnostic
    of effective severity `error`"), which every silent §Reproduction row
    satisfies today; `:25` — the diagnostic-registry carve-out, and the
    sentence that dispositions this fix: "a DIAG-2/3/4-class edit is
    carve-out-covered — and admissible within a theta 1.x minor release —
    exactly on the inputs for which it …".
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the
    registry is closed; adding, removing, or changing a code's namespace,
    severity or trigger is a spec change). `:74` — DIAG-4 (the *Message*
    column is normative). Neither is edited by the fix this report describes:
    the code exists, its *Trigger* already names the position, and the
    *Message* is already rendered byte-exact at the four enforced positions.
- **Observed at:** `0.79.0` (HEAD `d11aef29`, bug 0139's fix commit). Offline,
  deterministic; no live model, no provider. Every parse row through `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) driving the shipped `parseThetaDocument`,
  frontmatter `---\nmode: prompt\n---` except where noted, a trailing `1`
  supplying the final value; the `.thetalib` row passes `path = "lib.thetalib"`
  with no frontmatter. The `r*` rows drive `executeBody`
  (`src/runtime/statement-executor.ts`) through
  `createProductionProducerDeps(…).bindPromptConversation`, the same offline
  production path `tests/ctor-field-type-check.test.ts:794–812` uses. The `L*`
  rows read `doc.frontmatter.params.loweredSchema`. The corpus sweep parses
  every tracked `.theta` / `.thetalib` through the same entry point and reads
  the parsed field names off `doc.body`. One scratch vitest file, run on the
  outputs quoted below, then deleted. `src/`, `tests/`, `docs/bugs/README.md`
  and every other bug document are unmodified by this filing.

## Summary

`lexical.md:16` puts schema field names in the lowercase-first list, `:18`
makes a violation a parse error, and `code-registry-parse.md:19`'s *Trigger*
names the field-name position explicitly. Nothing enforces it.

Bug 0139 closed the third of the sentence's four positions. Its fix added the
case test to `parseFn`'s parameter loop and scoped itself there deliberately,
recording the field position as residual 2. At this HEAD the sentence's list
reads: `let` / `let mut` enforced (lexer dispatch), `fn` name enforced (lexer
dispatch), `fn` parameter enforced (parser leaf, 0.79.0), schema field name
**silent**.

The field name is silent for the reason the lexer's shape predicts. The lexer's
rule implementation works by token adjacency: for each keyword token it inspects
the identifier that follows (`lexer.ts:876–886`). A field name follows `{` or
`,`, so no adjacency reaches it. The parser leaf that could carry the check does
not: `parseSchemaObjectBody` (`theta-document.ts:2560–2642`) takes the field
name token at `:2577`, consumes it at `:2585` and pushes its text at `:2610`
with no case test — the same shape `parseFn` had before 0139.

Measured: `schema S { Xs: string }` reports `[]` and registers. So do a
two-uppercase-field body, a second-field-only violation, an `as "WireName"`
rename on an uppercase field, a `by`-clause union of inline arms, and the
`.thetalib` route. The controls on the same HEAD all fire: `let P = 1`,
`let mut P = 1`, `fn H(): number { 1 }` and — since 0139 — `fn h(P: string)`
each draw `theta/parse/binding-case-mismatch`, and `schema p = string` draws the
`schema-case-mismatch` twin. The discriminator is where the identifier sits, not
which rule governs it.

**The position has three faces and all three are silent.** Face 1 is the
`schema X { … }` body (`parseSchemaObjectBody`). Face 2 is the `params:`
frontmatter key (`frontmatter.ts:687–762`), which `frontmatter-fields-a.md:57`
also makes a body-scope binding: `params: Topic: string` introduces `Topic`
into the body namespace with zero diagnostics (row b1), while `let Topic = 1`
in the same file is refused (row b5). Face 3 is the inline object type
(`type-grammar.ts:342–380`), reachable in any `Type` position including a
`params:` right-hand side.

Nothing downstream compensates and nothing downstream is corrupted. The field
name is a first-class field name in every check that reads one — an omission
draws `missing-object-field`, an unknown name draws `extra-object-field`, a bad
value draws `object-field-type-mismatch` (rows f12, f13, o3) — and
`evaluateMemberAccess` (`runtime-panics.ts:331–340`) keys by the string with no
case involvement, so `s.Xs` and `s.xs` return the same value (rows r1, r2). The
theta registers — `hasLoadParseError` (`production-composition.ts:2047–2054`)
has nothing to act on — and runs. What the uppercase spelling does reach is the
wire: `params: Topic: string` lowers to a JSON Schema property literally named
`Topic` (row L3), which `schemas.md:39` names the `as "WireName"` rename as
"the only mechanism" for.

The two positions the list does **not** contain — a `for` / `par for` variable
and a `match` pattern binder — are correctly silent (rows o4, o5), and
`type-layer-checks.ts:381–386` already relies on their being outside the rule.
An `enum` variant name is governed by the other bullet (`lexical.md:15`) and
the other code, and is separately silent (row g2); it is not this report's
subject.

## Reproduction

Offline, deterministic, at `d11aef29`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`,
frontmatter `---\nmode: prompt\n---` except where noted, so body declarations
sit on source line 4. Each cell is the whole diagnostic list in emission order,
unfiltered; `registers` applies `hasLoadParseError`'s predicate.

### (a) The defect at the schema field name, and the enforced-position controls

| # | source | diagnostics | registers |
|---|---|---|---|
| e1 | `schema S { Xs: string }` | `[]` | yes |
| e2 | **control** `schema S { xs: string }` | `[]` | yes |
| e3 | `schema S { Xs: array<string> }` + `fn h(s: S): integer { 1 }` | `[]` | yes |
| e4 | `schema S { Xs: string }` + `fn h(P: S): string { P.Xs }` | `binding-case-mismatch` @5:6–5:7 | no |
| f1 | `schema S { Xs: string, Ys: integer }` | `[]` | yes |
| f2 | `schema S { a: string, Ys: integer }` | `[]` | yes |
| f3 | **control** `schema S { _x: string }` | `[]` | yes |
| f4 | `schema S { Xs as "wire": string }` | `[]` | yes |
| f5 | **control** `schema S { xs as "Xs": string }` | `[]` | yes |
| f6 | `schema S { let: string }` | `[]` | yes |
| f7 | `schema S by Kind = { Kind: "a" } \| { Kind: "b" }` | `[]` | yes |
| f9 | `.thetalib` route: `schema S { Xs: string }`, `path = "lib.thetalib"` | `[]` | yes |
| k1 | **control** `schema p = string` | `schema-case-mismatch` @4:8–4:9: `schema name must start with an uppercase letter` | no |
| k2 | **control** `let P = 1` | `binding-case-mismatch` @4:5–4:6: `binding name must start with a lowercase letter or _` | no |
| k3 | **control** `fn h(P: string): number { 1 }` | `binding-case-mismatch` @4:6–4:7, same message | no |
| k4 | **control** `fn H(): number { 1 }` | `binding-case-mismatch` @4:4–4:5, same message | no |
| k5 | **control** `let mut P = 1` | `binding-case-mismatch` @4:9–4:10, same message | no |

e1 is the report's witness: grammar-conformant
(`SchemaShape ::= "{" Field ("," Field)* ","? "}"`), one rule violated, nothing
reported. e4 is 0139's fix measured from this side — the diagnostic that does
fire belongs to the `fn h(P: S)` **parameter**, not to the field `Xs` its body
reads. f2 shows the silence is per-field, not an artifact of the first
position. f5 is the conformant route to a PascalCase wire name and must stay
clean. f6 records that the loop admits a reserved keyword as a field name
(`:2578` accepts `kind === "keyword"`), so the reserved-keyword arm is absent
here for the same reason it is absent at the parameter (0139's residual 1); it
is measured, not claimed (§Non-goals). k2–k5 are the lowercase-first positions
the implementation does enforce — `let`, `let mut`, the `fn` parameter (0139's
fix) and the `fn` name — and k1 is the `schema`-name twin under the other code,
all on the same HEAD and the same harness.

The token range a fix would carry, read off `lexSrc`: `Xs` @4:12–4:14 in e1,
and the second field `Ys` @4:23–4:25 in f2.

### (b) Face 2 — the `params:` frontmatter field name, which is also a binding

| # | source | diagnostics | registers |
|---|---|---|---|
| e5 | frontmatter `params:` field `Topic: string` | `[]` | yes |
| e6 | **control** frontmatter `params:` field `topic: string` | `[]` | yes |
| p1 | `params:` field `Topic: string = "x"` | `[]` | yes |
| p3 | **control** `params:` field `_topic: string` | `[]` | yes |
| p4 | `params:` field `let: string` | `[]` | yes |
| p6 | `params: Topic: string` + body `` @`t ${Topic}` `` | `[]` | yes |
| b1 | `params: Topic: string` + body `Topic` | `[]` | yes |
| b3 | `params: Topic: string` + `let r = match 3 { Topic => 1 }` + `r` | `[]` | yes |
| b4 | `params: Topic: string` + `schema Topic { a: string }` + `Topic` | `[]` | yes |
| b5 | **control** `let Topic = 1` + `Topic` | `binding-case-mismatch` @4:5–4:10 | no |
| q1 | `params:` field `Topic:` with a block-sequence value | `theta/load/params-type-not-expression` @5:5–5:8 | no |
| q2 | `params:` field `"my topic": string` | `[]` | yes |

**b1 against b5 is the sharpest pair in this report.** The same identifier,
introduced into the same body namespace, in the same file: refused when written
`let Topic = 1`, admitted when written as a `params:` key. b4 adds the
collision the rule exists to prevent — an uppercase-first value binding and a
`schema` of the same name coexisting with no diagnostic. q1 shows where a
per-field `params:` diagnostic currently points: `@5:5–5:8` is the VALUE node,
matching `frontmatter.ts:715–717`'s `rangeOf((item.value ?? item.key) …)`. q2
shows a `params:` key need not be a theta identifier at all today, which is the
guard question §Fix must answer for this face.

### (c) Face 3 — the inline object type's field name

| # | source | diagnostics | registers |
|---|---|---|---|
| i1 | `fn h(p: { Ys: string }): integer { 1 }` | `[]` | yes |
| i2 | **control** `fn h(p: { ys: string }): integer { 1 }` | `[]` | yes |
| i3 | `schema S { a: { Ys: string } }` | `[]` | yes |
| i4 | `fn h(): { Ys: string } { 1 }` | `[]` | yes |
| p2 | `params:` field `p: { Ys: string }` | `[]` | yes |

`grammar.md:203` makes these the same `Field` production as face 1. This face
is parsed by `type-grammar.ts:342–380`, not by `parseSchemaObjectBody`, so it
is a third route and not a consequence of the first.

### (d) The lowered wire schema — where an uppercase field name actually lands

| # | source | `params.loweredSchema` |
|---|---|---|
| L3 | `params:` field `Topic: string` | `{"type":"object","properties":{"Topic":{"type":"string"}},"required":["Topic"],"additionalProperties":false}` |
| L1 | `params:` field `p: { Xs: string }` | `$defs` entry `{"type":"object","properties":{"Xs":{"type":"string"}},"required":["Xs"],"additionalProperties":false}` |
| L2 | **control** `params:` field `p: { xs: string }` | the same with `xs` |

The uppercase theta-side name is the wire name. `schemas.md:39` states the
rename clause is "the only mechanism for expressing schemas whose property
names are not theta-identifier-compatible — PascalCase (`"FirstName"`) …";
these rows measure a second mechanism that reaches the same output without the
clause.

### (e) The position is live — every other check reads the field name

| # | source | diagnostics |
|---|---|---|
| f10 | `schema S { Xs: string }` + `let s = S { Xs: "v" }` + `s` | `[]` |
| f12 | `schema S { Xs: string }` + `let s = S { Ys: "v" }` + `s` | `extra-object-field` @5:9–5:22: `extra field 'Ys' on schema 'S'`; `missing-object-field` @5:9–5:22: `missing field 'Xs' on schema 'S'` |
| f13 | `schema S { Xs: string }` + `let s = S { Xs: 3 }` + `s` | `object-field-type-mismatch` @5:17–5:18: `field 'Xs' on schema 'S' type mismatch: expected string, got integer` |
| o3 | `schema S { xs: string }` + `let s = S { Xs: "v" }` + `s` | `extra-object-field`; `missing-object-field` |
| w1 | `schema S { Xs as "Xs": string }` | `theta/parse/redundant-wire-name` (W) @4:1–4:32 |
| w2 | **control** `schema S { xs as "xs": string }` | the same warning @4:1–4:32 |

f12/f13 show the uppercase field name participates in every declared-field
check; nothing treats it as malformed. o3 shows the construction site is
already governed by the declaration, so a case rule at the declaration
propagates without a second check at the constructor. w1/w2 show a per-field
diagnostic already exists at this position and is ranged on the whole
declaration rather than the field — the range fact §Fix turns on.

### (f) The runtime — what an uppercase field does when it runs

| # | source | outcome | value |
|---|---|---|---|
| r1 | `schema S { Xs: string }` + `let s = S { Xs: "v" }` + `s.Xs` | `success` | `"v"` |
| r2 | **control** the same with `xs` | `success` | `"v"` |
| r3 | `schema S { Xs: string }` + `let s = S { Xs: "v" }` + `s` | `success` | `{"Xs":"v"}` |
| w3 | `schema T { xs as "Xs": string }` + `let t = T { xs: "v" }` + `t` | `success` | `{"xs":"v"}` |

r1 against r2: identical. **This report claims no wrong value.**
`evaluateMemberAccess` (`runtime-panics.ts:331–340`) keys by the field string.
w3 against r3 is the contrast that matters: the sanctioned rename keeps the
theta-side name lowercase in the runtime value and moves the PascalCase to the
wire only; the unenforced spelling puts it in both.

### (g) The adjacent positions — measured so the claim stays bounded

| # | source | diagnostics |
|---|---|---|
| g1 | **control** `enum E { A, B }` | `[]` |
| g2 | `enum E { a, b }` | `[]` |
| g3 | **control** `enum e { A }` | `schema-case-mismatch` @4:6–4:7 |
| o4 | `let xs: array<string> = ["a"]` + `for Y in xs { Y }` | `[]` |
| o5 | `let v: integer = 3` + `let r = match v { Q => 1 }` + `r` | `[]` |
| o6 | `import { rate_strictness as Rs } from "./personas.thetalib"` | `[]` |

g2 is **not** an instance of this defect. An `enum` variant name is governed by
`lexical.md:15`'s PascalCase bullet and by `schema-case-mismatch`, whose
*Trigger* (`code-registry-parse.md:20`) names the "schema / enum / **variant** /
type-alias position" — the opposite direction under a different code.
`parseEnumVariants` (`theta-document.ts:2681–2763`) captures a variant name at
`:2724–2731` with no case test, so the variant position is separately
unenforced; g3 shows the enum NAME is enforced. **Do not fold g2 into this
report.** o4/o5 are the over-reach tripwires from 0139's witness (its rows
c1/c2) and stay clean: `lexical.md:16`'s list contains neither, and
`type-layer-checks.ts:381–386` depends on the exclusion. o6 is an import alias,
governed by `lexical.md:18`'s synthesised-name reservation and not by either
case bullet.

### (h) The committed corpus — the GOV-15 baseline

All 34 tracked `.theta` and `.thetalib` files parsed through `parseDoc`, with
every parsed `schema` field name and every `params:` field name tested for an
`[A-Z]` first character:

```
@@SWEEP files=34 uppercase-field hits=[]
```

Zero, on both faces. **Measured GOV-15 blast radius against the committed
corpus: zero.** That bounds the corpus half of the sweep; it does not discharge
GOV-15, because the silent rows above load cleanly today and would refuse after
a fix (§Fix (d)).

### (i) The committed test corpus

One committed fixture declares an uppercase-first schema field:
`tests/fn-arg-type-mismatch-wired.test.ts:710` (`U6`,
`schema P { a: number }\nschema W { P: number }\nfn f(n: number): number { 1 }\nlet v = W { P: 3 }\nlet r = f(v.P)\nr\n`),
used once at `:1371` through `expectNoFnArgMismatch` (`:657–662`), which reads
`locatedHits(doc, CODE)` (`:388–397`) — filtered to the fn-arg code alone. An
added `binding-case-mismatch` is not in that filter, so the cell does not move.
No committed fixture declares an uppercase-first `params:` field. Bug 0139's
"shared-witness hazard" note applies to the file but does not bite here,
because the three cells its own fix had to re-pin (u13b/c/d) assert whole-list
emptiness over fixtures whose uppercase identifier is a **parameter**, not a
field.

## Expected behaviour

**The sentence is written, unqualified, and names the position.**
`docs/spec_topics/lexical.md:16`:

> **lowercase-first** (a lowercase letter, or `_`) is required for: `let` and
> `let mut` bindings, function parameters, function names, and schema field
> names. … The lowercase-first rule applies to the **theta-side** field
> identifier; the field's *wire* name (what appears in JSON sent to and
> received from the model) may be any string via the `as "WireName"` rename
> clause described in [Schema Declarations](./schemas.md).

and `:18`:

> Violating either rule is a parse error: `theta/parse/schema-case-mismatch`
> ("schema name must start with an uppercase letter") or
> `theta/parse/binding-case-mismatch` ("binding name must start with a
> lowercase letter or `_`").

`schema S { Xs: string }` violates the first bullet at the last of its four
listed positions. `:18` says the disposition is a parse error and names the
code. The measured disposition is `[]`.

**The registry agrees, so no adjudication is owed.** This is what separates the
report from [0051](./0051-lowercase-named-type-reference-positions-silent.md).
`code-registry-parse.md:19`'s *Trigger* reads "Identifier in a binding /
parameter / fn-name / **field-name** position does not start with a lowercase
letter or `_`". Four positions, and "field-name" is one of them. Under DIAG-2
(`diagnostic-shape.md:72`) the registry is closed and a *Trigger* is a
spec-level statement of which inputs a code fires on; the implementation fires
on a strict subset of the registered set. That is the implementation moving to
match a normative rule, not a rule being widened — the posture 0139's fix took
at the sibling position in the same *Trigger*.

**The spec states this position twice more, in the page that owns it.**
`schemas.md:34`: "Theta-side, the field is accessed, constructed, and
pattern-matched as the theta identifier … and the lowercase-first rule still
applies to it." `schemas.md:39`: the rename clause "is the only mechanism for
expressing schemas whose property names are not theta-identifier-compatible —
PascalCase (`"FirstName"`) …". Row L3 measures a second mechanism.

**`lexical.md:13` makes the rule enforced by design, not by convention.** "The
**first letter's case is enforced** by the parser — it is what makes case-based
pattern disambiguation in `match` work without additional grammar." A
`params:` field name is exposed as a body variable
(`frontmatter-fields-a.md:57`), so the unenforced position puts an
uppercase-first value binding into the exact namespace `:18` reserves for "an
existing schema, enum, or constructor in scope" (rows b1, b3, b4).

**The four listed positions are one rule, not four.** `lexical.md:16` states a
single requirement over a list. Enforcing three of the four makes the rendered
behaviour depend on where an identifier is written — an implementation fact
with no counterpart in the spec.

**What a conformant implementation reports for `schema S { Xs: string }`:**
exactly one `theta/parse/binding-case-mismatch`, severity `E`, message
`binding name must start with a lowercase letter or _` byte-exact per DIAG-4,
its range covering the field name `Xs` (@4:12–4:14 in row e1's fixture), and no
other diagnostic. The theta does not register (`hasLoadParseError`,
`production-composition.ts:2047–2054`).

**What stays silent:** rows f3 and f5 — the `_` prefix the rule admits, and the
conformant `xs as "Xs"` rename whose wire half the rule leaves free; rows o4
and o5 — a `for` / `par for` variable and a `match` binder, which the rule's
list does not contain; row g2 — an `enum` variant, which the other bullet
governs; and rows f12, f13, o3, r1–r3, which must keep their current
dispositions with the new code appended only where a declaration is
ill-cased, since this fix adds a lexical diagnostic and touches no type
judgement and no runtime path.

## Actual behaviour / root cause

**One enforcer, three adjacencies, no braced-list interior.**
`contextualDiagnostics` (`src/lexer/lexer.ts:810–851`) is a single pass over the
token stream. Its worker is position-agnostic — `checkName(index, kind)` reads
`tokens[index]`, refuses a keyword, returns for a non-`ident`, and tests one
character:

```ts
const first = name.text[0] ?? "";
const isUpper = first >= "A" && first <= "Z";
if (kind === "binding" && isUpper) {
  diagnostics.push({
    severity: "error",
    code: "theta/parse/binding-case-mismatch",
    file,
    range: name.range,
    message: "binding name must start with a lowercase letter or _",
  });
```

(`:832–841`.) Everything positional lives in the caller, and the caller is a
keyword scan (`:876–886`): `let` (past the `mut` skip), `fn`, `schema` /
`enum`. Each names an identifier that is the immediate successor of a keyword
token. A field name's predecessor is `{` or `,` — punctuation — so the shape of
the scan, not an omitted branch, is what excludes it. The same shape excluded
the `fn` parameter until 0139 moved that position to the parser leaf.

**The shortfall is documented at the function.** `:806–808`: "Scope note: full
identifier-position coverage (every reserved word in every identifier slot) is
a parser-leaf obligation; the lexer core enforces the positions its closed
Tests obligations name." 0139 discharged that obligation for the parameter and
recorded the field position as residual 2. It remains undischarged.

**The parser leaf holds the token and drops the case question.**
`parseSchemaObjectBody` (`src/parser/theta-document.ts:2560–2642`):

```ts
const nameTok = this.peek();
const isFieldName = nameTok.kind === "ident" || nameTok.kind === "keyword";
if (!isFieldName) {
  this.skipBraceRemainder();
  return null;
}
this.advance();
```

(`:2577–2585`), then, past the optional `as "WireName"` and the required `:`:

```ts
fields.push({
  name: nameTok.text,
  typeSource,
  ...(wireName !== undefined ? { wireName } : {}),
});
```

(`:2609–2613`.) `nameTok` is the whole token — text, kind and `range` — and it
stays in scope across the loop body. **This is a smaller gap than 0139's**: at
the parameter position the token was discarded at the point of consumption
(`const pName = this.advance().text`) and the fix had to convert the capture
first; here the token is already held and only the test is missing.

**The whole-declaration checker cannot supply the range.** `checkObjectSchema`
(`src/parser/schema-declarations.ts:87–157`) already iterates every field and
emits per-field diagnostics, so a case test there would be a two-line addition
— but `SchemaFieldSource` (`theta-document.ts:538–548`) carries `name`,
`typeSource` and an optional `wireName` and no range, so every diagnostic that
function emits is ranged on `site.range`. The tree says so at
`theta-document.ts:6252–6257`: "`SchemaFieldSource` carries no range of its
own, so the diagnostic is ranged at the DECLARATION." Row w1 measures the
consequence live: `redundant-wire-name` on `schema S { Xs as "Xs": string }`
ranges `@4:1–4:32` while the field name occupies `@4:12–4:14`. This is the
same argument 0139 made from `FnParam` carrying no range, and it lands on the
same answer: the parse site is the only place with a field-name range.

**Face 2 is a different parser with a different range problem.**
`extractParsedParams` (`src/parser/frontmatter.ts:687–762`) walks a YAML
mapping, not a token stream: the name is `String(item.key.value)` (`:710`) and
the recorded `range` is `rangeOf((item.value ?? item.key) …)` (`:715–717`) —
the value node's, measured at row q1. The face does already emit `theta/parse/*`
codes (`params.ts:195–203`, `:242–248`), so the namespace is not the obstacle;
the key's own range is.

**Face 3 has no ranges at all.** `parseObject`
(`src/parser/type-grammar.ts:342–380`) reads a field name at `:352`, requires
`kind === "ident"` at `:353`, and skips it at `:354`. Its `TypeToken`
(`:160–163`) is `{ kind, text }` — minted at `:214` with no range — and every
diagnostic on this path is ranged at the caller's `site.range` (`:431`, `:446`,
`:455`, `:562`).

**Nothing downstream compensates, and nothing downstream is harmed.** The field
name reaches `checkObjectSchema`'s wire-name rules (rows w1/w2), the
constructor's presence and type checks (rows f12, f13, o3), the lowered JSON
Schema (rows L1, L3), and `evaluateMemberAccess`
(`src/runtime/runtime-panics.ts:331–340`), which keys the object by the string.
Rows r1/r2 are identical. The uppercase field therefore behaves exactly like
its lowercase twin, which is why this is an unenforced constraint rather than a
wrong result.

## Why it matters

- **A spelling the spec refuses loads and registers.** `schema S { Xs: string }`
  emits no `E`, so `hasLoadParseError` admits it
  (`production-composition.ts:2047–2054`) and the theta runs. `lexical.md:16`,
  `schemas.md:34` and the *Trigger* at `code-registry-parse.md:19` all say it
  is a parse error.
- **One rule, four positions, three of them enforced.** After 0139 the split is
  no longer explicable as "the lexer covers keyword adjacencies": the parameter
  position is enforced at the parser leaf precisely because it is not one. The
  remaining discriminator is that nobody has written the test for the field.
- **The `params:` face admits a binding the `let` face refuses.** Rows b1 and
  b5: `params: Topic: string` puts `Topic` into the body namespace with zero
  diagnostics, `let Topic = 1` in the same file draws the code.
  `frontmatter-fields-a.md:57` makes both the same kind of thing ("exposed as
  typed variables in the theta body"), and `lexical.md:18` reserves the
  uppercase-first reading of a body identifier for "an existing schema, enum,
  or constructor in scope". Row b4 measures both spellings of `Topic`
  coexisting.
- **The spec's stated single mechanism for a PascalCase wire name has an
  unstated second one.** `schemas.md:39` calls `as "WireName"` "the only
  mechanism"; row L3 measures `params: Topic: string` lowering to a JSON Schema
  property named `Topic`, and row L1 the same through an inline object type. An
  author reaching PascalCase by the unsanctioned route also loses what the
  rename buys — row w3 shows the sanctioned form keeps the theta-side name
  lowercase in the runtime value (`{"xs":"v"}`) while the unsanctioned one does
  not (`{"Xs":"v"}`, row r3).
- **The harm is bounded and should be stated as bounded.** No value is
  corrupted, no check is skipped, no diagnostic is wrong: rows r1/r2 are
  identical, the constructor already governs the spelling against the
  declaration (row o3), and the committed corpus contains zero instances
  (§Reproduction (h)). What is lost is the invariant, not a result.
- **Two designs in the tree read the invariant as available.**
  `lexical.md:13` grounds `match` pattern disambiguation on the first letter
  being enforced, and bug 0119's §Kind reasons from
  `theta/parse/binding-case-mismatch` being "the field-name position's only
  case rule" when it argues `__proto__` is "admitted by rule, not by
  oversight". Both are correct about the *rule*; neither is correct about the
  implementation at this position.
- **No test can red on it, and 0139's witness says so in terms.**
  `tests/lexer-core.test.ts:177–184` and `:186–195` pin the two lexer
  positions; `tests/fn-param-name-case.test.ts` pins the parameter and records
  at `:72–76` that the field positions are "OUT OF SCOPE, deliberately
  unrowed". One committed fixture declares an uppercase field
  (`tests/fn-arg-type-mismatch-wired.test.ts:710`) and asserts a fn-arg verdict
  through a code-filtered helper.
- **The class is now three-quarters closed and the remainder is undocumented in
  the code.** 0139's residual 2 is the only record that the field position is
  open, and it lives in a fix report. Nothing in `src/` marks
  `parseSchemaObjectBody`, `extractParsedParams` or `parseObject` as owing the
  check the way `lexer.ts:806–808` marks the lexer.

## Non-goals

- **The `enum` variant name.** Row g2 measures `enum E { a, b }` silent.
  Governed by `lexical.md:15`'s PascalCase bullet and by
  `theta/parse/schema-case-mismatch`, whose *Trigger* (`code-registry-parse.md:20`)
  names the "schema / enum / **variant** / type-alias position" — the opposite
  direction, a different code, and a different capture site
  (`parseEnumVariants`, `theta-document.ts:2681–2763`, name capture
  `:2724–2731`). It is a real gap and it is measured here so the two are not
  conflated; it is unfiled at this HEAD and this report does not claim it.
- **The `for` / `par for` variable and the `match` pattern binder.**
  `lexical.md:16`'s list does not contain them; rows o4 and o5 measure both
  silent, which is conformant. `type-layer-checks.ts:381–386` depends on that
  reading. Do not fold them in.
- **`theta/parse/reserved-keyword-as-identifier` at the field position.** Rows
  f6 (`schema S { let: string }`) and p4 (`params:` field `let: string`)
  measure both silent. `parseSchemaObjectBody:2578` admits a `keyword` token as
  a field name deliberately. This is bug 0139's residual 1 at a second
  position: same enforcer gap, different registered code, different spec
  sentence (`lexical.md:20`).
  [0148](./0148-reserved-keyword-fn-parameter-position-silent.md) claims the
  `fn` parameter half and leaves the field half out (its §Non-goals and its
  row e5, `schema S { let: string }`). The field half is unfiled at this HEAD
  and is not claimed here either.
- **The wire name.** `lexical.md:16` leaves it free ("may be any string"), row
  f5 is conformant, and
  [0121](./0121-integer-like-wire-rename-escapes-order-guarantee.md) owns the
  open questions about it. A fix at the theta-side identifier must leave every
  wire-name rule (`schemas.md:43–46`) untouched.
- **An import / export specifier's local binding.** Row o6 measures
  `import { rate_strictness as Rs }` silent. `lexical.md:18` gives that position
  its own rule — the synthesised-name reservation — and neither case bullet
  lists it.
- **`parseSchemaObjectBody`'s recovery arms.**
  [0133](./0133-field-list-discard-recovery-unsettled.md)'s subject. A fix here
  adds a test on an accepted `ident` field name and changes no arm's control
  flow; 0133's twelve reaching token classes are all non-`ident` and none of
  its rows moves. The two share the loop and the second to land rebases.
- **A non-identifier `params:` key.** Row q2 (`"my topic": string`) loads
  clean. The registered *Trigger* covers "**Identifier** in a … field-name
  position", so a YAML key that is not an identifier is arguably outside it —
  the same guard 0139's fix used at the parameter (`pTok.kind === "ident"`).
  §Fix names it as part of face 2's route question rather than claiming it.

## Fix

Emit `theta/parse/binding-case-mismatch` at the schema field-name position,
severity `error`, the registry *Message* byte-exact
(`binding name must start with a lowercase letter or _`), ranged on the field
name token. No registry edit: the code exists (`code-registry-parse.md:19`),
its *Trigger* already names the position, its *Message* is unchanged, and
`docs/reference/diagnostics.md:65` mirrors it without a *Trigger* column, so no
mirror edit either. DIAG-2 and DIAG-4 are both satisfied without touching a
table. This is 0139's disposition at the sibling position in the same *Trigger*.

**(a) Where the check lands — the parser leaf, `parseSchemaObjectBody`.** The
site is decided by the range, not by preference. `SchemaFieldSource`
(`theta-document.ts:538–548`) carries no range, so `checkObjectSchema`
(`schema-declarations.ts:87–157`) — which already iterates every field and
already emits two per-field codes — can only range a diagnostic on the whole
declaration; the tree states this at `theta-document.ts:6252–6257` and row w1
measures it (`@4:1–4:32` against a field at `@4:12–4:14`). The field-name token
and its range exist at exactly one place: `parseSchemaObjectBody`'s loop, where
`nameTok` (`:2577`) is already captured, already guarded on kind (`:2578`), and
still in scope at the push (`:2609–2613`). The lexer alternative is excluded by
the same argument that excluded it at the parameter — a keyword scan does not
reach a braced-list interior without a walk that duplicates the parser — with
the additional benefit that not touching `src/lexer/lexer.ts` induces zero
citation drift in open bugs 0051 (`lexer.ts:873–874`) and 0135
(`lexer.ts:842–849`).

Concretely: after the `kind` guard at `:2578` and before or at the push, test
`nameTok.kind === "ident"` and `checkName`'s own formulation
(`first >= "A" && first <= "Z"`, `lexer.ts:832–833`), and push
`{ severity: "error", code: "theta/parse/binding-case-mismatch", file: this.file, range: nameTok.range, message: <registry Message> }`.
Two constraints on the predicate, both measured:

- **Guard on `ident`.** `:2578` admits a `keyword` token as a field name and row
  f6 measures `schema S { let: string }` loading clean. The registered *Trigger*
  covers "**Identifier** in a … field-name position", so a keyword-shaped field
  name must not draw this code. Closing the reserved-keyword arm is a separate
  input class under `lexical.md:20` (§Non-goals) — state whether the fix does
  it; 0139 chose not to, and doing it here would widen the GOV-15 sweep.
- **Reuse a spelling, do not mint one.** `checkName`'s two-comparison form is
  the one 0139 reused. `isLowercaseFirstIdentifier`
  (`src/parser/callable-set.ts:443–445`, `/^[a-z_][A-Za-z0-9_]*$/`) is
  module-private and is a whole-name regex, so it is not reachable without an
  export.

**(b) Which faces the fix closes — the route decision this report leaves open.**
`lexical.md:16`'s "schema field names" has three implementations at this HEAD
and they are not one change:

1. **Face 1, `schema X { … }`** — `parseSchemaObjectBody`. Settled above. This
   is what the witness in (e) requires.
2. **Face 2, the `params:` frontmatter key** — `extractParsedParams`
   (`frontmatter.ts:687–762`). A `params:` block lowers to an object schema
   (rows L1, L3) and its keys are body-scope bindings
   (`frontmatter-fields-a.md:57`, rows b1/b3/b4), so the position is inside the
   *Trigger* on two readings. §Fix must pin **whether this face routes through
   the same emitter or its own**, and the answer is constrained by two measured
   facts: the recorded per-field `range` is the VALUE node's
   (`frontmatter.ts:715–717`, row q1), so a field-name-ranged diagnostic needs
   `rangeOf(item.key, …)` instead; and a `params:` key need not be a theta
   identifier at all today (row q2), so the `ident` guard has no token `kind` to
   read and needs a spelling test of its own. The namespace is not an obstacle —
   `params.ts:195–203` and `:242–248` already emit `theta/parse/*` codes from
   this path. State the decision either way; leaving it unstated makes the next
   reader re-derive §Reproduction (b).
3. **Face 3, the inline object type** — `parseObject`
   (`type-grammar.ts:342–380`), reachable in any `Type` position including a
   `params:` right-hand side (rows i1–i4, p2). `grammar.md:203` makes it the
   same `Field` production. **This face cannot carry a field-name range without
   a structural change**: `TypeToken` (`:160–163`) has no range and every
   diagnostic on the path is ranged at `site.range`. Scoping it in is where the
   D2 estimate breaks; the admissible answers are to include it ranged at the
   declaration site, to add ranges to `TypeToken`, or to exclude it and say so.

A fix closing face 1 alone is admissible and is what this report's witness
requires. Whatever the scope, §Fix records the disposition of all three, and
records whether "field-name position" in the *Trigger* is being read as face 1
only or as all three — that reading is the report's core open question and it
is a statement about the registry's meaning, not about the code.

**(c) Constraints the fix preserves**, each with a witness row above:

- **The conformant spellings stay clean.** `xs` (e2), `_x` (f3), and the
  `xs as "Xs"` rename (f5). The predicate is `lexical.md:16`'s — a lowercase
  letter **or** `_` — which is `checkName`'s existing test, not a `[a-z]` test.
- **The wire half stays free.** f4 (`Xs as "wire"`) must draw the code for its
  theta-side `Xs` and nothing about `"wire"`; f5 must draw nothing at all. Both
  `redundant-wire-name` (w1/w2) and `wire-name-collision`
  (`schema-declarations.ts:120–154`) keep their current behaviour.
- **Every field in a body is checked.** f1 (two uppercase fields) and f2 (only
  the second) — the loop must not stop at the first field, and each diagnostic
  carries its own field's range (`Ys` @4:23–4:25 in f2).
- **The `for` / `par for` variable, the `match` binder and the `enum` variant
  stay clean.** Rows o4, o5, g2. Reaching o4/o5 contradicts `lexical.md:16`'s
  list and breaks `type-layer-checks.ts:381–386`'s premise; reaching g2 emits
  the wrong code under the wrong bullet.
- **No type-layer or runtime verdict moves.** Rows f12, f13, o3 keep their
  current diagnostics with the new code appended where a declaration is
  ill-cased; rows r1–r3 and w3 are unreachable after a fix that refuses their
  declarations, so the witness asserts the refusal rather than the value.
- **The `.thetalib` route fires identically.** Row f9. `lexical.md:3` applies
  every rule on that page to both extensions and both reach
  `parseSchemaObjectBody` through the same parse.
- **Bug 0133's rows do not move.** Its twelve reaching token classes at the
  field-name position are all non-`ident`; the `ident` guard is what keeps them
  out. Re-measure rather than assume, because the two fixes edit the same loop.
- **Bug 0050's shipped witness does not move.**
  `tests/fn-arg-type-mismatch-wired.test.ts:1371` (`U6`) is the one committed
  cell whose fixture declares an uppercase field, and it filters by the fn-arg
  code (`:388–397`, `:657–662`). Verify with a whole-suite run rather than by
  reading, given 0139's recorded shared-witness hazard on that file.

**(d) The GOV-15 discharge.** The fix turns a class of currently-clean programs
into refusals. `source-language-stability.md:25` dispositions a *Trigger*-set
change as carve-out-covered "as an addition for inputs newly brought into the
code's emission set"; this fix does not edit the *Trigger* but brings the
implementation onto the registered one, so the same reasoning applies a
fortiori. Two obligations remain, neither dischargeable by assumption:

1. **Re-run the committed-corpus sweep** rather than trusting §Reproduction
   (h)'s count, over both faces the fix scopes in.
   [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) is open:
   `tests/committed-fixture-parse-gate.test.ts` filters `.theta` only, so the
   two committed `.thetalib` files must be walked explicitly — one of them,
   `docs/examples/personas.thetalib:2–4`, declares three schema fields.
2. **Record the addition in the release notes** as a GOV-15 carve-out-covered
   code addition, with the input class named: `.theta` / `.thetalib` files
   declaring a schema field name (and, if face 2 is scoped in, a `params:`
   field name) whose first character is an uppercase letter.

**(e) Witness — offline, provider-free.** Every row settles inside one
`parseDoc` call, so the witness is one new test file with the shape
`tests/fn-param-name-case.test.ts` uses: whole-list ordered `toEqual` over
unfiltered `doc.diagnostics` on every row, so neither an extra diagnostic nor
one emitted at the wrong position hides inside a containment check, and every
expected message read from the registry through `registryMessage` per DIAG-4
(`diagnostic-shape.md:74`) rather than written out. Required rows: e1 as the
pin, with its range asserted on the field-name token (@4:12–4:14) since
`SchemaFieldSource` carries none and a diagnostic on the `schema` keyword would
be the low-effort wrong answer; f1, f2 (with the second field's own range
@4:23–4:25), f4, f7, f9, e3 as the positional and form coverage; e2, f3, f5 as
the must-stay-clean controls; k1–k5 as the enforced-position controls that keep
the existing behaviour honest; o4, o5 and g2 as the over-reach tripwires, which
red if the fix reaches a binder class or the variant position; f6 as the
reserved-keyword row, pinned to whatever (a) decides; and f12/f13/o3 re-pinned
to their post-fix dispositions. If face 2 is scoped in, rows e5, e6, p1, p3, p4,
q1, q2, b1 and b5 join the set; if face 3 is, rows i1–i4 and p2 join it. A live
tier is optional and 0139's pattern applies if taken: one additive H8a
registration-denial cell in
`tests/live/live-production-acceptance.test.ts`, reading the
`theta-system-note` channel off the settled in-memory `SessionManager`, three
planted thetas isolating the refusal to the field's case, registration-only so
it spends zero tokens.

## Provenance

- **Origin:** residual 2 of bug 0139's fix report
  (`.pi/tmp/fixes/0139-report.md`, §Residuals): "**The other two positions of
  `lexical.md:16`'s four-entry list stay silent** — the schema field name and
  the `params:` frontmatter field name. Measured `[]` before and unchanged
  after: `schema S { Xs: string }` → `[]`; a `params:` field `Topic: string` →
  `[]`. §Reproduction rows e1–e6." 0139's shipped `## Fix (0.79.0)` records the
  same as settled sub-question (b) with the parameter-only scoping rationale.
  The prior record is bug 0046's §Non-goals bullet
  (`docs/bugs/0046-by-clause-undecided-inputs-load-silently.md:533–541`), whose
  "pre-existing, unfiled, and orthogonal" wording this filing supersedes on the
  "unfiled" clause only. This report adds what neither states: the third face
  (the inline object type, `type-grammar.ts:342–380`, rows i1–i4, p2); the
  range facts that decide the site at each face (`SchemaFieldSource` and
  `TypeToken` carry no range; `extractParsedParams` records the value node's);
  the `params:` face's second reading as a body-scope binding and the b1/b5
  contrast; the lowered-wire-schema measurement (L1, L3) against
  `schemas.md:39`'s "only mechanism" sentence; the runtime bound (r1–r3, w3);
  the `enum` variant measurement kept explicitly separate (g2, g3); the
  committed-test blast radius (one cell, code-filtered); and the code-site
  collision with open bug 0133.
- **Evidence:** one scratch vitest file over `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) driving the shipped `parseThetaDocument`, plus
  `executeBody` through `createProductionProducerDeps(…).bindPromptConversation`
  for the `r*` / `w3` rows and `lexSrc` for the token ranges, at `d11aef29`;
  every cell of groups (a)–(i) measured and quoted verbatim above; written,
  run, deleted. The corpus sweep in (h) enumerates `git ls-files` filtered to
  `*.theta` / `*.thetalib` (34 files), parses each through the same entry point,
  and tests every parsed schema field name and `params:` field name for an
  `[A-Z]` first character.
- **Implementation, at `d11aef29`:** `src/lexer/lexer.ts:125` (the call site),
  `:806–808` (the scope note), `:810–851` (`contextualDiagnostics`), `:814–851`
  (`checkName`; the keyword arm `:819–828`, the non-`ident` return `:829–831`,
  the first-letter test `:832–833`, the `binding-case-mismatch` emission
  `:834–841`, the `schema-case-mismatch` emission `:842–850`), `:876–886` (the
  three-position dispatch); `src/parser/theta-document.ts:538–548`
  (`SchemaFieldSource`, no range), `:2353` (`parseSchema`), `:2355` (the schema
  name capture), `:2401–2409` (`finishObjectSchema`), `:2560–2642`
  (`parseSchemaObjectBody`; the field-name token `:2577`, the kind guard
  `:2578`, the consume `:2585`, the `as` rename `:2586–2602`, the `:`
  requirement `:2603–2606`, the push `:2609–2613`, the comma rule `:2614–2639`),
  `:2645–2655` (`skipBraceRemainder`), `:2657–2670` (`parseEnum`), `:2681–2763`
  (`parseEnumVariants`; the variant name capture `:2724–2731`), `:6225–6238`
  (the whole-file schema walk's `checkObjectSchema` call), `:6252–6257` (the
  comment stating `SchemaFieldSource` carries no range);
  `src/parser/schema-declarations.ts:49–52` (`ObjectSchemaDecl`), `:87–157`
  (`checkObjectSchema`), `:102–113` (`redundant-wire-name`), `:120–154`
  (`wire-name-collision`); `src/parser/frontmatter.ts:687–762`
  (`extractParsedParams`), `:710` (the field-name capture), `:715–717` (the
  value-node range), `:733–738` (the field record);
  `src/parser/params.ts:195–203`, `:242–248` (`theta/parse/*` codes emitted
  from the frontmatter path); `src/parser/type-grammar.ts:160–163`
  (`TypeToken`, no range), `:214` (the mint), `:342–380` (`parseObject`),
  `:351–358` (the field-name skip), `:431`, `:446`, `:455`, `:562` (the
  site-ranged diagnostics); `src/parser/callable-set.ts:443–445`
  (`isLowercaseFirstIdentifier`, module-private);
  `src/parser/type-layer-checks.ts:381–386` (the comment scoping the rule away
  from `for` / `match` binders); `src/runtime/runtime-panics.ts:331–340`
  (`evaluateMemberAccess`); `src/extension/production-composition.ts:2047–2054`
  (`hasLoadParseError`).
- **Corpus, at `d11aef29`:** `docs/spec_topics/lexical.md:3`, `:13`, `:15`,
  `:16`, `:18`, `:20`; `docs/spec_topics/schemas.md:17`, `:21`, `:34`, `:39`,
  `:43–46`; `docs/spec_topics/diagnostics/code-registry-parse.md:19`, `:20`;
  `docs/reference/diagnostics.md:65`, `:66`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`;
  `docs/reference/grammar.md:190`, `:203`, `:311–312`;
  `docs/spec_topics/grammar.md:171–172`;
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:57`, `:58`;
  `docs/examples/personas.thetalib:2–4` (the corpus's only `.thetalib` schema
  field list).
- **Tests, at `d11aef29`:** `tests/lexer-core.test.ts:177–184`, `:186–195` (the
  two lexer-position witnesses); `tests/fn-param-name-case.test.ts:72–76` (bug
  0139's witness naming this position out of scope);
  `tests/fn-arg-type-mismatch-wired.test.ts:710` (the one committed fixture
  declaring an uppercase schema field), `:1371` (its single use), `:657–662`
  (`expectNoFnArgMismatch`) and `:388–397` (`locatedHits`, the code filter that
  keeps the cell from moving); `tests/ctor-field-type-check.test.ts:794–812`
  (the offline parse-then-execute harness the `r*` rows model).
  No test asserts a schema field name's case, a `params:` field name's case, or
  an inline object type field name's case, in either direction.

## Fix (0.82.0)

- **What shipped** — one predicate added at each of two parser leaves, plus its
  witnesses. No registry edit, no spec edit, no mirror edit, no
  `src/lexer/lexer.ts` edit:
  - `src/parser/theta-document.ts` (+34/−0) — **§Fix (a), face 1**,
    `parseSchemaObjectBody`'s field loop. Guarded on `nameTok.kind === "ident"`
    and `checkName`'s own two-comparison predicate
    (`const first = nameTok.text[0] ?? ""; first >= "A" && first <= "Z"`), it
    pushes `theta/parse/binding-case-mismatch`, severity `error`, the registry
    *Message* byte-exact, ranged on `nameTok.range`. §Fix (a) admitted the
    emission "before **or at** the push"; the pre-measurement settled it AT the
    push — see the placement sub-question below.
  - `src/parser/frontmatter.ts` (+45/−0) — **§Fix (b), face 2**,
    `extractParsedParams`'s YAML item loop, its own emitter. Guarded on the
    file-local `isIdentifierShaped` and on non-membership of the lexer's own
    `reservedKeywords()` set, with the same case predicate, ranged on
    `rangeOf(item.key, …)` — the key node, not the value node the surrounding
    per-field `range` carries. `fieldInputs.push`, `bypassFields` and the
    `parseParams` lowering are untouched, so the field set `parseParams` and the
    `system:` interpolation seam see is unchanged (bug 0041's "the refusal stays
    one diagnostic").
  - `tests/schema-field-name-case.test.ts` — new, 46 cells, offline and
    provider-free, on `tests/fn-param-name-case.test.ts`'s shape: whole-list
    ordered `toEqual` over unfiltered `doc.diagnostics` on every row, every
    expected *Message* read through `parseRegistry` / `registryMessage`
    (DIAG-4), `parseDoc` from `tests/helpers/e2e-s1.ts`. §Fix (e)'s required row
    set in full, plus the face-2 rows §Fix (e) makes conditional on that face
    being scoped in.
  - `tests/live/live-production-acceptance.test.ts` (+200/−0) — one additive
    H8a registration-denial cell on the bug 0148 cell's shape,
    registration-only and zero-token: `b149liveschemabroken`
    (`schema S { Xs: string }`) and `b149liveparamsbroken` (a `params:` key
    `Topic: string`) are each denied registration end to end through the real
    production composition root, while their lowercase-first siblings
    `b149liveschemagood` / `b149liveparamsgood` and the `b149livectl` control
    all register. It reuses this file's existing `bindingCaseMismatchFragment`
    reader (bug 0139's addition) rather than adding a second, and reads the
    `theta-system-note` channel off the settled in-memory `SessionManager`,
    telling the two notes apart by the broken theta's own file path rather than
    by the message text.

- **The face-set decision, and every face's disposition.** §Fix (b) left the
  reading of the *Trigger*'s "field-name position" to the run. It is read as
  covering every field declaration carrying a theta-side identifier the author
  writes — which by `grammar.md:203` ("`ObjectType` fields reuse the
  object-schema `Field` form") includes all three faces. Two are closed; the
  third is left unimplemented for a stated engineering reason, not read out of
  the *Trigger*:
  - **Face 1, `schema X { … }` — IN.** §Fix (a) settled it. Witness rows e1
    (the pin, ranged @4:12–4:14), e3, f1 (both fields, each at its own range),
    f2 (the second field only, @4:23–4:25), f4 (the theta-side half of an `as`
    rename), f9 (the `.thetalib` route, @1:12–1:14), f10, f12, f13, w1.
  - **Face 2, the `params:` frontmatter key — IN.** Both blockers §Fix (b)
    named are dischargeable from material already in `frontmatter.ts`, which is
    why the face is in scope rather than deferred: the key's range is
    `rangeOf(item.key, lineCounter, lineOffset)`, the same call the function
    already makes one line earlier on `(item.value ?? item.key)`; and the
    identifier-shape guard §Fix (b) says the face "needs … of its own" already
    exists as the file-local `isIdentifierShaped`
    (`/^[A-Za-z_][A-Za-z0-9_]*$/`), so no third spelling is minted. It routes
    through **its own emitter**, not face 1's — forced, not chosen:
    `ParamFieldInput.range` is the VALUE node's range (row q1, `@5:5–5:8`), so
    nothing downstream in `params.ts` can range a diagnostic on the key, and
    `item.key` is in scope only in `extractParsedParams`. Witness rows e5 (the
    pin, ranged on the key @4:3–4:8), p1, p6, b1, b3, b4, q1, q3, q4.
  - **Face 3, the inline object type — OUT.** `parseObject`
    (`type-grammar.ts`) mints `TypeToken` as `{ kind, text }` with no range and
    every diagnostic on that path is ranged at the caller's `site.range`, so a
    field-name-precise range needs a structural change — the D3 risk §Fix (b)
    names as "where the D2 estimate breaks", whose admissible answer "exclude
    it and say so" is taken. Rows i1–i4 and p2 stay `[]`. Following bug 0139's
    precedent (`tests/fn-param-name-case.test.ts:72–76`), the excluded face is
    NAMED in the witness header and deliberately **unrowed** — a row asserting
    `[]` there would red permanently against a later fix that closes it. The one
    exception is row f7, which §Fix (e) required be rowed:
    `schema S by Kind = { … } | { … }` reaches the ALIAS right-hand side, whose
    inline arms are parsed by `parseObject`, so f7 stays `[]` and its comment
    records that a later face-3 fix legitimately re-pins it.

- **The range-sourcing choice for the face whose parser drops the token.** Only
  face 2 needed one, and it needed a range rather than a token: the YAML
  `Scalar` key node already carries `range`, so `rangeOf(item.key, …)` supplies
  it with no structural change, and the emission falls back to the surrounding
  per-field `range` on an unranged key node, mirroring that field's own `??`
  discipline. Face 1 needed nothing — `nameTok` is the whole token and stays in
  scope across the loop body. Face 3 is the face whose parser genuinely drops
  the token, and that is exactly why it is out.

- **The emission site inside face 1 — settled by measurement, not preference.**
  §Fix (a) admitted "after the `kind` guard … and before **or at** the push".
  The binding pre-measurement ran the full default suite under both:
  - BEFORE the push (right after the name token is consumed, ahead of the
    optional `as "WireName"`): **1 RED** —
    `tests/schema-alias-rhs-malformed.test.ts:1210` (bug 0042 (e) e2, fixture
    `F1D = schema S { f: Cat Cat }`). The comma-recovery arm re-enters the loop
    and reads the *type* token `Cat` as the next field's name; no `:` follows,
    so that field is discarded and `Cat` is never declared. A genuine
    over-reach onto bug 0133's recovery arms.
  - AT the push (past the last recovery arm — after the required `:` is
    consumed, before `parseType`): **0 REDS**.

  AT the push shipped. It satisfies §Fix (c)'s "Bug 0133's rows do not move" by
  construction rather than by measurement, and confines the emission to a field
  name no earlier arm of its own iteration discarded.

- **The predicate — one spelling, not a third.** Both sites carry `checkName`'s
  two-comparison form (`src/lexer/lexer.ts`), the same one bug 0139 reused at
  `parseFn`'s parameter. `isLowercaseFirstIdentifier` (`callable-set.ts`) is not
  reached: §Fix (a) records it as module-private and a whole-name regex rather
  than a case test. `src/lexer/lexer.ts` is byte-unmodified, so open bugs 0051
  (`lexer.ts:873–874`) and 0135 (`lexer.ts:842–849`) take zero citation drift,
  as §Fix (a) required.

- **The reserved-keyword arm is NOT closed, and the two faces agree on it.**
  §Fix (a) required this be stated. Face 1 excludes reserved spellings
  structurally (`nameTok.kind === "ident"`; the lexer's
  `reserved.has(value) ? "keyword" : "ident"` makes the kind exactly set
  membership). Face 2 excludes them by set membership against the lexer's own
  exported `reservedKeywords()`, imported the way `src/parser/params.ts`
  already imports it. This was a defect on first implementation and was caught
  in the review loop: face 2's guard was `isIdentifierShaped` alone, so the
  three uppercase-first reserved spellings drew the WRONG registered code —
  `params: Ok: string` → `binding-case-mismatch @4:3–4:5`,
  `params: Err: string` → `@4:3–4:6`, `params: Result: string` → `@4:3–4:9` —
  while `schema S { Ok: string }` was silent and `let Ok = 1` / `fn Ok()` /
  `fn h(Ok: string)` / `schema Ok = string` all drew
  `reserved-keyword-as-identifier`. Every position where this rule is enforced
  gives the keyword arm precedence and the case arm never sees a reserved
  spelling (`checkName` pushes and `return`s before its first-letter test; bug
  0148's `parseFn` arm tests keyword-kind ahead of the case arm), so the
  divergence was a fresh instance of the very disease this report exists to
  remove. Rows f6, f14, p4, p7, p8 pin both faces silent on a reserved spelling
  and k6 pins which arm owns the input on a path this fix does not touch.
  `schema S { let: string }` and `params: Ok: string` therefore still load
  clean; that input class is unclaimed here (§Non-goals) and unmoved.

- **The binding blast-radius pre-measurement**, run before the witness was
  written:
  - **Corpus** — `git ls-files -- '*.theta' '*.thetalib'` = 34 files, both
    committed `.thetalib` files walked explicitly because
    `tests/committed-fixture-parse-gate.test.ts` filters `.theta` only (open
    bug 0132). **Zero** uppercase-first schema field names and **zero**
    uppercase-first `params:` keys. The three regex hits
    (`docs/examples/refine-inline.theta:18`, `docs/examples/reviewer.theta:13`,
    `docs/examples/summarise-doc.theta:24`) are prose inside `@`…`` query
    templates, not field positions. §Reproduction (h)'s count is re-measured,
    not trusted. The operator's untracked `.pi/theta/smoke.theta` declares no
    schema and no `params:`.
  - **Test corpus** — exactly ONE uppercase-first schema field,
    `tests/fn-arg-type-mismatch-wired.test.ts:710` (`schema W { P: number }`),
    used once at `:1371` through the code-filtered `expectNoFnArgMismatch`;
    **zero** uppercase-first `params:` keys anywhere in `tests/`, `docs/` or
    `src/`.
  - **Prototype suite run** — 0 existing reds at the shipped placement. §Fix
    (c)'s instruction to verify bug 0050's `U6` cell "with a whole-suite run
    rather than by reading" is discharged that way.

- **Gates** (verbatim, re-run by the orchestrator independently of every nested
  worker):
  - Witness, before the fix: `npx vitest run tests/schema-field-name-case.test.ts`
    → `Tests 18 failed | 23 passed (41)`, every red a missing
    `theta/parse/binding-case-mismatch`. After: `Tests 46 passed (46)`.
  - Full default suite: `npm test` → `Test Files 276 passed (276)` /
    `Tests 4285 passed (4285)`. The pre-fix HEAD baseline was 275 files / 4239
    tests; the delta is exactly this change's one witness file.
  - Typecheck: `npx tsc --noEmit -p tsconfig.json` → exit 0.
  - Lint: `npm run lint` → exit 0.
  - H8a live: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → `Tests 25 passed (25)`
    (24 before this cell), the new cell 375 ms — the zero-token
    registration-only profile.
  - H9a live: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/acceptance/` → `Tests 11 passed (11)`, including area (d), which
    drives `tests/live/acceptance/fixtures/acc-params-binder.theta` (`topic`,
    `count` — both lowercase-first, so clean).
  - `tests/fixtures/h7a/permitted-codes.json` — decided by the real H9a run,
    not by reading: byte-unchanged, blob `a4a8da04`. The acceptance fixtures'
    only schema is `schema Reply { status: string, summary: string }` and their
    only `params:` block is `topic` / `count`, all lowercase-first, so
    `binding-case-mismatch` cannot fire on any committed H9a fixture and the
    EMPTY-CAPTURE stderr gate needs no new entry.

- **Review** — 3 rounds plus one polish round:
  - Round 1 (`bug-fix-reviewer`) — CLEAN. Three non-blocking residuals: a
    face-1 comment overclaim, the registry *Message*'s fourth inline copy in
    `src/`, and comment length (judged proportionate).
  - Polish (`bug-fix-fixer-light`) — the comment overclaim corrected and one
    WHAT-aside cut, both comment-only in `src/`; witness row q4 added.
  - Round 2 (`bug-fix-reviewer-fast`) — CLEAN, and surfaced face 2's missing
    reserved-keyword awareness as a scope note. The orchestrator measured it
    and elevated it to a `correctness` finding.
  - Fixer (`bug-fix-fixer`) — the reserved-keyword exclusion added by reuse of
    `reservedKeywords()`; four additive witness rows (k6, f14, p7, p8). It
    measured a third affected spelling (`Err`) the finding had not enumerated,
    which the set-based exclusion covers.
  - Round 3 (`bug-fix-reviewer`) — CLEAN, zero findings. It confirmed the
    reserved set's uppercase-first members are exactly `Ok`, `Err`, `Result`
    and byte-equal to `lexical.md:20`'s list; that no conformant key lost its
    diagnostic (`Topic`, `Other`, `"Topic"`, `OK`, `Okay`, `Results` all still
    fire); that the LOWERCASE namespace is not narrowed anywhere, so open bug
    0135's admission premise for `index` is unmoved; and that all four
    `binding-case-mismatch` emitters in `src/` now exclude reserved spellings.

- **Verification** — SOLID, every obligation with quoted evidence, each
  neutralisation restored and proven restored by blob hash against a
  pre-neutralisation snapshot (never `git stash`, never `git checkout`):
  - Witness reds for the right reason, per face. N1 (face 1 neutralised) →
    exactly e1, e3, f1, f2, f4, f9, f10, f12, f13, w1 red, every face-2 cell
    green. N2 (face 2 neutralised) → exactly e5, p1, p6, b1, b3, b4, q1, q3, q4
    red, every face-1 cell green. N3 (the reserved-keyword exclusion dropped) →
    exactly p7 and p8 red, proving that clause load-bearing.
  - Full default suite green: 276 files / 4285 tests.
  - Live end-to-end coverage of the fixed path, run for real, both directions
    proven on the new H8a cell: neutralised → the cell reds with both broken
    thetas present in `Registered:`; restored (blob-hash verified) → green.
  - Lint and typecheck: exit 0 each.
  - No stochastic red fired; every live run passed first attempt.

- **Residuals**:
  1. **Face 3, the inline object type, stays unenforced.** Rows i1–i4
     (`fn h(p: { Ys: string })`, `schema S { a: { Ys: string } }`,
     `fn h(): { Ys: string }`), p2 (a `params:` right-hand side) and f7 all
     still load clean and register. Cause: `TypeToken` (`type-grammar.ts`) is
     `{ kind, text }` with no range, and every diagnostic on that path is
     ranged at the caller's `site.range`. Closing it means adding ranges to
     `TypeToken` or accepting a declaration-ranged diagnostic. Measured this
     run; deliberately unrowed so no witness reds permanently against the fix
     that closes it.
  2. **The registry *Message* has four inline copies in `src/`** — `lexer.ts`'s
     `checkName`, `parseFn`'s parameter arm (bug 0139), `parseSchemaObjectBody`
     and `extractParsedParams`. De-duplicating needs either an edit to
     `src/lexer/lexer.ts` (which §Fix (a) forbids, to keep open bugs 0051 and
     0135 drift-free) or a fifth authority covering two of the four sites.
     Drift is caught rather than prevented: the witness pins all four emission
     paths against the registry-sourced template (k2/k4/k5 → the lexer, k3 →
     `parseFn`, e1 → face 1, e5 → face 2), so any one copy drifting reds the
     suite. Non-behavioural; belongs to whichever change legitimately opens
     `lexer.ts`.
  3. **A YAML-normalised `params:` key is unwitnessed in either direction.** A
     plain key `True` parses as a YAML boolean and stringifies to `"true"`, a
     reserved spelling, so it draws nothing (`params: True:` → `[]`,
     `params: Null:` → `[]`). Unchanged by this fix in either direction — the
     normalised first letter is lowercase, so the case arm never saw it before
     either. On the merits the author wrote a YAML boolean rather than an
     identifier in a field-name position, so the class sits with the
     reserved-spelling family rather than here.
  4. **Induced citation drift, disclosed and not chased** (bug 0134's class,
     the disposition bug 0139's fix took for its own insertion):
     `src/parser/theta-document.ts` citations at old line ≥ 2637 shift **+34**;
     `src/parser/frontmatter.ts` citations at old line ≥ 718 shift **+45**.
     Only `//`-comment and bug-document citations are affected — no assertion,
     type or runtime behaviour reads a line number. Affected open bug documents
     include 0014, 0025, 0026, 0028, 0031, 0033, 0035, 0038, 0039, 0041, 0042,
     0044, 0045, 0046, 0050, 0051, 0052, 0053, 0056, 0058, 0059, 0060, 0061,
     0063, 0069, 0071, 0072, 0082, 0093, 0095, 0096, 0097 and 0100–0107;
     pre-existing drift in those documents is not this fix's and was not
     touched.
  5. **Bug 0133's Status-bullet claim is now stale in the stronger sense.** It
     reads "No open report edits `parseSchemaObjectBody` … or
     `skipBraceRemainder`"; this report's filing made that false and this fix
     has now landed in that loop, so 0133 rebases against the shipped emission
     rather than against an open report. No 0133 row moves — its twelve
     reaching token classes at the field-name position are all non-`ident`, the
     `ident` guard keeps them out, and the whole-suite run confirms it. 0133's
     document is another open report's and was not edited.

- **Discharge notes appended**:
  - `docs/bugs/0046-by-clause-undecided-inputs-load-silently.md`, §Non-goals
    "Field-name casing enforcement" — its "loads clean at HEAD" premise moved
    for the two closed faces, and its own example `schema Cat { Kind: "cat" }`
    is now refused. Appended, nothing deleted; what remains load-bearing (the
    gap's orthogonality to the `by`-clause subject, and cell i2's lowercase
    fixture) is restated as still accurate, and face 3's survival is named so
    the bullet's reachability argument keeps a live route.
  - `docs/bugs/0135-index-sentinel-leaks-into-messages-and-typeenv.md` — **no
    note owed, premise verified unmoved.** Its rows b2/b3 declare
    `schema P { index: array<string> }`; `index` is lowercase-first, measured
    `[]` after the fix, and the LOWERCASE namespace is narrowed nowhere. Its
    `lexer.ts:842–849` citation takes no drift — that file is byte-unmodified.
  - `docs/bugs/0143-…` and the four render-family documents — **no note owed.**
    They cite `src/parser/type-compat.ts` arms; that file is byte-unmodified
    (blob `c565a6a4`, identical to HEAD).
  - `docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md` — **no
    note owed.** It claims the KEYWORD rule at sibling positions: a different
    registered code, a different spec sentence (`lexical.md:20` against `:16`)
    and a disjoint input set. This fix leaves every reserved spelling silent at
    both closed faces, so 0153's class is handed to it untouched.

- **Pinned dispositions / non-goals** — unchanged and re-measured after the
  fix: the `enum` variant name stays silent (row g2, `lexical.md:15`'s bullet
  and the other code); the `for` / `par for` variable and the `match` pattern
  binder stay silent (rows o4, o5 — `lexical.md:16`'s list contains neither and
  `type-layer-checks.ts` depends on the exclusion); the wire-name half stays
  free (row f4 draws the code for its theta-side `Xs` and nothing about
  `"wire"`; row f5's `xs as "Xs"` draws nothing; a reserved spelling as a wire
  string draws nothing); `_`-leading stays admitted (rows f3, p3, and
  `__proto__` measured clean, so bug 0119's reading is intact); a `params:` key
  that is not identifier-shaped stays outside the *Trigger* (row q2); and
  `theta/parse/reserved-keyword-as-identifier` at either field position stays
  unclaimed (rows f6, f14, p4, p7, p8).
