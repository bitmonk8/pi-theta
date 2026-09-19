---
id: PTQ-1087
title: union-generic-arm-lowering.test.ts's PARITY loops assert observed[0] against itself on their first iteration
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/union-generic-arm-lowering.test.ts:469-479
  - tests/union-generic-arm-lowering.test.ts:540-550
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# union-generic-arm-lowering.test.ts's PARITY loops assert observed[0] against itself on their first iteration

## Observation
`POSITIONS` is the fixed tuple `["alias", "field", "params", "annotation"] as const` (line 250), so `POSITIONS[0]` is always `"alias"`. Both `PARITY` tests build `observed = POSITIONS.map((position) => fragmentOf(label, position, source))` and then loop `for (const [i, position] of POSITIONS.entries())`, asserting `expect(observed[i], ...).toEqual(observed[0])` on every iteration. On the loop's first iteration, `i === 0`, so the call is `expect(observed[0], ...).toEqual(observed[0])` — the same array element compared to itself. This iteration is present in both `describe` groups (a) and (b), each of which runs the `PARITY` test once per row in its own `rows` table (2 rows in group (a), 3 in group (b)), so the self-comparison executes on every one of the 5 resulting test instances.

## Evidence
`tests/union-generic-arm-lowering.test.ts:469-479` (re-read immediately before filing):
```ts
    it(`PARITY (${label}): the four positions agree byte for byte`, () => {
      const observed = POSITIONS.map((position) => fragmentOf(label, position, source));
      for (const [i, position] of POSITIONS.entries()) {
        expect(
          observed[i],
          `${label}: type-system.md:15 applies ONE type grammar to every annotation position, ` +
            `so \`${source}\` must lower identically at all four; ${position} lowered ` +
            `${JSON.stringify(observed[i])} against alias's ${JSON.stringify(observed[0])}`,
        ).toEqual(observed[0]);
      }
    });
```

`tests/union-generic-arm-lowering.test.ts:540-550` (re-read immediately before filing, the byte-identical structure in group (b), differing only in the failure-message wording):
```ts
    it(`PARITY (${label}): the four positions agree byte for byte`, () => {
      const observed = POSITIONS.map((position) => fragmentOf(label, position, source));
      for (const [i, position] of POSITIONS.entries()) {
        expect(
          observed[i],
          `${label}: type-system.md:15 — one type grammar per position; ${position} lowered ` +
            `${JSON.stringify(observed[i])} against alias's ${JSON.stringify(observed[0])}`,
        ).toEqual(observed[0]);
      }
    });
```

`tests/union-generic-arm-lowering.test.ts:250` — the fixed tuple that pins `POSITIONS[0]` to `"alias"` and therefore pins the loop's first iteration to the self-comparison:
```ts
const POSITIONS = ["alias", "field", "params", "annotation"] as const;
```

## Why this is a problem
On the loop's `i === 0` pass, `position` is bound to `POSITIONS[0]`, so `observed[i]` and the expected value `observed[0]` are the exact same array element — not a recomputed or independently derived value, but literally `observed[0]` read twice. `toEqual` performing a deep-equality comparison of a value against itself cannot observe a mismatch regardless of what `fragmentOf` returned for the alias position, so this one comparison in each of the two loops carries no discriminating power: it passes identically whether the alias-position lowering is correct, wrong, or malformed, and a mutation that broke every position identically (a plausible failure mode this exact test is guarding, per its own docstring "the reorder... broke the path it was meant to route ONTO") would still pass this particular comparison. The other three iterations (`i` = 1, 2, 3) are real comparisons of `field`/`params`/`annotation` against `alias` and are unaffected by this observation.

## Suggested direction (non-binding, optional)
Starting the loop from the second position (comparing only `field`/`params`/`annotation` against `observed[0]`) would drop the self-comparison without weakening the three real comparisons the test already performs.

## False-positive check
- Gate-pin check: `union-generic-arm-lowering.test.ts` matches none of `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: this is a value-equality assertion over computed lowering fragments, not a recording double's MUST-NOT witness; not applicable.
- docs/bugs/ signature search: `grep -n "PARITY" docs/bugs/0043-union-nonprimitive-arm-lowers-permissive.md` → 0 hits; the bug document does not describe or license a self-comparing loop iteration as a deliberate control.
- coverage-matrix citation search: `grep -n "union-generic-arm-lowering" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge, rename or deletion of the test, only a loop-bound observation.
- Confirmed `POSITIONS` is declared exactly once at module scope (line 250) and is not reordered or reassigned before either cited `PARITY` test runs, so `POSITIONS[0]` is `"alias"` at both call sites without exception.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at :469-479 and :540-550; `POSITIONS` is the single module-scope `as const` tuple at :250 (11 reads in the file, no reassignment) so the loop's `i === 0` pass evaluates `expect(observed[0]).toEqual(observed[0])` — the same array slot on both sides, which `fragmentOf` (:357-366) fills with either a throw or `read.fragment`, so that one expect per PARITY loop can never independently fail (even `undefined` vs `undefined` passes) — D7 "assertion that cannot fail", the same cannot-independently-fail shape confirmed in PTQ-0241/PTQ-0271/PTQ-0608; the candidate correctly scopes it (iterations 1-3 remain real) and the fix is mechanical (iterate from index 1); carve-outs re-run — not a gate file, asserts read computed lowering fragments not a recording double, docs/bugs/0043 has 0 `PARITY` hits and its "parity" mentions (:31, :219, :719, :786) describe cross-position agreement not a self-compare control, 0 coverage-matrix hits, no it()/describe() rename or deletion proposed; `grep -rn "toEqual(observed\[0\])" tests/` hits only this file, and no existing PTQ row (the 9 rows citing this file are all D7 harness-duplication or slug-oracle classes) tracks this root cause (triage: claude-fable-5-1)
