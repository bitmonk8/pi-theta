---
id: PTQ-1558
title: Bug 0240's fix record cites its live witness as tests/live/par-for-body-qry4-mismatch-live-cell-.test.ts (stray hyphen before `.test.ts`), a path that no commit has ever had
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0240-query-schema-resolve-never-descends-par-for.md:469-476
  - docs/bugs/0240-query-schema-resolve-never-descends-par-for.md:515-518
  - tests/live/par-for-body-qry4-mismatch-live-cell.test.ts:1-9
  - tests/live/par-for-body-qry4-mismatch-live-cell.test.ts:173-174
  - vitest.config.ts:12
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0240's fix record cites its live witness as tests/live/par-for-body-qry4-mismatch-live-cell-.test.ts (stray hyphen before `.test.ts`), a path that no commit has ever had

## Observation
`docs/bugs/0240-query-schema-resolve-never-descends-par-for.md` has Status `fixed (0.200.0)`. Its `## Fix (0.200.0)` section names the H8a live witness as `tests/live/par-for-body-qry4-mismatch-live-cell-.test.ts`, with a hyphen between `live-cell` and `.test.ts`. No file at that path exists, and no commit on any ref has ever touched it. The fix commit `1bb58604` added `tests/live/par-for-body-qry4-mismatch-live-cell.test.ts` (no hyphen), and that file is still in the tree. The record's own Verification sentence "the live cell run for real" depends on this pointer. The pointer has never resolved as written.

## Evidence
Claim side, `docs/bugs/0240-query-schema-resolve-never-descends-par-for.md:469-476` (re-read before filing):
```
  - **Live witness — `tests/live/par-for-body-qry4-mismatch-live-cell-.test.ts`
    (new):** an H8a cell carrying row D6 to the shipped load path, where the
    withheld verdict is actually felt: the subject's `theta-system-note` channel
    must carry BOTH `theta/parse/par-query-in-body` and
    `theta/parse/explicit-schema-mismatch`, both message-pinned from the
    registry. Sibling controls: the plain-`for` spelling registers and warns
    (detector liveness), and a query-free `par for` registers silent
    (§Reproduction F2). Zero model turns.
```
`:515-518`:
```
- Verification: VERIFIED. Suite re-run independently 387/8018 zero reds;
  typecheck and lint independently clean; the revert/restore witness cycle
  re-done independently with both hashes quoted, every red matching the doc's
  signature; the live cell run for real. §Fix (e) discharged —
```

Evidence side, the equivalent witness in the tree. `tests/live/par-for-body-qry4-mismatch-live-cell.test.ts:1-9`:
```
// H8a live witness — bug 0240: without a `case "par-for"` arm in `rewriteExpr`
// (src/parser/query-schema-resolve.ts) a `ParForExpr` falls into that method's
// `default` arm and the whole subtree is returned unrewritten — `checkLetMismatch`
// (same file) is never reached for a body
// `let`, and `theta/parse/explicit-schema-mismatch`
// (docs/spec_topics/diagnostics/code-registry-parse.md:84) cannot fire anywhere
// inside a `par for` body. The fix adds that one arm, which makes the warning
// reachable there (docs/bugs/0240-query-schema-resolve-never-descends-par-for.md
// §Reproduction row D6, §Fix (a)/(c)).
```
`:173-174` hold the single describe/it pair: `describe("bug 0240 live: a QRY-4 mismatch inside a \`par for\` body reaches the theta-system-note channel beside CTRL-4's refusal", …)` with `it("carries BOTH par-query-in-body and explicit-schema-mismatch for the \`par for\` subject, where the plain-\`for\` sibling carries the warning alone and the query-free \`par for\` sibling registers clean", …)`. `:292-296` ends with `.toEqual([PAR_QUERY_IN_BODY, MISMATCH_CODE])`. These match the record's observables.

Searches (all run this session from the repo root):
- `ls tests/live | grep -c -- "-live-cell-\.test"` → 0.
- `git log --all --format=%h -- 'tests/live/par-for-body-qry4-mismatch-live-cell-.test.ts' | wc -l` → 0. No commit on any ref has touched that path.
- `git log --oneline --name-status --follow -- tests/live/par-for-body-qry4-mismatch-live-cell.test.ts` → added (`A`) in `1bb58604`, then only `M` entries (`162cea83`, `9d378465`, `e3546327`, `fff20188`). No rename.
- `grep -rn "par-for-body-qry4-mismatch-live-cell-\.test" tests docs AGENTS.md CHANGELOG.md | wc -l` → 1: the record itself, `:469`.
- `grep -rn "par-for-body-qry4-mismatch-live-cell\.test" tests docs AGENTS.md CHANGELOG.md | wc -l` → 0. No document names the real path.
- `git log --format=%h -S "live-cell-.test.ts" -- docs/bugs/0240-query-schema-resolve-never-descends-par-for.md` → `1bb58604`. The mis-spelt pin was written in the same fix commit that added the correctly spelt file.

