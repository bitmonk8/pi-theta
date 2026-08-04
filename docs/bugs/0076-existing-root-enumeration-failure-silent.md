# Bug 0076 — A discovery root that exists but whose enumeration fails contributes zero thetas and zero diagnostics: `enumerateDirectory` swallows every `readdir` rejection, where DISC-2 pins an `unreadable-source` warning (conventional roots, settings) or error (`--theta`)

- **Status:** fixed (0.67.0). Route A as recommended — `enumerateDirectory`
  receives the calling source descriptor and `FailureModes` and emits from its
  `readdir`-failure branch; the package walker's `thetasInDirectory` equivalent
  is fixed in the same pass; the `listTree` glob-universe swallow is deferred as
  the spec gap §Fix names.
- **Kind:** defect. DISC-2's *Unreadable path* column and its symlink-loop
  implementation note both prescribe a diagnostic for exactly this state; the
  implementation emits none.
- **Related:**
  - Candidate 01 of this hunt
    (`01-symlinked-root-classified-wrong-type.md`) — adjacent, same
    `classifyPath` → `enumerateDirectory` pair. There the root never reaches
    enumeration (mis-classified); here it reaches enumeration and the failure is
    dropped. Disjoint code lines, disjoint input classes.
  - [0013](../../../docs/bugs/0013-load-warnings-dropped-by-both-production-sinks.md)
    — fixed (0.24.0). 0013 was the sink dropping warnings that *were* produced;
    this warning is never produced. Its §Reproduction (`:127`) uses a
    warning-severity `theta/load/unreadable-source` from the *entry* path
    (`classifyPath`), not this one.
- **Affected** (verified at HEAD `d06daae3`, 0.52.0):
  - `src/discovery/discovery-walk.ts:301–312` — `enumerateDirectory`. The
    `fs.readdir` call at `:306–309` maps rejection to `{ ok: false }` with no
    `.code` capture, and `:310–312` returns `[]`. `diagnostics` is a parameter
    (`:304`) and is pushed to only for `non-canonical-extension` (`:340–345`).
  - `src/discovery/discovery-walk.ts:385–388` — `resolveEntry`'s `dir` arm calls
    `enumerateDirectory` and returns its result directly; there is no
    post-condition on the empty list, so a denied root is indistinguishable from
    an empty one.
  - `src/discovery/discovery-walk.ts:649–653` — `addDir`, the settings-source
    path into the same function; `:695–705` — `addGlob` reaches it per matched
    directory.
  - `src/discovery/discovery-walk.ts:535–555` — `listTree` (the settings-glob
    universe) has the same swallow at `:538–542` and no diagnostics parameter at
    all, so a denied subtree silently shrinks the glob universe.
  - `src/discovery/package-discovery.ts:311–312` — the package walker's
    `readdirOr` swallow, reached from `listTree` (`:308–329`); same shape.
  - `docs/spec_topics/discovery/discovery-sources.md:49` / `:57–64` — the
    failure-modes table's *Unreadable path* column: warning for Global, Project,
    Package `theta/`, Package `pi.theta`, Settings; error for CLI `--theta`.
  - `docs/spec_topics/discovery/discovery-sources.md:67` — "A symlink loop or
    other traversal failure *inside* a discovery root that does exist is an
    unreadable-source warning, **not silence** — the silent-on-missing rule
    applies to the *root* itself not existing, not to failures encountered while
    walking a root that does."
  - `docs/spec_topics/discovery/discovery-sources.md:66` — names `EACCES`,
    `EPERM`, `ENOTDIR` as the codes the classification branches on, and
    "a parent ACL denies enumeration" as the Windows case the rule exists for.
  - `docs/reference/discovery-cli.md:45–59` — the user-facing mirror of the
    table and the code list.
- **Observed at:** `0.52.0` (`d06daae3`). Offline, deterministic — scratch vitest
  driving the real `discoverThetas` over a delegating `FileSystem` seam whose
  `readdir` rejects for one path with a Node-style `.code` and whose every other
  member is the stock `FakeFileSystem`. Written, run, deleted.

