---
id: PTQ-0799
title: Both in-scope files redeclare e2e-s1's exported diagLines(doc) under a local declaration instead of importing it
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/brace-and-angle-annotation-junk-refusal.test.ts:7
  - tests/brace-and-angle-annotation-junk-refusal.test.ts:256-258
  - tests/brace-rooted-union-arm-capture.test.ts:17
  - tests/brace-rooted-union-arm-capture.test.ts:204-206
  - tests/helpers/e2e-s1.ts:123-126
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Both in-scope files redeclare e2e-s1's exported diagLines(doc) under a local declaration instead of importing it

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
rendering every diagnostic as `` `${severity} ${code}: ${message}` ``. Both
`tests/brace-and-angle-annotation-junk-refusal.test.ts` and
`tests/brace-rooted-union-arm-capture.test.ts` already import `parseDoc` from
that exact module (`./helpers/e2e-s1`), but neither imports `diagLines`;
each instead declares its own module-local function of the same name with a
functionally identical one-line body over the same `doc.diagnostics`
projection.

## Evidence
`tests/helpers/e2e-s1.ts:123-126` (the canonical, already-exported helper):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/brace-and-angle-annotation-junk-refusal.test.ts:7` (the import that
omits `diagLines`) and `:256-258` (the local reimplementation, same name,
same projection):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/brace-rooted-union-arm-capture.test.ts:17` (the import that omits
`diagLines`) and `:204-206` (the local reimplementation, same name, same
projection, `readonly` return type):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): readonly string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

Exact search: `grep -n "^function diagLines" tests/brace-and-angle-annotation-junk-refusal.test.ts tests/brace-rooted-union-arm-capture.test.ts` returns exactly these two declarations, one per file, and both files' `./helpers/e2e-s1` import statement names `parseDoc` only.

## Why this is a problem
Both files already reach into `tests/helpers/e2e-s1` in the same import
statement the canonical `diagLines` is exported from, so the
reimplementation is not a case of the helper being hard to find. Each site
types out the same `doc.diagnostics.map((d) => \`${d.severity} ${d.code}: ${d.message}\`)`
projection under a second, module-private declaration of the identical name
and doc comment as the exported one, rather than calling the already-visible
import.

## Suggested direction (non-binding, optional)
Each site could add `diagLines` to its existing `./helpers/e2e-s1` import and
drop the local declaration, calling the imported function directly.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: not applicable — `diagLines` renders an
  already-produced diagnostics array for a positive assertion; it records no
  calls and backs no "never called" witness.
- docs/bugs/ signature search: `grep -rl "diagLines" docs/bugs/` returns no
  hits; no documented correct-reason red cites either local declaration.
- coverage-matrix/bug-doc citation search: `grep -n
  "brace-and-angle-annotation-junk-refusal\|brace-rooted-union-arm-capture"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only that each site
  could call the already-imported module's `diagLines` directly — so no
  pinned citation is disturbed.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION; every copy is exercised by its own file's tests, and no
  behaviour path is claimed untested.
- Overlap check: resolved `quality/resolved/PTQ-0205-diagline-rendering-helper-duplication.md`
  names both files by path inside its evidence prose (as two of ~18
  additional grep hits beyond its own four cited `locations`), but neither
  file appears in that finding's `locations:` field, and its fix commit only
  added the `tests/helpers/e2e-s1.ts` export — it did not migrate any of the
  files named only in its prose. Open `quality/issues/PTQ-0733-...md` records
  the identical precedent for a different file pair on the same grounds
  ("neither names either file in this review's scope, so this is the first
  filing to cite this specific pair"). Grepped `quality/intake`,
  `quality/issues`, and `quality/resolved` for both file names together with
  `diagLines` — no other finding covers this exact pair.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: tests/helpers/e2e-s1.ts:123-126 exports diagLines(doc) exactly as excerpted; brace-and-angle-annotation-junk-refusal.test.ts:7 and brace-rooted-union-arm-capture.test.ts:17 each import only parseDoc from ./helpers/e2e-s1, and :256-258 / :204-206 declare live local diagLines copies (2 and 8 call sites) whose bodies are the same `${d.severity} ${d.code}: ${d.message}` projection (only cosmetic drift: an explicit `(d: Diagnostic)` param annotation and a `readonly string[]` return — both assignable from the export); stated greps reproduce (`^function diagLines` → exactly these two; docs/bugs diagLines → 0; coverage-matrix → 0); both files under tests/, not gate/live, no recording double, no merge/rename/delete proposed, both suites green (48/48); local declarations (files added 2026-08-23 / 2026-08-05) predate the export (2026-09-11, PTQ-0205, whose fix added the export only and whose locations: omit both files) — D7 boilerplate-duplication class, and consistent with the per-pair precedent confirmed for disjoint files in PTQ-0591/0663/0664/0674/0732/0733/0770; fixer note: migrating brace-and-angle leaves its `import type { Diagnostic }` (line 4) unused (triage: claude-fable-5-1)
