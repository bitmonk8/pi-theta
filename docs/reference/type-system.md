# Reference — Type system & runtime value model

Normative type relation and in-memory value representation. See
[Grammar](./grammar.md) for the type grammar productions, [Schema
subset](./schema-subset.md) for lowering, [Errors and results](./errors-and-results.md)
for `Result`/`QueryError`.

## Type expressions

Built from: primitive types (`string`, `number`, `integer`, `boolean`, `null`);
named types (any schema or enum identifier in scope); generic types (`array<T>`,
`Result<T, E>`); union types (`T | U | ...`, lowest-precedence, legal anywhere a
type is); literal types (`"..."`, `42`, `true`, `false`, `null`); inline
anonymous objects (`{ field: T, ... }`). Inline arrays are not a separate form —
use `array<T>` (no `T[]`, no `[T]`).

`void` is **not** a value type. It is admitted only as a function/theta return
annotation ("intentionally produces no value"); any other type position is
`theta/parse/void-in-non-return-position`. `void` does not participate in type
compatibility.

The same type grammar applies in every annotation position: schema fields,
`params:`, `let x: T`, function parameters, `@<T>`...`` explicit query schemas;
the return position additionally admits `void`. Text deriving from none of
these forms is refused rather than admitted as a nominal reference:
`theta/parse/annotation-type-not-expression` at a `let` annotation, an `fn`
parameter type, or an `fn` return type; `theta/parse/schema-type-not-expression`
at a schema field or alias/union arm; `theta/load/params-type-not-expression` at
a `params:` field; `theta/parse/query-annotation-type-not-expression` at an
author-written `@<T>` explicit query schema.

## Type compatibility (`⊑`)

Wherever a value of static type `T₁` is used where `T₂` is expected, the answer
is governed by the single relation `T₁ ⊑ T₂` ("`T₁` is compatible with `T₂`").

**Operational definition.** Whenever `T₁ ⊑ T₂` holds, every value statically
typed `T₁` AJV-validates against the lowering of `T₂`. AJV validation is a
*necessary* condition, not sufficient. The parser recognises the structural cases
below without falling back to AJV, and admits *fewer* pairs than AJV alone (object
named types are nominal — TYPE-10). The parser's rejection is authoritative even
where the two lowered fragments are AJV-interchangeable.

Structural cases the parser must recognise (closed for theta 1.0):

| ID | Rule | Notes |
|---|---|---|
| **TYPE-1** | Reflexivity: `T ⊑ T`. | Identical primitives / named schemas / inline objects. |
| **TYPE-2** | `integer ⊑ number`. | One-way; reverse is `theta/parse/integer-narrowing`. |
| **TYPE-3** | Literal-to-primitive: `L ⊑ T` when value `L` is statically typed `T`. | `"validation" ⊑ string`, `42 ⊑ integer`, `42 ⊑ number`, `true ⊑ boolean`, `null ⊑ null`. |
| **TYPE-4** | Variant-to-union: for `schema U = A \| B \| ...`, `A ⊑ U`. | `Cat ⊑ Animal`. |
| **TYPE-5** | Union-widening: `T ⊑ T \| U`. | Combined with TYPE-4, `A ⊑ A \| B` even for anonymous unions. |
| **TYPE-6** | Union-distributive: `T₁ \| T₂ ⊑ T₃` iff `T₁ ⊑ T₃` and `T₂ ⊑ T₃`. | Each arm individually. |
| **TYPE-7** | Arrays covariant: `array<T₁> ⊑ array<T₂>` iff `T₁ ⊑ T₂`. | `array<Cat> ⊑ array<Animal>`. |
| **TYPE-8** | Inline object types field-wise: `{ f₁: T₁, ... } ⊑ { f₁: U₁, ... }` iff same field set and `Tᵢ ⊑ Uᵢ`. | Field sets match exactly (`additionalProperties: false`); order irrelevant. Never crosses the inline/named boundary. |

Deliberately **not** part of theta 1.0 compatibility (all rejected):
function-parameter contravariance, optional-field widening, excess-property
tolerance, `number ⊑ integer`. A future widening is non-breaking iff it only
admits new pairs.

