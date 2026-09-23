---
id: PTQ-1408
title: tool-arg-shape-enforcement.test.ts's RecordingShapeHost duplicates statement-executor.test.ts's ClassifyingHost verbatim
lens: D7
status: open
verdict: confirmed
locations:
  - tests/tool-arg-shape-enforcement.test.ts:347-400
  - tests/statement-executor.test.ts:964-1000
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# tool-arg-shape-enforcement.test.ts's RecordingShapeHost duplicates statement-executor.test.ts's ClassifyingHost verbatim

## Observation
`tool-arg-shape-enforcement.test.ts` declares a class `RecordingShapeHost`
(lines 347-400) implementing `StatementEvalHost`, whose `checkpointFor`,
`classifyCall` and `runEffect` methods and `dispatched`/`argsSeen`/`#kinds`
fields are byte-identical to `ClassifyingHost` in `statement-executor.test.ts`
(lines 964-1000). The file's own doc comment on the class names the source it
was copied from: "the ClassifyingHost pattern from statement-executor.test.ts".
`ClassifyingHost` is a module-private class inside a `.test.ts` file, not
exported from any `tests/helpers/*.ts` module, so there is no import path for
either file to share the one implementation.

## Evidence

`tests/tool-arg-shape-enforcement.test.ts:341-400`:
```ts
/**
 * A recording `StatementEvalHost` double (the ClassifyingHost pattern from
 * statement-executor.test.ts): records each dispatched callee and the
 * `evaluatedToolArgs` its `runEffect` was handed, classifies callees by a
 * configured map (default `pi-tool`), and evaluates the bounded pure forms the
 * cells need (string / number / ident / object).
 */
class RecordingShapeHost implements StatementEvalHost {
  readonly dispatched: string[] = [];
  readonly argsSeen: (Record<string, ThetaValue> | undefined)[] = [];
  readonly #kinds: ReadonlyMap<string, "pi-tool" | "theta-callable">;

  constructor(kinds: ReadonlyMap<string, "pi-tool" | "theta-callable"> = new Map()) {
    this.#kinds = kinds;
  }
  ...
  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: SITE };
    }
    return null;
  }

  classifyCall(expr: CallExpr): "pi-tool" | "theta-callable" {
    return this.#kinds.get(expr.callee) ?? "pi-tool";
  }

  runEffect(
    expr: Expr,
    _env: LexicalEnvironment,
    evaluatedToolArgs?: Record<string, ThetaValue>,
  ): Promise<OperationResult> {
    if (expr.kind === "call") {
      this.dispatched.push(expr.callee);
      this.argsSeen.push(evaluatedToolArgs);
    }
    return Promise.resolve({ ok: true, value: null });
  }
}
```

`tests/statement-executor.test.ts:964-1000`:
```ts
class ClassifyingHost implements StatementEvalHost {
  readonly dispatched: string[] = [];
  readonly argsSeen: (Record<string, ThetaValue> | undefined)[] = [];
  readonly #kinds: ReadonlyMap<string, "pi-tool" | "theta-callable">;

  constructor(kinds: ReadonlyMap<string, "pi-tool" | "theta-callable">) {
    this.#kinds = kinds;
  }
  ...
  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: SITE };
    }
    return null;
  }

  classifyCall(expr: CallExpr): "pi-tool" | "theta-callable" {
    return this.#kinds.get(expr.callee) ?? "pi-tool";
  }

  runEffect(
    expr: Expr,
    _env: LexicalEnvironment,
    evaluatedToolArgs?: Record<string, ThetaValue>,
  ): Promise<OperationResult> {
    if (expr.kind === "call") {
      this.dispatched.push(expr.callee);
      this.argsSeen.push(evaluatedToolArgs);
    }
    return Promise.resolve(ok(null));
  }
}
```

`checkpointFor`, `classifyCall` and `runEffect` are line-for-line identical
between the two classes (the only difference in `runEffect`'s return is a
`ok(null)` helper call vs. an inlined `{ ok: true, value: null }` literal of
the same shape). The field declarations (`dispatched`, `argsSeen`, `#kinds`)
are identical too; only `evaluatePure` and the constructor's default
parameter differ, to cover the additional `ident`/`object` expression kinds
this file's cells need.

## Why this is a problem
Two files independently maintain the same `StatementEvalHost` recording
double, with the copying acknowledged in-line ("the ClassifyingHost pattern
from statement-executor.test.ts"), and neither is exported from
`tests/helpers/`. A change to the double's dispatch/classification contract
(e.g. adding a member `StatementEvalHost` requires) has to be made twice, and
nothing enforces that the two copies stay in lockstep once one of them
changes.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting the common
`dispatched`/`argsSeen`/`checkpointFor`/`classifyCall`/`runEffect` recording
double, parameterised (or subclassed) for the differing `evaluatePure`
coverage each caller needs, is the natural home this duplication points to.

## False-positive check
- Gate-pin check: neither file is `*gate*.test.ts` or a census/pin-count
  test; not applicable.
- Recording-double check: `RecordingShapeHost`/`ClassifyingHost` do record
  calls, but the finding is about the class BODY being re-implemented twice,
  not about the legitimacy of a MUST-NOT witness — the carve-out for
  negative witnesses does not shield duplicated implementation code.
- docs/bugs/ signature search: `grep -ril "ClassifyingHost\|RecordingShapeHost" docs/bugs/`
  returned no hits; this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search:
  `grep -n "RecordingShapeHost\|ClassifyingHost" docs/reference/coverage-matrix.md`
  returned no hits — neither class is pinned by name in the coverage matrix
  or a bug doc's witness list, so no rename/merge citation obligation
  applies (and this finding proposes no rename/merge in any case).
- Not a coverage claim: this finding is about two already-written
  implementations of the same double, not about a missing test.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — excerpts reproduce at the cited lines (RecordingShapeHost tests/tool-arg-shape-enforcement.test.ts:347-400, ClassifyingHost tests/statement-executor.test.ts:964-1000): the three field declarations and `checkpointFor`/`classifyCall`/`runEffect` bodies are line-for-line identical (only `ok(null)` vs the inlined `{ ok: true, value: null }` literal), the copying is self-declared in the doc comment at :341-342, and only `evaluatePure` (ident/object arms) and the ctor default diverge — the title's "verbatim" is slightly over-stated but the body scopes the claim correctly; both copies are live (constructed at statement-executor:1011,1037 and tool-arg-shape-enforcement:420,437,452,468); `grep -rln classifyCall tests/helpers` is empty so no shared export exists; neither name appears in docs/bugs/, docs/reference/coverage-matrix.md, or any quality/issues|resolved row (PTQ-0701 covers RecordingMutator, PTQ-0720 the seam-scaffold triple in the same file — distinct root causes); D7 copy-paste double in tests/, no carve-out applies (triage: claude-fable-5-1)
