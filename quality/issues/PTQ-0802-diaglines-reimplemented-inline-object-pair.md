---
id: PTQ-0802
title: Both in-scope files redeclare diagLines() byte-for-byte instead of importing the export tests/helpers/e2e-s1.ts already carries
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/e2e-s1.ts:123-126
  - tests/inline-object-malformed-entry-resync.test.ts:303-306
  - tests/inline-object-nested-lowering.test.ts:499-502
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Both in-scope files redeclare diagLines() byte-for-byte instead of importing the export tests/helpers/e2e-s1.ts already carries

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
rendering every diagnostic as `` `${severity} ${code}: ${message}` `` in
emission order. Both files in this review's scope already import `parseDoc`
from that same module, yet each independently declares a private, top-level
`diagLines` function with the identical one-line body and the identical doc
comment rather than importing the export.

## Evidence

`tests/helpers/e2e-s1.ts:123-126` (re-read immediately before filing):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/inline-object-malformed-entry-resync.test.ts:303-306` (re-read
immediately before filing) — same doc comment, same body but for an added
explicit `Diagnostic` parameter type:
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/inline-object-nested-lowering.test.ts:499-502` (re-read immediately
before filing) — doc comment and body byte-identical to the canonical export:
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

Both files' import lines already read from the same module:
`tests/inline-object-malformed-entry-resync.test.ts:9` —
`import { parseDoc, isLoadParseError } from "./helpers/e2e-s1";`, and
`tests/inline-object-nested-lowering.test.ts:24` —
`import { parseDoc } from "./helpers/e2e-s1";`. Neither import list names
`diagLines`.

## Why this is a problem
The exact function both files need — the same parameter type, the same
return type, the same rendering — is already an exported member of the
module both files import from. Each file restates the function locally
instead of adding one name to an existing import, so a future change to the
canonical `diagLines` rendering (for example, adding a source-location
segment) would silently not apply to either copy.

## Suggested direction (non-binding, optional)
Adding `diagLines` to each file's existing `./helpers/e2e-s1` import and
deleting the local declaration would remove both copies; `tests/helpers/e2e-s1.ts`
is already the natural home, since both files already import other members
from it.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited
  lines are a rendering helper, not a pinned count or inventory.
- Recording-double check: `diagLines` maps an already-produced diagnostics
  array to strings; it records no calls and backs no "never called" witness,
  so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "diagLines" docs/bugs/0231*.md
  docs/bugs/0039*.md` → 0 hits; neither bug doc these two files witness states
  a rationale for re-deriving this rendering function locally rather than
  importing it.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-malformed-entry-resync\|inline-object-nested-lowering"
  docs/reference/coverage-matrix.md` → 0 hits. docs/bugs/0231 and docs/bugs/0039
  cite these two files by name and by cell/group id, never by `diagLines`'s
  internal implementation; this finding proposes no change to any
  `it()`/`describe()` name, count, or assertion — only to where the rendering
  function is imported from.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; both local copies are exercised throughout each file.
- Overlap check: `grep -rl "inline-object-malformed-entry-resync\|inline-object-nested-lowering" quality/issues quality/intake quality/resolved`
  found PTQ-0555, PTQ-0596, PTQ-0574, PTQ-0653, PTQ-0691, PTQ-0753 and
  qw20260918050411-d7-01-canonical-slug-oracle-reimplemented-inline.md; none
  of these names `diagLines` — PTQ-0555/0596 cover the `FM`/`theta()`/
  `paramsSrc()`/`Cell`/`expectGroup` builders, PTQ-0574 covers `schemaDeclsOf`,
  PTQ-0653 covers `TRIAGE_DEF`/`BODY`, PTQ-0691 covers `loweredAnnotation`,
  and PTQ-0753 covers `registers`/`isLoadParseError` — so this is a distinct,
  previously untracked root cause.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: tests/helpers/e2e-s1.ts:123-126 exports diagLines(doc) exactly as excerpted, and both local copies reproduce at the cited lines (inline-object-malformed-entry-resync.test.ts:303-306 identical bar an explicit `(d: Diagnostic)` annotation, live via `lines()` at :309; inline-object-nested-lowering.test.ts:499-502 byte-identical, live at 19 call sites) while each file's sole ./helpers/e2e-s1 import (:9 / :24) omits diagLines; stated searches reproduce (docs/bugs/0231*/0039* diagLines → 0, coverage-matrix file cites → 0), neither file is a gate test and no recording-double/red-test carve-out applies; not a duplicate — PTQ-0205's fix commit 2594cd44 touched neither file (both predate the export: created 2026-08-01 / 2026-08-22), none of the open diagLines PTQs (0591/0732/0733/0770) nor any same-wave diagLines sibling intake cites these two files, so this is an untracked residual per the store's per-file convention; genuine D7 boilerplate duplication with a mechanical import-and-delete fix (triage: claude-fable-5-1)
