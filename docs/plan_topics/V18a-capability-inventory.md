# `V18a` — SDK capability inventory

**Spec.** [`../spec_topics/pi-integration-contract/inventory-audit-intro.md`](../spec_topics/pi-integration-contract/inventory-audit-intro.md), [`../spec_topics/pi-integration-contract/capability-inventory-items.md`](../spec_topics/pi-integration-contract/capability-inventory-items.md).

**Adds.** The `CAPABILITY_OBLIGATIONS` and `SDK_SURFACE_INVENTORY` pinned constants enumerating the seven named SDK capabilities — each `CAPABILITY_OBLIGATIONS` entry carrying a partition flag classifying it factory-probed (Step 0) vs verified-otherwise — with the build-time cardinality assertion and the partition assertion that reconciles those flags against the `FACTORY_PROBABLE_CAPABILITIES` constant `V9a` exports.

**Tests.**
- `PIC-15`: the seven named SDK capabilities are pinned, each `CAPABILITY_OBLIGATIONS` entry carrying a partition flag classifying it factory-probed (Step 0) vs verified-otherwise — items 1/2/3/4/6 factory-probed, items 5/7 otherwise; `CAPABILITY_OBLIGATIONS.length === 7` asserts the cardinality at build time, and a build-time assertion verifies the set of factory-probed-flagged entries equals the Step-0 factory-probable capability set imported from `V9a`'s exported `FACTORY_PROBABLE_CAPABILITIES` constant (not a literal re-listed here), so a mis-classified entry reddens at build time.

**Deps.** `V18a-T`, `V9a`

**Ships when.** `npm test` asserts `CAPABILITY_OBLIGATIONS.length === 7` and that each entry's factory-probed/verified-otherwise partition flag reconciles against the `FACTORY_PROBABLE_CAPABILITIES` constant `V9a` exports.
