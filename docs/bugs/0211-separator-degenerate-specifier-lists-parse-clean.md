# Bug 0211 — Separator-degenerate `import` / `export` specifier lists parse with zero diagnostics on both keywords: `{ a, , b }`, `{ , a }`, `{ a b }` and `{ a as b c }` are production-excluded by `ImportSpec` / `ExportSpec`, and the specifier loop's comma arm and catch-all `advance()` recover each of them into a non-empty specifier list that no arm of bug 0100's refusal has a subject for — so a missing comma binds exactly what a written comma binds, and a name run after an `as` becomes its own specifier that draws `theta/parse/import-unknown-symbol` on a name the author's spelling would never have named

- **Status:** open. §Fix is constraint-pinned: the mechanism to extend is the one
  [0100](./0100-production-excluded-import-export-spellings-parse-clean.md)
  shipped in 0.134.0, and one disposition is left to the run — whether
  `theta/parse/import-malformed-specifier-list`'s *Trigger* widens or a new row
  carries the separator shapes. Measured below: the landed *Trigger*'s three
  shapes do NOT admit these inputs, so an emission-reach-only fix with no
  registry edit is not available. No ordering dependency: 0100 shipped the
  predicates and the fact-tracking this report extends.
- **Sev/Diff estimate:** S1/D3 — inputs the closed productions exclude are
  accepted with no diagnostic and one of them adds a specifier the author did
  not write, which moves which names bind and which refusal fires; D3 because
  the registry disposition is adjudicated in-run.
- **Kind:** parser tolerance against a closed production. One defect shape, four
  measured spellings on each keyword, one mechanism.
  1. *A stray or leading separator.* `docs/spec_topics/imports.md:37`, `:38`
     spell the list as `"{" ImportSpec ("," ImportSpec)* ","? "}"` — one
     specifier between separators, and a single optional trailing comma. The
     specifier loop's comma arm (`src/parser/theta-document.ts:3093–3094`)
     consumes any `,` unconditionally, so `{ a, , b }` and `{ , a }` collapse
     onto the conforming `{ a, b }` and `{ a }`.
  2. *A missing separator.* The same production requires a `,` between
     specifiers. The loop re-enters on the next ident-or-keyword with no
     separator check, so `{ a b }` produces the two specifiers `{ a, b }`
     produces, and `{ a b c d }` produces four.
  3. *A name run after an `as`.* `imports.md:39`, `:40` admit `Ident` or
     `Ident "as" Ident` and nothing else. `{ a as b c }` parses as
     `(a → b)` plus a second specifier `(c → c)`: the alias branch closes at
     `b` and the loop opens a new specifier at `c`.
  4. *A discarded non-name token.* The loop's catch-all `advance()`
     (`:3095–3097`) drops any token it does not classify, so `{ a, 42 }`,
     `{ a "x" b }` and `{ a: b }` parse clean with the junk gone.

  In every case the recovered list is NON-EMPTY and carries no dangling `as`, so
  neither arm 0100 shipped has a subject: `checkImportMalformedSpecifierList`
  returns `undefined` for `hasBraces && specifierCount > 0`
  (`src/parser/imports.ts:405–425`) and `checkImportDanglingAlias` reads a
  per-specifier boolean that is false (`:437–451`).
- **Related:**
  - [0100](./0100-production-excluded-import-export-spellings-parse-clean.md) —
    fixed (0.134.0), the filing origin. Its §Fix *Residuals* item 1 names this
    class by name: "`import { a, , b } from "…"`, `import { , a } from "…"`,
    `import { a b } from "…"`, `import { a as b c } from "…"` and their `export`
    analogues all parse with no diagnostic, because the specifier loop's comma
    arm and catch-all `advance()` recover them into a non-empty specifier list,
    so neither arm has a subject … Refusing them is outside §Fix constraint 1's
    enumeration and outside this fix's GOV-15 refused set. Unfiled." This report
    is that filing. 0100's spec prose makes no false claim about these
    spellings; the defect is that the parser admits shapes the closed
    productions exclude, silently.
  - [0101](./0101-from-bearing-reexport-materialises-nothing.md) — open, the
    same parse surface (`export … from` re-export materialisation). Disjoint
    subject: 0101 is about what a WELL-FORMED re-export materialises, this
    report is about which malformed specifier lists are admitted. 0101's route
    is unsettled and is not predicted here; whichever lands first, the other
    rebases on the same two files.
  - [0058](./0058-fromless-export-form-parses-without-spec-production.md) —
    fixed (0.60.0), which published the four productions this report measures
    against and shipped `theta/parse/import-missing-from-clause`.
