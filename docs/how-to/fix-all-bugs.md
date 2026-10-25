# Attempt all open bugs, integrate verified fixes, queue owner choices

Run from this repository's root in an interactive Pi session:

```text
/fix-all-bugs
/fix-all-bugs resume
```

The new-run command inventories every open report in `docs/bugs/`. It runs safe
fixing attempts in dependency-aware waves of **at most four isolated lanes**,
integrates fully verified fixes **one at a time**, and records a disposition for
every bug. A genuine owner choice never receives implicit approval. A failed
isolated fix does not cancel its siblings or strand unrelated work.

The entry point is [`.pi/theta/fix-all-bugs.theta`](../../.pi/theta/fix-all-bugs.theta),
backed by [`tools/bugfix/batch.mjs`](../../tools/bugfix/batch.mjs) and the existing
[`/fix-bug`](./fix-a-numbered-bug.md) workflow. These are repository-maintenance
commands, not general-purpose library APIs. They do not publish a release.

## Before starting

- Use **clean `main`**, working Git/Node, an `origin` remote, and no conflicting
  bugfix lease. There is no automatic stash, reset, branch switch or rebase.
- Configure OpenAI access to **GPT-6 Astra** for planning, decisions/review and
  integration, and **GPT-6.1 Sol** for fixing. Missing live prerequisites fail
  loudly; credentials are not a reason to silently skip a required test.
- Install the owner's dependencies with the committed lockfile. The controller
  prepares source/integration worktrees locally before their gates: ignored
  `.pi/tmp`, lockfile-frozen `npm ci --ignore-scripts --no-audit --no-fund`, and
  checks for the actual local SDK package/CLI and locked dependency versions.
  Existing validated installations may be reused; an ancestor's node_modules is
  not a worktree installation. Bootstrap never changes dependency pins.
- Expect automatic commit/promotion/push only after all required source and
  merged-tree gates and independent reviews pass, with no pending approvals.
  This does not authorize tags, version bumps, force pushes or npm publication.

Transient verification fixtures use an isolated system temporary directory
outside repository/dependency ancestry. Durable stdout, exit codes, bootstrap
records, red proofs and review artifacts remain under the recorded run directory.
This avoids host-peer lookup fixtures accidentally seeing the owner's installed
SDK. Frozen witness argv/signatures are unchanged; explicitly authored environment
arguments in a witness remain part of that command.

## Every bug gets a disposition

A fresh read-only Astra assessment reads immutable report/source snapshots and
current related statuses. The controller checks complete, unique inventory,
canonical ids, actual prerequisite edges, valid predicted paths and no cycles.
The planner's `ready` field means **safe to attempt**, not permission to ship.

- **Safe fixing attempt:** reproduction, diagnosis, plan, scoped decisions,
  implementation, independent reviews and real gates in a dedicated worktree.
- **Owner-authorization/external-prerequisite item:** an explicit hold, existing
  owner choice, undelegated policy or remedy in another repository is recorded
  with its prerequisite and recommended course. Safe analysis does not authorize
  implementing held work or editing another repository.
- **Not reproduced/already addressed:** preserve the evidence and recommend an
  administrative disposition rather than fabricate a red or invent a patch.
  This does not silently close the bug or disprove a separate upstream concern.
- **Dependency blocked:** record the actual prerequisite that did not integrate.
  Starting a prerequisite lane or trusting its summary is not satisfaction.

New bounded implementation choices can proceed under `/fix-bug`'s existing
Astra delegation. Material tradeoffs are implemented only in exact provisional
scope and queued for later owner approval; they never auto-land. Routine scope
revisions go through fresh planning and independent review instead of requiring
an owner context switch solely for that procedural step. Original plans, requests,
accepted reds, manifests and prior decisions remain auditable.

Within the dependency-ready set, a greedy overlap heuristic prefers less shared
source/test scope. Predicted paths are advisory, not locks or correctness edges.
Four is a ceiling, not a promise of four useful lanes. All lanes in a wave settle
before main changes; no new fixer wave overlaps integration.

## Verification and integration

Each lane invokes the existing `/fix-bug` independently in its own conversation,
branch and Git worktree under ignored `.trees/`. Options are fixed to **`ship
false`, `review_rounds 5`**. A lane cannot push, update the consumer pin or grant
itself authority. Parent collection validates durable identity, evidence, gates,
review binding and exact source bytes, never completion prose alone.

The report records execution/checkpoint, verification, authorization and shipment
separately. In particular **implementation blocked + owner choice pending** is
not a verified fix awaiting only a signature. A final-verified provisional fix
is retained without committing/promoting it until its owner decisions are cleared.

For a verified eligible source, the controller creates a separate integration
branch at recorded current main. Fresh Astra merges the exact verified commit,
preserves both sides of conflicts and previously integrated behaviors, and runs
the exact controller gate after committing. Mandatory gates include typecheck,
the full default suite, original witnesses and relevant live commands from this
and earlier integrations. Later edits invalidate the gate. Independent post-merge
review must bind that final committed tree.

