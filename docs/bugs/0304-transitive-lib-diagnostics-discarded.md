# Bug 0304 — Every load-time fault inside a `.thetalib` reached through one plain-`import` hop is silently discarded: a transitive lib's unresolvable import path, its illegal top-level statement, and its unknown import symbol all load the theta with zero diagnostics, while the byte-identical fault one hop earlier (in the directly-imported lib) un-registers it — against imports.md's own batching sentence "collected alongside every other parse / type error from the importing file and its transitive `.thetalib` imports"

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 by the silent-acceptance letter: three
  `E`-severity registered codes (`theta/load/unresolvable-thetalib-path`,
  `theta/parse/thetalib-top-level-statement`,
  `theta/parse/import-unknown-symbol`) are withheld for an input class their
  Triggers cover, the theta registers, and the author gets zero signal at any
  phase (the faults live in files whose symbols are never materialised into
  the theta, so no runtime failure surfaces them either — the fault is simply
  never reported anywhere). D2: the mechanism is confined to
  `checkThetaImports` — `walkThetaLib` already resolves every transitive edge
  and already holds every transitive parse result in `parseCache`; the fix is
  pushing what it currently drops (`load.diagnostics` at the walk's edge
  loop; `isRegistrationError` over every `parseCache` entry instead of only
  the direct loop's; the unknown-symbol arm per transitive lib decl), plus a
  depth-consistency sentence in imports.md if the one-hop fence is instead
  kept deliberately.
- **Kind:** defect — `docs/spec_topics/imports.md:111` states the batching
  contract over "the importing file **and its transitive `.thetalib`
  imports**", and IMP-1 (`:23`) states the unresolvable-path contract for any
  importing file with no depth qualifier; the implementation enforces both
  only at depth 1.
- **Related:**
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md) —
    fixed (0.141.0). Its fix record's residual 2 records this class as
    known-unfiled ("a broken re-export inside a plain-import-reached lib is
    therefore silent … `walkThetaLib` discards `load.diagnostics` for
    transitive `import` edges too, and a transitive lib's own import
    specifiers were never unknown-symbol-checked") and argues it
    "functionally inert because a plain-import local … cannot feed the
    importer's bindings". The inertness argument covers only the BINDING
    channel; the batching sentence (`imports.md:111`) is about reporting, and
    candidate 02 of this hunt shows lib bodies DO consume their own imports
    at runtime, so the discarded unresolvable-path fault is the load-time
    shadow of a real runtime break.
  - [0264](./0264-thetalib-reparse-walks-reemit-lex-rows-per-walk.md) —
    fixed (0.261.0). LEX-phase rows of a transitive lib do reach the
    `theta-system-note` channel (once, post-0264); this report is about the
    REGISTRATION channel (`checkThetaImports(...).diagnostics`), which is what
    decides whether the theta registers, and about parse/load rows the note
    channel never carries into that decision.
  - [0267](./0267-prompt-caller-registers-over-dropped-subagent-callee.md) —
    fixed (0.264.0); the same shape one seam over (a caller's gate reading a
    partial diagnostic view of a dependency and registering over its drop).
- **Affected** (citations verified at `bc52da38`, v0.287.0):
  - `src/extension/import-static-checks.ts:385–415` — `walkThetaLib`: the
    transitive walk. `:403–407` calls `loadThetaLibImport` per edge; `:408`
    branches on `load.registered` and the failure arm's `load.diagnostics`
    are never pushed (contrast the direct-import loop at `:645` and the
    re-export closure at `:485`, which both push).
  - `src/extension/import-static-checks.ts:653–664` — the IMP-4 arm: parse
    diagnostics are pushed through `isRegistrationError` only for the
    DIRECTLY-resolved lib of each theta `import` decl; a lib parsed inside
    `walkThetaLib` / `materializeChain` never has `document.diagnostics`
    inspected for registration (the only other `parseCache` iteration,
    `:779–800`, runs the subagent-fn checks alone).
  - `src/extension/import-static-checks.ts:666–682` — IMP-3's unknown-symbol
    arm runs over the THETA's own specifiers per direct decl; no code path
    checks a LIB's own `import` specifiers against its resolved source's
    export set at any depth.
  - `docs/spec_topics/imports.md:111` — the batching sentence and the
    registration-channel sentence ("an error there fails to register the
    importing theta").
  - `docs/spec_topics/imports.md:23` — IMP-1: emits against the importing
    file "and does not register that file", no depth qualifier.
  - `docs/spec_topics/imports.md:13` — the permitted top-level forms and
    `theta/parse/thetalib-top-level-statement`.
  - `docs/spec_topics/diagnostics/code-registry-load.md:44` and
    `code-registry-parse.md:133, :135` — the three withheld rows' Triggers,
    none depth-qualified.
- **Observed at:** `0.287.0` (`bc52da38`). Offline, deterministic; no live
  model. Scratch vitest: real `parseThetaDocument` + real `checkThetaImports`
  over an in-memory `FileSystem` (the `tests/reexport-chain-resolution.test.ts`
  harness shape); written, run, deleted.

## Reproduction

Offline at `bc52da38`. `/proj/app.theta` (frontmatter `model: "sonnet"`,
`mode: prompt`); `diags` = `checkThetaImports(...).diagnostics`.

### C1 — transitive unresolvable import path: silent

```
@@ app             import { af } from "./a.thetalib"
   /proj/a.thetalib   import { bf } from "./missing.thetalib"   ← no such file
                      fn af(x: integer): integer { x }
   app parse :: []   diags :: []   imports :: ["fn af"]         ← registers
```

### C2 — transitive illegal top-level statement: silent; direct control refuses

```
@@ app             import { af } from "./a.thetalib"
   /proj/a.thetalib   import { bf } from "./b.thetalib"
                      fn af(x: integer): integer { x }
   /proj/b.thetalib   let x = 3                                  ← illegal top-level form
                      fn bf(x: integer): integer { x }
   diags :: []                                                   ← registers

@@ app             import { bf } from "./b.thetalib"             [control, depth 1]
   diags :: ["error theta/parse/thetalib-top-level-statement: top-level statement
              not permitted in .thetalib file; move into a fn body [/proj/b.thetalib]"]
```

### C3 — transitive unknown import symbol: silent

```
@@ app             import { af } from "./a.thetalib"
   /proj/a.thetalib   import { nope } from "./b.thetalib"        ← b declares no 'nope'
                      fn af(x: integer): integer { x }
   /proj/b.thetalib   fn other(x: integer): integer { x }
   diags :: []                                                   ← registers
```

In all three rows the transitive lib IS resolved, read and parsed by the same
pass (`walkThetaLib` reaches it; C2's `b.thetalib` sits in `parseCache` with
its error-severity diagnostic attached) — the faults are computed and then
dropped, not unreachable.

## Expected behaviour

- `docs/spec_topics/imports.md:111`: "an unknown-symbol error is collected
  alongside every other parse / type error from the importing file and its
  transitive `.thetalib` imports, and all are reported in one batch." C2's
  `thetalib-top-level-statement` and C3's `import-unknown-symbol` are parse
  errors of a transitive `.thetalib` import and are in that batch's stated
  scope; the measured batch is empty.
- `docs/spec_topics/imports.md:23` (IMP-1): a `Resolver` throw "emits the
  load-time diagnostic … against the importing file, and does not register
  that file". `a.thetalib` is the importing file in C1; the resolver threw
  (measured: the identical spelling one hop earlier emits), nothing was
  emitted anywhere, and everything registered.
- The one-hop asymmetry is not statable from the spec: no sentence scopes any
  of the three codes to directly-imported libs, and the re-export closure
  ALREADY enforces both IMP-1 and unknown-symbol at arbitrary depth along
  `export … from` chains (0101's fix), so at HEAD the enforcement depth
  depends on which EDGE KIND reaches the file — `export` edges checked at any
  depth, `import` edges checked at depth 1 only.

## Actual behaviour / root cause

Three drops, one per code:

1. `walkThetaLib`'s edge loop (`import-static-checks.ts:403–408`) calls
   `loadThetaLibImport` per transitive edge and reads only `registered` /
   `resolvedPath`; the failure arm's `diagnostics` are discarded. The direct
   loop (`:645`) and the re-export closure (`:485`) push the same call's
   diagnostics.
2. The IMP-4 registration-error filter (`:660–662`) runs inside the per-decl
   loop over the theta's OWN import decls, so only depth-1 libs' parse
   diagnostics reach the batch. Transitive libs are parsed into the same
   `parseCache` but only the subagent-fn checks iterate it (`:779–800`).
3. No call site applies `checkImportUnknownSymbols` to a LIB's own `import`
   specifiers — IMP-3 runs over `decl.specifiers` of the theta only
   (`:673–682`).

## Why it matters

- A library author's mistake inside any lib one hop down is invisible at
  every phase: the fault is not in the theta's file, not in the batch, not a
  runtime failure of anything materialised (the broken lib's symbols are
  simply absent), and — for C1 — the load-time shadow of the runtime break
  candidate 02 measures (the lib body that USES the missing import throws at
  call time with a misattributed error, and this pass held the true cause and
  dropped it).
- Enforcement depth currently depends on edge kind (re-export chains: full
  depth; import chains: depth 1), an incoherence no spec sentence licenses
  and the next reader of either walk will trip over.
- The class is one refactor away from every real program: splitting a lib
  into two files converts checked faults into unchecked ones.

## Non-goals

- The runtime scope of lib bodies (candidate 02) — separate mechanism; this
  report is the load-reporting half only.
- The note-channel delivery of transitive LEX rows (bug 0264's subject) —
  already single-delivered there; this report is about the registration
  batch.
- Whether a transitive lib's `import-name-collision` (two of ITS imports
  binding one local) should also be checked — same seam, but no probe here
  drove it; a fix will meet it when it iterates lib specifiers.

## Fix

Push what the pass already computes: (1) in `walkThetaLib`, push
`load.diagnostics` on the failure arm exactly as the direct loop does; (2)
run the `isRegistrationError` filter over every `parseCache` entry once after
the walks (not only per direct decl); (3) run `checkImportUnknownSymbols`
over each parsed lib's own `import` specifiers against its resolved source's
`computeThetaLibExports`. All three reuse existing functions; diagnostics
carry the faulting LIB's `file:`, reaching the theta through the existing
registration channel (the C2b control's shape). Alternative — keeping the
one-hop fence — requires adding the depth qualifier to imports.md `:111` /
IMP-1 and re-deriving the re-export closure's full-depth behaviour, which
contradicts 0101's shipped fix; not recommended. Witnesses: C1–C3 with their
depth-1 controls, plus a depth-2 chain (theta → a → b → c) pinning the batch
sites.

## Provenance

- Origin: bug 0101's fix record, residual 2 (recorded unfiled); this report
  is that filing, widened from the broken-re-export case to all three
  discarded fault kinds and re-grounded on imports.md `:111`'s transitive
  batching sentence, which the residual did not cite.
- Spec: `docs/spec_topics/imports.md:13, :23, :111`;
  `docs/spec_topics/diagnostics/code-registry-load.md:44`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:133, :135`.
- Implementation evidence at `bc52da38`:
  `src/extension/import-static-checks.ts:385–415 (:403–408), :485, :645,
  :653–664, :666–682, :779–800`.
- Probes: scratch vitest cells C1, C2, C2b, C3 at `bc52da38`, outputs quoted
  verbatim; file deleted per scratch policy. No non-scratch file modified.
