---
id: pending
title: Bug 0363's fix record credits its live cell with exercising the modified `resolveEntry` explicit-file arm, but the named cell feeds only an absent `--theta` operand that resolves to the `case "missing"` arm
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0363-file-entry-stem-judged-on-entry-spelling.md:181-188
  - docs/bugs/0363-file-entry-stem-judged-on-entry-spelling.md:208-216
  - tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:1-5
  - tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:79-88
  - tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:125-133
  - src/discovery/discovery-source-enumerate.ts:208-218
  - src/discovery/discovery-source-enumerate.ts:234-236
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0363's fix record credits its live cell with exercising the modified `resolveEntry` explicit-file arm, but the named cell feeds only an absent `--theta` operand that resolves to the `case "missing"` arm

## Observation
Bug 0363's fix (Status: fixed 0.355.0) routed explicit `.theta` file references through a new `onDiskFileCandidate`, which it wired into `resolveEntry`'s `case "file"` arm and the settings collector's `addFile`. The record's Verification line says the adjacent live cell `tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts` ran green "exercising the modified `resolveEntry` explicit-file arm end-to-end". That cell plants one `project`-source theta (a directory root) and sets a single `--theta` operand to an absent path (`!<cwd>/nope-078/deep`). It then asserts `theta/load/missing-source`, which only `resolveEntry`'s `case "missing"` arm emits. So `case "file"` and `onDiskFileCandidate` never run in that cell. The live evidence does not reach the arm the record says it exercised. The offline witness `tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts` (4 cells) exists and is not in question.

## Evidence
Claim side, `docs/bugs/0363-file-entry-stem-judged-on-entry-spelling.md:181-188` (what shipped):
```
  - `src/discovery/discovery-walk.ts` — new `onDiskFileCandidate(fs, path)`
    derives an explicit `.theta` file reference's slash-name stem AND candidate
    path from the ON-DISK directory entry (`readdir` the parent; a byte-exact
    name wins, else the case-insensitive fold; a bare drive spec `X:` is
    `readdir`'d as `X:/`; reference-spelling fallback when the parent is
    unenumerable). Wired into both explicit-file arms named in §Fix:
    `resolveEntry` `case "file"` (CLI `--theta` / settings literal) and the
    settings-collector `addFile` (glob matches / `+` re-admissions). The
```
`docs/bugs/0363-file-entry-stem-judged-on-entry-spelling.md:211-216` (Verification):
```
  timeout, green isolated). Live — no live cell is prescribed by the doc; the
  adjacent CLI `--theta` discovery→registration cell
  `tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts`
  ran 1/1 green through the real production composition root under the shared
  live lock, exercising the modified `resolveEntry` explicit-file arm
  end-to-end (recorded WHY). Lint + typecheck — clean.
```

Evidence side: the live cell, `tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:79-88`:
```
        const baseWorkspace = plantThetaWorkspace([
          { source: "project", stem: "b078ctl", text: subagentTheta() },
        ]);

        // The clean provocation (see file header): an override-prefixed
        // operand naming an absent path, substituted for the workspace's
        // (empty) cli directory list so `bootShippedExtension` wires exactly
        // this one `--theta` component and nothing else.
        const absentOperand = `!${baseWorkspace.cwd.replace(/\\/g, "/")}/nope-078/deep`;
        const workspace: LiveWorkspace = { ...baseWorkspace, cliThetaDirs: [absentOperand] };
```
The same file at `:125-133` asserts the missing-source descriptor fragment:
```
          const cliDescriptor = `cli-flag:"--theta ${absentOperand}"`;
          const expectedMissing = descriptorFragment(MISSING_SOURCE_CODE, cliDescriptor);
          const bannedUnreadable = descriptorFragment(UNREADABLE_SOURCE_CODE, cliDescriptor);
          expect(
            notes.some((note) => note.includes(expectedMissing)),
            "no theta-system-note entry named the literal-path missing-source " +
              "warning for the override-prefixed operand (bug 0078's fix; " +
              "discovery-sources.md's CLI row Missing cell). Notes: " +
              JSON.stringify(notes),
```
The arm dispatch, `src/discovery/discovery-source-enumerate.ts:208-218`:
```
  const resolved = classifyForSource(await classifyPath(fs, path, enoentPolicy), path, descriptor !== undefined);
  switch (resolved.kind) {
    case "dir":
      roots.add(normalizePath(path));
      return enumerateDirectory(fs, path, source, descriptorValue, diagnostics);
    case "file":
      // A single `.theta` file entry contributes itself directly. Bug 0363: the
      // slash name and candidate path come from the ON-DISK directory entry,
      // not this reference's own spelling.
      roots.add(dirnameOf(normalizePath(path)));
      return [await onDiskFileCandidate(fs, path)];
```
`src/discovery/discovery-source-enumerate.ts:234-236`:
```
    case "missing":
      emitSourceFailure(modes.missing, source, descriptorValue, path, diagnostics, "missing");
      return [];
```
`emitSourceFailure(..., "missing")` is what mints `theta/load/missing-source`, and the cell asserts exactly that code. The cell's other theta is `project`-source, so it goes through `case "dir"` → `enumerateDirectory`.

