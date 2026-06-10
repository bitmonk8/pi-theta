# `V9f` — Tool-registration lifetime and visibility

**Spec.** [`../spec_topics/pi-integration-contract/tool-registration-lifetime.md`](../spec_topics/pi-integration-contract/tool-registration-lifetime.md).

**Adds.** The per-mode tool wiring (subagent `customTools` vs prompt-mode registration cache), the `Type.Unsafe` schema bridge, the snapshot/restore on the prompt path, the no-`unregisterTool` rule, and cache-collision disambiguation.

**Tests.**
- `PIC-8`: a step-4 restore throw triggers one re-attempt, then `active-set-restore-failed` (E) + a `display:true` note, and propagates the original error.
- `PIC-19`: a step-1/step-2 snapshot/swap-install throw surfaces as `internal-error` with no restore owed.
- The callable set's visibility tracks the invocation; `registration-cache-collision` disambiguates a slug clash.

**Deps.** `V9f-T`, `V9a`, `V5d`

**Ships when.** `npm test` asserts the restore-failure path (`PIC-8`) and the install-failure path (`PIC-19`).
