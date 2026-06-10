# `V9a-T` — Capability probe (Step 0) (tests)

**Spec.** [`../spec_topics/pi-integration-contract/capability-probe.md`](../spec_topics/pi-integration-contract/capability-probe.md), [`../spec_topics/pi-integration-contract/host-prerequisites.md`](../spec_topics/pi-integration-contract/host-prerequisites.md).

**Adds.** Failing tests for the paired `V9a` implementation leaf.

**Tests.**
- `PIC-3`: the probe never uses a member it is checking.
- `PIC-4`: the probe uses only `typeof`/`in` — no arity/return-shape sniffing, no construction.
- `PIC-5`: there are exactly five checks; no probes beyond them.
- `PIC-6`: the factory never throws — each check is `try`/`catch`-wrapped.
- A failure emits one `host-incompatible` with the correct closed `details.kind` discriminator (`node-floor` / `abortsignal-shape` / `sdk-capability-missing` / `peer-dep-out-of-range` / `peer-dep-malformed-version` / `typebox-shape` / `probe-failed`).

**Deps.** `H4a`, `V7a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
