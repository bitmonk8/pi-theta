# `V10b` — Package discovery (bounded walk)

**Spec.** [`../spec_topics/discovery/package-and-settings.md`](../spec_topics/discovery/package-and-settings.md), [`../spec_topics/discovery.md`](../spec_topics/discovery.md).

**Adds.** The `pi.looms` package source: `string[]` validation, minimatch with `!`/`+`/`-` ordering (plain → `!` → `+` → `-`), the file/dir/other rules, and the bounded walk (`maxFiles` 2000, `timeoutMs` 2000) with the per-read deadline `max(200, floor(t/10))` via `Clock.setTimeout`.

**Tests.**
- `DISC-5`: `pi.looms` must be `string[]`; minimatch and `!`/`+`/`-` apply in the fixed order; file/dir/other rules hold.
- `DISC-6`: the walk fires `loom/load/discovery-slow` at the `maxFiles`/`timeoutMs` bound and `package-read-timeout` at the per-read deadline; file-count is checked before time on a tie.

**Deps.** `V10b-T`, `V10a`, `V8b`

**Ships when.** `npm test` walks a package source within bounds and fires `discovery-slow`/`package-read-timeout` at the limits.
