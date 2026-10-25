# Fix a numbered bug

`/fix-bug` processes one **open** report in `docs/bugs/`. It is not the quality
finding-store drain (`/quality-loop`). The committed workflow is
[`.pi/theta/fix-bug.theta`](../../.pi/theta/fix-bug.theta); deterministic gates
live in [`tools/bugfix/run.mjs`](../../tools/bugfix/run.mjs).

## Start

Run from this repository's root in an interactive Pi session:

```text
/fix-bug
/fix-bug 0499
/fix-bug 0499 ship false review_rounds 3
/fix-bug resume
/fix-bug resume 0499 ship false
```

With no arguments, `/fix-bug` displays **all current open bugs ranked by reported
impact, most severe first**. Each entry has its canonical number/title, an
estimated severity and one short sentence explaining that estimate. Conditional
judgments are marked **provisional**. A separate **fix-order guidance** section
covers real prerequisites, already-resolved blockers, decisions needed before
coding and upstream coordination. Severity rank is not implementation order;
filed S-labels and fix difficulty are not blindly used as severity.

This uses one read-only GPT-6 Astra assessment over complete immutable snapshots
of the current reports, plus current status/snapshots of referenced reports.
It is therefore model-assisted and takes longer than a numeric inventory; it is
not a proof that each open bug still reproduces. In particular, a stale 'blocked
on' sentence does not requeue a prerequisite whose report now says fixed.

Inventory, canonical titles, final formatting and validation are deterministic.
Every open bug must appear exactly once; unknown/closed ids, missing rows,
invalid severity order, malformed/overlong responses and cyclic prerequisite
edges are rejected instead of displaying a partial ranking. Reports changing
during assessment also stop with a fresh-assessment request. `theta_print`
displays the validated result without an output-echo query; the raw-string
argument binder remains bypassed.

Ranking does not edit reports/source, acquire the checkout lease, start a fixer,
request approval or ship anything. It works with a dirty checkout and creates
only ignored `.pi/tmp/bugfix-ranking-<uuid>/` input/assessment artifacts. An empty
inventory prints `No open bugs.` without a model request. For an instant,
model-free, number-sorted inventory, use `node tools/bugfix/run.mjs list`.

The command accepts the bug number with or without leading zeros. Arguments
are parsed deterministically: `number`, optionally followed by `ship true|false`
and/or `review_rounds 1..5` in either order. Unknown/duplicate options fail
instead of being guessed by a model. Its sole raw-string parameter uses Theta's
existing single-string binder bypass. Defaults:
**automatic merge to main and push when no owner approvals are pending**, five
review rounds; permitted review bounds are 1–5. The owner has given standing
permission for this shipment path: there is **no mid-run approval prompt**,
including after resume. Use `ship false` to retain the verified branch/worktree locally.
This does not permit version bumps, tags, npm publication, force pushes, or
shipment before all verification and reviews pass.

`/fix-bug resume` continues the paused run that owns this checkout's lease,
including its original bug number and saved options. An optional number asserts
which bug you intend to resume; it never starts a new run. Explicit `ship` or
`review_rounds` options override the saved value. Omitted options retain their
original values. A saved `ship true` uses the standing commit/push permission;
a saved `ship false` remains local. Resume never supplies missing spec/test authority
or approves pending provisional decisions.

Prerequisites:

- A clean working tree, a named branch, and exactly one matching open bug report.
  Resolve existing changes intentionally before starting; no auto-stash or reset.
- Installed dependencies (`npm ci`), working Git and Node, and the relevant
  real-host/live-test prerequisites from `AGENTS.md`.
- OpenAI access to GPT-6.1 Sol (stage workers) and GPT-6 Astra (ranking,
  independent reviews and delegated decisions). Argument parsing needs no model.

Every numbered fix uses a **dedicated branch and Git worktree** under the
repository's gitignored `.trees/` directory:

```text
.trees/fix-bug-<number>-<uuid>/
```

`state.root` identifies that worktree; all worker edits, tests and gates run there,
not in the original checkout. The controller requires `.trees/` to be ignored and
untracked, and refuses a symlink in its place. Durable reports stay separately in
the original checkout's ignored `.pi/tmp/` run directory so successful cleanup
cannot delete the evidence. Dependencies must be
available in the new worktree before verification can succeed.

A new run saves its requested options and claims active execution before publishing
its lease owner; resume cannot take over a still-initializing invocation. A
`.pi/tmp/fix-bug.lock` lease rejects a second workflow. Do not run unrelated editing
agents in the bugfix worktree; the lease is not an OS-level isolation mechanism.

## Stages and stop conditions

