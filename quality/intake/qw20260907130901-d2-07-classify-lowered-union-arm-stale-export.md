---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: classifyLoweredUnionArm's export and its doc rationale name an importer (body-type-lowering.ts) that stopped importing it at the bug-0097 fix
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/params.ts:985-999
  - src/parser/body-type-lowering.ts:15-24
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# classifyLoweredUnionArm's export and its doc rationale name an importer (body-type-lowering.ts) that stopped importing it at the bug-0097 fix

## Observation
`classifyLoweredUnionArm` is exported with a doc comment whose entire rationale
is that `lowerTypeSource` (body-type-lowering.ts) must reach the same
union-arm verdict. body-type-lowering.ts does not import it: its per-arm
dispatch moved into `lowerBraceGroupUnionArms` (params.ts), which calls
`classifyLoweredUnionArm` internally, so the shared-verdict guarantee now flows
through that shared function instead of through this export. No file in src/,
extensions/, tools/, or tests/ imports `classifyLoweredUnionArm`; its only
caller is same-file (params.ts:1754).

## Evidence
src/parser/params.ts:985-999 — the export and the stale rationale:

```ts
 * Exported because `lowerTypeSource` (body-type-lowering.ts) dispatches a
 * union's arms one at a time — an inline-object arm hoists where the others go
 * to `lowerTypeExpr` (bug 0039 §Fix part B) — and must then reach the SAME
 * verdict `lowerTypeExpr`'s own union branch reaches for the same fragment.
 * Two classifications that disagreed would lower one source to
 * `{"type": [...]}` at one type position and `{"anyOf": [...]}` at another,
 * against type-system.md's one-grammar-everywhere rule. `PRIMITIVE_TYPES` is
 * the single set both read.
 */
export function classifyLoweredUnionArm(lowered: Record<string, unknown>): LoweredUnionArm {
```

src/parser/body-type-lowering.ts:15-24 — the named importer's actual import
list from params.ts (no `classifyLoweredUnionArm`):

```ts
import {
  hoistInlineObjectType,
  isSingleEnclosingBraceGroup,
  lowerBraceGroupUnionArms,
  lowerLiteralSublanguage,
  lowerTypeExpr,
  splitTopLevel,
  topLevelColon,
  type LowerCtx,
} from "./params";
```

Reference census: grep `classifyLoweredUnionArm` across src/, extensions/,
tools/, tests/ — definition (params.ts:999), one same-file call
(params.ts:1754, inside `lowerBraceGroupUnionArms`), and two test COMMENT
mentions (tests/params-literal-sublanguage-lowering.test.ts:27,1116 — prose
only, no import). Git shows the import the rationale describes was removed by
the very fix that created the shared path: `git show ad27694f`
("fix(bug-0097): ask the params: dispatch the structural brace question and
give it the arm path") deletes `classifyLoweredUnionArm,` from
body-type-lowering.ts's import list and moves the per-arm classification into
`lowerBraceGroupUnionArms`.

## Why this is a problem
Dead export plus historical narration: the `export` modifier reaches nothing —
zero importers anywhere, including tests — and the comment justifying it
describes an import relationship that commit `ad27694f` (bug 0097) removed.
The one-verdict property the comment worries about is now upheld by both
positions calling the same `lowerBraceGroupUnionArms`, so the export serves no
current mechanism and the rationale misleads a reader about who consumes the
function.

## Suggested direction (non-binding, optional)
Make the function module-private and rewrite the doc paragraph to describe the
current sharing route (both positions reach the classification through
`lowerBraceGroupUnionArms`).

## False-positive check
- Import census: grep `classifyLoweredUnionArm` over src/, extensions/, tools/,
  tests/ — no import statement anywhere; the only call is same-file
  (params.ts:1754); test hits are comments (no test imports or calls it, so the
  witness-test carve-out does not attach to the EXPORT).
- Re-export check: body-type-lowering.ts re-exports only
  `isSingleEnclosingBraceGroup` (its :36 `export {` statement); grep
  `export .* from ".*params"` — no barrel re-exports this name.
- String-keyed/dynamic access: grep `"classifyLoweredUnionArm"` — 0 hits
  outside the prose comments cited.
- Anchor-gate check: no source-anchor test asserts the `export function
  classifyLoweredUnionArm` line (grep for that literal over tests/ — 0 hits);
  the citation gates that read params.ts as text
  (tests/citation-symbol-form-gate.test.ts) scan citation FORMAT, not this
  symbol.
- Declaration-build check: the function's return type `LoweredUnionArm` is
  imported from schema-lowering.ts and is independently exported there, so
  un-exporting this function breaks no `declaration: true` surface.
- Git-history intent: `git log -S classifyLoweredUnionArm --
  src/parser/body-type-lowering.ts` → `52e257bc` (bug 0039, added the import)
  and `ad27694f` (bug 0097, removed it); params.ts's doc paragraph predates the
  removal and was not updated by it.

## Triage
