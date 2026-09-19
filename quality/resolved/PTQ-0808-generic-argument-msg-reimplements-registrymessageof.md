---
id: PTQ-0808
title: generic-argument-bracket-group-truncation.test.ts redeclares the lookup-assert-fill msg() body tests/helpers/load-row-harness.ts already exports as registryMessageOf
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/generic-argument-bracket-group-truncation.test.ts:1-9
  - tests/generic-argument-bracket-group-truncation.test.ts:214-234
  - tests/helpers/load-row-harness.ts:62-81
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# generic-argument-bracket-group-truncation.test.ts redeclares the lookup-assert-fill msg() body tests/helpers/load-row-harness.ts already exports as registryMessageOf

## Observation
`tests/generic-argument-bracket-group-truncation.test.ts` already imports the
shared `REGISTRY` array from `tests/helpers/registry-oracle.ts` (avoiding a
local re-parse of the registry pages), but still imports `registryMessage`
directly from `tools/code-registry/index.js` and locally declares its own
`msg(code, fills)` function that performs the identical lookup-assert-fill
sequence `tests/helpers/load-row-harness.ts` already exports as
`registryMessageOf(registry, registryPath, code, fills)`, instead of calling
that exported helper with `REGISTRY` and a registry path string.

## Evidence
`tests/generic-argument-bracket-group-truncation.test.ts:1-4` — the direct
`registryMessage` import sitting beside the `REGISTRY` import:
```ts
import { REGISTRY } from "./helpers/registry-oracle";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { registryMessage } from "../tools/code-registry/index.js";
```

`tests/generic-argument-bracket-group-truncation.test.ts:214-234` (re-read
immediately before filing):
```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

The canonical helper this reimplements, `tests/helpers/load-row-harness.ts:62-81`:
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```
The body of `msg` and the body of `registryMessageOf` are statement-for-
statement identical (same `registryMessage(...)` call, same
`toBeDefined()` assertion shape, same fills loop with the same `.toContain`
then `.replace` pair), differing only in `msg` closing over the module-level
`REGISTRY` constant and hard-coding a truncated registry-path string
(`"docs/spec_topics/diagnostics/"`, missing the filename) where
`registryMessageOf` takes both as parameters.

## Why this is a problem
`tests/helpers/load-row-harness.ts`'s own header states its reason for
existing: several bug-report test files "independently redeclared the same
... registry-message renderer," and it centralises that one shared
declaration so callers thread `registry`/`registryPath` through instead of
retyping the lookup-assert-fill body. This file already imports the sibling
helper module (`registry-oracle.ts`) for the registry array, and could equally
call `registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", code, fills)`,
but instead retypes the exact body the shared export already carries — the
same class of duplication `registryMessageOf` was built to absorb, on a file
the prior fix's location list did not reach.

## Suggested direction (non-binding, optional)
Replacing the local `msg()` with a call to the already-imported-adjacent
`registryMessageOf` from `tests/helpers/load-row-harness.ts` removes the
local redeclaration; no other file's shape is implicated.

## False-positive check
Gate-pin check: the file does not match `*gate*.test.ts` or the named gate kin
(closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
committed-fixture-parse-gate, registry-closed-set-corpus-gate) — not a pinned
census. Recording-double check: not applicable, no double or spy is involved
in `msg()`. docs/bugs/ signature search: `grep -rl
"generic-argument-bracket-group-truncation" docs/bugs/` finds
`docs/bugs/0236-bracket-group-generic-argument-truncates-list.md`, which cites
this test file as its fix witness by name but pins the file's diagnostic-list
assertions and cell counts, not the internal shape of its local `msg()`
helper — this finding proposes no merge, rename or deletion of the file or any
`it()`/`describe()`. coverage-matrix citation search: `grep -n
"generic-argument-bracket-group-truncation" docs/reference/coverage-matrix.md`
→ 0 hits. Duplicate/overlap check: `quality/issues/PTQ-0747-...md` covers the
identical duplication class (local `msg()`/registry-read reimplementing
`load-row-harness.ts`) but its location list names only
`fn-param-not-identifier.test.ts`, `fn-param-sink-array-literal.test.ts` and
`fn-return-void-query-sink.test.ts`; `generic-argument-bracket-group-truncation.test.ts`
is not among its cited sites. A broader search (`grep -rl "must carry the
Message row for" tests/*.test.ts`) finds 14 files sharing this exact string,
none of the other open/pending findings found via `grep -rl "must carry the
Message row for" quality/issues quality/intake` (PTQ-0430, PTQ-0431,
PTQ-0735, PTQ-0747, PTQ-0786) cite this file either, so this is a distinct,
previously unfiled site of the same root cause rather than a duplicate.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (msg at tests/generic-argument-bracket-group-truncation.test.ts:220-234, registryMessageOf at tests/helpers/load-row-harness.ts:62-81); a diff of the two bodies after normalising only the signature line and the hard-coded path string leaves a single differing token (`REGISTRY` vs the `registry` parameter), msg is live (called at :314), and registry-oracle.ts itself imports registryMessageOf and composes it as `loadRowMessage`, so its header's "local readers stay local because wording varies per file" caveat does not apply to a byte-identical copy; all locations under tests/, D7 boilerplate-duplication class, not a gate file, no double/spy, coverage-matrix → 0 hits, and no merge/rename/delete is proposed so the six docs/bugs witness cites (filing said one) are immaterial; resolved PTQ-0470 migrated only this file's REGISTRY read and left msg() in place, PTQ-0555/0596/0774 cover other helpers in this file, and no open PTQ or same-wave intake (0430/0431/0735/0747/0786, d7-01-inline-object/quoted-stray/etc. location lists checked) names this file — per-file not-migrated filings of this class are the accepted grain (0747, 0616, 0567, 0495, 0539); accounting nits only: the "14 files" grep claim is 51 and the byte-identical sibling msg at tests/generic-argument-inline-field-key-rules.test.ts:193-207 is uncited — fold it into the location list at fix time (triage: claude-fable-5-1)
