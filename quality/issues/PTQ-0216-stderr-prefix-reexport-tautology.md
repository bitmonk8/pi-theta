---
id: PTQ-0216
title: acceptance-stderr-gate.test.ts asserts two of a four-part check against values that are the same binding as themselves
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/acceptance-stderr-gate.test.ts:78
  - tests/acceptance-stderr-gate.test.ts:89-95
  - tests/acceptance-stderr-gate.test.ts:431-436
  - tests/acceptance-stderr-gate.test.ts:447-454
  - tests/live/theta-stderr-prefixes.ts:20-22
  - tests/live/theta-stderr-prefixes.ts:49-53
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# acceptance-stderr-gate.test.ts asserts two of a four-part check against values that are the same binding as themselves

## Observation
The test `"exports the three prefixes, the quiesce one re-exported from src rather than re-literalised"` (`tests/acceptance-stderr-gate.test.ts:431-454`) makes four `expect()` calls. Two of the four compare a value imported from `./live/theta-stderr-prefixes` against a value that module's source defines as being that same value: `STALE_QUIESCE_STDERR_PREFIX` against `SRC_STALE_QUIESCE_STDERR_PREFIX` (the same name imported a second time, aliased, directly from `../src/extension/stale-ctx`), and `THETA_STDERR_LINE_PREFIXES` against an array literal the test builds from the same three imported constants. `tests/live/theta-stderr-prefixes.ts` defines `STALE_QUIESCE_STDERR_PREFIX` as a bare re-export of `stale-ctx.ts`'s constant of that name, and defines `THETA_STDERR_LINE_PREFIXES` as literally `[STALE_QUIESCE_STDERR_PREFIX, SYSTEM_NOTE_DELIVERY_FAILED_PREFIX, RELOAD_REBUILD_REJECTED_PREFIX]`. The other two `expect()` calls in the same test, comparing `SYSTEM_NOTE_DELIVERY_FAILED_PREFIX` and `RELOAD_REBUILD_REJECTED_PREFIX` against hand-typed string literals not sourced from the same module, are not affected by this observation.

## Evidence
`tests/acceptance-stderr-gate.test.ts:78` — the same constant imported a second time, directly from the production module, under an alias:
```ts
import { STALE_QUIESCE_STDERR_PREFIX as SRC_STALE_QUIESCE_STDERR_PREFIX } from "../src/extension/stale-ctx";
```

`tests/acceptance-stderr-gate.test.ts:89-95` — the test-helper import supplying the other side of both comparisons:
```ts
import {
  RELOAD_REBUILD_REJECTED_PREFIX,
  STALE_QUIESCE_STDERR_PREFIX,
  SYSTEM_NOTE_DELIVERY_FAILED_PREFIX,
  THETA_STDERR_LINE_PREFIXES,
  thetaOwnedStderrLines,
} from "./live/theta-stderr-prefixes";
```

`tests/acceptance-stderr-gate.test.ts:431-436` — the test's name and its first tautological assertion:
```ts
  it("exports the three prefixes, the quiesce one re-exported from src rather than re-literalised", () => {
    expect(
      STALE_QUIESCE_STDERR_PREFIX,
      "re-literalising the quiesce prefix here would let a rename at " +
        "`src/extension/stale-ctx.ts` leave both gates scoring dead text",
    ).toBe(SRC_STALE_QUIESCE_STDERR_PREFIX);
```

`tests/acceptance-stderr-gate.test.ts:447-454` — the second tautological assertion, closing the same test:
```ts
    expect([...THETA_STDERR_LINE_PREFIXES].sort()).toStrictEqual(
      [
        STALE_QUIESCE_STDERR_PREFIX,
        SYSTEM_NOTE_DELIVERY_FAILED_PREFIX,
        RELOAD_REBUILD_REJECTED_PREFIX,
      ].sort(),
    );
  });
```

`tests/live/theta-stderr-prefixes.ts:20-22` — the bare re-export that makes the first tautology mechanical:
```ts
import { STALE_QUIESCE_STDERR_PREFIX } from "../../src/extension/stale-ctx";

export { STALE_QUIESCE_STDERR_PREFIX };
```

`tests/live/theta-stderr-prefixes.ts:49-53` — `THETA_STDERR_LINE_PREFIXES`'s own definition, the same three constants in the same order the test rebuilds:
```ts
export const THETA_STDERR_LINE_PREFIXES: readonly string[] = [
  STALE_QUIESCE_STDERR_PREFIX,
  SYSTEM_NOTE_DELIVERY_FAILED_PREFIX,
  RELOAD_REBUILD_REJECTED_PREFIX,
];
```

