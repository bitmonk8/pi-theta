# `V11b` — Bind context and transcript renderer

**Spec.** [`../spec_topics/binder/binder-model-and-context.md`](../spec_topics/binder/binder-model-and-context.md), [`../spec_topics/binder/binder-bypass-and-envelope.md`](../spec_topics/binder/binder-bypass-and-envelope.md).

**Adds.** The `bind_context` (`none`|`session`) field with its parse-time `loom/parse/bind-context-session-on-subagent` rejection on subagent-mode looms, and the compact-transcript renderer feeding the binder's session-context block. The runtime session-context truncation walk that selects which turns the renderer is handed is owned by [`V11i`](./V11i-session-context-truncation.md).

**Tests.**
- `BNDR-7`: the compact-transcript renderings (7a–7i) reproduce byte-exact, including the void-truncation whole-block omission (7i).
- `BNDR-8`: the assistant body emits the `[assistant]:` line first, then `[tool-call …]` in array order, with args JSON keys in ascending Unicode and array order verbatim.
- `BNDR-9`: a non-transcript-safe `customType` (containing any of `\n`, `\r`, `]`, or the two-byte sequence `: ` (U+003A U+0020)) fires `loom/runtime/custom-type-unsafe`.
- `loom/parse/bind-context-session-on-subagent`: fires for `bind_context: session` on a `mode: subagent` loom.

**Deps.** `V11b-T`, `V11a`, `V9i`

**Ships when.** `npm test` reproduces the 7a–7i and BNDR-8 renderings byte-exact, fires `custom-type-unsafe`, and fires `loom/parse/bind-context-session-on-subagent` for `bind_context: session` on a subagent loom.
