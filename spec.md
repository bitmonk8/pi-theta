# pi-loom — Extension Specification

## Overview

`pi-loom` is a [Pi Coding Agent](https://pi.dev) extension that introduces a purpose-built scripting language for authoring parameterized, programmatic templates that target the code/model boundary. Where Pi's built-in `prompt` and `subagent` features provide parameterized Markdown — static text with YAML frontmatter — `pi-loom` provides a full scripting language whose *side effects are conversational injections* into the current or a new agent context.

A `.loom` file is neither a TypeScript module nor a Markdown prompt. It is a **woven artifact**: code-side control flow (variables, loops, conditionals, function definitions) interleaved with model-side text emissions. The output of evaluating a loom is not a return value or a file write — it is a structured sequence of text fragments injected into a conversation context.

---

## Conceptual Model

### Code and Model

A Pi extension is built from three kinds of artefact, each occupying a different position relative to the model:

- **`.ts` extensions** are pure code: deterministic TypeScript with no model interaction.
- **`.md` prompts and subagents** are pure model instructions: text shipped to the LLM with no surrounding logic.
- **`.loom` files** sit on the boundary: deterministic code (variables, loops, conditionals, functions) controls *what* text is sent to the model, and the model's responses flow back as values usable in subsequent code.

The human author orchestrates all three but is not itself a runtime layer.

### Query-and-Await

A `.loom` file is **not** a template that expands to a single prompt. It is a small program that drives a conversation across multiple turns. The primitive that crosses code → model is the **query template** — an `@`-prefixed backtick template:

1. Sends the template's rendered text as the next user turn into the loom's target conversation.
2. Awaits the model's response (servicing any tool-call loop on the way).
3. Returns that response as a value usable in subsequent code-side logic.

Concretely, `@`...`` is an *expression*, not a statement. Every query returns a `Result` (see [Errors and Results](#errors-and-results)); the `?` operator unwraps `Ok` and propagates `Err`. The response schema, when typed, is inferred from the surrounding type context (binding annotation, function parameter, return type) — see [Query](#query) for full rules:

```loom
let critique = @`Critique this code:\n${code}`?
let score: ReviewScore = @`Rate the critique 1-5: ${critique}`?
```

A loom therefore alternates between loom code (parsing the previous response, branching, looping) and model turns (further queries) for as long as it needs. There is no single emission buffer flushed at the end; each query is its own conversation turn whose result feeds back into loom code.

### Scope of a Loom File

Each `.loom` file defines a **loom** — a named, invocable unit. Every loom **declares its own execution mode** in frontmatter (`mode: prompt | subagent`); the choice is the loom author's, not the invoker's. A slash-command user, an `invoke` caller, and a programmatic harness all see the same mode for a given loom — it is a property of the file, not of the call site.

The declared mode determines which conversation the loom's queries run against:

- **`mode: prompt`** — each query runs as a turn in the *caller's current* conversation. Invoked from a slash command, that is the user's session; every turn is user-visible and nothing is hidden. The loom's final `Ok` return value is *not* surfaced to the user as a distinct artefact — the conversation is the user-facing surface, and authors who want the user to see a final value should issue a final query whose text contains it. The return value exists for programmatic consumers (an `invoke` caller, a future loom harness).
- **`mode: subagent`** — a *new, isolated* conversation is spawned for the loom; each query runs as a turn in it. When the loom finishes, only its return value is propagated back to the caller — the intermediate transcript is private to the loom and is not retained by the runtime after the loom returns. Surfacing it for testing, replay, or observability is a future consideration (see `loom test` in [Future Considerations](#future-considerations)).

In both modes the loom drives the conversation across however many query turns it needs. The mode selects *which* conversation those turns happen against, not whether the loom is allowed to round-trip with the model. Cross-mode interactions between a calling loom and an invoked loom are tabulated in [Invocation](#invocation).

---

## Language Design

### Influences

Loom borrows from two languages and adds a small number of constructs of its own:

- **Rust** for **semantics**: immutable-by-default `let` with opt-in `let mut`, `fn` declarations, `match` expressions with pattern arms, `Result<T, E>` with `Ok` / `Err` constructors, the `?` early-return operator, `///` doc comments (lowered to JSON Schema `description:` rather than rustdoc), block-as-expression with last-expression return, and the deliberate omission of `++` / `--`.
- **TypeScript** for **surface**: template strings with `${...}` interpolation (extended to `@`-prefixed query templates), `name: T` type annotations, angle-bracket generics (`array<T>`, `Result<T, E>`), `T | U` union types, inline anonymous object types `{ field: T }`, JSON-native primitive type names (`string`, `number`, `boolean`, `null`), and the structural-equality `==` operator.
- **Original to loom**: `schema` and `enum` declarations targeting the [Schema Subset](#schema-subset), the `@`...`` query template as the primitive that crosses code → model in the *current* conversation, frontmatter-declared execution mode, the `.loom` / `.warp` split, and the unified callable surface where Pi tools and registered subagent looms share one declaration list (`tools:`) and one call syntax (`<name>(...)`).

What's *not* borrowed: Rust's lifetimes, traits, ownership, and macros; TypeScript's classes, decorators, arrow functions, higher-order array methods, and structural-type gymnastics. Loom is much smaller than either parent — see [Expression Sublanguage](#expression-sublanguage) for the explicit "not supported" list.

### Lexical Structure

**Identifiers.** `[A-Za-z_][A-Za-z0-9_]*`, case-sensitive. The **first letter's case is enforced** by the parser — it is what makes case-based pattern disambiguation in `match` work without additional grammar:

- **PascalCase** (uppercase first letter) is required for: `schema` names, `enum` names, `enum` variant names, and any user identifier introduced as a type-like binding. The built-in `Ok`, `Err`, and `Result` follow the same rule.
- **lowercase-first** (a lowercase letter, or `_`) is required for: `let` and `let mut` bindings, function parameters, function names, and schema field names. Both `snake_case` (`experience_years`) and `lowerCamelCase` (`experienceYears`) are accepted; the parser only cares about the first letter. The lowercase-first rule applies to the **loom-side** field identifier; the field's *wire* name (what appears in JSON sent to and received from the model) may be any string via the `as "WireName"` rename clause described in [Schema Declarations](#schema-declarations).

Violating either rule is a parse error ("schema name must start with an uppercase letter"; "binding name must start with a lowercase letter or `_`"). Inside `match` patterns the same first-letter rule then disambiguates without ambiguity: a lowercase identifier introduces a fresh binding, an uppercase identifier refers to an existing schema, enum, or constructor in scope (see [Errors and Results](#errors-and-results)). The casing rule is the *only* enforced naming constraint; identifier length, internal casing, and underscore use are otherwise free.

**Reserved keywords.** Cannot be used as identifiers: `let`, `mut`, `fn`, `if`, `else`, `for`, `in`, `while`, `break`, `continue`, `return`, `match`, `schema`, `enum`, `import`, `export`, `from`, `as`, `by`, `invoke`, `true`, `false`, `null`, `Ok`, `Err`, `Result`, `string`, `number`, `integer`, `boolean`, `array`, `void`. The discard binding `_` is also reserved (it is not a regular identifier and cannot be referenced after binding).

**Statement terminators.** Statements are separated by newlines; semicolons are not part of the grammar. A statement implicitly continues across newlines only when the parser cannot otherwise close it — open `(` / `{` / `[`, a trailing binary or unary operator, or a trailing comma. The same rule means single-line `if (x) stmt` does not exist; bodies of `if` / `for` / `while` / `fn` are always braced blocks.

**Comments.** Line comments only. `//` is a regular comment; `///` is a doc comment that lowers to a JSON Schema `description:` (see [Descriptions](#descriptions)). Block comments (`/* ... */`) are not supported. Comments inside the *text* of a `@`...`` query template are not comments — they are part of the rendered prompt. Comments inside a `${...}` interpolation behave exactly as in any other expression position.

**String literals.** Single- (`'...'`) and double-quoted (`"..."`) forms are equivalent. Escape sequences: `\"`, `\'`, `\\`, `\n`, `\t`, `\r`, `\u{XXXX}` (Unicode code-point, 1–6 hex digits). A backslash followed by any other character is a parse error. **Single-line only** — a literal newline inside a regular string is a parse error. **No interpolation** — the sequence `${` inside a regular string is plain text. Multi-line text and interpolation belong inside `@`...`` query templates; for non-query multi-line text, build via `+` concatenation with `\n` escapes, or factor the text into a query.

**Number literals.** Decimal only: `42`, `3.14`, `1e10`, `1.5e-3`, `0`, `0.5`. The literal carries no sign — negation is the unary `-` operator applied at parse time. No hex / octal / binary forms and no underscore separators in V1. A literal with no fractional or exponent part has type `integer`; otherwise `number`. `integer` widens implicitly to `number` in arithmetic and assignment positions; the reverse is a parse error.

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

**Wire-name renaming.** A field declaration may attach an explicit wire name with `as "WireName"` between the field identifier and its type:

```loom
schema ExternalUser {
  first_name as "FirstName": string,
  last_name  as "LastName":  string,
  age:                       integer,    // no rename — wire name is "age"
  ref_url    as "$ref":      string,     // arbitrary JSON property names are fine
}
```

Loom-side, the field is accessed, constructed, and pattern-matched as the loom identifier (`first_name`) — every other corner of the language sees only that identifier, and the lowercase-first rule still applies to it. The wire name appears in only two places:

- the lowered JSON Schema's `properties` and `required` keys (the schema handed to providers), and
- the JSON the runtime validates against and constructs (model output, `invoke` argument lowering).

The runtime translates between loom-side and wire-side names at the validation boundary; loom code never references the wire name directly. This is the only mechanism for expressing schemas whose property names are not loom-identifier-compatible — PascalCase (`"FirstName"`), special-character (`"@type"`, `"$ref"`), kebab-case (`"first-name"`), or reserved-keyword (`"if"`, `"for"`) names — and is what makes loom usable as a contract layer over third-party JSON Schemas.

Rules:

- The wire name is a single non-empty string literal (single- or double-quoted, no interpolation, escape sequences as in any other string literal).
- Two fields in the same schema cannot share a wire name. A wire name cannot collide with another field's loom name in the same schema.
- A redundant rename whose wire name equals the loom name (`field_name as "field_name": T`) is a parse warning, not an error.
- For discriminated unions, detection runs on the *wire* name (it inspects the lowered schema). The explicit form `by <field>` accepts the loom-side name — the only name visible in code — and the lowering resolves it to each variant's wire name.

The same `as` keyword is used by imports (`import { X as Y }`) and enum variant explicit values (`Low = "low"`); the surface stays consistent.

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

**Variant access.** A specific variant is referenced as `Enum.Variant` (e.g., `Severity.High`). The expression evaluates to the variant's underlying string value (the explicit RHS, or the variant name verbatim when no RHS is given) but is statically typed as `Enum`. `Enum.Variant` is the recommended form whenever the value is named in code — type-aware and refactor-safe — over comparing against the bare string literal. Unknown-variant references (`Severity.Critical` when no such variant exists) are a parse error.

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
                  | InvokeFailure
                  | InvokeCalleeError
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

Loom's `schema` keyword does **not** target the full JSON Schema standard. It targets the **lowest common denominator of OpenAI Structured Outputs (strict mode) and Anthropic tool-use `input_schema` (strict mode)** — the intersection of what both providers' grammar-constrained decoders can enforce. The normative subset is:

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

Rationale: every loom-declared `schema` is the response type of some typed query site (or is transitively reachable from one via `$ref`) and is therefore handed to the provider as a strict structured-output / tool-input schema. The type system cannot promise more than what both major providers can grammar-enforce, hence the intersection. Constraints the subset cannot express (string patterns, numeric bounds, array length, etc.) are out of scope for `schema` and belong in code-side validation if needed.

### Parameters and Frontmatter

Like Pi prompts and subagents, loom files declare metadata in YAML frontmatter:

```yaml
---
description: Programmatic, parameterised code review
argument-hint: "<language> <focus_areas...>"
mode: subagent              # prompt | subagent
model: claude-sonnet-4-5    # model used for every query in this loom
binder_model: claude-haiku  # model used to bind slash-command args to params (default: Pi setting)
bind_context: none          # none | session — see Slash-Command Argument Binding
bind_echo: true             # echo bound args before execution (default: true)
tools: read, grep, bash     # tools available to the model during query-time tool loops
system: |                   # system prompt for the conversation (subagent-only)
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

- `params` are validated with AJV at invocation time and exposed as typed variables in the loom body. When invoked from a slash command, the runtime binds free-form slash arguments to `params` via an LLM call (see [Slash-Command Argument Binding](#slash-command-argument-binding)); when invoked from `invoke(...)` or as a registered tool, arguments arrive already typed and are validated directly.
- `binder_model`, `bind_context`, and `bind_echo` configure slash-command argument binding. All three are optional with sensible defaults; see [Slash-Command Argument Binding](#slash-command-argument-binding).
  - **Defaults.** A param may declare a default with `field: type = literal`. The RHS must be a parse-time literal (string, number, boolean, `null`, or a JSON-shaped object/array literal); no expressions, no `${param}` interpolation. When a slash-command invocation omits the corresponding positional argument, the default is filled in before AJV validation. Defaults are the only place where literal-valued defaulting exists in V1; schema field declarations do not support defaults (JSON Schema's `default:` is advisory metadata, not provider-enforced, and would mislead authors about what the model emits).

    ```yaml
    params:
      language: string = "TypeScript"
      focus_areas: array<string> = []
      author: Author = { name: "anon", role: "developer", experience_years: 0 }
    ```
- `model` and `tools` follow the same shape as Pi subagent frontmatter and apply to **every** query in the loom — a single loom file shares one model and one tool set across all of its turns.
  - **`model`**: if frontmatter omits `model`, the loom inherits Pi's session default at invocation time. Once chosen, the model is fixed for the loom's lifetime; it does not re-resolve per query.
  - **`tools`**: declares the loom's **callable set** — a unified list of Pi tools and `.loom` paths, callable from both the model (during a query's tool-call loop) and from loom code (via the bare `<name>(...)` call form; see [Tool Calls](#tool-calls)). If frontmatter omits `tools`, the loom runs with an **empty callable set** (the model cannot make tool calls and loom code has no `<name>(...)` callables to resolve). The Pi session's ambient tools are deliberately *not* inherited — tools have side effects, and silent inheritance produces "why did my loom touch the filesystem?" surprises. To opt in, list each callable explicitly. `tools: []` and an absent `tools:` field are equivalent.

    Two kinds of entry are accepted:

    - **Pi tool names** (`read`, `bash`, `grep`, ...) resolve against Pi's tool registry at loom-load time, exactly as for Pi subagents.
    - **`.loom` paths** (`./summarise.loom`, `../shared/classify.loom`) resolve relative to the calling loom's directory, must end in `.loom`, and must point at **subagent-mode** loom files (a prompt-mode callee in `tools:` is a load-time error — interleaving the child's user turns inside a parent's tool-call loop is a semantic mess that V1 rejects outright).

    Each entry is exposed under a single name in the loom's top-level scope (and to the model as a tool of the same name). Naming rules:

    - For a Pi tool, the entry's name is the Pi tool name verbatim.
    - For a `.loom` path, the default name is the file's basename without the `.loom` extension, with **hyphens replaced by underscores** (`./code-review.loom` → `code_review`). The remap exists because loom-file naming convention favours hyphens while loom identifiers must be lowercase-first identifier-shaped.
    - The `as <name>` clause overrides the default for either kind: `read as file_read`, `./summarise.loom as my_summariser`. The override target must obey loom's lowercase-first identifier rule (`./summarise.loom as MyTool` is rejected).
    - Two entries resolving to the same final name are a load-time error; use `as` to disambiguate. A name that collides with a top-level `fn` declaration or an imported symbol in the same file is also a load-time error.

    YAML-shape: `tools:` accepts the comma-separated short form for plain-name entries and the YAML list form for entries that need an `as` rename:

    ```yaml
    tools: read, grep, bash
    ```

    ```yaml
    tools:
      - read
      - bash
      - ./summarise.loom              # callable as `summarise`
      - ./code-review.loom            # callable as `code_review`
      - ./classify.loom as triage     # callable as `triage`
    ```

    Unknown Pi tool names, unresolvable `.loom` paths, prompt-mode loom paths, name collisions, and invalid `as` targets all surface as Pi-compatible diagnostics that prevent the loom from being registered.
  - Per-query overrides and a project → loom → query cascade are deferred (see [Future Considerations](#future-considerations)).
- `system` declares the conversation's system prompt. **Subagent-mode only** — `system:` in a `mode: prompt` loom is a parse error, since prompt-mode looms attach to the user's existing Pi session whose system prompt belongs to Pi, not to the loom. In subagent mode, the field is fixed once when the spawned conversation is created and applies to every query the loom issues against it. If omitted, the spawned conversation has no system prompt (the model behaves under its training defaults).
  - **Interpolation.** The `system:` field supports `${param}` and `${param.field}` interpolation against the loom's typed `params`. The full Loom expression sublanguage is **not** available in this slot — only bare identifier paths — because the system prompt is evaluated once at conversation-creation time, before any loom code runs, and the simpler rule is unambiguous and easy to debug. For richer logic, omit `system:` and accept the reduced control-flow surface, or wait for per-query system overrides (deferred).
- `retry` controls how typed queries recover from schema-validation failures (see the [Query](#query) section). `attempts` bounds the number of follow-up coercion turns; `methodology` selects the phrasing strategy. Recognised methodologies (V1):
  - `validator_error` (default) — the follow-up turn includes the AJV validation error from the previous attempt.
  - `schema_repeat` — the follow-up turn re-states the expected schema without quoting a specific error.
  - `none` — no follow-up; the first failure is returned as `Err` immediately. Equivalent to `attempts: 0`.

  **When to use which.** `validator_error` is the right default for almost all looms: published evaluations of structured-output repair show error-feedback retries outperform schema-restatement, because they direct the model to the specific failure rather than re-reading the whole contract. Prefer `schema_repeat` only when:

  - The schema is small and the model keeps inventing fields — restating the schema reins it back in better than naming one missing-field error at a time.
  - The validator emits noisy or cascading errors from a single root mismatch (common with deeply nested unions), and the error tree is more confusing than the schema.

  Use `none` on hot paths where any single failure should fast-fail and the loom handles recovery itself with `match`.

#### Template Interpolation

A `${...}` interpolation inside a `@`...`` query template contains a Loom expression from the [Expression Sublanguage](#expression-sublanguage), evaluated up to the matching `}`. The `@` character has only one lexical role — introducing a query template at top level — and never appears inside `${...}`. There is no bash-style argument-slice sugar (`${@:N}`, `$1`, `$@`, `$ARGUMENTS`); slash-command arguments are bound to typed `params` via the [Slash-Command Argument Binding](#slash-command-argument-binding) machinery and referenced by their declared parameter names like any other identifier.

### Query

The `@`...`` query template is the only construct that crosses code → model. It is an **expression** that sends a user turn and returns the model's response wrapped in a `Result`.

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
                  | ToolCallError
                  | ContextOverflowError
                  | CancelledError
                  | InvokeFailure
                  | InvokeCalleeError
```

(`ToolCallError` is defined in [Tool Calls](#tool-calls); `InvokeFailure` and `InvokeCalleeError` are defined in [Invocation](#invocation). They are listed here only to complete the union.)

`ToolFailureError` and `ToolCallError` are deliberately *separate* variants for *separate* situations: `ToolFailureError` covers a tool that the **model** invoked during a query's tool-call loop (and so carries `tool_call_id` and a `raw_response` for any text the model emitted before the loop crashed); `ToolCallError` covers a tool that **loom code** invoked directly via `<name>(...)` (no model, no `raw_response`, but a structured `cause` enum). The shapes diverge because the contexts diverge — see the design-notes bullet about avoiding null-padded sentinel fields.

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
- Function, method, and tool calls: `f(x)`, `obj.method(x, y)`, `<name>(args)` where `<name>` resolves to a Pi tool or registered loom from the loom's `tools:` frontmatter (see [Tool Calls](#tool-calls))
- Unary: `!`, `-`
- Binary arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`
- Logical: `&&`, `||`
- Ternary: `cond ? a : b`
- Parenthesised: `(expr)`
- Query templates (back-tick prefixed by `@`): the literal form of the [Query](#query) expression; `${...}` inside them takes any expression listed above
- Array literals: `[]`, `[a, b, c]`
- Schema constructors: `Schema { field: expr, ... }` (see [Object construction](#object-construction-array-construction-and-operator-rules) below)
- Enum variant access: `Enum.Variant`
- `Result` constructors: `Ok(expr)`, `Err(expr)`

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
- Query templates (`@`...``) and `match` inside `${...}` — both are allowed at statement / `let`-RHS level only, so template evaluation is guaranteed to be code-only and never silently fires a model turn

**Identifier resolution.** A bare identifier in call position (`name(args)`) resolves in this order, first match wins:

1. A local `let` binding or function parameter currently in scope.
2. A top-level `fn` declaration in the same `.loom` or `.warp` file.
3. A symbol imported from a `.warp` file (see [Imports](#imports)).
4. A name registered in the loom's frontmatter `tools:` set (Pi tool or `.loom` path; see [Tool Calls](#tool-calls)).

No match is an `"unknown identifier"` parse error. Collisions across (2)–(4) are rejected at load time — a `tools:` entry whose post-rename name shadows a top-level `fn` or import in the same file fails to register; resolve with the `as` clause. Local bindings (1) shadow everything else lexically, the same as in Rust or TypeScript.

**Equality.** `==` is structural: deep value equality for objects and arrays, value equality for primitives. There is no `===`.

**Truthiness.** Only `true` and `false` are accepted in boolean position (`if`, `while`, `&&`, `||`, ternary condition). Using a non-boolean (`if (x)` where `x: string`) is a parse error; write `if (x != "")`, `if (xs.length > 0)`, etc. This avoids the JS empty-string / zero / `null` ambiguity.

**Built-in methods.** A small stdlib is exposed on the primitive composite types. No user-defined methods; no `this`. V1 set:

- `string`: `length` (property), `toLowerCase()`, `toUpperCase()`, `trim()`, `startsWith(s)`, `endsWith(s)`, `includes(s)`, `split(sep)`, `replace(from, to)`
- `array`: `length` (property), `join(sep)`, `includes(x)`, `indexOf(x)`, `slice(start, end?)`, `concat(other)`
- `object`: `keys()`, `values()`, `has(k)`

Additional methods may be added non-breakingly later. Anything not on this list is a parse-time "unknown method" error rather than a runtime failure.

#### Object construction, array construction, and operator rules

**Object construction.** Schema-typed values are constructed with `Schema { field: expr, ... }`. Every declared field of the schema must be present; extra fields are a parse error; field order is irrelevant. Bare object literals (`{ field: expr }` with no leading schema name) are not legal in expression position — every constructed object must name its schema, so the type is unambiguous from the syntax alone. The frontmatter `params:` defaults are the one exception: there the param's declared type supplies the schema name, so the literal is bare (and is parsed as JSON-shaped, not as a Loom expression).

For a discriminated union `schema Animal = Cat | Dog | Lizard`, construct via the variant schema name (`Cat { ... }`), not the union name. The constructed value is statically typed as the variant; assignment to an `Animal`-typed slot widens it.

**Array construction.** `[]` is the empty array; its element type is inferred from context (binding annotation, parameter type, or surrounding constructor field). `[a, b, c]` is non-empty; its element type is the common type of its elements, narrowed by context if applicable. An array whose elements have no common type and no context to narrow against is a parse error.

**`+` operator.** On two `number` (or `integer`) operands, addition; the result widens to `number` if either operand is `number`. On two `string` operands, concatenation. Mixed-type operands are a parse error — write an explicit conversion or interpolate inside a string. `+` on `array<T>` is not supported; use `arr.concat(other)`.

**Other arithmetic.** `-`, `*`, `/`, `%` accept only numeric operands. `/` always produces `number` (no integer-division operator in V1). `%` requires same-typed operands and preserves the type. Division by zero produces IEEE-754 `Infinity` / `-Infinity` / `NaN` per JS semantics; it does not panic.

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

**`for` ... `in`** — iterates an array, binding the iteration variable as a fresh immutable local per iteration. The expression after `in` must have type `array<T>` for some `T`; iterating strings, objects, or numbers is a parse error (use `obj.keys()` for objects, `s.split(...)` for strings).

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

**Arm syntax.** `pattern => expression`, comma-separated. The trailing comma after the last arm is optional. All arms must produce values of the same type (or assignable to a common type, by the same rules as `let` initialisation); a mismatched-arm `match` is a parse error.

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

**`Result` as a user-visible type.** `Result<T, E>` is a built-in two-variant type with constructors `Ok(value)` and `Err(error)`. Looms may declare functions returning `Result<T, QueryError>` explicitly, and may construct `Ok` / `Err` directly to bridge to code-side error handling. User-defined error types beyond `QueryError` are out of scope for V1.

**Runtime panics.** Some failures cannot be expressed as a `Result` and are surfaced as **panics** that abort the loom immediately, bypassing `?` and `match`. V1 panic sources:

- Non-exhaustive `match` (no arm matched the scrutinee at runtime; the implementation refers to this as `MatchError`).
- Array index out of bounds (`arr[i]` with `i < 0` or `i >= arr.length`).
- Indexed access on `null` or on a missing object key.

Panics surface to the loom's caller as:

- **Slash-command / prompt-mode invocation** — a Pi system note formatted as "loom `/<name>` aborted: `<message>`". The user's session is not torn down; the user can type a follow-up turn.
- **`invoke` parent** — `Err(QueryError { kind: "invoke_failure", reason: "panic", ... })` (see [Invocation](#invocation)), observable to the parent's `match` / `?` handling.

Panics are not values — they do not flow through `?` and cannot be caught by `match`. Authors who need recoverable behaviour must write code that cannot panic (bounds-check before indexing, add a final `_ => ...` arm to `match`).

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

**Placement.** `fn` declarations are top-level only — both in `.loom` files and in `.warp` library files. Nested function definitions, closures, and first-class function values are not part of V1; function names appear only in call position, never as values bound to `let` or passed as arguments. Mutual recursion between two top-level `fn`s is allowed (declarations are hoisted within the file); recursion through `invoke` is bounded by the parse-time cycle check from [Invocation](#invocation).

**Loom return type.** A `.loom` file's overall return type is inferred from its body using the same rule as a function: the type of its tail expression, wrapped in `Result<T, QueryError>` if any `?` appears in the body. There is no frontmatter `returns:` field. Cross-loom static type checking at `invoke<Schema>` sites uses the callee's inferred return type when the callee's source is statically resolvable; otherwise the runtime AJV check is the safety net.

### Tool Calls

Loom code calls a Pi tool or a registered subagent loom directly via the bare-identifier form `<name>(args)`, where `<name>` is an entry in the loom's frontmatter `tools:` set (after any `as` rename and the default hyphen→underscore loom-basename rewrite; see [Parameters and Frontmatter](#parameters-and-frontmatter)). The same set is what the model sees as available tools during a `@`...`` query — the declaration is shared between the model-driven and code-driven call paths.

```loom
let contents = read({ path: "src/main.ts" })?
let matches  = grep({ pattern: "TODO", path: "src" })?
let summary  = summarise(contents)?
let label    = triage(summary)?
```

**No conversation turn.** A tool call is a direct call against Pi's tool runtime (or, for a registered loom, a fresh subagent invocation; see below). It does **not** add a turn to the loom's conversation, does **not** consume model tokens, and does **not** appear in the conversation transcript. This is the deliberate distinction from `@`...`` queries: queries cross code → model in the current conversation; tool calls cross code → side-effect (or code → child conversation, for a registered loom) without disturbing the current one.

**Argument shape.** Pi tools take a single object argument matching the tool's input schema (TypeBox / JSON Schema, exposed by Pi at registration). Registered loom callees take their callee `params:` as already-typed values, positionally in declaration order — the same argument-binding rules `invoke(...)` uses. Type mismatches surface as parse errors when the callee's schema is statically resolvable; otherwise the runtime AJV check is the safety net. Slash-command argument binding (LLM-driven; see [Slash-Command Argument Binding](#slash-command-argument-binding)) does not apply here — code-side callers pass typed values directly.

**Return type.** The result type depends on the callee kind:

| Callee kind | Return type | Notes |
|---|---|---|
| Pi tool | `Result<string, QueryError>` | V1 returns the tool's final output as a single `string` (mirroring untyped queries). Pi tool definitions ship an input schema but no output schema; provider tool-use conventions treat outputs as freeform text the model interprets. Future widening to a structured shape would be additive. |
| Registered loom (subagent-mode) | `Result<T, QueryError>` where `T` is the callee's inferred return type | Same inference rule as `invoke<T>(...)`: when the callee `.loom` is statically resolvable, its tail-expression type flows into the call site. Otherwise the runtime AJV check enforces it. |

As with queries and `invoke`, the call returns a `Result`; use `?` to propagate failure or `match` to handle.

**Failures.** Tool-call failures surface as a new `QueryError` variant:

```loom
schema ToolCallError {
  kind: "tool_call",
  message: string,
  tool_name: string,                  // post-rename name as seen in `tools:`
  cause: "validation"                 // arguments failed input-schema validation
       | "execution"                  // tool's `execute()` threw or returned `isError: true`
       | "cancelled"                  // AbortSignal fired (e.g., user cancelled the loom)
       | "unknown_tool"               // callable was unregistered between parse and runtime; should not occur after a clean parse
}
```

`ToolCallError` is distinct from `ToolFailureError` (which covers tool failures *inside* the model's tool-call loop during a `@`...`` query). The variants carry different fields because the contexts differ — a code-side tool call has no `tool_call_id` issued by Pi's tool-loop machinery and no `raw_response` from the model; a model-loop failure has both. Authors who want to handle every tool failure uniformly write two `match` arms or a final `_ => ...` catch-all.

For a registered loom callee, failures the callee returned cascade through the standard `InvokeCalleeError` variant (the call is, semantically, an `invoke`); failures from the loom infrastructure itself (callee unloadable, validation mismatch on the return value) cascade through `InvokeFailure`. The only situation where `ToolCallError` arises for a loom callee is V1's `"unknown_tool"` safety net.

**Concurrency.** V1 tool calls are sequential and synchronous-looking from loom code: the runtime awaits each call's underlying Promise before evaluating the next expression, so the loom interpreter yields to Pi's event loop during the wait (the TUI render loop, keypress handlers, signals, and other Pi machinery continue to run — the call is non-blocking at the runtime level even though it appears synchronous to the author). Streaming partial results (Pi's `onUpdate` callback) are not surfaced to loom code. Concurrent tool execution exists in Pi's model-driven "parallel tool mode" inside `@`...`` queries — when the model issues multiple tool calls in one assistant message, Pi runs them concurrently — but no loom-level concurrency primitive (e.g. a `parallel { ... }` block) is exposed in V1; see [Future Considerations](#future-considerations).

**Relationship with `invoke`.** `invoke("./path.loom", ...)` and a registered-loom call (`my_summariser(...)` after listing `./summariser.loom` in `tools:`) are operationally equivalent for subagent-mode callees — both spawn a fresh isolated conversation, both validate the return value against the callee's inferred or annotated schema, both surface failures through the same `QueryError` variants. The recommendation is:

- **Register in `tools:`** when the callee is referenced repeatedly, when the model should also be able to call it, or when a stable name in code is preferred over a path literal.
- **Use `invoke(...)`** for ad-hoc, one-off calls and for callees whose path is computed from configuration that the author wants to keep out of frontmatter. `invoke(...)` is also the only way to call a **prompt-mode** loom from loom code, since prompt-mode callees cannot appear in `tools:`.

The two surfaces share a single error model and a single schema-lowering pipeline; the choice is purely about declaration site.

### Invocation

A loom may invoke another loom via the built-in `invoke` expression. This is the only way for a `.loom` to spawn or attach to another `.loom`'s execution by an inline path literal; for repeated or model-exposed callees, register the path in frontmatter `tools:` and call by name (see [Tool Calls](#tool-calls)). `import` is reserved for `.warp` library code.

```loom
let plan: Plan = invoke<Plan>("./plan.loom", topic, depth)?
let _ = invoke("./logger.loom", note)?
```

**Resolution.** `path` is a string literal, resolved at parse time relative to the calling loom's directory. It must end in `.loom`. Dynamic dispatch (a runtime-computed path) is not supported in V1.

**Typed return.** `invoke<Schema>(...)` annotates the expected return type; the runtime AJV-validates the child's return value against the schema. Untyped `invoke(...)` returns `Result<null, QueryError>` — the runtime discards the child's return value entirely. Use `invoke<Schema>` whenever the caller needs the value back; the untyped form exists only for fire-and-forget orchestration (loggers, side-effect-only children).

**Argument binding.** Arguments bind positionally to the callee's `params:` in declaration order, with each argument type-checked against the param's declared schema. Type mismatches surface as parse errors when the callee's frontmatter is statically resolvable; otherwise the runtime AJV check is the safety net. The LLM-driven binder used at the slash-command boundary (see [Slash-Command Argument Binding](#slash-command-argument-binding)) does not run here — `invoke(...)` callers pass already-typed values.

**Cross-mode semantics.** The callee's mode controls whether it gets a fresh conversation or attaches to its caller's current conversation. The caller's mode is irrelevant to that decision — a subagent's "current conversation" is already its own private one, so a prompt-mode child writing into it stays inside that private context.

| Caller mode | Callee mode | Effect |
|---|---|---|
| prompt | prompt | Child attaches to caller's current conversation (the user's session). Child's queries are user-visible turns. |
| prompt | subagent | Child spawns a fresh isolated conversation; only the return value reaches the caller. |
| subagent | prompt | Child attaches to the caller's current conversation — which is the caller subagent's own private one. Nothing leaks to the grandparent. |
| subagent | subagent | Child spawns a fresh isolated conversation, sibling to (not nested under) the caller's. |

**Tools and model.** The child uses *its own* frontmatter `model`, `tools`, and `system`. The caller's settings are not inherited. Same justification as for queries: tool/model/system inheritance produces surprise.

**Failures.** `invoke` returns `Result<T, QueryError>`. Invoke-specific failures surface via two new `QueryError` variants in addition to the query-time variants from [Query](#query):

```loom
schema InvokeFailure {
  kind: "invoke_failure",
  message: string,
  callee_path: string,
  reason: "load_failure"     // callee file unreadable
        | "parse_failure"    // callee file failed to parse
        | "validation"       // typed invoke: child's return value failed AJV validation
        | "cancelled"        // callee (or caller) cancelled mid-invoke
        | "panic"            // callee aborted via runtime panic (see Errors and Results)
}

schema InvokeCalleeError {
  kind: "invoke_callee_error",
  message: string,
  callee_path: string,
  inner: QueryError                          // the original Err the callee returned
}
```

Folding invoke errors into `QueryError` keeps the loom's error type uniform: a function or loom that mixes `?` on queries and `?` on invokes still has a single `Result<_, QueryError>` return type and a single `match` shape to handle. `InvokeCalleeError.inner` is recursive — `QueryError` referencing itself via `$ref` is exactly the discriminated-union pattern from [Schema Declarations](#schema-declarations), applied to Loom's own runtime type. V1 has no configurable per-invoke timeout; cancellation is the only externally driven termination.

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
- May call `invoke(...)`. The path resolves relative to the `.warp` file's location; the invocation executes against the *calling* `.loom`'s conversation (or spawns a fresh isolated one if the callee is subagent-mode), exactly like a `@`...`` query inside a warp function. Cycle detection from [Invocation](#invocation) walks invoke paths originating from warp functions too.

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

**Slash-name collisions.** A loom and a Pi prompt template that resolve to the same slash command (e.g., `code-review.loom` and `code-review.md` discovered from the same or comparable locations) are a load-time error reported through Pi's diagnostics; neither is registered. Authors must rename one. Cross-format slash-name shadowing is not supported in V1; the rule is symmetric across `.loom`, `.md` prompts, and `.md` subagents.

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
/code-review TypeScript focusing on error handling and async, by Ada Lovelace, senior engineer 12y
```

The runtime extracts typed `params:` values from the user's free-form slash arguments via an LLM-driven binder. The full mechanism is described in [Slash-Command Argument Binding](#slash-command-argument-binding); the short version is that a cheap tier-2 model is given the loom's `params:` schema and the raw slash text and asked to return a structured envelope (`ok`, `needs_info`, or `ambiguous`). Successful binding feeds AJV-validated params into the loom; unsuccessful binding surfaces a one-line system note in the user's session and the loom does not run.

The `argument-hint` frontmatter field drives the slash-command autocomplete dropdown shown to the user, and is also passed to the binder as additional grounding for argument extraction. Key=value or named-argument syntax (e.g. `/code-review language=TypeScript`) is *not* part of the V1 surface; users type free-form text and the binder does the work.

### Slash-Command Argument Binding

When a loom is invoked from a slash command, the runtime translates the user's free-form argument string into the loom's typed `params:` via an LLM call — the **binder**. The binder runs once per slash invocation, before any of the loom's own queries. It does not apply to `invoke(...)` calls or to looms invoked as registered tools (both of those pass already-typed values).

The binder is positioned as runtime infrastructure, not as part of the loom's conversation: it never adds turns to the user's session (in prompt mode) or to the loom's spawned conversation (in subagent mode), and the loom code never sees the binder's intermediate envelope. Authors interact with the *result* of binding (their `params` are populated, or the loom doesn't run) the same way they would with any typed `invoke(...)` call.

**Binder model.** Configured via the `binder_model:` frontmatter field, which falls back to the Pi-level `looms.binderModel` setting (default: a cheap tier-2 model such as Claude Haiku, GPT-4o-mini, or Gemini Flash). Binder calls are structurally function-calling tasks — schema in, JSON out — and tier-2 models are more than capable. Authors with unusually subtle schemas (overlapping discriminated-union fields, semantically close enum variants) can override per-loom by setting `binder_model:` to a stronger model.

**Binder context.** Configured via `bind_context:` (`none` | `session`; default `none`).

- `none` — the binder sees only the slash text and the loom's frontmatter. Predictable, cheap, deterministic. The right choice when arguments are self-contained (`/code-review TypeScript focusing on error handling, by Ada Lovelace, senior engineer 12y`).
- `session` — prompt-mode-only; the binder additionally receives the last ~20 turns or ~8000 tokens (whichever is smaller) of the caller's session as grounding context. The right choice when the loom relies on conversational anaphora (`/review the spec` resolves "the spec" against what the user was just discussing).

Declaring `bind_context: session` on a subagent-mode loom is a parse warning, not an error — subagent-mode looms invoked from a slash command have no caller-session context to attach.

**Binder bypass.** When `params:` declares exactly one field, that field's type is `string`, and the field has no default, the runtime sets the param's value to the entire slash-argument string (with leading and trailing whitespace trimmed) and skips the binder call entirely. AJV validation still runs as a safety net (a string passes by definition; this is just the standard validation path). All other shapes — multiple fields, non-string types, defaults present, optional or nullable types — go through the binder. The bypass decision is made at loom-load time from the static schema; there is no per-invocation branching.

**Binder envelope.** The binder is asked to return one of three structured outputs (the schema is constructed dynamically by the runtime from the loom's `params:`):

- `{ kind: "ok", args: <typed params object> }` — successful extraction. The runtime AJV-validates `args` against the params schema (safety net for hallucinated field shapes), fills any defaulted fields not present in `args`, and starts the loom.
- `{ kind: "needs_info", message: string }` — the binder could not extract one or more required fields. The `message` is shown to the user as a system note; the loom does not run.
- `{ kind: "ambiguous", message: string, candidates: array<string> | null }` — multiple plausible bindings exist and the binder cannot pick one. The `message` is shown to the user as a system note; the loom does not run.

The envelope is runtime-internal; it is never a Loom-visible type and never appears in loom code. Authors only see the *consequences* of binding (loom runs, or system note appears).

**Defaulting.** Defaults declared on `params:` fields are filled by the runtime *after* the binder returns, not by the binder. The binder is told (in its system prompt) which fields are required and which have defaults; for default-having fields, the binder may omit them from `args` when the user did not specify them, and the runtime fills the defaults before AJV validation. The binder is never asked to invent default values — only to extract what the user actually said.

**Echo policy.** Configured via `bind_echo:` (`true` | `false`; default `true`). When echo is on (and the bypass did not apply), the runtime appends a one-line system note to the user's session immediately before the loom starts:

> Running `/code-review`: language=TypeScript, focus_areas=[error handling, async], author={Ada Lovelace, …}

Format rules:

- Top-level `params:` fields shown in declaration order, comma-separated.
- String values quoted only when they contain whitespace or special characters.
- Array values shown as `[a, b, c]`, truncated to `[a, b, c, …+N more]` past three elements.
- Object values shown as `{first-field-value, …}` — just the first field's value as a hint.
- Defaulted fields tagged `(default)`: `focus_areas=[] (default)`.
- Total line capped at ~120 characters; overflow truncated with `…`.

Setting `bind_echo: false` suppresses the echo. The bypass case (single-string param) auto-suppresses echo regardless of the frontmatter setting (there is nothing to misbind); declaring `bind_echo: true` on a bypass-eligible loom is a parse warning.

The echo channel is also used for the binder's `needs_info` and `ambiguous` outputs, which *replace* execution rather than precede it:

> loom `/code-review`: missing required field `language`. Specify the language being reviewed.

> loom `/code-review`: ambiguous arguments — "focusing on Ada" could mean focus_areas or author. Be more explicit.

**Determinism.** Binder calls use `temperature: 0` and, where the provider supports it, a fixed seed. The binder is therefore *near-deterministic* but not guaranteed reproducible — different model versions, provider-side updates, or context injection (`bind_context: session`) can produce different bindings for the same slash text. Authors who require fully deterministic argument handling should either (a) write looms whose schema triggers the bypass (single no-default `string` param), (b) invoke the loom programmatically via `invoke(...)`, or (c) accept the small nondeterminism budget of a temp-0 tier-2 model on a structured-output task.

**Failure modes.** Binder failures are runtime-handled and surface as system notes in the user's session, never as `Result` values to loom code. V1 has no `BinderError` variant in the `QueryError` union (it would have nowhere to flow — a failed binder means the loom never starts). The five user-facing shapes:

| Cause | System note |
|---|---|
| `needs_info` | `loom /<name>: <model's message>` |
| `ambiguous` | `loom /<name>: ambiguous arguments — <model's message>` |
| Binder model transport failure (after one retry) | `loom /<name>: argument binder unavailable (<provider>: <message>)` |
| Binder returned malformed envelope after retries | `loom /<name>: argument binding failed — could not parse arguments` |
| AJV validation of the binder's `args` failed | `loom /<name>: argument binding produced invalid args — <ajv-summary>` |

Transport failures get exactly one retry; coercion-style follow-ups (the mechanism typed queries use for response-schema repair) do not apply, because if the binder model is unreachable, more attempts will not help.

**Cost and latency.** A typical binder call on a tier-2 model is sub-second and on the order of $10⁻⁴ per invocation. Authors can drive this to zero by structuring `params:` as a single `string` (triggering the bypass) and parsing inside the loom body if they want to avoid the binder entirely.

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
| Instructions for | model | model (isolated) | code + model (boundary) |
| Logic/control flow | None | None | Full (loops, conditionals, functions) |
| Parameterization | YAML frontmatter | YAML frontmatter | Typed params + schemas |
| Type system | Untyped strings | Untyped strings | JSON / JSON Schema |
| Conversation context | Current | New (isolated) | Either (mode-controlled); loom drives N turns inside it |
| Output | Injected text | Injected text | Multi-turn conversation drive; loom return value (Rust-style last-expression) |
| Callable surface | Tools (model only) | Tools (model only) | Unified `tools:` set callable from both model (in queries) and code (`<name>(...)`); accepts Pi tools and registered subagent looms |
| File format | Markdown `.md` | Markdown `.md` | Loom `.loom` (+ `.warp` library files) |

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
- Typed queries (schema inferred from binding type, function parameter, return type, or explicit `@<Schema>`...``) lower the schema to the provider's structured-output / strict tool-input contract; the returned response is validated with **AJV** before being handed back to loom code
- Tool calls from loom code (`<name>(args)`) resolve the post-rename name against the loom's `tools:` table built at load time; for Pi tools the runtime invokes the tool's `execute(toolCallId, params, signal, onUpdate, ctx)` directly with a synthesized `toolCallId` and a no-op `onUpdate`, and awaits the resulting Promise before returning to loom code (non-blocking at the runtime level, sequential at the language level); for registered loom paths the runtime spawns a subagent invocation equivalent to `invoke<T>(path, ...)`. Pi tools registered in `tools:` are also wired into every `@`...`` query as model-callable tools; registered loom paths are lowered to a tool spec (params → input schema, inferred return → output schema, frontmatter `description` → tool description) and exposed alongside Pi tools to the model
- For subagent-mode looms, the spawned conversation's system prompt is taken from frontmatter `system:` (with `${param}` interpolation resolved at conversation-creation time) and applied to every query against that conversation
- Parameter schemas (frontmatter `params`) are likewise validated with AJV at invocation time
- For slash-command invocation, the runtime first runs the binder (per [Slash-Command Argument Binding](#slash-command-argument-binding)) unless the bypass condition holds. The binder is a one-shot ephemeral call to `binder_model` (resolved from frontmatter, falling back to Pi setting `looms.binderModel`) with `temperature: 0` and a fixed seed where supported. The runtime constructs the binder's response schema dynamically from the loom's `params:` schema (the three-arm envelope `ok | needs_info | ambiguous`), passes it as a strict structured-output contract, and validates the returned `args` (on `kind: "ok"`) with AJV before merging in defaults and starting the loom. Binder failures and non-`ok` envelopes are surfaced as one-line system notes in the user's session; the loom is not started
- The loom's overall return value is the value of the last expression of its top-level block

### Future Considerations

- LSP support for `.loom` and `.warp` files (syntax highlighting, type checking, autocomplete)
- A `loom test` command for dry-run execution that runs a loom against a recorded transcript or a stub model without hitting a live provider
- First-class loom values (`Loom<T>` type, passing looms as arguments, higher-order composition) — V1 only supports literal-path `invoke` and frontmatter-registered callables
- Per-query overrides for `model`, `tools`, and `system` (project → loom → query cascade)
- User-defined error types beyond `QueryError`
- Richer expression sublanguage inside frontmatter `system:` (full `${expr}` interpolation rather than just `${param}` paths)
- Named-argument / key=value invocation syntax
- Cancellation propagation between parent looms and in-flight subagent looms
- Loom-level concurrency primitives (e.g. `parallel { ... }` blocks or a parallel-`for` form) building on Pi tools' Promise-returning shape — V1 keeps every tool call sequential and synchronous-looking
- Streaming partial tool results from Pi's `onUpdate` callback into loom code (e.g. an iterator-style consumption form) — V1 returns only the final result
- Structured tool output schemas, when Pi (or upstream providers) introduce a strict output-schema contract for tools — V1 returns `string` from every Pi tool call
- Binder refinement loop: multi-turn `needs_info` negotiation (binder asks the user a clarifying question, gets a reply, retries) instead of V1's single-shot "system note then stop" behaviour
- Automatic context escalation: when binding fails without context, automatically retry with `bind_context: session` attached — trades a second binder call for a smoother success rate on context-sensitive looms that forgot to opt in
- `BinderError` as a Loom-visible `QueryError` variant, once looms become first-class values invocable from non-loom programmatic harnesses that need to observe binder failures structurally
- Per-loom `binder_temperature` knob, if real usage shows authors need to tune the binder's nondeterminism budget

---

## Appendix: Related Work

pi-loom is not novel in ambition — *prompt-as-program* is a crowded space. This appendix locates loom against neighbouring work for readers who already know the landscape; nothing in the rest of the spec depends on it.

Two coordinates help place a tool:

- **Layer.** *Orchestration-layer* tools sit above a finished provider API, drive multi-turn conversations, validate responses, and run tool loops at the message level. *Inference-layer* tools hook into the model's token-generation loop via logit biasing, grammar masks, or controller VMs. The two compose. **pi-loom is orchestration-layer.**
- **Surface.** Declarative (YAML / DAG) vs. imperative (a real language). **pi-loom is imperative.**

### Direct influences

- **`mech`** — the declarative YAML workflow engine in the sibling [backlot](../backlot) project (`backlot/docs/MECH_SPEC.md`). Same worldview (typed prompt orchestration, JSON Schema as the type system, conversation-isolated function calls), opposite syntactic choices. Several loom decisions — typed function inputs/outputs as the composition unit, conversation isolation across subagent invocations, schema-first validation — were lifted from mech.
- **Pi prompt templates and subagents** — frontmatter conventions, slash-command discovery, the prompt/subagent execution-mode split, and tool resolution all mirror Pi.

### Other orchestration-layer tools

- **PDL** (IBM) — declarative YAML, same orchestration layer, same context-accumulation model, same JSON Schema typing. The closest functional comparable on a different surface.
- **DSPy** (Stanford) and **ax** — declarative module signatures plus a prompt optimiser. Loom does not optimise prompts; what the author writes is what the model sees.
- **BAML** (Boundary) — function-per-LLM-call DSL with schema-aligned parsing; single-call. Loom drives many queries per program.
- **TypeChat** (Microsoft) — TypeScript interfaces as schemas with an LLM-driven repair loop on validation failure. The repair pattern is mirrored in loom's typed-query coercion-via-follow-up behaviour.
- **Promptflow** (Microsoft), **ControlFlow** (Prefect), **LangChain LCEL** — declarative DAG / Python composition cousins of mech and PDL.
- **Instructor**, **PydanticAI**, **Mirascope** — Python decorators wrapping a single LLM call into a typed Pydantic-returning function.

### Inference-layer tools (different layer)

These hook into the model's token-generation path rather than driving a provider API from outside. Loom *consumes* the structured-output and strict-tool-input contracts they help establish; it does not compete with them.

**Guidance** (Microsoft), **LMQL** (ETH Zurich), **SGLang frontend** (Berkeley Sky), **Outlines** (.txt), **AICI** (Microsoft).
