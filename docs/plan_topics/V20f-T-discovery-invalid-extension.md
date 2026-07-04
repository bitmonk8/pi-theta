# `V20f-T` — CLI/settings non-`.loom` file → `invalid-extension` (tests)

**Convention.** [`conventions.md`](./conventions.md) (phase categories — production-wiring). Narrative spec references for the implementer: [`discovery/discovery-sources.md`](../spec_topics/discovery/discovery-sources.md), [`discovery/package-and-settings.md`](../spec_topics/discovery/package-and-settings.md), [`lexical.md`](../spec_topics/lexical.md). Closes no new spec REQ-ID.

**Adds.** Failing tests for the paired [`V20f`](./V20f-discovery-invalid-extension.md) implementation leaf. **Bucket C (implemented wrongly):** a `--loom` / settings entry pointing at a non-`.loom` file emits `loom/load/wrong-type-source` where [lexical.md](../spec_topics/lexical.md) requires `loom/load/invalid-extension` (the latter is dead code today). These tests drive the production discovery path and red today because the wrong code is emitted.

**Tests.**
- `loom/load/invalid-extension`: a `--loom <file>` / settings `loomPaths` entry whose target is a file with a non-`.loom` extension emits `loom/load/invalid-extension` (integration witness of the `cka-54`/DISC area owned on [`V10a`](./V10a-discovery-walk.md); reds today — `wrong-type-source` is emitted instead).

**Deps.** `V10a`, `V10c`

**Ships when.** The tests above exist, compile, and fail red for the intended reason (the discovery path emits `loom/load/wrong-type-source` rather than `loom/load/invalid-extension` for a non-`.loom` file entry).
