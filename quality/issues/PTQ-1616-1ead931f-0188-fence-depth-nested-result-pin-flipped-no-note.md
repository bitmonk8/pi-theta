---
id: PTQ-1616
title: Bug 0188's Fix (0.117.0) pins CONTROL (FENCE-DEPTH-NESTED-RESULT) as asserting `mapTooDeepReturnValue([Ok([[[[[1]]]]]), 1], …)` answers `undefined`, and commit 1ead931f (bug 0201) re-pinned that cell to assert the depth refusal with no note appended to 0188
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0188-negative-zero-loses-sign-across-subagent-envelope.md:1191-1197
  - docs/bugs/0188-negative-zero-loses-sign-across-subagent-envelope.md:1363-1375
  - tests/subagent-envelope-negative-zero-fidelity.test.ts:986-1005
  - tests/subagent-envelope-result-carriage.test.ts:1034-1043
  - docs/bugs/0201-result-carried-payloads-skip-envelope-walks.md:1103-1108
  - docs/bugs/0201-result-carried-payloads-skip-envelope-walks.md:1214-1218
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0188's Fix (0.117.0) pins CONTROL (FENCE-DEPTH-NESTED-RESULT) as asserting `mapTooDeepReturnValue([Ok([[[[[1]]]]]), 1], …)` answers `undefined`, and commit 1ead931f (bug 0201) re-pinned that cell to assert the depth refusal with no note appended to 0188

## Observation
Bug 0188's `## Fix (0.117.0)` names its own witness cell `CONTROL (FENCE-DEPTH-NESTED-RESULT)` as the pin for "`mapTooDeepReturnValue([Ok([[[[[1]]]]]), 1], …)` still answers `undefined`", green in both directions. It also says both bounded walks "still" skip a `Result`. Its Residual 1 says a non-finite leaf inside a nested `Result` "still" becomes `null` and routes that to a report "being filed separately". Commit `1ead931f` (fix(bug-0201), v0.118.0) re-pinned that same cell in place. It now asserts `.toBe(DEPTH_VIOLATION_MESSAGE)` for the same input, and the same commit closed Residual 1's vector. That commit appended discharge notes to 0187 and 0180 but not to 0188. No later commit touched the 0188 record. So the witness pin no longer resolves as stated: the named cell asserts the opposite of what the record says it pins.

