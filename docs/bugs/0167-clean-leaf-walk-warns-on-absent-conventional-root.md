# Bug 0167 — DISC-2's clean-leaf-`ENOENT` bullet (`discovery-sources.md:66`) classifies an absent conventional root as *unreadable* as soon as its own parent is absent too, which is the ordinary state of a workspace carrying no host config directory: the table's three `silent` *Missing path* cells (`:51`–`:53`) are unreachable for the commonest form of absence, every pass in such a workspace draws a `theta/load/unreadable-source` warning per conventional root, and no sentence in the section adjudicates between the two

- **Status:** fixed (0.89.0) — in the host-portability change that introduced
  the `FileSystem.configDirName()` / `globalAgentDir()` seam members (external
  PR #1 over HEAD `faac684`/v0.88.0, shipped as v0.89.0). Both halves landed in that change: the walk
  skips an `ENOENT` conventional root before classification, and the spec bullet
  gained the *Conventional-root exemption* clause that says so. The table rows
  are unchanged — they were the side the reconciliation kept.
- **Sev/Diff estimate:** S2/D2 — S2 because the outcome is a spurious
  warning-severity diagnostic, not a wrong registration: no theta is lost and no
  theta is gained, but since the bug 0013 fix made load warnings visible the note
  reaches the operator on every discovery pass in every workspace that has no
  host config directory, which on a host that never creates one is every
  workspace. D2 because the two candidate readings are both defensible in the
  abstract and the decision is a normative one about which of two sentences in
  one section wins; the code change it implies is a single pre-classification
  probe in one loop.
- **Kind:** defect — two sentences of one normative section prescribe different
  dispositions for the same input, and the implementation followed the one that
  makes the other unreachable. Three elements, cited at HEAD `faac684`.
  1. *The table promises silence.* `docs/spec_topics/discovery/discovery-sources.md:51`–`:53`
     give the *Missing path* cell of the global root, the project root, and a
     package's conventional `theta/` directory as `silent`, and DISC-2's own lead
     sentence (`:47`) states the rationale: "*conventional locations* (global
     directory, project directory, package `theta/` directories) silently
     tolerate absence — that is the normal case on a fresh install or in a
     project that ships no thetas".
  2. *The implementation note takes it back for the ordinary case.* `:66`
     classifies an `ENOENT` candidate by walking its ancestor chain and
     prescribes: "if any ancestor `lstat` returns `EACCES`, `EPERM`, `ENOTDIR`,
     or itself `ENOENT`, classify the result as *unreadable* and emit
     `theta/load/unreadable-source` (warning)". It carves out no exemption for
     conventional roots. A conventional root's own parent *is* the host config
     directory (`<cwd>/.pi` for the project root), so a workspace that has never
     been touched by the host satisfies the `itself ENOENT` arm and takes the
     warning — the state `:47` calls "the normal case on a fresh install".
  3. *The code sides with `:66`.* `discoverThetas` hands both conventional roots
     to `collectFromEntries` (`src/discovery/discovery-walk.ts:839`–`:849` for
     the project root, `:852`–`:862` for the global root) with
     `CONVENTIONAL_MODES` (`:100`–`:104`, `missing: null`), and that path reaches
     `classifyPath` (`:291`), whose `ENOENT` arm consults `ancestorsClean`
     (`:261`) and answers `{ kind: "unreadable" }` when any proper ancestor fails
     to `lstat` as an enterable directory. `emitSourceFailure` (`:462`) then
     emits at `modes.unreadable`, which is `"warning"` for the conventional
     sources — the `missing: null` silence cell is never consulted, because the
     classification never says *missing*.
