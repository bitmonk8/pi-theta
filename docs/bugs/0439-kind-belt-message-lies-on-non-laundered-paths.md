# Bug 0439 — `StdlibMethodArgumentKindDefectError`'s message asserts "did not reject this laundered-receiver site" on the non-laundered emission paths 0402 admitted: `xs.slice(4 % y)` on a statically-resolvable receiver (runtime-zero `y`) aborts naming a gate deferral that never happened, while the registry's Trigger cell states the true condition

- **Status:** fixed (0.418.0).
- **Sev/Diff estimate:** S4/D1 — S4: a lying causal tail inside a
  `theta/runtime/internal-error` message (the code, route, and
  expects/got head are correct; only the diagnosis clause misattributes the
  emission path — operator-triage grade, below the S3 wrong-code/wrong-site
  classes); D1: one template string in one constructor, no registry row
  touched (the message is not a registered template — the registered
  `internal error: <error.message>` row already carries the accurate 0402
  Trigger clause).
- **Kind:** defect — a diagnostic asserting a falsehood about its own
  emission condition, the code-side twin of 0402's round-1 F1 (which fixed
  the same misdescription in the registry doc but was fenced off the message
  by 0402's §Fix "no message change" pin).
- **Related:**
  - 0402 (fixed 0.400.0) — §Fix **Residual 1** records this exactly: the
    message "is imprecise for the non-laundered emission paths this fix
    newly admits (e.g. a resolvable receiver with a runtime-non-integral
    arg). Explicitly OUT OF SCOPE — the §Fix pins 'no message change'.
    Code-side twin of the round-1 F1 wording; follow-up sweep material, per
    the 0394 residual-3 precedent." This report is that follow-up, with the
    emission path measured.
  - 0394 (fixed 0.397.0) — authored the message; at 0394's scope the claim
    was true (the wrong-KIND belt fired only past a deferred parse check on
    a laundered receiver). Its residual 3 is the cited precedent for filing
    recorded prose imprecision as a follow-up sweep report.
  - 0365 (fixed 0.357.0) — the honest-offending-value precedent this message
    also misses: its fix made the index panic render the actual `1.5`/`NaN`;
    this message renders `summariseNonResultOperand`, which for every number
    says only "a number" (see §Actual).
- **Affected** (verified at `04579e12`, v0.415.0):
  - `src/runtime/runtime-panics.ts:501-508` — the constructor; the fixed
    tail `"…the parse-time stdlib-arg-type-mismatch gate
    (theta/parse/stdlib-arg-type-mismatch) did not reject this
    laundered-receiver site (bug 0394)"` at `:504`.
  - `src/runtime/runtime-panics.ts:484-500` — the class doc comment narrates
    the same laundered-receiver-only story ("on a laundered receiver …
    precondition deferred"), stale for the 0402-admitted paths.
  - `src/runtime/stdlib-string.ts:92-110` — `assertStdlibArgumentKinds`; the
    `"integer"` arm (`:103`) is the emission site whose input class outgrew
    the message.
  - `src/runtime/runtime-panics.ts:521-543` — `summariseNonResultOperand`:
    `typeof value !== "object"` → `` `a ${typeof value}` `` (`:526`), so a
    fractional/NaN/Infinity offender renders "a number" with the value
    withheld.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md:24` — the
    `internal-error` Trigger cell's 0402 clause states the true condition
    ("a statically-`integer`-typed operand can still evaluate non-integral
    at runtime (`n % m` with a runtime-zero `m` …)") — doc accurate, message
    not.
- **Observed at:** v0.415.0 (`04579e12`), offline — production prompt-mode
  harness (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`), the b0402 witness shape;
  scratch file deleted.

## Summary

Bug 0394's kind belt could only fire past a parse check that had deferred on
a laundered receiver, so its defect message hard-codes that diagnosis. Bug
0402 widened the belt's `"integer"` arm with an integrality conjunct, which
admits a second emission class with no laundering anywhere: a
statically-resolvable receiver and a statically-`integer`-typed argument
whose value evaluates non-integral at runtime (`4 % y` with runtime-zero
`y`). On that path the parse gate ran, judged the site, and correctly passed
it — the mismatch is statically invisible. The message still tells the
author the gate "did not reject this laundered-receiver site": both halves
false (nothing is laundered; there was nothing the gate could have
rejected). The 0402 fix corrected exactly this misdescription in the
registry Trigger cell (round-1 F1) but pinned the message out of scope,
recording it as Residual 1 / follow-up sweep material. The message also
withholds the offending value (`summariseNonResultOperand` renders every
number as "a number"), so an author debugging `expects an integer, got a
number` cannot see whether the offender was `1.5`, `NaN`, or `Infinity` —
the sibling index panic renders the honest value (0365).

