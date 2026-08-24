# Bug 0268 — one load pass renders `theta-system-note` file paths under three mutually inconsistent separator conventions (fully POSIX from the import checks, fully Win32 from the closure walk, mixed Win32-root-plus-POSIX-tail from the discovery walk), and which convention a given file gets is decided by whichever walk parsed it first, so notes from one pass are not greppable by one path spelling

- **Status:** open.
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