1. **Reproduce before fixing.** Add an end-to-end regression test through the
   production path, run it red with the exact reported bad observable, and run a
   healthy control. A missing fixture, provider failure, compile failure or generic
   nonzero exit is not a witness. No production/spec edits are permitted yet.
   If already fixed, obsolete, or not reproducible, stop with evidence; do not
   silently close the report or manufacture a fix.
2. **Diagnose.** Trace the causal chain; add red unit witnesses for broken pieces
   where meaningful, or explain why smaller isolation is not meaningful.
3. **Mechanically establish red witnesses.** On the first pass the helper checks
   tests-only changes, requires an e2e witness, executes the pinned commands, and
   captures their failure signatures. On resume it validates those original
   records and the frozen manifest, rather than rerunning pre-fix tests against
   fixed production or overwriting the evidence. A fresh reviewer audits the
   evidence and plan independently.
4. **Design and plan.** Specify the contract, minimal approach, touched files,
   coverage, compatibility, risks, related bugs and verification commands. The
   planning stage is read-only outside its run artifacts.
5. **Astra decides; owner approval is deferred.** Exact normative proposals still
   follow planning and independent evidence review before implementation. A fresh,
   read-only **GPT-6 Astra** context inspects the exact proposal, prior decisions,
   principles, alternatives and evidence. It chooses the best supported bounded
   course and records implementation authority. A genuine material tradeoff is
   recorded as **provisional**, with recommendation, rationale, cited basis and
   alternatives; work continues without waiting for the owner. Provisional scope
   is not shipment approval and cannot overrule explicit owner restrictions or
   waive missing evidence, integrity checks or gates. Revised proposals replan and
   are independently reviewed/assessed again, bounded to three workflow cycles
   per invocation; an earlier decision never covers new scope.
6. **Implement.** Follow the plan and exact approved proposal. Preserve witnesses;
   no early commits, status closure, version bumps or publishing.
7. **Verify.** Run the same witness commands green, `npm run typecheck`, `npm test`,
   and declared relevant live commands. No silent live skips or gate waivers.
8. **Independent review/fix loop.** A fresh Astra context reviews the actual diff
   and evidence. Read-only reviewer mutations are detected. Repair blocking
   findings, rerun gates, then review again, up to the bound. Exhaustion stops.
9. **Close the record, verify again.** Update the bug report/index factually;
   rerun witnesses, offline and live gates after review/closure, then perform a
   final independent audit. Failure never permits shipment; a routine authorized
   repair re-enters the bounded verification/review cycle.
10. **Approval handoff or automatic shipment.** Only AFTER all reviews and gates
    pass, list every pending owner decision with the course Astra chose, its
    motivation, basis and alternatives. If any need approval, **do not merge or
    push**: retain branch, worktree and resume ownership for inspection. Silence
    is not approval. With no pending approvals and `ship true`, commit the verified
    branch, merge it to **main**, push main to `origin`, then remove the temporary
    worktree and branch. The helper verifies unchanged HEAD/branch,
    final verification/review and unchanged post-gate files, stages only `src/`,
    `tests/`, `docs/`.
    Unexpected staged/index content is refused, not reset or silently included.
    The index committed must match the verified scoped checkout exactly.
    Other fix surfaces require manual shipment. No force push, auto-pull/rebase,
    tags, package publication, or version bump. A failed push leaves the commit
    intact and records its SHA; never rerun blindly.
    For a `@bitmonk8/pi-theta` checkout, a successful push additionally updates
    the canonical `~/.pi/agent/git/github.com/bitmonk8/pi-config` clone: require
    clean `main`, pull/rebase, verify the pushed SHA is pi-theta's remote HEAD,
    install that exact Git SHA into `package.json` and `package-lock.json`
    (also refreshing the installed dependency), verify the pin, then commit,
    pull/rebase and push pi-config `main`. No other config paths are staged.
    Both repository outcomes are recorded in `shipment.json`. A consumer-update
    failure is a partial shipment, not success: pi-theta is already pushed;
    reconcile pi-config status/log and retry only the consumer update, never
    rerun the bug fix or discard existing work. `ship false` updates neither repo.

"Ship" here means **commit, merge to main and push**, not publish a package release. The closure
record must distinguish a working-tree fix from a published version. Package
release policy is outside this command.

## Artifacts and interrupted runs

Each new numbered run creates a unique ignored directory; resume reuses it:

```text
.pi/tmp/fix-bug-0499-<uuid>/
```

