# Bug 0379 — A `tools:` `.theta` entry's derived default name is computed from the ENTRY's spelling, not "the file's basename" the spec pins, so on a case-insensitive host `./Util.theta` naming on-disk `util.theta` un-registers the caller with `theta/load/invalid-derived-tool-name` (whose hint orders a rename the file does not need), while `./util.theta` naming on-disk `Util.theta` silently mints callable `util` where the spec mandates that same refusal

- **Status:** fixed (0.368.0).
- **Sev/Diff estimate:** S2/D2 — S2: two divergences from one root cause,
  the same two-direction shape as bug 0363. Direction (i) is silent
  permissive acceptance: a configuration the derived-name rule refuses
  (on-disk stem `Util` → derived name `Util`, not lowercase-first) registers
  a callable under a name (`util`) that matches neither the file's basename
  derivation nor anything the file carries. Direction (ii) falsely refuses a
  conformant configuration — the callee file's stem is already
  lowercase-first — and the diagnostic's fixed remedy ("rename the file or
  add an 'as' clause") names an artefact that needs no change. Not S1: no
  wrong value is computed; the callable in (i) dispatches the right file (the
  snapshot's `calleePath` re-resolves case-insensitively), so the harms are a
  forbidden registration and a false refusal with a lying hint. D2: derive
  the default name from the resolved file's on-disk basename (the resolver
  already opens the callee; the corpus's `fs.realpath` seam returns on-disk
  casing — the treatment `production-composition.ts:1327`, `await
  fs.realpath(theta.sourcePath)` through `PiFileSystem`, applies two passes
  later), plus
  one spec sentence choosing the on-disk name for case-insensitive hosts.
