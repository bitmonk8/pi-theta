---
id: PTQ-0151
title: depth-walk's header names V15j and V4e among the site-owner leaves that "consult this seam", but neither calls into the module
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/runtime/depth-walk.ts:11-17
  - src/runtime/invoke-ceiling-depth.ts:51-52
  - src/runtime/invoke-ceiling-depth.ts:131-139
  - src/extension/load-pre-eval.ts:42-46
  - src/runtime/depth-walk.ts:218-228
sites: 4
fix_scope: module
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# depth-walk's header names V15j and V4e among the site-owner leaves that "consult this seam", but neither calls into the module

## Observation
`depth-walk.ts`'s header states that the live AJV-boundary sites "are built
downstream by the site-owner leaves (`V13c`, `V14e`, `V15j`, `V4e`) that consult
this seam". Two of the four named leaves do not consult it. `V15j`
(`invoke-ceiling-depth.ts`) imports one *type* from this module and runs
`wireFormDepthWalk` from a different module instead. `V4e`
(`load-pre-eval.ts`) has a single import — the system-note channel — and
references the depth walk only in a comment saying it runs elsewhere; the
slash-load `params` walk it is named for lives in `V11f`
(`src/binder/retry-taxonomy.ts`) and `V11g` (`src/binder/defaulting.ts`).
`routeDepthBoundary`, the second of the two seams the same paragraph is
introducing, has no caller anywhere in `src/`.

## Evidence
src/runtime/depth-walk.ts:11-17 — the roster:

```ts
// This module owns two pure, stateless Class-2 seams — categorically like
// `V16a`'s cross-ceiling arbitration seam: the decision is exercised directly
// in isolation and the *live* AJV-boundary sites (typed-query response,
// model-driven / code-driven tool args, `params`, `invoke<T>` return) are built
// downstream by the site-owner leaves (`V13c`, `V14e`, `V15j`, `V4e`) that
// consult this seam. The seam runs no AJV, receives no events, and owns none of
// the per-boundary carriers:
```

src/runtime/invoke-ceiling-depth.ts:51-52 — `V15j`'s imports: a type from this
module, and the walk it actually runs from another:

```ts
import type { DepthViolationIssue } from "./depth-walk";
import { wireFormDepthWalk } from "./wire-form-depth-walk";
```

src/runtime/invoke-ceiling-depth.ts:131-139 — `V15j`'s shared enforcement,
calling `wireFormDepthWalk`, not `depthWalk`:

```ts
function enforceInvokeDepth(
  calleePath: string,
  value: unknown,
  cause: "validation" | "return_validation",
): InvokeDepthBreach | undefined {
  const walk = wireFormDepthWalk(value);
  if (walk.ok) {
    return undefined;
  }
```

src/extension/load-pre-eval.ts:42-46 — `V4e`'s complete import list; nothing
from `depth-walk`:

```ts
import {
  sendSystemNote,
  type SystemNote,
  type SystemNoteChannelDeps,
} from "./system-note-channel";
```

`grep -n "depth\|Depth" src/extension/load-pre-eval.ts` → one hit, a comment
at :26-27 stating "ceiling #4's depth walk runs at the post-default-merge AJV
validation hook over the merged `args` (`binder/defaulting.ts`)" — i.e. not in
this file. The two production sites that do run the
slash-load `params` walk are `src/binder/defaulting.ts:154` (`const depth =
depthWalk(merged);`, header `V11g`) and `src/binder/retry-taxonomy.ts:45`
(importing `DepthViolationIssue` / `DepthWalkResult`, header `V11f`);
`src/runtime/invoke-ceiling-depth.ts:23` itself says the slash-load arm is
"witnessed at `V11f` / `V4e`".

src/runtime/depth-walk.ts:218-228 — the second seam the paragraph introduces,
with no `src/` caller:

```ts
export function routeDepthBoundary(site: DepthBoundarySite): DepthDestination {
  const routing: Record<DepthBoundarySite, DepthDestination> = {
    "typed-query-response": "ValidationError",
    "tool-args-model-driven": "model-feedback",
    "tool-args-code-driven": "CodeToolError",
    "params-invoke": "InvokeInfraError",
    "params-slash-load": "ceiling-3-cross-route",
    "invoke-return": "InvokeInfraError",
  };
  return routing[site];
}
```

