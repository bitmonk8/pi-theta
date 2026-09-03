# Bug 0378 — The watch-root union dedupes by separator-normalised string only, so two case-variant spellings of one physical directory (a legal settings + `--theta` pair naming the same dir) arm chokidar over both: every file add/unlink under the dir delivers once per spelling, and the structural-change note reports `theta watcher: 2 file(s) added or removed` — with `details.structural.added` carrying the same physical file twice — for one physical add

- **Status:** fixed (0.376.0).
- **Sev/Diff estimate:** S3/D2 — the wrong-diagnostics class (impact 4): the
  note's `<N>` and the wire payload `details.structural.added` both
  double-count one physical file, and the only spec-licensed double-count
  (PIC-38's same-window rename) is explicitly across-role, never within
  `added`. Registration outcomes, the reload rebuild (one debounce window, one
  rebuild), and containment are all unaffected, so no value is wrong and no
  intent is dropped — S3. D2: the fix is one dedup at the union build —
  canonicalise `discoveryWatchRoots` members through the corpus's existing
  `canonicalizePath` (`src/runtime/invocation.ts:142`) with an
  exists-gated fallback (the same pattern bug 0329's fix installed at
  `production-composition.ts:1354–1356`) so one physical directory is one Set
  member whatever each source spelled — plus one witness. Distinct physical
  dirs keep distinct members; case-sensitive hosts are byte-identical
  (realpath preserves spelling), so no behaviour moves there.
- **Kind:** defect against
  `docs/spec_topics/pi-integration-contract/registration-steps.md:36`'s `<N>` semantics (the
  worked example fixes one added file at `N = 1`: "with `added.length = 1,
  removed.length = 0`, the rendered content is `theta watcher: 1 file(s) added
  or removed…`"), with a spec gap underneath: no sentence pins physical-directory
  identity for the step-5 armed set, and the implementation's own comment
  claims an identity it does not establish (see §Actual).
- **Related:**
  - [0310](../../../docs/bugs/0310-watch-roots-derived-from-discovered-files-not-root-union.md) /
    [0339](../../../docs/bugs/0339-package-source-present-but-empty-contributing-dir-not-watched.md) — fixed
    (0.301.0 / 0.321.0). Fixed the watch set's MEMBERSHIP (present-but-empty
    roots); this report is the set's IDENTITY keying — the union those fixes
    built dedupes by exact string after separator normalisation only.
  - [0311](../../../docs/bugs/0311-structural-note-derived-from-name-set-not-watcher-paths.md) —
    fixed (0.314.0). Built the note's batch-path derivation this report
    measures: `added`/`removed` dedupe within role by raw event-path string
    (`hot-reload.ts:341–348`), which two spellings of one file defeat.
  - [0361](../../../docs/bugs/0361-case-variant-import-dir-splits-declaring-identity.md)
    — open. Same input class (case-variant directory spellings on a
    case-insensitive host), disjoint subsystem (`.thetalib` declaring
    identity) and disjoint consequence (silent wrong `==`).
  - [0331](../../../docs/bugs/0331-theta-root-marshalling-flattens-source-priority.md)
    — fixed (0.323.0). Established that the same dir named by two sources is
    a legal, warning-only configuration (cross-source shadowing; higher tier
    wins) — the reachability premise of this report.
- **Affected** (verified at 9474dfa8, v0.347.0):
  - `src/extension/production-composition.ts:700–706` —
    `discoveryWatchRoots`: `new Set([...activeRoots.map(r => r.replace(/\\/g,
    "/")), ...walk.roots, ...packageWalk.roots.map(…)])` — separator-only
    normalisation; the preceding comment (`:692–693`) states "canonicalised
    below to the same forward-slash comparison form so one physical directory
    is one Set member", which case variance falsifies.
  - `src/discovery/discovery-walk.ts:537`, `:541`, `:902`, `:919`, `:1120` —
    every `roots.add(...)` records the ENTRY's spelling
    (`normalizePath` = separator swap only, `:137–139`), so per-source
    spellings of one physical dir survive into `walk.roots`.
  - `src/extension/production-composition.ts:1241` — `watchRoots` union
    (same string-keyed Set), threaded to the armed watcher at `:1626–1637`.
  - `src/seams/pi-file-watcher.ts:114` — `this.#watch([...roots], …)`: the
    root list reaches chokidar verbatim; chokidar keys watched dirs by path
    string, so case-variant spellings are two independent watches (probed:
    it DOES collapse a trailing-slash variant, see §Non-goals).
  - `src/extension/hot-reload.ts:341–348` — `added`/`removed` derived from the
    batch with a per-role `Set` of raw `event.path` strings; two spellings of
    one physical file are two members.
  - `src/extension/reload-wiring.ts:479–503` — `structuralChangeNote` renders
    `<N> = added.length + removed.length` from those arrays.

## Summary

The step-5 watch set is a string-keyed union of per-source root spellings.
Discovery records each root as the source spelled it (settings operand, CLI
component); a settings entry `<R>/Shared` and a CLI `--theta <R>/shared`
naming one physical directory is a legal configuration (the files inside
dedupe as a cross-source shadow, warning only, CLI wins), but the two
spellings both enter `walk.roots`, survive the separator-only Set, and arm
chokidar twice over one physical directory. Chokidar then delivers every
`add`/`unlink`/`change` under that directory once per armed spelling, each
event path spelled under its root. The debounce window collapses them into one
rebuild (no rebuild-level harm), but the structural-change note counts the
batch per spelling: one physical `.theta` created reports `theta watcher: 2
file(s) added or removed`, and the wire payload `details.structural.added`
lists the same physical file under both spellings.

## Reproduction

Offline, real filesystem (case-insensitive NTFS), worktree at 9474dfa8.
Scratch workspace `<ws>` with `<ws>/shared/hello.theta` (valid theta),
`<ws>/.pi/settings.json` = `{"thetaPaths": ["<ws>/Shared"]}` (case-variant
spelling), CLI flag `theta = <ws>/shared`. Drive the SHIPPED composition
(`createThetaExtension` → `composeExtensionInstance`) with the
roots-recording fake watcher + `FakeClock` (the bug-0310/0311 harness shape).

1. Armed set observed (forward-slashed):
   `["<ws>/shared", "<ws>/Shared", "<ws>/.pi/settings.json",
   "~/.pi/agent/settings.json"]` — two members for one physical directory.
   `/hello` registers (the theta itself dedupes via the cross-source shadow).
2. Real chokidar (`PiFileWatcher`) armed over exactly those two spellings;
   create `<ws>/shared/new.theta`:
   `[{"kind":"add","path":"…\\Shared\\new.theta"},
   {"kind":"add","path":"…\\shared\\new.theta"}]` — two events, one file.
   Control (one spelling): one event.
3. Feed those two events through the shipped debounce + note path
   (`FakeFileWatcher.emit` × 2, clock past 250 ms):
   `content: "theta watcher: 2 file(s) added or removed; run /reload to
   refresh the slash command list"`, `details.structural.added` =
   `["<ws>/Shared/brand-new.theta", "<ws>/shared/brand-new.theta"]`.

One physical file was added; the note asserts two.

## Expected behaviour

- `registration-steps.md:36` (§Structural changes): `<N>` "equals
  `details.structural.added.length + details.structural.removed.length`", and
  the worked example fixes the one-added-file case: "with `added.length = 1,
  removed.length = 0`, the rendered content is `theta watcher: 1 file(s) added
  or removed…`". The only double-count the paragraph licenses is a same-window
  rename "counts twice, since the two arrays are disjoint by role and not
  deduplicated against each other" — an across-role rule; nothing licenses one
  physical add contributing two `added` members.
- `runtime-event-channel.md` (§System-note `details` shapes, the `structural`
  bullet): "`added` and `removed` carry absolute file paths from the
  debounce-window batch … a single settings edit that adds N sources
  contributes N entries to `added`" — the payload's semantic unit is files
  brought in or removed, and one created file is one entry.
- `registration-steps.md:22` (step 5): the watcher is registered "over the
  discovered roots" — the discovery-root union of
  `discovery-sources.md:27–35`, a set of directories; one physical directory
  reached by two entries is one root, exactly as the file-level walk already
  treats one file reached by two entries as one theta (the shadow warning in
  step 1).

## Actual behaviour / root cause

`walk.roots` records the ENTRY spelling for every source
(`discovery-walk.ts:537`, `:541`, `:902`, `:919`, `:1120`), and the
`discoveryWatchRoots` union (`production-composition.ts:700–706`) dedupes by
forward-slashed string only — the comment's claim that after this "one
physical directory is one Set member" (`:692–693`) holds for separator
variance but not case variance, which a case-insensitive filesystem accepts
without correction. `PiFileWatcher` hands the list to chokidar verbatim
(`pi-file-watcher.ts:114`); chokidar keys its per-directory watchers by path
string, so both spellings watch the one physical dir and every event under it
is delivered once per spelling with the root's own casing in the path. The
0311-fixed note derivation then dedupes `added`/`removed` within role by raw
path string (`hot-reload.ts:341–348`), so the two spellings of one file are
two entries, and `structuralChangeNote` (`reload-wiring.ts:479–503`) renders
`N = 2`.

## Why it matters

The note is the designed operator observable for structural changes, and its
count and payload lie whenever the (legal, warning-only) configuration names
one directory from two sources with different casing — ordinary on Windows,
where the filesystem accepts any casing and settings files / shell history
routinely disagree. Every add, every unlink, and every rename under the dir
is double-counted (a rename reports 4, not the PIC-38-pinned 2), and any
consumer of the pinned `details.structural` wire shape sees phantom files.
The doubled `change` events also make every content edit under the dir enter
the debounce batch twice — currently harmless (one rebuild), but any future
per-event consumer inherits the duplication.

## Non-goals

- The trailing-slash variant of the same derivation (settings entry
  `<ws>/shared/` double-arms `<ws>/shared` + `<ws>/shared/` — probed) is
  NOT claimed to double-report: chokidar collapses the slash-variant to one
  watch, so the armed-list duplicate has no event-level observable. Only the
  case-variant class delivers duplicate events.
- No claim against the rebuild path: the debounce window coalesces both
  events into one `runReload`; registration outcomes are correct.
- The cross-source shadow warning for the theta FILE inside the dir is
  spec-conformant behaviour (deliberately separator-only identity;
  wave-1 finding), not part of this report.
- INV-1 containment is unaffected: `activeRoots` consumers canonicalise both
  sides (`invocation.md` §Resolution), and this report does not touch them.

## Fix

Dedupe the union by canonical identity at the one place it is built: map each
`discoveryWatchRoots` member through the existing `canonicalizePath`
(`src/runtime/invocation.ts:134–147`) with an exists-gated fallback to the
normalised spelling (the bug-0329 fix's pattern,
`production-composition.ts:1354–1356` — a root can be present-but-empty but
never missing here, since every member came from a successful classify or
enumerate). One physical directory then arms once whatever each source
spelled, on both filesystem regimes. Alternative (rejected): dedupe the event
batch by `realpath` at note-derivation time — leaves the double watch (and
the doubled `change` traffic) in place and adds per-event fs calls on the hot
path. A spec sentence under step 5 should pin the armed set to
physical-directory identity, mirroring the identity sentence
[0361](../../../docs/bugs/0361-case-variant-import-dir-splits-declaring-identity.md)
§Fix asks for on the import side.

## Provenance

path-identity-2 bug-hunt sweep, 9474dfa8 (v0.347.0). Probes:
`tests/scratch-pi2-watchroots.test.ts` (cells 1/2/2b/3: shipped-composition
arming, real-chokidar event counts variant + control, shipped debounce+note
chain) and `tests/scratch-pi2-trailslash.test.ts` (trailing-slash sibling,
armed-list duplicate with single event — §Non-goals) — both deleted after the
run; outputs as quoted in §Reproduction.

## Fix (0.376.0)
- What shipped:
  - `src/extension/production-composition.ts` — the step-5 `discoveryWatchRoots`
    union is built through the new `dedupeWatchRootsByIdentity(fileSystem, …)`
    helper, which maps each member through the corpus's existing
    `canonicalizePath` (`src/runtime/invocation.ts`) with an exists-gated
    fallback to the forward-slashed spelling (the bug-0329 drop-target
    canonicalisation pattern), so one physical directory is one armed root
    whatever each source spelled — case variance no longer double-arms
    chokidar. The later `watchRoots` fold canonicalises the import-closure dirs
    (`canonicalClosureDirs`) to the same physical-directory identity BEFORE the
    nesting-exclusion filter, so a case-variant closure-dir spelling cannot
    escape the exclusion and double-arm a directory a discovery root already
    covers. The falsified comment claiming the forward-slash form alone makes
    one physical directory one Set member is corrected to attribute identity to
    the `realpath` dedup.
  - `docs/spec_topics/pi-integration-contract/registration-steps.md` — step 5
    gains one sentence pinning the armed set to physical-directory identity
    (canonical `FileSystem.realpath`, forward-slash-normalised), mirroring the
    landed bug-0361 identity sentence at `imports.md` and cross-referencing
    `../invocation.md`'s Resolution paragraph (no taxonomy fork per 0326).
  - `tests/b0378-watch-root-case-variant-double-arming.test.ts` — the offline
    witness (shipped composition + a `CaseVariantFanoutFileWatcher` modelling
    chokidar per-root-string arming + `FakeClock`).
- Gates:
  - Witness: `npx vitest run tests/b0378-watch-root-case-variant-double-arming.test.ts`
    — 4/4 GREEN after the fix; RED at the fork (cell 1 armed count 2 not 1;
    cell 2 note "2 file(s)" not "1"); verifier confirmed the revert-to-red with
    byte-exact restoration (`git hash-object` match).
  - Full default suite: `npm test` — 551 files / 10236 tests GREEN (6 timeout
    flakes under parallel-lane load, all 141/141 GREEN re-run isolated).
  - Typecheck: `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) — clean.
  - Lint: `npm run lint` (`eslint … "src/**/*.ts"`) — clean.
  - Live: `tests/live/double-session-start-live.test.ts` — GREEN (real model,
    7.25s) under the lane live lock; the adjacent existing watcher/session_start
    live cell (no registration/drive outcome changes, so no new live cell owed).
