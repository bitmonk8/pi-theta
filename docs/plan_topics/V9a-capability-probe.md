# `V9a` — Capability probe (Step 0)

**Spec.** [`../spec_topics/pi-integration-contract/capability-probe.md`](../spec_topics/pi-integration-contract/capability-probe.md), [`../spec_topics/pi-integration-contract/host-prerequisites.md`](../spec_topics/pi-integration-contract/host-prerequisites.md).

**Adds.** The single load-bearing capability probe run at factory entry: Node-floor check, `AbortSignal`/`AbortController` shape check, SDK named-member check, peer-dep lock-step check, and the `typebox` `Type.Unsafe` callable check — with the fixed short-circuit, the refusal rule (skip all factory host-binding calls), and one `loom/load/host-incompatible` emission.

**Tests.**
- `PIC-3`: the probe never uses a member it is checking.
- `PIC-4`: the probe uses only `typeof`/`in` — no arity/return-shape sniffing, no construction.
- `PIC-5`: there are exactly five checks; no probes beyond them.
- `PIC-6`: the factory never throws — each check is `try`/`catch`-wrapped.
- A failure emits one `host-incompatible` with the correct closed `details.kind` discriminator (`node-floor` / `abortsignal-shape` / `sdk-capability-missing` / `peer-dep-out-of-range` / `peer-dep-malformed-version` / `typebox-shape` / `probe-failed`).

**Deps.** `V9a-T`, `H4a`, `V7a`

**Ships when.** `npm test` proves the probe refuses on each failure kind with the right `details.kind` and binds nothing.
