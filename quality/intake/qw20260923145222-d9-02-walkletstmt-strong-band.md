---
id: pending
title: TypeLayerWalk.walkLetStmt is 204 LOC in the strong band, sequencing seven binding-record phases extracted verbatim from the PTQ-1170 walkStmt let arm
lens: D9
status: intake
verdict: pending
locations:
  - src/parser/type-layer-walk.ts:270-473
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/parser/type-layer-walk.ts#TypeLayerWalk.walkLetStmt
d9_band: strong
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# TypeLayerWalk.walkLetStmt is 204 LOC in the strong band, sequencing seven binding-record phases extracted verbatim from the PTQ-1170 walkStmt let arm

## Observation
walkLetStmt (type-layer-walk.ts:270-473) is 204 LOC, at the strong-band function threshold (>= 200). PTQ-1170 (fixed, confirmed) filed walkStmt at 333 LOC "because its `let` arm alone spans 198 lines"; the fix moved that arm into this named method, where it now sits at 204 LOC — the arm's internal phases were not themselves separated. The entire body is one `if (stmt.init !== null)` block.

## Evidence
Step inventory (locals each phase reads/writes — the seam cost):

| phase | lines | LOC | reads | writes |
|---|---|---|---|---|
| non-type-expression annotation withhold (bug 0124) | 275-297 | 23 | stmt | (early return; recordWithheldBinders) |
| annotation resolution + array-sink derivation | 298-336 | 39 | stmt, rhsType | annotation, sunkArray, sunkArrays |
| RHS compat check + typed array-literal sink check | 337-357 | 21 | annotation, rhsType, sunkArray | diagnostics, sunkArrays |
| initialiser walk | 358-361 | 4 | sunkArrays | — |
| provability decision + recorded-type computation | 362-415 | 54 | annotation, rhsType, bindings | initUnprovable, inferred, recorded, bindings |
| resultBindings mint/carry (bugs 0079/0199) | 416-450 | 35 | recorded, rhsType, initUnprovable | resultBindings |
| unprovableBindings marking (bugs 0050/0199) | 451-471 | 21 | initUnprovable, recorded | unprovableBindings |

Excerpt of the phase-coupling core (type-layer-walk.ts:395-397, 410-415):
```ts
      const initUnprovable =
        annotation === undefined && provableArgType(this, stmt.init, bindings) === undefined;
      ...
      const recorded: CompatType =
        annotation === undefined
          ? initUnprovable
            ? { ...inferred }
            : inferred
          : unfoldAlias(annotation, this.env);
      bindings.set(stmt.name, recorded);
```

## Why this is a problem
Strong band: presumption of breakdown absent a strong concrete reason. Reasons considered: (1) single algorithm with shared local state — concrete: seven locals (rhsType, annotation, sunkArray, sunkArrays, initUnprovable, inferred, recorded) thread the phases; this is sufficient in the justify band but the strong band requires concrete plus a strong reason. (2) Spec-cited ordered-sequence invariant — the body's comments cite ordering constraints (proof decided before `bindings.set`, 370-380; mint/carry/mark agreeing on the identity of `recorded`, 416-471) but to bug docs (0050, 0079, 0083, 0124, 0199, 0341), not to a PIC/BNDR/EXST clause, and the identity constraint is preserved by passing `recorded` by reference through any seam — no observable step is interleaved. (3) Measured cost — none cited. (4) Prior split reverted — none found; the only prior action here is the PTQ-1170 extraction INTO this method. (5) Human ruling — exemptions.json has no entry for this host (grep hit 0).

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the recorded-type + provenance tail (phases 5-7, lines 362-471) -> private `recordLetBinding(stmt, rhsType, annotation)` helper (hypothesis) - ~110 LOC, 0 exported symbols, 0 external importers, cross-references: this.env, this.resultBindings, this.unprovableBindings, bindings. Seam B: annotation resolution + sink derivation + RHS compat (phases 2-3, lines 298-357) -> private `checkLetAnnotation` helper returning `{ annotation, sunkArrays }` (hypothesis) - ~60 LOC, cross-references: this.diagnostics, this.sinkedArrayOf, this.checkArrayLiteral.

