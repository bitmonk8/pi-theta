# `V9f-T` — Tool-registration lifetime and visibility (tests)

**Spec.** [`../spec_topics/pi-integration-contract/tool-registration-lifetime.md`](../spec_topics/pi-integration-contract/tool-registration-lifetime.md).

**Adds.** Failing tests for the paired `V9f` implementation leaf.

**Tests.**
- `PIC-8`: a step-4 restore throw triggers one re-attempt, then `active-set-restore-failed` (E) + a `display:true` note, and propagates the original error.
- `PIC-19`: a step-1/step-2 snapshot/swap-install throw surfaces as `internal-error` with no restore owed.
- The callable set's visibility tracks the invocation.
- [tool-registration-lifetime.md — cache-hit schema byte-equality](../spec_topics/pi-integration-contract/tool-registration-lifetime.md#pic-44) (`PIC-44`): on a subsequent cache hit the runtime verifies byte-equality of the cached canonical-form schema bytes against the new entry's before reusing the registration; a byte-mismatch fires `loom/runtime/registration-cache-collision`, refuses to dedup, and registers under a disambiguated per-slug-counter name (`__loom_callee_<slug>_<n>__<post-rename-name>` / `__loom_respond_<slug>_<n>`, starting at `n = 2`).
- `extension-bootstrap-and-per-loom.md` §Per-loom registration `ToolDefinition.label` derivation: materialising `code-review.loom` yields `label: "Code-review"` (interior hyphen preserved, leading character capitalised), and the synthesised typed-query one-shot tool materialises `label: "Loom typed-query response"`.

**Deps.** `V9a`, `V5d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
