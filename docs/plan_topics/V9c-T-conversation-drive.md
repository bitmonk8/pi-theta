# `V9c-T` — Prompt-mode conversation drive and active-set gating (tests)

**Spec.** [`../spec_topics/pi-integration-contract/conversation-drive.md`](../spec_topics/pi-integration-contract/conversation-drive.md), [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/subagent.md`](../spec_topics/pi-integration-contract/subagent.md#pic-2).

**Adds.** Failing tests for the paired `V9c` implementation leaf.

**Tests.**
- `PIC-2`: within a single user session, no two prompt-mode bodies hold an open active-set gating window (the `pi.setActiveTools` snapshot/restore bracket) simultaneously — a nested prompt→prompt `invoke(...)` opens its window only after the parent body's window is restored (cross-body non-overlap, distinct from a single query's snapshot/restore).
- `PIC-17`: a query snapshots active tools, sets them, and restores in `finally`; ambient tools are not inherited.
- `PIC-18`: the prompt-mode `pi.on` subscription is process-global with no per-session marker and is used only for cancel-forwarding, never for completion.
- [conversation-drive.md — trailing-turn extraction](../spec_topics/pi-integration-contract/conversation-drive.md#pic-53) (PIC-53): an untyped query resolves to the trailing turn's `Ok(string)`.

**Deps.** `V9a`, `V8a`, `V17a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
