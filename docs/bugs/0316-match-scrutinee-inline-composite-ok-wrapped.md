# Bug 0316 — A `match` whose scrutinee is written inline as an array literal, object constructor, user-`fn` call, or nested `match` dispatches over a forged `Ok(<value>)` instead of the value: `match [1, 2] { [a, b] => a, _ => -1 }` answers `-1`, `match g() { 42 => "num", _ => "other" }` answers `"other"`, and `match [1, 2] { Ok(inner) => "wrapped", _ => "raw" }` answers `"wrapped"` — while the same scrutinee routed through a `let` binding matches correctly

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — S1 because four ordinary scrutinee spellings
  silently select the wrong arm on a core control-flow form (parse `[]`,
  `outcome=success`, wrong value), and the wrap forges a `Result` where none
  was constructed — observable through an `Ok(p)` pattern over a non-`Result`
  scrutinee, which the value model forbids; D2 because the fix is confined to
  `evalAsResult`'s caller split (the `?` operand path legitimately wants the
  implicit-Ok normalisation, the `match` scrutinee path must receive the raw
  value), but the `?`-side pin ("the pinned implicit-`Ok` wrap-unwrap stays a
  silent success", bug 0019) must be preserved and both host paths verified.
- **Kind:** defect.
  - `docs/spec_topics/expressions.md:163`–`:172` (pattern grammar): an array
    pattern matches an "exact-length array", an object pattern an "object whose
    listed fields match" — the scrutinee value `[1, 2]` IS an exact-length
    array and matches `[a, b]`.
  - `docs/spec_topics/functions.md` FN-5: a function call's value is its final
    value — for `fn g(): integer { 42 }`, the integer `42`, not `Ok(42)`.
  - `docs/spec_topics/runtime-value-model.md:14`: "Theta code observes `Result`
    only through `Ok` / `Err` constructors, `match` patterns, and `?`" — W2/W5
    observe an `Ok` that no constructor, query, tool call, or invoke produced.
- **Related:**
  - [0019](./0019-question-operand-bypasses-result-normalisation.md)
    (fixed 0.31.0) — created the shared `evalAsResult` and documented that
    "match scrutinees … legitimately need the raw non-`Result` value for
    by-value arm matching"; its bullet-2 (operator operands) honours that, its
    bullet-1 (composite/`fn`-call operands) does not. This report is bullet-1's
    match-side half.
  - [0221](./0221-object-pattern-head-name-unchecked-fires-wrong-arm.md)
    (fixed 0.167.0) — the sibling wrong-arm family from the pattern side; this
    one is from the scrutinee side.
  - [0307](./0307-value-position-query-err-aborts-body-instead-of-binding.md)
    — the checkpointed-effect arm of the same `evalAsResult` seam: a
    value-position query failure aborts the body instead of binding the
    `Err`. Disjoint arm (effect dispatch), same shared normaliser.
- **Affected** (verified at bc52da38):
  - `src/runtime/statement-executor.ts:1014` — `evalAsResult`, bullet-1
    (`:1023`–`:1033`): operand kinds `try` / `match` / `object` (`:1025`) /
    `array` (`:1026`) / user-`fn` `call` are evaluated then unconditionally
    normalised via `asResultValue(inner.value)` (`:1033`), which wraps every
    non-`Result` in `makeOk` (`:1095`).
  - `src/runtime/statement-executor.ts:1139` — `evalMatch` obtains its
    scrutinee through that same `evalAsResult`, so the wrap reaches pattern
    dispatch; the ident/literal path (`checkpointFor === null` →
    `evaluatePure`, `:1068`) and the operator path (bullet-2, `:1049`) return
    raw values, which is why the `let`-routed controls behave.
- **Observed at:** 0.287.0 (bc52da38), offline — production executor harness
  (`parseThetaDocument` → `bindPromptConversation` → `executeBody`).

## Summary

`evalAsResult` serves two consumers with opposite needs: the `?` operand (which
wants effect outcomes and fn-call returns normalised to `Result`) and the
`match` scrutinee (which needs the raw value — bullet-2's own comment says
"wrapping a non-Result value in `Ok(...)` would break by-value arm matching").
Bullet-1 wraps anyway for five operand kinds. Any `match` whose scrutinee is
spelled inline as an array literal, an object constructor, a user-`fn` call, or
a nested `match` therefore dispatches over `Ok(<value>)`: array/object patterns
and value literals never match (cross-type against a `Result`), wildcard or
`Ok(p)` arms silently win, and the same program with the scrutinee hoisted into
a `let` behaves correctly — a positional inconsistency invisible to authors.

## Reproduction

Offline, deterministic; body sources under `mode: prompt` frontmatter, executed
via `executeBody`. Parse diagnostics `[]` in every row.

| # | Source (body) | Observed | Expected |
|---|---|---|---|
| W1 | `let v = match [1, 2] { [a, b] => a, _ => -1 }` / `v` | `value=-1` | `1` |
| W2 | `let v = match [1, 2] { Ok(inner) => "wrapped", _ => "raw" }` / `v` | `value="wrapped"` | `"raw"` |
| W3 (control) | `let xs = [1, 2]` / `let v = match xs { [a, b] => a, _ => -1 }` / `v` | `value=1` | `1` |
| W4 | `fn g(): integer { 42 }` / `let v = match g() { 42 => "num", _ => "other" }` / `v` | `value="other"` | `"num"` |
| W5 | `fn g(): integer { 42 }` / `let v = match g() { Ok(inner) => inner, _ => -1 }` / `v` | `value=42` | `MatchError` or `-1` (no `Ok` exists) |
| W6 | `schema P { a: integer }` / `let v = match (P { a: 7 }) { P { a } => a, _ => -1 }` / `v` | `value=-1` | `7` |
| W7 | `let v = match (match 1 { _ => 2 }) { 2 => "two", _ => "no" }` / `v` | `value="no"` | `"two"` |
| W8 (control) | `fn g(): integer { 42 }` / `let x = g()` / `let v = match x { 42 => "num", _ => "other" }` / `v` | `value="num"` | `"num"` |

W2 and W5 are the forgery witnesses: an `Ok(p)` constructor pattern — which
per bug 0017's brand discipline matches only constructor-built `Result`s —
matches a scrutinee the author wrote as a plain array literal / integer-typed
`fn` call. W3/W8 prove the divergence is positional: the same match over the
same value differs by whether the scrutinee was hoisted through a binding.

## Expected behaviour

The pattern-grammar table (expressions.md:163–172) defines matching over the
scrutinee *value*; no spec sentence wraps a pure scrutinee. The forms whose
scrutinees legitimately surface `Result` are the effects (`@`-query, tool
call, `invoke`) — their normalisation is specified by their own pages and
implemented on `evalAsResult`'s checkpointed path (`:1083`), which this report
does not touch. A user-`fn` call's value is FN-5's final value; a fn that
returns a `Result` does so via its own body (and then `asResultValue` passes
it through unchanged), never via caller-side wrapping.

## Actual behaviour / root cause

`evalAsResult` bullet-1 (`statement-executor.ts:1023`–`:1033`) evaluates the
operand through `evalExpr` and returns `asResultValue(inner.value)`. The wrap
exists for the `?` operand path — `evalTry`'s guard comment (bug 0019) pins
that bullet-1 operands arrive "already `asResultValue`-normalised (the pinned
implicit-`Ok` wrap-unwrap stays a silent success)". `evalMatch` (`:1139`)
shares the function, so match scrutinees of those kinds inherit a wrap that
exists only to make `?` a no-op on them. Bullet-2 (operator operands) and the
pure fall-through already return raw values for the match path — the split
this fix needs is already half-drawn.

