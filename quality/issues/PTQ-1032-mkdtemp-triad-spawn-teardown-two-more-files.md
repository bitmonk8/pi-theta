---
id: PTQ-1032
title: The mkdtempSync-triad / spawn / finally-rmSync setup-teardown sequence is redeclared from scratch in two acceptance files outside the already-filed offender/probe/clean set
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/acceptance/ctor-unresolved-load-refusal.test.ts:155-164
  - tests/live/acceptance/ctor-unresolved-load-refusal.test.ts:192-246
  - tests/live/acceptance/inline-object-stray-close-token-load.test.ts:136-149
  - tests/live/acceptance/inline-object-stray-close-token-load.test.ts:195-273
sites: 2
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The mkdtempSync-triad / spawn / finally-rmSync setup-teardown sequence is redeclared from scratch in two acceptance files outside the already-filed offender/probe/clean set

## Observation
`tests/live/acceptance/ctor-unresolved-load-refusal.test.ts` and
`tests/live/acceptance/inline-object-stray-close-token-load.test.ts` each
declare, independently, the same lower-level setup/teardown skeleton already
identified as duplicated across a disjoint set of twelve other
`tests/live/acceptance/*.test.ts` files (`PTQ-0755`, 7 files;
`PTQ-0759`, 5 files): a `diagnosticsOf` reader over `parseDoc`, three
`mkdtempSync(join(tmpdir(), "theta-<slug>-...-"))` calls, a
`try { writeFileSync ...; spawnPiPrint ...; spawnPiPrint ... }` block driving
two `pi -p` runs with per-spawn `exitCode`/`stdout` assertions, and a
`finally { rmSync ×3 }` teardown. Neither of these two files is cited in
either PTQ-0755's or PTQ-0759's location lists, and no `tests/helpers/`
module exports this skeleton.

## Evidence

`tests/live/acceptance/ctor-unresolved-load-refusal.test.ts:155-164`:
```ts
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map(
    (d) => `${d.severity} ${d.code}: ${d.message}`,
  );
}

/** Codes only, for the attribution guard. */
function codesOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => d.code);
}
```

`tests/live/acceptance/ctor-unresolved-load-refusal.test.ts:192-198,242-246`:
```ts
    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b25-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b25-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b25-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b25offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b25probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b25control.theta"), CONTROL, "utf8");
      ...
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(controlCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
```

`tests/live/acceptance/inline-object-stray-close-token-load.test.ts:136-140`:
```ts
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/live/acceptance/inline-object-stray-close-token-load.test.ts:195-200,269-273`:
```ts
    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0238-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0238-cwd-"));
    const offenderCwd = mkdtempSync(join(tmpdir(), "theta-b0238-cwd-"));
    try {
      writeFileSync(join(thetaDir, `${OFFENDER_STEM}.theta`), offender, "utf8");
      writeFileSync(join(thetaDir, `${CONTROL_STEM}.theta`), control, "utf8");
      ...
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(controlCwd, { recursive: true, force: true });
      rmSync(offenderCwd, { recursive: true, force: true });
    }
```

