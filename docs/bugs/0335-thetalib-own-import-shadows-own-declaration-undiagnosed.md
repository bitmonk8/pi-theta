# Bug 0335 — Inside a `.thetalib`, a name bound by BOTH the library's own `import` and its own top-level `fn`/`enum`/`schema` declaration is silently shadowed with no diagnostic — and the surviving binding is not even consistent: a `fn` collision resolves to the OWN declaration, an `enum`/`schema` collision resolves to the IMPORTED one, and the same enum name read inside the library resolves to a DIFFERENT declaration than the same name imported out of it

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 because the spec refuses this input
  (`imports.md:124`: an imported symbol colliding with a same-file top-level
  declaration is `theta/parse/import-name-collision`, "no implicit shadowing")
  yet the runtime admits it with zero diagnostics and silently binds one of
  the two colliding declarations, so a library body computes against a
  declaration its author did not intend and no gate warns; D2 because the
  fix runs the existing `checkImportNameCollisions` arm over each resolved
  dependency `.thetalib`'s own specifiers in the load pass that already parses
  them — one subsystem, the existing `theta/parse/import-name-collision` code
  reused, no new registry row.
- **Kind:** defect — `imports.md:124` states the collision rule for "a
  top-level declaration in the same file" without restricting it to `.theta`
  files, and `imports.md:14` (the 0.291.0 declaring-scope rule) makes a
  library body resolve free names against "its own hoisted top-level
  declarations **and** its own materialised imports" without saying which wins
  when both bind the same name. The implementation neither diagnoses the
  collision nor resolves it consistently: the parse-phase collision arm
  (`checkImportNameCollisions`, `src/parser/imports.ts`) exists and fires for
  the SAME collision written in a `.theta` file (measured), but the load pass
  never runs it over a resolved dependency `.thetalib`'s own import specifiers.
- **Related:**
  - [0303](./0303-imported-fn-body-resolves-in-caller-scope.md) — fixed
    (0.291.0). Its ModuleScope materialisation (a per-declaring-module env
    built from "own hoisted decls + recursively materialised imports") is what
    makes this collision reachable: before 0.291.0 a library whose body used
    its own import was wholly non-functional, so a collision between the two
    sources could not surface. Its fix record filed this exact case as a
    residual ("a `.thetalib` carrying both `enum Color` and
    `import { Color } from …` is an undiagnosed own-import-vs-own-declaration
    collision … the theta-side `import-name-collision` check runs only over
    the importing theta's own specifiers"); this report is that filing.
  - 0334 (importer-side multi-source collisions, filed in parallel) — a
    DISJOINT mechanism, not one shared with this report. The importer-side and
    plain-`.theta` collision arms already fire (`checkImportNameCollisions`
    runs over the composing theta's own specifiers + top-level names —
    measured: an `import { X }` + `fn X` in a `.theta` yields
    `theta/parse/import-name-collision`). This report's gap is the ABSENCE of
    that same arm over a resolved dependency `.thetalib`; the two fixes touch
    different call sites of the one shared check.
  - [0191](./0191-enum-name-shadowed-by-schema-fabricates-member-type.md) —
    a same-file enum/schema name-shadow class; distinct in that both colliding
    declarations there are the file's own, and the fabrication is a type-level
    effect rather than a materialisation-order winner.
- **Affected** (citations verified at `52712fb3`, v0.294.0):
  - `checkThetaImports` (`src/extension/import-static-checks.ts`) — calls
    `checkImportNameCollisions` exactly once, over `input.sourcePath` /
    `allSpecifiers` / `localTopLevelNames`: the COMPOSING theta's own import
    specifiers and its own top-level declaration names. No resolved dependency
    `.thetalib`'s own specifiers are ever passed to the collision arm, so a
    library that imports `X` and declares `X` is never checked.
  - `buildModuleScope` (`src/extension/import-static-checks.ts`) — assembles
    the declaring library's `ModuleScope` as `{ body, imports, enums }` (own
    hoisted declarations via the body, own materialised imports, own enum
    registrations via `enumsOf`) with no check that a name appears in more
    than one of the three sources.
  - The `LexicalEnvironment` constructor
    (`src/runtime/lexical-environment.ts`) — for a root scope it first hoists
    own declarations (`this.fns` / `this.schemas` / `this.enums` from
    `inputs.body.statements` and `inputs.enums`), THEN loops
    `inputs.imports`, which sets `this.imports` and, for an imported `schema`
    or `enum`, calls `this.schemas.set(imp.name, …)` / `this.enums.set(imp.name, …)`
    AGAIN — overwriting the own registration. So a colliding `enum`/`schema`
    ends with the IMPORTED registration.
  - `resolve` (`src/runtime/lexical-environment.ts`) — a bare identifier is
    resolved local → `root.fns` → `root.imports` → callable. The `fn` arm is
    consulted BEFORE the import arm, so a colliding `fn` resolves to the OWN
    declaration (opposite the enum/schema outcome above).
  - `materializeSymbol` (`src/extension/import-static-checks.ts`) — resolves
    an importer's specifier by walking the resolved library's own
    `body.statements` and returning the FIRST matching top-level declaration;
    the library's own imports are not consulted here. So an importer that
    imports the colliding name out of the library binds the library's OWN
    declaration — the opposite winner from the enum read inside the library.
  - `checkImportNameCollisions` (`src/parser/imports.ts`) — the arm that
    already implements `imports.md:124` (an imported local name colliding with
    a same-file top-level name is `theta/parse/import-name-collision`); it is
    never invoked with a dependency library's own specifiers.
  - `docs/spec_topics/imports.md:14` — the declaring-scope rule: a library
    body's free names resolve against "its own hoisted top-level declarations
    and its own materialised imports"; silent on the both-bind-the-same-name
    case.
  - `docs/spec_topics/imports.md:124` — "An imported symbol whose name
    collides with a top-level declaration in the same file is also
    `theta/parse/import-name-collision` — no implicit shadowing." Not
    restricted to `.theta` files.
