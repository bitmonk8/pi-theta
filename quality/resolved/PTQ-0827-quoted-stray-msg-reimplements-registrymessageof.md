---
id: PTQ-0827
title: Both files' local msg() reimplements tests/helpers/load-row-harness.ts's exported registryMessageOf statement-for-statement
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-object-quoted-field-name-refusal.test.ts:157-172
  - tests/inline-object-stray-close-token-split.test.ts:195-210
  - tests/helpers/load-row-harness.ts:55-77
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Both files' local msg() reimplements tests/helpers/load-row-harness.ts's exported registryMessageOf statement-for-statement

## Observation
Both files in this review's scope already import `REGISTRY` from
`tests/helpers/registry-oracle.ts` (so neither redeclares the four-page
registry read), but each also imports `registryMessage` directly from
`tools/code-registry/index.js` and locally declares its own `msg(code,
fills)` function performing the identical lookup-assert-fill sequence that
`tests/helpers/load-row-harness.ts` already exports as `registryMessageOf`.
Each local `msg()` is byte-identical to the other and statement-for-statement
identical to the exported helper, differing only in closing over the
module-level `REGISTRY` constant and hard-coding a truncated registry-path
string (`"docs/spec_topics/diagnostics/"`, missing the filename) where
`registryMessageOf` takes both as explicit parameters.

## Evidence

`tests/inline-object-quoted-field-name-refusal.test.ts:157-172` (re-read
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

`tests/inline-object-stray-close-token-split.test.ts:195-210` — re-read
immediately before filing; `diff` of the two 16-line blocks (line ranges
above) is empty (rc=0), so the bodies are byte-identical:
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

The canonical helper this reimplements, `tests/helpers/load-row-harness.ts:55-77`:
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
The two bodies are statement-for-statement identical: same `registryMessage(...)`
call, same `toBeDefined()` assertion with the same message shape, the same
`for (const [placeholder, value] of fills)` loop with the same `.toContain`
then `.replace` pair, and the same `return out;`. Import-site check: `grep -n
"^import" tests/inline-object-quoted-field-name-refusal.test.ts
tests/inline-object-stray-close-token-split.test.ts` shows both files import
`registryMessage` directly from `../tools/code-registry/index.js` and
`REGISTRY` from `./helpers/registry-oracle`; neither imports
`load-row-harness` or `registryMessageOf`.

Pattern-wide search confirming exact hit count for the literal string both
files hard-code: `grep -rn "must carry the Message row for" tests/*.test.ts`
returns exactly 2 hits, both inside the two cited files' own `msg()` bodies at
the lines cited above.

## Why this is a problem
`tests/helpers/load-row-harness.ts`'s own header states its reason for
existing: several bug-report test files "independently redeclared the same
... registry-message renderer" and it centralises that one shared
declaration so callers thread `registry`/`registryPath` through instead of
retyping the lookup-assert-fill body. Both files in scope already import a
sibling helper module (`registry-oracle.ts`) for the registry array itself,
so both could equally call
`registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", code, fills)`,
but each instead retypes the exact body the shared export already carries —
the same class of duplication `registryMessageOf` was built to absorb, on two
files its prior fix's location list did not reach, and the two copies also
duplicate each other in the same commit-family of files.

## Suggested direction (non-binding, optional)
Replacing each local `msg()` with a call to the already-adjacent
`registryMessageOf` from `tests/helpers/load-row-harness.ts`, passing
`REGISTRY` and the full registry-path string, removes both local
redeclarations without touching either file's domain-specific rendering
wrappers (`quotedLine`, `dupLine`, etc. in one file; `DUP`/`QUOTED`/`render`
in the other), which call `msg()` but are unaffected by where its body lives.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named
  gate-kin patterns (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); `ls tests/*gate*.test.ts | grep -i
  "quoted-field-name\|stray-close"` → 0 hits.
- Recording-double check: `msg()` performs a synchronous registry lookup and
  string substitution; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "inline-object-quoted-field-name-refusal\|inline-object-stray-close-token-split" docs/bugs/*.md`
  returns 15 documents (0133, 0160, 0176, 0228, 0229, 0231, 0232, 0233, 0238,
  0244, 0252, 0256, 0257, 0292, 0355); every citation names the file as a
  whole witness or a specific `it()`/cell id, none cites or depends on the
  internal shape of the local `msg()` helper — no documented correct-reason
  red is disturbed and no rationale for keeping `msg()` local is stated.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-quoted-field-name-refusal\|inline-object-stray-close-token-split"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` block
  — only that the local `msg()` definition could call the existing exported
  helper instead of retyping its body.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION, not a missing test path; every call site of `msg()` in both
  files is exercised by that file's own currently-running assertions.
- Prior-filing overlap check: `grep -rl "inline-object-quoted-field-name-refusal\|inline-object-stray-close-token-split" quality/intake/*.md quality/issues/*.md quality/resolved/*.md`
  returns PTQ-0104, PTQ-0425 (ajv() builder, resolved), PTQ-0475/PTQ-0488
  (the four-page REGISTRY read itself, both resolved/fixed — already absent
  from these two files, which now import `REGISTRY` from
  `registry-oracle.ts`), PTQ-0555/PTQ-0596/PTQ-0753 (different files'
  fixture-builder/`expectGroup`/`registers` duplications), and this wave's
  `d7-02-ateveryposition-positions-duplicated.md` (a different
  `positions()`/`atEveryPosition` pair). None of these names or covers
  `msg()`/`registryMessageOf`. A same-wave sibling,
  `qw20260918050411-d7-01-generic-argument-msg-reimplements-registrymessageof.md`,
  covers the identical root cause (`msg()` reimplementing
  `registryMessageOf`) but names only
  `tests/generic-argument-bracket-group-truncation.test.ts`, a file outside
  this review's briefed scope — the two files cited here are additional,
  previously unfiled sites of that same root cause, not a re-filing of it.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: `msg()` sed-extracted from tests/inline-object-quoted-field-name-refusal.test.ts:157-172 and tests/inline-object-stray-close-token-split.test.ts:195-210 diffs to zero (rc=0), and both are statement-identical to the exported `registryMessageOf` at tests/helpers/load-row-harness.ts:55-77 bar the closed-over `REGISTRY` and the hard-coded truncated path; neither file imports load-row-harness (both import `REGISTRY` from registry-oracle and `registryMessage` from tools/code-registry directly, 47 other tests import `registryMessageOf`), both copies are live (6 and 2 `msg(` call sites), registry-oracle.ts:54-56 itself routes `loadRowMessage` through `registryMessageOf` so its header's "wording varies per file" caveat does not apply to a byte-identical copy; all locations under tests/, D7 boilerplate-duplication class, not a gate file, no recording double, coverage-matrix → 0, 15 docs/bugs hits name the files only as witnesses and no merge/rename/delete is proposed; not a duplicate — resolved PTQ-0475/PTQ-0488 migrated only these files' REGISTRY read and expressly left `msg()` "unaffected by that swap", no open/resolved PTQ or same-wave sibling names either file for `msg()`, and per-file-set filings of this class are the accepted grain (PTQ-0495/0539/0567/0616/0747; same-wave generic-argument, type-source/wire-name, msg-row, misfire-faces siblings all confirmed on disjoint files); accounting nit only: the filing's "exactly 2 hits" grep claim is wrong — `must carry the Message row for` occurs in ~60 test files and the identical truncated-path `msg()` in 14 — immaterial since the fix is a per-file import (triage: claude-fable-5-1)
