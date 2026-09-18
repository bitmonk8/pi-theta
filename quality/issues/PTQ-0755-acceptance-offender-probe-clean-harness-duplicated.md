---
id: PTQ-0755
title: The offender/probe/clean H9a live-acceptance drive sequence is duplicated near-verbatim across seven files instead of a shared tests/helpers/ harness
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/acceptance/escaped-quote-inline-rename-load-refusal.test.ts:146-154,176-187
  - tests/live/acceptance/generic-argument-inline-field-key-load-refusal.test.ts:150-158,181-192
  - tests/live/acceptance/inline-field-name-not-identifier-load-refusal.test.ts:151-159,181-192
  - tests/live/acceptance/inline-object-empty-field-type-truncation-load-refusal.test.ts:164-172,199-210
  - tests/live/acceptance/inline-object-field-name-case-load-refusal.test.ts:152-161,184-195
  - tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts:149-158,186-197
  - tests/live/acceptance/inline-object-wire-name-rename-load-refusal.test.ts:142-149,172-183
sites: 7
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# The offender/probe/clean H9a live-acceptance drive sequence is duplicated near-verbatim across seven files instead of a shared tests/helpers/ harness

## Observation
Seven files under `tests/live/acceptance/` each implement the identical "offender / probe / clean" H9a acceptance shape: a pair of local `diagnosticsOf`/`codesOf` reader functions over `parseDoc`, a `requireLiveHost()` precondition check with the same `failLoudly` message, three `mkdtempSync(join(tmpdir(), "theta-<slug>-...-"))` calls, a `try { writeFileSync ×3; spawnPiPrint` clean-then-probe drive with the same four-assertion shape per spawn, a `parseSystemNoteCodes` measurement block, and a `finally { rmSync ×3 }` teardown. Every file's own header comment states it "mirrors" a named sibling file's structure "exactly." No `tests/helpers/` module currently exports this sequence; each file declares it from scratch.

## Evidence

`tests/live/acceptance/escaped-quote-inline-rename-load-refusal.test.ts:146-154`:
```typescript
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Codes only, for the attribution guard. */
function codesOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => d.code);
}
```
`tests/live/acceptance/escaped-quote-inline-rename-load-refusal.test.ts:176-187`:
```typescript
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0229-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b0229-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0229-cwd-"));
    try {
      writeFileSync(join(thetaDir, "escoffender.theta"), OFFENDER, "utf8");
```

`tests/live/acceptance/generic-argument-inline-field-key-load-refusal.test.ts:181-192` (identical shape, `theta-b0233-*`):
```typescript
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0233-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b0233-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0233-cwd-"));
    try {
      writeFileSync(join(thetaDir, "gaoffender.theta"), OFFENDER, "utf8");
```

`tests/live/acceptance/inline-field-name-not-identifier-load-refusal.test.ts:181-192` (identical shape, `theta-b0228-*`):
```typescript
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0228-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b0228-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0228-cwd-"));
    try {
      writeFileSync(join(thetaDir, "nidoffender.theta"), OFFENDER, "utf8");
```

`tests/live/acceptance/inline-object-empty-field-type-truncation-load-refusal.test.ts:199-210` (identical shape, `theta-b237-*`):
```typescript
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b237-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b237-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b237-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b237offender.theta"), OFFENDER, "utf8");
```

`tests/live/acceptance/inline-object-field-name-case-load-refusal.test.ts:184-195` (identical shape, `theta-cellbcm-*`):
```typescript
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-cellbcm-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-cellbcm-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-cellbcm-cwd-"));
    try {
      writeFileSync(join(thetaDir, "cellbcmoffender.theta"), OFFENDER, "utf8");
```

`tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts:186-197` (identical shape, `theta-cellmero-*`):
```typescript
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-cellmero-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-cellmero-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-cellmero-cwd-"));
    try {
      writeFileSync(join(thetaDir, "cellmerooffender.theta"), OFFENDER, "utf8");
```

`tests/live/acceptance/inline-object-wire-name-rename-load-refusal.test.ts:172-183` (identical shape, `theta-b0160-*`):
```typescript
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0160-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b0160-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0160-cwd-"));
    try {
      writeFileSync(join(thetaDir, "renoffender.theta"), OFFENDER, "utf8");
```

Pattern search: `grep -n "^function diagnosticsOf\|^function codesOf" tests/live/acceptance/*.test.ts` returns exactly one identical pair per file for all seven files above (two of the pairs wrap the arrow function body across an extra line — `inline-object-field-name-case` and `inline-object-malformed-entry-resync` — otherwise byte-identical). Each file's own header comment states the mirroring explicitly, e.g. `inline-field-name-not-identifier-load-refusal.test.ts:16-19` ("mirroring the structure bug 0160 shipped at this same parser leaf … offender / probe / clean, same two measurements below") and `inline-object-field-name-case-load-refusal.test.ts:14-16` ("mirroring bug 0176's own H9a acceptance file … structure exactly").

The four-assertion-per-spawn body (exit code 0 check, stdout-contains-sentinel check, empty-stderr check via `.split(/\r?\n/).filter(...)`, and `parseSystemNoteCodes(...).toEqual([])`) recurs with the same four assertions, same four message templates (varying only the sentinel/code names), across all seven `clean` spawns and the matching `probe` spawn pair in each file — visible in the full bodies read for this review (e.g. `escaped-quote-inline-rename-load-refusal.test.ts:213-240`, `inline-object-wire-name-rename-load-refusal.test.ts:200-229`, and the equivalent ranges in the other five files).

