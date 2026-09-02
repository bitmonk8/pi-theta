# Bug 0329 — a child-side callable-hash mismatch does not refuse the invocation: the diverged callable is dropped only from the child's slash registry (which nothing consults), the marked root still registers and runs, and the edited callee remains fully dispatchable through the frozen-entry path — so the spec's fail-closed refusal is detection with no enforcement

- **Status:** fixed (0.322.0).
- **Sev/Diff estimate:** S2/D3 — S2 because the contract's one enforcement
  point is a no-op for every production-reachable mismatch: the invocation
  the spec says MUST be refused proceeds, the edited callee the hash
  flagged still runs (re-parsed from current disk bytes at dispatch), and
  the mismatch diagnostic lands on the child's private notify channel —
  which a real child's parent never reads (the parent consumes only the
  PIC-59 envelope) — so from the parent's vantage the outcome is
  indistinguishable from a clean run. Combined with bug 0328 the
  entire `#subagent-theta-callable-hash` apparatus has no production
  effect. D3 because "refuse the invocation" needs a decision: fail the
  marked root (emit the load_failure envelope) on ANY mismatch, or gate
  the specific callable's dispatch — the spec text supports the former,
  the shipped drop-from-registry gestures at the latter, and neither is
  wired to anything dispatch consults.
- **Kind:** defect — the implementation's own comment claims an
  equivalence ("a refusal recorded during the child's discovery pass
  refuses that invocation") that holds only when the mismatched name IS
  the marked root, a case production marshalling never produces (report
  01).
- **Related:**
  - [0328](./0328-root-callee-closure-hash-never-marshalled.md) — production maps never contain the
    root, so the one case where the drop WOULD refuse the invocation is
    unreachable; together the two close the apparatus end to end.
  - [0330](./0330-as-renamed-callable-spurious-hash-mismatch.md) — the `as`-rename variant where the drop
    additionally cannot even locate a theta to drop.
  - 0312 (open) — describes its subagent observable as "a drive-time
    `subagent-callable-hash-mismatch` refusal"; per this report the
    refusal is a child-side notify line plus a registry drop, and the
    stale-hashed callable still dispatches.
- **Affected** (at ee681f7b, v0.287.0):
  - `src/extension/production-composition.ts:1236–1340`
    (`refuseDivergedChildCallables`) — "refuses" = `thetas.filter(...)`
    over the discovered list + `emitDiagnostic`; nothing else.
  - `src/extension/production-composition.ts:1183`
    (`markedRootRegistrationRefusal`) — the only bridge from a drop to an
    invocation-level refusal; keys on the marked root's own slug.
  - `src/extension/production-theta-producer.ts` `#classifyCall` /
    `#resolveCallAsInvoke` / `#resolveInvoke` (by symbol) — callable
    dispatch resolves through the ROOT theta's frozen callable-set entry
    (`calleePath`) and a fresh dispatch parse from disk; no site consults
    the marshalled hash map or the dropped-thetas set after compose.
  - `src/runtime/subagent-child-hash-verify.ts` `verifyChildCallableHashes`
    (by symbol) — pure verdicts, correct on their own terms; the gap is
    what the caller does with a refusal.
- **Observed at:** v0.287.0 (ee681f7b), offline — deterministic vitest
  probe (deleted after confirmation; recipe below), `discoverAndComposeFixtures`
  with the authenticated control-plane env planted.

## Summary

subagent.md `#subagent-theta-callable-hash`: "The child verifies each hash
after its own parse and **refuses the invocation on mismatch** with a
precise diagnostic (`theta/runtime/subagent-callable-hash-mismatch`,
fail-closed…)". One child process serves exactly one invocation, so "the
invocation" is the child's run of the marked root. The shipped refusal
removes the mismatched callable's theta from the compose output — the set
that feeds `pi.registerCommand` and the child's slash registry. A subagent
child dispatches nothing by slash except the marked root itself; the root
dispatches its callables through its OWN frozen callable-set entries,
whose `calleePath` is re-parsed from disk at dispatch
(`parseCalleeForDispatch` lineage, the SUBAG-2/Gap-2 design). Dropping the
callable's theta from the registry therefore removes nothing the
invocation uses.

## Reproduction

Offline, deterministic. Workspace:

```
.pi/theta/zqx-main.theta    ---\nmode: subagent\ntools:\n  - ./zqx-helper.theta\n---\nlet r = zqx_helper("hi")\n@`use ${r}`
.pi/theta/zqx-helper.theta  ---\nmode: subagent\nparams:\n  q: string\n---\n@`EDITED helper body ${q}`
```

Env (authenticated): `PI_THETA_SUBAGENT_PARENT_PID=<ppid>`,
`PI_THETA_SUBAGENT_ROOT=zqx-main`,
`PI_THETA_SUBAGENT_CALLABLE_HASHES={"zqx_helper":"sha256:stale-parent-recorded-hash"}`
(production-shaped: the parent recorded the pre-edit helper hash).

`discoverAndComposeFixtures` observed output:

- notifications: `subagent callable 'zqx_helper' content hash mismatch;
  refusing invocation` (the pinned message fires — detection works);
- registered: `['zqx-main']` — the marked root registers; no
  `load_failure` envelope is owed or emitted
  (`markedRootRegistrationRefusal` sees the root in `registeredSlugs`);
- `zqx-main`'s frozen callable set still carries `zqx_helper` with its
  `calleePath`; a body call `zqx_helper("hi")` classifies against that
  entry and dispatch-parses `./zqx-helper.theta` — the edited bytes —
  spawning the grandchild with a hash map freshly computed FROM the edited
  bytes, which the grandchild then verifies successfully.

## Expected behaviour

The invocation is refused fail-closed: the parent receives the refusal
(for a mismatch on any marshalled callable, the child never runs the root
body), per the quoted MUST. The natural carrier exists: drop the marked
root alongside the diverged callable, letting
`markedRootRegistrationRefusal` emit the PIC-59 `load_failure` envelope
whose second arm the spec already reserves for "the callable-hash
mismatch" (subagent.md §Marked-root registration refusal names it as a
reachable refusing-diagnostic-without-file case).

