# Bug 0033 — The `schema X = A | B` type-alias / union declaration does not parse: the head registers as a field-less schema, the shape is re-lexed as statements (`stray '='` / `stray '|'`), and the whole discriminated-union checker seam — plus `skipDeclarationShape` — has no caller

- **Status:** fixed (0.45.0). §Fix as settled — the two missing `SchemaShape`
  alternatives parse, the three V5b checkers are wired end-to-end, the
  alias/union RHS lowers concretely, and the mis-shaped heads gained their
  dispositions. See §Fix (0.45.0) below.
- **Kind:** defect — the implementation disagrees with the specification (the
  first bug category of [docs/bugs/README.md](./README.md)), in two elements.
  (1) *A specified declaration form is absent.* `schema X = ...` and
  `schema X by f = A | B` are normative theta 1.0 declaration shapes
  (`grammar.md:170–177`, `schemas.md:50–60`, `schemas.md:95–117`), carry a
  lowering rule (`schema-subset.md:82`), two subtyping rules
  (`type-system.md:38` TYPE-4, `:54` TYPE-11) and seven registry codes
  (`code-registry-parse.md:55`, `:93–98`). The parser accepts neither shape:
  `parseSchema` (`theta-document.ts:2039–2052`) consumes only the `schema`
  keyword and the name, and any declaration whose next token is not `{` yields
  a field-less `SchemaDecl` with the shape left unconsumed. The `SchemaDecl`
  AST node (`theta-document.ts:527–537`) has no right-hand-side field, so the
  form is not representable. (2) *The rejection is mis-shaped and misattributed.*
  The unconsumed shape is re-entered by the statement loop, so the author is
  told `unsupported syntactic feature: stray '=' in statement position` and
  `stray '|' …` — `theta/parse/unsupported-feature`, whose registry trigger
  reads "A theta 1.0-deferred or non-Theta syntactic construct"
  (`code-registry-parse.md:27`) — for a construct the spec defines. On the
  `by` form the residue parses as a *reassignment statement*, so the load can
  fail with `theta/parse/immutable-rebinding` naming an unrelated `let`
  binding, and `schema X by f { ... }` loads with zero diagnostics where
  `theta/parse/by-on-object-schema` is prescribed. Dead code accompanies both
  elements: `skipDeclarationShape` (`theta-document.ts:2268–2282`), the
  function the parser's own comments name as the consumer of the `= …` /
  `by … = …` tail, has no caller; `skipBraces` (`:2284–2297`) is reachable
  only from it; and the three exported V5b checkers that own the seven codes
  have no caller in `src/`.
- **Affected** (citations verified at HEAD `4d645f4f`, 0.32.0):
  - `src/parser/theta-document.ts:2039–2052` — `parseSchema`. It advances past
    `schema` and the name, calls `parseSchemaObjectBody` (`:2046`), and on a
    `null` result returns `{ kind: "schema", name, range }` (`:2048–2049`)
    having consumed nothing further. The comment at `:2042–2045` states that
    the `= …` alias and `by … = …` forms "carry no leading `{`, so they capture
    no field list and fall through to `skipDeclarationShape`" — they fall
    through to the statement loop instead.
  - `src/parser/theta-document.ts:2063–2145` — `parseSchemaObjectBody`. Returns
    `null` and consumes nothing when the next token is not `{`
    (`:2064–2066`); its doc comment (`:2054–2062`) repeats the stale claim at
    `:2057–2058` ("leaving `skipDeclarationShape` to consume it").
  - `src/parser/theta-document.ts:2268–2282` — `skipDeclarationShape`. No
    caller: outside `docs/bugs/`, `rg skipDeclarationShape` over `src`, `tests`
    and `docs` returns the declaration plus the two comment references at
    `:2045` and `:2058`, nothing else.
    `src/parser/theta-document.ts:2284–2297` — `skipBraces`, whose one call
    site is `:2273` inside `skipDeclarationShape`; both functions are
    unreachable.
  - `src/parser/theta-document.ts:527–537` — `SchemaDecl` carries `name` and an
    optional object-form `fields` list only. The doc comment at `:531–535`
    records the alias and `by` forms as the reason `fields` is optional; there
    is no field for the right-hand side, so no downstream pass can see it.
  - `src/parser/theta-document.ts:1510–1521` — the statement loop's
    no-progress arm. A punctuation token that starts no statement or expression
    form is reported as `theta/parse/unsupported-feature` (`:1515`) with the
    message `unsupported syntactic feature: stray '<t>' in statement position`
    (`:1518`) and then dropped. This is the arm every `=` and `|` of a
    declaration shape lands in.
  - `src/parser/theta-document.ts:1591–1592` — the top-level dispatch that
    routes the `schema` keyword to `parseSchema`; the residue re-enters the
    same loop at the next iteration and is parsed as ordinary statements
    (variant names become expression statements; `by f = A` becomes a
    reassignment).
  - `src/parser/schema-declarations.ts:317–336` — the V5b seam header, which
    enumerates the seven codes it owns. Its three exported entry points —
    `checkDiscriminatedUnion` (`:375`), `checkByClause` (`:629`),
    `detectTypeAliasCycles` (`:667`) — are imported by no file under `src/`.
    The only importer in the tree is
    `tests/disc-unions-recursion.test.ts:2–6`.
  - `src/parser/theta-document.ts:1101–1112` — `collectBodyTypes` lowers "a
    schema without an object body (alias / discriminated union)" to `{}`
    (comment `:1101–1106`, fill `:1108–1112`). The arm executes, but never for
    its stated subject: no alias declaration reaches it. It fires today only
    for a body-less `schema X` head or a brace body whose first token is not
    an `ident: Type` field.
  - `tests/disc-unions-recursion.test.ts` — seven tests, one per code, all
    driven through the standalone seams. Its header (`:18–22`) records the
    reason: the checks "need the resolved declaration graph … the tokeniser
    does not carry". This is the only file under `tests/` in which any of the
    seven codes appears. Nothing in `npm test` reconciles the registry against
    what the parser can emit: the code-parity arm
    (`registry-code-no-asserting-test`, `tools/closing-gate/index.js:702–711`)
    matches on code-string presence in the test corpus, and it is excluded from
    the live-corpus canary — `CANARY_GAP_KINDS`
    (`tools/closing-gate/live-corpus.js:51–59`) does not list it, and
    `tests/code-registry.test.ts:109–111` drives the reconciler with synthetic
    inputs.
  - `tests/committed-fixture-parse-gate.test.ts:49–63` — the gate that walks
    every committed `.theta` and requires zero diagnostics. No committed
    fixture and no file under `docs/examples/` uses the alias form
    (`rg 'schema [A-Z]\w* *=' --glob '*.theta' --glob '*.thetalib'` is empty),
    so the gate never witnesses the gap.
