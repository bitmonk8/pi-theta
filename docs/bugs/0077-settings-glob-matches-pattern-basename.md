# Bug 0077 — The settings `thetaPaths` glob matcher compares an entry's basename against the *pattern's* basename, not against the pattern: `thetas/*.theta` silently registers thetas from subdirectories the non-recursion rule excludes, and one `!thetas/*.theta` exclusion silently drops every selected theta in the array — while the package walker's `matchesGlob`, implementing the same DISC-5 sentence, is conformant

- **Status:** fixed (0.68.0).
- **Kind:** defect. DISC-5 states which three strings a pattern is attempted
  against; `globMatches` substitutes a fourth comparison the sentence does not
  license, and the substitution is strictly more permissive.
- **Related:**
  - No existing bug touches `discovery-walk.ts`'s settings-glob path.
    [0024](../../../docs/bugs/0024-rebind-self-collision-drops-surviving-names.md)
    (fixed, 0.36.0) is the only prior report citing `discovery-walk.ts`, and it
    cites `resolveSlashNames` (`:903`, `:922–931`) — a later, disjoint stage.
  - Candidate 04 of this hunt
    (`04-cli-entries-not-resolved-by-thetapaths-schema.md`) — adjacent, same
    DISC-5 override grammar, other side: the CLI source applies *none* of it.
- **Affected** (verified at HEAD `d06daae3`, 0.52.0):
  - `src/discovery/discovery-walk.ts:570–577` — `globMatches`, the defect:
    ```ts
    return (
      minimatch(entry.abs, absPattern, { nocase: false }) ||
      minimatch(entry.base, basename(absPattern), { nocase: false })
    );
    ```
    The second disjunct matches the entry's basename against
    `basename(absPattern)` — the pattern's last segment — where DISC-5 pins the
    whole pattern against the basename. The rel-path comparison of the
    three DISC-5 strings is absent entirely.
  - `src/discovery/discovery-walk.ts:715–724` — the `!` step repeats the
    substitution inline (`minimatch(basename(key), basename(entry.abs), …)` at
    `:720`) and iterates over the *whole* `selected` map (`:717`), which by that
    point holds candidates contributed by every plain entry in the array.
  - `src/discovery/discovery-walk.ts:695–705` — `addGlob`; `:535–555` —
    `listTree`, the recursive universe the matcher runs over (it descends every
    real subdirectory, `:548–550`); `:559–568` — `staticPrefixRoot`, which roots
    that universe at the pattern's longest glob-free prefix.
  - `src/discovery/package-discovery.ts:331–339` — **the conformant sibling.**
    `matchesGlob` attempts the whole pattern against `entry.rel`, `entry.base`
    and `entry.abs`, with the doc comment quoting DISC-5. Same spec sentence,
    same `minimatch` options, different code.
  - `docs/spec_topics/discovery/package-and-settings.md:19` (DISC-5) — "Glob
    patterns are matched with the `minimatch` engine … **attempting each pattern
    against the candidate's package-root-relative path, its basename, and its
    POSIX-normalised absolute path**"; and "a match that is a directory is
    scanned non-recursively for `*.theta` children (matching the global
    non-recursion rule at the top of this file)".
  - `docs/spec_topics/discovery/package-and-settings.md:88` — "The glob matcher,
    the `!`/`+`/`-` override ordering, and the exact-path treatment of `+`/`-`
    operands **follow the contract pinned at DISC-5**", i.e. `thetaPaths` is
    bound to the same sentence the package walker implements.
  - `docs/spec_topics/discovery/package-and-settings.md:89` — "A directory entry
    expands to its non-recursive `*.theta` children … **Subdirectories are not
    walked.**"
  - `docs/spec_topics/discovery/discovery-sources.md:9` — "Discovery is
    **non-recursive**".
  - `tests/e2e-s5-disc-cli-settings.test.ts` — the only `thetaPaths` e2e file;
    `rg -n "glob" ` over it returns nothing, and its one non-recursion assertion
    (`:139`) is on a plain directory component. No test in the tree exercises a
    `thetaPaths` glob against a nested tree.
