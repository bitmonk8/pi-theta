# `V3c` — Control flow

**Spec.** [`../spec_topics/control-flow.md`](../spec_topics/control-flow.md).

**Adds.** `if` / `for` / `while` / `break` / `continue`, with the `CTRL-1` once-only iterand snapshot semantics.

**Tests.**
- `CTRL-1`: the `for` iterand is evaluated exactly once at loop entry; its effect commits once even when the array is empty and the body is skipped; a mid-body `let mut` reassignment does not alter the snapshot.

**Deps.** `V3c-T`, `V3a`, `V3b`

**Ships when.** `npm test` proves an effectful empty-array iterand commits exactly once.
