---
id: pending
title: statement-executor carries two isomorphic 7-arm control-flow unions (Flow, EvalResult) bridged by mechanical arm-to-arm mappers at every layer boundary
lens: D8
status: intake
verdict: pending
locations:
  - src/runtime/statement-executor.ts:403-410
  - src/runtime/statement-executor.ts:422-429
  - src/runtime/statement-executor.ts:438-453
  - src/runtime/statement-executor.ts:801-824
  - src/runtime/statement-executor.ts:1551-1566
  - src/runtime/statement-executor.ts:1685-1685
sites: 6
fix_scope: module
d8_class: overbuilt
d8_host: src/runtime/statement-executor.ts
wave: qw20260922150013
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-22
---

# statement-executor carries two isomorphic 7-arm control-flow unions (Flow, EvalResult) bridged by mechanical arm-to-arm mappers at every layer boundary

## Observation
The executor models control-flow outcomes twice: `Flow` (statement layer, tag key `kind`, arms `normal`/`return`/`break`/`continue`/`fail`/`propagate`/`cancel`) and `EvalResult` (expression layer, tag key `flow`, arms `value`/`return`/`break`/`continue`/`fail`/`propagate`/`cancel`). The two unions are arm-for-arm isomorphic — `normal(value)` corresponds to `value(value)`; every other arm is identical in name and payload. Two dedicated mapper bodies (`terminalFlow`, and the `"block"` arm's 7-case switch) plus a repeated ternary idiom exist solely to convert between them.

## Evidence
Counted concept inventory (all in src/runtime/statement-executor.ts):

| concept | lines | LOC |
|---|---|---|
| `Flow` union, 7 arms | 403-410 | 8 |
| `EvalResult` union, 7 arms | 422-429 | 8 |
| `terminalFlow` (EvalResult→Flow, 6-arm switch, verbatim payload carry) | 438-453 | 16 |
| `"block"` arm reverse mapper (Flow→EvalResult, 7-case switch, verbatim payload carry) | 801-824 | ~20 |
| `r.flow === "value" ? { kind: "normal", value: r.value } : terminalFlow(r)` shuttle ternary | 1551, 1556, 1561, 1566, 1685 | 5 sites |
| additional `terminalFlow(...)` forwarding sites | 1573, 1585, 1597, 1630, 1694, 1760, 1788 | 7 sites |

src/runtime/statement-executor.ts:403-410:
```ts
export type Flow =
  | { readonly kind: "normal"; readonly value: ThetaValue }
  | { readonly kind: "return"; readonly value: ThetaValue }
  | { readonly kind: "break" }
  | { readonly kind: "continue" }
  | { readonly kind: "fail"; readonly error: ThetaValue; readonly event?: RuntimeEvent }
  | { readonly kind: "propagate"; readonly err: ThetaValue }
  | { readonly kind: "cancel" };
```

src/runtime/statement-executor.ts:422-429:
```ts
export type EvalResult =
  | { readonly flow: "value"; readonly value: ThetaValue }
  | { readonly flow: "fail"; readonly error: ThetaValue; readonly event?: RuntimeEvent }
  | { readonly flow: "propagate"; readonly err: ThetaValue }
  | { readonly flow: "return"; readonly value: ThetaValue }
  | { readonly flow: "break" }
  | { readonly flow: "continue" }
  | { readonly flow: "cancel" };
```

src/runtime/statement-executor.ts:438-453 (`terminalFlow`) maps six arms verbatim (`fail`→`fail`, `propagate`→`propagate`, `return`→`return`, `break`→`break`, `continue`→`continue`, `cancel`→`cancel`). The `"block"` arm at 801-824 performs the exact inverse mapping (`normal`→`value` plus six identity arms):
```ts
    const flow = await executeBlock(expr.body, env.child(), deps, atTerminal);
    switch (flow.kind) {
      case "normal":
        return { flow: "value", value: flow.value };
      case "return":
        return { flow: "return", value: flow.value };
      ...
      case "cancel":
        return { flow: "cancel" };
    }
```

Job statement: carry one of seven per-outcome tags (with at most one value/error payload) between `evalExpr` (expression evaluation) and `executeStatement`/`executeBlock` (statement execution). Importers of the pair (structural map): `Flow` 2 src / 0 test importers, `EvalResult` 2 src / 0 test importers — both are `par-for-executor.ts` and `subagent-fn-call.ts`, whose boundary functions (`mapSubagentFnFlow`, subagent-fn-call.ts:202; par-for-executor.ts:111) also each bridge `Flow` onto `EvalResult`. No doc comment on either union states a reason the two shapes must be nominally distinct; the `EvalResult` doc (417-420) only describes the lift ("lifts `executeBlock`'s `Flow` onto these matching `EvalResult` variants ... until it reaches a site that converts back to `Flow` via `terminalFlow`") — i.e. it documents the shuttling, not a rationale for two types.

## Why this is a problem
Complexity disproportionate to the job: the payload being moved is a 7-way tag, yet the module maintains two parallel union declarations differing only in tag-key spelling (`kind` vs `flow`) and one arm name (`normal` vs `value`), plus two mechanical arm-for-arm mapper bodies and twelve conversion call sites (~50-60 LOC of pure shuttling). Any future flow variant must be added in at least four places (both unions, `terminalFlow`, the block-arm switch) and audited at the sibling importers' bridges; TypeScript's exhaustiveness checking will flag misses, but the maintenance surface is doubled for zero behavioural difference — both mappers carry every payload verbatim.

## Suggested direction (non-binding, optional)
Unproven hypothesis: a single exported union (one tag key; `normal`/`value` unified into one value-carrying arm) consumed by both the expression and statement layers would delete `terminalFlow`, the block-arm switch, and the five shuttle ternaries outright, with the two sibling importers' semantic boundary mappers (`mapSubagentFnFlow`, par-for) keeping their semantic arms but losing the tag-key translation. Whether the nominal separation prevents any real misuse (e.g. accidentally returning an expression result where a statement flow is expected) has not been proven either way.

## False-positive check
- Importer search: `grep -rn "\bFlow\b|EvalResult|terminalFlow" src/` — only statement-executor.ts, par-for-executor.ts, subagent-fn-call.ts consume the pair; no test importers (map: 2/0 and 2/0).
- Spec check: `Flow`/`EvalResult` are implementation types; error-model.md's terminal outcomes map onto arms of BOTH unions, and unifying the two drops no arm — no docs/spec_topics/ clause names a two-type requirement.
- D2 precedent check: neither union is a spec-mirrored enumeration being pruned — all arms survive under the hypothesis; no knob/guard rationale is stated in code for the duality.
- Overlap check: PTQ-1154 (D9, statement-executor six concerns) and PTQ-1163 (D9, evalExpr size) are breakdown claims on the host; this is a distinct over-built (concept-count) claim, cross-referenced here. No D8 exemption exists for this host.
- The semantic mappers (`evalUserFnCall`'s flow switch at 656-689, `mapSubagentFnFlow`) genuinely transform arms (propagate→Err value) and are NOT counted as shuttling.

## Triage
verdict: questionable — accounting verified: both 7-arm unions reproduce byte-exact at 403-410 / 422-429 differing only in tag key (`kind`/`flow`) and one arm name (`normal`/`value`); `terminalFlow` 438-453 is a 6-arm verbatim carry and the `"block"` arm 807-823 its exact 7-arm inverse; grep reproduces exactly 5 shuttle ternaries (1551/1556/1561/1566/1685) and 7 further `terminalFlow(...)` forwards (1573/1585/1597/1630/1694/1760/1788); importers are only par-for-executor.ts and subagent-fn-call.ts (0 test importers of either type); no `D8:src/runtime/statement-executor.ts` key in quality/exemptions.json; no docs/spec_topics clause names EvalResult/terminalFlow or requires two nominal types; PTQ-1154/1163/1173 are D9 breakdown rows that list the pair as members, not a duality claim, so no duplicate — one minor inaccuracy: par-for-executor.ts:111 `parForOutcomeOf` maps Flow→ParForIterationOutcome, not Flow→EvalResult, which does not alter the in-host inventory; whether the statement/expression nominal separation (the 795-800 comment's "a block is an EXPRESSION, not a statement") earns its ~50 LOC of shuttling is a design decision for a human ruling (triage: claude-fable-5-1)
