# Bug 0226 — A `match` object-pattern head that RESOLVES is admitted with any field list at all: `R { a: 1 }` where `schema R { b: integer }`, `R { a: 1 }` where `R` declares `a: string`, and `Animal { a: 1 }` where `Animal` is an alias/union with no object body each draw `[]`, register, and select their arm on a value of an unrelated schema — while the same three field lists in the VALUE position draw `theta/parse/extra-object-field`, `theta/parse/object-field-type-mismatch` and `theta/parse/unresolved-named-type`

- **Status:** fixed (0.176.0). Filed as bug
  [0221](./0221-object-pattern-head-name-unchecked-fires-wrong-arm.md)'s
  `## Fix (0.167.0)` *Residuals* item 1 (`:603`): "§Expected behaviour 3 (row
  A1) is NOT closed … Unclaimed by any report." Re-measured at HEAD for this
  filing, not copied from that record. **Ordering:** no report blocks this one.
  One cell of bug 0221's shipped witness pins this class's current bytes as a
  recorded residual (`tests/object-pattern-head-unresolved-refusal.test.ts:485`,
  cell `a1`), so a fix moves an asserted byte deliberately and under this
  report's named authority.
- **Sev/Diff estimate:** S1/D2 — S1 because a program that draws `[]` on every
  channel, passes `hasLoadParseError`
  (`src/extension/production-composition.ts:2220`), registers, and reaches
  `outcome=success` answers with an arm whose head names a schema that cannot
  carry the fields the arm lists: measured at HEAD, `schema Q { a: integer }` /
  `schema R { b: integer }` / `let d = Q { a: 1 }` /
  `match d { R { a: 1 } => "r-arm", Q { a: 1 } => "q-arm", _ => "other" }`
  answers `"r-arm"` (§Reproduction A1), and the same shape one level down
  answers the wrong nested arm over a present correct one (A6). D2 because the
  inputs the check needs are split across two passes that already hold them and
  one that does not: the field NAME set lives in `StructuralRefs.schemas`
  (`src/parser/theta-document.ts:6545`, names only) and is read by
  `checkObjectExpr` (`:7489`); the declared field TYPES live in the type layer
  (`checkObjectField`, `src/parser/type-layer-checks.ts:2148`, routing
  `checkObjectFieldCompat`, `src/parser/type-compat.ts:526`); and the site bug
  0221 emits from, `parsePattern`'s `{`-gated arm
  (`src/parser/theta-document.ts:4397`), holds neither — its whole-file universe
  is a token scan carrying names without bodies (`patternHeadTypeNames`,
  `:4586`). Neither of the two passes that hold the field data descends into a
  pattern (`walkExpr`'s `match` case, `:7677–:7681`; the type layer's
  child-expression enumeration, `src/parser/type-layer-checks.ts:3157`), and a
  `PatternNode` carries no range. Not D1 for that reason, and not D3 because no
  runtime dispatch and no normative sentence has to move: the refusal is carried
  by an error-severity parse diagnostic, exactly as bug 0221's landed half is.
