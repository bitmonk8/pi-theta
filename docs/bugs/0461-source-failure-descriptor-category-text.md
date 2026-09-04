# Bug 0461 — every `theta/load/missing-source` / `unreadable-source` / `wrong-type-source` emission renders the registry rows' `<descriptor>` as prose category text (`settings entry index 0`, `--theta flag #1`, `global thetas directory`) where placeholder-rendering-b.md §5 pins the normative `<kind>:"<value>"` form with a byte-exact missing-source vector — and the corpus itself is split, DISC-2 rule 2 and package-and-settings.md still exemplifying the category text §5 contradicts

- **Status:** open.
- **Sev/Diff estimate:** S4/D2 — S4: the wrong-diagnostics/doc-tension class
  (0440's own S4 calibration for the sibling `<higher>`/`<lower>` divergence):
  no registration, severity, or classification outcome moves — the rows fire at
  the right severities on the right inputs — but a DIAG-4-normative *Message*
  rendering diverges from the placeholder page's byte-exact vector on every
  emission of three registry rows, and the corpus carries two sentences
  (DISC-2 rule 2's category-text examples; package-and-settings.md's
  `"settings entry index N"` sentence) that sanction the shipped form against
  §5's "The descriptor format is normative". D2: the mechanical half is small —
  the 0440 fix already threads `descriptorValue` through the walk's entry
  records and ships `descriptorKindOf`/`renderDescriptor`
  (`discovery-walk.ts:1322`, `:1341`), so the failure-mode sites need only the
  same value the sibling records already carry — but the fix must first
  adjudicate the corpus split (which side's sentences move), and TEN
  committed witness files pin the category-text bytes and would re-pin —
  three of them LIVE cells
  (`tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts`,
  `tests/live/discovery-entry-lstat-failure-live-cell.test.ts`,
  `tests/live/live-production-acceptance.test.ts`), which puts the estimate
  at the top of D2.
- **Kind:** defect against DIAG-4
  (`docs/spec_topics/diagnostics/diagnostic-shape.md:74`: renderers MUST emit
  the registry *Message* "character-for-character with placeholders
  interpolated") composed with a corpus self-contradiction the same fix must
  settle: `placeholder-rendering-b.md` §5 (plus the registry rows and the
  `discovery-sources.md:11` head clause) vs DISC-2 rule 2 +
  `package-and-settings.md:97` + the `discovery-sources.md:11` "distinct
  from" clause (three category-side sentences, not two).
- **Related:**
  - 0440 (fixed 0.420.0) — this is its fix record's **Residual 1 verbatim**
    ("`emitSourceFailure` renders the failure-mode rows' `<descriptor>` as
    category text (`settings entry index 0`, `--theta flag #1`) while
    placeholder-rendering-b.md §5 vector 2 pins `settings:"~/work/theta"` — a
    PRE-EXISTING corpus divergence outside 0440's §Affected/§Fix scope; file
    separately (round-1 review R1)"). 0440 fixed the shadow row's
    `<higher>`/`<lower>` to the descriptor form and installed the
    five-kind closed set + threading this report's fix would reuse.
  - 0076 (fixed 0.67.0) — installed the `emitSourceFailure` reuse discipline
    and the category descriptors for the enumeration-failure arms; its fix
    record (f) read the registry *Message* columns as "reproduced byte-exact by
    the emitters" — true then only because the `<descriptor>` interpolation
    rule postdates it (the §5 `<descriptor>` bullet and the
    `#descriptor-kinds` anchor are 0440-era).
  - 0364 (fixed 0.377.0) — its witness pins `settings entry index 0` bytes on
    the junction-ancestor cells; one of the committed pins a conforming fix
    re-pins.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/discovery/discovery-walk.ts:666-684` — `emitSourceFailure`, the sole
    walk-side mint: interpolates its `descriptor` parameter (category prose)
    into all three templates (`discovery source path does not exist:
    ${descriptor}`, `discovery source is unreadable: ${descriptor}`,
    `discovery source ${descriptor} is neither a .theta file nor a directory
    of them`).
  - Descriptor mints feeding it: `:1035`/`:1060`/`:1065`
    (`settings entry index ${entry.index}`), `:1141`
    (`--theta flag #${index + 1}`), `:1188` (`projectSourceLabel(configDir)` →
    `project .pi/theta/`), `:1194` (`global thetas directory`); call sites
    `:489`/`:491` (directory-enumeration failures), `:639-645` (entry
    classification), `:851` + `:838-853` (glob-universe failures).
  - `src/discovery/package-discovery.ts:539-565` — `thetasInDirectory`'s twin
    emitters render the same templates with the package category descriptors
    (`` package `<name>` (pi.theta) ``, `` package `<name>` theta/
    directory ``).
  - `src/discovery/discovery-walk.ts:1322-1343` — `descriptorKindOf` +
    `renderDescriptor`: the 0440 machinery that renders the pinned
    `<kind>:"<value>"` form, currently reachable only from the
    cross-source-shadow mint (`:1513`); `SourcedCandidate.descriptorValue`
    (`:698`) and the entry records' `descriptorValue` (`:1148` CLI verbatim
    operand, `:1240` conventional-root resolved path, settings `entry.raw` at
    `:1065`) already carry the value half at or near every failure site.
  - Spec: `docs/spec_topics/diagnostics/placeholder-rendering-b.md:13` (the
    `<descriptor>` rule — "rendered as `<kind>:"<value>"` … The descriptor
    format is normative"), `:18` (byte-exact vector: "A non-existent
    settings-sourced theta directory `~/work/theta` renders `discovery source
    path does not exist: settings:"~/work/theta"`");
    `docs/spec_topics/discovery/discovery-sources.md:9-11`
    (`#descriptor-kinds`: "**Where a diagnostic renders a discovery source as
    a `<descriptor>`**…" — the failure-mode rows' templates are exactly such
    renders); registry rows
    `docs/spec_topics/diagnostics/code-registry-load.md:52` (missing-source),
    `:53` (unreadable-source), `:54` (wrong-type-source), all three *Message*
    templates carrying `<descriptor>`.
  - Counter-sentences (the corpus split — three, not two):
    `docs/spec_topics/discovery/discovery-sources.md:67` (DISC-2 rule 2:
    "Each diagnostic carries the source descriptor in its `message` … e.g.
    `"settings entry index 2"`, `"--theta flag #1"`, `` "package `foo`
    (pi.theta[0])" ``…");
    `docs/spec_topics/discovery/package-and-settings.md:97` ("carry an
    `"settings entry index N"` source descriptor"); and the strongest one,
    `discovery-sources.md:11`'s own 0440-era clause: the five kinds are
    "distinct from the per-source *category* descriptors [DISC-2](#disc-2)
    rule 2 lists (e.g. `project .pi/theta/`, `global thetas directory`);
    the two conventional-root kinds harmonise with those category
    descriptors through the `project` / `global` kind spellings, not by
    embedding those prose labels as values" — the one sentence a fixer
    could read as sanctioning the shipped category text on precisely the
    DISC-2 rule-2 diagnostics. Disposal: the clause governs descriptor
    VALUES (what goes inside `<kind>:"<value>"`), while the registry rows'
    *Message* columns are what select `<descriptor>` at all — it keeps
    prose labels out of values, it does not license rendering them INSTEAD
    of the descriptor form.
- **Observed at:** 401a425b (v0.437.0), offline — scratch vitest driving the
  real `discoverThetas` over `FakeFileSystem` (written, run, deleted).

## Summary

The three DISC-2 failure-mode registry rows all template on `<descriptor>`.
Placeholder-rendering-b.md §5 owns that placeholder's interpolation: a
`kind:value` pair rendered `<kind>:"<value>"`, kinds from the closed five-set
the 0440 fix anchored at `discovery-sources.md#descriptor-kinds`, value the
operator's source text verbatim (settings entry, CLI flag string, npm package
name) or the conventional root's resolved path — "The descriptor format is
normative", with a byte-exact missing-source vector. The shipped emitters
never render that form: `emitSourceFailure` and the package walker's twin
interpolate the prose category labels DISC-2 rule 2 exemplifies. Every
missing/unreadable/wrong-type emission on every source therefore diverges from
the placeholder page, while two other spec sentences still sanction the
shipped bytes (and a third 0440-era clause at `discovery-sources.md:11`
cross-references the category descriptors as "distinct") — a corpus split
the 0440 fix record left standing and named for separate filing.

## Reproduction

Offline, deterministic, at 401a425b. Scratch vitest over the real
`discoverThetas` + `FakeFileSystem` (homedir `/home/theta`, cwd `/project`):

1. `settings: { thetaPaths: ["/project/.pi/nope"], thetaPathsBaseDir:
   "/project/.pi" }` (leaf cleanly missing) →

   ```
   error theta/load/missing-source: discovery source path does not exist: settings entry index 0
   ```

2. `cliPaths: ["/project/.pi/nope2"]` →

   ```
   error theta/load/missing-source: discovery source path does not exist: --theta flag #1
   ```

3. Global root planted as a regular FILE (`/home/theta/.pi/agent/theta` =
   file) →

   ```
   warning theta/load/wrong-type-source: discovery source global thetas directory is neither a .theta file nor a directory of them
   ```

## Expected behaviour

Per `placeholder-rendering-b.md:13`/`:18` and
`discovery-sources.md#descriptor-kinds`, the same three inputs render:

```
discovery source path does not exist: settings:"/project/.pi/nope"
discovery source path does not exist: cli-flag:"--theta /project/.pi/nope2"
discovery source global:"/home/theta/.pi/agent/theta" is neither a .theta file nor a directory of them
```

(the settings value the entry text as written; the cli-flag value the flag
string; the global value the resolved root path forward-slashed — exactly the
derivations the same walk already renders for `cross-source-shadow` since
0440, witnessed in this hunt's probe P3: `'cli-flag:"--theta /opt/cli"' wins
over 'settings:"/opt/set"'`).

## Actual behaviour / root cause

`emitSourceFailure` (`discovery-walk.ts:666`) receives only the category
`descriptor` string; the descriptor VALUE (`entry.descriptorValue`, threaded
by 0440 for the shadow mint) is in scope at every caller but not passed down.
The package walker's `thetasInDirectory` (`package-discovery.ts:539`) has the
package name in hand and renders the category label instead. `rg -n
'does not exist: |is unreadable: |neither a .theta file'` finds no other
emitters. One pass can now render the SAME source under two grammars: a
settings dir that both loses a shadow and carries an unreadable glob subtree
renders `settings:"…"` in the shadow note and `settings entry index 0` in the
unreadable note.

The corpus split: `discovery-sources.md:67` and `package-and-settings.md:97`
still exemplify the category text, while `placeholder-rendering-b.md:13`
declares the descriptor format normative for any diagnostic rendering a
discovery source as `<descriptor>` and `:18` pins the missing-source bytes.
Under `placeholder-rendering-a.md`'s ownership rule (the registry row + the
placeholder category govern rendering), §5 wins on the letter. DISC-2
rule 2 is NOT a stale pre-0440 survivor: 0440 deliberately kept it and
cross-referenced it from the `:11` "distinct from" clause. The split is
between two live 0440-era readings — rule 2's category descriptors as
message-embedded locator text vs §5's normative `<descriptor>`
interpolation for the rows whose *Message* templates carry the placeholder
— and the `:11` clause resolves it on the letter: it distinguishes the
kinds FROM the category labels and bars embedding those labels as values,
so a row that renders `<descriptor>` renders the `<kind>:"<value>"` form.

## Why it matters

- A conformance test written per DIAG-4 from the registry row + §5 vector reds
  against every shipped failure-mode emission; the committed suite instead
  pins the divergent bytes in ten files — offline:
  `tests/discovery-root-enumeration-failure.test.ts`,
  `tests/b0364-healthy-junction-ancestor-misclassifies-missing.test.ts`,
  `tests/discovery-cli-entry-override-prefix.test.ts`,
  `tests/discovery-glob-universe-enumeration-failure.test.ts`,
  `tests/discovery-symlinked-root-classification.test.ts`,
  `tests/discovery-tree-walk-lstat-failure.test.ts`,
  `tests/host-config-dir.test.ts`; live:
  `tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts`,
  `tests/live/discovery-entry-lstat-failure-live-cell.test.ts`,
  `tests/live/live-production-acceptance.test.ts` — so the divergence is
  invisible to the suite and self-reinforcing, and a conforming fix re-pins
  all ten (three of them live).
- The category text drops the operator's own source text: `settings entry
  index 2` forces a count-by-hand against the array, where the pinned form
  carries the entry verbatim; the two grammars in one pass defeat a single
  grep for a source's notes.
- Every future failure-mode emitter inherits whichever grammar it copies —
  the split reproduces.

## Non-goals

- `theta/load/cross-source-shadow` rendering — fixed ground (0440).
- The `theta/load/case-collision` `<source>` token: `discovery-sources.md:11`
  expressly pins it to the CATEGORY label ("the `<source>` token of the
  case-collision message — keeps the Pi spelling: it names the source
  category"), so that row is conformant as shipped; noted only because
  placeholder-rendering-b.md:57 lists `<source>` under the path-shaped
  sub-rule — a residual classification oddity this report does not contest.
- `theta/load/invalid-extension` (`:632-637`) — its template names
  `'thetaPaths[<index>]'`, not `<descriptor>`; out of scope.
- Severity/classification outcomes (DISC-2 table, clean-leaf walk) — correct
  as shipped, witnessed by the probes.

## Fix

Options:

1. **Render the pinned descriptor form at the failure-mode mints
   (recommended).** Pass the already-threaded `descriptorValue` (and source
   kind) into `emitSourceFailure` and the package walker's emitters; render
   via the existing `renderDescriptor` composition. Same commit: rewrite
   `discovery-sources.md:67`'s example list and
   `package-and-settings.md:97` to the descriptor form (the sentences
   sanctioning the category text must move or the corpus stays
   self-contradictory — the `discovery-sources.md:11` "distinct from"
   clause survives unchanged: it already speaks of the category labels as
   things the descriptor form does NOT embed), and re-pin the ten witness
   files (three live). Keeps 0440's
   value-derivation rules exactly (settings entry text verbatim — including a
   relative or `~`-prefixed spelling as written; CLI flag string; package
   name; conventional-root resolved path).
2. **Re-pin §5 to the category text** — rewrite the `<descriptor>` bullet and
   the `:18` vector to the category grammar and drop the failure-mode rows
   from `#descriptor-kinds`' scope. Rejected-shaped: it abandons the
   source-text carriage the descriptor form exists for, contradicts the 0440
   adjudication that made the format normative, and DIAG-4 defers *Message*
   wording changes — the vector rewrite is spec surgery with GOV-7
   implications.

Witness both directions: each of the six sources' missing/unreadable/
wrong-type cells renders its pinned descriptor byte-exactly (the §5 vector's
configuration verbatim for settings), and the shadow row's rendering is
unchanged.

## Provenance

discovery-precedence bug-hunt sweep at 401a425b (v0.437.0), seed lead 1
(0440 fix-record residual 1, fixer-named). Probe
`tests/scratch-disc-precedence.test.ts` cells P1a/P1b/P1c (deleted; outputs
quoted in §Reproduction verbatim). Spec/impl citations read at the pin.
