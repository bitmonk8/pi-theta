# Bug 0428 — A resolved `.thetalib` whose bytes cannot be read (EACCES, broken symlink, or a directory named `*.thetalib`) loads the importing theta with zero diagnostics: IMP-1's "exists but is not readable — likewise unresolvable" clause is unenforced, every consumer of the read failure silently `continue`s, no symbol materialises, and the imported-`fn` call site falls through to tool dispatch

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 by the silent-acceptance letter: an
  `E`-severity registered code (`theta/load/unresolvable-thetalib-path`) is
  withheld for an input class IMP-1 names verbatim, the theta registers with
  an empty import list, and the first observable is a runtime failure in an
  unrelated subsystem (the Pi-tool dispatch belt) — or, for an imported name
  that collides with a real ambient tool, a silently WRONG dispatch
  (inference from 0101's settled observables, not observed in this run). D2:
  the
  mechanism is one seam (`parseThetaLib`'s rejection arm settles to
  `undefined` and five consumers `continue` on it), but the fix needs one
  adjudication — whether the read failure re-enters through IMP-1's existing
  code (the spec's own wording supports this) or through the probe's dormant
  `entryReadable` refinement — and must cover direct, transitive, re-export
  and module-scope walks coherently.
- **Kind:** defect — `docs/spec_topics/imports.md:23` (IMP-1): "A
  byte-for-byte-matching entry that exists but is not readable — `EACCES` /
  `EPERM`, or a broken symlink on that entry — is likewise unresolvable",
  emitting `theta/load/unresolvable-thetalib-path` against the importing file,
  which then "does not register". The implementation resolves such an entry
  successfully and discards the subsequent read failure everywhere.
- **Related:**
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md)
    — fixed (0.141.0). Established the per-use-position runtime observables of
    an unbound import (reads null, unbranded schema value,
    `NullMemberAccessPanic`, bug-0003 `PiToolArgShapeDefectError` belt); this
    report reaches the same unbound state through a read failure instead of a
    missing re-export binding.
  - [0304](./0304-transitive-lib-diagnostics-discarded.md) —
    fixed (0.288.0). Threaded transitive-lib fault DELIVERY; its fix left the
    `parsed === undefined` arm itself silent at every depth (a resolved-but-
    unparseable lib was out of its three enumerated pushes).
  - [0312](./0312-out-of-root-thetalib-edits-invisible-stale-imports.md)
    — fixed (0.315.0). The watch-set consequence below compounds it: an
    unreadable lib never enters `resolvedLibs` in the direct-import cells
    (C1/C4), so fixing the underlying permission/directory problem fires no
    reload either. Transitive C3 differs: there `resolvedLibs` lists both
    libs, so the watch-set consequence is confined to the direct case.
  - [0076](./0076-existing-root-enumeration-failure-silent.md)
    — fixed. Class precedent: an existing-but-unreadable source silently
    contributing nothing (discovery-root surface).
  - [0293](./0293-invoke-callee-load-parse-causes-shifted.md)
    — fixed. Callee-side `.theta` twin of the same read/parse-failure
    collapse, in the invoke subsystem.
- **Affected** (verified at 04579e12, v0.415.0):
  - `src/extension/import-static-checks.ts:334–336` —
    `CachingThetaLibProbe.precache`: every `readdir`-listed entry is cached
    readable unconditionally; the code comment states the withhold outright
    ("A byte-exact entry `readdir` listed is readable; the EACCES / broken-
    symlink refinement is not exercised by the shipped host seam here"), so
    `RelativeThetaLibResolver`'s `entryReadable` gate
    (`src/parser/imports.ts:234`) can never refuse a listed entry.
  - `src/extension/import-static-checks.ts:448–457` — `parseThetaLib`: a
    `readBytes` rejection settles to `undefined` ("treated as no
    forms/exports"), with no diagnostic.
  - `src/extension/import-static-checks.ts:964` (direct decl loop, `continue`
    — skipping IMP-4, IMP-3, materialisation, `allSpecifiers`, and the
    trailing `walkThetaLib` seed), `:560` (re-export closure), plus the
    walk/module-scope/materialise consumers — every `parsed === undefined`
    arm is a silent `continue`.
  - `docs/spec_topics/imports.md:23` — IMP-1's not-readable clause.

## Summary

IMP-1 resolution compares the final path segment byte-for-byte against
`readdir` output and consults `entryReadable` for the readability refinement.
The shipped probe marks every listed entry readable, so an entry that exists
but cannot be read as a file — permission-denied, a broken symlink, or a
**directory** named `lib.thetalib` — resolves successfully. The subsequent
`readBytes` failure is converted to `undefined` and every consumer skips the
lib silently: no diagnostic, no specifier checks, no materialisation, no walk.
The theta registers; its imported names are unbound at runtime.

## Reproduction

Offline at 04579e12. Scratch vitest over the bug-0304/0306 harness shape
(`parseThetaDocument` + real `checkThetaImports` + `executeBody` via
`createProductionProducerDeps`); app frontmatter `model: "sonnet"`,
`mode: prompt`.

### C1 — listed-but-unreadable (in-memory FS: `readdir` lists `lib.thetalib`, `readBytes` rejects `EACCES`)

```
app: import { af } from "./lib.thetalib"
     let y = af(1)
     y
```

Observed: app parse `[]`; `checkThetaImports().diagnostics` `[]`;
`imports` `[]` (nothing materialised); theta registers. Executing the body:

```
PiToolArgShapeDefectError: internal defect: Pi tool 'af' call reached the
runtime lowering with a non-object-literal first argument; the parse-time
shape gate (theta/parse/tool-arg-not-object-literal) did not reject this
call site — a gate gap (bug 0003)
```

(the unbound `af` fell through identifier-resolution arms 1–3 to tool
dispatch — with a harness `resolvePiTool` that resolves any name, the call
was dispatched as a TOOL).

### C2 — control (entry absent from `readdir`):

```
error theta/load/unresolvable-thetalib-path: cannot resolve .thetalib import './lib.thetalib' [/proj/app.theta]
```

### C3 — transitive: `a.thetalib` imports the unreadable `b.thetalib`

Observed: diagnostics `[]`, `af` materialises and runs (`wire: 1`). The
transitive read failure is silent too (the bug-0304 fix pushes only
resolution failures, and this edge RESOLVES). `resolvedLibs` DOES list both
libs in this cell — the empty-`resolvedLibs`/watch-set consequence is
confined to the direct-import cells (C1/C4).

### C4 — real filesystem (NTFS): a **directory** named `lib.thetalib`

`mkdirSync(<tmp>/lib.thetalib)`; same app body; `checkThetaImports` over the
production `PiFileSystem`. Observed: diagnostics `[]`, `imports` `[]`,
`resolvedLibs` `[]` — the lib is also absent from the bug-0312 watch-set
surface, so later fixing the problem fires no reload.

## Expected behaviour

- `imports.md:23` (IMP-1): "A byte-for-byte-matching entry that exists but is
  not readable — `EACCES` / `EPERM`, or a broken symlink on that entry — is
  likewise unresolvable." An unresolvable spec is
  `theta/load/unresolvable-thetalib-path` "against the importing file, and
  does not register that file".
  `docs/spec_topics/diagnostics/code-registry-load.md`'s row carries the same
  Trigger with no readability exemption.
- A directory entry is not readable as a `.thetalib` file on any host
  (`EISDIR`); it is inside the same clause's natural reading, and no spec
  sentence gives a resolved-but-unreadable entry any other disposition.
- C2's control shows the code and message the class is owed.

## Actual behaviour / root cause

Two composed drops:

1. `CachingThetaLibProbe.precache` (`import-static-checks.ts:334–336`) caches
   `readable = true` for every name `readdir` returned, so the resolver's
   `entryReadable` refusal (`src/parser/imports.ts:234`) — the seam built for
   exactly IMP-1's refinement — never fires. Resolution succeeds;
   `loadThetaLibImport` reports `registered: true`.
2. `parseThetaLib` (`import-static-checks.ts:448–457`) settles a `readBytes`
   rejection to `undefined`, and each consumer treats that as "skip silently":
   the direct decl loop `continue`s before IMP-4/IMP-3/materialisation/
   collision bookkeeping and before seeding `walkThetaLib` (`:964`), the
   re-export closure records an empty declaration set (`:560`), and the
   module-scope / chain walks skip the lib.

Net effect: the failure is computed (the rejection is observed) and then
discarded at every depth, exactly the shape bugs 0304/0333 fixed for
resolution failures — the READ failure lane was left out.

## Why it matters

- The author gets zero signal at any phase for an ordinary filesystem state
  (a folder named like a lib is routine; ACL-restricted files and broken
  symlinks are routine in shared checkouts). The theta registers and every
  imported symbol is unbound.
- The runtime consequence is not merely a late error: an unbound imported
  `fn` call falls through identifier resolution to the CALLABLE arm. By
  inference from 0101's settled observables — not observed in this run,
  whose harness `resolvePiTool` resolves any name — a name that collides
  with a real ambient Pi tool (`read`, `grep`, …) would dispatch that tool
  with the theta's arguments (silent wrong dispatch), and any other name dies in the bug-0003 internal-defect belt, attributing
  an authoring-visible fault to an internal defect surface.
- In the direct-import cells the lib is also invisible to the reload closure
  (`resolvedLibs` empty in C1/C4; C3's transitive cell does list both libs),
  so repairing the file does not recompose the importer until a `/reload`.

## Non-goals

- The runtime fall-through semantics of unbound imports themselves (0101's
  settled ground); this report is the load-time acceptance.
- The note-channel delivery of lex rows (bug 0264) — nothing is parsed here,
  so nothing is delivered; the registration batch is the subject.
- Unicode/NFC path spellings and case-variant segments (bug 0361, fixed).

## Fix

Options:

1. **Push IMP-1 from the read-failure arm** (recommended): make
   `parseThetaLib` return a distinguished `unreadable` outcome and have the
   direct loop / `walkThetaLib` edge loop / re-export closure push
   `theta/load/unresolvable-thetalib-path` sited on the importing
   file/statement, exactly as the resolution-failure arm does today. Matches
   IMP-1's wording ("likewise unresolvable"), reuses the registered code, and
   covers all depths through the seams bug 0304 already wired.
2. **Enforce at the probe**: stat each listed entry during `precache` and
   cache `readable=false` for directories/broken symlinks/EACCES so the
   resolver's existing `entryReadable` gate throws. Cleanest spec alignment
   (refusal happens at RESOLUTION, where IMP-1 places it) but costs one
   `lstat` per listed entry and still needs option 1's arm for TOCTOU
   (readable at readdir, unreadable at read).
   A combined fix (2 for the common shapes, 1 as the backstop) is the
   coherent end state; either alone closes the observed class.

Any fix must keep C2's control byte-identical, must reach transitive depth
(C3), and should add the resolved-but-unreadable lib to `resolvedLibs` or
document its exclusion against bug 0312's watch-set contract.

## Provenance

imports-exports-2 bug-hunt sweep, 04579e12 (v0.415.0). Probe:
`tests/scratch-ie2-load-semantics.test.ts` (deleted after the run) — cells
C1 (in-memory EACCES), C2 (control), C3 (transitive), C4 (real-NTFS
directory via `PiFileSystem`), outputs quoted verbatim above. Spec read:
imports.md IMP-1; code-registry-load.md. No non-scratch file modified.
