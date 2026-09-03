# Bug 0413 — PIC-51b is implemented nowhere on the prompt-mode probe: a driven turn ending on `stopReason: "length"`, `"aborted"`, `"content_filter"`, or any unrecognised terminator — and a turn with no trailing `assistant` message at all — extracts as a successful `Ok(string)` with zero diagnostics, where the spec pins `Err(context_overflow)` / `Err(transport)`

- **Status:** fixed (0.402.0).
- **Sev/Diff estimate:** S1/D2 — truncated/filtered/torn turns bind as `Ok(text)` with zero diagnostics on the prompt path (silent wrong values; the settle predicate deliberately stands PIC-70 down on the premise this classifier catches them); fix extends one classifier plus two consumer sites with the seam and off-session contrast already in place, sequenced against sibling 03's fold edit.
- **Kind:** defect — implementation diverges from a stated rule.
  `conversation-drive.md:16` (PIC-51b): each of these "is a failed turn and
  MUST NOT be extracted as a successful `Ok(string)`"; case (ii) pins
  `transport` with `message: "provider transport failure"` "rather than to
  `Ok("")`" verbatim.
- **Related:**
  - 0012 (fixed 0.25.0) — recorded this exact gap as an explicit
    residual, adjacent to and not part of its scope: "a reply-side aborted
    stop under a live signal still extracts as `Ok(text)` on the live path
    (the probe classifies no non-`\"error\"` stop reason)". Never filed as its
    own report; this is that filing, widened to the full PIC-51b arm set.
  - 0007 (fixed 0.18.0) — the same class on the OFF-session path
    (`classifyOffSessionReply`), fixed there with full stop-reason
    classification. The on-session sibling position was never brought level.
  - 0289 (fixed 0.286.0) — pinned the one PIC-51b arm that IS legal
    (empty-text assistant on a normal boundary → `Ok("")`); does not touch the
    failure arms.
  - [0182](./0182-off-session-fold-fabricated-200-vetoes-overflow-match.md)
    and [0291](./0291-off-session-transport-fold-pins-retryable-false.md)
    (both fixed) — prior inspections of `extractPromptModeQueryResult`; each
    §Non-goals recorded PIC-51b's arms as out of scope on the off-session
    question they were answering. Prior sightings, not coverage.
- **Affected** (verified at `c2c25d81`, v0.398.0):
  - `src/runtime/prompt-transport-mapping.ts:149–184` —
    `extractPromptModeQueryResult`: cancellation short-circuit (`:160`),
    `stopReason === "error"` arm (`:170`), then unconditional
    `Ok(extractTrailingTurnText(...))` (`:183`). No `"length"` arm, no
    non-normal-terminator arm, no absent-trailing-assistant arm.
  - `src/extension/production-theta-producer.ts:5013, :5122` — both consumers
    additionally filter `if (!probe.ok && probe.error.kind === "transport")`,
    so even a probe fixed to return `context_overflow` would fall through to
    the `kind: "text"` extraction at these sites (`:5017`, `:5125`).
  - `src/extension/production-theta-producer.ts:5688–5700` — the settled-turn
    predicate's comment claims "Classification itself stays with
    `extractPromptModeQueryResult`, the single implementation of the PIC-51 /
    PIC-51b / PIC-53 ordering"; PIC-51b's arms are absent from that function.
  - Contrast (rule enforced at the sibling position):
    `production-theta-producer.ts:6588–6633` `classifyOffSessionReply`
    classifies every non-normal `stopReason` through
    `classifyProviderResponse`, `"length"` → `ContextOverflowError`.
  - The receiving seam already exists:
    `src/runtime/query-tool-loop.ts:110–116` widens the `transport` arm to
    `TransportError | ContextOverflowError` citing "PIC-51b". The off-session
    driver feeds it today (`production-theta-producer.ts:6634` →
    `:6227–6230`); only the prompt path bypasses it.