- **Observed at:** `0.52.0` (`d06daae3`). Offline, deterministic — scratch vitest
  driving the real `discoverThetas` and the real `discoverPackageThetas` over
  `tests/helpers/fake-file-system.ts`. Written, run, deleted.

## Summary

`globMatches` reduces a glob entry to its last path segment before matching it
against a candidate's basename. Two consequences, both silent:

1. **Over-inclusion.** `thetas/*.theta` is reduced to `*.theta`, which matches
   every `.theta` basename in the recursively-enumerated universe under
   `thetas/`. Files in subdirectories register, contradicting the non-recursion
   rule three pages state.
2. **Over-exclusion.** The `!` step applies the same reduction and iterates the
   entire selection, not the entry's own subtree. `!thetas/*.theta` is reduced to
   `*.theta` and drops every `.theta` the array selected — including those
   contributed by unrelated entries pointing at unrelated directories.

The package walker implements the same DISC-5 sentence correctly
(`package-discovery.ts:331–339`), so the two sources disagree on the meaning of
one manifest/settings pattern. Measured below on the identical directory shape
and the identical pattern text.

## Reproduction

Offline. Tree (settings base dir `/project/.pi`):

```
/project/.pi/thetas/top.theta
/project/.pi/thetas/sub/deep.theta
/project/.pi/thetas/sub/notes.md
/project/.pi/other/keep.theta
```

**(1) Over-inclusion.**

```ts
await discoverThetas({
  fs,
  settings: { thetaPaths: ["thetas/*.theta"], thetaPathsBaseDir: "/project/.pi" },
});
```

Observed:

```
thetas: [{"name":"top","path":"/project/.pi/thetas/top.theta","source":"settings"},
         {"name":"deep","path":"/project/.pi/thetas/sub/deep.theta","source":"settings"}]
diags:  []
```

`sub/deep.theta` registers `/deep`. `minimatch("/project/.pi/thetas/sub/deep.theta",
"/project/.pi/thetas/*.theta")` is `false` (a single `*` does not cross `/`); the
match comes from the second disjunct, `minimatch("deep.theta", "*.theta")`.

**(2) Over-exclusion.**

```ts
await discoverThetas({
  fs,
  settings: {
    thetaPaths: ["thetas", "other", "!thetas/*.theta"],
    thetaPathsBaseDir: "/project/.pi",
  },
});
```

Observed:

```
thetas: []
diags:  []
```

`other/keep.theta` — selected by an entry the `!` pattern names no part of — is
dropped. Zero thetas, zero diagnostics.

**(3) Control — the package walker, same pattern, same shape.** A package
`p` whose `package.json` carries `pi: { theta: ["thetas/*.theta"] }` over
`thetas/top.theta` + `thetas/sub/deep.theta`:

```
pkg thetas: [{"name":"top","path":"/project/node_modules/p/thetas/top.theta","source":"package"}]
pkg diags:  []
```

One theta. The nested file is not matched. The two implementations of one
sentence disagree.

**(4) Scope bound.** The over-inclusion is bounded by `staticPrefixRoot`: with
`thetaPaths: ["a/*.theta"]` and a sibling `/project/.pi/b/two.theta`, only
`/project/.pi/a/one.theta` is selected — the universe is rooted at
`/project/.pi/a`. The `!` over-exclusion carries no such bound, because it
iterates `selected` rather than a universe.

## Expected behaviour

`docs/spec_topics/discovery/package-and-settings.md:19` pins the matcher: each
pattern is attempted against the candidate's root-relative path, its basename,
and its POSIX-normalised absolute path. `:88` binds `thetaPaths` to that same
contract. Under it, `thetas/*.theta` matches `thetas/top.theta` (relative path)
and not `thetas/sub/deep.theta` (no comparison string of that candidate is
matched by the pattern), so input (1) yields exactly `/top` — the package
walker's answer in control (3).

