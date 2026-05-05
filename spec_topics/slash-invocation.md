# Invocation from Pi

A loom is invoked as a slash command using its filename, exactly like a Pi prompt template:

```
/code-review TypeScript focusing on error handling and async, by Ada Lovelace, senior engineer 12y
```

The runtime extracts typed `params:` values from the user's free-form slash arguments via an LLM-driven binder. The full mechanism is described in [Slash-Command Argument Binding](./binder.md); the short version is that the binder model (resolved from `bind_model:` or the `looms.binderModel` setting at load time) is given the loom's `params:` schema and the raw slash text and asked to return a structured envelope (`ok`, `needs_info`, or `ambiguous`). Successful binding feeds AJV-validated params into the loom; unsuccessful binding surfaces a one-line system note in the user's session and the loom does not run.

On successful binding the runtime appends a one-line echo system note to the session before the loom starts, summarising the bound arguments. The echo is on by default, suppressed by `bind_echo: false`, and auto-suppressed for the single-string-param bypass case (where `bind_echo: true` is a parse warning). See [Slash-Command Argument Binding](./binder.md) for the formatting rules and the bypass condition.

The `argument-hint` frontmatter field is passed to the binder as additional grounding for argument extraction — it appears in the binder's system prompt under `Argument hint:` and helps the model interpret the user's free-form text. It is **not** displayed in Pi's slash-command autocomplete UI: Pi's `RegisteredCommand` interface (the API the loom extension uses to register slash commands) has no `argumentHint` field, and the autocomplete dropdown shows only the registered `description`. Authors who want hint-like text visible in the dropdown must include it in `description:`. The extension-API gap is listed in [Future Considerations](./future-considerations.md). Key=value or named-argument syntax (e.g. `/code-review language=TypeScript`) is *not* part of the V1 surface; users type free-form text and the binder does the work.

**No-params overflow.** When the loom takes no parameters (`params:` absent or `params: {}`; see [Parameters and Frontmatter](./frontmatter.md)) the binder is bypassed (see [Slash-Command Argument Binding — Binder bypass](./binder.md)). The runtime trims the slash text after the command name; if the trimmed remainder is non-empty, the runtime emits a single `customType: "loom-system-note"` message before the loom starts, formatted as `loom /<name>: ignoring extra arguments — this loom takes no parameters`, then runs the loom. Whitespace-only remainders trim to empty and emit no note. The note is informational and never blocks execution. The note fires only for the slash-invocation path; `invoke(...)` and registered-tool callers skip the slash parser entirely and have no notion of "extra text."

Once a loom is invoked:

- In **prompt mode**, the loom drives the *current* conversation — every query is a turn the user sees in their session. The loom's final `Ok` return value is **not** surfaced to the user; the conversation is the user-facing surface, and any value the author wants the user to see should be issued as a final query whose text contains it. The return value exists only for programmatic consumers (an `invoke` caller, a future loom harness).
- In **subagent mode**, a fresh isolated conversation is spawned for the loom — with the system prompt set from frontmatter `system:` if present. Every query is a turn in that private conversation. When the loom finishes, only its return value reaches the caller; the intermediate transcript stays inside the subagent.

**Top-level `Err` in prompt mode.** When a prompt-mode loom returns `Err(QueryError)` to its caller (the user's session), Pi appends a one-line system note to the session formatted from the error. The note never dumps the full `QueryError` JSON — it summarises the failure category and the most-relevant detail.

**The shapes below are normative templates.** Renderers MUST emit the surrounding template text verbatim; only the `<…>` placeholders are interpolated. Wording changes are spec-versioned breaking changes. Conformance tests MAY assert on the exact rendered string. Where a placeholder carries free-form content sourced from a model (e.g. `<message>` on rows whose underlying error message originated outside the runtime), only the surrounding template is normative — the interpolated content itself is non-deterministic.

Per-`kind` formatting:

| `QueryError.kind` | System note shape |
|---|---|
| `validation` | "loom `/<name>` returned `Err`: model failed schema after `<n>` coercion attempts" |
| `transport` | "loom `/<name>` returned `Err`: transport — `<message>`" |
| `model_tool` | "loom `/<name>` returned `Err`: tool `<tool_name>` failed — `<message>`" |
| `context_overflow` | "loom `/<name>` returned `Err`: context window exceeded" |
| `cancelled` | "loom `/<name>` cancelled" |
| `code_tool` | "loom `/<name>` returned `Err`: tool `<tool_name>` call failed (`<cause>`) — `<message>`" |
| `tool_loop_exhausted` | "loom `/<name>` returned `Err`: tool-call loop exhausted after `<iterations>` iterations (last tool: `<last_tool_name>`)" |
| `invoke_failure` | "loom `/<name>` returned `Err`: invoke of `<callee_path>` failed (`<reason>`)" |
| `invoke_callee_error` | "loom `/<name>` returned `Err`: invoked `<callee_path>` returned `Err` — `<inner.kind>`" |
| _any unlisted `kind`_ (catch-all) | "loom `/<name>` returned `Err`: `<kind>` — `<message>`" |

The table is exhaustive over the V1 `QueryError` union (nine variants, listed in [Query — Failure modes](./query.md)); the catch-all row makes the renderer's contract total against any future variant added to the union, so a renderer never has "no defined output" for a well-formed `QueryError`. New variants SHOULD ship with a dedicated row in the same edit; the catch-all is a normative fallback, not an excuse to skip the per-kind row. For `tool_loop_exhausted`, `<last_tool_name>` is rendered as the literal string `respond` when `last_tool_name` is `null` (the exhaustion fired on the forced respond turn of a typed query). For `invoke_callee_error` the chain-attribution suffix described in the next paragraph handles the deeper `inner` recursion — the row above only formats the immediate failure, and the chain suffix recurses into `inner` so the leaf `kind` (not the wrapper) drives the descriptive text. The chain suffix applies to every row, including the catch-all, whenever the failure cascaded from an invoked child.

The session is not aborted; the user can type a follow-up turn. When the leaf failure originated inside an `invoke`d child loom that cascaded out via `?`, the note identifies the leaf and prints the call chain (`"... from child.loom invoked at parent.loom:42"`).

The note is emitted as a custom-typed Pi message (`pi.sendMessage({ customType: "loom-system-note", content, display: true, details: { event: { ... } } }, { triggerTurn: false })`) so it persists in the session transcript and survives `/tree` navigation; a registered message renderer formats it as a one-line dim entry. The `details.event` payload is the operator-facing runtime-event record described in [Pi Integration Contract — Runtime event channel](./pi-integration-contract.md), and is populated for every row above; renderers consume `content` for display and ignore `details`, while log scrapers and replay tools consume `details.event` for structured access. See [Pi Integration Contract](./pi-integration-contract.md) for the full mechanism.
