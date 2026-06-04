# Placeholder rendering a

## Placeholder rendering (normative)

The registry's *Message* column carries `<…>` placeholders that the renderer interpolates at the diagnostic site (rule 4 above). This subsection groups every placeholder used by V1 messages into eight categories and fixes one rendering rule per category, so two conformant implementations produce byte-identical strings (or byte-identical surround around an implementation-defined-tail interpolation, for category 8) for the same source defect. Throughout this subsection, *byte-identical* means equal as UTF-8 byte sequences, the comparison basis pinned by [Governance — GOV-15](../governance/req-id-prefix-table-retired.md#gov-15). Each rule below carries normative test vectors; conformance tests asserting on a rendered message MUST match these vectors and SHOULD include the boundary cases called out in *Edge cases* at the end of this subsection. The closed token-name table in category 3 and the closed value tables in category 7 carry the same GOV-7 / GOV-8 governance posture as the category-to-placeholder map itself.

**Closure.** The eight categories below form the closed loom 1.0.0 placeholder-rendering surface. Every `<…>` token appearing in the *Message* column of any row in [Code registry](./code-registry-parse.md#code-registry) is either (a) a placeholder enumerated in categories 1–7 (rendered byte-identically per its category's rule), (b) a §8 placeholder (rendered as a byte-identical prefix and suffix around an implementation-defined-tail interpolation per §8's rule), (c) the bespoke `<list>` placeholder in `loom/runtime/reload-teardown-timeout` (whose row carries an inline rendering rule that decomposes into the §7 sub-rules for `<slash-name>`, `<invocation-id>`, and the comma-space join), or (d) the `<failure>` carve-out documented in §8 below (a loom-internally-constructed discriminator whose grammar is pinned at the diagnostic-construction site, not by §8's host-derived rule). No other placeholders are admitted; this closure is enforced at build time. Introducing a new placeholder, retiring one, or moving a placeholder between categories is a spec-versioned breaking change governed by **GOV-7** and **GOV-8** in [`spec.md` — Governance](../../spec.md), exactly as the registry rows themselves are.

### 1. Static-type placeholders

**Placeholders.** `<type>`, `<expected>`, `<actual>`, `<left>`, `<right>`, `<element>`.

**Rule.** Render the Loom static type by re-serialising it in the source-grammar form defined in [Type System](../type-system.md):

- Primitive type names lowercase: `string`, `integer`, `number`, `boolean`, `null`.
- Literal types as their literal source: `"foo"`, `42`, `true`.
- Unions joined by ` | ` (space-pipe-space) with no surrounding parentheses.
- Arrays as `array<T>` (the angle-bracket form; never `T[]`, never `[T]`).
- Named schemas, enums, and type aliases by their loom-side identifier (no wire-name translation; the identifier shape is fixed by [Lexical — Identifiers](../lexical.md)).
- `Result<T, E>` rendered as written, with the inner types recursing this rule.
- Inline anonymous object types as `{ f₁: T₁, f₂: T₂ }`, fields in declaration order, single space after each `:` and after each `,`.

**Test vectors.**

- A binding typed `array<integer | string>` renders as `array<integer | string>`.
- A binding typed `Foo | null` renders as `Foo | null`.

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

**Placeholders.** `<construct>` in `loom/parse/unsupported-feature`; `<expr>` in `loom/parse/default-not-literal` and `loom/parse/tool-arg-not-literal`.

**Rule.**

- For `<expr>` in the two literal-sublanguage codes, render the offending source span verbatim, copied byte-for-byte from the source file between the offending sub-expression's start and end token positions (post-newline-normalisation per [Lexical — Encoding](../lexical.md)), with internal whitespace preserved.
- For `<construct>` in `loom/parse/unsupported-feature`, the offending site is a whole node category with no single source-span anchor (e.g. `=>` lambdas span the entire arrow form, including the body). Use the closed token-name table below.

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

**Test vectors.**

- A loom containing `let f = (x) => x + 1` renders `unsupported syntactic feature: arrow function`.
- A `params:` default whose RHS is `a + b` renders `params default RHS must be a literal-sublanguage form; offending sub-expression: a + b`.

### 4. Numeric placeholders

**Placeholders.** `<i>`, `<length>`, `<depth>`, `<offset>`, `<count>`, `<index>`, `<required>`, `<provided>`, `<max>`.

**Rule.** Render as the shortest decimal representation per the `integer` row of the canonical stringification table in [Query — Stringification of interpolated values](../query.md): no scientific notation, no leading zeros, leading `-` for negatives, `0` for the value `-0` (signed zero is normalised at the rendering boundary). `Infinity` and `NaN` are unreachable for these placeholders by construction (every emitting site is bounded — array length is non-negative, invoke depth is bounded by 32, etc.); a renderer that nonetheless encounters one MUST surface it through `loom/runtime/internal-error` rather than emitting `Infinity` or `NaN` into a panic message.

**Scope of `<required>` / `<provided>`.** This category-4 numeric rule governs `<required>` and `<provided>` at the arity-diagnostic emitting sites `loom/parse/invoke-arity-too-few` and `loom/parse/invoke-arity-too-many`, where both render integer argument counts. The `loom/load/host-incompatible` row's `<required>` is **not** numeric — depending on `kind` it renders a SemVer range, a tilde-range pin, or a closed literal such as `"function"` — and is pinned per `kind` at [the `loom/load/host-incompatible` per-`kind` `<observed>` / `<required>` enumeration](./placeholder-rendering-b.md#host-incompatible-observed-required) rather than by this rule.

**Test vectors.**

- A negative-index OOB on a 3-element array renders `index out of bounds: -1 not in 0..3`.
- A 33-deep `invoke` chain renders `invoke chain depth exceeded: 33 > 32`.
