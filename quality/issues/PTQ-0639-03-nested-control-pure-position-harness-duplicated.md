---
id: PTQ-0639
title: nested-control-in-pure-position.test.ts's AST-builder-plus-producer harness is a byte-identical copy of production-core-exec.test.ts's, acknowledged as a mirror rather than a shared import
lens: D7
status: open
verdict: confirmed
locations:
  - tests/nested-control-in-pure-position.test.ts:1-197
  - tests/production-core-exec.test.ts:1-140
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# nested-control-in-pure-position.test.ts's AST-builder-plus-producer harness is a byte-identical copy of production-core-exec.test.ts's, acknowledged as a mirror rather than a shared import

## Observation
`tests/nested-control-in-pure-position.test.ts` declares its own `span`,
`callExpr`, `tryExpr`, `identExpr`, `memberExpr`, `indexExpr`, `numberExpr`,
`stringExpr`, `objectExpr`, `binaryExpr`, `letStmt`, `body`,
`NOOP_CHECKPOINT`, `rootDouble`, `ctxDouble`, `ProducerOpts`, `producer`,
`promptTheta`, and `runBody` — the same names, same signatures, and (for the
shared subset) the same bodies as `tests/production-core-exec.test.ts`. The
file's own header comment states it is "mirroring
tests/production-core-exec.test.ts", i.e. the duplication is a deliberate,
acknowledged re-typing rather than a shared import.

## Evidence
`tests/nested-control-in-pure-position.test.ts:40-56`:
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

function tryExpr(operand: Expr): Expr {
  return { kind: "try", operand, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}
```

`tests/production-core-exec.test.ts:38-54` (identical):
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

function tryExpr(operand: Expr): Expr {
  return { kind: "try", operand, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}
```

`tests/nested-control-in-pure-position.test.ts:144-173` (`NOOP_CHECKPOINT` through `producer`):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

interface ProducerOpts {
  readonly resolvePiTool?: (name: string) => PiToolDispatch | undefined;
}

function producer(opts: ProducerOpts) {
  return createProductionProducerDeps({
    pi: { sendMessage: () => {} } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(opts.resolvePiTool !== undefined ? { resolvePiTool: opts.resolvePiTool } : {}),
  });
}
```

`tests/production-core-exec.test.ts:86-116` (same `NOOP_CHECKPOINT`/`rootDouble`/`ctxDouble` bodies; `ProducerOpts`/`producer` differ only by production-core-exec.test.ts's additional `parseCallee` field, present in that file but absent here):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}
```

`tests/nested-control-in-pure-position.test.ts:14` (the acknowledgement):
```ts
// value (routed through the async executor `evalExpr`), NOT silently yield
// `null` with a `success` outcome. Drives the REAL production path
// (`createEffectfulStatementHost` + the real `runCodeSideToolCall`), mirroring
// tests/production-core-exec.test.ts.
```

Matched-name inventory (`grep -n "^function \|^interface ProducerOpts\|^const NOOP_CHECKPOINT" tests/nested-control-in-pure-position.test.ts tests/production-core-exec.test.ts`): `span`, `callExpr`, `tryExpr`, `identExpr`, `memberExpr`, `indexExpr`, `numberExpr`, `stringExpr`, `objectExpr`, `binaryExpr`, `letStmt`, `body`, `NOOP_CHECKPOINT`, `rootDouble`, `ctxDouble`, `ProducerOpts`, `producer`, `promptTheta`, `runBody` — 19 declarations, all present under the same name in both files.

## Why this is a problem
The two files declare the identical AST-node builders and the identical `RuntimeRoot`/`ExtensionCommandContext` doubles, `producer` factory, and `promptTheta`/`runBody` drivers, rather than one importing the other's module or both importing a shared `tests/helpers/` harness — and the duplicating file's own comment names its twin, showing the duplication was a conscious choice at authoring time rather than an accidental drift. A change to the shared `RuntimeRoot`/`ExtensionCommandContext` double shape, or to how `producer`/`runBody` thread options into `createProductionProducerDeps`, has two hand-synchronised copies to update, only one of which this repository's `tests/helpers/` directory currently centralises for the *other* variant of this same call surface (`tests/helpers/tool-call-dispatch-harness.ts`, which uses `hostLoopDispatch`/`dispatchLadderProbe` rather than this pair's `resolvePiTool`/`parseCallee` options).

## Suggested direction (non-binding, optional)
The natural home for the shared `span`/AST-node-builder set, the `NOOP_CHECKPOINT`/`rootDouble`/`ctxDouble` doubles, and the `producer`/`promptTheta`/`runBody` driver is a `tests/helpers/` module parameterised the same way `tests/helpers/tool-call-dispatch-harness.ts` already parameterises its own sibling call-surface harness — named as observation of where this pair's duplication would collapse, not as a prescribed edit.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or named kin; not applicable.
- Recording-double carve-out: `rootDouble`/`ctxDouble` are inert stand-ins, not negative-call-witness recording doubles asserting a MUST-NOT; not applicable.
- docs/bugs/ signature search: `grep -rn "bullet 2\|README known-gap" docs/bugs/` — the file documents a README known-gap regression, not a red test; both files are green harnesses, so no correct-reason-red claim is contradicted.
- coverage-matrix/bug-doc citation search: `grep -rn "nested-control-in-pure-position\|production-core-exec" docs/reference/coverage-matrix.md` found no citation by name that this finding would contradict; no merge/rename/delete of either test is proposed.
- Confirmed both cited files are under `tests/`; `src/extension/production-theta-producer.ts` etc. are only imported, not judged.

## Triage
verdict: confirmed — independently re-extracted and diffed all 19 named declarations across the two files: 17 are byte-identical (span through ctxDouble, promptTheta, runBody) and ProducerOpts/producer differ only by production-core-exec.test.ts's extra `parseCallee` field plus comments, exactly as the body states (the title's blanket "byte-identical" slightly overstates those two); the "mirroring tests/production-core-exec.test.ts" acknowledgement reproduces at line 33-34; the claim that tests/helpers/tool-call-dispatch-harness.ts is a distinct variant holds (its ProducerOpts takes hostLoopDispatch/dispatchLadderProbe/emitDiagnostic/subagentRootRegime, `body(tail)` only, AJV-backed rootDouble, `pi: {}`, runBody returns bare ThetaValue), so no existing helper is bypassed; both files 40/40 green, neither is a gate test, docs/bugs/0199+0293 name them as witnesses but no merge/rename/delete is proposed, coverage-matrix has no hits; not a duplicate — PTQ-0209/0238/0384/0397 consolidated disjoint file sets and the same-wave sibling d7-121-01 is a different pair (production-cancellation-wiring, AST-builder subset only), though a fixer should fold the two into one shared helper (triage: claude-fable-5-1)
