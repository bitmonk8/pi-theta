# Bug 0393 — A stdlib method call on a laundered `number`/`boolean`/`null` receiver silently evaluates to `null` on both hosts: `f(5)` for `fn f(x) { x.toUpperCase() }` binds `null` with zero diagnostics — while the identical receiver under INDEX access is the registered `theta/runtime/non-object-receiver` rejection, under MEMBER access panics loudly, and the resolvable spelling is parse-refused `theta/parse/unknown-method`

- **Status:** open.
- **Kind:** spec gap with a hazardous implementation disposition.
  `docs/spec_topics/expressions.md:122` prescribes parse-time refusal for
  unknown members ("Anything not on this list is `theta/parse/unknown-method`
  rather than a runtime failure") and, since bug 0315, signature refusal "when
  the receiver's static type is resolvable — never a JS-coerced runtime
  value"; no sentence anywhere gives a runtime disposition for a method call
  whose RECEIVER kind carries no stdlib surface at all (number/boolean/null)
  after the parse layer deferred. Both dispatchers fill the silence with an
  unconditional `return null` — a fabricated value on the production path.
- **Related:**
  - 0027 (fixed 0.39.0) — gated the same two dispatchers for enum/`Result`
    receivers with the registered `theta/runtime/non-object-receiver`
    rejection. Its fix covers only receivers satisfying JS
    `typeof "object"`; the primitive/null fall-through below the gate was
    outside its measured class and is byte-identical pre/post.
  - 0032 (fixed 0.42.0) — its §evidence cites the fall-through
    (`:927` "inert `null`") as implementation context only; no report owns it.
  - 0315 (fixed 0.294.0) — the same dispatchers' ARGUMENT surface (arity
    belt). Its parse half defers on an unresolvable receiver by design
    ("the parse layer still defers a statically-unresolvable receiver"), which
    is the door into this class.
  - 0366 (fixed 0.349.0) — the `join` element belt in the array arm one
    dispatch level down; established that a receiver-property precondition the
    parse gate deferred on is a loud runtime defect, not a silent value.
  - 0369 (fixed 0.350.0) — the "parse gate defers → runtime fabricates" family
    head; this is the same shape at the method-call receiver position.
  - 0314 (fixed 0.293.0) — its row X1 documents the MEMBER-position contrast
    (`.length` on a laundered number → mis-attributed `MissingObjectKeyPanic`,
    loud); the method-CALL position measured here is silent instead.
- **Affected** (verified at d63c5148, v0.382.0):
  - `src/runtime/statement-executor.ts:1351-1365` — `applyStdlibMethod`:
    string arm, array arm, object arm (with the 0027 gate at `:1358-1361`),
    then `return null` (`:1364`) for everything else — a `number`, `boolean`,
    or `null` receiver yields the inert `null` with no diagnostic. The
    docstring above it (`:1341`) states the disposition: "a
    non-string/array/object receiver yields the inert `null`."
  - `src/extension/production-theta-producer.ts:7868-7886` — the pure host's
    `evaluateStdlibMethod`: byte-identical arms, `return null` at `:7885`;
    serves `${…}` interpolations and invoke arguments.
  - `src/parser/type-layer-checks.ts:3637-3641` — `checkMethodCall`: "A
    statically-unresolvable receiver defers to the runtime safety net (no
    diagnostic)" (`classifyReceiver` → `"unknown"` → return). The deferral is
    correct; the "safety net" it names is the `return null` above — for these
    receiver kinds, no net exists.
  - Contrast sites, same receiver kinds: `src/runtime/runtime-panics.ts`
    `evaluateIndexAccess` (primitive receiver → `nonObjectReceiverRejection`,
    registered code) and `evaluateMemberAccess:343-352` (`null` receiver →
    `NullMemberAccessPanic`; number receiver → `assertKeyPresent` panic).