## Why this is a problem
The setup/precondition/spawn/teardown sequence — `diagnosticsOf`/`codesOf` readers, the `requireLiveHost` guard with its literal failure message, the three-tempdir `mkdtempSync` calls, the `writeFileSync` triad, the clean-then-probe `spawnPiPrint` calls with their four-assertion bodies, the `parseSystemNoteCodes` measurement, and the `finally` teardown — is declared from scratch in each of the seven files rather than parameterised once. Each file's own comment names this as intentional mirroring of a named sibling file's structure, which is the duplication announcing itself rather than a coincidence. `tests/live/acceptance/harness.ts` already centralises the lower-level primitives (`spawnPiPrint`, `requireLiveHost`, `parseSystemNoteCodes`, `failLoudly`) that these seven files build the same higher-level sequence on top of, independently, seven times.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` (or `tests/live/acceptance/`) module exporting the offender/probe/clean drive-and-assert sequence, parameterised by the per-bug OFFENDER/PROBE/CLEAN sources, sentinel strings, and temp-dir slug, is the shape all seven files' own "mirrors X exactly" comments already point at — a repository-wide count of how many additional files share this exact shape was not run and is left as a routing note rather than an inventory claim.

## False-positive check
- Gate-pin check: none of the seven files matches `*gate*.test.ts` or the named gate-kin patterns (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); not applicable.
- Recording-double check: none of the duplicated helpers records calls for a MUST-NOT witness; `diagnosticsOf`/`codesOf` render a real parser's diagnostics, and the assertion bodies check spawned-process observables, not a double's call log; not applicable.
- docs/bugs/ signature search: `grep -rln "load-refusal.test.ts" docs/bugs/*.md` shows each file cited by its own numbered bug doc (0154, 0160, 0228, 0229, 0231, 0233, 0237) as that bug's H9a acceptance witness; none of those citations concerns the shared drive-sequence shape under evidence here, and this finding does not propose merging, renaming, or deleting any of the seven files or their `it()` cells — only observes that their setup/spawn/teardown sequence is duplicated.
- coverage-matrix/bug-doc citation search: `grep -n "acceptance" docs/reference/coverage-matrix.md` was checked; the seven files are referenced by their bug docs, not by the coverage matrix, by cell/file name rather than by internal line range, so no cited witness line is disturbed by this observation.
- Live-suite posture check: `requireLiveHost()`'s `failLoudly` precondition is the correct live-suite skip posture (AGENTS.md "Live-suite conventions"), present and unaltered by this finding in all seven files; this finding does not claim the precondition handling itself is a smell.
- Coverage drift: this finding does not claim any behaviour is untested; it is confined to the duplicated setup/spawn/teardown sequence inside tests that already exist and already run.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all seven excerpts reproduce at the cited lines; after normalising slug/file-stem/sibling-adjective the b0160 and b0229 drive blocks (requireLiveHost guard → mkdtempSync×3 → writeFileSync×3 → clean spawn with 4 asserts → probe spawn with 4 asserts → parseSystemNoteCodes measurement → finally rmSync×3) differ by 2 of ~74 lines; tests/live/acceptance/harness.ts exports only the primitives and no tests/helpers/ module exports the composed sequence; all locations under tests/, none a gate file, no cell merge/rename/delete proposed, failLoudly posture not claimed as a smell; no open/resolved PTQ tracks this sequence (PTQ-0226/0240/0312/0395 are other harnesses) — note the stated grep actually hits 14 acceptance files (34 carry the 3-tempdir triad), so sites:7 undercounts; same-wave intake d7-71 is the declared companion for five more files and d7-01 a guard-only subset (triage: claude-fable-5-1)

## Fix attempts
- qw20260918155535: skipped — [PTQ-0480-live-host-precondition-guard-duplicated.md] PTQ-0480: Centralized all 41 empty-model guards in requireLiveHost; added offline regression coverage. Exact gate passed: 687 files, 11,569 tests. / PTQ-0553: Reused the shared filesystem helper at all three sites, preserving EACCES behavior and the integrated own-property check. Retry conflict avoided: recording-system-note-channel.ts untouched. / PTQ-0554: Replaced all three filesystem copies with shared-helper imports; existing tests and assertions unchanged. / PTQ-0758: Removed both filesystem copies and shared the identical importCheckCodes driver, retaining its assertion. All nine targeted live tests across eight files passed. No existing tests were deleted. || [PTQ-0486-parseerrorcodes-helper-octuplicated-live-acceptance.md] PTQ-0486: Replaced all eight local readers with the existing errorCodes helper; attribution assertions remain unchanged. / PTQ-0552: Reused the already-integrated FAIL_CLOSED_MARKERS export at all three sites. Left recording-system-note-channel.ts untouched, addressing the retry conflict. / PTQ-0618: Consolidated all three readers into registry-oracle.ts, preserving every template assertion. Kept the LPA import at the removed declaration’s location to preserve the citation gate. / PTQ-0619: Shared the fixture builder and registration-refusal scaffold across all three cells, retaining extra controls and failure messages. No tests were renamed or deleted. Verification for all four issues: exact gate passed (687 files, 11,569 tests); all 17 targeted live witnesses passed. ||
