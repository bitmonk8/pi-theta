# Fix ready open bugs in parallel

Run **`/fix-all-bugs`** from this repository's root in an interactive Pi session:

```text
/fix-all-bugs
```

The command takes **no arguments**. It assesses the current open reports in
`docs/bugs/`, runs eligible fixes in dependency-safe waves of **at most four**
independent lanes, then integrates verified results **one at a time**. All fixer
and integration worktrees live under the repository's gitignored `.trees/` folder.
It is not
`/quality-loop`, and it does not mean that every open report will be fixed.
For one report, ranking without editing, or an ordinary paused single run, see
[Fix a numbered bug](./fix-a-numbered-bug.md).

The checked-in entry point is
[`.pi/theta/fix-all-bugs.theta`](../../.pi/theta/fix-all-bugs.theta), supported by
[`tools/bugfix/batch.mjs`](../../tools/bugfix/batch.mjs) and the existing
[`/fix-bug`](../../.pi/theta/fix-bug.theta) workflow. These project-maintenance
commands operate on this checkout; they are not general-purpose library APIs.

## Before starting

- Start on **clean `main`**, with a working `origin` remote and no active bugfix
  or batch lease. There is no automatic stash, branch switch, reset or rebase.
- Install dependencies and satisfy the repository's normal offline and relevant
  live-test prerequisites. Each isolated worktree must be able to run them.
- Configure OpenAI access to **GPT-6 Astra** for readiness assessment and merge
  review, and **GPT-6.1 Sol** for the existing fix workers. Argument validation
  and scheduling need no model; readiness and semantic conflict resolution do.
- Expect automatic promotion to `main` and push **only after** the per-fix and
  merged-tree verification/review requirements pass. As with `/fix-bug`, this is
  not permission for releases, tags, version bumps, force pushes or publishing.

## How work is selected

A fresh, read-only Astra assessment reads immutable snapshots of the open reports,
related report statuses and relevant source/specification. It lists every open
bug exactly once, explaining readiness, actual prerequisites and likely modified
paths. Missing evidence, an explicit owner hold, unresolved policy/specification
or an already-filed pending decision makes a bug **ineligible**, not implicitly
approved. Readiness does not prove reproduction or fixability.

The controller validates this plan before scheduling. A dependency on another open
bug waits for that bug's **successful integration**, not merely its lane starting
or returning a success message. An ineligible, blocked or pending prerequisite
therefore prevents its dependents from running. Already-fixed prerequisites do
not get requeued. Invalid plans stop rather than launch a partial guessed batch.

Within the currently dependency-ready set, a greedy overlap heuristic prefers
bugs whose predicted source/test paths overlap less. Estimates may include exact
paths or directory prefixes. They are advisory, not locks: bugs touching the same
file can still run together if no less-overlapping choice is available. File
intersection is not a causal dependency, and the estimates cannot guarantee a
conflict-free merge. Four is the concurrency ceiling, not a promise of four
useful lanes in every wave.

## What each lane does

Every selected bug invokes the **existing `/fix-bug` independently**, in its own
private conversation, branch and Git worktree. There is no shared editing checkout
and no replacement shortcut that implements all bugs in a single model context.
Each run must establish its own red regression witness, diagnosis, plan,
independent reviews, green offline/relevant live gates and final review.

The batch fixes options to **`ship false` and `review_rounds 5`**. A lane cannot
merge into `main`, push, update the consumer dependency, or grant itself shipment
authority. A fully verified lane without pending owner approvals can create its
controller-bound local commit for later integration. A worker's completion text is
not proof: the parent checks durable run identity, witness/gate/review evidence,
checkout and commit identity itself.

All lanes in a wave settle before integration starts. A blocked or failed lane
does not cancel its siblings or authorize its dependents. No new wave begins
while the current wave is being integrated.

## Integration and shipment

