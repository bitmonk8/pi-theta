# Slash-Command Argument Binding

When a loom is invoked from a slash command, the runtime translates the user's free-form argument string into the loom's typed `params:` via an LLM call — the **binder**. The binder runs once per slash invocation, before any of the loom's own queries. It does not apply to `invoke(...)` calls or to looms invoked as registered tools (both of those pass already-typed values).

The binder is positioned as runtime infrastructure, not as part of the loom's conversation: it never adds turns to the user's session (in prompt mode) or to the loom's spawned conversation (in subagent mode), and the loom code never sees the binder's intermediate envelope. Authors interact with the *result* of binding (their `params` are populated, or the loom doesn't run) the same way they would with any typed `invoke(...)` call.

## Binder model

Resolved at loom-load time from a two-step chain: `bind_model:` frontmatter field, then the loom-extension setting `looms.binderModel` in `settings.json` (read per [Settings file reads](./discovery.md#settings-file-reads); not a Pi-recognised setting). There is **no further fallback** — no "tier-2" default, and the loom's own `model:` is not consulted (using it silently negates the cost premise that motivates a separate binder model). When neither source resolves and the loom is not bypass-eligible (per [Binder bypass](#binder-bypass) below), the loom fails to load with `loom/load/binder-model-unresolved`; the loom is reported through the diagnostics channel ([Diagnostics](./diagnostics.md)) and its slash command is **not** registered. Binder calls are structurally function-calling tasks — schema in, JSON out — and a cheap tier-2 model (Claude Haiku, GPT-4o-mini, Gemini Flash, etc.) is more than capable; authors with unusually subtle schemas can override per-loom by setting `bind_model:`.

The resolved model must support strict structured-output / strict tool-input. The runtime checks this at the same load-time pass by calling `ctx.modelRegistry.find(provider, modelId)` and inspecting the returned `Model<Api>` for a strict-capability indicator. `pi-coding-agent ^0.72.1`'s `Model<Api>` exposes no per-model strict-capability field, so under the V1 dependency anchor (^0.72.1) the check is universally degraded to best-effort: every resolved binder model emits one `loom/load/binder-model-strict-capability-unknown` (W) diagnostic at load time, the loom registers, and runtime envelope-malformed failures surface as `loom/runtime/binder-malformed-envelope` per V16o. `loom/load/binder-model-not-strict-capable` (E) is reserved for the case where a future `pi-coding-agent` minor adds a strict-capability indicator and the resolved model is explicitly flagged as not strict-capable; it does not fire under ^0.72.1. A pi-coding-agent minor bump that adds the indicator must be re-validated against this contract before the loom `peerDependencies` range is widened (per [Pi Integration Contract](./pi-integration-contract.md)). Bypass-eligible looms (no-params bypass and single-string bypass; see [Binder bypass](#binder-bypass)) skip both checks — they never call the binder.

Hot-reload of Pi settings (`looms.binderModel` changed at runtime) re-resolves on the next loom load; it does not retroactively fix already-failed loads. When the change would have allowed a previously-failed load to succeed, the runtime emits a single consolidated `loom-system-note` listing the affected slash names and prompting the user to run `/reload`.

## Binder context

Configured via `bind_context:` (`none` | `session`; default `none`).

- `none` — the binder sees only the slash text and the loom's frontmatter. Predictable, cheap, deterministic. The right choice when arguments are self-contained (`/code-review TypeScript focusing on error handling, by Ada Lovelace, senior engineer 12y`).
- `session` — prompt-mode-only; the binder additionally receives the last ~20 turns or ~8000 tokens (whichever is smaller) of the caller's session as grounding context. The right choice when the loom relies on conversational anaphora (`/review the spec` resolves "the spec" against what the user was just discussing).

Declaring `bind_context: session` on a subagent-mode loom is `loom/parse/bind-context-session-on-subagent` (warning, not error) — subagent-mode looms invoked from a slash command have no caller-session context to attach.

**Binder-invocation re-entrancy.** The binder-invocation path is **re-entrant per loom turn**: V1 issues exactly one binder call per slash invocation (and `bind_context` is therefore observed at most once per invocation), but the path makes no assumption that `bind_context` is set at most once per loom over the loom's lifetime. The binder's input record (parameter table, raw slash text, optional session-context block) and the resolved binder-model handle are constructed afresh on every binder call, with no cached state that would prevent a second call from observing a different `bind_context` snapshot. The seam is what allows the deferred *automatic context escalation* extension in [Future Considerations](./future-considerations.md) to land additively: a future revision in which a binder call returning `needs_info` triggers an automatic retry with `bind_context: session` attached needs no rework of the binder-invocation path. Open question: whether automatic escalation surfaces a user-visible turn (composing with the deferred binder refinement loop) or stays operator-only is unresolved and tracked alongside the deferral entry.

## Binder bypass

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

The two failure arms produce indistinguishable V1 user-facing behaviour beyond the system-note prefix; the structural distinction exists for the deferred binder refinement loop (cf. [Future Considerations — Binder refinement loop](./future-considerations.md#binder-refinement-loop)), where only `needs_info` reopens for a clarifying turn while `ambiguous` still terminates. The `candidates` field stays in the schema (binder may emit it; AJV accepts `null`), but the runtime MUST NOT surface it in V1 — the `ambiguous` system note text contains only `<message>`. Forward-compatible without the cost of either collapsing the arms now or rendering candidates the V1 templates do not require.

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

Token counts are computed per message via `estimateTokens(message)` exported from `@mariozechner/pi-coding-agent` (a conservative `Math.ceil(chars / 4)` estimate over text, thinking, tool-call argument JSON, and tool-result text). A turn's token count is the sum of `estimateTokens` over its constituent messages (user / assistant / toolResult / custom). The message list is sourced from `ctx.sessionManager.buildSessionContext().messages`; a turn is a user message plus all subsequent assistant / toolResult / custom messages up to (but not including) the next user message. The runtime walks turns newest-to-oldest and stops including a turn the moment the running token sum would exceed 8000 *or* the running turn count would exceed 20 — whichever bound is reached first. The over-budget turn is excluded entirely (whole-turn truncation; partial messages are not split), as is everything older. The included context is rendered as a compact transcript and embedded in the binder's system prompt below the parameter table.

*Worked example.* With per-turn token counts (newest first) `[1200, 900, 1500, 2000, 2800, …]` and the 8000-token budget, the walk includes the first four turns (running total 5600), then evaluates the fifth: 5600 + 2800 = 8400 > 8000, so the fifth turn and everything older is dropped. Final included context: 4 turns, 5600 tokens. *Single oversized turn at the front.* If the newest turn alone exceeds 8000 tokens, the walk includes nothing and the binder runs with no session-context block (no special-case; the same exclusive rule applies on the first turn evaluated).

`estimateTokens` is intentionally conservative — it overestimates — which biases the included transcript to stay within the budget the binder model will actually see. The estimator is provider-agnostic and matches what Pi uses for its own compaction decisions, so binder truncation behaviour stays consistent with the rest of Pi as model tokenizers evolve. `ctx.getContextUsage()` is **not** used here — that API reports aggregate session usage, not per-turn counts, and stays reserved for its actual purpose (compaction triggers, footer rendering).

### Binder system prompt

The runtime constructs a system prompt that conveys the following information to the binder model. The exact wording is not part of the contract; the *information content* below is normative.

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
- String values quoted only when they contain whitespace or special characters.
- Array values: arrays of **3 or fewer** elements are shown in full as `[a, b, c]` in element order; arrays of **4 or more** elements are shown as `[a, b, c, …+N more]` where the rendered prefix is the first three elements in order and `N` is the count of dropped elements (i.e. `total − 3`). An empty array renders as `[]`. Per-element rendering follows the same rules recursively (a string element is quoted by the same predicate as a top-level string value; a nested object element renders as `{first-field-value, …}`).
- Object values shown as `{first-field-value, …}` — just the first field's value as a hint.
- Defaulted fields tagged `(default)`: `focus_areas=[] (default)`.
- Total line subject to the shared 120-code-point cap defined in [System-note rendering](#system-note-rendering) above, measured over the whole line including the `Running \`/<name>\`: ` prefix; overflow truncated with `…`. The line-level cap wins over the array rule's own `…+N more` marker — if truncation falls inside an array, the inner `…+N more` may be cut.

Setting `bind_echo: false` suppresses the echo. The bypass case (single-string param) auto-suppresses echo regardless of the frontmatter setting (there is nothing to misbind); declaring `bind_echo: true` on a bypass-eligible loom is `loom/parse/bind-echo-on-bypass` (warning).

The echo channel is also used for the binder's `needs_info` and `ambiguous` outputs, which *replace* execution rather than precede it (both shaped by [System-note rendering](#system-note-rendering)):

> loom `/code-review`: argument binding needs more info — missing required field `language`. Specify the language being reviewed.

> loom `/code-review`: ambiguous arguments — "focusing on Ada" could mean focus_areas or author. Be more explicit.

## Determinism

Binder calls use `temperature: 0`. A fixed seed is included in the request payload only for providers in the **seed-supporting set**: `openai-completions` (request field `seed`) and `mistral` (request field `random_seed`). The seed value is the 32-bit FNV-1a hash (offset basis `0x811c9dc5`, prime `0x01000193`) of the loom's qualified name as it appears in the slash registry (the bare command name, without the leading `/`), masked to 32-bit unsigned for both `seed` and `random_seed`. The same loom therefore produces the same seed on every binder call across processes and runs; two different looms produce different seed values with overwhelming probability. For `anthropic-messages` and `amazon-bedrock` the seed field is omitted entirely from the request payload (not sent and silently ignored). The per-provider mapping is a static runtime table keyed on the resolved binder model's `api` field as reported by `@mariozechner/pi-ai`'s model registry; it is not derived from any pi-ai capability flag. Widening the seed-supporting set is a spec-versioned change.

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

Transport failures and malformed-envelope failures each get exactly one retry; the second failure of that class surfaces as the system note above. AJV validation failures on `args` are not retried — a binder that returned a structurally valid envelope whose `args` violate the params schema is hallucinating field shapes, and a re-prompt with the same system prompt would not change the outcome. Coercion-style follow-ups (the mechanism typed queries use for response-schema repair) do not apply to any binder failure; the frontmatter `coercion.attempts` / `coercion.methodology` knobs apply only to typed queries from loom code, and the binder uses fixed retry counts and does not consult them.

Each retry-eligible failure class has a single retry budget **per slash invocation**: at most one transport-failure retry and at most one malformed-envelope retry, regardless of how the two interleave. A transport failure observed on the retry of a malformed envelope consumes the transport budget (not a second malformed attempt); a malformed envelope observed on the retry of a transport failure symmetrically consumes the malformed budget. Once a class's budget is consumed it is not replenished, even if the failure first appears as the consequence of another class's retry. Therefore the runtime MUST issue at most **3** binder LLM calls per slash invocation (1 initial attempt + at most 1 transport-class retry + at most 1 malformed-envelope-class retry). When the chain ends with both budgets exhausted, the surfaced system note is the row matching the **most recent** failure observed (e.g. a chain ending in a malformed envelope renders the malformed-envelope row, even if a transport failure occurred earlier in the chain). AJV validation of `args` is unaffected by the cap — it carries no retry budget of its own and may fire on whichever of the (up to 3) calls returns the first structurally valid envelope.

The malformed-envelope retry must re-issue the binder call against the *same* envelope schema (no schema mutation between attempts) so the failure stays observable as a flake rather than a moving target. An abort observed during any retry permitted by the budget above suppresses that retry and surfaces the cancelled-binder note immediately, irrespective of which class's budget remains. An abort observed *after* the binder returned `ok` but *before* AJV validation runs lets validation complete (AJV is fast and uncancellable per [Cancellation](./cancellation.md)) and surfaces at the next checkpoint inside the loom body, consistent with the no-retroactive-`Ok`-to-`Err` rule.
