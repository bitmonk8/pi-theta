# Influences

Loom borrows from two languages and adds a small number of constructs of its own:

- **Rust** for **semantics**: immutable-by-default `let` with opt-in `let mut`, `fn` declarations, `match` expressions with pattern arms, `Result<T, E>` with `Ok` / `Err` constructors, the `?` early-return operator, `///` doc comments (lowered to JSON Schema `description:` rather than rustdoc), block-as-expression with last-expression return, and the deliberate omission of `++` / `--`.
- **TypeScript** for **surface**: template strings with `${...}` interpolation (extended to `@`-prefixed query templates), `name: T` type annotations, angle-bracket generics (`array<T>`, `Result<T, E>`), `T | U` union types, inline anonymous object types `{ field: T }`, JSON-native primitive type names (`string`, `number`, `boolean`, `null`), and the structural-equality `==` operator.
- **Original to loom**: `schema` and `enum` declarations targeting the [Schema Subset](./schema-subset.md), the `@`...`` query template as the primitive that crosses code → model in the *current* conversation, frontmatter-declared execution mode, the `.loom` / `.warp` split, and the unified callable set where Pi tools and registered subagent looms share one declaration list (`tools:`) and one call syntax (`<name>(...)`).

What's *not* borrowed: Rust's lifetimes, traits, ownership, and macros; TypeScript's classes, decorators, arrow functions, higher-order array methods, and structural-type gymnastics. Loom is much smaller than either parent — see [Expression Sublanguage](./expressions.md) for the explicit "not supported" list.
