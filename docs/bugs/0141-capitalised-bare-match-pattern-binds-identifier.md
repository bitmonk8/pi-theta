# Bug 0141 — `parsePattern`'s tail arm (`src/parser/theta-document.ts:3935`) returns `{ kind: "identifier", name: t.text }` for any leading `ident` **or `keyword`** token, so a capitalised bare `match` pattern binds the scrutinee instead of naming a declaration: `match 3 { P => P }` binds `P = 3` whether or not `schema P` / `enum P` is declared, `match c { Red => "r", Green => "g" }` answers `"r"` for `C.Green`, and `match Ok(1) { Err => "err-arm", _ => "other" }` answers `"err-arm"` — against `docs/spec_topics/expressions.md:174`'s disambiguation sentence and its `Ok` / `Err` reservation, with every row loading cleanly and registering

- **Status:** fixed (0.146.0). §Fix enumerated four routes and left the crux to
  the run; the run took **route 1 with half 2 included** and recorded the
  adjudication in §Fix (0.146.0) below. Two coordination surfaces stood at filing
  time:
  [0123](./0123-match-pattern-decrement-draws-neighbouring-codes.md) is **open**
  and its routes edit the same function, and
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) is
  **fixed (0.77.0)** with five committed cells that depend on the binding this
  report claims (§Fix (e)).
- **Sev/Diff estimate:** S1/D3 — a theta that loads cleanly and registers
  produces a wrong value with no diagnostic on any channel (measured:
  `match Ok(1) { Err => "err-arm", _ => "other" }` runs the `Err` arm on a
  success; `match c { Red => "r", Green => "g" }` answers `"r"` for `C.Green`),
  which is the S1 band verbatim — inputs the spec refuses accepted with no
  diagnostic, and a value the author's arms did not select. D3 because §Fix
  needs an in-run DIAG-2 adjudication of which code fires (or whether a new
  pattern production is added with its spec-table row), the change lands in
  `parsePattern`, the production bug 0123's routes also edit, and it reds five
  cells of bug 0050's witness landed in this same HEAD.