- **Observed at:** `0.32.0` (`4d645f4f`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving `parseThetaDocument` with the
  production-shaped deps over eighteen fixtures, then deleted.

## Fix (0.45.0)

The settled §Fix, implemented as written; five review rounds and four fixer
rounds hardened the capture and the type layer. Line anchors are at the fix
commit.

**AST + parse.** `SchemaDecl` is three-way: `fields` (object form), `arms`
(alias/union — one `Type` source per top-level `|` arm) plus optional `by`.
`parseSchema` dispatches on the token after the name (`{` / `=` / `by` /
headless); `skipDeclarationShape` and `skipBraces` are live as the recovery
consumers the parser's comments always named. The alias-RHS capture is
bounded so the swallowed continuation newline after a trailing `>` / `=`
cannot absorb the next statement: field-boundary mode plus arm-boundary
stops for statement-head keywords (incl. `match`/`invoke`/`Ok`/`Err`) and
for depth-0 punct no `Type` can start or continue (`@`, backtick, `(`, `[`,
`!`; `-` at completed-arm boundaries only), with inline-object arms consumed
as balanced brace groups. No token of a declaration shape survives into the
statement loop; the one recorded residual is same-line resolvable residue
(`schema X = Cat Cat`), which reduces to the language's silent no-op
expression-statement class and is pinned as observed — the pin later
discharged by [0042](./0042-schema-decl-same-line-residue-silent.md)'s fix
(0.52.0), which reports the DECLARATION while leaving the severed statement's
silence exactly where this fix put it (*Residuals* (i) below).

**Dispositions** (§Fix delegated; decided here, registry-honest): a headless
`schema X`, a brace body that is not an `ident: Type` field list, a
shapeless `=` RHS, and a malformed `by` head all draw the registered
`theta/parse/empty-schema-body`; `schema X by f { … }` reaches
`checkByClause` and draws `theta/parse/by-on-object-schema`, as does a `by`
over a right-hand side of fewer than two arms (grammar.md `UnionRhs`
requires ≥2).

**Checker wiring.** `checkSchemaDeclarationGraph` (beside the existing
structural checks) runs `checkByClause`, `checkDiscriminatedUnion` (unions
whose arms all resolve to declared object schemas; explicit `by` resolves
the THETA-SIDE field name per schemas.md:47, wire renames respected on the
value constraint; a literal-union field type is no discriminator candidate),
and `detectTypeAliasCycles` once over the whole-file graph (object decls
thread their field-type references so object-hop cycles stay legal; each
cycle's diagnostic anchors at a participating declaration via the seam's new
optional `nodeSites`). Each alias arm also runs the same per-type-source
pass the object-field position runs (`checkInlineEnumForm` +
`parseTypeExpression("schema-feeding")`), so `enum[…]`, arity, `void`,
`Result` and unresolved names report byte-identically across positions. All
seven registry codes now fire end-to-end from source.

**Lowering + type layer.** `buildBodyTypeSchemas` seeds alias/union decls in
pass 1 and lowers the RHS through the shared `lowerTypeSource` in pass 2
(SUBS-1: all-primitive `{"type":[…]}`, discriminated object unions
`{"anyOf":[…]}` in source arm order, string-literal unions behaviourally
AJV-pinned); alias names at `@<T>` and on the `params:` RHS resolve to
`$ref`s. `collectTypeEnv` registers alias decls as transparent `alias`
entries (TYPE-11; TYPE-4 falls out of unfold + union widening), and
OMITS cycle participants (review round 4: a nominal entry manufactured
spec-forbidden rejections of legal recursion like
`schema X = integer | array<X>`; an omitted name answers "unknown" and
defers to the AJV net; the DFS removes every cycle's back-edge endpoints, so
the residual alias subgraph is acyclic and the engine terminates — the
pre-guard tree crashed the worker process or threw `RangeError` out of the
parse on cycle-typed uses).

**Registry (three Trigger-only widenings, same commit; Messages untouched).**
`empty-schema-body` covers the no-usable-content shapes;
`unresolved-named-type` adds the alias-RHS position (fifth of the row's
positions); `by-on-object-schema` states the arm-count cut. No new code; the
seven checker rows were already registered; H9a's permitted-code list
untouched. GOV-15: the newly-rejecting inputs were either outside the
loads-cleanly set (the stray-token family) or ride the diagnostic-registry
carve-out (`by`-on-object, the mis-shaped heads).

**Reproduction re-derived at the fix baseline** (`b1caedf8`, 0.44.0): all
rows byte-identical to the recorded 0.32.0 evidence except one drift —
`schema X by f { a: string }` no longer loaded clean but failed with
0025's `unresolved named type 'f'` against the residue's re-parse (the
recorded zero-diagnostics claim was stale; the misattribution class was
unchanged). Post-fix it draws `by-on-object-schema`.

**0025/0028 coordination discharged.** The alias/union-named constructor now
draws 0025's `unresolved-named-type` rejection as the sole diagnostic (the
pre-authorized re-run updated `tests/ctor-unresolved-schema-name.test.ts`'s
RED-alias cell); the alias annotation joined 0028's resolvable set instead
of its permissive-`{}` set.

