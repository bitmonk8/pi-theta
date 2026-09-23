---
id: PTQ-1310
title: b0422live re-derives the mkdtemp/spawn/teardown shell twice instead of using the expectPiPrintFixture helper its siblings use
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts:282-308
  - tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts:339-364
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# b0422live re-derives the mkdtemp/spawn/teardown shell twice instead of using the expectPiPrintFixture helper its siblings use

## Observation
`tests/helpers/pi-print-fixture-harness.ts` exports `expectPiPrintFixture`,
which plants a discovery root via `mkdtempSync`, writes the given files,
spawns one `pi -p` run via `spawnPiPrint`, asserts `exitCode`/`stdout`, and
tears the root and cwd down in a `finally`. Five files in the same bug-0406/
0411/0422/0444/0445 `system:`-interpolation family already call this helper
directly: `b0406live-object-param-system-interp-registration.test.ts`,
`b0411live-template-prose-doc-comment-registration.test.ts`,
`b0358-doc-comment-description-lowering.test.ts`,
`b0444live-array-union-element-system-interp.test.ts`, and
`b0445live-imported-array-element-system-interp.test.ts` (all import
`expectPiPrintFixture` from `../../helpers/pi-print-fixture-harness`).
`b0422live-imported-schema-system-interp-wire-and-refusal.test.ts` instead
imports `mkdtempSync`/`rmSync`/`writeFileSync` from `node:fs` directly and
hand-writes the identical two-mkdtemp/one-spawn/two-rmSync sequence twice —
once per `it()` — rather than calling the helper its own siblings use.

## Evidence

`tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts:282-308`:
```ts
    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0422wire-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0422wire-cwd-"));
    try {
      writeFileSync(join(thetaDir, "cfg.thetalib"), CFG_LIB, "utf8");
      writeFileSync(join(thetaDir, "b0422childwire.theta"), child, "utf8");
      writeFileSync(join(thetaDir, "b0422probewire.theta"), PROBE_WIRE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0422probewire",
        cwd: probeCwd,
      });
      expect(probe.exitCode, ...).toBe(0);
      expect(probe.stdout, ...).toContain(WIRE_OK);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
```

`tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts:339-364`
(second `it()`, same shape, only the stems/sentinel differ):
```ts
    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0422typo-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0422typo-cwd-"));
    try {
      writeFileSync(join(thetaDir, "cfg.thetalib"), CFG_LIB, "utf8");
      writeFileSync(join(thetaDir, "b0422childtypo.theta"), child, "utf8");
      writeFileSync(join(thetaDir, "b0422probetypo.theta"), PROBE_TYPO, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0422probetypo",
        cwd: probeCwd,
      });
      expect(probe.exitCode, ...).toBe(0);
      expect(probe.stdout, ...).toContain(REFUSED_ANSWER);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
```

`tests/live/acceptance/b0445live-imported-array-element-system-interp.test.ts:250-262`
(the sibling in the same family, calling the helper instead):
```ts
    await expectPiPrintFixture("b0445", {
      "types.thetalib": TYPES_LIB,
      "b0445childwire.theta": child,
      "b0445probe.theta": PROBE,
    }, {
      rootName: "",
      slashInvocation: "/b0445probe",
      expectedStdout: WIRE_OK,
      stdoutMessage: (probe) => ...,
    });
```

Search: `grep -n "expectPiPrintFixture\|mkdtempSync" tests/live/acceptance/b04{06,11,22,44,45}*.test.ts` shows `b0406`, `b0411` (via `b0358-doc-comment...`), `b0444`, and `b0445` import and call `expectPiPrintFixture` with zero direct `mkdtempSync` calls, while `b0422` imports `mkdtempSync`/`rmSync`/`writeFileSync` and calls `mkdtempSync` exactly 4 times (2 per `it()`, 2 `it()`s) and never imports `expectPiPrintFixture`.

## Why this is a problem
`expectPiPrintFixture` already composes exactly the sequence — plant root(s),
write files, spawn once, assert exitCode/stdout, tear down — that `b0422live`
re-derives from the lower-level `mkdtempSync`/`writeFileSync`/`rmSync`
primitives twice in the same file, at line ranges 282-308 and 339-364. Every
other file in the same bug family (0358/0406/0411/0444/0445) already imports
and calls the shared helper for the identical shape (a single discovery root,
a single spawn, a positive-`stdout`-contains check, teardown). `b0422live`
carries no fixture need the helper cannot express — both its `it()` blocks
write exactly the files the helper's `files` parameter takes and assert
exactly the `exitCode`+`stdout`-contains pair the helper already performs.

