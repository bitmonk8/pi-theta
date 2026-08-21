# Reference — Discovery sources & invocation surface

Where `.theta` files are discovered, how slash names and collisions resolve, the
settings/package/CLI surface, and slash / `invoke` invocation. See
[Frontmatter](./frontmatter.md) for `tools:`/`mode:`, [Diagnostics](./diagnostics.md)
for `theta/load/*` codes, [Errors and results](./errors-and-results.md) for the
top-level-`Err` surface.

## The five discovery sources

- **Global**: `~/.pi/agent/theta/*.theta`
- **Project**: `.pi/theta/*.theta`
- **Packages**: each installed pi-package's `pi.theta` manifest entry (preferred)
  or its conventional `theta/` directory (fallback).
- **Settings**: `thetaPaths` array in `~/.pi/agent/settings.json` or
  `.pi/settings.json` — `string[]` of file/directory paths.
- **CLI**: `--theta <paths>` (single flag; multiple paths joined with
  `path.delimiter` — `:` POSIX, `;` Windows). Registered by the theta extension via
  `pi.registerFlag('theta', ...)`; read with `pi.getFlag('theta')`. Each component is a literal file or directory path — glob expansion is the invoking shell's job: a POSIX shell expands an unquoted glob before theta sees it, while PowerShell (or any quoted operand) passes the pattern through verbatim, where it names no path and is reported missing — and a leading `!`, `+` or `-` is part of that literal path, not an override.

Discovery is **non-recursive** and matches only `*.theta` (byte-exact lowercase:
`Plan.THETA` never matches on any platform). `.thetalib` library files are never
discovered as slash commands — reached only via `import`. The `.theta`/`.thetalib`
extensions, the `pi.theta` manifest key, the `thetaPaths` settings array, and the
`--theta` flag are all coined by this extension, not by Pi.

**Home-directory expansion (DISC-1).** A leading `~/` is expanded via the
`FileSystem` seam's `homedir()`; the `~user` form is not honoured.

## Source priority (high to low)

When the same slash name resolves from multiple sources, the higher-priority
source wins and `theta/load/cross-source-shadow` (warning) names both paths:

1. CLI flag (`--theta <path>`)
2. Settings (`thetaPaths`; project `settings.json` overrides global)
3. Project (`.pi/theta/`)
4. Packages (`theta/` directories or `pi.theta` entries)
5. Global (`~/.pi/agent/theta/`)

## Failure modes (DISC-2)

Conventional locations tolerate absence silently; explicit references surface a
missing path as an error.

| Source | Missing path | Unreadable path | Wrong type (file vs dir) |
|---|---|---|---|
| Global `~/.pi/agent/theta/` | silent | warning | warning |
| Project `.pi/theta/` | silent | warning | warning |
| Package `theta/` directory | silent | warning | warning |
| Package `pi.theta` entry | error | warning | error |
| Settings `thetaPaths` entry | error | warning | error |
| CLI `--theta <path>` | error | error | error |

Codes: `theta/load/missing-source`, `theta/load/unreadable-source`,
`theta/load/wrong-type-source`, plus `theta/load/unreadable` (warning) for a
discovered `.theta` file that is itself unreadable (the theta is not registered; the
scan continues). Errors are fatal for the offending entry only, not the whole
pass. A directory entry is a valid path regardless of contents (an empty directory
enumerates zero thetas and emits no diagnostic).

## Filename validity & slash name

The slash name is the filename stem taken verbatim — no case-folding, trimming, or
substitution. Accepted stem regex: `^[a-z0-9][a-z0-9_-]*$`. Non-matching stems
(`foo bar.theta`, `Foo.theta`, `foo!.theta`, `--help.theta`, `.foo.theta`, `café.theta`)
are `theta/load/invalid-slash-name` (error); the file does not register and does not
participate in collision detection. The validator runs before parse.

## Collision rules

- **Case-insensitive collisions (DISC-3).** Two `*.theta` files in one source
  differing only in case → `theta/load/case-collision` (warning, per source); the
  lexicographically-first path under case-sensitive byte comparison wins.
- **Non-canonical extension case.** A file whose stem matches the slash-name regex
  but whose extension is a case-variant of `.theta`/`.thetalib` (e.g. `Plan.THETA`) →
  `theta/load/non-canonical-extension` (warning, per source; deduped via `realpath`).
  The file does not register.
