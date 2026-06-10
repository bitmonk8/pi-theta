# `H2a` — Cross-cutting lint and architectural gates

**Convention.** [`conventions.md`](./conventions.md) — *No globals, statics, singletons*; *Specific exception types only*; *Sequential by default*; *No silent test skipping*.

**Adds.** The ESLint rules (`no-broad-catch`, the `no-restricted-syntax` sequential-by-default allow-list) and the `src/**` architectural test that fails on a module-level mutable binding — a top-level `let`/`var`, or a top-level `const` bound to a mutable object/array reused across calls, declared outside any class or function (closure-captured, lazy module-cache, and DI-container singletons are not mechanically detected; that residue is owned by the *Per-phase TDD ritual* self-review step in [`conventions.md`](./conventions.md)), wired into `npm test`.

**Tests.**
- `Convention:` (*Specific exception types only*) a fixture file containing `catch (e: unknown)` with no `// allow-broad-catch:` comment fails lint; an allow-listed exempt site whose comment cites any token the widened gate predicate admits — a coverage-matrix REQ-ID, an enumerated *Code-keyed obligation areas* entry, a `loom/...` registry code, or the structural `pi-sdk-boundary` token — passes.
- `Convention:` (*Sequential by default*) a fixture using `Promise.all` in `src/**` without an allow comment fails lint; `**/*.test.ts` is unrestricted.
- `Convention:` (*No globals, statics, singletons*) a fixture introducing a module-level mutable binding of a flagged form — a top-level `let`/`var`, or a top-level `const` bound to a mutable object/array reused across calls, declared outside any class or function — fails the architectural test.

**Deps.** `H1a`

**Ships when.** `npm test` includes passing lint + architectural assertions that reject a broad catch, an unguarded `Promise.all`, and a module-level mutable binding of a flagged form in `src/**`.