## Summary

The walk decides "is this root a directory" and "can this root be enumerated"
with two different calls. The first (`classifyPath`) reports its failures; the
second (`enumerateDirectory`) reports none. When a root passes the first and
fails the second — an ACL or mode denying enumeration on a directory the process
can still `lstat`, an `ELOOP` from a link cycle inside the path, an `ENOTDIR`
from a racing replacement — the pass returns zero thetas from that root and zero
diagnostics.

DISC-2 gives that state a column and a severity per source, and its
implementation note names it explicitly as the case that must not be silent. The
same swallow sits in `listTree` (settings globs) and in the package walker's
`readdirOr`.

## Reproduction

Offline, deterministic. A delegating seam that rejects `readdir` for exactly one
path and delegates everything else — notably `lstat` — to the stock
`FakeFileSystem`:

```ts
class ReaddirDenied implements FileSystem {          // full text in the hunt log
  async readdir(p: string) {
    if (p === this.denied) { const e: NodeJS.ErrnoException = new Error(`${this.code}: readdir`); e.code = this.code; throw e; }
    return this.inner.readdir(p);
  }
  // every other member delegates to `inner`
}
```

Three inputs, one per severity cell of the table:

```ts
// (a) Project root, EACCES — table says: warning
const fs = new ReaddirDenied(inner, "/project/.pi/theta", "EACCES");
await discoverThetas({ fs, settings: {} });

// (b) CLI --theta root, ELOOP — table says: error
const fs = new ReaddirDenied(inner, "/opt/loop", "ELOOP");
await discoverThetas({ fs, settings: {}, cliPaths: ["/opt/loop"] });

// (c) Settings literal dir entry, EACCES — table says: warning
const fs = new ReaddirDenied(inner, "/project/.pi/t", "EACCES");
await discoverThetas({ fs, settings: { thetaPaths: ["t"], thetaPathsBaseDir: "/project/.pi" } });
```

Each fixture holds one readable `a.theta` inside the denied directory. Observed:

```
B2a thetas: []   B2a diags: []
B2b thetas: []   B2b diags: []
B2c thetas: []   B2c diags: []
```

Control (same fixtures, error injected on the root path for *every* seam member,
so `lstat` fails too) takes the `classifyPath` path and does report:

```
project EACCES -> [{"severity":"warning","code":"theta/load/unreadable-source","file":"/project/.pi/theta", …}]
CLI     ELOOP  -> [{"severity":"error",  "code":"theta/load/unreadable-source","file":"/opt/loop", …}]
```

The control proves the diagnostic exists and is reachable — it is the second
probe's failure that is dropped.

## Expected behaviour

`docs/spec_topics/discovery/discovery-sources.md:57–64`, *Unreadable path*
column: warning for Global, Project, Package `theta/`, Settings; error for CLI
`--theta`. `:67` states the same rule from the traversal side and forbids
silence in terms: "an unreadable-source warning, not silence". `:66` names
`EACCES` / `EPERM` / `ENOTDIR` as the codes in play and gives the Windows ACL
case as the motivation.

Each of the three inputs above should therefore emit one
`theta/load/unreadable-source` naming the source descriptor
(`"project .pi/theta/"`, `"--theta flag #1"`, `"settings entry index 0"`), at
the severity of the source's row.

## Actual behaviour / root cause

`enumerateDirectory` (`:301–349`) is the only enumeration site, and its first
statement discards the rejection:

```ts
const entries = await fs.readdir(dir).then(
  (names) => ({ ok: true as const, names }),
  () => ({ ok: false as const }),      // .code not captured
);
if (!entries.ok) {
  return [];                            // no diagnostic
}
```

`resolveEntry`'s `dir` arm (`:387–388`) returns that list unchanged, so an empty
result is the same value a genuinely empty directory produces — which
`docs/spec_topics/discovery/discovery-sources.md:76` requires to be silent. The
two states are conflated at the point where the distinguishing information
(the `.code`) has already been thrown away.

