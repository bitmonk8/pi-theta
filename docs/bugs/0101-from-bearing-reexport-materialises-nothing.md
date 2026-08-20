# Bug 0101 — The from-bearing re-export `export { greet } from "./base.thetalib"` — the one export form imports.md defines and, since bug 0058, the only one its `ExportDecl` production admits — puts its downstream name into the re-exporting lib's export set and materialises no binding: an importing `.theta` passes every static gate (`theta/parse/import-unknown-symbol` admits the specifier, `checkThetaImports` returns an empty `imports` list) and then, at each use position, reads `null`, constructs an unbranded schema value, panics `NullMemberAccessPanic` on an enum variant, or dies in bug 0003's `PiToolArgShapeDefectError` belt — and because `collectImports` never collects an `export`, the re-export's own path is never resolved either, so a re-export naming a symbol its source lib does not declare, or a path that does not exist, is silent too

- **Status:** fixed (0.141.0). §Fix was constraint-pinned, not settled: two routes
  were stated (implement forwarding through the re-export chain; refuse or limit
  the form in spec plus parse) with the constraints each must satisfy. §Fix
  (0.141.0) below records the in-run adjudication — route A — and what shipped.
- **Sev/Diff estimate:** S1/D3 — a name the static gate admits delivers no
  value and each use position produces a different silent or misattributed
  runtime outcome; the fix needs an in-run route decision across the parser,
  the load pass and the spec.
- **Kind:** defect — the export set and the materialisation walk read different
  inputs. `computeThetaLibExports` (`src/parser/imports.ts:652–657`) unions the
  re-exporting lib's declaration names with each re-export's `exported` name;
  `materializeSymbol` (`src/extension/import-static-checks.ts:156–188`)
  searches that same lib's own top-level `fn` / `schema` / `enum` statements by
  SOURCE name and returns `undefined` otherwise (`:187`). Nothing reads the
  `fromPath` the extraction records (`:129`), and `collectImports` (`:77–85`)
  collects `kind === "import"` only, so the re-export's path is never resolved,
  never parsed, never cycle-walked. The admission test therefore ranges over a
  set the binder cannot build, and the gap is the whole of the form's
  behaviour: the form's only effect is to add a name.
- **Related:**
  - [0058](./0058-fromless-export-form-parses-without-spec-production.md) —
    **fixed (0.60.0)**, and the filing origin. Its §Non-goals scoped this
    subject out in terms this report re-derives ("A resolvable, spec-defined
    `export { greet } from "./mid.thetalib"` also materialises nothing into an
    importing theta … That is a distinct gap between `computeThetaLibExports`
    and `materializeSymbol`, reachable from a form the spec does define, and it
    is unfiled"), and its §Fix (0.60.0) *Residuals* item (ii) records the same
    observation against the shipped fix. No ordering dependency: 0058 shipped
    in 0.60.0 and its refusal of the from-less form is what leaves the
    from-bearing form as the only surviving export spelling — every input in
    this report is a `from`-bearing statement with a `.thetalib` path literal.
  - 0058's fix published the `ExportDecl` production (imports.md `:38`,
    mirrored at `docs/reference/grammar.md:35`) and the user-facing
    §Imports and re-exports section (`docs/reference/grammar.md:31–55`) that
    states the binding rules this report measures against. Both are inputs to
    §Fix constraint 2, not defects.
