# Bug 0495 — H9a acceptance area (f) never tested its code-tool loop: the fixture reads its own filename against an empty scratch cwd, so every run since introduction ended in a propagated ENOENT `Err` that pre-0493 exited 0 in silence — all three assertions passed vacuously, and the bug-0493 print-mode surface now reds the cell for the correct reason

- **Status:** fixed (unreleased - commit/push only). No new package release is published; the existing published package version does not contain this fix. No resolving commit SHA is assigned here.
- **Owning repo:** pi-theta (test + fixture only; no shipped-code change)
- **Sev/Diff estimate:** S3/D1 — S3: no runtime defect (the runtime behaved
  exactly as specified on every run: relative `read` → ENOENT → `Err` →
  `?`-propagation → top-level Err ending). The defect is the cell: area
  (f)'s purpose — prove a code-side Pi-tool call feeds a follow-up query
  through a real `pi -p` host — has never once been witnessed, and since
  the 0493 fix the cell is a standing red in the H9a acceptance lane
  (a documented correct-reason red per the live-suite conventions). D1:
  one test-side line (pre-populate the scratch cwd) or one fixture line.
- **Where (filing-time source and line references; current repair below):**
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

At filing, this document supplied the AGENTS.md "documented correct-reason
reds" reference for the area-(f) signature above. That historical red is
preserved below; the repaired cell now passes without weakening the
exit-code assertion.

## Fix (unreleased — closure record)

### Cause and actual changes

This was a test-input arrangement defect, not a runtime defect. Discovery
through `--theta` never populated the separate process cwd. The relative
`read` correctly failed, and `?` correctly stopped execution before the
summary query. The bug-0493 failure surface made that ending observable.

- `tests/live/acceptance/noninteractive-acceptance.test.ts:406–421` now
  retains the authored fixture path and copies the unchanged committed
  `acc-code-tool-loop.theta` into this cell's fresh scratch cwd **before**
  `spawnPiPrint`. Neither the generic scratch helper nor the discovery/cwd
  contract changes; the committed fixtures directory is not used as cwd.
- The area-local helper at `:396–404` preserves exit zero, the permitted-code
  subset check and the empty-stderr gate **in that order**, then requires
  trimmed non-empty stdout. Partial output cannot rescue a prior failure.
- `:423–520` retains an independently prepared real-host healthy control,
  the historical silent-failure rejecting control and seven provider-free
  assertion-isolation cases. They cover silence, whitespace, nonzero/null
  exits, unknown-code-before-stderr ordering, stderr despite output, and
  healthy output without a model-wording golden.
- `tests/fixtures/diag2/asserted-code-not-in-registry-baseline.json:114`
  adds exactly one synthetic literal-extraction artifact,
  `theta/runtime/b0495-unpermitted`, immediately before the existing ghost
  entry. Controller-recorded Astra decision
  `49683743-7cfe-4f62-9ba4-ad8951958144` authorized this exact addition after
  revised PLAN and independent evidence review. It is **not** a production
  registry or permitted-code addition: the unknown-code control still
  rejects it. The unchanged corpus gate checks both additions and stale
  baseline entries (`tests/registry-closed-set-corpus-gate.test.ts:210–242`).

The committed theta fixture, harness, production source, specification,
registry, permitted-code list and dependency pins are unchanged. The
contract remains direct code-side tool dispatch and Result propagation
(`docs/spec_topics/tool-calls.md`, **No conversation turn**, **Return type**,
**Failures**) followed by a user-visible prompt query
(`docs/spec_topics/slash-invocation.md`, prompt-mode rule and **SLSH-3**).
Non-empty stdout is completion evidence for this fixture, not a new
universal theta success rule.

### Preserved red and actual green evidence

Artifacts are in run directory
`/home/thomasa/Projects/pi-theta/.pi/tmp/fix-bug-0495-8f376a30-49be-4e55-b15b-70d146ce5b08`
(**RUN**). Commands below ran after an explicit absolute cd to the dedicated
worktree
`/home/thomasa/Projects/pi-theta/.trees/fix-bug-0495-8f376a30-49be-4e55-b15b-70d146ce5b08`
(**ROOT**), on its dedicated bugfix branch. These are saved results, not
new test executions during docs-only closure.

Frozen real-host witness argv:

```sh
npx --no-install vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/noninteractive-acceptance.test.ts -t 'H9a-T \(f\)'
```

- **Pre-fix, exit 1:** `reproduce-attempt-1-original-area-f.log` records the
  original current-HEAD cell failing with `expected a no-error exit (0),
  got 1`, propagated `tool read call failed (execution) — ENOENT`, and the
  scratch-cwd fixture filename, ending `expected 1 to be +0`. This is the
  claimed missing input, not authentication/executable/provider failure.
  Original source snapshot SHA-256:
  `c602da07af022b209bbf9fa129c38c58a02d289a363697e9a96deadd124df5fd`.