- **Affected** (every citation verified at HEAD `af221903`, 0.134.0; symbols are
  the durable anchor, line numbers drift):
  - `src/parser/theta-document.ts` — `parseImportExport(kind: "import" |
    "export")` (`:3016–3165`), reached for both keywords from one dispatch pair
    (`:1971`, `:1973`). **The frame.** Three sites admit the class:
    - `:3031` — the specifier `while`, which re-enters on any
      ident-or-keyword with no separator state. Nothing records whether a `,`
      was seen between two specifiers, so a missing separator is
      indistinguishable from a written one downstream.
    - `:3093–3094` — the comma arm, `else if (t.kind === "punct" && t.text ===
      ",") { this.advance(); }`. Unconditional and uncounted: a leading,
      doubled or free-standing comma is consumed exactly like a separating one.
    - `:3095–3097` — the catch-all `else { this.advance(); }`, which discards
      any other token, so a non-name specifier disappears rather than being
      reported.
    - `:3043–3056` — the alias branch. It closes the specifier at the alias
      token and returns to the loop head, so a further name after the alias
      opens a new specifier rather than ending the specifier the author wrote.
  - `src/parser/imports.ts` — `checkImportMalformedSpecifierList`
    (`:405–425`), 0100's statement arm. Its predicate is
    `hasBraces && specifierCount > 0` → `undefined` (`:415–417`), gated on
    `hasFromKeyword && hasPathLiteral` (`:412–414`). A recovered non-empty list
    is outside it by construction.
  - `src/parser/imports.ts` — `checkImportDanglingAlias` (`:437–451`), 0100's
    specifier arm. Its whole input is the boolean
    `aliasConsumedWithNoAlias`, set only in the alias branch's else
    (`theta-document.ts:3054`). `{ a as b c }` takes the alias, so the boolean
    is false and the arm is silent.
  - `src/parser/imports.ts:384–387` — `IMPORT_MALFORMED_SPECIFIER_LIST_CODE` /
    `_MESSAGE`. The message is `import / export specifier list must carry at
    least one specifier, each 'Name' or 'Name as Alias'`, which is true of a
    separator-degenerate list — `{ a b }` carries neither a `Name` nor a
    `Name as Alias` as its list body — so it renders without a DIAG-4 reword.
  - `src/parser/imports.ts:364–381` — `checkImportMissingFromClause`, whose
    predicate is the trailing clause only. Every spelling in this class carries
    `from "./m.thetalib"`, so it is outside what this predicate inspects.
  - `src/parser/imports.ts:482` — `checkImportUnknownSymbols`, keyed on
    `specifier.source`. It is what refuses the phantom specifier the `as`-run
    shape creates (measured: `{ a as b c }` draws
    `theta/parse/import-unknown-symbol` on `c`).
  - `src/parser/imports.ts:515` — `checkImportNameCollisions`, over the union of
    every decl's locals. The phantom specifier participates, so an `as`-run
    beside a same-named local declaration collides (measured).
  - `src/parser/imports.ts:723` — `computeThetaLibExports`, which publishes
    `reExports.map(r => r.exported)`. A separator-degenerate `export … from`
    therefore publishes the recovered specifier set, including any phantom
    (measured).
  - `src/extension/import-static-checks.ts:106` —
    `extractThetaLibForms`, one `ReExportSpecifier` per recovered specifier.
    `:156` — `materializeSymbol`, which binds under `local`. `:281` —
    `checkThetaImports`, whose early return counts declarations, not
    specifiers, so every recovered list drives IMP-1 / IMP-3 / IMP-4 / IMP-5.
    `:77` — `collectImports`, which never collects an `export`, so the `export`
    side of this class is witnessable at parse only.
  - `docs/spec_topics/imports.md:36–41` — the four productions, unchanged by
    0100. `:43–46` — 0058's from-clause refusal prose. `:48–62` — 0100's
    re-derived prose, which states the refused set as "a specifier list that is
    absent (no braces at all) or that produces zero specifiers" plus "a
    specifier whose `as` keyword is consumed with no following `Ident` alias".
    A separator-degenerate list is neither, so the page's refusal prose does
    not reach it and its productions still exclude it.
  - `docs/reference/grammar.md:34–37` — the user-facing mirror of the
    productions. `:51–62` — the mirrored refusal sentence, the same two shapes
    in the user-facing register.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:121` — the
    `theta/parse/import-malformed-specifier-list` row 0100 added. Its *Trigger*
    enumerates exactly three shapes: "(1) the list is absent entirely — no `{`
    — or (2) the list is present but produces zero specifiers … or (3) a
    specifier's `as` keyword is consumed with no following `Ident` alias". A
    separator-degenerate list has braces, produces one or more specifiers, and
    has no dangling `as`, so it is outside all three. `:120` — the
    `import-missing-from-clause` row, whose *Trigger* is the no-`from`
    complement. Mirrored at `docs/reference/diagnostics.md:170`.
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate — no diagnostic of effective severity `E`),
    `:25` (the diagnostic-registry carve-out, which disposes a *Trigger* change
    "as an addition for inputs newly brought into the code's emission set");
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2, which makes a
    trigger change a spec change and requires the mirror in the same commit).
  - `tests/import-specifier-list-production-required.test.ts` — 0100's witness,
    36 cells. Its group (c) *production-admitted controls* are
    `import { a }`, `import { a as b }`, `import { a, }` and 0058's three
    from-bearing controls (`:645–659`); no cell in the file spells
    `{ a, , b }`, `{ , a }`, `{ a b }` or `{ a as b c }`, so no shipped test
    pins this class in either direction.
  - **The corpus.** 34 committed `.theta` / `.thetalib` files
    (`rg --files --glob '*.theta' --glob '*.thetalib' .`). Two `import`
    statements, both fully specified, comma-separated and from-bearing
    (`docs/examples/import-thetalib.theta:7`,
    `tests/live/acceptance/fixtures/acc-imports-invoke.theta:7`); no `export`
    statement of any form. Zero occurrences of any spelling in this class.
- **Observed at:** `0.134.0` (HEAD `af221903`). Offline, deterministic; no live
  model, no provider. Two scratch vitest probes driving the real
  `parseThetaDocument` (production-shaped `ParseThetaDocumentDeps` via
  `tests/helpers/e2e-s1`'s `parseDeps`) and the real `checkThetaImports` over an
  in-memory `FileSystem` double exposing `readdir` / `readBytes`; written, run,
  deleted.

## Summary

0100 (0.134.0) enforced `ImportDecl` / `ExportDecl` / `ImportSpec` /
`ExportSpec` at three points: an absent specifier list, a list that produces
zero specifiers, and a specifier whose `as` is consumed with no alias. The
productions exclude more than that. They spell the list as
`"{" ImportSpec ("," ImportSpec)* ","? "}"` — one specifier between separators,
exactly one optional trailing comma — and a specifier as `Ident` or
`Ident "as" Ident`. The specifier loop enforces neither the separator nor the
specifier boundary:

- `import { a, , b } from "./m.thetalib"` and `import { , a } from "./m.thetalib"`
  parse clean. The comma arm consumes any `,` unconditionally, so the recovered
  specifier lists are byte-for-byte those of `{ a, b }` and `{ a }`.
- `import { a b } from "./m.thetalib"` parses clean with two specifiers. A
  missing separator is not merely tolerated — it is indistinguishable from a
  written one at every downstream site, and the load pass materialises `fn a`
  and `fn b` exactly as the conforming spelling does (measured).
- `import { a as b c } from "./m.thetalib"` parses clean as `(a → b)` plus a
  second specifier `(c → c)`. This one adds a specifier the author did not
  write: against a lib declaring `a` and `b`, the statement draws
  `theta/parse/import-unknown-symbol: imported symbol 'c' …`, and beside a local
  `fn c` it additionally draws `theta/parse/import-name-collision` on `c`
  (measured). A missing comma can also conjure
  `theta/parse/import-reserved-synthesised-name`:
  `import { a __inline_0123456789abcdef } from "./m.thetalib"` refuses on the
  second name, which the parser invented a separator to produce.
- Non-name tokens inside the list are discarded silently: `{ a, 42 }`,
  `{ a "x" b }` and `{ a: b }` all parse clean with the junk gone. 0100's
  statement arm reaches a non-name specifier only when it leaves the list empty
  (`{ 42 }`, `{ "x" }` refused; `{ a, 42 }` silent).

Every one is production-excluded on both keywords, and the same holds on
`export … from`, where the recovered set is what `computeThetaLibExports`
publishes as the module's downstream-visible API.

The boundary is mechanical: 0100's statement arm fires only on an EMPTY
recovered list and its specifier arm only on a dangling `as`, so any degeneracy
the loop recovers into a non-empty, alias-complete list has no subject in either
arm. `{}` and `{ , }` are refused because the recovered list is empty;
`{ , a }` — the same list with one name added — is silent. `{ a as }`,
`{ a as , b }` and `{ a as as b }` are refused; `{ a as b c }` and
`{ a as b as c }` are silent.

## Reproduction

Offline, at `af221903`. Probe 1: the real `parseThetaDocument` over a
`.thetalib` source (`import` / `export` are permitted top-level forms there,
`imports.md:13`, so no `theta/parse/thetalib-top-level-statement` noise). Each
body was driven on BOTH keywords; `diags` is `doc.diagnostics` rendered
`<severity> <code>`, `symbols` and `specifiers` are read off the first
statement, `specifiers` as `[source, local]` pairs. Verbatim output:

```
"import { a, , b } from \"./m.thetalib\""        diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"import { , a } from \"./m.thetalib\""           diags []  symbols ["a"]  specifiers [["a","a"]]
"import { a b } from \"./m.thetalib\""           diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"import { a as b c } from \"./m.thetalib\""      diags []  symbols ["b","c"]  specifiers [["a","b"],["c","c"]]
"import { a, } from \"./m.thetalib\""            diags []  symbols ["a"]  specifiers [["a","a"]]
"import { , } from \"./m.thetalib\""             diags ["error theta/parse/import-malformed-specifier-list"]  symbols []  specifiers []
"import { ,, a } from \"./m.thetalib\""          diags []  symbols ["a"]  specifiers [["a","a"]]
"import { a,, b } from \"./m.thetalib\""         diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"import { a, , , b } from \"./m.thetalib\""      diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"import { a b c } from \"./m.thetalib\""         diags []  symbols ["a","b","c"]  specifiers [["a","a"],["b","b"],["c","c"]]
"import { a b c d } from \"./m.thetalib\""       diags []  symbols ["a","b","c","d"]  specifiers [["a","a"],["b","b"],["c","c"],["d","d"]]
"import { a as b c as d } from \"./m.thetalib\"" diags []  symbols ["b","d"]  specifiers [["a","b"],["c","d"]]
"import { a as b as c } from \"./m.thetalib\""   diags []  symbols ["b","c"]  specifiers [["a","b"],["c","c"]]
"import { a as as b } from \"./m.thetalib\""     diags ["error theta/parse/import-malformed-specifier-list"]  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"import { a as , b } from \"./m.thetalib\""      diags ["error theta/parse/import-malformed-specifier-list"]  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"import { a, 42 } from \"./m.thetalib\""         diags []  symbols ["a"]  specifiers [["a","a"]]
"import { a \"x\" b } from \"./m.thetalib\""     diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"import { a: b } from \"./m.thetalib\""          diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"import { a b, c } from \"./m.thetalib\""        diags []  symbols ["a","b","c"]  specifiers [["a","a"],["b","b"],["c","c"]]
"import { a } from \"./m.thetalib\""             diags []  symbols ["a"]  specifiers [["a","a"]]
"import { a, b } from \"./m.thetalib\""          diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"import { a as b } from \"./m.thetalib\""        diags []  symbols ["b"]  specifiers [["a","b"]]
"import { a as b, c } from \"./m.thetalib\""     diags []  symbols ["b","c"]  specifiers [["a","b"],["c","c"]]
"import {} from \"./m.thetalib\""                diags ["error theta/parse/import-malformed-specifier-list"]  symbols []  specifiers []
"import { , } from \"\""                         diags ["error theta/parse/import-malformed-specifier-list","error theta/parse/import-non-thetalib-extension"]  symbols []  specifiers []
"import { a as } from \"./m.thetalib\""          diags ["error theta/parse/import-malformed-specifier-list"]  symbols ["a"]  specifiers [["a","a"]]

"export { a, , b } from \"./m.thetalib\""        diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"export { , a } from \"./m.thetalib\""           diags []  symbols ["a"]  specifiers [["a","a"]]
"export { a b } from \"./m.thetalib\""           diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"export { a as b c } from \"./m.thetalib\""      diags []  symbols ["b","c"]  specifiers [["a","b"],["c","c"]]
"export { a, } from \"./m.thetalib\""            diags []  symbols ["a"]  specifiers [["a","a"]]
"export { , } from \"./m.thetalib\""             diags ["error theta/parse/import-malformed-specifier-list"]  symbols []  specifiers []
"export { ,, a } from \"./m.thetalib\""          diags []  symbols ["a"]  specifiers [["a","a"]]
"export { a,, b } from \"./m.thetalib\""         diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"export { a, , , b } from \"./m.thetalib\""      diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"export { a b c } from \"./m.thetalib\""         diags []  symbols ["a","b","c"]  specifiers [["a","a"],["b","b"],["c","c"]]
"export { a b c d } from \"./m.thetalib\""       diags []  symbols ["a","b","c","d"]  specifiers [["a","a"],["b","b"],["c","c"],["d","d"]]
"export { a as b c as d } from \"./m.thetalib\"" diags []  symbols ["b","d"]  specifiers [["a","b"],["c","d"]]
"export { a as b as c } from \"./m.thetalib\""   diags []  symbols ["b","c"]  specifiers [["a","b"],["c","c"]]
"export { a as as b } from \"./m.thetalib\""     diags ["error theta/parse/import-malformed-specifier-list"]  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"export { a as , b } from \"./m.thetalib\""      diags ["error theta/parse/import-malformed-specifier-list"]  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"export { a, 42 } from \"./m.thetalib\""         diags []  symbols ["a"]  specifiers [["a","a"]]
"export { a \"x\" b } from \"./m.thetalib\""     diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"export { a: b } from \"./m.thetalib\""          diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"export { a b, c } from \"./m.thetalib\""        diags []  symbols ["a","b","c"]  specifiers [["a","a"],["b","b"],["c","c"]]
"export { a } from \"./m.thetalib\""             diags []  symbols ["a"]  specifiers [["a","a"]]
"export { a, b } from \"./m.thetalib\""          diags []  symbols ["a","b"]  specifiers [["a","a"],["b","b"]]
"export { a as b } from \"./m.thetalib\""        diags []  symbols ["b"]  specifiers [["a","b"]]
"export { a as b, c } from \"./m.thetalib\""     diags []  symbols ["b","c"]  specifiers [["a","b"],["c","c"]]
"export {} from \"./m.thetalib\""                diags ["error theta/parse/import-malformed-specifier-list"]  symbols []  specifiers []
"export { , } from \"\""                         diags ["error theta/parse/import-malformed-specifier-list","error theta/parse/import-non-thetalib-extension"]  symbols []  specifiers []
"export { a as } from \"./m.thetalib\""          diags ["error theta/parse/import-malformed-specifier-list"]  symbols ["a"]  specifiers [["a","a"]]
```

Reading of the rows, keyword-symmetric throughout:

| spelling | `import` | `export` | delivered |
| --- | --- | --- | --- |
| `{ a, , b }` | silent | silent | 2 specifiers, `{ a, b }`'s |
| `{ , a }` | silent | silent | 1 specifier, `{ a }`'s |
| `{ a b }` | silent | silent | 2 specifiers, `{ a, b }`'s |
| `{ a as b c }` | silent | silent | 2 specifiers: `(a → b)`, `(c → c)` |
| `{ ,, a }`, `{ a,, b }`, `{ a, , , b }` | silent | silent | the conforming list |
| `{ a b c }`, `{ a b c d }` | silent | silent | 3 / 4 specifiers |
| `{ a b, c }` | silent | silent | 3 specifiers |
| `{ a as b c as d }` | silent | silent | `(a → b)`, `(c → d)` |
| `{ a as b as c }` | silent | silent | `(a → b)`, `(c → c)` — the second `as` discarded |
| `{ a, 42 }`, `{ a "x" b }`, `{ a: b }` | silent | silent | junk token dropped |
| `{ a, }` (production-admitted, `","?`) | silent | silent | 1 specifier — correct |
| `{ a }`, `{ a, b }`, `{ a as b }`, `{ a as b, c }` (controls) | silent | silent | correct |
| `{}`, `{ , }` (0100 statement arm) | refused | refused | empty list |
| `{ a as }`, `{ a as , b }`, `{ a as as b }` (0100 specifier arm) | refused | refused | — |
| `{ , } from ""` | refused ×2 | refused ×2 | co-emits with the extension check |

Probe 2: the real `checkThetaImports` over an in-memory `FileSystem`. Libs sit
beside `/proj/app.theta`, whose frontmatter is `model: "sonnet"` + `mode: prompt`
and whose body is the import statement plus `let z = 1` and `z`. `lib.thetalib`
declares `fn a(x: string)` and `fn b(x: string)`. `mat` is
`checkThetaImports(...).imports`. Verbatim output:

```
missing comma both known           "import { a b } from \"./lib.thetalib\""
   parse []
   load  []
   mat   ["fn a","fn b"]
control                            "import { a, b } from \"./lib.thetalib\""
   parse []
   load  []
   mat   ["fn a","fn b"]
stray comma                        "import { a, , b } from \"./lib.thetalib\""
   parse []
   load  []
   mat   ["fn a","fn b"]
leading comma                      "import { , a } from \"./lib.thetalib\""
   parse []
   load  []
   mat   ["fn a"]
as-run phantom                     "import { a as b c } from \"./lib.thetalib\""
   parse []
   load  ["error theta/parse/import-unknown-symbol: imported symbol 'c' is not declared or re-exported by './lib.thetalib'"]
   mat   ["fn b"]
as-run phantom control             "import { a as b } from \"./lib.thetalib\""
   parse []
   load  []
   mat   ["fn b"]
as-run phantom collides with local "import { a as b c } from \"./lib.thetalib\"\nfn c(x: string) { x }"
   parse []
   load  ["error theta/parse/import-unknown-symbol: imported symbol 'c' is not declared or re-exported by './lib.thetalib'","error theta/parse/import-name-collision: imported symbol 'c' collides with another import or top-level declaration"]
   mat   ["fn b"]
reserved via missing comma         "import { a __inline_0123456789abcdef } from \"./lib.thetalib\""
   parse ["error theta/parse/import-reserved-synthesised-name: imported symbol '__inline_0123456789abcdef' binds a reserved synthesised name"]
   load  ["error theta/parse/import-unknown-symbol: imported symbol '__inline_0123456789abcdef' is not declared or re-exported by './lib.thetalib'"]
   mat   ["fn a"]
```

The first three rows are the load-bearing ones: a missing separator and a stray
separator both materialise exactly what the conforming spelling materialises,
with no diagnostic at either phase. The `as`-run rows show the phantom specifier
reaching two checks keyed on it, and the last row shows a missing separator
producing a name that draws bug 0040's reserved-name refusal.

`export … from`, same probe, `mid.thetalib` declaring `fn greet` and `fn other`,
`lib.thetalib` carrying the re-export, `app.theta` importing from `lib`:

```
re-export "export { greet as hello other } from \"./mid.thetalib\"" <- import { hello }
   load  []
   mat   []
re-export "export { greet as hello other } from \"./mid.thetalib\"" <- import { other }
   load  []
   mat   []
re-export "export { greet as hello other } from \"./mid.thetalib\"" <- import { greet }
   load  ["error theta/parse/import-unknown-symbol: imported symbol 'greet' is not declared or re-exported by './lib.thetalib'"]
   mat   []
re-export "export { greet, , other } from \"./mid.thetalib\"" <- import { hello }
   load  ["error theta/parse/import-unknown-symbol: imported symbol 'hello' is not declared or re-exported by './lib.thetalib'"]
   mat   []
re-export "export { greet, , other } from \"./mid.thetalib\"" <- import { other }
   load  []
   mat   []
re-export "export { greet, , other } from \"./mid.thetalib\"" <- import { greet }
   load  []
   mat   []
```

A separator-degenerate re-export's recovered specifier set is what the module
publishes: `export { greet as hello other } from "./mid.thetalib"` publishes
`hello` and `other`, so a downstream `import { other }` is admitted from a
statement no production spells. (`mat` is empty in every re-export row including
the well-formed ones — that materialisation gap is
[0101](./0101-from-bearing-reexport-materialises-nothing.md), not this report;
see §Non-goals.)

## Expected behaviour

- **A form the parser accepts is a form some page defines.**
  `docs/spec_topics/grammar.md:3` leaves an owned surface to its topic page and
  carries no `ImportDecl` / `ExportDecl`, so `imports.md:36–41` is the sole
  definition. `"{" ImportSpec ("," ImportSpec)* ","? "}"` requires a `,`
  between two specifiers and admits exactly one optional trailing comma;
  `ImportSpec` / `ExportSpec` admit `Ident` or `Ident "as" Ident` and nothing
  else. Every spelling in this class violates one of those requirements, and
  `docs/reference/grammar.md:34–37` states the same grammar to the same reader.
- **The refusal set matches the productions.** 0100's premise, now shipped, is
  that a specifier-list shape the closed productions exclude is refused at
  parse time at error severity. It enforced the shapes it enumerated. The
  separator and specifier-boundary requirements have the same standing in the
  same production, and `code-registry-parse.md:121`'s *Trigger* is written for
  the enumerated shapes only — a reader who compares the productions with the
  registry finds no rule for this class.
- **A missing separator is not a separator.** `import { a b }` currently
  delivers what `import { a, b }` delivers, at parse and at the load pass. An
  input the grammar excludes must not be silently equated with a distinct input
  the grammar admits.
- **A specifier the author did not write does not bind.** `{ a as b c }`
  produces a second specifier `(c → c)` that reaches
  `checkImportUnknownSymbols`, `checkImportNameCollisions`,
  `checkImportReservedSynthesisedName` and materialisation. A refusal that
  names `c` — a name the author wrote as a token, never as a specifier — is a
  diagnostic about a statement the language does not define.
- **A discarded token is reported.** The loop's catch-all `advance()` drops
  `42`, `"x"` and `:` with no record. 0100 refuses `{ 42 }` because the drop
  leaves the list empty; the drop itself is the production violation, and it is
  reported only by accident of arity.

## Actual behaviour / root cause

**The specifier loop has no separator state and a catch-all that discards.**

```ts
      while (!this.isPunct("}") && !this.atEnd()) {
        const t = this.peek();
        const isSymbolToken =
          (t.kind === "ident" || t.kind === "keyword") && t.text !== "as";
        if (isSymbolToken) {
```

`src/parser/theta-document.ts:3031–3035`. The loop dispatches on the token in
front of it and nothing else. Two specifiers in a row take the `isSymbolToken`
arm twice, so `{ a b }` produces the same two specifiers as `{ a, b }`. The
other two arms are:

```ts
        } else if (t.kind === "punct" && t.text === ",") {
          this.advance();
        } else {
          this.advance();
        }
```

`:3093–3097`. The comma arm consumes any `,` with no check on where it sits or
how many precede it, so leading, doubled and free-standing commas are consumed
exactly like separating ones. The catch-all consumes anything else and records
nothing, so a non-name specifier is erased rather than reported.

**The alias branch ends the specifier, and the loop opens a new one.** The
branch (`:3043–3056`) takes the alias when the next token is an
ident-or-keyword other than `as`, then falls through to the push. A further name
after the alias is therefore the loop's next iteration, which opens a fresh
specifier: `{ a as b c }` is `(a → b)` then `(c → c)`. When the token after `as`
is itself `as`, the guard fails, `aliasConsumedWithNoAlias` is set (`:3054`) and
0100's specifier arm fires — which is why `{ a as as b }` is refused and
`{ a as b as c }` is not.

**Neither of 0100's two arms has a subject on a recovered non-empty list.**

```ts
  if (hasBraces && specifierCount > 0) {
    return undefined;
  }
```

`src/parser/imports.ts:415–417`, inside `checkImportMalformedSpecifierList`. The
statement arm reads two facts — `hasBraces` and the specifier COUNT — and a
recovered list satisfies both. `checkImportDanglingAlias` (`:437–451`) reads one
per-specifier boolean, false whenever the alias token was taken. The parser
records no third fact: nothing counts separators, nothing counts discarded
tokens, and nothing records that two specifiers were adjacent. The facts a
refusal would need do not exist at the emission sites.

**The registry row that would carry these shapes does not claim them.**
`code-registry-parse.md:121`'s *Trigger* enumerates three shapes — list absent,
list producing zero specifiers, dangling `as`. A separator-degenerate list is
none of them, so the class is outside the landed row's documented emission set
as well as outside the parser's.

**Nothing downstream can tell.** `symbols` and `specifiers` carry the recovered
set with no marker, so `collectIdentRoots`, `checkLexicalCallSites`,
`checkImportNameCollisions`, `checkImportUnknownSymbols`, `materializeSymbol`
and `computeThetaLibExports` all see a well-formed list. `checkThetaImports`'
early return counts declarations, not specifiers
(`src/extension/import-static-checks.ts:281`), so every recovered list drives
IMP-1, IMP-3, IMP-4, IMP-5 and materialisation to completion.

## Why it matters

- **The spec's closed productions are unenforced on the separator and the
  specifier boundary, with no diagnostic.** `imports.md:36–41` is normative
  grammar mirrored to users at `docs/reference/grammar.md:34–37`. An author who
  omits a comma, doubles one, or leads with one gets a clean load and a
  functioning program the grammar says is not a program.
- **A missing comma is silently equated with a written one.**
  `import { a b } from "./lib.thetalib"` and `import { a, b } from
  "./lib.thetalib"` produce identical specifiers and identical materialisation
  (measured, both rows). Two textually distinct inputs — one legal, one not —
  are one program.
- **The `as`-run shape adds a binding the author did not write, and the
  diagnostics land on it.** `{ a as b c }` binds `b` and `c`. Measured: an
  `import-unknown-symbol` refusal naming `c`, an additional
  `import-name-collision` on `c` beside a local `fn c`, and — via a missing
  separator — a reserved-name refusal naming `__inline_0123456789abcdef`. Each
  diagnostic is correct for the recovered statement and describes a statement
  the author did not write, which is the failure mode a parse-time refusal
  exists to prevent.
- **A `.thetalib`'s published API follows the recovered set.**
  `export { greet as hello other } from "./mid.thetalib"` publishes `hello` and
  `other` (measured), so a downstream importer is admitted against a name the
  module's source text never spells as a specifier.
- **Non-name tokens vanish.** `{ a, 42 }`, `{ a "x" b }` and `{ a: b }` parse
  clean with the junk gone. The one time the drop is reported is when it leaves
  the list empty, which 0100 refuses for a different reason.
- **Nothing in the corpus or the test suite scores it.** Zero of the 34
  committed `.theta` / `.thetalib` files carry any spelling in this class, and
  0100's 36-cell witness
  (`tests/import-specifier-list-production-required.test.ts`) pins none of them
  in either direction — its group (c) controls are the conforming spellings
  plus the `","?` trailing comma. The behaviour is reachable only by an author
  writing the form for the first time, and a missing or doubled comma in a
  brace list is the spelling an edit to an existing import produces.

## Fix

**Refuse a separator-degenerate specifier list at parse time, at error
severity, on both keywords.** `parseImportExport` raises the refusal for a list
in which two specifiers are adjacent with no `,` between them, a `,` sits where
no specifier precedes it, a second `,` follows a first with no specifier
between, or a token is discarded by the loop's catch-all — so
`parseThetaDocument` alone is the witness, with no `.thetalib` resolution
required.

*Route.* Extend the mechanism 0100 shipped. Both existing arms are pure
predicates in `src/parser/imports.ts` over facts `parseImportExport` records
(`checkImportMalformedSpecifierList` at `:405–425`,
`checkImportDanglingAlias` at `:437–451`), and both emit straight onto
`this.diagnostics` at the sites 0100 added (`theta-document.ts:3069` for the
specifier arm, `:3148` for the statement arm). The facts this class needs are
of the same kind and are available in the same loop: whether the previous
iteration ended in a specifier when a specifier begins (the missing-separator
case), whether a `,` was consumed with no preceding specifier or with a `,`
already pending (the stray-separator cases), and whether the catch-all fired
(the discarded-token case). The load pass is not the seam: `collectImports`
never collects an `export` (`src/extension/import-static-checks.ts:77`), so the
`export` side would not be seen there.

Constraints on any implementation:

1. **The refused set is enumerated, not inferred.** Measured in §Reproduction
   and refused by this fix, on BOTH keywords: `{ a, , b }`, `{ , a }`,
   `{ ,, a }`, `{ a,, b }`, `{ a, , , b }`, `{ a b }`, `{ a b c }`,
   `{ a b c d }`, `{ a b, c }`, `{ a as b c }`, `{ a as b c as d }`,
   `{ a as b as c }`, `{ a, 42 }`, `{ a "x" b }`, `{ a: b }`. Every spelling
   the productions admit stays silent, including the trailing-comma form
   `{ a, }` that `","?` licenses (`imports.md:37`) and 0100's group (c)
   controls (`tests/import-specifier-list-production-required.test.ts:645–659`).
   Every spelling 0100 already refuses keeps exactly its current code list:
   `{}`, `{ , }`, `{ a as }`, `{ a as , b }`, `{ a as as b }`, and the
   no-`from` spellings the statement arm's gate excludes.
2. **The granularity follows the fact reported.** 0100 fixed the two existing
   granularities: a statement-level fact is one diagnostic per statement ranged
   over the statement, a specifier-level fact is one per malformed specifier
   ranged over that specifier. A missing separator, a stray separator and a
   discarded token are all facts about a POSITION inside the list, so the
   granularity — per statement, per offending position, or per specifier — is
   settled by whichever the emission site can range honestly, and the chosen
   granularity is asserted in the witness by a range assertion, as 0100's
   groups (a) and (b) do.
3. **The registry disposition is adjudicated in the run, and DIAG-2 decides
   it.** The landed row's *Trigger* (`code-registry-parse.md:121`) enumerates
   three shapes — "(1) the list is absent entirely — no `{` — or (2) the list
   is present but produces zero specifiers … or (3) a specifier's `as` keyword
   is consumed with no following `Ident` alias". A separator-degenerate list has
   braces, produces one or more specifiers and has no dangling `as`, so it is
   OUTSIDE all three: an emission-reach-only fix with no registry edit is not
   available. Two dispositions are: widen that row's *Trigger* to admit the
   separator and discarded-token shapes, or add one new row. Widening is
   admissible — `governance/source-language-stability.md:25` disposes a DIAG-2
   trigger change "as an addition for inputs newly brought into the code's
   emission set" — and the landed *Message* (`import / export specifier list
   must carry at least one specifier, each 'Name' or 'Name as Alias'`,
   `src/parser/imports.ts:386`) is true of `{ a b }`, whose list body is
   neither a `Name` nor a `Name as Alias`, so no DIAG-4 reword is engaged.
   A new row costs a second code on one production. Either disposition is a
   DIAG-2 registry edit mirrored into `docs/reference/diagnostics.md:170` in the
   same commit, and either way the *Trigger* text must state the granularity
   constraint 2 settles and every co-emission the arm produces. This report
   names both and decides neither.
4. **The spec prose is re-derived in the same commit.** `imports.md:48–62` and
   `docs/reference/grammar.md:51–62` state the refused set as an absent list, a
   zero-specifier list and a dangling `as`. After this fix the set also contains
   a list whose separators do not conform and one from which a token was
   discarded, so both passages are re-derived to name what is refused. The
   productions themselves (`imports.md:36–41`,
   `docs/reference/grammar.md:34–37`) are unchanged — this fix enforces them.
5. **GOV-15: the refused set is enumerated and the census re-run.** Every
   spelling in constraint 1 loads cleanly today (measured: parse diags `[]`,
   and for the `import` side a clean load pass against a conforming lib), so it
   is inside GOV-15's loads-cleanly input set
   (`governance/source-language-stability.md:9`) and the addition is covered by
   the diagnostic-registry carve-out (`:25`). Two variants are already outside
   that set and stay outside it: `{ a as b c }` against a lib that does not
   declare the phantom name already emits `theta/parse/import-unknown-symbol`,
   and `{ a __inline_<16hex> }` already emits
   `theta/parse/import-reserved-synthesised-name`. Measured occurrences in the
   tree: **zero** — 34 committed `.theta` / `.thetalib` files, two `import`
   statements, both comma-separated and fully specified, no `export` statement
   of any form. The census is re-run at the fix baseline as a measured claim,
   discharged corpus-wide by `tests/committed-fixture-parse-gate.test.ts` rather
   than by a scratch probe, and it must reach fixtures that are TypeScript
   string literals as well as committed corpus files.
6. **Test witness — unit, offline, provider-free.** Every row in §Reproduction
   settles inside one `parseThetaDocument` over a string or one
   `checkThetaImports` over an in-memory `FileSystem`. Required: each spelling
   in constraint 1 refused on both keywords, with the range asserted per
   constraint 2; every production-admitted spelling proven still silent,
   including `{ a, }`; 0100's whole 36-cell witness green unedited, which is
   what pins that the existing two arms' emission sets did not move; the
   phantom-specifier consequences that the refusal makes unreachable pinned as
   the reason they are unreachable (the `import-unknown-symbol` row, the
   collision row, the reserved-name row, and the re-export publication rows), so
   a later narrowing of the refusal reds; and the load-pass rows showing a
   recovered list materialising, since refusing the statement removes an input
   that currently drives IMP-1 / IMP-3 / IMP-4 / IMP-5.
7. **No invariant is asserted at the readers.** 0100 §Fix constraint 7 recorded
   the reason and it still holds: `checkThetaImports` pushes a resolved lib's
   registration errors and then reaches `extractThetaLibForms` over the same
   parsed body regardless (`src/extension/import-static-checks.ts:106`), so a
   refused-but-parsed lib still reaches that reader and an assert there would
   crash on refused input. The refusal is the observable; the node shape is
   unchanged.

## Non-goals

- **The from-bearing re-export's materialisation gap.** Every re-export row in
  §Reproduction materialises nothing, including the well-formed controls. That
  is [0101](./0101-from-bearing-reexport-materialises-nothing.md), open and
  unrouted. Refusing this class neither fixes nor depends on it.
- **The recovery shape after refusal.** This fix adds diagnostics; it does not
  change what node a malformed statement produces, so `symbols` for
  `{ a as b c }` stays `["b","c"]` and the downstream readers see the value they
  see today. Changing the node would move the refused input's other observables
  and is outside the carve-out constraint 5 relies on.
- **Whether `.theta` may carry an `export` at all.** `imports.md:13` permits
  `export` as a `.thetalib` top-level form and says nothing about `.theta`
  files. Unchanged here, as in 0058 and 0100.
- **`thetalibLocalBindings` having no `src/` caller.** 0058 residual (iii),
  unchanged.
- **The `docs/reference/diagnostics.md` mirror having no automated
  reconciliation.** 0100 residual 2: `tests/code-registry.test.ts` reconciles
  the four sharded `spec_topics` pages and nothing machine-checks the
  user-facing mirror. Pre-existing gap; this fix's mirror edit is verified by
  inspection like 0100's.

## Provenance

- Origin: the bug 0100 fix (0.134.0), §Fix *Residuals* item 1
  (`docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md`),
  which names all four spellings and the reason they were left: refusing them is
  outside that fix's §Fix constraint 1 enumeration and outside its GOV-15
  refused set. This report is that filing, and adds what the residual does not
  state: the keyword-symmetric measurement of what the parser DELIVERS for each
  spelling (the recovered specifier list, verbatim), the missing-separator
  equivalence with the conforming spelling at the load pass, the `as`-run
  phantom specifier's reach into `import-unknown-symbol`,
  `import-name-collision` and `import-reserved-synthesised-name`, the
  separator-degenerate re-export's effect on a `.thetalib`'s published export
  set, the adjacent-shape sweep that fixes the boundary (multiple commas,
  three- and four-name runs, `as` chains, discarded non-name tokens), the
  re-run corpus census, and the measured finding that the landed registry row's
  *Trigger* does not admit this class.
- Spec: `docs/spec_topics/imports.md:13` (permitted `.thetalib` top-level
  forms), `:29` (§Re-exports' one form), `:31–34` (its two examples), `:36–41`
  (the four productions), `:43–46` (0058's from-clause refusal prose), `:48–62`
  (0100's re-derived refusal prose and its two arms);
  `docs/spec_topics/grammar.md:3` (the appendix leaves an owned surface to its
  topic page and carries no import or export production);
  `docs/spec_topics/diagnostics/code-registry-parse.md:120`
  (`import-missing-from-clause`), `:121`
  (`import-malformed-specifier-list` and its three-shape *Trigger*), mirrored at
  `docs/reference/diagnostics.md:170`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 and its
  carve-out routing);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out and
  its trigger-change disposition). User-facing: `docs/reference/grammar.md:31`
  (§Imports and re-exports), `:34–37` (the productions), `:51–62` (the mirrored
  refusal sentence).
- Implementation evidence at `af221903`: `src/parser/theta-document.ts:1971`,
  `:1973` (the shared dispatch), `:3016–3165` (`parseImportExport`: `:3027`,
  `:3029` the `hasBraces` fact, `:3028` the brace guard, `:3031–3035` the
  specifier loop head and its token test, `:3043–3056` the alias branch with
  `:3054` the `aliasConsumedWithNoAlias` else, `:3069` the specifier-arm
  emission, `:3093–3094` the comma arm, `:3095–3097` the catch-all,
  `:3127` the shared statement range, `:3148` the statement-arm emission);
  `src/parser/imports.ts:328` (`checkImportReservedSynthesisedName`), `:364`
  (`checkImportMissingFromClause`), `:384–387` (the code and its *Message*),
  `:405–425` (`checkImportMalformedSpecifierList` and its
  `hasBraces && specifierCount > 0` early return at `:415–417`), `:437–451`
  (`checkImportDanglingAlias`), `:482` (`checkImportUnknownSymbols`), `:515`
  (`checkImportNameCollisions`), `:723` (`computeThetaLibExports`);
  `src/extension/import-static-checks.ts:77` (`collectImports`), `:106`
  (`extractThetaLibForms`), `:156` (`materializeSymbol`), `:281`
  (`checkThetaImports` and its decl-count early return).
- Test and corpus evidence at `af221903`:
  `tests/import-specifier-list-production-required.test.ts` (0100's 36-cell
  witness; `:645–659` its group (c) production-admitted controls; no cell
  spells any spelling in this class);
  `tests/committed-fixture-parse-gate.test.ts` (the repo-wide `.theta` walk that
  discharges the corpus census);
  `tests/import-export-from-clause-required.test.ts` (0058's witness);
  the corpus census `rg --files --glob '*.theta' --glob '*.thetalib' .`
  (34 files) and `rg -n '^\s*(import|export)\b' --glob '*.theta'
  --glob '*.thetalib' .` (two hits: `docs/examples/import-thetalib.theta:7`,
  `tests/live/acceptance/fixtures/acc-imports-invoke.theta:7`, both
  comma-separated and fully specified).
- Reproduction: two scratch vitest probes at `af221903` — 27 bodies × 2 keywords
  through the real `parseThetaDocument` (the class, the adjacent shapes, the
  production-admitted controls and the spellings 0100 refuses), and the load-pass
  probe over the real `checkThetaImports` with an in-memory `FileSystem` double
  (materialisation, the phantom specifier's refusals, the reserved-name row, and
  the re-export publication rows). Run on the outputs quoted above, then
  deleted. No file in the tree was written by the probes.