**`void`** appears on neither side of any `⊑` check; no value is statically typed
`void`.

**Unresolvable operands.** When either side is past the parser's static view (an
inferred binding depending on a Pi-tool call whose schema is not parse-time
visible; an `invoke` against a callee that produced `theta/load/callee-has-errors`),
the parse-time check is skipped and the runtime AJV check is the safety net.

- **TYPE-9.** Five sites report their own parse-time diagnostic on a static
  failure: `let x: T = expr` → `theta/parse/let-rhs-type-mismatch`; a plain
  top-level `fn` argument → `theta/parse/fn-arg-type-mismatch`; a ternary →
  through the array/ternary common-type machinery
  (`theta/parse/array-element-type-mismatch` against a sink, else
  `theta/parse/array-no-common-type`); a `params:` default →
  `theta/parse/params-default-type-mismatch` (or `theta/parse/integer-narrowing`
  for `number`-under-`integer`); a reassignment RHS (the plain form and the five
  compound forms) against the target binding's declared or inferred type →
  `theta/parse/reassign-rhs-type-mismatch` (or `theta/parse/integer-narrowing`
  for the same one-way narrowing case).
- **TYPE-10.** Object-schema named types are **nominal** — participate in `⊑`
  only via TYPE-1, TYPE-4, TYPE-5/6. A named-schema value is not `⊑` an inline
  object of the same shape, and vice versa; two distinct named schemas with
  byte-identical lowered fragments are incompatible. Mismatches surface at parse
  time (`theta/parse/let-rhs-type-mismatch`, `-fn-arg-`, `-invoke-arg-`), not at
  runtime.
- **TYPE-11.** Alias-schema transparency — a `NamedType` declared `schema X = R`
  is replaced by `R` on whichever side it appears and the check re-evaluated,
  recursing through nested aliases. Identified solely by the `=` form. Aliasing an
  object schema unfolds to that object schema, which then participates under
  TYPE-10. Alias cycles are rejected before any compatibility question
  (`theta/parse/type-alias-cycle`).

## Common-type rules (array literals & ternary branches)

Applying `⊑` to the array/ternary case:

1. With a type sink in scope, every element must satisfy `T_element ⊑ T_sink`; a
   mismatch is `theta/parse/array-element-type-mismatch`.
2. Otherwise the parser computes the least upper bound under `⊑`: identical types
   collapse (TYPE-1); `integer` widens to `number` (TYPE-2); otherwise unioned via
   TYPE-5/6 (`["a", null]` → `array<string | null>`; `[1, "a"]` →
   `array<number | string>`).
3. Object schemas do not unify implicitly — two different named schemas yield
   `array<A | B>` only under a union sink; otherwise
   `theta/parse/array-no-common-type`.

`match` arms and inferred theta/`fn` return types use the same LUB discipline (see
[Grammar](./grammar.md) and [Errors and results — final value](./errors-and-results.md)).

## Runtime value model

Theta values are native JavaScript values, tagged where type recovery is needed:

| Theta type | JS representation |
|---|---|
| `string` | JS `string` |
| `number`, `integer` | JS `number` (same value at runtime; division yields IEEE-754 `Infinity`/`NaN`) |
| `boolean` | JS `boolean` |
| `null` | JS `null` |
| `array<T>` | JS `Array`, elements following these rules recursively |
| Object schema (named/anonymous) | JS plain object keyed by **theta-side names**, regardless of wire-name renames |
| Enum variant | wire string plus an interpreter-private declaring-enum tag; cross-enum equality compares both; `JSON.stringify` yields the bare wire string |
| `Result<T, E>` | internally tagged `Ok`/`Err` with payload; observed only via constructors, `match`, `?`; never lowered to a schema (`theta/parse/result-in-schema-position`) or interpolated (containment rule); crosses the subagent return envelope as its wire form, where both fail-closed walks measure through it |