- **Related:**
  - **0013** —
    [`0013-load-warnings-dropped-by-both-production-sinks.md`](./0013-load-warnings-dropped-by-both-production-sinks.md),
    **fixed (0.24.0)**. Its fix is why this conflict is user-visible rather than
    academic: before it, both production sinks filtered load diagnostics to
    error severity, so a warning-severity `unreadable-source` was constructed and
    dropped. Its own §Residuals recorded the sibling settings-file contradiction
    (`theta/load/settings-unreadable` firing for a *missing* file) and explicitly
    picked no winner; that residual is now marked resolved the same way this one
    is — the narrower, trigger-bearing statement won.
  - **0076** —
    [`0076-existing-root-enumeration-failure-silent.md`](./0076-existing-root-enumeration-failure-silent.md),
    **fixed (0.67.0).** **Boundary.** Same bullet pair, opposite direction: 0076
    owned a root that *exists* and whose enumeration fails, which was silent
    where DISC-2 pins a diagnostic. This report owns a root that does *not*
    exist, which warned where DISC-2 pins silence. The two fixes are
    complementary and neither weakens the other: after both, an existing root
    whose `readdir` fails still warns (`:67`), and an absent conventional root is
    still silent (`:51`–`:53`).
  - **0075** —
    [`0075-symlinked-root-classified-wrong-type.md`](./0075-symlinked-root-classified-wrong-type.md),
    **open.** The other unadjudicated reading of the same `:66` bullet — which
    probe applies to the candidate versus to its ancestors. Disjoint input: 0075's
    candidates `lstat` *successfully* as symlinks, so they never reach the
    `ENOENT` arm this report is about. The exemption added here short-circuits
    before `classifyPath` only on an `ENOENT` `lstat` of a conventional root, so
    it neither fixes nor deepens 0075.
  - **0113** —
    [`0113-listtree-glob-universe-swallow-silent.md`](./0113-listtree-glob-universe-swallow-silent.md),
    **open.** Cites `:66` as the classification rule the `listTree` universe walk
    does not run at all. Out of frame here: this report does not change what `:66`
    prescribes for any path the walk still classifies, only which sources reach it.
- **Affected** (citations at HEAD `faac684`; symbols named beside lines):
  - **Spec.** `docs/spec_topics/discovery/discovery-sources.md:47` (DISC-2's lead
    sentence and its conventional-versus-explicit rationale), `:51`–`:53` (the
    three `silent` *Missing path* cells), `:56`–`:58` (the explicit references,
    whose cells the clean-leaf distinction is genuinely about), `:66` (the
    clean-leaf-`ENOENT` bullet — the anchor), `:67` (the traversal-failure
    sentence bug 0076 closed, which is the neighbouring rule this report must not
    disturb).
  - **The walk.** `discoverThetas` (`src/discovery/discovery-walk.ts:811`), its
    project-root call (`:839`–`:849`) and global-root call (`:852`–`:862`);
    `CONVENTIONAL_MODES` (`:100`–`:104`); `collectFromEntries` (`:872`);
    `resolveEntry` (`:407`); `classifyPath` (`:291`) and its `ENOENT` arm;
    `ancestorsClean` (`:261`) and `properAncestors` (`:157`), which climbs from
    the path's own root so a relative candidate yields relative ancestors;
    `emitSourceFailure` (`:462`) and its `severity === null` silence arm (`:470`).
  - **The package sibling.** `thetasInDirectory`
    (`src/discovery/package-discovery.ts:468`) reaches the same disposition by a
    different route and needs no change: its own note (`:458`–`:467`) records
    that an `ENOENT` there needs no ancestor walk because both call sites have
    already proven every ancestor enterable, so it classifies `ENOENT` as
    *missing* directly (`:481`–`:489`) and its `missing: null` arm keeps the
    package `theta/` row silent.
  - **The committed comments that document the pre-fix behaviour.**
    `tests/discovery-walk.test.ts:55`–`:58` registers both conventional roots'
    full ancestor chains in *every* fixture, with the reason stated in the
    comment: "so an absent conventional root classifies as a clean (silent)
    missing rather than as an unreadable ancestor failure". The same device and
    the same reason appear at
    `tests/discovery-root-enumeration-failure.test.ts:249`–`:253`. Both are
    witnesses that the pre-fix walk needed the config directory to exist before
    the table's silence cell could be reached at all.
- **Observed at:** v0.88.0 (`faac684`), by source trace and by quotation of the
  two conflicting spec sentences. No execution witness was taken: the pre-fix
  code path is superseded in the same change that closed this report, and the two
  committed fixture comments above already record the behaviour the trace
  describes.

## Summary

DISC-2 says two things about one input. Its table says a conventional discovery
root that is missing is silent, because absence is the normal case. Its
implementation note says an `ENOENT` candidate whose ancestor chain is itself
`ENOENT` is *unreadable* and warns, with no exemption named. For a conventional
root those two sentences meet on the commonest input there is: the workspace has
no host config directory, so both the root (`<config-dir>/theta`) and its parent
(`<config-dir>`) are absent. The note wins in the implementation, so the table's
silence cell is unreachable for that input and the operator gets a
`theta/load/unreadable-source` warning per conventional root per pass.

