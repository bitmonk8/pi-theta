# V17 — `.warp` library files

## V17a — `.warp` files parse with body restriction

- **Spec.** [Imports](../spec_topics/imports.md) (`.warp` file rules).
- **Adds.** Same lexer as `.loom`; AST builder dispatches on file extension; top-level in `.warp` restricted to `import`, `export`, `schema`, `enum`, `fn` (top-level statements, `let` bindings, and queries are parse errors).
- **Tests.** Token-equivalence between identical content in `.warp` and `.loom` for permitted forms; each forbidden top-level form (statement, `let`, query) rejected with `loom/parse/warp-top-level-statement`; each permitted form accepted.
- **Deps.** V1a–V1e.
- **Ships when.** `.warp` files parse and reject forbidden top-level forms.

## V17c — `import { X } from "./y.warp"`

- **Spec.** [Imports](../spec_topics/imports.md) (path resolution).
- **Adds.** Named-import form; resolution relative to importing file; path must end in `.warp`. Backslash inside the import path literal is rejected with `loom/parse/invalid-path-separator` before `.warp`-extension and resolution checks.
- **Tests.** Symbol resolves; non-`.warp` extension rejected; missing file → load error; `import { X } from "./a\\y.warp"` and `import { X } from ".\\y.warp"` each emit `loom/parse/invalid-path-separator`; `./a/y.warp` resolves normally; ordinary string literals elsewhere in the file (e.g. `let s = "a\\b"`) still parse — the diagnostic is scoped to the import path position.
- **Deps.** V17a.
- **Ships when.** Imports work.

## V17d — `import { X as Y }` aliasing

- **Spec.** [Imports](../spec_topics/imports.md) (name collisions).
- **Adds.** Local alias for imported symbol.
- **Tests.** Alias usable; original name not in scope after alias; collision with local declaration is error.
- **Deps.** V17c.
- **Ships when.** Aliasing works.

## V17e — `export { X } from "./y.warp"` re-export

- **Spec.** [Imports](../spec_topics/imports.md) (re-exports).
- **Adds.** Re-export form creates no local binding.
- **Tests.** Re-exported symbol visible to downstream importers; not visible in re-exporting file's own scope.
- **Deps.** V17c.
- **Ships when.** Re-exports work.

## V17f — `export { X as Y } from "./y.warp"`

- **Spec.** [Imports](../spec_topics/imports.md) (re-exports).
- **Adds.** Re-export with rename.
- **Tests.** Downstream sees `Y`, not `X`.
- **Deps.** V17e.
- **Ships when.** Renamed re-exports work.

## V17g — Implicit export of all `.warp` top-level declarations

- **Spec.** [Imports](../spec_topics/imports.md) (visibility).
- **Adds.** Every top-level `schema`/`enum`/`fn` in `.warp` is implicitly exported; no `export` keyword on declarations; no privacy modifier in loom 1.0.
- **Tests.** All declarations importable; no internal-only marker accepted.
- **Deps.** V17a.
- **Ships when.** Library visibility rule enforced.

## V17h — Plain `import` does not re-export

- **Spec.** [Imports](../spec_topics/imports.md) (re-exports).
- **Adds.** Symbols pulled in via `import` aren't visible to downstream importers unless explicitly re-exported.
- **Tests.** Downstream importing transitively-imported symbol fails to resolve unless re-exported.
- **Deps.** V17c.
- **Ships when.** Re-export discipline holds.

## V17i — Query inside `.warp` `fn` runs against caller's conversation

- **Spec.** [Imports](../spec_topics/imports.md) (`.warp` file rules).
- **Adds.** A `@`...`` inside an imported function executes against the calling `.loom`'s current conversation.
- **Tests.** Loom calling warp `fn` containing query: query appears in loom's conversation, not a fresh one.
- **Deps.** V17a, V5e.
- **Ships when.** Library-shipped query helpers work.

## V17j — `invoke` from `.warp` resolves relative to `.warp` file

- **Spec.** [Imports](../spec_topics/imports.md) (`.warp` file rules).
- **Adds.** Path relative to `.warp` location; execution against calling `.loom`'s conversation (or fresh subagent if callee subagent-mode).
- **Tests.** Path resolution correct; cross-mode behaviour matches V15h–k.
- **Deps.** V17a, V15a.
- **Ships when.** Library `invoke` paths work.

## V17k — Import-cycle detection

- **Spec.** [Imports](../spec_topics/imports.md) (cycles).
- **Adds.** Walk static import graph between `.warp` files; cycle is parse error with full path.
- **Tests.** Two-file cycle; three-file cycle; error message matches spec format `"import cycle: a.warp → b.warp → a.warp"`.
- **Deps.** V17c.
- **Ships when.** Static cycles caught.

## V17l — `.warp` excluded from slash-command discovery

- **Spec.** [Directory Convention](../spec_topics/discovery.md), [Imports](../spec_topics/imports.md).
- **Adds.** Discovery scan ignores `.warp` files at every source.
- **Tests.** `.warp` next to `.loom` doesn't register a command; only reachable via `import`.
- **Deps.** V14k–p, V17a.
- **Ships when.** Library files invisible to autocomplete.

## V17m — Name collision: import vs. top-level `fn`

- **Spec.** [Imports](../spec_topics/imports.md) (name collisions).
- **Adds.** Imported symbol colliding with local top-level declaration is parse error; resolve with `as`.
- **Tests.** Collision detected; error names both sites; `as` resolves.
- **Deps.** V17d.
- **Ships when.** Local-vs-imported naming clear.
