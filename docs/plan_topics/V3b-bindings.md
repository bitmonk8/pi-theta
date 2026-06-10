# `V3b` — Bindings and mutability

**Spec.** [`../spec_topics/bindings.md`](../spec_topics/bindings.md).

**Adds.** `let` (immutable) and `let mut` bindings with mandatory initialisers, statement-only reassignment (including `+=`), binding-level-only mutation (no member/index assignment), and the immutable-context set (params, `for` var, match binds, `_`).

**Tests.**
- A reassignment of a `let` binding fires the parse-phase rebind diagnostic.
- Member/index assignment and reassignment in an immutable context fire their parse codes.
- `++`/`--` are rejected.
- A `let` without an initialiser fires `let-without-initialiser`.

**Deps.** `V3b-T`, `V2b`, `V3a`

**Ships when.** `npm test` fires each binding/mutability code and accepts a valid `let mut` reassignment.