`enumerateDirectory` already takes `diagnostics` (`:304`) and already pushes to
it (`:340–345`), so the seam for the fix is in place. `listTree` (`:538–542`)
and `package-discovery.ts:311–312` repeat the swallow; `listTree` has no
`diagnostics` parameter at all.

## Why it matters

Impact class 1: silent loss with zero diagnostics. Every theta under the root
disappears and the operator is told nothing — the session simply has no
`/<name>`, and `/theta` (or whatever inventory surface is consulted) reports the
smaller set as if it were the truth. The state is reachable in ordinary
deployments: a `theta/` directory in a package installed with restrictive modes,
a project `.pi/theta` on a share whose ACL denies enumeration to the running
user (the exact case `:66` cites), a link cycle introduced under a settings
root.

The `--theta` cell is the sharpest: the operator named the path on the command
line, DISC-2 makes every failure mode of that source an *error*, and the walk
answers with nothing at all.

## Non-goals

Not in scope: the classification of the root itself (candidate 01 — a link-typed
root never reaches enumeration); the `theta/load/unreadable` per-file warning at
`validateAndRead` (`:882–893`), which is correct; the package walker's
`theta/load/discovery-slow` and `package-read-timeout` bounds (DISC-6), which
are a separate mechanism.

## Fix

Capture the rejection code in `enumerateDirectory` and emit
`theta/load/unreadable-source` at the calling source's severity. The severity is
not derivable inside `enumerateDirectory` — it currently receives no
`FailureModes` — so one of:

**Option A — pass the severity down.** Give `enumerateDirectory` the
`FailureModes` and descriptor already held by `resolveEntry` (`:377–384`) and
`addDir` (`:649–653`), and emit from inside on the failure branch. Smallest
change; keeps the single emission site. `addGlob` (`:695–705`) must decide what
descriptor a glob-matched directory carries (`"settings entry index N"` is
available).

**Option B — return the outcome.** Widen the return to
`{ candidates, failure? }` and let each caller emit with the context it already
has. More plumbing, but it keeps `enumerateDirectory` free of diagnostics
policy and makes the `listTree` case (which has no descriptor) explicit rather
than silently absent.

Recommendation: Option A for `enumerateDirectory`, and for `listTree` a separate
adjudication — its swallow shrinks a *glob universe* rather than a named root,
and no spec text prescribes a disposition for a denied subtree under a glob's
static prefix. That sub-case is a spec gap and should be pinned before it is
coded.

Constraints any fix must satisfy: a genuinely empty directory stays silent
(`:76`); one bad root does not abort the pass (`:70`, errors are fatal for the
offending entry only); the emitted `file` field is the root path and the message
carries the source descriptor (`:69`); the package walker's equivalent
(`package-discovery.ts:311–312`) is fixed in the same pass or explicitly left
with a recorded reason, since its table rows (`Package theta/ directory`,
`Package pi.theta entry`) carry the same *Unreadable path* warning cell.

## Provenance

- Origin: `discovery-ext` bug hunt at HEAD `d06daae3`, while tracing DISC-2's
  failure-modes table to its enforcement sites.
- Implementation evidence: `src/discovery/discovery-walk.ts:301–312`, `:340–345`,
  `:385–388`, `:535–555`, `:649–653`, `:695–705`;
  `src/discovery/package-discovery.ts:308–329` — read at `d06daae3`.
- Probe evidence: scratch vitest over the real `discoverThetas` with a
  delegating `FileSystem` seam (`readdir` denied for one path, every other
  member the stock `FakeFileSystem`), plus the all-members-denied control that
  produces the diagnostic. Deleted after the run.
- Spec: `docs/spec_topics/discovery/discovery-sources.md:49`, `:57–64`, `:66`,
  `:67`, `:69`, `:70`, `:76`; `docs/reference/discovery-cli.md:45–59`.

## Fix (0.67.0)

