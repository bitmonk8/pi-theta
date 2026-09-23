---
id: PTQ-1454
title: mut-recovery artefact guard is duplicated in for and par-for parsing
lens: D4
status: open
verdict: confirmed
locations:
  - src/parser/body-parser.ts:1023-1033
  - src/parser/body-parser.ts:3741-3753
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# mut-recovery artefact guard is duplicated in for and par-for parsing

## Observation
`BodyParser.parseFor` and `BodyParser.parseParFor` both contain an identical guard that suppresses a `reserved-keyword-as-identifier` diagnostic when the captured loop-variable token is the artefact left behind by consuming a `mut` modifier in front of the real `in` keyword (bug 0153). The guard computes `mutRecoveryArtefact`, conditionally files the reserved-keyword diagnostic, consumes the `in` keyword, and then parses the iterand. The `parseParFor` copy explicitly references `parseFor`'s comment as the source of truth for the same shape.

## Evidence

**Copy 1 — `parseFor`**
`src/parser/body-parser.ts:1023-1033`
```typescript
    const mutRecoveryArtefact =
      mutConsumed && variableTok.text === "in" && !this.isKeyword("in");
    if (variableTok.kind === "keyword" && !mutRecoveryArtefact) {
      this.diagnostics.push(
        reservedKeywordAsIdentifierDiagnostic(variableTok.text, variableTok.range, this.file),
      );
    }
    if (this.isKeyword("in")) {
      this.advance();
    }
    const iterand = this.parseHeaderExpression() ?? nullExpr(kw.range);
```

**Copy 2 — `parseParFor`**
`src/parser/body-parser.ts:3741-3753`
```typescript
    const mutRecoveryArtefact =
      mutConsumed && variableTok.text === "in" && !this.isKeyword("in");
    if (variableTok.kind === "keyword" && !mutRecoveryArtefact) {
      this.diagnostics.push(
        reservedKeywordAsIdentifierDiagnostic(variableTok.text, variableTok.range, this.file),
      );
    }
    if (this.isKeyword("in")) {
      this.advance();
    }
    // Snapshot the outer mutable bindings before the body's own `let`s are
    // recorded, so a body reassignment to an outer `let mut` is detectable.
    const outerMutables = new Set<string>();
```

**Diff verdict:** identical for the cited 11-line span. `parseParFor` continues with additional code after the common block (`outerMutables` snapshot), while `parseFor` continues straight to `parseHeaderExpression`. The clone-map group is **G016** (75 tokens, renamed-only (1), 2 occurrences). The `parseParFor` comment at `3741-3753` itself cross-references `parseFor` as the canonical description of the recovery-artefact rule.

## Why this is a problem
The two loop productions must apply exactly the same recovery-artefact rule: if one copy is tightened or loosened, the other will silently diverge and produce inconsistent diagnostics for `for mut in …` versus `par for mut in …`. The comment in `parseParFor` acknowledges the duplication ("same rule, same recovery-artefact guard (bug 0153 §Fix, see `parseFor`'s comment on the same shape)"), which is evidence that the author expected the two sites to stay in step. That expectation is currently enforced only by human vigilance, not by shared code.

## Suggested direction (non-binding, optional)
A private helper on `BodyParser` that consumes a loop variable after an optional `mut`, computes the recovery-artefact guard, files any reserved-keyword diagnostic, and consumes the `in` keyword would remove the duplication. The helper would return the variable name and the post-`in` state for the caller to parse its own iterand syntax (`parseHeaderExpression` vs brace-suppressed `parseExpression` with optional `max`).

## False-positive check
- Re-verified both ranges in the current working tree; both copies are live and reached during normal parse flows.
- The two surrounding methods are different productions (`Stmt "for"` vs `Expr "par for"`) with legitimately different iterand parsing and max-clause handling, but the variable-recovery guard itself is identical and load-bearing.
- `grep -n "mutRecoveryArtefact" src/parser/body-parser.ts` returns only the two cited definitions.
- `git log -L :parseFor:src/parser/body-parser.ts` and `git log -L :parseParFor:src/parser/body-parser.ts` show no recent edits to these blocks; the most recent quality commit (`19516518`) touched unrelated parts of the file.
- The deliberate `parseWithClause` / `parseCallWithClause` fork is a separate, documented design decision and does not affect this finding.

## Triage
verdict: confirmed — both excerpts reproduce verbatim at body-parser.ts:1023-1033 / 3741-3753; clone-scan map reproduces G016 (75 tokens, renamed-only, exactly these ranges); `grep mutRecoveryArtefact` → only the two declarations; both copies live (`parseFor` dispatched at :638/:3371, `parseParFor` at :3097); bug 0153 pins `for` and `par for` to the same reserved-keyword rule so divergence is a stated breakage, and the parseParFor comment's "same rule, same recovery-artefact guard … see parseFor" is evidence of load-bearing coupling, not incidental similarity; not a spec vector table; not a duplicate (PTQ-1133 is the type-layer-checks iterand clone in a different file, PTQ-1280 is D9 breakdown, sibling d4-01/G047 covers the preceding checkMutModifier blocks at different ranges); prior REVIEW_LOG:657/:810 INCIDENTAL notes on this pair were reviewer dispositions, not human rulings (triage: claude-fable-5-1)
