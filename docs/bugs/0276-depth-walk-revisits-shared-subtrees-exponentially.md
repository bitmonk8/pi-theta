# Bug 0276 — Bug 0271's `callee-has-errors` depth walk bounds termination but not cost: the visited set threaded through `calleeFailsOwnStructuralChecks` (`production-composition.ts:2172`) is PER-BRANCH, so a shared subtree is re-judged once per simple path that reaches it, and a k-layer two-wide diamond ladder of legal, healthy files costs on the order of 2^k judgements — measured 0.99 s at k = 9, 10.5 s at k = 12 and 68.2 s at k = 15 over 19, 25 and 31 distinct files, against 43 ms for a linear chain of depth 12

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2 because the input is legal, healthy and
  fully registering (every file in every measured ladder registers), and the
  load pass stalls on it: 10.5 s at 25 files, 68.2 s at 31, doubling per added
  layer, and the walk re-runs on every compose pass, so a hot-reload edit pays
  the same bill again. Not S1: no value is wrong, no diagnostic is wrong, and
  every verdict the walk reaches is the correct one (§Reproduction, broken-leaf
  row). Not S3 in the scale's own terms — S3 is the verification-gap band, and
  nothing here is a witness that cannot red; a reader who weights reachability
  over failure class would seed S3 instead, since no realistic `tools:` graph is
  this wide and this deep and the availability precondition is therefore crafted
  input. D2: one subsystem (`production-composition.ts`), no new registry row
  (nothing is diagnosed), and the same-commit spec edit is the bound sentence at
  `invocation.md:20` plus its `discovery-cli.md:270` mirror — but the fix must
  adjudicate a per-pass verdict memo against a depth cap, and the memo's
  soundness argument (§Fix) is the work.
