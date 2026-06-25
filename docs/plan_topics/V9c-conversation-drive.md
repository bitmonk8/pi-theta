# `V9c` — Prompt-mode conversation drive and active-set gating

**Spec.** [`../spec_topics/pi-integration-contract/conversation-drive.md`](../spec_topics/pi-integration-contract/conversation-drive.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/subagent.md`](../spec_topics/pi-integration-contract/subagent.md#pic-2).

**Adds.** The prompt-mode driver: `sendUserMessage` (void), `waitForIdle`, trailing-turn `Ok(string)` extraction, the `stopReason:"error"` probe, the prompt-mode `pi.on` subscription (cancel-forward only, forwarding Pi's `ctx.signal` into the `loomAbort` controller owned by V17a), and the active-set gating window (snapshot → `setActiveTools` → query → `finally` restore; ambient tools not inherited). Exposes the `stopReason:"error"` probe-result and the trailing-turn `Ok(string)` extraction points as seams consumed by [`V9n`](./V9n-transport-error-mapping.md)'s transport-error mapping.

**Tests.**
- `PIC-2`: within a single user session, no two prompt-mode bodies hold an open active-set gating window (the `pi.setActiveTools` snapshot/restore bracket) simultaneously — a nested prompt→prompt `invoke(...)` opens its window only after the parent body's window is restored (cross-body non-overlap, distinct from a single query's snapshot/restore).
- `PIC-17`: a query snapshots active tools, sets them, and restores in `finally`; ambient tools are not inherited.
- `PIC-18`: the prompt-mode `pi.on` subscription is process-global with no per-session marker and is used only for cancel-forwarding — forwarding into the `loomAbort` controller owned by V17a — never for completion.
- [conversation-drive.md — trailing-turn extraction](../spec_topics/pi-integration-contract/conversation-drive.md#pic-53) (PIC-53): an untyped query resolves to the trailing turn's `Ok(string)`.

**Deps.** `V9c-T`, `V9a`, `V8a`, `V17a`

**Ships when.** `npm test` drives a prompt-mode query end-to-end and asserts the active-set gating window's snapshot/restore behaviour and the trailing-turn `Ok(string)` extraction.
