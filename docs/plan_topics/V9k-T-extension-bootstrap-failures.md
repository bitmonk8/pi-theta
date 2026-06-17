# `V9k-T` — Extension-bootstrap SDK-failure abort surfaces (tests)

**Spec.** [`../spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md`](../spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md), [`../spec_topics/diagnostics/code-registry-load.md`](../spec_topics/diagnostics/code-registry-load.md), [`../spec_topics/pi-integration-contract/registration-steps.md`](../spec_topics/pi-integration-contract/registration-steps.md), [`../spec_topics/diagnostics/placeholder-rendering-b.md`](../spec_topics/diagnostics/placeholder-rendering-b.md#underlying-error-coercion).

**Adds.** Failing tests for the paired `V9k` implementation leaf.

**Tests.**
- `loom/load/extension-bootstrap-failed` ([extension-bootstrap-and-per-loom.md — `pi.registerFlag` failure](../spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md), PIC area): a factory-time `pi.registerFlag` failure is fatal to the whole extension — registration steps 2–5 do not execute — and a single diagnostic is emitted with `details.capability = "pi.registerFlag"`.
- `loom/load/extension-bootstrap-failed` ([extension-bootstrap-and-per-loom.md — `pi.on(...)` failure](../spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md), PIC area): a factory-time `pi.on(...)` subscription failure is fatal to the whole extension — no subsequent `pi.register*` / `pi.on` call executes after the failing subscription — and a single diagnostic is emitted with `details.capability = "pi.on"` and `details.event` naming the subscribed Pi event (`"resources_discover" | "session_start" | "session_shutdown"`).

**Deps.** `H4a`, `V9b`, `V7d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
