---
id: PTQ-1656
title: Bug 0369's fix record says its live cell "exercises the `evalParFor` admit branch" end to end, but the named cell only checks registration and never runs a theta
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md:237-242
  - docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md:265-266
  - tests/live/par-for-body-return-live-cell.test.ts:20-27
  - tests/live/par-for-body-return-live-cell.test.ts:39-43
  - tests/live/par-for-body-return-live-cell.test.ts:116-121
  - src/runtime/statement-executor.ts:434-438
  - src/runtime/par-for-executor.ts:255-260
sites: 1
fix_scope: localized
d10_class: overstated-strength
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0369's fix record says its live cell "exercises the `evalParFor` admit branch" end to end, but the named cell only checks registration and never runs a theta

## Observation
Bug 0369 (Status: fixed 0.350.0) added a `ForIterandKindDefectError` belt at the `evalParFor` iterand snapshot. The record's live gate names `tests/live/par-for-body-return-live-cell.test.ts` and says it "exercises the `evalParFor` admit branch the `ForIterandKindDefectError` belt guards, green end-to-end on the live host". That cell is bug 0223's registration-only cell. It boots the extension, plants two `par for` thetas, and checks `handle.command(...)` / `handle.registeredNames()`. Its header states that no command is invoked and no turn is driven. `evalParFor` runs only when the statement executor evaluates a `par-for` expression at drive time, so the belt's admit branch is never reached in that cell. The offline witness `tests/b0369-control-flow-kind-belts.test.ts` exists and is not in question.

## Evidence
Claim side, `docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md:237-242`:
```
  - Live (under the shared cross-process lock):
    `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/par-for-body-return-live-cell.test.ts` → 1 passed — `par for`
    over a genuine `[1, 2, 3]` through live production load exercises the
    `evalParFor` admit branch the `ForIterandKindDefectError` belt guards, green
    end-to-end on the live host.
```
`:265-266` (Verification) relies on it:
```
  - Live deferred to the orchestrator and run under lock (green — above);
    reviewer/verifier never run live.
```

