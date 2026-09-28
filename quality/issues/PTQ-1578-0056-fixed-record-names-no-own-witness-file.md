---
id: PTQ-1578
title: Bug record 0056 (Status fixed 0.85.0) cites its own witness cells b5, d6 and d12 and its "Witness RED before / GREEN after" gates without ever naming the witness file its fix commit added, tests/params-literal-sublanguage-lowering.test.ts
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md:3
  - docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md:1003-1008
  - docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md:1030-1043
  - docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md:969
  - docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md:1090
  - tests/params-literal-sublanguage-lowering.test.ts:10-12
  - tests/params-literal-sublanguage-lowering.test.ts:548
  - tests/params-literal-sublanguage-lowering.test.ts:712
  - tests/params-literal-sublanguage-lowering.test.ts:832
  - docs/bugs/0055-literal-union-lowering-omits-type-string-vs-subs1.md:198
  - docs/bugs/0058-fromless-export-form-parses-without-spec-production.md:272
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug record 0056 (Status fixed 0.85.0) cites its own witness cells b5, d6 and d12 and its "Witness RED before / GREEN after" gates without ever naming the witness file its fix commit added, tests/params-literal-sublanguage-lowering.test.ts

## Observation
`docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md` has Status `fixed (0.85.0)`. Its `## Fix (0.85.0)` section names its witness only by cell ids and aggregate counts: "Witness RED before", "Witness GREEN after", "cell `d12`", "cell `b5` … against the file's independent oracle", "Cell `d6`". It never says which file holds those cells. The file names that do appear in the Fix section all belong to other bugs: the cells re-pinned in 0055/0041/0102/0043's files, plus 0035's, 0039's and 0052's locks. The record also names the live H8a file. The fix commit `81600080` added `tests/params-literal-sublanguage-lowering.test.ts` (1179 lines). That file is the default-suite witness: header "Bug 0056 — …", describe blocks "bug 0056 (0)" through "(f)", and cells b5, d6 (group (d)) and d12. The record's siblings in this shard each name their own witness file (0052:263, 0053:680, 0055:198, 0058:272).

## Evidence
**Claim side:** docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md:3
```
- **Status:** fixed (0.85.0).
```
docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md:1003-1008
```
- **Gates**
  - Witness RED before: `npx vitest run` → `Test Files 5 failed | 274 passed
    (279)`, `Tests 24 failed | 4376 passed (4400)`, every failure observing the
    permissive `{}` / `{"anyOf":[{},{}]}` / `{"type":"null"}` or a stale slug.
  - Witness GREEN after: `npx vitest run` → `Test Files 279 passed (279)`,
    `Tests 4402 passed (4402)`.
```
docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md:1030-1043 (excerpt)
```
    reachability nothing pinned. Closed by adding cell `b5` (`{m: 42}` and
    `{m: 1.5}`, both sides of the `Number.isInteger` split, one minted name per
    source text at three positions, against the file's independent oracle).
- **Verification**: SOLID, zero findings.
  - *The witness can red.* Two targeted neutralisations, each restored
...
    Dropping `-?` from `parseLiteralArm`'s regex → exactly 1 failed, cell
    `d12`.
```
The other two file-less cell pins are :969 ("Pinned in both directions by cell `d12`.") and :1090 ("Cell `d6` was re-derived under 0164 §Fix").

**Evidence side: the witness that exists.** tests/params-literal-sublanguage-lowering.test.ts:10-12
```
// Bug 0056 — theta has ONE type grammar and FOUR positions that lower a type
// expression to JSON Schema, and only three of them own a literal sublanguage
// (docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md).
```
The cells the record names are at :548 `it("RED (b5): a nested integer literal and a nested decimal literal each hoist one name …`, :712 `describe("bug 0056 (d) — every source the literal recogniser declines keeps its bytes, except d4/d5 (bug 0184 §Fix) and d6 (bug 0164 §Fix)"`, and :832 `it("d12: \`-1 | 1\` at \`params:\` is a measured consequence of sharing one recogniser …`.

**House format:** the sibling records name their own witness file on a Witness / Offline-lock line: 0052:263 "Witness `tests/inline-object-duplicate-field-name.test.ts` 49/49", 0053:680 "**Offline lock.** `tests/annotation-root-brace-union-lowering.test.ts`, 33", 0055:198 "**Offline lock.** `tests/literal-union-string-enum-emission.test.ts` (new, 23", 0058:272 "**Offline lock.** `tests/import-export-from-clause-required.test.ts` (20 tests,". Search: `grep -n -E 'Offline lock|Witness \`tests/' docs/bugs/0052-*.md docs/bugs/0053-*.md docs/bugs/0055-*.md docs/bugs/0058-*.md` → 4 hits, one per record. The same search over 0056 → 0.

