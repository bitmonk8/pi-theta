# Bug 0195 — `control-flow.md:13` and three sibling corpus sentences state that `for x in []` with no surrounding sink is `theta/parse/array-no-common-type`, "the same diagnostic that `let xs = []` raises in unannotated position", and both measure `[]` at HEAD: the reachable emitter's sink-less arm exempts an empty literal by construction (`type-compat.ts:601`, "Fewer than two branches trivially share one") while the one function written for exactly this class — `checkArrayCommonType` (`type-grammar.ts:890`), whose `for-iterand` and `none` contexts both fire on `[]` — has no `src/` caller and is reached only by a green unit cell asserting the diagnostic the production parser never emits

- **Status:** fixed (0.190.0) — **route (a)**; see `## Fix (0.190.0)`. §Fix was
  constraint-pinned, not settled, at filing: the deliverable was
  the adjudication — either the four corpus sentences are corrected and the
  callerless emitter is disposed of, or the empty-literal refusal is wired and
  `theta/parse/array-no-common-type`'s registered *Trigger* is dispositioned
  under DIAG-2. Two ordering constraints, both measured below and binding on
  the wiring route only. **Route (b) blocks on
  [0156](./0156-fn-parameter-sink-not-consulted-for-rule3-unions.md)**: two of
  the four sinks the spec declares exhaustive are not supplied at HEAD
  (§Reproduction (d)), so wiring the refusal before they are draws an `E` on
  `f([])` and on `let xs: array<array<integer>> = [[]]`, both of which the same
  spec sentence declares legal. And whichever of
  [0155](./0155-ternary-common-type-unenforced-trigger-conflict.md) /
  [0158](./0158-match-arm-and-fn-return-lub-diverge-from-common-type.md) lands
  first rules the *Trigger*-fidelity question this report also turns on — may an
  implementation emit a registered code outside its registered *Trigger*
  because a rule page says it should — and this report's adjudication cites
  that ruling rather than re-deriving it.
- **Sev/Diff estimate:** S3/D3 — S3 on the verification-gap band: the
  registered row's empty-literal arm fires on no input at HEAD
  (§Reproduction (a)), and the only function that implements it,
  `checkArrayCommonType` (`src/parser/type-grammar.ts:890`), has zero `src/`
  callers while a green unit cell (`tests/type-grammar.test.ts:186–202`)
  asserts it produces the diagnostic for the exact `for x in []` input the
  production parser passes clean — a witness that cannot red on the shipped
  path, over a row arm no input can fire. The S4 element (four false corpus
  sentences) is subsumed by the higher band. **Not S1**, and the discount is
  measured rather than assumed: the accepted program is inert — an empty array
  iterates zero times (`control-flow.md:15`, CTRL-1, states the empty case
  explicitly) and `[]` is a valid value of every `array<T>`, so no value is
  wrong and no runtime constraint is violated; the one silent static loss is
  that a `for x in []` body's checks defer on the loop variable
  (§Reproduction (c) rows g1/g2), on a body that never runs. **Upgrade
  condition, stated so the fixer can rescore honestly:** if the run adjudicates
  that the refusal is owed, the same evidence rescores **S2** — rows a1–a4 are
  then inputs the spec refuses being accepted with no diagnostic, and the
  deferral in g1/g2 is a lost check rather than a correct one. D3 because §Fix
  needs in-run adjudication, because the wiring route has a named prerequisite
  in another open report (0156) plus one unowned sink gap (§Reproduction (d)
  row m3), and because the correction route deletes shipped exported code and a
  committed witness cell and edits four corpus sentences across three files
  plus a registry *Trigger* reading.
- **Kind:** defect — a registered `E`-severity parse rule is implemented,
  unit-tested and never wired, in the 0084 / 0050 shape, with the corpus
  stating the unwired behaviour four times. Four elements.
  1. **Four corpus sentences assert the refusal.**
     `docs/spec_topics/control-flow.md:13`, `docs/spec_topics/grammar.md:223`
     and `docs/reference/grammar.md:410` each say in terms that `for x in []`
     with no other sink is `theta/parse/array-no-common-type`; the first two add
     that this is "the same diagnostic that `let xs = []` raises in unannotated
     position". `docs/spec_topics/expressions.md:220` gives `[]` its element
     type only "from context (binding annotation, parameter type, or
     surrounding constructor field)" and names no fallback for an absent one.
  2. **Both measure `[]`.** §Reproduction (a): `for x in [] { … }` and
     `let xs = []` each draw zero diagnostics through the shipped
     `parseThetaDocument` and the theta registers.
  3. **The reachable emitter exempts the empty literal by construction.**
     `checkCommonType`'s sink-less arm (`src/parser/type-compat.ts:598–603`)
     opens `if (branches.length < 2 || …) return []`, over the comment "Fewer
     than two branches trivially share one" — an in-tree statement of the
     opposite rule to the four sentences. The row is not dead: the same arm
     fires on the two-object-schema case, and §Reproduction (b) rows f1/h3
     measure it firing at the `for` and `par for` iterand positions, so the
     silence at `[]` is the guard, not an unvisited node.
  4. **A second emitter written for exactly this class has no caller.**
     `checkArrayCommonType` (`src/parser/type-grammar.ts:890–923`) takes an
     `ArraySinkContext` (`:864–870`) whose `for-iterand` and `none` members
     exist only to make an empty literal fire, and its doc comment (`:878–885`)
     says so: "the `for-iterand` and `none` contexts both leave the literal
     unsunk, so an `[]` in either fires". `rg` finds no `src/` caller
     (§Reproduction (e)); the only caller anywhere is
     `tests/type-grammar.test.ts:186–202`, green, asserting the registry
     *Message* for a `for-iterand` `[]`.