The two sentences are not equally load-bearing. The clean-leaf distinction exists
for the *explicit references*: when a user typed `--theta ./tools/thetas` or put
a path in `thetaPaths`, the difference between "the leaf is missing" and "an
intermediate directory is missing or denied" is real information about the path
they typed, and DISC-2 gives those sources an error cell either way. A
conventional root is not typed by anyone; it is a convention the extension looks
for, and "the host config directory does not exist" is the ordinary way for it
not to be present.

## Reproduction

Source trace at HEAD `faac684`, over the shipped `discoverThetas`. Input: any
`FileSystem` whose `cwd()` names a directory with no `<config-dir>` child — a
workspace the host has never written to.

1. `discoverThetas` builds the project entry
   `joinPosix(fs.cwd(), ".pi/theta")` and calls `collectFromEntries` with
   `CONVENTIONAL_MODES` (`src/discovery/discovery-walk.ts:839`–`:849`).
2. `resolveEntry` (`:407`) calls `classifyPath` (`:291`), whose `lstat` of
   `<cwd>/.pi/theta` rejects `ENOENT`.
3. The `ENOENT` arm calls `ancestorsClean` (`:261`), which `lstat`s the proper
   ancestors root-first. `<cwd>/.pi` rejects `ENOENT`, so the predicate answers
   `false` on its first non-existent ancestor.
4. `classifyPath` therefore returns `{ kind: "unreadable" }`, and
   `emitSourceFailure` (`:462`) emits `theta/load/unreadable-source` at
   `CONVENTIONAL_MODES.unreadable`, which is `"warning"`.
5. The global root repeats the shape whenever the host's global agent directory
   is absent (`:852`–`:862`).

The `missing: null` cell — the table's `silent` — is never consulted on this
input, because the classification never says *missing*. Reaching it requires the
config directory to exist, which is exactly the device
`tests/discovery-walk.test.ts:55`–`:58` plants in every fixture and states in its
comment.

Post-`0013`, that warning is delivered rather than dropped: `makeLoadEmit` and
`emitLoadNote` no longer filter to error severity, so each pass adds a persistent
`theta-system-note` naming a root the operator never configured.

## Expected behaviour

- `docs/spec_topics/discovery/discovery-sources.md:47` — DISC-2's lead sentence:
  "*conventional locations* (global directory, project directory, package
  `theta/` directories) silently tolerate absence — that is the normal case on a
  fresh install or in a project that ships no thetas". A rule whose stated
  rationale is "this is the normal case" cannot be conditioned on the parent
  directory existing, because on a fresh install it does not.
- `:51`–`:53` — the three `silent` *Missing path* cells. Under DIAG-2 a
  registered code fires on its documented trigger and not otherwise; a cell that
  no reachable input satisfies is not a cell.
- `:56`–`:58` — the explicit references keep an error (or, for `--theta`, an
  error in every column), so the clean-leaf distinction stays meaningful exactly
  where a user named the path.
- `:67` — a root that *does* exist and whose traversal fails is still an
  unreadable-source warning, "not silence". Any exemption must be keyed on the
  root not existing, never on the failure being inconvenient.
- `docs/STYLE.md` §Claims — a normative section may not carry two sentences that
  prescribe different dispositions for one input without adjudicating between
  them.

## Actual behaviour / root cause

The root cause is a missing carve-out, not a wrong classifier. `classifyPath` is
source-agnostic by design: it answers *what the path is* and leaves *what that
means* to the per-source `FailureModes` its caller supplies. That factoring is
correct for every column of the table except this one, because "missing" and
"unreadable" are not two views of one fact here — the ancestor walk *converts*
one into the other, and the conversion happens before the per-source severities
are ever consulted. A source whose `missing` cell is `null` therefore cannot
express "absence is not an event for me": its silence is available only along a
path the walk can refuse to take.

