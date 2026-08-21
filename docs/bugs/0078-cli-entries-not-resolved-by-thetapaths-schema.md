# Bug 0078 — `--theta` components get none of the `thetaPaths` entry schema the CLI row binds them to: a glob component is reported as a missing path, and a `!` / `+` / `-` component is taken as a literal path — so an exclusion silently fails to exclude while emitting an unreadable-source error against the operand text

- **Status:** fixed (0.178.0) — Route B (the §Fix recommendation), with input (2)'s
  disposition resolved as §Fix choice (i) plus §Fix's own correction of the
  emitted code. See [Fix (0.178.0)](#fix-xyz) below.
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

<a id="fix-xyz"></a>

## Fix (0.178.0)

**Adjudication.** §Fix's own recommendation governs: **Option B**. The CLI source
is a single-invocation override, the *Discovery roots* bullet already reads that
way, and Option A would add a recursive `listTree` universe to the startup path
for a case the shell covers. Input (2)'s open disposition is resolved as §Fix
choice **(i)** — a leading `!` / `+` / `-` is part of the literal path, no
override is performed — together with the correction §Fix itself attaches to that
choice: the diagnostic must be `theta/load/missing-source`, not
`theta/load/unreadable-source`. The `missing-source` row's *Trigger* ("a
discovery source's path does not exist") admits the class as written, at the CLI
row's *Missing path* severity (error — the same severity the operand drew
before), so the family's emission shape is reused rather than re-derived: **no
new code, no new registry row, no *Message* reword** (DIAG-4), and no
`permitted-codes.json` decision. A non-`ENOENT` rejection on such an operand
still classifies `unreadable` — there the path exists and cannot be read, which
is what the row means. Input (1) (a glob operand) needs no behavioural change:
its `theta/load/missing-source` error was already correct once the spec states
that glob expansion belongs to the invoking shell for this source.

**Registry and mirror decision.** Unlike 0113 and 0075, this pass **does** touch
the two mirror surfaces, because both are contradictions this change would
otherwise create and both are same-commit obligations: the
`theta/load/unreadable-source` row's *Trigger* previously claimed every
dirty-ancestor `ENOENT` from an explicit reference, which now over-claims; and
`docs/reference/discovery-cli.md` is the page §Fix says "gains one sentence"
(today it lets an operator infer glob support and get an error). Both edits are
**in-line**, so every file's line count is unchanged
(`discovery-sources.md` 106, `discovery-cli.md` 285, `code-registry-load.md` 64)
and the live `docs/reference/discovery-cli.md:NNN` citations in the still-open
bug documents 0088, 0111, 0146 and 0147 — 0113's residual 2 and 0075's re-checked
ground — do not stale. No citation sweep was run.

- What shipped:
  - `src/discovery/discovery-walk.ts` — a `hasOverridePrefix` predicate beside
    `isGlobPattern`, and a two-arm `EnoentPolicy` (`"ancestor-walk"` /
    `"missing"`) threaded explicitly as a per-entry field through
    `collectFromEntries` → `resolveEntry` → `classifyPath`. The CLI arm computes
    the policy from the RAW operand (before `expandHome`, which can neither
    introduce nor remove a leading `!`/`+`/`-`); the conventional-roots call site
    and the settings-side `addLiteral` classification both pass
    `"ancestor-walk"` explicitly, so DISC-2's clean-leaf walk is unchanged
    everywhere else. `properAncestors`, `ancestorsClean`, `classifyForSource`,
    `resolveSettingsSource`'s prefix parse and both `listTree` copies are
    untouched.
  - `docs/spec_topics/discovery/discovery-sources.md` — the CLI bullet stops
    binding a component to the whole `thetaPaths` entry schema: it shares the
    file-vs-directory rule stated at *Discovery roots* but none of the schema's
    glob or `!`/`+`/`-` override grammar; glob expansion is the invoking shell's
    job; an override-prefixed component is a literal path reported as
    `theta/load/missing-source` without the clean-leaf walk, and one that names
    an existing path resolves like any other entry. DISC-2's clean-leaf
    implementation note is qualified to match. Both edits in-line; 106 lines.
  - `docs/reference/discovery-cli.md` — the mirror sentence on the `--theta`
    bullet: components are literal file or directory paths, glob expansion is
    the shell's (a POSIX shell expands an unquoted glob; PowerShell or any
    quoted operand passes the pattern through verbatim, where it names no path
    and is reported missing), and a leading `!`/`+`/`-` is part of the path.
    In-line; 285 lines; the DISC-2 failure-mode table untouched.
  - `docs/spec_topics/diagnostics/code-registry-load.md` — an in-line qualifier
    on the `theta/load/unreadable-source` *Trigger* excepting the
    override-prefixed `--theta` component. No row added or removed, no code,
    severity or *Message* change. 64 lines.
