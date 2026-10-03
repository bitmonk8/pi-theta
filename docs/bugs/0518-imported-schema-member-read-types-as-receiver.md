# Bug 0518 — a member read off an IMPORTED `.thetalib` schema value is statically typed as the receiver's OWN schema type: `#memberType`'s unresolved-receiver arm answers a confident nominal with no withheld provenance, so `for x in r.xs` over an imported `schema R6 { xs: array<string>, … }` draws a false `theta/parse/non-array-iterand` ("got R6") and the theta refuses to load, while every soft position consumes the same fabricated type as an unresolvable and defers — by accident, not by the withheld rule

- **Status:** open — filed 2026-10-03 from the LPS tooling build
  (morning-ritual increment 12b import-side probes; repro under "Repro"
  below, probe matrix under "Observed")
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S2/D2 — S2: a loud false refusal of the documented
  library pattern (imports.md:3/:30 — every top-level `.thetalib` schema is
  implicitly exported; construct and consume it in the importing `.theta`):
  the first `for` over an imported-schema array member refuses the whole file
  at load, same calibration as bug 0504's documented-pattern refusal. The
  quiet twin is a mechanism hazard measured at the typed-`let` sink:
  `let n: integer = r.note` over an imported `note: string` loads clean and
  runs (the same-file spelling draws `theta/parse/let-rhs-type-mismatch`),
  because the fabricated `R6` happens to be unresolvable to `checkCompatible`
  — the deferral is an accident of the wrong type, and any present or future
  judging consumer of the position turns it into a false verdict, which is
  exactly what the iterand gate already does. D2: the defective answer is one
  arm (`#memberType`'s `decl === undefined` fallback) and the deferral
  infrastructure it should answer with already ships (`withheldBinderType()`,
  `checkIterand`'s withhold path); the truthful load-phase
  field-materialisation route is larger (D3, the 0422/0429/0465 family's
  territory) and is not required to clear the false refusal.
- **Where (pi-theta, main 1ee455f4, 0.496.0; reproduced byte-identically on
  installed 0.494.0):**
  - `src/parser/static-type-inference.ts:716–762` — `#memberType`. The enum
    gate answers first for declared-enum receivers (`:721–726`, bug 0191);
    the receiver unfolds through `unfoldAlias` (`:728`); for a `named`
    receiver `resolveNamed(env, receiver.name)` (`:730`) consults the `⊑`
    declaration table; **the `decl === undefined` arm (`:731–733`) answers
    `{ type: receiver, declared: false }`** — the receiver's own type, a
    confident nominal carrying no `withheld` provenance. For an
    imported-schema receiver this arm is reached by construction (next
    bullet). The closing fall-through mint `named(node.field)` (`:761`) is a
    different fabrication (bug 0136's subject); the imported path never
    reaches it. Readers: `#typeExpr` (`:326`) / `#typeValue`'s `case
    "member"` (`:404–405`), and the public `declaredFieldType` (`:266–273`).
  - `src/parser/type-layer-checks.ts:508–537` — `collectTypeEnv`, the table
    `resolveNamed` reads, holds same-file `schema` statements only;
    `collectImportedSymbols` (`:624–633`) carries imported names in a
    separate name set. Meanwhile the reference-position resolution set maps
    an imported symbol **AS RESOLVED** (`collectBodyTypes`,
    `src/parser/theta-document.ts:992–1015` import arm;
    `src/parser/body-type-lowering.ts:598–612`, bug 0033 §Fix), so no
    `theta/parse/unresolved-named-type` fires on `R6` anywhere — the two
    tables disagree about imports, and `#memberType` consults only the one
    that excludes them. (That the parse phase cannot read the `.thetalib`'s
    fields is the bug 0422 premeasure, E1–E5: the sync `FileSystem`-free
    parser has no import contents.)
  - `src/parser/control-flow.ts:47–61, 62–80` — `checkForIterand` refuses
    every non-`array` kind, rendering the unfolded type into the message
    (`got R6`); its own doc comment pins the judging disposition for
    unresolvables: "an unresolvable `named` stays intact, so both keep
    rejecting" (`:55–57`, bug 0089's fix).
  - `src/parser/type-layer-iterand.ts:8–29` — `checkIterand`, the gate's one
    deferral: the verdict is withheld only when
    `containsWithheldBinderType(iterandType)` — the `withheld` provenance
    marker that only `withheldBinderType()` mints
    (`src/parser/type-compat.ts:526–554`). The fabricated `R6` answer carries
    no marker, so the gate judges it.
  - `src/parser/type-compat.ts:311–312, 338–339, 372–386` — `checkCompatible`
    answers `"unknown"` for a `named` that `resolveNamedRef` cannot resolve,
    so every compatibility consumer (typed-`let` sink, reassignment RHS,
    boolean positions, operand checks) defers on the same fabricated type —
    the quiet twin, and the mechanism behind the shipped two-step workaround
    (assignment position defers where the iterand position refuses).
  - Provenance: bug 0136's fix (0.106.0) chose this answer deliberately —
    "the same branch is the provably-inert answer for *every* unresolvable
    receiver, because it returns a name the arm has just proven resolves to
    nothing" (0136 `## Fix` §What shipped). The import seam breaks the
    proof's premise: an imported schema name resolves to nothing in the `⊑`
    table while being a legal, load-resolvable declaration the author wrote
    correctly, and the iterand gate consumes the answer with a judging, not
    deferring, disposition. 0136's residuals 1–6 do not record this input
    class.
- **Spec:**
  - `docs/spec_topics/imports.md:3` — `.theta` files import schemas from
    `.thetalib` files; `:30` (*Visibility*) — "Every top-level `schema`,
    `enum`, and `fn` in a `.thetalib` file is implicitly exported." Nothing
    scopes field access to the declaring file.
  - `docs/spec_topics/control-flow.md:13` — the iterand "must have type
    `array<T>` for some `T`; iterating strings, objects, or numbers is
    `theta/parse/non-array-iterand`" — a judging rule over resolved types.
    `r.xs` IS `array<string>` by the imported declaration. The same line
    already supplies the runtime net for a deferred iterand: "A deferred
    iterand that turns out non-array at runtime aborts loudly
    (`theta/runtime/internal-error`) rather than iterating zero times".
  - `docs/spec_topics/type-system.md:50` — *Unresolvable operands*: the
    withheld class is "a type the source WITHHOLDS or that sits outside the
    parser's static view, never a name the author WROTE and got wrong" — an
    imported schema's field types sit outside the parser's static view by
    the 0422 premeasure. The paragraph puts the `for` iterand's precondition
    outside itself ("take their own dispositions") and adjudicates a judging
    disposition only for `join`'s ELEMENT — whose bug-0262 requalification
    separates exactly this class: "a read whose type is merely withheld …
    still reaches this element check exactly as before". No sentence gives
    the `for` iterand a judging disposition over a withheld member read.
  - `docs/spec_topics/type-system.md:58, 60` — TYPE-10/TYPE-11: a declared
    `array<string>` field supplies `array<string>` at every `⊑` position; no
    rule types a member read as its receiver.

## Symptom

Two files in one theta root. `p6lib.thetalib`:

```theta
schema R6 { xs: array<string>, ran: boolean, note: string }
```

`p7.theta`:

```theta
---
mode: subagent
params: { q: string }
---
import { R6 } from "./p6lib.thetalib"
let r = R6 { xs: ["a", q], ran: false, note: "init" }
let mut out = ""
for x in r.xs {
  out = out + x
}
out
```

Loading any session over that root draws

```
p7.theta:8:10: theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got R6
```

and the theta refuses to register. Declaring the identical schema in the
same file loads clean; so does the two-step binding
(`let mut xs2: array<string> = []` then `xs2 = r.xs`, iterate `xs2`) —
assignment position defers on the fabricated type instead of judging it.

## Observed (2026-10-03, installed 0.494.0 AND main 1ee455f4, 0.496.0)

Parse cells: scratch script outside the tree
(`D:/UnitySrc/lps-build-scratch/inc12b-probe/verify-member-iterand.ts`,
vite-node), production `parseThetaDocument` with inert parse deps, run once
against the installed 0.494.0 package sources and once against the checkout
at 1ee455f4 (0.496.0). **Results byte-identical on both versions:**

| cell | body | error codes |
|---|---|---|
| P7 | IMPORTED `R6`, `let r = R6 {…}`, `for x in r.xs` | `non-array-iterand` ("got R6") |
| P1 (control) | same body, LOCAL `schema R6 {…}` | `[]` |
| P8 (control) | IMPORTED, `let mut xs2: array<string> = []`, `xs2 = r.xs`, iterate `xs2` | `[]` — the workaround |
| Q1 | IMPORTED, `let n: integer = r.note` | `[]` — silently defers |
| Q2 (control) | LOCAL, `let n: integer = r.note` | `let-rhs-type-mismatch` |

Host level (real `pi` session over the probe root, installed 0.494.0,
2026-10-03): P6/P7-shaped files emit the error as a `theta-progress-entry`
diagnostic at session start and do not register; the P8 shape registers and
runs. The parse measurement is the host observable on both versions because
the load pass only ADDS failure conditions, never absolves a parse-phase
error (`src/extension/production-composition.ts:3711` — `hasErrors:
hasLoadParseError(document.diagnostics) || failsPostParseChecks`).

Fuller host-level matrix from the incident probes (installed 0.494.0): local
schema with immutable binding, `let mut` reassigned in a branch, reassigned
from a local `fn` call, reassigned from `match invoke<R>(…)`, and a
two-broken-callee cascade control all load their iterands clean; both
imported-schema shapes (immutable and `let mut`) draw the false
`non-array-iterand; got R6`.

## Expected (spec citations)

The program is legal and loads. `r.xs` is `array<string>` by the imported
declaration (imports.md:30, TYPE-11); control-flow.md:13's rejection
enumerates resolved non-array types, and a member type the parse phase
cannot see is the withheld class of type-system.md:50, which no sentence
gives the iterand gate a judging disposition over. At parse time the member
read therefore either

1. carries its declared field type (a load-phase answer — the truthful
   route; then Q1 draws `let-rhs-type-mismatch` exactly as Q2 does), or
2. carries a withheld type, so the iterand gate withholds its verdict (the
   posture `checkIterand` already implements for withheld binder types) and
   every compat position defers BY RULE; a deferred iterand that turns out
   non-array at runtime aborts loudly per control-flow.md:13.

Under neither reading is the file refused, and under neither reading is the
member read's static type the receiver's own schema.

## Actual (implementation citations)

`#memberType`'s `decl === undefined` arm
(`static-type-inference.ts:731–733`) answers the receiver's own `named` —
for `r: R6` every member read `r.<f>` types as `R6` — with no `withheld`
provenance. `checkIterand` finds no withheld marker
(`type-layer-iterand.ts:23–25`) and `checkForIterand` judges the nominal
(`control-flow.ts:68–79`): `non-array-iterand; got R6`, error severity, the
theta is dropped. At every compatibility position the same fabricated
nominal makes `checkCompatible` answer `"unknown"`
(`type-compat.ts:311–312, 338–339, 372–386`) and the consumer defers — Q1
binds a `string` initialiser under an `integer` annotation with zero
diagnostics (no runtime net exists at the typed-`let` position), P8's
reassignment defers, `!r.ran` and `out + r.note` defer. The observable at
the soft positions coincides with the withheld rule's answer; the mechanism
is a wrong type that one shipped consumer (the iterand gate) already
converts into a false refusal.

## Root cause

One arm, two tables. Imports are registered as resolved NAMES in the
reference-position resolution set (`collectBodyTypes` import arm, bug 0033),
so constructor literals and annotations naming `R6` load clean — but
`collectTypeEnv`, the only table `#memberType` consults, holds same-file
`schema` statements exclusively, and the parse phase cannot read the
`.thetalib`'s fields at all (bug 0422 premeasure). The
unresolved-receiver fallback bug 0136 shipped converts "I cannot resolve
this receiver's declaration" into "the expression HAS the receiver's type":
a confident wrong type rather than a withheld one. 0136's inertness argument
("returns a name the arm has just proven resolves to nothing") holds only
for consumers that defer on unresolvables; `checkForIterand` is the shipped
consumer that judges them (bug 0089's deliberate comment), and the imported
schema is the input class where the unresolvable receiver belongs to a
legal, correctly-written program.

## Fix direction

1. **Withheld provenance at the arm (minimal, mechanism-honest).** In the
   `decl === undefined` arm, answer a withheld type — `withheldBinderType()`
   verbatim, or the receiver's `named` with `withheld: true` (preserves the
   name for any future rendering; widens the "only `withheldBinderType()`
   sets `withheld`" discipline documented at `type-compat.ts:69–73, 526`,
   which must then be re-stated). `checkIterand` then withholds the iterand
   verdict, every compat consumer keeps deferring (a withheld `named` is
   still unresolvable to `checkCompatible`), the false refusal is gone, and
   deferral at the soft positions becomes the rule's answer instead of an
   accident. Runtime stays covered: a deferred iterand that is not an array
   aborts `theta/runtime/internal-error` (control-flow.md:13), and the
   typed-`let` position keeps parse-silent exactly as every withheld read
   does today.
2. **Load-phase field materialisation (truthful; the 0422/0429/0465
   family's route).** The load pass already holds the declaring lib's full
   field lists (bug 0429's check reads them); thread the import closure's
   object-schema declarations into the type layer so `#memberType` resolves
   imported fields exactly as local ones. Strictly stronger — restores every
   member-dependent check for imported schemas (Q1 starts drawing
   `let-rhs-type-mismatch`) — and strictly larger: every imported-schema
   member read in every committed fixture starts being judged, needing a
   conformance sweep. Composes with option 1 (option 1 clears the refusal;
   option 2 can land later as the judging upgrade).
3. **Narrow: defer at the gate.** Teach `checkForIterand` to defer on
   unresolvable `named` types. Dispreferred: it contradicts the gate's own
   0089-pinned judging comment, leaves the fabricated type in place for
   every other judging consumer, and its scope entangles with open bug 0513
   (call expressions type as the callee's bare name — the same gate judges
   those nominals too, so changing the gate's disposition adjudicates
   0513's iterand face as a side effect).

Constraints, any route:
- The enum-variant answer must not move: declared-enum receivers are served
  by the `#enumNames` gate AHEAD of the fallback (`:721–726`), so
  `Enum.Variant` keeps typing as `named(Enum)` (schemas.md:97) and an
  enum-variant iterand keeps refusing. Scope the change to the
  `decl === undefined` arm only.
- Audit bug 0136's witness (`tests/member-access-declared-field-type.test.ts`
  groups (b)/(d), which pin the receiver answer for unresolved receivers)
  and bug 0191's residual row f4 before flipping any pinned cell; record
  every flip against type-system.md:50's withheld class.
- `WITHHELD_BINDER_TYPE_NAME` ("`<withheld>`") must not leak into any
  user-facing message — deferral emits nothing, so none should exist; assert
  it in the witness.
- Witness: P7 loads clean on the fixed build (both `for` and `par for`
  cells); P1/P8/Q2 controls unmoved; Q1 pinned to the route's answer (`[]`
  under 1, `let-rhs-type-mismatch` under 2); an imported STRING-field
  iterand (`for x in r.note`) defers at parse and aborts
  `theta/runtime/internal-error` at runtime under route 1; a genuinely
  undeclared receiver keeps its `theta/parse/unknown-identifier`; the
  committed-fixture parse gate stays green.

## Repro (minimal, inline)

The two files under §Symptom in one theta root; load them (any `pi` session
with that root active, no model turn needed — the diagnostic is emitted at
registration). Expected: the theta registers. Observed:
`theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got R6`
and the theta is dropped. Move the `schema R6 {…}` line into `p7.theta` in
place of the import: loads clean. Parse-cell form (no host): see the
Observed table's script.

## Related

- [0136](./0136-member-access-types-as-field-name-not-field-type.md) (fixed
  0.106.0) — parent of the arm: its fix introduced the receiver-type answer
  for unresolved receivers with an inertness argument this input class
  falsifies. Not reopened: the local-schema behaviour it fixed stays
  correct.
- [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md) (fixed 0.72.0)
  — the iterand gate's unfold + keep-rejecting-unresolvables comment; the
  judging disposition that turns this report's fabricated type loud.
- [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md)
  (fixed 0.255.0) — adjudicated `join`'s two levels (element judges,
  receiver defers) and left the `for` iterand to "its own disposition";
  the 0262 requalification's written-vs-withheld split is this report's
  governing distinction.
- [0422](./0422-imported-schema-field-invisibility-renders-undefined.md)
  (fixed 0.435.0),
  [0429](./0429-imported-schema-ctor-field-set-never-judged.md) (fixed
  0.422.0),
  [0465](./0465-imported-annotation-vacuous-typed-query-validation.md)
  (fixed 0.462.0) — the import-seam family: parse defers FS-free, the load
  pass holds the fields and judges. Route 2 is their pattern at the member
  read; none of them covers body-code member-read static typing.
- [0513](./0513-call-static-type-nominal-not-return-type.md) (open) —
  sibling fabricated-nominal class (call expressions typed as the callee's
  bare name). Different arm, different fix seam; route 3's gate change
  would entangle them.
- Incident lineage: found building LPS's `lps-morning-ritual.theta`
  (increment 12b) — `for fnd in jr.findings` over a `JobReport` imported
  from `workers/lps.thetalib` refused the load with `got JobReport`; the
  shipped theta carries the P8 two-step workaround.
