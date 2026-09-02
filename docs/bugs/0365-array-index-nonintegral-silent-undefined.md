# Bug 0365 — A fractional or NaN array index passes the runtime bounds check and silently fabricates an out-of-model value: `xs[1.5]` and `xs[0 / 0]` load clean, bind raw JS `undefined`, and read back as `null`, while `[xs[1.5]] == [null]` is `false` on a value that prints `[null]`; a string index on an array panics with a message asserting a falsehood

- **Status:** fixed (0.357.0).
- **Sev/Diff estimate:** S1/D2 — S1 because a parse-clean spelled expression
  (`xs[1.5]`, `xs[0 / 0]`) silently fabricates a value instead of panicking or
  being refused: the binding holds raw JS `undefined` (a value bindings.md says
  the language does not have), identifier reads launder it to `null`, and once
  it escapes into a composite it is observably neither `null` nor equal to
  itself-as-printed (`[xs[1.5]] == [null]` → `false` while both stringify
  `[null]`) — the bug-0032 out-of-model class re-opened on the index path. D2
  because the fix needs one adjudication (extend the `index-out-of-bounds`
  panic trigger to non-integral/NaN indices vs mint a registered rejection) plus
  a spec sentence, applied at one shared enforcement site
  (`evaluateIndexAccess`) and the two hosts' index-key coercion.
- **Kind:** spec gap with a hazardous implementation disposition, plus one
  defect-class lying diagnostic. `docs/spec_topics/expressions.md:10` prescribes
  the runtime disposition only for `i < 0` or `i >= arr.length`
  (`theta/runtime/index-out-of-bounds`) and prescribes an index-type rule only
  for **object** receivers ("the index expression must be of type `string`");
  no sentence anywhere gives an array index a static integer requirement or a
  runtime disposition for a numeric index that addresses no element (`1.5`,
  `NaN`). `docs/spec_topics/bindings.md:10` ("Theta has no `undefined` value")
  and the closed panic list in
  `docs/spec_topics/errors-and-results/error-model.md:65` leave no conforming
  reading under which the observed silent fabrication is correct.
- **Related:**
  - 0032 (fixed 0.42.0) — closed the absent-**member**-binds-`undefined` feeder
    with a presence gate; this is the sibling feeder on the array-index arm
    (bounds check instead of presence gate), which 0032's fix did not touch.
    0032's §Summary documents the same downstream absurdities (`== null` false)
    for the member spelling.
  - 0027 (fixed 0.39.0) — minted `theta/runtime/non-object-receiver` for
    receiver kinds the static layer is blind to; the fix pattern (registered
    non-panic runtime rejection) is one of the two candidate dispositions here.
  - 0315 (fixed 0.294.0) — the laundered-receiver belt precedent
    (`StdlibMethodArgumentDefectError`) for gaps the static layer defers on.
  - [0325](./0325-nan-max-zero-workers-fabricated-ok-null-array.md) (fixed)
    — same mechanism at a different site: IEEE-754 unorderedness defeats an
    ordered guard (`NaN` evades the `Math.max(1, …)` floor → fabricated
    `Ok(null)` array).
  - Silent-JS-coercion belt family:
    [0332](./0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md)
    — spelled arithmetic over non-numeric operands has no parse gate;
    [0338](./0338-pure-host-arithmetic-non-numeric-operands-no-runtime-belt.md)
    — pure-host arithmetic over non-numeric operands has no runtime belt;
    [0314](./0314-compound-assign-non-numeric-silent-zero.md) — compound
    assignment on non-numeric operands settles a silent zero.
  - `[bug 0368](./0368-plus-and-ordering-laundered-operands-silent-js-coercion.md)` and `[bug 0369](./0369-control-flow-runtime-kind-fallbacks-silent.md)` —
    siblings in the shared laundered-coercion family; the overlap with this
    report is rows H2/H3 only (a laundered index reaching a coercion); the
    core class here (`xs[1.5]`, `xs[0 / 0]`) is fully concrete and needs no
    laundering.