Fix-time state: `git show 5e7f3390:tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts` (the bug-0363 fix commit) already has the same `absentOperand` line (`:142`) and the same `project`-source control (`:135`). The cell did not change shape after the record was written.

Searches run in this session:
- `grep -rn "onDiskFileCandidate(" src` → 3 hits: the definition (`discovery-source-enumerate.ts:162`), `case "file"` (`:218`), and settings `addFile` (`discovery-walk.ts:349`). No other call site could be reached from the directory or missing arms.
- `grep -rln "onDiskFileCandidate" tests` → 0 files.
- `grep -rn "0363" tests/live` → 0 hits (no live cell names this bug).

## Why this is a problem
The record uses live-level wording ("exercising the modified … arm end-to-end") for evidence that never enters that arm. The cell reaches `resolveEntry` but takes the `missing` branch, which bug 0363 did not change. A reader of the record would think the on-disk stem derivation was confirmed on a live host. It was confirmed only offline, by the b0363 witness. This matches the overstated-strength class: evidence weaker than its wording.

## Suggested direction (non-binding, optional)
Reword the live clause to what the cell shows: `resolveEntry` runs clean through the real composition root on the missing arm, and the on-disk-stem observable is witnessed offline by `tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts`. That is the same "adjacent cell, no outcome change" WHY that sibling records (0364, 0378) state. The alternative is to cite a live cell that actually registers an existing explicit `.theta` file reference.

## False-positive check
- Read the cited live cell in full (150 lines). It plants no `cli`-source file and no settings `thetaPaths` entry, and its only `--theta` operand is absent. It asserts `missing-source` present and `unreadable-source` absent.
- Read `resolveEntry` (`discovery-source-enumerate.ts:197-242`) to confirm that `missing-source` comes only from the `case "missing"` arm and that `onDiskFileCandidate` is called only from `case "file"` and settings `addFile` (grep above, 3 hits).
- History: `git log -- tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts` shows the cell was written for bug 0078 (63122660). At the 0363 fix commit 5e7f3390 it had the same absent-operand provocation, so the mismatch was present when the claim was written, not introduced by later decay.
- Checked the record for a different live cell covering the file arm: the Verification line names only this cell (`grep -n "tests/live" docs/bugs/0363-file-entry-stem-judged-on-entry-spelling.md` → 1 hit, line 213).
- Not a truth claim about the fix. The offline witness exists (4 `it` cells, checked with `grep -c -E "^\s*(it|test)\s*\(" tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts` → 4). Only the live wording is at issue.

## Triage
verdict: questionable — accounting verified: 0363's Verification line (:211-216) says the live cell exercised the modified `resolveEntry` explicit-file arm, but the cell (:79-88, :125-134) plants only a `project`-source dir theta and one absent `--theta` operand. It asserts `theta/load/missing-source`, which comes from `case "missing"` (discovery-source-enumerate.ts:234-236). `onDiskFileCandidate` is called only from `case "file"` (:218) and settings `addFile` (discovery-walk.ts:349), so this is 3 src hits with 0 in tests and 0 `0363` hits in tests/live. At fix commit 5e7f3390 the cell already had the same absent operand (:142) and `project` control (:135). So the live evidence never reaches the arm it is credited with. Rewording a record is a human ruling (triage: claude-opus-5-5)
