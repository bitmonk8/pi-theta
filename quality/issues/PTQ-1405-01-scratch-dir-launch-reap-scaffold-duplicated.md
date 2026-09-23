---
id: PTQ-1405
title: The scratch-dir/fixture-write/launch/reap scaffold above launchRealSubagentChild is retyped identically in the bug-0067 and bug-0180 subagent witnesses
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-invoke-inbound-enum-tag.test.ts:150-193
  - tests/subagent-invoke-nonfinite-return-refusal.test.ts:265-309
sites: 2
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# The scratch-dir/fixture-write/launch/reap scaffold above launchRealSubagentChild is retyped identically in the bug-0067 and bug-0180 subagent witnesses

## Observation
`tests/subagent-invoke-inbound-enum-tag.test.ts` (bug 0067) and `tests/subagent-invoke-nonfinite-return-refusal.test.ts` (bug 0180) both drive their real-subagent cell through the shared `tests/helpers/real-subagent-spawn.ts` primitives (`realExecutableHost`, `launchRealSubagentChild`, `childExit`, `driveWatchedSubagentChild`, `reapSubagentChildren`). Around that shared helper, each file independently retypes the same scratch-directory creation, fixture-write loop, launch-failure guard, `exitPromise` capture, `try`/watchdog-drive block, and `finally`-block reap call, differing only in the tmp-dir prefix string, the fixture-write shape (fixed calls vs. a `for…of Object.entries` loop), the root fixture filename, and the watchdog millisecond literal (both currently `90_000`).

## Evidence

`tests/subagent-invoke-inbound-enum-tag.test.ts:150-193`:
```ts
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0067-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      writeFileSync(join(thetaDir, "kid.theta"), KID_ENUM);
      writeFileSync(join(thetaDir, "kidobj.theta"), KID_OBJECT);
      writeFileSync(join(thetaDir, "kidarr.theta"), KID_ARRAY);
      writeFileSync(join(thetaDir, "kidanon.theta"), KID_ANON);
      writeFileSync(join(thetaDir, "top-typed.theta"), TOP_TYPED);

      const host: ExecutableHost = realExecutableHost();

      const { launch, diagnostics, emitDiagnostic } = launchRealSubagentChild({
        slug: "top-typed",
        thetaDirs: [thetaDir],
        provider: CHILD_MODEL_PROVIDER,
        model: CHILD_MODEL_ID,
        cwd: scratchDir,
        host,
      });
      expect(launch.ok, `launch failed: ${JSON.stringify(diagnostics)}`).toBe(true);
      if (!launch.ok) {
        return;
      }
      const child = launch.child;

      const exitPromise = childExit(child);

      try {
        const { result, killedByWatchdog } = await driveWatchedSubagentChild(
          child, join(thetaDir, "top-typed.theta"), emitDiagnostic, 90_000,
        );
```
and at the same file's tail, line 306: `await reapSubagentChildren([{ kill: () => child.kill(), exited: exitPromise }], scratchDir);`

`tests/subagent-invoke-nonfinite-return-refusal.test.ts:265-309` — the identical sequence, only the tmp-dir prefix (`pi-theta-bug0180-`), the fixture-write shape (a `for…of Object.entries(FIXTURES)` loop rather than five fixed calls), the root filename (`top-nonfinite.theta`) and callee `slug` differ:
```ts
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0180-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      for (const [name, source] of Object.entries(FIXTURES)) {
        writeFileSync(join(thetaDir, name), source);
      }
      writeFileSync(join(thetaDir, "top-nonfinite.theta"), TOP_NONFINITE);

      const host: ExecutableHost = realExecutableHost();

      const { launch, diagnostics, emitDiagnostic } = launchRealSubagentChild({
        slug: "top-nonfinite",
        thetaDirs: [thetaDir],
        provider: CHILD_MODEL_PROVIDER,
        model: CHILD_MODEL_ID,
        cwd: scratchDir,
        host,
      });
      expect(launch.ok, `launch failed: ${JSON.stringify(diagnostics)}`).toBe(true);
      if (!launch.ok) {
        return;
      }
      const child = launch.child;

      const exitPromise = childExit(child);

      try {
        const { result, killedByWatchdog } = await driveWatchedSubagentChild(
          child, join(thetaDir, "top-nonfinite.theta"), emitDiagnostic, 90_000,
        );
```
and at the same file's tail, line 486: `await reapSubagentChildren([{ kill: () => child.kill(), exited: exitPromise }], scratchDir);`