- Review: 2 rounds. Round 1 (`bug-fix-reviewer`): F1 house-rule (two new
  helpers inserted between the `runComposePass` doc block and its declaration,
  orphaning the doc comment) — fixed by `bug-fix-fixer-light` code-motion; F2
  (`0.376.0` placeholders) rejected — mandated by the parallel-lane protocol;
  R1 (bare-`mkdtempSync` witness convention) accepted as residual. Round 2
  (`bug-fix-reviewer-fast`): CLEAN; raised R2 (a comment's "above" pointer to
  the 0329 pattern that actually sits below) — fixed as a bounded comment-only
  correction.
- Verification: `bug-fix-verifier` verdict SOLID. Witness reds-on-revert with
  byte-exact restore (hash `85501f82…` before and after); full suite green
  (flakes exonerated isolated); typecheck+lint clean; live discharged by the
  orchestrator.
- Residuals:
  1. The witness compares armed roots via bare `mkdtempSync` + lowercase
     `norm()` (forward-slash + lowercase only), a convention shared by sibling
     watch-root tests (`b0310`, `b0312`); tolerates case rewrites but not a
     non-case spelling rewrite (8.3 short names, symlinked tmp). Green on this
     Windows host and convention-wide; harden with `realpathSync(mkdtempSync(…))`
     if ever ported. Non-blocking.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the rejected alternative (dedupe the event
  batch by `realpath` at note-derivation time) stays rejected — the fix lives
  at the watch-root union build, and `hot-reload.ts` is unchanged. The
  cross-source file-level shadow warning's separator-only identity, the trailing-
  slash armed-list duplicate (no event-level observable), and INV-1 containment
  are untouched (bug doc §Non-goals).
