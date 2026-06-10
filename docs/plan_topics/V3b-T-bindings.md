# `V3b-T` — Bindings and mutability (tests)

**Spec.** [`../spec_topics/bindings.md`](../spec_topics/bindings.md).

**Adds.** Failing tests for the paired `V3b` implementation leaf.

**Tests.**
- A reassignment of a `let` binding fires the parse-phase rebind diagnostic.
- Member/index assignment and reassignment in an immutable context fire their parse codes.
- `++`/`--` are rejected.
- A `let` without an initialiser fires `let-without-initialiser`.

**Deps.** `V2b`, `V3a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
