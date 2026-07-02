# `V19b-T` — Loom lexical environment and scope model (tests)

**Spec.** [`../spec_topics/expressions.md`](../spec_topics/expressions.md), [`../spec_topics/bindings.md`](../spec_topics/bindings.md), [`../spec_topics/functions.md`](../spec_topics/functions.md), [`../spec_topics/imports.md`](../spec_topics/imports.md), [`../spec_topics/runtime-value-model.md`](../spec_topics/runtime-value-model.md). _(Closed under normative cross-link: `expressions.md` §"Identifier resolution" normatively cites `imports.md` for the import-symbol resolution arm and `runtime-value-model.md` for value/equality semantics; each is a non-narrative page.)_

**Adds.** Failing tests for the paired `V19b` lexical environment: they declare (or inertly stub) the real `EvalHost` / environment seam so the suite compiles, then red on the identifier-resolution, mutability, `for`-scoping, and `fn`-hoisting assertions the implementation must satisfy. Integration-realisation leaf — adds **no new coverage-matrix row**.

**Tests.**

_(Every bullet is a `Convention:` bullet — the leaf wires the real host with no REQ-ID of its own and adds no coverage-matrix row; the inline REQ-ID / `cka` citations are integration witnesses of already-closed obligations.)_

- `Convention:` [conventions.md](./conventions.md) §"Per-phase TDD ritual": a failing test that the real `EvalHost` (realising `V3a`'s `EvalHost` seam — `resolveIdentifier` / `callFunction`) resolves a bare identifier against `V19a`'s body AST in the expressions.md §"Identifier resolution" first-match order — local `let`/parameter > top-level `fn` > import > callable, local shadowing all outer scopes — reds because no real environment resolves names yet; integration witness of expressions.md `cka-3`/`cka-4`.
- `Convention:` [conventions.md](./conventions.md) §"Leaf format": a failing test that the environment writes a reassignment only against a `let mut` slot and rejects a write against an immutable `let` slot at the scope layer; integration witness of bindings.md `cka-6` (`V3b`'s `checkReassignment`).
- `Convention:` [conventions.md](./conventions.md) §"Per-phase TDD ritual": a failing test that each `for x in …` iteration binds a fresh `x` slot (per-iteration fresh binding) and that `let _` discards its value without creating a resolvable binding.
- `Convention:` [conventions.md](./conventions.md) §"Leaf format": a failing test that top-level `fn` declarations are hoisted so mutual recursion resolves in either textual order (integration witness of functions.md `FN-1`'s "declarations are hoisted within the file") and that `fn` bodies are carried for final-value / `return` evaluation (`FN-3`…`FN-5`).

**Deps.** `V19a`, `V3a`, `V3b`, `V3d`, `V3f`, `V3g`, `V3h`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
