---
id: PTQ-0128
title: conversation-drive says every production gating-window caller computes its installVector through computeActiveSetInstall, while two of the three withActiveSetGate call sites build the vector inline
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/conversation-drive.ts:13-17
  - src/runtime/conversation-drive.ts:51-59
  - src/extension/production-theta-producer.ts:5699-5702
  - src/extension/production-theta-producer.ts:7315-7318
  - src/runtime/invoke-prompt-suspend.ts:130-138
sites: 5
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# conversation-drive says every production gating-window caller computes its installVector through computeActiveSetInstall, while two of the three withActiveSetGate call sites build the vector inline

## Observation
`computeActiveSetInstall`'s doc comment states that "every production
gating-window caller (`withActiveSetGate`, `../runtime/tool-registration.ts`)
computes its `installVector` through this function rather than re-deriving the
vector shape at each call site", and the module header repeats it ("every
production caller threads this module's computed install vector into that gate
rather than restoring bare"). `withActiveSetGate` has three production call
sites. One (`production-theta-producer.ts:5716`) supplies
`computeActiveSetInstall(install)`; the other two supply an inline expression
(`[...deps.activeTools]` and `childCallableSet`). `withActiveSetGate`'s own
module imports nothing from conversation-drive.

## Evidence
src/runtime/conversation-drive.ts:13-17 — the header claim:

```ts
//     unioned in — "ambient tools are deliberately not inherited". The gating
//     window itself (snapshot / swap-install / restore under the PIC-8/PIC-19
//     protocol) is `withActiveSetGate` (`../runtime/tool-registration.ts`,
//     bug 0372 §Fix): every production caller threads this module's computed
//     install vector into that gate rather than restoring bare.
```

src/runtime/conversation-drive.ts:51-59 — the same claim on the function:

```ts
/**
 * Compute the PIC-17 step-2 install vector: exactly
 * `[...thetaCallableSetNames, respondToolName?]`, with the respond tool appended
 * last only on a forced-respond turn. The ambient snapshot is deliberately not a
 * parameter here — it is never unioned into the install. Exported: every
 * production gating-window caller (`withActiveSetGate`,
 * `../runtime/tool-registration.ts`) computes its `installVector` through this
 * function rather than re-deriving the vector shape at each call site.
 */
```

src/extension/production-theta-producer.ts:5699-5702 — the one call site that
matches the claim:

```ts
    const activeSetGateDeps: ActiveSetGateDeps = {
      pi: this.#pi,
      thetaName: this.#thetaName,
      installVector: computeActiveSetInstall(install),
```

src/extension/production-theta-producer.ts:7315-7318 — a second gate call site
that does not:

```ts
  const activeSetGateDeps: ActiveSetGateDeps = {
    pi: deps.pi,
    thetaName: deps.thetaName,
    installVector: [...deps.activeTools],
```

src/runtime/invoke-prompt-suspend.ts:130-138 — the third:

```ts
  const result = await withActiveSetGate<T>(
    {
      pi,
      thetaName: input.thetaName,
      installVector: childCallableSet,
      emitDiagnostic: input.emitDiagnostic,
      emitSystemNote: input.emitSystemNote,
      routeInternalError: input.routeInternalError,
    },
    childBody,
  );
```

## Why this is a problem
The comment states a universally-quantified centralisation property ("every
production gating-window caller … rather than re-deriving the vector shape at
each call site") that the current call-site set falsifies two-thirds of the
time, and it names `withActiveSetGate` / `tool-registration.ts` as going
through this function when that module imports nothing from conversation-drive
(`grep -n "^import" src/runtime/tool-registration.ts` → two imports, both from
`../diagnostics/`). A reader auditing PIC-17's "ambient tools are deliberately
not inherited" rule is told one function is the choke point for it and will not
find the two sites that assemble the vector themselves — including
invoke-prompt-suspend.ts, whose own doc (:107-109) restates the same
not-unioned rule inline.

## Suggested direction (non-binding, optional)
Narrow the two sentences to the call site that actually routes through the
function, or state which gate callers are out of its scope; comment-only.

## False-positive check
- Call-site census: `grep -rn "withActiveSetGate" --include=*.ts src extensions tools`
  → invocation sites at production-theta-producer.ts:5716 and :7340 and
  invoke-prompt-suspend.ts:130 (plus the definition at tool-registration.ts:123,
  one import line, and comment mentions). `grep -rn "installVector" --include=*.ts src`
  → four assignment sites: ptp:5702 (through the function), ptp:7318,
  invoke-prompt-suspend.ts:134, and the field declaration/read inside
  tool-registration.ts:101/:127/:144.
- Consumer census for the function: `grep -rn "\bcomputeActiveSetInstall\b" --include=*.ts src extensions tools`
  → production-theta-producer.ts:145 (import) and :5702 only; tests reference it
  in tests/conversation-drive.test.ts. It is production-consumed, so this is a
  claim-scope finding, not a deadness claim.
- Import check: `grep -n "^import" src/runtime/tool-registration.ts` → only
  `../diagnostics/diagnostic` and `../diagnostics/placeholder`; the named caller
  cannot be computing anything "through this function".
- Duplicate check: the already-filed
  qw20260907183353-d2-04-prompt-cancel-subscription-unwired cites
  conversation-drive.ts:3-6, :22-28 and :120-143 and concerns the unwired
  `pi.on` subscription; it explicitly records `computeActiveSetInstall` as
  production-consumed and does not cite :13-17 or :51-59.

## Triage
verdict: confirmed — all five excerpts verbatim at cited lines; withActiveSetGate has exactly three production call sites (ptp:5716, ptp:7340, invoke-prompt-suspend.ts:130; a full-repo sweep across src/, extensions/, tools/ finds no fourth, and extensions/ and tools/ contain none) and only ptp:5702 routes its installVector through computeActiveSetInstall, while ptp:7318 passes `[...deps.activeTools]` and invoke-prompt-suspend.ts:134 passes `childCallableSet` inline, so the :51-59 sentence "every production gating-window caller … computes its installVector through this function rather than re-deriving the vector shape at each call site" is falsified at two of three; tool-registration.ts imports only ../diagnostics/diagnostic and ../diagnostics/placeholder (lines 22-23), so the named module computes nothing through this function, and that module's own header :12-19 already states the ACCURATE version of the invariant ("every production caller threads its computed installVector into" the one gate — true of all three), which localises the defect to conversation-drive's two sentences; computeActiveSetInstall is production-consumed (ptp:145 import, :5702 use) so this is correctly filed as a claim-scope finding and not deadness; not a duplicate — the already-triaged sibling qw20260907183353-d2-04 cites :3-6/:22-28/:120-143 for the unwired pi.on subscription and its own triage note explicitly records these lines as the distinct PIC-17 install-vector claim on non-overlapping lines; in D2 scope as production-source narration cruft, per that confirmed sibling's precedent, and the direction is comment-only; provenance is a bug-0372 residue — `git show 41ed1095^` shows conversation-drive formerly owned the gate and called computeActiveSetInstall itself, and commit 41ed1095 both moved the gate to tool-registration.ts and wrote this centralisation claim in the very commit that created the two inline sites, so the claim was false on arrival rather than drifted (the slug's "stale" is imprecise; the prose claims only that the current call-site set falsifies it, so it does not over-claim); one non-refuting imprecision: the False-positive check's import bullet reads the parenthetical `(withActiveSetGate, ../runtime/tool-registration.ts)` as naming a caller when it plausibly just points at the gate, but the universally-quantified claim about the gate's callers falls either way (triage: claude-opus-5)