## Why this is a problem
The record is `fixed`, and its host-level claim is that the fixed observable is felt on the real `theta-system-note` channel, "the live cell run for real". The only citation of that evidence is a path that has never resolved. Anyone who follows the record verbatim, including a triage re-run of `ls` or `git log` on the stated path, finds nothing, so from the record alone the live claim cannot be told apart from an unrecorded one. The cell does exist under the unhyphenated name. It sits under `tests/live/**`, which `vitest.config.ts:12` excludes from the default gate (`exclude: [...configDefaults.exclude, "tests/live/**"]`), so even once re-pointed it is a live witness that exists but is not gate-proven. The default-suite witness `tests/par-for.test.ts` (cells (s1)–(s10), each present by that label, 105 `it(` cells) resolves as stated and is unaffected.

## Suggested direction (non-binding, optional)
Re-point `:469` at `tests/live/par-for-body-qry4-mismatch-live-cell.test.ts`, the file `1bb58604` added. It names itself as "H8a live witness — bug 0240".

## False-positive check
- Representations enumerated, one search each:
  - (1) Bug-doc Witness/Fix pins: `grep -rn "par-for-body-qry4-mismatch-live-cell-\.test" tests docs AGENTS.md CHANGELOG.md` → 1 hit (the record).
  - (2) Test file names: `ls tests/live | grep -c -- "-live-cell-\.test"` → 0, and `grep -rln "0240" tests/live` → 1 file (`par-for-body-qry4-mismatch-live-cell.test.ts`).
  - (3) Test titles: `grep -rln "bug 0240 live" tests` → 1 file, the same one.
  - (4) Coverage-matrix rows: `grep -c "0240\|par-for-body-qry4" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md` → 0 and 0.
  - (5) AGENTS.md gate names: `grep -n "0240\|par-for-body-qry4\|par for.*QRY-4" AGENTS.md | wc -l` → 0.
  - (6) CHANGELOG, corroboration only: `grep -n "par-for-body-qry4" CHANGELOG.md` → 0 hits. The fix commit body names the cell stem without the hyphen: "standalone live cell par-for-body-qry4-mismatch-live-cell".
- History intent: no delete or rename of the stated path exists to cluster by, since it was never added. This is a mis-typed pointer, not a later decay. The same shape was filed this wave for other records (b0078, b0092, b0131, b0162). Those are different records, so this filing does not duplicate them.
- Not citation form: no gate checks `docs/bugs/**` witness paths (bug 0245's record `:595-597` states that `tests/citation-symbol-form-gate.test.ts` "holds `docs/bugs/**` out of scope in both directions"). I did not adjudicate whether the claim is true, and I executed no test.
- `tests/scratch-0238-stray-close-probe2.test.ts`, the other missing path in this record (`:327`), is prose about another lane's scratch file that went red in a prototype suite run. It is not cited as evidence for any claim, so it is not filed.

## Triage
verdict: confirmed — every stated search reproduces: the hyphenated path at bug 0240 `:469` has 0 files in tests/live and 0 commits on any ref, and `-S "live-cell-.test.ts"` lands the mis-spelt pin in fix commit 1bb58604, the same commit that added (A) the unhyphenated file, which since has only M entries. Coverage-matrix, AGENTS.md and CHANGELOG searches all give 0. The claimed observable's witness does exist: tests/live/par-for-body-qry4-mismatch-live-cell.test.ts, describe "bug 0240 live: a QRY-4 mismatch inside a `par for` body reaches the theta-system-note channel beside CTRL-4's refusal" / it "carries BOTH par-query-in-body and explicit-schema-mismatch for the `par for` subject, where the plain-`for` sibling carries the warning alone and the query-free `par for` sibling registers clean" (:173-174). Its header names it the H8a live witness for bug 0240. The fix is a mechanical re-point of `:469`; note that it is live-only (vitest.config.ts:12 excludes tests/live/**). No other intake file or PTQ tracks this record's pin (the b0092 filing only mentions 0240 as out of its shard) (triage: claude-opus-5-5)
