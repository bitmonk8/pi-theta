---
id: PTQ-1786
title: Three finalization-evidence suites repeat the SDK owned-receipt retention rig.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0500-round2-evidence.test.ts:10-23
  - tests/b0500-round3-bounded-proof.test.ts:30-44
  - tests/b0500-round3-proof-boundaries.test.ts:18-31
sites: 3
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Three finalization-evidence suites repeat the SDK owned-receipt retention rig.

## Observation
Three files independently define a `rig` that creates an in-memory SDK session, an empty-baseline owned-turn attempt and a retention object, then appends an own user, a `read` tool call with ID `r`, and its successful text receipt. Each wires the session projection and branch through `attempt.read(..., true)` and exposes a retention gate over that owned view and branch. The first two also repeat the observation closure and terminal-plus-compaction finishing sequence; the third observes immediately and retains entry IDs and mutable metadata for boundary stimuli. These are near-identical setup sequences with different fixture data and handles, not identical test scenarios.

## Evidence
Instance 1, `tests/b0500-round2-evidence.test.ts:10-23`:
```ts
function rig(text = "263 plus 514") {
  const sm = SessionManager.inMemory();
  const attempt = new OwnedTurnAttempt([], [], QUERY);
  const retention = new FinalizationEvidenceRetention();
  const user = sm.appendMessage({ role: "user", content: QUERY, timestamp: 0 });
  const system = sm.appendMessage({ role: "system", content: "Apply the arithmetic task constraints.", toolsAdded: [], timestamp: 0 });
  const call = sm.appendMessage({ ...a("reading"), stopReason: "toolUse", content: [{ type: "toolCall", id: "r", name: "read", arguments: {} }] });
  const receipt = sm.appendMessage({ role: "toolResult", toolCallId: "r", toolName: "read", content: [{ type: "text", text }], isError: false, timestamp: 0 });
  const own = () => attempt.read(buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as readonly Message[], sm.getBranch(), true);
  const observe = () => retention.observe(own(), sm.getBranch());
  const gate = () => retention.read(own(), sm.getBranch());
  const finish = () => { const answer = sm.appendMessage(a("UNAVAILABLE_RAW_ANSWER")); sm.appendCompaction("SUMMARY_NOT_FACT", null, 100); return answer; };
  return { sm, user, system, call, receipt, observe, gate, finish };
}
```

Instance 2, `tests/b0500-round3-bounded-proof.test.ts:30-44`:
```ts
function rig(query = QUERY) {
  const sm = SessionManager.inMemory();
  const attempt = new OwnedTurnAttempt([], [], query);
  const retention = new FinalizationEvidenceRetention();
  sm.appendMessage({ role: "user", content: query, timestamp: 0 });
  sm.appendMessage({ ...assistant("reading"), stopReason: "toolUse", content: [{ type: "toolCall", id: "r", name: "read", arguments: {} }] });
  sm.appendMessage({ role: "toolResult", toolCallId: "r", toolName: "read", content: [{ type: "text", text: "263 plus 514" }], isError: false, timestamp: 0 });
  const own = () => attempt.read(projection(sm), sm.getBranch(), true);
  const observe = () => retention.observe(own(), sm.getBranch());
  const gate = () => retention.read(own(), sm.getBranch());
  const finish = (text = "UNAVAILABLE_RAW_ANSWER") => {
    sm.appendMessage(assistant(text));
    sm.appendCompaction("SUMMARY_NOT_EVIDENCE", null, 100);
  };
  return { sm, observe, gate, finish };
```

Instance 3, `tests/b0500-round3-proof-boundaries.test.ts:18-31`:
```ts
function rig() {
  const sm = SessionManager.inMemory();
  const attempt = new OwnedTurnAttempt([], [], QUERY);
  const retention = new FinalizationEvidenceRetention();
  sm.appendMessage({ role: "user", content: QUERY, timestamp: 0 });
  sm.appendMessage({ ...assistant(""), stopReason: "toolUse", content: [{ type: "toolCall", id: "r", name: "read", arguments: {} }] });
  const receipt = sm.appendMessage({ role: "toolResult", toolCallId: "r", toolName: "read", content: [{ type: "text", text: "score 777" }], isError: false, timestamp: 0 });
  const metadata = { nested: { constraint: "original" } };
  sm.appendCustomEntry("bookkeeping", metadata);
  const own = () => attempt.read(buildSessionContext(sm.getEntries(), sm.getLeafId()).messages as Message[], sm.getBranch(), true);
  retention.observe(own(), sm.getBranch());
  const terminal = sm.appendMessage(assistant("score 777"));
  const gate = () => retention.read(own(), sm.getBranch());
  return { sm, own, retention, gate, receipt, metadata, terminal };
```

