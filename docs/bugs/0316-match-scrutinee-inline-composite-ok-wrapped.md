# Bug 0316 — A `match` whose scrutinee is written inline as an array literal, object constructor, user-`fn` call, or nested `match` dispatches over a forged `Ok(<value>)` instead of the value: `match [1, 2] { [a, b] => a, _ => -1 }` answers `-1`, `match g() { 42 => "num", _ => "other" }` answers `"other"`, and `match [1, 2] { Ok(inner) => "wrapped", _ => "raw" }` answers `"wrapped"` — while the same scrutinee routed through a `let` binding matches correctly

- **Status:** fixed (0.295.0).
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
    value; the caller additionally wraps a non-`Result` tail in `Ok` at the
    fn-call boundary (the CONV-6 convention, bug 0017 — preserved here per the
    Ratification note below). The defect is that this same wrap ALSO reached
    inline composite / `try` / nested-`match` scrutinees, which are not fn-call
    boundaries and carry the scrutinee's own value.
  - `docs/spec_topics/runtime-value-model.md:14`: "Theta code observes `Result`
    only through `Ok` / `Err` constructors, `match` patterns, and `?`" — W2
    observes an `Ok` that no constructor, query, tool call, or invoke produced
    over a plain array literal (W5's `Ok`, by contrast, is caller-constructed
    at the fn-call boundary under CONV-6 and is a control, not a forgery).
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

## Fix (0.295.0)

- **What shipped:**
  - `src/runtime/statement-executor.ts` — `evalAsResult` gains a fourth param
    `wrapInlineComposites = true`; bullet-1 wraps a non-`Result` in `Ok` only
    when `wrap = isUserFnCall || wrapInlineComposites`, so a user-`fn` `call`
    scrutinee keeps the CONV-6 wrap while an inline `object` / `array` / `try`
    / nested `match` scrutinee is returned raw; `evalMatch` passes `false`;
    `evalTry` and the checkpointed-effect arm are byte-unchanged.
  - `tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts` (new) —
    nine offline production-executor cases: W1/W2/W6/W7 witnesses (flip),
    W3/W8 positional controls, W4/W5 0017-contract controls, and one
    effect-scrutinee control driven through a scripted `RecordingQueryModel`.
  - `docs/spec_topics/expressions.md` — §`match` gains one "Scrutinee value"
    sentence scoping the implicit-`Ok` wrap to fallible-computation
    boundaries (effects per their own pages; user-`fn`-call tail wrapped;
    inline composite / `?` / nested `match` raw).
  - `docs/bugs/0316-…md` — §Expected/§Fix/§Kind rescoped, W4/W5 rows and the
    forgery paragraph re-documented as 0017-contract controls, dated
    Ratification note added.
  - `docs/bugs/0017-…md` — append-only coordination note recording that b4/b7
    (CONV-6 fn-call boundary) were examined against 0316 and PRESERVED.
- **Gates:** witness `npx vitest run tests/b0316-…test.ts` → 9/9 green (W1/W2/W6/W7
  flip green; five controls green); neutralise-and-restore proves the four
  witnesses red with the fix reverted (byte-exact restore, `git hash-object`
  `c2cc0bf6…` before == after). Full default suite `npx vitest run` → 472 files /
  9514 passed / 0 failed (9505 baseline + 9 new). `npm run typecheck` clean;
  `npm run lint` clean.
- **Review:** 1 pre-review correction round (comment/citation-only: stale
  inline comment + shifted `statement-executor.ts` line cites) + 3 review
  rounds. R1 (`bug-fix-reviewer`): F1 fidelity (bug-doc amendments incomplete),
  F2 spec (non-spec terms `try`/object-literal), F3 test (line cites off by 2)
  — all doc/spec/citation, fixed by the orchestrator. R2 (`bug-fix-reviewer`):
  F1' fidelity (residual "fn-call `Ok` is a forgery" claims in §Kind bullets and
  forgery paragraph) — fixed. R3 (`bug-fix-reviewer-fast`): CLEAN (only the four
  accepted residuals).
