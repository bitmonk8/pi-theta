---
id: PTQ-1783
title: tools-entry-closed-grammar-lockstep.test.ts reimplements the e2e-s1 callable-set resolver fixture.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/tools-entry-closed-grammar-lockstep.test.ts:189-206
  - tests/tools-entry-closed-grammar-lockstep.test.ts:208-219
  - tests/helpers/e2e-s1.ts:1631-1633
  - tests/helpers/e2e-s1.ts:1640-1655
  - tests/helpers/e2e-s1.ts:1668-1676
sites: 2
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# tools-entry-closed-grammar-lockstep.test.ts reimplements the e2e-s1 callable-set resolver fixture.

## Observation
`tools-entry-closed-grammar-lockstep.test.ts` defines a `deps` double that resolves an explicit list of Pi tools and subagent theta paths, followed by a `resolveList` wrapper over `resolveCallableSet`. `tests/helpers/e2e-s1.ts` already exports the corresponding `callableSetDeps`, `thetaCallee`, and `resolveList` fixture facilities. The local double uses a set of paths with a fixed subagent mode, whereas the helper accepts a path-keyed table whose values supply that mode; the local implementation is a specialization of the existing fixture rather than a different observable. The count is two resolver-harness implementations: the local pair and the existing helper facilities.

## Evidence
Local double signature, `tests/tools-entry-closed-grammar-lockstep.test.ts:189-192`:
```ts
function deps(
  piTools: readonly string[],
  thetaPaths: readonly string[],
): CallableSetDeps {
```

Its body, `tests/tools-entry-closed-grammar-lockstep.test.ts:193-206`:
```ts
  const available = new Set(piTools);
  const callees = new Set(thetaPaths);
  return {
    resolvePiTool: (name) =>
      available.has(name)
        ? { kind: "pi-tool", toolDefinition: { name } as never }
        : undefined,
    resolveThetaCallee: (thetaPath) =>
      callees.has(thetaPath)
        ? { kind: "theta", mode: "subagent", calleePath: thetaPath }
        : undefined,
    reservedNames: new Set<string>(),
  };
}
```

Its wrapper, `tests/tools-entry-closed-grammar-lockstep.test.ts:208-219`:
```ts
function resolveList(
  items: readonly string[],
  piTools: readonly string[],
  thetaPaths: readonly string[] = [],
): CallableSetResult {
  const tools: ToolsField = { kind: "list", items };
  return resolveCallableSet({
    file: "test.theta",
    tools,
    deps: deps(piTools, thetaPaths),
  });
}
```

The helper's Pi-tool fixture, `tests/helpers/e2e-s1.ts:1631-1633`:
```ts
function piTool(name: string): ResolvedPiTool {
  return { kind: "pi-tool", toolDefinition: { name } };
}
```

The shared dependency factory, `tests/helpers/e2e-s1.ts:1640-1654`:
```ts
export function callableSetDeps(opts?: {
  piTools?: readonly string[];
  thetaCallees?: Readonly<Record<string, Omit<ResolvedThetaCallee, "calleePath">>>;
  reservedNames?: readonly string[];
}): CallableSetDeps {
  const piTools = new Set(opts?.piTools ?? []);
  const thetaCallees = opts?.thetaCallees ?? {};
  return {
    resolvePiTool: (name) => (piTools.has(name) ? piTool(name) : undefined),
    resolveThetaCallee: (thetaPath) => {
      const callee = thetaCallees[thetaPath];
      return callee === undefined ? undefined : { ...callee, calleePath: thetaPath };
    },
    reservedNames: new Set(opts?.reservedNames ?? []),
  };
```

The helper's theta fixture and list wrapper, `tests/helpers/e2e-s1.ts:1668-1676`:
```ts
export function thetaCallee(mode: "prompt" | "subagent"): Omit<ResolvedThetaCallee, "calleePath"> {
  return { kind: "theta", mode };
}

/** Resolve a YAML list-form `tools:` value. */
export function resolveList(items: readonly string[], d: CallableSetDeps): CallableSetResult {
  const tools: ToolsField = { kind: "list", items };
  return resolveCallableSet({ file: "test.theta", tools, deps: d });
}
```

All excerpts were re-read immediately before filing. The implementations are not byte-identical: the local API folds the dependency factory into its wrapper and represents theta availability as a set. Both implement the same fixture mechanics: explicit tool availability, explicit theta availability, theta path carriage, reserved-name defaults, and the list-form resolver invocation under `test.theta`.

## Why this is a problem
This is D7 copy-paste-fixture duplication, not an objection to the lockstep tests' source-shape or behavioural posture. The local fixture repeats the Pi-tool and theta resolved-entry object shapes and the `ToolsField`/`resolveCallableSet` invocation that the existing helper already centralizes. `tests/helpers/e2e-s1.ts` is the natural shared home as an observation: its existing exports carry precisely these fixture responsibilities, including the local double's subagent-mode case.

## False-positive check
- Gate-pin: group D1 deliberately scans shipped source, but this finding concerns only the resolver fixtures used by D2/D3, not its source scan, counts, inventory, or test composition.
- Recording-double: `deps` constructs lookup functions with no call recorder. No MUST-NOT witness is dismissed as vacuous.
- docs/bugs/ signature search: `rg -l 'tools-entry-closed-grammar-lockstep' docs/bugs/` returned eight documents (0069, 0105, 0106, 0107, 0110, 0112, 0253, README). Inspected 0107 and 0253's status/fix records: both are fixed; the former records the additive source-call and behavioural witnesses, and the latter records the default-name agreement. This report does not challenge those dispositions or classify a documented red as a skip.
- Coverage-matrix/bug-doc citation search: `rg -n 'tool-arg-shape-enforcement|tools-entry-closed-grammar-lockstep' docs/reference/coverage-matrix.md` returned no matches. Bug 0069 cites groups D1/D2/D3; bugs 0107 and 0253 pin named/grouped witnesses. No merge, rename, or deletion of any test is proposed; the claim is confined to the dependency double and wrapper.
- Prior-finding check: inspected quality-store matches for this file. PTQ-0998 concerns its parseDeps fixture, PTQ-0936 its source reader, and PTQ-1407 its checkpoint/root/context doubles. PTQ-0740's resolver-fixture inventory concerns callable-set, tools-derived-name-shape, uppercase-pi-tool-name-refusal, and session-control-callable-set, not this lockstep file. PTQ-1392 concerns registry reads in the different `tools-entry-grammar-derivations-lockstep.test.ts` file.
- History check: `git log -1 --format='%h %s' -- tests/tools-entry-closed-grammar-lockstep.test.ts` names `4a4d6f61`; its diff consolidates root/context doubles while leaving this resolver fixture in place. No claim about historical author intent is needed.
- Coverage boundary: only existing fixture definitions are judged. No missing test, additional assertion, behavioural change, or runtime-risk claim is part of this finding.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — Both fixture implementations reproduce at the cited lines; e2e-s1's callableSetDeps/thetaCallee/resolveList cover every live D2/D3 use of the local lookup double and list wrapper, duplicating resolved-entry shapes and resolver setup without a distinct observable; stated searches and history reproduce, no D7 carve-out applies, and prior resolved PTQs cover different fixtures or files rather than prescribing this local shape. (triage: claude-opus-5-5)
