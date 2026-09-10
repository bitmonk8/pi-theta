# How to fan out a fix pipeline across git worktrees

You have several independent fix clusters and want them fixed in parallel
without one fixer's edits colliding with another's in the same working tree.
The call-site `with { cwd: <expr> }` clause (theta 1.3) lets a `par for` fan a
subagent-mode callee out across separate git worktrees — one child `pi`
process per tree, each editing and testing in its own directory. This is the
worked example [RFC 0009](../rfcs/0009-per-call-subagent-cwd.md) validates its
payoff against, and `/quality-loop`'s fix phase is built in this shape
(RFC 0009 plan Phase 8): `.pi/theta/quality-loop.theta` provisions the trees
and integrates, `.pi/theta/workers/fix-cluster-tree.theta` is the wrapper
worker.

## Shape

1. **Provision** one git worktree per cluster, **outside the repo root**, and
   prune stale ones at the start of every wave.
2. **Fan out** with `par for … max <n> { worker(...) with { cwd: tree } }` —
   one isolated child per tree.
3. **Wrapper worker**: inside each tree, retry, gate, review, and commit once
   green — all in-tree, so the orchestrator never touches a fix's diff
   directly.
4. **Integrate** sequentially: cherry-pick the green branches onto the
   default branch, run one batch gate, revert last-to-first on red.

## 1. Provision worktrees outside the repo root

Worktrees live in a sibling directory (`../pi-theta-trees/`, not
`.git/worktrees` under the repo itself) so they carry no ignore-file or lens
churn for the main tree, and prune stale ones before every wave:

```bash
git worktree prune
node tools/worktrees.mjs provision --clusters "$CLUSTERS"
# prints one TAB-separated row per cluster: key<TAB>manifest<TAB>guidance<TAB>tree
```

`tools/worktrees.mjs` is a provisioning script sketch (not shipped): per row,
`git worktree add <sibling-dir>/qfix-<key> HEAD` on branch
`quality/fix-<wave>-<key>`, then seed `node_modules` (copy from the main tree;
`npm ci` as fallback).

## 2. Fan out with the per-call `cwd` clause

The orchestrator reads the provisioned rows and dispatches one wrapper-worker
call per tree, throttled by `max`:

```theta
---
description: Fan a cluster fix pipeline across disjoint git worktrees
mode: subagent
params:
  clusters: string
tools:
  - bash
  - ./fix-cluster-in-tree.theta
---
schema WorktreeRow {
  key: string,
  manifest: string,
  guidance: string,
  tree: string
}

// The worker's return schema — in a real setup both thetas import it from a
// shared .thetalib so the `invoke<TreeReport>` annotation below and the
// worker's constructor stay one definition.
schema TreeReport {
  ok: boolean,
  sha: string,
  fixed_confirmed: boolean
}

let provisioned = bash({ command: "node tools/worktrees.mjs provision --clusters " + clusters })?
let rows: array<string> = provisioned.split("\n")

let mut work: array<WorktreeRow> = []
for row in rows {
  if row != "" {
    let parts = row.split("\t")
    work = work.concat([WorktreeRow { key: parts[0], manifest: parts[1], guidance: parts[2], tree: parts[3] }])
  }
}

// One isolated child per tree; `cwd` sets the SPAWNED CHILD's working
// directory for this one call only — everything else about the launch
// (discovery roots, tools allowlist, trust flags) is unchanged (RFC 0009
// §4, the identity/location principle — see "Safety notes" below).
// The postfix `?` matters: it unwraps the CALL's own Result inside the lane,
// so a failed worker surfaces as the lane's Err and a green one hands the
// integration loop a bare TreeReport. Without it every lane is Ok(<inner
// Result>) for normal lanes and the `rep.ok` reads below panic on a Result
// receiver (`theta/runtime/non-object-receiver`).
let reports = par for w in work max 4 {
  invoke<TreeReport>("./fix-cluster-in-tree.theta", w.manifest, w.guidance) with { cwd: w.tree }?
}
```