**Route A, as recommended.** `enumerateDirectory` receives the calling source's
descriptor and `FailureModes` and emits from inside its `readdir`-failure branch;
Option B (widening the return to `{ candidates, failure? }`) was not needed and
was not taken. `listTree` is deferred by separate adjudication, recorded in (c).

- **What shipped:**
  - `src/discovery/discovery-walk.ts` — `enumerateDirectory` takes `descriptor`
    and `modes: FailureModes`, captures the `readdir` rejection's `.code` through
    the file's existing `nodeErrorCode` reader, and emits through the existing
    `emitSourceFailure` helper instead of returning `[]` in silence. The three
    call sites thread the two arguments: `resolveEntry`'s `dir` arm (CLI /
    project / global), the settings `addDir` closure (now descriptor-
    parameterised, called with `SETTINGS_MODES`), and `addDir`'s two callers
    `addLiteral` and `addGlob`.
  - `src/discovery/package-discovery.ts` — `thetasInDirectory` takes
    `descriptor`, `missing: Severity | null` and `diagnostics`, captures the
    rejection code the same way, and emits `theta/load/missing-source` at the
    caller's `missing` severity on `ENOENT` / `theta/load/unreadable-source`
    (warning) on every other code. `resolvePackage`'s conventional `theta/`
    fallback passes `null`; `resolvePiThetas`' per-match directory contribution
    passes `"error"`.
  - `tests/discovery-root-enumeration-failure.test.ts` — 17 cells, 12 red before
    the fix and 5 silence/shape controls green throughout.
  - No spec, registry or reference-mirror edit. See (f).

### (a) The classification rule, as implemented

On a `readdir` rejection at a path already accepted as a directory:

| rejection `.code` | ancestor chain | classification | code emitted |
|---|---|---|---|
| `ENOENT` | every proper ancestor `lstat`s ok as a directory | missing | `theta/load/missing-source` at `modes.missing` |
| `ENOENT` | any ancestor fails or is not a directory | unreadable | `theta/load/unreadable-source` at `modes.unreadable` |
| anything else, including absent | not consulted | unreadable | `theta/load/unreadable-source` at `modes.unreadable` |

