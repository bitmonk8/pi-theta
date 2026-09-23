---
id: PTQ-1354
title: inline-object-stranded-entry-refusal.test.ts still declares a local diagLines instead of importing the canonical e2e-s1 export its two in-scope siblings already use
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-stranded-entry-refusal.test.ts:9,239-242
  - tests/helpers/e2e-s1.ts:436-439
  - tests/inline-object-stray-close-token-split.test.ts:6,283
  - tests/inline-object-type-source-capture.test.ts:19,320
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# inline-object-stranded-entry-refusal.test.ts still declares a local diagLines instead of importing the canonical e2e-s1 export its two in-scope siblings already use

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(source: ThetaDocument |
readonly Diagnostic[])`, a rendering helper that maps a document's
diagnostics to `` `${severity} ${code}: ${message}` `` strings. Both of the
other two files reviewed in this same wave/shard —
`tests/inline-object-stray-close-token-split.test.ts` and
`tests/inline-object-type-source-capture.test.ts` — import that exact
function by name from `./helpers/e2e-s1` and call it directly.
`tests/inline-object-stranded-entry-refusal.test.ts` imports several other
names from the same module (`parseDoc`, `expectGroup as expectGroupShared`,
`DiagnosticCell`, `subagentTheta as theta`, `subagentParamsSrc`,
`loweredParams`) but declares its own module-private `diagLines` function
instead of adding `diagLines` to that same import line.

## Evidence
`tests/inline-object-stranded-entry-refusal.test.ts:9` (the e2e-s1 import
line; `diagLines` is not among the names pulled in):
```ts
import { expectGroup as expectGroupShared, type DiagnosticCell, parseDoc, subagentTheta as theta, subagentParamsSrc, loweredParams } from "./helpers/e2e-s1";
```

`tests/inline-object-stranded-entry-refusal.test.ts:239-242` (the local
reimplementation):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/helpers/e2e-s1.ts:436-439` (the canonical, already-exported helper,
producing the identical string for a `ThetaDocument` input):
```ts
export function diagLines(source: ThetaDocument | readonly Diagnostic[]): string[] {
  const diags = "diagnostics" in source ? source.diagnostics : source;
  return diags.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/inline-object-stray-close-token-split.test.ts:6,283` (the sibling in
this same scope, importing and calling the canonical helper directly):
```ts
import { expectGroup as expectGroupShared, type DiagnosticCell, envelope, parseDoc, diagLines, subagentTheta as theta, loweredParams } from "./helpers/e2e-s1";
...
  return diagLines(parseDoc(src));
```

`tests/inline-object-type-source-capture.test.ts:19,320` (the other sibling
in this same scope, same pattern):
```ts
  diagLines,
...
  return diagLines(parseDoc(src, path));
```

Exact search: `grep -n "^function diagLines" tests/inline-object-stranded-entry-refusal.test.ts` → 1 hit (line 240), the sole in-scope declaration site of this root cause.

## Why this is a problem
The local function's body (`doc.diagnostics.map((d: Diagnostic) =>
\`${d.severity} ${d.code}: ${d.message}\`)`) produces byte-identical output to
the canonical export for the `ThetaDocument` input this file always passes —
the canonical export's `"diagnostics" in source ? source.diagnostics :
source` branch resolves to `source.diagnostics` for exactly that shape, after
which both bodies are the same one-line map. The two other files in this
identical review scope already import and call the canonical name instead of
redeclaring it, so the local copy is not an independent design choice but a
residual: the file already imports six other names from the same module on
the same line and could add a seventh.

## Suggested direction (non-binding, optional)
The local `diagLines` declaration could be dropped and `diagLines` added to
the existing `./helpers/e2e-s1` import list, mirroring the two sibling files
in this same scope.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` and matches none of the
  named gate kin; the cited lines are a rendering helper, not a pinned count
  or inventory assertion.
- Recording-double check: `diagLines` maps an already-produced array; it
  records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "diagLines" docs/bugs/0256-generic-argument-stranded-entry-registers-permissive.md` → 0 hits; no documented correct-reason red cites this local declaration.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-stranded-entry-refusal" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of the file or any `it()`/`describe()` block, and no change to any assertion's expected value — only the definition site of one internal helper function — so no pinned-test citation is affected.
- Prior resolution check: `quality/resolved/PTQ-0205-diagline-rendering-helper-duplication.md` (status: fixed) already named this exact file (`inline-object-stranded-entry-refusal.test.ts:285`, pre-fix line numbering) among ~68 sites sharing this root cause and added the canonical `e2e-s1.ts` export as the fix, but the fix did not migrate every one of the 68 sites — this file's own copy is confirmed still present at current HEAD (line 240), and the two in-scope siblings reviewed in this same wave show the post-fix, migrated shape directly, which is what makes the residual visible without a repo-wide re-search: `grep -rl "inline-object-stranded-entry-refusal" quality/issues quality/intake` → no filing names this specific not-migrated residual.
- Coverage check: the claim is about a repeated function definition, not a missing test path; every diagnostic-list cell in the file is exercised by the file's own currently-passing/documented-red assertions untouched by this finding.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — reproduces at HEAD: `function diagLines(doc: ThetaDocument)` at tests/inline-object-stranded-entry-refusal.test.ts:240 (sole declaration, one caller at :245 passing `parseDoc(...)`) is body-identical for that input to the exported `diagLines` at tests/helpers/e2e-s1.ts:436-439, the import line at :9 already pulls six other names from `./helpers/e2e-s1` without it, and both in-scope siblings (stray-close-token-split.test.ts:6/283, type-source-capture.test.ts:19/320) import the canonical export; PTQ-0205 (status: fixed) named this file among its sites but the copy was never migrated, no open `diaglines-*` row names this file, docs/bugs/0256 cites the file only as a witness (no test rename/merge/delete proposed), so this is an in-scope D7 boilerplate-duplication residual with a mechanical fix (triage: claude-fable-5-1)
