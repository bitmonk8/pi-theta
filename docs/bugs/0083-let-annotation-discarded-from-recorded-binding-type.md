# Bug 0083 — A `let` binding's declared type annotation is discarded after the initialiser check: the recorded binding type is the initialiser's inferred type, so `let n: number = 1` silently defeats `theta/parse/integer-narrowing` at every later use and `let e: array<string> = []` draws a false `theta/parse/non-string-array-join`

- **Status:** open.
- **Kind:** defect. The annotation is used once — to check the initialiser —
  and then dropped; every subsequent reference to the binding resolves the
  initialiser's type instead. The divergence is bidirectional: permissive where
  the annotation is wider than the initialiser, restrictive where it is
  narrower (the empty-array-literal sink case, which expressions.md and
  control-flow.md both name explicitly).
- **Related:**
  - `03-array-ternary-common-type-never-unions.md` (this hunt) also lives in
    the array element-type machinery, but its root cause is `hasCommonType` /
    `#commonType` refusing to form a union LUB. This report's root cause is a
    single `bindings.set` at `src/parser/type-layer-checks.ts:572`. Fixing
    either leaves the other's witnesses intact.
  - [0050](../../../docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)
    (open) is the same *class* — a declared type not consulted where the spec
    says it must be — at the `fn`-argument boundary. Different code, different
    diagnostic; a fix for 0050 does not touch the `let` binding table.
  - [0038](../../../docs/bugs/0038-typeenv-prototype-member-names-resolve-as-declared-types.md)
    (fixed 0.48.0) touched the type environment the annotation is resolved
    against; this report is about what happens to a *successfully resolved*
    annotation afterwards.
- **Affected** (citations verified at HEAD `d06daae3`):
  - `walkStmt`'s `case "let"` (`src/parser/type-layer-checks.ts:543–574`). The
    RHS type is computed at `:545`; the annotation is converted at `:547` and
    used only for `checkLetRhsCompat` (`:551–559`) and the annotated-array
    element sink (`:563–565`). The binding is then recorded at `:572` as
    `bindings.set(stmt.name, rhsType)` — `rhsType`, never `annotation`. The
    comment on the line reads "Record the binding type so later identifier
    references resolve."
  - `bindings` is the map every later `typeOf` consults
    (`:523–525` → `this.pass.typeOf(expr, this.env, bindings)`), so the
    annotation is invisible to every downstream check: `checkArrayJoin`
    (`:1199`), the `unknown-method` allow-list (`:1210`), `checkLetRhsCompat`
    on a later binding, the boolean-position check, the iterand check.
  - `#commonType` (`src/parser/static-type-inference.ts:335`) returns
    `{ kind: "named", name: "unknown" }` for an empty candidate list (`:337`),
    so `typeOf([])` is `array<unknown>` — the type an annotated empty literal
    ends up recorded with.
  - `checkArrayJoin` (`src/runtime/stdlib-array.ts:100`) admits only a `string`
    primitive or a `string`-typed literal element (`:107–111`) and otherwise
    emits `theta/parse/non-string-array-join` (`:117`). `unknown` is neither.
- **Observed at:** 0.52.0 (`d06daae3`), offline, through the production
  whole-file parser (`parseThetaDocument`), reading the aggregated diagnostic
  codes.

## Summary

`let x: T = init` records `x` with the type of `init`, not `T`. Where `T` is
wider than `init`'s type the widening is lost and a later narrowing check that
should fire does not; where `T` supplies information `init` cannot (the empty
array literal, whose element type expressions.md says comes from the binding
annotation) the information is lost and a later check fires that should not.

## Reproduction

Parse-only, through `parseThetaDocument`. Aggregated diagnostic codes:

**(a) Permissive direction — the declared widening is dropped.**

| Source (after `---\nmode: prompt\n---`) | Observed | Expected |
| --- | --- | --- |
| `let n: number = 1` <br> `let m: integer = n` <br> `1` | `[]` | `["theta/parse/integer-narrowing"]` — `n` is declared `number`; `number → integer` is narrowing |
| `let n = 1.5` <br> `let m: integer = n` <br> `1` | `["theta/parse/integer-narrowing"]` | same — the control proving the check exists and fires when the RHS type happens to be `number` |

The two differ only in whether `number` arrives by annotation or by
inference. The check is defeated by the annotation.

**(b) Restrictive direction — the declared element type is dropped.**

| Source | Observed | Expected |
| --- | --- | --- |
| `let e: array<string> = []` <br> `e.join(",")` | `["theta/parse/non-string-array-join"]` | `[]` — `e` is `array<string>` |
| `let e: array<string> = ["a"]` <br> `e.join(",")` | `[]` | `[]` (control — a non-empty literal supplies `string` by inference) |
| `let e: array<integer> = []` <br> `e.join(",")` | `["theta/parse/non-string-array-join"]` | same code, but for the right reason |
| `let e: array<string> = []` <br> `e.frobnicate()` | `["theta/parse/unknown-method"]` | same — the receiver still classifies as an array, so only the element type is lost |

Probe: throwaway vitest calling `parseThetaDocument` on each source and
collecting `.diagnostics.map(d => d.code)`; deleted after the run.

## Expected behaviour

- `docs/spec_topics/lexical.md:28`, §"Number literals": "`integer` widens
  implicitly to `number` in arithmetic and assignment positions; the reverse is
  `theta/parse/integer-narrowing`." A binding declared `number` holds a
  `number`; copying it into an `integer` slot is the reverse direction.
