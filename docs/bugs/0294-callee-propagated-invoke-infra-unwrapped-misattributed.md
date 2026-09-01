# Bug 0294 — a callee-returned `Err` whose `kind` is `invoke_infra` passes the parent's XMODE-1 wrap unwrapped (`effectful-statement-host.ts:433`), so a grandchild's infra failure propagated by the callee reaches the grandparent as the callee's OWN infra failure: `/infratop → infraleaf → ./missing.theta` renders `theta /infratop returned Err: invoke of ./missing.theta failed (…)` — a path infratop never invoked, with no `invoke_callee` hop naming infraleaf and no SLSH-5 chain suffix — where invocation.md says an `Err` the callee itself returned is wrapped and the wrap rule's own comment says "each invoke hop adds exactly one wrapper"

- **Status:** fixed (0.326.0).
- **Sev/Diff estimate:** S2/D3 — S2 on wrong attribution of a loud failure:
  the parent's `Err` names a `callee_path` the parent never invoked, its
  `kind` is `invoke_infra` where the spec shape is `invoke_callee` (so a
  parent `match`ing `InvokeCalleeError { inner, ... }` — the documented shape
  for "my callee failed" — takes the wrong arm), and the SLSH-3 note carries
  no SLSH-5 hop suffix because the provenance ledger records hops only
  against `invoke_callee` wrappers. Not S1: an `Err` always surfaces and no
  value binds. D3 because the exemption exists to solve a real ambiguity —
  the same result channel carries THIS hop's trampoline-minted infra errors
  (which must NOT be re-wrapped, per the panic row of error-model.md's
  per-cause table) and the callee's own propagated infra `Err`s (which must
  be) — so a fix has to thread provenance (which side of the boundary minted
  the error) through `InvokeChild.drive()` / the envelope consumption rather
  than discriminate by `kind`.
- **Kind:** defect — the wrap rule discriminates by `kind` where the spec
  discriminates by provenance. Elements, measured or source-traced at
  `bc52da38` (v0.287.0):
  1. *The exemption.* `runInvokeEffect`'s wrap
     (`src/runtime/effectful-statement-host.ts:432–435`):
     `if (innerKind === "invoke_infra" || innerKind === "cancelled") return
     result;` — every other callee-returned `Err` is wrapped via
     `surfaceThetaCallableCalleeFailure` (`:436–440`;
     `src/runtime/tool-call.ts:804`). The comment justifies the
     `invoke_infra` arm as "an infra-side error the trampoline already
     produced (panic / internal_error / return_validation …)" — true of the
     trampoline-minted case, false of a callee that RETURNED an
     `invoke_infra` `Err` it got from its own nested invoke.
  2. *The spec rule is provenance-shaped, not kind-shaped.*
     `invocation.md:75`: "`InvokeCalleeError` wraps an `Err` the callee
     itself returned; `inner: QueryError` is the callee's original failure."
     A callee whose body ran `invoke("./missing.theta")?` returned that
     `Err`; its kind is irrelevant to the rule. The wrap comment itself
     states the invariant for the recursive case: "`invoke_callee` is NOT
     special-cased: each invoke hop adds exactly one wrapper (the SLSH-5
     chain)" (`:429–431`) — and then the `invoke_infra` exemption removes a
     hop from that chain.
  3. *Measured end-to-end.* Planted workspace, shipped composition root:
     `infratop.theta` invokes `infraleaf.theta`; `infraleaf` invokes the
     missing `./missing.theta` and `?`-propagates. Both dispatches render the
     SAME note body:
     `theta /infraleaf returned Err: invoke of ./missing.theta failed (internal_error)`
     `theta /infratop returned Err: invoke of ./missing.theta failed (internal_error)`
     — infratop's note names a file two hops away, carries no
     ` from <infraleaf> invoked at <infratop>:4` suffix, and its author-visible
     `Err` value is the raw grandchild `InvokeInfraError` (no
     `invoke_callee`, no `inner`). (The `internal_error`-vs-`load_failure`
     spelling is candidate 03's separate defect; the attribution failure here
     is independent of which cause it carries.)
  4. *Same seam, subagent leg.* For a subagent-mode callee the envelope `err`
     arm is settled verbatim by `driveSubagentChild`
     (`src/runtime/subagent-json-driver.ts:155`) and reaches the same
     `runInvokeEffect` switch, so a child process's propagated
     `invoke_infra` is equally mis-attributed. INV-5 pins the parity this
     breaks: "`InvokeCalleeError` wrapping is applied to the reconstructed
     leaf exactly as for an in-process callee" (`invocation.md:36`).
