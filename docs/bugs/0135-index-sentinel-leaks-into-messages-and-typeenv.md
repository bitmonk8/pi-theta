# Bug 0135 — `#typeExpr`'s index else arm mints the internal type name `index`, and that name has two author-visible faces: `displayType` returns it verbatim, so `fn f(p: Nope) { for y in p[0] { y } }` reports `got index` — a name category 1 of `placeholder-rendering-a.md` does not admit and `lexical.md:15` forbids at a type position — while `schema index = …` draws `theta/parse/schema-case-mismatch` and still enters the `TypeEnv`, so an author's refused declaration decides real checks off the parser's own fabrication

- **Status:** fixed (0.202.0). §Fix was not settled at filing: this report
  existed to pin the sentinel's disposition and the DIAG-2 / DIAG-4 reading,
  and `## Fix (0.202.0)` below records the in-run adjudication that settled it —
  **face 2 closed on Reading A at the read seam, face 1 declined to
  [0143](./0143-withheld-sentinel-author-twin-and-render-leakage.md)**.
  Coordination, not a hard prerequisite —
  [0125](./0125-index-element-narrowing-not-alias-unfolded.md) is **fixed
  (0.76.0)** and its witness pins four of this report's rows byte-exact
  (`tests/index-element-alias-unfolded.test.ts:833`, `:859`, `:971`, `:1003`);
  any fix here updates those four deliberately. Three open reports
  ([0124](./0124-parsetype-trailing-punctuation-leniency.md),
  [0126](./0126-plain-for-binds-no-loop-variable.md),
  [0130](./0130-let-rhs-type-mismatch-declines-object-union.md)) each own a
  different non-conformant name reaching the same `displayType` arm; whichever
  render-touching fix lands second rebases against the first.
- **Sev/Diff estimate:** S2/D3 — a DIAG-4 *Message* names a type no
  declaration can declare (`got index`), and the same rendered string is
  produced from three disjoint sources including two author-legal ones, so the
  message misidentifies the offending type rather than corrupting a value; no
  load hazard, because every input that reaches it already carries an
  `E`-severity code. D3 because §Fix needs in-run adjudication across four
  routes, the DIAG-2/DIAG-4 reading is the deliverable, and the change lands on
  a path shared with four other reports under byte-pinned coordination against
  0125's witness.
- **Kind:** two defects against the same object.
  1. **Render — defect against
     `docs/spec_topics/diagnostics/placeholder-rendering-a.md:19` read with
     `docs/spec_topics/lexical.md:15`.** `displayType`'s `case "named"`
     (`src/parser/type-compat.ts:324–325`) returns `type.name` verbatim, so the
     internal string `index` reaches a `<type>` / `<actual>` placeholder
     whenever the else arm's value is rendered. Category 1 admits a `named`
     rendering only as "Named schemas, enums, and type aliases by their
     theta-side identifier … the identifier shape is fixed by
     [Lexical — Identifiers]" (`:19`), and `lexical.md:15` requires an
     uppercase first letter for "`schema` names, `enum` names, `enum` variant
     names, and any user identifier introduced as a type-like binding". A
     lowercase-initial name is refused at every declaration position
     (`theta/parse/schema-case-mismatch`,
     `docs/spec_topics/diagnostics/code-registry-parse.md:20`), so `index`
     names a type no conformant schema can be.
  2. **Collision — defect against
     `docs/spec_topics/diagnostics/code-registry-parse.md:54` read with
     `docs/spec_topics/type-system.md:48`.** `collectTypeEnv`
     (`src/parser/type-layer-checks.ts:302–331`) admits every `schema`
     statement with no case test, so `schema index = …` enters the `TypeEnv`
     despite the `E`-severity refusal the lexer already emitted
     (`src/lexer/lexer.ts:842–849`). The sentinel then resolves through the
     author's declaration and the checks decide on it. **Bound:** both measured
     rows also carry `schema-case-mismatch`, which is `E`, so
     `hasLoadParseError` (`src/extension/production-composition.ts:2045–2052`)
     denies registration and **neither theta loads**. This is
     diagnostic-correctness, not a load hazard.
- **Related:**
  - [0125](./0125-index-element-narrowing-not-alias-unfolded.md) — **fixed
    (0.76.0)**, the origin. Its §Fix (b) kept the sentinel unchanged, required
    a fix leaving `got index` reachable to say so, and its fix record says so:
    "the DIAG-4 render leak against `placeholder-rendering-a.md:19` read with
    `lexical.md:15` **survives this fix**". Its §Non-goals hands both faces
    here: "The `named "index"` render leak's non-alias reach … belong[s] with
    the sentinel's disposition (§Fix (b))". Its §Fix (b) also states the two
    rename traps this report measures. Its witness pins the four rows named in
    §Affected.
  - [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md)
    — **fixed (0.48.0)**, the `named`-mint class. **It does not own this
    instance, and this is not a duplicate of it.** 0038's subject is the
    `TypeEnv`'s prototype chain: a plain `{}` answered a `NamedDecl`-shaped
    question for twelve `Object.prototype` own names. Its fix null-prototyped
    the record (`type-layer-checks.ts:303`) and routed all eight reads through
    `resolveNamed` (`type-compat.ts:104–106`). Its §Affected enumerates **five**
    `static-type-inference.ts` arms that mint a `named` "from an author-chosen
    name" — `:215`, `:244`, `:252`, `:258`, `:262`. The `case "index"` arm
    existed at 0038's baseline `f959f8de` at the same line numbers it holds
    today (`:245`, `:249`) and is **absent from that list**, because its name is
    not author-chosen. What 0038 settled is the disposition for an
    *unresolvable* `named` — it defers (`type-system.md:48`), measured here as
    the c2 and c4 controls. The two faces below are the two places that
    deferral does not reach: a gate that rejects instead of deferring still
    renders the name, and a `TypeEnv` that *does* resolve it because an author
    declared it. Same file, adjacent arm, disjoint mechanism.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **open**, an adjacent
    source at the same render arm. A plain `for` binds no loop variable, so the
    iterand gate renders the loop variable's identifier
    (`src/parser/control-flow.ts:79`); its §Actual behaviour records that
    `placeholder-rendering-a.md:13–21` "has no case for it". Its fix restores
    the binding; it does not change `displayType`. Row b2 below sits on 0126's
    neighbouring member-arm gap and is cited here only for the rendered string.
  - [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) — **open**, a
    third source at the same arm. An inline object annotation becomes a
    pseudo-`named` whose raw text renders as `array<{a:integer}>`, against
    `placeholder-rendering-a.md:21`. It cites the same two lines
    (`type-compat.ts:318–333`, the `named` arm at `:324–325`) and changes
    neither.
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **open**, a
    fourth source. A junk capture reaches the same arm and prints
    `got array<string>--`; its §Fix states that a route leaving the capture
    reachable "leaves a normative placeholder rendering non-type text".
  - [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md)
    — **open**. `checkArrayJoin` (`src/runtime/stdlib-array.ts:100–123`) takes
    no `TypeEnv` and cannot distinguish an unresolvable element from a
    resolvable non-`string` one. Row c1 below fires through that gate; 0127
    owns whether it should fire at all, this report owns only what it renders.
  - [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md) — **fixed
    (0.72.0)**, the TYPE-11 opacity family 0125 extended. Not a fix dependency.
