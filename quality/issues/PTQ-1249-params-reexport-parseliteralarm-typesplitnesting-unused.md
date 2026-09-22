---
id: PTQ-1249
title: params.ts re-exports parseLiteralArm and TypeSplitNesting from type-text-split with no importer through that path
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/params.ts:70-77
sites: 1
fix_scope: localized
wave: qw20260922150013
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# params.ts re-exports parseLiteralArm and TypeSplitNesting from type-text-split with no importer through that path

## Observation
`params.ts` imports six names from `./type-text-split` and then re-exports
seven names (five of the six imported, plus `splitTopLevelSegments` which is
not imported) from the same module. Two of the re-exported names —
`parseLiteralArm` and `TypeSplitNesting` — have no importer anywhere that
reaches them through `./params`; every other name in the same re-export block
(`isSingleEnclosingBraceGroup`, `isUnspellableTextRefusable`, `splitTopLevel`,
`splitTopLevelSegments`, `topLevelColon`) is imported through `./params` by
other production modules (`annotation-validation.ts`, `system-param-types.ts`,
`structural-checks.ts`, `body-parser.ts`, `type-walk.ts`) or by tests.

## Evidence
`src/parser/params.ts:60-77`:
```ts
import {
  hasUnterminatedStringLiteral,
  isBraceBalanced,
  isSingleEnclosingBraceGroup,
  isUnspellableTextRefusable,
  parseLiteralArm,
  skipQuotedRegion,
  splitTopLevel,
  topLevelColon,
} from "./type-text-split";
export {
  isSingleEnclosingBraceGroup,
  isUnspellableTextRefusable,
  parseLiteralArm,
  splitTopLevel,
  splitTopLevelSegments,
  topLevelColon,
  type TypeSplitNesting,
} from "./type-text-split";
```

`parseLiteralArm` is used internally inside `params.ts` itself (e.g.
`src/parser/params.ts:1028`: `return arms.some((arm) => parseLiteralArm(arm) === undefined);`
and `:1649`, `:1658`), so the *function* is alive — but only via the module's
own internal `import`, not via the re-export line at :73. Search for any
`import` statement naming `parseLiteralArm` or `TypeSplitNesting` across
`src/`, `tests/`, `extensions/`, `tools/`:
`grep -rn "import.*parseLiteralArm\|import.*TypeSplitNesting" --include=*.ts .`
returns zero hits. Every other mention of `parseLiteralArm` in the tree
(`tests/b0284-non-identifier-applied-generic-head.test.ts:77`,
`tests/generic-argument-literal-lowering.test.ts` (multiple lines),
`tests/union-arm-literal-const-lowering.test.ts` (multiple lines), etc.) is
prose inside a comment or an assertion-message string, not a live import.
`TypeSplitNesting` appears only at its own declaration
(`src/parser/type-text-split.ts:362`), its two internal default-parameter
uses in that same file (`:382`, `:449`), the re-export line
(`src/parser/params.ts:77`), and one comment
(`src/parser/annotation-validation.ts:169`) — never in an import list.

## Why this is a problem
The re-export statement makes both names part of `params.ts`'s public surface,
but no current caller reaches either through that surface: `parseLiteralArm`
is consumed only via `params.ts`'s own internal import from
`type-text-split.ts`, and `TypeSplitNesting` has no consumer at all outside
its declaring file. The re-export line therefore carries two dead export
paths inside an otherwise-live re-export block (the other five names in the
same statement do have real importers through `./params`).

## Suggested direction (non-binding, optional)
Dropping `parseLiteralArm` and `TypeSplitNesting` from the re-export list would leave every existing import (both of `params.ts`'s other re-exports and of `type-text-split.ts` directly) unaffected.

## False-positive check
Ran `grep -rn "import.*parseLiteralArm\|import.*TypeSplitNesting"` and separately `grep -rn "parseLiteralArm\|TypeSplitNesting"` (without the import filter) across `src/`, `tests/`, `extensions/`, `tools/`, excluding `dist/`: every non-import hit is a comment or a test assertion-message string naming the function/type in prose, not code that imports or references the exported binding. Confirmed `parseLiteralArm` remains alive as a function via `params.ts`'s own internal import from `type-text-split.ts` (used at params.ts:1028, 1649, 1658) — only the *re-export* path is unreached, not the underlying declaration. Confirmed `TypeSplitNesting` has zero import sites anywhere, live only as a default-parameter type annotation inside `type-text-split.ts` itself.

## Triage
verdict: confirmed — excerpt matches params.ts:60-77 byte-for-byte; independent reference hunt across src/, tests/, extensions/, tools/ finds zero importers of `parseLiteralArm` or `TypeSplitNesting` through `./params` (no named import, no `* as` namespace import of params, no `export *` chain, no string-keyed access — every other mention is prose in comments/assertion strings or docs/bugs), while the block's other five names have 4/3/9/3/5 importing files via `./params`; the block was introduced wholesale by the PTQ-1149 D9 split (ac4e7697) with no header comment declaring a compat facade, `parseLiteralArm` stays live through params.ts's own import (:1028, :1649, :1658) so only the two re-export paths are dead; not tracked by any existing PTQ (PTQ-0406 is a different symbol/file) (triage: claude-fable-5-1)
