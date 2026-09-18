---
id: PTQ-1041
title: The H9a offender/control drive-and-teardown sequence is duplicated near-verbatim across b0297live, b0298live, and b0301live instead of a shared tests/helpers/ harness
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/acceptance/b0297live-bind-context-nonscalar-load-refusal.test.ts:165-256
  - tests/live/acceptance/b0298live-system-nonscalar-load-refusal.test.ts:154-244
  - tests/live/acceptance/b0301live-bind-echo-nonboolean-load-refusal.test.ts:179-270
sites: 3
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The H9a offender/control drive-and-teardown sequence is duplicated near-verbatim across b0297live, b0298live, and b0301live instead of a shared tests/helpers/ harness

## Observation
Three sibling files under `tests/live/acceptance/` — b0297live, b0298live,
b0301live — each implement the identical `it()` body shape: an offline
"ATTRIBUTION GUARD" block of four `expect` calls over `errorCodes`/`parseDoc`
(offender carries exactly `CODE` and does not register; control carries no
error and registers), an `await requireLiveHost()` precondition, two
`mkdtempSync(join(tmpdir(), "theta-<slug>-{off,ctl}-"))` directories plus two
`mkdtempSync(...,"theta-<slug>-cwd-")` cwd directories, a `try { writeFileSync
×4 }` plant of the offender/offender-probe/control/control-probe fixtures, a
`spawnPiPrint` call for the offender probe with the same three assertions
(exit code 0, stdout contains `REFUSED`, stdout does not contain `LOADED`), a
second `spawnPiPrint` call for the control probe with the same two assertions
(exit code 0, stdout contains `CONTROL_OK`), and a `finally { rmSync ×4 }`
teardown. Only the bug number, the field name under test, and the offending
YAML shape vary between the three files. No `tests/helpers/` (or
`tests/live/acceptance/`) module exports this composed sequence; each file
re-derives it independently of the other two.

## Evidence

`tests/live/acceptance/b0297live-bind-context-nonscalar-load-refusal.test.ts:165-256`
(the full `it()` body — re-read immediately before filing):
```ts
describe("H9a live — bug 0297 non-scalar `bind_context:` load refusal through the real `pi -p`", () => {
  it("refuses the non-scalar-`bind_context:` theta, and still registers and drives the scalar-`bind_context:` control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is un-registered by exactly this fix's pushed
    // CODE and the control is clean and registers, so neither live sentinel can
    // be produced by an unrelated failure. RED at the pre-fix tree — the parser
    // narrowed the non-scalar `bind_context:` to the absent-default and the
    // offender loaded clean with `none`.
    expect(
      errorCodes(OFFENDER, "/proj/b0297offender.theta"),
      `attribution: the offender's non-scalar \`bind_context:\` must carry exactly ${CODE}`,
    ).toEqual([CODE]);
    expect(
      parseDoc(OFFENDER, "/proj/b0297offender.theta").frontmatter,
      "attribution: a refused theta does not register (frontmatter is null)",
    ).toBeNull();
    expect(
      errorCodes(CONTROL, "/proj/b0297control.theta"),
      "attribution: the scalar-`bind_context:` control carries no error and registers",
    ).toEqual([]);
    expect(
      parseDoc(CONTROL, "/proj/b0297control.theta").frontmatter,
      "attribution: the scalar-`bind_context:` control registers (frontmatter non-null)",
    ).not.toBeNull();

    await requireLiveHost();

    const offenderDir = mkdtempSync(join(tmpdir(), "theta-b0297-off-"));
    const controlDir = mkdtempSync(join(tmpdir(), "theta-b0297-ctl-"));
    const offenderCwd = mkdtempSync(join(tmpdir(), "theta-b0297-cwd-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0297-cwd-"));
    try {
      writeFileSync(join(offenderDir, "b0297offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(offenderDir, "b0297offenderprobe.theta"), OFFENDER_PROBE, "utf8");
      writeFileSync(join(controlDir, "b0297control.theta"), CONTROL, "utf8");
      writeFileSync(join(controlDir, "b0297controlprobe.theta"), CONTROL_PROBE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir: offenderDir,
        slashInvocation: "/b0297offenderprobe",
        cwd: offenderCwd,
      });
      expect(probe.exitCode, `...`).toBe(0);
      expect(probe.stdout, `...`).toContain(REFUSED);
      expect(probe.stdout, `...`).not.toContain(LOADED);

      const control = await spawnPiPrint({
        thetaDir: controlDir,
        slashInvocation: "/b0297controlprobe",
        cwd: controlCwd,
      });
      expect(control.exitCode, `...`).toBe(0);
      expect(control.stdout, `...`).toContain(CONTROL_OK);
    } finally {
      rmSync(offenderDir, { recursive: true, force: true });
      rmSync(controlDir, { recursive: true, force: true });
      rmSync(offenderCwd, { recursive: true, force: true });
      rmSync(controlCwd, { recursive: true, force: true });
    }
  });
});
```

`tests/live/acceptance/b0298live-system-nonscalar-load-refusal.test.ts:154-244`
— the same shape, the same four-assertion attribution guard, the same
`mkdtempSync`×4/`writeFileSync`×4/two-`spawnPiPrint`/`finally rmSync`×4
sequence, differing only in the `theta-b0298-*` slug and the `system:`
wording in message strings.

`tests/live/acceptance/b0301live-bind-echo-nonboolean-load-refusal.test.ts:179-270`
— the same shape again, differing only in the `theta-b0301-*` slug and the
`bind_echo:` wording.

Exact structural check: the `try`/`finally` block's statement sequence
(`mkdtempSync`×4 → `writeFileSync`×4 → `spawnPiPrint` → 3 `expect`s →
`spawnPiPrint` → 2 `expect`s → `finally` `rmSync`×4) is identical in shape and
statement count across all three files' cited ranges; the only substituted
tokens across the three copies are the bug-number slug
(`b0297`/`b0298`/`b0301`), the field name in prose (`bind_context:`/
`system:`/`bind_echo:`), and the `CODE`/`REFUSED`/`LOADED`/`CONTROL_OK`
constants each file already defines locally with the same four names.

## Why this is a problem
The setup/precondition/plant/spawn/assert/teardown sequence — the four-assert
attribution guard, the `requireLiveHost()` call, the four `mkdtempSync`
calls, the `writeFileSync` quartet, the two `spawnPiPrint` calls each with
their fixed assertion shape, and the `finally` teardown — is declared from
scratch in each of the three files rather than parameterised once by the
offender/control theta sources, the sentinel strings, and the per-bug
temp-dir slug. `tests/live/acceptance/harness.ts` already centralises the
lower-level primitives (`spawnPiPrint`, `requireLiveHost`) each file builds
this identical higher-level sequence on top of, independently, three times.
This is the same duplication class already confirmed for two disjoint file
sets under this directory (a seven-file "offender/probe/clean" shape and a
five-file companion set), each filed as its own finding against its own
file set per that precedent; this file set (the "offender/control" shape,
distinguished from those by driving a matched-pair control rather than a
separate "clean" cell) has not previously been filed.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` (or `tests/live/acceptance/`) module exporting the
offender/control drive-and-assert sequence, parameterised by the per-bug
OFFENDER/OFFENDER_PROBE/CONTROL/CONTROL_PROBE sources, the `CODE`/sentinel
constants, and the temp-dir slug, is the shape all three files' own
near-identical bodies already point at — consistent with the direction
already proposed for the sibling seven-file and five-file offender/probe/
clean file sets in this same directory.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); nothing cited here is a pinned count or
  inventory assertion.
