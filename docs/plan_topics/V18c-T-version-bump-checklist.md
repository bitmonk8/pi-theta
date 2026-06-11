# `V18c-T` — Pi version-bump static gates (tests)

**Spec.** [`../spec_topics/pi-integration-contract/version-bump-intro.md`](../spec_topics/pi-integration-contract/version-bump-intro.md), [`../spec_topics/pi-integration-contract/version-bump-step2.md`](../spec_topics/pi-integration-contract/version-bump-step2.md), [`../spec_topics/pi-integration-contract/version-bump-step2b.md`](../spec_topics/pi-integration-contract/version-bump-step2b.md), [`../spec_topics/pi-integration-contract/host-prerequisites.md`](../spec_topics/pi-integration-contract/host-prerequisites.md).

**Adds.** Failing tests for the paired `V18c` implementation leaf.

**Tests.**
- Step 2(a): the positive surface-inventory test asserts each `SDK_SURFACE_INVENTORY` member is present on the pinned SDK.
- Step 2(b): the promote/co-edit obligation fires when a capability is added/removed.
- The `engines.node` floor test asserts the three-way equality across (i) the loom `package.json#engines.node` literal, (ii) the `pi-engines-node` row's pinned floor in `SDK_SURFACE_INVENTORY`, and (iii) the floor read live from the installed `@earendil-works/pi-coding-agent` `package.json`; operand (iii) is the only live read, so the test reddens when the upstream floor moves while (i) and (ii) stay pinned, per [`version-bump-step2b.md` step 3](../spec_topics/pi-integration-contract/version-bump-step2b.md). The `peerDependencies` tilde line is asserted; the `loom/typecheck/session-shutdown-reason-snapshot` brand-string gate detects a reason-set skew.

**Deps.** `V18a`, `V18b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
