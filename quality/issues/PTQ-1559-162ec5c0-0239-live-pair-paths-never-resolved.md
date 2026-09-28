---
id: PTQ-1559
title: "Bug 0239's 0.201.0 fix record names its live H8a/H9a witnesses as `tests/live/params-default-unterminated-literal--live-cell.test.ts` and `tests/live/acceptance/params-default-unterminated-literal-load-refusal-.test.ts`, but 162ec5c0 landed them without the empty token slot and neither path has ever existed"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0239-params-default-unterminated-literal-admitted.md:568-581
  - tests/live/params-default-unterminated-literal-live-cell.test.ts:1-9
  - tests/live/params-default-unterminated-literal-live-cell.test.ts:185-212
  - tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts:1-8
  - tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts:235-272
  - CHANGELOG.md:3245-3255
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0239's 0.201.0 fix record names its live H8a/H9a witnesses as `tests/live/params-default-unterminated-literal--live-cell.test.ts` and `tests/live/acceptance/params-default-unterminated-literal-load-refusal-.test.ts`, but 162ec5c0 landed them without the empty token slot and neither path has ever existed

## Observation
The `## Fix (0.201.0)` "What shipped" list in bug 0239 names the live pair by two paths:
- `tests/live/params-default-unterminated-literal--live-cell.test.ts` (a double hyphen);
- `tests/live/acceptance/params-default-unterminated-literal-load-refusal-.test.ts` (a trailing hyphen before `.test.ts`).

Both look like a placeholder token that was stripped from the name. The "Gates" and "Verification" items then claim those files were "run for real under the shared lock" and passed. Neither path exists in the tree, and `git log --all` records no commit that ever touched either one. The fix commit 162ec5c0 added the pair as `tests/live/params-default-unterminated-literal-live-cell.test.ts` and `tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts`, and both files still exist and name bug 0239. As written, the pointer resolves to nothing. The equivalent witnesses are those two files.

## Evidence
Claim side (re-read just before filing), `docs/bugs/0239-params-default-unterminated-literal-admitted.md:568-581`:
```
  - `tests/live/params-default-unterminated-literal--live-cell.test.ts`
    (H8a) and
    `tests/live/acceptance/params-default-unterminated-literal-load-refusal-.test.ts`
    (H9a) — the live pair mirroring bug 0232's shape at the default half.
- **Gates:** witness `26 passed (26)`; default suite `Test Files 388 passed
  (388)` / `Tests 8034 passed (8034)`; `npm run typecheck` clean (no output);
  `npm run lint` clean (no output). Live, run for real under the shared lock:
  the new H8a cell green (the offender does not register, the closed neighbour
  does, the `theta-system-note` channel carries the code), the new H9a
  acceptance file green in full (`Tests 2 passed (2)` — OFFENDER REFUSED, GOOD
  LOADED, and the print-mode code measurement), and bug 0232's own pair
  (`tests/live/params-unterminated-literal-live-cell.test.ts`,
  `tests/live/acceptance/params-unterminated-literal-load-refusal.test.ts`)
  re-run green as the fix section requires.
```

Evidence side (equivalent witnesses, opened):
- `tests/live/params-default-unterminated-literal-live-cell.test.ts:1-2`: `// H8a live witness — bug 0239: a \`params:\` field whose DEFAULT half carries a` / `// string literal that never closes (\`p: 'string = "abc'\`) is admitted at HEAD`. At `:185`: `describe("bug 0239 live: a params: default whose string literal never closes is refused at registration, and the closed byte-neighbour still registers", …`. At `:212`: `it("does not register the params: default carrying an unterminated string literal, the theta-system-note channel carries theta/parse/unterminated-string, and the closed byte-neighbour still registers", …`.
- `tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts:1-3`: `// H9a live acceptance — bug 0239: a \`params:\` field whose DEFAULT half carries` / `// a string literal that never closes …is refused end to` / `// end through the real \`pi -p\` binary`. At `:235`: `describe("H9a live: bug 0239 unterminated-string refusal at the params: default half through the real \`pi -p\`, …`. The file holds two `it` blocks (`:236` ATTRIBUTION, `:272` the refusal/drive), which matches the record's "`Tests 2 passed (2)`".
- `CHANGELOG.md:3245-3255` (corroboration only) ends the entry with "Witness: `tests/params-default-unterminated-literal-refusal.test.ts` (26 cells) + an H8a live cell + a new H9a acceptance file". It gives no path.

