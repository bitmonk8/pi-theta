# Bug 0366 — `array.join` on a laundered receiver silently JS-coerces non-string elements against the spec's "no implicit type conversion" rule: `f([1, 2])` → `"1,2"`, objects render `"[object Object]"`, `null` elements render `""`, and nested arrays flatten — where the identical direct spelling is parse-refused `theta/parse/non-string-array-join`

- **Status:** open.
- **Sev/Diff estimate:** S1/D1 — S1 because a parse-clean call binds a silently
  coerced string on the production evaluation path with zero diagnostics on
  any channel, and the coerced forms (`"[object Object]"`, `""` for `null`,
  flattened nested arrays) read as plausible pipeline values that then flow
  into interpolations, tool args, and final values; D1 because the fix mirrors
  the already-shipped bug-0315 laundered-receiver belt into the same
  dispatcher (`evaluateArrayMember`'s `join` arm — one element-kind walk, one
  defect class routed through the existing `surfaceUnexpectedThrow` →
  `theta/runtime/internal-error` channel), with no registry adjudication owed.
- **Kind:** defect against the `join` element rule.
  `docs/spec_topics/expressions.md` §"Built-in methods and properties",
  `array<T>` `join` row: "Element type must be `string`; non-string element
  types are `theta/parse/non-string-array-join` (**no implicit type conversion
  in theta 1.0**)". The parse gate fires only when the receiver's element type
  is statically resolvable; a receiver reaching `join` through an unannotated
  `fn` parameter defers, and the runtime dispatcher then hands the array to
  host `Array.prototype.join`, which stringifies every element — exactly the
  implicit conversion the rule forbids.
- **Related:**
  - 0315 (fixed 0.294.0) — the argument-surface sibling. Its fix added the
    laundered-receiver runtime **arity** belt
    (`StdlibMethodArgumentDefectError`) to this same dispatcher; its pinned
    disposition scopes that belt to arity — the shipped code comment at
    `src/runtime/stdlib-string.ts:65` records it: "the belt does not consult
    `params` — arity is its only concern, per the design brief". The `join`
    **element** precondition is not an argument property and was never in
    0315's scope — no belt exists for it.
  - [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md)
    (fixed 0.255.0) — took route (c), prose-only (`src/` byte-untouched),
    and ratified JUDGE-AND-REFUSE for a provably-unresolvable **element**
    type; DEFER holds only for the **receiver**. Its §Pinned dispositions
    states: "A read whose type is merely WITHHELD is out, matching the
    `containsWithheldBinderType` guard." The two doors into this report's
    runtime coerce site are therefore a withheld receiver (all four
    B-rows) and a withheld element (`containsWithheldBinderType`,
    [0205](./0205-withheld-binder-gates-three-sinks-cannot-red.md) cell
    J5) — provably unresolvable elements never reach the runtime.
  - [0125](./0125-index-element-narrowing-not-alias-unfolded.md) (fixed
    0.76.0, at `:798`) and
    [0136](./0136-member-access-types-as-field-name-not-field-type.md)
    (fixed 0.106.0, at `:1332`) — the corpus's prior sightings of this
    exact observable: both record verbatim the `"1,2"` from
    `array<integer>.join(",")` "implicit conversion … theta 1.0 does not
    perform", plus the false `stdlib-array.ts` guarantee comment, as
    symptoms of static-type loss on their own routes; their fixes restored
    static element resolution and left the withheld-receiver route open.
  - 0089 (fixed 0.72.0) — unfolded aliases through the same parse gate and
    pinned the receiver-level defer pair; concrete-receiver behaviour
    (control B5) is its pinned surface and is unchanged by this report.
- **Affected** (verified at af476df2, v0.347.0):
  - `src/runtime/stdlib-array.ts:98-99` — `evaluateArrayMember`'s `join` arm:
    `return receiver.join(args[0] as string)`. The comment above it states the
    guarantee this report falsifies: "The parse-time `checkArrayJoin`
    precondition guarantees a `string` element type, so no implicit conversion
    happens here" — the precondition guarantees that only for
    statically-resolvable receivers.
  - `src/parser/type-layer-checks.ts:3603-3620` — `checkMethodCall`: the
    `join` element gate (`:3603`) runs only when `unfoldAlias(targetType).kind
    === "array"`; a WITHHELD receiver type never satisfies that, so the
    gate defers (the receiver deferral 0089 pinned and 0127 re-pinned) and
    nothing downstream re-checks. The second door: `:3619` withholds the
    element verdict itself — `containsWithheldBinderType(joinElement) ?
    undefined : checkArrayJoin(...)` — the deliberate deferral 0205 pins
    as cell J5.
  - `src/runtime/statement-executor.ts:1131-1146` — `applyStdlibMethod`
    dispatches any runtime array receiver to `evaluateArrayMember`; the
    executor path and the pure host (`evaluateStdlibMethod`,
    production-theta-producer.ts) share the dispatcher, so both paths coerce.