- **Kind:** defect against
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:84` on both
  directions — "For a `.theta` path, the default name is **the file's
  basename** without the `.theta` extension" — with the same spec gap
  underneath as bug 0363: no sentence contemplates an entry whose spelling
  differs from the on-disk name, a state only case-insensitive hosts reach.
- **Related:**
  - [0363](../../../docs/bugs/0363-file-entry-stem-judged-on-entry-spelling.md)
    — open. The discovery twin: explicit `thetaPaths`/`--theta` file entries
    derive the SLASH name from the entry spelling (DISC-3's
    `invalid-slash-name`). Disjoint subsystem (`callable-set.ts` vs
    `discovery-walk.ts`), disjoint rule (frontmatter `tools:` derived-name vs
    DISC-3 filename validity), disjoint code
    (`theta/load/invalid-derived-tool-name` vs `theta/load/invalid-slash-name`),
    same root posture (entry spelling substituted for on-disk name).
  - [0329](../../../docs/bugs/0329-hash-mismatch-refusal-does-not-refuse-invocation.md)
    — fixed (0.322.0). Its fix comment
    (`production-composition.ts:1312–1321`) already adjudicates this exact
    hazard for a sibling seam: "an author-written case-mismatched `tools:`
    spelling still resolves to the real file … a raw string compare … would
    miss". The name-derivation seam never received the treatment.
  - [0108](../../../docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md)
    — fixed (0.213.0). The Pi-tool-arm sibling of the same lowercase-first
    rule (host registry name, no file involved) and the origin of the
    two-arm split at `callable-set.ts:246–275`; this report is about which
    ARTEFACT the `.theta` arm's derivation reads, not the arm split.
  - [0069](../../../docs/bugs/0069-tools-entry-residue-silently-dropped.md)
    — fixed (0.62.0). Owns the entry grammar whose parsed `spec` this
    derivation consumes (`callable-set.ts:242–244` cites it for the
    discriminant lock-step); disjoint input class.
- **Affected** (verified at 9474dfa8, v0.347.0):
  - `src/parser/callable-set.ts:467–471` — `thetaDefaultName(thetaPath)`:
    basename of the PATH STRING handed in, minus `.theta`, hyphens→underscores.
  - `src/parser/callable-set.ts:419`, `:424` — both callers pass `spec`, the
    entry text as written; `:441` pins `calleePath: spec` ("as written") for
    dispatch, so resolution succeeds case-insensitively while the name is
    derived from the unresolved spelling.
  - `src/parser/callable-set.ts:246–258` — the
    `theta/load/invalid-derived-tool-name` arm judges
    `name = parsed.rename ?? resolution.defaultName` (`:226`); message
    interpolates the entry-derived name, hint (registry *Hint*,
    `code-registry-load.md:36`) is "Rename the callee file to a
    lowercase-first stem, or name the entry with `as <name>`".
  - `deps.resolveThetaCallee(spec)` (`:423`) — the production resolver
    (`production-composition.ts`, `resolveThetaToolsAtLoad`'s callee cache)
    opens the file through the case-insensitive filesystem; no site compares
    the entry basename against `readdir` output or `realpath` casing.
- **Observed at:** v0.347.0 (9474dfa8), offline — shipped composition
  (`createThetaExtension` → `composeExtensionInstance`) over a real NTFS
  scratch root, `FakeFileWatcher`/`FakeClock` seams only.

## Summary

`resolveCallableSet` derives a `.theta` entry's default callable name from the
entry path's own basename (`thetaDefaultName(spec)`). The spec defines the
default name over "the file's basename". On a case-insensitive filesystem the
entry resolves to a file whose on-disk basename can differ in case from the
entry's spelling, so the two definitions diverge in both directions: a
conformant file referenced with an uppercase-spelled entry is refused
(`invalid-derived-tool-name`, un-registering the whole caller theta, hint
demanding a file rename the file does not need), and a non-conformant file
referenced with a lowercase-spelled entry mints its callable silently under a
name the file's basename does not derive.

## Reproduction

Offline, real filesystem (case-insensitive NTFS), worktree at 9474dfa8. Root
`<R>/w`, caller `caller.theta` (`mode: prompt`) with a single `tools:` entry;
callee body a valid subagent-mode theta. Shipped composition; observables:
the registry (`wiring.registry.get("caller")`), the caller's frozen
`callableSet.entries` keys, and the diagnostics notes.

1. Direction (ii): on-disk `util.theta`, entry `"./Util.theta"` →
   `callerRegistered: false`, diagnostic
   `error theta/load/invalid-derived-tool-name: 'tools:' entry './Util.theta'
   derives the default name 'Util', which must be lowercase-first; rename the
   file or add an 'as' clause`. The file's basename is `util.theta`; its
   derivation `util` is legal; the hinted rename is a no-op.
2. Direction (i): on-disk `Util.theta`, entry `"./util.theta"` →
   `callerRegistered: true`, `callableNames: ["util"]`, no `tools:`
   diagnostic (the only row is `Util.theta`'s own discovery-side
   `invalid-slash-name`, a separate surface that does not gate `tools:`
   callees). The file's basename derives `Util` → the spec's mandated outcome
   is the `invalid-derived-tool-name` refusal; instead the callable registers.
3. Control: on-disk `util.theta`, entry `"./util.theta"` →
   registered, `callableNames: ["util"]`.

On a case-sensitive host both variant entries are
`theta/load/unresolvable-theta-path`, so (1) and (2) are case-insensitive-host
inputs specifically.

## Expected behaviour

- `frontmatter/frontmatter-fields-a.md:84`: "For a `.theta` path, the default
  name is the **file's** basename without the `.theta` extension, with hyphens
  replaced by underscores … A derived name outside that rule is
  `theta/load/invalid-derived-tool-name` … **remedied by renaming the file**
  or adding an `as <name>` clause". The renameable artefact is the file; the
  rule is defined over the file's name. In (1) the file's basename derives
  `util` (legal) → the entry resolves, no refusal, callable `util` (the
  control's outcome). In (2) the file's basename derives `Util` (illegal) →
  `invalid-derived-tool-name`, and "one such entry un-registers the whole
  theta" (`code-registry-load.md:36`).
- `code-registry-load.md:36` — Trigger "the basename without `.theta`",
  Hint "Rename the callee file to a lowercase-first stem": both sentences are
  coherent only under the on-disk-file reading; under the entry-spelling
  reading the hint in (1) prescribes renaming a file that already conforms.

## Actual behaviour / root cause

`thetaDefaultName` (`callable-set.ts:467–471`) never sees the file — it takes
the entry literal (`spec`) both where the resolution fails early (`:419`) and
where it succeeds (`:424`), and the judged `name` (`:226`, `:246–258`) is that
derivation. Resolution itself (`deps.resolveThetaCallee(spec)`, `:423`) opens
the callee through the case-insensitive filesystem, so the entry is fully
functional while its spelling diverges from the on-disk name; nothing
compares the entry basename to `readdir` output (the IMP-1-style byte check
the `.thetalib` resolver performs) or canonicalises via the `fs.realpath`
seam (the treatment the same file-flow applies two passes later at
`production-composition.ts:1327` — `await fs.realpath(theta.sourcePath)`
through `PiFileSystem` — for the bug-0329 callee-locate map). The
snapshot then carries `calleePath: spec` (`:441`), so dispatch re-resolves the
case-variant spelling and works — making direction (i)'s acceptance fully
silent.

## Why it matters

Direction (i) mints a model-visible callable under a name the spec's rule
refuses, silently: the callable name (`util`) matches neither the file
(`Util.theta`) nor what the same configuration produces on a case-sensitive
host (a load failure), so a repo authored this way works on the author's
Windows machine and breaks for every case-sensitive collaborator with no
diagnostic anywhere on the Windows side. Direction (ii) un-registers an
entire theta over a name violation the file does not have, with a fixed hint
that sends the author to rename a conformant file — the wrong-remedy class of
lying diagnostics. Case-variant `tools:` spellings are ordinary on Windows
(tab completion and habit produce them; the filesystem never corrects them).

## Non-goals

- Extension-case variance (`./util.THETA`) is correctly refused byte-exact
  (`theta/parse/invoke-non-theta-extension` via `checkInvokeExtension`,
  `callable-set.ts:411–421`) per lexical.md §Extension matching — defined
  over the entry text; not a defect.
- The `as <name>` rename arm is unaffected: an explicit rename target is
  judged on its own text (`invalid-tool-rename`), which is the author's
  artefact by definition.
- Hyphen/underscore divergence between entry and file cannot arise from case
  insensitivity (`-` and `_` differ byte-wise on every filesystem), so the
  hyphen-remap half of the rule has no entry-vs-file split; only the
  case-sensitivity of the lowercase-first predicate does.
- Directory-segment case variance in the entry (`./SUB/util.theta`) does not
  move the derived name (basename only) — it feeds the sibling identity
  reports (0361/0362), not this one.
- `Util.theta`'s own `theta/load/invalid-slash-name` at discovery
  (bug 0363's DISC-3 surface) is correct and unchanged here; it does not
  gate `tools:` resolution, which is what lets direction (i) register.

## Fix

Derive the default name from the resolved file: after
`deps.resolveThetaCallee(spec)` succeeds, take the basename from the callee's
canonical path via the corpus's `fs.realpath` seam — on-disk casing on
case-insensitive hosts, byte-identical on case-sensitive ones — and run the
existing lowercase-first judgment on that derivation. Canonicalise at the
call site (`callable-set.ts:424`, after resolution succeeds), not inside
`thetaDefaultName`: that function is the SINGLE shared implementation of the
derived-name rule, also called by the producer's snapshot-absent fallback
(`production-theta-producer.ts:4464`, `:4537`), which has no resolved callee
— moving canonicalisation into it breaks the no-divergence lock its doc
comment pins (`callable-set.ts:460–466`,
[0253](../../../docs/bugs/0253-fallback-hyphenated-theta-default-name-diverges.md)). Both directions close together:
(1) derives `util` and registers; (2) derives `Util` and refuses with a hint
whose rename remedy is now truthful. The unresolvable-entry arm (`:419`)
keeps the entry-derived name (there is no file to read; the diagnostic there
is `unresolvable-theta-path` anyway). Equivalent alternative: `readdir` the
parent and match the entry case-insensitively, the fix shape bug 0363
recommends for the discovery twin — either way, one spec sentence under the
`tools:` derived-name bullet should pin the on-disk basename as the
derivation source, mirroring the sentence 0363 asks for under DISC-3.
Sequencing constraint: this fix and
[0363](../../../docs/bugs/0363-file-entry-stem-judged-on-entry-spelling.md)'s
want ONE shared spec sentence ("on a case-insensitive host, the on-disk name
is the derivation source") stated once and referenced from both DISC-3 and
the frontmatter derived-name bullet — the two fixes must not write divergent
prose.

## Provenance

path-identity-2 bug-hunt sweep, 9474dfa8 (v0.347.0). Probes:
`tests/scratch-pi2-derivedname.test.ts` (directions (i)/(ii) + control,
outputs as quoted) and `tests/scratch-pi2-parsecache.test.ts` (the sweep cell
that first exposed the diagnostic; also established that the pass parse
cache's spelling-keyed split does NOT double-emit callee diagnostics — logged
as a false trail, not filed) — both deleted after the run.

## Fix (0.368.0)

- What shipped:
  - `src/parser/callable-set.ts` — after `resolveThetaCallee(spec)` succeeds, `resolveEntry` byte-matches the entry's own basename (`entryBasename`) against the resolved callee's on-disk basename (`ResolvedThetaCallee.onDiskName`) and refuses a mismatch as `theta/load/unresolvable-theta-path` (existing message, entry as written), BEFORE the prompt-mode arm — the exact verdict a case-sensitive host already gives. `thetaDefaultName` and its 0253 no-divergence lock are byte-untouched: the derivation source does NOT change (the IMP-1 mirror, not a re-derivation).
  - `src/extension/production-composition.ts` — `onDiskCalleeName` supplies the on-disk basename via a `readdir` byte-check over the callee's parent directory (the IMP-1 mechanism the `.thetalib` resolver uses), NOT `fs.realpath` (which follows symlinks and would refuse a validly-named symlinked callee on every host). It is threaded onto `CalleeParse.onDiskName` on every readable return and onto BOTH production `resolveThetaCallee` closures — the primary load resolver AND the nested `calleeFailsOwnStructuralChecks` stub — so the byte-match is host-uniform at every `tools:` depth.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` §`tools` derived-name bullet — one sentence pinning the on-disk byte-match, referencing (not forking) the on-disk-stem rule bug 0363 landed under Discovery Sources §Filename validity, plus one clause naming why `tools:` refuses where discovery re-derives (the callable name is also a parse-time body identifier, which is FS-free).
  - `docs/spec_topics/diagnostics/code-registry-load.md` — `theta/load/unresolvable-theta-path` Trigger widened to cover the byte-mismatch emission (DIAG-2 same-commit discipline); Message template unchanged. No new registered code; the H7a permitted-codes blob is byte-identical.
