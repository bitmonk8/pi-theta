# `V3c-T` — Control flow (tests)

**Spec.** [`../spec_topics/control-flow.md`](../spec_topics/control-flow.md).

**Adds.** Failing tests for the paired `V3c` implementation leaf.

**Tests.**
- `CTRL-1`: the `for` iterand is evaluated exactly once at loop entry; its effect commits once even when the array is empty and the body is skipped; a mid-body `let mut` reassignment does not alter the snapshot.

**Deps.** `V3a`, `V3b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