- **Affected** (every citation verified at HEAD `069c0117`, 0.60.0):
  - `src/extension/import-static-checks.ts:106–143` — `extractThetaLibForms`,
    the load-pass reader. Its `export` arm (`:113–132`) records one
    `ReExportSpecifier` per specifier with `exported: specifier.local` and
    `fromPath: stmt.path` (`:129`). `fromPath` is written and never read by any
    `src/` consumer (`grep -rn 'reExports' src/` returns the field
    declaration, this push, the return, the interface field
    `src/parser/imports.ts:635`, and the projection at `:655`).
  - `src/parser/imports.ts:652–657` — `computeThetaLibExports`. Returns
    `[...declarations.map(name), ...reExports.map(exported)]`. The re-export
    arm is unconditional: no file is consulted for the name it claims.
  - `src/extension/import-static-checks.ts:399–410` — the unknown-symbol site.
    `resolvedExports` from the call above is the whole of what
    `checkImportUnknownSymbols` matches an importing specifier against, so a
    re-exported name admits the importing specifier on the same footing as a
    real declaration.
  - `src/extension/import-static-checks.ts:156–188` — `materializeSymbol`, and
    `:416–426` its call site. The walk tests `stmt.kind === "fn" | "schema" |
    "enum"` and `stmt.name === source` against the resolved lib's own body; a
    re-export statement matches no arm, so the loop falls to `return undefined`
    (`:187`) and no `MaterializedImport` is pushed.
  - `src/extension/import-static-checks.ts:77–85` — `collectImports`, which
    collects `kind === "import"` only. It is the input to the resolution loop
    (`:360`) and to the cycle walk (`:335`), so an `export` statement's path is
    never resolved (no IMP-1), never parsed for its own export set, and never
    added to the cycle graph.
  - `src/runtime/lexical-environment.ts:394–400` — `resolve`'s import arm,
    which reads `root.imports`, populated from the materialised list. A name
    absent there falls through the callable set (`:401–404`) to
    `return { arm: "unresolved" }` (`:405`).
  - `src/extension/production-theta-producer.ts:5710–5713` — the production
    pure evaluator's `case "ident"`:
    `resolution.arm === "local" ? resolution.value ?? null : null`. Every
    non-local arm, including `unresolved`, reads as `null`. This is the silent
    half of §Reproduction.
  - `src/extension/production-theta-producer.ts:5727–5729` — the ctor's brand
    install, gated on `env.resolveSchema(expr.typeName) !== undefined`
    (mirrored on the executor path at `src/runtime/statement-executor.ts:672`).
    An unmaterialised schema is unregistered, so the constructed value carries
    no `SCHEMA_TAG` (`src/runtime/value.ts:277–288`) and the QRY-18 outbound
    wire-name translation that reads it has nothing to recover.
  - `src/runtime/statement-executor.ts:377–380` — `resolveUserFn`, which
    returns a `FnDecl` only for the `fn` / `import` arms. `:628–637` is the
    call arm that consults it; an unresolved callee falls past it to the
    effect path.
  - `src/runtime/statement-executor.ts:343` and
    `src/extension/production-theta-producer.ts:3577` — the two
    `PiToolArgShapeDefectError` throw sites (bug 0003's belt, in the executor
    pre-evaluation and in the production lowering). Both are reached by a call
    of an unmaterialised imported `fn` whose first argument is not an object
    literal, and the thrown message names
    `theta/parse/tool-arg-not-object-literal` as the gate that let it through.
  - `src/extension/production-theta-producer.ts:2833` — the
    `UnknownHostToolError` the zero-argument form surfaces
    (`code-side call names no resolvable host tool '<name>'`), lowered to
    `Err(CodeToolError{ kind: "code_tool", cause: "execution" })`.
  - `src/parser/theta-document.ts:4528–4565` — `collectIdentRoots`, whose
    `case "import":` arm (`:4540–4548`) seeds the whole-file identifier root
    scope from the import specifier's `symbols`. This is why every use position
    in §Reproduction parses clean; the measured controls without the import
    line raise `theta/parse/unknown-identifier` /
    `theta/parse/unresolved-named-type`.
  - `src/parser/theta-document.ts:5196–5249` — `checkLexicalCallSites`, whose
    `fnImportDecls` set (`:5214–5232`, import arm `:5220–5228`) makes a call of
    the imported name read as a user-fn call rather than a Pi-tool call:
    `resolvesToPiTool` is false whenever the callee is in that set
    (`:5363–5366`), so the tool-argument shape rule (`:5371–5377`, documented
    `:5163–5171`) stands down and the bare-object rejection (`:5383–5391`) takes
    the object-literal shape instead. The runtime belt is the first refusal for
    the ordinary shape.
  - `src/runtime/statement-executor.ts:1501–1507` — both statement kinds are
    inert at execution, so nothing at run time revisits the re-export.
  - `src/parser/theta-document.ts:2864–2879` — the `validatePathLiteral` call
    inside `parseImportExport`, the only check any `export` path literal meets.
    It runs for both statement kinds with the fixed kind string `"import"`, and
    is what emits `theta/parse/import-non-thetalib-extension` on the
    wrong-extension row of §Reproduction.
  - `src/extension/production-composition.ts:1849–1896` —
    `collectCallableClosureSources`, the RFC-0005 subagent callable-hash closure
    walk. `:1886–1891` visits and recurses into an `export` statement's path on
    the same footing as an `import`. This walk follows the re-export edge to the
    source lib and hashes its bytes; the import resolution walk does not follow
    the same edge.
  - `src/parser/imports.ts:670–675` — `thetalibLocalBindings`, which excludes
    re-export sources because "an `export … from` re-export creates NO local
    binding". No `src/` caller (`grep -rn 'thetalibLocalBindings' src/` returns
    the definition and one comment); its only caller is
    `tests/export-visibility.test.ts:133`. Nothing cross-checks the export set
    against the binding set.
  - `docs/spec_topics/imports.md:29` — §Re-exports and its "creates no local
    binding" sentence; `:32`, `:33` the two examples; `:37–40` the four
    productions; `:48` the negative rule; `:50` §Unknown imported symbol, which
    names an `export { Foo } from` specifier as an emission site of
    `theta/parse/import-unknown-symbol` and defines the admitted set as "a
    top-level declaration [or] a transitive re-export (`export … from`) of the
    resolved `.thetalib` file"; `:27` §Visibility; `:13` the permitted
    `.thetalib` top-level forms; `:23` IMP-1, the resolver-failure contract
    stated for an `import` path; `:61` §Cycles and `theta/load/import-cycle`.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:111` — the
    `theta/parse/import-unknown-symbol` row, whose *Trigger* names both
    statement kinds and the transitive re-export set. Mirrored at
    `docs/reference/diagnostics.md:160`.
  - `docs/reference/grammar.md:31–55` — §Imports and re-exports: `:34–37` the
    productions, `:40–45` the binding rules ("`export` re-exports a symbol from
    another `.thetalib` file and creates no local binding of its own; the
    downstream-visible name is the alias"), `:53–55` the unknown-symbol
    sentence ("A specifier naming a symbol absent from the resolved `.thetalib`
    file's declarations and re-exports").
  - `docs/plan_topics/coverage-matrix.md:172` — `cka-48`, the un-anchored
    obligation area the export-visibility semantics sit in, stated in terms of
    "the aliased `export … from` re-export form, which creates no local binding
    for the re-exported symbol".
  - `tests/export-visibility.test.ts:110–163` — the cka-48 re-export unit
    tests. They construct `ReExportSpecifier` records directly, assert the
    downstream-visible alias and the absent local binding, and parse no source
    text, so no test in the tree drives a re-export through the load pass to a
    binding.
  - `tests/import-export-from-clause-required.test.ts:431–454` (group (b)) —
    the from-bearing controls bug 0058's fix pins silent, and `:631–666`
    (group (f)), whose second assertion states that `materializeSymbol` finds
    nothing for a name the lib does not declare "before the fix and after".
    Both are inputs to §Fix constraint 6.
  - **The corpus.** 35 committed `.theta` / `.thetalib` files
    (`find . \( -name "*.theta" -o -name "*.thetalib" \) -not -path
    "./node_modules/*" -not -path "./.git/*"`); the only occurrence of the
    token `export` in any of them is the word "exported" in a comment
    (`tests/live/acceptance/fixtures/acc-lib.thetalib:2`). Zero re-export
    statements. The behaviour is reachable only by an author writing the form
    the spec spells.
- **Observed at:** `0.60.0` (HEAD `069c0117`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving the real `parseThetaDocument`, the
  real `checkThetaImports` over an in-memory `FileSystem` double, and the real
  `executeBody` bound through `createProductionProducerDeps` /
  `bindPromptConversation`; written, run, deleted.

## Summary

A `.thetalib` re-exports a symbol from another `.thetalib` with the form
imports.md `:29–33` defines and its `ExportDecl` production (`:38`) admits:

```theta
export { greet } from "./base.thetalib"
```

The name enters the re-exporting lib's downstream-visible export set, because
`computeThetaLibExports` unions declaration names with every re-export's
`exported` name. An importing `.theta` whose specifier names it therefore
passes `theta/parse/import-unknown-symbol`. Nothing else happens.
`materializeSymbol` looks for a top-level `fn` / `schema` / `enum` in the
re-exporting lib's own body and finds none, so `checkThetaImports` returns an
empty `imports` list and the runtime environment has no entry for the name. The
re-export's path is not resolved at all: `collectImports` collects `import`
statements only, so the source lib is never read on this route.

The importing file still parses clean at every use position — the import
specifier's `symbols` seed the whole-file identifier root scope
(`collectIdentRoots`) and the known-callee set (`fnImportDecls`) — so the
failure is deferred to run time, where each position produces a different
outcome (measured in §Reproduction):

- `greet("x")` — a call whose first argument is not an object literal — throws
  `PiToolArgShapeDefectError`, which routes to `theta/runtime/internal-error`
  and whose message blames bug 0003's parse gate for a call the parse gate
  correctly classified as a user-fn call.
- `greet()` returns `Err(CodeToolError{ kind: "code_tool" })` with the message
  `code-side call names no resolvable host tool 'greet'` — a "host tool"
  report for a call the author wrote as a library function call.
- `let r = greet` binds `null`, silently.
- A re-exported `schema` used as a constructor produces the right fields with
  no schema brand, so the QRY-18 outbound wire-name translation that reads the
  brand does not apply. The direct import of the same declaration brands it.
- A re-exported `enum`'s variant access throws
  `NullMemberAccessPanic: null member access: .Red`.

Because the re-export's path is unresolved, three further inputs are silent
too: a re-export naming a symbol the source lib does not declare, a re-export
from a path that does not exist, and a re-export cycle between two libs. The
one check that reaches the export path is the parse-time extension check
(`theta/parse/import-non-thetalib-extension`), which fires on the
re-exporting lib's own parse.

One walk in the tree does follow the re-export edge:
`collectCallableClosureSources` visits an `export` statement's path and hashes
the source lib's bytes into the RFC-0005 subagent callable hash. The binder
does not.

## Reproduction

Offline, at `069c0117`. Scratch vitest: the real `parseThetaDocument`
(production-shaped `ParseThetaDocumentDeps`), the real `checkThetaImports` over
an in-memory `FileSystem` exposing `readdir` / `readBytes` in the shape
`tests/subagent-fn.test.ts:1581–1614` uses, and the real `executeBody` driven
through `createProductionProducerDeps(...).bindPromptConversation` with a frozen
EMPTY callable-set snapshot and a `resolvePiTool` that would resolve any name
(so an ambient execution would be visible as `"AMBIENT"`). The importing file is
`/proj/app.theta` with frontmatter `model: "sonnet"` + `mode: prompt`; libs sit
beside it. `app parse` is the importing document's own diagnostics; `import
diags` is `checkThetaImports(...).diagnostics`; `materialised` is its
`.imports`; `runtime` is the `executeBody` outcome and final value, or the
thrown error.

### The chain, and its direct-import control

```
@@ base `fn greet(x: string) { x }`
   mid  `export { greet } from "./base.thetalib"`
   app  `import { greet } from "./mid.thetalib"` + `let r = greet("x")` + `r`
   app parse      :: []
   import diags   :: []
   materialised   :: []
   runtime        :: THROW PiToolArgShapeDefectError: internal defect: Pi tool 'greet'
                     call reached the runtime lowering with a non-object-literal first
                     argument; the parse-time shape gate
                     (theta/parse/tool-arg-not-object-literal) did not reject this call
                     site — a gate gap (bug 0003)

@@ base `fn greet(x: string) { x }`                                       [control]
   app  `import { greet } from "./base.thetalib"` + `let r = greet("x")` + `r`
   app parse      :: []
   import diags   :: []
   materialised   :: [{"name":"greet","kind":"fn"}]
   runtime        :: outcome="success" value="x"

