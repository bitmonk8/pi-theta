# Session findings — MULTI-TURN CONVERSATION DRIVE / FINAL VALUE (FN-5) / model-reply-as-value

Lens: a real user driving a conversation across several turns where CODE consumes
model output — cross-turn value flow, typed-result field flow, control-flow on a
model classification, `for`-loop per-iteration interpolation, and the FINAL VALUE
(FN-5) reaching a programmatic `invoke` caller. Focus is whether **values are
CORRECT and data-flow works**, not visibility (prompt-mode chained-query
visibility is QTL-1, KNOWN — not re-reported).

Harness: `tests/hardening/session-convdrive.test.ts` (shipped extension, live
model).

    npx vitest run --config vitest.hardening.config.ts tests/hardening/session-convdrive.test.ts

**Methodology (why every value flows through a subagent child).** Two channels
that seemed available are not:
1. The harness `toolCalls` channel captures only MODEL-driven tool calls, **not**
   loom-code-driven `read(...)` calls — a first draft that keyed cross-turn flow
   on `read({ path: <model-derived value> })` args observed an empty `toolCalls`
   array every time.
2. In prompt mode only the FIRST query is user-visible (QTL-1), so a later
   same-conversation query never appears in `userTexts`.
So the one reliable deterministic channel for a computed value is a prompt
parent's FIRST (visible) query text (`userTexts`, computed by code *before* send).
Every model-derived value under test is produced inside a **subagent child** that
drives its own multi-turn conversation and returns a FINAL VALUE; a prompt parent
reads each child's final value and renders them all into one visible query. The
batched drive's single observed `userTexts` was:

    C1=[PREV=BANANA-HIT-DONE] C2=[FIELD=MANGO-END] C4=[SEEN-A1|SEEN-B2|] BARE=[DATE] OK=[OK-ERR] EMP=[EMPTY-ERR] END

Dedupe: QTL-1 (chained-query visibility), INVCEIL-3 (untyped invoke → null),
INV-6 (typed-return validation catchable), XMODE-1/2 are prior findings and are
not re-reported. The `Ok(x)`-tail case (CONV-6) is distinct from INV-6: INV-6 is a
child whose success payload is genuinely the wrong *type*; CONV-6 is a correctly
typed success payload that is never unwrapped from its `Ok` wrapper.

Bug-verdict count: **1** (CONV-6).

---

## CONV-6 — [FIXED] a loom whose tail (or `return` operand) is `Ok(x)` is not unwrapped to its success payload; `invoke<T>` validates the `Ok(...)` wrapper against `T` and fails `return_validation`

**FIXED.** The subagent `surface` success path re-wrapped a `Result`-valued tail
into `Ok(Ok(x))`. Per FN-3 the implicit `Ok()` wrap applies only to a
*non-`Result`* operand, so a `Result`-typed tail IS the loom's terminal Result.
Fix: `production-loom-producer.ts` subagent surface now passes a `Result` value
through unchanged (`isResultValue(value) ? value : makeOk(value)`). Live probe
after the fix: `OK=[KIWI]` (was `OK=[OK-ERR]`); empty-tail still `EMP=[EMPTY-ERR]`.
npm test 1601 green.


- **repro:**
  ```
  # oktail.loom
  ---
  description: oktail
  mode: subagent
  ---
  Ok("KIWI")
  ```
  ```
  # drive.loom  (prompt)
  ---
  description: drive
  mode: prompt
  ---
  let okv = match invoke<string>("./oktail.loom") { Ok(v) => v, Err(_) => "OK-ERR" }
  @`OK=[${okv}]`?
  ```
  Invocation: `/drive`. Controls in the same drive: `baretail.loom` tail `"DATE"`
  (bare string) and `emptytail.loom` body `let z = 1` (empty tail).

- **expected:** The success payload `"KIWI"` should reach the `invoke<string>`
  caller, i.e. `okv == "KIWI"`. FN-3 (`functions.md#loom-return-type`): the loom's
  return type is wrapped in `Result<T, QueryError>` "when any contributing operand
  is itself `Result`-typed", and when wrapping applies "a `Result<U, QueryError>`
  operand contributes `U`, **a non-`Result` operand `X` contributes `X` (its path
  yields an implicit `Ok(X)`)**." The implicit `Ok(...)` wrap is defined only for
  *non-Result* operands; a `Result`-typed tail is therefore already the loom's
  terminal `Result` (`Ok("KIWI")`), success payload `"KIWI"`. FN-5
  (`functions.md#fn-5`) + `invocation.md` §Typed-return: "an `invoke` parent
  receives it as the **`Ok` payload of the returned `Result`**" — the returned
  Result being `Ok("KIWI")`, its Ok payload is `"KIWI"`, which AJV-validates
  against `string`. `return.md`'s own canonical example blesses exactly this form:
  `return Ok(area)` and the tail `Ok("")` for a `Result<string, QueryError>`
  scope.

