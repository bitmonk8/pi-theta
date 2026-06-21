# `V10b-T` — Package discovery (bounded walk) (tests)

**Spec.** [`../spec_topics/discovery/package-and-settings.md`](../spec_topics/discovery/package-and-settings.md), [`../spec_topics/discovery.md`](../spec_topics/discovery.md).

**Adds.** Failing tests for the paired `V10b` implementation leaf.

**Tests.**
- `DISC-5`: `pi.looms` must be `string[]`; minimatch and `!`/`+`/`-` apply in the fixed order; file/dir/other rules hold.
- `DISC-6`: the walk fires `loom/load/discovery-slow` at the `maxFiles`/`timeoutMs` bound and `package-read-timeout` at the per-read deadline; file-count is checked before time on a tie.
- `DISC-6` (settings-sourced bounds reach the walk): with merged settings `looms.scanPackages: false` the walk performs zero candidate `package.json` reads (the walk is skipped wholesale); a merged `looms.scanPackagesMaxFiles` value distinct from the `2000` default trips `loom/load/discovery-slow` at the operator value, not at `2000`; the same holds for a merged `looms.scanPackagesTimeoutMs` at its trip point — each bound flows into the walk from `V10c`'s merged settings, so an implementation that ignored the settings value and used the hardcoded `2000` constant fails.
- `DISC-6` (per-read deadline scales with the operator override): a merged `looms.scanPackagesTimeoutMs` distinct from `2000` driven through the `FakeClock` seam fires the per-read `package-read-timeout` at `max(200, floor(override / 10))`, not at the constant `200 ms` derived from the `2000` default; this reds the misreading that hardcodes a fixed `200 ms` per-read deadline.

**Deps.** `V10a`, `V10c`, `V8b`, `V8d`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