The two leaves that do consult the seam, for contrast: `V13c`
(`src/runtime/query-tool-loop.ts:73` imports `depthWalk`, called at :669) and
`V14e` (`src/runtime/tool-call.ts:65-69` imports `depthWalk`, called at :775 in
`enforceModelToolArgDepth`).

## Why this is a problem
A stale downstream-consumer roster: the header is the file's map of who reads
it, and half the map points at modules that do not. `invoke-ceiling-depth.ts`'s
own header records why — bug 0202 moved the `invoke` rows onto the wire-form
walk ("Both gates are handed the interpreter's OWN value, not parsed JSON, so
both run `wireFormDepthWalk`") — and the `V4e` entry names a leaf whose whole
import surface is the note channel. A reader following the roster to find the
seam's callers reaches `wire-form-depth-walk.ts`'s consumers and the binder,
not what the comment says.

## Suggested direction (non-binding, optional)
Rewrite the clause against the modules that import from this file today, and
say which seam each of them consults (`depthWalk` vs the exported constants and
types), rather than naming a leaf list.

## False-positive check
- Importer census: `grep -rn "depth-walk" --include=*.ts src/ | grep -v
  wire-form-depth-walk` → `src/binder/defaulting.ts:30`,
  `src/binder/retry-taxonomy.ts:45`, `src/runtime/enum-tag-carriage.ts:41`,
  `src/runtime/invoke-ceiling-depth.ts:51`, `src/runtime/query-tool-loop.ts:73`,
  `src/runtime/subagent-envelope.ts:54`, `src/runtime/tool-call.ts:69`,
  `src/runtime/typed-query-validation.ts:17`. `src/extension/load-pre-eval.ts`
  is absent.
- Leaf-label mapping verified by reading each module's own header line 1:
  `V13c` → `src/runtime/query-tool-loop.ts`, `V14e` → `src/runtime/tool-call.ts:556`,
  `V15j` → `src/runtime/invoke-ceiling-depth.ts`, `V4e` →
  `src/extension/load-pre-eval.ts`. `grep -rn "\bV4e\b" --include=*.ts src/`
  returns only load-pre-eval.ts, production-composition.ts (prose),
  ceiling-arbitration.ts (prose), depth-walk.ts:15 and
  invoke-ceiling-depth.ts:23/:89 (prose) — no second module carries the label.
- `routeDepthBoundary` deadness NOT claimed: `grep -rn "\brouteDepthBoundary\b"
  --include=*.ts src/ tests/ extensions/ tools/` → definition at
  depth-walk.ts:218, prose at :27/:34 and invoke-ceiling-depth.ts:126, and six
  call sites in `tests/depth-enforcement.test.ts` (:71-87). Tests are
  legitimate callers, so it is not filed as dead — it is cited only as evidence
  that no site-owner leaf consults that seam. Also checked for dynamic access
  (`grep -rn "routeDepth" --include=*.ts .` → same hits) and for re-export
  (`grep -rn "from \"./depth-walk\"" src/ | grep export` → none).
- `DepthBoundarySite` / `DepthDestination` likewise checked: zero references
  outside depth-walk.ts and the test file, but both are signature types of the
  exported function, so no deadness is filed for them either.
- Duplicate check: `grep -rln "depth-walk" quality/intake/` → seven files;
  the only one citing depth-walk.ts line ranges is
  qw20260907183353-d2-01-runtime-seams-stub-narration-stale (:32-37, stub
  narration). None cites :11-17 or the roster.

## Triage
verdict: confirmed — reverified: load-pre-eval.ts (`V4e`) has exactly one import (system-note-channel), zero depth-walk refs, and its own :26 header says the walk runs in `binder/defaulting.ts`; invoke-ceiling-depth.ts (`V15j`) imports only a type and runs `wireFormDepthWalk` per bug 0202; the roster also omits the real `depthWalk` callers `defaulting.ts` (V11g) and `typed-query-validation.ts` (V13e); `routeDepthBoundary` correctly not filed as dead (test-only callers) (triage: claude-opus-5)
