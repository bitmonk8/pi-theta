# `V10c` — Settings reads and merge

**Spec.** [`../spec_topics/discovery/package-and-settings.md`](../spec_topics/discovery/package-and-settings.md).

**Adds.** The settings-source reads (the five keys), the deep-merge precedence (project over global; deep-merge objects, replace arrays/scalars), and validation. The `Clock`-driven reload debounce and the settings-re-merge sub-arm of the **watcher-time reload failure-injection seam** are carved out to [`V10d`](./V10d-reload-debounce.md).

**Tests.**
- `DISC-7`: objects deep-merge, arrays/scalars are replaced, and project settings override global.
- `loom/load/settings-invalid-json`: a settings file present but not valid UTF-8 JSON fires the load-phase diagnostic.
- `loom/load/settings-unreadable`: a missing or unreadable settings file is treated as `{}`, the other file's loaded value is unaffected, and a single load-phase diagnostic fires.
- `loom/load/settings-value-out-of-range` (top-level shape): a `loomPaths` value that is not a JSON array, or a `looms` value that is not a JSON object, is treated as absent and fires one diagnostic per malformed top-level key per file (a malformed `looms` does not additionally log one per nested `looms.*` key).
- `loom/load/settings-value-out-of-range` (scalar keys): each of the four `looms.*` scalar keys (`binderModel`, `scanPackages`, `scanPackagesMaxFiles`, `scanPackagesTimeoutMs`) whose value fails its declared type/range is treated as absent and fires one diagnostic per offending key per file.
- `loom/load/settings-invalid-entry`: a non-string entry inside the `loomPaths` array is rejected per-entry — the offending entry contributes no looms while the other entries still process.

**Deps.** `V10c-T`, `V8b`

**Ships when.** `npm test` asserts the deep-merge precedence and the full settings-validation surface: the `loom/load/settings-unreadable` fall-through, top-level shape validation and the four-key scalar-key validation via `loom/load/settings-value-out-of-range`, the `loom/load/settings-invalid-json` malformed-JSON diagnostic, and per-entry `loom/load/settings-invalid-entry` rejection.