## Why this is a problem
`theta-stderr-prefixes.ts:20` imports `STALE_QUIESCE_STDERR_PREFIX` from `stale-ctx.ts` and `:22` re-exports the identical binding under the identical name, with no intervening transformation. `acceptance-stderr-gate.test.ts:78` imports that same name a second time, directly from `stale-ctx.ts`. Both identifiers therefore read the one string `stale-ctx.ts` assigns, so `expect(STALE_QUIESCE_STDERR_PREFIX).toBe(SRC_STALE_QUIESCE_STDERR_PREFIX)` (:433-436) compares that string to itself: no value `stale-ctx.ts` could assign would make the two differ while `theta-stderr-prefixes.ts:22` stays a bare re-export. The test's own name and failure message ("re-exported from src rather than re-literalised") present this as checking a structural property of `theta-stderr-prefixes.ts` — whether it imports the constant or independently retypes it — but a runtime value comparison cannot observe that distinction: an independent re-literalisation that happened to copy the current string would pass this exact check exactly as the real re-export does. The second tautology is more direct: `THETA_STDERR_LINE_PREFIXES` is defined (:49-53) as exactly `[STALE_QUIESCE_STDERR_PREFIX, SYSTEM_NOTE_DELIVERY_FAILED_PREFIX, RELOAD_REBUILD_REJECTED_PREFIX]`, and the test's comparison array (:449-452) is built from imports of those same three names in the same order; sorting both sides (`.sort()`) does not introduce any independent fact the comparison could catch. Of the test's four assertions, only the two against hand-typed literals not sourced from `theta-stderr-prefixes.ts`'s own re-exported name (:437-446, `SYSTEM_NOTE_DELIVERY_FAILED_PREFIX` and `RELOAD_REBUILD_REJECTED_PREFIX`, each a bare literal defined only in that module, checked against a separately hand-typed literal in the test) compare values capable of diverging from each other.

## Suggested direction (non-binding, optional)
"Re-exported, not re-literalised" names a property of source structure; a value comparison expresses only "these two reads currently agree," which is a different claim, and closing that gap is a question for whoever next touches this test rather than a design this filing owns.

## False-positive check
- Read `tests/live/theta-stderr-prefixes.ts` in full: confirmed `STALE_QUIESCE_STDERR_PREFIX` (:20-22) is a bare `import` immediately followed by `export { STALE_QUIESCE_STDERR_PREFIX }` with no transformation, and `THETA_STDERR_LINE_PREFIXES` (:49-53) is defined as exactly the three-constant array the test rebuilds at :449-452.
- Searched `tests/acceptance-stderr-gate.test.ts` for `vi.mock`: zero hits, so neither `../src/extension/stale-ctx` nor `./live/theta-stderr-prefixes` is intercepted at test time and both resolve to the real modules.
- Ran `npx vitest run tests/acceptance-stderr-gate.test.ts`: 38/38 tests pass at HEAD, including this one — not a flaky or wrong-behaviour bug; the assertions pass because they are structurally unable to fail, not because anything about the re-export relationship was verified.
- Gate-pin carve-out: the filename matches `*gate*.test.ts`, but the carve-out covers pinned census counts/inventories; this finding is about value-identity tautology, unconnected to any pinned count, so the carve-out does not apply.
- Recording-double carve-out: no fake/double recording calls, and no "never called" witness, is involved; not applicable.
- docs/bugs/ signature search: this file narrates bug 0030, `status: fixed (0.35.0)` — not a documented correct-reason red. Grepped `docs/bugs/*.md` for this test's name and for citations in the 430-454 line range: none found.
- coverage-matrix/bug-doc citation search: grepped `docs/reference/coverage-matrix.md` for `acceptance-stderr-gate`: no match. Grepped `docs/bugs/*.md` for `acceptance-stderr-gate.test.ts`: bug 0047 cites `:110–148` and `:189–193` (both outside this range); bugs 0025/0030/0126/0268 cite the file by name with no line range covering :431-454. No citation names this test or its line range, so no merge/rename/delete pinning applies, and this finding proposes none.
- git history: `tests/acceptance-stderr-gate.test.ts` and `tests/live/theta-stderr-prefixes.ts` were both added in the same commit (`1d516897`, the bug 0030 fix, 0.35.0), consistent with the test having been written to document the re-export relationship at the moment it was introduced.

## Triage
<!-- triage appends here -->
verdict: confirmed — verified both flagged expect()s trace to one binding (theta-stderr-prefixes.ts:20-22 bare re-exports stale-ctx.ts's constant, so it and the test's direct SRC_ import are the same value) or are rebuilt from that module's own three named imports, no vi.mock intercepts either module, and 38/38 pass at HEAD, so neither of the two can ever fail while the current wiring holds; the *gate*.test.ts carve-out doesn't cover this (a value-identity tautology, not a pinned census count), and no bug doc or coverage-matrix citation pins these lines (triage: claude-opus-5)