- **Observed at:** 0.382.0 (d63c5148), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`).

## Summary

The receiver-kind matrix at the three read positions is complete except for
one cell. Index access on a laundered primitive receiver rejects with the
registered `theta/runtime/non-object-receiver` (bug 0027); member access on
`null` panics `null-member-access` and on a number panics (mis-attributed but
loud — bug 0314 X1); enum/`Result` method calls reject via the 0027 gate; a
resolvable primitive's method call is parse-refused `unknown-method`. The one
remaining cell — a method CALL on a laundered `number`/`boolean`/`null`
receiver — falls off the end of both dispatchers and silently evaluates to
`null`. The call's arguments are fully evaluated first (their effects run),
then the result fabricates. `null` then reads as a legitimate absent-ish value
downstream (`v == null` → `true`), indistinguishable from an authored `null`.

## Reproduction

Offline, deterministic; sources prefixed `---\nmode: prompt\n---\n`, driven
through `executeBody` on the production prompt-mode binding. Parse
error-diagnostics `[]` except B5.

| # | Source (body) | Observed |
|---|---|---|
| B1 | `fn f(x) { x.toUpperCase() }` / `f(5)` | `outcome=success value=null` |
| B2 | `fn f(x) { x.trim() }` / `f(true)` | `outcome=success value=null` |
| B3 | `fn f(x) { x.keys() }` / `f(null)` | `outcome=success value=null` |
| B4 | `fn f(x) { x.join(",") }` / `f(5)` | `outcome=success value=null` |
| F6 | `fn f(x, a) { x.startsWith(a) }` / `f(null, "n")` | `outcome=success value=null` — a boolean-returning member fabricates `null` |
| B9 | `fn f(x) { x.trim() }` / `let v = f(5)` / `v == null` | `true` — indistinguishable from authored `null` |
| B5 (control) | `let n = 5` / `n.trim()` | `PARSE ["theta/parse/unknown-method"]` |
| B6 (contrast) | `fn f(x) { x[0] }` / `f(5)` | `THREW NonObjectReceiverError: non-object receiver: cannot read [0] on a number` |
| B7 (contrast) | `fn f(x) { x.length }` / `f(5)` | `THREW MissingObjectKeyPanic: missing object key: length` (loud; mis-attribution is 0314 X1's documented residue) |
| B8 (contrast) | `fn f(x) { x.length }` / `f(null)` | `THREW NullMemberAccessPanic: null member access: .length` |

B3 vs B8 is the sharpest pair: the same `null` receiver panics under member
access and silently satisfies a method call.

## Expected behaviour

- `expressions.md:122` frames stdlib misuse as refusal, "never a JS-coerced
  runtime value"; `docs/spec_topics/bindings.md` gives `null` no
  member/method surface anywhere. A method call on a receiver kind that
  carries no stdlib table has no conforming value-producing disposition.
- Per the settled belt discipline (0332/0338/0366/0368/0369) and the in-family
  precedent at the index position (0027's registered rejection), a laundered
  wrong-kind receiver reaching the dispatcher must abort loudly — either the
  existing registered `theta/runtime/non-object-receiver` (widened to the
  method-call read on primitives/null, matching the index arm) or a loud
  defect routed to `theta/runtime/internal-error`. Never a fabricated `null`.

## Actual behaviour / root cause

Both dispatchers classify by JS `typeof`: string → string members, array →
array members, `typeof "object" && !== null` → the 0027 gate + object
members. `number`, `boolean`, and `null` match no arm and hit the terminal
`return null` (`statement-executor.ts:1364`,
`production-theta-producer.ts:7885`) — a deliberate inert sentinel from the
V3f/V3g scaffolding era whose docstring survived into the production
dispatch. The 0027 fix added the enum/`Result` gate INSIDE the object arm and
never touched the fall-through below it; 0315 added the arity belt INSIDE the
three member evaluators, which these receivers never reach.

## Why it matters

`x.trim()` / `x.toUpperCase()` / `x.keys()` on a value that arrived through an
untyped helper is the ordinary defensive-normalisation idiom; when the value
is unexpectedly a number/boolean/null the author gets a silent `null` that
reads as "no value", steering null-checks and flowing into interpolations
(`null` renders as the text `null`) and invoke args with zero diagnostics.
The disposition also disagrees with every sibling position (B6/B7/B8), so the
same wrong receiver produces four different behaviours depending on spelling.
Impact class 1.

## Non-goals

- The enum/`Result` receiver gate — bug 0027's, correct and untouched.
- The MEMBER-access mis-attributed panic on a number receiver (B7) — bug 0314
  X1's documented follow-on; loud, distinct mechanism.
- The parse deferral on unresolvable receivers — correct and kept (the
  runtime value may be a genuine string/array/object).
- Unknown member NAMES on laundered receivers of the right kind — already
  loud (raw `Error` → internal-error, the dispatchers' `default` arms).

## Fix

Replace the fall-through `return null` in BOTH dispatchers with a loud
rejection. Two candidate dispositions:

1. **Widen `theta/runtime/non-object-receiver`** (the 0027 pattern) to the
   method-call read on primitive/`null` receivers — symmetrical with the index
   arm (`evaluateIndexAccess` already rejects primitives with this code), best
   operator message (`cannot call .trim() on a number`), needs a DIAG-2
   Trigger widening. Registry caveat: `GatedReceiverKind`
   (`src/runtime/runtime-panics.ts:123-128`) is the closed five-value set
   `an enum value | a Result value | a string | a number | a boolean` — no
   `null` member, and `gatedReceiverKind()` returns `undefined` outside it —
   so the B3/B8 `null` receiver needs a sixth kind plus a
   `placeholder-rendering-b.md` §7 closed-enum amendment (the `<receiver
   kind>` table is GOV-7/GOV-8-versioned), not only the DIAG-2 Trigger
   widening.
2. **Loud defect** (`StdlibReceiverKindDefectError extends Error` →
   `surfaceUnexpectedThrow` → `theta/runtime/internal-error`) — the
   0366/0368/0369 belt family, no registry work.

Option 1 is recommended: the registry row exists, its concept ("receiver kind
outside the read surface") matches exactly, and the index-position precedent
argues the spellings should agree. Constraints: string/array/object receivers
byte-identical; the 0027 gate untouched; both hosts in lockstep; one
same-commit spec sentence naming the laundered-receiver runtime disposition
at expressions.md:122.

## Provenance

Found by reading `applyStdlibMethod`'s fall-through against the sibling
`evaluateIndexAccess`/`evaluateMemberAccess` dispositions during the
runtime-belts-3 sweep at d63c5148. All ten rows probed offline through the
production executor harness before filing. Scratch probes deleted.
