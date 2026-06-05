# Package and settings

## Package discovery

`pi.looms` and the `looms/` directory convention are owned by **this extension**, not by Pi (see the framing paragraph at the top of this file). The extension walks installed package roots itself; it does not delegate to Pi.

**Roots scanned (in priority order, project before global).** The extension enumerates each of the following directories and inspects each immediate child as an installed package; a root that does not exist is silently skipped (the project may have no `pi install`-managed packages, or the user may have no global packages):

1. `.pi/npm/` — project-scope npm packages installed via `pi install` (see `packages.md` §npm).
2. `.pi/git/<host>/<path>/` — project-scope git packages cloned via `pi install` (see `packages.md` §git).
3. `node_modules/` — project-local npm dependencies brought in via the project's own `package.json` rather than `pi install`.
4. `~/.pi/agent/npm/` — global npm packages installed via `pi install -g`. If `npmCommand` is configured (per `packages.md` §npm), the extension uses the resolved global root reported by that command instead of the literal path.
5. `~/.pi/agent/git/<host>/<path>/` — global git packages cloned via `pi install`.

Within each root, every immediate child whose `package.json` parses successfully is treated as a candidate package. The `pi-package` keyword in `package.json` is informational (used by the gallery, per `packages.md` §"Gallery Metadata") and is **not** required for loom discovery — packages installed before the convention existed, and packages that ship looms incidentally, are still scanned.

**Per-package resolution.** For each candidate package:

- For each root in the priority list above, the extension treats every immediate child directory whose name does **not** begin with `@` as a candidate package, and every immediate child directory whose name **does** begin with `@` as a scope directory whose own immediate children are candidate packages. Scope directories themselves are not packages and are not inspected for `package.json`. This matches npm's on-disk layout for scoped packages.
- <a id="disc-5"></a> **DISC-5.** If `package.json` has a `pi.looms` field, it MUST be a `string[]` of paths relative to the package root. The value shape mirrors `pi.extensions` / `pi.skills` / `pi.prompts` / `pi.themes` exactly (see `packages.md` §"Creating a Pi Package"): glob patterns are supported, leading `!` excludes matching paths, leading `+` force-includes an exact path, leading `-` force-excludes one. Each glob is resolved against the package root; the resulting matches contribute as follows — a match that is a `.loom` file registers that file directly; a match that is a directory is scanned non-recursively for `*.loom` children (matching the global non-recursion rule at the top of this file); a match that is any other file type is filtered out silently per match.
- If `package.json` has no `pi.looms` field, fall back to the conventional `looms/` directory at the package root and scan it non-recursively for `*.loom`.
- If `package.json` has both, the manifest entry wins; the `looms/` directory is **not** merged in. This matches the rule Pi uses for its own resources when a manifest is present (per `packages.md` §"Convention Directories": conventional directories apply only when no `pi` manifest is present).

**Edge cases.**