## Actual behaviour / root cause

`refuseDivergedChildCallables`'s refusal is scoped to the discovered-theta
list. Its own header comment asserts the vantage equivalence ("One child
process serves exactly one subagent-mode invocation … a refusal recorded
during the child's discovery pass refuses that invocation"), which is true
only when the dropped theta IS the marked root — and the map key set that
could name the root is never produced in production (bug 0328). For every
production mismatch the refusal's total effect is: one notify line in the
child's private session, one absent slash registration nobody dispatches.

## Why it matters

- The hash contract exists to stop "the child silently run[ning] a callee
  the parent never validated"; after detection succeeds, exactly that
  happens.
- The laundering is complete: the child's own compose recomputes the
  entry's closure hash from the edited bytes
  (`attachLoadTimeClosureHashes` in the child), so the grandchild launch
  marshals the post-edit hash and every downstream verification passes.
- The diagnostic's channel makes the failure unobservable where it
  matters: the parent's contract surface is the envelope
  (subagent.md PIC-59 — "the parent … ignores every other line").

## Non-goals

- Whether per-callable dispatch gating would be a better refusal shape
  than failing the root — a fix-time adjudication; the report claims only
  that the shipped drop implements neither.
- The parent-side map contents — bug 0328.

## Fix

Option A (matches the spec text and the shipped envelope machinery): on
any refusal in `verifyChildCallableHashes`, also drop the marked root from
the survivors so `markedRootRegistrationRefusal` fires and the parent gets
`Err(InvokeInfraError{cause:"load_failure"})` naming the hash-mismatch
diagnostic. One-line-ish at
`production-composition.ts:1167`'s call site; regression-lock with the
existing e2e harness by asserting the ROOT absent (today it asserts only
the callable absent). Option B (narrower blast radius): thread the refusal
set into the root's callable-set snapshot and refuse at dispatch with the
same code. Option A recommended — it is what "refuses the invocation"
says, and B leaves a mismatch invisible until (unless) the callable is
called.

## Provenance

Bug-hunt area `subagent-integrity`, seed hypothesis 3 (refusal-path
mechanics). Probed offline at ee681f7b; probe deleted after confirmation.

> **Coordination note (2026-08-30, from the 0330 fix lane, 0.307.0):** the drop-target compare this fix makes load-bearing — `sourcePath.replace(/\/g, "/") === calleeAbs` inside the `thetas.find` that locates the callable to drop (`production-composition.ts`, re-anchor by symbol; the 0330 insertion shifted line numbers) — is case-SENSITIVE. On a case-insensitive filesystem an author-written case-mismatched `tools:` spec still hash-verifies (the FS resolves the sources) but the find misses, so under Option A the refusal would not drop the root and the invocation would NOT refuse. When implementing, case-fold the compare (or compare canonicalised real paths) so the enforcement this report owns cannot be routed around by path casing. Evidence: 0330 fix-lane report, Residual 1.

## Fix (0.322.0)

- What shipped:
  - `src/extension/production-composition.ts` (`refuseDivergedChildCallables`) — Option A: on ANY callable-hash mismatch, `dropped.add(markedRoot)` so the marked root does not register and `markedRootRegistrationRefusal` emits the PIC-59 `load_failure` envelope (§Fix). Scoped to the marked-root regime (`markedRoot` undefined ⇒ prompt-mode children keep today's behaviour). The refusal diagnostic is stamped `file: markedRoot.sourcePath` so the envelope's FIRST arm names `theta/runtime/subagent-callable-hash-mismatch` (§Fix "naming the hash-mismatch diagnostic"). The callee-locate compare now goes through a `Map<fs.realpath(sourcePath)→theta>` keyed by canonical real path (gated by `fs.exists`; ENOENT ⇒ normalized-exact fallback; any other realpath error crashes, fail-closed) — discharges the 2026-08-30 coordination note (case-fold via canonical real paths), correct on both case-insensitive and case-sensitive filesystems with no manual probe.
  - `tests/b0329-hash-mismatch-refuses-invocation.test.ts` (NEW, 5 cells A–E, offline via `composeExtensionInstance` with a capturing `emitResultEnvelope`): (A) envelope + root absent; (B) grandchild-laundering fence (root+callee absent from the dispatch surface); (C) clean-hash control (no false refuse); (D) case-fold, asserting loudly on BOTH filesystem branches (no silent skip); (E) any-of-many mismatch refuses the root.
  - `tests/subagent-child-hash-refusal-e2e.test.ts` cell F — doc-pre-authorized root-absent strengthening: `toContain("zqx-caller")` → `.not.toContain("zqx-caller")`; the b0330 `as`-rename subject preserved.
  - `tests/b0343-proto-hash-carrier-row.test.ts` cell C-drop — PARENT-RATIFIED second instance of 0329's pre-authorized root-absent strengthening: `toContain("proto-caller")` → `.not.toContain("proto-caller")`; the `__proto__` callee-drop + mismatch-note subject preserved. Ratification (verbatim): "The b0343 C-drop root-survival assertion is RATIFIED to flip to root-absent (.not.toContain('proto-caller')) as the SECOND instance of 0329's doc-pre-authorized root-absent strengthening (cell F being the first). The cell's subject — the diverged __proto__ callee drops with theta/runtime/subagent-callable-hash-mismatch — is preserved unchanged; the root-survival observation was pre-0329 scaffolding that postdates the 0329 filing (b0343 landed v0.320.0). No other existing-cell change is authorized."
  - `docs/spec_topics/pi-integration-contract/subagent.md` §"Marked-root registration refusal" — doc-truth alignment (orchestrator-adjudicated, bounded; see Residuals R1): removed the callable-hash mismatch from the no-file (second-arm) example list and added a one-clause first-arm example, because the `file:` stamp now attributes the mismatch to the marked root's file. Normative MUST and both arm definitions byte-unchanged.

- Gates:
  - Witness: `npx vitest run tests/b0329-hash-mismatch-refuses-invocation.test.ts` → 5 passed. Revert-red (Option A root-drop disabled in place) reds cells A/B/D/E for the stated reason (`captured envelopes: []` / root survives), byte-exact restore (`git hash-object` = `75543919440c352ef6370097468b8b3d36db5ac2`), green after.
  - Full suite: `npm test` → `Test Files 501 passed (501)`, `Tests 9722 passed (9722)`.
  - Typecheck: `npx tsc --noEmit` (`npm run typecheck`) → exit 0.
  - Lint: `npm run lint` → exit 0.
  - Live: `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/b0342live-forwarded-enum-declaring-file-identity-live-cell.test.ts` (under the shared live-lock, lane tip) → 1 passed.

- Review: 2 rounds.
  - Round 1 (`bug-fix-reviewer`, deep): fix behaviour CORRECT and Option-A-faithful; raised F1 [spec] (stale second-arm example in subagent.md) + F2 [prose] (three "second arm" comments backwards vs. the first-arm runtime) + R1 [prose, non-blocking] STYLE "just". No correctness/fidelity blocker.
  - Round 2 (`bug-fix-reviewer-fast`, confirmation of the doc-truth remediation): CLEAN, no escalation; independently confirmed the STOP-valve held (normative MUST + both arm definitions byte-unchanged).

- Verification (`bug-fix-verifier`): SOLID.
  - Tests witness the bug: revert-red reds A/B/D/E, byte-exact restore, green after.
  - Full default suite: 501/9722 green.
  - Live e2e over the fixed composition-root path: b0342live 1/1 pass at the lane tip under the lock (run by the orchestrator; the verifier does not run live).
  - Typecheck + lint: clean.

- Residuals:
  1. F1/F2/R1 doc-truth remediation was orchestrator-adjudicated under the bounded-self-authorization branch (Question tool unavailable). Reason: the `file:` stamp routes the callable-hash mismatch to the envelope's FIRST arm (§Fix "naming the hash-mismatch diagnostic"), which falsified subagent.md's pre-existing no-file (second-arm) example. Three independent settling sources: §Fix "naming the hash-mismatch diagnostic"; subagent.md's own unchanged first-arm rule ("attributable to that theta's file → that diagnostic's code and message"); green cell A asserting the envelope message contains the mismatch code. Bound: edited only the subagent.md example enumeration (plus a one-clause first-arm example) and three code/test comments — NO normative-MUST change, NO arm-definition change, NO assertion/behaviour change. STOP valve (touch the MUST or an arm definition ⇒ stop) untripped and independently re-confirmed byte-unchanged by the round-2 reviewer.
  2. The bug doc §Expected phrasing ("the envelope's second arm … a refusing-diagnostic-without-file case") is inconsistent with the settled §Fix ("naming the hash-mismatch diagnostic" = first arm). The implementation follows §Fix (first arm, `file:` stamp); §Expected's "second arm" wording is where the bug document was imprecise.

- Discharge notes appended: none.

- Pinned dispositions / non-goals:
  - Option B (thread the refusal set into the root's callable-set snapshot and refuse at dispatch) rejected by the parent — it leaves a mismatch invisible until (unless) the callable is called.
  - Per-callable dispatch gating (§Non-goals) not pursued.
  - Bug 0331 (marshalling source ORDER/priority) untouched — the change alters only the child-side refusal blast radius and the callee-locate compare.

> **Coordination note (0.368.0, from the 0379 fix lane):** bug 0379's byte-match discipline now refuses a case-variant `tools:` `.theta` entry at load with `theta/load/unresolvable-theta-path` (the entry basename must byte-match the on-disk basename), so cell (D)'s case-insensitive branch in `tests/b0329-hash-mismatch-refuses-invocation.test.ts` was re-anchored to a byte-matched entry: the incidental mid-word case-variance carrier is gone, and the cell witnesses the hash-mismatch root-drop subject unchanged (a byte-edited callee drops the root with `theta/runtime/subagent-callable-hash-mismatch`, callee dropped alongside via the canonical-realpath compare). This fix's own callee-locate case-fold compare stays as landed; 0379 removes the input that reached it via a case-variant `tools:` entry.
