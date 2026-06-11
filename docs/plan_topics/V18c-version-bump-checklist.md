# `V18c` — Pi version-bump static gates

**Spec.** [`../spec_topics/pi-integration-contract/version-bump-intro.md`](../spec_topics/pi-integration-contract/version-bump-intro.md), [`../spec_topics/pi-integration-contract/version-bump-step2.md`](../spec_topics/pi-integration-contract/version-bump-step2.md), [`../spec_topics/pi-integration-contract/version-bump-step2b.md`](../spec_topics/pi-integration-contract/version-bump-step2b.md), [`../spec_topics/pi-integration-contract/host-prerequisites.md`](../spec_topics/pi-integration-contract/host-prerequisites.md).

**Adds.** The contributor version-bump checklist's static build-time gates: the SDK surface-inventory tests (step 2(a)/2(b)), the `engines.node` floor literal-read, the `peerDependencies` pin assertion, the capability-probe constants (including `V9a`'s exported `FACTORY_PROBABLE_CAPABILITIES`, the same symbol `V18a`'s partition assertion consumes) + `SessionShutdownEvent['reason']` snapshot (the `loom/typecheck/session-shutdown-reason-snapshot` brand string), the provider seed-field table, the strict-capability probe, and the editorial-review checklist items. These gates need only the inventory leaves; the runtime-evidence acceptance gate and revert path travel with [`V18d`](./V18d-version-bump-acceptance.md).

**Tests.**
- Step 2(a): the positive surface-inventory test asserts each `SDK_SURFACE_INVENTORY` member is present on the pinned SDK.
- Step 2(b): the promote/co-edit obligation fires when a capability is added/removed.
- The `engines.node` literal-read test equals the SDK floor; the `peerDependencies` tilde line is asserted; the `loom/typecheck/session-shutdown-reason-snapshot` brand-string gate detects a reason-set skew.

**Deps.** `V18c-T`, `V18a`, `V18b`

**Ships when.** `npm test` runs the step-2(a)/2(b), `engines.node`, peer-dep, and reason-snapshot gates green on `main`.
