# Bug 0058 — The from-less `export { … }` form is a production of no spec page — imports.md spells the re-export only with `from`, grammar.md defines no `ExportDecl` — yet `parseImportExport` makes the `from` clause optional and accepts the shape with zero diagnostics: in a `.thetalib` it adds a downstream-visible export name backed by no file, taking a plain import's local out of `theta/parse/import-unknown-symbol`'s emission set — the one rule imports.md `:36` states negatively — while materialising nothing; in a `.theta` it takes an undeclared name out of `theta/parse/unknown-identifier`'s emission set at expression position

- **Status:** fixed (0.60.0). §Fix as settled — the recommended route: the
  from-less form is refused at parse time by
  `theta/parse/import-missing-from-clause`, imports.md gained the `ImportDecl` /
  `ExportDecl` productions, and `export` symbols no longer seed a `.theta`'s
  identifier root scope. See §Fix (0.60.0) below. The evidence
  selects it: the form's three reachable input classes deliver, respectively,
  nothing (the name is already auto-exported), a downstream export name that
  binds nothing, and the reversal of a spec-stated negative rule. Specifying
  the form instead is costed in §Fix and refused there on the same evidence.
  No ordering dependency: bug
  [0040](./0040-inline-slug-def-namespace-not-reserved.md), whose registry row
  names this shape, shipped in 0.50.0.
- **Kind:** specification gap composed with parser tolerance. Two halves, one
  input shape.
  1. *No page defines the form.* imports.md §Re-exports (`:29`) introduces "a
     dedicated form that creates no local binding" and spells it twice, both
     with `from` (`:32`, `:33`); §Unknown imported symbol (`:38`) names the
     specifier four times, always as `export { Foo } from`. grammar.md defines
     35 named productions and none is `ImportDecl` or `ExportDecl`, and its
     own scope sentence (`:3`) explains why — "Other surfaces are owned by
     their topic pages and are not restated here" — so imports.md is the owner
     and the owner spells only the from-bearing form.
  2. *The parser admits the shape anyway.* `BodyParser.parseImportExport`
     parses both keywords in one function and guards the `from` clause with
     `if (this.isKeyword("from"))` (`src/parser/theta-document.ts:2741–2743`);
     `path` initialises to `""` (`:2744`) and stays `""` when no string token
     follows (`:2745–2761`). The resulting `ExportDecl` carries its specifiers
     and an empty path (`:2762–2768`), and downstream consumers read that node
     without testing the path.
- **Related:**
  - [0040](./0040-inline-slug-def-namespace-not-reserved.md) — the filing
    origin. Its §Fix (0.50.0) Residuals item (iv) (`:485–489`) records the
    observation this report files: "The from-less `export { … }` form the
    check also covers is not a spec-defined production — imports.md spells the
    re-export with `from` and grammar.md carries no `ExportDecl` production —
    so the registry *Trigger* names the parser's tolerance explicitly rather
    than resting on a production that does not exist. Unfiled." That row's
    *Trigger* is the corpus's only text acknowledging the shape
    (`docs/spec_topics/diagnostics/code-registry-parse.md:111`). 0040 is also
    the reason the shape now has one refusing input class: its check fires on
    a from-less specifier's local binding, measured in §Reproduction.
  - [0057](./0057-glossary-callee-tail-spelling-drifts-from-schema-subset.md)
    — a sibling filing from the same fix report's residual list (item 2 there,
    item 4 here). Disjoint subject; no shared surface.
