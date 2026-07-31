# Bug 0032 — Member access on an absent name binds raw JS `undefined`, an out-of-model value: `o.absent == null` is `false`, `o["absent"]` panics on the same name, and expressions.md prescribes no absent-member disposition

- **Status:** fixed (0.42.0). §Fix as settled — spec amended first (four
  edits), then one presence gate shared with the index path at the single
  interpolation point bug 0036 landed. See §Fix (0.42.0) below.
- **Kind:** spec-gap, with the runtime defect it produces.
  (1) **The spec defines no absent-member semantic.** expressions.md's
  supported-forms list gives member access one line — "Member access: `a.b`"
  (`:9`) — and states nothing about a name the receiver does not carry. The
  adjacent indexed-access bullet (`:10`) spells its own absent case out in
  full: "an object index whose theta-side name is absent panics with
  `theta/runtime/missing-object-key`". The panic list
  (error-model.md:67–72) carries `.field` access on `null` (`:69`) and
  indexed access on a missing key (`:71`) and no member-access counterpart.
  No spec sentence assigns a result to `o.absent`.
  (2) **The runtime therefore returns a value outside the value model.**
  `evaluateMemberAccess` (`src/runtime/runtime-panics.ts:172`) guards `null`
  and then reads the property unfiltered (`:176`), so an absent name yields
  JS `undefined`. `undefined` is not a `ThetaValue`
  (`src/runtime/value.ts:97–105` — eight arms, none of them `undefined`), and
  theta's `==` is `valuesEqual` structural equality whose primitive arm ends
  at `a === b` (`value.ts:359`), so `o.absent == null` evaluates **`false`**.
  The value is outside the value model, and the operator an author would use
  to test for it reports the opposite.
- **Related:** bug
  [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)
  cites this report for its post-fix member-access expectation and states no
  post-fix value for the absent-member case. The two reports change the same
  function (`evaluateMemberAccess`, `runtime-panics.ts:172`) and are
  independent: 0027 gates enum and `Result` *receivers* before the object read
  path; this report changes what an *object* receiver does with a name it does
  not carry. Neither blocks the other; whichever lands second rebases onto one
  guard chain in one function.
- **Affected** (citations verified at HEAD `4d645f4f`; `src/` is byte-identical
  to `b542dafe`, the 0.32.0 fix commit — `git diff b542dafe HEAD -- src/` is
  empty):
  - `evaluateMemberAccess` (`src/runtime/runtime-panics.ts:172`) — the `null`
    guard (`:173–174`) is the whole of its filtering; `:176` casts the target
    to an index signature and returns `[field]` verbatim. Its docstring
    (`:163–171`) states the contract it implements: "`target.field` on a
    `null` target raises `NullMemberAccessPanic` (`.<field>`); otherwise it
    returns the member value" — with no case for a field the target lacks.
  - The sibling read in the same file has the disposition this one lacks.
    `evaluateIndexAccess` (`:121`) tests
    `Object.prototype.hasOwnProperty.call(obj, key)` (`:157`) and throws
    `MissingObjectKeyPanic` with the registered `missing object key: <key>`
    template (`:158`) before the read at `:160`.
  - Two call sites, one shared implementation:
    `src/runtime/statement-executor.ts:719` (the `Enum.Variant` resolution at
    `:708–714` runs first) and
    `src/extension/production-theta-producer.ts:5663` (its
    `Enum.Variant` arm at `:5656–5661`). Unlike the four-site dispatch of bug
    0027, both hosts call one function, so the fix has one definition point.
  - The static layer does not gate it, by design and regardless of whether the
    receiver's schema is known. `checkMemberAccess`
    (`src/parser/type-layer-checks.ts:931`) returns early for
    `kind === "object"` as well as `"unknown"` (`:937–941`); the docstring
    (`:925–930`) records the intent: "Object *field* access (`obj.field`) is
    legitimate and is not gated". A schema-typed receiver's field set is
    statically known — construction requires every declared field and rejects
    extra fields (expressions.md:209) — and is still not consulted here.
  - The out-of-model value is masked at two identifier-read sites and
    therefore behaves differently depending on read position:
    `src/extension/production-theta-producer.ts:5632` and
    `src/runtime/lexical-environment.ts:571` both return
    `resolution.value ?? null`, so a `let`-bound or parameter-bound
    `undefined` reads back as `null` while a direct member read does not.
  - The stdlib dispatch answers an inert `null` on the value rather than
    rejecting it: `applyStdlibMethod`
    (`src/runtime/statement-executor.ts:917`) and `evaluateStdlibMethod`
    (`src/extension/production-theta-producer.ts:5816`) both fall through to
    `return null` (`:927` / `:5830`) for a receiver that is not a string,
    array or object, so `o.absent.keys()` succeeds with `null`.
  - Unaffected: `has(k)` (`src/runtime/stdlib-object.ts:103–104`) reports the
    same absent name `false`, and `keys()` (`:94–95`) omits it. The three
    object read surfaces disagree with each other on one name.
