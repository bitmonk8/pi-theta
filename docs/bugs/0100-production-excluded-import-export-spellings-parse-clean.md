# Bug 0100 — Four spellings the published `ImportDecl` / `ExportDecl` productions exclude parse with zero diagnostics: `import from "./m.thetalib"` and `export from "./m.thetalib"` carry no braces and no specifier; `import {} from "./m.thetalib"` resolves and registers a `.thetalib` while binding nothing; `import { a as } from "./m.thetalib"` drops the dangling `as` so the SOURCE name binds and the author's alias is silently absent — the same drop makes a `.thetalib` publish `greet` where its author wrote `greet as hello`

- **Status:** fixed (0.134.0). §Fix was constraint-pinned: the approach is a
  parse-time refusal of each spelling at error severity, and one disposition was
  left to the run — whether `theta/parse/import-missing-from-clause`'s *Trigger*
  widens or one new row covers the malformed specifier list. §Fix (0.134.0) below
  records the adjudication and what shipped. No ordering dependency:
  [0058](./0058-fromless-export-form-parses-without-spec-production.md) shipped
  in 0.60.0 and published the productions this report measures against.
- **Sev/Diff estimate:** S1/D3 — inputs the spec's closed productions exclude
  are accepted with no diagnostic and one of them silently changes which name
  binds; D3 because the registry disposition is adjudicated in-run.
- **Kind:** parser tolerance against a closed production. One defect shape,
  four spellings, three shape classes.
  1. *No specifier list at all.* `docs/spec_topics/imports.md:37`, `:38` make
     `"{" ImportSpec ("," ImportSpec)* ","? "}"` mandatory on both
     declarations. `parseImportExport` guards the whole list with
     `if (this.isPunct("{"))` (`src/parser/theta-document.ts:2798`) and has no
     else, so `import from "./m.thetalib"` and `export from "./m.thetalib"`
     parse to a node with `symbols: []` and a valid `path`.
  2. *An empty specifier list.* The same productions require one `ImportSpec` /
     `ExportSpec` before the `("," …)*` repetition. The specifier loop
     (`:2800`) admits zero iterations and nothing counts them, so
     `import {} from "./m.thetalib"` parses clean — and, because
     `checkThetaImports`' early return tests the DECL count, not the specifier
     count (`src/extension/import-static-checks.ts:291`), the statement then
     resolves the lib (IMP-1), propagates the lib's registration errors
     (IMP-4), and seeds the cycle graph (IMP-5) while materialising nothing.
  3. *A dangling `as`.* `imports.md:39`, `:40` admit `Ident` or
     `Ident "as" Ident` and nothing else. The alias branch
     (`theta-document.ts:2811–2822`) consumes `as` and guards the alias token
     with no else (`:2814–2821`), so `local` stays `source`:
     `import { a as } from "./m.thetalib"` binds `a`, and the name the author
     wrote the alias for is absent.
- **Related:**
  - [0058](./0058-fromless-export-form-parses-without-spec-production.md) —
    fixed (0.60.0), the filing origin. It published the four productions in
    imports.md §Re-exports, mirrored them into
    `docs/reference/grammar.md` §Imports and re-exports, and refused the
    from-less form as `theta/parse/import-missing-from-clause`. Its §Fix
    *Residuals* item (i) (`:306–312`) records these four spellings and why it
    left them: "Not refused here on purpose — they load cleanly today, so
    refusing them is outside §Fix's GOV-15 refused set and would breach
    constraint 6. Same shape as the defect this report filed, one level down;
    unfiled." This report is that filing. The new spec prose makes no false
    claim about the four spellings; the defect is that the parser admits shapes
    the closed productions exclude, silently.