Count: three setup declarations, all cited above. `rg -n '^function rig\(' tests/b0500-round2-evidence.test.ts tests/b0500-round3-bounded-proof.test.ts tests/b0500-round3-proof-boundaries.test.ts` returns exactly these three sites. The duplicated unit is the session/attempt/retention/receipt and read/observe/gate wiring, not the local assistant-message constructors.

## Why this is a problem
This is D7's boilerplate-duplication class. The same SDK-to-owned-attempt-to-retention harness mechanics are maintained in three test files: empty baselines, fixed call/receipt linkage, branch reads and retention admission are repeated rather than scenario-specific assertions. The differences—system constraints, receipt text, query size, metadata and exposed entry handles—are test stimuli around that common mechanism. The claim is the present repeated setup, not a prediction of a runtime fault or a proposal to combine the tests.

## Suggested direction (non-binding, optional)
`tests/helpers/` is the natural shared-helper home for this retention rig; `tests/helpers/b0500-finalization-composition.ts` already houses neighboring finalization support but is a production-composition driver, not an existing equivalent of this causal-unit rig. The distinct observation timing, metadata and entry handles remain scenario data.

## False-positive check
- Gate-pin: inspected the three rigs and their suites. They test evidence/proof behavior, not corpus inventories or sanctioned count re-derivations. No count pin is challenged.
- Recording-double: negative serialization-hook and provider/validator-call witnesses in these suites are legitimate and are not the subject of this finding. The repeated setup uses the real SDK session, attempt and retention objects.
- docs/bugs/ signature search: inspected `docs/bugs/0500-post-reply-threshold-compaction-misread-as-unanswered.md`, including round-2/3 corrections and the recorded regression reds. Those sections explain the distinct evidence and bounded-proof scenarios; this finding does not contest their assertions, intentional failure signatures, or separate existence.
- Coverage-matrix/bug-doc citation search: `rg -n -F -e 'b0500-round2-evidence.test.ts' -e 'b0500-round3-bounded-proof.test.ts' -e 'b0500-round3-proof-boundaries.test.ts' docs/reference/coverage-matrix.md docs/bugs` returned zero matches. No test merge, rename or deletion is proposed.
- Canonical-helper check: `rg -n 'OwnedTurnAttempt|FinalizationEvidenceRetention' tests/helpers` returned zero matches. Read the neighboring `tests/helpers/b0500-finalization-composition.ts`; it does not supply this rig. This is a repeated-setup observation, not a claim that an existing drop-in helper was ignored.
- Existing-topic check: the pre-filing `quality/` Markdown search for `OwnedTurnAttempt` and `FinalizationEvidenceRetention` returned the D4 production-boundary candidate, not a retention-rig finding. The already-filed assistant-message-fixture candidate concerns constructors and is explicitly outside this report's duplicated unit.
- Intent/history: `git log -1` for these files identifies `e071eada` (`fix: recover compaction-stranded query output without replay`). The report preserves the recorded real-SDK and separate-boundary testing intent.
- Coverage boundary: all three counted occurrences are existing test setup. No additional test, coverage target, suite-composition change or production-code change is requested.

## Triage
verdict: confirmed — All three excerpts and stated rig/helper/citation searches reproduce; the suites independently repeat real-SDK session, empty-baseline attempt, linked read receipt and retention-view/gate wiring, with the reported observation-timing, metadata and handle differences intact. This is D7 boilerplate duplication under tests/; bug 0500 and history do not prescribe separate harness implementations, no carve-out or resolved-shape precedent applies, and the assistant-constructor and production-boundary filings concern distinct mechanisms. (triage: claude-opus-5-5)