- **Verification (`bug-fix-verifier`: SOLID):** (1) witness bidirectional —
  neutralising `evalMatch`'s `false` reds exactly W1/W2/W6/W7, restore is
  byte-exact, all 9 green; (2) full suite 9514 green; (3) no live cell owed —
  match-internal scrutinee-normalisation value change, fully observable
  offline, no registration/live-observable surface change; `permitted-codes.json`
  byte-unchanged vs HEAD, no new/changed diagnostic code (no DIAG-2 obligation);
  (4) lint + typecheck clean.
- **Untouched locks:** `tests/result-value-privacy.test.ts` b4
  (`match f() { Ok(v) => v, … }` binds the full object) and b7 (`match` over
  `{ ok: false, … }` user data takes the `Ok(v)` arm) — the bug-0017 CONV-6
  fn-call-boundary contract — stay green and BYTE-UNTOUCHED (file has no diff).
- **Residuals (parent files any bug docs):**
  1. No direct witness for the `try` scrutinee kind (`match g()? { … }`). The
     ratified flip set is W1/W2/W6/W7 only; the single shared `wrap` expression
     (`statement-executor.ts:1112`) makes per-kind drift structurally
     implausible. Evidence: round-2 R3 / round-3 R3.
  2. The as-filed H1 headline and §Why-it-matters retain the fn-call framing
     (filing identity matching the filename; as-filed severity rationale). The
     dated Ratification note is the amendment mechanism. Evidence: round-2
     R1/R2, accepted round 3.
  3. Mid-file spec insertion in `expressions.md` shifts +2 lines below
     `:182`, staling previously-exact `expressions.md` line cites in unrelated
     test files (`b0117-…:30`, `absent-member-…:838`). No gate enforces them;
     the repo already tolerates such drift; left untouched (not this bug's
     files). Evidence: round-1 R3.
  4. `isUserFnCall` duplicates the `if`-condition's last disjunct
     (`statement-executor.ts:1106`). Correct and race-free (`resolveUserFn` is a
     pure `env.resolve` read); a mild future-drift hazard, non-blocking.
     Evidence: round-1 R1.
- **Discharge notes appended:** `docs/bugs/0017-…md` (b4/b7 CONV-6 boundary
  examined and preserved, append-only).
- **Pinned dispositions / non-goals:** the checkpointed-effect arm (bug 0307)
  stays byte-equivalent — the effect-scrutinee control witnesses `Ok`/`Err`
  dispatch unchanged; `matchPattern` (bugs 0317/0318) is untouched (fix is
  scrutinee-side only); the pure-host twin `evaluatePureExpression` does not
  evaluate `match` (`default: return null`), so the bug-0027 lockstep
  obligation has no second site here.

**Parent ratification (verbatim).** OPTION 2 WITH A PRINCIPLED BOUNDARY — the
CONV-6 implicit wrap in match-scrutinee position is a FN-CALL-BOUNDARY
convention: a user-fn call is a fallible-computation boundary, and wrapping its
non-Result tail in Ok gives `match f() { Ok/Err }` total coverage — that is bug
0017's landed, author-relied-upon contract (b4/b7 in
tests/result-value-privacy.test.ts) and it STANDS BYTE-UNTOUCHED. Inline
composites (object constructors, array literals), try-expression values, and
nested-match values are NOT computation boundaries — forging Ok around them is
the defect 0316 reports. Therefore: the evalAsResult consumer split removes the
bullet-1 wrap in match-scrutinee position for the object/array/try/match kinds
ONLY; the `call` kind KEEPS the wrap. evalTry stays verbatim (default
wrap=true). The checkpointed-effect arm stays byte-equivalent (0307 owns it).
Witness enumeration amended: W1/W2/W6/W7 flip; W3/W8 stay green as controls;
W4/W5 are REMOVED from the flip set and REWRITTEN as named CONTROLS pinning the
0017 contract (W4 `match f(){ "num"=>"num", _=>"other" }` with f():string{"num"}
stays "other" — wrapped; W5 `match g(){ Ok(inner)=>inner, _=>-1 }` with
g():integer{42} stays 42 — Ok matches the CONV-6 wrap). A spec sentence scoping
the match-scrutinee wrap to fn-call boundaries is owed same-commit; the doc's
quoted "never via caller-side wrapping" phrasing is the doc author's synthesis
(absent verbatim from the spec), so no FN-5 requalification is owed — recorded.

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
| W4 (control, 0017 fn-call boundary) | `fn f(): string { "num" }` / `let v = match f() { "num" => "num", _ => "other" }` / `v` | `value="other"` | `"other"` (stays wrapped) |
| W5 (control, 0017 fn-call boundary) | `fn g(): integer { 42 }` / `let v = match g() { Ok(inner) => inner, _ => -1 }` / `v` | `value=42` | `42` (Ok matches the wrap) |
| W6 | `schema P { a: integer }` / `let v = match (P { a: 7 }) { P { a } => a, _ => -1 }` / `v` | `value=-1` | `7` |
| W7 | `let v = match (match 1 { _ => 2 }) { 2 => "two", _ => "no" }` / `v` | `value="no"` | `"two"` |
| W8 (control) | `fn g(): integer { 42 }` / `let x = g()` / `let v = match x { 42 => "num", _ => "other" }` / `v` | `value="num"` | `"num"` |

