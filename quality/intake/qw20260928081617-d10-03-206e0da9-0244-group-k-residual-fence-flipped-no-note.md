---
id: pending
title: "Bug 0244's 0.238.0 fix record cites witness group (K) as the RESIDUAL FENCE pinning `array<{a: b c, d e}>` at `[]` / permissive `{}`. 206e0da9 (bug 0256) rewrote group (K) to assert the refusal (k1, k3–k7, k9, k10) and added no note to 0244's record"
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md:651-669
  - docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md:635-637
  - tests/inline-object-keyless-entry-refusal.test.ts:1056-1098
  - tests/inline-object-keyless-entry-refusal.test.ts:1101-1116
  - docs/bugs/0256-generic-argument-stranded-entry-registers-permissive.md:721-731
  - docs/bugs/0256-generic-argument-stranded-entry-registers-permissive.md:787-789
  - docs/bugs/0248-malformed-escaping-tools-entry-containment-unwitnessed.md:572-602
sites: 8
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0244's 0.238.0 fix record cites witness group (K) as the RESIDUAL FENCE pinning `array<{a: b c, d e}>` at `[]` / permissive `{}`. 206e0da9 (bug 0256) rewrote group (K) to assert the refusal (k1, k3–k7, k9, k10) and added no note to 0244's record

## Observation
`docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md` is `fixed (0.238.0)`. Its *Residuals* item 1 states that "The break-residue class is not closed": `params:` `p: 'array<{a: b c, d e}>'` "reports `[]`, registers, and lowers the permissive `{}`". It cites the evidence as "the witness's RESIDUAL FENCE group (K) at its measured values, labelled as measured-not-desired". Commit `206e0da9` (bug 0256, v0.251.0) rewrote group (K) in `tests/inline-object-keyless-entry-refusal.test.ts`. The group is now titled "bug 0256 (K) — the ruling's delivered reach: the stranded entry is visited and judged". Cells k1, k3, k4, k5 and k6 now expect `[MALF]`, and k7, k9 and k10 now expect `null` in place of the permissive fragment. Neither "RESIDUAL FENCE" nor "measured-not-desired" appears in the file any longer. The 0244 record has not been touched since its fix commit `82f9ea05`, and bug 0256's record says "Discharge notes appended: none."

## Evidence
Claim side, `docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md:651-669` (re-read before filing; `:651-656` elided for the 15-line cap, `:657-669` shown):
```
     backstops it; at the generic-argument position there is none, so
     `params:` `p: 'array<{a: b c, d e}>'` reports `[]`, registers, and lowers
     the permissive `{}`. Evidence that this is a residual and not a regression:
     the cell is `[]` at HEAD `537c274c` and `[]` under this change (no flip);
     §Fix names the emission site as exactly the two arms, and an unvisited
     entry reaches neither; and the stranding interior's first entry
     (`a: b c`, a colon-present junk tail) is bug 0252's subject class, which
     the adjudication's clause 2 pins as unmoved and clause 4 makes a lock.
     Pinned by the witness's RESIDUAL FENCE group (K) at its measured values,
     labelled as measured-not-desired, with the byte-neighbour control
     `array<{a: b, d e}>` refusing beside it to prove the distinction is the
     loop's REACH and not the entry's shape. A change that closes it is
     expected to red group (K) loudly.
```
`:635-637` (Verification) also leans on group (K) as residual: "group (K)'s residual cells are byte-unmoved under neutralisation".

Evidence side, `tests/inline-object-keyless-entry-refusal.test.ts` (opened):
- `:1056` `describe("bug 0256 (K) — the ruling's delivered reach: the stranded entry is visited and judged", …)`. `:1048` sets `const STRANDED = "{a: b c, d e}"`, and k1 is `paramsSrc(\`array<${STRANDED}>\`)` with `expected: [MALF]`. k3 and k4 also expect `[MALF]`. k5 and k6 are commented "a CODE flip" and expect `[MALF]`.
- `:1091-1097`, the failure message: "bug 0256's operator ruling (OPTION 1, resync-and-tolerate) closes the break-residue class this group used to fence …".
- `:1101-1116` `it("k7–k10: no stranded carrier lowers the permissive fragment any longer ", …)` ends with `.toEqual({ k7: "null", k8: "null", k9: "null", k10: "null" })`.

The flipped cells are k1, k3, k4, k5, k6, k7, k9 and k10 (8). k2 and k8 are unmoved.