- **Slash-name collision (DISC-4).** Two or more candidates at the same priority
  deriving the same slash name → `theta/load/cross-format-collision` (error), naming
  every colliding path. Theta-vs-theta: **every** colliding theta drops. Theta-vs-Pi-owned
  (`.md` prompt, `.md` skill, another extension's command — never the theta extension's
  own prior registration of that name, which is excluded from the comparison): only the theta(s) drop;
  the Pi-owned entry stays registered (the theta extension cannot unregister
  Pi-owned templates). Detection runs on the final derived name (after `pi.theta`
  mapping); settings entries resolving to the same absolute path post-tilde-expansion
  are deduplicated silently first.

## Discovery roots

The active-root set for a session is the union of: the global root; the project
root; each scanned package's contributing directory; each settings `thetaPaths`
entry (directory contributes itself; file contributes its parent directory); each
`--theta` path component. Roots are computed once per discovery pass and cached;
hot-reload re-runs the computation. The set is referenced normatively by the
`invoke` / `.theta`-`tools:` path-restriction rule.

## Package discovery

Roots scanned (priority order, project before global): `.pi/npm/`,
`.pi/git/<host>/<path>/`, `node_modules/` (symlinked entries filtered out silently
— pnpm-isolated deps are out of scope), `~/.pi/agent/npm/`,
`~/.pi/agent/git/<host>/<path>/`. Within each root, immediate child directories not
beginning with `@` are candidate packages; `@`-prefixed directories are scope
directories whose children are candidates. A candidate contributes thetas only when
its `package.json` parses.

- **DISC-5 (`pi.theta`).** MUST be a `string[]` of package-root-relative paths
  (mirrors `pi.extensions`/`pi.skills`/`pi.prompts`/`pi.themes`). Globs supported
  (`minimatch`); leading `!` excludes, `+` force-includes an exact path, `-`
  force-excludes one, resolved in that fixed order. A `.theta` match registers
  directly; a directory match is scanned non-recursively; other file types are
  filtered out silently. A non-`string[]` value → `theta/load/manifest-invalid`
  (error). An entry resolving outside the package root →
  `theta/load/manifest-escapes-package` (warning, per entry). Manifest wins over the
  `theta/` fallback when both present.
- **DISC-6 (package walk bound).** The walk stops opening `package.json` files once
  it has inspected `theta.scanPackagesMaxFiles` files (default `2000`) or spent
  `theta.scanPackagesTimeoutMs` ms (default `2000`), whichever fires first →
  `theta/load/discovery-slow` (warning). Per-read deadline
  `max(200, floor(scanPackagesTimeoutMs / 10))` ms; a per-read timeout →
  `theta/load/package-read-timeout` (warning, `details.kind = "package-read-timeout"`),
  package treated as unreadable for this scan only. `theta.scanPackages: false`
  disables the walk wholesale.

## Settings file reads

Files (precedence order, project over global): `.pi/settings.json`,
`~/.pi/agent/settings.json`. Both optional; read through the `FileSystem` seam.

**DISC-7 (merge semantics).** Project overrides global with deep merge for nested
objects, **replace** for arrays and scalars.

Failure modes (treated as `{}`, one diagnostic per file): absent → **silent** (both
files are optional); present but unreadable → `theta/load/settings-unreadable`; not valid UTF-8 JSON →
`theta/load/settings-invalid-json`; valid JSON whose root is not an object →
`theta/load/settings-value-out-of-range` (once, root rendered `(root)`).

Keys read (five): `thetaPaths` (top-level `string[]`), and four scalars under
`theta`:

- `theta.binderModel` — non-empty string; binder fallback when `bind_model:` is
  omitted. Required when any non-bypass theta is in scope (else
  `theta/load/binder-model-unresolved`). The requirement excludes the marked
  root theta of a spawned subagent child (the subagent-root exemption).
- `theta.scanPackages` — boolean, default `true`.
- `theta.scanPackagesMaxFiles` — integer ≥ 1, default `2000`.
- `theta.scanPackagesTimeoutMs` — integer ≥ 1, default `2000`.

Unknown `thetas.*` keys are ignored without diagnostic. A recognised scalar whose
value fails its type/range is treated as absent and logged
`theta/load/settings-value-out-of-range` (error, non-fatal, per key per file);
`null` is out of range for every key; integer-ness is judged on the parsed value
(`2000.0` accepted, `25.5` not).