**Offline lock.** `tests/schema-alias-union-decl.test.ts` (77 tests):
parse/no-residue cells for every §Reproduction fixture incl. the
`.thetalib` spelling, the seven codes end-to-end with registry-sourced
messages, lowering byte-pins + real-AJV round-trips (incl. legal recursion
`array<X>`), TYPE-11/TYPE-4 pins, disposition cells, interaction pins
(constructor, `@<T>`, `params:`, `Ghost` alias RHS), stop-set cells with
both arrangements of the continuation-swallow, cycle-crash regression cells
(n12–n15), and pinned residuals (same-line residue, dangling `|`,
spec-undecided `by` over a primitive union and unknown explicit `by`
field). Verified in three neutralisation directions (dispatch → 73 reds
with the stray-token signatures; checker wiring → 24 code-absence reds;
cycle guard → worker death + `RangeError`), each restored byte-exact by
blob hash. Full gate 236 files / 2970 tests; typecheck and lint clean.
Live: H8a 7/7 twice, H9a acceptance 11/11, plus a scratch H9a alias-fixture
probe green with the fix and red with it neutralised, then deleted.

**Residuals.** (i) Same-line resolvable residue after a complete
declaration loads silently (n11/n24's family, incl. `schema X = -<number>`
yielding a junk `"-"` arm) — pinned as observed; a later loud disposition
needs the GOV-15 carve-out. Filed as
[0042](./0042-schema-decl-same-line-residue-silent.md) and discharged by its
fix (0.52.0): the arrangement now draws the registered
`theta/parse/malformed-alias-rhs` under that carve-out, taking the empty arm
position (`schema X = Cat |`) with it; cells n11, n24 and n29 were rewritten
in place under that report's §Fix constraint 4, and the residue statement's own
silence is unchanged. (ii) A union arm shape the shared lowerer does
not support (e.g. a generic arm) keeps the pre-existing permissive `{}` —
field-position parity, unchanged. Filed as
[0043](./0043-union-nonprimitive-arm-lowers-permissive.md) and discharged by
its fix (0.53.0), which corrects the record in three ways: the shared
lowerer *does* support `array<T>` (`schema M = array<integer> | integer`
already lowered the spec-correct `anyOf`); the `{}` was not confined to one
arm but replaced the whole union, discarding the primitive arms too; and one
family of these inputs (an `array`-headed union, e.g. `array<string> |
array<integer>`) lowered not `{}` but a concrete wrong `array` type.
`lowerTypeExpr` (`src/parser/params.ts`) now splits a union before testing
for a generic application, so an `array<T>` arm — anywhere in the union, not
only alone — lowers per SUBS-1 like every other arm. (iii)
`theta/parse/unknown-identifier`'s
double-emission with `unresolved-named-type` for keyword-shaped names
(`void`) exists at BOTH the alias and field positions — pre-existing,
unfiled. (iv) The inline `{}` empty-object rule of grammar.md:109
(`empty-schema-body`) is unimplemented at every `Type` position —
pre-existing, unfiled. (v) The `by` field naming no variant's field, and
`by` over a non-object ≥2-arm union, load silently — spec-undecided,
pinned as observed.