Searches (all run in this session):
- Filenames: `find tests -name '*params-default-unterminated*'` → 3 files: `tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts`, `tests/live/params-default-unterminated-literal-live-cell.test.ts` and `tests/params-default-unterminated-literal-refusal.test.ts`. Neither cited spelling is among them.
- History of the cited spellings: `git log --all --oneline -- 'tests/live/params-default-unterminated-literal--live-cell.test.ts' 'tests/live/acceptance/params-default-unterminated-literal-load-refusal-.test.ts' | wc -l` → **0**.
- Add commit of the landed files: `git log --oneline --diff-filter=A -- tests/live/params-default-unterminated-literal-live-cell.test.ts tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts` → `162ec5c0 fix(bug-0239): …`. `git show --name-only --format= 162ec5c0` lists both landed names and the bug doc in the same commit.
- Test titles and bodies: `grep -rln 'bug 0239' tests` → 4 files, the three above plus `tests/live/unterminated-template-registration-live-cell.test.ts`. `grep -rn 'literal--live-cell\|load-refusal-\.test' tests` → 3 hits, all comments that repeat the same malformed spelling (`tests/params-default-unterminated-literal-refusal.test.ts:147-148`, `tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts:23`). None is a file path.
- Bug-doc witness lines: `grep -n 'live/params-default-unterminated\|live/acceptance/params-default-unterminated' docs/bugs/0239-*.md` → 2 hits (:568, :570), both malformed.
- Coverage matrix / AGENTS.md: `grep -c '0239' docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md AGENTS.md` → 0 / 0 / 0.
- CHANGELOG (corroboration): `grep -n '0239' CHANGELOG.md` → :3245, and the entry gives no live path.

## Why this is a problem
Re-running the record's live claim from its own pointer, `npx vitest run --config config/vitest/vitest.live.config.ts <cited path>`, finds no file, so the "run for real under the shared lock … green" statements cannot be reproduced from the record as written. The witnesses do exist under the landed names and assert the observables the record describes: registration denial, the `theta/parse/unterminated-string` code on the note channel, and the closed neighbour registering. That makes this a pointer that never resolved, not a missing witness. Both files are under `tests/live/**`, so they are not gate-proven. The record words them as a recorded live run at fix time, which is appropriate.

## Suggested direction (non-binding, optional)
Re-point the two paths at :568 and :570 to `tests/live/params-default-unterminated-literal-live-cell.test.ts` and `tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts`.

## False-positive check
- Representations covered: bug-doc witness lines, test filenames (`find`), test titles and bodies (`grep -rln 'bug 0239'`, plus a grep for the malformed spellings), coverage-matrix rows (both files), AGENTS.md gate names, and CHANGELOG (corroboration only). Each is stated above with its hit count.
- Both equivalent files were opened. Their headers and describe/it titles name bug 0239 and the default-half refusal.
- Cluster key: the malformed spelling was written in fix commit 162ec5c0 itself (`git log --oneline -S 'literal--live-cell' -- docs/bugs/0239-*.md` → 162ec5c0 only). No file was deleted. No other record in this shard cites these paths. Bug 0234's structurally similar pointer comes from a different commit (687305c5) and is filed separately.
- Not already filed: `grep -l '162ec5c0' quality/intake/* quality/issues/*` → 0 files.
- Not citation form: the pointer is a whole file path, not a `path:line` or symbol anchor, and no citation gate reads `docs/bugs/**`.
- Routing note, not filed here: the two test comments that repeat the malformed spelling are D7/comment territory.

## Triage
verdict: confirmed — reproduced: bug 0239 :568/:570 cite `tests/live/params-default-unterminated-literal--live-cell.test.ts` and `tests/live/acceptance/params-default-unterminated-literal-load-refusal-.test.ts`; neither exists and `git log --all` on both → 0; nothing was deleted (the typo was written in 162ec5c0 itself, `-S 'literal--live-cell'` → 162ec5c0 only), and 162ec5c0 added the unambiguous equivalents that still exist: `tests/live/params-default-unterminated-literal-live-cell.test.ts` (describe "bug 0239 live: a params: default whose string literal never closes is refused at registration…" :185, it :212) and `tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts` (describe "H9a live: bug 0239 unterminated-string refusal at the params: default half…" :235, two its :236/:272 matching `Tests 2 passed (2)`); all stated searches reproduce, with no other 162ec5c0/0239 filing in intake or issues (the 0234 candidate only mentions it as separate); the fix is a mechanical re-point of the two paths with no rewording (triage: claude-opus-5-5)
