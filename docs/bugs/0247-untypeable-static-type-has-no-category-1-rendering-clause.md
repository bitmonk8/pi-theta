# Bug 0247 — no clause of category 1 admits a rendering for a static type the parse layer cannot determine, so two engine fabrications reach user-visible *Message* strings unadmitted: the withheld-binder sentinel renders `array<<withheld>>` into four `E` rows and `#typeExpr`'s index / object fabrications render `got index` and `got object` into a fifth, and the resolution is a spec clause, not a render change

- **Status:** fixed (0.227.0)
- **Sev/Diff estimate:** S4/D2 — no verdict, code, severity or range is wrong at
  any measured row; the defect is that the corpus states no rule for the bytes
  the renderer already emits, so `placeholder-rendering-a.md:5`'s
  byte-identical-strings claim is untestable at these positions. D2 because the
  work is prose adjudication in one subsection plus restating the cells that
  pin the current strings; no `src/**` change is required if the clause records
  what ships.
- **Kind:** one defect — a missing normative clause — against
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:19` (category 1's
  *Rule*) read with `:21–27` (its clause list) and `:25` (the `named` clause,
  whose identifier shape `docs/spec_topics/lexical.md:13` fixes as
  `[A-Za-z_][A-Za-z0-9_]*`). Category 1 governs `<type>`, `<expected>`,
  `<actual>`, `<left>`, `<right>` and `<element>` (`:17`) and binds them to one
  rule: "Render the Theta static type by re-serialising it in the source-grammar
  form defined in [Type System]" (`:19`). Every clause under it presupposes a
  determined static type. The parse layer has two producers that determine none
  and render anyway, and no clause covers either.
- **Related:**
  - [0143](./0143-withheld-sentinel-author-twin-and-render-leakage.md) —
    **fixed (0.212.0)**, the origin. Its §Fix (0.212.0) closed face 1's root
    (provenance on the `named` arm) and **declined face 2 on the record**: "no
    clause of category 1's *Rule* … admits any rendering for a binder whose type
    this layer cannot determine … minting one is a spec-versioned breaking
    change under GOV-7 / GOV-8 … suppressing the four surviving emissions would
    drop verdicts that ARE decidable". Its residual 1 states the owner in terms:
    "**Its owner is a spec-level change** — a category-1 clause admitting a
    rendering for an untypeable static type … — not a further implementation
    fix." This report is that filing. Cells `f2a`–`f2f`
    (`tests/withheld-sentinel-mooting-and-render-pins.test.ts`) pin the current
    strings and are the flip surface.
  - [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md) —
    **fixed (0.202.0)**. Its §Fix closed its face 2 (the `TypeEnv` collision) at
    the `resolveNamed` read seam and **declined its face 1 — the same render
    question for a different producer — routing it to 0143**: "Face 1 stays
    open, by decision: `a1`, `a2`, `b1` render `got index` and `f1` renders
    `got object`. Routed to 0143, which owns the `displayType` arm's
    disposition". 0143 then declined it too. This filing inherits **both**
    sentinels' render question and enumerates both surfaces below. 0135's
    residual 2 is the companion obligation: its conformance oracle is scoped to
    group (c) and cannot range over the face-1 rows until a clause exists.
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md),
    [0126](./0126-plain-for-binds-no-loop-variable.md),
    [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) — each carries
    a distinct non-conformant `named` into the same render arm. 0126 (0.107.0)
    already moved the plain-`for` variable off the withheld sentinel, which is
    why the carriers below are an unannotated `fn` parameter and a `match`-arm
    binder rather than 0143's original `for x in [3]` fixtures. A clause written
    only for the two producers measured here leaves those reports' names
    unadmitted; §Fix states the scope test.
- **Affected** (every citation verified at HEAD `b9cf2f26`, 0.219.0):
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md:19` — category 1's
    *Rule*; `:21–27` — its seven clauses (primitives `:21`, literals `:22`,
    unions `:23`, `array<T>` `:24`, named schemas / enums / aliases `:25`,
    `Result<T, E>` `:26`, inline object types `:27`); `:17` — the six
    placeholders it governs; `:5` — the purpose ("so two conformant
    implementations produce byte-identical strings … for the same source
    defect") and the sentence placing category 3's and category 7's closed
    tables under the GOV-7 / GOV-8 posture, which does **not** name category 1's
    clause list; `:7` — the closure paragraph, which places three operations
    under GOV-7 / GOV-8 ("Introducing a new placeholder, retiring one, or moving
    a placeholder between categories"), records that "No gate in the tree
    enumerates the *Message* column against clauses (a)–(g) at build time", and
    states that neither placeholder-rendering page carries a `**DIAG-N.**`
    paragraph; `:9` — the *Winner rule* (a shipped registry row governs the fact
    and the closure paragraph is brought to describe it); `:11` — *Literal
    source-grammar spellings*, which excludes `array<T>` and two other spellings
    from the closure as non-interpolating text.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:132` — *Edge
    cases*. Seven bullets, none about an undetermined static type.
  - `docs/spec_topics/lexical.md:13` — the identifier grammar
    `[A-Za-z_][A-Za-z0-9_]*`; `:15` — the PascalCase rule for type-like
    bindings. `<withheld>` fails `:13`; `index`, `object`, `query` and `unknown`
    satisfy `:13` and fail `:15`.
  - `WITHHELD_BINDER_TYPE_NAME` and `withheldBinderType()`
    (`src/parser/type-compat.ts`) — the sentinel string and its only admitted
    mint; `displayType`'s `case "named"` (same file), which returns `type.name`
    with no conformance test, and its `array` arm, which wraps recursively and
    produces `array<<withheld>>`. `rg -n 'displayType\(' src/` returns 30 hits
    across eight files at HEAD (`src/parser/type-compat.ts` 15 including the
    definition, `src/parser/type-layer-checks.ts` 5,
    `src/extension/invoke-static-checks.ts` 3, `src/parser/invoke-diagnostics.ts`
    3, and one each in `src/parser/control-flow.ts`,
    `src/parser/static-type-inference.ts`, `src/runtime/stdlib-array.ts`,
    `src/runtime/stdlib-object.ts`).
  - `recordWithheldBinders` (`src/parser/type-layer-checks.ts`) and
    `#matchArmScope` (`src/parser/static-type-inference.ts`) — the two mint
    sites of the withheld sentinel; `containsWithheldBinderType`
    (`src/parser/type-layer-checks.ts`) — the gate that suppresses the sinks
    whose verdict *depends* on the withheld element type, which is why the
    surviving renders are exactly the rows whose verdict an outer kind decides.
  - `#typeExpr`'s index else arm, query arm, object arm and its two `unknown`
    arms (`src/parser/static-type-inference.ts`) — the second producer:
    `{ kind: "named", name: "index" }`, `node.schema ?? "query"`,
    `node.typeName ?? "object"`, and `{ kind: "named", name: "unknown" }`.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:37`
    (`non-boolean-condition`), `:39` (`mixed-plus-operands`), `:40`
    (`non-orderable-operands`), `:70` (`unknown-method`), `:71`
    (`non-array-iterand`). All five carry `E`. `:46`
    (`non-string-array-join`) is the deferral control.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 — the registry
    is closed and a *Trigger* change is a spec change), `:74` (DIAG-4 — the
    *Message* column is normative, and renderers "MUST emit it
    character-for-character with placeholders interpolated").
  - `docs/spec_topics/governance/req-id-prefix-table-active-b.md:35` (GOV-7,
    mutation procedures), `:49` (GOV-8, REQ-ID lifecycle), `:58` (GOV-8's *Pure
    rewording* boundary and its substantive test: "alters which inputs are
    accepted, which outputs are produced, which diagnostics fire, or which
    invariants hold").
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15, whose
    observable (c) equivalence is byte-identity "after normalising the
    placeholder sub-fields whose rendered value is permitted to vary per
    invocation or per run … as classified by the placeholder-rendering
    categories", with "the fixed (non-variable) placeholder renderings and the
    surrounding literal template bytes … themselves byte-identical". A category-1
    fill is a fixed rendering, so its bytes are inside GOV-15's promise.
  - `docs/spec_topics/type-system.md:48` — *Unresolvable operands*, the deferral
    disposition the gates take where the verdict depends on the undetermined
    type. It governs the sinks that emit nothing; it says nothing about what a
    sink that *does* emit renders.
  - **Existing coverage — the flip surface.**
    `tests/withheld-sentinel-mooting-and-render-pins.test.ts` cells `f2a`–`f2d`
    pin the four surviving withheld renderings byte-exact and `f2e`/`f2f` pin
    the two deferrals beside them; the file's group-F2 header states the
    decline and its three grounds.
    `tests/withheld-sentinel-author-twin-provenance.test.ts` cells `w2a` and
    `w2c` re-pin the same strings from the `fn`-parameter and `#matchArmScope`
    carriers. `tests/fn-arg-type-mismatch-wired.test.ts` cell `u13r` pins
    `array<<withheld>>` byte-exact. `tests/index-sentinel-typeenv-case-fence.test.ts`
    cells `a1`, `a2`, `b1` and `f1` pin `got index` / `got object` as 0135's
    declined face, and that file carries the tree's only category-1 conformance
    oracle — scoped to 0135's group (c), where after its fence no category-1
    fill remains. **No gate scores a rendered type name against category 1's
    clause list on any row that still renders a fabrication.**
- **Observed at:** `0.219.0` (HEAD `b9cf2f26`). Offline, deterministic; no live
  model, no provider. Scratch vitest over `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) driving the shipped `parseThetaDocument`,
  frontmatter `---\nmode: prompt\n---`; written, run, deleted.

## Summary

Category 1 of `placeholder-rendering-a.md` fixes one rule for the six
static-type placeholders: re-serialise the Theta static type in source-grammar
form (`:19`), through seven clauses (`:21–27`) covering primitives, literals,
unions, `array<T>`, named schemas / enums / aliases, `Result<T, E>` and inline
object types. Every clause presupposes that a static type exists to
re-serialise.

The parse layer emits diagnostics on operands whose static type it did not
determine. Two producers supply a placeholder value at those positions:

1. **The withheld-binder sentinel.** `withheldBinderType()`
   (`src/parser/type-compat.ts`) mints `{ kind: "named", name: "<withheld>",
   withheld: true }` for a binder the layer cannot type;
   `displayType`'s `named` arm returns the name verbatim and its `array` arm
   wraps it. Measured at HEAD: four `E` rows render `array<<withheld>>`.
2. **`#typeExpr`'s fabricated names** (`src/parser/static-type-inference.ts`):
   `index`, `object`, `query`, `unknown`. Measured at HEAD: `got index` from
   three fixtures and `got object` from a fourth, all at
   `theta/parse/non-array-iterand`.

Neither token is admissible under any clause of category 1. `<withheld>` is not
an identifier (`lexical.md:13`) and names no declaration. `index` and `object`
are identifiers but fail the type-position casing rule (`:15`) and likewise name
no schema, enum or alias.

**The verdicts are correct and the renderings are unstated.** Each surviving
emission is decidable from the composite's outer kind without knowing the
undetermined part — an `array` receiver is not a boolean, is not orderable,
carries no method `frobnicate`; a non-`array` iterand is refused. Where the
verdict *does* depend on the undetermined type, `containsWithheldBinderType`
defers per `type-system.md:48` and nothing renders (measured: the `join` element
and the bare `for` iterand). So suppression is not available — it would remove
decidable verdicts, a DIAG-2 *Trigger* removal (`diagnostic-shape.md:72`) — and
neither is silence, because the byte-identical-strings purpose
(`placeholder-rendering-a.md:5`) is unmet for every input that reaches these
rows.

**The resolution is a clause, not code.** Two bug fixes have now declined this
face on the record — 0135 routed it to 0143, 0143 declined it and named a
spec-level change as its owner — and both declines rest on the reading that
minting a rendering is a GOV-7 / GOV-8 breaking change. That reading overshoots
what the corpus says: `placeholder-rendering-a.md:7` places three operations
under GOV-7 / GOV-8 — introducing a placeholder, retiring one, moving one
between categories — and a clause describing how an existing category-1
placeholder is filled is none of them. Under GOV-8's own substantive test
(`req-id-prefix-table-active-b.md:58`) a clause that records the bytes the
renderer already emits alters no accepted input, no produced output, no fired
diagnostic and no invariant.

## Reproduction

Offline, deterministic, at `b9cf2f26`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`,
frontmatter `---\nmode: prompt\n---`, a trailing value supplying the final
expression. Each cell is the whole diagnostic list in emission order,
unfiltered. `[]` means zero diagnostics.

### (a) The withheld sentinel, unannotated `fn`-parameter carrier

Carrier: `fn f(p) {` … `}` + `let z = f(1)` + `1`.

| # | body | diagnostics |
|---|---|---|
| a1 | `if [p] { let r = 1 }` + `1` | `theta/parse/non-boolean-condition`: `condition must be boolean; got array<<withheld>>` |
| a2 | `let r = [p] + 1` + `r` | `theta/parse/mixed-plus-operands`: `'+' has mixed operand types: array<<withheld>> and integer` |
| a3 | `let r = [p] < 1` + `r` | `theta/parse/non-orderable-operands`: `'<' requires two numeric or two string operands; got array<<withheld>> and integer` |
| a4 | `let r = [p].frobnicate()` + `r` | `theta/parse/unknown-method`: `unknown method 'frobnicate' on type array<<withheld>>` |
| a5 | `let r = [p].join(",")` + `r` | `[]` — deferral control |
| a6 | `for y in p { y }` + `1` | `[]` — deferral control |

a5 and a6 are the other side of the same seam: the `join` element's verdict and
the bare iterand's verdict both depend on the undetermined type, so
`containsWithheldBinderType` suppresses them and `type-system.md:48`'s deferral
holds. a1–a4's verdicts do not depend on it.

### (b) The withheld sentinel, `match`-arm carrier

| # | source | diagnostics |
|---|---|---|
| b1 | `fn g(q: integer) { match q { n => { if [n] { let r = 1 } 1 } } }` + `let z = g(1)` + `1` | `theta/parse/non-boolean-condition`: `condition must be boolean; got array<<withheld>>` |

The second mint site (`#matchArmScope`, `src/parser/static-type-inference.ts`)
reaches the same rendering, so the surface is not one carrier's.

### (c) The index-sentinel family, inherited from 0135's declined face 1

| # | source | diagnostics |
|---|---|---|
| c1 | `fn f(p: Nope) { for y in p[0] { y } }` + `let z = f(1)` + `1` | `theta/parse/non-array-iterand`: `'for' expects array<T> after 'in'; got index` |
| c2 | `schema P { xs: array<string> }` + `fn f(p: P) { for y in p["xs"] { y } }` + `1` | same code, same message |
| c3 | `fn index(): integer { 1 }` + `for y in index() { y }` + `1` | same code, same message |
| c4 | `let v = { a: 1 }` + `for y in v { y }` + `1` | `theta/parse/bare-object-literal`; then `theta/parse/non-array-iterand`: `'for' expects array<T> after 'in'; got object` |

c3's rendered token is the author's own function name and c1/c2's is the
engine's fabrication; the two are byte-identical in the message, which is 0135's
observation and is unchanged by its fence. `query` and `unknown` are the two
remaining names of the family (`#typeExpr`'s query arm and its two `unknown`
arms) and are not measured here.

## Expected behaviour

**Every byte a category-1 placeholder can carry is fixed by a clause.**
`placeholder-rendering-a.md:5` states the purpose: the categories exist "so two
conformant implementations produce byte-identical strings … for the same source
defect". `:19` binds the six static-type placeholders to one rule and `:21–27`
enumerate its cases. For an operand whose static type the layer did not
determine, a second implementation reading the corpus has nothing to reproduce:
it could emit `<withheld>`, `index`, `unknown`, `?`, or the empty string, and no
sentence in the corpus distinguishes them. The conformance claim is not violated
at these rows — it is unstated.

**Silence is not the deferral disposition.** `type-system.md:48` skips a
*compatibility check* when either side is past the parser's static view. It does
not reach `for`'s `array<T>` precondition or `join`'s element precondition,
which it says in terms take their own dispositions, and it says nothing about
the rendering of a diagnostic that is emitted. Rows a1–a4, b1 and c1–c4 emit
under registered *Triggers* (`code-registry-parse.md:37`, `:39`, `:40`, `:70`,
`:71`) that are satisfied on their inputs. The gap is in the rendering rule.

**The corpus does not place this clause under GOV-7 / GOV-8.** `:7` names three
governed operations — introducing a placeholder, retiring one, moving one
between categories. A clause fixing how the existing `<type>` / `<left>` /
`<element>` placeholders are filled coins no placeholder and moves none. `:5`
extends the GOV-7 / GOV-8 posture explicitly to category 3's closed token-name
table and category 7's closed value tables; it does not extend it to category
1's clause list. `:7` also records that neither placeholder-rendering page
carries a `**DIAG-N.**` paragraph, so GOV-8's REQ-ID lifecycle machinery has no
ID to retire here. And under GOV-8's substantive test
(`req-id-prefix-table-active-b.md:58`), a clause recording the shipped bytes
alters no accepted input, no produced output, no fired diagnostic and no
invariant.

**The *Winner rule* points the same way.** `:9` says that where the closure
paragraph and a shipped registry row disagree, "the registry row governs the
fact and the closure paragraph is the defect", because DIAG-4 forecloses moving
a shipped template within theta 1.x. The five rows here have shipped these
renderings since 0.77.0 (the sentinel) and earlier (the fabrications). The
corpus's own posture for a shipped rendering it does not describe is to describe
it.

**DIAG-4 and GOV-15 both bind the result.** DIAG-4 (`diagnostic-shape.md:74`)
makes the *Message* column normative and is untouched by a clause that
interpolates the same bytes. GOV-15 (`source-language-stability.md:5`) makes a
fixed category-1 fill part of observable (c)'s byte-identity, normalising only
the per-invocation and wall-clock sub-fields — so the shipped spelling is
already inside the equivalence promise, and a clause that changes the spelling
rather than recording it would move an in-scope observable.

## Actual behaviour / root cause

**One unconditional arm, two producers, no rule above either.**
`displayType`'s `case "named"` (`src/parser/type-compat.ts`) returns
`type.name`. It takes no `TypeEnv`, so it cannot test resolvability, and it
applies no shape test, so it cannot test conformance. Its `array` arm wraps the
result, which is how a fabrication reaches the wire inside `array<…>`.

The first producer is the withheld-binder mint. `recordWithheldBinders`
(`src/parser/type-layer-checks.ts`) and `#matchArmScope`
(`src/parser/static-type-inference.ts`) both mint through
`withheldBinderType()`, which carries the provenance marker bug 0143's fix
added. The marker is what `containsWithheldBinderType` now tests, and the gates
it guards are exactly the sinks whose verdict depends on the undetermined type —
measured as a5 and a6. The rows that survive are the ones an outer kind decides,
and they render the sentinel because the sentinel is the only value the type
carries.

The second producer is `#typeExpr`'s fabrication family. Its index else arm
returns `{ kind: "named", name: "index" }` when the receiver is not an `array`,
its query arm `node.schema ?? "query"`, its object arm
`node.typeName ?? "object"`, and two further arms `{ kind: "named", name:
"unknown" }`. Bug 0135's fix fenced `resolveNamed` so that no lowercase-initial
name resolves through the `TypeEnv`, which closed the collision face; the
rendering face was left as filed and routed onward.

**Both routes were adjudicated to a spec change and neither was filed until
now.** 0135's §Fix residual 1 routes its face 1 to 0143. 0143's §Fix (a)
declines that face together with its own, and its residual 1 names the owner:
"a category-1 clause admitting a rendering for an untypeable static type". The
declines are recorded in the pins themselves — the group-F2 header of
`tests/withheld-sentinel-mooting-and-render-pins.test.ts` states the three
grounds and instructs that a future render fix red the cells on purpose.

**Nothing scores these rows.** The tree's only category-1 conformance oracle
lives in `tests/index-sentinel-typeenv-case-fence.test.ts` and ranges over
0135's group (c), where the fence leaves no category-1 fill — that file's own
residual records the half-supply. `:7` records that no build-time gate
enumerates the *Message* column against the closure clauses either. So a sixth
fabricated name added tomorrow reaches a user-visible string with no failure
signal.

## Why it matters

- **A normative rendering rule has a hole its own purpose statement depends
  on.** `:5` promises byte-identical strings between conformant
  implementations. For every input reaching a1–a4, b1 or c1–c4 the promise
  quantifies over a value the corpus never fixes.
- **Two fix records have now declined the same face on a governance reading the
  corpus does not support.** Both cite GOV-7 / GOV-8 over a clause list that
  `:5` does not place there and an operation `:7` does not enumerate. Left
  standing, the reading blocks any future render adjudication on the same
  ground.
- **The engine's private vocabulary is user-visible.** An author who wrote no
  `<withheld>` sees ten characters that are neither their code nor any type
  `docs/spec_topics/grammar.md`'s `Type` production spells. An author whose
  receiver is an object sees `got object`, a token that is also the parser's
  fallback for an unnamed literal.
- **The surface grows silently.** `#typeExpr` already has five fabrication arms
  and the sentinel has two mint sites. No gate scores a rendered type name
  against category 1 on any row that still renders one, so a sixth name is
  admitted by silence.
- **The pins are load-bearing and currently record a decision rather than a
  rule.** `f2a`–`f2d`, `w2a`, `w2c`, `u13r`, and 0135's `a1`/`a2`/`b1`/`f1` all
  assert non-conformant strings deliberately. Until a clause exists, those cells
  are the corpus for this behaviour.

## Non-goals

- **Changing the rendered spelling.** A clause that records the shipped bytes
  leaves GOV-15 observable (c) untouched; one that fixes a different spelling
  moves an in-scope observable and needs its own carve-out argument. §Fix takes
  the recording route.
- **Suppressing the emissions.** a1–a4, b1 and c1–c4 are decidable verdicts
  under registered *Triggers*; removing them is a DIAG-2 *Trigger* edit
  (`diagnostic-shape.md:72`) and reintroduces the defect class 0143's own row b6
  complained of.
- **The withhold gate's coverage.** Which sinks defer is
  `containsWithheldBinderType`'s question, settled by 0143's fix and pinned by
  a5 / a6. This report claims only what an emitting row renders.
- **`#typeExpr`'s fabrication family as a naming question.** Whether the parser
  should fabricate `index`, `object`, `query` and `unknown` at all is
  [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md)'s and
  [0136](./0136-member-access-types-as-field-name-not-field-type.md)'s subject.
  This report claims the rendering rule above whatever names survive.
- **The other reports at the same render arm.**
  [0124](./0124-parsetype-trailing-punctuation-leniency.md),
  [0126](./0126-plain-for-binds-no-loop-variable.md) and
  [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) each carry a
  further non-conformant `named` there. §Fix states the scope test a clause must
  answer for them; it does not adjudicate their subjects.

## Fix

**Add a clause to category 1 of `placeholder-rendering-a.md` admitting a
rendering for a static type the parse layer did not determine, and fix it to the
bytes the renderer already emits.** The clause lands in the *Rule*'s list
(`:21–27`), beside the `named` clause at `:25`, and states:

- **The condition.** The clause applies where the diagnostic's verdict is
  decidable but the operand's static type is not determined — the case the
  seven existing clauses do not reach. Where the verdict itself depends on the
  undetermined type, `type-system.md:48` and the sinks' own preconditions
  already withhold the diagnostic; the clause says so explicitly so the two
  dispositions are not read as competing.
- **The rendered token, byte-exact, as a closed table.** `<withheld>` for a
  binder the layer cannot type; `index`, `object`, `query` and `unknown` for
  `#typeExpr`'s fabrications. The table carries the same GOV-7 / GOV-8 posture
  `:5` already gives category 3's token-name table and category 7's value
  tables, so a sixth fabricated name is not admitted by silence.
- **The composition.** A token from that table appearing inside a composite
  renders through the existing clauses — `array<<withheld>>` via `:24`,
  `Result<…>` via `:26` — so no second rule governs the surround.
- **The GOV-8 disposition, stated in the commit.** No placeholder is coined,
  retired or recategorised, so `:7`'s three governed operations are not engaged;
  no `**DIAG-N.**` paragraph exists on the page, so no REQ-ID retires; the
  rendered bytes, codes, severities and ranges are unchanged, so GOV-8's
  substantive test (`req-id-prefix-table-active-b.md:58`) is not met and DIAG-4
  (`diagnostic-shape.md:74`) is untouched. This is the *Winner rule* (`:9`)
  applied to a shipped rendering: the implementation governs the fact and the
  subsection is brought to describe it.

**No `src/**` change is required.** `displayType` is byte-untouched. The work is
the clause plus the pins that currently record its absence.

**The cells to restate, each deliberately:**

- `tests/withheld-sentinel-mooting-and-render-pins.test.ts` — `f2a`–`f2d`
  become assertions of a clause-admitted rendering rather than of a declined
  face; their group-F2 header, which states the decline and its three grounds,
  is rewritten to cite the clause. `f2e` and `f2f` stay as they are: they pin the
  deferral the clause's condition names.
- `tests/withheld-sentinel-author-twin-provenance.test.ts` — `w2a` and `w2c`
  keep their strings; their labels stop calling the rendering declined.
- `tests/fn-arg-type-mismatch-wired.test.ts` — `u13r` keeps its byte-exact
  string; its comment stops routing the disposition to an open report.
- `tests/index-sentinel-typeenv-case-fence.test.ts` — `a1`, `a2`, `b1` and `f1`
  keep their strings and stop naming 0143 as the open owner. Its conformance
  oracle is extended to score the face-1 rows against the enlarged clause list,
  which discharges that file's residual 2 (the oracle is currently scoped to
  group (c), where no category-1 fill survives) and supplies the anti-vacuity
  guard the report asked for.
- `tests/plain-for-loop-variable-element-type.test.ts` — its `b4` row pins the
  `for`-fed composite as `array<integer>`, a conformant rendering under `:24`
  and `:21`. No expectation moves; its comment, which cites the sentinel
  spelling as the contrast, is checked for label drift.

**Scope test the clause must answer.** Three open reports carry further
non-conformant `named` values into the same arm:
[0124](./0124-parsetype-trailing-punctuation-leniency.md) (a captured
non-`Type` source slice), [0126](./0126-plain-for-binds-no-loop-variable.md)
(a loop variable's own identifier) and
[0130](./0130-let-rhs-type-mismatch-declines-object-union.md) (an inline object
annotation rendered as a pseudo-`named`). The clause covers engine-fabricated
names for undetermined types; it must state whether it covers those three, and
if not, say that they are refusals of a different kind so the class is not left
half-closed by omission.

**Ordering.** Nothing blocks this filing and it blocks nothing. It touches no
`src/**` file, so it does not rebase against a code fix at the render arm; a
fix at 0124, 0126 or 0130 that removes a carrier changes which rows the clause
is exercised on, not the clause. If any of those lands first, the reproduction
groups above are re-measured, not inherited.

**Witness — offline, provider-free.** Every row settles inside one `parseDoc`
call. The cells listed above already exist and are re-pointed. The new
obligation is the extended conformance oracle in
`tests/index-sentinel-typeenv-case-fence.test.ts`, which must score every
category-1 placeholder fill on the emitting rows against the clause list read
from `placeholder-rendering-a.md`, so a fabricated name added later reds without
anyone remembering to add a row. No live tier applies: nothing on this path
crosses a provider and every observable is determined inside one parse.

## Provenance

- **Origin:** the bug 0143 fix record (0.212.0), §Fix (a) and residual 1, which
  declines the render face and names "a category-1 clause admitting a rendering
  for an untypeable static type" as its owner; and the bug 0135 fix record
  (0.202.0), §Fix (a) and residual 1, which declines the same question for the
  index-sentinel family and routes it to 0143. This report is the filing both
  records call for, and it carries both surfaces because 0135's route landed on
  a report that then declined.
- **What this report adds beyond those records:** the two surfaces enumerated
  and re-measured together at 0.219.0; the `match`-arm carrier measured beside
  the `fn`-parameter carrier, so the surface is not one mint site's; and the
  governance reading corrected — `placeholder-rendering-a.md:7` places three
  operations under GOV-7 / GOV-8 and a category-1 fill clause is none of them,
  `:5` extends that posture to categories 3 and 7 and not to category 1's clause
  list, `:7` records that neither page carries a `**DIAG-N.**` paragraph, and
  GOV-8's substantive test (`req-id-prefix-table-active-b.md:58`) is unmet by a
  clause that records shipped bytes. Both prior declines rest on the reading
  this corrects.
- **Evidence:** scratch vitest over `parseDoc` (`tests/helpers/e2e-s1.ts:39`)
  driving the shipped `parseThetaDocument`, at `b9cf2f26`; every cell of groups
  (a), (b) and (c) measured and quoted verbatim above; written, run, deleted.
  Groups (a) and (b) also reproduce as the committed cells `f2a`–`f2f`, `w2a`
  and `w2c`; group (c) as `a1`, `a2`, `b1` and `f1` of
  `tests/index-sentinel-typeenv-case-fence.test.ts`.
- **Implementation, at `b9cf2f26`:** `src/parser/type-compat.ts`
  (`displayType`'s `named` and `array` arms, `WITHHELD_BINDER_TYPE_NAME`,
  `withheldBinderType`, `resolveNamed`); `src/parser/type-layer-checks.ts`
  (`recordWithheldBinders`, `containsWithheldBinderType`);
  `src/parser/static-type-inference.ts` (`#typeExpr`'s index, query, object and
  `unknown` arms; `#matchArmScope`).
- **Spec measured against:**
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:5`, `:7`, `:9`,
  `:11`, `:17`, `:19`, `:21–27` (`:24` the `array<T>` clause, `:25` the `named`
  clause, `:26` the `Result<T, E>` clause);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:132` (*Edge cases*);
  `docs/spec_topics/lexical.md:13`, `:15`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:37`, `:39`, `:40`,
  `:46`, `:70`, `:71`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4);
  `docs/spec_topics/governance/req-id-prefix-table-active-b.md:35` (GOV-7),
  `:49` (GOV-8), `:58` (GOV-8 *Pure rewording*);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15);
  `docs/spec_topics/type-system.md:48` (*Unresolvable operands*).
- **Tests:** `tests/withheld-sentinel-mooting-and-render-pins.test.ts`
  (`f2a`–`f2f`); `tests/withheld-sentinel-author-twin-provenance.test.ts`
  (`w2a`, `w2c`); `tests/fn-arg-type-mismatch-wired.test.ts` (`u13r`);
  `tests/index-sentinel-typeenv-case-fence.test.ts` (`a1`, `a2`, `b1`, `f1`,
  and the group-(c)-scoped conformance oracle);
  `tests/plain-for-loop-variable-element-type.test.ts` (`b4`);
  `tests/helpers/e2e-s1.ts:39` (`parseDoc`). No test scores a rendered type name
  against category 1 on a row that still renders a fabrication.

## Fix (0.227.0)

- **What shipped:**
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md` — an eighth clause
    under category 1's *Rule*, admitting a rendering where a registered
    *Trigger* has already decided to emit and the operand's static type is one
    the parse layer did not determine, and stating that where the verdict itself
    depends on the undetermined type nothing renders (`type-system.md`'s
    *Unresolvable operands* plus the `for` iterand's and `join` element's own
    preconditions), so the two dispositions are not read as competing; the
    closed `**Undetermined-static-type tokens (closed).**` table (`<withheld>`,
    `index`, `object`, `query`, `unknown`), keyed on the rendered bytes rather
    than on provenance and carrying the same GOV-7 / GOV-8 posture the
    subsection's opening paragraph already gives category 3's token-name table
    and category 7's value tables; a composition paragraph (`array<<withheld>>`
    via the `array<T>` clause, `array<Result<unknown, QueryError>>` via the
    `array<T>` and `Result<T, E>` clauses); a boundary paragraph answering
    §Fix's scope test; and two test vectors. 17 lines, no existing line deleted.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — one *Edge cases*
    bullet, first in the list: a conformance test over a row that renders an
    undetermined static type asserts the byte-exact token from the closed table,
    whose extension is itself GOV-7 / GOV-8-governed.
  - `tests/helpers/category1-clause-oracle.ts` (new, 283 lines) — the shared
    category-1 conformance oracle. `readAdmittedStandInTokens()` PARSES the
    closed table out of the spec page, so a sixth engine-fabricated name reds
    without anyone remembering to add a test row; `nonConformantTypeNames` is
    0135's scorer moved unchanged plus one `admitted` parameter;
    `fillsOf(registry, code, message)` keeps the DIAG-4
    read-from-the-registry discipline. No module-scope mutable state, no
    globals.
  - `tests/index-sentinel-typeenv-case-fence.test.ts` — the private oracle
    helpers replaced by imports (the group-(c) cell passes `EMPTY_ADMITTED`, so
    its fence is scored against the seven original clauses alone and its
    `toEqual([])` / `toBe(0)` are byte-unmoved); a new cell scoring the face-1
    rows `a1`, `a2`, `b1`, `f1` against the enlarged clause list, anti-vacuity
    count 4.
  - `tests/withheld-sentinel-mooting-and-render-pins.test.ts` — a new cell
    scoring the `f2a`–`f2d` carriers' fills against the same spec-read list,
    anti-vacuity count 6.
  - `src/**` is BYTE-UNTOUCHED. `git diff --stat -- src/` is empty. The clause
    records the bytes the renderer already emits; `displayType` does not move.
- **Placement deviation, deliberate.** §Fix says the clause "lands in the
  *Rule*'s list (`:21–27`), beside the `named` clause at `:25`". It landed at
  the END of that list instead. Lines `:21`, `:24`, `:25`, `:26` and `:27` carry
  33+ line-form citations across `tests/**`, `src/**` and `docs/**`; an
  end-of-list insertion leaves every one of them exact, where an insertion after
  `:25` would falsify `:26` and `:27` (10 citations to `:27` alone). The clause
  is in the *Rule*'s list, which is what §Fix requires of it.
- **Governance, verified not assumed.** The clause coins no placeholder, retires
  none and moves none between categories, so `placeholder-rendering-a.md`'s
  *Closure* paragraph engages none of its three GOV-7 / GOV-8-governed
  operations; that paragraph already states the disposition in terms
  ("codifying, in this closure, a placeholder the registry has already rendered
  since a shipped release is a pure rewording under GOV-8's *Pure rewording*
  boundary"). GOV-8's substantive test (`req-id-prefix-table-active-b.md:58`) is
  unmet: no input newly accepted, no output newly produced, no diagnostic newly
  fired, no invariant newly held — `src/**` and the registry are both untouched
  and every message pin is byte-unmoved. Neither placeholder-rendering page
  carries a `**DIAG-N.**` paragraph, so no REQ-ID retires; none was coined.
  GOV-15 observable (c) is unmoved because the fixed renderings' bytes are
  unmoved. DIAG-2 and DIAG-4 are untouched. Two nested workers verified this
  independently and both agreed with the report's analysis; no versioned change
  shipped.
- **Gates:** witness RED before / GREEN after on two independent
  neutralisations of the FIX (the whole closed-table block deleted → both new
  cells red naming the missing anchor; the single `index` body row deleted → the
  face-1 cell reds naming the three unadmitted `<type>=index` fills), each
  restored byte-exact with `git hash-object` equal before and after
  (`e7136b35…`); anti-vacuity proved separately (a carrier swap moved `scored`
  from 4 to 5 and red the count while `offenders` stayed `[]`), restored
  byte-exact (`2d5a162f…`); full default suite 408 files / 8583 tests passed;
  `npm run typecheck` clean; `npm run lint` clean;
  `tests/citation-symbol-form-gate.test.ts` 3/3 green (the lock, unweakened).
- **No live run is owed, and the claim is discharged with evidence.**
  `git diff --stat -- src/` is empty, so no executable path and therefore no
  live-exercised surface moved — the 0193 / 0205 precedent for a spec-only fix.
  The one `tests/live/**` file in the diff
  (`tests/live/generic-argument-bracket-group-truncation-live-cell.test.ts`)
  changes one doc-comment citation (`placeholder-rendering-a.md:89` → `:106`)
  and no executable line, so it owes none either.
- **Review:** 2 rounds, preceded by two pre-review correction rounds (prose and
  comment text only, gates re-run green after each: spec-page register — the
  dated "measured at this HEAD" framing removed from a normative page — a false
  claim that three CLOSED reports "own" the boundary class, and two stale test
  comments). Round 1 (deep): three findings — `fidelity`, the declined-face
  framing surviving in a second GROUP F2 banner and in the four `f2a`–`f2d`
  assertion-message tails; `spec`, the closed table's `unknown` row describing
  only the `par for` producer where four mint sites render it; `fidelity`, the
  face-1 banner and SCOPE comment in
  `tests/index-sentinel-typeenv-case-fence.test.ts` still naming 0143 as the
  open owner. Round 2 (fixer, then fast review): all three discharged — the
  fixer also corrected round 1's own mis-attribution, the absent-tail `unknown`
  being `#typeExpr`'s `block` arm and not its `par-for` arm — verdict CLEAN, no
  escalation.
- **Verification:** SOLID on all four obligations, each with quoted evidence —
  both witness directions plus anti-vacuity on two independent neutralisations
  with hash-proven restoration, the full suite (three unrelated hook-timeout
  flakes re-run green in isolation, 127/127), the no-live-run discharge with the
  `src/**` evidence and the live file's comment-only hunk quoted, and lint /
  typecheck / the citation lock.
- **The cells restated, every one enumerated for ratification. Subjects
  preserved, zero assertion weakening: no `.toBe(…)` / `.toEqual(…)` argument,
  no fixture source and no rendered string moved anywhere in `tests/**`
  (verified by diffing every changed assertion call site against HEAD).**
  - `tests/withheld-sentinel-mooting-and-render-pins.test.ts` — the file-top
    summary line; the GROUP F2 file-header block (its three decline grounds
    rewritten: the rendering is clause-admitted, and the DIAG-2
    *Trigger*-removal ground against suppression stands unchanged); the second
    GROUP F2 section banner; the group-F2 `describe` title and its SCOPE
    comment; and the assertion-message tails of `f2a`, `f2b`, `f2c`, `f2d`.
    `f2e` and `f2f` keep their subject — they pin the deferral the new clause's
    condition names.
  - `tests/withheld-sentinel-author-twin-provenance.test.ts` — the file-header
    "WHAT IS *NOT* CLAIMED HERE" line and `w2a`'s comment. `w2c` carried no
    decline language and is untouched (measured, not assumed).
  - `tests/fn-arg-type-mismatch-wired.test.ts` — `u13r`'s comment, twice: it
    stops calling the render a disclosed residual and cites the clause. Its
    byte-exact string and its two header-list lines are unmoved.
  - `tests/index-sentinel-typeenv-case-fence.test.ts` — the file-header face-1
    paragraph; the face-1 section banner; the face-1 `describe`'s SCOPE
    comment; the four assertion-message strings of `a1`, `a2`, `b1`, `f1`; the
    `b1` and `f1` `it()`-body comments; and the PRE-EXISTING group-(c) oracle
    cell's SCOPE comment, whose claim that extending the oracle over the face-1
    rows "would assert a contract no open fix is delivering" this fix falsifies.
  - `tests/plain-for-loop-variable-element-type.test.ts` — `b4` inspected for
    label drift and left UNTOUCHED: its comment contrasts the pre-/post-0126
    binder state, not the clause-admission question, and misdescribes nothing.
  - `tests/fn-param-not-identifier.test.ts` (2 sites) and
    `tests/live/generic-argument-bracket-group-truncation-live-cell.test.ts`
    (1 site) — the three line-form citations into `placeholder-rendering-a.md`
    that THIS change's +17-line insertion shifted: `:56` → `:73` (the closed
    `<construct>` token-name table sentence) and `:89` → `:106` (the
    `generic-arity-mismatch` numeric-scope paragraph), both verified against the
    post-edit content. Comment text only.
- **Residuals:**
  1. **The boundary class is stated, not closed.** A rendered name derived from
     author source text at an undetermined position is admitted by no clause of
     category 1, and this fix fixes no rendering for it. It is real and measured
     at this HEAD: `fn frobnicate(): integer { 1 }` with
     `for y in frobnicate() { y }` renders
     `'for' expects array<T> after 'in'; got frobnicate`, and `let s = "ab"`
     with `for y in s.length() { y }` renders `… got length` — the `call` and
     `method-call` arms of `#typeExpr` (`src/parser/static-type-inference.ts`)
     type an expression by the author's own identifier. The clause states this
     as a boundary rather than leaving the class half-closed by omission, which
     is what §Fix's scope test asks. No report is filed for it here; it is a
     filing candidate.
  2. **Deleting the `query` or `unknown` row from the closed table reds no
     test.** The scored carriers render only `<withheld>`, `index` and `object`,
     so those two rows are held by the same review discipline the *Closure*
     paragraph states for the other closed tables. `query` and `unknown` were
     measured reachable at this HEAD (`got query` at `non-array-iterand`;
     `array<unknown>` at `mixed-plus-operands`, `non-boolean-condition` and
     `let-rhs-type-mismatch`; and `array<Result<unknown, QueryError>>` at
     `let-rhs-type-mismatch`) but §Fix scopes the oracle to the emitting rows it
     enumerates, so no cell was added for them.
  3. **Citation churn.** The 17-line insertion shifts every line below category
     1's clause list in `placeholder-rendering-a.md` by +17. The three citations
     this change itself invalidated were repaired (above). Seven further
     line-form citations into that page were ALREADY stale at HEAD before this
     change — five `:49` sites
     (`tests/params-default-unresolvable-enum-variant.test.ts` ×4,
     `tests/live/live-production-acceptance.test.ts`) whose target sentence sat
     at `:55` and now sits at `:72`, and two `:79` sites
     (`tests/subagent-envelope-negative-zero-fidelity.test.ts` ×2) whose target
     sat at `:85` and now sits at `:102` — plus `src/parser/theta-document.ts`'s
     `:49`, which this fix may not touch. They were deliberately left unrepaired
     rather than silently "fixed", per the policy 0135's record set.
     `docs/bugs/**` citations are outside the gate in both directions and stay
     as filed.
  4. **§Reproduction's producer counts are stale as filed** and are corrected
     here rather than in the tables: `#typeExpr` has FOUR `unknown` arms at this
     HEAD, not two, and they are the `par-for` element arm, the `block`
     absent-tail arm, `#commonType`'s empty-candidate-set arm and
     `#matchArmType`'s empty-arm-set arm. The `par-for` arm's ABSENT TAIL is a
     `null` literal, not `unknown`. The closed table's `unknown` row states the
     corrected class.
  5. **The withheld carriers supply six scored fills, not four.** `f2b` and
     `f2c` each render two category-1 placeholders; the second is `integer`, a
     conformant primitive. A reader taking §Summary's "four `E` rows" as four
     fills would set the anti-vacuity count wrong.
- **Discharge notes appended:**
  `docs/bugs/0135-index-sentinel-leaks-into-messages-and-typeenv.md` (residual 2
  — its conformance oracle now ranges over the face-1 rows) and
  `docs/bugs/0143-withheld-sentinel-author-twin-and-render-leakage.md`
  (residual 1 — face 2's owner, the category-1 clause, has landed).
- **Pinned dispositions / non-goals:** every §Non-goals item stands. No rendered
  spelling moved, so GOV-15 observable (c) is untouched; no emission was
  suppressed, so no DIAG-2 *Trigger* moved; the withhold gate's coverage is
  still `containsWithheldBinderType`'s question, settled by 0143 and pinned by
  `f2e` / `f2f`; `#typeExpr`'s fabrication family as a NAMING question stays
  0135's and 0136's; and 0124, 0126 and 0130 are named in the boundary paragraph
  as the reports that carried its carriers, not adjudicated.
