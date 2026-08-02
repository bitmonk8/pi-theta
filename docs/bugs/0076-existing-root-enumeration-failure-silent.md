# Bug 0076 — A discovery root that exists but whose enumeration fails contributes zero thetas and zero diagnostics: `enumerateDirectory` swallows every `readdir` rejection, where DISC-2 pins an `unreadable-source` warning (conventional roots, settings) or error (`--theta`)

- **Status:** open.
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
