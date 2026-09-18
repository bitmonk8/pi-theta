---
id: PTQ-1048
title: The three-level tools-chain drive harness (summand constants, prompt-caller source, child source, driven-turn assertions) is duplicated across three live registration cells
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:169-192
  - tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:194-206
  - tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:482-492
  - tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts:190-213
  - tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts:505-515
  - tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts:167-190
  - tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts:418-428
sites: 3
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The three-level tools-chain drive harness (summand constants, prompt-caller source, child source, driven-turn assertions) is duplicated across three live registration cells

## Observation
Three live registration cells (b0271, b0275, b0280) each build a three-level `tools:` chain (a prompt-mode top file whose `tools:` names a subagent-mode child, whose own `tools:` names a third file) and each declares the same summand constants, the same top-file `.theta` source array, a near-identical child `.theta` source array, and the same closing driven-turn assertion trio, differing only in identifier names (`GRANDPARENT_STEM`/`ROOT_STEM`) and per-bug prose in the failure messages.

## Evidence
tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:169-192
```
const LEFT_SUMMAND = 263;
const RIGHT_SUMMAND = 514;
const COMPUTED_SUM = String(LEFT_SUMMAND + RIGHT_SUMMAND);

/** The task-framed arithmetic question, over the number the theta computed. */
const DRIVE_QUESTION_PREFIX = `The prior step produced the number ${COMPUTED_SUM}.`;

/**
 * The grandparent, identical in both workspaces: `mode: prompt`, one `tools:`
 * `.theta` entry naming the subagent-mode child, and one `@`…`` query over a
 * computed value so the healthy half has a real turn to drive.
 */
const GRANDPARENT_SOURCE = [
  "---",
  "mode: prompt",
  "tools:",
  `  - ./${CHILD_STEM}.theta as child`,
  "---",
  `let n = ${LEFT_SUMMAND} + ${RIGHT_SUMMAND}`,
  "let r = @`The prior step produced the number ${n}. " +
    "What is that number plus 100? Answer with the number only.`?",
  "r",
  "",
].join("\n");
```
tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:194-206
```
const CHILD_SOURCE = [
  "---",
  "mode: subagent",
  "description: b0271live fixture child",
  "tools:",
  `  - ./${GRANDCHILD_STEM}.theta as gc`,
  "---",
  "let a = 1",
  "",
].join("\n");
```
tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:482-492
```
      const driven = await driveSlashCaptureTurn(control, `/${GRANDPARENT_STEM}`);
      expect(
        driven.userTexts.join("\n"),
        "the grandparent's QRY-18 rendered template must carry the sum the theta computed; its " +
          "absence means either the query never reached the provider or the computed value " +
          "never reached the prompt. Observed: " + JSON.stringify(driven.userTexts),
      ).toContain(DRIVE_QUESTION_PREFIX);
      expect(
        driven.systemNotes,
        "every fail-closed ending of a top-level drive lands on the theta-system-note channel " +
          "(the SLSH-3 err note, the cancelled note, the panic framings); the healthy " +
          "grandparent must end with none. Observed: " + JSON.stringify(driven.systemNotes),
      ).toEqual([]);
