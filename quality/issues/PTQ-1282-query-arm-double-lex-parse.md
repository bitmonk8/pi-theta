---
id: PTQ-1282
title: The type-layer query arm lexes each query template twice and re-lexes/re-parses every interpolation source twice, back-to-back at one call site
lens: D8
status: open
verdict: confirmed
locations:
  - src/parser/type-layer-walk.ts:1918-1926
  - src/parser/type-layer-walk.ts:2139-2151
  - src/parser/type-layer-walk.ts:2190-2201
sites: 3
fix_scope: localized
d8_class: heavier-than-scale
d8_host: src/parser/type-layer-walk.ts#TypeLayerWalk.checkQueryInterpolationOperands
wave: qw20260922164435
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-22
---

# The type-layer query arm lexes each query template twice and re-lexes/re-parses every interpolation source twice, back-to-back at one call site

## Observation
`TypeLayerWalk.walkExpr`'s `"query"` arm calls two sibling methods on the same
node, back to back: `checkQueryInterpolationResults` (bug 0079) then
`checkQueryInterpolationOperands` (bug 0345). Each method independently calls
`lexQueryTemplate(e.template)` over the same verbatim template and then
`parseExpressionSource(part.exprSource)` on each interpolation part.
`parseExpressionSource` (theta-document.ts:1252-1256) is a full snippet lex
(`lexSnippetSource`) plus a fresh `BodyParser` instantiation and
`parseSingleExpression()` per call. So for every `@`-query expression the
type-layer walk visits, the template is lexed twice and every `${…}`
interpolation source is lexed and parsed twice, with both derivations discarded
between the two calls.

## Evidence
The one call site, `src/parser/type-layer-walk.ts:1918-1926`:
```ts
      case "query":
        this.checkQueryInterpolationResults(e, bindings);
        // Bug 0345 §Fix: appended AFTER the Result-classification call above, not
        // in place of it, so an interpolation that is both a `Result` and an
        // operand violation draws `theta/parse/interpolated-result` (pushed
        // above) BEFORE the operand code (pushed below) — the deliberate
        // ordering the bug doc records.
        this.checkQueryInterpolationOperands(e, bindings);
        return;
```

First derivation, `src/parser/type-layer-walk.ts:2143-2148`:
```ts
    for (const part of lexQueryTemplate(e.template).parts) {
      if (part.kind !== "interp") {
        continue;
      }
      const parsed = parseExpressionSource(part.exprSource);
```

Second derivation of the identical inputs, `src/parser/type-layer-walk.ts:2194-2199`:
```ts
    for (const part of lexQueryTemplate(e.template).parts) {
      if (part.kind !== "interp") {
        continue;
      }
      const parsed = parseExpressionSource(part.exprSource);
```

Per-call cost shape of the recomputed facility, `src/parser/theta-document.ts:1252-1256`:
```ts
export function parseExpressionSource(source: string): Expr | null {
  const lex = lexSnippetSource(source);
  const parser = new BodyParser(lex.tokens, "<interpolation>", source);
  return parser.parseSingleExpression();
}
```

Data size at the call site: the walk runs once per parsed theta document, once
per `query` expression node in the body; N = interpolations per template
(author prose, small). The doubled work is not a scan of the small string but a
full lexer pass plus a `BodyParser` construction and expression parse per
interpolation, twice, with the first result (`QueryTemplateLexResult.parts` and
each `Expr`) dropped on the floor before the second call recomputes it
byte-for-byte from the same `e.template`.

## Why this is a problem
Complexity disproportionate to the job: two derivations of the same
lex-then-parse pipeline over identical inputs at one call site, where the only
difference between the consumers is which check they run over the parsed
`Expr` (Result classification with a `try` skip vs. operand descent). The
documented ordering constraint (bug 0345: all `interpolated-result` pushes
before all operand pushes) constrains diagnostic *push order*, not derivation
count — the same order is reachable from one derivation. This is the same
per-call recompute shape previously filed and confirmed at other hosts
(PTQ-0319 collectCallSites repeated walk, PTQ-0331 per-specifier recompute,
PTQ-0348 closure hash recomputed per caller).

