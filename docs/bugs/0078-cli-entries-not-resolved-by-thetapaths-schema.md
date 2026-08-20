# Bug 0078 — `--theta` components get none of the `thetaPaths` entry schema the CLI row binds them to: a glob component is reported as a missing path, and a `!` / `+` / `-` component is taken as a literal path — so an exclusion silently fails to exclude while emitting an unreadable-source error against the operand text

- **Status:** open. §Fix adjudicates two routes (implement the schema for the CLI
  source, or amend the CLI row to state the exclusion) and recommends the second,
  on the evidence that the CLI source is a single-invocation override whose
  entries the shell already globs.
- **Kind:** specification gap composed with a silent no-op. `discovery-sources.md:7`
  binds the CLI entry to the `thetaPaths` entry schema by reference; that schema
  pins glob support and the `!`/`+`/`-` override grammar; no page states an
  exclusion for the CLI source; the implementation applies neither.
- **Related:**
  - Candidate 03 of this hunt
    (`03-settings-glob-matches-pattern-basename.md`) — the same DISC-5 grammar on
    the settings source, where it *is* implemented and diverges in the matcher.
    Disjoint code lines.
  - [0058](../../../docs/bugs/0058-fromless-export-form-parses-without-spec-production.md)
    — open; unrelated subject, cited as the shape model for a "the corpus
    defines no production / the implementation answers anyway" report.
