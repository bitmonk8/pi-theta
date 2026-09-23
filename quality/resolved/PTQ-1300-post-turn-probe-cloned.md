---
id: PTQ-1300
title: Post-turn probe sequence duplicated across three control paths in live prompt-query driver
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/live-prompt-query-driver.ts:333-339
  - src/extension/live-prompt-query-driver.ts:496-511
  - src/extension/live-prompt-query-driver.ts:632-655
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# Post-turn probe sequence duplicated across three control paths in live prompt-query driver

## Observation
After the live prompt-query driver issues a user-visible turn, it classifies
the settled result with `extractPromptModeQueryResult` and returns early on a
non-`Ok` verdict. That post-turn probe sequence appears in three separate
control paths inside `src/extension/live-prompt-query-driver.ts`:

- `nextFreePhaseTurn` (round 0) after a governed streamed turn;
- `forcedRespondTurn` (degraded / fused-text arm) after an ungoverned streamed turn;
- `#driveRestartedRepairPhase` after a follow-up streamed turn.

The clone map decomposes the same repeated shape into two groups: **G034**
identifies the inner `extractPromptModeQueryResult` probe block shared by the
first two paths, and **G054** identifies the broader `driveUserVisibleTurn` +
sync-throw check + probe pattern shared by the last two paths.

## Evidence

**Site 1 — `nextFreePhaseTurn` probe block (`src/extension/live-prompt-query-driver.ts:333-339`), G034:**
```ts
    const probe = extractPromptModeQueryResult(this.#readMessages(), {
      aborted: this.#thetaAbort.signal.aborted,
      provider: this.#provider,
    });
    if (!probe.ok && probe.error.kind !== "cancelled") {
      return { kind: "transport", error: probe.error as TransportError | ContextOverflowError };
    }
```

