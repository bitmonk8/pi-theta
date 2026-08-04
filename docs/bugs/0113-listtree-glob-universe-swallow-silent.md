# Bug 0113 — Both `listTree` copies swallow every `readdir` rejection, so a denied subtree under a settings `thetaPaths` glob's or a `pi.theta` pattern's static prefix silently shrinks the universe the pattern is matched against: every `.theta` the pattern would have selected is absent, no diagnostic is emitted on any channel, and the observed state is indistinguishable from a genuinely empty subtree — the residual bug 0076's §Fix deferred, because no spec sentence names a source descriptor for a subtree that no entry names

- **Status:** open. §Fix is not settled: this report exists to pin the spec
  disposition before any code lands. Ordering dependency —
  [0077](./0077-settings-glob-matches-pattern-basename.md) (open) owns
  `globMatches`, the predicate deciding which universe entries reach a caller,
  so either 0077 lands first or this fix re-derives its universe against 0077's.
- **Sev/Diff estimate:** S1/D3 — a `.theta` a `thetaPaths` pattern selects is
  absent from the registered set with zero diagnostics on any channel, and the
  loss is indistinguishable from a genuinely empty directory; D3 because the
  disposition, the source descriptor and the DIAG-2 *Trigger* are all
  adjudicated in-run and the fix is ordered behind 0077.
- **Kind:** defect against `docs/spec_topics/discovery/discovery-sources.md:67`
  on the better-supported reading, and a spec gap on the other. `:67` forbids
  silence for "failures encountered while walking a root that does [exist]";
  both `listTree` copies drop the rejection. Neither copy takes a `diagnostics`
  parameter (`src/discovery/discovery-walk.ts:547`,
  `src/discovery/package-discovery.ts:310`), so each is structurally incapable
  of emitting as written. Which sentence governs is argued in
  §Expected behaviour; the adjudication is this report's deliverable.
