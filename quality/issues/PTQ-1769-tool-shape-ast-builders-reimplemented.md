---
id: PTQ-1769
title: tool-arg-shape-enforcement.test.ts repeats four AST fixture builders exported by tool-call-dispatch-harness.ts.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/tool-arg-shape-enforcement.test.ts:291-297
  - tests/tool-arg-shape-enforcement.test.ts:303-305
  - tests/tool-arg-shape-enforcement.test.ts:311-313
  - tests/helpers/tool-call-dispatch-harness.ts:64-66
  - tests/helpers/tool-call-dispatch-harness.ts:78-80
  - tests/helpers/tool-call-dispatch-harness.ts:90-92
  - tests/helpers/tool-call-dispatch-harness.ts:114-116
sites: 8
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# tool-arg-shape-enforcement.test.ts repeats four AST fixture builders exported by tool-call-dispatch-harness.ts.

## Observation
The runtime witnesses in `tool-arg-shape-enforcement.test.ts` declare local string, identifier, call, and let AST fixture builders. `tests/helpers/tool-call-dispatch-harness.ts` exports counterparts with the same returned fields and function bodies. The string builder has a different name (`stringExpr` versus `strExpr`), and the let builder has a different return annotation (`LetStmt` versus `Stmt`); neither difference changes its object-literal construction. This inventory counts four duplicated builder pairs, or eight constructor definitions including their helper counterparts.

## Evidence
`tests/tool-arg-shape-enforcement.test.ts:291-297`:
```ts
function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}
```

`tests/tool-arg-shape-enforcement.test.ts:303-305`:
```ts
function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}
```

`tests/tool-arg-shape-enforcement.test.ts:311-313`:
```ts
function letStmt(name: string, init: Expr): LetStmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}
```

The four canonical counterparts, each re-read before filing:

`tests/helpers/tool-call-dispatch-harness.ts:64-66`:
```ts
export function strExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}
```

`tests/helpers/tool-call-dispatch-harness.ts:78-80`:
```ts
export function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}
```

`tests/helpers/tool-call-dispatch-harness.ts:90-92`:
```ts
export function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}
```

`tests/helpers/tool-call-dispatch-harness.ts:114-116`:
```ts
export function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}
```

## Why this is a problem
This is the D7 copy-paste-fixtures class: existing AST fixtures repeat construction already exported under `tests/helpers/`. Every returned field is restated locally, including the let node's `mutable: false` and `annotation: null`, rather than supplied by the shared fixture builders. The natural existing helper home is `tests/helpers/tool-call-dispatch-harness.ts`; this is an observation about present exports, not a proposed change to the witnesses or their assertions.

## False-positive check
- Gate-pin: the cited test is not a census/pin gate; the finding concerns constructor definitions, not expected counts or inventories.
- Recording-double: these constructors do not record calls and are not MUST-NOT witnesses. No negative dispatch assertion is being challenged.
- docs/bugs/ signature search: `rg -l 'tool-arg-shape-enforcement' docs/bugs/` returned seven documents (0003, 0016, 0106, 0131, 0142, 0146, 0150). Bug 0003's Fix records the shape enforcement and runtime-defect witnesses as fixed in 0.16.0. This filing does not attribute a red or a skip to those witnesses and does not challenge their documented contracts.
- Coverage-matrix/bug-doc citation search: `rg -n 'tool-arg-shape-enforcement|tools-entry-closed-grammar-lockstep' docs/reference/coverage-matrix.md` returned no matches. The bug-doc citations above include bug 0003's 18-cell witness pin and bug 0150's control-(ii) citation. No merge, rename, or deletion of any cited test is proposed.
- Prior-finding check: inspected the quality-store matches for `tool-arg-shape-enforcement`. PTQ-0719 covers parse dependencies/ranges/filtering, PTQ-0720 covers span/checkpoint/mutator, PTQ-0696 and PTQ-1407 cover producer/root/context scaffolding, and PTQ-1408 covers RecordingShapeHost. These four AST constructors are separate from those inventories. PTQ-1468 covers the same helper family in `pure-async-unification.test.ts`, not this file.
- History check: `git log -1 --format='%h %s' -- tests/tool-arg-shape-enforcement.test.ts` names `74e8a52b` (quality fixes); the report makes no inference about historical author intent.
- Coverage boundary: this finding inventories fixture code that exists. It requests no additional test, path, or behavioural assertion and makes no runtime-risk claim.

## Triage
verdict: confirmed — All four live local builders reproduce the helper exports field-for-field, including identical span values; the name/return-type differences introduce no cell-specific behavior. This is D7 copy-paste fixture duplication within tests/, with no applicable carve-out or prior finding prescribing these constructors (PTQ-0719/0720/0696/1407/1408/1468 cover distinct code). (triage: claude-opus-5-5)
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
