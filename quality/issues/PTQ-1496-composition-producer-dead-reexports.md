---
id: PTQ-1496
title: theta-composition-producer.ts re-exports SelfDrivenConversationBinding and surfaceDispatchDefect that nothing imports through this file
lens: D2                     # D2 | D4 | D7 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/theta-composition-producer.ts:54-65
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260923185337
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# theta-composition-producer.ts re-exports SelfDrivenConversationBinding and surfaceDispatchDefect that nothing imports through this file

## Observation
`theta-composition-producer.ts`'s header states the module "re-exports its
contract and defect surface seams", and lines 54-65 carry a `export type { … }
from "./theta-composition-contract"` block plus a separate `export {
surfaceDispatchDefect } from "./dispatch-defect-surface"` line. Of the nine
names in the type re-export block, seven are imported by other modules
through this file's own path (verified below); two names in this same
re-export mechanism — `SelfDrivenConversationBinding` (line 61) and
`surfaceDispatchDefect` (line 65) — are never imported by any other module
through `theta-composition-producer.ts`.

## Evidence

`src/extension/theta-composition-producer.ts:54-65`:
```ts
export type {
  ThetaCompositionInput,
  BinderRunInput,
  BinderRunResult,
  DrivenConversation,
  ConversationBindInput,
  BodyExecutingConversationBinding,
  SelfDrivenConversationBinding,
  ConversationBinding,
  ThetaProducerDeps,
} from "./theta-composition-contract";
export { surfaceDispatchDefect } from "./dispatch-defect-surface";
```

Search 1 — `grep -rn "SelfDrivenConversationBinding" . --include="*.ts"` (excluding `dist/`, which is a build artefact): 3 hits — the interface's own declaration and its use inside the `ConversationBinding` union, both in `src/extension/theta-composition-contract.ts:281,289`, and the re-export list entry itself at `theta-composition-producer.ts:61`. No file anywhere in `src/` or `tests/` names `SelfDrivenConversationBinding` in an `import { … }` clause, from either `theta-composition-producer.ts` or `theta-composition-contract.ts` directly.

Search 2 — `grep -rn "surfaceDispatchDefect" . --include="*.ts"` (excluding `dist/`): every hit is the function's own declaration/export in `dispatch-defect-surface.ts:44,117`, the same-file import/re-export/two call sites in `theta-composition-producer.ts:52,65,234,407`, and prose-only comment mentions (no import) in `runtime-panics.ts:128,168,171`, `pure-expression-evaluator.ts:139`, and `tests/b0476-panic-site-and-frames.test.ts:21,580`. No file imports `surfaceDispatchDefect` from `theta-composition-producer.ts`, and none imports it from `dispatch-defect-surface.ts` either except `theta-composition-producer.ts` itself.

Contrast — the other seven re-exported type names ARE consumed through
`theta-composition-producer.ts`'s own path: e.g. `BinderRunInput`/
`BinderRunResult` via `src/extension/binder-run.ts:85-88` (`} from
"./theta-composition-producer";`), `ThetaProducerDeps` via the same file,
`ConversationBinding`/`BodyExecutingConversationBinding` via
`src/extension/callable-lowering.ts:19-21` and
`src/extension/subagent-drive-binding.ts:19-21`, `ConversationBindInput` via
ten `src/extension/*.ts` files, `ThetaCompositionInput` via nine `src/extension/*.ts` files, and `DrivenConversation` via `tests/composition-producer.test.ts:19` (`type DrivenConversation` imported from `../src/extension/theta-composition-producer`).

## Why this is a problem
The header's own framing — "this module … re-exports its contract and defect
surface seams" — describes a re-export surface that importers actually use
for seven of nine listed type names and is a real, load-bearing indirection
for those seven. `SelfDrivenConversationBinding` and `surfaceDispatchDefect`
sit in the identical mechanism but have no reader anywhere: every consumer of
`surfaceDispatchDefect` reaches it by calling the function locally inside
this same file, and no consumer of the `ConversationBinding` union needs the
`SelfDrivenConversationBinding` arm named separately from the union itself.
Both re-export lines are inert surface area that a reader has to check
against the whole repo (as this filing did) to learn adds nothing.

## Suggested direction (non-binding, optional)
Dropping the two unread re-export entries would leave the seven load-bearing
ones and the header's own re-export claim intact; the underlying
declarations (`SelfDrivenConversationBinding` in `theta-composition-contract.ts`,
`surfaceDispatchDefect` in `dispatch-defect-surface.ts`) stay untouched since
both are alive at their point of declaration.

## False-positive check
Ran `grep -rn "SelfDrivenConversationBinding" . --include="*.ts"` and
`grep -rn "surfaceDispatchDefect" . --include="*.ts"` across the whole repo
(excluding the generated `dist/` tree), covering `src/`, `tests/`, and any
other top-level directory the pattern could appear in; confirmed no
`import { … }` clause anywhere names either symbol from
`theta-composition-producer.ts` (or, for `surfaceDispatchDefect`, from
`dispatch-defect-surface.ts` either). Checked for string-keyed / dynamic
access via a literal-string grep (`"SelfDrivenConversationBinding"`,
`"surfaceDispatchDefect"`) — no hits. Both underlying declarations are
themselves alive (the interface participates in the `ConversationBinding`
union which is broadly imported; the function is called twice inside
`theta-composition-producer.ts`), so this filing is scoped to the two
re-export lines only, not the declarations — consistent with the standing
ruling that an unimported `export` keyword on a live declaration is not
cruft; a re-export statement that forwards a name literally zero external
importers reach through it is the distinct claim made here.

## Triage
<Not yet triaged.>
verdict: confirmed — excerpt matches at src/extension/theta-composition-producer.ts:54-65; my own grep of both names across src/, tests/, tools/ and extensions/ (.ts/.mts/.js/.mjs, dist excluded) finds no importer through this file: SelfDrivenConversationBinding shows up only at its declaration and union use in theta-composition-contract.ts:281,289 and at the re-export line, and every surfaceDispatchDefect hit is either its home module, this file's import/re-export/two internal calls (234, 407), or a prose comment; nothing reads this module through `import * as`, `export *`, dynamic `import()` or `vi.mock`; the lines came from the PTQ-1161 D9 split fix (73678c92) and carry no facade comment; the other names in the block are imported through this path (binder-run.ts:88, callable-lowering.ts:21, composition-producer.test.ts:19); no open or resolved issue covers this site, and it follows the confirmed PTQ-1252/PTQ-1409 dead-re-export precedent (triage: claude-opus-5-5)