- **Observed at:** `0.32.0` (HEAD `4d645f4f`). Offline, deterministic, no live
  model: every probe below drives the production executor
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`) on parse-clean sources.

## Fix (0.42.0)

The settled §Fix, implemented as written. Line anchors are at the fix commit.

**Spec amended first, four edits.** `docs/spec_topics/expressions.md:9` —
the member-access bullet now states the absent-name disposition (panics
`theta/runtime/missing-object-key`, pointer to the canonical closed list)
with a review-added carve-out naming the two more-specific dispositions (a
`null` receiver → `null-member-access`; an enum or `Result` receiver →
`non-object-receiver`). `errors-and-results/error-model.md:71` — the panic
bullet widens to "Member or indexed access on a missing object key"; the
list stays six entries, the `:84` template row is untouched.
`diagnostics/code-registry-runtime.md:17` — the row's *Trigger* cell widens
to "`obj[k]` or `obj.field` where `k` / `field` is not a present theta-side
name on the receiver" (review finding F1: "on the receiver", not "on
`obj`", because a laundered primitive or array receiver reaching the gate
panics too); Code, Severity, Phase and *Message* untouched — the DIAG-2
same-commit spec edit. `docs/reference/errors-and-results.md:88` — mirror.

**One presence gate, shared with the index path**
(`src/runtime/runtime-panics.ts`). New `assertKeyPresent(target, key)` —
the `hasOwnProperty` predicate plus the `MissingObjectKeyPanic` throw with
bug 0036's category-5 rendering — is now the ONE construction site for the
panic; `evaluateIndexAccess`'s object arm delegates to it, and
`evaluateMemberAccess` calls it after the `null` guard and bug 0027's
enum/`Result` receiver gate, before the read. The member and index
spellings of one absent name raise byte-identically. `Enum.Variant`
pre-resolution (both hosts), `length` on `string` / `array` receivers (own
property, admitted), the two `?? null` coercions, `checkMemberAccess`'s
object-receiver early return, and the stdlib dispatches are all untouched.
No parse-time rejection was added; no new code; H9a's permitted-code list
unchanged. The out-of-model `undefined` arm in `nonObjectReceiverRejection`
stays, now defensive — its docstrings retensed, since no theta expression
binds `undefined` any more.

**Reproduction re-derived at the fix baseline** (`91bb308b`, 0.41.0): all
29 §Reproduction probes byte-identical to the recorded 0.32.0 table — zero
drift through the 0026/0027/0028/0024/0029 releases. Post-fix, M1–M9,
N1–N4 and P1–P11 all raise the registered panic at the first absent read
(P11 ahead of bug 0019's `?` guard; P1/P2 ahead of the runtime-defect
surface), and C1–C5 are byte-unchanged.

**Offline lock.** `tests/absent-member-presence-gate.test.ts` (34 tests,
offline, production executor): a1–a9 = M-rows, b1–b4 = N-rows (position
dependence — the panic fires at the read, so no binding position launders
it), c1–c11 = P-rows (spread; c1/c2 assert the throw is NOT routed onto the
runtime-defect surface, c11 asserts it is NOT `QuestionOperandDefectError`),
d1 = member/index rendering parity (the 0036 coordination), e1–e9 controls
(index panic byte-exact, `has`/`keys`/present field, parse-reject,
`Enum.Variant`, `length` ×4 including laundered, `NullMemberAccessPanic`
order, DIAG-4 registry drift guard with `tools/code-registry` as oracle).
Every red names its pre-fix leak. Control i7 in
`tests/non-object-receiver-gate.test.ts` — whose in-language probe
`x.absent[0]` was this bug's own bind — is re-anchored to drive
`evaluateIndexAccess` directly with an `undefined` receiver, assertions
preserved byte-identically; the other 36 tests are byte-untouched. Verified
in both directions: neutralising the member-path gate reds exactly the 25
witness rows with the recorded leak signatures while the 37 stay green;
neutralising the shared helper's throw reds BOTH spellings' witnesses (the
member 25 + parity + index e1, and 0036's a1/b1) — the one-construction-site
proof; byte-exact restores green everything. Full gate 233 files / 2826
tests; typecheck and lint clean. Live: H8a
`tests/live/live-production-acceptance.test.ts` 7/7 green (no-regression
gate; the fix itself is offline per this §Fix).

**Residuals.** None here. Bug 0027 §Fix residual (i) is discharged by this
fix. The pre-existing `placeholder-rendering-b.md:20` vector label ("A
member access" describing the bracket spelling `obj["kind"]`) predates this
bug, asserts a correct byte string, and is left as found — flagged for
separate curation.

## Summary

Reading a name an object value does not carry produces JS `undefined`, and
that value then circulates as if it were a theta value.

- `o.definitely_absent` is the theta's final value, outcome `success`, with no
  diagnostic.
- `o.definitely_absent == null` is `false` and `!= null` is `true`. Theta's
  `==` is structural deep equality (`valuesEqual`), not JS `==`; its primitive
  arm is `===`, and `undefined === null` is `false`. The absence check an
  author writes reports "present".
- The same name read as an index panics: `o["definitely_absent"]` raises
  `MissingObjectKeyPanic: missing object key: definitely_absent`. The same
  name asked about with the designated safe-check answers correctly:
  `o.has("definitely_absent")` is `false`. Three read surfaces over one name,
  three different answers.
- Two distinct absent names compare equal (`o.absent_a == o.absent_b` is
  `true`), so the value carries no information about which read produced it.

The value spreads. It stringifies into a theta `string` through `+`
(`"v=" + o.definitely_absent` → `"v=undefined"`), yields `NaN` in arithmetic,
is stored into a schema value by a constructor (`F { x: o.definitely_absent }`
yields an object whose `x` is present to `keys()` and `has("x")` but compares
unequal to `F { x: 1 }`), and survives an array round-trip. A second member or
index read on it aborts the theta: `o.absent.deeper` throws a raw
`TypeError: Cannot read properties of undefined`, which the runtime-defect
surface (error-model.md:74) reclassifies as `theta/runtime/internal-error`.

The defect is position-dependent, which is what makes it hard to reason about
from inside a theta. Read directly, the value is `undefined`; read back
through a `let` binding or a function parameter, the two `?? null` coercions
at `production-theta-producer.ts:5632` and `lexical-environment.ts:571` turn
it into `null`. So `o.absent == null` is `false` while
`let a = o.absent` followed by `a == null` is `true` — the same read, two
answers, decided by whether a binding sits in between.

This fires for ordinary absent fields on ordinary object values. No brand, no
enum carrier and no `Result` is involved; the receiver is a plain schema value
and the name is one the author mistyped or expected to be there.

## Reproduction

Offline, at HEAD `4d645f4f`, via a scratch vitest through the production
executor (the `tests/enum-schema-tag-privacy.test.ts` group-(e) harness
pattern; written, run, deleted per scratch policy). Each probe is a
parse-clean prompt-mode theta whose final expression is the probe; `value` is
`BodyExecution.result.value` rendered with `JSON.stringify`, `raw` is
`String(...)` of the same value.

Fixture: `schema F { x: integer }` / `let o = F { x: 1 }`. Verbatim output:

```text
M1  o.definitely_absent             :: outcome=success value=undefined typeof=undefined raw=undefined
M2  o.definitely_absent == null     :: outcome=success value=false typeof=boolean raw=false
M3  o.definitely_absent != null     :: outcome=success value=true typeof=boolean raw=true
M4  o.absent_a == o.absent_b        :: outcome=success value=true typeof=boolean raw=true
M5  o.definitely_absent == ""       :: outcome=success value=false typeof=boolean raw=false
M6  o.definitely_absent == false    :: outcome=success value=false typeof=boolean raw=false
M7  match o.definitely_absent       :: outcome=success value="other" typeof=string raw=other
M8  o.definitely_absent ? .. : ..   :: outcome=success value="f" typeof=string raw=f
M9  !o.definitely_absent            :: outcome=success value=true typeof=boolean raw=true
C1  o["definitely_absent"]          :: THREW MissingObjectKeyPanic: missing object key: definitely_absent
C2  o.has("definitely_absent")      :: outcome=success value=false typeof=boolean raw=false
C3  o.keys()                        :: outcome=success value=["x"] typeof=object raw=x
C4  o.x                             :: outcome=success value=1 typeof=number raw=1
C5  let m = F { }                   :: THREW Error: PARSE-REJECT theta/parse/missing-object-field: missing field 'x' on schema 'F'
N1  let a = o.definitely_absent; a  :: outcome=success value=null typeof=object raw=null
N2  let a = ..; a == null           :: outcome=success value=true typeof=boolean raw=true
N3  fn h(p) { p == null }; h(..)    :: outcome=success value=true typeof=boolean raw=true
N4  fn k(p) { p.nope == null }; k(o) :: outcome=success value=false typeof=boolean raw=false
P1  o.definitely_absent.deeper      :: THREW TypeError: Cannot read properties of undefined (reading 'deeper')
P2  o.definitely_absent["k"]        :: THREW Error: indexed access requires an array<T> or object receiver; got undefined
P3  o.definitely_absent.keys()      :: outcome=success value=null typeof=object raw=null
P4  "v=" + o.definitely_absent      :: outcome=success value="v=undefined" typeof=string raw=v=undefined
P5  o.definitely_absent + 1         :: outcome=success value=null typeof=number raw=NaN
P6  let q = F { x: o.absent }; q.keys() :: outcome=success value=["x"] typeof=object raw=x
P7  ..; q.has("x")                  :: outcome=success value=true typeof=boolean raw=true
P8  ..; q.x == null                 :: outcome=success value=false typeof=boolean raw=false
P9  ..; q == F { x: 1 }             :: outcome=success value=false typeof=boolean raw=false
P10 let arr = [o.absent]; arr[0] == null :: outcome=success value=false typeof=boolean raw=false
P11 o.definitely_absent?            :: THREW QuestionOperandDefectError: internal defect: '?' operand evaluated to a non-Result value (a undefined); the parse-time ERR-18 operand gate (theta/parse/question-on-non-result) did not reject this site — a gate gap (bug 0019)
```

Reading the table:

- **M1–M9 are the defect.** M1 shows the raw bind. M2/M3 show that the
  in-language absence test answers backwards. M5/M6 rule out coercion to a
  falsy theta value: the result is not `""` and not `false`. M7 shows the
  `null` pattern does not match it, so `match` cannot catch it either. M8/M9
  show it is falsy in condition position, which is the only surface that
  behaves as an author expects and the reason the defect can stay hidden. M4
  shows two different absent names produce indistinguishable values.
- **C1 is the asymmetry.** The identical theta-side name, read as an index,
  raises the registered panic with the registered message template. C2 shows
  the third surface reporting the truth. C3 confirms the name is not in the
  object's key set. C4 is the present-field control.
- **C5 bounds the reachable input class.** A constructor omitting a declared
  field is rejected at parse (`theta/parse/missing-object-field`), so a schema
  value always carries its declared fields. The reachable route is a name that
  is not declared — a typo, a renamed field, or a field an author expects a
  laundered receiver to have.
- **N1–N4 are the position dependence.** N1/N2/N3 show the `?? null` coercions
  at the two identifier-read sites converting the value on the way out of a
  binding or a parameter slot, so the same read tests as `null` there. N4
  reads through an unannotated `fn` parameter *without* an intervening
  binding of the member value and leaks identically — the receiver being
  statically unresolvable changes nothing, because the object arm of
  `checkMemberAccess` does not gate either.
- **P1–P11 are the spread.** P1/P2 abort the theta through the runtime-defect
  surface rather than through any registered panic. P3 answers `null` from the
  stdlib inert-null fallthrough. P4 puts the literal text `undefined` inside a
  theta `string`. P5 yields `NaN` (`raw=NaN`; `JSON.stringify` renders it
  `null`). P6–P9 store the value inside a schema value: the key is present to
  `keys()` and `has`, the field does not test as `null`, and the object is
  unequal to its well-formed counterpart. P10 shows an array round-trip
  preserves it, because array indexing has no `?? null`. P11 is bug
  [0019](./0019-question-operand-bypasses-result-normalisation.md)'s
  fail-closed guard behaving as designed; its operand summariser has to
  describe the value as "a undefined", which is derivative evidence that the
  out-of-model value reaches the `?` unwrap.

## Expected behaviour (what the spec and the module contracts say)

The spec says nothing about this read, which is the first half of the report.
What it does say constrains what the semantic has to be:

- **expressions.md:9** — "Member access: `a.b`". The entire specification of
  the form. No absent-name case.
- **expressions.md:10** pairs the two reads in one sentence and gives the
  index one a disposition: the receiver "must be an `array<T>` or an object
  value"; "The index names a theta-side name"; "an object index whose
  theta-side name is absent panics with `theta/runtime/missing-object-key`";
  and "an author wanting the per-field declared type uses member access
  (`obj.fieldName`)". The two forms are two spellings of one read over one key
  space, differing in static result type — the union of field types for
  `obj[k]`, the per-field declared type for `obj.field`. Nothing in the
  sentence makes their runtime dispositions differ.
- **expressions.md:120** — the `has(k)` row: "Whether a theta-side name is
  present. Returns `false` for unknown keys (no panic) — this is the explicit
  safe-check." A designated safe-check presupposes an unsafe read to be safe
  *against*. Today `has` is the only surface that answers absence correctly,
  and `.field` answers it wrongly rather than raising.
- **error-model.md:67–72** — the closed panic list. `:69` covers `.field` on
  `null`; `:71` covers indexed access on a missing object key. Member access on
  a present receiver with an absent name appears nowhere, and `:74` closes the
  list to *new* spec-defined sources.
- **runtime-value-model.md:5–14** — the value-representation table enumerates
  the theta types and their JS representations. There is no representation for
  "no value"; `null` (`:10`) is a legal field value, not an absence marker.
  `src/runtime/value.ts:97–105` encodes the same closed set in the
  implementation's own `ThetaValue` union, which the cast at
  `runtime-panics.ts:176` launders.
- **runtime-value-model.md §Equality** — "`==` and `!=` accept operands of
  *any* two static types" and "Primitives compare by value". Both presuppose
  operands drawn from the value model. `undefined` is outside it, so its
  comparison behaviour is unspecified rather than wrong-by-rule; `false`
  against `null` is what the implementation happens to produce.

Post-fix, the required observables on the fixture above are:

- `o.definitely_absent` raises `theta/runtime/missing-object-key` with the
  registered message `missing object key: definitely_absent`, matching C1
  exactly, on every read position including N1–N4.
- `o.has("definitely_absent")` stays `false`, `o.keys()` stays `["x"]`,
  `o.x` stays `1`, and C1 keeps its panic.
- No theta expression can produce a value outside `ThetaValue`, so P1–P11 lose
  their input: P1/P2 raise the member panic at the first read instead of an
  internal error; P3–P10 raise it instead of propagating `undefined`; P11
  raises it before reaching bug 0019's `?` guard.
- `length` on a `string` or `array` receiver keeps working. Both reach
  `evaluateMemberAccess` (probed: it answers `2` for `"hi"` and for `[1, 2]`)
  and `length` is an own property of both receivers, so a presence gate
  admits it.

## Actual behaviour / root cause

`evaluateMemberAccess` has one guard and one read:

```
runtime-panics.ts:173-174   if (target === null) throw new NullMemberAccessPanic(...)
runtime-panics.ts:176       return (target as { readonly [k: string]: ThetaValue })[field]
```

The cast at `:176` is where the value model is left. `ThetaValue`
(`value.ts:97–105`) has no `undefined` arm, and a JS property read of an
absent key produces exactly that; the index signature in the cast asserts the
result is a `ThetaValue`, and nothing checks it. The sibling
`evaluateIndexAccess` in the same file performs the presence test the member
path omits (`:157`) and raises the registered panic (`:158`), so the two
surfaces over the same key space diverge inside twenty lines of each other.

Nothing downstream re-establishes the invariant:

- The static layer declines by design. `checkMemberAccess`
  (`type-layer-checks.ts:931`) returns at `:937–941` for both `"object"` and
  `"unknown"` receivers; the docstring at `:925–930` records that object field
  access "is legitimate and is not gated". The check exists to reject stdlib
  members on primitives, not to validate field names.
- `==` propagates the value rather than rejecting it. `valuesEqual`
  (`value.ts:286`) dispatches on enum tag, `Result` brand, array, then object
  (`typeof a === "object" && a !== null` at `:333`, which `undefined` fails),
  and falls to the primitive arm ending at `return a === b` (`:359`).
  `undefined === null` is `false`. The function's contract — "Never panics and
  never raises a diagnostic" — is written for operands inside the value model
  and holds vacuously here.
- The two identifier reads coerce, so the value is visible in some read
  positions and not others. `production-theta-producer.ts:5632` and
  `lexical-environment.ts:571` both return `resolution.value ?? null`. They
  are defensive coercions on a slot typed `ThetaValue`; against this feeder
  they convert an out-of-model value into `null` silently, which is why N2/N3
  answer `true` and M2 answers `false`.
- The stdlib dispatch treats it as a member-less receiver.
  `applyStdlibMethod` (`statement-executor.ts:917`) and `evaluateStdlibMethod`
  (`production-theta-producer.ts:5816`) test string, array, then
  `typeof === "object" && !== null`, and return `null` otherwise (`:927` /
  `:5830`) — the documented "inert `null` safety net" for `number` / `boolean`
  / `null` receivers, which `undefined` also satisfies (P3).
- A second structural read has no guard at all and throws a raw JS error
  (P1: `TypeError` from the property read at `:176` itself; P2: the
  non-object-receiver `Error` at `evaluateIndexAccess:149–151`). Both land on
  the runtime-defect surface as `theta/runtime/internal-error`
  (error-model.md:74) and abort the theta with an interpreter message.

The root cause is the spec gap, not the missing `if`. `evaluateIndexAccess`
carries its presence test because expressions.md:10 prescribes one; the member
path has no prescription to implement.

## Why it matters

- The absence test an author writes reports the opposite of the truth.
  `o.field == null` is the idiom for "did this come through?", and on an
  absent name it answers `false`. No in-language expression distinguishes the
  out-of-model value from a present one: `== null` says present, `!= null`
  says present, `match` does not bind it, and two unrelated absent names
  compare equal.
- A typo is silent. `o.definitely_absent` costs no diagnostic at parse and no
  panic at runtime; the theta continues with a value that stringifies as
  `"undefined"` into any string built from it (P4) and reaches the model
  through any prompt built from that string.
- One name gets three answers. `has` says absent, `[k]` panics, `.field`
  returns a value. An author cross-checking two of the three surfaces gets
  contradictory information about the same object.
- The value is storable. A constructor accepts it as a field value (P6–P9), so
  a schema-typed value can carry an out-of-model field while presenting a
  complete key set to `keys()` and `has`, and comparing unequal to the value
  it is meant to equal.
- The failures it does produce are mislabelled. A chained read (P1/P2) aborts
  the theta as `theta/runtime/internal-error` with an interpreter message,
  where the same access one link earlier should have been a located panic
  naming the key.
- Fixing bug 0027 does not reach it. 0027 gates enum and `Result` receivers
  off the object read surfaces; this fires on an ordinary schema value with an
  ordinary absent name, and 0027 explicitly defers its member-access
  expectation to this report.

## Fix

**Amend the spec first: member access on an absent theta-side name panics with
`theta/runtime/missing-object-key`.** This is what the existing text makes
consistent. expressions.md:10 already treats `obj[k]` and `obj.field` as one
read over one key space that differ only in static result type, and gives the
index spelling the panic; expressions.md:120 designates `has(k)` as "the
explicit safe-check", which is a contrast that requires the other reads to be
unsafe. No value can encode absence on this surface, because `null` is a legal
field value (runtime-value-model.md:10) and would make a declared nullable
field indistinguishable from a name the receiver does not carry — the
distinction `has(k)` exists to draw.

The panic list stays closed. The source is the existing
`theta/runtime/missing-object-key` entry, whose trigger widens from indexed
access to both structural reads; the list keeps six entries, six codes and six
message templates, and `missing object key: <key>` renders identically for
`o.absent` and `o["absent"]`. Four edits, all mechanical:

- `docs/spec_topics/expressions.md:9` — the member-access bullet gains the
  absent-name disposition and a pointer to the panic, mirroring the sentence
  already in the indexed-access bullet at `:10`.
- `docs/spec_topics/errors-and-results/error-model.md:71` — the bullet
  "Indexed access on a missing object key" widens to member *or* indexed
  access.
- `docs/spec_topics/diagnostics/code-registry-runtime.md:17` — the *Trigger*
  column of the `theta/runtime/missing-object-key` row widens from "`obj[k]`
  where `k` is not a present theta-side name on `obj`" to cover `obj.field`.
  Changing a registered code's trigger is a spec change under DIAG-2
  (`docs/spec_topics/diagnostics/diagnostic-shape.md:72`); the code, severity,
  phase and *Message* column are untouched.
- `docs/reference/errors-and-results.md:88` — the reference mirror of the
  panic bullet.

**Then implement one presence gate, shared with the index path.**
`evaluateMemberAccess` (`src/runtime/runtime-panics.ts:172`) tests the same
predicate `evaluateIndexAccess` uses at `:157` and throws the same
`MissingObjectKeyPanic` with the same interpolated template before the read at
`:176`. Factor the predicate into one function the two entry points share, so
a later refinement of what counts as a theta-side name — bug
[0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md)'s Symbol
migration, bug
[0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)'s
receiver gate — moves both surfaces at once instead of drifting them apart
again. Both hosts call this one function
(`statement-executor.ts:719`, `production-theta-producer.ts:5663`), so unlike
bug 0027 there is no lockstep obligation across duplicated dispatch.

Three behaviours the gate must preserve, each with a control in the test:

- `Enum.Variant` never reaches it. Both call sites resolve an enum variant
  first (`statement-executor.ts:708–714`,
  `production-theta-producer.ts:5656–5661`) and return before the member read.
- `length` on a `string` or `array` receiver keeps working. It is an own
  property of both, so `hasOwnProperty` admits it.
- `null` receivers keep raising `NullMemberAccessPanic` at `:173–174`; the new
  gate sits after it, matching the index path's ordering.

**No parse-time rejection is added.** expressions.md:10 fixes the read order
for the index spelling — "the parse-time key-type check first, then the
runtime missing-key panic" — so a statically resolvable absent key is a
runtime panic there even though the receiver's field set is known. Member
access has no key-type check to run, which leaves the runtime panic as the
whole disposition. `checkMemberAccess` (`type-layer-checks.ts:931`) keeps its
object-receiver early return; converting it into a field-name check is
separate work that would need a new parse code and its own DIAG-2 row, and it
would leave the runtime unguarded for the unresolvable receivers of N4
regardless.

**The two `?? null` coercions stay.** `production-theta-producer.ts:5632` and
`lexical-environment.ts:571` are defensive on a slot typed `ThetaValue`; this
fix removes one feeder into them rather than the coercions themselves. They
are also the reason a regression test must probe the *direct* read position:
`let a = o.absent` followed by `a == null` is already `true` today (N2) and
would go green against an unfixed runtime.

**GOV-15 standing.** The affected inputs were never conformant. No spec
sentence assigns `o.absent` a value, `undefined` is outside both the
value-representation table (runtime-value-model.md:5–14) and the
implementation's own `ThetaValue` union (`value.ts:97–105`), and the
equivalence promise
(`docs/spec_topics/governance/source-language-stability.md:5`) ranges over
observable return values of conformant reads. The diagnostic-registry
carve-out (`:23–25`) covers the diagnostic half: for the inputs this touches,
the only effect is the appearance of a `theta/runtime/missing-object-key`
emission where none was emitted before, which is the carve-out's own
in-scope case. It does not cover the return-value change; that rests on the
never-conformant argument.

**Test witness — offline unit test, no live test.** A vitest mirroring
`tests/enum-schema-tag-privacy.test.ts` group (e) runs the probe set through
the real production executor
(`parseThetaDocument` → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody`) in under 20 ms with no model, no
network and no child process. Pin both directions: assert the panic and its
registered message fire for M1–M9 and P1–P11, and assert the pre-fix values
are gone — `undefined` as a final value, `false` from `o.absent == null`,
`"v=undefined"` from the concatenation, `null` from `o.absent.keys()`. Keep
C1–C4 as controls so an over-broad gate that breaks `keys()`, `has`, present
fields or the index panic reds immediately, and keep N4's laundered receiver
so the gate is proven total over statically unresolvable receivers.