Only the controller pushes the verified integration SHA, then fast-forwards local
main and performs the established pi-config dependency-pin update for pi-theta.
Successful cleanup removes only shipped source/current integration worktrees.
Parked attempts, pending work, original evidence and reports remain available.

## Isolated failure versus global stop

A typed `ok:false` merge verdict is a legitimate negative result. Its findings are
reported, not mislabeled a schema error. A setup, conflict, gate or review refusal
can be **parked** if the controller proves:

- source hosts and the integration worker have settled;
- local main/branch are unchanged and remote main has the expected identity;
- no push intent, shipment record or uncertain shipment exists;
- the registered context, source and transaction identities remain intact.

Parking preserves the entire failed worktree, index/conflicts, verdict and logs.
It closes only that settled transaction. Unrelated verified fixes and later waves
continue; only causal dependents become blocked. No reset, test weakening, gate
waiver or implicit approval is involved.

A worker invocation error is **not** proof its subprocesses have stopped. Its
activity marker stays in place. Lost integrity, owner/remote drift, active workers,
push intent or partial/uncertain shipment cause a **global stop**. Push intent is
recorded before Git runs, so a crash/timeout cannot be mistaken for no push. A
successful push followed by consumer-update failure is partial shipment, not a
retryable pre-push failure. Inspect remote and shipment records; never replay it.

## Read the result

Reports and immutable run evidence live under:

```text
.pi/tmp/fix-all-bugs-<uuid>/
.pi/tmp/fix-bug-<number>-<uuid>/
```

The overview contains counts and a compact row for **every bug**, including
unassessed/unattempted entries after a planner failure. `COMPLETE` means scheduling
finished and all work was classified, **not all bugs were fixed or shipped**.
Releasing a settled lease after an early stop does not make the headline COMPLETE.

The batch directory contains:

- `report.json`: complete machine-readable outcomes, source locations, pending
  decision summaries, shipment SHAs and errors;
- `report.txt`: expanded human-readable audit, source branches/worktrees,
  recommendations, rationale, alternatives and exact decision-record links;
- catalog/plan/snapshots, job manifests and launch claims, source exports,
  integration contexts, bootstrap/verification logs and retained attempts.

Exact long specification proposals are not dumped into the overview: they stay
in source decision records and captured approval audits. Even the 1000-bug ceiling
fits the overview's Bash byte/line budget. Reports are local evidence, not backups;
review sensitive provider content before sharing and preserve essential proof in
tracked bug records before eventual shipment.

## Resume rather than start over

After the original invocation and all children/commands have stopped, run:

```text
/fix-all-bugs resume
```

Resume selects the current **batch lease**, or the explicit last-batch pointer
written by this controller after a normally finalized batch. It does not guess
from directory timestamps. A standalone lease, malformed launch claim, active
marker or uncertain shipment is refused. The administrative CLI also accepts an
explicit recorded path: `node tools/bugfix/batch.mjs resume /absolute/run/path`.

Resume reuses the accepted inventory and exact original source runs/launch claims.
It revalidates eligible verified sources, preserves old integration attempts and
creates fresh integration attempts at current main. Incomplete source runs use an
authenticated internal `batch-resume` entry, not another start. Original red proofs
are reused; required independent review and fresh gates are not skipped. A pending
owner approval is not granted by resume. Not-reproduced items are not blindly retried.

A bounded, committed workflow-only repair may advance main between attempts.
Resume checks ancestry and a strict workflow/test/how-to path allowlist, records
an immutable upgrade with old/new base and owner-control hashes, and keeps every
retained source's original control files/digest unchanged. Unrelated production,
package, specification or bug-record changes are **not** silently adopted. Commit
workflow changes before resuming: a dirty owner cannot be reconciled. This is an
explicit workflow upgrade, not permission to rebase or rewrite old evidence.

For a legacy stopped batch, its original catalog/manifests/source evidence remain
unchanged. A pre-push integration is parked and retried in a new worktree; the old
worktree is retained. If there is any activity marker or push/consumer uncertainty,
inspect and reconcile that first. Never delete a lock just to make another run
start. There is no automatic takeover of a live/uncertain process.

## Development verification

`tests/bugfix-worktree-env.test.ts` covers frozen bootstrap, local SDK checks,
failed installs, symlink refusal and external transient fixtures.
`tests/bugfix-batch*.test.ts` cover durable scheduling, dependency/failure isolation,
negative verdicts, activity/push uncertainty, retained attempts, resume, evidence
identity and bounded complete reporting. `tests/fix-all-bugs-workflow.test.ts`
drives the real Pi host and production orchestration with deterministic children
and a local bare remote, without provider requests. Relevant live acceptance tests
exercise the actual Astra planner and conflicting merge worker. These complement,
not replace, the full default suite and committed-fixture parse gate.
