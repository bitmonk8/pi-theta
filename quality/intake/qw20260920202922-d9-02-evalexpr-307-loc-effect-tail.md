---
id: pending
title: evalExpr spans 307 LOC because a 79-LOC checkpointed-effect dispatch phase and a 36-LOC member arm sit inside the expression-kind if-chain
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/statement-executor.ts:1191-1497
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/runtime/statement-executor.ts#evalExpr
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# evalExpr spans 307 LOC because a 79-LOC checkpointed-effect dispatch phase and a 36-LOC member arm sit inside the expression-kind if-chain

## Observation
`evalExpr` (src/runtime/statement-executor.ts:1191-1497, 307 LOC — strong band)
is the executor's async expression evaluator: an if-chain over `expr.kind`
followed by a pure-vs-checkpointed-effect tail. The chain's arms range from 2
LOC (`binary`) to 36 LOC (`member`), and the tail after the last kind arm is
one 79-LOC phase that pre-evaluates tool args, runs the cancellable sequence,
and applies the Ok-wrap / cancel / Err-at-consumption disposition.

## Evidence
Step inventory (line anchors verified in the current file):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| control-flow delegations (try/match/par-for) | 1201-1215 | 15 | expr, env, deps, atTerminal |
| block-expression arm (Flow -> EvalResult lift) | 1223-1247 | 25 | expr, env, deps, atTerminal; flow |
| user/subagent fn call resolution | 1249-1263 | 15 | expr, env, deps; resolved |
| array/object composite decomposition | 1271-1316 | 46 | expr, env, deps; values/obj |
| index arm (panic-site attach) | 1317-1338 | 22 | expr, env, deps; target, index, key |
| member arm (enum-variant short-circuit + bug 0449 gate) | 1339-1373 | 35 | expr, env, deps; variant, target |
| ternary/binary/method-call/result-ctor arms | 1374-1418 | 45 | expr, env, deps, atTerminal |
| checkpointed-effect dispatch + outcome disposition | 1419-1497 | 79 | expr, env, deps, atTerminal; checkpoint, preArgs, statement, outcome, result |

Effect-tail head (statement-executor.ts:1419-1425):

```ts
  const checkpoint = deps.host.checkpointFor(expr);
  if (checkpoint === null) {
    // Pure, synchronous, non-checkpointed work — runs to completion regardless
    // of the abort signal (a straight-line statement boundary is not a
    // checkpoint).
    return { flow: "value", value: deps.host.evaluatePure(expr, env, deps.invokeChain) };
  }
```

## Why this is a problem
Strong band (307 LOC >= 200) carries a presumption of breakdown. Reasons
considered and defeated: closed-enumeration dispatch — the arms do mirror the
`Expr` kind set of parser/theta-document (spec: grammar.md expression forms),
but the rule requires each arm short, and the member arm is 35 LOC while the
effect tail is a 79-LOC phase that is not an enumeration arm at all; single
algorithm with shared local state — every phase reads only the four parameters
`(expr, env, deps, atTerminal)` plus phase-private locals, so an extracted
effect-tail helper threads 5 values (below the 6-local bar), no state object
needs inventing; grammar production family — evaluation, not recognition.
Strong reasons: the QRY-8/ERR-19 consumption-position disposition is one
ordered sequence, but it is wholly inside the effect tail — a seam at the tail
boundary interleaves nothing; no measured cost; no reverted split; no
exemptions entry for this host key.

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: checkpointed-effect dispatch (1419-1497) ->
`evalCheckpointedEffect(expr, env, deps, atTerminal, checkpoint)` in-file
helper (hypothesis) — 79 LOC, 0 exported symbols, 0 external importers, 1
back-reference (`preEvaluateToolArgs`). Seam B: member arm's enum-variant
short-circuit (1339-1360) -> `resolveEnumMemberRead` helper (hypothesis) — ~22
LOC, 0 exports, back-reference `env` only. None identified yet for the
remaining arms.