- **Kind:** defect — implementation, against bug 0221's §Expected behaviour 3
  (`:246`, "A head whose resolved declaration cannot carry the listed fields is
  refused … on the reading `checkObjectExpr` already applies at the constructor
  position") and against the asymmetry the registered rows state for the value
  position. Three elements, one mechanism.
  1. **A listed field the resolved declaration does not declare.** `R` declares
     `{ b }`, the pattern lists `a`: `[]`, and the arm takes a `Q`-constructed
     value (A1). The field shorthand is the same (`R { a }` binds `a` to `1` and
     the arm answers `1`, A2). The value position refuses both spellings with
     `theta/parse/extra-object-field` plus
     `theta/parse/missing-object-field` (V1).
  2. **A listed field whose pattern literal is incompatible with the declared
     field type.** `R` declares `a: string`, the pattern lists `a: 1`: `[]`, and
     the arm takes a `Q { a: 1 }` value (A3). Reversed — `R` declares
     `a: integer`, the pattern lists `a: "x"`, the value is `Q { a: "x" }` — the
     same (A4). The value position refuses with
     `theta/parse/object-field-type-mismatch` (V2).
  3. **A resolved head with no object body to check against.** A `schema
     Animal = Cat | Dog` alias/union head resolves at the pattern position by
     the registered row's own rule (`code-registry-parse.md:107`: the pattern
     head "need only resolve to a same-file `schema` or `enum` declaration"),
     and `Animal { a: 1 }` then takes a `Q`-constructed value (A5). The value
     position refuses the same spelling with
     `theta/parse/unresolved-named-type`, because the constructor position
     carries the brace-constructible requirement the head does not (V3).

  The mechanism is one: bug 0221's fix checks the head's NAME against a
  whole-file name universe and nothing else. `parsePattern`'s arm
  (`src/parser/theta-document.ts:4397`) runs bug 0219's token-kind guard
  (`:4398`), then bug 0221's set-membership test (`:4400`), then returns
  `{ kind: "object", typeName: t.text, fields }` (`:4444`) with the field list
  unjudged by any pass. The two passes that judge a field list against a
  declaration reach object EXPRESSIONS only (`walkExpr`'s `object` case,
  `:7671–:7672`; the type layer's object arm, `type-layer-checks.ts:2161`), and
  the runtime never receives the head (`toRuntimePattern`,
  `src/runtime/statement-executor.ts:1143–:1146`).
- **Related:**
  - [0221](./0221-object-pattern-head-name-unchecked-fires-wrong-arm.md) —
    **fixed (0.167.0)**, the origin. Its §Expected behaviour 3 asked for this
    row, its `## Fix (0.167.0)` *Residuals* item 1 (`:603`) records it as NOT
    closed with the reason ("the field-set half needs the resolved
    declaration's field bodies, which `parsePattern` does not hold") and leaves
    it "Unclaimed by any report". **Not a duplicate:** that report is closed on
    the head-NAME classes it fixed, and its witness pins this class's current
    bytes (cell `a1`,
    `tests/object-pattern-head-unresolved-refusal.test.ts:485`) as a deliberate
    residual, which is what a report is needed to move. Its 43-cell witness is
    a LOCK apart from `a1` (§Fix constraint 5). Its §Fix (c)(5) boundary — two
    declared, FIELD-COMPATIBLE schemas stay interchangeable in pattern position
    (cell `a5`, `:557`) — is clean by design and is **not** claimed here
    (§Non-goals).
  - [0219](./0219-reserved-keyword-object-pattern-head-parses-clean.md) —
    **fixed (0.156.0)**, the same arm one guard up: a `keyword`-kind head draws
    `theta/parse/reserved-keyword-as-identifier` alone
    (`src/parser/theta-document.ts:4398`). Disjoint subject (the head's token
    kind, not its declaration's fields). Its 54-cell witness
    (`tests/reserved-keyword-object-pattern-head-refusal.test.ts`) is a LOCK
    (§Fix constraint 5); the two files run green together at HEAD, measured
    `97 passed (97)`.
  - [0123](./0123-match-pattern-decrement-draws-neighbouring-codes.md) —
    **open**, `parsePattern`'s one-token recovery tail. Disjoint defect, shared
    function; whichever lands second re-measures the other's rows.
  - [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) —
    **open**, and binding on §Reproduction (D): the committed parse gate filters
    `.theta` only, so the `.thetalib` half of the sweep is a probe.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for positional drift. Every citation here is
    symbol-named beside its line number and verified at HEAD `758e3c0d`.
- **Affected** (every citation verified against the tree at HEAD `758e3c0d`,
  v0.173.0 — `package.json:3`; symbol-named per bug 0134's adjudication):
  - **The site that admits the field list** —
    `src/parser/theta-document.ts:4397`, the `{`-gated object / schema arm
    inside `parsePattern` (declared `:4326`). `:4398` is bug 0219's
    `t.kind === "keyword"` guard, `:4400` bug 0221's
    `!this.patternHeadTypeNames().has(t.text)` test, `:4409` its
    `unresolvedNamedTypeDiagnostic` push, and `:4444` the returned node
    `{ kind: "object", typeName: t.text, fields }`. The field loop below the
    gate walks names and sub-patterns; nothing compares them to a declaration.
  - **The universe bug 0221 built, and what it cannot supply** —
    `patternHeadTypeNames` (`:4586`, memo field `:4557`, doc `:4552`), a
    once-per-parse token scan seeded from `BUILTIN_VALUE_NAMES` (`:5219`, which
    carries `QueryError` at `:5228`) plus every identifier after a `schema` /
    `enum` token plus every `import` / `export` specifier. It yields NAMES only:
    no field list, no field types, no declaration kind. Its doc comment states
    the permissiveness that follows (`:4578–:4584`).
  - **The pass that holds the field NAMES and does not see patterns** —
    `checkObjectExpr` (`:7489`), reached from `walkExpr`'s `object` case
    (`:7671–:7672`) only; `walkExpr`'s `match` case walks `e.scrutinee` and each
    `arm.body` (`:7677–:7681`). Its declared-field lookup is
    `refs.schemas.get(e.typeName)` (`:7506`) over
    `StructuralRefs.schemas` (`:6545`) — object-form `schema` field NAMES keyed
    by schema name, per its own doc comment (`:6538–:6544`). Its verdicts: the
    `enum` and no-object-body branches (`:7535`, `:7540`,
    `unresolvedNamedTypeDiagnostic`), the extra-field loop (`:7545–:7554`) and
    `checkObjectLiteralFields` (`:7557`, defined
    `src/parser/literal-sublanguage.ts:600`, which emits
    `theta/parse/missing-object-field`).
  - **The pass that holds the field TYPES and does not judge patterns** —
    `checkObjectField` (`src/parser/type-layer-checks.ts:2148`) routing
    `checkObjectFieldCompat` (`src/parser/type-compat.ts:526`, TYPE-9 doc
    `:508`) at the object-expression arm (`type-layer-checks.ts:2161`). The type
    layer DOES read an arm pattern — `matchArmScope` (`:1785`) builds each arm's
    binder scope — so a pattern is reachable there; what it never does is judge
    the head. Its child-expression enumeration for `match` is scrutinee plus arm
    bodies (`:3157`).
  - **Why neither pass has a range to point at** — a `PatternNode` object
    variant carries `typeName` and `fields` and no range
    (`src/parser/theta-document.ts:307–:310`), `MatchArmNode` carries `pattern`
    and `body` (`:314–:317`), and the comment at `:6279` states the consequence
    in terms. Bug 0221 emitted from `parsePattern` precisely because the token's
    range is only there.
  - **The dropped head at the runtime** —
    `src/runtime/statement-executor.ts:1110` (the per-arm mapping), `:1133`
    (`toRuntimePattern`), `:1143–:1146` (its object arm, which maps `fields`
    alone); `src/runtime/match-result.ts:113–:117` (the runtime `Pattern` object
    variant declares `kind` and `fields`, no `typeName`) and `:202–:221`
    (`matchPattern`'s object arm: a non-null, non-array `object`, then every
    LISTED field present and matching, unlisted fields ignored). An object
    pattern is a pure field-shape test, which is what makes a field list the
    declaration cannot carry into a live selector.
  - **The field binders, which stay in scope either way** —
    `collectPatternBindings` (`:5314`, object arm `:5324`), seeded per arm at
    `:5650` and read again at `:6497`. Cell `a2`'s shorthand `R { a }` binds and
    the arm body reads the binding.
  - **The registration gate** — `hasLoadParseError`
    (`src/extension/production-composition.ts:2220`): any error-severity
    `theta/load/` or `theta/parse/` code. Every row of §Reproduction (A) draws
    none, which is why each reaches a value.
  - **The registered rows the value position draws, and their scope.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:47`
    (`theta/parse/extra-object-field`, *Trigger* "Schema constructor lists a
    field not declared by the schema"), `:48`
    (`theta/parse/missing-object-field`, "Schema constructor omits a declared
    (required) field" — a REQUIREMENT no pattern carries, §Non-goals), `:49`
    (`theta/parse/object-field-type-mismatch`, phase `type`, scoped to "a
    schema-constructor field value"), `:107`
    (`theta/parse/unresolved-named-type`, whose pattern-head clause bug 0221
    added and which states in terms that the pattern head "carries no such
    brace-constructible requirement"). All three of the first rows name the
    CONSTRUCTOR position, so an emission at a pattern head is a DIAG-2 trigger
    change or a further row (`diagnostic-shape.md:72`).
  - **The spec the silence sits against** — `docs/spec_topics/expressions.md:171`
    (the Object/schema pattern row: "object whose listed fields match the inner
    patterns; unlisted fields are ignored"), `:174` (the disambiguation sentence
    bug 0221 extended: the head "resolves against the whole-file declaration
    universe … a head resolving to nothing draws that code" — resolution only,
    nothing about the field list); `docs/spec_topics/lexical.md:18` (an
    uppercase identifier in a pattern "refers to an existing schema, enum, or
    constructor in scope").
  - **The pinned witnesses.** `tests/object-pattern-head-unresolved-refusal.test.ts`
    (43 cells, bug 0221's witness): `:485` cell `a1` asserts this class's
    current `[]` and its `"r-arm"` value as a RECORDED RESIDUAL and says so in
    terms; `:557` `a5` pins the field-COMPATIBLE boundary (§Non-goals); `:710`
    `u1` and `:751` `u4` pin the `QueryError` and `enum` head deferrals; `:815`
    `u10` the legal head; `:862` `o3` the no-cascade field binders; `:994` `f1`
    the corpus sweep.
    `tests/reserved-keyword-object-pattern-head-refusal.test.ts` (54 cells, bug
    0219's witness) is a lock. Both files green at HEAD: `97 passed (97)`.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` lists 34 files at
    HEAD; three carry an object-pattern arm and every one of them heads it
    `QueryError` (`docs/examples/handle-error.theta:14`,
    `docs/examples/fan-out-reviews.theta:31`,
    `docs/examples/configure-tool-loop.theta:10`), a builtin name with no
    same-file field bodies (§Reproduction D). `tests/committed-fixture-parse-gate.test.ts`
    is what discharges a corpus-wide claim; per bug 0132 it filters `.theta`
    only, so the `.thetalib` half of the sweep is a probe.
- **Observed at:** v0.173.0 (`758e3c0d`, `package.json:3`). Offline,
  deterministic, provider-free, zero model turns: one scratch vitest probe
  (filename containing `scratch`; written, run, deleted — one case-insensitive
  sweep of `git status --short` at exit reports no file of this filing's)
  driving the real `parseThetaDocument` through `tests/helpers/e2e-s1.ts`'s
  `parseDoc` and the real `executeBody` through the shipped production producer
  deps (`createProductionProducerDeps` + `bindPromptConversation`), the harness
  shape of `tests/object-pattern-head-unresolved-refusal.test.ts:396–:470`. Every
  value below is that run's output verbatim. `src/`, `tests/`, other bug
  documents and `docs/bugs/README.md` are unmodified by this filing.

## Summary

Bug 0221 closed the head-NAME classes of the `match` object-pattern head: an
`ident`-kind head absent from a whole-file name universe now draws
`theta/parse/unresolved-named-type`. That universe is a token scan carrying
names without bodies, so a head that RESOLVES is admitted with any field list
whatever.

Three shapes reach a wrong arm from clean source. A pattern lists a field the
resolved schema does not declare (`schema R { b: integer }`, pattern
`R { a: 1 }`) — `[]`, registers, and takes a `Q`-constructed value. A pattern
lists a declared field with an incompatible literal (`R` declares `a: string`,
pattern `a: 1`) — the same. A head resolving to an alias/union `schema` with no
object body at all (`schema Animal = Cat | Dog`, pattern `Animal { a: 1 }`) —
the same. Each of those three field lists is refused in the VALUE position, by
`theta/parse/extra-object-field`, `theta/parse/object-field-type-mismatch` and
`theta/parse/unresolved-named-type` respectively.

The defect is the missing descent, not a missing rule. `checkObjectExpr` holds
the declared field names (`StructuralRefs.schemas`) and the type layer holds the
declared field types (`checkObjectFieldCompat`); neither is reached from a
pattern, because `walkExpr`'s `match` case and the type layer's child-expression
enumeration both walk the scrutinee and the arm bodies only. `parsePattern`, the
site bug 0221 emits from, holds a token range and a set of bare names.

## Reproduction

Zero model turns, no provider contacted. Every fixture is a whole prompt-mode
theta (`---\nmode: prompt\n---\n`, three lines of frontmatter); the body's last
statement reads the `match` result, so the reported value IS the selected arm.
`diags` is the whole unfiltered list in emission order. `[]` means the theta
registers: `hasLoadParseError`
(`src/extension/production-composition.ts:2220`) needs one error-severity
`theta/load/` or `theta/parse/` code.

### (A) The class — a resolved head, a field list its declaration cannot carry

| row | source under test (`/` = newline) | diags | value |
| --- | --- | --- | --- |
| A1 **THE PIN** | `schema Q { a: integer }` / `schema R { b: integer }` / `let d = Q { a: 1 }` / `match d { R { a: 1 } => "r-arm", Q { a: 1 } => "q-arm", _ => "other" }` | `[]` | `"r-arm"` |
| A2 shorthand | same schemas and value, arm `R { a } => a`, then `Q { a: 1 } => 99`, `_ => 0` | `[]` | `1` |
| A3 declared type | `schema Q { a: integer }` / `schema R { a: string }` / `let d = Q { a: 1 }` / `match d { R { a: 1 } => "r-arm", Q { a: 1 } => "q-arm", _ => "other" }` | `[]` | `"r-arm"` |
| A4 declared type, reversed | `schema Q { a: string }` / `schema R { a: integer }` / `let d = Q { a: "x" }` / `match d { R { a: "x" } => "r-arm", Q { a: "x" } => "q-arm", _ => "other" }` | `[]` | `"r-arm"` |
| A5 no object body | `schema Cat { kind: "cat", c: integer }` / `schema Dog { kind: "dog", d: integer }` / `schema Animal = Cat \| Dog` / `schema Q { a: integer }` / `let v = Q { a: 1 }` / `match v { Animal { a: 1 } => "animal-arm", Q { a: 1 } => "q-arm", _ => "other" }` | `[]` | `"animal-arm"` |
| A6 nested | `schema Inner { z: integer }` / `schema Other { y: integer }` / `schema Outer { i: Inner }` / `let d = Outer { i: Inner { z: 1 } }` / `match d { Outer { i: Other { z: 1 } } => "other-arm", Outer { i: Inner { z: 1 } } => "inner-arm", _ => "none" }` | `[]` | `"other-arm"` |
| A7 silent, no wrong arm | `schema Q { a: integer }` / `schema R { b: integer }` / `let d = Q { a: 1 }` / `match d { R { zz: 1 } => "r-arm", _ => "other" }` | `[]` | `"other"` |

A1 is the S1 row: the correct `Q { a: 1 }` arm is present below, `R` declares
`{ b }` and cannot carry `a`, and the arm above takes the value. A2 shows the
shorthand sugar (`expressions.md:171`) reaches the same acceptance and that the
binder is live — the arm body reads `a` and answers `1`. A3 and A4 move the
incompatibility from the field NAME to the field TYPE in both directions. A5 is
the head that resolves by the registered row's own pattern-position rule while
having no object body to check against. A6 is the same class one level down,
and it beats a present correct arm. A7 is the residue: when the listed field is
absent from the value, the runtime's field-shape test rejects the arm, so the
acceptance is silent without a wrong answer.

### (B) The value position refuses all three field lists

| row | source under test | diags | value |
| --- | --- | --- | --- |
| V1 | `schema R { b: integer }` / `let r = R { a: 1 }` | `error theta/parse/extra-object-field @5:9-5:19: extra field 'a' on schema 'R'`, `error theta/parse/missing-object-field @5:9-5:19: missing field 'b' on schema 'R'` | `{"a":1}` |
| V2 | `schema R { a: string }` / `let r = R { a: 1 }` | `error theta/parse/object-field-type-mismatch @5:16-5:17: field 'a' on schema 'R' type mismatch: expected string, got integer` | `{"a":1}` |
| V3 | A5's three schemas / `let r = Animal { a: 1 }` | `error theta/parse/unresolved-named-type @7:9-7:24: unresolved named type 'Animal'` | `{"a":1}` |

Each V row is the A row's field list written one position over. V1 and V2 are
the emissions `checkObjectExpr` (`theta-document.ts:7545–:7557`) and the type
layer (`type-layer-checks.ts:2161`) already make; V3 is the
brace-constructible requirement the constructor position carries and the
pattern head does not (`code-registry-parse.md:107`).

### (C) Boundaries — measured, and NOT claimed

| row | source under test | diags | value |
| --- | --- | --- | --- |
| B1 field-compatible siblings | `schema Q { a: integer }` / `schema R { a: integer }` / `let d = R { a: 2 }` / `match d { Q { a: 2 } => "q-arm", _ => "other" }` | `[]` | `"q-arm"` |
| B2 subset field list | `schema Q { a: integer, b: integer }` / `let d = Q { a: 1, b: 2 }` / `match d { Q { a: 1 } => "q-arm", _ => "other" }` | `[]` | `"q-arm"` |
| B3 field-shape dispatch holds | `schema Q { a: integer }` / `schema R { b: integer }` / `let d = Q { a: 1 }` / `match d { R { b: 1 } => "r-arm", Q { a: 1 } => "q-arm", _ => "other" }` | `[]` | `"q-arm"` |
| B4 empty field list on `Ok` | `schema R { a: string }` / `match Ok(1) { R { } => "r-arm", Ok(v) => "ok-arm", _ => "other" }` | `[]` | `"r-arm"` |
| B5 bare pattern, same value | `match Ok(1) { { } => "bare-arm", Ok(v) => "ok-arm", _ => "other" }` | `[]` | `"bare-arm"` |
| B6 enum head | `schema Q { a: integer }` / `enum E { one, two }` / `let d = Q { a: 1 }` / `match d { E { a: 1 } => "e-arm", Q { a: 1 } => "q-arm", _ => "other" }` | `[]` | `"e-arm"` |
| B7 builtin head | `schema Q { a: integer }` / `let d = Q { a: 1 }` / `match d { QueryError { a: 1 } => "qe-arm", Q { a: 1 } => "q-arm", _ => "other" }` | `[]` | `"qe-arm"` |
| B8 listed field absent | `schema R { a: string }` / `match Ok(1) { R { a: 1 } => "r-arm", Ok(v) => "ok-arm", _ => "other" }` | `[]` | `"ok-arm"` |

- **B1 is bug 0221 §Fix (c)(5)'s boundary and is clean by design.** Two
  declared, FIELD-COMPATIBLE schemas remain interchangeable in pattern
  position: only nominal dispatch could separate them, and that language
  decision is held open (`expressions.md:171` describes the field-shape
  reading). Cell `a5` pins it. This report claims no part of it.
- **B2 is why `missing-object-field` cannot be reused.** A pattern lists a
  SUBSET of the declared fields by design ("unlisted fields are ignored",
  `expressions.md:171`), so an omitted declared field is legal here and refused
  at the constructor (V1's second code).
- **B3 shows the runtime's field-shape test still protecting the correct arm**
  when the incompatible pattern's listed field is absent from the value — the
  same mechanism as A7.
- **B4 and B5 together locate the empty-braced head outside this class.** A
  declared head with an EMPTY field list carries a field list its declaration
  can carry (the empty subset), and it captures an `Ok` value exactly as the
  bare object pattern `{ }` does (B5). The discriminator there is the dropped
  head, i.e. nominal dispatch — §Non-goals.
- **B6 and B7 are pinned deferrals** (cells `u4` and `u1`): an `enum` head and a
  builtin error-model head resolve at the pattern position and supply no
  same-file object body, so no field set exists to judge them against. Both
  stay silent under this report (§Fix constraint 3).
- **B8** measures that the listed field must be present in the value for the
  wrong arm to fire, which is what makes A1's and A6's coincidence — a listed
  field the DECLARATION lacks and the VALUE has — the sharp shape.

### (D) The committed corpus

`git ls-files -- '*.theta' '*.thetalib'` → **34 files**. Three carry an
object-pattern arm, every one of them headed `QueryError`:

```
docs/examples/configure-tool-loop.theta:10:QueryError { kind: "tool_loop_exhausted" }) =>
docs/examples/fan-out-reviews.theta:31:QueryError { kind: "cancelled" }) =>
docs/examples/handle-error.theta:14:QueryError { kind: "validation", cause: "schema_validation" }) =>
```

`QueryError` is a builtin name with no same-file field bodies (B7's deferral),
so a check that judges a field list against a resolved same-file object schema
newly refuses no committed file. That bounds the corpus half of a GOV-15 sweep;
it does not discharge it, because every row of §Reproduction (A) loads cleanly
today and would refuse afterwards.

## Expected behaviour

1. **A pattern's listed field names are a subset of the resolved
   declaration's.** A head that resolves to a same-file object-form `schema`
   which does not declare a listed field is refused with an error-severity
   `theta/parse/` diagnostic, exactly once, at a range naming the offending
   head or field, and the theta does not register. Rows A1, A2, A6 and A7 stop
   registering; the value-position sibling verdict (V1's first code) is the
   reading this applies at the pattern position, per bug 0221 §Expected
   behaviour 3 (`:246`).
2. **A listed field's pattern literal is compatible with the declared field
   type**, under the relation `checkObjectFieldCompat`
   (`src/parser/type-compat.ts:526`) already decides at the constructor
   position, where both types are statically resolvable. Rows A3 and A4 refuse.
3. **A head resolving to a declaration with no object body carries no field
   list.** An alias/union `schema` (A5) declares no fields, so any listed field
   is unsatisfiable by it.
4. **Omission stays legal.** A pattern listing a subset of the declared fields
   is silent (B2), so `theta/parse/missing-object-field`'s constructor rule does
   not follow the field-name check into the pattern position.
5. **Nothing else moves.** B1's field-compatible siblings keep `[]` and
   `"q-arm"` (bug 0221 §Fix (c)(5), cell `a5`); B4's and B5's empty and bare
   field lists keep their values; B6's `enum` head and B7's builtin head keep
   their deferrals (cells `u4`, `u1`); a declared head with a compatible field
   list keeps its value and its silence (cell `u10`); the three committed
   `Err(QueryError { … })` arms stay clean (cells `u2`, `f1`); bug 0221's
   head-name refusals and bug 0219's reserved-head refusals keep their codes,
   counts and ranges.

## Actual behaviour / root cause

**The head is resolved as a NAME and never as a DECLARATION.**
`parsePattern`'s `{`-gated arm (`src/parser/theta-document.ts:4397`) runs two
tests: bug 0219's `t.kind === "keyword"` (`:4398`) and bug 0221's
`!this.patternHeadTypeNames().has(t.text)` (`:4400`). The universe those consult
is a token scan (`:4586`) built from `BUILTIN_VALUE_NAMES` (`:5219`), the
identifier after each `schema` / `enum` token, and every `import` / `export`
specifier — a set of strings. It cannot answer which fields `R` declares, what
type `R.a` has, or whether `Animal` has an object body at all, and its doc
comment records the deliberate permissiveness (`:4578–:4584`). The arm then
returns `{ kind: "object", typeName: t.text, fields }` (`:4444`).

**Both passes that could judge the field list stop at the arm body.**
`checkObjectExpr` (`:7489`) holds the declared field NAMES
(`refs.schemas.get(e.typeName)`, `:7506`, over `StructuralRefs.schemas`,
`:6545`) and emits `theta/parse/extra-object-field` (`:7545–:7554`) and, via
`checkObjectLiteralFields` (`:7557`), `theta/parse/missing-object-field`. It is
reached from `walkExpr`'s `object` case (`:7671–:7672`) alone, because the
`match` case walks `e.scrutinee` and each `arm.body` (`:7677–:7681`). The type
layer holds the declared field TYPES: `checkObjectField`
(`src/parser/type-layer-checks.ts:2148`) routes `checkObjectFieldCompat`
(`src/parser/type-compat.ts:526`) from the object-expression arm (`:2161`), and
its `match` handling reads an arm pattern only for the binder scope
(`matchArmScope`, `:1785`), with its child-expression enumeration listing
scrutinee plus arm bodies (`:3157`).

**Neither pass has a range for a pattern head.** The object `PatternNode`
carries `typeName` and `fields` (`theta-document.ts:307–:310`), `MatchArmNode`
carries `pattern` and `body` (`:314–:317`), and the comment at `:6279` states
that a pattern node carries no range. This is why bug 0221 emitted from
`parsePattern` and why the field-set half could not follow it there.

**The runtime turns the unchecked field list into the selector.**
`toRuntimePattern` (`src/runtime/statement-executor.ts:1143–:1146`) maps
`fields` alone, the runtime `Pattern` object variant declares no `typeName`
(`src/runtime/match-result.ts:113–:117`), and `matchPattern`'s object arm
(`:202–:221`) tests object-ness and then every LISTED field. So the arm fires
exactly when the value happens to carry the listed fields — which is A1's
coincidence: `R` lacks `a`, the `Q` value has it.

**Registration has no backstop.** Every row of §Reproduction (A) draws `[]`, so
`hasLoadParseError` (`src/extension/production-composition.ts:2220`) passes and
the theta registers.

**The registered rows are scoped to the constructor.**
`theta/parse/extra-object-field`'s *Trigger* says "Schema constructor lists a
field not declared by the schema" (`code-registry-parse.md:47`),
`theta/parse/object-field-type-mismatch`'s says "a schema-constructor field
value" (`:49`), and bug 0221's pattern-head clause on
`theta/parse/unresolved-named-type` (`:107`) states that the head position
"carries no such brace-constructible requirement". Emitting any of them at a
pattern head is a DIAG-2 change (`diagnostic-shape.md:72`), not an
implementation-only one.

## Why it matters

- **A registered theta answers with an arm whose head cannot describe the
  value.** A1 and A6 answer `"r-arm"` and `"other-arm"` with a correct arm
  present below, `[]` on every channel, and `outcome=success`. That is the S1
  band by the letter.
- **The mistake is an ordinary one.** A renamed or reordered schema field, a
  copied arm whose head no longer matches, a field whose declared type changed
  from `integer` to `string` — each leaves a pattern the declaration cannot
  satisfy, and each is refused immediately in the value position (V1, V2) and
  silent in the pattern position.
- **Depth carries it.** A6's inner head is one level down and takes the value
  from the correct sibling arm, so review of the outer arm shows nothing wrong.
- **The binder makes it look intentional.** A2's shorthand `R { a }` binds `a`
  and the arm body reads it, so the arm produces a plausible value (`1`) rather
  than an obvious wrong one.
- **The silent half hides the noisy half.** A7 accepts the same malformed arm
  with no wrong answer, so the class is present in programs that currently
  behave correctly and turns into a wrong answer the moment the scrutinee gains
  the listed field.
- **The current bytes are asserted, so it cannot drift closed.** Cell `a1`
  (`tests/object-pattern-head-unresolved-refusal.test.ts:485`) pins the `[]` and
  the `"r-arm"` value as a recorded residual. Any fix moves an asserted byte on
  purpose.

## Non-goals

- **Nominal dispatch for object patterns.** Making the head part of the match
  test — so that a pattern whose head is field-COMPATIBLE with the value's
  schema but names a different one fails (B1), or so that an empty-braced
  declared head stops capturing an unrelated value (B4, which the bare pattern
  `{ }` captures identically, B5) — is bug 0221 §Fix (c)(5)'s
  clean-by-design boundary and its §Non-goals' language decision.
  `expressions.md:171` describes the field-shape reading currently implemented.
  This report asks that a field list be checked against the head's DECLARATION,
  never that dispatch become nominal.
- **`theta/parse/missing-object-field` at a pattern head.** A pattern lists a
  subset by design (B2). The constructor's omission rule does not follow.
- **The `enum` head and the imported head.** Both resolve and defer (cells
  `u4`, `u6`–`u8`); neither supplies a same-file object body. `QueryError` is
  the same case (`u1`, `u2`) and carries the three committed examples.
- **The head-NAME check itself.** Bug 0221 landed it; its emission, code, range
  and universe are untouched here.
- **The head's token kind.** Bug 0219's. A reserved head keeps that code alone.
- **`parsePattern`'s one-token recovery tail.** Bug 0123's.
- **Rest patterns, guards and exhaustiveness.** `{ kind, ...other }` stays
  `theta/parse/rest-pattern-not-supported`'s; guards and exhaustiveness are out
  per `expressions.md:174` and its *Exhaustiveness* paragraph.
- **Citation drift in other documents.** Bug 0134's adjudicated class.

## Fix

The subject is a field list admitted against a resolved declaration nobody
consults, so the route is defined by which pass gains the descent and what it is
allowed to emit. **The named route is the `checkObjectExpr` descent** bug 0221
§Fix (a) identified and its *Residuals* item 1 (`:603`) named as what this half
needs: `walkExpr`'s `match` case (`src/parser/theta-document.ts:7677–:7681`)
descends into `arm.pattern`, and an object pattern head resolving to
`StructuralRefs.schemas` (`:6545`) has its listed field names checked with the
verdict `checkObjectExpr` (`:7489`) already applies at the constructor
(`:7545–:7554`). The field-TYPE half (A3, A4) is not that pass's: declared field
TYPES live in the type layer (`checkObjectField`,
`src/parser/type-layer-checks.ts:2148`, routing `checkObjectFieldCompat`,
`src/parser/type-compat.ts:526`), which already reads arm patterns for binder
scope (`matchArmScope`, `:1785`). A route states which halves land where.

**Not settled here:** the range carriage, the code disposition, and whether the
field-TYPE half lands in the same change. Constraints below bound all three.

1. **A range for the head, or for the field.** No pattern node carries one
   (`:307–:310`, `:314–:317`, and the comment at `:6279`), and bug 0221
   deliberately added none. A descent-based emission therefore either carries a
   head range (and a field-name range for a per-field verdict) on the object
   `PatternNode`, or is emitted from `parsePattern` with the declaration data
   threaded in — which the memoised token scan (`:4586`) cannot supply, since it
   holds names without bodies. State the choice and keep the node's runtime
   shape byte-identical (constraint 2).
2. **No runtime dispatch change.** `toRuntimePattern`
   (`src/runtime/statement-executor.ts:1133`, object arm `:1143–:1146`), the
   runtime `Pattern` union (`src/runtime/match-result.ts:113–:117`) and
   `matchPattern`'s object arm (`:202–:221`) stay byte-identical. The refusal is
   carried by the error-severity diagnostic that `hasLoadParseError`
   (`src/extension/production-composition.ts:2220`) turns into a registration
   denial, as bug 0221's landed half is. A refused head's field binders keep
   reaching the arm-body scope (`collectPatternBindings`, `:5314`, seeded
   `:5650`) and draw no `theta/parse/unknown-identifier` cascade — cell `o3`
   (`:862`) is that observable.
3. **The deferrals stay deferrals.** A head with no same-file object body to
   check against is silent: the `enum` head (cell `u4`), the imported head
   (`u6`–`u8`) and the builtin `QueryError` (`u1`, `u2`) — the last of which
   carries the three committed examples (§Reproduction D). A route that judges
   a field list against a declaration it does not hold has mis-refused. Row A5
   (an alias/union head, whose declaration IS same-file and declares no fields)
   is in the class by §Expected behaviour 3; state its disposition explicitly —
   judged against the variants' union, or refused as unsatisfiable, or
   deferred — and pin whichever is taken.
4. **The (c)(5) interchangeability boundary is clean by design and must not
   move.** Two declared, FIELD-COMPATIBLE schemas stay interchangeable in
   pattern position (B1, cell `a5` at `:557`), as do the empty-braced declared
   head and the bare object pattern over the same value (B4, B5). Only nominal
   dispatch separates those, and that decision is held open (§Non-goals). A
   route that reds `a5` has made object patterns nominal by accident.
5. **The two witnesses are locks, with exactly one authorised flip.**
   `tests/object-pattern-head-unresolved-refusal.test.ts` (43 cells) and
   `tests/reserved-keyword-object-pattern-head-refusal.test.ts` (54 cells) are
   green as written at HEAD (measured: `97 passed (97)`). The single flip this
   report authorises is cell `a1` (`:485`), which asserts this class's `[]` and
   its `"r-arm"` value as bug 0221's recorded residual and says so in terms; it
   moves with its comment re-cited to this report. Every other cell — `a5`,
   `u1`, `u2`, `u4`–`u10`, `o3`, `f1` and the whole of bug 0219's file — is a
   lock. A red anywhere else means the route reached a position outside a
   `match` object-pattern head's field list.
6. **The code disposition is DIAG-2 either way, and the reuse candidates are
   scoped to the constructor.** `theta/parse/extra-object-field`'s *Trigger*
   names a "Schema constructor" (`code-registry-parse.md:47`) and
   `theta/parse/object-field-type-mismatch`'s a "schema-constructor field
   value" (`:49`), so reuse is a *trigger* widening with the
   `docs/reference/diagnostics.md` mirror co-edited; a new row is the GOV-15
   carve-out shape bug 0141 used. `theta/parse/missing-object-field` (`:48`) is
   ruled OUT by B2: omission is legal in a pattern.
   `theta/parse/unresolved-named-type` (`:107`) is ruled out for the field-set
   verdict by its own predicate — the head DID resolve — even though bug 0221's
   pattern-head clause on that row is what admits it. Whichever is taken, the
   *Message* rendering is normative (DIAG-4, `diagnostic-shape.md:74`) and must
   be true of a pattern: "extra field 'a' on schema 'R'" is, "missing field" is
   not.
7. **One diagnostic per construct.** A refused head's field list draws exactly
   one code per offending field, and a head that is already refused by bug
   0221's name check or bug 0219's token-kind guard draws that code ALONE — the
   field check runs only against a head that resolved.
8. **Spec text carries the rule.** `expressions.md:171`'s Object/schema row and
   `:174`'s disambiguation sentence describe head resolution and field-shape
   matching, and neither states that the listed fields must be declared by the
   head. The route adds that sentence beside bug 0221's, in the same
   convention, and edits the registry row it lands on.
9. **GOV-15 is discharged from a re-run sweep.** §Reproduction (D)'s census (34
   files, three object-pattern arms, every head `QueryError`) is a measurement
   at `758e3c0d`, not a licence: re-derive it in the witness with a regex that
   admits the committed `})` shape (cell `f1`, `:994`, is the precedent, and bug
   0221's *Residuals* 2 records what the naive regex missed), failing loudly on
   an empty `git ls-files` result, plus
   `tests/committed-fixture-parse-gate.test.ts`. Per bug 0132 that gate filters
   `.theta` only, so the `.thetalib` half stays a probe.
10. **Bug 0123's subject is untouched.** `parsePattern`'s one-token recovery
    tail stays byte-identical and its `--y` input keeps its exact code list;
    whichever of the two fixes lands second re-measures the other's rows.

**Witness — offline, provider-free.** Cells on bug 0221's witness shape
(`parseDoc` from `tests/helpers/e2e-s1.ts`, whole-list ordered `toEqual` over
unfiltered `doc.diagnostics`, expected messages read from the registry through
the `registryMessage` oracle, and the wrong-arm rows asserted as registration
DENIALS carrying the answered arm in the failure payload, since dispatch does
not move). Required cells: A1 as the pin, A2 for the shorthand and its binder,
A3 and A4 for the field-type half in both directions, A5 for the no-object-body
head, A6 for depth, A7 for the silent member; V1–V3 as the value-position
controls in both directions; B1–B8 as the must-not-move boundaries, with B1,
B4, B6 and B7 named as locks; and the corpus cell of constraint 9. A live cell
is owed on bug 0221's precedent, since the route changes a registration
outcome.

## Provenance

- **Origin:** bug 0221's `## Fix (0.167.0)` *Residuals* item 1 (`:603`):
  "**§Expected behaviour 3 (row A1) is NOT closed.** A DECLARED head whose
  declaration cannot carry the listed fields — `schema R { b: integer }` with
  the pattern `R { a: 1 }` — stays silent and still answers `"r-arm"` over a
  `Q`-constructed value. Evidence: cell `a1` … The field-set half needs the
  resolved declaration's field bodies, which `parsePattern` does not hold …
  Unclaimed by any report."
- **Ownership check performed before any probe.** Bug 0221's whole record
  (including §Fix (c)(5) and *Residuals* 5, `:642`) and bug 0219 were read
  first. `rg` over `docs/bugs/` for the field-set half returns bug 0221's
  §Expected behaviour 3 (`:246`), its residual 1 (`:603`) and nothing else: no
  document claims it.
- **Re-measured at HEAD `758e3c0d` (v0.173.0), not copied.** All three elements
  reproduce, and the measurement adds four rows the residual does not state:
  the field-TYPE half in both directions (A3, A4), which the residual's
  field-set framing does not cover and which lands in a different pass; the
  alias/union head with no object body at all (A5), refused in the value
  position at a third code (V3); the class at depth beating a present correct
  arm (A6); and the shorthand spelling with a live binder (A2). Also measured:
  the boundaries this report does not claim (B1–B8), among them the two pinned
  deferrals and bug 0221 §Fix (c)(5)'s clean-by-design interchangeability, and
  the corpus census (34 files, three object-pattern arms, every head
  `QueryError`).
- **Measurement:** one scratch vitest probe (filename containing `scratch`),
  written, run, and deleted; one case-insensitive sweep of `git status --short`
  at exit reports no scratch file of this filing's in the tree. Zero model
  turns, no provider contacted. Both witnesses run at HEAD for the lock counts:
  `43 passed (43)` and `54 passed (54)`.
- **Not verified end to end:** nothing in §Reproduction is inferred — every
  `diags` and `value` cell is that run's output verbatim, through the real
  `parseThetaDocument` and the real `executeBody` over the shipped production
  producer deps.

## Fix (0.176.0)

**The three questions §Fix left open are settled as follows.** The RANGE is
carried on the AST: the object variant of `PatternNode` gains a single
`readonly range: SourceRange` holding the WHOLE pattern's span (head token
through closing `}`; `{` through `}` for the bare form), because the two passes
that hold the declaration data run after the parse and the memoised token scan
(`patternHeadTypeNames`) cannot supply field bodies to `parsePattern`
(constraint 1). One range, not a per-field one: the constructor position's own
`theta/parse/extra-object-field` likewise names the whole object literal's
range (§Reproduction V1, `@5:9-5:19`), so a per-field range would have invented
a precision the sibling verdict does not have. The CODE disposition is REUSE of
the two rows §Fix constraint 6 names — `theta/parse/extra-object-field` for the
field-NAME half and `theta/parse/object-field-type-mismatch` for the field-TYPE
half — as a *Trigger* widening of both rows, minting nothing:
`tests/fixtures/h7a/permitted-codes.json` is byte-untouched and no H9a
reachability run is owed. `theta/parse/missing-object-field` stays ruled out
(row B2). And the field-TYPE half DOES land in this change, in the pass that
holds the declared field types.

- **What shipped:**
  - `src/parser/theta-document.ts` — the object `PatternNode` variant (`:307`)
    gains `readonly range: SourceRange`, populated at both `parsePattern`
    object return sites with the existing `spanRange(t.range, this.prevRange())`
    helper; the runtime shape is untouched (constraint 2). New module function
    `resolvePatternDeclaredFieldSet` classifies a head against the same three
    sources `checkObjectExpr` uses (`StructuralRefs.schemas`, then `bodyTypes`'s
    `imports` / `enums` / `schemas`), answering `undefined` for DEFER and an
    EMPTY set for a same-file fieldless declaration. New module function
    `checkPatternObjectFields` walks an arm pattern — object fields, array
    elements, constructor inners — and pushes
    `theta/parse/extra-object-field` at `pattern.range` for each listed field
    the resolved declaration does not declare. `walkExpr`'s `case "match"`
    calls it per arm.
  - `src/parser/type-layer-checks.ts` — new module function
    `patternLiteralType` types a literal sub-pattern (integral numbers as
    `integer`, since a pattern carries no lexed numeric spelling), and new
    private method `TypeLayerWalk.checkPatternFieldTypes` judges LITERAL field
    sub-patterns through the existing `checkObjectFieldCompat`, filtered to
    `theta/parse/object-field-type-mismatch`. Its `case "match"` calls it per
    arm.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — *Trigger* widening
    of `theta/parse/extra-object-field` (`:47`) and
    `theta/parse/object-field-type-mismatch` (`:49`) to the `match`
    object-pattern head position, naming the pattern-position deferrals, the
    fieldless alias/union-or-head-only disposition, the pattern range, and (on
    the type row) the `integer-narrowing` deferral, each with the GOV-15
    sentence the neighbouring widened rows carry. DIAG-4 *Message* renderings
    are byte-identical, so the message-only mirror
    `docs/reference/diagnostics.md` (`:93`, `:95`) needs no edit — that page
    transcribes Code/Sev/Phase/Message only, and no whole-registry mirror gate
    exists for these two rows.
  - `docs/spec_topics/expressions.md` — one normative paragraph beside the
    disambiguation sentence bug 0221 extended (`:174`): the field-name and
    field-literal-type rules, the fieldless-alias disposition, omission staying
    legal, and the three deferrals.
  - `tests/statement-executor.test.ts` — `range: span()` on one hand-built
    object `PatternNode` (mechanical type conformance; no assertion moved).
- **Gates:** witness
  `npx vitest run tests/object-pattern-head-field-set-refusal.test.ts` →
  `Tests 32 passed (32)` (RED before the fix: `Tests 10 failed | 20 passed
  (30)` at the 30-cell first cut, every red `actual diagnostics: []` with the
  wrong arm answered). Locks together → `97 passed (97)`. Full default suite
  `npm test` → `Test Files 367 passed (367)` / `Tests 7522 passed (7522)`
  (baseline at HEAD: 366 / 7490). `npm run typecheck` → clean. `npm run lint` →
  clean. Live H8a
  `tests/live/object-pattern-head-field-set-live-cell-CELL-B.test.ts` →
  `Tests 1 passed (1)`; bug 0221's and bug 0219's live cells re-run green
  alongside it.
- **Review:** 2 rounds. Round 1 (`bug-fix-reviewer`) — CLEAN, four
  non-blocking residuals (no witness cell for the constructor-inner recursion;
  two avoidable `as` casts; a banned word in two test comments; the widened
  Trigger's enumeration omitting the head-only `schema` form), all four fixed
  in one `bug-fix-fixer-light` round. Round 2 (`bug-fix-reviewer-fast`,
  confirmation for the one executable hunk) — CLEAN, no new findings, with the
  new cells' red direction proved by deleting each `case "constructor"` branch
  in turn and restoring hash-verified.
- **Verification:** VERIFIED. (1) The witness reds without the fix in BOTH
  halves independently: neutralising the field-NAME call reds 7 cells (`a1`,
  `a2`, `a5`, `a6`, `a7`, `x3`, `x7`), neutralising the field-TYPE call reds 5
  (`a3`, `a4`, `b8b`, `x6`, `x8`), each with `actual diagnostics: []` and the
  bug's own wrong-arm value; both files restored and hash-verified
  (`40502d38…`, `05c63c58…`), 32/32 green after. (2) Full default suite green,
  367 files / 7522 tests. (3) Live: the new H8a cell plus bug 0221's and bug
  0219's cells all green on the first run, under the shared live lock. (4)
  `npm run typecheck` and `npm run lint` clean. Constraint checks: no diff
  under `src/runtime/`; `tests/fixtures/h7a/permitted-codes.json` untouched;
  the corpus census re-derives at 34 files with every object-pattern head
  `QueryError`, and `tests/committed-fixture-parse-gate.test.ts` green — no
  committed fixture is newly refused.
- **Residuals:**
  1. **`theta/parse/integer-narrowing` is a pinned DEFERRAL at the pattern
     position.** A non-integral literal under an `integer`-declared field
     (`Q { a: 1.5 }` where `Q` declares `a: integer`) stays silent, where the
     constructor position narrows. Evidence: witness cell `x4` (`[]`,
     `"other"`), and the `.filter` in `checkPatternFieldTypes`. Cause: a
     `PatternNode` literal carries the parsed JS value and no lexed numeric
     spelling, so `1` and `1.0` are indistinguishable at this position; typing
     every numeric pattern literal as `number` would refuse every integral
     literal under an `integer` field. The refusal that IS owed here is
     unclaimed by any report.
  2. **Only LITERAL field sub-patterns are type-judged.** A shorthand binder
     (`R { a }`) and a nested object / array sub-pattern carry no literal to
     compare, so the field-TYPE half says nothing about them; a nested head is
     judged by its own declaration one level down (cells `a6`, `x2`).
     Structural judgement of a nested sub-pattern against a declared
     inline-object or `array<T>` field type is not attempted.
  3. **Row B8 of §Reproduction (C) is listed among the must-not-move
     boundaries and cannot be one.** Its spelling (`schema R { a: string }` /
     `match Ok(1) { R { a: 1 } … }`) is itself an instance of §Expected
     behaviour 2 — a declared field with an incompatible literal — so it
     refuses under any route that closes A3 and A4. Its SUBJECT (the listed
     field must be present in the value for the wrong arm to fire) is
     preserved field-compatibly in witness cell `b8a`
     (`schema R { a: integer }` → `[]`, `"ok-arm"`), and the document's literal
     spelling is pinned as a refused member of the class in cell `b8b`.
     §Expected behaviour 5's own enumeration of what must not move does not
     list B8, so this is a §Reproduction (C) labelling error, not a route
     conflict.
  4. **Two rows the document does not enumerate move, and are pinned in their
     moved form.** An array ELEMENT's head (`[Q { zz: 1 }]`, cell `x3`) and a
     `null` literal under a `boolean`-declared field (cell `x6`) are members of
     the class by §Expected behaviour 1 and 2 and were not measured in
     §Reproduction; both now refuse, and both are asserted with the reason
     stated in the cell.
  5. **The comment at `src/parser/theta-document.ts:6494`** ("a pattern node
     carries no range") is now imprecise for the object variant specifically.
     Its own point — that `walkCallSiteExpr` uses the arm body's start line
     uniformly across every pattern kind — still holds, and it governs no code
     this fix touches, so it was left byte-identical rather than widening the
     diff.
- **Discharge notes appended:** bug
  [0221](./0221-object-pattern-head-name-unchecked-fires-wrong-arm.md)'s
  `## Fix (0.167.0)` *Residuals* item 1 (the field-set half of its §Expected
  behaviour 3) is DISCHARGED here; its witness cell `a1`
  (`tests/object-pattern-head-unresolved-refusal.test.ts`) is flipped to the
  refusal and re-cited to this report. Bug 0219's cell `v6` keeps its element-2
  subject at a field-COMPATIBLE spelling. No sibling bug document's prose was
  edited by this fix.
- **Pinned dispositions / non-goals:** nominal dispatch stays unimplemented —
  bug 0221 §Fix (c)(5)'s interchangeability boundary does not move (cell `a5`
  there, cell `b1` here), and the empty-braced declared head still captures an
  unrelated value exactly as the bare `{ }` pattern does (cells `b4`, `b5`,
  `x1`). The `enum` head, the imported head and the builtin `QueryError` head
  stay deferrals (cells `b6`, `b7`). `theta/parse/missing-object-field` does
  not follow the field-name check into pattern position (cell `b2`). Bug 0123's
  `parsePattern` recovery tail is byte-identical, and bug 0134's
  positional-drift class was not chased.

### Coordination note — 2026-08-27 (bug 0317 re-vehicles the b4/b5 dispatch half)

Bug [0317](./0317-object-pattern-matches-enum-result-carriers.md) adds a
brand gate (`isObjectValue`) at the top of `matchPattern`'s object arm, so a
`Result`/enum carrier no longer takes the object arm. This legitimately changes
the RUNTIME DISPATCH of this witness's cells `b4` and `b5`, whose VEHICLE was an
`Ok(1)` Result carrier: the empty-braced head `R { }` (b4) and the bare `{ }`
pattern (b5) now fail to match that carrier and control falls through to
`Ok(v) => "ok-arm"` (was `"r-arm"` / `"bare-arm"`, flipped by execution, not
assumed).

This is a re-vehicle, not a subject change. 0226's SUBJECT in b4/b5 — that an
empty/bare object-pattern head draws NO head-field-set refusal at the parse
layer — is preserved untouched: those cells still assert a `[]` diagnostic list
via `expectClean`, and that assertion is byte-unchanged. Only the dispatch half
(which arm a Result carrier reaches) moved, and that half is now re-owned by
0317's brand gate rather than by 0226's Result-carrier non-goal. The
"Pinned dispositions / non-goals" note above ("the empty-braced declared head
still captures an unrelated value exactly as the bare `{ }` pattern does") is
superseded FOR A `Result` CARRIER only: b4/b5 still capture an unrelated
OBJECT-branded value identically; a `Result`/enum carrier now falls through.
Parent-ratified (Option A) as VEHICLE-COLLATERAL of bug 0317; the flip and its
rationale comments are confined to those two cells in
`tests/object-pattern-head-field-set-refusal.test.ts` (every other cell
byte-untouched). Append-only note; no prior 0226 prose was edited.
