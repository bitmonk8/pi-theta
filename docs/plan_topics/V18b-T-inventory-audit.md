# `V18b-T` — Inventory-closure audit gate (tests)

**Spec.** [`../spec_topics/pi-integration-contract/inventory-audit-intro.md`](../spec_topics/pi-integration-contract/inventory-audit-intro.md), [`../spec_topics/pi-integration-contract/audit-resolution.md`](../spec_topics/pi-integration-contract/audit-resolution.md), [`../spec_topics/pi-integration-contract/audit-recognised-shapes.md`](../spec_topics/pi-integration-contract/audit-recognised-shapes.md), [`../spec_topics/pi-integration-contract/audit-target-categories.md`](../spec_topics/pi-integration-contract/audit-target-categories.md), [`../spec_topics/pi-integration-contract/audit-failures.md`](../spec_topics/pi-integration-contract/audit-failures.md), [`../spec_topics/pi-integration-contract/audit-wire-and-canary.md`](../spec_topics/pi-integration-contract/audit-wire-and-canary.md).

**Adds.** Failing tests for the paired `V18b` implementation leaf.

**Tests.**
- A `src/**` reference to an off-inventory Pi surface fails the audit with the correct `audit/<class>/<family>/<symptom>` record.
- A declared `// allow-pi-surface:` exemption passes; the typebox `{ Type }` / `{ Unsafe }` allow-lists pass.
- The non-empty canary fails the audit if the walker matches nothing (fail-closed); `loom/typecheck/*` is treated as a disjoint prefix.
- A failing test asserts that an `import * as pi`, a dynamic `import()`, an aliased rebinding (`import { Foo as Bar }`), or an off-canonical-name / off-canonical-annotation `ctx` / `pi` parameter fires the family-(4) `audit/violation/<family>/<symptom>` record and is non-exemptible — an `// allow-pi-surface:` marker on the offending line surfaces the family-(5) marker record but does not suppress the family-(4) shape record (see [`../spec_topics/pi-integration-contract/audit-recognised-shapes.md`](../spec_topics/pi-integration-contract/audit-recognised-shapes.md) and [`../spec_topics/pi-integration-contract/audit-failures.md`](../spec_topics/pi-integration-contract/audit-failures.md)).

**Deps.** `V18a`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
