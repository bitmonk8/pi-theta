---
id: PTQ-1666
title: Bug 0481's Witnesses bullet says the b0481 suite covers "degraded reply non-compliant → … malformed taxonomy (binder)", but the suite has no binder cell with a non-compliant degraded reply
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0481-typed-query-dies-on-model-level-forced-tool-choice-rejection.md:104-110
  - docs/bugs/0481-typed-query-dies-on-model-level-forced-tool-choice-rejection.md:93-95
  - tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:392-398
  - tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:427-512
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0481's Witnesses bullet says the b0481 suite covers "degraded reply non-compliant → … malformed taxonomy (binder)", but the suite has no binder cell with a non-compliant degraded reply

## Observation
Bug 0481 (Status: fixed 0.481.0) names one offline witness file for both forced-dispatch sites. It lists that file as covering "degraded reply non-compliant → ERR-17/repair (respond) / malformed taxonomy (binder)". The respond half exists (one cell scripts a plain-text degraded reply). The binder half does not: the binder `describe` has five cells, and each one scripts the degraded or retried call as either a successful tool call or another error or rejection. None scripts a degraded reply that fails to call the tool, and none asserts a malformed-envelope outcome. No other test file in the tree exercises the 0481 degraded path. So the §Fix sentence "The binder's existing malformed-envelope taxonomy covers a degraded reply that fails to call the tool" is claimed as witnessed, but the named evidence is not in the tree.

## Evidence
Claim side — `docs/bugs/0481-typed-query-dies-on-model-level-forced-tool-choice-rejection.md:104-110` (re-read before filing):
```
- `tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts` —
  offline doubles over both sites: forced 400 with the signature → one
  degraded re-dispatch (no `toolChoice` in the second call's options) →
  payload binds; degraded reply non-compliant → ERR-17/repair (respond) /
  malformed taxonomy (binder); non-matching 400 → terminal, no re-dispatch;
  rejection on the degraded dispatch → terminal (one shot);
  `isForcedToolChoiceRejection` unit cells.
```
The behaviour it is meant to witness, `:93-95`:
```
  binder retry budget). The binder's existing malformed-envelope taxonomy
  covers a degraded reply that fails to call the tool.
```

Evidence side — `tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts` (513 lines), every cell title (`grep -nE '^\s*(it|test|describe)\('`):
- respond `describe` :317 — cells :318, :342, :352, :363, :382, :392. Cell :392 is the respond half: `it("RED: a degraded plain-text reply lands in ERR-17 → respond-repair, …")`, with `plainTextReply("I would rather explain in prose."); // degraded → non-compliant` at :398.
- binder `describe` :427 ("binder forced dispatch degrades once, inside the SAME budgeted attempt"). Its five cells and what each degraded or retried call returns:
  - :428 — `toolCallReply(… { envelope: OK_ENVELOPE })` → `result.bound` true
  - :445 — `errorStopReply(GENERIC_TRANSPORT_MESSAGE)` (no degradation)
  - :461 — `errorStopReply(FORCED_REJECTION_MESSAGE)` on every call → 4 calls, `bound` false
  - :477 — `thrownRejection(…)` then `toolCallReply(… OK_ENVELOPE)` → bound
  - :495 — `thrownRejection(GENERIC_TRANSPORT_MESSAGE)` (no degradation)
- `grep -nE "plainTextReply|driveBinder\(" tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts` → `plainTextReply` is used once, at :398 (respond). `driveBinder(` is called at :434, :448, :464, :483, :501, and none of those cells scripts a plain-text or tool-less reply.
- `grep -n -i "malformed\|non-compliant\|noncompliant\|plain-text\|prose" tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts` → 3 hits (:42 header comment, :392 and :398 respond cell). No binder cell mentions malformed.