- Gates: witness `tests/discovery-cli-entry-override-prefix.test.ts` 13/13
  (cells 1, 2, 3 RED before the fix, each observing
  `theta/load/unreadable-source` where `missing-source` is owed); full default
  suite `369 files / 7537 tests passed` (lane baseline 368/7524 at v0.175.0 — the
  delta is exactly this witness); `npx tsc -p . --noEmit` clean; `npm run lint`
  clean; live H8a `CELL-D2` 1/1 real run under the live lock, red-proven by
  neutralising the CLI arm's policy.
- Review: 2 rounds plus one comment-only polish. Round 1 (deep) found no
  correctness or fidelity defect and five non-behavioural findings — the
  `unreadable-source` *Trigger* over-claiming the class, DISC-2's clean-leaf note
  contradicting the amended CLI bullet, a factually wrong PowerShell-globbing
  parenthetical, a closed-list "only" that `lexical.md`'s settings/CLI extension
  check and DISC-4's dedup sentence exceed, and a `discoverThetas` comment made
  false by the change — plus a test residual (three uncovered predicate
  boundaries). One `bug-fix-fixer-light` round applied all five and added three
  additive boundary cells, touching no executable `src/` line. Round 2 (fast)
  CLEAN, no escalation, with one residual: cell 10 (bare `-`) is inert —
  measured green under a stubbed `hasOverridePrefix` because a single-segment
  relative operand has no ancestors to walk. A final comment-only polish round
  corrected that cell's rationale; polish verified by gate-diff, confirmation
  round skipped.
- Verification: SOLID. (A) The witness reds on revert, proven both directions
  with byte-exact restoration (`git hash-object src/discovery/discovery-walk.ts`
  = `5e3982e231c993e37c4795a00657bda387e9e114` before and after every cycle):
  forcing the CLI arm to `"ancestor-walk"` reds cells 1–3 with the quoted
  `unreadable-source` symptom; dropping the `ENOENT` guard so the walk is skipped
  unconditionally reds cells 4, 11 and 12, so the DISC-2 controls can genuinely
  fail. (B) `npm test` 369/7537. (C) `npx tsc -p . --noEmit` and `npm run lint`
  clean. (D) Live: one additive standalone H8a cell,
  `tests/live/discovery-cli-override-prefix-missing-source-cell-d2.test.ts`,
  boots the real shipped extension with an override-prefixed `--theta` operand
  naming an absent path and asserts the `missing-source` note (and the absence of
  the `unreadable-source` one) on the `theta-system-note` channel off the settled
  `SessionManager`, bracketed by a registration precondition control. The
  provocation needs **no fault injection and no ACL** — strictly cleaner than
  0075's `fs.promises.lstat` patch — because `readThetaFlagPaths` carries the
  operand verbatim into the real CLI arm; disclosed in the cell header.
  Registration-only, no subagent child spawn, so no child pins are owed. Green,
  red-proven. No H9a run and no `permitted-codes.json` edit: no new code and no
  severity change. No stochastic class was observed. Protected witnesses all
  green and unflipped: `discovery-tree-walk-lstat-failure` 11/11,
  `discovery-glob-universe-enumeration-failure` 19/19,
  `production-tools-load-resolution` 50/50, `e2e-s5-disc-cli-settings` 6/6.
- Residuals:
  1. **The CLI source still implements none of the `thetaPaths` glob grammar**
     — that is Option B's whole point, now stated rather than silent. Evidence:
     `isGlobPattern` remains unconsulted on the CLI path and witness cell 8 pins
     a glob operand to `theta/load/missing-source`. An operator on a shell that
     does not expand the pattern gets a missing-path error the reference page
     now predicts.
  2. **The exclusion still does not exclude.** An operand the operator meant as
     `!<path>` leaves the plain component's theta registered; the fix makes the
     diagnostic truthful and the disposition documented, not the intent
     honoured. Evidence: witness cells 1 and 3 assert the plain component's
     theta stays registered.
  3. **Cell 10 (bare `-`) is inert.** It pins `properAncestors`' vacuous
     ancestor chain, not the override predicate: a single-segment relative
     operand classifies `missing` under either policy. Evidence: round 2
     measured it green with `hasOverridePrefix` stubbed to `false`; its comment
     now says so. Cells 11 and 12 each red under a widened predicate.
  4. **The Windows parent-ACL-as-`ENOENT` conflation is not distinguished for an
     override-prefixed operand.** Skipping the walk is what makes that
     impossible for this operand class — the trade the adjudication made and the
     CLI bullet states.
- Discharge notes appended: none. Bug 0075's fix record names "bug 0078's
  subject (the CLI entry schema's route through `collectFromEntries`)" as
  untouched and open; 0075 remains open for its own headline `classifyPath`
  defect, and its record is left untouched.
- Pinned dispositions / non-goals: the `path.delimiter` split, `~` expansion
  (DISC-1), the settings-side matcher (0077, landed), `classifyPath`'s
  link-typed candidates (0075's open headline subject), `properAncestors`'
  relative and Windows-drive chains, both `listTree` copies and the
  `emitUniverseFailures` chain (0113/0075), and Option A's shared-resolver
  refactor with its base-directory question. None was touched.