- **observed** (deterministic `userTexts`, segment `OK=[...]`): `OK=[OK-ERR]` — the
  `Err(_)` arm fired, so `invoke<string>("./oktail.loom")` returned
  `Err(InvokeInfraError { cause: "return_validation" })`. The runtime validated the
  `Ok("KIWI")` **wrapper object** (equivalently: re-wrapped it to `Ok(Ok("KIWI"))`
  and validated the inner `Ok("KIWI")`) against the `string` schema, which fails,
  instead of unwrapping to the `"KIWI"` success payload. Contrast in the same
  drive: `BARE=[DATE]` — a bare-string tail `"DATE"` propagates correctly
  (`okv == "DATE"` for that child); and `EMP=[EMPTY-ERR]` — an empty-tail body's
  `null` final value correctly fails `invoke<string>` validation (FN-4/FN-5,
  conformant). So the `Ok(...)`-wrapper is the sole failing form.

- **verdict: BUG.** A loom (or `fn`) that ends in `Ok(x)` — the exact idiom
  `return.md` presents (`return Ok(area)`, tail `Ok("")`) — does not propagate `x`
  to an `invoke<T>` caller; the `Ok` wrapper is validated against `T` and the call
  fails `return_validation`. FN-3's "implicit `Ok(X)` only for non-`Result`
  operands" + FN-5's "`Ok` payload of the returned `Result`" jointly require the
  success payload `x` to flow. The workaround (write a bare `x` tail, or a
  `@`…`?` tail whose `?` unwraps) works, but the `Ok(x)` form silently breaks the
  typed-invoke / subagent-boundary contract. Counter-reading noted for the triage:
  a strictly literal reading of FN-5 alone ("final value = value of tail
  expression" = the `Result` object) would make the runtime conformant — but that
  reading contradicts FN-3's explicit exclusion of `Result` operands from the
  implicit-`Ok` wrap and would make `return Ok(x)` unusable as a success return,
  so the internal-consistency reading (BUG) is the reasonable one. This is the
  data-value analogue of the campaign's dominant class: a value-shaping rule
  (FN-3's Result-operand carve-out) that the shipped final-value / invoke-return
  path does not apply.

---

## Verified-conformant (bounds the search — deterministic `userTexts`)

All confirmed via the single batched drive's computed user-turn text (and the
separate `/fparent` drive for CONV-3):

- **CONV-1 — cross-turn value flow into a later query.** `chainchild` (subagent):
  `let a = @`…BANANA…`?` then `@`…PREV=${a}-…`?`. The second query's rendered text
  interpolated the first query's model answer; its reply (the child's final value)
  came back as `C1=[PREV=BANANA-…-DONE]`. Query A's model output correctly flowed
  across a turn into query B's text (guide.md "the model's responses flow back as
  values the code can inspect"). *(The literal task-1 assertion "query B's
  `userTexts[1]` contains BANANA" in a single prompt loom is unobservable here —
  query B is off-session per QTL-1 — but the DATA FLOW is confirmed via the
  subagent final value.)*

- **CONV-2 — typed-query structured field into a later query.**
  `let c: Cls = @<Cls>`…{"label":"MANGO"}`?` then `@`…FIELD=${c.label}-END`?` →
  `C2=[FIELD=MANGO-END]`. A field of a typed/validated result is correctly bound
  and interpolated into a subsequent query.

- **CONV-3 — FINAL VALUE = model reply, across the invoke/subagent boundary.**
  `fchild` (subagent) tail `@`…CHERRY…`?`; `invoke<string>` parent binds it and
  renders `FV=CHERRY` in its own visible query. The tail-query result is the loom's
  final value and crosses the subagent boundary to the programmatic caller as the
  `Ok` payload (FN-5). *(This is the `?`-unwrapped-query-tail form — the correct
  way to return a string; contrast the broken `Ok(x)` form in CONV-6.)*

- **CONV-4 — `for` loop issues N queries with correct per-iteration
  interpolation.** `for it in ["A1","B2"] { let r = @`…SEEN-${it}…`?; acc = acc + r
  + "|" }` → `C4=[SEEN-A1|SEEN-B2|]`. Both iterations fired real turns, each
  interpolated its own loop var, and each reply round-tripped back into code and
  accumulated.

- **CONV-5 — control flow on a model classification.** Between the two chainchild
  queries, `let tag = match a { "BANANA" => "HIT", _ => "MISS" }` branched on the
  model's answer; `C1=[PREV=BANANA-HIT-DONE]` shows the `"HIT"` arm was taken,
  i.e. `match` on a model reply drives control flow correctly.

- **CONV-6 controls — bare-value and empty-tail final values (conformant).**
  `BARE=[DATE]` — a bare `"DATE"` tail propagates as the string final value.
  `EMP=[EMPTY-ERR]` — an empty-tail body's `null` final value (FN-4) correctly
  fails `invoke<string>` return validation. Only the `Ok(x)` wrapper form
  (CONV-6, above) diverges.
