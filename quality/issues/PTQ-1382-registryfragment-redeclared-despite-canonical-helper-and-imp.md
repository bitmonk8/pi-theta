---
id: PTQ-1382
title: index-sentinel-typeenv-case-fence-live-cell.test.ts redeclares registryFragment byte-identical to registry-oracle.ts's exported helper, which a sibling file in this same scope already imports
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts:104-117
  - tests/helpers/registry-oracle.ts:251-266
  - tests/live/inline-object-wire-name-rename-live-cell.test.ts:62,74-75
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# index-sentinel-typeenv-case-fence-live-cell.test.ts redeclares registryFragment byte-identical to registry-oracle.ts's exported helper, which a sibling file in this same scope already imports

## Observation
`tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts` declares a
module-scope function `registryFragment(code, substitutions)` whose body is
byte-identical (modulo the local `REGISTRY` binding name versus the helper's
own `PARSE_REGISTRY` binding, both of which are `readRegistry(["parse"])`
results) to the `registryFragment` function `tests/helpers/registry-oracle.ts`
already exports. `tests/live/inline-object-wire-name-rename-live-cell.test.ts`
— a sibling file inside this same review's scope — already imports
`registryFragment` directly from `../helpers/registry-oracle` and calls it
with the same two-argument shape, rather than redeclaring it.

## Evidence

`tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts:104-117`
(re-read immediately before filing):
```ts
function registryFragment(code: string, substitutions: Readonly<Record<string, string>>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `${code} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  let message = template as string;
  for (const [key, value] of Object.entries(substitutions)) {
    message = message.replaceAll(`<${key}>`, value);
  }
  expect(
    message,
    `${code}: an unsubstituted placeholder remains — the registry row's Message template changed shape`,
  ).not.toMatch(/<[a-z]+>/);
  return `${code}: ${message}`;
}
```

`tests/helpers/registry-oracle.ts:251-266` (the canonical, exported original):
```ts
export function registryFragment(code: string, substitutions: Readonly<Record<string, string>>): string {
  const template = registryMessage(PARSE_REGISTRY, code) as string | undefined;
  expect(
    template,
    `${code} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  let message = template as string;
  for (const [key, value] of Object.entries(substitutions)) {
    message = message.replaceAll(`<${key}>`, value);
  }
  expect(
    message,
    `${code}: an unsubstituted placeholder remains — the registry row's Message template changed shape`,
  ).not.toMatch(/<[a-z]+>/);
  return `${code}: ${message}`;
}
```

`tests/live/inline-object-wire-name-rename-live-cell.test.ts:62` and `:74-75`
(the sibling file in this same review's scope, already doing the import):
```ts
import { registryFragment } from "../helpers/registry-oracle";
...
function renamedInlineFragment(field: string): string {
  return registryFragment(RENAMED_INLINE, { field });
}
```

`index-sentinel-typeenv-case-fence-live-cell.test.ts:92-93` already imports
`readRegistry` from the very same `../helpers/registry-oracle` module (used
to build its local `REGISTRY` constant at line 101), so the module is
already on its import line; only the sibling `registryFragment` export from
that same module is not imported.

## Why this is a problem
The two bodies diverge only in which pre-built registry array they close
over (the file's own `REGISTRY` versus the helper's own `PARSE_REGISTRY`,
both `readRegistry(["parse"])` results), and the calling file already
imports a different export from the exact module that defines the
byte-identical function under the same name. A change to the placeholder
substitution or the unsubstituted-placeholder guard requires editing this
body in two places to stay consistent — the canonical definition and this
one local copy — while a sibling file in this same scope shows the
one-place alternative already in use.

## Suggested direction (non-binding, optional)
The file already imports `readRegistry` from `../helpers/registry-oracle`;
importing `registryFragment` from the same module in place of the local
declaration is the option the sibling `inline-object-wire-name-rename-live-cell.test.ts`
already demonstrates in this same scope.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named
  gate kin; the cited lines are not a pinned count or inventory assertion.
- Recording-double check: `registryFragment` is a pure string-formatting
  reader over a static documentation table, not a call-recording double
  asserting a MUST-NOT-called witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "function registryFragment"
  docs/bugs/*.md` returns 0 hits; the file's own bug doc (0135) states no
  rationale for a local copy instead of the import.
- coverage-matrix/bug-doc citation search: `grep -n
  "index-sentinel-typeenv-case-fence-live-cell" docs/reference/coverage-matrix.md`
  returns 0 hits. This finding proposes no change to any `it()`/`describe()`
  name, count, or assertion — only that the local function could be
  imported instead — so the citation carve-out does not bind.
- Prior-finding overlap check: `quality/resolved/PTQ-0776-03-registry-oracle-parse-shard-reread-four-times.md`
  covers this same file's now-fixed `REGISTRY` re-parse (a different
  function, the raw read) and its own text explicitly states the file's
  local *fragment*-formatting function was expected to stay local "exactly
  as the helper's design intends" at the time it was written; this finding
  is about a distinct function (`registryFragment`, not the `REGISTRY`
  read) that has since become available as an export from the same helper
  module and is not addressed by that resolved ticket's `locations:`.
  `grep -rl "export function registryFragment" quality/intake quality/resolved`
  and a scan of `registryFragment`-naming filings (PTQ-0495, PTQ-0765,
  PTQ-1053) shows none cites this file.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: mktemp sed-extract of tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts:104-119 (the filing's `104-117` undercounts the range by two lines, tolerated) vs tests/helpers/registry-oracle.ts:251-266 with `export ` stripped and REGISTRY/PARSE_REGISTRY normalised diffs empty (16 lines each), both closed-over bindings are `readRegistry(["parse"])` (:101 vs :237) so the swap is behaviour-neutral; the local copy is live (called :250), the file already imports `readRegistry` from the same module (:93), and the sibling inline-object-wire-name-rename-live-cell.test.ts:62/:74-75 imports `registryFragment` as claimed (9 importers repo-wide); the registry-oracle.ts header's "assertion style and wording vary per file stays local" carve-out does not bind to a wording-identical copy (same ruling as PTQ-1053/PTQ-1068), and PTQ-0776's "stays local" remark predates the export landing in e3546327; stated searches reproduce (docs/bugs `function registryFragment` 0, coverage-matrix 0), not a gate file, no recording double, no it()/describe() change proposed, all locations under tests/ — D7 boilerplate-duplication class; not a duplicate: the only filings naming this file are PTQ-0495/PTQ-0807 (the offline sibling tests/index-sentinel-typeenv-case-fence.test.ts) and PTQ-0776 (this file's REGISTRY read, expressly excluding the fragment function), and PTQ-0562/1053/1068 list other files (triage: claude-fable-5-1)
