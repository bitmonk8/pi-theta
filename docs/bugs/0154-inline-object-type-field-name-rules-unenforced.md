# Bug 0154 — `docs/reference/grammar.md:203` makes an inline object type's fields "reuse the object-schema `Field` form", which puts the inline field name inside `lexical.md:16`'s lowercase-first rule and inside the registered *Trigger*'s "field-name position" (`code-registry-parse.md:19`), but no identifier rule reaches that slot: `fn h(p: { Ys: string })`, `schema S { a: { Ys: string } }`, `fn h(): { Ys: string }`, a `params:` right-hand side `p: { Ys: string }` and `schema S by Kind = { Kind: "a" } | { Kind: "b" }` each report `[]` and register, `params: p: { Xs: string }` lowers the uppercase key into the provider-facing `$defs` as `"properties":{"Xs":…}`, and the reserved-keyword rule (`lexical.md:20`) is unreachable at the identical slot — all 18 spellings measured silent, `{ let: string }` lowering to `"properties":{"let":…}` — while `schema S { Xs: string }` and a `params:` key `Topic: string` on the same HEAD each draw `theta/parse/binding-case-mismatch`

- **Status:** open. Face 3 of the bug 0149 fix (0.82.0, `bfa5ae84`), recorded
  as **OUT** in that fix's face-set table and as Residual 1 of its report
  (`.pi/tmp/fixes/0149-report.md`), and in 0149's own `## Fix (0.82.0)` record.
  0149 read the face as inside the *Trigger* by rule and left it unimplemented
  for a stated engineering reason. §Fix here is constraint-pinned, not settled:
  the route that recovers a field-name range (or the decision to emit without
  one), and the disposition of the reserved-keyword arm at this one position,
  are left to the run with their consequences enumerated. Ordering: nothing
  blocks this report from starting. It shares the parser leaf with open
  [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md),
  whose §Fix constraint 4 names the same structural question at the same
  function; whichever lands second reuses or rebases the field-name retention
  the first builds. 0149 authorised exactly one witness row to be re-pinned by
  this fix — row f7 of `tests/schema-field-name-case.test.ts` — and no other.
  0052 landed first (0.84.0) and built the retention this report rebases onto:
  `TypeParser.parseObject` (`type-grammar.ts`) now records a `fieldNames:
  string[]` on the `object` `TypeNode` — one entry per field-name position the
  interior spells as an identifier followed by a colon, pushed before the
  field's type parses, in source order, NOT index-aligned with `fieldTypes`,
  and carrying NO source range, because 0052 read the range question as this
  report's own adjudication and had no need of it. Two facts of that retention
  bear on the route chosen here: the list stops for the remainder of a body
  once a field's type carries an interior that never closes, and the rule
  reading it is gated on the closing brace `ObjectType` spells (0052 §Fix
  (0.84.0), *Residuals* item 1). A case rule keyed on the same list inherits
  both boundaries; recovering a range means extending `tokeniseType`'s
  `TypeToken`, which 0052 left untouched.
