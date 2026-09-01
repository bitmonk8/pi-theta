# Bug 0347 — a subagent-mode callee that `?`-propagates a NESTED `invoke_infra` of one of the five child-side-mintable causes (`load_failure` / `validation` / `return_validation` / `internal_error` / `subagent_model_preflight_mismatch`) reaches the parent BARE, not wrapped: the subagent driver reads `cause` as a provenance proxy over the closed `InvokeInfraCause` union (`subagent-json-driver.ts:246`) and tags those five `boundary-minted` because each ALSO has a child-side envelope writer, so the parent's XMODE-1 wrap (`effectful-statement-host.ts:446`) leaves them bare — wrong kind, grandchild `callee_path`, no SLSH-5 hop — where INV-5 (`invocation.md:36`) pins wrap parity with the in-process leg, which wraps the identical propagated leaf for all five

- **Status:** open.
- **Sev/Diff estimate:** S3/D3 — S3 (not S2 like bug 0294) because the same
  wrong-attribution defect class survives only on the subagent leg and only
  for five of the eight `InvokeInfraCause` members: the in-process leg is
  correct (bug 0294 fixed it), and the subagent leg's three no-child-writer
  causes (`parse_failure` / `panic` / `subagent_model_unresolved`) already
  wrap. The surfaced value is still a loud `Err` and nothing binds a wrong
  value, but on the affected inputs the parent's `Err.kind` is `invoke_infra`
  where the spec shape is `invoke_callee`, `callee_path` names the grandchild
  the parent never invoked, and the SLSH-3 note carries no SLSH-5 hop suffix
  — exactly the bug 0294 defect shape. D3 because the discrimination the fix
  needs (was this `invoke_infra` MINTED at the child boundary or PROPAGATED
  through it) is not derivable from any field the current `theta_result`
  envelope carries: the closed-set `cause` proxy is ambiguous for these five
  precisely because each has a child-side mint writer, so the fix requires an
  additive wire-format evolution (an optional provenance marker on the PIC-59
  `err` arm, the 0342-scale change bug 0294's record deferred as out of
  scope).
- **Kind:** defect — an INV-5 parity gap that survives on one leg for a
  bounded subset of causes. Elements, source-traced at `abbb9b30`
  (v0.326.0):
  1. *The subagent leg partitions the closed union by a provenance proxy.*
     `driveSubagentChild`'s envelope `err` arm
     (`src/runtime/subagent-json-driver.ts:246–250`):
     `const source: InvokeResultSource = err.kind === "invoke_infra" &&
     !PROPAGATED_INVOKE_INFRA_CAUSES.has(err.cause as string) ?
     "boundary-minted" : "callee-returned";`. The wire carries no provenance
     marker, so `cause` is the driver's PROXY for where the `invoke_infra` was
     minted. `PROPAGATED_INVOKE_INFRA_CAUSES`
     (`:93–97`) is the closed set `{parse_failure, panic,
     subagent_model_unresolved}` — the three causes with NO child-side
     envelope writer, which therefore reach the arm only by the callee
     `?`-propagating its own nested `invoke(...)` failure and are tagged
     `callee-returned` (wrap). Every OTHER `invoke_infra` cause is tagged
     `boundary-minted` (bare).
  2. *The five bare causes each have a child-side writer AND a propagation
     path.* The `case "err"` comment block enumerates the child-side writers
     (cites re-verified at `abbb9b30`): `load_failure` — marked-root
     registration refusal (`src/runtime/subagent-root-regime.ts:217–220` →
     `src/extension/production-composition.ts:1244`); `validation` —
     params-intake refusal (`src/extension/production-theta-producer.ts:2590`;
     `src/runtime/subagent-params.ts:313`); `return_validation` —
     return-value refusal
     (`src/extension/production-theta-producer.ts:2658/2661`;
     `src/runtime/subagent-envelope.ts:862/900`); `internal_error` — child
     body panic / defect catch
     (`src/extension/production-theta-producer.ts:2686`);
     `subagent_model_preflight_mismatch` — child-side preflight
     (`src/extension/production-theta-producer.ts:2575`;
     `src/runtime/subagent-model-guard.ts:164`). Each of these five is ALSO
     reachable as a callee-propagated nested value: a subagent-mode callee
     whose body ran `invoke("./deeper.theta")?` where `deeper` failed with one
     of these causes returns that `Err` up its own envelope, and the parent
     cannot tell that propagation from the child's own boundary mint of the
     same cause.
  3. *The in-process leg wraps all five; the subagent leg wraps none.*
     `runInvokeEffect`'s XMODE-1 gate
     (`src/runtime/effectful-statement-host.ts:446`):
     `if (outcome.source === "boundary-minted" || innerKind === "cancelled")
     return { ok: true, value: result };` else wrap via
     `surfaceThetaCallableCalleeFailure`. For an in-process callee that
     `?`-propagates any `invoke_infra`, `outcome.source` is `callee-returned`
     (the body path marks it so), so it wraps regardless of `cause`. On the
     subagent leg the same propagated leaf is tagged `boundary-minted` for the
     five causes, so it passes bare. INV-5 (`invocation.md:36`) requires
     parity: "`InvokeCalleeError` wrapping is applied to the reconstructed
     leaf exactly as for an in-process callee."
  4. *Measured.* Offline unit probe over the envelope-consumption seam
     (§Reproduction): the subagent leg tags all five child-side-mintable
     causes `boundary-minted` (bare), while the in-process twin surfaces the
     identical callee-returned `invoke_infra` leaf as `invoke_callee` (wrapped)
     for all five. The three no-writer causes tag `callee-returned` on both
     legs.