- **Affected** (every citation verified at HEAD `069c0117`, 0.60.0):
  - `src/parser/theta-document.ts:2787–2903` — **the frame.**
    `parseImportExport(kind: "import" | "export")`, reached for both keywords
    from one dispatch pair (`:1839`, `:1841`). Three sites admit the four
    spellings: `:2798` opens the specifier list only when a `{` is present and
    has no else, so the list is optional (class 1); `:2800–2852` is a `while`
    over the list contents with no floor on iteration count and a catch-all
    `this.advance()` for any token it does not classify (`:2849–2851`), so an
    empty list and an unparsed `as` residue both pass (classes 2 and 3);
    `:2811–2822` consumes `as` and takes the alias only inside
    `:2814–2821`, leaving `local = source` when the next token is not an
    ident-or-keyword (class 3). `:2857–2880` consumes the trailing clause and
    records `hasFromKeyword` / `hasPathLiteral`; `:2881` is the shared statement
    range; `:2896–2902` returns the node.
  - `src/parser/imports.ts:364–381` — `checkImportMissingFromClause`, the 0058
    refusal. Its predicate is `hasFromKeyword && hasPathLiteral` (`:369–371`)
    and nothing else, so it answers only the trailing clause: all four
    spellings in classes 1–3 either satisfy it (three of them carry
    `from "./m.thetalib"`) or are outside what it inspects. `:346` is the code,
    `:347–348` the *Message*, which names a missing `from` clause.
  - `src/parser/theta-document.ts:651–673` — `ImportDecl` / `ExportDecl`. Both
    document `symbols` as "the LOCAL binding names — the `as` alias where
    present, else the source name" (`:656–658`) and "the downstream-visible
    names — the `as` alias where present, else the source" (`:669`). For a
    dangling `as` the alias IS present in the source text and the field carries
    the source name, so the node cannot express what was written.
  - `src/extension/import-static-checks.ts:77–85` — `collectImports`, which
    collects every `kind === "import"` statement regardless of specifier count.
  - `src/extension/import-static-checks.ts:281–293` — `checkThetaImports`' entry
    and its early return: `importDecls.length === 0 || input.sourcePath ===
    undefined`. A zero-specifier import is one decl, so the pass proceeds.
  - `src/extension/import-static-checks.ts:360–429` — the per-decl loop a
    zero-specifier import drives end to end: the non-`.thetalib` skip
    (`:366–368`), IMP-1 resolution (`:370–378`), IMP-4 registration-error
    propagation (`:381–392`), IMP-3 over an empty specifier list
    (`:394–410`), the materialisation loop over an empty specifier list
    (`:416–426`), and the cycle walk (`:429`). Every one runs; the last two
    produce nothing.
  - `src/extension/import-static-checks.ts:106–133` — `extractThetaLibForms`,
    which records one `ReExportSpecifier` per specifier with
    `exported: specifier.local`. For a dangling `as` that is the source name,
    so the module's downstream-visible name is the source symbol.
  - `src/parser/imports.ts:652–657` — `computeThetaLibExports`, which unions
    declaration names with `reExports.map(r => r.exported)`. This is the whole
    of `theta/parse/import-unknown-symbol`'s admission test at
    `src/extension/import-static-checks.ts:399–410`, so the dropped alias is
    what a downstream importer is matched against.
  - `src/parser/imports.ts:444` — `checkImportNameCollisions`, the union check
    over every decl's specifiers (`import-static-checks.ts:437–443`). The
    dropped alias collapses two aliased imports onto one local name and
    reinstates a collision the alias existed to avoid (measured in
    §Reproduction).
  - `src/parser/imports.ts:411` — `checkImportUnknownSymbols`, keyed on
    `specifier.source`, which the drop leaves untouched. The refusal a
    mis-sourced dangling-alias specifier draws therefore still names the source
    symbol.
  - `src/parser/theta-document.ts:2840–2846` — bug 0040's per-specifier
    `checkImportReservedSynthesisedName` call, which reads the LOCAL binding.
    The drop makes the source name the local, so
    `import { __inline_<16hex> as } from "./m.thetalib"` is refused where
    `import { __inline_<16hex> as x } from "./m.thetalib"` is silent (measured).
  - `src/parser/theta-document.ts:4528–4548`, `:5214–5228` —
    `collectIdentRoots` and `checkLexicalCallSites`, narrowed to `import` by
    0058 §Fix constraint 2. Both fold `s.symbols`, so a dangling `as` seeds the
    source name into the whole-file identifier root scope and `fnImportDecls`,
    and the intended alias at a call site raises
    `theta/parse/unknown-identifier` (measured).
  - `docs/spec_topics/imports.md:36–41` — the four productions, all
    from-bearing, braces and at least one specifier mandatory. `:43–46` — the
    refusal prose, scoped to "A specifier list with no `from` clause" and
    enumerating the bare keyword, the empty list, and a `from` with no
    path-literal token; three of the four spellings carry a `from` clause with a
    path literal, so the sentence does not reach them and
    `import from "./m.thetalib"` sits between the two readings. `:29` —
    §Re-exports' one-form sentence; `:31–34` — its two examples, both aliased or
    plain and both fully specified. `:48` — the negative rule. `:50` —
    §Unknown imported symbol. `:13` — the permitted `.thetalib` top-level forms,
    which name `import` / `export` as permitted keywords, so the top-level gate
    (`theta/parse/thetalib-top-level-statement`) does not reach any of the four.
  - `docs/reference/grammar.md:31–55` — the user-facing mirror 0058 added:
    `:33–38` the same four productions, `:51–53` the same refusal sentence with
    the same scope. `:588–591` — its *Provenance* entry naming 0058.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:113` — the
    `theta/parse/import-missing-from-clause` row. Its *Trigger* covers "the
    `from` keyword absent, or present with no `string` token after it" and
    "Covers the degenerate bare-keyword (`import`, `export`) and empty-list
    (`import {}`, `export {}`) spellings" — the no-`from` spellings only. `:112`
    — the reserved-name row, whose *Trigger* already states the co-emission
    rule. `:111` — `theta/parse/import-unknown-symbol`. `:110` —
    `theta/parse/import-name-collision`. Mirrored at
    `docs/reference/diagnostics.md:160–162` (no *Trigger* column there).
  - `docs/spec_topics/grammar.md:3` — the appendix's scope sentence, which
    leaves an owned surface to its topic page. The appendix carries no
    `ImportDecl` / `ExportDecl`, so imports.md is the sole owner of the
    productions these spellings violate.
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate — no diagnostic of effective severity `E`),
    `:25` (the diagnostic-registry carve-out, in scope for "inputs that did not
    previously emit the added code");
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2).
  - `tests/import-export-from-clause-required.test.ts` — 0058's offline witness.
    Its group (b) from-bearing controls are `export { greet } from`,
    `import { greet } from` and `export { greet as hello } from` (`:432–439`);
    none of the four spellings appears anywhere in the file, so no shipped test
    pins them in either direction.
  - **The corpus.** 34 committed `.theta` / `.thetalib` files
    (`rg --files --glob '*.theta' --glob '*.thetalib' .`). Two `import`
    statements, both fully specified and from-bearing
    (`docs/examples/import-thetalib.theta:7`,
    `tests/live/acceptance/fixtures/acc-imports-invoke.theta:7`); the only
    occurrence of the token `export` is the word "exported" in a comment
    (`tests/live/acceptance/fixtures/acc-lib.thetalib:2`). Zero occurrences of
    any of the four spellings. The committed-fixture parse gate walks `.theta`
    files only (`tests/committed-fixture-parse-gate.test.ts:50–60`), so a
    `.thetalib` carrying one is outside it either way.
- **Observed at:** `0.60.0` (HEAD `069c0117`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving the real `parseThetaDocument`
  (production-shaped `ParseThetaDocumentDeps`) and the real `checkThetaImports`
  over an in-memory `FileSystem` double exposing `readdir` / `readBytes`;
  written, run, deleted.

## Summary

0058 published the `ImportDecl` / `ExportDecl` / `ImportSpec` / `ExportSpec`
productions in `docs/spec_topics/imports.md:36–41`, mirrored into
`docs/reference/grammar.md:33–38`. All four are from-bearing; the two
declarations make braces and at least one specifier mandatory; `ImportSpec` and
`ExportSpec` admit `Ident` or `Ident "as" Ident`. The refusal 0058 shipped,
`theta/parse/import-missing-from-clause`, covers one exclusion: a specifier list
with no `from` clause. The productions exclude more than that, and the parser
admits the difference with no diagnostic:

- `import from "./m.thetalib"` and `export from "./m.thetalib"` — no braces, no
  specifier. Both parse to `{path: "./m.thetalib", symbols: [], specifiers: []}`.
- `import {} from "./m.thetalib"` — braces, zero specifiers. Parses clean, and
  the load pass then resolves the lib, propagates the lib's own registration
  errors, and walks the cycle graph while materialising nothing.
- `import { a as } from "./m.thetalib"` — a dangling `as`. Parses clean with
  `symbols: ["a"]` and `specifiers: [{source: "a", local: "a"}]`: the `as` is
  consumed and the alias is dropped, so the source name binds.

The first three are accepted no-ops or accepted resolutions. The fourth changes
what the program means. `local` is what the identifier scope, the collision
check, the reserved-name check, materialisation and — on the `export` side — the
module's downstream-visible export set are all keyed on, so dropping the alias
silently substitutes the source name at every one of them. Measured
consequences: `import { a as } from "./lib.thetalib"` beside a local `fn a`
draws `theta/parse/import-name-collision` where the author's spelling
`import { a as b }` loads clean; two dangling aliases from two libs collapse
onto one name and collide; `import { __inline_<16hex> as } from …` draws bug
0040's reserved-name refusal where the aliased spelling escapes it; a call to
the intended alias raises `theta/parse/unknown-identifier`; and a `.thetalib`
whose author wrote `export { greet as hello } from "./mid.thetalib"` with a
dangling `as` publishes `greet`, so a downstream `import { hello }` is refused
as an unknown symbol.

This is the shape 0058 fixed, one level down. 0058 left it deliberately: all
four load cleanly today, so refusing them was outside its §Fix's GOV-15 refused
set and would have breached its constraint 6.

## Reproduction

Offline, at `069c0117`. Scratch vitest: the real `parseThetaDocument` and the
real `checkThetaImports` over an in-memory `FileSystem` exposing `readdir` /
`readBytes`, in the shape `tests/subagent-fn.test.ts:1581–1614` uses. Parse rows
are for `/proj/lib.thetalib` (a `.thetalib`, so `import` / `export` are
permitted top-level forms and the top-level gate stays silent). Load rows are
`/proj/app.theta` with frontmatter `model: "sonnet"` + `mode: prompt`, libs
beside it; `materialised` is `checkThetaImports(...).imports`, `diags` is its
`diagnostics`.

### The four spellings, parse only

```
@@ "import from \"./m.thetalib\""          diags []  node {kind:"import",path:"./m.thetalib",symbols:[],specifiers:[]}
@@ "export from \"./m.thetalib\""          diags []  node {kind:"export",path:"./m.thetalib",symbols:[],specifiers:[]}
@@ "import {} from \"./m.thetalib\""       diags []  node {kind:"import",path:"./m.thetalib",symbols:[],specifiers:[]}
@@ "export {} from \"./m.thetalib\""       diags []  node {kind:"export",path:"./m.thetalib",symbols:[],specifiers:[]}
@@ "import { a as } from \"./m.thetalib\""  diags []  node symbols ["a"]  specifiers [{source:"a",local:"a"}]
@@ "export { a as } from \"./m.thetalib\""  diags []  node symbols ["a"]  specifiers [{source:"a",local:"a"}]
```

Two further spellings the same specifier loop admits, both excluded by
`ImportSpec`:

```
@@ "import { a as , b } from \"./m.thetalib\""    diags []  symbols ["a","b"]
@@ "import { a as as b } from \"./m.thetalib\""   diags []  symbols ["a","b"]
```

The `as` is dropped and the comma resumes the list; a second `as` is consumed by
the loop's catch-all `advance()` and `b` becomes its own specifier.

Controls — the shipped refusal, the shipped path check, and the from-bearing
production:

```
@@ "import"                                ["error theta/parse/import-missing-from-clause: import / export specifier list requires a 'from' clause with a .thetalib path literal"]
@@ "import {}"                             the same code
@@ "import { a } from"                     the same code
@@ "import from \"./m.theta\""             ["error theta/parse/import-non-thetalib-extension: import path './m.theta' does not end in .thetalib"]
@@ "import from \"\""                      ["error theta/parse/import-non-thetalib-extension: import path '' does not end in .thetalib"]
@@ "import { a as b } from \"./m.thetalib\""  diags []  symbols ["b"]  specifiers [{source:"a",local:"b"}]
@@ "import { a } from \"./m.thetalib\""       diags []  symbols ["a"]
```

The path check fires independently of the specifier list, so a brace-less
`import from ""` is refused for its literal and not for its shape.

### The zero-specifier import at the load pass

```
@@ lib `fn greet(x: string) { x }`
   app `import {} from "./lib.thetalib"`          diags []  materialised []
   app `import from "./lib.thetalib"`             diags []  materialised []
   app `import { greet } from "./lib.thetalib"`   [control]  diags []  materialised [{"name":"greet","kind":"fn"}]

