---
id: PTQ-1043
title: The offender/probe/control H9a live-acceptance drive-and-teardown sequence is duplicated near-verbatim across eleven of the twelve in-scope files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/live/acceptance/b0302live-stem-twin-cycle.test.ts:217-293
  - tests/live/acceptance/b0304live-transitive-load-refusal.test.ts:179-243
  - tests/live/acceptance/b0314live-compound-assign.test.ts:144-203
  - tests/live/acceptance/b0315live-stdlib-arg-refusal.test.ts:142-199
  - tests/live/acceptance/b0324live-max-non-integer-load-refusal.test.ts:152-209
  - tests/live/acceptance/b0332live-spelled-arithmetic.test.ts:141-198
  - tests/live/acceptance/b0333live-transitive-reexport-load-refusal.test.ts:238-305
  - tests/live/acceptance/b0334live-multisource-collision-load-refusal.test.ts:264-354
  - tests/live/acceptance/b0335live-own-import-shadow-load-refusal.test.ts:219-282
  - tests/live/acceptance/b0341live-inferred-binding-accumulator-registers.test.ts:161-220
  - tests/live/acceptance/b0344live-commontype-literal-candidate-admittee.test.ts:189-248
sites: 11
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The offender/probe/control H9a live-acceptance drive-and-teardown sequence is duplicated near-verbatim across eleven of the twelve in-scope files

## Observation
Eleven of the twelve files reviewed in this wave each declare, from scratch,
the identically-shaped sequence: `await requireLiveHost();` (the correct
fail-loud live-host precondition, unchanged by this finding), then exactly
three `mkdtempSync(join(tmpdir(), "theta-<slug>-...-"))` calls (one discovery
root plus two per-spawn cwds), a `try { writeFileSync ×2-6 }` block writing
the file's own `OFFENDER`/`PROBE`/`CONTROL` (or equivalently-shaped) fixture
constants into the temp root, a first `spawnPiPrint` call whose result is
checked with an `exitCode` `toBe(0)` assertion and a `stdout` `toContain`
assertion against a committed positive sentinel, a second `spawnPiPrint` call
(`probe`) checked the same way against a `REFUSED`/`LOADED` sentinel pair
(`toContain(REFUSED)` plus `.not.toContain(LOADED)`), and a `finally { rmSync
×3-4 }` teardown. No `tests/helpers/` or `tests/live/acceptance/` module
exports this composed sequence; each file re-derives it independently of the
other ten. One file (`b0344live…`) states in its own header comment that it
"mirrors … clause for clause" a named sibling file in this same set
(`b0341live…`), naming the duplication directly.

## Evidence

`tests/live/acceptance/b0324live-max-non-integer-load-refusal.test.ts:152-165`:
```ts
    await requireLiveHost();

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0324-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0324-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0324-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0324offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0324probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b0324control.theta"), CONTROL, "utf8");

      // ---- (b) the well-formed compatible-max control registers and drives ----
      const control = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0324control",
        cwd: controlCwd,
```

`tests/live/acceptance/b0341live-inferred-binding-accumulator-registers.test.ts:161-171`
(same shape, different slug/sentinel names):
```ts
    await requireLiveHost();

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0341-root-"));
    const accumulatorCwd = mkdtempSync(join(tmpdir(), "theta-b0341-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0341-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0341accumulator.theta"), ACCUMULATOR, "utf8");
      writeFileSync(join(thetaDir, "b0341offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0341probe.theta"), PROBE, "utf8");

      // ---- (1) the previously-refused accumulator registers AND drives ----
      const accumulator = await spawnPiPrint({
```

`tests/live/acceptance/b0332live-spelled-arithmetic.test.ts:192-198` (the
matching teardown shape, recurring at every one of the eleven sites, varying
only in the number of `rmSync` calls, 3 or 4, depending on how many temp cwds
the file created):
```ts
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(controlCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
```

Normalised diff (slug/adjective/sentinel names replaced with placeholders
before diffing, re-run immediately before filing): `sed -n '144,203p'
b0314live-compound-assign.test.ts` against `sed -n '142,199p'
b0315live-stdlib-arg-refusal.test.ts`, both piped through the same slug
substitution, differ only in the assertion failure-message prose (the
sentence naming the specific defect and the specific arithmetic identity) —
the `mkdtempSync` triad, the `writeFileSync` sequence, the two-`spawnPiPrint`
structure, the four-part per-spawn assertion shape (exitCode, stdout-contains,
stdout-contains-second-sentinel, stdout-not-contains), and the `finally`
teardown are unchanged line-for-line.

`tests/live/acceptance/b0344live-commontype-literal-candidate-admittee.test.ts:16-19`
names the mirroring explicitly:
```ts
// TWIN LINEAGE. This file mirrors
// `tests/live/acceptance/b0341live-inferred-binding-accumulator-registers.test.ts`
// clause for clause. Bug 0341 widened the RECORDING side (an unannotated
```

Exact search and hit count for the pattern's presence across all eleven
sites: `grep -c "const thetaDir = mkdtempSync(join(tmpdir()" <each file>`
returns exactly `1` for all eleven files listed in `locations`; `grep -c
"const REFUSED = \"REFUSED\";" <each file>` also returns `1` for all eleven
(the twelfth in-scope file, `b0307live-value-position-query-err-binds.test.ts`,
uses a single-spawn, two-tempdir variant of this shape and is not counted
here).

