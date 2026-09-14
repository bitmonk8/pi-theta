---
id: PTQ-0157
title: firstForbiddenInterpolationToken's doc scopes it to "the path where parseExpressionSource returns null", but its sole caller reaches it from parseInterpolationSource
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/theta-document.ts:10065-10071
  - src/parser/theta-document.ts:10023-10030
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# firstForbiddenInterpolationToken's doc scopes it to "the path where parseExpressionSource returns null", but its sole caller reaches it from parseInterpolationSource

## Observation
`firstForbiddenInterpolationToken` has one caller,
`checkQueryTemplateInterpolations`. That caller obtains its parse result from
`parseInterpolationSource`, and enters the token-scan arm when
`parseInterpolationSource` returns a `null` `expr`. The function's doc comment
names a different function — `parseExpressionSource` — as the one that returns
`null` on that path. `parseExpressionSource` is never called from
`checkQueryTemplateInterpolations`.

## Evidence
src/parser/theta-document.ts:10065-10071 — the doc comment:

```ts
/**
 * A forbidden interpolation construct detected at the TOKEN level, for the
 * malformed-interpolation path where `parseExpressionSource` returns `null` and
 * the AST walk is unavailable. `match` is a reserved keyword and `@` a punct, so
 * a token match is unambiguous (never a string-literal false positive). Returns
 * `"match"` / `"@-query template"` for the first such token, else `null`.
 */
function firstForbiddenInterpolationToken(source: string): string | null {
```

src/parser/theta-document.ts:10023-10030 — the sole caller and the actual
producer of the `null` it guards on:

```ts
    const { expr: parsed, diagnostics: collected } = parseInterpolationSource(part.exprSource);
    if (parsed === null) {
      // A malformed interpolation must still not silently smuggle a forbidden
      // `match` / nested `@`-query past the AST walk (which is unavailable when
      // the source does not parse). Both are reserved forms — `match` a
      // keyword, `@` a punct — so a token-level scan cannot false-positive on
      // string-literal contents; flag it rather than skipping.
      const tokenForbidden = firstForbiddenInterpolationToken(part.exprSource);
```

The two functions are not the same entry: `parseInterpolationSource` drives
`parseSingleExpressionWithResidue` and returns a record, while
`parseExpressionSource` drives `parseSingleExpression` and returns an `Expr |
null` (src/parser/theta-document.ts:1872-1913). `parseInterpolationSource`'s own
doc states the distinction:

```ts
 * `<interpolation>` path) and the same `BodyParser` construction; the only
 * difference is driving `parseSingleExpressionWithResidue()` so a residue after
 * the expression — not only the expression's own emitters — has a chance to
 * draw a diagnostic before it is discarded. `parseExpressionSource` itself is
 * untouched: its other four call sites do not want the residue drain.
```

## Why this is a problem
The doc's sole purpose is to state which path reaches this helper, and it names
a function that does not appear on that path. A reader tracing "when does the
token scan run" from this comment lands on `parseExpressionSource`'s five call
sites — none of which is the interpolation walk — instead of the one arm at
10024. The reference is a leftover of the pre-`parseInterpolationSource` shape:
`parseInterpolationSource`'s own doc records that it was introduced as a second,
residue-draining entry beside the untouched `parseExpressionSource`, and the
caller was rerouted to it without the helper's doc following.

## Suggested direction (non-binding, optional)
Name the function that actually produces the `null` on that arm.

## False-positive check
- Caller search: `grep -rn "firstForbiddenInterpolationToken" src extensions
  tools tests --include=*.ts` → the definition (10072), one call site (10030),
  and two comment mentions in tests/interpolation-parse-diagnostics.test.ts
  (:42, :742). No test calls it, and the finding does not claim it is dead.
- Verified the caller's parse entry: `grep -n "parseExpressionSource\|
  parseInterpolationSource" src/parser/theta-document.ts` shows
  `parseInterpolationSource(` at 10023 inside `checkQueryTemplateInterpolations`
  (10014-10063) and no `parseExpressionSource(` call anywhere in that function's
  span.
- String-keyed / dynamic access: `grep -rn
  "\"firstForbiddenInterpolationToken\"" src extensions tools tests
  --include=*.ts` → no hits.
- Re-exports: the function is module-private (no `export` at 10072) and
  `src/parser` has no barrel file, so no other route reaches it.
- Distinct from the already-filed
  `qw20260907130901-d2-04-interpolation-source-stale-call-site-count`, which is
  about the "four call sites" cardinal inside `parseInterpolationSource`'s doc;
  this is a different comment naming the wrong function.

## Triage
verdict: confirmed — doc at :10067 names `parseExpressionSource`, but the sole caller's `null` comes from `parseInterpolationSource` (:10023), which builds its own lexTheta/BodyParser and never delegates to it; git shows the caller used `parseExpressionSource` pre-09cb77a1 (bug-0122) and the doc text is byte-identical across that reroute, so it is a proven vestige distinct from the :1895 call-site-count finding (triage: claude-opus-5)
