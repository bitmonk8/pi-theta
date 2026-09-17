---
id: PTQ-0732
title: typeenv-prototype-names.test.ts and union-arm-literal-const-lowering.test.ts each redefine diagLines(doc) though both already import parseDoc from tests/helpers/e2e-s1, which exports the identical function
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/typeenv-prototype-names.test.ts:22,300-302
  - tests/union-arm-literal-const-lowering.test.ts:20,259-261
  - tests/helpers/e2e-s1.ts:99-102
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# typeenv-prototype-names.test.ts and union-arm-literal-const-lowering.test.ts each redefine diagLines(doc) though both already import parseDoc from tests/helpers/e2e-s1, which exports the identical function

## Observation
Both files in this review's scope import `parseDoc` from `./helpers/e2e-s1` on
their own import line, and both then declare a module-private
`diagLines(doc: ThetaDocument): string[]` whose body is byte-identical to the
`diagLines` function `tests/helpers/e2e-s1.ts` already exports —
`doc.diagnostics.map((d) => \`${d.severity} ${d.code}: ${d.message}\`)`.
Neither file's import statement names `diagLines`, so each local declaration
shadows, rather than reuses, the export sitting in the same module the file
already draws from.

## Evidence
`tests/helpers/e2e-s1.ts:99-102` (the canonical, already-exported helper):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/typeenv-prototype-names.test.ts:22` (the import that reaches the same
module) and `:300-302` (the local shadow):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
/** The whole diagnostic list, order-preserving, as comparable strings. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/union-arm-literal-const-lowering.test.ts:20` (the same import) and
`:259-261` (the local shadow, byte-identical body):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

Search: `grep -n "^function diagLines\|^import.*e2e-s1" tests/typeenv-prototype-names.test.ts tests/union-arm-literal-const-lowering.test.ts` returns exactly one `import` line and one `function diagLines` declaration per file — 2 sites total in this review's scope, both re-read from the files immediately before filing.

## Why this is a problem
The signature is identical (`(doc: ThetaDocument): string[]`) and the map
expression is byte-for-byte identical to the exported helper both files
already reach into the same module for. This is the same duplication class
`quality/resolved/PTQ-0205-diagline-rendering-helper-duplication.md` fixed by
adding `diagLines`/`diagCodes` as exports to `tests/helpers/e2e-s1.ts` (that
finding's own evidence cites `tests/typeenv-prototype-names.test.ts:300` as
one of dozens of pre-fix instances) — the export now exists, but these two
files still carry their own copy of the function it replaced rather than
importing it, so the fix did not reach either site.

## Suggested direction (non-binding, optional)
Both files' own import line already names the module the canonical
`diagLines` lives in; adding the name to that same import and dropping the
local declaration is the route each file's own code already points at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: `diagLines` renders an already-produced diagnostic
  list for a positive comparison; it records no calls and backs no
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "diagLines" docs/bugs/` → no hits;
  neither file's local declaration is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "diagLines"
  docs/reference/coverage-matrix.md` → no hits. Both files are themselves
  witness files for open bugs (0038, 0184) cited by name in their own header
  comments, but this finding proposes no change to any `it()`/`describe()`
  name, count, red/green disposition, or assertion — only where the
  `diagLines` function body is defined — so no cited witness is affected.
- Confirmed the canonical export exists and matches byte-for-byte:
  `tests/helpers/e2e-s1.ts:99-102`, re-read immediately before filing.
- Confirmed this is not a coverage claim: both local functions are already
  exercised by every diagnostic assertion in their file; the observation is
  the duplicated definition site, not a missing test.
- Checked the already-filed candidate list for this wave for any finding
  citing either file by path: `grep -rl "typeenv-prototype-names\|union-arm-literal-const-lowering" quality/intake/*.md quality/resolved/*.md` before writing this file
  found only `quality/resolved/PTQ-0205-diagline-rendering-helper-duplication.md`
  (which cites `typeenv-prototype-names.test.ts:300` as one of many pre-fix
  instances of the general pattern, not as a filed finding against these two
  files specifically) — no duplicate.

## Triage
verdict: confirmed — independently re-verified: both local declarations (typeenv-prototype-names.test.ts:300-302, union-arm-literal-const-lowering.test.ts:259-261) are byte-identical in signature and body to the exported `diagLines` at tests/helpers/e2e-s1.ts:100-102, each file's sole e2e-s1 import (:22 / :20) names only `parseDoc`, the stated grep reproduces exactly (1 import + 1 declaration per file), and docs/bugs/, coverage-matrix and exemptions searches all return 0 hits; not a duplicate — PTQ-0205's fix commit 2594cd44 migrated only its 3 cited test files and touched neither of these (the 68-file count was pattern evidence, not cited sites), matching the repo's accepted residual-site convention (PTQ-0228, PTQ-0240, PTQ-0301, PTQ-0405), and no peer intake candidate in this wave cites either file (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
