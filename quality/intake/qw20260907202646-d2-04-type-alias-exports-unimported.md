---
id: pending
title: Three exported type aliases in the type seam — IndexReceiverKind, CompatRelation and TypeCheckRules — are referenced only inside their own declaring module; no file in src/, extensions/, tools/ or tests/ imports any of them
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/type-compat.ts:498
  - src/parser/type-compat.ts:759
  - src/parser/type-grammar.ts:213
sites: 3
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Three exported type aliases in the type seam — IndexReceiverKind, CompatRelation and TypeCheckRules — are referenced only inside their own declaring module; no file in src/, extensions/, tools/ or tests/ imports any of them

## Observation
`IndexReceiverKind` and `CompatRelation` are exported from
src/parser/type-compat.ts and `TypeCheckRules` from
src/parser/type-grammar.ts. Each is used exactly once or twice inside its own
file — as an annotation on a function's return type or parameter — and no
import statement anywhere in the repository names any of the three. Neither
module is re-exported: src/parser has no barrel file, and there is no
`export *` in src/, extensions/, tools/ or tests/. The `export` keyword on
each of the three declarations therefore reaches nothing.

## Evidence
src/parser/type-compat.ts:498 — `IndexReceiverKind`, exported:
```
export type IndexReceiverKind = "array" | "object" | "primitive" | "unknown";
```
Its only in-repository use is the return annotation of the function declared
immediately below it, src/parser/type-compat.ts:507-510:
```
export function classifyIndexReceiver(
  type: CompatType,
  env: TypeEnv,
): IndexReceiverKind {
```
The two production consumers of that function annotate nothing with the alias
— they compare the call result to a string literal:
src/runtime/expression-evaluator.ts:625 `if (classifyIndexReceiver(receiverType, env) !== "primitive") {`
and src/runtime/stdlib-object.ts:72 `if (classifyIndexReceiver(receiverType, env) !== "object") {`.

src/parser/type-compat.ts:759 — `CompatRelation`, exported:
```
export type CompatRelation = (sub: CompatType, sup: CompatType, env: TypeEnv) => Compatibility;
```
Its only in-repository use is the `relate` parameter of `commonType` in the
same file, src/parser/type-compat.ts:803-807:
```
export function commonType(
  branches: readonly CompatType[],
  env: TypeEnv,
  relate: CompatRelation,
): CompatType | undefined {
```
The one outside mention is prose, not a use —
src/parser/static-type-inference.ts:618:
```
   * injectable relation the way `commonType` does (`relate: CompatRelation`,
```

src/parser/type-grammar.ts:213 — `TypeCheckRules`, exported:
```
export type TypeCheckRules = "all" | "inline-object-shape";
```
Its only in-repository uses are two annotations in the same file:
src/parser/type-grammar.ts:228 (`rules: TypeCheckRules = "all",` in
`parseTypeExpression`) and :1488 (`rules: TypeCheckRules,` in `walkType`). The
one production caller that selects the non-default value passes a bare string
literal — src/parser/theta-document.ts:9688-9693:
```
          ...parseTypeExpression(
            e.returnSchema,
            "value",
            { file, range: e.range },
            "inline-object-shape",
          ),
```

## Why this is a problem
Dead export surface: an `export` that no importer reaches. Each alias is
module-internal in fact — the declaring file is the only file that names it —
so the `export` publishes a name into the module's interface that nothing
consumes and that a reader must nevertheless treat as part of the seam's
contract when reasoning about what depends on the type seam. Two of the three
aliases annotate a signature whose callers work with the raw string-literal
values instead (`"primitive"` / `"object"` at the two `classifyIndexReceiver`
call sites, `"inline-object-shape"` at the one non-default
`parseTypeExpression` call site), so the exported name is not even the
vocabulary the consuming code uses.

## Suggested direction (non-binding, optional)
Either drop the `export` on the three aliases, or have the consuming call
sites annotate against them; the fix stage owns the call.

## False-positive check
- Exhaustive identifier searches, run per name:
  `grep -rn "IndexReceiverKind" . --include=*` (excluding node_modules, .git)
  → src/parser/type-compat.ts:498 and :510, dist/src/parser/type-compat.d.ts
  (build output), and two files under .pi/tmp/fixes/ (scratch backups). No
  src/, extensions/, tools/ or tests/ hit outside the declaring file.
  `grep -rn "CompatRelation" .` → src/parser/type-compat.ts:759 and :806,
  src/parser/static-type-inference.ts:618 (a doc-comment mention, quoted
  above), dist/ build output, docs/bugs/0081 and 0158 (report prose), and
  .pi/tmp scratch. No import.
  `grep -rn "TypeCheckRules" --include=*.ts .` → src/parser/type-grammar.ts:96,
  :213, :222, :228, :1343, :1488 and three test COMMENTS
  (tests/inline-object-duplicate-field-name.test.ts:82 and :1169,
  tests/live/live-production-acceptance.test.ts:4545). No import statement.
- Import-statement check: every import of the two modules was listed
  (`grep -rn "from \"./type-compat\"\|from \"../parser/type-compat\"\|from \"../src/parser/type-compat\"\|type-grammar\"" --include=*.ts src extensions tools tests`)
  and each import list read; none names any of the three aliases.
- Re-export check: `grep -rn "export .*from .*type-compat\|export .*from .*type-grammar" --include=*.ts src extensions tools tests`
  → no hits. `grep -rn "^export \*" --include=*.ts src extensions tools tests`
  → no hits. `ls src/parser/` → no index.ts; `ls src/*.ts` → only
  runtime-root.ts; package.json declares no `main`/`exports` entry.
- Dynamic/string-keyed access: a type alias has no runtime representation, so
  no string-keyed or reflective access can reach it; the three names appear in
  no string literal in src/, extensions/, tools/ or tests/ (the only
  string-adjacent occurrences are the three test comments above).
- Tests-are-the-only-callers check: this is NOT that case — the three names
  have zero test imports, only prose mentions. `TypeCheckSite` (the sibling
  export at src/parser/type-grammar.ts:181) IS imported by three test files, so
  it is alive and is deliberately excluded from this finding.
- Deadness scope: only the `export` modifier is claimed unreachable, not the
  aliases themselves — each is used inside its declaring module, which is
  stated above with the exact lines.

## Triage