- **Related:**
  - **0088** (fixed) — built the SLSH-5 hop chain this exemption drops: the
    provenance ledger records against `invoke_callee` wrappers
    (`src/runtime/invoke-provenance-ledger.ts:24`: "WHICH WRAPPERS CARRY A
    HOP"), so an unwrapped propagation contributes no hop and the boundary
    note renders suffix-free.
  - **Candidate 03** (this hunt) — the cause-spelling defect the same fixture
    witnesses; independent mechanisms, one probe.
  - **Candidate 05** (this hunt) — the `cancelled` half of the same
    exemption line, governed by its own two-arm rule in cancellation.md.
- **Affected** (verified at `bc52da38`, v0.287.0):
  - `src/runtime/effectful-statement-host.ts:415–441` — the XMODE-1 wrap and
    its two-kind exemption (`:433`).
  - `src/runtime/tool-call.ts:804` — `surfaceThetaCallableCalleeFailure`, the
    wrapper builder the exemption bypasses.
  - `src/runtime/invoke-cancellation.ts:122–139` — the trampoline-minted
    infra errors that share the channel and motivate the exemption.
  - `src/runtime/subagent-json-driver.ts:155` — the envelope `err` arm's
    verbatim settle (subagent leg of the same seam).
  - `src/runtime/invoke-provenance-ledger.ts` — the hop chain that loses an
    entry per unwrapped propagation.
  - Spec: `docs/spec_topics/invocation.md:75` (the wrap rule), `:36` (INV-5
    wrap parity across legs);
    `docs/spec_topics/errors-and-results/queryerror-variants.md:186–197`
    (`InvokeCalleeError` — "the inner `QueryError` is the callee's original
    failure"); `docs/spec_topics/slash-invocation.md` SLSH-5 (per-hop chain
    suffix); `docs/spec_topics/errors-and-results/error-model.md:33` (the
    per-cause table's Panic row — the trampoline-minted case that must stay
    unwrapped).
- **Observed at:** v0.287.0 (`bc52da38`). Offline, deterministic,
  provider-free: the candidate-03 scratch probe (planted workspace, shipped
  `discoverAndComposeFixtures`, dispatch, `theta-system-note` capture);
  written, run, deleted. Note bytes quoted verbatim in Kind element 3.

## Summary

The invoke boundary must answer one question per hop: did THIS hop's
infrastructure fail (surface `InvokeInfraError` bare), or did the callee run
and return an `Err` of its own (wrap it in `InvokeCalleeError` so the parent
sees `callee_path` = its own callee and `inner` = the callee's original
failure)? The shipped rule answers by `kind`: any `Err` whose `kind` is
`invoke_infra` is presumed trampoline-minted and passes bare. But
`invoke_infra` is also an ordinary value a callee can RETURN — the callee's
own nested invoke failed infra-side and the callee `?`-propagated it, the
standard theta error-handling idiom. For that input the presumption is false
and three author-visible surfaces go wrong at once:

- the parent's `Err.kind` is `invoke_infra` instead of `invoke_callee`, so
  the documented "my callee failed" `match` arm misses;
- `callee_path` names the GRANDCHILD (a file the parent never invoked, and
  for a relative literal like `./missing.theta` one that is not even
  resolvable against the parent's directory);
- the SLSH-5 chain loses the hop: the note renders the leaf row with no
  ` from <callee> invoked at <parent>:<line>` suffix, because the ledger
  records hops only against `invoke_callee` wrappers.

Measured: a two-hop cascade renders byte-identical notes for `/infraleaf`
and `/infratop` — the operator cannot tell which theta's invoke failed.

The `cancelled` half of the same exemption line is candidate 05 (its own
two-arm spec rule). The exemption's legitimate core — a panic or internal
error the trampoline itself minted for THIS hop must stay bare (error-model.md
per-cause table, Panic row) — is real, which is why the fix needs provenance
(who minted the `Err`) rather than a kind test.

## Reproduction

Offline, provider-free, at `bc52da38` (shared fixture with candidate 03).
Plant under `<tmp>/.pi/theta/`:

- `infraleaf.theta` — `---\nmode: prompt\n---\ninvoke("./missing.theta")?`
- `infratop.theta` — `---\nmode: prompt\n---\ninvoke("./infraleaf.theta")?`

Compose via the shipped `discoverAndComposeFixtures`, dispatch `/infratop`,
read the `theta-system-note` channel. Observed verbatim:

```
theta /infratop returned Err: invoke of ./missing.theta failed (internal_error)
```

Expected shape per invocation.md:75 + SLSH-5 (given candidate 03's cause
defect fixed, the leaf cause would be `load_failure`; the attribution
observables are the same either way):

```
theta /infratop returned Err: invoke of ./missing.theta failed (load_failure) from <abs>/infraleaf.theta invoked at <abs>/infratop.theta:4
```

and the author-visible value
`Err(InvokeCalleeError { callee_path: "./infraleaf.theta", inner: InvokeInfraError { callee_path: "./missing.theta", … } })`.

## Expected behaviour

- `invocation.md:75`: "`InvokeCalleeError` wraps an `Err` the callee itself
  returned; `inner: QueryError` is the callee's original failure." The
  callee (`infraleaf`) returned the `Err` via `?`; the rule names no kind
  exemption.
- `queryerror-variants.md` §Invoke variants: `InvokeCalleeError.inner` is
  recursive over the whole union — `invoke_infra` is a member like any
  other.
- The wrap rule's own invariant (`effectful-statement-host.ts:429–431`):
  "each invoke hop adds exactly one wrapper (the SLSH-5 chain)".
- error-model.md:33 (per-cause table, Panic row): a panic in the callee
  reaches the parent as `InvokeInfraError { cause: "panic" }` — the
  trampoline-minted case that must remain bare. The two rules coexist only
  under a provenance discrimination.

## Actual behaviour / root cause

`runInvokeEffect` receives one merged `ResultValue` from
`child.drive()` carrying both provenances — the trampoline's own boundary
errors (`runInvokeChild`'s catch, the exit-without-envelope maps) and the
callee's returned `Err`s (in-process body outcome; envelope `err` arm) — and
has no marker distinguishing them, so it discriminates by `kind`
(`:432–435`). For `invoke_infra` (and `cancelled`, candidate 05) the two
provenances collide and the exemption picks the trampoline reading
unconditionally. Everything downstream is faithful to that wrong pick: no
wrapper → no ledger hop → no chain suffix → the leaf renders as the parent's
own failure.

## Why it matters

- Attribution is the whole point of the invoke error envelope: the parent's
  handling and the operator's triage key on WHOSE failure this is. A
  grandchild path in `callee_path` with no chain sends both to the wrong
  file, and for deep chains the intermediate hops are unrecoverable from the
  surfaced value.
- The documented recovery idiom breaks: a parent wrapping
  `invoke("./worker.theta")` in
  `match r { Err(InvokeCalleeError { inner, .. }) => <fallback> }` handles
  every worker failure EXCEPT the case where the worker's own sub-invoke
  failed — precisely the case most likely to have a sensible fallback.
- The two notes in the probe are byte-identical across `/infraleaf` and
  `/infratop`; nothing in the user-visible surface distinguishes a one-hop
  from a two-hop failure.

## Non-goals

- The trampoline-minted bare `invoke_infra` surfaces (panic downgrade,
  exit-without-envelope, envelope parse/skew, dispatch-frame internal
  errors) are spec'd bare and stay bare.
- The `invoke_callee` recursive wrap (already NOT special-cased) is correct
  and pinned by the committed SLSH-5 suite; untouched.
- The `cancelled` exemption arm is candidate 05's subject (its own spec
  rule with a genuinely different fix shape).

## Fix

Not yet decided. Constraints:

1. The discrimination must become provenance-based. Candidate mechanisms:
   (a) `InvokeChild.drive()` returns a discriminated result
   (`{ source: "callee-returned" | "boundary-minted", result }`), with the
   in-process body path and the envelope `err` arm marking `callee-returned`
   and `runInvokeChild`'s catch / the fail-closed envelope maps marking
   `boundary-minted`; the wrap rule keys on `source`. (b) A non-enumerable
   brand on trampoline-minted error objects — rejected unless (a) proves
   impractical: value brands crossing `makeErr`/`ThetaValue` surfaces are the
   bug-0020 class.
2. The subagent leg must mark the envelope `err` arm `callee-returned`
   (the child's own boundary errors were already wrapped or minted
   child-side; what the envelope carries is by construction the callee's
   top-level `Err`) and the parent-side fail-closed maps
   (`mapExitWithoutEnvelope`, parse/skew) `boundary-minted`, preserving the
   provider-error-mapping.md audit table's two parent-side rows.
3. Flip set: the committed SLSH-5 cells gain sibling cells for the
   `invoke_infra` leaf (red at this HEAD: no suffix, wrong kind); the
   per-cause table's Panic row cells must stay byte-identical.
4. Spec: if the adjudication instead BLESSES the pass-through (treating a
   propagated `invoke_infra` as transparent), invocation.md:75 and the
   "exactly one wrapper" comment must be amended to state the exemption —
   the current text supports only the wrap.

## Provenance

Error-classification bug hunt, worktree `C:/UnitySrc/pi-theta-hunt` at
`bc52da38` (v0.287.0). Surfaces read: `runInvokeEffect`
(`effectful-statement-host.ts`), `runInvokeChild`
(`invoke-cancellation.ts`), `driveSubagentChild`
(`subagent-json-driver.ts`), `surfaceThetaCallableCalleeFailure`
(`tool-call.ts`), the provenance ledger; spec invocation.md §Failures /
INV-5, queryerror-variants.md §Invoke variants, slash-invocation.md SLSH-5,
error-model.md per-cause table. Probe: shared candidate-03 scratch workspace
drive, run and deleted; note bytes verbatim.

## Fix (0.326.0)

- What shipped:
  - `src/runtime/invoke-cancellation.ts` — `InvokeChild.drive()` returns
    `DrivenInvokeResult { source, result }`; `runInvokeChild` threads the
    provenance and marks its own boundary catch `boundary-minted` (§Fix
    mechanism (a)).
  - `src/runtime/effectful-statement-host.ts` — `runInvokeEffect`'s XMODE-1
    wrap keys on `outcome.source` (`boundary-minted` → bare, `callee-returned`
    → wrap); the `cancelled` arm stays kind-based (§Non-goals; bug 0295).
  - `src/runtime/subagent-json-driver.ts` — the envelope `err` arm tags
    `source` via the closed set `PROPAGATED_INVOKE_INFRA_CAUSES =
    {parse_failure, panic, subagent_model_unresolved}` (the `invoke_infra`
    causes with no child-side envelope writer → callee-returned/wrap); every
    other `invoke_infra` cause → boundary-minted; the parent-side fail-closed
    maps → boundary-minted (§Fix constraint 2, refined — see Residuals).
  - `src/extension/production-theta-producer.ts` — `#buildInvokeChild` /
    `#driveCallee` return `DrivenInvokeResult`, tagging each return site; the
    subagent binding exposes `driveSource()` (mirrors `forwardedEnumTags`).
  - `src/extension/theta-composition-producer.ts` — `ConversationBinding`
    gains an optional `driveSource?`.
- Gates: witness run (offline 15/15 + live 1/1, each revert→RED→restore→GREEN);
  full default suite 507 files / 9769 tests green; `npm run typecheck` clean;
  `npm run lint` clean.
- Review: 4 rounds (all deep). R1 — F1 spec blocker (the subagent leg
  over-wrapped child-side `invoke_infra` boundary mints) + prose; fixed. R2 —
  F1 incomplete (`load_failure` is ALSO minted child-side, bug 0178
  registration refusal reachable via bug 0329 TOCTOU); narrowed to
  `parse_failure`-only. R3 — F1 (`panic` and `subagent_model_unresolved` also
  have no child-side envelope writer); replaced the ad-hoc carve-out with the
  complete closed-union partition. R4 — CLEAN (per-cause audit over all 8
  `InvokeInfraCause` members; one non-blocking `test` residual).
- Verification: SOLID. Obl 1 — witnesses genuinely witness
  (revert→RED→restore→GREEN, in-process + subagent legs offline, byte-exact
  restoration; live cell both directions under the live-lock). Obl 2 — suite
  507/9769. Obl 3 — the new live cell
  `tests/live/b0294-callee-propagated-invoke-infra-live-cell.test.ts` drives the
  real AgentSession two-hop `invoke_infra` (`load_failure`) cascade, green and
  red-provable. Obl 4 — typecheck + lint clean.
- Residuals:
  1. Subagent-leg INV-5 parity gap (documented in-code at
     `subagent-json-driver.ts` `case "err"`): a subagent callee that
     `?`-propagates a NESTED `invoke_infra` of one of the five
     child-side-mintable causes (`load_failure` / `validation` /
     `return_validation` / `internal_error` /
     `subagent_model_preflight_mismatch`) is left BARE — indistinguishable from
     a child-side mint of the same cause without an envelope provenance sidecar
     (0342-scale, out of scope). The three no-writer causes (`parse_failure` /
     `panic` / `subagent_model_unresolved`) ARE wrapped (full parity); the
     in-process leg wraps all of them.
  2. (`test`, non-blocking) the `(F)` witness suite has no explicit
     `return_validation → boundary-minted` cell — that cause rides the tested
     default arm and is exercised end-to-end by the 0187 / 0180 return-refusal
     suites.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the `cancelled` exemption arm is untouched
  (bug 0295's subject) — the post-fix line is
  `if (outcome.source === "boundary-minted" || innerKind === "cancelled")`, with
  `invoke_infra` now provenance-discriminated and `cancelled` still kind-based
  (provenance-independent). The trampoline-minted Panic row stays byte-identical.
  The `invoke_callee` recursive wrap is untouched. Bug 0293's `CalleeParseOutcome`
  partition is untouched. No wire-format change (the 0342 additive-envelope
  precedent governs the deferred provenance sidecar). No new author-string-keyed
  record (0343 N/A — `source` is a runtime discriminator). Value brands rejected;
  constraint-4 spec-blessing rejected — the shipped fix implements
  invocation.md:75 / INV-5 as written, so no spec sentence is owed.
