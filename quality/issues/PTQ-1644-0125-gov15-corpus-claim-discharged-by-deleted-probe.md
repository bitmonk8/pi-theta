---
id: PTQ-1644
title: "Bug 0125's 0.76.0 fix record discharges its corpus-wide \"blast radius against GOV-15 is zero\" claim over every committed `.theta` and `.thetalib` by a deleted scratch probe, and carries no note re-pointing it at `tests/committed-fixture-parse-gate.test.ts` after bug 0132 widened that gate to `.thetalib`"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md:1127-1139
  - docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md:1292-1299
  - AGENTS.md:85-87
  - tests/committed-fixture-parse-gate.test.ts:67-72
  - docs/bugs/0132-committed-fixture-parse-gate-blind-to-thetalib.md:997-1002
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0125's 0.76.0 fix record discharges its corpus-wide "blast radius against GOV-15 is zero" claim over every committed `.theta` and `.thetalib` by a deleted scratch probe, and carries no note re-pointing it at `tests/committed-fixture-parse-gate.test.ts` after bug 0132 widened that gate to `.thetalib`

## Observation
Bug 0125's `## Fix (0.76.0)` makes a corpus-wide GOV-15 claim: every committed `.theta` and `.thetalib` has byte-identical diagnostics before and after the fix, so the blast radius is zero. The record's only evidence is a scratch probe that extended the gate's walk and was then deleted. The record says why. At e7f73ccf the gate walked `.theta` only (bug 0132, then open), and residual 5 repeats that the sweep "worked around both in a scratch probe rather than fixing the gate". AGENTS.md now pins `tests/committed-fixture-parse-gate.test.ts` as the discharge for exactly this claim shape. Bug 0132 (0.95.0) widened the gate to `git ls-files '*.theta' '*.thetalib'` and appended re-pointing notes to 0079 and 0095 only. 0125 has no 0132 note, and its residual 5 still calls 0132 "open".

## Evidence
Claim side, `docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md:1127-1139`:
```
- **GOV-15 discharge — the committed-corpus sweep.** Programs that load cleanly
  today could start refusing, so the whole shipped corpus was swept both
  directions. `tests/committed-fixture-parse-gate.test.ts` filters `.theta`
  only and cannot witness a `.thetalib` (bug 0132, open — **not** fixed here),
  so the walk was extended in a scratch probe (the 0079/0095 method) to every
  committed `.theta` **and** `.thetalib`, each run through the real `lexTheta`
  → `parseThetaDocument`. **35 files** (34 tracked plus the gitignored
  `.pi/theta/smoke.theta`). Pre-fix and post-fix row sets are **byte-identical**:
  every file yields `[]` except the seeded-invalid
  `tests/fixtures/h7b-invalid/malformed.theta`, whose six-code list is
  unchanged. No shipped `.theta` or `.thetalib` declares a type-alias schema
  over `array<T>` and indexes it, so the blast radius against GOV-15 is
  **zero** and no carve-out is owed. Probe deleted.
```
`:1292-1299` (Residual 5):
```
  5. **Bug 0132 (open) is confirmed, not closed.**
     `tests/committed-fixture-parse-gate.test.ts`'s walk still filters `.theta`
     only and still cannot witness either committed `.thetalib`
     (`docs/examples/personas.thetalib`,
     `tests/live/acceptance/fixtures/acc-lib.thetalib`), and its anti-vacuity
     guard still depends on the gitignored `.pi/theta/smoke.theta`. This fix's
     GOV-15 sweep worked around both in a scratch probe rather than fixing the
     gate, as directed.
```

The gate pinned as the discharge, `AGENTS.md:85-87`:
```
`tests/committed-fixture-parse-gate.test.ts` covers every committed `.theta`
and `.thetalib` the repository ships. A fix record's corpus-wide "no shipped
source moves" claim is discharged by that gate, not by a scratch probe.
```
The gate at the fix commit: `git show e7f73ccf:tests/committed-fixture-parse-gate.test.ts | sed -n 50,58p` → `} else if (entry.isFile() && entry.name.endsWith(".theta")) {` (`:55`). The gate today, `tests/committed-fixture-parse-gate.test.ts:67-72`:
```
function discoverShippedFixtures(): string[] {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--", "*.theta", "*.thetalib"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
```
`docs/bugs/0132-committed-fixture-parse-gate-blind-to-thetalib.md:997-1002`:
```
- **Discharge notes appended.**
  [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) and
  [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) — a
  short note on each recording that the `.thetalib` half of its corpus-wide "no
  shipped source moves" claim is now gate-enforced rather than resting on a
  deleted scratch probe. Append-only; neither status flipped.
```

