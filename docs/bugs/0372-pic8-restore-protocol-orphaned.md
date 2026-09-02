# Bug 0372 — The PIC-8/PIC-19-compliant active-set gate (`withActiveSetGate`, tool-registration.ts) has no production caller: the shipped query window restores through a bare `finally` in `withActiveSetGating`, so a restore throw masks the query's outcome, gets no single re-attempt, and emits neither `theta/runtime/active-set-restore-failed` nor the mandated display note — leaving the theta's install vector active on the user session with zero diagnostics

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2: the trigger is a host-side
  `pi.setActiveTools` throw at restore time (rare on a healthy host, the case
  PIC-8 exists for), but the consequences stack: the completed query's result
  (or the real inner error) is replaced by the restore throw (PIC-8(d)
  violated), a transient one-shot failure that a single retry would absorb
  instead aborts the theta, the mandated E-severity code and the operator
  note ("the user session may have unexpected tools active. Run /reload to
  reset.") are unemittable from production, and the user session keeps the
  theta's callable set active silently. D2: the compliant wrapper exists and
  is tested; the fix is substituting it (or porting its restore) at the three
  production sites and threading `emitDiagnostic`/`emitSystemNote` deps.
- **Kind:** defect — a spec-mandated failure protocol implemented in a module
  with no production caller while the shipped path uses a bare variant; the
  same wiring class as bugs 0073/0216 and the tripwire sibling report filed
  alongside this one.
- **Related:**
  - 0073 (fixed 0.130.0) — mandatory diagnostic constructed by a function with
    no production caller; identical class.
  - 0023 (fixed 0.34.0) — production composition omitted built seams.
  - 0319 (fixed 0.339.0) — sibling prompt-mode drive obligation
    (bidirectional `ctx.abort`) that was likewise implemented nowhere until
    filed; same drive surface as this report's site 1.
- **Affected** (verified at 9474dfa8, v0.347.0):
  - `src/runtime/tool-registration.ts:119` (`withActiveSetGate`) and `:163`
    (`restoreActiveSet`) — the full PIC-8(a)–(d) + PIC-19 implementation
    (single re-attempt, `theta/runtime/active-set-restore-failed` with
    `hint` = snapshot names, verbatim display note, swallow-so-inner-error-
    propagates, install-throw → `routeInternalError`). `rg withActiveSetGate`
    over `src/` finds no caller outside the module; only
    `tests/tool-registration-lifetime.test.ts` exercises it.
  - `src/runtime/conversation-drive.ts:84-103` (`withActiveSetGating`) — the
    gate the shipped producer actually uses: step-4 restore is the bare
    `gate.setActiveTools(snapshot)` at `:102` inside `finally`; no retry, no
    diagnostic, no note, and a restore throw replaces the in-flight
    completion (JS `finally` semantics).
  - `src/extension/production-theta-producer.ts:5216` — the production
    prompt-mode query window (`await withActiveSetGating(this.#pi, install,
    …)`), enclosed by a `try…finally` with no catch (`:5367`), so a restore
    throw propagates into the drive's outer defect handling.
  - `src/extension/production-theta-producer.ts:6711/6770`
    (`driveStreamedUserTurn`) — a second inline bare snapshot/install/restore
    (`deps.pi.setActiveTools(ambientTools)` in `finally`), same gap.
  - `src/runtime/invoke-prompt-suspend.ts:117-124` (`runPromptSuspendInvoke`,
    called from the producer at `production-theta-producer.ts:3936`) — the
    prompt → prompt cross-mode `invoke` window: bare
    `pi.setActiveTools([...snapshot])` in `finally` at `:123`, no retry,
    diagnostic, or note. In PIC-8's own scope sentence
    (`tool-registration-lifetime.md:18`): the rule "applies only to the
    prompt-mode and prompt → prompt cross-mode `invoke` snapshot/restore
    paths".

## Summary

`tool-registration-lifetime.md` PIC-8 (`docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:18`)
pins the restore-failure protocol on the step-4 restore of the PIC-17
snapshot/swap/restore window: "(a) re-attempt the restore exactly once …; (b)
on a second failure, emit `theta/runtime/active-set-restore-failed` (E,
runtime) …; (c) emit a `display: true` `theta-system-note` … `theta: failed to
restore tool active-set after /<name>; the user session may have unexpected
tools active. Run /reload to reset.` …; and (d) propagate the original
exception (or terminal `Err`) that the `finally` was protecting — restore
failure does not mask the inner error." The repository contains a compliant
implementation, and the production query path does not call it: all three
shipped snapshot/restore windows restore bare.

## Reproduction

Scratch probe (deleted; vitest, offline) on the shipped helper:

```ts
const gate = { getActiveTools: () => ["ambient-tool"],
  setActiveTools: (names) => { record(names);
    if (names[0] === "ambient-tool" && ++restoreAttempts === 1)
      throw new Error("transient restore failure"); } };
await withActiveSetGating(gate, { thetaCallableSetNames: ["theta-tool"] },
  async () => "QUERY-OK");
```

Observed: the call throws `transient restore failure`; `restoreAttempts === 1`
(no re-attempt); the query's `"QUERY-OK"` result is lost (masked); install
history `[["theta-tool"],["ambient-tool"]]` — the second (restore) call threw,
so the user session's active set remains `["theta-tool"]`. No
`theta/runtime/active-set-restore-failed`, no note (the helper has no
diagnostic deps at all — the protocol is unimplementable from its signature).

Per PIC-8 the same input must yield: second restore attempt (succeeding here),
result `"QUERY-OK"`, ambient set restored, zero diagnostics.

## Expected behaviour

PIC-8(a)–(d) as quoted above; PIC-19 additionally routes a step-1/step-2 throw
to the `theta/runtime/internal-error` channel with the query not proceeding —
`withActiveSetGating` lets a step-2 install throw propagate raw with no
routing (`conversation-drive.ts:94`), relying on whatever outer catch exists
at each caller.

## Actual behaviour / root cause

Two parallel gate implementations exist. `withActiveSetGate`
(tool-registration.ts) implements the full protocol and is orphaned;
`withActiveSetGating` (conversation-drive.ts) implements only the happy-path
snapshot/install/restore and is what `production-theta-producer.ts:5216` (the
model-facing query turn, both untyped and typed/forced-respond) and
`driveStreamedUserTurn` (`:6711/6770`) call. Grep evidence:
`rg -n "withActiveSetGate\b" src/` → declaration only;
`rg -n "withActiveSetGating" src/` → conversation-drive declaration +
production-theta-producer:140 (import), :5216 (call).

End-to-end symptom on the shipped path: a restore throw exits the gating
`finally`, unwinds through the producer's listener-detach `finally`
(`:5367-5377`), and surfaces as a drive-level defect (internal-error framing)
— the wrong code, at the wrong site, having destroyed a completed turn's
result, with the session's active set still holding the theta's install
vector and the operator note that names exactly that hazard never emitted.

End-to-end witness (dead-enforcement-sweep, same worktree, same sha; b0288-
pattern harness): real `production-theta-producer` over an instant-settle
session double, gate whose `setActiveTools` throws from call 2 on — the
query's success result `604` is masked out of `executeBody` by the raw
restore throw, confirming the masking end-to-end on the shipped composition,
not only on the helper in isolation.

## Why it matters

The active set is user-session state: failing to restore it silently changes
which tools the user's own model sees after the theta returns. PIC-8 exists so
that (i) a transient host hiccup does not abort a completed query, and (ii) a
persistent one is loudly attributed (`active-set-restore-failed` + note)
rather than surfacing as a generic theta abort while the session stays
polluted. Both properties are absent on every shipped prompt-mode invocation.

## Non-goals

- Subagent-mode invocations — correctly out of PIC-8's scope (child-scoped
  tools).
