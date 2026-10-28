---
id: PTQ-1772
title: The union-generic-arm PARITY tests name byte equality but compare object values.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/union-generic-arm-lowering.test.ts:399-410
  - tests/union-generic-arm-lowering.test.ts:471-481
sites: 2
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The union-generic-arm PARITY tests name byte equality but compare object values.

## Observation
Two PARITY test declarations in `union-generic-arm-lowering.test.ts` say that the four positions agree “byte for byte.” Both bodies compare the returned fragments with `toEqual`, rather than comparing their serializations. `JSON.stringify` appears in their assertion messages, not in the compared operands. These tests establish object-value equality, which does not distinguish object-property insertion order.

## Evidence
`tests/union-generic-arm-lowering.test.ts:399-410`:
```ts
    it(`PARITY (${label}): the four positions agree byte for byte`, () => {
      const observed = POSITIONS.map((position) => fragmentOf(label, position, source));
      for (let i = 1; i < POSITIONS.length; i++) {
        const position = POSITIONS[i];
        expect(
          observed[i],
          `${label}: type-system.md:15 applies ONE type grammar to every annotation position, ` +
            `so \`${source}\` must lower identically at all four; ${position} lowered ` +
            `${JSON.stringify(observed[i])} against alias's ${JSON.stringify(observed[0])}`,
        ).toEqual(observed[0]);
      }
    });
```

`tests/union-generic-arm-lowering.test.ts:471-481`:
```ts
    it(`PARITY (${label}): the four positions agree byte for byte`, () => {
      const observed = POSITIONS.map((position) => fragmentOf(label, position, source));
      for (let i = 1; i < POSITIONS.length; i++) {
        const position = POSITIONS[i];
        expect(
          observed[i],
          `${label}: type-system.md:15 — one type grammar per position; ${position} lowered ` +
            `${JSON.stringify(observed[i])} against alias's ${JSON.stringify(observed[0])}`,
        ).toEqual(observed[0]);
      }
    });
```

The exact search `rg -n -F 'it(\`PARITY (${label}): the four positions agree byte for byte\`' tests/union-generic-arm-lowering.test.ts` (with the backslashes before backticks omitted inside the shell's single quotes) returned these two declarations. Each excerpt was re-read immediately before filing.

The matcher distinction was also checked read-only with the installed `@vitest/expect` export `equals`: comparing `{ type: 'array', items: { type: 'integer' } }` with `{ items: { type: 'integer' }, type: 'array' }` returned `true`, while comparing their `JSON.stringify` results returned `false`. Their serialized forms were `{"type":"array","items":{"type":"integer"}}` and `{"items":{"type":"integer"},"type":"array"}` respectively.

## Why this is a problem
This is the D7 misleading-test-name class: a reader following “byte for byte” would take a passing PARITY result to establish equality of the emitted representations, including object-key order. The bodies instead establish equality of object values. The example above distinguishes those two properties mechanically; the message's serialized fragments do not change the matcher's semantics. This is a mismatch between the names and the assertions that exist, not a claim that these assertions cannot fail on differing values.

## False-positive check
- Gate-pin check: the scoped file is not a gate/pin-family test, and the cited comparisons are cross-position comparisons, not pinned census counts.
- Recording-double check: the operands are lowered fragments, not recorded calls serving as MUST-NOT witnesses.
- docs/bugs/ signature search: read bug 0043's offline-lock description at `docs/bugs/0043-union-nonprimitive-arm-lowers-permissive.md:211-225`; it documents lowering witnesses. An exact `PARITY` search in that document returned zero matching lines. This finding does not concern a red/disabled test or challenge a documented failure signature.
- Coverage-matrix/bug-doc citation search: a Python literal-string search for `PARITY (${label}): the four positions agree byte for byte` across every Markdown file under `docs/bugs/` and in `docs/reference/coverage-matrix.md` returned zero matching lines in each. Searching the matrix for `union-generic-arm-lowering` also returned zero matching lines. Bug 0043 cites the file as an offline lock; no merge, rename, or deletion is proposed here.
- Existing-finding check: read resolved PTQ-1087. That finding concerns the former first-iteration self-comparison; the current loops start at index 1. The present claim concerns the name's byte-equality promise versus object-value comparison, not that resolved self-comparison. PTQ-1485 concerns the reader harness, not these names.
- Intent check: inspected the latest file-history diff, commit `1e6da3ca`; it migrates helper imports and removes a local AJV wrapper, rather than documenting a byte/value distinction for these names.
- Scope check: the claim is solely about what two existing test names communicate relative to their bodies. It makes no coverage, suite-composition, runtime-risk, or production-behavior claim.

## Triage
verdict: confirmed — Both excerpts and the two-hit title search reproduce at tests/union-generic-arm-lowering.test.ts:399-410 and :471-481: the titles promise byte-for-byte agreement, but toEqual compares fragments structurally and JSON.stringify appears only in messages; independently probing installed @vitest/expect.equals confirms reordered object keys compare equal while their serialized strings differ. This is a mechanically evidenced D7 misleading-name mismatch, not a behaviour or coverage claim; no carve-out applies, the stated documentation searches reproduce, and resolved PTQ-1087 prescribed only removing the first-iteration self-comparison, while PTQ-1485 concerns reader-harness duplication, not these titles. (triage: claude-opus-5-5)
