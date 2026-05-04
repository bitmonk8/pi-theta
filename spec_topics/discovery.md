# Directory Convention

Loom files are discovered from the same locations as Pi prompt templates, just with a different leaf directory:

- Global: `~/.pi/agent/looms/*.loom`
- Project: `.pi/looms/*.loom`
- Packages: `looms/` directories or `pi.looms` entries in `package.json`
- Settings: `looms` array (in `~/.pi/agent/settings.json` or `.pi/settings.json`) with files or directories
- CLI: `--loom <path>` (repeatable, optional)

Discovery is **non-recursive** and matches only `*.loom`, mirroring Pi prompt-template behaviour. `.warp` library files are never discovered as slash commands regardless of where they live; they are reached only via `import` (with paths resolved relative to the importing file).

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

- On Windows, "missing" and "permission denied" can both surface as `ENOENT` from `fs.readdir` depending on parent ACLs; treat any outcome that is neither a clean leaf-`ENOENT` nor a successful read as the unreadable-source case (warning), not as silent absence.
- A symlink loop or other traversal failure *inside* a discovery root that does exist is an unreadable-source warning, not silence — the silent-on-missing rule applies to the *root* itself not existing, not to failures encountered while walking a root that does.
- A `--loom` flag (or settings entry) pointing at a directory is allowed and treated like a per-source root; the wrong-type rule fires only when the path exists but is neither a `.loom` file nor a directory containing them.

**Case-insensitive filesystem collisions.** Within a single discovery source, two `*.loom` files whose paths differ only in case (e.g., `Plan.loom` and `plan.loom` in the same `looms/` directory) collide on case-insensitive filesystems (Windows, macOS default) but coexist on case-sensitive ones (most Linux). To make behaviour identical across both, the loader compares discovered paths case-insensitively *per source* and emits a load-time *warning* `loom/load/case-collision` naming both paths; the lexicographically-first path under case-sensitive byte comparison wins. Cross-source priority (the table above) still applies on top — the rule is intra-source only. Path comparison uses the normalised forward-slash form described under "Path literals" in [Lexical Structure](./lexical.md).

**Filename validity.** The slash name is the loom's filename stem taken verbatim — no case-folding, no whitespace trimming, no character substitution. The accepted stem matches the regex `^[a-z0-9][a-z0-9_-]*$`: lowercase ASCII letters and digits, optionally separated by `-` or `_`, starting with a letter or digit. Stems that do not match (e.g. `foo bar.loom`, `Foo.loom`, `foo!.loom`, `--help.loom`, `.foo.loom`, `café.loom`) are rejected at load time with `loom/load/invalid-slash-name` (severity `error`); the file does not register and does not participate in collision detection. Hint: ``slash names must be lowercase kebab/snake; rename the file (e.g. `code-review.loom`)``. The validator runs *before* parse, so an invalid name short-circuits frontmatter and body parsing — the file produces exactly one diagnostic. Because the accepted character class is lower-case-only, the case-sensitivity question (`Foo.loom` vs `foo.loom`) reduces to "both stems are rejected"; the cross-format collision check below is therefore well-defined regardless of whether the host filesystem is case-sensitive.

**Slash-name collisions across formats.** A loom and a Pi prompt template (`.md`) or subagent that resolve to the same slash command (e.g., `code-review.loom` and `code-review.md`) are `loom/load/cross-format-collision` reported through Pi's diagnostics; neither is registered. Authors must rename one. Cross-format shadowing is not supported in V1; the rule is symmetric across `.loom`, `.md` prompts, and `.md` subagents. The candidate slug for a `.md` prompt or subagent is derived under the same `^[a-z0-9][a-z0-9_-]*$` rule used for `.loom` stems; `.md` files whose stems do not conform are skipped for collision purposes (they remain Pi's problem to surface).

```
project/
├── looms/
│   ├── code-review.loom         # discovered → /code-review
│   ├── architecture-brief.loom  # discovered → /architecture-brief
│   ├── personas.warp            # library — importable, never a slash command
│   └── shared/
│       └── schemas.warp         # library in a subdirectory; importable via path
```

## Settings file reads

The loom extension owns its own keys in `settings.json` — Pi does not recognise the `looms` array or `looms.binderModel`, does not surface them via `/settings` or schema validation, and does not expose them through `ExtensionContext`. The extension reads them itself from the same two files Pi uses for its own settings, mirroring Pi's precedence and merge rules.

**Files (in precedence order, project over global).** Both files are optional.

1. **Project:** `.pi/settings.json` (resolved relative to the working directory).
2. **Global:** `~/.pi/agent/settings.json` (the leading `~` is expanded against the same home directory Pi uses — `$HOME` on POSIX, `%USERPROFILE%` on Windows).

The extension reads both files directly through the injected `FileSystem` seam (the same seam used for `.loom` discovery; see [`FakeFileSystem` / `FileSystem` interface](./pi-integration-contract.md)). Pi itself is not consulted for these values.

**Failure modes.** Treated as `{}` (with the loaded value of the other file unaffected) and logged as a single load-time diagnostic per file:

- File missing or unreadable — `loom/load/settings-unreadable`.
- File present but not valid UTF-8 JSON — `loom/load/settings-invalid-json`.

None of these are fatal: the extension proceeds with whatever settings it could read, falling through to built-in defaults for keys neither file supplies.

**Merge semantics.** Project values override global values with **deep merge for nested objects, replace for arrays and scalars** — the same rule documented for Pi's own settings in `@mariozechner/pi-coding-agent/docs/settings.md`. Specifically:

- Object values are merged key-by-key; keys present in both are merged recursively, keys present only in one are kept as-is.
- Array values are replaced wholesale (the project array, if present, fully replaces the global array; entries are not concatenated or deduplicated).
- Scalar values (string, number, boolean, `null`) are replaced.

**Keys read.** V1 reads two loom-extension keys:

- `looms` — an array of file or directory paths contributing additional looms (per the *Settings* row in the precedence table above; the array's per-entry shape is specified there).
- `looms.binderModel` — a string model identifier used as the fallback for the binder when `binder_model:` is omitted from frontmatter (see [Slash-Command Argument Binding](./binder.md)). The value is a free-form string; the registry-capability check happens at binder-invocation time, not at settings-read time.

No other `looms.*` keys are recognised in V1; unknown keys under the `looms` namespace are ignored without diagnostic (forward-compatibility for later versions).

**Caching and reload.** Both files are read once at extension load and cached. A file-watcher on each of the two paths invalidates the cache on change; reads following invalidation re-apply the merge. Watcher events are debounced to absorb partial writes from editors-in-progress; a malformed intermediate state is treated as a parse error per the failure-modes rule above and does not crash the extension.
