# Bug 0426 — The QRY-18 stringification table has no row for a union static type: the shipped value-driven row selection (`number | null` → `NaN`, unquoted strings, scalar rows) is pinned by tests only, and the table's own "render by the static type" headline now describes a rule the implementation does not follow for union and opaque terminals

- **Status:** open.
- **Sev/Diff estimate:** S4/D2 — doc/spec drift with a crisp, mechanically
  demonstrable gap: the behaviour is correct and test-pinned, but a second
  implementer reading the normative table cannot derive it (no row keys a
  union type, and the row-selection rule the implementation uses — resolve
  the value's runtime kind first — is stated by no sentence); D2 because the
  edit is a GOV-30 spec amendment needing one adjudicated wording plus its
  `docs/reference/` mirror, not code.
- **Kind:** spec gap — the deferred half of bug 0408's settled fix. 0408
  §Fix recommended options (a)+(c) TOGETHER, (c) being "add a union row to
  the QRY-18 table pinning (a)'s behaviour, since the table currently has no
  row at all", and recorded that "the table edit is needed for whichever
  behaviour wins". The parent adjudication forbade the spec-phase amendment
  in that campaign, so only (a) landed; 0408 §Fix residual 1 designates the
  missing row a filing candidate and states the deferral in terms ("DIAG-2
  same-commit spec edit deferred"). This report is that filing.
- **Related:**
  - [0408](./0408-scalar-union-params-render-json-row.md)
    (fixed 0.406.0) — the parent: its fix pinned value-driven scalar-row
    selection (`tests/b0408-*.test.ts` W1–W4), and its §Reproduction caveat
    already carried the load-bearing inference this gap forces: "For
    `number | null` no table row or spec sentence names the static type, so
    the `NaN` face rests on the spec gap plus the same-table sentence …, not
    on a row that names this type."
  - [0406](./0406-object-typed-params-misclassified-string.md)
    (fixed 0.404.0) — introduced the second value-driven terminal
    (`opaque-object`), widening the class of renders the static-type table
    does not describe.
  - [0098](./0098-nonstring-literal-union-emission-unspecified.md)
    (fixed 0.252.0) — precedent for this report's shape: deliberate shipped
    behaviour pinned by tests with no normative sentence, filed and fixed as
    a spec amendment.
  - [bug 0425](./0425-union-of-schemas-arm-renames-dropped.md) — the union-of-SCHEMAS rendering defect;
    a table row for unions should state its translation clause consistently
    with however /04 is settled.
- **Affected** (verified at 04579e12, v0.415.0):
  - `docs/spec_topics/query/query-escapes-stringification.md:18–28` — the
    QRY-18 table: rows for `string`, `integer`, `number`, `boolean`, `null`,
    Enum variant, `array<T>`, Schema-typed object, `Result<T, E>`. No row
    keys any union type (`string | null`, `number | null`, `Cat | Dog`), and
    none keys an unresolvable/opaque type.
  - `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:46`
    — "render the resolved value by its static type" (the headline rule) and
    the `NaN`-reachability clause worded for "a `number`-typed param", not
    `number | null`.
  - Behaviour source: `src/parser/system-interpolation.ts:403–404, 512,
    533–557` — union / opaque terminals render by the RESOLVED VALUE's
    runtime kind (`interpolationTypeOfValue`), mirroring the query surface's
    `interpolationTypeOf` (`src/extension/production-theta-producer.ts:7717`).
  - Behaviour pins: `tests/b0408-*.test.ts` W1 (`string | null` value
    `"hello"` renders unquoted `hello`), W2 (`NaN` → `NaN`), W3 (`1e21` →
    `1000000000000000000000`), W4 (`null` → `null`); `tests/b0406-*.test.ts`
    W5/W7 (opaque-object value-driven renders).
- **Observed at:** v0.415.0 (04579e12). Spec read plus the committed pins
  above; behaviour re-confirmed offline via the candidate /04 and /06 probes
  (scratch vitest, deleted).

## Summary

The canonical stringification table keys its rows on "the **Theta static
type** of the expression" (QRY-18, `:18`). Since 0406/0408, two whole
classes of `system:` terminals — unions (`string | null`, `number | null`,
`Cat | Dog`) and opaque imported schemas — render by a rule the corpus never
states: resolve the value first, then select the row from the VALUE's
runtime kind. Every consequence an author or second implementer needs is
therefore derivable only from tests:

- `p: 'number | null'` carrying `NaN` renders `NaN` (not the JSON `null`
  the pre-0408 static reading produced) — the exact byte-level question bug
  0408 was filed over rests on an inference chain (same-table sentence +
  gap + a `NaN` clause worded for plain `number`).
- `p: 'string | null'` carrying `"hi"` renders unquoted — no row says a
  union-typed string is unquoted.
- Which row a union-of-schemas value takes (the JSON row; candidate /04's
  subject) is likewise stated nowhere.

## Reproduction

Spec-side (all at 04579e12):

- `query-escapes-stringification.md:18–28`: enumerate the row keys — nine
  rows, none a union or opaque type. A `${p}` whose declared type is
  `number | null` matches no row; the table is the normative rule
  (`frontmatter-fields-b-and-templates.md:46` binds `system:` to it).
- `frontmatter-fields-b-and-templates.md:46`: the `NaN` reachability clause
  reads "a `number`-typed param supplied through the `invoke(...)` …" — the
  one sentence about non-finite doubles from this slot names a type the gap
  does not cover.
- No sentence in either file (nor `query-forms.md`, nor the
  `docs/reference/` mirrors — searched for "union", "runtime kind",
  "resolved value") states the value-driven row-selection rule.

Behaviour-side: `tests/b0408-*.test.ts` W1–W4 pin `hello` / `NaN` /
`1000000000000000000000` / `null` for scalar-union params — green at HEAD,
derivable from no normative text.

## Expected behaviour

A normative sentence (or table row) exists for every reachable static type,
per the table's own design intent (QRY-18's rationale: the table exists so
renderings are never left to implementation defaults). Concretely the gap
needs: (1) a union row — "a union-typed interpolation renders by the row of
the resolved value's runtime kind; `null` renders `null`; an object value
takes the Schema-typed-object row" — worded to match the shipped W1–W4 /
G2 behaviour; (2) the `:46` `NaN` clause widened to cover `number | null`
(or made type-agnostic); (3) a statement covering the opaque-imported
terminal's value-driven rendering (0406 Rec A), or an explicit
"unspecified" marker if that is the intent.

## Actual behaviour / root cause

0408's parent adjudication forbade spec-phase amendments in the fix
campaign, so §Fix option (c) — recommended jointly with the landed (a) —
was deferred and recorded as residual 1. The implementation and its tests
moved; the table did not. (DIAG-2's same-commit discipline was not owed in
terms — no diagnostic was added or widened — which is why the deferral was
procedurally clean; the gap is nonetheless real.)

## Why it matters

- The `NaN` face was a filed S2 bug (0408) whose fixed behaviour is now
  underdetermined by the corpus that specifies it: a re-implementation from
  spec alone would legitimately produce `null` again (JSON row) or refuse
  the render (no row), both byte-divergent from the pinned suite.
- Bug 0098 establishes the project's own bar: deliberate, test-pinned
  behaviour with no normative sentence is a fileable and fixable gap, not
  documentation nice-to-have.
- Candidate /04's fix needs a table clause to land against; writing the
  union row first (or in the same adjudication) prevents a second drift.

## Non-goals

- The union-of-schemas RENAME defect (implementation) — candidate
  system-templates-2/04.
- The scalar-union render behaviour itself — correct since 0408 and pinned;
  this report changes no bytes.
- The `Result`-face contradiction ("cannot fire here") — candidate
  system-templates-2/01 carries it with its reachability evidence.

## Fix

Spec-only, one adjudicated edit: add the union row to the QRY-18 table
(wording under **Expected behaviour**), widen the
`frontmatter-fields-b-and-templates.md:46` `NaN` clause to non-finite
doubles reaching ANY number-carrying union, and state the value-driven
row-selection rule once (with the opaque-imported terminal named), plus the
`docs/reference/` mirror of each touched sentence. Alternative rejected by
the evidence: pinning a STATIC reading (e.g. "unions render as JSON") would
re-open 0408's fixed defect and red four committed witnesses. Constraint:
the row must stay consistent with whatever disposition /04's union-rename
fix adopts (translation clause included or explicitly deferred). Ordering:
the new row's translation clause must FOLLOW `candidate
system-templates-2/04`'s disposition — file/fix the two together (or /04
first); writing the clause before /04 settles would pin spec text a
behaviour fix then contradicts.

## Provenance

Designated filing: bug 0408 §Fix (0.406.0) residual 1 ("Filing candidate
(DIAG-2 same-commit spec edit deferred)"), whose §Fix recorded the parent
adjudication that deferred option (c). Spec rows and clause wordings read at
04579e12; behaviour pins verified by reading
`tests/b0408-scalar-union-params-render-json-row.test.ts` (W1–W4, G2) and
re-probed via scratch vitest (deleted).