**`thetaPaths` entry schema.** `string[]`; each entry a file or directory path
(non-string → `theta/load/settings-invalid-entry`, error, per entry). Paths in
`~/.pi/agent/settings.json` resolve relative to `~/.pi/agent/`; in `.pi/settings.json`
relative to `.pi/`; `~` expands per DISC-1; absolute paths as-is. Globs and
`!`/`+`/`-` overrides follow DISC-5. A directory entry expands to its non-recursive
`*.theta` children; a file entry must end in `.theta` (else
`theta/load/invalid-extension`, error). Deduplicated silently by resolved absolute
path. The project array fully **replaces** the global array (no concatenation).

**Caching & reload.** Both files read once and cached; a per-path file-watcher
invalidates on change; watcher events are debounced over a `250 ms` window (against
the `Clock` seam). Watcher-time rebuild failures surface as **ERR-7** on the
`theta-system-note` channel (`theta/runtime/registry-swap-failed` for a swap that
throws before publish; re-emitted `theta/load/*` / `theta/parse/*` codes for a
re-parse/re-merge diagnostic), at watcher-event time.

## Slash-command invocation

A theta is invoked by its filename stem, like a Pi prompt template
(`/code-review ...`). The runtime extracts typed `params:` from free-form slash
arguments via the LLM binder (bind model resolved from `bind_model:` or
`theta.binderModel` at load time). On successful binding a one-line echo system
note is appended (on by default, suppressed by `bind_echo: false`, auto-suppressed
for the single-string-param bypass). `argument-hint` grounds the binder but is not
shown in Pi's autocomplete. Key=value / named-argument syntax is not part of the
theta 1.0 surface.

- **SLSH-1 (no-params overflow).** For a no-params theta the binder is bypassed; the
  runtime trims slash-argument whitespace, and if the remainder is non-empty emits
  a single `theta /<name>: ignoring extra arguments — this theta takes no parameters`
  note before running. Whitespace-only remainders emit no note. Slash-path only.
- **Prompt mode**: the theta drives the *current* conversation; every query is a
  user-visible turn. The final `Ok` value is **not** surfaced to the user.
- **Subagent mode**: a fresh isolated conversation is spawned (`system:` from
  frontmatter if present); only the return value reaches the caller. A
  directly-slash-invoked subagent theta's top-level `Err` is surfaced to the user's
  session per SLSH-3.
- **SLSH-2 (user-visible streaming).** In prompt mode, assistant tokens for both
  untyped and typed queries stream into the transcript in real time; the typed
  forced respond turn is dispatched off-session and renders no card. In subagent
  mode nothing surfaces to any ancestor transcript.
- **SLSH-3 (top-level `Err`).** A theta with a slash caller and no invoke parent
  that returns `Err(QueryError)` to that boundary gets a one-line system note
  formatted from the error (prompt or subagent mode alike). A subagent theta reached
  via `invoke(...)` is not a slash-dispatch boundary and cascades to its parent
  instead.

Per-`kind` system-note templates (SLSH-4; renderers emit the surrounding template
verbatim, only `<…>` placeholders interpolated; the table is exhaustive over the
nine variants plus a catch-all):

| Label | `kind` | System note shape |
|---|---|---|
| SNK-a | `validation` (`schema_validation`) | theta /`<name>` returned Err: model failed schema after `<n>` respond-repair attempts |
| SNK-b | `validation` (`empty_template`) | theta /`<name>` returned Err: rendered query template was empty — no provider turn was issued |
| SNK-c | `transport` | theta /`<name>` returned Err: transport — `<message>` |
| SNK-d | `model_tool` | theta /`<name>` returned Err: tool `<tool_name>` failed — `<message>` |
| SNK-e | `context_overflow` | theta /`<name>` returned Err: context overflow |
| SNK-f | `cancelled` | theta /`<name>` cancelled |
| SNK-g | `code_tool` | theta /`<name>` returned Err: tool `<tool_name>` call failed (`<cause>`) — `<message>` |
| SNK-h | `tool_loop_exhausted` | theta /`<name>` returned Err: tool-call loop exhausted after `<rounds>` rounds (last tool: `<last_tool_name>`) |
| SNK-i | `invoke_infra` | theta /`<name>` returned Err: invoke of `<callee_path>` failed (`<cause>`) |
| SNK-k | any unlisted `kind` (catch-all) | theta /`<name>` returned Err: `<kind>` — `<message>` |

