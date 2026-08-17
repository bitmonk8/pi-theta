# Bug 0191 — `#typeExpr`'s `case "member"` (`src/parser/static-type-inference.ts:242–279`) routes `Enum.Variant` into its field branch whenever a `schema` shadows the enum's name: `resolveNamed(env, "Color")` answers the schema, the variant is no own field of it and can never be one (variant names are PascalCase, field names lowercase-first), so the arm falls through to the pre-0136 fabrication `named <variant>` and a third declaration spelled like the variant is adopted as the expression's static type — against `schemas.md:97`'s "statically typed as `Enum`", five registered `E`-severity codes refuse spec-legal input, and one correct refusal disappears into a loop that loads and iterates zero times

- **Status:** open. §Fix is not settled: five constraint-pinned routes, and the
  choice turns on one adjudication this report asks for rather than makes —
  whether a same-file `enum X` / `schema X` pair stays legal. No prerequisite:
  bug 0136 shipped this arm at 0.106.0 and nothing blocks this report. Fix
  ordering: bug [0126](./0126-plain-for-binds-no-loop-variable.md) is open
  against the same `#typeExpr` switch and the same type-layer walk, so whichever
  lands second rebases its line citations; and any route that edits the arm
  re-runs `tests/member-access-declared-field-type.test.ts` (81 rows, bug 0136's
  witness), whose group (d) pins the *un-shadowed* enum rows d5–d19 as asserted
  bytes.
