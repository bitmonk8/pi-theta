# V9 — Function definitions

## V9a — Top-level `fn` declaration

- **Spec.** [Function Definitions](../spec_topics/functions.md), [Grammar Appendix — `///` placement](../spec_topics/grammar.md#-placement).
- **Adds.** `fn name(p: T, ...): R { body }`; nested `fn` is a parse error. `fn` accepts a leading `///` doc comment as a documented anchor; the description is preserved on the AST as human-facing documentation only and does not lower into JSON Schema (functions have no schema).
- **Tests.** Parse and call; nested `fn` rejected; closure / first-class function value rejected; `///` above a `fn` parses and the description is reachable on the resulting AST node; `///` inline with the `fn` declaration line is `loom/parse/doc-comment-misplaced`; calling `fn f(p: integer)` with a `number`-typed argument emits `loom/parse/integer-narrowing`; `fn f(p: number)` accepting an `integer`-typed argument widens silently.
- **Deps.** V2a–V2i, V1c.
- **Ships when.** Functions can be declared and called, with `///` documentation supported on the declaration.

## V9b — Hoisting and mutual recursion

- **Spec.** [Function Definitions](../spec_topics/functions.md) (placement).
- **Adds.** `fn` declarations hoisted within file; mutual recursion permitted.
- **Tests.** Forward call resolves; mutual `fn a(){b()}; fn b(){a()}` parses; recursion terminates via control flow.
- **Deps.** V9a.
- **Ships when.** Function order in file is irrelevant.

## V9c — Tail-expression return

- **Spec.** [Function Definitions](../spec_topics/functions.md).
- **Adds.** Function value is the value of its tail expression (no `return` needed).
- **Tests.** Tail-expression matches declared return type; mismatched tail-expression type is parse error.
- **Deps.** V9a.
- **Ships when.** Rust-style returns work.

## V9d — `?` requires `Result<_, QueryError>` return type

- **Spec.** [Function Definitions](../spec_topics/functions.md).
- **Adds.** A function body containing `?` and no explicit return type infers `Result<_, QueryError>` where `_` is the type of the tail expression's `Ok` payload. If an explicit return type *is* declared, it must syntactically be `Result<T, QueryError>` for some `T`; any other shape — `Result<T, E>` with `E ≠ QueryError`, a non-`Result` named type, or `void` — emits `loom/parse/question-outside-result-fn` quoting the offending declared return type.
- **Tests.** Body with `?` and no return type infers `Result<T, QueryError>` from the tail-expression `Ok` payload type; explicit `Result<T, QueryError>` is accepted; explicit `Result<T, MyError>` (custom `E`), explicit non-`Result` type (e.g. `string`, `Author`), and explicit `void` each emit `loom/parse/question-outside-result-fn` with the declared return type rendered verbatim in the message.
- **Deps.** V9a, V6b.
- **Ships when.** `?` propagation through functions works.

## V9e — `void` return type

- **Spec.** [Function Definitions](../spec_topics/functions.md).
- **Adds.** `void` declared explicitly; tail-expression value discarded silently; bare `return` legal only here.
- **Tests.** `void` discards; bare `return` accepted; tail-expression evaluated for side effects but not returned.
- **Deps.** V9a, V8f.
- **Ships when.** Side-effect-only functions parse.

## V9f — Identifier resolution order

- **Spec.** [Expression Sublanguage](../spec_topics/expressions.md) (identifier resolution).
- **Adds.** Resolution order: (1) local binding/param, (2) top-level `fn` in same file, (3) imported symbol (V17), (4) `tools:` entry (V14). Collisions across (2)–(4) are load errors. Local shadows everything else.
- **Tests.** Each ordering rule; collision diagnostics name both sites; local shadowing works lexically.
- **Deps.** V9a.
- **Ships when.** Naming rules are uniform.
