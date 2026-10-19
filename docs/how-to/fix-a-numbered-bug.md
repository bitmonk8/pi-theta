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
```

With no arguments, `/fix-bug` lists current open reports, one line per bug:
four-digit number first, followed by a short description derived from the report
filename. `theta_print` displays it directly: no output-echo query or model
argument-binding call is made. The list is sorted by number and reads each report's current status,
not a hardcoded inventory. Listing is read-only, works with a dirty checkout,
and does not acquire the checkout lease or start a fix. The deterministic list
is also available without Pi: `node tools/bugfix/run.mjs list`.

The command accepts the bug number with or without leading zeros. Arguments
are parsed deterministically: `number`, optionally followed by `ship true|false`
and/or `review_rounds 1..5` in either order. Unknown/duplicate options fail
instead of being guessed by a model. Its sole raw-string parameter uses Theta's
existing single-string binder bypass. Defaults:
**commit and push requested**, five review rounds; permitted review bounds are 1–5.
The final explicit ship-approval dialog still applies. Use `ship false` to keep
verified changes local without committing or pushing.

Prerequisites:

- A clean working tree, a named branch, and exactly one matching open bug report.
  Resolve existing changes intentionally before starting; no auto-stash or reset.
- Installed dependencies (`npm ci`), working Git and Node, and the relevant
  real-host/live-test prerequisites from `AGENTS.md`.
- OpenAI access to GPT-6.1 Sol (stage workers) and GPT-6 Astra (independent
  reviews). The command's deterministic argument parsing needs no model.
- The pi-config `question` tool for owner decisions. In noninteractive mode,
  missing UI never counts as approval; spec decisions and shipping stop.

This version works **in the current checkout**, not an isolated worktree. Do not
run other editing agents there. A `.pi/tmp/fix-bug.lock` lease rejects a second
bug workflow, but cannot prevent unrelated tools from editing the checkout.

## Stages and stop conditions

1. **Reproduce before fixing.** Add an end-to-end regression test through the
   production path, run it red with the exact reported bad observable, and run a
   healthy control. A missing fixture, provider failure, compile failure or generic
   nonzero exit is not a witness. No production/spec edits are permitted yet.
   If already fixed, obsolete, or not reproducible, stop with evidence; do not
   silently close the report or manufacture a fix.
2. **Diagnose.** Trace the causal chain; add red unit witnesses for broken pieces
   where meaningful, or explain why smaller isolation is not meaningful.
3. **Mechanically rerun red witnesses.** The helper checks tests-only changes,
   requires an e2e witness, executes the pinned commands, and captures their
   failure signatures. A fresh reviewer audits the evidence and plan independently.
4. **Design and plan.** Specify the contract, minimal approach, touched files,
   coverage, compatibility, risks, related bugs and verification commands. The
   planning stage is read-only outside its run artifacts.
5. **Owner specification decision.** When normative specification changes or an
   adjudication are needed, present exact clauses/diff and alternatives before
   implementation. The first/default option stops. Only selecting **Approve
   proposed spec changes** authorizes the presented proposal. Free text,
   cancellation, no UI and missing answer all stop. Further spec decisions stop
   for another discussion; they are not covered by the first approval.
6. **Implement.** Follow the plan and exact approved proposal. Preserve witnesses;
   no early commits, status closure, version bumps or publishing.
7. **Verify.** Run the same witness commands green, `npm run typecheck`, `npm test`,
   and declared relevant live commands. No silent live skips or gate waivers.
8. **Independent review/fix loop.** A fresh Astra context reviews the actual diff
   and evidence. Read-only reviewer mutations are detected. Repair blocking
   findings, rerun gates, then review again, up to the bound. Exhaustion stops.
9. **Close the record, verify again.** Update the bug report/index factually;
   rerun witnesses, offline and live gates after review/closure, then perform a
   final independent audit. A final audit failure stops rather than shipping.
10. **Shipment (enabled by default).** With `ship true`, show the verified summary and request
    a separate explicit **Commit and push this fix** selection. The helper verifies
    unchanged HEAD/branch and unchanged post-gate files, stages only `src/`,
    `tests/`, `docs/`, commits and pushes only the current branch to `origin`.
    Other fix surfaces require manual shipment. No force push, auto-pull/rebase,
    tags, package publication, or version bump. A failed push leaves the commit
    intact and records its SHA; never rerun blindly.

"Ship" here means **commit and push**, not publish a package release. The closure
record must distinguish a working-tree fix from a published version. Package
release policy is outside this command.

## Artifacts and interrupted runs

Each invocation creates a unique ignored directory:

```text
.pi/tmp/fix-bug-0499-<uuid>/
```

It contains state/base SHA, stage reports, plan/spec proposal and approval text,
witness command manifest, red/green results, full gate logs, independent reviews,
and shipment outcome when applicable. Logs can contain provider/test details;
review them before sharing. They are local evidence, **not a backup**; summarize
essential proof in the tracked bug report before shipment.

Every expected stage refusal leaves artifacts and edits for inspection. The
workflow does not auto-revert, auto-stash, or auto-retry an interrupted stage.
`?` propagates child/tool failures fail-closed, so no downstream stage runs.

Successful no-ship completion or successful shipment releases the checkout lease.
On a stop/cancellation/crash, inspect the run named in
`.pi/tmp/fix-bug.lock/owner.json`. **After confirming no worker is still running**,
release it with:

```bash
node tools/bugfix/run.mjs release /absolute/path/to/the/run
```

This only releases the lease; it preserves all evidence and changes. There is no
automatic resume in this version. Inspect and intentionally commit/discard the
partial work before a fresh run. Never delete tests/evidence to hide a failed gate.

## Trust boundary

Commands, Git guards, exact dialog selections, snapshots and process exit codes
are mechanical. Whether a witness proves the bug, its regex names the correct
assertion, the diagnosis is sound, all necessary live coverage was declared, or
spec edits match the approved proposal still requires substantive model review
and owner inspection. A schema-valid model report is not proof by itself.

Workers have ordinary coding tools, including bash. Their read/write scope and
no-shipment rules are workflow instructions, **not an OS sandbox**. The helper
checks accidental violations at stage boundaries; it is not designed to contain
malicious code or a hostile worker modifying the control plane itself.

## Development verification

`tests/bugfix-workflow.test.ts` parses all three sources and exercises the helper
against scratch Git repositories: correct-reason red capture, green gates,
missing e2e/live prerequisites, early production edits, owner-decision refusal,
review mutations, HEAD drift, checkout lease, post-gate drift, and a real local
bare-remote commit/push. These are deterministic control-plane tests; they do not
prove the model will diagnose or fix an arbitrary bug correctly.