- **Observed at:** `0.294.0` (`52712fb3`). Offline, deterministic; no live
  model. Scratch vitest: real `parseThetaDocument`, real `checkThetaImports`
  over an in-memory `FileSystem`, real `executeBody` bound through
  `createProductionProducerDeps(...).bindPromptConversation` with a frozen
  empty callable set (the `tests/b0303-imported-fn-body-declaring-scope.test.ts`
  `measure()` harness). Written, run, deleted.

## Summary

A `.thetalib` may both `import { X } from "./other.thetalib"` and declare its
own top-level `fn`/`enum`/`schema X`. `imports.md:124` refuses that collision —
`theta/parse/import-name-collision`, no implicit shadowing — but the collision
arm (`checkImportNameCollisions`) runs only over the composing theta's own
specifiers, never over a resolved dependency library's. So the collision loads
clean (zero diagnostics) and one binding silently shadows the other in the
library's module scope.

The surviving binding is not consistent across declaration kinds or read sites,
because two independent registration paths disagree:

- a colliding **`fn`** resolves to the library's OWN declaration (`resolve`
  consults `root.fns` before `root.imports`);
- a colliding **`enum`** or **`schema`** resolves to the IMPORTED declaration
  (the constructor's import loop overwrites the own registration in
  `this.enums` / `this.schemas`);
- the SAME enum name read inside the library resolves to the imported
  declaration, but imported OUT of the library by a caller it resolves to the
  library's own declaration (`materializeSymbol` returns the first own
  top-level match) — so `X` inside the library and `X` imported from it are
  two different declarations under one name.

## Reproduction

Offline at `52712fb3`. `libB.thetalib` declares the imported symbol;
`libA.thetalib` both imports it from `libB` and declares its own same-named
symbol, plus a `probe` fn that reads the collided name; `app.theta` imports and
calls `probe`. `diags` = `checkThetaImports(...).diagnostics`. All library
declarations are convention-cased (lowercase `fn`, uppercase type) so
`binding-case-mismatch` noise is absent.

### R1 — colliding `fn`: no diagnostic; OWN declaration wins

```
@@ libB  fn helper(): integer { 111 }
   libA  import { helper } from "./libB.thetalib"
         fn helper(): integer { 222 }
         fn probe(): integer { helper() }
   app   import { probe } from "./libA.thetalib" + probe()
   diags   :: []
   runtime :: value=222          ← libA's OWN helper; libB's imported helper is dead
```