Evidence side, `tests/live/par-for-body-return-live-cell.test.ts:20-27`:
```
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// bug 0141's live cell uses. A registration-only observable: no live model turn
// is driven, so this cell spends no tokens beyond `requireLiveProvider`'s
// credential resolution — registration is decided at load, so a turn is neither
// needed nor driven.
```
`:39-43`:
```
// Subagent child-process launch: NOT reached. Both planted thetas are
// `mode: prompt` and this cell never invokes a command, so no query-time
// tool-call loop and no RFC-0006 subagent-child spawn occurs. `harness.ts`
// carries the `#subagent-child-pins` module-scope setters regardless (inherited
// by importing it), but this cell does not exercise that path — zero model
```
`:116-121` (the only assertions are on registration):
```
      // The fixed observable: the body-`return` sibling must be ABSENT from the
      // registered set — real observable off the settled `ExtensionRunner`,
      // never a `prompt()` resolution (no turn is driven in this cell at all —
      // registration is decided at load).
      expect(
        handle.command("celleparreturn"),
```
Where the belt lives, `src/runtime/statement-executor.ts:434-438` (runtime expression evaluation):
```
  // RFC 0003 `par for`: fan the body out concurrently over the iterand snapshot
  // and collect one `Result` per element into an input-index-ordered array.
  if (expr.kind === "par-for") {
    return evalParFor(expr, env, deps);
  }
```
`src/runtime/par-for-executor.ts:255-260`:
```
  // Bug 0369 belt: this must fire BEFORE the CTRL-2 width resolution and worker
  // scheduling below, so a laundered non-array iterand aborts loudly instead of
  // scheduling a fabricated empty fan-out.
  if (!Array.isArray(iterandValue)) {
    throw new ForIterandKindDefectError(iterandValue);
  }
```

Fix-time state: `git log -- tests/live/par-for-body-return-live-cell.test.ts` shows the last change at 96f9a136 (2026-08-26), before the 0369 fix commit 7a513015 (2026-09-02). The cell was already registration-only when the claim was written.

Searches run in this session:
- `grep -rn "evalParFor\b\|evalParFor(" src` → one runtime call site (`statement-executor.ts:437`) plus the definition (`par-for-executor.ts:232`) and comment mentions. No load-time or compose-time caller.
- `grep -n "prompt(\|drive\|dispatch" tests/live/par-for-body-return-live-cell.test.ts` → 6 hits, all in comments (`:23`, `:25`, `:27`, `:29`, `:32`, `:119`; each either names the boot harness or states that no turn is driven). No drive helper is imported (imports: `bootShippedExtension`, `plantThetaWorkspace`, `requireLiveProvider`, `PlantedTheta`).
- `grep -rn "evalParFor\|0369" tests/live` → 0 hits.

## Why this is a problem
The record presents a load/registration observable as end-to-end runtime proof of a runtime belt. Registering the control theta shows that the `par for` shape parses and registers. It does not run `evalParFor`, so it cannot show that the belt's admit branch stays clean on a live host. The belt's live-host behaviour is therefore unwitnessed, and the record says otherwise. This is overstated-strength: registration-level evidence worded as live execution proof.

## Suggested direction (non-binding, optional)
Reword the live clause to what the cell proves (the `par for` control still registers through the real composition root). The alternative is to cite a live cell that drives a `par for` at runtime. `grep -rl "par for" tests/live | xargs grep -l "driveSlashCaptureTurn\|spawnPiPrint\|driveOnce"` lists `tests/live/acceptance/nested-fn-under-par-for-live.test.ts`, `tests/live/execution-status-parfor-ui-live-cell.test.ts`, `tests/live/live-production-acceptance.test.ts` and `tests/live/acceptance/b0324live-max-non-integer-load-refusal.test.ts` as drive-capable files that mention `par for`. Whether any of them drives the admit branch is for the fix stage to confirm.

## False-positive check
- Read the whole cited live cell (140 lines). One `it`; two planted `mode: prompt` thetas; assertions only on `handle.command` / `handle.registeredNames`; `handle.dispose()` in `finally`. No slash dispatch or `prompt()`.
- Confirmed that `evalParFor` has no caller in the compose/registration path (grep above). The planted `let xs = par for i in [1, 2, 3] { i * 10 }` is parsed and registered but never evaluated.
- History: the cell predates the 0369 fix (last touched 96f9a136, 2026-08-26), so this is not later decay.
- The record names no other live cell for this belt: `grep -n "tests/live" docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md` → 1 hit, line 239.
- Not a claim about the fix's truth. The offline witness `tests/b0369-control-flow-kind-belts.test.ts` exists and is gate-covered. Only the live-execution wording is at issue.

## Triage
verdict: questionable — accounting verified: 0369:237-242 credits tests/live/par-for-body-return-live-cell.test.ts with running the `evalParFor` admit branch "end-to-end". That cell (bug 0223's, last touched 96f9a136 before fix 7a513015) is registration-only. Header :24-27/:39-44 says no turn is driven and no command is invoked, and its only assertions are handle.command/registeredNames (:109-134). evalParFor's sole caller is runtime statement-executor.ts:437, and tests/live has 0 hits for evalParFor or 0369. The live claim is registration-level evidence worded as runtime proof, and rewording the record is a human ruling (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (overstated-strength). APPEND EXACTLY the following block at the very end of docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md, nothing else; every existing line stays byte-identical:

### Correction note — 2026-09-28 (D10 wave qw20260928081617)

The sentence above crediting tests/live/par-for-body-return-live-cell.test.ts with exercising the evalParFor admit branch end to end overstates that cell: its own header says it is registration-only — no live model turn is driven and no command is invoked — and its assertions cover handle.command/registeredNames only. evalParFor is reached solely from the runtime statement executor, which that cell never enters. The live evidence is load-time registration; the admit branch is witnessed offline only.
