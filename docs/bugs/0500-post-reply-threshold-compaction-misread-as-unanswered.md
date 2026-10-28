# Bug 0500 — bug 0482's `trailingCompactionUnanswered` misreads a post-run threshold compaction appended AFTER this turn's final reply: the answered turn reads unsettled forever, the settle poll burns its 10 s bound, and a completed answer is discarded as `Err(transport)` "on-session turn did not settle"

- **Status:** fixed (2026-10-28; Git-commit deployment, no package version bump). Final full gates and corrective independent reviews passed. Round-1 aggregate greens were NOT acceptance. Baseline `0cb1569447ff21d25ea833f5d42670cd452658c5`, isolated branch `fix/0500-compaction-finalization`. The user approved the combined retained-answer plus one-shot no-operational-tools finalization policy; this supersedes the earlier investigation-only/narrow plan. No version bump or historical batch/run changes. The historical folded-into-0501 release proposal below is not a shipped fix or the current authority.
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S3/D1 — S3: no silent corruption (the failure is
  loud), but it is FALSE — the turn completed and its reply is sitting in
  the session; the drive discards it, waits the full 10 s settle bound,
  and returns `Err(transport)` as if the provider never answered. The
  trigger is ordinary long-session operation: any driven turn whose final
  usage crosses the host's compaction threshold gets the post-run
  threshold compaction and hits this shape, on BOTH host pins. A theta
  loop that legitimately grows context (review lenses, long tool runs)
  fails exactly on its heaviest — most expensive — turn, and a retrying
  caller re-burns the whole turn. D1: one predicate arm in
  `trailingCompactionUnanswered` (or its `thisTurnSettled` call site) plus
  session-double witnesses; the raw-path plumbing it needs already exists.
- **Where (pi-theta, main a79c1c1e):**
  - `src/extension/turn-settlement.ts:149–163`
    (`trailingCompactionUnanswered`) — walks the raw leaf path backwards;
    the FIRST hit decides: a `compaction` entry → `true` (unanswered), an
    `assistant`/`toolResult` message entry → `false`. A compaction
    appended after this turn's reply is always the first hit from the
    end, so the answered turn reads unanswered, with no arm that asks
    whether the reply PRECEDES the compaction.
  - `src/extension/turn-settlement.ts:131–137` (`thisTurnSettled`) —
    `… && !trailingCompactionUnanswered(path)`: the projected-slice check
    passes (the reply is there) but the path check vetoes settlement.
  - `src/extension/live-prompt-query-driver.ts:932–939` — the settle poll
    spins `TURN_SETTLE_POLL_BOUND` 1000 × `POLL_INTERVAL_MS` 10 ms = 10 s,
    then `#recordLifecycleExpiry("settle", 10000)` →
    `Err(transport)` with `PROMPT_MODE_SETTLE_PHASE_EXPIRY_MESSAGE`
    (`src/runtime/prompt-transport-mapping.ts:116`): "on-session turn did
    not settle: the run never completed and its reply never landed
    (waited 10000ms)" — both clauses false here.
  - `src/extension/production-theta-producer.ts:833–841` — the
    `readContextPath` comment documents why the raw path is consulted
    (the compaction hoist moves the `compaction` entry to the HEAD of the
    built `Message[]`), which is also why the projected messages look
    settled (`[compactionSummary, user, assistant]`) while the raw path
    ends `[…, user, assistant, compaction]`.
  - `tests/b0482-mid-turn-compaction-not-turn-settled.test.ts` — 0482's
    cell inventory: (1) `:386` wait-through (reply FOLLOWS the
    compaction), (2) `:432` reply absent → PIC-70 expiry, (3a) `:468` no
    compaction, (3b) `:487` compaction from a PRIOR turn before this
    turn's user+reply. No cell covers a compaction appended after THIS
    turn's reply — the post-run threshold shape below.
