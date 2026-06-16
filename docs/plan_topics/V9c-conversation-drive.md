# `V9c` — Prompt-mode conversation drive and active-set gating

**Spec.** [`../spec_topics/pi-integration-contract/conversation-drive.md`](../spec_topics/pi-integration-contract/conversation-drive.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/subagent.md`](../spec_topics/pi-integration-contract/subagent.md#pic-2).

**Adds.** The prompt-mode driver: `sendUserMessage` (void), `waitForIdle`, trailing-turn `Ok(string)` extraction, the `stopReason:"error"` probe, the prompt-mode `pi.on` subscription (cancel-forward only, forwarding Pi's `ctx.signal` into the `loomAbort` controller owned by V17a), and the active-set gating window (snapshot → `setActiveTools` → query → `finally` restore; ambient tools not inherited).

**Tests.**
- `PIC-2`: within a single user session, no two prompt-mode bodies hold an open `pi.setActiveTools` snapshot/restore window simultaneously — a nested prompt→prompt `invoke(...)` opens its window only after the parent body's window is restored (cross-body non-overlap, distinct from a single query's snapshot/restore).
- `PIC-17`: a query snapshots active tools, sets them, and restores in `finally`; ambient tools are not inherited.
- `PIC-18`: the prompt-mode `pi.on` subscription is process-global with no per-session marker and is used only for cancel-forwarding — forwarding into the `loomAbort` controller owned by V17a — never for completion.
- [conversation-drive.md — trailing-turn extraction](../spec_topics/pi-integration-contract/conversation-drive.md) (PIC area): an untyped query resolves to the trailing turn's `Ok(string)`.
- [conversation-drive.md — error detection](../spec_topics/pi-integration-contract/conversation-drive.md#prompt-mode-error-detection) (PIC area): after `waitForIdle()` resolves, a driven turn whose trailing `assistant` message carries `stopReason: "error"` maps to `Err(QueryError { kind: "transport", message: <errorMessage>, http_status: null, provider: <resolved-model-provider>, retryable: false })` — the `provider` value sourced from V9j's provider-error-mapping surface.
- [conversation-drive.md — error detection](../spec_topics/pi-integration-contract/conversation-drive.md#prompt-mode-error-detection) (PIC area): when that `stopReason: "error"` turn's `errorMessage` is absent, the synthesised `transport` error's `message` is the fixed string `"provider transport failure"`.
- [conversation-drive.md — error detection](../spec_topics/pi-integration-contract/conversation-drive.md#prompt-mode-error-detection) (PIC area): a synchronous throw from `pi.sendUserMessage` (the secondary mapping) maps to `Err(QueryError { kind: "transport", message: <error.message>, ... })`, not to `loom/runtime/internal-error`.
- [conversation-drive.md — error detection](../spec_topics/pi-integration-contract/conversation-drive.md#prompt-mode-error-detection) (PIC area): when `loomAbort.signal.aborted` is true the cancellation short-circuit synthesises `Err(QueryError { kind: "cancelled" })` and takes precedence over both the `stopReason: "error"` probe and the `Ok(string)` extraction — even when `waitForIdle()` resolved cleanly with no error written to session state.

**Deps.** `V9c-T`, `V9a`, `V9j`, `V8a`, `V17a`

**Ships when.** `npm test` drives a prompt-mode query end-to-end and asserts the active-set snapshot/restore, and drives a `stopReason: "error"` turn and observes the synthesised `kind: "transport"` `QueryError`.