## Evidence
Claim side, `docs/bugs/0188-negative-zero-loses-sign-across-subagent-envelope.md:1191-1197` (re-read before filing):
```
would red it. No conflict with 0187's `CONTROL (FENCE-NESTED-RESULT)`: that cell
pins the DEPTH walk's non-descent, not serialisation, and
`mapTooDeepReturnValue([Ok([[[[[1]]]]]), 1], …)` still answers `undefined`
(re-pinned here as `CONTROL (FENCE-DEPTH-NESTED-RESULT)`, green in both
directions). Both bounded walks are byte-untouched and PIC-59's *Result-carriage
bound* still describes them exactly — this fix changes how a `-0` leaf renders,
never which payloads are refused.
```
Claim side, `docs/bugs/0188-negative-zero-loses-sign-across-subagent-envelope.md:1363-1375`:
```
  1. **A non-finite `number` reachable only through a nested `Result` is still
     substituted, and the sign fix does not close it.** Review round 1 established
     that the encoder's fidelity claim cannot be stated for all number leaves:
     `[Ok(1 / 0), 1]` still writes
     `{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}` because
     `firstNonFiniteNumber` does not descend a `Result` (0187 measured and
     ...
     creates no bug docs); the subject belongs to the `Result`-carriage report
     being filed separately.
```
Evidence side, the named cell today, `tests/subagent-envelope-negative-zero-fidelity.test.ts:986-1005`:
```
  it("CONTROL (FENCE-DEPTH-NESTED-RESULT): mapTooDeepReturnValue over a nested Result now refuses (bug 0201 §Fix (a))", () => {
    // RE-PINNED under bug 0201 §Fix (a)
    ...
    expect(
      mapTooDeepReturnValue([makeOk([[[[[1]]]]]), 1], "./k.theta")?.message,
      "a payload whose depth is contributed only from inside a nested Result now refuses, at " +
        "the depth its wire document actually has (bug 0201 §Fix (a))",
    ).toBe(DEPTH_VIOLATION_MESSAGE);
```
Residual 1's vector is now witnessed as refused, `tests/subagent-envelope-result-carriage.test.ts:1034-1043`:
```
  it("RED (WRITER-ROW1): a callee whose terminal value is [Ok(1 / 0), 1] refuses at /0/value instead of writing a fabricated null", async () => {
    ...
    const drive = await driveChildRoot("let r = Ok(1 / 0)\n[r, 1]\n");
    expectWriterNamedRefusal(drive, "/0/value", Infinity, "[Ok(1 / 0), 1]");
```
The flipping commit acknowledges re-pinning 0188's witness, `docs/bugs/0201-result-carried-payloads-skip-envelope-walks.md:1103-1108`:
```
    `tests/subagent-envelope-negative-zero-fidelity.test.ts`'s
    `CONTROL (FENCE-DEPTH-NESTED-RESULT)` — bug 0188's witness, created after this
    report was filed and so absent from (d)(2)'s inventory of *locations*, though
    inside its enumeration by *disposition*; **ratified on the record** before the
    edit. Exactly one cell, one `expect`, in each file; `it(` counts unchanged
```
Its discharge list, `docs/bugs/0201-result-carried-payloads-skip-envelope-walks.md:1214-1218`, names only 0187's `## Fix (0.116.0)` §*Residuals* item 1 and 0180's §*Non-goals* bullet. 0188 is not listed.

Searches (run this session):
- `git log --format="%h %ad %s" --date=short -S"now refuses (bug 0201" -- tests/subagent-envelope-negative-zero-fidelity.test.ts` returned 1 commit: `1ead931f 2026-08-19 fix(bug-0201): both envelope walks descend a Result's wire form — v0.118.0`.
- `git show 1ead931f --stat` touched 17 files. They include the 0180 and 0187 records and `tests/subagent-envelope-negative-zero-fidelity.test.ts` (72 lines). The 0188 record is not among them.
- `git log --oneline 1ead931f..HEAD -- docs/bugs/0188-negative-zero-loses-sign-across-subagent-envelope.md` returned 0 commits.
- `grep -c "0201" docs/bugs/0188-negative-zero-loses-sign-across-subagent-envelope.md` returned 0.
- `grep -rn "FENCE-DEPTH-NESTED-RESULT" tests` returned 3 hits: negative-zero-fidelity `:980` and `:986`, and result-carriage `:167`. The only cell with that title is `:986`, and it asserts the refusal.

## Why this is a problem
The record's own witness pointer is the evidence it offers for "still answers `undefined`" and "PIC-59's *Result-carriage bound* still describes them exactly". Today that cell asserts the opposite value for the same input. A reader who follows the pin finds a contradiction, and the record gives no note saying which is current. Sibling records affected by the same commit (0187 at its `## Fix (0.116.0)` Residual 1 and Pinned dispositions, and 0180) carry dated discharge notes pointing at 0201. The house pattern is to append a note when a later fix flips a record's pin, and 0188 is the one record whose pin 1ead931f flipped without one.

## Suggested direction (non-binding, optional)
Append a dated discharge note to 0188's `## Fix (0.117.0)`, the way 0187's Residual 1 carries one. It should say that `CONTROL (FENCE-DEPTH-NESTED-RESULT)` was re-pinned under bug 0201 (0.118.0, `1ead931f`) and now asserts the depth refusal. It should also say that Residual 1 is discharged, with `RED (WRITER-ROW1)` in `tests/subagent-envelope-result-carriage.test.ts` as the equivalent witness.

## False-positive check
- The pinned cell's title still exists, so this is not a renamed or deleted test. The finding is that its assertion now contradicts the record's stated pin value. `grep -rn "FENCE-DEPTH-NESTED-RESULT" tests` gives 3 hits, and only `:986` is a cell.
- I checked whether a note exists anywhere in the record. `grep -c "0201"` on the 0188 record gives 0, and no commit after 1ead931f touched the record.
- I checked whether 0201's record discharges 0188 elsewhere. Its only "Discharge notes appended" bullet (`:1214`) names 0187 and 0180. `:1103-1108` records the re-pin of 0188's cell but appends nothing to 0188.
- None of the pending candidates in the brief covers 1ead931f or 0188's FENCE-DEPTH-NESTED-RESULT. The same-sha check covered the qw20260928081617-d10 filings listed. The other shard records are unaffected: 0187 already carries the 0201 discharge note (`0187:1300-1307`), and 0186, 0189 and 0190 do not cite it.
- This is not a citation-form issue (no gate involved) and not a truth adjudication. The flip is 0201's authorised behaviour change, and only the 0188 record's pointer has decayed.
- No tests were executed. The default-suite file `tests/subagent-envelope-negative-zero-fidelity.test.ts` sits outside `tests/live/**`, so the green preflight gate at this wave's head makes its current assertion the proven one.

## Triage
verdict: questionable — decay verified: 0188:1191-1197 says `mapTooDeepReturnValue([Ok([[[[[1]]]]]), 1], …)` "still answers `undefined`" and cites `CONTROL (FENCE-DEPTH-NESTED-RESULT)` as the pin, but that cell (negative-zero-fidelity.test.ts:986-1005) now asserts `.toBe(DEPTH_VIOLATION_MESSAGE)`. 1ead931f re-pinned it, as its commit message and 0201:1103-1108 both say. 0201's discharge list (:1214-1218) names only 0187 and 0180, `grep -c 0201` on 0188 gives 0, and no commit after 1ead931f touches 0188. Residual 1 (:1363-1375) is closed by `RED (WRITER-ROW1)` in subagent-envelope-result-carriage.test.ts:1034. No same-sha filing exists in quality/intake/ or quality/issues/. This is not a mechanical re-point, though: no cell anywhere still asserts `undefined`, so the record's "still" claims are superseded and need a dated discharge note. The record's wording is a human's to change (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (decayed-pointer). APPEND EXACTLY the following block at the very end of docs/bugs/0188-negative-zero-loses-sign-across-subagent-envelope.md, nothing else; every existing line stays byte-identical:

### Coordination note — 2026-09-28, bug 0201 (0.118.0)

Commit 1ead931f (bug 0201 fix, v0.118.0) re-pinned the witness cell CONTROL (FENCE-DEPTH-NESTED-RESULT) in tests/subagent-envelope-negative-zero-fidelity.test.ts: it now asserts the depth-violation message, superseding the "still answers `undefined`" fence in the Fix (0.117.0) section above. Residual 1 above is closed, witnessed by cell RED (WRITER-ROW1) in tests/subagent-envelope-result-carriage.test.ts. The wording above stands as a dated record; current disposition: docs/bugs/0201-result-carried-payloads-skip-envelope-walks.md.
