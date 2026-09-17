---
id: PTQ-0674
title: query-annotation-nontype-text-refusal.test.ts locally redeclares diagLines and diagCodes though it already imports from the module that exports both
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/query-annotation-nontype-text-refusal.test.ts:267-282
  - tests/helpers/e2e-s1.ts:100-107
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# query-annotation-nontype-text-refusal.test.ts locally redeclares diagLines and diagCodes though it already imports from the module that exports both

## Observation
`tests/query-annotation-nontype-text-refusal.test.ts` imports `parseDoc` from
`./helpers/e2e-s1` (line 8) but not `diagLines`/`diagCodes`, and instead
declares its own module-private `diagLines(doc)` and `diagCodes(doc)`
functions whose bodies are byte-identical one-line projections of
`doc.diagnostics`. `tests/helpers/e2e-s1.ts` already exports functions of
exactly these two names, with the identical bodies, at lines 100 and 105.

## Evidence
`tests/query-annotation-nontype-text-refusal.test.ts:267-282` (re-read
immediately before filing):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * Every diagnostic rendered `<severity> <code>`, in emission order — the
 * REGISTRY-FREE half of a refusal expectation. Asserted BEFORE the rendered
 * message on every refusal cell so the red at HEAD names the symptom the bug
 * reports (an annotation that draws nothing at all) rather than the absent
 * registry row, which is a separate, separately-titled red.
 */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

`tests/helpers/e2e-s1.ts:100-107` (the canonical, already-exported pair, in
the same module this file already imports `parseDoc` from):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>`, in emission order. */
export function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

Import line: `tests/query-annotation-nontype-text-refusal.test.ts:8` —
`import { parseDoc } from "./helpers/e2e-s1";` names only `parseDoc`. Search:
`grep -n "^function diagLines\|^function diagCodes\|import.*helpers/e2e-s1" tests/query-annotation-nontype-text-refusal.test.ts`
→ exactly one local declaration of each and one `e2e-s1` import that omits
both.

## Why this is a problem
Both local bodies are byte-identical to the already-exported functions one
import away, in the very module this file already draws `parseDoc` from.
`tests/helpers/e2e-s1.ts`'s own purpose is to hold shared, reusable
`Diagnostic[]`/`ThetaDocument`-shaped rendering helpers so a test can assert
on diagnostics without re-deriving the plumbing; `diagLines`/`diagCodes` are
exactly that class of plumbing, restated here rather than imported.

## Suggested direction (non-binding, optional)
Adding `diagLines, diagCodes` to the existing `import { parseDoc } from
"./helpers/e2e-s1"` line and dropping the two local declarations would leave
one body of each to keep in sync.

## False-positive check
- Gate-pin carve-out: the file does not match `*gate*.test.ts` or the named
  gate kin; not applicable.
- Recording-double carve-out: `diagLines`/`diagCodes` map an
  already-produced, already-returned diagnostics array for a positive
  comparison; they record no call and back no "never called" witness.
- docs/bugs/ signature search: `grep -rl "diagLines\|diagCodes"
  docs/bugs/0203*` → no hits; the bug 0203 document states no rationale for
  keeping this render local rather than importing it.
- coverage-matrix/bug-doc citation search: `grep -n
  "query-annotation-nontype-text-refusal" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no change to any `it()`/`describe()` name,
  count, or assertion, only to where the two render functions are defined.
- Overlap check: PTQ-0205 (diagline-rendering-helper-duplication, resolved
  "fixed") established the general class and, as part of its fix, added
  `diagLines`/`diagCodes` to `tests/helpers/e2e-s1.ts` (confirmed present at
  lines 100/105 today) — but its own evidence list of "at least" 68/19 hit
  files, which named this file among them, was not itself the fix's
  migration list; this file's local pair was not touched by that fix and
  still shadows the now-existing canonical export. The pending
  `qw20260917154546-d7-118-02-diaglines-shadows-e2e-s1-import.md` covers the
  same "shadows-an-existing-import" shape in two different files
  (`params-inline-enum-position-refusal.test.ts`,
  `params-inline-object-lowering.test.ts`); neither of those files, nor any
  other pending/resolved candidate found by `grep -rl
  "query-annotation-nontype-text-refusal" quality/intake quality/issues
  quality/resolved`, cites this file for this pair.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; both local copies are exercised by every assertion in
  this file that calls them.

## Triage
verdict: confirmed — independently re-verified: tests/helpers/e2e-s1.ts:100-107 exports diagLines/diagCodes (same ThetaDocument type from src/parser/theta-document) and tests/query-annotation-nontype-text-refusal.test.ts:268/279 carries byte-identical live local copies (23 call sites) while its only e2e-s1 import (line 8) names parseDoc alone; D7 boilerplate duplication confined to tests/, no gate/recording-double carve-out, coverage-matrix 0 hits, docs/bugs/0203 pins the 67-cell file not the helper's definition site (0 hits for diagLines/diagCodes); not a duplicate — resolved PTQ-0205 named this file at :268 in its evidence but its fix commit 2594cd44 did not touch it (git show --name-only → 0), so this is an unmigrated residual of the PTQ-0228/PTQ-0240/PTQ-0301 kind, and sibling intake d7-118-02 cites two different files (triage: claude-fable-5-1)
