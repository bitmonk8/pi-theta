# `V8b` — `FileSystem` seam

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md), [`../spec_topics/lexical.md`](../spec_topics/lexical.md).

**Adds.** The `FileSystem` host seam. The members `PIC-13` enumerates (`readText`/`writeText`/`exists`/`homedir`/`cwd`/`readdir`/`lstat`/`realpath`) carry `PIC-13`'s Node `.code` mapping. The seam additionally exposes a `readBytes` member — a `GOV-18` arm (a)-permitted loom decomposition (`PIC-13`'s interface member set is non-binding) grounded in [`lexical.md` §Encoding](../spec_topics/lexical.md): it returns the raw pre-decode bytes as a `Uint8Array` so the `V1a` decode step can detect invalid UTF-8 and report byte offsets, rejecting with the same Node-style `.code` shape (`ENOENT`/`EACCES`/`EPERM`) as `readText`. The `Clock`/`IdSource` ambient-wrapping seams are owned by [`V8d`](./V8d-clock-id-seams.md); the `FileWatcher`/`TokenEstimator` seams by [`V8e`](./V8e-watch-token-seams.md).

**Tests.**
- `PIC-13`: the enumerated `FileSystem` members (`readText`/`writeText`/`exists`/`homedir`/`cwd`/`readdir`/`lstat`/`realpath`) map Node `.code` values; no `src/**` module reads `process.env`/`process.cwd` directly.
- [`lexical.md` §Encoding](../spec_topics/lexical.md): `readBytes` (the `GOV-18` arm (a)-permitted loom-added member) returns raw pre-decode bytes (`Uint8Array`) with the same `.code` rejection mapping (`ENOENT`/`EACCES`/`EPERM`) as `readText`.

**Deps.** `V8b-T`, `H3a`

**Ships when.** `npm test` asserts the `FileSystem` seam's `.code` mapping, the `readBytes` raw-bytes contract, and the no-direct-`process.env`/`process.cwd` ambient-access ban.
