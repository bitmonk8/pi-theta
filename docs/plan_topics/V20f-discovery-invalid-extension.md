# `V20f` — CLI/settings non-`.loom` file → `invalid-extension`

**Convention.** [`conventions.md`](./conventions.md) (phase categories — production-wiring). Narrative spec references for the implementer: [`discovery/discovery-sources.md`](../spec_topics/discovery/discovery-sources.md), [`discovery/package-and-settings.md`](../spec_topics/discovery/package-and-settings.md), [`lexical.md`](../spec_topics/lexical.md). Closes no new spec REQ-ID.

**Adds.** **Bucket C (implemented wrongly):** corrects the discovery path so a `--loom` / settings `loomPaths` entry naming a non-`.loom` file emits `loom/load/invalid-extension` (per [lexical.md](../spec_topics/lexical.md)) instead of `loom/load/wrong-type-source`, activating the currently-dead `invalid-extension` path. It closes no new spec REQ-ID; it is an integration realisation of the `cka-54`/DISC discovery area owned on [`V10a`](./V10a-discovery-walk.md). The correction stays within the injected discovery seam with no module-level mutable state.

**Tests.**
- `loom/load/invalid-extension`: a `--loom <file>` / settings `loomPaths` entry with a non-`.loom` extension emits `loom/load/invalid-extension` in production (owned on [`V10a`](./V10a-discovery-walk.md)).
- `Convention:` (No globals, statics, singletons; Specific exception types only; Sequential by default) the corrected `src/**` discovery code passes the [`H2a`](./H2a-cross-cutting-gates.md) / [`H3a`](./H3a-di-seam-skeleton.md) gates and the `no-broad-catch` lint.

**Deps.** `V20f-T`, `V10a`, `V10c`

**Ships when.** `npm test` proves a non-`.loom` file entry from `--loom` / settings emits `loom/load/invalid-extension` (not `wrong-type-source`), while `npm run typecheck` / `npm run lint` / the `src/**` architectural gates stay green.
