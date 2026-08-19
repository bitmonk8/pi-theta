# Bug 0201 — Neither of the subagent envelope writer's two bounded walks descends a `Result`, so a `mode: subagent` callee whose terminal value is `[Ok(1 / 0), 1]` writes `{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}` with an empty diagnostic drain — bug 0180's fabricated `null` alive through the `Result` vector — and `[Ok([[[[[1]]]]]), 1]` crosses as an `ok` envelope whose wire document is depth 8, where a shallower document outside a carrier (`[[[[[[1]]]]]]`, depth 7) refuses `JSON document depth exceeds 5`

- **Status:** fixed (0.118.0). Route **(a)** was adjudicated and shipped: both
  bounded walks descend the `Result`'s wire form. The three points §Fix left
  undecided are settled and recorded in `## Fix (0.118.0)` below — the descent's
  shape (one shared exported classifier both walks consult, with a carrier arm in
  neither), the refusal's message and pointer form for a position inside a
  `Result` payload (the wire-form RFC-6901 pointer), and the carriage question
  itself (the writer descends the carrier rather than declining to carry it).
  Routes (b) and (c) were rejected. Each choice moved GOV-15 observable (a)
  (`docs/spec_topics/governance/source-language-stability.md:5`) for a different
  input set, and the landing route turned on the shipped sentence this report
  measures false (`docs/spec_topics/runtime-value-model.md:14`, "so a `Result`
  value never crosses the wire"), which it scopes rather than deletes.
  Ordering: nothing blocked this report from starting and it blocked nothing.
  [0187](./0187-untyped-subagent-return-boundary-no-depth-ceiling.md) is
  **fixed (0.116.0)** and is this report's provenance and the author of the bound
  it disputes; its `CONTROL (FENCE-NESTED-RESULT)` cell
  (`tests/subagent-return-depth-refusal.test.ts:657`) pins today's behaviour in
  both directions, so **that cell flips only under this report's authority** —
  the fence-re-pin pattern
  [0197](./0197-params-default-non-enum-head-silently-unfilled.md) §Fix item 6
  used for cell C of
  [0185](./0185-unresolvable-enum-variant-default-panics-recovery.md)'s witness
  ("Cell C is rewritten, not deleted, and under this report's authority").
  [0180](./0180-invoke-return-nonfinite-number-mode-variance.md) is **fixed
  (0.105.0)** and owns `firstNonFiniteNumber`, the walk whose `Result` arm
  carries the non-finite half; that function is byte-untouched by 0187.
- **Sev/Diff estimate:** S1/D3 — S1 by the letter of the scale: a caller binds a
  value its callee never produced, on a production path, with nothing on any
  channel. Measured (§Reproduction row 1): a `mode: subagent` callee whose
  terminal value is `[Ok(1 / 0), 1]` writes
  `{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}` and the
  diagnostic drain is `[]` — the same fabrication class bug 0180 was filed to
  close, reached through the one carrier its walk declines to enter. Two
  conjuncts narrow the reach, and they are stated rather than buried. First, the
  `Result` must be nested **inside** a compound payload: a `Result` in terminal
  position is unwrapped by `surfaceCalleeFinalValue`
  (`src/extension/production-theta-producer.ts:3755`), so its payload becomes
  the envelope payload and both walks reach it — measured, terminal `Ok(1 / 0)`
  refuses by name and terminal `Ok([[[[[1]]]]])` refuses on depth
  (§Reproduction rows 5a, 5b). Second, that carried payload must hold a
  non-finite `number`, or nest past the cap. Both compound spellings the
  language admits reach it: an array literal and a declared-schema constructor
  field (§Reproduction row 6). Corpus census, run at HEAD: **0 of 34** committed
  `.theta` / `.thetalib` construct a `Result` at all — every `Ok(` / `Err(`
  occurrence in the tracked set is a `match`-arm pattern or comment prose
  (`git grep -n -e 'Ok(' -e 'Err(' -- '*.theta' '*.thetalib' | grep -v '=>' |
  grep -v '//'` is empty) — and none nests an array literal
  (`git grep -c -e '\[\[' -- '*.theta' '*.thetalib'` is empty). So the class is
  reachable from clean source and unreached by the corpus — the reachability
  shape 0180 and 0187 both carried, with the carriage as a further conjunct.
  D3 because §Fix needs in-run
  adjudication across the descent shape and the refusal's identity; because the
  two functions a route moves are 0180's and 0187's own hunks in one file, each
  carrying pinned-byte fences that must be re-derived
  (`CONTROL (FENCE-NESTED-RESULT)`, `CONTROL (FENCE-DEPTH)`, 0180's 27-cell
  witness, 0187's 13-cell witness); because four shipped normative or
  doc-comment statements of the bound move with the behaviour; and because the
  observable a witness must reach is what a *caller* binds, which needs the
  integration tier over real spawned children.
- **Kind:** defect, two elements sharing one carriage, each measured at HEAD
  `940206cb` (v0.116.0) through the real child-side envelope writer.
  1. *The non-finite half — a fabricated `null`, with an empty drain.*
     `firstNonFiniteNumber` (`src/runtime/subagent-envelope.ts:376`) returns
     `undefined` for a `Result` (`:399`, `if (isResultValue(value as
     ThetaValue)) { return undefined; }`), so `mapNonRepresentableReturnValue`
     (`:593`) answers `undefined` for `[Ok(1 / 0), 1]` and the writer takes its
     `serializeOkEnvelope` arm
     (`src/extension/production-theta-producer.ts:2318`). `JSON.stringify`
     descends the carrier — the `makeOk` brand is a non-enumerable symbol
     (`src/runtime/value.ts:88`, `:475`) while `ok` and `value` are own
     enumerable string keys — so the emitted line carries a `null` where the
     callee produced `Infinity`. This half is **pre-existing at 0180's fix**:
     `firstNonFiniteNumber` is byte-untouched by 0187, whose fix record says so.
  2. *The depth half — an `ok` envelope at wire depth 8.*
     `wireFormExceedsDepthCap` (`:475`) inherits the same arm (`:490`), so
     `mapTooDeepReturnValue` (`:559`) answers `undefined` for
     `[Ok([[[[[1]]]]]), 1]` even though the document it writes,
     `[{"ok":true,"value":[[[[[1]]]]]},1]`, is depth 8 against
     `MAX_JSON_DEPTH = 5` (`src/runtime/depth-walk.ts:40`). Measured, and the
     control holds in the other direction: a `Result` at a position that already
     exceeds the cap **is** refused, because the level check (`:476`) precedes
     the carrier arm (§Reproduction row 2c).
  The two halves share one cause. Both walks answer a question about the
  payload's **wire form** — that is 0187 review round 1's own correction, and it
  is why `wireFormExceedsDepthCap` is module-private rather than the shipped
  `depthWalk` (its doc-comment, `:414`–`:474`). A `Result`'s wire form is
  `{"ok":true,"value":…}`, and it carries the payload neither walk reaches.
- **Related:**
  - [0187](./0187-untyped-subagent-return-boundary-no-depth-ceiling.md) —
    **fixed (0.116.0)**, this HEAD's commit. Provenance (its `## Fix (0.116.0)`
    §*Residuals* item 1) and the author of the bound: PIC-59's
    *Result-carriage bound*
    (`docs/spec_topics/pi-integration-contract/subagent.md:115`, anchor
    `#subagent-envelope-result-carriage-bound`), the registry *Trigger*'s
    deferral to it (`docs/spec_topics/diagnostics/code-registry-runtime.md:32`),
    both walks' doc-comments, the call-site comment
    (`src/extension/production-theta-producer.ts:2292`–`:2306`), and
    `CONTROL (FENCE-NESTED-RESULT)`
    (`tests/subagent-return-depth-refusal.test.ts:657`). That fix **refused** to
    widen either walk, on three grounds it recorded rather than assumed
    (§Provenance quotes them). This report does not reopen the depth refusal it
    shipped: `mapTooDeepReturnValue`'s mechanism, its canonical message, its
    `cause` reuse and its no-code decision are settled and stay (§Non-goals).
    What it disputes is the behaviour the bound describes, not the sentence,
    which is honest at HEAD.
  - [0180](./0180-invoke-return-nonfinite-number-mode-variance.md) — **fixed
    (0.105.0)**, commit `bf32ad03`. Owner of `firstNonFiniteNumber` and of the
    `Result` arm this report's element 1 measures. Its §Non-goals bullet *Other
    `JSON.stringify` holes at the envelope* (`:915`–`:919`) states both halves
    of the premise this report measures: "`Result` never crosses the wire by
    specification (`runtime-value-model.md`, the `Result` row). Non-finite
    `number` is the one JSON hole a legal theta value can occupy; if a route
    finds a second, it records it rather than widening." The first clause is
    measured false at this wire (§Reproduction row 3c); the second is the
    disposition 0187 applied here and the one this report asks to be revisited
    on the record. Its 27-cell witness
    (`tests/subagent-envelope-nonfinite-ok-refusal.test.ts`) contains **no**
    `Result` cell (`git grep -n makeOk` over that file is empty), so the
    non-finite half of the bound is unwitnessed in either direction.
  - [0188](./0188-negative-zero-loses-sign-across-subagent-envelope.md) —
    **open**, at the same writer, on a **disjoint value class**: `-0`, which is
    finite and which `JSON.stringify` renders `0`. The boundary between the two
    reports is worth stating because 0188's §Fix (a) is a sign-preserving
    serialiser that walks the payload itself. Such a walk either descends the
    `Result` carrier — in which case it reaches `-0` leaves this report's two
    walks do not, and 0188's route inherits this report's carriage question —
    or it does not, in which case a `Result`-carried `-0` keeps its sign erased
    and 0188 acquires a `Result` residual of its own. Neither report's class is
    the other's: `-0` is admitted by `Number.isFinite` by design, and a
    non-finite `number` is not a sign question. A route here does not decide
    0188's disposition and a route there does not close this one.
  - [0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) —
    **fixed (0.98.0)**. Owner of `src/runtime/wire-translation.ts`, whose
    `projectForValidation` `isResultValue` arm (`:654`) is the shipped statement
    both envelope walks cite as their ground. That file is byte-frozen by 0187
    §Fix (e)(7) and no route here touches it; a route that changes what the
    envelope walks do with a `Result` states whether the two seams still agree.
  - [0068](./0068-prompt-callee-invoke-final-value-null.md) — **wontfix**.
    Bounds the domain: `docs/spec_topics/invocation.md:28` fixes that untyped
    `invoke(...)` returns `Result<null, QueryError>` and "the runtime discards
    the child's return value entirely", so no caller binds the fabrication on
    that arm. The fabrication is written child-side either way; 0068 settles
    only what one parent form does with it. 0187's `## Fix (0.116.0)` (e)(2)(iv)
    measured that the child cannot see the caller's call form, so any
    writer-side change reaches that arm too.
  - [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md) —
    **fixed (0.108.0)**, the same carrier leak at a **different** wire. There a
    `Result` nested inside an interpolated object put `{"ok":…,"value":…}` into
    the prompt text, and the fix made containment classify at every depth;
    `docs/spec_topics/query/query-escapes-stringification.md:33` records that
    the containment rule is "what keeps [Runtime Value Model]'s 'a `Result`
    value never crosses the wire' true at every depth". The subagent return
    envelope has no such rule, and the same sentence is measured false there
    (§Reproduction row 3c).
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, and the
    class this report is not. `src/extension/production-theta-producer.ts` is
    6479 lines at this HEAD, so every position in it below is named by symbol
    beside its line number and every line is read at `940206cb`.
- **Affected** (every citation read at HEAD `940206cb`, v0.116.0, by
  `git show HEAD:<path>` and `git grep`; volatile positions named by symbol per
  [0134](./0134-params-shift-induced-stale-citations.md)):
  - **The two walks that skip the carrier.** `src/runtime/subagent-envelope.ts`
    (616 lines at HEAD, blob `ac62d54f`):
    - `firstNonFiniteNumber` (`:376`) — bug 0180's search. Level bound `:381`
      (`if (level > MAX_JSON_DEPTH) { return undefined; }`), leaf test `:385`
      (`Number.isFinite`), boxed-`String` arm `:387`, **`Result` arm `:399`**,
      record walk by `Object.entries` `:405`. Its doc-comment (`:337`–`:375`)
      states the bound and the measurement in full at `:358`–`:374`: "THE BOUND
      THAT ARM CARRIES, PLAINLY: `JSON.stringify` does descend a `Result` … so a
      non-finite `number` reachable only through a nested `Result` is not found
      here and `serializeOkEnvelope` substitutes `null` for it. Measured:
      `[Ok(1 / 0), 1]` writes
      `{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}`."
    - `wireFormExceedsDepthCap` (`:475`) — bug 0187's walk. Level check `:476`,
      boxed-`String` arm `:479`, **`Result` arm `:490`**, record walk `:496`.
      Its doc-comment (`:414`–`:474`) carries the wire-form argument
      (`:422`–`:435`) and the same bound as a bullet at `:448`–`:466`: "for a
      payload nesting a `Result` this walk's verdict is an UNDER-COUNT of the
      real wire depth and such a payload is NOT REFUSED. Measured:
      `[Ok([[[[[1]]]]]), 1]` writes `[{"ok":true,"value":[[[[[1]]]]]},1]`, whose
      document depth is 8".
    - `mapTooDeepReturnValue` (`:559`), whose doc-comment (`:504`–`:558`)
      restates the bound under the heading `BOUND, as shipped and as PIC-59 now
      states it` (`:519`).
    - `mapNonRepresentableReturnValue` (`:593`), calling
      `firstNonFiniteNumber(value, 1, "")` at `:597`.
    - `serializeOkEnvelope` (`:117`) — plain `JSON.stringify` of
      `{ theta_result: { v: 1, ok: value } }`, the function that descends what
      the walks do not.
    - `SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE` (`:100`), 0180's code, and
      the `isResultValue` import (`:49`).
  - **The producer's consult order.**
    `src/extension/production-theta-producer.ts`: `driveSubagentRootRegime`
    (`:2193`); `surfaceCalleeFinalValue(execution)` (`:2289`, defined `:3755`),
    whose doc-comment (`:3737`–`:3754`) fixes at `:3746`–`:3748` that "a
    `Result`-typed tail passes through unchanged so `invoke<T>` return
    validation sees `T`, not `Ok(T)`" —
    the reason a terminal `Result` is unwrapped and a nested one is not; the
    `terminal.ok` arm's comment (`:2292`–`:2306`), which states the bound at the
    call site ("Inside a `Result` carrier neither walk descends the carrier, so
    neither sub-check reaches past it and the order between them decides
    nothing"); and the three consults in order — `mapTooDeepReturnValue`
    (`:2307`), `mapNonRepresentableReturnValue` (`:2310`), `serializeOkEnvelope`
    (`:2318`).
  - **The parent positions the fabrication crosses, read from source, not
    driven here.** `#resolveReturnSite` (`:3616`) and `#validateInvokeReturn`
    (`:3679`), whose `if (returnSite === null || !result.ok) { return result; }`
    (`:3684`) precedes `enforceInvokeReturnDepth` (`:3693`). At an uninferred
    `tools:`-declared `.theta`-callable boundary the parent therefore binds the
    parsed envelope unchanged. That chain is bug 0187's §Reproduction (b) row A,
    measured there over real spawned children for the byte-analogous payload.
  - **The carrier itself.** `src/runtime/value.ts`: `RESULT_TAG`
    (`:88`, `Symbol("__thetaResult")`), `isResultValue` (`:443`), `makeOk`
    (`:475`), `makeErr` (`:480`). The brand is a non-enumerable symbol, so
    `JSON.stringify` never sees it and always sees `ok` / `value`.
  - **The shipped statement of the bound, in four places, all new at 0.116.0.**
    - `docs/spec_topics/pi-integration-contract/subagent.md:114`, PIC-59's
      *Fail-closed non-representable `Ok` payload* requirement, whose
      qualification is the anchored clause "at every depth the search reaches —
      the *Result-carriage bound* below states which depths those are".
    - `:110`, the `Ok`-values bullet, qualified in the same shape: "at any depth
      **the two walks reach**".
    - `:115`, the *Fail-closed over-deep `Ok` payload* requirement carrying the
      anchor `#subagent-envelope-result-carriage-bound`, verbatim: "neither this
      walk nor the non-representability search descends a `Result`, because a
      `Result` is not a lowerable type form and does not cross this envelope by
      specification … So a payload whose depth, or whose non-finite `number`, is
      contributed **only from inside a nested `Result`** is not refused, and a
      `Result` sitting at a position that already exceeds the cap still is …
      This is the bound as shipped, not a licence".
    - `docs/spec_topics/diagnostics/code-registry-runtime.md:32`, the *Trigger*
      cell of `theta/runtime/subagent-return-value-not-representable`, deferring
      to it: "that measurement carries [PIC-59's *Result-carriage bound*]
      (depth contributed only from inside a nested `Result` is not counted, so
      such a payload is not refused; a `Result` at a position that already
      exceeds the cap still is)".
  - **The sentence the bound rests on, and which the envelope falsifies.**
    `docs/spec_topics/runtime-value-model.md:14`, the `Result<T, E>` row:
    "`Result` values are observed only by theta code and never appear in a
    lowered schema: `Result` is not a lowerable type form and is rejected in any
    schema-feeding position at parse time
    (`theta/parse/result-in-schema-position` …), **so a `Result` value never
    crosses the wire**". `:16` is the reference-encoding paragraph fixing the
    `{ ok: true, value: T }` shape and the non-enumerable brand, and stating
    that "the brand never appears in JSON output" — true of the brand, and the
    reason the rest of the carrier does appear.
    `docs/spec_topics/schema-subset.md:84` is the *Lowering Algorithm* step 3
    the row cites. The one shipped mechanism that keeps the sentence true at
    another wire is the interpolation surface's containment rule,
    `docs/spec_topics/query/query-escapes-stringification.md:33`. The subagent
    return envelope has no counterpart, and `src/runtime/wire-translation.ts:654`
    — `projectForValidation`'s `isResultValue` arm, the ground both envelope
    walks name — reasons from schema positions ("no position a `returnSchema`
    describes can hold one"), which is a statement about a **typed** boundary.
  - **Ceiling #4's own surfaces, unchanged by this report.**
    `src/runtime/depth-walk.ts:40` (`MAX_JSON_DEPTH = 5`), `:50`
    (`DEPTH_VIOLATION_MESSAGE = "JSON document depth exceeds 5"`), `:141`
    (`jsonDepth`), `:195` (`depthWalk`);
    `docs/spec_topics/schema-subset.md:13` (the cap), `:20` (§Depth
    Enforcement), `:24`–`:30` (the counting algorithm; `:30` "The cap is
    `depth ≤ 5`"), `:49` (§Error shape, the canonical message);
    `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:17` (the per-boundary
    table) and `:41` (CIO-3);
    `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md:47` (the
    *Five-site list co-edit obligation*, keyed to rows of the **AJV**
    enforcement-point table — the envelope writer is not one, which is 0187's
    adjudicated framing and which a route here inherits unchanged).
  - **GOV-15.** `docs/spec_topics/governance/source-language-stability.md:5`
    (observables (a) return values, (b) ordered diagnostic-code sequences,
    (c) `theta-system-note` content), `:13` (*Ceiling-set carve-out*, "keyed to
    ceiling-set changes only"), `:21` (*Operational definitions*, whose
    *Tighten* verb covers "broaden the enforcement-point surface" and is
    "forbidden under theta 1.x" until the conformance suite ships), and `:25`
    (the *Diagnostic-registry carve-out*, which covers a DIAG-2 trigger change
    as an addition for inputs newly brought into a code's emission set).
  - **The two committed fences a route must move deliberately.**
    `tests/subagent-return-depth-refusal.test.ts` (1590 lines, 13 cells):
    `CONTROL (FENCE-NESTED-RESULT)` at `:657` asserts both directions — the
    admitted payload `[makeOk([[[[[1]]]]]), 1]` (`:687`) with its wire form and
    `jsonDepth` 8 read off the shipped counting algorithm, and the refused
    `[[[[[makeOk(1)]]]]]` (`:714`). Its comment names the widening as "bug
    0180's settled refusal mechanism … out of bug 0187's scope". The file header
    (`:44`–`:65`) scopes every other row to payloads outside a `Result` carrier.
    `CONTROL (FENCE-DEPTH)`
    (`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:824`) pins
    `firstNonFiniteNumber`'s own bound and is 0180's; a route that changes what
    that walk descends re-derives it.
  - **What is unwitnessed.** The non-finite half of the bound has no cell at
    all: `tests/subagent-envelope-nonfinite-ok-refusal.test.ts` (27 cells)
    contains no `makeOk` / `makeErr` (`git grep -n makeOk` over it is empty),
    and `tests/subagent-envelope.test.ts:59`'s eight-value `OK_VALUES`
    round-trip corpus (driven at `:178`) has no `Result` row. The only committed
    assertion over a `Result` at this seam is `FENCE-NESTED-RESULT`, and it
    covers depth only. `tests/result-value-privacy.test.ts:534`–`:535`
    (`isWireLowerable(makeOk(1))` is `false`, "a genuine Ok never crosses the
    wire") and `tests/interpolated-result-gate.test.ts:1292` pin the invariant
    at the schema-lowering and interpolation surfaces; neither reaches the
    envelope writer.
  - **The corpus census, run at HEAD.** 34 committed `.theta` / `.thetalib`.
    Zero construct a `Result`: every `Ok(` / `Err(` in the tracked set is a
    `match`-arm pattern (`docs/examples/configure-tool-loop.theta:9`, `:10`,
    `:12`; `fan-out-reviews.theta:30`–`:32`; `handle-error.theta:13`, `:14`,
    `:16`; `tests/live/acceptance/fixtures/acc-match-queryerror.theta:8`, `:9`)
    or comment prose (`docs/examples/prompt-extension-tool.theta:22`,
    `acc-match-queryerror.theta:5`). Zero nest an array literal. So
    `tests/committed-fixture-parse-gate.test.ts` never meets this class and no
    shipped fixture can reach it.
- **Observed at:** HEAD `940206cb` (v0.116.0, `package.json:3`). Windows.
  Offline, deterministic, provider-free, **zero model turns** — every fixture
  body is a `let` chain ending in a pure tail expression, so no query is issued.
  One scratch vitest probe (written, run, deleted; a case-insensitive sweep over
  the tree afterwards reports no `scratch`-named file outside the pre-existing
  `.pi/tmp/fixes/` artifacts, and `git status --porcelain` is empty). It drives
  the REAL child-side writer — `createProductionProducerDeps` with
  `subagentRootRegime: { active: true, slug: "worker" }`, a real
  `AjvSchemaValidator` on the runtime root, and `emitResultEnvelope` /
  `emitDiagnostic` captured — through `driveSubagentRootRegime`, the harness
  shape `tests/subagent-return-depth-refusal.test.ts`'s ORDER cells use
  (`driveChildRoot`, `:810`). It also calls the three seams directly
  (`mapTooDeepReturnValue`, `mapNonRepresentableReturnValue`,
  `serializeOkEnvelope`) over `Result`s built with the shipped `makeOk`
  constructor, never a hand-made `{ ok, value }` look-alike, so the brand
  `isResultValue` classifies by is present. Wall time 1.9 s, 7 cells.
  **Tree state.** A sibling session's prototype of bug 0188 route (a) touched
  `src/runtime/subagent-envelope.ts` during this session and was reverted before
  the recorded run. Every measurement below is from a run taken with all five
  relevant source files verified byte-identical to HEAD by
  `git show HEAD:<path> | git hash-object --stdin` against
  `git hash-object <path>`: `src/runtime/subagent-envelope.ts` (`ac62d54f`),
  `src/extension/production-theta-producer.ts`, `src/runtime/value.ts`,
  `src/runtime/depth-walk.ts`, `src/runtime/wire-translation.ts`. Every citation
  above is read with `git show HEAD:<path>`.
  Verbatim probe output:

  ```
  [1 FABRICATION [Ok(1 / 0), 1]]
    parse diagnostics []
    envelope lines ["{\"theta_result\":{\"v\":1,\"ok\":[{\"ok\":true,\"value\":null},1]}}\n"]
    drain []
  [2 DEPTH [Ok([[[[[1]]]]]), 1]]
    parse diagnostics []
    envelope lines ["{\"theta_result\":{\"v\":1,\"ok\":[{\"ok\":true,\"value\":[[[[[1]]]]]},1]}}\n"]
    drain []
    wire ok arm [{"ok":true,"value":[[[[[1]]]]]},1]
    jsonDepth(ok arm) 8
    MAX_JSON_DEPTH 5
  [2c CONTROL [[[[[Ok(1)]]]]]]
    envelope lines ["{\"theta_result\":{\"v\":1,\"err\":{\"kind\":\"invoke_infra\",\"message\":\"JSON document depth exceeds 5\",\"callee_path\":\"./kid.theta\",\"cause\":\"return_validation\"}}}\n"]
    drain []
  ```

## Summary

Bug 0187 shipped `mapTooDeepReturnValue` at the subagent envelope writer so that
no terminal `Ok` payload crosses the return boundary past ceiling #4's depth cap,
and bug 0180 had already shipped `mapNonRepresentableReturnValue` so that none
crosses carrying a non-finite `number`. Both refusals run over a **bounded walk**
of the payload, and both walks decline to descend a `Result`
(`subagent-envelope.ts:399`, `:490`).

The ground for that arm is `projectForValidation`'s
(`src/runtime/wire-translation.ts:654`) and the value model's:
`runtime-value-model.md:14` says a `Result` "is not a lowerable type form and is
rejected in any schema-feeding position at parse time …, so a `Result` value
never crosses the wire".

At this wire it does. `serializeOkEnvelope` (`:117`) is `JSON.stringify`, the
`makeOk` brand is a non-enumerable symbol (`value.ts:88`) and `ok` / `value` are
own enumerable string keys, so the carrier serialises as
`{"ok":true,"value":…}`. Measured, a `mode: subagent` callee whose terminal
value is `[Ok(1), 1]` writes `{"theta_result":{"v":1,"ok":[{"ok":true,"value":1},1]}}`.
The walks answer a question about the payload's wire form — 0187's own
correction, and the reason `wireFormExceedsDepthCap` is module-private rather
than the shipped `depthWalk` — and the wire form of a `Result` carries a payload
neither walk reaches.

Two consequences, both measured at HEAD:

| # | callee terminal value | envelope written | drain |
|---|---|---|---|
| 1 | `[Ok(1 / 0), 1]` | `{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}` | `[]` |
| 2 | `[Ok([[[[[1]]]]]), 1]` | `{"theta_result":{"v":1,"ok":[{"ok":true,"value":[[[[[1]]]]]},1]}}` (`jsonDepth` 8) | `[]` |

Row 1 is bug 0180's fabrication class: the callee produced `Infinity`, the wire
carries `null`, and nothing reports the substitution. Row 2 is bug 0187's depth
class: a document at depth 8 crosses where `[[[[[[1]]]]]]` at depth 7 refuses
with `JSON document depth exceeds 5`.

The bound is stated, deliberately and in four shipped places — PIC-59's anchored
*Result-carriage bound* (`subagent.md:115`), the two requirement bullets it
qualifies (`:114`, `:110`), the registry *Trigger*'s deferral
(`code-registry-runtime.md:32`), both walks' doc-comments and the call-site
comment — and pinned in both directions by `CONTROL (FENCE-NESTED-RESULT)`
(`tests/subagent-return-depth-refusal.test.ts:657`). **Those sentences are
honest at HEAD.** This report is filed against the behaviour they bound, not
against the sentences: a caller binding a `null` its callee never produced is
the defect bug 0180 exists to prevent, and stating where it survives does not
close it. Because 0187 pinned the disposition as a fence, `FENCE-NESTED-RESULT`
flips only under this report's authority — the pattern
[0197](./0197-params-default-non-enum-head-silently-unfilled.md) §Fix item 6
used for cell C of
[0185](./0185-unresolvable-enum-variant-default-panics-recovery.md)'s witness.

Widening was refused at 0187 on three recorded grounds (§Provenance quotes each
verbatim): 0187 §Non-goals reserves 0180's refusal mechanism; 0180 §Non-goals
fixes that a second hole in the same class is recorded rather than widened into;
and `src/runtime/wire-translation.ts` is byte-frozen by 0187 §Fix (e)(7). Those
grounds are scope decisions of that run, not adjudications of this class.

## Reproduction

At HEAD `940206cb` (v0.116.0). Step (a) is a read; step (b) is one scratch
vitest probe over the real child-side writer, in process, zero model turns.

### (a) The bound, its four shipped statements, and the code they describe

```sh
git show HEAD:docs/spec_topics/pi-integration-contract/subagent.md | sed -n '110p;114p;115p'
git show HEAD:docs/spec_topics/diagnostics/code-registry-runtime.md | sed -n '32p'
git show HEAD:docs/spec_topics/runtime-value-model.md | sed -n '14p'
git show HEAD:src/runtime/subagent-envelope.ts | sed -n '337,412p;414,500p'
git show HEAD:src/extension/production-theta-producer.ts | sed -n '2289,2320p'
```

`subagent.md:115` carries the anchor `#subagent-envelope-result-carriage-bound`
and states the bound in both directions. `:114` and `:110` are qualified by it
("at every depth the search reaches", "at any depth **the two walks reach**").
`code-registry-runtime.md:32` defers to it.
`runtime-value-model.md:14` is the sentence it rests on.
`subagent-envelope.ts:399` and `:490` are the two arms.
`production-theta-producer.ts:2307`, `:2310` and `:2318` are the consult order
inside `driveSubagentRootRegime`'s `terminal.ok` arm.

### (b) The measurement

One probe, deleted after the run. It parses each fixture with the real
`parseThetaDocument` and fails loudly on any error-severity diagnostic, then
drives `driveSubagentRootRegime` with the `PI_THETA_SUBAGENT_ROOT` regime marker
active (`subagentRootRegime: { active: true, slug: "worker" }`) and both output
channels captured. Every fixture is `---\nmode: subagent\n---\n` plus the body
shown.

| Row | Body | Envelope written | Drain |
|---|---|---|---|
| **1** | `let r = Ok(1 / 0)`<br>`[r, 1]` | `{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}` | `[]` |
| **2** | `let r = Ok([[[[[1]]]]])`<br>`[r, 1]` | `{"theta_result":{"v":1,"ok":[{"ok":true,"value":[[[[[1]]]]]},1]}}` | `[]` |
| **2c** | `[[[[[Ok(1)]]]]]` | `err`, `JSON document depth exceeds 5`, `cause: "return_validation"` | `[]` |
| **3a** | `[1 / 0, 1]` | `err`, `subagent return value is not JSON-representable at /0: Infinity` | `["theta/runtime/subagent-return-value-not-representable"]` |
| **3b** | `[[[[[[1]]]]]]` | `err`, `JSON document depth exceeds 5` | `[]` |
| **3c** | `let r = Ok(1)`<br>`[r, 1]` | `{"theta_result":{"v":1,"ok":[{"ok":true,"value":1},1]}}` | `[]` |
| **5a** | `let r = Ok(1 / 0)`<br>`r` | `err`, `subagent return value is not JSON-representable: Infinity` | `["theta/runtime/subagent-return-value-not-representable"]` |
| **5b** | `let r = Ok([[[[[1]]]]])`<br>`r` | `err`, `JSON document depth exceeds 5` | `[]` |

Every row's parse diagnostics are `[]`, and every row writes exactly one
envelope line (PIC-59: one invocation per process).

**Row 1 is the primary.** The callee produced `Infinity` inside the `Result`;
the wire carries `null`; no `Err`, no registered code, no diagnostic. It is byte-
identical to what 0187's review round 2 measured and to what that fix's report
carries as residual 1.

**Row 2 is the depth half.** The `ok` arm's document is `jsonDepth` **8**
against `MAX_JSON_DEPTH = 5` (both read from `src/runtime/depth-walk.ts` by the
probe, not asserted as literals).

**Rows 2c, 3a and 3b are the controls that bound the class.** 2c puts the
carrier itself at level 6 — five brackets — and the level check (`:476`)
precedes the carrier arm (`:490`), so it refuses on position without the arm
being consulted. 3a and 3b are the same two payload classes **outside** a
carrier, and both refuse. So the discriminator is the carrier, not the value and
not the depth.

**Rows 5a and 5b are the reachability conjunct.** A `Result` in **terminal**
position is unwrapped by `surfaceCalleeFinalValue`
(`production-theta-producer.ts:3755`) — a `Result`-typed tail passes through
rather than being wrapped again — so its payload becomes the envelope payload
and both walks reach it. The `Result` must be nested inside a compound for the
carriage to matter.

**Which compound spellings admit a carried `Result`** (row 6 of the probe):

```
let r = Ok(1 / 0)
{ a: r, b: 1 }
  REFUSED at parse: theta/parse/bare-object-literal

let r = Ok(1 / 0)
schema B { a: number }
B { a: r }
  {"theta_result":{"v":1,"ok":{"a":{"ok":true,"value":null}}}}   drain []

let r = Ok(1 / 0)
[[r]]
  {"theta_result":{"v":1,"ok":[[{"ok":true,"value":null}]]}}      drain []

let r = Ok([[[[[1]]]]])
[[r]]
  {"theta_result":{"v":1,"ok":[[{"ok":true,"value":[[[[[1]]]]]}]]}}  drain []
```

A bare object literal is refused at parse, so the two reachable spellings are an
array literal and a declared-schema constructor field. The schema row is the
wider of the two: the field is declared `number`, the value bound into it is a
`Result`, the construction draws no diagnostic, and the fabricated `null` lands
inside the record the caller reads.

**The seams directly**, over `Result`s built with the shipped `makeOk`:

```
mapNonRepresentableReturnValue([Ok(1/0), 1])   -> undefined
serializeOkEnvelope([Ok(1/0), 1])              -> {"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}
mapTooDeepReturnValue([Ok([[[[[1]]]]]), 1])    -> undefined
jsonDepth(wire of [Ok([[[[[1]]]]]), 1])        -> 8
mapTooDeepReturnValue([[[[[Ok(1)]]]]])         -> {"kind":"invoke_infra","message":"JSON document depth exceeds 5","callee_path":"./kid.theta","cause":"return_validation"}
```

**Not driven here.** What a *caller* binds. The parent's disposition is read
from source: `#validateInvokeReturn` returns the parsed envelope unchanged at
`production-theta-producer.ts:3684` when the return site names no type, which is
every uninferred `tools:`-declared `.theta`-callable boundary and every untyped
`invoke(...)`. Bug 0187 §Reproduction (b) row A drove that chain over real
spawned children for the byte-analogous payload and measured the caller binding
the fabricated value with `diagnostics: []`.

## Expected behaviour

- **A caller does not bind a value its callee did not produce.** INV-5
  (`docs/spec_topics/invocation.md:36`) requires the parent to derive the
  `invoke` result solely from the envelope and fixes "never a fabricated `Ok`"
  for the exit-without-envelope case; PIC-59's fail-closed inventory restates
  the never-fabricate principle for each of its members. A `null` where the
  callee produced `Infinity` is a fabricated value at whatever position it sits,
  inside a carrier or outside one. Row 1 measures one.
- **The bound sentences are honest, and that is the point.**
  `subagent.md:114`'s "at every depth the search reaches", `:110`'s "at any
  depth the two walks reach", `:115`'s *Result-carriage bound* and the registry
  *Trigger*'s deferral are all true at HEAD, measured. `docs/STYLE.md:28`
  ("Every claim is testable or is removed") is satisfied by them. This report
  does not ask for a wording change; it asks whether the behaviour those
  sentences accurately describe is the behaviour the runtime should have. 0187
  §Expected behaviour's own first bullet — "a normative MUST is true, or it is
  qualified" — licensed the qualification as the remedy available to that run,
  which had frozen the file the widening would touch.
- **The depth cap means the same thing at every position of one payload.**
  `schema-subset.md:13` states it as "≤ 5 levels of nesting at runtime (the JSON
  document depth, not the schema graph)" and `:30` fixes `depth ≤ 5`;
  `:24`–`:30`'s counting algorithm is defined over scalars, objects and arrays,
  with no carrier exemption. Measured, one document is refused at depth 7 (row
  3b) and admitted at depth 8 (row 2), and the difference is a `Result` in the
  path.
- **"A `Result` value never crosses the wire" is either true of this wire or
  scoped.** `runtime-value-model.md:14` states it unqualified, and the
  interpolation surface has a shipped mechanism keeping it true at every depth
  (`query-escapes-stringification.md:33`, the containment rule bug 0114
  shipped). Measured at this wire, `[Ok(1), 1]` crosses as
  `[{"ok":true,"value":1},1]` (row 3c). Either the envelope refuses to carry a
  `Result`, or the row says which wires it speaks for. The ground both envelope
  walks cite — `wire-translation.ts:654`, "no position a `returnSchema`
  describes can hold one" — reasons from a **typed** boundary; the boundaries
  where this class is reachable have no `returnSchema` at all.
- **The two halves of one fail-closed discipline reach the same set of
  values.** PIC-59 states the non-representability refusal and the depth refusal
  as sibling requirements over the same terminal `Ok` payload
  (`subagent.md:114`, `:115`). They share one carriage bound today, which is
  consistent; a route that closes one and not the other leaves the inventory
  asymmetric and states why.

## Actual behaviour / root cause

### 1. The walks answer a wire-form question and stop at the wire's own carrier

Bug 0187 review round 1 established the framing both walks now use: the
envelope's verdict is a function of the payload's **wire form**, not of the
interpreter's carrier representation. That is why `wireFormExceedsDepthCap` is
module-private rather than the shipped `depthWalk` — `depthWalk` counts a boxed
`String` enum carrier's character indices as children and would refuse
`[[[[Colour.Red]]]]`, whose document `[[[["red"]]]]` is depth 5
(`subagent-envelope.ts:422`–`:435`).

The `Result` arm is the same distinction applied in the opposite direction. Both
walks treat a `Result` as *not present on the wire* and return without
descending (`:399`, `:490`). `JSON.stringify` treats it as present: the brand is
a non-enumerable symbol (`value.ts:88`) and `ok` / `value` are own enumerable
string keys, so the carrier is written as an ordinary object. Measured, row 3c.

So on this one shape the two walks and the serialiser disagree about the wire
form — the exact failure mode the enum-carrier arm was added to prevent, with
the sign reversed. The doc-comments say so, in both walks and at the call site.

### 2. The non-finite half is 0180's, unchanged

`firstNonFiniteNumber` (`:376`) returns `undefined` at `:399` for any `Result`,
so `mapNonRepresentableReturnValue` (`:593`) answers `undefined` for
`[Ok(1 / 0), 1]`, `tooDeep` is `undefined` too, and the writer's `else` arm runs
`serializeOkEnvelope(terminal.value)` (`production-theta-producer.ts:2318`).
`JSON.stringify` has no non-finite form, so the line is
`{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}`.

This is the class 0180 closed and the mechanism it closed it with. The arm
predates 0187: that fix's report states "The **non-finite half is
pre-existing at HEAD** in bug 0180's `firstNonFiniteNumber` (byte-untouched
here) … neither created nor worsened by this fix." Element 1 of this report is
that sentence, filed.

### 3. The depth half inherited the arm by design

`wireFormExceedsDepthCap` was written to mirror `firstNonFiniteNumber`'s carrier
arms so "this module's two walks answer the carrier question the same way"
(`:443`–`:444`). The mirror is faithful, which is why the new walk under-counts
the same payloads. Measured: `[Ok([[[[[1]]]]]), 1]` writes a depth-8 document
and `mapTooDeepReturnValue` answers `undefined`.

The bound has a real edge and the fence pins it: the level check (`:476`)
precedes the carrier arm (`:490`), so a `Result` at a position that already
exceeds the cap refuses on its position (row 2c). What is not counted is depth
contributed from **inside** the carrier.

### 4. The reachability conjunct is the tail's shape, not the value's

`surfaceCalleeFinalValue` (`production-theta-producer.ts:3755`) passes a
`Result`-typed tail through unchanged rather than wrapping it — so that
`invoke<T>` return validation sees `T` and a tail `Err(e)` is not masked as
success (`:3746`–`:3748`). Consequence: a terminal `Ok(x)` makes `x` the
envelope payload and both walks reach it (rows 5a, 5b, both refusing). The
carriage only matters when the `Result` is one level down. Both compound
spellings the language admits get there — an array literal and a
declared-schema constructor field (row 6) — and a bare object literal is refused
at parse by `theta/parse/bare-object-literal`, so those two are the set.

### 5. Nothing reports it, on any channel

The child's diagnostic channel is emitted only on the refusal path the writer
did not take, so the drain is `[]` (measured, rows 1, 2, 3c). The parent's
`#validateInvokeReturn` returns the parsed envelope unchanged at `:3684` when
the site names no type. No `theta-system-note` fires because nothing failed. An
author reading `null` at that position has no channel distinguishing it from a
callee that produced `null`.

### 6. The ground the arm rests on is narrower than the arm

Both walks cite `wire-translation.ts:654` and, through it,
`runtime-value-model.md:14` / `schema-subset.md:84`: a `Result` is not a
lowerable type form, is rejected at parse time in any schema-feeding position,
"so a `Result` value never crosses the wire". The parse-time rejection is real
and `tests/result-value-privacy.test.ts:534`–`:535` pins it. What it establishes
is that no **schema** describes a position holding a `Result`. It does not
establish that no `Result` reaches `JSON.stringify`, and at a return boundary
with no schema, one does — measured. The interpolation surface needed a separate
containment mechanism to make the same sentence true there
(`query-escapes-stringification.md:33`, bug 0114); the envelope has none.

### 7. Half of the bound is unwitnessed

`CONTROL (FENCE-NESTED-RESULT)`
(`tests/subagent-return-depth-refusal.test.ts:657`) pins the depth half in both
directions. The non-finite half has no cell: 0180's 27-cell witness contains no
`Result` at all, and `tests/subagent-envelope.test.ts:59`'s eight-row
round-trip corpus has none either. So a later change to `firstNonFiniteNumber`'s
carrier arm — in either direction — is invisible to the suite.

## Why it matters

- **A caller binds a value the callee never produced, with nothing on any
  channel.** Measured (row 1): the wire carries `null` where the callee produced
  `Infinity`, drain `[]`. This is the S1 class bug 0180 was filed to close,
  alive through the one carrier its walk declines to enter, at the boundary bug
  0187 closed for every other shape.
- **The two refusals that ship as one discipline disagree with the serialiser
  about what is on the wire.** PIC-59 presents the non-representability refusal
  and the depth refusal as siblings over the terminal `Ok` payload; both compute
  over a wire form that omits a carrier `JSON.stringify` writes. The
  disagreement is the same class as the enum-carrier defect 0187's review round
  1 caught, in the opposite direction.
- **The depth cap is discontinuous inside one payload.** `[[[[[[1]]]]]]` at
  depth 7 refuses; `[Ok([[[[[1]]]]]), 1]` at depth 8 crosses. Ceiling #4's
  counting algorithm (`schema-subset.md:24`–`:30`) has no carrier exemption, so
  an author reading it cannot predict which of the two refuses.
- **The wider of the two reachable spellings is the typed-looking one.** A
  declared-schema constructor whose field is `number` accepts a `Result` value
  at runtime and the fabricated `null` lands inside the record
  (`{"theta_result":{"v":1,"ok":{"a":{"ok":true,"value":null}}}}`, measured).
  The shape most likely to look checked is not.
- **A shipped unqualified sentence is false at this wire.**
  `runtime-value-model.md:14`'s "so a `Result` value never crosses the wire" is
  measured false by row 3c. The row is what both walks' arms are argued from, so
  the arm and its ground are circular at this boundary.
- **Half of the bound has no witness.** The depth half is fenced both ways; the
  non-finite half is asserted nowhere, in 0180's witness or anywhere else. A
  later change to `firstNonFiniteNumber`'s carrier arm cannot red.
- **The disposition was a scope decision, not an adjudication.** 0187 refused
  the widening because 0180's mechanism was reserved by its own §Non-goals,
  because 0180's §Non-goals records rather than widens, and because
  `wire-translation.ts` was byte-frozen by its §Fix (e)(7). All three are
  properties of that run's scope. Its own report names this residual "the
  strongest candidate for a follow-up filing".

## Fix

Not settled. The surface, the mechanism, both reachable spellings and the two
fences are fixed and measured; the descent's shape, the refusal's identity, and
whether the writer descends the carrier or declines to carry it are undecided.
The run adjudicates against the evidence in (a)–(c) under the constraints in
(d), and carries the same-commit corrections in (e).

One measurement bounds the space: **no parent-side change reaches this**. The
brand is a non-enumerable symbol and never serialised
(`runtime-value-model.md:16`), so the parent receives an ordinary object and
cannot distinguish a `Result`-carried fabricated `null` from a callee that
returned the literal record `{"ok":true,"value":null}`. The information is lost
before the wire. Every route is child-side.

### (a) The walks descend the `Result`'s wire form

Give both refusals the depth and the values the carrier contributes, by
descending `ok` and `value` / `error` exactly as `JSON.stringify` does, counting
the carrier as one level.

Two shapes, and the run states which it takes and what the other would have
cost:

- **One shared carriage-aware descent.** Replace the duplicated carrier
  handling in `firstNonFiniteNumber` (`:376`) and `wireFormExceedsDepthCap`
  (`:475`) with a single wire-form projection or a single visitor both consult,
  so the two walks cannot drift again. Cost: it moves 0180's walk and 0187's
  walk in one hunk, so both witnesses re-derive together; and a projection
  materialises a second copy of the payload inside the envelope writer, which
  the CIO-3 discipline in (d)(1) bounds but does not forbid.
- **A `Result` arm added to each walk.** Two small symmetric edits, each
  local to its own function, each keeping its own bound. Cost: the duplication
  that produced this defect is preserved, and the next carrier shape has to be
  fixed twice. The doc-comments already record that the arms mirror each other
  by hand (`:443`–`:444`).

Either shape refuses row 1 with 0180's named message and row 2 with ceiling
#4's canonical one, which is what makes them one route rather than two.

### (b) The writer refuses to carry a `Result` at all

Treat a terminal `Ok` payload carrying a `Result` at any position as
non-representable, so the sentence
`runtime-value-model.md:14` states — "a `Result` value never crosses the wire" —
becomes true at this wire, as bug 0114's containment rule made it true at the
interpolation surface (`query-escapes-stringification.md:33`).

- **It is the only route that makes an existing unqualified spec sentence
  true.** (a) leaves the carrier on the wire and makes its contents checked;
  (b) removes it.
- **It flips strictly more inputs than (a).** Row 3c — `[Ok(1), 1]`, whose
  payload is finite and within the cap — crosses today and would refuse. Every
  subagent-mode callee returning a compound holding a `Result` refuses,
  including at a typed `invoke<T>` parent and at a top-level `/name` dispatch.
  A route taking (b) enumerates the flips in the form 0187's
  `## Fix (0.116.0)` (e)(2) uses.
- **It needs an identity decision.** Reusing 0180's code and message would name
  a value class this input is not (a `Result` is not a non-finite `number`) —
  the same honesty objection 0187 recorded against widening that row's
  *Trigger*. So (b) either mints a code with its DIAG-2 same-commit registry row
  and reference mirror, or reuses `cause: "return_validation"` with a new
  message and no code on PIC-59's *Marked-root registration refusal* precedent.
  The run states which and why.
- **It is the wider reading of a bound the corpus has not tested.** No
  committed fixture returns a `Result` in any position, so nothing measures
  whether authors depend on the carriage.

### (c) State the bound more widely and close nothing

Leave both walks and add to `runtime-value-model.md:14` the scope its sentence
lacks, so the corpus stops asserting that a `Result` never crosses the wire
while this wire carries one.

- **It moves no input.** GOV-15 observables (a), (b) and (c) are untouched.
- **It leaves the fabrication live.** A caller still binds `null` for
  `Infinity` with an empty drain, which is the whole of bug 0180. A route
  taking only (c) states why a fabricated value inside a `Result` payload is
  acceptable where the same value outside one refuses by name.
- **It is a saving only if (a) and (b) are both refused.** Otherwise the
  sentence is written twice, since (e)(1) is owed either way.

### (d) Constraints every route carries

1. **No unbounded recursion in the envelope writer.** CIO-3
   (`ceilings-3-and-4.md:41`) and `subagent-envelope.ts:437`–`:441` bind every
   route: a descent that enters the carrier still fast-fails the moment a
   node's level would exceed `MAX_JSON_DEPTH`, and a projection that
   materialises a wire form is bounded the same way. This is 0180's recorded
   prohibition and it is not spent here.
2. **`CONTROL (FENCE-NESTED-RESULT)` flips under this report's authority, and
   only under it.** `tests/subagent-return-depth-refusal.test.ts:657` asserts
   both directions of the bound, and its comment names widening as out of bug
   0187's scope. Routes (a) and (b) falsify its first direction and preserve its
   second (the level check still precedes any carrier arm, so `[[[[[Ok(1)]]]]]`
   still refuses on position). The landing route re-pins the cell in that file,
   naming bug 0201 as the authority and re-deriving the comment, exactly as 0187
   re-pinned `CONTROL (FENCE-DEPTH)` — the pattern
   [0197](./0197-params-default-non-enum-head-silently-unfilled.md) §Fix item 6
   used for cell C of
   [0185](./0185-unresolvable-enum-variant-default-panics-recovery.md)'s
   witness. No additive cells go in that protected file; the new rows live in
   this report's own witness.
3. **Every refusal that lands today still lands, byte-stable.** 0180's
   within-cap named refusal — its message, its RFC-6901 pointer rendering, its
   registered code, its `cause` reuse — and 0187's depth refusal — its canonical
   message, its no-code decision, its FIRST-sub-check position in the
   `terminal.ok` arm — are settled. The two witnesses stay green:
   `tests/subagent-envelope-nonfinite-ok-refusal.test.ts` (27 cells) and
   `tests/subagent-return-depth-refusal.test.ts` (13 cells). Rows 2c, 3a, 3b,
   5a and 5b of §Reproduction are green-now-green-after fences.
4. **The refusal's message and pointer for a position inside a `Result`
   payload is decided, not defaulted.** 0180's message carries an RFC-6901
   pointer built by `firstNonFiniteNumber`'s descent (`:597`, rendered at
   `:602`). Under (a) the offending value in row 1 sits at wire position
   `/0/value`, which is a pointer **through the carrier's own field names** —
   names `runtime-value-model.md:16` calls a reference-encoding detail that "may
   change without a spec revision". So the run decides whether the pointer is
   the wire-form pointer (`/0/value`, which an author can locate in the emitted
   JSON but which names an internal field), a pointer to the carrier
   (`/0`), or a message with no pointer for this class — and pins the choice in
   the witness. A pointer naming a private encoding in an author-facing message
   is the same defect class as bug 0079's.
5. **GOV-15 is named, not absorbed, and only in the addition direction.**
   Routes (a) and (b) each newly refuse inputs that load cleanly and succeed
   today — (a): rows 1 and 2; (b): rows 1, 2 and 3c. The run enumerates every
   spelling that flips and in which direction, on the subagent leg (the child
   cannot see the caller's call form, so the untyped `invoke(...)` arm flips
   too — 0187's `## Fix (0.116.0)` (e)(2)(iv), measured). The *Ceiling-set
   carve-out*
   (`source-language-stability.md:13`) is **not** available: 0187 adjudicated on
   the record that the envelope writer validates nothing and compiles no schema,
   so it is not one of ceiling #4's five AJV enforcement points and no
   ceiling-set verb applies; that adjudication also rejected the alternative
   reading, because `:21` classifies "broaden the enforcement-point surface" as
   a *Tighten*, which is "forbidden under theta 1.x" until the conformance suite
   ships. A route here inherits that framing or argues against it explicitly.
   What licenses the flips is the same as 0187's: a recorded departure toward
   specified behaviour (INV-5's never-fabricate, `invocation.md:36`), recorded
   rather than blessed. `ceiling-invariants-and-audit.md:47`'s *Five-site list
   co-edit obligation* stays unengaged for the same reason.
6. **`src/runtime/wire-translation.ts` does not move.** Bug 0174 owns
   `projectForValidation`; 0187 §Fix (e)(7) froze the file and the freeze holds
   here. A route that makes the envelope walks descend a `Result` states whether
   that seam's own `isResultValue` arm (`:654`) still answers the same question,
   and records the divergence if it does not.
7. **`src/runtime/depth-walk.ts` keeps no carrier arm.** It answers for all
   five of ceiling #4's AJV enforcement points, four of which are handed
   already-parsed JSON where neither a boxed `String` nor a branded `Result` can
   occur. `tests/invoke-ceiling-depth.test.ts` freezes it.
8. **Witness — the non-finite half gets one in both directions.** No committed
   cell exercises a `Result` at `firstNonFiniteNumber` at all. The witness
   covers both halves at the seam and at the real writer, plus the caller-side
   observable at the integration tier over real spawned children through
   `createProductionSpawnFn` with all three AGENTS.md `#subagent-child-pins` as
   loud preconditions. Every `Result` is built with the shipped `makeOk` /
   `makeErr`, never a hand-made `{ ok, value }`, so the brand is present. Zero
   model turns — every fixture body is a `let` chain ending in a pure tail
   expression. Each new assertion is proved both directions once.

### (e) Same-commit corrections every route carries

1. **PIC-59's *Result-carriage bound*** (`subagent.md:115`, anchor
   `#subagent-envelope-result-carriage-bound`) — it describes HEAD. Under (a) or
   (b) it is false and is rewritten or deleted; a resolved bound is not left
   described as open. Under (c) it stays and gains the wire-crossing statement.
2. **The two requirement bullets it qualifies** (`:114`, `:110`) — their
   "at every depth the search reaches" / "at any depth the two walks reach"
   qualifications move with (e)(1). Under (a) or (b) they state the reach
   without a carriage exception.
3. **The registry *Trigger*** (`code-registry-runtime.md:32`) — its
   parenthetical deferral to the bound is a statement about HEAD and moves with
   it. A trigger change that brings inputs into the code's emission set is
   covered by the *Diagnostic-registry carve-out*
   (`source-language-stability.md:25`) as an addition; the run cites it.
   `docs/reference/diagnostics.md`'s mirror carries only Code / Sev / Phase /
   Message and is checked for byte-identity rather than assumed.
4. **Both walks' doc-comments and the call-site comment**
   (`subagent-envelope.ts:358`–`:374`, `:448`–`:466`, `:519`–`:531`;
   `production-theta-producer.ts:2292`–`:2306`) — each states the bound and each
   carries the measured example. They move with the behaviour.
5. **The value model's `Result` row** (`runtime-value-model.md:14`) — "so a
   `Result` value never crosses the wire" is measured false at this wire under
   (a) and (c). Under (b) it becomes true and stays as written. Under (a) or (c)
   it is scoped, and the scope names the mechanism that keeps it true at each
   wire it does hold for (the parse-time schema-position rejection; bug 0114's
   containment rule at the interpolation surface).

### (f) Ordering

Nothing blocks this report and it blocks nothing.
[0187](./0187-untyped-subagent-return-boundary-no-depth-ceiling.md) is **fixed
(0.116.0)** and owns `wireFormExceedsDepthCap`, `mapTooDeepReturnValue`, the
call-site arm, the four bound statements and `CONTROL (FENCE-NESTED-RESULT)`; a
route rebases onto its hunks and re-runs its 13-cell witness.
[0180](./0180-invoke-return-nonfinite-number-mode-variance.md) is **fixed
(0.105.0)** and owns `firstNonFiniteNumber` and the 27-cell witness; a route
moving that walk re-runs it and re-derives `CONTROL (FENCE-DEPTH)` if its reason
changes. [0188](./0188-negative-zero-loses-sign-across-subagent-envelope.md) is
**open** at the same writer on a disjoint value class; the two reports do not
block each other, and whichever lands second states whether the other's route
changed what its own walk or serialiser sees inside a `Result`.

## Non-goals

- **Bug 0188's `-0` class.** `-0` is finite, `Number.isFinite(-0)` is `true`,
  and its loss is `JSON.stringify`'s rather than a walk's. No route here widens
  either walk into sign preservation, and
  `CONTROL (FENCE-NEGATIVE-ZERO)`
  (`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:804`) is untouched. The
  boundary between the two reports is stated in §Related: a sign-preserving
  serialiser may or may not reach a `Result`-carried `-0` leaf depending on
  whether it descends the carrier, and that is 0188's decision to record, not
  this report's.
- **0180's within-cap refusal and 0187's depth refusal, outside a carrier.**
  Both are settled and correct: rows 3a and 3b refuse by name and by the
  canonical depth message. Their mechanisms, messages, pointer rendering,
  registered code, `cause` reuse, no-code decision and sub-check order are not
  reopened. Every route keeps them byte-stable outside the carrier.
- **The untyped `invoke(...)` discard.** `invocation.md:28` fixes that the
  untyped form returns `Result<null, QueryError>` and discards the callee's
  value; [0068](./0068-prompt-callee-invoke-final-value-null.md) settled the
  design as wontfix. It appears above only because the child cannot see the
  caller's call form, so a writer-side refusal reaches that arm — a GOV-15
  enumeration obligation, not a surface to change.
- **`src/runtime/wire-translation.ts`.** Bug 0174 owns `projectForValidation`
  and the validated-projection / bound-original split; 0187 §Fix (e)(7) froze
  the file. No route here edits it.
- **`inferCalleeReturnAnnotation` and the parent-side gates.**
  `src/parser/functions.ts`, `#resolveReturnSite` and `#validateInvokeReturn`
  are byte-untouched by every route: the fabrication is written child-side, and
  0172's derivation-floor cells still pin the floor in both directions.
- **The value of `MAX_JSON_DEPTH`.** `schema-subset.md:13` states 5 as "a
  conservative ceiling theta fixes for itself". Whether 5 is right is a
  ceiling-set question; every route here works at whatever the cap is.
- **The parent-side wire-form/carrier divergence.**
  `enforceInvokeReturnDepth` at `#validateInvokeReturn` walks the raw theta
  value with the shipped `depthWalk`, which has no carrier arm. That is 0187's
  `## Fix (0.116.0)` residual 2 — a different seam, a different direction (an
  over-count rather than an under-count), and a different value class (the enum
  carrier). No route here changes it, and no route there closes this.
- **Bug-document prose elsewhere.** 0187's `## Fix (0.116.0)` residual 1 and
  `.pi/tmp/fixes/0187-report.md` describe this class as unfiled. They are
  correct as records of that run; this report does not edit them.

## Provenance

Filed as residual **item 1** of the bug 0187 fix (0.116.0, commit `940206cb`),
recorded in that run's report (`.pi/tmp/fixes/0187-report.md` §*Residuals /
notes* item 1) and in that document's `## Fix (0.116.0)` §*Residuals* item 1.
The residual was measured during that fix's review round 2, by
`bug-fix-reviewer-fast`, against the real production writer, and it closes:
"**This is the strongest candidate for a follow-up filing** — it is an S1-class
fabrication with a live vector, and it is 0180's walk that must move to close
it." A fix run creates no bug documents, so it was left unfiled.

**The three grounds the widening was refused on**, quoted from that run so this
report does not re-litigate them by paraphrase. From
`.pi/tmp/fixes/0187-report.md` §*Residuals / notes* item 1: "Widening was
refused on three cited grounds (0187 §Non-goals reserves 0180's mechanism; 0180
§Non-goals' 'records it rather than widening'; `wire-translation.ts:654`
byte-frozen by §Fix (e)(7))." From that document's `## Fix (0.116.0)`: "Widening
either walk was **refused** on three grounds: §Non-goals reserves 0180's
mechanism ('settled and are not reopened'); 0180 §Non-goals fixes that a route
finding a second hole in the same class 'records it rather than widening' (the
`-0` precedent, discharged with a fence plus a residual and later filed as
0188); and `src/runtime/wire-translation.ts:654`'s own `isResultValue` arm … is
the ground both walks rest on, and that file is byte-frozen by §Fix (e)(7). The
authorised remedy is §Expected behaviour's own first bullet — 'a normative MUST
is true, or it is qualified' — so the bound is stated normatively in PIC-59,
deferred to by the registry *Trigger*, stated in both walks' doc-comments and at
the call site, and pinned in both directions by `CONTROL (FENCE-NESTED-RESULT)`
so a later widening cannot happen silently." All three grounds are properties of
that run's scope. The `-0` precedent they invoke resolved by *filing*
([0188](./0188-negative-zero-loses-sign-across-subagent-envelope.md)), which is
what this document is.

**Re-measured at HEAD `940206cb` for this filing, not copied.** The residual's
two headline rows reproduce byte-identically: `[Ok(1 / 0), 1]` writes
`{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}` with drain `[]`,
and `[Ok([[[[[1]]]]]), 1]` writes an `ok` envelope whose document is `jsonDepth`
8. Five things the residual does not establish, measured here:

- **The controls bracket the class from three sides.** The residual gives the
  past-cap `Result` control. Rows 3a and 3b measure the same two payload classes
  **outside** a carrier, both refusing, so the discriminator is isolated to the
  carriage rather than to the value or the depth.
- **The reachability conjunct is the tail's shape.** Rows 5a and 5b measure that
  a `Result` in terminal position is unwrapped by `surfaceCalleeFinalValue` and
  both walks then reach its payload, so only a *nested* `Result` exhibits the
  class. The residual does not state the conjunct.
- **Both compound spellings reach it, including the typed-looking one.** Row 6
  measures a declared-schema constructor field typed `number` accepting a
  `Result` and emitting the fabricated `null` inside the record, alongside the
  array-literal spelling; a bare object literal is refused at parse.
- **A `Result` crosses this wire at all, which falsifies the sentence the arm is
  argued from.** Row 3c measures `[Ok(1), 1]` crossing as
  `[{"ok":true,"value":1},1]` against `runtime-value-model.md:14`'s "so a
  `Result` value never crosses the wire". The residual reasons from the arm's
  ground without measuring it.
- **The corpus census.** 34 committed `.theta` / `.thetalib`, zero constructing
  a `Result` in expression position and zero nesting an array literal. The
  residual does not census this.

**Measured independently for this filing** by one scratch vitest probe (written,
run, deleted; a case-insensitive sweep over the tree reported afterwards, and
`git status --porcelain` empty). It drives the REAL child-side writer through
`driveSubagentRootRegime` under the `PI_THETA_SUBAGENT_ROOT` regime marker with
`emitResultEnvelope` / `emitDiagnostic` captured — the harness shape
`tests/subagent-return-depth-refusal.test.ts`'s ORDER cells use — plus the three
seams directly over `makeOk`-built carriers. In-process, offline, provider-free,
zero model turns; 1.9 s wall for 7 cells. Every source file the measurement
depends on was verified byte-identical to HEAD by `git hash-object` before the
recorded run, because a sibling session's bug-0188 prototype touched
`src/runtime/subagent-envelope.ts` earlier in the session and was reverted.

**Read from source rather than driven, and marked as such in the text.** What a
*caller* binds: `#validateInvokeReturn`'s early return at
`src/extension/production-theta-producer.ts:3684` is read at HEAD, and bug 0187
§Reproduction (b) row A is the measurement of that chain over real spawned
children for the byte-analogous payload.

Every `src/`, `tests/`, spec and reference citation above was read at HEAD
`940206cb` with `git show HEAD:<path>` and `git grep`; volatile positions in
`src/extension/production-theta-producer.ts` (6479 lines) are named by symbol
beside their line numbers, per
[0134](./0134-params-shift-induced-stale-citations.md)'s adjudication.

## Fix (0.118.0)

- **What shipped** — route **(a)**, adjudicated by the operator; routes (b)
  (decline to carry a `Result`) and (c) (widen the stated bound and close
  nothing) were rejected.
  - `src/runtime/subagent-envelope.ts` — §Fix (a): one shared **exported**
    node-level wire-form classifier `classifyWireNode` returning
    `WireNode = scalar | array | record`, which `firstNonFiniteNumber` and
    `wireFormExceedsDepthCap` both consult; the `isResultValue` arm is gone from
    both walks and the `isResultValue` / `ThetaValue` import is gone from the
    module. A boxed `String` classifies `scalar` — 0187's deliberate `depthWalk`
    divergence, preserved — and a `Result` classifies `record` through the same
    branch a plain object takes, because `RESULT_TAG` is non-enumerable so
    `Object.entries`, like `JSON.stringify`, never visits it. **No dedicated
    `Result` branch exists**: once the brand is excluded a carrier's wire form
    *is* a plain record's, so such a branch would be dead code; the carriage
    decision lives in the classifier's doc-comment. Both walks keep
    `level > MAX_JSON_DEPTH` as their literal first statement, so CIO-3 is
    satisfied with no cap-raising change and no materialised payload copy — the
    classifier exposes one level's children at a time.
  - `src/runtime/subagent-envelope.ts` — §Fix (e)(4): the doc-comments that
    stated the bound moved with the behaviour — both walks', `mapTooDeepReturnValue`'s
    *BOUND* block, plus **two the doc's own (e)(4) list lacked** because it
    predates 0188: `stringifyPreservingNegativeZero`'s (its "Those two walks are
    UNCHANGED" clause is false under route (a)) and `serializeOkEnvelope`'s plus
    the `EnvelopeOk` interface comment.
  - `src/extension/production-theta-producer.ts` — §Fix (e)(4): the `terminal.ok`
    arm's call-site comment only, hand-wrapped to the same line count so no
    position below it shifted. Zero executable lines; the three consults keep
    0187's settled order.
  - `docs/spec_topics/pi-integration-contract/subagent.md` — §Fix (e)(1) and
    (e)(2). The *Result-carriage bound* is rewritten in place by surgical
    sentence replacement, **keeping the anchor `#subagent-envelope-result-carriage-bound`
    present** because three sites link to it. It now states that both walks
    descend a `Result` as part of the wire form, counting the carrier as one
    level; that a payload contributed only from inside a nested `Result` **IS**
    refused; that a `Result` past the cap still refuses on its position because
    the level check precedes the descent; and the **pointer's domain** — "the
    RFC-6901 position in the JSON document the envelope would have carried" —
    together with the note that the token is derived from the encoding by the
    descent, so it moves automatically if the reference encoding changes. All
    **three** qualification sites moved (`:110` twice, `:114` once — the doc's
    own list said two and was wrong); `:110`'s bug-0188 **finite-leaves** scoping
    stays.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md` — §Fix (e)(3): the
    *Trigger* parenthetical now says carrier-contributed depth **is** counted,
    citing the **GOV-15 Diagnostic-registry carve-out**
    (`source-language-stability.md:25`) same-commit for the inputs newly brought
    into the code's emission set. The row's "this code's own reach stops at that
    same depth cap" stays true. **No new diagnostic code was minted.**
  - `docs/spec_topics/runtime-value-model.md` and `docs/reference/type-system.md`
    — §Fix (e)(5): "so a `Result` value never crosses the wire" is **scoped** in
    the spec row and in its reference mirror (the mirror is not named by the doc;
    it is in scope as a checked mirror), naming the mechanisms that keep it true
    elsewhere — parse-time schema-position rejection, and bug 0114's containment
    rule at the interpolation surface — and stating what is now true at this
    wire.
  - `tests/subagent-envelope-result-carriage.test.ts` — **new**, 24 cells, this
    report's own witness (§Fix (d)(8)): a seam tier over `makeOk`/`makeErr`-built
    carriers only, both arms and both directions, pinning `/0/value`, `/0/error`,
    `/0/0/value`, `/a/value`, `/1/value`, `/a/0/value` and a 4-token at-cap row;
    a real-writer tier through `driveSubagentRootRegime`; an integration tier over
    **real spawned children** via `createProductionSpawnFn` with all three
    AGENTS.md `#subagent-child-pins` as loud preconditions; the bug-0188 sign
    rider asserted **positively**; and the prompt-leg zero-flip fence. Zero model
    turns.
  - `tests/live/live-production-acceptance.test.ts` — H8a **cell 55**, additive
    (162 insertions, 0 deletions), on cell 53's shape: a `mode: prompt` parent
    whose sole statement is `b201livekid()?` through a `tools:`-declared
    **uninferred** boundary, and a `mode: subagent` kid whose pure tail is
    `[Ok(1 / 0), 1]` — §Reproduction row 1 verbatim. Asserts the SLSH-3
    `theta-system-note` read off the settled `SessionManager`. Zero model turns.
  - **Two protected-witness re-pins, both in place, no additive cells.**
    `tests/subagent-return-depth-refusal.test.ts`'s `CONTROL (FENCE-NESTED-RESULT)`
    per §Fix (d)(2) itself, naming bug 0201, comment and file header re-derived,
    direction 2 (`[[[[[makeOk(1)]]]]]` refusing on position) preserved.
    `tests/subagent-envelope-negative-zero-fidelity.test.ts`'s
    `CONTROL (FENCE-DEPTH-NESTED-RESULT)` — bug 0188's witness, created after this
    report was filed and so absent from (d)(2)'s inventory of *locations*, though
    inside its enumeration by *disposition*; **ratified on the record** before the
    edit. Exactly one cell, one `expect`, in each file; `it(` counts unchanged
    (13 and 28) and every other cell's assertions byte-identical.
  - `tests/result-value-privacy.test.ts` — one header comment re-derived: it
    quoted `docs/reference/type-system.md`'s `Result` row **verbatim**, and this
    commit's (e)(5) mirror edit removed the quoted words.

- **Gates** (each re-run by the orchestrator independently of the agent that
  reported it): witness `npx vitest run tests/subagent-envelope-result-carriage.test.ts`
  → `Test Files 1 passed (1)`, `Tests 24 passed (24)`; full default suite
  `npx vitest run` → `Test Files 320 passed (320)`, `Tests 5509 passed (5509)`
  (baseline 319 / 5485 at HEAD `2486a514`); `npx tsc --noEmit -p tsconfig.json`
  → exit 0; `npm run lint` → exit 0. Live: `npx vitest run --config
  config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts`
  → 55/55 (one documented ~180 s stall on cell 54, bug 0188's live-model-turn
  cell, ruled out per protocol by an isolated re-run green in 4.4 s);
  H9a across **both** files → `Test Files 2 passed (2)`, `Tests 11 passed (11)`.

- **Review** — 2 rounds, converged. Round 1 (`bug-fix-reviewer`, deep): three
  findings, **all `prose`**, zero `correctness` / `fidelity` / `spec` — stale or
  falsified claims in shipped comments (a `Result` arm named after its removal;
  two present-tense claims in the new witness; a verbatim doc quote this commit
  falsified). Round 2 (`bug-fix-reviewer-fast`, confirmation, owed because the
  fixer-light round touched one assertion-**message** string): **CLEAN**, no
  escalation, two non-blocking prose residuals. One **pre-review correction
  round** (citation/comment-only, not a review round) ran before round 1 to
  re-derive four citations and one falsified premise in the sibling witness that
  this commit's own line-number shift had invalidated.

- **Verification** (`bug-fix-verifier`) — **SOLID**, four obligations:
  1. *The witness genuinely reds.* Neutralised by re-adding the carrier arm at
     `classifyWireNode` — the one choke point both walks now consult, so one
     edit reproduces both halves. 13 of 24 cells red: every `RED (…)` cell red
     and every `CONTROL (…)` cell still green, naming the fabricated `null` on
     the wire, the admitted depth-8 document, the `undefined` seam answer and
     the `scalar`-instead-of-`record` classification — never an import error.
     **Both ratified fence re-pins red under the same neutralisation**, so they
     are load-bearing rather than decorative, while bug 0187's own `UNINFERRED`
     integration cell stayed green, confining the neutralisation to
     `Result`-carriage. Restored by targeted byte edit and proved byte-exact:
     `git hash-object src/runtime/subagent-envelope.ts` →
     `349e29dee3feee0520c62a3b73fc382c07561ecc`, with zero `NEUTRALISATION`
     markers left. Green after restore: 65 tests across the three files.
  2. *The full default suite is green.* 320 files / 5509 tests.
  3. *A live test exercises the fixed path, run for real.* H8a cell 55 added and
     proved in **both** directions: green with the fix (1.1–1.4 s, zero model
     turns), and under the neutralisation red with
     `no SLSH-3 note fired. systemNotes: []` — the defect itself. The three
     `#subagent-child-pins` were read out of `tests/live/harness.ts` and
     verified present rather than assumed. H9a ran across **both** files,
     11/11.
  4. *Lint and typecheck.* Both exit 0.

- **permitted-codes decision, taken on the REAL run and not on assumption:**
  `tests/fixtures/h7a/permitted-codes.json` is **NOT** appended, blob
  `a4a8da04209f90e13d815edd92c1fc682e2a2236` unchanged. Evidence: every one of
  the nine H9a area cells calls `assertCodesSubsetOfPermitted`, a hard
  `expect(outside).toEqual([])` over the codes parsed from the real captured
  stdout+stderr, and all nine passed — so nothing outside the committed
  allowlist was emitted on the real run. The mechanism agrees: no H9a fixture
  constructs a `Result`, so this fix's new refusals are unreachable there.

- **Residuals:**
  1. **`tests/result-value-privacy.test.ts:518` and `:534`–`:535` restate the
     invariant unscoped** — a section banner "only genuine Results never cross
     the wire" and two assertion messages "a genuine Ok/Err never crosses the
     wire". The assertions themselves are correct and green
     (`isWireLowerable(makeOk(1))` is `false` at the schema-lowering surface,
     which this fix does not touch). They were **already imprecise at HEAD** —
     §Reproduction row 3c measured a `Result` crossing this wire before this
     fix — so they are not this commit's falsification. Only the header quote at
     `:45`, whose quoted words this commit's (e)(5) mirror edit deleted, was
     corrected, keeping the line consistent: this commit corrects what it
     falsified and records what was already false. **Not filed** (a fix run
     creates no bug documents).
  2. **`src/runtime/value.ts:98` and `tests/runtime-value-model.test.ts:19`,
     `:47`–`:49` restate "never crosses the wire" unqualified.** Same class as
     residual 1 — false at HEAD, not falsified here — but now contradicted on
     the record by the scoped `runtime-value-model.md:14`. Outside this fix's
     owned set; correcting them would widen the diff. **Not filed.**
  3. **Two prose observations in this report's own witness, ruled non-blocking
     by review round 2.** `tests/subagent-envelope-result-carriage.test.ts:91`
     calls step 3 "the ground both carrier arms are argued from" after the arms
     were removed — the referent is scoped as historical by the file's own
     header 80 lines earlier, and no surviving code is misdescribed. `:93`–`:94`
     quotes `runtime-value-model.md:14` truncated at "never crosses the wire",
     dropping the qualifier this commit's own (e)(5) edit added; the fragment is
     still a literal substring and the behavioural claim it anchors is
     separately pinned by `CONTROL (WRITER-ROW3C)`. Both are tense/quotation
     tightenings, neither affects an assertion.
  4. **Citations into `src/runtime/subagent-envelope.ts` from files this fix does
     not own are stale by construction** — the module grew 707 → 764 lines.
     Named: `tests/subagent-envelope-nonfinite-ok-refusal.test.ts:129`, `:581`,
     `:879`; `tests/invoke-prompt-cell-enum-return.test.ts:15`;
     `tests/invoke-return-enum-carrier-projection.test.ts:850`. Bug
     [0134](./0134-params-shift-induced-stale-citations.md)'s do-not-chase
     class. Every citation in a file this fix **does** own was re-derived and
     verified, and the two protected witnesses' line counts were held constant
     so nothing citing *them* moved.
  5. **This report's own body carries six citations measured at `940206cb`** that
     are stale at the landing HEAD — disclosed at filing, same 0134 class. The
     `## Fix` record above is measured at `2486a514`.
  6. **One documented live flake, not a regression.** H8a cell 54 (bug 0188's
     live-model-turn cell) hit the ~180 s stall class during the full-file run;
     `docs/bugs/` carries no open report with a matching signature; the isolated
     re-run passed in 4.4 s. The function it exercises,
     `stringifyPreservingNegativeZero`, is not one this fix changes behaviourally.

- **Discharge notes appended:** [0187](./0187-untyped-subagent-return-boundary-no-depth-ceiling.md)'s
  `## Fix (0.116.0)` §*Residuals* item 1, and
  [0180](./0180-invoke-return-nonfinite-number-mode-variance.md)'s §*Non-goals*
  bullet *Other `JSON.stringify` holes at the envelope*. Both appended, neither
  rewritten. **No note is owed to
  [0114](./0114-nested-result-in-interpolated-object-leaks-carrier.md)** — it
  shipped the containment rule at the *interpolation* surface and its record is
  accurate about that surface; the (e)(5) scoping only makes
  `query-escapes-stringification.md:33`'s existing cross-reference precise about
  which wires the sentence speaks for.

- **Pinned dispositions / non-goals:**
  - **§Fix (d)(6) statement, owed and recorded.** `src/runtime/wire-translation.ts`
    is byte-frozen and untouched. `projectForValidation`'s `isResultValue` arm
    **still answers the same question** — "what should AJV's structural gate see
    at a *typed* return boundary?" — and its answer is unchanged, because no
    `returnSchema` position can hold a `Result`. The two seams now **diverge
    deliberately**: that arm reasons about schema-described positions, while
    `classifyWireNode` answers "what does `JSON.stringify` see at this node?" for
    a boundary carrying no schema at all. `CONTROL (PROMPT-TYPED)` pins the typed
    gate's verdict unchanged.
  - **Ceiling #4 is untouched.** `src/runtime/depth-walk.ts` keeps no carrier arm
    (§Fix (d)(7)); the per-boundary AJV enforcement-point table is unchanged; the
    *Five-site list co-edit obligation* stays **unengaged — no co-edit is owed**,
    keyed as it is to rows of that table, which this seam is not one of. The
    **Ceiling-set carve-out is not available** and 0187's framing is inherited
    rather than argued against; what licenses the flips is the same recorded
    departure toward specified behaviour (INV-5's never-fabricate,
    `invocation.md:36`).
  - **GOV-15, addition direction only**, rows i–ix, including the `Err`-carrier
    growth row and the declared-schema-constructor spelling; the prompt→prompt
    attach leg is a **zero-flip fence**, asserted rather than assumed.
    `[Ok(1), 1]` (wire depth 3) **stays admitted** — only rejected route (b)
    would have flipped §Reproduction row 3c.
  - **Not reopened:** 0180's within-cap named refusal and 0187's depth refusal
    outside a carrier — message, pointer rendering, registered code, `cause`
    reuse, no-code decision and FIRST-sub-check order all byte-stable; the
    untyped `invoke(...)` discard ([0068](./0068-prompt-callee-invoke-final-value-null.md),
    **wontfix**); the value of `MAX_JSON_DEPTH`; and the parent-side
    wire-form/carrier divergence at `enforceInvokeReturnDepth`, which
    [0202](./0202-parent-depth-walk-counts-carrier-not-wire-depth.md) owns —
    `src/parser/functions.ts` is byte-identical and
    `production-theta-producer.ts`'s only change is the comment-only rewrite of
    the `terminal.ok` arm's header.
