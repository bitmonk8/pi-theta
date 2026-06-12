# `V15d-T` — Prompt→prompt parent-suspend and `setActiveTools` snapshot/restore (tests)

**Spec.** [`../spec_topics/invocation.md`](../spec_topics/invocation.md), [`../spec_topics/pi-integration-contract/tool-registration-lifetime.md`](../spec_topics/pi-integration-contract/tool-registration-lifetime.md#snapshot-restore-pi-behavioural-preconditions).

**Adds.** Failing tests for the paired `V15d` implementation leaf.

**Tests.**
- [invocation.md — cross-mode matrix, prompt→prompt suspend](../spec_topics/invocation.md) (INV area): on the prompt→prompt path the parent is suspended for the duration of the child invocation and the parent's active-tool set is snapshotted before the child runs.
- [tool-registration-lifetime.md — `PIC-17` step-4 `finally` restore](../spec_topics/pi-integration-contract/tool-registration-lifetime.md#pic-17) (PIC area), on the prompt→prompt `invoke` path: after a prompt→prompt child invocation that fails, cancels, or throws inside the suspended-parent window, the parent's active-tool set is observably restored to its pre-invoke snapshot — `pi.getActiveTools()` returns the pre-invoke set once the failed child settles — with the inner failure surfaced and not masked. Cover both the cancel and the throw sub-case, since both transit the same `finally`. This is the restore-on-inner-failure for the `invoke` path; it is distinct from `PIC-8`/`PIC-19` (restore-call/setup-side failure, owned by `V9f`) and `PIC-2` cross-body non-overlap (owned by `V9c`).

**Deps.** `V15a`, `V9f`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