The `:66` bullet has the same shape as the code: it names one classification
procedure and mentions the per-source split only parenthetically ("silent for
conventional roots, error for explicit references per the failure-modes table
above"), in the *missing* arm alone. Its *unreadable* arm names no source at all,
so read literally it applies to every source, including the three whose absence
the table has already declared a non-event.

## Why it matters

- **A recurring warning about a root nobody configured.** The note names
  `project .pi/theta/` (or `global thetas directory`) as an unreadable discovery
  source in a workspace where nothing is wrong and nothing is missing that the
  operator asked for. There is no action it invites and no way to silence it
  short of creating a directory the operator has no other use for.
- **It trains operators to ignore the channel.** `theta/load/unreadable-source`
  is the diagnostic that reports a genuinely denied root — bug 0076 exists
  because that report used to be *missing*. A copy of it on every pass in every
  workspace is the fastest way to make the real one invisible.
- **It made a documented cell unreachable.** Three of the table's eighteen cells
  described a disposition no input could produce, which is a defect in the
  reference regardless of the severity of the symptom.
- **The host-portability work would have widened it.** With the global root moved
  off `<homedir>/.pi/agent` onto the host's own resolved agent directory, and the
  project root onto the host's own config-dir name, the set of hosts and layouts
  in which a conventional root's parent does not exist grows rather than shrinks.

## Fix

Landed with the host-portability change; both halves in the same pass.

**Implementation.** `discoverThetas` probes each conventional root with one
`lstat` *before* classification and `continue`s on `ENOENT`
(`src/discovery/discovery-walk.ts`, the conventional-root loop). Only `ENOENT` is
skipped: a root that exists but cannot be read (`EACCES` / `EPERM`) still reaches
`classifyPath`, still classifies as *unreadable*, and still warns, so `:67` is
untouched. `classifyPath`, `ancestorsClean` and the per-source `FailureModes`
tables are unchanged, which keeps the CLI and settings sources' clean-leaf
behaviour bit-identical — the property bug 0075's frame depends on. The package
`theta/` row needed nothing: `thetasInDirectory` already classifies `ENOENT` as
*missing* without an ancestor walk, for the reason its own note gives.

**Spec.** The `:66` bullet gained a **Conventional-root exemption** clause naming
the disposition explicitly: the ancestor walk governs the explicit references; a
source whose *Missing path* cell is silent is skipped silently on an `ENOENT`
root whatever its ancestor chain looks like; a conventional root that exists but
cannot be read still warns; and the clean-leaf distinction is unchanged for the
CLI and settings sources, where a missing intermediate directory is a real signal
about a path the user typed. The table rows are unchanged, and `:67` is
unchanged.

**Why the table won rather than the note.** The table states an intent with a
rationale ("that is the normal case"); the note states a mechanism. Where a
mechanism makes a stated intent unreachable for the input the intent names, the
mechanism is the thing that is wrong. The opposite reconciliation — amending the
three cells to `warning (when the config directory is also absent)` — would have
made a fresh install a reportable condition on every host, which no other
sentence in the corpus supports.

## Non-goals

- **The explicit references.** The CLI `--theta` and settings `thetaPaths`
  sources keep the clean-leaf walk exactly as `:66` describes it, including the
  `itself ENOENT` arm. Their columns are unchanged.
- **`:67`'s existing-root failures.** A symlink loop, an `EACCES` on `readdir`,
  or any other traversal failure inside a root that exists remains a diagnostic
  at the source's own severity — bug 0076's territory, and the reason the
  exemption is keyed on `ENOENT` alone.
- **Bug 0075's probe question.** Which probe classifies the candidate versus its
  ancestors is untouched; a link-typed root still takes whatever arm it took
  before.
- **Bug 0113's universe walk.** `listTree` still runs no ancestor walk and
  inspects no code; that swallow is 0113's subject.
- **The package install roots.** `enumerateRoot`
  (`src/discovery/package-discovery.ts:256`) skips a root on *any* `readdir`
  rejection, not only `ENOENT`, so a denied `<config-dir>/npm` contributes
  nothing and reports nothing. That is a distinct swallow in bug 0076's family
  and is not adjudicated here.

## Provenance

- Filed as part of the host-portability change's spec reconciliation: the change
  moved the two conventional roots onto host-resolved locations
  (`FileSystem.configDirName()` / `globalAgentDir()`), which made the
  absent-parent case the ordinary rather than the incidental one and forced the
  `:51`–`:53` versus `:66` conflict to be decided rather than inherited.
- The conflict itself pre-dates that change and was reachable from v0.24.0
  onward, when bug 0013's fix stopped both production sinks filtering
  warning-severity load diagnostics and the note began reaching operators.
- No prior report named this pair. Bug 0076 named the neighbouring bullet (`:67`)
  and closed the opposite direction; bug 0075 names a third reading of `:66`;
  bug 0013's §Residuals named the sibling settings-file contradiction, which was
  reconciled in the same pass as this one and on the same principle.
