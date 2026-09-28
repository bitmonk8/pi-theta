---
id: PTQ-1582
title: "Bug 0108's 0.213.0 fix record names its H8a live witness `tests/live/uppercase-pi-tool-name-refusal-live.test.ts`, a path that has never existed; 185db9db landed the cell as `tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md:840-845
  - docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md:879-885
  - tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts:1-10
  - tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts:122-123
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0108's 0.213.0 fix record names its H8a live witness `tests/live/uppercase-pi-tool-name-refusal-live.test.ts`, a path that has never existed; 185db9db landed the cell as `tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts`

## Observation
Bug 0108 is `fixed (0.213.0)`. Its §Fix "What shipped" list names the live witness for the fix as `tests/live/uppercase-pi-tool-name-refusal-live.test.ts`. Its Verification paragraph discharges "Obligation 3 (a live test exercises the fixed path, run for real)" with "the new H8a cell green under the live lock". That sentence names no path, so the What-shipped pin is the record's only pointer to the live witness. No file at that path exists at HEAD, and no commit has ever touched one. The fix commit 185db9db added `tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts`, a bug-0108 H8a cell, and that is the witness the record means.

## Evidence
Claim side, `docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md:840-845`:
```
  - `tests/uppercase-pi-tool-name-refusal.test.ts` — the offline witness.
  - `tests/live/uppercase-pi-tool-name-refusal-live.test.ts` — the H8a
    live cell; `tests/live/harness.ts` gains an additive optional
    `extraExtensionPaths` on `bootShippedExtension` so a throwaway third-party
    extension can supply the uppercase-first registry name, the only admission
    route that can produce one.
```
`docs/bugs/0108-…md:879-885`:
```
  Obligation 3 (a live test exercises the fixed path, run for real) — the new
  H8a cell green under the live lock, and the pre-existing
  `tests/live/live-production-acceptance.test.ts` green 88/88 including its
  bug-0070 / 0071 / 0110 `tools:` cells, proving the neighbouring tools-load
  surface undisturbed; the live cell's red path was proven independently by
  lowercasing the throwaway extension's tool name, which reproduces the pre-fix
  signature (theta registered, callable bound). Obligation 4 — typecheck and
```

Evidence side:
- `ls tests/live/uppercase-pi-tool-name-refusal-live.test.ts` → `No such file or directory`.
- `git log --all --oneline -- 'tests/live/uppercase-pi-tool-name-refusal-live.test.ts' | wc -l` → 0. The path has never existed in history, so this is not a later rename.
- `git show --name-status 185db9db` (the `fix(bug-0108): … v0.213.0` commit) → `A tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts`, `M tests/live/harness.ts`.
- `git log --all --format=%h -- tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts | wc -l` → 2 (185db9db add, 5e1860ec modify).
- `tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts:1-10` (header): "Bug 0108 — standalone live registration cell … a `tools:` entry naming a Pi tool whose HOST REGISTRY NAME is not lowercase-first (`WebSearch`) must be REFUSED at load under `theta/load/invalid-pi-tool-name`, and the theta must NOT register". `:122-123`: `describe("bug 0108 live cell — an uppercase-first Pi-tool registry name is refused at live production load ", …)` / `it("un-registers the \`- WebSearch\` theta while its \`as\`-renamed sibling and the lowercase control both register", …)`.
- `rg -n "uppercase-pi-tool-name-refusal-live\.test" --glob '!quality/**' .` → 2 hits: this record at :841 and `tests/uppercase-pi-tool-name-refusal.test.ts:151` (a test comment carrying the same wrong path).
- `rg -n "uppercase-pi-tool-name-refusal-live-cell" --glob '!quality/**' .` → 1 hit, `docs/bugs/0105-…md:823`. That record names the cell under its real stem, so the rest of the corpus uses the real name.

Strength cap: the equivalent witness sits under `tests/live/**`. It exists but is not gate-proven. The record's "green under the live lock" is a recorded run, and the default-suite preflight does not re-prove it.

## Why this is a problem
Obligation 3 of the fix's verification rests on the live cell, and What-shipped is the one place the record names it. A reader or triage run that follows the stated path finds nothing, and `git log` shows the path never existed. So the record's live-tier evidence cannot be reached from its own text, even though the cell is in the tree under a sibling name. This is the same shape as the cfa110b1 / b0075 filing already pending, where a fix commit landed its live cell under a `-live-cell` stem the record does not name.

## Suggested direction (non-binding, optional)
Re-point the What-shipped bullet at `tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts` (describe `bug 0108 live cell — …`). The equivalent witness exists and was added by the same fix commit.

## False-positive check
- Test-filename representation: `ls` of the cited path → absent. `git log --all` over the cited path → 0 commits. `git show --name-status 185db9db` → the `-live-cell` stem added.
- Test-title representation: `rg -l "bug 0108 live cell" tests` → 1 file (the `-live-cell` file). No other test title names a bug-0108 live cell.
- Bug-doc Witness representation: `grep -n "tests/live" docs/bugs/0108-…md` → lines 841 and 881 only. Line 881 is `live-production-acceptance.test.ts`, which exists but is the neighbouring-surface guard and not this fix's cell. The record names the new cell by path nowhere else.
- Coverage-matrix rows / AGENTS.md gate names: not applicable. The pointer is a record's own witness path, and no gate resolves bug-doc test paths.
- Corroboration: `docs/bugs/0105-…md:823` cites the cell under its real `-live-cell` stem.
- Pending candidates: no existing filing cites 0108 or its live path. The pending `qw20260928081617-d10-04-185db9db-b0070-…` shares the sha but cites record 0070's (C6a) pin, a different record and pointer, so this does not re-list any record it cites.
- Not filed: the same wrong path in `tests/uppercase-pi-tool-name-refusal.test.ts:151` is a test comment (D7 surface), not a claim record.

## Triage
verdict: confirmed — decayed pointer verified: docs/bugs/0108…md:841 names tests/live/uppercase-pi-tool-name-refusal-live.test.ts, which is absent (ls fails; git log --all over the path finds 0 commits); fix commit 185db9db added tests/live/uppercase-pi-tool-name-refusal-live-cell.test.ts (header "Bug 0108 — standalone live registration cell … Additive H8a-T cell"; describe "bug 0108 live cell — an uppercase-first Pi-tool registry name is refused at live production load" / it "un-registers the `- WebSearch` theta while its `as`-renamed sibling and the lowercase control both register"). It is the only uppercase* file in tests/live, so the equivalent is unambiguous and the fix is a mechanical re-point (0105…md:823 already cites the real stem). Not a same-sha duplicate: 185db9db deleted nothing, and d10-04-185db9db-b0070 tracks a different record (the 0070 C6a repin); this file also sorts first (triage: claude-opus-5-5)
