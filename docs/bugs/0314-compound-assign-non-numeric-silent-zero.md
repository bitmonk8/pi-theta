# Bug 0314 — Compound assignment on a non-numeric `let mut` binding parses clean and silently writes `0` (or `NaN`): `let mut s = "a"` / `s += "b"` leaves `s == 0`, `xs += [2]` leaves `xs == 0`, `s %= "b"` leaves `s == NaN`, and a later `s.length` aborts the theta with a mis-attributed `missing object key` panic

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 because a parse-clean statement replaces a
  string/array/boolean value with the number `0` (or `NaN`) with zero
  diagnostics on any channel, and the corrupted value then flows into
  interpolations, tool arguments and return values while its static type keeps
  asserting the declared one; D2 because the fix needs one adjudication (reject
  non-numeric compound targets at parse, or define `x <op>= e` as `x = x <op> e`
  and route it through the existing operator operand checks) plus a same-commit
  spec sentence, but touches only the reassign type-check arm and/or
  `applyCompound`.
- **Kind:** defect against the `+` operator rule combined with a spec gap.
  `docs/spec_topics/bindings.md:12` makes the five compound forms "all legal on
  `let mut` bindings" with one constraint — the RHS must be `⊑` the binding's
  type — and no sentence anywhere defines the compound forms' evaluation
  semantics. Under the only defensible reading (`x += e` computes `x + e`,
  the operator whose semantics expressions.md §"`+` operator" defines, with
  string+string = concatenation), `s += "b"` must produce `"ab"`; under a
  restrictive reading it must be rejected at parse. The implementation does
  neither: it treats every non-number operand as `0`.
- **Related:**
  - [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md)
    (fixed 0.138.0) — wired the RHS-vs-target `⊑` check (TYPE-9). That check is
    exactly why these probes parse clean: for a string target a string RHS is
    compatible, so the one guard the position has admits the pair the runtime
    then corrupts. Different gap: 0115 checked RHS-vs-target; nothing checks
    target-kind-vs-operator.
  - [0090](./0090-let-mut-reassignment-type-rederivation-unspecified.md)
    (fixed 0.133.0) — pinned that a reassignment does not change the binding's
    static type. That disposition makes this defect worse: after `s += "b"`
    every later reference still types as `string`, so `s.length` is
    parse-legal over a runtime number.
  - [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)
    (fixed 0.39.0) — its `non-object-receiver` gate covers enum/`Result`
    receivers only, so the corrupted number receiver produced here falls
    through to the presence gate and panics with the wrong code (see
    §Actual behaviour, follow-on).
- **Affected** (verified at bc52da38):
  - `src/runtime/statement-executor.ts:591` — `applyCompound`: `const a =
    typeof current === "number" ? current : 0; const b = typeof delta ===
    "number" ? delta : 0;` — every non-number operand is silently coerced to
    `0` before the arithmetic.
  - `src/runtime/statement-executor.ts:1522–1529` — the `case "reassign"` arm:
    routes every compound op through `applyCompound` and discards
    `writeBinding`'s `WriteResult`.
  - `src/parser/type-layer-checks.ts:1679` — the type-layer `case "reassign"`
    arm: judges RHS `⊑` target only (via `checkReassignRhsCompat`,
    `src/parser/type-compat.ts:932`); no arm anywhere judges the compound
    operator against the target's kind, and no synthetic `x + e` expression is
    formed, so `theta/parse/mixed-plus-operands` / the numeric-operand rules of
    expressions.md §"Other arithmetic" never see the pair.