- **Affected** (verified at af476df2, v0.347.0):
  - `src/runtime/runtime-panics.ts:259-268` — `evaluateIndexAccess`'s array
    arm: `const i = index as number; if (typeof i !== "number" || i < 0 || i >=
    target.length) throw IndexOutOfBoundsPanic; return target[i]`. `1.5` and
    `NaN` satisfy neither ordered comparison (`NaN < 0` and `NaN >= len` are
    both `false`), so both fall through to `target[i]`, a JS element read of an
    absent property — raw `undefined` returned as a `ThetaValue`.
  - `src/runtime/runtime-panics.ts:263` — the same guard's `typeof i !==
    "number"` arm: a **string** index on an array receiver throws
    `IndexOutOfBoundsPanic` whose message interpolates the string through
    `renderInteger`, producing `index out of bounds: 1 not in 0..3` for
    `xs["1"]` — an assertion that is false of the integer 1 the message names
    (see §Actual, row H1).
  - `src/runtime/statement-executor.ts:881` — the executor's index arm coerces
    every non-number index with `String(index.value)` before calling
    `evaluateIndexAccess`, so a laundered boolean/null object index reads the
    key `"true"`/`"null"` (row H3) and a laundered string array index takes the
    lying-panic path above.
  - `src/extension/production-theta-producer.ts:7209-7214` — the pure host's
    index arm applies the identical `String(index)` coercion.
  - `src/extension/production-theta-producer.ts:7176` and
    `src/runtime/lexical-environment.ts:724` — the ident-read arms
    (`resolution.value ?? null`) that launder the bound `undefined` to `null`
    on direct reads, which is why the corruption is silent rather than loud.
  - `src/parser/type-layer-checks.ts:3563-3585` — `checkIndex`: the only two
    static checks at an index site are `checkIndexReceiver` (receiver kind) and
    `checkObjectIndex` (string index on **object** receivers). No arm judges
    the index expression of an **array** receiver, so `xs[1.5]`, `xs[0 / 0]`,
    and `xs["1"]` are all parse-clean with fully concrete static types — no
    laundering needed.
- **Observed at:** 0.347.0 (af476df2), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`), the b0314/b0316 pattern.

## Summary

The runtime array-index guard implements the spec's "outside `0..arr.length`"
trigger as two ordered comparisons. A fractional index (`1.5`) sits between
the bounds and `NaN` is unordered against both, so both evade the panic and
the read returns JS `undefined` — a value outside the theta value model. The
static layer never constrains an array receiver's index expression (only
object receivers get an index-type rule), so the offending spellings are
parse-clean with concrete types; no laundering through untyped params is
needed. Direct identifier reads mask the corruption by null-coalescing
(`?? null`), but the raw `undefined` escapes intact into composites, where it
is neither `null` nor equal to the `null` it prints as. A string index on an
array receiver takes the guard's `typeof` arm instead and panics
`index-out-of-bounds` with a message that renders the string
indistinguishably from an in-range integer and therefore asserts a falsehood.

## Reproduction

Offline, deterministic; each source prefixed `---\nmode: prompt\n---\n` and
driven through `executeBody` on the production prompt-mode binding. Parse
error-diagnostics are `[]` in every row except as noted.

| # | Source (body) | Observed |
|---|---|---|
| A1 | `let xs = [1, 2, 3]` / `let y = xs[1.5]` / `y` | `outcome=success value=null` (read laundered) |
| A2 | same / `y == null` | `true` |
| A3 | `let y = xs[0 / 0]` / `y` | `outcome=success value=null` |
| A5 | `fn f(a, i) { a[i] }` / `f([1, 2, 3], 1.5)` | `outcome=success`; the fn-return path settles the RAW JS `undefined` terminal value (no `?? null` on that path), not `null` |
| A8 | `let ys = [xs[1.5]]` / `ys` | success; JS value is `[undefined]`, JSON prints `[null]` |
| A9 | `let ys = [xs[1.5]]` / `ys == [null]` | **`false`** — the value that prints `[null]` is not equal to `[null]` |
| A4 | `let xs = [[1], [2]]` / `let y = xs[1.5]` / `y[0]` | `THREW NullIndexAccessPanic: null index access: [0]` — a panic whose registered trigger is a `null` receiver, fired by a receiver that was never `null` |
| A6 (control) | `xs[5]` | `THREW IndexOutOfBoundsPanic: index out of bounds: 5 not in 0..3` |
| H1 | `let xs = [1, 2, 3]` / `xs["1"]` | `THREW IndexOutOfBoundsPanic: index out of bounds: 1 not in 0..3` — parse-clean; the message names integer 1, which IS in 0..3 |
| H2 | `fn f(a, k) { a[k] }` / `f([1, 2, 3], "1")` | same lying panic |
| H3 | `schema P { a: integer }` / `fn f(o, k) { o[k] }` / `f(P { a: 7 }, true)` | `THREW MissingObjectKeyPanic: missing object key: true` — the boolean was silently `String()`-coerced to a key |

## Expected behaviour

- `docs/spec_topics/expressions.md:10`: an array index "outside
  `0..arr.length`" panics `theta/runtime/index-out-of-bounds`. `1.5` and `NaN`
  address no element of `0..arr.length` under any integer-range reading, and
  no other disposition is prescribed, so the natural conforming behaviours are
  the panic (widened trigger) or a registered runtime rejection — never a
  fabricated value.
- `docs/spec_topics/bindings.md:10`: "Theta has no `undefined` value" — no
  evaluation may bind one.
