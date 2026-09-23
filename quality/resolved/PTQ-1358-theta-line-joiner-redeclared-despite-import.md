---
id: PTQ-1358
title: theta-callable-call-arity.test.ts and tool-arg-runtime-schema-validation.test.ts redeclare the theta() line-joining fixture builder already exported by the production-load-harness module they import
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/theta-callable-call-arity.test.ts:103-105
  - tests/tool-arg-runtime-schema-validation.test.ts:90-92
  - tests/helpers/production-load-harness.ts:223-225
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# theta-callable-call-arity.test.ts and tool-arg-runtime-schema-validation.test.ts redeclare the theta() line-joining fixture builder already exported by the production-load-harness module they import

## Observation
Both `tests/theta-callable-call-arity.test.ts` and
`tests/tool-arg-runtime-schema-validation.test.ts` import
`disposeWorkspace`/`plantThetaWorkspace`/`runProductionLoad` (plus, in the
second file, `callableSetOf`) from `./helpers/production-load-harness`, and
both locally declare their own `theta(...lines)` fixture-text joiner instead
of importing the identically-named, identically-bodied function that same
module already exports.

## Evidence
`tests/theta-callable-call-arity.test.ts:1` (the existing import from the
module that also exports `theta`):
```ts
import { disposeWorkspace, plantThetaWorkspace, runProductionLoad, type LoadOutcome } from "./helpers/production-load-harness";
```

`tests/theta-callable-call-arity.test.ts:103-105` (the local redeclaration):
```ts
function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}
```

`tests/tool-arg-runtime-schema-validation.test.ts:10-16` (the existing import,
naming `callableSetOf`, `disposeWorkspace`, `plantThetaWorkspace`,
`runProductionLoad`, `type LoadOutcome` from the same module):
```ts
import {
  callableSetOf,
  disposeWorkspace,
  plantThetaWorkspace,
  runProductionLoad,
  type LoadOutcome,
} from "./helpers/production-load-harness";
```

`tests/tool-arg-runtime-schema-validation.test.ts:90-92` (the local
redeclaration, byte-identical body to the file above):
```ts
function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}
```

`tests/helpers/production-load-harness.ts:223-225` (the canonical export,
already reachable through both files' existing import statement):
```ts
export function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}
```

Both local bodies are byte-for-byte identical to the exported one
(`lines.join("\n") + "\n"`).

## Why this is a problem
Both in-scope files already have an open `import { ... } from
"./helpers/production-load-harness"` naming several other members of the same
module, yet neither adds `theta` to that import list — each instead re-types
the exact three-line function the module exports under the identical name.
This is the "Boilerplate duplication" class: the same fixture-text-joining
fact (how a planted `.theta` fixture's frontmatter/body lines are joined) is
declared three times in the repository (twice here, once in the helper) where
one declaration, already imported for other names in both sites, would do.

## Suggested direction (non-binding, optional)
Adding `theta` to each file's existing `./helpers/production-load-harness`
import is the natural way to point both declarations at the one already-
exported definition, observationally — the import statement in both files
already reaches it.

## False-positive check
- Gate-pin check: neither `theta-callable-call-arity.test.ts` nor
  `tool-arg-runtime-schema-validation.test.ts` matches `*gate*.test.ts` or a
  named gate kin; the cited lines are a fixture-text helper declaration, not a
  pinned count or inventory.
- Recording-double check: `theta()` is a pure string joiner with no recorded
  calls and backs no MUST-NOT witness; the negative-witness carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rl "function theta(" docs/bugs/*.md` →
  0 hits; no documented correct-reason red covers either local declaration.
- coverage-matrix/bug-doc citation search: `grep -n
  "theta-callable-call-arity\|tool-arg-runtime-schema-validation"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge,
  rename, or deletion of any `it()`/`describe()` — only that each file's local
  `theta` definition could import the identical exported one it already has
  an open import statement for.
- Prior-finding overlap check: `grep -rl "function theta(" quality/intake
  quality/resolved` before filing shows several same-shape findings against
  other files (e.g. `subagent-tool-admission.test.ts`,
  `production-tools-load-resolution.test.ts`) — none names either file cited
  here.
- Coverage-drift check: the claim is about a repeated builder-function
  DEFINITION, not a missing test path; every cell in both files already
  exercises the fixture text its own local `theta()` produces.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines (call-arity :103-105, runtime-schema-validation :90-92, harness :223-225; bodies identical modulo `export`), both files import from `./helpers/production-load-harness` (:1 and :10-16) without naming `theta`, no other module-scope `theta` binding exists in either file so adding it to the import cannot collide, both local copies are live (29 and 2 `theta(` call sites), and the residue is explained by ordering — the harness export landed in cec9ee56 (2026-09-18, PTQ-0606 fix) while these files' harness migrations (PTQ-0669, PTQ-0717) left the joiner behind; re-ran the checks: `function theta(` in docs/bugs → 0, coverage-matrix mentions of either file → 0, not a gate kin, no recording double or red-test carve-out, no it()/describe() merge/rename/delete; dedupe holds — PTQ-0606/0782/1035 (all resolved) cover other files' `theta()` copies and PTQ-1035's fold list named b0297/subagent-root-registration-refusal-envelope/tools-entry-containment, not these two; PTQ-0669/0717/0712 fixed the plant/dispose/runProductionLoad/callableSetOf copies in these files but not `theta` — in-scope D7 boilerplate-duplication with a mechanical fix (add `theta` to each existing import, delete the local declaration); acceptance note: `grep -lF` of the identical body over tests/**/*.test.ts shows five more files that also already import production-load-harness (nested-tools-entry-containment, subagent-tool-admission, tools-entry-grammar-derivations-lockstep, tools-entry-message-line-break, conformance/production-conformance) — consider folding them into this row's location list rather than minting per-file rows (triage: claude-fable-5-1)
