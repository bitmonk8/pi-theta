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

<a id="explicit-ascription-override"></a>

An explicit `@<Schema>` ascription via the [explicit form](#explicit-form) always supplies the response schema and overrides the inference contexts below, regardless of where the query appears.

Absent an explicit ascription, the response schema flows into the query expression from a *type sink* — a position whose declared type can supply the schema. The positions that can serve as a sink are:

- The annotated type of the binding being initialised (`let x: T = @`...`?`).
- The declared return type of the enclosing function, when the query is in tail-expression or `return`-argument position. A `.loom` file has no declared return type — its return type is itself inferred from its body (see [Functions — Loom return type](../functions.md#loom-return-type)) — so a loom cannot serve as a sink for a query in its own tail or `return` position.
- The declared parameter type of the enclosing call site (`f(@`...`?)` where `f`'s parameter has type `T`).

These are sink *positions*, not a precedence ladder: when a query is enclosed by more than one of them, which sink supplies the schema is determined by the [schema inference algorithm](#schema-inference-algorithm) below, which walks outward and stops at the *nearest* enclosing sink — the innermost sink wins, not the outermost. If no sink encloses the query and no explicit ascription is present, the query is untyped (returns `string`).

### Schema inference algorithm

A query expression searches *outward* through its enclosing AST for a "type sink" — a position whose declared type can supply the schema. The walk is *shallow*: it crosses through context-preserving constructs but stops at any expression that consumes its operand without preserving its type. Concretely:

- **Crossed (transparent):** parenthesisation `(...)`; the RHS of `let x: T = ...`; function / tool / `invoke` arguments matched to a typed parameter; the tail expression of an enclosing function or loom whose return type is declared; the operand of `return`; the branches of a ternary `cond ? a : b` *if and only if* the ternary itself has a sink; the elements of an array literal `[a, b]` *if and only if* the literal has a sink (binding annotation, parameter type, etc.).
- **Stopped (opaque):** binary and unary operators (`+`, `==`, `!`, etc.); member access (`a.b`); indexed access (`a[i]`); the scrutinee of `match`; the condition of `if` / `while`; comparison and logical operators on either side. Inside these positions, only an explicit `@<Schema>`...`` ascription supplies a schema.

If the walk reaches a sink, that schema is the query's response type. If the walk reaches a stop without finding a sink, the query is untyped and returns `Result<string, QueryError>`. An explicit `@<Schema>` ascription overrides the walk regardless of where it appears, per the [override rule](#explicit-ascription-override).

*Worked examples:*

- `let x: ReviewScore = @\`...\`?` — sink at the binding annotation. ✅
- `f(g(@\`...\`?))` — `g`'s parameter type is the sink; `f`'s parameter type is not visible past `g`'s call boundary. ✅
- `let x = @\`...\`? + 1` — the `+` operator is opaque; the query has no sink and is untyped (returns `string`), then `+ 1` is a type error against `string`. Add `@<integer>` or annotate the binding to fix.
- `match @\`...\` { ... }` — `match` scrutinee is opaque; the query is untyped unless an explicit `@<Schema>` ascription is added. The grammar requires the explicit form here.
- `let xs: array<Score> = [@\`...\`?, @\`...\`?]` — the array literal has a sink (`array<Score>`), so each element inherits `Score` as its sink. ✅
- `let x: Out = process(@\`...\`?)` where `process(p: In)` — the walk reaches the call-site parameter type `In` first; `In` is the nearest enclosing sink and supplies the schema. The outer binding annotation `Out` is **not** consulted, because the walk stops at the first (innermost) sink it reaches rather than continuing to the outer binding. ✅

### Explicit form

`@<Schema>`...`` overrides inference. Required in any expression position with no usable type context, such as the scrutinee of `match`:

```loom
let score = match @<ReviewScore>`Rate the critique 1-5: ${critique}` {
  Ok(s)  => s,
  Err(_) => ReviewScore { value: 0, reason: "unrated" },
}
```

Per the [override rule](#explicit-ascription-override), when both a binding annotation and an explicit `<Schema>` are present, the explicit one is used (with `loom/parse/explicit-schema-mismatch` warning if the explicit `<Schema>` ascription is not compatible with the binding annotation under [Type System — Type compatibility](../type-system.md#type-compatibility) — i.e. `ascription ⋢ annotation`). The check fires in one direction only: a value the explicit form would produce that the binding annotation could not accept is the warned condition; a binding annotation wider than the ascription (a safe widening) is silently allowed. When either side is past the parser's static view (per [Type System — Unresolvable operands](../type-system.md#type-compatibility)), the warning is skipped and the runtime AJV check is the safety net.

*Test vectors (normative).*

- `let x: number = @<integer>\`Rate 1-5: ${q}\`?` — **no warning**. `integer ⊑ number` by [TYPE-2](../type-system.md#type-2); the explicit form's value is acceptable to the binding.
- `let x: integer = @<number>\`...\`?` — **fires `loom/parse/explicit-schema-mismatch`**. `number ⋢ integer` (the explicit `number` could yield `3.5`, which the `integer` binding cannot accept).
- `let x: ReviewScore = @<ReviewScore>\`...\`?` — **no warning**. Reflexivity ([TYPE-1](../type-system.md#type-1)).
- `let x: Animal = @<Cat>\`...\`?` where `schema Animal = Cat | Dog` — **no warning**. Variant-to-union ([TYPE-4](../type-system.md#type-4)): `Cat ⊑ Animal`.

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

- **Parse-time warning** (`loom/parse/empty-template`, severity *warning*): if a template's *static* body — every literal segment between interpolations, after newline-trim and dedent but **before** the escape rewrites of [Query escapes — Escapes](query-escapes-stringification.md#escapes) are applied to those segments — is empty or whitespace-only (whitespace being the ASCII set pinned at [System-note rendering](../binder/defaulting-system-note-echo.md#system-note-rendering) rule 1, never the regex `\s` class), the parser emits a one-line warning at the template's source location. The loom still loads. Authors who genuinely intend a whitespace-only prompt can suppress the warning by writing an explicit literal escape (`\n`): evaluating the predicate pre-escape, the body is the non-whitespace two-character sequence `` \n `` and the warning is suppressed (post-escape it would be a single whitespace newline, so only the pre-escape reading makes this suppression hatch effective).
- **Runtime short-circuit:** immediately before the user turn would be issued, if the *fully-rendered* text (post-interpolation, post-newline-trim, post-dedent) has length 0 or contains only characters drawn from the ASCII whitespace set pinned at [System-note rendering](../binder/defaulting-system-note-echo.md#system-note-rendering) rule 1 — the language-dependent regex `\s` class is **not** used, so non-ASCII whitespace (e.g. U+00A0) does not satisfy the predicate and a render consisting solely of such characters issues a turn rather than short-circuiting — the query short-circuits to `Err(QueryError { kind: "validation", cause: "empty_template", message: "rendered query template is empty", attempts: 0, validation_errors: [], raw_response: null })` without consuming a provider round-trip. The empty-template short-circuit emits the `cause: "empty_template"` arm of `ValidationError` (see [Errors and Results — ValidationError](../errors-and-results.md)) so it is observably distinct on the wire from a `cause: "schema_validation"` failure even though both share `kind: "validation"`. The short-circuit fires equally on the original turn and on any respond-repair follow-up turn (defensive — should not occur for follow-ups, since the runtime constructs them); a follow-up that short-circuits does **not** consume an `attempts` slot. An empty-template short-circuit on the original user turn of a typed query MUST NOT trigger the respond-repair path: zero respond-repair follow-up turns are issued, no follow-up user turn is appended to the conversation history, and the returned `ValidationError.attempts` is 0 regardless of `respond_repair.attempts` and `respond_repair.methodology`. Rationale: respond-repair repairs a malformed model response (see Schema-validation respond-repair); the short-circuit is the runtime refusing input it constructed itself, before any model response exists, so there is nothing for a follow-up turn to repair.

Oversized rendered templates have no pre-flight bound in loom 1.0; they pass through to the provider and are detected reactively via the provider's overflow error envelope (see `ContextOverflowError` below).

### Dedent and newline-trim — normative behaviour

The two normalisations are applied in a fixed order: **newline-trim first**, then **dedent**. The normative authority for both is this section itself — the behaviour rules below, the vector table, and the obligations that accompany them. CPython 3.x `textwrap.dedent` is cited only as a non-normative pointer to one conforming implementation; where this section addresses an input or where the two would disagree, this section governs. The following behaviours matter for the rendered prompt the model sees:

1. Whitespace-only lines are ignored when computing the common prefix and are normalised to an empty line in the output. A "blank" line that contains stray spaces still dedents as if it were empty.
2. The common prefix is the longest common literal prefix of the non-blank lines, not a visual column. A template that mixes tab-indented and space-indented lines has no shared prefix; nothing is stripped.
3. Tab-only and space-only indentation are stripped uniformly — the prefix being stripped is whatever bytes are common across all non-blank lines.
4. Both normalisations split the rendered text into lines on the line-feed `\n` (U+000A) only. Source CR (`\r`) and CRLF (`\r\n`) line endings are normalised to `\n` before newline-trim and dedent run (see [Lexical Structure — Newline normalisation](../lexical.md)), so no bare `\r` survives from the source. A `\r` introduced into the rendered text by an interpolated value — the one path by which a carriage return can reach dedent, since interpolated values are not subject to source newline normalisation — is ordinary content: it neither splits a line nor satisfies the whitespace-only-line predicate of rule 1.
5. The leading whitespace dedent considers for the common prefix, and the characters that make a line satisfy the whitespace-only-line predicate of rule 1, are drawn only from U+0020 (space) and U+0009 (tab) — the space and tab members of the ASCII whitespace set pinned at [System-note rendering](../binder/defaulting-system-note-echo.md#system-note-rendering) rule 1. Any other code point — including non-ASCII whitespace such as U+00A0 (no-break space) or U+3000 (ideographic space) — is ordinary content for both the common-prefix walk and the whitespace-only-line predicate.

The following input → output pairs are normative. `\n`, `\r`, and `\t` denote literal newline, carriage-return, and tab bytes, and `\u00A0` a literal U+00A0 (no-break space), inside the source between the backticks; they are not escape sequences interpreted by the loom parser (a literal newline, carriage return, or tab in the source has the same effect).

| # | Template (between backticks) | Rendered text |
|---|---|---|
| 1 | `` @`\n    The author...\n    with...\n    Produce...\n` `` | `"The author...\nwith...\nProduce..."` |
| 2 | `` @`\n    a\n      \n    b\n` `` | `"a\n\nb"` |
| 3 | `` @`\n\t\tx\n\t\ty\n` `` | `"x\ny"` |
| 4 | `` @`\n\tx\n  y\n` `` | `"\tx\n  y"` |
| 5 | `` @`  hi` `` | `"  hi"` |
| 6 | `` @`\n` `` | `""` |
| 7 | `` @`\n    only\n` `` | `"only"` |
| 8 | `` @`\n    only\n  ` `` | `"only\n"` |
| 9 | `` @`\n    a\r\n    b\n` `` | `"a\nb"` |
| 10 | `` @`\n\u00A0x\n\u00A0y\n` `` | `"\u00A0x\n\u00A0y"` |

Vector commentary:

1. Multi-line, uniform space indent — the worked example above, restated as a normative vector.
2. The whitespace-only middle line is normalised to an empty line and does not constrain the common prefix; the four-space prefix shared by `a` and `b` is stripped.
3. Tab-only indentation is stripped exactly when it forms the common prefix.
4. Mixed tab and space indentation share no literal prefix, so nothing is stripped and the model sees the indentation verbatim.
5. A single-line template has no internal newlines for newline-trim to act on and exactly one line for dedent to consider, so any leading whitespace inside the backticks is preserved.
6. A template that consists solely of a single newline becomes the empty string after newline-trim; dedent on the empty string is the empty string. How the runtime treats an empty rendered template is pinned earlier in this file under [Degenerate rendered templates](#degenerate-rendered-templates).
7. Newline-trim removes the leading newline and the newline immediately before the closing backtick, leaving the single line `    only`; dedent then strips the four-space common prefix, yielding `"only"`. This pins the order: newline-trim first, dedent second.
8. The source ends `\n  ` (a newline followed by two trailing spaces), so the character immediately before the closing backtick is a space, not a newline: newline-trim removes the leading newline but leaves the trailing newline in place. Dedent then sees two lines — `    only` and the whitespace-only line `  ` — strips the four-space common prefix from `    only`, and normalises the trailing whitespace-only line to an empty line per rule 1 (it does not contribute to the common prefix). The result is `only` followed by an empty line: the rendered string `"only\n"`.
9. Source CR and CRLF line endings are normalised to `\n` before newline-trim and dedent run (see [Lexical Structure — Newline normalisation](../lexical.md)), so the `\r\n` here behaves exactly as a lone `\n`: the two lines `    a` and `    b` share the four-space common prefix, which dedent strips, yielding `"a\nb"`. An implementation that dedented the raw bytes and treated `\r` as trailing content on the first line would mis-render this as `"a\r\nb"`. This pins rule 4's LF-only line-splitting.
10. The leading character on each line is U+00A0 (no-break space), which lies outside the {U+0020, U+0009} alphabet of rule 5, so it is ordinary content: dedent finds no space/tab common prefix and strips nothing. The non-ASCII leading whitespace is preserved verbatim in what the model sees. An implementation that used the Unicode `\s` class as the dedent alphabet would wrongly strip it.

Newline-trim strips a newline only when it sits **immediately** after the opening backtick or **immediately** before the closing backtick. A trailing `\n` followed by whitespace before the closing backtick (e.g. `\n    only\n  `) is not trimmed; the trailing whitespace-only line is then handled by dedent's whitespace-only-line normalisation (it does not contribute to the common prefix and is rendered as an empty line); vector 8 pins the resulting rendered string.
