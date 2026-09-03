# Bug 0375 — The excised degraded-state machinery still ships: `ThetaRegistry.markRuntimeDegraded`, the `"degraded-needs-reload"` tag value, a three-arm `routeDrainStateArm`, the retired `"extension degraded; /reload to recover"` note, and an orphan slash-site read-failover that routes a `readDrainState` throw to the retired arm (c) instead of PIC-31's arm (b)

- **Status:** fixed (0.380.0).
- **Sev/Diff estimate:** S4/D1 — S4: none of the retained machinery is
  reachable from a production entry point at this HEAD (the shipped slash path
  uses `resolveSlashDispatchWithReadFailover`, whose catch correctly routes to
  arm (b); `markRuntimeDegraded` has no production caller), so this is
  dead-code-vs-spec inconsistency, not a live wrong value. It is reported
  because the spec text is unusually explicit that these exact members were
  **excised**, because PIC-29/PIC-30 pin the arm enumeration "closed at two
  arms … a third arm or an alternative gating field is forbidden", and because
  the surviving public writer makes the retired note one future call away.
  D1: deletions plus one catch-arm correction.
- **Kind:** defect — doc/registry-vs-implementation inconsistency (impact
  class 5), with one latent behavioural landmine (the orphan helper's wrong
  fail-safe arm).
- **Related:**
  - 0216 (fixed 0.153.0) — precedent that drain/shutdown seams retained
    against the reworked spec get filed and cleaned.
  - [bug 0371](./0371-tripwire-trip-sites-unwired.md) (this campaign) — the complementary
    half: the tripwire that REPLACED this branch is itself unwired (new
    machinery never wired vs retired machinery still shipping); together the
    retirement is half-applied in both directions. That report cross-cites
    this one; both fixes touch the `drainGatedHandler` dispatch head —
    sequence them, do not merge the reports.
- **Affected** (verified at 9474dfa8, v0.347.0):
  - `src/extension/reload-wiring.ts:135` — `export type DrainStateTag =
    "shutting-down" | "degraded-needs-reload"`; spec pins the field type as
    `"shutting-down" | undefined` and the value set "closed at the single
    literal `"shutting-down"`"
    (drain-state-contract.md *Fields* (2); session-shutdown-semantics.md
    sub-step 1 *unset tag fallback*).
  - `src/extension/reload-wiring.ts:256-262` — `markRuntimeDegraded()` sets
    the retired tag "unconditionally"; the drain-state page's supersession
    header says this writer "ha[s] been **excised**". No production caller
    (`rg markRuntimeDegraded src/ extensions/` → declaration + comments
    only).
  - `src/extension/drain-state.ts:22-24, 37-39, 63-73` — the `DispatchArm`
    union, `degradedNote` (`theta /<name>: extension degraded; /reload to
    recover` — the note the tripwire page says is retired), and
    `routeDrainStateArm`'s arm-(c) branch keyed on the retired tag. PIC-29's
    tuple map is "closed at two arms".
  - `src/extension/drain-state.ts:94-110`
    (`routeSlashDispatchWithReadFailover`) — an exported slash-site
    read-failover whose catch routes a `readDrainState` throw to
    `"degraded-needs-reload"`. PIC-31 pins the slash-site catch arm as arm
    (b): "the dispatch MUST short-circuit on arm (b) (returning the `"theta
    /<name>: extension shutting down"` system note)". Orphaned — production
    uses `resolveSlashDispatchWithReadFailover` (`:187-197`, correct arm (b));
    if any future caller picks the similarly-named helper, dispatch on a
    read throw yields the retired degraded note.

## Summary

`session-only-degraded-state.md:3` records the `governed-by-rebind`
resolution: "The former `ThetaRegistry.markRuntimeDegraded` writer, the
`"degraded-needs-reload"` value of `drainStateTag`, and `readDrainState` arm
(c) have been **excised**", and `drain-state-contract.md`'s partial-
supersession header restates it, reducing `readDrainState` routing to two
reachable arms. The implementation retains all four excised members plus the
retired note text, and one of the two exported slash-site read-failovers
implements the pre-rework arm-(c) fail-safe that PIC-31's live text
contradicts.

## Reproduction

Reading-level (no probe needed for the inconsistency): the cited lines exist
at HEAD; `rg` shows `markRuntimeDegraded` and
`routeSlashDispatchWithReadFailover` have no production caller. Behavioural
demonstration of the latent arm: `const r = new ThetaRegistry();
r.markRuntimeDegraded(); resolveSlashDispatch("x", r.readDrainState(), r)`
returns `{ kind: "note", content: "theta /x: extension degraded; /reload to
recover" }` — a note the live spec says no longer exists.

## Expected behaviour

Per the excision: no `markRuntimeDegraded` method, tag type
`"shutting-down" | undefined`, `routeDrainStateArm` closed at two arms, no
degraded note template, and the slash-site read-failover's catch arm fixed at
arm (b) (which the production-called variant already does).

## Actual behaviour / root cause

