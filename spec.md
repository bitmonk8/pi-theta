# pi-loom — Extension Specification

## Overview

`pi-loom` is a [Pi Coding Agent](https://pi.dev) extension that introduces a purpose-built scripting language for authoring parameterized, programmatic templates that target the PI/ESI boundary. Where Pi's built-in `prompt` and `subagent` features provide parameterized Markdown — static text with YAML frontmatter — `pi-loom` provides a full scripting language whose *side effects are conversational injections* into the current or a new agent context.

A `.loom` file is neither a TypeScript module nor a Markdown prompt. It is a **woven artifact**: PI-side control flow (variables, loops, conditionals, function definitions) interleaved with ESI-side text emissions. The output of evaluating a loom is not a return value or a file write — it is a structured sequence of text fragments injected into a conversation context.

---

## Heritage and Relationship to `mech`

pi-loom's design owes a substantial debt to **`mech`**, the declarative YAML workflow engine in the sibling [backlot](../backlot) project (`backlot/mech`, full specification at `backlot/docs/MECH_SPEC.md`). mech and pi-loom share a worldview — typed prompt orchestration, JSON Schema as the type system, functions as the unit of composition, conversation-aware function calls — but make deliberately opposite syntactic choices.

| Dimension | mech | pi-loom |
|---|---|---|
| Surface | Declarative YAML | Imperative scripting language |
| Expressions | CEL inside `{{...}}` | TS-style template strings (`${...}`) |
| Composition | `call:` blocks in a CDFG | Function calls in straight-line code |
| Control flow | `transitions` with CEL guards; `depends_on` for data edges | `if`, `for`, `while`, function calls |
| Validation | Load-time JSON Schema + CEL type checking | Parse-time schema declaration; runtime AJV validation |
| Conversation model | Function = conversation boundary; control edges carry history | Loom mode (`prompt` vs `subagent`) selects the target conversation; a single loom drives many turns against it via `@`...`` |
| Slogan | "YAML-not-a-language" | "A real language whose side effect is injection" |

Where mech treats programmability as a hazard to be contained inside CEL guards, pi-loom embraces it: the goal is to author prompts whose *structure* is computed. Both tools target the PI/ESI boundary; mech approaches it from the configuration end, pi-loom from the code end.

**Specific mech ideas pi-loom adopts:**

- Typed function inputs/outputs as the unit of composition (mech §4.5).
- Conversation-isolated subagent invocation, mirroring mech's `call:` transparency rule (mech §4.6, rule 4).
- Schema-first design: every typed value has a JSON Schema definition validated at load/parse time.
- Cascading agent configuration (workflow → function → block in mech; project → loom → query in pi-loom) — *planned, not yet specified below*.

**Specific mech ideas pi-loom deliberately rejects:**

- A declarative-only surface — pi-loom is a real language with imperative control flow.
- CEL — pi-loom uses TS-flavoured template expressions to match the ergonomic neighbourhood of Pi's `.ts` extensions.
- The single unified CDFG — pi-loom uses straight-line code with imports rather than a graph of blocks.

---

## Conceptual Model

### The Three-Layer Model

`pi-loom` is designed around an explicit three-layer model of intelligence and tooling:

- **PI (Procedural Infrastructure)** — deterministic, human-instructed computation: TypeScript, OS calls, file I/O, APIs
- **ESI (Emergent Statistical Intelligence)** — the LLM; capabilities arise from training, not explicit programming
- **EBI (Embodied Biological Intelligence)** — the human developer orchestrating the above

`.ts` extension files operate entirely in PI. `.md` prompts and subagents emit instructions to ESI but have no PI-side logic. `.loom` files occupy the boundary: PI logic controls *what* gets sent to the model, ESI receives the *result* of that logic as natural language.

### Query-and-Await

A `.loom` file is **not** a template that expands to a single prompt. It is a small program that drives a conversation across multiple turns. The primitive that crosses PI → ESI is the **query template** — an `@`-prefixed backtick template:

1. Sends the template's rendered text as the next user turn into the loom's target conversation.
2. Awaits the model's response (servicing any tool-call loop on the way).
3. Returns that response as a value usable in subsequent PI-side logic.

Concretely, `@`...`` is an *expression*, not a statement. Every query returns a `Result` (see [Errors and Results](#errors-and-results)); the `?` operator unwraps `Ok` and propagates `Err`. The response schema, when typed, is inferred from the surrounding type context (binding annotation, function parameter, return type) — see [Query](#query) for full rules:

```loom
let critique = @`Critique this code:\n${code}`?
let score: ReviewScore = @`Rate the critique 1-5: ${critique}`?
```

A loom therefore alternates between PI logic (parsing the previous response, branching, looping) and ESI turns (further queries) for as long as it needs. There is no single emission buffer flushed at the end; each query is its own conversation turn whose result feeds back into PI code.

### Scope of a Loom File

Each `.loom` file defines a **loom** — a named, invocable unit. A loom can be invoked:

- As a **prompt-mode loom**: each query runs as a turn in the *current* conversation. The user's session sees every turn — nothing is hidden. The loom's final `Ok` return value is *not* surfaced to the user as a distinct artefact — the conversation is the user-facing surface, and authors who want the user to see a final value should issue a final query whose text contains it. The return value exists for programmatic consumers (an `invoke` caller, a future loom harness).
- As a **subagent-mode loom**: a *new, isolated* conversation is spawned; each query runs as a turn in it. When the loom finishes, only its return value is propagated back to the caller — the intermediate transcript is private to the loom.

In both modes the loom drives the conversation across however many query turns it needs. The mode selects *which* conversation those turns happen against, not whether the loom is allowed to round-trip with the model.

---

## Language Design

### Design Basis

The Loom grammar is based on **TinyC**, adapted for the JSON type system and the conversational emission model. The parser is implemented using **Chevrotain**, for which TinyC examples already exist and serve as a starting point.

### Type System

The type system is JSON-native. Type expressions are built from:

- **Primitive types**: `string`, `number`, `integer`, `boolean`, `null`
- **Named types**: any schema or enum identifier in scope (`Author`, `ReviewScore`)
- **Generic types**: `array<T>`, `Result<T, E>` (and any future parameterised type) — angle-bracket type parameters are the uniform Loom convention
- **Union types**: `T | U | ...` — the `|` operator is the lowest-precedence type operator and is legal anywhere a type is
- **Literal types**: `"..."`, `42`, `true`, `false`, `null` — string, number, and boolean literals are valid type expressions (single-arm "unions" are how `kind: "validation"`-style const fields are expressed)
- **Inline anonymous objects**: `{ field: T, ... }` — legal in any type position, but named schemas are preferred for reuse and for getting a name in error messages
- **Inline arrays**: not a separate form — use `array<T>` (no `T[]`, no `[T]`)

The same type grammar applies in every type-annotation position: schema fields, frontmatter `params:`, `let x: T`, function parameters, function return types, and `@<T>`...`` explicit query schemas.

#### Schema Declarations

A `schema` declaration introduces a named type. Two forms:

**Object schema** — `schema X { ... }`:

```loom
schema Author {
  name: string,
  role: string,
  experience_years: integer,
}
```

Fields are comma-separated; the trailing comma is optional. Field names are identifiers; field types are any expression from the grammar above. Every declared field is **required** (the lowered JSON Schema's `required` lists every property; `additionalProperties: false` is always emitted). Optional fields are expressed as `T | null` — there is no `field?: T` shorthand. The non-existence and the explicit-`null` cases are conflated, matching strict-mode provider behaviour.

**Type-alias / union schema** — `schema X = ...`:

```loom
schema Severity = "low" | "medium" | "high"   // string-literal union (an enum-as-alias)
schema StringOrNumber = string | number       // primitive union
schema Animal = Cat | Dog | Lizard            // discriminated object union
```

The `=` form is a top-level type alias. It composes with every shape from the type grammar: literal unions, primitive unions, object unions (discriminated; see below), and references to other named types.

**Enum declarations** — `enum X { ... }`:

```loom
enum Severity {
  Low,
  Medium,
  High,
}
```

Variant names are PascalCase identifiers. By default, the variant name is the string value the model produces (`Low` → `"Low"`). Explicit values override that mapping:

```loom
enum Severity {
  Low = "low",
  Medium = "medium",
  High = "high",
}

enum ErrorCode {
  NotFound = "ERR_404",
  Forbidden = "ERR_403",
}
```

Variants are comma-separated; trailing comma optional. `enum` is **top-level only** — there is no inline `enum["a", "b"]` form. For inline enumerations use literal-union: `severity: "low" | "medium" | "high"`. V1 enums carry **string values only** (no numeric or boolean variant values, no payload-carrying variants); for richer variants use the `schema X = A | B` form with object schemas.

**When to use which.** Reach for `enum X { ... }` when the values are a closed conceptual set referenced by name from multiple places **and** you want descriptions per variant. Reach for literal-union (`"low" | "medium" | "high"`) when the values are inline, ad hoc, or you don't want a separate top-level declaration. Both lower to `{"enum": [...]}` — the choice is purely about the surface ergonomics.

**Discriminated unions.** A `schema X = A | B | C` whose variants are all object schemas is a discriminated union; the discriminator field is normally **detected implicitly**. The detected field must:

1. Be present in every variant.
2. Be a single literal type in every variant (one literal value per variant; not a literal-union).
3. Have a unique value across the variants.

If exactly one field qualifies, it is the discriminator. If multiple qualify, parse error: *`"ambiguous discriminator for X; candidates: <fields>. Declare explicitly with 'by <field>'."`* If none qualify, parse error: *`"X is a union of object schemas with no shared single-literal discriminator field. Add a 'kind' (or similar) field to each variant, or declare explicitly with 'by <field>'."`* Discriminator-less object unions are rejected because they degrade structured-output quality at every major provider.

The explicit form overrides detection:

```loom
schema Animal by species = Cat | Dog | Lizard
```

Duplicate discriminator values across variants are a parse error. The discriminator field must live at the **top level** of each variant; nested discriminators (`kind: { type: "x" }`) are rejected.

Mixed unions — `string | Author`, `Author | null` — are not discriminated; they lower as plain `anyOf` (or, when all arms are primitives, as the multi-type-array form `{"type": [...]}`).

**Recursion.** Any reference to a named schema lowers to `$ref` against the file's `$defs`. Self- and mutual recursion are supported transparently — authors don't write `$defs` or `$ref`:

```loom
schema Tree {
  value: number,
  children: array<Tree>,            // self-recursion
}

schema Person {
  name: string,
  spouse: Person | null,            // self-recursion via union
  pets: array<Animal>,              // mutual recursion
}

schema Animal {
  species: string,
  owner: Person | null,
}
```

The Schema Subset's depth ceiling applies to runtime JSON document depth, not to the schema graph — a recursive schema definition is fine; recursive *data* is bounded by the runtime cap.

#### Descriptions

Loom uses Rust-style `///` doc comments to attach descriptions. They lower to JSON Schema `description:` fields and are passed to the model when the schema is used for structured output — they materially improve output quality.

```loom
/// A user submitting a code review request
schema ReviewRequest {
  /// The programming language the code is written in
  language: string,

  /// Areas of concern to focus the review on
  focus_areas: array<string>,

  /// Author of the code being reviewed
  author: Author,
}

/// Severity classification for a single review finding
enum Severity {
  /// Trivial issues; no immediate action needed
  Low,
  /// Requires attention soon
  Medium,
  /// Must be fixed immediately
  High,
}

/// Top-level error returned by every query
schema QueryError = ValidationError
                  | TransportError
                  | ToolFailureError
                  | ContextOverflowError
                  | CancelledError
```

Rules:

- **Placement.** Above a `schema` declaration, an `enum` declaration, a field within a schema, or a variant within an `enum`. Not legal inline on the same line as the field.
- **Multi-line.** Consecutive `///` lines are joined with newlines into one description string. Common leading whitespace inside the description is stripped (same algorithm as query-template dedent). Empty `///` lines become blank lines.
- **Static text only in V1.** No `${param}` interpolation — schemas are evaluated at parse time, not per-query.
- **Markdown.** Description text is treated as Markdown by providers; no transformation is performed.
- **`//` is a regular code comment** — not propagated into the schema. The two-character vs three-character distinction is the only learning cost.

#### Field Separators and Comments

- Fields and enum variants are comma-separated; trailing comma is **optional**.
- `//` introduces a regular line comment (not part of any description).
- `///` introduces a description line (see above).

### Schema Subset

Loom's `schema` keyword does **not** target the full JSON Schema standard. It targets the **lowest common denominator of OpenAI Structured Outputs (strict mode) and Anthropic tool-use `input_schema` (strict mode)** — the intersection of what both providers' grammar-constrained decoders can enforce. The per-provider reasoning is recorded in `model-schema.md`; the normative subset is:

- **Types**: `string`, `number`, `integer`, `boolean`, `object`, `array`, `null`.
- **Composition**: `anyOf` only. `oneOf`, `allOf`, `not`, `if`/`then`/`else` are rejected at parse time.
- **Validation**: `enum`, `const`.
- **Objects**: `properties`, `required` (must list *every* declared property), `additionalProperties: false` (always emitted).
- **Arrays**: `items` (a single subschema). Bare `array` is not a Loom type; use `array<T>`.
- **Reuse**: `$defs` + `$ref`, including recursive references. Generated automatically by the lowering pass; authors do not write `$defs` or `$ref` directly.
- **Nullability**: expressed as a union with `null` (e.g. a `string | null` Loom type lowers to `{"type": ["string", "null"]}` or an `anyOf` with `{"type": "null"}`). The non-standard `nullable: true` modifier is **not** emitted.
- **Discriminated unions**: `anyOf` of object schemas distinguished by a single-literal discriminator field. The Loom surface syntax (`schema X = A | B | C`, with implicit detection or explicit `by <field>`) is described in [Schema Declarations](#schema-declarations).
- **Depth**: ≤ 5 levels of nesting at runtime (the JSON document depth, not the schema graph). Recursive schema definitions are fine; recursive *data* is bounded by the runtime cap. (OpenAI's stricter cap is treated as the shared ceiling.)
- **Draft**: JSON Schema Draft 2020-12 (required by Anthropic; compatible with OpenAI).

Explicitly **not** supported by `schema`, and rejected at parse time: `pattern`, `format`, `minLength`/`maxLength`, `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`, `multipleOf`, `minItems`/`maxItems`, `uniqueItems`, `contains`/`minContains`/`maxContains`, `patternProperties`, `propertyNames`, `minProperties`/`maxProperties`, `unevaluatedProperties`, `unevaluatedItems`, `dependentRequired`, `dependentSchemas`, `nullable`.

Rationale: every loom-declared `schema` is the response type of some typed query site (or is transitively reachable from one via `$ref`) and is therefore handed to the provider as a strict structured-output / tool-input schema. The type system cannot promise more than what both major providers can grammar-enforce, hence the intersection. Constraints the subset cannot express (string patterns, numeric bounds, array length, etc.) are out of scope for `schema` and belong in PI-side validation if needed.

### Parameters and Frontmatter

Like Pi prompts and subagents, loom files declare metadata in YAML frontmatter:

```yaml
---
description: Programmatic, parameterised code review
argument-hint: "<language> <focus_areas...>"
mode: subagent            # prompt | subagent
args: typed               # typed | prompt (default: typed)
model: claude-sonnet-4-5  # model used for every query in this loom
tools: read, grep, bash   # tools available to the model during query-time tool loops
system: |                 # system prompt for the conversation (subagent-only)
  You are an expert ${language} reviewer.
  Reviewer context: ${author.name} (${author.role}, ${author.experience_years}y).
retry:
  attempts: 3                  # max coercion follow-ups per typed query (default: 3)
  methodology: validator_error # how to phrase coercion turns (default: validator_error)
params:
  language: string
  focus_areas: array<string>
  author: Author
---
```

Frontmatter mirrors Pi's prompt-template frontmatter (`description`, `argument-hint`) plus loom-specific fields. **No `name` field** — the filename is canonical, exactly as for Pi prompts (`code-review.loom` is invoked as `/code-review`).

- `args` selects how slash-command arguments are surfaced inside the loom body. Two styles are supported (see [Argument Styles](#argument-styles) below).
- `params` are validated with AJV at invocation time and exposed as typed variables in the loom body. Only meaningful with `args: typed` — declaring `params:` together with `args: prompt` is a parse error.
  - **Defaults.** A param may declare a default with `field: type = literal`. The RHS must be a parse-time literal (string, number, boolean, `null`, or a JSON-shaped object/array literal); no expressions, no `${param}` interpolation. When a slash-command invocation omits the corresponding positional argument, the default is filled in before AJV validation. Defaults are the only place where literal-valued defaulting exists in V1; schema field declarations do not support defaults (JSON Schema's `default:` is advisory metadata, not provider-enforced, and would mislead authors about what the model emits).

    ```yaml
    params:
      language: string = "TypeScript"
      focus_areas: array<string> = []
      author: Author = { name: "anon", role: "developer", experience_years: 0 }
    ```
- `model` and `tools` follow the same shape as Pi subagent frontmatter and apply to **every** query in the loom — a single loom file shares one model and one tool set across all of its turns.
  - **`model`**: if frontmatter omits `model`, the loom inherits Pi's session default at invocation time. Once chosen, the model is fixed for the loom's lifetime; it does not re-resolve per query.
  - **`tools`**: if frontmatter omits `tools`, the loom runs with an **empty tool set** (the model cannot make tool calls). The Pi session's ambient tools are deliberately *not* inherited — tools have side effects, and silent inheritance produces "why did my loom touch the filesystem?" surprises. To opt into a tool, list it explicitly. `tools: []` and an absent `tools:` field are equivalent.
  - Per-query overrides and a project → loom → query cascade are deferred (see [Future Considerations](#future-considerations)).
- `system` declares the conversation's system prompt. **Subagent-mode only** — `system:` in a `mode: prompt` loom is a parse error, since prompt-mode looms attach to the user's existing Pi session whose system prompt belongs to Pi, not to the loom. In subagent mode, the field is fixed once when the spawned conversation is created and applies to every query the loom issues against it. If omitted, the spawned conversation has no system prompt (the model behaves under its training defaults).
  - **Interpolation.** The `system:` field supports `${param}` and `${param.field}` interpolation against the loom's typed `params`. The full Loom expression sublanguage is **not** available in this slot — only bare identifier paths — because the system prompt is evaluated once at conversation-creation time, before any loom code runs, and the simpler rule is unambiguous and easy to debug. For richer logic, omit `system:` and accept the reduced control-flow surface, or wait for per-query system overrides (deferred).
  - **`args: prompt`**: when used with `args: prompt`, `${1}`, `${@}`, `${ARGUMENTS}` (and only these forms) are interpolated against the slash-command arguments. The `${@:N}` / `${@:N:L}` slicing forms are **not** available in `system:` — they are template-body sugar only.
- `retry` controls how typed queries recover from schema-validation failures (see the [Query](#query) section). `attempts` bounds the number of follow-up coercion turns; `methodology` selects the phrasing strategy. Recognised methodologies (V1):
  - `validator_error` (default) — the follow-up turn includes the AJV validation error from the previous attempt.
  - `schema_repeat` — the follow-up turn re-states the expected schema without quoting a specific error.
  - `none` — no follow-up; the first failure is returned as `Err` immediately. Equivalent to `attempts: 0`.

  **When to use which.** `validator_error` is the right default for almost all looms: published evaluations of structured-output repair show error-feedback retries outperform schema-restatement, because they direct the model to the specific failure rather than re-reading the whole contract. Prefer `schema_repeat` only when:

  - The schema is small and the model keeps inventing fields — restating the schema reins it back in better than naming one missing-field error at a time.
  - The validator emits noisy or cascading errors from a single root mismatch (common with deeply nested unions), and the error tree is more confusing than the schema.

  Use `none` on hot paths where any single failure should fast-fail and the loom handles recovery itself with `match`.

#### Argument Styles

A loom picks one of two argument styles in frontmatter. The choice is per-loom; the styles cannot be mixed.

**`args: typed`** (default) — schema-first. Slash-command arguments bind positionally to the entries of `params:` in declaration order, each coerced through AJV against its declared schema. This is the style the rest of the spec illustrates (`Author`, `IssueList`, `ReviewScore`, etc.).

```yaml
---
args: typed
params:
  language: string
  focus_areas: array<string>
  author: Author
---
```

```loom
@`You are reviewing ${language} code by ${author.name}.`?
```

**`args: prompt`** — Pi-prompt style, no schema. Slash-command arguments arrive as raw strings using the same substitution surface Pi prompt templates use:

- `$1`, `$2`, ... — positional arguments, type `string`
- `$@` and `$ARGUMENTS` — all arguments joined into one `string`
- `${@:N}` — arguments from position N onward (template-only sugar)
- `${@:N:L}` — `L` arguments starting at N (template-only sugar)

The `$N` / `$@` / `$ARGUMENTS` forms are bound as `string`-typed locals in the loom scope and may appear in any expression position. The bash-style slicing forms `${@:N}` and `${@:N:L}` are sugar inside `@`...`` query templates only.

```yaml
---
args: prompt
argument-hint: "<topic> [extra context...]"
---
```

```loom
let plan: Plan = @`Draft a review plan for: $1. Extra context: ${@:2}`?
```

`args: prompt` is the right choice when the loom is essentially a Pi prompt template with control flow bolted on — the argument shape is text-shaped and AJV coercion would just get in the way. `args: typed` is the right choice when arguments have structure worth validating (objects, enums, arrays of typed elements).

The `args` style and the response-schema surface are **orthogonal**. `args: prompt` does not preclude typed queries inside the body; the slash-arg surface (untyped strings) and the response-validation surface (AJV-validated JSON) are independent dials. A loom whose input is free-form text but whose output should be structured is a natural combination:

```yaml
---
args: prompt
argument-hint: "<topic>"
---
```

```loom
let plan: Plan = @`Draft a structured review plan for: $@`?
```

#### Template Interpolation Disambiguation

The `@` character appears in two distinct lexical positions and is disambiguated by **position**, not by lookahead:

- **Top-level `@` followed by a backtick** — introduces a query template. Example: `@`...``. Lexer state: top-level expression mode.
- **`@` immediately after `${`** — the bash-style argument-slice sugar (`${@:N}` / `${@:N:L}`), valid only under `args: prompt` and only inside a `@`...`` query template. Lexer state: template-interpolation mode.

These never collide: the first occurs only in expression position outside any `${...}`, the second occurs only inside `${...}` inside a query template.

Inside a `${...}` interpolation, the lexer disambiguates further by peeking one character after the opening `${`:

- If the next character is `@`, parse the bash-style argument-slice form. Grammar: `'${' '@' ':' INT (':' INT)? '}'`. Anything else after `${@` is a parse error ("expected `:` after `@` in argument-slice").
- Otherwise, parse a Loom expression (the sublanguage from [Expression Sublanguage](#expression-sublanguage)) up to the matching `}`.

The braced bare form `${@}` is **not** legal; use the unbraced `$@` for "all args joined." The slicing forms `${@:N}` / `${@:N:L}` and the unbraced positional forms `$1`, `$@`, `$ARGUMENTS` are template-only sugar; outside `@`...`` query templates, the same effect is reached through normal expression code.

Under `args: typed`, none of the `$N` / `$@` / `$ARGUMENTS` / `${@:N}` / `${@:N:L}` forms are bound. Referencing any of them is an "unknown identifier" parse error, since `args: typed` exposes named `params` instead.

### Query

The `@`...`` query template is the only construct that crosses PI → ESI. It is an **expression** that sends a user turn and returns the model's response wrapped in a `Result`.

**Untyped form** — `Ok` value is the assistant's text response as a `string`:

```loom
let critique = @`Critique this code:\n${code}`?
```

Return type: `Result<string, QueryError>`.

**Typed form** — the response schema is **inferred from the surrounding type context**. The runtime hands the schema to the provider as a structured-output / strict tool-input contract and validates the response with AJV before returning it. The most common form is type-annotated `let`:

```loom
let score: ReviewScore = @`Rate the critique 1-5: ${critique}`?
```

Return type: `Result<Schema, QueryError>`, where `Schema` is the inferred response type.

**Schema inference rules.** The response schema flows into the query expression from any of the following type contexts, checked in order:

1. The annotated type of the binding being initialised (`let x: T = @`...`?`).
2. The declared return type of the enclosing function or loom, when the query is in tail-expression or `return`-argument position.
3. The declared parameter type of the enclosing call site (`f(@`...`?)` where `f`'s parameter has type `T`).
4. Explicit ascription via the explicit form (below).

If none apply, the query is untyped (returns `string`).

**Explicit form** — `@<Schema>`...`` overrides inference. Required in any expression position with no usable type context, such as the scrutinee of `match`:

```loom
let score = match @<ReviewScore>`Rate the critique 1-5: ${critique}` {
  Ok(s)  => s,
  Err(_) => ReviewScore { value: 0, reason: "unrated" },
}
```

The explicit form also wins over inference: if both a binding annotation and an explicit `<Schema>` are present, the explicit one is used (with a parse warning if they disagree).

**Multi-line templates.** Backtick templates span as many lines as needed; there is no separate heredoc form. Loom applies two normalisations to the rendered text:

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

**Escapes.** Inside a query template:

- `\``    — literal backtick
- `\$`    — literal `$` (suppresses interpolation when followed by `{`)
- `\\`    — literal backslash
- `\n`, `\t`, `\r` — standard string escapes (rarely needed; literal newlines in the template body work directly)

No other escapes are recognised; a backslash followed by any other character is a parse error. Curly braces `{` and `}` need no escape — they are ordinary text content. Only the sequence `${` (and the `}` that closes a corresponding `${...}`) has special meaning.

**Discarded query results are a parse error.** The author must pick one of:

```loom
@`Summarise the discussion above.`?      // propagate failure via early-return
let _ = @`Summarise the discussion above.`  // discard both Ok and Err explicitly
let summary = @`Summarise the discussion above.`?  // bind the success value
```

The diagnostic on a bare `@`...`` expression-statement reads: *"discarded query result; use `?` to propagate failure or `let _ = @`...`` to discard explicitly."* The intent is to force the author to acknowledge the `Result` once, at the call site, with a one-character change.

`let _ = expr` is a real binding form for any expression — not just queries — making the same escape hatch available to any future `#[must_use]`-style type. A `void`-returning function whose **tail expression** is `@`...`` is not a discard: the `Result` is the function's return value and the caller is responsible for it. Only true expression-statement position triggers the error.

**Tool calls during a query.** If the model responds with tool-use, the runtime executes the requested tool against the loom's frontmatter `tools` set, feeds the result back to the model, and loops until the model produces a final (non-tool-call) response. That final response is what the query returns. A response schema, if given, is enforced against the final response only — not against intermediate tool-call payloads.

**Untyped return type (V1).** The `Ok` payload of an untyped query is a plain `string` containing the assistant's final text. V1 deliberately keeps it as `string` to minimise surface area; freezing a richer structure before real provider integration would lock in details that real-world use is likely to revise. Future widening (e.g. to a `Result<string | AssistantMessage, QueryError>` shape exposing tool-use traces, multiple content blocks, citations) is expected to be backward compatible — existing `string`-typed call sites will keep working under the union form.

**Failure modes.** A query never throws. Both forms return a `Result` (see [Errors and Results](#errors-and-results)) carrying a `QueryError` on failure. `QueryError` is a discriminated union (`anyOf` over `kind`-tagged variants), exactly the shape the [Schema Subset](#schema-subset) blesses for user-defined unions — the canonical example of the pattern, applied to Loom's own runtime type. The variants:

```loom
schema ValidationFailure {
  path: string,           // JSON pointer, e.g. "/issues/0/severity"
  message: string,        // human-readable summary of the failure
  schema_keyword: string  // "type", "required", "enum", "const", ...
}

schema ValidationError {
  kind: "validation",
  message: string,
  attempts: number,                          // coercion follow-ups made before giving up
  validation_errors: array<ValidationFailure>,
  raw_response: string | null                // final malformed assistant text
}

schema TransportError {
  kind: "transport",
  message: string,
  http_status: number | null,                // null on network-level failure (no HTTP response)
  provider: string,                          // "openai" | "anthropic" | ...
  retryable: boolean                         // whether the runtime considers a retry worth attempting
}

schema ToolFailureError {
  kind: "tool_failure",
  message: string,
  tool_name: string,
  tool_call_id: string,
  raw_response: string | null                // any text the model produced before the tool loop crashed
}

schema ContextOverflowError {
  kind: "context_overflow",
  message: string,
  tokens_used: number | null,
  tokens_limit: number | null
}

schema CancelledError {
  kind: "cancelled",
  message: string
}

schema QueryError = ValidationError
                  | TransportError
                  | ToolFailureError
                  | ContextOverflowError
                  | CancelledError
```

Design notes:

- Each variant carries only its meaningful fields; there are no null-padded sentinel fields shared across variants. Authors `match` on `QueryError { kind: "...", ... }` (pattern grammar from [Errors and Results](#errors-and-results)) and only the relevant variant's fields are in scope.
- `validation_errors` is an `array<ValidationFailure>`, a Loom schema rather than raw AJV objects. This isolates Loom's surface from the AJV API: a future validator swap is not a breaking change.
- The `union` form `schema X = A | B | C` shown above is the surface syntax for a discriminated union; it lowers to `anyOf` of the variant schemas, with the runtime relying on the `kind` `const` field as the discriminator. Surface syntax is the same the user would use to declare their own discriminated unions in any other context.
- `raw_response` only appears on variants where the model produced (or attempted to produce) a final text response. `cancelled` and `context_overflow` rarely have one; `transport` failures by definition have no assistant response.

**Schema-validation coercion.** When a typed query's final response fails AJV validation, the runtime attempts **coercion via follow-up turns**, not by re-issuing the original query. This distinction matters: a query may have produced tool-call side effects (file writes, API calls, network requests) on the way to its malformed final response. Re-issuing the original user turn would risk firing those side effects a second time. Coercion instead appends a *new* user turn to the same conversation — phrased per the loom's `retry.methodology` — and awaits a corrected response. The conversation history, including the malformed response and any tool calls that preceded it, stays intact.

Coercion follow-ups are bounded by `retry.attempts` from frontmatter (default 3). When attempts are exhausted, the typed query returns `Err(QueryError { kind: "validation", ... })`. A coercion follow-up may itself trigger tool calls; the runtime services those the same way as in the original query, then validates the resulting response. Each follow-up counts as one against `retry.attempts` regardless of how many tool-call iterations it contains.

Non-validation failures (`transport`, `tool_failure`, etc.) are not retried by the query primitive; the loom is responsible for whatever recovery makes sense. Wrapping retries at the loom level via a function plus `match` is the expected pattern.

### Expression Sublanguage

Loom expressions are a bounded subset of TypeScript. The same grammar applies wherever an expression is expected: the RHS of `let`, `if` / `match` scrutinees, function arguments, and inside `${...}` template interpolations.

**Supported forms:**

- Literals: `string` (single- or double-quoted), `number`, `boolean` (`true` / `false`), `null`
- Identifiers (variables, parameters, function names, schema constructors)
- Member access: `a.b`
- Indexed access: `a["b"]`, `a[0]`, `a[i]`
- Function and method calls: `f(x)`, `obj.method(x, y)`
- Unary: `!`, `-`
- Binary arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`
- Logical: `&&`, `||`
- Ternary: `cond ? a : b`
- Parenthesised: `(expr)`
- Query templates (back-tick prefixed by `@`): the literal form of the [Query](#query) expression; `${...}` inside them takes any expression listed above

**Not supported (parse error):**

- Assignment in expression position (`=`, `+=`, etc.) — assignment is a statement, see [Bindings and Mutability](#bindings-and-mutability)
- Field- or index-level mutation (`obj.field = ...`, `arr[i] = ...`) — only whole-binding rebinding is supported in V1; see [Bindings and Mutability](#bindings-and-mutability)
- Arrow functions and any callback-taking higher-order method (no `map` / `filter` / `reduce`; use `for`)
- Spread / rest (`...`)
- `new`, `typeof`, `instanceof`, `delete`, `void`, `yield`, `await`
- Optional chaining (`?.`) and nullish coalescing (`??`)
- Strict equality (`===`, `!==`) — Loom `==` is structural (see below)
- Bitwise operators (`& | ^ ~ << >> >>>`)
- Increment / decrement (`++`, `--`)
- Comma operator
- Nested template strings inside a `${...}` interpolation
- Query templates (`@`...``) and `match` inside `${...}` — both are allowed at statement / `let`-RHS level only, so template evaluation is guaranteed to be PI-only and never silently fires a model turn

**Equality.** `==` is structural: deep value equality for objects and arrays, value equality for primitives. There is no `===`.

**Truthiness.** Only `true` and `false` are accepted in boolean position (`if`, `while`, `&&`, `||`, ternary condition). Using a non-boolean (`if (x)` where `x: string`) is a parse error; write `if (x != "")`, `if (xs.length > 0)`, etc. This avoids the JS empty-string / zero / `null` ambiguity.

**Built-in methods.** A small stdlib is exposed on the primitive composite types. No user-defined methods; no `this`. V1 set:

- `string`: `length` (property), `toLowerCase()`, `toUpperCase()`, `trim()`, `startsWith(s)`, `endsWith(s)`, `includes(s)`, `split(sep)`, `replace(from, to)`
- `array`: `length` (property), `join(sep)`, `includes(x)`, `indexOf(x)`, `slice(start, end?)`, `concat(other)`
- `object`: `keys()`, `values()`, `has(k)`

Additional methods may be added non-breakingly later. Anything not on this list is a parse-time "unknown method" error rather than a runtime failure.

### Bindings and Mutability

Loom follows Rust's *immutable-by-default, opt-in mutability* convention. The two binding forms:

```loom
let x = 0          // immutable; rebinding x is a parse error
let mut count = 0  // mutable; count may be reassigned
```

**Reassignment** is a statement, never an expression. The plain form and the compound forms `+=`, `-=`, `*=`, `/=`, `%=` are all legal on `let mut` bindings; the RHS must type-match the binding's declared or inferred type:

```loom
let mut count = 0
count = count + 1
count += 1

let mut findings: array<Finding> = []
findings = findings.concat([new_finding])
```

Because assignment is statement-only, `if (x = 1) { ... }` is a parse error. Use a separate `let mut` + `if` instead.

**Mutability is binding-level only.** V1 does not support `obj.field = ...` or `arr[i] = ...`. Update by rebinding the whole value — `concat`, `slice`, etc. already return fresh values, and `let mut` lets you swing the binding to point at the new one. This keeps data structurally immutable (no aliasing semantics to define) and matches the rest of the stdlib's pure-function style.

**Immutable contexts.** The following bindings are always immutable; `mut` on any of them is a parse error:

- Function parameters
- `for` iteration variables (`for x in xs { ... }` — `x` is a fresh immutable binding per iteration)
- `match` pattern bindings
- The discard form `let _ = ...` (also: `let mut _ = ...` is a parse error — `_` cannot be reassigned)

Function parameters being immutable is a deliberate V1 simplification; per-parameter `mut` (Rust's `fn f(mut x: T)`) can be added non-breakingly later if it earns its keep.

**Increment / decrement.** `++` and `--` remain parse errors. Use `count += 1` / `count -= 1`. Same Rust rationale: one obvious way, no prefix-vs-postfix confusion.

### Control Flow

Loom has three loop and branch forms. Because a query returns a value, control flow can branch on what the model just said.

**`if` / `else`** — statement form (the ternary `cond ? a : b` is the expression form):

```loom
if author.experience_years < 2 {
  @`Re-explain your top recommendation in simple language.`?
}
```

**`for` ... `in`** — iterates an array, binding the iteration variable as a fresh immutable local per iteration:

```loom
for area in focus_areas {
  let issues: IssueList = @`
    Review the code specifically for ${area} concerns:
    ${code}
  `?

  if issues.severity == "high" {
    @`Suggest concrete fixes for the high-severity ${area} issues you just listed.`?
  }
}
```

**`while`** — repeats while the condition is `true` (truthiness rule applies — only `true`/`false` accepted):

```loom
let mut round = 0
let mut satisfied = false
while !satisfied && round < 5 {
  let critique = @`Critique round ${round + 1}: ${draft}`?
  let verdict: Verdict = @`Is the critique addressed? ${critique}`?
  satisfied = verdict.done
  round += 1
}
```

**`break` / `continue`** — bare statements; legal only inside `for` / `while` bodies. `break` exits the innermost enclosing loop; `continue` skips to the next iteration. Neither carries a value in V1; if value-carrying `break expr` is needed it can be added non-breakingly later (Rust adds it only inside `loop { }`, not `while`).

```loom
for area in focus_areas {
  let issues: IssueList = @`Review for ${area}`?
  if issues.findings.length == 0 {
    continue
  }
  if issues.severity == "critical" {
    break
  }
  @`Drafting fixes for ${area}...`?
}
```

### Errors and Results

All queries return `Result<T, QueryError>`. The language provides two destructuring forms.

**`match` expression** — exhaustive destructuring; arms evaluate to a value, so `match` is itself an expression:

```loom
let score = match @<ReviewScore>`Rate the critique 1-5: ${critique}` {
  Ok(s)  => s,
  Err(e) => ReviewScore { value: 0, reason: "unrated: ${e.message}" }
}
```

**Pattern grammar (V1).** A `match` arm's left-hand side is one of:

| Pattern | Example | Matches |
|---|---|---|
| Wildcard | `_` | anything; binds nothing |
| Identifier | `x` | anything; binds the value to `x` |
| Literal | `"validation"`, `0`, `true`, `null` | structural equality |
| Constructor | `Ok(p)`, `Err(p)` | the named `Result` variant; recurses into `p` |
| Object/schema | `QueryError { kind: "validation", attempts }` | object whose listed fields match the inner patterns; unlisted fields are ignored. Field shorthand `{ attempts }` is sugar for `{ attempts: attempts }` |
| Array | `[a, b]`, `[first, _, _]` | exact-length array; each slot matches its pattern |

Disambiguation: lowercase identifiers bind, capitalised identifiers refer to constructors or schema names. `Ok` and `Err` are reserved.

Guards (`Ok(x) if x.value > 3 => ...`) and rest patterns (`[first, ...rest]`, `{ kind, ...other }`) are not in V1; both can be added non-breakingly later.

**Exhaustiveness.** Not statically checked in V1. The analyser cannot enumerate the runtime values of `QueryError.kind` from the type system, so static exhaustiveness would be unsound. A `match` whose arms collectively fail to cover the scrutinee at runtime raises a `MatchError`. Authors who want a catch-all should add a final `_ => ...` arm.

**Arm syntax.** `pattern => expression`, comma-separated. The trailing comma after the last arm is optional.

**`?` operator** — unwraps `Ok` to the inner value; on `Err`, *early-returns* the `Err` from the enclosing function (or top-level loom block). The enclosing scope's return type must therefore be `Result<_, QueryError>` (or convertible). Concretely:

```loom
let critique = @`Critique this code:\n${code}`?  // string on success; early-return Err otherwise
```

Is equivalent to:

```loom
let critique = match @`Critique this code:\n${code}` {
  Ok(s)  => s,
  Err(e) => return Err(e)
}
```

A function or loom that uses `?` thus implicitly returns `Result<T, QueryError>` where `T` is the type of its last expression. A function that uses neither `?` nor an explicit `Result` return type is required to handle every query failure with `match` (or to discard with the silent-drop semantics described in [Query](#query)).

**`Result` as a user-visible type.** `Result<T, E>` is a built-in two-variant type with constructors `Ok(value)` and `Err(error)`. Looms may declare functions returning `Result<T, QueryError>` explicitly, and may construct `Ok` / `Err` directly to bridge to PI-side error handling. User-defined error types beyond `QueryError` are out of scope for V1.

### Return Statement

`return expr` exits the enclosing function (or top-level loom block) immediately, producing `expr` as the value of that scope. `return` is a statement, not an expression.

```loom
fn first_high_severity(areas: array<string>): Result<string, QueryError> {
  for area in areas {
    let issues: IssueList = @`Review for ${area}`?
    if issues.severity == "high" {
      return Ok(area)
    }
  }
  Ok("")
}
```

Rules:

- `return expr` is type-checked against the enclosing scope's declared return type. The same inference rule that applies to a tail expression applies to `return`'s argument.
- Bare `return` (no argument) is legal only inside a `void` function or `void` top-level loom; elsewhere it is a parse error ("missing return value").
- At the top level of a loom, `return expr` exits the loom with `expr` as its return value, exactly as a tail expression would.
- Code after a `return` in the same block is unreachable; the parser produces a warning, not an error.
- The `?` operator's `Err`-arm desugaring is literally `return Err(e)`; no separate magic is needed.

### Function Definitions

Functions encapsulate reusable orchestration. A function body is a block; its value is the value of its last expression (Rust-style). Top-level loom files follow the same rule — the loom's return value is the value of the last expression of the top-level block.

```loom
fn rate_strictness(p: Author): Result<ReviewScore, QueryError> {
  @`
    Reviewer context: ${p.name} (${p.role}, ${p.experience_years}y experience).
    Rate this reviewer's likely strictness 1-5.
  `
}

let strictness = rate_strictness(author)?
```

A function whose body uses `?` must declare a `Result<_, QueryError>` return type, since `?` early-returns `Err`. A function whose purpose is purely to drive turns without producing a value can declare a `void` return type and discard its last expression's value (with the same silent-drop caveat as expression-statement queries).

A function call participates in the loom's *current* conversation; it does not open a new one. To open a new isolated conversation, invoke another loom in subagent mode (see [Invocation](#invocation)).

### Invocation

A loom may invoke another loom via the built-in `invoke` expression. This is the only way for a `.loom` to spawn or attach to another `.loom`'s execution; `import` is reserved for `.warp` library code.

```loom
let plan: Plan = invoke<Plan>("./plan.loom", topic, depth)?
let _ = invoke("./logger.loom", note)?
```

**Resolution.** `path` is a string literal, resolved at parse time relative to the calling loom's directory. It must end in `.loom`. Dynamic dispatch (a runtime-computed path) is not supported in V1.

**Typed return.** `invoke<Schema>(...)` annotates the expected return type; the runtime AJV-validates the child's return value against the schema. Untyped `invoke(...)` returns `Result<unknown, InvokeError>` and the value must be discarded (`let _ = ...`) or matched.

**Argument binding.** Arguments bind to the callee's `params:` according to the callee's `args:` style (`typed` or `prompt`), exactly as if the loom had been invoked from a slash command. Type mismatches surface as parse errors when the callee's frontmatter is statically resolvable; the parser type-checks across the invocation boundary.

**Cross-mode semantics.** The callee's mode controls whether it gets a fresh conversation or attaches to its caller's current conversation. The caller's mode is irrelevant to that decision — a subagent's "current conversation" is already its own private one, so a prompt-mode child writing into it stays inside that private context.

| Caller mode | Callee mode | Effect |
|---|---|---|
| prompt | prompt | Child attaches to caller's current conversation (the user's session). Child's queries are user-visible turns. |
| prompt | subagent | Child spawns a fresh isolated conversation; only the return value reaches the caller. |
| subagent | prompt | Child attaches to the caller's current conversation — which is the caller subagent's own private one. Nothing leaks to the grandparent. |
| subagent | subagent | Child spawns a fresh isolated conversation, sibling to (not nested under) the caller's. |

**Tools and model.** The child uses *its own* frontmatter `model`, `tools`, and `system`. The caller's settings are not inherited. Same justification as for queries: tool/model/system inheritance produces surprise.

**Failures.** `invoke` returns `Result<T, InvokeError>` where `InvokeError` discriminates by `kind`:

- `load_failure` — the callee file could not be read.
- `parse_failure` — the callee file failed to parse.
- `callee_error` — the callee returned `Err(_)`. The original error is wrapped in an `inner` field.
- `validation` — typed `invoke<Schema>` only; the child's return value failed AJV validation.
- `timeout` — the callee exceeded its time budget (TBD how this is configured).
- `cancelled` — the callee (or caller) was cancelled mid-invoke.

**Cycle detection.** Invocation cycles are detected at parse time by walking statically resolvable `invoke` paths. If `A.loom` invokes `B.loom` invokes `A.loom`, the second discovery is a parse error ("invocation cycle: A → B → A"). Recursion through subagent-mode looms is allowed where each invocation spawns a fresh sibling conversation; recursion through prompt-mode looms is allowed but must terminate via control flow, just like ordinary function recursion.

### Imports

`.loom` files import schemas and functions from **`.warp`** files — a separate extension dedicated to shared loom library code. `.loom` files are *not* importable from each other. This split keeps invocable looms (slash commands) and reusable building blocks (libraries) cleanly separated.

```loom
import { Author, persona_block } from "./shared/personas.warp"
```

**`.warp` file rules:**

- Top-level may contain only `import`, `export`, `schema`, and `fn` declarations. No top-level statements, `let` bindings, or queries (parse error).
- Inside `fn` bodies, the full Loom language is available, including `@`...`` queries. A query inside an imported function executes against the *calling* `.loom`'s conversation when the function is invoked.
- Never slash-command-discovered. A `.warp` file is invisible to the `/<name>` autocomplete; it is only ever reached via `import`.

**Path resolution.** V1 supports relative paths only: `"./shared/personas.warp"`, `"../lib/schemas.warp"`. Paths must end in `.warp` and resolve relative to the importing file's directory. Project-rooted (`/looms/...`) and package-style (`@scope/pkg`) imports are out of scope for V1; they may be added later when looms-as-packages becomes a real use case.

**Visibility.** Every top-level `schema` and `fn` in a `.warp` file is implicitly exported. There is no `export` keyword on declarations and no privacy modifier; `.warp` files have no internal-only symbols in V1.

**Re-exports.** A `.warp` may re-export a symbol from another `.warp` using a dedicated form that creates no local binding:

```loom
export { Author } from "./personas.warp"
export { Author as Reviewer } from "./personas.warp"
```

A plain `import { Author } from "./personas.warp"` does **not** re-export `Author` from the importing file — only declarations and explicit `export ... from` forms are visible to downstream importers.

**Name collisions.** Two imports bringing in the same symbol name is a parse error. Resolve with `as`-aliasing:

```loom
import { Author as AuthorA } from "./team-a.warp"
import { Author as AuthorB } from "./team-b.warp"
```

The same `as` form is also available for self-clarity (`import { ReviewScore as Score } from "./scoring.warp"`). An imported symbol whose name collides with a top-level declaration in the same file is also an error — no implicit shadowing.

**Cycles.** Import cycles between `.warp` files are detected at parse time by walking the static import graph and reported as a parse error with the cycle path printed (`"import cycle: a.warp → b.warp → a.warp"`). `.warp` files contain only declarations — no top-level statements, no initialisation order — so cycles serve no purpose and only happen by accident.

---

## Extension Architecture

### Pi Extension Integration

`pi-loom` registers with Pi Agent as an extension in the standard way, providing:

- **Slash-command discovery** of `.loom` files — each loom appears in autocomplete as `/<filename>` (without `.loom`), exactly mirroring Pi's prompt-template behaviour. The `description` and `argument-hint` from frontmatter populate the autocomplete entry. `.warp` files are deliberately *excluded* from slash-command discovery; they are library code, never commands.
- A **file watcher** (optional) so edits to `.loom` and `.warp` files take effect without a session restart
- Schema validation at parse time, surfacing errors as Pi-compatible diagnostics

### Directory Convention

Loom files are discovered from the same locations as Pi prompt templates, just with a different leaf directory:

- Global: `~/.pi/agent/looms/*.loom`
- Project: `.pi/looms/*.loom`
- Packages: `looms/` directories or `pi.looms` entries in `package.json`
- Settings: `looms` array with files or directories

Discovery is **non-recursive** and matches only `*.loom`, mirroring Pi prompt-template behaviour. `.warp` library files are never discovered as slash commands regardless of where they live; they are reached only via `import`.

```
project/
├── looms/
│   ├── code-review.loom         # discovered → /code-review
│   ├── architecture-brief.loom  # discovered → /architecture-brief
│   ├── personas.warp            # library — importable, never a slash command
│   └── shared/
│       └── schemas.warp         # library in a subdirectory; importable via path
```

### Invocation from Pi

A loom is invoked as a slash command using its filename, exactly like a Pi prompt template:

```
/code-review TypeScript "error handling,types" Ada
```

Argument binding depends on the loom's `args` frontmatter setting (see [Argument Styles](#argument-styles)):

- **`args: typed`** — Positional binding by `params:` declaration order. The first slash-command argument binds to the first declared param, and so on. Each argument is coerced through AJV against the corresponding param's schema. Bare `/code-review` with no arguments is valid only if every param has a default or is nullable; otherwise the runtime surfaces a Pi-compatible diagnostic listing the missing params.

  **Coercion rules** for slash-arg → typed value:

  | Target type | Coercion |
  |---|---|
  | `string` | as-is |
  | `number` / `integer` | `parseFloat` / `parseInt`; reject `NaN` |
  | `boolean` | `"true"` / `"false"`, case-insensitive; anything else rejects |
  | `null` | the literal `"null"` |
  | `array<string>` | comma-split, **no escaping**; whitespace trimmed per item; empty items between commas are rejected (`"a,,b"`) |
  | `array<number>` / `array<integer>` / `array<boolean>` / `array<null>` | comma-split, then per-element coerced as above; failure on any element fails the whole argument with an AJV error pointing at the index |
  | `array<Schema>` (object element) | require a single JSON-literal argument (`'[{...},{...}]'`) |
  | `array<array<...>>` (nested) | require a single JSON-literal argument |
  | `Schema` (object) | a single JSON-literal argument (`'{"name":"Ada",...}'`) |

  **Sharp edge.** The `array<string>` comma-split layer does not support escaping; embedded commas are not recoverable. If items may contain commas, use `args: prompt` and parse `$@` (or `$ARGUMENTS`) yourself. Object and nested-array params at the slash prompt are also hostile to type — a JSON literal at the command line is fine for tooling-driven invocation but unpleasant for humans. Looms that take richly-shaped params should consider `args: prompt` plus a setup-turn pattern, or wait for named-argument syntax (deferred; see [Future Considerations](#future-considerations)).

  **Setup-turn pattern (recommended for human-invoked looms with structured params).** When a typed loom takes structured params and the primary caller is a human (rather than another loom via `invoke` or a programmatic harness), keep `params:` minimal — typically just an unstructured `topic: string` — and gather structure inside the loom body via a setup query (often a typed query bound to a `let x: Author = @`...`?` that asks the user to confirm or fill in fields conversationally). AJV-typed object params remain the right choice for `invoke` callers and for tooling-driven entry points where JSON literals are natural; the setup-turn pattern is purely for the human-at-a-prompt case.
- **`args: prompt`** — Arguments are passed through as raw strings and exposed as `$1`, `$2`, `$@`, `$ARGUMENTS` (and template-only `${@:N}` / `${@:N:L}` sugar) inside the loom body. No coercion or validation is performed; the loom author is responsible for any parsing.
- **`argument-hint`** in frontmatter drives the autocomplete dropdown shown to the user, regardless of style.

Key=value or named-argument syntax (e.g. `/code-review language=TypeScript`) is *not* part of the V1 surface for either style. If positional binding proves too brittle for richly-shaped params, named arguments may be added later.

Once a loom is invoked:

- In **prompt mode**, the loom drives the *current* conversation — every query is a turn the user sees in their session. The loom's final `Ok` return value is **not** surfaced to the user; the conversation is the user-facing surface, and any value the author wants the user to see should be issued as a final query whose text contains it. The return value exists only for programmatic consumers (an `invoke` caller, a future loom harness).
- In **subagent mode**, a fresh isolated conversation is spawned for the loom — with the system prompt set from frontmatter `system:` if present. Every query is a turn in that private conversation. When the loom finishes, only its return value reaches the caller; the intermediate transcript stays inside the subagent.

**Top-level `Err` in prompt mode.** When a prompt-mode loom returns `Err(QueryError)` to its caller (the user's session), Pi appends a one-line system note to the session formatted from the error. The note never dumps the full `QueryError` JSON — it summarises the failure category and the most-relevant detail. Per-`kind` formatting:

| `QueryError.kind` | System note shape |
|---|---|
| `validation` | "loom `/<name>` returned `Err`: model failed schema after `<n>` coercion attempts" |
| `transport` | "loom `/<name>` returned `Err`: transport — `<message>`" |
| `tool_failure` | "loom `/<name>` returned `Err`: tool `<tool_name>` failed — `<message>`" |
| `context_overflow` | "loom `/<name>` returned `Err`: context window exceeded" |
| `cancelled` | "loom `/<name>` cancelled" |

The session is not aborted; the user can type a follow-up turn. When the leaf failure originated inside an `invoke`d child loom that cascaded out via `?`, the note identifies the leaf and prints the call chain (`"... from child.loom invoked at parent.loom:42"`).

This behaviour depends on Pi's session API exposing "append a system note to the current session." Confirming the exact API shape is an implementation task, not a spec blocker.

---

## Comparison with Existing Pi Features

| Feature | Pi `prompt` | Pi `subagent` | `pi-loom` |
|---|---|---|---|
| Instructions for | ESI | ESI (isolated) | PI + ESI (boundary) |
| Logic/control flow | None | None | Full (loops, conditionals, functions) |
| Parameterization | YAML frontmatter | YAML frontmatter | Typed params + schemas |
| Type system | Untyped strings | Untyped strings | JSON / JSON Schema |
| Conversation context | Current | New (isolated) | Either (mode-controlled); loom drives N turns inside it |
| Output | Injected text | Injected text | Multi-turn conversation drive; loom return value (Rust-style last-expression) |
| File format | Markdown `.md` | Markdown `.md` | Loom `.loom` |

---

## Prior Art

pi-loom is one project in a crowded space of *prompt-as-program* tools. Two distinctions matter for positioning:

- **Layer.** *Orchestration-layer* tools sit above a finished provider API and drive multi-turn conversations, parse and validate responses, and run tool loops at the message level. *Inference-layer* tools hook into the model's token-generation loop itself via logit biasing, grammar masks, or controller VMs. The two compose: an orchestration tool can consume an inference tool's structured-output contract. **pi-loom is an orchestration-layer tool.**
- **Surface.** Declarative (YAML / DAG) vs. imperative (a real language with statements and expressions). pi-loom is imperative; its closest functional twin, IBM's PDL, is declarative.

The work below is grouped accordingly.

### Closest neighbours (orchestration layer)

| Project | Surface | Multi-turn unit | Typed responses | Relation to pi-loom |
|---|---|---|---|---|
| [**PDL**](https://github.com/IBM/prompt-declaration-language) (IBM Research) | Declarative YAML with Jinja2 templating | YAML blocks accumulated into a background conversation context | JSON Schema | **Functional twin in declarative dress.** Same layer, same context-accumulation model, same JSON Schema typing, same ambitions (RAG, ReAct, tool loops, function definitions, type-checked I/O, automatic prompt tuning). The split is the same as mech-vs-loom: PDL declarative, loom imperative. PDL is what loom would look like if YAML had won the surface debate. |
| [**mech**](../backlot) (sibling, see [Heritage](#heritage-and-relationship-to-mech)) | Declarative YAML + CEL guards | Function-as-conversation-boundary CDFG | JSON Schema | Direct ancestor for typed-function unit-of-composition and conversation-isolation rules. |

### Other orchestration-layer tools

- [**DSPy**](https://dspy.ai) (Stanford NLP) and [**ax**](https://github.com/ax-llm/ax) — modules with declarative signatures plus a *prompt optimiser* (MIPRO, GEPA, etc.). Orchestration-layer with prompt compilation; pi-loom rejects the compilation step — the loom *is* the prompt.
- [**BAML**](https://github.com/BoundaryML/baml) (Boundary) — dedicated function-per-LLM-call DSL with schema-aligned parsing. Closest comparable on the type-system axis but single-call: multi-turn orchestration lives in the host language. pi-loom drives many queries per loom.
- [**TypeChat**](https://github.com/microsoft/TypeChat) (Microsoft) — TypeScript interfaces as schemas; single call + LLM-driven repair loop on validation failure. The repair-loop pattern maps onto loom's typed-query coercion-via-follow-up behaviour.
- [**Promptflow**](https://github.com/microsoft/promptflow) (Microsoft) — YAML DAGs of LLM / Python / prompt nodes; topological execution; visual DAG editor. Declarative-DAG cousin of mech and PDL.
- [**ControlFlow**](https://github.com/PrefectHQ/ControlFlow) (Prefect) — Python tasks/agents/flows on top of Prefect's workflow engine; observability-first; not a DSL.
- **LangChain LCEL** — Python `|`-operator composition language for chains. Broader scope than loom; lighter typing.
- [**Instructor**](https://python.useinstructor.com), [**PydanticAI**](https://ai.pydantic.dev), [**Mirascope**](https://mirascope.com) — Python decorators wrapping a single LLM call into a typed Pydantic-returning function. Single-call wrappers; multi-turn lives in host Python.

### Inference-layer tools (different layer, often miscategorised)

These projects are often cited alongside orchestration tools because they expose multi-call programs with control flow, but they hook into the model's token-generation path rather than driving a provider API from outside. pi-loom is a *consumer* of the structured-output / strict-tool-input contracts these projects help establish; it does not compete with them.

- [**Guidance**](https://github.com/guidance-ai/guidance) (Microsoft) — `lm += gen()` chained generation; logit biasing and regex / CFG token masks.
- [**LMQL**](https://lmql.ai) (ETH Zurich) — standalone DSL compiled to token-level constraint masks applied during decoding.
- [**SGLang frontend**](https://github.com/sgl-project/sglang) (Berkeley Sky) — Python-embedded DSL co-designed with a runtime providing RadixAttention KV-cache reuse and other inference optimisations.
- [**Outlines**](https://github.com/dottxt-ai/outlines) (.txt) — grammar-constrained generation via token masks at decode time.
- [**AICI**](https://github.com/microsoft/aici) (Microsoft) — WebAssembly controllers running per-token alongside generation.

### Where pi-loom sits

pi-loom's single closest functional comparable is **PDL**: same orchestration layer, same conversation-accumulation model, same JSON Schema typing, same agentic-pattern ambitions. The distinguishing axes:

1. **Imperative `.loom` + `.warp` surface**, not declarative YAML. Looms read as straight-line programs with `let`, `if`, `for`, `match`, `?`, and query-as-expression.
2. **Pi-native integration** — `.loom` files become `/<name>` slash commands; frontmatter inherits Pi's prompt/subagent conventions; tool exposure mirrors Pi subagents.
3. **JSON-Schema response types** drawn from the OpenAI / Anthropic strict-mode intersection (see [Schema Subset](#schema-subset)), not arbitrary JSON Schema.
4. **Two execution modes** (prompt vs subagent) inherited from Pi, giving the same loom code two well-defined conversation targets.
5. **No prompt compilation.** Loom does not optimise prompts the way DSPy/ax do; what the author writes is what the model sees.

---

## Implementation Notes

### Parser

- Toolkit: **Chevrotain** (TypeScript-native, no separate lexer generator required)
- Grammar basis: **TinyC** Chevrotain example, extended with `@`...`` query templates, `schema`, and the type-context schema-inference pass
- Parse errors surface as structured diagnostics compatible with Pi's error reporting

### Runtime

- Implemented in TypeScript as a Pi extension module
- Holds a reference to the target conversation (the caller's session for prompt mode; a freshly spawned isolated session for subagent mode) and drives it turn-by-turn
- Each `@`...`` query issues a user turn against that conversation, services any tool-call loop the model returns, and resolves to the final assistant response
- Typed queries (schema inferred from binding type, function parameter, return type, or explicit `@<Schema>`...``) lower the schema to the provider's structured-output / strict tool-input contract; the returned response is validated with **AJV** before being handed back to PI code
- For subagent-mode looms, the spawned conversation's system prompt is taken from frontmatter `system:` (with `${param}` interpolation resolved at conversation-creation time) and applied to every query against that conversation
- Parameter schemas (frontmatter `params`) are likewise validated with AJV at invocation time
- The loom's overall return value is the value of the last expression of its top-level block

### Future Considerations

- LSP support for `.loom` and `.warp` files (syntax highlighting, type checking, autocomplete)
- A `loom test` command for dry-run execution that runs a loom against a recorded transcript or a stub model without hitting a live provider
- First-class loom values (`Loom<T>` type, passing looms as arguments, higher-order composition) — V1 only supports literal-path `invoke`
- Per-query overrides for `model`, `tools`, and `system` (project → loom → query cascade)
- User-defined error types beyond `QueryError`
- Richer expression sublanguage inside frontmatter `system:` (full `${expr}` interpolation rather than just `${param}` paths)
- Named-argument / key=value invocation syntax
- Cancellation propagation between parent looms and in-flight subagent looms
