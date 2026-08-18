# Bug 0190 — `provableArgType`'s shared `case "member"` / `case "method-call"` arm (`type-layer-checks.ts:1804–1819`) returns `undefined` unconditionally, so the wired `theta/parse/fn-arg-type-mismatch` sink withholds on every member-read argument even though bug 0136 (0.106.0) made a member read's static type the receiver's *declared field type*: measured, `fn g(n: integer)` called as `g(p.s)` with `p.s` declared `string` reports `[]`, while the identical mismatch one spelling over — an annotated parameter, an annotated `let` — reports the `E` code, and the sibling typed-`let` and constructor-field sinks report it on that same member read

- **Status:** fixed (0.111.0). §Fix was constraint-pinned rather than settled;
  every adjudication it demanded — the route, the object-schema-typed-field
  sub-case, the per-consumer widening, the registry question, and the re-pin of
  the protected witness — is recorded in `## Fix (0.111.0)` below. The substrate
  half landed in bug 0136 at 0.106.0. Bug
  [0126](./0126-plain-for-binds-no-loop-variable.md) shipped at 0.107.0 ahead of
  this report, so the witness contention §Fix (f) anticipated resolved in that
  order and its plain-`for` arm is a THIRD consumer of the predicate.
- **Sev/Diff estimate:** S1/D3 — a registered `E`-severity row whose *Trigger*
  the input satisfies in every particular emits nothing on the member-read
  argument class, the registry row states no runtime net backstops it, and the
  runtime confirms that: `evalUserFnCall` checks arity only
  (`src/runtime/statement-executor.ts:395–416`) and binds the argument with
  `scope.defineLocal` (`:416`) unvalidated, so a `string` binds to an
  `integer`-declared parameter with no diagnostic at either phase; D3 because
  the fix must split a shared arm whose comment covers two namespaces, must
  distinguish 0136's *resolved* field type from the same arm's still-minted
  nominal fallback (measured: the fallback is judged at an already-open sink,
  §Reproduction R15/R16), engages GOV-15 in the addition direction, widens two
  further channels the same predicate feeds (`:1020`, `:2053`), and must
  deliberately re-pin a protected 84-cell witness whose four `for`-class cells a
  sibling open report is concurrently moving.
