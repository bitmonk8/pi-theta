# Bug 0333 — A broken `export … from` edge inside a `.thetalib` reached only through plain-`import` hops is discarded at load with zero diagnostics: a transitive lib whose re-export names a missing source file, or a symbol its source lib does not declare, loads the importing theta clean, while the byte-identical fault in a directly-imported lib is reported (`theta/load/unresolvable-thetalib-path` for the missing file, `theta/parse/import-unknown-symbol` for the missing name)

- **Status:** fixed (0.302.0).
- **Sev/Diff estimate:** S1/D2 — S1 by the silent-acceptance letter: two
  `E`-severity registered codes
  (`theta/load/unresolvable-thetalib-path`,
  `theta/parse/import-unknown-symbol`) are withheld for an input class their
  depth-unqualified Triggers cover, the importing theta registers, and the
  author gets zero signal at any phase (the re-exported name is never
  materialised into anything, so no runtime failure surfaces the fault
  either). D2: the fix reuses bug 0304's landed three-phase re-export
  mechanism (`closeOverReExports` / `fixReExportedNames` /
  `diagnoseReExports`) with only its SEED SET widened — from the entry libs
  to every lib the import walk reaches — confined to `checkThetaImports`, no
  new registry row, ordinary offline witness.
- **Kind:** defect — `docs/spec_topics/imports.md:23` (IMP-1) states the
  resolver-failure contract for any importing `.thetalib` file with no depth
  qualifier, and `:115` states the unknown-symbol batching contract over "the
  importing file **and its transitive `.thetalib` imports**"; the
  implementation enforces both on an `export … from` edge only when the
  re-exporting lib sits in the re-export closure of a DIRECT import.