## Suggested direction (non-binding, optional)
`tests/helpers/pi-print-fixture-harness.ts`'s `expectPiPrintFixture` is
already the landing spot four sibling files in this exact family use for this
shape; observed here as the same call these siblings already make, not a new
design.

## False-positive check
- Gate-pin check: the file name matches none of `*gate*.test.ts` or the named
  gate-kin patterns; not applicable.
- Recording-double check: the cited blocks assert on a spawned real process's
  `exitCode`/`stdout`, not a call-recording double backing a "never called"
  witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "b0422live" docs/bugs/*.md` returns
  0 hits — the file is not named by any bug doc's witness list (bug 0422/0423
  each name only `docs/bugs/0422-...md` / `0423-...md` themselves, not this
  test file by path). No merge/rename/delete is proposed here in any case —
  only the setup/spawn/teardown sequence is cited as duplicated.
- coverage-matrix citation search: `grep -n "b0422live" docs/reference/coverage-matrix.md`
  returns 0 hits.
- Overlap check: `grep -rl "b0422live-imported-schema" quality/intake/*.md quality/resolved/*.md`
  hits only `PTQ-0480` (live-host precondition guard, a disjoint span),
  `PTQ-0553` (fakeThetaLibFs reimplementation, a disjoint concern), and
  `PTQ-1057` (probe errorCodes duplication, a disjoint span) — none of the
  three cites the mkdtemp/spawn/teardown shell this finding cites, and the
  resolved `PTQ-1077` (the closest prior finding of this exact shell across
  b0307/b0351/b0406/b0444) does not name `b0422live` in its location list or
  its triage note's fold-in list (which named only b0358, b0411, b0445).
- Live-suite posture check: `requireLiveHost()`'s fail-loud precondition
  (invoked earlier in the same `it()`s, outside the cited ranges) is the
  correct live-suite skip posture and is unaltered by this finding.
- Coverage drift: this finding does not claim any behaviour is untested; it
  is confined to the duplicated setup/spawn/teardown sequence inside tests
  that already exist, already pass their offline attribution guards, and
  already run against a live host when available.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at exactly 282-308 and 339-364; a stem/sentinel-normalised mktemp diff of the two blocks shows the statement sequence (mkdtempSync×2 → try/writeFileSync×3 → single spawnPiPrint → exitCode toBe(0) + stdout toContain(sentinel) → finally rmSync×2) identical, differing only in PROBE_WIRE/PROBE_TYPO and assertion-message prose; tests/helpers/pi-print-fixture-harness.ts#expectPiPrintFixture (via drivePiPrintFixtures) composes exactly that shape — one mkdtemp root + one mkdtemp cwd, files written from a record, one spawnPiPrint, the byte-identical `${label}: expected a no-error exit (0)…` exitCode check, stdout toContain, finally rmSync of root+cwd — so the file has no need the helper cannot express (rootName "" reproduces the `theta-b0422wire-` prefix as b0445 does); the sibling grep reproduces (b0358/b0406/b0411/b0444/b0445 each import+call expectPiPrintFixture with zero mkdtempSync; b0422 imports mkdtempSync/rmSync/writeFileSync and calls mkdtempSync ×4, never imports the helper); all locations under tests/, not a gate file, no recording double, requireLiveHost fail-loud posture untouched, no merge/rename/delete proposed; dedupe: the fixed PTQ-1077 ran an m=2/s=1 census that by construction excluded this m=4/s=2 file and its triage fold-in named only b0358/b0411/b0445, PTQ-1032 covers ctor-unresolved/inline-object-stray-close, and PTQ-0480/0553/0554/0623/1057 cite disjoint spans, so this is the family's next row not a duplicate; one accounting correction, non-refuting: the filing's `docs/bugs grep → 0 hits` is wrong — 8 bug docs (0422, 0423, 0441, 0442, 0443, 0448, 0450, 0465) name the file, but only by file name / `it` title (0422.md:290, 0423.md:231), never by line range into the cited shell (triage: claude-fable-5-1)
