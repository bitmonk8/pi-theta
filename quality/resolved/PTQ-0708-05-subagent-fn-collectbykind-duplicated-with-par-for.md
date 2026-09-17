---
id: PTQ-0708
title: subagent-fn.test.ts's KindedNode/collectByKind AST walker is byte-identical to par-for.test.ts's, with no tests/helpers/ home
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-fn.test.ts:194-227
  - tests/par-for.test.ts:127-164
sites: 2
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-fn.test.ts's KindedNode/collectByKind AST walker is byte-identical to par-for.test.ts's, with no tests/helpers/ home

## Observation
`tests/subagent-fn.test.ts` and `tests/par-for.test.ts` each declare, module scope, an identical `KindedNode` interface and an identical `collectByKind(root, kind)` deep-walk function (a `Set`-guarded recursive visit over own-enumerable properties and array elements, collecting every object whose `kind` field matches). The function body is character-for-character identical between the two files (`subagent-fn.test.ts` drops one JSDoc-comment line `par-for.test.ts` carries); no `tests/helpers/` module exports either the interface or the function.

## Evidence

`tests/subagent-fn.test.ts:194-227`:
```ts
interface KindedNode {
  readonly kind: string;
  readonly [key: string]: unknown;
}

/** Collect every AST object of the given `kind` anywhere under `root`. */
function collectByKind(root: unknown, kind: string): KindedNode[] {
  const out: KindedNode[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.kind === "string" && obj.kind === kind) {
      out.push(obj as KindedNode);
    }
    for (const key of Object.keys(obj)) {
      visit(obj[key]);
    }
  };
  visit(root);
  return out;
}
```

`tests/par-for.test.ts:127-164` — the same interface, and the same function body (differing only in the doc comment's extra explanatory lines):
```ts
interface KindedNode {
  readonly kind: string;
  readonly [key: string]: unknown;
}

/**
 * Collect every AST object of the given `kind` anywhere under `root` (a deep
 * own-enumerable-property walk). Used to locate the assumed `par-for` node
 * regardless of where it sits (let-RHS, expression statement, tail, nested).
 */
function collectByKind(root: unknown, kind: string): KindedNode[] {
  const out: KindedNode[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.kind === "string" && obj.kind === kind) {
      out.push(obj as KindedNode);
    }
    for (const key of Object.keys(obj)) {
      visit(obj[key]);
    }
  };
  visit(root);
  return out;
}
```

Exact search: `grep -rln "function collectByKind" tests/*.test.ts` → exactly 2 files (`tests/par-for.test.ts`, `tests/subagent-fn.test.ts`); `grep -rln "interface KindedNode" tests/*.test.ts` → the same 2 files. `grep -rn "collectByKind\|KindedNode" tests/helpers/*.ts` → 0 hits — no `tests/helpers/` module hosts either declaration.

## Why this is a problem
Both files independently declare the identical general-purpose "find every AST node of kind K anywhere under this root" walker rather than sharing one declaration — a generic, domain-agnostic utility (it reads only `.kind` and recurses through own-enumerable properties/array elements) duplicated in full between the two files that use it.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting `KindedNode` and `collectByKind` is the natural home the two files' byte-identical declarations point toward, alongside the project's existing generic AST-walking exports under `tests/helpers/` (e.g. `ts-files.ts`, `discovery-scratch-harness.ts`).

## False-positive check
- Gate-pin check: neither `tests/subagent-fn.test.ts` nor `tests/par-for.test.ts` matches `*gate*.test.ts` or a named kin; not applicable.
- Recording-double check: `collectByKind` is a pure read-only AST search helper, not a recording double backing a "never called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "subagent-fn.test.ts" docs/bugs/*.md` cites other line ranges in this file (`:1581-1614`, `:308-323`, `:404-421`) for unrelated fixture shapes; none cites lines 194-227 or names `collectByKind`/`KindedNode` as a witness artefact.
- coverage-matrix citation search: `grep -n "subagent-fn.test.ts\|par-for.test.ts" docs/reference/coverage-matrix.md` → 0 hits for either file.
- Coverage drift check: this finding does not claim a missing test or an untested path; it identifies a duplicated AST-walk helper, leaving both files' tests and assertions untouched.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: `interface KindedNode` + `function collectByKind` reproduce verbatim at tests/subagent-fn.test.ts:194-227 and tests/par-for.test.ts:127-164, and a comment-stripped diff of the two ranges is empty (only the JSDoc differs); `grep -rln` for either identifier across tests/ hits exactly those 2 files, 0 hits in tests/helpers/, src/, extensions/, tools/, and both copies are live (par-for.test.ts:168,212,227,1831; subagent-fn.test.ts:231 call it) — a D7 boilerplate-duplication class in tests/ only; neither file is a *gate* kin, the helper is a read-only search not a recording double, docs/reference/coverage-matrix.md has 0 hits for either file and no docs/bugs/ doc cites these line ranges; no existing PTQ names collectByKind/KindedNode (PTQ-0257/0394's e2e-s1 letStmtOf/fnDecl are top-level-statement finders, PTQ-0265/0287/0288 are different walkers), so not a duplicate (triage: claude-fable-5-1)