### R2 — colliding `enum`: no diagnostic; IMPORTED declaration wins

```
@@ libB  enum X { A = "b-wire" }
   libA  import { X } from "./libB.thetalib"
         enum X { A = "a-wire" }
         fn probe(): X { X.A }
   app   import { probe } from "./libA.thetalib" + probe()
   diags   :: []
   runtime :: value="b-wire"     ← libB's IMPORTED X; libA's OWN X.A ("a-wire") is dead
```

### R3 — colliding `schema`: no diagnostic; imported registration overwrites

```
@@ libB  schema X { b: integer }
   libA  import { X } from "./libB.thetalib"
         schema X { a: integer }
         fn probe(): X { X { a: 9 } }
   app   import { probe } from "./libA.thetalib" + probe()
   diags   :: []
   runtime :: value={ a: 9 } tag "X"
```

The constructor's import loop overwrites `this.schemas` with a fieldless
synthetic for the imported `X`, so the imported registration wins at the
registry; the constructed value keeps field `a` only because constructor field
typing is separately unchecked (bug 0031), so the runtime value does not
witness the overwrite as sharply as the enum wire does.

### R4 — the winner differs between a library-body read and an importer read

```
@@ libB  enum X { A = "b-wire" }
   libA  import { X } from "./libB.thetalib"
         enum X { A = "a-wire" }
   app   import { X } from "./libA.thetalib" + X.A
   diags   :: []
   runtime :: value="a-wire"     ← libA's OWN X (materializeSymbol first-match)
```

Contrast R2: inside `libA` the read of `X.A` is `"b-wire"` (imported), while an
importer reading `X.A` out of `libA` gets `"a-wire"` (own). One source name,
two declarations, depending on which side reads it.

### Control — no collision, resolves cleanly

```
@@ libB  fn other(): integer { 111 }
   libA  import { other } from "./libB.thetalib"
         fn helper(): integer { 222 }
         fn probe(): integer { helper() + other() }
   app   import { probe } from "./libA.thetalib" + probe()
   diags   :: []
   runtime :: value=333
```

### Theta-side control — the SAME collision in a `.theta` DOES diagnose

```
@@ libB  fn helper(): integer { 111 }
   app   import { helper } from "./libB.thetalib"
         fn helper(): integer { 222 }
         helper()
   diags   :: [error theta/parse/import-name-collision: imported symbol 'helper'
               collides with another import or top-level declaration]
```

The identical collision written in a composing `.theta` fires the diagnostic;
only the dependency-`.thetalib` path is unchecked. (An `enum X` + `import { X }`
in a `.theta` fires it too.)

## Expected behaviour

- `imports.md:124`: an imported symbol whose name collides with a top-level
  declaration in the same file is `theta/parse/import-name-collision`, with no
  implicit shadowing. The rule names "the same file" and does not exempt
  `.thetalib` files; a library that imports `X` and declares `X` is exactly
  that collision.
- `imports.md:14` licenses a library body to reference both its own hoisted
  declarations and its own materialised imports; when both bind one name the
  program is ambiguous, which is why `imports.md:124` refuses it rather than
  picking a winner. The runtime must not silently pick one — and must not pick
  a DIFFERENT one per declaration kind or per read site.
- The theta-side control shows the intended disposition already exists for the
  same collision in a `.theta`; the dependency-`.thetalib` path must mirror it.

## Actual behaviour / root cause

`checkThetaImports` (`src/extension/import-static-checks.ts`) invokes
`checkImportNameCollisions` once, over the composing theta's `input.sourcePath`,
`allSpecifiers` (the union of the composing theta's own `import … from`
specifiers), and `localTopLevelNames` (the composing theta's own top-level
declaration names). A resolved dependency `.thetalib` is parsed
(`parseThetaLib`, cached in `parseCache`) and its `ModuleScope` is assembled by
`buildModuleScope` from `{ body, imports, enums }`, but neither pass ever runs
the collision arm over the library's own specifiers against its own top-level
names. The collision therefore loads clean.

At runtime the winner is decided by whichever of two registration paths the
name flows through:

