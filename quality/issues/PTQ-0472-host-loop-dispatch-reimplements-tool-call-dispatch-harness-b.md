---
id: PTQ-0472
title: host-loop-dispatch.test.ts redeclares tool-call-dispatch-harness's span()/objArg/callExpr/body AST builders inline instead of importing them
lens: D7
status: open
verdict: confirmed
locations:
  - tests/host-loop-dispatch.test.ts:118-132
  - tests/helpers/tool-call-dispatch-harness.ts:51-79
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# host-loop-dispatch.test.ts redeclares tool-call-dispatch-harness's span()/objArg/callExpr/body AST builders inline instead of importing them

## Observation
`tests/helpers/tool-call-dispatch-harness.ts` exports `span()`, `objArg()`, `callExpr()`, and `body()` as the canonical builders for a hand-built code-side Pi-tool-call AST (its own header states it centralises "the expression builders" that were previously duplicated across two test files, PTQ-0238). `tests/host-loop-dispatch.test.ts` does not import this module at all; instead, inside its `describe("PIC-64 rung 3 …")` block it declares a local `span()` function byte-for-byte identical to the exported one, and its `bodyCalling()` helper hand-assembles the same object-expr / call-expr / body shapes the harness's `objArg()` / `callExpr()` / `body()` already produce.

## Evidence
`tests/helpers/tool-call-dispatch-harness.ts:51-79`:
```ts
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
...
export function objArg(fields: Readonly<Record<string, Expr>>): ObjectExpr {
  return {
    kind: "object",
    typeName: null,
    fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
    range: span(),
  };
}

export function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

export function body(tail: Expr | null): ThetaBody {
  return { statements: [], tail };
}
```

`tests/host-loop-dispatch.test.ts:118-132`:
```ts
  function span(): SourceRange {
    return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
  }

  /** A body whose tail code-side-calls `callee({ op: "write" })`. */
  function bodyCalling(callee: string): ThetaBody {
    const arg: Expr = {
      kind: "object",
      typeName: null,
      fields: [{ name: "op", value: { kind: "string", value: "write", range: span() } }],
      range: span(),
    };
    const call: Expr = { kind: "call", callee, args: [arg], range: span() };
    return { statements: [], tail: call };
  }
```

`tests/host-loop-dispatch.test.ts:22-34` shows the file's complete import list — `vitest`, `../src/runtime/host-loop-dispatch`, `../src/extension/extension-tool-reachability`, and type-only imports from `../src/parser/theta-document` and `../src/diagnostics/diagnostic` — confirming `./helpers/tool-call-dispatch-harness` is never imported:
```ts
import { describe, expect, it } from "vitest";
import {
  dispatchViaHostLoop,
  EXTENSION_TOOL_UNREACHABLE_CODE,
  renderExtensionToolUnreachableMessage,
  resolveDispatchLadder,
  type EncodedToolRequest,
  type HostLoopDispatchDeps,
  type HostToolResult,
} from "../src/runtime/host-loop-dispatch";
import { checkExtensionToolReachability } from "../src/extension/extension-tool-reachability";
import type { Expr, ThetaBody } from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";
```

## Why this is a problem
`span()` at host-loop-dispatch.test.ts:118-120 is a verbatim copy of the exported `span()` at tool-call-dispatch-harness.ts:51-53 — same literal return value, same signature. `bodyCalling()`'s inline `{ kind: "object", typeName: null, fields: [...], range: span() }` and `{ kind: "call", callee, args: [arg], range: span() }` reproduce exactly what `objArg()` and `callExpr()` already build, and its `{ statements: [], tail: call }` reproduces `body()`. The harness module exists specifically so that files driving this AST shape do not re-derive it; this file re-derives it anyway.

## Suggested direction (non-binding, optional)
Importing `span`, `objArg`, `callExpr`, and `body` from `./helpers/tool-call-dispatch-harness` in place of the local `span()` and the hand-built literals in `bodyCalling()` is the natural helper home already established by PTQ-0238 for this exact AST shape.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-file patterns; not applicable.
- Recording-double check: `span()`/`objArg()`/`callExpr()`/`body()` are plain value builders, not recording/negative-witness doubles; the carve-out does not apply.
- docs/bugs/ signature search: `grep -r "span()" docs/bugs/` and a search for `host-loop-dispatch.test.ts` in docs/bugs/ returned no hits tying this duplication to a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn "host-loop-dispatch.test.ts" docs/reference/coverage-matrix.md docs/bugs/` returned no hits; the file is not cited by name in either, so no merge/rename/delete constraint applies. (The module header of host-loop-dispatch.test.ts does cite docs/bugs/0001-extension-tools-unreachable.md as the origin bug, but that citation is about the feature the test drives, not a pinned witness of this specific helper duplication.)
- Coverage drift check: this finding is about existing duplicated fixture code, not about any behaviour being untested; no coverage claim is made.

## Triage
verdict: confirmed — independently re-verified: span() at test:118-120 is byte-identical to the exported span() at harness:51-53 and bodyCalling() at 123-132 hand-assembles exactly the object-expr/call-expr/{statements:[],tail} shapes objArg()/callExpr()/body() (harness:64-79) build for the same code-side Pi-tool-call AST the harness header says PTQ-0238 centralised; the import list at 22-34 is complete with no harness import; file is not cited in coverage-matrix.md or docs/bugs (only production-host-loop-dispatch.test.ts is), not a gate file, builders are plain fixtures; not a dupe of PTQ-0238 (consolidated three other files, never cited this one) or PTQ-0278 (different harness/file) — note the rung-3 block predates the harness (b8d4fd2c 2026-07-25 vs 11820751 2026-09-12) so this is a copy the PTQ-0238 sweep left behind, and the anchor is the full builder composite, not the suite-wide bare span() idiom (~40 files) which alone would not qualify (triage: claude-fable-5-1)
