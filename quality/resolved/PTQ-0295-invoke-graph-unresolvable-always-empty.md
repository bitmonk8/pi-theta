---
id: PTQ-0295
title: buildInvokeGraph always returns an empty `unresolvable` set, so the shared cycle walk's leaf-termination branch never fires for the load-side graph it builds
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/invoke-static-checks.ts:407-413
  - src/extension/invoke-static-checks.ts:430-433
  - src/extension/invoke-static-checks.ts:445-457
  - src/runtime/invoke-depth-cycle.ts:283-292
  - src/runtime/invoke-depth-cycle.ts:323-329
sites: 1
fix_scope: module
wave: qw20260913183958
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-13
---

# buildInvokeGraph always returns an empty `unresolvable` set, so the shared cycle walk's leaf-termination branch never fires for the load-side graph it builds

## Observation
`buildInvokeGraph` is the load-side builder of the `InvokeGraph` that
`checkInvokeStaticResolution` feeds to `detectInvocationCycle` for every
discovered theta (INV-4). Every graph it returns sets
`unresolvable: new Set<string>()` — an empty set constructed fresh on each
call, with no code path in the function that ever adds to it. `InvokeGraph`'s
own doc comment (in the runtime module that declares it and is the field's
sole reader) says `unresolvable` "names the nodes that produced
`theta/load/callee-has-errors`" and that `detectInvocationCycle` treats each
as a leaf. `buildInvokeGraph`'s own doc comment states a *different*
mechanism for the identically-named "leaf-termination rule": dropping the
edge to a callee that was never discovered. Given the function's stated
input ("the discovered, successfully-parsed thetas") and the fact that this
file's own `theta/load/callee-has-errors` push on the `invoke` surface fires
only when the realpath-based containment check rejects a callee (i.e. one
that was never discovered and so never became one of `inputs`), no node
`buildInvokeGraph` ever adds to `edges` can simultaneously be one that
produced that diagnostic — so the set it returns cannot gain a member from
this constructor.

## Evidence
src/extension/invoke-static-checks.ts:407-413 — the function's own doc names
edge-dropping, not `unresolvable`, as its leaf-termination mechanism:
```ts
 * Build the per-load-pass static-resolution invoke graph across the discovered,
 * successfully-parsed thetas (invocation.md §Static resolution / §Cycle
 * detection). Nodes are discovered slash names; an edge `A → B` exists when
 * `A.theta` has a literal `invoke("./B.theta")` resolving to a discovered theta
 * `B`. Edges to non-discovered callees are dropped — a cycle routed only through
 * undiscovered files is not detected until they are discovered (the spec's
 * leaf-termination rule).
```

src/extension/invoke-static-checks.ts:430-433 — the signature, over "the
discovered, successfully-parsed thetas" only:
```ts
export async function buildInvokeGraph(
  inputs: readonly ThetaCompositionInput[],
  fs: Pick<FileSystem, "realpath">,
): Promise<InvokeGraph> {
```

src/extension/invoke-static-checks.ts:445-457 — the whole edge-building loop
and the always-empty return; no `unresolvable`-shaped variable exists above
this line in the function:
```ts
  const edges = new Map<string, string[]>();
  for (const input of inputs) {
    if (input.sourcePath === undefined) continue;
    const targets: string[] = [];
    for (const invoke of collectInvokeExprs(input.body)) {
      if (invoke.path.length === 0 || !invoke.path.endsWith(".theta")) continue;
      const abs = await canonical(resolveCalleeAbsolute(input.sourcePath, invoke.path));
      const targetName = byPath.get(abs);
      if (targetName !== undefined) targets.push(targetName);
    }
    edges.set(input.slashName, targets);
  }
  return { edges, unresolvable: new Set<string>() };
}
```

src/runtime/invoke-depth-cycle.ts:283-292 — the field's contract, stated by
its own type:
```ts
/**
 * The per-load-pass static-resolution graph the cycle walk runs over
 * (invocation.md §Static resolution). `edges` maps each node (a file-path stem)
 * to the nodes reached from its literal `invoke("./x.theta")` paths and its
 * `.theta` `tools:` entries; `unresolvable` names the nodes that produced
 * `theta/load/callee-has-errors` — those are treated as LEAVES.
 */
export interface InvokeGraph {
  readonly edges: ReadonlyMap<string, readonly string[]>;
  readonly unresolvable: ReadonlySet<string>;
}
```

