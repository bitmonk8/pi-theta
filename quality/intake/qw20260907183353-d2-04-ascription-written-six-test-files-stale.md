---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: QueryExpr.ascriptionWritten's doc says "six committed test files construct a kind:query literal directly"; the count is stale
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/theta-document.ts:263-267
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# QueryExpr.ascriptionWritten's doc says "six committed test files construct a kind:query literal directly"; the count is stale

## Observation
The doc comment on `QueryExpr.ascriptionWritten` justifies the field's
optionality with a hard-coded census of the test corpus: "six committed test
files construct a `kind: "query"` literal directly, and a required field would
red their typecheck". The count was accurate at the commit that wrote it and
is stale now: fifteen test files carry a `kind: "query"` property today, nine
of which construct a typed `QueryExpr`/`Expr` literal whose typecheck the
sentence's "would red" clause is about.

## Evidence
src/parser/theta-document.ts:263-267:

```ts
   * one statement. Optional rather than required: six committed test files
   * construct a `kind: "query"` literal directly, and a required field would
   * red their typecheck for no behavioural gain — so `undefined` is reachable
   * only from such a literal, which is why the refusal site tests `=== true`
   * rather than truthiness.
```

Current corpus: `grep -rln 'kind: "query"' tests --include=*.ts` → 15 files.
Of these, nine construct a literal against a declared `QueryExpr`/`Expr` type
(the typecheck-relevant set): tests/b0307-empty-template-parity.test.ts:73,
tests/b0307-value-position-query-err-binds.test.ts:81,
tests/b0351-value-position-query-success-binds-ok.test.ts:103,
tests/b0387-block-expr-tail-query-consumption.test.ts:106,
tests/b0399-boundary-event-attempts-tokens-masked.test.ts:478,
tests/composition-producer.test.ts:90,
tests/effectful-statement-host.test.ts:81,
tests/statement-executor.test.ts:663,
tests/typed-query-schema-integration.test.ts:432. Three more construct the
literal behind an `as unknown as ThetaBody` cast
(tests/b0328-root-closure-hash-marshalled.test.ts:273,
tests/b0343-proto-hash-carrier-row.test.ts:158,
tests/subagent-model-theta-tool.test.ts:362); two are prose comments
(b0345:173, interpolation-parse-diagnostics:298); one is an unrelated event
shape (tests/no-rollback.test.ts:150). No way of counting reproduces six.

At the introducing commit 4a26e795 ("fix(bug-0203): refuse junk @<T>
query-ascription text…"), `git grep -c 'kind: "query"' 4a26e795 -- tests`
yields exactly six files (composition-producer, effectful-statement-host,
no-rollback, statement-executor, subagent-model-theta-tool,
typed-query-schema-integration) — the census the sentence recorded.

## Why this is a problem
Historical narration drift: the sentence grounds a design decision (the field
stays optional) in an enumerated caller population, and the number no longer
matches any current count. A maintainer re-evaluating whether the field could
become required (the exact question this sentence answers) cannot trust the
stated size of the blast radius; the same sentence pattern in
`schemaFromLetAnnotation`'s doc two fields down states the reason without a
count and has not drifted.

## Suggested direction (non-binding, optional)
Drop the number ("committed test files construct a `kind: "query"` literal
directly…"), matching the count-free phrasing `schemaFromLetAnnotation`'s doc
already uses for the same rationale.

## False-positive check
- Counted the current population three ways (files matching the property
  text: 15; typed literal constructions: 9; typed + unknown-cast
  constructions: 12) — none equals six; each file:line is listed above.
- Alternate reading check: "six committed test files" cannot be a subset
  qualifier ("six of the files that…") — the sentence's purpose is to size the
  set whose typecheck a required field would red, and that set is the typed
  constructions (9 files today).
- Git verification: `git log -S "six committed test files" --
  src/parser/theta-document.ts` → 4a26e795 (plus the squash-root rename);
  the six-file census at that commit is reproduced above, confirming the count
  was correct when written and drifted as later tests were added.
- Not a duplicate: the wave's filed stale-count findings cover
  parseInterpolationSource's "four call sites" (same file, different sentence,
  different subject) and ledger errNote; neither cites these lines.

## Triage
