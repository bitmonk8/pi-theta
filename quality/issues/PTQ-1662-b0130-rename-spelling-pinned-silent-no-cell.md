---
id: PTQ-1662
title: "Bug 0130's fix record says the `as \"WireName\"` rename spelling at a `let` annotation is \"measured and pinned silent\", but no test cell in the tree pins it, then or now, and the only default-suite `let`-annotation rename cell asserts a refusal"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md:1257-1260
  - docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md:1184-1186
  - tests/let-annotation-inline-object-compat.test.ts:600-606
  - tests/inline-object-wire-name-rename-refusal.test.ts:384-388
  - tests/inline-object-wire-name-rename-refusal.test.ts:426-434
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0130's fix record says the `as "WireName"` rename spelling at a `let` annotation is "measured and pinned silent", but no test cell in the tree pins it, then or now, and the only default-suite `let`-annotation rename cell asserts a refusal

## Observation
Bug 0130's `## Fix (0.160.0)` *Residuals* item 4 lists an `as "WireName"` rename among the spellings the strict interior parser declines, and it says "Each is measured and pinned silent". The record's witness is `tests/let-annotation-inline-object-compat.test.ts`. It contains no cell whose source carries an inline-object rename, either at the fix commit `09eeec4e` or today. Across all of `tests/`, no `let <name>: {… <field> as "…" …}` source literal existed at `09eeec4e`, and none exists outside `tests/live/**` today. The default-suite cell that does build a rename at the `let` annotation position is bug 0160's (added by `9eb410df`, v0.172.0). It asserts `theta/parse/renamed-inline-field-name`, not silence, and 0130 carries no note of it.

## Evidence
Claim side, `docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md:1257-1260` (re-read before filing):
```
  4. **Grammar-admitted spellings the strict interior parser declines**, all in
     the SAFE direction (status-quo silence, never a wrong refusal): a quoted
     key (`{"a": string}`), an `as "WireName"` rename, a generic application in
     a field type (`Result<A, B>`). Each is measured and pinned silent.
```
The record's named witness, `:1184-1186`:
```
- Gates: witness `npx vitest run tests/let-annotation-inline-object-compat.test.ts`
  → `Test Files 1 passed (1) / Tests 51 passed (51)`; full default suite
  `npm test` → `Test Files 351 passed (351) / Tests 7035 passed (7035)`;
```
The witness's decline group header, `tests/let-annotation-inline-object-compat.test.ts:600-606`, lists the interiors it covers, and a rename is not among them:
```
// (e) R2's boundary — the `{}` and malformed-interior declines.
//
// WHY: bug 0045's own key enumerates the interiors the capture admits
// (`{ a }`, `{ a: }`, `{ "a": string }`), and a fix must not mint a bogus field
// set from text the type grammar does not spell. Every cell here is silent, or
// carries ONLY the line another rule already owns.
```
The only default-suite `let`-annotation rename cells, `tests/inline-object-wire-name-rename-refusal.test.ts:384-388` and `:426-434`:
```
function positionSources(type: string): ReadonlyArray<readonly [string, string, string]> {
  return [
    ["@<T> annotation root", annotSrc(type), "bug0160.theta"],
    ["let annotation", body(`let x: ${type} = 1`), "bug0160.theta"],
...
function positionRows(): Cell[] {
  const out: Cell[] = [];
  for (const [label, src, path] of positionSources(REN2)) {
    out.push({ cell: `c1 ${label}`, src, path, expected: [REN("a"), REN("b")] });
  }
  for (const [label, src, path] of positionSources(REN1)) {
    out.push({ cell: `c2 ${label}`, src, path, expected: [REN("a")] });
  }
```
Here `REN1 = '{a as "w": integer}'` (`:336`). So cell `c2 let annotation` is `let x: {a as "w": integer} = 1`, and it asserts one `renamed-inline-field-name` line.

