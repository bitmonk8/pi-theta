# `V10a-T` — Discovery walk, sources, and collisions (tests)

**Spec.** [`../spec_topics/discovery.md`](../spec_topics/discovery.md), [`../spec_topics/discovery/discovery-sources.md`](../spec_topics/discovery/discovery-sources.md).

**Adds.** Failing tests for the paired `V10a` implementation leaf.

**Tests.**
- `DISC-1`: `~/` expands only via `FileSystem.homedir()` — no `~user`/env/platform branch.
- `DISC-2`: per-source missing/unreadable/wrong-type modes (silent-on-missing for conventional sources, explicit error otherwise); clean-leaf-ENOENT ancestor walk.
- `DISC-3`: case collisions fire `loom/load/case-collision` (W); non-canonical extension fires `non-canonical-extension` (W); a name failing `^[a-z0-9][a-z0-9_-]*$` fires `invalid-slash-name` (E).
- `DISC-4`: a slash-name collision (loom-vs-loom same priority, loom-vs-Pi) fires `cross-format-collision` on the final derived name; loom loses; the superseded entry is dispatched.

**Deps.** `V8b`, `V1a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