- **Observed at:** 0.287.0 (bc52da38), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`), the tests/non-object-receiver-gate
  pattern.

## Summary

The five compound assignment forms bypass every operator operand check. The
parse layer's only judgement at the position is RHS `⊑` target (TYPE-9), which
a same-type pair always satisfies, and the runtime's `applyCompound` coerces
any non-number operand to `0`. A string, array, or boolean `let mut` binding
compound-assigned with a same-typed RHS is silently replaced by the number `0`
(`NaN` for `%=` — `0 % 0`), with zero diagnostics. The binding's static type is
unchanged by rule (bug 0090), so later reads type-check against the declared
type while holding an out-of-type number, and the first stdlib read on the
corrupted value aborts the theta with a panic whose code and message describe a
different situation.

## Reproduction

Offline, deterministic; each source is prefixed `---\nmode: prompt\n---\n` and
driven through `executeBody` on the production prompt-mode binding. Parse
diagnostics: `[]` (clean) in every row.

| # | Source (body) | Observed |
|---|---|---|
| P1a | `let mut s = "a"` / `s += "b"` / `s` | `outcome=success value=0` |
| P1b | `let mut s = "a"` / `s -= "b"` / `s` | `outcome=success value=0` |
| P1c | `let mut xs = [1]` / `xs += [2]` / `xs` | `outcome=success value=0` |
| P1d | `let mut b = true` / `b += false` / `b` | `outcome=success value=0` |
| X4 | `let mut s = "a"` / `s %= "b"` / `s` | `outcome=success value=NaN` (JSON `null`) |
| X1 | `let mut s = "a"` / `s += "b"` / `let n = s.length` / `n` | `THREW MissingObjectKeyPanic: missing object key: length` |
| P1e (control) | `let mut n = 1` / `n += 2` / `n` | `outcome=success value=3` |

## Expected behaviour

- `docs/spec_topics/bindings.md:12`: the compound forms are "all legal on
  `let mut` bindings; the RHS must be compatible with the binding's declared or
  inferred type". Nothing restricts the target to numeric kinds, and the only
  semantics the language defines for `+` on two strings is concatenation
  (`docs/spec_topics/expressions.md` §"`+` operator": "On two `string`
  operands, concatenation"). Under that reading P1a must produce `"ab"`.
- For `-=`, `*=`, `/=`, `%=` on strings/arrays/booleans, expressions.md
  §"Other arithmetic" says the underlying operators "accept only numeric
  operands" — written as an expression, `"a" - "b"` is statically rejected.
  The compound spelling of the same computation must not be silently admitted
  and evaluated over fabricated zeros.
- Whatever disposition is chosen, a parse-clean statement must not replace a
  value with a constant of a different type while emitting nothing on any
  channel.

## Actual behaviour / root cause

`applyCompound` (`src/runtime/statement-executor.ts:591`) implements every
compound op over `typeof current === "number" ? current : 0` and the same for
the delta, so any non-number operand participates as `0`. The parse layer never
forms the implied binary expression, so the operator operand checks
(`mixed-plus-operands`, the numeric-only rule for `-`/`*`/`/`/`%`) cannot fire;
the only check at the position, `checkReassignRhsCompat`
(`src/parser/type-compat.ts:932`), passes because the RHS matches the target's
type. Follow-on: the corrupted binding violates its own static type, so
member/method reads that are parse-legal for the declared type dispatch on a
number at runtime — `applyStdlibMethod`
(`src/runtime/statement-executor.ts:974`) returns for a string/array/object
receiver only, and the member path's presence gate raises
`theta/runtime/missing-object-key` (X1), a code whose registered trigger is an
absent theta-side name on an object value, not a number receiver.

## Why it matters

A one-character author slip (`+=` for `=` before a `.concat`, or a C-style
`s += suffix` string append — idiomatic in every neighbouring language) turns a
string or array pipeline value into `0` and the theta keeps running,
interpolating `0` into prompts, tool arguments, and final values. There is no
diagnostic at parse, none at the write, and the eventual failure (if any)
carries a misleading panic. This is the highest-impact class: silent wrong
values with author intent dropped.

## Non-goals

- Choosing between the two remedies (reject at parse vs desugar-and-check) —
  §Fix lists both; either needs a one-sentence spec addition to bindings.md.
- The `writeBinding` result being discarded at the reassign site
  (`statement-executor.ts:1529`) — unreachable while the parse gate holds;
  noted only as context.
- Runtime numeric-kind belts for other operators — expression-position binary
  operators are statically gated already.

## Fix

Not yet decided between:

1. **Parse-time restriction** — a `type`-phase check on the reassign arm: a
   compound op whose target's recorded type is not `integer`/`number` (with
   `+=` additionally admitting `string`, if concatenation is wanted) draws a
   registered code (DIAG-2 decision: widen `reassign-rhs-type-mismatch`'s
   trigger or mint a row). Smallest blast radius; makes P1a a load failure.
2. **Desugaring semantics** — define `x <op>= e` as `x = x <op> e` in
   bindings.md, route the pair through the existing operator checks at parse
   (so `-=`/`*=`/`/=`/`%=` on strings red as non-numeric, `+=` on strings
   loads), and fix `applyCompound` to apply the real operator semantics
   (string `+` concatenates) instead of zero-coercing.

Either way `applyCompound`'s `: 0` coercions must go; a non-number reaching a
numeric compound at runtime after the gate should be a loud defect, not a `0`.
Any fix must keep the numeric control (P1e) byte-identical.

## Provenance

Found by reading `applyCompound` against bindings.md:12 during the
runtime-mutation hunt at bc52da38; all seven rows probed offline through the
production executor harness before filing. Scratch probes deleted.
