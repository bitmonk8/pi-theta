---
id: pending
title: "Bug 0125's 0.76.0 fix record says the d13/d15 sentinel-collision rows draw `non-string-array-join` / `let-rhs-type-mismatch: … got index` and that the collision \"is unchanged\", but 1da5115b (bug 0135) restated d13/d15 to assert neither code fires and appended no note to 0125"
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md:1262-1269
  - docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md:1069-1071
  - docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md:1211-1212
  - tests/index-element-alias-unfolded.test.ts:915-981
  - docs/bugs/0135-index-sentinel-leaks-into-messages-and-typeenv.md:3-10
  - docs/bugs/0135-index-sentinel-leaks-into-messages-and-typeenv.md:993-994
sites: 3
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0125's 0.76.0 fix record says the d13/d15 sentinel-collision rows draw `non-string-array-join` / `let-rhs-type-mismatch: … got index` and that the collision "is unchanged", but 1da5115b (bug 0135) restated d13/d15 to assert neither code fires and appended no note to 0125

## Observation
Bug 0125's `## Fix (0.76.0)` cites rows d13–d16 of `tests/index-element-alias-unfolded.test.ts` as "the collision record" in three places. Residual 2 says "The sentinel/schema-name collision is unchanged": d13 draws `non-string-array-join`, and d15 draws `let-rhs-type-mismatch: … got index`. Commit 1da5115b (bug 0135, v0.202.0) closed that collision ("face 2 closed on Reading A at the read seam"). It restated d13/d15 to assert only `theta/parse/schema-case-mismatch`, with an explicit `.toBeUndefined()` on the two codes the record names. The group is now titled "…is refused and therefore decides no check (restated for bug 0135)". Bug 0135 records "Discharge notes appended: none." 0125 has no mention of 0135. The pointers resolve, but the cells assert the opposite of residual 2's measurement.

## Evidence
Claim side, `docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md:1262-1269` (Residual 2):
```
  2. **The sentinel/schema-name collision is unchanged.** `schema index = …`
     draws `theta/parse/schema-case-mismatch` yet still enters the `TypeEnv`, so
     the fabricated name unfolds through the author's declaration: d13 draws
     `non-string-array-join` where its d14 control draws nothing, and d15 draws
     `let-rhs-type-mismatch: … got index` where d16 draws nothing. Both rows
     also carry the `E`-severity `schema-case-mismatch`, so neither theta
     registers — a diagnostic-correctness observation, not a load hazard. The
     sentinel was not renamed, so the exposure is exactly as measured before.
```
`:1069-1071` (§Fix (b)): "not renamed at all, so the d13/d15 collision is exactly as measured before / and neither theta registers". `:1211-1212` (Tests): "d13–d16 as the collision record".

Witness today, `tests/index-element-alias-unfolded.test.ts:922-923`, `:940-948`:
```
describe("0125 (d cont.) — a `schema index = …` declaration is refused and therefore decides no check (restated for bug 0135)", () => {
  it("d13: `schema index = array<integer>` supplies NO element type to an unresolvable receiver's read (restated: bug 0135 §Fix, Reading A)", () => {
...
    ).toEqual(["theta/parse/schema-case-mismatch"]);
...
    expect(
      messageFor(diags, "theta/parse/non-string-array-join"),
      "bug 0135 §Fix, Reading A — the element type this row used to render came from a refused declaration, so no element type reaches the `join` guard and the code is absent",
    ).toBeUndefined();
```
`:958`, `:971-975` (d15):
```
  it("d15: `schema index = string` supplies NO RHS type to a typed binding (restated: bug 0135 §Fix, Reading A)", () => {
...
    ).toEqual(["theta/parse/schema-case-mismatch"]);
    expect(
      messageFor(diags, "theta/parse/let-rhs-type-mismatch"),
      "bug 0135 §Fix, Reading A — the `<actual>` this row used to render was supplied by the refused declaration, so the mismatch is absent rather than reworded",
    ).toBeUndefined();
```

The restating record, `docs/bugs/0135-index-sentinel-leaks-into-messages-and-typeenv.md:3-10`:
```
- **Status:** fixed (0.202.0). …
  **face 2 closed on Reading A at the read seam, face 1 declined to
  [0143](./0143-withheld-sentinel-author-twin-and-render-leakage.md)**.
  Coordination, not a hard prerequisite —
  [0125](./0125-index-element-narrowing-not-alias-unfolded.md) is **fixed
  (0.76.0)** and its witness pins four of this report's rows byte-exact
  (`tests/index-element-alias-unfolded.test.ts:833`, `:859`, `:971`, `:1003`);
  any fix here updates those four deliberately.
```
`:993-994`: "- **Discharge notes appended:** none. 0143's own record is untouched; this / record names it as face 1's owner."

