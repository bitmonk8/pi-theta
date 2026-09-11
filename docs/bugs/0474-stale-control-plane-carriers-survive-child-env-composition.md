# Bug 0474 — `buildSubagentChildEnv` re-derives only three of the eight `PI_THETA_*` carriers, so a launching process that holds a control plane of its own leaks a FOREIGN invocation's hash map / params file / marked root into every child it spawns — and the child's parent-pid gate authenticates the leak because the launcher wrote the true pid beside it

- **Status:** fixed (unreleased; lands in the next version bump).
- **Sev/Diff estimate:** S2/D2 — S2 because the failure is fail-closed and
  loud (the child refuses registration with
  `theta/runtime/subagent-callable-hash-mismatch` or a params-intake failure;
  no wrong value crosses a boundary), but it fires on EVERY child launched
  from a process whose own environment carries a control plane, i.e. on every
  nested launch inside a quality-loop worker tree, and it presents as
  unrelated red tests / broken invocations rather than as a diagnosis. D2
  because the fix is a scrub set plus one new launch-request field: the
  per-launch control plane had to stop travelling INSIDE `parentEnv`, since a
  value layered there is indistinguishable from a stale inherited one.
- **Kind:** defect — composition gap (the writer of the child control plane
  re-derives part of it and inherits the rest).
