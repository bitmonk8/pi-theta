# Bug 0019 — `?` on a member/index/identifier operand bypasses both the ERR-18 static gate and `asResultValue` normalisation; the blind unwrap forges a fabricated cancellation or silently binds `undefined`

- **Status:** fixed (0.31.0). Bug doc Option 1, both halves — `evalTry`
  verifies the resolved operand with the brand-based `isResultValue` after
  `evalAsResult` and throws `QuestionOperandDefectError` (a plain Error on
  the `theta/runtime/internal-error` surface, the precedent defect-class
  routing) instead of blind-casting, and `questionOperandKind` classifies
  `union` / `object` CompatTypes as non-result so a union-typed operand is
  rejected at load. No new diagnostic code; the closed panic-source list
  and both code registries are unchanged.
- **Kind:** defect — implementation diverges from the specified static
  contract. [ERR-18](../spec_topics/expressions.md#err-18) pins the `?`
  operand-type precondition as a **total static check**: an operand that does
  not type as `Result<T, QueryError>` is `theta/parse/question-on-non-result`,
  the theta fails to load, and "there is no runtime disposition". The shipped
  static classifier fires only for operands whose inferred type is a
  primitive, literal, or array; member accesses, index reads, and identifiers
  bound to schema objects are left unclassified with a code comment claiming
  they "defer to the runtime safety net"
  (`src/parser/type-layer-checks.ts:838`) — but no runtime net exists. At
  runtime these operand kinds skip the `asResultValue` normalisation that
  every effect operand receives, `evalTry` blind-casts the raw value to
  `ResultValue`, and `evaluateQuestion` reads `.ok` off a non-`Result`. The
  spec defines no behaviour for any of this; what the implementation does is
  silent corruption in both directions (a valid value becomes a failure; a
  failure-shaped value becomes a success carrying `undefined`).
- **Affected:** at HEAD `28ce714d`:
  - `questionOperandKind` (`src/parser/type-layer-checks.ts:840`) — the ERR-18
    classification switch (:848–857) classifies only `prim` / `literal` /
    `array` `CompatType`s; `named`, `object`, and `union` fall to
    `default: undefined` → no diagnostic. The checker proper
    (`checkQuestionOperand`, `src/parser/match-result.ts:66`) is correct for
    classified input; it is never consulted for these operands.
  - `src/parser/static-type-inference.ts` — the types feeding that switch:
    a member access types as a nominal reference to its own field name
    (:242), an index read on a non-statically-array target as `named "index"`
    (:245), an unbound identifier as `named <name>` (:211), a call as
    `named <callee>` (:251). Every one lands in the unclassified arm.
  - `evalAsResult` (`src/runtime/statement-executor.ts:946`) — the
    `index` / `member` / `binary` / `ternary` / `method-call` arm (:976–985)
    returns the operand's raw value with no `Result` guarantee, on the stated
    premise "ERR-18 guarantees a `?` operand is already `Result`-typed"
    (:972–973); a bare identifier falls through to the pure host (:987–990)
    and is likewise returned raw. Both paths bypass `asResultValue` (:1024),
    the CONV-6 implicit-`Ok` wrap every effect operand receives.
  - `evalTry` (`src/runtime/statement-executor.ts:1035`) — casts the operand
    value blind (`operand.value as ResultValue`, :1040) and hands it to
    `evaluateQuestion` (`src/runtime/runtime-panics.ts:222`), which reads
    `.ok` off the cast value (:225–226) with no `isResultValue` check.
  - Downstream mis-surfacing: the prompt-mode `surface`
    (`src/extension/production-theta-producer.ts:1559`) and
    `surfaceCalleeFinalValue` (:3311) both map a fail outcome through
    `execution.error ?? makeCancelledError()`. The forged propagation carries
    `err === undefined`, so the `??` **fabricates a `CancelledError`** — the
    exact thing the adjacent comment (:1554–1557) says must never happen
    ("NEVER fabricate a `cancelled` for a fail (STL-6)").
- **Observed at:** `0.28.0` (`28ce714d`). Fully offline and deterministic —
  no live model, no provider.

## Fix (0.31.0)

Bug doc Option 1, both halves: the brand-based runtime guard at the unwrap
(the load-bearing half — total over unknowable-typed ingress) plus the
incremental widening of the ERR-18 static classifier. Guard in
`src/runtime/statement-executor.ts` / `src/runtime/runtime-panics.ts`,
widening in `src/parser/type-layer-checks.ts` (line anchors at the fix
commit).

**Runtime brand guard (`statement-executor.ts:1061–1063`).** `evalTry`
(:1046) verifies the resolved operand value with the brand-based
`isResultValue` and throws `QuestionOperandDefectError` for a non-`Result`;
the blind `as ResultValue` cast is removed. Placement (rationale comment
:1051–1060): the guard sits in `evalTry`, not `evalAsResult` — that path
also serves `match` scrutinees, which legitimately need the raw
non-`Result` value for by-value arm matching — and AFTER `evalAsResult`, so
bullet-1 operands (object / array / user-`fn` call) are already
`asResultValue`-normalised (the pinned b-series `f()?` implicit-`Ok`
wrap-unwrap stays a silent success) and a genuine stored `Result` passes
the brand test untouched. What remains at the guard is exactly the ingress
no static check can classify — member / index / identifier operands typed
as `named` placeholders, code-tool returns, permissive `{}` lowerings — so
the guard is total where the gate cannot be: both silent-corruption
flavours become one loud abort, and the `error === undefined` feeder into
the `?? makeCancelledError()` fabrication is starved (`executeBody`
rejects; `binding.surface` is never fed the forged fail).

**Defect error (`runtime-panics.ts:257–264`).** `QuestionOperandDefectError`
is housed beside `evaluateQuestion` — the unwrap whose `Result`-operand
precondition it enforces — as the precedent defect classes live beside the
lowerings whose parse-gate preconditions they enforce
(`PiToolArgShapeDefectError`, bug 0003, and
`ShadowedCalleeDispatchDefectError`, bug 0016, both
`src/runtime/tool-call.ts`). It is a plain thrown Error routed to the
`theta/runtime/internal-error` surface by the top-level slash catch and
framed via `surfaceUnexpectedThrow`, exactly like those precedents. The
message (:260) names the spec anchor whose gate leaked and the gate that
should have rejected the site: `internal defect: '?' operand evaluated to a
non-Result value (<summary>); the parse-time ERR-18 operand gate
(theta/parse/question-on-non-result) did not reject this site — a gate gap
(bug 0019)`. The summary is `summariseNonResultOperand` (:277–299),
defensive by construction: `typeof` plus, for objects, a shallow
descriptor — the interpreter-private schema/enum tag when present, else an
own enumerable key list capped at four names — never field values, never
`JSON.stringify` (cycles, unbounded size). `evaluateQuestion` keeps its
internal cast, now documented as sound only under the caller contract
(:222–224): a new caller must guard likewise.

**Static widening (`type-layer-checks.ts:859–865`).** `questionOperandKind`
(:844) gains `union` and `object` arms classifying as `non-result` with
`display: displayType(type)`, so a union-annotated `fn` parameter under `?`
is rejected at load with the registry message (`'?' requires a Result
operand; got number | string`). The `named` arm is deliberately untouched:
every genuine-`Result` placeholder — `Ok` / `Err` / `Result<…>` / a query
result — types as a `named` reference, so classifying it would
false-positive real `Result`s; those operands stay with the runtime guard.
The new arms cannot false-positive either: a `Result` never types as a
union or an inline object type, and `#commonType`
(`static-type-inference.ts:335`) never synthesizes a union (it selects an
existing candidate or falls back to the first), so a union reaches a `?`
operand site only through a fn-param annotation — and a union carrying a
`Result` alternative is still not `Result<T, QueryError>`, so rejecting it
is the outcome ERR-18 specifies, not a false positive. No real source
constructs an `object` CompatType at a `?` operand site today (an inline
object annotation lowers to a nominal `named` reference; the inference pass
never yields an `object` CompatType there), so that arm is pinned at the
seam level (message contract).

**Registries.** No new diagnostic code is minted: the defect rides the
existing `theta/runtime/internal-error` surface, the closed runtime
panic-source list (`error-model.md`) stays closed, and both code registries
(`code-registry-parse.md`, `code-registry-runtime.md`) are unchanged. No
new REQ-ID; the coverage matrix is unchanged — the `ERR-18 | V4a` row
(`docs/plan_topics/coverage-matrix.md`) remains the closing leaf.

**Verification.** Full default suite 220 files / 2560 tests green;
typecheck and lint clean. Offline lock:
`tests/question-operand-defect.test.ts` — the m1–m6 matrix driven through
the production prompt-mode binding, the s1 surface-chain pin (the m1 defect
rejects out of `executeBody`, so `binding.surface` is never fed the forged
fail), the s2 genuine-`Err` control (the real leaf error renders —
`theta /bug0019 returned Err: transport — boom` — never `cancelled`), and
the identifier / index stored-`Result` pass-through controls (`?` over a
genuine stored `Ok` still unwraps). 7 red at 7fa76517 with the pre-fix
signatures (outcome `fail` with `error === undefined`; m4 outcome `success`
carrying `null`), green post-fix; the red direction re-proven by reverting
the guard and restoring byte-identical (hash-verified). Static gate: the
union fn-param case red-then-green through the production parse in
`tests/match-result.test.ts`,
`tests/type-layer-diagnostics-production.test.ts` (the exact message pinned
through the production route), and
`tests/conformance/production-conformance.test.ts`, plus the seam-level
message-contract pins for both widened arms. Live:
`tests/live/live-production-acceptance.test.ts` 5/5;
`tests/live/hardening/recent-rfc-live-drives.test.ts` 3/3 — its drives run
`?` over genuine live `Result`s (query / `invoke` / tool-call results) on
the guarded path, the live false-positive witness. New hardening witness
`tests/live/hardening/question-operand-defect-abort.test.ts`: the m1
fixture end-to-end through the shipped extension and a real slash dispatch,
asserted on per-turn `systemNotes` — exactly one
`theta /bug0019m1 aborted with internal error: …` note naming ERR-18 and
`theta/parse/question-on-non-result`, zero `theta /bug0019m1 cancelled`
notes, no user turn reaching the model (the body is pure); red-proven under
guard revert, where the fabricated `theta /bug0019m1 cancelled` note
reappears verbatim, then restored green.

**Boundary (reviewer).** At the ERR-20 `par for` iteration boundary the
defect throw is downgraded — like every non-panic interpreter throw — to
that element's `Err(invoke_infra, cause "internal_error")`
(`parForPanicError`, `statement-executor.ts:1170`): the message is
preserved in the element `Err`, siblings run to completion, nothing is
silent.

Adjacent pre-existing issue identified during review, out of scope, not
filed here: schema-constructor field values are presence-checked only
(`theta/parse/missing-object-field` / `theta/parse/extra-object-field`
check field names, never field-value types), and an undeclared-schema
constructor (`Mystery { r: Ok(1) }`) parses clean and runs —
`checkObjectExpr` defers when the constructor name is not a declared object
schema. Surfaced while probing the member-route control; a static-gate gap
family distinct from ERR-18.

**Coordination with bug 0079** (added at that report's fix). This fix left the
`Result`-shaped static gate partial by design on the `?` operand, and the sibling
position it does not cover — the QRY-18 interpolation render — had no gate at
all. [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md)
closed that position in 0.69.0 with the same asymmetry this report pins: the
type layer emits only where provenance is certain, and an unprovable
interpolation falls to a runtime panic rather than a false load refusal.
`questionOperandKind` and this report's `evalTry` brand guard are untouched by
it.

## Summary

Applying `?` to an operand that is a member access, an index read, or a bare
identifier is never checked against ERR-18's operand-type precondition: a
theta whose `?` operand is a plain schema object — statically declared as
such — loads without diagnostic. At runtime the operand value reaches the
`?` unwrap raw (no `asResultValue` normalisation) and is blind-cast to
`ResultValue`. The unwrap then reads `.ok` off a non-`Result`:

- A plain value (no `ok` field): `.ok` is `undefined` → the falsy arm fires →
  `?` **early-returns `Err(undefined)`**. A valid value silently becomes a
  body failure with a vacuous payload — and because the terminal surface maps
  a fail with an undefined error through `?? makeCancelledError()`, the
  operator is told `theta /<name> cancelled` and an `invoke` parent observes
  `Err(CancelledError)`. Nothing was cancelled; nothing names `?` or the
  site.
- A user object carrying `ok: true`: `?` unwraps its nonexistent `.value` →
  the binding is `undefined`, downstream member access aborts with
  `null member access: .<field>`. This is bug 0017's corruption signature,
  still live post-0017: the fix closed the *classification* boundary
  (`isResultValue` now brands), but these operand kinds never reach a
  classification boundary at all.
- A user object carrying `ok: false`: `?` propagates its nonexistent
  `.error` → the same fabricated cancellation as the plain-value case.

Recorded as residual (i) in bug 0017's Fix section
([0017](./0017-ok-field-object-misclassified-as-result.md), "Adjacent
pre-existing issues identified during review"); it predates that fix.

## Reproduction

Offline, deterministic, at `28ce714d`. Harness: the production prompt-mode
binding used by `tests/result-value-privacy.test.ts` §"Shared harness" —
`parseThetaDocument` → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody`, with the parse step failing loudly
on any error-severity diagnostic (so "it ran" itself proves ERR-18 did not
fire). Fixtures use schema-named constructors (bare object literals are
`theta/parse/bare-object-literal`, an unrelated rejection).

Member operand (the canonical form):

```theta
---
mode: prompt
---
schema Inner { a: number }
schema Outer { r: Inner }
let o = Outer { r: Inner { a: 1 } }
let v = o.r?
v
```

Matrix (all probed through the harness above; "static" = error diagnostics at
parse, "runtime" = `BodyExecution` observables):

| # | operand kind | operand value | static | runtime |
|---|---|---|---|---|
| m1 | member `o.r?` | plain object `{ a: 1 }` | none — loads | outcome `fail`, `error === undefined` |
| m2 | index `xs[0]?` | plain object element | none — loads | outcome `fail`, `error === undefined` |
| m3 | identifier `x?` | plain object binding | none — loads | outcome `fail`, `error === undefined` |
| m4 | member `o.r?` | `Out { ok: true, label: "x" }` | none — loads | outcome `success`, value `null` — the payload is gone |
| m4b | m4 then `v.label` | 〃 | none — loads | `NullMemberAccessPanic: null member access: .label` |
| m5 | member `o.r?` | `Out { ok: false, reason: "y" }` | none — loads | outcome `fail`, `error === undefined` |
| m6 | member `p.n?` | primitive field `5` | none — loads | outcome `fail`, `error === undefined` |
| control | identifier `x?` bound to literal `5` | — | `theta/parse/question-on-non-result` fires | (does not load) |

The control pins that the ERR-18 gate exists and works for classified types;
the gap is specifically the unclassified `CompatType` kinds. m6 pins that
even a *primitive* escapes the gate when reached through a member access —
the member's inferred type is a nominal reference to the field name, not the
field's declared type.

Slash-surface observable for m1 (probed through `binding.surface` +
`renderTopLevelErrNote`, the exact SLSH-3 path of
`theta-composition-producer.ts:431`):

```
execution: outcome "fail", error undefined
surface:   { ok: false, error: { kind: "cancelled", message: "cancelled" } }
note:      "theta /bug0019 cancelled"
```

## Expected behaviour (what the spec says)

[ERR-18](../spec_topics/expressions.md#err-18)
(`docs/spec_topics/expressions.md:203`):

> The operand to which `?` is applied MUST itself have Theta static type
> `Result<T, QueryError>` for some `T` […] Applying `?` to an operand of any
> other type — e.g. `let x = 5?`, where `5` is `integer` — is
> `theta/parse/question-on-non-result`. The check is static (`type`-phase
> […]); its disposition is the lex / parse / type batch pre-evaluation
> failure ([ERR-2]), so no `Result` is produced and there is no runtime
> disposition — the theta fails to load.

Every matrix fixture declares its operand's type statically (schema field
declarations, array element construction, `let`-bound constructor): each is a
non-`Result`, so the specified behaviour for m1–m6 is a
`theta/parse/question-on-non-result` load rejection. There is no spec arm
under which any of them evaluates: the closed runtime panic list
(`docs/spec_topics/errors-and-results/error-model.md#runtime-panics`) has no
question-on-non-result source, and the runtime code registry
(`docs/spec_topics/diagnostics/code-registry-runtime.md`) registers no such
code — the spec's premise is the static gate's totality.

The normalisation the bypass skips: `asResultValue`
(`src/runtime/statement-executor.ts:1024`) is the implementation carrier of
the CONV-6 implicit-`Ok` wrap (a plan-era REQ-ID with no surviving spec
anchor; named in `src/extension/production-theta-producer.ts:3296` and
throughout bug 0017) — "Normalise an effect's clean value to a `Result`: a
`Result` passes through, else `Ok(value)`". Effect operands (`@`-query,
tool call, `invoke`) and object/array/user-`fn`-call operands all route
through it; the bullet-2 operand kinds and bare identifiers do not.

## Actual behaviour / root cause

Three layers, each individually defensible, jointly a silent-corruption path:

1. **The static gate is partial.** `questionOperandKind`
   (`type-layer-checks.ts:840`) classifies only `prim` / `literal` / `array`
   inferred types; everything else returns `undefined` → no check. The
   inference pass (`static-type-inference.ts`) types member accesses as a
   nominal reference *to the field name* (:242), non-array index reads as
   `named "index"` (:245), and call results as `named <callee>` (:251) —
   placeholders that can never classify. The comment (:832–838) justifies
   the skip as "defers to the runtime safety net".
2. **There is no runtime safety net.** `evalAsResult` returns
   member/index/binary/ternary/method-call operands raw (:976–985, on the
   explicit premise that ERR-18 already guaranteed `Result`-ness) and bare
   identifiers raw through the pure host (:987–990). `evalTry` (:1040)
   casts blind; `evaluateQuestion` (`runtime-panics.ts:225–226`) reads `.ok`
   with no `isResultValue` check. For a non-`Result`: `.ok` is `undefined`
   (or user data), so the unwrap manufactures `Err(undefined)` or unwraps a
   nonexistent `.value`.
3. **The terminal surface launders the forgery into a cancellation.** Both
   fail-outcome mappers (`production-theta-producer.ts:1559`, :3311) apply
   `execution.error ?? makeCancelledError()`. The `??` exists for genuine
   cancel flows; the forged propagation's `undefined` payload trips it, so
   the operator-facing note is `theta /<name> cancelled` (SNK-f) and an
   `invoke` parent observes `Err(CancelledError)` — a fabricated
   cancellation, in direct conflict with the STL-6 posture quoted in the
   adjacent comment.

The asymmetry inside `evalAsResult`: object / array / user-`fn`-call
operands (bullet 1, :955–966) *are* normalised via `asResultValue`, so
`f()?` over a non-`Result`-returning `fn` silently no-ops (wrap then unwrap)
— itself an ERR-18 divergence, but non-corrupting, and pinned as intended
behaviour by `tests/result-value-privacy.test.ts` (b1, :281). The raw path
exists because `evalAsResult` also serves `match` scrutinees, which need the
true value for by-value arm matching (:970–974); `?` inherited the raw value
without inheriting a guard.

## Why it matters

- **Silent corruption in both directions.** A valid value under `?` becomes
  a failure; failure-shaped user data becomes a `success` carrying `null`.
  No diagnostic names the site, the operand, or `?` at all.
- **The operator-facing signal is a lie twice over.** `theta /<name>
  cancelled` for a theta nobody cancelled sends an operator hunting through
  abort/session-teardown machinery; an `invoke` parent that `match`es on
  `cancelled` takes its cancellation arm for a data bug.
- **Bug 0017's corruption signature survives its fix.** The m4/m4b rows are
  byte-for-byte the 0017 signatures (`success`/`null`,
  `null member access: .label`) reached through operand kinds the 0017 fix
  never touches. Any schema with an `ok: boolean` field read through a
  member/index/identifier `?` re-triggers it.
- **The forms are ordinary.** `o.field?`, `xs[0]?`, `x?` are the natural
  ways to unwrap a stored `Result` — authors writing them with a
  non-`Result` get corruption instead of the teaching-moment load error the
  spec promises. (Deferred unwrap of a *genuine* stored `Result` works today
  only because the blind cast happens to read a real `.ok`.)

## Fix options and recommendation

1. **Runtime guard at the unwrap + incremental static narrowing
   (recommended).** In `evalTry`, before `evaluateQuestion`: if
   `isResultValue(operand.value)` is false, throw a defect error routed to
   the `theta/runtime/internal-error` surface, message naming ERR-18 and a
   summary of the offending value — the established pattern for
   "the parse gate should have rejected this site" leaks
   (`PiToolArgShapeDefectError`, bug 0003; `ShadowedCalleeDispatchDefectError`,
   bug 0016). This is the load-bearing half: it is total (covers
   unknowable-type ingress — code-tool returns, `{}`-lowered payloads —
   where static classification is impossible in principle), it converts both
   silent-corruption flavours into one loud abort, and it needs no new
   registry code — the closed panic-source list stays closed.
   Independently, widen `questionOperandKind`: `object` and `union`
   `CompatType`s are non-`Result` by construction and belong with
   `prim`/`literal`/`array` in the classified arm today; member-field /
   index-element / `fn`-return-annotation resolution can follow as the
   inference pass grows, moving diagnosis from runtime to load where types
   are declared. The guard also removes the `err === undefined` feeder into
   the `?? makeCancelledError()` fabrication (the `??` itself can then be
   reconsidered separately).
2. **Make the ERR-18 static check total, alone.** Rejected as the complete
   fix: totality is unattainable (unknown-typed ingress), so the blind cast
   stays reachable and silent for exactly the values most likely to be
   malformed. Resolving `fn` return annotations statically would also flip
   `f()?`-over-non-`Result` from the pinned implicit-wrap success
   (`tests/result-value-privacy.test.ts` b-series) to a load rejection —
   spec-correct, but a pinned-behaviour change that must be sequenced
   deliberately, not fall out of a gap fix.
3. **Normalise instead of guarding** — route the bypassing operand kinds
   through `asResultValue` for `?` consumers. Post-0017 this would repair
   the corruption (the brand-based `isResultValue` no longer misclassifies
   ok-carrying user data, so `asResultValue` wraps every matrix operand in a
   genuine `Ok` and `?` unwraps it back to its own value). Rejected
   nonetheless: it silently legitimises a form ERR-18 forbids — `o.r?` over
   a plain object becomes a no-op wrap-unwrap with no diagnostic ever — so
   the implementation diverges further from the specified load rejection
   instead of converging on it, and widens the bullet-1 tension option 2
   flags rather than resolving it.
4. **A new registered runtime panic**
   (`theta/runtime/question-on-non-result`). Workable but heavier than option 1
   for the same observable effect: the panic-source list is explicitly
   closed for spec-defined sources, so this requires amending
   `error-model.md`'s closed list, the code registry, and a normative
   message template. A non-`Result` reaching `?` is an interpreter-contract
   leak, not a new authoring concept — the runtime-defect surface is the
   fitting channel, per its own definition.

## Non-goals

- The `match` scrutinee raw path (`evalAsResult` bullet 2 serving `match`) —
  correct as shipped; by-value arm matching requires the true value.
- The bullet-1 implicit-`Ok` wrap for object/array/user-`fn`-call operands
  and its own ERR-18 tension (pinned by 0017's b-series) — flagged under
  option 2, resolution belongs to the fix's static-narrowing sequencing.
- The enum/schema tag descriptor hardening — bug 0017 residual (ii),
  separate.
- The `?? makeCancelledError()` mappers as such — with the guard in place no
  forged `undefined` reaches them; whether genuine fail-with-undefined
  states remain representable is a separate audit.

## Provenance

- **Origin:** bug 0017 review residual (i)
  ([0017](./0017-ok-field-object-misclassified-as-result.md) §Fix,
  "Adjacent pre-existing issues identified during review, out of scope"),
  fix commit `fa58456b`; deferred there as predating that fix.
- **Spec measured against:** [ERR-18](../spec_topics/expressions.md#err-18)
  (`docs/spec_topics/expressions.md:203`); closed runtime panic list,
  `docs/spec_topics/errors-and-results/error-model.md#runtime-panics`;
  runtime code registry,
  `docs/spec_topics/diagnostics/code-registry-runtime.md`. CONV-6 cited as a
  plan-era REQ-ID via its implementation carriers
  (`src/runtime/statement-executor.ts:1024`,
  `src/extension/production-theta-producer.ts:3296`) and bug 0017.
- **Evidence:** scratch vitest (deleted after probing) over the production
  prompt-mode binding harness pattern of
  `tests/result-value-privacy.test.ts`; matrix rows m1–m6 + control and the
  slash-surface chain (`binding.surface` → `renderTopLevelErrNote`) probed
  at `28ce714d`, all offline. Static-layer analysis:
  `src/parser/type-layer-checks.ts:818–858`,
  `src/parser/static-type-inference.ts:197–265`,
  `src/parser/match-result.ts:43–92`. Runtime-layer analysis:
  `src/runtime/statement-executor.ts:926–1047`,
  `src/runtime/runtime-panics.ts:197–229`,
  `src/extension/production-theta-producer.ts:1548–1562`, :3296–3312,
  `src/extension/theta-composition-producer.ts:412–432`,
  `src/runtime/err-note-render.ts:105–197`.

## Coordination note — bug 0136 landed (0.106.0)

Row `m6` of this report's reproduction matrix moved, on parent authority, from a
runtime-guard row to a static-refusal row. Its premise comment stated bug 0136's
defect verbatim — "the member's inferred type is a nominal reference to the FIELD
NAME (`named "n"`), not the field's declared `number`, so only the runtime guard
can catch it" — and bug 0136 dissolved that premise.

Bug 0136 fixed `#typeExpr`'s `case "member"` arm to answer the receiver's
declared field type. So in `schema P { n: number }` / `let p = P { n: 5 }` /
`let v = p.n?`, the operand of `?` now statically types `number`, ERR-18's parse
gate decides the site, and the observable delta is:

- `m6`: was a drive that RESOLVED with a corrupted outcome (outcome fail,
  `error === undefined`), now one `theta/parse/question-on-non-result` at parse —
  `'?' requires a Result operand; got number` — at `error` severity, so
  `hasLoadParseError` denies registration and the body never executes.

That is exactly what ERR-18 states for a non-`Result` operand ("there is no
runtime disposition"), and the emission sits inside the row's registered
*Trigger* as written (`code-registry-parse.md:79`: "`?` applied to an operand
whose Theta static type is not `Result<T, QueryError>` for some `T`") — the
`source-language-stability.md:25` carve-out, with no row added, removed or
re-triggered.

**This report's subject is preserved.** The runtime brand guard is the finding,
and it stays witnessed by `m1`–`m5` and both CONTROL rows, all byte-untouched and
green: their operands remain statically unclassifiable, because an object-schema
`named` is still not statically a `Result` (`m1`, `m4`, `m5`), an index read of a
plain object element is not (`m2`), and an unannotated binding records its
initialiser's inferred type (`m3`, the `Ok(5)` CONTROL). `m5` in particular was
re-measured green. The `s1`/`s2` fail-surface block is byte-untouched: `s1` still
drives `m1`'s fixture, so the SLSH-3 fabricated-cancellation pin is unaffected.
Bug 0136's authority for the move is recorded verbatim in its own
`## Fix (0.106.0)` section.
