# `V14d` — Code-tool host-denial surface

**Spec.** [`../spec_topics/pi-integration-contract/trust-boundary.md`](../spec_topics/pi-integration-contract/trust-boundary.md#no-extra-mediation) (the denial-surface MUST under *No additional access channels*).

**Adds.** The host-side denial surface — a thrown or `isError: true` host-side tool return reaching loom code as `Err(QueryError{kind:"code_tool", cause:"execution"})`, never resolving as a silent `Ok`, building on the [`V14a`](./V14a-tool-calls.md) code-side tool-call surface.

**Tests.**
- [trust-boundary.md — No additional access channels (PIC-52)](../spec_topics/pi-integration-contract/trust-boundary.md#pic-52): a host-side denial (thrown or `isError: true` tool return) reaches loom code as `Err(QueryError{kind:"code_tool", cause:"execution"})` and never resolves as a silent `Ok` (silent success on denial is forbidden).

**Deps.** `V14d-T`, `V14a`

**Ships when.** `npm test` asserts a host-side denial (thrown or `isError: true` tool return) reaches loom code as `Err(QueryError{kind:"code_tool", cause:"execution"})` and never resolves as a silent `Ok`.
