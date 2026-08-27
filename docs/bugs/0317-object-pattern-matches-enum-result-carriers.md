# Bug 0317 — The runtime object pattern classifies its scrutinee by JS `typeof`, so it matches enum and `Result` carriers: `match Ok(true) { R { ok } => … }` selects the object arm ahead of a legitimate `Ok(inner)` arm and binds the internal discriminator, `Err("boom")` leaks `error` through a pattern field, and an enum scrutinee matches `{ length }` binding the boxed carrier's code-unit count — the pattern-position sibling of bug 0027's fixed read-dispatch defect

- **Status:** fixed (0.296.0).
- **Sev/Diff estimate:** S1/D2 — S1 because a parse-clean `match` reads the
  reference encoding the spec reserves the right to change without revision
  (`{ ok, value/error }`, the boxed `String`'s own properties) and mis-selects
  arms on genuine `Result` values with zero diagnostics; D2 because the gate
  is one clause in `matchPattern`'s object arm reusing the landed
  `isObjectValue` classifier, but the disposition (fail-to-match vs a
  `non-object-receiver`-style rejection) needs one adjudication and both
  match hosts share the function already.
- **Kind:** defect.
  - `docs/spec_topics/expressions.md:171`: an Object/schema pattern matches an
    "object whose listed fields match the inner patterns". An enum value and a
    `Result` value are not object values in the language's sense —
    runtime-value-model.md's enum row (`:13`) admits only the wire string plus
    an interpreter-private tag, and the `Result` row (`:14`) says "the
    in-memory shape is not part of the language surface".
  - `docs/spec_topics/runtime-value-model.md:16` (intent, non-normative):
    the reference encodings are "implementation details — neither is reachable
    from theta code".
- **Related:**
  - [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)
    (fixed 0.39.0) — the same root idea (`typeof`-based classification admits
    the two carriers) fixed at the four READ entry points
    (stdlib dispatch ×2, index, member) with `theta/runtime/non-object-receiver`
    and the `isObjectValue` classifier. The pattern-match entry point was not
    among the four and still classifies by `typeof`.
  - [0017](./0017-ok-field-object-misclassified-as-result.md)
    (fixed 0.30.0) — the inverse direction: user data with an `ok` field must
    not match `Ok(p)`. That brand discipline holds; this report is the
    forward leak (a genuine `Result` matching a plain-object pattern).
  - [0221](./0221-object-pattern-head-name-unchecked-fires-wrong-arm.md)
    (fixed 0.167.0) — made the pattern head resolve at parse; the runtime
    still drops the head (`toRuntimePattern`,
    `src/runtime/statement-executor.ts:1180`, object arm `:1192` carries
    fields only), so head declaration does not constrain the scrutinee kind.
  - [0226](./0226-declared-object-pattern-head-field-set-unchecked.md)
    (fixed 0.176.0) — parse-side field-set checking for RESOLVED pattern
    heads; its §Reproduction rows drive fixtures near-identical to P4a/P4c/
    P4d/X5 here, and its §Non-goals declines the runtime schema-vs-schema
    nominal-dispatch question. This report's carrier subset (enum / `Result`
    values taking the object arm) is disjoint from that declined question
    and fixable without answering it.
- **Affected** (verified at bc52da38):
  - `src/runtime/match-result.ts:202`–`:215` — `matchPattern` `case "object"`:
    the only receiver test is `typeof value !== "object" || value === null ||
    Array.isArray(value)` (`:206`). A boxed-`String` enum carrier and a
    branded `Result` literal both pass it; field presence is then judged by
    `Object.prototype.hasOwnProperty` (`:214`), which answers `true` for the
    `Result`'s enumerable `ok`/`value`/`error` and for the boxed `String`'s
    own non-enumerable `length` and index properties.
  - `src/runtime/value.ts:220` — `isObjectValue`, the landed single
    classification point bug 0027 built for exactly this question; its doc
    comment enumerates four consumers, none of them the pattern path.
- **Observed at:** 0.287.0 (bc52da38), offline — production executor harness
  (`parseThetaDocument` → `bindPromptConversation` → `executeBody`).

