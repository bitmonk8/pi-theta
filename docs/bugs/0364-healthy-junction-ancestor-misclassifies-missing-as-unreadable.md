# Bug 0364 — `ancestorsClean` answers false for a HEALTHY directory junction (or symlinked directory) on the ancestor chain, so a cleanly-missing settings/CLI path under one is classified `unreadable-source` instead of `missing-source`: the settings row's mandated error degrades to a warning whose message asserts unreadability about a chain the same walk happily enumerates when the leaf exists

- **Status:** open.
- **Sev/Diff estimate:** S3/D1 — the wrong-diagnostic class (impact 4): code,
  message, and — on the settings source — severity are all wrong for the input
  (DISC-2's *Missing path* cell for settings is **error**; the emitted
  `unreadable-source` is a **warning**), so a typo'd `thetaPaths` entry under a
  junctioned tree is demoted from the loud "does not exist" error the table
  mandates to a misleading "is unreadable" warning. No registration outcome or
  value is wrong, and the CLI source keeps error severity (wrong code/message
  only), so S3 with a real severity-downgrade edge on one source. D1: one
  branch in `ancestorsClean` — a successful `lstat` that reports a symlink
  resolves the ancestor via the existing `realpathOutcome`/`lstat` pair (the
  same treatment `classifyResolvedTarget` already gives the candidate) — plus
  one spec clause for the lstat-ok-but-link arm.
- **Kind:** defect against the DISC-2 table's reachability (the *missing* cell
  is unreachable for any explicit path under a junctioned ancestor), composed
  with a spec gap: `discovery-sources.md:68`'s operational rule enumerates
  "every ancestor `lstat`s ok **and is a directory**" → missing, and "`lstat`
  returns `EACCES`, `EPERM`, `ENOTDIR`, or itself `ENOENT`" → unreadable; a
  HEALTHY link — `lstat` ok, `isDirectory()` false, `isSymbolicLink()` true —
  falls in neither arm. The same sentence justifies `lstat` "so a **broken**
  symlink at an ancestor classifies as *unreadable*", which does not license
  the same verdict for a working one.
- **Related:**
  - [0075](./0075-symlinked-root-classified-wrong-type.md) —
    fixed (0.195.0). Fixed the CANDIDATE probe (link-typed candidates now
    classify by their target); this is the ANCESTOR probe's remaining
    link-blindness. 0075's §Fix left the ancestor walk on raw `lstat`
    deliberately (the spec pins `lstat` there); the healthy-link arm was not
    adjudicated then and is the residue. See §Fix for the explicit
    adjudication against that pin.
  - [0076](./0076-existing-root-enumeration-failure-silent.md)
    — fixed (0.67.0). Same `unreadable-source` emission sites; disjoint input
    class (enumeration failure on an existing root).
  - [0167](./0167-clean-leaf-walk-warns-on-absent-conventional-root.md) —
    fixed (0.89.0). The closest neighbour on this function: same
    `ancestorsClean`/`properAncestors` seam; owns the conventional-root
    ENOENT exemption and the Windows drive-letter chain. Disjoint input
    class (absent conventional root vs healthy link ancestor under an
    explicit reference); its §Non-goals keep the explicit-reference
    clean-leaf walk unchanged.
- **Affected** (verified at af476df2, v0.347.0):
  - `src/discovery/discovery-walk.ts:276–285` — `ancestorsClean`:
    `if (!outcome.ok || !outcome.isDir) return false;` — a junction ancestor
    `lstat`s ok with `isDirectory() === false`, so the chain is declared
    unclean.
  - `src/discovery/discovery-walk.ts:349–357` (`classifyPath` ENOENT arm),
    `:441–457` (`enumerateDirectory` ENOENT arm, `ancestorsClean` call at
    `:453`), `:704–714` (`listTree`)
    — every consumer maps the false answer to the `unreadable` classification
    and its `theta/load/unreadable-source` emission.
  - `src/discovery/discovery-walk.ts:165–197` — `properAncestors` builds the
    chain the walk probes; on Windows a junction is an ordinary ancestor
    (user-profile trees, `mklink /J` dev layouts, Dropbox/OneDrive folder
    redirections).

## Summary

DISC-2's clean-leaf rule distinguishes "the leaf genuinely does not exist"
(missing — error for explicit references) from "an ancestor denies
enumeration" (unreadable) by `lstat`-probing the ancestor chain. The
implementation requires every ancestor to report `isDirectory()` from `lstat`,
which never follows links, so a perfectly traversable directory junction on the
chain fails the test and a cleanly-missing leaf is reported as an unreadable
source. The same walk proves the chain readable when the leaf exists: the
identical junctioned root enumerates and registers thetas.

## Reproduction

Offline, real filesystem, worktree at af476df2. Scratch root `<R>`:

```
<R>/real/thetas/a.theta      (valid theta)
<R>/link  →  <R>/real        (cmd mklink /J)
```

Drive `discoverThetas` with the production `PiFileSystem`:

