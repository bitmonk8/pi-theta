# Slash-Command Argument Binding

When a loom is invoked from a slash command, the runtime translates the user's free-form argument string into the loom's typed `params:` via an LLM call — the **binder**. The binder runs once per slash invocation, before any of the loom's own queries. It does not apply to `invoke(...)` calls or to looms invoked as registered tools (both of those pass already-typed values).

The binder is positioned as runtime infrastructure, not as part of the loom's conversation: it never adds turns to the user's session (in prompt mode) or to the loom's spawned conversation (in subagent mode), and the loom code never sees the binder's intermediate envelope. Authors interact with the *result* of binding (their `params` are populated, or the loom doesn't run) the same way they would with any typed `invoke(...)` call.

## Binder model

Resolved at loom-load time from a two-step chain: `bind_model:` frontmatter field, then the loom-extension setting `looms.binderModel` in `settings.json` (read per [Settings file reads](./discovery.md#settings-file-reads); not a Pi-recognised setting). There is **no further fallback** — no "tier-2" default, and the loom's own `model:` is not consulted (using it silently negates the cost premise that motivates a separate binder model). When neither source resolves and the loom is not bypass-eligible (per [Binder bypass](#binder-bypass) below), the loom fails to load with `loom/load/binder-model-unresolved`; the loom is reported through the diagnostics channel ([Diagnostics](./diagnostics.md)) and its slash command is **not** registered.

> **Note (non-normative):** Binder calls are structurally function-calling tasks (schema in, JSON out), so cheaper structured-output-capable models (e.g. Claude Haiku, GPT-4o-mini, Gemini Flash) are usually adequate; authors with unusually subtle schemas can override per-loom via `bind_model:`. The model-selection guidance is advisory only — the only normative requirement is the strict-capability gate above.

<a id="strict-capability-requirement"></a>
The resolved model must support strict structured-output / strict tool-input. The runtime checks this at the same load-time pass by calling `ctx.modelRegistry.find(provider, modelId)` and probing the returned `Model<Api>` by name for a `strictCapable` field. The probe is duck-typed: `(model as { strictCapable?: boolean }).strictCapable` is read as a three-valued check — `true` admits the model with no diagnostic; `false` emits `loom/load/binder-model-not-strict-capable` (E) and refuses to register the loom; `undefined` (the field is absent) emits `loom/load/binder-model-strict-capability-unknown` (W) and registers the loom. Under `pi-coding-agent ^0.72.1`'s `Model<Api>`, the `strictCapable` field is absent, so production behaviour is the universal-W branch and runtime envelope-malformed failures surface via the failure-mode template (no diagnostic code; the user-facing system note is the operator surface). The runtime MUST short-circuit the `strictCapable` probe when `ModelRegistry.find` returns `null` (governed by `loom/load/binder-model-unresolved` instead). The probe field name `strictCapable` is the loom-side constant; if a future `pi-coding-agent` minor exposes the indicator under a different name, the rename is enforced by the bump-procedure step (specifically the strict-capability probe step) and by the build-time SDK surface-inventory assertion that catches "a `Model<Api>` member resembling a strict-capability concept under a name other than the pinned one". Bypass-eligible looms (no-params bypass and single-string bypass; see [Binder bypass](#binder-bypass)) skip both checks — they never call the binder.

Hot-reload of Pi settings (`looms.binderModel` changed at runtime) re-resolves on the next loom load; it does not retroactively fix already-failed loads. When the change would have allowed a previously-failed load to succeed, the runtime emits a single consolidated `loom-system-note` listing the affected slash names and prompting the user to run `/reload`.

## Binder context

Configured via `bind_context:` (`none` | `session`; default `none`).

- `none` — the binder sees only the slash text and the loom's frontmatter. Predictable, cheap, deterministic.
- `session` — prompt-mode-only; the binder additionally receives the last ~20 turns or ~8000 tokens (whichever is smaller) of the caller's session as grounding context.

> **Note (non-normative):** Use `bind_context: none` when the slash arguments are self-contained (e.g. `/code-review TypeScript focusing on error handling, by Ada Lovelace`). Use `bind_context: session` when the loom relies on conversational anaphora (e.g. `/review the spec` resolving "the spec" against the surrounding session). The choice is an authoring decision; runtime behaviour for each value is fully specified above.

Declaring `bind_context: session` on a subagent-mode loom is `loom/parse/bind-context-session-on-subagent` (warning, not error) — subagent-mode looms invoked from a slash command have no caller-session context to attach.

> **V1 seam — automatic context escalation.** The binder-invocation path is **re-entrant per loom turn**: V1 issues exactly one binder call per slash invocation (and `bind_context` is therefore observed at most once per invocation), but the path makes no assumption that `bind_context` is set at most once per loom over the loom's lifetime. The binder's input record (parameter table, raw slash text, optional session-context block) and the resolved binder-model handle are constructed afresh on every binder call, with no cached state that would prevent a second call from observing a different `bind_context` snapshot. The seam is what allows the deferred *automatic context escalation* extension in [Future Considerations](./future-considerations.md) to land additively: a future revision in which a binder call returning `needs_info` triggers an automatic retry with `bind_context: session` attached needs no rework of the binder-invocation path.

## Binder bypass

<a id="bypass-cases"></a>
Two cases skip the binder call entirely; in both, no envelope schema is constructed at load time. The bypass decision is made at loom-load time from the static schema; there is no per-invocation branching.

1. **No-params bypass.** When `params:` is absent, `params: {}`, the loom takes no parameters and the binder does not run. Slash-argument overflow against a no-params loom is governed by [Slash-Command Invocation — No-params overflow](./slash-invocation.md); the binder's only contribution is to not run. `bind_echo`, `bind_context`, and `bind_model` on a no-params loom have nothing to bind — `bind_echo: true` is a load warning (`loom/load/bind-echo-without-params`) and produces no echo regardless; `bind_context` and `bind_model` are silently ignored (they may be inherited from project-wide settings).
2. **Single-string bypass.** When `params:` declares exactly one field, that field's type is `string`, and the field has no default, the runtime sets the param's value to the entire slash-argument string (with leading and trailing whitespace trimmed) and skips the binder call. AJV validation still runs as a safety net (a string passes by definition; this is just the standard validation path).

All other shapes — multiple fields, non-string types, defaults present, optional or nullable types — go through the binder. The no-params bypass check runs **before** the single-string bypass check, so a `params: {}` loom does not accidentally match the single-string branch.

## Binder envelope

The binder is asked to return one of three structured outputs (the schema is constructed dynamically by the runtime from the loom's `params:`):

- `{ kind: "ok", args: <typed params object> }` — successful extraction. The runtime AJV-validates `args` against the params schema (safety net for hallucinated field shapes), fills any defaulted fields not present in `args`, and starts the loom.
- `{ kind: "needs_info", message: string }` — the binder could not extract one or more required fields. The `message` is shown to the user as a system note; the loom does not run.
- `{ kind: "ambiguous", message: string, candidates: array<string> | null }` — multiple plausible bindings exist and the binder cannot pick one. The `message` is shown to the user as a system note; the loom does not run.

The envelope is runtime-internal; it is never a Loom-visible type and never appears in loom code. Authors only see the *consequences* of binding (loom runs, or system note appears).

> **V1 seam — binder refinement loop.** The two failure arms produce indistinguishable V1 user-facing behaviour beyond the system-note prefix; the structural distinction exists for the deferred binder refinement loop (cf. [Future Considerations — Binder refinement loop](./future-considerations.md#binder-refinement-loop)), where only `needs_info` reopens for a clarifying turn while `ambiguous` still terminates. The `candidates` field stays in the schema (binder may emit it; AJV accepts `null`), but the runtime MUST NOT surface it in V1 — the `ambiguous` system note text contains only `<message>`. Forward-compatible without the cost of either collapsing the arms now or rendering candidates the V1 templates do not require.

### Binder envelope schema (constructed dynamically from `params:`)

The runtime emits one envelope schema per loom at load time and reuses it for every binder call. The envelope is a discriminated union over `kind` and conforms to the [Schema Subset](./schema-subset.md); the runtime constructs it directly rather than via the lowering pass, but the shape is exactly what the lowering pass would produce for `schema BinderEnvelope = Ok | NeedsInfo | Ambiguous`.

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

The `maxLength: 500` cap on `message` and on each `candidates[i]` is a budget for the binder model, not a user-visible cap; the user-visible cap and shaping rules live under [System-note rendering](#system-note-rendering) below. The schema cap exists so that a runaway binder response is rejected as malformed (exercising the malformed-envelope row in the failure-modes table) rather than silently truncated downstream.

`<params-schema-with-defaulted-fields-relaxed>` is a copy of the loom's lowered `params` schema with one transformation: each field that declared a default is removed from `required` (its type is unchanged). Required-without-default fields are unchanged. The binder may therefore omit any defaulted field; the runtime fills the actual default value after binding succeeds and before AJV validates the merged result. The relaxed copy must itself satisfy the subset, including `additionalProperties: false`; if every params field has a default, the copy's `required` is `[]`.

The `args` arm embeds a schema fragment that may carry `$ref`s into the loom file's `$defs`. The envelope schema document handed to the provider (and to AJV) carries the transitive `$defs` closure of the params schema, computed by the same per-query pruning rule as [Schema Subset step 4](./schema-subset.md#lowering-algorithm).

### Session-context truncation (`bind_context: session`)

Token counts are computed per message via `estimateTokens` and the message list is sourced from `ctx.sessionManager.buildSessionContext().messages` — both contracts are catalogued in [Pi Integration Contract](./pi-integration-contract.md). A turn's token count is the sum of `estimateTokens` over its constituent messages (user / assistant / toolResult / custom); a turn is a user message plus all subsequent assistant / toolResult / custom messages up to (but not including) the next user message. The runtime walks turns newest-to-oldest and stops including a turn the moment the running token sum would exceed 8000 *or* the running turn count would exceed 20 — whichever bound is reached first. The over-budget turn is excluded entirely (whole-turn truncation; partial messages are not split), as is everything older. Equivalently: a candidate turn is included iff, after inclusion, the running token total is ≤ 8000 *and* the running turn count is ≤ 20; the first candidate that would violate either inequality is excluded entirely and terminates the walk. The included context is rendered as a compact transcript and embedded in the binder's system prompt below the parameter table.

*Worked example.* With per-turn token counts (newest first) `[1200, 900, 1500, 2000, 2800, …]` and the 8000-token budget, the walk includes the first four turns (running total 5600), then evaluates the fifth: 5600 + 2800 = 8400 > 8000, so the fifth turn and everything older is dropped. Final included context: 4 turns, 5600 tokens. *Single oversized turn at the front.* If the newest turn alone exceeds 8000 tokens, the walk includes nothing and the binder runs with no session-context block (no special-case; the same exclusive rule applies on the first turn evaluated). *Token-cap equality.* With per-turn counts (newest first) `[3000, 2500, 2500, 100, …]`, the walk includes the first three turns (running total exactly 8000, count 3) and evaluates the fourth: `8000 + 100 = 8100 > 8000`, so the fourth turn and everything older is dropped. Final included context: 3 turns, 8000 tokens. The cap-equality boundary is inclusive. *Turn-cap equality.* With 21 turns whose running token total never exceeds 8000, the walk includes the 20 newest turns (count exactly 20) and evaluates the 21st: count would become 21 > 20, so it is excluded regardless of its token weight. Final included context: 20 turns. The 20-turn boundary is inclusive.

### Binder system prompt

The runtime constructs a system prompt that conveys the loom's binding context to the binder model. The exact wording is not part of the contract; the structural obligations enumerated under *System-prompt structure (normative)* below are. The fenced block that follows is one conforming rendering, included for illustration; an alternative renderer that satisfies every obligation in the structure list is equally conformant.

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

1. **Loom identity line.** A line of the form `Loom: /<name>` MUST appear, where `<name>` is the bare slash command name (no leading `/`, matching the byte sequence hashed by [Determinism](#determinism) below). Exactly one such line per prompt.
2. **Description line.** When the loom's frontmatter `description:` is non-empty, a line of the form `Description: <description>` MUST appear. When `description:` is absent or empty, the line MUST be omitted entirely (no `Description:` token with an empty value).
3. **Argument-hint line.** When frontmatter `argument-hint:` is non-empty, a line of the form `Argument hint: <value>` MUST appear exactly once. When absent or empty, the line MUST be omitted entirely.
4. **Parameters block.** When `params:` declares ≥1 field, the block MUST contain a header line `Parameters:` followed by one indented line per declared field, in declaration order. Each per-field line MUST contain (a) the field's wire name, (b) its declared type rendered per *Type display* below, and (c) one of the tokens `required` or `default=<literal>` where `<literal>` is the default rendered in [Loom literal sublanguage](./grammar.md#loom-literal-sublanguage) surface syntax. When the field carries a non-empty `description:` (per [Descriptions](./descriptions.md)), the line MUST also include that description; when absent or empty, the description segment MUST be omitted. When `params:` is absent or empty, the entire `Parameters:` block (header **and** all per-field lines) MUST be omitted.
5. **User-arguments line.** A line of the form `User arguments: <raw>` MUST appear, where `<raw>` is the raw slash text after the command name with leading and trailing whitespace stripped and no other normalisation. When the user supplied no arguments, `<raw>` is the empty string and the line still appears (the `User arguments:` token is followed by a single space and then nothing).
6. **Session-context block.** When `bind_context: session` and the [Session-context truncation](#session-context-truncation-bind_context-session) walk produced ≥1 included turn, the prompt MUST contain a delimited block whose opening line begins with the literal token `Recent session context` and whose body is the truncated transcript per that section. When the walk produced zero included turns (single oversized newest turn, empty session) or `bind_context: none`, the entire block — opening line and body — MUST be omitted (no header with empty body).
7. **Envelope-kinds enumeration.** The prompt MUST list all three envelope kinds by their `kind`-token names: `ok`, `needs_info`, `ambiguous`. The exact phrasing of each kind's accompanying description is non-normative; the three kind-name tokens are normative.
8. **No-invent-defaults instruction.** The prompt MUST contain an instruction directing the model not to invent values for defaulted parameters the user did not specify. Wording is non-normative; the instruction's presence is.

*Type display.* The per-field type rendering in item 4 MUST use the field's declared Loom type written in the surface syntax of [Type System](./type-system.md), not the JSON Schema lowering. Reference renderings (normative; conforming implementations MUST reproduce these exactly):

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

*Default-literal rendering.* The `<literal>` in `default=<literal>` (item 4) MUST be the field's default value rendered in the [Loom literal sublanguage](./grammar.md#loom-literal-sublanguage) surface syntax — the same notation accepted on the RHS of `params:` defaults. A default of `Severity.High` round-trips as `default=Severity.High`; a string default `"hello"` round-trips as `default="hello"`; an array default `[1, 2, 3]` round-trips as `default=[1, 2, 3]`; the empty-array default `[]` round-trips as `default=[]`.

## Defaulting

Defaults declared on `params:` fields are filled by the runtime *after* the binder returns, not by the binder. The binder is told (in its system prompt) which fields are required and which have defaults; for default-having fields, the binder may omit them from `args` when the user did not specify them, and the runtime fills the defaults before AJV validation. The binder is never asked to invent default values — only to extract what the user actually said.

<a id="system-note-rendering"></a>
## System-note rendering

All binder-emitted system notes — the success echo, the `needs_info` and `ambiguous` failure messages, and the three runtime-emitted failure rows in the table below — share one line-discipline. The rules apply uniformly to every model-supplied or runtime-supplied substring interpolated into the note; `bind_echo` and the failure-modes table reference back here rather than restating them.

1. **Single line.** Replace each `\r`, `\n`, and `\r\n` in any model-supplied substring (the echo's interpolated values, the `message` field, each `candidates[i]`) with a single space. Collapse runs of whitespace to one space. Trim leading and trailing whitespace from the result.
2. **Length cap.** The fully-rendered note (loom-controlled prefix + interpolated content) is capped at 120 Unicode code points. Truncation operates at code-point (Unicode scalar) boundaries — never at UTF-16 code unit boundaries, which would split surrogate pairs. When the rendered note exceeds 120 code points, the runtime MUST replace the overflow with a trailing `…` (U+2026) and the resulting note MUST be exactly 120 code points (the `…` counts toward the cap). When the rendered note is ≤120 code points, no `…` is appended. Implementations MAY additionally back the truncation point off to the nearest preceding extended grapheme cluster boundary as a rendering courtesy, provided the resulting note is still ≤120 code points; this back-off is non-normative and tests MUST NOT assert cluster-aware behaviour. The cap applies post-interpolation, so a long loom name reduces the budget available to the suffix; do not pre-truncate the suffix to a fixed sub-budget. Rule 1's whitespace collapse and trim run before this rule, so the 120-scalar measurement is taken over the rule-1 output. Note: `string.length` in JavaScript returns UTF-16 code units and over-counts every astral code point as 2; count scalars via `Array.from(str).length` or a `for…of` iterator.
3. **Prefix is loom-controlled, suffix is model- or runtime-controlled.** Failure-arm notes follow the grammar `loom /<name>: <fixed-phrase> — <sanitised-suffix>`; the success echo follows `Running /<name>: <formatted-args>`. The em-dash in failure notes (and the `:` in the echo) is the textual demarcation between the loom-controlled prefix and the model- or runtime-supplied suffix. Renderers MAY style the prefix distinctly, but the boundary is part of the contract so a downstream renderer knows which span it can trust.
4. **Empty model-supplied content.** A `message` that is empty after rule 1's stripping — the binder returned only whitespace — is treated as a malformed envelope, not as an empty note: surface via the malformed-envelope row in the failure-modes table. The same applies to a `candidates` array whose every entry is empty after stripping.
5. **`ambiguous.candidates` is not rendered in V1.** The `candidates` field stays in the binder envelope schema (the binder may emit it; AJV accepts `null`) but the V1 runtime does not surface it on the user-facing system note — the `ambiguous` row of the failure-modes table renders only `<message>`. The rendering question (and the array-truncation rules a future revision would need) is deferred along with the binder refinement loop; see [Future Considerations — Binder refinement loop](./future-considerations.md#binder-refinement-loop).

## Echo policy

Configured via `bind_echo:` (`true` | `false`; default `true`). When echo is on (and the bypass did not apply), the runtime appends a one-line system note to the user's session immediately before the loom starts. The example below is illustrative — the format rules that follow are normative; no single example string can be (the formatter is data-driven and the rendered text depends on the loom's `params:` and the bound values):

> Running `/code-review`: language=TypeScript, focus_areas=[error handling, async], author={Ada Lovelace, …}

Format rules:

- Top-level `params:` fields shown in declaration order, comma-separated.
- String values are rendered **unquoted** if the string is non-empty and every Unicode code point matches `[A-Za-z0-9_.-]`; otherwise they are rendered **quoted**. The quoted form is U+0022 (`"`), then the string with each U+0022 replaced by `\"` and each U+005C (`\`) replaced by `\\` (no other escapes), then a closing U+0022. The empty string renders as `""`. Whitespace, ASCII punctuation outside the unquoted set, non-ASCII letters, and C0 control characters all fall outside the unquoted set and therefore force quoting; only `"` and `\` are escaped — newlines cannot reach the formatter because [System-note rendering](#system-note-rendering) rule 1 has already collapsed them to spaces upstream.
- Array values: arrays of **3 or fewer** elements are shown in full as `[a, b, c]` in element order; arrays of **4 or more** elements are shown as `[a, b, c, …+N more]` where the rendered prefix is the first three elements in order and `N` is the count of dropped elements (i.e. `total − 3`). An empty array renders as `[]`. Per-element rendering follows the same rules recursively (a string element is quoted by the same predicate as a top-level string value; a nested object element renders as `{first-field-value, …}`).
- Object values shown as `{first-field-value, …}` — just the first field's value as a hint. "First field" of an object value is the first field listed in the declaring `schema` block's source order (the same notion of order used by the top-level `params:` bullet above). For a value whose static type is a discriminated union, the variant's declared fields are used in the variant's own source order; the discriminator field is included in that order if it appears there. The "field order is irrelevant" clause in [Type System](./type-system.md) compatibility row 8 governs type compatibility only and does not override this rendering rule.
- Defaulted fields tagged `(default)`: `focus_areas=[] (default)`.
- Total line subject to the shared 120-code-point cap defined in [System-note rendering](#system-note-rendering) above, measured over the whole line including the `Running \`/<name>\`: ` prefix; overflow truncated with `…`. The line-level cap wins over the array rule's own `…+N more` marker — if truncation falls inside an array, the inner `…+N more` may be cut. The 120-code-point cap is applied *after* per-value rendering, so a quoted string that fits its own predicate may still be truncated at the line level.

Reference renderings (normative; conforming implementations MUST reproduce these exactly):

| Value (declared type) | Renders as |
| --- | --- |
| `""` (string) | `""` |
| `"plain_id-1.2"` (string) | `plain_id-1.2` |
| `"has space"` (string) | `"has space"` |
| `"key=value"` (string) | `"key=value"` |
| `"with \"quote\" and \\slash"` (string) | `"with \"quote\" and \\slash"` |
| `"café"` (string) | `"café"` |
| `Cat { name: "Whiskers", color: "red" }` (schema declares `name` first) | `{Whiskers, …}` |
| `Pet::Cat { kind: "cat", name: "Whiskers" }` (variant declares `kind` first) | `{cat, …}` |
| `[]` (array) | `[]` |
| `["a", "b c"]` (array) | `[a, "b c"]` |

Setting `bind_echo: false` suppresses the echo. The bypass case (single-string param) auto-suppresses echo regardless of the frontmatter setting (there is nothing to misbind); declaring `bind_echo: true` on a bypass-eligible loom is `loom/parse/bind-echo-on-bypass` (warning).

The echo channel is also used for the binder's `needs_info` and `ambiguous` outputs, which *replace* execution rather than precede it (both shaped by [System-note rendering](#system-note-rendering)):

> loom `/code-review`: argument binding needs more info — missing required field `language`. Specify the language being reviewed.

> loom `/code-review`: ambiguous arguments — "focusing on Ada" could mean focus_areas or author. Be more explicit.

## Determinism

Binder calls use `temperature: 0`. The seed value for a binder call is the 32-bit FNV-1a hash (offset basis `0x811c9dc5`, prime `0x01000193`) of the loom's qualified name as it appears in the slash registry (the bare command name, without the leading `/`), masked to 32-bit unsigned. The byte sequence hashed is the UTF-8 encoding of the bare command name, with no BOM and no NUL terminator. Equivalently, on a slash name `s` matching `^[a-z0-9][a-z0-9_-]*$` the input bytes are the ASCII code points of `s` in order. Reference vectors (loom name → 32-bit unsigned seed, hex):

| Loom name | Seed |
| --- | --- |
| `code-review` | `0x7ba86b63` |
| `hello` | `0x4f9f2cab` |
| `a` | `0xe40c292c` |

Conforming implementations MUST reproduce these values exactly. The mask to 32-bit unsigned applies to the *output*; the multiply step's working width is an implementation choice (e.g. `Math.imul` chains in JS) and per-byte intermediate state is not separately masked beyond what the canonical algorithm specifies. JSON serialisation of the seed is a plain number, not a hex string — the hex notation above is for human cross-checking only. The same loom therefore produces the same seed on every binder call across processes and runs.

> **Note (non-normative):** FNV-1a 32-bit is non-cryptographic and offers no collision guarantees; the hash is used only to make the per-loom binder seed deterministic across processes, not as a registration key (registration-cache collisions are governed by `loom/runtime/registration-cache-collision`, which hashes lowered tool schemas under SHA-256, not binder names).

Whether the seed is included in the request payload, and under which field name, is governed by the per-provider mapping in [Pi Integration Contract — Provider seed-field mapping](./pi-integration-contract.md#provider-seed-field-mapping).

## Cancellation

The binder participates in cancellation per [Cancellation](./cancellation.md). The runtime checks `ctx.signal` immediately before issuing the binder call and forwards the signal to the binder model's provider invocation; the initial attempt and every retry permitted by the per-invocation budget below honour the signal. A cancelled binder produces the cancelled-binder system note in the failure-modes table below and the loom does not run. The bypass path (single no-default `string` param, no LLM call) is naturally cancellable at the next regular checkpoint inside the loom body; the cancelled-binder system note does not apply to bypass-eligible looms.

## Failure modes

Binder failures are runtime-handled and surface as system notes in the user's session, never as `Result` values to loom code. V1 has no `BinderError` variant in the `QueryError` union (it would have nowhere to flow — a failed binder means the loom never starts). Every shape below is rendered through the shared discipline in [System-note rendering](#system-note-rendering); the table gives the pre-discipline templates.

### Failure-mode templates (normative)

Renderers MUST emit the surrounding template text verbatim; only the `<…>` placeholders are interpolated. The `<message>` and `<candidates>` placeholders carry model-supplied content and are non-deterministic, but the surrounding template (the `loom /<name>:` prefix, the `—` separator, the trailing parenthetical or `candidates:` clause) is fixed. Wording changes are spec-versioned breaking changes. `<ajv-summary>` is rendered by the AJV helper `errorsText(errors, { separator: '; ' })` with the data-path prefix retained, so the summary content is itself stable across runs against the same envelope; the surrounding template is normative regardless of how AJV evolves its internal formatting.

The six user-facing shapes:

| Cause | System note |
|---|---|
| `needs_info` | `loom /<name>: argument binding needs more info — <model's message>` |
| `ambiguous` | `loom /<name>: ambiguous arguments — <model's message>` (V1 does not render `candidates`; see [System-note rendering](#system-note-rendering) rule 5) |
| Binder model transport failure (after 1 retry) | `loom /<name>: argument binder unavailable (<provider>: <message>)` |
| Binder returned malformed envelope (after 1 retry) | `loom /<name>: argument binding failed — could not parse arguments` |
| AJV validation of the binder's `args` failed (no retry) | `loom /<name>: argument binding produced invalid args — <ajv-summary>` |
| `ctx.signal` aborted before or during the binder call | `loom /<name>: argument binding cancelled` |

Transport failures and malformed-envelope failures each get exactly one retry; the second failure of that class surfaces as the system note above. AJV validation failures on `args` are not retried — a binder that returned a structurally valid envelope whose `args` violate the params schema is hallucinating field shapes, and a re-prompt with the same system prompt would not change the outcome. Respond-repair follow-ups (the mechanism typed queries use for response-schema repair) do not apply to any binder failure; the frontmatter `respond_repair.attempts` / `respond_repair.methodology` knobs apply only to typed queries from loom code, and the binder uses fixed retry counts and does not consult them.

Each retry-eligible failure class has a single retry budget **per slash invocation**: at most one transport-failure retry and at most one malformed-envelope retry, regardless of how the two interleave. A transport failure observed on the retry of a malformed envelope consumes the transport budget (not a second malformed attempt); a malformed envelope observed on the retry of a transport failure symmetrically consumes the malformed budget. Once a class's budget is consumed it is not replenished, even if the failure first appears as the consequence of another class's retry. Therefore the runtime MUST issue at most **3** binder LLM calls per slash invocation (1 initial attempt + at most 1 transport-class retry + at most 1 malformed-envelope-class retry). When the chain ends with both budgets exhausted, the surfaced system note is the row matching the **most recent** failure observed (e.g. a chain ending in a malformed envelope renders the malformed-envelope row, even if a transport failure occurred earlier in the chain). AJV validation of `args` is unaffected by the cap — it carries no retry budget of its own and may fire on whichever of the (up to 3) calls returns the first structurally valid envelope.

The malformed-envelope retry must re-issue the binder call against the *same* envelope schema (no schema mutation between attempts) so the failure stays observable as a flake rather than a moving target. An abort observed during any retry permitted by the budget above suppresses that retry and surfaces the cancelled-binder note immediately, irrespective of which class's budget remains. An abort observed *after* the binder returned `ok` but *before* AJV validation runs lets validation complete (AJV is fast and uncancellable per [Cancellation](./cancellation.md)) and surfaces at the next checkpoint inside the loom body, consistent with the no-retroactive-`Ok`-to-`Err` rule.