`:89` and `docs/spec_topics/discovery/discovery-sources.md:9` independently
forbid the subdirectory reach: subdirectories are not walked, discovery is
non-recursive.

For input (2), `!thetas/*.theta` drops `thetas/top.theta` and leaves
`other/keep.theta` selected: DISC-5 step (2) is "`!` patterns drop matching
paths from that set", and `other/keep.theta` matches the pattern under no
DISC-5 comparison. Expected result: `/keep`.

## Actual behaviour / root cause

`globMatches` (`:572–577`) substitutes `basename(absPattern)` for the pattern in
the basename comparison. `basename` (`:130–134`) returns the text after the last
`/`, so every directory qualification in the pattern is discarded before the
comparison that decides the match. The absolute-path disjunct is correct but
subsumed: any candidate the correct rule accepts is also accepted by the loose
one, so the looseness is purely additive.

The universe the matcher runs over is recursive (`listTree`, `:535–555`, which
descends every real directory), so the discarded qualification is exactly the
information that would have kept the match at one level.

The `!` step (`:715–724`) inlines the same substitution instead of calling
`globMatches`, and its iteration domain is `selected` — the accumulated result
of DISC-5 step (1) across *all* plain entries — so a pattern that names one
directory reaches candidates contributed by every other entry.

`package-discovery.ts:331–339` shows the intended code: three comparisons,
whole pattern each time.

## Why it matters

Both directions are silent — zero diagnostics in every measured case.

Over-inclusion registers slash commands the author did not offer: a `thetas/`
directory holding a `sub/` of work-in-progress or vendored `.theta` files
becomes part of the session's command surface, and each such file additionally
enters collision detection, where it can drop an intended same-named theta
through `theta/load/cross-format-collision` (`discovery-walk.ts:937–947`).

Over-exclusion is the sharper case: an author excluding one directory's thetas
loses every theta the array selected, with no diagnostic distinguishing that
from "the array matched nothing". `thetaPaths` is a settings key with no other
surface reporting what it resolved to.

The disagreement with the package walker means the same pattern text means two
things depending on whether it is written in `package.json` `pi.theta` or in
`settings.json` `thetaPaths` — the one place the spec explicitly says they
follow one contract (`:88`).

## Non-goals