It contains state/base SHA, stage reports, plan/spec proposal and approval text,
witness command manifest, red/green results, full gate logs, independent reviews,
delegated decision snapshots/verdicts/authority, and shipment outcome when applicable.
Logs can contain provider/test details; review them before sharing. They are local evidence, **not a backup**; summarize
essential proof in the tracked bug report before shipment.

### Delegated decisions and remaining stops

A stage needing authorization writes `decision-request.md` with exact files/cases,
old/new outcomes, alternatives, recommendation, cited decisions/principles, risks
and preserved/replacement controls BEFORE editing that scope. Early-phase
clarifications return `needs_decision`. Implementation/repair revisions to a
completed plan return **`needs_replan`**, including routine non-spec changes such
as a common-prefix fixture adjustment, synthetic diagnostic baseline addition or
CRLF-plan exception. Implementation/repair `needs_decision` also takes this route.
The controller's `stage-replan RUN implement|repair` transition grants only
read-only planning permission, not expanded implementation authority:

1. Verify the exact checkpoint/request and preserve the old plan, proposal,
   request, stage report/checkpoint and evidence review in digest-checked `history/`.
2. Invalidate the old plan/review binding. PLAN incorporates the request and
   reproduces its exact bytes in `decision-request.md`; no old plan is rewritten.
3. Obtain a fresh independent evidence/plan review bound to the revised plan and
   unchanged checkout. An old clean report cannot authorize the new scope.
4. Present the original exact request to a fresh Astra **scope** assessment.
   Only its recorded CONTINUE (possibly provisional) authorizes those exact edits.
   A normative change additionally requires the exact PLAN specification approval.

Original requests, decision records, witness manifests and accepted red captures
remain immutable; a different request requires another explicit replan. The same
three-cycle invocation ceiling bounds these transitions. Ordinary blocked stages
without an exact scope-revision request receive a fresh Astra assessment.
An ordinary blocked report without an exact request can receive only existing-scope
retry guidance, not unspecified test/spec authority. Early phases remain tests-only.
Normative authority is recorded only for the exact PLAN proposal following evidence
review; revised implementation/repair contracts replan inline.

Each assessment has a unique `decision-<uuid>/context.json` recording the exact
request/report/proposal and checkout/checkpoint identity. Its typed verdict records
evidence sufficiency, whether one course is clearly preferred, whether a material
tradeoff remains, recommendation, rationale, cited basis and alternatives. The helper
rejects inconsistent/malformed or stale decisions and checks read-only integrity.
Accepted exact authority is recorded in state and `decision-authorizations.md`;
it is not fabricated as a human selection. Workers and reviewers must audit it.
The archived records and rendered authority view are integrity-checked when
reused, including resume, stage execution, verification and shipment. A PLAN-stage
scoped request is not a spec approval. Exact spec approval requires a clean review
bound to the CURRENT plan/proposal and unchanged checkout, not an old report.

Routine cases include exact legacy-oracle corrections required by an already
approved contract, or fixture API adaptations preserving assertions and original
red evidence. Retain annotated fixtures, complete diagnostics/messages/order,
healthy and genuine-unknown controls, original sources and red captures. This is
not permission to make tests agree with arbitrary implementation output. Specific
owner rulings/refusals remain binding; delegation supersedes only human-only
workflow boilerplate. No decision can waive gates, weaken helpers, delete coverage,
rewrite the manifest/accepted reds, bypass planning or confer publication authority.

Astra returns `human` only for a genuine material tradeoff: it chooses a concrete
course provisionally, continues implementation, and defers the owner handoff until
after clean final verification/review. Each such decision is presented separately
with its motivation; the branch/worktree are retained, never silently approved.
It returns `blocked` for an objective prerequisite such as
missing evidence, credentials or integrity—not permission to proceed unsafely.
Failing gates, unreproduced bugs, failed reviewers and retry exhaustion can still
stop the run. At most three attempts per stage call and three workflow/replan
cycles run in one invocation. A rejected independent review is never converted to a pass:
clarification/repair still requires fresh review and green gates.

Every expected refusal leaves artifacts and edits for inspection, and prints a
plain-text stop card: stage, reason, environment involvement, bug validity,
fixability, progress, required owner action, recommendation and artifact path.
Unknowns are explicit; a blocked gate does not mean an invalid or unfixable bug.
Child execution failures also stop rather than advancing the workflow. No
auto-revert, auto-stash or unbounded automatic retry occurs.

### Resume a paused run

Resolve the reported prerequisite first (including any required owner approval),
then run **`/fix-bug resume`**. The controller:

- Selects only the current lease owner, not the newest-looking artifact folder.
- Validates checkout/root identity, HEAD/branch, control-file identity, saved
  options, completed report/result digests, original red records, frozen witness
  manifest and required specification approval. Changes to source workflow code or
  completed plan/report require explicit reconciliation, not guessing. The narrow
  authenticated parent-owner upgrade exception below never changes source controls.
