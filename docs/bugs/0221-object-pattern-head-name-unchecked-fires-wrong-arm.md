# Bug 0221 — A NON-reserved `match` object-pattern head is checked against nothing: an undeclared `R { a: 1 }`, an undeclared head nested one level down, and a lowercase `q { a: 1 }` each parse clean, register, and select their arm on a value of an unrelated declared schema — where the same three heads written in the VALUE position each draw `theta/parse/unresolved-named-type` at the same spelling

- **Status:** open. Filed as bug
  [0219](./0219-reserved-keyword-object-pattern-head-parses-clean.md)'s named
  residuals 1–3 (§Fix (0.156.0) *Residuals*: element 2 "narrowed", element 3
  "unchanged", "the lowercase object-pattern head" — each closed with
  "Unclaimed by any report"). Re-measured at HEAD for this filing, not copied.
- **Sev/Diff estimate:** S1/D2 — S1 because a legal program that draws `[]` on
  every channel, passes `hasLoadParseError`, registers, and reaches
  `outcome=success` answers with an arm whose head names a schema the value was
  not constructed with: measured at HEAD, `schema Q { a: integer }` /
  `let d = Q { a: 1 }` / `match d { R { a: 1 } => "r-arm", Q { a: 1 } =>
  "q-arm", _ => "other" }` with `R` **declared nowhere in the file** answers
  `"r-arm"` (§Reproduction A2), and the lowercase spelling `q { a: 1 }` over the
  same value answers `"lower-arm"` (C2) — the same wrong-value-arm family bug
  0219 measured, with its reserved-word half now closed and the non-reserved
  half reachable from clean source. D2 because the check needs two things no
  single site holds: the head token's range, which exists only inside
  `parsePattern` (`PatternNode`'s object variant and `MatchArmNode` carry no
  range — `src/parser/theta-document.ts:307–:310`, `:314–:317`), and the
  declaration universe, which is built after the parse
  (`StructuralRefs`, `:6320`, assembled `:6596`); and because the code question
  is a DIAG-2 one — a sixth position on
  `theta/parse/unresolved-named-type`'s closed five-position list
  (`code-registry-parse.md:99`) or a new row. Not D1 for those two reasons, and
  not D3 because no runtime dispatch, no lowering and no normative sentence has
  to move: refusing the source at load closes reachability, which is exactly the
  shape bug 0219 landed one arm away.