`invoke_callee` has no dedicated row — the chain suffix (SLSH-5) recurses through
`inner` to the leaf `kind` and renders that leaf's row, appending
` from <callee_path> invoked at <parent_path>:<line>` per `invoke_callee` hop
(leaf-first order). For `tool_loop_exhausted`, `<last_tool_name>` renders the
literal `respond` when `last_tool_name` is `null`.

## `invoke` invocation

`invoke("./path.theta", args...)` is the only way for a `.theta` to spawn/attach to
another `.theta` by an inline path literal. `import` is reserved for `.thetalib`.

- **Resolution.** The path is a string literal resolved at parse time relative to
  the calling theta's directory; must end in `.theta` (byte-exact lowercase, else
  `theta/parse/invoke-non-theta-extension`); forward-slash separators only; dynamic
  (runtime-computed) paths are not supported. The resolved path (post-`realpath`)
  must lie within the union of active discovery roots (segment-boundary containment,
  byte-exact on `realpath` output); an escape is `theta/load/invoke-path-escape`.
  The check re-runs at open time against the *currently* active roots (INV-1).
- **Typed return.** `invoke<Schema>(...)` annotates the expected return type and
  AJV-validates the child's return value. Untyped `invoke(...)` returns
  `Result<null, QueryError>` (child return value discarded).
- **Argument binding.** Positional, in `params:` declaration order, each
  type-checked against the param's schema (the slash-boundary binder does not run).
  Arity is checked before per-argument type: too few (below the non-defaulted
  count) → `theta/parse/invoke-arity-too-few` when statically resolvable; too many
  → `theta/parse/invoke-arity-too-many` (always parse-time).
- **Cross-mode semantics.** The callee's mode controls conversation attachment:

  | Caller | Callee | Effect |
  |---|---|---|
  | prompt | prompt | Child attaches to caller's current conversation; child queries are user-visible |
  | prompt | subagent | Child spawns a fresh isolated conversation; only the return value reaches the caller |
  | subagent | prompt | Child attaches to the caller subagent's own private conversation |
  | subagent | subagent | Child spawns a fresh isolated sibling conversation |

  The child uses its own frontmatter `model`/`tools`/`system`; the caller's are not
  inherited. A prompt → prompt invoke suspends the parent's body until the child
  returns (nested prompt → prompt invokes execute strictly sequentially).
- **Cycle detection.** Invocation cycles are detected at parse time by walking the
  per-load-pass static-resolution graph → `theta/load/invocation-cycle`.
- **Failures.** `InvokeInfraError` (infra-side, around the callee body) and
  `InvokeCalleeError` (the callee's own `Err` propagated); schemas in
  [Errors and results](./errors-and-results.md).

**Static resolution.** A callee referenced by a literal `invoke(...)` or a `.theta`
`tools:` entry is statically resolvable if the runtime can open/parse/lower it
during the calling theta's load pass (a shared per-load-pass parse cache, walked
transitively). A callee that is unreadable / unparseable is
`theta/load/callee-has-errors` — severity `error` for a `tools:` entry (parent does
not register), `warning` for a literal `invoke(...)` (parent registers; static
checks skipped; runtime AJV is the safety net).

## Provenance

- Discovery hub, five sources, non-recursion, extension-namespace framing:
  `docs/spec_topics/discovery.md`, `docs/spec_topics/discovery/discovery-sources.md`.
- Priority, failure modes (DISC-2), filename validity, collisions (DISC-3, DISC-4),
  discovery roots, home-directory expansion (DISC-1):
  `docs/spec_topics/discovery/discovery-sources.md`.
- Package discovery (DISC-5, DISC-6), settings reads (DISC-7, keys, `thetaPaths`
  schema, caching/reload, watcher-time failures):
  `docs/spec_topics/discovery/package-and-settings.md`.
- Slash invocation (SLSH-1…SLSH-5, SNK-a…SNK-k):
  `docs/spec_topics/slash-invocation.md`.
- `invoke` resolution, typed return, argument binding/arity, cross-mode, cycle
  detection, static resolution, INV-1: `docs/spec_topics/invocation.md`.