Exact search executed: `grep -n "scratchDir|thetaDir|mkdtempSync|mkdirSync|writeFileSync|exitPromise|reapSubagentChildren|launchRealSubagentChild|driveWatchedSubagentChild|realExecutableHost" tests/subagent-invoke-inbound-enum-tag.test.ts tests/subagent-invoke-nonfinite-return-refusal.test.ts` — the two blocks above are the full match set in each file, one occurrence per file (sites: 2).

## Why this is a problem
Two counted sites retype the same nine-statement scratch-dir/fixture-write/launch-guard/exitPromise/watchdog-drive/reap sequence around the already-shared `tests/helpers/real-subagent-spawn.ts` primitives (themselves consolidated by PTQ-0583). The lower-level plumbing that helper module absorbs stops one level short of the fixture-directory setup and launch-plus-reap wiring each caller still writes out by hand, so the boilerplate cited here is what remains after that consolidation, not a re-litigation of it. The same root cause was already filed for a different file pair (`quality/intake/qw20260922211400-d7-01-b0337-b0342-chain-fixture-scaffold-duplicated.md`, covering `tests/b0337-theta-enum-identity-invoke.test.ts` and `tests/b0342-forwarded-enum-subagent-chain.test.ts`); this finding cites a second, disjoint pair of files exhibiting the identical duplication, not those same two files.

## Suggested direction (non-binding, optional)
A small helper in `tests/helpers/real-subagent-spawn.ts` (or a sibling module) that takes a fixture map, a root source, a slug and a watchdog bound and returns the launched/driven/reaped outcome would be the natural next home the two files' own near-identical sequences point toward — the same direction already named for the b0337/b0342 pair, extended to this pair.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin; not applicable.
- Recording-double check: `diagnostics`/`emitDiagnostic` is a recording double used for a launch-failure error message, not a "never called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -n "scratchDir|reapSubagentChildren" docs/bugs/0067*.md docs/bugs/0180*.md` → 0 hits; neither bug document pins this scaffold as a witness artefact.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-invoke-inbound-enum-tag|subagent-invoke-nonfinite-return-refusal" docs/reference/coverage-matrix.md` → 0 hits for either file. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` cell — only that the shared scaffold sequence could be extracted into the existing helper module — so no citation is affected.
- Duplicate-topic check: `quality/intake/qw20260922211400-d7-01-b0337-b0342-chain-fixture-scaffold-duplicated.md` already covers the same root cause for a disjoint file pair (`tests/b0337-theta-enum-identity-invoke.test.ts`, `tests/b0342-forwarded-enum-subagent-chain.test.ts`); this filing cites two different files (`tests/subagent-invoke-inbound-enum-tag.test.ts`, `tests/subagent-invoke-nonfinite-return-refusal.test.ts`) exhibiting the identical pattern, so it is a distinct pair of sites, not a re-filing. `quality/resolved/PTQ-0938*.md` covers the separate `requirePath`/`requireRealSubagentPathsFor` precondition-pair duplication across 12 files including these two; that is a different, smaller root cause (a two-line precondition check, not the scratch-dir/launch/reap scaffold) and is not re-filed here. `quality/resolved/PTQ-0709*.md`/`PTQ-0942*.md` cover the separate `reportOf` narrowing-helper duplication; also a distinct root cause, not re-filed.
- Coverage drift check: this finding does not claim a missing test or an untested path; both cited sequences are exercised by their respective files' passing integration cells.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at exactly the cited lines (enum-tag :150-193 + finally/reap :301-306, nonfinite :265-309 + finally/reap :481-486); a comment-stripped mktemp diff of the two ranges (32 vs 31 statements) differs only in the tmp-dir prefix, the fixture-write shape (five fixed writeFileSync calls vs a for…of Object.entries(FIXTURES) loop), the root filename/slug literal and nothing else (both watchdogs 90_000, reap line byte-identical); tests/helpers/real-subagent-spawn.ts exports only the primitives (:27-151) and no helper composes the scratch-dir→fixture-write→launch-guard→exitPromise→try/finally-reap shell, so this is the residue above PTQ-0583's call boundary (0583 = PI_CLI_ENTRY/requirePath/launch constants, PTQ-0938 = the requirePath pair, PTQ-0709/0942 = reportOf — none the shell); all locations under tests/, boilerplate-duplication class, neither file a gate, `diagnostics` is a failure-message recording double not a MUST-NOT witness, no cell merge/rename/delete proposed (docs/bugs/0067:329,466 and 0180:1089,1207 cite by file name only; coverage-matrix → 0 hits); file set is disjoint from the same-wave family head d7-01 (b0337/b0342, already confirmed and naming this filing as a disjoint pair) so under the per-file-set precedent (PTQ-0759/1032/1077, 0629/0692) this is the family's next row, not a duplicate — the fixer should land the one shared helper d7-01 names and migrate this pair with it (triage: claude-fable-5-1)
