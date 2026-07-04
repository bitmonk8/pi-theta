# `V20a-T` — `tools:` load-time resolution wiring (tests)

**Convention.** [`conventions.md`](./conventions.md) (phase categories — end-to-end harness; hardening/production-wiring realisation of an already-closed code-keyed area). Narrative spec references for the implementer: [`frontmatter/frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md) (`tools:` callable set, FRNT-2/FRNT-3), [`invocation.md`](../spec_topics/invocation.md) (`loom/load/callee-has-errors`). Closes no new spec REQ-ID.

**Adds.** Failing tests for the paired [`V20a`](./V20a-tools-load-resolution.md) implementation leaf. **Bucket A (implemented-not-wired):** [`resolveCallableSet`](../../src/parser/callable-set.ts) exists but is never called on the production load/discovery path, so no `tools:`-resolution diagnostic ever fires against the shipped extension. These tests drive the *production* load path (through [`loom-composition-producer.ts`](../../src/extension/loom-composition-producer.ts) / the shipped composition root, with the Pi tool registry threaded to load time) and red today because `resolveCallableSet` is not wired in.

**Tests.**
- `loom/load/unknown-tool`: a `tools:` entry naming a Pi tool absent from the threaded registry is rejected at production load time (integration witness of the `cka-11` FRNT area owned on [`V6c`](./V6c-tools-set.md); reds today — unwired).
- `loom/load/prompt-mode-callable`: a prompt-mode `.loom` callee in `tools:` is rejected at production load time (owned on [`V6c`](./V6c-tools-set.md); reds today).
- `loom/load/tool-name-collision`: a `tools:` name collision fires at production load time; an `as` rename resolves (owned on [`V6c`](./V6c-tools-set.md); reds today).
- `loom/load/invalid-tool-rename`: a non-loom-identifier `as` rename target is rejected at production load time (owned on [`V6c`](./V6c-tools-set.md); reds today).
- `loom/load/callee-has-errors`: a `tools:` `.loom` callee that itself carries error-severity load/parse diagnostics is rejected at production load time (integration witness of the `cka-14` INV area owned on [`V15f`](./V15f-invoke-diagnostics.md); reds today).

**Deps.** `V6c`, `V15f`, `V9f`, `V19e`, `H8a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason (`resolveCallableSet` is not called on the production load path, so no `tools:`-resolution diagnostic fires).
