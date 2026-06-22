# Discovery sources

- Global: `~/.pi/agent/looms/*.loom`
- Project: `.pi/looms/*.loom`
- Packages: each installed pi-package's `pi.looms` manifest entry (preferred) or its conventional `looms/` directory (fallback) — see [Package discovery](./package-and-settings.md#package-discovery).
- Settings: `loomPaths` array (in `~/.pi/agent/settings.json` or `.pi/settings.json`) — `string[]` of file or directory paths; per-entry schema under [Settings file reads](./package-and-settings.md#settings-file-reads).
- CLI: `--loom <paths>` (single flag; multiple paths joined with the OS path-list separator — `:` POSIX, `;` Windows; uses Node's `path.delimiter`). Each entry is a file or directory, resolved with the same rules as the settings `loomPaths` array (see [`loomPaths` entry schema](./package-and-settings.md#loompaths-entry-schema) below). Windows authors must use `;` to avoid colliding with drive-letter colons (`C:\foo`). Pi has no built-in `--loom` flag; the loom extension registers it itself via `pi.registerFlag('loom', { type: 'string', description: '…' })` (see [Pi Integration Contract](../pi-integration-contract.md)) and reads it with `pi.getFlag('loom')` during the discovery walk.

Discovery is **non-recursive** and matches only `*.loom`, mirroring Pi prompt-template behaviour. The `*.loom` glob is **byte-exact lowercase** per [Lexical — Extension matching](../lexical.md#extension-matching): a file named `Plan.LOOM` does not match the discovery glob on any platform, even on case-insensitive filesystems where the OS would consider the name equivalent to `plan.loom`. `.warp` library files are never discovered as slash commands regardless of where they live; they are reached only via `import` (with paths resolved relative to the importing file).

<a id="file-extension-namespace"></a>

### File-extension namespace

The `.loom` and `.warp` file extensions are coined by this extension. Under the [loom 1.0 Pi-SDK pin range](../pi-integration-contract/host-prerequisites.md#pi-sdk-pin), no Pi-shipped surface and no other `@earendil-works/pi-coding-agent` extension claims either extension; the framing paragraph above documents the parallel manifest-namespace check (`pi.extensions`, `pi.skills`, `pi.prompts`, `pi.themes`, `pi.video`, `pi.image` are the only Pi-recognised manifest keys, and `pi.looms` is therefore safe to coin).

<a id="loom-flag-namespace"></a>The `--loom` CLI flag name is likewise coined by this extension; the loom extension registers it via `pi.registerFlag('loom', …)` (see [Registration steps](../pi-integration-contract/registration-steps.md) step 1). Under the [loom 1.0 Pi-SDK pin range](../pi-integration-contract/host-prerequisites.md#pi-sdk-pin), `pi.registerFlag('loom', …)` does not throw on a flag-name overlap: registration is first-load-wins, so a later sibling extension that also registers a `'loom'` flag is silently shadowed with no diagnostic, and loom's own `pi.getFlag('loom')` read still observes loom's registration. There is no `loom/load/...` code for flag-name collision in loom 1.0.

Pi has no central file-extension registry: ownership is established de facto by each extension's discovery walker. Cross-extension collisions on `.loom` or `.warp` files — a hypothetical future extension that also walks `*.loom` — manifest through the existing slash-name collision rule below (see [Slash-name collision rules](#disc-4)), not through a separate file-extension rule; there is no `loom/load/extension-claimed-by-other-extension` code in loom 1.0.

This check is a point-in-time observation, not a guarantee. The check has no REQ-ID, no per-leaf test obligation, and emits no diagnostic; it exists to record the namespace-clearance decision alongside the parallel `pi` manifest-namespace decision in the framing paragraph.

<a id="discovery-roots"></a>

**Discovery roots.** A *discovery root* is the directory each source contributes to the discovery walk. The set of active roots for a Pi session is the union of:

- The global root `~/.pi/agent/looms/` (when present).
- The project root `.pi/looms/` (when present).
- Each scanned package's contributing directory (the package's `looms/` directory, or each directory reached through a `pi.looms` glob).
- Each settings `loomPaths` entry, resolved as follows: a directory entry contributes its own path; a file entry contributes its parent directory.
- Each path component of the `--loom` CLI flag (after splitting on `path.delimiter`), resolved by the same file-vs-directory rule as settings entries.

The term is referenced normatively by the path-restriction rule on `invoke` and `.loom` `tools:` entries (see [Invocation — Resolution](../invocation.md)): a resolved callee path must lie within at least one active root. Roots are computed once per discovery pass and cached for the lifetime of the resolved registry; hot-reload (per [Implementation Notes](../implementation-notes.md)) re-runs the computation.

<a id="home-directory-expansion"></a>

<a id="disc-1"></a> **DISC-1.** **Home-directory expansion.** Wherever the loom extension reads, interprets, or emits a path beginning with `~/`, the leading `~` MUST be expanded via the `homedir()` member of the injected `FileSystem` seam (see [Pi Integration Contract — `FakeFileSystem` / `FileSystem` interface](../pi-integration-contract.md)), whose production implementation calls Node's `os.homedir()` (resolving to `$HOME` on POSIX and `%USERPROFILE%` on Windows). This rule applies uniformly to: the global discovery root `~/.pi/agent/looms/`; the global package roots `~/.pi/agent/npm/` and `~/.pi/agent/git/<host>/<path>/`; the global settings file `~/.pi/agent/settings.json`; every `~`-prefixed entry in the settings `loomPaths` array; and every `~`-prefixed component of the `--loom` CLI flag (after splitting on `path.delimiter`). The `~user` form (tilde followed by a username) is **not** honoured — only the bare `~` followed by `/` (or end-of-string). Implementations MUST NOT read `process.env.HOME` or `process.env.USERPROFILE` directly, and MUST NOT use any platform-conditional branch — the seam is the single source of truth so that test fakes can override it.

**Source priority (high to low).** When the same slash name resolves from multiple sources, the higher-priority source wins and `loom/load/cross-source-shadow` is emitted naming both paths. Both paths are carried in the diagnostic's rendered `message` (per the [`loom/load/cross-source-shadow`](../diagnostics/code-registry-load.md) row's `'<higher>' wins over '<lower>'` template); no structured `details` payload is emitted for this code.

1. CLI flag (`--loom <path>`) — explicit, single-invocation override.
2. Settings (`loomPaths` array, project `settings.json` overriding global).
3. Project (`.pi/looms/`).
4. Packages (`looms/` directories or `pi.looms` entries).
5. Global (`~/.pi/agent/looms/`).

<a id="disc-2"></a> **DISC-2.** **Failure modes.** Each discovery source has a defined behaviour for a missing, unreadable, or wrong-type path. The asymmetry is deliberate: *conventional locations* (global directory, project directory, package `looms/` directories) silently tolerate absence — that is the normal case on a fresh install or in a project that ships no looms — while *explicit references* (`pi.looms` entries, settings entries, `--loom` flags) surface a missing path as an error, because the author named it and expects it to resolve.

| Source | Missing path | Unreadable path | Path is wrong type (file vs dir) |
|---|---|---|---|
| Global `~/.pi/agent/looms/` | silent | warning | warning |
| Project `.pi/looms/` | silent | warning | warning |
| Package `looms/` directory | silent (package may ship none) | warning | warning |
| Package `pi.looms` entry | error (manifest names a missing path) | warning | error |
| Settings `loomPaths` entry | error (config names a missing path) | warning | error |
| CLI `--loom <path>` | error (explicit user intent) | error | error |

Three rules apply on top of the table:

1. **Discoverable `.loom` files that are themselves unreadable** (broken symlink, transient I/O error, EACCES on the file itself) are reported as `loom/load/unreadable` *warnings* regardless of source, and the loom is not registered. The scan continues; one bad file does not poison the rest.
2. **All warnings and errors above are emitted via the standard diagnostics channel** ([Diagnostics](../diagnostics.md)) using codes `loom/load/missing-source`, `loom/load/unreadable-source`, `loom/load/wrong-type-source`, and `loom/load/unreadable`. Each diagnostic carries the source descriptor in its `message` so the author can locate the offending configuration — e.g. `"settings entry index 2"`, `"--loom flag #1"`, `` "package `foo` (pi.looms[0])" ``, `` "package `foo` looms/ directory" ``, `"global looms directory"`, `"project .pi/looms/"`.
3. **Errors are fatal for the offending entry only**, not for the whole discovery pass: a bad `--loom` flag prevents *that* loom from registering and surfaces a `loom/load/missing-source` error, but other `--loom` flags and the other four sources still process to completion.

Implementation notes:

- A *clean leaf-`ENOENT`* is an `ENOENT` from `readdir` or `stat` on the candidate path whose ancestors all `lstat` successfully as directories the process can enter. Operationally: on `ENOENT`, walk the candidate path's ancestor chain root-first; if every ancestor `lstat`s `ok` and is a directory, classify the result as *missing* (silent for conventional roots, error for explicit references per the failure-modes table above); if any ancestor `lstat` returns `EACCES`, `EPERM`, `ENOTDIR`, or itself `ENOENT`, classify the result as *unreadable* and emit `loom/load/unreadable-source` (warning). The rule applies uniformly on POSIX and Windows — the implementation has no platform branch — and resolves the case where Windows surfaces both "leaf is genuinely missing" and "a parent ACL denies enumeration" as the same `ENOENT` from `fs.readdir`. Use `lstat` (not `stat`) as the ancestor probe so a broken symlink at an ancestor classifies as *unreadable* rather than silently traversing. The candidate path itself is checked with `readdir` or `stat` first; only failure triggers the ancestor walk, and successful enumeration short-circuits. The `readdir`/`lstat` rejections these predicates branch on carry Node-style `.code` values, and the `FileSystem` seam's `FakeFileSystem` mirror reproduces those rejections so this ancestor walk is callable through the injected seam in tests — both load-bearing facts are established by [PIC-13](../pi-integration-contract/host-interfaces-services.md#pic-13).
- A symlink loop or other traversal failure *inside* a discovery root that does exist is an unreadable-source warning, not silence — the silent-on-missing rule applies to the *root* itself not existing, not to failures encountered while walking a root that does.
- A `--loom` flag (or settings entry) pointing at a directory is allowed and treated like a per-source root, and a directory entry is a valid path regardless of its contents: an empty directory — or one whose entries are all non-`.loom` files — enumerates zero looms successfully and emits no diagnostic. The wrong-type rule fires only when the path resolves to something that is neither a regular `.loom` file nor a directory.

<a id="disc-3"></a> **DISC-3.** **Case-insensitive filesystem collisions.** Within a single discovery source, two `*.loom` files whose paths differ only in case (e.g., `Plan.loom` and `plan.loom` in the same `looms/` directory) collide on case-insensitive filesystems (Windows, macOS default) but coexist on case-sensitive ones (most Linux). To make behaviour identical across both, the loader compares discovered paths case-insensitively *per source* and emits a load-time *warning* `loom/load/case-collision` naming both paths; the lexicographically-first path under case-sensitive byte comparison wins. Cross-source priority (the table above) still applies on top — the rule is intra-source only. Path comparison uses the normalised forward-slash form described under "Path literals" in [Lexical Structure](../lexical.md).

**Non-canonical extension case.** Because the discovery glob is byte-exact lowercase per [Lexical — Extension matching](../lexical.md#extension-matching), files saved with a non-canonical extension case (`Plan.LOOM`, `helper.Loom`, `personas.WARP`) are silently invisible to discovery on every platform. To surface this otherwise-undetectable authoring mistake, the loader emits a load-time *warning* `loom/load/non-canonical-extension` per source whenever it encounters, in a directory it is walking for discovery purposes, a file whose stem matches the slash-name regex `^[a-z0-9][a-z0-9_-]*$` and whose extension is a case-variant of `.loom` or `.warp` other than the lowercase canonical form. Files with stems that would not be valid slash names (`.config.LOOM`, `notes.txt.LOOM`, `Foo.LOOM`) stay silent to avoid noise on incidental files. The warning is **per-source** (like `loom/load/case-collision`); deduplication uses the same normalised forward-slash form. On case-insensitive filesystems `Plan.loom` and `Plan.LOOM` are alternate spellings of one directory entry that `realpath` resolves to a single canonical path, so the loader deduplicates by canonical-path equality via `realpath` *before* the case-check fires: the warning is not emitted when the byte-exact `.loom` form resolves to the same canonical path. The warning does not cause the file to register — by the byte-exact rule it is not a `.loom` file at all; the warning's purpose is purely diagnostic.

**Filename validity.** The slash name is the loom's filename stem taken verbatim — no case-folding, no whitespace trimming, no character substitution. The accepted stem matches the regex `^[a-z0-9][a-z0-9_-]*$`: lowercase ASCII letters and digits, optionally separated by `-` or `_`, starting with a letter or digit. Stems that do not match (e.g. `foo bar.loom`, `Foo.loom`, `foo!.loom`, `--help.loom`, `.foo.loom`, `café.loom`) are rejected at load time with `loom/load/invalid-slash-name` (severity `error`); the file does not register and does not participate in collision detection. Hint: ``slash names must be lowercase kebab/snake; rename the file (e.g. `code-review.loom`)``. The validator runs *before* parse, so an invalid name short-circuits frontmatter and body parsing — the file produces exactly one diagnostic. Because the accepted character class is lower-case-only, the case-sensitivity question (`Foo.loom` vs `foo.loom`) reduces to "both stems are rejected"; the cross-format collision check below is therefore well-defined regardless of whether the host filesystem is case-sensitive.

<a id="disc-4"></a> **DISC-4.** **Slash-name collision rules.** When two or more candidates at the same priority level derive the same slash name, the loom extension emits `loom/load/cross-format-collision` through the diagnostics channel defined in [Diagnostics](../diagnostics.md) naming **every** colliding path. Which entries drop depends on which formats collide:

1. **Loom-vs-loom (same priority).** When the colliding candidates are all `.loom` files — two packages each shipping `code-review.loom`, two settings entries that both expand to a `code-review.loom`, or two `--loom` components that resolve to files with the same stem — **every colliding loom drops** and none register (not just two: three packages each shipping `lint.loom` produces a single error listing all three paths).
2. **Loom-vs-Pi-owned (cross-format).** When a `.loom` collides with a Pi-owned `.md` prompt, `.md` skill, or another extension's command at the cross-priority comparison the `session_start` handler performs, **only the colliding loom(s) drop** and the Pi-owned entry stays registered — the loom extension cannot unregister Pi-owned templates or another extension's commands (see [Registration steps — *Structural changes*](../pi-integration-contract/registration-steps.md#structural-changes-no-unregister)).

Every colliding path is carried in the diagnostic's rendered `message` via the `<paths>` placeholder (per the [`loom/load/cross-format-collision`](../diagnostics/code-registry-load.md) row, byte-exact per [Placeholder rendering](../diagnostics/placeholder-rendering-b.md)); no structured `details` payload is emitted for this code. The rule is symmetric across all source types and across all file formats.

Detection runs on the **final derived name** (after `pi.looms` mapping, with the filename stem taken verbatim for sources that have no `pi.looms` mapping), not the source filename. Settings entries that resolve to the same absolute path post-tilde-expansion are deduplicated silently before collision detection runs (this is package-level dedup, not a collision). The same dedup applies across `--loom` path components and inside the package walker.

When the loom extension discovers, on its `session_start` handler, that a candidate loom resolves to the same slash name as an already-registered Pi prompt template, skill, or extension command, the loom extension refuses to register the colliding loom and emits the same diagnostic naming both the `.loom` path and the colliding entry. The Pi-owned `.md` prompt template or `.md` skill (or the other extension's command) remains registered and continues to function — the loom loses, asymmetrically. Authors who want the loom to win must rename one of the two files. Cross-format shadowing in either direction is not supported in loom 1.0; the rule is symmetric in *which formats it spans* (`.md` prompts, `.md` skills, and other extensions' commands all preempt a same-named loom) but asymmetric in *which side wins* (the loom never preempts a non-loom registration, because the loom extension cannot unregister Pi-owned templates or another extension's commands — the registration timeline in [Pi Integration Contract — Extension entry point](../pi-integration-contract.md) explains why). The candidate slug for a `.md` prompt or skill is derived under the same `^[a-z0-9][a-z0-9_-]*$` rule used for `.loom` stems; `.md` files whose stems do not conform are skipped for collision purposes (they remain Pi's problem to surface). Loom-vs-loom same-name collisions across discovery sources are governed by the source-priority rule in the table above and are unaffected by this paragraph. If a colliding `.md` prompt template appears *after* a loom has already been registered (e.g. via a settings reload, a Pi extension activation, or `ctx.reload()` re-running prompt-template discovery), the next `session_start` cycle re-evaluates and drops the previously-registered loom's `LoomRegistry` entry, emitting the same diagnostic. That drop is a `LoomRegistry`-side removal of the loom's entry-table entry, not a Pi command-router unregistration: Pi exposes no symmetric `pi.unregisterCommand` (see [Registration steps — *Structural changes*](../pi-integration-contract/registration-steps.md#structural-changes-no-unregister)), so the loom's earlier `pi.registerCommand(name, …)` registration survives and `/<name>` still routes to the loom's slash handler. A dispatch of that orphaned `/<name>` returns a fixed superseded system note instead of running the dropped loom, via the [superseded-entry dispatch](../pi-integration-contract/drain-state-contract.md#superseded-entry-dispatch) sub-case of the slash handler's arm (a). The loom still loses asymmetrically — it never preempts the colliding non-loom registration — because the drop happens in `LoomRegistry`, which the loom extension owns, and never touches the Pi-owned registration it cannot unregister.

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
