# `V9c-T` — Prompt-mode conversation drive and active-set gating (tests)

**Spec.** [`../spec_topics/pi-integration-contract/conversation-drive.md`](../spec_topics/pi-integration-contract/conversation-drive.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md).

**Adds.** Failing tests for the paired `V9c` implementation leaf.

**Tests.**
- `PIC-17`: a query snapshots active tools, sets them, and restores in `finally`; ambient tools are not inherited.
- `PIC-18`: the prompt-mode `pi.on` subscription is process-global with no per-session marker and is used only for cancel-forwarding, never for completion.
- [conversation-drive.md — trailing-turn extraction](../spec_topics/pi-integration-contract/conversation-drive.md) (PIC area): an untyped query resolves to the trailing turn's `Ok(string)`.

**Deps.** `V9a`, `V9j`, `V8a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