- **Affected** (every citation verified at HEAD `7c8833cd`, 0.76.0):
  - `src/parser/static-type-inference.ts:245–250` — **the mint.** `#typeExpr`'s
    `case "index"`: `:248` unfolds the target, `:249` returns
    `target.element` for an `array` and `{ kind: "named", name: "index" }`
    otherwise. `rg -c 'name: "index"' src/parser/static-type-inference.ts`
    returns 1 — this is the sole construction point of the value.
  - `src/parser/type-compat.ts:318–332` — `displayType`. The `case "named"` arm
    is `:324–325`, `return type.name`, with no conformance test and no `env`
    parameter to run one against. The doc comment (`:313–317`) binds the
    function to "the `<expected>` / `<actual>` fields of the
    diagnostics/code-registry-parse.md *Message* strings".
  - `src/parser/type-layer-checks.ts:302–331` — `collectTypeEnv`, the
    `TypeEnv`'s construction site and face 2's cause. `:315` selects on
    `stmt.kind === "schema"` alone; the alias write is `:319`, the object-schema
    write `:324`. No case test at either. The record is `Object.create(null)`
    (`:303`) after bug 0038.
  - `src/lexer/lexer.ts:842–849` — the `theta/parse/schema-case-mismatch`
    emission: `severity: "error"` at `:844`. It is a contextual lexer
    diagnostic, not a parse refusal, so the `SchemaDecl` still reaches
    `doc.body.statements` and `collectTypeEnv` still walks it — the mechanism
    bug 0038's fix record already corrected into the record.
  - `src/parser/type-compat.ts:155–172` — `unfoldAlias`, which resolves the
    sentinel's name through `resolveNamed` (`:165`) and returns the
    declaration's right-hand side (`:169`) when an author declared it;
    `:104–106` — `resolveNamed`, own-key-guarded after bug 0038.
  - **The four emitting rows measured below**, each rendering through
    `displayType`:
    - `src/parser/control-flow.ts:64–81` — `checkForIterand`. `:69` unfolds,
      `:70–72` admits an `array`, `:79` renders
      `` `'for' expects array<T> after 'in'; got ${displayType(type)}` ``.
    - `src/parser/type-compat.ts:403–442` — `checkLetRhsCompat`. `:412` defers
      on `"unknown"`; `:437–439` renders `<expected>` and `<actual>`.
    - `src/runtime/stdlib-array.ts:100–124` — `checkArrayJoin`. `:120–122`
      renders `<element>`.
    - `src/parser/type-layer-checks.ts:1495` — `checkMethodCall`'s
      `unknown method '<method>' on type <type>` render.
  - **The render surface.** `rg -n 'displayType\(' src/` returns 25 hits at
    HEAD: one is the definition (`type-compat.ts:318`), two are its own
    recursion (`:327`, `:331`), one composes a `named` *name* rather than a
    message (`static-type-inference.ts:290`), two fill structured diagnostic
    fields (`src/extension/invoke-static-checks.ts:606`, `:873`), one fills a
    `display` field (`type-layer-checks.ts:1260`); the remaining eighteen
    line-hits build twelve author-facing *Message* strings. Which of the twelve
    the sentinel can reach is not censused here; four are measured below.
  - `src/parser/static-type-inference.ts:256`, `:258`, `:279`, `:343` — four
    arms minting three sibling internal names on the same pass:
    `node.schema ?? "query"`, `node.typeName ?? "object"`, and two
    `named "unknown"` returns. Row f1
    measures `object` reaching the same *Message* as `index`, so a rename route
    that covers one name and not the others closes part of the class.
  - `src/extension/production-composition.ts:2045–2052` — `hasLoadParseError`:
    any error-severity `theta/load/*` or `theta/parse/*` blocks registration.
    This is what bounds face 2 to diagnostic-correctness.
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md:9–21` — category
    1, *Static-type placeholders*. `:11` lists the placeholders it governs
    (`<type>`, `<expected>`, `<actual>`, `<left>`, `<right>`, `<element>`);
    `:13` states the rule, "re-serialising it in the source-grammar form
    defined in [Type System]"; `:15–21` are its seven clauses, `:19` the
    `named` one. `:5` states the purpose — "so two conformant implementations
    produce byte-identical strings … for the same source defect" — and `:7` is
    the closure paragraph: every placeholder is admitted by one of the
    enumerated clauses, "this closure is enforced at build time", and moving or
    minting a placeholder is "a spec-versioned breaking change governed by
    **GOV-7** and **GOV-8**".
  - `docs/spec_topics/lexical.md:13` — the identifier grammar
    `[A-Za-z_][A-Za-z0-9_]*`; `:15` — the PascalCase rule for type-like
    bindings; `:16` — the lowercase-first rule for "`let` and `let mut`
    bindings, function parameters, function names, and schema field names",
    which is what puts `index` inside the author's namespace at three
    positions; `:20` — the reserved-keyword list, which does **not** contain
    `index`.
  - `docs/spec_topics/type-system.md:48` — *Unresolvable operands*: the
    parse-time check "is skipped and the runtime AJV check is the safety net".
    This is the disposition the c2 and c4 controls exhibit and the one any fix
    preserves. `:54` — TYPE-11, alias transparency, which is why an author's
    `schema index = string` makes the sentinel's name resolvable at all.
  - `docs/spec_topics/expressions.md:10` — the *Indexed access* bullet after
    bug 0125's edit. It now states the array result type ("The static result
    type of `arr[i]` is `T` when the receiver is `array<T>`") and the object
    result type ("the union of the receiver's declared field types"). Row a2's
    receiver is an object, so a2's fabricated type also fails this sentence —
    that half is the unfiled report 0125 §Non-goals names, not this one.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the
    registry is closed; a trigger change is a spec change landing in the same
    commit); `:74` — DIAG-4 (the *Message* column is normative and reworded
    wording is deferred to theta 2.0).
  - `docs/spec_topics/diagnostics/code-registry-parse.md:20`, `:43`, `:54`,
    `:63`, `:64` — the five rows this report touches
    (`schema-case-mismatch`, `non-string-array-join`, `let-rhs-type-mismatch`,
    `unknown-method`, `non-array-iterand`). **All five carry `E`.** Mirrors
    without a *Trigger* column: `docs/reference/diagnostics.md:66`, `:89`,
    `:100`, `:109`, `:110`.
  - `docs/spec_topics/governance/source-language-stability.md:9` — GOV-15's
    loads-cleanly predicate. Every input measured below emits an `E`, so none
    is in the equivalence promise's input set.
  - **Existing coverage.** `tests/index-element-alias-unfolded.test.ts` — bug
    0125's witness, 51 rows, green at HEAD. Four rows pin this report's
    behaviour in both directions and must be updated deliberately by any fix:
    d7 (`:833–857`, the a1 row, whose comment names this residual in terms),
    d8 (`:859–883`, a2), d13 (`:971–994`, c1) and d15 (`:1003–1021`, c3), with
    the d14 (`:996–1001`) and d16 (`:1023–1028`) controls beside them. Its
    `msg` helper (`:168–182`) sources every expected message from the registry
    and asserts row definedness and placeholder presence first, so a template
    reword reds by naming the registry. **No test anywhere asserts that a
    rendered type name is conformant**, and no test covers rows b1, b2, c5, e2
    or f1.
- **Observed at:** `0.76.0` (HEAD `7c8833cd`). Offline, deterministic; no live
  model, no provider. Scratch vitest over `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) driving the shipped `parseThetaDocument`,
  frontmatter `---\nmode: prompt\n---`; written, run, deleted. Rows a1, a2, c1,
  c2, c3 and c4 additionally reproduce as 0125's committed d7, d8, d13, d14,
  d15, d16.

## Summary

`#typeExpr`'s `case "index"` arm has one else branch, and it fabricates a type:
`{ kind: "named", name: "index" }` (`src/parser/static-type-inference.ts:249`).
The value is internal — no declaration produces it and no author writes it —
but the string it carries is an ordinary lowercase identifier, and two
mechanisms make that string author-visible.

**It renders.** `displayType`'s `case "named"` returns `type.name` unchanged
(`src/parser/type-compat.ts:324–325`). Every downstream gate that refuses a
non-`array` and renders what it refused therefore prints `index`. Measured with
no alias and no declaration in the source:
`fn f(p: Nope) { for y in p[0] { y } }` and
`schema P { xs: array<string> }` + `for y in p["xs"] { y }` both report
`'for' expects array<T> after 'in'; got index`. Category 1 of
`placeholder-rendering-a.md` (`:9–21`) admits a `named` rendering only as a
"theta-side identifier" whose "identifier shape is fixed by
[Lexical — Identifiers]" (`:19`), and `lexical.md:15` requires an uppercase
first letter at every type-like position. The message names a type no
conformant schema can be.