- **Related:**
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **fixed (0.107.0)**,
    the filing origin. Its fix edited `control-flow.md:13` and left this
    sentence in the byte-unchanged remainder of the same line; its `## Fix
    (0.107.0)` residual 3 records the observation and the reason it was not
    closed there ("Untouched by this fix — the emission path is the common-type
    machinery"). Its fix also supplies the loop-variable behaviour
    §Reproduction (c) measures: the body scope now records the iterand's
    TYPE-11-unfolded element (`src/parser/type-layer-checks.ts:1071–1121`), so
    `for x in []` binds the variable to the `named "unknown"` element an empty
    literal infers and body checks defer on it. Before 0.107.0 that body bound
    nothing at all.
  - [0081](./0081-array-ternary-common-type-never-unions.md) — **fixed
    (0.83.0)**, the family. It rewrote the sink-less arm this report measures,
    introducing the shared `commonType` (`type-compat.ts:665`) whose empty-set
    early return (`:670–672`) is one of the two places the empty literal is
    exempted. Its §Non-goals excludes "the empty-literal case" by name and
    routes it to the report that became 0083; that routing covered the *`let`
    annotation being discarded*, not the sentence this report claims.
  - [0155](./0155-ternary-common-type-unenforced-trigger-conflict.md) —
    **open**, and [0158](./0158-match-arm-and-fn-return-lub-diverge-from-common-type.md)
    — **open**, the two reports in the adjudication class this one joins. All
    three ask whether an implementation may emit `theta/parse/array-no-common-type`
    (or its `match`/return siblings) outside a registered *Trigger* because a
    rule page says it should. 0155 owns the ternary branch pair; 0158 owns the
    `match`-arm and `fn`-return LUBs; this report owns the empty literal and the
    `for` iterand. The three are behaviourally disjoint — no row here moves
    under either of their routes, and neither of their rows moves under either
    of this one's — but the *Trigger*-fidelity ruling is shared and must not be
    made twice in two directions.
  - [0156](./0156-fn-parameter-sink-not-consulted-for-rule3-unions.md) —
    **open**, and a **prerequisite of route (b)**. Its subject is that
    `checkFnCallArgs` resolves the callee's parameter type and never hands it to
    `checkArrayLiteral`, so no `fn`-parameter sink is supplied at a call site.
    `expressions.md:220` names the parameter type as a sink for `[]`
    specifically. Until 0156 lands, wiring the empty-literal refusal turns
    §Reproduction (d) row b2 (`f([])`, `[]` today) into an `E` on a program the
    same sentence declares legal.
  - [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md)
    — **open**, and the owner of this defect's one measured downstream
    consequence. An unannotated `[]` types as `array<unknown>`
    (§Reproduction (c) row d2), and `xs.join(",")` on it draws
    `theta/parse/non-string-array-join` (rows e1/e2). 0127's §Actual behaviour
    already enumerates "the synthesised `named "unknown"` an empty array literal
    with no sink types as" as one of the five spellings its element arm refuses.
    That row is 0127's, not this report's (§Non-goals).
  - [0157](./0157-alias-vs-concrete-sink-spelling-code-divergence.md) —
    **open**, whose §Reproduction (a) cells f7 (`schema U = array<string>` +
    `let xs: U = []`) and f8 (`let xs: array<string> = []`) measure the
    **annotated** empty literal on both spellings and record them agreeing at
    `[]`. Those are the sunk case, which every route here keeps clean; this
    report claims only the unsunk case f7/f8 do not cover.
  - [0084](./0084-increment-decrement-check-dead.md) — **fixed (0.71.0)**, and
    [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the template. 0084's own Kind line is this report's
    element 4 verbatim in shape: "a registered `E`-severity parse rule is
    implemented, unit-tested and never wired, and the input it was written to
    reject is not". The difference here is that the row is only *partly*
    unfireable — the ≥2-heterogeneous-element arm works — so the disposition
    cannot be 0084's "call the emitter" without deciding what the empty literal
    is owed first.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class covering the positional drift either route
    induces in `src/parser/type-grammar.ts` and `src/parser/type-compat.ts`
    citations.
- **Affected** (every citation verified against the tree at HEAD `5c9104ab`,
  0.107.0; symbols named alongside lines because `src/parser/type-compat.ts`
  grew 704 → 825 and `src/parser/type-layer-checks.ts` 2531 → 2548 since the
  reports that cite them positionally were filed):
  - **The four corpus sentences.**
    - `docs/spec_topics/control-flow.md:13` — the `for … in` paragraph. The
      clause, verbatim: "The iterand position is **not** an element-type sink
      for empty-array literals — `for x in []` with no surrounding sink is
      `theta/parse/array-no-common-type`, the same diagnostic that
      `let xs = []` raises in unannotated position. Annotate via a
      `let xs: array<T> = []` immediately above the loop, or inline the literal
      under a sink that supplies `T`".
    - `docs/spec_topics/grammar.md:223` — the closing line of §"`array<T>`
      literal type-sink rule" (heading `:214`, the exhaustive sink set
      `:218–221`): "The iterand of a `for x in expr` is **not** a sink — `for`
      cannot supply `T` to `[]`. `for x in []` with no other sink is
      `theta/parse/array-no-common-type`, the same diagnostic that
      `let xs = []` raises in unannotated position. This is the same hole;
      resist any `for`-specific carve-out."
    - `docs/reference/grammar.md:410` — the mirror (heading `:403`, sink set
      `:405–409`): "The `for x in expr` iterand is **not** a sink: `for x in []`
      with no other sink is `theta/parse/array-no-common-type`." The same page's
      grammar bullet at `:398–400` states the general rule without the empty
      case.
    - `docs/spec_topics/expressions.md:220` — "`[]` is the empty array; its
      element type is inferred from context (binding annotation, parameter type,
      or surrounding constructor field). … An array whose elements have no
      common type and no context to narrow against is
      `theta/parse/array-no-common-type`." `:222–226` are the three numbered
      common-type rules; none of them mentions an empty literal.
    - Supporting, not claimed: `docs/spec_topics/glossary.md:67`, the *type
      sink* entry — "an `array<T>` literal (`[]` / `[expr, ...]`) takes its
      element type from the sink" — which names `[]` first among the two
      consumers.
  - **The registered row.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:41` —
    `theta/parse/array-no-common-type`, severity `E`, phase `type`, *Trigger*
    "Array literal whose elements have no common type and no sink to narrow
    against.", *Hint* "Annotate the binding with `array<A | B>` or use a single
    schema.", *Message* `array elements have no common type; annotate the
    binding with array<A | B> or use a single schema`. Mirror without a
    *Trigger* column: `docs/reference/diagnostics.md:87`.
  - **The governing meta-rules.**
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2, "**The
    registry is closed.** Adding a new code, removing a code, or changing a
    code's namespace, severity, or trigger are all spec changes". `:74` —
    DIAG-4, the *Message* column is normative and a reword defers to theta 2.0.
    `docs/spec_topics/governance/source-language-stability.md:9` — the
    loads-cleanly predicate; `:25` — the diagnostic-registry carve-out.
  - **The reachable emitter, and the guard that exempts `[]`.**
    `checkCommonType` (`src/parser/type-compat.ts:564`, doc comment `:550–563`)
    — the sink-less arm at `:598–603`, whose test is
    `if (branches.length < 2 || commonType(branches, env, checkCompatible) !==
    undefined) { return []; }` (`:601`) under the comment "Fewer than two
    branches trivially share one" (`:599–600`); the raise at `:604–615`. Its
    single `src/` caller is `TypeLayerChecker.checkArrayLiteral`
    (`src/parser/type-layer-checks.ts:1443`, the `checkCommonType` call at
    `:1458`), dispatched from three sites — the annotated `let` (`:982`), the
    constructor-field sink (`:1577`), and `walkExpr`'s bare `case "array"`
    (`:1962–1964`, with `sink: undefined` and the `skipArray` guard).
  - **The shared LUB's own empty-set exemption.** `commonType`
    (`src/parser/type-compat.ts:665`, doc comment `:629–664`) returns
    `undefined` for an empty branch set at `:670–672`, and the doc comment's
    closing paragraph states the reason: an empty set "has no least upper bound
    to compute … the search below would find no dominating candidate and no
    object branch either, and fall through to an empty union, which is not a
    type this function may return". So `commonType([])` and
    `commonType([A, B])` both answer `undefined`; only the `branches.length < 2`
    guard at `:601` distinguishes them, and it distinguishes them the way the
    corpus says it should not.
  - **The callerless emitter.** `checkArrayCommonType`
    (`src/parser/type-grammar.ts:890–923`), exported, with `ArraySinkContext`
    (`:864–870`, the six-member context enum including `for-iterand` at `:869`
    and `none` at `:870`), `ArrayLiteralSite` (`:873–876`), the doc comment
    (`:878–889`) and the raise (`:914–922`). The file-header prose at `:65–69`
    restates the rule: "the `for x in expr` iterand is explicitly NOT a sink".
    Zero `src/` callers (§Reproduction (e)).
  - **The witness that cannot red.** `tests/type-grammar.test.ts:185–203` —
    `describe("V2a-T — array literal type sink (theta/parse/array-no-common-type)")`
    with one cell (`:186–202`) whose comment reads "`for x in []` — the iterand
    is explicitly NOT a sink, so `[]` has no resolving sink and fires
    (grammar.md §"array<T> literal type-sink rule")", asserting the registry
    *Message* character-for-character. Green at HEAD, against a function nothing
    in `src/` calls.
  - **The inference side.** `StaticTypeInferencePass.#typeExpr`'s
    `case "array"` (`src/parser/static-type-inference.ts:217–223`) types the
    literal as `{ kind: "array", element: #commonType(elementTypes) }`;
    `#commonType` (`:388–393`, doc comment `:375–387`) answers an empty
    candidate set with `{ kind: "named", name: "unknown" }` (`:389–391`) ahead
    of the delegation. That is where `array<unknown>` comes from
    (§Reproduction (c) row d2).
  - **The `for` and `par for` iterand walks.** `walkStmt`'s `case "for"`
    (`src/parser/type-layer-checks.ts:1071–1121`) — `checkForIterand` at
    `:1080–1084`, `this.walkExpr(stmt.iterand, …)` at `:1088` (the call that
    reaches the bare `case "array"` arm), and the body-scope record of the
    TYPE-11-unfolded element at `:1110–1113`. The `par for` twin's iterand
    handling at `:2024–2039`, with its own `walkExpr(e.iterand, …)` at `:2039`.
  - **The corpus.** `git ls-files '*.theta' '*.thetalib'` is **34** files.
    **Zero** contain an `[]` literal of any kind and **zero** contain a `for`
    over a bracket literal (§Reproduction (f)), so no committed source moves
    under either route.
- **Observed at:** 0.107.0 (`5c9104ab`), offline and provider-free — no model,
  no session, no child process, no network. Parse rows go through the shipped
  `parseThetaDocument` via the house driver `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) with frontmatter `---\nmode: prompt\n---` on
  lines 1–3, so the source under test starts on line 4. `codes` is the whole
  unfiltered `doc.diagnostics` in emission order; a row with `codes :: []`
  registers, since `hasLoadParseError`
  (`src/extension/production-composition.ts`) refuses only on an
  error-severity `theta/load/` or `theta/parse/` code. Measured with four
  scratch vitest probes, run on the outputs quoted below and then deleted; no
  path matching `scratch` was left behind by this filing, and `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by it.

## Summary

Four corpus sentences say that an empty array literal with no sink is
`theta/parse/array-no-common-type`, and two of them name the two spellings
explicitly: `for x in []` and `let xs = []`. At HEAD both load with zero
diagnostics and both register.

Two mechanisms produce the silence, and neither is an oversight in the code's
own terms. `checkCommonType`'s sink-less arm short-circuits at
`branches.length < 2` (`type-compat.ts:601`) under the comment "Fewer than two
branches trivially share one" — the direct negation of the corpus rule. Behind
it, `commonType` answers an empty branch set with `undefined` because an empty
union is not a type it may return (`:670–672`). The walk does reach the node:
`for x in [A { a: 1 }, B { b: "x" }]` draws the code at the same iterand
position, and so does the `par for` twin.

Meanwhile a second function implements exactly the missing arm.
`checkArrayCommonType` (`type-grammar.ts:890`) takes a sink context whose
`for-iterand` and `none` members exist only so an empty literal fires, and its
doc comment says so. It has no `src/` caller. Its one caller anywhere is a green
unit cell (`tests/type-grammar.test.ts:186–202`) that asserts the registry
*Message* for a `for-iterand` `[]` — a witness that cannot red on the shipped
path, standing over a registered-row arm that no source input can fire.

The adjudication is the deliverable: correct the four sentences and dispose of
the callerless emitter, or wire the refusal and disposition the *Trigger*.
Wiring is not free — two of the four sinks the spec declares exhaustive are not
supplied at HEAD, so the refusal would land on programs the same sentence
declares legal.

## Reproduction

Offline and deterministic at HEAD `5c9104ab`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`,
frontmatter `---\nmode: prompt\n---`, source from line 4. `codes` is the whole
unfiltered diagnostic list in emission order.

### (a) The two subject rows

| # | source | codes | registers |
|---|---|---|---|
| a1 | `for x in [] {`<br>&nbsp;&nbsp;`` @`hi`? ``<br>`}`<br>`1` | `[]` | **yes** |
| a2 | `for x in [] {`<br>`}`<br>`1` | `[]` | **yes** |
| a3 | `let xs = []`<br>`1` | `[]` | **yes** |
| a4 | `let xs = []`<br>`xs` | `[]` | **yes** |

a1/a2 are `control-flow.md:13`'s and `grammar.md:223`'s named input; a3/a4 are
the `let` half of the same sentence. All four are silent.

### (b) The walk does reach the node — the guard is what withholds

| # | source | codes |
|---|---|---|
| f1 | two schemas + `for x in [A { a: 1 }, B { b: "x" }] {`&nbsp;`` @`hi`? ``&nbsp;`}` + `1` | `["theta/parse/array-no-common-type"]` |
| f2 | `for x in [1, "a"] {`&nbsp;`` @`hi`? ``&nbsp;`}` + `1` | `[]` |
| h3 | two schemas + `let r = par for x in [A { a: 1 }, B { b: "x" }] {`&nbsp;`x`&nbsp;`}` + `r` | `["theta/parse/array-no-common-type"]` |
| c1 | two schemas + `let x = [A { a: 1 }, B { b: "x" }]` + `x` | `["theta/parse/array-no-common-type"]` |
| c2 | `let x = [1, "a"]` + `x` | `[]` |
| i1 | `let xs = [1]` + `xs` | `[]` |

Every row prefixed "two schemas" carries `schema A { a: integer }` and
`schema B { b: string }` ahead of the subject line. f1 and h3 are the load
bearers: an unsunk array literal in a `for` / `par for` iterand DOES reach
`checkArrayLiteral` and DOES draw the code when it has two object branches. So
a1/a2's silence is `checkCommonType`'s `branches.length < 2` guard, not an
unvisited node. f2 and c2 are the post-0081 union control (bug 0081's clause 2,
not claimed here); c1 is the reachable emitter's live arm; i1 is the
one-element boundary the same guard also exempts, which no corpus sentence
disputes.

### (c) What an unsunk `[]` types as, and what defers behind it

| # | source | result |
|---|---|---|
| d2 | tail `[]`, raw `StaticTypeInferencePass.typeOf` | `array<unknown>` — `{"kind":"array","element":{"kind":"named","name":"unknown"}}` |
| g1 | `for x in [] {`&nbsp;`let n = x + 1`&nbsp;`` @`hi`? ``&nbsp;`}` + `1` | `[]` |
| g2 | `for x in [] {`&nbsp;`let n = x.join(",")`&nbsp;`` @`hi`? ``&nbsp;`}` + `1` | `[]` |
| g3 | control — same body over `[1]` | `["theta/parse/unknown-method"]` — `unknown method 'join' on type integer` |
| e1 | `let xs = []` + `let n = xs.join(",")` + `n` | `["theta/parse/non-string-array-join"]` — `… got array<unknown>` |
| e2 | `let n = [].join(",")` + `n` | `["theta/parse/non-string-array-join"]` — `… got array<unknown>` |
| e3 | `fn f(xs: array<integer>): integer { 1 }` + `let xs = []` + `let n = f(xs)` + `n` | `[]` |
| j1 | `let xs = []` + `let n = xs.length` + `n` | `[]` |
| j2 | `let xs = []` + `let y = xs[0]` + `y` | `[]` |

d2 is the mechanism: `#commonType` answers an empty candidate set with
`named "unknown"` (`static-type-inference.ts:389–391`), so the literal's type is
`array<unknown>`. g1/g2 against g3 is the one silent static loss — bug 0126's
fix records the loop variable in the body scope as the iterand's element, and
for `[]` that element is unresolvable, so every body check defers on it; the
identical body over `[1]` draws `unknown-method`. The body of a `for x in []`
never runs (CTRL-1, `control-flow.md:15`), so nothing is mis-evaluated. e1/e2
are bug 0127's class, named there and not claimed here.

### (d) Which of the four declared sinks are supplied at HEAD

`expressions.md:220`, `grammar.md:218–221` and `reference/grammar.md:405–409`
declare the sink set exhaustive: binding annotation, `fn` parameter type at a
call site, surrounding constructor field, and the element type of an
array-typed sink this literal is an element of (recursive).

| # | source | codes | sink | supplied |
|---|---|---|---|---|
| b1 | `let xs: array<integer> = []` + `xs` | `[]` | binding annotation | yes (`type-layer-checks.ts:982`) |
| b3 | `schema S { xs: array<integer> }` + `let s = S { xs: [] }` + `s` | `[]` | constructor field | yes (`:1577`) |
| b2 | `fn f(xs: array<integer>): integer { 1 }` + `let n = f([])` + `n` | `[]` | `fn` parameter | **no** — bug 0156 |
| m1 | `let xs: array<array<integer>> = [[]]` + `xs` | `[]` | array element (recursive) | **no** — row m3 |
| m3 | two schemas + `let xs: array<array<A \| B>> = [[A { a: 1 }, B { b: "x" }]]` + `xs` | `["theta/parse/array-no-common-type"]` | array element (recursive) | **no** |
| m2 | `let xs: array<array<integer>> = [["a"]]` + `xs` | `["theta/parse/let-rhs-type-mismatch","theta/parse/array-element-type-mismatch"]` | — | — |
| k1 | `let xs: array<integer> = []` + `let ys = xs.concat([])` + `ys` | `[]` | — | — |

b1 and b3 are silent for the right reason and stay silent under every route.
b2 and m1 are silent for the wrong reason — they are unsunk, not sunk — and
that is what makes route (b) unsafe today: wiring the refusal turns two legal
programs into `E`s. Row m3 is the proof for the array-element half: the sink
`array<A | B>` is written, in scope, and expects exactly the union the inner
literal forms, and the inner literal is still judged sink-less and refused. The
outer `let` arm supplies the annotation element to the OUTER literal only
(`type-layer-checks.ts:982`); `walkExpr` then reaches the inner literal through
the bare `case "array"` arm with `sink: undefined` (`:1962–1964`). m2 shows the
element sink working one level down when the outer literal is the annotated
one. **Row m3 is recorded, not claimed** — see §Non-goals.

### (e) The callerless emitter

```
$ rg -n "checkArrayCommonType|ArraySinkContext|ArrayLiteralSite" src/ tests/
src/parser/type-grammar.ts:864:export type ArraySinkContext =
src/parser/type-grammar.ts:873:export interface ArrayLiteralSite {
src/parser/type-grammar.ts:890:export function checkArrayCommonType(
src/parser/type-grammar.ts:891:  context: ArraySinkContext,
src/parser/type-grammar.ts:893:  site: ArrayLiteralSite,
tests/type-grammar.test.ts:3:  type ArraySinkContext,
tests/type-grammar.test.ts:4:  checkArrayCommonType,
tests/type-grammar.test.ts:27:// `parseTypeExpression` / `checkArrayCommonType` seams (src/parser/type-grammar.ts).
tests/type-grammar.test.ts:189:    const forIterand: ArraySinkContext = "for-iterand";
tests/type-grammar.test.ts:190:    const d = checkArrayCommonType(forIterand, [], site());
tests/type-grammar.test.ts:199:    const bindingAnnotation: ArraySinkContext = "binding-annotation";
tests/type-grammar.test.ts:200:    const ok = checkArrayCommonType(bindingAnnotation, [], site());
```

Five of the eleven matches are the declaration, two are the test's imports, one
is a comment. The only calls are `tests/type-grammar.test.ts:190` and `:200`.
The cell's assertions, verbatim from `:191–201`:

```ts
    expect(d, "theta/parse/array-no-common-type for a for-iterand `[]`").toBeDefined();
    expect(d?.code).toBe("theta/parse/array-no-common-type");
    // Message from code-registry-parse.md.
    expect(d?.message).toBe(
      "array elements have no common type; annotate the binding with array<A | B> or use a single schema",
    );

    // A binding annotation IS a sink: `let xs: array<T> = []` resolves.
    const bindingAnnotation: ArraySinkContext = "binding-annotation";
    const ok = checkArrayCommonType(bindingAnnotation, [], site());
    expect(ok, "a binding-annotation sink resolves `[]`").toBeUndefined();
```

The cell is green and its subject is row a1's source. It measures a function
the production parser does not call.

### (f) Corpus census — GOV-15 direction

```
$ git ls-files '*.theta' '*.thetalib' | wc -l
34
$ git ls-files '*.theta' '*.thetalib' | xargs grep -n "\[\]"
(no output)
$ git ls-files '*.theta' '*.thetalib' | xargs grep -n "for .* in \["
(no output)
```

Zero committed sources contain an `[]` literal and zero iterate a bracket
literal, so under either route no committed theta's diagnostic sequence moves.
Re-run this at the fix HEAD rather than copying it: sibling fixes land `.theta`
files (0081's report records 32 → 34 across two runs).

## Expected behaviour

Four corpus sentences bear, and they agree with each other and disagree with
the implementation.

`docs/spec_topics/control-flow.md:13`:

> The iterand position is **not** an element-type sink for empty-array literals
> — `for x in []` with no surrounding sink is
> `theta/parse/array-no-common-type`, the same diagnostic that `let xs = []`
> raises in unannotated position. Annotate via a `let xs: array<T> = []`
> immediately above the loop, or inline the literal under a sink that supplies
> `T`.

`docs/spec_topics/grammar.md:223`:

> The iterand of a `for x in expr` is **not** a sink — `for` cannot supply `T`
> to `[]`. `for x in []` with no other sink is
> `theta/parse/array-no-common-type`, the same diagnostic that `let xs = []`
> raises in unannotated position. This is the same hole; resist any
> `for`-specific carve-out.

`docs/reference/grammar.md:410`:

> The `for x in expr` iterand is **not** a sink: `for x in []` with no other
> sink is `theta/parse/array-no-common-type`.

`docs/spec_topics/expressions.md:220`:

> `[]` is the empty array; its element type is inferred from context (binding
> annotation, parameter type, or surrounding constructor field).

Each states an observable this report measures directly. The first three name
the diagnostic and the input; the fourth names the only three contexts from
which `[]` may take an element type, and `for x in []` / `let xs = []` supply
none of them. `grammar.md:216` puts it as a requirement: `[]` and `[expr, ...]`
literals "require a *type sink* in surrounding context to determine the element
type when the elements alone are insufficient".

The registered *Trigger* is the one artefact that does not settle it.
`docs/spec_topics/diagnostics/code-registry-parse.md:41`:

> Array literal whose elements have no common type and no sink to narrow
> against.

An empty literal has no elements. Whether elements that do not exist "have no
common type" is not decided by the sentence, and DIAG-2
(`diagnostic-shape.md:72`) makes the *Trigger* the normative statement of the
emission set. So a reader of the four rule sentences and a reader of the
registry can both cite the corpus correctly and disagree about row a1 — the
same shape 0155 measures at the ternary and 0158 at the `match` arm, which is
why the three share an adjudication.

What is settled either way:

1. Rows b1, b3, k1, i1, c2 and f2 do not move. The sunk case, the
   one-element case and bug 0081's union clause are all outside this report.
2. Rows c1, f1 and h3 do not move. The two-object-schema refusal is the
   *Trigger*'s uncontested reading and must survive.
3. The corpus must stop stating one thing four times while the parser does the
   other. Either the four sentences change or the parser does.
4. `tests/type-grammar.test.ts:186–202` cannot stay as it is under either
   route. It asserts a behaviour of a function no shipped path calls; a fix
   either gives the function a caller or removes the claim.

## Actual behaviour / root cause

**The reachable path exempts the empty literal deliberately.**
`checkCommonType`'s sink-less arm (`src/parser/type-compat.ts:598–603`) reads:

```ts
  // Without a sink: the branches need a common type — a branch every other
  // branch is `⊑` (the array/ternary LUB). Fewer than two branches trivially
  // share one.
  if (branches.length < 2 || commonType(branches, env, checkCompatible) !== undefined) {
    return [];
  }
```

"Fewer than two branches trivially share one" is the rule the four corpus
sentences deny. It is also load-bearing for the one-element case (row i1,
`let xs = [1]`), which no sentence disputes, so the guard cannot be deleted
outright — only split.

Behind it, `commonType` (`:665`) answers an empty branch set with `undefined`
at `:670–672`, and its doc comment gives the reason: the union clause would
"fall through to an empty union, which is not a type this function may return".
So `commonType` cannot distinguish "empty" from "rule 3" by its return value;
whichever route is taken, the empty case has to be decided at
`checkCommonType`, not inside the shared LUB.

**The walk is not the problem.** `walkStmt`'s `case "for"` walks the iterand
(`src/parser/type-layer-checks.ts:1088`), which reaches `walkExpr`'s bare
`case "array"` (`:1962–1964`) and calls `checkArrayLiteral` with
`sink: undefined`. Rows f1 and h3 measure the code firing from exactly that
path. The node is visited, the branch list is built, and the guard returns `[]`
because the list is empty.

**A function written for the missing arm exists and is not called.**
`checkArrayCommonType` (`src/parser/type-grammar.ts:890–923`) is the V2a-era
seam for the same rule, expressed over an `ArraySinkContext` rather than over
branch types. Its enum carries `for-iterand` and `none` (`:869–870`) for no
other purpose than to make an empty literal fire, and the doc comment
(`:882–885`) states it: "the `for-iterand` and `none` contexts both leave the
literal unsunk, so an `[]` in either fires". Nothing in `src/` imports it. The
production parser answers the same question with `checkCommonType`, which takes
no context parameter and therefore cannot tell a `for` iterand from a bare
expression — the distinction the four sentences are written around.

**The consequence for the loop variable.** Bug 0126's fix records the body's
loop variable as the TYPE-11-unfolded iterand element
(`src/parser/type-layer-checks.ts:1110–1113`). For `[]` the inference pass
supplies `array<unknown>` (`static-type-inference.ts:217–223` over
`#commonType`'s empty-set answer at `:389–391`), so the recorded element is
`named "unknown"` and every body check defers on it under §"Unresolvable
operands". Rows g1/g2 against g3: the body that draws `unknown-method` over
`[1]` draws nothing over `[]`. That deferral is correct policy given the type;
it is only a loss because the type exists at all, which is what the refusal
would have prevented.

## Why it matters

1. **Four normative sentences in three files state an observable that no input
   produces.** Two of them go further and instruct the author on the remedy
   ("Annotate via a `let xs: array<T> = []` immediately above the loop") for a
   diagnostic they will never see. `grammar.md:223` adds "resist any
   `for`-specific carve-out", which reads as a defended decision about
   behaviour that is not implemented.
2. **A green witness asserts the unimplemented behaviour.**
   `tests/type-grammar.test.ts:186–202` sources the *Message* from the registry
   per DIAG-4 and passes, over a function with no `src/` caller. Anyone
   auditing coverage for `theta/parse/array-no-common-type` finds a cell naming
   `for x in []` and concludes the rule is enforced. This is 0084's shape, and
   0084's own report records the cost: "a registered `E`-severity parse rule is
   implemented, unit-tested and never wired".
3. **The registered row's emission set is smaller than its *Trigger* admits,
   and nothing records which reading is intended.** The row fires only for two
   or more branches with no LUB. Whether the empty literal was excluded by
   decision or by the accident of a guard written for the one-element case is
   not recoverable from the tree — the only two artefacts that speak to it,
   `type-compat.ts:599–600`'s comment and `type-grammar.ts:882–885`'s comment,
   say opposite things.
4. **The fix is not free in either direction, and the cost is invisible from
   the sentence.** §Reproduction (d) measures two of the four declared sinks
   unsupplied, so the obvious repair — make `[]` fire when unsunk — lands an `E`
   on `f([])` and on `let xs: array<array<integer>> = [[]]`, both declared legal
   by the same paragraph. A fixer reading only `control-flow.md:13` would not
   discover that before shipping it.
5. **The cost of resolving it is bounded.** Zero committed thetas contain an
   `[]` literal (§Reproduction (f)), so neither route moves a corpus
   observable, and the GOV-15 disposition is an addition over an input set with
   no committed member.

## Non-goals

- **The `array.join` refusal on `array<unknown>`.** Rows e1/e2 draw
  `theta/parse/non-string-array-join` on an unannotated `[]`. That is bug
  [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md)'s
  class — its §Actual behaviour names "the synthesised `named "unknown"` an
  empty array literal with no sink types as" as one of the five spellings its
  element arm refuses. A route here that gives `[]` a refusal changes 0127's
  fifth spelling from reachable to unreachable and owes 0127 a note; a route
  that does not, changes nothing there.
- **The array-element sink's recursive descent (row m3).** Measured and
  recorded because route (b) must confront it, not claimed: no open report owns
  the fact that a written, in-scope `array<A | B>` element sink does not reach a
  nested literal. Bug
  [0157](./0157-alias-vs-concrete-sink-spelling-code-divergence.md) owns the
  alias-vs-concrete spelling of the three dispatch sites and bug
  [0156](./0156-fn-parameter-sink-not-consulted-for-rule3-unions.md) owns the
  `fn`-parameter sink; neither claims recursive descent. If route (a) is taken,
  row m3 needs its own filing.
- **The `fn`-parameter sink at call sites** — bug 0156's subject, and a
  prerequisite of route (b) rather than a part of this report. Row b2 is quoted
  here only to bound route (b)'s blast radius.
- **Bug 0081's union clause.** Rows c2 and f2 measure it working; nothing here
  touches `commonType`'s clause 2 or its rule-3 gate.
- **The ternary and `match` positions.** 0155 and 0158 own them. No row here
  involves a ternary or a `match`, and no route here edits
  `#typeExpr`'s `case "ternary"` or `case "match"`, `leastUpperBound`, or
  `computeLub`.
- **A *Message* reword.** The registered *Message* ("array elements have no
  common type…") is array-worded and reads oddly for a literal with no
  elements, but DIAG-4 (`diagnostic-shape.md:74`) defers rewording to theta 2.0.
  Route (b) must emit it as written or add a row; it may not edit it.
- **Citation drift.** Either route shifts absolute line numbers in
  `src/parser/type-grammar.ts` and `src/parser/type-compat.ts`; bug
  [0134](./0134-params-shift-induced-stale-citations.md) is the adjudicated
  do-not-chase class.

## Fix

Not settled. The two routes are constraint-pinned; the run selects one and
states the evidence that decided it. They are exclusive — the divergence is
between four sentences and an implementation, and exactly one side moves. Both
land their spec edits in the same commit as any code
(`diagnostic-shape.md:72`).

### Route (a) — the empty literal is not owed a refusal; correct the corpus

The `branches.length < 2` guard stands as the rule. The four sentences are
rewritten to say what an unsunk `[]` actually does, and the callerless emitter
is disposed of.

- **The four sentences.** `docs/spec_topics/control-flow.md:13`,
  `docs/spec_topics/grammar.md:223`, `docs/reference/grammar.md:410` and
  `docs/spec_topics/expressions.md:220` must all move; a route that edits three
  of four leaves the corpus disagreeing with itself instead of with the parser.
  Each must state the replacement observable, not merely delete the claim: an
  unsunk `[]` types as `array<unknown>` (row d2) and its consumers defer under
  §"Unresolvable operands" — which is a statement about the *type system*, so
  `docs/spec_topics/type-system.md` and its mirror need checking for a place it
  belongs.
- **`grammar.md:223`'s "resist any `for`-specific carve-out" is answered, not
  deleted.** The sentence exists to stop a future reader from special-casing
  `for`. Under this route the `for` iterand still is not a sink and still
  supplies no `T`; what changes is that the absence draws nothing. Say that.
- **The callerless emitter.** `checkArrayCommonType`, `ArraySinkContext` and
  `ArrayLiteralSite` (`src/parser/type-grammar.ts:864–923`) implement a rule the
  corpus no longer states. Remove them with the cell that calls them
  (`tests/type-grammar.test.ts:185–203`), or state in writing why dead exported
  code with a green witness is being kept. The file-header prose at
  `type-grammar.ts:65–69` restates the same rule and moves with it.
- **No registry edit.** The *Trigger* at `code-registry-parse.md:41` keeps its
  wording; this route settles the ambiguity by ruling that an empty literal is
  not an "Array literal whose elements have no common type". Record that reading
  where a later reader will find it — the *Trigger* text itself is the natural
  place, and clarifying it IS a DIAG-2 change, so it lands with a GOV-15
  disposition (§Reproduction (f): addition/removal over an input set with no
  committed member).
- **Cost.** Zero behaviour change, so zero risk to the 34-file corpus and no
  witness re-pin outside the removed cell. This is the cheaper route on the code
  axis and the more expensive one on the prose axis.

### Route (b) — the refusal is owed; wire it, after its prerequisites

`checkCommonType` gains an empty-literal arm and the sink set is completed
first.

- **b1 — the prerequisite is real and measured.**
  §Reproduction (d) rows b2 and m1 are unsunk at HEAD. Wiring the refusal
  without supplying the `fn`-parameter sink (bug 0156) and the recursive
  array-element sink (row m3, unowned) turns two spec-legal programs into
  `E`-severity refusals. Land 0156 first, or carry the array-literal sink
  threading in the same change and say so. A route that ships the refusal with
  either sink still missing has traded a false negative for a false positive.
- **b2 — the guard is split, not deleted.** `branches.length < 2` covers two
  populations: zero branches (this report's) and one branch (row i1,
  `let xs = [1]`, which no sentence disputes and which must stay silent). The
  new arm is `branches.length === 0`; the one-branch case keeps its exemption.
- **b3 — `commonType` is not the place.** The shared LUB
  (`type-compat.ts:665`) already answers `undefined` for both the empty set and
  rule 3, and its doc comment records why it may not return an empty union. The
  distinction belongs in `checkCommonType`, above the delegation, or the two
  refusals become indistinguishable to every caller including
  `StaticTypeInferencePass.#commonType`.
- **b4 — the *Trigger* and the *Message*.** The *Trigger*
  (`code-registry-parse.md:41`) says "Array literal whose elements have no
  common type"; an empty literal has no elements, so the row must either be
  reworded to admit it (a DIAG-2 change, GOV-15-dispositioned from a re-run
  census) or the reading recorded explicitly. The *Message* is array-worded and
  DIAG-4 forbids rewording it, so the emitted string at `for x in []` will read
  "array elements have no common type; annotate the binding with
  `array<A | B>`" for a literal with no elements and a remedy of
  `array<T>`. State that disposition; do not fix it silently.
- **b5 — the inference side.** With a refusal at the literal,
  `#commonType`'s empty-set answer (`static-type-inference.ts:389–391`,
  `named "unknown"`) becomes the same kind of post-refusal stand-in as its
  rule-3 fallback, and its doc comment (`:375–387`) should say so. Do not
  change the answer itself without measuring the blast radius: rows e1/e2/j1/j2
  and bug 0127's fifth spelling all read it.
- **b6 — the callerless emitter is still callerless.** Wiring
  `checkCommonType` does not give `checkArrayCommonType` a caller. Either route
  (b) adopts it as the implementation (it takes a context the checker does not
  currently thread) or removes it; leaving two implementations of one rule with
  one caller between them is the state this report already prosecutes.
- **b7 — the witness.** `tests/type-grammar.test.ts:186–202` must be re-pointed
  at the production path or removed. A route that wires the refusal and leaves
  the cell asserting the dead seam has added a second unwitnessed emitter.

### Constraints binding on both routes

1. **Rows b1, b3, k1, i1, c2, f2, m2 stay byte-identical.** The sunk case, the
   one-element case, and bug 0081's union clause are outside this report; a fix
   that moves them has widened its own subject.
2. **Rows c1, f1, h3 keep drawing `theta/parse/array-no-common-type`.** That is
   the *Trigger*'s uncontested reading and rule 3's population.
3. **The witness covers both spellings and both loop forms.** Rows a1, a3, f1
   and h3 are the minimum set: a fix witnessed on `let xs = []` alone does not
   prove the `for` and `par for` iterand positions, which reach the check
   through a different walk arm.
4. **State the GOV-15 disposition from a re-measured census.**
   §Reproduction (f)'s 34-file, zero-`[]` count is this HEAD's; re-run it at the
   fix HEAD.
5. **Cite, do not re-derive, the *Trigger*-fidelity ruling.** If 0155 or 0158
   has landed, its ruling on whether an implementation may emit outside a
   registered *Trigger* governs route (b)'s admissibility here. If neither has,
   this report's ruling governs theirs, and it must be written so they can cite
   it.

## Fix (0.190.0)

**Route selected: (a)** — the empty array literal is NOT owed a refusal. The
four corpus sentences (plus the `docs/reference/type-system.md` mirror of
expressions.md's common-type rules) are corrected onto the registered
*Trigger*; no registry row moved, no `src/` line moved, no emission set moved
(`git hash-object src/parser/type-compat.ts` = `git rev-parse
HEAD:src/parser/type-compat.ts` = `55be9cb35845b841651d0416524e862d6e7793ef`;
`git diff --stat src/` empty). Route (b) was refused on two measured, cited
grounds, neither re-derived here:

1. **The *Trigger*-governs law, cited verbatim from bug
   [0155](./0155-ternary-common-type-unenforced-trigger-conflict.md)'s landed
   `## Fix (0.174.0)` ("THE STATED LAW"), the same clause bug
   [0158](./0158-match-arm-and-fn-return-lub-diverge-from-common-type.md)'s
   `## Fix (0.181.0)` and bug
   [0144](./0144-annotated-unresolvable-arg-structural-param-emits.md)'s
   `## Fix (0.185.0)` each cite rather than fork:**
   > A registered *Trigger* is the normative statement of a code's emission set
   > (DIAG-2). Where a rule page's scope exceeds the registered *Trigger* of the
   > code it names, the *Trigger* governs and the rule page is corrected in the
   > same commit; no implementation may be wired to emit a code outside its
   > registered *Trigger*. Narrowing an emission set ONTO its registered
   > *Trigger* needs no registry edit (the 0084/0139 posture), but where the
   > *Trigger*'s TEXT presupposes the wider reading, that text is corrected in
   > the same commit as the narrowing.

   Applied: `theta/parse/array-no-common-type`'s *Trigger*
   (`code-registry-parse.md:44` at this HEAD, `:41` in §Affected) requires an
   "Array literal whose elements have no common type and no sink to narrow
   against" — a POSITIVE verdict over elements that exist, which is exactly the
   reading 0144's record applies to `fn-arg-type-mismatch` ("An operand past the
   parser's static view reaches no such verdict, so the unresolvable-operand
   case is **outside** the registered *Trigger*"). An empty literal has no
   elements and so reaches no such verdict: it is **outside** the registered
   *Trigger*. Wiring the refusal would emit outside it, which the law forbids.
   The four rule pages exceeded the *Trigger*, so the *Trigger* governs and the
   pages are corrected in this commit. **No registry edit follows**: the law's
   second limb fires only where the *Trigger*'s text presupposes the wider
   reading, and this one already reads narrowly. §Fix route (a) suggested the
   *Trigger* text as "the natural place" to record the reading; that suggestion
   is declined on the law's own terms and the reading is recorded instead in the
   four corrected pages (each names why the code does not fire) and here. DIAG-4
   is untouched — the *Message* is byte-identical, pinned by witness cell A6.
2. **Route (b)'s named prerequisite is unmet.** Bug
   [0156](./0156-fn-parameter-sink-not-consulted-for-rule3-unions.md) is **open**
   at this HEAD. §Fix b1 makes it binding: wiring the refusal today draws an `E`
   on §Reproduction (d) rows b2 (`f([])`) and m1
   (`let xs: array<array<integer>> = [[]]`), both declared legal by the same
   sentence. Re-measured this run: b2 `[]`, m1 `[]`.

**Severity stays S3.** The §Sev/Diff upgrade condition ("if the run adjudicates
that the refusal is owed, the same evidence rescores S2") does not fire: the
refusal is adjudicated NOT owed, so rows a1–a4 are inputs the spec now declares
accepted, and the g1/g2 deferral is a correct check over a body that never runs
(CTRL-1).

- **Premeasure (before any edit, at HEAD `4782e5bf` / 0.185.0).** Every row of
  §Reproduction (a)–(d) re-derived through `parseDoc` with one deleted scratch
  probe; **zero flips** against the filing's table, so the 0081 and 0126 loop
  substrate moves left no row behind: a1/a2/a3/a4 `[]`; f1/h3/c1/m3
  `["theta/parse/array-no-common-type"]`; f2/c2/i1/b1/b3/b2/m1/k1/g1/g2/e3/j1/j2
  `[]`; m2 `["theta/parse/let-rhs-type-mismatch","theta/parse/array-element-type-mismatch"]`;
  g3 `["theta/parse/unknown-method"]`; e1/e2 `["theta/parse/non-string-array-join"]`.
  §Fix constraint 4's GOV-15 census re-measured at this HEAD: **34** committed
  `.theta`/`.thetalib`, **zero** containing `[]`, **zero** iterating a bracket
  literal — so no committed source's diagnostic sequence moves, and the witness
  re-measures it at run time (cell D1) rather than pinning the filing's count.
- **What shipped:**
  - `docs/spec_topics/control-flow.md` — the `for … in` paragraph's
    empty-literal clause: the iterand is still **not** an element-type sink, and
    that absence now *draws no diagnostic*; `for x in []` types the literal as
    `array<unknown>`, the same type `let xs = []` gets unannotated; the loop
    variable binds that unresolvable element so body checks defer under the
    *Unresolvable operands* rule the same paragraph already cites, over a body
    that never runs (CTRL-1). The annotate-or-inline advice survives,
    re-motivated: it buys the body's checks back rather than silencing a
    diagnostic.
  - `docs/spec_topics/grammar.md` — §"`array<T>` literal type-sink rule"'s
    closing line. "resist any `for`-specific carve-out" is **answered, not
    deleted** (the string survives verbatim): the iterand is not a sink and never
    becomes one, an unsunk `[]` there types as `array<unknown>` and draws no
    code exactly as an unsunk `[]` anywhere else does, so there is nothing
    `for`-specific to carve out in either direction. The reason is named — the
    registered *Trigger* covers elements that have no common type, and an empty
    literal has none — with the registry cited.
  - `docs/reference/grammar.md` — the mirror of the same clause, in that page's
    register.
  - `docs/spec_topics/expressions.md` — §"Array construction": the three-context
    sentence gains the fallback its absence left unstated — with no such context
    the literal has no elements to reduce and no sink to narrow against, so it
    types as `array<unknown>` and draws no diagnostic, its consumers deferring
    under *Unresolvable operands*. Rule 3's population sentence is byte-identical
    (pinned by cell A4).
  - `docs/reference/type-system.md` — the same fallback in the transcribed
    common-type rule block, mirror-faithful to the expressions.md edit.
    `docs/spec_topics/type-system.md` was CHECKED per §Fix route (a) and NOT
    edited: at this HEAD its only array-adjacent content is the `⊑` site list
    (`:27`) and TYPE-9 (`:52`); the array-literal common-type rules live in
    expressions.md, which `docs/reference/type-system.md` transcribes, so the
    mirror is the fallback's only type-system home.
  - `tests/for-empty-array-iterand-adjudication.test.ts` — new 26-cell witness.
    (A) six corpus-conformance cells reading the live tree, each asserting both
    directions (false claim absent, replacement observable present), plus A6
    pinning the registry *Trigger* and *Message* byte-identical — the
    no-DIAG-2-edit pin. (B) eighteen behaviour pins over `parseDoc` discharging
    §Fix constraints 1–3: the four subject rows silent, f1 and h3 (both loop
    forms) and c1 still drawing the code, i1/c2/f2/b1/b3/k1/m2 unmoved, g1/g2
    against control g3, and d2 (`array<unknown>`) as the mechanism. (C) a
    structural pin that no `src/` file references `checkArrayCommonType`. (D) the
    GOV-15 census. Every cell titled with the lane's `CELL-G2` token,
    strip-safe.
  - `tests/type-grammar.test.ts` — the V2a-T cell re-pointed, **prose only**
    (titles, in-cell comment, file header; zero assertions and zero executable
    lines changed): it no longer claims `for x in []` fires on the shipped path,
    and states that it measures an unwired V2a-era seam with zero `src/` callers
    whose `for-iterand` contract is not the shipped rule, pointing at the new
    witness. This is §Fix route (a)'s stated alternative for the disposal limb —
    see residual 1.
  - `tests/array-ternary-common-type-union.test.ts`,
    `tests/invoke-return-enum-carrier-projection.test.ts` — citation-only
    corrections for this fix's OWN +6 line insertion into
    `docs/reference/type-system.md` (four comment lines and one failure-message
    string; zero assertions). Not bug 0134's class: the drift is self-inflicted
    and in doc-page coordinates, not the adjudicated `type-grammar.ts` /
    `type-compat.ts` positional class, which was left unchased.
- **Gates:** witness RED before at 5/26 cells — A1 (`control-flow.md` "still
  carries the claim …"), A2, A3, A4, A5 — each on a corpus-conformance
  assertion naming the un-corrected sentence, none on a harness throw; GREEN
  after, 26/26. Full default suite `npx vitest run` → **378 files / 7759 tests
  passed**, re-run independently by the orchestrator after every phase.
  `npm run typecheck` clean. `npm run lint` clean.
  `tests/registry-closed-set-corpus-gate.test.ts` and
  `tests/committed-fixture-parse-gate.test.ts` green (the 0.184.0 DIAG-2
  corpus gate: this witness introduces no code-shaped fixture span, so its
  baseline is unchanged). **No live run owed and none made**: `src/` is
  byte-unchanged (`git status --short src/` and `git diff --stat src/` both
  empty), the 0193/0205 disposition for a prose+witness fix.
- **Review:** 1 round, plus one pre-review citation-only correction round (not
  a review round; round numbering unaffected). Pre-review round: this fix's +6
  insertion into `docs/reference/type-system.md` staled three citations in two
  sibling witnesses; corrected comment-only after re-measuring each range, with
  two further lines of the same self-inflicted drift folded in under a recorded
  bounded self-authorization (see residual 4). Round 1 (deep) — **CLEAN**, with
  three non-blocking `prose` residuals (R1, R2 below; R3 an off-range in one of
  this witness's own failure messages). R1 and R3 were then closed by a
  `bug-fix-fixer-light` round; that round's diff touched only corpus prose (one
  preposition) and one failure-message string, so per the charter's
  post-polish rule the polish was verified by gate-diff and the confirmation
  round skipped.
- **Verification:** **SOLID**. (1) The witness reds destructively in three
  independent directions, each restored by writing content back — never by
  `git checkout`/`restore` — and proven exact: reinstating HEAD's
  `control-flow.md` reds A1 and HEAD's `reference/grammar.md` reds A3 (both
  restored, `diff` clean); splitting `type-compat.ts`'s sink-less guard into
  route (b)'s `branches.length === 0` shape reds §B rows a1–a4 with
  `expected [ 'theta/parse/array-no-common-type' ] to deeply equal []` (restored
  byte-exact, `git hash-object` = `git rev-parse HEAD:` =
  `55be9cb35845b841651d0416524e862d6e7793ef`); adding a `checkArrayCommonType`
  reference to `src/parser/type-layer-checks.ts` reds C1 (restored byte-exact,
  `ab190526c898219d04faa19ae3b04a6e34bc090a`). So no cell is
  green-by-construction-and-unfalsifiable. (2) Full suite 378/7759 green.
  (3) Live: none owed, `src/` byte-unchanged, proof quoted above. (4) Lint and
  typecheck clean. Fidelity spot-checks all passed: the registry page and
  `docs/reference/diagnostics.md` byte-unchanged, all four sentences moved, the
  carve-out string intact, census 34/zero.
- **Residuals:**
  1. **The callerless emitter survives, by ownership, not by preference.** §Fix
     route (a) asks that `checkArrayCommonType`, `ArraySinkContext` and
     `ArrayLiteralSite` (`src/parser/type-grammar.ts:1198–1257` at this HEAD;
     `:864–923` in §Affected) be removed with their witness cell, **or** that
     the reason for keeping dead exported code with a green witness be stated in
     writing. `src/parser/type-grammar.ts` is owned by a concurrent lane for the
     duration of this run and is out of bounds, so the alternative is taken and
     this is the writing: the seam is retained UNWIRED, its test cell no longer
     claims shipped behaviour, and witness cell C1 structurally pins that no
     `src/` file references it — so a later silent wiring reds rather than
     passing. The file-header prose at `type-grammar.ts:65–69`, which restates
     the refuted rule, is in the same out-of-bounds file and also survives. A
     follow-up filing should delete all four artefacts together; nothing in this
     record depends on their removal.
  2. **`docs/spec_topics/glossary.md:67`** — the *type sink* entry closes "an
     array literal that cannot otherwise infer its element type is
     `theta/parse/array-no-common-type`", which an unsunk `[]` now measurably is
     not. §Affected lists this line as "Supporting, not claimed", and §Fix route
     (a) names four sentences; widening to a fifth would have exceeded the
     settled scope. The clause is readable as rule 3's (≥2 elements, no LUB)
     population, which is uncontested; a follow-up tightening to "elements that
     have no common type" would remove the ambiguity.
  3. **`tests/non-object-receiver-gate.test.ts:50`** cites
     `docs/reference/type-system.md:113` for the `Result` observation rule; the
     restatement is at `:155`. Measured pre-existing at HEAD (`:113` sits BELOW
     this fix's insertion point and did not shift), so it is not this fix's
     drift and was left untouched rather than widening the write surface to a
     third sibling file.
  4. **Bounded self-authorization, recorded because an invisible one is a
     violation.** The `question` tool is unavailable in this run. The question I
     would have asked: *may the pre-review citation round extend to
     `tests/array-ternary-common-type-union.test.ts:34` and `:151`, the two
     remaining lines of the same self-inflicted +6 drift, sitting inside the
     same comment blocks as the lines already corrected?* Self-authorized under
     the citation/comment-only branch. Three independent evidence sources:
     (i) `sed -n '121,123p' docs/reference/type-system.md` measuring rule 1 at
     `:121–123`; (ii) the fixer's `sed` measuring rules 2 and 3 at `:124–127`
     and `:128–131`; (iii) `git diff --numstat docs/reference/type-system.md` =
     `6 0`, a single insertion hunk above old `:115`, so the shift is uniformly
     +6. Bound: exactly two `//` comment lines in one file already inside the
     diff surface, zero assertions, zero executable lines. STOP valve declared
     and not tripped: any red, or any third file implicated, would have stopped
     the run.
  5. **Row m3 remains unowned.** §Non-goals records that no open report owns the
     fact that a written, in-scope `array<A | B>` element sink does not reach a
     nested literal (`let xs: array<array<A | B>> = [[A {…}, B {…}]]` draws the
     code). Route (a) does not confront it, so §Non-goals' "if route (a) is
     taken, row m3 needs its own filing" stands as a filing candidate,
     re-measured unchanged this run.
- **Discharge notes appended:** none. Bug 0127's fifth spelling (the synthesised
  `named "unknown"` an unsunk `[]` types as) is UNCHANGED by route (a) — rows
  e1/e2 still draw `theta/parse/non-string-array-join` — so §Non-goals' "a route
  that does not, changes nothing there" applies and 0127 is owed no note. Bugs
  0155, 0158 and 0144 are cited, not amended. Bug 0156 is unblocked-unaffected:
  route (b) was refused, so nothing here constrains its fix.
- **Pinned dispositions / non-goals:** the registry row and its mirror are
  byte-unchanged and cell A6 keeps them so; DIAG-4's *Message* is not reworded;
  no ternary, `match`, `leastUpperBound` or `computeLub` line is touched (0155 /
  0158's territory); `commonType`'s clause 2 and rule-3 gate are untouched
  (0081's); the `fn`-parameter sink is untouched (0156's); positional citation
  drift inside `src/parser/type-grammar.ts` and `src/parser/type-compat.ts` was
  left unchased per bug 0134.

## Provenance

Filed from residual 3 of the bug 0126 fix (0.107.0, commit `3d05fd46`). That
fix's report (`.pi/tmp/fixes/0126-report.md` §"Residuals / notes", item 3)
records the observation — "`control-flow.md:13`'s pre-existing empty-array
claim measures false. The byte-unchanged remainder of the line I edited says
`for x in []` with no surrounding sink is `theta/parse/array-no-common-type`,
"the same diagnostic that `let xs = []` raises in unannotated position"; both
measure `[]`. Untouched by this fix (the emission path is the common-type
machinery); adjacent to bugs 0081/0155" — and 0126's own `## Fix (0.107.0)`
residual 3 (`0126-plain-for-binds-no-loop-variable.md:1351–1357`) repeats it as
a filing candidate.

Independently re-derived at HEAD `5c9104ab` for this filing, not copied from
0126's measurements: four scratch vitest probes over `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) covering every row of §Reproduction (a)–(d),
plus the `rg` inventory in (e) and the corpus census in (f), all run and then
deleted. Every `src/`, `tests/` and corpus citation above was re-verified
against the tree at HEAD; symbols are named alongside lines because
`src/parser/type-compat.ts` (704 → 825) and `src/parser/type-layer-checks.ts`
(2531 → 2548) have both grown since the sibling reports that cite them
positionally were filed.

Two citation corrections to sibling artefacts, recorded because this report
cites the same files. Bugs 0155 and 0158 both state that
`src/parser/static-type-inference.ts` is "held at exactly 378 lines by eleven
open reports"; at this HEAD it is **413** lines, and the citations this report
makes into it (`:217–223`, `:375–393`) were read off the current file. Bug
0155's §Reproduction (f) gives `checkCommonType` at `type-compat.ts:555` and its
sole call site at `type-layer-checks.ts:1441`; at this HEAD they are `:564` and
`:1458`, inside `checkArrayLiteral` at `:1443`. Neither correction moves either
report's claim.

Sibling writers were filing concurrently against the same HEAD; their scratch
probe files and one modified `src/extension/production-theta-producer.ts` were
present in the working tree during part of this measurement session and were
neither read as evidence nor touched. This filing's own probes were removed
before it closed.
