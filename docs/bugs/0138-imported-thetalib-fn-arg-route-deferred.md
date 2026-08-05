# Bug 0138 — `theta/parse/fn-arg-type-mismatch`'s registered Trigger names "a same-file **or imported `.thetalib`** function call", and bug 0050's wiring covers only the same-file half: `checkFnCallArgs` returns on `importedSymbols.has(e.callee)` (`type-layer-checks.ts:1582`), so `rate_strictness(3)` against an imported `fn rate_strictness(a: Author)` loads clean while the byte-identical same-file call is refused at `E`

- **Status:** open. §Fix is not settled: three routes are enumerated with their
  consequences and the constraints are pinned, but the disposition — parse-layer
  carriage, compose-layer check, or a DIAG-2 Trigger narrowing — is left to the
  run. No ordering dependency blocks it;
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) is
  **fixed (0.77.0)** and is this report's substrate, and the coordination
  constraints on its witness are in §Fix (e).
- **Sev/Diff estimate:** S3/D3 — half of a registered `E`-severity row's
  *Trigger* has no emission site, so the imported-`.thetalib` argument position
  is unchecked at parse (measured: zero diagnostics) and unvalidated at runtime
  (`evalUserFnCall` binds each argument with `defineLocal` and no type test,
  `src/runtime/statement-executor.ts:411–417`, reached for an imported callee
  through `resolveUserFn`'s `arm === "import"` admission at `:379`); no wrong
  value or wrong message is produced, and the deferral is admissible under
  `type-system.md:48`, which is what keeps it out of S1/S2. D3 because covering
  the route carries an imported `fn`'s signature **and** the declaring file's
  declarations across a file boundary that the check's own host
  (`checkTypeLayer` inside `parseThetaDocument`) does not cross, needs an
  in-run adjudication of where the check lives and whether DIAG-2 is engaged,
  spans the parser and extension layers, and lands against bug 0072's namespace
  constraint plus 0050's 84-cell witness under a deliberate-update pin.
- **Kind:** coverage gap — implementation, against one registered *Trigger*,
  with a spec rule licensing the current disposition. Two elements:
  1. **A registered route has no emission site.** The row's *Trigger*
     (`docs/spec_topics/diagnostics/code-registry-parse.md:116`) reads "A plain
     top-level `fn` call `f(args)` — **a same-file or imported `.thetalib`
     function call** that is neither an `invoke(...)` nor a `.theta`-callable
     call — passes an argument whose static type is not compatible with the
     matched parameter's declared type." `checkFnCallArgs`
     (`src/parser/type-layer-checks.ts:1575`) resolves the callee in four arms;
     the second (`:1582–1589`) tests `this.importedSymbols.has(e.callee)` and
     returns. No other site in `src/` emits the code: `rg -n
     'theta/parse/fn-arg-type-mismatch' src/` returns three lines in two files —
     `src/parser/type-compat.ts:446` (the emitter's doc comment), `:472` (the
     sole construction of the code, inside `checkFnArgCompat`, `:452–480`), and
     `src/parser/type-layer-checks.ts:1571` (the caller's doc comment) — and
     `checkFnArgCompat` has exactly one caller, `checkFnCallArgs`. The registry row also asserts
     that nothing backstops the position — "Always parse-time … so no runtime
     AJV safety net applies" — and the runtime confirms it: `evalUserFnCall`
     (`src/runtime/statement-executor.ts:395–425`) evaluates each argument and
     binds it (`:416`) with no type test, on the same path an imported callee
     takes (`resolveUserFn`, `:377–380`).
  2. **The deferral is licensed, and that is why this is a coverage gap and not
     a defect against `type-system.md:48`.** A single-file parse carries no
     imported `fn`'s parameter types: `checkTypeLayer`
     (`src/parser/type-layer-checks.ts:235–260`) is called from
     `parseThetaDocument` (`src/parser/theta-document.ts:758`, the call at
     `:887–891`) over one file's `statements`, and import resolution happens
     later at compose (`checkThetaImports`,
     `src/extension/production-composition.ts:802`). `type-system.md:48`
     §*Unresolvable operands* skips a check whose operand is "past the parser's
     static view", and 0050 §Fix pre-authorised exactly this reading:
     "Deferring on an unresolved imported signature is admissible under
     `type-system.md:48`; silently dropping the route is not, because the
     Trigger names it." The arm is named, commented and cell-pinned, so the
     route is deferred rather than dropped. What is not settled is whether the
     Trigger keeps promising a route the implementation defers on **every**
     input that reaches it.
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the origin and the substrate. Its subject was the whole
    row: `checkFnArgCompat` had no caller in `src/`, so no input at all fired
    the code. Its fix wired one emission site and settled two scope questions;
    the second is this report's subject, recorded in its §Fix (0.77.0) as "the
    imported-`.thetalib` route DEFERS by a named arm with the flip condition
    stated (cell i1; filed as bug 0138)" and in its fix report's residual 2.
    **This is not a duplicate of 0050 and closing it as one would be wrong**:
    0050's defect is closed by measurement — the same-file half now fires (row
    a2 below), which it did not at 0050's baseline — and this report's rows are
    measured after that fix. What remains is the half its wiring did not reach.
  - [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **fixed
    (0.65.0)**, and binding on any fix here. Its namespace lesson constrains
    cross-file type resolution: a type annotation sourced from another file must
    never resolve through the current file's `TypeEnv`; an honestly-empty one is
    required. Its own *Coordination note (0.77.0)* (`:654–665`) records 0050
    reusing its soundness discipline in-layer (`provableArgType` /
    `isProvenReduction`) because `collectProvableArgTypes` is extension-layer and
    importing it into `src/parser/**` would invert the dependency direction —
    the same layering wall any cross-file carriage meets. Row a7 measures the
    consequence: with an honestly-empty environment a `named` parameter type is
    unresolvable and `checkFnArgCompat` defers anyway, so the signature alone
    covers only part of the route.
  - [0131](./0131-in-document-fn-call-arity-unchecked.md) — **open**, the
    neighbouring uncovered obligation at the same call node. It owns argument
    *count*; this report owns argument *type* across the file boundary. Both are
    reachable from the resolved callee `checkFnCallArgs` already holds, and row
    d5 measures that an imported call with zero arguments draws nothing either —
    recorded as a bound, not claimed here.
  - [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — **open**,
    and relevant to any GOV-15 sweep. `tests/committed-fixture-parse-gate.test.ts`
    filters `.theta` only, so it cannot witness `docs/examples/personas.thetalib`
    — the file declaring the only imported `fn` in the shipped corpus (`:7`).
  - [0136](./0136-member-access-types-as-field-name-not-field-type.md) — **open**,
    the substrate's minted names. Disjoint: this report's gap is a callee the
    parse cannot see at all, not a receiver typed by the wrong name. A fix here
    inherits 0050's withholding discipline unchanged.
- **Affected** (every citation verified at HEAD `3efdb4ac`, 0.77.0):
  - **The deferral arm** — `src/parser/type-layer-checks.ts:1582–1589`, arm 2 of
    `checkFnCallArgs` (declared `:1575`, doc comment `:1566–1574`):

    ```ts
    if (this.importedSymbols.has(e.callee)) {
      // A documented deferral, not a dropped route: the registry Trigger
      // names a same-file OR imported `.thetalib` function call, but a
      // single-file parse carries no imported `fn`'s parameter types.
      // type-system.md §"Unresolvable operands" defers a check whose operand
      // is past the parser's static view.
      return;
    }
    ```

    It precedes the `fnDecls` lookup (`:1590`) and the emission loop
    (`:1598–1626`), so an imported callee never reaches either.
  - **The set it tests** — `collectImportedSymbols`
    (`src/parser/type-layer-checks.ts:472–482`, doc comment `:464–471`): every
    `import` declaration's LOCAL binding name — the `as`-alias where written,
    else the source name. Called once per parse at `:244`; threaded into
    `TypeLayerWalk` as a constructor dependency at `:920`. The `as` form is why
    row a6 defers under a different spelling.
  - **The check's host, and its file scope** — `checkTypeLayer`
    (`:235–260`) takes one `ThetaBody` and one `file`; `collectTypeEnv`
    (`:244`'s neighbour, the `TypeEnv` source) walks that body's statements
    only. `parseThetaDocument` (`src/parser/theta-document.ts:758`) calls it at
    `:887–891`. Nothing in the parse layer reads another file.
  - **Where the imported signature does exist** —
    `src/extension/import-static-checks.ts:281` (`checkThetaImports`), called at
    compose from `src/extension/production-composition.ts:802`. It resolves each
    `.thetalib` (IMP-1), parses it into a full `ThetaDocument` (`:385`), computes
    its export set (`:399–400`) and materialises each imported symbol into the
    runtime environment (`:417`). **The parsed library body is in hand at that
    point**, and the file already runs one cross-file static check over it:
    `checkSubagentFnStaticResolution` per parsed lib (`:458–468`), with
    `checkSubagentFnModelOverrides` beside it (`:474–479`).
  - **The emitter, unchanged and correct** — `checkFnArgCompat`,
    `src/parser/type-compat.ts:452–480`: the deferral arm `:462–465`
    (`"compatible"` or `"unknown"` → no diagnostic), the code `:472`, the
    registered message `:475–477`. Its `"unknown"` answer comes from
    `checkCompatible` (`:139`) and is what makes an unresolvable `named`
    parameter type defer even when the signature is known (row a7).
  - **The runtime that binds the argument** —
    `src/runtime/statement-executor.ts:377–380` (`resolveUserFn`; `:379` admits
    `r.arm === "import"`, so an imported `fn` call is a user-`fn` call at
    runtime), `:395–425` (`evalUserFnCall`), `:416` (`scope.defineLocal(...)` —
    the argument is bound with no type test). The registry row's "no runtime AJV
    safety net applies" holds for this route as it does for the same-file one.
  - **The registration decision** —
    `src/extension/production-composition.ts:2045` (`hasLoadParseError`): an
    error-severity `theta/parse/*` or `theta/load/*` denies registration. That is
    what makes row a2's refusal and row a1's silence a load/no-load difference,
    not a message difference.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:116` — the row. Sev `E`,
    phase `type`. Mirrors, neither carrying a *Trigger* column:
    `docs/reference/diagnostics.md:165` (the *Message*),
    `docs/reference/type-system.md:66` (the site list).
  - `docs/spec_topics/type-system.md:48` — *Unresolvable operands*, the rule
    licensing element 2; `:50` — TYPE-9, which names this code for "an argument
    to a top-level `fn` call that is neither an `invoke(...)` nor a
    `.theta`-callable call" and does not distinguish same-file from imported;
    `:52` — TYPE-10, which routes a cross-named-schema mismatch here "not
    deferred to a runtime AJV failure".
  - `docs/spec_topics/expressions.md:44–49` — identifier resolution in call
    position: arm (2) is a same-file top-level `fn`, arm (3) "A symbol imported
    from a `.thetalib` file". The Trigger's two halves are these two arms.
  - `docs/spec_topics/imports.md:14` — a `.thetalib` `fn` body runs the full
    language against the calling `.theta`'s conversation; `:27` — every top-level
    `schema`, `enum` and `fn` in a `.thetalib` is implicitly exported. There is no
    sentence anywhere in `imports.md` stating that an imported call's arguments
    are type-checked, or that they are not; the promise lives only in the registry
    Trigger and TYPE-9.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; a *Trigger* change is a spec change landing in the same commit,
    dispositioned under the GOV-15 carve-out); `:74` — DIAG-4 (the *Message*
    column is normative; unchanged by every route below).
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15; `:9` —
    the loads-cleanly predicate; `:25` — the diagnostic-registry carve-out, whose
    addition arm covers inputs newly brought into a code's emission set.
  - **The shipped corpus site** — `docs/examples/personas.thetalib:7`
    (`fn rate_strictness(a: Author): Result<integer, QueryError>`, with
    `schema Author` at `:1–5`) and `docs/examples/import-thetalib.theta:7`
    (the `import`) and `:9` (`let strictness = rate_strictness(reviewer)?`). This
    is the only imported-`fn` call site in the corpus, and its argument is the
    frontmatter `params:` field `reviewer` — so it defers on the argument side
    too and observes no change under any route below (rows c1, c2).
  - **Existing coverage** — `tests/fn-arg-type-mismatch-wired.test.ts`, bug
    0050's witness, **84 cells, green at HEAD**. Cell `i1` (`:1193–1215`, fixture
    `I1` at `:690–691`) pins this deferral and names the flip condition in terms:
    "a later change that resolves imported signatures SHOULD red it, and the
    right response then is to flip it to an expected emission (`fn
    'rate_strictness' argument 0 ('a') type mismatch: expected Author, got
    integer` against `docs/examples/personas.thetalib:7`), not to weaken it." The
    file's SPEC ANCHORS block records the Trigger reading at `:135–139` and the
    deferral rule at `:144–145`; cell `e1` (`:2779–2820`) holds the corpus lock
    and names the shipped import call site at `:2781–2783`. **No test measures
    the imported route in the emitting direction**, because no input produces one.
- **Observed at:** `0.77.0` (HEAD `3efdb4ac`). Offline, deterministic; no live
  model, no provider. Parse rows through the production `parseThetaDocument` over
  the shared `parseDoc` harness (`tests/helpers/e2e-s1.ts:39`); compose rows
  through the shipped `checkThetaImports`
  (`src/extension/import-static-checks.ts:281`) over an in-memory `FileSystem`
  double exposing `readdir` / `readBytes` — the shape
  `tests/import-export-from-clause-required.test.ts:246–305` establishes. Four
  scratch vitest files, run on the outputs quoted below, then deleted. `src/`,
  `tests/`, `docs/bugs/README.md` and every other bug document are unmodified by
  this filing.

## Summary

`theta/parse/fn-arg-type-mismatch` is registered with a *Trigger* naming two call
shapes: a same-file top-level `fn` call, and an imported-`.thetalib` `fn` call
(`code-registry-parse.md:116`). Bug 0050's fix (0.77.0) gave the row its one
emission site. That site covers the first shape.

`checkFnCallArgs` resolves the callee in four arms. Arm 2
(`type-layer-checks.ts:1582–1589`) tests `this.importedSymbols.has(e.callee)` and
returns before the `fnDecls` lookup and the emission loop. The arm is named,
commented and pinned by cell `i1` of the 84-cell witness, and its stated reason is
sound: `checkTypeLayer` runs inside `parseThetaDocument` over one file's
statements, so no imported `fn`'s parameter types are in view; `type-system.md:48`
skips a check whose operand is past the parser's static view. Import resolution
happens later, at compose (`production-composition.ts:802`).

The consequence is measured, not inferred. `import { rate_strictness } from
"./personas.thetalib"` + `let r = rate_strictness(3)` produces **zero**
diagnostics. The byte-identical call against the byte-identical signature declared
in the same file produces `error theta/parse/fn-arg-type-mismatch: fn
'rate_strictness' argument 0 ('a') type mismatch: expected Author, got integer`,
which is `E`, so `hasLoadParseError` denies registration. One theta loads and one
does not, and the difference is which file the callee was declared in.

The gap is not confined to named-schema parameters. `fn helper(n: number)` in a
library, called `helper("s")`, is equally silent (row a3) while the same-file
spelling fires (a4). It survives the `as` alias (a6), it holds inside a
`.thetalib` importing another `.thetalib` (d3), and it is not repaired at compose:
`checkThetaImports` — which parses the resolved library, holds its full body, and
already runs two cross-file static checks over it — produces zero diagnostics for
the same fixture (rows b1, b2).

**Covering the route needs two things, not one.** Row a7 measures the second:
`fn rate_strictness(a: Author)` declared in the same file with `Author`
*undeclared* also produces zero diagnostics, because `checkCompatible` answers
`"unknown"` for an unresolvable `named` and `checkFnArgCompat` defers
(`type-compat.ts:462–465`). Carrying the imported signature alone therefore covers
only parameter types that need no declaration — `number`, `string`, literals,
arrays of those. A `named` parameter type additionally needs the *declaring
file's* declarations, and bug 0072's namespace lesson binds how: an annotation
sourced from another file must never resolve through the importing file's
`TypeEnv`; an honestly-empty one is required.

## Reproduction

Offline, deterministic, at `3efdb4ac`. Parse rows: the production
`parseThetaDocument` through `parseDoc` (`tests/helpers/e2e-s1.ts:39`), with
`---\nmodel: "sonnet"\nmode: prompt\n---\n` prepended and a trailing `r` supplying
the theta's final value. Compose rows: the shipped `checkThetaImports` over an
in-memory `FileSystem` double. Each cell is the whole diagnostic list, unfiltered,
rendered `<severity> <code>: <message>`.

`PERSONAS` below is `docs/examples/personas.thetalib`'s shape — `schema Author {
name: string, role: string, experience_years: integer }` plus
`fn rate_strictness(a: Author): Result<integer, QueryError>`. `PRIM_LIB` is
`fn helper(n: number): number { n }`.

### (a) The route, against its same-file control

```
@@ a1  import { rate_strictness } from "./personas.thetalib" / let r = rate_strictness(3)
   []
@@ a2  [control] PERSONAS declared in the same file / let r = rate_strictness(3)
   ["error theta/parse/fn-arg-type-mismatch: fn 'rate_strictness' argument 0 ('a')
     type mismatch: expected Author, got integer"]
@@ a3  import { helper } from "./prim.thetalib" / let r = helper("s")
   []
@@ a4  [control] PRIM_LIB declared in the same file / let r = helper("s")
   ["error theta/parse/fn-arg-type-mismatch: fn 'helper' argument 0 ('n')
     type mismatch: expected number, got string"]
@@ a5  import { rate_strictness } … / let r = rate_strictness("x")
   []
@@ a6  import { rate_strictness as rate } … / let r = rate(3)
   []
@@ a7  fn rate_strictness(a: Author): number { 1 } / let r = rate_strictness(3)   [Author UNDECLARED]
   []
@@ a8  [control] PRIM_LIB same-file / let r = helper(3)                            [compatible]
   []
```

a1/a2 and a3/a4 are the report. Each pair differs by one thing — which file the
`fn` is declared in — and the same-file member of each pair draws an `E` that
denies registration. a5 shows the silence is not argument-shaped: a `string`
against `Author` is equally unreported. a6 shows the `as` alias takes the same arm,
because `collectImportedSymbols` records the local binding name
(`type-layer-checks.ts:472–482`). a8 is the passing control that proves a4's
emission is the mismatch and not the call shape.

**a7 is the constraint row.** The signature is present and same-file; only the
parameter type's *declaration* is missing. `annotationToCompatType` produces
`named "Author"`, `checkCompatible` cannot resolve it against the file's `TypeEnv`
and answers `"unknown"`, and `checkFnArgCompat` returns no diagnostic
(`type-compat.ts:462–465`). So a route that carries only the imported signature
converts a1 into a7, not into a2.

### (b) The compose layer does not repair it

`checkThetaImports` over an in-memory filesystem carrying the library, with the
importing body of a1 / a3 / a8:

```
@@ b1  app: rate_strictness(3)   lib: /proj/personas.thetalib = PERSONAS
   import-check diagnostics :: []
@@ b2  app: helper("s")          lib: /proj/prim.thetalib = PRIM_LIB
   import-check diagnostics :: []
@@ b3  app: helper(3)            lib: /proj/prim.thetalib = PRIM_LIB   [compatible control]
   import-check diagnostics :: []
```

b1 and b2 resolve, parse and materialise the library successfully — b3 proves the
fixture is well-formed and the pass runs — and no argument check exists at that
layer either. Combined with (a): the position is unchecked at parse, unchecked at
compose, and unvalidated at runtime (`statement-executor.ts:416`).

### (c) The shipped corpus, real bytes

```
@@ c1  docs/examples/import-thetalib.theta as committed
   parse :: []
@@ c2  the same file with `rate_strictness(reviewer)` replaced by `rate_strictness(3)`
   parse :: []
@@ c3  checkThetaImports over the real docs/examples/personas.thetalib bytes, app calling rate_strictness(3)
   import-check diagnostics :: []
```

c1 is the corpus baseline (bug 0050's cell `e1` asserts it). c2 substitutes a
provably mistyped argument into the shipped example and nothing changes. c3 drives
the real library file through the real import pass with the same result.

### (d) Bounds and adjacent rows

```
@@ d1  import { Author } from "./personas.thetalib" / let a: Author = 3
   []
@@ d2  [control] schema Author { name: string } same-file / let a: Author = 3
   ["error theta/parse/let-rhs-type-mismatch: let binding 'a' initialiser type
     mismatch: expected Author, got integer"]
@@ d3  /proj/lib.thetalib: import { helper } from "./prim.thetalib" / fn g(): number { helper("s") }
   []
@@ d4  [control] /proj/lib.thetalib: fn helper(n: number)… / fn g(): number { helper("s") }
   ["error theta/parse/fn-arg-type-mismatch: fn 'helper' argument 0 ('n')
     type mismatch: expected number, got string"]
@@ d5  import { helper } … / let r = helper()                       [zero arguments]
   []
@@ d6  no import at all / let r = helper("s")
   ["error theta/parse/unknown-identifier: unknown identifier 'helper'"]
@@ d7  [control] PRIM_LIB same-file / let flag = true / let r = helper(flag ? 1 : "a")
   []
@@ d8  import { rate_strictness } … / schema Author { q: string } / let r = rate_strictness(3)
   []
@@ d9  import { Author } … / schema Author { q: string } / let a: Author = 3
   ["error theta/parse/let-rhs-type-mismatch: let binding 'a' initialiser type
     mismatch: expected Author, got integer"]
```

d1/d2 measure the **wider class this report does not claim**: an imported *schema*
is equally absent from the importing file's `TypeEnv`, so a typed `let` against it
defers where the same-file spelling refuses. `theta/parse/let-rhs-type-mismatch`'s
own *Trigger* (`code-registry-parse.md:54`) does not name the imported case, so
that row is not over-promised the way `:116` is; recorded as a bound on any fix's
blast radius, and as the reason a fix cannot reach a2's answer by carrying the
signature alone.

d8 and d9 are the namespace rows. In d8 the importer imports only
`rate_strictness` and declares its own unrelated `schema Author { q: string }` —
no collision, because `imports.md:59` scopes `theta/parse/import-name-collision`
to "an imported symbol whose name collides with a top-level declaration in the
same file" and `Author` is not imported here. A carriage that resolved the
library's parameter annotation `Author` through **this** file's `TypeEnv` would
therefore judge against `{ q: string }`. d9 makes it concrete at the adjacent
sink: with `Author` imported *and* locally declared, the parse resolves the
**local** one and refuses against it, emitting no collision code — that check
runs at compose (`checkImportNameCollisions`,
`src/extension/import-static-checks.ts:437–443`), after the parse has decided.
These two rows are why bug 0072's constraint is not optional.

d3/d4 show the gap is not a `.theta`-only phenomenon: a `.thetalib` calling
another `.thetalib`'s `fn` takes the same arm. d5 is bug 0131's arity question at
this boundary, recorded not claimed. d6 establishes that without the `import` the
name is not silently accepted — the deferral is specific to a *resolved* import,
not to unknown names. d7 is 0050's withholding discipline working as designed on
the same-file route: an unproven argument read withholds, and any fix here
inherits that rule unchanged.

## Expected behaviour

**The Trigger names the route, so the row promises it.** DIAG-2
(`diagnostic-shape.md:72`) makes the registry closed and a *Trigger* change a spec
change. `code-registry-parse.md:116`'s Trigger is one sentence with an explicit
disjunction — "a same-file **or imported `.thetalib`** function call" — and an
explicit exclusion list naming only `invoke(...)` and `.theta`-callable calls. A
reader of the registry cannot distinguish the covered half from the uncovered
half; both are inside one *Trigger*, and neither the row, its two mirrors
(`docs/reference/diagnostics.md:165`, `docs/reference/type-system.md:66`), nor
TYPE-9 (`type-system.md:50`) qualifies the promise by declaration site. TYPE-9
states the position as "an argument to a top-level `fn` call that is neither an
`invoke(...)` nor a `.theta`-callable call"; `expressions.md:44–49` makes a
resolved import arm (3) of the same call-position resolution that makes a
same-file `fn` arm (2). Nothing in the corpus separates them.

**`type-system.md:48` licenses the deferral for the operand, not for the route.**
The rule skips a check "when either side of a compatibility check is past the
parser's static view", with two examples — a binding whose RHS depends on an
unregistered Pi-tool schema, and an `invoke` against a callee that produced
`theta/load/callee-has-errors`. Both share a property: the information is
genuinely unavailable *to the pipeline*, not merely to one pass. Here the imported
`fn`'s parameter list is available: `checkThetaImports` parses the resolved
`.thetalib` into a full `ThetaDocument` (`import-static-checks.ts:385`), computes
its export set (`:399–400`), materialises its declarations into the runtime
environment (`:417`), and already runs two static checks over the parsed library
body (`:458–468`, `:474–479`). The operand is past *this pass's* static view
because of where the check was placed, and the load pipeline resolves it a few
hundred lines later in the same run.

That does not make the current behaviour wrong. It makes the *pairing* of a
Trigger that names the route with an implementation that defers on 100% of that
route's inputs an unsettled position, and it is the position this report exists to
settle. Two readings are available and this report does not pick between them:

- **Reading A — the Trigger is accurate and the implementation is incomplete.**
  The information exists in the run; the check is in the wrong place or is missing
  a carriage mechanism. On this reading the fix moves or extends the check
  (§Fix routes 1 and 2) and DIAG-2 is not engaged, because the Trigger prose is
  already correct.
- **Reading B — the deferral is the theta 1.x disposition and the Trigger
  over-promises.** Cross-file static typing is out of scope for theta 1.0's
  single-file parse; the honest corpus edit narrows the Trigger to the same-file
  case and states the imported case's disposition explicitly. On this reading the
  fix is a DIAG-2 *Trigger* change (§Fix route 3) landing in the same commit as
  its two mirrors, dispositioned under the GOV-15 diagnostic-registry carve-out
  (`source-language-stability.md:25`) as a **removal** for inputs taken out of the
  emission set — an empty set at HEAD, since no input emits on this route today.

What both readings agree on: the present state — a Trigger naming a route with no
emission site — is the state bug 0050 was filed against for the whole row, and it
now holds for half of it.

**A fix must reach a2's answer, not a7's.** Row a7 is the precise bar: the
signature alone is not sufficient for a `named` parameter type, because
`checkCompatible` answers `"unknown"` against an environment that does not declare
it. Bug 0072's constraint fixes how the missing half may be supplied: the
declaring file's declarations, resolved through an environment built from *that*
file, never through the importing file's `TypeEnv`. A carriage that resolved
`Author` against the importing file's environment would answer correctly only by
coincidence and would answer *wrongly* whenever the importer declares a different
`Author`. Rows d8 and d9 measure that hazard: `theta/parse/import-name-collision`
covers only "an imported symbol whose name collides with a top-level declaration
in the same file" (`imports.md:59`), so an importer that does not import `Author`
is free to declare its own (d8), and even when it does import it the parse
resolves the **local** declaration and refuses against that, with the collision
code arriving later at compose (d9).

**GOV-15 is engaged in the addition direction.** Rows a1, a3, a5, a6, b1, b2, c2
and d3 all load cleanly today (`source-language-stability.md:9`: no diagnostic of
effective severity `E`) and would gain an `E` under routes 1 or 2, changing
observable (b). That is the diagnostic-registry carve-out applied as an addition
for inputs newly brought into the code's emission set (`:25`) — the same
disposition 0050's fix took for the same-file half, and 0031's before it. The
corpus half is already bounded: `docs/examples/import-thetalib.theta:9` is the only
imported-`fn` call site in the tree, its argument is a frontmatter `params:` field
whose static type the type layer does not resolve, and rows c1/c2 measure that it
observes no change. A fix re-measures rather than assuming, and reads
[0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) first — the
committed-fixture gate does not walk `.thetalib`.

## Actual behaviour / root cause

**One arm, placed before the resolution it would need.** `checkFnCallArgs`
(`type-layer-checks.ts:1575`) is documented as "the parse-time counterpart of the
runtime's `resolveUserFn`" with "four named arms … the resolution is total over
`e.callee` with no silent fall-through". The arms are: local shadow
(`:1576–1581`), imported symbol (`:1582–1589`), same-file `fn` table
(`:1590–1597`), not-a-user-fn (the same arm's fall-through). Only the third
reaches the emission loop (`:1598–1626`). The runtime's `resolveUserFn`
(`statement-executor.ts:377–380`) admits **two** arms as user-`fn` calls —
`r.arm === "fn"` and `r.arm === "import"` — so the parse-time counterpart covers
one of the two shapes its runtime counterpart executes.

**The set is exact, so the arm is exhaustive over its route.**
`collectImportedSymbols` (`:472–482`) records each `import` declaration's local
binding name, `as`-alias included, and excludes `export … from` specifiers (which
bind no local name). Every resolved-import callee therefore hits `:1582` — measured
in the plain form (a1, a3), the aliased form (a6), and inside a `.thetalib` (d3).

**Nothing downstream picks it up.** The check's host runs inside one file:
`checkTypeLayer` (`:235–260`) takes a single `ThetaBody`; `collectTypeEnv` builds
the `TypeEnv` from that body's `schema` statements; `parseThetaDocument`
(`theta-document.ts:758`) calls it at `:887–891`. Import resolution is a compose
concern: `production-composition.ts:802` calls `checkThetaImports`, which is where
the resolved library exists as a parsed document. That function emits import
diagnostics, subagent-cycle diagnostics and model-override diagnostics; it emits no
argument-type diagnostic, measured as rows b1–b3.

**The runtime does not backstop it, and the registry says so.** `resolveUserFn`
routes an imported callee into `evalUserFnCall` (`:395–425`), which evaluates each
argument in the caller's scope and binds it (`:416`, `scope.defineLocal(…)`) with
no type test. The row's own Trigger states the position carries no AJV net
(`code-registry-parse.md:116`). So a `3` passed where `Author` is declared is bound
as an integer and reaches `${a.name}` inside the library's query body.

**Two facts make the gap wider than "the signature is missing".** First, the
parameter type may be structural: `fn helper(n: number)` needs no declarations at
all, and row a3 shows that half is silent too — that half is closed by carrying the
signature. Second, when the parameter type is `named`, resolution needs the
declaring file's environment: row a7 measures that a same-file signature with an
undeclared annotation defers through `checkCompatible`'s `"unknown"`
(`type-compat.ts:462–465`), which is the same answer a signature-only carriage
would produce for a1. The two halves of the route have different costs, and a fix
that closes only the first leaves `personas.thetalib`'s actual signature — the only
one in the corpus — still deferred.

**The wider cross-file silence is real and is not this report's claim.** Row d1
measures an imported schema at a typed-`let` position drawing nothing where the
same-file spelling refuses (d2). `theta/parse/let-rhs-type-mismatch`'s Trigger
(`code-registry-parse.md:54`) does not name the imported case, so that row is not
over-promised; it is recorded here because any environment a fix builds for a1 is
the same environment that would decide d1, and a route that fixes one silently
changes the other.

## Why it matters

- **A registered `E` row promises a route no input can fire.** That is the exact
  shape bug 0050 was filed against — its title says "registered with a Trigger no
  input can satisfy" — and it now holds for the disjunction's second half. A reader
  of `code-registry-parse.md:116` cannot tell which half is live.
- **The same defect loads or does not load depending on the file layout.** a1 and
  a2 are the same call against the same signature; one registers and one is refused
  at `E` by `hasLoadParseError` (`production-composition.ts:2045`). Factoring a
  helper out into a `.thetalib` — the exact refactor `imports.md:3` recommends
  ("reusable building blocks") — silently removes a check.
- **The position is unchecked in every phase.** Parse defers (a1), compose runs no
  such check (b1), and the runtime binds the argument with no validation
  (`statement-executor.ts:416`). The registry row asserts the third fact as a
  reason the parse check matters; on this route the parse check does not exist.
- **The corpus's only imported `fn` is the sharp case.**
  `docs/examples/personas.thetalib:7` declares `rate_strictness(a: Author)`, whose
  parameter type is a `named` object schema — the case that needs both halves of
  the carriage. Cell `i1` already names the exact diagnostic that should appear
  against it.
- **The deferral is invisible in the witness's emitting direction.** 84 cells cover
  this code; exactly one covers this route, and it asserts silence. A fix that
  believes it has covered the imported route has one cell to flip and no positive
  cell to satisfy until it writes one.
- **The gap will widen with the language, not narrow.** `imports.md:17` admits
  `subagent fn` in a `.thetalib`, and 0050's fix put same-file `subagent fn` calls
  IN scope (cell `s1`). The imported `subagent fn` call therefore inherits the same
  silence at a boundary that also spawns a session.

## Non-goals

- **Argument count across the boundary.**
  [0131](./0131-in-document-fn-call-arity-unchecked.md) owns arity, same-file and
  imported alike; row d5 records the imported spelling's silence and claims
  nothing. `checkFnCallArgs` already holds the resolved `FnDecl` on the same-file
  route and deliberately iterates the `Math.min` prefix (`:1598`).
- **Imported *schemas* at non-argument positions.** Row d1's typed-`let` silence is
  a different registered row whose Trigger does not name the imported case
  (`code-registry-parse.md:54`). Cited as a bound on a fix's blast radius, not as a
  defect here. If a fix builds a cross-file environment, it must state whether d1
  moves.
- **The `invoke` argument row.** `theta/parse/invoke-arg-type-mismatch` is a
  separate row with a separate Trigger and its own unwired emitter — 0050's fix
  split the `invoke` label out of the emission arm precisely so it was not swept
  in, and filed it separately
  ([0137](./0137-invoke-arg-type-mismatch-unreachable.md), from the same fix's
  residual 1). Not touched here.
- **0050's withholding discipline.** `provableArgType` / `isProvenReduction`
  (`type-layer-checks.ts:1654`, doc comment `:1629–1653`) decide whether an
  *argument* read is a proof.
  This report's gap is on the *parameter* side — the callee is never resolved — so
  no route below changes that discipline, and row d7 pins it unchanged.
- **The substrate's minted names.**
  [0136](./0136-member-access-types-as-field-name-not-field-type.md) owns
  `#typeExpr`'s spelling mints. 0050 closed their reach at this sink by
  withholding; a fix here inherits that unchanged.
- **Runtime validation of `fn` arguments.** The registry row states that no AJV net
  applies at this position by design. Adding one is a different change against a
  different rule and is not proposed here.

## Fix

**Not settled. This report exists to pin the disposition first**, on the model bug
0135 §Fix and bug 0136 §Fix set: the constraints are fixed and the routes are
enumerated with their consequences, and the choice is left to the run. Four
questions have to be answered, and (e) orders the work.

**(a) Which reading is being taken?** §Expected behaviour states them. Reading A
(the Trigger is accurate; the implementation is incomplete) admits routes 1 and 2.
Reading B (theta 1.x does not type-check across the file boundary) admits route 3.
A fix must state which, because the corpus consequence differs: routes 1 and 2 edit
no `docs/` file, route 3 edits three.

**(b) Three routes, with their consequences.**

1. **Carry the imported signature and its declaring file's declarations into the
   parse-layer check.** `checkTypeLayer` gains an optional dependency — a resolved
   view of each imported symbol's `FnDecl` plus the `TypeEnv` built from the
   *declaring* file's statements — supplied by explicit DI at the
   `parseThetaDocument` call site (`theta-document.ts:887–891`), the same shape
   0050 used for `paramsFieldNames`. Arm 2 (`:1582`) then consults it and falls
   through when the symbol resolves. **Costs to weigh:** `parseThetaDocument` is
   synchronous and file-local by construction, while import resolution is
   asynchronous and I/O-bearing (`checkThetaImports` is `async`,
   `import-static-checks.ts:281`) — so the resolved view has to be produced *before*
   the parse that consumes it, which inverts the current pipeline order (compose
   calls parse, then resolves imports). It also gives the parser a cross-file input
   it has never had, and every existing two-argument caller must keep working.
2. **Run the argument check at compose, where the resolved library already
   exists.** `checkThetaImports` (`:281`) holds each parsed `.thetalib`
   `ThetaDocument` and already runs two cross-file static checks over it per
   resolved path (`:458–468`, `:474–479`) — that loop is the precedent and the
   placement. The check would resolve each importing call site whose callee is an
   imported symbol, read the `FnDecl` from the library body, build the `TypeEnv`
   from the **library's** statements (bug 0072's constraint, and the reason the
   importing file's `env` must not be reused), and call the existing
   `checkFnArgCompat` (`type-compat.ts:452`) unchanged. **Costs to weigh:** the
   argument's static type is computed by the parser-layer
   `StaticTypeInferencePass` / `provableArgType`, which is where the withholding
   discipline lives; a compose-layer check either re-derives it or reads it off the
   importing document (`checkTypeLayer` returns diagnostics, not a type map, so
   the seam does not exist today). The diagnostic's `file` must be the *importing*
   file with the *argument's* range, as the same-file route does (`:1623`).
   Emission order relative to the parse diagnostics changes observable (b)'s
   sequence for inputs that emit both, which the GOV-15 carve-out covers as an
   addition only for inputs newly in the emission set — a fix states which set it
   is in.
3. **Narrow the Trigger to the same-file case (DIAG-2).** Edit
   `code-registry-parse.md:116`'s *Trigger* to name the same-file call and state
   the imported case's disposition explicitly, citing `type-system.md:48`.
   `docs/reference/diagnostics.md:165` and `docs/reference/type-system.md:66` carry
   no *Trigger* column, so a Trigger-only narrowing does not reach them — a fix
   verifies that rather than assuming it, and TYPE-9 (`type-system.md:50`) and
   TYPE-10 (`:52`) are checked for the same over-promise, since TYPE-9 states the
   position with the same two exclusions and no declaration-site qualifier.
   **Costs to weigh:** this is the cheapest route and the only one that leaves an
   author's mistyped imported argument permanently unreported in both phases; it
   must say so in the corpus rather than by omission. Under GOV-15 it is a removal
   over an empty in-scope input set (`source-language-stability.md:25`), so no
   in-scope input observes a change. Cell `i1` then becomes a correctness pin
   instead of a deferral pin, and its comment — which currently instructs a future
   change to flip it to an emission — is rewritten in the same commit.

**(c) Constraints any route preserves**, each with a witness row above:

- **Row a7's answer stays `[]` on its own terms.** An unresolvable `named`
  parameter type defers through `checkCompatible`'s `"unknown"`
  (`type-compat.ts:462–465`). No route may make an unresolvable annotation emit;
  a route that resolves `Author` for a1 must resolve it from the **declaring**
  file, not by widening what counts as resolvable in the importing one.
- **Bug 0072's namespace rule.** A type annotation sourced from another file must
  never resolve through the current file's `TypeEnv`; an honestly-empty
  environment is required where the declaring file's is unavailable. Row d1 is the
  measurement that the importing file's environment does not contain the imported
  declarations today, and a route that changes that answers d1 as well as a1 —
  which is a §Non-goals subject and must be stated, not slipped in.
- **0050's withholding discipline is unchanged.** `provableArgType` decides the
  argument side; d7 pins that an unproven read withholds. A cross-file route adds a
  callee, not a new argument-typing rule.
- **The `.theta`-callable, Pi-tool and `invoke` exclusions stay excluded.** Cells
  x1–x3 of the witness pin them; arm 4 of `checkFnCallArgs` (`:1590–1597`) is the
  fence.
- **The shipped corpus stays clean.** Rows c1/c2 measure that
  `docs/examples/import-thetalib.theta:9` defers on the argument side regardless,
  and cell `e1` (`:2779–2820`) locks it. Re-measure both `.theta` and `.thetalib`
  files — [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) records
  that the committed-fixture gate walks `.theta` only.
- **DIAG-4 is not engaged by any route.** The *Message* template
  (`code-registry-parse.md:116`) is unchanged in all three; only routes 1 and 2
  change which inputs fill it, and only route 3 changes the *Trigger*.

**(d) The two halves of the route, priced separately.** A fix states which it
closes:

- **Structural parameter types** (`number`, `string`, literal unions, arrays of
  those) need the signature only. Rows a3/b2 are this half.
- **`named` parameter types** need the signature **and** the declaring file's
  declarations. Rows a1/b1/c3 are this half, and it is the only half the shipped
  corpus exercises (`personas.thetalib:7`).

A route closing the first and deferring the second is admissible under
`type-system.md:48` — but then the deferral arm's condition changes from "the
callee is imported" to "the parameter type is unresolvable in the declaring file's
environment", which is the general rule already, and the Trigger question in (a)
is still answered.

**(e) Ordering and coordination.**

- **0050 is fixed and is not a prerequisite**, but its witness is the coordination
  surface. `tests/fn-arg-type-mismatch-wired.test.ts` is 84 cells green at HEAD;
  cell `i1` (`:1193–1215`) asserts this report's silence and names its own flip
  condition. Routes 1 and 2 red it **by design**; the required response is the
  flip its comment specifies (an expected emission carrying `fn 'rate_strictness'
  argument 0 ('a') type mismatch: expected Author, got integer`), not a weakening.
  Route 3 keeps it green and rewrites its comment.
- **Bug 0131** shares the call node. If both land, the resolved-callee lookup is
  shared and whichever lands second rebases against the first.
- **Bug 0132** bounds the corpus sweep either way.
- **[0137](./0137-invoke-arg-type-mismatch-unreachable.md)** (the `invoke` row)
  is disjoint by Trigger and by emitter; no ordering constraint either
  direction.

**Witness — offline, provider-free.** Two tiers, because the evidence spans two
layers:

- **Parse tier**, extending or mirroring `tests/fn-arg-type-mismatch-wired.test.ts`:
  same `parseDoc` boundary, same registry-sourced `registryMessage` oracle
  (DIAG-4), same loud `argRange` precondition so no absence cell measures nothing.
  Required rows: a1 and a2 as the pair (a2 already covered by the r-cells), a3/a4
  as the structural pair, a5, a6 (the `as` alias), a7 as the resolvability
  constraint, a8 as the compatible control, d3/d4 for the `.thetalib`-to-`.thetalib`
  spelling, d5 and d7 as the untouched-neighbour pins, and d1/d2 as the
  blast-radius pin for the imported-schema surface a cross-file environment would
  also reach.
- **Compose tier**, over `checkThetaImports` with the in-memory `FileSystem`
  double (`tests/import-export-from-clause-required.test.ts:246–305`): rows b1, b2,
  b3, and c3 against the real `docs/examples/personas.thetalib` bytes. A route-2
  fix lands its emissions here; a route-1 fix must show these rows still produce
  no *duplicate* emission.

Whichever route lands, one row is owed that no group above supplies: an assertion
that the imported route's emitting direction is **reachable at all** — a positive
cell, so that a later refactor silently re-deferring the route reds. Under route 3
its counterpart is an assertion that the registry *Trigger* text no longer names
the imported case, sourced from the registry rather than copied. No live tier
applies: nothing on this path crosses a provider, and every observable settles
inside one parse plus one import pass.

## Provenance

- **Origin:** the bug 0050 fix (0.77.0, HEAD `3efdb4ac`), which decided this route
  deliberately and named the residual. Its §Fix (0.77.0) records the scope decision
  — "the imported-`.thetalib` route DEFERS by a named arm with the flip condition
  stated (cell i1; filed as bug 0138)" — and its fix report's residual 2
  (`.pi/tmp/fixes/0050-report.md:381–389`) states the mechanism and the constraint
  verbatim: "Covering the route means carrying the imported `fn`'s signature AND
  the declaring file's declarations across the file boundary, and bug **0072**'s
  namespace lesson binds any such attempt: a type annotation sourced from another
  file must never resolve through the current file's `TypeEnv` — an honestly-empty
  one is required." 0050's own §Fix pre-authorised the reading before the work
  began ("Deferring on an unresolved imported signature is admissible under
  `type-system.md:48`; silently dropping the route is not, because the Trigger
  names it"). This report adds what those records do not state: the measured rows
  (a1–a8, b1–b3, c1–c3, d1–d9), the compose-layer measurement that the gap is not
  repaired where the resolved library exists, row a7's proof that the signature
  alone is insufficient for a `named` parameter type, the two readings of the
  Trigger, the three routes with their DIAG-2 / GOV-15 dispositions, and the
  two-tier witness.
- **Evidence:** two scratch vitest files at `3efdb4ac`, run over `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) and the shipped `checkThetaImports`
  (`src/extension/import-static-checks.ts:281`) with an in-memory `FileSystem`
  double, then deleted. All 8 (a)-rows, 3 (b)-rows, 3 (c)-rows and 9 (d)-rows
  measured; outputs quoted verbatim above. Row a1 additionally reproduces as the
  committed cell `i1` of `tests/fn-arg-type-mismatch-wired.test.ts`, which passes
  84/84 at HEAD. No file in `src/`, `tests/` or `docs/bugs/` other than this one was
  written.
- **Implementation evidence at `3efdb4ac`:**
  `src/parser/type-layer-checks.ts` (`:235–260` `checkTypeLayer`, `:244` the
  `collectImportedSymbols` call, `:465–484` `collectImportedSymbols`, `:915–922` the
  `TypeLayerWalk` constructor with `importedSymbols` at `:920`, `:1564–1574` the
  `checkFnCallArgs` doc comment, `:1575` its declaration, `:1576–1581` the
  local-shadow arm, **`:1582–1589` the deferral arm**, `:1590–1597` the `fnDecls`
  arm, `:1598–1626` the emission loop, `:1654` `provableArgType` under its
  `:1629–1653` doc comment);
  `src/parser/type-compat.ts` (`:139` `checkCompatible`, `:452–480`
  `checkFnArgCompat` with the deferral at `:462–465`, the code at `:472` and the
  message at `:475–477`);
  `src/parser/theta-document.ts` (`:758` `parseThetaDocument`, `:887–891` the
  `checkTypeLayer` call);
  `src/extension/import-static-checks.ts` (`:281` `checkThetaImports`, `:385` the
  resolved-library parse, `:399–400` the export-set computation, `:417`
  `materializeSymbol`, `:438–443` `checkImportNameCollisions`, `:458–468` the
  per-library `checkSubagentFnStaticResolution` loop, `:474–479`
  `checkSubagentFnModelOverrides`);
  `src/extension/production-composition.ts` (`:802` the `checkThetaImports` call at
  compose, `:2045` `hasLoadParseError`);
  `src/runtime/statement-executor.ts` (`:377–380` `resolveUserFn` admitting
  `arm === "import"`, `:395–425` `evalUserFnCall`, `:416` the unvalidated
  `defineLocal` bind).
- **Spec measured against:**
  [Code registry — parse](../spec_topics/diagnostics/code-registry-parse.md)
  (`:116` the row and its *Trigger*; `:54` `let-rhs-type-mismatch`, cited only as
  the bound on row d1);
  [Type System](../spec_topics/type-system.md) (`:48` *Unresolvable operands*,
  `:50` TYPE-9, `:52` TYPE-10);
  [Expressions](../spec_topics/expressions.md) (`:44–49` identifier resolution in
  call position, arm (2) same-file `fn` and arm (3) imported symbol);
  [Imports](../spec_topics/imports.md) (`:3` the `.theta` / `.thetalib` split,
  `:13` the permitted top-level forms, `:14` the calling-conversation rule, `:17`
  `subagent fn` in a `.thetalib`, `:27` implicit export, `:50` unknown imported
  symbol, `:52` and `:59` the name-collision rule);
  [Diagnostic shape](../spec_topics/diagnostics/diagnostic-shape.md) (`:72` DIAG-2,
  `:74` DIAG-4);
  [GOV-15](../spec_topics/governance/source-language-stability.md#gov-15) (`:5`,
  the loads-cleanly predicate `:9`, the diagnostic-registry carve-out `:25`).
  User-facing mirrors, neither carrying a *Trigger* column:
  `docs/reference/diagnostics.md:165`, `docs/reference/type-system.md:66`.
- **Test evidence at `3efdb4ac`:** `tests/fn-arg-type-mismatch-wired.test.ts` (bug
  0050's witness, 84 cells green; the SPEC ANCHORS Trigger reading at `:135–139`
  and the deferral rule at `:144–145`; fixture `I1` at `:690–691`; **cell `i1` at
  `:1193–1215`**, the deferral pin with its flip condition; cell `e1` at
  `:2779–2820`, the corpus lock naming
  `docs/examples/import-thetalib.theta:9` at `:2781–2783`);
  `tests/import-export-from-clause-required.test.ts:246–305` (the in-memory
  `FileSystem` double and the `checkThetaImports` driver this report reuses);
  `tests/committed-fixture-parse-gate.test.ts` (the corpus gate, `.theta`-only —
  bug 0132). **No committed test measures the imported route in the emitting
  direction**, because no input produces one.