- **Affected** (verified at HEAD `d06daae3`, 0.52.0):
  - `src/discovery/discovery-walk.ts:752–765` — the CLI arm of `discoverThetas`.
    Each raw component gets `expandHome` (`:757`) and nothing else; the entries
    go to `collectFromEntries` (`:808–824`) → `resolveEntry` (`:377–414`) →
    `classifyPath` (`:273–291`). No glob branch, no prefix parse.
  - `src/discovery/discovery-walk.ts:614–740` — `resolveSettingsSource`, the
    schema's only implementation: prefix parse at `:625–635`, glob detection at
    `:634` / `:216–218`, the four ordered steps at `:707–737`. It is called for
    the settings source only (`:771`).
  - `src/discovery/discovery-walk.ts:404–406` — the `missing` arm a glob
    component lands in, with `CLI_MODES.missing = "error"` (`:110–114`).
  - `docs/spec_topics/discovery/discovery-sources.md:7` — "CLI: `--theta <paths>`
    … Each entry is a file or directory, **resolved with the same rules as the
    settings `thetaPaths` array** (see [`thetaPaths` entry
    schema](./package-and-settings.md#thetapaths-entry-schema) below)."
  - `docs/spec_topics/discovery/package-and-settings.md:88` — the schema's
    *Glob patterns and exclusions* bullet: "Glob patterns are supported. A
    leading `!` excludes paths matching the pattern; a leading `+` force-includes
    an exact path; a leading `-` force-excludes an exact path."
  - `docs/spec_topics/discovery/discovery-sources.md:31–39` — the *Discovery
    roots* bullet list, whose CLI entry (`:39`) narrows the reference to "resolved
    by the same **file-vs-directory rule** as settings entries". This is the one
    sentence pointing the other way; it governs root computation, not entry
    resolution.
  - `docs/spec_topics/discovery/discovery-sources.md:83` — DISC-4's dedup
    sentence: "Settings entries that resolve to the same absolute path
    post-tilde-expansion are deduplicated silently before collision detection
    runs … The same dedup applies across `--theta` path components", which reads
    the two sources' entry handling as one rule.
  - `docs/reference/discovery-cli.md:14–24`, `:40–59` — the user-facing page. It
    documents the CLI flag, the priority list and the failure-modes table, and
    contains no occurrence of "glob" outside the `pi.theta` section
    (`rg -n "glob" docs/reference/discovery-cli.md` → lines 36, 91, 100, 128,
    131, 162, none of them about `--theta`). It states no exclusion either.
- **Observed at:** `0.52.0` (`d06daae3`). Offline, deterministic — scratch vitest
  driving the real `discoverThetas` over `tests/helpers/fake-file-system.ts`.
  Written, run, deleted.

## Summary

The CLI row cross-references the `thetaPaths` entry schema for how a `--theta`
component resolves. That schema has six bullets; one of them is *Glob patterns
and exclusions*. The implementation applies none of the schema to CLI
components: each is expanded for `~` and then classified as a literal path.

Two reachable input classes, two outcomes:

- A glob component classifies as `missing` and, because every CLI failure mode
  is an error, emits `theta/load/missing-source` naming the pattern text as a
  path. Nothing registers.
- A `!` / `+` / `-` component is read as a path whose first character is that
  symbol. It performs no override; the entry it was meant to exclude stays
  registered, and the walk emits `theta/load/unreadable-source` (error) against
  the operand text.

The second is the hazardous one: the diagnostic reports a filesystem problem
while the actual effect is that a stated exclusion did not happen.

## Reproduction

Offline. `/opt/t` holds `a.theta`.

**(1) Glob component.**

```ts
await discoverThetas({ fs, settings: {}, cliPaths: ["/opt/t/*.theta"] });
```

Observed:

```
thetas: []
diags:  [{"severity":"error","code":"theta/load/missing-source",
          "file":"/opt/t/*.theta",
          "message":"discovery source path does not exist: --theta flag #1"}]
```

**(2) Exclusion component.**

```ts
await discoverThetas({ fs, settings: {}, cliPaths: ["/opt/t", "!/opt/t"] });
```

Observed:

```
thetas: [{"name":"a","path":"/opt/t/a.theta","source":"cli"}]
diags:  [{"severity":"error","code":"theta/load/unreadable-source",
          "file":"!/opt/t",
          "message":"discovery source is unreadable: --theta flag #2"}]
```

`/a` registers — the exclusion did not apply. The `unreadable` (rather than
`missing`) classification comes from `properAncestors` (`:157–188`) treating
`!/opt/t` as a relative path, whose ancestors `!` and `!/opt` fail `lstat`.

**Control — the same two inputs through `thetaPaths`.** Both are honoured:
the glob selects `/opt/t/a.theta`, and `["/opt/t", "!/opt/t"]` yields zero
thetas and zero diagnostics (measured in candidate 03's fixtures).

## Expected behaviour

Under `docs/spec_topics/discovery/discovery-sources.md:7` — CLI entries
"resolved with the same rules as the settings `thetaPaths` array", with the
schema linked by anchor — input (1) registers `/a` from the CLI source and emits
nothing, and input (2) registers nothing and emits nothing (`!` drops the
selection contributed by the plain component, per DISC-5 step 2).

The competing reading is `:39`, which narrows the shared rule to the
file-vs-directory question. Under that reading the implementation's handling of
(1) is defensible — a literal path that does not exist is a `missing-source`
error — but (2) is not covered by either reading: no page assigns a meaning to a
leading `!` in a `--theta` component, and the current outcome (a filesystem
error, no exclusion) is a disposition the spec does not state.

The two sentences (`:7` and `:39`) are not reconciled anywhere, and
`docs/reference/discovery-cli.md` — the page an operator reads — states neither
glob support nor its absence.

## Actual behaviour / root cause

The CLI arm (`:752–765`) maps each component through `expandHome` and hands it
to `collectFromEntries` with `explicitFile = true`. `resolveEntry`
(`:377–414`) has three productive arms — `dir`, `file`, `invalid-extension` —
all reached from `classifyPath`, which does a single `lstat`. No caller of the
CLI path constructs a `ParsedSettingsEntry` (`:581–586`) or reaches
`resolveSettingsSource`'s prefix parse (`:625–635`) and four-step override loop
(`:707–737`); `resolveSettingsSource` is called once, from `:771`, on
`input.settings`.

`isGlobPattern` (`:216–218`) exists and would classify both operands correctly;
it is simply not consulted on this path.

## Why it matters

Impact class 4 shading into 1. A `--theta` glob is the natural spelling for
"these files" on a shell that does not expand it (PowerShell passes `*.theta`
through verbatim; a quoted operand on any shell does the same), and the operator
gets an error stating the path does not exist — for a path they can `ls`.

The exclusion case is worse than an error: the operator asked for a path to be
excluded, the walk emitted an error mentioning that path, and the theta stayed
registered anyway. The diagnostic's code and message describe an unreadable
filesystem entry, which is not what happened.

Both effects are unattributable from the operator's side, because
`docs/reference/discovery-cli.md` documents neither the support nor its absence.

## Non-goals

Not in scope: the `path.delimiter` split (owned by the factory before
`discoverThetas` is called), `~` expansion (DISC-1, correct at `:190–200`), and
the settings-side matcher defect (candidate 03).

## Fix

**Option A — implement the schema for the CLI source.** Factor
`resolveSettingsSource` (`:614–740`) into a shared resolver parameterised by
base directory and descriptor, and call it for `cliPaths` with the process cwd
as base. Delivers what `:7` says. Costs: the CLI source acquires a recursive
`listTree` universe per glob entry; the descriptor text
(`"--theta flag #N"` vs `"settings entry index N"`) has to thread through
`addFile`'s `invalid-extension` message (`:657–665`), which currently hardcodes
`thetaPaths[N]`; and it must land on top of candidate 03's fix or it propagates
the loose matcher to a second source.

**Option B — amend the CLI row to state the exclusion.** Rewrite
`discovery-sources.md:7` to reference only the file-vs-directory rule (matching
`:39`), state that glob expansion is the shell's job for this source, and assign
a disposition to a leading `!` / `+` / `-` operand. Mirror both in
`docs/reference/discovery-cli.md`, which today says nothing either way.

Recommendation: Option B. The CLI source is a single-invocation override whose
operands the shell normally expands, `:39` already reads that way, and Option A
adds a recursive filesystem walk to the startup path for a case the shell covers.
Option B must still decide input (2)'s disposition — the choices are (i) treat a
leading `!`/`+`/`-` as part of the path (today's behaviour, but then the
diagnostic should be `missing-source`, not `unreadable-source`, and `:157–188`'s
relative-path ancestor walk is what makes it `unreadable`), or (ii) reject the
operand with a dedicated code. Either way the outcome must not be "an error
naming a filesystem cause while the requested override silently does not apply".

Whichever route is taken, `docs/reference/discovery-cli.md` gains one sentence:
today it lets an operator infer glob support from `:7` and get an error.

## Provenance

- Origin: `discovery-ext` bug hunt at HEAD `d06daae3`, seed hypothesis (2)
  (settings/root precedence, relative vs absolute roots), while comparing the
  CLI arm to `resolveSettingsSource`.
- Implementation evidence: `src/discovery/discovery-walk.ts:110–114`, `:157–188`,
  `:190–200`, `:216–218`, `:273–291`, `:377–414`, `:581–586`, `:614–740`,
  `:752–765`, `:771`, `:808–824` — read at `d06daae3`.
- Probe evidence: scratch vitest over the real `discoverThetas` with
  `tests/helpers/fake-file-system.ts`; both inputs' outputs quoted verbatim
  above. Deleted after the run.
- Spec: `docs/spec_topics/discovery/discovery-sources.md:7`, `:31–39`, `:83`;
  `docs/spec_topics/discovery/package-and-settings.md:88`;
  `docs/reference/discovery-cli.md:14–24`, `:40–59`.

## Coordination note — bug 0077 landed (0.68.0)

This report's §Related first bullet cites the settings side of the same DISC-5
override grammar as the place where that grammar "*is* implemented and diverges
in the matcher". **That divergence is discharged by bug
[0077](./0077-settings-glob-matches-pattern-basename.md)'s fix (0.68.0):** the
settings matcher now attempts DISC-5's three comparison strings with the whole
pattern each time, so it agrees with the package walker's `matchesGlob` on one
pattern text. The settings source is therefore no longer a divergent reference
point — it is a conformant one.

This changes nothing about this report's own defect or its recommended
resolution. The CLI source still applies *none* of the entry schema, which is the
subject here; 0077 touched only `resolveSettingsSource` and the predicate it
calls, never the CLI arm of `discoverThetas` nor `collectFromEntries` /
`resolveEntry` / `classifyPath`. Two consequences worth recording for whichever
route is taken:

- If Route A (implement the schema for the CLI source) is ever taken over the
  recommended Route B (amend the CLI row to state the exclusion), it now inherits
  a conformant matcher rather than a divergent one — the shared predicate is
  `globMatches`, and the settings source's base-dir-relative comparison string is
  supplied by `relativeToBase`. A CLI component has no settings-file directory to
  resolve against, so Route A would have to state which root its relative
  comparison uses; that question is new and is not answered by 0077.
- The §Affected line citations above were taken at `d06daae3` and have drifted
  further: `resolveSettingsSource` is now `src/discovery/discovery-walk.ts:678`,
  `ParsedSettingsEntry` `:644`, the prefix parse inside `resolveSettingsSource`'s
  `entries.map`, glob detection at `isGlobPattern` (`:216`), and the four ordered
  steps run from `:774` to the end of that function. Cite the symbols.
> **Coordination note (at bug 0113's fix, 0.126.0):** `emitUniverseFailures` (new in both discovery files) takes the row severity as a parameter — if this report gives the CLI row the `thetaPaths` schema, the third DISC-2 row that emission serves arrives as a call-site change only (severity via `CLI_MODES`). `listTree`'s signature and return type changed in both files; re-anchor by symbol at pick.
