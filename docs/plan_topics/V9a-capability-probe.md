# `V9a` — Capability probe (Step 0)

**Spec.** [`../spec_topics/pi-integration-contract/capability-probe.md`](../spec_topics/pi-integration-contract/capability-probe.md), [`../spec_topics/pi-integration-contract/host-prerequisites.md`](../spec_topics/pi-integration-contract/host-prerequisites.md).

**Adds.** The single load-bearing capability probe run at factory entry: Node-floor check, `AbortSignal`/`AbortController` shape check, SDK named-member check, peer-dep lock-step check, and the `typebox` `Type.Unsafe` callable check — with the fixed short-circuit, the refusal rule (skip all factory host-binding calls), and one `loom/load/host-incompatible` emission. Also exports the named constant `FACTORY_PROBABLE_CAPABILITIES` — the closed five-element list of factory-probable capability identifiers (inventory items 1/2/3/4/6) the probe iterates, one of the four pinned probe constants in the extension module's single source-of-truth pinned-constants block — as the importable symbol `V18a`/`V18c` reconcile their partition against. The same pinned-constants block is the single physical home of the cancellation-runtime constant `SHUTDOWN_AWAIT_CAP_MS = 2000` (semantics owned by `V17a`, value sourced from [`patch-skew-degradation.md` §`session_shutdown` sub-step 3](../spec_topics/pi-integration-contract/patch-skew-degradation.md)): it lives alongside the probe constants here so the block has one explicit physical owner and `V18c`'s build-time literal-read assertion can read it; `V9g`, `V9i`, and `V17a` consume it without redeclaring it.

**Tests.**
- `PIC-3`: the probe never uses a member it is checking.
- `PIC-4`: the probe uses only `typeof`/`in` — no arity/return-shape sniffing, no construction.
- `PIC-5`: there are exactly five checks; no probes beyond them.
- `PIC-5`: `FACTORY_PROBABLE_CAPABILITIES` enumerates exactly the five factory-probable capability identifiers (inventory items 1/2/3/4/6) and nothing else, pinning the symbol `V18a`/`V18c` import.
- `PIC-6`: the factory never throws — each check is `try`/`catch`-wrapped.
- A failure emits one `host-incompatible` with the correct closed `details.kind` discriminator (`node-floor` / `abortsignal-shape` / `sdk-capability-missing` / `peer-dep-out-of-range` / `peer-dep-malformed-version` / `typebox-shape` / `probe-failed`).

**Deps.** `V9a-T`, `H4a`, `V7a`

**Ships when.** `npm test` proves the probe refuses on each failure kind with the right `details.kind` and binds nothing.
