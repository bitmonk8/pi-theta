# Bug 0083 — A `let` binding's declared type annotation is discarded after the initialiser check: the recorded binding type is the initialiser's inferred type, so `let n: number = 1` silently defeats `theta/parse/integer-narrowing` at every later use and `let e: array<string> = []` draws a false `theta/parse/non-string-array-join`

- **Status:** fixed (0.55.0). §Fix option 1 as settled — the `let` arm
  records the declared annotation, in its TYPE-11-transparent form. See
  §Fix (0.55.0) below.
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

## Fix (0.55.0)

The settled §Fix option 1, implemented as written; three review rounds, two
fixer rounds and one verification round. Line anchors are at the fix commit.

**The record.** `TypeLayerWalk.walkStmt`'s `case "let"`
(`src/parser/type-layer-checks.ts:591–594`) records
`annotation === undefined ? rhsType : unfoldAlias(annotation, this.env)`. The
resolved annotation is hoisted to one construction point immediately after
`rhsType` (`:551–556`), so `annotationToCompatType` runs once per `let` and
the same value feeds `checkLetRhsCompat`, the annotated-array element sink and
the record. All three of §Fix's constraints hold and are locked by tests: an
unresolvable annotation still falls back to `rhsType` —
`annotationToCompatType` answers `undefined` only for trim-empty source, an
undeclared *name* converting
to a deferred `named` instead; `let m: number = n` over an `integer`-declared
`n` stays silent (TYPE-2 widening); and the element sink still suppresses the
sink-less `theta/parse/array-no-common-type`.

**Why the recorded form is TYPE-11-transparent.** Recording the raw annotation
regressed two spec-legal dispositions through an alias, both caught in review
round 1 and both now pinned:

- `schema L = array<string>` with `let e: L = ["a"]` used as a `for` iterand
  drew a false `theta/parse/non-array-iterand`. `checkForIterand`
  (`src/parser/control-flow.ts:51`) tests `type.kind === "array"` directly and
  takes no `TypeEnv`, so an opaque `named L` fails a test the unfolded type
  passes. TYPE-11 (`docs/spec_topics/type-system.md:54`) makes `L` and
  `array<string>` the same type, and `docs/spec_topics/control-flow.md:13`
  requires only that the iterand have type `array<T>`.
- `schema L = array<integer>` with `let e: L = [1]` then `e.join(",")` LOST its
  true `theta/parse/non-string-array-join`. The join element gate
  (`type-layer-checks.ts:1222`) keys on `targetType.kind === "array"` the same
  way, so the opaque form turned a parse-time rejection prescribed by
  `docs/spec_topics/expressions.md:108` into a runtime deferral.

The transparent form IS the declared type under TYPE-11, so recording it is
still §Fix option 1. `unfoldAlias` (`src/parser/type-compat.ts:155`) — the
existing cycle-safe unfolder the `⊑` engine already applies, exported for this
reuse rather than duplicated — leaves an object-schema `named` nominal
(TYPE-10) and an unresolvable `named` intact, so `let p: P = P { … }` still
records `named P` and a nominal binding is still not iterable.
`checkForIterand` and the join gate were deliberately NOT modified: unfolding
inside them would also change the `fn`-parameter route, which this report does
not own. `sinkedArrayOf` (`:884`) now takes the arm's resolved annotation
instead of recomputing it — its one caller is that arm.

**No spec, registry, `docs/reference/` or `permitted-codes.json` edit.** DIAG-2
held: no new code, no new row, no widened trigger. Every code the fix newly
emits or newly suppresses is already registered at the position it fires
from — `theta/parse/integer-narrowing` at a typed-binding initialiser and
`theta/parse/non-string-array-join` at an `array<T>` receiver. All 34 committed
`.theta` / `.thetalib` files were parsed through `parseThetaDocument` with the
fix in place and with it neutralised: byte-identical diagnostic dispositions,
so no shipped example or fixture changes and the H9a empty-capture stderr gate
is unaffected.

**Tests.** `tests/let-annotation-recorded-binding-type.test.ts` (19 assertions,
offline, through the production `parseThetaDocument`). Groups (a) and (b) are
the two reported directions; group (d) the alias-transparency guards; the rest
are invariants. Neutralising the record proves `a1`, `b1`, `s12`, `d4` and the
`let mut` pin red; neutralising only the unfold proves `d1`, `d2`, `d3` red.
A scratch live probe drove the spec's own accumulate-then-join idiom
(`let mut xs: array<string> = []` … `xs.join(", ")`) through the shipped
extension against a live model: pre-fix the theta carries an error-severity
diagnostic and `parseDiscoveredTheta` never registers the command; post-fix it
registers and the turn renders the joined value. Probe deleted after the run,
per the 0033 precedent.