- **Pre-fix controls:** `reproduce-attempt-1-area-f-with-controls.log`
  (exit 1) keeps the original red beside a passing prepared-cwd real host
  and silence-rejection control. `diagnose-attempt-1-area-f-with-controls.log`
  (exit 1) has the original red and nine passing controls. `red-0.json`
  and `audit-evidence-area-f.log` independently preserve the same red.
  Historical pre-0493 runtime was not rerun; its silent observable shape
  is characterized synthetically, separately from this actual host red.
- **Post-fix, exit 0:** `implement-attempt-3-area-f.log`, controller
  `green-1-0.json`, `gate-1-initial-2.json` and independent
  `audit-fix-area-f.log` each show ten selected tests passing, including
  both real hosts. Nine other tests are name-filtered, not credential skips.
- **Complete affected H9a file, exit 0:**
  `npx --no-install vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/noninteractive-acceptance.test.ts`
  passes all 19 tests (`implement-attempt-3-h9a-file.log`), with no filtering.
- **Full default gate, exit 0:** `npm test` passes 765 files / 13,158 tests
  in both `implement-attempt-3-default-suite.log` and the independent
  controller capture `gate-1-initial-1.json`.
- **Typecheck and lint, exit 0:** `npm run typecheck` and `npm run lint`
  pass in `implement-attempt-3-typecheck.log` and
  `implement-attempt-3-lint.log`; controller typecheck is separately
  recorded in `gate-1-initial-0.json`. Lint's existing script covers `src`,
  not an independent test-file lint gate.
- **Focused offline controls, exit 0:**
  `npx --no-install vitest run tests/registry-closed-set-corpus-gate.test.ts tests/code-registry.test.ts tests/closing-gate.test.ts tests/host-peer-version-and-model.test.ts`
  passes 74 tests (`implement-attempt-3-corpus-peer-controls.log`);
  `npx --no-install vitest run tests/tool-calls-execute-lowering.test.ts tests/committed-fixture-parse-gate.test.ts`
  passes 86 (`implement-attempt-3-focused-offline.log`). Independent fix
  review passes all 160 across these six files (`audit-fix-offline.log`).
- **Operator-host both directions:** `audit-fix-operator-host.log` records
  actual `/home/thomasa/.pi/agent/bin/pi` 1.4.0 with the checkout extension
  and `--provider openai --model gpt-6.1-sol`: empty cwd produces exit 1
  and the exact ENOENT; separately prepared cwd produces exit 0, non-empty
  assistant stdout, clean stderr and no unpermitted codes. The repository
  harness separately uses its pinned Pi 1.3.0. These are host versions,
  not pi-theta release claims.

The full command envelopes, execution records, hashes and historical
failures are retained in RUN's `reproduce.md`, `diagnose.md`, `plan.md`,
`implement.md`, `history/`, `reviews.md` and `close.md`. The witness manifest
and original red artifacts remain unchanged. Additional verification uses
the latest ready bootstrap's external temporary directory for TMPDIR/TMP/TEMP;
logs remain in RUN, not mixed with transient peer-lookup fixtures.

### Review, earlier gate obstacles and residual limits

Independent fix review in `reviews.md`: **CLEAN — no actionable in-scope
must-fix findings**. It verified the exact patch, preserved original reds,
assertion directions, delegated baseline scope, corpus addition/staleness
and genuine-unknown controls, pinned/operator real hosts and green gates.

Earlier failures were not waived: attempt 1's full suite was interrupted
and had peer-fixture isolation plus synthetic-corpus findings. External
temporary fixtures resolved the peer checks without source/pin changes;
the exact reviewed entry resolved the corpus finding. Attempt 2 completed
with an unrelated workflow ETIMEDOUT; that failed capture is preserved.
Attempt 3 diagnosed execution progress/resource contention, then the
unchanged workflow file and complete unchanged default suite passed;
the controller's complete suite also passed. No timeout, concurrency,
assertion or controller change was made. The historical timeout's unique
cause remains uncertain; this fix does not claim to repair it.

No new in-scope residual bug was found. Exact provider-boundary
interpolation, summary quality, a further model-selected tool call and
arbitrary host compatibility are not proven by non-empty stdout. Related
open bugs 0472 (another H9a discriminator), 0497 (auth-store races) and
0500 (post-reply compaction) remain outside this fix; no speculative new
residual report is filed. The synthetic slug must remain unregistered and
unpermitted; future production reuse would be inappropriate.

**Shipment boundary:** fixed in the dedicated worktree, unreleased —
commit/push only. No staging, commit, push, tag, version bump or package
publication was performed by this stage. No new package release is
published. The existing package version is not credited with this fix;
the eventual shipment commit supplies any resolving SHA.

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
