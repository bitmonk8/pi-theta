# Bug 0492 — three H8a live tests assert the pre-0476 panic-note shape and fail on the location suffix the bug-0476 fix added

- **Status:** open.
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