```

tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts:190-213 declares byte-identical `LEFT_SUMMAND`/`RIGHT_SUMMAND`/`COMPUTED_SUM`/`DRIVE_QUESTION_PREFIX`/`GRANDPARENT_SOURCE` (verified via `diff` of the two files' grep hits for these four identifiers — the only differences across all matched lines are the line numbers themselves). Its `CHILD_SOURCE` at that file (same shape as b0271's, description text reading "b0275live fixture child") and its closing driven-turn assertion pair at :505-515 reproduce b0271's :482-492 verbatim apart from the `control`/`GRANDPARENT_STEM` variable substitution, which is identical in both files.

tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts:167-190 declares the same `LEFT_SUMMAND`/`RIGHT_SUMMAND`/`COMPUTED_SUM`/`DRIVE_QUESTION_PREFIX` constants and a `ROOT_SOURCE` array whose array contents (the `"---"`/`"mode: prompt"`/`"tools:"`/entry line/`"---"`/`let n = ...`/query line/`"r"`/`""` sequence) are byte-identical to b0271's and b0275's `GRANDPARENT_SOURCE`, under a renamed constant. Its `CHILD_SOURCE` differs only in the description string ("b0280scratch fixture child") and the tools-entry alias (`as grand` instead of `as gc`). Its closing assertion pair at :418-428 reproduces the same `QRY-18 rendered template`/`driven.systemNotes` pattern as the other two files, substituting "root" for "grandparent".

## Why this is a problem
Three files build the identical three-level `tools:` chain fixture — the same summand pair (263, 514), the same computed-sum prefix sentence, the same top-file source shape, near-identical child source, and the same closing pair of driven-turn assertions — by hand-typing each block rather than drawing it from one place. The files' own header comments describe each as mirroring the shape of the one before it ("It mirrors in shape bug 0274's...", "Standalone live registration cell (the standalone-live-file precedent of..."), which is a description of how the copies came to exist, not evidence that the duplicated block itself was deliberately kept un-shared. `tests/helpers/live-diagnostic-oracle.ts` already holds the sibling `promptTheta`/`noteChannelTheta`/`liveRegistryMessagePattern` helpers extracted from this same file family, showing that shared harness pieces for this group are normally lifted out once a second file needs them; the three-level chain block was not.

## Suggested direction (non-binding, optional)
A parameterised three-level-chain builder (fixed summands, a parameterised top-file stem/child-stem pair, and the closing `QRY-18`/`systemNotes` assertion pair) alongside the existing `promptTheta`/`noteChannelTheta` helpers in `tests/helpers/live-diagnostic-oracle.ts` would give bug 0271, 0275 and 0280 (and any future three-level chain cell) one shared source for this block.

## False-positive check
Gate-pin check: none of the three files matches `*gate*.test.ts` or the named gate-kin patterns. Recording-double check: `driven.userTexts`/`driven.systemNotes` are read off the real `SessionManager` after a real driven turn (`driveSlashCaptureTurn`), not a recording double asserting a MUST-NOT witness — this is setup/assertion duplication, not a negative witness. docs/bugs/ signature search: read docs/bugs/0271 and 0275 and 0280 bug-doc references inline in each file's own header comment; none pins the three-level-chain literal block itself as an intentional non-shared copy, only the standalone-file convention (which is a suite-composition posture, not this finding's subject). coverage-matrix/bug-doc citation search: grepped for `b0271livegp`, `b0275livegp`, `b0280scratchroot` against docs/reference/coverage-matrix.md; no hits, so no citation pins the current internal structure of these three files. This finding proposes no merge, rename or deletion of any test and makes no coverage claim.

## Triage
verdict: confirmed — independently re-verified: all seven excerpts reproduce at the cited lines; mktemp sed-range `diff` shows b0271:169-192 ≡ b0275:190-213 byte-identical and b0280:167-190 differing only in the constant name (`ROOT_SOURCE`) and one comment word, the closing assertion pair b0271:482-492 ≡ b0275:505-515 identical with b0280:418-428 differing only by "grandparent"→"root" in failure prose, and `CHILD_SOURCE` differing only in description/alias; `LEFT_SUMMAND`/`DRIVE_QUESTION_PREFIX`/the top-source array exist in no other file and neither tests/live/harness.ts nor tests/helpers/live-diagnostic-oracle.ts exports a builder of this shape (all three files are live callers — a D7 copy-paste-fixture class); no gate file, no merge/rename/delete proposed, coverage-matrix grep for the three stems → 0, bug docs 0271/0275/0280 cite the files by name only; not a duplicate — the only rows touching these files are resolved PTQ-0478 (bootNotes reader, :341-368/:364-391/:291-318) and PTQ-0561 (registry-oracle row inventory, :319-429/:342-452/:269-379), both disjoint blocks, and PTQ-0561 is the precedent that already lifted `liveRegistryMessagePattern`/`renderedRows`/`requireNoteChannel` out of exactly these three cells (the candidate's `promptTheta`/`noteChannelTheta` citation is loose — these files import neither — but the extracted-helper precedent stands on PTQ-0561) (triage: claude-fable-5-1)