- Recording-double check: none of the duplicated setup/spawn/teardown logic
  is a recording double backing a MUST-NOT "never called" witness; the
  assertions read spawned-process observables (exit code, stdout content),
  not a double's call log. Not applicable.
- docs/bugs/ signature search: docs/bugs/0297-bind-context-nonscalar-silently-registers.md
  (Status: fixed 0.330.0), docs/bugs/0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.md
  (Status: fixed 0.300.0), docs/bugs/0301-bind-echo-tool-loop-respond-repair-silent-default-holes.md
  (Status: fixed 0.332.0) — none is a documented correct-reason red; each
  file's own attribution-guard and live assertions pass at HEAD (per the
  already-confirmed PTQ-0756 finding against the same three files' shared
  `errorCodes` helper, since fixed).
- coverage-matrix/bug-doc citation search: `grep -n
  "b0297live\|b0298live\|b0301live" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of any test
  file or its `it()` — only that the drive-and-teardown sequence could be
  composed once and parameterised per bug.
- Live-suite convention check: `requireLiveHost()`'s fail-loudly precondition
  is the correct live-suite posture per AGENTS.md "Live-suite conventions"
  and is unaltered by this finding, which concerns only the duplicated
  setup/spawn/teardown code around it, not the live-host gating itself.
- Coverage check: the claim is entirely about a repeated drive/teardown
  SEQUENCE, not a missing test path; all three cited files exercise and
  pass their offender/control assertions at HEAD.
- Prior-finding overlap check: `grep -rl "b0297live\|b0298live\|b0301live"
  quality/issues/*.md quality/resolved/*.md quality/intake/*.md` returns
  only the resolved PTQ-0756 (the `errorCodes` helper duplication, a
  disjoint root cause already fixed — the three files now import
  `errorCodes` from `tests/helpers/e2e-s1`, confirmed by this review's own
  reading of the current imports). The two confirmed sibling findings for
  the "offender/probe/clean" shape (`PTQ-0755`, seven files; `PTQ-0759`,
  five more files) each cite a disjoint file list that does not include
  b0297live, b0298live, or b0301live, and both explicitly note this is a
  per-file-set filing pattern (naming the registry-oracle family
  PTQ-0222/0237/0250/0260/0275/0311/0313/0404/0411 as precedent for filing
  each disjoint file set of the same duplication class separately).

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: the `describe`/`it` blocks sit exactly at b0297live:165-256, b0298live:154-244, b0301live:179-270; a slug/field-normalised mktemp sed-range diff of the three ~92-line `it()` bodies differs in 5 (a↔b) and 2 (a↔c) hunks, all comment/assertion-message prose, with the statement sequence (4 attribution expects → requireLiveHost → mkdtempSync×4 → writeFileSync×4 → spawnPiPrint+3 expects → spawnPiPrint+2 expects → finally rmSync×4) identical; `CONTROL_PROBE`/`-ctl-"` grep to exactly these 3 files and neither tests/helpers/ nor tests/live/acceptance/harness.ts exports the composed sequence; coverage-matrix grep → 0 hits and prior-finding grep → only resolved PTQ-0756 (disjoint `errorCodes` root cause) reproduce; PTQ-0755/PTQ-0759 (offender/probe/clean shape, mkdtemp×3 + parseSystemNoteCodes) cite disjoint file lists and PTQ-0759 was itself confirmed as a separate row for a second file set, so this is the same per-set precedent not a duplicate; PTQ-0762 is tests/live/ composeCodesOf, unrelated; all locations under tests/, D7 boilerplate-duplication class, no gate file, no recording double, no cell merge/rename/delete, requireLiveHost posture unaltered (triage: claude-fable-5-1)
