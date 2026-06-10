# `H2a` — Cross-cutting lint and architectural gates

**Convention.** [`conventions.md`](./conventions.md) — *No globals, statics, singletons*; *Specific exception types only*; *Sequential by default*; *No silent test skipping*.

**Adds.** The ESLint rules (`no-broad-catch`, the `no-restricted-syntax` sequential-by-default allow-list) and the `src/**` architectural test that fails on any global / static / singleton, wired into `npm test`.

**Tests.**
- `Convention:` (*Specific exception types only*) a fixture file containing `catch (e: unknown)` with no `// allow-broad-catch:` comment fails lint; an allow-listed exempt site passes.
- `Convention:` (*Sequential by default*) a fixture using `Promise.all` in `src/**` without an allow comment fails lint; `**/*.test.ts` is unrestricted.
- `Convention:` (*No globals, statics, singletons*) a fixture introducing a module-level mutable singleton fails the architectural test.

**Deps.** `H1a`

**Ships when.** `npm test` includes passing lint + architectural assertions that reject a broad catch, an unguarded `Promise.all`, and a singleton in `src/**`.
