# Bug 0394 — Correct-arity stdlib calls with wrong-KIND arguments on a laundered receiver silently JS-coerce against expressions.md:122's "never a JS-coerced runtime value" — and `s.replace(n, "z")` with a laundered number/boolean `from` INFINITE-LOOPS the interpreter (`cursor = at + from.length` → `NaN`), wedging the host with unbounded string growth

- **Status:** fixed (0.397.0).
- **Kind:** defect against the stdlib signature rule on the laundered runtime
  path, plus one non-termination hazard.
  `docs/spec_topics/expressions.md:122` (post-0315): "A call on a LISTED
  member whose positional-argument list does not match the member's signature
  above is `theta/parse/stdlib-arity-mismatch` … or
  `theta/parse/stdlib-arg-type-mismatch` …, when the receiver's static type is
  resolvable — **never a JS-coerced runtime value**." The trailing clause
  states the value-level prohibition unconditionally; the runtime belt bug
  0315 installed checks arity only, so a correct-arity call with a wrong-kind
  argument reaching the dispatcher through a laundered receiver hands the raw
  value to the host JS method, which coerces (all rows) or diverges (the
  `replace` `from` position with a number/boolean argument).
- **Related:**
  - 0315 (fixed 0.294.0) — installed the parse arity+type checks (resolvable
    receivers) and the runtime ARITY belt. The belt's arity-only scope is a
    recorded design-brief bound (`stdlib-string.ts:65-66`: "the belt does not
    consult `params` — arity is its only concern, per the design brief") — a
    scope exclusion, not a ruling that wrong-kind args should coerce; no
    filed report owns the wrong-kind runtime class (the 0368 §Related
    precedent for exactly this situation: 0338 excluded `+`/ordering "BY NAME
    as a scope exclusion … no filed report owns" them).
  - 0366 (fixed 0.349.0) — its §Non-goals declined this class by name
    ("Wrong-TYPE arguments on laundered stdlib calls … not this report's
    subject"), leaving it unowned; its fix is the precedent that
    non-arity preconditions in the same dispatchers get belts.
  - The runtime-exec-2 hunt log (wave 1) recorded this class as a false trail
    solely on the pinned-disposition ground — before the `replace`
    non-termination below was known. A pinned "JS semantics" reading cannot
    cover a hang: `replaceLiteral` is the project's OWN scan (written to avoid
    host `replaceAll`), not a documented host-JS behaviour.
  - 0243-family / AGENTS.md hang discipline — the extension host is
    single-threaded; a non-terminating drive wedges the whole pi process.
- **Affected** (verified at d63c5148, v0.382.0):
  - `src/runtime/stdlib-string.ts:182-197` — `replaceLiteral`: with a
    number or boolean `from`, `receiver.indexOf(from, cursor)` coerces and
    matches (`:189`), then `cursor = at + from.length` (`:195`) is `NaN`
    (`(1).length` is `undefined`), and `indexOf(from, NaN)` restarts the scan
    at 0 — the same match forever, `result += … + to` growing without bound.
    Measured bounds of the hang class: `from = null` throws a raw `TypeError`
    (`(null).length`) on a match instead of hanging — loud, surfacing as
    `theta/runtime/internal-error`; `from = [1]` terminates (`[1].length` is
    `1`). Entry:
    `:167` (`replaceLiteral(receiver, args[0] as string, args[1] as string)`).
  - `src/runtime/stdlib-string.ts:156-164` — `startsWith`/`endsWith`/
    `includes`/`split` forward `args[0] as string` into the host methods
    (JS `String()` coercion of the search value).
  - `src/runtime/stdlib-array.ts:106` (`join` separator: `args[0] as string`
    → JS separator coercion), `:119` (`slice`: `args[0] as number` → JS
    ToInteger coercion), `:127` (`concat`: `args[0] as readonly ThetaValue[]`
    → JS `Array.prototype.concat` APPENDS a non-array argument as an element —
    a different operation, not a coercion of the same one).
  - `src/runtime/stdlib-object.ts:155` (`has`: `args[0] as string` →
    JS property-key coercion).
  - The parse gate correctly defers: `checkMethodCall`
    (`src/parser/type-layer-checks.ts:3637-3641`) returns before the signature
    check when the receiver classifies `"unknown"`, so every row below is
    parse-clean.
  - Both hosts share the three member evaluators (`applyStdlibMethod`,
    `statement-executor.ts:1351`; `evaluateStdlibMethod`,
    `production-theta-producer.ts:7868`), so executor and pure host coerce and
    hang identically.
- **Observed at:** 0.382.0 (d63c5148), offline — production executor harness
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`).

## Summary

Bug 0315 split the stdlib argument surface: parse checks (arity + per-argument
type) for resolvable receivers, and a runtime belt — deliberately arity-only —
for laundered ones. The uncovered quadrant is a correct-arity call with a
wrong-KIND argument on a laundered receiver: the dispatcher's `as` casts
forward the raw value into the host method and JS semantics decide the result.
Every string-searching member answers a predicate over the coerced spelling
(`endsWith(null)` is `true` exactly when the receiver ends with the four
characters `null` — the 0315 P2c shape one argument over), `join`/`slice`/`has`
coerce, `concat` silently switches operations (append-as-element), and
`replace` with a number or boolean `from` does not terminate: its literal-scan
loop advances the cursor by `from.length`, which for those kinds is
`undefined`, so the cursor goes `NaN` and the same match is consumed forever
while the result string grows (`null` throws a raw `TypeError` on a match
instead; an array `from` has a `length` and terminates). The theta never completes, no diagnostic fires, and the single-threaded
extension host is wedged (observed: the vitest worker hard-timeout kills the
run; in production there is no timeout on this path).

## Reproduction

Offline, deterministic; sources prefixed `---\nmode: prompt\n---\n`, driven
through `executeBody` on the production prompt-mode binding. Parse
error-diagnostics `[]` in every row except C8.

| # | Source (body) | Observed |
|---|---|---|
| C3 | `fn f(s, a) { s.replace(a, "z") }` / `f("a1b", 1)` | **NON-TERMINATION** — the drive never settles (probe run killed by the 150 s harness timeout; loop confirmed by direct simulation of `replaceLiteral`'s scan: `cursor=NaN` every iteration, `result="azazaz…"` unbounded) |
| C3b | `f("atrueb", true)` (same `f`) | **NON-TERMINATION** — same shape (simulated scan: `cursor=NaN` stable, result unbounded) |
| C3c | `f("anullb", null)` (same `f`) | `THREW TypeError` (`(null).length` on the matched scan) — loud, not a hang |
| C3d | `f("a1b", [1])` (same `f`) | terminates, `value="azb"` — `[1].length` is `1` |
| C1 | `fn f(s, a) { s.startsWith(a) }` / `f("5x", 5)` | `value=true` (search coerced to `"5"`) |
| C9 | `fn f(s, a) { s.endsWith(a) }` / `f("xnull", null)` | `value=true` — content-dependent predicate over the literal `"null"` |
| C10 | `fn f(s, a) { s.includes(a) }` / `f("a1b", 1)` | `value=true` |
| C2 | `fn f(s, a) { s.split(a) }` / `f("a1b", 1)` | `value=["a","b"]` |
| C11 | `fn f(s, t) { s.replace("1", t) }` / `f("a1b", 7)` | `value="a7b"` — a number stringified into the value (terminates; only the `from` position loops) |
| C4 | `fn f(xs, sep) { xs.join(sep) }` / `f(["a", "b"], 1)` | `value="a1b"` |
| C5 | `fn f(xs, a) { xs.slice(a) }` / `f([1, 2, 3], "1")` | `value=[2,3]` |
| C6 | `fn f(xs, o) { xs.concat(o) }` / `f([1, 2], 3)` | `value=[1,2,3]` — the scalar APPENDED as an element |
| C7 | `schema P { a: integer }` / `fn f(o, k) { o.has(k) }` / `f(P { a: 1 }, true)` | `value=false` (key coerced to `"true"`) |
| C8 (control) | `let s = "ab"` / `s.startsWith(5)` | `PARSE ["theta/parse/stdlib-arg-type-mismatch"]` |

## Expected behaviour

- `expressions.md:122`: a call not matching the member's signature is refused
  at parse when resolvable and is "never a JS-coerced runtime value" — the
  unconditional tail the C-rows violate.
- `expressions.md:87` pins `replace` as a total two-string function whose scan
  "seek[s] past the consumed region"; a non-terminating evaluation satisfies
  no reading of it, and no spec sentence anywhere licenses a theta expression
  to hang the interpreter.
- Per the settled belt discipline, a wrong-kind argument the parse gate
  deferred on is a loud runtime defect (the 0366 element belt is the in-file
  precedent), never a coerced value and never divergence.

## Actual behaviour / root cause

The three member evaluators' argument reads are unchecked `as` casts, exactly
as bug 0315 §Affected described — its fix inserted the arity belt above the
switches and deliberately did not extend it to kinds. For `replace`, the
project's own `replaceLiteral` (written to keep `$`-sequences literal) is
correct for strings but assumes `from.length` is a number; a number or
boolean `from` makes the cursor arithmetic `NaN`, and `indexOf(x, NaN)`
treats the position as 0 — a livelock with monotonic memory growth (`null`
throws on the `.length` read instead; an array carries a real `length` and
terminates). The parse
type check cannot help: it runs only for resolvable receivers, and the
laundered receiver withholds it.

## Why it matters

The coercion rows are impact class 1 (silent plausible values steering
predicates and joins — `endsWith(null)` answering content-dependently is
indistinguishable from a real check). The `replace` row is impact class 2
verging on 1: a parse-clean theta that never completes, produces no terminal
outcome, emits nothing on any channel, and pins the extension host's event
loop turn — the worst non-crash failure mode available, reachable from the
ordinary untyped-helper idiom with an integer where a string was meant.

## Non-goals

- Re-litigating bug 0315's ARITY belt or its parse checks — both correct and
  untouched; this report is the wrong-KIND quadrant its design brief bounded
  out, now owed a disposition because the spec sentence (added in the 0315
  era) prohibits the observed values and because one row diverges.
- Wrong-kind arguments on RESOLVABLE receivers — already refused (C8).
- `includes`/`indexOf` on arrays — their `valuesEqual` semantics are total
  over any argument kind (structural false/-1); no coercion occurs (bug 0366
  §Non-goals, confirmed).
- The receiver-kind fall-through (`x.trim()` on a number) — sibling report
  in this batch.

## Fix

Extend the existing runtime belt in the three dispatchers from arity to
argument KIND, reusing the `params` descriptors the signatures already carry
(`"string"` / `"integer"` / `"array"`; the `"element"` descriptor stays
runtime-unchecked — `includes`/`indexOf` are total): after the arity check,
verify `typeof args[i]` (and `Array.isArray` for `"array"`) and throw
`StdlibMethodArgumentDefectError` (widened with an expected-kind field) or a
sibling class, routed through the existing `surfaceUnexpectedThrow` →
`theta/runtime/internal-error`. No new registry row. This closes the hang
(C3 never reaches `replaceLiteral`) and every coercion row in one pattern
already precedented by 0366. Alternative minimal fix (hang only): guard
`replaceLiteral` on `typeof from === "string"` — insufficient, leaves the
nine silent-coercion rows and the operation-switching `concat` untouched.
Constraints: all correct-kind calls byte-identical (the five normative
`replace` vectors, `slice`'s omitted-`end` `undefined`); the 0315 arity belt
and 0366 element belt unchanged; both hosts in lockstep.

## Provenance

Found by sweeping the three member evaluators' `as`-casts for post-0315/0366
residue during the runtime-belts-3 sweep at d63c5148; the C3 hang surfaced
when the probe file's full run hit the vitest hard timeout, isolated by
re-running row-by-row, and confirmed by simulating `replaceLiteral`'s scan
directly (5 iterations, `cursor=NaN` stable, result growing). All rows probed
offline through the production executor harness before filing. Scratch probes
deleted.

## Fix (0.397.0)

- What shipped (settled §Fix — belt arity→kind; belt-law straight case, NO new
  registry row):
  - `src/runtime/runtime-panics.ts` — new `StdlibMethodArgumentKindDefectError
    extends Error`, the bug-0315 arity belt's KIND sibling; its message names
    the method, argument index, expected kind, and actual value
    (`summariseNonResultOperand`); routes through the existing
    `surfaceUnexpectedThrow` → `theta/runtime/internal-error` exactly as the
    arity defect and the 0366 element defect do.
  - `src/runtime/stdlib-string.ts` — new exported
    `assertStdlibArgumentKinds(member, signature, args)` (the shared KIND check
    over the `params` descriptors: `"string"`→typeof string, `"integer"`→typeof
    number, `"array"`→Array.isArray; `"element"` and an omitted optional arg
    stay UNCHECKED); `evaluateStringMember`'s belt restructured to call it
    after the arity check.
  - `src/runtime/stdlib-array.ts`, `src/runtime/stdlib-object.ts` — import and
    call `assertStdlibArgumentKinds` after the arity check in
    `evaluateArrayMember` / `evaluateObjectMember`.
  - `tests/b0394-stdlib-wrong-kind-args-belt.test.ts` (new) — the witness (19
    cells): 8 coercion FLIPs + C3n (non-hanging wrong-kind `from`) + PC1
    (pure-host) across BOTH hosts; the C3 hang row (guarded per-test timeout,
    asserting the kind-belt message so a host `RangeError` cannot masquerade);
    and K1–K8 byte-identical correct-kind controls (K8 pins the untouched
    `"element"` descriptor).
  This closes the hang (the belt fires BEFORE `replaceLiteral` is entered) and
  every silent-coercion row in one pattern precedented by 0315/0366. Both
  hosts move in lockstep because the belt lives in the shared stdlib
  evaluators. No spec/registry/permitted-codes edit: `internal-error`'s
  open-ended trigger already covers the belt (as it covers the 0315 arity and
  0366 element belts); expressions.md §methods' "never a JS-coerced runtime
  value" is the sentence the fix makes hold.
- Gates: witness 19/19 green (C3 prompt, not a hang); full default suite 558
  files / 10337 tests green (a fully clean verifier run); `tsc -p
  tsconfig.json --noEmit` clean; `npm run lint` clean; adjacent live cell
  `tests/live/acceptance/b0315live-stdlib-arg-refusal.test.ts` green (23.7s
  real `pi -p` turn over the same three dispatchers, belt landed).
- Review: 1 round (`bug-fix-reviewer`), verdict CLEAN, no findings; one
  non-blocking prose residual (see Residuals 3). No correctness/fidelity/spec
  finding.
- Verification: all four functional obligations SOLID (`bug-fix-verifier`);
  the report's "NOT SOLID" line was solely this §Fix record being unwritten at
  verification time (now written). Revert-witness: neutralising
  `assertStdlibArgumentKinds` reds the 10 terminating FLIP rows naming their
  coerced HEAD values (C3 excluded from the reverted-belt run — it would
  diverge), controls stay green; restored, witness 19/19 green. Full suite
  clean. tsc + lint clean.
- Residuals:
  1. No pre-existing live cell drives a wrong-KIND stdlib argument. The belt
     is a deterministic, model-independent runtime rejection witnessed offline
     on both hosts; a real-model turn cannot be steered to emit
     `s.replace(1, "z")`. The adjacent b0315 live cell drives the identical
     dispatchers end-to-end and is green. Proportionate live witness; a
     bespoke 0394 live cell was not authored.
  2. The C3 hang row's per-test `{ timeout }` guard cannot preempt a
     synchronous CPU divergence at a belt-absent tree (vitest timers do not
     fire during a sync loop) — at such a tree it grows an unbounded string
     toward a host `RangeError`. Post-fix (the shipped, committed state) C3
     throws promptly and is safe; the terminating C3n row is the bounded
     regression guard for the same rejection. Do NOT run C3 at a
     belt-reverted tree.
  3. (prose) `tests/b0366-join-element-laundered-belt.test.ts`'s header quotes
     the pre-0394 design-brief sentence in `stdlib-string.ts` whose wording
     this fix updated; that quote/line-citation is now stale. b0366 is outside
     0394's §Fix scope and not on the citation-symbol-form-gate ratchet — left
     byte-exact at HEAD deliberately (this lane does not chase sibling
     citations). Follow-up sweep material.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the 0315 arity belt unchanged
  (byte-identical message + placement); the 0366 join element-VALUE belt
  unchanged; `includes`/`indexOf`'s `"element"` descriptor stays
  total/unchecked; correct-kind calls byte-identical (K1–K8; `slice`'s
  omitted-`end` `undefined`); the parse checks unchanged.