@@ lib `let x = 1` + `fn greet(x: string) { x }`               [an illegal `.thetalib` top-level form]
   app `import {} from "./lib.thetalib"`   diags ["error theta/parse/thetalib-top-level-statement: top-level statement not permitted in .thetalib file; move into a fn body"]
   app `import from "./lib.thetalib"`      the same code

@@ lib `export { Ghost }` + `fn greet(x: string) { x }`         [the shape 0058 refuses]
   app `import {} from "./lib.thetalib"`   diags ["error theta/parse/import-missing-from-clause: …"]

@@ app `import {} from "./missing.thetalib"`   diags ["error theta/load/unresolvable-thetalib-path: cannot resolve .thetalib import './missing.thetalib'"]
@@ app `import {} from "./a.thetalib"`, a imports b, b imports a
                                              diags ["error theta/load/import-cycle: import cycle: a.thetalib → b.thetalib → a.thetalib"]
```

A statement that binds nothing still resolves the lib, propagates the lib's
registration errors per IMP-4, fails IMP-1 on an unresolvable path, and seeds
the IMP-5 cycle graph. Every gate downstream of resolution runs and finds zero
specifiers to check.

### The dangling `as` at the binding sites

```
@@ lib `fn a(x: string) { x }`
   app `import { a as } from "./lib.thetalib"`     diags []  materialised [{"name":"a","kind":"fn"}]
   app `import { a as b } from "./lib.thetalib"`   [control]  diags []  materialised [{"name":"b","kind":"fn"}]

@@ lib `fn a(x: string) { x }`   app also declares `fn a(x: string) { x }`
   app `import { a as b } from "./lib.thetalib"`   [control]  diags []  materialised [{"name":"b","kind":"fn"}]
   app `import { a as } from "./lib.thetalib"`     diags ["error theta/parse/import-name-collision: imported symbol 'a' collides with another import or top-level declaration"]  materialised [{"name":"a","kind":"fn"}]

@@ l1 `fn a(x: string) { x }`   l2 `fn a(x: string) { x }`
   app `import { a as } from "./l1.thetalib"` + `import { a as } from "./l2.thetalib"`
                                                  diags ["error theta/parse/import-name-collision: imported symbol 'a' collides with another import or top-level declaration"]  materialised [{"name":"a","kind":"fn"},{"name":"a","kind":"fn"}]

@@ lib `fn a(x: string) { x }`
   app `import { zz as } from "./lib.thetalib"`    diags ["error theta/parse/import-unknown-symbol: imported symbol 'zz' is not declared or re-exported by './lib.thetalib'"]
```

The alias's purpose is defeated in the direction that matters: the two spellings
that differ only by the missing alias token differ by a refusal the author's
spelling does not draw. The unknown-symbol check is keyed on `source`, so it is
unaffected.

Bug 0040's per-specifier reserved-name check reads the same `local`:

```
@@ "import { __inline_0123456789abcdef as } from \"./m.thetalib\""    ["error theta/parse/import-reserved-synthesised-name: imported symbol '__inline_0123456789abcdef' binds a reserved synthesised name"]  symbols ["__inline_0123456789abcdef"]
@@ "import { __inline_0123456789abcdef as x } from \"./m.thetalib\""  diags []  symbols ["x"]
@@ "import { a as __inline_0123456789abcdef } from \"./m.thetalib\""  the reserved-name code  symbols ["__inline_0123456789abcdef"]
```

### The dangling `as` at a `.thetalib`'s published export set

```
@@ mid `fn greet(x: string) { x }`
   lib `export { greet as hello } from "./mid.thetalib"`  [control]
     app `import { hello } from "./lib.thetalib"`   diags []  materialised []
   lib `export { greet as } from "./mid.thetalib"`
     app `import { hello } from "./lib.thetalib"`   diags ["error theta/parse/import-unknown-symbol: imported symbol 'hello' is not declared or re-exported by './lib.thetalib'"]
     app `import { greet } from "./lib.thetalib"`   diags []  materialised []
   lib `export {} from "./mid.thetalib"`
     app `import { greet } from "./lib.thetalib"`   diags ["error theta/parse/import-unknown-symbol: imported symbol 'greet' is not declared or re-exported by './lib.thetalib'"]
   lib `export from "./mid.thetalib"`
     app `import { greet } from "./lib.thetalib"`   the same code
