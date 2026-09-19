---
id: PTQ-0698
title: session-control-callable-set.test.ts's deps()/resolveScalar() are a byte-for-byte, self-declared mirror of tests/callable-set.test.ts's, not imported
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/session-control-callable-set.test.ts:103-124
  - tests/callable-set.test.ts:54-76
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# session-control-callable-set.test.ts's deps()/resolveScalar() are a byte-for-byte, self-declared mirror of tests/callable-set.test.ts's, not imported

## Observation
`tests/session-control-callable-set.test.ts` declares its own `deps(opts?)`
and `resolveScalar(text, d)` helpers for driving `resolveCallableSet`. Its
own file header states this is deliberate: "Method: mirrors
`tests/callable-set.test.ts`'s unit-level `deps()` / `resolveScalar` /
`resolveList` harness for the §3.4 unit-level cells". `tests/callable-set.test.ts`
declares a `deps(opts?)` with the identical parameter shape
(`piTools?`/`thetaCallees?`/`reservedNames?`) and body, and a `resolveScalar`
whose body is byte-identical. Neither file imports these from
`tests/helpers/`.

## Evidence
tests/session-control-callable-set.test.ts:103-124 (re-read immediately
before filing):
```ts
function deps(opts?: {
  piTools?: readonly string[];
  thetaCallees?: Readonly<Record<string, Omit<ResolvedThetaCallee, "calleePath">>>;
  reservedNames?: readonly string[];
}): CallableSetDeps {
  const piTools = new Set(opts?.piTools ?? []);
  const thetaCallees = opts?.thetaCallees ?? {};
  return {
    resolvePiTool: (name) =>
      piTools.has(name) ? { kind: "pi-tool", toolDefinition: { name } } : undefined,
    resolveThetaCallee: (thetaPath) => {
      const callee = thetaCallees[thetaPath];
      return callee === undefined ? undefined : { ...callee, calleePath: thetaPath };
    },
    reservedNames: new Set(opts?.reservedNames ?? []),
  };
}

function resolveScalar(text: string, d: CallableSetDeps): CallableSetResult {
  const tools: ToolsField = { kind: "scalar", text };
  return resolveCallableSet({ file: "test.theta", tools, deps: d });
}
```

tests/callable-set.test.ts:54-76 (the same parameter shape and body; the
only difference is a `piTool(name)` helper-call indirection in place of the
inline object literal):
```ts
function deps(opts?: {
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
}

/** Resolve a comma-separated short-form `tools:` value. */
function resolveScalar(text: string, d: CallableSetDeps): CallableSetResult {
  const tools: ToolsField = { kind: "scalar", text };
  return resolveCallableSet({ file: "test.theta", tools, deps: d });
}
```

Exact search: `grep -n "^function deps(\|^function resolveScalar(" tests/callable-set.test.ts tests/session-control-callable-set.test.ts` returns exactly one hit per function per file, matching the two locations cited above.

## Why this is a problem
Both files build the identical `CallableSetDeps` fixture (a `resolvePiTool`
keyed off a `Set` of pi-tool names, a `resolveThetaCallee` keyed off a
callee-path record, and a `reservedNames` set) and the identical
`resolveScalar` wrapper over `resolveCallableSet`, and the newer file's own
comment names the exact older file the shape was copied from rather than
imported. A change to what `CallableSetDeps.resolvePiTool` returns for a
matched name (e.g. adding a required field to the `toolDefinition` shape)
must be hand-applied in both files.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently exports this `deps`/`resolveScalar`
pair; the credited "mirrors `tests/callable-set.test.ts`" comment already
names the file such a shared export would be lifted from.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: `deps()` returns plain resolver functions with no
  call-count tracking and backs no MUST-NOT witness in either file; not
  applicable.
- docs/bugs/ signature search: `grep -rln "resolveScalar\|CallableSetDeps" docs/bugs/*.md` returns no hits tying this shared shape to a documented correct-reason red; `tests/session-control-callable-set.test.ts` is itself an RFC 0011 RED-by-design suite for the `resolveCallableSet`/`resolveEntry` seam, but the RED signature it states concerns the runtime-tool arm's absence, never this setup harness, and `tests/callable-set.test.ts` passes at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "session-control-callable-set\.test\|tests/callable-set\.test" docs/reference/coverage-matrix.md` returns no hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` inside them.
- Coverage check: this finding is about a repeated helper-pair DEFINITION that exists in both files today, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (session-control-callable-set.test.ts:103-124, callable-set.test.ts:54-76); resolveScalar is byte-identical and deps() differs only by the inline `{ kind: "pi-tool", toolDefinition: { name } }` vs `piTool(name)` line the body already concedes; neither file imports the pair, no tests/helpers/ module exports it, coverage-matrix grep returns no hits, neither is a gate/recording-double/correct-reason red (both pass at HEAD, 40/40); one stated search is inaccurate — the docs/bugs grep does return 3 files (0072/0107/0270), but all are fixed bugs naming the CallableSetDeps type, not this harness, so the conclusion stands; sites undercounts the family: the same deps(opts?) body is byte-identical in tests/tools-derived-name-shape.test.ts:504-520 and tests/uppercase-pi-tool-name-refusal.test.ts:517-533, which pending sibling intake qw20260917154546-d7-163-02 cites without session-control — fold the two at acceptance (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