- `docs/spec_topics/errors-and-results/error-model.md` §Runtime panics: panic
  messages are normative templates; a message must not assert `<i> not in
  0..<length>` for an `<i>` rendering that satisfies the asserted range
  (row H1), and `null index access` must not fire for a non-`null` receiver
  (row A4).

## Actual behaviour / root cause

`evaluateIndexAccess`'s array arm (`runtime-panics.ts:259-268`) bounds-checks
with `i < 0 || i >= target.length`, which `1.5` fails to trigger numerically
and `NaN` evades by IEEE-754 unorderedness; `target[i]` then reads an absent
JS property and returns `undefined`. Downstream, ident reads null-coalesce
(`production-theta-producer.ts:7176`, `lexical-environment.ts:724`) so the
value masquerades as `null` on direct identifier reads (A1–A3) — the
fn-return path has no such coalesce, so A5 settles the raw `undefined`
itself — but composite
construction (`evalExpr`'s array arm) stores the raw `undefined` (A8), where
`valuesEqual(undefined, null)` is `false` (`value.ts` primitive arm:
`a === b`) — producing A9's print/compare divergence. A member/index read
**through** the laundered `null` (A4) panics `null-index-access`, attributing
a `null` receiver the program never produced. The `typeof i !== "number"` arm
shares the OOB panic with genuinely out-of-range integers, so a string index
renders `renderInteger("1")` → `1` and emits a range assertion that is false
(H1/H2). The executor's `String(index.value)` coercion (`statement-executor.ts:881`)
manufactures object keys from non-string indices (H3) — the spec's
object-index rule is parse-only and the runtime silently coerces where the
static layer deferred.

## Why it matters

`xs[i]` where `i` is any computed `number` is the ordinary case — an author
computing a midpoint (`len / 2`), an average index, or any `/`-derived value
gets a silent `null`-alike instead of a panic, and the theta keeps running
with it: interpolations render `null`, `invoke` args carry `null`, and
equality behaves absurdly once the raw `undefined` reaches a composite. The
panic that eventually fires (if any) names a `null` receiver or an in-range
index, sending the author to the wrong site. This is impact class 1 (silent
wrong value with zero diagnostics on any channel).

## Non-goals

- The static-layer question of whether `xs[1.5]` / `xs["1"]` should be refused
  at parse (an `integer`-index rule for array receivers) — desirable but a
  separate DIAG-2 adjudication; the runtime disposition must be fixed
  regardless because laundered indices (A5/H2/H3) bypass any static gate.
- The ident-read `?? null` launder itself — it is load-bearing for `let _`
  discards; only the feeder must be closed.
- The member-access spelling — closed by bug 0032.

## Fix

Adjudicated (parent, settled): **OPTION 1 — widen the panic trigger.** In
`evaluateIndexAccess`'s array arm a non-integer (`!Number.isInteger(i)`) or
non-number index panics `theta/runtime/index-out-of-bounds`, the message
rendering the actual offending value (strings quoted `JSON.stringify`-style,
the 0300 precedent, so H1's lie dies), with same-commit spec sentences defining
the trigger as "not an integer in `0..arr.length`". The closed panic list stays
closed; no taxonomy fork — `xs[5]` and `xs[1.5]` are one concept (the index
addresses no element), against the 0326 anti-fork law. The object-index
`String()` coercion at BOTH hosts is REMOVED: a non-string/non-number index the
parse gate deferred on throws a loud belt (plain `Error` via
`surfaceUnexpectedThrow` → `theta/runtime/internal-error`, the
0332/0338/0368/0369 belt family) — not a manufactured key, not a new registry
row. Option 2 (a registered rejection) was rejected: it forks the index-miss
taxonomy against 0326.

## Fix (0.357.0)

- **What shipped** (keyed to §Fix):
  - `src/runtime/runtime-panics.ts` — `evaluateIndexAccess`'s array arm widened:
    reads `target[index]` only when `Number.isInteger(index) && index >= 0 &&
    index < target.length`, else throws `IndexOutOfBoundsPanic`; new module-local
    `renderIndexOperand` renders the offending value (string → `JSON.stringify`,
    integer → `renderInteger` byte-identical, non-integer number → decimal). `-0`
    is an integer and still reads element 0. Two contract docstrings updated to
    the widened trigger.
  - `src/runtime/statement-executor.ts` — new `export class IndexKindDefectError
    extends Error` (plain `Error`, reframed via `surfaceUnexpectedThrow` →
    `theta/runtime/internal-error`, the b0368/b0369 sibling); the index arm drops
    the `String()` coercion and throws it for a non-number/non-string key.
  - `src/extension/production-theta-producer.ts` — imports `IndexKindDefectError`;
    the pure-host index arm belts byte-identically (both hosts lockstep, no
    coercion).
  - `docs/spec_topics/expressions.md` — the array-index runtime-panic sentence
    widened to "not an integer in `0..arr.length`" (parent-named same-commit
    edit).
  - `docs/spec_topics/diagnostics/code-registry-runtime.md`,
    `docs/spec_topics/errors-and-results/error-model.md` — the
    `index-out-of-bounds` Trigger column and closed-list entry propagated to the
    widened trigger (DIAG-2 same-commit consistency: one trigger stated in three
    co-located sites; error-model.md declares the registry authoritative on
    drift, so a stale row would conformance-defeat the fix).
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md` — category-4 `<i>`
    exception at `index-out-of-bounds` (the widened trigger makes a non-integer /
    `NaN` / quoted-string index reachable at `<i>`, which the prior "unreachable
    by construction" clause denied).
  - `tests/b0365-index-kind-belt.test.ts` — new witness, 23 rows (8 unit + 12
    production-executor + 3 pure-host): 14 flips (A1/A3/A5/A8/A9/A4/H1/H2/H3 +
    unit frac/nan/str + PA/PH3) and 9 controls (A6, `-0`, in-range, genuine
    object string-key; both hosts).

- **Gates (verbatim):**
  - Witness revert-red: reverting the array arm + both host coercions reds 14
    flip rows on their pre-fix signatures (`U-str/H1/H2 'index out of bounds: 1
    not in 0..3'` lying message; `H3/PH3 MissingObjectKeyPanic: missing object
    key: true`; `PA success; sent=["v=undefined"]`); restored byte-exact
    (`git hash-object`: runtime-panics `3de0e13e…`, statement-executor
    `2323fdc5…`, producer `4615f14d…`) → witness 23/23 green.
  - Full default suite `npx vitest run` → 531 files / 10043 tests passed (the
    timeout files under peak parallel load are green isolated — known
    parallel-load flakes, none on the index surface).
  - `npm run typecheck` clean (tsc exit 0); `npm run lint` clean (eslint exit 0).
  - Live (under the shared lock) `... vitest.live.config.ts
    tests/live/b0274live-reserved-keyword-type-head-registration.test.ts` → 1
    passed (7.7s): the adjacent cell whose driven turn computes `700 + xs[0]`,
    exercising the widened `evaluateIndexAccess` array arm with an in-range
    integer on the live executor (byte-identical control). Live census of
    `tests/live/` found ZERO index fixtures with a fractional / string / boolean
    index → no live outcome flips.

- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) → FINDINGS: F1 [spec] the
  widened trigger not propagated to the registry Trigger column + error-model
  closed list; F2 [house-rule] two `runtime-panics.ts` docstrings still narrated
  the old trigger; residuals R1 (expressions.md parenthetical omitted the string
  case), R2/R3 (pre-existing, out of scope), R4 (Phase-5 doc flip). F1 + F2 + R1
  corrected by an orchestrator prose/comment round (every hunk comment or docs
  prose, no executable line; gates re-run green) → confirmation review round
  skipped per the post-polish gate-diff rule.

- **Verification:** `bug-fix-verifier` → VERIFIED. Witness reds-when-reverted
  (14 rows, right reason) and greens-restored byte-exact (no `git stash`); full
  suite green (7 load-timeout files green isolated); lint + typecheck clean;
  belt-disposition + byte-identity + scope spot-checks (a)–(e) all pass.

- **Residuals:**
  1. `<i>` at `theta/runtime/null-index-access` (and the arithmetic non-finite
     paths) can still render `String(NaN)` / `String(Infinity)` for a laundered
     non-finite index (`f(null, 0 / 0)` → `null index access: [NaN]`) —
     byte-identical pre/post this fix, a different arm outside 0365's rows
     (reviewer R2). Follow-up material, not this fix.
  2. A laundered *number* index on an OBJECT receiver still key-coerces inside
     the object arm (`f(P { a: 7 }, 1)` → loud `MissingObjectKeyPanic: missing
     object key: 1` via `assertKeyPresent`'s JS property lookup) — loud, not
     silent, byte-identical pre/post; H3's nearest uncovered neighbour, no test
     pins it (reviewer R3). An in-object-arm kind gate is a separate
     adjudication.

- **Discharge notes appended:** none.

- **Pinned dispositions / non-goals:** the static-layer question (an
  integer-index rule for array receivers) is out of scope (§Non-goals —
  laundered indices A5/H2/H3 bypass any static gate); the ident-read `?? null`
  launder is load-bearing and untouched (§Non-goals — only the feeders close,
  which here are the two host index arms, now belted); the member-access
  spelling is closed by bug 0032.

## Provenance

Found by reading `evaluateIndexAccess`'s bounds arithmetic against
expressions.md:10 during the runtime-exec-2 re-sweep at af476df2; all eleven
rows probed offline through the production executor harness before filing.
Scratch probes deleted.