- Reversal of the prior Option-1 ratification (recorded on the record): the parent's earlier ratification of the doc's literal §Fix ("derive the presented name from the resolved file's on-disk basename") is REVERSED. An end-to-end runtime measurement established that deriving the presented name at the LOAD layer creates a SPLIT-BRAIN with the PARSE-time body-identifier layer (`toolCallableName` / `collectIdentRoots`, `theta-document.ts`), which has no filesystem seam and keeps deriving the callable name from the entry spelling: for a mid-word case-mismatched entry the body binds the entry name while the snapshot / model / dispatch use the on-disk name, so a body call resolves at parse but MISSES the frozen snapshot at dispatch. Option BM sidesteps this by REFUSING the case-variant entry, so nothing is ever registered under a divergent name — every registered callable has entry basename == on-disk basename, and the parse layer, the load layer, and the spec's "file's basename" all coincide with zero derivation-source change.
- Doc-was-incoherent note: the doc's Expected-(ii) outcome ("register under the on-disk name") is UNACHIEVABLE without a parser rearchitecture (the parse-time body layer is FS-free). Under Option BM direction (ii) instead refuses with a truthful, actionable diagnostic (`unresolvable-theta-path` naming the entry as written; remedy: respell the entry), identical to the case-sensitive host; direction (i)'s silent acceptance closes (refused). The doc's literal §Fix above (realpath re-derive) is SUPERSEDED by this record.
- Gates:
  - Witness: `npx vitest run tests/b0379-tools-entry-byte-match.test.ts` -> 5 passed (case-insensitive host: directions (i)/(ii) + guard + control + extension non-goal; the parity cell materialises on a case-sensitive host). Revert-red (byte-match `if` neutralized in place, restored byte-exact `git hash-object eb297166`) reds directions (i)/(ii) for the stated reason (silent register / lying `derives the default name` message), green after.
  - Full suite: `npm test` -> Test Files 536 passed (536), Tests 10063 passed (10063).
  - Typecheck: `npm run typecheck` -> clean. Lint: `npm run lint` -> clean.
  - Live: `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts` (under the shared live-lock) -> 1 passed — the live tools-resolution / `unresolvable-theta-path` registration path over a legal byte-matched program, witnessing no regression on the fixed surface.