- **Observed at:** v0.398.0 (`c2c25d81`). Offline, deterministic: production
  prompt binding (`createProductionProducerDeps` → `bindPromptConversation` →
  `executeBody`) driven against a scripted `sessionManager` double, the
  `tests/b0288-prompt-turn-completion-witness.test.ts` rig shape; scratch
  probe (deleted).

## Summary

`conversation-drive.md:16` PIC-51b requires the prompt-mode driver, after the
cancellation and `stopReason: "error"` short-circuits, to classify the driven
turn's trailing `assistant` `stopReason` through the stop-reason arm of
provider-error-mapping: `"length"` → `Err(context_overflow)`; every other
non-normal terminator (content filter, `"aborted"`, anything unrecognised) →
`Err(transport)` carrying `errorMessage` or the fixed
`"provider transport failure"`; and — case (ii) — a settled turn with **no**
trailing `assistant` message at all → `Err(transport,
"provider transport failure")`, explicitly "rather than to `Ok("")`".

`extractPromptModeQueryResult` implements only PIC-51's `"error"` arm. Every
other terminator — and the absent-assistant case — falls through to PIC-53's
`Ok(string)` extraction. The bound value is the truncated / filtered / torn
partial text (or `""`), indistinguishable from a genuine answer, with zero
diagnostics anywhere. The identical classification exists and works on the
off-session path (bug 0007's fix), so the same model behaviour yields
`Err(context_overflow)` in a `subagent fn` body query and `Ok(truncated)` in
a prompt-mode theta.

## Reproduction

Offline. Drive the production prompt binding with a one-query theta
(`let v = @`Ping`?` … `v`) against a `sessionManager` double whose driven turn
settles instantly, varying the trailing assistant:

| Cell | Trailing turn shape | Spec (PIC-51b) | Observed |
|---|---|---|---|
| (a) | assistant `stopReason: "length"`, text `"TRUNCATED PREFIX"` | `Err(context_overflow)` | `success`, final value `"TRUNCATED PREFIX"` |
| (b) | assistant `stopReason: "content_filter"`, `errorMessage: "blocked by policy"` | `Err(transport, "blocked by policy")` | `success`, final value `"partial"` |
| (c) | `user` + `toolResult` only, no assistant (settled arm 2) | `Err(transport, "provider transport failure")` | `success`, final value `""` |
| (d) | assistant `stopReason: "aborted"`, theta signal NOT aborted | `Err(transport)` | `success`, final value `"torn partial"` |

Harness: copy the `ScriptedLiveSession` shape of
`tests/b0288-prompt-turn-completion-witness.test.ts` with a `stopReason` knob
on the appended assistant (that harness hardcodes `"stop"`), plus a
toolResult-only turn variant. All four cells green-witness the divergence in
~16 ms.

## Expected behaviour

`conversation-drive.md:16` PIC-51b, quoted: "Each of these is a failed turn
and MUST NOT be extracted as a successful `Ok(string)` … the runtime MUST
classify the trailing turn's `stopReason` through the **stop-reason arm only**
of Stop-reason classification: `"length"` maps to `Err(QueryError { kind:
"context_overflow", tokens_used: null, tokens_limit: null })`, and every other
non-normal terminator maps to `Err(QueryError { kind: "transport", … })` …
**(ii)** only when **no** trailing `assistant` message exists at all after a
non-cancelled, non-`"error"` resolution … MUST map to `transport` `Err` with
`message: "provider transport failure"` rather than to `Ok("")`."
`provider-error-mapping.md:33` defines the stop-reason arm. PIC-53
(`conversation-drive.md:16`) runs "only for a trailing turn that terminated on
a normal `end_turn` / `stop` / `tool_use` boundary".

## Actual behaviour / root cause

`src/runtime/prompt-transport-mapping.ts:149–184`: after the aborted
short-circuit and the `trailing.stopReason === "error"` arm, control reaches
`return { ok: true, value: extractTrailingTurnText(messages) }` for every
other shape, including `trailing === undefined`. The module's own header
(`:9–:23`) documents only PIC-51/PIC-50; PIC-51b was specified on the same
spec bullet but never landed. The two consumers
(`production-theta-producer.ts:5013`, `:5122`) compound the gap by dropping
any non-`transport` `Err` kind from the probe on the floor.

## Why it matters

Impact class 1 — silent wrong values. A context-overflowed reply binds its
truncated prefix as the query's `Ok`; downstream theta code (and any
`invoke` parent) consumes a half answer as a whole one. A content-filtered or
torn turn does the same. The turn-settle predicate deliberately admits these
shapes as "settled" (`production-theta-producer.ts:5688–5700`) on the stated
premise that `extractPromptModeQueryResult` classifies them — so PIC-70's
loud-expiry machinery correctly stands down and nothing else can catch the
failure. The off-session/on-session asymmetry also makes the same theta
behave differently by mode with no diagnostic.

