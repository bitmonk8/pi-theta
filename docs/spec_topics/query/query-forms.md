# Query forms

## Untyped form

`Ok` value is the assistant's text response as a `string`:

```loom
let critique = @`Critique this code:\n${code}`?
```

Return type: `Result<string, QueryError>`.

## Typed form

The response schema is **inferred from the surrounding type context**. The runtime hands the schema to the provider as a structured-output / strict tool-input contract and validates the response with AJV before returning it. The most common form is type-annotated `let`:

```loom
let score: ReviewScore = @`Rate the critique 1-5: ${critique}`?
```

Return type: `Result<Schema, QueryError>`, where `Schema` is the inferred response type.

### Schema inference rules

The response schema flows into the query expression from any of the following type contexts, checked in order:

1. The annotated type of the binding being initialised (`let x: T = @`...`?`).
2. The declared return type of the enclosing function, when the query is in tail-expression or `return`-argument position. A `.loom` file has no declared return type — its return type is itself inferred from its tail expression (see [Functions — Loom return type](../functions.md#loom-return-type)) — so a loom cannot serve as a sink for a query in its own tail or `return` position.
3. The declared parameter type of the enclosing call site (`f(@`...`?)` where `f`'s parameter has type `T`).
4. Explicit ascription via the explicit form (below).

If none apply, the query is untyped (returns `string`).

### Schema inference algorithm

A query expression searches *outward* through its enclosing AST for a "type sink" — a position whose declared type can supply the schema. The walk is *shallow*: it crosses through context-preserving constructs but stops at any expression that consumes its operand without preserving its type. Concretely:

- **Crossed (transparent):** parenthesisation `(...)`; the RHS of `let x: T = ...`; function / tool / `invoke` arguments matched to a typed parameter; the tail expression of an enclosing function or loom whose return type is declared; the operand of `return`; the branches of a ternary `cond ? a : b` *if and only if* the ternary itself has a sink; the elements of an array literal `[a, b]` *if and only if* the literal has a sink (binding annotation, parameter type, etc.).
- **Stopped (opaque):** binary and unary operators (`+`, `==`, `!`, etc.); member access (`a.b`); indexed access (`a[i]`); the scrutinee of `match`; the condition of `if` / `while`; comparison and logical operators on either side. Inside these positions, only an explicit `@<Schema>`...`` ascription supplies a schema.

If the walk reaches a sink, that schema is the query's response type. If the walk reaches a stop without finding a sink, the query is untyped and returns `Result<string, QueryError>`. An explicit `@<Schema>` ascription wins regardless of where it appears.

*Worked examples:*

- `let x: ReviewScore = @\`...\`?` — sink at the binding annotation. ✅
- `f(g(@\`...\`?))` — `g`'s parameter type is the sink; `f`'s parameter type is not visible past `g`'s call boundary. ✅
- `let x = @\`...\`? + 1` — the `+` operator is opaque; the query has no sink and is untyped (returns `string`), then `+ 1` is a type error against `string`. Add `@<integer>` or annotate the binding to fix.
- `match @\`...\` { ... }` — `match` scrutinee is opaque; the query is untyped unless an explicit `@<Schema>` ascription is added. The grammar requires the explicit form here.
- `let xs: array<Score> = [@\`...\`?, @\`...\`?]` — the array literal has a sink (`array<Score>`), so each element inherits `Score` as its sink. ✅

### Explicit form

`@<Schema>`...`` overrides inference. Required in any expression position with no usable type context, such as the scrutinee of `match`:

```loom
let score = match @<ReviewScore>`Rate the critique 1-5: ${critique}` {
  Ok(s)  => s,
  Err(_) => ReviewScore { value: 0, reason: "unrated" },
}
```

The explicit form also wins over inference: if both a binding annotation and an explicit `<Schema>` are present, the explicit one is used (with `loom/parse/explicit-schema-mismatch` warning if the explicit `<Schema>` ascription is not compatible with the binding annotation under [Type System — Type compatibility](../type-system.md#type-compatibility) — i.e. `ascription ⋢ annotation`). The check fires in one direction only: a value the explicit form would produce that the binding annotation could not accept is the warned condition; a binding annotation wider than the ascription (a safe widening) is silently allowed. When either side is past the parser's static view (per [Type System — Unresolvable operands](../type-system.md#type-compatibility)), the warning is skipped and the runtime AJV check is the safety net.

*Test vectors (normative).*

- `let x: number = @<integer>\`Rate 1-5: ${q}\`?` — **no warning**. `integer ⊑ number` by Type-compatibility rule 2; the explicit form's value is acceptable to the binding.
- `let x: integer = @<number>\`...\`?` — **fires `loom/parse/explicit-schema-mismatch`**. `number ⋢ integer` (the explicit `number` could yield `3.5`, which the `integer` binding cannot accept).
- `let x: ReviewScore = @<ReviewScore>\`...\`?` — **no warning**. Reflexivity (rule 1).
- `let x: Animal = @<Cat>\`...\`?` where `schema Animal = Cat | Dog` — **no warning**. Variant-to-union (rule 4): `Cat ⊑ Animal`.

## Multi-line templates

Backtick templates span as many lines as needed; there is no separate heredoc form. Loom applies two normalisations to the rendered text:

- **Newline trim.** A newline immediately after the opening backtick is stripped; a newline immediately before the closing backtick is stripped. This makes the natural-looking form produce clean text:

  ```loom
  let plan: Plan = @`
    The author is ${author.name}, a ${author.role}
    with ${author.experience_years} years of experience.
    Produce a review plan tailored to that level.
  `?
  ```

  renders as `"  The author...\n  with...\n  Produce..."` *before* dedent.

- **Dedent.** Loom strips the common leading whitespace shared by every non-blank line of the rendered text (Python's `textwrap.dedent` algorithm). The example above renders as `"The author...\nwith...\nProduce..."` after dedent. Authors writing prompts inside indented code blocks therefore do not pay an indent tax in what the model sees.

Dedent and newline-trim apply uniformly to every `@`...`` template regardless of length — single-line templates have no leading whitespace and no internal newlines, so the rules are no-ops in that case.

### Degenerate rendered templates

<a id="degenerate-rendered-templates"></a>

Two layers defend against sending the provider a turn that contains no useful text:

- **Parse-time warning** (`loom/parse/empty-template`, severity *warning*): if a template's *static* body — every literal segment between interpolations, after newline-trim and dedent — is empty or whitespace-only, the parser emits a one-line warning at the template's source location. The loom still loads. Authors who genuinely intend a whitespace-only prompt can suppress the warning by writing an explicit literal escape (`\n`).
- **Runtime short-circuit:** immediately before the user turn would be issued, if the *fully-rendered* text (post-interpolation, post-newline-trim, post-dedent) has length 0 or matches the regular expression `^\s*$`, the query short-circuits to `Err(QueryError { kind: "validation", cause: "empty_template", message: "rendered query template is empty", attempts: 0, validation_errors: [], raw_response: null })` without consuming a provider round-trip. The empty-template short-circuit emits the `cause: "empty_template"` arm of `ValidationError` (see [Errors and Results — ValidationError](../errors-and-results.md)) so it is observably distinct on the wire from a `cause: "schema_validation"` failure even though both share `kind: "validation"`. The short-circuit fires equally on the original turn and on any respond-repair follow-up turn (defensive — should not occur for follow-ups, since the runtime constructs them); a follow-up that short-circuits does **not** consume an `attempts` slot. An empty-template short-circuit on the original user turn of a typed query MUST NOT trigger the respond-repair path: zero respond-repair follow-up turns are issued, no follow-up user turn is appended to the conversation history, and the returned `ValidationError.attempts` is 0 regardless of `respond_repair.attempts` and `respond_repair.methodology`. Rationale: respond-repair repairs a malformed model response (see Schema-validation respond-repair); the short-circuit is the runtime refusing input it constructed itself, before any model response exists, so there is nothing for a follow-up turn to repair.

Oversized rendered templates have no pre-flight bound in loom 1.0; they pass through to the provider and are detected reactively via the provider's overflow error envelope (see `ContextOverflowError` below).

### Dedent and newline-trim — normative behaviour

The two normalisations are applied in a fixed order: **newline-trim first**, then **dedent**. The normative reference is the behaviour of CPython 3.x `textwrap.dedent` *as illustrated by the table below*; an implementer who cannot read the CPython source can still pass the conformance tests from the spec alone. Three behaviours of `textwrap.dedent` matter for the rendered prompt the model sees:

1. Whitespace-only lines are ignored when computing the common prefix and are normalised to an empty line in the output. A "blank" line that contains stray spaces still dedents as if it were empty.
2. The common prefix is the longest common literal prefix of the non-blank lines, not a visual column. A template that mixes tab-indented and space-indented lines has no shared prefix; nothing is stripped.
3. Tab-only and space-only indentation are stripped uniformly — the prefix being stripped is whatever bytes are common across all non-blank lines.

The following input → output pairs are normative. `\n` and `\t` denote literal newline and tab bytes inside the source between the backticks; they are not escape sequences interpreted by the loom parser (a literal newline or tab in the source has the same effect).

| # | Template (between backticks) | Rendered text |
|---|---|---|
| 1 | `` @`\n    The author...\n    with...\n    Produce...\n` `` | `"The author...\nwith...\nProduce..."` |
| 2 | `` @`\n    a\n      \n    b\n` `` | `"a\n\nb"` |
| 3 | `` @`\n\t\tx\n\t\ty\n` `` | `"x\ny"` |
| 4 | `` @`\n\tx\n  y\n` `` | `"\tx\n  y"` |
| 5 | `` @`  hi` `` | `"  hi"` |
| 6 | `` @`\n` `` | `""` |
| 7 | `` @`\n    only\n` `` | `"only"` |

Vector commentary:

1. Multi-line, uniform space indent — the worked example above, restated as a normative vector.
2. The whitespace-only middle line is normalised to an empty line and does not constrain the common prefix; the four-space prefix shared by `a` and `b` is stripped.
3. Tab-only indentation is stripped exactly when it forms the common prefix.
4. Mixed tab and space indentation share no literal prefix, so nothing is stripped and the model sees the indentation verbatim.
5. A single-line template has no internal newlines for newline-trim to act on and exactly one line for dedent to consider, so any leading whitespace inside the backticks is preserved.
6. A template that consists solely of a single newline becomes the empty string after newline-trim; dedent on the empty string is the empty string. How the runtime treats an empty rendered template is pinned earlier in this file under [Degenerate rendered templates](#degenerate-rendered-templates).
7. Newline-trim removes the leading newline and the newline immediately before the closing backtick, leaving the single line `    only`; dedent then strips the four-space common prefix, yielding `"only"`. This pins the order: newline-trim first, dedent second.

Newline-trim strips a newline only when it sits **immediately** after the opening backtick or **immediately** before the closing backtick. A trailing `\n` followed by whitespace before the closing backtick (e.g. `\n    only\n  `) is not trimmed; the trailing whitespace-only line is then handled by dedent's whitespace-only-line normalisation (it does not contribute to the common prefix and is rendered as an empty line).