`max 4` caps fan-out width independently of the git-worktree count; see
[Throttles](#throttles) for sizing it against test-runner concurrency.

## 3. Wrapper worker: retry, gate, review, commit — all in-tree

The retry loop, the test gate, and the review step move **inside** a
worktree-resident worker, so every side effect of a fix attempt — edits, test
runs, the commit — happens in that one tree. It reports a typed result; it
never writes to the shared store (see [Store writes](#store-writes-stay-orchestrator-only)):

```theta
---
description: "Fix one cluster inside its own worktree; gate, review, and commit once green"
mode: subagent
params:
  manifest: string
  guidance: string
tools:
  - bash
---
schema TreeReport {
  ok: boolean,
  sha: string,
  fixed_confirmed: boolean
}

schema ReviewVerdict {
  confirmed: boolean,
  notes: string
}

let mut attempt = 0
let mut gate_ok = false
while attempt < 2 && !gate_ok {
  attempt += 1
  @`Fix cluster ${manifest} in the current worktree: ${guidance}. Attempt ${attempt} of 2.`?
  let gate = bash({ command: "npm test -- --run" })
  gate_ok = match gate {
    Ok(_) => true,
    Err(_) => false,
  }
}

// An `if` is a STATEMENT in theta: a trailing if/else's branch values go
// nowhere, the callee's final value becomes null, and the orchestrator's
// member reads panic on it at runtime. Bind into a `let mut`, end on a bare
// expression tail — and have the caller use `invoke<TreeReport>` (below) so
// a null return is refused as `return_validation` instead of crossing as
// `Ok(null)`.
let mut out = TreeReport { ok: false, sha: "", fixed_confirmed: false }
if gate_ok {
  let verdict: ReviewVerdict = @`Review the diff in this worktree against the guidance: ${guidance}.
Report whether the cluster is genuinely fixed.`?
  if verdict.confirmed {
    bash({ command: "git add -A && git commit -m \"fix: " + manifest + "\"" })?
    let sha = bash({ command: "git rev-parse HEAD" })?.trim()
    out = TreeReport { ok: true, sha: sha, fixed_confirmed: true }
  }
}
out
```

A tree that never goes green (2 failed attempts, or a review that does not
confirm) reports `ok: false` and commits nothing; its branch is kept for
autopsy and its cluster's issues stay open.

## 4. Integrate sequentially: cherry-pick, one batch gate, revert on red

Back in the orchestrator, collect the green SHAs and integrate them onto the
default branch as one batch:

```theta
let mut green_shas: array<string> = []
for r in reports {
  let sha = match r {
    Ok(rep) => rep.ok ? rep.sha : "",
    Err(_) => "",
  }
  if sha != "" {
    green_shas = green_shas.concat([sha])
  }
}

let cherry = bash({ command: "git cherry-pick " + green_shas.join(" ") })
let outcome = match cherry {
  Ok(_) => bash({ command: "npm test -- --run" }),
  Err(e) => Err(e),
}

match outcome {
  Ok(_) => "batch integrated: " + green_shas.join(", "),
  Err(_) => "batch gate red; reverting last-to-first",
}
```

Because every green branch was individually gated in its own tree and
clusters are directory-disjoint, a red batch gate is rare; recover by
reverting the cherry-picks last-to-first, re-running the batch gate after
each revert, until it is green again.

## Throttles

Two independent knobs, sized against the same core budget:

- `par for`'s `max <n>` — how many worktree children run at once.
- Each wrapper worker's own `npm test -- --run --maxWorkers=<m>` — how many
  test-runner workers one tree uses.

Keep `n × m ≤ cores`. Raising `max` without lowering the per-tree worker cap
oversubscribes the machine; the fixer concurrency (`par for`'s `max`) and the
per-tree test concurrency compete for the same cores.

## Store writes stay orchestrator-only

The wrapper worker never touches the shared findings/quality store — it
reports a typed `TreeReport` and nothing else. Only the orchestrator, running
in the main tree after integration, writes to the store. This keeps the
store's single-writer rule intact under concurrency: N fixers can run at
once because none of them is a writer.

## Prune at wave start, not at wave end

Run `git worktree prune` (plus a directory sweep for anything `prune` does
not clean up) at the **start** of the next wave, not right after this one
finishes — a failed tree's worktree and branch are left in place for autopsy
until the next wave's provisioning step reclaims it.

## Safety notes

- **The child runs the parent tree's worker code, not the worktree's.** `cwd`
  relocates the callee's side effects, not which `.theta` file the child
  loads. With `--theta` roots still parent-resolved, a worktree-cwd'd
  `fix_cluster_in_tree` executes the *main* tree's `fix-cluster-in-tree.theta`
  while its `bash` calls run against the worktree — desired here (one source
  of orchestration code, even when a worktree holds an older commit), and a
  worktree cannot smuggle in different callee code by virtue of being the
  `cwd`. Trust does not follow `cwd` either: the child keeps its isolation
  flags and does not adopt the worktree's own `.pi` extensions, skills, or
  `AGENTS.md`. See RFC 0009 §4, the identity/location principle.
- **`<cwd>/.env` on Oh-My-Pi hosts.** If the host loads a `.env` file from
  the child's working directory before provider lookup, `cwd` changes
  *which* `.env` that is. Host behaviour, not theta's — treat it as an
  operator responsibility when a worktree might carry its own `.env` (RFC
  0009 §4, Resolved questions item 5).

## Reference

- [Grammar Appendix — Call-site `with` clause](../reference/grammar.md#call-site-with-clause)
  — the `CallWithClause` production.
- [Invocation — Options surface](../spec_topics/invocation.md#options-surface)
  — `cwd` value semantics, mode gating, failure arms.
- [How to fan out in parallel](./fan-out-in-parallel.md) — `par for` itself
  (this how-to assumes that one).
- [How to return a typed value across a subagent boundary](./return-a-typed-value-across-a-subagent-boundary.md)
  — the `TreeReport` / `ReviewVerdict` round-trip pattern used above.

## Provenance

- `with { cwd }` clause surface, mode gating, value semantics, and the
  identity/location principle (unchanged discovery roots, callable-hash
  verification, trust flags): `docs/rfcs/0009-per-call-subagent-cwd.md`
  (Proposal §1–§4), `docs/spec_topics/grammar.md#call-site-with-clause`,
  `docs/spec_topics/invocation.md#options-surface`.
- Worktree fan-out pattern, throttles, single-writer rule, prune-at-wave-start:
  RFC 0009 §Payoff validation (mirrors the pre-acceptance design's §9, which
  the accepted RFC's Payoff validation section supersedes as the normative
  summary).
- `par for` scheduling and `max`: `docs/how-to/fan-out-in-parallel.md`,
  `docs/spec_topics/control-flow.md`.
- The two illustrative `.theta` snippets above are validated as
  syntactically valid theta 1.3 source but are not checked in under
  `docs/examples/` and not run via `pi --theta … -p`: the pattern's real
  effect is git-worktree creation and multiple real child `pi` spawns,
  out of scope for the automated example-runner this repo's other how-tos
  rely on. Treat them as the worked shape; adapt `tools/worktrees.mjs` and
  the test-gate commands to your project.
