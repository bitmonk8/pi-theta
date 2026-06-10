# `V9e` — `ActiveInvocationRegistry`

**Spec.** [`../spec_topics/pi-integration-contract/active-invocation-registry.md`](../spec_topics/pi-integration-contract/active-invocation-registry.md).

**Adds.** The extension-scoped registry of in-flight invocations: the five-field entry, the canonical-name resolver (three insertion sites), the setup wrap, the `disposeBarrier`, insertion-order iteration, and `invocationId` allocation via `IdSource`.

**Tests.**
- [active-invocation-registry.md — insertion-order iteration](../spec_topics/pi-integration-contract/active-invocation-registry.md) (PIC area): a registered invocation is iterated in insertion order; teardown reaches every in-flight entry.
- [active-invocation-registry.md — `disposeBarrier`](../spec_topics/pi-integration-contract/active-invocation-registry.md) (PIC area): the `disposeBarrier` blocks until all entries are disposed.
- [active-invocation-registry.md — `invocationId` allocation](../spec_topics/pi-integration-contract/active-invocation-registry.md) (PIC area): `invocationId` is sourced only from `IdSource.newInvocationId()`.

**Deps.** `V9e-T`, `V9b`, `V8b`

**Ships when.** `npm test` proves teardown reaches every in-flight invocation in insertion order via the barrier.
