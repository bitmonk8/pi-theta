---
id: PTQ-1678
title: BodyParser parses a sub-expression inside a bracketed group through four brace-suppression mechanisms, and only one carries the trailing-assignment check its doc comment claims for all of them
lens: D1
status: open
verdict: confirmed
locations:
  - src/parser/body-parser.ts:2222-2238
  - src/parser/body-parser.ts:1215
  - src/parser/body-parser.ts:2179
  - src/parser/body-parser.ts:2315
  - src/parser/body-parser.ts:3024-3050
  - src/parser/expr-list.ts:24-44
  - src/parser/body-parser.ts:2351-2354
  - src/parser/body-parser.ts:2379
  - src/parser/body-parser.ts:2388
  - src/parser/body-parser.ts:2406-2409
  - src/parser/body-parser.ts:2446-2450
  - src/parser/body-parser.ts:2461
  - src/parser/body-parser.ts:1193-1202
  - src/parser/body-parser.ts:2568-2596
sites: 4
fix_scope: module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# BodyParser parses a sub-expression inside a bracketed group through four brace-suppression mechanisms, and only one carries the trailing-assignment check its doc comment claims for all of them

## Observation
`BodyParser` has to solve one recurring problem: parse a sub-expression inside a bracketed group with the object-literal brace-suppression flag (`suppressBrace`) cleared, then restore it. It solves it four ways: (1) `parseBracketedExpression` (try/finally, and it also runs `consumeTrailingAssignment`), used for a parenthesised group, an index operand and a call-site `with` value; (2) `parseDelimitedExprs` in expr-list.ts (manual save/restore through the `exprListCursor` get/set pair, no trailing-assignment check), used for call arguments and array elements; (3) a manual save/clear/restore around the whole field loop in `parseObjectLiteral`, with each field value read by plain `parseExpression`; (4) a manual save/clear/restore around the arm loop in `parseMatch`, with each arm body read by `parseExpressionAtBlockSite`. The doc comment on mechanism (1) lists "`(...)`, `[...]`, call args, object-field value, match arm" as its positions, and the doc on `parseCallWithClause` says its values parse through `parseBracketedExpression` "as a call argument is" — but call arguments, array elements, object-field values and match-arm bodies never pass through it.

## Evidence
Way 1 — `parseBracketedExpression`, src/parser/body-parser.ts:2222-2238 (re-read before filing):
```ts
  /**
   * Parse an expression inside a bracketed group (`(...)`, `[...]`, call args,
   * object-field value, match arm) with object-literal brace-suppression
   * cleared, so a nested object literal parses even inside a control-flow
   * header expression.
   */
  private parseBracketedExpression(): Expr | null {
    const save = this.suppressBrace;
    this.suppressBrace = false;
    try {
      const inner = this.parseExpression();
      this.consumeTrailingAssignment();
      return inner;
    } finally {
      this.suppressBrace = save;
    }
  }
```
Its callers and every other `suppressBrace` write — `grep -n "parseBracketedExpression\|parseHeaderExpression\|consumeTrailingAssignment\|suppressBrace = \|parseDelimitedExprs(" src/parser/body-parser.ts` → 27 hits, first 10 plus the rest that matter (total 27):
```
213:  private suppressBrace = false;
795:  private parseHeaderExpression(): Expr | null {
797:    this.suppressBrace = true;
800:      this.consumeTrailingAssignment();
803:      this.suppressBrace = save;
809:    const condition = this.parseHeaderExpression() ?? nullExpr(kw.range);
838:    const condition = this.parseHeaderExpression() ?? nullExpr(kw.range);
879:    const iterand = this.parseHeaderExpression() ?? nullExpr(kw.range);
1199:   * (`parseBracketedExpression`, as a call argument is) rather than a
1215:        const value = this.parseBracketedExpression() ?? nullExpr(keyTok.range);
2179:        const indexExpr: Expr = this.parseBracketedExpression() ?? nullExpr(expr.range);
2228:  private parseBracketedExpression(): Expr | null {
2230:    this.suppressBrace = false;
2233:      this.consumeTrailingAssignment();
2236:      this.suppressBrace = save;
2315:        const inner = this.parseBracketedExpression();
2354:    this.suppressBrace = false;
2388:    this.suppressBrace = save;
2404:    const scrutinee = this.parseHeaderExpression() ?? nullExpr(kw.range);
2409:      this.suppressBrace = false;
2461:      this.suppressBrace = save;
2574:  private consumeTrailingAssignment(): void {
2905:    this.suppressBrace = true;
2917:      this.suppressBrace = save;
3031:      this.suppressBrace = value;
3040:    return parseDelimitedExprs(this.exprListCursor, ")");
3045:    const elements = parseDelimitedExprs(this.exprListCursor, "]");
```
So Way 1 is called at exactly three sites: :1215 (call-site `with` value), :2179 (index operand), :2315 (parenthesised group). None of "call args", "`[...]`" as an array literal, "object-field value" or "match arm" is among them.

