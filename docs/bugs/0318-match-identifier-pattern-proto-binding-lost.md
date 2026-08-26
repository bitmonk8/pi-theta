# Bug 0318 — A `match` identifier pattern named `__proto__` binds nothing: `matchPattern`'s `bindings[pattern.name] = value` write lands on the inherited `Object.prototype.__proto__` accessor, the arm still selects, and the arm body's reference to the binding silently evaluates to `null` — the measured half of bug 0210 residual 4's "named by no report" site

- **Status:** open.
- **Sev/Diff estimate:** S2/D1 — S2 because the wrong value is silent
  (`outcome=success`, parse `[]`) but the input class is one exotic
  identifier spelling the case rule deliberately admits, and the arm-selection
  side stays correct; D1 because the landed idiom (`defineRecordField`,
  bug 0119) drops in at one write site with no spec or registry change, and an
  existing report already enumerates the site as its unclaimed remainder.
- **Kind:** defect against the pattern-grammar binding rule.
  `docs/spec_topics/expressions.md:168` (identifier row): "anything; binds the
  value to `x`" — unconditional on the identifier's spelling. The lexical
  grammar admits `__proto__` as an ordinary identifier
  (`[A-Za-z_][A-Za-z0-9_]*`), and the only name rule at binding positions,
  `theta/parse/binding-case-mismatch`, admits a `_` lead (bug 0210's reading of
  `code-registry-parse.md:19`). The written program's binding is therefore
  legal and must bind.
- **Related:**
  - [0210](./0210-remaining-record-writes-reach-the-prototype-slot.md)
    (fixed 0.136.0) — its §Fix residual 4 names this exact write
    (`match-result.ts`'s `bindings[pattern.name] = value`) as one of "three
    further same-idiom writes over author-controlled key spaces … named by no
    report. Unmeasured beyond the idiom match." This report measures it.
    Residual 4's companion read `obj[field.name]` is NOT a live defect — it is
    own-key-guarded by `hasOwnProperty` at `match-result.ts:214` (0210:633
    records the same).
  - [0119](./0119-proto-named-field-silently-dropped.md)
    (fixed 0.132.0) — the parent class and the landed remedy
    (`defineRecordField`, `src/runtime/value.ts:596`-area): a `__proto__`
    string key must be created as an own property, never assigned through the
    inherited accessor.
- **Affected** (verified at bc52da38):
  - `src/runtime/match-result.ts:177`–`:178` — `matchPattern`
    `case "identifier"`: `bindings[pattern.name] = value` on a
    prototype-carrying record (`const bindings: Record<string, ThetaValue> =
    {}` in `evaluateMatch`, fresh per arm). For `pattern.name === "__proto__"`
    the assignment hits `Object.prototype`'s inherited accessor: a primitive
    value no-ops, an object value replaces the record's prototype; neither
    creates an own key.
  - `src/runtime/statement-executor.ts:1173` — `evalMatch` installs arm
    bindings from `Object.entries(chosen.bindings)`, an own-enumerable-key
    walk, so the lost key never reaches `defineLocal` and the arm body's
    reference resolves to no local.
- **Observed at:** 0.287.0 (bc52da38), offline — production executor harness
  (`parseThetaDocument` → `bindPromptConversation` → `executeBody`).

## Summary

Pattern-introduced bindings are accumulated in a plain prototype-carrying
record by unguarded assignment — the 0031/0038/0119/0210 hazard idiom at the
one runtime record-building site those fixes did not convert. An identifier
pattern (bare, or via object-field shorthand) named `__proto__` therefore
matches — identifier patterns match anything — but introduces no binding: with
a primitive scrutinee the `__proto__` setter silently no-ops, with an object
scrutinee it silently swaps the bindings record's prototype. The arm body then
reads the name as `null`.

## Reproduction

Offline, deterministic; body sources under `mode: prompt`, executed via
`executeBody`. Parse diagnostics `[]` in every row.

| # | Source (body) | Observed | Expected |
|---|---|---|---|
| P3a | `let v = match "hello" { __proto__ => __proto__ }` / `v` | `outcome=success value=null` | `"hello"` |
| P3b | `schema P { a: integer }` / `let d = P { a: 1 }` / `let v = match d { __proto__ => __proto__ }` / `v` | `value=null` | `{"a":1}` |
| P3c (control) | `let v = match "hello" { other => other }` / `v` | `value="hello"` | `"hello"` |

(P3b additionally routes an author-controlled object into the record's
prototype slot for the duration of the arm — no further effect was measured,
since `Object.entries` reads own keys only and the record dies with the arm.)

## Expected behaviour

expressions.md:168: an identifier pattern "binds the value to `x`". The arm
body's `__proto__` reference is parse-resolved against that binding (the
pattern introduces it into the arm scope), so the body must evaluate to the
scrutinee value, exactly as the control (P3c) does for any other spelling.

## Actual behaviour / root cause

`matchPattern`'s identifier arm writes through plain assignment into a
`{}`-initialised record; `"__proto__"` is not an ordinary string key on such a
record but an inherited accessor (the 0119 mechanism). The value is dropped
(primitive) or becomes the record's prototype (object); `Object.entries` at
`statement-executor.ts:1173` walks own enumerable keys and finds nothing, so
`defineLocal` is never called for the name and the arm body's identifier read
produces `null` through the pure host's resolution fall-through.

## Why it matters

Small input class, but the failure is fully silent (no diagnostic, no panic,
`outcome=success`) and the mechanism is the exact class three prior fixes
(0119, 0173, 0210) eradicated elsewhere — 0210's reviewer sweep flagged this
site and left it explicitly unclaimed. A model-generated or ported theta using
`__proto__` as a scratch name gets `null` where its author's value belongs.

## Non-goals

- Refusing `__proto__` as an identifier — 0119's settled route is that the
  name survives; the fix is mechanical, not lexical.
- The object-pattern FIELD read path (`obj[field.name]`) — own-key-guarded at
  `match-result.ts:214`; the guarded read of an own `__proto__` data key
  shadows the inherited accessor correctly (verified by code reading against
  the 0119-fixed constructor, which creates the own key via
  `defineRecordField`).
- The `Bindings` record's other consumers — `evaluateMatch`'s per-arm fresh
  record never escapes the match.

## Fix

Convert the one write to the landed idiom: `defineRecordField(bindings,
pattern.name, value)` (import from `./value`), exactly as 0119's six sites and
0210's five. Alternatively initialise the per-arm record as
`Object.create(null)` in `evaluateMatch`; 0119's route adjudication preferred
`defineRecordField` for runtime records so `Object.entries`/own-key consumers
see byte-identical descriptors. One-line change, no registry impact.
Verification: P3a/P3b flip to Expected, P3c stays green, plus one
object-field-shorthand row (`match d { P2 { __proto__ } => __proto__ }` over a
schema declaring `__proto__`) to cover the shorthand spelling of the same
write.

## Provenance

Filed from bug 0210 §Fix residual 4 (site enumerated, unmeasured, "named by no
report"), measured at bc52da38 through the production executor harness during
the runtime-mutation hunt. Scratch probes deleted.
