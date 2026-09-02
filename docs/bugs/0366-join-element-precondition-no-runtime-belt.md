# Bug 0366 — `array.join` on a laundered receiver silently JS-coerces non-string elements against the spec's "no implicit type conversion" rule: `f([1, 2])` → `"1,2"`, objects render `"[object Object]"`, `null` elements render `""`, and nested arrays flatten — where the identical direct spelling is parse-refused `theta/parse/non-string-array-join`

- **Status:** fixed (0.349.0).
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

## Fix (0.349.0)
- What shipped:
  - `src/runtime/stdlib-array.ts` — runtime element belt in `evaluateArrayMember`'s `join` arm: walks the receiver (`typeof element !== "string"`) before host `Array.prototype.join` and throws a new `StdlibJoinElementDefectError` (a plain `Error`, defined in this file to keep the change in the owned set) on the first non-string element, routed through the existing `surfaceUnexpectedThrow` → `theta/runtime/internal-error` exactly as the 0315 arity belt is; the false parse-gate guarantee comment corrected to the truthful "resolvable-only" scoping; 0315 arity belt and `includes`/`indexOf`/`slice`/`concat`/`length` arms byte-identical; NO new registry row.
  - `docs/spec_topics/expressions.md` — one sentence added to the `join` row naming the laundered-path runtime disposition (`theta/runtime/internal-error`), LF preserved, no other line touched.
  - `tests/live/withheld-binder-provenance-live-cell.test.ts` — bug 0143's live witness CLEAN-half carrier re-anchored integer→string under parent ratification (see §Ratification); subject preserved, no assertion changed.
- Gates: witness `npx vitest run tests/b0366-join-element-laundered-belt.test.ts` 11/11 green (7 flips B1–B4/ENUM/PI/PInvoke, 4 controls B5/ALLSTR/EMPTY/ARITY); full default suite `npx vitest run` 529 files / 9986 tests green (528/9975 premeasure + this fix's 1 file / 11 tests); `npm run typecheck` clean; `npm run lint` clean; live `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/withheld-binder-provenance-live-cell.test.ts` 1/1 green under the shared lock.
- Review: 1 round — `bug-fix-reviewer` CLEAN. One prose residual (R1: class doc-comment "the runtime walk below" → "the runtime walk in the `join` arm above") fixed as comment-only gate-diff polish; confirmation review round skipped (comment-only hunk, gates re-run green).
- Verification: PASS on all four obligations — (1) the witness reds for the right reason under a temporary belt neutralisation (all 7 flips RED naming their coerced value, byte-exact restore proven via `git diff --stat`, green after); (2) full suite 529/9986 green; (3) the fixed seam is exercised end-to-end by the re-anchored b0143 live cell, run under the lock (1/1 green) — a withheld-element join reaching the runtime belt boundary through a real drive; the string element means the belt does not fire and the drive stays clean; (4) typecheck + lint clean.
- Residuals: the OLD integer carrier's would-red (had it shipped unchanged against this belt) is proven OFFLINE by the b0366 witness B1 row — an integer-element laundered join throws at the belt; no live red-proof run is owed (parent ratification condition 2). No other residual.
- Discharge notes appended: `docs/bugs/0143-withheld-sentinel-author-twin-and-render-leakage.md` — a dated note recording the ratified carrier re-anchor; body untouched.
- Pinned dispositions / non-goals: wrong-TYPE arguments (0315 arity-only belt) untouched; parse-gate dispositions kept (0127 judge-and-refuse for provably-unresolvable elements; 0089/0127/0205 withheld receiver/element deferrals); `includes`/`indexOf`/`slice`/`concat` remain unbelted (their semantics carry no coercion). Boxed-`String` enum carriers REFUSE at the belt per the recorded parent adjudication.

### Ratification (parent, verbatim)
The b0143 cell's SUBJECT is withheld-binder parse PROVENANCE — a match-arm binder's element type is withheld, the join gate defers, the theta loads clean and drives. The integer carrier's runtime coercion to "1" is incidental scaffolding of the pre-0366 premise, not the subject. Swapping the CLEAN half's carrier to a string-element binder (`match "hi" { x => [x] }.join(",")` → element "hi", still a withheld match binder, still parse-deferred, still loads clean, still drives clean) preserves the withhold subject exactly while removing the reliance on the coercion the adjudicated belt forbids. Model class: the 0292 (D)-row-v2 / 0347 row-H vehicle-collateral re-anchor; Option B (documented red on a FIXED bug's witness) rejected — the campaign retired that pattern with 0340. FLIP SET = EXACTLY this one live cell. Any FURTHER un-enumerated red ⇒ STOP again.

### Flip-census correction to §Fix / §Reproduction
The doc's premeasure premise of zero committed-cell flips was incomplete: the b0143 live witness's CLEAN half (`match 1 { n => [n] }.join(",")`) was the one un-enumerated LIVE-cell flip — a withheld-element (`containsWithheldBinderType`) join whose runtime integer coercion to "1" this belt converts to a loud defect. Per the ratification it was re-anchored to a string carrier (Option A), not shipped as a documented red on a fixed bug's witness.

### Orchestrator self-authorization (recorded)
Before review round 1, the orchestrator applied one bounded citation/comment-only correction to its own owned witness file `tests/b0366-join-element-laundered-belt.test.ts`: the header cited `stdlib-array.ts:98-99`/`:96` and quoted the false-guarantee comment the fix removed. Evidence: `git diff` (join arm moved off 98-99, comment at 96 rewritten), `grep` (join `return` now at line 106, `case "join"` at 101), and the implementer's own flag. Bound: header comment block only; no `it`/`expect`/executable line touched. STOP valve honoured (no further file redded; bound not exceeded).
