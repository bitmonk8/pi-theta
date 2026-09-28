---
id: PTQ-1604
title: "Bug 0097's 0.99.0 fix record names \"the bug-0096 witness `tests/discriminator-field-classifier-brace-group.ts`\" as an importer of the re-export, but no file of that name has ever existed; the witness is `…brace-group.test.ts`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0097-params-brace-union-rhs-one-field-list.md:771-775
  - docs/bugs/0097-params-brace-union-rhs-one-field-list.md:926-928
  - tests/discriminator-field-classifier-brace-group.test.ts:4
  - docs/bugs/0096-discriminator-field-classifier-naive-brace-test.md:773
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0097's 0.99.0 fix record names "the bug-0096 witness `tests/discriminator-field-classifier-brace-group.ts`" as an importer of the re-export, but no file of that name has ever existed; the witness is `…brace-group.test.ts`

## Observation
Bug 0097's `## Fix (0.99.0)` section argues that `body-type-lowering.ts`'s re-export of `isSingleEnclosingBraceGroup` is load-bearing. It cites three importers, one of them "the bug-0096 witness `tests/discriminator-field-classifier-brace-group.ts`". That path has never existed in the repository's history. The bug-0096 witness is `tests/discriminator-field-classifier-brace-group.test.ts`, and it does import `isSingleEnclosingBraceGroup` from `../src/parser/body-type-lowering` at `:4`. The same record uses the correct `.test.ts` filename at `:927`. The mis-stated path was written by the fix commit ad27694f.

## Evidence
Claim side, `docs/bugs/0097-params-brace-union-rhs-one-field-list.md:771-775`:
```
  - `src/parser/body-type-lowering.ts` — imports the three back and
    RE-EXPORTS `isSingleEnclosingBraceGroup` (`:34`). The re-export is load
    bearing, not cosmetic: `theta-document.ts`, `query-schema-lowering.ts` and
    the bug-0096 witness `tests/discriminator-field-classifier-brace-group.ts`
    reach the predicate at that path, and no importer's import line changed.
```
The same record's correct spelling, `:926-928`:
```
  BOUND: six citations in two files, plus two module attributions in two further
  files (`inline-object-nested-lowering.test.ts`, `discriminator-field-classifier-brace-group.test.ts`)
  falsified not by line drift but by THIS change's function move — comment text
```
Equivalent witness, `tests/discriminator-field-classifier-brace-group.test.ts:4`:
```
import { isSingleEnclosingBraceGroup } from "../src/parser/body-type-lowering";
```
Bug 0096's own record names the same file, `docs/bugs/0096-discriminator-field-classifier-naive-brace-test.md:773`: "**Offline lock.** `tests/discriminator-field-classifier-brace-group.test.ts`, 9 …".

Searches (run this session):
- Test file names: `ls tests | grep -c 'discriminator-field-classifier-brace-group'` → 1 (the `.test.ts` file only).
- History of the stated path: `git log --oneline --all -- tests/discriminator-field-classifier-brace-group.ts | wc -l` → 0 (never existed).
- Repo-wide pins of the stated path: `grep -rn 'discriminator-field-classifier-brace-group\.ts' docs tests` → 1 hit, the 0097 record `:774`.
- Origin: `git show ad27694f -- docs/bugs/0097-params-brace-union-rhs-one-field-list.md | grep -c '^+.*discriminator-field-classifier-brace-group\.ts\`'` → 1 (written by the 0.99.0 fix commit).
- Test titles: `grep -n 'bug 0096' tests/discriminator-field-classifier-brace-group.test.ts` → `:9` header and `:293` `describe("bug 0096 item 1 — the brace predicate pair and the classification it guards"`, which confirms it is the bug-0096 witness.
- Coverage matrix / AGENTS.md gate names: this pointer cites neither; not applicable. CHANGELOG: not relevant to a mis-stated filename.

## Why this is a problem
The record supports its "the re-export is load bearing" claim partly by pointing at a test that imports the predicate through that path. As written, that pointer resolves to no file. The evidence exists under the `.test.ts` name, so following the citation as stated breaks the chain even though the claim holds.

## Suggested direction (non-binding, optional)
Point `:774` at `tests/discriminator-field-classifier-brace-group.test.ts`, the spelling the same record already uses at `:927`.

## False-positive check
- Representations covered: the bug-doc Fix pin (quoted); test file names (`ls` → 1, the `.test.ts` only); history of the stated path (0 commits); repo-wide occurrences of the stated path (1, this record); test titles (the `bug 0096` describe at `:293`); bug 0096's own record (`:773`). Coverage matrix and AGENTS.md gates are not involved.
- The record's main witnesses are unaffected: `tests/params-brace-union-rhs-lowering.test.ts` exists (`CONTROL (a10)` `:700`, `RED (b12)` `:973`, `RED (e3)` `:1223`), and the live leg's comment block sits at `tests/live/live-production-acceptance.test.ts:6638-6660`.
- Not citation form: the pointer's form is fine. Its target filename never existed, and no gate checks file existence for bug-doc path mentions.
- Scope note: the same sentence's `query-schema-lowering.ts` is a source-module attribution, not a witness pointer (015b61f2 later moved it `src/runtime` → `src/parser`). It is not counted here.

## Triage
verdict: confirmed — decayed pointer reproduces: 0097 :774 cites `tests/discriminator-field-classifier-brace-group.ts`, and that path has no history (git log --all → 0) and a single repo-wide hit (this record). ad27694f wrote it (1 added line), and the file named `….test.ts` was already there (added f505fc4a, v0.73.0). The equivalent is unambiguous and verified: `tests/discriminator-field-classifier-brace-group.test.ts` exists, imports isSingleEnclosingBraceGroup from ../src/parser/body-type-lowering at :4, and is the bug-0096 witness (describe "bug 0096 item 1 — the brace predicate pair and the classification it guards" :293). The same record spells it correctly at :927, and 0096 :773 does too. The fix is a mechanical re-point with no rewording. Minor drift: the case-sensitive `grep 'bug 0096'` hits :293/:456/:462/:562/:839, not :9, which reads "Bug 0096". No other intake/PTQ tracks ad27694f or this path (triage: claude-opus-5-5)