- Reuses recorded completed reproduction, diagnosis and planning stages. The
  completed plan/proposal are immutable; actual implementation outcomes belong
  in implementation/repair reports. A new ruling is written separately to
  `spec-revision-proposal.md` and recorded as `needs_spec`, explicitly invalidating
  the plan checkpoint so the current bounded invocation (or next resume) replans,
  re-reviews and obtains an exact delegated decision, with any owner approval deferred until all reviews/gates pass
  for an unresolved tradeoff. A rejected evidence-review plan can likewise be
  explicitly archived/invalidated, revised with its findings and scoped decision,
  and independently reviewed again; it is never reused as an unchanged cached
  plan or silently overwritten. For legacy implementation/repair checkpoints with
  status `needs_decision` or `blocked` and an exact recorded `decision-request.md`,
  resume conservatively enters the same authority-free scope-replan transition.
  This is based on structured checkpoint/request identity, never keywords in a
  reviewer's prose; a prior BLOCKED decision stays BLOCKED. A missing, edited or
  stale request/report is refused, not treated as permission. A report file alone
  is not a completed checkpoint. Interrupted/blocked stages
  rerun, inspecting their partial edits. A completed implementation reruns if
  the checkout digest has changed; repair and closure are never cached.
- Archives prior stage reports/results and independent evidence/fix/final-review
  findings under `history/`, and gives gate attempts distinct sequence numbers,
  including failed attempts. Workers must use fresh
  attempt-specific log names. Original accepted red records are not replaced.
- Runs evidence review, verification gates, fix reviews, closure and final
  verification/review again. Prior gates are invalidated; the standing ship option
  remains, but cannot bypass fresh verification. Prior exact spec approval survives
  only for the same proposal. Recorded bounded decisions remain auditable; new
  scope requires a fresh assessment. Resume is not permission to change a frozen
  test, waive a gate or adopt another contract.

Normal stops clear the run's **active execution marker** while retaining the
checkout lease. An existing marker prevents a second invocation from resuming,
**even if the host pid died**: detached workers or gate subprocesses may still
be running. Cancellation can also leave a marker while the interactive Pi
process continues to exist. **After confirming the original workflow, all
workers and all controller/gate subprocesses have stopped**, clear that marker
(not the lease) with:

```bash
node tools/bugfix/run.mjs pause /absolute/path/to/the/run
```

Then use `/fix-bug resume`. The exclusive activation claim precedes authoritative
state/checkout validation. Controller writes compare the generation/revision
captured when each command started, preventing an old in-flight gate from saving
its stale state over a resumed invocation. Checkout changes during a gate also
invalidate that attempt. An incomplete/stale `activation/` or `state-write/`
claim is deliberately not guessed away: inspect it only after confirming all
invocations stopped. Do not clear another active worker's marker. These guards
are accident prevention, not a sandbox or a substitute for process quiescence.

Successful no-ship completion releases the checkout lease but retains the branch
and worktree. Pending owner approvals retain resume ownership as well. Successful
shipment releases the lease and removes the temporary branch/worktree; failed or
partial shipment must preserve recoverable work and record what actually happened.
To intentionally **abandon** a stopped run instead of resuming, inspect
`.pi/tmp/fix-bug.lock/owner.json` and, after confirming all workers stopped, use:

```bash
node tools/bugfix/run.mjs release /absolute/path/to/the/run
```

Release preserves evidence/edits but removes the run's resume ownership. Never
delete tests/evidence to hide a failed gate. Runs created before resumable
checkpoints were introduced are refused with a legacy-handoff explanation;
the command cannot safely reconstruct completed stages from prose reports.

### Authenticated parent-owned source continuation

A parent-owned source is **not** selected by ordinary `/fix-bug resume`. The
parent uses `/fix-bug batch-resume /absolute/path/to/original/jobs/NUMBER.json`;
`parseBugRequest` emits exactly `BATCH_RESUME`, the manifest path, `false`, `5`
(on four lines), and `resume-batch-file REQUEST_FILE HOST_PID` performs admission.
This never initializes a run or replays its launch claim. It requires the original
manifest bytes/digest, original launch claim, live parent checkout lease and
`jobs[NUMBER].sourceRun`, with status `scheduled` and `resumeRequested: true` on an
unfinished parent. It reuses that exact uncommitted source run, worktree, branch,
base and evidence; source commits/shipments and unexplained execution markers
block continuation. The options remain **ship false / review_rounds 5**, and the
normal resume stage-validation and fresh gate/review requirements still apply.
Owner main may have advanced only as recorded by the authenticated parent;
the source still validates against its **original manifest base**, never new main.