Searches run this session:
- `git log --format='%h %ad %s' --date=short -S"restated for bug 0135" -- tests/index-element-alias-unfolded.test.ts` → 1 hit, `1da5115b 2026-08-22 fix(bug-0135): fence the index sentinel out of TypeEnv resolution — v0.202.0`.
- `git show 1da5115b -- tests/index-element-alias-unfolded.test.ts | grep -E '^[-+].*(it\(|toEqual|describe\()'` → `-).toEqual(["theta/parse/schema-case-mismatch", "theta/parse/non-string-array-join"]);` / `+).toEqual(["theta/parse/schema-case-mismatch"]);`, the same pair for d15 with `let-rhs-type-mismatch`, and the d13/d15/describe title rewrites.
- `grep -c 0135 docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md` → 0.
- `git log --format='%h %ad %s' --date=short -- docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md` → last commit 6942ef27 (bug 0136, 2026-08-17). 1da5115b is dated 2026-08-22, so nothing touched 0125 afterwards.

## Why this is a problem
Residual 2 tells a reader that the collision is open and that d13/d15 pin it firing. The pinned cells now assert the codes are absent, and the collision was closed by a named later fix. 0125 already follows the house convention for exactly this event twice. It has "## Discharge note — the group (f) tripwire fired, and was answered (bug 0081, 0.83.0)" (`:1441`), written because "two sentences in its §Fix record no longer hold", and "## Discharge note — this fix record's residual 3 is closed (bug 0136, 0.106.0)" (`:1493`). Residual 2's closure has no such note. The 0.76.0 measurement is not disputed. The removed `toEqual([... "theta/parse/non-string-array-join"])` in 1da5115b shows it held then. Only the pointer's current resolution is at issue.

## Suggested direction (non-binding, optional)
A dated discharge note on 0125, in the shape of its 0081/0136 notes, recording that 1da5115b closed residual 2 and restated d13/d15. The equivalent witness is d13/d15 as they stand (`:923-949`, `:958-976`), with d14/d16 unchanged as controls.

## False-positive check
- Representations covered: bug-doc Fix/Residual pins (three 0125 sites quoted); test titles (d13/d15 and the group `describe`, before/after via `git show`); test file name (`tests/index-element-alias-unfolded.test.ts` exists); coverage matrix (not cited by 0125); AGENTS.md gates (not a gate claim); CHANGELOG (corroboration only; `CHANGELOG.md:3239` reads "0125's d13/d15 restated under this fix's authority", not relied on).
- "neither theta registers" (`:1071`, `:1267-1268`) still holds, because `schema-case-mismatch` is `E`. The decayed parts are the two named codes and "unchanged".
- Other commits that moved this witness were checked separately. 76489c61 (bug 0262) re-vehicled `Nope` → `QueryError` in the same rows with the subject preserved (file header `:39-48`). It is covered for this shard in finding 01's same-sha check. 28c5c72b (bug 0157) re-pinned group (f) f3/f5. 0125's latest word on group (f) is its bug-0081 note, whose table is explicitly dated "At 0.83.0" (`:1457`), so that is not filed.
- No pending candidate cites bug 0125's residual 2 or bug 0135.

## Triage
verdict: questionable — decay verified: 0125:1069-1071, :1211-1212 and :1262-1269 (residual 2, "collision is unchanged", d13 draws non-string-array-join, d15 draws let-rhs-type-mismatch … got index) are contradicted by tests/index-element-alias-unfolded.test.ts d13 (:923) and d15 (:958). Both now toEqual(["theta/parse/schema-case-mismatch"]) and toBeUndefined() the two named codes, under the describe "…is refused and therefore decides no check (restated for bug 0135)". All stated searches reproduce: -S hit = 1da5115b 2026-08-22, the git show toEqual/it/describe diff lines match, grep -c 0135 in 0125 = 0, 0125's last commit is 6942ef27 2026-08-17, and 0135:993 reads "Discharge notes appended: none". 1da5115b restated the rows but deleted nothing, and the pointers still resolve to the same d13–d16 rows. So no re-point exists, and the repair (a discharge note saying residual 2 is closed, or rewording it) is new record wording for a human to rule on. No same-sha or same-root duplicate in intake/issues (only d10-01 mentions 0125's d13–d16, and only for 76489c61 re-vehicling) (triage: claude-opus-5-5)
