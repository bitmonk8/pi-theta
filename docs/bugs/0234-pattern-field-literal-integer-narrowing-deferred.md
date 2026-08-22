# Bug 0234 — At a `match` object-pattern head, a `number`-spelled literal under an `integer`-declared field draws nothing: `match d { Q { a: 1.0 } => … }` where `schema Q { a: integer }` draws `[]`, registers, and selects the arm, while `Q { a: 1.0 }` in the CONSTRUCTOR position and the same literal at a typed `let`, a `params:` default, a reassignment and an `array<integer>` element each draw `theta/parse/integer-narrowing`

- **Status:** fixed (0.204.0). Filed as bug
  [0226](./0226-declared-object-pattern-head-field-set-unchecked.md)'s
  `## Fix (0.176.0)` *Residuals* item 1 (`:710`): "`theta/parse/integer-narrowing`
  is a pinned DEFERRAL at the pattern position … The refusal that IS owed here is
  unclaimed by any report." Re-measured at HEAD for this filing, not copied from
  that record. **Ordering:** no report blocks this one; bug 0226 is fixed and
  shipped, and its witness cell `x4` is the pinning byte this report authorises
  to move.
- **Sev/Diff estimate:** S3/D2 — S3 because no value corrupts and the spec as
  written licenses the silence, while a registered verdict the compatibility
  relation DOES compute is discarded at exactly one sink:
  `checkObjectFieldCompat` (`src/parser/type-compat.ts:526`) answers
  `theta/parse/integer-narrowing` at `:540` for a `number` literal under an
  `integer`-declared field and `checkPatternFieldTypes`
  (`src/parser/type-layer-checks.ts:2191`) filters that code out at `:2230`, so
  `Q { a: 1.0 }` and `Q { a: 1e10 }` load clean at a pattern head
  (§Reproduction A2, A4) and are refused by every other TYPE-2 sink measured —
  constructor (B1), typed `let` (B5), `params:` default (B6), reassignment (B7),
  `array<integer>` element (B8). D2 because the input the check needs is present
  at the site and dropped by one line: the lexed token carries `numericType`
  (`src/lexer/lexer.ts:636`, pushed `:660`, field declared `:54`) and the
  EXPRESSION path preserves it (`src/parser/theta-document.ts:4069`), while
  `parsePattern`'s number branch discards it (`:4421`,
  `{ kind: "literal", value: Number(t.text) }`), so the route is one parser
  subsystem, no new registry code, and one existing witness cell to flip.