- **Kind:** defect — unbounded resource cost on legal input. No spec sentence
  is contradicted: `docs/spec_topics/invocation.md:20` states the bound this
  report measures ("The recursion is bounded by a set of the resolved absolute
  paths already visited on the current branch of the walk"), and neither that
  page nor its `docs/reference/discovery-cli.md:270` mirror bounds the number of
  judgements per pass, states a judgement order, or forbids re-judging a path on
  a second branch. The same paragraph does bound the parse ("Each visited file
  is parsed once per pass"), which is why the measured cost is the per-visit
  probe work rather than repeated parsing.
- **Affected** (every citation re-derived at HEAD `1e7e4321`;
  `src/extension/production-composition.ts` is 3291 lines at HEAD):
  - `src/extension/production-composition.ts:2172` — the `visited:
    ReadonlySet<string>` parameter of `calleeFailsOwnStructuralChecks`
    (`:2163`), the per-branch state this report is about.
  - `src/extension/production-composition.ts:2237` — `if
    (visited.has(nestedAbsolute)) { continue; }`, the termination guard. It is
    correct and load-bearing; bug 0271's cell (CYC1) hangs without it.
  - `src/extension/production-composition.ts:2279` — `new Set([...visited,
    nestedAbsolute])`, the per-branch extension. The set grows down a branch and
    is discarded when the branch returns, so a sibling branch re-enters the same
    subtree with the ancestor paths absent from its set.
  - `src/extension/production-composition.ts:2270` — the recursive call the set
    is threaded through.
  - `src/extension/production-composition.ts:2027` — the seed at
    `parseCalleeForTools`'s call site (`new Set([absolute])`), and
    `:2615` — the same seed at `parseCalleeTheta`'s dispatch gate (`:2606`). One
    predicate, two entry points, one cost profile.
  - `src/extension/production-composition.ts:2221` — `fs.readBytes` per visit,
    ahead of the visited-set guard at `:2237`, so a re-entered subtree re-reads
    every member's bytes.
  - `src/extension/production-composition.ts:2246` —
    `checkInvokePathAtLoad` (containment, `realpath`) per visit.
  - `src/extension/production-composition.ts:2180` — `checkThetaImports` per
    visit, and `:2309` — `resolveCallableSet` per visit. These four are the
    per-visit work; `parseViaPassCache` (`:2262`) is memoised by the pass cache,
    matching `invocation.md:20`'s parse-once sentence.
  - `src/extension/production-composition.ts:2101–2107` — the doc-comment's
    TERMINATION paragraph, which states the visited set and its cycle argument
    and says nothing about cost.
  - `src/extension/production-composition.ts:2144–2146` — withhold (c), "a
    member already in the visited set … not a failure, a WITHHOLD". This is the
    one branch-dependent input in the predicate and therefore the whole of
    §Fix's soundness argument.
  - `docs/spec_topics/invocation.md:20` (`#static-resolution`) — the recursion,
    its per-branch bound, and the parse-once sentence.
  - `docs/reference/discovery-cli.md:270` — the mirror of the same bound.
  - `tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts` — bug
    0271's ten-cell witness. Cells (CYC1)/(CYC2) (`:680`, and the ceiling
    constant `CYCLE_ELAPSED_CEILING_MS` at `:242`) are the hang fence a cost fix
    must keep.
  - `tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts` —
    bug 0271's live cell.
  - `tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts` —
    bug 0270's witness, including the cell bug 0271 flipped.
  - `tests/callee-post-parse-errors-un-register-tools-caller.test.ts` — bug
    0267's ten depth-1 cells.
- **Observed at:** HEAD `1e7e4321`, v0.270.0, `main`, by one offline
  provider-free scratch probe driving `composeExtensionInstance` over host
  doubles on planted `.pi/theta/` fixtures (token `b0276scratch`, removed after
  measurement; sweep clean).

## Summary

Bug 0271 replaced the depth-1 stub with a recursion into
`calleeFailsOwnStructuralChecks` and bounded it with a visited set of resolved
absolute paths. The set is per-branch: it is extended on the way down
(`:2279`) and discarded on the way back up. Termination is therefore proven for
any `tools:` graph, and stays proven — a cycle closes the first time the walk
returns to a path on its own recursion stack.

Cost is not bounded. Nothing records that a path has already been judged on a
*different* branch, so a subtree named by two callers is judged twice, a subtree
under two such subtrees four times, and a k-layer two-wide diamond ladder is
judged on the order of 2^k times over 2k + 1 distinct files. Each judgement
re-reads the member's bytes (`:2221`), re-runs the containment `realpath`
(`:2246`), re-runs `checkThetaImports` (`:2180`) and re-runs
`resolveCallableSet` (`:2309`); only the parse is memoised.

Measured on legal, healthy, fully registering ladders: 0.99 s at k = 9, 10.5 s
at k = 12, 68.2 s at k = 15, doubling per added layer. A linear chain of depth
12 over 13 files costs 43 ms, so the cliff is the sharing, not the depth. Every
verdict the walk produces is correct, and identical along every path that
reaches a shared file — which is what makes a verdict memo a candidate fix.

## Reproduction

Plant the fixture set under `<cwd>/.pi/theta/` with a `{}` `.pi/settings.json`,
then run `composeExtensionInstance(pi, ctx, undefined, new RendererGate())` over
host doubles (`ctx.cwd` = the workspace), timing the call and reading
`wiring.thetas` for the registration decisions. Same harness shape as bug
0271's witness (`makeHost` / `plantWorkspace` / `runLoadPass`).

The diamond ladder at parameter k: one prompt-mode top caller naming both
layer-1 files, layers 1 … k−1 holding two subagent files each that both name
BOTH files of the next layer, and layer k holding two healthy leaves. 2k + 1
distinct files; 2^k simple paths from the top caller to a layer-k leaf.

Top caller:
`---\nmode: prompt\ntools:\n  - ./b0276scratchl1a.theta as la\n  - ./b0276scratchl1b.theta as lb\n---\n@`hi`\n`

Interior file at layer i (both sides, i < k):
`---\nmode: subagent\ndescription: l<i><side>\ntools:\n  - ./b0276scratchl<i+1>a.theta as na\n  - ./b0276scratchl<i+1>b.theta as nb\n---\nlet a = 1\n`

Leaf at layer k (both sides):
`---\nmode: subagent\ndescription: l<k><side>\n---\nlet a = 1\n`

| k | distinct files | registered | load pass, wall clock | ratio to k−1 |
|---|---|---|---|---|
| 3 | 7 | 7 | 38 ms | — |
| 6 | 13 | 13 | 139 ms | — |
| 9 | 19 | 19 | 990 ms | — |
| 10 | 21 | 21 | 2 137 ms | 2.16 |
| 11 | 23 | 23 | 4 410 ms | 2.06 |
| 12 | 25 | 25 | 10 509 ms | 2.38 |
| 13 | 27 | 27 | 17 443 ms | 1.66 |
| 14 | 29 | 29 | 34 572 ms | 1.98 |
| 15 | 31 | 31 | 68 208 ms | 1.97 |

Thresholds on this machine: the pass exceeds 1 s at k = 10, 10 s at k = 12 and
60 s at k = 15. Adding six files (k = 12 → k = 15) multiplies the pass by 6.5.

Controls:

| case | distinct files | registered | wall clock |
|---|---|---|---|
| linear chain, depth 12 (each file names exactly one next file) | 13 | 13 | 43 ms, 57 ms on a second run |
| the k = 12 ladder with the top prompt caller removed | 24 | 24 | 7 256 ms |

The linear control isolates the cause: depth 12 with no sharing is three orders
of magnitude cheaper than depth 12 with two-wide sharing. The second control
attributes the total: the top caller's own walk accounts for
10 509 − 7 256 = 3 253 ms of the k = 12 figure, and the remaining 7 256 ms is
every ladder file's own compose-pass walk over the sub-ladder below it, each
exponential in its own remaining depth. The measured number is therefore the
production load cost of the file set, not one caller's walk in isolation.

Correctness under the same fixture — the k = 6 ladder with the single layer-6
`a` leaf replaced by a file whose own body carries an unterminated template:

```
registered = ["b0276scratchl6b"]   (295 ms)
```

Every file that can reach the broken leaf refuses — both of its parents, all
four grandparents, up to the top caller — and the one file that cannot reach it
(the healthy sibling leaf) registers. The verdict for a shared file is thus
identical along every path that reaches it, because every path presents the
predicate with the same bytes and the same acyclic subtree. Cost is what
multiplies, not outcome.

Machine caveat: single machine (Windows, node under vitest, warm filesystem
cache), one run per cell except the linear control. The absolute milliseconds
are machine-specific; the doubling per added layer and the ladder-versus-chain
ratio are the observables.

## Expected behaviour

Load cost bounded roughly linearly in the number of DISTINCT files the walk
reaches, not in the number of simple paths through the `tools:` graph. A file
set of 2k + 1 files with a k-layer sharing structure costs on the order of
2k + 1 judgements, so the k = 15 ladder lands within a small multiple of the
depth-12 linear chain's 43 ms rather than at 68 s.

`invocation.md:20` already bounds the parse this way — "Each visited file is
parsed once per pass" — and the pass cache delivers it. The per-visit probe work
around the parse (`:2221`, `:2246`, `:2180`, `:2309`) carries no equivalent
bound, and the same sentence's per-branch visited set is what withholds one.

Termination is unchanged: a `tools:` cycle terminates, and no cycle member is
turned into a manufactured refusal.

## Actual behaviour / root cause

`calleeFailsOwnStructuralChecks` (`:2163`) takes `visited` (`:2172`) by value
and, for each readable, in-root, unvisited `.theta` entry of the callee's own
`tools:`, recurses with `new Set([...visited, nestedAbsolute])` (`:2279`). The
set is thus exactly the ancestor chain of the current recursion stack. When the
call returns, the set is dropped. The guard at `:2237` consults only that
chain, so a path reached again on a sibling branch is not in the set and is
re-judged in full.

There is no second store. The pass cache (`parseViaPassCache`, `:2262`) memoises
the DOCUMENT, so the parse is paid once per file per pass; the four per-visit
operations that surround it are not memoised and are paid once per path:

- `fs.readBytes` at `:2221`, which sits AHEAD of the visited-set guard at
  `:2237`, so even a guard hit costs a read;
- `checkInvokePathAtLoad` at `:2246` (containment, one `realpath` per active
  root);
- `checkThetaImports` at `:2180`, which resolves and reads the callee's
  `.thetalib` imports;
- `resolveCallableSet` at `:2309`.

On the ladder, the number of judgements of a layer-i file equals the number of
simple paths from the top caller to it, so the total is on the order of 2^k and
the per-added-layer factor is 2 — the measured 1.66–2.38 band in §Reproduction.
Both entry points inherit it: `parseCalleeForTools` seeds at `:2027` and
`parseCalleeTheta`'s dispatch gate at `:2615`, and neither passes any
cross-branch state.

The doc-comment states the termination bound (`:2101–2107`) and does not claim a
cost bound, and `invocation.md:20` describes the same set with the same silence.
The defect is the missing bound, not a divergence between them.

## Why it matters

- The walk runs on every compose pass, so the cost is paid at extension load and
  again on every hot-reload of any file in the graph. A 10 s pass is 10 s of
  dead session; the pass has no incremental path that skips unchanged branches.
- Availability from crafted input at load: 25 legal, healthy files that all
  register are enough for a 10 s pass, and 31 for 68 s. Nothing in the file set
  is malformed, so no diagnostic names the cause and no refusal caps the work —
  the author observes a slow or wedged load with a fully green report.
- Growth is 2× per added layer, so the gap between "noticeable" and "wedged" is
  a handful of files. Bug 0271's fix record puts the effective hang around
  k = 30; the measured curve reaches it earlier in wall-clock terms than that
  figure suggests.
- The cost is invisible in the shipped witnesses. Bug 0271's cells (CYC1)/(CYC2)
  bound wall clock at 20 s (`grandchild-callee-drop-un-registers-depth-two-caller.test.ts:242`)
  over two-file cycles that run in single-digit milliseconds, so no landed cell
  measures a shared-subtree ladder at any k.

## Non-goals

- The cycle-termination guard (`:2237`) and the per-branch visited set as
  CYCLE-DETECTION state. Termination is proven, bug 0271's cell (CYC1) hangs
  without the guard, and this report removes neither. A fix that weakens
  termination to buy cost is not an outcome.
- Every error class bug 0271's walk judges, and every registration decision it
  reaches. The verdicts measured here are correct; only their count is at issue.
- Bug 0271's four recorded withholds — an escaping entry
  (`./0275-escaping-tools-entry-below-immediate-callee-silent-at-caller.md`), a
  grandchild's declared prompt mode, a visited-set member, an entry the
  entry-grammar gate skipped. This report widens no admitted condition.
- The drive-time dispatch gate's absence of containment judgement (bug 0271's
  fix-record residual 3). The gate shares the cost profile and is cited at
  `:2615` for that reason; its containment disposition is out of scope.