- **Kind:** defect — implementation, against one written rule and one written
  sentence, in five measured elements.
  1. **A registered check does not run on an input its *Trigger* covers.** The
     row (`docs/spec_topics/diagnostics/code-registry-parse.md:120`) triggers on
     "A plain top-level `fn` call `f(args)` … passes an argument whose static
     type is not compatible with the matched parameter's declared type", and
     [TYPE-9](../spec_topics/type-system.md#type-9)
     (`docs/spec_topics/type-system.md:50`) qualifies the obligation as "on a
     static failure (`T₁ ⋢ T₂`, both operands statically resolvable)". Both
     operands are statically resolvable post-0136: the parameter's declared type
     comes from its annotation and the argument's from the receiver's declared
     field record. Measured (§Reproduction R1): `[]`.
  2. **The arm's stated premise is false for the member half.** The comment
     (`type-layer-checks.ts:1806–1818`) reads: "A read that mints a `named` type
     out of an author-chosen FIELD or METHOD name is not a proof of the value's
     type: `#typeExpr` answers `named <field>` for `v.P` … neither of which is
     the type of the value the read produces." `#typeExpr`'s `case "member"`
     (`src/parser/static-type-inference.ts:242–279`, bug 0136's fix) returns the
     receiver's declared field type, unfolded per TYPE-11. Measured (R21): a
     field declared `number` types as `number`, not as its own name. The METHOD
     half of the sentence still holds (`case "method-call"`,
     `static-type-inference.ts:296`, mints the method name) — the two halves now
     carry different truth values behind one `return undefined`.
  3. **The spec states the type the sink declines to use.** Bug 0136's
     same-commit spec edit made the result type explicit:
     `docs/spec_topics/expressions.md:9` — "The static result type of
     `obj.field` is the receiver's declared type for that field; TYPE-11 applies
     to the field's declared type as elsewhere", mirrored at
     `docs/reference/grammar.md:340`. `type-system.md:48`'s deferral licence is
     for an operand "past the parser's static view"; a declared field on a
     resolved object schema is not one, which is the argument bug 0136 already
     landed at eight other sinks.
  4. **Sibling sinks in the same file judge the same read, so the divergence is
     per-sink.** Measured on one member read whose declared type is `string`:
     the typed-`let` sink reports `theta/parse/let-rhs-type-mismatch` (R4) and
     the constructor-field sink reports
     `theta/parse/object-field-type-mismatch` (R5), both `E`; the `fn`-argument
     sink reports nothing (R1). All three read the same `typeOf` seam
     (`type-layer-checks.ts:925–926` delegates to
     `static-type-inference.ts:182–188`); only this one interposes its own proof
     gate.
  5. **The withholding propagates past the argument position.**
     `provableArgType` is also the identity channel for the unannotated-`let`
     marking guard (`:1020`) and for the `par for` element inheritance
     (`:2053`). Measured: an unannotated `let m = p.s` then `g(m)` reports `[]`
     (R10), and `par for x in p.xs { g(x) }` over a field declared
     `array<string>` reports `[]` (R11) where the same loop over an annotated
     `array<string>` binding reports the code (R12). The defect is one arm and
     three consumers.
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the sink's owner. Its §Fix wired `checkFnCallArgs`
    (`type-layer-checks.ts:1575`) and built `provableArgType` as the soundness
    gate; its pinned non-goals keep "the substrate's minted names" out (`:663`).
    Bug 0136's fix appended the coordination note at `:674–706`, which records
    that both of the substrate-related findings of 0050's own review rounds were
    "closed at the sink by WITHHOLDING (`provableArgType` refuses spelling-mints;
    cells u6–u8p), never by touching the substrate", that the clause ended "The
    substrate's mints remain this report's to fix" (`:681`), and that after bug
    0136 "the substrate proves the type, the sink declines to use the proof, and
    u6's premise comment … is true of the method half and no longer of the field
    half". **This report is the other half of that split, not a re-file of
    0050**: 0050's defect was an emitter with no caller, and its caller is in the
    tree and fires (R2, R3, R12).
  - [0136](./0136-member-access-types-as-field-name-not-field-type.md) —
    **fixed (0.106.0**, commit `6942ef27`**)**, the premise dissolution and the
    filing origin. Its `## Fix (0.106.0)` residual 1 (`:615–625`) states this
    finding with the x11 measurement and its reason for declining it: "Opening
    the sink is outside this §Fix — it touches neither the arm nor any route the
    document enumerates — and would flip that 84-cell witness, so it is left to
    its own report." Its witness row **x11**
    (`tests/member-access-declared-field-type.test.ts:961`, asserted at
    `:1070–1086`) pins the withholding as `[]` in both directions of that fix.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **open**, the same file
    at a different arm (`walkStmt`'s `case "for"`, its title cites
    `type-layer-checks.ts:679–692`). Neither fix reaches the other: 0126 writes
    an entry into the walk's `bindings` map, this one changes what the argument
    sink accepts as a proof. They contend for one artifact — the 84-cell witness
    below — because 0126's binding turns the plain-`for` element into a
    (withheld or proven) entry the same predicate reads. Measured: 84/84 green at
    HEAD; with 0126's prototype applied, four cells red (u9, u12e, u13me, u13r),
    all `for`-class, none in the u6–u8p group this report moves.
  - [0138](./0138-imported-thetalib-fn-arg-route-deferred.md) — **open**, the
    same registry row's other withheld route: `checkFnCallArgs` returns on
    `importedSymbols.has(e.callee)` (`type-layer-checks.ts:1582`), so an
    imported-`.thetalib` callee is never judged. Disjoint cause (no imported
    parameter types at a single-file parse) and disjoint site (the callee gate,
    not the argument gate); both narrow the same row's reach and a fix to either
    leaves the other's input class silent.
  - [0131](./0131-in-document-fn-call-arity-unchecked.md) — **open**, argument
    *count* at the same sink. 0050's §Fix pinned arity out of scope and its cell
    a1 pins the silence in both directions; unchanged here.
  - [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **fixed
    (0.65.0)**, the soundness discipline `provableArgType` implements in-layer.
    Its extension-layer counterpart `collectProvableArgTypes`
    (`src/extension/invoke-static-checks.ts:505`) carries the same withholding
    over the same node kinds (`:582–594`) with the same dissolved premise —
    "Each types as a `named` nominal reference past the parser's static view" —
    for the `.theta`-callable and Pi-tool argument sinks. That position is
    §Non-goals here and is unfiled.
  - [0081](./0081-array-ternary-common-type-never-unions.md) — **fixed
    (0.83.0)**, the precedent for opening arms of this exact predicate. Its fix
    turned the union reduction from an erasure into a proof, which moved cells
    u1–u5, u7 and u11 of the same 84-cell witness from vacuous silence to live
    emission — attributed in that file's own header (`:38`, `:43`, `:60`) and in
    each group's banner. The route shape, the witness-motion bookkeeping and the
    both-directions obligation are established there.
  - [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md) —
    **open**, the newly-reachable-input precedent 0136 already exercised: a fix
    that hands an existing gate a resolvable operand it never saw is inside that
    gate's registered trigger, not a new check.
- **Affected** (every citation verified at HEAD `6942ef27`, 0.106.0):
  - **The defect site** — `src/parser/type-layer-checks.ts:1804–1819`, the
    shared arm of `provableArgType` (declared `:1654`, doc comment `:1629–1653`):

    ```ts
          case "member":
          case "method-call":
            // A read that mints a `named` type out of an author-chosen FIELD or
            // METHOD name is not a proof of the value's type: `#typeExpr` answers
            // `named <field>` for `v.P` and `named <method>` for `xs.length()`,
            …
            return undefined;
    ```

    Two labels, one comment, one `return undefined;` at `:1819`. No `env` read,
    no receiver read, no branch.
  - **The sink that consumes it** — `checkFnCallArgs`
    (`type-layer-checks.ts:1575`), reached from `walkExpr`'s `case "call"`
    (`:1986–1987`). It resolves the callee through three early returns
    (`:1576–1581` a shadowing local, `:1582–1589` an imported symbol — bug
    0138's subject, `:1590–1597` a non-user-`fn` callee), converts the declared
    parameter type at `:1601`, asks `provableArgType` at `:1608`, and
    `continue`s on `undefined` at `:1609–1614` with the comment "withholding
    here can only suppress an emission". The emission it skips is
    `checkFnArgCompat` at `:1615–1625`.
  - **The emitter, which defers on its own** — `checkFnArgCompat`
    (`src/parser/type-compat.ts:461`): it calls `checkCompatible` at `:471` and
    returns no diagnostic when the relation is `"compatible"` **or**
    `"unknown"` (`:472–474`). So an unresolvable operand is already handled one
    layer down; the arm's own withholding is the additional gate.
  - **The answer the substrate now supplies** —
    `src/parser/static-type-inference.ts:242–279`, `#typeExpr`'s `case "member"`
    (bug 0136's fix): it unfolds the receiver (`:267`), reads the declaration
    through `resolveNamed`, and returns `unfoldAlias(fields[node.field])` when
    the declaration is an `object-schema` carrying an own key for the field;
    when the receiver resolves to nothing it returns *the receiver's* `named`;
    otherwise it falls through to `{ kind: "named", name: node.field }` at
    `:278`. The public seam is `typeOf` (`:182–188`), delegated to by the
    checker's own `typeOf` at `type-layer-checks.ts:925–926`.
  - **The record the resolved branch reads, whose verdict the returned
    `CompatType` does not carry.** The declared-field record
    is written by `collectTypeEnv` (`type-layer-checks.ts:328`, the
    `object-schema` entry with `fields` at `:349–351`) from
    `collectSchemaFields` (`:786–800`, null-prototyped per bug 0031, dropping
    any field whose `typeSource` `annotationToCompatType` declines); the
    type-layer's existing own-key-guarded reader is `declaredFieldsOf`
    (`:1512–1520`) through `resolveNamed` (`type-compat.ts:104`). The `fields`
    shape is `NamedDecl`'s `readonly fields?: Readonly<Record<string, CompatType>>`
    (`type-compat.ts:85`).
  - **The two further consumers of the same predicate** — the
    unannotated-`let` marking guard (`type-layer-checks.ts:1020`, which records
    the binding in `unprovableBindings` when `provableArgType(stmt.init)` is
    `undefined`) and the `par for` element inheritance (`:2053`, which marks the
    element type unprovable when `provableArgType(e.iterand)` is `undefined`).
    Both are measured silent on a member-read source (R10, R11).
  - **The runtime that does not backstop the position** —
    `src/runtime/statement-executor.ts:395` (`evalUserFnCall`): arity only
    (`:401–402`, `ThetaFnArityError` at `:364`), then
    `scope.defineLocal(param.name, arg.value, false)` at `:416` with no
    validation; the second copy of the shape is `:495`/`:503`. This is what the
    registry row's own "no runtime AJV safety net applies" describes.
  - **The registration consequence** — every code in play is `E`
    (`code-registry-parse.md:120` for this row), and `hasLoadParseError`
    (`src/extension/production-composition.ts:2214–2221`) drops any theta
    carrying an `error`-severity `theta/load/*` or `theta/parse/*` diagnostic.
    A theta whose mistyped member-read argument is not reported therefore
    registers and runs.
  - **The 84-cell protected witness** —
    `tests/fn-arg-type-mismatch-wired.test.ts` (84 `it`s). The cells whose
    premises bug 0136 dissolved, and the only ones whose vehicle is a member
    read at an argument position:
    - **u6** — fixture `U6` at `:708–710`
      (`schema P { a: number }` + `schema W { P: number }` +
      `fn f(n: number): number { 1 }` + `let v = W { P: 3 }` + `let r = f(v.P)`),
      cell at `:1383–1394`. Its **assertion holds either way**: `expectNoFnArgMismatch`
      (`:657–662`) asserts only the absence of this row's code, the field `P` is
      declared `number`, the parameter declares `number`, and measured (R21)
      `v.P` types as `number` — so an opened sink relates `number ⊑ number` and
      stays silent. What is dissolved is the **premise**, in four places: the
      group banner `:1370–1380` ("`StaticTypeInferencePass`'s `member` arm
      (src/parser/static-type-inference.ts:242) types `v.P` as `named "P"` — the
      author-chosen FIELD NAME, not the field's declared type"), the cell's own
      comment `:1384–1387` ("its static read is `named "P"`, resolving to the
      unrelated `schema P { a: number }`"), the file-header inventory line
      `:40–41` ("u6 — a `named` type minted from a FIELD name is not a proof of
      the read value's type either"), and the `why` string at `:1392`. The
      banner's citation of the `method-call` arm as `:261` is stale by +35
      (0134-class drift disclosed as bug 0136's residual 6; the arm is at
      `static-type-inference.ts:296`), while its `:242` and its
      `type-layer-checks.ts:1820–1844` citation of the sibling `call` / `invoke`
      arm both hold.
    - **u8 / u8b / u8p** — the callee-name group, whose banner (`:1496–1518`)
      derives its rule from the member half by analogy at `:1503` ("exactly as
      its `member` arm mints a field name (cell u6)") and whose withholding is
      unaffected: the `call` / `invoke` arm (`type-layer-checks.ts:1820–1844`)
      is untouched and its premise stands.
    - **u9's banner** (`:1584–1586`) names "the same fabrication cells u6 and u8
      refuse over the field and callee namespaces" — the field half of that
      sentence is the one that moves.
    - No other cell's fixture contains a member read at an argument position
      (`rg -n '\b[fg]\((?:[^)"]*)\.[A-Za-z_]' tests/fn-arg-type-mismatch-wired.test.ts`
      → one hit, `:710`; no fixture binds a `let` to a member read).
  - **The 0136 witness row this report flips** —
    `tests/member-access-declared-field-type.test.ts:961` (fixture `x11`) and
    `:1070–1086` (the cell, titled "BOUND x11: the FN-ARGUMENT sink still
    WITHHOLDS on a now-provable member read"), whose comment states the
    hand-off: "OPENING THAT SINK IS OUT OF 0136's SCOPE and would flip that
    protected witness; it belongs to its own report."
  - **The spec surface** — `docs/spec_topics/type-system.md:50` (TYPE-9 and its
    "both operands statically resolvable" qualifier), `:48` (*Unresolvable
    operands*), `:29` (the *Operational definition* of `⊑`), `:52` (TYPE-10),
    `:54` (TYPE-11); `docs/spec_topics/expressions.md:9` (the *Member access*
    bullet with 0136's static-result-type sentence);
    `docs/reference/grammar.md:340` (its mirror);
    `docs/spec_topics/diagnostics/code-registry-parse.md:120` (this row),
    `:19` (`binding-case-mismatch`, `E`, "Identifier in a binding / parameter /
    fn-name / field-name position", the code u6's own fixture draws — R20),
    `:56` (`let-rhs-type-mismatch`), `:46` (`object-field-type-mismatch`);
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
    (DIAG-4); `docs/spec_topics/governance/source-language-stability.md:5`
    (GOV-15), `:9` (the loads-cleanly predicate), `:25` (the
    diagnostic-registry carve-out).
- **Observed at:** `0.106.0` (HEAD `6942ef27`). Offline, deterministic; no live
  model, no provider, no child process. Every row below drives the production
  `parseThetaDocument` through the house harness `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) and reads `document.diagnostics` as
  `severity code: message`. One scratch vitest file, deleted after the run; the
  case-insensitive sweep afterwards shows no scratch artifact of this filing in
  `tests/`, `tests/live/`, `src/parser/` or `git status --short`. `src/`,
  `tests/`, `docs/bugs/README.md` and every other bug document are unmodified by
  this filing.
  **Tree state, disclosed.** The rows were first measured in a working tree
  carrying one sibling's uncommitted 7-line edit to
  `src/parser/type-layer-checks.ts` (bug 0126's prototype, replacing
  `recordWithheldBinders(inner, [stmt.variable])` at `:1102` with an element
  binding inside `walkStmt`'s `case "for"` arm), and re-measured after that tree
  went clean — `git hash-object src/parser/type-layer-checks.ts` ==
  `git rev-parse HEAD:src/parser/type-layer-checks.ts` ==
  `92960836d84c8323231777ceeefa62e66dd44a7a` — with identical values for R1, R2,
  R4, R10, R11 and R16. No fixture here contains a plain `for` statement, so that
  arm is unreachable for every row quoted. At the clean tree both committed
  witnesses are green: `tests/member-access-declared-field-type.test.ts` → 72/72
  (including row x11's `[]`) and `tests/fn-arg-type-mismatch-wired.test.ts` →
  84/84. Every `type-layer-checks.ts` line number in this document is read from
  the HEAD blob.

## Summary

`checkFnCallArgs` is wired (bug 0050, 0.77.0) and fires: an `integer`-declared
parameter fed a `string` draws `theta/parse/fn-arg-type-mismatch` at `E`
severity, denying registration. It fires for an annotated `fn` parameter, for an
annotated `let`, and for a `par for` variable over an annotated iterand. It does
not fire when the argument is a member read.

The gate is `provableArgType`, the predicate 0050 built so the sink judges only
reads that prove the value's runtime type. Its `member` label shares an arm with
`method-call` and returns `undefined` for both, on the stated premise that such
a read "mints a `named` type out of an author-chosen FIELD or METHOD name".

Bug 0136 (0.106.0) removed that premise for the field half. `#typeExpr`'s
`case "member"` now resolves the receiver and returns the field's declared
`CompatType`, unfolded per TYPE-11, and the same commit wrote the rule into the
spec: "The static result type of `obj.field` is the receiver's declared type for
that field" (`expressions.md:9`). Eight registered `E` codes became reachable on
member reads; thirteen registry rows changed reachability. The `fn`-argument row
is not among them, because its own proof gate still refuses the operand.

Measured on one body: `schema P { s: string }`, `fn g(n: integer): integer { n }`,
`fn f(p: P): integer { g(p.s) }` reports `[]`. The identical mismatch at the
identical call site with the argument spelled as an annotated parameter reports
`fn 'g' argument 0 ('n') type mismatch: expected integer, got string`. The same
member read at the typed-`let` sink reports `let-rhs-type-mismatch`, and at the
constructor-field sink reports `object-field-type-mismatch`. Three sinks, one
operand, one verdict missing.

The withholding is not confined to the argument position. `provableArgType` is
also the identity channel for the unannotated-`let` marking guard (`:1020`) and
for the `par for` element inheritance (`:2053`), so a `let m = p.s` and a
`par for x in p.xs` both hand their consumers a value marked unprovable, and the
sinks one hop on withhold too.

Nothing downstream recovers the check. The registry row states "Always
parse-time … so no runtime AJV safety net applies", and the runtime agrees:
`evalUserFnCall` checks arity and binds each argument with `defineLocal`
unvalidated (`statement-executor.ts:401–416`). A theta whose mistyped
member-read argument goes unreported carries no `E`, so it registers, and
nothing at the binding site validates the argument.

## Reproduction

At HEAD `6942ef27` (0.106.0), offline. One scratch vitest file drove `parseDoc`
over the rows below and printed `severity code: message` per diagnostic;
transcribed verbatim, `[]` meaning zero diagnostics. Bodies are given as theta
source with `\n` line breaks; no frontmatter is needed for the parse rows and
none of them contains a plain `for` statement.

```console
R1  g(p.s), p.s declared string, param integer      => []
R2  control: annotated fn parameter, same position  => ["error theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('n') type mismatch: expected integer, got string"]
R3  control: annotated let, same callee             => ["error theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('n') type mismatch: expected integer, got string"]
R4  typed-let sink on the same member read          => ["error theta/parse/let-rhs-type-mismatch: let binding 'n' initialiser type mismatch: expected integer, got string"]
R5  ctor-field sink on the same member read         => ["error theta/parse/object-field-type-mismatch: field 'n' on schema 'S' type mismatch: expected number, got string"]
R6  alias-typed field (TYPE-11)                    => []
R7  nested member read                             => []
R8  ternary mixing a member read with a literal     => []
R9  index read whose target is a member read        => []
R10 unannotated let off a member read, then g(m)    => []
R11 par-for element off a member iterand            => []
R12 control: par-for over an annotated iterand      => ["error theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('n') type mismatch: expected integer, got string"]
R13 method-call half: g(xs.join(","))               => []
R14 absent field                                   => []
R15 absent field colliding with a declared alias    => []
R16 same collision at the typed-let sink            => ["error theta/parse/let-rhs-type-mismatch: let binding 'z' initialiser type mismatch: expected string, got Zzz"]
R17 object-schema-typed field at the fn-arg sink    => []
R18 same field at the typed-let sink                => ["error theta/parse/let-rhs-type-mismatch: let binding 'n' initialiser type mismatch: expected integer, got Q"]
R19 enum-variant argument                          => []
R20 u6's vehicle verbatim                          => ["error theta/parse/binding-case-mismatch: binding name must start with a lowercase letter or _"]
R21 u6's field types as number (typed-let probe)    => ["error theta/parse/binding-case-mismatch: binding name must start with a lowercase letter or _","error theta/parse/let-rhs-type-mismatch: let binding 'z' initialiser type mismatch: expected string, got number"]
```

The bodies:

| Row | Source |
|---|---|
| R1 | `schema P { s: string }` / `fn g(n: integer): integer { n }` / `fn f(p: P): integer { g(p.s) }` / `1` |
| R2 | `fn g(n: integer): integer { n }` / `fn f(s: string): integer { g(s) }` / `f("x")` |
| R3 | `fn g(n: integer): integer { n }` / `let s: string = "x"` / `let r = g(s)` / `r` |
| R4 | `schema P { s: string }` / `fn f(p: P): integer { let n: integer = p.s` `n }` / `1` |
| R5 | `schema P { s: string }` / `schema S { n: number }` / `fn f(p: P): number { let q = S { n: p.s }` `1 }` / `1` |
| R6 | `schema T = string` / `schema P { s: T }` / `fn g(n: integer): integer { n }` / `fn f(p: P): integer { g(p.s) }` / `1` |
| R7 | `schema Q { s: string }` / `schema P { q: Q }` / `fn g(n: integer): integer { n }` / `fn f(p: P): integer { g(p.q.s) }` / `1` |
| R8 | `schema P { s: string }` / `fn g(n: integer): integer { n }` / `fn f(p: P, b: boolean): integer { g(b ? p.s : 1) }` / `1` |
| R9 | `schema P { xs: array<string> }` / `fn g(n: integer): integer { n }` / `fn f(p: P): integer { g(p.xs[0]) }` / `1` |
| R10 | `schema P { s: string }` / `fn g(n: integer): integer { n }` / `fn f(p: P): integer { let m = p.s` `g(m) }` / `1` |
| R11 | `schema P { xs: array<string> }` / `fn g(n: integer): integer { n }` / `fn f(p: P): integer { par for x in p.xs { g(x) }` `1 }` / `1` |
| R12 | `fn g(n: integer): integer { n }` / `let xs: array<string> = ["a"]` / `par for x in xs { g(x) }` / `1` |
| R13 | `fn g(n: integer): integer { n }` / `let xs: array<string> = ["a"]` / `let r = g(xs.join(","))` / `r` |
| R14 | `schema P { s: string }` / `fn g(n: integer): integer { n }` / `fn f(p: P): integer { g(p.zzz) }` / `1` |
| R15 | `schema Zzz = integer` / `schema P { s: string }` / `fn g(n: string): string { n }` / `fn f(p: P): string { g(p.Zzz) }` / `"t"` |
| R16 | `schema Zzz = integer` / `schema P { s: string }` / `fn f(p: P): string { let z: string = p.Zzz` `z }` / `"t"` |
| R17 | `schema Q { a: number }` / `schema P { q: Q }` / `fn g(n: integer): integer { n }` / `fn f(p: P): integer { g(p.q) }` / `1` |
| R18 | `schema Q { a: number }` / `schema P { q: Q }` / `fn f(p: P): integer { let n: integer = p.q` `n }` / `1` |
| R19 | `enum Color { Red }` / `fn g(n: integer): integer { n }` / `let r = g(Color.Red)` / `r` |
| R20 | bug 0050's `U6` fixture verbatim (`tests/fn-arg-type-mismatch-wired.test.ts:708–710`) |
| R21 | R20's schemas with the call replaced by `let z: string = v.P` |

Readings:

- **R1 versus R2 isolates the arm.** Same callee, same declared parameter, same
  call position inside a `fn` body, same `E` row. The only difference is the
  argument expression's node kind: an `ident` whose recorded type is a proof
  versus a `member` the arm refuses to prove. R3 shows the sink is equally live
  at top level.
- **R4 and R5 prove the substrate resolves the read.** Both messages render
  `string` — the *declared field type* — in the `<actual>` position, so
  `#typeExpr` is returning `prim string` for `p.s` and the two sibling sinks
  judge it. R21 is the same proof for a `number` field.
- **R6 and R7** extend the silence to an alias-typed field (TYPE-11 unfolding,
  which 0136's arm performs) and to a nested receiver.
- **R8, R9, R10, R11** are the composite and propagation channels: a ternary arm
  (`isProvenReduction` requires every arm proven), an `index` read (whose proof
  obligation is its target), the `let` marking guard, and the `par for` element.
  Each inherits the arm's `undefined`. R12 is the paired control that fires.
- **R13, R14, R15, R19 are the bounds that must stay withheld.** The method-call
  half still mints from the method name; an absent field falls through to
  0136's nominal fallback (whose disposition is a *runtime*
  `theta/runtime/missing-object-key` per `expressions.md:9`); an unresolvable
  receiver returns the receiver's own `named`, which `checkCompatible` answers
  `"unknown"` for.
- **R15 with R16 is the hazard a naive opening walks into.** `p.Zzz` on
  `schema P { s: string }` is an absent field, so the arm returns
  `named "Zzz"`, and `schema Zzz = integer` makes that name resolve. The
  fn-argument sink is silent (R15) only because it withholds; the already-open
  typed-`let` sink judges the collision and renders it — `expected string, got
  Zzz` (R16). A `member` arm that returned `typeOf(expr)` unconditionally would
  reproduce R16 at the argument position, which is a false `E` on a program
  whose specified disposition is a runtime panic. The field name is
  author-chosen and unconstrained here: `lexical.md:16`'s lowercase-first rule
  binds *declared* field names (enforced as `theta/parse/binding-case-mismatch`,
  `lexical.md:18`), and `p.Zzz` declares nothing.
- **R17 with R18 is the sub-case that needs a decision, not a hazard.** An
  object-schema-typed field returns that schema's own `named` (TYPE-10), which
  *is* the value's type; the typed-`let` sink judges it (`got Q`) and the
  argument sink does not.
- **R20 shows u6's assertion survives.** Its fixture already emits an `E`
  (`binding-case-mismatch`, for the PascalCase field name `P`), so it is outside
  GOV-15's input set, and its own helper asserts only the absence of
  `fn-arg-type-mismatch`. With the sink opened, `v.P` is `number` (R21) against
  a `number` parameter, so the relation is `"compatible"` and no diagnostic
  appears. The cell stays green; its premise does not survive.

Corroboration from the committed suite at the HEAD-clean tree:
`npx vitest run tests/member-access-declared-field-type.test.ts` → `Tests 72
passed (72)`, i.e. bug 0136's own row x11 (`[]`) is green, the same observable as
R1; `npx vitest run tests/fn-arg-type-mismatch-wired.test.ts` → `Tests 84 passed
(84)`, the posture §Fix (f) has to move.

## Expected behaviour

- **The sink judges what the substrate proves.** TYPE-9
  (`type-system.md:50`) conditions the obligation on "both operands statically
  resolvable", and `expressions.md:9` now states the member read's static result
  type outright. A declared field on a resolved object schema is resolvable, so
  R1's argument slot is inside TYPE-9's scope and the registry row's *Trigger*
  (`code-registry-parse.md:120`) covers it verbatim: an argument "whose static
  type is not compatible with the matched parameter's declared type". R1 reports
  what R2 reports.
- **The deferral licence is read as written.** `type-system.md:48` skips a check
  only when an operand is "past the parser's static view", with two named
  examples (an unregistered Pi-tool schema, a callee that produced
  `theta/load/callee-has-errors`). Neither covers a member read whose declared
  `CompatType` is already in the `TypeEnv` the pass holds.
- **One operand, one verdict, across sinks.** The typed-`let` sink (R4), the
  constructor-field sink (R5) and the argument sink read the same `typeOf` seam.
  A read either proves the value's type or it does not; which sink asks must not
  change the answer.
- **A proof is distinguished from a mint.** The soundness rule 0050 established
  stands: only a read that proves the runtime value's type may be judged. Post-0136
  the member arm has three outcomes — a resolved declared field type, the
  receiver's own `named` for an unresolvable receiver, and the field-name mint
  for everything else — and exactly the first is a proof. R15/R16 show the third
  is still a spelling mint that can resolve against an unrelated declaration.
- **The predicate's other consumers move with it.** `provableArgType`'s verdict
  also decides whether an unannotated `let` binding (`:1020`) and a `par for`
  element (`:2053`) are proofs. A member-read initialiser or iterand that is
  proven at the argument position is proven at those two, and the sinks reading
  them report accordingly (R10, R11 report what R12 reports).

## Actual behaviour / root cause

`provableArgType`'s `member` label shares an arm with `method-call` and returns
`undefined` before reading anything. The arm was written when both halves of its
premise were true: at 0.76.0 `#typeExpr`'s `case "member"` returned
`{ kind: "named", name: node.field }`, so a member read's static type was the
field's own identifier, and judging it meant judging whichever declaration
happened to share that spelling (bug 0136's element 1, and cell u6's collision
with `schema P`).

Bug 0136 changed the member half of that and nothing else. The arm's own text is
now half true, and the sharing is what preserves the false half's effect:
`case "method-call"` still mints from the method name
(`static-type-inference.ts:296`) and `case "call"` / `case "invoke"` still mint
from the callee (`type-layer-checks.ts:1820–1844`, whose own reasoning about
schema-cased callees is intact). One `return undefined;` serves a live premise
and a dead one.

Three properties make this a report rather than a one-line edit:

1. **The proof is not recoverable from the returned type.** The arm's three
   outcomes are all `CompatType`, and two of them are `named`. `typeOf(p.q)` and
   `typeOf(p.Zzz)` both answer `named …`; the first is TYPE-10-nominal and the
   value's actual type, the second is a mint that resolves by accident (R16). A
   sink reading only the result cannot tell them apart, so a fix must obtain the
   provenance as well as the type.
2. **The predicate is shared.** `:1020` and `:2053` consume the same answer, so
   opening the member arm widens three sinks, not one. Bug 0081's fix is the
   precedent: it opened one arm of this predicate and moved eight cell groups of
   one witness.
3. **The witness that pins the current posture is protected and contended.**
   `tests/fn-arg-type-mismatch-wired.test.ts` states the withholding as its
   contract in four places for the field half (`:40–41`, `:1370–1380`,
   `:1384–1387`, `:1392`), and bug 0136 deliberately left it byte-exact. Bug
   0126, open against `walkStmt`'s `case "for"` in the same file, already moves
   four of its cells.

## Why it matters

- **A declared parameter type is unenforced for the most common way to reach a
  value.** A member read of a schema-typed parameter, `let`, constructor result
  or query result is ordinary theta; every argument spelled that way passes
  unjudged. R1's theta carries no `E` diagnostic, so `hasLoadParseError`
  (`production-composition.ts:2214–2221`) has nothing to act on and the file
  registers.
- **No second net exists at this position.** The registry row states it
  ("Always parse-time … so no runtime AJV safety net applies") and the runtime
  matches: arity only, then `defineLocal` (`statement-executor.ts:401–416`). The
  body then computes on a value of the wrong type — the shape bug 0136 measured
  at the sinks it opened (`array<integer>.join(",")` returning `"1,2"`; `1.5`
  delivered out of an `integer`-annotated binding).
- **The corpus's diagnostics are inconsistent per sink.** `let n: integer = p.s`
  is refused (R4), `S { n: p.s }` is refused (R5), `g(p.s)` is accepted (R1). An
  author moving the same expression between positions sees the check appear and
  disappear with no rule stating why.
- **Bug 0136's own residual list names this as the missing half.** Its residual
  1 and the coordination note appended to bug 0050 both record that the
  substrate mint is fixed while the sink withholds, with x11 as the pin. Until
  this is closed, `expressions.md:9`'s sentence is unimplemented at one of the
  four positions TYPE-9 enumerates.
- **The silence is stated as a contract in a protected witness.** Cell u6 is
  green for a reason its own comment states falsely (R20, R21): the premise it
  records — a member read mints its type from the field name — has not held
  since 0.106.0. Its four premise sites (§Affected) are what a fix has to
  re-derive, and a reader who trusts them re-derives the wrong rule.

## Non-goals

- **The `method-call` half.** `xs.join(",")` still types as `named "join"`
  (`static-type-inference.ts:296`), so withholding there is sound and stays
  (R13). Bug 0136's §Non-goals (`:1379–1385`) records why the method half needs
  its own resolution source — the stdlib signature table — and its witness rows
  f1/f2 pin the `call` and `method-call` arms as tripwires. A fix here splits
  the shared arm and leaves the method label's verdict and reasoning intact.
- **The `call` / `invoke` arm.** `type-layer-checks.ts:1820–1844`'s premise is
  untouched: a callee-minted name is never the callee's return type, and the
  case-rule argument it gives holds. The operand a sound judgement there needs
  is the callee's declared return type (`collectFnReturnAnnotations`,
  `type-layer-checks.ts:435`, read at `:242`); bug 0136's §Non-goals
  (`:1379–1385`) records that half as inventoried and unfiled.
- **The absent-field disposition.** `p.zzz` parses clean and panics at runtime
  with `theta/runtime/missing-object-key` (`expressions.md:9`); bug 0136's §Fix
  (c) preserved that deliberately and its rows e8/x1/x3/h5 pin it. This fix must
  keep the fallback unjudged (R14, R15), not report on it.
- **The extension-layer argument sinks.** `collectProvableArgTypes`
  (`src/extension/invoke-static-checks.ts:505`) withholds on `member` in the
  same shared-arm shape (`:582–594`) for the `.theta`-callable and Pi-tool
  argument rows, with the same dissolved premise in its comment. It is a
  different layer, a different set of registry rows and bug 0072's subject; bug
  0136's residual 3 records its probe row x12 as an unpinned bound. Not filed
  here, and named so the class stays inventoried.
- **Argument arity** (bug 0131) and **the imported-callee route** (bug 0138).
  Both are the same registry row's other gaps at the same function, each with
  its own report and its own cell in the witness (a1, i1).
- **`enum` declarations being absent from the `TypeEnv`.** Unchanged: an
  enum-variant argument returns the receiver's `named`, resolves to nothing and
  defers (R19). The schema-shadowed-enum case — bug 0136's residual 2, where a
  `schema Color` makes the receiver resolve and the variant falls through to the
  field-name mint — is
  [0191](./0191-enum-name-shadowed-by-schema-fabricates-member-type.md), filed
  from the same origin. A fix here inherits its constraint rather than resolving
  it: the mint that case produces must stay unproven at this sink (§Fix (b)).
- **The `params:`-declared receiver.** Bug 0136's residual 5 measured a
  frontmatter `params:` identifier typing through the `ident` arm's nominal
  fallback, so a member read on such a receiver defers at every sink; that
  position is
  [0192](./0192-params-receiver-type-not-threaded-into-type-layer.md), also filed
  from the same origin, and it is upstream of this arm rather than in it.

## Fix

Not settled. The route below is constraint-pinned: the two implementation
candidates differ in where the provenance comes from, and three sub-questions
need adjudication before either lands.

**(a) The shared arm splits.** `case "member"` and `case "method-call"` stop
sharing a body. The `method-call` label keeps `undefined` and keeps the half of
the comment that is still true; the `member` label gets its own body and its own
reasoning, citing `expressions.md:9` for the result type and TYPE-9 for the
obligation. The `call` / `invoke` arm below is untouched.

**(b) The member half admits exactly bug 0136's resolved branch.** A proof
exists when, and only when, the unfolded receiver is a `named` that resolves to
an `object-schema` declaration carrying an own key for the field — the branch
`static-type-inference.ts:242–279` takes before its two fallbacks. The two
fallbacks (the receiver's own `named` for an unresolvable receiver; the
field-name mint for an absent field, a fields-less declaration, or a declined
`typeSource`) stay unproven. R15/R16 are why this is a constraint and not a
preference: the mint still resolves against an unrelated declaration, and
judging it would refuse at `E` a program whose specified disposition is a
runtime panic.

Two routes deliver that:

- **Route 1 — the pass answers the provenance question.** Add one query beside
  `typeOf` (`static-type-inference.ts:182–188`) that returns the *declared field
  type* of a `member` node or `undefined` when the arm fell back, and have
  `provableArgType`'s new `member` arm return it. The resolution stays in one
  place, the `fields` record keeps its two existing readers (bug 0031's
  `Object.hasOwn` guard, bug 0038's `resolveNamed`), and the sink cannot drift
  from the pass. Cost: one new public method on the pass and its own witness
  rows.
- **Route 2 — the sink re-derives the resolution.** `provableArgType` performs
  the same unfold / `resolveNamed` / own-key lookup itself. Cost: a third reader
  of the `fields` record, against the posture bug 0136 recorded ("no third
  reader of the `fields` record exists") and bug 0031/0038's guard-reuse rule,
  plus two copies of one rule that can disagree after any later change to the
  arm.

A third shape — making the fallback distinguishable inside `CompatType` — is
foreclosed: `CompatType` carries no provenance channel, every consumer reads it,
and the fallback must keep resolving nominally where it does today.

**(c) Sub-question 1: is an object-schema-typed field a proof?** Measured R17 /
R18: the field's declared type is that schema's own `named`, TYPE-10 makes it
the value's type, and the typed-`let` sink already judges it. Admitting it makes
the three sinks agree and widens the GOV-15 addition set; excluding it (a
primitive / literal / array / union subset) is the smaller change. The
adjudication must be recorded either way, because it decides which rows the
witness gains.

**(d) Sub-question 2: how far does the widening travel?** The same predicate
feeds `:1020` and `:2053`. Opening the member arm makes an unannotated
`let m = p.s` a proven binding and a `par for x in p.xs` element a proven
element, so the sinks reading `unprovableBindings` — the typed-`let` RHS, the
object-field value, the array element, the iterand gates, `join`'s element, the
object-index key — become live on a new input class. R10 and R11 measure the
present silence and R12 the control that already fires; the fix states the
intended post-fix value for each and witnesses it, rather than discovering it.

**(e) Sub-question 3: does the row's *Trigger* need an edit?** No, if the answer
holds up: `code-registry-parse.md:120` already covers "an argument whose static
type is not compatible with the matched parameter's declared type" with no
operand-kind restriction, so this is the diagnostic-registry carve-out's
addition direction (`source-language-stability.md:25`) and DIAG-2 is not
engaged. The fix reads the *Trigger* verbatim in its record, as bug 0136's
13-row enumeration did, and confirms no row is added, removed or re-triggered.

**(f) Witness obligations, and the coordination they carry.**

- `tests/fn-arg-type-mismatch-wired.test.ts` (84 cells) is the protected
  witness. u6's assertion holds (R20, R21) and its premise does not: the group
  banner (`:1370–1380`), the cell comment (`:1384–1387`), the `why` string
  (`:1392`) and the file-header inventory line (`:40–41`) are **re-derived, not
  deleted**, to state that the field half is now a proof and the method half is
  not, naming bug 0136 as the authority. u8's banner (`:1503`) and u9's banner
  (`:1584–1586`) reference the field-name fabrication by analogy and need the
  same narrowing. The file gains a positive differentiator (a member read whose
  declared field type is incompatible with the parameter — R1's shape — which
  must emit) and the fallback bounds (R14 and R15, which must not), so u6's
  group stops being vacuous in both directions.
- `tests/member-access-declared-field-type.test.ts:1070–1086` (bug 0136's row
  x11) flips from `CLEAN` to the emitted code. Its comment already delegates the
  authority for that flip to this report; the re-pin cites this document and
  keeps 0136's own subject rows untouched.
- **Bug 0126 contends for the same file and the same witness.** Its prototype
  binds the plain-`for` loop variable in `walkStmt`'s `case "for"` and, measured
  with that prototype applied, reds four cells of the 84 (u9, u12e, u13me, u13r)
  — all `for`-class, none in u6–u8p; the file is 84/84 at HEAD. The two fixes are disjoint in site and in
  mechanism; whichever lands second rebases the witness's cell colours and
  re-reads the other's premise comments before editing. Neither may re-pin the
  other's cells.
- Bug 0081's fix is the shape to follow for the both-directions proof: neutralise
  the new arm, confirm every new row reds and every bound stays green, restore,
  hash-verify.

**(g) GOV-15.** The loads-cleanly predicate (`source-language-stability.md:9`)
selects programs emitting no `E` today; this fix makes some of them emit one, so
the sweep is mandatory in the addition direction and is discharged by
measurement, not assumption: `tests/committed-fixture-parse-gate.test.ts`
enumerates the committed corpus through `git ls-files '*.theta' '*.thetalib'`
(`:76`), asserts hard per-extension counts (`:146–157`) and asserts
`docs/examples/personas.thetalib` membership (`:158`), so a corpus flip is a red
there rather than a scratch walk. A real H9a run
decides the permitted-codes question, per bug 0102's and bug 0136's precedent.

**(h) What the fix must not do.** Emit on any of R13, R14, R15, R19. Touch
`case "call"` / `case "invoke"` (`:1820–1844`) or `case "method-call"`
(`static-type-inference.ts:296`). Add a third reader of the `fields` record
(Route 2's cost, if taken, is stated rather than hidden). Change
`checkFnArgCompat` (`type-compat.ts:461`), whose `"unknown"` deferral is the
spec's. Move any registry row, severity or *Message*.

## Provenance

- **Origin:** bug 0136's fix (commit `6942ef27`, 0.106.0), residual 1 — in the
  document at `docs/bugs/0136-member-access-types-as-field-name-not-field-type.md:615–625`
  and in the run report at `.pi/tmp/fixes/0136-report.md` §"Residuals / notes"
  item 1, "**For the PARENT to file — `provableArgType`'s `case "member"`
  withholds on now-provable member reads**", with the x11 measurement, the
  84-cell consequence, and the reason the fix declined to open the sink.
- **The paired coordination record:**
  `docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md:674–706`
  (the note bug 0136's fix appended: "the substrate proves the type, the sink
  declines to use the proof, and u6's premise comment … is true of the method
  half and no longer of the field half"), and 0050's original clause at `:663`
  ("The substrate's minted names stay out (bug 0136)").
- **The defect site and its consumers:** `src/parser/type-layer-checks.ts:1804–1819`
  (the shared arm), `:1654` (`provableArgType`), `:1629–1653` (its doc comment),
  `:1575` (`checkFnCallArgs`), `:1582` (the imported-callee deferral, bug 0138),
  `:1608–1614` (the withhold), `:1615–1625` (the skipped emission), `:1986–1987`
  (`walkExpr`'s `call` arm), `:1020` (the `let`-marking guard), `:2053` (the
  `par for` element inheritance), `:1820–1844` (the untouched `call` / `invoke`
  arm), `:328`/`:349–351` (`collectTypeEnv`'s `fields` write), `:786–800`
  (`collectSchemaFields`), `:1512–1520` (`declaredFieldsOf`), `:2201`
  (`interpolationIsResult`, the neighbour the arm's comment cites).
- **The substrate:** `src/parser/static-type-inference.ts:242–279` (bug 0136's
  member arm), `:296` (`method-call`), `:182–188` (`typeOf`), `:197`
  (`#typeExpr`).
- **The emitter and the relation:** `src/parser/type-compat.ts:461`
  (`checkFnArgCompat`), `:472–474` (its `"compatible"` / `"unknown"` return),
  `:139` (`checkCompatible`), `:155` (`unfoldAlias`), `:104` (`resolveNamed`),
  `:85` (`NamedDecl.fields`), `:327` (`displayType`).
- **The runtime and registration:** `src/runtime/statement-executor.ts:395`,
  `:401–402`, `:416`, `:364`, `:495`, `:503`;
  `src/extension/production-composition.ts:2214–2221` (`hasLoadParseError`).
- **The extension-layer sibling:** `src/extension/invoke-static-checks.ts:505`
  (`collectProvableArgTypes`), `:582–594` (its shared withholding arm).
- **The spec:** `docs/spec_topics/type-system.md:29`, `:48`, `:50`, `:52`,
  `:54`; `docs/spec_topics/expressions.md:9`; `docs/reference/grammar.md:340`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:19`, `:46`, `:56`,
  `:120`; `docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`.
- **The witnesses:** `tests/fn-arg-type-mismatch-wired.test.ts:40–41`,
  `:657–662`, `:708–710`, `:1370–1380`, `:1383–1394`, `:1496–1518`,
  `:1584–1586`; `tests/member-access-declared-field-type.test.ts:961`,
  `:1070–1086`; `tests/committed-fixture-parse-gate.test.ts` (the GOV-15 corpus
  gate); `tests/helpers/e2e-s1.ts:39` (`parseDoc`, the harness every row above
  used).
- **Measurement:** two scratch vitest files at HEAD `6942ef27` (21 rows through
  `parseDoc`, then a six-row re-measurement at the HEAD-clean tree), both deleted
  after their runs; plus
  `npx vitest run tests/member-access-declared-field-type.test.ts` → 72/72 and
  `npx vitest run tests/fn-arg-type-mismatch-wired.test.ts` → 84/84 at the clean
  tree (80/84 with bug 0126's prototype applied — that prototype's own
  `for`-class cells, listed in §Related). No file in `src/` or `tests/` was
  modified by this filing.

## Fix (0.111.0)

- **What shipped**, keyed to §Fix:
  - **(a) The shared arm split** — `src/parser/type-layer-checks.ts`,
    `provableArgType`: `case "member"` and `case "method-call"` no longer share
    a body. `method-call` keeps `return undefined` and keeps only the half of
    the premise that is still true (the METHOD-name mint); the FIELD half is
    gone from that label. `case "call"` / `case "invoke"` keeps its rule and its
    `return undefined` byte-for-byte — its only edit is a two-substring
    repointing of a cross-reference that no longer names a rule living at "the
    field namespace" (now "the `method-call` arm above … at the method
    namespace"). `static-type-inference.ts`'s `case "method-call"` is
    byte-untouched.
  - **(b) The member label admits exactly bug 0136's resolved branch** —
    `provableArgType`'s new `member` arm returns a proof when, and only when,
    the receiver is itself a proven read AND the read resolves to a declared
    field type; both of bug 0136's fallbacks (the receiver's own `named` for an
    unresolvable receiver, the field-name mint for an absent field / a
    fields-less declaration / a declined `typeSource`) stay unproven.
  - **ROUTE 1 taken, adjudicated** — the provenance comes from the pass, not
    from the sink. `src/parser/static-type-inference.ts` gains a private
    `#memberType` returning `{ type, declared }`, which `#typeExpr`'s
    `case "member"` and a new public `declaredFieldType` (placed beside `typeOf`,
    same `bindings` default) both delegate to. **Grounds:** Route 2 would add a
    third reader of the `fields` record, against bug 0136's recorded posture and
    bug 0031/0038's guard-reuse rule, and would leave two copies of one rule free
    to disagree after any later change to the arm. Route 1 keeps the resolution
    at ONE site and the reader count at exactly TWO —
    `TypeLayerWalk.declaredFieldsOf` and `StaticTypeInferencePass.#memberType`
    (verified by sweeping every `.fields` access in `src/`; the remaining hits
    read a `LowerableField[]` AST array, `CompatType`'s inline-`object` variant,
    or a `Map`, none of them this record). §Fix's foreclosed third shape —
    provenance inside `CompatType` — was not taken; `src/parser/type-compat.ts`
    is blob-identical to HEAD.
  - **A SOUNDNESS CLAUSE §Fix (b) DOES NOT ENUMERATE, added and witnessed.**
    §Fix (b)'s biconditional, read literally, admits an ERASED receiver, and
    that reading is unshippable. Measured: for `schema A { s: string }` /
    `schema B { s: integer }` / `fn g(n: integer)` /
    `let m = flag ? A { s: "x" } : B { s: 1 }` / `g(m.s)` the ternary is not a
    proven reduction (`#commonType` rule 3 discards the `B` arm), so `m` is
    recorded in `unprovableBindings`, the field lookup resolves against `A`, and
    the sink emits `expected integer, got string` — a FALSE `E` on a program
    whose runtime value the declared parameter type accepts, since the runtime
    can hand `g` a `B` whose `s` IS an `integer`. The arm therefore carries a
    RECEIVER-proof obligation (`provableArgType(expr.target, bindings)`), which
    is the same species as the `index` arm's own target obligation in the same
    `switch` and the same species bug 0050's review round r2 landed across four
    routes. **Adjudicated on §Expected behaviour**, whose "A proof is
    distinguished from a mint" paragraph states the rule the literal §Fix (b)
    text under-specifies: "only a read that proves the runtime value's type may
    be judged". Witnessed by cells L1 / L2 / L6 (the ternary, binding-hop and
    `match` erasure routes) with L5 as the proven-receiver differentiator, and
    red-proven under its own dedicated neutralisation.
  - **(c) Sub-question 1 — ADMITTED: an object-schema-typed field IS a proof.**
    **Grounds:** TYPE-10 makes the declared `named` the value's type and names
    this row as a parse-time reporting channel for a cross-named-schema
    mismatch; the typed-`let` sink already judges the same read (measured,
    `expected integer, got Q`); §Expected behaviour's "One operand, one verdict,
    across sinks" requires the three sinks to agree; and cell u8p already
    establishes a constructor-minted `named` as a proof, so the discriminator is
    PROVENANCE, not the returned `kind`. Excluding it would have needed a
    kind-filter with no spec grounding. Witness row R17 pins the admission with
    `got Q` in the `<actual>` position.
  - **(d) Sub-question 2 — THREE consumers, not two, each with its intended
    post-fix value stated and witnessed.** §Fix (d) enumerated two; bug 0126
    shipped at 0.107.0 and its plain-`for` arm consumes the predicate too. Every
    external call site enumerated: `checkFnCallArgs` (the sink) — judges a proven
    member-read argument (rows R1, R6, R7, R8, R9, R17); the unannotated-`let`
    marking guard — a proven member-read initialiser is NO LONGER marked in
    `unprovableBindings`, so the sinks reading it go live (row R10); the
    plain-`for` element inheritance — a proven member iterand's element is a
    proof (cell e4 of `tests/plain-for-loop-variable-element-type.test.ts`,
    flipped); the `par for` element inheritance — likewise (row R11, against its
    already-firing annotated control R12). No fourth consumer exists; the
    remaining five occurrences are the predicate's own recursion.
  - **(e) Sub-question 3 — NO registry edit; DIAG-2 not engaged.** The row's
    *Trigger* read verbatim at HEAD: "A plain top-level `fn` call `f(args)` — a
    same-file or imported `.thetalib` function call that is neither an
    `invoke(...)` nor a `.theta`-callable call — passes an argument whose static
    type is not compatible with the matched parameter's declared type. Always
    parse-time: top-level `fn` declarations are hoisted and always statically
    resolvable, so no runtime AJV safety net applies." No operand-kind
    restriction, so the member-read class was always inside it. No row is added,
    removed, re-triggered or re-severitied and no *Message* moved:
    `docs/spec_topics/diagnostics/code-registry-parse.md` is blob-identical to
    HEAD (`7a623f35…`). This is the GOV-15 diagnostic-registry carve-out's
    ADDITION direction, discharged by measurement rather than assumption —
    `tests/committed-fixture-parse-gate.test.ts` (36 tests, hard per-extension
    counts over `git ls-files '*.theta' '*.thetalib'`) is green, so no committed
    corpus fixture flips.
  - **(f) Witness obligations** — `tests/fn-arg-type-mismatch-wired.test.ts`
    84 → 87 cells: u6's premise RE-DERIVED (never deleted) in its four sites —
    the header inventory entry, the group banner, the cell comment and the `why`
    string — to state that a member read of a DECLARED field on a RESOLVED
    object schema is a proof while the surviving FALLBACK mint is not, with u6's
    own silence re-attributed to a COMPATIBLE `number ⊑ number` relation rather
    than to withholding; u6's ASSERTION is byte-unchanged. The u8 and u9 banners'
    by-analogy references to the field namespace are NARROWED to the fallback,
    their rules and every assertion in those groups unchanged. Three cells added
    so the group decides in both directions: **u6p** (a declared field type
    disagreeing with the parameter — must emit) and **u6b** / **u6c** (an absent
    field, and an absent field whose mint resolves against a declared alias —
    must not). The four cells bug 0126 re-derived (u9, u12e, u13me, u13r) are
    byte-identical to HEAD, verified by extraction-diff.
    `tests/member-access-declared-field-type.test.ts` — row **x11** flipped from
    `CLEAN` to the emitted code under this report's authority (its own comment
    delegated the flip here), re-pinned to the whole ordered code+message list,
    which is strictly stronger than the `[]` it replaces; 0136's subject rows
    untouched. `tests/plain-for-loop-variable-element-type.test.ts` — cell
    **e4** flipped and retitled under this report's authority, with a
    located-form assertion pinning the emission to the argument node, and its
    header ledger reclassifying e4 from a both-directions regression pin to a
    fix-produced emission (the contradiction this fix introduced; see Residual
    3). New dedicated witness `tests/fn-arg-member-read-proof.test.ts`, 23 cells
    in seven labelled groups.
  - **(h) The must-nots, all verified.** No emission on a `method-call` argument
    (R13), an absent field (R14, u6b), an absent field whose mint resolves
    against a declared alias (R15, u6c), or an enum-variant argument (R19). No
    third reader of the `fields` record. `checkFnArgCompat`
    (`src/parser/type-compat.ts`) untouched — blob-identical to HEAD; its
    `"unknown"` deferral remains the spec's. No registry row, severity or
    *Message* moved.

- **Gates** (verbatim):
  - Witness, red before: the four files together →
    `Test Files 4 failed (4)`, `Tests 12 failed | 223 passed (235)`, every red
    carrying the withholding signature (`actual diagnostics: []` where the
    expectation names `theta/parse/fn-arg-type-mismatch`).
  - Witness, green after: `Tests 235 passed (235)` — 23 / 87 / 72 / 53.
  - Full default suite: `npm test` → `Test Files 314 passed (314)`,
    `Tests 5283 passed (5283)` (baseline at HEAD `f455a166`: 313 / 5257).
  - Typecheck: `npx tsc -p tsconfig.json --noEmit` → exit 0, no output.
  - Lint: `npm run lint`
    (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`) → exit 0, no output.
  - Live H8a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → `Tests 48 passed (48)`,
    171.19 s; the additive cell alone → `1 passed | 47 skipped`.
  - Live H9a: `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/acceptance/` → `Test Files 2 passed (2)`,
    `Tests 11 passed (11)` (both files: `noninteractive-acceptance` 10,
    `ctor-unresolved-load-refusal` 1).
  - GOV-15 corpus gate: `tests/committed-fixture-parse-gate.test.ts` →
    `Tests 36 passed (36)`.
  - H9a permitted-codes decided BY THE REAL RUN, not by assumption: **no append**
    — `tests/fixtures/h7a/permitted-codes.json` blob-unchanged at
    `a4a8da04209f90e13d815edd92c1fc682e2a2236`.

- **Blast-radius pre-measurement** (mandatory, GOV-15 addition direction, run
  BEFORE any test was written): the settled route was prototyped at HEAD and the
  FULL suite run. Exactly TWO reds, both doc-named flip authorities — `x11` and
  `e4`. Zero unauthorized flips. `tests/fn-arg-type-mismatch-wired.test.ts`
  stayed 84/84 (u6's assertion holds either way, as §Reproduction R20/R21
  predicted, and no other cell's fixture carries a member read at an argument
  position), and the committed-corpus gate stayed green. Every §Reproduction row
  R1–R21 was re-derived at HEAD with a scratch probe before any red was pinned
  and reproduced VERBATIM — zero drift from the values recorded at `6942ef27`.
  The committed-corpus vehicle sweep found two `.theta` fixtures carrying a
  member-shaped argument, both Trigger-excluded (an `invoke` and a Pi-tool call —
  the classes cells x1 and x3 pin).

- **Review:** 2 rounds. Round 1 (`bug-fix-reviewer`, deep) — **2 findings, both
  `prose`**, zero `correctness` / `fidelity` / `spec` / `house-rule` / `test`. It
  independently probed 17 further soundness routes (erased receivers via ternary
  / `match` / binding hop, index-over-member, member-over-index,
  member-over-`try`, `match`-arm binders, `par for` and plain-`for` elements,
  withheld binders, a frontmatter `params:` receiver, alias cycles,
  self-referential schemas, inline-object-typed fields, `Object.prototype`
  field-name collisions, a declined `typeSource`, union-typed fields, enum
  receivers) and found the receiver clause correct, correctly placed and
  complete, with no over-withholding. Findings: R12 mislabelled "consumer 3" in
  the new witness; the plain-`for` header ledger left false for e4. Round 2
  (`bug-fix-reviewer-fast`, confirmation for the `bug-fix-fixer-light` pass) —
  **CLEAN**, no findings, with the ledger bound verified hunk-by-hunk, the
  `Expr` / `Stmt` leaf enumeration checked member-by-member against
  `theta-document.ts`, and the site-list precondition proven non-vacuous by
  probe.

- **Verification:** `bug-fix-verifier` — **SOLID**, no findings.
  - *Both directions, three neutralisations, each predicted BEFORE the run and
    matched exactly, each restore blob-hash-verified byte-exact.* (A) the whole
    `member` arm → exactly the 12 cells Phase 1 measured red at HEAD, cell for
    cell. (B) the RECEIVER-proof clause alone → exactly L1, L2, L6, each
    acquiring the predicted false
    `fn-arg-type-mismatch: expected integer, got string`, nothing else moving.
    (C) the provenance bit alone → R15 and u6c only; the verifier derived that
    narrower set from `checkCompatible` ahead of the run and it held, correcting
    the naive "all four fallback bounds red" reading (see Residual 2).
  - *Full suite*: 314 files / 5283 tests green, run twice.
  - *Live, end-to-end, for real*: one additive H8a cell (47 → 48) exercising the
    REGISTRATION consequence through the real production composition root — the
    mistyped-member-read caller does not register while its compatible-argument
    sibling and a precondition control both do — red-proven live under
    neutralisation A (the mistyped theta registered anyway; `Registered:
    ["b190livebroken","b190livectl","b190livegood"]`) and green restored. Full
    H8a 48/48, full H9a 11/11 across both files.
  - *Lint and typecheck*: exit 0 both, using the `package.json` definitions.
  - Two live reds on the verifier's first full H8a pass were attributed, not
    blamed: the bug-0080 cell's 180 s stall and a stochastic sentinel-refusal on
    the typed-query cell, both green on isolated re-run and both in classes this
    surface's diff cannot reach. The orchestrator's own subsequent full H8a run
    came back 48/48 with neither recurring.

- **Residuals** (for the PARENT to file; no bug document is created here):
  1. **Bug 0194's order-dependent suppression now reaches this route.**
     `unprovableBindings` marks `CompatType` nodes by object IDENTITY, and a
     `TypeEnv` alias element marked unprovable at one use suppresses a later true
     positive at another. The member-read route this fix opens into the fn-arg
     sink is subject to that: an unprovable loop over one alias use can suppress
     a true fn-arg mismatch at a later provable use of the same element object.
     NOT fixed here and deliberately not touched — 0194 owns it. Stated because
     this fix widens the input class that reaches it.
  2. **R14 / u6b are held by `checkFnArgCompat`'s deferral, not by the
     provenance bit.** Neutralisation C measured it: with `declaredFieldType`
     ignoring `declared`, R15 and u6c red (their mint `named "Zzz"` RESOLVES
     against a declared alias) while R14 and u6b stay green (their mint
     `named "zzz"` resolves to nothing, so `checkCompatible` answers `"unknown"`
     and the emitter withholds one layer down). The discriminator is whether the
     mint resolves, not merely that the arm fell back. Both bounds are witnessed
     either way; the provenance bit's own isolating witnesses are R15 and u6c.
  3. **`tests/plain-for-loop-variable-element-type.test.ts`'s header ledger.**
     The e4 reclassification was applied here under a bounded self-authorization
     (one enumeration line plus its attribution) because this fix is what made
     the ledger's "holds in both directions" claim false and the file's own
     group-(e) banner already contradicted it. The rest of that ledger is bug
     0126's bookkeeping and was left alone.
  4. **`vehicleSites` in the new witness does not walk `FnDecl.withClause`'s
     expression values.** A `with { model: p.s }` clause could carry a vehicle
     site the site-list precondition would not report. No fixture in the file
     declares a `with` clause, and the site lists are proven non-vacuous by
     probe, so nothing false-passes today. Remedy for whoever next touches the
     file: walk `s.withClause`'s field values in `case "fn"`.
  5. **The sibling harness `binderSites`
     (`tests/plain-for-loop-variable-element-type.test.ts`) still ends both its
     switches with a silent `default: return`** — the pattern this fix's own
     walker had corrected next door. Pre-existing and outside this report's
     authorized sites.
  6. **Conservatism the receiver-proof clause buys.** Where an erased receiver's
     candidate schemas happen to declare the SAME field type, the arm withholds
     and a sound emission is lost. Deliberate: withholding can only ever suppress
     an emission, never manufacture one, which is the asymmetry the whole
     predicate is built on.
  7. **A stale failure-message string in the wired witness's
     `expectOneFnArgMismatch` helper** still says the code "has no emission site
     in `src/` at this HEAD" — false since bug 0050 wired it at 0.77.0.
     Pre-existing, outside §Fix (f)'s authorized sites, and now inherited by the
     new cell u6p on failure. Bug 0134's class.
  8. **Citation drift, disclosed and not chased** (bug 0134's class).
     `static-type-inference.ts` 413 → 459 lines and `type-layer-checks.ts`
     2548 → 2602, so implementation line citations past the edited regions shift
     in this document, in the coordination clauses of bugs 0050 and 0136, in
     sibling reports, and in several committed test-file banners. No citation
     outside this fix's own files was touched.

- **Discharge notes appended:** bug 0136's document (residual 1 discharged by
  this fix); bug 0050's document (its coordination note's "remains this report's
  to fix" clause discharged for the field half).

- **Pinned dispositions / non-goals:** the `method-call` half stays withheld —
  its mint is the METHOD name and its resolution source would be the stdlib
  signature table (bug 0136's §Non-goals). The `call` / `invoke` arm stays
  withheld — the operand a sound judgement needs is the callee's declared RETURN
  type. The absent-field disposition stays a RUNTIME
  `theta/runtime/missing-object-key` panic. The extension-layer sibling
  `collectProvableArgTypes` (`src/extension/invoke-static-checks.ts`) is
  untouched — a different layer and a different set of registry rows. Argument
  arity stays out (bug 0131, cell a1). The imported-callee route stays out (bug
  0138, cell i1). Bug 0191's constraint is INHERITED, not resolved: an enum name
  shadowed by a same-spelled schema still produces an unproven mint at this sink
  (cell L4). Bug 0192's boundary holds: a `params:`-declared receiver still
  defers, verified by probe with real frontmatter (cell S3 covers the
  unannotated-parameter shape). Bug 0194 is not fixed (Residual 1).
