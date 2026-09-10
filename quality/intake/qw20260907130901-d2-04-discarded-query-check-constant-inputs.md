---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: checkDiscardedQueryResult's two discriminating inputs are compile-time constants at its only integration call site, which pre-decides the one shape the function checks
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/query-discard.ts:98-116
  - src/runtime/query-discard.ts:62-86
  - src/parser/theta-document.ts:9309-9327
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# checkDiscardedQueryResult's two discriminating inputs are compile-time constants at its only integration call site, which pre-decides the one shape the function checks

## Observation
`checkDiscardedQueryResult` (QRY-19) branches on `stmt.isQuery` and a four-arm
`QueryStatementDisposition`. Its only non-test caller — the parser's `walkStmt`
`"query"` arm — passes both discriminators as literals (`isQuery: true`,
`disposition: "bare-expr-statement"`), and the caller's own comment states the
parser can produce no other disposition at that position: the `?`/`let _ =`/
`let x =` forms parse to `try`/`let` nodes and a trailing query is promoted to
the tail. The function's guard therefore re-tests, at runtime, facts the call
site fixes at compile time, and three of the four `QueryStatementDisposition`
arms plus the `isQuery: false` case have no producer in the parse pipeline.

## Evidence
src/runtime/query-discard.ts:98-108 (the guard over both inputs):
```ts
export function checkDiscardedQueryResult(
  stmt: QueryStatement,
): Diagnostic | undefined {
  // QRY-19: only a must-use `@`...`` query result in bare expression-statement
  // position drops the `Result` without acknowledgement. The `?`-propagate,
  // `let _ =`-discard, and `let x = ...?`-bind forms acknowledge it at the call
  // site and are accepted.
  if (!stmt.isQuery || stmt.disposition !== "bare-expr-statement") {
    return undefined;
  }
```

src/parser/theta-document.ts:9309-9327 (the sole src call site; both
discriminators literal, with the caller documenting why no other value can
arise):
```ts
    case "query":
      // QRY-19 (query-escapes-stringification.md#qry-19): a bare `@`...`` in
      // expression-statement position drops the must-use `Result` without
      // acknowledgement. A `QueryStmt` is produced only for a NON-tail bare
      // query — `parseForms` promotes a trailing line-start query to the
      // body/void tail (the accepted void-tail discard, QRY-20 territory), and
      // the `?`-propagate / `let _ =`-discard / `let x = …` binding forms parse
      // to `try` / `let` nodes — so its disposition is always
      // `bare-expr-statement`, the sole QRY-19 trigger.
      pushDiag(
        out,
        checkDiscardedQueryResult({
          isQuery: true,
          disposition: "bare-expr-statement",
          file,
          range: s.range,
        }),
      );
```

src/runtime/query-discard.ts:62-86 declares the four-arm
`QueryStatementDisposition` (`"bare-expr-statement" | "propagate" |
"discard-let-underscore" | "bind"`) and the `isQuery` flag the sole caller
never varies. Call-site search for `checkDiscardedQueryResult` across src/,
extensions/, tools/: exactly one hit (theta-document.ts:9320); tests call it
directly in tests/query-discard.test.ts:119-138.

## Why this is a problem
Vestigial parameters: at every production call site (there is exactly one)
both discriminating inputs receive the same literal values, so the function's
disposition model — a four-arm union plus a boolean — selects nothing at
integration. The AST already encodes the disposition structurally (distinct
`try`/`let`/tail node kinds), which is why the caller can only ever supply the
one triggering shape; the generality survives from the V13g-T seam declaration
(module header, query-discard.ts:22-31) rather than from any current selector.

## Suggested direction (non-binding, optional)
Let the parse-side integration carry only what varies (the site), with the
QRY-19 diagnostic minted for the one statement shape the parser routes here;
the accepted-forms facts are already encoded by the AST node kinds the caller
enumerates.

## False-positive check
- Call-site search: `checkDiscardedQueryResult` across src/, extensions/,
  tools/ — one production caller (theta-document.ts:9320), constants cited
  verbatim; tests/query-discard.test.ts:119-138 drives all four dispositions
  and `isQuery: false` directly.
