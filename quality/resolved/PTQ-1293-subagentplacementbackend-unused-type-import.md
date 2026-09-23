---
id: PTQ-1293
title: SubagentPlacementBackend type import is never referenced in production-composition.ts
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-composition.ts:93-96
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# SubagentPlacementBackend type import is never referenced in production-composition.ts

## Observation
`production-composition.ts` imports the type `SubagentPlacementBackend` alongside `createPipePlacementBackend` from `../runtime/subagent-placement`, but no declaration, parameter, return-type annotation, or generic argument anywhere in the file's 4759 lines names `SubagentPlacementBackend`. The only use of the sibling value import, `createPipePlacementBackend`, assigns its return value to an un-annotated `const pipePlacement` (line 1746), so the type is never even implicitly surfaced through a local annotation.

## Evidence
`src/extension/production-composition.ts:93-96`:
```ts
import {
  createPipePlacementBackend,
  type SubagentPlacementBackend,
} from "../runtime/subagent-placement";
```

`src/extension/production-composition.ts:1746`:
```ts
  const pipePlacement = createPipePlacementBackend(createProductionSpawnFn());
```

Search performed: `grep -n "SubagentPlacementBackend" src/extension/production-composition.ts` returns only the import line (line 95) — zero other occurrences in the file.

## Why this is a problem
The name is imported but has no reader anywhere in the module; nothing in the file's type positions, generics, or annotations cites it, so the import binding itself is dead in this file (the declaration `SubagentPlacementBackend` remains alive and exported from `../runtime/subagent-placement`, which is unaffected).

## Suggested direction (non-binding, optional)
Drop the unused `type SubagentPlacementBackend` import from the `../runtime/subagent-placement` import list, keeping `createPipePlacementBackend`.

## False-positive check
- `grep -n "SubagentPlacementBackend" src/extension/production-composition.ts` — only the import line (95) matches; no usage in a type position, generic, or annotation.
- Checked whether `pipePlacement`'s declaration or any downstream site carries an explicit `: SubagentPlacementBackend` annotation — it does not (line 1746, plain `const`, no type annotation; consumers at 1764/1781 just reference the variable).
- Checked git history (`git log -p -S"SubagentPlacementBackend" -- src/extension/production-composition.ts`): the import was added in commit 4ec891b9 (RFC 0012 step 5) alongside `createPipePlacementBackend`'s own import and has not been referenced since; no later commit added a use.
- This is a same-file unused import, not a cross-module reachability question, so no tests/ or dynamic-access search was needed for the deadness claim; the underlying declaration in `../runtime/subagent-placement.ts` remains exported and used by other functions in that module (`placementIsVisible`, `placementInheritsEnv`, `isPipePlacement`, etc.), so this finding is scoped to the import binding in this file only.

## Triage
verdict: confirmed — excerpts reproduce at production-composition.ts:93-96 and :1746; `grep -n SubagentPlacementBackend` in the file hits only the import (line 95); `npx tsc --noEmit --noUnusedLocals` independently reports `production-composition.ts(95,8): error TS6133: 'SubagentPlacementBackend' is declared but its value is never read`; `pipePlacement` is un-annotated; the type's other consumers (subagent-exec-placement, subagent-launcher, subagent-place, tests/) import it themselves so the declaration stays live and only this file's binding is dead; no existing PTQ tracks this import (PTQ-1247 covers production-theta-producer, a different file); D2 in-scope, mechanical anchor, one root cause (triage: claude-fable-5-1)
