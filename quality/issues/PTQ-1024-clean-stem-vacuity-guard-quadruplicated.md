---
id: PTQ-1024
title: The CLEAN_STEM vacuity-guard fixture, its literal source and its precondition assertion are duplicated across four live registration cells
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:207
  - tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:280-289
  - tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:237
  - tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:313-322
  - tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts:270
  - tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts:340-349
  - tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts:234
  - tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts:265-274
sites: 4
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The CLEAN_STEM vacuity-guard fixture, its literal source and its precondition assertion are duplicated across four live registration cells

## Observation
Four live registration cells each declare a byte-identical `CLEAN_SOURCE` literal (`["---", "mode: prompt", "---", "@\`ping\`", ""].join("\n")`) for an unrelated, `tools:`-free "vacuity guard" theta, plant it under a per-file `CLEAN_STEM`, and immediately after booting the offender workspace run the same `expect(offender.command(CLEAN_STEM), ...).toBeDefined()` check with the same rationale sentence, differing only in the bug id and (in one file) the word "offender" vs "refusal".

## Evidence
tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:207
```
const CLEAN_SOURCE = ["---", "mode: prompt", "---", "@`ping`", ""].join("\n");
```
tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:280-289
```
      // Vacuity guard: an unrelated, `tools:`-free theta in the same boot.
      expect(
        offender.command(CLEAN_STEM),
        "bug-0270 live cell precondition unmet: the unrelated clean theta did not register in " +
          "the offender boot, so discovery or registration regressed independently of bug 0270 " +
          "and every absence claim below would hold vacuously. Registered: " + offenderRegistered,
      ).toBeDefined();

      requireNoteChannel(offender, "offender", "bug-0270");

```
tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:237
```
const CLEAN_SOURCE = ["---", "mode: prompt", "---", "@`ping`", ""].join("\n");
```
tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts:313-322
```
      // Vacuity guard: an unrelated, `tools:`-free theta in the same boot.
      expect(
        offender.command(CLEAN_STEM),
        "bug-0271 live cell precondition unmet: the unrelated clean theta did not register in " +
          "the offender boot, so discovery or registration regressed independently of bug 0271 " +
          "and every absence claim below would hold vacuously. Registered: " + offenderRegistered,
      ).toBeDefined();

      requireNoteChannel(offender, "offender", "bug-0271");

```
tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts:270
```
const CLEAN_SOURCE = ["---", "mode: prompt", "---", "@`ping`", ""].join("\n");
```
tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts:340-349
```
      // Vacuity guard: an unrelated, `tools:`-free theta in the same boot.
      expect(
        offender.command(CLEAN_STEM),
        "bug-0275 live cell precondition unmet: the unrelated clean theta did not register in " +
          "the offender boot, so discovery or registration regressed independently of bug 0275 " +
          "and every absence claim below would hold vacuously. Registered: " + offenderRegistered,
      ).toBeDefined();

      requireNoteChannel(offender, "offender", "bug-0275");

```
tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts:234
```
const CLEAN_SOURCE = ["---", "mode: prompt", "---", "@`ping`", ""].join("\n");
```
tests/live/b0280live-prompt-mode-below-immediate-callee-live-cell.test.ts:265-274
```
      // Vacuity guard: an unrelated, `tools:`-free theta in the same boot.
      expect(
        offender.command(CLEAN_STEM),
        "bug-0280 live cell precondition unmet: the unrelated clean theta did not register in " +
          "the refusal boot, so discovery or registration regressed independently of bug 0280 " +
          "and every absence claim below would hold vacuously. Registered: " + offenderRegistered,
      ).toBeDefined();

      requireNoteChannel(offender, "refusal", "bug-0280");

```

The four `CLEAN_SOURCE` literals are byte-for-byte identical (verified by direct grep of the four lines above; no whitespace or content differs). The four vacuity-guard `expect` calls are identical apart from the interpolated bug id and one file's substitution of "refusal" for "offender".

## Why this is a problem
The same fixture literal, the same stem-planting shape, and the same precondition-assertion sentence are typed out four times rather than drawn from one place. `tests/helpers/live-diagnostic-oracle.ts` already centralises the adjacent live-cell boilerplate for this exact file group — `noteChannelTheta`, `requireNoteChannel`, `liveRegistryMessagePattern`, `promptTheta` — which is precisely the kind of repeated live-cell scaffolding these four files' authors have previously factored out (each of the four still calls `requireNoteChannel` from that module). The vacuity-guard fixture and its assertion sit one step away from that same module and were not folded in when it was created, so the four copies drift only by manual bug-id substitution rather than by parameterisation.

## Suggested direction (non-binding, optional)
A `vacuityGuardTheta(stem)` fixture and a `requireVacuityGuardRegistered(handle, stem, bugId)` assertion beside the existing `noteChannelTheta` / `requireNoteChannel` pair in `tests/helpers/live-diagnostic-oracle.ts` would give these four (and future) live registration cells one place to draw both the fixture and its precondition check from.

## False-positive check
Gate-pin check: none of these four files matches `*gate*.test.ts` or the named gate-kin patterns; not applicable. Recording-double check: `CLEAN_STEM`'s command lookup reads the real `ExtensionRunner` via `bootShippedExtension`, not a recording double, so the negative-witness carve-out does not apply — this is plain setup duplication, not a MUST-NOT witness. docs/bugs/ signature search: searched for "0270", "0271", "0275", "0280" bug docs' text for any note pinning this vacuity-guard duplication as intentional; none found — each file's own header comment justifies the *concept* of a vacuity guard but not the four hand-typed copies. coverage-matrix/bug-doc citation search: `grep -rl "b0270livecaller\|b0271livegp\|b0275livegp\|b0280scratchroot"` against docs/reference/coverage-matrix.md returned nothing, so no citation pins these files' current internal structure. This finding does not propose renaming, merging or deleting any test — it names a repeated fixture/assertion shape, so no explicit citation notice is owed. No coverage claim is made; this is scoped to code that exists.

## Triage
verdict: confirmed — independently re-verified: all eight excerpts reproduce verbatim at the cited lines, and mktemp-extracted `offender.command(CLEAN_STEM)` guard blocks hash identical (226aaff1) across the files once the bug id and one "refusal"/"offender" word are normalised; all files already import from tests/helpers/live-diagnostic-oracle.ts, which exports no vacuity-guard fixture/assertion (`grep vacuityGuard|CLEAN_SOURCE tests/helpers/` → 0); not a duplicate (PTQ-0525/0561 lifted the registry-oracle+`requireNoteChannel` bundle, PTQ-0615 the `promptTheta`/`noteChannelTheta` fixture in b0274/0277/0278 — none tracked this guard); correction for the fixer: `sites: 4` undercounts — tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts carries a fifth byte-identical `CLEAN_SOURCE` (:189) and guard (:245-250, comment says "import-free" instead of "unrelated"), so the dedupe covers 5 files; b0268live's `CLEAN_SOURCE` (:151) is a driven, parameterised variant and is out of this group (triage: claude-fable-5-1)
