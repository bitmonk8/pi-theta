# `V11b-T` — Bind context, truncation, and transcript renderer (tests)

**Spec.** [`../spec_topics/binder/binder-model-and-context.md`](../spec_topics/binder/binder-model-and-context.md), [`../spec_topics/binder/binder-bypass-and-envelope.md`](../spec_topics/binder/binder-bypass-and-envelope.md).

**Adds.** Failing tests for the paired `V11b` implementation leaf.

**Tests.**
- `BNDR-7`: the compact-transcript renderings (7a–7i) reproduce byte-exact, including the void-truncation whole-block omission (7i).
- `BNDR-8`: the assistant body emits the `[assistant]:` line first, then `[tool-call …]` in array order, with args JSON keys in ascending Unicode and array order verbatim.
- `BNDR-9`: a non-transcript-safe `customType` (containing `\n`/`\r`/`]`/`: `) fires `loom/runtime/custom-type-unsafe`.
- `bind-context-session-on-subagent` (W) fires for `bind_context: session` on a subagent loom.

**Deps.** `V11a`, `V9i`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
