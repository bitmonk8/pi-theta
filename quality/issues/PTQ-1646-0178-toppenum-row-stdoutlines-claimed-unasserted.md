---
id: PTQ-1646
title: Fix record 0178 says its integration witness asserts `stdoutLines === 2` on every row including the `toppenum` grandchild row, but the witness asserts no line count on that row and says so in a comment
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0178-subagent-callee-nonbypass-params-unregistered-in-child.md:937-942
  - tests/subagent-root-binder-model-exempt.test.ts:47-52
  - tests/subagent-root-binder-model-exempt.test.ts:493-500
  - tests/subagent-root-binder-model-exempt.test.ts:503-515
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Fix record 0178 says its integration witness asserts `stdoutLines === 2` on every row including the `toppenum` grandchild row, but the witness asserts no line count on that row and says so in a comment

## Observation
The `## Fix (0.101.0)` record of bug 0178 describes its integration witness, `tests/subagent-root-binder-model-exempt.test.ts`. It lists the direct rows (`pstr`, `penum`/`psch`/`parr`, the three `bind_model:` fence rows) and the §Reproduction (a) `toppenum` grandchild row, and says each one asserts "the envelope AND `stdoutLines === 2`". In the witness, the `stdoutLines` assertion sits only in the `DIRECT_ROWS` loop. The `toppenum` block (section (B)) asserts `killedByWatchdog`, `ok` and `payload`. Its own comment says "No `stdoutLines` assertion here". The file's header calls the line count "the only observable" that tells a registered pure-tail run apart from a run where the argv was taken as prompt text and a model turn happened. So for the grandchild row, the no-model-turn property the record describes as asserted is not asserted. The file was like this at the fix commit acea6749 too, so this is not later decay.

## Evidence
Claim side, `docs/bugs/0178-subagent-callee-nonbypass-params-unregistered-in-child.md:937-942` (re-read before filing):
```
  - **Two new witnesses.** `tests/subagent-root-binder-model-exempt.test.ts`
    (integration, real spawned children, offline and provider-free after the
    fix): the §Reproduction (b) rows re-driven — `pstr` control, `penum` /
    `psch` / `parr` subjects, the three `bind_model:` over-reach-fence rows, and
    the §Reproduction (a) `toppenum` grandchild row — each asserting the
    envelope AND `stdoutLines === 2`. Hermeticity per §Fix (c)(5): the witness
```

Evidence side, `tests/subagent-root-binder-model-exempt.test.ts:47-52` (the header explains why the line count matters):
```
// WHY `stdoutLines === 2` IS ASSERTED BESIDE THE ENVELOPE. Two lines is the
// session line plus the envelope — a child that registered its slug and ran a
// pure tail expression, with NO model turn. A green envelope beside a ~30-line
// stdout would mean the argv was still processed as prompt text and the turn the
// defect causes still happened (bug 0178 §Reproduction (b)); the line count is the
// only observable that separates the two.
```
`:493-500`: the only `stdoutLines` assertion, inside `for (const [index, row] of DIRECT_ROWS.entries())`:
```
          expect
            .soft(
              outcome.stdoutLines,
              `${row.stem}: 2 stdout lines is the session line plus the envelope — a registered ` +
                `slug running a pure tail expression, with NO model turn. A larger count means ` +
                `\`-p "/${row.stem}"\` was processed as prompt text — ${report(outcome)}`,
            )
            .toBe(2);
```
`:503-515`: the `toppenum` (`TOP_STEM`) block:
```
        // (B) The reported production surface — §Reproduction (a). The root
        // registers (no `params:`), resolves its `tools:` callee by PATH, and
        // spawns it as a GRANDCHILD; the refusal happens one process further
        // down, which is why the harness's own diagnostic drain stays empty.
        ...
        // No `stdoutLines` assertion here: the root's stream also carries
        // whatever its own tool-call machinery renders, so the model-turn
        // observable belongs to the direct rows above.
