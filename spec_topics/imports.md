# Imports

`.loom` files import schemas and functions from **`.warp`** files — a separate extension dedicated to shared loom library code. `.loom` files are *not* importable from each other. This split keeps invocable looms (slash commands) and reusable building blocks (libraries) cleanly separated.

```loom
import { Author, persona_block } from "./shared/personas.warp"
```

**`.warp` file rules:**

- Top-level may contain only `import`, `export`, `schema`, and `fn` declarations. No top-level statements, `let` bindings, or queries (parse error).
- Inside `fn` bodies, the full Loom language is available, including `@`...`` queries. A query inside an imported function executes against the *calling* `.loom`'s conversation when the function is invoked.
- Never slash-command-discovered. A `.warp` file is invisible to the `/<name>` autocomplete; it is only ever reached via `import`.
- May call `invoke(...)`. The path resolves relative to the `.warp` file's location; the invocation executes against the *calling* `.loom`'s conversation (or spawns a fresh isolated one if the callee is subagent-mode), exactly like a `@`...`` query inside a warp function. Cycle detection from [Invocation](./invocation.md) walks invoke paths originating from warp functions too.

**Path resolution.** V1 supports relative paths only: `"./shared/personas.warp"`, `"../lib/schemas.warp"`. Paths must end in `.warp` and resolve relative to the importing file's directory. Project-rooted (`/looms/...`) and package-style (`@scope/pkg`) imports are out of scope for V1.

**Visibility.** Every top-level `schema` and `fn` in a `.warp` file is implicitly exported. There is no `export` keyword on declarations and no privacy modifier; `.warp` files have no internal-only symbols in V1.

**Re-exports.** A `.warp` may re-export a symbol from another `.warp` using a dedicated form that creates no local binding:

```loom
export { Author } from "./personas.warp"
export { Author as Reviewer } from "./personas.warp"
```

A plain `import { Author } from "./personas.warp"` does **not** re-export `Author` from the importing file — only declarations and explicit `export ... from` forms are visible to downstream importers.

**Name collisions.** Two imports bringing in the same symbol name is a parse error. Resolve with `as`-aliasing:

```loom
import { Author as AuthorA } from "./team-a.warp"
import { Author as AuthorB } from "./team-b.warp"
```

The same `as` form is also available for self-clarity (`import { ReviewScore as Score } from "./scoring.warp"`). An imported symbol whose name collides with a top-level declaration in the same file is also an error — no implicit shadowing.

**Cycles.** Import cycles between `.warp` files are detected at parse time by walking the static import graph and reported as a parse error with the cycle path printed (`"import cycle: a.warp → b.warp → a.warp"`). `.warp` files contain only declarations — no top-level statements, no initialisation order — so cycles serve no purpose and only happen by accident.
