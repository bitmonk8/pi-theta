---
id: PTQ-1449
title: two of the four per-site type aliases in tool-call-swallowing-handler.ts have no reader anywhere
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/tool-call-swallowing-handler.ts:54-54
  - src/runtime/tool-call-swallowing-handler.ts:62-62
  - src/runtime/tool-call-swallowing-handler.ts:71-71
  - src/runtime/tool-call-swallowing-handler.ts:78-78
sites: 2
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260923145222
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# two of the four per-site type aliases in tool-call-swallowing-handler.ts have no reader anywhere

## Observation
`tool-call-swallowing-handler.ts` re-exports the cancellation-core substrate under
four site-local type aliases (`ToolExecuteSettlement`, `ToolExecuteCancellationGuard`,
`ToolExecuteSideChannels`, `ToolExecuteLateSettlementDisposition`), matching the
generic `attachSwallowingHandler` / `routeAbandonableSettlement` functions it also
re-exports under site names. Two of the four aliases (`ToolExecuteCancellationGuard`,
`ToolExecuteSideChannels`) are imported and used by both the production call site
(`tool-call-ladder.ts`) and the test suite. The other two
(`ToolExecuteSettlement`, `ToolExecuteLateSettlementDisposition`) are declared and
exported but never referenced anywhere else in the module or by any importer — the
re-exported functions they would annotate keep their original `cancellation-core.ts`
signatures (`AbandonableSettlement`, `SubstrateDisposition`), so even this file's own
`export {}` lines never spell the two local alias names.

## Evidence
`src/runtime/tool-call-swallowing-handler.ts:48-54`:
```ts
/**
 * The settlement outcome of the underlying code-side `execute()` Promise — the
 * value it resolved with, or the reason it rejected with. Enumerated so the
 * discard decision is independent of the late-settle kind (cancellation.md: "the
 * discriminator is whether cancellation has already been surfaced at the
 * checkpoint, not the late-settle kind").
 */
export type ToolExecuteSettlement = AbandonableSettlement;
```

`src/runtime/tool-call-swallowing-handler.ts:73-78`:
```ts
/**
 * The disposition of one late settlement: `"discarded"` once cancellation has
 * surfaced (silently absorbed on all three side channels), or `"surfaced"` on
 * the pre-cancellation path.
 */
export type ToolExecuteLateSettlementDisposition = SubstrateDisposition;
```

Search: `grep -rn "ToolExecuteSettlement\b" src/ extensions/ tools/ tests/` → 1 hit
(the declaration line above only).
Search: `grep -rn "ToolExecuteLateSettlementDisposition\b" src/ extensions/ tools/ tests/`
→ 1 hit (the declaration line above only).

By contrast the other two site aliases each have external readers:
`grep -rn "ToolExecuteCancellationGuard\b" …` and
`grep -rn "ToolExecuteSideChannels\b" …` both hit
`tests/helpers/tool-execute-cancellation-race.ts` and
`tests/tool-calls-swallowing-handler.test.ts` (imported and used as annotations),
and `guardToolExecutePromise` is called from production
`src/extension/tool-call-ladder.ts:286,300,541,549,557`.

## Why this is a problem
`ToolExecuteSettlement` and `ToolExecuteLateSettlementDisposition` are exported type
declarations with zero readers anywhere in `src/`, `extensions/`, `tools/`, or
`tests/` — not even inside their own declaring module, since the functions they would
describe are plain re-exports that keep the `cancellation-core.ts` types
(`AbandonableSettlement`, `SubstrateDisposition`) rather than these two aliases. This
is not the house `export`-with-no-importer style carved out by precedent (a `*Deps`
interface, a diagnostic anchor, or a kind discriminator that is itself alive) — the
declaration is a pure unused alias, and its two siblings in the same file show what a
consumed version of the same pattern looks like.

## Suggested direction (non-binding, optional)
Drop the two unused aliases, or wire them onto the two re-exported function
signatures the module's own header describes them as annotating, so all four site
aliases are either used or removed uniformly.

## False-positive check
Ran `grep -rn "ToolExecuteSettlement\b"` and `grep -rn "ToolExecuteLateSettlementDisposition\b"`
across `src/`, `extensions/`, `tools/`, `tests/` — one hit each (the declaration).
Also checked for string-keyed/dynamic access (`import(...)`, `require(...)`,
`["ToolExecuteSettlement"]`-style) — none found; both names appear only as the
declaration identifier. Confirmed the module's two re-exported functions
(`guardToolExecutePromise`, `routeToolExecuteLateSettlement`) do not use either alias
in their own (aliased-through) signatures, so the aliases have no reader even within
this file. Not test-only-reachable (no reader at all, including tests), so the
"tests are legitimate callers" carve-out does not apply.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts match at :54 and :78; `grep -rn` for `ToolExecuteSettlement\b` / `ToolExecuteLateSettlementDisposition\b` across src/, extensions/, tools/, tests/, docs/ hits only the two declaration lines (the only other echo is the stale dist/ build artifact), no string-keyed/dynamic access, and the module's two `export { x as y }` lines forward the cancellation-core signatures verbatim so neither alias is read even in-file; the siblings `ToolExecuteCancellationGuard` / `ToolExecuteSideChannels` do have readers (tests/helpers/tool-execute-cancellation-race.ts, tests/tool-calls-swallowing-handler.test.ts), so this is not the test-only-caller carve-out; the aliases are a vestige of the PTQ-1302 fix (commit c2ac6d12), which replaced the local `routeToolExecuteLateSettlement` that used them as parameter/return types with a bare re-export — not a duplicate (PTQ-1302 tracked the four-way clone, now fixed; no filing tracks the leftover aliases). Note for the fixer: the same two-alias leftover exists identically in invoke-swallowing-handler.ts:47,72 (`InvokeExecutionSettlement`, `InvokeLateSettlementDisposition`) and query-swallowing-handler.ts:51,75 (`QueryProviderSettlement`, `QueryProviderLateSettlementDisposition`), also zero readers (triage: claude-fable-5-1)
