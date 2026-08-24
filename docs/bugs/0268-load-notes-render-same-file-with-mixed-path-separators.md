# Bug 0268 — one load pass renders `theta-system-note` file paths under three mutually inconsistent separator conventions (fully POSIX from the import checks, fully Win32 from the closure walk, mixed Win32-root-plus-POSIX-tail from the discovery walk), and which convention a given file gets is decided by whichever walk parsed it first, so notes from one pass are not greppable by one path spelling

- **Status:** fixed (0.265.0). The seam §Fix left adjudicable was settled
  in-run to the RENDER seam plus a second touch at the note-channel delivery
  funnel — `renderDiagnosticLine` and `sendSystemNote`, both presentational,
  neither a mint site; see `## Fix (0.265.0)`.
- **Sev/Diff estimate:** S4/D1 — S4 because no load, registration, dedup or
  diagnostic-content decision changes: the divergence is confined to the
  rendered `file` field and its `details.diagnostics[].file` twin, and the
  registry code, severity, range and *Message* are identical under every
  spelling. D1 because the three producing sites are named below and the
  candidate remedy is one normalisation at one seam; the cost is that two
  committed witnesses currently compensate by normalising before comparing and
  would have to stop.
- **Kind:** defect — inconsistent rendering of one field across emission sites,
  with no spec rule pinning the field's spelling.
- **Affected:** `src/discovery/discovery-walk.ts:126` (`joinPosix`, base not
  normalised) reached from `discoverThetas`
  (`src/discovery/discovery-walk.ts:997`) at
  `src/discovery/discovery-walk.ts:1050`;
  `src/extension/import-static-checks.ts:92` (`normalizePath`) applied at
  `:387`–`:388`; `collectCallableClosureSources`
  (`src/extension/production-composition.ts:2329`, `rootAbs` at `:2337`,
  `importAbs` at `:2371`) and `parseCalleeForTools` (`:1934`, `absolute` at
  `:1941`), both via node `path.resolve`. Rendered verbatim by
  `renderDiagnosticLine` (`src/diagnostics/diagnostic.ts:64`, head line at
  `:72`, related sites at `:86`) through `renderDiagnosticBatch` (`:97`), which
  both note sinks call — `emitDiagnosticBatch`
  (`src/extension/system-note-channel.ts:336`, `:346`) and `emitLoadNoteGroup`
  (`src/extension/production-composition.ts:1302`).
- **Observed at:** HEAD `b2491a8d`, v0.262.0, Windows. Sixteenth set of bug
  0255's lane find; bug 0264's flagged observation (D).
- **Scope:** the `theta-system-note` channel's rendered `content` and the
  `details.diagnostics[].file` field it carries, on every located diagnostic of
  a load pass. Platform-visible on Win32, where the three conventions differ;
  on POSIX all three coincide and nothing is observable.

## Summary

`Diagnostic.file` is minted by whichever walk first parses a file, and the four
walks that mint it disagree on separators. The discovery walk joins an
un-normalised `fs.cwd()` to a forward-slash tail, so a discovered file renders
as `C:\Users\…\Temp\ws/.pi/theta/x.theta`. The import static checks normalise
the resolved path, so an imported `.thetalib` renders as
`C:/Users/…/Temp/ws/.pi/theta/x.thetalib`. The closure walk and the `tools:`
callee walk use node `path.resolve`, so on Win32 they render
`C:\Users\…\Temp\ws\.pi\theta\x.thetalib`. The render seam
(`renderDiagnosticLine`) prints the field verbatim and normalises nothing.

Bug 0264's pass parse cache (v0.261.0) keys on a separator-normalised path
(`src/extension/pass-parse-cache.ts:55`, `:111`) but stores the first caller's
verbatim `input.path` on the document, and its delivered-diagnostic filter
suppresses every later walk's re-delivery. Two consequences: within one pass a
single file now carries exactly one spelling (bug 0264's originally observed
same-file divergence no longer manifests), and that one spelling is a function
of walk order — the same fixture spells the same library fully-POSIX or
fully-Win32 depending only on how the fixture's filenames sort. Across files,
one pass still emits all three conventions at once.