The V9r rework (tripwire) landed the new machinery beside the old instead of
replacing it; the retained V9m-era members still carry pre-rework doc
comments ("the closed three-arm slash-dispatch routing", "arm (c)
`degraded-needs-reload`" — drain-state.ts:1-24) that cite the superseded
contract text.

## Why it matters

Two named exports differing only by `route`/`resolve` prefix implement
opposite PIC-31 fail-safes; the wrong one is the one whose doc comment claims
PIC-31 compliance. Every future consumer choosing by name/JSDoc gets the
retired arm. The retained public writer also keeps a forbidden third
observable state representable on the wire (`readDrainState().tag ===
"degraded-needs-reload"`), which PIC-30 forbids the runtime to introduce.

## Non-goals

- No claim of a currently reachable wrong value; the production dispatch and
  shutdown short-circuit paths are conformant at this HEAD.

## Fix

Delete `markRuntimeDegraded`, the `"degraded-needs-reload"` union arm,
`degradedNote`, `routeSlashDispatchWithReadFailover`, and
`routeDrainStateArm`'s arm-(c) branch (collapse `DispatchArm` to two arms +
note); sweep the module headers' three-arm prose. The suite already knows:
the comment at `tests/drain-state-contract.test.ts:214-220` labels
`routeSlashDispatchWithReadFailover` "vestigial … [it] still returns the
excised arm (c)", while the same suite asserts the excised arm as contract —
the degraded tuple rows (`:51-52`), the degraded short-circuit and note
cells (`:69-74`, `:81-83`), the three-arm PIC-30 enumeration (`:94-97`), and
the PIC-31 arm-(c) failover cells (`:121-133`). The fix must retire those
assertions in the same commit; `npm test` will localise any others.

## Provenance

Found by diffing drain-state-contract.md's supersession header against the
shipped drain-state surface; caller topology via `rg`; the latent note
witnessed through the exported helpers.

## Fix (0.380.0)

- What shipped:
  - `src/extension/reload-wiring.ts` — deleted `ThetaRegistry.markRuntimeDegraded`; narrowed `DrainStateTag` to the single literal `"shutting-down"`; swept the drain-state contract prose to the three-method / two-writer / single-literal surface (§Fix items 1–2).
  - `src/extension/drain-state.ts` — collapsed `DispatchArm` to `"dispatch" | "shutting-down"`, deleted `degradedNote`, deleted `routeDrainStateArm`'s arm-(c) branch, deleted the orphan `routeSlashDispatchWithReadFailover`, and removed `resolveSlashDispatch`'s arm-(c) branch; swept the three-arm header prose (§Fix items 3–5). The production `resolveSlashDispatchWithReadFailover(name, read, registry)` (PIC-31 arm (b)) and `evalShutdownShortCircuitWithReadFailover` are untouched.
  - `tests/drain-state-contract.test.ts` — retired the doc's own excised-arm enumeration to the two-arm contract: the degraded tuple rows, the degraded short-circuit + note cells, the PIC-30 three-arm enumeration, the two PIC-31 arm-(c) failover cells, and the "vestigial" comment; imports of the deleted exports removed.
  - `tests/session-swap-tripwire.test.ts` (parent-ratified, subject-preserving) — dropped the `markRuntimeDegraded` spy and its `.not.toHaveBeenCalled()` use, re-anchored `.not.toBe("degraded-needs-reload")` → `.toBe("shutting-down")` (the session-only teardown runs `drain()` then `initDrainStateTag()`); the `RUNTIME_DEGRADED_CODE` import + emission check and the file-level header are intact. Exact edited lines: the `degradeSpy` declaration (was ~:208), its `expect(...).not.toHaveBeenCalled()` use (was ~:225), the re-anchored tag assertion (was ~:226), and the comment describing them (was ~:222–224).
  - `tests/b0375-degraded-excision-witness.test.ts` (new, offline) — witnesses the surface + export absence of the retired members and the behavioural death of the latent degraded note (a marked registry now dispatches instead of returning the retired note), plus a two-arm `routeDrainStateArm` surface pin.
- Gates: witness `tests/b0375-degraded-excision-witness.test.ts` 4/4 green (red-at-fork 3/4 proven by a HEAD-blob revert, restored byte-exact); full default suite 552 files / 10236 tests green (baseline 10234 + 4 witness − 2 retired contract cells); `npm run typecheck` exit 0; `npm run lint` exit 0.
- Review: 1 review round (`bug-fix-reviewer`) — FINDINGS, all prose (stale three-arm / fourth-arm / three-writers / all-three-throw prose), no correctness/fidelity/spec blocker; 1 polish round (`bug-fix-fixer-light`) swept 8 comment/title sites; post-polish confirmation round skipped (gate-diff shows comment/title-only hunks, gates green).
- Verification: SOLID — (1) the witness reds when the four tracked files are reverted to HEAD (cells 1–3 red for the documented reasons, cell 4 green) then greens 4/4 after byte-exact restore (5/5 `git hash-object` match); (2) full default suite green; (3) live adjacent cell `tests/live/double-session-start-live.test.ts` green (a real `session_start → session_shutdown → dispose` and a `/greetlive` dispatch through the retained drain-state arm-(b) "extension shutting down" path — 0375 changes no registration/drive outcome); (4) `typecheck` + `lint` clean.
- Residuals: none.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: no currently-reachable wrong value (S4) — grep confirmed no production caller reached any deleted export (the only surviving `markRuntimeDegraded` / `degraded-needs-reload` mentions in `src/` are spec-citation comments in `session-shutdown.ts` and `session-swap-tripwire.ts` describing what the code does NOT do). 0371's landed tripwire wiring is untouched beyond the two parent-ratified references.