A workflow-only owner repair may be recorded by the parent as a
`workflowUpgrades` entry with `{base, sha, ownerControls: [{path, digest}]}`;
digests are SHA-256 of raw file bytes. The newest entry must name an ancestral
upgrade and contain a unique, validated workflow-control path union covering
all of this source's original `controlPaths` and the complete current owner
execution-control set, including newly introduced bootstrap/batch helpers. Every
captured owner control must still exist with its recorded raw bytes; an omitted,
changed or deleted control is refused, under the same manifest/claim/lease
identity. The retained source must **still** match its exact original control path
list and `controlDigest`. This does not update source controls, transplant a new
base, approve decisions or adopt arbitrary owner changes. Ordinary single-bug
runs have no upgrade exception. Parent orchestration and recovery are documented
separately in [Fix all bugs](fix-all-bugs.md).

## Trust boundary

Commands, Git guards, recorded explicit owner confirmations, snapshots, decision
consistency checks and process exit codes are mechanical. Each invocation allocates its own request file before writing
raw arguments, so concurrent callers cannot overwrite each other's bug/options
before lease acquisition. Only generated paths are shell-quoted; raw slash
arguments never become shell command text. Whether a witness proves the bug, its regex names the correct
assertion, the diagnosis is sound, all necessary live coverage was declared, or
spec edits match the authorized proposal still requires substantive independent
review. The Astra rationale is evidence-backed judgment, not mechanical proof;
the owner can inspect every recorded decision. A schema-valid report is not proof.

Fix/review workers have ordinary coding tools, including bash; the ranking
worker admits only `read`. The decision worker admits read/grep/bash for read-only
inspection; its checkout and authority inputs are fenced. Worker read/write scope
and no-shipment rules
are workflow instructions, **not an OS sandbox**. The helper
checks accidental violations at stage boundaries; it is not designed to contain
malicious code or a hostile worker modifying the control plane itself.

## Development verification

`tests/bugfix-workflow.test.ts` parses all five sources and exercises the helper
against scratch Git repositories: correct-reason red capture, green gates,
missing e2e/live prerequisites, early production edits, owner-decision refusal,
review mutations, HEAD drift, checkout lease, post-gate drift, and a real local
bare-remote commit/push. These are deterministic control-plane tests; they do not
prove the model will diagnose or fix an arbitrary bug correctly.

`tests/bugfix-resume.test.ts` covers durable checkpoints, stopped/dead/live
execution ownership, option preservation, original-red reuse, drift and legacy
refusals, exact/revised spec approval, archived reports/reviews, failed gate logs,
invalidated legacy shipment answers/fresh verification and a real outstanding
gate's stale-write fence. `tests/bugfix-workflow-reporting.test.ts` drives the real CLI
and real child processes with deterministic workers, including a blocked
implementation followed by `/fix-bug resume` through fresh gates/reviews and a
local handoff. These tests make no provider requests; they do not substitute for
live testing of a real model's diagnosis or repair.

`tests/bugfix-decisions.test.ts` covers delegated/human decisions, malformed or
inconsistent verdicts, stale contexts, original evidence and retained gate/shipment
boundaries, typed non-spec scope replanning, immutable archived requests and stale
review/decision rejection. Resume tests cover the original parent manifest/claim,
scheduled-source retry admission, fixed options and owner-only control upgrades
without changing source controls/base. Real-host reporting tests cover automatic scoped retries and default
commit/push against a local bare remote, the local-only opt-out, exact spec
authorization without a dialog and deferred material-tradeoff approval after
clean final gates/review, with branch/worktree retention.
`tests/live/acceptance/bugfix-decisions.test.ts` drives the actual Astra prompt for a
precedent-derived correction and an unresolved tradeoff; assertions observe the
returned/persisted decision, not merely prompt resolution.

`tests/bugfix-ranking.test.ts` verifies full snapshots, current/open eligibility,
resolved-status context, read-only inventory behavior, stale-input detection,
complete/unique coverage, severity sorting, provisional labels and prerequisite
cycle checks. The real-host reporting tests cover rendered ranking/guidance,
rejected model responses, stale data and a model-free empty inventory.
`tests/live/acceptance/bugfix-severity-ranking.test.ts` drives the actual ranking
prompt through a real provider: demonstrated silent corruption must outrank a
cosmetic defect even when their filed S-labels are reversed, and a fixed
prerequisite must not be queued again. Its observable is the validated rendered
list/guidance, not merely a resolved prompt.