- **Spec basis** (at `4211b5d1`, v0.468.0):
  - `docs/spec_topics/pi-integration-contract/subagent.md`
    §[Launch contract](../spec_topics/pi-integration-contract/subagent.md#subagent-launch-contract)
    — "The child inherits the parent's **full environment**", with the
    per-launch carriers each named in the table below it (`PI_THETA_PARAMS` /
    `PI_THETA_PARAMS_FILE`, the invoke-depth counter, `PI_THETA_SUBAGENT_ROOT`,
    the marshalled closure hash). The paragraph stated full inheritance and
    the per-launch derivation side by side, and pinned nothing about their
    INTERACTION — which is the gap this report closes.
  - §[Control-plane authentication](../spec_topics/pi-integration-contract/subagent.md#subagent-control-plane-authentication)
    — "inherited values are honoured only when `PI_THETA_SUBAGENT_PARENT_PID`
    equals the reading process's **real parent pid**". This is the mitigation
    the design relies on, and it does not cover the leak: see §Actual
    behaviour.
  - §[Extension pin](../spec_topics/pi-integration-contract/subagent.md#subagent-extension-pin)
    — the pin is deliberately heritable ("Because the child inherits the full
    parent env, the pin propagates to nested children"), so it is the one
    control-plane key the scrub must NOT touch (AGENTS.md
    `#subagent-child-pins` depends on it).
- **Affected** (at `4211b5d1`, v0.468.0):
  - `src/runtime/subagent-launcher.ts:488` — `buildSubagentChildEnv`:
    `{ ...parentEnv, root?, parentPid, invokeDepth }`. Three of the eight
    control-plane keys are re-derived; the other five ride whatever the
    launching process happened to hold (the root marker too, on a slug-less
    call).
  - `src/extension/production-theta-producer.ts:2524` — the augmentation
    site: this launch's params carriers, callable-hash map and marked-root
    winner path were LAYERED INTO `parentEnv` before the launch request was
    built, i.e. into the same map as the inherited values. That is why the
    naive fix (scrub inside `buildSubagentChildEnv`) breaks production unless
    the per-launch values arrive on their own channel.
  - `src/extension/production-subagent-host.ts:148` — `CONTROL_PLANE_ENV_KEYS`,
    the canonical eight-key list (reader side), and `:205`
    `authenticateControlPlane`, the gate that does not cover this case.
  - The 14 default-suite test files that spawn REAL child `pi` processes and
    forward `process.env` as `parentEnv` (the observed blast radius, below).
- **Observed at:** v0.468.0 (`4211b5d1`), Windows. Discovered by a
  `/quality-loop` wave's D2 fixer: the fixer runs INSIDE a subagent child (so
  its own environment carries `PI_THETA_SUBAGENT_ROOT=fix_cluster`,
  `PI_THETA_SUBAGENT_CALLABLE_HASHES={…}`, `PI_THETA_PARAMS_FILE=…`,
  `PI_THETA_SUBAGENT_ROOT_WINNER=…`, `PI_THETA_SUBAGENT_PARENT_PID=…`) and ran
  the in-tree gate `npm test` from that session. 14 files / 19 tests red;
  with the same vars unset in the same tree, 657 files / 11091 tests green.
  Reproduced twice by the fixer, and independently here (§Reproduction).

## Summary

The launcher composes the child environment as "inherit everything, then write
my markers". Only three markers are written (root — conditionally, parent-pid,
invoke-depth). The remaining five control-plane carriers — both params
carriers, the callable-hash map, the marked-root winner path, and the root
marker when the call names no slug — are inherited verbatim from the launching
process, which in a nested run is itself a subagent child holding a DIFFERENT
invocation's values.

The child cannot detect this. Its defence is the parent-pid gate, and the gate
answers "did my real parent write this?" — for a leaked value the honest
answer is YES, because the same `buildSubagentChildEnv` call writes the true
parent pid beside the stale carriers. The child therefore authenticates a
control plane belonging to a foreign invocation and refuses fail-closed:
`subagent callable 'fix_cluster' content hash mismatch; refusing invocation`
for a callable it never heard of, or a params intake against a temp file that
belongs to (and was already deleted by) another launch.

Authentication was never the right control here. Composition is: the child's
control plane must be built from THIS launch alone.

## Reproduction

Deterministic, offline, zero tokens (this is the fixer's recipe, verified at
`4211b5d1`):

```
PI_THETA_SUBAGENT_ROOT=fix_cluster \
PI_THETA_SUBAGENT_CALLABLE_HASHES='{"fix_cluster":"deadbeef"}' \
PI_THETA_PARAMS_FILE=/nonexistent \
PI_THETA_SUBAGENT_ROOT_WINNER=x \
PI_THETA_SUBAGENT_PARENT_PID=$$ \
npm test
```

Pre-fix: `Test Files 14 failed | 643 passed (657)`, `Tests 19 failed | 11072
passed (11091)`. The 14:

```
tests/b0331-root-winner-preempt.test.ts
tests/b0337-theta-enum-identity-invoke.test.ts
tests/b0342-forwarded-enum-subagent-chain.test.ts
tests/extension-tool-unreachable-load-refusal-e2e.test.ts
tests/inbound-boundary-theta-callable.test.ts
tests/inbound-union-arm-dispatch.test.ts
tests/invoke-prompt-cell-enum-return.test.ts
tests/subagent-child-real-spawn.test.ts
tests/subagent-envelope-result-carriage.test.ts
tests/subagent-invoke-inbound-enum-tag.test.ts
tests/subagent-invoke-nonfinite-return-refusal.test.ts
tests/subagent-return-depth-refusal.test.ts
tests/subagent-root-registration-refusal-envelope.test.ts
tests/subagent-theta-roots-forwarding.test.ts
```

Same env, clean tree: `657 passed`. The single-file signature (pre-fix,
`tests/subagent-child-real-spawn.test.ts`):

```
child resolved fail-closed instead of Ok: {"ok":false,"error":{"kind":"invoke_infra",
"message":"subagent child refused to register its root theta '/min-child':
theta/runtime/subagent-callable-hash-mismatch: subagent callable 'fix_cluster'
content hash mismatch; refusing invocation", …,"cause":"load_failure"}}
```

The test wrote `parentPid: process.pid` and the real child's `ppid` matched,
so the child's authentication gate PASSED the poisoned map through — the leak
is authenticated, which is the whole point of the report.

## Expected behaviour

A child's `PI_THETA_*` control plane names THIS launch: the params this call
marshalled (or none), the hash map for THIS callee's callables (or none), the
marked root this launch spawns (or none), this chain's depth, this parent's
pid. Nothing a previous or sibling invocation left in the launching process's
environment may be visible to it — with the single documented exception of the
extension pin, which is heritable by design so a harness can pin the top of a
chain once (#subagent-extension-pin, AGENTS.md `#subagent-child-pins`).

## Actual behaviour / root cause

Two collaborating gaps:

1. `buildSubagentChildEnv` (`subagent-launcher.ts:488`) spreads `parentEnv`
   wholesale and re-derives only `PI_THETA_SUBAGENT_ROOT` (conditionally),
   `PI_THETA_SUBAGENT_PARENT_PID` and `PI_THETA_SUBAGENT_INVOKE_DEPTH`.
2. The production producer (`production-theta-producer.ts:2524`) layered this
   launch's params / hash / winner carriers INTO `parentEnv`, so at the
   composition site a per-launch value and a stale inherited value were the
   same kind of thing. That layering is also why the leak was invisible in
   production review: the producer's unconditional `undefined` writes cover
   the three keys IT names, and the *reasoning* recorded there ("a conditional
   spread cannot clear the inherited map") is exactly the hazard, correctly
   diagnosed, at three of the five leaking keys — the launcher primitive was
   left holding the rest.

The parent-pid gate cannot compensate, for a structural reason: it
authenticates the CARRIAGE, not the PROVENANCE of each value. The launcher
that leaks is the real parent. Any caller of the launcher seam that does not
replicate the producer's key-by-key clearing dance therefore ships the leak —
which is precisely what 14 test files (and any future non-producer caller) do.

## Why it matters

- Every nested subagent launch inside a quality-loop worker tree is affected:
  the wave's fixers, reviewers and gate runs all execute inside children.
- The failure is loud but MIS-ATTRIBUTED: 19 unrelated-looking tests red in a
  worker tree, with a hash-mismatch message naming a callable from another
  invocation. Two independent reproductions were needed to reach the cause.
- It weakens the trust story the authentication paragraph tells. Documenting
  "inherited control plane is honoured only from a real parent" while the real
  parent forwards a foreign one silently is the gap between the two.

## Non-goals

- Changing `readParentEnv` / `authenticateControlPlane` semantics. The gate
  addresses a different threat (a `<cwd>/.env` written ahead of time) and is
  untouched.
- Making the extension pin non-heritable. Its heritability is contract
  (#subagent-extension-pin) and the live harnesses depend on it.

## Fix (unreleased)

- `src/runtime/subagent-launcher.ts` — the canonical eight-key
  `SUBAGENT_CONTROL_PLANE_ENV_KEYS` now lives beside the three keys this
  module owns and at the site that WRITES the child control plane;
  `SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS` is that list minus the
  extension pin. `buildSubagentChildEnv` starts from a copy of `parentEnv`
  with the per-launch set DELETED, then applies (in order) this launch's
  optional `controlPlane` patch, the root marker, the parent pid and the
  invoke depth. The scrub is non-mutating (the caller's env object is
  untouched). `SubagentLaunchRequest.controlPlaneEnv` carries the per-launch
  patch on its own channel.
- `src/extension/production-subagent-host.ts` — imports the canonical list
  from the launcher (existing extension→runtime direction) instead of keeping
  a second copy, so writer and reader cannot drift.
- `src/extension/production-theta-producer.ts` — the params / hash / winner
  carriers move out of `parentEnv` into `controlPlaneEnv`. They are still
  named on every launch (including cleared-to-`undefined`), which now makes
  the channel choice authoritative rather than compensating for inheritance.
- `docs/spec_topics/pi-integration-contract/subagent.md`
  §[Launch contract](../spec_topics/pi-integration-contract/subagent.md#subagent-launch-contract)
  — appended the fail-closed rule: full inheritance stops at the control
  plane; an inherited stale control-plane value (other than the heritable
  extension pin) MUST NOT reach the child, and the authentication gate does
  not cover this case.
- `.pi/theta/workers/fix-cluster-tree.theta` — belt for the loop that found
  it: the in-tree gate and its failure-tail command run with the per-launch
  control plane unset, so the gate measures the CODE and not the wrapper's
  session context. The pin is deliberately left in place.

### Witnesses

- `tests/subagent-child-env-scrub.test.ts` (new, 7 cells): the unit contract
  over a fully poisoned `parentEnv` (every per-launch carrier absent unless
  this call sets it; the pin survives; non-control-plane inheritance and the
  caller's object untouched; the call's own carriage wins), plus the
  full-launch composition through the production producer over a poisoned
  parent environment. Red signatures pre-fix:
  `expected '/stale/tree/thetas/fix_cluster.theta' to be undefined`,
  `expected 'fix_cluster' to be undefined`,
  `expected '{"stale":"inline-params"}' to be '{"topic":"this-launch"}'`.
- Integration re-proof: the 14 files above under the poisoned env.
- Harness migration (composition only, no assertion touched):
  `tests/subagent-root-binder-model-exempt.test.ts`,
  `tests/inbound-union-arm-dispatch.test.ts` — these layered THIS launch's
  params into `parentEnv` and now pass them on `controlPlaneEnv`.

### Residual (recorded here, CLOSED by a follow-up test-hygiene change)

**Status: closed** by the 2026-09-11 test-hygiene change that added
`tests/helpers/ambient-control-plane-scrub.ts` and wired it into all three
files below (scrub the per-launch control plane off `process.env` in
`beforeEach`/`beforeAll`, before the test plants its own plane; restore in
`afterEach`/`afterAll`). Re-proved with the poisoned environment recorded in
§Reproduction: 3 files / 33 tests green poisoned and clean, no assertion
weakened. The original record follows.

Three of the 14 files stayed red under a poisoned ambient environment after the
fix: `tests/b0331-root-winner-preempt.test.ts`,
`tests/extension-tool-unreachable-load-refusal-e2e.test.ts`,
`tests/subagent-root-registration-refusal-envelope.test.ts`. They are
CHILD-SIDE simulations: they plant a partial control plane on `process.env`
(with `PI_THETA_SUBAGENT_PARENT_PID = process.ppid`, so their planted values
authenticate) and drive the extension IN-PROCESS, never crossing the launcher.
An ambient `PI_THETA_PARAMS_FILE` / root marker therefore reaches the
simulated child directly; no composition of ours is involved. The loop belt
above removes the exposure for the gate that found this bug; hardening those
three harnesses against an arbitrary ambient control plane is a separate
change to test setup — the change made above, which closes this residual. The
same reasoning as the launcher fix applies: the simulated child's control plane
must be composed from the test alone, because the authentication gate honestly
validates an ambient plane written by the real parent.
