# Binder bypass and envelope

## Binder bypass

<a id="bypass-cases"></a>
Two cases skip the binder call entirely; in both, no envelope schema is constructed at load time. The bypass decision is made at loom-load time from the static schema; there is no per-invocation branching.

<a id="slash-argument-whitespace"></a> **Slash-argument whitespace** is the ASCII whitespace set pinned by [System-note rendering rule 1](defaulting-system-note-echo.md#system-note-rendering) — never the language-dependent regex `\s` class, so non-ASCII whitespace (e.g. U+00A0) is not trimmed. Trimming at the slash-argument sites strips leading and trailing slash-argument whitespace only; rule 1's collapse-internal-whitespace sub-step is not imported.

1. **No-params bypass.** When `params:` is absent, `params: {}`, the loom takes no parameters and the binder does not run. Slash-argument overflow against a no-params loom is governed by [Slash-Command Invocation — No-params overflow](../slash-invocation.md#slsh-1); the binder's only contribution is to not run. `bind_echo`, `bind_context`, and `bind_model` on a no-params loom have nothing to bind — `bind_echo: true` is a load warning (`loom/load/bind-echo-without-params`) and produces no echo regardless; `bind_context` and `bind_model` are silently ignored (they may be inherited from project-wide settings).
2. **Single-string bypass.** When `params:` declares exactly one field, that field's type is `string`, and the field has no default, the runtime sets the param's value to the entire slash-argument string (with leading and trailing [slash-argument whitespace](#slash-argument-whitespace) trimmed) and skips the binder call. AJV validation still runs as a safety net (a string passes by definition; this is just the standard validation path).

All other shapes — multiple fields, non-string types, defaults present, optional or nullable types — go through the binder. The no-params bypass check runs **before** the single-string bypass check, so a `params: {}` loom does not accidentally match the single-string branch.

## Binder envelope

The binder is asked to return one of three structured outputs (the schema is constructed dynamically by the runtime from the loom's `params:`):

- `{ kind: "ok", args: <typed params object> }` — successful extraction. The runtime fills any defaulted fields not present in `args`, then AJV-validates the merged result against the params schema (safety net for hallucinated field shapes), and starts the loom.
- `{ kind: "needs_info", message: string }` — the binder could not extract one or more required fields. The `message` is shown to the user as a system note; the loom does not run.
- `{ kind: "ambiguous", message: string, candidates: array<string> | null }` — multiple plausible bindings exist and the binder cannot pick one. The `message` is shown to the user as a system note; the loom does not run.

The envelope is runtime-internal; it is never a Loom-visible type and never appears in loom code. Authors only see the *consequences* of binding (loom runs, or system note appears).

> **loom 1.0 seam — binder refinement loop.** <a id="loom-1-0-seam-binder-refinement-loop"></a><a id="v1-seam-binder-refinement-loop"></a> The structural distinction between the two failure arms exists for the deferred binder refinement loop (cf. [Future Considerations — Binder refinement loop](../future-considerations/surface-extensions.md#binder-refinement-loop)), where only `needs_info` reopens for a clarifying turn while `ambiguous` still terminates. Three loom 1.0 carriers preserve the post-loom 1.0 migration; each is pinned individually below as its own normative obligation. The split is forward-compatible without the cost of either collapsing the arms now or rendering candidates the loom 1.0 templates do not require.

<a id="bndr-1"></a> **BNDR-1.** The [Binder envelope schema](#binder-envelope-schema-constructed-dynamically-from-params) MUST keep the three-arm `ok | needs_info | ambiguous` discriminator. Collapsing to two arms (e.g. folding `ambiguous` into `needs_info` because loom 1.0 surfaces both as terminating system notes) is a breaking change to the deferred loop.

<a id="bndr-2"></a> **BNDR-2.** The `ambiguous.candidates` field MUST remain in the envelope schema (`array<string> | null`; the binder may emit it; AJV accepts `null`). Dropping it from the schema is breaking. The loom 1.0 runtime MUST NOT surface it on the user-facing system note — the `ambiguous` row of the [failure-mode templates](./determinism-cancellation-failure.md#failure-mode-templates-normative) renders only `<message>`, per [System-note rendering](./defaulting-system-note-echo.md#system-note-rendering) rule 5.

<a id="bndr-3"></a> **BNDR-3.** The [failure-mode templates](./determinism-cancellation-failure.md#failure-mode-templates-normative) table MUST keep distinct `loom /<name>: argument binding needs more info — <message>` and `loom /<name>: ambiguous arguments — <message>` row prefixes. Collapsing the two failure-arm prefixes into a single shared phrase is breaking.

### Binder envelope schema (constructed dynamically from `params:`)

The runtime emits one envelope schema per loom at load time and reuses it for every binder call. The envelope is a discriminated union over `kind` and conforms to the [Schema Subset](../schema-subset.md); the runtime constructs it directly rather than via the lowering pass, but the shape is exactly what the lowering pass would produce for `schema BinderEnvelope = Ok | NeedsInfo | Ambiguous`.

```json
{
  "anyOf": [
    {
      "type": "object",
      "properties": {
        "kind": { "type": "string", "const": "ok" },
        "args": <params-schema-with-defaulted-fields-relaxed>
      },
      "required": ["kind", "args"],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "kind": { "type": "string", "const": "needs_info" },
        "message": { "type": "string", "maxLength": 500 }
      },
      "required": ["kind", "message"],
      "additionalProperties": false
    },
    {
      "type": "object",
      "properties": {
        "kind": { "type": "string", "const": "ambiguous" },
        "message": { "type": "string", "maxLength": 500 },
        "candidates": {
          "type": ["array", "null"],
          "items": { "type": "string", "maxLength": 500 }
        }
      },
      "required": ["kind", "message", "candidates"],
      "additionalProperties": false
    }
  ]
}
```

The `maxLength: 500` cap on `message` and on each `candidates[i]` is a budget for the binder model, not a user-visible cap; the user-visible cap and shaping rules live under [System-note rendering](./defaulting-system-note-echo.md#system-note-rendering) below. The schema cap exists so that a runaway binder response is rejected as malformed (exercising the malformed-envelope row in the failure-modes table) rather than silently truncated downstream.

`<params-schema-with-defaulted-fields-relaxed>` is a copy of the loom's lowered `params` schema with one transformation: each field that declared a default is removed from `required` (its type is unchanged). Required-without-default fields are unchanged. The binder may therefore omit any defaulted field; the runtime fills the actual default value after binding succeeds and before AJV validates the merged result. The relaxed copy must itself satisfy the subset, including `additionalProperties: false`; if every params field has a default, the copy's `required` is `[]`.

The `args` arm embeds a schema fragment that may carry `$ref`s into the loom file's `$defs`. The envelope schema document handed to the provider (and to AJV) carries the transitive `$defs` closure of the params schema, computed by the same per-query pruning rule as [Schema Subset step 4](../schema-subset.md#lowering-algorithm).

### Binder system prompt

The runtime constructs a system prompt that conveys the loom's binding context to the binder model. The exact wording is not part of the contract; the structural obligations enumerated under *System-prompt structure (normative)* below are. The fenced block that follows is one conforming rendering, included for illustration; an alternative renderer that satisfies every obligation in the structure list is equally conformant. The three per-field lines inside the `Parameters:` block of the example are an exception: they are reproduced as normative reference renderings under *Parameter-line reference renderings* below and a conforming implementation MUST emit those bytes verbatim for the inputs shown.

```
You bind free-form slash-command arguments to typed loom parameters.

Loom: /code-review
Description: Review code for issues.
Argument hint: <language> focusing on <areas>, by <author>

Parameters:
  language (string) required — the language being reviewed
  focus_areas (array<string>) default=[] — comma-separated focus areas
  author (Author) required — the author of the code under review

User arguments: TypeScript focusing on error handling, by Ada Lovelace

Recent session context (most recent 20 turns / 8000 tokens):
<truncated transcript>

Return one of three envelopes:
- { "kind": "ok", "args": { ... } } when every required parameter can be confidently extracted.
- { "kind": "needs_info", "message": "<one sentence>" } when a required parameter cannot be determined.
- { "kind": "ambiguous", "message": "<one sentence>", "candidates": [...] | null } when multiple bindings are plausible.

Do not invent values for defaulted parameters that the user did not specify; omit them.
```

#### System-prompt structure (normative)

The rendered prompt MUST satisfy each obligation below. Wording may vary; the listed tokens, line-prefixes, and conditional-presence rules are the contract. Conditional rules (items 2, 3, 4, and 6) require both a positive assertion when the trigger is present and a negative assertion when the trigger is absent — neither half alone exercises the rule.

1. **Loom identity line.** A line of the form `Loom: /<name>` MUST appear, where `<name>` is the bare slash command name (no leading `/`, matching the byte sequence hashed by [Determinism](./determinism-cancellation-failure.md#determinism) below). Exactly one such line per prompt.
2. **Description line.** When the loom's frontmatter `description:` is non-empty, a line of the form `Description: <description>` MUST appear. When `description:` is absent or empty, the line MUST be omitted entirely (no `Description:` token with an empty value).
3. **Argument-hint line.** When frontmatter `argument-hint:` is non-empty, a line of the form `Argument hint: <value>` MUST appear exactly once. When absent or empty, the line MUST be omitted entirely.
4. **Parameters block.** When `params:` declares ≥1 field, the block MUST contain a header line `Parameters:` (unindented) followed by one per-field line per declared field, in declaration order. Each per-field line MUST be indented with exactly two U+0020 SPACE characters and MUST contain no other leading whitespace (no tabs, no additional spaces). After the indent, each per-field line MUST match the template

   ```
   <wire-name> (<type>) <requirement>[ — <description>]
   ```

   where `<wire-name>` is the field's wire name; `<type>` is rendered per *Type display* below; `<requirement>` is exactly one of the literal tokens `required` or `default=<literal>` with `<literal>` rendered per *Default-literal rendering* below; and the `— <description>` segment is appended iff the field carries a non-empty `description:` (per [Descriptions](../descriptions.md), after that section's normalisation), in which case the separator preceding the description is exactly the byte sequence U+0020 U+2014 U+0020 (one space, em-dash, one space) and the description follows verbatim. When the field's `description:` is absent or empty after normalisation, the entire ` — <description>` segment — including its leading space and the em-dash — MUST be omitted, and the line MUST end immediately after `<requirement>` with no trailing whitespace. The fixed token order `<wire-name> (<type>) <requirement>` is normative; renderers MUST NOT reorder these three tokens, MUST NOT insert additional whitespace between them beyond the single U+0020 SPACE shown, and MUST NOT omit the parentheses around `<type>`. When `params:` is absent or empty, the entire `Parameters:` block (header **and** all per-field lines) MUST be omitted.
5. **User-arguments line.** A line of the form `User arguments: <raw>` MUST appear, where `<raw>` is the raw slash text after the command name with leading and trailing [slash-argument whitespace](#slash-argument-whitespace) stripped and no other normalisation. When the user supplied no arguments, `<raw>` is the empty string and the line still appears (the `User arguments:` token is followed by a single space and then nothing).
6. **Session-context block.** When `bind_context: session` and the [Session-context truncation](./binder-model-and-context.md#session-context-truncation-bind_context-session) walk produced ≥1 included turn, the prompt MUST contain a delimited block whose opening line begins with the literal token `Recent session context` and whose body is the included transcript rendered per [Compact-transcript format](./binder-model-and-context.md#compact-transcript-format-normative). When the walk produced zero included turns (single oversized newest turn, empty session) or `bind_context: none`, the entire block — opening line and body — MUST be omitted (no header with empty body).
7. **Envelope-kinds enumeration.** The prompt MUST list all three envelope kinds by their `kind`-token names: `ok`, `needs_info`, `ambiguous`. The exact phrasing of each kind's accompanying description is non-normative; the three kind-name tokens are normative.
8. **No-invent-defaults instruction.** The prompt MUST contain a single line that includes both the literal substring `defaulted` (case-sensitive) and at least one of the directive substrings `Do not`, `omit`, or `skip` (case-sensitive). The rest of the wording is non-normative.

*Type display.* The per-field type rendering in item 4 MUST use the field's declared Loom type written in the surface syntax of [Type System](../type-system.md), not the JSON Schema lowering. Reference renderings (normative; conforming implementations MUST reproduce these exactly):

| Declared Loom type | Renders as |
| --- | --- |
| `string` | `string` |
| `integer` | `integer` |
| `boolean` | `boolean` |
| `Severity` (enum) | `Severity` |
| `Author` (named schema) | `Author` |
| `array<integer>` | `array<integer>` |
| `string \| null` | `string \| null` |
| `Cat \| Dog` (discriminated union) | `Cat \| Dog` |

*Default-literal rendering.* The `<literal>` in `default=<literal>` (item 4) MUST be the field's default value rendered in the [Loom literal sublanguage](../grammar.md#loom-literal-sublanguage) surface syntax — the same notation accepted on the RHS of `params:` defaults. A default of `Severity.High` round-trips as `default=Severity.High`; a string default `"hello"` round-trips as `default="hello"`; an array default `[1, 2, 3]` round-trips as `default=[1, 2, 3]`; the empty-array default `[]` round-trips as `default=[]`.

*Parameter-line reference renderings.* The per-field lines reproduced from the *Binder system prompt* example above are normative; conforming implementations MUST reproduce these exact byte sequences (each row's rendering is the indent-and-content portion of one per-field line, ending immediately before its terminating `\n`):

| Field declaration (Loom source) | Per-field line |
| --- | --- |
| `language: string` with `description: "the language being reviewed"` | `  language (string) required — the language being reviewed` |
| `focus_areas: array<string> = []` with `description: "comma-separated focus areas"` | `  focus_areas (array<string>) default=[] — comma-separated focus areas` |
| `author: Author` with `description: "the author of the code under review"` | `  author (Author) required — the author of the code under review` |

A fourth reference rendering pins the description-omitted form: a field declared `language: string` with no `description:` (or with a `description:` that normalises to empty) renders as `  language (string) required` — the line ends after `required`, with no trailing space, no em-dash, and no `\n`-internal whitespace. The two leading spaces are U+0020 U+0020; an implementation that emits `\t`, a single space, three or more spaces, or any non-space leading whitespace is non-conforming.
