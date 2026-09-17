---
id: PTQ-0759
title: The offender/probe/clean H9a live-acceptance drive sequence is duplicated across five more tests/live/acceptance files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/nested-fn-under-par-for-live.test.ts:147-155,177-190,243-249
  - tests/live/acceptance/non-literal-discriminator-live.test.ts:144-152,174-187,240-246
  - tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts:243-249,306-308,370-376
  - tests/live/acceptance/params-unterminated-literal-load-refusal.test.ts:157-163,187-198,249-255
  - tests/live/acceptance/quoted-inline-field-name-load-refusal.test.ts:158-166,190-201,254-260
sites: 5
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The offender/probe/clean H9a live-acceptance drive sequence is duplicated across five more tests/live/acceptance files

## Observation
Five files in this review's scope each declare, from scratch, the same
"offender / probe / clean" H9a acceptance shape already observed elsewhere in
this suite: a `diagnosticsOf`/`codesOf` reader pair over `parseDoc`, a
`requireLiveHost()`-then-`if (modelId.length === 0) failLoudly(...)`
precondition guard, three `mkdtempSync(join(tmpdir(), "theta-<slug>-...-"))`
calls, a `try { writeFileSync ×3-4; spawnPiPrint clean; spawnPiPrint probe }`
drive with the same four-assertion-per-spawn shape, a
`parseSystemNoteCodes(probe.stdout + probe.stderr)` measurement block, and a
`finally { rmSync ×3 }` teardown. No `tests/helpers/` (or
`tests/live/acceptance/`) module currently exports this composed sequence;
each file re-derives it independently of the other four.

## Evidence

`tests/live/acceptance/nested-fn-under-par-for-live.test.ts:147-155`:
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

`tests/live/acceptance/nested-fn-under-par-for-live.test.ts:177-190`:
```ts
    // Live-host precondition — fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-nfpf-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-nfpf-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-nfpf-cwd-"));
    try {
      writeFileSync(join(thetaDir, "nfpfoffender.theta"), OFFENDER, "utf8");
```

`tests/live/acceptance/non-literal-discriminator-live.test.ts:174-187` (same
shape, `theta-cellb-*`):
```ts
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-cellb-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-cellb-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-cellb-cwd-"));
```

`tests/live/acceptance/params-unterminated-literal-load-refusal.test.ts:187-198`
(same shape, `theta-b0232-*`):
```ts
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0232-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b0232-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0232-cwd-"));
```

`tests/live/acceptance/quoted-inline-field-name-load-refusal.test.ts:190-201`
(same shape, `theta-cellqfn-*`):
```ts
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-cellqfn-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-cellqfn-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-cellqfn-cwd-"));
```

`tests/live/acceptance/params-default-unterminated-literal-load-refusal.test.ts:295-308`
carries the same `mkdtempSync` triad and `try { writeFileSync ×4 }` shape,
varying only in its precondition (it derives `bindModel` from
`resolveAcceptanceHost()` directly rather than through `requireLiveHost()`,
because two of its four fixtures need a `bind_model:` line):
```ts
    if (host.model.length === 0 || host.provider.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned " +
...
    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0239-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b0239-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0239-cwd-"));
```

Each of the five files' own `parseSystemNoteCodes(probe.stdout + probe.stderr)`
measurement block (nested-fn-under-par-for-live.test.ts:243-249,
non-literal-discriminator-live.test.ts:240-246,
params-default-unterminated-literal-load-refusal.test.ts:370-376,
params-unterminated-literal-load-refusal.test.ts:249-255,
quoted-inline-field-name-load-refusal.test.ts:254-260) is byte-identical in
structure — `const observedCodes = parseSystemNoteCodes(...)`, an
`expect(observedCodes, ...).toEqual([])`, followed by a `finally { rmSync ×3 }`
block. Exact search: `grep -n "^function diagnosticsOf\|^function codesOf"`
over these five files returns exactly one identical pair per file.