**It collides.** `index` is a legal identifier at three author positions —
function name, function parameter, schema field name (`lexical.md:16`) — and it
is not reserved (`:20`). Two of those positions feed `#typeExpr` arms that mint
a `named` from the author's own name: the call arm (`:252`) and the member arm
(`:244`). Measured, `fn index(): integer { 1 }` + `for y in index() { y }` and
`schema P { index: array<string> }` + `for y in p.index { y }` each report
`got index` with **no** case diagnostic at all. Three disjoint sources, one
rendered string, nothing in the message distinguishing them.

The declaration position is refused but not fenced. `schema index = …` draws
`theta/parse/schema-case-mismatch` from the lexer (`lexer.ts:842–849`), and
`collectTypeEnv` (`type-layer-checks.ts:302–331`) selects on
`stmt.kind === "schema"` with no case test, so the declaration enters the
`TypeEnv` anyway. The sentinel's name then resolves through it: `schema index =
array<integer>` makes an unresolvable receiver's element read supply
`array<integer>` to the `join` guard, and `schema index = string` makes it
supply `string` to a typed `let`. Both controls — the identical bodies with the
declaration removed — report nothing, which is `type-system.md:48`'s deferral
working correctly. **Both collision rows also carry the `E`-severity
`schema-case-mismatch`, so `hasLoadParseError` denies registration and neither
theta loads.** The exposure is a wrong diagnostic on a document that is already
refused, not a program that runs on a fabricated type.

The class is wider than the sentinel in both directions. A second internal
fabrication on the same pass, `named "object"`
(`static-type-inference.ts:258`), reaches the identical *Message*: `let v = { a:
1 }` + `for y in v { y }` reports `got object`. And the mint collision fires at
sites this report does not touch: `schema L = array<string>` + `let m: integer =
L` reports `let binding 'm' initialiser type mismatch: expected integer, got L`,
where `L` names a schema and not a value.

## Reproduction

Offline, deterministic, at `7c8833cd`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`,
frontmatter `---\nmode: prompt\n---`, a trailing `1` supplying the final value.
Each cell is the whole diagnostic list in emission order, unfiltered.

### (a) The render, with no alias and no declaration

| # | source | diagnostics |
|---|---|---|
| a1 | `fn f(p: Nope) { for y in p[0] { y } }` | `theta/parse/non-array-iterand`: `'for' expects array<T> after 'in'; got index` |
| a2 | `schema P { xs: array<string> }` + `fn f(p: P) { for y in p["xs"] { y } }` | same code, same message |

a1's receiver is unresolvable (`Nope` names nothing); a2's is an object schema,
which `unfoldAlias` returns unchanged under TYPE-10. Both fail
`:249`'s `kind === "array"` test and take the else arm. Neither source contains
a type alias, so bug 0125's fix does not reach them — these are its committed
rows d7 and d8, green in both directions at HEAD.

### (b) The same rendered string from author-legal source, with no case diagnostic

| # | source | diagnostics |
|---|---|---|
| b1 | `fn index(): integer { 1 }` + `for y in index() { y }` | `theta/parse/non-array-iterand`: `got index` |
| b2 | `schema P { index: array<string> }` + `fn f(p: P) { for y in p.index { y } }` | `theta/parse/non-array-iterand`: `got index` |
| b3 | `schema P { index: array<string> }` alone | `[]` — control |
| b4 | `fn index(): integer { 1 }` + `let q: integer = index()` | `[]` — control |
| b5 | `let index = 1` + `for y in index { y }` | `theta/parse/non-array-iterand`: `got integer` — control |

b3 establishes that `index` is a legal field name and b4 that it is a legal
function name: neither draws a case diagnostic, and b4's call is unresolvable so
the typed `let` defers per `type-system.md:48`. b1's rendered string comes from
the call arm (`:252`), b2's from the member arm (`:244`); neither is the
sentinel, and both are byte-identical to it in the message. b5 is the recovery
control — a bound identifier reads its recorded type, so the message names the
real one.

b2's *rejection* is a separate defect: `p.index` is declared `array<string>`, so
the loop is legal and the gate refuses it. The member arm types a field access
by the field's *name* rather than its type, which is bug 0038's class and bug
0125's residual 3. This report claims only the rendered string.

### (c) The `TypeEnv` collision, and its controls

| # | source | diagnostics |
|---|---|---|
| c1 | `schema index = array<integer>` + `fn f(p: Nope) { let y = p[0]  y.join(",") }` | `theta/parse/schema-case-mismatch`: `schema name must start with an uppercase letter`; `theta/parse/non-string-array-join`: `array.join requires a string element type; got array<integer>` |
| c2 | the same body with no declaration | `[]` — control |
| c3 | `schema index = string` + `fn f(p: Nope) { let m: integer = p[0]  m }` | `schema-case-mismatch`; `theta/parse/let-rhs-type-mismatch`: `let binding 'm' initialiser type mismatch: expected integer, got index` |
| c4 | the same body with no declaration | `[]` — control |
| c5 | `schema index = string` + `fn index(): integer { 1 }` + `let m: integer = index()` | `schema-case-mismatch`; `let-rhs-type-mismatch`: `… expected integer, got index` |
| c6 | the same with the function renamed `index2` | `schema-case-mismatch` alone — control |

c1 and c3 are 0125's committed rows d13 and d15; c2 and c4 are its d14 and d16.
The pair c1/c2 and the pair c3/c4 differ by one declaration line, and that line
is refused at `E` severity in both. c5/c6 extend the measurement: the same
refused declaration also decides a *call*'s type, because `fn index()` is legal
(b4) and mints the same name.

Every row of (c) carries `schema-case-mismatch`, which is `E`
(`code-registry-parse.md:20`), so `hasLoadParseError`
(`production-composition.ts:2045–2052`) denies registration. No theta in this
group loads.

### (d) The uppercase trap, measured

| # | source | diagnostics |
|---|---|---|
| d1 | `schema Index = string` + `let q: Index = 1` | `let-rhs-type-mismatch`: `let binding 'q' initialiser type mismatch: expected Index, got integer` |

One diagnostic, and it is the intended one. `schema Index = string` draws
nothing: an uppercase-initial name is conformant at a declaration position, so
there is no case shield at all. The declaration resolves — a mismatch fires
only where both operands are statically resolvable
(`code-registry-parse.md:54`, `type-system.md:48`), so the report itself proves
`Index` is in the `TypeEnv`. A sentinel renamed to an uppercase-initial
identifier is therefore a name an author declares cleanly, in a theta that
**registers**.

### (e) The mint collision at sites this report does not touch

| # | source | diagnostics |
|---|---|---|
| e1 | `schema L = array<string>` + `let y = L[0]  y.frobnicate()` | `theta/parse/unknown-method`: `unknown method 'frobnicate' on type string` |
| e2 | `schema L = array<string>` + `let m: integer = L` | `let-rhs-type-mismatch`: `let binding 'm' initialiser type mismatch: expected integer, got L` |
| e3 | `schema Variant = array<string>` + `enum E { Variant }` + `let y = E.Variant[0]  y.frobnicate()` | `unknown-method`: `… on type string` |

`L` names a schema, not a value, so no legal program is refused in e1 or e3 —
the input is broken either way, and 0125's fix moved these from `[]` to a
refusal ahead of runtime. e2 is the sharp one: an identifier reference to a
schema name mints `named "L"`, the `TypeEnv` resolves it under TYPE-11, and the
check reports a mismatch naming a schema where a value was expected. Neither the
declaration nor the reference draws a case diagnostic. Recorded as evidence that
the class 0038 named is wider than the sentinel, not as this report's claim.

### (f) A second internal fabrication at the same render

| # | source | diagnostics |
|---|---|---|
| f1 | `let v = { a: 1 }` + `for y in v { y }` | `theta/parse/bare-object-literal`; `theta/parse/non-array-iterand`: `'for' expects array<T> after 'in'; got object` |