```
The expects that follow check only `topOutcome.killedByWatchdog`, `topOutcome.ok` and `topOutcome.payload`.

Searches (run this session):
- `grep -n "topOutcome.stdoutLines\|TOP_STEM.*stdoutLines" tests/subagent-root-binder-model-exempt.test.ts | wc -l` → 0
- `grep -rln "toppenum" tests` → 1 file (this witness)
- `grep -rln "stdoutLines" tests --include=*.test.ts` → 1 file (this witness), so no other test asserts a line count for any row
- `git show acea6749:tests/subagent-root-binder-model-exempt.test.ts | grep -n "No .stdoutLines"` → `584:        // No \`stdoutLines\` assertion here: …`. The fix commit shipped the omission, so the record's sentence was wrong from the day it was written.

## Why this is a problem
The record credits the witness with an assertion it does not make. On this row, that assertion is the observable the witness header calls the only discriminator between "registered and ran with no turn" and "argv taken as prompt text". A reader of the record would conclude the grandchild path is gated against the stray model turn. The committed evidence gates only its envelope value (`ok`, `payload`). The rest of the record makes a narrower claim for `toppenum` (Residual 1: "is GREEN"), and that claim is supported. The "each asserting … `stdoutLines === 2`" wording is stronger than the evidence.

## Suggested direction (non-binding, optional)
Narrow the witness sentence so that the `stdoutLines === 2` clause covers the seven direct rows, and state that the `toppenum` row asserts envelope `ok`/`payload` only. This matches the witness's own comment.

## False-positive check
- Representations searched, one search each:
  - Bug-doc witness lines: the claim above, plus Residual 1 at `:1031-1040`, which claims only GREEN for `toppenum`.
  - Test files and titles:
    - `grep -rln "0178" tests --include=*.test.ts` → 10 files. Only `subagent-root-binder-model-exempt` drives `toppenum`.
    - `grep -rn -E "(it|describe)\(.*grandchild" tests --include=*.test.ts | wc -l` → 28 title hits. None is in a file that asserts `stdoutLines` (only one file does).
  - Coverage-matrix rows: `grep -rn "0178" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md | wc -l` → 0.
  - AGENTS.md gate names: no gate covers per-row stdout line counts.
  - CHANGELOG, corroboration only: `grep -n "0178" CHANGELOG.md` → `:5297`. `grep -n -i "stdoutLines\|toppenum" CHANGELOG.md` → 0.
- The witness exists and is default-suite; it is not under `tests/live/**`. This is not a decayed pointer: the file and row resolve.
- Not a truth claim: I do not say the grandchild path takes a model turn. I say only that the record's wording credits an assertion the witness declines to make.
- Not a D7 test smell: the witness is honest about the omission in its own comment. The overclaim is in the record.

## Triage
verdict: questionable — accounting verified: the 0178 record at :937-942 says every re-driven row, including the `toppenum` grandchild row, asserts "the envelope AND `stdoutLines === 2`". In tests/subagent-root-binder-model-exempt.test.ts (default suite), the only `stdoutLines` expect is inside the DIRECT_ROWS loop (:493-500). The TOP_STEM block (:503-545) checks only killedByWatchdog/ok/payload and says "No `stdoutLines` assertion here". The acea6749 version has the same comment (:584). The stated searches reproduce (0 topOutcome.stdoutLines hits; toppenum and stdoutLines each appear in 1 test file only). Residual 1 claims only GREEN, which is accurate. Fixing this means rewording the record, which is a human's call (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). APPEND EXACTLY the following block at the very end of docs/bugs/0178-subagent-callee-nonbypass-params-unregistered-in-child.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The integration-witness sentence above says every re-driven row, including the toppenum grandchild row, asserts the envelope AND stdoutLines === 2. In tests/subagent-root-binder-model-exempt.test.ts the stdoutLines expectation exists only inside the DIRECT_ROWS loop; the TOP_STEM block that drives the toppenum grandchild row checks killedByWatchdog/ok/payload only, and its own comment says no stdoutLines assertion is made there. The envelope half of the claim stands; the line-count half applies to the direct rows only.
