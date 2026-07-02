# `V19b` — Loom lexical environment and scope model

**Spec.** [`../spec_topics/expressions.md`](../spec_topics/expressions.md), [`../spec_topics/bindings.md`](../spec_topics/bindings.md), [`../spec_topics/functions.md`](../spec_topics/functions.md), [`../spec_topics/imports.md`](../spec_topics/imports.md), [`../spec_topics/runtime-value-model.md`](../spec_topics/runtime-value-model.md). _(Closed under normative cross-link: `expressions.md` §"Identifier resolution" normatively cites `imports.md` for the import-symbol resolution arm and `runtime-value-model.md` for value/equality semantics; each is a non-narrative page.)_

**Adds.** Introduces the runtime lexical environment and the real `EvalHost` implementation — identifier resolution order (local `let`/parameter > top-level `fn` > import > callable per expressions.md §"Identifier resolution"), immutable vs `let mut` binding slots, per-iteration fresh `for` bindings, `let _` discard, and top-level `fn` hoisting — the scope the `V19c` executor evaluates `V19a`'s body-AST expressions and statements against; it is an integration-realisation of the `V3a`/`V3b`/`V3d` seams at real hosts and closes **no new coverage-matrix row**.

**Tests.**

_(Integration-realisation leaf: every bullet is a `Convention:` bullet — it wires the real host with no REQ-ID of its own and adds no coverage-matrix row; the inline REQ-ID / `cka` citations are integration witnesses of already-closed obligations, not re-closures.)_

- `Convention:` [conventions.md](./conventions.md) §"Per-phase TDD ritual": the real `EvalHost` (realising `V3a`'s `EvalHost` seam — `resolveIdentifier` / `callFunction`) resolves a bare identifier against `V19a`'s body AST in the expressions.md §"Identifier resolution" first-match order — local `let`/parameter > top-level `fn` > import > callable — with a local binding shadowing all outer scopes; integration witness of expressions.md `cka-3`/`cka-4`, not re-closing them.
- `Convention:` [conventions.md](./conventions.md) §"Leaf format": immutable vs `let mut` binding slots — the environment writes a reassignment only against a `mut` slot and rejects a write against an immutable slot at the scope layer; integration witness of bindings.md `cka-6` (`V3b`'s `checkReassignment`), not re-closing it.
- `Convention:` [conventions.md](./conventions.md) §"Per-phase TDD ritual": each `for x in …` iteration binds a fresh `x` slot (per-iteration fresh binding), and `let _` discards its value without creating a resolvable binding, per bindings.md immutable-context / discard rules.
- `Convention:` [conventions.md](./conventions.md) §"Leaf format": top-level `fn` declarations are hoisted so mutual recursion resolves in either textual order (integration witness of functions.md `FN-1`'s "declarations are hoisted within the file"), and the environment carries `fn` bodies for the executor's final-value / `return` evaluation (`FN-3`…`FN-5`); no new coverage-matrix row.

**Deps.** `V19b-T`, `V19a`, `V3a`, `V3b`, `V3d`, `V3f`, `V3g`, `V3h`

**Ships when.** `npm test` exercises the real `EvalHost` resolving identifiers and functions in first-match order and enforcing immutable-vs-`let mut` mutability and per-iteration `for` scoping against `V19a`'s body AST; the leaf adds no coverage-matrix row.