- **Related:**
  - [0294](./0294-callee-propagated-invoke-infra-unwrapped-misattributed.md)
    (fixed 0.326.0) — the parent report. Its §Fix (0.326.0) shipped the
    provenance discriminator on both legs but refined the subagent leg to the
    closed-set `cause` proxy, and its §Residuals item 1 NAMES this filing:
    the five child-side-mintable causes are "left BARE … indistinguishable
    from a child-side mint of the same cause without an envelope provenance
    sidecar (0342-scale, out of scope)." This report is that residual. The
    XMODE-1 wrap gate, the `InvokeResultSource` discriminator, and the SLSH-5
    ledger are 0294's; unchanged here.
  - [0342](./0342-multi-hop-subagent-chain-attributes-forwarded-enum-to-immediate-callee.md)
    (fixed 0.318.0) — the additive-envelope precedent the fix follows: an
    OPTIONAL `enum_tags` sidecar on the `theta_result` arm, emitted only when
    needed, `v` stays 1, old-envelope-tolerant in both directions, no new
    diagnostic code (`subagent-envelope.ts`, PIC-59
    `#subagent-enum-tags-sidecar`). The provenance marker this fix needs is
    the same shape on the `err` arm.
  - [0293](./0293-invoke-callee-load-parse-causes-shifted.md) (fixed 0.325.0)
    — the cause-partition sibling. Its §Residual 3 confirms the split it
    landed applies uniformly to subagent-mode callees but leaves "the subagent
    JSON envelope (bug 0294's territory) … untouched"; the envelope's inability
    to distinguish mint from propagation is that untouched territory.
  - [0088](./0088-slsh5-chain-suffix-never-emitted.md) — built the SLSH-5 hop
    chain a bare propagation drops: the provenance ledger records hops only
    against `invoke_callee` wrappers, so an unwrapped leaf contributes no hop
    and the note renders suffix-free.
  - [0295](./0295-child-internal-cancel-wrap-arm-unreachable.md) — the
    `cancelled` arm of the same XMODE-1 line; its own two-arm rule, out of
    scope here.
- **Affected** (verified at `abbb9b30`, v0.326.0):
  - `src/runtime/subagent-json-driver.ts:93–97` —
    `PROPAGATED_INVOKE_INFRA_CAUSES`, the closed set the discriminator keys
    on; `:246–250` — the `err`-arm discriminator that tags the five
    non-member causes `boundary-minted`; `:233–244` — the in-code
    `KNOWN RESIDUAL (bug 0294 F2)` comment block naming this gap.
  - `src/runtime/effectful-statement-host.ts:446` — the XMODE-1 wrap gate; the
    in-process leg reaches it with `outcome.source === "callee-returned"` for
    a propagated `invoke_infra` and wraps, so the subagent-leg divergence is
    entirely upstream in how `source` is derived.
  - `src/runtime/invoke-cancellation.ts:58` (`InvokeResultSource`), `:65`
    (`DrivenInvokeResult`) — the provenance type the subagent driver populates
    from the wire proxy rather than from a wire-carried marker.
  - `src/runtime/query-error.ts:121–134` — the eight-member closed
    `InvokeInfraCause` union the discriminator partitions.
  - Child-side writers for the five bare causes (each spec'd bare to an invoke
    parent):
    `src/runtime/subagent-root-regime.ts:217–220` →
    `src/extension/production-composition.ts:1244` (`load_failure`);
    `src/extension/production-theta-producer.ts:2590`,
    `src/runtime/subagent-params.ts:313` (`validation`);
    `src/extension/production-theta-producer.ts:2658/2661`,
    `src/runtime/subagent-envelope.ts:862/900` (`return_validation`);
    `src/extension/production-theta-producer.ts:2686` (`internal_error`);
    `src/extension/production-theta-producer.ts:2575`,
    `src/runtime/subagent-model-guard.ts:164`
    (`subagent_model_preflight_mismatch`).
  - No-writer causes (already `callee-returned`, full parity):
    `src/extension/production-theta-producer.ts:3840` (`parse_failure`, sole
    mint in `#driveCallee`); the regime catch routing body panics to
    `internal_error` (`:2686`) so a `cause:"panic"` on the wire is propagated;
    `src/runtime/subagent-model-guard.ts:116` thrown at
    `src/extension/production-theta-producer.ts:2054`
    (`subagent_model_unresolved`, parent-side mint only).
  - `tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts` — the
    `(F)` suite whose bare-cause cells pin the current behaviour (flip set,
    §Fix).
  - Spec: `docs/spec_topics/invocation.md:36` (INV-5 wrap parity across legs),
    `:75` (the wrap rule — "`InvokeCalleeError` wraps an `Err` the callee
    itself returned");
    `docs/spec_topics/errors-and-results/queryerror-variants.md` §Invoke
    variants (`InvokeCalleeError.inner` recursive over the whole union);
    `docs/spec_topics/pi-integration-contract/subagent.md` PIC-59 (the
    `theta_result` envelope and its additive-sidecar convention).
- **Observed at:** v0.326.0 (`abbb9b30`). Offline, deterministic,
  provider-free: a scratch vitest probe over the envelope-consumption seam
  (`driveSubagentChild` with a `FakeRpcChild` emitting a hand-built `err`
  envelope; the in-process twin over the `runInvokeEffect` seam with an
  `InvokeChild` double whose completed drive returns a callee-returned
  `invoke_infra` leaf) — the harness pattern of
  `tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts` `(F)`/`(G)`.
  Written, run, deleted. Observed lines quoted verbatim in §Reproduction.

## Summary

Bug 0294 made the invoke boundary decide wrap-vs-bare by PROVENANCE — did the
callee's own body produce this `Err` (`callee-returned`, wrap it in
`InvokeCalleeError`) or did THIS hop's trampoline mint it (`boundary-minted`,
surface it bare). On the in-process leg the provenance is known directly: the
body-outcome path marks `callee-returned`, the trampoline catches mark
`boundary-minted`. On the subagent leg the parent sees only the child's
`theta_result` envelope, which carries no provenance marker, so bug 0294's
subagent-leg fix reads `cause` as a proxy: the three `InvokeInfraCause` members
with no child-side envelope writer (`parse_failure`, `panic`,
`subagent_model_unresolved`) can only have arrived by propagation and are
wrapped; every other cause defaults bare.