## False-positive check
Band: 204 LOC per the authoritative map (strong, >= 200). Reasons-considered list above with what defeated each. Exemptions check: no type-layer-walk entry in quality/exemptions.json. Generated-code check: hand-written, comment-dense body. Spec-mirror check: not an enumeration — a single sequential arm, so the closed-dispatch reason does not apply. Duplicate check: PTQ-1170 is fixed and named a different host (type-layer-checks.ts#TypeLayerWalk.walkStmt, pre-split); the extracted method has not been dispositioned since. Ranges re-read immediately before filing.

## Triage
verdict: questionable — accounting verified: `size-scan map` reproduces TypeLayerWalk.walkLetStmt 270-473 / 204 LOC / band strong (FN strong=200); no `type-layer-walk`/`walkLetStmt` key in quality/exemptions.json (grep rc=1); all seven step-inventory anchors present in order (`rhsType` :276, withhold `return` :297, `letAnnotationToCompatType` :313, `sinkedArrayOf` :326, `sunkArrays` :331, compat `if` :333, `walkExpr` :357, `initUnprovable` :389, `inferred`/`recorded` :402-403, `bindings.set` :409, mint/carry adds :437/:450, `unprovableBindings.add` :469) with ≤ 4-line row drift and the excerpt verbatim at 389-390/402-409 (cited 395-397/410-415); body is one `if (stmt.init !== null)` block :275-471 as stated; the ≥ 6-shared-locals concrete reason is disclosed by the filing (seven block-scoped locals, `rhsType` spans phases 1-6, `annotation` 2-7, `initUnprovable`/`recorded` 5-7) and contested on the strong-band concrete-plus-strong bar consistent with the REVIEW_LOG:21/:558 keep-whole precedents; no strong addendum overlooked — `git log -S walkLetStmt` shows only creation in bd8e73b7 (PTQ-1158/1170 cluster fix), no split or revert, no measured cost; one non-refuting inaccuracy: TYPE-3/7/8/10/11 clauses ARE cited in-body (not bug docs alone) but pin what is recorded/widened, not a cross-phase ordering — the proof-before-`bindings.set` ordering cites runtime evaluation order and bugs 0050/0199; undisclosed as a number: 145 of 204 lines are comments (59 code), same shape PTQ-1170 triage recorded (143/55), scanner LOC authoritative; dedupe clean — PTQ-1170 (host walkStmt, fixed) and PTQ-1281 (host = file, fixed) name different hosts, same-wave d9-01 is file-level and explicitly defers this method to d9-02, residual-after-fix filings are the established pattern (PTQ-1278/1287/1290/1438); whether a comment-dense 204-LOC binding-record method warrants the A/B private-helper seams is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting verified: I re-ran `size-scan map` and it reproduces TypeLayerWalk.walkLetStmt 270-473 / 204 LOC / band strong (FN strong=200); quality/exemptions.json has no type-layer-walk or walkLetStmt key (grep rc=1); the body is one `if (stmt.init !== null)` block (275-471); the seven phases are present in order with a few lines of drift (withhold return :297, letAnnotationToCompatType :313, sinkedArrayOf :326, checkLetRhsCompat :333-349, walkExpr :357, initUnprovable :389, recorded/bindings.set :402-409, resultBindings mint/carry :437/:450, unprovableBindings.add :469); the excerpt is verbatim at 389-390/402-409; the ≥ 6-shared-locals concrete reason is disclosed and contested on the strong-band bar; I found no overlooked strong reason — the proof-before-bindings.set ordering cites runtime evaluation order (statement-executor) and bugs 0050/0199, not a spec clause (the TYPE-3/7/8/10/11 cites pin recorded shapes, not ordering), `git log -S walkLetStmt` shows only creation in bd8e73b7 with no split or revert, and no measured cost is cited; not disclosed: 145 of the 204 lines are comments; not a duplicate — PTQ-1170 is resolved against the pre-split walkStmt host, and REVIEW_LOG:625/638 deferred to it, not to this residual; a human needs to decide the private-helper seam shape, so this is not confirmed (triage: claude-opus-5-5)
verdict: questionable — accounting verified: I re-ran `size-scan map --files` and got TypeLayerWalk.walkLetStmt 270-473 / 204 LOC / band strong (FN_BANDS strong=200); quality/exemptions.json has 0 type-layer-walk/walkLetStmt hits; the body is one `if (stmt.init !== null)` block (275-471); the seven phases are present in order with small line drift (withhold return :297, letAnnotationToCompatType :313, sinkedArrayOf :326, checkLetRhsCompat :333, walkExpr :357, initUnprovable :389, recorded/bindings.set :402-409, resultBindings adds :437/:450, unprovableBindings.add :469); the excerpt is verbatim at 389-390/402-409; the ≥ 6-shared-locals concrete reason is disclosed and is not a strong reason; I found no overlooked strong reason — the ordering comments cite runtime evaluation order and bugs 0050/0199, not a spec clause, `git log -S walkLetStmt` shows only its creation in bd8e73b7 with no split or revert, and no measured cost is cited; not disclosed: 145 of the 204 lines are comments; not a duplicate — PTQ-1170/PTQ-1281 name different hosts; the seam shape is a design decision for a human ruling (triage: claude-opus-5-5)
