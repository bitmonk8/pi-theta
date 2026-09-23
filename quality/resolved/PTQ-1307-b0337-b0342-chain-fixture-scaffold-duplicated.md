---
id: PTQ-1307
title: The scratch-dir/fixture-write/launch/reap scaffold above launchRealSubagentChild is retyped identically in b0337 and b0342-forwarded-enum-subagent-chain
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0337-theta-enum-identity-invoke.test.ts:566-604
  - tests/b0342-forwarded-enum-subagent-chain.test.ts:189-227
sites: 2
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# The scratch-dir/fixture-write/launch/reap scaffold above launchRealSubagentChild is retyped identically in b0337 and b0342-forwarded-enum-subagent-chain

## Observation
Both `tests/b0337-theta-enum-identity-invoke.test.ts` and `tests/b0342-forwarded-enum-subagent-chain.test.ts` drive their respective real-subagent integration cell through the same `tests/helpers/real-subagent-spawn.ts` helper (`requireRealSubagentPathsFor`, `realExecutableHost`, `launchRealSubagentChild`, `childExit`, `driveWatchedSubagentChild`, `reapSubagentChildren`). Around that shared helper, each file independently retypes the same scratch-directory creation, fixture-write loop, launch-failure guard, `exitPromise` capture, and `finally`-block reap call — differing only in the fixture map's variable name, the tmp-dir prefix string, and the watchdog millisecond literal.

## Evidence

`tests/b0337-theta-enum-identity-invoke.test.ts:566-604`:
```ts
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0337-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      for (const [name, source] of Object.entries(CELL4_FIXTURES)) {
        writeFileSync(join(thetaDir, name), source);
      }
      writeFileSync(join(thetaDir, "top.theta"), CELL4_ROOT);

      const host: ExecutableHost = realExecutableHost();

      const { launch, diagnostics, emitDiagnostic } = launchRealSubagentChild({
        slug: "top",
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
          child, join(thetaDir, "top.theta"), emitDiagnostic, 90_000,
        );
```
and, at the same file's tail (line 683):
```ts
        await reapSubagentChildren([{ kill: () => child.kill(), exited: exitPromise }], scratchDir);
```

`tests/b0342-forwarded-enum-subagent-chain.test.ts:189-227` — the identical sequence, only the fixture map name (`CELL_FIXTURES`), root constant (`TOP_ROOT`), tmp-dir prefix (`pi-theta-bug0342-`) and watchdog bound (`100_000`) differ:
```ts
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0342-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      for (const [name, source] of Object.entries(CELL_FIXTURES)) {
        writeFileSync(join(thetaDir, name), source);
      }
      writeFileSync(join(thetaDir, "top.theta"), TOP_ROOT);

      const host: ExecutableHost = realExecutableHost();

      const { launch, diagnostics, emitDiagnostic } = launchRealSubagentChild({
        slug: "top",
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
          child, join(thetaDir, "top.theta"), emitDiagnostic, 100_000,
        );
```
and at line 309:
```ts
        await reapSubagentChildren([{ kill: () => child.kill(), exited: exitPromise }], scratchDir);
```

Search executed: `grep -n "scratchDir\|thetaDir\|mkdtempSync\|mkdirSync\|writeFileSync\|Object.entries\|reapSubagentChildren\|exitPromise" tests/b0337-theta-enum-identity-invoke.test.ts tests/b0342-forwarded-enum-subagent-chain.test.ts` → the two blocks above are the full set of matches in each file, one occurrence per file (sites: 2).

## Why this is a problem
Two counted sites retype the same nine-statement scratch-dir/fixture-write/launch-guard/exitPromise/reap sequence around the already-shared `tests/helpers/real-subagent-spawn.ts` primitives (`requireRealSubagentPathsFor`, `realExecutableHost`, `launchRealSubagentChild`, `childExit`, `driveWatchedSubagentChild`, `reapSubagentChildren` — themselves consolidated by PTQ-0583). The lower-level plumbing that helper module absorbs stops one level short of the fixture-directory setup and launch-plus-reap wiring each caller still writes out by hand, so the boilerplate this finding cites is what remains after that consolidation, not a re-litigation of it.

