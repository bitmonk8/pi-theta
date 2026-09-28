---
id: PTQ-1579
title: Fix record 0294's "witness run (offline 15/15 …)" names no offline witness file; the only witness it names is the live-only cell tests/live/b0294-callee-propagated-invoke-infra-live-cell.test.ts
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0294-callee-propagated-invoke-infra-unwrapped-misattributed.md:265-282
  - docs/bugs/0294-callee-propagated-invoke-infra-unwrapped-misattributed.md:294-296
  - tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts
  - tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts
  - tests/live/b0294-callee-propagated-invoke-infra-live-cell.test.ts
  - CHANGELOG.md:1864
  - docs/bugs/0293-invoke-callee-load-parse-causes-shifted.md:256-257
  - docs/bugs/0292-validation-errors-array-not-canonically-ordered.md:193-199
sites: 2
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Fix record 0294's "witness run (offline 15/15 …)" names no offline witness file; the only witness it names is the live-only cell tests/live/b0294-callee-propagated-invoke-infra-live-cell.test.ts

## Observation
Bug 0294 has Status `fixed (0.326.0)`. Its `## Fix (0.326.0)` reports an offline witness run of 15/15, revert-proved, and a residual about "the `(F)` witness suite". Neither passage names the file(s) that witness lives in. The only test path anywhere in the record is the live cell `tests/live/b0294-callee-propagated-invoke-infra-live-cell.test.ts`, which the preflight gate does not run. Two offline files, `tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts` and `tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts`, were added by the fix commit abbb9b30. At that commit they held 10 + 5 = 15 `it(` cells, which matches the record's count, but the record does not point to them. Sibling records in the same shard (0292 and 0293) name their offline witness files in their Fix sections.

## Evidence
Claim side, re-read immediately before filing:

`docs/bugs/0294-callee-propagated-invoke-infra-unwrapped-misattributed.md:265-267`:
```
- Gates: witness run (offline 15/15 + live 1/1, each revert→RED→restore→GREEN);
  full default suite 507 files / 9769 tests green; `npm run typecheck` clean;
  `npm run lint` clean.
```
`:276-282`:
```
- Verification: SOLID. Obl 1 — witnesses genuinely witness
  (revert→RED→restore→GREEN, in-process + subagent legs offline, byte-exact
  restoration; live cell both directions under the live-lock). Obl 2 — suite
  507/9769. Obl 3 — the new live cell
  `tests/live/b0294-callee-propagated-invoke-infra-live-cell.test.ts` drives the
  real AgentSession two-hop `invoke_infra` (`load_failure`) cascade, green and
  red-provable. Obl 4 — typecheck + lint clean.
```
`:294-296`:
```
  2. (`test`, non-blocking) the `(F)` witness suite has no explicit
     `return_validation → boundary-minted` cell — that cause rides the tested
     default arm and is exercised end-to-end by the 0187 / 0180 return-refusal
```

Searches, one per representation (all run in this session):
- Bug-doc witness lines: `grep -n "tests/" docs/bugs/0294-callee-propagated-invoke-infra-unwrapped-misattributed.md` → 1 hit (`:280`, the live cell). `grep -n "Witness\|witness" docs/bugs/0294-*.md` → 4 hits (`:66` pre-fix probe prose, `:265`, `:276`, `:294`). None of them names an offline file.
- Test file names: `ls tests | grep -c "b0294"` → 2 (`b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts`, `b0294-callee-propagated-invoke-infra-wrapped.test.ts`). `ls tests/live | grep -c "b0294"` → 1.
- Test titles/comments: `grep -rln "bug 0294\|Bug 0294" tests` → 9 files, including both offline b0294 files and the live cell.
- Cell count at the fix commit: `git show abbb9b30:<file> | grep -cE '^\s*it\('` → 10 (unit) and 5 (wrapped), which is 15 and matches "offline 15/15". Today `grep -cE "^\s*it\(" tests/b0294-*.test.ts` gives 16 and 5, because later commits (e.g. af476df2 bug 0347) grew the unit file.
- Coverage matrix / AGENTS.md: `grep -c "0294" docs/plan_topics/coverage-matrix.md AGENTS.md` → 0 and 0.
- CHANGELOG (corroboration only): `CHANGELOG.md:1864` (the Bug 0294 entry) names all three paths, both offline files and the live cell. The link from the fix record's claim to its gate-proven witness exists only in CHANGELOG, which is outside the audited surface.
- House-format comparison: `docs/bugs/0293-…:256-257` gives "witness `npx vitest run tests/b0293-invoke-callee-cause-partition.test.ts tests/b0293-invoke-callee-containment-fences.test.ts` → 7/7". `docs/bugs/0292-…:193-199` names `tests/b0292-validation-errors-canonical-order.test.ts` (cells A–E).

## Why this is a problem
The record's gate-proven claim ("offline 15/15, each revert→RED→restore→GREEN") has no pointer inside the record. The one witness path it does name is a `tests/live/**` cell that the preflight gate does not run. Someone reading only the fix record would conclude that its named evidence is live-only. They would have to go to CHANGELOG or search the tests to find the default-suite witness that proves the claim. The `(F) witness suite` in residual 2 cannot be traced from the record either.

## Suggested direction (non-binding, optional)
Name `tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts` and `tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts` next to the "offline 15/15" gate line, and say which of them holds the `(F)` suite.

## False-positive check
- The offline witness exists and is gate-covered (the files are in `tests/`, not `tests/live/`). This filing does not claim the evidence is missing, only that the record never names it. The 10 + 5 = 15 count at abbb9b30 confirms these are the files the record means.
- Representations covered: bug-doc witness lines, test filenames (tests/ and tests/live/), test titles/comments, coverage matrix, AGENTS.md gate names, CHANGELOG (corroboration only).
- The live-cell claim (Obl 3) cites a path that exists and is not challenged here. Residual 1 (the subagent-leg parity gap, later addressed by bug 0347) is outside this filing.
- None of the listed pending candidates or accepted issues cites record 0294: `grep -rln "bugs/0294" quality/intake quality/issues` → 1 hit, and that hit is this filing.

## Triage
verdict: confirmed — reproduced: the 0294 Fix section (:265 "offline 15/15", :276-282, :294 "(F) witness suite") names only tests/live/b0294-callee-propagated-invoke-infra-live-cell.test.ts (grep "tests/" → 1 hit :280; "witness" → 4 hits; 0 hits in both coverage matrices and AGENTS.md); abbb9b30 added the offline pair with 10 + 5 = 15 it() cells (16 + 5 today, grown by af476df2/0295), and CHANGELOG:1864 plus 0292/0293 name their files. Verified witnesses to name: tests/b0294-callee-propagated-invoke-infra-wrapped.test.ts, describe "bug 0294 — a callee-propagated invoke_infra Err is wrapped with an invoke_callee hop" (cells (A) TWO-HOP, (B) KIND-DISCRIMINATION, (C) CONTROL trampoline-minted panic stays bare, (D) CONTROL one-hop boundary-minted load_failure stays bare, (E) THREE-HOP), the in-process leg; and tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts, describe "bug 0294 (F) — the subagent driver tags the reconstructed err arm with its provenance (INV-5)", the subagent leg and the (F) suite residual 2 refers to (its later describe "bug 0294 (G) …" is a 0295 re-pin) (triage: claude-opus-5-5)