- **Related:**
  - [0076](./0076-existing-root-enumeration-failure-silent.md) — **fixed
    (0.67.0)**, the parent. Its §Fix closed the same swallow at
    `enumerateDirectory` (named roots) and at `thetasInDirectory` (the package
    walker's `theta/` directory and `pi.theta`-contributed directories), and
    deferred `listTree` in terms: "for `listTree` a separate adjudication — its
    swallow shrinks a *glob universe* rather than a named root, and no spec text
    prescribes a disposition for a denied subtree under a glob's static prefix.
    That sub-case is a spec gap and should be pinned before it is coded." Its fix
    record repeats the deferral as §Fix (0.67.0) (c) and residual 1. This report
    is that adjudication.
  - [0077](./0077-settings-glob-matches-pattern-basename.md) — **open**, the
    ordering constraint. It owns `globMatches`
    (`src/discovery/discovery-walk.ts:584–589`), and its §Fix replaces the second
    disjunct and adds a settings-base-relative third, plus routes the `!` step
    through the same predicate. That changes which universe entries reach
    `addDir` / `addFile`, so a disposition pinned over today's universe→selected
    map can be invalidated by it. 0077 does not touch `listTree` and does not fix
    this report's defect: its §Affected cites `listTree` only as "the recursive
    universe the matcher runs over".
  - [0075](./0075-symlinked-root-classified-wrong-type.md) — **open**, adjacent
    input class on the same file. There `classifyPath` mis-types a link-typed
    candidate so it never reaches enumeration; here enumeration runs and the
    rejection is dropped. Disjoint code lines
    (`discovery-walk.ts:273–291` against `:547–567`).
  - [0078](./0078-cli-entries-not-resolved-by-thetapaths-schema.md) — **open**,
    the `--theta` component / `thetaPaths` entry schema. The CLI source reaches
    no glob universe today (`discoverThetas` routes `cliPaths` through
    `collectFromEntries`, `discovery-walk.ts:766–777`), so if 0078 gives the CLI
    row the `thetaPaths` schema it adds a third row this defect reaches, at the
    CLI row's error severity.
  - [0013](./0013-load-warnings-dropped-by-both-production-sinks.md) — **fixed
    (0.24.0)**, the sink half. Both rows this defect touches carry `warning` in
    the *Unreadable path* column, so a warning no sink surfaces is not a fix:
    any route here confirms the channel end to end, as bug 0076's fix record
    (g) does for `enumerateDirectory`.
- **Affected** (every citation verified at HEAD `c578df51`, 0.67.0):
  - `src/discovery/discovery-walk.ts:544–567` — **defect site 1**, the
    settings-glob universe. `listTree` is declared at `:547` with the signature
    `(fs: FileSystem, root: string)`: no `diagnostics` parameter. The inner
    `walk` maps the `readdir` rejection to `undefined` without capturing `.code`
    (`:550–553`) and returns from that subtree in silence (`:554`). A second
    swallow sits at `:557–558`: an entry whose `lstat` fails is skipped with
    `continue`.
  - `src/discovery/discovery-walk.ts:652–659` — `treeCache` and `treeFor`, the
    only caller (`listTree` at `:656`). The cache is keyed on the static-prefix
    root, so one denial shrinks the universe of every glob entry sharing that
    prefix.
  - `src/discovery/discovery-walk.ts:707–717` — `addGlob`, the only caller of
    `treeFor`: `:708` builds the universe, `:710` filters it through
    `globMatches`, `:712` sends a matched directory to `addDir` and `:714` sends
    a matched file to `addFile`. An entry absent from the universe reaches
    neither arm, so bug 0076's emitter is never entered for it.
  - `src/discovery/discovery-walk.ts:571–580` — `staticPrefixRoot`, which roots
    the universe at the pattern's longest glob-free leading segment run.
  - `src/discovery/discovery-walk.ts:626–630` — `resolveSettingsSource`, whose
    `diagnostics` parameter (`:629`) is in scope at the `listTree` call site;
    `:783` its call from `discoverThetas`. The sink is reachable from the
    enclosing scope — the gap is the two signatures, not an unavailable sink.
  - `src/discovery/package-discovery.ts:308–331` — **defect site 2**, the
    `pi.theta` universe. `listTree` is declared at `:310` with the same
    `diagnostics`-free signature; the rejection is dropped inside `readdirOr`
    (`:313`, defined `:161–166`) and the subtree returns silently (`:314`). The
    same second `lstat` swallow sits at `:318–322`.
  - `src/discovery/package-discovery.ts:394` — the only `listTree` call, inside
    `resolvePiThetas` (signature `:365–371`, `diagnostics` at `:370`). All four
    override stages (`:396–424`) and the per-match contribution loop
    (`:429–445`) iterate `universe`, so a shrunken universe removes an entry from
    every stage at once, including the `+` re-admission at `:413–418`.
  - `src/discovery/package-discovery.ts:538–574` — `resolvePackage`, which routes
    the manifest arm to `resolvePiThetas` (`:573`) and the conventional `theta/`
    fallback to `thetasInDirectory` (`:556–562`). The fallback builds no
    universe, so the `Package theta/ directory` row is out of reach.
  - `src/discovery/discovery-walk.ts:299–324` — `enumerateDirectory` after bug
    0076: it captures the rejection's `.code` (`:313–316`) and emits through
    `emitSourceFailure` (`:317–323`). `src/discovery/package-discovery.ts:449–509`
    — `thetasInDirectory` after the same fix. These are the sites that now report
    and the contrast that makes this report a residual.
  - `src/discovery/discovery-walk.ts:444–462` — `emitSourceFailure`, the emitter
    a fix here would reuse; `:243–251` — `ancestorsClean`, the
    `discovery-sources.md:66` walk; `:222–228` — `nodeErrorCode`, the `.code`
    reader. All three exist and are unreferenced by either `listTree`.
  - `src/discovery/discovery-walk.ts:100–114` — the three `FailureModes` values.
    `SETTINGS_MODES` (`:105–109`) is `{ missing: "error", unreadable: "warning",
    wrongType: "error" }`, so a settings-side emission is a warning.
  - `src/discovery/discovery-walk.ts:584–589` — `globMatches`, bug 0077's
    subject and the predicate that decides which universe entries survive.
  - `src/extension/production-composition.ts:447`, `:461` — the two
    `sink.emitGroup` calls carrying `walk.diagnostics` and
    `packageWalk.diagnostics`; `:1115–1132` — `emitLoadNoteGroup`, whose warning
    arm (`:1126–1131`) selects on `severity === "warning"` with no code
    allow-list; `:1136–1139` — `loadSink`. This is the channel a warning-severity
    disposition would travel.
  - `docs/spec_topics/discovery/discovery-sources.md:39–45` — the *Source
    priority* list, the five sources Reading B in §Expected behaviour treats as the
    referents of "a discovery root".
  - `docs/spec_topics/discovery/discovery-sources.md:47` — DISC-2's asymmetry
    paragraph, which makes *explicit references* ("`pi.theta` entries, settings
    entries, `--theta` flags") non-silent "because the author named it and expects
    it to resolve"; `:49–56` — the failure-modes table. `:54` (`Package pi.theta
    entry`) and `:55` (`Settings thetaPaths entry`) are the two rows the two
    `listTree` copies serve; both carry `warning` under *Unreadable path*.
  - `docs/spec_topics/discovery/discovery-sources.md:61` — rule 2: every such
    diagnostic carries "the source descriptor in its `message` so the author can
    locate the offending configuration", with `"settings entry index 2"` and
    `` "package `foo` (pi.theta[0])" `` among the named forms. This is the
    obligation a denied subtree cannot discharge as written.
  - `docs/spec_topics/discovery/discovery-sources.md:62` — rule 3: errors are
    fatal for the offending entry only.
  - `docs/spec_topics/discovery/discovery-sources.md:66` — the clean-leaf-`ENOENT`
    ancestor walk, the `EACCES` / `EPERM` / `ENOTDIR` code list, and the Windows
    motivation ("a parent ACL denies enumeration"). Neither `listTree` runs this
    walk or inspects a code.
  - `docs/spec_topics/discovery/discovery-sources.md:67` — "A symlink loop or
    other traversal failure *inside* a discovery root that does exist is an
    unreadable-source warning, **not silence** — the silent-on-missing rule
    applies to the *root* itself not existing, not to failures encountered while
    walking a root that does."
  - `docs/spec_topics/discovery/discovery-sources.md:68` — "an empty directory —
    or one whose entries are all non-`.theta` files — enumerates zero thetas
    successfully and emits no diagnostic", and the sentence treating a directory
    entry "like a per-source root". The control any fix preserves, and the state
    this defect is currently indistinguishable from.
  - `docs/spec_topics/discovery/discovery-sources.md:9` — "Discovery is
    **non-recursive**", the rule that scopes what a *directory entry* expands to;
    it does not bound which paths a glob pattern may name.
  - `docs/spec_topics/discovery/package-and-settings.md:19` — DISC-5: the
    matcher engine, the three strings each pattern is attempted against, the
    per-match contribution rule ("a match that is a `.theta` file registers that
    file directly"), and the four-stage override order. `:88` binds `thetaPaths`
    globs to the same contract with the resolution base changed. `:82–92` is the
    `thetaPaths` entry schema.
  - `docs/spec_topics/discovery/package-and-settings.md:94` — "Path-existence and
    permission failures (missing path, unreadable path, wrong file/directory
    type) are covered by the *Settings `thetaPaths` entry* row of the
    failure-modes table at the top of this file; the diagnostics there … carry an
    `"settings entry index N"` source descriptor identifying the offending array
    index." The sentence is unqualified as to literal against glob entries.
  - `docs/spec_topics/discovery/package-and-settings.md:27` — "A glob pattern
    that resolves to zero files is silent (not an error)", the text the
    silence-by-design reading rests on; `:25` names the
    `` "package `foo` (pi.theta)" `` descriptor form; `:29` and `:89` state the
    `theta/` fallback's and a directory entry's non-recursion; `:32` restates
    that the two package rows of the failure-modes table apply.
  - `docs/spec_topics/diagnostics/code-registry-load.md:47` — the
    `theta/load/unreadable-source` row. *Trigger*: "A discovery source's path
    exists but cannot be read (permission denied, ACL, symlink loop at the root,
    transient I/O error)"; severity "error only for `--theta` flags, warning for
    every other source"; *Message* `discovery source is unreadable: <descriptor>`.
    `:46` is the `theta/load/missing-source` row.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; a *Trigger* change is a spec change landing in the same commit);
    `:74` — DIAG-4 (the *Message* column is normative and a reword is deferred to
    theta 2.0).
  - `docs/reference/discovery-cli.md:46–60` — the user-facing table mirror, its
    code list (`:55–58`) and its empty-directory sentence (`:59–60`);
    `docs/reference/diagnostics.md:211–212` — the *Message* mirror, which carries
    no *Trigger* column.
  - `tests/discovery-root-enumeration-failure.test.ts` — bug 0076's witness, 17
    cells, the harness to mirror. Its header records the deferral at `:95–107`
    and states the latitude precisely: cells 6 (`:612–641`) and 14 (`:895–952`)
    "assert 'at least one matching diagnostic' rather than an exact pass-wide
    count, because `listTree` traverses their denied path too", so a later fix
    that also emits there stays possible; cell 12 pins an exact pass-wide count
    because with `pi.theta` absent no `listTree` runs. The local `ReaddirDenied`
    decorator (`:294–344`) is the injection seam — `readdir` rejects for one path
    with a Node-style `.code`, every other member delegates to a
    `FakeFileSystem`.
  - `tests/load-warning-delivery.test.ts:564` — bug 0013's pin, a
    warning-severity load diagnostic witnessed arriving on the
    `theta-system-note` channel through the real `composeExtensionInstance`.
  - **Test coverage of this defect: none.** No test in the tree drives a
    `thetaPaths` glob or a `pi.theta` pattern against a denied subtree in either
    direction. The only `thetaPaths` glob in the whole suite is
    `tests/discovery-root-enumeration-failure.test.ts:628` (`["g/*"]`, cell 6,
    which asserts the named-directory emission and nothing about the universe);
    every `pi.theta` array in `tests/package-discovery.test.ts` is a
    single-segment pattern or a literal (`:181`, `:207`, `:237`, `:258`, `:289`,
    `:377–379`, `:406–408`).
- **Observed at:** `0.67.0` (HEAD `c578df51`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving the real `discoverThetas` and the
  real `discoverPackageThetas` over the delegating `ReaddirDenied` seam bug
  0076's witness establishes — `readdir` rejects for exactly one path with a
  Node-style `.code`, every other member delegates to the stock
  `FakeFileSystem`, so `lstat` still reports the denied path as a directory. No
  ACL was manipulated and no file was planted; written, run, deleted.

## Summary

A settings `thetaPaths` glob and a package `pi.theta` pattern are both matched
against a *universe*: the recursive enumeration of every path under the pattern's
static-prefix root (`discovery-walk.ts:571–580`) or under the package root
(`package-discovery.ts:394`). `listTree` builds that universe, and in both copies
it drops every `readdir` rejection without capturing the code and returns from
the failing subtree in silence (`discovery-walk.ts:550–554`;
`package-discovery.ts:313–314`). Neither copy takes a `diagnostics` parameter, so
neither can report.

The consequence is a shrunken universe. Paths under the denied subtree are absent
from it, so they reach no override stage, no match test and no contribution arm.
A `.theta` the pattern selects is therefore absent from the registered set, and
because the reduced universe is a well-formed value, nothing anywhere observes
that it is short: measured below, a `thetaPaths` entry `g/**/*.theta` over a tree
whose one subtree denies `readdir` registers zero thetas and emits zero
diagnostics, where the identical tree without the denial registers the theta.

The observed state is indistinguishable from `discovery-sources.md:68`'s empty
directory, which the spec requires to stay silent — the two are conflated at the
point where the distinguishing information (the rejection code) has already been
discarded. The universe walk also performs no `discovery-sources.md:66` ancestor
walk and inspects no code at all, so an `EACCES`, an `EPERM` and a clean-leaf
`ENOENT` under the prefix are one indistinguishable outcome.

This is bug 0076's residual 1, deferred by that report's own §Fix. 0076 closed
the identical swallow at `enumerateDirectory` (the CLI, project, global and
settings *named* roots) and at `thetasInDirectory` (the package walker's `theta/`
directory and each directory a `pi.theta` entry contributes), emitting
`theta/load/unreadable-source` or `theta/load/missing-source` at the calling
source's severity. It left `listTree` untouched on the stated ground that no spec
text prescribes a disposition for a denied subtree under a glob's static prefix,
and that pinning one requires deciding what descriptor `discovery-sources.md:61`
names for a subtree that is not a named source. The contrast is measurable at one
HEAD: on the same fixture and the same denied path, the pattern
`g/*` (which matches the denied directory itself) produces a warning naming
`settings entry index 0`, while `g/**/*.theta` (which would have matched the file
inside it) produces nothing.

## Reproduction

Offline, at `c578df51`. Scratch vitest: the real `discoverThetas` and the real
`discoverPackageThetas` over a `ReaddirDenied` decorator that rejects `readdir`
for exactly one path with a Node-style `.code` and delegates every other member —
notably `lstat` — to a stock `FakeFileSystem`. The decorator is
`tests/discovery-root-enumeration-failure.test.ts:294–344` verbatim in shape.
`thetas` is the registered set (name and path); `diags` is the pass's whole
`diagnostics` array, unfiltered.

### The measurement — a settings glob whose universe loses a subtree

Tree: `/project/.pi/g` holds `sub/`; `sub/` holds `s.theta`. Settings:
`thetaPaths: ["g/**/*.theta"]`, `thetaPathsBaseDir: "/project/.pi"`. The static
prefix root is `/project/.pi/g`, whose own `readdir` succeeds.

```
@@ readdir("/project/.pi/g/sub") rejects EACCES
   thetas :: []
   diags  :: []
@@ no denial                                                          [control]
   thetas :: [{"name":"s","path":"/project/.pi/g/sub/s.theta"}]
   diags  :: []
@@ readdir("/project/.pi/g/sub") rejects EPERM
   thetas :: 0    diags :: []
@@ readdir("/project/.pi/g/sub") rejects ENOENT
   thetas :: 0    diags :: []
```

The control establishes that the pattern selects the file: the loss is the
universe, not the match. The three rejection codes are one outcome — no code is
read and no `:66` ancestor walk runs, so the classification the other two
enumeration sites make after bug 0076 is unavailable here by construction.

### The loss is per-subtree, and the rest of the pass is undisturbed

Tree: `/project/.pi/g` holds `ok/` and `denied/`; each holds one `.theta`.

```
@@ readdir("/project/.pi/g/denied") rejects EACCES
   thetas :: [{"name":"a","path":"/project/.pi/g/ok/a.theta"}]
   diags  :: []
@@ no denial                                                          [control]
   thetas :: [{"name":"a","path":"/project/.pi/g/ok/a.theta"},
              {"name":"b","path":"/project/.pi/g/denied/b.theta"}]
   diags  :: []
```

`discovery-sources.md:62` is satisfied — the pass completes and the readable
sibling registers — and that is what makes the loss hard to notice: the operator
sees a plausible, non-empty inventory that is one theta short.

### One denial shrinks every entry sharing the static prefix

`treeFor` (`discovery-walk.ts:652–659`) caches the universe by static-prefix
root. Tree: `/project/.pi/g/sub` holds `s.theta` and `t.theta`.

```
@@ thetaPaths ["g/**/s.theta", "g/**/t.theta"], readdir("/project/.pi/g/sub") EACCES
   thetas :: 0    diags :: []
@@ same two entries, no denial                                        [control]
   thetas :: ["/project/.pi/g/sub/s.theta", "/project/.pi/g/sub/t.theta"]
   diags  :: []
```

At the moment the rejection is observed no single `thetaPaths` entry owns it. This
is the attribution problem the descriptor question in §Fix (a) has to answer.

### The glob's own static prefix root, denied

```
@@ thetaPaths ["g/**/*.theta"], readdir("/project/.pi/g") rejects EACCES
   thetas :: 0    diags :: []
```

Sharper than a subtree: `/project/.pi/g` is the directory the entry text names
literally, and it produces nothing. A glob entry never reaches `classifyPath` —
`resolveSettingsSource` routes it to `addGlob` (`discovery-walk.ts:722`), not
`addLiteral` — so the entry-level classification that reports a denied literal
directory (`:696–698`) is not on this path either.

### The contrast that makes this a residual — same fixture, same denied path

```
@@ thetaPaths ["g/*"],        readdir("/project/.pi/g/sub") EACCES
   thetas :: 0
   diags  :: [{"severity":"warning","code":"theta/load/unreadable-source",
               "file":"/project/.pi/g/sub",
               "message":"discovery source is unreadable: settings entry index 0"}]
@@ thetaPaths ["g/**/*.theta"], readdir("/project/.pi/g/sub") EACCES
   thetas :: 0    diags :: []
```

`g/*` matches the denied *directory*, which is in the universe (its own `lstat`
succeeded while its parent was being walked), so `addGlob` sends it to `addDir` →
`enumerateDirectory`, which reports after bug 0076. `g/**/*.theta` matches only
the *file* inside it, which the shrunken universe does not hold, so no arm is
entered. One HEAD, one fixture, one denied path, two dispositions decided by
pattern shape.

### The controls a fix must preserve

```
@@ /project/.pi/g/sub exists and is genuinely EMPTY, thetaPaths ["g/**/*.theta"]
   thetas :: 0    diags :: []
@@ /project/.pi/g does not exist at all,             thetaPaths ["g/**/*.theta"]
   thetas :: 0    diags :: []
```

The first is `discovery-sources.md:68`; the second is
`package-and-settings.md:27` (a glob resolving to zero files is silent). Both are
currently indistinguishable from the denied cases above.

### A `+` operand recovers the file, which locates the loss precisely

```
@@ thetaPaths ["g/**/*.theta", "+g/sub/s.theta"], readdir("/project/.pi/g/sub") EACCES
   thetas :: ["/project/.pi/g/sub/s.theta"]    diags :: []
```

Stage (3) routes a `+` operand through `addLiteral` (`discovery-walk.ts:738–741`),
which calls `classifyPath` on the file itself. The file's `lstat` succeeds and it
registers. The `.theta` is readable throughout — only the universe that would
have found it is short.

### The package walker's copy

Package `beta` under `/project/node_modules`, `package.json` carrying
`pi.theta: ["**/*.theta"]`, a `cmds/` directory holding `b.theta`.

```
@@ readdir("…/beta/cmds") rejects EACCES
   thetas :: []    diags :: []
@@ no denial                                                          [control]
   thetas :: [{"name":"b","path":"/project/node_modules/beta/cmds/b.theta"}]
   diags  :: []
```

The same contrast holds on this side. With `pi.theta: []` the empty plain-include
set selects the whole universe (`package-discovery.ts:398–399`), which holds the
denied *directory*, so the per-match loop sends it to `thetasInDirectory` and bug
0076's emitter fires:

```
@@ pi.theta [], readdir("…/beta/cmds") rejects EACCES
   thetas :: 0
   diags  :: [{"severity":"warning","code":"theta/load/unreadable-source",
               "file":"/project/node_modules/beta/cmds",
               "message":"discovery source is unreadable: package `beta` (pi.theta)"}]
```

The conventional `theta/` fallback is out of reach, and loses nothing:

```
@@ package gamma, no pi.theta field, theta/ holds g.theta and nested/n.theta,
   readdir("…/gamma/theta/nested") rejects EACCES
   thetas :: ["/project/node_modules/gamma/theta/g.theta"]    diags :: []
```

`resolvePackage`'s fallback arm calls `thetasInDirectory` directly
(`package-discovery.ts:556–562`) and builds no universe; `nested/n.theta` is
excluded by the non-recursion rule (`package-and-settings.md:29`, `:89`), not by
the denial. No theta is lost, so no diagnostic is owed.

## Expected behaviour

The anchor is `docs/spec_topics/discovery/discovery-sources.md:67`:

> A symlink loop or other traversal failure *inside* a discovery root that does
> exist is an unreadable-source warning, **not silence** — the silent-on-missing
> rule applies to the *root* itself not existing, not to failures encountered
> while walking a root that does.

Two readings are available, and which one governs is the adjudication this report
owes.

**Reading A — `:67` already covers it; the implementation is non-conformant.**
A denied subtree under a glob's static prefix is a traversal failure encountered
while walking a root that exists. Measured: the static prefix root
`/project/.pi/g` enumerates successfully and the failure is one level below it.
`:68` states that a directory a settings entry points at is "treated like a
per-source root", and a glob entry's static prefix is the glob-free directory
portion of that same entry text — under the denied-prefix-root row above, the
literal directory the author typed. `package-and-settings.md:94` then binds the
settings side explicitly: "Path-existence and permission failures (missing path,
unreadable path, wrong file/directory type) are covered by the *Settings
`thetaPaths` entry* row of the failure-modes table", with the
`"settings entry index N"` descriptor "identifying the offending array index".
That sentence is unqualified as to literal against glob entries, and `:88` binds
glob resolution into the same schema. On this reading the disposition is already
prescribed — a warning at the settings source's severity (`:55`), and a warning
at the `Package pi.theta entry` row's (`:54`) — and `:61`'s descriptor form is
already spec vocabulary.

**Reading B — the glob universe is not a "discovery root", so the text is
silent.** `:67`'s subject is "a discovery root", and the roots the *Source
priority* list enumerates (`:39–45`) are the five sources. A static-prefix root is
computed from a pattern by `staticPrefixRoot`, not named by the author; the author
named the pattern. On this reading `package-and-settings.md:27` governs instead —
"A glob pattern that resolves to zero files is silent (not an error)" — and a
shrunken universe does resolve to zero files. `:61`'s descriptor obligation
reinforces the reading: it presumes a source descriptor exists, and a subtree
below a prefix that no entry names has none.

**Reading A is better supported.** Four reasons:

1. `:67` is an implementation note under DISC-2 and is written negatively: it
   forbids silence for "failures encountered while walking a root that does
   [exist]". Its operative distinction is *root absent* against *failure during
   the walk*, not *named root* against *derived root*. This defect's whole input
   class sits on the forbidden side of that line.
2. `:68`'s empty-directory carve-out has work to do only if failed enumeration is
   not silent. If both states were silent by design the sentence would be
   redundant. Measured, the implementation makes it redundant: a genuinely empty
   subtree and a denied one produce the identical `thetas 0, diags []`.
3. `package-and-settings.md:94` decides the settings side on its own terms, and
   it answers the descriptor question with existing vocabulary. Reading B has to
   read a qualification into that sentence that its text does not carry.
4. Reading B's strongest text, `:27`, is about a pattern that matches nothing in
   a universe that was fully enumerated — the ordinary authoring case. It says
   nothing about a universe the walk failed to build. Treating it as licence for
   silence here makes the general rule about match arity override the specific
   rule about traversal failure.

Reading A does not make the text complete. `:67` names "a symlink loop or other
traversal failure" and a root, and no sentence says the universe enumeration is a
walk of a root in that sense, or what descriptor a subtree carries. One
clarifying sentence is owed — at `:67` or in the `thetaPaths` entry schema beside
`:94` — before code lands. That sentence is what this report asks for.

Under Reading A, on the measured input:

- The `Settings thetaPaths entry` row emits one `theta/load/unreadable-source` at
  `warning` (`:55`, `SETTINGS_MODES.unreadable`), `file` = the denied subtree
  path, and the source descriptor in the message (`:61`).
- The `Package pi.theta entry` row emits the same code at `warning` (`:54`), with the
  `` package `<name>` (pi.theta) `` descriptor `package-and-settings.md:25`
  already names and `thetasInDirectory` already emits.
- The rejection-code classification the other two enumeration sites make after
  bug 0076 applies here too (`:66`): a clean-leaf `ENOENT` is *missing*, anything
  else is *unreadable*.
- `discovery-sources.md:62` continues to hold: the readable siblings register and
  the pass completes.
- `:68` and `package-and-settings.md:27` continue to hold: a genuinely empty
  subtree, and a static prefix root that does not exist, stay silent.

## Actual behaviour / root cause

**Both copies discard the rejection, and neither can report.** The settings copy
(`src/discovery/discovery-walk.ts:547–567`):

```ts
async function listTree(fs: FileSystem, root: string): Promise<TreeEntry[]> {
  const out: TreeEntry[] = [];
  const walk = async (dir: string): Promise<void> => {
    const names = await fs.readdir(dir).then(
      (n) => n,
      () => undefined,                 // .code not captured
    );
    if (names === undefined) return;   // no diagnostic
```

The package copy (`src/discovery/package-discovery.ts:310–314`):

```ts
async function listTree(fs: FileSystem, root: string): Promise<TreeEntry[]> {
  const out: TreeEntry[] = [];
  const walk = async (dir: string, relBase: string): Promise<void> => {
    const names = await readdirOr(fs, dir);
    if (names === undefined) return;   // no diagnostic
```

`readdirOr` (`:161–166`) is the same rejection-to-`undefined` map behind a helper.
Both signatures are `(fs: FileSystem, root: string)`: there is no `diagnostics`
parameter, so neither function can emit as written. Both also swallow an entry's
`lstat` failure with `continue` (`discovery-walk.ts:557–558`,
`package-discovery.ts:318–322`), which drops one entry rather than one subtree.

**The sink is one frame away.** `resolveSettingsSource` holds `diagnostics`
(`:629`) and `resolvePiThetas` holds it (`:370`); each is the direct enclosing
scope of its `listTree` call (`:656` through `treeFor`, and `:394`). The
structural incapacity is the two signatures, not an unreachable sink.

**A short universe removes an entry from every stage at once.** Both resolvers
iterate the universe. On the settings side `addGlob` (`:707–717`) filters it
through `globMatches` and dispatches per match; on the package side all four
override stages (`:396–424`) and the contribution loop (`:429–445`) iterate it.
An absent path is not selected, not dropped, not re-admitted, not contributed —
and never presented to any predicate, so no predicate can notice it is gone. Bug
0076's emitters sit downstream of that filter: `enumerateDirectory` is reached
only from `addDir` (`:662`, called at `:712`) and `thetasInDirectory` only from
the contribution loop (`:434`), so a path the universe never held reaches neither.

**No code is read, so the DISC-2 classification is unavailable.** Measured:
`EACCES`, `EPERM` and `ENOENT` at the same path are one outcome. The three
ingredients the fix needs are all present in the same files and unreferenced by
either `listTree` — `nodeErrorCode` (`discovery-walk.ts:222–228`,
`package-discovery.ts:135–141`), `ancestorsClean` (`discovery-walk.ts:243–251`)
and `emitSourceFailure` (`:444–462`).

**The shared universe cache defers attribution.** `treeFor` (`:652–659`) keys the
universe on the static-prefix root, so several `thetaPaths` entries share one
walk and one rejection. At the point of observation the rejection belongs to no
entry. Attribution therefore has to move to the caller, or the walk has to become
per-entry — a choice §Fix (a) must make, not an implementation detail.

**The reduced universe is a well-formed value, so no post-condition exists.**
`listTree` returns `TreeEntry[]`. A short array and a complete array are the same
type, and no caller carries an expected size. This is the same conflation bug 0076
identified at `enumerateDirectory` — "the two states are conflated at the point
where the distinguishing information (the `.code`) has already been thrown away" —
one layer out: there the ambiguous value was `[]` from one directory, here it is a
silently incomplete tree.

**Reach, per copy.** `discovery-walk.ts:547` has one caller chain
(`treeFor` → `addGlob`) and serves exactly the `Settings thetaPaths entry` row
(`discovery-sources.md:55`). `package-discovery.ts:310` has one caller (`:394`
inside `resolvePiThetas`, reached from `resolvePackage`'s manifest arm at `:573`)
and serves exactly the `Package pi.theta entry` row (`:54`). The
`Package theta/ directory` row is not reachable: its fallback calls
`thetasInDirectory` directly (`:556–562`) and the row's non-recursion
(`package-and-settings.md:29`) means a denied subdirectory of `theta/` costs
nothing — measured. `enumerateRoot`'s swallow for the five installed-package
roots (`package-discovery.ts:256–260`) is a third, correct site: those roots are
DISC-6's, not DISC-2 rows, and a root that does not exist is silent by design.

## Why it matters

- **Silent loss with zero diagnostics.** Measured: a `thetaPaths` entry whose
  pattern selects a `.theta` registers nothing and emits nothing. The registered
  set is short and no diagnostic marks it as short, so the session has no
  `/<name>` for that theta and no code, message or severity anywhere records
  why. The pass's `diagnostics` array is the only channel the walk has, and it is
  empty.
- **The loss is partial, so the inventory looks plausible.** Readable siblings
  register. The operator sees a working, non-empty set of thetas that is short by
  exactly the denied subtree's contents, with nothing to compare against.
- **The state is reachable in ordinary deployments.**
  `discovery-sources.md:66` names `EACCES`, `EPERM` and `ENOTDIR` as the codes
  the classification branches on and gives "a parent ACL denies enumeration" as
  the Windows case the rule exists for. A `thetaPaths` glob rooted at a shared
  directory, or a package installed with restrictive modes under a `pi.theta`
  pattern, produces the state without any author error.
- **Two dispositions for one denied path, chosen by pattern shape.** On one
  fixture and one HEAD, `g/*` warns and `g/**/*.theta` is silent. An author
  cannot predict which they get, and the difference has no basis in any spec
  sentence.
- **The `:68` control is currently vacuous.** A genuinely empty subtree and a
  denied one are the same observed value, so the sentence distinguishing them
  distinguishes nothing at the two universe sites.
- **Both reachable rows are explicit references.** DISC-2's asymmetry paragraph
  (`:47`) makes *explicit references* — "`pi.theta` entries, settings entries,
  `--theta` flags" — non-silent "because the author named it and expects it to
  resolve", and all three cells of both rows (`:54`, `:55`) are `error` or
  `warning`. The author wrote the pattern, and the walk answers with a shorter
  set and no report.
- **Nothing in the suite scores it.** No test drives either copy against a denied
  subtree. Bug 0076's witness deliberately leaves room for a diagnostic here
  (cells 6 and 14 assert "at least one" rather than an exact count), and that
  room is currently unoccupied.

## Non-goals

- **`globMatches`' non-conformance.** Which universe entries a pattern selects is
  bug 0077's subject (`discovery-walk.ts:584–589`). This report measures what the
  universe *contains*; it does not adjudicate the predicate applied to it. The
  ordering constraint between the two is in §Fix (d).
- **`classifyPath`'s treatment of link-typed candidates.** Bug 0075's subject
  (`discovery-walk.ts:273–291`), a disjoint input class reached before any
  enumeration.
- **The per-entry `lstat` swallow inside both `listTree` copies.**
  `discovery-walk.ts:557–558` and `package-discovery.ts:318–322` skip an entry
  whose `lstat` fails, which loses one path rather than one subtree, and overlaps
  the `theta/load/unreadable` per-file warning at `validateAndRead` and bug
  0075's classification question. Whether that arm owes a diagnostic is a
  separate adjudication; this report's subject is the `readdir` rejection.
- **`enumerateRoot`'s swallow** (`package-discovery.ts:256–260`) for the five
  installed-package roots. Those roots are DISC-6's, not DISC-2 rows, and their
  silent absence is stated at `package-and-settings.md:7`.
- **The DISC-6 bounds.** `theta/load/discovery-slow` and
  `theta/load/package-read-timeout` are a separate mechanism with their own
  registry rows.
- **The non-recursion rule's scope.** Whether a `**` pattern *should* select
  nested `.theta` files is settled by DISC-5's per-match contribution rule
  (`package-and-settings.md:19`: a `.theta` file match registers directly) and is
  not reopened here. The measured control registers the nested file when nothing
  is denied.

## Fix

**Not settled. This report exists to pin the spec disposition first**, which is
the instruction bug 0076's §Fix left: "that sub-case is a spec gap and should be
pinned before it is coded." Six questions have to be answered, and (d) orders the
work.

**(a) What source descriptor does a denied subtree carry?**
`discovery-sources.md:61` obliges every one of these diagnostics to carry a
descriptor in its `message` and the path in its `file`. A subtree under a glob's
static prefix has no descriptor of its own. Three candidate answers:

1. **The matching `thetaPaths` entry — `settings entry index N`.** This is what
   bug 0076 chose for `addGlob`'s named-directory case, on the reasoning its fix
   record (d) states: `:61` makes the descriptor's job locating the *offending
   configuration*, and for a glob the offending configuration is the entry that
   matched, with the path itself carried in `file`.
   `package-and-settings.md:94` already names this exact form for permission
   failures under a `thetaPaths` entry. **This answer introduces no new
   vocabulary and needs no spec edit for the descriptor itself.** Its cost is the
   attribution problem measured above: `treeFor` shares one universe across every
   entry with the same static prefix, so at the point of observation no single
   index owns the rejection. Closing that means either passing the owning entry
   into the walk (and re-walking per entry, or keying the cache by entry), or
   returning the failures from `listTree` and letting `addGlob` attribute them —
   the return-the-outcome shape bug 0076's §Fix described as one that "makes the
   `listTree` case (which has no descriptor) explicit rather than silently
   absent" and did not need for its own sites.
2. **The glob's static prefix path.** Unambiguous and attribution-free, but not a
   descriptor form `:61` carries, so it mints vocabulary.
3. **A new descriptor form** naming the universe explicitly. Same objection,
   plus a `:61` example-list edit.

On the package side the question is easier: `listTree` runs once per package with
the package root, so `` package `<name>` (pi.theta) `` — spec vocabulary at
`package-and-settings.md:25`, already emitted by `thetasInDirectory` (measured) —
covers it with no attribution problem.

**(b) Warning at the source's severity, or silence by design?**
Under Reading A the disposition is a warning at the row's severity: `warning` for
both reachable rows (`discovery-sources.md:54`, `:55`), which is what every other
*Unreadable path* cell of the settings and package rows already produces
(`SETTINGS_MODES.unreadable`, `discovery-walk.ts:105–109`). If the adjudication
instead lands on silence-by-design, `:67` needs an explicit carve-out sentence
saying that a glob-universe traversal failure is exempt from its "not silence"
rule, and the `thetaPaths` schema needs `:94` qualified to literal entries only.
Silence-by-design without those two edits leaves the corpus asserting a rule the
implementation does not follow.

**(c) The DIAG-2 obligation.** `theta/load/unreadable-source`'s *Trigger*
(`code-registry-load.md:47`) reads "A discovery source's path exists but cannot
be read (permission denied, ACL, symlink loop at the root, transient I/O error)".
A subtree under a glob's static prefix is not "a discovery source's path" if the
source path is what the entry names, so a warning route owes a *Trigger*
determination: either that sentence already admits the emission, or it takes a
widening naming the universe-enumeration sub-case, landing in the same commit per
DIAG-2 (`diagnostic-shape.md:72`). Read the row as written before editing — bug
0076 read the same row and determined no widening was owed for its sites. Two
constraints hold either way. DIAG-4 (`:74`) forbids rewording the *Message*, and
`discovery source is unreadable: <descriptor>` renders correctly under every
candidate in (a), so no reword is needed. `docs/reference/diagnostics.md:212`
carries no *Trigger* column, so a widening does not reach it;
`docs/reference/discovery-cli.md:55–60` carries the code list and does. No new
code is required and no closed union is extended; if the adjudication mints a new
code instead, that is a DIAG-2 row addition with its own mirror.

**(d) Ordering against bug 0077 — binding.**
[0077](./0077-settings-glob-matches-pattern-basename.md) owns `globMatches`
(`discovery-walk.ts:584–589`) and its §Fix replaces the basename disjunct, adds a
settings-base-relative comparison against the raw pattern text, and routes the
`!` step through the same predicate. That rewrites the universe→selected map this
report's disposition is pinned over. **Either 0077 lands first, or this fix
re-derives its universe against 0077's.** The measured input class survives
0077's stated predicate — the first disjunct `minimatch(entry.abs, absPattern)`
is the one that selects `/project/.pi/g/sub/s.theta` in the control, and 0077's
§Fix keeps it — but 0077 also changes the `!` step's domain and the number of
paths reaching `addDir`, so the derivation is owed regardless. The two changes
also touch adjacent lines in one function: 0076's fix record (l) already notes
0077 must rebase across the changed `addDir` call at `discovery-walk.ts:712`,
which is inside `addGlob`, four lines from the `treeFor` call this fix touches.

**(e) Both copies move together.** `discovery-walk.ts:547` and
`package-discovery.ts:310` implement one behaviour for two DISC-2 rows whose
*Unreadable path* cells agree. Fixing one leaves the two discovery paths
disagreeing about whether a denied subtree is reportable, which is the divergence
bug 0077 documents for `globMatches` and DISC-5 already. Their *Missing* cells
also agree (`error` for both `:54` and `:55`), so unlike bug 0076's
`thetasInDirectory` a single `ENOENT` disposition serves both rows here — but the
severities still arrive by different routes (`SETTINGS_MODES` against a
hardcoded value in `thetasInDirectory`), so each site states its own.

**(f) The silence controls stay silent.** Measured silent today and required
silent after: a genuinely empty subtree under the static prefix
(`discovery-sources.md:68`); a static prefix root that does not exist
(`package-and-settings.md:27`, a glob resolving to zero files); and the `theta/`
fallback's ignored subdirectories (`:29`, `:89`), which lose nothing and owe
nothing. Required silent and not yet measured: a subtree whose entries are all
non-`.theta` files, the second half of `:68`'s sentence.

Two further constraints on any implementation:

- **State the emission count where both walks cross one path.** Measured: with
  pattern `g/*` the denied directory is reported once, by `enumerateDirectory`;
  the universe walk crosses the same path in the same pass. A fix must say
  whether that becomes one diagnostic or two for the same `(code, file)` pair.
  Bug 0076's witness left this free on purpose — cells 6
  (`tests/discovery-root-enumeration-failure.test.ts:612–641`) and 14
  (`:895–952`) pin "at least one" matching diagnostic rather than an exact
  pass-wide count precisely so a later fix that also emits from the deferred walk
  stays possible. Cell 15 (`:954–1026`) pins exactly one diagnostic for its own
  `(code, file)` pair, which leaves a deferred emission free only under a
  different code. Cell 12's exact pass-wide count is safe (no `listTree` runs when
  `pi.theta` is absent) and must remain exact. Cells 5 and 11 use literal
  `thetaPaths` entries, which never reach `treeFor` (`discovery-walk.ts:708` is
  its only caller), so their exact counts are out of reach either way.
- **Confirm the channel end to end (bug 0013).** Both reachable rows are
  warnings, and bug 0013 is the record of warning-severity load diagnostics being
  produced and dropped. The route is `sink.emitGroup(walk.diagnostics)` /
  `sink.emitGroup(packageWalk.diagnostics)`
  (`src/extension/production-composition.ts:447`, `:461`) into
  `emitLoadNoteGroup` (`:1115–1132`), whose warning arm selects on
  `severity === "warning"` with no code allow-list. A witness asserting only the
  walk's `diagnostics` array proves emission, not delivery.

**Witness — offline, provider-free.** Every row of §Reproduction settles inside
one `discoverThetas` or one `discoverPackageThetas` call over the `ReaddirDenied`
decorator, so the harness is
`tests/discovery-root-enumeration-failure.test.ts` extended, not a new
mechanism. Required: the measurement pair and its control on both copies; the
three rejection codes; the partial-shrink pair; the shared-prefix pair; the
denied-prefix-root row; the pattern-shape contrast pair (which is what reds if a
fix regresses to reporting only through `addDir`); every silence control of (f),
including the unmeasured all-non-`.theta` subtree; and the `+`-recovery row, which
pins that the file itself stays readable. Sourcing
every expected message from the registry's *Message* column per DIAG-4, as that
file already does.

## Provenance

- Origin: the bug 0076 fix (0.67.0), which deferred this sub-case twice by name —
  its §Fix ("for `listTree` a separate adjudication — its swallow shrinks a
  *glob universe* rather than a named root, and no spec text prescribes a
  disposition for a denied subtree under a glob's static prefix. That sub-case is
  a spec gap and should be pinned before it is coded") and its fix record §Fix
  (0.67.0) (c) and residual 1 ("a denied subtree under a glob's static prefix
  still shrinks the universe silently. Deferred by (c); needs a spec disposition
  before it is coded"). This report is that adjudication, and adds what the
  deferral does not state: the measured registered set and full diagnostic list
  on both copies with their controls, the pattern-shape contrast at one HEAD, the
  shared-universe attribution problem, the denied-prefix-root sub-case, the
  `+`-operand recovery, the per-copy row reach, the two readings of `:67` with the
  argument between them, and the six §Fix questions with the 0077 ordering
  constraint.
- Spec: `docs/spec_topics/discovery/discovery-sources.md:9` (non-recursion),
  `:39–45` (the *Source priority* list), `:47` (DISC-2's asymmetry paragraph),
  `:49–56` (the failure-modes table; `:54` the
  `Package pi.theta entry` row, `:55` the `Settings thetaPaths entry` row),
  `:61` (rule 2, the descriptor obligation), `:62` (rule 3, errors fatal per
  entry), `:66` (the clean-leaf-`ENOENT` walk, the code list, the Windows ACL
  motivation), `:67` (the traversal-failure sentence — the anchor), `:68` (the
  empty-directory rule and the per-source-root sentence);
  `docs/spec_topics/discovery/package-and-settings.md:7` (silently skipped
  package roots), `:19` (DISC-5), `:25` (the `` package `foo` (pi.theta) ``
  descriptor), `:27` (a glob resolving to zero files is silent), `:29` (the
  `theta/` fallback's ignored subdirectories), `:32` (the two package rows
  apply), `:82–92` (the `thetaPaths` entry schema; `:88` binds globs to DISC-5,
  `:89` directory entries), `:94` (permission failures bound to the Settings row,
  and the `"settings entry index N"` descriptor);
  `docs/spec_topics/diagnostics/code-registry-load.md:46`, `:47` (the two rows);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4). User-facing mirrors: `docs/reference/discovery-cli.md:46–60`;
  `docs/reference/diagnostics.md:211–212`.
- Implementation evidence at `c578df51`:
  `src/discovery/discovery-walk.ts:100–114` (the three `FailureModes`),
  `:222–228` (`nodeErrorCode`), `:243–251` (`ancestorsClean`), `:273–291`
  (`classifyPath`, bug 0075's), `:299–324` (`enumerateDirectory` after bug 0076),
  `:444–462` (`emitSourceFailure`), `:537–542` (`TreeEntry`), `:544–567`
  (**`listTree`**, the swallow at `:550–554`, the `lstat` skip at `:557–558`),
  `:571–580` (`staticPrefixRoot`), `:584–589` (`globMatches`, bug 0077's),
  `:626–630` (`resolveSettingsSource` and its `diagnostics` parameter),
  `:652–659` (`treeCache` / `treeFor` and the `listTree` call at `:656`),
  `:661–665` (`addDir`), `:683–703` (`addLiteral`), `:707–717` (`addGlob`),
  `:720–724` and `:738–741` (override stages 1 and 3), `:766–777` (the CLI
  source's route, which reaches no universe), `:783` (the settings call);
  `src/discovery/package-discovery.ts:135–141` (`nodeErrorCode`), `:161–166`
  (`readdirOr`), `:256–260` (`enumerateRoot`, correct and untouched),
  `:300–306` (`TreeEntry`), `:308–331` (**`listTree`**, the swallow at
  `:313–314`, the `lstat` skip at `:318–322`), `:335–340` (`matchesGlob`),
  `:365–371` (`resolvePiThetas` and its `diagnostics` parameter), `:394` (the
  `listTree` call), `:396–424` (the four override stages), `:429–445` (the
  contribution loop and its `thetasInDirectory` call), `:449–509`
  (`thetasInDirectory` after bug 0076), `:538–574` (`resolvePackage`, the
  `theta/` fallback at `:556–562`, the manifest arm at `:573`);
  `src/extension/production-composition.ts:447`, `:461` (the two sink calls),
  `:1115–1132` (`emitLoadNoteGroup`), `:1136–1139` (`loadSink`).
- Test evidence at `c578df51`:
  `tests/discovery-root-enumeration-failure.test.ts` (bug 0076's witness, 17
  cells; the deferral recorded at `:95–107`; the `ReaddirDenied` decorator at
  `:294–344` (class body `:300–344`); cell 6 at `:612–641` and cell 14 at
  `:895–952`, both pinning "at
  least one" so a fix here stays possible; the sole `thetaPaths` glob in the
  suite at `:628`); `tests/load-warning-delivery.test.ts:564` (bug 0013's
  end-to-end channel pin); `tests/package-discovery.test.ts:164` (the manifest
  helper), `:181`, `:207`, `:237`, `:258`, `:289`, `:377–379`, `:406–408` (every
  committed `pi.theta` array — single-segment patterns and literals only, none
  reaching a denied subtree).
- Reproduction: one scratch vitest file at `c578df51` — sixteen cells over the
  real `discoverThetas` and the real `discoverPackageThetas` with the
  `ReaddirDenied` seam: the measurement and its control on both copies, three
  rejection codes, the partial-shrink pair, the shared-prefix pair, the
  denied-prefix-root row, the pattern-shape contrast pair, the `+`-recovery row,
  the empty-subtree and missing-prefix controls, the `theta/`-fallback row, and a
  second static-prefix variant (`**/*.theta` rooted at the settings base dir),
  which reproduces the same silence. Run on the outputs quoted above, then
  deleted. No file in the tree was written
  by the probe and no ACL was modified. `src/`, `tests/`, `docs/bugs/README.md`
  and every other bug document are unmodified by this filing.

## Coordination note — bug 0077 landed (0.68.0)

The **binding ordering dependency** this report's §Status and §Fix (d) record —
"either 0077 lands first or this fix re-derives its universe against 0077's" — is
**discharged by 0077's fix (0.68.0): 0077 landed first.** This report's
disposition is still owed a re-derivation, and here is exactly what changed
beneath it. Cite symbols; every `discovery-walk.ts:N` above was taken at
`3e198ba1` and 0077's fix inserted lines above the middle of the file.

- `globMatches` (now `src/discovery/discovery-walk.ts:611`, was `:584–589`) takes
  four arguments — `(entry, absPattern, rawPattern, baseDir)` — and attempts
  DISC-5's three comparison strings: `entry.abs` and `entry.base` against the
  resolved `absPattern`, and the entry's settings-base-relative path against the
  un-resolved `rawPattern`. The `basename(absPattern)` reduction is gone. New
  helpers beside it: `relativeToBase` (`:221`) and `fileEntryOf` (`:634`).
  `ParsedSettingsEntry` (`:644`) gained `operand`.
- **This report's measured input class survives, as §Fix (d) predicted.** The
  first disjunct `minimatch(entry.abs, absPattern)` is what selects
  `/project/.pi/g/sub/s.theta` for `thetaPaths: ["g/*"]` with base dir
  `/project/.pi`, and 0077 kept it. The rel disjunct matches it a second way
  (`g/sub` against `g/*`); neither route changes the universe→selected map for
  that input. `tests/discovery-root-enumeration-failure.test.ts`'s RED 6 cell,
  which drives exactly that input, held green through 0077's fix.
- **The `!` step's iteration domain did NOT narrow.** 0077 routed the `!` pass
  (`:781`) through the same predicate but left its domain as the whole `selected`
  map: bounding it to the entry's own subtree is not settled by DISC-5, and under
  a conformant matcher the global domain stops being hazardous. So the number of
  paths reaching `addDir` (`:714`) / `addFile` changes only through the matcher,
  never through the domain.
- **What narrowed:** a glob no longer reaches candidates below its own directory
  level, so a denied subtree *deeper* than the pattern's level now shrinks a
  universe whose entries the pattern would not have selected anyway. That
  strictly reduces the input classes in which this report's silence is
  *observable*, and it does not reduce the classes in which it is *reachable* —
  `listTree` (`:565`) is untouched and still swallows every `readdir` rejection,
  including on the static-prefix root itself, where the loss is total regardless
  of the matcher. This report's §Expected behaviour argument and its DIAG-2
  disposition question are unaffected.
- `listTree` and `treeFor` were not touched by 0077, so the adjacency §Fix (d)
  flags (0077 rebasing across `addDir` inside `addGlob`, four lines from the
  `treeFor` call) has already been absorbed: `addGlob` is now `:760` and its
  `treeFor` call is its first statement.

0077's fix record documents the change from its own side, including the route it
took for the `TreeEntry`-shaped view the `!` step needs.
