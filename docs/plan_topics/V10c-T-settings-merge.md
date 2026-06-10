# `V10c-T` — Settings reads and merge (tests)

**Spec.** [`../spec_topics/discovery/package-and-settings.md`](../spec_topics/discovery/package-and-settings.md).

**Adds.** Failing tests for the paired `V10c` implementation leaf.

**Tests.**
- `DISC-7`: objects deep-merge, arrays/scalars are replaced, and project settings override global.
- A malformed settings file fires its `loom/load/*` code; the reload debounce coalesces rapid edits.

**Deps.** `V8b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