Not in scope: minimatch's glob dialect, which DISC-5 explicitly leaves to the
package (`:19`, "this paragraph pins theta's *use* of that matching, not
minimatch's glob dialect"); the `+` / `-` exact-path steps
(`discovery-walk.ts:726–737`), which do not use `globMatches`; whether the
recursive `listTree` universe is itself the right enumeration (it is the right
universe *given* a conformant matcher, since a pattern may legitimately name a
nested path).

## Fix

Replace the second disjunct with the DISC-5 triple, and give the settings path
a root-relative string to compare. Concretely, in `globMatches` (`:572–577`):

```ts
minimatch(entry.abs, absPattern, { nocase: false }) ||
minimatch(entry.base, absPattern, { nocase: false }) ||
minimatch(relativeTo(baseDir, entry.abs), rawPattern, { nocase: false })
```

matching `package-discovery.ts:331–339`'s shape. The rel comparison needs the
entry's path relative to the settings base dir and the *un*-resolved pattern
text; `resolveSettingsSource` (`:614–635`) has both (`baseDir` at `:623`, the
raw operand at `:628`) and currently discards the raw form after resolution, so
`ParsedSettingsEntry` (`:581–586`) gains one field.

The `!` step (`:715–724`) must call the same predicate rather than re-inlining
it. That requires a `TreeEntry`-shaped view of a selected candidate (it holds
only the absolute path today); the minimal form is to keep the `TreeEntry` beside
the `RawCandidate` in `selected`, or to reconstruct `{ abs, base, rel }` from the
key — either is local to `resolveSettingsSource`.

Whether the `!` step should additionally be bounded to its own entry's subtree
is *not* settled by DISC-5: step (2) says "`!` patterns drop matching paths from
that set", where "that set" is the whole starting set. Under a conformant
matcher the global domain stops being hazardous (a pattern naming one directory
cannot match another directory's paths), so no extra bound is needed — but if a
fix keeps the loose matcher for compatibility, the domain must be narrowed, and
that combination needs a spec amendment.

Verification must include a red-before/green-after pair on both input classes
above, plus the package-walker control (3) held green throughout — it is the
oracle. A shared matcher extracted into one module, used by both walkers, would
close the seam permanently; that refactor is optional and larger than the fix.

## Provenance

- Origin: `discovery-ext` bug hunt at HEAD `d06daae3`, seed hypothesis (2)
  (settings/root precedence and entry resolution) while mapping DISC-5 to its
  two enforcement sites.
- Implementation evidence: `src/discovery/discovery-walk.ts:130–134`, `:535–555`,
  `:559–568`, `:570–577`, `:581–586`, `:614–635`, `:695–705`, `:715–724`,
  `:726–737`, `:937–947`; `src/discovery/package-discovery.ts:308–329`,
  `:331–339` — read at `d06daae3`.
- Probe evidence: scratch vitest over the real `discoverThetas` and the real
  `discoverPackageThetas` with `tests/helpers/fake-file-system.ts` +
  `tests/helpers/fake-clock.ts`; four inputs, outputs quoted verbatim above.
  Deleted after the run.
- Spec: `docs/spec_topics/discovery/package-and-settings.md:19` (DISC-5), `:88`,
  `:89`; `docs/spec_topics/discovery/discovery-sources.md:9`.

## Fix (0.68.0)

- **What shipped:**
  - `src/discovery/discovery-walk.ts` — `globMatches` attempts DISC-5's three
    comparison strings instead of two: the entry's POSIX-normalised absolute
    path and its basename against the resolved `absPattern`, and the entry's
    settings-base-relative path against the un-resolved `rawPattern`. The
    `basename(absPattern)` reduction that discarded every directory
    qualification in the pattern is gone. Mirrors `matchesGlob`
    (`src/discovery/package-discovery.ts`), the same sentence's conformant
    sibling, which was not touched.
  - `src/discovery/discovery-walk.ts` — new `relativeToBase`, the
    settings-source analogue of the package walker's per-entry `rel`: it yields
    the base-dir-relative POSIX path, or `undefined` when no base dir is known
    or the candidate lies outside it (a candidate outside the base dir has no
    root-relative comparison string to offer, so the third disjunct is skipped
    rather than faked). Byte-exact prefix test, consistent with DISC-5's
    `nocase: false`.
  - `src/discovery/discovery-walk.ts` — `ParsedSettingsEntry` gains `operand`,
    the override-prefix-stripped operand text as written. The root-relative
    comparison needs the pattern un-resolved: the `abs` form has already
    absorbed the settings-file directory and can only ever match an absolute
    path.
  - `src/discovery/discovery-walk.ts` — the `!` pass in `resolveSettingsSource`
    calls that one predicate instead of re-inlining
    `minimatch(basename(key), basename(entry.abs), …)`. **Route taken for the
    `TreeEntry`-shaped view: reconstruct it from the `selected` map key**
    (`fileEntryOf`), not carry a `TreeEntry` beside the `RawCandidate` — the
    alternative would have to synthesise one inside `addDir` anyway, because
    `enumerateDirectory` returns `RawCandidate[]`. The literal (non-glob) `!`
    arm is unchanged, and the `!` step's iteration domain remains the whole
    `selected` map: bounding it to the entry's own subtree is not settled by
    DISC-5, and under a conformant matcher the global domain stops being
    hazardous, so no extra bound was added.
  - `tests/settings-glob-disc5-matcher.test.ts` — new, four cells: two witnesses
    (red before, green after) and two controls (green throughout).
  - `tests/live/live-production-acceptance.test.ts` — one additive H8a-T cell,
    the first live coverage of a `thetaPaths` glob (`rg -n "thetaPaths"` over
    `tests/live/` previously returned nothing). Registration-only, zero tokens.
  - No spec, registry, reference-mirror or `permitted-codes.json` edit. The fix
    makes the implementation conform to existing prose — DISC-5's three
    comparison strings, the *Glob patterns and exclusions* bullet binding
    `thetaPaths` to that contract, the *Directory entries* bullet's
    "Subdirectories are not walked", and `discovery-sources.md`'s
    "Discovery is **non-recursive**" — so no DIAG-2 row and no new diagnostic
    code were needed. Selection changed; reporting did not.

- **Pre-fix baseline, re-derived at HEAD `3e198ba1` / 0.67.0** (scratch vitest
  over the real `discoverThetas` and the real `discoverPackageThetas` with
  `tests/helpers/fake-file-system.ts` + `tests/helpers/fake-clock.ts`; written,
  run, deleted). All four §Reproduction observables reproduced **verbatim** -
  no drift across the fifteen versions since `d06daae3`:
  (1) `thetas/*.theta` yields `/top` **and** `/deep`, `diags []`;
  (2) `["thetas","other","!thetas/*.theta"]` yields `[]`, `diags []`;
  (3) package control yields one theta `/top`, `diags []`;
  (4) `a/*.theta` with a sibling `b/two.theta` yields `/one` alone, `diags []`.
  Position-only citation drift was substantial and is corrected below.

- **The package-walker oracle agreed after the change.** Control (3) drives the
  untouched `discoverPackageThetas` over cell 1's directory shape and cell 1's
  pattern text and yields `/top` alone; after the fix the settings source yields
  `/top` alone from the same shape and the same text. The two implementations of
  DISC-5 now answer one pattern identically, which the *Glob patterns and
  exclusions* bullet requires and which §Reproduction measured them failing.

- **Gates:**
  - Witness run before the fix — `NO_COLOR=1 npx vitest run
    tests/settings-glob-disc5-matcher.test.ts` gave `Tests 2 failed | 2 passed
    (4)`; cell 1 `expected [ 'deep', 'top' ] to deeply equal [ 'top' ]`, cell 2
    `expected [] to deeply equal [ 'keep' ]`. After the fix: `Tests 4 passed (4)`.
  - Full default suite — `NO_COLOR=1 npx vitest run` gave
    `Test Files 260 passed (260)`, `Tests 3758 passed (3758)`
    (HEAD baseline 259 files / 3754 tests, plus this fix's +1 file / +4 tests).
  - Typecheck — `npx tsc -p tsconfig.json --noEmit` exit 0.
  - Lint — `npm run lint` exit 0.
  - Live — `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` gave `Tests 11 passed (11)`;
    the same runner over `tests/live/acceptance/` gave `Tests 11 passed (11)`.

- **Review:** 3 rounds. Round 1 (deep) — 1 finding, `prose`: `fileEntryOf`'s
  doc-comment asserted that `selected` holds only `.theta` regular files, which
  is disprovable — `enumerateDirectory` admits candidates by extension *name*
  with no `lstat`, so a directory named `weird.theta` enters the map. Hazards
  cleared with reasoning: `relativeToBase` edge cases (trailing slash, root base
  dir, backslash form, sibling-prefix false positive), over-match reintroduction
  under `~` / absolute / `..` operands, the `!` pass's still-global domain, the
  near-unreachable basename disjunct, prose hygiene, witness non-vacuity.
  Round 2 (fixer-light) — reworded that one comment to the true invariant: the
  flags are unread because the predicate reads only `abs` / `base`. Round 3 (fast
  review of the new live cell, then fixer-light) — CLEAN with one `prose`
  residual, the live cell's header citing two spec locations by bare `path:line`;
  replaced with the anchor / quoted-phrase form the sibling witness uses. Both
  polish rounds were comment-only, verified by extracting the executable diff
  lines; confirmation review rounds skipped by the gate-diff rule.

- **Verification:** VERIFIED.
  - *Witness reds for the right reason* — two separate neutralisations, applied
    as targeted byte edits and restored byte-exact (`git hash-object` =
    `71e7260ce0772dea972dd4da929adc3c4fa02c16` before and after, four
    independent checks; no `git stash`, no `checkout`). N1 (basename reduction
    restored, rel disjunct deleted) reds cell 1 with the exact §Reproduction (1)
    signature. N2 (`!` pass re-inlined) reds cell 2 alone with the exact
    §Reproduction (2) signature. Controls 3 and 4 held green under both, so they
    are controls and not witnesses.
  - *Full default suite green* — 260 files / 3758 tests, run twice.
  - *A live test exercises the fixed path* — the new H8a-T cell plants
    `<cwd>/.pi/settings.json` with `thetaPaths: ["thetas/*.theta"]` over
    `.pi/thetas/b77liveglobtop.theta` and `.pi/thetas/sub/b77liveglobdeep.theta`,
    then boots the shipped extension through the real production composition
    root. Green with the fix; RED under N1 with `Registered:
    ["b77liveglobtop","b77liveglobdeep"]`; green again after byte-exact restore.
    Both stems are reachable through no discovery source but the settings glob,
    so the level-matching precondition cannot hold while the exclusion assertion
    passes vacuously.
  - *Lint and typecheck* — both exit 0.

- **Residuals:** none in this fix's surface. The `entry.base` against
  `absPattern` disjunct is near-unreachable for a relative operand (a
  single-segment basename cannot align with a `/`-anchored pattern) and fires
  only for a `~`-prefixed non-`~/` operand, which leaves `absPattern`
  non-absolute. It is retained deliberately: it is DISC-5's second comparison
  string and the shape this §Fix pinned, mirroring the oracle. Fidelity over
  dead-code aesthetics.

- **Discharge notes appended:** `0113` (its binding ordering dependency on this
  report is satisfied; the changed universe-to-selected map is described there
  for its re-derivation) and `0078` (the matcher divergence its Related bullet
  cites is closed).

- **Pinned dispositions / non-goals:** the `!` step is NOT bounded to its own
  entry's subtree (not settled by DISC-5; unnecessary under a conformant
  matcher). No shared matcher module was extracted for the two walkers (named
  optional by this §Fix, larger than the fix). `listTree`'s recursive universe
  is unchanged — it is the right universe *given* a conformant matcher, and its
  own swallow defect is bug 0113's. The `+` / `-` exact-path steps do not use
  `globMatches` and were not touched. minimatch's glob dialect is the package's,
  per DISC-5.

- **Citation drift corrected (cite symbols; the §Affected and §Fix line numbers
  above were taken at `d06daae3`).** At the fixed tree: `basename` `:130`,
  `relativeToBase` `:221` (new), `listTree` `:565`, `staticPrefixRoot` `:589`,
  `globMatches` `:611`, `fileEntryOf` `:634` (new), `ParsedSettingsEntry` `:644`,
  `resolveSettingsSource` `:678`, `addDir` `:714`, `addGlob` `:760`, the `!` pass
  `:781`; `matchesGlob` at `src/discovery/package-discovery.ts:335`. Spec anchors
  are stable and were re-verified: DISC-5 at
  `docs/spec_topics/discovery/package-and-settings.md` anchor `#disc-5`, the
  *Glob patterns and exclusions* and *Directory entries* bullets of the
  `thetaPaths` entry schema, and `docs/spec_topics/discovery/discovery-sources.md`
  opening rule "Discovery is **non-recursive**".