- The PIC-64(e) host-loop dispatch snapshot/restore
  (`production-host-loop-dispatch.ts:497/541`) has its own protocol under
  subagent.md and is not assessed here.
- No claim that `withActiveSetGate`'s own logic is wrong — its unit tests
  pass; the defect is the wiring.

## Fix

Options: (1) replace `withActiveSetGating` calls with
`withActiveSetGate` (threading `emitDiagnostic` / `emitSystemNote` /
`routeInternalError` deps already available in the producer) and delete the
bare helper; (2) port `restoreActiveSet` into `withActiveSetGating` and add
the PIC-19 install-side routing. (1) is recommended — one implementation of a
wire-contract protocol, matching bug 0073's "one implementation of the
fallback forms" precedent. Either way the inline window in
`driveStreamedUserTurn` (`:6711/6770`) and the cross-mode window in
`runPromptSuspendInvoke` (`invoke-prompt-suspend.ts:117-124`) must be
converted too. Same commit: replace the stale docstring at
`tool-registration.ts:110-118` — it still describes `withActiveSetGate` as a
"V9f-T stub: runs `body()` directly with NO snapshot/swap/restore" above the
fully implemented function. Verify both
directions: transient-throw → retry+result preserved; double-throw → code +
verbatim note + inner completion propagated.

## Provenance

Found by enumerating `pi.setActiveTools` call sites, diffing the two gate
implementations against PIC-8/PIC-19, and confirming caller topology with
`rg`. Divergence witnessed offline on the shipped helper (probe above,
deleted).
