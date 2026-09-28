---
id: pending
title: "Bug 0195's Status says cell C1 \"stays as the permanent tripwire (now pinning zero REFERENCES, not zero callers)\" after the 0.197.0 deletion, but C1 still exempts any `export function checkArrayCommonType(` line, and 30c0cb67 changed only its comments"
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0195-control-flow-empty-array-iterand-claim-false.md:3-16
  - tests/for-empty-array-iterand-adjudication.test.ts:327-371
  - tests/for-empty-array-iterand-adjudication.test.ts:56-58
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0195's Status says cell C1 "stays as the permanent tripwire (now pinning zero REFERENCES, not zero callers)" after the 0.197.0 deletion, but C1 still exempts any `export function checkArrayCommonType(` line, and 30c0cb67 changed only its comments

## Observation
Bug 0195's Status paragraph records the 0.197.0 deletion limb. It says witness cell C1 now pins "zero REFERENCES, not zero callers". C1's body still skips every `src/` line containing `export function checkArrayCommonType(`, so it counts calls and imports but never a declaration. Commit 30c0cb67, which landed the deletion, edited only two comment blocks in the witness. C1's executable lines are the ones written at 0.190.0 for the "zero callers" pin. So re-adding the deleted exported declaration without a caller keeps C1 green. The claim is not true as worded: C1 still pins zero callers, not zero references.

## Evidence
Claim side, `docs/bugs/0195-control-flow-empty-array-iterand-claim-false.md:3-16`:
```
- **Status:** fixed (0.190.0) — **route (a)**; see `## Fix limb completed (0.197.0)

The §Fix route-(a) deletion limb deferred at 0.190.0 (the owning lane held
`src/parser/type-grammar.ts`) landed as a parent edit under this report's own
authority (the 0200-retirement precedent): `checkArrayCommonType`,
`ArraySinkContext`, `ArrayLiteralSite` and the file-header restatement of the
refuted rule are deleted together (type-grammar.ts 1325→1245 lines); the V2a-T
seam-contract cell in `tests/type-grammar.test.ts` is deleted with its imports;
cell C1 stays as the permanent tripwire (now pinning zero REFERENCES, not zero
callers); the two witness comments describing the seam as “retained unwired”
are updated. The registry row `theta/parse/array-no-common-type` is OUTSIDE
this report's settled scope and survives; the 0230 corpus gate still counts it
asserted (this witness's C1 quotes the literal), so no carve-out entry is owed.
Gates at 0.197.0: suite 386/8005, typecheck, lint clean.
```

Evidence side, `tests/for-empty-array-iterand-adjudication.test.ts:342`, `:349-363`, `:368`:
```
  it("C1: no `src/` file calls or imports `checkArrayCommonType`", () => {
...
    // The declaration itself is admissible; a USE is not. `checkArrayCommonType`
    // takes an `ArraySinkContext` whose `for-iterand` and `none` members exist
    // only to make an empty literal fire, so any production reference to it is
    // a wiring of the refusal this adjudication rules is not owed.
    const uses: string[] = [];
    for (const rel of files) {
      const lines = readFileSync(path.join(REPO_ROOT, rel), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("checkArrayCommonType")) {
          return;
        }
        if (line.includes("export function checkArrayCommonType(")) {
          return;
        }
        uses.push(`${rel}:${i + 1}: ${line.trim()}`);
...
      "C1: `checkArrayCommonType` (src/parser/type-grammar.ts:1224) has no production caller and must keep none under route (a). …
```
The section comments (`:56-58`, `:327-330`) were reworded by 30c0cb67 to "this cell reds if any `src/` file reintroduces a reference". The executable exemption above, the in-cell comment ("The declaration itself is admissible"), the title ("calls or imports") and the failure message ("has no production caller") were left as they were.

Searches run this session:
- `git show 30c0cb67 --stat` → `tests/for-empty-array-iterand-adjudication.test.ts | 12 ++--`. `git show 30c0cb67 -- tests/for-empty-array-iterand-adjudication.test.ts` → two hunks, both inside `//` comment blocks (`@@ -53,8` and `@@ -350,10`). No line of the `it("C1: …")` body changed.
- `grep -rn "checkArrayCommonType" src | wc -l` → 0. The deletion itself is current, so this filing concerns only what C1 pins.
- `grep -n "checkArrayCommonType" tests/for-empty-array-iterand-adjudication.test.ts` → 6 hits (`:58`, `:329`, `:342`, `:349`, `:357`, `:360`). `:360` is the declaration exemption.
- `grep -rn "checkArrayCommonType" tests src | grep -v for-empty-array-iterand-adjudication` → 0 hits, so C1 is the only witness of the "zero references" property.

## Why this is a problem
The Status sentence draws an explicit contrast, "zero REFERENCES, not zero callers". That wording says the tripwire got stronger when the seam was deleted: re-adding the function would red. The recorded evidence is weaker. C1 still admits the declaration, which is exactly the artefact the same sentence says was deleted, so a re-added `export function checkArrayCommonType(…)` with no caller passes. The only witness named for the property asserts the pre-deletion "zero callers" strength.

## Suggested direction (non-binding, optional)
Either reword the Status parenthetical to the strength C1 asserts (zero calls or imports; a declaration is admitted), or strengthen C1 to match the wording (no `checkArrayCommonType` token under `src/` at all) and update its title and failure message. The fix stage chooses.

## False-positive check
- Representations covered: the bug-doc claim (Status paragraph quoted); test file name and test title (`tests/for-empty-array-iterand-adjudication.test.ts`, `it("C1: no \`src/\` file calls or imports …")`); coverage matrix (0195 cites none); AGENTS.md gates (no gate asserts the absence of `checkArrayCommonType`; the 0230 corpus gate the Status mentions concerns the registry code literal, not this symbol); CHANGELOG (not relied on).
- The claim's TRUTH about the tree (zero references today) holds: 0 hits under `src/`. The filing concerns only the witness strength the wording asserts.
- The other claims in the same paragraph resolve: the V2a-T `array-no-common-type` cell is gone from `tests/type-grammar.test.ts` (no `checkArrayCommonType` hit there; the remaining `V2a-T` describes are generic-arity, void, Result-in-schema, literal-sublanguage). `grep -rn -i "retained unwired" tests src docs/spec_topics` → 0 hits, so the two comments were updated. C1's failure message does quote `theta/parse/array-no-common-type`.
- C1's failure message still cites `src/parser/type-grammar.ts:1224` for a deleted function. That stale test string is D7's (routing note), not this filing's subject.
- No pending candidate cites bug 0195 (grep over quality/intake and quality/issues → 0 hits).

## Triage
verdict: questionable — accounting verified: bug 0195 Status (:3-16) says C1 is "now pinning zero REFERENCES, not zero callers", but C1 (tests/for-empty-array-iterand-adjudication.test.ts:342-371, default suite) still skips any line containing `export function checkArrayCommonType(` (:360), and its comment ("The declaration itself is admissible"), title ("calls or imports") and failure message ("has no production caller") are unchanged. `git show 30c0cb67` touches only two `//` comment hunks in that file (@@ -53,8, @@ -350,10). src has 0 hits today and no other witness exists (0 hits outside this file). So C1 witnesses zero callers, not zero references. Under D10 overstated-strength, rewording the record or strengthening the witness is a human ruling (triage: claude-opus-5-5)
