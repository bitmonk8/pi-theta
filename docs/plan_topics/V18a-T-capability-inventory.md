# `V18a-T` — SDK capability inventory (tests)

**Spec.** [`../spec_topics/pi-integration-contract/inventory-audit-intro.md`](../spec_topics/pi-integration-contract/inventory-audit-intro.md), [`../spec_topics/pi-integration-contract/capability-inventory-items.md`](../spec_topics/pi-integration-contract/capability-inventory-items.md).

**Adds.** Failing tests for the paired `V18a` implementation leaf.

**Tests.**
- `PIC-15`: the seven named SDK capabilities are pinned; items 1/2/3/4/6 are factory-probed (Step 0) and items 5/7 are verified otherwise; `CAPABILITY_OBLIGATIONS.length === 7` asserts the cardinality at build time.

**Deps.** `V9a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
