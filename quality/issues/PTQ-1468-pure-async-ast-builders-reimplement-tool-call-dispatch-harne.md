---
id: PTQ-1468
title: pure-async-unification.test.ts redeclares span/callExpr/identExpr/numberExpr/objectExpr byte-identical to tests/helpers/tool-call-dispatch-harness.ts, which the same file already imports from
lens: D7
status: open
verdict: confirmed
locations:
  - tests/pure-async-unification.test.ts:51-73
  - tests/helpers/tool-call-dispatch-harness.ts:56-58
  - tests/helpers/tool-call-dispatch-harness.ts:78-80
  - tests/helpers/tool-call-dispatch-harness.ts:90-92
  - tests/helpers/tool-call-dispatch-harness.ts:102-104
  - tests/helpers/tool-call-dispatch-harness.ts:110-112
sites: 5
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# pure-async-unification.test.ts redeclares span/callExpr/identExpr/numberExpr/objectExpr byte-identical to tests/helpers/tool-call-dispatch-harness.ts, which the same file already imports from

## Observation
`tests/pure-async-unification.test.ts` imports `recordingPiToolResolver` from
`./helpers/tool-call-dispatch-harness` at its very first line, but then
declares five local module-scope AST-node builders — `span`, `callExpr`,
`identExpr`, `numberExpr`, `objectExpr` — whose bodies are byte-identical to
the exported functions of the same names in that same helper module.

## Evidence

`tests/pure-async-unification.test.ts:51-73` (re-read immediately before
filing):
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}

function numberExpr(text: string): Expr {
  return { kind: "number", text, numericType: "integer", range: span() };
}

function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function objectExpr(typeName: string | null, fields: readonly ObjectFieldNode[]): Expr {
  return { kind: "object", typeName, fields, range: span() };
}
```

`tests/helpers/tool-call-dispatch-harness.ts:56-58,78-80,90-92,102-104,110-112`
(re-read immediately before filing):
```ts
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
...
export function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}
...
export function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}
...
export function numberExpr(text: string): Expr {
  return { kind: "number", text, numericType: "integer", range: span() };
}
...
export function objectExpr(typeName: string | null, fields: readonly ObjectFieldNode[]): Expr {
  return { kind: "object", typeName, fields, range: span() };
}
```

Five of the six locally-declared builders (`span`, `callExpr`, `identExpr`,
`numberExpr`, `objectExpr`) match their exported helper-module counterparts
field-for-field, name-for-name. The sixth, `stringExpr`, matches the helper's
`strExpr` body exactly but under a different export name (not counted as a
site above since the identifier differs).

## Why this is a problem
The importing file already has a live import statement reaching into
`tests/helpers/tool-call-dispatch-harness.ts` (line 1, for
`recordingPiToolResolver`), so the five duplicated builders are not an
independent-discovery coincidence — the helper module is already open in the
same import line and re-declared anyway. Five function bodies (10 lines
total once `stringExpr`'s near-identical twin is set aside) are retyped
verbatim rather than added to the same import list.

## Suggested direction (non-binding, optional)
The natural home for these five builders, as observation: the same
`tests/helpers/tool-call-dispatch-harness` import already present at line 1
of the file under review.

## False-positive check
- Gate-pin check: `pure-async-unification.test.ts` does not match
  `*gate*.test.ts` or any named gate/census pattern; not a pinned-count file.
- Recording-double check: none of the five builders are recording doubles or
  MUST-NOT witnesses; they are plain AST-node literal constructors.
- docs/bugs/ signature search: `grep -rl "pure-async-unification" docs/bugs/*.md`
  → 0 hits; this finding does not touch the file's documented V20e-T red
  status, which concerns the two `it()` bodies, not these builders.
- coverage-matrix/bug-doc citation search: `grep -n "pure-async-unification"
  docs/reference/coverage-matrix.md` → 0 hits. No merge, rename, or delete of
  any test is proposed here — only that the five builder declarations could
  import from the module already imported from.
- Prior-finding overlap check: `grep -rli "pure-async-unification"
  quality/resolved/*.md quality/issues/*.md` shows PTQ-1384 (a different
  root cause: `rootDouble()` vs `rootWith` from `fixture-dispatch-harness.ts`)
  and PTQ-1015 (`recordingPiToolResolver`'s `received` accessor) — neither
  cites these five AST-builder declarations or `tool-call-dispatch-harness.ts`
  as the canonical home for them.

## Triage
verdict: confirmed — re-verified independently: tests/pure-async-unification.test.ts:51-73 declares span/callExpr/identExpr/numberExpr/objectExpr byte-identical (name, signature, body) to the exports at tests/helpers/tool-call-dispatch-harness.ts:56-58/78-80/90-92/102-104/110-112, and line 1 of the test already imports recordingPiToolResolver from that very module; both locations in tests/, not a gate/census file, builders are plain value constructors not recording doubles, `grep -rl pure-async-unification docs/bugs/ docs/reference/coverage-matrix.md` → 0 hits (the V20e-T correct-reason red concerns the it() bodies, untouched here), no merge/rename/delete proposed; not a duplicate — PTQ-1384 (rootDouble→rootWith) and PTQ-1015 (received double) are distinct root causes, and resolved PTQ-0670 covered only the cancellation-wiring↔core-exec pair (its triage note flagged pure-async as an uncounted 6/8 sibling but no filing tracked it and the copies remain at HEAD); fix is a mechanical import swap (triage: claude-fable-5-1)