## Reproduction

Offline, deterministic; source prefixed `---\nmode: prompt\n---\n`, driven
through `executeBody` on the production prompt-mode binding.

B1 — the non-laundered emission path (parse error-diagnostics `[]`):

```theta
let xs = [1, 2, 3]
let y = 0
let out = xs.slice(4 % y)
out
```

Observed: `executeBody` throws

```
StdlibMethodArgumentKindDefectError: internal defect: stdlib method 'slice'
argument 0 expects an integer, got a number; the parse-time
stdlib-arg-type-mismatch gate (theta/parse/stdlib-arg-type-mismatch) did not
reject this laundered-receiver site (bug 0394)
```

(`surfaceUnexpectedThrow` frames it to `theta/runtime/internal-error` with
the `internal error: ` prefix one layer up — the b0402 witness pins that
route.)

B2 — controls proving the receiver is resolvable and its parse gate LIVE on
this exact receiver:

| # | Source (body) | Observed |
|---|---|---|
| ctl-string | `let xs = [1, 2, 3]` / `xs.slice("a")` | parse `[theta/parse/stdlib-arg-type-mismatch]` |
| ctl-frac | `let xs = [1, 2, 3]` / `xs.slice(1.5)` | parse `[theta/parse/stdlib-arg-type-mismatch]` |
| b1 | `let xs = [1, 2, 3]` / `let y = 0` / `xs.slice(4 % y)` | parse `[]` — the gate ran and rightly passed (`4 % y` types `integer`) |

C1 — the laundered path (message currently TRUE there): `fn g(xs, a) {
xs.slice(a) }` / `g([1, 2, 3], 1.5)` throws the byte-identical message; any
rewording must stay true of this class too.

## Expected behaviour

- `docs/spec_topics/errors-and-results/error-model.md` runtime-defect
  surface: `message` is the underlying `error.message` surfaced to the
  author (`code-registry-runtime.md:24`, Message cell `internal error:
  <error.message>`) — the one channel an author sees; a diagnosis clause in
  it must be true of every emission path.
- `docs/spec_topics/diagnostics/code-registry-runtime.md:24` — the 0402
  Trigger clause is the accurate statement of the widened condition ("the
  parse-time `theta/parse/stdlib-arg-type-mismatch` check refuses only
  statically-resolvable mismatches …, and a statically-`integer`-typed
  operand can still evaluate non-integral at runtime"). The message should
  agree with its own registry row's account.
- The 0300/0365 precedent for offending-value honesty: the sibling
  `index-out-of-bounds` message renders the actual `1.5` / `NaN`
  (`runtime-panics.ts:269-271`), established specifically so a diagnostic
  cannot misdescribe the value class it fired on.

## Actual behaviour / root cause

The tail of the template at `runtime-panics.ts:504` is fixed text authored
under 0394's single-emission-class assumption. 0402 added the integrality
conjunct at `stdlib-string.ts:103` without touching the message (its §Fix
pins "The existing `StdlibMethodArgumentKindDefectError` message … unchanged
— no message change"), knowingly recording the resulting imprecision as
Residual 1. The value rendering at `:526` (`a ${typeof value}`) predates the
integrality class, for which the interesting datum is the value itself, not
its `typeof`.

## Why it matters

Impact class 4 (diagnostics that lie): the message sends an author (or a
triaging agent) hunting for a laundered receiver and an unresolvable static
type at a site where the receiver is a same-file `let` with a concrete
`array<integer>` type — the wrong site and the wrong mechanism, on the
emission path most likely to occur in real code (`n % m` with a
runtime-zero divisor is ordinary arithmetic, no laundering idiom needed).
The withheld offending value compounds it: "got a number" under "expects an
integer" reads as a category confusion rather than what it is (a
non-integral value of the right JS type).

## Non-goals

- The belt's behaviour — correct on every path (loud abort, right code,
  right route); only the message prose (and optionally the `:484-500` doc
  comment) is in scope.
- The registry row — already accurate (0402 round-1 F1); no doc edit owed.
- A new registry row or code — the message is not a registered template;
  DIAG-2 message-cell obligations do not attach.
- The laundered-path wording truth — C1 shows the current text is true
  there; the fix must keep it true (see §Fix constraint).

## Fix

