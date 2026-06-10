# `V10a` — Discovery walk, sources, and collisions

**Spec.** [`../spec_topics/discovery.md`](../spec_topics/discovery.md), [`../spec_topics/discovery/discovery-sources.md`](../spec_topics/discovery/discovery-sources.md).

**Adds.** The five-source discovery union with its priority order, per-source missing/unreadable/wrong-type handling, `~/` expansion via the `FileSystem.homedir()` seam, the slash-name validity regex, and cross-source-shadow vs cross-format-collision resolution (loom always loses).

**Tests.**
- `DISC-1`: `~/` expands only via `FileSystem.homedir()` — no `~user`/env/platform branch.
- `DISC-2`: per-source missing/unreadable/wrong-type modes (silent-on-missing for conventional sources, explicit error otherwise); clean-leaf-ENOENT ancestor walk.
- `DISC-3`: case collisions fire `loom/load/case-collision` (W); non-canonical extension fires `non-canonical-extension` (W); a name failing `^[a-z0-9][a-z0-9_-]*$` fires `invalid-slash-name` (E).
- `DISC-4`: a slash-name collision (loom-vs-loom same priority, loom-vs-Pi) fires `cross-format-collision` on the final derived name; loom loses; the superseded entry is dispatched.

**Deps.** `V10a-T`, `V8b`, `V1a`

**Ships when.** `npm test` discovers across the five sources and resolves each collision/validity case.
