---
id: PTQ-1068
title: inline-object-wire-name-rename-live-cell.test.ts reimplements registry-oracle's registryFragment as a local single-placeholder renamedInlineFragment despite a sibling in-scope file importing registryFragment directly
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/live/inline-object-wire-name-rename-live-cell.test.ts:76-86
  - tests/helpers/registry-oracle.ts:121-136
  - tests/live/fn-param-sink-array-literal-live-cell.test.ts:63
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inline-object-wire-name-rename-live-cell.test.ts reimplements registry-oracle's registryFragment as a local single-placeholder renamedInlineFragment despite a sibling in-scope file importing registryFragment directly

## Observation
`tests/live/inline-object-wire-name-rename-live-cell.test.ts` imports
`readRegistry` from `tests/helpers/registry-oracle.ts` but declares its own
local `renamedInlineFragment` function to read a registry row's *Message*
template, guard its presence, and substitute one placeholder — the identical
shape `tests/helpers/registry-oracle.ts` already exports as `registryFragment`.
`tests/live/fn-param-sink-array-literal-live-cell.test.ts`, a sibling file in
this same review's scope, imports and calls `registryFragment` from the same
module directly.

## Evidence

`tests/helpers/registry-oracle.ts:121-136` (the canonical, already-exported
general form):
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

`tests/live/fn-param-sink-array-literal-live-cell.test.ts:63` (the sibling
in-scope file importing it directly):
```ts
import { registryFragment } from "../helpers/registry-oracle";
```

`tests/live/inline-object-wire-name-rename-live-cell.test.ts:76-86` (the
local reimplementation, re-read immediately before filing):
```ts
function renamedInlineFragment(field: string): string {
  const template = registryMessage(REGISTRY, RENAMED_INLINE) as string | undefined;
  expect(
    template,
    `${RENAMED_INLINE} has no registry row -- the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${RENAMED_INLINE}: ${(template as string).replace("<field>", field)}`;
}
```

This file imports `readRegistry` (line 63 of this file) from
`../helpers/registry-oracle` but never `registryFragment`, and instead reads
the underlying `registryMessage` primitive directly via a separate
`// @ts-expect-error` import of `tools/code-registry/index.js` to hand-roll
the same guard-then-substitute sequence `registryFragment` already performs.

## Why this is a problem
`registryFragment(code, substitutions)` already does exactly what
`renamedInlineFragment(field)` does — read the template, guard its presence
with the same `${code} has no registry row … (DIAG-2)` message shape, and
substitute a named placeholder into the `${code}: ${message}` return — for
any code and any set of placeholders, including this file's single-code,
single-placeholder case (`registryFragment(RENAMED_INLINE, { field })` would
produce the identical string). This file's own directory already
demonstrates the canonical import is reachable and used (`fn-param-sink-
array-literal-live-cell.test.ts:63`), so the reimplementation here is not a
missing capability but a bypassed one. The local copy also drops
`registryFragment`'s trailing "no unsubstituted placeholder remains" guard,
so a future registry-row shape change that leaves a second `<...>` slot
unfilled would go unnoticed here where the canonical helper would catch it.

## Suggested direction (non-binding, optional)
Calling `registryFragment(RENAMED_INLINE, { field })` in place of
`renamedInlineFragment(field)` removes the local restatement and restores the
leftover-placeholder guard the canonical helper carries; `readRegistry(["parse"])`
already reads the same registry page `registryFragment`'s own `PARSE_REGISTRY`
constant is built from.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or a named gate kin.
- Recording-double check: both `registryFragment` and `renamedInlineFragment`
  render a static message string from a parsed registry row; neither backs a
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "renamedInlineFragment\|registryFragment" docs/bugs/*.md`
  → 0 hits; the file's own governing bug (0160, status fixed) states no
  rationale for a local, narrower reimplementation.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-wire-name-rename-live-cell" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no change to any `it()`/`describe()` name,
  count, or assertion — only that the local renderer could call the
  already-imported-elsewhere canonical one — so the citation carve-out does
  not bind.
- Prior-filing overlap check: `grep -rl "renamedInlineFragment" quality/intake/*.md quality/issues/*.md quality/resolved/*.md`
  → 0 hits. `quality/issues/PTQ-0765-registry-descriptor-fragment-helper-duplicated.md`
  and `quality/intake/qw20260918202006-d7-02-registry-oracle-four-render-idioms.md`
  cover other files/other internal renderers (discovery-cli-override-prefix-
  missing-source / discovery-entry-lstat-failure live cells, and
  `registry-oracle.ts`'s own internal four-idiom duplication respectively);
  neither names this file or `renamedInlineFragment`.
- Coverage check: the claim is entirely about a repeated helper-function
  DEFINITION bypassing an already-imported-elsewhere canonical helper, not a
  missing test path; the copy is exercised by this file's own test.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: confirmed — independently re-verified: `renamedInlineFragment` at tests/live/inline-object-wire-name-rename-live-cell.test.ts:79-86 is live (called :246) and is a single-code, single-placeholder specialisation of the exported `registryFragment` (tests/helpers/registry-oracle.ts:121-136, 8 live-cell importers incl. fn-param-sink-array-literal-live-cell.test.ts:63); the registry row's Message (`code-registry-parse.md:107`) carries exactly one `<field>` slot so `replaceAll`≡`replace`, the trailing no-leftover guard passes, and `registryFragment(RENAMED_INLINE, { field })` yields the byte-identical string; the DIAG-2 wording differs only `--` vs `—`, so registry-oracle.ts:8-9's "wording varies per file stays local" carve-out does not bind; stated searches reproduce (docs/bugs 0, coverage-matrix 0, prior `renamedInlineFragment` filings 0); not a duplicate — PTQ-0500 migrated only this file's `REGISTRY` read, PTQ-0562 exported `registryFragment` from three OTHER files' copies, PTQ-0765/0776/0768 and intake d7-02/12/13 cite other files or helpers; one correction for the fixer: `sites: 1` undercounts — the byte-identical function (mktemp diff empty) is also declared at tests/live/escaped-quote-inline-rename-live-cell.test.ts:82-89 (called :218, this wave's shard-24, untracked), so both copies should be folded into the one `registryFragment(RENAMED_INLINE, { field })` swap (triage: claude-fable-5-1)