- **Kind:** defect — implementation, against two written sentences, in three
  classes that share one mechanism, each measured at HEAD `f41c91ee`
  (v0.156.0).
  1. **The undeclared non-reserved head (bug 0219's element 2, narrowed).**
     `lexical.md:18` states that inside `match` patterns "an uppercase
     identifier refers to an existing schema, enum, or constructor in scope".
     Measured: `R { a: 1 }` with `R` declared nowhere draws `[]` and selects its
     arm over a `Q`-constructed value (A2); `R { }` — zero listed fields, so the
     field loop is vacuous — does the same (A3); the same spelling in the value
     position, `let r = R { a: 1 }`, draws
     `error theta/parse/unresolved-named-type: unresolved named type 'R'` (A4).
  2. **Every nested pattern position (bug 0219's element 3, at depth).** The
     pattern grammar recurses through the same function, so an undeclared head
     is silent as an array element (`[Zed { a: 1 }]`, B1) and as an
     object-pattern field value (`Q { f: Zed { a: 1 } }`, B2), and the nested
     head selects the arm: over `let d = [Q { a: 1 }]`, the pattern
     `[Zed { a: 1 }]` answers `"zed-arm"` (B3). Depth is not the gap — bug
     0219's landed guard reaches the same nested position for a RESERVED head
     (`Q { f: Result { a: 1 } }` draws the reserved code at the inner head's
     range, B6) — the gap is that no pass checks a non-reserved name at any
     depth.
  3. **The lowercase head.** `p { a: 1 }` draws `[]` (C1) and `q { a: 1 }`
     selects its arm over a `Q`-constructed value (C2). `lexical.md:18` and
     `expressions.md:174` assign the *binding* reading to a lowercase
     identifier, and the head is not read as a binding either: with
     `let p = 7` in scope the pattern `p { a: 1 }` still draws `[]` and still
     selects (C4). The value position refuses the same spelling —
     `let r = p { a: 1 }` draws `unresolved named type 'p'` (C3).

  The three classes are one mechanism: `parsePattern`'s `{`-gated arm records
  the head as `typeName` and no later pass reads it. The structural walk that
  owns `theta/parse/unresolved-named-type` never descends into a pattern
  (`walkExpr`'s `match` case walks the scrutinee and each arm's BODY only,
  `src/parser/theta-document.ts:7455–:7459`), and the runtime never receives the
  head (`toRuntimePattern`, `src/runtime/statement-executor.ts:1143–:1147`).
- **Affected** (every citation verified against the tree at HEAD `f41c91ee`,
  v0.156.0 — `package.json:3`; symbols named beside line numbers under bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s do-not-chase
  adjudication, since bug 0219's fix shifted this file by +11 below the object
  arm and recorded no citation sweep):
  - **The site that accepts the head** — `src/parser/theta-document.ts:4292–4331`,
    the `{`-gated object / schema arm inside `parsePattern`'s `ident` /
    `keyword` branch (`parsePattern` declared `:4221`, branch test `:4272`).
    The arm is entered on `this.isPunct("{")` alone, runs bug 0219's
    reserved-word guard (`:4293–:4295`, `t.kind === "keyword"` only), walks the
    field list, and returns `{ kind: "object", typeName: t.text, fields }` at
    `:4329`. It runs no first-letter test on the head and consults no
    declaration table — `parsePattern` takes no arguments and reads no parser
    state beyond the token cursor.
  - **The arm partition around it, which is a LOCK** — the `Ok(` / `Err(`
    constructor arm above (`:4275–:4281`, spelling-restricted), the tail arm
    below (`:4339` `reservedKeywordAsIdentifierDiagnostic`, `:4346`
    `capitalisedPatternHeadDiagnostic` — bug 0141's two refusals, reached only
    when neither lookahead-gated arm fired), the `mut` guard (`:4225`), the
    literal arms for `true` / `false` / `null` (`:4261–:4271`), the bare
    object-pattern arm (`:4392`) and bug 0123's one-token recovery tail
    (`:4394` onward). Bug 0219's witness cells `n7` (`mut` / `true` / `false` /
    `null { a: 1 }` keeping their measured lists) and `z1` (`--y` in pattern
    position keeping `theta/parse/increment-decrement`) pin that partition
    against the tree; both are locks here.
  - **The pass that would resolve the head and does not see it** —
    `walkExpr`'s `match` case (`src/parser/theta-document.ts:7455–:7459`) walks
    `e.scrutinee` and each `arm.body`, never `arm.pattern`; `checkObjectExpr`
    (`:7268`) is therefore reached from the object *expression* case (`:7450`)
    only. Its undeclared-name verdict is
    `unresolvedNamedTypeDiagnostic` (`:5639`, emitted `:7304`, `:7314`,
    `:7319`), and it resolves against `StructuralRefs` (`:6320`, assembled
    `:6596`, carrying `bodyTypes` from `collectBodyTypes` `:878`).
  - **Why the walk has no range to point at** — `PatternNode`'s object variant
    carries `typeName` and `fields` only (`:307–:310`; the type's doc comment at
    `:298` says `typeName` "is retained for diagnostics but ignored by runtime
    dispatch"), and `MatchArmNode` carries `pattern` and `body` (`:314–:317`).
    The comment at `:6279` states the consequence in terms: "A pattern node
    carries no range".
  - **The dropped head at the runtime** —
    `src/runtime/statement-executor.ts:1143–:1147` (`toRuntimePattern`'s object
    arm, which maps `fields` alone), `src/runtime/match-result.ts:113–:116` (the
    runtime `Pattern` object variant declares `kind` and `fields`, no
    `typeName`) and `:202–:222` (`matchPattern`'s object arm: a non-array,
    non-null `object`, then every LISTED field present and matching, unlisted
    fields ignored — so an empty field list matches every object-shaped
    `ThetaValue`).
  - **The field binders** — `collectPatternBindings`
    (`src/parser/theta-document.ts:5115`, object arm `:5123–:5127`), seeded per
    arm at `:5451` and read again at `:6282`. The field-shorthand sugar
    (`:4378–:4382`) makes `{ attempts }` a same-named identifier pattern, per
    `expressions.md:171`.
  - **The spec the silence contradicts** — `docs/spec_topics/lexical.md:18` (a
    lowercase identifier in a pattern introduces a fresh binding, an uppercase
    identifier REFERS to an existing schema, enum or constructor in scope),
    `:13` (the first-letter rule is what makes pattern disambiguation work
    without additional grammar); `docs/spec_topics/expressions.md:171` (the
    Object/schema pattern row) and `:174` (the disambiguation sentence);
    `docs/spec_topics/grammar.md:148` (`MatchArm ::= Pattern "=>" ArmBody`).
  - **The registered rows** — `code-registry-parse.md:99`
    (`theta/parse/unresolved-named-type`'s CLOSED five-position list, the fifth
    being "an object-constructor name (`Name { ... }`)"; a pattern head is not
    on it), `:21` (`theta/parse/reserved-keyword-as-identifier`, whose *Trigger*
    carries no position qualifier and which bug 0219 wired into this arm),
    `:22` (`theta/parse/capitalised-pattern-head`, whose *Trigger* excludes a
    head "followed by `{`" in terms).
  - **The registration gate** — `hasLoadParseError`
    (`src/extension/production-composition.ts:2220`, any error-severity
    `theta/load/` or `theta/parse/` code, called `:1502` and `:2108`). With
    `[]` diagnostics every row below passes it, which is why each reaches a
    value.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` lists 34 files at
    HEAD and `git grep -nE "\{[^}]*\} *=>"` over them matches ZERO: no
    committed fixture carries an object-pattern arm of any kind, so a fix that
    makes these classes refuse reds no committed source. Per bug
    [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) the
    committed gate filters `.theta` only, so the `.thetalib` half of that sweep
    is a scratch probe, not a gate.
- **Observed at:** v0.156.0 (`f41c91ee`, `package.json:3`), the filing commit
  for bug [0220](./0220-fn-return-void-sink-false-void-diagnostic.md). Offline,
  deterministic, provider-free, zero model turns: one scratch vitest probe
  (written, run, deleted) driving the REAL `parseThetaDocument` through
  `tests/helpers/e2e-s1.ts`'s `parseDoc` and the REAL `executeBody` through the
  shipped production producer deps (`createProductionProducerDeps` +
  `bindPromptConversation`), the harness shape of
  `tests/reserved-keyword-object-pattern-head-refusal.test.ts:710–:768`. Every
  value below is that run's output verbatim.

## Summary

Bug 0219 closed the RESERVED object-pattern head: a `keyword`-kind head inside
`parsePattern`'s `{`-gated arm now draws
`theta/parse/reserved-keyword-as-identifier`. That guard tests the token's kind
and nothing else. A non-reserved head — declared, undeclared, capitalised or
lowercase, at any recursion depth — is still recorded as `typeName` and then
read by nobody: the structural walk that owns
`theta/parse/unresolved-named-type` never descends into a pattern, and
`toRuntimePattern` drops the head before dispatch.

The result is a name in source that constrains nothing. An undeclared `R`, an
undeclared `Zed` one level down, and a lowercase `q` all select their arm on a
value constructed from an unrelated declared schema, with `[]` on every channel
— while all three spellings, written in the VALUE position, draw
`theta/parse/unresolved-named-type`.

## Reproduction

Zero model turns, no provider contacted. Every fixture is a whole prompt-mode
theta (`---\nmode: prompt\n---\n`, three lines of frontmatter); the last
statement is the `match` result, so the body's value IS the selected arm.
`UNRESOLVED` is `error theta/parse/unresolved-named-type`, `RESERVED` is
`error theta/parse/reserved-keyword-as-identifier`.

### (A) The undeclared non-reserved head

| row | source under test | diagnostics | value |
| --- | --- | --- | --- |
| A1 **IN-CLASS** | `schema Q { a: integer }` / `schema R { b: integer }` / `let d = Q { a: 1 }` / `match d { R { a: 1 } => "r-arm", Q { a: 1 } => "q-arm", _ => "other" }` | `[]` | `"r-arm"` |
| A2 **IN-CLASS** | same, with `schema R` REMOVED — `R` declared nowhere | `[]` | `"r-arm"` |
| A3 **IN-CLASS** | `match d { R { } => "r-arm", _ => "other" }`, `R` undeclared | `[]` | `"r-arm"` |
| A4 CONTROL, value pos | `let r = R { a: 1 }`, `R` undeclared | UNRESOLVED `'R'` | `{"a":1}` |
| A5 boundary | `schema Q { a: integer }` / `schema R { a: integer }` / `let d = R { a: 2 }` / `match d { Q { a: 2 } => "q-arm", _ => "other" }` | `[]` | `"q-arm"` |

A2 is the S1 row: both `R { a: 1 }` and the correct `Q { a: 1 }` arm are
present, `R` is declared nowhere in the file, and the undeclared head takes the
value. A1 differs from A2 in that `R` IS declared and its declared field set is
`{ b }` — the pattern lists `a`, which `R` does not declare. A5 is the residue
no name check reaches: both heads resolve, both schemas declare the same field,
so only nominal dispatch could separate them.

Rendered verbatim, A4's refusal (also C3's and B5's, at their own spellings):

```
error theta/parse/unresolved-named-type: unresolved named type 'R'
```

### (B) Nested pattern positions

| row | source under test | diagnostics | value |
| --- | --- | --- | --- |
| B1 **IN-CLASS**, nested | `match 3 { [Zed { a: 1 }] => "x", _ => "y" }`, `Zed` undeclared | `[]` | `"y"` |
| B2 **IN-CLASS**, nested | `schema Q { a: integer }` / `match 3 { Q { f: Zed { a: 1 } } => "x", _ => "y" }` | `[]` | `"y"` |
| B3 **IN-CLASS**, nested | `schema Q { a: integer }` / `let d = [Q { a: 1 }]` / `match d { [Zed { a: 1 }] => "zed-arm", _ => "other" }` | `[]` | `"zed-arm"` |
| B4 **IN-CLASS** | `match 3 { Zed { a: 1 } => "zed-arm", _ => "other" }`, `Zed` undeclared | `[]` | `"other"` |
| B5 CONTROL, value pos | `let r = Zed { a: 1 }` | UNRESOLVED `'Zed'` | `{"a":1}` |
| B6 CONTROL, nested reserved | `match 3 { Q { f: Result { a: 1 } } => "x", _ => "y" }` | RESERVED `'Result'` at the inner head | `"y"` |

B3 is the depth-carrying wrong-arm row. B6 measures that bug 0219's guard
already reaches a nested head, so recursion depth is not what separates the
refused case from the silent one — the head's token kind is.

### (C) The lowercase head

| row | source under test | diagnostics | value |
| --- | --- | --- | --- |
| C1 **IN-CLASS** | `match 3 { p { a: 1 } => "x", _ => "y" }` | `[]` | `"y"` |
| C2 **IN-CLASS** | `schema Q { a: integer }` / `let d = Q { a: 1 }` / `match d { q { a: 1 } => "lower-arm", _ => "other" }` | `[]` | `"lower-arm"` |
| C3 CONTROL, value pos | `let r = p { a: 1 }` | UNRESOLVED `'p'` | `{"a":1}` |
| C4 **IN-CLASS** | same as C2 with `let p = 7` in scope and head `p` | `[]` | `"lower-arm"` |

C4 shows the head is not the binding reading either: an in-scope `p` is neither
consulted nor shadowed, and the arm still selects. C3 shows the value position
refusing the same lowercase spelling as a constructor name.

### (D) The corpus sweep

`git ls-files -- '*.theta' '*.thetalib'` → 34 files;
`git grep -nE "\{[^}]*\} *=>"` over that list → zero matches. No committed
fixture carries an object-pattern arm, so a route that makes any of these
classes refuse reds no committed source. Bug 0132 keeps the `.thetalib` half a
probe, not a gate.

## Expected behaviour

1. An object-pattern head that resolves to no declaration usable at that
   position is refused with an error-severity `theta/parse/` code, exactly
   once, at the head's range — as the same spelling already is in the value
   position (A4, B5, C3). Rows A2, A3, B4 and C1 do not register.
2. The refusal fires at every depth the pattern grammar recurses — array
   element and object-pattern field value included (B1, B2, B3) — since
   `parsePattern` is the same function at every depth and bug 0219's reserved
   guard already behaves that way (B6).
3. A head whose resolved declaration cannot carry the listed fields is refused
   (A1: `R` declares `{ b }`, the pattern lists `a`), on the reading
   `checkObjectExpr` already applies at the constructor position.
4. Nothing changes for the legal spelling or for the landed refusals:
   `Q { a: 1 }` with `Q` declared keeps its value and its silence, the field
   shorthand `{ attempts }` and the bare object pattern `{ a: 1 }` stay silent,
   bug 0219's reserved-head refusals keep their codes, counts and ranges
   (including B6's nested one), and bug 0141's four bare-head controls are
   untouched.

## Actual behaviour / root cause

The head is recorded and never read. `parsePattern`'s `{`-gated arm
(`theta-document.ts:4292`) tests `t.kind === "keyword"` — bug 0219's guard —
and otherwise accepts any token the `ident` / `keyword` branch admitted,
returning `{ kind: "object", typeName: t.text, fields }` at `:4329`. Two
readers could check `typeName` and neither does:

- The structural walk owns the resolution universe (`StructuralRefs`, `:6320`)
  but never reaches a pattern: `walkExpr`'s `match` case (`:7455–:7459`) walks
  the scrutinee and each arm's body, so `checkObjectExpr` (`:7268`) — the
  emitter of `theta/parse/unresolved-named-type` for a constructor name — is
  reached from object *expressions* only. The registered row's position list is
  closed at five and a pattern head is not among them
  (`code-registry-parse.md:99`), so the walk's silence matches its row.
- The runtime never receives the head: `toRuntimePattern`
  (`src/runtime/statement-executor.ts:1143–:1147`) maps `fields` alone because
  the runtime `Pattern` object variant declares no `typeName`
  (`src/runtime/match-result.ts:113–:116`), and `matchPattern`'s object arm
  (`:202–:222`) tests object-ness plus the listed fields. An object pattern is
  therefore a pure field-shape test, which is why A2's undeclared head and C2's
  lowercase head select on a `Q`-constructed value and why A3's empty field list
  matches every object-shaped value.

The type layer does not close the gap either: `PatternNode`'s doc comment
(`:298`) says `typeName` is "retained for diagnostics", and the measured fact is
that no diagnostic reads it.

## Why it matters

A theta that loads clean, registers, and answers with an arm whose head names
something other than what the value was constructed from is the S1 band
verbatim. Three shapes reach it from clean source: a mistyped or renamed schema
name in a pattern (A2 — the arm still fires, and the correct arm below it never
runs), a copied nested pattern whose inner head no longer exists (B3), and a
lowercase head written in the belief that it binds (C2/C4 — it neither binds nor
resolves). All are silent on every channel — no diagnostic, no note, no gate —
and all look identical in review to the legal spelling, which is the one thing
the value position already refuses.

## Fix

**Settled: an object-pattern head is checked against the declaration
universe.** The verdict is that A2, A3, B1–B4 and C1 refuse with an
error-severity `theta/parse/` code at the head's range, and that the legal
spelling, bug 0219's reserved refusals and bug 0141's bare refusals are
untouched. The route's two open questions are DIAG-2 and AST-shape ones the
fixer settles under this report's authority; the constraints below bound them.

### (a) The candidate sites, and why no single one holds both inputs

The check needs the head's RANGE and the DECLARATION universe. They live apart:

- `parsePattern`'s `{`-gated arm (`src/parser/theta-document.ts:4292–4331`)
  holds `t.range` — bug 0219's guard emits from exactly there — but
  `parsePattern` takes no arguments and reads no parser state beyond the token
  cursor, and the body's declarations are collected later
  (`collectBodyTypes` `:878`, `StructuralRefs` `:6596`).
- The structural walk holds the universe and the resolution rule
  (`checkObjectExpr` `:7268`, `unresolvedNamedTypeDiagnostic` `:5639`) but not a
  range: `PatternNode`'s object variant and `MatchArmNode` carry none
  (`:307–:310`, `:314–:317`), which the comment at `:6279` states outright, and
  `walkExpr`'s `match` case does not descend into `arm.pattern` at all
  (`:7455–:7459`).

So a route either carries a head range on the object `PatternNode` and emits
from an extended `walkExpr` / `checkObjectExpr` descent, or threads the
declaration set into the parse. Which, and the code question below, are the
fixer's calls.

### (b) The code question is DIAG-2

Reusing `theta/parse/unresolved-named-type` adds a SIXTH position to a
deliberately closed five-position list (`code-registry-parse.md:99`) — a
*Trigger* edit on a row five positions already pin, which is what bug 0219
declined to make on element 3's behalf. Minting a new row is the GOV-15
carve-out shape bug 0141 used for `theta/parse/capitalised-pattern-head`.
Extending that 0141 row instead is ruled OUT here for the reason 0219 §Fix (a)
sub-decision 2 records: its *Trigger* excludes a head "followed by `{`" in
terms, `Ident { … }` IS an admitted production (`expressions.md:171`), and the
row's own message ("names no pattern production") would be false of it. The
boundary with the two landed rows is therefore: bug 0219's row covers the head's
TOKEN KIND, bug 0141's row covers a BARE capitalised head, and this report
covers a braced head's NAME against the declaration universe.

### (c) Constraints every route carries

1. **Bug 0219's and bug 0141's landed refusals keep their codes, counts and
   ranges.** `tests/reserved-keyword-object-pattern-head-refusal.test.ts` (54
   cells) and `tests/capitalised-bare-match-pattern-refusal.test.ts` (45 cells)
   are green as written at HEAD (measured: 99 passed) and are locks, except for
   the cells this report's verdict flips, named in constraint 2. In particular
   `z1` (bug 0123's `--y` cascade) and `n7` (`mut` / `true` / `false` /
   `null { a: 1 }`) pin `parsePattern`'s arm partition and must not move, and
   `n3` / `v9` (the DECLARED head, clean and selecting) must stay green.
2. **The flips this report authorises, and no others.** Bug 0219's witness
   cells that assert the surviving classes are silent — `n1` (lowercase head
   `p { a: 1 }`), `n2` (undeclared head `Zed { a: 1 }`) and the diagnostic half
   of `v6` (the non-reserved head selecting its arm) — are pinned as MEASURED
   boundaries there and flip here, under this report's named authority, with
   their comments updated to cite this bug. The five bug 0141 re-pinned sibling
   witnesses (`tests/fn-arg-type-mismatch-wired.test.ts`,
   `tests/fn-param-name-reserved-keyword.test.ts`,
   `tests/fn-param-name-case.test.ts`, `tests/schema-field-name-case.test.ts`,
   `tests/type-name-as-value-refusal.test.ts`) and
   `tests/match-pattern-increment-decrement.test.ts` are locks: a flip there
   means the route reached a position outside a `match` pattern head.
3. **One diagnostic per construct.** A refused head draws exactly one code, at
   the head's range, and never also a reserved-keyword or capitalised-head
   code. A reserved head keeps drawing bug 0219's code alone — the token-kind
   guard runs first — and a refused head's FIELD binders draw no
   `theta/parse/unknown-identifier` cascade, which means the node keeps its
   shape (bug 0219 §Fix (b)(3)'s reason: `collectPatternBindings` `:5115` must
   still put the field binders in the arm-body scope).
4. **No runtime dispatch change.** `toRuntimePattern`
   (`src/runtime/statement-executor.ts:1143–:1147`), the runtime `Pattern` union
   (`src/runtime/match-result.ts:113–:116`) and `matchPattern`'s object arm
   (`:202–:222`) stay byte-identical. The refusal is carried by the
   error-severity diagnostic that `hasLoadParseError`
   (`src/extension/production-composition.ts:2220`) turns into a registration
   denial, as bug 0219's fix did for the reserved half.
5. **Row A5 is out of reach and stays measured.** Two declared schemas with a
   compatible field set (`Q { a: integer }`, `R { a: integer }`) remain
   interchangeable in pattern position: only nominal dispatch separates them,
   and that is the language decision §Non-goals holds open. A route must pin A5
   as a measured boundary rather than close it by accident.
6. **The three classes may want separate surfaces; the verdict is still one.**
   The name check (A2, A3, B1–B4) and the field-set check against the resolved
   declaration (A1) can land at one site; the lowercase head (C1, C2, C4) may
   need its own message, since `lexical.md:18` assigns it the binding reading
   rather than a reference reading, and bug 0141 declined the parallel question
   at the `for` variable. If measurement during the fix shows the lowercase
   class needs a distinct code or a distinct site, it lands as a second row in
   the same change or is split into its own report by the parent — either way
   the mechanism statement above (one unread `typeName`) is what the change
   removes.
7. **GOV-15 discharge is a real sweep, not an assumption.** The change makes
   currently-clean programs refuse, so it carries §Reproduction (D)'s sweep over
   `git ls-files -- '*.theta' '*.thetalib'` (34 files, zero object-pattern
   arms), run rather than assumed, plus
   `tests/committed-fixture-parse-gate.test.ts`, which is what discharges the
   corpus-wide claim.
8. **Bug 0123's subject is untouched.** `parsePattern`'s one-token recovery tail
   (`:4394` onward) stays byte-identical and its `--y` input keeps its exact
   code list; whichever of the two fixes lands second re-measures the other's
   rows in the same function.

## Non-goals

- **Nominal dispatch for object patterns.** Making a head part of the match
  test — so that `Q { a: 2 }` fails against an `R`-constructed value with an
  identical field set (A5) — is a language decision with an exhaustiveness and a
  schema-identity question behind it, and `expressions.md:171` describes the
  field-shape reading currently implemented. This report asks that the head be
  CHECKED at load, not that dispatch become nominal.
- **A referent for a capitalised head that is not a schema.** Enum-typed and
  imported heads: an imported symbol already defers at the value position
  (`code-registry-parse.md:99`), and the same deferral is expected here rather
  than a new resolution rule.
- **Exhaustiveness, unreachable arms and guards.** Out of scope, per
  `expressions.md:178` and `:176`.
- **Rest patterns inside an object pattern.** `{ kind, ...other }` stays
  `theta/parse/rest-pattern-not-supported`'s business and the arm's
  `tryConsumeRestPattern` call is untouched.
- **Bug 0141's node-shape decision.** The identifier-pattern node stays as
  landed; nothing here revisits whether a refused pattern should become a
  wildcard.

## Related

- [0219](./0219-reserved-keyword-object-pattern-head-parses-clean.md) —
  **fixed (0.156.0)**, the origin of this report: its §Fix (0.156.0)
  *Residuals* items 1, 2 and 3 are the three classes filed here, each recorded
  "Unclaimed by any report", and this is that filing. It did not cause the
  defect — a non-reserved head was silent before it — but it fixed the half of
  the arm that a token-kind test can reach, leaving the name check as the
  residue. Its 54-cell witness is a lock except for cells `n1`, `n2` and `v6`'s
  diagnostic half (§Fix (c)(2)).
- [0141](./0141-capitalised-bare-match-pattern-binds-identifier.md) — **fixed
  (0.146.0)**, the adjacent landed refusal for BARE heads. Its §Fix (0.146.0)
  added `theta/parse/capitalised-pattern-head` at `parsePattern`'s tail arm,
  which is reached only when neither lookahead-gated arm fired; a braced head
  never reaches it, and the row's *Trigger* excludes a head "not followed by
  `{`" in terms (`code-registry-parse.md:22`) — so this report's inputs escape
  that row by the row's own text, not by oversight. Its 45-cell witness and its
  five re-pinned sibling witnesses are locks (§Fix (c)(1)–(2)).
- [0123](./0123-match-pattern-decrement-draws-neighbouring-codes.md) — **open**,
  the same function. Disjoint defect (`parsePattern`'s one-token recovery tail),
  shared function; coordination per §Fix (c)(8).
- [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — **open**,
  and binding on §Reproduction (D): the committed parse gate filters `.theta`
  only, so the `.thetalib` half of the sweep is a probe.
- [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
  adjudicated do-not-chase class for positional drift, under which every
  citation here is symbol-named beside its line number and re-verified at HEAD
  after bug 0219's +11-line insertion.

## Provenance

Bug 0219's `## Fix (0.156.0)` *Residuals* names all three classes and files
nothing:

1. "**Element 2, narrowed.** `R { a: 1 }` selecting on a `Q`-constructed value
   survives … The reserved-head half of the class is closed, so what remains is
   a *declared-name* interchangeability … Unclaimed by any report."
2. "**Element 3, unchanged.** `Zed { a: 1 }` with `Zed` undeclared draws `[]`
   post-fix … Unclaimed by any report."
3. "**The lowercase object-pattern head.** `p { a: 1 }` still draws `[]` …
   Unclaimed by any report."

**Re-measured at HEAD `f41c91ee` for this filing, not copied.** All three
reproduce, and the measurement adds four things the residuals do not state:

- **The surviving class is not limited to declared names.** Residual 1 describes
  what remains as "declared-name interchangeability"; measured, an
  UNDECLARED head is the stronger row — `R { a: 1 }` with `R` declared nowhere
  takes the value over a present, correct `Q { a: 1 }` arm (A2), and `R { }`
  does so with no field constraint at all (A3).
- **The class carries to every recursion depth, and depth is not the
  discriminator.** An undeclared nested head selects the arm (B3), while a
  RESERVED nested head is refused at the same position by bug 0219's guard
  (B6) — so the gap is the missing name check, not a missing recursion.
- **The lowercase head is neither a reference nor a binding.** With `let p = 7`
  in scope, `p { a: 1 }` still draws `[]` and still selects (C4), so the
  lowercase spelling is not silently taking `lexical.md:18`'s binding reading.
- **Every one of the three spellings is refused in the VALUE position.**
  `let r = R { a: 1 }`, `let r = Zed { a: 1 }` and `let r = p { a: 1 }` each
  draw `theta/parse/unresolved-named-type` (A4, B5, C3), which locates the
  asymmetry precisely: `walkExpr`'s `match` case never descends into
  `arm.pattern`.

Also measured: row A5 (two declared, field-compatible schemas) is outside any
name check's reach and is recorded as the boundary §Fix (c)(5) pins, and the
corpus carries zero object-pattern arms of any kind (§Reproduction (D)).
