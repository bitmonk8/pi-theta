---
id: PTQ-1077
title: The two-mkdtempSync/single-spawnPiPrint/try-finally-rmSync sequence is redeclared from scratch in four in-scope H9a live-acceptance files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/live/acceptance/b0307live-value-position-query-err-binds.test.ts:136-170
  - tests/live/acceptance/b0351live-value-position-query-success-binds.test.ts:140-174
  - tests/live/acceptance/b0406live-object-param-system-interp-registration.test.ts:164-191
  - tests/live/acceptance/b0444live-array-union-element-system-interp.test.ts:175-202
sites: 4
fix_scope: module
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The two-mkdtempSync/single-spawnPiPrint/try-finally-rmSync sequence is redeclared from scratch in four in-scope H9a live-acceptance files

## Observation
Four files in this review's scope each declare, from scratch, the identical
lower-level drive shape: `await requireLiveHost();` (the correct fail-loud
live-host precondition, unaffected by this finding), then exactly two
`mkdtempSync(join(tmpdir(), "theta-<slug>-..."))` calls (one discovery root,
one probe cwd), a `try { writeFileSync ×2; const probe = await spawnPiPrint({
thetaDir, slashInvocation: ..., cwd: probeCwd }); }` block with a single
`spawnPiPrint` call, an `expect(probe.exitCode, ...).toBe(0)` assertion
followed by an `expect(probe.stdout, ...).toContain(<sentinel>)` assertion,
and a `finally { rmSync(thetaDir, ...); rmSync(probeCwd, ...); }` teardown of
exactly two calls. This shape is distinct from the already-filed
three-`mkdtempSync`/two-`spawnPiPrint` "offender/probe/control" family
(`PTQ-0755`, `PTQ-0759`, `PTQ-1043`): those cite twenty-three other
`tests/live/acceptance/` files across three disjoint sets, and `PTQ-1043`'s
own evidence explicitly excludes `b0307live-value-position-query-err-binds`
as "a single-spawn, two-tempdir variant of this shape ... not counted here."
No `tests/helpers/` or `tests/live/acceptance/harness.ts` module exports this
composed two-mkdtemp/one-spawn/two-rmSync sequence; each of these four files
re-derives it independently.

## Evidence

`tests/live/acceptance/b0307live-value-position-query-err-binds.test.ts:136-170`:
```ts
    await requireLiveHost();

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0307-root-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0307-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0307inner.theta"), INNER, "utf8");
      writeFileSync(join(thetaDir, "b0307probe.theta"), PROBE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0307probe",
        cwd: probeCwd,
      });

      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the inner theta's value-position query fails with ` +
        ...
      ).toContain(FIXED_ANSWER);
      // NOTE: no `.not.toContain(UNFIXED_ANSWER)` ...
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
```

`tests/live/acceptance/b0351live-value-position-query-success-binds.test.ts:140-174`
(same shape, `theta-b0351-*`):
```ts
    await requireLiveHost();

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0351-root-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0351-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0351inner.theta"), INNER, "utf8");
      writeFileSync(join(thetaDir, "b0351probe.theta"), PROBE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0351probe",
        cwd: probeCwd,
      });
      ...
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
```

`tests/live/acceptance/b0406live-object-param-system-interp-registration.test.ts:164-191`
(same shape, `theta-b0406-*`, only the file stems and sentinel names differ):
```ts
    await requireLiveHost();

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0406-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0406-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0406child.theta"), child, "utf8");
      writeFileSync(join(thetaDir, "b0406probe.theta"), PROBE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0406probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        ...
      ).toContain(REGISTERED_OK);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
```

`tests/live/acceptance/b0444live-array-union-element-system-interp.test.ts:175-202`
(same shape, `theta-b0444-*`):
```ts
    await requireLiveHost();

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0444-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0444-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0444childwire.theta"), child, "utf8");
      writeFileSync(join(thetaDir, "b0444probe.theta"), PROBE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0444probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        ...
      ).toContain(WIRE_OK);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