- **Where (host — both pins append a threshold compaction after the
  turn's final reply, before the run settles):**
  - pi 0.80.10 (repo devDependency) `dist/core/agent-session.js:782` —
    `_handlePostAgentRun` → `if (await this._checkCompaction(msg))` runs
    AFTER the turn's final assistant; the threshold arm at `:1585–1586`
    (`shouldCompact(...)` → `_runAutoCompaction("threshold", false)`)
    appends the `compaction` entry (`appendCompaction`, `:1678`) and, with
    `willRetry === false`, returns `this.agent.hasQueuedMessages()`
    (`:1712`) — normally `false`, so `_handlePostAgentRun` returns false
    and the run settles idle with the compaction entry as the leaf's last
    entry. No assistant will ever follow it.
  - pi 0.87.1 (operator's global install) — identical shape:
    `_handlePostAgentRun` → `_checkCompaction(message, true, toolResults)`
    at `:1135`; threshold arm `:2137–2138`; `appendCompaction` +
    `return this.agent.hasQueuedMessages()` inside `_runAutoCompaction`.
    (`:1278`'s pre-prompt compaction check appends BEFORE the next turn's
    `user` entry — that is guard cell (3b)'s already-handled shape.)

## Observed (2026-09-28, release review of the 0483 fix; scratch cell, not live)

Reviewer scratch cell over a BUILT entry list — leaf path
`[…, message(user), message(assistant, stop)]` plus a trailing
`compaction` entry, projected messages
`[compactionSummary, user, assistant]` — drove the settle path and got
`Err(transport)` "on-session turn did not settle: the run never completed
and its reply never landed (waited 10000ms)", identically before and after
the 0483 fix (no fix-induced drift; the 0483 classifier never runs because
`thisTurnSettled` never turns true). Not reproduced against a live host
yet — a live witness must drive a real session across the compaction
threshold (`compaction.reserveTokens` in host settings) so the post-run
threshold compaction fires; the host-side ordering is verified by the
source walk above.

## Expected

An ANSWERED compaction settles. The distinguishing fact is order and
stop-shape within this turn: a compaction entry appended after this
turn's final normally-stopped assistant is post-run bookkeeping for the
NEXT turn — the driven turn is over and its reply is bound. The
unanswered arm exists for 0482's real cases: a compaction that interrupts
the turn (mid-turn overflow — any assistant before it is a partial with a
non-normal stop) or one that no reply ever follows.

## Actual

`trailingCompactionUnanswered` keys only on "is a `compaction` the first
thing from the end of the path" — order within the turn and the stop-shape
of what precedes it are never consulted — so the post-run threshold
compaction vetoes settlement forever, the drive expires the 10 s settle
bound, and the completed answer is thrown away as a transport error.

## Historical fix direction (not the implementation contract)

**Historical proposal referring to bug 0501 §Fix item 1** (this bug's
fix is folded there). The settled predicate refines item (1) below in two
ways: "answered" keys on the NEAREST preceding `message` entry before the
trailing compaction (skipping non-message entries, stopping unanswered at
another `compaction`) rather than on any assistant between the turn
anchor and the compaction — so no turn-anchor threading is needed and
the walk stays raw-path-local — and the accepting stop set is the
TERMINAL pair `{"stop", "end_turn"}` (new
`PROMPT_MODE_TERMINAL_STOP_REASONS`), NOT the full
`PROMPT_MODE_NORMAL_STOP_REASONS`: a `toolUse` member would re-bind bug
0482's mid-turn wait-through partials (a multi-round turn's earlier
`toolUse` assistants precede the recovery compaction on the path).

As filed:

Teach the predicate what "answered" means, using the anchors both callers
already hold:

1. **Predicate:** a trailing compaction is ANSWERED when a settled
   assistant of THIS turn precedes it within the turn — concretely, when
   walking back and hitting the `compaction` entry, continue the walk to
   this turn's own `user` anchor: an `assistant` message entry between the
   anchor and the compaction whose `stopReason` is a NORMAL terminator
   (the `PROMPT_MODE_NORMAL_STOP_REASONS` set — reuse it or mirror it) →
   `false` (settled). Equivalent formulation: compare the compaction
   entry's path position against this turn's final normally-stopped
   assistant entry; compaction later → answered. `thisTurnSettled` must
   pass its `turnStart`-derived anchor down (today the predicate sees the
   whole path with no turn boundary).
2. **Preserved 0482 behaviour:** mid-turn overflow (cell 1) keeps waiting
   — the assistant before that compaction is the partial attempt with
   `stopReason` error/aborted (non-normal), so the compaction stays
   unanswered and the wait-through + reply-follows path is untouched; on
   pi ≥ 0.87 the overflow arm's `context_edit` omission (bug 0499) leaves
   the RAW entry's non-normal stop visible to this walk, so the arm still
   holds. Reply-absent (cell 2) still expires loudly: no normally-stopped
   assistant precedes the compaction. Prior-turn compaction (cell 3b) is
   unchanged — an assistant/toolResult after it already answers it on the
   existing first-hit arm.
3. **Witnesses:** extend the b0482 suite with the missing cell family —
   (4) compaction appended after this turn's normally-stopped reply →
   settles immediately and binds the reply (RED today: 10 s expiry);
   (4b) same but the pre-compaction assistant is an error/aborted partial
   → still waits (guards the discriminator); plus a projected-shape cell
   asserting `[compactionSummary, user, assistant]` binds the assistant
   text. Optionally one live cell driving a tiny-threshold session across
   compaction. Coordinate with 0499's fix — both walk the raw this-turn
   slice; a shared helper (turn-anchored raw-path slice) serves both.
4. **Spec:** amend PIC-70's unanswered-compaction sentence
   (`conversation-drive.md`) to define "answered" by the rule in (1), so
   the settle-phase expiry stays the backstop for genuinely unanswered
   compactions only.

## Relation to prior bugs

- **0482 (fixed)** — introduced `trailingCompactionUnanswered` and the
  raw-path read for the mid-turn compaction bug; this bug is its inverse
  shape (compaction after the reply instead of before it), missed by all
  four of its guard cells.
- **0499 (filed together)** — the ≥ 0.87 overflow omission immediately
  precedes an overflow compaction; the two fixes share the turn-anchored
  raw-path walk and must not fight (an omitted error entry keeps its
  non-normal stop for this bug's discriminator).
- **0483 (open, fix in flight)** — same review; its ride loop re-enters
  the settle wait, so a false unanswered-compaction veto would also stall
  the ride — the fix here keeps the 0483 ride's settle reads truthful.


## Verified combined implementation — 2026-10-28

The precise normative contract is [PIC-70 and bounded output finalization](../spec_topics/pi-integration-contract/conversation-drive.md#bounded-output-finalization), with the [ordinary-repair exception](../spec_topics/query/query-failure-and-repair.md#schema-validation-respond-repair). The implementation plan and logs are retained in the isolated worktree's ignored `.pi/tmp/b0500/` directory; no retained historical source or completed batch was edited.

### Retained answer, first

`turn-settlement.ts::trailingCompactionUnanswered` now accepts the proven owned projection. A bookkeeping-only suffix of one or several compactions cannot veto its exact retained terminal `stop`/`end_turn` assistant. The nearest substantive ending and last projected substantive ending must be that same message; tool calls/results, unfinished/error/aborted/length work and later input cannot be skipped to borrow an older answer. `thisTurnSettled` and `OwnedTurnAttempt.read` share this rule for ordinary, relocated and fast-between-polls paths. The existing idle/start/end waits, ownership, omission and empty-answer classifications are preserved.

### Unavailable output, conservatively

`finalization-evidence.ts::FinalizationEvidenceRetention` observes eligible SDK projection reads during the original attempt, retaining at most 64 nonterminal evidence messages / 65536 UTF-8 JSON bytes. Stable source IDs, copied content and active-prefix content hashes (at most 256 own-path entries) bind the snapshot. It never snapshots the terminal answer. Own edits, observed branch-prefix replacement/removal, content mutation at full-validation boundaries, foreign/unsupported input and ownership changes invalidate retention; oversized or never-observed evidence refuses rather than truncating or reading raw content. `finalizationEvidence` audits current raw completion metadata and all evidence coverage. Every unique operational call needs exactly one successful matching nonempty text receipt, without orphan/duplicate/missing/error/incomplete nested records or failed assistant residue. System prompt/tool-state entries in the own span are carried as constraints/historical declarations, not proof of work or newly available tools. Missing terminal recovery requires a real post-terminal compaction and previously observed complete call/receipt evidence. No summary or raw unavailable answer content enters dispatch. Fully retained completed typed output can separately qualify after indexed-window relocation.

`LivePromptQueryModel` keeps the sticky relocated-window guard and pins the SAME immutable owned-lineage/user/terminal/projection/evidence/content proof before auth, each dispatch/fallback and acceptance. Finding some other currently eligible proof is insufficient; real same-user SDK branch replacement fails closed without retargeting. Existing output/capture takes priority, PIC-79 omission and foreign/cancellation refusal precede finalization, and ordinary replay never clears its guard. Pre-send/start/end/idle failures, active work, continuation rides and operational repair restarts are ineligible. `ProductionThetaProducer.#buildLiveModelOptions` supplies the same resolved model/registry-auth policy for untyped finalization as typed dispatch already uses.

`off-session-finalization.ts::dispatchFinalization` creates a fresh serialized context containing the original rendered query, retained owned evidence/constraints and required schema. Typed requests declare only private `__theta_finalize`, with disjoint `{outcome:"answer", answer:<original business wire arguments>}` / `{outcome:"abstain"}` outcomes. Local schema refs/defs and non-object wire envelopes preserve their meaning. Untyped requests declare zero tools and use a JSON text answer/abstain envelope; no legitimate answer string is a reserved sentinel. Exact metadata/cardinality is checked first, then the decoded/unwrapped business payload is depth-walked BEFORE AJV. Malformed/ambiguous, abstaining, depth-invalid and schema-invalid output terminate as nonretryable recovery transport BEFORE ordinary repair entry, for budgets 0 and 3 alike. One query-lifetime logical attempt permits at most one tools-identical named-forcing-rejection fallback, within a single 60-second auth/dispatch deadline; no operational replay, governor/capture rearm or recursive recovery. Cancellation and proof checks surround async boundaries. The fixed informational note is delivered AFTER all acceptance checks, because normal idle SDK sendMessage persists a context-producing custom message; arbitrary notes/custom messages are not whitelisted. No claim that compaction caused loss is made.

### Round-3 bounded proof correction (R2-C1)

Independent round-2 correctness review found that the optional proof eagerly serialized the entire raw path, including compacted unrelated history, even on healthy retained-output success. Its real SDK/driver witness had 10500 historical 50-KiB receipts, a 327-byte projection, and an ordinary answer discarded by `RangeError: Invalid string length`. Unchanged own-prefix polling also rehashed a 1-MiB query twice per poll. The original diagnostic probes and round-2 snapshot remain untouched.

Proof hashing now consumes only ordered owned entries and a reference-correlated own projection manifest, plus bounded retained evidence. The owned user's parent link and owned IDs/parent links bind active lineage without serializing unrelated ancestor content. Before stringify/hash/clone, the own span is limited to 256 entries, 262144 UTF-8 JSON bytes summed across entries, 16384 visited values/property names, and depth 64 per entry. These bounds include the original query, own metadata and terminal, not just receipts. Evidence independently remains at most 64 messages / 65536 UTF-8 JSON bytes with the same node/depth caps. Encoded string size (including escaping and lone surrogates) is checked before allocating a JSON string token; cycles, accessors, non-data/unserializable input and overflows disable optional recovery without throwing out ordinary valid retained output. No receipt is truncated/evicted to fit.

Unchanged lifecycle observations check saved entry identity/ID/parent/type only. Growing/replaced prefixes receive full bounded content validation before snapshotting; **every actual recovery gate** freshly checks all bounded owned bytes against the original hashes. Mutable-object identity is never authoritative at admission or across auth/dispatch/acceptance awaits. Content mutation and real branch replacement still refuse without retargeting. Healthy settled retained-output extraction does not construct a recovery proof at all. Eligibility, operational waits and the 60-second finalization deadline are unchanged.

Round-3 desired regressions were red before runtime correction: 9/12 bounded-work tests failed and 4/8 proof-boundary tests failed (`round3-bounded-red.log`, `round3-boundaries-red.log`). Expanded final regressions also cover within-cap unchanged polling, oversized/cyclic/BigInt/accessor metadata on ordinary real SDK/driver success, JSON escape expansion before allocation, and same-identity user/terminal/receipt/deep-metadata mutation during auth, completion and forcing fallback. Focused gates pass **28 files / 538 tests** (`round3-focused-verified.log`), typecheck/lint exit 0 (`round3-typecheck-verified.log`, `round3-lint-verified.log`), and both existing bounded OpenAI live cells pass (`round3-live-verified.log`), including genuine observed retain-none receipt recovery. A scratch-only inversion of the original 537600000-byte historical witness now returns `2`, one original send, zero finalizer calls, and only 376 bytes of observed stringify output (`round3-large-history-scratch.log`); it is not part of the normal suite. No full offline rerun before independent focused re-review is claimed.

### Round-4 bounded representation correction (R3-C1)

Focused re-review cleared whole-history/polling bounds but found that `structuredClone` copied JSON-invisible array properties and undefined-valued object keys, including getters and oversized data that the encoder did not retain in its proof. Both snapshot copy sites now decode the already bounded JSON representation instead. Receipt validation runs on that same decoded data; ignored JavaScript extras are not copied, invoked or treated as evidence. JSON-visible content mutation and represented-accessor refusal remain protected.

Three desired regressions failed before the correction, with two controls already green (`round4-representation-red.log`). All five pass afterward, together with the round-2/3 guards: **144 tests / seven files**, typecheck and lint passed. Independent focused re-review found no correctness issues and confirmed R3-C1 closed. Logs are in `round4-*-verified.log` and `review-round4-correctness/focused.log`. This does not substitute for the final full gate.

### Fixture corrections and evidence

- Exactly the two bug-0482 terminal-stop “partial” fixtures were archived unchanged in `.pi/tmp/b0500/baseline/` and migrated to genuine unfinished tool-use shapes. Their wait-through and loud-expiry oracles remain.
- One independently demonstrated 0503 unanswered partial was similarly changed from terminal `stop` to `pending`, preserving its oracle and archived original.
- Only the 0501 typed prior-history-edit refusal cell changes policy: it has a complete retained own answer with no failed residue and now asserts one attributable finalization plus no operational repair. The old full-suite assertion red is retained; kept-user/split-turn fixtures with failed residue still refuse.
- Genuine retained-answer pre-fix red: 9 failures / 21 passes (`retained-red.log`). Genuine finalizer pre-fix red: both new assertions failed (`finalization-red.log`). No test was weakened to accept the old failure.
- New tests use real SDK projection and production composition, with negative controls for later unfinished/failure endings, omissions/edits, foreign/ambiguous ownership, missing/duplicate/error receipts, cancellation before/during auth and dispatch, bounded fallback/deadline cleanup, schema-invalid output, abstention, empty answer and repeated result requests.
- Round-1 review withheld acceptance despite full 801-file/13707-test and live greens: unavailable output used an impossible filtered SDK projection, typed abstention was unrepresentable, the persisted announcement poisoned its own gate, eligibility could retarget after an await, and depth-invalid payloads reached AJV/outer repair. That snapshot and all logs remain preserved. Round-2 inverted reviewer regressions and protocol reds are in `round2-evidence-note-red.log`, `round2-outer-red.log` and `round2-protocol-red.log`.
- Round-2 bounded OpenAI live evidence includes an ACTUAL SDK on-session read-only evidence-tool execution, production polling observing its receipt, a real terminal, controlled post-answer SDK retain-none compaction, and real untyped finalization with zero tools. Operands exist only in the receipt; neither original question nor summary supplies the answer. The typed prior-edit composition also passes with persisted notes and the private protocol. Disabling the real retention admission method produces the expected unavailable-output transport red (`round2-live-causal-red.log`); restoring it passes both live cells (`round2-live-restored-green.log`). The prior wrong-arithmetic red is retained but is not admission evidence. Existing real-host pre-prompt compatibility passes (`round2-live-b0502.log`). Focused/typecheck/lint counts are in the round-2 handoff. No full offline rerun is claimed for round 2: it is intentionally deferred until independent re-review.

### Final verification and provenance

On the final reviewed source snapshot, the full default suite passed **808 files / 13,851 tests** (`final-default.log`). Fresh bounded OpenAI finalization and real-host compaction compatibility passed **four tests in two files** (`final-live.log`). Final typecheck and lint passed (`final-typecheck.log`, `final-lint.log`). The independent contract review was clean; focused correctness re-reviews closed R2-C1 and R3-C1, with the last re-review finding no correctness issues.

All 28 changed files matched `final-gate-input-manifest.json` after these gates. Only this report's status and final verification record were then updated; runtime, tests and normative contracts remain byte-identical to the tested snapshot. The original report-at-gates is preserved as `bug-report-at-final-gates.md`. Earlier reds, rejected snapshots, causal live fault/restoration and reviewer probes remain retained; their aggregate greens are not substituted for final verification.

The user subsequently authorized committing/pushing this verified patch and updating canonical pi-config's theta pin. The baseline SHA above identifies the verification base, not the resolving fix commit. No new registry package version is claimed. Exact shipment and consumer-pin identities are recorded in the ignored investigation directory `shipment-0500-20261028/`. The completed batch's state and report remain historical evidence; this fix does not reopen that batch.

### Limitations / nonclaims

Structural completeness is enforceable; task-specific semantic adequacy, tool-report truth and model factual correctness are not. The finalizer is instructed to abstain rather than fabricate unsupported review verdicts, but this is not a hard factual-truth guarantee. The gate deliberately refuses ambiguous/edited/failed-residue evidence even where a human might reconstruct a valid answer.

The current SDK projection retains a chronological suffix, so dropping the terminal also drops earlier receipts. Round 2 addresses this with bounded evidence actually observed before compaction, NOT a synthetic middle-message filter. If polling never observed eligible complete receipts, they exceed the bound, or provenance changes, recovery refuses honestly. The SDK live witness uses controlled retain-none appended after actual model settlement, not a natural threshold/overflow reproduction; the separate typed prior-edit composition still scripts on-session settlement. Polling cannot observe every fast run; no raw-history content fallback fills that gap. Pre-query conversational history is not imported as factual evidence. Structural attribution plus an explicit abstention channel cannot prove semantic sufficiency or truth. Already committed side effects/provider calls are not rolled back. No F010 diagnostics, private-session/credential/header logging or budget renewal occurred.