For each eligible verified result, the controller creates a separate integration
worktree based on the recorded current `main`. A fresh Astra context integrates
the **exact verified source commit**, inspecting both sides of overlapping changes
and preserving previously integrated fixes. It may resolve semantic conflicts;
it must not choose `ours`/`theirs` blindly, weaken tests, replace frozen witnesses,
make unrelated changes or invent owner consent.

Integration is **serialized**, not four simultaneous merges to main. Even a
conflict-free merge needs fresh merged-tree verification: mandatory offline gates,
original regression witnesses and declared relevant live commands from both the
current fix and previously integrated bugs. Gates must
bind the final committed integration checkout; subsequent edits invalidate them.
Astra must also return a clean post-merge correctness review. Only the controller
can then promote that verified integration SHA to main and push it to `origin`.
Lane completion alone never ships anything. A failed merge, gate, review or push
stops further integration and retains evidence; do not mistake partial shipment
for a successful whole batch.

If resolving a conflict needs a new owner decision, integration stops with the
reason and retained worktree. Existing `/fix-bug` provisional decisions can permit
bounded implementation, but **pending owner approvals still prohibit integration
and shipment**. They are reported for inspection, never silently accepted just
because the batch is autonomous. There is no mid-run approval dialog.

## Read the result and preserve evidence

Progress and the final report point to an ignored directory:

```text
.pi/tmp/fix-all-bugs-<uuid>/
```

Physical worktree locations, relative to the repository root:

```text
.trees/fix-bug-<number>-<uuid>/
.trees/fix-all-bugs-<batch-uuid>-integrate-<number>/
```

The tracked `.gitignore` excludes `/.trees/`. Creation refuses an unignored or
tracked `.trees/` directory or a symlink in its place. Worktree cleanup leaves the
reports and original evidence in `.pi/tmp/` untouched.

Inspect its catalog, assessed plan, job manifests, controller state, integration
contexts/results and durable gate logs, together with each referenced
`.pi/tmp/fix-bug-<number>-<uuid>/` run. Source-run directories contain original red
proofs, the frozen witness manifest, stage reports, exact decision records and
independent reviews. Branches/worktrees belonging to blocked or pending results
remain available for inspection. Reports and logs are local evidence, **not a
backup**; review sensitive content before sharing and summarize essential proof
in tracked bug records.

The result can include integrated bugs, pending approvals, blocked lanes and bugs
not attempted because prerequisites were not integrated. Inspect actual per-bug
outcomes rather than assuming an invocation's normal return means all bugs shipped.
The displayed report is generated after finalization and explicitly distinguishes
pushed SHAs from unsuccessful pushes and incomplete consumer-update/cleanup work.
For a pi-theta checkout, successful shipment also performs the existing pi-config
dependency-pin update; a failure there is a **partial shipment**, not permission to
push the same fix again. Pending owner decisions include each chosen course,
rationale, alternatives and the retained branch/worktree paths.

An empty inventory reports `No open bugs.` without asking the planner to run.

There is **no `/fix-all-bugs resume` interface**. Do not edit manifests/controller
state or replay a lane's internal `batch` request manually. Each job has a permanent
at-most-once launch claim; incomplete claims and all batch-bound active source hosts
block lease release, including sources that could not be uniquely collected. A normal settled batch
releases its execution lease; interrupted execution can conservatively retain it
because children or integration work may still be active. Before any manual
reconciliation, inspect the lease owner, active jobs, worktrees, recorded SHAs and
remote state. Never delete a lock just to make another run start, never discard a
pending worktree, and never rerun a partially pushed batch blindly.

## Verification

[`tests/fix-all-bugs-workflow.test.ts`](../../tests/fix-all-bugs-workflow.test.ts)
exercises the real Pi host and child-process workflow with deterministic workers
and a local bare Git remote, without provider requests. It complements the
committed-theta parse gate and helper tests; it does not replace live validation
of Astra's readiness judgments or semantic merge prompts.
[`tests/live/acceptance/bugfix-batch.test.ts`](../../tests/live/acceptance/bugfix-batch.test.ts)
exercises the actual Astra planner and a real conflicting two-fix merge, with both
regressions preserved and fresh controller gates before promotion.
