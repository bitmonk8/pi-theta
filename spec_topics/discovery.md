# Discovery

Loom files are discovered from five sources. The global, project, and package-conventional roots mirror the leaf-directory layout Pi uses for its own prompt templates, but the loom extension owns the discovery walk end-to-end: Pi has no `loomPaths` slot in `resources_discover` (the event carries `skillPaths`, `promptPaths`, `themePaths` only — see `@mariozechner/pi-coding-agent/docs/extensions.md` §`resources_discover`), and the `pi` manifest namespace recognises only `extensions`, `skills`, `prompts`, `themes`, `video`, and `image` (see `packages.md` §"Creating a Pi Package"). The package-manifest entry (`pi.looms`), the settings array (`looms`), and the CLI flag (`--loom`) are therefore conventions defined by **this extension**; Pi does not enumerate them and does not pass them to the extension. The loom extension reads them itself — settings via the injected `FileSystem` seam (see [Settings file reads](#settings-file-reads)), `pi.looms` and the conventional `looms/` directory by walking installed package roots (see [Package discovery](#package-discovery)), and `--loom` via a flag the extension registers itself in its factory (see [Pi Integration Contract](./pi-integration-contract.md)). The five sources are:

- Global: `~/.pi/agent/looms/*.loom`
- Project: `.pi/looms/*.loom`
- Packages: each installed pi-package's `pi.looms` manifest entry (preferred) or its conventional `looms/` directory (fallback) — see [Package discovery](#package-discovery).
- Settings: `looms` array (in `~/.pi/agent/settings.json` or `.pi/settings.json`) — `string[]` of file or directory paths; per-entry schema under [Settings file reads](#settings-file-reads).
- CLI: `--loom <paths>` (single flag; multiple paths joined with the OS path-list separator — `:` POSIX, `;` Windows; uses Node's `path.delimiter`). Each entry is a file or directory, resolved with the same rules as the settings `looms` array (see [`looms` entry schema](#looms-entry-schema) below). Windows authors must use `;` to avoid colliding with drive-letter colons (`C:\foo`). Pi has no built-in `--loom` flag; the loom extension registers it itself via `pi.registerFlag('loom', { type: 'string', description: '…' })` (see [Pi Integration Contract](./pi-integration-contract.md)) and reads it with `pi.getFlag('loom')` during the discovery walk.

Discovery is **non-recursive** and matches only `*.loom`, mirroring Pi prompt-template behaviour. `.warp` library files are never discovered as slash commands regardless of where they live; they are reached only via `import` (with paths resolved relative to the importing file).

<a id="file-extension-namespace"></a>

### File-extension namespace

The `.loom` and `.warp` file extensions are coined by this extension. At the time of writing, no Pi-shipped surface and no other `@mariozechner/pi-coding-agent` extension claims either extension; the framing paragraph above documents the parallel manifest-namespace check (`pi.extensions`, `pi.skills`, `pi.prompts`, `pi.themes`, `pi.video`, `pi.image` are the only Pi-recognised manifest keys, and `pi.looms` is therefore safe to coin).

Pi has no central file-extension registry: ownership is established de facto by each extension's discovery walker. Cross-extension collisions on `.loom` or `.warp` files — a hypothetical future extension that also walks `*.loom` — manifest through the existing slash-name collision rule below (see [Slash-name collisions at the same priority](#slash-name-collisions-at-the-same-priority)), not through a separate file-extension rule; there is no `loom/load/extension-claimed-by-other-extension` code in V1.

This check is a point-in-time observation, not a guarantee. If a future Pi-ecosystem package adopts the same extensions, this section is the place to document the resolution. The check has no REQ-ID, no per-leaf test obligation, and emits no diagnostic; it exists to record the namespace-clearance decision alongside the parallel `pi` manifest-namespace decision in the framing paragraph.

<a id="discovery-roots"></a>

**Discovery roots.** A *discovery root* is the directory each source contributes to the discovery walk. The set of active roots for a Pi session is the union of:

- The global root `~/.pi/agent/looms/` (when present).
- The project root `.pi/looms/` (when present).
- Each scanned package's contributing directory (the package's `looms/` directory, or each directory reached through a `pi.looms` glob).
- Each settings `looms` entry, resolved as follows: a directory entry contributes its own path; a file entry contributes its parent directory.
- Each path component of the `--loom` CLI flag (after splitting on `path.delimiter`), resolved by the same file-vs-directory rule as settings entries.

The term is referenced normatively by the path-restriction rule on `invoke` and `.loom` `tools:` entries (see [Invocation — Resolution](./invocation.md)): a resolved callee path must lie within at least one active root. Roots are computed once per discovery pass and cached for the lifetime of the resolved registry; hot-reload (per [Implementation Notes](./implementation-notes.md)) re-runs the computation.

<a id="home-directory-expansion"></a>

**Home-directory expansion.** Wherever the loom extension reads, interprets, or emits a path beginning with `~/`, the leading `~` MUST be expanded via the `homedir()` member of the injected `FileSystem` seam (see [Pi Integration Contract — `FakeFileSystem` / `FileSystem` interface](./pi-integration-contract.md)), whose production implementation calls Node's `os.homedir()` (resolving to `$HOME` on POSIX and `%USERPROFILE%` on Windows). This rule applies uniformly to: the global discovery root `~/.pi/agent/looms/`; the global package roots `~/.pi/agent/npm/` and `~/.pi/agent/git/<host>/<path>/`; the global settings file `~/.pi/agent/settings.json`; every `~`-prefixed entry in the settings `looms` array; and every `~`-prefixed component of the `--loom` CLI flag (after splitting on `path.delimiter`). The `~user` form (tilde followed by a username) is **not** honoured — only the bare `~` followed by `/` (or end-of-string). Implementations MUST NOT read `process.env.HOME` or `process.env.USERPROFILE` directly, and MUST NOT use any platform-conditional branch — the seam is the single source of truth so that test fakes can override it.

**Source priority (high to low).** When the same slash name resolves from multiple sources, the higher-priority source wins and `loom/load/cross-source-shadow` is emitted naming both paths.

1. CLI flag (`--loom <path>`) — explicit, single-invocation override.
2. Settings (`looms` array, project `settings.json` overriding global).
3. Project (`.pi/looms/`).
4. Packages (`looms/` directories or `pi.looms` entries).
5. Global (`~/.pi/agent/looms/`).

**Failure modes.** Each discovery source has a defined behaviour for a missing, unreadable, or wrong-type path. The asymmetry is deliberate: *conventional locations* (global directory, project directory, package `looms/` directories) silently tolerate absence — that is the normal case on a fresh install or in a project that ships no looms — while *explicit references* (`pi.looms` entries, settings entries, `--loom` flags) surface a missing path as an error, because the author named it and expects it to resolve.

| Source | Missing path | Unreadable path | Path is wrong type (file vs dir) |
|---|---|---|---|
| Global `~/.pi/agent/looms/` | silent | warning | warning |
| Project `.pi/looms/` | silent | warning | warning |
| Package `looms/` directory | silent (package may ship none) | warning | warning |
| Package `pi.looms` entry | error (manifest names a missing path) | warning | error |
| Settings `looms` entry | error (config names a missing path) | warning | error |
| CLI `--loom <path>` | error (explicit user intent) | error | error |

Three rules apply on top of the table:

1. **Discoverable `.loom` files that are themselves unreadable** (broken symlink, transient I/O error, EACCES on the file itself) are reported as `loom/load/unreadable` *warnings* regardless of source, and the loom is not registered. The scan continues; one bad file does not poison the rest.
2. **All warnings and errors above are emitted via the standard diagnostics channel** ([Diagnostics](./diagnostics.md)) using codes `loom/load/missing-source`, `loom/load/unreadable-source`, `loom/load/wrong-type-source`, and `loom/load/unreadable`. Each diagnostic carries the source descriptor in its `message` so the author can locate the offending configuration — e.g. `"settings entry index 2"`, `"--loom flag #1"`, `` "package `foo` (pi.looms[0])" ``, `` "package `foo` looms/ directory" ``, `"global looms directory"`, `"project .pi/looms/"`.
3. **Errors are fatal for the offending entry only**, not for the whole discovery pass: a bad `--loom` flag prevents *that* loom from registering and surfaces a `loom/load/missing-source` error, but other `--loom` flags and the other four sources still process to completion.

Implementation notes:

- A *clean leaf-`ENOENT`* is an `ENOENT` from `readdir` or `stat` on the candidate path whose ancestors all `lstat` successfully as directories the process can enter. Operationally: on `ENOENT`, walk the candidate path's ancestor chain root-first; if every ancestor `lstat`s `ok` and is a directory, classify the result as *missing* (silent for conventional roots, error for explicit references per the failure-modes table above); if any ancestor `lstat` returns `EACCES`, `EPERM`, `ENOTDIR`, or itself `ENOENT`, classify the result as *unreadable* and emit `loom/load/unreadable-source` (warning). The rule applies uniformly on POSIX and Windows — the implementation has no platform branch — and resolves the case where Windows surfaces both "leaf is genuinely missing" and "a parent ACL denies enumeration" as the same `ENOENT` from `fs.readdir`. Use `lstat` (not `stat`) as the ancestor probe so a broken symlink at an ancestor classifies as *unreadable* rather than silently traversing. The candidate path itself is checked with `readdir` or `stat` first; only failure triggers the ancestor walk, and successful enumeration short-circuits. The `FileSystem` seam exposes both `readdir` and `lstat` (see [Pi Integration Contract — `FakeFileSystem` / `FileSystem` interface](./pi-integration-contract.md)) so this rule is callable through the injected seam in tests.
- A symlink loop or other traversal failure *inside* a discovery root that does exist is an unreadable-source warning, not silence — the silent-on-missing rule applies to the *root* itself not existing, not to failures encountered while walking a root that does.
- A `--loom` flag (or settings entry) pointing at a directory is allowed and treated like a per-source root; the wrong-type rule fires only when the path exists but is neither a `.loom` file nor a directory containing them.

**Case-insensitive filesystem collisions.** Within a single discovery source, two `*.loom` files whose paths differ only in case (e.g., `Plan.loom` and `plan.loom` in the same `looms/` directory) collide on case-insensitive filesystems (Windows, macOS default) but coexist on case-sensitive ones (most Linux). To make behaviour identical across both, the loader compares discovered paths case-insensitively *per source* and emits a load-time *warning* `loom/load/case-collision` naming both paths; the lexicographically-first path under case-sensitive byte comparison wins. Cross-source priority (the table above) still applies on top — the rule is intra-source only. Path comparison uses the normalised forward-slash form described under "Path literals" in [Lexical Structure](./lexical.md).

**Filename validity.** The slash name is the loom's filename stem taken verbatim — no case-folding, no whitespace trimming, no character substitution. The accepted stem matches the regex `^[a-z0-9][a-z0-9_-]*$`: lowercase ASCII letters and digits, optionally separated by `-` or `_`, starting with a letter or digit. Stems that do not match (e.g. `foo bar.loom`, `Foo.loom`, `foo!.loom`, `--help.loom`, `.foo.loom`, `café.loom`) are rejected at load time with `loom/load/invalid-slash-name` (severity `error`); the file does not register and does not participate in collision detection. Hint: ``slash names must be lowercase kebab/snake; rename the file (e.g. `code-review.loom`)``. The validator runs *before* parse, so an invalid name short-circuits frontmatter and body parsing — the file produces exactly one diagnostic. Because the accepted character class is lower-case-only, the case-sensitivity question (`Foo.loom` vs `foo.loom`) reduces to "both stems are rejected"; the cross-format collision check below is therefore well-defined regardless of whether the host filesystem is case-sensitive.

**Slash-name collisions at the same priority.** When two or more candidates at the same priority level derive the same slash name — whether two `.loom` files (e.g. two packages each shipping `code-review.loom`, two settings entries that both expand to a `code-review.loom`, or two `--loom` components that resolve to files whose stems hyphen-normalise to the same wire name) or a `.loom` and a Pi-owned `.md` prompt or `.md` skill or another extension's command at the cross-priority comparison the `session_start` handler performs — **none of the colliding entries register**, and the loom extension emits `loom/load/cross-format-collision` through the diagnostics channel defined in [Diagnostics](./diagnostics.md) naming **every** colliding path (not just two: three packages each shipping `lint.loom` produces a single error listing all three paths). The rule is symmetric across all source types and across all file formats. For the cross-format slice (`.loom` vs Pi-owned `.md`), the Pi-owned entry survives — the loom extension cannot unregister Pi-owned templates or another extension's commands; only the colliding loom(s) drop.

Detection runs on the **final derived name** (after `pi.looms` mapping, `as` rename, and basename hyphen-normalisation), not the source filename. Settings entries that resolve to the same absolute path post-tilde-expansion are deduplicated silently before collision detection runs (this is package-level dedup, not a collision). The same dedup applies across `--loom` path components and inside the package walker.

When the loom extension discovers, on its `session_start` handler, that a candidate loom resolves to the same slash name as an already-registered Pi prompt template, skill, or extension command, the loom extension refuses to register the colliding loom and emits the same diagnostic naming both the `.loom` path and the colliding entry. The Pi-owned `.md` prompt template or `.md` skill (or the other extension's command) remains registered and continues to function — the loom loses, asymmetrically. Authors who want the loom to win must rename one of the two files. Cross-format shadowing in either direction is not supported in V1; the rule is symmetric in *which formats it spans* (`.md` prompts, `.md` skills, and other extensions' commands all preempt a same-named loom) but asymmetric in *which side wins* (the loom never preempts a non-loom registration, because the loom extension cannot unregister Pi-owned templates or another extension's commands — the registration timeline in [Pi Integration Contract — Extension entry point](./pi-integration-contract.md) explains why). The candidate slug for a `.md` prompt or skill is derived under the same `^[a-z0-9][a-z0-9_-]*$` rule used for `.loom` stems; `.md` files whose stems do not conform are skipped for collision purposes (they remain Pi's problem to surface). Loom-vs-loom same-name collisions across discovery sources are governed by the source-priority rule in the table above and are unaffected by this paragraph. If a colliding `.md` prompt template appears *after* a loom has already been registered (e.g. via a settings reload, a Pi extension activation, or `ctx.reload()` re-running prompt-template discovery), the next `session_start` cycle re-evaluates and de-registers the previously-registered loom, emitting the same diagnostic.

```
project/                          # project-source layout
└── .pi/
    └── looms/
        ├── code-review.loom         # discovered → /code-review
        ├── architecture-brief.loom  # discovered → /architecture-brief
        ├── personas.warp            # library — importable, never a slash command
        └── shared/
            └── schemas.warp         # library in a subdirectory; importable via path
```

```
my-package/                       # package-source layout
└── looms/
    ├── code-review.loom         # discovered → /code-review
    └── shared/
        └── schemas.warp         # library — importable, never a slash command
```

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
- If `package.json` has a `pi.looms` field, it MUST be a `string[]` of paths relative to the package root. The value shape mirrors `pi.extensions` / `pi.skills` / `pi.prompts` / `pi.themes` exactly (see `packages.md` §"Creating a Pi Package"): glob patterns are supported, leading `!` excludes matching paths, leading `+` force-includes an exact path, leading `-` force-excludes one. Each glob is resolved against the package root; the resulting matches contribute as follows — a match that is a `.loom` file registers that file directly; a match that is a directory is scanned non-recursively for `*.loom` children (matching the global non-recursion rule at the top of this file); a match that is any other file type is filtered out silently per match.
- If `package.json` has no `pi.looms` field, fall back to the conventional `looms/` directory at the package root and scan it non-recursively for `*.loom`.
- If `package.json` has both, the manifest entry wins; the `looms/` directory is **not** merged in. This matches the rule Pi uses for its own resources when a manifest is present (per `packages.md` §"Convention Directories": conventional directories apply only when no `pi` manifest is present).

**Edge cases.**

- A `pi.looms` value that is not a `string[]` (string, object, `null`, or an array containing non-string entries) is rejected with `loom/load/manifest-invalid` (severity `error`); no looms are loaded from that package and the source descriptor names the package (e.g. `` "package `foo` (pi.looms)" ``).
- A `pi.looms` entry whose resolved absolute path lies outside the package root (via `..` segments or an absolute path) is rejected per-entry with `loom/load/manifest-escapes-package` (severity `warning`); other entries continue to process.
- A glob pattern that resolves to zero files is silent (not an error), matching Pi's behaviour for `pi.extensions` etc.
- A package present in both a project root and a global root is deduplicated by package identity (per `packages.md` §"Scope and Deduplication": npm package name, git repository URL without ref, or resolved absolute path for local). The project copy wins and the global copy contributes nothing; this is package-level dedup, not a `loom/load/cross-source-shadow` event (which is reserved for slash-name shadowing across the five sources of the priority list above).
- Within the `looms/` fallback directory, subdirectories are ignored, matching the global non-recursion rule applied to `.pi/looms/` and `~/.pi/agent/looms/`.
- The package walk is bounded. The extension stops opening additional `package.json` files once it has either inspected `looms.scanPackagesMaxFiles` files (default `2000`) or spent `looms.scanPackagesTimeoutMs` milliseconds on the walk (default `2000`), whichever fires first; on either trip it emits a single `loom/load/discovery-slow` warning that names the root being scanned and the cap that fired. Elapsed time is read through the runtime's `Clock.now()` seam (see [Pi Integration Contract — `Clock` / `FakeClock` interface](./pi-integration-contract.md#clock--fakeclock-interface)). The cap-check site is *before each new candidate-package read attempt*; a single very slow read is not aborted mid-flight (deferred hardening). The walk may also be disabled wholesale by setting `looms.scanPackages: false`, in which case no `node_modules/`, `.pi/npm/`, `.pi/git/`, `~/.pi/agent/npm/`, or `~/.pi/agent/git/` root is scanned and only Global, Project, Settings, and CLI sources contribute looms.

The two `Package pi.looms entry` and `Package looms/ directory` rows of the failure-modes table at the top of this file continue to apply: a `pi.looms` entry naming a path that does not exist is an error (the manifest authored it intentionally); a missing `looms/` fallback directory is silent (the package may simply ship none).

## Settings file reads

The loom extension owns its own keys in `settings.json` — Pi does not recognise the `looms` array or `looms.binderModel`, does not surface them via `/settings` or schema validation, and does not expose them through `ExtensionContext`. The extension reads them itself from the same two files Pi uses for its own settings, mirroring Pi's precedence and merge rules.

**Files (in precedence order, project over global).** Both files are optional.

1. **Project:** `.pi/settings.json` (resolved relative to the working directory).
2. **Global:** `~/.pi/agent/settings.json` (the leading `~` is expanded per [Home-directory expansion](#home-directory-expansion)).

The extension reads both files directly through the injected `FileSystem` seam (the same seam used for `.loom` discovery; see [`FakeFileSystem` / `FileSystem` interface](./pi-integration-contract.md)). Pi itself is not consulted for these values.

**Failure modes.** Treated as `{}` (with the loaded value of the other file unaffected) and logged as a single load-time diagnostic per file:

- File missing or unreadable — `loom/load/settings-unreadable`.
- File present but not valid UTF-8 JSON — `loom/load/settings-invalid-json`.

None of these are fatal: the extension proceeds with whatever settings it could read, falling through to built-in defaults for keys neither file supplies.

**Merge semantics.** Project values override global values with **deep merge for nested objects, replace for arrays and scalars** — the same rule documented for Pi's own settings in `@mariozechner/pi-coding-agent/docs/settings.md`. Specifically:

- Object values are merged key-by-key; keys present in both are merged recursively, keys present only in one are kept as-is.
- Array values are replaced wholesale (the project array, if present, fully replaces the global array; entries are not concatenated or deduplicated).
- Scalar values (string, number, boolean, `null`) are replaced.

**Keys read.** V1 reads five loom-extension keys:

- `looms` — a `string[]` of file or directory paths contributing additional looms (per the *Settings* row in the precedence table above; per-entry schema in [`looms` entry schema](#looms-entry-schema) below).
- `looms.binderModel` — a string model identifier used as the fallback for the binder when `bind_model:` is omitted from frontmatter (see [Slash-Command Argument Binding](./binder.md)). The value is a free-form string. **Required when any non-bypass loom is in scope** — a non-bypass loom whose `bind_model:` is also absent fails to load with `loom/load/binder-model-unresolved`. The registry-capability (strict structured-output) check runs at loom-load time per [Binder model](./binder.md); failure surfaces as `loom/load/binder-model-not-strict-capable`.
- `looms.scanPackages` — boolean, default `true`. When `false`, the package-discovery walk is skipped wholesale (see [Package discovery](#package-discovery) → "Edge cases").
- `looms.scanPackagesMaxFiles` — integer, default `2000`. Upper bound on the number of `package.json` files the package-discovery walk opens per session before tripping `loom/load/discovery-slow` and aborting further package inspection.
- `looms.scanPackagesTimeoutMs` — integer, default `2000`. Upper bound in milliseconds on the wall-clock time spent in the package-discovery walk before tripping `loom/load/discovery-slow` and aborting further package inspection.

No other `looms.*` keys are recognised in V1; unknown keys under the `looms` namespace are ignored without diagnostic (forward-compatibility for later versions).

### `looms` entry schema

The `looms` array follows the same conventions Pi uses for its sibling resource arrays (`extensions`, `skills`, `prompts`, `themes`) — see the *Resources* section of `@mariozechner/pi-coding-agent/docs/settings.md`. Specifically:

- **Type.** `string[]`. Each entry is a file path or a directory path. Object-form entries are not accepted in V1; a non-string entry is rejected with `loom/load/settings-invalid-entry` (severity `error`) and the offending entry does not contribute looms — other entries in the array still process.
- **Resolution.** Paths in `~/.pi/agent/settings.json` resolve relative to `~/.pi/agent/`; paths in `.pi/settings.json` resolve relative to `.pi/`. `~` expands per [Home-directory expansion](#home-directory-expansion). Absolute paths are accepted as-is.
- **Glob patterns and exclusions.** Glob patterns are supported. A leading `!` excludes paths matching the pattern; a leading `+` force-includes an exact path; a leading `-` force-excludes an exact path. Glob and prefix semantics mirror Pi's `extensions`/`skills`/`prompts`/`themes` arrays exactly — the `looms` array is not a special snowflake.
- **Directory entries.** A directory entry expands to its non-recursive `*.loom` children, matching the global non-recursion rule stated at the top of this file. Subdirectories are not walked. `.warp` files inside a directory entry are ignored, consistent with the global rule that `.warp` is never discovered as a slash command.
- **File entries.** A file entry must have the `.loom` extension. A file entry whose path does not end in `.loom` is rejected with `loom/load/invalid-extension` (severity `error`); the file does not register and does not participate in collision detection. The same diagnostic fires for a glob entry that resolves to a non-`.loom` file (e.g. `foo*` matching `foo.md`); non-`.loom` matches are filtered out and reported per match.
- **Deduplication.** Entries that resolve to the same absolute path post-tilde-expansion and post-glob-expansion are deduplicated silently; this is not a collision.
- **Project vs. global.** Per the *Merge semantics* rule above, the project array fully replaces the global array — entries are not concatenated. Authors who want to extend rather than replace must repeat the global entries in the project file.

Path-existence and permission failures (missing path, unreadable path, wrong file/directory type) are covered by the *Settings `looms` entry* row of the failure-modes table at the top of this file; the diagnostics there (`loom/load/missing-source`, `loom/load/unreadable-source`, `loom/load/wrong-type-source`) carry an `"settings entry index N"` source descriptor identifying the offending array index.

**Caching and reload.** Both files are read once at extension load and cached. A file-watcher on each of the two paths invalidates the cache on change; reads following invalidation re-apply the merge. Watcher events are debounced to absorb partial writes from editors-in-progress; a malformed intermediate state is treated as a parse error per the failure-modes rule above and does not crash the extension.