## Why this is a problem
The precondition/spawn/assert/teardown sequence — the live-host guard call,
the `mkdtempSync` triad/quartet, the `writeFileSync` batch, the two
`spawnPiPrint` calls with their four-assertion bodies, and the `finally`
teardown — is declared from scratch in eleven files rather than
parameterised once by the per-bug fixture constants (`OFFENDER`/`PROBE`/
`CONTROL` or equivalent), the sentinel strings, and the temp-dir slug. One
file's own comment states the mirroring of a named sibling directly, which is
the duplication announcing itself. `tests/live/acceptance/harness.ts` already
centralises the lower-level primitives (`spawnPiPrint`, `requireLiveHost`)
that all eleven files build the same higher-level sequence on top of,
independently, eleven times.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` (or `tests/live/acceptance/`) module exporting the
offender/probe/control drive-and-assert sequence, parameterised by the
per-bug fixture sources, sentinel strings, and temp-dir slug, is the shape
all eleven files' structure already points at and the shape prior waves'
`PTQ-0755`/`PTQ-0759` filings named for a disjoint "offender/probe/clean"
file set elsewhere in `tests/live/acceptance/`.

## False-positive check
- Gate-pin check: none of the eleven files matches `*gate*.test.ts` or the
  named gate-kin patterns (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); not applicable.
- Recording-double check: none of the duplicated blocks records calls for a
  MUST-NOT witness; the assertions check spawned-process observables
  (`exitCode`, `stdout` content), not a double's call log; not applicable.
- docs/bugs/ signature search: `grep -rln "b0302\|b0304\|b0314\|b0315\|b0324\|b0332\|b0333\|b0334\|b0335\|b0341\|b0344" docs/bugs/*.md`
  shows each file cited by its own numbered bug doc as that bug's H9a
  acceptance witness; this finding does not propose merging, renaming, or
  deleting any of the eleven files or their `it()` cells — only observes
  their setup/spawn/teardown sequence is duplicated.
- coverage-matrix/bug-doc citation search: `grep -n "b0302\|b0304\|b0314\|b0315\|b0324\|b0332\|b0333\|b0334\|b0335\|b0341\|b0344" docs/reference/coverage-matrix.md`
  references these files by bug/cell name, not by internal line range, so no
  cited witness line is disturbed by this observation.
- Overlap check: `quality/issues/PTQ-0755-acceptance-offender-probe-clean-harness-duplicated.md`
  and `quality/issues/PTQ-0759-h9a-offender-probe-clean-harness-duplicated-second-set.md`
  cover the same general class of duplicated H9a drive sequence but cite
  twelve files entirely disjoint from the eleven cited here (their file sets:
  escaped-quote-inline-rename, generic-argument-inline-field-key,
  inline-field-name-not-identifier, inline-object-empty-field-type-truncation,
  inline-object-field-name-case, inline-object-malformed-entry-resync,
  inline-object-wire-name-rename, nested-fn-under-par-for-live,
  non-literal-discriminator-live, params-default-unterminated-literal,
  params-unterminated-literal, quoted-inline-field-name — none of which is
  among the eleven cited here, confirmed by direct comparison of both
  location lists); those two filings' shape also differs mechanically (a
  `diagnosticsOf`/`codesOf` reader pair, a `parseSystemNoteCodes` measurement
  block, and `assertStderrClean`/`assertCodesSubsetOfPermitted` calls) from
  the shape here (no `parseSystemNoteCodes` call in any of the eleven files;
  the sentinel pair is always literally named `REFUSED`/`LOADED`).
- Live-suite posture check: `requireLiveHost()`'s fail-loud precondition is
  the correct live-suite skip posture (AGENTS.md "Live-suite conventions"),
  present and unaltered in all eleven files; this finding does not claim the
  precondition handling itself is a smell.
- Coverage drift: this finding does not claim any behaviour is untested; it
  is confined to the duplicated setup/spawn/teardown sequence inside tests
  that already exist and already run.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all three excerpts and the b0344:16-19 "mirrors … clause for clause" header reproduce at the cited lines; every one of the eleven cited ranges carries the same `await requireLiveHost()` → `mkdtempSync`×3 (×4 in b0334) → `writeFileSync` batch → positive-sentinel spawn (exitCode `toBe(0)` + `toContain`) → probe spawn (`toContain(REFUSED)` + `.not.toContain(LOADED)`) → `finally rmSync`×3/4 shape; a mktemp slug-normalised diff of b0314:144-203 vs b0315:142-199 differs only in comment/assertion-message prose exactly as stated (0332 likewise, 18 prose lines); both stated greps return 1 for all eleven and 0/`REFUSED` for b0307; tests/live/acceptance/harness.ts exports only the primitives (`requireLiveHost`, `spawnPiPrint`, …) and no tests/helpers/ module composes the sequence (the only non-test `spawnPiPrint` user is harness.ts itself); all locations under tests/, none a gate file, no cell merge/rename/delete proposed, failLoudly posture not claimed as a smell, coverage-matrix and docs/bugs cite these files by name not line range; file set is disjoint (0 overlap) from open PTQ-0755/PTQ-0759, so under the per-file-set precedent that minted PTQ-0759 this is the family's third row rather than a duplicate, though the fixer should land the same shared helper — note `sites: 11` undercounts: 19 acceptance files carry the triad + `REFUSED`/`LOADED` pair (uncited: b0297live, b0298live, b0301live, b0345, b0346live, b0357, b0428live, ctor-unresolved) (triage: claude-fable-5-1)