- **Affected** (every citation verified at HEAD `aef82bde`, 0.50.0):
  - `src/parser/theta-document.ts:2671–2769` — **the frame.**
    `parseImportExport(kind: "import" | "export")`, reached for both keywords
    from one dispatch pair (`:1796–1799`). `:2741–2743` is the optionality:
    the `from` keyword is consumed when present and nothing is emitted when
    absent. `:2744–2761` leaves `path` as `""` unless a string token follows,
    and `validatePathLiteral` (`:2753–2759`) runs only inside that branch, so
    an absent path is never checked. `:2762–2768` returns the node with
    `path: ""`. The specifier loop (`:2682–2740`) runs to the closing `}`
    regardless, so `symbols` and `specifiers` are fully populated for a
    from-less list.
  - `src/parser/theta-document.ts:664–672` — `ExportDecl`, documented "An
    `export … from` declaration (imports.md)". Its `path: string` field has no
    representation for absence, so a from-less form and a from-bearing form
    are the same node type distinguished only by an empty string.
  - `src/extension/import-static-checks.ts:106–133` — `extractThetaLibForms`,
    the load-pass reader. Its `export` arm (`:113–121`) records one
    `ReExportSpecifier` per specifier with `fromPath: stmt.path` — `""` for
    the from-less form — and `exported: specifier.local`. No arm tests the
    path.
  - `src/parser/imports.ts:614–619` — `computeThetaLibExports`, which unions
    declaration names with `reExports.map(r => r.exported)`. A from-less
    export's names therefore enter the resolved-export set on the same footing
    as a from-bearing re-export's. Its contract (`:609–612`) states the rule it
    is implementing in terms of "every `export … from` re-export".
  - `src/extension/import-static-checks.ts:388–399` — the IMP-3 site:
    `resolvedExports` from the call above is what `checkImportUnknownSymbols`
    matches an importing specifier against, so the export set is the whole of
    `theta/parse/import-unknown-symbol`'s admission test.
  - `src/extension/import-static-checks.ts:405–415` — IMP-6 / IMP-7
    materialisation. `materializeSymbol` (`:145–177`) searches the resolved
    `.thetalib`'s top-level `fn` / `schema` / `enum` declarations by SOURCE
    name and returns `undefined` otherwise (`:176`), so a name admitted by the
    export set alone produces no `MaterializedImport`.
  - `src/extension/import-static-checks.ts:77–85` — `collectImports`, which
    collects `kind === "import"` only. Both the resolution loop (`:279`) and
    the cycle walk (`:324`) use it, so an `export` statement's path — empty or
    not — is never resolved, never cycle-walked, and never IMP-2-checked
    beyond the parse-time literal check.
  - `src/runtime/lexical-environment.ts:394–400` — `resolve`'s import arm
    reads `root.imports`, populated from the materialised list. A name absent
    there falls through to the callable set (`:401–403`).
  - `src/parser/theta-document.ts:4383–4411` — `collectIdentRoots`, which adds
    every `import` and `export` statement's `symbols` to the whole-file
    identifier root scope (`:4402–4407`). This is the seam by which an
    `export` statement in a `.theta` — a file no `import` can name — takes a
    name out of `theta/parse/unknown-identifier`'s emission set.
    `checkLexicalCallSites` (`:5030`, `:5054–5058`) folds the same names into
    `fnImportDecls`.
  - `src/runtime/statement-executor.ts:1499–1506` — both statement kinds are
    inert at execution ("Declarations are hoisted / registered by `V19b`'s
    environment; inert here").
  - `src/extension/production-composition.ts:1849–1886` —
    `collectCallableClosureSources`, the RFC-0005 subagent callable-hash
    closure walk. `:1876–1881` visits `statement.path` for `kind === "export"`
    on the same footing as `import`; for a from-less export that path is `""`
    and `resolvePath(dirname(absPath), "")` returns the containing directory
    (measured in §Reproduction), which `fs.readBytes` fails and the walk drops
    at `:1870–1872`. The directory is nonetheless added to `seen` (`:1865`).
  - `src/parser/imports.ts:632–637` — `thetalibLocalBindings`, which excludes
    re-export sources because "an `export … from` re-export creates NO local
    binding". No `src/` caller (`rg -n 'thetalibLocalBindings' src/` returns
    the definition and one comment); its only caller is
    `tests/export-visibility.test.ts:133`.
  - `docs/spec_topics/imports.md:29`, `:32`, `:33` — §Re-exports and its two
    examples, both `from`-bearing. `:36` — the negative rule this report's
    §Reproduction shows the from-less form reversing. `:27` — §Visibility
    (auto-export of every top-level declaration). `:13` — the permitted
    `.thetalib` top-level forms, which name `export` as a permitted keyword
    without spelling any form. `:38` — the unknown-symbol rule, which names
    the specifier as `export { Foo } from` four times.
  - `docs/spec_topics/grammar.md:3` — the appendix's scope sentence; `:5` —
    the `::=` notation. 35 named productions across the page, none for an
    import or export declaration (`rg -n '::=' docs/spec_topics/grammar.md`
    returns 37 lines: 35 productions, the notation sentence at `:5`, and one
    inline reference inside prose at `:107`). `:195` calls `import` and
    `export` "productions" in the `///`-placement rule, the page's only
    mention of either keyword.
  - `docs/reference/grammar.md` — the user-facing mirror, which has no import
    or export section at all (its `##` headings run Source files, Identifiers,
    Reserved keywords, Comments, String literals, Number literals, Statement
    termination & newline continuation, `let` form, Type grammar, Blocks, `fn`
    declarations, `match` arm body, `schema X by <field>`, `///` placement,
    Expression sublanguage, Built-in methods & properties, Control flow,
    `return`, Bindings & mutability, Theta literal sublanguage, Pi-tool
    argument grammar, Provenance). `docs/guide.md:186–188` nonetheless sends
    readers there for "the resolution and re-export rules"
    (`./reference/grammar.md#source-files`); §Source files
    (`docs/reference/grammar.md:10–30`) carries encoding, newline, span,
    path-literal, stray-backslash and extension-matching rules and no export
    form.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:111` — the
    `theta/parse/import-reserved-synthesised-name` row, whose *Trigger* is the
    only text in the corpus that admits the shape exists: "it fires whether or
    not the `.thetalib` path resolves, and whether or not a `from` clause
    follows the specifier list — a `from`-less list is a shape imports.md
    defines no production for, and the check still runs over the specifiers
    the parser accepted there". `:110` — the `theta/parse/import-unknown-symbol`
    row, whose *Trigger* is stated purely in terms of `export { ... } from`.
    Mirrored at `docs/reference/diagnostics.md:160`.
  - `docs/plan_topics/coverage-matrix.md:172` — `cka-48`, the un-anchored
    obligation area the export-visibility semantics sit in, itself stated
    entirely in terms of "the aliased `export … from` re-export form".
  - **The corpus.** 34 committed `.theta` / `.thetalib` files
    (`rg --files --glob '*.theta' --glob '*.thetalib' .`); the only occurrence
    of the token `export` in any of them is the word "exported" in a comment
    (`tests/live/acceptance/fixtures/acc-lib.thetalib:2`). Zero `export`
    statements of either form. The one theta-source export in `tests/` is
    from-bearing (`tests/whole-program-parser.test.ts:261`, the cka-49
    declaration-kind fixture, asserted at `:276–287`).
    `tests/export-visibility.test.ts` constructs `ReExportSpecifier` records
    directly and never parses source text.
    `tests/inline-slug-name-reservation.test.ts:357` tolerates an `export `
    line in its binding-site helper but no fixture in that file uses one.
- **Observed at:** `0.50.0` (HEAD `aef82bde`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving the real `parseThetaDocument` and
  the real `checkThetaImports` over an in-memory `FileSystem` double; written,
  run, deleted.

## Fix (0.60.0)

The settled §Fix, implemented as written on its recommended route: refuse the
shape. Two review rounds (round 1 deep, round 2 fast) and one fixer round; no
round raised a `correctness`, `fidelity` or `spec` finding against the refusal
itself — round 1's single blocker and both rounds' residuals were stale comment
prose. Line anchors are at the fix commit.

**Reproduction re-derived at the fix baseline** (`3e190fbc`, 0.59.0), before any
assertion was pinned: every row of §Reproduction reproduces byte-identically at
HEAD — the three input classes and their controls, the measured
`theta/parse/import-unknown-symbol` pair, the alias, the from-bearing
materialisation contrast, the six parse-only spellings and their nodes, the
bug-0040 co-emission rows, and the nine `.theta` scope rows. **Behavioural drift:
zero.** The doc's registry citations are off by one at HEAD
(`code-registry-parse.md:110` is `import-name-collision`; `:111` is
`import-unknown-symbol`; `:112` is `import-reserved-synthesised-name`), and
`theta-document.ts` has moved across the 0044 / 0045 / 0053 / 0055 fixes
(`parseImportExport` `:2671` → `:2786`, `collectIdentRoots` `:4383` → `:4509`,
`checkLexicalCallSites` `:5030` → `:5174`). Two rows the doc does not record,
measured here as baseline: a path-less `import { greet } from` parses silently to
`{path:"",symbols:["greet"]}`, and a from-less `import { __inline_<16hex> }`
emits bug 0040's code.

**The refusal.** `checkImportMissingFromClause` (`src/parser/imports.ts`) is a
pure predicate over the trailing clause — a `from` keyword present AND a path
literal after it — returning the new error-severity
`theta/parse/import-missing-from-clause` otherwise. `parseImportExport`
(`src/parser/theta-document.ts`) tracks both facts as it consumes the clause and
raises the diagnostic onto `this.diagnostics` beside the existing
`validatePathLiteral` call — the seam bug 0040 established, which makes
`parseThetaDocument` alone the witness with no `.thetalib` resolution required.
**One diagnostic per statement**, ranged over the statement: the node's
`spanRange(kw.range, this.prevRange())` is hoisted to a `const` and shared, so
the diagnostic range and the node range are the same span by construction. The
returned node's shape is untouched (`path: ""` stays); the refusal is the
observable. §Fix constraint 1 holds: bug 0040's per-specifier
`theta/parse/import-reserved-synthesised-name` is unnarrowed and **co-emits** on
a from-less reserved-name specifier, each provable red-able alone.

**Constraint 2 — `.theta` scope stops gaining export names.** `collectIdentRoots`
and `checkLexicalCallSites` drop their `case "export":` fall-through, so only
`import` symbols seed the whole-file identifier root scope and `fnImportDecls`.
The basis is spec-stated, not inferred: expressions.md `:47` arm (3) is "A symbol
imported from a `.thetalib` file", and imports.md `:29` says a re-export "creates
no local binding". The measured control is the pin in both directions — a bare
`Ghost("x")` raises `theta/parse/unknown-identifier`; a from-**bearing**
`export { Ghost } from "./lib.thetalib"` beside it now raises it too; an
`import { Ghost } from "./lib.thetalib"` beside it still does not. The three
sibling prose sites that described the old behaviour were re-derived with it.

**Constraint 3 — the empty-path readers get a contract, deliberately not a
guard.** `extractThetaLibForms`' `fromPath: stmt.path`
(`src/extension/import-static-checks.ts`) and `collectCallableClosureSources`'
`statement.path` resolution (`src/extension/production-composition.ts`) record
the narrowed input class in place. **The doc's constraint-3 premise is wrong at
HEAD and the fix does not adopt it:** "after the fix no parsed `ExportDecl`
reaching them has an empty path" is false, because `checkThetaImports` pushes a
resolved lib's registration errors and *then* calls `extractThetaLibForms` over
the same parsed body unconditionally, so a refused-but-parsed lib's `path: ""`
still reaches that reader. An assert there would crash on refused input. What
keeps a from-less re-export out of any REGISTERED export set is the pushed
error, and the comments say so. Both comments also record that the new code is
not the only route to an empty path: `import { x } from ""` sets a path literal
and is refused by `theta/parse/import-non-thetalib-extension` instead.

**Spec and registry, same commit (DIAG-2).** imports.md §Re-exports gains the
four productions in grammar.md `:5`'s notation — `ImportDecl`, `ExportDecl`,
`ImportSpec`, `ExportSpec`, all `from`-bearing — with the refusal stated on the
spellings it covers. `docs/spec_topics/grammar.md` is correctly untouched: `:3`
leaves the surface to its owner page. One new registry row in the Imports
cluster of `code-registry-parse.md`, directly after
`theta/parse/import-reserved-synthesised-name`, mirrored into
`docs/reference/diagnostics.md`. The *Message* carries **no placeholder** —
the category-3 `<construct>` table is closed (placeholder-rendering-a.md `:45`),
so a placeholder-free template is the only closure-respecting shape:
`import / export specifier list requires a 'from' clause with a .thetalib path
literal`. Constraint 1's re-derivation landed with it: the reserved-name row's
*Trigger* no longer rests on "a `from`-less list is a shape imports.md defines no
production for" — a premise this change falsifies — and states the co-emission
instead. A *Trigger* change, inside the diagnostic-registry carve-out
(`source-language-stability.md:25`), as is the code addition itself and the
widened `theta/parse/unknown-identifier` emission set constraint 2 produces.

**Constraint 4 — the user-facing route corrected.** `docs/reference/grammar.md`
gains `## Imports and re-exports`: the productions, the binding rules, the
`.thetalib` path rule cross-linked to §Source files, and the three reachable
codes. `docs/guide.md` repoints from `#source-files` — which carries none of
this — to `#imports-and-re-exports`, reworded to name what that section holds.

