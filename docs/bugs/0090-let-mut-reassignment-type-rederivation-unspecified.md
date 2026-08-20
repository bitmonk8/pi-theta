# Bug 0090 — No spec sentence says what type a `let mut` binding carries after a reassignment: since 0.55.0 the declared annotation governs the binding's whole scope, so `let mut n: number = 1` / `n = 2` / `let m: integer = n` reports `theta/parse/integer-narrowing` on a test pin with no normative sentence behind it

- **Status:** fixed (0.133.0). §Fix was constraint-pinned; the adjudication it
  asked for — between the declared or inferred type governing the binding's
  whole scope and each reassignment re-deriving the recorded type — is settled
  as **disposition 1** and recorded in `## Fix (0.133.0)` below.
- **Kind:** spec gap. Two normative sentences reach a `let mut` reassignment
  and neither answers the question: `docs/spec_topics/bindings.md:12`
  constrains the RHS against "the binding's declared or inferred type", and
  `docs/spec_topics/control-flow.md:15` (CTRL-1) constrains the `for` iterand
  snapshot against a body-side reassignment. Nothing states what type a later
  reference to the reassigned binding resolves to. The implementation answers
  by omission — `case "reassign"` never re-records — and since the
  [0083](./0083-let-annotation-discarded-from-recorded-binding-type.md) fix
  (0.55.0) records the declared annotation, the answer is observable at parse
  time and is pinned by a test.
- **Related:**
  - [0083](./0083-let-annotation-discarded-from-recorded-binding-type.md)
    (fixed 0.55.0) — the fix that made the omission observable. Its §Non-goals
    second bullet (`:148–150`) declined to settle reassignment and asked only
    that a fix check whether a reassignment re-derives the binding type; its §Fix
    (0.55.0) *Residuals* item (i) (`:259–263`) records the answer and the
    resulting pin, and judges the disposition correct without adjudicating it.
    The witness row lives in that report's regression file.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)
    (open) — a declared type not consulted at the `fn`-argument boundary, also
    left as a constraint-pinned decision. Different position, different code;
    a resolution there does not touch the reassignment site.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) (fixed 0.43.0) — the
    precedent for checking a written value against a declared type at the
    write site, which is the obligation §Fix disposition 1 leans on.