## Why it matters

`match` over an inline `fn` call is the documented idiom for dispatching on a
computed value (`match rate(x) { ... }`); `match` over a constructed value or
literal composite appears in every non-trivial theta. Every such site
currently selects arms against a phantom `Result`: literal and destructuring
arms are dead, `_` arms swallow everything, and programs "work" only until an
author adds the natural first-arm pattern. Silent wrong values on the core
dispatch form — impact class 1.

## Non-goals

- The checkpointed-effect normalisation (`:1083`) — queries/tool
  calls/invokes matching `Ok`/`Err` is specified behaviour and must not
  change.
- The `?` operand path — the implicit-Ok wrap-unwrap on `?` is a pinned
  silent success (bug 0019's fix) and stays.
- The object-pattern-vs-`Result`-carrier defect (filed separately in this
  campaign as candidate 04) — orthogonal: it concerns which values an object
  pattern *admits*, not what value the scrutinee holds.

## Fix

Split the normalisation by consumer: give `evalMatch` a raw-scrutinee variant
of `evalAsResult` (bullet-1 kinds evaluated through `evalExpr` and returned
unwrapped; checkpointed effects still normalised via `asResultValue` on the
effect path), or thread a `wrap: boolean` through `evalAsResult` set false by
`evalMatch` for the non-effect kinds. `evalTry` keeps today's behaviour
verbatim. Both executor and any pure-host twin must move in lockstep (the bug
0027 lockstep obligation). Verification: W1–W8 as fixtures — W1/W2/W4–W7 flip
to the Expected column, W3/W8 stay green; plus one effect-scrutinee control
(`match` over a query/tool double still sees `Ok`/`Err`).

## Provenance

Found during the runtime-mutation hunt at bc52da38: a `__proto__` probe's
array-pattern control unexpectedly took the wildcard arm, and tracing it led
to `evalAsResult` bullet-1. All eight rows probed offline through the
production executor harness before filing. Scratch probes deleted.
