# Bug 0077 — The settings `thetaPaths` glob matcher compares an entry's basename against the *pattern's* basename, not against the pattern: `thetas/*.theta` silently registers thetas from subdirectories the non-recursion rule excludes, and one `!thetas/*.theta` exclusion silently drops every selected theta in the array — while the package walker's `matchesGlob`, implementing the same DISC-5 sentence, is conformant

- **Status:** open.
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