**Searches run in this session, one per representation:**
- Bug-doc Witness line / filename in the record: `grep -c "params-literal-sublanguage" docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md` → 0.
- Test filenames: `ls tests | grep -i "params-literal"` → 1 (`params-literal-sublanguage-lowering.test.ts`).
- Test titles: `grep -rl 'describe("bug 0056 (' tests` → 1 file (`tests/params-literal-sublanguage-lowering.test.ts`).
- Fix commit: `git show --stat 81600080` lists `tests/params-literal-sublanguage-lowering.test.ts | 1179 ++++`, a new file in the `fix(bug-0056)` commit.
- Coverage matrices: `grep -c "0056" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 0 and 0.
- AGENTS.md gate names: `grep -c "0056\|params-literal-sublanguage" AGENTS.md` → 0.
- CHANGELOG (corroboration only): the `## [0.85.0]` entry (CHANGELOG.md:5886) names no test file. The only CHANGELOG mention of the file is CHANGELOG.md:4166 in a later entry ("`params-literal-sublanguage-lowering` untouched"), which is 0099's.

## Why this is a problem
The record has a fixed Status, and its Fix section rests the claim on "the witness", its RED/GREEN runs and three named cells. Yet it never says where the witness is. A reader following "cell `d12`" or "the file's independent oracle" from the record has no path to follow. Other files in the same record carry their own cells, so a bare id does not identify the file. For example, `tests/literal-union-string-enum-emission.test.ts` also has a d-group and an e1. The store's own format, visible in the four sibling fixed records, puts the witness file on a Witness / Offline-lock line. A default-suite witness that asserts the claimed observables does exist.

## Suggested direction (non-binding, optional)
Add a witness line to 0056's `## Fix (0.85.0)` naming `tests/params-literal-sublanguage-lowering.test.ts` (describe blocks "bug 0056 (0)"–"(f)"), plus the H8a cell the record already names. Leave the claim wording as it is.

## False-positive check
- **Is the witness named elsewhere in the record under another spelling?** `grep -c "params-literal-sublanguage"` over the record → 0. Every `.test.ts` the record does name (listed by `grep -n "\.test\.ts"`) is another bug's file or the live H8a file.
- **Is the witness actually 0056's?** The file was added by `81600080 fix(bug-0056)`. Its header cites the 0056 record, and every describe title begins "bug 0056".
- **Honesty marker?** The record carries no "witness: none" or pending marker. By contrast, 0057 in this shard says "Witness: none, and none owed", and I am not filing 0057.
- **Gate-owned?** Citation-form gates check the grammar of citations that exist. None checks whether a fixed record names its own witness.
- **Already filed:** PTQ-1517 is the same class for bug 0001. No pending candidate cites 0056.

## Triage
verdict: confirmed — every stated search reproduces. `params-literal-sublanguage` appears 0 times in 0056, which has Status fixed (0.85.0). The sibling Offline-lock/Witness lines are real: 0052:263, 0053:680, 0055:198, 0058:272, while the same grep over 0056 finds 0. Coverage matrices and AGENTS.md each hit 0. CHANGELOG mentions the file only at :4166. 0056's cited `.test.ts` names all belong to other bugs or to live H8a. The witness exists: tests/params-literal-sublanguage-lowering.test.ts, added by 81600080 fix(bug-0056) (1179 lines, the only commit that added it). Its header at :10-12 cites the 0056 record. Its describe blocks are "bug 0056 (0) — the independent `__inline_<slug>` oracle" (:309), "(a) — one type expression, one fragment, at all four positions" (:403), "(b) — a nested literal lowers alike…" (:460), "(c) — the production validator over the lowered `params:` document" (:626), "(d) — every source the literal recogniser declines keeps its bytes, except d4/d5 … and d6 …" (:712), "(e) — a boolean literal at `params:` loads and lowers" (:892) and "(f) — the enforcing fragment reaches the model-facing schema" (:941). The record's cells are there: `RED (b5)` at :548, d6 in group (d) at :712, and `d12: \`-1 | 1\` at \`params:\`…` at :832. No honesty marker and no duplicate in intake or issues (triage: claude-opus-5-5)
