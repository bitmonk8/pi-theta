# `V8b-T` — `FileSystem` seam (tests)

**Spec.** [`../spec_topics/pi-integration-contract/host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md), [`../spec_topics/pi-integration-contract/host-interfaces-services.md`](../spec_topics/pi-integration-contract/host-interfaces-services.md), [`../spec_topics/lexical.md`](../spec_topics/lexical.md).

**Adds.** Failing tests for the paired `V8b` implementation leaf.

**Tests.**
- `PIC-13`: the enumerated `FileSystem` members (`readText`/`writeText`/`exists`/`homedir`/`cwd`/`readdir`/`lstat`/`realpath`) map Node `.code` values; no `src/**` module reads `process.env`/`process.cwd` directly.
- [`lexical.md` §Encoding](../spec_topics/lexical.md): `readBytes` (the `GOV-18` arm (a)-permitted loom-added member) returns raw pre-decode bytes (`Uint8Array`) with the same `.code` rejection mapping (`ENOENT`/`EACCES`/`EPERM`) as `readText`.

**Deps.** `H3a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
