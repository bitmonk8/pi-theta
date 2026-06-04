# Slash-Command Argument Binding

When a loom is invoked from a slash command, the runtime translates the user's free-form argument string into the loom's typed `params:` via an LLM call — the **binder**. The binder runs once per slash invocation, before any of the loom's own queries. It does not apply to `invoke(...)` calls or to looms invoked as registered tools (both of those pass already-typed values).

The binder is positioned as runtime infrastructure, not as part of the loom's conversation: it never adds turns to the user's session (in prompt mode) or to the loom's spawned conversation (in subagent mode), and the loom code never sees the binder's intermediate envelope. Authors interact with the *result* of binding (their `params` are populated, or the loom doesn't run) the same way they would with any typed `invoke(...)` call.

## Contents

- [Binder model and context](./binder/binder-model-and-context.md)
- [Binder bypass and envelope](./binder/binder-bypass-and-envelope.md)
- [Defaulting system note echo](./binder/defaulting-system-note-echo.md)
- [Determinism cancellation failure](./binder/determinism-cancellation-failure.md)
