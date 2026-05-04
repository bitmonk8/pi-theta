# Slash-Command Argument Binding

When a loom is invoked from a slash command, the runtime translates the user's free-form argument string into the loom's typed `params:` via an LLM call — the **binder**. The binder runs once per slash invocation, before any of the loom's own queries. It does not apply to `invoke(...)` calls or to looms invoked as registered tools (both of those pass already-typed values).

The binder is positioned as runtime infrastructure, not as part of the loom's conversation: it never adds turns to the user's session (in prompt mode) or to the loom's spawned conversation (in subagent mode), and the loom code never sees the binder's intermediate envelope. Authors interact with the *result* of binding (their `params` are populated, or the loom doesn't run) the same way they would with any typed `invoke(...)` call.

**Binder model.** Configured via the `binder_model:` frontmatter field, which falls back to the loom-extension setting `looms.binderModel` in `settings.json` (read per [Settings file reads](./discovery.md#settings-file-reads); not a Pi-recognised setting), defaulting to a cheap tier-2 model such as Claude Haiku, GPT-4o-mini, or Gemini Flash. Binder calls are structurally function-calling tasks — schema in, JSON out — and tier-2 models are more than capable. Authors with unusually subtle schemas (overlapping discriminated-union fields, semantically close enum variants) can override per-loom by setting `binder_model:` to a stronger model.

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

**Binder envelope schema (constructed dynamically from `params:`).** The runtime emits one envelope schema per loom at load time and reuses it for every binder call:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["kind"],
  "properties": {
    "kind": { "enum": ["ok", "needs_info", "ambiguous"] }
  },
  "anyOf": [
    {
      "properties": {
        "kind": { "const": "ok" },
        "args": <params-schema-with-defaulted-fields-relaxed>
      },
      "required": ["kind", "args"]
    },
    {
      "properties": {
        "kind": { "const": "needs_info" },
        "message": { "type": "string" }
      },
      "required": ["kind", "message"]
    },
    {
      "properties": {
        "kind": { "const": "ambiguous" },
        "message": { "type": "string" },
        "candidates": { "anyOf": [{ "type": "array", "items": { "type": "string" } }, { "type": "null" }] }
      },
      "required": ["kind", "message", "candidates"]
    }
  ]
}
```

`<params-schema-with-defaulted-fields-relaxed>` is a copy of the loom's lowered `params` schema with one transformation: each field that declared a default is removed from `required` (its type is unchanged). Required-without-default fields are unchanged. The binder may therefore omit any defaulted field; the runtime fills the actual default value after binding succeeds and before AJV validates the merged result.

**Session-context truncation (`bind_context: session`).** The runtime walks turns from newest to oldest, accumulating until *either* 20 turns *or* 8000 tokens (whichever is smaller) has been included. Token counts come from Pi's `ctx.getContextUsage()` (model-aware). Truncation is whole-turn; partial messages are not split. The included context is rendered as a compact transcript and embedded in the binder's system prompt below the parameter table.

**Binder system prompt template** (literal text, not user-configurable in V1; see [Future Considerations](./future-considerations.md)):

```
You bind free-form slash-command arguments to typed loom parameters.

Loom: /<name>
Description: <description from frontmatter>
Argument hint: <argument-hint from frontmatter>

Parameters:
<for each param:
  "  <name> (<type>) <required|default=<value>> — <description if any>">

User arguments: <raw slash text after the command name>

[Recent session context (when bind_context: session):
<truncated transcript>
]

Return one of three envelopes:
- { "kind": "ok", "args": { ... } } when every required parameter can be confidently extracted.
- { "kind": "needs_info", "message": "<one sentence>" } when a required parameter cannot be determined.
- { "kind": "ambiguous", "message": "<one sentence>", "candidates": [...] | null } when multiple bindings are plausible.

Do not invent values for defaulted parameters that the user did not specify; omit them.
```

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
