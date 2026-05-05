# V7 — `match` and pattern grammar

## V7a — `match` expression structure

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (`match` expression, arm syntax), [Grammar Appendix — `match` arm body](../spec_topics/grammar.md#match-arm-body), [Expressions — Array construction](../spec_topics/expressions.md#array-construction) (common-type rules shared with array literals and ternary branches), [Diagnostics](../spec_topics/diagnostics.md) (`loom/parse/match-arm-type-mismatch`).
- **Adds.** `match scrutinee { pat => expr, ... }` as an expression; comma-separated arms; trailing comma optional; the static type of the match expression is the common type of all arm-body types, computed by the same rules as `let` initialisation and array-literal element typing (see [Expressions — Array construction](../spec_topics/expressions.md#array-construction)); arms whose bodies do not satisfy that relation emit `loom/parse/match-arm-type-mismatch`. An arm body is a single expression — a block expression `{ Stmt* Expr }` is the explicit escape hatch for multi-statement arms; the ternary `cond ? a : b` is the expression form of conditional. Bare statements (`if`, `for`, `while`, `let`, assignment, `break`, `continue`, `return`) in arm-body position are `loom/parse/statement-in-arm-body`.
- **Tests.** Match returns last-matched arm's value; mixed-type arms (`["a", 1]` shape — incompatible primitives, no surrounding sink) emit `loom/parse/match-arm-type-mismatch`; `integer`/`number` arms unify to `number`; two distinct named schemas without a union sink emit `loom/parse/match-arm-type-mismatch` quoting both schema names; arm body accepts a single expression; arm body accepts a block expression and yields its tail value; bare `if` in arm body emits `loom/parse/statement-in-arm-body` and the diagnostic message names the offending construct; same for bare `for`, `while`, `let`, assignment, `break`, `continue`, `return`; ternary in arm body accepted.
- **Deps.** V2a–V2i.
- **Ships when.** `match` parses and runs against simple scrutinees, with statement-in-arm-body diagnostic in place.

## V7b — Wildcard pattern `_`

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (pattern grammar).
- **Adds.** `_` matches anything, binds nothing.
- **Tests.** Always matches; cannot reference `_` after binding.
- **Deps.** V7a.
- **Ships when.** Catch-all arms work.

## V7c — Identifier pattern (binding)

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (pattern grammar).
- **Adds.** Lowercase identifier matches anything and binds to scrutinee.
- **Tests.** Bound name in scope inside arm body; case rule from V1d enforced.
- **Deps.** V7a, V1d.
- **Ships when.** Binding patterns work.

## V7d — Literal pattern

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (pattern grammar).
- **Adds.** `"text"`, `42`, `true`, `false`, `null` patterns match by structural equality.
- **Tests.** Each literal kind; equality semantics match V2e.
- **Deps.** V7a.
- **Ships when.** Tag-based dispatch on literals works.

## V7e — Constructor pattern (`Ok`, `Err`)

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (pattern grammar).
- **Adds.** `Ok(p)` matches `Result.Ok` and recurses into `p`; same for `Err(p)`.
- **Tests.** Spec's `match @\`...\` { Ok(s) => ..., Err(e) => ... }` example; nested constructor `Ok(Ok(x))`.
- **Deps.** V7a, V6a.
- **Ships when.** Result destructuring works.

## V7f — Object/schema pattern with field shorthand

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (pattern grammar).
- **Adds.** `Schema { field: pat, ... }` matches by field-name; shorthand `{ field }` ≡ `{ field: field }`; unlisted fields ignored.
- **Tests.** Spec's `QueryError { kind: "validation", attempts }` example; missing field on scrutinee is no-match (returns to next arm); rest pattern `...other` rejected (deferred).
- **Deps.** V7a.
- **Ships when.** Schema-shaped destructuring works.

## V7g — Array pattern (fixed length)

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (pattern grammar).
- **Adds.** `[a, b, c]` matches arrays of exact length; each element pattern recurses.
- **Tests.** Length mismatch is no-match; element patterns can be any V7 form; rest pattern `[first, ...rest]` rejected.
- **Deps.** V7a.
- **Ships when.** Array destructuring works.

## V7h — Case disambiguation in patterns

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (pattern disambiguation).
- **Adds.** Lowercase identifiers bind; PascalCase identifiers refer to existing schema/enum/constructor in scope.
- **Tests.** `match x { Foo => ... }` where `Foo` not in scope is parse error; `match x { foo => ... }` always binds.
- **Deps.** V7c, V7e.
- **Ships when.** Case rule disambiguates patterns universally.

## V7i — `MatchError` runtime panic

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (panic sources).
- **Adds.** Non-exhaustive `match` (no arm matched at runtime) panics with `MatchError`; exhaustiveness not statically checked in loom 1.0.
- **Tests.** Match with no `_` arm and no matching value panics; routing handled in V18m.
- **Deps.** V7a.
- **Ships when.** Non-exhaustive match doesn't silently return undefined.

## V7j — Reject guards and rest patterns with deferred-feature diagnostic

- **Spec.** [Errors and Results](../spec_topics/errors-and-results.md) (pattern grammar — deferred features).
- **Adds.** `Ok(x) if guard => ...` is a parse error; `[first, ...rest]` and `{kind, ...other}` are parse errors; messages reference the spec's deferred-feature note.
- **Tests.** Each rejected form produces the documented diagnostic.
- **Deps.** V7a.
- **Ships when.** No accidental V2 acceptance of unsupported pattern forms.