- Bug 0268's path-separator spelling divergence, and the pre-existing
  `production-composition.ts` citation debt bug 0271's fix record residual 7
  names. Neither is touched.
- The parse cache's own scope. `invocation.md:20`'s parse-once bound holds at
  HEAD and needs no change.

## Fix

Bound the number of judgements per pass, not only the depth of any one branch.
Route not settled here; the constraints are.

1. Termination stays exactly as it is. The visited set remains per-branch and
   remains the cycle guard (`:2237`, `:2279`), and a visited-set hit remains
   withhold (c) rather than a manufactured refusal. Any diff that moves cell
   (CYC1) from green, or that makes it terminate for a reason other than the
   set, is the wrong diff.
2. Cost must be bounded in the number of DISTINCT resolved absolute paths the
   pass reaches, not in the number of simple paths. The bound is stated in the
   code and measured by a cell, not implied by the fixture set: a ladder at some
   k where HEAD is seconds must land within a small multiple of the depth-equal
   linear chain.
3. Two candidate routes, to be adjudicated in the fix:
   (a) a PER-PASS VERDICT MEMO keyed by resolved absolute path, held beside the
   pass parse cache and distinct from the visited set. Bug 0271's fix record
   calls a global memo semantics-changing, and that claim is correct as stated
   for an unconditional memo — the predicate has exactly one branch-dependent
   input, withhold (c) at `:2237`, so a verdict computed on a branch where the
   walk hit a visited ancestor may differ from the verdict for the same file
   reached from elsewhere. The claim does not extend to a verdict computed with
   no withhold-(c) hit anywhere beneath it: such a verdict is a function of the
   file's bytes and its acyclic subtree alone, hence path-independent, hence
   memoisable. The route is therefore a CYCLE-FREE verdict memo: propagate a
   "this subwalk consulted the visited set" taint out of the recursion, memoise
   only untainted verdicts, and read the memo only for a path not already on the
   current branch. On a diamond ladder no branch closes a cycle, every verdict
   is untainted, and the cost collapses to one judgement per distinct file. The
   fix states this argument in the code, or refutes it and takes (b).
   (b) an explicit BOUND ON THE WALK — a depth cap, a judgement-count cap, or
   both — with a stated disposition for input that exceeds it. A cap must not
   manufacture a refusal (that would fail legal input), so the disposition is a
   withhold, which reintroduces bug 0271's silence beyond the cap: the fix
   states what the author observes at the cap and why a silent withhold there is
   admissible when bug 0271 ruled one inadmissible at depth 2.
   Route (a) preserves every outcome; route (b) trades outcomes for a hard
   ceiling. The fix says which and why.
