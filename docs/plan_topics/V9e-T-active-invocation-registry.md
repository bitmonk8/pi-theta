# `V9e-T` — `ActiveInvocationRegistry` (tests)

**Spec.** [`../spec_topics/pi-integration-contract/active-invocation-registry.md`](../spec_topics/pi-integration-contract/active-invocation-registry.md).

**Adds.** Failing tests for the paired `V9e` implementation leaf.

**Tests.**
- [active-invocation-registry.md — insertion-order iteration](../spec_topics/pi-integration-contract/active-invocation-registry.md) (PIC area): a registered invocation is iterated in insertion order; teardown reaches every in-flight entry.
- [active-invocation-registry.md — `disposeBarrier`](../spec_topics/pi-integration-contract/active-invocation-registry.md) (PIC area): the `disposeBarrier` blocks until all entries are disposed.
- [active-invocation-registry.md — `invocationId` allocation](../spec_topics/pi-integration-contract/active-invocation-registry.md) (PIC area): `invocationId` is sourced only from `IdSource.newInvocationId()`.

**Deps.** `V9b`, `V8b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