@@ mid  `export { greet as hello } from "./base.thetalib"`
   app  `import { hello } from "./mid.thetalib"` + `let r = hello("x")` + `r`
   materialised   :: []      runtime :: THROW PiToolArgShapeDefectError (…'hello'…)

@@ base `fn greet(x: string) { x }`
   mid2 `export { greet } from "./base.thetalib"`
   mid  `export { greet } from "./mid2.thetalib"`                     [depth 2]
   app  `import { greet } from "./mid.thetalib"` + `let r = greet("x")` + `r`
   app parse :: []   import diags :: []   materialised :: []
   runtime   :: THROW PiToolArgShapeDefectError (…'greet'…)
```

The alias adds a downstream-visible name that binds nothing, and chain depth
changes nothing.

### The runtime outcome per use position

Same three files as the first row; only the app body varies.

```
@@ `let r = greet()` + `r`                       [zero-arg call]
   app parse :: []   materialised :: []
   runtime   :: outcome="success" value={"ok":false,"error":{"kind":"code_tool",
                "message":"code-side call names no resolvable host tool 'greet'",
                "tool_name":"greet","cause":"execution"}}

@@ `let r = greet({ x: "y" })` + `r`             [object-literal arg]
   app parse :: ["error theta/parse/bare-object-literal: bare object literal not
                 permitted in this position; name the schema (Schema { ... })"]
   runtime   :: the same code_tool Err as above

@@ `let r = greet` + `r`                         [bare identifier read]
   app parse :: []   materialised :: []
   runtime   :: outcome="success" value=null
```

The zero-argument call is the only clean-parse call shape that reaches a
`Result`: the object-literal shape is refused at parse time
(`theta/parse/bare-object-literal`, because the callee reads as a user fn and
the Pi-tool carve-out does not apply), and the ordinary shape throws. The
`resolvePiTool` double is never consulted on any row — no ambient tool
executes.

### A re-exported `schema` and a re-exported `enum`

Declaration bodies are multi-line in the fixtures, one member per line: `base`
carries `schema Author` with the single field `name: string`, or `enum Color`
with the variants `Red` and `Blue`; the app's `schema Wrap` carries the single
field `who: Author`. The rows below name each declaration rather than inlining
its body.

```
@@ base schema Author   mid `export { Author } from "./base.thetalib"`
   app  `import { Author } from "./mid.thetalib"` + `let a = Author { name: "n" }` + `a`
   app parse :: []   import diags :: []   materialised :: []
   runtime   :: outcome="success" value={"name":"n"}   schemaTagOf(value) :: undefined
@@ base schema Author                                                     [control]
   app  `import { Author } from "./base.thetalib"` + same body
   materialised :: [{"name":"Author","kind":"schema"}]
   runtime   :: outcome="success" value={"name":"n"}   schemaTagOf(value) :: "Author"

@@ app + schema Wrap + `let w = Wrap { who: Author { name: "n" } }`
   app parse :: []   materialised :: []   runtime :: value={"who":{"name":"n"}}
@@ app + `let a: Author = Author { name: "n" }`
   app parse :: []   materialised :: []   runtime :: value={"name":"n"}

@@ base enum Color   mid `export { Color } from "./base.thetalib"`
   app  `import { Color } from "./mid.thetalib"` + `let c = Color.Red` + `c`
   app parse :: []   import diags :: []   materialised :: []
   runtime   :: THROW NullMemberAccessPanic: null member access: .Red
@@ base enum Color                                                        [control]
   app  `import { Color } from "./base.thetalib"` + same body
   materialised :: [{"name":"Color","kind":"enum"}]   runtime :: value="Red"
```

The schema row is the silent one: the constructor produces the declared fields
and the value differs from the control only in the brand (`schemaTagOf` —
`undefined` against `"Author"`). `src/runtime/value.ts:254–258` names the two
consumers of that brand, the first being "the QRY-18 interpolation render path,
which needs the declaring schema to apply outbound wire-name translation
recursively". This report measures the brand's absence, not a rendered payload.
The named-type positions (`schema` field, `let` annotation) accept `Author` with
the import line present.

### The static gate that admits every position

Parse only, `/proj/app.theta`, frontmatter as above.

```
@@ `let r = greet("x")` + `r`                              ["error theta/parse/unknown-identifier"]
@@ `import { greet } from "./mid.thetalib"` + same          []
@@ `let r = greet` + `r`                                    ["error theta/parse/unknown-identifier"]
@@ `import { greet } from "./mid.thetalib"` + same          []
@@ `let c = Color.Red` + `c`                                ["error theta/parse/unknown-identifier"]
@@ `import { Color } from "./mid.thetalib"` + same          []
@@ `let a = Author { name: "n" }` + `a`                     ["error theta/parse/unresolved-named-type"]
@@ `import { Author } from "./mid.thetalib"` + same         []
```

The import specifier is the whole of what silences each position, and the
specifier is admitted by the export set.

### A `.thetalib` on the importing side

```
@@ base `fn greet(x: string) { x }`
   mid  `export { greet } from "./base.thetalib"`
   top  `import { greet } from "./mid.thetalib"` + `fn wrap(y: string) { greet(y) }`
   app  `import { wrap } from "./top.thetalib"` + `let r = wrap("q")` + `r`
   app parse :: []   import diags :: []   materialised :: [{"name":"wrap","kind":"fn"}]
   runtime   :: THROW PiToolArgShapeDefectError (…'greet'…)
```

`wrap` materialises and its body runs in the caller's environment, so the
unbound name fails inside a library function, one frame from the author's call.

### The unresolved re-export path

```
@@ base `fn other(x: string) { x }`   mid `export { greet } from "./base.thetalib"`
   app  `import { greet } from "./mid.thetalib"` + `let r = greet("x")` + `r`
   app parse :: []   import diags :: []   materialised :: []

@@ mid  `export { greet } from "./nope.thetalib"`      [no such file]
   app  `import { greet } from "./mid.thetalib"` + same body
   app parse :: []   import diags :: []   materialised :: []

@@ mid  `export { greet } from "./nope.theta"`         [wrong extension]
   import diags :: ["error theta/parse/import-non-thetalib-extension: import path
                     './nope.theta' does not end in .thetalib"]

@@ mid   `export { greet } from "./other.thetalib"`
   other `export { greet } from "./mid.thetalib"`      [re-export cycle]
   app parse :: []   import diags :: []   materialised :: []

@@ mid  `fn other(x: string) { x }`                                       [control]
   app  `import { greet } from "./mid.thetalib"` + same body
   import diags :: ["error theta/parse/import-unknown-symbol: imported symbol 'greet'
                     is not declared or re-exported by './mid.thetalib'"]
```

Row 1 is imports.md `:50` unenforced on its `export { Foo } from` arm: no file
in the set declares `greet`, and the importing theta registers. Row 2 is IMP-1
unreached on an export path. Row 3 is the one check that reaches it — a
parse-time literal check on the re-exporting lib, surfaced through the
registration-error arm (`import-static-checks.ts:388–392`), which un-registers
the app. Row 4 is imports.md `:61` unreached: the cycle graph is built from
`collectImports`. The control shows the code the admission test emits when no
re-export claims the name.

### The lib's own parse

```
@@ /proj/mid.thetalib `export { greet } from "./base.thetalib"`                      []
@@ /proj/mid.thetalib `fn other(x: string) { x }` + `export { greet } from "./base.thetalib"`   []
```

The re-exporting lib is well-formed input at every gate; the form is not
degenerate and is not refused anywhere.

## Expected behaviour

- **A name the admission test admits is a name the environment binds.**
  `docs/spec_topics/imports.md:50` scopes `theta/parse/import-unknown-symbol`
  to a specifier naming a symbol "which is neither a top-level declaration nor
  a transitive re-export (`export … from`) of the resolved `.thetalib` file".
  The check passing and the binding existing are the two halves of one
  contract; the measured control (`import { greet }` straight from the
  declaring lib) shows both halves for the same declaration.
- **A re-export resolves to the declaration it names.**
  `docs/reference/grammar.md:41–45` states the form's effect as re-exporting "a
  symbol from another `.thetalib` file", downstream-visible under the alias.
  A form whose stated effect is to make another file's symbol visible
  downstream is expected to deliver that file's symbol. The word "transitive"
  in imports.md `:50` and in the registry *Trigger*
  (`code-registry-parse.md:111`) states that the export set is computed through
  the chain, which requires the chain to be walked.
- **"Creates no local binding" is about the re-exporting lib's own scope.**
  imports.md `:29` and `docs/reference/grammar.md:42–43` say the form creates
  no local binding *of its own* — the re-exporting lib cannot call `greet`.
  `thetalibLocalBindings` (`src/parser/imports.ts:670–675`) is the function that
  implements exactly that, and `collectIdentRoots` / `fnImportDecls` cite the
  same sentence when they exclude `export` symbols from a file's own scope.
  Neither sentence says the importing file gets no binding.
- **An unresolvable path is diagnosed on whichever statement names it.**
  IMP-1 (`imports.md:23`) states the resolver-failure contract and
  `theta/load/unresolvable-thetalib-path`; imports.md `:61` states
  `theta/load/import-cycle` for cycles "between `.thetalib` files". A path
  literal in an `export … from` statement is a `.thetalib` path in a
  `.thetalib` file and is subject to both. Measured: neither is reached.
- **A re-export specifier is checked against the file it names.**
  `code-registry-parse.md:111` names `export { ... } from` specifiers in the
  same *Trigger* as `import { ... }` specifiers. Measured: a re-export naming a
  symbol its source lib does not declare emits nothing, at the re-exporting lib
  or downstream.
- **One resolution answer per re-export edge.**
  `collectCallableClosureSources` follows the export path and hashes the source
  lib into the subagent callable hash; the load pass does not follow it at all.
  Two walks over the same statement kind disagree about whether the edge
  exists.

## Actual behaviour / root cause

**The export set and the binding walk read different inputs.**

```ts
export function computeThetaLibExports(forms: ThetaLibModuleForms): readonly string[] {
  return [
    ...forms.declarations.map((declaration) => declaration.name),
    ...forms.reExports.map((reExport) => reExport.exported),
  ];
}
```

`src/parser/imports.ts:652–657`. The second spread is the admission half. The
binding half is a different walk over a different body:

```ts
  for (const stmt of body.statements) {
    if (stmt.kind === "fn" && stmt.name === source) { … }
    if (stmt.kind === "schema" && stmt.name === source) { … }
    if (stmt.kind === "enum" && stmt.name === source) { … }
  }
  return undefined;
```

`src/extension/import-static-checks.ts:156–188`, called at `:416–426` with the
importing specifier's `source` and the RESOLVED LIB's body. A re-export
statement matches no arm. The two halves cannot agree for any re-export,
because the declaration the name refers to is in a file the second walk is
never given.

**The re-export's path is recorded and never resolved.**
`extractThetaLibForms` stores `fromPath: stmt.path`
(`import-static-checks.ts:129`) and no `src/` consumer reads it;
`computeThetaLibExports` projects `exported` only. The resolution loop
(`:360`) and the cycle walk (`:335`) both draw from `collectImports`
(`:77–85`), which tests `stmt.kind === "import"`. So the source lib is not
resolved (IMP-1 unreached), not read, not parsed for its own export set (so the
"transitive" half of the admission set is not computed), and not added to the
cycle graph. The only check that reaches an `export` path is the
`validatePathLiteral` call inside `parseImportExport`
(`src/parser/theta-document.ts:2864–2879`, which passes the fixed kind string
`"import"` for both statement kinds), which is why the wrong-extension row is
the one diagnosed row in §Reproduction.

**The importing file's static gates are silenced by the import specifier, not
by the binding.** `collectIdentRoots` (`src/parser/theta-document.ts:4540–4548`)
adds every `import` statement's `symbols` to the whole-file identifier root
scope, and `checkLexicalCallSites` (`:5220–5228`) adds them to `fnImportDecls`.
Both are correct for an import specifier — the specifier is what binds — and
both are keyed on the specifier's presence, not on the materialisation outcome
they cannot see. `fnImportDecls` membership also makes `resolvesToPiTool` false
(`:5363–5366`), which stands the Pi-tool argument shape rule down (`:5371–5377`)
and is why the ordinary call shape reaches the runtime with no parse diagnostic.

**At run time the name is on the `unresolved` arm, and each consumer of that arm
does something different.** `LexicalEnvironment.resolve`
(`src/runtime/lexical-environment.ts:394–405`) finds no `root.imports` entry, no
`fns` entry and no callable, and returns `{ arm: "unresolved" }`. Five consumers
read that:

1. `resolveUserFn` (`src/runtime/statement-executor.ts:377–380`) returns
   `undefined`, so the call arm (`:628–637`) declines the in-process user-fn
   path and the call proceeds as a checkpointed effect. `preEvaluateToolArgs`
   (`:343`) then throws `PiToolArgShapeDefectError` for a non-object first
   argument — bug 0003's belt, whose message asserts a parse-gate gap that does
   not exist here: the parse gate classified the callee as a user fn, correctly,
   from the import specifier. The production lowering carries the same throw
   (`src/extension/production-theta-producer.ts:3577`).
2. The zero-argument shape passes that belt (`args: {}`) and dispatches as a Pi
   tool. The frozen callable-set snapshot does not hold the name, so the
   QTL-2 rejection stands and `UnknownHostToolError`
   (`production-theta-producer.ts:2833`) lowers to
   `Err(CodeToolError{ kind: "code_tool", cause: "execution" })`. No ambient
   tool executes — measured with a `resolvePiTool` double that would have.
3. The pure evaluator's `case "ident"`
   (`production-theta-producer.ts:5710–5713`) returns `null` for every
   non-local arm. A bare read of the name is a silent `null`.
4. The member arm consults `env.resolveEnumVariant` first; an unregistered enum
   returns `undefined`, the target is then evaluated as an identifier through
   consumer 3 to `null`, and `evaluateMemberAccess` raises
   `NullMemberAccessPanic`.
5. The schema constructor builds the field object and skips the brand install,
   which is gated on `env.resolveSchema(...) !== undefined` (`:5727–5729`,
   executor mirror `src/runtime/statement-executor.ts:672`). An unmaterialised
   schema is unregistered, so the value is unbranded.

**Nothing revisits the statement at execution.**
`src/runtime/statement-executor.ts:1501–1507` makes both `import` and `export`
inert ("Declarations are hoisted / registered by `V19b`'s environment; inert
here"), so the load pass is the only place a re-export could have been
materialised.

**One walk in the tree already follows the edge.**
`collectCallableClosureSources`
(`src/extension/production-composition.ts:1886–1891`) resolves
`statement.path` for `kind === "export"` and recurses, so the RFC-0005 subagent
callable hash covers the source lib's bytes. The disagreement is between two
readers of the same statement kind, not a missing capability in the codebase.

**Nothing cross-checks the export set against the binding set.**
`thetalibLocalBindings` (`src/parser/imports.ts:670–675`) is the symmetric
function and has no `src/` caller. The unit tests that do exercise the
re-export semantics (`tests/export-visibility.test.ts:110–163`) construct
specifier records and parse no source, so they assert the export-set half in
isolation from the binding half.

## Why it matters

- **The static gate reports on a set the runtime does not build.** The
  measured pair is two file sets differing only in one indirection: importing
  `greet` from the declaring lib materialises `{"name":"greet","kind":"fn"}`
  and returns `"x"`; importing the same declaration through a re-export
  materialises nothing and throws. Both pass every load-time check with zero
  diagnostics.
- **The failure is misattributed at the surface the author sees.** The
  ordinary call shape ends in `theta/runtime/internal-error` carrying
  "the parse-time shape gate (theta/parse/tool-arg-not-object-literal) did not
  reject this call site — a gate gap (bug 0003)". The parse gate did its job;
  the missing binding is elsewhere. An author reading that text is directed at
  the wrong subsystem, and so is anyone triaging the report.
- **The zero-argument shape reports a host tool the author never wrote.**
  `code-side call names no resolvable host tool 'greet'` names a library
  function as a tool. The `Err` is a `code_tool` error with
  `cause: "execution"`, so it flows into `match` arms and `?` propagation as an
  ordinary tool failure.
- **Two positions are silent.** A bare read binds `null` with no diagnostic
  and no panic. A re-exported schema's constructor produces the declared fields
  with no brand, and the brand is what the QRY-18 outbound render reads to
  apply the schema's theta-side-to-wire field renames
  (`src/runtime/value.ts:254–258`), so a value constructed through a re-export
  cannot carry them. Neither position produces any signal at any phase.
- **A library author's mistake is invisible.** A re-export naming a symbol the
  source lib does not declare, and a re-export from a path that does not exist,
  both load cleanly (measured). The lib ships an export set containing names
  nothing anywhere provides, and the first observable is a runtime failure in
  the importing theta.
- **The failure surfaces one frame away from the author's code.** When the
  re-exported name is used inside another `.thetalib`'s `fn`, that `fn`
  materialises and the throw happens inside the library body during the
  caller's call.
- **The form is the only export spelling the language admits.** Bug 0058
  refused the from-less form in 0.60.0, so `export { … } from "…"` is what
  imports.md `:37–40` and `docs/reference/grammar.md:34–37` publish, what
  `docs/how-to/import-a-thetalib-module.md:68–69` routes readers to, and the
  only shape an author can write. Its entire published effect is unimplemented.
- **Nothing in the corpus scores it.** Zero of the 35 committed `.theta` /
  `.thetalib` files carry an `export` statement, and the tests that cover the
  re-export semantics stop at the export set. The behaviour is reachable only
  by an author writing the documented form for the first time.

## Fix

Not yet decided. Two routes close the gap; the choice is an in-run
adjudication, because the second changes the disposition of input that loads
cleanly today.

**Route A — resolve the re-export chain.** The load pass follows an
`export … from` edge exactly as it follows an `import … from` edge: the
re-exporting lib's export set is computed from its declarations plus, for each
re-export, the resolved source lib's own export set (the "transitive" half
imports.md `:50` already states), and materialisation resolves an importing
specifier through the chain to the declaring `fn` / `schema` / `enum`, binding
it under the importing specifier's local name. This makes the admission test
and the binding walk read one input, brings IMP-1 and the cycle walk onto the
export path, and puts the `export { Foo } from` arm of
`theta/parse/import-unknown-symbol` into service. It also aligns the load pass
with `collectCallableClosureSources`, which already walks the edge.

**Route B — refuse or limit the form.** imports.md withdraws or narrows the
`ExportDecl` production and the parser refuses what it no longer defines, on
the seam bug 0058 established (`checkImportMissingFromClause`,
`src/parser/imports.ts:364`, raised in `parseImportExport`,
`src/parser/theta-document.ts:2889`), so a re-export is a parse error rather
than a name that cannot deliver a value. This is a GOV-15
adjudication: a `.thetalib` carrying a re-export loads cleanly today (measured
in §Reproduction, last block), so refusing it changes the diagnostic-code
sequence of an input inside GOV-15's loads-cleanly set
(`docs/spec_topics/governance/source-language-stability.md:5`, predicate at
`:9`). The diagnostic-registry carve-out (`:25`) covers adding a code "for
inputs that did not previously emit the added code"; the route must state
whether that carve-out is sufficient for withdrawing a published production, or
whether the withdrawal itself needs a separate adjudication. Measured blast
radius: zero committed files.

Constraints on either route:

1. **The export set keeps its two admitted sources and its one exclusion.**
   `computeThetaLibExports` unions declaration names with re-export `exported`
   names and excludes plain-import locals; imports.md `:48` states the
   exclusion and `tests/export-visibility.test.ts:167–204` pins it. Route A
   changes what an `exported` name is checked against, not which sources are
   admitted. Route B removes one source and must re-derive `:48`, whose
   sentence names the surviving forms ("only declarations and explicit
   `export ... from` forms are visible to downstream importers").
2. **The 0058-published productions stay published or are withdrawn
   deliberately.** imports.md `:37–40` and `docs/reference/grammar.md:34–37`
   carry `ImportDecl` / `ExportDecl` / `ImportSpec` / `ExportSpec`, and
   `docs/reference/grammar.md:588–591` cites bug 0058 as their provenance.
   Route A leaves all four untouched. Route B edits the same four in both
   pages plus that provenance line, in one commit, and states what the
   `.thetalib` top-level form list (`imports.md:13`) permits afterwards.
3. **"Creates no local binding" is reconciled either way.** imports.md `:29`
   and `docs/reference/grammar.md:42–43` are about the re-exporting lib's own
   scope: `thetalibLocalBindings` (`src/parser/imports.ts:670–675`),
   `collectIdentRoots` (`src/parser/theta-document.ts:4540–4548`) and
   `fnImportDecls` (`:5220–5228`) all cite it when they exclude `export`
   symbols from a file's own scope, and bug 0058's fix rests on it. Route A
   states explicitly that the sentence governs lib-local scope and that the
   IMPORTING file's binding is a separate rule — without turning the
   re-exported name into a local binding in the re-exporting lib, which would
   red the cka-48 no-local-binding assertion
   (`tests/export-visibility.test.ts:127–141`) and reopen 0058's constraint 2.
   Route B removes the sentence's subject and must remove or re-scope the
   sentence with it.
4. **The unknown-symbol arm for `export { Foo } from` specifiers is settled in
   the same change.** imports.md `:50` and the registry *Trigger*
   (`code-registry-parse.md:111`, mirrored `docs/reference/diagnostics.md:160`)
   name that specifier and the transitive set. Route A puts the arm into
   service and states which file the diagnostic is reported against — the
   re-exporting lib, whose specifier is wrong — and how it propagates to the
   importing theta through the existing registration-error arm
   (`src/extension/import-static-checks.ts:388–392`). Route B makes the arm
   unreachable and re-derives both the *Trigger* and
   `docs/reference/grammar.md:53–55`.
5. **Route A terminates on a re-export cycle.** `mid ↔ other` re-exporting each
   other emits nothing today (measured). A chain walk must bound itself and
   state which code fires: imports.md `:61` owns `theta/load/import-cycle` for
   cycles "between `.thetalib` files" and the existing walk is keyed on `import`
   edges, so the change either widens that walk's edge set (and the cycle path
   it prints) or introduces a separate code with its own registry row and DIAG-2
   mirror.
6. **Two existing offline assertions state today's outcome and must be
   re-derived, not weakened.**
   `tests/import-export-from-clause-required.test.ts:631–666` (group (f))
   asserts a lib-offered name that no declaration backs materialises nothing
   "before the fix and after"; its subject is a from-less export, refused since
   0.60.0, but its premise is the same materialisation walk. Group (b)
   (`:431–454`) pins the from-bearing spellings silent at parse time — that
   stays true under route A and is exactly what route B inverts.
   `tests/export-visibility.test.ts:110–163` asserts the export-set half at
   unit level and parses no source; either route needs a witness that drives a
   re-export through `checkThetaImports` to a binding, which no test does
   today.
7. **The closure walk and the load pass agree afterwards.**
   `collectCallableClosureSources`
   (`src/extension/production-composition.ts:1886–1891`) follows the export
   edge. Route A brings the load pass to the same answer. Route B makes that
   branch unreachable for conforming input and records it as such rather than
   leaving a walk that resolves paths from a statement the language no longer
   admits.
8. **Test witness — offline, no live provider.** Every row of §Reproduction is
   a `parseThetaDocument`, `checkThetaImports` or `executeBody` call. Required
   beyond them: the chain row and its direct-import control asserted on
   `materialised` AND on the runtime value; the alias row; the depth-2 chain;
   the four use positions (call, zero-arg call, bare read, enum variant) each
   pinned to its outcome; the schema-brand pair (`schemaTagOf` `undefined`
   against `"Author"`); the three unresolved-path rows and the wrong-extension
   row; the re-export cycle; and the `.thetalib`-on-the-importing-side row,
   which is the only one that reaches the failure from inside a library body.

## Non-goals

- **The `unresolved` arm's five different consumers.** A bare read of any
  unresolved name is a silent `null`
  (`src/extension/production-theta-producer.ts:5710–5713`), an ordinary call
  ends in bug 0003's belt with a message naming the wrong gate, and a member
  access on the resulting `null` panics. Those dispositions are reachable from
  any gap that leaves a parse-clean name unbound; this report measures them as
  this form's observable chain and does not adjudicate whether the arm should
  have one uniform disposition.
- **The `PiToolArgShapeDefectError` message text.** Its assertion that
  `theta/parse/tool-arg-not-object-literal` failed to reject the site is wrong
  for this input class and correct for the class bug 0003 filed. Rewording it
  is a separate change and is not required by either route here.
- **`thetalibLocalBindings`' unusedness.** The function has no `src/` caller,
  so nothing cross-checks the export set against the binding set. Bug 0058's
  fix record notes the same thing as its residual (iii). Either route may leave
  it unused; wiring it is not part of closing this gap.
- **The `.theta` `export` question.** `docs/spec_topics/imports.md:13` permits
  `export` as a `.thetalib` top-level form and says nothing about `.theta`
  files, where nothing can read one. A from-bearing `export` in a `.theta`
  parses clean today and, since 0058, seeds no identifier-root name. Whether it
  is itself an error is a separate adjudication.

## Provenance

- Origin: the bug 0058 fix (0.60.0). Recorded twice as flagged-not-filed —
  [0058](./0058-fromless-export-form-parses-without-spec-production.md)
  §Non-goals first bullet ("Re-export materialisation … That is a distinct gap
  between `computeThetaLibExports` and `materializeSymbol`, reachable from a
  form the spec does define, and it is unfiled") and its §Fix (0.60.0)
  *Residuals* item (ii) ("The from-bearing re-export's materialisation gap is
  untouched, as §Non-goals scopes: a resolvable
  `export { greet } from "./mid.thetalib"` still passes IMP-3 downstream and
  materialises nothing. Unfiled."). This report is that filing, and adds what
  the residual does not state: the per-use-position runtime observables, the
  unresolved re-export path (unknown source symbol, missing file, cycle) and
  the one path check that does fire, the schema-brand divergence, the
  library-side reach, the asymmetry with the RFC-0005 closure walk, and the two
  routes with their constraints.
- Spec: `docs/spec_topics/imports.md:13` (permitted `.thetalib` top-level
  forms), `:23` (IMP-1), `:27` (§Visibility), `:29` (§Re-exports — "creates no
  local binding"), `:32`, `:33` (the two examples), `:37–40` (the four
  productions), `:48` (the negative rule), `:50` (§Unknown imported symbol and
  the transitive set), `:61` (§Cycles and `theta/load/import-cycle`);
  `docs/spec_topics/diagnostics/code-registry-parse.md:111`
  (`theta/parse/import-unknown-symbol`), mirrored at
  `docs/reference/diagnostics.md:160`;
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out);
  `docs/plan_topics/coverage-matrix.md:172` (`cka-48`), `:110` (IMP-1 → `V15c`).
  User-facing: `docs/reference/grammar.md:31–55` (§Imports and re-exports),
  `:588–591` (its provenance line);
  `docs/how-to/import-a-thetalib-module.md:68–69` (the route to the re-export
  rules).
- Implementation evidence at `069c0117`:
  `src/extension/import-static-checks.ts:77–85` (`collectImports`),
  `:106–143` (`extractThetaLibForms`, export arm `:113–132`, `fromPath` `:129`),
  `:156–188` (`materializeSymbol`, `:187` the miss), `:335` (the cycle walk's
  collector), `:360–368` (the resolution loop and its extension skip),
  `:388–392` (the registration-error arm), `:399–410` (the unknown-symbol
  site), `:416–426` (materialisation);
  `src/parser/imports.ts:635` (`ThetaLibModuleForms.reExports`), `:652–657`
  (`computeThetaLibExports`), `:670–675` (`thetalibLocalBindings`);
  `src/parser/theta-document.ts:2864–2879` (the `validatePathLiteral` call in
  `parseImportExport`), `:4528–4565` (`collectIdentRoots`, import arm
  `:4540–4548`), `:5163–5171` (the shape rule's fn/import stand-down as
  documented), `:5196–5249` (`checkLexicalCallSites`, `fnImportDecls`
  `:5214–5232`, the `resolvesToPiTool` predicate `:5363–5366`);
  `src/runtime/lexical-environment.ts:394–405` (the import arm and the
  unresolved arm); `src/runtime/statement-executor.ts:343` (the executor's
  0003 belt), `:377–380` (`resolveUserFn`), `:628–637` (the call arm), `:672`
  (the brand gate), `:1501–1507` (both kinds inert);
  `src/extension/production-theta-producer.ts:2833` (`UnknownHostToolError`),
  `:3577` (the production lowering's 0003 belt), `:5710–5713` (the pure ident
  arm), `:5727–5729` (the brand install);
  `src/runtime/value.ts:254–258` (the brand's two consumers), `:277–288`
  (`brandSchemaValue`);
  `src/extension/production-composition.ts:1849–1896`
  (`collectCallableClosureSources`, `:1886–1891` the export-path visit).
- Test and corpus evidence at `069c0117`:
  `tests/export-visibility.test.ts:110–163` (the cka-48 re-export unit tests,
  the no-local-binding assertion at `:127–141`), `:167–204` (the plain-import
  negative rule);
  `tests/import-export-from-clause-required.test.ts:431–454` (the from-bearing
  controls), `:631–666` (the materialises-nothing assertion);
  `tests/subagent-fn.test.ts:1581–1614` (the in-memory `FileSystem` shape this
  report's probes reuse);
  `tests/callable-set-runtime-enforcement.test.ts:137–149` (the
  `bindPromptConversation` + `executeBody` harness shape the runtime probes
  reuse); the corpus census — 35 committed `.theta` / `.thetalib` files, one
  `export` token, the word "exported" in a comment at
  `tests/live/acceptance/fixtures/acc-lib.thetalib:2`.
- Reproduction: scratch vitest at `069c0117` — the chain and its direct-import
  control; the alias and depth-2 rows; three further use-position rows beside
  the chain's ordinary call, each with its runtime outcome; the schema and enum
  pairs with their controls and the brand readout; eight parse-only gate rows;
  the library-side leg; five unresolved-path rows; and the re-exporting lib's
  own parse. Run on the
  outputs quoted above, then deleted per scratch policy. No file in the tree
  was written by the probes. `src/`, `tests/` and every other bug doc are
  unmodified by this filing.


## Fix (0.141.0)

**Route adjudication (§Fix, decided in-run).** **Route A — resolve the re-export
chain.** The load pass follows an `export … from` edge as it follows an
`import … from` edge, so the admission test and the binding walk read one input.
Route B — withdrawing or narrowing the `ExportDecl` production and refusing what
the spec no longer defines — was **rejected**: every bullet of §Expected states
the outcome route A produces ("a name the admission test admits is a name the
environment binds"; "a re-export resolves to the declaration it names"), route B
would withdraw the only export spelling the language admits since 0058, and it
leaves open the governance question §Fix itself poses — whether the GOV-15
diagnostic-registry carve-out reaches the withdrawal of a published production
at all, or whether that withdrawal needs its own adjudication. Route A engages
no such question: it adds no code and no row, and every newly-emitting input is
inside the carve-out's ADDITION direction.

**Evidence staleness.** Every citation in this document is at `069c0117`
(0.60.0). §Reproduction was re-derived at the fix baseline `af221903` (0.134.0)
before any red was pinned: **zero drift** — every row reproduces exactly as
filed, and none of bug 0100's four new refusals discharges any input class here
(every fixture is a fully specified from-bearing `export { Name } from
"./x.thetalib"`, which 0100 pins as explicitly admitted in its
`f-export-set-control` row). Re-derived line anchors: `computeThetaLibExports`
`imports.ts:723` (not `:652`), `thetalibLocalBindings` `:741`;
`collectIdentRoots` `theta-document.ts:4844` (import arm `:4856–4864`),
`fnImportDecls` `:5719`, `resolvesToPiTool` `:5868`; the pure ident arm
`production-theta-producer.ts:6342`, `UnknownHostToolError` `:629` / `:3197`;
the closure walk's export visit `production-composition.ts:2201`;
`theta-document.ts` is 7490 lines. `import-static-checks.ts`' own anchors held
at the baseline (`collectImports:77`, `extractThetaLibForms:106`,
`materializeSymbol:156`, the miss `:187`) and have all moved since.

- What shipped:
  - `src/extension/import-static-checks.ts` — the whole of the mechanism, in
    three explicit phases inside `checkThetaImports`, all state closure-local.
    `closeOverReExports` collects the reachable `.thetalib` set and its
    re-export edges, resolving each `export` STATEMENT's path once through the
    existing `loadThetaLibImport` seam — IMP-1 on a re-export's own path, sited
    on the re-exporting lib and ranged over the statement, because the path
    belongs to the statement and not to each of its specifiers. A `fromPath`
    not ending in `.thetalib` is skipped, mirroring the import loop's extension
    skip, so the parse-time `theta/parse/import-non-thetalib-extension` stays
    the sole answer there and a 0058-refused from-less export's `""` path is
    untouched. `fixReExportedNames` computes every collected lib's resolved
    export set as a monotone least fixpoint — seeded at its declaration names,
    grown by each re-export whose source lib's set already holds its `source`,
    iterated to stability — which makes the answer a pure function of the
    `.thetalib` file set, independent of the entry lib and of the order an
    importing theta names its imports. `diagnoseReExports` then emits one
    `theta/parse/import-unknown-symbol` per re-export the settled fixpoint
    refutes, through the existing `checkImportUnknownSymbols`, sited on the
    re-exporting lib and ranged over the specifier, naming the re-export's own
    `fromPath`. `materializeChain` follows the same edges to bind an importing
    specifier to the declaration a chain ultimately names, under the importing
    specifier's local name, with `materializeSymbol`'s FN-9 subagent
    session-config re-resolution still applying at the leaf. `walkThetaLib`'s
    edge set widens to include `export … from` edges, so
    `theta/load/import-cycle` is the code that fires on a re-export cycle —
    which is also what brings this walk to the same answer as
    `collectCallableClosureSources` (§Fix constraint 7).
  - `src/parser/imports.ts` — **unchanged** (§Fix constraint 1).
    `computeThetaLibExports` keeps its two admitted sources and its one
    exclusion, and the importing specifier's own IMP-3 admission still ranges
    over that syntactic set: a re-export the analysis refutes un-registers the
    importing theta through the existing registration channel rather than by a
    second, duplicate diagnostic sited on the importer's specifier.
    `thetalibLocalBindings` is untouched, so the cka-48 no-local-binding
    property is untouched (constraint 3).
  - `docs/spec_topics/imports.md` — §Re-exports states that "creates no local
    binding" scopes to the re-exporting file's own scope and that resolving a
    re-export is a separate downstream question, that IMP-1 governs a
    re-export's path identically to an `import`'s (once per statement, ranged
    over the statement), and the fixpoint rule with its entry- and
    order-independence guarantee. §Unknown imported symbol states which file
    the `export { Foo } from` arm is reported against and that the error fails
    to register the importing theta. §Cycles names both edge kinds. The four
    productions are **unchanged** — this fix implements them (constraint 2).
  - `docs/reference/grammar.md` — the same rules in the user-facing register,
    same commit, plus a §Provenance entry. Productions unchanged.
  - `docs/spec_topics/diagnostics/code-registry-load.md` — the
    `theta/load/import-cycle` *Trigger* re-derived to name both edge kinds:
    "Static walk of the `.thetalib` graph — `import … from` edges and
    `export … from` re-export edges alike — discovers a cycle." No new code, no
    new row, no *Message* change, so the closed placeholder category table is
    untouched and `docs/reference/diagnostics.md`'s mirror row — which carries
    code, severity, phase and *Message* only, no *Trigger* column — needed no
    edit (DIAG-2 satisfied by inspection, quoted). The *Triggers* of
    `theta/parse/import-unknown-symbol` (`code-registry-parse.md:117`) and
    `theta/load/unresolvable-thetalib-path` (`code-registry-load.md:42`)
    already name `export { ... } from` specifiers and `export … from` specs by
    name, so those two arms are the enforcement of published prose, not a
    widening.
  - `docs/plan_topics/coverage-matrix.md` — inspected, **unchanged**:
    `cka-48`'s wording is scoped to the re-export creating no local binding
    *for the re-exported symbol*, the lib-local property
    `thetalibLocalBindings` implements. It says nothing about the importing
    file's binding, so this fix does not falsify it.
  - `tests/reexport-chain-resolution.test.ts` — new, 22 cells, offline and
    provider-free, built on the invariant **a re-export delivers exactly what
    the direct import of the same declaration delivers**: every row measures
    its direct-import control in the same test, pins the control absolutely
    first so no equality can pass vacuously, and asserts `materialised` before
    the runtime value. (a1) the DIAG-2 / DIAG-4 registry anchor for all three
    codes, read from the sharded pages and failing loudly on an absent row;
    (a2) the widened `import-cycle` *Trigger*; (b) the chain and its control on
    `materialised` AND the runtime value; (c) the alias row; (d) the depth-2
    chain; (e1–e4) the four use positions; (f) the schema-brand pair
    (`schemaTagOf`); (g1, g2, g3) the unknown-source-symbol, missing-file and
    wrong-extension rows, the last asserted UNCHANGED at one diagnostic;
    (g4, g5) the two-specifier statement — one IMP-1 at the statement range,
    one unknown-symbol at the specifier range; (h) the re-export cycle;
    (h-cut-order-independence) a cycle member carrying a grounded re-export,
    asserted in both import orders; (j) the provided 3-cycle, asserted from
    both entry libs; (i) the `.thetalib`-on-the-importing-side row.
  - `tests/live/live-production-acceptance.test.ts` — tail-appended H8a cell
    `CELL-E2`: a real registered theta resolves `greet` through
    `export { greet } from` to `base.thetalib`'s declaration and renders its
    call's value on the outbound wire. Additive only; no existing cell edited
    or renumbered.
- Gates:
  - Witness: `npx vitest run tests/reexport-chain-resolution.test.ts` →
    `Test Files 1 passed (1)`, `Tests 22 passed (22)`. Pre-fix the same file
    was `Tests 12 failed | 5 passed (17)` at its first pinning, every red
    naming an absent binding (`expected [] to deeply equal [ 'fn greet' ]` and
    siblings), an absent diagnostic
    (`Rendered diagnostics: []: expected +0 to be 1`) or the absent *Trigger*
    sentence.
  - Full default suite: `npm test` → `Test Files 334 passed (334)`,
    `Tests 6152 passed (6152)` (baseline at fork af221903: 333 / 6130).
  - `npm run typecheck` → clean. `npm run lint` → clean.
  - Live H8a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → `Test Files 1 passed (1)`,
    `Tests 68 passed (68)` (baseline 67), `CELL-E2` green.
  - Live H9a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/acceptance/noninteractive-acceptance.test.ts
    tests/live/acceptance/ctor-unresolved-load-refusal.test.ts` →
    `Test Files 2 passed (2)`, `Tests 11 passed (11)` (baseline 11 / 11). No
    stderr-gate widening was needed; no unpermitted diagnostic code appeared.
  - GOV-15 census at the fix baseline: 35 committed `.theta` / `.thetalib`
    files, the only `export` token being the prose word "exported" in a comment
    at `tests/live/acceptance/fixtures/acc-lib.thetalib:2`, no `export`
    statement of any form — **zero flips**. Discharged corpus-wide by
    `tests/committed-fixture-parse-gate.test.ts` (36 cells, green), not by a
    scratch probe. The three newly-emitting input classes — a re-export whose
    path does not resolve, a re-export naming a symbol nothing in the reachable
    set provides, and a re-export cycle — all loaded cleanly before and all sit
    in the carve-out's ADDITION direction.
- Review: 3 rounds. Round 1 (`bug-fix-reviewer`) — DEFECTS(3): a
  cycle-truncated export set was memoised as settled, so the diagnostic set
  depended on the importing theta's `import`-statement order, with both a false
  `import-unknown-symbol` against a correct re-export and the silent swallowing
  of a genuinely broken one; one `export` statement with N specifiers emitted N
  duplicate `theta/load/unresolvable-thetalib-path` where the import side emits
  one; and the witness header mixed two baselines in its line citations. Two
  residuals were actioned in the same round — the banned historical-reference
  comment prefixes and an overclaiming header sentence. Round 2
  (`bug-fix-reviewer`, routed deep because round 1 raised correctness) —
  DEFECTS(1), `correctness`/`spec`: the round-1 taint machinery removed
  order-dependence but not ENTRY-dependence — when a name flows through the
  cycle-guard edge, the frame one above reads a truncated set and emits a false
  `import-unknown-symbol`, proven on a 3-cycle in which every name is genuinely
  provided; this also contradicted two sentences the fix had just added to
  imports.md. Remedy chosen by the orchestrator: make the code true rather than
  weaken the sentence — replace the whole taint apparatus with the monotone
  fixpoint. Round 3 (`bug-fix-reviewer`, routed deep for the same reason) —
  CLEAN, after eleven adversarial probes (overlapping SCCs, alias chains through
  a cycle, mis-keyed hops, unresolvable-only sources, dual reachability,
  overlapping entry closures, self-re-export, unreadable source, termination),
  with three non-blocking residuals recorded below. One `bug-fix-fixer-light`
  polish round followed, for a normative sentence whose grammatical object was
  wrong; its diff touches one Markdown prose clause and no executable line, so
  the polish was verified by the gate diff and no confirmation review round was
  dispatched.
- Verification: SOLID. (1) The witness reds by arm, each neutralisation restored
  and blob-hash-verified against the pre-neutralisation working-tree hash
  (`src/extension/import-static-checks.ts`
  `dd5cfa4dabcedbe8575f5250f2f2067b9e16889b`,
  `docs/spec_topics/diagnostics/code-registry-load.md`
  `9041baff9c53d12c83225f204ed90c529020c3b9`): degenerating `materializeChain`
  to direct-only reds 11 cells; neutralising `diagnoseReExports` reds exactly
  g1, g5, h-cycle and h-cut-order-independence; dropping the IMP-1 arm reds
  exactly g2 and g4; reverting the widened cycle edge reds h-cycle,
  h-cut-order-independence and both (j) cells; reverting the *Trigger* widening
  reds exactly a2. No cell failed to red on every arm. (2) Full suite green,
  334 / 6152. (3) `CELL-E2` red-proven both directions: green, then red under
  the degenerated `materializeChain` with the signature the bug doc predicts
  (the ordinary-call throw aborts the drive before the `@`-query renders, so the
  outbound `userTexts` is empty rather than carrying the delivered value), then
  restored byte-exact and green. Both H9a files green for real. (4) Typecheck
  and lint clean. `git diff --numstat` shows only the five files this fix owns;
  every frozen fence file and `src/parser/*` is byte-identical to HEAD.
- Residuals:
  1. **`materializeChain`'s `visited` set is shared across sibling branches, so
     on error-carrying inputs `materialised` can omit a fixpoint-provided
     binding and can depend on statement order.** Two shapes were constructed in
     review: a diamond where a dead first branch pollutes the shared set and
     cuts a valid second branch through the same node, and a rename bounce-back
     cycle whose derivation must revisit its entry lib. Unobservable in
     production — every such input provably carries an error-severity diagnostic
     (an invalid edge draws `theta/parse/import-unknown-symbol`, a revisit on
     the current path draws `theta/load/import-cycle`), and
     `src/extension/production-composition.ts` discards the `imports` list on
     any error diagnostic, so the divergent output is dead. Bug 0101's
     clean-gates-no-binding class therefore cannot recur. A per-branch visited
     set, or materialising off the settled fixpoint, would make the dead output
     consistent. Unfiled.
  2. **The analysis runs over the libs reachable from the importing theta's
     DIRECT imports and their re-export closure, not over libs reached only
     through a plain `import` inside another lib.** A broken re-export inside a
     plain-import-reached lib is therefore silent. Consistent with the
     pre-existing depth of the walk (`walkThetaLib` discards `load.diagnostics`
     for transitive `import` edges too, and a transitive lib's own import
     specifiers were never unknown-symbol-checked), and functionally inert
     because a plain-import local is excluded from export sets and so cannot
     feed the importer's bindings. Unfiled.
  3. **A resolved-but-unreadable source lib reads as an empty export set**, so a
     re-export from it draws `theta/parse/import-unknown-symbol` rather than a
     read-failure code. Defensible — the file provides nothing — and it mirrors
     the import side's silent `continue`, but no witness cell pins it. Unfiled.
  4. **The printed cycle path in `theta/load/import-cycle`'s message rotates
     with the importing theta's statement order,** because the IMP-5 loop
     iterates `entryStems` in import order and breaks on the first hit. Measured
     both ways on the (j) fixture: same code, same severity, same count, only
     the printed path rotates. Pre-existing HEAD behaviour on the import side,
     inherited by the widened edge set; the witness asserts containment of each
     lib name rather than the printed order. Unfiled.
  5. **Two frozen fence test files carry now-stale
     `src/extension/import-static-checks.ts:<line>` comment citations** —
     `tests/import-export-from-clause-required.test.ts` (comments near lines 20,
     228, 333, 499) and
     `tests/import-specifier-list-production-required.test.ts` (near 293, 419,
     872, 889, 926). Some were already stale before this fix (bug 0100 recorded
     the same class as its residual 4); the rest were exact at `af221903` and
     this fix's +253 lines in that module shifted them. Both files are frozen —
     existing tests change only with bug-doc pre-authorization, and there is
     none — so they were deliberately left byte-identical to HEAD and verified
     green (250 fence assertions pass; comments do not affect execution).
     Refreshing them needs a doc-authorized pass.
  6. **Line-anchor drift in the pages this fix amends.**
     `docs/spec_topics/imports.md` net **+25** and `docs/reference/grammar.md`
     net **+19**, so every line citation into those pages below the insertion
     points is stale by that amount — carriers include bug documents 0058, 0100,
     this one, 0040, 0118, 0127, 0132, 0138, 0140 and 0191, plus the two frozen
     fence tests and the new witness.
     `docs/spec_topics/diagnostics/code-registry-load.md` is net **0** (an
     in-place one-line *Trigger* rewrite). §Fix constraints 2, 3 and 4 make the
     re-derivation mandatory, so the drift is inherent to the fix rather than
     avoidable; no shipped test reads either page by line number (full suite
     green).
- Discharge notes appended: none. No sibling document's subject was closed here.
  Bug 0058's §Fix *Residuals* item (ii) — the observation this report is the
  filing of — is closed BY this fix, but 0058's record is a shipped historical
  record and was not amended.
- Pinned dispositions / non-goals: every §Non-goals item is untouched. The
  `unresolved` arm's five different consumers keep their dispositions — cell
  (e3) pins that a bare identifier read is `null` for a MATERIALISED import too
  (the pure evaluator's `case "ident"` reads `null` for every non-local arm), so
  the fix delivers the binding without adjudicating that arm. The
  `PiToolArgShapeDefectError` message text is unchanged, and DIAG-4 defers a
  *Message* reword regardless. `thetalibLocalBindings` still has no `src/`
  caller. The `.theta` `export` question is untouched. Cell (i), the
  `.thetalib`-on-the-importing-side row, is a FENCE rather than a witness, and
  the reason is measured: its direct-import control throws identically, because
  a lib's own `import` is never materialised into its importer and `wrap`'s body
  runs in the caller's environment. That is a distinct, unfiled gap and
  deliberately out of scope here — materialising a lib's own imports into its
  importer would flip (i)'s equality assertion.
