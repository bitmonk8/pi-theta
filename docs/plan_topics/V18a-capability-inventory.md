# `V18a` — SDK capability inventory

**Spec.** [`../spec_topics/pi-integration-contract/inventory-audit-intro.md`](../spec_topics/pi-integration-contract/inventory-audit-intro.md), [`../spec_topics/pi-integration-contract/capability-inventory-items.md`](../spec_topics/pi-integration-contract/capability-inventory-items.md).

**Adds.** The `CAPABILITY_OBLIGATIONS` and `SDK_SURFACE_INVENTORY` pinned constants enumerating the seven named SDK capabilities, with the build-time cardinality assertion.

**Tests.**
- `PIC-15`: the seven named SDK capabilities are pinned; items 1/2/3/4/6 are factory-probed (Step 0) and items 5/7 are verified otherwise; `CAPABILITY_OBLIGATIONS.length === 7` asserts the cardinality at build time.

**Deps.** `V18a-T`, `V9a`

**Ships when.** `npm test` asserts `CAPABILITY_OBLIGATIONS.length === 7` and the factory-probable/non-probable partition.