- **Sev/Diff estimate:** S1/D3 — S1 on the letter bug 0149 was scored on: a
  declared constraint is unenforced on the ordinary load path, so a spelling
  the spec refuses loads with no diagnostic and the theta registers ("inputs
  accepted that the spec refuses … with no diagnostic, declared constraints not
  enforced"). Two measured directions make the harm profile differ from 0149's
  two closed faces. Wider on the wire axis: at the `params:` right-hand side
  and at the query response-schema root the uppercase theta-side key reaches
  the JSON Schema handed to the binder and the provider verbatim (rows L1, L4),
  which `schemas.md:39` names the `as "WireName"` rename as "the only
  mechanism" for, and unlike 0149's face 2 the theta still registers, so the
  leak is not gated by a load refusal. Narrower on the corpus axis: the whole
  tracked tree contains exactly one occurrence of the shape in theta source
  (§Affected), and it is the row 0149 authorised this fix to re-pin. D3, not
  0149's D2, for three measured reasons named in §Fix: the field name is
  discarded three times over on the way to the check — `parseType`
  (`theta-document.ts:3052`) stringifies the type expression out of the ranged
  outer token stream, `tokeniseType` (`type-grammar.ts:166`) re-tokenises that
  string into `TypeToken`s that carry no range (`:160–163`), and `parseObject`
  (`:342–380`) drops the name token without recording it (`:351–358`), so no
  `TypeNode` carries it (`:132–157`); the range question therefore needs an
  in-run adjudication rather than a settled answer, which is what 0149's doc
  meant by naming this "where the D2 estimate breaks"; and the fix coordinates
  with open 0052 at the same function while re-pinning a row in a witness file
  another report shipped.
- **Kind:** defect — implementation, against a written sentence and its
  registered *Trigger*. Three elements.
  1. **The rule reaches the position by an explicit production-level
     equivalence.** `docs/spec_topics/lexical.md:16` requires lowercase-first
     for "`let` and `let mut` bindings, function parameters, function names, and
     **schema field names**", and `:18` states the consequence without
     qualification: violating it "is a parse error:
     … `theta/parse/binding-case-mismatch`". `docs/spec_topics/grammar.md:101`
     spells `ObjectType ::= "{" Field ("," Field)* ","? "}"` with the comment
     "`Field` per Schema Declarations", and `:109` states that an inline object
     type's "fields reuse the same `Field` form as an object-schema body and
     carry the same field semantics". The user-facing mirror puts it in one
     clause: `docs/reference/grammar.md:203`, "`ObjectType` fields reuse the
     object-schema `Field` form". An inline object type's field name is
     therefore a schema field name, and the registered *Trigger*
     (`code-registry-parse.md:19`) names "a … field-name position" with no
     spelling qualifier.
  2. **Nothing enforces it there, and the same slot is unreachable to the
     reserved-keyword rule.** Every position measured in §Reproduction (a)
     reports `[]` and registers. §Reproduction (c) measures all 18 reserved
     spellings probed at the identical slot — also `[]`. Two of them, `void` and
     `Result`, draw their own registered code when written one slot to the
     right, in the field's TYPE position (rows n7, n8), and `let` there draws
     `theta/parse/reserved-keyword-as-identifier` (row r1). The NAME slot and
     the TYPE slot of one inline field are two different rules' subjects and the
     NAME slot has no enforcer of either rule.
  3. **The silence reaches the wire.** `params: p: { Xs: string }` lowers to a
     `$defs` entry whose property key is the author's uppercase theta-side name
     (`"properties":{"Xs":{"type":"string"}},"required":["Xs"]`, row L1), and
     that document is the binder's and the provider's schema
     (`production-theta-producer.ts:725–728`). The query response-schema root
     does the same at its own root (row L4). `docs/spec_topics/schemas.md:39`
     names the `as "WireName"` rename as "the only mechanism for expressing
     schemas whose property names are not theta-identifier-compatible —
     PascalCase (`"FirstName"`) …"; here a PascalCase property key reaches the
     provider with no rename written.
- **Related:**
  - [0149](./0149-field-name-case-positions-unenforced.md) — **fixed
    (0.82.0)**, the filing origin. Its face-set table dispositions this face
    **OUT** and its `## Fix (0.82.0)` record states the cause and the two
    admissible routes. It also fixes the two sibling faces whose enforcement
    §Reproduction (b) uses as live controls, and it is the source of this
    report's one re-pin authorisation: row f7 of
    `tests/schema-field-name-case.test.ts:540–553`, whose comment reads "This
    row is where the face boundary is observable, so it records the boundary
    rather than asserting face 3 stays silent forever: it is
    `schema S { … }` that this file's contract reaches, and the two spellings
    take different parsers." That witness's header
    (`tests/schema-field-name-case.test.ts:104–119`) names this face OUT OF
    SCOPE and deliberately unrowed, so rows i1–i4 and p2 do not exist there and
    **only f7** is re-pinned by a fix here. Adding rows for the other faces is
    an addition, not a rebase.
  - [0153](./0153-reserved-keyword-remaining-identifier-positions.md) —
    **open**, filed at `fe106bb3`, the reserved-keyword sibling. It claims
    `theta/parse/reserved-keyword-as-identifier` (`lexical.md:20`) at six
    positions; **the inline object type is not one of them** — it records at its
    §Non-goals bullet "**An inline object type's field name.** Named as bug
    0149's third face and not measured here." This report measures it
    (§Reproduction (c)) and is the only open report that does. **Two rules, one
    position.** Both rules' subjects meet in this slot with no token-kind
    disjointness to separate them: `tokeniseType` classifies every
    identifier-shaped run as `kind: "ident"` (`type-grammar.ts:208–215`) and
    has no keyword set at all, so unlike the `schema` body — where the outer
    lexer's `kind: "keyword"` classification keeps reserved spellings out of an
    `ident`-guarded case arm — here `Ok`, `Err`, `Result` and the 29 lowercase
    spellings all present as `ident`. A fix that enforces the case rule at this
    slot on an `ident` guard alone would therefore draw
    `binding-case-mismatch` on `{ Ok: string }`, which is the exact defect
    0149's review loop caught and removed at its face 2. §Fix (c) makes stating
    the arm precedence a binding obligation. 0153's own fix does not reach this
    position, so no discharge note passes between the two reports.
  - [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md) —
    **open**, the same parser leaf under a different rule: a repeated field name
    inside an inline object body. Its §Fix constraint 4 states this report's
    structural question in the same terms ("`parseObject` … discards them
    today, so the rule either retains them there or runs over the same interior
    tokenisation the lowerers use") and names the third route §Fix (a) route 3
    takes up. The two are behaviourally disjoint — 0052's subject is a
    duplicate, this report's is a first letter — and share one function, so
    whichever lands second reuses or rebases the retention the first builds.
    0052's `type-grammar.ts` citations are stale at this HEAD (bug 0134's
    class): its `parseObject` at `:275–307` is `:342–380` and its field-name
    discard at `:279–286` is `:351–358`. Its §Reproduction G1 already records
    the malformed property key an inline rename produces
    (`"a as \"w\""`), which §Non-goals leaves with 0052.
  - [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) —
    **fixed (0.57.0)**, the precedent for enforcing a rule at this exact leaf
    and the precedent for the range answer §Fix (b) route 2 takes. It wired
    `theta/parse/empty-schema-body` through `walkType`'s object arm
    (`type-grammar.ts:473–475`) and adjudicated the range in terms: "the
    diagnostic's range locates the occurrence (at the schema-field position
    that range is the declaration's … `SchemaFieldSource` carries no range of
    its own)". Row n3 measures that shipped emission at `@4:1-4:19` — the whole
    declaration. A declaration-ranged emission at this seam is therefore the
    established convention, not a novel precision loss.
  - [0139](./0139-fn-parameter-name-case-rule-unenforced.md) — **fixed
    (0.79.0)**, the pattern precedent for the family and the source of the
    unrowed-excluded-face discipline this report inherits
    (`tests/fn-param-name-case.test.ts:72–78`: "OUT OF SCOPE, deliberately
    unrowed … rows for them would red permanently against a fix scoped to the
    parameter").
  - [0148](./0148-reserved-keyword-fn-parameter-position-silent.md) — **fixed
    (0.81.0)**, the same pattern under the reserved-keyword rule, and the report
    whose residuals produced 0153. Its shipped `parseFn` arm is the precedence
    template §Fix (c) names: the keyword kind is tested ahead of the case arm.
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) —
    **fixed (0.54.0)**, the report that settled how keyword-shaped text in a
    `Type` position is classified. Its machinery is why the field's TYPE slot
    already draws `reserved-keyword-as-identifier` from a lowering sink
    (`params.ts:195–203`, `lowerTypeExpr`'s classifier at `:559–565`) — a live,
    declaration-ranged emission of 0153's code at the `params:` position, row
    r3 at `@4:6-4:17`. It bounds this report on both sides: a fix here must not
    reach the TYPE slot 0044 owns (rows r1, r3, r5 must not move), and its sink
    is a shipped precedent that a declaration-ranged emission of either rule's
    code is admissible at this seam.
  - [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
    — **fixed (0.49.0)**, which froze the `params:` position's lowered output
    byte-for-byte. §Fix constraint 4 keeps that freeze: no route here edits a
    lowering.
  - [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — **open**.
    The corpus census in §Affected walks both committed `.thetalib` files
    explicitly rather than relying on the gate, which filters `.theta` only.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class covering the positional drift any fix here
    induces in `type-grammar.ts` citations.
- **Affected** (every citation verified at HEAD `fe106bb3`, 0.82.0):
  - **The spec rules** — `docs/spec_topics/lexical.md:16`, the lowercase-first
    bullet naming "schema field names" and the sentence scoping the rule to
    "the **theta-side** field identifier"; `:18`, the violation sentence;
    `:13`, "The **first letter's case is enforced** by the parser"; `:20`, the
    32 reserved spellings and "Using one of these in identifier position is
    `theta/parse/reserved-keyword-as-identifier`".
    `docs/spec_topics/grammar.md:101`, the `ObjectType` production; `:109`, the
    "**Inline object types.**" paragraph, which also assigns
    `theta/parse/wire-name-collision` and `theta/parse/redundant-wire-name` to
    the inline object (0052's subject) and states the `$defs` hoist.
    `docs/reference/grammar.md:203–205`, the mirror bullet.
    `docs/spec_topics/schemas.md:39`, the `as "WireName"`-only-mechanism
    sentence.
  - **The registered rows** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:19`,
    `theta/parse/binding-case-mismatch`, severity `E`, namespace `parse`,
    *Trigger* "Identifier in a binding / parameter / fn-name / field-name
    position does not start with a lowercase letter or `_`", *Message*
    `binding name must start with a lowercase letter or _`. `:21`,
    `theta/parse/reserved-keyword-as-identifier`, *Trigger* "Reserved keyword
    used in an identifier position", *Message*
    `reserved keyword '<keyword>' cannot be used as an identifier`. Mirrors
    without a *Trigger* column: `docs/reference/diagnostics.md:65` and `:67`.
    Neither row needs a *Message* edit for any input below; whether either
    needs a *Trigger* widening is §Fix (d).
  - **The parse path, and the three places the field name is dropped.**
    - `src/parser/theta-document.ts:3052–3057` — `parseType` returns `string`,
      accumulating `parts: string[]` from the ranged outer tokens. Every token
      range is discarded here, and no start offset is recorded, so the string
      the type checker receives has no position in the file.
    - `src/parser/type-grammar.ts:108–123` — `parseTypeExpression(source:
      string, position, site, rules)`: it re-tokenises that string
      (`tokeniseType`, `:166–219`) and walks the result.
    - `src/parser/type-grammar.ts:160–163` — `interface TypeToken { readonly
      kind: "ident" | "str" | "num" | "punct"; readonly text: string }`. No
      range, and no keyword kind.
    - `src/parser/type-grammar.ts:342–380` — `parseObject`. The field-name
      token is read at `:352`, consumed at `:354` when its kind is `ident`, and
      never stored; a non-`ident` name is skipped outright at `:356–357` (row
      n2). The node it builds (`:379`) carries `fieldTypes` only — the
      `TypeNode` object variant at `:132–157` declares no name list.
    - `src/parser/type-grammar.ts:412–492` — `walkType`. Every diagnostic on
      this path is ranged at the caller's `site.range`: `:431`, `:446`, `:455`,
      and `emptySchemaBodyDiagnostic` at `:474`
      (`src/parser/schema-declarations.ts:63–74`, `range: site.range`).
  - **The four call sites that supply `site.range`, all declaration-ranged** —
    `src/parser/theta-document.ts:6223–6226` (an `fn` parameter type,
    `range: s.range`), `:6230–6235` (a return type), `:6309–6314` (a schema-body
    field type), and `src/parser/params.ts:177–182` (a `params:` field type,
    `range: field.range` — the YAML value node's range). `SchemaFieldSource`
    (`theta-document.ts:538–548`) carries `name`, `typeSource` and an optional
    `wireName`, and no range.
  - **The two shipped emitters this report's face is missing** —
    `src/parser/theta-document.ts:2658–2670` inside `parseSchemaObjectBody`
    (`:2589`), ranged on `nameTok.range`, placed past the last recovery arm and
    guarded on `nameTok.kind === "ident"`; and
    `src/parser/frontmatter.ts:750–761` inside `extractParsedParams` (`:701`),
    ranged on `rangeOf(item.key, …) ?? range` and guarded on
    `isIdentifierShaped(name) && !RESERVED_KEYWORDS.has(name)`. Both carry
    `checkName`'s two-comparison predicate (`src/lexer/lexer.ts:814`). Neither
    is reachable from a type-expression source string.
  - **The lowering path, which recovers the names but no ranges** —
    `src/parser/body-type-lowering.ts:153–173`, `lowerInlineObject`: the field
    name is `entry.slice(0, colon).trim()` (`:166`) over
    `splitTopLevel(body, ",", "angle-and-brace")`. This is the tokenisation
    that agrees with what is lowered, and it is a second, independent parse of
    the same bytes.
  - **The wire surfaces the silence reaches** —
    `src/parser/params.ts:177–212` (the `params:` field lowering and its two
    declaration-ranged sinks), `src/runtime/query-schema-lowering.ts:113–117`
    (`lowerQueryResponseSchema`, whose inline-object root returns the fragment
    directly), and
    `src/extension/production-theta-producer.ts:725–728`
    (`paramsSchema: params.loweredSchema` into the binder envelope).
  - **The witness and its one authorised re-pin** —
    `tests/schema-field-name-case.test.ts`, 46 cells. Its header exclusion block
    (`:104–119`) reads, verbatim: "OUT OF SCOPE, deliberately unrowed — FACE 3,
    the inline object type (`parseObject`, src/parser/type-grammar.ts),
    reachable in any `Type` position: `fn h(p: { Ys: string })`,
    `schema S { a: { Ys: string } }`, a `params:` right-hand side.
    docs/reference/grammar.md:203 makes it the same `Field` production
    ("`ObjectType` fields reuse the object-schema `Field` form"), so it is
    inside the *Trigger*'s reading; it is left unimplemented for an engineering
    reason, not read out of the rule. `TypeToken` (src/parser/type-grammar.ts)
    is `{ kind, text }` with no range, and every diagnostic on that path is
    ranged at the caller's `site.range`, so a field-name-precise range there
    needs a structural change. Following bug 0139's precedent at this file's
    sibling position (tests/fn-param-name-case.test.ts:72–76), the excluded face
    carries NO ROW: a row asserting `[]` would red permanently against a later
    fix that closes it. Row f7 is the one place face 3 is visible here —
    `schema S by Kind = …` reaches the ALIAS right-hand side, whose inline arms
    are parsed by `parseObject`, which is why f7 stays `[]` while f1's braced
    body does not." Row f7 at `:540–553` is therefore the only cell that
    observes this face and the only cell a fix here may re-pin.
    `tests/fn-param-name-case.test.ts:72–78` is the precedent that discipline
    comes from. `tests/fn-param-name-reserved-keyword.test.ts:840` pins
    `schema S { let: string }` at the schema-BODY field name (0153's position),
    not this one.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is 34 files, both
    committed `.thetalib` files walked explicitly. **Zero** inline object types
    with an uppercase-first or reserved field name; the corpus contains exactly
    one inline object type of any kind,
    `tests/live/acceptance/fixtures/acc-typed-inline.theta:14`
    (`let r: { ok: boolean, label: string } = @`…`?`), both fields
    lowercase-first. Across all of `tests/`, `src/` and `docs/` the only theta
    SOURCE occurrence of an uppercase-first inline-object field name is
    `tests/schema-field-name-case.test.ts:548` — row f7's fixture
    `schema S by Kind = { Kind: "a" } | { Kind: "b" }` — plus its own header
    prose at `:106`. Every other regex hit is a TypeScript object literal
    (`$defs` maps, `TypeEnv` records). Zero reserved-spelling inline field names
    anywhere. GOV-15: every input below loads with no `E`-severity diagnostic at
    0.82.0, so all are inside the
    [loads-cleanly](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
    set (`source-language-stability.md:9`), and the
    [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
    (`:16`) disposes of the newly-emitting set "in-scope as an addition for
    inputs newly brought into the code's emission set".
- **Observed at:** `0.82.0` (HEAD `fe106bb3`). Offline, deterministic; no live
  model, no provider. Every row through `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) driving the shipped `parseThetaDocument`,
  frontmatter `---\nmode: subagent\n---` on lines 1–3 so the source under test
  sits on line 4; `.thetalib` rows pass `path = "lib.thetalib"` with no
  frontmatter. Diagnostic lists are the whole unfiltered `doc.diagnostics` in
  emission order, each range as `line:col-line:col`. Lowered documents are
  `doc.frontmatter.params.loweredSchema` verbatim; the query-root row calls
  `lowerQueryResponseSchema` directly. "registers" is
  `doc.frontmatter !== null` together with a zero error-severity count — the
  frontmatter gate at `src/parser/frontmatter.ts:1262–1264` withholds the whole
  frontmatter object when any frontmatter diagnostic is error-severity.
  **Measurement hygiene:** a sibling orchestrator fixing bug 0081 held
  uncommitted edits to `src/parser/type-compat.ts` and
  `src/parser/static-type-inference.ts` during part of this session, later
  withdrawn. Neither file is cited above and neither emits any code appearing in
  any row below. `src/parser/type-grammar.ts` was verified blob-identical to
  HEAD throughout, every row was measured twice — once before those edits
  existed and once while they were present — with identical output, and the
  tracked tree at the close of this filing is identical to HEAD (`git diff HEAD`
  empty, `git status --short` carrying this document alone). Six scratch vitest
  files, run on the outputs quoted below, then deleted. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

## Summary

`lexical.md:16` requires a lowercase-first first letter for a schema field
name. `grammar.md:101`/`:109` and its mirror `docs/reference/grammar.md:203`
make an inline object type's fields the same `Field` production as an
object-schema body's, carrying "the same field semantics". The registered
*Trigger* (`code-registry-parse.md:19`) names "a … field-name position" with no
spelling qualifier. Bug 0149's fix (0.82.0) enforced the rule at the
object-schema body's field name and at the `params:` frontmatter key and
recorded this third face as inside the *Trigger* by rule but unimplemented.

It is unimplemented at every `Type` position. `fn h(p: { Ys: string })`,
`schema S { a: { Ys: string } }`, `fn h(): { Ys: string }`, `schema S = { Ys:
string }`, `schema S { a: array<{ Ys: string }> }`, `schema S { a: { Ys: string
} | null }`, a `params:` right-hand side `p: { Ys: string }` and
`schema S by Kind = { Kind: "a" } | { Kind: "b" }` each report `[]` and
register. The reserved-keyword rule (`lexical.md:20`) is unreachable at the
identical slot: all 18 spellings probed report `[]`, `let` among them — the same
`let` that draws `theta/parse/reserved-keyword-as-identifier` when written one
slot to the right, in the field's TYPE position. Two rules meet in one slot and
neither has an enforcer there.

The cause is that the field name is discarded three times before any check
could read it. `parseType` (`theta-document.ts:3052`) stringifies the type
expression out of the ranged outer token stream and records no offset;
`tokeniseType` (`type-grammar.ts:166`) re-tokenises that string into
`TypeToken`s that carry no range and have no keyword kind (`:160–163`); and
`parseObject` (`:342–380`) reads the name token at `:352`, consumes it at
`:354`, and stores nothing — the `TypeNode` object variant (`:132–157`) carries
field TYPES only. Every diagnostic on the path is consequently ranged at the
caller's `site.range`, which at all four call sites is a declaration
(`theta-document.ts:6223–6226`, `:6230–6235`, `:6309–6314`;
`params.ts:177–182`).

The silence is not confined to the diagnostic channel. A second, independent
parse recovers the field names for lowering by string-slicing
(`body-type-lowering.ts:166`), so `params: p: { Xs: string }` lowers to a
`$defs` entry with the property key `Xs` and `required: ["Xs"]`, which
`production-theta-producer.ts:725–728` hands to the binder and the provider;
`lowerQueryResponseSchema` does the same at the response-schema root; and
`{ let: string }` lowers to the property key `let`. `schemas.md:39` names the
`as "WireName"` rename as the only mechanism for a property name that is not
theta-identifier-compatible, and no rename is written in any of these rows.

## Reproduction

Offline, deterministic, at HEAD `fe106bb3`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`. Each cell
is the whole diagnostic list in emission order, unfiltered. Frontmatter
`---\nmode: subagent\n---` on lines 1–3 except where the source is itself
frontmatter.

### (a) The case rule at every inline position, with conformant controls

| # | source | diagnostics | registers |
|---|---|---|---|
| i1 | `fn h(p: { Ys: string }): number { 1 }` | `[]` | yes |
| i2 | `schema S { a: { Ys: string } }` | `[]` | yes |
| i3 | `fn h(): { Ys: string } { 1 }` | `[]` | yes |
| p2 | `---\nmode: subagent\nparams:\n  p: { Ys: string }\n---\n1\n` | `[]` | yes |
| f7 | `schema S by Kind = { Kind: "a" } \| { Kind: "b" }` | `[]` | yes |
| a1 | `schema S = { Ys: string }` | `[]` | yes |
| g1 | `schema S { a: array<{ Ys: string }> }` | `[]` | yes |
| u1 | `schema S { a: { Ys: string } \| null }` | `[]` | yes |
| tl1 | `fn h(p: { Ys: string }): number { 1 }` as `lib.thetalib`, no frontmatter | `[]` | n/a |
| n9 | `schema S { a: { Ys: string, Ys: string } }` | `[]` | yes |
| r8 | `schema S { a: { Ys: string, Zs: number } }` | `[]` | yes |
| w2 | `schema S { a: { Ys as "w": string } }` | `[]` | yes |

Controls, the same shapes with a conformant spelling — all `[]`, all register,
so no row above is explained by a harness that reports nothing:

| # | source | diagnostics |
|---|---|---|
| i1c | `fn h(p: { ys: string }): number { 1 }` | `[]` |
| i2c | `schema S { a: { ys: string } }` | `[]` |
| i3c | `fn h(): { ys: string } { 1 }` | `[]` |
| p2c | `---\nmode: subagent\nparams:\n  p: { ys: string }\n---\n1\n` | `[]` |
| f7c | `schema S by kind = { kind: "a" } \| { kind: "b" }` | `[]` |
| a1c | `schema S = { ys: string }` | `[]` |
| w3 | `schema S { a: { ys as "w": string } }` | `[]` |

Row f7 is the fixture of the one witness cell that observes this face
(`tests/schema-field-name-case.test.ts:548`). Rows n9, r8 and w2 bound the
multiplicity and the rename interaction: two ill-cased fields in one inline
object draw nothing, a repeat draws nothing (0052's subject), and a rename on
the ill-cased field draws nothing — where the same rename at the object-schema
body's field name does fire (row k7 below).

### (b) The enforced controls — 0149's fix and its siblings are live on this HEAD

| # | source | diagnostics | registers |
|---|---|---|---|
| k1 | `schema S { Xs: string }` | `error theta/parse/binding-case-mismatch @4:12-4:14: binding name must start with a lowercase letter or _` | yes |
| k2 | `---\nmode: subagent\nparams:\n  Topic: string\n---\n1\n` | `error theta/parse/binding-case-mismatch @4:3-4:8: …` | **no** |
| k3 | `fn h(P: string): number { 1 }` | `error theta/parse/binding-case-mismatch @4:6-4:7: …` | yes |
| k4 | `let P = 1` | `error theta/parse/binding-case-mismatch @4:5-4:6: …` | yes |
| k5 | `fn h(let: string): number { 1 }` | `error theta/parse/reserved-keyword-as-identifier @4:6-4:9: reserved keyword 'let' cannot be used as an identifier` | yes |
| k7 | `schema S { Xs as "w": string }` | `error theta/parse/binding-case-mismatch @4:12-4:14: …` | yes |

k1 is 0149's face 1, k2 its face 2, k3 bug 0139's position, k4 the lexer's own
`let` arm, k5 bug 0148's position. Every cell in (a) is therefore attributable
to the inline position rather than to a harness that has stopped reaching the
parser. k2 is the only row in this document whose theta fails to register: the
`params:` face's diagnostic is a frontmatter diagnostic, and
`frontmatter.ts:1262–1264` withholds the whole frontmatter object on any
error-severity frontmatter diagnostic. Every row in (a) registers.

### (c) The reserved-keyword rule at the identical slot

`fn h(p: { <k>: string }): number { 1 }`, one row per spelling — every cell
`[]`:

| spellings probed | diagnostics |
|---|---|
| `let` `fn` `if` `for` `in` `match` `schema` `enum` `as` `by` `true` `null` `Ok` `Err` `Result` `string` `array` `void` | `[]` (18 of 18) |

The same spelling at the other inline positions:

| # | source | diagnostics | registers |
|---|---|---|---|
| c1 | `schema S { a: { let: string } }` | `[]` | yes |
| c2 | `---\nmode: subagent\nparams:\n  p: { let: string }\n---\n1\n` | `[]` | yes |
| c3 | `fn h(p: { Ok: string }): number { 1 }` | `[]` | yes |

`tokeniseType` (`type-grammar.ts:208–215`) has no keyword set, so at this slot
`Ok` / `Err` / `Result` present as `kind: "ident"` exactly as `Ys` does. This is
what makes the arm precedence a fix obligation rather than a free consequence
of the guard (§Fix (c)): at the object-schema body the outer lexer's
`kind: "keyword"` classification excludes them structurally, and here nothing
does.

### (d) The NAME slot against the TYPE slot of the same inline field

| # | source | diagnostics |
|---|---|---|
| r1 | `schema S { a: { ys: let } }` | `error theta/parse/reserved-keyword-as-identifier @4:1-4:28: reserved keyword 'let' cannot be used as an identifier` |
| r2 | `schema S { a: { let: string } }` | `[]` |
| r3 | `---\nmode: subagent\nparams:\n  p: { ys: let }\n---\n1\n` | `error theta/parse/reserved-keyword-as-identifier @4:6-4:17: …` |
| r4 | `---\nmode: subagent\nparams:\n  p: { let: string }\n---\n1\n` | `[]` |
| r5 | `fn h(p: { ys: let }): number { 1 }` | `[]` |
| n1 | `schema S { a: { Cat: string } }` | `[]` |
| n1b | `schema S { a: { ys: Cat } }` | `error theta/parse/unresolved-named-type @4:1-4:28: unresolved named type 'Cat'` |

r1 and r3 are bug 0044's shipped sink (`params.ts:195–203`, classifier at
`:559–565`), reached through the LOWERING of the field's type; r5 shows the
`fn` parameter position has no lowering and therefore no sink. n1/n1b are the
same contrast under `unresolved-named-type`. A fix at the NAME slot must leave
all five unchanged.

### (e) What IS enforced inside an inline object, and how it is ranged

| # | source | diagnostics |
|---|---|---|
| n3 | `schema S { a: {} }` | `error theta/parse/empty-schema-body @4:1-4:19: '{}' has no fields; an empty schema cannot be validated.` |
| n7 | `schema S { a: { ys: void } }` | `error theta/parse/void-in-non-return-position @4:1-4:29: 'void' is only permitted as a function or theta return type` |
| n8 | `schema S { a: { ys: Result<string, string> } }` | `error theta/parse/result-in-schema-position @4:1-4:47: 'Result' has no lowered-schema form and is not permitted in a schema-feeding position` |
| n2 | `schema S { a: { 3: string } }` | `[]` |

Every rule that does reach this leaf is ranged at the whole declaration:
`@4:1` in each of n3, n7, n8, and `@4:1` in n1b and r1 above. n3 is bug 0045's
shipped emission, whose §Fix adjudicated that range in terms. n2 is the
non-`ident` field name `parseObject:356–357` skips outright.

The declaration extent each caller passes as `site.range`, measured on the four
positions' own shapes by forcing a `walkType` emission with a `void` field type
— these are the ranges a declaration-ranged emission of this report's code
would carry (§Fix (b) route 2):

| # | source | `void-in-non-return-position` range |
|---|---|---|
| d1 | `fn h(p: { ys: void }): number { 1 }` | `@4:1-4:36` |
| d2 | `fn h(): { ys: void } { 1 }` | `@4:1-4:27` |
| d3 | `schema S { a: { ys: void } }` | `@4:1-4:29` |
| d4 | `---\nmode: subagent\nparams:\n  p: { ys: void }\n---\n1\n` | `@4:6-4:18` |

d1–d3 are the whole statement. d4 is the YAML VALUE node, not the whole
frontmatter field — `params.ts:177–182` passes `field.range`, which is why the
`params:` face's declaration-ranged answer is narrower than the other three and
still not the field name.

### (f) The wire schemas

`loweredSchema` verbatim, `$defs` slug elided where irrelevant:

| # | source | lowered |
|---|---|---|
| L1 | `params:\n  p: { Xs: string }` | `{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_283407a2f58442fd"}},"required":["p"],"additionalProperties":false,"$defs":{"__inline_283407a2f58442fd":{"type":"object","properties":{"Xs":{"type":"string"}},"required":["Xs"],"additionalProperties":false}}}` |
| L2 | `params:\n  p: { xs: string }` | same shape with `"properties":{"xs":{"type":"string"}},"required":["xs"]` |
| L3 | `params:\n  p: { Xs: { Ys: string } }` | two `$defs` entries: the outer `"properties":{"Xs":{"$ref":"#/$defs/__inline_8af9509fd571555f"}},"required":["Xs"]` and the inner `"properties":{"Ys":{"type":"string"}},"required":["Ys"]` |
| L5 | `params:\n  p: { let: string }` | `"properties":{"let":{"type":"string"}},"required":["let"]` |

The query response-schema root, through `lowerQueryResponseSchema` directly:

| # | annotation | lowered |
|---|---|---|
| L4 | `{ Ys: string }` | `{"type":"object","properties":{"Ys":{"type":"string"}},"required":["Ys"],"additionalProperties":false}` |
| L4c | `{ ys: string }` | `{"type":"object","properties":{"ys":{"type":"string"}},"required":["ys"],"additionalProperties":false}` |
| L4k | `{ let: string }` | `{"type":"object","properties":{"let":{"type":"string"}},"required":["let"],"additionalProperties":false}` |

L1's `Xs` and L4's `Ys` are the property keys the provider sees. Both load with
zero diagnostics and both thetas register. L3 shows the leak at depth: the
uppercase key appears at both levels. L5 and L4k are the reserved-spelling
counterparts.

### (g) The corpus

`git ls-files -- '*.theta' '*.thetalib'` → 34 files. PCRE2 scan for an inline
object type whose first field name is uppercase-first or a reserved spelling:
zero hits. Scan for an inline object type of any kind: one hit,
`tests/live/acceptance/fixtures/acc-typed-inline.theta:14`, both fields
lowercase-first. Across `tests/`, `src/`, `docs/spec_topics/`,
`docs/reference/` and `docs/examples/`: the only theta-source occurrence of the
shape is `tests/schema-field-name-case.test.ts:548` (row f7's fixture) and its
header prose at `:106`.

## Expected behaviour

An inline object type's field name is a schema field name
(`grammar.md:101`/`:109`, `docs/reference/grammar.md:203`), so `lexical.md:16`
applies to it and `lexical.md:18` makes a violation
`theta/parse/binding-case-mismatch` — the code whose registered *Trigger*
already names "a … field-name position". Each of rows i1, i2, i3, p2, f7, a1,
g1, u1, tl1 and w2 should draw that code, once per ill-cased field name, in
source order; rows n9 and r8 should draw it twice. Each conformant control in
(a) should stay `[]`. The theta should not register, on the same footing as
`schema S { Xs: string }` (row k1) — which for the `params:` face means the
frontmatter gate at `frontmatter.ts:1262–1264` withholds the object exactly as
it does for row k2.

The wire schemas follow from the refusal: a refused theta lowers nothing, so
L1's `properties.Xs`, L3's two levels and L4's root are unreachable rather than
sanitised. No lowering changes.

The reserved-keyword rule (`lexical.md:20`) is written with no position
qualifier and its *Trigger* names none, so `{ let: string }` and
`{ Ok: string }` are in a refused set too. Which of the two codes each such
input draws is not settled by the two spec sentences alone and is §Fix (c)'s
subject; what is settled is that a keyword-shaped inline field name must not
draw `binding-case-mismatch`, since at every position where these rules are
enforced today the keyword arm claims the spelling first.

Rows r1, r3, n1b (the field's TYPE slot, bug 0044's subject), r5, n2, n3, n7,
n8 (rules already reaching this leaf) and (b)'s six enforced controls do not
move.

## Actual behaviour / root cause

The check cannot be written where it belongs because the field name does not
survive to any position-aware seam, and no seam on the path has a range for it.
Three independent discards, in order:

1. **`parseType` stringifies the ranged token stream.**
   `src/parser/theta-document.ts:3052–3057` builds `parts: string[]` from the
   outer lexer's tokens and returns the joined `string`. The outer tokens carry
   ranges; the returned string carries none, and no start offset is captured at
   any call site — `:2671` is `const typeSource = this.parseType(true);`, and
   `SchemaFieldSource` (`:538–548`) stores that string with no range beside it.
2. **`tokeniseType` re-tokenises the string into range-less tokens.**
   `src/parser/type-grammar.ts:166–219` produces `TypeToken`s declared at
   `:160–163` as `{ kind: "ident" | "str" | "num" | "punct"; text: string }`.
   There is no range field, and there is no `keyword` kind — the ident scan at
   `:208–215` classifies every identifier-shaped run as `ident`, reserved
   spellings included.
3. **`parseObject` discards the name token without storing it.**
   `src/parser/type-grammar.ts:342–380`. The loop peeks the name at `:352` and
   consumes it at `:354` when `kind === "ident"`; a non-`ident` name is consumed
   and skipped at `:356–357`. Nothing is recorded: the node built at `:379` is
   `{ kind: "object", fieldTypes, interiorHasTokens, braceClosed }`, and the
   `TypeNode` object variant at `:132–157` declares no name list. The optional
   `as "WireName"` skip at `:367–372` also discards the wire half.

`walkType` is therefore the only checker on this path and it has neither a name
nor a range to work with. Every diagnostic it pushes is ranged at
`site.range` — `:431`, `:446`, `:455`, and `emptySchemaBodyDiagnostic` at
`:474` (`schema-declarations.ts:63–74`) — and every one of the four callers
supplies a declaration range: `theta-document.ts:6223–6226` and `:6230–6235`
pass `s.range` (the whole `fn` statement), `:6309–6314` passes `s.range` (the
whole `schema` declaration), and `params.ts:177–182` passes `field.range` (the
YAML value node). Rows n3, n7, n8, n1b and r1 are that range, measured:
`@4:1-4:19`, `@4:1-4:29`, `@4:1-4:47`, `@4:1-4:28`, `@4:1-4:28`.

The two shipped emitters of this report's code are unreachable from here by
construction. `parseSchemaObjectBody`'s arm
(`theta-document.ts:2658–2670`) fires on `nameTok`, a token of the OUTER
stream, and runs before `parseType` is called on the same field (`:2671`); the
inline object's field names are inside the string that call returns.
`extractParsedParams`'s arm (`frontmatter.ts:750–761`) fires on the YAML key
node and never sees the value's type source. The comment at
`theta-document.ts:2650–2653` records that the outer arm is guarded on `ident`
precisely so that a keyword-shaped name falls to a different rule — a
distinction the inline tokeniser cannot express at all.

The names DO survive, in a different parse. `lowerInlineObject`
(`src/parser/body-type-lowering.ts:153–173`) re-splits the same bytes with
`splitTopLevel(body, ",", "angle-and-brace")` and takes the name as
`entry.slice(0, colon).trim()` (`:166`). That is the tokenisation whose output
becomes the wire schema, which is why the uppercase key reaches `$defs`
(rows L1, L3) and the response-schema root (row L4) while the diagnostic
channel stays empty. It carries no ranges either, so it is a name source, not a
range source.

## Why it matters

- **A spelling the spec refuses loads and registers**, at eight measured
  positions including both `.theta` and `.thetalib` (rows i1–i3, p2, f7, a1,
  g1, u1, tl1). The rule that refuses it is enforced four other places on the
  same HEAD (rows k1–k4).
- **The uppercase key reaches the provider-facing JSON Schema with no rename
  written.** Row L1 lowers `params: p: { Xs: string }` to
  `"properties":{"Xs":{"type":"string"}},"required":["Xs"]` inside a `$defs`
  entry that `production-theta-producer.ts:725–728` hands to the binder
  envelope; row L4 puts `Ys` at the response-schema root. `schemas.md:39` names
  the `as "WireName"` rename as "the only mechanism" for a property name that
  is not theta-identifier-compatible and lists PascalCase first among the
  examples. This is the same harm axis 0149's face 2 closed — with one
  difference measured here: face 2's refusal withholds the frontmatter object
  (row k2 does not register), whereas every row in (a) registers, so the leak
  is not gated by a load refusal.
- **The two positions disagree over the identical bytes.**
  `schema S { Xs: string }` is refused (row k1); `schema S { a: { Xs: string } }`
  is accepted. `grammar.md:109` says the two carry "the same field semantics".
  An author moving a field into a nested shape loses the check.
- **The rule's enforcement is now discontinuous in a way the author cannot
  predict from the spec.** The same identifier is refused as a `let` binding
  (k4), as an `fn` parameter (k3), as an object-schema field (k1) and as a
  `params:` key (k2), and admitted one brace deeper. Bug 0149's H1 was written
  against exactly this reasoning for its own three faces.
- **Two rules are absent from one slot, and the slot cannot tell them apart.**
  `tokeniseType` has no keyword kind, so a fix that enforces the case rule here
  on an `ident` guard alone would draw `binding-case-mismatch` on
  `{ Ok: string }` (row c3) — the defect 0149's review loop found and removed at
  its face 2, where the same guard shape had the same blind spot. The cost of
  leaving this face open is therefore not only the missing refusals but a live
  trap for the fix.
- **The corpus cost of closing it is one witness row.** Zero committed
  `.theta` / `.thetalib` files carry the shape and the only theta-source
  occurrence in the tree is row f7's fixture, which 0149 authorised this fix to
  re-pin.

## Non-goals

- **A repeated field name inside an inline object**, and the wire-name rules
  `grammar.md:109` assigns to the inline object. Measured here and left with
  open [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md):
  row n9 (`{ Ys: string, Ys: string }`) draws nothing, and the rename clause is
  not honoured at all — `params: p: { Ys as "w": string }` lowers to the
  property key `Ys as "w"` with `required: ["Ys as \"w\""]`, which 0052 already
  records at its §Reproduction G1. A fix here must read the name in a way that
  does not make that key worse, but the rename and duplicate rules are 0052's.
- **The reserved-keyword rule at 0153's six positions.**
  [0153](./0153-reserved-keyword-remaining-identifier-positions.md) claims the
  `for` / `par for` variable, the object-schema body field name, the `params:`
  key, the `enum` variant and the two `import` specifier slots. This report
  claims neither those positions nor its adjudications; it claims one position
  0153 declines in terms, and §Fix (c) settles only which code an input at THAT
  slot draws.
- **The field's TYPE slot.** Rows r1, r3, r5, n1b and n2 belong to bug 0044
  (fixed) and to the shipped `walkType` checks; a fix here must leave them
  byte-unchanged.
- **The lowered output for any input that is not newly refused.** Bug 0039's
  freeze on the `params:` position's lowering holds: no route in §Fix edits a
  lowerer.
- **A `Message` reword or a second registered code** for the inline case.
  DIAG-4 defers wording to theta 2.0, and the *Message* of both candidate rows
  is unplaceholdered on this input class.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `src/parser/type-grammar.ts`; that is bug 0134's adjudicated do-not-chase
  class. 0052's stale `type-grammar.ts` citations are named in §Related and are
  not corrected by this filing.
- **Repairing the declaration-ranged emissions already at this leaf.** Rows n3,
  n7, n8 range at the whole declaration by adjudication (bug 0045's §Fix). If
  §Fix (b) route 1 lands, tightening those ranges too is a separate change with
  its own DIAG-4 and witness consequences.

## Fix

Not settled. The routes below are constraint-pinned; the run selects and states
its choice.

**(a) Where the field name is read.** The name must reach a checker, and the
three candidates differ in what else they move.

- *Route 1 — retain the name on `TypeNode`.* `parseObject` records the field
  name alongside its type (`type-grammar.ts:379`, the variant at `:132–157`),
  and `walkType`'s object arm (`:467–481`) tests it. Smallest reader change;
  the range question (b) is then unavoidable, because the token this route
  retains has none.
- *Route 2 — check at the object-schema-body parser leaf instead.* Not
  available: the inline object's field names are inside the string
  `parseType` returns (`theta-document.ts:2671`), and the arm at `:2658–2670`
  runs before that call on a token of the outer stream. Recorded so the run
  does not re-derive it.
- *Route 3 — run over the interior tokenisation the lowerers use.*
  `splitTopLevel(body, ",", "angle-and-brace")` plus `topLevelColon`, the split
  `lowerInlineObject` (`body-type-lowering.ts:161–171`) already performs. This
  is the tokenisation that agrees with what is lowered, which is the property
  0052's §Fix constraint 4 selects it for; it also inherits the rename
  mis-split that produces the `Ys as "w"` key (§Non-goals), so a check reading
  names from it must state what it does with a name containing ` as `.

Whichever is chosen, the check runs at every `Type` position and at every
nesting depth — rows i1, i2, i3, p2, f7, a1, g1, u1, tl1, L3's inner level —
and produces one diagnostic per ill-cased field name in source order (rows n9,
r8 expect two).

**(b) The range.** This is the decision 0149's doc called "where the D2
estimate breaks", and both answers are admissible.

- *Route 1 — `TypeToken` gains a range.* More than adding a field:
  `parseTypeExpression` receives a bare `string` (`type-grammar.ts:108–114`)
  whose position in the file is nowhere recorded, so a real range must be
  reconstructed from a base offset threaded from each of the four callers
  (`theta-document.ts:6223–6226`, `:6230–6235`, `:6309–6314`;
  `params.ts:177–182`), and `parseType` (`theta-document.ts:3052–3057`) must
  begin recording where its accumulated text started. Ranges reconstructed this
  way are exact only if the stringification is byte-faithful to the source,
  which it is not required to be today. A run taking this route must measure
  the reconstructed range against the source, not derive it.
- *Route 2 — emit at the caller's `site.range`, i.e. declaration-ranged.* The
  established convention at this exact seam: rows n3, n7, n8, n1b and r1 are
  all `@4:1`, and bug 0045's §Fix adjudicated it in terms for the same object
  arm ("the diagnostic's range locates the occurrence (at the schema-field
  position that range is the declaration's …)"). Costs: a declaration carrying
  two ill-cased inline field names produces two diagnostics at one range (row
  r8), the author is not pointed at the field, and diagnostic ORDER within a
  declaration is no longer separable by column — the assemble sort is
  `(file, line, col)` with a stable sort, so same-range diagnostics keep
  emission order and any witness must assert that order rather than tolerate
  it.
- The choice is a precision-loss adjudication, not a preference. State it, and
  pin the chosen range in the witness on a row where the two answers differ.
  Rows d1–d4 measure what route 2 would emit at each of the four positions
  (`@4:1-4:36`, `@4:1-4:27`, `@4:1-4:29`, `@4:6-4:18` on those shapes); route 1
  would emit at the field-name token instead, so the pin must assert the chosen
  one explicitly rather than accept either.

**(c) The reserved-keyword arm — binding, whichever route (a) takes.** A
keyword-shaped inline field name must not draw
`theta/parse/binding-case-mismatch`. At every position where these rules are
enforced today the keyword arm claims the spelling first: `checkName`
(`src/lexer/lexer.ts:814`) pushes and returns before its first-letter test, bug
0148's `parseFn` arm tests the keyword kind ahead of the case arm, face 1 is
guarded on `nameTok.kind === "ident"` (`theta-document.ts:2658`) and face 2 on
`!RESERVED_KEYWORDS.has(name)` (`frontmatter.ts:750`). This slot has no
structural guard to inherit, because `tokeniseType` has no keyword kind
(`type-grammar.ts:208–215`) — so the run must add set membership against the
lexer's own exported `reservedKeywords()`, imported the way
`src/parser/params.ts:35`/`:441` already imports it, and then say which of two
things happens on `{ Ok: string }` and `{ let: string }` (rows c1, c2, c3, and
all 18 of (c)):

- *Disposition A — silent, handed to 0153's family.* Matches what both closed
  faces do today (0149's rows f6, f14, p4, p7, p8). Costs nothing here and
  leaves the class where 0153 has declined it, so it stays unclaimed by any
  report.
- *Disposition B — `reserved-keyword-as-identifier` at this position too.*
  Consistent with `lexical.md:20`'s unqualified sentence and with the shipped
  declaration-ranged emission of that same code from a lowering sink at the
  `params:` position (`params.ts:195–203`, row r3), which is a precedent for
  both the code and the range. Costs: it claims part of 0153's rule at a
  position 0153 excluded, so the two reports' *Trigger* readings must be stated
  as consistent.

Either way, rows r1, r3, r5, n1b (the TYPE slot) do not move.

**(d) Registry (DIAG-2).** Whether either row needs an edit is decided by
reading the *Trigger*, not assumed. `code-registry-parse.md:19` already reads
"Identifier in a binding / parameter / fn-name / field-name position", which
0149's fix took as covering this face without a table edit; if the run agrees,
no registry edit is made and DIAG-2 is satisfied by the existing row. If
disposition B is taken in (c), `:21`'s *Trigger* ("Reserved keyword used in an
identifier position") likewise already covers it. Any *Trigger* change that IS
made is a spec change under
`docs/spec_topics/diagnostics/diagnostic-shape.md:72` and lands in the same
commit as the code, with the mirror rows
(`docs/reference/diagnostics.md:65`, `:67`) in lock-step. No *Message* edit
under any route (DIAG-4, `diagnostic-shape.md:74`).

**(e) Witness obligations.**

- **Row f7 of `tests/schema-field-name-case.test.ts:540–553` is re-pinned, and
  it is the only cell in that file a fix here may touch.** Its comment records
  the authorisation. The rest of that file's contract is 0149's; the header
  block at `:104–119` names this face unrowed and must be corrected in the same
  commit so it no longer describes a face that is closed.
- **A new witness file carries this face's rows**, on
  `tests/schema-field-name-case.test.ts`'s shape: whole-list ordered `toEqual`
  over unfiltered `doc.diagnostics`, every expected *Message* read through
  `parseRegistry` / `registryMessage` (DIAG-4), `parseDoc` from
  `tests/helpers/e2e-s1.ts`. Minimum rows: every cell of §Reproduction (a)
  including its controls, (c)'s 18 spellings collapsed to at least `let`, `Ok`
  and `void`, (d)'s five TYPE-slot rows as over-reach tripwires, (e)'s four
  already-enforced rows as re-pins, and (f)'s lowering rows in whichever
  direction the refusal leaves them.
- **The `.thetalib` route** (row tl1) is rowed explicitly:
  `lexical.md:3` opens "`.theta` and `.thetalib` files are decoded and
  normalised before lexing; every other rule on this page … operates on the
  post-normalisation" stream, so the page's rules bind both extensions, and
  `tests/committed-fixture-parse-gate.test.ts:55` collects `.theta` only
  (`entry.name.endsWith(".theta")`; open bug 0132).
- **Both directions proven.** Neutralise the new emission and confirm the new
  rows red and only they; restore and confirm green.

**(f) Blast radius.** Zero committed `.theta` / `.thetalib` files carry the
shape (§Reproduction (g)), so `tests/committed-fixture-parse-gate.test.ts`
takes no new refusal. The only theta-source occurrence in the tree is row f7's
fixture. GOV-15's diagnostic-registry carve-out
(`docs/spec_topics/governance/source-language-stability.md:16`) disposes of the
newly-emitting inputs as an addition; every one of them loads with no
`E`-severity diagnostic at 0.82.0 (`:9`).

**Fix ordering.** Nothing blocks this report from starting. It shares
`parseObject` with open
[0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md): both
need the field name to survive to a check at every `Type` position, both name
the same three routes, and whichever lands second reuses the retention the
first builds or rebases it. Neither is a prerequisite of the other. Row f7's
re-pin is this report's alone; no other cell of
`tests/schema-field-name-case.test.ts` moves.

## Provenance

Filed as face 3 of the bug 0149 fix (0.82.0, commit `bfa5ae84`). 0149's fix
report (`.pi/tmp/fixes/0149-report.md`) records it in the §"Face-set decision"
table as **OUT** and as Residual 1; 0149's own `## Fix (0.82.0)` record states
the disposition, the cause, and the two admissible routes, and authorises
exactly one witness row (f7) to be re-pinned by the fix that closes it.

Independently re-derived at HEAD `fe106bb3` for this filing, not copied from
0149's measurements: five scratch vitest probes over `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) and one direct call to
`lowerQueryResponseSchema`, covering every row in §Reproduction (a)–(f), then
deleted. Every `src/`, `tests/` and spec citation above was re-verified against
the tree at HEAD. Two citations 0149's own artefacts got wrong are corrected
here: the "`ObjectType` fields reuse the object-schema `Field` form" quotation
is `docs/reference/grammar.md:203` (the mirror), not
`docs/spec_topics/grammar.md:203` (a continuation-trigger table row); the spec
source of the same claim is `docs/spec_topics/grammar.md:109`, the line
`src/parser/body-type-lowering.ts:146` already cites. The frontmatter
registration gate 0149's report cites at `frontmatter.ts:1217` is `:1262–1264`
at this HEAD, its own disclosed +45 drift.

A sibling orchestrator fixing bug 0081 held uncommitted edits to
`src/parser/type-compat.ts` and `src/parser/static-type-inference.ts` during
part of the measurement session, later withdrawn.
`src/parser/type-grammar.ts` was verified blob-identical to HEAD, neither
modified file is cited here, neither emits any code appearing in any row, every
row was measured both before those edits existed and while they were present
with identical output, and the tracked tree at the close of this filing is
identical to HEAD.

## Coordination note (0.93.0) — the retention this report rebases onto is kept

Append-only; this report's status does not change and none of its rows moves.
Bug 0159 landed §Fix route (a) in 0.93.0, which re-keys
`theta/parse/duplicate-inline-field-name` off the `fieldNames` retention this
report's §Status records. 0159 §Fix route (a) required the run to "state whether
the retention stays on the node for 0154's subject or moves with the rule". The
disposition, settled and recorded in
[0159](./0159-inline-field-name-stop-masks-duplicate.md) `## Fix (0.93.0)`:

- **`fieldNames` STAYS**, unchanged, together with the `namesStopped` latch and
  `carriesUnclosedInterior`, in exactly the shape this report's §Status
  describes — names only, range-free, not index-aligned with `fieldTypes`,
  stopping at an unclosed interior, gated on the spelled closing brace. No
  reshaping, no narrowing, no deletion. The rebase this report plans is intact.
- **Why it stays, in the terms this report needs.** `fieldNames` is the
  theta-side IDENTIFIER list. The lowercase-first rule (`lexical.md:16`) and the
  reserved-keyword rule (`:20`) ask whether a name is a well-formed identifier —
  a question asked of a TOKEN. The duplicate rule now keys on raw, unnormalised
  entry text instead (`splitTopLevel` + `topLevelColon`, pre-colon text after
  `trim()`), which is deliberately NOT an identifier: it can be `"a"`, `'a'`,
  `""` or `a as "w"`. Reading the case rule off that text would test the wrong
  string — the hazard this report's §Fix (a) route 3 and 0160's §Related both
  name. The two lists therefore coexist by design, and the WHY is stated at all
  three sites in `src/parser/type-grammar.ts`.
- **The detection site is unchanged and still free.** `parseObject`'s field loop
  and its non-identifier branch are untouched by 0159's fix: no parser recovery
  moved, and no identifier rule was added at that slot. 0161 §Fix
  *Coordination*'s "whichever lands first owns the site" is therefore still
  open — 0159 did not take it, and this report may.
- **Substrate drift.** `src/parser/type-grammar.ts` is now **923** lines. The
  object `TypeNode` carries a new `interiorSource` field beside `fieldTypes` and
  `fieldNames`, and `TypeToken` carries a `start` source offset; `walkType`'s
  `object` arm derives the duplicate rule's keys through a module-private
  `inlineObjectFieldKeys` helper. Cite by symbol; the line numbers in this
  report's §Affected are one minor old (0134's do-not-chase class).

## Coordination note — bug 0176 took the OTHER site (0.161.0)

[0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md) shipped
its refusal at site (ii) — `walkType`'s `object` arm, over the module-private
`inlineObjectFieldKeys` key list — and deliberately did NOT touch
`TypeParser.parseObject`'s tolerant `else` branch or the `TypeNode.fieldNames`
retention. Both remain available to this report's identifier rules, which need
identifier TOKENS rather than raw entry text. Whichever rule lands next at the
object arm adds itself to that single pass rather than opening a second scan of
the interior. Status unchanged (**open**).
