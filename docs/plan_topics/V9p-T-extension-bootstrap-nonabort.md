# `V9p-T` — Extension-bootstrap SDK-failure non-abort surfaces (tests)

**Spec.** [`../spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md`](../spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md), [`../spec_topics/diagnostics/code-registry-load.md`](../spec_topics/diagnostics/code-registry-load.md), [`../spec_topics/pi-integration-contract/registration-steps.md`](../spec_topics/pi-integration-contract/registration-steps.md), [`../spec_topics/pi-integration-contract/drain-state-contract.md`](../spec_topics/pi-integration-contract/drain-state-contract.md), [`../spec_topics/diagnostics/placeholder-rendering-b.md`](../spec_topics/diagnostics/placeholder-rendering-b.md#underlying-error-coercion).

**Adds.** Failing tests for the paired `V9p` implementation leaf.

**Tests.**
- `loom/load/extension-bootstrap-failed` ([extension-bootstrap-and-per-loom.md — `pi.registerMessageRenderer` failure](../spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md), PIC area): a factory-time `pi.registerMessageRenderer` rejection drops the renderer registration, the factory completes the remaining steps, this extension instance's system notes permanently degrade to the `ctx.ui.notify` arm of the System-notes fallback chain, and one diagnostic is emitted with `details.capability = "pi.registerMessageRenderer"` and `details.error` carrying the underlying-error string.
- `loom/load/extension-bootstrap-failed` ([extension-bootstrap-and-per-loom.md — `pi.registerCommand` failure](../spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md), PIC area): a `pi.registerCommand` failure (factory-time or `session_start`-time) drops only the failing loom, siblings still register, and one diagnostic is emitted per failing loom with `details.capability = "pi.registerCommand"` and `details.loom` carrying the slash-name.
- `loom/load/extension-bootstrap-failed` ([extension-bootstrap-and-per-loom.md — `pi.getCommands()` read failure](../spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md#getcommands-read-failure), PIC area): a `session_start`-time `pi.getCommands()` read failure drops the pending-registration list for that pass (no `pi.registerCommand` calls issue), the handler swallows the throw and MUST NOT set drain state (drain state is owned by `V9m`'s `LoomRegistry` contract), and a single diagnostic is emitted with `details.capability = "pi.getCommands"` — asserted distinctly from the write-side surfaces, since conflating this read with them produces a wrong test.

**Deps.** `V9m`, `H4a`, `V9b`, `V7d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