## Non-goals

- The empty-text-on-normal-boundary `Ok("")` (pure tool-use turn) — spec-legal
  per PIC-51b/PIC-53, pinned by bug 0289. Unchanged.
- The cancellation short-circuit and PIC-51 `"error"` arm — correct today.
- The off-session classifier (bug 0007's fix) — correct today.
- Bug 0012's signal-keyed cancellation guards — orthogonal; cell (d) here is
  the NON-aborted-signal half 0012 explicitly left to this gap.

## Fix

Extend `extractPromptModeQueryResult` between the `"error"` arm and the
`Ok` extraction: when a trailing assistant exists, classify its `stopReason`
through the stop-reason arm (reuse `classifyProviderResponse` with
`httpStatus: null`, or a local closed map: `"length"` → `ContextOverflowError`,
non-normal → `TransportError` with the `errorMessage ?? fallback`); when no
trailing assistant exists, return the fixed transport `Err`. Widen
`PromptModeQueryResult`'s error type accordingly, and at the two consumer
sites divert on every `!probe.ok` verdict except `cancelled` (which the
enclosing loops own), mirroring `driveRepairAttempt`'s `if (!probe.ok)`
handling at `:5233–5238`. Add the normal-boundary set
(`end_turn`/`stop`/`tool_use` + absent/non-string fixture shorthand) as the
explicit fall-through to PIC-53. Fixture: the reproduction cells above.
Recommended; no alternative considered viable since the seam
(`FreePhaseTurn`'s widened transport arm) already exists and is exercised by
the off-session driver.

Sequencing: [bug 0415](./0415-governor-max-rounds-final-boundary-ok-text.md) edits the same
`nextFreePhaseTurn` round-0 fold (`production-theta-producer.ts:4993–5017`)
for a distinct obligation (CIO-4 round accounting vs PIC-51b stop-reason
classification). Not a merge; sequence the two fixes to avoid a textual
conflict.

## Provenance

- Spec measured against: `docs/spec_topics/pi-integration-contract/
  conversation-drive.md:16` (PIC-51, PIC-51b, PIC-53 ordering),
  `docs/spec_topics/pi-integration-contract/provider-error-mapping.md:33`
  (stop-reason classification arm).
- Implementation: `src/runtime/prompt-transport-mapping.ts:149–184`,
  `src/extension/production-theta-producer.ts:5013/:5017/:5122/:5125/:5688–5700/:6588–6633`,
  `src/runtime/query-tool-loop.ts:110–116`.
- Found by: prompt-drive-lifecycle bug-hunt (seed 3, terminal outcome
  folding); the 0012 residual note pointed at the aborted-stop cell, code
  reading widened it to the full PIC-51b arm set, offline probe confirmed all
  four cells.

## Fix (0.402.0)
- What shipped:
  - `src/runtime/prompt-transport-mapping.ts` — `extractPromptModeQueryResult` now implements PIC-51b after the cancellation short-circuit and the PIC-51 `stopReason:"error"` arm: a settled turn with NO trailing `assistant` → `Err(transport, "provider transport failure")` (case (ii), "rather than `Ok("")`"); `"length"` → `Err(context_overflow)` with `tokens_used/tokens_limit: null` via a LOCAL CLOSED MAP (stop-reason arm ONLY — deliberately NOT `classifyProviderResponse`, whose overflow arm signature-matches and whose transport arm sets `retryable:true` on a null status); every other non-normal terminator (raw provider strings outside pi-ai's typed `StopReason` union included) → `Err(transport, errorMessage ?? fallback, retryable:false, http_status:null)`; a normal boundary (`stop`/`end_turn`/`toolUse`/`tool_use`, or an absent/non-string `stopReason`) → PIC-53 `Ok`. Module header documents PIC-51b (anchors conversation-drive.md:16, provider-error-mapping.md:33).
  - `src/extension/production-theta-producer.ts` — both prompt-mode consumer sites (round-0 free phase; degraded forced-respond) now divert on `!probe.ok && probe.error.kind !== "cancelled"`, casting `TransportError | ContextOverflowError`, so a `context_overflow`/absent-assistant verdict is no longer dropped by the old `kind === "transport"` filter; cancellation stays owned by the enclosing loop (excluded, not re-classified). `src/runtime/query-tool-loop.ts` needed no edit — its `FreePhaseTurn` transport arm was already `TransportError | ContextOverflowError`.
- Gates: witness `tests/b0413-pic51b-non-error-terminators-witness.test.ts` 10/10 green (8 divergence cells + 2 over-fire controls); full default suite 571 files / 10441 tests green (one parallel-load flake `tests/production-tools-load-resolution.test.ts`, a `beforeAll` hook timeout under concurrent load, green isolated 50/50 and referencing neither edited file — recorded as load noise per the isolated-re-run law); `tsc -p tsconfig.json --noEmit` clean; `eslint "src/**/*.ts"` clean.
- Review: 1 round — `bug-fix-reviewer` CLEAN; no correctness/fidelity/spec findings; one non-blocking `house-rule` residual (R1, below).
- Verification: SOLID. (A) revert-witness red-proof: neutralising the PIC-51b tail of `extractPromptModeQueryResult` reds 8/10 witness cells (2 controls stay green), restore byte-exact (`git hash-object` match) → 10/10 green — both directions. (B) full suite 571/571 green (isolated re-run of the one load flake 50/50). (C) tsc + lint clean. (D) diff confined to the two named src files + the witness; `query-tool-loop.ts` unmodified. Live: adjacent H9a cell `tests/live/acceptance/b0351live-value-position-query-success-binds.test.ts` green through the real `pi -p` (decidable answer 142, 6.95s) — the on-session normal-boundary `Ok` over-fire guard the classifier change could have regressed. A NEW red-at-fork live cell is not constructible for 0413's failure input classes (a live model cannot be forced to terminate on `stopReason:"length"`/`"content_filter"`/`"aborted"` or to omit its trailing assistant), so those classes are discharged by the revert-proven offline witness; the live obligation is the Ok-path over-fire guard.
- Residuals:
  1. R1 (house-rule): `PROMPT_MODE_NORMAL_STOP_REASONS` (prompt-transport-mapping.ts) duplicates `OFF_SESSION_NORMAL_STOP_REASONS` (production-theta-producer.ts) — same four members, same open-string defensive read, one disposition. Judged NOT a 0326 taxonomy fork: the runtime module sits below the extension layer, so importing the extension const would invert the dependency and hoisting it would refactor the cross-lane producer file (barred in this lane). Self-documented with a cross-reference comment. Follow-up (non-cross-lane window): hoist the set into the runtime layer and re-point the extension copy.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the pure-tool-use empty-text `Ok("")` on a normal boundary (bug 0289) — an assistant that is PRESENT but empty, distinct from case (ii)'s ABSENT assistant — unchanged; the cancellation short-circuit and the PIC-51 `"error"` arm unchanged; the off-session classifier (bug 0007) unchanged; bug 0012's signal-keyed cancellation guards orthogonal (cell (d) here is the NON-aborted-signal half 0012 left to this gap); DIAG-2 registry untouched (reuses the existing `transport`/`context_overflow` kinds — no new codes).