Searches run this session, one per representation:
- Bug-doc pins: `grep -c "scratch probe" docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md` → 3. `grep -c 0132 docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md` → 2 (`:1130`, `:1292`, both "open"). `grep -c 0125 docs/bugs/0132-committed-fixture-parse-gate-blind-to-thetalib.md` → 0.
- Test files / titles: `grep -n "committedThetaSources\|ls-files\|thetalib" tests/index-element-alias-unfolded.test.ts tests/index-element-alias-runtime-disposition.test.ts | wc -l` → 0, so 0125's own witnesses carry no corpus cell. `grep -rln "committedThetaSources\|ls-files" tests/*.test.ts | xargs grep -l 0125` → 1 file, `tests/member-access-declared-field-type.test.ts`. Its corpus note (`:125-130`) is bug 0136's GOV-15 discharge, not 0125's.
- Coverage matrix: `grep -c 0125 docs/plan_topics/coverage-matrix.md` → 0.
- AGENTS.md gate name: `AGENTS.md:85-87` quoted above.
- CHANGELOG: not relied on.
- `git log --format='%h %ad %s' --date=short -- docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md` → e7f73ccf (08-05), 5de8d78a (08-06), 6942ef27 (08-17). Bug 0132's fix is d13320b4 (08-15), so the bug-0136 note on 08-17 postdates the gate widening and does not mention it.

## Why this is a problem
The claim covers the whole corpus, and its only evidence is a probe no longer in the tree. The house rule names the gate as the discharge and says "not by a scratch probe". The honest disclosure at `:1129-1131` explains why the probe was used at the time, and it is not the subject here. What remains is an unmarked claim resting on evidence weaker than the house discharge, with a residual that still calls 0132 open. Bug 0132 fixed exactly this shape for 0079 and 0095 with notes. 0125 recorded the same "(the 0079/0095 method)" and got no note. The same root cause is filed from another shard for records 0081, 0083 and 0084 (pending `qw20260928081617-d10-02-thetalib-corpus-claims-discharged-off-gate.md`). This filing adds 0125, which that candidate does not list, for triage to merge.

## Suggested direction (non-binding, optional)
A short append-only note on 0125, in the shape of bug 0132's notes on 0079/0095, recording that the `.thetalib` half of the GOV-15 claim is now gate-enforced by `tests/committed-fixture-parse-gate.test.ts` and that residual 5 is closed by d13320b4.

## False-positive check
- Representations covered: bug-doc pins, test file names and titles, coverage-matrix rows, AGENTS.md gate names, and CHANGELOG (corroboration only). Each search is listed above with its command and hit count.
- Not the honesty marker itself. The disclosure that the probe was a workaround is the culture working. The finding is the missing re-point after the gate landed, and residual 5's stale "open".
- The claim's truth is not adjudicated. Whether the current gate is green does not bear on whether this record cites it.
- Same shard, same class, checked. 0126 (`:1268-1271`) cites the gate as "the corpus-wide discharge per `AGENTS.md`" at 0.107.0, after d13320b4. 0124 (`:1452-1454`) does the same. 0123 discharges through its own default-suite cell j1 over `committedThetaSources()` (`tests/match-pattern-increment-decrement.test.ts:782-802`). None of the three is affected.
- The pending sibling candidate cites 0081, 0083 and 0084 only, so 0125 is not re-listed.

## Triage
verdict: questionable — accounting verified: 0125:1127-1139 rests its corpus-wide GOV-15 "blast radius zero" claim over every committed `.theta`/`.thetalib` on a deleted scratch probe ("Probe deleted."), and residual 5 (:1292-1299) still calls bug 0132 "open"; at e7f73ccf the gate's walk was `endsWith(".theta")` only (:55), while today it runs `ls-files '*.theta' '*.thetalib'` (tests/committed-fixture-parse-gate.test.ts:67-72, landed d13320b4 on 08-15); 0132:997-1002 appended discharge notes to 0095/0079 only; AGENTS.md:85-87 names the gate as the discharge, "not by a scratch probe"; every stated search reproduces (3 "scratch probe", 0132 at :1130/:1292 only, 0 hits for 0125 in 0132, 0 corpus cells in 0125's witnesses, member-access-declared-field-type is 0136's discharge, 0 coverage-matrix rows); my own greps find no gate re-point in 0125's later discharge notes (:1321, :1441, :1493). Witness exists: tests/committed-fixture-parse-gate.test.ts "%s parses cleanly through lexTheta -> parseThetaDocument". For overstated-strength, adding a note or closing the stale residual is a human ruling. Not a duplicate: the per-record precedent from the d10-02 sibling ruling (0081/0083/0084) applies. The file had no Triage heading, so triage added it (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). APPEND EXACTLY the following block at the very end of docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md, nothing else; every existing line stays byte-identical (this note is independent of, and may follow, the bug 0135 coordination note ruled in the same wave):

### Discharge note — 2026-09-28 (D10 wave qw20260928081617)

The corpus-wide GOV-15 blast-radius-zero claim above rested on a scratch probe (Probe deleted), and residual 5 still calls bug 0132 open: 0132 was fixed at d13320b4 (0.95.0), which widened the committed-fixture gate to git ls-files *.theta *.thetalib. The standing discharge is tests/committed-fixture-parse-gate.test.ts (default suite; cell: parses cleanly through lexTheta -> parseThetaDocument), pinned by AGENTS.md as the instrument for corpus-wide claims.