## Reproduction

Offline, deterministic; body sources under `mode: prompt`, executed via
`executeBody`. Parse diagnostics `[]` in every row (heads resolve per bug
0221's landed check; listed fields are declared per bug 0226's).

| # | Source (body) | Observed | Expected |
|---|---|---|---|
| P4a | `schema Rec { ok: boolean }` / `let r = Ok(1)` / `let v = match r { Rec { ok } => "leaked", _ => "clean" }` / `v` | `value="leaked"` | `"clean"` |
| P4b | same, arm `Rec { ok } => ok` | `value=true` (the discriminator) | `false` (`_` arm) |
| P4c | `schema Rec2 { error: string }` / `let r = Err("boom")` / `match r { Rec2 { error } => error, _ => "clean" }` | `value="boom"` (payload via carrier key) | `"clean"` |
| P4d | `enum Severity { Low, High }` / `schema Rec3 { length: integer }` / `let s = Severity.High` / `match s { Rec3 { length } => length, _ => -1 }` | `value=4` (boxed `"High"`'s `.length`) | `-1` |
| X5 | `schema R4 { ok: boolean }` / `let v = match Ok(true) { R4 { ok } => "obj-arm", Ok(inner) => "ok-arm", _ => "wild" }` / `v` | `value="obj-arm"` | `"ok-arm"` |
| P4e (control) | `schema Rec { ok: boolean }` / `let o = Rec { ok: true }` / `match o { Rec { ok } => "matched", _ => "no" }` | `value="matched"` | `"matched"` |

X5 is the arm-ordering witness: on a genuine `Result` scrutinee, an object
arm listed first silently intercepts every value the author's `Ok(inner)` arm
below was written to receive.

## Expected behaviour

runtime-value-model.md's enum and `Result` rows admit no field surface on
either carrier, and the pattern table's object row is defined over objects.
The `Result` row's closed observation list ("only through `Ok` / `Err`
constructors, `match` patterns, and `?`") means the *constructor* patterns —
the same reading bug 0027's fix took for the read surfaces, where these
scrutinee kinds draw `theta/runtime/non-object-receiver`. An object pattern
over an enum or `Result` scrutinee must fail to match (falling through to
later arms / `MatchError`) or be rejected; it must never bind `ok` / `value` /
`error` / `length` off the carrier.

## Actual behaviour / root cause

`matchPattern`'s object arm classifies by `typeof`/`Array.isArray` only
(`match-result.ts:206`) — the exact pre-0027 dispatch idiom. Both carriers
pass; `hasOwnProperty` then reads carrier-internal keys: the `Result` literal's
enumerable `ok` and payload key, and the boxed `String`'s own `length`
(non-enumerable but own) and `"0"`…`"n-1"` index keys (unreachable by
identifier-shaped field names, but `length` is declarable). The runtime pattern
also carries no head name (`toRuntimePattern` drops it,
`statement-executor.ts:1180`), so the parse-resolved head cannot re-constrain
the kind at runtime.

## Why it matters

Matching a `Result` against schema patterns is an ordinary author mistake
(and, per X5, an object arm above an `Ok` arm silently redirects the entire
`Result` population). The bound values are the reference encoding — spec-free
implementation detail that "may change without a spec revision" — so programs
written against today's leak break on any representation change, and the leak
itself contradicts the value model's closed observation list. Same impact
class as bug 0027 (which shipped a registered rejection for it): silent wrong
values plus representation exposure.

## Non-goals

- The inline-scrutinee Ok-wrap defect (candidate 03 of this campaign) —
  independent: these probes route scrutinees through bindings, so the raw
  carrier reaches the pattern.
- Static pattern-vs-scrutinee type checking (exhaustiveness is deliberately
  runtime-only in theta 1.0).
- The identifier/wildcard patterns binding a `Result`/enum scrutinee whole —
  legitimate (`match r { x => … }` observes the value opaquely).

## Fix

Add the carrier gate to `matchPattern`'s object arm: `if
(!isObjectValue(value)) return false;` beside the existing `typeof` test —
fail-to-match, so later arms (`Ok(p)` / `_`) and the existing `MatchError`
non-exhaustion path take over. That disposition (rather than a thrown
`non-object-receiver` rejection) matches the pattern table's "matches /
doesn't match" semantics and keeps `match r { Rec { ok } => …, Ok(v) => …,
_ => … }` running with the correct arm. Both match consumers (executor
`evalMatch` and any pure-host use) share `matchPattern`, so one edit covers
both; the constructor and array arms already reject the carriers correctly.
Verification: P4a–P4d and X5 flip to Expected; P4e stays green; bug 0017's
inverse cells stay green. The gate leaves 0221/0226's schema-vs-schema
interchangeability boundary untouched: a plain-object or schema-branded
scrutinee still matches any declared head's field list exactly as at HEAD —
only the non-object carriers (enum, `Result`) stop taking the object arm.

## Provenance

Found by reading `matchPattern`'s object arm against `isObjectValue`'s
consumer list (bug 0027 §Fix) during the runtime-mutation hunt at bc52da38;
all six rows probed offline through the production executor harness. Scratch
probes deleted.

## Fix (0.296.0)

- **What shipped:**
  - `src/runtime/match-result.ts` — added `isObjectValue` to the `./value`
    named import and, in `matchPattern`'s `case "object"` arm, the settled
    carrier gate `if (!isObjectValue(value)) return false;` placed after the
    byte-unchanged `typeof`/`null`/`Array.isArray` receiver guard, with a
    WHY comment. Disposition is fail-to-match (§Fix), not a thrown rejection;
    no diagnostic code minted or widened.
  - `tests/b0317-object-pattern-matches-enum-result-carriers.test.ts` — NEW
    RED→GREEN witness for §Reproduction P4a–P4d + X5, with P4e as the
    plain-object control. Offline, provider-free, deterministic; shared
    parse+production-executor harness; `parseTheta` fails loudly on any
    error-severity diagnostic (no silent skip); symbol-form citations.
  - `tests/object-pattern-head-field-set-refusal.test.ts` — bug 0226's
    witness: cells b4/b5 only, dispatch expectation flipped
    `"r-arm"`→`"ok-arm"` and `"bare-arm"`→`"ok-arm"`, each with a WHY comment
    naming the 0317 re-vehicle and the parent ratification (single contiguous
    hunk; every other cell byte-untouched). See Parent ratification below.
  - `docs/bugs/0226-declared-object-pattern-head-field-set-unchecked.md` —
    append-only dated coordination note (2026-08-27) recording the re-vehicle.
- **Parent ratification (Option A, recorded verbatim):** cells b4/b5 of
  `tests/object-pattern-head-field-set-refusal.test.ts` are VEHICLE-COLLATERAL
  of bug 0317 — their SUBJECT is 0226's deliberate parse-layer boundary
  (empty/bare object-pattern heads draw NO head-field-set refusal), which 0317
  does not move: the zero-parse-diagnostic assertion in those cells
  (`expectClean`'s `[]` list) stays exactly as pinned. Their VEHICLE was an
  `Ok(1)` Result carrier whose RUNTIME DISPATCH 0317's brand gate legitimately
  changes: the dispatch expectations were flipped old→new to the arm the
  carrier now actually reaches under the gate (verified BY EXECUTION, not
  assumed — both reach `Ok(v) => "ok-arm"`), with a WHY comment in each cell
  naming the 0317 re-vehicle and this ratification. Bound: those TWO cells'
  dispatch expectations plus their rationale comments ONLY; every other cell
  byte-untouched. A dated coordination note was appended (append-only) to
  0226's fix record recording the re-vehicle (subject preserved: parse-layer
  non-refusal for empty/bare heads; dispatch half re-owned by 0317's brand
  gate).
- **Gates:**
  - Witness (before fix, HEAD): `5 failed | 1 passed` — P4a=`"leaked"`,
    P4b=`true`, P4c=`"boom"`, P4d=`4`, X5=`"obj-arm"` (each == the doc's
    Observed column → red for the right reason), P4e control green. After fix:
    `6 passed` — P4a=`"clean"`, P4b=`false`, P4c=`"clean"`, P4d=`-1`,
    X5=`"ok-arm"`, P4e=`"matched"`.
  - Full default suite `npm test` → `Test Files 473 passed (473)` /
    `Tests 9520 passed (9520)`.
  - `npm run typecheck` → clean. `npm run lint` → clean.
- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) — FINDINGS, no
  correctness/fidelity/spec blocker; confirmed the gate is verbatim-faithful
  to §Fix, `isObjectValue` excludes exactly enum+`Result` and admits
  plain/schema objects, the witness fails loudly, and the b4/b5 flip is
  correctly scoped and append-only in 0226's doc. Two findings, both
  non-dispatchable in this lane (see Residuals 1 and 2); no fixer round.
- **Verification:** SOLID (`bug-fix-verifier`). (1) Neutralising the gate in
  `src/runtime/match-result.ts` reds P4a–P4d/X5 to the doc's Observed column
  and b4/b5 to their pre-fix arms, P4e control stays green; file restored
  byte-exact (`git hash-object` = `a7ac0aa9…`), green after restore
  (`38 passed`). (2) Full suite `473 files / 9520 tests` green. (3) No live
  cell owed — match-internal (`matchPattern` object arm), no
  registration/wire/child/provider consumer, `tests/fixtures/h7a/permitted-codes.json`
  byte-unchanged (`git diff` empty); recorded, not fabricated. (4) lint +
  typecheck clean. Own backstop gate re-runs matched.
- **Residuals:**
  1. **`0.296.0` placeholders are intentional in this LANE.** The witness header
     and the b4/b5 comments/titles carry `0.296.0` per lane policy (no version
     bump in the lane; the parent assigns the concrete release at merge).
     Review F1 flagged them as unfilled; they are deliberate. Evidence: lane
     rider ("0.296.0 UPPERCASE everywhere incl. test comments"); the parent's
     merge step fills them alongside the pkg/CHANGELOG/README ritual this lane
     omits.
  2. **Cell b8a's mechanism comment is now imprecise (out of ratified scope).**
     b8a (`match Ok(1) { R { a: 1 } => …, Ok(v) => … }`) still answers
     `"ok-arm"` and stays green, but its comment attributes the arm rejection
     to "the runtime's field-shape test" (`hasOwnProperty`), which post-fix no
     longer executes — the brand gate rejects the `Ok(1)` carrier first.
     Evidence: review R1; the gate precedes the `hasOwnProperty` loop in
     `matchPattern`. The parent ratification bounds me to b4/b5 only
     ("every other cell byte-untouched"), so b8a was left untouched; this is a
     residual for whoever owns 0226's file beyond b4/b5.
  3. **Phase-2 implementer `git stash` breach (second of the campaign).** The
     `bug-fix-implementer` used `git stash`/pop to isolate a pre-existing
     citation-gate red despite the verbatim NO-`git stash` rule (the
     prohibition was spelled out verbatim in its task). Tree-integrity
     confirmed afterward: `git stash list` empty, only the owned changeset
     files modified, no unowned file touched — no residue. Recorded as a
     process violation for the parent.
- **Discharge notes appended:** bug 0226 (the dated coordination note above) —
  its b4/b5 Result-carrier dispatch is re-owned by 0317's brand gate; its
  parse-layer non-refusal subject is preserved.
- **Pinned dispositions / non-goals:** the fix leaves 0221/0226's
  schema-vs-schema interchangeability boundary untouched — a plain-object or
  schema-branded scrutinee still matches any declared head's field list as at
  HEAD; only non-object carriers (enum, `Result`) stop taking the object arm.
  Disposition stays fail-to-match, not a thrown `non-object-receiver`
  rejection (§Fix). No diagnostic code minted or widened.

> LANE note: no `package.json` / `CHANGELOG.md` / `docs/bugs/README.md` edit,
> no commit, no push — the parent performs those at merge and assigns the
> concrete `0.296.0`.