**Blast radius re-measured at the fix baseline, and one correction to the doc's
census.** 34 committed `.theta` / `.thetalib` files; the only occurrence of the
token `export` in any of them is the word "exported" in a comment
(`tests/live/acceptance/fixtures/acc-lib.thetalib:2`); both committed `import`
statements are from-bearing. The doc's census is accurate for what it measures,
but it could not reach a fixture that is a TypeScript string literal:
`tests/reserved-keyword-type-position.test.ts` — named in no §Affected list —
synthesises `schema X = import` / `schema X = export` inside its 32-keyword
matrix, and the pre-existing alias-arm-stop recovery leaves the swallowed keyword
as its own bare `import` / `export` residue statement, which is exactly the shape
this fix refuses. Measured: `["error theta/parse/empty-schema-body", "error
theta/parse/import-missing-from-clause"]`, statements `["schema","import","let"]`.
The two matrix cells gained the second expected code — a strictly additive
strengthening, no cell weakened, no other cell moved. That input already emitted
an `E` before the change and so was never in GOV-15's loads-cleanly set.

**Offline lock.** `tests/import-export-from-clause-required.test.ts` (20 tests,
seven groups): (a0) the DIAG-4 registry anchor — row present, *Message* / *Sev* /
*Phase* pinned, and every expected string in the file sourced through
`registryMessage`, never copied prose, with a missing row failing loudly by name
rather than skipping; (a) the six degenerate spellings, each exactly one
diagnostic at the statement range, plus a three-specifier list proving
per-statement not per-specifier; (b) the from-bearing controls silent; (c) the
imports.md `:36` pair through the real `checkThetaImports` over an in-memory
`FileSystem` — the control's `theta/parse/import-unknown-symbol` pinned, the
previously-silenced case now refused at the lib and propagated by IMP-4; (d) the
`.theta` expression-position control pinned in all three directions; (e) the
bug-0040 co-emission row and its from-bearing control; (f) the invented
downstream name refused and still materialising nothing. Verified in three
directions by targeted neutralisation, each restored byte-exact against its blob
hash: neutralising the refusal reds exactly (a)/(c)/(e)/(f) (10 of 20);
neutralising constraint 2 alone reds exactly (d-export) (1 of 20), so the two
halves are independently witnessed; deleting the registry row reds the DIAG-4
anchor loudly by name. Full gate 250 files / 3495 tests; typecheck and lint
clean.

**Live.** H8a `tests/live/live-production-acceptance.test.ts` 7/7 and the H9a
acceptance suite 11/11 green, including area (g), the only area that loads
`acc-lib.thetalib` / `acc-imports-invoke.theta`. H9a's empty-capture stderr gate
and its permitted-code subset check both passed on every spawn, which is the
measurement — not the assumption — that the new code is fault-injection-only:
`tests/fixtures/h7a/permitted-codes.json` is correctly unextended. No shipped
live test exercises the refused form (blast radius zero), so a scratch live probe
carried the obligation per the bug 0033 precedent: two sibling thetas planted
through the real H8a harness — one importing from a lib whose whole content is a
from-less `export { Ghost }`, one importing an ordinary lib and driving a real
model turn. With the refusal neutralised the bad theta REGISTERS (red); with it
restored the bad theta un-registers and the control registers and returns its
sentinel (green). Probe deleted.