## Provenance

- Origin: bug
  [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)
  triage, decision D4 — split out because it is a different defect (it fires
  for ordinary absent fields on ordinary object values, with no brand, enum
  carrier or `Result` involved) and a different kind (expressions.md defines
  no absent-member semantic at all, so it is a spec gap rather than an
  implementation defect against a pinned rule). 0027 originally pinned its own
  post-fix member-access expectation onto this unrecorded behaviour; it now
  cites this report instead.
- Sibling reports:
  [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)
  (same function, disjoint condition — receiver kind there, name presence
  here);
  [0025](./0025-ctor-unresolved-schema-name-passthrough.md), whose
  unresolved-constructor passthrough widens the receiver class this defect
  fires on: a constructor naming an undeclared schema loads clean and
  evaluates as an unbranded plain object, so every name not written into that
  literal is an absent-member read;
  [0019](./0019-question-operand-bypasses-result-normalisation.md), whose
  fail-closed `?` guard is what P11 reaches with the out-of-model value.
- Spec: `docs/spec_topics/expressions.md:9` (member access — the whole of the
  form's specification), `:10` (indexed access — theta-side names, the
  `theta/runtime/missing-object-key` panic, the read order, and the
  member-access pairing), `:118–120` (object stdlib rows `keys()` /
  `values()` / `has(k)`, the last one "the explicit safe-check"), `:209`
  (object construction — every declared field required,
  `theta/parse/missing-object-field`, extra fields rejected);
  `docs/spec_topics/errors-and-results/error-model.md:67–72` (the closed panic
  list; `:69` `.field` on `null`, `:71` indexed access on a missing object
  key), `:74` (closed for new spec-defined sources; the runtime-defect
  surface), `:84` (registered template `missing object key: <key>`);
  `docs/spec_topics/runtime-value-model.md:5–14` (value-representation table;
  `:10` `null` as a value) and its §Equality block (`==` over value-model
  operands);
  `docs/spec_topics/diagnostics/code-registry-runtime.md:15` / `:17`
  (`theta/runtime/null-member-access` and `theta/runtime/missing-object-key`
  rows); `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 — the
  registry is closed; changing a code's trigger is a spec change);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15),
  `:23–25` (diagnostic-registry carve-out);
  `docs/reference/grammar.md:302` (reference mirror of the supported forms),
  `docs/reference/errors-and-results.md:86/:88` (reference mirror of the panic
  bullets).
- Implementation evidence at `4d645f4f`: `src/runtime/runtime-panics.ts:172`
  (`evaluateMemberAccess`), `:163–171` (its docstring contract), `:173–174`
  (`null` guard), `:176` (unfiltered read and the `ThetaValue` cast), `:121`
  (`evaluateIndexAccess`), `:148–151` (non-object receiver — the raw `Error`
  P2 reaches), `:157` (presence test), `:158` (`MissingObjectKeyPanic`),
  `:160` (read), `:277–299` (`summariseNonResultOperand`, whose `typeof`
  fallthrough renders P11's "a undefined");
  `src/runtime/statement-executor.ts:708–714` (`Enum.Variant` pre-resolution),
  `:719` (member call site), `:917` (`applyStdlibMethod`), `:927` (inert
  `null`);
  `src/extension/production-theta-producer.ts:5632` (`?? null` on the
  identifier read), `:5656–5661` (`Enum.Variant` pre-resolution), `:5663`
  (member call site), `:5816` (`evaluateStdlibMethod`), `:5830` (inert
  `null`);
  `src/runtime/lexical-environment.ts:568–571` (`resolveIdentifier`, the
  second `?? null`);
  `src/runtime/value.ts:97–105` (`ThetaValue` — no `undefined` arm), `:286`
  (`valuesEqual`), `:333` (object arm's `typeof`/`null` test), `:356–359`
  (primitive arm ending at `a === b`);
  `src/runtime/stdlib-object.ts:94–95` (`keys` arm), `:100–104` (`has` arm and
  its "explicit safe-check" comment);
  `src/parser/type-layer-checks.ts:925–930` (`checkMemberAccess` docstring —
  object field access "is legitimate and is not gated"), `:931` (the check),
  `:937–941` (the object/unknown early return).
- Reproduction: scratch vitest at HEAD — 29 probes through the production
  executor: the nine absent-member reads including the `==` / `!=` / `match` /
  ternary dispositions, the four controls (`o[k]` panic, `has`, `keys()`,
  present field) plus the constructor-omission parse rejection, the four
  position-dependence probes across `let` bindings and `fn` parameters, and
  the eleven propagation probes (chained member and index, stdlib
  fallthrough, string concatenation, arithmetic, constructor field storage
  with its `keys()` / `has` / `==` consequences, array round-trip, and the `?`
  operand). Output quoted verbatim above, then deleted per scratch policy.