## Reproduction

Scratch probe at HEAD `b2491a8d`: the host doubles and fixture-planting shape of
`tests/thetalib-reparse-walk-single-delivery.test.ts`, driving
`composeExtensionInstance` over a `mkdtemp` workspace with an undegraded
`RendererGate`, capturing every `theta-system-note` and the JS stack at each
`pi.sendMessage`. The two malformed sources, both from bug 0264's fixture set:

```
// *.thetalib
fn f() {
  let t = `unterminated
  return 1
}
export { f }
```

```
// b0268bad.theta
---
mode: subagent
description: b0268 bad callee
---
let t = `unterminated
let a = 1
```

One pass over one workspace holding six files — `lib1.thetalib` (imported by
`zzz_callee.theta`, which is named in `aaa_caller.theta`'s `tools:`),
`lib2.thetalib` (imported by the discovered `mmm_importer.theta`), and the
discovered `b0268bad.theta` — produced six notes over three files under three
spellings:

| Note | File as rendered | Convention | First-parsing site (stack-captured) |
| --- | --- | --- | --- |
| 0 (lex row) | `C:\Users\…\Temp\ws/.pi/theta/b0268bad.theta` | Win32 root + POSIX tail | `lexTheta` ← `parseViaPassCache` ← `parseDiscoveredTheta`; path minted by `joinPosix(fs.cwd(), …)` (`discovery-walk.ts:1050`) |
| 1 (parse row) | `C:\Users\…\Temp\ws/.pi/theta/b0268bad.theta` | Win32 root + POSIX tail | `emitLoadNoteGroup` ← `sink.emitGroup` (drop group), same document |
| 2 (lex row) | `C:\Users\…\Temp\ws\.pi\theta\lib1.thetalib` | fully Win32 | `lexTheta` ← `parseViaPassCache` ← `visit` ← `collectCallableClosureSources` (`production-composition.ts:2371`) |
| 3 (lex row) | `C:/Users/…/Temp/ws/.pi/theta/lib2.thetalib` | fully POSIX | `lexTheta` ← `parseViaPassCache` ← `checkThetaImports` (`import-static-checks.ts:388`) |
| 4 (parse row) | `C:/Users/…/Temp/ws/.pi/theta/lib2.thetalib` | fully POSIX | `emitLoadNoteGroup` ← `sink.emitGroup`, same document |
| 5 (parse row) | `C:\Users\…\Temp\ws\.pi\theta\lib1.thetalib` | fully Win32 | `emitLoadNoteGroup` ← `sink.emitGroup`, same document |

`details.diagnostics[].file` carries the same three spellings verbatim.

Order dependence, measured on two workspaces holding the same three files with
only the filenames changed:

| Workspace | Discovery order | `b0268lib.thetalib` renders as |
| --- | --- | --- |
| `b0268callee.theta` (importer) before `b0268caller.theta` | importer's `checkThetaImports` parses first | `C:/…/b0268lib.thetalib` (fully POSIX) |
| `aaa_caller.theta` before `zzz_callee.theta` (importer) | caller's closure walk parses first | `C:\…\b0268lib.thetalib` (fully Win32) |

One file, one content, one topology; the rendered spelling flips with the
alphabetical order of unrelated filenames.

Bug 0264's fixture (D) — a malformed `.theta` both discovered and named in a
caller's `tools:` — yields three notes at HEAD, all three under the discovery
walk's mixed spelling: the callee walk's second delivery is suppressed by the
pass cache, so the same-file divergence 0264 recorded is no longer reachable at
that fixture. The class reproduces across files and across walk orders, as
tabled above.

## Expected behaviour

Every `theta-system-note` of one load pass spells any given file one way, and
all files of one pass under one convention, so an operator or a log pipeline can
match a path with one literal.

The spec pins no separator convention for this field. `diagnostic-shape.md:32`
says `file?: string, // absolute path`, and `diagnostic-shape.md:63` fixes the
line format `"<file>:<line>:<col>: <code>: <message>"` without constraining how
`<file>` is spelled. `placeholder-rendering-b.md:9` governs the `<path>` /
`<file>` **message** placeholders — the literal text inside the path-literal
quotes, no realpath normalisation — which is a rule about author-written source
text in a *Message*, not about the head-line `file` field the emitting site
mints. That silence is part of this report: the fix must add the rule, not only
change the code.

## Actual behaviour / root cause

Four minting sites, three conventions:

1. `discoverThetas` (`src/discovery/discovery-walk.ts:997`) builds its
   conventional roots with `joinPosix(fs.cwd(), `${configDir}/theta`)` (`:1050`).
   `joinPosix` (`:126`) trims a trailing `/` from the base and appends
   `` `/${tail}` `` — it never calls the file's own `normalizePath` (`:122`) on
   the base. On Win32 `fs.cwd()` is backslash-spelled, so every discovered
   file's path is a Win32 root with a POSIX tail. `parseDiscoveredTheta` passes
   that path through unchanged, so the discovered file's lex rows and its drop
   group both carry it.
2. `checkThetaImports` normalises: `normalizePath(resolvedPath)`
   (`src/extension/import-static-checks.ts:92`, applied at `:387`–`:388`), so an
   imported `.thetalib` is fully POSIX.
3. `collectCallableClosureSources` (`src/extension/production-composition.ts:2329`)
   resolves `rootAbs` (`:2337`) and each `importAbs` (`:2371`) with node
   `path.resolve`, which is fully Win32 on Windows.
4. `parseCalleeForTools` (`:1934`) resolves `absolute` (`:1941`) the same way.

`PassParseCache.parse` (`src/extension/pass-parse-cache.ts:111`–`:117`)
normalises only the KEY (`normaliseCacheKey`, `:55`); the document it stores
retains `input.path` verbatim, and every diagnostic minted under that parse
carries it. The delivered-diagnostic filter then suppresses later walks, so the
first walk's spelling is the pass's spelling for that file.

`renderDiagnosticLine` (`src/diagnostics/diagnostic.ts:64`) interpolates `file`
(`:72`) and each related site's `file` (`:86`) with no normalisation, and both
note sinks — `emitDiagnosticBatch`
(`src/extension/system-note-channel.ts:336`, `:346`) and `emitLoadNoteGroup`
(`src/extension/production-composition.ts:1302`) — render through it. The seam
is therefore common to every spelling; the divergence is upstream of it.

## Why it matters

- One pass's notes cannot be matched by one path literal. An operator grepping
  the transcript for `.pi/theta/lib1.thetalib` misses the closure-walk spelling;
  grepping for `.pi\theta\lib1.thetalib` misses the import-check spelling.
- Downstream consumers reading `details.diagnostics[].file` (the typed shape
  `diagnostic-shape.md:63` offers LSP integrations and test harnesses) cannot
  key on the field without normalising first.
- Two committed witnesses already pay that cost:
  `tests/thetalib-reparse-walk-single-delivery.test.ts` normalises separators in
  its `headLine`, `positionKey` and `renderedOccurrences` oracles before
  counting, and `tests/lex-drop-single-delivery.test.ts:296` carries the same
  helper for its `row.file` comparison (`:393`). Bug 0264's witness had to
  normalise to red correctly at all.
- The spelling is a function of filename sort order, so a workspace edit
  unrelated to the malformed file can change how that file is reported.

## Non-goals

- Bug 0264's per-walk delivery dedup
  (`./0264-thetalib-reparse-walks-reemit-lex-rows-per-walk.md`). It landed in
  0.261.0 and its counts are not touched here; this report changes what a
  surviving note spells, not how many notes there are.
- Windows-versus-POSIX runtime behaviour. Path resolution, containment
  (`checkInvokePathAtLoad`), discovery-root comparison and cache keying already
  compare normalised forms and are correct; only the rendered and stored `file`
  field is in scope.
- Realpath resolution, symlink resolution, case normalisation, and drive-letter
  casing. The subject is the separator, not path identity.
- The `<path>` / `<file>` message-placeholder rule
  (`placeholder-rendering-b.md:9`), which renders author-written source text and
  stays verbatim.

## Fix

Normalise the separator once, at a single seam, and pin the convention in the
spec.

Constraints:

1. One convention per pass, for every file and every emitting site, on the head
   line (`src/diagnostics/diagnostic.ts:72`), on each related site (`:86`), and
   on the `details.diagnostics[].file` field the same notes carry — the rendered
   string and the structured field must not disagree.
2. No change to any other diagnostic content: code, severity, `range`, *Message*
   and `hint` are byte-identical before and after, and the counts bug 0264
   pinned stay at exactly one per row per file per pass.
3. No change to path resolution, containment or cache keying. The normalisation
   is presentational; the sites that already compare normalised forms keep
   comparing them.
4. `diagnostic-shape.md`'s `file` field description (`:32`) and the serialised
   content format (`:63`) state the convention, so the field is pinned rather
   than incidentally consistent, and so a future fifth minting site inherits it.
5. Witness both directions: a fixture whose file is first parsed by the closure
   walk and one whose file is first parsed by the import checks render
   identically, and the multi-file pass tabled above renders one convention
   across all three files.
6. The two witnesses that currently normalise before comparing
   (`tests/thetalib-reparse-walk-single-delivery.test.ts`,
   `tests/lex-drop-single-delivery.test.ts:296`) drop the compensation and
   compare the spelling directly, so the normalisation is asserted rather than
   hidden.

Candidate seams, left adjudicable:

- **Render seam** — `renderDiagnosticLine` (`src/diagnostics/diagnostic.ts:64`)
  normalises `file` and each related `file` on the way into the line. Smallest
  diff, single site, covers both note sinks; does not fix
  `details.diagnostics[].file`, so constraint 1 needs a second touch at the two
  sinks (`system-note-channel.ts:346`,
  `production-composition.ts:1302`) or a `Diagnostic`-level normalisation
  instead.
- **Mint seam** — normalise at the point each walk names the file:
  `joinPosix`'s base (`discovery-walk.ts:126`), and the `path.resolve` results
  in `collectCallableClosureSources` (`production-composition.ts:2337`, `:2371`)
  and `parseCalleeForTools` (`:1941`). Fixes the structured field and the
  rendered line together and makes the pass cache's key and its stored path
  agree; touches four sites and reaches paths used for more than rendering, so
  constraint 3 carries the weight.
- **Document seam** — normalise `input.path` once inside
  `PassParseCache.parse` (`src/extension/pass-parse-cache.ts:111`) so every
  document minted this pass carries the normalised spelling regardless of
  caller. One site, covers both fields; leaves any parse that bypasses the cache
  unnormalised, which constraint 5's witness must cover.

## Provenance

Bug 0264's flagged observation (D) — recorded at
`./0264-thetalib-reparse-walks-reemit-lex-rows-per-walk.md:119` (§Reproduction),
`:213` (§Non-goals, "the (D) path-spelling divergence … is a separate subject
and is not fixed by making the delivery single") and `:363` (§Fix (0.261.0)
residual 1, "the cache KEY is separator-normalised so the duplicate collapses,
but no rendered path spelling is changed … Filing material") — and
`.pi/tmp/fixes/0264-report.md`. Sixteenth set of bug 0255's lane find.
Reproduced at HEAD `b2491a8d` (v0.262.0) with a scratch probe imitating
`tests/thetalib-reparse-walk-single-delivery.test.ts`, deleted after the sweep.
The observation as originally worded — one file, two spellings, one pass — no
longer reproduces at HEAD; the class reproduces as the cross-file and
walk-order divergence tabled in §Reproduction.

## Fix (0.265.0)

- What shipped:
  - `src/diagnostics/diagnostic.ts` — new exported pure helper
    `toPosixFileSpelling` (argument-only, no host access, no module state);
    `renderDiagnosticLine` spells the head-line `file` and every related
    site's `file` through it, so every rendered surface — both note sinks, the
    stderr mirror and the watcher-recovery note — carries one convention
    (§Fix constraints 1 and 4).
  - `src/extension/system-note-channel.ts` — `sendSystemNote` spells
    `details.diagnostics[].file` and `.related[].file` through the same helper
    before `pi.sendMessage`, so the structured twin agrees with the rendered
    string (§Fix constraint 1). It is the single delivery funnel, so one touch
    covers `emitDiagnosticBatch` and `emitLoadNoteGroup` alike. It keys on the
    `{ diagnostics }` details shape only; the `event`, `structural` and
    `recovery` shapes and every non-diagnostic `content` pass through
    byte-identical, and a `Diagnostic` is rebuilt only when a spelling
    actually moves (§Fix constraint 2).
  - `docs/spec_topics/diagnostics/diagnostic-shape.md` — the `file?:` line of
    the internal diagnostic shape and the *Serialised content format*
    paragraph state the convention normatively: `file` and each related site's
    `file` are spelled with the POSIX forward slash on every host platform
    (§Fix constraint 4). DIAG-2 is not engaged — no code, *Trigger* or
    *Message* moved, and no registry page was touched.
  - `docs/reference/diagnostics.md` — the reference mirror of that page
    carries the same two amendments.
  - `tests/thetalib-reparse-walk-single-delivery.test.ts`,
    `tests/lex-drop-single-delivery.test.ts` — the separator compensation is
    dropped and the pinned spelling is compared directly (§Fix constraint 6;
    old-to-new enumerated under Review below).
- Convention chosen and why: POSIX forward slash. The repository already
  normalises Win32 to POSIX at seven source sites and the reverse at none
  (`src/discovery/discovery-walk.ts` line 123,
  `src/discovery/package-discovery.ts` line 88,
  `src/extension/import-static-checks.ts` line 93,
  `src/extension/invoke-static-checks.ts` line 113,
  `src/extension/pass-parse-cache.ts` line 56,
  `src/extension/production-composition.ts` line 2560,
  `src/runtime/invocation.ts` line 130), and the comment above
  `src/extension/import-static-checks.ts` line 92 names forward slash "the
  normalised comparison form per Lexical §Path literals; the `FileSystem` seam
  reports forward-slash paths". The repository's own convention wins.
- Seam chosen and why: of the three candidates §Fix left adjudicable, the mint
  seam was refused because it moves paths that resolution, containment and the
  closure walk's `seen` set consume (§Fix constraint 3 carries the weight
  there), and the document seam was refused because it leaves every parse that
  bypasses the pass cache unnormalised. The render seam plus the delivery
  funnel sits downstream of resolution, of cache keying and of bug 0264's
  identity-based delivered-diagnostic filter, so it cannot disturb any of
  them, and the two sites together close §Fix constraint 1's rendered and
  structured pair.
- Pass-cache key and path asymmetry: `PassParseCache` identity is already
  spelling-independent — `normaliseCacheKey`
  (`src/extension/pass-parse-cache.ts` line 55) is applied to every lookup and
  store (line 111), so a Win32 and a POSIX spelling of one file key together.
  The document's verbatim `input.path` is no longer observable, because both
  channels through which it reached an operator are normalised at the seams
  above. The file is byte-unchanged.
- Gates:
  - Witness (offline):
    `npx vitest run tests/b0268-diagnostic-file-separator-normalisation.test.ts tests/b0268-load-note-path-spelling-single-convention.test.ts`
    gives `Test Files  2 passed (2)`, `Tests  7 passed (7)`. Neutralising
    `toPosixFileSpelling` reds six of the seven with the mixed and Win32
    spellings the §Reproduction tables name.
  - Witness (live, under the exclusive live lock):
    `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/b0268live-load-note-path-spelling-live-cell.test.ts`
    gives `Test Files  1 passed (1)`. Both directions proved: with
    `toPosixFileSpelling` neutralised the same cell reds on
    `details.diagnostics[].file` carrying a backslash; the neutralisation was a
    targeted byte edit restored byte-exact.
  - Full default suite: `npm test` gives
    `Test Files  1 failed | 442 passed (443)`,
    `Tests  2 failed | 9225 passed (9227)`. The two reds are residual 1 below.
  - `npm run typecheck` clean. `npm run lint` clean.
  - Citation gate: `tests/citation-symbol-form-gate.test.ts` green, residual
    count 415, pin 415 — not raised.
- Review: 2 rounds.
  - Round 1 (deep) — findings: (F1, spec) `emitPanicNote`
    (`src/extension/production-theta-producer.ts`) and `emitBootstrapTier1`
    (`src/extension/production-composition.ts`) send
    `details: { diagnostics }` without passing `sendSystemNote`, so the new
    normative sentence is broader than the two seams guarantee — disposition:
    the spec sentence stays normative, because §Fix constraint 4 pins the
    field so a future minting site inherits it; the bypass is residual 2.
    (F2, test) four citation continuation tokens were only partially
    re-derived after the insertions shifted line numbers — fixed. Two
    non-blocking residuals recorded (identity rebuild; pre-existing reference
    citation drift).
  - Round 2 (fast) — no correctness, fidelity or spec finding; one test-class
    citation error (`tests/acceptance-stderr-gate.test.ts`, the PIC-54 sink
    pair re-derived to `src/extension/system-note-channel.ts:286` and `:363`
    instead of `:296` and `:373`) corrected under the citation-only bounded
    authority recorded in residual 4.
  - Constraint-6 old-to-new: in
    `tests/thetalib-reparse-walk-single-delivery.test.ts` — `headLine`'s
    `const spelling = file === undefined ? undefined : normalisePath(file)`
    becomes the `file` argument used directly; `positionKey`'s
    `diagnostic.file === undefined ? "" : normalisePath(diagnostic.file)`
    becomes `diagnostic.file ?? ""`; `renderedOccurrences`'
    `notes.map((n) => normalisePath(n.content))` becomes
    `notes.map((n) => n.content)`; `expectDeliveredExactlyOnce`'s
    `expect(normalisePath(row.file ?? ""), …)` becomes
    `expect(row.file ?? "", …)`. In `tests/lex-drop-single-delivery.test.ts` —
    `expect(normalisePath(row.file ?? "")).toBe(workspace.thetaPath)` becomes
    `expect(row.file ?? "").toBe(workspace.thetaPath)`. In both files
    `normalisePath` survives only to build the expected fixture literal from a
    native `join`, and its doc comment says so. Bug 0264's delivery counts,
    bug 0267's registration outcomes and bug 0255's dedup assertions are
    byte-preserved.
- Verification: SOLID.
  - The witnesses genuinely red without the fix: `toPosixFileSpelling`
    neutralised to `return file`, both offline witnesses red with the mixed
    and Win32 signature, restored by hand (no `git checkout`, no
    `git restore`, no `git stash`), blob hash re-confirmed
    `73401e9fff17178ebbb9ab1566737590ee75ebd4`, green again.
  - Full default suite: exactly the two adjudicated reds, no others.
  - Live: the orchestrator ran the cell under the exclusive lock, both
    directions; the verifier read the logs and confirmed the cell drives the
    real composition root and asserts the fixed path (verifiers never run live
    in this lane).
  - Lint and typecheck clean.
  - §Fix constraints 1, 2, 3, 5 and 6 re-derived against the shipped diff:
    no diff at all in `discovery-walk.ts`, `import-static-checks.ts`,
    `production-composition.ts` or `pass-parse-cache.ts`.
- Residuals:
  1. **Blocking for the merge.**
     `tests/tools-entry-grammar-derivations-lockstep.test.ts` (bug 0248's
     witness) reds two assertions — D2 at its line 1328 and D4 at its line
     1413. Its `plantedPath` helper (its line 1211) builds the expected
     head-line literal by interpolating the native `mkdtempSync` root, which
     is the pre-fix mixed Win32-root-plus-POSIX-tail spelling this report
     eliminates; the rendered mirror is now fully POSIX, so the oracle's own
     literal is what is stale. The assertion's subject — the containment
     refusal, its code, its registered *Hint*, its `1:1` location and the
     registration set — is unaffected. That file is not in §Fix constraint 6's
     enumeration, so under the operator's rule that anything else which reds
     is a stop, it was left byte-untouched and no edit was self-authorized.
     The remedy is one line: build `plantedPath` from a separator-normalised
     workspace root, matching the `posixPath` helper in
     `tests/b0268-load-note-path-spelling-single-convention.test.ts`. It needs
     its own authority.
  2. Two `theta-system-note` senders bypass `sendSystemNote` and therefore the
     normalisation: `emitPanicNote`
     (`src/extension/production-theta-producer.ts`), whose
     `details.diagnostics[0].file` is the theta's `sourcePath` and can still
     be mixed-spelled on Win32, and `emitBootstrapTier1`
     (`src/extension/production-composition.ts`), whose two diagnostics are
     file-less today so it cannot yet disagree. Both are runtime and bootstrap
     notes, outside this report's load-pass scope; normalising them is an
     executable change beyond §Fix's two named sinks. Filing material.
  3. `docs/reference/diagnostics.md` grew two lines, so citations into that
     file at rows at or below its line 33 shift by two. Those citations were
     already stale before this change (for example `tests/par-for.test.ts`
     cites `docs/reference/diagnostics.md` line 118 for a row that sat at line
     121 before this change); the drift is pre-existing and worsened by two,
     not newly broken. Cleanup material.
  4. Self-authorized on the record, citation-only: two numeric tokens in one
     assertion-message string in `tests/acceptance-stderr-gate.test.ts` were
     corrected from `src/extension/system-note-channel.ts:286` and `:363` to
     `:296` and `:373`. The question that would have been asked: may the
     integrator correct a citation the round-1 fixer re-derived wrongly?
     Evidence: (a) `grep -n "system-note delivery failed:"` reports exactly
     lines 296 and 373 of that file; (b) the round-2 reviewer derived the same
     two numbers independently from the pre-fix lines 237 and 314 plus the
     diff's shift of 59 lines; (c) the diff hunk headers corroborate that
     shift. Bound: two numeric tokens, one string, one file; no assertion
     subject and no executable line. Stop valve: had the file or the citation
     gate redded, the edit would have been reverted and reported. Both are
     green.
- Discharge notes appended:
  `./0264-thetalib-reparse-walks-reemit-lex-rows-per-walk.md` and
  `./0255-lex-phase-diagnostics-double-deliver-on-dropped-theta.md`
  (§Fix constraint 6 coordination), and
  `./0248-malformed-escaping-tools-entry-containment-unwitnessed.md`
  (residual 1).
- Pinned dispositions and non-goals: no mint site, no path resolution, no
  containment check, no discovery-root comparison and no pass-cache key was
  touched (§Fix constraint 3); no diagnostic code was added, removed or
  reclassified, so the GOV-15 registry carve-out is not engaged and
  `tests/fixtures/h7a/permitted-codes.json` is byte-unchanged (H9a's stderr
  gate parses codes, not paths); the `<path>` and `<file>` message-placeholder
  rule (`placeholder-rendering-b.md` line 9) is untouched — author-written
  source text inside a *Message* stays verbatim.