Reword the tail of `runtime-panics.ts:504` to a diagnosis true of both
emission classes, mirroring the registry clause — e.g. "…; the parse-time
stdlib-arg-type-mismatch gate covers only statically-resolvable mismatches,
so this site's argument reached the runtime belt unjudged (bugs 0394/0402)".
Optionally (same commit, same file) render the offending number's honest
value in the `got` clause for the `"integer"` arm — either widen
`summariseNonResultOperand`'s number arm to include the value (`a number
(1.5)`) or pass a pre-rendered actual from the belt; the 0365
`renderIndexOperand` pattern is the in-file precedent. Update the
`:484-500` class doc comment in the same pass. Constraint: the b0402/b0394
witness assertions match on the `expects an?
(string|integer|array)` head, not the tail, so the reword must keep that
head byte-stable (or the witnesses move in the same commit — they assert
shape, not tail text). Alternative — leave the message and only fix the doc
comment — rejected: the message is the author-visible half.

## Provenance

stdlib-belt-perimeter sweep at `04579e12` (v0.415.0), directed by the task
brief's SECONDARY pointer at 0402 §Fix Residual 1. Emission path B1
constructed from 0402's round-1 F1 example (`[1,2,3].slice(4 % y)`,
runtime-zero `y`), verified parse-clean and throwing the quoted message via
`tests/scratch-belt-perimeter.test.ts` (deleted); B2 parse controls prove
the receiver resolvable and the gate live. Dup check: README index carries
no report on this message; 0394 residual 3 and 0402 residual 1 read in
full — both record, neither owns; no sibling hunt candidate touches it.
Sibling candidate: `[bug 0438](./0438-par-max-fractional-width-silent-floor.md)` (the par-max width
floor, same sweep).

## Fix (0.418.0)

- What shipped:
  - `src/runtime/runtime-panics.ts` — the
    `StdlibMethodArgumentKindDefectError` message tail reworded from the
    false laundered-receiver-only claim to a diagnosis true of BOTH emission
    classes: `… the parse-time stdlib-arg-type-mismatch gate covers only
    statically-resolvable mismatches, so this site's argument reached the
    runtime belt unjudged (bugs 0394/0402)`. The HEAD (`internal defect:
    stdlib method '<m>' argument <i> expects <kind>, got <actual>`) is kept
    byte-stable, so the b0394/b0402 head-only witnesses are untouched. The
    class doc comment (`:484-500`) rewritten to narrate both routes — the
    parse gate deferring on a laundered/statically-unresolvable receiver
    (0394) and the gate running-and-passing a statically-`integer` argument
    that evaluates non-integral at runtime (`n % m` with runtime-zero `m`,
    0402's integrality conjunct at `stdlib-string.ts:103`).
  - `tests/b0439-kind-belt-message-honesty.test.ts` — the witness (FLIP B1 on
    the non-laundered path + CONTROL C1 on the laundered path both assert the
    honest tail; B2 parse controls prove the receiver resolvable and the gate
    live).
- Gates: witness `npx vitest run tests/b0439-…` → 9/9; kind-belt family
  `b0394` 19/19 + `b0402` 9/9 green (head byte-stable); full default suite
  `npx vitest run` → 589 files / 10552 tests green; `npm run typecheck`
  clean; `npm run lint` clean; live `b0324live-max-non-integer-load-refusal`
  → 1/1 through the real `pi -p` (lane witness, under the global live lock).
- Review: 1 round (deep) — CLEAN (one non-blocking prose residual, R1 below).
- Verification: SOLID — witness reds with the tail reverted (the four
  B1/C1 tail assertions: `laundered-receiver`/`did not reject` present,
  `statically-resolvable`/`0402` absent) and greens restored byte-exact;
  full suite green; typecheck + lint clean; tree reconciled, no stash.
- Residuals:
  1. R1 [prose]: `tests/b0394-stdlib-wrong-kind-args-belt.test.ts:56` — the
     “BELT MESSAGE SHAPE” header comment still quotes the retired tail (`did
     not reject this laundered-receiver site`). Non-blocking: that file's
     assertion (`:286`) is head-only and green. Not edited (sibling
     closed-bug witness, comment-only) — follow-up-sweep material.
  2. The OPTIONAL offending-value rendering (`a number (1.5)` via
     `summariseNonResultOperand`) deliberately deferred — §Fix marks it
     “optional”; deferred to avoid flipping the `QuestionOperandDefectError`
     messages that share `summariseNonResultOperand`. The author-visible
     lie (the tail) is fully shipped.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: `summariseNonResultOperand` untouched; the
  registry not edited (§Non-goals — already accurate via 0402 round-1 F1);
  `stdlib-string.ts` belt behaviour untouched; no new registry row/code.
