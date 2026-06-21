# `V10b` — Package discovery (bounded walk)

**Spec.** [`../spec_topics/discovery/package-and-settings.md`](../spec_topics/discovery/package-and-settings.md), [`../spec_topics/discovery.md`](../spec_topics/discovery.md).

**Adds.** The `pi.looms` package source: `string[]` validation, minimatch with `!`/`+`/`-` ordering (plain → `!` → `+` → `-`), the file/dir/other rules, and the bounded walk (`maxFiles` 2000, `timeoutMs` 2000) with the per-read deadline `max(200, floor(looms.scanPackagesTimeoutMs / 10))` via `Clock.setTimeout` (default `2000 ms` global cap → `200 ms` per-read; a raised `looms.scanPackagesTimeoutMs` raises the per-read budget proportionally).

**Tests.**
- `DISC-5`: `pi.looms` must be `string[]`; minimatch and `!`/`+`/`-` apply in the fixed order; file/dir/other rules hold.
- `DISC-6`: the walk fires `loom/load/discovery-slow` at the `maxFiles`/`timeoutMs` bound and `package-read-timeout` at the per-read deadline; file-count is checked before time on a tie.
- `DISC-6` (settings-sourced bounds reach the walk): with merged settings `looms.scanPackages: false` the walk performs zero candidate `package.json` reads (the walk is skipped wholesale); a merged `looms.scanPackagesMaxFiles` value distinct from the `2000` default trips `loom/load/discovery-slow` at the operator value, not at `2000`; the same holds for a merged `looms.scanPackagesTimeoutMs` at its trip point — each bound flows into the walk from `V10c`'s merged settings, so an implementation that ignored the settings value and used the hardcoded `2000` constant fails.
- `DISC-6` (per-read deadline scales with the operator override): a merged `looms.scanPackagesTimeoutMs` distinct from `2000` driven through the `FakeClock` seam fires the per-read `package-read-timeout` at `max(200, floor(override / 10))`, not at the constant `200 ms` derived from the `2000` default; this reds the misreading that hardcodes a fixed `200 ms` per-read deadline.

**Deps.** `V10b-T`, `V10a`, `V10c`, `V8b`, `V8d`

**Ships when.** `npm test` walks a package source within bounds and fires `discovery-slow`/`package-read-timeout` at the limits.
