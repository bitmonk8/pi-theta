# Bindings and Mutability

Loom follows Rust's *immutable-by-default, opt-in mutability* convention. The two binding forms:

```loom
let x = 0          // immutable; rebinding x is a parse error
let mut count = 0  // mutable; count may be reassigned
```

**Reassignment** is a statement, never an expression. The plain form and the compound forms `+=`, `-=`, `*=`, `/=`, `%=` are all legal on `let mut` bindings; the RHS must type-match the binding's declared or inferred type:

```loom
let mut count = 0
count = count + 1
count += 1

let mut findings: array<Finding> = []
findings = findings.concat([new_finding])
```

Because assignment is statement-only, `if (x = 1) { ... }` is a parse error. Use a separate `let mut` + `if` instead.

**Mutability is binding-level only.** V1 does not support `obj.field = ...` or `arr[i] = ...`. Update by rebinding the whole value — `concat`, `slice`, etc. already return fresh values, and `let mut` lets you swing the binding to point at the new one. This keeps data structurally immutable (no aliasing semantics to define) and matches the rest of the stdlib's pure-function style.

**Immutable contexts.** The following bindings are always immutable; `mut` on any of them is a parse error:

- Function parameters
- `for` iteration variables (`for x in xs { ... }` — `x` is a fresh immutable binding per iteration)
- `match` pattern bindings
- The discard form `let _ = ...` (also: `let mut _ = ...` is a parse error — `_` cannot be reassigned)

Function parameters being immutable is a deliberate V1 simplification. See [Future Considerations](./future-considerations.md) for the deferred-feature inventory.

**Increment / decrement.** `++` and `--` remain parse errors. Use `count += 1` / `count -= 1`. Same Rust rationale: one obvious way, no prefix-vs-postfix confusion.
