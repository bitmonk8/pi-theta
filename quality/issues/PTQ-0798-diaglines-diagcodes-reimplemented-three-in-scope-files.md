---
id: PTQ-0798
title: All three in-scope files redeclare e2e-s1's exported diagLines/diagCodes instead of importing them
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-block-mapping-rhs-refusal.test.ts:311-318
  - tests/params-brace-union-rhs-lowering.test.ts:421-424
  - tests/params-default-empty-literal-refusal.test.ts:184-193
  - tests/helpers/e2e-s1.ts:123-130
sites: 3
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# All three in-scope files redeclare e2e-s1's exported diagLines/diagCodes instead of importing them

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`
(`` `${severity} ${code}: ${message}` `` per diagnostic) and
`diagCodes(doc: ThetaDocument): string[]` (`` `${severity} ${code}` `` per
diagnostic). All three files in this review's scope already import `parseDoc`
from that exact module (`./helpers/e2e-s1`) — two of them (`params-block-
mapping-rhs-refusal.test.ts`, `params-brace-union-rhs-lowering.test.ts`) also
import `fieldOf` from it in the same statement — yet none of the three
imports `diagLines` or `diagCodes`; each instead declares its own
module-local function of the identical name with a byte-identical body over
the same `doc.diagnostics` projection.

## Evidence
`tests/helpers/e2e-s1.ts:123-130` (the canonical, already-exported pair):
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

`tests/params-block-mapping-rhs-refusal.test.ts:12` (the import that stops
short of `diagLines`/`diagCodes`) and `:311-318` (the local shadow, re-read
immediately before filing):
```ts
import { parseDoc, fieldOf } from "./helpers/e2e-s1";
...
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}
```

`tests/params-brace-union-rhs-lowering.test.ts:16` and `:421-424` — the same
`diagLines` shadow (this file has no local `diagCodes`; it only reimplements
`diagLines`):
```ts
import { parseDoc, fieldOf } from "./helpers/e2e-s1";
...
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/params-default-empty-literal-refusal.test.ts:8` and `:184-193`:
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

Exact search: `grep -n "^function diagLines\|^function diagCodes"` against
each of the three files returns exactly the lines quoted above and no others;
`grep -n "diagLines\|diagCodes" tests/params-block-mapping-rhs-refusal.test.ts
tests/params-brace-union-rhs-lowering.test.ts tests/params-default-empty-
literal-refusal.test.ts | grep "import"` returns zero hits — none of the three
`./helpers/e2e-s1` import statements names either function.

## Why this is a problem
All three functions this file set restates are pure one-line projections over
an already-produced `doc.diagnostics` array — harness plumbing, not domain
logic tied to any one bug's subject — and the exported originals sit in the
exact module all three files already import from for `parseDoc` (and, in two
of the three, for `fieldOf`). Each file types out the identical projection
under a second, private declaration of the same name and doc comment as the
export, rather than adding the two names to the import already on the line
above.

## Suggested direction (non-binding, optional)
Adding `diagLines`/`diagCodes` (as applicable) to each file's existing
`./helpers/e2e-s1` import and dropping the local declarations removes all
three copies without touching any assertion.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the named
  gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited
  lines are diagnostic-rendering helpers, not a pinned count or inventory.
- Recording-double check: not applicable — `diagLines`/`diagCodes` render an
  already-produced diagnostics array for positive `toEqual` comparisons; they
  record no calls and back no "never called" witness.
- docs/bugs/ signature search: `grep -rl "diagLines\|diagCodes"
  docs/bugs/0041*.md docs/bugs/0097*.md docs/bugs/0165*.md` → 0 hits; none of
  the three files' own cited bug documents states a rationale for shadowing
  the already-exported helpers locally.
- coverage-matrix/bug-doc citation search: `grep -n "params-block-mapping-
  rhs-refusal\|params-brace-union-rhs-lowering\|params-default-empty-literal-
  refusal" docs/reference/coverage-matrix.md` → 0 hits. Each file is cited by
  name in its own bug document's witness list, always for the diagnostic
  cells under test, never for the `diagLines`/`diagCodes` helper's own
  location; this finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` — only that each site could call the already-imported-
  adjacent exports directly.
- Coverage check: the claim is about repeated function DEFINITIONS shadowing
  an existing export, not a missing test path; every local copy is exercised
  by its own file's diagnostic assertions today.
- Overlap check: `grep -rl "params-block-mapping-rhs-refusal\|params-brace-
  union-rhs-lowering\|params-default-empty-literal-refusal" quality/intake
  quality/issues quality/resolved` (run before this filing) found prior
  findings on this file trio's `RegistryRow`/`REGISTRY` read (PTQ-0651,
  PTQ-0654, both fixed and now absent from current file content — confirmed
  by re-reading: all three files now import `REGISTRY` from
  `./helpers/registry-oracle`), `fieldOf` (PTQ-0652, fixed — confirmed absent:
  two of the three files now import `fieldOf` from `./helpers/e2e-s1`),
  `loadCleanly` (PTQ-0212, fixed status but the local copies are still
  present in the two lowering files at re-read time — an out-of-scope
  observation, not refiled here), `TRIAGE_DEF`/`BODY` (PTQ-0653, open), and
  the AJV-capture double (PTQ-0425, scoped to a disjoint file pair). None of
  these prior findings names or discusses `diagLines`/`diagCodes`, and
  same-wave sibling intakes covering this exact function pair
  (`qw20260918050411-d7-01-diaglines-reimplemented-both-in-scope-files.md`,
  `-generic-argument-rules.md`, `-inline-object-empty-pair.md`,
  `-inline-object-pair.md`, `-03-...-both-in-scope-files.md`) each name a
  disjoint file set that does not include any of this trio.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: tests/helpers/e2e-s1.ts:123-130 exports diagLines/diagCodes and all five local declarations (block-mapping:311/316, brace-union:422, default-empty-literal:185/190) carry byte-identical bodies over the same `../src/parser/theta-document` ThetaDocument type while each file's only e2e-s1 import (:12/:16/:8) names parseDoc(+fieldOf) alone; every copy is live (11/15/16 call refs), the stated greps reproduce exactly (5 decls, 0 import hits, docs/bugs 0041/0097/0165 → 0, coverage-matrix → 0), none of the three is a gate/kin file or recording double, no it()/describe() is touched, and all three suites are green (111/111); not a duplicate — PTQ-0205's fix commit 2594cd44 touched none of the trio (all three predate the export: 2026-08-02/16/15) and neither PTQ-0205 nor any diagLines residual row (0591/0663/0664/0674/0732/0733/0770) names them, while the six same-wave diaglines sibling intakes cite disjoint file sets — an unmigrated PTQ-0205 residual per the store's per-file-set convention, D7 boilerplate-duplication, mechanical dedupe by import (triage: claude-fable-5-1)