This is the operational recipe
`docs/spec_topics/discovery/discovery-sources.md:66` states ("The candidate path
itself is checked with `readdir` or `stat` first; only failure triggers the
ancestor walk"), restated by
`docs/spec_topics/pi-integration-contract/host-interfaces-services.md:113` ("an
`ENOENT` chain that bottoms out cleanly is *missing*; an `EACCES` / `EPERM` /
`ENOTDIR` (or any other code) anywhere on the chain is an unreadable-source
failure"). The ancestor probe is the file's existing `ancestorsClean`, so one
implementation of the `:66` walk serves both `classifyPath` and
`enumerateDirectory`.

### (b) Per-source severity mapping, as implemented

Read off the `FailureModes` value each call path supplies, against the DISC-2
table at `discovery-sources.md:51–56`:

| source | `FailureModes` reaching the emitter | *Unreadable* | *Missing* |
|---|---|---|---|
| Global `~/.pi/agent/theta/` | `CONVENTIONAL_MODES` | warning | silent (`null`) |
| Project `.pi/theta/` | `CONVENTIONAL_MODES` | warning | silent (`null`) |
| Settings `thetaPaths` entry (literal, glob-matched, and `+` re-admitted) | `SETTINGS_MODES` | warning | error |
| CLI `--theta <path>` | `CLI_MODES` | error | error |
| Package `theta/` directory | `missing: null`, warning hardcoded | warning | silent |
| Package `pi.theta` entry | `missing: "error"`, warning hardcoded | warning | error |

The `!` and `-` settings stages only delete from the selected set; they classify
nothing and emit nothing. The emitted `file` is the enumerated root path and the
`message` carries the source descriptor, both by reuse of `emitSourceFailure`
(`:61`); one denied root does not abort the pass (`:62`), witnessed by cell 9; a
genuinely empty directory stays silent (`:68`), witnessed by cell 10.

### (c) `listTree` — deferred, not coded

Both copies (`src/discovery/discovery-walk.ts:547`,
`src/discovery/package-discovery.ts:310`) keep their swallow, untouched. Three
reasons:

1. §Fix states the position: the swallow shrinks a *glob universe* rather than a
   named root, "no spec text prescribes a disposition for a denied subtree under
   a glob's static prefix", and "that sub-case is a spec gap and should be pinned
   before it is coded". Coding a disposition the spec does not state is the one
   thing that adjudication forbids.
2. Pinning it is not a code decision. A denied subtree carries no source
   descriptor of its own, so the spec would have to say what
   `discovery-sources.md:61`'s descriptor names for it, and DIAG-2 would need a
   *Trigger* widening in the same commit. Neither is settled in §Fix.
3. `0077` is open and owns the settings-glob matcher (`globMatches`) that decides
   which universe entries reach a caller at all. A disposition pinned over
   today's universe could be invalidated by that fix.

Because the sub-case stays silent, cells 6, 12 and 14 pin *at least one* matching
diagnostic rather than an exact pass-wide count wherever a deferred `listTree`
traversal crosses the same denied path, so a later fix that also emits there
stays possible. Cell 12 pins an exact count: with `pi.theta` absent no `listTree`
runs, so no deferred path can reach that directory.

### (d) `addGlob`'s descriptor

A glob-matched directory carries `settings entry index N` of the matching entry —
the same descriptor form the literal path already uses.
`discovery-sources.md:61` makes the descriptor's job locating the *offending
configuration*, and for a glob match that is the `thetaPaths` entry that matched;
the matched directory's own path is already carried in the diagnostic's `file`
field, so nothing is lost. No new descriptor vocabulary was minted and no spec
edit is owed.

### (e) The package walker — fixed in the same pass

The two rows §Fix names (`Package theta/ directory`, `Package pi.theta entry`)
are served by `thetasInDirectory`, not by the `readdirOr` call inside `listTree`
that §Fix's constraint cites, so `thetasInDirectory` is where the fix landed. The
descriptors are spec vocabulary, taken verbatim: ``package `<name>` theta/
directory`` (`discovery-sources.md:61`) and ``package `<name>` (pi.theta)``
(`package-and-settings.md:25`). No entry index is derived — several patterns can
match one directory and no sentence says which one is blamed; the `file` field
locates it exactly.

No `:66` ancestor walk runs at this site, by construction rather than by
omission: the `theta/` fallback is reached only after `<pkg>/package.json` was
read successfully, and a `pi.theta`-contributed directory comes out of the tree
walk that `readdir`ed its own parent, so every ancestor is proven enterable and
the walk could only answer "clean". A directory that vanishes between that walk
and this `readdir` is therefore *missing*, which is the same disposition
`enumerateDirectory` applies to the same rejection class — the two enumeration
sites classify one input identically.

`enumerateRoot`'s swallow for the five installed-package roots
(`package-discovery.ts:256`) is untouched and correct: those roots are DISC-6's,
not DISC-2 rows, and a root that does not exist is silent by design.

### (f) Registry determination: no edit

`docs/spec_topics/diagnostics/code-registry-load.md:46–47` was read as written.
`theta/load/unreadable-source`'s *Trigger* already reads "A discovery source's
path exists but cannot be read (permission denied, ACL, symlink loop at the root,
transient I/O error)" and its severity sentence already reads "error only for
`--theta` flags, warning for every other source"; `theta/load/missing-source`'s
already reads "warning never — conventional locations … emit no diagnostic when
missing". Both *Message* columns are reproduced byte-exact by the emitters
(`discovery source is unreadable: <descriptor>`, `discovery source path does not
exist: <descriptor>`). No new code, no *Trigger* widening, no *Message* change,
and so no `docs/reference/diagnostics.md` or `docs/reference/discovery-cli.md`
mirror edit. No closed union was extended (`PathClass`, `Severity`, the code set
are all unchanged).

### (g) The warning surfaces (bug 0013 confirmation)

Five of the six rows make this a warning, so the sink question is load-bearing.
`src/extension/production-composition.ts:447` hands `walk.diagnostics` and `:461`
hands `packageWalk.diagnostics` to the pass sink; on the shipped path that sink is
`loadSink` (`:1136–1139`), whose `emitLoadNoteGroup` (`:1115–1132`) selects
warnings by `severity === "warning"` alone — there is no code allow-list anywhere
in it — and delivers them as one `emitDiagnosticBatch`
(`src/extension/system-note-channel.ts:336–352`) onto the `theta-system-note`
channel with `display: true` and `triggerTurn: false`. `theta/load/settings-invalid-json`,
a warning in the adjacent scan-stage group emitted one line earlier at `:434`,
is already witnessed arriving on that channel end-to-end through the real
`composeExtensionInstance` by `tests/load-warning-delivery.test.ts:564` (bug
0013's own pin). The error-severity CLI row routes per-diagnostic through the
pre-eval router on the same channel.

### (h) Gates

```
npx vitest run tests/discovery-root-enumeration-failure.test.ts
 ✓ tests/discovery-root-enumeration-failure.test.ts (17 tests) 9ms
 Test Files  1 passed (1)
      Tests  17 passed (17)

npm test
 Test Files  259 passed (259)
      Tests  3754 passed (3754)

npm run typecheck   → tsc -p tsconfig.json --noEmit      (no output, exit 0)
npm run lint        → eslint … "src/**/*.ts"             (no output, exit 0)

npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts
 ✓ tests/live/live-production-acceptance.test.ts (10 tests) 41338ms
      Tests  10 passed (10)

npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/
 ✓ tests/live/acceptance/noninteractive-acceptance.test.ts (10 tests) 52135ms
 ✓ tests/live/acceptance/ctor-unresolved-load-refusal.test.ts (1 test) 7219ms
      Tests  11 passed (11)
```

Witness red before the fix: 11 of the first 15 cells failed on their own primary
assertion with `Observed diagnostics=[]`, the symptom §Reproduction records; the
two cells added in review round 2 red the same way against the round-1 tree.

### (i) Review and verification

Three rounds. Round 1 (deep) returned three findings: one `correctness` —
`thetasInDirectory` served two rows whose *Missing* cells differ with one
unconditionally-silent `ENOENT` arm, so the `Package pi.theta entry` row's error
was dropped; one `test` — cell 12's inexact count was unearned; one `prose` — a
banned word. Round 2 fixed all three (the `missing: Severity | null` parameter,
cell 12's exact-count guards, two new cells) and its review returned clean with
one non-blocking residual: post-fix `path:line` citations in the witness header
had drifted. Round 3 was comment-only and corrected eleven of them; the round's
hunks touch no executable line, so no confirmation round was dispatched.

Verification discharged all four obligations. Two independent, byte-exact-restored
neutralisations red disjoint and exhaustive cell sets — nine walk cells under
`enumerateDirectory`'s reverted branch, three package cells under
`thetasInDirectory`'s, no cell red under neither. Blob hashes identical before and
after both restores. Full suite 259/3754. Both live halves run for real, zero
reds, no signature matching an open live bug. Lint and typecheck clean.

`tests/fixtures/h7a/permitted-codes.json` was NOT appended. The emission needs a
root whose `lstat` succeeds and whose `readdir` rejects, which no shipped fixture
constructs; a probe over the committed multi-source-discovery fixture measured an
empty stderr capture (`stderrLen=0`) and the H9a gate stayed green across eleven
real spawns. Appending a fault-injection-only code would silently weaken that
gate. No H8a cell is owed either: the precondition is a host ACL or symlink-loop
state, not `.theta` text, so unlike bugs 0070 / 0071 / 0110 it is not
constructible from a checked-in cross-host fixture.

### (j) Residuals

1. **The `listTree` glob-universe swallow stays** in both files
   (`discovery-walk.ts:547`, `package-discovery.ts:310`): a denied subtree under a
   glob's static prefix still shrinks the universe silently. Deferred by (c);
   needs a spec disposition before it is coded.
2. **A racing ancestor-permission change at `thetasInDirectory`** classifies as
   *missing* where `:66` would say *unreadable*. Unreachable at both present call
   sites by the construction argued in (e); a future caller that has not proven
   its parent enterable would owe the ancestor walk. The doc comment states the
   precondition so the next caller sees it.
3. **Three sibling test files' citations into `discovery-walk.ts` drifted** by the
   twelve lines this fix added above them:
   `tests/tools-entry-containment.test.ts:274` (`:301` → `:306`),
   `tests/e2e-s5-package-discovery-composition-root.test.ts:4` and
   `tests/e2e-s6-package-merge.test.ts:21` (both `:743,786` → `:755,798`). Left
   unedited: they are existing tests this bug document does not pre-authorise, and
   the drift is comment-only.
4. **This branch has no live or H8a coverage**, by the reachability argument in
   (i). The offline witness is the whole of it.

### (k) Pinned dispositions

- A genuinely empty directory, and one whose entries are all non-`.theta` files,
  stay silent (`:68`). Cell 10.
- A conventional root's clean-leaf `ENOENT` stays silent (`:51`–`:53` *Missing*).
  Cells 7 and 16.
- The `theta/load/unreadable` per-file warning at `validateAndRead` and the DISC-6
  `discovery-slow` / `package-read-timeout` bounds are §Non-goals and untouched.
- `classifyPath`'s arms are untouched — bug 0075's subject, a disjoint input class.

### (l) Sibling handoff — exact regions changed in `src/discovery/discovery-walk.ts`

Post-fix line numbers. Everything below `enumerateDirectory` shifted uniformly by
+12; content elsewhere is byte-identical.

| region | lines | change |
|---|---|---|
| `enumerateDirectory` doc comment, signature, failure branch | 299–327 | body and signature |
| `resolveEntry`'s `dir` arm call | 400 | one line |
| `addDir` signature and its `enumerateDirectory` call | 661–665 | two lines |
| `addLiteral`'s `dir` case call | 688 | one line |
| `addGlob`'s `isDir` branch call | 712 | one line |

`classifyPath` (273–291, bug 0075), `globMatches` (584, bug 0077) and the CLI
entry construction in `discoverThetas` (bug 0078) are untouched. 0077's rework of
the glob matching loop rebases across the single changed line at 712 inside
`addGlob`; 0078's restructuring of entry resolution must preserve the changed
line at 400 inside `resolveEntry`. In `src/discovery/package-discovery.ts` the
changed regions are the type import (29), the code constants (75–76),
`resolvePiThetas`' directory contribution (434–441), `thetasInDirectory`
(449–509) and `resolvePackage`'s fallback call (556–562).

### (m) Where this document was wrong

- Every `path:line` in §Affected, §Actual behaviour and §Provenance was recorded
  at `d06daae3` and had drifted. The spec cites in particular: the DISC-2 table
  rows are `discovery-sources.md:51–56`, not `:57–64`; the source-descriptor rule
  is `:61`, not `:69`; errors-fatal-per-entry is `:62`, not `:70`; the
  empty-directory rule is `:68`, not `:76`; the reference mirror is
  `docs/reference/discovery-cli.md:46–60`, not `:45–59`. `:66` and `:67` are
  intact by coincidence. The implementation cites into
  `src/discovery/discovery-walk.ts` and `src/discovery/package-discovery.ts` were
  intact at the fix baseline — no intervening fix had touched either file.
- §Fix's constraint on the package walker cites
  `package-discovery.ts:311–312`, the `readdirOr` call inside `listTree`, while
  naming the two table rows (`Package theta/ directory`, `Package pi.theta
  entry`) that `listTree` does not serve. Those rows are served by
  `thetasInDirectory`, which is where the fix landed; the cited `listTree` call is
  the deferred glob-universe class.
- §Fix's constraint list does not mention that the same enumeration serves two
  rows whose *Missing* cells disagree, which is what round 1 caught. A single
  disposition for `ENOENT` cannot satisfy both.