**Residuals.** (i) Three spellings the newly published productions exclude still
parse clean: `import from "./m.thetalib"`, `export from "./m.thetalib"`, and
`import {} from "./m.thetalib"` (which resolves and registers a lib while binding
nothing); a dangling `import { a as } from "./m.thetalib"` also drops the alias
silently. Not refused here on purpose — they load cleanly today, so refusing them
is outside §Fix's GOV-15 refused set and would breach constraint 6. Same shape as
the defect this report filed, one level down; unfiled. (ii) The from-bearing
re-export's materialisation gap is untouched, as §Non-goals scopes: a resolvable
`export { greet } from "./mid.thetalib"` still passes IMP-3 downstream and
materialises nothing. Unfiled. (iii) `thetalibLocalBindings`
(`src/parser/imports.ts`) still has no `src/` caller, so nothing cross-checks the
local-binding set against the export set; unchanged here, unfiled. (iv) This
fix's insertions push `hasLoadParseError` in
`src/extension/production-composition.ts` down by ten lines, staling the
`:1894–1901` citation carried by bugs 0038, 0040, 0041, 0054, 0059, 0060, 0061,
0089, 0099 and by two test comments. Pre-existing citation-drift class, not
reconciled here.

## Summary

`parseImportExport` handles `import` and `export` in one function and makes the
`from` clause optional for both. `export { Author }` with no `from` therefore
parses, and produces an `ExportDecl` whose `path` is the empty string. No spec
page defines that form: imports.md owns the surface and spells the re-export
only as `export { … } from "…"`; grammar.md defines no declaration production
for either keyword and says the topic page owns it.

The accepted node is not inert. `extractThetaLibForms` records each of its
specifiers as a re-export whose `fromPath` is `""`, and `computeThetaLibExports`
puts the specifier's local name into the resolved-export set — the set
`theta/parse/import-unknown-symbol` admits an importing specifier against.
Materialisation is a separate walk over the resolved file's declarations, so
the name is admitted and bound to nothing.

Three input classes, three outcomes, measured:

- **The name is a local declaration.** `fn greet` plus `export { greet }` is
  indistinguishable from `fn greet` alone: imports.md `:27` already
  auto-exports every top-level declaration, so the statement adds nothing.
- **The name is declared nowhere.** `export { Ghost }` alone makes a
  downstream `import { Ghost }` load with zero diagnostics and bind nothing.
  The importing `.theta` may then call `Ghost(…)` and still parse clean,
  because the import specifier put the name in the identifier root scope.
- **The name is a plain import's local.** imports.md `:36` states the one
  negative rule of the section — "A plain `import { Author } … ` does **not**
  re-export `Author`". Adding a from-less `export { greet }` beside the plain
  import takes the downstream import out of `theta/parse/import-unknown-symbol`
  and still materialises nothing. The undefined form reverses a defined rule.

In a `.theta` — a file no `import` can name (imports.md's opening paragraph:
"`.theta` files are *not* importable from each other") — a from-less
`export { Ghost }` takes `Ghost` out of `theta/parse/unknown-identifier`'s
emission set at expression position. That silencing is the export statement's
`symbols` list reaching `collectIdentRoots`, and the from-bearing form does it
too; what the from-less form adds is that no path is named, so nothing
constrains what the statement may claim.

Bug 0040's registry row already states in prose that the parser accepts the
shape. That row is a diagnostic's trigger, not a grammar production: it records
the tolerance without licensing it.

## Reproduction

Offline, at `aef82bde`. Scratch vitest: the real `parseThetaDocument`
(production-shaped `ParseThetaDocumentDeps`) and the real `checkThetaImports`
over an in-memory `FileSystem` exposing `readdir` / `readBytes`, in the shape
`tests/subagent-fn.test.ts:1581–1614` uses. The importing `.theta` is
`/proj/app.theta` with frontmatter `model: "sonnet"` + `mode: prompt`; libs sit
beside it. `materialised` is `checkThetaImports(...).imports`; `import diags`
is its `diagnostics`; `app parse diags` is the importing document's own.

### The three input classes at the `.thetalib` export set

```
@@ lib `fn greet(x: string) { x }` + `export { greet }`   app `import { greet } from "./lib.thetalib"`
   import diags   :: []
   materialised   :: [{"name":"greet","kind":"fn"}]
@@ lib `fn greet(x: string) { x }`            [control]   app `import { greet } from "./lib.thetalib"`
   import diags   :: []
   materialised   :: [{"name":"greet","kind":"fn"}]

@@ lib `export { Ghost }`                                 app `import { Ghost } from "./lib.thetalib"`
   app parse diags:: []
   import diags   :: []
   materialised   :: []

@@ lib `import { greet } from "./mid.thetalib"` + `export { greet }`
   mid `fn greet(x: string) { x }`                        app `import { greet } from "./lib.thetalib"`
   import diags   :: []
   materialised   :: []
@@ lib `import { greet } from "./mid.thetalib"`           [control]
   mid `fn greet(x: string) { x }`                        app `import { greet } from "./lib.thetalib"`
   import diags   :: ["theta/parse/import-unknown-symbol: imported symbol 'greet' is not declared or re-exported by './lib.thetalib'"]
   materialised   :: []
```

The first pair is the no-op class. The third pair is imports.md `:36`: the
control emits the code the rule requires, and adding the from-less export
removes it.

### The alias

```
@@ lib `fn greet(x: string) { x }` + `export { greet as hello }`
   app `import { hello } from "./lib.thetalib"`   import diags :: []   materialised :: []
   app `import { greet } from "./lib.thetalib"`   import diags :: []   materialised :: [{"name":"greet","kind":"fn"}]
```

The alias adds a second downstream-visible name that binds nothing, and does
not withdraw the auto-exported one.

### The from-bearing contrast, which behaves the same on materialisation

```
@@ lib `export { greet } from "./mid.thetalib"`   mid `fn greet(x: string) { x }`
   app `import { greet } from "./lib.thetalib"`   import diags :: []   materialised :: []
@@ lib `export { greet as hello } from "./mid.thetalib"`   mid `fn greet(x: string) { x }`
   app `import { hello } from "./lib.thetalib"`   import diags :: []   materialised :: []
```

A resolvable, spec-defined re-export also materialises nothing. The
bind-nothing half of the from-less form's behaviour is therefore shared and is
not attributable to it; §Non-goals scopes that out. What the from-less form
does not share is that its export name has no source file at all.

### The parsed node, and the parse-time disposition of each spelling