**Ratification (2026-08-27).** Option 2 with a fn-call boundary. W4/W5 are
re-documented as CONTROLS, not witnesses: a user-`fn` call is a
fallible-computation boundary, so bug 0017's landed CONV-6 fn-call-boundary
convention wraps its non-`Result` tail in `Ok` (keeping `match f() { Ok/Err }`
total), and that contract stands byte-untouched (bug 0017 §Fix; its b4/b7
witnesses in `tests/result-value-privacy.test.ts`). W4 therefore stays
`"other"` (wrapped `Ok("num")` misses the literal arm, wildcard wins) and W5
stays `42` (`Ok(inner)` matches the wrap). The flip set is W1/W2/W6/W7 only.

W2 is the forgery witness: an `Ok(p)` constructor pattern — which per bug
0017's brand discipline matches only constructor-built `Result`s — matches a
scrutinee the author wrote as a plain array literal. W3/W8 prove the
divergence is positional: the same match over the same value differs by
whether the scrutinee was hoisted through a binding.

## Expected behaviour

The pattern-grammar table (expressions.md:163–172) defines matching over the
scrutinee *value*; no spec sentence wraps a pure scrutinee. The forms whose
scrutinees legitimately surface `Result` are the effects (`@`-query, tool
call, `invoke`) — their normalisation is specified by their own pages and
implemented on `evalAsResult`'s checkpointed path (`:1083`), which this report
does not touch. A user-`fn` call's value is FN-5's final value, and a fn that
returns a `Result` does so via its own body (which `asResultValue` passes
through unchanged); a user-`fn` call's non-`Result` tail is additionally
wrapped in `Ok` at the caller — the CONV-6 fn-call-boundary convention that
bug 0017 relies on, and which this report leaves untouched. Caller-side
`Ok`-wrapping applies at fn-call boundaries only; an inline object/array
literal, a nested `try`, and a nested `match` scrutinee are never
caller-wrapped.

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
of `evalAsResult`, narrowed to the four non-boundary kinds: thread a
`wrapInlineComposites: boolean` (default `true`) through `evalAsResult`, set
`false` by `evalMatch`. When `false`, the bullet-1 `object` / `array` / `try`
/ `match` kinds are evaluated through `evalExpr` and returned unwrapped (the
raw scrutinee value); the user-`fn` `call` kind KEEPS the `asResultValue`
wrap unconditionally (the CONV-6 fn-call-boundary convention, bug 0017), and
the checkpointed-effect path is untouched (`asResultValue` still normalises
the effect outcome). `evalTry` keeps today's behaviour verbatim (default
`true`). The pure-host twin (`evaluatePureExpression`) does not evaluate
`match` — it falls to `default: return null` — so the bug 0027 lockstep
obligation has no second site here. Verification: W1–W8 as fixtures —
W1/W2/W6/W7 flip to the Expected column, W3/W4/W5/W8 stay green (W4/W5 as
0017-contract controls per the Ratification note above); plus one
effect-scrutinee control (`match` over a query double still sees `Ok`/`Err`).

## Provenance

Found during the runtime-mutation hunt at bc52da38: a `__proto__` probe's
array-pattern control unexpectedly took the wildcard arm, and tracing it led
to `evalAsResult` bullet-1. All eight rows probed offline through the
production executor harness before filing. Scratch probes deleted.