## Summary

`schema X = ...` is one of the two declaration shapes on
[Schema Declarations](../spec_topics/schemas.md) and one of the three
alternatives of `SchemaShape` in the grammar appendix. The parser implements
only the object form. For every other shape, `parseSchema` emits a field-less
`SchemaDecl` for the head and returns with the shape still in the token
stream; the statement loop then consumes the shape as source text.

Four consequences:

1. **The form does not load.** `schema Animal = Cat | Dog` produces two
   `theta/parse/unsupported-feature` errors — `stray '='` and `stray '|'` —
   naming punctuation, not the declaration. Nothing in the diagnostic says the
   alias form is unimplemented; its registry trigger says the opposite (a
   "theta 1.0-deferred or non-Theta syntactic construct").
2. **The `by` form's diagnostic names an unrelated binding.**
   `schema Animal by species = Cat | Dog` re-parses `species = Cat` as a
   reassignment, so the load fails on
   `theta/parse/immutable-rebinding: cannot reassign immutable binding
   'species'` when a `let species` is in scope — a diagnostic about a binding
   the author never referenced. `schema X by f { a: string }`, which
   `grammar.md:179` prescribes as `theta/parse/by-on-object-schema`, loads with
   zero diagnostics.
3. **Seven registry codes are unreachable from source.**
   `by-on-object-schema`, `non-string-discriminator`,
   `ambiguous-discriminator`, `missing-discriminator`,
   `duplicate-discriminator-value`, `nested-discriminator` and
   `type-alias-cycle` are constructed only inside
   `src/parser/schema-declarations.ts`, whose three exported checkers nothing
   under `src/` calls. Each is asserted in exactly one test file, against the
   seam rather than through a parse.
4. **Dead code marks the abandoned wiring.** `skipDeclarationShape` exists to
   consume exactly the `= …` / `by … = …` tail, is named by two parser comments
   as doing so, and is called by nothing; `skipBraces` is reachable only
   through it.

The spec-side reach is wider than the declaration page. `TYPE-11`
(`type-system.md:54`) defines alias transparency in `⊑` and is exercised by no
input; `TYPE-4` (`:38`) defines variant-to-union subtyping for
`schema U = A | B` and is likewise unexercised; `schema-subset.md:82` pins the
`anyOf` lowering of a discriminated object union, and `schema-subset.md:12`
lists discriminated unions as part of the supported subset. The user-facing
reference repeats all three (`docs/reference/schema-subset.md:56–59`,
`docs/reference/grammar.md:273–281`, `docs/reference/type-system.md:76–80`).

## Reproduction

Offline, at `4d645f4f`. Scratch vitest (written, run, deleted): real
`parseThetaDocument` over a `mode: prompt` document, reading
`doc.diagnostics` and `doc.body.statements`. Each fixture below is the whole
body after the frontmatter fence.

Discriminated object union:

```theta
schema Cat { kind: "cat", name: string }
schema Dog { kind: "dog", name: string }
schema Animal = Cat | Dog
let a = 1
a
```

```
stmts: ["schema(Cat) fields=yes","schema(Dog) fields=yes",
        "schema(Animal) fields=undefined","expr","expr","let(a)"]
diags: ["error theta/parse/unsupported-feature: unsupported syntactic feature: stray '=' in statement position",
        "error theta/parse/unsupported-feature: unsupported syntactic feature: stray '|' in statement position"]
```

`Cat` and `Dog` become two expression statements; `Animal` is registered as a
field-less schema. The same two codes fire for `schema StringOrNumber = string
| number` and, three times for `|`, for `schema Severity = "low" | "medium" |
"high"`. A single-type alias (`schema Name = string`) fires `stray '='` alone.

Explicit-discriminator form, with a `let` in scope:

```theta
schema Cat { kind: "cat", name: string }
let species = "x"
schema Animal by species = Cat
species
```

```
stmts: ["schema(Cat) fields=yes","let(species)","schema(Animal) fields=undefined","reassign"]
diags: ["error theta/parse/immutable-rebinding: cannot reassign immutable binding 'species'"]
```

`by species = Cat` is parsed as a reassignment of the `let`. The multi-variant
form `schema Animal by species = Cat | Dog` fires `stray '|'` only — one
diagnostic for a whole unparsed declaration.

`by` on an object body, which `grammar.md:179` prescribes as
`theta/parse/by-on-object-schema`:

```theta
schema X by f { a: string }
let a = 1
a
```

