# `V10c-T` — Settings reads and merge (tests)

**Spec.** [`../spec_topics/discovery/package-and-settings.md`](../spec_topics/discovery/package-and-settings.md).

**Adds.** Failing tests for the paired `V10c` implementation leaf.

**Tests.**
- `DISC-7`: objects deep-merge, arrays/scalars are replaced, and project settings override global.
- `loom/load/settings-invalid-json`: a settings file present but not valid UTF-8 JSON fires the load-phase diagnostic.
- `loom/load/settings-unreadable`: a missing or unreadable settings file is treated as `{}`, the other file's loaded value is unaffected, and a single load-phase diagnostic fires.
- `loom/load/settings-value-out-of-range` (top-level shape): a `loomPaths` value that is not a JSON array, or a `looms` value that is not a JSON object, is treated as absent and fires one diagnostic per malformed top-level key per file (a malformed `looms` does not additionally log one per nested `looms.*` key).
- `loom/load/settings-value-out-of-range` (scalar keys): each of the four `looms.*` scalar keys (`binderModel`, `scanPackages`, `scanPackagesMaxFiles`, `scanPackagesTimeoutMs`) whose value fails its declared type/range is treated as absent and fires one diagnostic per offending key per file.
- `loom/load/settings-invalid-entry`: a non-string entry inside the `loomPaths` array is rejected per-entry — the offending entry contributes no looms while the other entries still process.

**Deps.** `V8b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