`#typeExpr`'s `case "object"` returns `{ kind: "named", name: node.typeName ??
"object" }` (`:258`). `object` fails category 1 for the same reason `index`
does. A rename route addressing one name and not the other leaves the class
half-closed; `:256` (`query`), `:279` and `:343` (`unknown`) are the remaining
three.

## Expected behaviour

**Category 1's rendering rule is closed, and `index` is not in it.**
`placeholder-rendering-a.md:11` lists the six placeholders category 1 governs —
`<type>`, `<expected>`, `<actual>`, `<left>`, `<right>`, `<element>` — and `:13`
binds them to one rule: "Render the Theta static type by re-serialising it in
the source-grammar form defined in [Type System](../type-system.md)". Its seven
clauses (`:15–21`) cover primitives, literals, unions, arrays, `Result<T, E>`,
inline object types, and — `:19` — named types:

> Named schemas, enums, and type aliases by their theta-side identifier (no
> wire-name translation; the identifier shape is fixed by
> [Lexical — Identifiers](../lexical.md)).

The clause admits three referents and constrains their shape by reference.
`lexical.md:15` supplies the shape:

> **PascalCase** (uppercase first letter) is required for: `schema` names,
> `enum` names, `enum` variant names, and any user identifier introduced as a
> type-like binding.

`index` is not a schema, enum or type alias — no declaration produces it in rows
a1, a2, b1 or b2 — and its first letter is lowercase, so it fails the clause on
both halves. Rows a1/a2 render it anyway. The purpose is stated at
`placeholder-rendering-a.md:5`: the categories exist "so two conformant
implementations produce byte-identical strings … for the same source defect",
and the closure paragraph (`:7`) makes the admitted set exhaustive and
build-time enforced. A rendered token outside every clause is not a variation
within the rule; it is outside it.

**The obligation is the interpolated value, not the template.** DIAG-4
(`diagnostic-shape.md:74`) makes the *Message* column normative and requires
renderers to "emit it character-for-character with placeholders interpolated".
The template here is emitted correctly: `'for' expects array<T> after 'in'; got
<type>` matches `code-registry-parse.md:64` byte for byte. What the placeholder
is filled with is category 1's obligation (`placeholder-rendering-a.md:13–21`), and that is the
one not met.

**A name an author can spell must mean the author's declaration or nothing.**
`type-system.md:48` fixes the disposition for a name the `TypeEnv` does not
resolve: the check is skipped. Rows c2 and c4 exhibit it. Rows c1, c3 and c5
differ only by a declaration the parser has already refused at `E` severity, and
they report a *different* code with a *different* message — so a refused
declaration changes the diagnostic output of a construct that does not mention
it. Two readings are available and the report does not pick between them here:

- **Reading A — the `TypeEnv` entry is the defect.** `lexical.md:15` refuses the
  declaration, so the document declares no type named `index`;
  `code-registry-parse.md:54`'s "where the RHS type is statically resolvable"
  qualifier therefore excludes c3, exactly as bug 0038 argued for `constructor`.
  On this reading `collectTypeEnv` must not admit a name its own case rule
  refuses, and the fix is at `type-layer-checks.ts:315`.
- **Reading B — the sentinel is the defect and the `TypeEnv` is correct.**
  `collectTypeEnv` records what the source declares; recovery after an
  `E`-severity diagnostic is deliberate elsewhere in the parser, and a
  document that does not load owes no guarantee about which of its `E`s it
  emits. On this reading the only defect is that the parser chose a name from
  the author's namespace, and the fix is at
  `static-type-inference.ts:249`.

Reading B is the narrower change and Reading A the more general one: A also
closes `schema object`, `schema query` and `schema unknown` (f1's family) and
every future fabricated lowercase name at once, while B closes one name and
leaves the mechanism. Neither is settled here. What both readings agree on: the
c2/c4 deferral must survive, and the b1/b2 messages — which carry no refused
declaration at all — are not closed by either.

**GOV-15 does not range over any of it.** Every row above emits at least one
`E`-severity code (`code-registry-parse.md:20`, `:43`, `:54`, `:63`, `:64` all
carry `E`), so none satisfies the loads-cleanly predicate
(`source-language-stability.md:9`) and none is in the equivalence promise's
input set. A fix that changes the rendered string, the emitted code, or both
owes no carve-out.

## Actual behaviour / root cause

**One mint, no conformance test at either end.** The value is constructed at
`static-type-inference.ts:249`:

```ts
case "index": {
  // TYPE-11: unfolding first makes an alias of `array<T>` narrow to `T`;
  // TYPE-10 object-schema and unresolvable names unfold to themselves.
  const target = unfoldAlias(this.#typeExpr(node.target, env, bindings), env);
  return target.kind === "array" ? target.element : { kind: "named", name: "index" };
}
```

`CompatType`'s `named` arm (`type-compat.ts:58`) carries a bare `string` and no
provenance, so
nothing downstream can tell a fabricated name from a declared one. It is
consumed at `type-compat.ts:324–325`:

```ts
case "named":
  return type.name;
```

`displayType` takes no `TypeEnv`, so it could not check resolvability even if it
tested the shape. The two ends are the whole mechanism: an unconstrained
producer and an unconditional renderer.

**The gates render what they refuse, and they refuse a `named`.** Each of the
four measured rows tests a `kind` and emits on the negative branch with the
tested value interpolated — `checkForIterand` (`control-flow.ts:69–80`),
`checkLetRhsCompat` (`type-compat.ts:411–441`), `checkArrayJoin`
(`stdlib-array.ts:107–123`), `checkMethodCall` (`type-layer-checks.ts:1495`).
Three of the four have no deferral arm for an unresolvable `named`;
`checkLetRhsCompat` does (`:412`, the `"unknown"` case), which is why c4 is
silent and c3 is not. The render leak is therefore reachable through two
distinct routes: a gate with no deferral arm (a1, a2, b1, b2, f1), and a gate
that has one but whose operand became resolvable (c3).

**The `TypeEnv` admits a name the lexer refused.** `collectTypeEnv`
(`type-layer-checks.ts:302–331`) walks `statements` twice and selects on
`stmt.kind === "schema"` (`:306`, `:315`) with no case test:

```ts
if (stmt.kind === "schema") {
  if (stmt.arms !== undefined) {
    const rhs = aliasRhs.get(stmt.name);
    if (rhs !== undefined && !cyclic.has(stmt.name)) {
      env[stmt.name] = { kind: "alias", rhs };
    }
    continue;
  }
  …
```

The case rule is enforced elsewhere and earlier: `lexer.ts:842–849` pushes
`theta/parse/schema-case-mismatch` at `severity: "error"` when a type-position
identifier's first character is not `A`–`Z`. It is a diagnostic, not a refusal,
so the statement survives into `doc.body.statements` and this walk sees it. Bug
0038's fix record already corrected the record on this point — "the bound is the
`E` severity denying registration, not the grammar" — and the same sentence
applies here. `unfoldAlias` (`type-compat.ts:155–172`) then resolves the
sentinel's name through `resolveNamed` (`:165`) and returns the declaration's
right-hand side (`:169`), which is how c1's `array<integer>` and c3's `string`
reach their gates.

**The sentinel's name is inside the author's namespace.** `lexical.md:13` admits
`[A-Za-z_][A-Za-z0-9_]*`; `:16` requires lowercase-first for function names,
parameters and field names; `:20`'s reserved list does not contain `index`. So
`index` is legal at three positions (b3, b4 measured), and two `#typeExpr` arms
mint a `named` from exactly those positions — `:244` from a field name, `:252`
from a callee name. Rows b1 and b2 are the consequence: an author-chosen name
and the parser's fabrication produce byte-identical `CompatType` values and
byte-identical messages, with no case diagnostic to mark the difference.

**The bound on face 2 is registration, not the type system.**
`hasLoadParseError` (`production-composition.ts:2045–2052`) returns true for any
error-severity `theta/load/*` or `theta/parse/*`, and `schema-case-mismatch` is
`E`. Every row of group (c) therefore fails to register. Nothing measured here
lets a fabricated type reach a running theta.

**The fabrication is not unique.** Four sibling arms on the same pass mint
internal names: `:256` (`query`), `:258` (`object`), `:279` and `:343`
(`unknown`). Row f1 measures `object` rendering into the same *Message* as
`index`. A fifth, `:290`, composes `` `Result<${displayType(tailType)},
QueryError>` `` — that one is admitted by category 1's `Result<T, E>` clause
(`placeholder-rendering-a.md:20`), so the family is not uniformly
non-conformant.

## Why it matters

- **A DIAG-4 *Message* names a type that cannot exist.** `got index` reaches an
  author who wrote no `index` and cannot declare one: every declaration
  position refuses the name at `E` severity. The message's job is to name the
  offending type, and the name it gives has no referent.
- **Three sources produce one string.** Rows a1 (fabrication), b1 (a legal
  function name) and b2 (a legal field name) are indistinguishable in the
  output. In b2 the message is doubly wrong — the receiver *is*
  `array<string>` — and an author comparing it against a1's output has no
  signal that one names their code and the other names the parser's.
- **A refused declaration changes an unrelated construct's diagnostics.** c1
  against c2, and c3 against c4, differ by one line the parser has already
  rejected. The rejected line silently supplies a type to a `join` guard and to
  a typed `let` elsewhere in the file. The author sees two errors and no
  indication that the second is caused by the first.
- **The rendering rule is build-time closed and this violates it.**
  `placeholder-rendering-a.md:9` states the closure is "enforced at build
  time" and exists so two conformant implementations agree byte for byte. A
  renderer that emits a token no clause admits makes the conformance claim
  untestable for these inputs.
- **The exposure is bounded and should stay bounded.** Every measured row
  carries an `E`, so no theta registers and no fabricated type reaches runtime.
  A rename to an uppercase-initial name would remove that bound: d1 measures
  that `schema Index = string` is clean and resolves, so the collision would
  land in a theta that loads.
- **Nothing in the suite scores the conformance claim.** Bug 0125's witness
  pins the current strings in both directions (d7, d8, d13, d15) — it records
  the leak, deliberately, rather than testing against it. No test asserts that
  a rendered type name satisfies category 1, so a fifth fabricated name added
  tomorrow reds nothing.

## Non-goals

- **Whether the iterand gate should defer for an unresolvable receiver.** a1's
  and b1's *rejection* is
  [0126](./0126-plain-for-binds-no-loop-variable.md)'s and
  [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md)'s
  subject — those gates have no "unresolvable ⇒ skip" arm. This report claims
  what is rendered, not whether the diagnostic is owed. A fix that makes those
  gates defer removes some of these rows by removing the diagnostic; that is a
  different change with a different justification.
- **The object receiver's specified result type.** `expressions.md:10` states
  that `obj[k]`'s static result type is "the union of the receiver's declared
  field types", and row a2 shows the implementation fabricating instead. Bug
  0125 §Non-goals names that as "its own report"; it is **not filed at HEAD**.
  A render fix must not presuppose a2 stays reachable.
- **The member arm's field-name typing.** `#typeExpr`'s `case "member"`
  (`:244`) types a field access by the field's name, which is why b2's legal
  loop is refused. Bug 0038's class, bug 0125's residual 3, unfiled. Cited here
  only as a source of the rendered string.
- **Enforcing the case rule at `NamedType` *reference* positions.** Bug 0038
  §Non-goals already records that `let a: nope = 3` is silent and that
  `schema-case-mismatch`'s registered *Trigger* (`code-registry-parse.md:20`)
  names declaration positions only. Refusing lowercase references does not
  reach either face: the sentinel is minted, not spelled.
- **The three sink-routing siblings** (`type-layer-checks.ts:620`, `:958`,
  `:1050`), tripwired by group (f) of `tests/index-element-alias-unfolded.test.ts`.
  Same file family, unrelated mechanism.
- **`theta/parse/bare-object-literal` in row f1.** Correct for its input; f1 is
  cited for its second diagnostic only.

## Fix

**Not settled. This report exists to pin the disposition first**, on the model
bug 0125 §Fix (b) set when it declined to decide the sentinel's fate: it stated
three constraints and left the choice open. Five questions have to be answered,
and (e) orders the work.

**(a) Which face is being closed?** The two are separable and a fix may close
one, the other, or both — but it must say which, because the routes do not
overlap:

1. **The render** (a1, a2, b1, b2, f1) — reachable with no declaration
   anywhere and not closed by any `TypeEnv` change.
2. **The `TypeEnv` collision** (c1, c3, c5) — reachable only through a
   declaration the parser refuses at `E`, and not closed by any render change,
   because c1's `array<integer>` and c3's `string` are conformant renderings of
   the author's own declaration. c3's `got index` is the one cell where the two
   faces meet.

**(b) Four routes, with their consequences.**

1. **Rename the sentinel to something unspellable.** Choose a name outside
   `lexical.md:13`'s identifier grammar, so no declaration position can spell
   it and `collectTypeEnv` can never resolve it. This closes face 2 by
   construction — c1, c3 and c5 collapse to their controls' shape — and closes
   b1/b2's *ambiguity*, since the fabrication would no longer collide with any
   author name. It makes face 1 **worse**: the rendered token moves further from
   category 1, not closer. Two traps bug 0125 §Fix (b) named and this report
   measures: a **lowercase-initial** replacement inherits the exposure verbatim
   (the `collectTypeEnv` walk has no case test, so any lowercase name behaves
   exactly as `index` does today, and `lexical.md:16` makes every one of them a
   legal function and field name — b1, b2, b3, b4), and an **uppercase-initial**
   replacement makes the name *spellable* with no case shield at all (d1: the
   declaration is clean, resolves, and the theta registers). Both are traps.
   Only a name outside the identifier grammar avoids both.
2. **Make `displayType` refuse to render a non-conformant internal name.**
   Closes face 1 at one function on the path all twelve *Message* constructions
   share. Two sub-variants with different governance costs: rendering a
   *different existing* conformant form, or **suppressing** the diagnostic. The
   first needs a conformant form to exist for these values, and for a1/b1/b2 no
   author-written type does — the only truthful answer is "unresolvable", which
   is a token no category-1 clause admits. The second changes which inputs draw
   a code, which is a *Trigger* change under DIAG-2. `displayType` also takes no
   `TypeEnv` (`type-compat.ts:318`), so a resolvability test needs a signature
   change across all 24 call sites, or provenance on the `CompatType` `named`
   arm (`:58`, inside the union at `:55–64`) so a fabricated name is
   distinguishable from a declared one at the point of rendering. The provenance
   variant is the one that also serves route 1 and route 3.
3. **Stop `schema <lowercase>` entering the `TypeEnv`.** Add the case test at
   `collectTypeEnv` (`type-layer-checks.ts:315`) that the lexer already applies
   at `lexer.ts:842–849`. Closes face 2 for the sentinel **and** for the three
   sibling fabricated names (`query`, `object`, `unknown`) and every future
   lowercase one — this is Reading A of §Expected behaviour. Consequences to weigh: c1 and c3 lose a registered code each
   (they become c2's and c4's shape plus the case diagnostic), which is an
   observable (b) change on inputs already outside GOV-15; the test must be
   re-derived from the name's first character, because `collectTypeEnv` receives
   `statements` and not the diagnostic list; and it strengthens exactly the
   shield bug 0038's fix record described as covering "the write side" only. It
   closes none of face 1 — a1, a2, b1, b2 and f1 are unchanged.
4. **Keep the sentinel and document it.** Requires a corpus sentence admitting a
   parser-internal fabricated name into category 1's rendering rule. That edits
   `placeholder-rendering-a.md`'s closed clause list, which `:7` places under
   **GOV-7 / GOV-8** as a spec-versioned breaking change — the highest bar of
   the four. It would also have to say what an author is meant to do with the
   name, and rows b1/b2 show the answer cannot be "it is never one of yours".

**(c) Does DIAG-4 alone foreclose route 2? No — it forecloses one sub-variant
of it.** DIAG-4 (`diagnostic-shape.md:74`) makes the *Message* column normative
and defers "wording changes" to theta 2.0. The column here is
`'for' expects array<T> after 'in'; got <type>` and every other affected row is
likewise emitted template-exact today; changing what fills `<type>` edits no
byte of the column. The interpolated value is category 1's obligation
(`placeholder-rendering-a.md:13–21`), which the implementation currently
violates — so bringing the render into conformance is the implementation moving
to match a normative rule, the posture bug 0038's fix took against
`code-registry-parse.md:54`'s trigger qualifier. **What does bite, at the same
bar or higher:**

- Emitting a token no category-1 clause admits (`<unresolvable>`, `?`, the
  empty string) **mints placeholder-rendering vocabulary**, governed by the
  closure paragraph `placeholder-rendering-a.md:7` under GOV-7 / GOV-8 — the same
  spec-versioned-breaking bar DIAG-4 sets, reached by a different rule. A route
  that renders an *existing* admitted form clears it; a route that renders a
  new form does not.
- **Suppressing** the diagnostic (route 2's second sub-variant, and any
  deferral added to the three gates that lack one) changes which inputs the row
  fires on. That is DIAG-2 (`:72`): the *Trigger* edit lands in the same commit,
  with the `docs/reference/` mirror. The mirrors carry the *Message* column and
  no *Trigger* column (`docs/reference/diagnostics.md:66`, `:89`, `:100`,
  `:109`, `:110`), so a *Trigger* widening does not reach them; a code addition
  or removal does.
- Route 3 removes a code from c1 and c3 without editing any row, which is an
  implementation-conformance change rather than a registry change — but §Fix
  must state which reading of `code-registry-parse.md:54`'s "statically
  resolvable" qualifier it rests on, because that is the sentence deciding
  whether c3's present emission is in-trigger or out.

**(d) Constraints any route preserves**, each with a witness row above:

- **The else arm keeps deferring for an unresolvable receiver.**
  `type-system.md:48` is the rule; c2 and c4 are the pins (and 0125's d3/d4 pin
  the alias and cycle cases). A route that makes the sentinel resolvable — to
  anything — breaks this.
- **b5 keeps naming the real type.** A bound identifier reads its recorded
  binding type, and the message says `got integer`. No route may coarsen that.
- **d1 stays the only diagnostic it draws.** `schema Index = string` is
  conformant; a route that fences the `TypeEnv` by name must fence on the case
  rule, not on a name list, or it starts refusing legal declarations.
- **Bug 0125's four pinned rows are updated deliberately, not incidentally.**
  `tests/index-element-alias-unfolded.test.ts` d7 (`:833–857`), d8
  (`:859–883`), d13 (`:971–994`) and d15 (`:1003–1021`) assert the current
  strings in both directions; d7's comment names this residual in terms and d8's
  assertion label routes it to "the object-result-type report". A fix here reds
  them by design and must restate each row's expectation with its reason, not
  delete it. Its `msg` helper (`:168–182`) sources every expected message from
  the registry, so a route that edits a *Message* template reds by naming
  `code-registry-parse.md` — which is the intended failure mode.
- **The sibling fabrications are stated in or out.** Three names across four
  arms: `query` (`static-type-inference.ts:256`), `object` (`:258`), `unknown`
  (`:279`, `:343`). f1 measures `object`
  reaching the same *Message*; `:290`'s `Result<…, QueryError>` is already
  admitted by category 1's `Result<T, E>` clause. A route closing `index` alone
  says so.
- **GOV-15 needs no carve-out.** Every affected input emits an `E`
  (`code-registry-parse.md:20`, `:43`, `:54`, `:63`, `:64`), so none satisfies
  the loads-cleanly predicate (`source-language-stability.md:9`). Confirm by
  re-running the committed-corpus sweep rather than by assumption; no shipped
  `.theta` or `.thetalib` declares a lowercase `schema` or indexes an
  unresolvable receiver at HEAD, which is a claim a fix re-measures (and see
  [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — the
  committed-fixture gate does not walk `.thetalib`).

**(e) Ordering and coordination.**

- **0125 is fixed and is not a prerequisite**, but its witness is the
  coordination surface: four pinned rows, listed above.
- **Three open reports share the render arm.**
  [0124](./0124-parsetype-trailing-punctuation-leniency.md),
  [0126](./0126-plain-for-binds-no-loop-variable.md) and
  [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) each carry a
  distinct non-conformant `named` into `type-compat.ts:324–325`, and **none of
  the three proposes changing that arm** — each closes its own source. If this
  report's fix takes route 2 it lands on the arm all three cite, so whichever
  fix lands second rebases; if it takes route 1 or 3 the arm is untouched and
  the four are independent.
- **The unfiled object-result-type report bounds a2.** 0125 §Non-goals names it
  and it does not exist at HEAD. If it lands first, a2 stops being an index-arm
  row at all.

**Witness — offline, provider-free.** Every row of §Reproduction settles inside
one `parseDoc` call, so the harness is
`tests/index-element-alias-unfolded.test.ts` extended or mirrored, not a new
mechanism: same frontmatter, same whole-list `toEqual` on codes, same
registry-sourced `msg` oracle (`:168–182`). Required rows: (a) both; (b) all
five, b3/b4/b5 being the controls that prove the collision is with legal author
source and that the recovery path works; (c) all six, the c2/c4/c6 controls
included, plus one assertion per row that the theta does not register — the
`hasLoadParseError` mirror `tests/index-element-alias-runtime-disposition.test.ts`
establishes, since the function is module-private
(`production-composition.ts:2045`); (d1) as the uppercase-trap pin, which reds
if a rename route picks a spellable name; (e2) as the wider-class record; and
(f1), which reds if a route closes `index` and leaves `object`. One further row
is owed that no group above supplies: a **conformance assertion** over the
rendered `<type>` — that it parses as a category-1 form — so a sixth fabricated
name added later reds without anyone remembering to add a row for it. No live
tier applies: nothing on this path crosses a provider, and every observable is
determined inside one parse.

## Provenance

- **Origin:** the bug 0125 fix (0.76.0, commit `e7f73ccf`), which deferred both
  faces by name. Its §Fix (b) set the three constraints and stated the two
  rename traps; its fix record §Fix (b) states that "`got index` remains
  reachable" at d7 and d8 "with no alias involved" and that "the DIAG-4 render
  leak against `placeholder-rendering-a.md:19` read with `lexical.md:15`
  therefore **survives this fix**"; its §Non-goals routes the leak to "the
  sentinel's disposition (§Fix (b)) or … the object-receiver report". The fix
  report's residuals 1 and 2 (`.pi/tmp/fixes/0125-report.md`) are the two faces,
  and residual 4 is group (e). This report adds what those residuals do not
  state: rows b1, b2, b3, b4, b5, c5, c6, d1 and f1; the two readings of the
  `TypeEnv` entry; the DIAG-2 / DIAG-4 / GOV-7-8 reading in §Fix (c); the
  relation to bug 0038's mint class with the baseline check that the index arm
  is absent from 0038's enumeration; and the four routes with their
  consequences.
- **Evidence:** scratch vitest over `parseDoc` (`tests/helpers/e2e-s1.ts:39`)
  driving the shipped `parseThetaDocument`, at `7c8833cd`; every cell of groups
  (a)–(f) measured and quoted verbatim above; written, run, deleted. Rows a1,
  a2, c1, c2, c3, c4 additionally reproduce as the committed d7, d8, d13, d14,
  d15, d16 of `tests/index-element-alias-unfolded.test.ts`, which passes 51/51
  at HEAD.
- **Implementation, at `7c8833cd`:**
  `src/parser/static-type-inference.ts:244` (the member arm), `:245–250` (the
  mint; `:248` the unfold, `:249` the else arm), `:252` (the call arm), `:256`,
  `:258`, `:279`, `:290`, `:343` (the sibling fabrications);
  `src/parser/type-compat.ts:104–106` (`resolveNamed`), `:155–172`
  (`unfoldAlias`; `:165` the resolve, `:169` the alias return), `:313–332`
  (`displayType`; the `named` arm `:324–325`), `:403–442`
  (`checkLetRhsCompat`; the deferral `:412`, the render `:437–439`);
  `src/parser/type-layer-checks.ts:302–331` (`collectTypeEnv`; the
  null-prototype record `:303`, the ungated selects `:306` and `:315`, the
  writes `:319` and `:324`), `:1495` (`checkMethodCall`'s render);
  `src/parser/control-flow.ts:64–81` (`checkForIterand`; the unfold `:69`, the
  render `:79`); `src/runtime/stdlib-array.ts:100–124` (`checkArrayJoin`; the
  render `:120–122`); `src/lexer/lexer.ts:842–849` (the
  `schema-case-mismatch` emission); `src/extension/production-composition.ts:2045–2052`
  (`hasLoadParseError`). Baseline check: `git show
  f959f8de:src/parser/static-type-inference.ts` carries the `case "index"` arm
  at `:245` and the mint at `:249`, so the arm predates bug 0038 and is absent
  from its five-arm enumeration by choice of subject, not by not existing.
- **Spec measured against:**
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:5` (the
  byte-identical-strings purpose), `:7` (the closure paragraph and its
  GOV-7 / GOV-8 posture), `:9` (category 1's heading), `:11` (its placeholder
  list), `:13` (its rule), `:15–21` (its seven clauses; `:19` the `named`
  clause, `:20` the `Result<T, E>` clause, `:21` the inline-object clause);
  `docs/spec_topics/lexical.md:13` (the identifier grammar), `:15` (PascalCase
  for type-like bindings), `:16` (lowercase-first for functions, parameters and
  fields), `:20` (the reserved-keyword list, which omits `index`);
  `docs/spec_topics/type-system.md:48` (*Unresolvable operands*), `:52`
  (TYPE-10), `:54` (TYPE-11);
  `docs/spec_topics/expressions.md:10` (*Indexed access*, both result-type
  sentences after bug 0125's edit);
  `docs/spec_topics/diagnostics/code-registry-parse.md:20`
  (`schema-case-mismatch`), `:43` (`non-string-array-join`), `:54`
  (`let-rhs-type-mismatch` and its "statically resolvable" qualifier), `:63`
  (`unknown-method`), `:64` (`non-array-iterand`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/governance/source-language-stability.md:9`
  (GOV-15's loads-cleanly predicate). User-facing mirrors:
  `docs/reference/diagnostics.md:66`, `:89`, `:100`, `:109`, `:110` — *Message*
  column only, no *Trigger* column.
- **Tests:** `tests/index-element-alias-unfolded.test.ts` (51 rows, green at
  HEAD) — d7 `:833–857`, d8 `:859–883`, d13 `:971–994`, d14 `:996–1001`, d15
  `:1003–1021`, d16 `:1023–1028`, the `msg` registry oracle `:168–182`;
  `tests/index-element-alias-runtime-disposition.test.ts` (the private
  `hasLoadParseError` mirror);
  `tests/helpers/e2e-s1.ts:39` (`parseDoc`). No test in the tree asserts that a
  rendered type name is category-1 conformant.

## Fix (0.202.0)

**The adjudication §Fix owed.** Re-derived at the fix baseline with a scratch
`parseDoc` probe over every cell of §Reproduction: the report is neither mooted
nor owned by a fresher document. Face 1 still renders (`a1`, `a2`, `b1` report
`got index`; `f1` reports `got object`) and face 2 still collides (`c1`, `c3`,
`c5` each carry a second code the refused declaration supplies), so the subject
survives ~110 minors of landings. Four cells of the filed table are stale and
are restated below rather than silently inherited. The ownership check clears:
[0143](./0143-withheld-sentinel-author-twin-and-render-leakage.md) is open and
fresher and shares the `displayType` arm, but it says in terms that the two
reports are not duplicates — its subject is the engine's *unspellable* sentinel,
this one's is a name inside the author's namespace.

- **§Fix (a) — which face.** **Face 2 only**, the `TypeEnv` collision (`c1`,
  `c3`, `c5`), on §Expected behaviour's **Reading A**: a declaration the case
  rule refuses (`theta/parse/schema-case-mismatch`, `E`,
  `code-registry-parse.md:20`) declares no type, so it must not make any operand
  statically resolvable and must not decide any static check. **Face 1 (the
  render) is declined**, not deferred by silence: `a1`, `a2`, `b1` and `f1` still
  render a name category 1 does not admit (`placeholder-rendering-a.md:25` read
  with `lexical.md:15`), and that disposition belongs to 0143, which owns the
  arm's contract for engine-minted names and whose §Fix is itself unsettled.
  Closing face 1 here would either mint a rendering no clause admits
  (GOV-7 / GOV-8) or suppress a diagnostic (DIAG-2 *Trigger*), and would
  pre-empt a fresher open report on its own subject.
- **§Fix (b) — route, and the seam the measurement moved.** **Route 3's
  principle**, applied at the **read** seam `resolveNamed`
  (`src/parser/type-compat.ts:124–130`) rather than at the write seam
  `collectTypeEnv` (`src/parser/type-layer-checks.ts:374–402`) the report names.
  The write seam is excluded by measurement, not by preference: a case fence in
  `collectTypeEnv` reds bug 0038's protected witness cell g2
  (`tests/typeenv-prototype-names.test.ts` — a `schema __proto__` declaration
  must land as an **own key** of the null-prototyped record), a flip no document
  authorizes; the full default suite showed 3 reds under the write-seam
  prototype against 2 under the read-seam one, the two being exactly the rows
  this report authorizes. The read seam is sufficient because it is the only
  `TypeEnv` read in the tree — every `named`-type consumer routes through it,
  which is the discipline bug 0038's fix established. **Route 1 (rename the
  sentinel) is declined**: it would mint a second `<withheld>`-class unspellable
  name, a fresh instance of 0143's open subject, and the report itself records
  that it makes face 1 worse. **Route 4 is declined**: GOV-7 / GOV-8, and the
  "enforced at build time" clause this report leans on was **struck** by bug
  0189 (0.129.0) — see the staleness list below.
- **§Fix (c) — the DIAG-2 / DIAG-4 reading.** No registry row moves, no
  *Message* template byte moves, no `docs/reference/diagnostics.md` mirror byte
  moves, so neither DIAG-2's same-commit discipline (`diagnostic-shape.md:72`)
  nor DIAG-4 (`:74`) is engaged. The two codes stop firing on group (c) because
  their **existing** *Trigger* text stops covering those inputs once the refused
  declaration resolves to nothing: `let-rhs-type-mismatch`'s "where the RHS type
  is statically resolvable" (`code-registry-parse.md:59`) and
  `non-string-array-join`'s "invoked on an array whose element type is not
  `string`" (`:46`) — the implementation moving to a normative rule, the posture
  bug 0038 took. `type-system.md:48`'s unresolvable-operand deferral is the
  disposition group (c) now exhibits, which is what `c2` and `c4` measure.
- **§Fix (d) — the constraints, each re-measured green.** The else arm keeps
  deferring for an unresolvable receiver (`c2`, `c4`; 0125's `d3`/`d4`
  untouched); `b5` still names the real type (`got integer`); `d1` still draws
  exactly one diagnostic, because the fence keys on the **case rule** (first
  character) and not on a name list, so `schema Index = string` still resolves
  and still decides; 0125's four pinned rows are updated **deliberately** —
  `d13` and `d15` restated with their reason in comment and assertion label,
  `d7`, `d8`, `d14` and `d16` byte-untouched because they are face-1 rows and
  face-1 controls; the **sibling fabrications are stated**: `query`, `object`
  and `unknown` are **in** for face 2 (all are lowercase-initial, so none can
  ever resolve through the fence) and **out** for face 1 (`f1` still reports
  `got object`, by design); GOV-15 needs no carve-out and the corpus claim is
  discharged by `tests/committed-fixture-parse-gate.test.ts` (36 cells, green),
  not by assumption.
- **What shipped:**
  - `src/parser/type-compat.ts` — `resolveNamed` answers `undefined` for any
    name whose first character is not `A`–`Z`, before the own-key lookup; the
    predicate is re-derived from the first character exactly as the lexer's
    type-position test does (`src/lexer/lexer.ts:833`, emission `:842–849`). Its
    doc comment records why the fence belongs at the read seam and why the write
    seam is excluded.
  - `tests/index-sentinel-typeenv-case-fence.test.ts` — new, 19 cells: the
    group (c) closure with its `c2`/`c4`/`c6` controls, a non-registration
    assertion per declaring row (the module-private `hasLoadParseError` mirror,
    `src/extension/production-composition.ts:2220`), the `d1` anti-overreach
    pin, the `b2`–`b5` legality and recovery controls, `e2`, the face-1 pins
    `a1`/`a2`/`b1`/`f1` each naming 0143 as the arm's owner, and the
    **conformance oracle** the report asks for — scoped to face 2, scoring every
    category-1 placeholder fill in group (c) against
    `placeholder-rendering-a.md:21–27`'s clause list, so a future change that
    re-resolves a lowercase declaration reds on the rendered value and not only
    on the code list.
  - `tests/index-element-alias-unfolded.test.ts` — `d13` and `d15` restated
    (+5 lines); `d7`, `d8`, `d14`, `d16` untouched.
  - `tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts` — new H8a
    cell: the lowercase-declaration document does not register and its note
    evidence carries the casing code and **not** `let-rhs-type-mismatch`, beside
    a clean control that registers and drives one real turn to a pinned
    sentinel.
- **Gates:** witness RED before / GREEN after with the fence's four lines
  removed and restored byte-exact (`git hash-object` equal before and after,
  `edcc07d3…`); full default suite 389 files / 8056 tests passed; `npm run
  typecheck` clean; `npm run lint` clean; live cell 1/1 passed under the shared
  live lock (~2.8 s, real turn), and RED at the baseline for the right reason.
- **Review:** 3 rounds — round 1 (deep): three findings, none correctness
  (self-inflicted stale `type-compat.ts` citations, the doc comment missing the
  measured read-seam reason, and this record itself); round 2 (light fixer):
  both code-adjacent findings fixed, comment and citation text only; round 3
  (fast, confirmation): clean.
- **Verification:** SOLID on all four obligations, each with quoted output —
  witness both directions, full suite, a real live run under the lock, lint and
  typecheck.
- **Residuals:**
  1. **Face 1 stays open**, by decision: `a1`, `a2`, `b1` render `got index` and
     `f1` renders `got object`. Routed to 0143, which owns the `displayType`
     arm's disposition; the face-1 pins in the new witness assert the current
     strings so a render fix reds them deliberately.
  2. **The report's own §Witness conformance row is only half-supplied.** The
     oracle ranges over group (c), where after the fence no category-1
     placeholder fill remains; extending it over the face-1 rows would assert a
     contract no open fix delivers. Its zero-fill companion assertion is the
     anti-vacuity guard and must be revisited deliberately by whichever fix
     makes group (c) render again.
  3. **Citation churn.** The `resolveNamed` doc comment adds 24 lines, shifting
     every symbol below line 104 of `src/parser/type-compat.ts` by that amount.
     454 line-form citations into that file exist across `docs/bugs/**`,
     `tests/**` and `src/**`, most already stale from earlier landings; only the
     citations this change itself invalidated were repaired, in the four files it
     touches. `resolveNamed` is now `:124–130`, `unfoldAlias` `:179–196`,
     `displayType` `:368–382` with the `named` arm at `:374–375`.
  4. **Four cells of §Reproduction are stale at this baseline** and are corrected
     here rather than in the tables: `b2`
     (`schema P { index: array<string> }` + `for y in p.index`) now reports
     `[]` — bug 0136 (0.106.0) moved the member arm onto the field's declared
     type, so the report's "a legal field name renders the same string" claim no
     longer holds; `e1` now also reports `theta/parse/type-as-value`; `e2`
     reports `[let-rhs-type-mismatch, type-as-value]` in that order; `e3` now
     reports `[]`.
  5. **Corpus citations in the report body are stale by line**, re-derived here:
     the mint is `src/parser/static-type-inference.ts:294`; `collectTypeEnv` is
     `src/parser/type-layer-checks.ts:374–402`; `checkMethodCall`'s render is
     `:3279`; `hasLoadParseError` is
     `src/extension/production-composition.ts:2220`;
     `placeholder-rendering-a.md`'s category-1 heading is `:15`, its *Rule*
     `:19`, its clause list `:21–27` with the `named` clause at `:25`;
     `type-system.md:54` is TYPE-10 and `:56` is TYPE-11 (the report inverts
     them); `code-registry-parse.md` rows are `:20`, `:46`, `:59`, `:70`, `:71`;
     the mirrors are `docs/reference/diagnostics.md:66`, `:92`, `:105`. The
     report's "the closure is enforced at build time" reading is **falsified**:
     bug 0189 (0.129.0) struck that claim and replaced it with the same-commit
     discipline enforced by review.
  6. **A nested reviewer ran the live cell once without holding the shared
     lock.** Reported by the agent itself; the run passed and spent one small
     turn's tokens. No sibling run was observed to collide. Recorded because the
     lock protocol was breached, not because the result is in doubt.
- **Discharge notes appended:** none. 0143's own record is untouched; this
  record names it as face 1's owner.
- **Pinned dispositions / non-goals:** every §Non-goals item stands — 0127's
  deferral question, the object receiver's specified result type, the member
  arm's field-name typing (now moot at `b2` after 0136), case enforcement at
  `NamedType` *reference* positions, the three sink-routing siblings, and
  `bare-object-literal` in `f1`. The `displayType` arm is byte-untouched, so
  0124, 0126, 0130 and 0143 are unaffected by this landing.

## Discharge note — residual 2 (appended by bug 0247)

Residual 2 above ("The report's own §Witness conformance row is only half-supplied")
is **discharged by 0247's fix (0.227.0):** the corpus now carries the clause the
residual was waiting for. `docs/spec_topics/diagnostics/placeholder-rendering-a.md`
category 1 gained an eighth clause under its *Rule* plus a closed
`**Undetermined-static-type tokens (closed).**` table (`<withheld>`, `index`,
`object`, `query`, `unknown`) admitting a rendering for a static type the parse
layer did not determine. The conformance oracle in
`tests/index-sentinel-typeenv-case-fence.test.ts` was therefore extended: its
scorer moved to the shared `tests/helpers/category1-clause-oracle.ts`, whose
`readAdmittedStandInTokens()` reads the closed table off the spec page, and a new
cell scores the face-1 rows `a1`, `a2`, `b1` and `f1` against the enlarged clause
list (offenders empty, anti-vacuity count 4 — three `got index` fills and one
`got object`).

Residual 1's face-1 rows keep their strings byte-exact; nothing was suppressed
and no spelling moved. The pre-existing group-(c) oracle cell is unchanged and
still scored with an EMPTY admitted set, so its fence is exactly as sharp as it
was and its zero-fill anti-vacuity companion assertion (`scored` `toBe(0)`) is
byte-unmoved — the "revisited deliberately" the residual asked for is this
paragraph, and the answer is that group (c) still renders no category-1 fill.
Their SCOPE comment, which claimed that extending the oracle over the face-1 rows
"would assert a contract no open fix is delivering", is restated: 0247 delivers
that contract.

Ratification surface for that restatement: the file-header face-1 paragraph, the
face-1 section banner, the face-1 `describe`'s SCOPE comment, the four
assertion-MESSAGE strings of `a1`/`a2`/`b1`/`f1`, the `b1` and `f1` `it()`-body
comments, and the group-(c) oracle cell's SCOPE comment. No `.toBe(…)` /
`.toEqual(…)` argument and no fixture source changed. `src/**` is byte-untouched
by 0247, so this record's own fix is unaffected. Full details, gates and
residuals: `docs/bugs/0247-untypeable-static-type-has-no-category-1-rendering-clause.md`
§Fix (0.227.0).