```
stmts: ["schema(X) fields=undefined","expr","let(a)"]
diags: []
```

Alias cycle, which `schemas.md:143` prescribes as
`theta/parse/type-alias-cycle`:

```theta
schema X = Y
schema Y = X
let a = 1
a
```

```
diags: ["error theta/parse/unsupported-feature: ... stray '=' in statement position",
        "error theta/parse/unsupported-feature: ... stray '=' in statement position"]
```

Controls. Union arms in *type* position parse clean — `schema S { a: string |
null, b: "x" | "y" }` yields `diags: []`, so the `|` failure is specific to the
declaration shape, not to unions. An object-form declaration
(`schema Cat { kind: "cat", name: string }`) yields `diags: []`.

Reach into the other positions. An alias name at the `@<T>` annotation root
(`let r = @<Severity>` with `schema Severity = "low" | "high"` in the body) and
an alias name on the `params:` right-hand side (frontmatter `params:` with
`s: Severity`) both fail the load on the same two codes, so no downstream
position can be probed against an alias declaration. A constructor naming an
alias (`Animal { kind: "cat", name: "n" }` under `schema Animal = Cat`) is
unreachable for the same reason. In a `.thetalib` file the residue additionally
draws two `theta/parse/thetalib-top-level-statement` errors, because the
variant names are top-level statements there.

Dead-code check:

