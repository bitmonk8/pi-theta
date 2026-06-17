# `V9n-T` — Prompt-mode transport-error mapping (tests)

**Spec.** [`../spec_topics/pi-integration-contract/conversation-drive.md`](../spec_topics/pi-integration-contract/conversation-drive.md#prompt-mode-error-detection).

**Adds.** Failing tests for the paired `V9n` implementation leaf.

**Tests.**
- [conversation-drive.md — error detection](../spec_topics/pi-integration-contract/conversation-drive.md#prompt-mode-error-detection) (PIC area): after `waitForIdle()` resolves, a driven turn whose trailing `assistant` message carries `stopReason: "error"` maps to `Err(QueryError { kind: "transport", message: <errorMessage>, http_status: null, provider: <resolved-model-provider>, retryable: false })` — the `provider` value sourced from the loom's resolved `model:` `Model<Api>.api` value (the frontmatter `model:`, or the inherited `ctx.model` when `model:` is absent; resolution owned by V6a), per conversation-drive.md's resolved-`model:` rule and queryerror-variants.md's `TransportError.provider` derivation.
- [conversation-drive.md — error detection](../spec_topics/pi-integration-contract/conversation-drive.md#prompt-mode-error-detection) (PIC area): when that `stopReason: "error"` turn's `errorMessage` is absent, the synthesised `transport` error's `message` is the fixed string `"provider transport failure"`.
- [conversation-drive.md — error detection](../spec_topics/pi-integration-contract/conversation-drive.md#prompt-mode-error-detection) (PIC area): a synchronous throw from `pi.sendUserMessage` (the secondary mapping) maps to `Err(QueryError { kind: "transport", message: <error.message>, ... })`, not to `loom/runtime/internal-error`.
- [conversation-drive.md — error detection](../spec_topics/pi-integration-contract/conversation-drive.md#prompt-mode-error-detection) (PIC area): when `loomAbort.signal.aborted` is true the cancellation short-circuit synthesises `Err(QueryError { kind: "cancelled" })` and takes precedence over both the `stopReason: "error"` probe and the `Ok(string)` extraction — even when `waitForIdle()` resolved cleanly with no error written to session state.

**Deps.** `V9c`, `V9j`, `V17a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
