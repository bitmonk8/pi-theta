---
id: PTQ-1372
title: call-with-clause-harness.ts inlines the EMPTY_GRAPH literal in checkInvokeWithClause instead of using the constant extracted for checkBody
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/call-with-clause-harness.ts:296-320
  - tests/helpers/call-with-clause-harness.ts:322-346
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# call-with-clause-harness.ts inlines the EMPTY_GRAPH literal in checkInvokeWithClause instead of using the constant extracted for checkBody

## Observation
`tests/helpers/call-with-clause-harness.ts` defines `checkInvokeWithClause` (lines 298-320), which builds a `ThetaCompositionInput` and a `graph` value inline, then a few lines later defines a module-level `EMPTY_GRAPH` constant (line 327) and a sibling function `checkBody` (lines 334-352) that uses it. `EMPTY_GRAPH`'s literal is byte-identical to the `graph` value `checkInvokeWithClause` already spelled inline above it, but `checkInvokeWithClause` was never updated to reference the constant.

## Evidence
`tests/helpers/call-with-clause-harness.ts:298-320`:
```ts
export function checkInvokeWithClause(
  clause: FakeCallWithClause,
  resolveCalleeArity: (calleeAbsolutePath: string) => Promise<CalleeArity | undefined>,
): Promise<Diagnostic[]> {
  const input: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/thetadir/caller.theta",
    frontmatter: {} as unknown as ParsedFrontmatter,
    body: bodyWithInvoke("./callee.theta", clause),
  };
  return checkInvokeStaticResolution(input, {
    fs: new FakeFileSystem({
      homedir: "/home/u",
      cwd: "/theta",
      files: { [RESOLVED_CALLEE]: "theta", [RESOLVED_THETA_ROOT]: "" },
      dirs: { [RESOLVED_THETA_ROOT]: [] },
    }),
    activeRoots: [RESOLVED_THETA_ROOT],
    graph: { edges: new Map([["caller", []]]), unresolvable: new Set<string>() },
    resolveCalleeArity,
  });
}
```

`tests/helpers/call-with-clause-harness.ts:322-352`:
```ts
const EMPTY_GRAPH = { edges: new Map([["caller", []]]), unresolvable: new Set<string>() };

const noArityResolution = (): Promise<CalleeArity | undefined> => Promise.resolve(undefined);

/** Run the static call checks with inert resolution deps and return diagnostic codes. */
export async function checkBody(
  body: ThetaBody,
  callableSet: CallableSetSnapshot | undefined,
): Promise<string[]> {
  const input: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/thetadir/caller.theta",
    frontmatter: {} as unknown as ParsedFrontmatter,
    body,
  };
  const deps = {
    fs: new FakeFileSystem({ homedir: "/home/u", cwd: "/theta", files: {}, dirs: {} }),
    activeRoots: ["/theta"],
    graph: EMPTY_GRAPH,
    resolveCalleeArity: noArityResolution,
    ...(callableSet !== undefined ? { callableSet } : {}),
  };
  const diags = await checkInvokeStaticResolution(input, deps);
  return diags.map((d) => d.code);
}
```

Exact search: `grep -n "edges: new Map(\[\[\"caller\", \[\]\]\])" tests/helpers/call-with-clause-harness.ts` returns two hits — line 317 (inline, inside `checkInvokeWithClause`) and line 327 (the `EMPTY_GRAPH` definition). The `slashName: "caller"` / `sourcePath: "/thetadir/caller.theta"` / `frontmatter: {} as unknown as ParsedFrontmatter` triple is also repeated verbatim at lines 302-304 and 336-338 (a third near-identical copy sits in `driveCaller`'s `callerTheta` at lines 264-266, there with a non-empty `frontmatter`).

## Why this is a problem
The same file both spells the empty-graph literal by hand and, a few lines later, names that exact literal `EMPTY_GRAPH` for a sibling function to reuse — the extraction exists in the file but the earlier function was left on the hand-written copy. A change to the graph shape (e.g. adding a required field to the resolvability graph) has two literal sites to find and edit in one file instead of the one the constant was introduced to be the single site for.

## Suggested direction (non-binding, optional)
`checkInvokeWithClause`'s `graph:` field could reference `EMPTY_GRAPH` (hoisted above both functions) the same way `checkBody` already does, as an observation about where the single site already lives in this file.

## False-positive check
Gate-pin check: this file is a `tests/helpers/*.ts` support module, not a `*gate*.test.ts` census file — n/a. Recording-double check: neither function is a recording double witnessing a MUST-NOT-call — n/a. docs/bugs/ signature search: `grep -rln "call-with-clause-harness\|EMPTY_GRAPH" docs/bugs/` returns no hits. coverage-matrix/bug-doc citation search: `grep -n "checkInvokeWithClause\|checkBody\b" docs/reference/coverage-matrix.md` returns no hits, so no citation pins either function's current body shape; this finding proposes no rename or deletion of either function, only that the second literal reuse the first's already-extracted constant.

## Triage
verdict: confirmed — independently re-verified: both excerpts match verbatim at tests/helpers/call-with-clause-harness.ts:298-320 and :327-352, the exact grep for `edges: new Map([["caller", []]])` returns exactly the two cited hits (:317 inline, :327 EMPTY_GRAPH) and no other tests/ or src/ file declares EMPTY_GRAPH; both functions are live (checkInvokeWithClause imported by 3 test files, checkBody by 3), the file is a tests/helpers support module (no gate/recording-double/red-signature carve-out), docs/bugs and coverage-matrix greps → 0 hits; the class is D7 boilerplate duplication with a mechanical anchor (constant extracted for one sibling, the other left on the hand-written copy of the same literal); not a duplicate — PTQ-0557 and PTQ-0702 are resolved cross-file consolidations that produced this helper, and neither names the residual within-file inline copy; fix is a one-token hoist-and-reference (triage: claude-fable-5-1)