```
$ rg -n 'skipDeclarationShape' src tests docs --glob '!docs/bugs/**'
src\parser\theta-document.ts:2045:    // `{`, so they capture no field list and fall through to `skipDeclarationShape`.
src\parser\theta-document.ts:2058:   * `skipDeclarationShape` to consume it. A field name is an `ident` / `keyword`
src\parser\theta-document.ts:2269:  private skipDeclarationShape(): void {

$ rg -n 'checkDiscriminatedUnion|checkByClause|detectTypeAliasCycles' src
src\parser\schema-declarations.ts:375:export function checkDiscriminatedUnion(
src\parser\schema-declarations.ts:629:export function checkByClause(
src\parser\schema-declarations.ts:667:export function detectTypeAliasCycles(
```

## Expected behaviour (what the spec says)

- [Grammar Appendix — `schema X by <field>`](../spec_topics/grammar.md#schema-x-by-field)
  (`:170–177`) gives `SchemaShape` three alternatives — the object form, `"="
  AliasRhs`, and `"by" Ident "=" UnionRhs` — with `AliasRhs ::= Type ("|"
  Type)*` and `UnionRhs ::= Type ("|" Type)+`. All three are theta 1.0
  productions; none is marked deferred.
- [Schema Declarations — Type-alias / union schema](../spec_topics/schemas.md#type-alias--union-schema)
  (`:50–60`): "`schema X = ...` … The `=` form is a top-level type alias. It
  composes with every shape from the type grammar: literal unions, primitive
  unions, object unions (discriminated; see below), and references to other
  named types," with three worked examples at `:55–57`.
  [§Discriminated unions](../spec_topics/schemas.md#discriminated-unions)
  (`:95–117`) specifies implicit discriminator detection, the explicit
  `schema Animal by species = Cat | Dog | Lizard` form (`:110`), and the five
  rejection codes. `:113` pins `theta/parse/by-on-object-schema` for
  `schema X by f { ... }`. `:143` pins `theta/parse/type-alias-cycle` for a
  pure-alias cycle. `:89` directs authors to the form: "For richer variants use
  the `schema X = A | B` form with object schemas."
- [Schema Subset](../spec_topics/schema-subset.md) `:12` lists discriminated
  unions in the supported subset and names the surface syntax; `:82` pins the
  lowering: "Discriminated object union (`schema X = A | B`): `{ "anyOf":
  [<A-lowered>, <B-lowered>] }`".
- [Type System](../spec_topics/type-system.md) `:38`
  ([TYPE-4](../spec_topics/type-system.md#type-4)) — "for any discriminated
  union `schema U = A | B | ...`, every variant satisfies `A ⊑ U`"; `:54`
  ([TYPE-11](../spec_topics/type-system.md#type-11)) — alias-schema
  transparency, "identified solely by the `schema X = R` `=` form"; `:19`
  lists `schema X = ...` among the declaration forms the page governs.
- [code-registry-parse.md](../spec_topics/diagnostics/code-registry-parse.md):
  `theta/parse/by-on-object-schema` (E, `:55`),
  `theta/parse/ambiguous-discriminator` (E, `:93`),
  `theta/parse/missing-discriminator` (E, `:94`),
  `theta/parse/duplicate-discriminator-value` (E, `:95`),
  `theta/parse/nested-discriminator` (E, `:96`),
  `theta/parse/non-string-discriminator` (E, `:97`),
  `theta/parse/type-alias-cycle` (E, `:98`). Under
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) the registry
  is the closed authority for what the implementation emits; each of these rows
  describes a trigger no source input can reach.
- `theta/parse/unsupported-feature` (`:27`) triggers on "A theta 1.0-deferred or
  non-Theta syntactic construct (arrow function, spread, optional chaining,
  `===`, bitwise op, comma op, nested template, etc.)". A declaration form the
  spec defines in three places is neither.

Expected concretely: `schema X = A | B` and `schema X by f = A | B` parse into
a declaration carrying the right-hand side; the discriminator, `by`-clause and
alias-cycle checks run over the resolved declaration graph and emit their seven
codes; `schema X by f { ... }` is rejected as `theta/parse/by-on-object-schema`;
and no `stray '='` / `stray '|'` diagnostic is produced for a well-formed
declaration.

## Actual behaviour / root cause

`parseSchema` (`theta-document.ts:2039–2052`) has one shape parser, and it is
object-only. `parseSchemaObjectBody` (`:2063–2145`) returns `null` without
consuming a token whenever the next token is not `{`, and `parseSchema` treats
`null` as "field-less declaration" and returns (`:2048–2049`). The tokens of
the shape — `=`, the variant names, the `|` separators, or `by f = …` — are
still ahead of the cursor, so the whole-file statement loop reads them as
statements: identifiers and literals become expression statements, `ident =
expr` becomes a reassignment (`:1591–1592` dispatch, then `tryParseReassign`),
and each remaining punctuation token hits the no-progress arm at `:1510–1521`
and is reported as `theta/parse/unsupported-feature: stray '<t>' in statement
position`.

The shape is therefore not merely unparsed — it is *reinterpreted*, and the
diagnostics an author sees are produced by whatever the residue happens to
resemble. This is why the `by` form yields `immutable-rebinding` against an
unrelated binding, and why `schema X by f { a: string }` is silent: `by f` is
an expression statement and `{ a: string }` is consumed with it, leaving
nothing that fails.

Two seams were built for the missing production and never connected:

1. `skipDeclarationShape` (`:2268–2282`) consumes "up to the shape's opening
   `{` (past any `by field =` / `=` head)" and returns at a `stmt-sep` for the
   `=` form — precisely the recovery the `null` path needs. Nothing calls it.
   `skipBraces` (`:2284–2297`) is called only from inside it.
2. The V5b checker module (`src/parser/schema-declarations.ts:317–336`)
   implements all seven checks against a resolved declaration graph
   (`checkDiscriminatedUnion` `:375`, `checkByClause` `:629`,
   `detectTypeAliasCycles` `:667`). Nothing under `src/` imports them. The
   graph they consume — per-variant field literals, the explicit `by` field,
   alias-versus-object node kinds — cannot be built, because `SchemaDecl`
   (`:527–537`) has no right-hand side to build it from.

The `SchemaDecl` shape is the root: the AST models the object form and records
the other two forms only as the absence of `fields`. Every consumer inherits
that. `collectBodyTypes` (`:1101–1112`) has an arm whose comment names "alias /
discriminated union" as a case it maps to `{}`; the arm runs, but only for a
body-less `schema X` head or a brace body whose first token is not an
`ident: Type` field, never for an alias declaration.

## Why it matters

- A documented declaration form does not work, and the diagnostic points at
  punctuation. An author following `schemas.md:55–57` gets `stray '='` with no
  indication that the construct is unimplemented; the registry trigger for that
  code asserts the construct is not part of theta.
- The `by` form's failure is misattributed. `immutable-rebinding` names a
  binding the author did not write in that statement, and the fix an author
  would infer from it (rename or remove the `let`) changes the diagnostic
  without approaching the cause.
- `schema X by f { ... }` loads clean where the spec prescribes rejection, so a
  declaration whose discriminator clause is meaningless is silently accepted as
  a field-less schema.
- Seven closed-registry codes cannot be produced by any input, and no gate in
  `npm test` scores that. The code-parity arm matches on code-string presence
  in the test corpus, which the seam-level assertions satisfy, and it is
  excluded from the live-corpus canary
  (`tools/closing-gate/live-corpus.js:51–59`) regardless.
- Two other open reports had to carve the form out of their own scope.
  [0025](./0025-ctor-unresolved-schema-name-passthrough.md)'s
  non-constructible-name classification cannot cover alias and union names, and
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s
  `@<T>` resolution work cannot cover an alias annotation, because in both
  cases the declaration that would create the input does not parse. Each
  report's coverage argument is therefore conditional on this one.
- `TYPE-4`, `TYPE-11` and the `anyOf` lowering rule of `schema-subset.md:82`
  are unexercised by any input, so the type layer carries three normative rules
  with no reachable subject.

## Fix

Implement the two missing `SchemaShape` alternatives in the parser and wire the
existing checkers to them. One change: the AST widening, the parse, the
lowering and the checker wiring land together, because no part of it is
reachable without the others.

**AST.** `SchemaDecl` (`theta-document.ts:527–537`) gains the right-hand side:
the alias/union arm list (each arm a `Type` source, reusing the same
`parseType` the object form's field types use) and the optional `by <field>`
identifier. `fields` stays as the object-form arm. Every existing consumer that keys off
`fields === undefined` — `collectBodyTypes` (`:1101–1112`),
`StructuralRefs.schemas` (`:4711`, built at `:4746–4753`, filtering on
`s.fields !== undefined` at `:4751`), and `buildBodyTypeSchemas`
(`src/parser/body-type-lowering.ts:149–153`, whose doc comment at `:137–139`
records the alias and `by` forms as the skipped case) — must be revisited
against the three-way shape rather than the present two-way presence test.

**Parse.** `parseSchema` (`:2039–2052`) dispatches on the token after the name:
`{` to `parseSchemaObjectBody` as today, `=` to an alias/union arm parser, `by`
to the explicit-discriminator parser, and a `by` followed by `{` to a decl
carrying both the clause and an object body — that last shape must reach
`checkByClause`, not be discarded, or `theta/parse/by-on-object-schema` stays
unreachable. Error recovery uses `skipDeclarationShape` (`:2268–2282`), which
already implements the required consume-to-`{`-or-newline behaviour; it becomes
live, and `skipBraces` (`:2284–2297`) with it. No token of a declaration shape
may survive into the statement loop.

**Checker wiring.** `checkDiscriminatedUnion` (`schema-declarations.ts:375`),
`checkByClause` (`:629`) and `detectTypeAliasCycles` (`:667`) are called from
the same whole-file check pass that already runs `checkObjectSchema`
(`theta-document.ts:4979`) and `checkEnumDeclaration` (`:5014`). Their inputs
are built from the widened AST: `UnionVariantSchema` per resolved variant,
`ByClauseDecl` per `by` declaration, and a `SchemaGraphNode` per declaration
with `kind: "alias" | "object"`. The seven tests in
`tests/disc-unions-recursion.test.ts` keep their seam-level assertions and gain
`parseThetaDocument`-level siblings, so the registry rows are covered
end-to-end rather than at the seam alone.

**Lowering.** An alias declaration lowers per `schema-subset.md:81–83`:
all-primitive arms to `{ "type": [...] }` (SUBS-1), a discriminated object
union to `{ "anyOf": [...] }`, mixed arms to `anyOf`, with arm order following
the *Array element order* clause (`:85`). This is the point at which
`collectBodyTypes`'s permissive `{}` arm (`theta-document.ts:1108–1112`) stops
being correct for alias names: they become concretely lowerable, and the arm
narrows to the imported-symbol case.

**A body-less `schema X` head must gain a disposition.** `schema X` with no
shape at all, and `schema X { "a": string }` whose brace body opens with a
non-`ident` token, both load with zero diagnostics today and produce a
field-less declaration whose name resolves everywhere. Replacing the `null`
fallthrough removes the mechanism that makes them silent, so the fix decides
what they are. No separate report is filed for them.

**Registry.** No new code and no DIAG-2 amendment: all seven rows already exist
(`code-registry-parse.md:55`, `:93–98`), and `schema-declarations.ts` already
renders each row's *Message* string verbatim as DIAG-4 requires (for example
`type-alias cycle: ${path}` at `:707` against the row's `type-alias cycle:
<path>` at `:98`). The
[GOV-15 diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
(`:25`) covers the two inputs whose observable diagnostic sequence changes from
clean to rejecting — `schema X by f { ... }` and, if it is dispositioned as an
error, the body-less head — as a trigger change "in-scope as an addition for
inputs newly brought into the code's emission set". Inputs that today fail on
`stray '='` / `stray '|'` are outside GOV-15's input set entirely: they do not
load cleanly under theta 1.0.0
([loads-cleanly predicate](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly),
`:9`).

**Fix ordering.** 0033 blocks on nothing and blocks no other report from
landing. It does change the input set two other reports reason about, and both
state their coverage as conditional on it:

- [0025](./0025-ctor-unresolved-schema-name-passthrough.md) rejects a
  constructor naming a non-constructible declaration. Today that arm covers
  `enum` only; once alias and union names exist, they join it. If 0025 lands
  first, its classification must be re-run against alias/union declarations
  when 0033 lands.
- [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) resolves
  `NamedType` at the `@<T>` annotation root, in schema-body fields, and in
  `params:` `$defs` fragments. Alias names are absent from its position
  enumeration for this reason. After 0033 an alias annotation is reachable and
  lowers concretely, which removes one arm of the permissive `{}` set rather
  than adding to it.

Both of those reports also widen `theta/parse/unresolved-named-type` to every
`NamedType`-resolution position. 0033 adds a further such position — the alias
right-hand side, where `schema X = Ghost` names an undeclared type — so the
widened row's predicate ("names no in-scope `schema`/`enum` declaration or
imported `.thetalib` symbol. Resolution is whole-file",
`code-registry-parse.md:88`) covers it without further edit. Whichever of the
three lands last inherits the row as written.

**Test witness — unit, offline, no live provider.** Every fixture in
§Reproduction is a `parseThetaDocument` call; the red/green contrast is the
diagnostic list. Required beyond the probes: an end-to-end assertion per
registry code driven through `parseThetaDocument` rather than the seam; a
lowering assertion that a discriminated union produces `anyOf` in source arm
order per `schema-subset.md:85`; and an AJV compile assertion over the lowered
union.

## Non-goals

- Mixed unions in *type* position (`schema S { a: string | Author }`) already
  parse and are unaffected. The failure is specific to the declaration shape.
- The permissive `{}` lowering of imported schema names
  (`theta-document.ts:1113–1117`) stays as it is; `MaterializedImport`
  (`src/runtime/lexical-environment.ts:117–125`) carries no field bodies, so an
  imported name remains resolved-but-permissive after this fix.
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) owns that
  seam.
- The wire-name renaming, enum, and object-schema declaration paths are
  untouched. `parseSchemaObjectBody` keeps its behaviour for the object form.

## Provenance

- Origin: the residual both
  [0025](./0025-ctor-unresolved-schema-name-passthrough.md) and
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) declared
  out of scope. 0025 §Non-goals (`:318–325`) records "`schema Animal = Cat |
  Dog` in a theta body yields `theta/parse/unsupported-feature` … and
  `skipDeclarationShape` … has no caller", which keeps the alias arm of its
  non-constructible-name classification unreachable; 0028 §Fix records the same
  fact as the reason the alias-annotation case is absent from its position
  enumeration.
- Spec: `docs/spec_topics/schemas.md` (§Type-alias / union schema `:50–60`;
  §Discriminated unions `:95–117`, incl. the `by` example `:110` and the
  `by-on-object-schema` rule `:113`; the enum cross-reference `:89`;
  §Recursion `:119–141`; the alias-cycle rule `:143`);
  `docs/spec_topics/grammar.md` (§`schema X by <field>`, `:168–179`, grammar
  block `:170–177`); `docs/spec_topics/schema-subset.md` (`:12`, §Lowering
  Algorithm `:68–90`, SUBS-1 `:81`, discriminated-union lowering `:82`, array
  element order `:85`); `docs/spec_topics/type-system.md` (`:19`, TYPE-4 `:38`,
  TYPE-10 `:52`, TYPE-11 `:54`);
  `docs/spec_topics/diagnostics/code-registry-parse.md` (`:27`
  `unsupported-feature`; `:55` `by-on-object-schema`; `:88`
  `unresolved-named-type`; `:93–98` the five discriminator codes and
  `type-alias-cycle`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md` (DIAG-2 `:72`);
  `docs/spec_topics/governance/source-language-stability.md` (loads-cleanly
  predicate `:9`; diagnostic-registry carve-out `:25`). User-facing reference:
  `docs/reference/schema-subset.md:56–59`, `docs/reference/grammar.md:273–281`,
  `docs/reference/type-system.md:76–80`.
- Implementation evidence at `4d645f4f`: `src/parser/theta-document.ts`
  (`:527–537`, `:1101–1112`, `:1510–1521`, `:1591–1592`, `:2039–2052`,
  `:2063–2145`, `:2268–2282`, `:2284–2297`, `:4711`, `:4746–4753`, `:4979`,
  `:5014`); `src/parser/schema-declarations.ts` (`:317–336`, `:375`, `:629`,
  `:641–646`, `:667`, `:702–708`); `src/parser/body-type-lowering.ts`
  (`:137–139`, `:149–153`); `src/runtime/lexical-environment.ts`
  (`:117–125`).
- Test evidence at `4d645f4f`: `tests/disc-unions-recursion.test.ts`
  (`:2–6`, `:18–22`, seven seam-level tests — the only occurrences of the
  seven codes under `tests/`); `tests/code-registry.test.ts:109–111`
  (`reconcileClosedSet` driven with synthetic inputs);
  `tools/code-registry/index.js:99` (`reconcileClosedSet`);
  `tools/closing-gate/index.js:702–711` (the
  `registry-code-no-asserting-test` arm) and
  `tools/closing-gate/live-corpus.js:51–59` (`CANARY_GAP_KINDS`, which omits
  it); `tests/committed-fixture-parse-gate.test.ts:49–63`.
- Reproduction: scratch vitest at HEAD (eighteen fixtures — the object,
  primitive and string-literal union shapes; two single-type aliases; the
  multi-variant and single-variant `by` forms; `by` on an object body; the
  alias cycle; the `.thetalib` variant; an alias at the `@<T>` annotation root;
  the `params:` reach; constructors on an alias name and on a body-less head;
  the body-less and non-`ident`-body heads; and two controls), run on the
  outputs quoted above, then deleted per scratch policy.