Both files declare `diagnosticsOf` locally rather than importing it, and both
repeat the three-`mkdtempSync`/`try`-drive/`finally`-triple-`rmSync` shell
identified as PTQ-0755's and PTQ-0759's root cause, over two files neither of
those two findings' location lists names. `grep -rn "^function diagnosticsOf"
tests/live/acceptance/*.test.ts` confirms both files declare their own copy.

## Why this is a problem
The setup/spawn/teardown shell — the `diagnosticsOf` reader, the
`mkdtempSync` triad, the `try`-wrapped `writeFileSync`/`spawnPiPrint` drive,
and the `finally { rmSync ×3 }` — is declared from scratch in each of these
two files, the same pattern already confirmed as duplicated boilerplate in
`PTQ-0755` and `PTQ-0759` for a disjoint file set. `tests/live/acceptance/harness.ts`
centralises the lower-level primitives (`spawnPiPrint`, `requireLiveHost`,
`parseSystemNoteCodes`) these two files (like the twelve already cited) build
the same higher-level sequence on top of, independently.

## Suggested direction (non-binding, optional)
The same shared drive-and-teardown module PTQ-0755/PTQ-0759 already point at
as the natural home for the twelve files they cite is the natural home for
these two files' identical setup/teardown shell as well — observed here as an
extension of that already-recognised shape, not a new design.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named
  gate-kin patterns; not applicable.
- Recording-double check: `diagnosticsOf` renders a real parser's
  diagnostics for a later positive assertion, not a "never called" witness;
  not applicable.
- docs/bugs/ signature search: `ctor-unresolved-load-refusal.test.ts` is
  cited by `docs/bugs/0025-ctor-unresolved-schema-name-passthrough.md` and
  `inline-object-stray-close-token-load.test.ts` by
  `docs/bugs/0238-stray-close-token-underflows-top-level-split.md`, each as
  that bug's H9a acceptance witness by file name; this finding proposes no
  merge, rename, or deletion of either file or its `it()` cell — only that
  the setup/teardown shell is duplicated.
- coverage-matrix/bug-doc citation search: `grep -n "acceptance"
  docs/reference/coverage-matrix.md` shows no internal line-range citation
  into either file that this finding's cited ranges would disturb.
- Overlap check: `grep -n "ctor-unresolved-load-refusal\|inline-object-stray-close-token-load"`
  against `PTQ-0755`'s and `PTQ-0759`'s own location lists returns 0 hits —
  neither file is cited by either finding, so this is not the same instance
  re-filed.
- Live-suite posture check: `requireLiveHost()`'s `failLoudly` precondition
  is the correct live-suite skip posture and is unaltered by this finding in
  both files; not claimed as a smell here.
- Coverage drift: this finding does not claim any behaviour is untested; it
  is confined to the duplicated setup/spawn/teardown shell inside tests that
  already exist and already run.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all four excerpts reproduce at exactly the cited lines (ctor :155/:162 diagnosticsOf/codesOf, :192-194 mkdtempSync×3, :242-246 finally rmSync×3; stray-close :136 diagnosticsOf, :195-197 triad, :269-273 teardown); slug/adjective-normalised diff against PTQ-0755's b0160 copy shares 27 of 39 structural lines for ctor (mkdtemp triad → try/writeFileSync → two spawnPiPrint with exitCode/stdout asserts → REFUSED/LOADED sentinels → finally rmSync×3; ctor deliberately omits the stderr-empty/permitted-codes asserts per its bug-0030 scope-isolation header, so the shared payload is the shell the title names) and 23 of 53 for stray-close (control/offender-direct variant, triad and teardown verbatim); no tests/helpers/ or harness.ts export composes the sequence (harness.ts exports primitives only); the overlap grep reproduces — neither file appears in PTQ-0755/PTQ-0759's locations nor in the two same-wave sibling intakes (d7-02 b0297/b0298/b0301 and d7-02 b0302…b0344), and no PTQ names either file — so this is the third disjoint file set of the same pattern class, which PTQ-0759's confirmation already ruled is filed per set (registry-oracle-family precedent); all locations under tests/, boilerplate-duplication class, no gate file, failLoudly posture not claimed, no cell merge/rename/delete (bug docs 0025/0238 cite by file name only). Two accounting notes for the fixer, neither changing the outcome: (1) `sites: 2` undercounts — the `^function diagnosticsOf` grep now hits 15 acceptance files, and tests/live/acceptance/b0380-params-key-not-identifier-load-refusal.test.ts:134-225 carries the full PTQ-0755 shell (diagnosticsOf/codesOf, triad :166-168, clean/probe spawns, parseSystemNoteCodes, rmSync×3 :223-225) yet is cited by none of 0755/0759/this — fold it in; (2) both files' `diagnosticsOf` is a thin wrapper over the already-exported `diagLines(parseDoc(...))` (tests/helpers/e2e-s1.ts:290) and ctor's `codesOf` over e2e-s1.ts:224 `codesOf`, the angle sibling intake d7-03 files for b0380 (triage: claude-fable-5-1)
