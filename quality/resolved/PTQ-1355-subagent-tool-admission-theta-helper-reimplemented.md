---
id: PTQ-1355
title: subagent-tool-admission.test.ts redeclares the canonical theta() fixture-text builder already exported by production-load-harness.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/subagent-tool-admission.test.ts:78-80
  - tests/helpers/production-load-harness.ts:223-225
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# subagent-tool-admission.test.ts redeclares the canonical theta() fixture-text builder already exported by production-load-harness.ts

## Observation
`tests/subagent-tool-admission.test.ts` imports `callableSetOf`, `runProductionLoad`, and `type LoadOutcome` from `./helpers/production-load-harness` (line 1), but locally declares its own `theta(...lines)` line-joining fixture-text builder (lines 78-80) instead of importing the identically-named, identically-bodied function that same module already exports (`tests/helpers/production-load-harness.ts:223-225`).

## Evidence
tests/subagent-tool-admission.test.ts:1:
```ts
import { callableSetOf, runProductionLoad, type LoadOutcome } from "./helpers/production-load-harness";
```

tests/subagent-tool-admission.test.ts:78-80:
```ts
function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}
```

tests/helpers/production-load-harness.ts:223-225 (the canonical export, already imported for other names in the same file):
```ts
export function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}
```

The two function bodies are byte-identical (`lines.join("\n") + "\n"`), and the local declaration shadows the exported name rather than merely coinciding with it — a reader who searches `production-load-harness.ts` for `theta` finds the exact function the test file re-typed.

## Why this is a problem
This is the "Copy-paste fixtures" class: a fixture-text helper is re-implemented in the test body where a canonical helper of the identical name and body already exists under `tests/helpers/`, and is even imported from that same module elsewhere in this very file (`callableSetOf`, `runProductionLoad`). The re-declaration is not a divergent variant serving a local need — it is the same three-line joiner, so the file carries two definitions of one fact (how a planted `.theta` fixture's frontmatter lines are joined) instead of one.

## Suggested direction (non-binding, optional)
Adding `theta` to the existing `production-load-harness` import on line 1 is the natural way to point the file at the one definition already exported by that module, observationally — no local re-derivation is needed.

## False-positive check
- Gate-pin carve-out: `subagent-tool-admission.test.ts` does not match `*gate*.test.ts` or the named kin; not applicable.
- Recording-double carve-out: not a recording double or negative witness; not applicable.
- docs/bugs/ signature search: `grep -rl "function theta(" docs/bugs/*.md` → 0 hits; no documented correct-reason red covers this builder.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-tool-admission" docs/reference/coverage-matrix.md docs/bugs/*.md` → 0 hits. This finding proposes no merge, rename, or deletion of any test, only that the local `theta` definition could import the identical exported one.
- Prior-filing search: `grep -rl "subagent-tool-admission" quality/intake quality/resolved` → one unrelated resolved hit (PTQ-0635, a different file/topic: modulo-zero production-load-harness migration); no prior finding cites this file's local `theta` re-declaration.
- Coverage-drift check: this is about a repeated builder-function DEFINITION, not a missing test path; the file's own tests already exercise every fixture it plants.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: tests/subagent-tool-admission.test.ts:78-80 declares `function theta(...lines)` whose body is byte-identical (mktemp diff, export keyword stripped → no differences) to the `export function theta` at tests/helpers/production-load-harness.ts:223-225, while line 1 already imports `callableSetOf, runProductionLoad, type LoadOutcome` from that same module and `grep -n theta` in the file shows only the local declaration plus 7 call sites and no import; D7 copy-paste-fixture class, location under tests/, not a gate/pin test, `grep "function theta(" docs/bugs/*.md` → 0 and `grep subagent-tool-admission docs/reference/coverage-matrix.md docs/bugs/*.md` → 0 both re-run; not a duplicate — PTQ-0606/0782/1035 fixed the same builder in other files and the same-wave sibling intake (theta-line-joiner-redeclared-despite-import) cites theta-callable-call-arity and tool-arg-runtime-schema-validation, not this file; fix is a mechanical import (triage: claude-fable-5-1)
