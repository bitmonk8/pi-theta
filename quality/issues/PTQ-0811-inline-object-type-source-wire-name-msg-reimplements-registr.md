---
id: PTQ-0811
title: inline-object-type-source-capture.test.ts and inline-object-wire-name-rename-refusal.test.ts each redeclare the lookup-assert-fill msg() body tests/helpers/load-row-harness.ts already exports as registryMessageOf
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-type-source-capture.test.ts:208-223
  - tests/inline-object-wire-name-rename-refusal.test.ts:224-239
  - tests/helpers/load-row-harness.ts:62-82
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inline-object-type-source-capture.test.ts and inline-object-wire-name-rename-refusal.test.ts each redeclare the lookup-assert-fill msg() body tests/helpers/load-row-harness.ts already exports as registryMessageOf

## Observation
Both in-scope files import `REGISTRY` from `./helpers/registry-oracle` and
`registryMessage` directly from `../tools/code-registry/index.js`, then each
locally declares its own `msg(code, fills)` function performing the identical
lookup-assert-fill sequence that `tests/helpers/load-row-harness.ts` already
exports as `registryMessageOf(registry, registryPath, code, fills)`. Neither
file imports `registryMessageOf`. The two local `msg()` bodies are
byte-identical to each other and statement-for-statement identical to the
canonical export, differing from it only in closing over the module-level
`REGISTRY` constant instead of taking a `registry` parameter, and hard-coding
a truncated registry-path string (`"docs/spec_topics/diagnostics/"`, missing
the page filename) where the canonical export takes `registryPath` as an
argument.

## Evidence

`tests/inline-object-type-source-capture.test.ts:208-223` (re-read
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

`tests/inline-object-wire-name-rename-refusal.test.ts:224-239` — byte-identical:
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

The canonical helper this reimplements, `tests/helpers/load-row-harness.ts:62-82`:
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

Exact check: `diff <(sed -n '208,223p' tests/inline-object-type-source-capture.test.ts) <(sed -n '224,239p' tests/inline-object-wire-name-rename-refusal.test.ts)` produces zero differences (16 lines each). `grep -rl "must carry the Message row for" tests/*.test.ts` returns 48 files, including both in-scope files; neither imports `registryMessageOf` (`grep -n "registryMessageOf" tests/inline-object-type-source-capture.test.ts tests/inline-object-wire-name-rename-refusal.test.ts` returns no hits).

## Why this is a problem
`tests/helpers/load-row-harness.ts`'s own header states the reason it exists:
several bug-report test files "independently redeclared the same ...
registry-message renderer," and it centralises that one shared declaration so
callers thread `registry`/`registryPath` through instead of retyping the
lookup-assert-fill body. Both in-scope files already import the sibling
helper module (`registry-oracle.ts`) for the `REGISTRY` array and could
equally call `registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", code, fills)`,
but instead each retypes the exact body the shared export already carries —
the same class of duplication `registryMessageOf` was built to absorb, on two
files the prior fix's location list did not reach. A change to the
placeholder-fill contract (e.g. asserting placeholder order, or reworking the
"row absent" failure wording) would have to be hand-applied in at least three
places (the canonical export plus these two local copies) with nothing to
keep them in step.

## Suggested direction (non-binding, optional)
Replacing each local `msg()` with a call to the already-imported-adjacent
`registryMessageOf` from `tests/helpers/load-row-harness.ts` removes both
local redeclarations; no other file's shape is implicated by this finding.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin
  patterns (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate) — these are
  message-rendering utility functions, not a pinned count or inventory.
- Recording-double check: `msg()` performs a static registry lookup and
  string-template fill; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "registryMessageOf" docs/bugs/*.md`
  returns no hits. `grep -c "inline-object-type-source-capture\|inline-object-wire-name-rename-refusal" docs/bugs/0228-*.md docs/bugs/0160-*.md`
  finds both files cited by name (4 and 2 hits respectively) as each bug's
  fix witness, but every citation targets specific cells/groups
  (A0/A1/B/C/D/E/F/G/H/I in the first file; A/B/C/D/E/F/G/H in the second),
  never the internal shape of the local `msg()` helper. This finding proposes
  no merge, rename, or deletion of either file or any `it()`/`describe()`
  block, only that the local `msg()` could call the already-imported-adjacent
  canonical export.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-type-source-capture\|inline-object-wire-name-rename-refusal"
  docs/reference/coverage-matrix.md` returns no hits.
- Overlap check: `grep -rl "inline-object-type-source-capture\|inline-object-wire-name-rename-refusal" quality/intake/*.md quality/issues/*.md`
  (excluding this file) finds PTQ-0596 (the `expectGroup` harness — a
  disjoint function pair, not `msg()`), PTQ-0750 (the four-page `REGISTRY`
  declaration in a different, disjoint file pair — both in-scope files here
  already import `REGISTRY` from `registry-oracle.ts` so PTQ-0750's claim
  does not reach them), and this wave's own
  `qw20260918050411-d7-01-capturedqueryschema-duplicated.md` /
  `qw20260918050411-d7-02-ateveryposition-positions-duplicated.md` (disjoint
  `capturedQuerySchema`/`positions`/`atEveryPosition` functions, not `msg()`).
  Two same-wave sibling filings
  (`qw20260918050411-d7-01-generic-argument-msg-reimplements-registrymessageof.md`,
  `qw20260918050411-d7-01-msg-row-reimplements-registrymessageof.md`) name the
  identical root cause (`msg()` reimplementing `registryMessageOf`) against a
  disjoint set of files (`fn-call-arity-unchecked.test.ts`,
  `fn-param-annotation-optional.test.ts`,
  `generic-argument-bracket-group-truncation.test.ts`); neither names either
  file in this filing's location list, so this is a new, previously unfiled
  pair of sites of the same already-recognised class, not a re-file.
- Coverage-drift check: the claim is entirely about a repeated helper-function
  DEFINITION, not a missing test path; both copies are exercised by every
  `it()` in their own file that calls `msg()`/`render()` today.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `msg()` sed-extracted from tests/inline-object-type-source-capture.test.ts:208-223 and tests/inline-object-wire-name-rename-refusal.test.ts:224-239 diff to zero, and both are statement-identical to the exported `registryMessageOf` at tests/helpers/load-row-harness.ts:62-82 bar the closed-over `REGISTRY`/hard-coded path; neither file imports `registryMessageOf` (0 hits), both copies are live (called directly and via `render()`), `registry-oracle.ts:54-56` itself already routes through `registryMessageOf`, all locations under tests/, D7 boilerplate-duplication class, no gate/recording-double/red-test carve-out (coverage-matrix 0 hits; docs/bugs 0228/0160 cite cells not `msg()`; no merge/rename/delete proposed); not a duplicate — neither in-scope file is named by any open or resolved PTQ for this class (PTQ-0616/0567/0495/0502/0539 were each accepted separately on disjoint file pairs, the store's granularity for an already-exported canonical), and the same-wave siblings all cite disjoint files (triage: claude-fable-5-1)
