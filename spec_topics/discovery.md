# Directory Convention

Loom files are discovered from the same locations as Pi prompt templates, just with a different leaf directory:

- Global: `~/.pi/agent/looms/*.loom`
- Project: `.pi/looms/*.loom`
- Packages: `looms/` directories or `pi.looms` entries in `package.json`
- Settings: `looms` array (in `~/.pi/agent/settings.json` or `.pi/settings.json`) with files or directories
- CLI: `--loom <path>` (repeatable, optional)

Discovery is **non-recursive** and matches only `*.loom`, mirroring Pi prompt-template behaviour. `.warp` library files are never discovered as slash commands regardless of where they live; they are reached only via `import` (with paths resolved relative to the importing file).

**Source priority (high to low).** When the same slash name resolves from multiple sources, the higher-priority source wins and a load-time *warning* is emitted naming both paths.

1. CLI flag (`--loom <path>`) — explicit, single-invocation override.
2. Settings (`looms` array, project `settings.json` overriding global).
3. Project (`.pi/looms/`).
4. Packages (`looms/` directories or `pi.looms` entries).
5. Global (`~/.pi/agent/looms/`).

**Case-insensitive filesystem collisions.** Within a single discovery source, two `*.loom` files whose paths differ only in case (e.g., `Plan.loom` and `plan.loom` in the same `looms/` directory) collide on case-insensitive filesystems (Windows, macOS default) but coexist on case-sensitive ones (most Linux). To make behaviour identical across both, the loader compares discovered paths case-insensitively *per source* and emits a load-time *warning* `loom/load/case-collision` naming both paths; the lexicographically-first path under case-sensitive byte comparison wins. Cross-source priority (the table above) still applies on top — the rule is intra-source only. Path comparison uses the normalised forward-slash form described under "Path literals" in [Lexical Structure](./lexical.md).

**Slash-name collisions across formats.** A loom and a Pi prompt template (`.md`) or subagent that resolve to the same slash command (e.g., `code-review.loom` and `code-review.md`) are a load-time *error* reported through Pi's diagnostics; neither is registered. Authors must rename one. Cross-format shadowing is not supported in V1; the rule is symmetric across `.loom`, `.md` prompts, and `.md` subagents.

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

- File missing or unreadable.
- File present but not valid UTF-8 JSON (parse error).

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