4. Outcome preservation is the acceptance criterion. Every verdict at every
   depth is unchanged from HEAD for every file set, including cyclic ones. The
   §Reproduction broken-leaf row is the shape to pin: the ladder's shared-subtree
   verdicts are identical along all paths at HEAD, and must stay identical.
5. No new diagnostic code and no new registry row. Nothing about this defect is
   diagnosable — the input is legal and the verdicts are right — so a fix that
   emits anything at the author is out of scope.
6. One predicate, both sites (bug 0271 §Fix constraint 5, unchanged). Whatever
   store is added is reachable from `parseCalleeForTools` (`:2027`) and from
   `parseCalleeTheta`'s dispatch gate (`:2615`), and the two must not diverge in
   cost profile or in verdict. The gate's `activeRoots` is `undefined`, which
   changes which entries are judged; a memo keyed by path alone must therefore
   be keyed or scoped so a gate-side verdict cannot be served to a load-side
   query or the reverse.
7. Same-commit spec edit. `invocation.md:20` and its `discovery-cli.md:270`
   mirror describe the per-branch set as the whole of the bound. Route (a) adds a
   second, per-pass bound the sentence does not mention; route (b) adds a cap
   with an observable disposition. Either lands in the same commit as the code,
   beside the existing parse-once sentence.
