# Placeholder rendering a

## Placeholder rendering (normative)

The registry's *Message* column carries `<…>` placeholders that the renderer interpolates at the diagnostic site (rule 4 above). This subsection groups every placeholder used by V1 messages into eight categories and fixes one rendering rule per category, so two conformant implementations produce byte-identical strings (or byte-identical surround around an implementation-defined-tail interpolation, for category 8) for the same source defect. Throughout this subsection, *byte-identical* means equal as UTF-8 byte sequences, the comparison basis pinned by [Governance — GOV-15](../governance/source-language-stability.md#gov-15). Each rule below carries normative test vectors; conformance tests asserting on a rendered message MUST match these vectors and SHOULD include the boundary cases called out in *Edge cases* at the end of this subsection. The closed token-name table in category 3 and the closed value tables in category 7 carry the same GOV-7 / GOV-8 governance posture as the category-to-placeholder map itself.

**Closure.** The eight categories below, together with the closure clauses (a)–(g), form the closed theta 1.0.0 placeholder vocabulary. Every placeholder interpolated into the *Message* column of any row across the four [Code registry](./code-registry-parse.md#code-registry) pages — the `theta/parse/*` table on that page and its [`theta/load/*`](./code-registry-load.md), [`theta/runtime/*`](./code-registry-runtime.md), and [`theta/host/*`](./code-registry-host.md) continuation tables — is either (a) a placeholder enumerated in categories 1–7 (rendered byte-identically per its category's rule), (b) a §8 placeholder (rendered as a byte-identical prefix and suffix around an implementation-defined-tail interpolation per §8's rule), other than the parsed-scalar `<observed>` usage carved out in clause (e) below, (c) the bespoke `<list>` placeholder in `theta/runtime/reload-teardown-timeout` (whose row carries an inline rendering rule that decomposes into the §7 sub-rules for `<slash-name>`, `<invocation-id>`, and the comma-space join), (d) the `<failure>` carve-out documented in §8 below (a theta-internally-constructed discriminator whose grammar is pinned at the diagnostic-construction site, not by §8's host-derived rule), (e) the `<observed>` carve-out for the parsed-scalar out-of-range codes documented in §8 below (`theta/load/frontmatter-value-out-of-range` and `theta/load/settings-value-out-of-range`, rendered fully byte-identically by the offending scalar's kind, not by §8's host-derived first-line-truncation rule), (f) the bespoke `<read>` placeholder in `theta/runtime/non-object-receiver` (whose row carries an inline rendering rule for the three read shapes it spans — a stdlib-method call, an indexed access, and a member access — decomposing into §7's identifier-shaped `<method>` sub-rule, category 5's `<field>` sub-rule, and that row's own bare index rendering; the row's companion `<receiver kind>` needs no carve-out, being a §7 closed-enum placeholder admitted via clause (a)), or (g) the bespoke `<binder>` placeholder in `theta/parse/shadowed-callable-call` (whose row carries an inline rendering rule in its own *Trigger* prose: it renders the shadowing binder and its line, e.g. `let binding at line 6`). No placeholder is admitted outside clauses (a)–(g). A `<…>` token that appears in a *Message* template but interpolates nothing — a literal source-grammar spelling copied verbatim rather than a placeholder — is not a placeholder and is outside this closure's scope; see *Literal source-grammar spellings*, below. No gate in the tree enumerates the *Message* column against clauses (a)–(g) at build time; the closure is maintained by the same-commit discipline stated under *Winner rule*, below, and enforced by review on the commit that adds the row. Introducing a new placeholder, retiring one, or moving a placeholder between categories is a spec-versioned breaking change governed by **GOV-7** and **GOV-8** in [`spec.md` — Governance](../../spec.md), exactly as the registry rows themselves are; codifying, in this closure, a placeholder the registry has already rendered since a shipped release is a pure rewording under GOV-8's *Pure rewording* boundary (`req-id-prefix-table-active-b.md`, GOV-8: substantive iff the change alters which inputs are accepted, which outputs are produced, which diagnostics fire, or which invariants hold) — it leaves every rendered byte, every code, and every severity identical, and changes only this paragraph's description of a pre-existing fact. Neither this page nor [`placeholder-rendering-b.md`](./placeholder-rendering-b.md) carries a `**DIAG-N.**` paragraph, so no REQ-ID retires under this reading.

**Winner rule.** When this closure paragraph and a shipped registry row disagree about whether a `<…>` placeholder is admitted, the registry row governs the fact and the closure paragraph is the defect: **DIAG-4** makes each row's *Message* normative and defers wording changes to theta 2.0, so a shipped template cannot move within theta 1.x, and the closure paragraph is brought to describe it instead. This closure is closed against coining a new placeholder, not against describing one the registry already renders. A registry row that introduces a `<…>` placeholder MUST land its category assignment or admission clause in the category lists and closure clauses of this subsection — this page or [`placeholder-rendering-b.md`](./placeholder-rendering-b.md) — in the same commit as the row — the same same-commit discipline **DIAG-2** already imposes on codes, extended to the placeholder vocabulary.

**Literal source-grammar spellings.** This closure's quantifier ranges over placeholders — the `<…>` tokens the renderer interpolates — not over every `<…>` spelling that appears inside a *Message* template. A spelling that reproduces source grammar verbatim interpolates nothing, so it is not a placeholder and this closure does not admit or exclude it. The registry carries three such spellings: `array<T>` (the `theta/parse/non-indexable-receiver` code / template and the `theta/parse/non-array-iterand` code / template), `@<Schema>` (the `theta/parse/explicit-schema-mismatch` code / template and the `theta/parse/empty-query-annotation` code / template), and `invoke<Schema>` (the `theta/parse/invoke-return-type-mismatch` code / template).

**Admitted-but-unrendered names.** A name on a category's *Placeholders* line is admitted even where no *Message* cell on any of the four registry pages currently renders it — a name is permitted to precede its row. `<file>` (category 5, [`placeholder-rendering-b.md`](./placeholder-rendering-b.md#5-source-derived-placeholders)) and `<uuid>` (category 7, [`placeholder-rendering-b.md`](./placeholder-rendering-b.md#7-identifier--descriptor--and-closed-enum-placeholders)) are both in this state today; neither absence is a defect.

### 1. Static-type placeholders

**Placeholders.** `<type>`, `<expected>`, `<actual>`, `<left>`, `<right>`, `<element>`.

**Rule.** Render the Theta static type by re-serialising it in the source-grammar form defined in [Type System](../type-system.md):

- Primitive type names lowercase: `string`, `integer`, `number`, `boolean`, `null`.
- Literal types as their literal source: `"foo"`, `42`, `true`.
- Unions joined by ` | ` (space-pipe-space) with no surrounding parentheses.
- Arrays as `array<T>` (the angle-bracket form; never `T[]`, never `[T]`).
- Named schemas, enums, and type aliases by their theta-side identifier (no wire-name translation; the identifier shape is fixed by [Lexical — Identifiers](../lexical.md)).
- `Result<T, E>` rendered as written, with the inner types recursing this rule.
- Inline anonymous object types as `{ f₁: T₁, f₂: T₂ }`, fields in declaration order, single space after each `:` and after each `,`.
- Where a registered *Trigger* has already decided to emit and the operand's static type is one the parse layer did not determine, render the stand-in token the layer carries in that position, byte-exact, from the closed table below. Where the verdict itself depends on the undetermined type, nothing renders: the compatibility check is skipped per [Type System — *Unresolvable operands*](../type-system.md), and the `for` iterand's and `join` element's own preconditions withhold on the same ground. The two dispositions are not read as competing — one governs a decidable verdict's rendering, the other governs whether a verdict fires at all.

**Undetermined-static-type tokens (closed).** The table below is keyed on the rendered bytes, not on the token's provenance — an engine-fabricated name and an author-written identifier that happens to spell the same bytes render the same admitted token. It carries the same GOV-7 / GOV-8 governance posture this subsection's opening paragraph already gives category 3's closed token-name table and category 7's closed value tables: a sixth stand-in token is not admitted by silence.

| Rendered token | Stands for |
|---|---|
| `<withheld>` | A binder the parse layer cannot type (an unannotated `fn` parameter, a `match`-arm binder); the sentinel `WITHHELD_BINDER_TYPE_NAME` (`src/parser/type-compat.ts`). |
| `index` | An index read whose receiver did not determine as `array<T>`. |
| `object` | An object literal carrying no schema name. |
| `query` | A `query` expression carrying no schema annotation. |
| `unknown` | An element, tail or common type the layer did not determine: a `par for` over a non-`array` iterand, a block expression with no tail expression, or an empty candidate set (`#typeExpr`'s `par-for` and `block` arms, `#commonType`, `#matchArmType` — `src/parser/static-type-inference.ts`). |

A token from this table appearing inside a composite renders through the clauses above and needs no second rule: `array<<withheld>>` via the `array<T>` clause, `array<Result<unknown, QueryError>>` via the `array<T>` and `Result<T, E>` clauses. The second form arises where a `par for` value — [CTRL-3](../control-flow.md#ctrl-3)'s `array<Result<T, QueryError>>`, with `T` undetermined — reaches a typed sink: `let r: integer = par for y in p { y }` over an unannotated parameter renders `expected integer, got array<Result<unknown, QueryError>>`. Because the table is keyed on bytes, a position whose author-written identifier happens to spell a table token renders the same admitted bytes as the engine's own fabrication of that token — a legal `fn index()` call renders `got index`, byte-identical to the fabrication an unresolvable receiver's index read produces.

This clause admits the tokens in the table and nothing else. A rendered name derived from author source text at an undetermined position is not a stand-in token from this table: a callee's or method's own identifier, an `invoke` path, a captured non-`Type` source slice, a binder's own identifier, or an inline object annotation lowered to a pseudo-named form. Where such a name is not a conformant identifier under the `named` clause, it is admitted by no clause of this category, and this subsection fixes no rendering for it. [Bug 0124](../../bugs/0124-parsetype-trailing-punctuation-leniency.md)'s carrier was a captured non-`Type` source slice, [bug 0126](../../bugs/0126-plain-for-binds-no-loop-variable.md)'s was a loop variable's own identifier, and [bug 0130](../../bugs/0130-let-rhs-type-mismatch-declines-object-union.md)'s was an inline object annotation rendered as a pseudo-`named`; all three reports are closed. This class is non-empty: `fn frobnicate(): integer { 1 }` with `for y in frobnicate() { y }` renders `'for' expects array<T> after 'in'; got frobnicate`, and `let s = "ab"` with `for y in s.length() { y }` renders `'for' expects array<T> after 'in'; got length`. Neither is an admitted token of this table.

**Test vectors.**

- A binding typed `array<integer | string>` renders as `array<integer | string>`.
- A binding typed `Foo | null` renders as `Foo | null`.
- A condition on an array built from an unannotated `fn` parameter renders `condition must be boolean; got array<<withheld>>`.
- A `for` whose iterand is an index read on a receiver that did not determine as `array<T>` renders `'for' expects array<T> after 'in'; got index`.

### 2. Runtime-value placeholders

**Placeholders.** `<scrutinee summary>`, `<value>`.

**Rule.** Render via the canonical interpolation-stringification table in [Query — Stringification of interpolated values](../query.md), with one extension and one supplementary case:

- **String truncation.** A string whose length exceeds 80 Unicode code points is truncated to the first 77 code points followed by the literal three-character ellipsis `...`. The 80-code-point cap, the 77-code-point prefix, and the literal ellipsis are normative; counting is by Unicode code point, not by UTF-16 code unit and not by grapheme cluster.
- **`Result<T, E>` values.** A scrutinee whose static type is `Result<T, E>` (the case the query-stringification table reserves for a static parse error) renders as `Ok(<inner>)` or `Err(<inner>)`, with `<inner>` recursing this rule. Panics may legitimately fire on `Result` values (e.g. a `match` whose arms collectively miss an `Err` variant), so this case is reachable here even though it is unreachable in interpolated query templates.

**Test vectors.**

- A `match` panic on a schema-typed-object scrutinee whose runtime value is `{ name: "fluffy" }` renders `MatchError: no arm matched {"name":"fluffy"}` — the *Schema-typed object* row of the stringification table renders it as compact `JSON.stringify` with wire-name translation, and the schema name does not surface in the rendered string.
- A `match` panic on the integer `42` renders `MatchError: no arm matched 42`.
- A `match` panic on a 100-character ASCII string `s` renders `MatchError: no arm matched ` followed by the first 77 code points of `s` followed by the literal `...` (a single trailing three-character ellipsis, no surrounding quotes — the `string` row of the stringification table renders strings verbatim without quoting).

### 3. Syntactic-construct placeholder

**Placeholders.** `<construct>` in `theta/parse/unsupported-feature`; `<expr>` in `theta/parse/default-not-literal`.

**Rule.**

- For `<expr>` in `theta/parse/default-not-literal`, render the offending source span verbatim, copied byte-for-byte from the source file between the offending sub-expression's start and end token positions (post-newline-normalisation per [Lexical — Encoding](../lexical.md)), with internal whitespace preserved.
- For `<construct>` in `theta/parse/unsupported-feature`, the offending site is either a whole node category with no single source-span anchor (e.g. `=>` lambdas span the entire arrow form, including the body) or a well-formedness violation of a Theta construct with no narrower placeholder. Use the closed token-name table below.

| Construct | Token name |
|---|---|
| arrow function (`=>`) | `arrow function` |
| spread / rest (`...`) | `spread` |
| optional chaining (`?.`) | `optional chaining` |
| nullish coalescing (`??`) | `nullish coalescing` |
| strict equality (`===` / `!==`) | `strict equality` |
| bitwise op (`&`, `\|`, `^`, `~`, `<<`, `>>`, `>>>`) | `bitwise <op>` (where `<op>` is the source token verbatim) |
| comma operator (expression-position `,`) | `comma operator` |
| nested template literal | `nested template` |
| `new` expression | `new` |
| `typeof` operator | `typeof` |
| `instanceof` operator | `instanceof` |
| `delete` operator | `delete` |
| `void` operator | `void` |
| `yield` expression | `yield` |
| `await` expression | `await` |
| a punctuation token in statement position that begins no statement or expression form (an `ident`, `keyword` or literal token in that position starts a form and is silent) | `stray '<t>' in statement position` (where `<t>` is the source token verbatim) |
| a schema object body whose fields are not comma-separated | `schema fields must be comma-separated` |

**Test vectors.**

- A theta containing `let f = (x) => x + 1` renders `unsupported syntactic feature: arrow function`.
- A `params:` default whose RHS is `a + b` renders `params default RHS must be a literal-sublanguage form; offending sub-expression: a + b`.

### 4. Numeric placeholders

**Placeholders.** `<i>`, `<length>`, `<depth>`, `<offset>`, `<count>`, `<N>`, `<index>`, `<required>`, `<provided>`, `<max>`.

**Rule.** Render as the shortest decimal representation per the `integer` row of the canonical stringification table in [Query — Stringification of interpolated values](../query.md): no scientific notation, no leading zeros, leading `-` for negatives, `0` for the value `-0` (signed zero is normalised at the rendering boundary). `Infinity` and `NaN` are unreachable for these placeholders by construction (every emitting site is bounded — array length is non-negative, invoke depth is bounded by 32, etc.); a renderer that nonetheless encounters one MUST surface it through `theta/runtime/internal-error` rather than emitting `Infinity` or `NaN` into a panic message.

**Scope of `<required>` / `<provided>`.** This category-4 numeric rule governs `<required>` and `<provided>` at the arity-diagnostic emitting sites `theta/parse/invoke-arity-too-few`, `theta/parse/invoke-arity-too-many`, `theta/parse/fn-arity-too-few`, and `theta/parse/fn-arity-too-many`, where all four render integer argument counts. The `theta/load/host-incompatible` row's `<required>` is **not** numeric — depending on `kind` it renders a SemVer range, a tilde-range pin, or a closed literal such as `"function"` — and is pinned per `kind` at [the `theta/load/host-incompatible` per-`kind` `<observed>` / `<required>` enumeration](./placeholder-rendering-b.md#host-incompatible-observed-required) rather than by this rule.

**Scope of `<expected>` / `<actual>` on `theta/parse/generic-arity-mismatch`.** This category-4 numeric rule also governs `<expected>` and `<actual>` at `theta/parse/generic-arity-mismatch` (`generic type '<ctor>' expects <expected> type argument(s); got <actual>`), where both render integer type-argument counts rather than Theta static types — category 1's re-serialisation rule does not govern them at this site.

**Test vectors.**

- A negative-index OOB on a 3-element array renders `index out of bounds: -1 not in 0..3`.
- A 33-deep `invoke` chain renders `invoke chain depth exceeded: 33 > 32`.
