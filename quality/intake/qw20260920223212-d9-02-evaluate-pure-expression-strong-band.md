---
id: pending
title: evaluatePureExpression is 206 LOC in the strong band, with an 11-line panic-site attachment block repeated inside two of its arms
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:8227-8432
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#evaluatePureExpression
d9_band: strong
wave: qw20260920223212
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# evaluatePureExpression is 206 LOC in the strong band, with an 11-line panic-site attachment block repeated inside two of its arms

## Observation
`evaluatePureExpression` (src/extension/production-theta-producer.ts:8227-8432, 206 LOC, band strong per the structural map) is the synchronous pure-expression evaluator's dispatch: a single switch over the `Expr` node-kind family. Most arms are short delegations, but three arms (`member`, `index`, `try`) each carry 30+ lines, and two of them embed the same ThetaPanic site-attachment try/catch verbatim.

## Evidence
Arm inventory (case-label lines from grep over the current file):

| arm | lines | LOC |
|---|---|---|
| number/string/bool/null | 8233-8239 | 7 |
| ident | 8240-8243 | 4 |
| array | 8244-8245 | 2 |
| object | 8246-8261 | 16 |
| member | 8262-8297 | 36 |
| index | 8298-8326 | 29 |
| call | 8327-8355 | 29 |
| result-ctor | 8356-8360 | 5 |
| method-call | 8361-8368 | 8 |
| try | 8369-8398 | 30 |
| binary | 8399-8400 | 2 |
| ternary | 8401-8413 | 13 |
| block | 8414-8427 | 14 |
| default | 8428-8431 | 4 |

The `member` and `index` arms repeat the same site-attachment catch block (member at 8285-8295, index at 8315-8325; a third copy sits in `evaluatePureFnCall` at 8488-8497):

```ts
        } catch (thrown) { // allow-broad-catch: ThetaPanic-only, re-raised (bug 0476 §Fix)
          if (isThetaPanic(thrown)) {
            const file = env.currentResidence();
            if (file !== undefined) {
              attachPanicSite(thrown, { file, range: expr.range });
            } else {
              attachPanicRange(thrown, expr.range);
            }
          }
          throw thrown;
        }
```
Locals shared across arms: only the parameters (`expr`, `env`, `chain`) — every arm is self-contained and recurses through the function itself.

## Why this is a problem
Strong band (206 LOC ≥ 200): presumption of breakdown; a strong concrete reason is required to keep whole. Reasons considered and defeated: (a) closed-enumeration dispatch (concrete) — the arms do mirror the parser's `Expr` node family (docs/reference/grammar.md expression productions), but the "arms are each short" prong fails for the longest arms (member 36 / try 30 / index 29 LOC), and in the strong band a concrete reason alone is insufficient; (b) spec-cited single critical section — none: each arm is independent, no ordered sequence spans arms; (c) measured cost — none cited anywhere in the body; (d) prior split reverted — `git log` shows no split/revert pair for this function; (e) human ruling — quality/exemptions.json holds no D9 entry for this host (only `D8:...#firstAdmittingArmProperties`). The repeated 11-line attachment block shows ~22 LOC that are not the enumeration's own length: extracting it drops the function to ~180 LOC without touching any arm's semantics.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the duplicated ThetaPanic site-attachment catch bodies (8285-8295, 8315-8325, plus the third copy at 8488-8497) -> `attachPurePanicSite(thrown, env, range)` helper (hypothesis) — ~22 LOC removed from this host, 0 exported symbols, 0 external importers, cross-refs back: `attachPanicSite`/`attachPanicRange` (already imported at line 308). Seam B: none identified yet for the remaining arms — if the family moves per the pending misplacement finding (qw20260920202922-d9-09), the breakdown accounting travels with it.

## False-positive check
Band: 206 LOC, strong — quoted from the structural map. Reasons-considered list recorded above with defeating evidence per reason (arm-length counts, exemptions grep, git-history check). Generated-code check: hand-authored (bug-numbered lockstep comments). Spec-mirror check: performed — the enumeration does mirror the Expr grammar family, recorded under reason (a) with the failing arms-short prong. Exemptions check: no D9 entry. Duplicate check: qw20260920202922-d9-09 files the family's *misplacement* (extension/ vs runtime/), and qw20260920202922-d9-01 files the *file-level* breakdown — neither files function-level breakdown accounting for this host; PTQ-1099 concerns a drifted self-citation comment, a different root cause. The repeated catch block is filed here as breakdown accounting (LOC not attributable to the enumeration), not as a separate D4 clone claim.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces `evaluatePureExpression — 8227-8432 — 206 LOC — band strong` (FN_BANDS strong ≥ 200; not exempt-band); the 14 case labels sit at the cited lines (member 8262 / index 8298 / call 8327 / try 8369; only `default` drifts 8428→8425) and the arms share no locals beyond the three parameters; the bug-0476 catch block is byte-identical at 8285-8295 and 8315-8325 with the third copy at 8488 (a fourth, differently-commented copy at 7958 is outside the host); no overlooked reason — closed-enumeration over the Expr family is a concrete reason only (design §1.2: strong band needs concrete + a strong reason), and no strong reason exists: arms are independent with no ordered cross-arm sequence (lockstep comments cite bug-0027 duplication with statement-executor, a D4 concern, not a critical-section invariant), no measured cost, `git log -S`/`--grep` shows no split/revert (function unchanged in shape since 3a8732da), quality/exemptions.json holds only `D8:...#firstAdmittingArmProperties`; the earlier shard-05 keep-whole (REVIEW_LOG:543) rested on the concrete reason alone and is a worker note, not a human ruling; not a duplicate — qw20260920202922-d9-01 is the file-level host (evaluator family as one row) and d9-09 is misplacement, PTQ-1099 is a D2 citation drift; the seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