8. Locks. Bug 0271's ten-cell witness
   (`tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts`),
   including the (CYC1) hang fence and its 20 s ceiling (`:242`), and its live
   cell (`tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts`)
   stay green unchanged. Bug 0270's witness
   (`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`)
   and bug 0267's ten cells
   (`tests/callee-post-parse-errors-un-register-tools-caller.test.ts`) stay green
   unchanged. Bug 0248 cells (D3)/(D5) stay out of scope.
9. The cost cell measures a ratio, not a duration. A wall-clock ceiling in
   milliseconds pins machine speed; the discriminating assertion is a ladder at
   a k where HEAD is seconds against a control the fix cannot speed up
   (the depth-equal linear chain, or the same ladder at k − 3), so the cell reds
   on HEAD and passes on the fix without a hardware assumption.

## Provenance

Bug 0271's fix record (`.pi/tmp/fixes/0271-report.md`) residual 2, quoted whole:
"The visited set is per-branch, so a shared subtree is re-judged once per simple
path through the `tools:` graph. Termination is unaffected and proven; the cost
is not. A k-layer two-wide diamond ladder produces on the order of 2^k
predicate invocations, each re-running the readability probe, the containment
`realpath`, `checkThetaImports` and `resolveCallableSet` (the parse itself is
memoised by the pass cache). Polynomial for trees and narrow graphs; an
effective hang around k = 30. A depth cap or a cycle-free-verdict memo is the
remedy, and a global memo would change semantics, since a verdict is
branch-dependent where a cycle re-enters a branch-specific ancestor. Sweep
material." Recorded, not owned — the same residual appears as residual 2 of bug
[0271](./0271-prompt-grandchild-callee-drop-invisible-at-depth-two.md)'s
§Fix (0.270.0). Seventeenth set. Filed at HEAD `1e7e4321`, v0.270.0, from an
offline `composeExtensionInstance` probe over the ladders, controls and
broken-leaf row tabulated in §Reproduction.