- **Sev/Diff estimate:** S2/D3 — S2 because every measured observable needs
  **two** independent same-file name collisions (a `schema` spelled like the
  enum, plus a declaration spelled like the variant), and the dominant class is
  a noisy refusal: five registered `E`-severity codes fire on input the spec
  admits (§Reproduction a1, c1, c3, c5, c7), each denying registration for the
  whole file, with a message naming a type the expression does not have. The
  one S1-shaped row — the erased `theta/parse/non-array-iterand` at d1/d4, after
  which the theta loads and the loop iterates zero times (r1, r3) — needs those
  same two collisions *plus* a program that iterates an enum variant, and no
  committed corpus file declares an `enum` at all
  (`git grep -n 'enum ' -- '*.theta' '*.thetalib'` is empty over all 34 tracked
  corpus files), so corpus reach is zero. D3 because §Fix needs in-run
  adjudication across five routes — one of which adds a registry row with its
  DIAG-2 same-commit spec and `docs/reference/diagnostics.md` mirror edits, and
  one of which reopens bug 0038 residual (iii) at every `resolveNamed` read
  site — because the g-rows show the obvious minimal answer (return the
  receiver's own `named`) is *not* inert under a shadow, and because the site is
  the arm bug 0136 rewrote one commit ago whose 81-row witness and two
  parent-granted protected-witness re-pins are pinned bytes.
- **Kind:** defect — implementation, against one written sentence, in three
  measured elements.
  1. **The enum-variant static type is written and not delivered.**
     `docs/spec_topics/schemas.md:97`: "A specific variant is referenced as
     `Enum.Variant` … The expression evaluates to the variant's underlying
     string value … but **is statically typed as `Enum`**." Measured (a1): with
     `enum Color { Red }` beside `schema Color { a: string }` and
     `schema Red = array<integer>` — three declarations no diagnostic objects to
     (b3) — `Color.Red` is typed `array<integer>`, the type of an unrelated
     third declaration. The un-shadowed control (a2) is silent.
  2. **Five registered `E`-severity codes refuse input the spec admits.**
     Measured against the un-shadowed control on the same body:
     `theta/parse/non-string-array-join` (a1),
     `theta/parse/let-rhs-type-mismatch` (c1),
     `theta/parse/mixed-plus-operands` (c3),
     `theta/parse/non-indexable-receiver` (c5), `theta/parse/unknown-method`
     (c7, b5, e1). All five are `E`
     (`code-registry-parse.md:43`, `:56`, `:36`, `:38`, `:65`), and an
     `E`-severity `theta/parse/*` denies registration (`hasLoadParseError`,
     `src/extension/production-composition.ts:2214`), so the whole file fails
     to register. Four of the five messages render the *variant-spelled*
     declaration's identifier in the `<type>` position (`got Red`,
     `Red and string`, `on type Red`) and a1 renders that declaration's
     unfolded right-hand side (`array<integer>`) — each admissible as a render
     (`placeholder-rendering-a.md:19` renders named schemas by their theta-side
     identifier) and false as a claim: the expression's type is the enum.
  3. **One correct refusal disappears, and what it admits runs silently.**
     `for y in Color.Red` and `par for y in Color.Red` are refused by
     `theta/parse/non-array-iterand` when nothing shadows the enum name
     (`got Color`, d2/d3/d5 — the disposition bug 0136's fix installed). Add
     `schema Color { … }` + `schema Red = array<string>` and the refusal
     vanishes (d1/d4): the theta loads, registers, and both loop forms treat the
     non-array iterand as an **empty snapshot** — `executeFor`
     (`src/runtime/statement-executor.ts:1643`) and `evalParFor` (`:1328–1330`)
     each fall back to `[]` for a non-array value, so the body never runs and
     nothing reports. Measured: r1 runs to `1`, r3's `par for` evaluates to `[]`
     against a legal-iterand control that evaluates to two `Ok` cells (r5). The
     parse gate is the only objection to a non-array iterand; the shadow removes
     it.

  **The declaration pair the defect needs is admitted deliberately, not by
  omission.** `docs/spec_topics/lexical.md:18`: "The casing rule and the
  import-specifier synthesised-name reservation are the only enforced naming
  constraints." Enum names, variant names and schema names share one PascalCase
  namespace (`lexical.md:15`). Measured: the pair draws nothing in either
  declaration order (b1, b2), with a third colliding declaration added (b3), or
  in the alias spelling (b4). No registry row covers a cross-kind top-level
  name collision — the four `duplicate-*` parse rows are scoped to inline-object
  keys (`code-registry-parse.md:89`), enum values (`:95`), variant names within
  one enum (`:96`) and discriminator values (`:101`) — and
  `theta/parse/import-name-collision` (`:114`) fences the *two-file* spelling
  only, against a local-name set that does include both kinds
  (`collectTopLevelNames`, `src/extension/import-static-checks.ts:88–96`;
  `docs/spec_topics/imports.md:59`: "An imported symbol whose name collides with
  a top-level declaration in the same file is also
  `theta/parse/import-name-collision` — no implicit shadowing").

  **Behaviour on this input class is byte-identical to pre-0136.** This is not a
  regression: bug 0136's fix record residual 2 records the finding, raised by its
  review round 1, and defers the filing here.
- **Related:**
  - [0136](./0136-member-access-types-as-field-name-not-field-type.md) —
    **fixed (0.106.0, `6942ef27`)**, the origin and the direct constraint. Its
    §Fix (a) route 1 made the arm resolve the receiver and read the declared
    field type; its §Fix (b) obtained the enum half **structurally, with no
    enum-name source**: when the unfolded receiver is a `named` that resolves to
    no declaration, the arm returns the receiver's own `named`, and since
    `collectTypeEnv` records no `enum` the receiver stays unresolved and
    `Color.Red` types as `Color`. That branch is guarded by
    `decl === undefined` (`static-type-inference.ts:270–272`), so a `schema`
    spelled like the enum makes it unreachable. **This report does not reopen
    0136's route** — the field half (its rows a1–c9, e1–e8) is unaffected in
    every measurement below, and its own §Fix (b) states the bound: "no `enum`
    entry ever enters the `TypeEnv`". Its fix record residual 2 is this report's
    provenance, and its §Fix (c) fallback is the line the fabrication survives
    at.
  - [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md) —
    **fixed (0.48.0)**, and its **residual (iii)** is the live constraint here:
    "`enum` declarations are still absent from the `TypeEnv`, so an `enum`-named
    annotation stays unresolvable at every position — 0031's recorded non-goal,
    unchanged, and pinned negative by 0031's residue tests so a later widening is
    deliberate." Verified at HEAD: `collectTypeEnv` matches
    `stmt.kind === "schema"` only (`type-layer-checks.ts:341`). 0038 also owns
    the own-key-guarded `resolveNamed` (`type-compat.ts:104`) this arm reads
    through. **The general question — should enums be in the `TypeEnv` — is a
    §Non-goal here**; this report needs the *variant-access* type to stop being
    the variant's name under a shadow, which §Fix reaches without it in three of
    five routes.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **open**, the same
    inference pass at a different arm (the `ident` arm's nominal fallback for an
    unbound plain-`for` loop variable). **Disjoint subject and disjoint site**:
    that report's fix writes a `bindings` entry in the type-layer walk; nothing
    it changes reaches `case "member"`, and nothing here reaches the loop
    variable. They share the file and the pass, so the fix-ordering clause in
    §Status applies and the second to land rebases citations. This report claims
    none of 0126's subject.
- **Affected** (every citation verified against the tree at HEAD `6942ef27`,
  0.106.0; implementation references name symbols, and the one file whose lines
  are stated is the defect site itself — `static-type-inference.ts` is 413 lines
  at this HEAD):
  - **The defect site** — `src/parser/static-type-inference.ts:242–279`, the
    `case "member"` arm of `#typeExpr` (declared `:197`): 38 lines, a 24-line
    comment block (`:243–266`) over 12 lines of code:

    ```ts
    const receiver = unfoldAlias(this.#typeExpr(node.target, env, bindings), env);
    if (receiver.kind === "named") {
      const decl = resolveNamed(env, receiver.name);
      if (decl === undefined) {
        return receiver;                                    // :271 — the enum route
      }
      const fields = decl.kind === "object-schema" ? decl.fields : undefined;
      if (fields !== undefined && Object.hasOwn(fields, node.field)) {
        return unfoldAlias(fields[node.field] as CompatType, env);
      }
    }
    return { kind: "named", name: node.field };              // :278 — the fallback
    ```

    `:267` computes the receiver, `:269` resolves it, `:271` is bug 0136's enum
    route, `:273–276` is its field route, `:278` is the pre-0136 fabrication the
    arm keeps as its fallback (0136 §Fix (c), deliberate: `expressions.md:9`
    assigns an absent theta-side name a *runtime*
    `theta/runtime/missing-object-key` panic). Under a shadow, `:269` answers the
    schema, `:271` is skipped, `:274`'s own-key test fails, and `:278` runs.
  - **Why `:274` can never rescue the shadowed case.** `lexical.md:15` requires
    PascalCase for enum variant names and lowercase-first for schema field names,
    so a conformant `schema Color` cannot declare a field spelled `Red`. Measured
    (f1): `schema Color { Red: string }` draws `theta/parse/binding-case-mismatch`
    (`code-registry-parse.md:19`, `E`, registration denied) — and the arm then
    *does* read that field (`unknown method 'join' on type string`). So for every
    conformant program the fallback at `:278` is unconditional under a shadow.
  - **The absent enum record** — `collectTypeEnv`,
    `src/parser/type-layer-checks.ts:328–357`: the loop at `:340–355` matches
    `stmt.kind === "schema"` (`:341`) and nothing else, so no `enum` name is ever
    a `TypeEnv` key and `resolveNamed` (`src/parser/type-compat.ts:104–106`)
    answers with whatever `schema` holds the spelling.
  - **The two passes that already resolve `Enum.Variant` correctly**, which is
    what locates the defect in this arm rather than in variant resolution:
    - Parse time — `StructuralRefs.enums`, built at
      `src/parser/theta-document.ts:5816–5822` (`enums.set(s.name, new Set(s.variants))`
      at `:5820`) and consumed by the structural `case "member"` arm at
      `:6632–6651`, which recognises a variant access by testing the target ident
      against that map (`refs.enums.get(e.target.name)`, `:6637`) and calls
      `checkVariantAccess` (`src/parser/schema-declarations.ts:315–331`).
      Measured under the shadow (f2): `Color.Blue` still draws
      `theta/parse/unknown-variant` naming the enum
      (`code-registry-parse.md:93`).
    - Runtime — `evalExpr`'s `case "member"`,
      `src/runtime/statement-executor.ts:706–716`: it calls
      `env.resolveEnumVariant` (`src/runtime/lexical-environment.ts:526–536`)
      **before** evaluating the target as a value, so the enum wins over the
      same-named schema. Measured (r8): `let s = Color.Red` under the shadow
      evaluates to `"Red"`.

    Both are in the same parse of the same file as `checkTypeLayer`
    (`theta-document.ts:857` and `:899` call `checkStructural` and
    `checkTypeLayer` over the same `statements`), so the missing input is
    threading, not derivation.
  - **The consumers that read `:278`'s answer.** The arm is reached through the
    single public `typeOf` seam (`static-type-inference.ts:182–188`), which the
    walk's own `typeOf` delegates to (`type-layer-checks.ts:925–927`), so
    every type-phase check sees the same fabricated `named`:
    `checkMethodCall` (`type-layer-checks.ts:2299–2342`: the `join` guard at
    `:2309–2310`, `classifyReceiver` at `:2340`), `checkMemberAccess`
    (`:2351–2365`) with `pushUnknownMethod` (`:2368–2380`), `classifyReceiver`
    itself (`:170–193`), `checkForIterand` (`src/parser/control-flow.ts:64–81`, which
    admits only `kind === "array"` at `:70` and emits with
    `got ${displayType(type)}` at `:79`), `checkLetRhsCompat` /
    `checkPlusOperands` / `checkIndex` through `type-compat.ts`'s `decide`, and
    `displayType` (`type-compat.ts:327–342`), whose `named` arm (`:333–334`)
    returns `type.name` verbatim.
  - **What the fabricated name resolves *to*.** `unfoldAlias`
    (`type-compat.ts:155–172`) and `classifyReceiver` both resolve a `named`
    against the `TypeEnv`, so any declaration spelled like the variant is
    adopted: an alias of a primitive or of `array<T>` (a1, c1, c3, c5), an
    object schema (c7, b5), a union (e3). Every shadow spelling of the *receiver*
    reaches `:278` too — object schema (a1), alias to a primitive (e1), alias to
    an object schema (e2), union (e3), head-only (e4).
  - **The runtime the erased refusal admits** —
    `src/runtime/statement-executor.ts:1643` (`executeFor`) and `:1328–1330`
    (`evalParFor`): a non-array iterand becomes `[]`, so the loop body never
    runs and no panic is raised. `evaluateForLoop`
    (`src/runtime/control-flow.ts:52–60`) iterates that snapshot. The contrast
    case is `theta/runtime/non-object-receiver`
    (`code-registry-runtime.md:23`; `expressions.md:9`: "an enum or `Result`
    receiver is rejected with `theta/runtime/non-object-receiver`"), which is
    what the un-shadowed `Color.Red.join(",")` reaches when parse defers (r7).
  - **The spec sentences** — `docs/spec_topics/schemas.md:95` (*Variant access*
    heading), `:97` (the static-type sentence and the `unknown-variant`
    sentence); `docs/spec_topics/expressions.md:9` (the *Member access* bullet:
    the runtime panics, the enum-receiver rejection, and the static result-type
    sentence bug 0136 added — "The static result type of `obj.field` is the
    receiver's declared type for that field"), `:22` ("Enum variant access:
    `Enum.Variant`" in the supported-forms list); `docs/spec_topics/lexical.md:15`
    (the PascalCase / lowercase-first split), `:18` (the only-enforced-naming-
    constraints sentence); `docs/spec_topics/control-flow.md:13` (the `for`
    iterand contract); `docs/spec_topics/type-system.md:48` (*Unresolvable
    operands* — the deferral licence), `:52` (TYPE-10), `:54` (TYPE-11);
    `docs/spec_topics/imports.md:59` (the cross-file collision rule).
  - **The registry rows** — `docs/spec_topics/diagnostics/code-registry-parse.md:19`
    (`binding-case-mismatch`), `:36` (`mixed-plus-operands`), `:38`
    (`non-indexable-receiver`), `:43` (`non-string-array-join`), `:56`
    (`let-rhs-type-mismatch`), `:65` (`unknown-method`), `:66`
    (`non-array-iterand`), `:88` (`empty-schema-body`), `:89`/`:95`/`:96`/`:101`
    (the four `duplicate-*` rows, none of which covers this pair), `:93`
    (`unknown-variant`), `:114` (`import-name-collision`);
    `docs/spec_topics/diagnostics/code-registry-runtime.md:23`
    (`non-object-receiver`). Governance:
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 — the registry
    is closed), `:74` (DIAG-4);
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md:19` (named schemas,
    enums and aliases render by theta-side identifier);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
    `docs/reference/diagnostics.md:3–9` records that the reference page
    transcribes Code / Sev / Phase / Message for every registry row, so a new row
    lands a mirror edit in the same commit.
  - **The unspellable-name precedent a route can reuse** —
    `WITHHELD_BINDER_TYPE_NAME` (`type-layer-checks.ts:387`, `"<withheld>"`) with
    its grammar-level unspellability argument (`:359–386`) and
    `containsWithheldBinderType` (`:409–420`). Its own doc comment states the two
    reasons unresolvability alone is insufficient — "`checkForIterand` rejects
    EVERY non-`array<T>` iterand, resolvable or not; and `decide` answers
    `named ⊑ array<…>` and `named ⊑ { … }` structurally … BEFORE it tests whether
    the name resolves" — which is a binding constraint on §Fix route 5.
  - **Test coverage of this input class: none.** `tests/member-access-declared-field-type.test.ts`
    group (d) (`:602–616`) drives 15 enum rows and no row of it declares a
    `schema` spelled like the enum; `x6` (`:951`) pins an enum-*typed* field. A
    scan of all 1136 tracked files for a same-name `enum` / `schema` pair (a
    regex over both declaration keywords per file) finds no test fixture
    carrying the pair: every same-name hit is cross-fixture (`enum Sev` and
    `schema Sev` in different rows of
    `tests/literal-union-string-enum-emission.test.ts:440–441`) or prose (bug
    0136's own document).
- **Observed at:** `0.106.0` (HEAD `6942ef27`). Offline, deterministic; no live
  model, no provider, no network. Parse rows through the production
  `parseThetaDocument` over the shared `parseDoc` harness
  (`tests/helpers/e2e-s1.ts:39`), each fixture prefixed `---\nmode: prompt\n---\n`;
  `codes` / `msgs` are the whole aggregated `diagnostics` list, unfiltered.
  Runtime rows through `parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`, the harness shape
  `tests/member-access-declared-field-type.test.ts:1155–1249` establishes. One
  scratch vitest file under `tests/`, run against a tree verified clean by
  `git status --short` immediately before and after the run (an earlier round had
  measured with a sibling's uncommitted `type-layer-checks.ts` hunk present; every
  row below was re-measured at the clean tree and none moved), then deleted.
  `src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
  unmodified by this filing.

## Summary

`#typeExpr`'s `case "member"` resolves its receiver and reads the field off the
receiver's declaration. Bug 0136 gave `Enum.Variant` its spec'd type through the
one branch that fires when the receiver resolves to *nothing*
(`static-type-inference.ts:271`): `collectTypeEnv` records no `enum`, so the
receiver `named "Color"` is unresolvable and the arm returns it —
`schemas.md:97`'s "statically typed as `Enum`", obtained with no enum-name
source.

A `schema` spelled like the enum removes that branch. `resolveNamed(env, "Color")`
answers the schema, the variant is no own field of it — and can never be one,
because variant names are PascalCase and field names lowercase-first
(`lexical.md:15`; the ill-cased spelling draws `binding-case-mismatch`, f1) — so
the arm reaches its closing fallback and mints `named "Red"`, the pre-0136
fabrication. That name is lookupable, so a third declaration spelled `Red`
becomes the static type of `Color.Red`.

The declarations that set this up are legal. `lexical.md:18` states the casing
rule and the synthesised-name reservation are "the only enforced naming
constraints"; measured, `enum Color { Red }` beside `schema Color { a: string }`
draws nothing in either order, with or without a third `schema Red` (b1–b4). No
registry row covers a cross-kind name collision; the import path fences the
two-file spelling only (`imports.md:59`).

The result is wrong in both directions. **Refusal:** five registered
`E`-severity codes fire on programs the spec admits — `non-string-array-join`
(a1), `let-rhs-type-mismatch` (c1), `mixed-plus-operands` (c3),
`non-indexable-receiver` (c5), `unknown-method` (c7) — each denying registration
for the whole file, each message naming the variant-spelled declaration, or its
right-hand side, as the expression's type. **Erasure:** `for y in Color.Red` and its `par for` form lose
the `theta/parse/non-array-iterand` refusal bug 0136 installed (d1, d4 against
d2, d3, d5), after which the theta registers and both loop forms treat the
non-array iterand as an empty snapshot (`statement-executor.ts:1643`, `:1328`) —
the body never runs, and nothing reports (r1, r3).

Behaviour on this input class is byte-identical to pre-0136; the fabrication is
the fallback bug 0136 kept for the absent-field case. Closing it needs the
enum-name source that §Fix (b) of that report declined — or one of the four
alternatives §Fix enumerates.

## Reproduction

Offline, at `6942ef27`. Parse rows: `parseDoc` (`tests/helpers/e2e-s1.ts:39`)
with `---\nmode: prompt\n---\n` prepended; `codes` is the whole aggregated code
list, unfiltered. Runtime rows: the production executor harness named in
§Observed at.

### (a) The reported shape, and the three controls that isolate it

```
@@ a1  enum Color { Red } / schema Color { a: string } / schema Red = array<integer>
       fn f(): string { Color.Red.join(",") } / let z = f() / z
   codes :: ["theta/parse/non-string-array-join"]
   msgs  :: ["array.join requires a string element type; got array<integer>"]
@@ a2  [control] no `schema Color` — bug 0136's enum route fires
   codes :: []
@@ a3  [control] no `schema Red` — the fabricated name resolves to nothing
   codes :: []
@@ a4  [control] neither collision
   codes :: []
```

a2 is the key row: with the enum name unshadowed the receiver is unresolvable,
the arm returns `named "Color"`, and every consumer defers as
`type-system.md:48` prescribes. a3 shows the shadow alone is not observable —
the fallback mints `named "Red"`, which resolves to nothing, so the diagnostics
match a2's. **Both collisions are required.**

### (b) The declarations alone draw nothing, in either order

```
@@ b1  enum Color { Red } / schema Color { a: string }                    codes :: []
@@ b2  schema Color { a: string } / enum Color { Red }                    codes :: []
@@ b3  enum Color { Red } / schema Color { a: string } / schema Red = array<integer>
   codes :: []
@@ b4  enum Color { Red } / schema Color = string                        codes :: []
@@ b5  schema Color { a: string } / enum Color { Red } / schema Red = string
       fn f() { Color.Red.frobnicate() }
   codes :: ["theta/parse/unknown-method"]
   msgs  :: ["unknown method 'frobnicate' on type Red"]
```

b1–b3 measure the claim that no check objects to the pair. b4 shows the alias
spelling is admitted too. b5 shows declaration order is irrelevant:
`collectTypeEnv` keys by name and never records the enum, so the schema answers
whichever side it is written on.

### (c) Four more registered codes, each against its un-shadowed control

Every row carries `enum Color { Red }`; the shadow row adds
`schema Color { a: string }`, the control omits it.

```
@@ c1  schema Red = string     / fn f(): integer { let m: integer = Color.Red  m }
   codes :: ["theta/parse/let-rhs-type-mismatch"]
   msgs  :: ["let binding 'm' initialiser type mismatch: expected integer, got Red"]
@@ c2  [control]                                                          codes :: []
@@ c3  schema Red = integer    / fn f(): string { Color.Red + "x" }
   codes :: ["theta/parse/mixed-plus-operands"]
   msgs  :: ["'+' has mixed operand types: Red and string"]
@@ c4  [control]                                                          codes :: []
@@ c5  schema Red = string     / fn f() { Color.Red[0] }
   codes :: ["theta/parse/non-indexable-receiver"]
   msgs  :: ["indexed access requires an array<T> or object receiver; got Red"]
@@ c6  [control]                                                          codes :: []
@@ c7  schema Red { a: string } / fn f() { Color.Red.frobnicate() }
   codes :: ["theta/parse/unknown-method"]
   msgs  :: ["unknown method 'frobnicate' on type Red"]
@@ c8  [control]                                                          codes :: []
```

c7 shows an *object* schema collides too, through `classifyReceiver`'s
`"object"` answer rather than through `unfoldAlias`.

### (d) The removal direction — the refusal bug 0136 installed disappears

Loop bodies here are `{ 1 }`, so no row depends on whether the loop variable is
bound (bug 0126's subject).

```
@@ d1  enum Color { Red } / schema Color { a: string } / schema Red = array<string>
       for y in Color.Red { 1 }
   codes :: []
@@ d2  [control] no `schema Color`
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got Color"]
@@ d3  [control] neither collision
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got Color"]
@@ d4  same three declarations / let zs = par for y in Color.Red { 1 } / zs
   codes :: []
@@ d5  [control] no `schema Color`
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got Color"]
@@ d6  same three declarations / let zs = par for y in Color.Red { y.frobnicate() }
   codes :: ["theta/parse/unknown-method"]
   msgs  :: ["unknown method 'frobnicate' on type string"]
```

d2/d3/d5 are the correct disposition: an enum variant is not an `array<T>`, and
the message renders the enum identifier. d1/d4 lose it. d6 shows the fabricated
element type propagates into the `par for` body's loop variable, which the type
layer binds from the iterand's element (`type-layer-checks.ts:1096–1102`
records the contrast for the plain `for`): the body is typed against `string`
from `schema Red = array<string>`, a type the iterand does not have.

The runtime the admitted rows reach:

```
@@ r1  d1's body executed                    parse :: []  →  RAN, value=1
@@ r2  d2's body executed                    parse :: ["theta/parse/non-array-iterand"]  →  REFUSED AT PARSE
@@ r3  d4's body executed                    parse :: []  →  RAN, value=[]
@@ r4  d5's body executed                    parse :: ["theta/parse/non-array-iterand"]  →  REFUSED AT PARSE
@@ r5  [control] let ys: array<string> = ["a","b"] / par for y in ys { 1 }
   parse :: []  →  RAN, value=[{"ok":true,"value":1},{"ok":true,"value":1}]
@@ r6  a1's body executed                    parse :: ["theta/parse/non-string-array-join"]  →  REFUSED AT PARSE
@@ r7  a2's body executed                    parse :: []
   →  THREW theta/runtime/non-object-receiver: non-object receiver: cannot read .join() on an enum value
@@ r8  enum Color { Red } / schema Color { a: string } / schema Red = string / let s = Color.Red / s
   parse :: []  →  RAN, value="Red"
```

r3 against r5 is the zero-iteration observable: the same `par for` shape yields
`[]` over the shadowed enum variant and two `Ok` cells over a legal iterand. r7
shows what the un-shadowed program gets instead of a wrong static refusal — the
runtime's own enum-receiver rejection. r8 shows the runtime resolves the variant
through the enum despite the shadow, so the value semantics are unambiguous and
only the static type is wrong.

### (e) Every shadow spelling reaches the fallback

All rows: `enum Color { Red }` + `schema Red = array<integer>` +
`fn f(): string { Color.Red.join(",") }`, varying the shadowing declaration.

```
@@ e1  schema Color = string           (alias to a primitive)
   codes :: ["theta/parse/non-string-array-join","theta/parse/unknown-method"]
   msgs  :: ["array.join requires a string element type; got array<integer>",
             "unknown method 'Red' on type Color"]
@@ e2  schema Q { a: string } / schema Color = Q   (alias to an object schema)
   codes :: ["theta/parse/non-string-array-join"]
@@ e3  schema Color = string | integer  (union)
   codes :: ["theta/parse/non-string-array-join"]
@@ e4  schema Color                     (head-only)
   codes :: ["theta/parse/empty-schema-body","theta/parse/non-string-array-join"]
@@ e5  schema Color { a: string } / schema Red = array<string>   (compatible collision)
   codes :: []
```

e1 adds a second code: `checkMemberAccess` (`type-layer-checks.ts:2351–2365`)
classifies the receiver through `classifyReceiver`, which unfolds the alias to
`string` (`:2356`), and `Red` is no string member — so the variant name is
refused as a stdlib member, rendered `on type Color` because
`pushUnknownMethod` renders the un-unfolded receiver type (`:2378`). e4's
spelling is refused for its own reason (`empty-schema-body`, `E`) and still
fabricates. e5 is the silent
case — when the colliding declaration happens to satisfy the position, the wrong
type produces no diagnostic and the theta registers with a member read typed
`array<string>` that evaluates to `"Red"`.

### (f) Bounds

```
@@ f1  schema Color { Red: string } (ill-cased own field) + schema Red = array<integer>
   codes :: ["theta/parse/binding-case-mismatch","theta/parse/unknown-method"]
   msgs  :: ["binding name must start with a lowercase letter or _",
             "unknown method 'join' on type string"]
@@ f2  enum Color { Red } / schema Color { a: string } / let s = Color.Blue
   codes :: ["theta/parse/unknown-variant"]
   msgs  :: ["unknown variant 'Blue' on enum 'Color'"]
@@ f3  enum Color { Red } / schema Color { a: string } / let c: Color = Color.Red
   codes :: []
@@ f4  schema Color { a: string } / schema Red = array<integer> (NO enum)
       fn f(): string { Color.Red.join(",") }
   codes :: ["theta/parse/non-string-array-join"]
```

f1 is the only way `:274` resolves the field, and it costs an `E`-severity case
diagnostic — so under a conformant program the fallback is unconditional. f2
shows variant resolution itself is unaffected. f3 is the annotation position:
`Color` resolves to the schema there, and the check defers — bug 0038 residual
(iii)'s territory, a §Non-goal. **f4 is the same fabrication with no enum
involved**: a genuinely absent field whose spelling matches a declaration.
`expressions.md:9` assigns an absent name a runtime panic and bug 0136 §Fix (c)
keeps parse silent for it; the collision makes parse refuse instead. Adjacent
class at the same line, recorded here because §Fix route 5 closes both and
routes 1–3 close only the enum half.

### (g) What an object-schema `named` answer draws — the §Fix constraint

Measured on a directly-typed object-schema value (no enum, no shadow), because
this is what the arm would return under a shadow if the enum route answered
with the receiver's own name:

```
@@ g1  schema Color { a: string } / fn f(c: Color) { c.frobnicate() }
   codes :: ["theta/parse/unknown-method"]   msgs :: ["unknown method 'frobnicate' on type Color"]
@@ g2  … { let m: integer = c  m }
   codes :: ["theta/parse/let-rhs-type-mismatch"]  msgs :: ["… expected integer, got Color"]
@@ g3  … { for y in c { 1 } }
   codes :: ["theta/parse/non-array-iterand"]      msgs :: ["… got Color"]
@@ g4  … { c + "x" }
   codes :: ["theta/parse/mixed-plus-operands"]    msgs :: ["… Color and string"]
@@ g5  … { c.keys() }                              codes :: []
@@ g6  … { c["a"] }                                codes :: []
```

g1–g4 are refusals naming the schema; g5/g6 are object operations **admitted**.
An enum value is neither: `expressions.md:9` and
`code-registry-runtime.md:23` reject a member, index or stdlib call on it at
runtime. So an answer of `named <enum name>` is inert only while nothing
declares that spelling — exactly the condition this bug breaks — and a route
that returns it under a shadow trades a wrong refusal for a different wrong
refusal (g1–g4) plus two new silent accepts (g5, g6).

## Expected behaviour

`schemas.md:97` states the answer: `Color.Red` is statically typed `Color`. It
is not typed `Red`, and no sentence in the corpus makes a variant's *name* a
type — `lexical.md:15` admits variant names as identifiers, and
`code-registry-parse.md:93` (`unknown-variant`) is the one check that reads them,
correctly (f2). Every row of §Reproduction (a), (c), (d) and (e) is a defect
against that sentence, in both directions: `Color.Red` acquiring `array<integer>`
from an unrelated `schema Red` is not `Color`, and `Color.Red` being admitted as
an `array<string>` iterand is not `Color` either.

`expressions.md:9`'s member-access sentence does not license the shadowed
reading. It assigns "the receiver's declared type for that field", and under a
shadow there is no such field — a conformant `schema Color` cannot declare `Red`
(`lexical.md:15`, f1). The sentence therefore assigns nothing here, and
`schemas.md:97` governs the expression uncontested.

The two other passes that resolve `Enum.Variant` already implement that reading:
the structural checker recognises a variant access by testing the receiver ident
against the file's enum-name map (`theta-document.ts:6637`) and the runtime
resolves the variant through the enum before treating the receiver as a value
(`statement-executor.ts:711–715`). Under the shadow both stay correct (f2, r8).
Only `#typeExpr`'s arm reads the pair the other way.

Whether the pair itself should be legal is the open corpus question. Today it is
(`lexical.md:18`, measured b1–b4), and while it is, the type of `Color.Red` under
a shadow must be the enum's — expressed by a value that resolves to no
declaration, since the g-rows show a value resolving to the shadowing schema
carries the schema's own dispositions.

## Actual behaviour / root cause

`collectTypeEnv` (`type-layer-checks.ts:328–357`) records only `schema`
declarations (`:341`). Bug 0136's enum route depends on that omission: it fires
in the `decl === undefined` branch (`static-type-inference.ts:270–272`), i.e.
"the receiver names nothing I can resolve, so hand the receiver back". The route
is therefore not an enum test at all — it is an unresolvability test that
coincides with one whenever no `schema` shares the enum's spelling.

A same-file `schema Color` breaks the coincidence:

1. `:267` types the receiver `Color` as `named "Color"` (the `ident` arm's
   nominal fallback) and unfolds it — for an object schema, unchanged (TYPE-10,
   `type-system.md:52`); for an alias, to its right-hand side (TYPE-11, `:54`),
   which for e1/e3 is not a `named` at all and skips the whole block.
2. `:269` resolves it: `resolveNamed` finds the schema.
3. `:271` is skipped — `decl` is defined.
4. `:274`'s own-key test fails, and must: variant names are PascalCase, field
   names lowercase-first (`lexical.md:15`), so the shadowing schema cannot own a
   field spelled like the variant without drawing `binding-case-mismatch` (f1).
5. `:278` mints `{ kind: "named", name: node.field }` — the pre-0136
   fabrication, kept deliberately for the absent-field case (0136 §Fix (c),
   `expressions.md:9`).

The minted name is not inert. `unfoldAlias`, `classifyReceiver` and `decide` all
resolve a `named` against the `TypeEnv`, so a third declaration spelled like the
variant supplies the expression's type — `array<integer>` (a1), `string` (c1),
`integer` (c3), an object schema (c7), a union (e3). `displayType`
(`type-compat.ts:327–342`) then renders that declaration's identifier — or, for
an alias, its right-hand side — into the `<type>` position of five registered
messages. The render is admissible
(`placeholder-rendering-a.md:19`) and the claim is false, which is the difference
from bug 0136's pre-fix state, where the rendered token was a variant name that
no clause admitted at all.

In the erasure direction the fabricated type is an `array<T>`, so
`checkForIterand` (`control-flow.ts:64–81`) — the one consumer that refuses
rather than defers — admits the iterand, and the emission that is owed
disappears. The runtime does not recover it: both loop forms coerce a non-array
iterand to `[]` (`statement-executor.ts:1643`, `:1328–1330`), so the body is
skipped with no diagnostic and no panic.

## Why it matters

- **Five registered `E`-severity codes refuse programs the spec admits, and the
  refusal is file-wide.** `hasLoadParseError`
  (`production-composition.ts:2214`) drops any theta carrying an
  `error`-severity `theta/load/*` or `theta/parse/*` diagnostic, so one
  `Color.Red` in one function denies registration to every command in the file.
  The author-facing message names a declaration that has nothing to do with the
  expression (`got Red`, `Red and string`, `on type Red`), and the theta it
  refuses is legal by `schemas.md:97` and `lexical.md:18`.
- **The one static objection to a non-array iterand can be removed by an
  unrelated declaration.** `control-flow.md:13` makes `theta/parse/non-array-iterand`
  the disposition for iterating a non-array; the runtime treats a non-array
  iterand as an empty snapshot and reports nothing. Under the double collision
  the parse gate is silent (d1, d4) and the loop body silently never executes
  (r1, r3) — measured against a legal-iterand control that runs twice (r5).
- **The fix bug 0136 shipped is one declaration away from being disabled for
  enums.** Its enum route is an unresolvability test, so any file that names a
  schema after an enum returns to pre-0136 behaviour at that position, silently.
  No test covers the shadowed input class (`tests/member-access-declared-field-type.test.ts`
  group (d) has no shadow row), so nothing detects the regression-to-old-behaviour
  if a later change widens it.
- **Bounded reach.** Two same-file collisions are required, and
  no committed `.theta` or `.thetalib` declares an `enum` at all, so the corpus
  is unaffected and GOV-15's loads-cleanly set (`source-language-stability.md:9`)
  is touched only for programs carrying the pair.

## Non-goals

- **Whether `enum` declarations belong in the `TypeEnv`.** Bug 0038 residual
  (iii) and bug 0031's recorded non-goal own that question; it changes what
  `resolveNamed` answers at every read site and at every annotation position
  (f3), and it decides what `classifyReceiver` should answer for an enum
  receiver — a parse-time widening against a runtime rejection
  (`expressions.md:9`, `code-registry-runtime.md:23`) with its own GOV-15
  question. §Fix route 3 records it for completeness only; three of the five
  routes close this report without it.
- **The `ident` arm's nominal fallback** (`static-type-inference.ts:211–216`).
  For a genuinely free name that is `type-system.md:48`'s documented posture;
  where it is not correct — an unbound plain-`for` loop variable — the subject is
  bug [0126](./0126-plain-for-binds-no-loop-variable.md). This report claims
  neither.
- **Bug 0136's field route.** `:273–276` is settled and correct, and every
  measurement here leaves it unmoved. A fix must not change what a member read
  of a declared field on a resolvable object schema types as.
- **The absent-field disposition.** `p.zzz` parses clean and panics
  `theta/runtime/missing-object-key` at runtime (`expressions.md:9`; bug 0136
  §Fix (c), witnessed by its rows e8/h5). The fallback at `:278` exists for that
  case; a route that removes the fabrication must keep the *silence*.
- **The `call` / `method-call` / `query` / `invoke` arms**, which mint a `named`
  from a callee, method, schema or path name (`:286`, `:296`, `:290`, `:288`).
  Same shape, different arms, each needing its own resolution source; bug 0136
  §Non-goals inventories them and this report adds nothing to that list.
- **The runtime's enum precedence.** `resolveEnumVariant` running before the
  receiver is evaluated as a value (`statement-executor.ts:711–715`) is correct
  and is the semantics a fix must mirror, not change (r8).

## Fix

**Not settled.** Five routes, and the choice turns on one adjudication this
report asks for rather than makes: **does a same-file `enum X` / `schema X` pair
stay legal?** Route 4 answers "no" and removes the input class; routes 1, 2, 3
and 5 answer "yes" and type the expression under it. The constraints below are
measured, and they eliminate the obvious variants.

**Constraint A — the answer must resolve to no declaration.** Returning the
receiver's own `named` (bug 0136's enum route, generalised) is not inert under a
shadow: §Reproduction (g) measures what an object-schema `named` draws in six
checked positions — four refusals naming the schema (g1–g4) and two silent
accepts of object operations an enum value cannot support (g5, g6). Any route
that types `Color.Red` as a *lookupable* `Color` trades one wrong answer for
another.

**Constraint B — unresolvability alone is not deferral.** Two consumers act on
an unresolvable `named` regardless: `checkForIterand`
(`control-flow.ts:64–81`) refuses every non-`array<T>` iterand, and `decide`
answers `named ⊑ array<…>` / `named ⊑ { … }` structurally before testing
resolution. Both facts are already recorded at
`type-layer-checks.ts:389–408`. At the iterand position the refusal is *wanted*
— `non-array-iterand` is owed there (d2/d3/d5) — but the `<type>` its message
renders must stay something `placeholder-rendering-a.md:11–21` admits (primitives,
literals, unions, arrays, named schemas / enums / aliases, `Result`, inline
object types), which a sentinel spelling is not.

**Constraint C — one arm, one seam.** The arm is read through the single public
`typeOf` (`static-type-inference.ts:182–188`), which the walk's own `typeOf`
delegates to (`type-layer-checks.ts:925–927`), so no per-consumer split is
available: one answer serves every check.

**Constraint D — pinned witnesses.** `tests/member-access-declared-field-type.test.ts`
(81 rows) is bug 0136's witness; its group (d) rows d5–d19 pin the un-shadowed
enum dispositions and its group (f) rows pin the sibling arms. A route touching
the arm keeps every one of them green and adds the shadowed rows. The two
protected witnesses bug 0136 re-pinned under parent grant
(`tests/ctor-field-type-check.test.ts` r3a/r3b,
`tests/question-operand-defect.test.ts` m6) must not move again.

**Constraint E — GOV-15.** Routes 1, 2, 3 and 5 *remove* refusals from the
double-collision input class and (route 3) may add them elsewhere; route 4 adds
a refusal to programs that load cleanly today (b1–b4). Additions are admitted by
the diagnostic-registry carve-out (`source-language-stability.md:25`) only for a
registry edit under DIAG-2; a route that adds refusals without a registry edit
needs its own GOV-15 disposition. The committed-corpus half is discharged by
`tests/committed-fixture-parse-gate.test.ts` (no corpus file declares an `enum`).

**Route 1 — an enum-name source threaded to the arm, answering with an
unresolvable value.** Collect the file's enum names where `collectTypeEnv` is
already called (`type-layer-checks.ts:241`, over the same `statements`
`checkStructural` reads at `theta-document.ts:857`) and hand them to the pass;
in `case "member"`, test the receiver *before* the schema lookup, mirroring the
runtime's precedence (`statement-executor.ts:711–715`). By constraint A the value
returned cannot be `named <enum name>` while a schema holds that spelling, so
this route needs a companion decision on what it *is*: the `<withheld>`-class
unspellable name (`type-layer-checks.ts:387`, with the grammar argument at
`:359–386` and the suppression reader at `:409–420`) or a new `CompatType` shape.
No registry row, no spec edit, one new input on the pass or the `typeOf` seam.
Leaves f4 (the absent-field collision) fabricating.

**Route 2 — a structural marker on the AST.** The parser already distinguishes a
variant access from a field read (`theta-document.ts:6632–6651`), so the
`member` node could carry that classification and the type arm would need no
name source. Wider blast radius: the node shape is read by
`literal-sublanguage.ts:520`, `query-schema-resolve.ts:340`, `functions.ts:511`,
`bindings.ts:103` and the runtime's own `case "member"`. Constraint A still
applies — knowing it is a variant access does not make `named <enum name>`
inert.

**Route 3 — record enums in the `TypeEnv`.** A new `NamedDecl` kind makes
`named "Color"` resolve to an *enum* and lets every consumer classify it
correctly, which is the only route where the answer can name the enum. It
reopens bug 0038 residual (iii): eight `resolveNamed` read sites and every
annotation position change behaviour (f3), `classifyReceiver` needs an enum arm,
and the parse-time consequences of an enum receiver (today a runtime rejection,
`code-registry-runtime.md:23`) need adjudication. It also needs a precedence rule
for the pair — enum first, per the runtime — or route 4. Widest; recorded because
it is the only route that satisfies `schemas.md:97` literally rather than
observably.

**Route 4 — refuse the collision.** A new registered code for a top-level
declaration name declared twice across kinds removes the input class entirely.
Costs: DIAG-2 (`diagnostic-shape.md:72`) makes the registry closed, so the row
lands in `code-registry-parse.md` with its owning spec sentence and the
`docs/reference/diagnostics.md` mirror **in the same commit**;
`lexical.md:18`'s "the only enforced naming constraints" sentence has to move,
and it is load-bearing elsewhere; and the addition is a GOV-15 refusal of
programs that load cleanly today, admitted by the `:25` carve-out for the inputs
it touches. It leaves `#typeExpr` untouched — and leaves f4 fabricating, since an
absent field colliding with a declaration needs no duplicate declaration.

**Route 5 — neutralise the fallback.** Replace `:278`'s
`{ kind: "named", name: node.field }` with a value no declaration can spell
(`WITHHELD_BINDER_TYPE_NAME`'s class). This closes every collision at this line
at once — the enum shadow *and* f4's absent-field collision — with no enum-name
source and no registry row, and it preserves the absent-field silence bug 0136
§Fix (c) requires, because the value defers everywhere the name did except where
it accidentally resolved. Two costs, both measurable: `schemas.md:97` is
satisfied only observably (the type is a placeholder that defers, not `Color`;
identical diagnostics, different reading), and constraint B's iterand position
renders the placeholder into `non-array-iterand`'s `<type>` — so the route must
either pass through the existing withheld suppression or accept a message
`placeholder-rendering-a.md:11–21` does not admit. Bug 0136 §Fix (a) route 2
recorded this shape as strictly weaker for *its* subject; for this one it is the
narrowest complete answer.

**Witness obligation, whichever route lands.** New rows for: the double
collision in all five checked positions with their un-shadowed controls (a1–a4,
c1–c8); the declaration-pair silence (b1–b4) so the route does not refuse the
pair by accident unless route 4 is chosen; both loop forms in both directions
(d1–d6) with the runtime dispositions (r1–r8); every shadow spelling (e1–e5);
and the bounds (f1–f4, g1–g6). Every expected message read from the registry
per DIAG-4 (`diagnostic-shape.md:74`), failing loudly when a row or placeholder
is absent.

## Provenance

- Bug 0136's fix record, §Residuals item 2 ("An enum name shadowed by a schema of
  the same spelling still fabricates"), which states the mechanism, records that
  behaviour is byte-identical to pre-fix, and defers the filing:
  `docs/bugs/0136-member-access-types-as-field-name-not-field-type.md` §Fix
  (0.106.0) §Residuals.
- `.pi/tmp/fixes/0136-report.md` §Residuals / notes item 2 — the same finding as
  the fix run reported it, attributed to that run's review round 1.
- Spec: `docs/spec_topics/schemas.md` §Variant access (`:95–97`);
  `docs/spec_topics/expressions.md:9`, `:22`;
  `docs/spec_topics/lexical.md:15`, `:18`;
  `docs/spec_topics/type-system.md:48`, `:52`, `:54`;
  `docs/spec_topics/control-flow.md:13`; `docs/spec_topics/imports.md:59`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:19`, `:36`, `:38`, `:43`,
  `:56`, `:65`, `:66`, `:88`, `:89`, `:93`, `:95`, `:96`, `:101`, `:114`;
  `docs/spec_topics/diagnostics/code-registry-runtime.md:23`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`;
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:19`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`.
- Implementation read at HEAD `6942ef27`:
  `src/parser/static-type-inference.ts:242–279`;
  `src/parser/type-layer-checks.ts:170–193`, `:241`, `:328–357`, `:359–420`,
  `:925–927`, `:1096–1102`, `:2299–2342`, `:2351–2380`;
  `src/parser/type-compat.ts:104–106`, `:155–172`, `:327–342`;
  `src/parser/control-flow.ts:64–81`;
  `src/parser/theta-document.ts:857`, `:899`, `:5816–5822`, `:6632–6651`;
  `src/parser/schema-declarations.ts:315–331`;
  `src/runtime/statement-executor.ts:706–716`, `:1328–1330`, `:1643`;
  `src/runtime/lexical-environment.ts:526–536`;
  `src/runtime/control-flow.ts:52–60`;
  `src/extension/import-static-checks.ts:88–96`;
  `src/extension/production-composition.ts:2214`.
- Measurement: one scratch vitest file under `tests/` driving `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) and the production executor harness shape from
  `tests/member-access-declared-field-type.test.ts:1155–1249`; 38 parse rows and
  8 runtime rows, re-measured at a `git status --short`-clean tree at
  `6942ef27`, then deleted.