**Residuals.** (i) §Non-goals declined to settle `let mut` reassignment.
Checked and pinned, not changed: `case "reassign"` (`:598–600`) walks the
value and never re-records, so the declared type governs for the binding's
scope and `let mut n: number = 1` / `n = 2` / `let m: integer = n` now reports
`theta/parse/integer-narrowing`. (ii) The `fn`-parameter twin of the alias
regression is pre-existing and untouched: `schema L = array<string>` with
`fn f(xs: L) { for x in xs { … } }` still draws a false
`theta/parse/non-array-iterand`, and the join element gate still defers on an
alias-typed parameter. `checkForIterand` and the join gate are the only two of
six classifiers that do not apply TYPE-11. (iii) Pre-existing line-citation
drift in `tests/typeenv-prototype-names.test.ts` (`:282`, `:906`, `:1218`,
`:1256`, `type-compat.ts:149`, `theta-document.ts:843`) was wrong at
`61806a3a` and is left as found; only the citations this fix's own import line
shifted were corrected.

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

## Coordination note (0.72.0)

§Fix *Residuals* item (ii) — the `fn`-parameter twin of the alias regression,
left pre-existing and untouched by this report — is discharged by bug
[0089](./0089-fn-param-alias-not-unfolded-iterand-join.md)'s fix (0.72.0):
`checkForIterand` (`src/parser/control-flow.ts`) takes a `TypeEnv` and unfolds
its iterand, `checkMethodCall`'s `array.join` gate unfolds both the receiver and
the element it hands `checkArrayJoin`, and the `par for` element derivation
unfolds in both `src/parser/type-layer-checks.ts` and
`src/parser/static-type-inference.ts`. `schema L = array<string>` with
`fn f(xs: L) { for x in xs { … } }` now loads, and the join element gate now
reports on an alias-typed parameter. The two gates are no longer the two of six
classifiers that decline TYPE-11.

That fix **composes** with this one rather than replacing it. This report
changed what the `let` arm **records** (`unfoldAlias(annotation, this.env)`);
0089 changed what the gates **read**. The record here is untouched, and
`tests/let-annotation-recorded-binding-type.test.ts` is byte-unchanged and green
at 19/19 under 0089's fix, which additionally re-asserts the `let` route from
the `fn`-parameter side.

One pre-existing spelling this report's own reproduction did not separate is
also healed by 0089's element-level unfold: `schema E = string` with
`schema L = array<E>` and `let e: L = ["a"]` then `e.join(",")` drew a false
`theta/parse/non-string-array-join`, because `checkArrayJoin`'s element test
reads the element's `kind`. Under TYPE-11 `array<E>`'s element type **is**
`string`, so that emission sat outside the trigger
`docs/spec_topics/diagnostics/code-registry-parse.md` registers.

This report's group (d) comment on the two gates states that `checkForIterand`
"is handed no `TypeEnv` to unfold with". 0089's fix makes that false. The line
is left as found: this file is the `let`-route witness and is held
byte-unchanged across that fix.

## Discharge note — bug 0125 (0.76.0)

Appended by the bug 0125 fix; nothing above is altered.

**The `unfoldAlias` export this report created is reused, not duplicated.** Bug
0125 closes the index-element derivation
(`src/parser/static-type-inference.ts`, `#typeExpr`'s `case "index"` arm) by
calling the same exported helper this report introduced at
`src/parser/type-compat.ts`. TYPE-11 still has one implementation; no second
unfolding helper exists. The helper's two documented bounds carry the fix
unchanged: an object-schema `named` stays nominal (TYPE-10), so an alias of an
object schema keeps falling to the arm's `named "index"` sentinel, and an
unresolvable `named` stays `named`, so the deferral posture
`type-system.md:48` requires is preserved.

**The `let` route this report closed is untouched and is re-asserted from the
other side.** `walkStmt`'s `case "let"` still records
`unfoldAlias(annotation, this.env)`; bug 0125 changes what a *consumer* reads,
not what is recorded, exactly as bug 0089 did at the two gates. Measured from
0125's side, the two routes reach the same answer by different means:
`schema L = array<string>` + `let e: L = ["a"]` + `let y = e[0]` +
`y.frobnicate()` reports `unknown method 'frobnicate' on type string` before and
after (0125 §Reproduction rows a3 and g1, both pinned in its witness).

**This report's witness is byte-unchanged and green.**
`tests/let-annotation-recorded-binding-type.test.ts` → 19/19 at the 0125 fix
commit. Its group (d) comment stating that `checkForIterand` "is handed no
`TypeEnv` to unfold with" — which bug 0089 already made false — is still left
as found, for the same reason: this file is the `let`-route witness and is held
byte-unchanged.