Parse only, file `/proj/lib.thetalib`:

```
@@ "export { greet }"                        diags []  stmts [{"kind":"export","path":"","symbols":["greet"],
                                                               "specifiers":[{"source":"greet","local":"greet",…}]}]
@@ "export {}"                               diags []  stmts [{"kind":"export","path":"","symbols":[],"specifiers":[]}]
@@ "export"                                  diags []  stmts [{"kind":"export","path":"","symbols":[],"specifiers":[]}]
@@ "export { greet } from"                   diags []  stmts [{"kind":"export","path":"","symbols":["greet"],…}]
@@ "export { greet } from \"./mid.thetalib\""  diags []  stmts [{"kind":"export","path":"./mid.thetalib",…}]
@@ "export { greet } from \"./mid.theta\""     diags ["theta/parse/import-non-thetalib-extension: import path './mid.theta' does not end in .thetalib"]
```

A bare `export`, an empty list, and a `from` with no path literal are all
accepted with zero diagnostics and produce the same empty-path node. The
`.thetalib` top-level gate does not reach them — `export` is a permitted form
(imports.md `:13`), and the control `let x = 1` in the same position emits
`theta/parse/thetalib-top-level-statement`.

Bug 0040's check is the one refusal reachable through the from-less specifier:

```
@@ "export { __inline_0123456789abcdef }"
   ["theta/parse/import-reserved-synthesised-name: imported symbol '__inline_0123456789abcdef' binds a reserved synthesised name"]
@@ "export { __inline_0123456789abcdef } from \"./mid.thetalib\""     the same code
@@ "export { greet as __inline_0123456789abcdef }"                    the same code
```

### In a `.theta`

Frontmatter `model: "sonnet"` + `mode: prompt`; body as shown; parse
diagnostics only.

```
@@ `let r = Ghost("x")` + `r`                        [control]   ["theta/parse/unknown-identifier: unknown identifier 'Ghost'"]
@@ `export { Ghost }` + `let r = Ghost("x")` + `r`               []
@@ `export { Ghost } from "./lib.thetalib"` + same               []
@@ `import { Ghost }` (no from) + same                           []
@@ `import { Ghost } from "./lib.thetalib"` + same    [control]  []

@@ `schema S { f: Ghost }` + `let z = 1` + `z`       [control]   ["theta/parse/unresolved-named-type: unresolved named type 'Ghost'"]
@@ `export { Ghost }` + `schema S { f: Ghost }` + …              ["theta/parse/unresolved-named-type: unresolved named type 'Ghost'"]

@@ `let z: Ghost = 1` + `z`                          [control]   []
@@ `export { Ghost }` + `let z: Ghost = 1` + `z`                 []
```

The silencing is confined to expression position. The `schema`-body
`NamedType` position keeps its refusal with the export line present, and the
`let` annotation position refuses nothing either way — measured, and outside
this report.

The same optionality admits a from-less `import { Ghost }`, which silences the
same check. That import is then dropped by the resolution loop, whose first act
is `if (!spec.endsWith(".thetalib")) continue`
(`src/extension/import-static-checks.ts:355–359`), so it resolves nothing,
diagnoses nothing and binds nothing.

### The empty path at the closure walk

```
@@ resolvePath(dirname("/proj/sub/lib.thetalib"), "")
   dirname  :: "/proj/sub"
   resolved :: "C:\\proj\\sub"
```

`collectCallableClosureSources` visits that directory, fails `readBytes`, and
returns at `src/extension/production-composition.ts:1870–1872`. No source is
added to the hashed closure; the directory path is retained in `seen`.

## Expected behaviour

