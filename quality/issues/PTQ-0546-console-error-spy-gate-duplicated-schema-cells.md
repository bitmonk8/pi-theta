---
id: PTQ-0546
title: Three in-scope live cells redeclare the identical bug-0030 console.error spy setup/teardown block
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/schema-field-discard-recovery-live-cell.test.ts:152-172
  - tests/live/typed-query-wire-shapes.test.ts:165-191
  - tests/live/withheld-binder-provenance-live-cell.test.ts:220-241
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Three in-scope live cells redeclare the identical bug-0030 console.error spy setup/teardown block

## Observation
Three of the twelve in-scope files each declare a module-scope
`consoleErrorSpy` variable plus a `beforeEach`/`afterEach` pair that spies on
`console.error`, filters the captured lines through the shared
`thetaOwnedStderrLines` (imported from `./theta-stderr-prefixes` in every
case), and asserts the filtered list is empty before restoring the spy. The
`beforeEach` and the spy declaration are byte-identical across all three; the
`afterEach` bodies are byte-identical in two of the three, and the third adds
one extra assertion (a `RELOAD_TEARDOWN_TIMEOUT_CODE` substring check) after
the shared block but keeps the shared block's shape and wording otherwise
unchanged.

## Evidence
`tests/live/schema-field-discard-recovery-live-cell.test.ts:152-172`:
```ts
let consoleErrorSpy: MockInstance | undefined;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  const spy = consoleErrorSpy;
  try {
    const lines = (spy?.mock.calls ?? []).map((args) => args.map(String).join(" "));
    const offenders = thetaOwnedStderrLines(lines);
    expect(
      offenders,
      "bug 0018's live verification observable for this suite is a 0-byte stderr capture; " +
        "this spy caught theta-owned stderr line(s) instead: " + JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});
```

`tests/live/withheld-binder-provenance-live-cell.test.ts:220-241` — the same
block, with only the message string re-wrapped onto two lines:
```ts
let consoleErrorSpy: MockInstance | undefined;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  const spy = consoleErrorSpy;
  try {
    const lines = (spy?.mock.calls ?? []).map((args) => args.map(String).join(" "));
    const offenders = thetaOwnedStderrLines(lines);
    expect(
      offenders,
      "bug 0018's live verification observable for this suite is a 0-byte " +
        "stderr capture; this spy caught theta-owned stderr line(s) instead: " +
        JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});
```

`tests/live/typed-query-wire-shapes.test.ts:165-191` — the same
declaration/`beforeEach`, and an `afterEach` that keeps the same
`thetaOwnedStderrLines(lines)` empty-array assertion shape (called twice
inline instead of through an `offenders` local) plus one additional check:
```ts
let consoleErrorSpy: MockInstance | undefined;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  const spy = consoleErrorSpy;
  try {
    const lines = (spy?.mock.calls ?? []).map((args) => args.map(String).join(" "));
    expect(
      thetaOwnedStderrLines(lines),
      "this suite's stderr observable is a 0-byte theta-owned capture; the spy " +
        "caught theta-owned line(s) instead: " +
        JSON.stringify(thetaOwnedStderrLines(lines)),
    ).toEqual([]);
    expect(
      lines.filter((line) => line.includes(RELOAD_TEARDOWN_TIMEOUT_CODE)),
      `${RELOAD_TEARDOWN_TIMEOUT_CODE} means the drive was still in flight when the ` +
        `session tore down — the bug-0028 repair-spin signature. Captured: ` +
        JSON.stringify(lines),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});
```

## Why this is a problem
All three sites independently wire up the same `vi.spyOn(console, "error")` /
`thetaOwnedStderrLines` / `mockRestore` sequence, each carrying its own copy
of the same explanatory string ("this suite's ... 0-byte ... stderr
capture"). A change to how the spy must be installed or restored (for
example, to also assert on a fourth stderr class, or to change the restore
order) has to be applied at each of these three independent sites in this
scope alone, with nothing enforcing that a future fourth copy stays in sync.

## Suggested direction (non-binding, optional)
A single exported `beforeEach`/`afterEach` pair (or a single helper function
these three call) next to `tests/live/theta-stderr-prefixes.ts`, which
already centralises the prefix set these three cells filter through, would
give the shared scaffolding one definition; that is an observation about a
natural home, not a design this filing owns.

## False-positive check
- Gate-pin carve-out: none of the three files match `*gate*.test.ts` or the
  named gate-file patterns; not applicable.
- Recording-double carve-out: the spy records calls only to filter and assert
  the filtered list is empty (a MUST-NOT-write witness), which is the
  sanctioned negative-witness shape; the finding is about the setup/teardown
  scaffolding being copy-pasted, not about the witness itself being invalid.
- docs/bugs/ signature search: grepped `docs/bugs/*.md` for `0018` and `0030`
  (the two bug numbers each afterEach cites) — both are `status: fixed`
  entries this suite verifies against, not a documented correct-reason red
  for any of the three files.
- coverage-matrix/bug-doc citation search: grepped
  `docs/reference/coverage-matrix.md` for each of the three filenames — no
  hits. Grepped `docs/bugs/*.md` for each filename — each file's own bug doc
  names it as that bug's live cell, but no citation pins the
  `consoleErrorSpy`/`beforeEach`/`afterEach` block or its line range
  specifically.
- Confirmed by direct reading that the `beforeEach` body and spy declaration
  are byte-identical across all three, and that two of the three `afterEach`
  bodies are byte-identical while the third differs only by one added
  assertion layered on the same shared shape.

## Triage
<!-- triage appends here -->
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines (schema-field-discard-recovery:152-172, typed-query-wire-shapes:165-191, withheld-binder-provenance:220-241); the `let consoleErrorSpy` + `beforeEach` are byte-identical in all three, the two plain `afterEach` bodies are identical after whitespace/literal-split normalisation (same runtime message), and the third layers one extra RELOAD_TEARDOWN_TIMEOUT_CODE assertion on the same shape; D7 boilerplate-duplication class in tests/ only; no carve-out applies (none are *gate* files; docs/bugs/0030 pins the spy gate at live-production-acceptance.test.ts:233-252, not in these files; no coverage-matrix hit for any of the three; bugs 0018/0030 both fixed). Note for acceptance: `consoleErrorSpy` greps to 28 tests/live files repo-wide, and same-wave intake siblings d7-03 (4 files) and d7-97-02 (5 files) file the identical root cause for other shards — none is yet a tracked PTQ so this is not a duplicate, but the three should be consolidated into one PTQ with fix_scope re-read as the whole tests/live set (triage: claude-fable-5-1)
