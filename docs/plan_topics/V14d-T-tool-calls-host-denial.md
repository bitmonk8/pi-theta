# `V14d-T` — Code-tool host-denial surface (tests)

**Spec.** [`../spec_topics/pi-integration-contract/trust-boundary.md`](../spec_topics/pi-integration-contract/trust-boundary.md#no-extra-mediation) (the denial-surface MUST under *No additional access channels*).

**Adds.** Failing tests for the paired `V14d` implementation leaf.

**Tests.**
- [trust-boundary.md — No additional access channels (PIC-52)](../spec_topics/pi-integration-contract/trust-boundary.md#pic-52): a host-side denial (thrown or `isError: true` tool return) reaches loom code as `Err(QueryError{kind:"code_tool", cause:"execution"})` and never resolves as a silent `Ok` (silent success on denial is forbidden).

**Deps.** `V14a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