Searches (all run this session):
- `git log --format="%h %s" -S "the ruling's delivered reach" -- tests/inline-object-keyless-entry-refusal.test.ts` → `206e0da9 fix: bug 0256 — …`. `git blame -s` on `:1056`, `:1057` and `:1101` → `206e0da9d` (3 of 3).
- `grep -c "RESIDUAL FENCE\|measured-not-desired" tests/inline-object-keyless-entry-refusal.test.ts` → 0.
- `grep -c "0256" docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md` → 0. `grep -c -i "coordination note"` on the same file → 0.
- `git log --format=%h 206e0da9..HEAD -- docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md | wc -l` → 0. `git show 206e0da9 --stat --format= | grep -c "0244-"` → 0.
- `docs/bugs/0256-generic-argument-stranded-entry-registers-permissive.md:721-731` enumerates the flip: "Bug 0244's witness group (K), ruling clause (ii): k1, k3 and k4 `[]` → one `theta/parse/malformed-schema-field`; … k7, k9 and k10 `PERMISSIVE_P` → `null` … The group's header is rewritten from a residual fence recording measured-not-desired values into the delivered reach". `:787-789`: "**Discharge notes appended:** none. Bugs 0238, 0244, 0251 and 0252 are all *fixed*; their witnesses were updated in place".

## Why this is a problem
Residual 1 and its group-(K) pointer are the record's evidence that the break-residue class is open and fenced at `[]` / `{}`. A reader who follows the pointer now finds a group titled "delivered reach" asserting the refusal, with no RESIDUAL FENCE label and no measured-not-desired values. The record still reads "is not closed". The record anticipated the red ("A change that closes it is expected to red group (K) loudly"), but nothing in it records that the change happened or where. 0256's record states that no note was appended to 0244. The house practice for a sibling fix that moves a record's witness is a dated coordination note in the moved record: `grep -l "^### Coordination note" docs/bugs/*.md | wc -l` → 12, including 0248 `:572-602` in this shard for bug 0268's D2/D4 flip.

## Suggested direction (non-binding, optional)
Append a dated coordination note to 0244's record that names `206e0da9` / bug 0256, states that Residual 1's class is closed there, and lists the (K) cells moved (k1, k3–k7, k9, k10) and those unmoved (k2, k8), plus the (L) constants, which were re-derived unchanged.

## False-positive check
- Pin existence: group (K) and every k-cell still exist. This is a changed-assertion decay, not a missing cell.
- Representations covered:
  - (1) Bug-doc Witness/Fix lines: 0244 `:635-637` and `:651-669` quoted; 0 coordination notes and 0 mentions of 0256.
  - (2) Test file names and it()/describe() titles: the witness file, read and blamed at the cited lines.
  - (3) Coverage-matrix rows: `grep -c "0244\|keyless-entry" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md AGENTS.md` → 0, 0, 0.
  - (4) AGENTS.md gate names: same search → 0.
  - (5) CHANGELOG, corroboration only: `CHANGELOG.md:2629` says "Bug 0256: the stranded-entry class is closed". It is not in the record.
- Other filings: `grep -rl "53cd0d86\|206e0da9\|66892f19" quality/intake quality/issues`, run before filing → 0 files.
- The honesty-marker rule does not cover this. The residual marker is not what is filed. What is filed is the marker's pointer, which now resolves to the opposite assertion.
- I did not dispute whether 0256's retake was right. The authority for it is recorded on 0256's record.

## Triage
verdict: questionable — decay verified: 0244's Residual 1 (:651-669) still says "not closed" and cites the "RESIDUAL FENCE group (K) at its measured values, labelled as measured-not-desired". But tests/inline-object-keyless-entry-refusal.test.ts:1056 is now `describe("bug 0256 (K) — the ruling's delivered reach…")`, with k1/k3–k6 expecting [MALF] and k7/k9/k10 expecting "null" (:1101-1116). The file has 0 RESIDUAL FENCE/measured-not-desired hits, and blame on :1056/:1057/:1101 gives 206e0da9. The 0244 record has not been touched since 82f9ea05 (0 hits for 0256, 0 coordination notes), and 0256's record :721-731/:787-789 confirms the flip and "Discharge notes appended: none". This is not a mechanical re-point: group (K) still exists but now asserts the opposite of the claim, so the repair means adding a note to the record or rewording it, and that is a human's call. No other filing tracks 206e0da9: d10-02 and d10-04 mention the sha only inside their grep commands (triage: claude-opus-5-5)
