---
id: pending
title: ceiling-arbitration's header still says feature leaves and the V4e slash-load cross-route consult the seam after bug-0066 deleted the only production consumer
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/ceiling-arbitration.ts:8-17
  - src/runtime/query-tool-loop.ts:38-41
sites: 2
fix_scope: cross-module
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# ceiling-arbitration's header still says feature leaves and the V4e slash-load cross-route consult the seam after bug-0066 deleted the only production consumer

## Observation
The module header of `src/runtime/ceiling-arbitration.ts` states in present
tense that each ceiling's feature leaf "CONSULTS this seam" at its
first-enforcement point and that "the load-time `V4e` slash-load `params`
cross-route consults it at slash-load per CIO-1". Today no production module
imports the file — only two test files do. The one production import that ever
existed (`load-pre-eval.ts`'s `crossRouteSlashLoadParams` route) was deleted by
the bug-0066 fix commit, whose message calls that route "unreachable".
Production populates the `masked` field through `computeMasked`
(`src/runtime/runtime-event-channel.ts`), and `query-tool-loop.ts`'s header
repeats the same "consults `V16a`'s cross-ceiling arbitration seam" sentence
while importing only `computeMasked`.

## Evidence
src/runtime/ceiling-arbitration.ts:12-17:
```
// receives no events, and owns no per-ceiling surface. Each ceiling's own
// bound/breach detection stays distributed across its feature leaf
// (`V5e`, `V11f`, `V13c`, `V15b`), whose first-enforcement point CONSULTS this
// seam to obtain the surfacing precedence and to populate the surface's
// `masked` field; the load-time `V4e` slash-load `params` cross-route consults
// it at slash-load per CIO-1.
```

Import search: `grep -rn "ceiling-arbitration" src extensions tools tests` →
only tests/ceiling-arbitration.test.ts:29 and
tests/integration-acceptance.test.ts:36. No src/extensions/tools file imports
it.

Git pre-image (the deleted consumer), `94e81974^:src/extension/load-pre-eval.ts:45`:
```ts
import { arbitrate, type ArbitrationResult } from "../runtime/ceiling-arbitration";
```
Commit 94e81974 ("fix(bug-0066) …") message: "the unreachable,
PIC-1(c)-violating crossRouteSlashLoadParams seam is deleted".
docs/bugs/0066-ajv-verdict-discarded-unreachable-enforcement.md:112 records
"`src/runtime/ceiling-arbitration.ts:122–130` — `arbitrate`. Correct in itself"
while measuring the route as callerless.

src/runtime/query-tool-loop.ts:38-41 (the sibling claim) beside its actual
import at :61 (`import { computeMasked } from "./runtime-event-channel";`):
```
// At its ceiling-#2 first-enforcement point (the round boundary) this leaf
// consults `V16a`'s cross-ceiling arbitration seam for the cross-ceiling
// surfacing precedence and the `masked` enumeration, and the `V9d` `computeMasked`
// V1-reachable predicate that populates `details.event.masked`.
```
`grep -rn "arbitrate(" src extensions tools` → only the definition
(ceiling-arbitration.ts:122); every call is in the two test files.

## Why this is a problem
Historical narration: both headers describe a consumer graph the current code
disproves. The feature-leaf consult never landed (no leaf module has ever
imported the seam — `git log --all -S 'from "../runtime/ceiling-arbitration"'`
shows load-pre-eval.ts as the only src importer in history), and the V4e
cross-route consult was deleted in bug-0066. `arbitrate` itself is exercised
by witness tests and is not claimed dead here; the finding is the narration
that misstates its consumers and the enforcement wiring.

## Suggested direction (non-binding, optional)
Align the two headers with the actual state: the CIO order and masked co-fire
are witnessed at the seam by tests, and production `masked` population goes
through `computeMasked`; drop or rephrase the "consults this seam" sentences.

## False-positive check
- Reference search: `ceiling-arbitration` import search across src/,
  extensions/, tools/, tests/ — two test files only.
- Call search: `arbitrate(` across the same trees — definition plus test
  calls only; no dynamic/string-keyed dispatch of the name found.
- Git history intent: pre-image of commit 94e81974 shows the deleted import
  (load-pre-eval.ts:45); the commit message and the bug-0066 report both
  record the deletion of the only consumer as deliberate. Neither updated the
  seam's header.
- Witness-test rule respected: no deadness is claimed against `arbitrate` or
  the module; the target is the stale header text.

## Triage