- **Kind:** defect — implementation, against two written sentences, in three
  elements:
  1. **A capitalised bare identifier binds.**
     `docs/spec_topics/expressions.md:174`: "Disambiguation: lowercase
     identifiers bind, capitalised identifiers refer to constructors or schema
     names." `docs/spec_topics/lexical.md:18` states the same rule from the
     other side and adds `enum`: "Inside `match` patterns the same first-letter
     rule then disambiguates without ambiguity: a lowercase identifier
     introduces a fresh binding, an uppercase identifier refers to an existing
     schema, enum, or constructor in scope." Measured, a capitalised bare
     pattern takes the binding reading both sentences assign to a lowercase
     identifier, and takes it identically whether the name is declared or not.
  2. **`Ok` and `Err` are reserved and bind anyway** — as does every other
     reserved keyword. `expressions.md:174`'s second sentence is "`Ok` and `Err`
     are reserved"; `lexical.md:20` lists `Ok`, `Err`, `Result`, `let` and
     `string` among its 32 reserved words and states "Using one of these in
     identifier position is `theta/parse/reserved-keyword-as-identifier`". That
     code is registered at `docs/spec_topics/diagnostics/code-registry-parse.md:21`
     with a *Trigger* carrying no position qualifier — "Reserved keyword used in
     an identifier position." `parsePattern`'s tail arm admits `t.kind ===
     "keyword"` (`theta-document.ts:3883`) and returns an identifier pattern for
     it, so `Err` binds and matches an `Ok` value.
  3. **The case rule is enforced at the declarator-name positions and this is
     not one of them.** `lexical.md:13` states the enforcement and its purpose in one
     sentence — "The **first letter's case is enforced** by the parser — it is
     what makes case-based pattern disambiguation in `match` work without
     additional grammar". The enforcement lives in the lexer
     (`src/lexer/lexer.ts:810`, `contextualDiagnostics`) and covers `let` /
     `let mut` / `fn` names and `schema` / `enum` names; its own scope note
     (`:806–808`) records that "full identifier-position coverage … is a
     parser-leaf obligation". No parser leaf runs it at a pattern position.
     Measured: `let P = 3` draws `theta/parse/binding-case-mismatch`;
     `match 3 { P => P }` draws nothing.
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, this HEAD, and the origin. Its fix report's residual 7
    records the measurement in one line ("A capitalised bare `match` pattern
    binds as an identifier despite `docs/spec_topics/expressions.md`'s
    disambiguation sentence: `match 3 { P => … }` binds `P`. Measured.") and
    files nothing. **Its fix does not change the binding and does not cause
    it.** What it changed is the type layer's reading: `matchArmScope`
    (`src/parser/type-layer-checks.ts:1189–1213`) now records every pattern
    binder as a withheld twin through `recordWithheldBinders` (`:1181–1187`,
    `WITHHELD_BINDER_TYPE_NAME` at `:387`), so an arm-body read of `P` no longer
    resolves to a same-named `schema P`. That comment block says so in terms
    (`:380–386`): a casing rule "would not do this job … which leaves a `for` /
    `par for` variable and a `match` pattern binder outside it — and an
    uppercase binder colliding with a declared schema is exactly how the
    binder's own spelling was judged nominally". Measured consequence, and this
    report's separation from the collision family: with `schema P = array<integer>`
    declared, `match 3 { P => P.join(",") }` reports `[]` where the
    directly-typed control draws `theta/parse/non-string-array-join`
    (§Reproduction (d)). The binder wins in both layers; nothing resolves to the
    declaration. Five cells of its witness depend on that (§Fix (e)).
  - [0123](./0123-match-pattern-decrement-draws-neighbouring-codes.md) —
    **open**, the same position family and the nearest neighbour. There the
    defect is `parsePattern`'s *recovery* tail (`theta-document.ts:3974–3976`):
    an unrecognised token is consumed as a wildcard, so `--y` in pattern
    position never draws the registered `theta/parse/increment-decrement`.
    **Disjoint defects in one function.** 0123's input reaches the final
    `advance()`-as-wildcard fallback; this report's input never reaches it — a
    capitalised identifier is recognised, and the arm that recognises it is
    `:3883–3935`. The two share the DIAG-2 shape of argument (a registered
    *Trigger* with no position qualifier not firing at a pattern position) and
    they share the function, so whichever fix lands second rebases. 0123 also
    measures the same two-code cascade row g1 (§Expected behaviour) reproduces
    for `C.Red`.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **open**, the sibling
    binder position. A plain `for`'s loop variable is never recorded in the
    type-layer `bindings` map. **Not the same defect and neither fix reaches the
    other**: 0126's binder binds at runtime and is missing from a static map;
    this report's binder binds at runtime where the spec says it must not bind
    at all. They meet at one place only — bug 0050's fix routes both through
    `recordWithheldBinders`, and `lexical.md:15–16` leaves both outside the case
    rule (measured: `for X in [1] { X }` and `par for X in [1] { X }` draw
    nothing, §Reproduction (e)). The `for`-variable case position is not claimed
    here: no spec sentence makes a `for` variable's case a disambiguation.
  - [0136](./0136-member-access-types-as-field-name-not-field-type.md) —
    **open**, the minted-name family, cited for contrast. There a fabricated
    `named` collides with a same-spelled declaration and the declaration is
    adopted as the expression's type. **That mechanism is absent here**: rows
    a3–a5 measure that declaring `schema P { … }`, `schema P = integer` or
    `enum P { A, B }` changes neither the parse nor the value, and rows d1/d3
    measure that the type layer withholds rather than resolving. This is a
    binding the spec forbids, not a name that resolves to the wrong thing.
  - [0139](./0139-fn-parameter-name-case-rule-unenforced.md) — **open**, the
    other unenforced half of the same lexer function. There the `fn` **parameter**
    position is unchecked because `contextualDiagnostics`'s dispatch
    (`lexer.ts:876–886`) reaches three positions only — the `let` / `let mut`
    name, the `fn` name, the `schema` / `enum` name. Row e2 is its measurement.
    **Disjoint defects with a shared enforcement site.** 0139's position is
    named by `lexical.md:16` and its rule is a naming convention; this report's
    position is named by `lexical.md:18` and its rule selects the production, so
    refusing a capitalised pattern head is not a case diagnostic about a binding
    — the head is not supposed to be a binding at all. If 0139's fix widens
    `contextualDiagnostics`, a route here that reuses that path rebases against
    it; routes 1 and 2 below do not touch the lexer.
  - [0084](./0084-increment-decrement-check-dead.md) — **fixed (0.71.0)**, and
    [0102](./0102-params-default-string-literal-raw-newline-admitted.md),
    [0031](./0031-ctor-field-value-typing-unchecked.md) — **fixed**. The GOV-15
    carve-out precedents §Fix (d) reuses: a fix that makes currently-clean
    programs refuse, discharged by a corpus sweep and a real run rather than by
    assumption.
  - [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — **open**,
    and binding on the corpus sweep. `tests/committed-fixture-parse-gate.test.ts`
    filters `.theta` only, so §Reproduction (f)'s 34-file sweep is a scratch
    probe over `git ls-files -- '*.theta' '*.thetalib'`, not a committed gate.
- **Affected** (every citation verified at HEAD `3efdb4ac`, 0.77.0):
  - **The defect site** — `src/parser/theta-document.ts:3883–3936`, the
    `ident` / `keyword` branch of `parsePattern` (declared `:3832`). `:3883` is
    the branch test `if (t.kind === "ident" || t.kind === "keyword")`; `:3886`
    admits `Ok` / `Err` **only when followed by `(`**; `:3894–3929` admits an object
    pattern **only when followed by `{`**; `:3932–3933` returns a wildcard for
    `_`; and `:3935` is the tail:

    ```ts
      // A bare `_` wildcard, else an identifier binding pattern.
      if (t.text === "_") {
        return { kind: "wildcard" };
      }
      return { kind: "identifier", name: t.text };
    ```

    No first-letter test, no keyword test, no `env` and no declaration list in
    scope. `parsePattern` takes no arguments and reads no parser state beyond
    the token cursor.
  - **The two lookahead-gated arms are what the disambiguation sentence
    disambiguates into**, and both require a following token: `:3886`
    (`(t.text === "Ok" || t.text === "Err") && this.isPunct("(")`) and `:3894`
    (`this.isPunct("{")`). A capitalised head with neither follower falls
    through to `:3935`.
  - **The doc comment that enumerates the productions is detached.**
    `:3700–3705` — "Parse one `match` pattern (expressions.md §\"Pattern grammar
    (theta 1.0)\"): wildcard `_`, `Ok(p)` / `Err(p)` constructors, a named/bare
    object pattern `Ident { field: p, … }`, an array pattern `[p, …]`, a literal
    … or an identifier binding" — sits above `tryConsumeArmBodyStatement`
    (`:3714`), not above `parsePattern` (`:3832`), which carries no doc comment.
    Its final clause states the tail arm without the case qualification the
    spec attaches.
  - **The runtime binder** — `src/runtime/match-result.ts:169–179`,
    `matchPattern`. The `identifier` arm is unconditional:

    ```ts
    case "identifier":
      bindings[pattern.name] = value;
      return true;
    ```

    It returns `true` for every `ThetaValue`, so an identifier pattern is a
    catch-all. `evaluateMatch` (`:144–161`) takes the first arm whose pattern
    returns `true` (`:149–152`) and raises `MatchError` only when none does
    (`:160`).
  - **The arm-scope binder** — `src/runtime/statement-executor.ts:1091`
    (`evalMatch`), `:1118` (the `evaluateMatch` dispatch), `:1124–1127` (the
    child environment and `armEnv.defineLocal(name, value, false)`). `false` is
    the mutability flag, matching `bindings.md:31`.
  - **The AST→runtime map** — `statement-executor.ts:1131–1140`
    (`toRuntimePattern`), which carries `{ kind: "identifier", name }` through
    unchanged.
  - **Two other checkers already treat the position as a binding position.**
    `theta-document.ts:3836–3846` runs `checkMutModifier({ position:
    "match-bind" })` (`src/parser/bindings.ts:152`), so `match 3 { mut P => P }`
    draws `theta/parse/mut-on-immutable-context` (`code-registry-parse.md:31`,
    `bindings.md:27–31`). `theta-document.ts:4644–4664`
    (`collectPatternBindings`) adds every pattern binder to the arm-body scope
    at `:4865–4871`, which is why a read of an otherwise-undeclared `Q` inside
    the arm draws no `theta/parse/unknown-identifier` and the same read outside
    it does (§Reproduction (d)). A third use at `:5565–5575` records the binder
    for the shadowed-callable rule (`expressions.md:53`).
  - **The case / reserved-keyword enforcement that does not reach here** —
    `src/lexer/lexer.ts:810` (`contextualDiagnostics`), whose doc comment
    (`:799–808`) scopes it to "declarator-name and control-header positions" and
    records the parser-leaf obligation; `:822` emits
    `theta/parse/reserved-keyword-as-identifier`; `:837` emits
    `theta/parse/binding-case-mismatch`. `:163` is the reserved-word table
    containing `"Ok"` and `"Err"`, which is why those two lex as `keyword` and
    reach `parsePattern`'s `:3883` branch at all.
  - **The type layer, after bug 0050's fix** — `src/parser/type-layer-checks.ts:387`
    (`WITHHELD_BINDER_TYPE_NAME`), `:380–386` (the comment naming the uppercase
    binder / declared schema collision), `:657–679`
    (`collectPatternBinderNames`), `:1181–1187` (`recordWithheldBinders`),
    `:1189–1213` (`matchArmScope`), `:494–502` (the module-header note listing
    "a match-arm binding" among the withheld classes). All five landed at this
    HEAD.
  - **The registration consequence.** `src/extension/production-composition.ts:2045`
    (`hasLoadParseError`) denies registration for any `error`-severity
    `theta/load/*` or `theta/parse/*`. Every row of §Reproduction (a), (b), (c)
    and (d) emits **no diagnostic at all**, so every one of them registers and
    runs.
  - `docs/spec_topics/expressions.md:163` — "**Pattern grammar (theta 1.0).** A
    `match` arm's left-hand side is one of:"; `:167–172` — the six-row table
    (Wildcard, Identifier, Literal, Constructor, Object/schema, Array); `:174` —
    the disambiguation sentence; `:178` — Exhaustiveness ("Not statically
    checked in theta 1.0 … Authors who want a catch-all should add a final
    `_ => ...` arm"); `:180` — Arm syntax; `:53` — the local-binder list, which
    names "a `match` pattern binding" among the forms that "bind locals";
    `:22` — "Enum variant access: `Enum.Variant`" in the supported-expression
    list.
  - `docs/spec_topics/lexical.md:13` — the identifier grammar and the sentence
    making case enforcement the mechanism behind pattern disambiguation; `:15` —
    PascalCase for `schema` names, `enum` names, `enum` variant names, "The
    built-in `Ok`, `Err`, and `Result` follow the same rule"; `:16` —
    lowercase-first for `let` / `let mut` bindings, function parameters,
    function names and schema field names; `:18` — the `match`-pattern
    disambiguation restated with `enum` added; `:20` — the reserved-keyword list
    and `theta/parse/reserved-keyword-as-identifier`.
  - `docs/spec_topics/grammar.md:148` — the spec corpus's Grammar Appendix
    `MatchArm ::= Pattern "=>" ArmBody`. It carries **no** pattern table and no
    disambiguation sentence; `:82` routes the reader to "[Expression
    Sublanguage — Pattern grammar]" for "full destructuring patterns". The table
    and the sentence therefore exist in exactly two places, `expressions.md` and
    the reference mirror.
  - `docs/reference/grammar.md:282` — `MatchArm ::= Pattern "=>" ArmBody`;
    `:291–301` — the mirror pattern table; `:302` — "Lowercase identifiers bind;
    capitalised refer to constructors/schema names."
  - `docs/spec_topics/bindings.md:27–31` — *Immutable contexts*, listing
    "`match` pattern bindings".
  - `docs/spec_topics/runtime-value-model.md:13` — the enum-value row (wire
    string plus interpreter-private tag); `:22` — the cross-type equality rule,
    which states `Severity.Low == "low"` is `false`. Cited for row b5's
    disposition, which this report does not claim (§Non-goals).
  - `docs/spec_topics/diagnostics/code-registry-parse.md:19`
    (`binding-case-mismatch`, `E`, *Trigger*: "Identifier in a binding /
    parameter / fn-name / field-name position does not start with a lowercase
    letter or `_`"); `:21` (`reserved-keyword-as-identifier`, `E`, *Trigger*:
    "Reserved keyword used in an identifier position."); `:31`
    (`mut-on-immutable-context`); `:55` (`statement-in-arm-body`); `:61`
    (`unknown-identifier`); `:75` (`match-arm-type-mismatch`, the second code in
    row g1's cascade). Mirrors without a *Trigger* column:
    `docs/reference/diagnostics.md:65`, `:67`.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; a trigger change is a spec change landing in the same commit);
    `:74` — DIAG-4.
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15; `:9` —
    the loads-cleanly predicate, which **every** row of §Reproduction (a)–(d)
    satisfies; `:25` — the diagnostic-registry carve-out and its
    addition/removal disposition.
  - **Existing coverage: none against this defect, and five cells that depend on
    it.** `rg` over `tests/` finds a bare capitalised `match` pattern in exactly
    one committed file — `tests/fn-arg-type-mismatch-wired.test.ts`, bug 0050's
    witness, at `:735` (`U9_MATCH_BINDER`, asserted `:1618`), `:837–839`
    (`U13_ARM_OBJECT_FIELD_SHADOW`, `:2420`), `:840–842`
    (`U13_ARM_ITERAND_SHADOW`, `:2436`), `:850–852` (`U13MB_ARM_FIELD_MISS`,
    `:2468`) and `:853` (`U13MC_ARM_ITERAND_MISS`, `:2486`). Every one uses `P`
    as a binder *because* it binds, and four of them declare `schema P` in the
    same file to exercise the collision. No test asserts that a capitalised
    pattern should not bind, and no test drives `Ok` or `Err` in bare pattern
    position.
- **Observed at:** `0.77.0` (HEAD `3efdb4ac`). Offline, deterministic; no live
  model, no provider. Parse rows through the production `parseThetaDocument` over
  the shared `parseDoc` harness (`tests/helpers/e2e-s1.ts:39`); runtime rows
  through `parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`, the harness shape
  `tests/non-object-receiver-gate.test.ts:221–292` establishes. Six scratch
  vitest files, run on the outputs quoted below, then deleted. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

## Summary

`parsePattern` classifies a `match` pattern by token kind alone. Its
`ident` / `keyword` branch (`theta-document.ts:3883`) recognises `Ok(` / `Err(`
as a constructor pattern and `Ident {` as an object pattern — both gated on the
*next* token — and returns `{ kind: "identifier", name: t.text }` for everything
else (`:3935`). The first letter is never read, the reserved list is never
consulted, and the file's declarations are not in scope.

`docs/spec_topics/expressions.md:174` fixes the opposite rule: "Disambiguation:
lowercase identifiers bind, capitalised identifiers refer to constructors or
schema names. `Ok` and `Err` are reserved." `lexical.md:18` restates it and adds
`enum`, and `lexical.md:13` names case enforcement as the mechanism that "makes
case-based pattern disambiguation in `match` work without additional grammar".

Measured at HEAD: `match 3 { P => P }` parses with no diagnostic and evaluates to
`3`. Adding `schema P { a: integer }`, `schema P = integer` or `enum P { A, B }`
to the same file changes neither the diagnostics nor the value. The declaration
is not consulted in either layer — bug 0050's fix (0.77.0) now records pattern
binders as withheld twins (`type-layer-checks.ts:1189–1213`), so the type layer
reads the binder too. That fix changed the *reading*; the binding is what it was.

**An identifier pattern is a catch-all** (`match-result.ts:177–179` returns
`true` for every value), so a capitalised arm consumes the whole scrutinee and
every later arm is unreachable. The author-facing shape:

- `enum C { Red, Green }` + `let c = C.Green` + `match c { Red => "r", Green => "g" }`
  evaluates to `"r"`. The `Green` arm never runs.
- `match 3 { P => "cap", _ => "wild" }` evaluates to `"cap"` — the `_` arm
  `expressions.md:178` recommends as the catch-all is dead behind the arm above
  it.

**The reservation is not enforced either.** `Ok` and `Err` lex as keywords
(`lexer.ts:163`) and `parsePattern`'s branch admits `t.kind === "keyword"`, so a
bare `Err` binds: `match Ok(1) { Err => "err-arm", _ => "other" }` evaluates to
`"err-arm"`, while the `Err(e)` control on the same scrutinee evaluates to
`"other"`. `Result`, `string` and `let` behave the same. No
`theta/parse/reserved-keyword-as-identifier` fires at this position, though the
row is registered with a *Trigger* naming no position (`code-registry-parse.md:21`).

Every row above emits **no diagnostic**, so `hasLoadParseError`
(`production-composition.ts:2045`) has nothing to act on: these theta register
and run. The position is already a binding position for two other checkers —
`mut P` draws `theta/parse/mut-on-immutable-context`, and the binder enters the
arm-body scope for `unknown-identifier` — so the pattern binder is recognised as
a binding everywhere except where the case rule would be applied to it. `let P =
3` draws `theta/parse/binding-case-mismatch`; the same name in pattern position
draws nothing.

## Reproduction

Offline, at `3efdb4ac`. Parse rows: the production `parseThetaDocument` through
`parseDoc` (`tests/helpers/e2e-s1.ts:39`), with `---\nmode: prompt\n---\n`
prepended. `codes` is the whole aggregated `diagnostics` code list, unfiltered.
Runtime rows: the production executor harness named in §Observed at; `run` is
`executeBody`'s outcome.

### (a) The bare capitalised pattern binds, declared or not

```
@@ a1  let v = match 3 { P => P } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":3}
@@ a2  [control] let v = match 3 { p => p } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":3}
@@ a3  schema P { a: integer } / let v = match 3 { P => P } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":3}
@@ a4  schema P = integer / let v = match 3 { P => P } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":3}
@@ a5  enum P { A, B } / let v = match 3 { P => P } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":3}
@@ a6  schema P { a: integer } / let v = match "zz" { P => P } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"zz"}
@@ a7  [control] let v = match 3 { _ => 9 } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":9}
```

a1 is the reported row: no diagnostic, and the arm body reads the scrutinee.
a3, a4 and a5 add each of the three declaration kinds `expressions.md:174` and
`lexical.md:18` name as the referent — object schema, alias schema, enum — and
none of them changes anything. a6 shows the pattern is a catch-all rather than a
type test: a `string` scrutinee takes the same arm. a2 is the lowercase form the
spec assigns this behaviour to.

### (b) The catch-all consequence — later arms are unreachable

```
@@ b1  let v = match 3 { P => "cap", _ => "wild" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"cap"}
@@ b2  let v = match 3 { P => "cap", 3 => "lit" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"cap"}
@@ b3  [control] let v = match 3 { 4 => "lit", P => "cap" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"cap"}
@@ b4  enum C { Red, Green } / let c = C.Green / let v = match c { Red => "r", Green => "g" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"r"}
@@ b5  enum C { Red, Green } / let c = C.Green / let v = match c { "Red" => "r", "Green" => "g", _ => "x" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"x"}
@@ b6  enum C { Red, Green } / let v = match "Green" { Red => "red-arm", _ => "other" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"red-arm"}
```

**b4 is the author-facing row.** The scrutinee is `C.Green`, the arms are
spelled with the enum's own variant names, and the answer is the `Red` arm's.
b1 and b2 show the same shape against the two forms `expressions.md:178`
recommends: a trailing `_` catch-all and a literal arm are both dead behind a
capitalised arm, with no unreachable-arm diagnostic (theta 1.0 performs no
exhaustiveness analysis, `:178`, and none is claimed here). b3 orders the arms
the other way and still reaches the capitalised arm, because the literal `4`
fails first. b6 drops the enum entirely: the capitalised name matches a plain
string.

b5 is recorded as measured and **not claimed as a defect here**: the literal-arm
spelling does not match an enum value either, which follows from
`runtime-value-model.md:22` (`Severity.Low == "low"` is `false`). Its effect is
that b4's author has no admitted pattern form that tests an enum variant
(§Non-goals).

### (c) `Ok` / `Err` and the other reserved keywords bind

```
@@ c1  let v = match Ok(1) { Err => "err-arm", _ => "other" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"err-arm"}
@@ c2  [control] let v = match Ok(1) { Err(e) => "err-arm", _ => "other" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"other"}
@@ c3  let v = match Ok(1) { Ok => "ok-arm", _ => "other" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"ok-arm"}
@@ c4  [control] let v = match Ok(1) { Ok(x) => "ok-arm", _ => "other" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"ok-arm"}
@@ c5  let v = match 3 { Result => 1, _ => 2 } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":1}
@@ c6  let v = match 3 { string => 1, _ => 2 } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":1}
@@ c7  let v = match 3 { let => 1, _ => 2 } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":1}
@@ c8  let v = match Err(1) { Ok => "ok-arm", _ => "other" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"ok-arm"}
@@ c9  [control] let v = match Err(1) { Ok(x) => "ok-arm", _ => "other" } / v
   codes :: []
   run   :: outcome=success result={"present":true,"value":"other"}
```

**c1 against c2 and c8 against c9 are the sharpest pairs in this report.** One
parenthesised payload decides whether the `Err` arm runs on a success (c1) and
whether the `Ok` arm runs on a failure (c8). c3 answers `"ok-arm"` for the same
reason: the bare form matches everything, so it agrees with the constructor form
(c4) on this scrutinee and disagrees on the other one (c8 against c9). c5–c7
show the branch admits the whole reserved list, not only `Ok` / `Err`;
`theta/parse/reserved-keyword-as-identifier` fires at none of them.

The bound name is also unreadable in the arm body: `match Ok(1) { Ok => Ok, _ =>
Ok(9) }` evaluates to `null`, because a bare `Ok` in *value* position takes the
keyword-in-value-position path (`theta-document.ts:3522–3527`: "a bare `Ok` /
`Err` is not a first-class value"). The pattern position binds a name the
expression position cannot read.

### (d) The position is a binding position for every other checker

```
@@ d1  schema P = array<integer> / let v = match 3 { P => P.join(",") } / v
   codes :: []
@@ d2  [control] let y: array<integer> = [1] / let v = y.join(",") / v
   codes :: ["theta/parse/non-string-array-join"]
   msgs  :: ["array.join requires a string element type; got array<integer>"]
@@ d3  schema P { a: integer } / let v = match 3 { P => P.frobnicate() } / v
   codes :: []
@@ d4  [control] schema P { a: integer } / fn f(p: P) { p.frobnicate() } / f(P { a: 1 })
   codes :: ["theta/parse/unknown-method"]
   msgs  :: ["unknown method 'frobnicate' on type P"]
@@ d5  let v = match 3 { mut P => P } / v
   codes :: ["theta/parse/mut-on-immutable-context"]
   msgs  :: ["'mut' is not permitted in this binding position"]
@@ d6  let v = Q / v
   codes :: ["theta/parse/unknown-identifier"]
   msgs  :: ["unknown identifier 'Q'"]
@@ d7  let v = match 3 { Q => Q } / v
   codes :: []
@@ d8  let v = match 3 { P => P } / let w = P / w
   codes :: ["theta/parse/unknown-identifier"]
@@ d9  schema P { a: integer } / let v = match 3 { P => P { a: 7 } } / v.a
   codes :: []
   run   :: outcome=success result={"present":true,"value":7}
```

d1 and d3 pin bug 0050's fix from this side: with a declaration whose name the
binder shadows, the type layer withholds instead of resolving, so the gates that
fire on the directly-typed controls (d2, d4) are silent. **No collision, in
either direction** — this is not bug 0136's mechanism.

d5 and d7 are the two checkers that already treat the pattern position as a
binding position: `checkMutModifier` at `theta-document.ts:3840` refuses `mut`
there per `bindings.md:31`, and `collectPatternBindings` (`:4644`) puts the name
in the arm-body scope, which is why d7 draws nothing where d6 does. d8 shows the
scope closes at the arm, correctly.

d9 is the incoherence in one line: inside the arm, `P` as a value read is the
binder and `P { a: 7 }` as a constructor is the schema. One name, one scope, two
resolutions.

### (e) The case rule across six binder positions

```
@@ e1  let P = 1 / P                                   codes :: ["theta/parse/binding-case-mismatch"]
@@ e2  fn f(P: integer): integer { P } / f(1)          codes :: []
@@ e3  for X in [1] { X } / 1                          codes :: []
@@ e4  par for X in [1] { X } / 1                      codes :: []
@@ e5  let v = match 3 { P => P } / v                  codes :: []
@@ e6  schema S { a: integer } / let s = S { a: 1 } / let v = match s { S { a } => a } / v
                                                       codes :: []
```

e1 is the enforcement working (`lexer.ts:837`). e2 is
[0139](./0139-fn-parameter-name-case-rule-unenforced.md)'s subject — an
uppercase `fn` parameter, a position `lexical.md:16` names explicitly, and bug
0050's fix-report residual 5. e3 and e4 are the `for` / `par for` variable,
which `lexical.md:16` does not name. **e5 is this report**, and it differs from
e2–e4 in kind: at a pattern position the first letter is not a naming
convention, it is the production selector (`lexical.md:13`). e6 is the object
pattern's field shorthand, which binds a lowercase field name and is unaffected.

### (f) The committed corpus at HEAD — the GOV-15 baseline

All 34 tracked `.theta` and `.thetalib` files, each parsed through the real
`parseThetaDocument` and scanned for an arm whose pattern is a bare capitalised
identifier (`/^\s*([A-Z][A-Za-z0-9_]*)\s*=>/`):

```
@@ FILES :: 34
@@ BARE-CAP-ARM HITS :: []
```

**Measured corpus blast radius: zero.** The sweep is a scratch probe over
`git ls-files -- '*.theta' '*.thetalib'` because the committed-fixture gate
cannot walk `.thetalib` (bug 0132). It bounds the *corpus* half of the GOV-15
sweep only; §Reproduction (a)–(d)'s programs load cleanly today and would refuse
under §Fix routes 1–3 (§Fix (d)).

## Expected behaviour

**Two normative sentences forbid the binding reading, and the reference mirror
restates one of them.** `expressions.md:174`:

> Disambiguation: lowercase identifiers bind, capitalised identifiers refer to
> constructors or schema names. `Ok` and `Err` are reserved.

`lexical.md:18`:

> Inside `match` patterns the same first-letter rule then disambiguates without
> ambiguity: a lowercase identifier introduces a fresh binding, an uppercase
> identifier refers to an existing schema, enum, or constructor in scope.

`docs/reference/grammar.md:302` mirrors the first. The sentences are not
decoration on the
grammar table: `lexical.md:13` states that the case enforcement "is what makes
case-based pattern disambiguation in `match` work **without additional
grammar**". The disambiguation is the whole mechanism by which a capitalised
pattern head is meant to be told apart from a binder, and it is not implemented
at any layer — `parsePattern` reads token kinds, `matchPattern` binds whatever
the parser produced, and `contextualDiagnostics` never visits a pattern.

**What the capitalised head is supposed to refer to is partly prospective, and
this report says which part.** The grammar table admits six pattern forms
(`expressions.md:167–172`, `docs/reference/grammar.md:296–301`). Two have a
capitalised head:

- **Constructor** — `Ok(p)` / `Err(p)`, "the named `Result` variant". Real, and
  gated on a following `(` at `theta-document.ts:3886`.
- **Object/schema** — `QueryError { kind: "validation", … }`. Real, and gated on
  a following `{` at `:3894`.

Both referents the sentence names therefore require a token after the head, and
**no production in either table admits a capitalised head with nothing after
it**. `lexical.md:18`'s third referent — `enum` — has no pattern row at all:
there is no variant pattern in the table, and the qualified spelling does not
parse as a pattern either. Measured:

```
@@ g1  enum C { Red, Green } / let v = match "Red" { C.Red => 1, _ => 2 } / v
   codes :: ["theta/parse/match-arm-type-mismatch","theta/parse/statement-in-arm-body"]
```

`C.Red` is consumed by `parsePattern`'s one-token recovery and the arm collapses
into the two-code cascade bug 0123 reports for `--y`. So `lexical.md:18`'s
`enum` clause is **prospective** relative to theta 1.0's pattern grammar, while
its `schema` and `constructor` clauses are **real but lookahead-gated**. The
consequence for this report is the same either way: a bare capitalised pattern
is a form the grammar table does not admit, and the implementation resolves it
as the one reading both sentences assign to a *lowercase* identifier.

**The `Ok` / `Err` half needs no adjudication.** They are reserved keywords
(`lexical.md:20`), `lexical.md:15` restates the PascalCase rule for them
explicitly, and `expressions.md:174` names the reservation in the same sentence
as the disambiguation. `theta/parse/reserved-keyword-as-identifier` is
registered with a *Trigger* that carries no position qualifier —
"Reserved keyword used in an identifier position." (`code-registry-parse.md:21`)
— and `parsePattern:3935` puts the keyword's text into `name`, which is an
identifier position by construction. The disposition is bug 0084's: a registered
row whose *Trigger* covers the input and whose emitter is not reached from it.
Row c1's answer is the argument that this is not a formality: an author's `Err`
arm runs on a success.

**The runtime disposition follows from the parse.** `match-result.ts:177–179` is
correct for the node it is given — an identifier pattern is a catch-all, which
is what `expressions.md:168` says an Identifier pattern is. Nothing in
`matchPattern` should test case; the node it receives should not have been an
identifier pattern.

**GOV-15 ranges over every affected input, in the addition direction.** Every
row of §Reproduction (a)–(d) emits no `E` and therefore satisfies the
loads-cleanly predicate (`source-language-stability.md:9`). A fix that draws a
diagnostic on them changes observable (b) for inputs that previously emitted
nothing, which `:25` disposes as a carve-out-covered **addition** — in scope for
a theta 1.x minor, on the same footing as bugs 0031, 0084 and 0102. A fix that
changes only the *value* (route 3 below, giving the capitalised head a referent
so the arm stops matching) changes observable (a) on those inputs and is
**not** covered by the registry carve-out; that route's GOV-15 argument has to
be made separately.

## Actual behaviour / root cause

**One tail arm, reached by two token kinds, with no test to fail.**
`parsePattern` (`theta-document.ts:3832`) is a token-kind dispatch: `number` and
`string` become literals, `[` an array pattern, the `true` / `false` / `null`
keywords literals, and a leading `{` a bare object pattern (`:3937–3973`). The
`ident` / `keyword` branch (`:3883`) makes exactly two lookahead tests — `(`
after `Ok` / `Err` (`:3886`), `{` after any head (`:3894`) — before the tail at
`:3931–3935`, which
tests `_` and otherwise returns an identifier pattern. The function is a method
on the parser but reads no parser state other than the cursor: it receives no
declaration list, no `TypeEnv` and no scope, so it could not resolve a
capitalised head against the file even if it tested the first letter.

**Admitting `keyword` at `:3883` is what carries `Ok` / `Err` past the
reservation.** They are in the lexer's reserved table (`lexer.ts:163`), so they
arrive as `keyword` tokens, and the branch that would refuse a keyword in an
identifier position is in the lexer, scoped to declarator-name and control-header
positions by its own doc comment (`:799–808`). Its `checkName` helper (`:814`)
emits `reserved-keyword-as-identifier` at `:822` and `binding-case-mismatch` at
`:837` — the two codes that would close both halves of this report — and it is
called only for `let` / `let mut` / `fn` / `schema` / `enum` name positions. The
scope note names the gap: "full identifier-position coverage (every reserved
word in every identifier slot) is a parser-leaf obligation".

**The runtime binds what it is given.** `evalMatch`
(`statement-executor.ts:1091`) maps the parsed pattern through
`toRuntimePattern` (`:1131`) and dispatches with `evaluateMatch`
(`match-result.ts:144`), which takes the first arm whose `matchPattern` returns
`true`. The `identifier` arm (`:177–179`) writes the binding and returns `true`
unconditionally — no type test, no shape test — so it is a catch-all by
construction, and the selected arm's bindings are defined into a child scope at
`statement-executor.ts:1124–1127`. Every measured value in §Reproduction follows
from those five lines plus arm order.

**Three checkers agree the position binds; the fourth never looks.**
`checkMutModifier` refuses `mut` at `match-bind` (`theta-document.ts:3836–3846`),
`collectPatternBindings` seeds the arm-body scope for `unknown-identifier`
(`:4644–4664`, used at `:4865–4871`) and the shadowed-callable rule
(`:5565–5575`), and after bug 0050's fix `collectPatternBinderNames` /
`matchArmScope` (`type-layer-checks.ts:657–679`, `:1189–1213`) record the binder
as a withheld twin so the type layer stops judging a read against a same-named
schema. That fix's own comment (`:380–386`) states the premise this report
files against: the casing rule "would not do this job … which leaves a `for` /
`par for` variable and a `match` pattern binder outside it". That is an accurate
description of `lexical.md:16`, whose four listed positions do not include a
pattern binder — because `lexical.md:18` governs the pattern position instead,
with a stronger rule than a naming convention.

**The type layer's alignment is not a bound on the defect.** Bug 0050's
withholding removes the *diagnostic* half of a collision (d1, d3 are silent) and
leaves the *value* half untouched: the binder still binds, the arm still
matches, and the answer is still the first arm's. Rows a3–a5 measure that the
declaration is inert in both layers.

## Why it matters

- **A registering theta answers with an arm the author did not select.** c1's
  `Err` arm runs on `Ok(1)`; b4's `Red` arm runs on `C.Green`. No diagnostic
  fires on any channel, `hasLoadParseError` has nothing to act on
  (`production-composition.ts:2045`), and the value flows on.
- **The failure is silent in the direction authors do not check.** b4's answer
  is *correct* when the scrutinee happens to be `C.Red` and wrong otherwise, so
  a test that exercises one variant passes. c3 against c8 has the same property:
  the bare `Ok` arm agrees with `Ok(x)` on a success and disagrees on a failure.
- **One parenthesised payload separates the two readings.** c1/c2, c8/c9 and
  c3/c4 differ only by that payload; a1/a2 differ only by the first letter's
  case. The
  language's stated mechanism for telling them apart (`lexical.md:13`) is not
  implemented, so the difference is invisible until runtime.
- **The catch-all silently voids the recommended catch-all.** `expressions.md:178`
  tells authors to add a final `_ => ...` arm. b1 measures that arm becoming
  dead code behind a capitalised arm above it, with no unreachable-arm
  diagnostic to say so.
- **Two spec corpora carry the rule and neither is enforced.**
  `expressions.md:174`, `lexical.md:13` / `:18` and
  `docs/reference/grammar.md:302` all state
  it. A reader of any of the three writes `match c { Red => …, Green => … }`,
  which is exactly b4.
- **Nothing in the suite scores it, and five committed cells depend on the
  current behaviour.** No test drives `Ok` / `Err` in bare pattern position or
  asserts that a capitalised pattern must not bind; bug 0050's witness uses the
  binding in five cells (`tests/fn-arg-type-mismatch-wired.test.ts:735`,
  `:839`, `:842`, `:852`, `:853`) to exercise a collision that only exists
  because the pattern binds.

## Non-goals

- **Enum-value equality against a string literal.** Row b5 measures that
  `match c { "Green" => … }` does not select on `c = C.Green`, which follows
  from `runtime-value-model.md:13` (an enum value carries a tag) and `:22`
  (`Severity.Low == "low"` is `false`). Whether a *literal pattern* uses the
  same relation as `==` is not stated at `expressions.md:169` ("structural
  equality") and is not adjudicated here. It matters only as context: closing
  this report leaves b4's author with no admitted pattern form that tests a
  variant, which is a grammar question (§Fix route 3), not this defect.
- **Adding an enum-variant pattern production.** `C.Red` does not parse as a
  pattern (row g1) and no table row admits it. Introducing one is a spec edit
  with its own table row and its own witness; it is named in §Fix route 3 as one
  way to give the capitalised head a referent, not claimed here.
- **Static exhaustiveness / unreachable-arm analysis.** `expressions.md:178`
  excludes it from theta 1.0 deliberately and gives the reason. Rows b1–b3 are
  cited for what the arm *matches*, not for the absence of an unreachable-arm
  diagnostic.
- **The uppercase `fn` parameter (e2) and the uppercase `for` / `par for`
  variable (e3, e4).** Separate positions with separate spec standing — e2 is
  [0139](./0139-fn-parameter-name-case-rule-unenforced.md), from bug 0050's
  fix-report residual 5; e3/e4 sit outside
  `lexical.md:16`'s list, and no sentence makes their case a disambiguation.
  They are measured here to bound the class.
- **`parsePattern`'s one-token recovery tail** (`:3974–3976`). That is bug
  0123's subject, reached by inputs this report's rows never reach. Row g1 is
  cited for what `C.Red` does, not to claim the recovery.
- **The array pattern's element behaviour.** Measured, `match [1, 2] { [A, B] =>
  A + B }` and the lowercase `[a, b]` spelling behave identically (both raise
  `MatchError`), so nothing in this report turns on array-element patterns, and
  the identical behaviour of the two spellings shows the capitalisation is not
  the cause there.
- **Bug 0050's withholding.** d1/d3 measure it working. A fix here does not
  change what the type layer does with a binder it is given; if a capitalised
  pattern stops being a binder, the withheld entry stops being created for that
  name, which is a consequence to record, not a change to that mechanism.

## Fix

**Not settled.** Four routes, with their consequences. (a) names the halves,
(b) enumerates the routes, (c) states the DIAG-2 reading, (d) the GOV-15
posture, (e) the coordination and the constraints.

**(a) Two halves, separable.**

1. **The capitalised bare pattern** (rows a1, a3–a6, b1–b4, b6, d1, d3, d5, d7,
   d9). Governed by `expressions.md:174` / `lexical.md:18`; needs a decision
   about what the head means.
2. **The reserved keyword in pattern position** (rows c1, c3, c5–c8). Governed
   by `lexical.md:20` and the registered *Trigger* at
   `code-registry-parse.md:21`; needs no new row and no new production —
   `reserved-keyword-as-identifier` already covers it, and the only question is
   where the emitter is called from. A fix closing half 1 by case alone closes
   `Ok`, `Err` and `Result` incidentally (all PascalCase) and leaves `string`,
   `let` and the other lowercase keywords (c6, c7) open, so the two halves are
   not co-extensive and each must be stated in or out.

**(b) Four routes for half 1.**

1. **Refuse at the parser.** `parsePattern`'s tail (`:3935`) tests the first
   letter and, for an uppercase head with no `(` and no `{`, emits instead of
   returning an identifier pattern. Question this route must answer: **which
   code**. `binding-case-mismatch` (`code-registry-parse.md:19`) is the closest
   registered row, but its *Trigger* enumerates positions — "a binding /
   parameter / fn-name / field-name position" — and a pattern head that the
   spec says is *not* a binding is arguably outside it, so using it is a DIAG-2
   *Trigger* edit landing in the same commit. Its message ("binding name must
   start with a lowercase letter or `_`") also describes the wrong repair for an
   author who meant a variant test. A new registered row states the actual
   condition (a capitalised pattern head naming no admitted production) at the
   cost of a registry addition plus its `docs/reference/diagnostics.md` mirror.
   Consequence: the arm stops matching, so b4 and c1 refuse rather than
   answering — observable (b) changes, observable (a) becomes unreachable.
2. **Refuse at a parser leaf outside `parsePattern`.** The pattern node already
   flows through `collectPatternBindings` (`:4644`) and, in the type layer,
   `collectPatternBinderNames` (`type-layer-checks.ts:657`), either of which
   could carry the check without touching the production bug 0123's routes edit.
   Costs: the pattern node carries no `range` (`theta-document.ts:5566` records
   this — "A pattern node carries no range; the arm's BODY starts on the arm's
   own line"), so a diagnostic emitted downstream cannot point at the pattern
   without a node change; and a type-layer emission would make the code
   `type`-phase rather than `parse`-phase, which the registry column records.
3. **Give the capitalised head a referent.** Add a pattern production for a bare
   capitalised name — resolving against the file's declarations as a schema /
   enum-variant test — with its row in `expressions.md:167–172` and
   `docs/reference/grammar.md:296–301`, and refuse the binding reading. This is
   the route that
   makes b4 *work* rather than refuse, and the only one that gives an author a
   variant test at all (b5 shows the literal spelling does not select on an enum
   value). Costs: it is a language addition under DIAG-2 plus a grammar table
   edit, it needs a resolution rule for a capitalised name that resolves to
   nothing, and it changes observable (a) on currently-clean inputs — the one
   route the diagnostic-registry carve-out does not cover (§(d)).
4. **Narrow the spec to the implementation.** Delete or qualify
   `expressions.md:174`, `lexical.md:18` and `docs/reference/grammar.md:302`,
   admitting that a
   capitalised bare pattern binds. Costs: `lexical.md:13`'s "it is what makes
   case-based pattern disambiguation in `match` work without additional grammar"
   also goes, and the corpus loses the only rule distinguishing `Err` from
   `Err(e)` — row c1 becomes specified behaviour. This route is stated for
   completeness; the report does not recommend among the four.

**(c) The DIAG-2 reading.** Routes 1 and 2 add a code emission on inputs that
emit nothing today: DIAG-2 (`diagnostic-shape.md:72`) makes the *Trigger* edit
land in the same commit, with the `docs/reference/diagnostics.md` mirror updated
only if a row is added or removed (the mirrors carry no *Trigger* column,
`docs/reference/diagnostics.md:65`, `:67`). Half 2 is the narrowest:
`reserved-keyword-as-identifier`'s
*Trigger* already covers a keyword in an identifier position with no
qualifier, so wiring it here is implementation conformance, not a registry edit
— the posture bug 0084's fix took for the same shape. No *Message* is reworded
by any route, so DIAG-4 is not engaged.

**(d) GOV-15.** Every affected input loads cleanly today
(`source-language-stability.md:9`), so the promise ranges over them. Routes 1
and 2 are **additions** under the diagnostic-registry carve-out (`:25`) — in
scope for a theta 1.x minor, on the 0031 / 0084 / 0102 precedent. Route 3
changes observable (a) — the returned value — on inputs that keep loading
cleanly, which the carve-out does not cover; it needs its own argument. Measured
corpus blast radius is **zero** across 34 tracked files (§Reproduction (f)); a
fix re-measures rather than citing this, and the sweep is a scratch probe until
bug 0132 lands.

**(e) Coordination and constraints**, each with a witness row above.

- **Bug 0050's five cells red by design.**
  `tests/fn-arg-type-mismatch-wired.test.ts:735` (`U9_MATCH_BINDER`, asserted
  `:1618`), `:837–839` (`:2420`), `:840–842` (`:2436`), `:850–852` (`:2468`),
  `:853` (`:2486`) all use `P` as a pattern binder, four of them against a
  declared `schema P`. Under routes 1–3 those sources stop binding. Each cell
  must be restated with its reason — the withheld-binder behaviour they pin is
  still owed, and the natural restatement is the lowercase spelling, which
  exercises the same `matchArmScope` path (`type-layer-checks.ts:1189–1213`).
  Deleting them removes coverage bug 0050's fix landed in this same HEAD.
- **Bug 0139 shares the enforcement site, not the rule.** Its fix widens
  `contextualDiagnostics`'s dispatch (`lexer.ts:876–886`) to a fourth position.
  A route here that adds the pattern position to that dispatch rebases against
  it and inherits its GOV-15 discharge; routes 1 and 2 land in the parser and do
  not. Whichever route is taken, the two must not both claim the pattern
  position — 0139's is `lexical.md:16`'s four positions, none of which is a
  pattern head.
- **Bug 0123 shares the function.** Its routes edit `parsePattern`'s recovery
  tail (`:3974–3976`); route 1 here edits the arm above it (`:3931–3935`).
  Whichever lands second rebases; neither closes the other (0123's input is
  `--y`, which never reaches `:3935`).
- **Lowercase binders keep binding, and every other production is unchanged.**
  a2, a7, e6 and d5–d8 are the pins: the lowercase identifier pattern, the
  wildcard, the object pattern's field shorthand, the `mut` refusal, the
  arm-body scope for `unknown-identifier`, and the scope closing at the arm.
- **`Ok(p)` / `Err(p)` and `Schema { … }` keep working.** c2, c4 and c9 are the
  constructor pins; d9's constructor half and `theta-document.ts:3886` / `:3894`
  are the gated arms a case test must not disturb.
- **The type layer follows the production.** If a capitalised head stops being a
  binder, `collectPatternBinderNames` (`type-layer-checks.ts:657–679`) stops
  seeing that name and `matchArmScope` creates no withheld entry for it. That
  is a consequence to state, and d1 / d3 are the rows that measure it today.
- **Half 2 is stated in or out.** c6 and c7 (`string`, `let`) are not closed by
  a case test; c1, c3, c5 and c8 are, since `Ok`, `Err` and `Result` are
  PascalCase. A route closing only the capitalised half says so.

**Witness — offline, provider-free.** Parse rows settle inside one `parseDoc`
call and runtime rows inside one `executeBody`, so the harness is the shape
`tests/non-object-receiver-gate.test.ts:221–292` establishes, in a new file.
Required rows: (a) all seven, a2 and a7 being the controls that prove the
lowercase and wildcard forms are untouched and a3–a5 the three declaration kinds;
(b) b1–b4 and b6, b4 asserted on its *value* (the row a diagnostic-only fix
leaves observable); (c) all nine with c2/c4/c9 as the constructor controls, c1
and c8 asserted in both directions; (d) all nine, d2/d4/d6 being the controls; (e) all
six, as the position inventory that reds if a fix widens the case rule past the
pattern position; (f) the corpus sweep as an anti-regression gate. One further
row is owed that no group above supplies: an assertion that a capitalised
pattern head **followed by `(` or `{`** still parses as a constructor / object
pattern, so a case test added at `:3935` cannot creep upward into `:3886` /
`:3894`. No live tier applies — nothing on this path crosses a provider, and
every observable is determined inside one parse and one `executeBody`.

## Provenance

- **Origin:** bug 0050's fix report (`.pi/tmp/fixes/0050-report.md`, §Residuals
  item 7), measured during that fix and filed nowhere: "A capitalised bare
  `match` pattern binds as an identifier despite
  `docs/spec_topics/expressions.md`'s disambiguation sentence:
  `match 3 { P => … }` binds `P`. Measured." This report adds what that line
  does not state: the exact sentence and its two corpus twins
  (`expressions.md:174`, `lexical.md:13` / `:18`,
  `docs/reference/grammar.md:302`); the
  reserved-keyword half (rows c1–c9), the `Err`-arm-on-`Ok` and `Ok`-arm-on-`Err`
  consequences; the catch-all consequence and the enum-match row (b1–b4, b6); the
  three declaration kinds measured inert (a3–a5); the separation from bug 0136's
  collision family via bug 0050's own withholding (d1–d4); the position
  inventory (e1–e6); the corpus sweep; and the four routes with their DIAG-2 /
  GOV-15 dispositions.
- **Evidence:** six scratch vitest files at `3efdb4ac` — parse rows through
  `parseDoc` (`tests/helpers/e2e-s1.ts:39`) over the shipped
  `parseThetaDocument`, runtime rows through the production executor harness
  (`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`);
  every cell of groups (a)–(f) measured and quoted verbatim above; written, run,
  deleted. The corpus sweep parsed all 34 files `git ls-files -- '*.theta'
  '*.thetalib'` reports.
- **Implementation, at `3efdb4ac`:** `src/parser/theta-document.ts:3832`
  (`parsePattern`), `:3836–3846` (the `mut` check), `:3883` (the
  `ident` / `keyword` branch), `:3886–3892` (the `Ok` / `Err` constructor arm),
  `:3894–3929` (the object-pattern arm), `:3931–3935` (the wildcard / identifier
  tail), `:3937–3973` (the bare object-pattern arm), `:3974–3976` (the recovery
  tail, bug 0123's site), `:3700–3705` (the detached doc comment),
  `:3522–3527` (bare `Ok` / `Err` in value position),
  `:4644–4664` and `:4865–4871` (`collectPatternBindings` and the arm scope),
  `:5565–5575` (the shadowed-callable use);
  `src/runtime/match-result.ts:144–161` (`evaluateMatch`), `:169–179`
  (`matchPattern`, the identifier arm `:177–179`);
  `src/runtime/statement-executor.ts:1091` (`evalMatch`), `:1118`, `:1124–1127`,
  `:1131–1140` (`toRuntimePattern`); `src/lexer/lexer.ts:163` (the reserved
  table), `:799–808` (the scope note), `:810` (`contextualDiagnostics`), `:822`,
  `:837`; `src/parser/type-layer-checks.ts:380–386`, `:387`, `:494–502`,
  `:657–679`, `:1181–1187`, `:1189–1213`;
  `src/extension/production-composition.ts:2045` (`hasLoadParseError`).
  Provenance check on the type-layer citations: `git log -S` reports
  `matchArmScope` and `WITHHELD_BINDER_TYPE_NAME` both introduced at `3efdb4ac`
  (bug 0050's fix, 0.77.0) — they are this HEAD's, and they change the type
  layer's reading of a pattern binder, not the binding.
- **Spec, at `3efdb4ac`:** `docs/spec_topics/expressions.md:22`, `:53`, `:163`,
  `:167–172`, `:174`, `:178`, `:180`; `docs/spec_topics/lexical.md:13`, `:15`,
  `:16`, `:18`, `:20`; `docs/spec_topics/grammar.md:82`, `:148`;
  `docs/reference/grammar.md:282`, `:291–301`, `:302`;
  `docs/spec_topics/bindings.md:27–31`;
  `docs/spec_topics/runtime-value-model.md:13`, `:22`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:19`, `:21`, `:31`, `:55`,
  `:61`, `:75`; `docs/reference/diagnostics.md:65`, `:67`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`.

## Coordination note — bug 0139 (0.79.0) moved three of the cells above

Bug [0139](./0139-fn-parameter-name-case-rule-unenforced.md) shipped in
0.79.0. It enforces `lexical.md:16`'s lowercase-first rule at the `fn`
PARAMETER position, emitting `theta/parse/binding-case-mismatch` on the
parameter-name token, and that reaches three of the five cells §Affected names
as "cells that depend on it":

- `u13b` (`U13_FOR_IN_PARAM_SHADOW`), `u13c` (`U13_ARM_OBJECT_FIELD_SHADOW`)
  and `u13d` (`U13_ARM_ITERAND_SHADOW`) in
  `tests/fn-arg-type-mismatch-wired.test.ts` each declare `fn h(P: …)`, so the
  parameter's own spelling now draws the case code. Under operator
  authorization each cell's `expect(doc.diagnostics).toEqual([])` became an
  ORDERED WHOLE-LIST equality over exactly one fully-specified
  `binding-case-mismatch` diagnostic — registry-sourced message per DIAG-4,
  ranged on the parameter name token (u13b `range(5,6,5,7)`, u13c
  `range(6,6,6,7)`, u13d `range(5,6,5,7)`).
- The cells' original pin is unchanged in substance and STRENGTHENED in form:
  each still proves no TYPE-LAYER verdict is produced, and now proves it by
  naming precisely what the list contains rather than by emptiness, so any
  verdict would be an extra element and red the cell.
- `u9c` (`U9_MATCH_BINDER`, §Affected's fourth citation), `U13MB_ARM_FIELD_MISS`
  and `U13MC_ARM_ITERAND_MISS` were NOT touched. Their assertions are
  unchanged.

**What this means for 0141's routes.** Any route here that re-pins those three
cells' diagnostic lists must rebase on the post-0139 expectation rather than on
`toEqual([])`. A route that adds a second registered code at the capitalised
bare pattern will find u13b–u13d already carrying one diagnostic, and the list
is order-sensitive: `assembleDiagnostics` sorts by (file, line, column) with a
stable sort, and the parameter token precedes the arm binder in every one of
the three fixtures.

The fixtures themselves are untouched — `P` still binds, and the `schema P`
collision each cell exercises is intact. Lowercasing the parameters was
considered and rejected as a semantic weakening of the shadowing premise these
cells exist to test.

## Fix (0.146.0)

**Route adjudication.** §Fix left the crux to the run. The run takes **route 1
(refuse at the parser, in `parsePattern`'s tail arm) with half 2 included**, and
half 1 draws a **new registered row** rather than reusing
`theta/parse/binding-case-mismatch`. Reasons, in order: that row's *Trigger*
enumerates positions and a pattern head is, by the two sentences this report
files against, not a binding position, so reusing it is a DIAG-2 *Trigger* edit
on a row four committed witnesses pin; its *Message* names the wrong repair for
an author who meant a variant test; and a registry **addition** is exactly what
the GOV-15 carve-out (`source-language-stability.md:25`) covers, on the
0031 / 0084 / 0102 precedent. Route 3 (a referent for the capitalised head) is
declined here: it is a language addition with its own grammar-table row, and it
changes observable (a) on currently-clean inputs, the one direction the
carve-out does not cover. Route 4 is declined as it deletes
`lexical.md:13`'s mechanism sentence. Half 2 needs no registry edit:
`reserved-keyword-as-identifier`'s *Trigger* carries no position qualifier, so
wiring it at this position is implementation conformance (bug 0084's posture).

- **What shipped:**
  - `src/parser/theta-document.ts` — `parsePattern`'s tail arm, after the
    `_` wildcard test and *after* both lookahead-gated arms, refuses a pattern
    head twice over: a `keyword`-kind head draws
    `theta/parse/reserved-keyword-as-identifier` (half 2, any case, so `string`
    and `let` are closed as well as `Ok` / `Err` / `Result`), else an
    `ident`-kind head starting `A`–`Z` draws the new
    `theta/parse/capitalised-pattern-head` (half 1). **Reserved is checked
    before case**, so a capitalised reserved spelling draws exactly one code and
    never both. A new module-local builder `capitalisedPatternHeadDiagnostic`
    renders the registered *Message*, beside the existing
    `reservedKeywordAsIdentifierDiagnostic` it reuses for half 2.
  - **The AST node is unchanged** in both refusal cases — still
    `{ kind: "identifier", name }`. The refusal is carried by the
    `error`-severity diagnostic, which `hasLoadParseError` already turns into a
    registration denial; making the node a wildcard instead would drop the name
    from `collectPatternBindings` and every arm-body read of it would draw a
    second, spurious `theta/parse/unknown-identifier`. Consequence recorded
    rather than changed: bug 0050's withheld-binder machinery is untouched, so
    §Fix (e)'s "the type layer follows the production" bullet is a no-op here
    and 0050's cells keep the collision premise they exist to test.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the new
    `theta/parse/capitalised-pattern-head` row (`E`, `parse`), *Trigger*: "A
    capitalised identifier in `match` pattern-head position that heads none of
    the admitted pattern productions: it is not the `Ok(p)` / `Err(p)`
    constructor spelling and it is not followed by `{`." No other row's
    *Trigger* or *Message* is edited, so DIAG-4 is not engaged elsewhere.
  - `docs/reference/diagnostics.md` — the Code / Sev / Phase / Message mirror
    row, same relative position.
  - No grammar-table row, no new pattern production, and no normative sentence
    reworded: `expressions.md`, `lexical.md`, `grammar.md` and
    `docs/reference/grammar.md` are untouched.
- **Gates:** witness `npx vitest run tests/capitalised-bare-match-pattern-refusal.test.ts`
  → `Tests 45 passed (45)` (RED before the fix: `27 failed | 17 passed (44)`).
  Full default suite `npm test` → `Test Files 343 passed (343)`,
  `Tests 6605 passed (6605)`. `npm run typecheck` (`tsc -p tsconfig.json
  --noEmit`) clean. `npm run lint` (`eslint … "src/**/*.ts"`) clean. Live:
  `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/acceptance/ctor-unresolved-load-refusal.test.ts` → `1 passed`, and
  the new minted cell → `1 passed`.
- **Review:** 2 rounds. Round 1 (deep) — one blocking finding: the new row's
  *Trigger* said "with no following `(` or `{`" while the emitter also fires on
  a capitalised head followed by `(` whose spelling is not `Ok` / `Err`
  (`match 3 { Some(1) => 1, _ => 2 }`), because the constructor gate is
  spelling-restricted; remedied by rewording the *Trigger* to the implemented
  condition and pinning the `Some(1)` class with witness cell g3. Round 2
  (fast) — CLEAN, with two comment/prose residuals (a builder doc comment
  still carrying the pre-remedy narrower condition, and a `describe` title that
  over-generalised past its own g3 cell), both since polished; polish verified
  by gate-diff (comment-and-title-only hunks, gates re-run green), confirmation
  round skipped.
- **Verification:** SOLID. (1) The witness witnesses the defect: neutralising
  both `this.diagnostics.push(...)` calls reds 35 tests across the six touched
  test files, including every one of the nine protected-witness flips, and the
  restore is byte-exact (`git hash-object` identical before and after). (2)
  `npm test` 343/343 files, 6605/6605 tests after isolating one
  `0xC0000142`-class stochastic red (`tests/subagent-return-depth-refusal.test.ts`,
  green in isolation). (3) Live: the nearest existing load-refusal acceptance
  cell run for real, plus a minted H8a cell that drives a capitalised
  bare-pattern theta against a live model and asserts the theta **fails to
  register** while a lowercase-pattern sibling over the same `match` shape does
  — proven able to red by lowercasing the refused fixture once, then restored.
  (4) Typecheck and lint clean.
- **Tests that lock it:**
  - `tests/capitalised-bare-match-pattern-refusal.test.ts` (new, 45 cells) —
    §Witness's whole obligation: group (a) 7/7 with a2 / a7 as the lowercase and
    wildcard controls and a3–a5 the three declaration kinds; (b) b1–b4, b6 with
    b4 asserted on its value; (c) 9/9 with c2 / c4 / c9 the constructor
    controls and c1 / c8 in both directions; (d) 9/9 with d2 / d4 / d6 the
    controls and d5's whole ordered list; (e) the six-position inventory, e2
    re-measured post-0139; (f) the corpus sweep over
    `git ls-files -- '*.theta' '*.thetalib'`, failing loudly on an empty list;
    the two gated-follower rows g1 / g2 plus g3's `Some(1)` boundary; and the
    nested-position rows h1 / h2 (array element, object-pattern field value).
  - `tests/live/capitalised-pattern-head-live-cell.test.ts` (new, one
    H8a cell, title token `CELL-B`) — the registration denial end to end
    against a live model, on the `registeredNames()` observable, `failLoudly` on
    an unmet precondition.
  - Nine protected-witness cells re-pinned as **list expansions**, every
    fixture byte-identical, every assertion still whole-list and
    order-sensitive, every original subject still proved:
    `tests/fn-arg-type-mismatch-wired.test.ts` u13c, u13d, u13mb, u13mc (bug
    0050 §Fix (e)); `tests/fn-param-name-reserved-keyword.test.ts` e7;
    `tests/fn-param-name-case.test.ts` c2;
    `tests/schema-field-name-case.test.ts` o5, b3;
    `tests/type-name-as-value-refusal.test.ts` g4.
- **Residuals:**
  - §Fix (e) predicted **five** bug 0050 cells red by design; **four** reded.
    `u9b` (`U9_MATCH_BINDER`) stayed green because this route preserves the
    binder node and `u9b` asserts through the filtered
    `expectNoFnArgMismatch` helper rather than a whole-list equality. Its
    fixture now draws the pattern-head refusal, unasserted at that cell.
  - Four further protected witnesses outside §Fix (e)'s list red on the new
    emission and were flipped under this report's own named authority: e7
    (whose inventory comment names bug 0141 as the position's owner), c2, o5 /
    b3 and g4 (whose premise — that `lexical.md:16`'s lowercase-first NAMING
    list does not reach a pattern binder — is untouched and still what each row
    protects; the new element is a differently-sourced refusal under
    `expressions.md`'s disambiguation sentence).
  - `Result { a: 1 }` in pattern position — a reserved keyword as an
    *object*-pattern head — is still silent. The `{`-gated arm sits above the
    tail and outside route 1's site; unclaimed by any report.
  - Bug 0123's cited `C.Red` measurement (this report's row g1) now draws a
    third code, `capitalised-pattern-head` on `C`. 0123's own defect input
    `--y` is untouched and still draws exactly its two-code cascade, verified;
    the g1 row is a citation that re-measures on rebase.
  - `u9b`'s comment in `tests/fn-arg-type-mismatch-wired.test.ts` cites
    `parsePattern` at a pre-0139/0141 line and says the capitalised-pattern
    question "is a separate question this route does not answer" — stale before
    this change, and left alone under the no-citation-sweep fence.
  - This change inserts 47 lines into `src/parser/theta-document.ts` below the
    tail arm, so citations into that file below the two insertion points shift
    by +20 (below the tail arm) or +47 (below the new builder). No sweep was
    performed.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** every §Non-goals item holds. No
  enum-variant pattern production was added, no exhaustiveness or
  unreachable-arm analysis, no change to `matchPattern`'s identifier arm or to
  bug 0050's withholding, and no change at the `fn` parameter or `for` /
  `par for` variable positions. `parsePattern`'s one-token recovery tail — bug
  0123's subject — is byte-identical, and its `--y` input still draws exactly
  the two codes that report measures, so nothing here strands its subject. Row
  b5's enum-vs-string-literal equality is unchanged and remains unclaimed.

### Discharge note — bug 0219 (0.156.0)

The *Residuals* item above reading "`Result { a: 1 }` in pattern position — a
reserved keyword as an *object*-pattern head — is still silent" is **closed**.
Bug [0219](./0219-reserved-keyword-object-pattern-head-parses-clean.md) added a
reserved-word guard to `parsePattern`'s `{`-gated object / schema pattern arm,
so a `keyword`-kind head there now draws
`theta/parse/reserved-keyword-as-identifier` — the same builder, arguments and
range as the tail-arm emission this record landed. The row's *Trigger* was not
edited and no code was minted; this route's own refusals keep their codes,
counts and ranges, with `tests/capitalised-bare-match-pattern-refusal.test.ts`
green as written at 45/45 and unedited.

Two consequences for this record's citations, appended rather than swept: bug
0219 inserts 11 lines at the object arm, so the tail-arm
`reservedKeywordAsIdentifierDiagnostic` emission is now `:4314` and
`capitalisedPatternHeadDiagnostic` `:4321`; and the row
`theta/parse/capitalised-pattern-head` was deliberately NOT widened to the
braced head, so its *Trigger* clause "it is not followed by `{`" remains true
of the implementation.