That proxy is exact for the three no-writer causes and for a genuine
child-side mint of the other five. It is wrong for the fifth case the union
admits: a subagent-mode callee that `?`-propagates a NESTED `invoke_infra`
whose cause is one of `load_failure`, `validation`, `return_validation`,
`internal_error`, or `subagent_model_preflight_mismatch`. Each of those five
ALSO has a child-side mint writer, so the same `cause` on the wire is
provenance-ambiguous, and the driver resolves the ambiguity toward bare. The
propagated leaf reaches the parent bare — the identical defect bug 0294 fixed
on the in-process leg, now surviving on the subagent leg for five causes:

- the parent's `Err.kind` is `invoke_infra` instead of `invoke_callee`, so the
  documented "my callee failed" `match` arm misses;
- `callee_path` names the GRANDCHILD, a file the parent never invoked;
- the SLSH-5 chain loses the hop; the note renders suffix-free.

INV-5 pins the parity this breaks: the reconstructed leaf must be wrapped
"exactly as for an in-process callee," and the in-process leg wraps all five.
The five no-op cannot be closed by widening the closed-set proxy — a
child-side mint of the same cause must STAY bare, and the two are
indistinguishable on the wire — so closing it requires the envelope to carry
the provenance the proxy is standing in for.

## Reproduction

