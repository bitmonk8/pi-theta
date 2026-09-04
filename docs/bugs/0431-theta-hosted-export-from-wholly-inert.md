# Bug 0431 — A from-bearing `export { X } from "./lib.thetalib"` inside a `.theta` file is wholly inert with zero diagnostics: its path is never resolved (a missing file draws nothing where the same statement in a `.thetalib` draws IMP-1), its specifier is never checked (a name the resolved lib does not provide draws nothing where the lib spelling draws `import-unknown-symbol`), and no spec sentence gives the `.theta` position any disposition

- **Status:** open.
- **Sev/Diff estimate:** S4/D2 — S4: dropped author intent with zero
  diagnostics, but no wrong value can flow (nothing can import a `.theta`, so
  the statement is meaningless whatever it spells); the hazard is purely the
  silent acceptance of a statement whose every fault class is loudly refused
  one file-extension away, plus the confusion signal it suppresses (an author
  writing `export … from` in a `.theta` misunderstands the model and gets no
  correction). D2: the fix is an adjudication first (refuse the form in
  `.theta` files, or resolve-and-check it like a lib's, or spec-pin the
  inertness), then a small parse- or load-side change; bug 0101 §Non-goals
  already framed the adjudication and no one has taken it.
- **Kind:** spec gap — `imports.md:29` introduces re-exports as "A
  `.thetalib` may re-export a symbol from another `.thetalib`", `imports.md:67`
  defines `ExportDecl` with no host-file scoping, and no sentence anywhere
  dispositions the form in a `.theta`; the implementation parses it clean and
  ignores it entirely.
- **Related:**
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md)
    — fixed (0.141.0). Its §Non-goals records this exact question unfiled:
    "A from-bearing `export` in a `.theta` parses clean today and, since
    0058, seeds no identifier-root name. Whether it is itself an error is a
    separate adjudication." This report is that filing, with the two fault
    classes (missing path, unknown name) measured.
  - [0058](./0058-fromless-export-form-parses-without-spec-production.md)
    — fixed (0.60.0). Covered the FROM-LESS export form in both file kinds;
    the from-bearing `.theta` position stayed open (its fix ensured the
    specifier seeds no identifier root, which this sweep re-confirmed: a body
    use of the exported name still draws `theta/parse/unknown-identifier`).
  - [0333](./0333-transitive-lib-reexport-edge-fault-silent.md)
    — fixed (0.302.0). Widened re-export fault coverage to every WALKED lib;
    the walk is seeded from the theta's `import` decls only, so the theta's
    OWN export statements remain outside every reporter — the residual corner
    of that closure.
- **Affected** (verified at 04579e12, v0.415.0):
  - `src/extension/import-static-checks.ts:118–127` (`collectImports`) — the
    load pass collects `stmt.kind === "import"` from the theta body only; a
    top-level `export` statement in the theta is never read by any check
    (`closeOverReExports` seeds from `walked`, which only libs enter).
  - `src/parser/theta-document.ts` — `ExportDecl` parses in a `.theta` with no
    diagnostic (the `thetalib-top-level-statement` check is `.thetalib`-keyed
    and does not concern `.theta` files; no `.theta`-side rule exists).
  - `docs/spec_topics/imports.md:29` (§Re-exports host wording), `:67`
    (`ExportDecl` production, unscoped).

## Summary

The `ExportDecl` production is admitted by the parser in `.theta` files, but
every consumer of export statements lives on the `.thetalib` side: the load
pass's re-export closure is seeded exclusively from imported libs, and
`collectImports` never collects `export`. So a `.theta`'s `export … from`
statement is parsed and then ignored: the path literal is never resolved
(IMP-1 never runs for it), the specifier is never matched against the source
lib's export set, and the statement contributes nothing. Every one of those
faults is an E-severity refusal when the identical statement sits in a
`.thetalib`.

## Reproduction

Offline at 04579e12; bug-0304 harness shape (real `parseThetaDocument` +
`checkThetaImports` over an in-memory FS). App frontmatter `model: "sonnet"`,
`mode: prompt`.

### D1 — missing path

```
export { X } from "./missing.thetalib"
1
```