- **Affected** (citations verified at HEAD `2eafbf10`, 0.55.0):
  - **The silence.** `docs/spec_topics/bindings.md:12` is the corpus's only
    normative sentence on reassignment typing: "the RHS must be compatible with
    the binding's declared or inferred type per [Type System — Type
    compatibility]". It constrains the write; it does not say whether the
    binding still carries that type after the write.
    `docs/spec_topics/type-system.md:27` enumerates the positions the `⊑`
    relation governs — the typed-`let` RHS, a function-argument slot, an
    `invoke<T>` return annotation, `match`-arm and ternary common types, an
    `array<T>` element against its sink, `+`'s mixed-numeric case, a
    frontmatter `params:` default, a schema-constructor field value — and the
    reassignment RHS is not among them, so `bindings.md:12`'s cross-link lands
    on a list its own site is absent from. `type-system.md:50` (TYPE-9)
    enumerates the check sites that report their own parse-time diagnostic and
    names no reassignment. `docs/reference/grammar.md:466–469` restates the rule ("RHS
    must be compatible with the binding's type") and inherits the same silence.
    `docs/spec_topics/bindings.md` is 36 lines; no other line addresses the
    question.
  - **The code that answers by omission.** `TypeLayerWalk.walkStmt`'s
    `case "reassign"` (`src/parser/type-layer-checks.ts:598–600`) walks
    `stmt.value` for nested checks and returns. It never calls `bindings.set`.
    The `CompatType` map every later `typeOf` consults (`:525`) is written at
    declaration sites only: the `let` arm (`:591–594`), `fn` parameters
    (`:671`), and the comprehension loop variable (`:1115`).
  - **What that combines with.** Since 0083 the `let` arm records
    `annotation === undefined ? rhsType : unfoldAlias(annotation, this.env)`
    (`:591–594`), so the declared annotation is the type that survives a
    reassignment for the rest of the binding's scope.
  - **The pin.** `tests/let-annotation-recorded-binding-type.test.ts:328–343`
    asserts `codesOf(["let mut n: number = 1", "n = 2", "let m: integer = n",
    "1"])` equals `["theta/parse/integer-narrowing"]`, under a title that
    states the rule ("the declared type governs after reassignment"). The
    file's red/green ledger (`:61`) lists the row among those that red against
    the pre-0083 record line at 0.54.0 (`61806a3a`).
  - **Nothing enforces the RHS obligation.** `checkReassignment`
    (`src/parser/bindings.ts:85–100`) returns `theta/parse/immutable-rebinding`
    for an immutable target and `undefined` otherwise; its one caller
    (`src/parser/theta-document.ts:2031`) passes the target name and
    mutability, no types. The static-type pass records the value expression for
    inference only (`src/parser/static-type-inference.ts:129–131`), the
    query-schema resolver states that "a reassignment carries no declared
    annotation to serve as a sink" (`src/parser/query-schema-resolve.ts:148–150`),
    and the runtime write accepts on mutability alone
    (`src/runtime/lexical-environment.ts:361`).
- **Observed at:** 0.55.0 (`2eafbf10`), offline, through the production
  whole-file parser (`parseThetaDocument`), reading the aggregated diagnostic
  codes.

## Summary

The corpus does not decide whether a `let mut` reassignment re-derives the
binding's recorded type or whether the type fixed at the declaration governs
for the binding's whole scope. The two readings differ observably at parse
time. The implementation takes the second reading: `case "reassign"` never
re-records, and after 0083 the recorded type is the declared annotation. One
test pins the resulting behaviour, and no normative sentence stands behind it.

## Reproduction

Parse-only, through `parseThetaDocument`. Each source is a body under
`---\nmode: prompt\n---`; *Observed* is the aggregated diagnostic codes. The
last two columns give what each candidate disposition in §Fix prescribes.

**(a) The pinned observable.**

| Source | Observed | Declared-governs | Re-derive |
| --- | --- | --- | --- |
| `let mut n: number = 1` <br> `n = 2` <br> `let m: integer = n` <br> `1` | `["theta/parse/integer-narrowing"]` | same — `n` is `number` for its whole scope | `[]` — `n` re-derives to `integer` at `n = 2` |
| `let mut n: number = 1` <br> `let m: integer = n` <br> `1` | `["theta/parse/integer-narrowing"]` | same | same |
| `let n: number = 1` <br> `let m: integer = n` <br> `1` | `["theta/parse/integer-narrowing"]` | same | same |

Row 1 is the row 0083 pinned. Row 2 differs from it only in the reassignment;
row 3 additionally drops `mut`. The three together isolate the reassignment as
the only variable.

**(b) The same silence over an inferred binding type.**

| Source | Observed | Declared-governs | Re-derive |
| --- | --- | --- | --- |
| `let mut n = 1` <br> `n = 1.5` <br> `let m: integer = n` <br> `1` | `[]` | same — `n` is `integer`, and the offending statement is the reassignment (see (c)) | `["theta/parse/integer-narrowing"]` — `n` re-derives to `number` |
| `let mut n = 1.5` <br> `let m: integer = n` <br> `1` | `["theta/parse/integer-narrowing"]` | same | same |

**(c) The RHS obligation `bindings.md:12` states is unenforced.** Not this
report's subject; it is what decides which disposition in §Fix is sound.

| Source | Observed |
| --- | --- |
| `let mut n: integer = 1` <br> `n = 1.5` <br> `1` | `[]` |
| `let mut n: number = 1` <br> `n = "x"` <br> `1` | `[]` |
| `let mut n: integer = 1` <br> `n += 1.5` <br> `let m: integer = n` <br> `1` | `[]` |
| `let mut n: number = 1` <br> `n = "x"` <br> `n.length()` <br> `1` | `["theta/parse/unknown-method"]` — the recorded `number` governs the receiver, so the incompatible write surfaces one statement later as a missing method, not at the reassignment |
| `let mut xs: array<string> = []` <br> `xs = [1]` <br> `xs.join(",")` | `[]` |
| `let mut xs: array<integer> = []` <br> `xs.join(",")` | `["theta/parse/non-string-array-join"]` (control) |

Probe: throwaway vitest calling `parseDoc` (`tests/helpers/e2e-s1.ts`, the
shipped `parseThetaDocument` under inert deps) on each source and collecting
`.diagnostics.map(d => d.code)`; deleted after the run.

## Expected behaviour

A normative sentence decides what type a binding carries after a reassignment,
and the code and the test pin follow that sentence. The sentences that come
closest each stop short:

- `docs/spec_topics/bindings.md:12` — "the RHS must be compatible with the
  binding's declared or inferred type". A constraint on the value written, not
  a statement about the type read afterwards. The phrase "the binding's
  declared or inferred type" is the closest the corpus comes to fixing the type
  for the binding's scope, and it appears inside a clause about the RHS.
- `docs/spec_topics/type-system.md:27` — the enumeration of positions `⊑`
  governs omits the reassignment RHS, so the anchor `bindings.md:12` cites does
  not carry the site back.
- `docs/spec_topics/type-system.md:36` (TYPE-2, `integer ⊑ number`) and
  `docs/spec_topics/lexical.md:28` ("`integer` widens implicitly to `number` in
  arithmetic and assignment positions; the reverse is
  `theta/parse/integer-narrowing`") — supply the relation the observable turns
  on, and say nothing about when a binding's type is fixed.
- `docs/spec_topics/control-flow.md:15` (CTRL-1) — the corpus's one statement
  about a reassignment's effect on a later read concerns runtime values, not
  static types: "reassigning a `let mut` from inside the body does not change
  the already-snapshotted sequence".
- `docs/reference/grammar.md:466–469` — "RHS must be compatible with the
  binding's type", the reference restatement, silent on which type.

## Actual behaviour / root cause

The spec does not decide, so the shape of the code decides. `case "reassign"`
(`src/parser/type-layer-checks.ts:598–600`) walks the assigned value for nested
checks and returns; the binding-type map is written at `let`, `fn`-parameter
and comprehension-variable declarations only (`:591`, `:671`, `:1115`). The
declared or inferred type therefore governs every later reference for the rest
of the binding's scope.

Before 0.55.0 that choice was unobservable in the direction (a) reports,
because the `let` arm recorded the initialiser's inferred type: `n` read back
as `integer` whether or not a reassignment intervened. 0083 changed the
recorded type to the declared annotation (`:591–594`), and the combination —
declared type in, no re-derivation — is what row (a) 1 now reports. 0083's test
ledger (`tests/let-annotation-recorded-binding-type.test.ts:61`) records that
row as red against the pre-fix record line at 0.54.0.

The behaviour is a consequence of an omission, not the implementation of a
rule. Nothing in `src/` reads a spec sentence at this site, and nothing in
`docs/spec_topics/` states one.

## Why it matters

1. The rule exists only as a test row. `tests/let-annotation-recorded-binding-type.test.ts:328–343`
   is the sole artefact stating it, inside the regression file of a report that
   is already fixed and closed. A later edit to `case "reassign"` — for
   instance one implementing `bindings.md:12`'s RHS check with a re-derivation
   — has no normative text to check itself against, and a reviewer's only
   authority is a test comment.
2. The two readings disagree on inputs authors write: rows (a) 1 and (b) 1
   swap between a reported `theta/parse/integer-narrowing` and silence
   depending on which reading governs.
3. Under the reading now in force, the recorded type is a contract nothing
   enforces. Rows (c) 1, 2, 3 and 5 write a `number` into an
   `integer`-declared binding (plain and compound forms), a `string` into a
   `number`-declared one, and an `array<integer>` into an
   `array<string>`-declared one, all silently, and the recorded type keeps
   asserting the annotation.
4. The consequence surfaces at the wrong site and under the wrong code. Row
   (c) 4 reports `theta/parse/unknown-method` at `n.length()` because the
   receiver is recorded `number`; the statement the spec makes illegal is the
   reassignment one line earlier.
5. Under the other reading the machinery does not exist. `if`, `while` and
   `for` bodies receive copies of the binding map (`type-layer-checks.ts:604`,
   `:610`, `:621`), so a re-record inside a body is discarded at block exit,
   and all seven reassignment statements in the 21 committed `.theta` /
   `.thetalib` files under `docs/` sit inside a loop body
   (`docs/examples/fan-out-reviews.theta:34`; `ralph.theta:11`;
   `ralph-inline.theta:38`; `refine.theta:12`, `:17`; `refine-inline.theta:29`,
   `:34`). Choosing re-derivation therefore also owes a join rule, which no
   page states.

## Non-goals

- Not a request to change `case "reassign"` ahead of the decision. The
  behaviour rows (a) and (b) observe is what the resolution either blesses or
  replaces.
- Not about the absent reassignment RHS compatibility check. `bindings.md:12`
  already states that obligation, so its absence is a defect against existing
  text rather than a gap in it; rows (c) appear here because §Fix disposition 1
  depends on the check, and no report covers it at the time of writing.
- Not about 0083's record change, which is settled. Its three §Fix constraints
  and its test groups (a), (b) and (d) hold under both dispositions here.
- Not about runtime behaviour. `writeBinding`
  (`src/runtime/lexical-environment.ts:361`) accepts a write on mutability
  alone, and `integer` and `number` are the same JS value, so no executed value
  changes under either disposition.
- Not about the `fn`-parameter position
  ([0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)) or
  the constructor-field position
  ([0031](./0031-ctor-field-value-typing-unchecked.md)).

## Fix

Not yet decided. The settled question is a **spec** decision on
`docs/spec_topics/bindings.md`: whether the type a binding is declared or
inferred with governs for the binding's whole scope, or whether each
reassignment re-derives it. The code and the test pin follow the text.

**Candidate dispositions.**

1. *The declared or inferred type governs the binding's scope.* One sentence
   after `bindings.md:12`, e.g. "A reassignment does not change the binding's
   type: every later reference resolves the type the binding was declared or
   inferred with, for the whole of the binding's scope." Ratifies rows (a) and
   (b) as observed, changes no code, and moves no test expectation. It also
   matches the phrasing `bindings.md:12` already uses, which treats "the
   binding's declared or inferred type" as a property the binding still has at
   the time of a later write. Obligation attached: the recorded type is then a
   contract, and rows (c) show nothing checks a write against it. The RHS check
   `bindings.md:12` already requires is what makes this disposition sound;
   blessing the reading without it leaves a declared type any write can
   contradict silently.
2. *Each reassignment re-derives the recorded type from the assigned value.*
   `case "reassign"` re-records at `type-layer-checks.ts:598–600`. Row (a) 1
   flips to `[]`, row (b) 1 to `["theta/parse/integer-narrowing"]`, row (c) 5 to
   `["theta/parse/non-string-array-join"]`. The declared annotation becomes an
   initialiser-only assertion, so `bindings.md:12` moves in the same edit.
   Obligations attached: a join rule for a reassignment inside a nested block,
   which the corpus does not state and the walk cannot express today (`:604`,
   `:610`, `:621` hand nested bodies copies of the map, and every committed
   reassignment is inside a loop body); and the re-recorded type must be
   TYPE-11-transparent on the terms 0083 established for the `let` arm, or the
   two alias regressions that report pinned reappear at the reassignment.

**Recommendation: disposition 1**, unless the adjudication finds evidence in
the corpus for flow-sensitive typing. Three verified facts favour it.
`bindings.md:12` already speaks of the binding's declared or inferred type at a
write that happens after the declaration, which is the declared-governs
reading. Theta has no other flow-sensitive typing surface: the type map is
written at declaration sites only (`:591`, `:671`, `:1115`), and no `match` or
`if` narrows a binding's recorded type. Disposition 2 requires a join rule for
exactly the shape every committed example uses — a reassignment inside a loop
body — and no page in the corpus supplies one.

**Constraints on any resolution.**

1. **0083's record stays.** The declared annotation, in its TYPE-11-transparent
   form, is what a binding reads back as at a reference with no reassignment
   between (`type-layer-checks.ts:591–594`). Rows (a) 2 and (a) 3 hold under
   both dispositions, as do the eighteen rows of
   `tests/let-annotation-recorded-binding-type.test.ts` other than the pin
   (`a1`–`a3`, `b1`–`b4`, `s9`, `s12`, `d1`–`d5`, `c1`, `s3` and the two `(i)`
   rows), none of which reassigns.
2. **The two clauses cannot both hold as written.** `bindings.md:12` binds
   under disposition 1 and is what keeps the recorded type honest. Under
   disposition 2 a binding whose type follows its last write cannot fail a
   compatibility check against itself, so that resolution must state what
   becomes of the RHS obligation rather than leaving both sentences on the
   page.
3. **The pin moves with the text.**
   `tests/let-annotation-recorded-binding-type.test.ts:328–343` is a 0083
   regression row asserting behaviour, not a rule. A resolution either
   re-anchors it to the new sentence (disposition 1) or replaces its
   expectation (disposition 2). It is the only assertion in `tests/` that
   depends on a binding's recorded type after a reassignment: the other `let
   mut` rows pin mutability (`tests/bindings.test.ts:63`,
   `tests/lexical-environment.test.ts:199`), the CTRL-1 iterand snapshot
   (`tests/control-flow.test.ts:105`), `mut`-on-discard and
   assignment-as-expression
   (`tests/lexer-parser-diagnostics-production.test.ts:173`, `:190`),
   `par-shared-mutation` (`tests/par-for.test.ts:324`), statement boundaries
   (`tests/postfix-question-ternary-statement-boundary.test.ts:183`, `:235`),
   and an initialiser (`tests/typeenv-prototype-names.test.ts:412`).
4. **No new diagnostic code without a registry row (DIAG-2).** Disposition 1
   fires nothing that does not fire today. Under disposition 2 the codes that
   newly fire are already registered at the positions they would fire from:
   `theta/parse/integer-narrowing`
   (`docs/spec_topics/diagnostics/code-registry-parse.md:24`) and
   `theta/parse/non-string-array-join` (`:43`). Enforcing `bindings.md:12` at
   the reassignment is a separate question with its own code decision — the
   registry has no reassignment-RHS row, and `type-system.md:50` (TYPE-9) names
   none.
5. **Runtime is unaffected.** `writeBinding`
   (`src/runtime/lexical-environment.ts:361`) accepts on mutability alone and
   `integer` / `number` are one JS value, so neither disposition changes an
   executed value or a shipped example's output.
6. **Line-citation drift.** `docs/spec_topics/bindings.md` is 36 lines. Eight
   inbound line citations exist, all in `docs/bugs/`: `:10` (0062, twice),
   `:25` (0049, twice), `:36` (0084, four times). A sentence inserted after
   `:12` shifts the `:25` and `:36` citations, so a resolution re-pins them in
   the same commit or appends the sentence where the shift is nil.

## Provenance

- Spec: `docs/spec_topics/bindings.md:12` (and the 36-line page in full);
  `docs/spec_topics/type-system.md:27`, `:36` (TYPE-2), `:50` (TYPE-9), `:54`
  (TYPE-11); `docs/spec_topics/lexical.md:28` §"Number literals";
  `docs/spec_topics/control-flow.md:15` (CTRL-1);
  `docs/spec_topics/diagnostics/code-registry-parse.md:24`, `:43`, `:54`;
  `docs/reference/grammar.md:466–469`.
- Implementation: `src/parser/type-layer-checks.ts:525`, `:591–594`,
  `:598–600`, `:604`, `:610`, `:621`, `:671`, `:1115`;
  `src/parser/bindings.ts:85–100`; `src/parser/theta-document.ts:2031`;
  `src/parser/static-type-inference.ts:129–131`;
  `src/parser/query-schema-resolve.ts:148–150`;
  `src/runtime/lexical-environment.ts:361`.
- Tests: `tests/let-annotation-recorded-binding-type.test.ts:61`, `:328–343`.
- Examples surveyed for the join-rule constraint: the 21 committed `.theta` /
  `.thetalib` files under `docs/`; the seven reassignment statements are
  `docs/examples/fan-out-reviews.theta:34`, `ralph.theta:11`,
  `ralph-inline.theta:38`, `refine.theta:12`, `:17`,
  `refine-inline.theta:29`, `:34`.
- Prior reports read for separation:
  [0083](./0083-let-annotation-discarded-from-recorded-binding-type.md)
  (§Non-goals `:148–150`, §Fix (0.55.0) *Residuals* `:259–263`),
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md),
  [0031](./0031-ctor-field-value-typing-unchecked.md).
- Observations: throwaway vitest parse probe over `parseDoc` at `2eafbf10`,
  fourteen sources, deleted after the run. The 0.54.0 disposition of row (a) 1
  is taken from 0083's test ledger, not re-measured here.

## Coordination note — bug 0126 (0.107.0): the `CompatType` map gains a fourth writer

Appended by the bug 0126 fix; nothing above is altered, and this report's §Fix
is untouched. **Note only — this report stays open.**

§Actual behaviour enumerates the three sites that write `TypeLayerWalk`'s
`CompatType` map — the `let` arm, `fn` parameters, and the comprehension
(`par for`) loop variable — and notes that the plain `for` statement is absent
from that list because it writes nothing.

[0126](./0126-plain-for-binds-no-loop-variable.md) added it.
`walkStmt`'s `case "for"` now writes the body scope with the TYPE-11-unfolded
iterand's element type when the iterand unfolds to an `array`, and with bug
0050's withheld twin otherwise. The map therefore has **four** judged-type
writers, and the enumeration should be read with the `for` arm alongside the
`par for` arm whenever this report is next revised.

Nothing else moves for this report's subject. The reassignment arm still
delegates over the real binding rather than over this map, so what type a
reassigned `let mut` carries — this report's question — is unchanged in both
directions. 0126 measured `for x in xs { x = "b" }` as silent before and after
and pinned it as an attribution row (witness cell `e2`,
`tests/plain-for-loop-variable-element-type.test.ts`) citing this report and
[0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md), so the
silence stays attributed here and not to the `for` arm.

## Fix (0.133.0)

**The adjudication.** §Fix **disposition 1**, on §Fix's own recommendation and
its three verified grounds. Stated normatively, and citable in this form by
[0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md):

> `docs/spec_topics/bindings.md` §Reassignment, anchor
> `#reassignment-binding-type` — "A reassignment does not change the binding's
> type: every later reference resolves the type the binding was declared or
> inferred with, for the whole of the binding's scope."

The rule is the read-side half only. It ratifies the behaviour at HEAD, so the
resolution changes **zero code**; the write-side obligation already on
`bindings.md:12` stands unedited and unenforced, which is 0115's subject. Under
this adjudication 0115's premise **survives**: its §Fix (d) branch "0090's
disposition 2 deletes this report's obligation" is closed as not taken, and its
route choice (mint a row versus widen `let-rhs-type-mismatch`'s *Trigger*) is
untouched by this fix. Nothing here adds the reassignment RHS to
`type-system.md:27`'s `⊑` position enumeration or to TYPE-9 (`:50`), and no
diagnostic code, *Trigger* or *Message* moved — those edits belong to 0115's
chosen route.

- **What shipped:**
  - `docs/spec_topics/bindings.md` — the adjudicating sentence above, appended
    in place to the existing **Reassignment** paragraph (line 12) behind an
    inline `<a id="reassignment-binding-type"></a>`, the anchor convention
    `type-system.md`'s `<a id="type-9"></a>` uses. Appended in place, not
    inserted as a paragraph, so the page stays 36 lines and §Fix constraint 6's
    inbound `:25` / `:36` citations do not shift.
  - `docs/reference/grammar.md` — the same-commit user-facing mirror in
    §"Bindings & mutability": "A reassignment does not retype the binding; later
    reads keep its type." Added by re-wrapping the existing 507–515 paragraph so
    the page stays 623 lines; hundreds of inbound line citations point into this
    page, some below `:515`.
  - `tests/reassignment-binding-type-governs.test.ts` (new) — seven parse-level
    cells locking the adjudicated rule as observables, so it stops existing only
    as a comment inside 0083's regression file.
  - `tests/let-annotation-recorded-binding-type.test.ts` — 0083's pin
    re-anchored to the new sentence per §Fix constraint 3, comment text only
    (assertion byte-identical), and its stale `type-layer-checks.ts:598–600`
    citation corrected to the measured `:1314–1316`. Rewritten at equal length,
    so the file stays 343 lines and the `:328–343` citations in this report, in
    0115, in 0130 and in the new witness file stay accurate.
  - `src/` — untouched. `git diff --stat -- src/` empty; the reassign arm is
    byte-exact to HEAD (`1fc5f76443e6ea7f0b20270eed648ca42f6b187c`).
- **Gates:** witness `npx vitest run tests/reassignment-binding-type-governs.test.ts`
  → 7 passed; `npx vitest run tests/let-annotation-recorded-binding-type.test.ts`
  → 19 passed; full default suite `npx vitest run` → 332 files / 6094 tests
  passed (fork baseline 331 / 6087; the delta is exactly this fix's one new
  file); `npm run typecheck` clean; `npm run lint` clean; `wc -l` 36 / 623 / 343
  as required. Live: H9a both files 11/11 green through the real `pi -p`
  (`tests/live/acceptance/`), H8a 6 files / 75 tests green. No H8a cell was
  minted: the fix has no behavioural delta, so no theta's registration verdict
  moves and a new cell would assert nothing this adjudication changed.
- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) — CLEAN, no findings, with a
  per-constraint sweep of §Fix 1–6, the anchor's uniqueness and house
  conformance, the H5e un-anchored-`MUST` gate check on the amended paragraph, a
  clause-by-clause diff of the re-wrapped mirror, and one non-blocking residual
  (R1, recorded as residual 2 below). One **pre-review citation correction
  round** ran before it (not a review round; numbering unaffected): the
  re-anchor had been appended as seven extra comment lines, drifting the
  `:328–343` citations in this report, in 0115 and in 0130; the comment was
  rewritten at equal length and the stale src citation fixed in the same pass.
  Comment-only, zero assertions touched, gates re-run green.
- **Verification:** PASS (SOLID). The witness genuinely witnesses: the rejected
  disposition 2 was applied at `type-layer-checks.ts:1314–1316`
  (`bindings.set(stmt.target, this.typeOf(stmt.value, bindings))` before the
  `return`) and reds exactly a1, b1 and c5 with the flips §Fix disposition 2
  predicts, while the four controls a2/a3/b2/c6 stay green; 0083's pin reds
  under the same neutralisation, confirming the two files witness one rule. The
  neutralisation was restored byte-exact (`git hash-object` equal to
  `git rev-parse HEAD:src/parser/type-layer-checks.ts`,
  `1fc5f76443e6ea7f0b20270eed648ca42f6b187c`) and both files re-run green.
  Default suite green. Lint and typecheck clean. Line counts and the two inbound
  `bindings.md` citations spot-checked against the sentences 0049 and 0084
  describe. The anchor is defined exactly once and spelled identically at every
  citation. `tests/committed-fixture-parse-gate.test.ts` green, 36 cells, so no
  shipped `.theta` moved.
- **Residuals:**
  1. **The recorded type is now a normative contract that nothing enforces.**
     §Fix disposition 1 attaches this obligation explicitly ("blessing the
     reading without it leaves a declared type any write can contradict
     silently"), and it is discharged by
     [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md), not
     here — operator-set boundary. Evidence, re-measured at this HEAD through
     `parseThetaDocument`: `let mut n: integer = 1` / `n = 1.5` → `[]`;
     `let mut n: number = 1` / `n = "x"` → `[]`;
     `let mut n: integer = 1` / `n += 1.5` / `let m: integer = n` → `[]`;
     `let mut xs: array<string> = []` / `xs = [1]` / `xs.join(",")` → `[]`;
     `let mut n: number = 1` / `n = "x"` / `n.length()` →
     `["theta/parse/unknown-method"]` (§Reproduction rows (c) 1–5, unchanged).
  2. **Two witness cells assert an absence 0115 will legitimately move.** Cells
     b1 (`[]`) and c5 (`[]`) in `tests/reassignment-binding-type-governs.test.ts`
     are silent *because* the reassignment-RHS check is absent; when 0115 wires
     one, both expectations gain a code at the reassignment statement while the
     rule they lock (which type a later reference resolves) is unaffected. Both
     cells' comments say so and name 0115. Second-order, from review round 1:
     0115 §Fix (c) routes the reassignment narrowing sub-case to the existing
     `theta/parse/integer-narrowing`, so b1's post-0115 expectation becomes
     list-identical to the disposition-2 signature it was red-proven against —
     `codesOf` drops positions, so at code-list granularity b1 will stop
     distinguishing "declared-governs + RHS check" from "re-derive". c5's
     post-0115 code differs from its disposition-2 code, so the file as a whole
     keeps discriminating; 0115's implementer should lean on c5, or pin
     positions in b1, when updating them.
  3. **One first H8a run reported two reds that did not reproduce.** The clean
     re-run of the same six files was 75/75 green, and the identity of the two
     initial reds was not captured. Not attributable to this fix: the diff
     touches no `src/` byte (`git hash-object src/parser/type-layer-checks.ts`
     equal to HEAD's blob) and the H8a axis is stochastic. Recorded rather than
     dismissed.
  4. **A pre-existing stale citation, out of remit.**
     `docs/bugs/0165-empty-params-default-literal-admitted-and-never-bound.md:1039`
     cites `docs/reference/grammar.md:513` as the is-literal check; at this HEAD
     `:513` falls inside §"Bindings & mutability", not the literal-sublanguage
     section. The drift predates this fix (this fix's mirror hunk is
     line-count-neutral, `@@ -507,12 +507,12 @@`) and 0165 is another report's
     document.
- **Discharge notes appended:** none. 0115's and 0130's documents were left
  untouched by operator boundary; the rule 0115 needs is stated citably at the
  top of this record.
- **Pinned dispositions / non-goals:** disposition 2 (each reassignment
  re-derives the recorded type) is **rejected**, and is now witnessed as
  rejected — it is the neutralisation the witness file reds against. Its two
  attached obligations (a nested-block join rule the corpus does not state; a
  TYPE-11-transparency re-proof at the reassignment) are therefore moot and are
  not carried forward. Out of scope and unchanged: the reassignment-RHS
  compatibility check and its DIAG-2 route (0115); `type-system.md:27`'s `⊑`
  position enumeration and TYPE-9 (`:50`); the `fn`-argument position (0050);
  the constructor-field position (0031); runtime behaviour (`writeBinding` in
  `lexical-environment.ts` accepts on mutability alone, and `integer` / `number`
  are one JS value, so no executed value moves); 0079's adjudicated
  interpolation disposition.
### Discharge note — residual 2 discharged by bug 0115 (X.Y.Z)

Appended by the bug 0115 fix; nothing above is altered and this record stays as
it was written.

Residual 2 above pre-authorized the movement of two witness cells in
`tests/reassignment-binding-type-governs.test.ts` once
[0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md) wired a
reassignment-RHS compatibility check. 0115 shipped that check (route 1 — the
minted `theta/parse/reassign-rhs-type-mismatch`) and both cells moved in exactly
the direction this residual names, with the rule each locks unchanged:

- **b1** `[]` → `["theta/parse/integer-narrowing"]` — 0115 §Fix (c) routes the
  reassignment narrowing sub-case to the existing registered row, so this is the
  list-identity this residual's second-order note predicted. The remedy this
  residual recommends was taken: b1 now also pins the diagnostic's **position**
  (the reassignment statement, not the later reference), which is what restores
  its discrimination between declared-governs-plus-RHS-check and the rejected
  disposition 2.
- **c5** `[]` → `["theta/parse/reassign-rhs-type-mismatch"]` — the cell this
  residual names as the one that keeps discriminating by code alone, since
  disposition 2's code at that position is
  `theta/parse/non-string-array-join`.

Residual 1 (the recorded type as a normative contract nothing enforces) is
likewise discharged by 0115's check. Residuals 3 and 4 are untouched.
