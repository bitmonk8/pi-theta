---
id: PTQ-0983
title: invokeArgMessage's fill-wrapper body is redeclared byte-for-byte across four test files including the in-scope modulo-zero-result-type-number.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/modulo-zero-result-type-number.test.ts:199-214
  - tests/invoke-arg-array-literal-provable.test.ts:141-156
  - tests/invoke-arg-type-mismatch-wired.test.ts:171-186
  - tests/arg-mismatch-diagnostic-count-by-surface.test.ts:149-164
sites: 4
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# invokeArgMessage's fill-wrapper body is redeclared byte-for-byte across four test files including the in-scope modulo-zero-result-type-number.test.ts

## Observation
`tests/modulo-zero-result-type-number.test.ts` declares a private
`function invokeArgMessage(slot, paramName, expected, actual): string` that
calls the file's own `fill(...)` helper with a four-entry substitution map
keyed `<i>`/`<param>`/`<expected>`/`<actual>` for the
`theta/parse/invoke-arg-type-mismatch` registry row. The identical
five-parameter-shape, four-key `fill(...)` call is independently redeclared,
body-for-body identical apart from which module-local constant names the
code (`INVOKE_ARG_CODE` vs `CODE`), in three other test files. No
`tests/helpers/` module exports this wrapper.

## Evidence

`tests/modulo-zero-result-type-number.test.ts:199-214` (re-read immediately
before filing):
```ts
function invokeArgMessage(
  slot: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fill(
    INVOKE_ARG_CODE,
    new Map([
      ["<i>", String(slot)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```

`tests/invoke-arg-array-literal-provable.test.ts:141-156` — identical apart
from the constant name (`CODE`):
```ts
function invokeArgMessage(
  slot: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fill(
    CODE,
    new Map([
      ["<i>", String(slot)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```

`tests/invoke-arg-type-mismatch-wired.test.ts:171-186` — the same body,
same constant name as the previous file:
```ts
function invokeArgMessage(
  slot: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fill(
    CODE,
    new Map([
      ["<i>", String(slot)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```

`tests/arg-mismatch-diagnostic-count-by-surface.test.ts:149-164` — same body,
same constant name (`INVOKE_ARG_CODE`) as the in-scope file:
```ts
function invokeArgMessage(
  slot: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fill(
    INVOKE_ARG_CODE,
    new Map([
      ["<i>", String(slot)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```

Exact search: `grep -n "function invokeArgMessage" tests/*.test.ts` returns
exactly five files — the four cited above plus
`tests/division-result-type-number-invoke.test.ts:113`, whose body inlines
the `fill`-equivalent template-substitution loop directly rather than
delegating to a `fill(...)` call, so it is a fifth, functionally-equivalent
but not byte-identical, instance and is not counted in `sites`. No
`tests/helpers/` module declares or exports `invokeArgMessage`
(`grep -rn "invokeArgMessage" tests/helpers` → 0 hits).

## Why this is a problem
The same five-parameter wrapper — build a four-key substitution map for the
`<i>`/`<param>`/`<expected>`/`<actual>` placeholders and hand it to the
file's own `fill` — is typed out fresh in four independent files rather than
declared once and imported. Three of the four are byte-identical down to
variable names; the fourth differs only in which module-local constant it
threads through. A change to the placeholder set the
`theta/parse/invoke-arg-type-mismatch` registry row carries (an added or
renamed token) requires the same hand-edit repeated in all four files to stay
in sync, with nothing surfacing a copy left behind.

## Suggested direction (non-binding, optional)
A `tests/helpers/` export of this wrapper, parameterised by the code
constant each file already threads through its own `fill`, is the shape all
four copies already point toward.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named
  gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited
  lines are a message-building helper, not a pinned count or inventory.
- Recording-double check: `invokeArgMessage` builds an expected string for a
  positive `toContain`/`toEqual`-style assertion; it is not a recording
  double backing a "never called" MUST-NOT witness, so the carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rln "invokeArgMessage" docs/bugs/*.md`
  → 0 hits; no documented correct-reason red names this wrapper.
- coverage-matrix/bug-doc citation search: `grep -n "modulo-zero-result-type-number\|invoke-arg-array-literal-provable\|invoke-arg-type-mismatch-wired\|arg-mismatch-diagnostic-count-by-surface" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that the helper wrapper be declared once.
- Prior-filing overlap check: `grep -rl "invokeArgMessage" quality/issues/*.md quality/intake/*.md quality/resolved/*.md` returns PTQ-0959 (locations only inside modulo-zero-result-type-number.test.ts, a stale-title finding unrelated to this wrapper), PTQ-0966 (the disjoint `assertRowSurfaceLive`/`assertParamTypeDeclarable` pair, two of the same four files but a different pair of functions), and resolved PTQ-0549 (the division/modulo sibling-harness finding, whose own Evidence section explicitly calls out `invokeArgMessage` only as modulo's "one extra builder" relative to division's harness — it does not cite or resolve this wrapper's duplication across the other three files). None of the three prior filings cites this wrapper's four locations as its own root cause.
- Coverage-drift check: this claim is about a repeated helper-function
  DECLARATION; every cited copy is already exercised by its own file's
  passing tests, and no claim is made that any behaviour or path is
  untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four excerpts reproduce at modulo-zero-result-type-number:199-214, invoke-arg-array-literal-provable:141-156, invoke-arg-type-mismatch-wired:171-186 and arg-mismatch-diagnostic-count-by-surface:149-164; mktemp sed-extract + diff shows modulo≡count-by-surface and array-literal≡wired byte-identical, the two pairs differing only on the `INVOKE_ARG_CODE`/`CODE` constant name (both bound to the same "theta/parse/invoke-arg-type-mismatch" literal); every copy is live (3 / 6 / 12 / 1 call sites beyond the declaration); stated searches reproduce (`function invokeArgMessage` → exactly 5 files with division-result-type-number-invoke:113 the disclosed inlined-loop fifth, tests/helpers → 0, docs/bugs → 0, coverage-matrix → 0); the anchor is stronger than filed — tests/helpers/registry-oracle.ts:117-200 already exports the per-code builder family this wrapper belongs to (`fillParseMessage` + `fnArgMessage`/`narrowingMessage`/`arrayElementMessage`/`letRhsMessage`/`arithmeticMessage`/`objectFieldMismatchMessage`, same fill-a-Map-and-render shape) and all four files already import from that module, so `invokeArgMessage` is simply the one sibling not lifted and the fix is a mechanical export + import (fold the division fifth site in at acceptance); D7 boilerplate duplication under tests/ with no gate/live/recording-double/red-signature carve-out and no it()/describe() change proposed; not a duplicate — PTQ-0967 tracks `fnArg`/`letRhs` builders, PTQ-0805 (fixed) the two-guard `fill` beneath them, PTQ-0549 the division/modulo whole-harness pair, PTQ-0966 the `assertRowSurfaceLive` precondition pair, PTQ-0977 the wired file's registry read; none names this wrapper (triage: claude-fable-5-1)
