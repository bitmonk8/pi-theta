---
id: pending
title: Subagent fn in-process and child outcome mappings are parallel boundary projections
lens: D4
status: intake
verdict: pending
locations:
  - src/runtime/subagent-fn-call.ts:202-230
  - src/runtime/subagent-fn-call.ts:246-292
sites: 2
fix_scope: module
d4_class: parallel
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# Subagent fn in-process and child outcome mappings are parallel boundary projections

## Observation
`src/runtime/subagent-fn-call.ts` implements the parent-side boundary of a `subagent fn` call. The body can run either in-process (`runSubagentFnInProcess`) or in a spawned child (`runSubagentFnViaChild`), but the caller-visible result must be identical (FN-6; GOV-15). Two independent functions project the two different internal outcome shapes onto the same `EvalResult` surface:

- `mapSubagentFnFlow` projects an in-process `Flow` (the statement executor's control-flow signal).
- `mapSubagentFnChildOutcome` projects a child-process `SubagentFnChildOutcome` (the envelope-driven trampoline result from `statement-executor.ts`).

Both functions must encode the same four-rule contract documented in the comment above `mapSubagentFnChildOutcome`. They are not token clones and do not appear in the clone map.

## Evidence

Location 1 — `mapSubagentFnFlow` (in-process path), src/runtime/subagent-fn-call.ts:202-230:

```typescript
function mapSubagentFnFlow(flow: Flow, fn: FnDecl): EvalResult {
  switch (flow.kind) {
    case "return":
    case "normal":
      // Success — the callee's final value (FN-5) crosses the boundary.
      return { flow: "value", value: flow.value };
    case "break":
    case "continue":
      // Barred inside a `fn` body; defensively a `null` final value.
      return { flow: "value", value: null };
    case "propagate":
    case "fail": {
      // A callee-returned / `?`-propagated Err crosses wrapped as
      // InvokeCalleeError{inner:<raw Err>}, exactly like an invoked subagent
      // callee (invocation.md §Failures).
      const raw = flow.kind === "propagate" ? flow.err : flow.error;
      return {
        flow: "value",
        value: makeErr(subagentCalleeError(raw, fn.name) as unknown as ThetaValue),
      };
    }
    case "cancel":
      return { flow: "cancel" };
  }
}
```

Location 2 — `mapSubagentFnChildOutcome` (child path) with its contract comment, src/runtime/subagent-fn-call.ts:233-292:

```typescript
/**
 * RFC 0012 §10 — project the child's envelope outcome onto the value the
 * in-process drive returned for the same body, so a `subagent fn` call's
 * observable is unchanged by where the body ran (FN-6; GOV-15):
 *
 *   - a bare tail `x` → `x`; an `Ok(x)` tail (`fn_tail: "ok"`) → `Ok(x)`; an
 *     `Err(e)` tail (`fn_tail: "err"`) → the bare `Err(e)` — exactly the three
 *     values `executeBlock`'s `normal` / `return` flow yielded;
 *   - a `?`-propagated / effect-failure `Err` the body itself surfaced
 *     (`callee-returned`, no tail marker) → `Err(InvokeCalleeError{inner})`, the
 *     `propagate` / `fail` arm's wrap;
 *   - a boundary-minted `Err` (the child's internal-error / validation /
 *     return-validation arms, a spawn or envelope failure) → bare, as the
 *     in-process panic arm was (`invoke_infra`, never wrapped);
 *   - a cancellation the CALLER's own signal explains → the `cancel` flow (the
 *     in-process `cancel` arm); a child-internal cancel wraps like any other
 *     callee-returned failure (bug 0295's two-arm rule).
 */
function mapSubagentFnChildOutcome(
  outcome: SubagentFnChildOutcome,
  fnName: string,
  signal: AbortSignal,
): EvalResult {
  if (outcome.kind === "cancelled") {
    return { flow: "cancel" };
  }
  const { result } = outcome;
  if (result.ok) {
    return { flow: "value", value: outcome.fnTail === "ok" ? result : result.value };
  }
  if (outcome.fnTail === "err") {
    return { flow: "value", value: result };
  }
  const innerKind = (result.error as { readonly kind?: unknown } | null)?.kind;
  if (innerKind === "cancelled" && signal.aborted) {
    return { flow: "cancel" };
  }
  if (outcome.source === "boundary-minted") {
    return { flow: "value", value: result };
  }
  return {
    flow: "value",
    value: makeErr(subagentCalleeError(result.error, fnName) as unknown as ThetaValue),
  };
}
```

Diff verdict: the two functions are structurally parallel over the same semantic outcome contract but not token-identical. `mapSubagentFnFlow` switches over `Flow` kinds; `mapSubagentFnChildOutcome` switches over `SubagentFnChildOutcome` / `Result` / `fnTail` / `source`. No clone-map group id applies.

## Why this is a problem
This is load-bearing parallel truth, not incidental similarity. The observable result of a `subagent fn` call must not depend on whether the body ran in-process or in a spawned child. The shared semantic discriminant set has four rules, named in the contract comment:

1. **Success tail** — bare value, `Ok(x)`, or `Err(e)` crosses as the corresponding value.
2. **Callee-returned / `?`-propagated `Err`** — wraps as `InvokeCalleeError` (the `propagate` / `fail` arm).
3. **Boundary-minted `Err`** — stays bare (`invoke_infra` / validation / return-validation / spawn / envelope failure).
4. **Cancellation** — caller-driven cancellation becomes the `cancel` flow; child-internal cancellation wraps like any other callee-returned failure.

`mapSubagentFnFlow` covers rules 1, 2, and 4 for the in-process `Flow` discriminant (`return`/`normal` → success; `propagate`/`fail` → wrap; `cancel` → cancel). `mapSubagentFnChildOutcome` covers all four rules for the child discriminant. A change to either function that alters one of these rules — for example, deciding that a child-internal cancel should propagate as `cancel` instead of wrapping, or that a boundary-minted `Err` should wrap — must be mirrored in the other or the same `subagent fn` call will behave differently depending on which execution regime was selected.

The risk is not hypothetical: bug 0295's "two-arm rule" for cancellation and bug 0347's `err_provenance` sidecar both changed the boundary contract and required coordinated reasoning across the in-process and child legs. The two functions remain independently maintained today.

## Suggested direction (non-binding, optional)
The natural shared home is a single boundary-projection helper that consumes a normalized subagent-fn terminal outcome (success / callee-returned Err / boundary-minted Err / caller-cancel / child-internal-cancel) and returns the canonical `EvalResult`. The in-process and child paths would each map their local outcome shape to this normalized discriminant before calling the shared projector. This is a hypothesis; the fix stage owns the design.

## False-positive check
- Clone map re-verified: `src/runtime/subagent-fn-call.ts` has no clone groups, so this parallel was not detected by token clone scanning.
- Both copies live: `mapSubagentFnFlow` is called from `runSubagentFnInProcess`; `mapSubagentFnChildOutcome` is called from `runSubagentFnViaChild`.
- Deliberate-mirror check: the comment above `mapSubagentFnChildOutcome` explicitly states its purpose is to match the in-process drive's observable; the mirror is intentional. The rationale is not demonstrably false; the finding is filed as parallel truth, not as a copy to eliminate.
- Not tests/: both locations are under `src/runtime` production code.
- Not dead code: both functions are on active subagent-fn execution paths.
- Not spec-normative vector table: the similarity is imperative boundary mapping, not a repeated spec enumeration.
- Not generated: all code is hand-authored TypeScript.

## Triage
verdict: questionable — accounting verified: both excerpts match at src/runtime/subagent-fn-call.ts:202-230 and 246-292, each mapper has exactly one live caller (lines 198 and 143), `clone-scan map` reports no groups for the file as stated, and the coverage recount holds (Flow mapper: return/normal→rule 1, propagate/fail→rule 2, cancel→rule 4, rule 3 realised by the enclosing catch in runSubagentFnInProcess; child mapper: all four rules incl. bug 0295's two-arm cancel split), with the FN-6 / GOV-15 same-observable contract real in functions.md and the child mapper's own comment; not a duplicate of PTQ-1189 (resolved D9 two-regime breakdown) or PTQ-1254 (D8 Flow/EvalResult isomorphism) — per the D4 parallel rule the shared normalized-outcome projector is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified against current HEAD: both mappers stand at src/runtime/subagent-fn-call.ts:202-224 and 246-272 with exactly one live caller each (198, 143; no other hits across src/extensions/tools/tests), `clone-scan map` reports `(no clone groups)` for the file, and the four-rule coverage recount holds (in-process mapper: return/value→rule 1, propagate/fail→rule 2, cancel→rule 4 caller-only, rule 3 realised by the enclosing catch at 178-196; child mapper: all four incl. the `innerKind==='cancelled' && signal.aborted` two-arm split) with FN-6 real at docs/spec_topics/functions.md:58; one tolerated content drift — the cited excerpt shows `flow: Flow` / `flow.kind` / `case "normal"` but commit 2865e9ac (PTQ-1254 fix, 2026-09-23, after filing) unified the unions so the mapper now reads `flow: EvalResult` / `flow.flow` / `case "value"`, semantics unchanged; not a duplicate of PTQ-1254 (resolved D8, the union isomorphism) or PTQ-1189 (resolved D9 two-regime breakdown, which created this module) — per the D4 parallel rule a shared normalized-outcome projector is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified at current HEAD: `mapSubagentFnFlow` at src/runtime/subagent-fn-call.ts:202-224 and `mapSubagentFnChildOutcome` at 246-272 match the excerpts modulo the already-noted PTQ-1254 union drift (`flow: EvalResult` / `flow.flow` / `case "value"`, semantics unchanged), each has exactly one live caller (198, 143; grep across src/extensions/tools/tests yields no others), `clone-scan map --files` on the file reports `(no clone groups)`, and the four-rule coverage recount holds (in-process: return/value→rule 1, propagate/fail→rule 2, cancel→rule 4, rule 3 realised by the enclosing catch at 178-196; child: all four incl. the `innerKind === "cancelled" && signal.aborted` two-arm split) with FN-6 real at docs/spec_topics/functions.md:58 and the same-observable contract stated in the child mapper's own comment; not a duplicate — PTQ-1254 (resolved D8) explicitly excludes these semantic mappers as "NOT counted as shuttling", PTQ-1189 (resolved D9) is the breakdown that created this module, PTQ-1409 is dead re-exports; per the D4 parallel rule a shared normalized-outcome projector is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