**Site 2 — `forcedRespondTurn` degraded arm (`src/extension/live-prompt-query-driver.ts:496-511`), G054 (contains G034's second copy):**
```ts
    await this.#driveUserVisibleTurn(false);
    // PIC-50/51/51b: a transport failure on the fused turn (send sync-throw,
    // trailing `stopReason: "error"`, a PIC-51b non-normal terminator, or an
    // absent-trailing-assistant settled turn) surfaces as the typed query's
    // `Err(TransportError | ContextOverflowError)` rather than being parsed as
    // a structured payload.
    if (this.#transportFromThrow !== undefined) {
      return { kind: "transport", error: this.#transportFromThrow };
    }
    const probe = extractPromptModeQueryResult(this.#readMessages(), {
      aborted: this.#thetaAbort.signal.aborted,
      provider: this.#provider,
    });
    if (!probe.ok && probe.error.kind !== "cancelled") {
      return { kind: "transport", error: probe.error as TransportError | ContextOverflowError };
    }
```

**Site 3 — `#driveRestartedRepairPhase` (`src/extension/live-prompt-query-driver.ts:632-655`), G054:**
```ts
    await this.#driveUserVisibleTurn(true, prompt);
    if (this.#transportFromThrow !== undefined) {
      // PIC-50: a `sendUserMessage` sync-throw is the attempt's proximate
      // transport failure — no attempts debit (QRY-11 §non-validation).
      return { kind: "provider_failure", error: this.#transportFromThrow };
    }
    // PIC-51 / QRY-11 (bug 0010 fix review C, finding 1): the post-turn
    // probe diverts on EVERY failure verdict. An error-stop on the streamed
    // follow-up turn is the attempt's proximate transport failure; a
    // cancellation observed after the turn settled (the probe's aborted arm
    // synthesises `Err(cancelled)`) terminates repair as its own
    // non-validation failure (query-failure-and-repair.md §Non-validation:
    // `cancelled` is enumerated; the propagated error resolves to the CANCEL
    // terminal outcome downstream, error-model.md §Terminal outcomes).
    // Neither verdict is text-parsed, and neither falls through to the
    // fresh off-session dispatch — an aborted attempt issues NO post-abort
    // provider call.
    const probe = extractPromptModeQueryResult(this.#readMessages(), {
      aborted: this.#thetaAbort.signal.aborted,
      provider: this.#provider,
    });
    if (!probe.ok) {
      return { kind: "provider_failure", error: probe.error };
    }
```

**Diff verdicts:**
- **G034** is byte-identical: the probe call and the `probe.error.kind !== "cancelled"` guard are the same at site 1 and inside site 2.
- **G054** is renamed-only in the clone map's classification, but the current excerpts show the copies are not merely renamed: site 3 omits the `probe.error.kind !== "cancelled"` exclusion, wraps failures as `provider_failure` rather than `transport`, and drives the turn with `true, prompt` rather than `false`. Those differences are context-specific (repair outcomes vs. forced-respond outcomes), but the underlying drive + sync-throw check + probe sequence is still hand-duplicated.

## Why this is a problem
The three paths all perform the same lifecycle operation — classify the result
of a just-driven user-visible turn and decide whether to continue or return an
error. If one copy drifts, the surfaces will disagree on the same post-turn
state:

- A change to how `cancelled` is handled (site 1 and 2 exclude it, site 3 does
  not) could move the boundary between "outer loop owns cancellation" and
  "repair treats cancellation as a non-validation failure".
- A change to which transport verdict is returned (`transport` vs.
  `provider_failure`) could make the degraded forced-respond arm and the repair
  arm classify the identical `sendUserMessage` sync-throw differently.
- The comments already describe the shared rule differently (`PIC-50/51/51b`
  vs. `PIC-51 / QRY-11`), showing the invariant is stated at each call site
  rather than enforced in one place.

## Suggested direction (non-binding, optional)
A single private helper inside `src/extension/live-prompt-query-driver.ts` that
captures the common sequence: drive a user-visible turn, check
`#transportFromThrow`, run `extractPromptModeQueryResult`, and return a failure
if the probe is not `Ok`. The helper would be parameterized for the small
contextual differences (the drive arguments, whether to exclude `cancelled`,
and the result wrapper), so the classification rule lives in one place while
 callers keep their distinct return shapes.

## False-positive check
- Re-read the three cited spans immediately before filing; all three copies are live
  and execute on every prompt-mode query path.
- `nextFreePhaseTurn`, `forcedRespondTurn`, and `driveRepairAttempt` are all reached
  from the typed/untyped query loop (`src/runtime/query-tool-loop.ts`), so the copies
  are not dead code.
- Searched `quality/intake/`, `quality/issues/`, and `quality/resolved/` for
  `extractPromptModeQueryResult` combined with `live-prompt-query-driver`; no prior
  D4 filing covers this duplication.
- The similarity is not a spec-normative vector table; it is an internal driver pattern.
- All cited files are under `src/` production code; no `tests/` files are involved and
  no generated-file marker was found.

## Triage
verdict: confirmed — all three excerpts match at the cited lines (333-339, 496-511, 632-655); clone-scan map reproduces both groups (G034 identical 323-339/503-511; G054 renamed-only 496-509/632-653) and the filing correctly discloses G054's real divergences (site 3 drops the `cancelled` exclusion, wraps as `provider_failure`, drives `true, prompt`) as parameters rather than overclaiming byte-identity; every copy is live (`nextFreePhaseTurn`/`forcedRespondTurn` called from src/runtime/query-tool-loop.ts:399/506/568, `driveRepairAttempt` from src/extension/production-theta-producer.ts:3928 → `#driveRestartedRepairPhase` at 595); not a spec vector table; no prior filing tracks this root cause (PTQ-1276 is the D9 breakdown of the same file, PTQ-0693 is a tests/ builder clone) — the fix is a mechanical in-module dedupe with the behaviour-preserving flags the filing names (triage: claude-fable-5-1)