- The `LexicalEnvironment` constructor (`src/runtime/lexical-environment.ts`)
  hoists own declarations first (`this.fns` / `this.schemas` / `this.enums`),
  then loops `inputs.imports`; the import loop overwrites `this.schemas` /
  `this.enums` for an imported `schema` / `enum`. `resolve` consults
  `root.fns` before `root.imports`. So a colliding `fn` keeps its OWN
  declaration (the import registers into `this.imports`, shadowed by the
  earlier `root.fns` hit), while a colliding `enum`/`schema` ends on the
  IMPORTED registration (the import loop overwrote the own entry).
- `materializeSymbol` (`src/extension/import-static-checks.ts`) resolves an
  importer's specifier by returning the first matching top-level declaration in
  the library's own `body.statements`, ignoring the library's own imports. So a
  caller importing the colliding name binds the library's OWN declaration —
  the opposite winner from the enum read inside the library (R2 vs R4).

## Why it matters

- **Silent wrong values, zero diagnostics** (R1–R3): the library computes
  against a declaration its author did not intend — the imported one for an
  enum/schema, the own one for a fn — and no gate on either side warns. The
  spec refuses the input; the runtime accepts it.
- **The winner is incoherent** (R2 vs R4): one source name resolves to two
  different declarations depending on whether it is read inside the library or
  imported out of it. Any reasoning about a library's public surface breaks:
  an enum a caller imports is not the enum the library's own bodies use.
- **The disposition already exists** for the same collision in a `.theta`
  (theta-side control), so the gap is a missing application of an implemented
  check, not an unresolved design question.
- **No shipped fixture composes a colliding library**, so nothing in the
  committed corpus witnesses the class; it became reachable only with 0303's
  0.291.0 ModuleScope materialisation.

## Fix

Run the existing collision arm over every resolved dependency `.thetalib`'s own
specifiers during the load pass that already parses them. In `checkThetaImports`
(`src/extension/import-static-checks.ts`), for each resolved library body
reached through `parseCache` / `buildModuleScope`, call
`checkImportNameCollisions` (`src/parser/imports.ts`) with the library's own
`import … from` specifiers and the library's own top-level declaration names
(the `collectTopLevelNames` the composing-theta arm already uses). Emit the
existing `theta/parse/import-name-collision` code — adjudicable in lane, no new
registry row — against the offending library file, and surface it as a
registration error so it fails to register the importing theta through the same
load-time channel IMP-4 uses for an illegal `.thetalib` top-level form. This
mirrors the theta-side disposition measured above (the same collision in a
`.theta` already fires this code), which the fix owes as its consistency oracle.

The fix removes the ambiguity at load, so neither runtime winner path
(`resolve`'s fn precedence, the constructor's enum/schema overwrite,
`materializeSymbol`'s first-match) is reached for a colliding name — none of
those resolution orders needs to change. A same-commit sentence in
`imports.md` (§Name collisions / §`.thetalib` file rules) should state that the
collision rule applies to a `.thetalib`'s own imports against its own top-level
declarations, closing the `imports.md:14` silence on the both-bind case.

Depends on nothing open: 0303 (the ModuleScope materialisation that makes the
collision reachable) is fixed at 0.291.0.

## Provenance

- Origin: bug 0303's fix record, residual 3 — "a `.thetalib` carrying both
  `enum Color` and `import { Color } from …` is an undiagnosed
  own-import-vs-own-declaration collision (the theta-side
  `import-name-collision` check runs only over the importing theta's own
  specifiers)". This report widens it from the enum case to `fn`/`enum`/`schema`
  and measures the incoherent winner across kinds and read sites.
- Spec: `docs/spec_topics/imports.md:14` (declaring-scope free-name rule),
  `docs/spec_topics/imports.md:124` (§Name collisions, "no implicit shadowing").
- Implementation evidence at `52712fb3`: `checkThetaImports`,
  `buildModuleScope`, `materializeSymbol` (`src/extension/import-static-checks.ts`);
  the `LexicalEnvironment` constructor and `resolve`
  (`src/runtime/lexical-environment.ts`); `checkImportNameCollisions`
  (`src/parser/imports.ts`).
- Probes: scratch vitest cells R1–R4 + control + theta-side control at
  `52712fb3`, outputs quoted verbatim; file `tests/b0335scratch.test.ts`
  written, run, deleted per scratch policy. No non-scratch file modified.