1. `settings: { thetaPaths: ["<R>/link/thetas/nope"] }` →
   `["warning theta/load/unreadable-source: discovery source is unreadable: settings entry index 0"]`.
2. Control — same physical path spelled through the real dir,
   `settings: { thetaPaths: ["<R>/real/thetas/nope"] }` →
   `["error theta/load/missing-source: discovery source path does not exist: settings entry index 0"]`.
3. Traversability control — `cliPaths: ["<R>/link/thetas"]` → registers
   `a.theta` with zero diagnostics (the junction chain is fully readable; bug
   0075's fix holds).

Same physical state in (1) and (2) — leaf absent, every ancestor enterable —
two different codes, two different severities, decided by which spelling of the
ancestor the entry used.

## Expected behaviour

`discovery-sources.md:49` (DISC-2) with the failure-modes table at
`:51–58`: settings *Missing
path* is **error** (`theta/load/missing-source`, "config names a missing
path"); *Unreadable path* is the warning row. `:68` defines the discriminator:
a clean leaf is an ENOENT "on the candidate path whose ancestors all `lstat`
successfully **as directories the process can enter**" — the junctioned chain
IS enterable (probe 3 enumerates through it), so the natural-language
definition classifies (1) as missing; only the operational restatement's
two-arm enumeration fails to cover the healthy-link case. The rule also states
it "applies uniformly on POSIX and Windows — the implementation has no
platform branch"; a junction is the ordinary Windows spelling of a directory
alias, so the uniform rule should not flip the verdict on it.

## Actual behaviour / root cause

`ancestorsClean` (`discovery-walk.ts:276–285`) treats `lstat`-ok-but-not-
directory as unclean — the correct verdict for a BROKEN link (its target probe
would fail) but wrong for a healthy one. The spec chose `lstat` to catch broken
links; the implementation inherited the check without the resolve-then-classify
step the candidate probe gained in 0075 (`classifyResolvedTarget`,
`:377–401`). Every explicit-reference consumer then emits
`theta/load/unreadable-source` at the source's unreadable severity — warning
for settings (`SETTINGS_MODES.unreadable`, `:121–125`), error for CLI — with
the fixed message "discovery source is unreadable", which is false: nothing on
the chain refuses reads.

## Why it matters

A typo'd or stale `thetaPaths` entry is the exact input DISC-2's error cell
exists for ("the author named it and expects it to resolve"). Under any
junctioned ancestor — common in Windows dev layouts (`mklink /J` monorepo
links, folder redirection, Dev Drive mounts) and equally reachable through
POSIX symlinked ancestors (`/home` → `/var/home`) — that error degrades to a
warning whose text points the author at permissions instead of at the missing
path. The wrong-code half also poisons `listTree`'s glob-universe
classification (`:704–714`): a vanished subtree under a junctioned prefix
reports unreadable rather than staying silent-missing per
`package-and-settings.md:29`.

## Non-goals

- Broken links on the chain: correctly unreadable, per the spec's own
  rationale; unchanged.
- The candidate path itself being a link: fixed by 0075; probe 3 confirms.
- UNC paths: a fully-missing `//server/share/...` classifies unreadable via
  fabricated POSIX-rooted ancestors (`/server`), but for a MISSING share the
  spec's own rule also answers unreadable (the share-root ancestor ENOENTs), so
  no divergence is claimable without an existing share to probe against; logged
  as a false trail, not part of this report.
- The conventional (global/project/package) roots: their ENOENT is skipped
  before the walk (the DISC-2 conventional-root exemption), so they cannot
  reach this misclassification.

## Fix

In `ancestorsClean`, on `lstat` ok with `isSymbolicLink()` true, resolve the
ancestor (`realpathOutcome`) and `lstat` the target — directory → clean,
anything else → unclean — mirroring `classifyResolvedTarget`'s candidate
treatment; the broken-link case stays unclean because the `realpath` rejects.
Spec-side, add the healthy-link arm to `:68`'s enumeration ("an ancestor that
`lstat`s as a link is probed via its resolved target; a broken link classifies
unreadable"), which keeps the existing broken-symlink sentence true and makes
the missing cell reachable again. Alternative (rejected): probe ancestors with
`stat` — loses the broken-link discrimination the spec pins.

Adjudication against the 0075 pin: 0075's 0.195.0 fix record pins
"`ancestorsClean` stays on `lstat`" (repeated in its Adjudication and
Pinned dispositions), and this fix modifies a function that record
deliberately left alone. The pin's stated rationale — broken-link
discrimination — survives intact: `lstat` remains the probe, the added
resolve step runs only on the lstat-ok-but-link arm the pin never
adjudicated, and a broken link still classifies unclean. The fixer must
state this against the pin explicitly in the fix record.

## Provenance

windows-paths bug-hunt sweep, af476df2 (v0.347.0). Probe:
`tests/scratch-winpaths-discovery.test.ts` cells P4a/P4b/P4c (deleted after
the run) — real NTFS junction created via `cmd /c mklink /J`, driven through
`discoverThetas` with the production `PiFileSystem`; outputs as quoted in
§Reproduction.
