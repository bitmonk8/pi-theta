---
id: PTQ-0270
title: construct-token-table-tails.test.ts copies category1-clause-oracle.ts's isTableRow/isSeparatorRow predicates verbatim instead of sharing them
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/construct-token-table-tails.test.ts:294-300
  - tests/helpers/category1-clause-oracle.ts:96-102
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# construct-token-table-tails.test.ts copies category1-clause-oracle.ts's isTableRow/isSeparatorRow predicates verbatim instead of sharing them

## Observation
tests/construct-token-table-tails.test.ts's own header comment states, twice,
that its heading-anchored, line-number-free markdown-table-reading technique
"is `tests/helpers/category1-clause-oracle.ts`'s, applied to §3 instead of
§1." Despite naming that module as the technique's source, the file defines
its own `isTableRow`/`isSeparatorRow` predicate pair rather than drawing them
from it. The two functions are byte-identical, line for line, to the
same-named (module-private, not currently exported) functions already present
in `tests/helpers/category1-clause-oracle.ts`.

## Evidence
tests/construct-token-table-tails.test.ts:51-57 — the header comment naming
the helper as the technique's source:
```ts
// Offline, deterministic, provider-free: `parseDoc` (tests/helpers/e2e-s1.ts)
// wraps the shipped `parseThetaDocument` with inert seams, and the two corpus
// reads are `readFileSync` of committed pages. Nothing under assertion is
// stubbed. The heading-anchored, line-number-free table-reading technique is
// tests/helpers/category1-clause-oracle.ts's, applied to §3 instead of §1; the
// cell layout follows the sibling filing's oracle
// tests/grammar-trailing-trigger-equals.test.ts.
```

tests/construct-token-table-tails.test.ts:246-251 — the second reference, at
the point of use:
```ts
// ===========================================================================
// The §3 table reader. Heading-region-scoped and line-number-free, so the page
// may grow above or below §3 without moving this cell's referent. The
// technique is `readAdmittedStandInTokens`
// (tests/helpers/category1-clause-oracle.ts), scoped to category 3.
// ===========================================================================
```

tests/construct-token-table-tails.test.ts:294-300 — the reviewed file's own
predicates:
```ts
function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

function isSeparatorRow(line: string): boolean {
  return isTableRow(line) && /^\|[\s:|-]+\|?\s*$/.test(line.trim());
}
```

tests/helpers/category1-clause-oracle.ts:96-102 — the named helper's own
predicates, byte-identical:
```ts
function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

function isSeparatorRow(line: string): boolean {
  return isTableRow(line) && /^\|[\s:|-]+\|?\s*$/.test(line.trim());
}
```

Search: `grep -rln "function isTableRow\|function isSeparatorRow" tests
--include="*.ts"` returns exactly these two files and no others.

## Why this is a problem
The reviewed file's own commentary identifies `tests/helpers/category1-clause-oracle.ts`
as the origin of the table-reading technique it applies to a different
section of the same spec page, so the duplication is not an independent
convergence on the same idea — the author was pointing at the specific
sibling file while writing the copy. `isTableRow`/`isSeparatorRow` are pure,
input-only string predicates with no per-file-specific behaviour (unlike the
surrounding `category3Lines`/`readConstructTable` functions, which must differ
because §1's and §3's tables have different header cells and different row
shapes); nothing about scoring a different heading or a different column
layout requires a second copy of these two particular functions. Both are
module-private in `tests/helpers/category1-clause-oracle.ts` today, so the
reviewed file could not literally `import` them without that module widening
its exports first — but the identical logic sitting in the very file the
reviewed file's own comments name is the observation, not a claim that an
import was mechanically available.

## Suggested direction (non-binding, optional)
The two-function predicate pair (`isTableRow`/`isSeparatorRow`) is
table-shape-independent; `tests/helpers/category1-clause-oracle.ts` is
already the file the reviewed file's own comments point to as their source,
and a shared home for just these two predicates would not need to touch
either file's table-shape-specific reading logic.

## False-positive check
- Gate-pin check: `tests/construct-token-table-tails.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; the cited lines are pure string
  predicates, not a pinned count or inventory.
- Recording-double check: `isTableRow`/`isSeparatorRow` evaluate static
  markdown lines already read into memory; they record no calls and back no
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "Status:" docs/bugs/0063-two-unsupported-feature-tails-missing-from-construct-table.md`
  → "Status: fixed (0.233.0)"; `npx vitest run tests/construct-token-table-tails.test.ts`
  reproduces 10/10 passing at HEAD (reverified during this review), so this
  is not a documented correct-reason red. Nothing in bug 0063 or bug 0285
  (the other document citing this file, at lines 392/487/549 for the tail
  string and the gate itself, not the table-reader predicates) states a
  rationale for a second copy of these two functions.
- coverage-matrix/bug-doc citation search: `grep -n "construct-token-table-tails"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any test — only that two already-named,
  already-duplicated pure predicates could be shared — so no witness-list
  citation is disturbed.
- git history: `tests/helpers/category1-clause-oracle.ts` was committed
  2026-08-23T12:24:26+02:00 (bug 0247's fix); `tests/construct-token-table-tails.test.ts`
  was committed the same day at 2026-08-23T13:38:52+02:00 — about 74 minutes
  later. The helper existed, and is named by the reviewed file's own header,
  before the reviewed file's predicates were written.

## Triage
verdict: confirmed — all four excerpts byte-match at cited lines (isTableRow/isSeparatorRow identical in both files), `grep -rln "function isTableRow\|function isSeparatorRow" tests --include="*.ts"` reproduces exactly these 2 files and no others, both functions are confirmed module-private (unexported) in category1-clause-oracle.ts, git log confirms the helper (2026-08-23T12:24:26+02:00) predates the copy (2026-08-23T13:38:52+02:00) by 74 minutes, docs/bugs/0063 is fixed with 10/10 vitest passing and bug 0285's citations of this file (lines 392/487/549) are unrelated to these predicates, coverage-matrix.md has 0 hits, and the reviewed file is not a gate/kin file — a genuine D7 boilerplate-duplication class finding, distinct from sibling candidate qw20260912112713-d7-03 (different helper, disjoint lines), no matching PTQ or rejection in the ledger (triage: claude-opus-5)