## False-positive check
Band check: 307 LOC per the map. Reasons-considered list above with the
defeating evidence per reason (arm lengths counted from verified anchors:
1339-1373 member, 1419-1497 tail). Exemptions check: no
`src/runtime/statement-executor.ts#evalExpr` key in quality/exemptions.json.
Generated-code check: hand-written, bug-annotated. Spec-mirror check: the arm
set mirrors grammar.md expression forms but fails the rule's every-arm-short
condition, so the enumeration does not license the length.

## Triage
verdict: questionable — accounting verified: size-scan confirms evalExpr 1191-1497 / 307 LOC / strong band, excerpt matches, inventory rows are distinct kind arms plus a 79-LOC effect tail with its own private locals (member arm 35 LOC), no overlooked concrete/strong reason (enumeration fails every-arm-short; <6 shared locals; no exemptions.json key for this host), no duplicate; target shape (seam A/B) needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified independently: size-scan map re-run gives evalExpr 1191-1497 / 307 LOC / band strong, no `statement-executor` key of any form in quality/exemptions.json; every kind-arm anchor reproduces mechanically (try 1201, match 1204, par-for 1213, block 1223, call 1249, array 1271, object 1282, index 1317, member 1339, ternary 1374, binary 1389, method-call 1392, result-ctor 1411, tail 1419-1497), excerpt byte-exact at 1419-1425; inventory rows are real distinct concerns — the tail declares five private locals (checkpoint/preArgs/statement/outcome/result, 1419-1451) none of which any arm reads, member arm declares only variant/target, so the rows share nothing but the four parameters (< 6 shared locals); enumeration reason fails every-arm-short (member 35 LOC, tail 79 LOC and not an arm — several Expr kinds fall through to it); header cites cancellation.md §Granularity / CNCL-5 / ERR-8..12 / QRY-8 as behaviour, none pins the tail to the arm chain; git log -S shows no evalCheckpointedEffect ever existed (no reverted split); corroboration: evalAsResult:1769-1805 already reproduces the tail's checkpoint→preArgs→runCancellableSequence→ok/cancelled/Err disposition as a standalone sequence, so the tail is demonstrably separable (that near-clone is a D4 matter, not filed here); same-wave d9-01 keys on the file host, not `#evalExpr` — not a duplicate; D9 breakdown caps at questionable, seam A/B vs keep-whole needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified from scratch: size-scan map on a one-line manifest returns evalExpr 1191-1497 / 307 LOC / function / band strong (file 2681 LOC strong), `grep statement-executor quality/exemptions.json` exits 1 (no host or function key); excerpt at 1419-1425 is byte-exact and every arm anchor in the inventory reproduces (try 1201, match 1204, par-for 1213, block 1223, call 1249, array 1271, object 1282, index 1317, member 1339-1373 = 35 LOC, ternary 1374, binary 1389, method-call 1392, result-ctor 1411, tail 1419-1497 = 79 LOC); the rows are distinct concerns — tail-private locals checkpoint/preArgs/statement/outcome/result are declared at 1419-1451 and read by no arm, member arm's variant/target are arm-private, so cross-row sharing is only the 4 parameters (< 6-local single-algorithm bar); closed-enumeration reason correctly defeated (tail is a fall-through for every kind not matched, not a spec-table arm, and 79 LOC fails every-arm-short); no other concrete/strong reason applies (evaluation not data/type/grammar/generated; header's CNCL-5/ERR-8..12/QRY-8 citations pin behaviour, not the function boundary; `git log -S evalCheckpointedEffect -- src` empty, no reverted split); dedupe: only d9-01 (file host, lists evalExpr inside a ~596-LOC 'expression evaluation' concern) and d9-03 (evalParFor) mention evalExpr, neither keys `#evalExpr` — not a duplicate; per D9 rules a breakdown never confirms, the seam A/B vs keep-whole shape is the human's ruling (triage: claude-fable-5-1)
