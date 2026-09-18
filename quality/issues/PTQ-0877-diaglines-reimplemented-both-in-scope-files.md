---
id: PTQ-0877
title: Both in-scope files redeclare e2e-s1's exported diagLines(doc) instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-type-source-capture.test.ts:15,350-352
  - tests/inline-object-wire-name-rename-refusal.test.ts:14,362-364
  - tests/helpers/e2e-s1.ts:123-126
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Both in-scope files redeclare e2e-s1's exported diagLines(doc) instead of importing it

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
rendering every diagnostic as `` `${severity} ${code}: ${message}` ``. Both
in-scope files already import `parseDoc` from that exact module
(`./helpers/e2e-s1`), but neither imports `diagLines`; each instead declares
its own module-local function of the identical name with a
statement-for-statement identical one-line body over the same
`doc.diagnostics` projection.

## Evidence

`tests/helpers/e2e-s1.ts:123-126` (the canonical, already-exported helper):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/inline-object-type-source-capture.test.ts:15` (the import that stops
short of `diagLines`) and `:350-352` (the local shadow, re-read immediately
before filing):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/inline-object-wire-name-rename-refusal.test.ts:14` and `:362-364` —
byte-identical local shadow:
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

Exact check: `diff <(sed -n '350,352p' tests/inline-object-type-source-capture.test.ts) <(sed -n '362,364p' tests/inline-object-wire-name-rename-refusal.test.ts)` produces zero differences; `diff <(sed -n '350,352p' tests/inline-object-type-source-capture.test.ts) <(sed -n '124,126p' tests/helpers/e2e-s1.ts)` also produces zero differences on the function body (only the `export` keyword and the doc comment differ). `grep -n "diagLines" tests/inline-object-type-source-capture.test.ts tests/inline-object-wire-name-rename-refusal.test.ts` shows each local `diagLines` is called from that file's own `lines()` wrapper (`:355` and `:367` respectively) and, in the first file, once more directly at `:971`.

## Why this is a problem
The function body each file declares is not merely similar to the exported
helper — it is the identical projection (`.map((d) => \`${d.severity} ${d.code}: ${d.message}\`)`)
over the identical input type (`ThetaDocument`), and both files already
import a sibling export (`parseDoc`) from the exact module that also exports
`diagLines`. A change to the diagnostic-line rendering convention (e.g.
adding a source-path prefix, or changing the separator) would need the
identical edit applied by hand in the shared helper and in each of these two
local shadows to stay in sync, and nothing signals the drift if one copy is
missed.

## Suggested direction (non-binding, optional)
Importing `diagLines` from `./helpers/e2e-s1` alongside the already-imported
`parseDoc` removes both local shadows; the fix stage owns whether the
per-file `lines()` wrapper is adjusted in the same pass.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin
  patterns (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `diagLines` is a pure projection over an
  already-produced diagnostics array; it records no calls and backs no
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "diagLines" docs/bugs/0228-*.md
  docs/bugs/0160-*.md` returns no hits — neither bug document states a
  rationale for shadowing the already-exported helper locally.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-type-source-capture\|inline-object-wire-name-rename-refusal"
  docs/reference/coverage-matrix.md` returns no hits. Both files are cited by
  name in their respective bug documents as fix witnesses, always for the
  diagnostic-emission cells under test, never for where the `diagLines`
  helper's own code lives; this finding proposes no merge, rename, or
  deletion of either file or any `it()`/`describe()` block — only that the
  local shadow could be replaced by the already-imported-adjacent export.
- Coverage check: the claim is about a repeated helper-function DEFINITION
  shadowing an existing export, not a missing test path; both local copies
  are exercised by every `it()` in their own file that calls `lines()` today.
- Prior-filing overlap check: `grep -rl "diagLines" quality/intake/*.md
  quality/issues/*.md` (before this filing) found three same-wave sibling
  filings naming this exact root cause
  (`qw20260918050411-d7-01-diaglines-reimplemented-both-in-scope-files.md`,
  `qw20260918050411-d7-01-diaglines-reimplemented-generic-argument-rules.md`,
  `qw20260918050411-d7-01-diaglines-reimplemented-inline-object-empty-pair.md`)
  against four disjoint files
  (`brace-and-angle-annotation-junk-refusal.test.ts`,
  `brace-rooted-union-arm-capture.test.ts`,
  `generic-argument-inline-field-key-rules.test.ts`,
  `inline-object-empty-entry-slot-refusal.test.ts`,
  `inline-object-empty-field-type-truncation.test.ts`), and PTQ-0596's triage
  note references PTQ-0205 as "the diagLines/diagCodes half, since fixed" for
  a different, disjoint file set (the `generic-argument-*` /
  `brace-and-angle-*` trio it covers); none of these names either file in
  this filing's location list, so this is a new, previously unfiled pair of
  sites of the same already-recognised recurring class, not a re-file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: tests/helpers/e2e-s1.ts:124-126 exports `diagLines(doc)` and both tests/inline-object-type-source-capture.test.ts:15,350-352 and tests/inline-object-wire-name-rename-refusal.test.ts:14,362-364 import `parseDoc` from that module yet declare a byte-identical local `diagLines` (called via `lines()` at :355/:367 and directly at :971), both copies live, both under tests/, D7 boilerplate-duplication class; stated searches reproduce (docs/bugs 0228/0160 `diagLines` → 0, coverage-matrix file cite → 0), not gate files, no recording-double or red-test carve-out; the prior diagLines issues (PTQ-0591, 0732, 0733, 0770) and the same-wave d7-01/d7-02/d7-08 diagLines siblings all name disjoint file sets and none cites either of these two files, and since the helper is already exported the fix is per-file (import instead of shadow) so this is a new pair of sites, not a duplicate — accepted on the same footing PTQ-0732/0733 were (triage: claude-fable-5-1)