- **Related:**
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md) —
    fixed (0.141.0). Its fix-record residual 2 records this class as the
    export-edge half left open ("The broken `export … from` (re-export) inside
    a lib reached ONLY through plain-`import` hops remains OPEN … an
    import-only-reached lib's re-export fault is still reported by neither
    reporter"). This report is that filing.
  - [0304](./0304-transitive-lib-diagnostics-discarded.md) —
    fixed (0.288.0). 0304 threaded transitive `.thetalib` DIAGNOSTIC delivery
    for the three `import`-edge fault classes (unresolvable import path,
    illegal top-level statement, unknown import symbol) at arbitrary depth.
    Its settled §Fix enumerates only the three import-edge pushes; the
    export-edge fault class was explicitly out of scope and recorded as its
    fix-record residual 1 for the parent to file. This report is that filing.
    The mechanism this fix builds on is 0304's own landed work, so there is no
    ordering dependency — 0304 has shipped.
  - [0058](./0058-fromless-export-form-parses-without-spec-production.md) —
    fixed (0.60.0). Established `export { X } from "./y.thetalib"` as the only
    export spelling the language admits; every fixture in this report is a
    from-bearing export with a `.thetalib` path literal.
- **Affected** (citations verified at HEAD `52712fb3`, v0.294.0):
  - `src/extension/import-static-checks.ts` — header comment (`:23–46`):
    "three ordered phases over the `export … from` edges reachable from the
    resolved entry libs". The word *entry* is the fence.
  - `src/extension/import-static-checks.ts` — `closeOverReExports`
    (`:519–583`): phase 1, seeded per resolved path, recurses over `export`
    statements only, resolves each `export` STATEMENT's path once and pushes
    `theta/load/unresolvable-thetalib-path` on the failure arm (`:556`),
    collecting the re-export edges the fixpoint reads. It is invoked only from
    the entry-lib loop `for (const resolvedPath of entryResolvedPaths) { await
    closeOverReExports(resolvedPath); }` (`:910–911`).
  - `src/extension/import-static-checks.ts` — `fixReExportedNames`
    (`:585–605`) and `diagnoseReExports` (`:612–627`): phases 2–3, the least
    fixpoint over the collected file set and the per-edge
    `theta/parse/import-unknown-symbol` emission. Both range over
    `reExportEdges`, which `closeOverReExports` populates, so both cover only
    the entry re-export closure. Driven at `:913`.
  - `src/extension/import-static-checks.ts` — `entryResolvedPaths`
    (`:763`, populated at `:807`): the seed set. It holds a resolved path only
    for a DIRECT `import … from` decl of the importing theta; a lib reached
    only through a transitive plain `import` never enters it.
  - `src/extension/import-static-checks.ts` — `walkThetaLib` (`:437–486`):
    the transitive import walk. Its edge set spans `import` AND `export … from`
    edges (`:466–468`), so a transitive lib IS reached, parsed into
    `parseCache`, and added to the cycle graph — but the failure-arm push is
    guarded to `import` edges (`:481`, `edge.kind === "import"`). Its WHY
    comment (`:455–464`) records this residual class by name.
  - `src/extension/import-static-checks.ts` — the bug-0304 post-walk
    `parseCache` pass (`:934–970`): iterates every reached lib but checks each
    lib's own `import` specifiers only (`:947`, `stmt.kind !== "import"`
    skip). No post-walk pass seeds the re-export analysis from the same set.
  - `docs/spec_topics/imports.md:23` — IMP-1: emits
    `theta/load/unresolvable-thetalib-path` against the importing file "and
    does not register that file", no depth qualifier.
  - `docs/spec_topics/imports.md:115` — the unknown-symbol contract, its
    batching sentence ("the importing file and its transitive `.thetalib`
    imports … reported in one batch"), and the sentence siting the
    `export { Foo } from` arm against the re-exporting `.thetalib` file.
  - `docs/spec_topics/imports.md:13` — the permitted `.thetalib` top-level
    forms (`import`, `export`, `schema`, `enum`, `fn`).
  - `docs/spec_topics/diagnostics/code-registry-load.md:44` — the
    `theta/load/unresolvable-thetalib-path` Trigger, naming
    "An `import` / `export … from` `.thetalib` spec", no depth qualifier.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:135` — the
    `theta/parse/import-unknown-symbol` Trigger, naming
    "An `import { ... }` or `export { ... } from` specifier", no depth
    qualifier.
- **Observed at:** `0.294.0` (HEAD `52712fb3`). Offline, deterministic; no
  live model, no provider. Scratch vitest: real `parseThetaDocument` + real
  `checkThetaImports` over an in-memory `FileSystem` double (the
  `tests/reexport-chain-resolution.test.ts` harness shape); written, run,
  deleted.

## Summary

The re-export chain resolver (bug 0101's fix, extended for transitive
`import` edges by bug 0304) diagnoses an `export … from` edge only for a lib
in the re-export closure of one of the importing theta's DIRECT imports.
`closeOverReExports` is seeded from `entryResolvedPaths`, which holds direct
imports only. A `.thetalib` reached only through one or more transitive plain
`import` hops is walked by `walkThetaLib` — parsed into `parseCache`, added
to the cycle graph — but is never seeded into the re-export analysis, and
`walkThetaLib`'s own failure-arm push is restricted to `import` edges to
avoid double-reporting with the closure. Neither reporter covers a broken
`export … from` inside such a lib, so it is silent at every phase. Both fault
shapes are affected: a re-export naming a missing source file (IMP-1
unreached) and a re-export naming a symbol the source lib does not declare
(the unknown-symbol arm unreached). The direct case reports both.

## Reproduction

Offline at `52712fb3`. `/proj/app.theta` (frontmatter `model: "sonnet"`,
`mode: prompt`); `diags` = `checkThetaImports(...).diagnostics` rendered as
`severity code: message`. Each row's `a.thetalib` is the theta's direct
import; `b.thetalib` is the transitive lib.

### T1 — transitive lib, re-export from a missing file: silent; direct control reports

```
@@ app             import { af } from "./a.thetalib"
   /proj/a.thetalib   import { bf } from "./b.thetalib"
                      fn af(x: integer): integer { x }
   /proj/b.thetalib   export { X } from "./missing.thetalib"   ← no such file
                      fn bf(x: integer): integer { x }
   diags :: []                                                 ← registers

@@ app             import { af } from "./a.thetalib"           [control, depth 1]
   /proj/a.thetalib   export { X } from "./missing.thetalib"
                      fn af(x: integer): integer { x }
   diags :: ["error theta/load/unresolvable-thetalib-path:
              cannot resolve .thetalib import './missing.thetalib'"]
```

### T2 — transitive lib, re-export of an absent name: silent; direct control reports

```
@@ app             import { af } from "./a.thetalib"
   /proj/a.thetalib   import { bf } from "./b.thetalib"
                      fn af(x: integer): integer { x }
   /proj/b.thetalib   export { X } from "./c.thetalib"         ← c declares no 'X'
                      fn bf(x: integer): integer { x }
   /proj/c.thetalib   fn other(x: integer): integer { x }
   diags :: []                                                 ← registers

@@ app             import { af } from "./a.thetalib"           [control, depth 1]
   /proj/a.thetalib   export { X } from "./b.thetalib"
                      fn af(x: integer): integer { x }
   /proj/b.thetalib   fn other(x: integer): integer { x }
   diags :: ["error theta/parse/import-unknown-symbol:
              imported symbol 'X' is not declared or re-exported by './b.thetalib'"]
```

In both bug rows the transitive lib IS resolved, read and parsed by the same
pass (`walkThetaLib` reaches it and it sits in `parseCache`) — the fault is
computed-reachable and then never reported, not unreachable. The defect is
transitive-only: at depth 1 both shapes are reported.

## Expected behaviour

- `docs/spec_topics/imports.md:23` (IMP-1): a `Resolver` throw "emits the
  load-time diagnostic … against the importing file, and does not register
  that file". `b.thetalib` is the importing file in T1's bug row; the resolver
  threw (measured: the identical spelling one hop earlier emits), nothing was
  emitted anywhere, and everything registered.
- `docs/spec_topics/imports.md:115`: an unknown-symbol error is "collected
  alongside every other parse / type error from the importing file and its
  transitive `.thetalib` imports, and all are reported in one batch", and an
  `export { Foo } from` specifier's check is reported against the re-exporting
  `.thetalib` file. T2's `b.thetalib` is a transitive `.thetalib` import whose
  re-export names a symbol `c.thetalib` does not declare; the batch is empty.
- Neither code's Trigger scopes it to directly-imported libs
  (`code-registry-load.md:44`, `code-registry-parse.md:135`), and the
  re-export closure already enforces both at arbitrary depth ALONG
  `export … from` chains (0101's fix) and the import walk enforces the
  `import`-edge faults at arbitrary depth (0304's fix). The surviving
  asymmetry is that an `export … from` edge is checked only when the file
  carrying it is reached over `export` edges from an entry lib — a fence no
  spec sentence states.

## Actual behaviour / root cause

The re-export analysis reads a seed set the transitive import walk does not
feed. `closeOverReExports` (`import-static-checks.ts:519`) is invoked only
from the entry-lib loop (`:910–911`), whose iterand `entryResolvedPaths`
(`:763`, populated at `:807`) holds a resolved path only for a DIRECT
`import … from` decl of the importing theta. A lib reached over a transitive
plain `import` never enters that set, so `closeOverReExports` is never seeded
from it, `reExportEdges` never collects its `export` edges, and neither
`fixReExportedNames` (`:585`, the fixpoint) nor `diagnoseReExports` (`:612`,
the per-edge `import-unknown-symbol` emission) can see them.

`walkThetaLib` (`:437`) does reach the lib — its edge set spans `import` and
`export … from` edges (`:466–468`), so the lib is parsed into `parseCache`
and added to the cycle graph — but the failure-arm push (`:481`) is guarded
to `edge.kind === "import"`, by design, to avoid double-reporting the IMP-1 a
closure-reachable re-export already draws. The WHY comment at `:455–464`
records exactly this residual class. The bug-0304 post-walk `parseCache` pass
(`:934–970`) iterates every reached lib but restricts its own checks to each
lib's `import` specifiers (`:947`); it does not seed the re-export analysis.
So for an `export … from` edge inside a plain-import-reached lib, both fault
shapes fall through every reporter:

1. **Missing source file** — `closeOverReExports`'s IMP-1 push (`:556`) never
   runs for the lib (not seeded); `walkThetaLib`'s push (`:481`) is
   `import`-only. Silent (T1).
2. **Absent source name** — the fixpoint never admits the lib's declaration
   set, and `diagnoseReExports` never ranges over its edges. Silent (T2).

## Why it matters

- A library author's broken re-export inside any lib one or more plain-`import`
  hops down is invisible at every phase: not in the theta's file, not in the
  batch, not a runtime failure of anything materialised (the re-exported name
  is never bound into the importer over a plain-import edge, so no `use`
  position surfaces it). The lib ships an export set naming symbols nothing
  provides, or an unresolvable source path, and no signal fires anywhere.
- Enforcement depth now depends on which edge kind reaches the file:
  `import`-edge faults are checked at any depth (0304), `export … from` faults
  at any depth ALONG an entry lib's re-export chain (0101), but an
  `export … from` fault inside a plain-import-reached lib is checked at no
  depth. No spec sentence licenses the split.
- The class is one refactor away from a real program: extracting a
  re-exporting lib behind a plain `import` converts a checked fault into an
  unchecked one — the export-edge analogue of the split 0304's §"Why it
  matters" names.

## Non-goals

- The runtime materialisation of a re-exported name reached over a plain
  `import` hop — a plain-import local is excluded from the importer's export
  set (imports.md §Visibility), so this report measures the missing DIAGNOSTIC
  only, not a binding delivery.
- A transitive lib's `import-name-collision` (two of its imports binding one
  local) — 0304's fix-record residual 2, a separate seam, unfiled.
- The bug-0304 post-walk pass's `import`-only scope for any check other than
  the re-export edge — untouched.

## Fix

Seed the re-export analysis from every `.thetalib` the import walk reaches,
not only from the entry libs. `walkThetaLib` (`import-static-checks.ts:437`)
already collects that set (its `walked` set / the `parseCache` keys / the
cycle graph). Drive `closeOverReExports` (`:519`) from each reached lib — or,
equivalently, run its three phases over the union of every walked lib rather
than only `entryResolvedPaths` (`:910–911`) — so `reExportEdges` collects the
transitive libs' `export` edges and `fixReExportedNames` (`:585`) /
`diagnoseReExports` (`:612`) range over them. The two existing codes then
fire on the transitive edge exactly as they do on the direct one:
`theta/load/unresolvable-thetalib-path` for a missing source file (the
`:556` push) and `theta/parse/import-unknown-symbol` for an absent source
name (the `:612` emission), each sited on the re-exporting (transitive) lib
and reaching the importing theta through the existing registration-error
channel. The seed widening must keep `closeOverReExports`'s per-path guard so
the widened seed does not re-close an already-closed lib, and must not undo
`walkThetaLib`'s `import`-only push guard (`:481`) — the closure remains the
sole reporter of `export`-edge faults, now over the full reached set, so no
double-report is introduced.

The diagnostic-shape question is adjudicable in-lane with the evidence:
reuse the two existing codes (measured firing on the direct case: T1's
control emits `unresolvable-thetalib-path`, T2's control emits
`import-unknown-symbol`) versus mint a new row for the transitive-export
position. The evidence favours reuse — the fault class is byte-identical to
the direct case and both codes' Triggers already carry no depth qualifier
(`code-registry-load.md:44`, `code-registry-parse.md:135`), so widening the
seed enforces published prose rather than adding behaviour; a new row would
need a DIAG-2 registry entry and a same-commit spec edit for a fault the
existing rows already describe.

Witness (offline, no live provider): T1 and T2 with their depth-1 controls,
plus a depth-2 transitive chain (theta → a → b → c, with the broken
`export … from` in `c`) pinning that the widened seed reaches every walked
lib, and a control pinning that a well-formed transitive re-export stays
clean.

## Fix (0.302.0)

- What shipped: `src/extension/import-static-checks.ts` — the re-export
  analysis seed loop now iterates the `walked` set (every `.thetalib` the
  import walk reaches) instead of `entryResolvedPaths` (direct imports only),
  the one executable change (§Fix "run its three phases over the union of every
  walked lib"). `closeOverReExports`'s per-path `closedOver` guard is
  unchanged, so the widened seed re-closes no already-closed lib;
  `walkThetaLib`'s `import`-only push guard (`edge.kind === "import"`) is
  untouched, so the closure stays the sole `export`-edge reporter and no
  double-report is introduced. Four WHY-comments that described the residual as
  unaddressed (header, `walkThetaLib` residual block, `closeOverReExports`
  phase-1 doc, the seed-loop comment) were corrected to the widened seed. No
  new registry row, no spec text change, no other source file — both existing
  codes (`theta/load/unresolvable-thetalib-path`,
  `theta/parse/import-unknown-symbol`) fire on the transitive edge exactly as
  on the direct one.
- Gates: witness `npx vitest run tests/b0333-transitive-lib-reexport-edge.test.ts`
  → 6/6 green (RED at HEAD: T1/T2/depth-2 emit `[]`; neutralization confirmed
  the three red and restored byte-exact). Full suite `npm test` → 480 files /
  9563 tests all passing (baseline 479/9557 + this bug's witness file).
  `npm run typecheck` clean. `npm run lint` clean.
- Review: 1 round. Round 1 (`bug-fix-reviewer`): CLEAN on
  correctness/fidelity/spec/house-rule/coordination; three `prose` findings in
  the witness file (broken `.test.ts` citations, a `codesOf` doc comment saying
  "distinct", a provenance block with a false hash/version pairing and a
  merge-unstable phrasing). Fixed by one `bug-fix-fixer-light` pass
  (comment/prose only, 6/6 still green); post-polish confirmation round skipped
  per the polish-verified-by-gate-diff rule (every hunk `//` or `/** */`).
- Verification (`bug-fix-verifier`): PASS. Revert-witness red-before/green-after
  with byte-exact restoration (diffstat 15+/16- identical after restore); full
  suite 480/9563; live cell inspected sound (real stdout sentinels + exit code,
  fails loudly on missing host, offline attribution guard is a genuine
  RED-at-HEAD gate); typecheck + lint clean;
  `tests/fixtures/h7a/permitted-codes.json` blob byte-unchanged
  (`a4a8da04209f90e13d815edd92c1fc682e2a2236`).
- Live: `tests/live/acceptance/b0333live-transitive-reexport-load-refusal.test.ts`
  (new) — offender (theta → a → b, `b` re-exports from a missing file two
  plain-import hops down) REFUSES at load (`invoke` → `Err` → `REFUSED`
  sentinel); well-formed transitive re-export control (theta → a → b → deep,
  well-formed `export … from`) REGISTERS and drives to the task-framed
  arithmetic observable `1041` (941 + 100). Run for real under the shared
  live-lock: 1/1 green (6.3 s).
- Residuals: none.
- Discharge notes appended: none (0101 residual 2 and 0304 residual 1 named
  this class for the parent to file; that filing is this report — no sibling
  doc edit is owed).
- Pinned dispositions / non-goals: the runtime materialisation of a
  re-exported name reached over a plain `import` hop (imports.md §Visibility
  excludes it from the importer's export set) — this fix measures the missing
  DIAGNOSTIC only, per §Non-goals. A transitive lib's `import-name-collision`
  (0304 residual 2) is untouched. The bug-0304 post-walk pass's `import`-only
  scope for non-re-export checks is untouched. Reuse-not-new-row disposition
  adjudicated in-lane per §Fix (both codes' Triggers carry no depth qualifier;
  a new row would need a DIAG-2 entry and a same-commit spec edit for a fault
  the existing rows already describe).

## Provenance

- Origin: bug 0101's fix-record residual 2 (the export-edge half, recorded
  OPEN) and bug 0304's fix-record residual 1 / `.pi/tmp/fixes/0304-report.md`
  R1 (the same class, out of 0304's settled import-edge scope, recorded for
  the parent to file). This report is that filing, grounded on the measured
  transitive-vs-direct asymmetry and the depth-unqualified Triggers of the two
  withheld codes.
- Spec: `docs/spec_topics/imports.md:13` (permitted `.thetalib` top-level
  forms), `:23` (IMP-1), `:115` (§"Unknown imported symbol" — the batching
  sentence and the `export { Foo } from` siting), `:126` (§Cycles — both edge
  kinds);
  `docs/spec_topics/diagnostics/code-registry-load.md:44`
  (`theta/load/unresolvable-thetalib-path`, Trigger names both edge kinds);
  `docs/spec_topics/diagnostics/code-registry-parse.md:135`
  (`theta/parse/import-unknown-symbol`, Trigger names both specifier kinds).
- Implementation evidence at `52712fb3`:
  `src/extension/import-static-checks.ts` — header comment `:23–46`;
  `checkThetaImports` `:366`; `walkThetaLib` `:437–486` (export edge added
  `:466–468`, import-only push guard `:481`, residual WHY comment `:455–464`);
  `closeOverReExports` `:519–583` (IMP-1 push `:556`); `fixReExportedNames`
  `:585–605`; `diagnoseReExports` `:612–627`; `entryResolvedPaths` `:763`
  (populated `:807`); the entry-lib seed loop `:910–911`, driven `:913`; the
  bug-0304 post-walk `parseCache` pass `:934–970` (import-only skip `:947`).
- Reproduction: scratch vitest cells T1, T2 with their depth-1 controls at
  `52712fb3`, outputs quoted verbatim; file deleted per scratch policy. No
  non-scratch file modified.