- Test-only-caller rule: respected — this finding makes no deadness claim
  against the non-trigger arms (they are test-reachable witness surface for
  QRY-19's accepted forms); the claim is confined to the vestigial inputs at
  the sole integration site.
- Dynamic access: no string-keyed or re-exported alias of the function found
  (`export *` absent in src).
- Producer check for other arms: searched `"propagate"`, `"discard-let-underscore"`,
  `"bind"` as `disposition:` values across src/ — zero constructions outside
  the type declaration; the caller comment (theta-document.ts:9312-9317)
  confirms the parser cannot emit them at this position.

## Triage
verdict: questionable — reproduced (sole src caller theta-document.ts:9320 passes `isQuery: true` / `"bare-expr-statement"` literals; no other `QueryStatement` producer in src/extensions/tools; type predates the integration commit), but the only unused surface is the spec's accepted-form arms that tests/query-discard.test.ts:119-138 deliberately witnesses, so removing it is a design call with cross-module cost — a human should rule (triage: claude-opus-5)
verdict: questionable — every fact reproduces independently (sole src caller is now theta-document.ts:9626, the cited :9320 having drifted ~300 lines with the excerpt verbatim, and it passes `isQuery: true` / `"bare-expr-statement"` literals; `QueryStatement`/`QueryStatementDisposition` are referenced only in query-discard.ts and tests/query-discard.test.ts; no `disposition:` producer for `propagate`/`discard-let-underscore`/`bind` anywhere in src/extensions/tools; no `export *`, alias or string-keyed access; git d88e07ec→cbd64750→684485e8 shows the four-arm seam predates the parser wiring, which passed both constants from day one and documented why), so the anchor is mechanical and matches the confirmed PTQ-0020/PTQ-0044 constant-at-sole-call-site pattern — but unlike those, the only surface the fix would strip (the guard's accept arm and the three non-trigger union members) is deliberately driven by tests/query-discard.test.ts:132-138, which the witness-tests-are-callers rule protects, while whole-program-parser.test.ts:597-636 already pins every accepted form end-to-end and asserts none yields a `QueryStmt`; whether QRY-19's accepted forms stay explicit in the seam's type model or collapse into the AST shape the integration already relies on is a design call, so a human should rule (triage: claude-opus-5)
verdict: questionable — independently reproduced (sole src caller now theta-document.ts:9596, excerpt verbatim across the ~276-line drift; the 684485e8 wiring commit's own message already states the disposition "is always `bare-expr-statement`" at that call site; no `disposition:` producer for the other three arms anywhere in src/extensions/tools) so the constant-inputs anchor is mechanical, not taste, matching the confirmed PTQ-0020/PTQ-0044 shape — but here, unlike those, every non-trigger arm is a deliberate, passing assertion in tests/query-discard.test.ts:131-137 and the AST-level invariant that makes them unreachable in production is itself pinned end-to-end by whole-program-parser.test.ts's negative-pin cases, so the four-arm predicate reads as a maintained spec surface rather than stale leftover generality, and collapsing it to the one integrated shape is a benefit-vs-cost design tradeoff for a human to weigh (triage: claude-opus-5)
verdict: questionable — re-verified from a clean read: sole src caller confirmed at theta-document.ts:9596 (import :109) passing literal `isQuery: true`/`"bare-expr-statement"`; grep across src/extensions/tools finds zero `disposition:` constructions for `propagate`/`discard-let-underscore`/`bind` outside the type union itself, and `QueryStatement`/`QueryStatementDisposition` are otherwise referenced only by tests/query-discard.test.ts; git log confirms d88e07ec/cbd64750 (V13g-T/V13g) predate 684485e8, whose message states the disposition "is always `bare-expr-statement`" at this site — so the mechanical anchor holds; but this differs from the confirmed PTQ-0020 (parameter read nowhere at all) and PTQ-0044 (alternate branch and output field unread by any caller, test included) precedents because every non-trigger arm here is a deliberate, passing assertion at tests/query-discard.test.ts:131-137, and whole-program-parser.test.ts's negative-pin cases (~596-637) independently pin the very AST invariant the finding leans on — a maintained, tested spec surface, not proven-dead generality, so pruning it is a design tradeoff for a human, not a mechanical fix (triage: claude-opus-5)
verdict: questionable — sixth independent reproduction, same result: sole caller is theta-document.ts:9596 with literal `isQuery: true`/`"bare-expr-statement"`; `QueryStatement`/`QueryStatementDisposition` (query-discard.ts:61-82) are read only by the guard (:99) and referenced elsewhere only in tests/query-discard.test.ts; no `disposition:` producer for the other three arms in src/extensions/tools; commit 684485e8's own message documents the constant as designed-in ("disposition is always `bare-expr-statement`"), postdating seam commits d88e07ec/cbd64750 — a real, mechanical vestige-at-sole-call-site anchor, matching confirmed PTQ-0020/PTQ-0044; but PTQ-0164 (same file, resolved) confirms this is a distinct root cause, and unlike those two precedents the non-trigger arms are deliberately driven by tests/query-discard.test.ts:118-138 AND redundantly pinned end-to-end by whole-program-parser.test.ts:565-636's negative pins, so stripping the seam's generality trades away exercised, spec-anchored test surface for a benefit a human should weigh, not a mechanical cleanup (triage: claude-opus-5)
