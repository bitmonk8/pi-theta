# V17 — `.warp` library files

## V17a — `.warp` lexer/parser shares loom lexer

- **Spec.** [Imports](../spec_topics/imports.md).
- **Adds.** Same lexer; AST builder dispatches on file extension.
- **Tests.** Parsing token-equivalence between same content in `.warp` and `.loom`.
- **Deps.** V1.
- **Ships when.** `.warp` files parse.

## V17b — `.warp` body restriction

- **Spec.** [Imports](../spec_topics/imports.md) (`.warp` file rules).
- **Adds.** Top-level: only `import`, `export`, `schema`, `enum`, `fn` allowed. Top-level statements, `let`, queries are parse errors.
- **Tests.** Each forbidden top-level form rejected; permitted forms accepted (`import`, `export`, `schema`, `enum`, `fn`).
- **Deps.** V17a.
- **Ships when.** Library shape enforced.

## V17c — `import { X } from "./y.warp"`

- **Spec.** [Imports](../spec_topics/imports.md) (path resolution).
- **Adds.** Named-import form; resolution relative to importing file; path must end in `.warp`.
- **Tests.** Symbol resolves; non-`.warp` extension rejected; missing file → load error.
- **Deps.** V17b.
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
- **Adds.** Every top-level `schema`/`enum`/`fn` in `.warp` is implicitly exported; no `export` keyword on declarations; no privacy modifier in V1.
- **Tests.** All declarations importable; no internal-only marker accepted.
- **Deps.** V17b.
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