```

The module publishes `greet` where its author wrote `greet as hello`, so the
refusal lands on the downstream importer that used the documented name. The
empty and brace-less `export` spellings publish nothing, which is consistent
with a zero-length specifier list and is why their defect is admission alone.
`materialised` is empty in every row here including the control: the
from-bearing re-export's materialisation gap is 0058 §Non-goals and is not this
report's (see §Non-goals).

### The dangling `as` in a `.theta`'s identifier scope

Frontmatter `model: "sonnet"` + `mode: prompt`; parse diagnostics only.

```
@@ `import { a as b } from "./lib.thetalib"` + `let r = b("x")` + `r`   [control]  []
@@ `import { a as b } from "./lib.thetalib"` + `let r = a("x")` + `r`   [control]  ["error theta/parse/unknown-identifier: unknown identifier 'a'"]
@@ `import { a as } from "./lib.thetalib"`   + `let r = a("x")` + `r`              []
@@ `import { a as } from "./lib.thetalib"`   + `let r = b("x")` + `r`              ["error theta/parse/unknown-identifier: unknown identifier 'b'"]
@@ `import from "./lib.thetalib"`            + `let r = a("x")` + `r`              ["error theta/parse/unknown-identifier: unknown identifier 'a'"]
@@ `import {} from "./lib.thetalib"`         + `let r = a("x")` + `r`              ["error theta/parse/unknown-identifier: unknown identifier 'a'"]
@@ `let r = a("x")` + `r`                    [control]                            ["error theta/parse/unknown-identifier: unknown identifier 'a'"]
```

The scope entry follows `local`, so the two aliased spellings swap which of the
two names is bound and which is refused. The specifier-less spellings seed
nothing, so the bare-call control is preserved.

## Expected behaviour

- **A form the parser accepts is a form some page defines.**
  `docs/spec_topics/grammar.md:3` leaves an owned surface to its topic page and
  carries no import or export declaration, so `imports.md:36–41` is the sole
  definition. Those four productions are closed: `"{"`, at least one specifier,
  `"}"`, `"from"`, `STRING` on the declarations, and `Ident` or
  `Ident "as" Ident` on the specifiers. Each of the four spellings violates one
  of those requirements, and `docs/reference/grammar.md:33–38` states the same
  grammar to the same reader.
- **The parse-time refusal set matches the productions.** 0058's own §Fix
  premise is that "the `from` clause is part of both productions" and that a
  shape the productions exclude is refused at parse time
  (`imports.md:43–46`). The refusal it shipped covers one exclusion. The
  remaining three exclusions have the same standing in the same grammar, and
  `code-registry-parse.md:113`'s *Trigger* is written for the covered one only —
  a reader who compares the productions with the registry finds no rule for the
  four spellings.
- **`as` binds the alias.** `imports.md:39`, `:40` admit no production in which
  `as` appears and the source name is the binding. `ImportDecl`'s `symbols`
  contract (`theta-document.ts:656–658`) says the field carries "the `as` alias
  where present"; for `import { a as }` the `as` is present and the field
  carries the source name. An input whose intended binding the node cannot
  represent is refused, not reinterpreted.
- **A statement that binds nothing is not a load-bearing statement.**
  `import {} from "./m.thetalib"` and `import from "./m.thetalib"` currently
  reach IMP-1, IMP-4 and IMP-5 and can un-register the importing theta on the
  strength of a statement that binds no symbol. Those gates are correct for a
  conforming `ImportDecl`; the input reaching them is not one.
- **A `.thetalib`'s published export set is what its author wrote.**
  `imports.md:29` gives the re-export one form and `computeThetaLibExports`
  (`src/parser/imports.ts:652–657`) publishes `exported`, the alias. A spelling
  under which the alias token is present and the source name is published makes
  the module's public API differ from its source text with no diagnostic at
  either end.

## Actual behaviour / root cause

**The specifier list is optional and unbounded, and the trailing-clause check is
the only refusal.**

```ts
    if (this.isPunct("{")) {
      this.advance();
      while (!this.isPunct("}") && !this.atEnd()) {
```

`src/parser/theta-document.ts:2798–2800`. The outer `if` has no else, so a
statement with no list at all falls through with `specifiers` and `symbols`
empty; the `while` has no floor, so `{}` produces the same two empty arrays.
Neither fact is read anywhere. The only refusal in the function beyond the path
literal is:

```ts
    const missingFromClause = checkImportMissingFromClause(hasFromKeyword, hasPathLiteral, {
```

`:2889`. `checkImportMissingFromClause` (`src/parser/imports.ts:364–381`)
returns `undefined` for `hasFromKeyword && hasPathLiteral` (`:369–371`) and
inspects nothing else, so `import from "./m.thetalib"`,
`import {} from "./m.thetalib"` and `import { a as } from "./m.thetalib"` all
satisfy it. 0058 scoped that predicate to the trailing clause on purpose — it is
the check its §Fix specified — so this is the refusal's boundary, not a bug
inside it.

**The alias is taken only when the next token is an ident-or-keyword, with no
else.**

```ts
          if (this.isKeyword("as")) {
            this.advance(); // `as`
            const aliasTok = this.peek();
            if (
              (aliasTok.kind === "ident" || aliasTok.kind === "keyword") &&
              aliasTok.text !== "as"
            ) {
              local = aliasTok.text;
```

`:2811–2818`. `local` is initialised to `source` at `:2808`, so when the inner
guard fails the `as` has been consumed and the specifier records
`{source, local: source}` (`:2824–2828`) and pushes `source` into `symbols`
(`:2829`). The loop then continues from wherever the `as` left it: a following
`,` is consumed by the comma arm (`:2847–2848`) and a following `as` by the
catch-all (`:2849–2851`), which is why `{ a as , b }` and `{ a as as b }` both
recover as two specifiers.

**`local` is the key every downstream consumer reads.** In order:
`collectIdentRoots` (`:4540–4548`) and `checkLexicalCallSites` (`:5220–5228`)
fold `s.symbols`; bug 0040's per-specifier check reads `local` (`:2840–2846`);
`checkImportNameCollisions` (`src/parser/imports.ts:444`) compares locals;
`materializeSymbol` binds under `local` (`src/extension/import-static-checks.ts:156`,
called at `:416–426`); and `extractThetaLibForms` (`:106–133`) records
`exported: specifier.local`, which `computeThetaLibExports`
(`src/parser/imports.ts:652–657`) publishes as the module's downstream name.
One dropped token therefore reaches six sites, and each behaves correctly on the
value it is given.

**The load pass counts declarations, not specifiers.**
`checkThetaImports`' early return is `importDecls.length === 0 || input.sourcePath
=== undefined` (`src/extension/import-static-checks.ts:291`), and the per-decl
loop's own guards test the path (`:366`), the resolution (`:375`) and the parse
(`:385`) — never the specifier count. So a zero-specifier import runs IMP-1
(`:370–378`), IMP-4 (`:381–392`), IMP-3 (`:394–410`), the materialisation loop
(`:416–426`) and the cycle walk (`:429`) with an empty specifier array. The two
per-specifier passes iterate zero times; the three whole-file passes do their
full work.

**The productions and the refusal were published together, and only one of them
is enforced.** `imports.md:36–41` states the grammar; `:43–46` states the
refusal and scopes it to "A specifier list with no `from` clause". The three
spellings that carry `from "./m.thetalib"` are outside that sentence's subject,
and `import from "./m.thetalib"` sits between its two readings — it is the bare
keyword the parenthetical names, but it does have a `from` clause. The registry
*Trigger* (`code-registry-parse.md:113`) is written for the same narrower set.
No corpus text claims the four spellings are legal; none refuses them either.

## Why it matters

- **The spec's closed productions are unenforced at four points, with no
  diagnostic.** `imports.md:36–41` is normative grammar published in 0.60.0 and
  mirrored to users at `docs/reference/grammar.md:33–38`. An author who writes
  any of the four spellings gets a clean load, and for three of them a
  functioning program that the grammar says is not a program.
- **The dangling `as` changes which name binds, silently.** This is the only one
  of the four that alters an observable other than the absence of a diagnostic.
  Every site keyed on `local` — identifier scope, call-site classification,
  collision, reserved-name reservation, materialisation, and a `.thetalib`'s
  published export set — is given the source name where the author wrote an
  alias. The measured consequences are a refusal the author's spelling does not
  draw (`import-name-collision`, `import-reserved-synthesised-name`), a refusal
  moved to the wrong name (`unknown-identifier` on the intended alias), and a
  module whose public API differs from its source (`import { hello }` refused
  against a lib whose author wrote `export { greet as hello } from`).
- **A binding-free statement can un-register the importing theta.**
  `import {} from "./lib.thetalib"` propagates the lib's
  `theta/parse/thetalib-top-level-statement`, fails IMP-1 on an unresolvable
  path, and reports IMP-5 cycles — all measured. The diagnostics are correct for
  a conforming import; the statement that summons them binds nothing, so a
  theta's registration turns on a form the grammar excludes.
- **The registry documents a narrower refusal than the grammar states.**
  `code-registry-parse.md:113`'s *Trigger* enumerates the no-`from` spellings.
  Either the four spellings gain a refusal or the productions must be reopened
  to admit them; leaving both is the state 0058 closed one level up.
- **Nothing in the corpus scores it.** Zero of the 34 committed `.theta` /
  `.thetalib` files carry any of the four spellings, and no test in
  `tests/import-export-from-clause-required.test.ts` — 0058's witness — names
  them. The behaviour is reachable only by an author writing the form for the
  first time, and the dangling `as` is the spelling a half-finished rename
  produces.

## Fix

**Refuse each production-excluded spelling at parse time, at error severity.**
`parseImportExport` raises the refusal for a statement whose specifier list is
absent or empty, and for a specifier whose `as` is not followed by an
identifier, so `parseThetaDocument` alone is the witness with no `.thetalib`
resolution required.

*Route.* Extend the seam 0058 established. `checkImportMissingFromClause`
(`src/parser/imports.ts:364–381`) is a pure predicate over facts the parser
already tracks; the two new facts — whether the list was braced and how many
specifiers it produced, and whether an `as` was consumed without an alias — are
available at `theta-document.ts:2798–2856` and `:2811–2822` respectively. A
sibling predicate beside `checkImportMissingFromClause`, or one predicate per
shape class, keeps the refusal unit-testable off the parser and emits onto
`this.diagnostics` beside the existing `validatePathLiteral` and
`checkImportMissingFromClause` calls. The load pass is not the seam:
`collectImports` never collects an `export`
(`src/extension/import-static-checks.ts:77–85`), so an `export from` spelling
would not be seen there at all.

Constraints on any implementation:

1. **The refusal set is enumerated, not inferred.** Measured in §Reproduction and
   refused by this fix: `import from "…"`, `export from "…"`,
   `import {} from "…"`, `export {} from "…"`, `import { a as } from "…"`,
   `export { a as } from "…"`, and the two recovery spellings
   `import { a as , b } from "…"` and `import { a as as b } from "…"`. Every
   spelling the productions admit stays silent, including the trailing-comma
   form `import { a, } from "…"` that `","?` licenses, and 0058's three
   from-bearing controls (`tests/import-export-from-clause-required.test.ts:432–439`).
2. **The refusal's granularity follows the fact it reports.** A missing or empty
   specifier list is a statement-level fact — one diagnostic per statement,
   ranged over the statement, as 0058's is (`theta-document.ts:2881`, `:2889`).
   A dangling `as` is a specifier-level fact — one diagnostic per malformed
   specifier, ranged over that specifier, as bug 0040's reserved-name check is
   (`:2840–2846`). Bug 0040's check keeps its emission set unnarrowed and
   co-emits: `import { __inline_<16hex> as } from "./m.thetalib"` raises the
   reserved-name code today (measured) and raises both after the fix, each
   provable red-able alone.
3. **The registry disposition is adjudicated in the run, and DIAG-4 decides
   it.** Two dispositions are available: widen
   `theta/parse/import-missing-from-clause`'s *Trigger*
   (`code-registry-parse.md:113`), or add one row covering a malformed specifier
   list. The constraint: that code's *Message* is `import / export specifier
   list requires a 'from' clause with a .thetalib path literal`
   (`src/parser/imports.ts:347–348`), and three of the spellings carry a `from`
   clause with a `.thetalib` path literal, so a widened *Trigger* renders a
   message that misdescribes its own input — and DIAG-4 defers a *Message*
   reword to theta 2.0. A new row therefore has to carry the malformed-list
   shapes unless the adjudication finds a message that is true of both sets.
   Either disposition is a DIAG-2 registry edit, mirrored into
   `docs/reference/diagnostics.md` in the same commit, and either way the
   *Trigger* text must state the granularity constraint 2 fixes.
4. **The spec prose is re-derived in the same commit.**
   `imports.md:43–46` and `docs/reference/grammar.md:51–53` both state the
   refusal as "A specifier list with no `from` clause" and enumerate the bare
   keyword, the empty list, and a `from` with no path literal. After this fix
   the refused set also contains a `from`-bearing statement with no braces, one
   with empty braces, and a specifier with a dangling `as`, so both sentences
   are re-derived to name what is refused. The productions themselves
   (`imports.md:36–41`, `docs/reference/grammar.md:33–38`) are unchanged — this
   fix enforces them, it does not amend them.
5. **GOV-15: the refused set is enumerated and the census re-run.** All four
   spellings load cleanly today (measured: parse diags `[]`, and for the
   `import` side a clean load pass against a conforming lib), so they are inside
   GOV-15's loads-cleanly input set
   (`docs/spec_topics/governance/source-language-stability.md:9`) and the
   addition is covered by the diagnostic-registry carve-out (`:25`) for inputs
   that did not previously emit the added code. Two variants are already outside
   that set and stay outside it: `import { a as } from …` beside a colliding
   local name already emits `theta/parse/import-name-collision`, and
   `import { __inline_<16hex> as } from …` already emits
   `theta/parse/import-reserved-synthesised-name`. Measured occurrences in the
   tree: **zero** — 34 committed `.theta` / `.thetalib` files, two `import`
   statements, both fully specified and from-bearing, no `export` statement of
   any form. The census is re-run at the fix baseline as a measured claim, and
   it must reach fixtures that are TypeScript string literals as well as
   committed corpus files (0058's census missed
   `tests/reserved-keyword-type-position.test.ts`, whose keyword matrix
   synthesises a bare `import` / `export` residue; that residue is the shape
   0058 already refuses, `:162`, `:464`, `:519`, so it is unaffected here —
   confirm at the baseline).
6. **Test witness — unit, offline, provider-free.** Every row in §Reproduction
   settles inside one `parseThetaDocument` over a string or one
   `checkThetaImports` over an in-memory `FileSystem`. Required: each spelling
   in constraint 1 refused, with the range asserted per constraint 2; every
   production-admitted spelling proven still silent; bug 0040's co-emission row
   and its aliased control; the dangling-`as` binding rows that the refusal
   makes unreachable pinned as the reason they are unreachable (the collision
   pair, the reserved-name pair, the `.theta` scope pair, and the re-export
   publication pair), so a later narrowing of the refusal reds; and the
   zero-specifier load-pass rows, since refusing the statement removes an input
   that currently drives IMP-1 / IMP-4 / IMP-5.
7. **No invariant is asserted at the readers.** 0058 §Fix constraint 3 recorded
   the reason: `checkThetaImports` pushes a resolved lib's registration errors
   and then calls `extractThetaLibForms` over the same parsed body regardless
   (`src/extension/import-static-checks.ts:388–399`), so a refused-but-parsed
   lib still reaches that reader and an assert there would crash on refused
   input. The same holds for every consumer of `symbols` / `specifiers` named in
   §Affected: the refusal is the observable, the node shape is unchanged, and
   the reader comments record the narrowed input class without guarding it.

## Non-goals

- **The from-bearing re-export's materialisation gap.** A resolvable
  `export { greet as hello } from "./mid.thetalib"` admits a downstream
  `import { hello }` through IMP-3 and materialises nothing (measured again in
  §Reproduction, the control row). That is 0058 §Non-goals and residual (ii),
  reachable from a form the spec does define, and unfiled. Refusing the four
  spellings neither fixes nor depends on it.
- **Whether `.theta` may carry an `export` at all.** `imports.md:13` permits
  `export` as a `.thetalib` top-level form and says nothing about `.theta`
  files. 0058 §Fix constraint 2 removed the identifier-scope side effect
  (`theta-document.ts:4540–4548`, `:5220–5228`); whether the statement itself is
  an error in a `.theta` is a separate adjudication, untouched here.
- **`thetalibLocalBindings` having no `src/` caller.**
  `src/parser/imports.ts:670–675` still models the local-binding set that
  nothing cross-checks against the export set (0058 residual (iii)). Unchanged
  here.
- **The trailing-comma spelling.** `import { a, } from "./m.thetalib"` is inside
  the production (`","?`, `imports.md:37`) and is not in the refusal set.
- **The recovery shape after refusal.** This fix adds diagnostics; it does not
  change what node a malformed statement produces, so `symbols` for
  `import { a as }` stays `["a"]` and the downstream readers see the same value
  they see today. Changing the node would move the refused input's other
  observables and is outside the carve-out constraint 5 relies on.

## Provenance

- Origin: the bug 0058 fix (0.60.0), §Fix *Residuals* item (i)
  (`docs/bugs/0058-fromless-export-form-parses-without-spec-production.md:306–312`),
  which records all four spellings and the reason they were left: "they load
  cleanly today, so refusing them is outside §Fix's GOV-15 refused set and would
  breach constraint 6. Same shape as the defect this report filed, one level
  down; unfiled." This report is that filing, and adds what the residual does
  not state: the dangling `as`'s effect on `local` at six consumer sites, the
  measured collision / reserved-name / identifier-scope / export-publication
  consequences, the zero-specifier import's reach into IMP-1 / IMP-4 / IMP-5,
  the two recovery spellings, the re-run corpus census, and the DIAG-4
  constraint that decides the registry disposition.
- Spec: `docs/spec_topics/imports.md:13` (permitted `.thetalib` top-level
  forms), `:29` (§Re-exports' one form), `:31–34` (its two examples),
  `:36–41` (the four productions), `:43–46` (the refusal prose and its scope),
  `:48` (the negative rule), `:50` (§Unknown imported symbol);
  `docs/spec_topics/grammar.md:3` (the appendix leaves an owned surface to its
  topic page, and carries no import or export production);
  `docs/spec_topics/diagnostics/code-registry-parse.md:110`
  (`import-name-collision`), `:111` (`import-unknown-symbol`), `:112`
  (`import-reserved-synthesised-name` and its co-emission sentence), `:113`
  (`import-missing-from-clause` and its *Trigger*), mirrored at
  `docs/reference/diagnostics.md:160–162`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 and its
  carve-out routing);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
  User-facing: `docs/reference/grammar.md:31–55` (§Imports and re-exports:
  `:33–38` the productions, `:51–53` the refusal), `:588–591` (its *Provenance*
  entry naming 0058).
- Implementation evidence at `069c0117`: `src/parser/theta-document.ts:651–673`
  (`ImportDecl` / `ExportDecl` and their `symbols` contracts), `:1839`, `:1841`
  (the shared dispatch), `:2787–2903` (`parseImportExport`: `:2798` the
  optional brace, `:2800–2852` the specifier loop, `:2811–2822` the alias branch
  with `:2814–2821` the guard that has no else, `:2824–2829` the recorded
  specifier, `:2840–2846` bug 0040's per-specifier check, `:2847–2851` the comma
  arm and the catch-all, `:2857–2880` the trailing clause, `:2881` the shared
  range, `:2889–2893` the 0058 refusal, `:2896–2902` the node),
  `:4528–4548` (`collectIdentRoots`), `:5214–5228` (`checkLexicalCallSites`);
  `src/parser/imports.ts:346–348` (the code and its *Message*), `:364–381`
  (`checkImportMissingFromClause` and its predicate), `:411`
  (`checkImportUnknownSymbols`), `:444` (`checkImportNameCollisions`),
  `:652–657` (`computeThetaLibExports`), `:670–675` (`thetalibLocalBindings`);
  `src/extension/import-static-checks.ts:77–85` (`collectImports`), `:106–133`
  (`extractThetaLibForms`), `:156` (`materializeSymbol`), `:281–293`
  (`checkThetaImports` and its decl-count early return), `:360–429` (the
  per-decl loop: `:366` the extension skip, `:370–378` IMP-1, `:381–392` IMP-4,
  `:394–410` IMP-3, `:416–426` materialisation, `:429` the cycle walk),
  `:437–443` (the collision arm).
- Test and corpus evidence at `069c0117`:
  `tests/import-export-from-clause-required.test.ts` (0058's witness; `:432–439`
  its from-bearing controls; none of this report's four spellings appears in the
  file); `tests/reserved-keyword-type-position.test.ts:162`, `:464`, `:519` (the
  keyword matrix whose swallowed-keyword residue is the bare-keyword shape 0058
  already refuses); `tests/committed-fixture-parse-gate.test.ts:50–60` (the
  repo-wide walk, `.theta` files only);
  `tests/subagent-fn.test.ts:1581–1614` (the in-memory `FileSystem` shape this
  report's probes reuse); the corpus census
  `rg --files --glob '*.theta' --glob '*.thetalib' .` (34 files),
  `rg -n '^\s*(import|export)\b' --glob '*.theta' --glob '*.thetalib' .` (two
  hits: `docs/examples/import-thetalib.theta:7`,
  `tests/live/acceptance/fixtures/acc-imports-invoke.theta:7`, both fully
  specified and from-bearing), and
  `rg -n 'export' --glob '*.theta' --glob '*.thetalib' .` (one hit, the word
  "exported" in a comment at
  `tests/live/acceptance/fixtures/acc-lib.thetalib:2`).
- Reproduction: two scratch vitest probes at `069c0117` — the four spellings and
  their controls parse-only, the two recovery spellings, the zero-specifier
  import at IMP-1 / IMP-4 / IMP-5, the dangling `as` at materialisation /
  collision / unknown-symbol / reserved-name, its effect on a `.thetalib`'s
  published export set, and the seven `.theta` identifier-scope rows. Run on the
  outputs quoted above, then deleted per scratch policy. No file in the tree was
  written by the probes.

## Fix (0.134.0)

**Route adjudication (§Fix constraint 3, decided in-run).** One new registry row,
`theta/parse/import-malformed-specifier-list` (severity `E`, phase `parse`),
carrying all three shape classes. Widening
`theta/parse/import-missing-from-clause`'s *Trigger* was refused on the grounds
constraint 3 names: three of the refused spellings carry a `from` clause with a
`.thetalib` path literal, so that row's *Message* would misdescribe its own
input, and DIAG-4 defers a *Message* reword to theta 2.0. One code carries both
granularities because a single sentence is true of every input it renders on —
including `import { as } from "…"`, which spells no name at all — and because
the *Message* is placeholder-free, so no placeholder sub-rule is engaged and the
closed category table is untouched. The addition is the GOV-15
diagnostic-registry carve-out's ADDITION direction
(`governance/source-language-stability.md` *Diagnostic-registry carve-out*, in
scope "for inputs that did not previously emit the added code").

**Gate adjudication (not in §Fix; decided in-run, and load-bearing).** The
statement-level arm is gated on `hasFromKeyword && hasPathLiteral`. Grounds:
`theta/parse/import-missing-from-clause`'s published *Trigger* already claims the
degenerate bare-keyword (`import`, `export`) and empty-list (`import {}`,
`export {}`) spellings by name, so those keep drawing that one code alone.
Without the gate three shipped whole-list witnesses red — measured under a
deliberate un-gating, then restored:
`tests/import-export-from-clause-required.test.ts` group (a) rows `export` and
`export {}`, and `tests/reserved-keyword-type-position.test.ts` group (a) row a1
(the `stopped("import"/"export", headSwallowedMissingFromClause)` matrix cells).
The specifier-level arm is ungated and co-emits, as constraint 2 requires.

**Evidence staleness.** Every citation in this document is at `069c0117` (0.60.0)
and had drifted: `theta-document.ts` is 7455 lines at the fix baseline and
`parseImportExport` is at `:2994` (not `:2787`), its brace guard `:3008`, its
specifier loop `:3011`, its alias branch `:3023–3036`, bug 0040's per-specifier
check `:3066–3069`, the 0058 refusal `:3115`. The reproduction was re-probed at
the fix baseline before any red was pinned: **zero drift** — every row
reproduces exactly as §Reproduction records it, so no input class had been
discharged by 0040's reserved-form refusal (0.50.0) or by any later fix, and the
whole filed subject was still open.

- What shipped:
  - `src/parser/imports.ts` — new `IMPORT_MALFORMED_SPECIFIER_LIST_CODE` /
    `_MESSAGE` and two pure predicates appended after
    `checkImportMissingFromClause`, in that function's exact shape
    (`(facts…, site: ImportSite): Diagnostic | undefined`), so no pre-existing
    line in the module moves: `checkImportMalformedSpecifierList`
    (statement-level, carrying the gate so it is testable off the parser) and
    `checkImportDanglingAlias` (specifier-level, ungated) — §Fix *Route*'s
    "a sibling predicate beside `checkImportMissingFromClause` … or one predicate
    per shape class".
  - `src/parser/theta-document.ts` — `parseImportExport` records the two facts
    the predicates need (`hasBraces` at the brace guard, per-specifier
    `aliasConsumedWithNoAlias` in the alias branch's previously-empty else) and
    emits straight onto `this.diagnostics`: the specifier arm beside bug 0040's
    per-specifier check, the statement arm beside the 0058 call, ranged over the
    shared statement range — §Fix constraint 2's granularity, exactly.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the new row, after
    `import-missing-from-clause`. Its *Trigger* states all three shapes, both
    granularities, the operational gate (`from` present with a `string` token
    after it — not "a `.thetalib` path literal", which would overclaim: the arm
    co-emits with `theta/parse/import-non-thetalib-extension` on a refused path),
    and both co-emission facts.
  - `docs/reference/diagnostics.md` — the mirror row, same commit (DIAG-2).
  - `docs/spec_topics/imports.md` — §Re-exports' refusal prose re-derived per
    §Fix constraint 4: the two arms, their ranges, and how each meets
    `import-missing-from-clause`. The four productions are unchanged — this fix
    enforces them.
  - `docs/reference/grammar.md` — the mirrored refusal sentence re-derived in the
    user-facing register, with the from-less dangling-`as` co-emission stated
    concretely, plus a §Provenance entry. The productions at §Imports and
    re-exports are unchanged.
  - `tests/import-specifier-list-production-required.test.ts` — new, 36 cells:
    (a0) the DIAG-2 / DIAG-4 registry anchor read from the four sharded pages,
    failing loudly on an absent row; (a) the six statement-arm spellings,
    statement-ranged; (b) the four specifier-arm spellings, specifier-ranged (the
    two ranges asserted to differ, which is what pins constraint 2); (c) every
    production-admitted control still silent, including the `","?`
    trailing-comma form and 0058's three from-bearing controls; (d) the gate
    fence — the three no-`from` spellings' whole code list unchanged; (e) bug
    0040's co-emission and its aliased control; (e2) the from-less dangling-`as`
    co-emission with both codes and both ranges; (f) the dangling-`as` binding
    consequences pinned as the reason they are unreachable, with the node shape
    asserted unchanged per constraint 7 and §Non-goals; (g) the zero-specifier
    statement's reach into IMP-1 / IMP-4 / IMP-5, asserted unchanged beside the
    new refusal.
  - `tests/live/live-production-acceptance.test.ts` — tail-appended H8a cell
    `CELL-E`: a `.theta` whose specifier carries a dangling `as` against a
    resolvable planted `.thetalib` does not register, its `as b` sibling does, and
    the `theta-system-note` channel carries `<code>: <message>` with the message
    read from the registry. Registration-only, zero model turns. Additive only.
- Gates:
  - Witness:
    `npx vitest run tests/import-specifier-list-production-required.test.ts` →
    `Test Files 1 passed (1)`, `Tests 36 passed (36)`. Pre-fix the same file was
    `Tests 20 failed | 14 passed (34)`, every red naming either the absent
    registry row or `expected exactly one
    theta/parse/import-malformed-specifier-list … Rendered diagnostics: []`.
  - Full default suite: `npm test` → `Test Files 332 passed (332)`,
    `Tests 6123 passed (6123)` (baseline at fork 331 / 6087).
  - `npm run typecheck` → clean. `npm run lint` → clean.
  - Live H8a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → `Test Files 1 passed (1)`,
    `Tests 67 passed (67)` (baseline 66), `CELL-E` green in 425 ms.
  - Live H9a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/acceptance/noninteractive-acceptance.test.ts
    tests/live/acceptance/ctor-unresolved-load-refusal.test.ts` →
    `Test Files 2 passed (2)`, `Tests 11 passed (11)` (baseline 11 / 11).
  - GOV-15 census re-run at the fix baseline: 34 committed `.theta` /
    `.thetalib` files, two `import` statements
    (`docs/examples/import-thetalib.theta:7`,
    `tests/live/acceptance/fixtures/acc-imports-invoke.theta:7`), both fully
    specified and from-bearing, no `export` statement of any form — **zero
    flips**. Discharged corpus-wide by
    `tests/committed-fixture-parse-gate.test.ts` (36 cells, green), not by a
    scratch probe. The TypeScript-string-literal sweep constraint 5 demands found
    the newly-refused spellings only in this fix's own two test files and in
    bug-doc prose; the `tests/reserved-keyword-type-position.test.ts` residue is
    the no-`from` bare-keyword shape, which the gate leaves untouched (confirmed
    green unedited).
  - Newly-refused spelling classes, enumerated from the shipped mechanism rather
    than from this document: (i) no specifier list at all on a statement whose
    trailing clause is well-formed; (ii) a braced list that yields zero
    specifiers on such a statement — `{}`, `{ , }`, `{ as }`, and any brace body
    whose tokens are all unclassifiable, e.g. `{ "x" }`, `{ 42 }`; (iii) a
    dangling `as` per malformed specifier, on either keyword and whatever the
    trailing clause looks like. Every class is production-excluded and every one
    loaded cleanly before, so all are inside the addition carve-out.
- Review: 2 rounds. Round 1 (`bug-fix-reviewer`) — DEFECTS(3): the new *Trigger*
  overclaimed the gate as requiring a `.thetalib` path literal where the predicate
  reads any `string` token (measured: `import {} from "./m.theta"` and
  `import from ""` emit the code); the *Trigger* asserted "the two codes never
  co-emit on the same statement" and then contradicted itself one sentence later,
  with the same false partition in both mirrors; and the from-less dangling-`as`
  co-emission the new prose asserts had no witness. Round 2
  (`bug-fix-reviewer-fast`) — CLEAN, with the round-1 remediation verified text by
  text against the predicate and the diff re-audited for regressions.
- Verification: SOLID. (1) The witness reds by arm: neutralising the statement
  predicate reds exactly groups (a) and (g) (11 cells) with (b) green;
  neutralising the specifier predicate reds exactly groups (b), (e), (e2) and (f)
  (10 cells) with (a) green; un-gating the statement arm reds the gate fence (d)
  plus the three shipped protected cells named above; removing the registry row
  reds 22 cells naming the absent row. Every neutralisation restored and
  blob-hash-verified (`src/parser/imports.ts`
  `bdac22d8a67cb8e8bf58e2cea9bfd78303153cf5`, `src/parser/theta-document.ts`
  `38d63bf50520b1aeef626ae456a0e27cfe72e131`). (2) Full suite green. (3) The live
  path is exercised end to end by `CELL-E` and both H9a files, run for real.
  (4) Typecheck and lint clean. `git diff --stat src/extension/` is empty and
  `git diff --stat tests/` shows only the additive live append, so constraint 7
  holds mechanically.
- Residuals:
  1. **Missing- and stray-separator specifier lists stay silent.** Measured on
     this tree: `import { a, , b } from "…"`, `import { , a } from "…"`,
     `import { a b } from "…"`, `import { a as b c } from "…"` and their `export`
     analogues all parse with no diagnostic, because the specifier loop's comma
     arm and catch-all `advance()` recover them into a non-empty specifier list,
     so neither arm has a subject. A non-ident specifier is refused only when it
     leaves the list empty (`{ "x" }`, `{ 42 }` refused; `{ a, 42 }` silent).
     These are production-excluded by `ImportSpec` / `ExportSpec` exactly as the
     eight enumerated spellings are — the same defect shape one level down, in the
     sense 0058 residual (i) meant. Refusing them is outside §Fix constraint 1's
     enumeration and outside this fix's GOV-15 refused set. Unfiled.
  2. **No automated reconciliation covers the `docs/reference/diagnostics.md`
     mirror.** `tests/code-registry.test.ts` reconciles the four sharded
     `spec_topics` pages and synthetic fixtures; nothing machine-checks the
     user-facing mirror row against the registry. This fix's mirror row landed
     and is byte-identical, verified by inspection. Pre-existing gap, not
     introduced here.
  3. **`checkImportDanglingAlias` is a boolean pass-through.** The decision
     (`aliasConsumedWithNoAlias`) is computed in the parser; the predicate only
     packages severity / code / message. Accepted as the seam that keeps the two
     arms' constants and doc-comments beside their `checkImportMissingFromClause`
     and `checkImportReservedSynthesisedName` siblings; its unit surface is a
     boolean, which is the whole of its contract.
  4. **Line-number drift in citing documents.** The `imports.md` and
     `grammar.md` prose insertions (+16 and +15 lines) shift every line anchor
     below them, so line citations into those pages from this and other bug
     documents are stale by that amount. Constraint 4 makes the re-derivation
     mandatory, so the drift is inherent to the fix rather than avoidable; no
     shipped test reads either page by line number (full suite green).
- Discharge notes appended: none. No sibling document's subject was closed here.
- Pinned dispositions / non-goals: every §Non-goals item is untouched — the
  from-bearing re-export's materialisation gap (`export { greet as hello } from`
  still admits a downstream `import { hello }` through IMP-3 and materialises
  nothing, pinned green as control `f-export-set-control`), whether `.theta` may
  carry an `export` at all, `thetalibLocalBindings`' absent `src/` caller, the
  trailing-comma spelling `import { a, } from "…"` (pinned silent in group (c)),
  and the recovery shape (the node a malformed statement produces is byte-for-byte
  what it was; `symbols` for `import { a as }` is still `["a"]`, asserted in
  groups (b) and (f)). Constraint 7 is honoured: no invariant is asserted at any
  reader, and `src/extension/import-static-checks.ts` is unmodified — which is
  why a refused-but-parsed `.thetalib` still reaches `extractThetaLibForms` and
  IMP-4 now propagates the lib's own refusal to its importer, asserted as the
  expected two-diagnostic result in `f-export-set`.
- **Bug 0101 rebase surface.** 0101 is the same parse surface and is NOT closed
  here: nothing in this fix materialises a re-export, resolves an `export`'s path,
  or touches `collectImports`, `materializeSymbol` or `computeThetaLibExports`,
  and the well-formed `export { greet } from` / `export { greet as hello } from`
  spellings stay admitted with the same observables. What 0101 rebases on: four
  new exports in `src/parser/imports.ts`
  (`IMPORT_MALFORMED_SPECIFIER_LIST_CODE`,
  `IMPORT_MALFORMED_SPECIFIER_LIST_MESSAGE`,
  `checkImportMalformedSpecifierList`, `checkImportDanglingAlias`) inserted after
  `checkImportMissingFromClause`, shifting everything below by 71 lines
  (`computeThetaLibExports` moves to `:723–728`); the two new fact-tracking
  variables and two new emission sites inside `parseImportExport`, shifting its
  interior; the new registry row and its `docs/reference/diagnostics.md` mirror
  (a further row lands after it); the re-derived `imports.md` §Re-exports prose
  and its `docs/reference/grammar.md` mirror; and two test surfaces — this fix's
  group (c) and `f-export-set-control` rows, which assert the well-formed
  re-export spellings carry no diagnostic of any code, and the tail-appended
  `CELL-E` in `tests/live/live-production-acceptance.test.ts`.