- Review: 2 rounds.
  - Round 1 (`bug-fix-reviewer`, deep): DEFECTS — F1 [correctness] the nested `calleeFailsOwnStructuralChecks` stub omitted `onDiskName`, so the byte-match self-skipped one `tools:` depth down (host-divergence persisted); F2 [spec] `unresolvable-theta-path` Trigger not widened (DIAG-2); F3 [spec] `fs.realpath` follows symlinks and would refuse a validly-named symlink callee on every host (over-reach beyond the case-variance parity); F4 [house-rule] the realpath rejection swallowed all faults; F5 [test] b0329 cell (D) title/banner stale after the re-anchor; + prose residuals R1-R3.
  - Round 2 (`bug-fix-reviewer-fast`, confirmation): CLEAN. F1 threaded on-disk names into the nested stub; F3+F4 rewrote `onDiskCalleeName` to the `readdir` byte-check (symlink-safe, ENOENT-tolerant, else let-crash via the `.then`-reject idiom); F2 widened the Trigger; F5 retitled cell (D); R1-R3 applied.
- Verification (`bug-fix-verifier`): SOLID — revert-red reds the witness for the right reason and restores byte-exact; full suite 536/10063; typecheck + lint clean; `thetaDefaultName` confirmed byte-unchanged and the byte-match confirmed to run before the prompt-mode arm.
- Residuals:
  1. Symlink acceptance (the F3 property — a validly-named symlinked callee is NOT refused) has no offline witness on this host: symlink creation is EPERM on Windows/NTFS without elevation. The property is discharged by the `readdir`-not-`realpath` mechanism and the IMP-1 precedent it mirrors; a case-sensitive / elevated host could add a symlink-acceptance cell.
  2. Bug 0363's Discovery §Filename-validity on-disk-stem rule ACCEPTS a case-variant explicit file reference (re-derives from the real stem); Option BM REFUSES the analogous `tools:` entry. The difference is per-surface and intentional (a `tools:` callable name is also a parse-time body identifier, FS-free, which discovery has no equivalent of); the frontmatter sentence and its clause state this. Not a fork — the shared invariant is referenced, not duplicated.
- Discharge notes appended: `docs/bugs/0329-hash-mismatch-refusal-does-not-refuse-invocation.md` — dated coordination note (parent-ratified) recording the cell (D) re-anchor; closed doc, CRLF + body preserved, 0.368.0 placeholder.
- Pinned dispositions / non-goals: extension-case variance (`./util.THETA`) keeps `theta/parse/invoke-non-theta-extension` (checked before resolution) — unchanged; directory-segment case variance (`./SUB/util.theta`) does not trigger BM (basename-only compare) — stays with bugs 0361/0362; the `as`-rename arm unchanged. FLIP SET = b0329 cell (D) case-insensitive branch + the b0379 witnesses, exactly as ratified; no un-enumerated existing-test red.
