# `V20a` — `tools:` load-time resolution wiring

**Convention.** [`conventions.md`](./conventions.md) (phase categories — end-to-end harness; hardening/production-wiring realisation of an already-closed code-keyed area). Narrative spec references for the implementer: [`frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md) (`tools:` callable set, FRNT-2/FRNT-3), [`invocation.md`](../spec_topics/invocation.md) (`loom/load/callee-has-errors`). Closes no new spec REQ-ID.

**Adds.** **Bucket A (implemented-not-wired):** threads the Pi tool registry into the production load/discovery path and calls the existing [`resolveCallableSet`](../../src/parser/callable-set.ts) there, so `tools:`-entry resolution actually runs against the shipped extension and its load-time rejections fire. It closes no new spec REQ-ID; every diagnostic is an integration realisation of the `cka-11` FRNT callable-set area owned on [`V6c`](./V6c-tools-set.md) and the `cka-14` `loom/load/callee-has-errors` area owned on [`V15f`](./V15f-invoke-diagnostics.md). The `src/**` composition change stays constructor-injected (no module-level mutable state); [`extensions/index.ts`](../../extensions/index.ts) remains a thin shim.

**Tests.**
- `loom/load/unknown-tool`: a `tools:` entry naming an absent Pi tool is rejected at production load time (owned on [`V6c`](./V6c-tools-set.md)).
- `loom/load/prompt-mode-callable`: a prompt-mode `.loom` callee in `tools:` is rejected at production load time (owned on [`V6c`](./V6c-tools-set.md)).
- `loom/load/tool-name-collision`: a `tools:` name collision fires at production load time; an `as` rename resolves (owned on [`V6c`](./V6c-tools-set.md)).
- `loom/load/invalid-tool-rename`: a non-loom-identifier `as` rename target is rejected at production load time (owned on [`V6c`](./V6c-tools-set.md)).
- `loom/load/callee-has-errors`: a `tools:` `.loom` callee carrying error-severity load/parse diagnostics is rejected at production load time (owned on [`V15f`](./V15f-invoke-diagnostics.md)).
- `Convention:` (No globals, statics, singletons; No ambient access; Specific exception types only; Sequential by default) the new `src/**` wiring passes the [`H2a`](./H2a-cross-cutting-gates.md) / [`H3a`](./H3a-di-seam-skeleton.md) gates and the `no-broad-catch` lint.

**Deps.** `V20a-T`, `V6c`, `V15f`, `V9f`, `V19e`, `H8a`

**Ships when.** `npm test` proves the shipped composition resolves `tools:` at load time and rejects an unknown Pi tool, a prompt-mode callee, a name collision, an invalid `as` rename, and a callee-with-errors, with `resolveCallableSet` wired into the production load path, while `npm run typecheck` / `npm run lint` / the `src/**` architectural gates stay green and `extensions/index.ts` remains a thin shim.