- A `pi.looms` value that is not a `string[]` (string, object, `null`, or an array containing non-string entries) is rejected with `loom/load/manifest-invalid` (severity `error`); no looms are loaded from that package and the source descriptor names the package (e.g. `` "package `foo` (pi.looms)" ``).
- A `pi.looms` entry whose resolved absolute path lies outside the package root (via `..` segments or an absolute path) is rejected per-entry with `loom/load/manifest-escapes-package` (severity `warning`); other entries continue to process.
- A glob pattern that resolves to zero files is silent (not an error), matching Pi's behaviour for `pi.extensions` etc.
- A package present in both a project root and a global root is deduplicated by package identity (per `packages.md` §"Scope and Deduplication": npm package name, git repository URL without ref, or resolved absolute path for local). The project copy wins and the global copy contributes nothing; this is package-level dedup, not a `loom/load/cross-source-shadow` event (which is reserved for slash-name shadowing across the five sources of the priority list above).
- Within the `looms/` fallback directory, subdirectories are ignored, matching the global non-recursion rule applied to `.pi/looms/` and `~/.pi/agent/looms/`.
- <a id="disc-6"></a> **DISC-6.** The package walk is bounded. Package counts and walk time vary by install — monorepos and global-package-heavy setups can exceed the default caps without the user having any other knob to relieve the pressure — so the bounds are operator-tunable rather than hardcoded. The defaults are *upper bounds*, not target performance: a healthy install completes the walk well under both caps and never trips `loom/load/discovery-slow`. The extension stops opening additional `package.json` files once it has either inspected `looms.scanPackagesMaxFiles` files (default `2000`) or spent `looms.scanPackagesTimeoutMs` milliseconds on the walk (default `2000`), whichever fires first; on either trip it emits a single `loom/load/discovery-slow` warning that names the root being scanned and the cap that fired. When both predicates are simultaneously true at the same cap-check site — constructible deterministically via the `FakeClock` seam — the file-count predicate is consulted before the elapsed-time predicate, so the warning's `cap` field is `looms.scanPackagesMaxFiles`. This tie-break applies only at the cap-check site itself; the separate per-read deadline / global timeout ordering rule stated below is unchanged. Elapsed time is read through the runtime's `Clock.now()` seam (see [Pi Integration Contract — `Clock` / `FakeClock` interface](../pi-integration-contract/host-interfaces-services.md#clock--fakeclock-interface)). The cap-check site is *before each new candidate-package read attempt*. To bound the time spent on any single read, each candidate `package.json` read is bounded by a deadline race scheduled through `Clock.setTimeout`, where `deadline = max(200, floor(looms.scanPackagesTimeoutMs / 10))` milliseconds (so the default `2000 ms` global cap yields a `200 ms` per-read deadline; raising the global cap automatically raises the per-read budget). The deadline timer is armed at the same site that initiates the read (after the `Clock.now()` cap-check fires for that candidate and before the next candidate's cap-check), so the `FakeClock` test seam can drive both the cap-check and the per-read timer in a deterministic order; the implementation construct used to await whichever resolves first is left to the implementer (e.g. an `AbortController` derived from `Clock.setTimeout`). The deadline is derived, not configurable in loom 1.0, and the timer MUST be scheduled through the injected `Clock.setTimeout` (not the global `setTimeout`) so the `FakeClock` test seam can drive it deterministically. On per-read timeout the in-flight read is abandoned (the file handle is dropped and GC'd; the read's eventual settlement MUST be silenced with `.catch(() => {})` and its result MUST NOT be re-routed back into the discovery pass), the package is treated as unreadable **for this scan only** (a subsequent reload re-attempts; the timeout outcome is not cached), a single `loom/load/package-read-timeout` warning is emitted naming the package and carrying `details.kind = "package-read-timeout"` (see [Diagnostics](../diagnostics.md)), and the walk continues with the next candidate. If the per-read deadline fires but the global `looms.scanPackagesTimeoutMs` would also have tripped on the next iteration, the per-read warning is emitted first and the global `loom/load/discovery-slow` warning still fires from the cap-check site at the next candidate (no suppression rule). The walk may also be disabled wholesale by setting `looms.scanPackages: false`, in which case no `node_modules/`, `.pi/npm/`, `.pi/git/`, `~/.pi/agent/npm/`, or `~/.pi/agent/git/` root is scanned and only Global, Project, Settings, and CLI sources contribute looms.

The two `Package pi.looms entry` and `Package looms/ directory` rows of the failure-modes table at the top of this file continue to apply: a `pi.looms` entry naming a path that does not exist is an error (the manifest authored it intentionally); a missing `looms/` fallback directory is silent (the package may simply ship none).

## Settings file reads

The loom extension owns its own keys in `settings.json` — Pi does not recognise the `loomPaths` array or `looms.binderModel`, does not surface them via `/settings` or schema validation, and does not expose them through `ExtensionContext`. The extension reads them itself from the same two files Pi uses for its own settings, mirroring Pi's precedence and merge rules.

> The **write-back key preservation** rule for the loom-owned `loomPaths` / `looms.*` keys is a host-behaviour presupposition about Pi's serialiser and now lives alongside the other Pi presuppositions at [Pi Integration Contract — Host prerequisites — Settings write-back key preservation](../pi-integration-contract/host-prerequisites.md#settings-write-back-preservation-presupposition).

**Files (in precedence order, project over global).** Both files are optional.

1. **Project:** `.pi/settings.json` (resolved relative to the factory-time working directory supplied by the [`FileSystem.cwd()` seam member](../pi-integration-contract/host-interfaces-services.md#pic-13); on a `resources_discover` event the project root is `event.cwd` instead, per [Registration steps](../pi-integration-contract/registration-steps.md) step 1).
2. **Global:** `~/.pi/agent/settings.json` (the leading `~` is expanded per [Home-directory expansion](./discovery-sources.md#home-directory-expansion)).

The extension reads both files directly through the injected `FileSystem` seam (the same seam used for `.loom` discovery; see [`FakeFileSystem` / `FileSystem` interface](../pi-integration-contract.md)). Pi itself is not consulted for these values.

**Failure modes.** Treated as `{}` (with the loaded value of the other file unaffected) and logged as a single load-time diagnostic per file:

- File missing or unreadable — `loom/load/settings-unreadable`.
- File present but not valid UTF-8 JSON — `loom/load/settings-invalid-json`.

None of these are fatal: the extension proceeds with whatever settings it could read, falling through to built-in defaults for keys neither file supplies.

<a id="disc-7"></a> **DISC-7.** **Merge semantics.** Project values override global values with **deep merge for nested objects, replace for arrays and scalars** — the same rule documented for Pi's own settings in `@earendil-works/pi-coding-agent/docs/settings.md`. Specifically:

- Object values are merged key-by-key; keys present in both are merged recursively, keys present only in one are kept as-is.
- Array values are replaced wholesale (the project array, if present, fully replaces the global array; entries are not concatenated or deduplicated).
- Scalar values (string, number, boolean, `null`) are replaced.

**Keys read.** loom 1.0 reads five loom-extension settings keys — `loomPaths` (a top-level `string[]` array) plus four scalar keys nested under the `looms` object namespace. The `loomPaths` array and the `looms` object are distinct top-level keys, so the on-disk JSON holds both without collision:

- `loomPaths` — a `string[]` of file or directory paths contributing additional looms (per the *Settings* row in the precedence table above; per-entry schema in [`loomPaths` entry schema](#loompaths-entry-schema) below).
- `looms.binderModel` — a string model identifier used as the fallback for the binder when `bind_model:` is omitted from frontmatter (see [Slash-Command Argument Binding](../binder.md)). The value is a free-form string, matched to a model per the [binder-model parse rule](../binder/binder-model-and-context.md#binder-model-parse-rule). **Required when any non-bypass loom is in scope** — a non-bypass loom whose `bind_model:` is also absent fails to load with `loom/load/binder-model-unresolved`. The registry-capability (strict structured-output) check runs at loom-load time per [Binder model](../binder.md); failure surfaces as `loom/load/binder-model-not-strict-capable`.
- `looms.scanPackages` — boolean, default `true`. When `false`, the package-discovery walk is skipped wholesale (see [Package discovery](#package-discovery) → "Edge cases"). The three `looms.scanPackages*` keys below are operator-tunable in loom 1.0 rather than hardcoded because package counts and walk time vary by install; the defaults are *upper bounds*, not target performance.
- `looms.scanPackagesMaxFiles` — integer, default `2000`. Upper bound on the number of `package.json` files the package-discovery walk opens per session before tripping `loom/load/discovery-slow` and aborting further package inspection.
- `looms.scanPackagesTimeoutMs` — integer, default `2000`. Upper bound in milliseconds on the wall-clock time spent in the package-discovery walk before tripping `loom/load/discovery-slow` and aborting further package inspection.

No other `looms.*` keys are recognised in loom 1.0; unknown keys under the `looms` namespace are ignored without diagnostic (forward-compatibility for later versions).

**Scalar-key validation.** A recognised `looms.*` scalar key whose JSON value fails its declared type or range is treated as **absent** — the key's documented absent-behaviour applies (the built-in default for `scanPackages`, `scanPackagesMaxFiles`, and `scanPackagesTimeoutMs`; the `bind_model:` resolution fallback for `binderModel`, which has no built-in default) — and the extension logs one `loom/load/settings-value-out-of-range` diagnostic (severity `error`, non-fatal) per offending key per file. This mirrors the frontmatter type/range rule `loom/load/frontmatter-value-out-of-range`. The per-key acceptance set, judged on the parsed JSON value:

- `looms.binderModel` — a non-empty string.
- `looms.scanPackages` — the JSON literal `true` or `false`.
- `looms.scanPackagesMaxFiles` — an integer ≥ 1.
- `looms.scanPackagesTimeoutMs` — an integer ≥ 1.

`null` is out of range for every key; integer-ness is judged on the parsed numeric value, not the lexical form (`2000` and `2000.0` are both accepted, `25.5` is not). The `loomPaths` array itself is not a scalar key; a non-string entry inside it is handled by `loom/load/settings-invalid-entry` (see [`loomPaths` entry schema](#loompaths-entry-schema)).

### `loomPaths` entry schema

The `loomPaths` array follows the same conventions Pi uses for its sibling resource arrays (`extensions`, `skills`, `prompts`, `themes`) — see the *Resources* section of `@earendil-works/pi-coding-agent/docs/settings.md`. Specifically:

- **Type.** `string[]`. Each entry is a file path or a directory path. Object-form entries are not accepted in loom 1.0; a non-string entry is rejected with `loom/load/settings-invalid-entry` (severity `error`) and the offending entry does not contribute looms — other entries in the array still process.
- **Resolution.** Paths in `~/.pi/agent/settings.json` resolve relative to `~/.pi/agent/`; paths in `.pi/settings.json` resolve relative to `.pi/`. `~` expands per [Home-directory expansion](./discovery-sources.md#home-directory-expansion). Absolute paths are accepted as-is.
- **Glob patterns and exclusions.** Glob patterns are supported. A leading `!` excludes paths matching the pattern; a leading `+` force-includes an exact path; a leading `-` force-excludes an exact path. Glob and prefix semantics mirror Pi's `extensions`/`skills`/`prompts`/`themes` arrays exactly — the `loomPaths` array is not a special snowflake.
- **Directory entries.** A directory entry expands to its non-recursive `*.loom` children, matching the global non-recursion rule stated at the top of this file. Subdirectories are not walked. `.warp` files inside a directory entry are ignored, consistent with the global rule that `.warp` is never discovered as a slash command.
- **File entries.** A file entry must have the `.loom` extension. A file entry whose path does not end in `.loom` is rejected with `loom/load/invalid-extension` (severity `error`); the file does not register and does not participate in collision detection. The same diagnostic fires for a glob entry that resolves to a non-`.loom` file (e.g. `foo*` matching `foo.md`); non-`.loom` matches are filtered out and reported per match.
- **Deduplication.** Entries that resolve to the same absolute path post-tilde-expansion and post-glob-expansion are deduplicated silently; this is not a collision.
- **Project vs. global.** Per the *Merge semantics* rule above, the project array fully replaces the global array — entries are not concatenated. Authors who want to extend rather than replace must repeat the global entries in the project file.

Path-existence and permission failures (missing path, unreadable path, wrong file/directory type) are covered by the *Settings `loomPaths` entry* row of the failure-modes table at the top of this file; the diagnostics there (`loom/load/missing-source`, `loom/load/unreadable-source`, `loom/load/wrong-type-source`) carry an `"settings entry index N"` source descriptor identifying the offending array index.

<a id="caching-and-reload"></a> **Caching and reload.** Both files are read once at extension load and cached. A file-watcher on each of the two paths invalidates the cache on change; reads following invalidation re-apply the merge. Watcher events are debounced over a `250 ms` window to absorb partial writes from editors-in-progress. The debounce is measured against the injected [`Clock`](../pi-integration-contract/host-interfaces-services.md#clock--fakeclock-interface) seam via `Clock.setTimeout` / `Clock.clearTimeout`: each fresh watcher event clears the pending handle and reschedules (drop-and-reschedule, holding only the most recent handle), so a burst of writes coalesces into a single reload that fires `250 ms` after the last event. A malformed intermediate state observed when the window finally fires is treated as a parse error per the failure-modes rule above and does not crash the extension.