## Suggested direction (non-binding, optional)
Unproven hypothesis: derive once in the query arm — lex the template, parse
each interpolation source into a list of `Expr | null` — then run the
Result-classification pass and the operand pass over that list in the existing
order, preserving the bug-0345 push ordering and the two passes' distinct skip
rules (`parsed.kind === "try"` skipped for classification only). No behaviour
or diagnostic-order change is implied by the accounting itself.

## False-positive check
- Prior filings scanned: PTQ-1193 (theta-document walkExpr query arm, D9 size),
  qw20260922150013-d9-06 (TypeLayerWalk class size), PTQ-1138 (provable* switch
  parallel) — none names the double lex/parse of query interpolations; no D8
  exemption exists on this host (the D8 exemption list carries only
  discovery-walk#enumerateDirectory and
  production-theta-producer#firstAdmittingArmProperties).
- Spec check: no docs/spec_topics clause mandates re-derivation; bug 0345's
  recorded constraint is diagnostic ordering (quoted verbatim in Evidence),
  which a single derivation with two passes preserves.
- D2-precedent check: the two METHODS' separateness is bug-pinned (Result
  classification vs. operand checks, each with its own skip rule) and this
  filing does not claim they should merge — only that the shared lex/parse
  derivation is computed twice.
- Verified both methods are reached only from the one `"query"` arm
  (grep `checkQueryInterpolation(Results|Operands)\(` — 2 definition sites,
  2 call sites, both at type-layer-walk.ts:1919/1925).

## Triage
verdict: questionable — accounting verified: all four excerpts reproduce byte-exact (query arm 1918-1926, `lexQueryTemplate(e.template).parts` + `parseExpressionSource(part.exprSource)` loops at 2143-2148 and 2194-2199, parseExpressionSource = lexSnippetSource + fresh BodyParser + parseSingleExpression at theta-document.ts:1252-1256); grep `checkQueryInterpolation(Results|Operands)\(` across src/ gives exactly 2 definitions (2139/2190) and 2 call sites (1919/1925), both in the one `"query"` arm, so every visited query node is lexed twice and each interp source lexed+parsed twice with the first derivation discarded; both loops read only `e.template` and `part.exprSource`, and the only per-consumer differences are the `parsed.kind === "try"` skip and the descent run, so a single derivation with two ordered passes preserves the bug-0345 push order (which pins diagnostic order, not derivation count) and no docs/spec_topics clause mandates re-derivation; no D8 exemption on type-layer-walk.ts (exemptions.json carries only discovery-walk#enumerateDirectory and production-theta-producer#firstAdmittingArmProperties); dedupe clean — PTQ-1193 (resolved D9 breakdown) and qw20260922150013-d9-06 inventory the cluster's size, neither names the double lex/parse; same heavier-than-scale recompute shape as PTQ-0319/0331/0348, which rested at questionable until human ratification — hoisting the lex/parse into the arm is a human design call, never confirmed by triage (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: query arm at 1918-1926 calls checkQueryInterpolationResults (2139) then checkQueryInterpolationOperands (2190) on the same node, and both loops open with the identical `lexQueryTemplate(e.template).parts` → `parseExpressionSource(part.exprSource)` prelude (2143-2148 / 2194-2199), where parseExpressionSource is lexSnippetSource + fresh BodyParser + parseSingleExpression (theta-document.ts:1252-1256), so per query node the template is lexed twice and every interp source lexed+parsed twice with the first derivation discarded; grep across src/extensions/tools/tests confirms 2 definitions and exactly 2 call sites (1919/1925, one arm), the only consumer differences being the `parsed.kind === "try"` skip and the descent+relocation; bug 0345's settled design (tests/b0345-…:30-33) pins that the Result-classification pushes stay FIRST — an ordering constraint a single derivation feeding two ordered passes preserves — and no docs/spec_topics clause or test pins derivation count; data-size claim holds (N = interpolations per template, small, but the doubled unit is a full lex+parse, not a string scan); no D8 exemption on type-layer-walk.ts (exemptions.json rows: discovery-walk#enumerateDirectory, production-theta-producer#firstAdmittingArmProperties); dedupe clean — PTQ-0319/0331/0348 are the same recompute shape at other hosts, PTQ-1193 and qw20260922150013-d9-06 are size inventories that never name the double lex/parse; per D8 rules the hoisted single-derivation shape is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