## Suggested direction (non-binding, optional)
A small helper in `tests/helpers/real-subagent-spawn.ts` (or a sibling module) that takes a fixture map, a root source, a slug and a watchdog bound and returns the launched/driven/reaped outcome would be the natural next home the two files' own near-identical sequences point toward — parameterising exactly the four literals (fixture map, root constant, tmp-dir prefix, watchdog ms) that differ between the two call sites cited above.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin; not applicable.
- Recording-double check: `diagnostics`/`emitDiagnostic` is a recording double used for a launch-failure error message, not a "never called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -n "scratchDir\|reapSubagentChildren" docs/bugs/0337*.md docs/bugs/0342*.md` → 0 hits; neither bug document pins this scaffold as a witness artefact.
- coverage-matrix/bug-doc citation search: `grep -n "b0337-theta-enum-identity-invoke\|b0342-forwarded-enum-subagent-chain" docs/reference/coverage-matrix.md` → 0 hits for either file. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` cell — only that the shared scaffold sequence could be extracted into the existing helper module — so no citation is affected.
- Duplicate-topic check: `quality/resolved/PTQ-0583*.md` already consolidated the lower-level `PI_CLI_ENTRY`/`requirePath`/`launchSubagentChild`/watchdog/teardown bundle into `tests/helpers/real-subagent-spawn.ts`, which both files now import and use identically (verified: both files' import lists at the top include `requireRealSubagentPathsFor`, `realExecutableHost`, `launchRealSubagentChild`, `childExit`, `driveWatchedSubagentChild`, `reapSubagentChildren`); this finding cites the scratch-dir/fixture-write/launch-guard/exitPromise/reap-call statements that sit ABOVE that helper's call boundary and remain hand-duplicated after PTQ-0583's fix landed — a distinct, narrower root cause, not a re-filing of PTQ-0583. `quality/resolved/PTQ-0709*.md` covers the separate `reportOf` narrowing-helper duplication in the same two files; that root cause is unrelated to the scratch-dir/launch/reap sequence cited here and is not re-filed.
- Coverage drift check: this finding does not claim a missing test or an untested path; both cited sequences are exercised by their respective files' passing integration cells.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at exactly the cited lines (b0337:566-604 + reap :683, b0342:189-227 + reap :309); a comment-stripped mktemp diff of the two ranges differs in exactly the four literals the filing names (tmp-dir prefix, fixture map `CELL4_FIXTURES`/`CELL_FIXTURES`, root constant `CELL4_ROOT`/`TOP_ROOT`, watchdog 90_000/100_000) and nothing else; tests/helpers/real-subagent-spawn.ts exports only the primitives (requireRealSubagentPathsFor/realExecutableHost/launchRealSubagentChild/childExit/driveWatchedSubagentChild/reapSubagentChildren, :27-151) and no helper composes the scratch-dir→fixture-loop→launch-guard→exitPromise→try/finally-reap shell, so this is the residue above PTQ-0583's call boundary, not a re-filing (0583's locations were the PI_CLI_ENTRY/requirePath/launch constants, PTQ-0938 the requirePath pair, PTQ-0709/0942 reportOf — none the shell); all locations under tests/, boilerplate-duplication class, neither a gate file, diagnostics is a failure-message recording double not a MUST-NOT witness, no cell merge/rename/delete proposed (docs/bugs/0337:188 and 0342:147,219 cite by file name only; coverage-matrix → 0 hits); no quality/issues row tracks this scaffold. Accounting note for the fixer, not changing the outcome: `sites: 2` undercounts the family — the identical shell recurs in every other launchRealSubagentChild importer (inbound-boundary-theta-callable :188-334, subagent-child-real-spawn :67-139, invoke-prompt-cell-enum-return :271-538, subagent-theta-roots-forwarding :213-339, subagent-invoke-inbound-enum-tag :151-306, plus nonfinite-return-refusal, return-depth-refusal, root-binder-model-exempt, union-arm-dispatch, envelope-result-carriage); same-wave intakes d7-89-01 and d7-91 file disjoint pairs of that set under the per-file-set precedent (PTQ-0759/1032/1077) and name this filing as the family head — land one shared helper once for all importers (triage: claude-fable-5-1)