- **Observed at:** 0.347.0 (af476df2), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`).

## Summary

Bug 0127 settled the parse gate: a provably-unresolvable element type is
judged and refused; only a receiver (or element) whose type is merely
WITHHELD defers. Bug 0315 belted the same dispatcher
against wrong-arity laundered calls. Between the two, the element-kind
precondition — the one rule the `join` row states with an explicit
no-implicit-conversion clause — has no runtime enforcement at all: a
correct-arity `join(",")` on a laundered `array<integer>` /
`array<object>` / `array<null>` / `array<array<T>>` receiver reaches host
`Array.prototype.join`, which implicitly stringifies every element
(`String(e)`, with `null` → `""`), and the coerced string binds as the call's
value with zero diagnostics. The direct spelling of every one of these rows is
parse-refused, so the disposition depends on whether the receiver flowed
through an unannotated parameter rather than on the program's meaning.

## Reproduction

Offline, deterministic; each source prefixed `---\nmode: prompt\n---\n`,
driven through `executeBody` on the production prompt-mode binding. Parse
error-diagnostics `[]` except B5. `BodyExecution` exposes the settled value
as `result` (`{present, value}`); the `value=` column below is that inner
`result.value` field.

| # | Source (body) | Observed |
|---|---|---|
| B1 | `fn f(a) { a.join(",") }` / `f([1, 2])` | `outcome=success value="1,2"` |
| B2 | `schema P { a: integer }` / `fn f(a) { a.join(",") }` / `f([P { a: 1 }])` | `outcome=success value="[object Object]"` |
| B3 | `fn f(a) { a.join(",") }` / `f([null, null])` | `outcome=success value=","` (each `null` renders `""`) |
| B4 | `fn f(a) { a.join(",") }` / `f([[1, 2], [3]])` | `outcome=success value="1,2,3"` (nested arrays flattened by JS join) |
| B5 (control) | `let xs = [1, 2]` / `xs.join(",")` | `PARSE ["theta/parse/non-string-array-join"]` |

## Expected behaviour

`docs/spec_topics/expressions.md` `array<T>` `join` row: the element type must
be `string`, with "no implicit type conversion in theta 1.0". A non-string
element reaching `join` at runtime after the parse gate deferred must not be
implicitly converted — per the corpus's settled belt pattern (bugs 0314, 0332,
0338, 0315) it is a loud runtime defect, not a silently coerced value. The
disposition must not depend on whether the receiver was statically resolvable
(B1 vs B5).

## Actual behaviour / root cause

`evaluateArrayMember`'s `join` arm (`stdlib-array.ts:98-99`) trusts a
parse-gate guarantee that holds only for resolvable receivers; the 0127 fix
made the gate defer on unresolvable ones, and the 0315 belt in the same
function checks arity only. Host `Array.prototype.join` then applies JS
element stringification: numbers via `String(n)`, objects via
`Object.prototype.toString` (`"[object Object]"` — the schema brand does not
survive), `null` as the empty string, nested arrays via their own recursive
join (visual flattening). Both evaluation hosts share this dispatcher, so the
executor path and the pure host (interpolations, invoke args) coerce
identically.

## Why it matters

`xs.join(",")` over a list that arrived through an untyped helper `fn` is the
ordinary aggregation idiom. A numeric or object element does not fail — it
silently prints coerced text into the joined string, which then reads as a
legitimate value in prompts and results (`"1,2"` from integers is
indistinguishable from a correct string join). The `"[object Object]"` and
silent-`""`-for-`null` forms corrupt user-visible output with no signal at
parse, none at the call, and none downstream. Impact class 1.

## Non-goals

- Wrong-TYPE **arguments** on laundered stdlib calls (e.g. `join(1)` coercing
  the separator) — bug 0315's fix pinned the runtime belt to arity by design
  brief; re-opening that disposition is not this report's subject. This
  report's subject is the receiver's **element** precondition, which was never
  part of the argument surface.
- The parse gate's dispositions — 0127's ratified judge-and-refuse for
  provably-unresolvable elements, and the withheld-receiver /
  withheld-element deferrals (0089/0127 sentence 2; 0205 cell J5) — all
  kept.
- `includes` / `indexOf` / `slice` / `concat` on laundered receivers — their
  semantics are structural-equality / positional and hold for any element
  type; no coercion occurs there.

## Fix

Mirror the 0315 belt one clause wider in `evaluateArrayMember`'s `join` arm:
before calling the host `join`, walk the receiver and throw a loud defect
(`StdlibJoinElementDefectError extends Error` or a widened
`StdlibMethodArgumentDefectError` sibling, routed through the existing
`surfaceUnexpectedThrow` → `theta/runtime/internal-error`) when any element is
not a JS string. Enum values (boxed `String` carriers) need an explicit
decision: their static type is never `string`, so the parse gate refuses the
resolvable spelling (an enum array reaches the belt only through the
withheld routes) — the belt should refuse them too rather than admit the
carrier's wire text. Keep B5's parse-refusal and every string-element join
byte-identical. No new registry row (internal-error routing per the 0314/0315
precedent); one same-commit sentence in expressions.md's `join` row naming the
laundered-path runtime disposition would close the spec gap.

## Provenance

Found by reading `evaluateArrayMember`'s `join` arm against the `join` row's
no-implicit-conversion clause during the runtime-exec-2 re-sweep at af476df2,
after checking 0315's pinned belt scope (arity-only) and 0127's ratified parse
deferral. All five rows probed offline through the production executor harness
before filing. Scratch probes deleted.