- **A form the parser accepts is a form some page defines.**
  `docs/spec_topics/grammar.md:3` is explicit about where each surface's
  definition lives: the appendix covers "the few surface-syntax forms that no
  single topic page owns end-to-end", and "Other surfaces are owned by their
  topic pages and are not restated here". imports.md is that owner for
  `import` / `export`, and its §Re-exports (`:29`) introduces exactly one
  form — "a dedicated form that creates no local binding" — spelled `from`-
  bearing in both examples (`:32`, `:33`). Every other mention agrees:
  `:36` ("only declarations and explicit `export ... from` forms are visible
  to downstream importers"), `:38` (four `export { Foo } from` spellings),
  `docs/spec_topics/invocation.md:87` ("re-exports (`export { foo } from
  "./other.thetalib"`)"), `docs/plan_topics/coverage-matrix.md:172` ("the
  aliased `export … from` re-export form"), and the two registry rows
  (`code-registry-parse.md:110`, `:111`).
- **The export set is a function of what the file re-exports.**
  `src/parser/imports.ts:609–612` states the rule it implements: "every
  top-level declaration is auto-exported … and every `export … from` re-export
  is visible under its downstream name (`exported`); a plain `import` local is
  excluded — a plain import is not re-exported downstream (imports.md
  §Re-exports, negative half)." A specifier that names no file is neither of
  the two admitted sources.
- **imports.md `:36` holds for every spelling.** The rule is stated
  unconditionally: a plain `import` does not make its local downstream-visible.
  No form defined by the page revokes it. The measured control shows the rule
  enforced (`theta/parse/import-unknown-symbol`) and the undefined form
  removing the enforcement.
- **A `.theta`'s identifier scope does not gain names from a statement that
  can name nothing.** imports.md's opening paragraph makes `.theta` files
  non-importable, so no `export` in a `.theta` is ever read. The measured
  control (`theta/parse/unknown-identifier` on the bare call) is the behaviour
  a file with no binding for `Ghost` is expected to keep.
- **An admitted name is a bound name.** IMP-3's role is to refuse an importing
  specifier that names a symbol "which is neither a top-level declaration nor
  a transitive re-export" (imports.md `:38`). The check passing and the
  binding being absent are the two halves of one contract; a form that
  separates them makes the check report on a set the environment does not
  build.

## Actual behaviour / root cause

**One function parses two keywords, and the `from` clause is optional for
both.**

```ts
    if (this.isKeyword("from")) {
      this.advance();
    }
    let path = "";
    const pathTok = this.peek();
    if (pathTok.kind === "string") {
      path = pathTok.value ?? pathTok.text;
      …validatePathLiteral(…)
      this.advance();
    }
```

`src/parser/theta-document.ts:2741–2761`. Neither branch has an else. The
specifier loop above (`:2682–2740`) has already run to the closing brace, so
the node returned at `:2762–2768` carries a full `symbols` / `specifiers` pair
and `path: ""`. The shared function is deliberate for the specifier grammar —
`import { A as B }` and `export { A as B } from` differ only in the trailing
clause and in what the local name means — and the sharing is what carries the
optionality across from `import`, where a missing `from` is equally undefined.

**The load pass reads the node without testing the path.**
`extractThetaLibForms` (`src/extension/import-static-checks.ts:113–121`)
records `fromPath: stmt.path` and never reads it back;
`computeThetaLibExports` (`src/parser/imports.ts:614–619`) projects only
`exported`. The empty path is stored and dropped. So the export set — the
whole of IMP-3's admission test at `import-static-checks.ts:388–399` — treats
"re-exported from nowhere" as "re-exported".

**Materialisation is a different walk.** `materializeSymbol` searches the
resolved `.thetalib`'s own top-level `fn` / `schema` / `enum` statements by
source name (`import-static-checks.ts:145–177`, called at `:405–415`) and
returns `undefined` when the source names no declaration. Nothing consults the
re-export list. The admission test and the binding walk therefore disagree for
every re-export, and for the from-less form the disagreement is permanent: no
file is named, so no walk could ever find the declaration.

**The reversal of imports.md `:36` is the composition of those two facts with
`thetalibLocalBindings`' unusedness.** The negative rule is implemented once,
by omission: `computeThetaLibExports` does not include
`forms.plainImports`. A from-less `export { greet }` re-adds the same name
through the `reExports` arm, so the omission is bypassed without any code
claiming to bypass it. The symmetric function that *does* model local bindings
(`src/parser/imports.ts:632–637`) has no `src/` caller, so nothing
cross-checks the two sets.

**The `.theta` silencing is `collectIdentRoots`.**
`src/parser/theta-document.ts:4402–4407` folds both `import` and `export`
statements' `symbols` into the whole-file root scope, described at `:4383–4389`
as "imported / re-exported symbols". For an `import` that is correct — the
specifier binds. For an `export` in a `.theta` there is no binding and no
reader, and the measured control shows the code the scope entry removes.
`checkLexicalCallSites` (`:5054–5058`) folds the same names into
`fnImportDecls`, so the call site is treated as a known callee.

**The empty path also reaches the RFC-0005 closure walk.**
`collectCallableClosureSources` (`src/extension/production-composition.ts:1876–1881`)
resolves `statement.path` for `kind === "export"` with no path test; `""`
resolves to the containing directory, `readBytes` fails, and the walk returns
at `:1870–1872`. The hashed closure is unaffected.

**The registry row is the only place the shape is written down.**
`code-registry-parse.md:111` names it because bug 0040's round-2 review found
the reserved-name check firing on a from-less specifier and widened the prose
rather than narrowing the code — a from-less specifier still introduces a
local name, so narrowing would have reopened the seam. That decision is
correct for that check and is why this report exists: the row documents a
tolerance the grammar does not grant.

## Why it matters

- **A spec-stated negative rule is defeated by an undefined form.**
  imports.md `:36` is §Re-exports' one negative rule, and it is exactly what
  `theta/parse/import-unknown-symbol` enforces. The measured pair shows
  the code emitted without the export line and absent with it, for the same
  two files otherwise byte-identical. A reader of the spec cannot predict
  either outcome, because the input is not in the spec.
- **An import can pass its own admission check and bind nothing.** IMP-3
  exists to refuse a specifier naming a symbol the resolved file does not
  provide. For a from-less export the check consults a set containing a name
  no file provides, so the refusal that protects the importer is withdrawn on
  the strength of a claim nothing backs.
- **The consuming theta parses clean and reaches the runtime with the name
  unbound.** `import { Ghost } from "./lib.thetalib"` plus `Ghost("x")`
  produces zero parse diagnostics and zero load diagnostics against a lib whose
  entire content is `export { Ghost }`, and `checkThetaImports` returns an
  empty `imports` list, so `LexicalEnvironment.resolve`'s import arm
  (`src/runtime/lexical-environment.ts:394–400`) has no entry to find. This
  report does not drive the call to a runtime outcome; it establishes that
  every static gate on the path is silent.
- **`.theta` scope is widened by a statement `.theta` files cannot use.**
  `.theta` files are not importable, so an `export` in one is read by nothing.
  It still removes a name from `theta/parse/unknown-identifier`, which is the
  check that catches a typo in a callee name.
- **The tolerance is load-bearing in a shipped registry row.**
  `code-registry-parse.md:111` states the from-less case explicitly in its
  *Trigger*; `docs/reference/diagnostics.md:160` mirrors the row's code,
  severity, phase and *Message* (that table has no *Trigger* column, `:55`).
  Either the form gains a
  production and the row rests on it, or the form is refused and the row's
  sentence about a `from`-less list becomes unreachable prose. Leaving both is
  a registry row that documents an input the language does not define.
- **The user-facing route to the rules is already broken.**
  `docs/guide.md:186–188` sends readers to `docs/reference/grammar.md#source-files`
  for "the resolution and re-export rules"; that section carries none, and the
  reference grammar has no import or export section at all. A reader who
  follows the link learns nothing about which export spellings exist.
- **Nothing in the corpus scores it.** Zero of the 34 committed `.theta` /
  `.thetalib` files carry an `export` statement of either form, so the
  committed-fixture parse gate never meets one — and that gate walks `.theta`
  files only (`tests/committed-fixture-parse-gate.test.ts:50–60`), so a
  `.thetalib` carrying the form is outside it either way. The one
  theta-source export in `tests/` is from-bearing
  (`tests/whole-program-parser.test.ts:261`). The behaviour is reachable only
  by an author writing the form for the first time.

## Fix

**Refuse the from-less form at parse time.** `parseImportExport` emits an
error-severity parse diagnostic when the specifier list is not followed by a
`from` clause with a path literal, for both statement kinds, and imports.md
states the `from` clause as part of the form it defines.

*Route.* The diagnostic is raised in `parseImportExport`
(`src/parser/theta-document.ts:2741–2761`) onto `this.diagnostics`, beside the
existing `validatePathLiteral` call — the seam bug 0040 established for
per-specifier parse-time refusals (`:2724–2730`), and the one that makes
`parseThetaDocument` alone the witness with no `.thetalib` resolution required.
The load pass is not the seam: `collectImports` never collects an `export`
(`src/extension/import-static-checks.ts:77–85`), so a check placed there would
not see the statement at all.

*Registry.* One new row in the Imports cluster of
`docs/spec_topics/diagnostics/code-registry-parse.md` (after `:111`), mirrored
into `docs/reference/diagnostics.md` in the same commit, per DIAG-2. The row's
*Trigger* states the refused shape positively — a specifier list with no
`from` clause, or a `from` clause with no path literal — and its *Spec rule*
column points at the imports.md production the same change adds.

*Spec.* imports.md §Re-exports (`:29`) gains the production in the notation
`docs/spec_topics/grammar.md:5` defines, since imports.md is the owner
(`grammar.md:3`) and the appendix does not restate owned surfaces:

```
ExportDecl ::= "export" "{" ExportSpec ("," ExportSpec)* ","? "}" "from" STRING
ExportSpec ::= Ident ("as" Ident)?
```

with the existing prose already supplying the semantics ("creates no local
binding", the alias is the downstream-visible name). The corresponding
`ImportDecl` production is written in the same change, since the same
optionality admits a from-less `import` (measured) and the same page owns it.

*Blast radius — the GOV-15 post-hoc in-scope set.* The newly refused inputs
are exactly: any `.theta` or `.thetalib` carrying an `export` or `import`
statement whose specifier list is followed by no `from` clause or by a `from`
with no path literal, including the degenerate `export`, `export {}`,
`export { … } from` spellings measured in §Reproduction; and, through the
pre-existing IMP-4 registration-error propagation, any theta importing a
`.thetalib` that carries one. GOV-15's diagnostic-registry carve-out
(`docs/spec_topics/governance/source-language-stability.md:25`) covers a code
addition "for inputs that did not previously emit the added code", which is
every input in that set. Measured occurrences in the tree: **zero** —
34 committed `.theta` / `.thetalib` files carry no `export` statement of any
form, and the one theta-source export in `tests/`
(`tests/whole-program-parser.test.ts:261`, asserted `:276–287`) is
from-bearing, as are both spellings in `tests/export-visibility.test.ts`
(which parses no source text). `tests/inline-slug-name-reservation.test.ts`
uses no `export` fixture; its binding-site helper tolerating an `export ` line
(`:357`) is unexercised.

Constraints on any implementation:

1. **The refusal is the statement's, not the specifier's.** One diagnostic per
   `export` / `import` statement missing its `from` clause, ranged over the
   statement, not one per specifier. Bug 0040's per-specifier check
   (`theta/parse/import-reserved-synthesised-name`) keeps its current
   emission on the same input: a from-less `export { __inline_<16hex> }`
   emits that code today (measured in §Reproduction) and emits both after the
   fix, each provable red-able on its own. That row's *Trigger*
   sentence at `code-registry-parse.md:111` — "whether or not a `from` clause
   follows the specifier list — a `from`-less list is a shape imports.md
   defines no production for" — is re-derived in the same commit, because the
   premise it names stops being true. Rewording that row's *Trigger* is a
   trigger change, not a *Message* reword, and stays inside the same
   carve-out (`source-language-stability.md:25`).
2. **`.theta` scope stops gaining export names.** `collectIdentRoots`
   (`src/parser/theta-document.ts:4402–4407`) and `checkLexicalCallSites`
   (`:5054–5058`) fold `export` symbols into the root scope. After the fix
   every surviving `export` is from-bearing and lives in a `.thetalib`, where
   the specifier still creates no local binding (imports.md `:29`), so the
   `export` arm of both walks is unreachable for a legal `.theta` and
   over-broad for a legal `.thetalib`. Whether to narrow it to `import` is
   settled in the same change; the measured control
   (`theta/parse/unknown-identifier` on a bare `Ghost("x")`) is the pin.
3. **The empty-path consumers are re-derived, not left dead.**
   `extractThetaLibForms`' `fromPath: stmt.path` (`import-static-checks.ts:118`)
   and `collectCallableClosureSources`' unguarded `statement.path` resolution
   (`production-composition.ts:1876–1881`) both currently accept `""`. After
   the fix no parsed `ExportDecl` reaching them has an empty path; the fix
   records that as an invariant at both sites rather than leaving two readers
   whose input class silently narrowed.
4. **The user-facing route is corrected in the same commit.**
   `docs/guide.md:186–188` points at `docs/reference/grammar.md#source-files`
   for "the resolution and re-export rules", which that section does not
   carry. Either the link moves to `docs/how-to/import-a-thetalib-module.md`
   (whose `:68–69` already routes to `docs/spec_topics/imports.md`) or the
   reference gains the production. A production added to imports.md with the
   guide still pointing at a page that lacks it leaves the reader where they
   are today.
5. **Test witness — unit, offline, no live provider.** Every fixture in
   §Reproduction is a `parseThetaDocument` or `checkThetaImports` call.
   Required beyond the probes: the new code raised once for each degenerate
   spelling (`export { x }`, `export {}`, `export`, `export { x } from`) and
   for the from-less `import`; the from-bearing controls
   (`export { x } from "./m.thetalib"`, `import { x } from "./m.thetalib"`)
   proven still silent; the imports.md `:36` pair re-run so the control's
   `theta/parse/import-unknown-symbol` is pinned and the previously-silenced
   case is now refused at the lib; the `.theta` expression-position control
   pinned in both directions; and the bug-0040 co-emission row, since
   constraint 1 forbids narrowing that check.
6. **No behaviour changes for a file that loads cleanly today.** The refusal
   applies only to inputs the corpus does not contain, so no lowered bytes, no
   minted `__inline_<slug>` name and no registered callable moves. The fix
   states that as a measured claim (`rg` over the 34 corpus files) rather than
   an assumption.

### The alternative, and why the evidence does not select it

The other route is to give the form a production and semantics — a re-export
of a local binding. It is refused on what the tolerance delivers today, class
by class:

- For a **locally declared** name the form is already a no-op, because
  imports.md `:27` auto-exports every top-level `schema` / `enum` / `fn` and
  there is no privacy modifier to opt out of. Measured: the export line
  changes neither the diagnostics nor the materialised set.
- For a **plain import's local** the form would have to *reverse* imports.md
  `:36`, which states the opposite unconditionally. That is a language
  addition, not a clarification: the page would have to be amended, not
  satisfied. And the addition does not work today — the measured case
  materialises nothing, so specifying it requires a second change to
  `materializeSymbol` before any author could use it.
- For a name declared **nowhere** the form must be refused under any
  semantics, so a production alone closes nothing; the unknown-symbol check
  would additionally have to run over the re-exporting file's own local names.

Specifying therefore costs a spec amendment plus two implementation changes to
deliver one capability the corpus does not use, and leaves the third class
needing a diagnostic regardless. Refusing costs one diagnostic and one
production, closes all three classes, and matches what every other page in the
corpus already says the form is.

## Non-goals

- **Re-export materialisation.** A resolvable, spec-defined
  `export { greet } from "./mid.thetalib"` also materialises nothing into an
  importing theta (measured in §Reproduction), so a downstream
  `import { greet }` passes IMP-3 and binds nothing there too. That is a
  distinct gap between `computeThetaLibExports` and `materializeSymbol`,
  reachable from a form the spec does define, and it is unfiled. This report
  neither fixes nor depends on it: refusing the from-less shape removes the
  input class that has no source file, and leaves the from-bearing class
  exactly as found.
- **Whether `export` belongs in a `.theta` at all.** imports.md `:13`
  permits `export` as a `.thetalib` top-level form and says nothing about
  `.theta` files, where nothing can read an export. The from-bearing form in a
  `.theta` parses clean today and keeps doing so under this fix. Deciding
  whether a `.theta` `export` is itself an error is a separate adjudication;
  constraint 2 covers only the identifier-scope side effect.
- **The `let x: Ghost` annotation position.** `let z: Ghost = 1` raises
  nothing with or without an export line (measured), so the annotation
  position refuses no unresolved named type at all. That is not this form's
  doing and is not touched here.
- **`theta/parse/import-reserved-synthesised-name`'s emission set.** Bug 0040
  §Fix scoped that check to the specifier's local binding on both statement
  kinds, deliberately including the from-less spelling. Constraint 1 keeps it.
  Its round-3 adjudication — that a lib must not offer a name no client may
  bind — is unaffected by which spellings the grammar admits.
- **The `import`-side path checks.** A from-less `import` is dropped by
  `if (!spec.endsWith(".thetalib")) continue`
  (`src/extension/import-static-checks.ts:355–359`) before any resolution, so
  IMP-1 / IMP-2 / IMP-4 are not reached and are not changed by refusing the
  shape earlier.

## Provenance

- Origin: the bug 0040 fix implementation (commit `aef82bde`, 0.50.0).
  Recorded twice as flagged-not-filed: `.pi/tmp/fixes/0040-report.md`
  §Residuals item 4 — "The from-less `export { … }` form is not a spec-defined
  production. `imports.md` spells the re-export with `from`; `grammar.md`
  carries no `ExportDecl` production; the parser's `from` is optional. …
  A grammar-side clean-up (either specify the production or reject the shape)
  is a separate concern. Unfiled." — and
  [0040](./0040-inline-slug-def-namespace-not-reserved.md) §Fix (0.50.0)
  Residuals (iv) (`:485–489`). This report is that filing, and adds what the
  residual does not state: the export-set and materialisation consequences,
  the reversal of imports.md `:36`, the `.theta` identifier-scope reach, the
  degenerate spellings, the empty path at the closure walk, the corpus
  census, and the evidence that selects between the two routes. The same fix
  report's §Review rounds records the round-2 finding that first met the shape
  ("The check also fires on a bare `export { X }` with no `from` clause (the
  parser's `from` is optional), an input neither the registry *Trigger* nor
  lexical.md named").
- Spec: `docs/spec_topics/imports.md:13` (permitted `.thetalib` top-level
  forms), `:27` (§Visibility — auto-export), `:29` (§Re-exports — "a dedicated
  form that creates no local binding"), `:32`, `:33` (the two examples, both
  `from`-bearing), `:36` (the negative rule), `:38` (§Unknown imported symbol
  and `theta/parse/import-unknown-symbol`); `docs/spec_topics/grammar.md:3`
  (the appendix's scope and the topic-page-owns rule), `:5` (the `::=`
  notation), `:195` (the `///`-placement rule, the page's only mention of
  `import` / `export`); `docs/spec_topics/invocation.md:87` (the re-export
  spelling in the residence rule);
  `docs/spec_topics/diagnostics/code-registry-parse.md:110`
  (`theta/parse/import-unknown-symbol`), `:111`
  (`theta/parse/import-reserved-synthesised-name` and its from-less sentence),
  mirrored at `docs/reference/diagnostics.md:160`;
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out);
  `docs/plan_topics/coverage-matrix.md:172` (`cka-48`).
  User-facing: `docs/reference/grammar.md:10–30` (§Source files, the section
  `docs/guide.md:186–188` names for "the resolution and re-export rules");
  `docs/how-to/import-a-thetalib-module.md:11` (implicit export), `:68–69`
  (the route to `docs/spec_topics/imports.md`).
- Implementation evidence at `aef82bde`: `src/parser/theta-document.ts:664–672`
  (`ExportDecl`), `:1796–1799` (the shared dispatch), `:2671–2769`
  (`parseImportExport`: `:2682–2740` the specifier loop, `:2724–2730` bug
  0040's per-specifier check, `:2741–2743` the optional `from`, `:2744–2761`
  the path branch, `:2762–2768` the node), `:4383–4411` (`collectIdentRoots`),
  `:5030`, `:5048–5059` (`checkLexicalCallSites`);
  `src/extension/import-static-checks.ts:77–85` (`collectImports`),
  `:106–133` (`extractThetaLibForms`), `:145–177` (`materializeSymbol`),
  `:279` (the resolution loop),
  `:324` (the cycle walk), `:355–359` (the non-`.thetalib` skip),
  `:388–399` (IMP-3), `:405–415` (IMP-6 / IMP-7 materialisation);
  `src/parser/imports.ts:609–619` (`computeThetaLibExports` and its
  contract), `:632–637` (`thetalibLocalBindings`, no `src/` caller);
  `src/runtime/lexical-environment.ts:394–400` (the import resolution arm);
  `src/runtime/statement-executor.ts:1499–1506` (both kinds inert);
  `src/extension/production-composition.ts:1849–1886`
  (`collectCallableClosureSources`, `:1870–1872` the read failure,
  `:1876–1881` the export-path visit).
- Test and corpus evidence at `aef82bde`:
  `tests/whole-program-parser.test.ts:254–262` (the cka-49 fixture, the one
  theta-source export in `tests/`, from-bearing), `:276–287` (its
  `ImportDecl` / `ExportDecl` assertions);
  `tests/export-visibility.test.ts:111`,
  `:133`, `:174` (the cka-48 unit tests, which construct specifier records and
  parse no source); `tests/inline-slug-name-reservation.test.ts:357` (the
  `export `-tolerant binding-site helper, unexercised);
  `tests/subagent-fn.test.ts:1581–1614` (the in-memory `FileSystem` shape this
  report's probes reuse); `tests/committed-fixture-parse-gate.test.ts:50–60`
  (the repo-wide walk, `.theta` files only), `:66–70` (its repo-relative
  fixture list); the corpus census
  `rg --files --glob '*.theta' --glob '*.thetalib' .` (34 files) and
  `rg -n 'export' --glob '*.theta' --glob '*.thetalib' .` (one hit, the word
  "exported" in a comment at
  `tests/live/acceptance/fixtures/acc-lib.thetalib:2`).
- Reproduction: scratch vitest at `aef82bde` — the three input classes with
  their controls; the alias pair; the from-bearing materialisation contrast
  (resolvable and aliased); six parse-only spellings with their nodes; the
  three bug-0040 reserved-name rows; nine `.theta` scope rows with their
  controls; and the empty-path resolution. Run on the outputs quoted above,
  then deleted per scratch policy. No file in the tree was written by the
  probes.