Offline, provider-free, at `abbb9b30`. Scratch vitest probe (written, run,
deleted) over two seams:

- SUBAGENT LEG — `driveSubagentChild` with a `FakeRpcChild` emitting one
  hand-built `theta_result` `err` envelope per cause:
  `{ v: <THETA_ENVELOPE_VERSION>, err: { kind: "invoke_infra", message:
  "invoke of ./missing.theta failed (<cause>)", callee_path:
  "./missing.theta", cause: "<cause>" } }`, then a clean exit; read the
  settled `SubagentInvocationResult.source`.
- IN-PROCESS TWIN — the `runInvokeEffect` seam driven by `executeBody` over an
  `InvokeChild` double whose completed drive returns a `callee-returned`
  `invoke_infra` leaf of the same cause; read the surfaced `Err.kind`.

Observed verbatim:

```
subagent leg cause=load_failure -> source=boundary-minted
subagent leg cause=validation -> source=boundary-minted
subagent leg cause=return_validation -> source=boundary-minted
subagent leg cause=internal_error -> source=boundary-minted
subagent leg cause=subagent_model_preflight_mismatch -> source=boundary-minted
subagent leg cause=parse_failure -> source=callee-returned
subagent leg cause=panic -> source=callee-returned
subagent leg cause=subagent_model_unresolved -> source=callee-returned
in-process leg (callee-returned) cause=load_failure -> surfaced kind=invoke_callee
in-process leg (callee-returned) cause=validation -> surfaced kind=invoke_callee
in-process leg (callee-returned) cause=return_validation -> surfaced kind=invoke_callee
in-process leg (callee-returned) cause=internal_error -> surfaced kind=invoke_callee
in-process leg (callee-returned) cause=subagent_model_preflight_mismatch -> surfaced kind=invoke_callee
```

`source: "boundary-minted"` is the bare disposition (the XMODE-1 gate returns
the leaf unwrapped); `surfaced kind=invoke_callee` is the wrap. The five
child-side-mintable causes surface bare on the subagent leg and wrapped on the
in-process leg — the INV-5 parity gap. The three no-writer causes tag
`callee-returned` (wrap) on both.

## Expected behaviour

