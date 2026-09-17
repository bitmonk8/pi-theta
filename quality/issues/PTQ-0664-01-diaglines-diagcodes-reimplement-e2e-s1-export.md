---
id: PTQ-0664
title: diagLines (and diagCodes) redeclared locally in two files though tests/helpers/e2e-s1.ts already exports both under the same signature
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-literal-sublanguage-lowering.test.ts:312-314
  - tests/params-scalar-nontype-text-refusal.test.ts:285-293
  - tests/helpers/e2e-s1.ts:99-107
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# diagLines (and diagCodes) redeclared locally in two files though tests/helpers/e2e-s1.ts already exports both under the same signature

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`
and `diagCodes(doc: ThetaDocument): string[]`, both taking the same
`ThetaDocument` parameter shape used everywhere in this review's scope. Both
files in scope already import `parseDoc` from that exact module
(`"./helpers/e2e-s1"`) but each also declares its own module-local function
named `diagLines` — byte-identical in body to the exported one — and
`params-scalar-nontype-text-refusal.test.ts` additionally declares its own
`diagCodes`, also byte-identical to the exported one.

## Evidence
`tests/helpers/e2e-s1.ts:99-107` (the canonical, already-exported pair):
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

`tests/params-literal-sublanguage-lowering.test.ts:308-314` (imports `parseDoc`
from the same module at line 12, then redeclares `diagLines` locally):
```ts
function yamlQuoted(typeSource: string): string {
  return `'${typeSource.replace(/'/g, "''")}'`;
}

function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/params-scalar-nontype-text-refusal.test.ts:285-293` (imports `parseDoc`
from the same module at line 10, then redeclares both `diagLines` and
`diagCodes` locally):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

## Why this is a problem
Both local `diagLines` bodies are byte-for-byte identical to
`e2e-s1.ts`'s exported one (same parameter type, same map expression, same
template string), and `params-scalar-nontype-text-refusal.test.ts`'s local
`diagCodes` is likewise byte-identical to the exported one. Neither file's
import statement for `"./helpers/e2e-s1"` needed to change shape to reach the
canonical versions — both already import `parseDoc` from that specifier — so
the reimplementation is not explained by the helper being hard to find or the
import surface being unavailable.

## Suggested direction (non-binding, optional)
Both files could add `diagLines` (and, for the scalar-refusal file,
`diagCodes`) to their existing `"./helpers/e2e-s1"` import and drop the local
declarations.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: not applicable — `diagLines`/`diagCodes` render an
  already-produced diagnostics array for a positive assertion, not a
  MUST-NOT witness over recorded calls.
- docs/bugs/ signature search: `grep -rn "diagLines\|diagCodes"
  docs/bugs/*.md` filtered for bug 0056/0059 returns no hits; neither bug
  doc gives a rationale for a file-local `diagLines`/`diagCodes`.
- coverage-matrix/bug-doc citation search: `grep -n
  "params-literal-sublanguage-lowering\|params-scalar-nontype-text-refusal"
  docs/reference/coverage-matrix.md` → 0 hits. Both files ARE cited by name
  in several docs/bugs/*.md files (0056, 0059, 0061, 0097, 0099, 0104, 0132,
  0133, 0164, 0165, 0166, 0175, 0179, 0184, 0204, 0244, 0285) as witness
  tests, and docs/bugs/0059 cites this file's own `93/93` pass count and one
  specific cell (`f1`) by name — but none of those citations name
  `diagLines`/`diagCodes` or pin their definition site; this finding proposes
  no change to any `it()`/`describe()` name, cell label, or assertion, only
  the definition site of two identically-bodied helper functions, so the
  pinned witnesses are unaffected.
- Confirmed the canonical exports exist and match byte-for-byte: re-read
  `tests/helpers/e2e-s1.ts:99-107` and both in-scope declarations immediately
  before filing.

## Triage
verdict: confirmed — re-verified independently: all three local bodies diff byte-identical (exit 0) to the exports at tests/helpers/e2e-s1.ts:100-102/105-107 (locals at params-literal:312-314 and params-scalar:286-288/291-293, called 6× / 14×+4× respectively), both files import only parseDoc from ./helpers/e2e-s1 (lines 12 / 10), the local declarations (2026-08-07/08) predate the export PTQ-0205's fix added on 2026-09-11 (2594cd44), and that fix migrated only its 4 cited files — neither candidate file appears in its diffstat or git log — so this is an untracked residual instance of the class, ruled a distinct filing per the store's per-file convention (PTQ-0274 vs 0205; PTQ-0314/0386/0405 vs 0214); not a *gate* file, not a recording double, docs/bugs diagLines/diagCodes hits (0060/0100/0102) concern other test files, coverage-matrix 0 hits, and both files are green at HEAD (47/47, 94/94) so no documented-red or pinned-witness carve-out applies (triage: claude-fable-5-1)
