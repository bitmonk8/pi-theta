# Bug 0495 — H9a acceptance area (f) never tested its code-tool loop: the fixture reads its own filename against an empty scratch cwd, so every run since introduction ended in a propagated ENOENT `Err` that pre-0493 exited 0 in silence — all three assertions passed vacuously, and the bug-0493 print-mode surface now reds the cell for the correct reason

- **Status:** open
- **Owning repo:** pi-theta (test + fixture only; no shipped-code change)
- **Sev/Diff estimate:** S3/D1 — S3: no runtime defect (the runtime behaved
  exactly as specified on every run: relative `read` → ENOENT → `Err` →
  `?`-propagation → top-level Err ending). The defect is the cell: area
  (f)'s purpose — prove a code-side Pi-tool call feeds a follow-up query
  through a real `pi -p` host — has never once been witnessed, and since
  the 0493 fix the cell is a standing red in the H9a acceptance lane
  (a documented correct-reason red per the live-suite conventions). D1:
  one test-side line (pre-populate the scratch cwd) or one fixture line.
- **Where:**
  - `tests/live/acceptance/fixtures/acc-code-tool-loop.theta:9` —
    `let contents = read({ path: "acc-code-tool-loop.theta" })?` — a
    RELATIVE path; the host `read` tool resolves it against the spawned
    `pi` process's cwd.
  - `tests/live/acceptance/noninteractive-acceptance.test.ts:396–412` —
    the (f) cell: `spawnPiPrint({ thetaDir: FEATURE_THETA_DIR, …,
    cwd: scratchCwd() })`; `scratchCwd` (`:102–104`) is
    `mkdtempSync(join(tmpdir(), "theta-acc-"))` — a fresh EMPTY directory
    per spawn. `--theta <FEATURE_THETA_DIR>` governs theta DISCOVERY only;
    it does not make the fixture file readable from the run cwd.
  - `tests/live/acceptance/noninteractive-acceptance.test.ts:107–113`
    (`assertNoErrorExit`), `:116–128` (`assertCodesSubsetOfPermitted`),
    `tests/live/acceptance/harness.ts:601` (`assertStderrClean`) — the
    invariant set, all three of which pass on a pre-0493 silent Err.
  - History: the self-read has been the fixture's first statement since
    its introduction (`fed12acd`, 2026-07-03, then
    `acc-code-tool-loop.loom`), and the spawn cwd has been a scratch
    mkdtemp for the same lifetime — the cell has been vacuous for its
    entire existence, not regressed by anything.

## Observed (2026-09-27, round-1 release review of the 0493 fix, commit d941f7df; recorded at fix time as 0493 Residual 1)

Signature of the now-red cell:

```
(f) code-tool-loop: expected a no-error exit (0), got 1. stderr: theta
/acc-code-tool-loop returned Err: tool read call failed (execution) —
ENOENT: no such file or directory … theta-acc-*\acc-code-tool-loop.theta
```

The ENOENT path names the SCRATCH directory (`theta-acc-*`), confirming
cwd-relative resolution: the fixture file exists only under
`FEATURE_THETA_DIR`, never in the run cwd. (Not re-run for this filing —
the red is pinned in the 0493 record and the mechanism is fully static;
a concurrent fix effort holds this worktree.)

## Defect — two halves

1. **The fixture defect.** The read target never exists in the run cwd.
   The fixture's own header states the intent: "A code-side Pi-tool call
   feeds a follow-up query" — the `read` result is interpolated into the
   untyped query (`@\`Summarise in one short sentence what this file is:
   ${contents}\``). With the target absent, the body dies at its first
   statement on every run; the query, the tool-loop, and the
   interpolation were never exercised.
2. **The vacuous pass.** Pre-0493, a top-level Err ending before any
   assistant turn produced NO process-boundary observable (bug 0493 D2):
   exit 0, empty stdout, empty stderr. All three area-(f) assertions
   therefore passed against the SILENCE of the failure:
   `assertNoErrorExit` saw exit 0; `assertCodesSubsetOfPermitted` scanned
   empty stdout+stderr into `[]` ⊆ permitted; `assertStderrClean` saw the
   measured-baseline 0 bytes. A test whose green requires its subject to
   have failed silently witnesses nothing — the 0493 D2 fix did not break
   this cell, it exposed it.

## Fix direction

Make the read succeed so the cell finally witnesses its area; keep the
invariant set.

- **Recommended:** the (f) cell copies the committed fixture into the
  scratch cwd before spawning —
  `copyFileSync(join(FEATURE_THETA_DIR, "acc-code-tool-loop.theta"),
  join(cwd, "acc-code-tool-loop.theta"))` — one test-side line, fixture
  untouched, and the fixture's self-describing question ("what this file
  is") stays meaningful. The run then exercises the genuine chain:
  code-side `read` Ok → interpolation → driven query → assistant turn →
  exit 0 with non-empty stdout.
- **Optionally strengthen** while there: assert stdout is non-empty (the
  Ok path always ends on a trailing assistant turn), so a future
  silent-failure regression cannot re-vacuate the cell — the pre-0493
  shape (exit 0 AND empty stdout) becomes distinguishable from success.
- **Rejected — cwd = `FEATURE_THETA_DIR`:** spawning with the committed
  fixtures directory as the run cwd would make the self-read resolve, but
  breaks the harness's throwaway-cwd convention (per-spawn isolation; no
  run artefacts in a committed directory).
- **Rejected — invert the cell to assert exit 1 + the Err note:** that
  changes what (f) proves; the print-mode failure surface already has its
  own live witness
  (`tests/live/acceptance/b0493live-refused-subagent-callee-print-parent.test.ts`),
  and the code-tool loop would remain untested.

Until the fix lands, this document is the filed bug the AGENTS.md
"documented correct-reason reds" convention points at for the area-(f)
signature above: do not attribute that red to an unrelated change, and do
not green it by weakening the exit-code assertion.

## Relation to prior bugs

- **0493 (fixed 0.493.0)** — D2's stderr + exit-code surface is what made
  this defect visible; its Residual 1 records the red with this exact
  signature and explicitly defers the fix ("a test file the §Fix does not
  name; to be filed as its own bug" — this bug).
- **0472 (open)** — the house precedent for filing an H9a cell defect as
  its own bug: a probe cell whose scoring can green without witnessing
  the subject.
- **0492 (fixed 0.492.0)** — the classification precedent: test-only,
  S3/D1, live witnesses red/vacuous against a documented behaviour
  change.
- **0030 (fixed)** — the `assertStderrClean` empty-capture gate this
  cell's vacuous half leaned on (0 bytes of stderr measured on all ten
  H9a spawns — true pre-0493 even for a failing drive, which is the
  defect in miniature).
