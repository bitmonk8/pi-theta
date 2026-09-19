---
id: PTQ-1026
title: Three in-scope live cells redeclare the identical bug-0018/0030 console.error spy setup/teardown block
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts:206-227
  - tests/live/b0146live-invoke-array-arg-live-cell.test.ts:201-222
  - tests/live/b0191live-enum-shadow-registration-live-cell.test.ts:159-180
sites: 3
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Three in-scope live cells redeclare the identical bug-0018/0030 console.error spy setup/teardown block

## Observation
Three of the ten files in this review's scope each declare a module-scope
`consoleErrorSpy` variable of type `MockInstance | undefined`, plus a
`beforeEach` that spies on `console.error` and an `afterEach` that filters
the captured lines through the shared `thetaOwnedStderrLines` (imported from
`./theta-stderr-prefixes` in every case), asserts the filtered list is empty,
and restores the spy in a `finally`. The `beforeEach` body and the spy
declaration are byte-identical across all three; the `afterEach` bodies
differ only in where one string literal is wrapped onto the next line
(`b0146live` keeps "0-byte stderr" on one line; the other two split after
"0-byte").

## Evidence

`tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts:206-227`:
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

`tests/live/b0146live-invoke-array-arg-live-cell.test.ts:201-222` — the same
block, with only the message string's line-wrap point differing (re-read
from the file immediately before filing):
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
      "bug 0018's live verification observable for this suite is a 0-byte stderr " +
        "capture; this spy caught theta-owned stderr line(s) instead: " +
        JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});
```

`tests/live/b0191live-enum-shadow-registration-live-cell.test.ts:159-180` —
byte-identical to the first excerpt, re-read from the file immediately
before filing (same wrap point as `b0138live`).

Exact search: `grep -n "let consoleErrorSpy: MockInstance" tests/live/b0106live-cofire-refusal-live-cell.test.ts tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts tests/live/b0146live-invoke-array-arg-live-cell.test.ts tests/live/b0191live-enum-shadow-registration-live-cell.test.ts` returns exactly 3 hits — `b0106live` (in this review's scope) never spies on `console.error` at all, since it drives no live turn. `grep -n "export function\|export const" tests/live/theta-stderr-prefixes.ts` shows that module exports only the prefix constants and the `thetaOwnedStderrLines` filter, not the spy/gate scaffolding itself.

## Why this is a problem
The spy declaration, the `beforeEach` that installs it, and the `afterEach` that filters/asserts/restores it are declared from scratch in each of the three files rather than being a single shared setup/teardown pair both files already import a sibling piece of (`thetaOwnedStderrLines`) from. Each copy risks drifting independently — for example, one file could add the `RELOAD_TEARDOWN_TIMEOUT_CODE` follow-on check a sibling live cell layers on the same shared shape (per `docs/bugs`-adjacent precedent already observed in this suite) without any signal that the other two copies should too, since none of the three references another.

## Suggested direction (non-binding, optional)
A shared `installThetaOwnedStderrGate()` (or similarly named) `beforeEach`/`afterEach` pair, exported from `tests/live/theta-stderr-prefixes.ts` alongside `thetaOwnedStderrLines` (the module all three files already import from), is the shape all three copies point at.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the named gate-kin patterns (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); not applicable.
- Recording-double check: the spy records calls only so the filtered list can be asserted empty (a MUST-NOT-write witness), which is the sanctioned negative-witness shape; this finding is about the setup/teardown scaffolding being copy-pasted, not about the witness itself being invalid.
- docs/bugs/ signature search: `grep -n "status:" docs/bugs/0018-hot-reload-stale-ctx-after-session-replacement.md docs/bugs/0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md` — both bugs are the ones each `afterEach` cites by number; neither doc's status is a documented-correct-reason-red for any of the three files, and neither names this setup/teardown block specifically.
- coverage-matrix/bug-doc citation search: `grep -n "b0138live\|b0146live\|b0191live" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any test or `it()`/`describe()` — only that the duplicated setup/teardown pair could live once in the module all three already import from.
- Coverage drift: this finding does not claim any behaviour is untested; it is confined to the duplicated setup/teardown sequence inside tests that already exist and already run. A related but distinct root cause (the same block duplicated across a different, disjoint file set) was already filed and fixed as PTQ-0546; this finding's three files are none of that filing's three locations, confirmed by direct comparison of both location lists.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines (mktemp sed-range diff: b0138live:206-227 and b0191live:159-180 byte-identical; b0146live:201-222 differs only at the string-literal wrap on lines 14-15, same runtime message), b0106live has 0 `consoleErrorSpy`/`spyOn(console` hits, `tests/live/theta-stderr-prefixes.ts` exports only the prefix constants + `thetaOwnedStderrLines`, 0 hits for the three stems in docs/reference/coverage-matrix.md, and docs/bugs/0030 pins the spy gate at live-production-acceptance.test.ts:233-252, not in these files; D7 boilerplate duplication in tests/ with no carve-out (no *gate* files, negative-witness spy is not the complaint, no it()/describe() change proposed). Not a duplicate: PTQ-0546 is resolved with a disjoint location trio and no open PTQ tracks the residual. CORRECTION for the fixer: the candidate's suggested home overlooks that the PTQ-0546 fix (commit e3546327) already created the canonical helper `tests/helpers/theta-stderr-gate.ts#assertThetaStderrCleanForEach` (built on `captureConsoleErrorForEach` + `thetaOwnedStderrLines`), imported by exactly the 3 PTQ-0546 files — so the fix is a migration to that existing export, not a new extraction; `let consoleErrorSpy: MockInstance` still greps to 25 tests/live files repo-wide, and same-wave intake siblings d7-03 (3 files) and d7-17 (2 files) file the identical unmigrated root cause — fold them into this row's location list at acceptance and re-read fix_scope as the whole unmigrated tests/live set (triage: claude-fable-5-1)