src/runtime/invoke-depth-cycle.ts:323-329 — the field's one read site, the
branch this finding says can never take the `true` arm for a
`buildInvokeGraph` graph:
```ts
    if (done.has(node)) {
      return undefined;
    }
    if (graph.unresolvable.has(node)) {
      // An unresolvable callee is a leaf: terminate this walk arm.
      done.add(node);
      return undefined;
    }
```

## Why this is a problem
`unresolvable` is a required field of a shared type, constructed by exactly
one production builder within this review's scope, and every value that
builder produces for it is the identical empty set — the "every call site
passes the same value" shape. The field is not unread (its sole consumer,
`detectInvocationCycle`, calls `.has(node)` on it for every node of every walk
this pass drives), but because the value is always empty, that call can never
answer `true` for a graph `buildInvokeGraph` built: the `if` body at
invoke-depth-cycle.ts:326-329 is live code with no live input, for this
producer. `buildInvokeGraph`'s own doc, unchanged since the field's
introduction, already documents the actual leaf-termination mechanism this
graph relies on (dropping the edge, not marking the node), without ever
saying why the shared field it also returns stays empty.

## Suggested direction (non-binding, optional)
Either have `buildInvokeGraph` state directly, next to its existing
leaf-termination paragraph, why its own `unresolvable` return is structurally
always empty, or stop threading the field through this constructor's return
value in favour of the edge-dropping mechanism it already documents and
relies on.

## False-positive check
- `grep -n "unresolvable:"` (construction syntax) across `src/`: 3 hits — the
  interface field declaration (invoke-depth-cycle.ts:291) and two production
  constructions, one of them `invoke-static-checks.ts:457` (this file, cited
  above); the sibling construction lives outside this review's three files
  and is not relied on for this finding.
- `grep -n "\.unresolvable"` across `src/`: exactly one read,
  invoke-depth-cycle.ts:326 (cited above); no other production or test file
  reads this field off a graph `buildInvokeGraph` returns.
- Checked `tests/invoke-depth-cycle.test.ts:290-334`: it hand-constructs
  `InvokeGraph` literals with a populated `unresolvable` set to test
  `detectInvocationCycle`'s own contract directly — a legitimate witness of
  the TYPE's behaviour, not evidence that `buildInvokeGraph` itself ever
  produces a populated set.
- Checked `tests/b0362-case-variant-invoke-cycle-edge.test.ts:191-204`, which
  drives `buildInvokeGraph` itself through a scenario its own comment
  describes as "`<R>/X2/a.theta` is byte-unresolvable, so the realpath probe
  rejects: the containment check maps it to a WARNING-severity
  `callee-has-errors` and the edge never forms" — the test's own assertion is
  `expect(row.edges, "the unresolvable variant edge never forms").toContainEqual(["b", []])`,
  never a check on `row.unresolvable`. This is the production behaviour this
  finding describes, confirmed by the one test that exercises exactly this
  condition through `buildInvokeGraph`.
- Checked the precondition chain: `production-composition.ts` builds
  `buildInvokeGraph`'s sole argument, `parsedInputs`, by pushing only
  `parsed.fixture` when `parseDiscoveredTheta` did NOT report `"dropped" in
  parsed`; `checkInvokeStaticResolution`'s own `checkCalleeHasErrors` push
  for `surface: "invoke"` (this file) fires only when
  `checkInvokePathAtLoad`'s realpath-backed containment check rejects — a
  callee that was never discovered and therefore never one of `inputs`. So no
  discovered node this function processes can also be one that raised
  `theta/load/callee-has-errors`.
- Not test-only-reachable: the write site is production code
  (`production-composition.ts:1049` calls `buildInvokeGraph` on every compose
  pass); this finding is about the constant value written, not about the
  function's reachability.
- Not a duplicate: `grep -rl "unresolvable" quality/resolved quality/issues`
  hits files about `.thetalib` path resolution, type-compat consumer rosters,
  and unrelated staleness reports; none discuss `InvokeGraph.unresolvable` or
  `buildInvokeGraph`'s construction.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every citation reproduces verbatim; buildInvokeGraph (invoke-static-checks.ts:445-457) has never populated `unresolvable` since its original commit (2626d39d), its one production caller (production-composition.ts:1049/1149) threads that graph unmodified into detectInvocationCycle, and every node/child the walk visits is drawn from the same parsedInputs set buildInvokeGraph builds edges from (confirmed via checkInvokePathAtLoad/checkCalleeHasErrors tracing), so invoke-depth-cycle.ts:326-329's true arm is provably unreachable for this producer — a mechanically anchored D2 vestige, not a duplicate of any tracked issue (triage: claude-opus-5)