```

Exact search executed immediately before filing:
`grep -n "await requireLiveHost();" <each file>` followed by
`grep -n "mkdtempSync\|} finally {\|rmSync(" <each file>` — all four files show
exactly `await requireLiveHost();` once, exactly two `mkdtempSync` calls,
exactly one `} finally {` and exactly two `rmSync` calls at the cited line
ranges, and no fifth or sixth `mkdtempSync`/`rmSync` anywhere in the file.

## Why this is a problem
The precondition-guard-then-drive-then-teardown shape — two `mkdtempSync`
calls, a `try` block writing two fixture files and issuing exactly one
`spawnPiPrint` call, a fixed two-assertion check on that single spawn
(`exitCode` then `stdout`), and a `finally` block with exactly two `rmSync`
calls — is retyped from scratch in each of these four files rather than
drawn from one place. `tests/live/acceptance/harness.ts` already centralises
the lower-level primitives (`spawnPiPrint`, `requireLiveHost`) all four files
build this identical higher-level sequence on top of, independently, four
times; the only per-file variation is the temp-dir slug, the fixture file
names, and the sentinel string threaded into the two assertions.

## Suggested direction (non-binding, optional)
The same `tests/helpers/`-or-`tests/live/acceptance/`-level shared module
that prior filings (`PTQ-0755`, `PTQ-0759`, `PTQ-1043`) already point at for
the disjoint three-mkdtemp/two-spawn "offender/probe/control" file sets is
the natural home for this fourth, disjoint two-mkdtemp/one-spawn variant as
well — observed here as an extension of that already-recognised shape, not a
new design.

## False-positive check
- Gate-pin check: none of the four files matches `*gate*.test.ts` or the
  named gate-kin patterns (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); not applicable.
- Recording-double check: the cited blocks assert on a spawned real process's
  `exitCode`/`stdout`, not on a call-recording double backing a "never
  called" witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "b0307live\|b0351live\|b0406live\|b0444live" docs/bugs/*.md`
  shows each file cited only by its own numbered bug document, by file name,
  as that bug's H9a acceptance witness — no internal line-range citation.
  This finding proposes no merge, rename, or deletion of any of the four
  files or their `it()` cells, only that their setup/spawn/teardown sequence
  is duplicated.
- coverage-matrix/bug-doc citation search: `grep -n "b0307live\|b0351live\|b0406live\|b0444live" docs/reference/coverage-matrix.md`
  returns 0 hits, so no cited witness line is disturbed by this observation.
- Live-suite posture check: `requireLiveHost()`'s fail-loud precondition is
  the correct live-suite skip posture (AGENTS.md "Live-suite conventions"),
  present and unaltered in all four files; this finding does not claim the
  precondition handling itself is a smell.
- Overlap check: `grep -n "b0307live-value-position-query-err-binds\|b0351live-value-position-query-success-binds\|b0406live-object-param-system-interp-registration\|b0444live-array-union-element-system-interp"`
  against the location lists of `PTQ-0755`, `PTQ-0759` and `PTQ-1043` returns
  0 hits (their combined 23 files are entirely disjoint from these four);
  `PTQ-1043`'s own text explicitly names `b0307live-value-position-query-err-binds`
  as excluded from its count as "a single-spawn, two-tempdir variant ... not
  counted here", confirming this is a distinct, previously unfiled instance
  of the same duplication family rather than a re-filing of an existing row.
  No open or resolved PTQ's location list names `b0406live-object-param-system-interp-registration.test.ts`
  or `b0444live-array-union-element-system-interp.test.ts` for this shape
  (`PTQ-1040`, resolved, covers only their local `errorCodes` duplication, a
  disjoint span earlier in each file).
- Coverage drift: this finding does not claim any behaviour is untested; it
  is confined to the duplicated setup/spawn/teardown sequence inside tests
  that already exist and already run.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim at exactly the cited lines (b0307:136-170, b0351:140-174, b0406:164-191, b0444:175-202); the stated greps reproduce for all four (requireLiveHost ×1, mkdtempSync ×2, `await spawnPiPrint(` ×1, `} finally {` ×1, rmSync ×2, none elsewhere in the file); a slug/stem/sentinel-normalised mktemp sed-range diff shows the statement sequence (requireLiveHost → mkdtempSync×2 → try/writeFileSync×2 → single spawnPiPrint → exitCode toBe(0) + stdout toContain(sentinel) → finally rmSync×2) identical across all four, with the 12-18 differing lines between siblings all assertion-message prose; tests/live/acceptance/harness.ts exports only the primitives (its lone mkdtempSync at :389 is materialiseHostBoundThetaDir, a different shape) and no tests/helpers/ module composes the sequence; all locations under tests/, none a gate file, no recording double, no cell merge/rename/delete proposed, failLoudly posture not claimed as a smell, coverage-matrix → 0 hits, no docs/bugs line-range citation into any of the four; file set has 0 overlap with open PTQ-0755/0759/1032/1041/1043 and PTQ-1043:121-122 explicitly declines b0307 as the uncounted single-spawn/two-tempdir variant, so under the per-file-set precedent that minted 0759/1032/1041/1043 this is the family's next row rather than a duplicate, and the fixer should land the same shared helper — two accounting corrections: `sites: 4` undercounts, the m=2/s=1 census over tests/live/acceptance/*.test.ts hits 7 files (uncited: b0358-doc-comment-description-lowering :157-185, b0411live-template-prose-doc-comment-registration :153-181, b0445live-imported-array-element-system-interp :250-278 — the latter with writeFileSync×3), and the docs/bugs grep hits 13 bug docs, not only each file's own (all by file name, none by line range; non-refuting) (triage: claude-fable-5-1)