Observed: parse `[]`, load `[]`, body executes to `1`. Control: the same
statement inside an imported `.thetalib` draws
`theta/load/unresolvable-thetalib-path` (bug 0333's witness class).

### D3 — resolvable lib, unknown name (lib declares only `fn af`)

```
export { nosuch } from "./lib.thetalib"
1
```

Observed: parse `[]`, load `[]`. Control: in a `.thetalib`,
`theta/parse/import-unknown-symbol` (post-0101/0333).

### D2 — binding side (re-confirmation, clean)

```
export { af } from "./lib.thetalib"
let y = af(1)
y
```

Observed: `error theta/parse/unknown-identifier` — the exported name
correctly creates no local binding (0058's fix holds; not part of this
report's claim).

## Expected behaviour

No prescribed disposition exists — that is the gap:

- `imports.md:29` scopes re-exporting to `.thetalib` hosts by prose ("A
  `.thetalib` may re-export…"), yet `:67`'s `ExportDecl` production and the
  specifier-shape rules (`import-missing-from-clause`,
  `import-malformed-specifier-list`) are stated without host scoping — and
  those SHAPE rules do fire in `.theta` files today, so the form is partially
  policed there (malformed spellings refused, well-formed-but-broken ones
  silently inert).
- IMP-1 (`imports.md:23`) governs "a re-export's own `.thetalib` path
  identically to an `import`'s … sited on the re-exporting file whose
  statement names it" — with no clause excluding a `.theta` as the
  re-exporting file.
- The internally consistent dispositions are: (a) refuse `export` at
  `.theta` top level (a new parse row, mirroring
  `thetalib-top-level-statement`'s inverse), or (b) resolve and check the
  statement exactly as a lib's (path + specifier), keeping it
  visibility-inert, or (c) a spec sentence pinning the statement as legal and
  wholly inert. Today's behaviour is (c)-shaped with no sentence.

## Actual behaviour / root cause

`collectImports` (`import-static-checks.ts:118`) filters
`stmt.kind === "import"`; nothing else in `checkThetaImports` reads the
composing theta's own statements for `export` kind. `closeOverReExports` is
reached only via `walked` (libs). The parser has no `.theta`-side rule for
the statement. Result: parse-clean, load-ignored.

## Why it matters

- Silent-acceptance hygiene: the author wrote a statement expressing intent
  (share this symbol) that the system cannot honour, and gets no signal —
  while a typo'd path or name in the same statement, moved into a lib, is an
  E. The asymmetry invites exactly the confusion the loud lib-side rules
  exist to prevent.
- The gap is the last unpoliced corner of the re-export surface after
  0058/0100/0101/0211/0304/0333/0334: every other host/edge/shape combination
  now has a stated disposition.

## Non-goals

- The from-less form (`export { X }`) in either file kind — bug 0058, fixed.
- Re-export binding semantics in `.thetalib` files — 0101 and successors,
  fixed.
- Whether `.theta` files should ever be importable (future-considerations
  ground; nothing here bears on it).

## Fix

Not yet decided — an adjudication with three coherent options:

1. **Refuse the form in `.theta` files** (recommended): a parse-time E
   (either a new registered row `theta/parse/export-in-theta` or an
   amendment folding it into an existing top-level-form rule), on the ground
   that no `.theta` export can ever be read. Loud, cheap, closes both fault
   classes at once; requires a DIAG-2 registry row + spec sentence.
2. **Resolve and check, keep inert**: seed `closeOverReExports` (path
   resolution + unknown-symbol) from the theta's own export statements too,
   so D1 draws IMP-1 and D3 draws `import-unknown-symbol`, while visibility
   stays nil. No new row; but polices a statement that remains meaningless,
   and quietly implies the form is legal.
3. **Spec-pin the inertness**: one sentence in imports.md declaring the
   `.theta`-hosted form legal and ignored. Cheapest; normalises dead
   statements and the shape-rule/semantic-rule asymmetry stays.

Constraints any fix must satisfy: D2's no-binding behaviour is preserved
(`unknown-identifier` on body use); `.thetalib`-side behaviour is untouched;
GOV-15 applies to option 1 (newly-refused spellings currently load clean).

## Provenance

imports-exports-2 bug-hunt sweep, 04579e12 (v0.415.0). Probe:
`tests/scratch-ie2-load-semantics.test.ts` (deleted after the run) — cells
D1, D2, D3, outputs quoted verbatim. Origin: bug 0101 §Non-goals ("The
`.theta` `export` question", recorded unfiled). Spec read: imports.md
§Re-exports, `:67`; grammar cross-check (`ExportDecl` appears only there).
No non-scratch file modified.
