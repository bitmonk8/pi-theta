# Slash-Command Argument Binding

When a theta is invoked from a slash command, the runtime translates the user's free-form argument string into the theta's typed `params:` via an LLM call — the **binder**. The binder runs once per slash invocation, before any of the theta's own queries. It does not apply to `invoke(...)` calls or to thetas invoked as registered tools (both of those pass already-typed values). **Binder inference remains exclusive to human slash invocation.** For a subagent-mode callee under the RFC 0006 child-process theta design, the parent's already-typed param values are marshalled structurally to the child (on `PI_THETA_PARAMS` / `PI_THETA_PARAMS_FILE` as canonical JSON per the callee's `params:` schema) and the child validates the received JSON against the **same schema**; the binder is **skipped entirely** on that path and is **not** re-entered by routing params through the child's `-p "/<slug>"` slash string. See [Pi Integration Contract — Marshalled-params channel (PIC-60)](./pi-integration-contract/subagent.md#pic-60).

The binder is positioned as runtime infrastructure, not as part of the theta's conversation: it never adds turns to the user's session (in prompt mode) or to the theta's spawned conversation (in subagent mode), and the theta code never sees the binder's intermediate envelope. Authors interact with the *result* of binding (their `params` are populated, or the theta doesn't run) the same way they would with any typed `invoke(...)` call.

## Contents

- [Binder model and context](./binder/binder-model-and-context.md)
- [Binder bypass and envelope](./binder/binder-bypass-and-envelope.md)
- [Defaulting system note echo](./binder/defaulting-system-note-echo.md)
- [Determinism cancellation failure](./binder/determinism-cancellation-failure.md)
