# `V18b` — Inventory-closure audit gate

**Spec.** [`../spec_topics/pi-integration-contract/inventory-audit-intro.md`](../spec_topics/pi-integration-contract/inventory-audit-intro.md), [`../spec_topics/pi-integration-contract/audit-resolution.md`](../spec_topics/pi-integration-contract/audit-resolution.md), [`../spec_topics/pi-integration-contract/audit-recognised-shapes.md`](../spec_topics/pi-integration-contract/audit-recognised-shapes.md), [`../spec_topics/pi-integration-contract/audit-target-categories.md`](../spec_topics/pi-integration-contract/audit-target-categories.md), [`../spec_topics/pi-integration-contract/audit-failures.md`](../spec_topics/pi-integration-contract/audit-failures.md), [`../spec_topics/pi-integration-contract/audit-wire-and-canary.md`](../spec_topics/pi-integration-contract/audit-wire-and-canary.md).

**Adds.** The build-time surface-set-closure audit over the audited source tree (`src/**/*.ts` minus the enumerated exclusions): every Pi-side surface reference resolves to an `SDK_SURFACE_INVENTORY` entry, a typebox sibling allow-list, or a declared `// allow-pi-surface:` exemption, **and** every reference whose shape is not a recognised category-(1) `pi.<member>` access, category-(2) peer / typebox named import, or category-(3) canonical-`ctx` member access fires the non-exemptible family-(4) out-of-scope import/access discriminator — an `// allow-pi-surface:` marker cannot silence a family-(4) shape — fail-closed in `npm test` with line-delimited `audit/<class>/<family>/<symptom>` stdout records and a non-empty canary.

**Tests.**
- A `src/**` reference to an off-inventory Pi surface fails the audit with the correct `audit/<class>/<family>/<symptom>` record.
- A declared `// allow-pi-surface:` exemption passes; the typebox `{ Type }` / `{ Unsafe }` allow-lists pass.
- The non-empty canary fails the audit if the walker matches nothing (fail-closed); `loom/typecheck/*` is treated as a disjoint prefix.
- An `import * as pi`, a dynamic `import()`, an aliased rebinding (`import { Foo as Bar }`), or an off-canonical-name / off-canonical-annotation `ctx` / `pi` parameter fires the family-(4) `audit/violation/<family>/<symptom>` record and is non-exemptible — an `// allow-pi-surface:` marker on the offending line surfaces the family-(5) marker record but does not suppress the family-(4) shape record (see [`../spec_topics/pi-integration-contract/audit-recognised-shapes.md`](../spec_topics/pi-integration-contract/audit-recognised-shapes.md) and [`../spec_topics/pi-integration-contract/audit-failures.md`](../spec_topics/pi-integration-contract/audit-failures.md)).

**Deps.** `V18b-T`, `V18a`

**Ships when.** `npm test` runs the closure audit green on `main` and red against a seeded off-inventory reference.