- `invocation.md:36` (INV-5): "`InvokeCalleeError` wrapping is applied to the
  reconstructed leaf exactly as for an in-process callee." A subagent-mode
  callee that `?`-propagates a nested `invoke_infra` of ANY cause returns its
  own `Err`; the parent wraps it in `InvokeCalleeError` with `callee_path` =
  the parent's own callee and `inner` = the propagated leaf, and records the
  SLSH-5 hop.
- `invocation.md:75`: "`InvokeCalleeError` wraps an `Err` the callee itself
  returned; `inner: QueryError` is the callee's original failure." The rule
  names no cause exemption.
- `queryerror-variants.md` §Invoke variants: `InvokeCalleeError.inner` is
  recursive over the whole `QueryError` union — `invoke_infra` is a member
  like any other, its cause irrelevant to the wrap.
- A genuine child-side mint of any of the five causes (the child's marked-root
  registration refusal, params-intake refusal, return-value refusal, body
  panic/defect, or model preflight) stays BARE to the invoke parent — the
  disposition the current bare tagging gets right and which any fix must
  preserve.

## Actual behaviour / root cause

The subagent driver derives `source` from `cause` because the
`theta_result` envelope carries no provenance marker
(`subagent-json-driver.ts:246–250`). For the three causes with no child-side
mint writer the proxy is exact — arrival implies propagation. For the five
causes with a child-side mint writer the same `cause` value can arrive two
ways (the child minted it at its own boundary, or the child propagated a
nested hop's `invoke_infra` of that cause), and the driver has no field to
separate them, so it defaults `boundary-minted`. The comment block records the
choice as the "spec-safe conservative default, since an over-bare missed-fix
is safer than an over-wrap phantom-hop spec violation" — correct as a default,
but it means the propagation case is misclassified for all five.

Downstream is faithful to the misclassification: `runInvokeEffect`'s gate
(`effectful-statement-host.ts:446`) sees `boundary-minted`, returns the leaf
bare, records no ledger hop, and the SLSH-3 note renders the leaf as the
parent's own failure. The in-process leg never hits this because its `source`
comes from the body-outcome path, not from a wire proxy, so a propagated
`invoke_infra` is `callee-returned` there for every cause.

## Why it matters

- Attribution is the invoke error envelope's purpose: the parent's `match` and
  the operator's triage key on WHOSE failure this is. On the subagent leg, for
  five causes, a grandchild path lands in `callee_path` with no chain suffix,
  sending both to the wrong file — and the same program is correctly attributed
  when its callee runs in-process, so the surface diverges by execution mode,
  which INV-5 exists to forbid.
- The documented recovery idiom breaks on the subagent leg: a parent handling
  `match r { Err(InvokeCalleeError { inner, .. }) => <fallback> }` handles a
  subagent worker's own propagated sub-invoke failure for three causes and
  misses it for five.
- The `source` field bug 0294 added is a runtime discriminator; the wire has
  no counterpart, so no conformance test can witness the propagation case for
  the five causes end-to-end across the process boundary until the envelope
  carries the marker.

## Non-goals

- The three no-writer causes (`parse_failure`, `panic`,
  `subagent_model_unresolved`) already wrap with full parity; their tagging is
  byte-identical after the fix.
- A genuine child-side mint of any of the five causes stays bare; the fix
  narrows the bare default to the mint case, it does not remove it.
- The in-process leg is correct (bug 0294) and untouched.
- The `cancelled` arm of the XMODE-1 line is bug 0295's subject.
- The load/parse cause-partition (bug 0293) is settled; this report is about
  wrap provenance, not which cause is minted.

## Fix

Not yet decided. Constraints any fix must satisfy:

1. **Wire provenance marker (settled direction).** The `theta_result` `err`
   arm gains an OPTIONAL provenance field distinguishing a child-side mint from
   a callee-propagated leaf, following the 0342 additive-envelope precedent:
   optional field, `v` stays 1, absent = today's closed-set-proxy behaviour
   (so an old child's envelope and a new parent, and a new child's envelope and
   an old parent, both degrade to the current disposition — skew-safe both
   directions), no new diagnostic code. The child stamps the marker where it
   already knows the provenance: its own boundary writers stamp `mint`, a
   propagated leaf (the child's `?` over a nested `invoke`) carries the marker
   the nested hop already set. This is the "envelope provenance sidecar
   (0342-scale)" bug 0294's §Residuals item 1 deferred.
2. **The sidecar replaces the closed-set proxy for the five causes.** The
   `PROPAGATED_INVOKE_INFRA_CAUSES` discriminator
   (`subagent-json-driver.ts:93`, `:246`) is the seam the marker supersedes:
   when the marker is present the driver reads it directly; when absent it
   falls back to the current closed-set proxy. The three no-writer causes'
   wrapping must stay byte-identical (they wrap under both the proxy and the
   marker).
3. **INV-5 parity post-fix.** The subagent leg wraps exactly what the
   in-process leg wraps: any callee-propagated `invoke_infra` of any cause
   wraps; any child-side-minted `invoke_infra` stays bare. The invariant is
   read as an oracle — for a given program, the surfaced `Err.kind` and the
   SLSH-5 suffix are identical whether the callee resolves in-process or as a
   subagent.
4. **Flip set.** In
   `tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts` `(F)`, the
   four extant bare-cause cells — `an \`invoke_infra\` cause load_failure
   (marked-root registration refusal, child-side) is boundary-minted`,
   `an \`invoke_infra\` model-preflight mint (child-side, subagent.md:152) is
   boundary-minted`, `an \`invoke_infra\` params-intake refusal (cause
   validation) is boundary-minted`, `an \`invoke_infra\` child body panic /
   defect (cause internal_error) is boundary-minted` — model CHILD-SIDE MINTS
   and stay `boundary-minted` (now driven by the marker's `mint` value rather
   than the closed-set default). Each gains a PROPAGATION sibling carrying the
   marker's callee-returned value that asserts `callee-returned` (wrapped);
   `return_validation`, which has no explicit `(F)` cell today (bug 0294
   §Residuals item 2 — it rides the tested default arm), gains both a mint cell
   and a propagation cell. The closed-set comment block and the
   `KNOWN RESIDUAL (bug 0294 F2)` note (`subagent-json-driver.ts:233–244`)
   update to describe the sidecar and the retained absent-marker fallback.

No fix-ordering dependency: this report edits the subagent envelope / driver
and the PIC-59 spec surface; bug 0294 (fixed) already shipped the
`InvokeResultSource` discriminator and the XMODE-1 gate this builds on. A
future fix landing in `subagent-json-driver.ts` or `subagent-envelope.ts`
rebases against this one's line positions, per the citation-drift convention.

## Provenance

Filed from bug 0294's §Fix (0.326.0) §Residuals item 1, which records this
subagent-leg INV-5 parity gap (documented in-code at
`subagent-json-driver.ts` `case "err"`) as the next filing and defers the
envelope provenance sidecar as 0342-scale, out of scope for 0294.

Ownership checked: `rg` over `docs/bugs/` for `INV-5` / `boundary-minted` /
`PROPAGATED_INVOKE_INFRA` returns 0294, 0295, 0067, 0178, 0180, 0187, 0188,
0201, 0110, 0111, 0112, 0174, 0177, and others — all `fixed`. No open bug owns
the envelope-provenance surface; 0294 (fixed 0.326.0) is the report that owned
it and names this residual.

Measured at `abbb9b30` (v0.326.0) offline through the envelope-consumption
seam (`driveSubagentChild` with a `FakeRpcChild`) and the `runInvokeEffect`
wrap seam (`executeBody` over an `InvokeChild` double), the harness pattern of
`tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts`. The scratch
probe (`b0347scratch-…`) was written, run, and deleted; a case-insensitive
sweep for `b0347scratch` returns no tracked residue and `git status --short`
shows no path matching `scratch`.