The reference interpreter's concrete shapes (a non-enumerable symbol property
described for debugging as `__thetaEnum`; `{ ok, value }` / `{ ok, error }` plus
a non-enumerable symbol property branding `Result`, described as
`__thetaResult`) are
non-normative implementation details, not reachable from theta code. The
interpreter recognises a `Result` by the brand, never by the `{ ok, … }` shape:
an object carrying a boolean `ok` field classifies as an ordinary object.

### Equality (`==`)

Structural deep equality. `==`/`!=` accept operands of any two static types
(unlike ordering operators). When neither operand's static type is `⊑` the other,
`==` evaluates to `false` and `!=` to `true` — the comparison loads and runs
(e.g. `42 == true`, `Severity.High == 3`, `[1] == 1`, `null == "x"`,
`Severity.Low == "low"`). When one operand's static type is `⊑` the other
(including reflexive and `42 == 42.0` via TYPE-2), per-shape rules apply:

- Primitives compare by value; `NaN == NaN` is `true`; `+0 == -0` is `true`.
- Arrays: element-wise at the same indices; same length required.
- Objects: key set (theta-side names) and per-key value equality; declaration
  order irrelevant.
- Enum variants: declaring-enum tag and wire value both
  (`Severity.High == OtherEnum.High` is `false`).
- `Result`: `Ok`/`Err` discriminator, recurse on payload.

Ordering (`<`, `<=`, `>`, `>=`) on `NaN` produces `false` on all four operators —
deliberately asymmetric with `NaN == NaN`.

### Wire-name translation

Happens in exactly two places:

- *Inbound* (model output → theta value): after AJV validation, the runtime
  rebuilds the value with theta-side names via each schema's translation map, and
  reattaches each declaring-enum tag at named-enum positions recorded in the
  lowering-pass sidecar. Anonymous string-literal-union positions get no tag
  (`Severity.Low == "low"` stays `false`). At an `anyOf` position, the walk
  re-tests the value against each arm in source order and translates under the
  first arm that admits it, settling a value two arms both admit by that same
  order; no arm admitting leaves the value untouched. Applies uniformly to
  typed query results, typed tool-call returns, `invoke` returns, and binder
  `args`.
- *Outbound* (theta value → JSON): the runtime walks the theta-side value and
  produces wire-named JSON before AJV validation.

A frontmatter `params:` default is written in the
[literal sublanguage](./grammar.md#theta-literal-sublanguage) and parsed as an
ordinary Theta value. When a slash invocation omits the argument, the runtime
projects the value to wire form, merges it into binder `args`, and the merged
record crosses the binder-`args` inbound boundary above like any other value —
a named-enum position is retagged, a schema-typed one rebranded.

Theta code never sees wire names; tools, the model, and external consumers never
see theta-side names.

### JavaScript engine assumptions

The runtime targets Node exclusively (`process.versions.node >= 22.19.0`) and
assumes IEEE-754 `number`s, native `Map`/`Set`, and native `JSON.stringify`.
These are a **non-checked invariant** — no feature-detect, no polyfill, no
diagnostic on violation; behaviour is undefined if the host violates them. Bun,
Deno, browsers, and other hosts are out of theta 1.0 scope.

### Effects

The language has no file-writing, network, or process-spawning primitive. Every
external effect flows through one of three surfaces: a query
([Errors and results](./errors-and-results.md) and the Query spec), a tool call,
or a child theta invocation. The reachable tool set is bounded by the theta's
`tools:` allowlist (the callable set; see [Frontmatter](./frontmatter.md)).
Runtime-internal filesystem reads (discovery walks, `import` resolution, settings
reads) are not theta-language effects.

## Provenance

- Type expressions, `void` disposition: `docs/spec_topics/type-system.md`.
- Compatibility relation and TYPE-1…TYPE-11 (table transcribed): 
  `docs/spec_topics/type-system.md#type-compatibility`.
- Common-type rules: `docs/spec_topics/expressions.md#object-construction-array-construction-and-operator-rules`.
- Runtime value model table, equality, wire-name translation, engine assumptions,
  effects: `docs/spec_topics/runtime-value-model.md`.
