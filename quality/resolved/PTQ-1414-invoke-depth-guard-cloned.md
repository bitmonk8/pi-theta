---
id: PTQ-1414
title: Invoke depth-overflow trampoline guard duplicated in subagent-fn and direct-invoke child builders
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:3756-3769
  - src/extension/production-theta-producer.ts:4968-4988
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923023517
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# Invoke depth-overflow trampoline guard duplicated in subagent-fn and direct-invoke child builders

## Observation
`src/extension/production-theta-producer.ts` builds two different invoke-style child objects (`SubagentFnInvokeChild` in `#resolveSubagentFnChild` and `InvokeChild` in `#buildInvokeChild`). Both builders begin their `drive()` closures with the same countable-frame depth check: push a frame, catch `InvokeDepthExceededPanic`, surface the overflow as a nested boundary-minted `Err`, and rethrow any other panic. The two blocks are byte-identical except for the frame label passed to `pushCountableFrame` and a few explanatory comments in the direct-invoke copy.

## Evidence

Location 1 — `#resolveSubagentFnChild` (subagent-fn child builder), lines 3756-3769:

```typescript
        let childChain: InvokeChain;
        try {
          childChain = pushCountableFrame(chain, "subagent-fn");
        } catch (panic) { // allow-broad-catch: theta/runtime/invoke-depth-exceeded — hard-ceilings.md
          if (panic instanceof InvokeDepthExceededPanic) {
            const surfaced = surfaceDepthOverflow(panic, { topLevel: false, calleePath });
            if (surfaced.mode === "nested") {
              return Promise.resolve({
                source: "boundary-minted",
                result: makeErr(surfaced.error as unknown as ThetaValue),
              });
            }
          }
          throw panic;
        }
```

Location 2 — `#buildInvokeChild` (direct-invoke child builder), lines 4968-4988:

```typescript
        let childChain: InvokeChain;
        try {
          childChain = pushCountableFrame(chain, "direct-invoke");
        } catch (panic) { // allow-broad-catch: theta/runtime/invoke-depth-exceeded — hard-ceilings.md
          // Narrow-and-rethrow: only the ceiling panic is handled (surfaced as
          // the nested Err backstop); any other throw propagates unchanged.
          if (panic instanceof InvokeDepthExceededPanic) {
            const surfaced = surfaceDepthOverflow(panic, {
              topLevel: false,
              calleePath,
            });
            if (surfaced.mode === "nested") {
              // This ceiling refusal is THIS hop's own trampoline guard — the
              // callee never ran (bug 0294 provenance).
              return Promise.resolve({
                source: "boundary-minted",
                result: makeErr(surfaced.error as unknown as ThetaValue),
              });
            }
          }
          throw panic;
        }
```

Diff verdict: renamed-only / comment-added. The imperative logic (`let childChain; try { pushCountableFrame(...) } catch ... surfaceDepthOverflow ... return boundary-minted Err ... throw panic`) is identical; only the literal frame label (`"subagent-fn"` vs `"direct-invoke"`) and the direct-invoke copy's additional comment lines differ. No clone-map group id applies (`clone-scan map` reports no groups for this file).

## Why this is a problem
This is load-bearing duplication, not incidental similarity. Both sites implement the same hard-ceiling rule from `hard-ceilings.md` / CIO-2: before a callee body runs, the invoke chain is pushed, and a nested depth overflow must refuse as a boundary-minted `Err(InvokeInfraError{cause:"panic"})`. If one copy is changed (for example, to surface a different `cause`, to omit the `surfaceDepthOverflow` call, or to return `Ok(null)` instead of an `Err`) and the other is not, then `subagent fn` calls and direct `invoke(...)` calls will observe different depth-exceeded behavior for the same runtime condition. The two sites share no extracted helper, so any future bug fix to the ceiling guard (such as bug 0294-style provenance changes) must be applied twice.

## Suggested direction (non-binding, optional)
The natural shared home is a module-level helper in `src/extension/production-theta-producer.ts` (or a nearby `runtime/invoke-*` sibling) that accepts the frame label and chain and returns either the pushed `InvokeChain` or a boundary-minted `DrivenInvokeResult`. Both `#resolveSubagentFnChild` and `#buildInvokeChild` would call it from their `drive()` closures. This is a hypothesis; the fix stage owns the design.

## False-positive check
- Clone map re-verified: `src/extension/production-theta-producer.ts` has `(no clone groups)` in the provided clone-scan map, so this pair was not detected by token clone scanning.
- Both copies live: `#resolveSubagentFnChild` is called from the in-process subagent-fn path; `#buildInvokeChild` is called from `#resolveInvoke` and `#resolveCallAsInvoke`.
- Dead-code check: both `drive()` closures are returned to callers and executed on active invocation paths.
- Deliberate-mirror check: no code comment claims these two sites are intentionally independent; they implement the same spec clause with the same helper imports (`pushCountableFrame`, `surfaceDepthOverflow`, `makeErr`).
- Not tests/: both locations are production code under `src/extension`.
- Not generated: hand-authored TypeScript with bug-numbered narrative comments.

## Triage
verdict: confirmed — both excerpts reproduce byte-for-byte at production-theta-producer.ts:3756-3769 (`#resolveSubagentFnChild`, called from 2331) and 4968-4988 (`#buildInvokeChild`, called from 4869/4918); hand-diff confirms the guard logic (`let childChain; try pushCountableFrame … catch InvokeDepthExceededPanic → surfaceDepthOverflow({topLevel:false, calleePath}) → nested ? boundary-minted makeErr : throw`) is identical with only the frame label ("subagent-fn"/"direct-invoke") and comments differing; `clone-scan map` re-run reports `(no clone groups)` for the file as stated; both copies are live production code implementing the same hard-ceilings.md/INV-4 rule; no existing PTQ row tracks this pair (PTQ-1122/0940/0995 cite other files, PTQ-1261 is a D9 runtime-panics filing), so the fix is a mechanical dedupe into a shared push-or-refuse helper (triage: claude-fable-5-1)