- `docs/spec_topics/type-system.md` TYPE-2 (`integer ⊑ number`) is the relation
  `checkLetRhsCompat` already applies — correctly, at the initialiser. Nothing
  in the spec says the relation stops applying to the binding afterwards.
- `docs/spec_topics/expressions.md:220` — "`[]` is the empty array; its element
  type is inferred from context (**binding annotation**, parameter type, or
  surrounding constructor field)."
- `docs/spec_topics/control-flow.md:13` names the annotated empty binding as
  the prescribed idiom: "Annotate via a `let xs: array<T> = []` immediately
  above the loop". The idiom the spec tells authors to use is the one that
  loses `T`.
- `docs/spec_topics/expressions.md:108` (`array<T>` stdlib table, `join` row) —
  "Element type must be `string`; non-string element types are
  `theta/parse/non-string-array-join`". `array<string>` is a `string` element
  type.

## Actual behaviour / root cause

One line: `type-layer-checks.ts:572`, `bindings.set(stmt.name, rhsType)`. The
annotation was converted to a `CompatType` twelve lines earlier and is
in scope; it is used for the initialiser compatibility check and the
annotated-array element sink, then discarded.

Consequences follow from what `rhsType` is:

- `let n: number = 1` → `rhsType` is `integer` (the literal's type), so `n`
  reads back as `integer` and the `number → integer` narrowing check at the
  next binding sees `integer → integer`.
- `let e: array<string> = []` → `typeOf([])` is `array<unknown>`
  (`static-type-inference.ts:217–223` over an empty element list, whose
  `#commonType` returns `named "unknown"` at `:337`), so `e` reads back as
  `array<unknown>` and `checkArrayJoin` refuses it.

The initialiser check does its job in both cases — `1 ⊑ number` passes, and the
annotated empty literal is routed to the element sink so it does not raise
`array-no-common-type`. Only the recorded type is wrong.

## Why it matters

1. Direction (a) is silent permissive acceptance of exactly the input the
   `integer` / `number` distinction exists to catch. `theta/parse/integer-narrowing`
   is the spec's only guard on that boundary, and one annotation defeats it for
   the rest of the binding's life. Nothing is reported at load and nothing
   changes at runtime (both are JS `number`), so the author's declared intent
   is dropped with zero diagnostics.
2. Direction (b) refuses a program the spec supplies as the recommended idiom.
   `let xs: array<string> = []` followed by `xs.join(", ")` — accumulate then
   join, the most common shape in a language with no `map` — does not load.
3. The two directions are the same line, so a partial fix that addresses only
   the reported false rejection would leave the silent-acceptance half open.
4. It is invisible to the existing suite because the annotation and the
   initialiser type agree in almost every test: the divergence needs either a
   widening annotation or an empty literal.

## Non-goals

- Not about `checkLetRhsCompat` itself, which correctly checks the initialiser
  against the annotation (the `let n = 1.5` / `let m: integer = n` control
  proves the check works).
- Not about `let mut` reassignment, which was not probed here; a fix should
  check whether a reassignment re-derives the binding type from the assigned
  value.
- Not about the `fn`-parameter and constructor-field sinks named in the same
  spec sentence; the constructor-field sink was probed and works, and the
  `fn`-parameter sink is covered in `03-…` and bug 0050.
- Not about runtime behaviour: `integer` and `number` are the same JS value, so
  no value is corrupted — the loss is entirely in the static contract.

## Fix

Options.

1. **Record the annotation when present.** At `:572`, record
   `annotation ?? rhsType`. Minimal and correct for both directions: the
   annotation is the declared type, and the initialiser has already been
   checked against it, so recording it cannot admit an unchecked value. Risk:
   any downstream check that currently relies on the narrower inferred type
   would start seeing the wider declared one — which is the intended
   behaviour, but it may surface new (correct) diagnostics on existing thetas.
2. **Record the meet.** Record the narrower of the two. This fixes direction
   (b) (`array<string>` is narrower than `array<unknown>` in the sense that
   matters) but not direction (a), where the whole point is that the wider
   declared type must win.
3. **Record the annotation only for the empty-literal case.** Smallest
   possible change; leaves direction (a) open. Not recommended — it would
   close the visible symptom and leave the silent one.

Recommendation: option 1.

Constraints any fix must satisfy:

- An unresolvable annotation (`annotationToCompatType` returns `undefined`)
  must keep falling back to `rhsType`, so a name the type environment cannot
  resolve does not turn every later use into an unknown-type deferral.
- `theta/parse/integer-narrowing` must keep *not* firing for
  `let m: number = n` where `n: integer` (TYPE-2 widening is legal in that
  direction).
- The annotated-array element sink at `:563–565` must continue to suppress the
  sink-less `array-no-common-type` check, so a validly annotated union array
  still loads.

## Provenance

- Spec: `docs/spec_topics/expressions.md:220`, `:108`;
  `docs/spec_topics/control-flow.md:13`;
  `docs/spec_topics/lexical.md:28` §"Number literals";
  `docs/spec_topics/type-system.md` TYPE-2;
  `docs/reference/diagnostics.md` (`theta/parse/integer-narrowing`,
  `theta/parse/non-string-array-join` rows).
- Implementation: `src/parser/type-layer-checks.ts:523–525`, `:541–574`,
  `:1193–1215`; `src/parser/static-type-inference.ts:217–223`, `:335–346`;
  `src/runtime/stdlib-array.ts:96–125`.
- Existing reports read in full for duplicate separation: 0038, 0050.
- Observations: throwaway vitest parse probe at `d06daae3`, deleted after the
  run.
