---
id: PTQ-1765
title: The generic-argument split test says both nesting modes split identically while its a1 fixture requires different results.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/generic-argument-shredded-group-refusal.test.ts:215-220
  - tests/generic-argument-shredded-group-refusal.test.ts:245-261
  - tests/generic-argument-shredded-group-refusal.test.ts:199-209
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The generic-argument split test says both nesting modes split identically while its a1 fixture requires different results.

## Observation
The parameterized split test is titled “splits identically in both nesting modes.” Its a1 fixture supplies three expected segments for the default mode and one expected segment for the brace-aware mode. The body compares each mode with its own expected array, preserving their difference rather than establishing equality between modes. The surrounding comment identifies the intended invariant as retaining the pre-existing split bytes through bug 0204's change.

## Evidence
`tests/generic-argument-shredded-group-refusal.test.ts:215-220` — the a1 row requires different arrays:

```ts
    [
      "a1",
      "{a: string, b: integer, c: boolean}",
      ["{a: string", "b: integer", "c: boolean}"],
      ["{a: string, b: integer, c: boolean}"],
    ],
```

`tests/generic-argument-shredded-group-refusal.test.ts:245-254` — the shared title and default-mode assertion:

```ts
  for (const [id, text, angle, angleAndBrace] of SPLIT_ROWS) {
    it(`FENCE (${id}): \`${text}\` splits identically in both nesting modes`, () => {
      const label = `${id} (splitTopLevel, ${text})`;
      expect(
        splitTopLevel(text, ","),
        `${label}: the route settled for bug 0204 suppresses the JUDGEMENT of a manufactured ` +
          `fragment, it does not move the split — \`splitTopLevel\`'s \`"angle"\` default and ` +
          `\`splitTopLevelSegments\`' \`tracksBraces\` gate are byte-untouched (§Fix (b)(3): ` +
          `"The split, its segment count, and every lowered byte are untouched")`,
      ).toEqual(angle);
```

`tests/generic-argument-shredded-group-refusal.test.ts:255-261` — the other mode is compared with the separate array:

```ts
      expect(
        splitTopLevel(text, ",", "angle-and-brace"),
        `${label}: the brace-aware mode every other reader of this argument list uses ` +
          `(\`queryResponseAnnotation\`, \`inlineObjectFieldKeys\`, \`lowerInlineObject\`) is ` +
          `unmoved too; this cell is the tripwire on a route that widens the split instead ` +
          `(§Fix (b)(1), rejected)`,
      ).toEqual(angleAndBrace);
```

`tests/generic-argument-shredded-group-refusal.test.ts:199-209` — the intended invariant is unchanged behavior, not cross-mode equality:

```ts
// (a) THE SEAMS — GREEN in both directions. §Reproduction (a), §Fix (c)(7).
//
// The chosen route (§Fix (b)(3), traversal suppression) moves NO split byte and
// NO decline verdict: it changes only whether a manufactured fragment is
// JUDGED. These cells are the lock on that, and they are the cells that catch a
// route silently widening the split to `"angle-and-brace"` (§Fix (b)(1)) — a
// route the orchestrator rejected because it reds bug 0164's landed cells d6/d7.
// The `LowerCtx.unspellable` CONTENTS are deliberately NOT pinned here: those
// entries are what the suppression stops producing, so pinning them would be a
// fence that cannot go green. What is pinned is the split, the per-shard
// verdict, and the lowered bytes.
```

## Why this is a problem
This is the **Misleading test names** class. A reader following the test title would take a passing a1 result as evidence that the nesting modes produce identical segments. Mechanically, that same result requires a three-segment array from one mode and a one-segment array from the other: making those outputs identical would fail one of the existing assertions. The mismatch concerns the description of an existing test, not a request for another assertion or a change to the pinned behavior.

## Suggested direction (non-binding, optional)
Describe the per-mode preservation invariant rather than cross-mode identity. This entails a test-title rename; the file is a cited witness in `docs/bugs/0204-bracket-blind-split-shreds-inline-object-in-generic.md:1084-1092`, which explicitly names the two-mode seam, so that citation must be respected.

## False-positive check
- **Gate-pin:** this is not a census/count gate. The expected arrays are legitimate behavior pins; the finding does not challenge either array or their preservation.
- **Recording-double:** the cited body calls the split function directly and has no recording double or MUST-NOT witness. This finding does not question negative witnesses elsewhere.
- **docs/bugs/ signature search:** read bug 0204's status and witness record; it is fixed (0.139.0), and its record describes both nesting modes as exercised seams. `rg -n -F 'splits identically in both nesting modes' docs/bugs/` returned no matches. No red, disabled test, or missing prerequisite is being reported.
- **Coverage-matrix/bug-doc citation search:** `rg -n -F 'generic-argument-shredded-group-refusal' docs/reference/coverage-matrix.md` returned no matches. The filename search across `docs/bugs/` found bug 0204's whole-file witness and other bug records citing existing groups or fixtures. The proposed title rename is explicitly disclosed above with the originating witness document; no test deletion or merge is proposed. The exact-title search found no bug-document citation of the generated name.
- **Intent/history:** `git log --oneline -S 'splits identically in both nesting modes' -- tests/generic-argument-shredded-group-refusal.test.ts` identified `e5d760bd`; reading that commit's file showed the same distinct expected arrays and the same preservation comment. This supports the intended invariant without treating that intended behavior as a bug.
- **Duplicate-topic:** searches of `quality/intake`, `quality/issues`, and `quality/resolved` for `splits identically` and `SPLIT_ROWS` found no existing finding. The previously filed registry/harness duplication topics for this file concern other code, not the title.
- **Scope:** only existing test naming is challenged. There is no coverage claim, runtime-risk claim, suite-composition claim, or production-code finding.

## Triage
verdict: confirmed — The title asserts cross-mode identity, but a1 explicitly requires three default-mode segments versus one brace-aware segment; both assertions pin per-mode preservation, as the comment and e5d760bd confirm. This is an in-scope D7 misleading name; searches reproduce, the bug 0204 witness citation is disclosed, and no duplicate or resolved prescription covers this title. (triage: claude-opus-5-5)
