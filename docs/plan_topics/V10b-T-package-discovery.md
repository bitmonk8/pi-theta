# `V10b-T` — Package discovery (bounded walk) (tests)

**Spec.** [`../spec_topics/discovery/package-and-settings.md`](../spec_topics/discovery/package-and-settings.md), [`../spec_topics/discovery.md`](../spec_topics/discovery.md).

**Adds.** Failing tests for the paired `V10b` implementation leaf.

**Tests.**
- `DISC-5`: `pi.looms` must be `string[]`; minimatch and `!`/`+`/`-` apply in the fixed order; file/dir/other rules hold.
- `DISC-6`: the walk fires `loom/load/discovery-slow` at the `maxFiles`/`timeoutMs` bound and `package-read-timeout` at the per-read deadline; file-count is checked before time on a tie.

**Deps.** `V10a`, `V8b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