- **Kind:** defect — implementation and spec together, one mechanism.
  1. **The relation's narrowing verdict is discarded at the pattern position.**
     `checkPatternFieldTypes` routes every LITERAL field sub-pattern through
     `checkObjectFieldCompat` and then filters the result to
     `theta/parse/object-field-type-mismatch` alone
     (`src/parser/type-layer-checks.ts:2230`). A string literal under an
     `integer` field therefore refuses (§Reproduction A5) and a `number` literal
     under the same field does not (A1–A4).
  2. **The type a pattern literal is given is spelling-blind, and the spelling
     is available at the site.** `patternLiteralType`
     (`src/parser/type-layer-checks.ts:1250`) types a numeric pattern literal
     `integer` when `Number.isInteger(value)` and `number` otherwise. That is
     the parsed JS value's shape, not the source spelling: `1.0` and `1e10` are
     `number` literals by `lexical.md:28` ("A literal with no fractional or
     exponent part has type `integer`; otherwise `number`") and both type
     `integer` here. The `PatternNode` literal variant carries `value` alone
     (`src/parser/theta-document.ts:304`) because `parsePattern` drops the
     token's `numericType` at `:4421`; the token itself carries it
     (`src/lexer/lexer.ts:660`).
  3. **The registry states the deferral in one row and contradicts it in
     another.** `theta/parse/integer-narrowing`'s *Trigger*
     (`docs/spec_topics/diagnostics/code-registry-parse.md:27`) is
     position-generic and names no position at all: "`number` value used where
     `integer` is expected (the `integer → number` widening is one-way)." The
     carve-out lives on a different row — `theta/parse/object-field-type-mismatch`
     (`:49`): "The pattern-position TYPE-2 outcome
     (`theta/parse/integer-narrowing`) is a deferral at that position: a pattern
     literal carries no lexed numeric spelling to distinguish `1` from `1.0`."
     The stated cause holds of the NODE and not of the site (element 2), and
     `docs/spec_topics/expressions.md:176` — the paragraph bug 0226 added for
     the pattern position — states the two field checks and says nothing about
     narrowing.
- **Related:**
  - [0226](./0226-declared-object-pattern-head-field-set-unchecked.md) —
    **fixed (0.176.0)**, the origin. Its §Fix landed the field-NAME and
    field-TYPE halves at the pattern head and recorded this one-way case as
    *Residuals* item 1 (`:710`), unclaimed. **Not a duplicate:** that report is
    closed on the two-way literal-compatibility classes it fixed, and its
    witness cell `x4`
    (`tests/object-pattern-head-field-set-refusal.test.ts:1047`) pins this
    class's current `[]` as a deliberate deferral, which is what a report is
    needed to move. Its 32-cell witness is a LOCK apart from `x4` (§Fix
    constraint 4).
  - [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md) —
    **fixed (0.138.0)**, the narrowing row's routing precedent: a sink whose own
    mismatch code exists still routes the `number`-under-`integer` failure to
    `theta/parse/integer-narrowing` rather than minting a second code
    (`:658`, `:843`, `:950`). §Reproduction B7 is that sink measured at HEAD.
  - [0221](./0221-object-pattern-head-name-unchecked-fires-wrong-arm.md) —
    **fixed (0.167.0)**, the head-NAME half one guard up
    (`src/parser/theta-document.ts:4400`). Disjoint subject; its 43-cell witness
    `tests/object-pattern-head-unresolved-refusal.test.ts` is a LOCK.
  - [0219](./0219-reserved-keyword-object-pattern-head-parses-clean.md) —
    **fixed (0.156.0)**, the head's token kind. Disjoint subject; its 54-cell
    witness is a LOCK.
  - [0123](./0123-match-pattern-decrement-draws-neighbouring-codes.md) —
    **open**, `parsePattern`'s one-token recovery tail. Disjoint defect, shared
    function (`src/parser/theta-document.ts:4402`); whichever lands second
    re-measures the other's rows.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for positional drift. Every citation here is
    symbol-named beside its line number and verified at HEAD `4c157bcc`.
- **Affected** (every citation verified against the tree at HEAD `4c157bcc`,
  v0.183.0 — `package.json:3`; symbol-named per bug 0134's adjudication):
  - **The filter that discards the verdict** — `TypeLayerWalk.checkPatternFieldTypes`
    (`src/parser/type-layer-checks.ts:2191`, doc `:2169–:2190`), object arm
    `:2205`, the `checkObjectFieldCompat` call `:2222–:2231` whose
    `.filter((d) => d.code === "theta/parse/object-field-type-mismatch")` at
    `:2230` is the drop. Called per arm from `case "match"`
    (`:2750`, call `:2774`). Its doc comment `:2182–:2189` states the deferral
    and its cause.
  - **The type a pattern literal is given** — `patternLiteralType`
    (`src/parser/type-layer-checks.ts:1250`, doc `:1237–:1249`): `string`,
    `boolean`, `null`, then
    `Number.isInteger(value) ? "integer" : "number"`. The doc comment names the
    constraint it is written against — reading every numeric pattern literal as
    `number` "would turn every integral literal under an `integer`-declared
    field into a spurious narrowing verdict".
  - **The relation that computes the narrowing verdict** —
    `checkObjectFieldCompat` (`src/parser/type-compat.ts:526`, TYPE-9 doc
    `:508–:525`), whose `r === "integer-narrowing"` branch (`:540`) builds the
    `theta/parse/integer-narrowing` diagnostic at `:541–:551`. The outcome is
    minted by `checkCompatible` (`:139`, narrowing return `:334`).
  - **Where the spelling exists and where it is dropped** —
    `Token.numericType` (`src/lexer/lexer.ts:54`, computed `:636` as
    `isFractional ? "number" : "integer"`, pushed `:657–:662`);
    `NumberExpr.numericType` (`src/parser/theta-document.ts:141`) populated on
    the expression path at `:4069` (`t.numericType ?? "integer"`) and read by
    the expression typer (`src/parser/static-type-inference.ts:238`); the
    pattern path at `src/parser/theta-document.ts:4421`
    (`return { kind: "literal", value: Number(t.text) }`) inside `parsePattern`
    (declared `:4402`), which keeps no spelling. The `PatternNode` literal
    variant is `:304`; the object variant's `range` — bug 0226's addition and
    the only range a `PatternNode` carries — is `:306–:320`.
  - **The runtime comparison, which is numeric** —
    `matchPattern`'s literal arm (`src/runtime/match-result.ts:180`) is
    `valuesEqual(value, pattern.value)` (`src/runtime/value.ts:494`), so the
    pattern literal `1.0` matches the field value `1` (§Reproduction A2). No
    value is corrupted; the arm answers.
  - **The registration gate** — `hasLoadParseError`
    (`src/extension/production-composition.ts:2220`): any error-severity
    `theta/load/` or `theta/parse/` code. Every (A) row draws none.
  - **The narrowing row's registered *Trigger*, and the positions it names** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:27`. It names NO
    position: severity `E`, phase `type`, *Trigger* "`number` value used where
    `integer` is expected (the `integer → number` widening is one-way).",
    *Spec ref* `Lexical — Number literals`, *Message* `cannot narrow number to
    integer`. So an emission at a pattern head widens no enumeration, and the
    current silence is licensed only by another row's text (next bullet).
    The message-only mirror is `docs/reference/diagnostics.md:73`.
  - **The row that states the deferral** —
    `code-registry-parse.md:49`
    (`theta/parse/object-field-type-mismatch`), whose bug-0226 widening carries:
    "The pattern-position TYPE-2 outcome (`theta/parse/integer-narrowing`) is a
    deferral at that position: a pattern literal carries no lexed numeric
    spelling to distinguish `1` from `1.0`, so an integral literal types
    `integer` and a non-integral one types `number`, never a narrowing verdict."
    Moving it either way is DIAG-2 (`diagnostic-shape.md:72`); the *Message*
    column of either row is DIAG-4 (`:74`) and is not touched.
  - **The spec text on both sides** — `docs/spec_topics/lexical.md:28` (the
    literal typing rule and "the reverse is `theta/parse/integer-narrowing`"),
    `docs/spec_topics/type-system.md:36` (TYPE-2) and `:52` (TYPE-9's sink
    enumeration, which lists the `let`, `fn`-argument, `params:`-default and
    reassignment sinks and routes the "one-way `number`-under-`integer` case" to
    the narrowing row), `docs/spec_topics/expressions.md:171` (the
    Object/schema pattern row), `:174` (bug 0221's disambiguation sentence) and
    `:176` (bug 0226's pattern-position paragraph, which states the field-name
    and field-literal-type rules and is silent on narrowing).
  - **The pinning witness** —
    `tests/object-pattern-head-field-set-refusal.test.ts` (32 cells): `:1047`
    cell `x4` (`[PINNED DEFERRAL]`) asserts `[]` and the answered `"other"` for
    `Q { a: 1.5 }` under `a: integer`, with the reason in the cell comment
    (`:1048–:1055`) and the group header at `:982–:987` listing `x4` among the
    rows that "must stay green". No cell measures the integral-valued `number`
    spellings `1.0` and `1e10` (§Reproduction A2, A4).
    `tests/object-pattern-head-unresolved-refusal.test.ts` (43 cells) and
    `tests/reserved-keyword-object-pattern-head-refusal.test.ts` (54 cells) are
    locks. All three green at HEAD, measured `129 passed (129)`.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` lists 34 files at
    HEAD; three carry an object-pattern arm and every one heads it `QueryError`
    (`docs/examples/handle-error.theta:14`,
    `docs/examples/fan-out-reviews.theta:31`,
    `docs/examples/configure-tool-loop.theta:10`), a builtin name with no
    same-file field bodies, so `checkPatternFieldTypes`'s
    `declaredFieldsOf` lookup defers and no committed file carries a numeric
    pattern literal under a declared `integer` field.
    `tests/committed-fixture-parse-gate.test.ts` is what discharges a
    corpus-wide claim; per bug
    [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) it filters
    `.theta` only, so the `.thetalib` half of the sweep is a probe.
- **Observed at:** v0.183.0 (`4c157bcc`, `package.json:3`). Offline,
  deterministic, provider-free, zero model turns: scratch vitest probes
  (filenames containing `scratch`; written, run, deleted) driving the real
  `parseThetaDocument` through `tests/helpers/e2e-s1.ts`'s `parseDoc` and the
  real `executeBody` through the shipped production producer deps
  (`createProductionProducerDeps` + `bindPromptConversation`), the harness shape
  of `tests/object-pattern-head-field-set-refusal.test.ts:461–:552`. Every value
  below is that run's output verbatim. `src/`, `tests/`, other bug documents and
  `docs/bugs/README.md` are unmodified by this filing.

## Summary

Bug 0226 landed the field-TYPE half of the `match` object-pattern head: a
LITERAL field sub-pattern is judged against the head's declared field type
through `checkObjectFieldCompat`, the same relation the constructor position
uses. The routing is one-directional by construction — the result is filtered to
`theta/parse/object-field-type-mismatch`, so the relation's other verdict,
`theta/parse/integer-narrowing` for a `number` value under an `integer`-declared
field, is computed and dropped.

Two things follow. A non-integral literal (`Q { a: 1.5 }` under
`schema Q { a: integer }`) draws `[]` and cannot match, which bug 0226's cell
`x4` pins. And an integral-VALUED literal spelled as a `number` — `1.0`,
`1e10` — draws `[]`, registers, and selects its arm, because
`patternLiteralType` types by `Number.isInteger` on the parsed value while
`lexical.md:28` types by the source spelling. The same two spellings are refused
with `theta/parse/integer-narrowing` at the constructor position, at a typed
`let`, at a `params:` default, at a reassignment and at an `array<integer>`
element.

The spelling is not lost at the lexer. `Token.numericType`
(`src/lexer/lexer.ts:636`) distinguishes `1` from `1.0`, the expression path
carries it onto `NumberExpr` (`src/parser/theta-document.ts:4069`), and
`parsePattern`'s number branch (`:4421`) discards it. The registry states the
opposite as the deferral's cause: `code-registry-parse.md:49` says "a pattern
literal carries no lexed numeric spelling", which holds of the node bug 0226
built and not of the token at the site.

## Reproduction

Zero model turns, no provider contacted. Every fixture is a whole prompt-mode
theta (`---\nmode: prompt\n---\n`, three lines of frontmatter); a body's last
statement reads the `match` result, so the reported value IS the selected arm.
`diags` is the whole unfiltered list in emission order. `[]` means the theta
registers: `hasLoadParseError`
(`src/extension/production-composition.ts:2220`) needs one error-severity
`theta/load/` or `theta/parse/` code.

### (A) The class — a `number`-spelled literal under an `integer`-declared field, at a pattern head

| row | source under test (`/` = newline) | diags | value |
| --- | --- | --- | --- |
| A1 non-integral | `schema Q { a: integer }` / `let d = Q { a: 1 }` / `let r = match d { Q { a: 1.5 } => "n-arm", _ => "other" }` / `r` | `[]` | `"other"` |
| A2 **THE SHARP ROW** — integral-valued `number` spelling | `schema Q { a: integer }` / `let d = Q { a: 1 }` / `let r = match d { Q { a: 1.0 } => "n-arm", _ => "other" }` / `r` | `[]` | `"n-arm"` |
| A3 A2 with the correct arm present below | `schema Q { a: integer }` / `let d = Q { a: 1 }` / `let r = match d { Q { a: 1.0 } => "n-arm", Q { a: 1 } => "i-arm", _ => "other" }` / `r` | `[]` | `"n-arm"` |
| A4 exponent spelling | `schema Q { a: integer }` / `let d = Q { a: 1 }` / `let r = match d { Q { a: 1e10 } => "e-arm", _ => "other" }` / `r` | `[]` | `"other"` |
| A5 control — the type half DOES fire | `schema Q { a: integer }` / `let d = Q { a: 1 }` / `let r = match d { Q { a: "x" } => "s-arm", _ => "other" }` / `r` | `error theta/parse/object-field-type-mismatch @6:19-6:31: field 'a' on schema 'Q' type mismatch: expected integer, got string` | `"other"` |
| A6 nested | `schema Inner { z: integer }` / `schema Outer { i: Inner }` / `let d = Outer { i: Inner { z: 1 } }` / `let r = match d { Outer { i: Inner { z: 1.5 } } => "in-arm", _ => "none" }` / `r` | `[]` | `"none"` |
| A7 array element | `schema Q { a: integer }` / `let d = [Q { a: 1 }]` / `let r = match d { [Q { a: 1.5 }] => "arr-arm", _ => "other" }` / `r` | `[]` | `"other"` |

A1 is bug 0226's cell `x4` re-measured. A2 is the row no cell measures: `1.0` is
a `number` literal by `lexical.md:28`, `Q` declares `a: integer`, the arm loads
clean and fires — `valuesEqual` (`src/runtime/value.ts:494`) compares `1.0` to
the field value `1` numerically, so the answer is not wrong, only unrefused. A3
places the correctly-spelled arm below it and the `number`-spelled arm still
takes the value. A4 is the exponent spelling of the same class, integral-valued
and non-matching here. A5 is the control that the field-TYPE half is wired at
this position at all. A6 and A7 show the deferral following
`checkPatternFieldTypes`'s recursion into object field sub-patterns and array
elements.

### (B) Every other TYPE-2 sink refuses the same spellings

| row | source under test | diags |
| --- | --- | --- |
| B1 constructor, `1.5` | `schema Q { a: integer }` / `let d = Q { a: 1.5 }` / `d` | `error theta/parse/integer-narrowing @5:16-5:19: cannot narrow number to integer` |
| B2 constructor, `1.0` | `schema Q { a: integer }` / `let d = Q { a: 1.0 }` / `d` | `error theta/parse/integer-narrowing @5:16-5:19: cannot narrow number to integer` |
| B3 constructor, `1e10` | `schema Q { a: integer }` / `let d = Q { a: 1e10 }` / `d` | `error theta/parse/integer-narrowing @5:16-5:20: cannot narrow number to integer` |
| B4 typed `let`, `1.5` | `let n: integer = 1.5` / `n` | `error theta/parse/integer-narrowing @4:1-4:21: cannot narrow number to integer` |
| B5 `params:` default, `1.0` | frontmatter `params:` / `  p: integer = 1.0` | `error theta/parse/integer-narrowing: cannot narrow number to integer` (plus the probe's own `theta/parse/unknown-identifier` for the body reference) |
| B6 reassignment, `1.0` | `let mut n: integer = 1` / `n = 1.0` / `n` | `error theta/parse/integer-narrowing @5:1-5:8: cannot narrow number to integer` |
| B7 `array<integer>` element, `1.0` | `let a: array<integer> = [1.0]` / `a` | `error theta/parse/integer-narrowing @4:1-4:30: cannot narrow number to integer`, `error theta/parse/array-element-type-mismatch @4:25-4:30: array element type mismatch at index 0: expected integer, got number` |
| B8 boundary — `fn` argument routes its OWN code | `fn f(x: integer) { x }` / `f(1.0)` | `error theta/parse/fn-arg-type-mismatch @5:3-5:6: fn 'f' argument 0 ('x') type mismatch: expected integer, got number` |

B2 and B3 are A2's and A4's spellings one position over: the constructor
position reads `NumberExpr.numericType` and refuses. B4–B7 are the four sinks
`type-system.md:52` and `code-registry-parse.md:27` cover, each routing the
one-way case to the narrowing row. B8 is the measured exception and is NOT part
of this class: a plain `fn`-argument slot reports
`theta/parse/fn-arg-type-mismatch` for the same input, so "every sink routes
narrowing" is false as a general claim and the pattern position is judged
against the field-value sinks (B1–B3) it mirrors.

### (C) Boundaries — measured, and NOT claimed

| row | source under test | diags | value |
| --- | --- | --- | --- |
| C1 integral literal under `integer` | `schema Q { a: integer }` / `let d = Q { a: 1 }` / `let r = match d { Q { a: 1 } => "i-arm", _ => "other" }` / `r` | `[]` | `"i-arm"` |
| C2 integral literal under `number` (TYPE-2 widening) | `schema Q { a: number }` / `let d = Q { a: 1 }` / `let r = match d { Q { a: 1 } => "n-arm", _ => "other" }` / `r` | `[]` | `"n-arm"` |
| C3 non-integral under `number` | `schema Q { a: number }` / `let d = Q { a: 1.5 }` / `let r = match d { Q { a: 1.5 } => "n-arm", _ => "other" }` / `r` | `[]` | `"n-arm"` |
| C4 shorthand binder | `schema Q { a: string }` / `let d = Q { a: "x" }` / `let r = match d { Q { a } => a, _ => "other" }` / `r` | `[]` | `"x"` |

C1 is the row every route must keep silent — an `integer`-spelled literal under
an `integer` field. C2 is TYPE-2's one-way widening in the direction that is
legal (`type-system.md:36`) and stays legal. C3 is a `number` literal under a
`number` field. C4 is bug 0226's cell `x5`: a shorthand carries no literal, so
the field-TYPE half says nothing about it and this report adds nothing.

### (D) The committed corpus

`git ls-files -- '*.theta' '*.thetalib'` → **34 files**. Three carry an
object-pattern arm, every one of them headed `QueryError`:

```
docs/examples/configure-tool-loop.theta:10:  Err(QueryError { kind: "tool_loop_exhausted" }) =>
docs/examples/fan-out-reviews.theta:31:    Err(QueryError { kind: "cancelled" }) => "a review was cancelled",
docs/examples/handle-error.theta:14:  Err(QueryError { kind: "validation", cause: "schema_validation" }) =>
```

Every listed field there carries a string literal and `QueryError` supplies no
same-file object body, so a narrowing verdict at a pattern head newly refuses no
committed file. That bounds the corpus half of a GOV-15 sweep; it does not
discharge it, because every (A) row loads cleanly today.

## Expected behaviour

1. **The pattern position and the constructor position agree on TYPE-2, or the
   registry says which one is law.** Today the relation computes the narrowing
   verdict and one caller drops it (`src/parser/type-layer-checks.ts:2230`)
   while the registered row for that verdict names no position
   (`code-registry-parse.md:27`). One of the two dispositions in `## Fix` is
   recorded, and the row that carries the rule states it.
2. **A `number`-spelled literal under an `integer`-declared field is judged by
   its SOURCE spelling wherever it is judged at all.** `lexical.md:28` types
   `1.0` and `1e10` as `number`; `patternLiteralType`
   (`src/parser/type-layer-checks.ts:1250`) types them `integer`. Rows A2, A3
   and A4 are the observable: either they refuse, or the registry states that a
   pattern literal is typed by its VALUE and the `1.0`/`1` distinction does not
   exist at this position.
3. **An `integer`-spelled literal under an `integer` field stays silent.** C1
   keeps `[]` and its value under either disposition.
4. **TYPE-2's legal direction stays legal.** C2 and C3 keep `[]` and their
   values.
5. **Nothing else moves.** A5's `object-field-type-mismatch` keeps its code,
   range and message; C4's shorthand stays unjudged; bug 0226's 32-cell witness
   stays green apart from the cells this report's disposition moves (§Fix
   constraint 4); bug 0221's 43 cells and bug 0219's 54 cells keep their codes,
   counts and ranges; the three committed `Err(QueryError { … })` arms stay
   clean.

## Actual behaviour / root cause

**One caller filters the verdict out.** `checkPatternFieldTypes`
(`src/parser/type-layer-checks.ts:2191`) reaches each object pattern's LITERAL
field sub-patterns, looks the declared field type up, calls
`checkObjectFieldCompat` (`src/parser/type-compat.ts:526`) — and appends
`.filter((d) => d.code === "theta/parse/object-field-type-mismatch")` at
`:2230`. `checkObjectFieldCompat` returns the narrowing diagnostic at `:540`
whenever `checkCompatible` (`:139`) answers `"integer-narrowing"` (`:334`), so
for `Q { a: 1.5 }` under `a: integer` the diagnostic is built and discarded. The
doc comment above the method (`:2182–:2189`) records the drop as deliberate.

**The type given to a pattern literal is computed from the value, not the
spelling.** `patternLiteralType` (`:1250`) returns
`{ kind: "literal", typesAs: Number.isInteger(value) ? "integer" : "number" }`.
For `1.0` and `1e10` that is `integer`, so `checkCompatible` answers
`"compatible"` against an `integer`-declared field and no verdict of any kind is
computed — the filter is not even reached. This is why A2 and A4 differ from A1
in mechanism though not in observable: A1's verdict is computed and dropped,
A2's is never computed.

**The spelling is dropped in `parsePattern`, not absent.** The lexer tags every
numeric token (`src/lexer/lexer.ts:636`, `isFractional ? "number" : "integer"`,
pushed at `:657–:662`, field declared `:54`). The expression path carries the tag
onto `NumberExpr` (`src/parser/theta-document.ts:4069`,
`numericType: t.numericType ?? "integer"`) and the expression typer reads it
(`src/parser/static-type-inference.ts:238`). `parsePattern`'s number branch
(`src/parser/theta-document.ts:4421`) returns
`{ kind: "literal", value: Number(t.text) }`, so the `PatternNode` literal
variant (`:304`) carries the parsed value alone.

**The runtime compares numerically, so no value is corrupted.**
`matchPattern`'s literal arm (`src/runtime/match-result.ts:180`) is
`valuesEqual(value, pattern.value)` (`src/runtime/value.ts:494`). A2's arm fires
because `1.0 === 1`, and its answer is the same answer the correctly-spelled arm
would give (A3). The defect is the missing refusal, not a wrong result.

**Registration has no backstop.** Every (A) row draws `[]`, so
`hasLoadParseError` (`src/extension/production-composition.ts:2220`) passes.

**The registry carries the rule on the wrong row.**
`theta/parse/integer-narrowing`'s *Trigger* (`code-registry-parse.md:27`) names
no position, and the pattern-position exemption is stated inside
`theta/parse/object-field-type-mismatch`'s *Trigger* (`:49`) with a cause — "a
pattern literal carries no lexed numeric spelling" — that describes the node
bug 0226 built rather than the token at the site.
`docs/spec_topics/expressions.md:176` states the pattern position's two field
checks and is silent on narrowing.

## Why it matters

- **A spelling refused at five other sinks loads clean at this one.** B1–B3, B4,
  B5, B6 and B7 refuse `1.0` / `1.5` / `1e10` under an `integer` target; A1–A4
  admit them. Moving a literal from `Q { a: 1.0 }` (constructor, refused) into
  `match d { Q { a: 1.0 } … }` (pattern, silent) is a copy-paste away, and A3
  shows it beating the correctly-spelled arm below it.
- **The stated cause is contradicted by the tree.** Any later reader of
  `code-registry-parse.md:49` or `type-layer-checks.ts:2185` concludes the
  spelling is unavailable at the pattern position; `src/lexer/lexer.ts:660` and
  `src/parser/theta-document.ts:4069` show it is available and dropped at
  `:4421`.
- **The deferral is asserted, so it cannot drift closed.** Cell `x4`
  (`tests/object-pattern-head-field-set-refusal.test.ts:1047`) pins A1's `[]`
  and `"other"`. A fix moves an asserted byte on purpose.
- **The one-way case is the only TYPE-2 outcome without a pattern-position
  disposition anywhere.** The two-way incompatibility is settled (A5 refuses),
  the widening direction is settled (C2 is legal), and this row is stated as an
  exemption on a neighbouring code's *Trigger*.

## Non-goals

- **Structural judgement of non-literal sub-patterns.** A shorthand binder (C4)
  and a nested object / array sub-pattern carry no literal to compare; bug
  0226's *Residuals* item 2 owns that gap. Untouched here.
- **Nominal dispatch for object patterns.** Bug 0221 §Fix (c)(5)'s
  clean-by-design interchangeability boundary. This report changes no dispatch.
- **The field-NAME half.** Bug 0226's landed `theta/parse/extra-object-field`
  emission at a pattern head keeps its code, range and message.
- **The `fn`-argument sink's code choice.** B8 routes
  `theta/parse/fn-arg-type-mismatch` rather than the narrowing row; that
  divergence is registered (`type-system.md:52`) and is not this report's
  subject.
- **The `enum`, imported and builtin heads.** They supply no same-file object
  body, so no declared field type exists to narrow against (bug 0226's cells
  `b6`, `b7`). They stay deferrals.
- **`parsePattern`'s one-token recovery tail.** Bug 0123's.
- **Citation drift in other documents.** Bug 0134's adjudicated class.

## Fix

The subject is a computed verdict discarded at one sink whose registered row
names no position, so the route is defined by which of the two available
statements becomes law. Both are DIAG-2 (`diagnostic-shape.md:72`) and both
carry their spec edit in the same commit as the code or witness change.

**Disposition 1 — the pattern position narrows.**
`theta/parse/integer-narrowing`'s *Trigger* (`code-registry-parse.md:27`) is
widened to name the `match` object-pattern head explicitly, the exemption
sentence on `theta/parse/object-field-type-mismatch` (`:49`) is replaced by the
emission rule, `expressions.md:176` gains the sentence, and the implementation
stops discarding the verdict: the `.filter` at
`src/parser/type-layer-checks.ts:2230` admits both codes, and
`patternLiteralType` (`:1250`) is fed the source spelling — which requires
`parsePattern`'s number branch (`src/parser/theta-document.ts:4421`) to carry
the token's `numericType` (`src/lexer/lexer.ts:660`) onto the `PatternNode`
literal variant (`:304`), as the expression path already does at `:4069`.
Without that carriage the widening closes A1 and A6/A7 only and leaves A2 and
A4 silent, since their verdict is never computed.

**Disposition 2 — the deferral is law.** The exemption moves onto the row that
owns it: `theta/parse/integer-narrowing`'s *Trigger* (`:27`) states that a
`match` pattern field literal is typed by its VALUE and draws no narrowing
verdict, `code-registry-parse.md:49`'s cause clause is corrected to name the
node shape and `parsePattern`'s drop rather than an absent spelling,
`expressions.md:176` states the rule, and `type-layer-checks.ts:2185`'s comment
is corrected the same way. No executable line moves; cell `x4` gains cells for
A2 and A4 in their measured form.

Constraints bound both.

1. **The `1.0` / `1e10` rows decide the disposition's completeness, not the
   `1.5` row.** A1's verdict is computed and filtered; A2's and A4's are never
   computed (`patternLiteralType`'s `Number.isInteger`). A route that only
   removes the `.filter` closes A1 and leaves A2 and A4 exactly as they are, so
   whichever disposition is taken must state its answer for the integral-valued
   `number` spellings by name.
2. **No runtime dispatch change.** `matchPattern`'s literal arm
   (`src/runtime/match-result.ts:180`), `valuesEqual`
   (`src/runtime/value.ts:494`) and `toRuntimePattern`
   (`src/runtime/statement-executor.ts:1133`) stay byte-identical. Under
   disposition 1 the refusal is carried by the error-severity diagnostic that
   `hasLoadParseError` (`src/extension/production-composition.ts:2220`) turns
   into a registration denial, exactly as bug 0226's two landed halves are.
3. **The silent rows stay silent.** C1 (`integer` literal under `integer`), C2
   and C3 (TYPE-2's legal direction), C4 (the shorthand) and A5's single
   existing diagnostic keep their codes, counts, ranges and values. A route
   that reds C1 has typed every integral pattern literal `number`, the failure
   `patternLiteralType`'s doc comment (`:1237–:1249`) names.
4. **The three witnesses are locks, with a disposition-scoped flip.**
   `tests/object-pattern-head-field-set-refusal.test.ts` (32 cells),
   `tests/object-pattern-head-unresolved-refusal.test.ts` (43 cells) and
   `tests/reserved-keyword-object-pattern-head-refusal.test.ts` (54 cells) are
   green as written at HEAD (measured: `129 passed (129)`). Under disposition 1
   the single flip authorised is cell `x4` (`:1047`), which moves with its
   comment re-cited to this report; under disposition 2 no cell flips. Every
   other cell in all three files is a lock. A red elsewhere means the route
   reached a position outside a `match` object-pattern field literal.
5. **DIAG-4 is untouched.** Neither row's *Message* moves:
   `cannot narrow number to integer` (`code-registry-parse.md:27`) and
   `field '<field>' on schema '<schema>' type mismatch: expected <expected>, got
   <actual>` (`:49`) stay character-for-character, so the message-only mirror
   `docs/reference/diagnostics.md:73` needs no edit and
   `tests/fixtures/h7a/permitted-codes.json` is byte-untouched — no code is
   minted under either disposition.
6. **One diagnostic per construct.** Under disposition 1 a field literal draws
   at most one code: the narrowing row or `object-field-type-mismatch`, never
   both, and a head already refused by bug 0221's name check or bug 0219's
   token-kind guard draws that code alone.
7. **The range is the one a `PatternNode` carries.** Bug 0226's object-variant
   `range` (`src/parser/theta-document.ts:306–:320`) spans the whole pattern,
   and A5 measures the consequence (`@6:19-6:31`). A narrowing emission uses
   the same range; a per-field range is a separate node-shape change and is not
   in scope.
8. **GOV-15 is discharged from a re-run sweep.** §Reproduction (D)'s census (34
   files, three object-pattern arms, every head `QueryError`, every listed field
   a string literal) is a measurement at `4c157bcc`, not a licence: re-derive it
   in the witness with a regex that admits the committed `})` shape, failing
   loudly on an empty `git ls-files` result, plus
   `tests/committed-fixture-parse-gate.test.ts`. Per bug 0132 that gate filters
   `.theta` only, so the `.thetalib` half stays a probe.
9. **Bug 0123's subject is untouched.** `parsePattern`'s one-token recovery tail
   (`src/parser/theta-document.ts:4402`) keeps its behaviour and its exact code
   list; whichever of the two fixes lands second re-measures the other's rows.

**Witness — offline, provider-free.** Cells on bug 0226's witness shape
(`parseDoc` from `tests/helpers/e2e-s1.ts`, whole-list ordered `toEqual` over
unfiltered `doc.diagnostics`, expected messages read from the registry through
the `registryMessage` oracle, and any wrong-arm row asserted as a registration
DENIAL carrying the answered arm in the failure payload, since dispatch does not
move). Required cells: A1, A2, A3, A4 in the disposition's form; A5, C1–C4 as
must-not-move boundaries; A6 and A7 for the recursion into nested and array
positions; B1–B3 as the constructor-position controls and B4–B7 as the
cross-sink controls; a registry cell asserting the *Trigger* text that carries
the rule; and the corpus cell of constraint 8. Under disposition 1 a live cell
is owed on bug 0226's precedent, since the route changes a registration outcome.

## Provenance

- **Origin:** bug 0226's `## Fix (0.176.0)` *Residuals* item 1 (`:710`):
  "**`theta/parse/integer-narrowing` is a pinned DEFERRAL at the pattern
  position.** A non-integral literal under an `integer`-declared field
  (`Q { a: 1.5 }` where `Q` declares `a: integer`) stays silent, where the
  constructor position narrows. Evidence: witness cell `x4` (`[]`, `"other"`),
  and the `.filter` in `checkPatternFieldTypes` … The refusal that IS owed here
  is unclaimed by any report."
- **Ownership check performed before any probe.** `rg -l 'integer-narrowing'
  docs/bugs/` returns 21 documents; every one whose subject is a narrowing sink
  is **fixed** (0031, 0050, 0066, 0083, 0089, 0090, 0115, 0125, 0126, 0129,
  0136, 0142, 0145, 0163, 0166, 0175, 0192, 0193, 0222, 0226), and the one open
  document in the list, [0152](./0152-modulo-zero-result-type-not-number.md),
  claims the modulo result type. No document claims the pattern position. Bug
  0226's whole record was read first, including its §Fix constraints and all
  five residuals.
- **Re-measured at HEAD `4c157bcc` (v0.183.0), not copied.** The residual's row
  reproduces (A1), and the measurement adds four rows the residual does not
  state: the integral-valued `number` spellings `1.0` (A2, which SELECTS the arm
  and beats a correctly-spelled arm below it, A3) and `1e10` (A4), whose verdict
  is never computed rather than filtered; the deferral following the recursion
  into nested and array positions (A6, A7); the five cross-sink controls that
  refuse the same spellings (B1–B7); and the measured exception (B8, the
  `fn`-argument sink's own code). Also measured: the available-but-dropped
  spelling at `src/parser/theta-document.ts:4421` against
  `src/lexer/lexer.ts:660` and `:4069`, which contradicts the cause stated at
  `code-registry-parse.md:49` and `src/parser/type-layer-checks.ts:2185`.
- **Measurement:** scratch vitest probes (filenames containing `scratch`),
  written, run, and deleted; one case-insensitive sweep of `git status --short`
  at exit reports no scratch file of this filing's in the tree. Zero model
  turns, no provider contacted. The three lock files were run at HEAD for their
  counts: `129 passed (129)` (32 + 43 + 54).
- **Not verified end to end:** nothing in §Reproduction is inferred — every
  `diags` and `value` cell is that run's output verbatim, through the real
  `parseThetaDocument` and the real `executeBody` over the shipped production
  producer deps. Row B5's second diagnostic
  (`theta/parse/unknown-identifier`) is the probe body's own artefact, stated
  rather than filtered.

## Fix (0.204.0)

**Disposition settled: 1 — the pattern position narrows.** Recorded reasoning,
inside the nine constraints: the narrowing row's *Trigger*
(`code-registry-parse.md:27`) named no position, so an emission widens no
enumeration; the deferral's registered cause ("a pattern literal carries no
lexed numeric spelling") is false at the site — `Token.numericType`
(`src/lexer/lexer.ts:636`) reaches `parsePattern` and was dropped there;
`lexical.md:28` makes the SOURCE spelling normative; and five sibling sinks
refuse the identical spellings (§Reproduction B1–B7). Disposition 2 would have
registered a position where `1.0` is typed by its value against a spec that
types it by its spelling. Constraint 1 is answered by name: the integral-valued
`number` spellings `1.0` and `1e10` refuse, because the token's spelling is
carried, not only because the `.filter` is gone.

- **What shipped:**
  - `src/parser/theta-document.ts` — `PatternNode`'s literal variant gains an
    optional `numericType`; `BodyParser.parsePattern`'s number branch carries
    the token's lexed spelling, set only for a `"number"` spelling (an absent
    field reads as the `integer` default, mirroring the expression path's own
    `t.numericType ?? "integer"` read).
  - `src/parser/type-layer-checks.ts` — `patternLiteralType` takes that
    spelling and types by it (falling back to `Number.isInteger`);
    `TypeLayerWalk.checkPatternFieldTypes` passes `sub.numericType` and keeps
    `checkObjectFieldCompat`'s WHOLE result, the `.filter` deleted. Both doc
    comments state the emission rule instead of the deferral.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — DIAG-2, both rows
    in the same change: `:27`'s *Trigger* widened to name the `match`
    object-pattern position and the source-spelling rule, with its GOV-15
    sentence; `:49`'s deferral sentence replaced by the mutual-exclusion
    emission rule. Neither *Message* column moves (constraint 5), so
    `docs/reference/diagnostics.md` and `tests/fixtures/h7a/permitted-codes.json`
    are byte-untouched.
  - `docs/spec_topics/expressions.md` — the pattern-position paragraph gains
    the narrowing sentence. `type-system.md:52` (TYPE-9) deliberately NOT
    edited: its enumeration is the five sites that mint their own code, and the
    schema-CONSTRUCTOR field position is likewise absent from it.
  - `tests/object-pattern-head-field-set-refusal.test.ts` — bug 0226's cell
    `x4`, the single flip constraint 4 authorises, moved from the pinned `[]`
    to the narrowing refusal at the whole-pattern range; the other 31 cells
    unmoved.
- **Gates:** witness RED at the fork point — 8 cells (`r2`, `r3`, `a1`, `a2`,
  `a3`, `a4`, `a6`, `a7`), reproduced by the verifier's revert (`Tests 9 failed
  | 48 passed (57)` with `x4`); witness GREEN after —
  `tests/pattern-field-literal-integer-narrowing-refusal.test.ts (25 tests)`,
  `tests/object-pattern-head-field-set-refusal.test.ts (32 tests)`,
  `Tests 57 passed (57)`. Full default suite `Test Files 388 passed (388) /
  Tests 8033 passed (8033)`. `npm run typecheck` clean, `npm run lint` clean.
  Locks green at their document counts: 43 + 54 + 32.
- **Review:** 1 round. Round 1 (`bug-fix-reviewer`): DEFECTS(3), none a
  blocker — two citation-health defects the change minted itself (a stale
  `:1047` cite of the cell this change moved; a line-form cite of the DELETED
  `.filter`) and historical narration in the flipped `x4` comments. Fixed in
  one `bug-fix-fixer-light` round (comment/prose only; polish verified by
  gate-diff, so the confirmation review round was skipped per policy).
- **Verification:** VERIFIED after one finding. (1) The witness reds without
  the fix and greens with it, with the docs half reverted separately to red
  `r2`/`r3` alone — the 8-cell set reproduced exactly, restoration proved by
  `git hash-object`. (2) Full default suite green (388 files). (3) Live:
  `tests/live/pattern-field-integer-narrowing-live-cell-.test.ts` run
  for real under the shared lock — GREEN with the fix (`Tests 1 passed (1)`,
  3145ms, one real model turn on the `integer`-spelled sibling), and RED with
  `src/parser/{type-layer-checks,theta-document}.ts` reverted byte-exact to the
  fork point, with the bug's own signature (`Registered:
  ["cellslashintegernarrowingpattern","cellslashintegerspelledpattern"]`);
  src restored, hashes verified. (4) `npm run lint` / `npm run typecheck`
  clean, no collateral (`permitted-codes.json`, `docs/reference/diagnostics.md`,
  `src/runtime/**` byte-untouched), one case-insensitive scratch sweep clean.
  The single verifier finding — a `:306` citation this change's own insertion
  shifted to `:333` — was corrected in the witness comment.
- **Residuals:**
  1. `parsePattern` carries `numericType` only for a `"number"` spelling. The
     omission is load-bearing: an unconditional carry structurally reds three
     deep-equality cells in OPEN bug 0123's witness
     (`tests/match-pattern-increment-decrement.test.ts` `f1`/`f2`/`h2` assert
     `{ kind: "literal", value: 1 }` exactly). Measured both ways before the
     route was fixed; the conditional carry leaves that file green (28 tests)
     and constraint 9 untouched. Whichever of 0234/0123 is re-measured next
     should keep this in view.
  2. Pre-existing citation drift in touched files, bug 0134's do-not-chase
     class, left as found: `tests/object-pattern-head-field-set-refusal.test.ts:88`
     cites `case "match"` at `type-layer-checks.ts:3157` (now `:2804`), and
     this document's own §Affected citations are its filing-HEAD measurement.
  3. A pattern-field narrowing emission still uses the WHOLE object-pattern's
     range (constraint 7). A per-field range is a node-shape change and is
     unclaimed by any report.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** `type-system.md:52` (TYPE-9) not
  widened, reason above; §Non-goals all held — no runtime dispatch change
  (`src/runtime/**` byte-identical), no new code minted, the `fn`-argument
  sink keeps its own code (witness cell `b8`), the shorthand stays unjudged
  (`c4`), the negative pattern literal stays bug 0123's (`c5`), and the
  `enum`/imported/builtin heads stay deferrals.
