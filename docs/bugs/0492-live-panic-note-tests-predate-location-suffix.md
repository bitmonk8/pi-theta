# Bug 0492 — three H8a live tests assert the pre-0476 panic-note shape and fail on the location suffix the bug-0476 fix added

- **Status:** fixed (0.492.0) — test-only; the three witnesses assert the
  registry-Message first line and both bug-0476 suffix lines.
- **Sev/Diff estimate:** S3/D1 — S3: no runtime defect; three live
  witnesses have been red since 0.472.0 against a documented behaviour change,
  so they no longer witness bugs 0079(b), 0114 and 0116. D1: the assertions
  pin the note by deep equality on the first line only.
- **Where:** `tests/live/live-production-acceptance.test.ts`
  - :1610 H8a-T bug 0079 (b) — laundered Result interpolation panic;
  - :1780 H8a-T bug 0114 — nested Result in an interpolated `par for` value;
  - :10664 H8a-T (cell 63) bug 0116 — `?`-unwrapped operand behind `${…}`.

## Observed (2026-09-25, reproduced at 850b591b and on the 0.491.0 tree)

Each test deep-equals the system-note list against the one-line template
`theta /<name> aborted: Result value cannot be interpolated; unwrap with ? or match first`.
The note now carries the panic location block bug 0476 added:

```
theta /b79livepanic aborted: Result value cannot be interpolated; unwrap with ? or match first
  at <path>/b79livepanic.theta:8:1
  in interpolation ${r} (<path>/b79livepanic.theta:8:1)
```

The first line is still the registered `theta/parse/interpolated-result`
Message (DIAG-4), so the runtime behaviour matches the spec; the assertions
predate the location suffix.

## Expected

The three witnesses assert the registered Message as the note's first line
and the location block's shape (the file:line of the interpolation), so they
witness their bugs again and stay green.

## Fix direction

Match the note's first line against the registry Message and assert the
`at <file>:<line>:<col>` / `in interpolation` lines separately; prove each
assertion red against the pre-fix behaviour it witnesses.

## Fix (0.492.0)

- What shipped: `tests/live/live-production-acceptance.test.ts` only (no
  `src/`, spec or registry change; the suffix shape is already normative in
  `docs/reference/errors-and-results.md` §"Panic site suffix (bug 0476
  amendment)").
  - `interpolatedResultAbortedNote` is kept as the note's first line,
    `theta /<name> aborted: <Message>`, where `<Message>` is read from the
    `theta/parse/interpolated-result` registry row (`registryMessage`,
    DIAG-4), not re-typed.
  - New `queryLineOf(thetaText)` derives the expected line from the
    fixture's own `` @` `` query line. It fails loudly when no query sits at
    column 1.
  - New `expectInterpolatedResultAbortNote(notes, { slashName, thetaPath,
    thetaText, source }, context)` asserts exactly one note of exactly three
    lines. Line 1 is the framing above. Line 2 is
    `  at <posix path>:<queryLine>:1`. Line 3 is
    `  in interpolation ${<source>} (<same location>)`. The path is
    `toPosixFileSpelling(join(workspace.cwd, ".pi", "theta", "<stem>.theta"))`,
    the full path rather than the basename. Column 1 is the enclosing query's
    `@` column, per the spec's enclosing-query rule.
  - The three `toEqual([interpolatedResultAbortedNote(…)])` sites now call
    the helper: bug 0079 (b) (`it` at :1689, `${r}`), bug 0114 (:1865,
    `${rs}`) and cell 63 bug 0116 (:10755, `${r?}`). The `userTexts`
    assertions are unchanged.
- Gates:
  - Pre-fix live run (`.pi/tmp/fixes/0492-live-pre.log`):
    `Tests 3 failed | 87 skipped (90)`, each red on the location suffix.
  - Post-fix, same command: `Tests 3 passed | 87 skipped (90)`.
  - Whole file: `Tests 90 passed (90)`.
  - `npm test`: `Test Files 708 passed (708)`, `Tests 11879 passed (11879)`.
  - `npm run typecheck` and `npm run lint`: exit 0.
- Red proofs, both directions (AGENTS.md). Each is a temporary mutation,
  restored, with every `src/` file hash-proved byte-exact to HEAD. Each gave
  `Tests 3 failed`:
  - `in interpolation` line dropped in `renderPanicSuffixLines` → red at
    `lines[2]`;
  - expected query line +1 → red at `lines[1]`;
  - raise made a non-`ThetaPanic` → red at the 3-line guard;
  - `aborted: ` framing mutated in `surfaceDispatchDefect` → red at
    `lines[0]`;
  - `emitPanicNote` skipped → red at the one-note guard;
  - verifier's own runs: `at` column +1 → red at `lines[1]`; framing
    `aborted:` → `panicked:` → red at `lines[0]`.
- Review: 2 rounds.
  - Round 1 (deep): F1 fidelity (the first-line and one-note guards had no
    red proof), F2/F3 prose (column-1 reason, `§Fix` heading citation),
    residuals R1–R4.
  - Round 1 fix: two further red proofs; the helper takes `thetaText`;
    citations corrected (`code-registry-parse.md:87`, `§Fix direction`).
  - Round 2 (fast): clean.
- Verification: SOLID.
  - Witness red/green reproduced independently.
  - Default suite green.
  - Live fixed path and the whole live file green.
  - Typecheck and lint green.
- Residuals: none.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: a scan of `tests/live/**` found no other
  live assertion that deep-equals an `aborted:` panic note. The only
  `aborted:` note constructor is this file's helper. Every other hit is a
  prefix regex, a `startsWith`/`includes` on the internal-error framing, or a
  `returned Err:` row that already carries its suffix (b0294, slsh5,
  err-note-render). The `:1610`/`:1780`/`:10664` citations under §Where are
  the 850b591b/ee60a538 lines.