Searches, one per representation (all run this session):
1. Bug-doc witness lines: 0481 `## Witnesses` (:102) names the offline file above and `tests/live/b0481live-fable51-typed-query-degraded-live-cell.test.ts`. The live cell is a typed `@` query (respond path, `mode: prompt`, no `bind_model`) and is documented red at the current pin.
2. Test file names: `grep -rln "isForcedToolChoiceRejection\|0481" tests` → 3 files (the offline suite, `tests/harness/response-program.ts` (a comment at :186), and the live cell). `grep -rln "not supported for this model\|FORCED_REJECTION" tests` → 2 files (the offline suite and the live cell).
3. Test titles: `grep -rnE "^\s*(it|test|describe)\(.*degrad" tests` → 29 hits. The 0481 ones are the 11 offline cells listed above plus the live cell (:92/:93). The rest are unrelated (0375 excision, 0454 renderer gate, entry-channel degrade ladder, and so on). None is a binder degraded-non-compliant cell.
4. Coverage matrix: `grep -niE "0481" docs/reference/coverage-matrix.md | wc -l` → 0.
5. AGENTS.md gates: `grep -n "0481" AGENTS.md | wc -l` → 0.
6. CHANGELOG (corroboration only): not relied on.

## Why this is a problem
The Witnesses bullet is the record's proof that each described path is pinned. For the binder site it describes a path (degraded reply that does not call the tool → malformed-envelope classification, with the budget accounting of `determinism-cancellation-failure.md` §Per-invocation retry budget) that no cell exercises. Neutralising the degraded reply's route into the malformed taxonomy on the binder path would not make any 0481 cell fail. The 0481 claim for that path rests only on the prose assertion that "existing" taxonomy covers it.

## Suggested direction (non-binding, optional)
Either narrow the Witnesses bullet to what the file pins (the binder half covers bind-after-degrade, the one-shot rejection → attempt taxonomy, and the throw arm), or add the missing binder cell. Adding the cell is test work, not a D10 fix.

## False-positive check
- Representations covered: bug-doc witness lines, test file names, it()/describe() titles, coverage-matrix rows, and AGENTS.md gate names. Every binder cell was opened and its scripted replies read (:427-512).
- Checked that the pre-0481 binder malformed tests (`tests/binder-forced-tool-dispatch.test.ts`) do not reach the degraded path. They contain no `isForcedToolChoiceRejection` / rejection-signature reference (search 2 above lists every file carrying the signature).
- Not a D7 test-smell filing: the existing cells are not criticised. The finding is that the record claims a cell that does not exist.
- The respond half of the same clause is witnessed (:392). Only the binder half is filed.

## Triage
verdict: questionable — the claim is real and the witness is genuinely absent. 0481 :104-110 lists "malformed taxonomy (binder)" as covered by the offline b0481 suite (and §Fix :93-95 makes the matching claim), but the binder describe (:427, cells :428/:445/:461/:477/:495) scripts only OK_ENVELOPE tool calls, errorStopReply or thrownRejection. plainTextReply is used only at :398 (respond cell :392). The signature/0481 greps reproduce (3 and 2 files), as do the coverage-matrix and AGENTS.md counts (0 and 0). My own searches ("toolChoice" in → only b0481; degrad+binder files; 0481 in docs/bugs, coverage-matrix, AGENTS.md) find no other binder degraded-non-compliant witness. One stated count is wrong: the title search `grep -rnE "^\s*(it|test|describe)\(.*degrad" tests` returns 46 hits, not 29, on an unchanged tree. Its conclusion still holds across all 46. The repair is either to narrow or reword the Witnesses bullet or to add a test cell, and that is a human's call (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (unwitnessed-claim). Apply EXACTLY this one replacement in docs/bugs/0481-typed-query-dies-on-model-level-forced-tool-choice-rejection.md, nothing else — OLD is the byte-exact current text, NEW the byte-exact replacement:

OLD:
<<<
  payload binds; degraded reply non-compliant → ERR-17/repair (respond) /
  malformed taxonomy (binder); non-matching 400 → terminal, no re-dispatch;
>>>
NEW:
<<<
  payload binds; degraded reply non-compliant → ERR-17/repair (respond;
  the binder arm has no non-compliant-degraded-reply cell — that half rests
  on the binder malformed-envelope taxonomy in code, unwitnessed here);
  non-matching 400 → terminal, no re-dispatch;
>>>
