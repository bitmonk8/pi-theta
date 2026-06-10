# `V9f-T` — Tool-registration lifetime and visibility (tests)

**Spec.** [`../spec_topics/pi-integration-contract/tool-registration-lifetime.md`](../spec_topics/pi-integration-contract/tool-registration-lifetime.md).

**Adds.** Failing tests for the paired `V9f` implementation leaf.

**Tests.**
- `PIC-8`: a step-4 restore throw triggers one re-attempt, then `active-set-restore-failed` (E) + a `display:true` note, and propagates the original error.
- `PIC-19`: a step-1/step-2 snapshot/swap-install throw surfaces as `internal-error` with no restore owed.
- The callable set's visibility tracks the invocation; `registration-cache-collision` disambiguates a slug clash.

**Deps.** `V9a`, `V5d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
