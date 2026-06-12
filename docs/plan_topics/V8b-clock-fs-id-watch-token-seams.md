# `V8b` — `FileSystem` seam

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md).

**Adds.** The `FileSystem` host seam (`readText`/`readBytes`/`writeText`/`exists`/`homedir`/`cwd`/`readdir`/`lstat`/`realpath` with Node `.code` mapping; `readBytes` returns the raw pre-decode bytes as a `Uint8Array` so the `V1a` decode step can detect invalid UTF-8 and report byte offsets). The `Clock`/`IdSource` ambient-wrapping seams are owned by [`V8d`](./V8d-clock-id-seams.md); the `FileWatcher`/`TokenEstimator` seams by [`V8e`](./V8e-watch-token-seams.md).

**Tests.**
- `PIC-13`: `FileSystem` maps Node `.code` values; `readBytes` returns raw pre-decode bytes (`Uint8Array`) with the same `.code` rejection mapping (`ENOENT`/`EACCES`/`EPERM`) as `readText`; no `src/**` module reads `process.env`/`process.cwd` directly.

**Deps.** `V8b-T`, `H3a`

**Ships when.** `npm test` asserts the `FileSystem` seam's `.code` mapping, the `readBytes` raw-bytes contract, and the no-direct-`process.env`/`process.cwd` ambient-access ban.
