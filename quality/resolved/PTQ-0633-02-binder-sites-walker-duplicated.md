---
id: PTQ-0633
title: loop-element-withhold-binding-scoped.test.ts redeclares plain-for-loop-variable-element-type.test.ts's at/render/binderSites AST-walking trio byte-for-byte
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/plain-for-loop-variable-element-type.test.ts:361-363
  - tests/plain-for-loop-variable-element-type.test.ts:366-373
  - tests/plain-for-loop-variable-element-type.test.ts:388-494
  - tests/loop-element-withhold-binding-scoped.test.ts:281-283
  - tests/loop-element-withhold-binding-scoped.test.ts:286-293
  - tests/loop-element-withhold-binding-scoped.test.ts:306-412
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# loop-element-withhold-binding-scoped.test.ts redeclares plain-for-loop-variable-element-type.test.ts's at/render/binderSites AST-walking trio byte-for-byte

## Observation
tests/loop-element-withhold-binding-scoped.test.ts declares its own `at`,
`render`, and `binderSites` functions (a `SourceRange`-to-string formatter, a
diagnostic-list JSON renderer, and a full `Stmt`/`Expr`/`Block` recursive
walker that records every loop-variable and `let` binder site in source
order). tests/plain-for-loop-variable-element-type.test.ts declares the same
three functions under the same names, over the same parameter and return
types, with the same case-by-case switch bodies. The file's own header
comment names plain-for-loop-variable-element-type.test.ts (bug 0126) and
params-declared-type-in-type-layer.test.ts (bug 0192) as "the two comparable
guard-chain witnesses over this same module," acknowledging the sibling
relationship without importing the shared walker from either.

## Evidence

`at` — tests/plain-for-loop-variable-element-type.test.ts:361-363:
```ts
function at(r: SourceRange): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}
```
tests/loop-element-withhold-binding-scoped.test.ts:281-283 (byte-identical):
```ts
function at(r: SourceRange): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}
```

`render` — tests/plain-for-loop-variable-element-type.test.ts:366-373:
```ts
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}: ${d.message}`;
    }),
  );
}
```
tests/loop-element-withhold-binding-scoped.test.ts:286-293 (byte-identical):
```ts
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}: ${d.message}`;
    }),
  );
}
```

`binderSites` — tests/plain-for-loop-variable-element-type.test.ts:388-494
(the opening `walkExpr` cases, identical to the excerpt below):
```ts
function binderSites(doc: ThetaDocument): string[] {
  const out: string[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "par-for":
        out.push(`par-for ${e.variable}@${at(e.iterand.range)}`);
        walkExpr(e.iterand);
        if (e.max !== null) walkExpr(e.max);
        walkBlock(e.body);
        return;
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
```
tests/loop-element-withhold-binding-scoped.test.ts:306-317 (byte-identical
opening):
```ts
function binderSites(doc: ThetaDocument): string[] {
  const out: string[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "par-for":
        out.push(`par-for ${e.variable}@${at(e.iterand.range)}`);
        walkExpr(e.iterand);
        if (e.max !== null) walkExpr(e.max);
        walkBlock(e.body);
        return;
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
```

Exact search: `awk '/^function binderSites/,/^}/' <file>` extracted from
both files (110 lines each) and diffed line-by-line: the only difference
across the entire 110-line function is the wording of the final
`throw new Error(...)` message (`"...rather than the \`for\` body under
test..."` in plain-for-loop-variable-element-type.test.ts vs "...rather
than the loop arms under test..." in loop-element-withhold-binding-scoped.test.ts) —
every `walkExpr`/`walkBlock`/`walkStmt` case, in the same order, with the
same recorded strings, is otherwise byte-identical (verified via `diff` of
the two extracted blocks). `awk '/^function at\(/,/^}/'` and
`awk '/^function render\(/,/^}/'` extracted from both files produce zero
`diff` output — both functions are fully byte-identical between the two
files.

## Why this is a problem
This is the "Boilerplate duplication" class: a 110-line recursive
`Stmt`/`Expr`/`Block` walker plus its two small support functions
(`at`, `render`) are declared twice under the same names with the same
bodies, rather than shared. The duplicating file's own header comment
identifies plain-for-loop-variable-element-type.test.ts as a sibling
("guard-chain witness … over this same module") it deliberately keeps
parity with, which is what produced the byte-for-byte recurrence rather than
an accidental coincidence. No module under tests/helpers/ hosts a
`Stmt`/`Expr`/`Block` binder-site walker of this shape (`ls tests/helpers/`
lists AST-adjacent helpers such as e2e-s1.ts, invoke-seam-scaffold.ts, and
call-with-clause-harness.ts, none of which exports a `binderSites`,
`render`, or `at` function).

## Suggested direction (non-binding, optional)
A shared module exporting the `at`/`render`/`binderSites` trio,
parameterised over the one line that differs (the harness-failure message
naming what the walk was checking for), is the natural home the two files'
own acknowledged sibling relationship already points at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: `binderSites` output backs a real precondition
  assertion in both files (`expect(binderSites(doc), ...).toEqual([...sites])`),
  not a negative-witness recording double; this finding does not dispute
  that assertion, only that the walker's definition is redeclared.
- docs/bugs/ signature search: `grep -rn "loop-element-withhold-binding-scoped\|plain-for-loop-variable-element-type" docs/bugs/` finds each file named only in its own subject bug doc (0194 and 0126 respectively); loop-element-withhold-binding-scoped.test.ts's own header explicitly discusses the sibling relationship but states no rationale requiring separate copies of the walker.
- coverage-matrix/bug-doc citation search: `grep -n "loop-element-withhold-binding-scoped\|plain-for-loop-variable-element-type" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()`, only that the walker could be imported rather than redeclared.
- Prior-finding search: no located file in quality/intake or quality/resolved
  cites `binderSites`, `plain-for-loop-variable-element-type.test.ts`, or
  `loop-element-withhold-binding-scoped.test.ts` for this walker
  duplication (`grep -rli "binderSites" quality/intake quality/resolved` →
  no hits before this filing).

## Triage
verdict: confirmed — independently re-verified: `at` (361-363 / 281-283) and `render` (366-373 / 286-293) extract with zero `diff`; `binderSites` (388-494 / 306-412, 110 lines each) differs only at line 105 (the `throw` message wording), exactly as claimed; both copies are live (3 and 2 call sites), no tests/helpers module exports any of the trio, neither file is gate-kin or cited by docs/reference/coverage-matrix.md, and bug docs 0126/0194 state no rationale for per-file walkers; the same-wave intake files touching these tests concern the registry-oracle read (different root cause), not a duplicate. Fixer note: `sites: 2` is an undercount — tests/let-arm-withhold-binding-scoped.test.ts:262-283/290-412 carries byte-identical `at`/`render` and a DIVERGED `binderSites` (adds `arg` recording under `call` plus `tool-call`/`invoke` statement arms), so a shared home must either accommodate that variant or leave it (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