Searches, one per representation, all run in this session:
- Witness cell sources, fix commit: `git show 09eeec4e:tests/let-annotation-inline-object-compat.test.ts | grep -cE '[A-Za-z0-9_] as \\?"'` → 1. The one hit, `:541`, is prose ("defers, exactly as " +), not a rename.
- Witness cell sources, today: `grep -nE '[A-Za-z0-9_] as \\?"' tests/let-annotation-inline-object-compat.test.ts` → 1. The hit is the same prose line (now `:543`).
- Test sources tree-wide, fix commit: `git grep -nP 'let \w+: \{[^}]*\w as \\?"' 09eeec4e -- tests | wc -l` → 0.
- Test sources tree-wide, today, default suite: `git grep -nP 'let \w+: \{[^}]*\w as \\?"' -- tests ':!tests/live' | wc -l` → 0. With `tests/live/**` included → 10, all in bug 0160 / escaped-quote live and H9a files, which assert refusal.
- Templated `let x: ${…}` builders at the fix commit: `git grep -lF 'let x: ${' 09eeec4e -- tests` → 5 files. Two of them carry rename strings: `inline-object-duplicate-field-name.test.ts` and `inline-object-field-name-comparison-key.test.ts`. Their rename rows are duplicate-key cells that assert `duplicate-inline-field-name` lines. The `[]` rows (`inline-object-duplicate-field-name.test.ts` d4, rows at `:794-795` of that commit) are built with `annotSrc`, which is `let r = @<T>\`hi\``, the query annotation and not the `let` annotation.
- Test titles: `grep -nE 'it\(.*as \\?"' tests/let-annotation-inline-object-compat.test.ts` → 0.
- Test file names: `git ls-files tests | grep -i rename` → 9 files. None is bug 0130's. The one default-suite inline-object rename file is `tests/inline-object-wire-name-rename-refusal.test.ts` (bug 0160, refusal).
- Bug-doc witness lines: `grep -c 'WireName' docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md` → 1 (the claim line itself). `grep -c "0130" docs/bugs/0160-inline-object-wire-name-rename-unparsed.md` → 0.
- Coverage matrix: `grep -c "0130\|WireName" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 0 and 0.
- AGENTS.md gate names: `grep -ci "rename" AGENTS.md` → 0.
- CHANGELOG (corroboration only): `grep -n "0130" CHANGELOG.md` → 3 hits (:2364, :2908, :3792). They are coordination/discharge mentions from other bugs, and none names a rename pin.

## Why this is a problem
"Pinned" asserts that a test cell holds the stated disposition. For the rename spelling, no cell held it at the fix commit and none holds it now. So the claim is memory of a scratch measurement worded as a standing pin. The one current default-suite cell for that spelling at that position asserts a refusal. A reader who relies on residual 4 to learn how a rename behaves at a `let` annotation is told "silent", and no evidence backs that. The current witness says otherwise.

## Suggested direction (non-binding, optional)
Reword residual 4's rename clause to what the evidence supports, as a dated note in the house shape. That means either citing bug 0160's `c2 let annotation` cell for the current disposition, or marking the silence as a fix-time measurement with no standing pin.

## False-positive check
- Representations covered: witness cell sources (fix commit and today), tree-wide test sources (fix commit, today's default suite, and today including live), templated position builders, test titles, test file names, bug-doc witness lines (0130 and 0160), coverage-matrix rows (both matrix pages), AGENTS.md gate names, and CHANGELOG entries (corroboration only). Each search, with its command and hit count, is listed under Evidence.
- Search blind spots checked: templated sources are covered by the `let x: ${` builder check. Query-annotation `[]` rows were checked and excluded as a different position. The `\bas\b` ERE form was re-run as `-P` after `git grep -E` returned 0 on a pattern it may not honour.
- The other two spellings of residual 4 are not part of this finding. The generic spelling is pinned by e7.5, whose comment names "this report's *Residuals* item 4 set". The quoted-key pin's flip is filed separately as `qw20260928081617-d10-01-82052a9d-b0130-e3-quoted-key-pin-flipped.md`, because it has a different root cause (a later commit re-pinned an existing cell).
- Not an honesty marker: the sentence is unhedged ("measured and pinned"), and nothing else in the record marks the rename as pending or unpinned.
- Duplicate check: no pending or filed candidate in the listing names bug 0130's residual 4 or the rename spelling.
- Claim truth not adjudicated: whether a rename at a `let` annotation should be silent is bug 0160's matter. This finding covers only the missing pin.

## Triage
verdict: questionable — witnesses are genuinely absent, so the repair means rewording or retracting 0130's claim, and that is a human's call. The claim reproduces: 0130:1257-1260 residual 4 says the `as "WireName"` rename is "measured and pinned silent", and :1184 names the witness let-annotation-inline-object-compat.test.ts. The excerpts at :600-606, and at 0160's refusal test :336/:384-388/:426-434 (the c2 `let annotation` cell asserts one renamed-inline-field-name line, added by 9eb410df), reproduce. So do the stated searches: witness `as "` grep gives 1 prose hit both at 09eeec4e and at HEAD; the tree-wide let-rename `-P` grep gives 0 at 09eeec4e, 0 in today's default suite, and 10 with live; the `let x: ${` builders give 5 files; `git ls-files tests \| grep -i rename` gives 9 files; WireName in 0130 gives 1; 0130 in 0160 gives 0; both matrices give 0/0; rename in AGENTS.md gives 0; the witness it() titles give 0. My own checks: every rename row that reaches the let position at 09eeec4e is a duplicate-key cell, not a silence pin (inline-object-field-name-comparison-key positions()/D1 table, inline-object-duplicate-field-name :793-795 via annotSrc). No describe/it title in the witness names a rename or wire name, and schema-field-name-case f5 is a schema field, not a let annotation. One miscount: the corroboration-only `grep -n "0130" CHANGELOG.md` gives 6 hits, not 3 (:3793, :3867 is 0130's own 0.160.0 entry, and :3944 were missed). None of the missed entries names a rename pin, so the absence claim stands. The candidate also left out the `## Triage` heading. Not a duplicate: d10-01-82052a9d is the quoted-key flip, which has a different root cause (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (unwitnessed-claim). APPEND EXACTLY the following block at the very end of docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md (after the existing notes, independent of the e3 note ruled in the same wave), nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

Residual 4 above says the wire-name rename spelling at a let annotation is measured and pinned silent in the named witness. No test cell pinned that spelling, at the fix commit or since: the witness file carries the rename only in prose, and every rename row that reaches the let position in the tree was a duplicate-key cell. Measured stands (the observation was a fix-time measurement); pinned is retracted. The spelling has since been settled the other way: bug 0160 added the c2 let-annotation cell asserting one renamed-inline-field-name refusal (tests/inline-object-wire-name-rename-refusal.test.ts).
