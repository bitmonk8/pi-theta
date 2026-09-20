---
id: pending
title: BodyParser.parseFn recognises the fn declaration in one 245-LOC body whose 140-LOC parameter-list loop returns four flags to a bounded epilogue
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:3629-3873
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/theta-document.ts#BodyParser.parseFn
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# BodyParser.parseFn recognises the fn declaration in one 245-LOC body whose 140-LOC parameter-list loop returns four flags to a bounded epilogue

## Observation
BodyParser.parseFn (src/parser/theta-document.ts:3629-3873, 245 LOC, strong band) recognises grammar.md §"fn declarations": header, parenthesised parameter list, optional return type, optional subagent with-clause, body block. The parameter-list recognition — loop plus its close-paren epilogue — is 167 LOC of the 245, tracking five loop-scoped flags whose only after-loop readers are the two epilogue verdicts.

## Evidence
Step inventory (phase | lines | LOC | locals read/written):

| phase | lines | LOC | locals |
|---|---|---|---|
| S1 keyword, name, missing-`(` refusal | 3629-3646 | 18 | writes kw, name, params |
| S2 parameter-list loop | 3647-3786 | 140 | writes/reads unclosed, closeParenAbsorbed, refusedTok, atParamStart, params; reads openTok |
| S3 epilogue verdicts (fn-param-not-identifier, fn-param-list-unclosed) | 3789-3819 | 31 | reads refusedTok, closeParenAbsorbed, unclosed, openTok |
| S4 return-type slot + returnTypeAbsorbed | 3820-3843 | 24 | writes returnType, returnTypeAbsorbed |
| S5 with-clause, body under immutable params, node build | 3844-3873 | 30 | reads params, returnType, withClause |

Seam cost: extracting S2+S3 as a private parseFnParamList(): { params, ... } threads four values out (params plus the diagnostics already flowing through this.diagnostics); S4/S5 read none of S2's flags. Excerpt (3785-3796, the loop/epilogue boundary):

```ts
      }
      if (this.isPunct(")")) {
        this.advance();
        // The list closed, so `fn-param-list-unclosed` is silent here and says
        // nothing false: the closer this arm consumed may be the one the
        // author wrote for a statement the loop swallowed as parameters,
```

## Why this is a problem
Strong band: presumption of breakdown, strong concrete reason required. Reasons considered and defeated: (1) one grammar production family — concrete (grammar.md §"fn declarations", and the method already calls out to parseType, parseWithClause, parseBlock, withImmutableBindings for every sub-production) but sufficient only in the justify band; (2) single algorithm with shared local state — the flags unclosed/closeParenAbsorbed/refusedTok/atParamStart are confined to S2+S3 (five locals, all dead by 3820), so a param-list seam threads fewer than six; (3) strong extras — no spec clause names this body as one critical section (the diagnostic-order coupling is between S2 and S3 only, which a single extracted helper keeps together), no measured cost, no reverted split, no exemption entry.

## Suggested direction (non-binding, optional)
Hypothesis, unproven: Seam A: S2+S3 -> private BodyParser.parseFnParamList(openTok) (hypothesis) — ~171 LOC, 0 exported symbols moved, 0 external importers, one call back from parseFn; keeps the bug 0148/0124/0279 withhold interplay in one place. None identified yet for S4/S5.

## False-positive check
Band check: 245 LOC >= 200, strong. Reasons considered recorded with the locals count that bounds the seam cost. Exemptions check: no D9 entry for this host in quality/exemptions.json. Generated-code check: hand-written (bug 0148/0124/0279/0370 rationale inline). Spec-mirror check: the body mirrors one grammar production, not a spec-named closed enumeration of short arms — the 140-LOC loop is a single arm. Range 3629-3873 re-read this session before filing.

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives BodyParser.parseFn 3629-3873, 245 LOC, band strong; excerpt found at 3789-3794 (≤4-line drift); the five S2/S3 locals (openTok, unclosed, closeParenAbsorbed, refusedTok, atParamStart) have zero reads outside 3647-3819 and S4/S5 own their own state (returnType/returnTypeAbsorbed, withClause/body), so the inventory is ≥2 real concerns; only 4 locals (params, kw, name, subagent) cross phase boundaries, so the ≥6-shared-locals reason does not apply; grammar.md §"`fn` declarations" (line 133) is a concrete-only reason insufficient in the strong band; no D9 entry for theta-document.ts in quality/exemptions.json; hand-written; sibling wave filings (d9-01 file-level, d9-02/04/05/07/08) are different hosts, not duplicates — target shape (parseFnParamList seam) is a design decision for a human ruling (triage: claude-fable-5-1)