Way 2 — `parseDelimitedExprs`, src/parser/expr-list.ts:24-44, reached via the cursor at body-parser.ts:3024-3050:
```ts
export function parseDelimitedExprs(cursor: ExprListCursor, close: string): Expr[] {
  const items: Expr[] = [];
  const save = cursor.getSuppressBrace();
  cursor.setSuppressBrace(false);
  while (!cursor.isPunct(close) && !cursor.atEnd()) {
    const item = cursor.parseExpression();
    if (item === null) {
      cursor.advance();
      continue;
    }
    items.push(item);
    if (cursor.isPunct(",")) {
      cursor.advance();
    }
  }
  cursor.setSuppressBrace(save);
```
```ts
  private readonly exprListCursor = {
    advance: () => this.advance(),
    isPunct: (text: string) => this.isPunct(text),
    atEnd: () => this.atEnd(),
    parseExpression: () => this.parseExpression(),
    getSuppressBrace: () => this.suppressBrace,
    setSuppressBrace: (value: boolean) => {
      this.suppressBrace = value;
    },
  };

  private parseArgs(): Expr[] {
    if (!this.isPunct("(")) {
      return [];
    }
    this.advance(); // `(`
    return parseDelimitedExprs(this.exprListCursor, ")");
  }

  private parseArray(): Expr {
    const open = this.advance(); // `[`
    const elements = parseDelimitedExprs(this.exprListCursor, "]");
```

Way 3 — `parseObjectLiteral`, src/parser/body-parser.ts:2351-2354, :2379, :2388:
```ts
  private parseObjectLiteral(typeName: string | null, startRange: SourceRange): Expr {
    this.advance(); // `{`
    const save = this.suppressBrace;
    this.suppressBrace = false;
```
```ts
      const value = this.parseExpression() ?? nullExpr(nameTok.range);
```
```ts
    this.suppressBrace = save;
```

Way 4 — `parseMatch`, src/parser/body-parser.ts:2406-2409, :2446-2450, :2461:
```ts
    if (this.isPunct("{")) {
      this.advance();
      const save = this.suppressBrace;
      this.suppressBrace = false;
```
```ts
        const body = this.withImmutableBindings([...boundNames], () => {
          const consumedStmt = this.tryConsumeArmBodyStatement();
          return consumedStmt
            ? nullExpr(kw.range)
            : (this.parseExpressionAtBlockSite() ?? nullExpr(kw.range));
```
```ts
      this.suppressBrace = save;
```

The second misdescription, src/parser/body-parser.ts:1193-1202 (`parseCallWithClause` doc):
```ts
   * Deliberately forked from `parseWithClause` rather than reusing it,
   * because the two clauses differ in all three grammar-pinned dimensions: the
   * key set is the closed per-call options set (`cwd` in theta 1.3), an unknown
   * key is the parse ERROR `theta/parse/with-clause-unknown-key` rather than
   * the declaration-site's forward-compatible frontmatter warning, and each
   * value is a FULL expression parsed with brace-suppression cleared
   * (`parseBracketedExpression`, as a call argument is) rather than a
   * frontmatter-shaped literal.
```
A call argument is NOT parsed by `parseBracketedExpression` (see :3040 above).

What rides on Way 1 alone — src/parser/body-parser.ts:2568-2596:
```ts
   * Assignment is statement-only; used in expression position it is
   * `theta/parse/assignment-as-expression` (bindings.md §"Reassignment is a
   * statement"). If a simple `=` (not `==`) or compound-assign operator trails
   * the just-parsed value expression, emit the diagnostic and consume the RHS
   * so the surrounding parse recovers.
   */
  private consumeTrailingAssignment(): void {
    const simple = this.isPunct("=") && !this.isPunct("=", 1);
    const opTok = this.peek();
    const compound =
      opTok.kind === "punct" &&
      COMPOUND_OPS.has(opTok.text) &&
      this.isPunct("=", 1);
    if (!simple && !compound) {
      return;
    }
    this.diagnostics.push({
      severity: "error",
      code: "theta/parse/assignment-as-expression",
```
It is called from exactly two places (:800 `parseHeaderExpression`, :2233 `parseBracketedExpression`; the grep above shows no other call).

Mechanical consequence, measured. A scratch vitest file under `$TEMP` (mktemp) drove the production `parseThetaDocument` through `tests/helpers/e2e-s1.ts#codesOf` on five `let mut a = 1` programs differing only in which bracketed position holds `a = <n>`; the printed output lines were, verbatim:
```
paren ["theta/parse/assignment-as-expression"]
callArg ["theta/parse/fn-arity-too-many"]
array []
objField ["theta/parse/bare-object-literal"]
index ["theta/parse/assignment-as-expression"]
```
(`paren`: `let b = (a = 2)`; `callArg`: `fn f(x: integer, y: integer): integer { x }` then `let b = f(a = 2, 3)`; `array`: `let b = [a = 2]`; `objField`: `let b = { k: a = 2 }`; `index`: `let xs = [1]` then `let b = xs[a = 0]`.) The two positions that route through Way 1 draw the registered code; the positions routed through Ways 2 and 3 do not — in the call-argument case the dropped `=` turns `2` into a third argument and the parse reports arity instead. No claim is made here about which reading bindings.md:25 requires for those positions; the claim is that the reach of one check is decided by which of four interchangeable-looking mechanisms a position happens to use, and that both doc comments describe that reach wrongly.

Drift that already happened. `git log --format='%h %ad %s' --date=short -S'this.consumeTrailingAssignment();' -- src/parser/` → 2 hits:
```
702a1f2e 2026-09-21 quality: qw20260921130057 fix d9/src__parser__theta-document.ts
9f75b253 2026-07-04 V20d — implement and wire the eight unimplemented lexer/parser diagnostics
```
`git log --format='%h %ad %s' --date=short -S'object-field value, match arm' -- src/parser/` → 2 hits: `702a1f2e …` and `04dbb013 2026-07-03 core-exec-eval — …`. At 04dbb013 `parseBracketedExpression` was the bare suppression-clear with this same five-position doc, while `parseArgs`/`parseArray` already ran their own save/clear/restore loops (the loops PTQ-1294's fix, 19516518, later folded into `parseDelimitedExprs` — its diff removes `const saveArgs = this.suppressBrace;` / `const saveArr = this.suppressBrace;` from both). The next day, V20d (9f75b253) added `consumeTrailingAssignment()` to `parseBracketedExpression` and `parseHeaderExpression` only; its own message says "parseBracketedExpression and parseHeaderExpression, via consumeTrailingAssignment, reject a trailing simple/compound assignment in value position". From that commit on, the doc's list of five positions has described a check that reaches two of them.

Self-inconsistency statement: no written rule exists for how `suppressBrace` scoping must be expressed; the anchor is self-inconsistency (four mechanisms in one class for one problem) plus the cost cited above (a check attached to one mechanism silently has position-dependent reach, and two doc comments — :2223-2224 and :1199 — state a reach the call graph contradicts).

## Why this is a problem
Four mechanisms exist for one problem inside one class, and they are not behaviourally interchangeable: one of them carries an additional rule (`consumeTrailingAssignment`). A maintainer reading `parseBracketedExpression`'s doc — which enumerates call args, array literals, object-field values and match arms — or `parseCallWithClause`'s "as a call argument is", will conclude that the trailing-assignment check covers those positions; the call graph (three callers, none of them those positions) and the probe output show it does not. The divergence is not documented anywhere as deliberate; the only text on the subject asserts the opposite.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the four suppression-clearing paths could share one primitive (e.g. every bracketed sub-expression entering through `parseBracketedExpression`, with `parseDelimitedExprs` and the object/match loops taking it via the cursor), after which whether `consumeTrailingAssignment` belongs on every bracketed position or only on the parenthesised/index/header ones becomes a single explicit decision written where the primitive is — the fix stage owns that decision and the spec reading it rests on.

## False-positive check
- Injected clone map: no group covers 2222-2238, 2351-2394, 2403-2470, 3024-3050 or expr-list.ts. G051 (body-parser.ts:2308-2316 vs literal-sublanguage.ts:424-432) is the parenthesised-primary arm's token clone with a different parser and is D4's; it does not cover the mechanism divergence filed here. G001 (1156-1167 vs 1205-1219) covers the two `with`-clause loops, not the suppression paths.
- D9-affinity: not a wrong-home claim — all four mechanisms belong to the body parser (expr-list.ts was split out by PTQ-1294's fix and is the body parser's own helper); the claim is about the number of mechanisms and the check riding on one of them.
- D2-deadness: all four ways are live production paths (parenthesised groups, index operands, call-site `with` values, call args, array literals, object literals, match arms all parse through them); `consumeTrailingAssignment` is live at two callers and its code is witnessed by `grep -rln "assignment-as-expression" tests` → 5 files: tests/conformance/production-conformance.test.ts, tests/increment-decrement-wiring.test.ts, tests/interpolation-parse-diagnostics.test.ts, tests/lexer-parser-diagnostics-production.test.ts, tests/match-pattern-increment-decrement.test.ts.
- Prior filings: PTQ-1294 (resolved, D4 clone) unified `parseArgs`/`parseArray` into `parseDelimitedExprs` and did not touch `parseBracketedExpression`, `parseObjectLiteral` or `parseMatch`; PTQ-1280/PTQ-1523 (D9 breakdown) inventory these members as concerns without addressing the mechanism split. `grep -rln "assignment-as-expression" quality/` → 0 hits; `grep -rln "parseBracketedExpression\|consumeTrailingAssignment\|suppressBrace" quality/` → 6 hits (PTQ-0022, PTQ-0165, PTQ-1280, PTQ-1294, PTQ-1523, TRIAGE_LOG.md), none of which files the reach divergence.
- Export-style exemption: not applicable (divergent-solutions).
- Not a bug filing: no verdict is offered on which bracketed positions bindings.md:25 requires the check at; the finding is the mechanism split plus the contradicting doc comments.
- Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. The 27-hit grep reproduces line for line. All four ways check out at their lines: parseBracketedExpression at :2228 (try/finally + consumeTrailingAssignment, callers :1215/:2179/:2315 only), parseDelimitedExprs at expr-list.ts:24-44 via :3040/:3045, and the manual save/restore at :2353-2388 and :2408-2461. consumeTrailingAssignment is called only at :800 and :2233. Both doc comments (:2223-2224, :1199) claim a reach the call graph contradicts. Clone-scan on body-parser.ts gives G001/G008/G034/G036/G044/G051, none covering these paths. The git -S logs reproduce (702a1f2e/9f75b253; 702a1f2e/04dbb013), and 19516518 does remove saveArgs/saveArr. My own $TEMP probe through codesOf reproduces all five output lines verbatim. Two corrections for the human: the quoted V20d text is from that commit's CHANGELOG diff, not its commit message; and V20d's notes.md (since deleted) did state the entry points were chosen as "parseBracketedExpression (parens / index)" and header, so the narrow reach was once a written decision, though the in-code docs contradict it. No duplicate found in quality/issues or intake (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: truth the two doc comments; the four suppression mechanisms and the trailing-assignment reach stay as decided (V20d's notes chose the entry points "parseBracketedExpression (parens / index)" + header — a written decision the in-code docs contradict). In src/parser/body-parser.ts: (1) parseBracketedExpression's doc (:2222-2227) lists its REAL three call sites — parenthesised group (:2315), index operand (:2179), call-site `with` value (:1215) — and states that call args / array elements (parseDelimitedExprs), object-field values (parseObjectLiteral) and match-arm bodies (parseMatch) clear suppression with their own save/restore and deliberately do NOT run consumeTrailingAssignment (assignment-as-expression is drawn at header/paren/index positions only). (2) parseCallWithClause's doc (:1199) replaces "as a call argument is" with "as a parenthesised group is". No code changes; behaviour identical.