## Why this is a problem
The setup/precondition/spawn/teardown sequence — `diagnosticsOf`/`codesOf`
readers, the live-host precondition guard, the three-tempdir `mkdtempSync`
calls, the `writeFileSync` triad/quartet, the clean-then-probe `spawnPiPrint`
calls with their four-assertion bodies, the `parseSystemNoteCodes`
measurement, and the `finally` teardown — is declared from scratch in each of
these five files rather than parameterised once, the same shape already
observed (across a different, non-overlapping file set) in this wave's
`qw20260917154546-d7-69-acceptance-offender-probe-clean-harness-duplicated.md`.
`tests/live/acceptance/harness.ts` already centralises the lower-level
primitives (`spawnPiPrint`, `requireLiveHost`, `parseSystemNoteCodes`,
`failLoudly`) that all five files build the same higher-level sequence on top
of, independently, five more times.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` (or `tests/live/acceptance/`) module exporting the
offender/probe/clean drive-and-assert sequence, parameterised by the
per-bug OFFENDER/PROBE/CLEAN sources, sentinel strings, and temp-dir slug, is
the shape both this file set and the sibling `qw20260917154546-d7-69` file set
already point at.

## False-positive check
- Gate-pin check: none of the five files matches `*gate*.test.ts` or the
  named gate-kin patterns; not applicable.
- Recording-double check: none of the duplicated helpers records calls for a
  MUST-NOT witness; `diagnosticsOf`/`codesOf` render a real parser's
  diagnostics, and the assertion bodies check spawned-process observables,
  not a double's call log; not applicable.
- docs/bugs/ signature search: each file is cited by its own numbered bug doc
  (0118, 0128, 0232, 0239, 0176) as that bug's H9a acceptance witness; this
  finding does not propose merging, renaming, or deleting any of the five
  files or their `it()` cells — only observes their setup/spawn/teardown
  sequence is duplicated.
- coverage-matrix/bug-doc citation search: `grep -n "acceptance" docs/reference/coverage-matrix.md`
  shows these files referenced by bug doc / cell name rather than internal
  line range, so no cited witness line is disturbed.
- Overlap check: `qw20260917154546-d7-69-acceptance-offender-probe-clean-harness-duplicated.md`
  already exists for this exact pattern class but cites seven different files
  (escaped-quote-inline-rename, generic-argument-inline-field-key,
  inline-field-name-not-identifier, inline-object-empty-field-type-truncation,
  inline-object-field-name-case, inline-object-malformed-entry-resync,
  inline-object-wire-name-rename) — none of which is among the five cited
  here, confirmed by direct comparison of both location lists.
- Live-suite posture check: `requireLiveHost()`'s `failLoudly` precondition is
  the correct live-suite skip posture (AGENTS.md "Live-suite conventions"),
  present and unaltered in all five files; this finding does not claim the
  precondition handling itself is a smell (a related but distinct
  "requireLiveHost() call ignored/unawaited" observation appears in a separate
  finding, `qw20260917154546-d7-72`, over a different file).
- Coverage drift: this finding does not claim any behaviour is untested; it
  is confined to the duplicated setup/spawn/teardown sequence inside tests
  that already exist and already run.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all five files' excerpts reproduce at the cited lines (diagnosticsOf/codesOf pair once per file, requireLiveHost/failLoudly guard → mkdtempSync×3 → writeFileSync×3-4 → clean spawn 4 asserts → probe spawn → parseSystemNoteCodes measurement → finally rmSync×3); slug/adjective-normalised diff of the nfpf vs cellqfn drive blocks differs in 8 of 76 lines, all comment/message wording; tests/live/acceptance/harness.ts exports only the primitives and no tests/helpers/ module composes the sequence; all locations under tests/, none a gate file, failLoudly posture not claimed as a smell, no cell merge/rename/delete proposed (bug 0243's :105/:143/:154 citations into params-unterminated-literal are sentinel-constant lines outside the cited ranges); no open/resolved PTQ tracks this sequence (PTQ-0226/0240/0312/0395 are other harnesses) — the file set is disjoint from confirmed same-wave d7-69, whose triage note names d7-71 as its declared companion, and from guard-only d7-01, matching the per-file-set precedent of the registry-oracle family (PTQ-0222/0237/0250/0260/0275/0311/0313/0404/0411) (triage: claude-fable-5-1)
